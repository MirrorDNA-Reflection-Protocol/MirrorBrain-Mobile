package com.mirrorbrainmobile.speech

import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

class TTSModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = null
    private var isInitialized = false
    private var pendingPromise: Promise? = null

    override fun getName(): String = "TTSModule"

    override fun initialize() {
        super.initialize()
        tts = TextToSpeech(reactApplicationContext, this)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale.US
            tts?.setSpeechRate(1.0f)
            tts?.setPitch(1.0f)

            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    sendEvent("onTTSStart", Arguments.createMap().apply {
                        putString("utteranceId", utteranceId)
                    })
                }

                override fun onDone(utteranceId: String?) {
                    sendEvent("onTTSDone", Arguments.createMap().apply {
                        putString("utteranceId", utteranceId)
                    })
                }

                override fun onError(utteranceId: String?) {
                    sendEvent("onTTSError", Arguments.createMap().apply {
                        putString("utteranceId", utteranceId)
                    })
                }
            })

            isInitialized = true
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun speak(text: String, promise: Promise) {
        android.util.Log.d("TTSModule", "speak() called with: $text, isInitialized: $isInitialized")

        // If not initialized yet, wait up to 2 seconds
        if (!isInitialized) {
            android.util.Log.d("TTSModule", "Waiting for TTS to initialize...")
            Thread {
                var waited = 0
                while (!isInitialized && waited < 2000) {
                    Thread.sleep(100)
                    waited += 100
                }
                if (isInitialized && tts != null) {
                    android.util.Log.d("TTSModule", "TTS initialized after ${waited}ms, speaking now")
                    speakInternal(text, promise)
                } else {
                    android.util.Log.e("TTSModule", "TTS failed to initialize after waiting")
                    promise.reject("NOT_INITIALIZED", "TTS not initialized after waiting")
                }
            }.start()
            return
        }

        speakInternal(text, promise)
    }

    private fun speakInternal(text: String, promise: Promise) {
        try {
            val utteranceId = "tts_${System.currentTimeMillis()}"
            android.util.Log.d("TTSModule", "Calling tts.speak with utteranceId: $utteranceId")
            val result = tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)

            if (result == TextToSpeech.SUCCESS) {
                promise.resolve(utteranceId)
            } else {
                promise.reject("SPEAK_ERROR", "Failed to speak")
            }
        } catch (e: Exception) {
            promise.reject("SPEAK_ERROR", e.message)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            tts?.stop()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setLanguage(language: String, promise: Promise) {
        if (!isInitialized || tts == null) {
            promise.reject("NOT_INITIALIZED", "TTS not initialized")
            return
        }

        try {
            val locale = Locale.forLanguageTag(language)
            val result = tts?.setLanguage(locale)
            promise.resolve(result != TextToSpeech.LANG_NOT_SUPPORTED)
        } catch (e: Exception) {
            promise.reject("LANGUAGE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun setSpeechRate(rate: Float, promise: Promise) {
        try {
            tts?.setSpeechRate(rate)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RATE_ERROR", e.message)
        }
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(isInitialized)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun onCatalystInstanceDestroy() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        super.onCatalystInstanceDestroy()
    }
}
