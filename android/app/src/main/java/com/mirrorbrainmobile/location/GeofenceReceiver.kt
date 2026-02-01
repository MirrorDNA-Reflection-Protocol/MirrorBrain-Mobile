package com.mirrorbrainmobile.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofenceStatusCodes
import com.google.android.gms.location.GeofencingEvent

/**
 * GeofenceReceiver — Handles Geofence Transition Events
 *
 * Receives geofence enter/exit/dwell events and forwards to GeofenceService.
 */
class GeofenceReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "GeofenceReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val geofencingEvent = GeofencingEvent.fromIntent(intent)

        if (geofencingEvent == null) {
            android.util.Log.e(TAG, "Null geofencing event")
            return
        }

        if (geofencingEvent.hasError()) {
            val errorMessage = GeofenceStatusCodes.getStatusCodeString(geofencingEvent.errorCode)
            android.util.Log.e(TAG, "Geofence error: $errorMessage")
            return
        }

        val transition = geofencingEvent.geofenceTransition
        val triggeringGeofences = geofencingEvent.triggeringGeofences ?: emptyList()

        if (triggeringGeofences.isEmpty()) {
            android.util.Log.w(TAG, "No triggering geofences")
            return
        }

        // Get transition type as string
        val eventType = when (transition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
            Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
            Geofence.GEOFENCE_TRANSITION_DWELL -> "dwell"
            else -> {
                android.util.Log.w(TAG, "Unknown transition type: $transition")
                return
            }
        }

        // Get geofence IDs
        val geofenceIds = triggeringGeofences.map { it.requestId }

        android.util.Log.d(TAG, "Geofence $eventType: ${geofenceIds.joinToString()}")

        // Emit to JS via GeofenceService
        GeofenceService.instance?.emitGeofenceEvent(eventType, geofenceIds)

        // Handle specific actions based on geofence data
        for (geofence in triggeringGeofences) {
            handleGeofenceAction(context, geofence.requestId, eventType)
        }
    }

    /**
     * Handle action associated with a geofence
     */
    private fun handleGeofenceAction(context: Context, geofenceId: String, eventType: String) {
        val geofenceData = GeofenceService.instance?.getGeofenceData(geofenceId) ?: return

        android.util.Log.d(TAG, "Handling action: ${geofenceData.action} for ${geofenceData.name}")

        when (geofenceData.action) {
            "notify" -> {
                // Show a notification
                showNotification(context, geofenceData, eventType)
            }
            "focus_mode" -> {
                // Could trigger focus mode
                if (eventType == "enter") {
                    android.util.Log.d(TAG, "Would enable focus mode for ${geofenceData.name}")
                } else if (eventType == "exit") {
                    android.util.Log.d(TAG, "Would disable focus mode for ${geofenceData.name}")
                }
            }
            "named_location" -> {
                // Named location tracking (home, work)
                android.util.Log.d(TAG, "$eventType: ${geofenceData.actionPayload}")
            }
            "reminder" -> {
                // Location-based reminder
                if (eventType == "enter") {
                    showReminderNotification(context, geofenceData)
                }
            }
        }
    }

    /**
     * Show a simple notification for geofence event
     */
    private fun showNotification(context: Context, geofenceData: GeofenceService.GeofenceData, eventType: String) {
        val title = when (eventType) {
            "enter" -> "Arrived at ${geofenceData.name}"
            "exit" -> "Left ${geofenceData.name}"
            "dwell" -> "At ${geofenceData.name}"
            else -> "Location Update"
        }

        // Use Android's notification builder
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

        val channelId = "geofence_events"
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                channelId,
                "Location Events",
                android.app.NotificationManager.IMPORTANCE_DEFAULT
            )
            notificationManager.createNotificationChannel(channel)
        }

        val notification = android.app.Notification.Builder(context, channelId)
            .setContentTitle(title)
            .setContentText(geofenceData.actionPayload ?: "MirrorBrain location event")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(geofenceData.id.hashCode(), notification)
    }

    /**
     * Show a reminder notification
     */
    private fun showReminderNotification(context: Context, geofenceData: GeofenceService.GeofenceData) {
        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

        val channelId = "geofence_reminders"
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                channelId,
                "Location Reminders",
                android.app.NotificationManager.IMPORTANCE_HIGH
            )
            notificationManager.createNotificationChannel(channel)
        }

        val notification = android.app.Notification.Builder(context, channelId)
            .setContentTitle("📍 Reminder at ${geofenceData.name}")
            .setContentText(geofenceData.actionPayload ?: "You have a reminder here")
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(geofenceData.id.hashCode(), notification)
    }
}
