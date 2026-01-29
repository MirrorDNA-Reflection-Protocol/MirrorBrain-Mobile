package com.mirrorbrainmobile.passive

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.text.TextUtils
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * PassiveIntelligence — React Native Bridge
 *
 * Unified interface for all passive intelligence features:
 * - Clipboard watching
 * - Notification interception
 * - Screen context awareness
 */
class PassiveIntelligenceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val clipboardWatcher = ClipboardWatcherModule(reactContext)

    override fun getName(): String = "PassiveIntelligence"

    // ─────────────────────────────────────────────────────────────────────────
    // Clipboard Watcher
    // ─────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun startClipboardWatcher(promise: Promise) {
        clipboardWatcher.startWatching(promise)
    }

    @ReactMethod
    fun stopClipboardWatcher(promise: Promise) {
        clipboardWatcher.stopWatching(promise)
    }

    @ReactMethod
    fun getCurrentClipboard(promise: Promise) {
        clipboardWatcher.getCurrentClipboard(promise)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Notification Interceptor
    // ─────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun isNotificationAccessEnabled(promise: Promise) {
        try {
            val pkgName = reactApplicationContext.packageName
            val flat = Settings.Secure.getString(
                reactApplicationContext.contentResolver,
                "enabled_notification_listeners"
            )
            val enabled = !TextUtils.isEmpty(flat) && flat.contains(pkgName)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_ERROR", e.message)
        }
    }

    @ReactMethod
    fun openNotificationAccessSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getActiveNotifications(promise: Promise) {
        try {
            val service = NotificationInterceptorService.instance
            if (service == null) {
                promise.resolve(Arguments.createArray())
                return
            }

            val notifications = service.getAllActiveNotifications()
            val result = Arguments.createArray()

            notifications.forEach { sbn ->
                val notification = sbn.notification ?: return@forEach
                val extras = notification.extras ?: return@forEach

                val item = Arguments.createMap().apply {
                    putString("id", sbn.key)
                    putString("packageName", sbn.packageName)
                    putString("title", extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString() ?: "")
                    putString("text", extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString() ?: "")
                    putDouble("timestamp", sbn.postTime.toDouble())
                }
                result.pushMap(item)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_ERROR", e.message)
        }
    }

    @ReactMethod
    fun dismissNotification(key: String, promise: Promise) {
        try {
            val service = NotificationInterceptorService.instance
            if (service == null) {
                promise.reject("NOTIFICATION_ERROR", "Notification service not running")
                return
            }
            service.dismissNotification(key)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIFICATION_ERROR", e.message)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Screen Context (Accessibility Service)
    // ─────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun isAccessibilityEnabled(promise: Promise) {
        try {
            val serviceName = ComponentName(
                reactApplicationContext.packageName,
                "${reactApplicationContext.packageName}.passive.ScreenContextService"
            ).flattenToString()

            val enabledServices = Settings.Secure.getString(
                reactApplicationContext.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: ""

            val enabled = enabledServices.contains(serviceName)
            promise.resolve(enabled)
        } catch (e: Exception) {
            promise.reject("ACCESSIBILITY_ERROR", e.message)
        }
    }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ACCESSIBILITY_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getScreenContext(promise: Promise) {
        try {
            val service = ScreenContextService.instance
            if (service == null) {
                promise.reject("ACCESSIBILITY_ERROR", "Screen context service not enabled")
                return
            }
            promise.resolve(service.getScreenContext())
        } catch (e: Exception) {
            promise.reject("ACCESSIBILITY_ERROR", e.message)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Combined Status
    // ─────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun getPassiveStatus(promise: Promise) {
        try {
            val result = Arguments.createMap()

            // Clipboard (always available)
            result.putBoolean("clipboardEnabled", true)

            // Notification access
            val pkgName = reactApplicationContext.packageName
            val notifFlat = Settings.Secure.getString(
                reactApplicationContext.contentResolver,
                "enabled_notification_listeners"
            ) ?: ""
            result.putBoolean("notificationEnabled", notifFlat.contains(pkgName))

            // Accessibility
            val serviceName = ComponentName(
                pkgName,
                "$pkgName.passive.ScreenContextService"
            ).flattenToString()
            val a11yFlat = Settings.Secure.getString(
                reactApplicationContext.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: ""
            result.putBoolean("screenContextEnabled", a11yFlat.contains(serviceName))

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("STATUS_ERROR", e.message)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Event Emitter Support
    // ─────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN NativeEventEmitter
    }
}
