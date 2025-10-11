# AI Phishing Shield – Application Architecture

Updated: October 10, 2025

This document provides a holistic view of the mobile client: how screens connect, what data we retain on-device, how signals leave the device, and which modules own each piece of functionality. It complements the original product specification with the concrete implementation status in the repository.

## High-Level Overview

- **Platform:** Expo-managed React Native app (SDK 54) with TypeScript and NativeWind for styling.
- **Navigation:** `expo-router` with file-based layouts under `app/` (root tabs) and nested settings routes.
- **State & Storage:** Lightweight module-level stores backed by `AsyncStorage`; React hooks expose each domain (feedback, language, themes, trusted sources, telemetry preferences).
- **Networking:** A single shared _network outbox_ (`lib/services/networkOutbox.ts`) batches outbound payloads for optional sync with `EXPO_PUBLIC_FEEDBACK_ENDPOINT`.
- **Offline-first posture:** All core experiences (detection history, alert feedback, telemetry logging) work without connectivity. Remote sync is opportunistic.
- **Localization:** `i18next` powered translations with coverage for English, French, Swahili, Hausa, Igbo, Yoruba, Nigerian Pidgin, Arabic, and Amharic.

## Screen & Flow Inventory

### Onboarding (`app/onboarding.tsx`)

- Explains protections, requests notification/SMS permissions, and saves the onboarding gate in `AsyncStorage` via `useOnboardingGate`.
- Telemetry events: `onboarding.*` series, routed through the telemetry adapter and outbox.

### Dashboard Tabs (`app/(tabs)/index.tsx`, `app/(tabs)/alerts.tsx`)

- **Alerts list:** Hydrates detection history from `lib/detection/detectionHistory.ts` (mock data at present). Selecting an alert opens a bottom sheet with feedback actions wired to `submitDetectionFeedback`.
- **Report quick action:** Launches the `ReportMessageModal`, letting users compose manual reports queued via `submitMessageReport`.
- **Settings tab:** Links into nested settings screens for language, notifications, diagnostics, model management, and telemetry preferences.

### Settings (`app/settings/*`)

- **Language:** Uses `useLanguagePreference` to switch `i18next` locale and persist selection.
- **Notifications:** Toggles stored in `lib/notificationPreferences.ts`; writes trigger telemetry `settings.notifications_updated`.
- **Diagnostics:** Presents debug info (outbox snapshot, AsyncStorage size, pending telemetry count) for beta testing.
- **Telemetry:** Allows opting into auto-upload and manual reporting; flags stored in `lib/telemetryPreferences.ts`.

## Data Persistence Map

| Domain                            | Storage Key                                  | Module                               |
| --------------------------------- | -------------------------------------------- | ------------------------------------ |
| Detection history                 | `@ai-phishing-shield/detections/history`     | `lib/detection/detectionHistory.ts`  |
| Alert feedback                    | `@ai-phishing-shield/detections/feedback`    | `lib/detection/feedback.ts`          |
| Network outbox                    | `@ai-phishing-shield/network/outbox`         | `lib/services/networkOutbox.ts`      |
| Legacy feedback outbox (migrated) | `@ai-phishing-shield/alerts/feedback/outbox` | auto-imported by network outbox      |
| Telemetry buffer                  | `@ai-phishing-shield/telemetry/events`       | `lib/services/telemetryAdapter.ts`   |
| Telemetry prefs                   | `@ai-phishing-shield/settings/telemetry`     | `lib/telemetryPreferences.ts`        |
| Notification prefs                | `@ai-phishing-shield/settings/notifications` | `lib/notificationPreferences.ts`     |
| Trusted sources                   | `@ai-phishing-shield/trusted-sources`        | `lib/trustedSources.ts`              |
| Onboarding gate                   | `@ai-phishing-shield/onboarding/gate`        | `lib/hooks/useOnboardingGate.ts`     |
| Language preference               | `@ai-phishing-shield/settings/language`      | `lib/hooks/useLanguagePreference.ts` |

_All stores expose async getters/setters with in-memory caches to reduce cross-component churn._

## Network Outbox Contract

The outbox normalises every outbound payload (feedback, telemetry, manual reports) into a single envelope:

```ts
{
  id: string;
  channel: 'feedback' | 'telemetry' | 'report';
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}
```

- Enqueue helpers: `enqueueOutboxEntry`, `submitDetectionFeedback`, `trackTelemetryEvent` (via adapter), `submitMessageReport`.
- Flush behaviour: Immediately attempts to POST `channel` + `payload` to `EXPO_PUBLIC_FEEDBACK_ENDPOINT`; failures are retried up to five times with exponential-ish spacing controlled at call sites.
- Diagnostics: `getOutboxSnapshot` powers the settings diagnostics screen and exported helpers for tests.
- Migration: On first hydrate, any legacy entries from `alertFeedbackQueue` are transformed into standard envelopes, so upgrades are seamless.

## Telemetry Pipeline

1. `trackTelemetryEvent` collects UX events everywhere in the app.
2. The active adapter (`lib/services/telemetryAdapter.ts`) stores events locally and mirrors them into the network outbox (`channel: 'telemetry'`).
3. A periodic flush runs after enqueue; telemetry respects the same endpoint and retry rules as feedback.

Telemetry is purely additive—no user-identifying data is sent, and it can be disabled via settings.

## Manual Reports

- `ReportMessageModal` lets users describe suspicious messages, capture the source channel, and add an optional comment.
- `submitMessageReport` writes the payload to the outbox (`channel: 'report'`) and reuses the same flush cycle, ensuring future server ingestion needs no new infrastructure.
- Telemetry event `reports.submitted` records submission metadata for in-app analytics.

## Background Detection & Notifications

- `lib/services/backgroundDetection.ts` registers a mock background task using Expo’s `TaskManager`. It runs a simulated sweep and posts local notifications through `lib/notifications.ts` when a mock “detected” threat is returned.
- Real model inference can swap into `runMockDetectionSweep` later without touching the rest of the pipeline.

## Permissions & Security Footprint

- Permissions handled via custom `checkNotificationPermission` and `checkSmsPermission` helpers that wrap Expo APIs.
- No message content leaves the device unless the user manually reports it; even then, payloads go through the shared queue and only sync if an endpoint is configured.

## Localization Workflow

- Translation files live in `locales/*.json`.
- Scripts: `pnpm lint:locales` ensures keys stay aligned with English source; `scripts/sync-locales.js` can propagate new keys when needed.
- Components use `useTranslation()`; hooks respect device locale fallback unless the user explicitly selects a language.

## Diagnostics & Developer Tooling

- `lib/services/diagnostics.ts` aggregates environment checks (permissions, storage sizes, queued items) for the settings diagnostics screen.
- `docs/alert-feedback.md` and this file provide operational context for contributors.
- Linting: `pnpm lint` runs ESLint plus Prettier checks; no additional build step is required for the doc updates herein.

## Known Gaps & Next Steps

- **Model integration:** Detection still relies on mock data; wiring the real inference engine will touch `lib/detection/mockDetection.ts` and background tasks.
- **Server endpoint contract:** The outbox envelopes multiple channels but the server schema is not finalised—define expected `channel` payloads before enabling automated sync in production builds.
- **Documentation:** Merge this architecture guide with future Mermaid diagrams and restructure the `/docs` folder (see todo #8).
- **Error surfacing:** User-facing UI for failed sync attempts (reports, feedback) is pending; currently silently retries in the background.

Refer to the code modules noted above for deeper implementation detail. This guide should help new contributors grasp the moving parts quickly and understand where to extend or replace functionality.
