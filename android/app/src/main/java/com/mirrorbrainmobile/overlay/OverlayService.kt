package com.mirrorbrainmobile.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mirrorbrainmobile.MainActivity
import com.mirrorbrainmobile.R

/**
 * OverlayService — Floating bubble overlay management
 *
 * Manages the floating bubble and expanded panel overlays:
 * - Shows/hides floating bubble
 * - Expands to full panel on tap
 * - Handles queries and quick actions
 */
class OverlayService : Service() {

    companion object {
        private const val TAG = "OverlayService"
        private const val CHANNEL_ID = "mirrorbrain_overlay"
        private const val NOTIFICATION_ID = 1003

        @Volatile
        var instance: OverlayService? = null
            private set

        var isRunning: Boolean = false
            private set

        @Volatile
        private var reactContext: ReactApplicationContext? = null

        fun setReactContext(context: ReactApplicationContext?) {
            reactContext = context
        }

        fun start(context: Context) {
            if (!canDrawOverlays(context)) {
                Log.w(TAG, "Overlay permission not granted")
                requestOverlayPermission(context)
                return
            }

            val intent = Intent(context, OverlayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, OverlayService::class.java))
        }

        fun canDrawOverlays(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true
            }
        }

        fun requestOverlayPermission(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${context.packageName}")
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
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

    private var windowManager: WindowManager? = null
    private var bubbleView: FloatingBubbleView? = null
    private var panelView: ExpandedPanelView? = null
    private var isPanelExpanded = false

    override fun onCreate() {
        super.onCreate()
        instance = this
        Log.i(TAG, "OverlayService created")

        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())

        showBubble()
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "OverlayService onStartCommand")
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "OverlayService destroyed")

        isRunning = false
        instance = null
        hideBubble()
        hidePanel()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Floating Overlay",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "MirrorBrain floating bubble"
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
            .setContentTitle("MirrorBrain")
            .setContentText("Floating assistant active")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun showBubble() {
        if (bubbleView != null) return

        bubbleView = FloatingBubbleView(
            context = this,
            windowManager = windowManager!!,
            onTap = { togglePanel() },
            onDismiss = { /* Optional: dismiss behavior */ }
        )

        try {
            windowManager?.addView(bubbleView, bubbleView?.layoutParams)
            Log.i(TAG, "Bubble shown")

            sendEvent("overlayBubbleShown", Arguments.createMap())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show bubble", e)
        }
    }

    private fun hideBubble() {
        bubbleView?.let { view ->
            try {
                windowManager?.removeView(view)
                Log.i(TAG, "Bubble hidden")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to hide bubble", e)
            }
        }
        bubbleView = null
    }

    private fun togglePanel() {
        if (isPanelExpanded) {
            hidePanel()
        } else {
            showPanel()
        }
    }

    private fun showPanel() {
        if (panelView != null) return

        panelView = ExpandedPanelView(
            context = this,
            windowManager = windowManager!!,
            onQuery = { query -> handleQuery(query) },
            onClose = { hidePanel() },
            onQuickAction = { action -> handleQuickAction(action) }
        )

        try {
            windowManager?.addView(panelView, panelView?.layoutParams)
            isPanelExpanded = true
            Log.i(TAG, "Panel shown")

            // Focus the input field
            panelView?.focusInput()

            sendEvent("overlayPanelExpanded", Arguments.createMap())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show panel", e)
        }
    }

    private fun hidePanel() {
        panelView?.let { view ->
            try {
                windowManager?.removeView(view)
                Log.i(TAG, "Panel hidden")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to hide panel", e)
            }
        }
        panelView = null
        isPanelExpanded = false

        sendEvent("overlayPanelCollapsed", Arguments.createMap())
    }

    private fun handleQuery(query: String) {
        Log.i(TAG, "Query received: $query")
        panelView?.setLoading(true)

        // Send to JS for processing
        sendEvent("overlayQuery", Arguments.createMap().apply {
            putString("query", query)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        })
    }

    private fun handleQuickAction(action: String) {
        Log.i(TAG, "Quick action: $action")

        sendEvent("overlayQuickAction", Arguments.createMap().apply {
            putString("action", action)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        })

        // Close panel after quick action
        hidePanel()
    }

    /**
     * Set response text from JS
     */
    fun setResponse(text: String) {
        panelView?.setResponse(text)
    }

    /**
     * Show pulse animation on bubble
     */
    fun setPulse(enabled: Boolean) {
        bubbleView?.setPulseAnimation(enabled)
    }

    /**
     * Move bubble to position
     */
    fun moveBubble(x: Int, y: Int) {
        bubbleView?.updatePosition(x, y)
    }
}
