package com.helloworld.notification;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.ReactApplicationContext;

/**
 * Receives ACTION_NOTIFICATION_POSTED broadcasts from AppNotificationListenerService and forwards
 * the sanitized payload to JS via React Native's DeviceEventEmitter.
 */
public class NotificationBroadcastReceiver extends BroadcastReceiver {
    private static final String TAG = "NotifBroadcastReceiver";
    private final ReactApplicationContext reactContext;

    public NotificationBroadcastReceiver(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            if (intent == null) return;
            Bundle extras = intent.getExtras();
            if (extras == null) return;

            String pkg = extras.getString("package", "");
            String title = extras.getString("title", "");
            String text = extras.getString("text", "");
            String postedAt = extras.getString("postedAt", Long.toString(System.currentTimeMillis()));

            WritableMap map = Arguments.createMap();
            map.putString("package", pkg);
            map.putString("title", title);
            map.putString("text", text);
            map.putString("postedAt", postedAt);

            // Forward via the RN application context if available
            if (reactContext != null && reactContext.hasActiveCatalystInstance()) {
                reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("NotificationPosted", map);
            } else {
                Log.i(TAG, "React context not available; dropping notification event");
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to forward broadcast to JS", e);
        }
    }
}
