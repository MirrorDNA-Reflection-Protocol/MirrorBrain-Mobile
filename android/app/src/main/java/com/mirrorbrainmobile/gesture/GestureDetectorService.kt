package com.mirrorbrainmobile.gesture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mirrorbrainmobile.MainActivity
import com.mirrorbrainmobile.R
import com.mirrorbrainmobile.capture.QuickCaptureActivity

/**
 * GestureDetectorService — System-wide gesture detection
 *
 * Detects gestures even when app is not in foreground:
 * - Shake: Quick capture
 * - Three-finger swipe: Floating bubble (via accessibility)
 * - Long-press power: Voice to MirrorBrain (system integration)
 */
class GestureDetectorService : Service() {

    companion object {
        private const val TAG = "GestureDetectorService"
        private const val CHANNEL_ID = "mirrorbrain_gesture"
        private const val NOTIFICATION_ID = 1002

        @Volatile
        var instance: GestureDetectorService? = null
            private set

        var isRunning: Boolean = false
            private set

        @Volatile
        private var reactContext: ReactApplicationContext? = null

        fun setReactContext(context: ReactApplicationContext?) {
            reactContext = context
        }

        fun start(context: Context) {
            val intent = Intent(context, GestureDetectorService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, GestureDetectorService::class.java))
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

    private var shakeDetector: ShakeDetector? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.i(TAG, "GestureDetectorService created")

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())

        initializeDetectors()
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "GestureDetectorService onStartCommand")
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "GestureDetectorService destroyed")

        isRunning = false
        instance = null
        shutdownDetectors()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Gesture Detection",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Listens for gestures"
                setShowBadge(false)
            }

            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Gesture Detection Active")
            .setContentText("Shake to capture")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun initializeDetectors() {
        // Shake detector
        shakeDetector = ShakeDetector(this) {
            onShakeDetected()
        }
        shakeDetector?.start()
        Log.i(TAG, "Shake detector initialized")
    }

    private fun shutdownDetectors() {
        shakeDetector?.stop()
        shakeDetector = null
    }

    private fun onShakeDetected() {
        Log.i(TAG, "Shake gesture detected!")

        // Haptic feedback
        vibratePattern()

        // Notify JS layer
        sendEvent("gestureDetected", Arguments.createMap().apply {
            putString("type", "shake")
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        })

        // Launch quick capture
        launchQuickCapture()
    }

    private fun vibratePattern() {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            manager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(100, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(100)
        }
    }

    private fun launchQuickCapture() {
        try {
            val intent = Intent(this, QuickCaptureActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch quick capture", e)
        }
    }

    /**
     * Update shake sensitivity
     */
    fun setSensitivity(sensitivity: Float) {
        shakeDetector?.sensitivity = sensitivity
    }

    /**
     * Enable/disable shake detection
     */
    fun setShakeEnabled(enabled: Boolean) {
        shakeDetector?.enabled = enabled
    }
}

/**
 * GestureModule — React Native bridge for gesture detection
 */
class GestureModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        GestureDetectorService.setReactContext(reactContext)
    }

    override fun getName(): String = "GestureDetector"

    @ReactMethod
    fun start(promise: Promise) {
        try {
            reactApplicationContext?.let { context ->
                GestureDetectorService.start(context)
                promise.resolve(true)
            } ?: promise.reject("NO_CONTEXT", "No application context")
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            reactApplicationContext?.let { context ->
                GestureDetectorService.stop(context)
                promise.resolve(true)
            } ?: promise.reject("NO_CONTEXT", "No application context")
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(GestureDetectorService.isRunning)
    }

    @ReactMethod
    fun setSensitivity(sensitivity: Double, promise: Promise) {
        GestureDetectorService.instance?.setSensitivity(sensitivity.toFloat())
        promise.resolve(true)
    }

    @ReactMethod
    fun setShakeEnabled(enabled: Boolean, promise: Promise) {
        GestureDetectorService.instance?.setShakeEnabled(enabled)
        promise.resolve(true)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }
}
