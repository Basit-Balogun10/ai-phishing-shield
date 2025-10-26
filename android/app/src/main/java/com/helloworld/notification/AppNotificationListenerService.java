package com.helloworld.notification;

import android.app.Service;
import android.content.Intent;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

/**
 * Lightweight NotificationListenerService implementation that captures posted notifications
 * and broadcasts a sanitized intent that JS native modules (or other receivers) can observe.
 *
 * This implementation intentionally keeps logic minimal: it extracts title/text and package
 * name and emits a local broadcast. You may extend it to forward to a React Native module
 * or persist notifications as needed.
 */
public class AppNotificationListenerService extends NotificationListenerService {
    private static final String TAG = "AppNotificationListener";
    public static final String ACTION_NOTIFICATION_POSTED = "ai_phishing_shield.NOTIFICATION_POSTED";

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.i(TAG, "Notification listener connected");
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.i(TAG, "Notification listener disconnected");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;

        try {
            CharSequence pkg = sbn.getPackageName();
            CharSequence title = "";
            CharSequence text = "";

            if (sbn.getNotification() != null && sbn.getNotification().extras != null) {
                Bundle extras = sbn.getNotification().extras;
                CharSequence t = extras.getCharSequence("android.title");
                CharSequence txt = extras.getCharSequence("android.text");
                if (t != null) title = t;
                if (txt != null) text = txt;
            }

            Log.d(TAG, "posted from=" + pkg + " title=" + title + " text=" + text);

            Intent out = new Intent(ACTION_NOTIFICATION_POSTED);
            out.putExtra("package", pkg != null ? pkg.toString() : "");
            out.putExtra("title", title != null ? title.toString() : "");
            out.putExtra("text", text != null ? text.toString() : "");
            out.putExtra("postedAt", String.valueOf(System.currentTimeMillis()));

            // Send a broadcast; JS side can register a BroadcastReceiver via a native module
            // or other integrations. This keeps the service self-contained and testable.
            sendBroadcast(out);
        } catch (Exception e) {
            Log.w(TAG, "Failed to process posted notification", e);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // no-op for now, but log for visibility
        if (sbn == null) return;
        Log.d(TAG, "removed: " + sbn.getPackageName());
    }
}
