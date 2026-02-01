package com.mirrorbrainmobile.gesture

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.util.Log
import kotlin.math.sqrt

/**
 * ShakeDetector — Accelerometer-based shake detection
 *
 * Detects device shake gestures using the accelerometer sensor.
 * Configurable sensitivity and cooldown period.
 */
class ShakeDetector(
    private val context: Context,
    private val onShake: () -> Unit
) : SensorEventListener {

    companion object {
        private const val TAG = "ShakeDetector"

        // Shake detection thresholds
        private const val SHAKE_THRESHOLD_GRAVITY = 2.5f
        private const val SHAKE_SLOP_TIME_MS = 500L
        private const val SHAKE_COUNT_RESET_TIME_MS = 2000L
        private const val REQUIRED_SHAKE_COUNT = 2
    }

    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    private var isRegistered = false

    private var shakeTimestamp: Long = 0
    private var shakeCount = 0

    // Configuration
    var sensitivity: Float = SHAKE_THRESHOLD_GRAVITY
    var cooldownMs: Long = SHAKE_SLOP_TIME_MS
    var enabled: Boolean = true

    /**
     * Start listening for shake gestures
     */
    fun start(): Boolean {
        if (isRegistered) return true

        sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        if (accelerometer == null) {
            Log.w(TAG, "No accelerometer available")
            return false
        }

        val registered = sensorManager?.registerListener(
            this,
            accelerometer,
            SensorManager.SENSOR_DELAY_UI
        ) ?: false

        isRegistered = registered
        Log.i(TAG, "Shake detector started: $registered")
        return registered
    }

    /**
     * Stop listening for shake gestures
     */
    fun stop() {
        if (!isRegistered) return

        sensorManager?.unregisterListener(this)
        isRegistered = false
        Log.i(TAG, "Shake detector stopped")
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!enabled) return
        if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return

        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]

        // Calculate acceleration magnitude (excluding gravity)
        val gX = x / SensorManager.GRAVITY_EARTH
        val gY = y / SensorManager.GRAVITY_EARTH
        val gZ = z / SensorManager.GRAVITY_EARTH

        // Total force including gravity is ~1 when stationary
        // We want to detect sudden movements
        val gForce = sqrt(gX * gX + gY * gY + gZ * gZ)

        if (gForce > sensitivity) {
            val now = System.currentTimeMillis()

            // Reset if too much time passed since last shake
            if (shakeTimestamp + SHAKE_COUNT_RESET_TIME_MS < now) {
                shakeCount = 0
            }

            // Ignore if within cooldown
            if (shakeTimestamp + cooldownMs > now) {
                return
            }

            shakeTimestamp = now
            shakeCount++

            Log.d(TAG, "Shake detected! Count: $shakeCount, gForce: $gForce")

            // Trigger callback after required shakes
            if (shakeCount >= REQUIRED_SHAKE_COUNT) {
                shakeCount = 0
                Log.i(TAG, "Shake gesture triggered!")
                onShake()
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not needed for shake detection
    }
}
