package com.mirrorbrainmobile.focus

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Date

/**
 * FocusModeService — Focus Mode Management
 *
 * Purpose: Manage focus mode state and settings.
 * Integrates with AutoResponderService for notification handling.
 */
class FocusModeService(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val prefs: SharedPreferences by lazy {
        reactContext.getSharedPreferences("focus_mode", Context.MODE_PRIVATE)
    }

    private var focusStartTime: Long = 0
    private var focusDuration: Long = 0
    private var focusReason: String = ""
    private var allowedContacts: MutableSet<String> = mutableSetOf()

    companion object {
        private const val TAG = "FocusModeService"

        @Volatile
        var instance: FocusModeService? = null
            private set

        // Focus mode presets
        const val PRESET_DEEP_WORK = "deep_work"
        const val PRESET_MEETING = "meeting"
        const val PRESET_PERSONAL = "personal"
        const val PRESET_SLEEP = "sleep"
    }

    init {
        instance = this
    }

    override fun getName(): String = "FocusModeService"

    // ─────────────────────────────────────────────────────────────────────────────
    // Focus Mode Control
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Check if focus mode is active
     */
    @ReactMethod
    fun isActive(promise: Promise) {
        val active = prefs.getBoolean("focus_active", false)
        if (active) {
            // Check if expired
            val endTime = prefs.getLong("focus_end_time", 0)
            if (endTime > 0 && System.currentTimeMillis() > endTime) {
                endFocusMode()
                promise.resolve(false)
                return
            }
        }
        promise.resolve(active)
    }

    /**
     * Start focus mode
     */
    @ReactMethod
    fun startFocus(options: ReadableMap, promise: Promise) {
        val durationMinutes = if (options.hasKey("duration")) options.getInt("duration") else 25
        val reason = if (options.hasKey("reason")) options.getString("reason") else "Focusing"
        val preset = if (options.hasKey("preset")) options.getString("preset") else PRESET_DEEP_WORK
        val allowList = if (options.hasKey("allowedContacts")) {
            options.getArray("allowedContacts")?.toArrayList()?.map { it.toString() } ?: emptyList()
        } else emptyList()

        focusStartTime = System.currentTimeMillis()
        focusDuration = durationMinutes * 60 * 1000L
        focusReason = reason ?: "Focusing"
        allowedContacts.clear()
        allowedContacts.addAll(allowList)

        // Save to prefs
        prefs.edit()
            .putBoolean("focus_active", true)
            .putLong("focus_start_time", focusStartTime)
            .putLong("focus_end_time", focusStartTime + focusDuration)
            .putString("focus_reason", focusReason)
            .putString("focus_preset", preset)
            .putStringSet("allowed_contacts", allowedContacts)
            .apply()

        // Start auto-responder
        AutoResponderService.setActive(true)

        // Emit event
        emitFocusEvent("started", durationMinutes)

        android.util.Log.d(TAG, "Focus mode started: $focusReason for $durationMinutes minutes")

        val result = Arguments.createMap().apply {
            putBoolean("success", true)
            putDouble("endsAt", (focusStartTime + focusDuration).toDouble())
        }
        promise.resolve(result)
    }

    /**
     * End focus mode
     */
    @ReactMethod
    fun endFocus(promise: Promise) {
        endFocusMode()
        promise.resolve(true)
    }

    private fun endFocusMode() {
        val wasActive = prefs.getBoolean("focus_active", false)

        prefs.edit()
            .putBoolean("focus_active", false)
            .putLong("focus_end_time", 0)
            .apply()

        // Stop auto-responder
        AutoResponderService.setActive(false)

        if (wasActive) {
            val duration = (System.currentTimeMillis() - focusStartTime) / 60000
            emitFocusEvent("ended", duration.toInt())
            android.util.Log.d(TAG, "Focus mode ended after $duration minutes")
        }

        focusStartTime = 0
        focusDuration = 0
    }

    /**
     * Extend focus mode
     */
    @ReactMethod
    fun extendFocus(additionalMinutes: Int, promise: Promise) {
        if (!prefs.getBoolean("focus_active", false)) {
            promise.reject("NOT_ACTIVE", "Focus mode is not active")
            return
        }

        val currentEndTime = prefs.getLong("focus_end_time", 0)
        val newEndTime = currentEndTime + (additionalMinutes * 60 * 1000L)

        prefs.edit()
            .putLong("focus_end_time", newEndTime)
            .apply()

        focusDuration += additionalMinutes * 60 * 1000L

        emitFocusEvent("extended", additionalMinutes)

        promise.resolve(Arguments.createMap().apply {
            putDouble("endsAt", newEndTime.toDouble())
        })
    }

    /**
     * Get current focus status
     */
    @ReactMethod
    fun getStatus(promise: Promise) {
        val active = prefs.getBoolean("focus_active", false)

        if (!active) {
            promise.resolve(Arguments.createMap().apply {
                putBoolean("active", false)
            })
            return
        }

        val startTime = prefs.getLong("focus_start_time", 0)
        val endTime = prefs.getLong("focus_end_time", 0)
        val reason = prefs.getString("focus_reason", "")
        val preset = prefs.getString("focus_preset", PRESET_DEEP_WORK)
        val allowed = prefs.getStringSet("allowed_contacts", emptySet()) ?: emptySet()

        // Check if expired
        if (endTime > 0 && System.currentTimeMillis() > endTime) {
            endFocusMode()
            promise.resolve(Arguments.createMap().apply {
                putBoolean("active", false)
            })
            return
        }

        val elapsed = (System.currentTimeMillis() - startTime) / 60000
        val remaining = if (endTime > 0) (endTime - System.currentTimeMillis()) / 60000 else -1

        val allowedArray = Arguments.createArray()
        allowed.forEach { allowedArray.pushString(it) }

        promise.resolve(Arguments.createMap().apply {
            putBoolean("active", true)
            putDouble("startedAt", startTime.toDouble())
            putDouble("endsAt", endTime.toDouble())
            putInt("elapsedMinutes", elapsed.toInt())
            putInt("remainingMinutes", remaining.toInt())
            putString("reason", reason)
            putString("preset", preset)
            putArray("allowedContacts", allowedArray)
        })
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Settings
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Set auto-reply message
     */
    @ReactMethod
    fun setAutoReplyMessage(message: String, promise: Promise) {
        prefs.edit().putString("auto_reply_message", message).apply()
        AutoResponderService.setCustomMessage(message)
        promise.resolve(true)
    }

    /**
     * Get auto-reply message
     */
    @ReactMethod
    fun getAutoReplyMessage(promise: Promise) {
        val message = prefs.getString("auto_reply_message", AutoResponderService.DEFAULT_MESSAGE)
        promise.resolve(message)
    }

    /**
     * Set allowed contacts (breakthrough list)
     */
    @ReactMethod
    fun setAllowedContacts(contacts: ReadableArray, promise: Promise) {
        val contactList = contacts.toArrayList().map { it.toString() }.toSet()
        prefs.edit().putStringSet("allowed_contacts", contactList).apply()
        allowedContacts.clear()
        allowedContacts.addAll(contactList)
        AutoResponderService.setAllowedContacts(contactList)
        promise.resolve(true)
    }

    /**
     * Add a contact to allowed list
     */
    @ReactMethod
    fun addAllowedContact(contact: String, promise: Promise) {
        val current = prefs.getStringSet("allowed_contacts", mutableSetOf())?.toMutableSet() ?: mutableSetOf()
        current.add(contact)
        prefs.edit().putStringSet("allowed_contacts", current).apply()
        allowedContacts.add(contact)
        AutoResponderService.setAllowedContacts(current)
        promise.resolve(true)
    }

    /**
     * Enable/disable auto-responder
     */
    @ReactMethod
    fun setAutoResponderEnabled(enabled: Boolean, promise: Promise) {
        prefs.edit().putBoolean("auto_responder_enabled", enabled).apply()
        promise.resolve(true)
    }

    /**
     * Check if auto-responder is enabled
     */
    @ReactMethod
    fun isAutoResponderEnabled(promise: Promise) {
        val enabled = prefs.getBoolean("auto_responder_enabled", true)
        promise.resolve(enabled)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Presets
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get focus presets
     */
    @ReactMethod
    fun getPresets(promise: Promise) {
        val presets = Arguments.createArray()

        presets.pushMap(Arguments.createMap().apply {
            putString("id", PRESET_DEEP_WORK)
            putString("name", "Deep Work")
            putString("icon", "🎯")
            putInt("defaultDuration", 50)
            putString("message", "I'm in deep focus mode and will respond when I'm done.")
        })

        presets.pushMap(Arguments.createMap().apply {
            putString("id", PRESET_MEETING)
            putString("name", "In a Meeting")
            putString("icon", "📅")
            putInt("defaultDuration", 60)
            putString("message", "I'm currently in a meeting. I'll get back to you shortly.")
        })

        presets.pushMap(Arguments.createMap().apply {
            putString("id", PRESET_PERSONAL)
            putString("name", "Personal Time")
            putString("icon", "🏠")
            putInt("defaultDuration", 120)
            putString("message", "Taking some personal time. Will respond later.")
        })

        presets.pushMap(Arguments.createMap().apply {
            putString("id", PRESET_SLEEP)
            putString("name", "Sleep Mode")
            putString("icon", "😴")
            putInt("defaultDuration", 480)
            putString("message", "I'm currently sleeping. Messages will be answered in the morning.")
        })

        promise.resolve(presets)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Check if a contact is allowed to break through focus
     */
    fun isContactAllowed(contactName: String): Boolean {
        return allowedContacts.any { allowed ->
            contactName.contains(allowed, ignoreCase = true)
        }
    }

    /**
     * Get current focus reason
     */
    fun getCurrentReason(): String {
        return prefs.getString("focus_reason", "") ?: ""
    }

    /**
     * Emit focus event to JS
     */
    private fun emitFocusEvent(type: String, minutes: Int) {
        val params = Arguments.createMap().apply {
            putString("type", type)
            putInt("minutes", minutes)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }

        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onFocusEvent", params)
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to emit event: ${e.message}")
        }
    }
}
