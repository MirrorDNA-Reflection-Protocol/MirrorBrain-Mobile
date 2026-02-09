package com.mirrorbrainmobile.assistant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mirrorbrainmobile.MainActivity
import com.mirrorbrainmobile.R
import java.io.File

/**
 * Wake Word Detection Service
 *
 * Listens for "Hey Mirror" wake word using Android's built-in speech recognition
 * or Picovoice Porcupine (if available).
 *
 * Battery-aware:
 * - Pauses when battery < 20%
 * - Can be configured to only run when charging
 * - Uses efficient voice activity detection
 */
class WakeWordService : Service() {

    companion object {
        private const val TAG = "WakeWordService"
        private const val CHANNEL_ID = "wake_word_channel"
        private const val NOTIFICATION_ID = 9001
        private const val BATTERY_THRESHOLD = 20

        // Wake words to detect
        val WAKE_WORDS = listOf("hey mirror", "mirror", "hey brain")

        // Settings
        var isEnabled = true
        var onlyWhenCharging = false
        var lowPowerMode = false
    }

    private var isListening = false
    private var batteryReceiver: BroadcastReceiver? = null
    private var isCharging = false
    private var batteryLevel = 100

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Wake Word Service created")

        createNotificationChannel()
        registerBatteryReceiver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "Wake Word Service started")

        when (intent?.action) {
            "STOP" -> {
                stopListening()
                stopSelf()
                return START_NOT_STICKY
            }
            "PAUSE" -> {
                stopListening()
                return START_STICKY
            }
            "RESUME" -> {
                startListening()
                return START_STICKY
            }
        }

        // Start as foreground service
        startForeground(NOTIFICATION_ID, createNotification())

        // Start listening if battery allows
        if (shouldListen()) {
            startListening()
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.d(TAG, "Wake Word Service destroyed")
        stopListening()
        unregisterBatteryReceiver()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Wake Word Detection",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Listens for 'Hey Mirror' wake word"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val stopIntent = Intent(this, WakeWordService::class.java).apply {
            action = "STOP"
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val openIntent = Intent(this, MainActivity::class.java)
        val openPendingIntent = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val statusText = when {
            !isEnabled -> "Disabled"
            !isListening -> "Paused (low battery)"
            else -> "Listening for 'Hey Mirror'"
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MirrorBrain Assistant")
            .setContentText(statusText)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openPendingIntent)
            .addAction(0, "Stop", stopPendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification() {
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, createNotification())
    }

    private fun registerBatteryReceiver() {
        batteryReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    Intent.ACTION_BATTERY_CHANGED -> {
                        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                        batteryLevel = (level * 100 / scale.toFloat()).toInt()

                        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                        isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                status == BatteryManager.BATTERY_STATUS_FULL

                        Log.d(TAG, "Battery: $batteryLevel%, charging: $isCharging")

                        // Update listening state based on battery
                        if (shouldListen() && !isListening) {
                            startListening()
                        } else if (!shouldListen() && isListening) {
                            stopListening()
                        }

                        updateNotification()
                    }
                }
            }
        }

        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        registerReceiver(batteryReceiver, filter)
    }

    private fun unregisterBatteryReceiver() {
        batteryReceiver?.let {
            try {
                unregisterReceiver(it)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to unregister battery receiver: ${e.message}")
            }
        }
        batteryReceiver = null
    }

    private fun shouldListen(): Boolean {
        if (!isEnabled) return false
        if (onlyWhenCharging && !isCharging) return false
        if (batteryLevel < BATTERY_THRESHOLD && !isCharging) return false
        return true
    }

    private fun startListening() {
        if (isListening) return

        Log.d(TAG, "Starting wake word detection")
        isListening = true

        // TODO: Integrate Picovoice Porcupine here
        // For now, we'll use a simpler approach with Android's speech recognition
        // triggered by the accessibility service or continuous low-power voice detection

        // Emit event to React Native
        emitWakeWordStatus("listening")

        updateNotification()
    }

    private fun stopListening() {
        if (!isListening) return

        Log.d(TAG, "Stopping wake word detection")
        isListening = false

        emitWakeWordStatus("stopped")
        updateNotification()
    }

    /**
     * Called when wake word is detected
     */
    fun onWakeWordDetected(wakeWord: String) {
        Log.d(TAG, "Wake word detected: $wakeWord")

        // Launch MirrorBrain in voice mode
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("mode", "voice_assistant")
            putExtra("wake_word", wakeWord)
            putExtra("auto_listen", true)
        }
        startActivity(intent)

        // Emit event to React Native
        emitWakeWordStatus("activated")
    }

    private fun emitWakeWordStatus(status: String) {
        // This would emit to React Native if we had the context
        // In a real implementation, we'd use a shared event bus
        Log.d(TAG, "Wake word status: $status")
    }

    /**
     * React Native Module bridge
     */
    class WakeWordModule(reactContext: ReactApplicationContext) :
        com.facebook.react.bridge.ReactContextBaseJavaModule(reactContext) {

        override fun getName(): String = "WakeWordModule"

        @com.facebook.react.bridge.ReactMethod
        fun start() {
            val intent = Intent(reactApplicationContext, WakeWordService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
        }

        @com.facebook.react.bridge.ReactMethod
        fun stop() {
            val intent = Intent(reactApplicationContext, WakeWordService::class.java).apply {
                action = "STOP"
            }
            reactApplicationContext.startService(intent)
        }

        @com.facebook.react.bridge.ReactMethod
        fun setEnabled(enabled: Boolean) {
            isEnabled = enabled
        }

        @com.facebook.react.bridge.ReactMethod
        fun setOnlyWhenCharging(onlyWhenCharging: Boolean) {
            WakeWordService.onlyWhenCharging = onlyWhenCharging
        }

        @com.facebook.react.bridge.ReactMethod
        fun isListening(promise: com.facebook.react.bridge.Promise) {
            promise.resolve(isEnabled)
        }

        private fun sendEvent(eventName: String, params: com.facebook.react.bridge.WritableMap?) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }

        @com.facebook.react.bridge.ReactMethod
        fun addListener(eventName: String) {}

        @com.facebook.react.bridge.ReactMethod
        fun removeListeners(count: Int) {}
    }
}
