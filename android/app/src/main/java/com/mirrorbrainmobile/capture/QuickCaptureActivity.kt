package com.mirrorbrainmobile.capture

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mirrorbrainmobile.R

/**
 * QuickCaptureActivity — Translucent overlay for voice capture
 *
 * Launched by shake gesture for zero-friction voice capture.
 * - Translucent fullscreen overlay
 * - Auto-starts voice recognition
 * - Sends captured text to JS layer
 * - Auto-dismisses after capture or timeout
 */
class QuickCaptureActivity : Activity() {

    companion object {
        private const val TAG = "QuickCaptureActivity"
        private const val REQUEST_RECORD_AUDIO = 1001
        private const val AUTO_DISMISS_TIMEOUT_MS = 10000L // 10 seconds

        @Volatile
        private var reactContext: ReactApplicationContext? = null

        fun setReactContext(context: ReactApplicationContext?) {
            reactContext = context
        }

        private fun sendEvent(eventName: String, params: com.facebook.react.bridge.WritableMap) {
            reactContext?.let { ctx ->
                if (ctx.hasActiveReactInstance()) {
                    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit(eventName, params)
                }
            }
        }
    }

    private var speechRecognizer: SpeechRecognizer? = null
    private var statusText: TextView? = null
    private var capturedText: TextView? = null
    private var progressBar: ProgressBar? = null
    private var isListening = false
    private val handler = Handler(Looper.getMainLooper())

    private val autoDismissRunnable = Runnable {
        Log.i(TAG, "Auto-dismiss timeout reached")
        finishWithResult(null)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Make activity translucent
        window.apply {
            setFlags(
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
            )
            // Dim background
            setDimAmount(0.7f)
            addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            // Keep screen on
            addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }

        setupUI()

        // Check permission and start
        if (checkAudioPermission()) {
            startVoiceCapture()
        } else {
            requestAudioPermission()
        }

        // Set auto-dismiss timer
        handler.postDelayed(autoDismissRunnable, AUTO_DISMISS_TIMEOUT_MS)

        Log.i(TAG, "QuickCaptureActivity created")
    }

    private fun setupUI() {
        val layout = FrameLayout(this).apply {
            setBackgroundColor(0x00000000) // Transparent
            isClickable = true
            setOnClickListener { finishWithResult(null) }
        }

        // Center container
        val container = FrameLayout(this).apply {
            setBackgroundResource(android.R.drawable.dialog_holo_dark_frame)
            setPadding(48, 48, 48, 48)
        }

        val containerParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.CENTER
        }

        // Inner content
        val contentLayout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }

        // Mic icon
        val micIcon = ImageView(this).apply {
            setImageResource(android.R.drawable.ic_btn_speak_now)
            val size = (64 * resources.displayMetrics.density).toInt()
            layoutParams = android.widget.LinearLayout.LayoutParams(size, size).apply {
                gravity = Gravity.CENTER
                bottomMargin = (16 * resources.displayMetrics.density).toInt()
            }
        }

        // Status text
        statusText = TextView(this).apply {
            text = "Listening..."
            textSize = 18f
            setTextColor(0xFFFFFFFF.toInt())
            gravity = Gravity.CENTER
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.CENTER
                bottomMargin = (8 * resources.displayMetrics.density).toInt()
            }
        }

        // Captured text
        capturedText = TextView(this).apply {
            text = ""
            textSize = 14f
            setTextColor(0xAAFFFFFF.toInt())
            gravity = Gravity.CENTER
            maxLines = 3
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.CENTER
                topMargin = (8 * resources.displayMetrics.density).toInt()
            }
        }

        // Progress bar
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true
            layoutParams = android.widget.LinearLayout.LayoutParams(
                (200 * resources.displayMetrics.density).toInt(),
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.CENTER
                topMargin = (16 * resources.displayMetrics.density).toInt()
            }
        }

        contentLayout.addView(micIcon)
        contentLayout.addView(statusText)
        contentLayout.addView(capturedText)
        contentLayout.addView(progressBar)
        container.addView(contentLayout)
        layout.addView(container, containerParams)

        setContentView(layout)
    }

    private fun checkAudioPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestAudioPermission() {
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.RECORD_AUDIO),
            REQUEST_RECORD_AUDIO
        )
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_RECORD_AUDIO) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startVoiceCapture()
            } else {
                statusText?.text = "Microphone permission required"
                handler.postDelayed({ finishWithResult(null) }, 2000)
            }
        }
    }

    private fun startVoiceCapture() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            statusText?.text = "Speech recognition not available"
            handler.postDelayed({ finishWithResult(null) }, 2000)
            return
        }

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    isListening = true
                    statusText?.text = "Listening..."
                    progressBar?.visibility = View.VISIBLE
                }

                override fun onBeginningOfSpeech() {
                    statusText?.text = "Hearing you..."
                }

                override fun onRmsChanged(rmsdB: Float) {
                    // Could update UI based on volume
                }

                override fun onBufferReceived(buffer: ByteArray?) {}

                override fun onEndOfSpeech() {
                    isListening = false
                    statusText?.text = "Processing..."
                }

                override fun onError(error: Int) {
                    isListening = false
                    val errorMsg = when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected"
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Timeout"
                        else -> "Error: $error"
                    }
                    Log.w(TAG, "Speech recognition error: $errorMsg")
                    statusText?.text = errorMsg
                    handler.postDelayed({ finishWithResult(null) }, 1500)
                }

                override fun onResults(results: Bundle?) {
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val text = matches?.firstOrNull()
                    if (!text.isNullOrEmpty()) {
                        Log.i(TAG, "Captured: $text")
                        capturedText?.text = text
                        statusText?.text = "Captured!"
                        progressBar?.visibility = View.GONE
                        handler.postDelayed({ finishWithResult(text) }, 1000)
                    } else {
                        finishWithResult(null)
                    }
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    matches?.firstOrNull()?.let {
                        capturedText?.text = it
                    }
                }

                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }

        speechRecognizer?.startListening(intent)
        Log.i(TAG, "Voice capture started")
    }

    private fun finishWithResult(text: String?) {
        handler.removeCallbacks(autoDismissRunnable)

        // Send result to JS
        sendEvent("quickCapture", Arguments.createMap().apply {
            putBoolean("success", !text.isNullOrEmpty())
            putString("text", text ?: "")
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        })

        finish()
        // Smooth fade out
        overridePendingTransition(0, android.R.anim.fade_out)
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(autoDismissRunnable)
        speechRecognizer?.apply {
            stopListening()
            destroy()
        }
        speechRecognizer = null
        Log.i(TAG, "QuickCaptureActivity destroyed")
    }

    override fun onBackPressed() {
        super.onBackPressed()
        finishWithResult(null)
    }
}
