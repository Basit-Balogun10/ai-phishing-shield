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
    const sender = (payload.app as string) || (payload.title as string) || 'Unknown';
    const body =
      (payload.bigText as string) || (payload.text as string) || (payload.summaryText as string) || (payload.title as string) || '';
    const receivedAt = new Date().toISOString();

    const pkg = (payload.package as string) || (payload.app as string) || '';

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

    const message: MockMessage = {
      id,
      sender,
      package: pkg,
      channel: 'sms',
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
