package com.mirrorbrainmobile.share

import android.app.Activity
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Share Module — React Native Bridge
 *
 * Processes shared content and sends events to JS.
 */
class ShareModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        private const val TAG = "ShareModule"
    }

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "ShareModule"

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        // Not used for share handling
    }

    override fun onNewIntent(intent: Intent) {
        processIntent(intent)
    }

    /**
     * Check if there's pending shared content from app launch
     */
    @ReactMethod
    fun getInitialShare(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(null)
            return
        }

        val intent = activity.intent
        if (intent == null) {
            promise.resolve(null)
            return
        }

        val mode = intent.getStringExtra("share_mode")
        val content = intent.getStringExtra("share_content")

        if (mode != null && content != null) {
            val data = Arguments.createMap().apply {
                putString("mode", mode)
                putString("content", content)
                putBoolean("autoProcess", intent.getBooleanExtra("auto_process", false))
            }

            // Clear the intent extras so we don't process again
            intent.removeExtra("share_mode")
            intent.removeExtra("share_content")

            promise.resolve(data)
        } else {
            promise.resolve(null)
        }
    }

    /**
     * Process an intent for shared content
     */
    private fun processIntent(intent: Intent) {
        val mode = intent.getStringExtra("share_mode") ?: return
        val content = intent.getStringExtra("share_content") ?: return

        Log.d(TAG, "Processing shared content: mode=$mode")

        val data = Arguments.createMap().apply {
            putString("mode", mode)
            putString("content", content)
            putBoolean("autoProcess", intent.getBooleanExtra("auto_process", false))
        }

        sendEvent("onShareReceived", data)
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
