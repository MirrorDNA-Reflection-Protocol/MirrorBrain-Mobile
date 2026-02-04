package com.mirrorbrainmobile.assistant

import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mirrorbrainmobile.MainActivity
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Double-Tap Back Detection Module
 *
 * Detects double-tap on the back of the phone using accelerometer.
 * Works on all Android phones, not just Pixel.
 *
 * Detection algorithm:
 * 1. Monitor accelerometer for sharp impacts
 * 2. Detect two impacts within 500ms
 * 3. Filter out movement/shaking (requires stationary phone)
 */
class DoubleTapModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), SensorEventListener {

    companion object {
        private const val TAG = "DoubleTapModule"

        // Detection thresholds
        private const val TAP_THRESHOLD = 12.0f      // Minimum acceleration for tap
        private const val DOUBLE_TAP_WINDOW = 500L   // Max ms between taps
        private const val TAP_COOLDOWN = 200L        // Min ms between taps
        private const val MOVEMENT_THRESHOLD = 2.0f  // Max movement to be "stationary"
    }

    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var isEnabled = false

    private var lastTapTime = 0L
    private var lastValues = FloatArray(3)
    private var tapCount = 0

    override fun getName(): String = "DoubleTapModule"

    override fun initialize() {
        super.initialize()
        sensorManager = reactApplicationContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        if (accelerometer == null) {
            Log.w(TAG, "Accelerometer not available on this device")
        }
    }

    @ReactMethod
    fun start() {
        if (accelerometer == null) {
            Log.w(TAG, "Cannot start - no accelerometer")
            return
        }

        if (!isEnabled) {
            // Use SENSOR_DELAY_UI (60ms) with batching for battery efficiency
            // This is less aggressive than SENSOR_DELAY_NORMAL
            sensorManager?.registerListener(
                this,
                accelerometer,
                SensorManager.SENSOR_DELAY_UI,  // ~60ms, good balance
                100000  // 100ms max report latency for batching
            )
            isEnabled = true
            Log.d(TAG, "Double-tap detection started (battery-optimized)")
        }
    }

    @ReactMethod
    fun stop() {
        if (isEnabled) {
            sensorManager?.unregisterListener(this)
            isEnabled = false
            Log.d(TAG, "Double-tap detection stopped")
        }
    }

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(accelerometer != null)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type != Sensor.TYPE_ACCELEROMETER) return

        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]

        // Calculate acceleration magnitude (removing gravity)
        val deltaX = abs(x - lastValues[0])
        val deltaY = abs(y - lastValues[1])
        val deltaZ = abs(z - lastValues[2])

        lastValues[0] = x
        lastValues[1] = y
        lastValues[2] = z

        // Calculate total acceleration change
        val acceleration = sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ)

        // Check if this is a tap (sharp acceleration spike)
        if (acceleration > TAP_THRESHOLD) {
            val now = System.currentTimeMillis()

            // Ignore if too soon after last tap (debounce)
            if (now - lastTapTime < TAP_COOLDOWN) {
                return
            }

            // Check if this is the second tap of a double-tap
            if (now - lastTapTime < DOUBLE_TAP_WINDOW && tapCount == 1) {
                Log.d(TAG, "Double-tap detected! Acceleration: $acceleration")
                onDoubleTapDetected()
                tapCount = 0
                lastTapTime = 0
            } else {
                // First tap
                tapCount = 1
                lastTapTime = now
                Log.d(TAG, "Single tap detected, waiting for second... Acceleration: $acceleration")
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not needed
    }

    private fun onDoubleTapDetected() {
        // Vibrate feedback
        vibrateConfirmation()

        // Send event to React Native
        val params = Arguments.createMap().apply {
            putString("type", "double_tap_back")
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }
        sendEvent("onAssistantTrigger", params)

        // Launch voice assistant mode
        launchVoiceAssistant()
    }

    private fun vibrateConfirmation() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = reactApplicationContext
                    .getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                val vibrator = vibratorManager.defaultVibrator
                vibrator.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                val vibrator = reactApplicationContext
                    .getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(50)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Vibration failed: ${e.message}")
        }
    }

    private fun launchVoiceAssistant() {
        try {
            val intent = Intent(reactApplicationContext, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("mode", "voice_assistant")
                putExtra("trigger", "double_tap_back")
                putExtra("auto_listen", true)
            }
            reactApplicationContext.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch voice assistant: ${e.message}")
        }
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

    override fun onCatalystInstanceDestroy() {
        stop()
        super.onCatalystInstanceDestroy()
    }
}
