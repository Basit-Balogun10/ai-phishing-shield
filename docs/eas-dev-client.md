# Building a development client with EAS

This doc shows quick steps to build an Android development client that includes native modules (for example, a notification listener). We recommend using EAS to create a dev client because Expo Go does not support arbitrary native modules.

Prerequisites

- Install and configure EAS CLI: https://docs.expo.dev/eas/
- An Expo account and credentials for building (or use a CI service).

Quick steps (Android)

1. Ensure your `eas.json` contains a `development` profile that uses `developmentClient: true` and includes any native config you need. A minimal profile looks like:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

2. Install any native dependencies your listener requires, for example:

```bash
pnpm add react-native-android-notification-listener
# then follow package install steps for autolinking / native setup
```

3. Build the dev client (Android):

```bash
eas build --profile development --platform android
```

4. Install the APK on your device (or use `eas device:create`/internal distribution) and enable notification access in Settings.

5. Open the app, enable the Shield, and verify notifications are received by the JS listener.

Notes

- Building a development client can take several minutes. Keep an eye on credentials and signing settings if you run builds in CI.
- If you only need to test JS-only behavior, the `mobile/notifications/notificationListener.ts` wrapper safely no-ops on non-Android platforms and when the native module is missing.
