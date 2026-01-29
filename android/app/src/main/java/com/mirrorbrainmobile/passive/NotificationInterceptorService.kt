package com.mirrorbrainmobile.passive

import android.app.Notification
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * NotificationInterceptor — Passive Intelligence Layer
 *
 * Intercepts all device notifications for AI summarization and routing.
 * User must enable in Settings > Notifications > Notification access.
 */
class NotificationInterceptorService : NotificationListenerService() {

    companion object {
        @Volatile
        var instance: NotificationInterceptorService? = null
            private set

        // Apps to ignore (system noise)
        private val IGNORED_PACKAGES = setOf(
            "android",
            "com.android.systemui",
            "com.android.providers.downloads",
        )

        // Priority apps (surface immediately)
        private val PRIORITY_PACKAGES = setOf(
            "com.whatsapp",
            "com.google.android.apps.messaging",
            "com.slack",
            "com.discord",
            "org.telegram.messenger",
            "com.Slack",
        )
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        // Filter ignored packages
        if (IGNORED_PACKAGES.contains(sbn.packageName)) return

        // Extract notification data
        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()

        // Skip empty notifications
        if (title.isEmpty() && text.isEmpty()) return

        // Build notification data for JS
        val data = Arguments.createMap().apply {
            putString("id", sbn.key)
            putString("packageName", sbn.packageName)
            putString("title", title)
            putString("text", bigText ?: text)
            putDouble("timestamp", sbn.postTime.toDouble())
            putBoolean("isPriority", PRIORITY_PACKAGES.contains(sbn.packageName))
            putBoolean("isOngoing", notification.flags and Notification.FLAG_ONGOING_EVENT != 0)

            // Category for smart routing
            putString("category", notification.category ?: "unknown")

            // App name
            try {
                val appInfo = packageManager.getApplicationInfo(sbn.packageName, 0)
                val appName = packageManager.getApplicationLabel(appInfo).toString()
                putString("appName", appName)
            } catch (e: Exception) {
                putString("appName", sbn.packageName)
            }
        }

        // Send to JS via headless task
        val intent = Intent(applicationContext, NotificationTaskService::class.java)
        intent.putExtra("notificationData", data.toString())

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            applicationContext.startForegroundService(intent)
        } else {
            applicationContext.startService(intent)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        // Could track dismissed notifications for patterns
    }

    /**
     * Cancel a notification by key (called from JS)
     */
    fun dismissNotification(key: String) {
        cancelNotification(key)
    }

    /**
     * Get all active notifications (renamed to avoid hiding supertype method)
     */
    fun getAllActiveNotifications(): List<StatusBarNotification> {
        return try {
            activeNotifications?.toList() ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }
}

/**
 * Headless JS task service for processing notifications in background
 */
class NotificationTaskService : HeadlessJsTaskService() {

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val data = intent?.getStringExtra("notificationData") ?: return null

        return HeadlessJsTaskConfig(
            "NotificationTask",
            Arguments.createMap().apply {
                putString("data", data)
            },
            5000, // timeout
            true  // allow in foreground
        )
    }
}
