# Alert Feedback Workflow

This document captures how the mobile app collects, stores, and ships user responses to phishing alerts.

## Goals

- Give people a quick, optional way to confirm that an alert was accurate or mark it as a false alarm.
- Persist feedback locally so it survives restarts and works offline.
- Forward feedback to the backend when the device is online so future model retraining can use it.

## User Experience

When a user taps an alert inside the **Alerts** tab, the detail sheet now includes two actions:

1. **Confirm threat** – marks the alert as a real phishing attempt.
2. **Mark as safe** – records it as a false positive.

Buttons are disabled until the existing feedback cache is hydrated. A short status summary thanks the user once a choice has been saved, and a spinner appears while new feedback is being queued.

## Client Storage

Feedback entries are stored in `AsyncStorage` under `@ai-phishing-shield/detections/feedback`. Each entry tracks the alert identifier, the user’s decision, message channel, score, origin (historical vs simulated), and the submission timestamp. The hook `useDetectionFeedback` exposes the cache to React components and keeps listeners in sync.

## Sync Pipeline

1. Submitting feedback persists the entry locally and enqueues it for sync through the shared **network outbox** (`@ai-phishing-shield/network/outbox`). Legacy feedback queue data is migrated into the new structure automatically on first load.
2. The outbox immediately attempts to POST each entry to the URL referenced by `EXPO_PUBLIC_FEEDBACK_ENDPOINT`, wrapping feedback payloads with channel metadata so multiple pipelines can share a single endpoint.
3. Failed submissions remain in the queue with an incremented retry counter (up to five attempts). Successful submissions are removed from the queue before the next persistence cycle.
4. Every submission triggers the telemetry event `alerts.feedback_submitted`, which is also enqueued for server sync through the same outbox to keep analytics and feedback transport in lockstep.

If no endpoint is configured, the queue keeps data locally and logs a debug message in development builds so offline behaviour remains safe by default.
