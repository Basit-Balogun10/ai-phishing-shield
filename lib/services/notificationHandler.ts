import { analyzeMessage, explainDetection, type MockMessage, type DetectionResult } from '../detection/mockDetection';
import { addSimulatedDetection } from '../detection/detectionHistory';
import { ensureAlertNotificationChannelAsync, scheduleDetectionNotificationAsync } from '../notifications';
import { trackTelemetryEvent } from './telemetry';
import * as notificationFilter from './notificationFilter';
import { analyzeNotificationNative } from './inference';

// Attempt to load severity thresholds from the packaged metadata; fall back to 0.5
let SEVERITY_THRESHOLD_LOW = 0.5;
try {
  const meta = require('../../phishing_detector_package/model-metadata.json');
  if (meta && meta.severity_thresholds && typeof meta.severity_thresholds.low === 'number') {
    SEVERITY_THRESHOLD_LOW = meta.severity_thresholds.low;
  }
} catch {
  // ignore
}

export const processIncomingNotification = async (payload: Record<string, any>) => {
  try {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Prefer package id first (if provided by native bridge) so we can map
    // to a logical channel or a friendly app name. Then prefer the notification
    // title as a sender display name and fallback to 'Unknown'.
    const pkg = (payload.package as string) || (payload.app as string) || '';

    const mapPackageToAppName = (p?: string) => {
      if (!p) return undefined;
      const lower = p.toLowerCase();
      if (lower.includes('whatsapp')) return 'WhatsApp';
      if (lower.includes('gmail') || lower.includes('mail') || lower.includes('outlook')) return 'Mail';
      if (lower.includes('facebook') || lower.includes('messenger')) return 'Facebook';
      if (lower.includes('mtn') || lower.includes('airtel') || lower.includes('vodafone') || lower.includes('glo') || lower.includes('mtndirect')) return 'Network Provider';
      return undefined;
    };

    const sender = (payload.title as string) || mapPackageToAppName(pkg) || (payload.app as string) || 'Unknown';
    const body =
      (payload.bigText as string) || (payload.text as string) || (payload.summaryText as string) || (payload.title as string) || '';
    const receivedAt = new Date().toISOString();

    // Respect user ignore list: if the package is ignored, skip processing.
    try {
      if (pkg && (await notificationFilter.isPackageIgnored(pkg))) {
        if (__DEV__) {
          console.info('[notificationHandler] Ignoring notification from', pkg);
        }
        return;
      }
    } catch {
      // ignore errors from filter
    }

    // Try to infer a logical channel from the Android package name so alerts
    // display correctly (sms / whatsapp / email). Default to 'sms' to keep
    // backward compatibility with earlier behaviour.
    const getChannelFromPackage = (p?: string) => {
      if (!p) return 'sms';
      const lower = p.toLowerCase();
      if (lower.includes('whatsapp')) return 'whatsapp';
      if (lower.includes('mms') || lower.includes('messaging') || lower.includes('sms')) return 'sms';
      if (lower.includes('gmail') || lower.includes('gm') || lower.includes('mail') || lower.includes('outlook') || lower.includes('yahoo')) return 'email';
      if (lower.includes('messenger') || lower.includes('facebook')) return 'sms';
      // fallback
      return 'sms';
    };

    const message: MockMessage = {
      id,
      sender,
      package: pkg,
      channel: getChannelFromPackage(pkg),
      body,
      receivedAt,
    };

    // Try native inference first, fall back to mock analyzer if native not available or fails
    let result: DetectionResult;
    try {
      const native = await analyzeNotificationNative(message.body);
      result = {
        message,
        score: Math.min(0.99, typeof native.score === 'number' ? native.score : 0),
        matches: (native.matches || []) as any,
        risk: native.risk as any,
      } as DetectionResult;
    } catch {
      result = analyzeMessage(message);
    }

    // Emit a telemetry event aligned with existing schema. Use the mock_detection_triggered
    // event so we can observe that a notification triggered analysis in background/dev.
    trackTelemetryEvent('dashboard.mock_detection_triggered', {
      source: 'background',
      triggered: result.score >= SEVERITY_THRESHOLD_LOW,
    });

    if (result.score >= SEVERITY_THRESHOLD_LOW) {
      const recordId = `${message.id}:${Date.now()}`;
      const record = {
        recordId,
        result,
        detectedAt: new Date().toISOString(),
        source: 'notification' as const,
      };

      try {
        addSimulatedDetection(record as any);
      } catch (e) {
        // ignore
      }

      try {
        await ensureAlertNotificationChannelAsync();
        const bodyText = explainDetection(result) || message.body.slice(0, 200);
        await scheduleDetectionNotificationAsync('⚠️ Phishing alert', bodyText);
      } catch (e) {
        // ignore
      }
    }
  } catch (err) {
    console.warn('[notificationHandler] failed to process incoming notification', err);
  }
};

export default { processIncomingNotification };
