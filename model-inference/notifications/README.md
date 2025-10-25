Notification listener

Overview

This folder contains a lightweight JS wrapper used to integrate an Android Notification Listener with the JS app. The implementation intentionally keeps a dummy/no-op fallback so the app continues to work when the native dependency isn't installed (local dev or CI).

What we provide

- `notificationListener.ts` — default export with async helpers:
  - `init()` — prepare the wrapper (attempts to load native module)
  - `isPermissionGranted()` — true when user has enabled notification access
  - `requestPermission()` — opens Android system settings for the user
  - `start()` / `stop()` — begin/end listening and forwarding notification payloads
  - `onNotification(cb)` — register a callback for incoming notifications

Native dependency (Android only)

We recommend using `react-native-android-notification-listener`. Install with pnpm:

```bash
pnpm add react-native-android-notification-listener
```

Then follow the library's README for required Android manifest updates and EAS dev client steps. The wrapper uses dynamic `require(...)` so the app won't crash when the native module is missing.

EAS dev client

Because NotificationListener requires native code, you must build a custom dev client with EAS to test it on real devices. See `eas.json` in the repo root for a `development` profile.

Android manifest snippet

Add the NotificationListenerService entry to `android/app/src/main/AndroidManifest.xml` inside `<application>`. Example snippet (merge into your manifest):

```xml
<!-- Add inside <manifest> near other permissions -->
<uses-permission android:name="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" />

<!-- Add inside <application> -->
<service android:name="com.yourapp.NotificationListenerService"
         android:label="Notification Listener"
         android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService" />
    </intent-filter>
</service>
```

Note: The exact service class and package may depend on the native library. Consult the native module docs and example project.

How the JS app should use it

- Call `notificationListener.init()` on app startup.
- Register a handler with `notificationListener.onNotification(payload => { ... })` to forward notification text to the inference pipeline.
- Respect user preference: start the listener when the shield is enabled, stop it when disabled.

Privacy

Only process text needed for classification. Keep telemetry gated behind user opt-in and remove PII before sending any telemetry.
