package com.mirrorbrainmobile.root

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.mirrorbrainmobile.MainActivity
import com.mirrorbrainmobile.R
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * DaemonService — Persistent foreground service wrapper
 *
 * Maintains persistent background execution with:
 * - Foreground notification (required for Android 8+)
 * - Wake lock for CPU-bound operations
 * - Heartbeat monitoring
 * - Restart on crash
 */
class DaemonService : Service() {
    companion object {
        private const val TAG = "DaemonService"
        private const val CHANNEL_ID = "mirrorbrain_daemon"
        private const val NOTIFICATION_ID = 1001
        private const val HEARTBEAT_INTERVAL_MS = 60_000L // 1 minute

        @Volatile
        var instance: DaemonService? = null
            private set

        var isRunning: Boolean = false
            private set

        fun start(context: Context) {
            val intent = Intent(context, DaemonService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, DaemonService::class.java))
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var scheduler: ScheduledExecutorService? = null
    private var heartbeatCount = 0L

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.i(TAG, "DaemonService created")

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())

        acquireWakeLock()
        startHeartbeat()

        isRunning = true
        RootDaemon.onServiceStarted()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "DaemonService onStartCommand")
        return START_STICKY // Restart if killed
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "DaemonService destroyed")

        isRunning = false
        instance = null

        releaseWakeLock()
        stopHeartbeat()

        RootDaemon.onServiceStopped()

        // Schedule restart
        scheduleRestart()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "MirrorBrain Daemon",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps MirrorBrain active in background"
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
            .setContentTitle("MirrorBrain Active")
            .setContentText("Ambient intelligence running")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun updateNotification(text: String) {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MirrorBrain Active")
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "MirrorBrain::DaemonWakeLock"
        ).apply {
            acquire(10 * 60 * 1000L) // 10 minutes max
        }
        Log.d(TAG, "Wake lock acquired")
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "Wake lock released")
            }
        }
        wakeLock = null
    }

    private fun startHeartbeat() {
        scheduler = Executors.newSingleThreadScheduledExecutor()
        scheduler?.scheduleAtFixedRate({
            heartbeatCount++
            Log.d(TAG, "Heartbeat #$heartbeatCount")

            // Refresh wake lock
            wakeLock?.let {
                if (!it.isHeld) {
                    it.acquire(10 * 60 * 1000L)
                }
            }

            // Run daemon tasks
            RootDaemon.onHeartbeat(heartbeatCount)

            // Update notification occasionally
            if (heartbeatCount % 5 == 0L) {
                updateNotification("Active for ${heartbeatCount} minutes")
            }
        }, HEARTBEAT_INTERVAL_MS, HEARTBEAT_INTERVAL_MS, TimeUnit.MILLISECONDS)
    }

    private fun stopHeartbeat() {
        scheduler?.shutdown()
        scheduler = null
    }

    private fun scheduleRestart() {
        // Use AlarmManager to restart service if it dies
        // This will be handled by DaemonBootReceiver
        Log.i(TAG, "Service will be restarted by boot receiver or alarm")
    }
}
