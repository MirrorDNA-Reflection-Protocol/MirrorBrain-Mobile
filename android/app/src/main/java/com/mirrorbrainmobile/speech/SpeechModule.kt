package com.mirrorbrainmobile.speech

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class SpeechModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var speechPromise: Promise? = null

    companion object {
        private const val SPEECH_REQUEST_CODE = 9876
        private const val TAG = "SpeechModule"
    }

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "SpeechModule"

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        val available = intent.resolveActivity(activity.packageManager) != null
        Log.d(TAG, "isAvailable: $available")
        promise.resolve(available)
    }

    @ReactMethod
    fun startListening(locale: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity")
            return
        }

        speechPromise = null

        try {
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak your command...")
            }

            speechPromise = promise
            activity.startActivityForResult(intent, SPEECH_REQUEST_CODE)
            Log.d(TAG, "Speech activity launched")

            // Send start event
            val event = Arguments.createMap()
            sendEvent("onSpeechStart", event)
        } catch (e: Exception) {
            Log.e(TAG, "startListening error: ${e.message}")
            speechPromise = null
            promise.reject("START_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        // Intent-based: nothing to stop, activity handles its own lifecycle
        promise.resolve(true)
    }

    @ReactMethod
    fun cancel(promise: Promise) {
        speechPromise = null
        promise.resolve(true)
    }

    @ReactMethod
    fun destroy(promise: Promise) {
        speechPromise = null
        promise.resolve(true)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != SPEECH_REQUEST_CODE) return

        Log.d(TAG, "onActivityResult: resultCode=$resultCode")

        if (resultCode == Activity.RESULT_OK && data != null) {
            val matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            Log.d(TAG, "Speech results: ${matches?.joinToString()}")

            if (!matches.isNullOrEmpty()) {
                // Send results event
                val event = Arguments.createMap()
                val arr = Arguments.createArray()
                matches.forEach { arr.pushString(it) }
                event.putArray("value", arr)
                sendEvent("onSpeechResults", event)

                // Also resolve promise with first result
                speechPromise?.resolve(true)
            } else {
                val event = Arguments.createMap()
                event.putInt("code", 7) // ERROR_NO_MATCH
                event.putString("message", "No match found")
                sendEvent("onSpeechError", event)
                speechPromise?.resolve(true)
            }
        } else {
            // User cancelled or error
            Log.d(TAG, "Speech cancelled or failed")
            val event = Arguments.createMap()
            sendEvent("onSpeechEnd", event)
            speechPromise?.resolve(true)
        }

        speechPromise = null
    }

    override fun onNewIntent(intent: Intent) {}
}
