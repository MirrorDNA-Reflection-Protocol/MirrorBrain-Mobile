package com.mirrorbrainmobile.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import android.widget.RemoteViews
import com.mirrorbrainmobile.MainActivity
import com.mirrorbrainmobile.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * MirrorBrainWidgetProvider — Home screen widget
 *
 * Provides glanceable status and quick actions:
 * - Current status/greeting
 * - Upcoming events
 * - Quick capture button
 * - Pending items count
 */
class MirrorBrainWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val TAG = "MirrorBrainWidget"

        const val ACTION_QUICK_CAPTURE = "com.mirrorbrainmobile.widget.QUICK_CAPTURE"
        const val ACTION_REFRESH = "com.mirrorbrainmobile.widget.REFRESH"
        const val ACTION_OPEN_APP = "com.mirrorbrainmobile.widget.OPEN_APP"

        /**
         * Trigger widget update from JS layer
         */
        fun updateWidget(context: Context) {
            val intent = Intent(context, MirrorBrainWidgetProvider::class.java).apply {
                action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                val widgetManager = AppWidgetManager.getInstance(context)
                val widgetComponent = ComponentName(context, MirrorBrainWidgetProvider::class.java)
                val widgetIds = widgetManager.getAppWidgetIds(widgetComponent)
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds)
            }
            context.sendBroadcast(intent)
        }

        /**
         * Update widget with custom data
         */
        fun updateWidgetData(
            context: Context,
            greeting: String?,
            statusText: String?,
            pendingCount: Int,
            nextEvent: String?
        ) {
            val prefs = context.getSharedPreferences("mirrorbrain_widget", Context.MODE_PRIVATE)
            prefs.edit()
                .putString("greeting", greeting)
                .putString("status", statusText)
                .putInt("pending_count", pendingCount)
                .putString("next_event", nextEvent)
                .putLong("last_update", System.currentTimeMillis())
                .apply()

            updateWidget(context)
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        Log.d(TAG, "onUpdate called for ${appWidgetIds.size} widgets")

        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)

        when (intent.action) {
            ACTION_QUICK_CAPTURE -> {
                Log.d(TAG, "Quick capture action received")
                launchQuickCapture(context)
            }
            ACTION_REFRESH -> {
                Log.d(TAG, "Refresh action received")
                updateWidget(context)
            }
            ACTION_OPEN_APP -> {
                Log.d(TAG, "Open app action received")
                launchMainApp(context)
            }
        }
    }

    override fun onEnabled(context: Context) {
        Log.d(TAG, "Widget enabled")
    }

    override fun onDisabled(context: Context) {
        Log.d(TAG, "Widget disabled")
    }

    private fun updateAppWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        val views = RemoteViews(context.packageName, R.layout.widget_mirror_brain)

        // Load saved data
        val prefs = context.getSharedPreferences("mirrorbrain_widget", Context.MODE_PRIVATE)
        val greeting = prefs.getString("greeting", null) ?: getTimeBasedGreeting()
        val statusText = prefs.getString("status", null) ?: "Ready to help"
        val pendingCount = prefs.getInt("pending_count", 0)
        val nextEvent = prefs.getString("next_event", null)

        // Set text views
        views.setTextViewText(R.id.widget_greeting, greeting)
        views.setTextViewText(R.id.widget_status, statusText)

        // Set pending count
        if (pendingCount > 0) {
            views.setTextViewText(R.id.widget_pending_count, pendingCount.toString())
            views.setViewVisibility(R.id.widget_pending_badge, android.view.View.VISIBLE)
        } else {
            views.setViewVisibility(R.id.widget_pending_badge, android.view.View.GONE)
        }

        // Set next event
        if (!nextEvent.isNullOrEmpty()) {
            views.setTextViewText(R.id.widget_next_event, nextEvent)
            views.setViewVisibility(R.id.widget_next_event, android.view.View.VISIBLE)
        } else {
            views.setViewVisibility(R.id.widget_next_event, android.view.View.GONE)
        }

        // Set current time
        val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())
        views.setTextViewText(R.id.widget_time, timeFormat.format(Date()))

        // Set click intents
        val openAppIntent = Intent(context, MainActivity::class.java)
        val openAppPending = PendingIntent.getActivity(
            context,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_container, openAppPending)

        // Quick capture button
        val captureIntent = Intent(context, MirrorBrainWidgetProvider::class.java).apply {
            action = ACTION_QUICK_CAPTURE
        }
        val capturePending = PendingIntent.getBroadcast(
            context,
            1,
            captureIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_capture_button, capturePending)

        // Refresh button
        val refreshIntent = Intent(context, MirrorBrainWidgetProvider::class.java).apply {
            action = ACTION_REFRESH
        }
        val refreshPending = PendingIntent.getBroadcast(
            context,
            2,
            refreshIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_refresh_button, refreshPending)

        // Update the widget
        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun getTimeBasedGreeting(): String {
        val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        return when {
            hour < 12 -> "Good morning"
            hour < 17 -> "Good afternoon"
            hour < 21 -> "Good evening"
            else -> "Good night"
        }
    }

    private fun launchQuickCapture(context: Context) {
        try {
            val intent = Intent().apply {
                setClassName(context.packageName, "com.mirrorbrainmobile.capture.QuickCaptureActivity")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch quick capture", e)
            // Fallback to main app
            launchMainApp(context)
        }
    }

    private fun launchMainApp(context: Context) {
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
