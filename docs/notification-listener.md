# Notification listener — Android integration

This document explains how to integrate the Android `NotificationListenerService` used by the development notification listener wrapper (`mobile/notifications/notificationListener.ts`).

Do not modify native files in `android/` unless you are comfortable building an Android development client or running on a device. The steps below are a developer-friendly guide and a snippet you can copy into your Android manifest.

## Android manifest snippet

Add the following `<service>` entry under the `<application>` element in `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- NotificationListenerService required for capturing notifications on Android -->
<service
    android:name="com.yourapp.notificationlistener.NotificationListenerService"
    android:label="AI Phishing Shield Listener"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService" />
    </intent-filter>
</service>
```

Notes:
- Replace `com.yourapp.notificationlistener.NotificationListenerService` with the actual class name if you add a custom native service implementation.
- Most RN packages that implement a notification listener will provide the correct manifest merge configuration. If you add a native dependency such as `react-native-android-notification-listener`, check its README for any manifest merge instructions.

## Permissions and user flow

- The wrapper exposes `isPermissionGranted()` and `requestPermission()` to help your app check and request the required permission. On Android, users must enable notification access for the app in Settings.
- The app should prompt the user before asking them to open OS settings. We recommend explaining why notification access is required before calling `requestPermission()`.

## Testing on device

1. Build a development client (see EAS dev-client instructions in `docs/eas-dev-client.md`).
2. Install the dev client on an Android device.
3. Open Settings → Apps → Special app access → Notification access and enable access for the dev client (if requested).
4. Use the app to enable the Shield and send a test notification (or use the mock tools in the dashboard) to verify events arrive in JS.

## Safety/Privacy

- Ensure you only forward notification contents for analysis with user consent. Consider storing only metadata or hashed values for telemetry. The notification listener wrapper in `mobile/notifications/notificationListener.ts` is designed as a lightweight forwarder — implement privacy rules in the code path that consumes notifications.
