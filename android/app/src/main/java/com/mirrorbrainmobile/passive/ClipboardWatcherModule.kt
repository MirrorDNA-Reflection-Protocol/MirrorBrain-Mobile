package com.mirrorbrainmobile.passive

import android.content.ClipboardManager
import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * ClipboardWatcher — Passive Intelligence Layer
 *
 * Monitors clipboard for URLs, phone numbers, addresses.
 * Emits events to JS for vault capture.
 */
class ClipboardWatcherModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var clipboardManager: ClipboardManager? = null
    private var isWatching = false
    private var lastClipText: String? = null

    private val clipboardListener = ClipboardManager.OnPrimaryClipChangedListener {
        handleClipboardChange()
    }

    override fun getName(): String = "ClipboardWatcher"

    @ReactMethod
    fun startWatching(promise: Promise) {
        if (isWatching) {
            promise.resolve(true)
            return
        }

        try {
            clipboardManager = reactApplicationContext
                .getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboardManager?.addPrimaryClipChangedListener(clipboardListener)
            isWatching = true
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLIPBOARD_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopWatching(promise: Promise) {
        try {
            clipboardManager?.removePrimaryClipChangedListener(clipboardListener)
            isWatching = false
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CLIPBOARD_ERROR", e.message)
        }
    }

    @ReactMethod
    fun getCurrentClipboard(promise: Promise) {
        try {
            val clip = clipboardManager?.primaryClip
            if (clip != null && clip.itemCount > 0) {
                val text = clip.getItemAt(0).text?.toString()
                promise.resolve(text)
            } else {
                promise.resolve(null)
            }
        } catch (e: Exception) {
            promise.reject("CLIPBOARD_ERROR", e.message)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN NativeEventEmitter
    }

    private fun handleClipboardChange() {
        try {
            val clip = clipboardManager?.primaryClip ?: return
            if (clip.itemCount == 0) return

            val text = clip.getItemAt(0).text?.toString() ?: return

            // Dedupe consecutive identical clips
            if (text == lastClipText) return
            lastClipText = text

            // Classify content
            val classification = classifyContent(text)

            // Emit to JS
            val params = Arguments.createMap().apply {
                putString("text", text)
                putString("type", classification.type)
                putDouble("confidence", classification.confidence)
                putDouble("timestamp", System.currentTimeMillis().toDouble())
            }

            sendEvent("onClipboardCapture", params)
        } catch (e: Exception) {
            // Silent fail — clipboard access can be restricted
        }
    }

    private fun classifyContent(text: String): ContentClassification {
        val trimmed = text.trim()

        // URL detection
        if (trimmed.matches(Regex("^https?://.*")) ||
            trimmed.matches(Regex("^www\\..*"))) {
            return ContentClassification("url", 0.95)
        }

        // Phone number detection (various formats)
        if (trimmed.matches(Regex("^[+]?[(]?[0-9]{1,3}[)]?[-\\s.]?[(]?[0-9]{1,4}[)]?[-\\s.]?[0-9]{1,4}[-\\s.]?[0-9]{1,9}$"))) {
            return ContentClassification("phone", 0.9)
        }

        // Email detection
        if (trimmed.matches(Regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$"))) {
            return ContentClassification("email", 0.95)
        }

        // Address detection (basic heuristic: contains number + common address words)
        val addressKeywords = listOf("street", "st", "avenue", "ave", "road", "rd",
            "drive", "dr", "lane", "ln", "blvd", "way", "court", "ct", "place", "pl")
        val lowerText = trimmed.lowercase()
        if (trimmed.matches(Regex(".*\\d+.*")) &&
            addressKeywords.any { lowerText.contains(it) }) {
            return ContentClassification("address", 0.7)
        }

        // Crypto address detection (basic)
        if (trimmed.matches(Regex("^(0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})$"))) {
            return ContentClassification("crypto_address", 0.9)
        }

        // Default: plain text
        return ContentClassification("text", 0.5)
    }

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    data class ContentClassification(val type: String, val confidence: Double)
}
