package com.helloworld.notification;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import android.provider.Settings;
import android.content.Intent;
import android.util.Log;

import android.content.IntentFilter;

public class NotificationBridgeModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
    public static final String NAME = "NotificationBridge";

    private final ReactApplicationContext reactContext;
    private NotificationBroadcastReceiver receiver;

    public NotificationBridgeModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        reactContext.addLifecycleEventListener(this);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void startListening() {
        if (receiver != null) return;
        receiver = new NotificationBroadcastReceiver(reactContext);
        IntentFilter filter = new IntentFilter();
        filter.addAction(AppNotificationListenerService.ACTION_NOTIFICATION_POSTED);
        reactContext.registerReceiver(receiver, filter);
    }

    @ReactMethod
    public void getPermissionStatus(Promise promise) {
        try {
            String enabledListeners = Settings.Secure.getString(reactContext.getContentResolver(), "enabled_notification_listeners");
            if (enabledListeners != null && enabledListeners.contains(reactContext.getPackageName())) {
                promise.resolve("granted");
                return;
            }
        } catch (Exception e) {
            Log.w(NAME, "Failed to read notification listener settings", e);
        }
        promise.resolve("denied");
    }

    @ReactMethod
    public void requestPermission(Promise promise) {
        try {
            Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            reactContext.startActivity(intent);
            promise.resolve("requested");
        } catch (Exception e) {
            promise.reject("error", e);
        }
    }

    @ReactMethod
    public void stopListening() {
        if (receiver == null) return;
        try {
            reactContext.unregisterReceiver(receiver);
        } catch (Exception e) {
            // ignore
        }
        receiver = null;
    }

    @Override
    public void onHostResume() {}

    @Override
    public void onHostPause() {}

    @Override
    public void onHostDestroy() {
        stopListening();
    }
}
