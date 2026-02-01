package com.mirrorbrainmobile.location

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * GeofenceService — Location-Based Triggers
 *
 * Purpose: Create geofences for location-based actions.
 * Use cases: "Remind me when I get home", "Focus mode at office"
 */
class GeofenceService(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val geofencingClient: GeofencingClient by lazy {
        LocationServices.getGeofencingClient(reactContext)
    }

    private val geofencePendingIntent: PendingIntent by lazy {
        val intent = Intent(reactContext, GeofenceReceiver::class.java)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        PendingIntent.getBroadcast(reactContext, 0, intent, flags)
    }

    // Active geofences
    private val activeGeofences = mutableMapOf<String, GeofenceData>()

    override fun getName(): String = "GeofenceService"

    /**
     * Geofence data class
     */
    data class GeofenceData(
        val id: String,
        val name: String,
        val latitude: Double,
        val longitude: Double,
        val radius: Float,
        val transitionTypes: Int,
        val action: String,
        val actionPayload: String?
    )

    companion object {
        private const val TAG = "GeofenceService"

        // Default radius in meters
        const val DEFAULT_RADIUS = 100f

        // Loitering delay (5 minutes)
        const val LOITERING_DELAY_MS = 5 * 60 * 1000

        @Volatile
        var instance: GeofenceService? = null
            private set
    }

    init {
        instance = this
    }

    /**
     * Check if location permissions are granted
     */
    @ReactMethod
    fun hasLocationPermission(promise: Promise) {
        val fineLocation = ActivityCompat.checkSelfPermission(
            reactContext,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED

        val backgroundLocation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ActivityCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        val result = Arguments.createMap().apply {
            putBoolean("fineLocation", fineLocation)
            putBoolean("backgroundLocation", backgroundLocation)
            putBoolean("ready", fineLocation && backgroundLocation)
        }
        promise.resolve(result)
    }

    /**
     * Add a geofence
     */
    @ReactMethod
    fun addGeofence(options: ReadableMap, promise: Promise) {
        val id = options.getString("id") ?: run {
            promise.reject("INVALID_OPTIONS", "Geofence ID is required")
            return
        }
        val name = options.getString("name") ?: id
        val latitude = options.getDouble("latitude")
        val longitude = options.getDouble("longitude")
        val radius = if (options.hasKey("radius")) options.getDouble("radius").toFloat() else DEFAULT_RADIUS
        val action = options.getString("action") ?: "notify"
        val actionPayload = if (options.hasKey("actionPayload")) options.getString("actionPayload") else null

        // Transition types
        var transitionTypes = 0
        if (!options.hasKey("onEnter") || options.getBoolean("onEnter")) {
            transitionTypes = transitionTypes or Geofence.GEOFENCE_TRANSITION_ENTER
        }
        if (options.hasKey("onExit") && options.getBoolean("onExit")) {
            transitionTypes = transitionTypes or Geofence.GEOFENCE_TRANSITION_EXIT
        }
        if (options.hasKey("onDwell") && options.getBoolean("onDwell")) {
            transitionTypes = transitionTypes or Geofence.GEOFENCE_TRANSITION_DWELL
        }

        if (transitionTypes == 0) {
            transitionTypes = Geofence.GEOFENCE_TRANSITION_ENTER
        }

        // Check permissions
        if (ActivityCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            promise.reject("PERMISSION_DENIED", "Location permission required")
            return
        }

        // Build geofence
        val geofence = Geofence.Builder()
            .setRequestId(id)
            .setCircularRegion(latitude, longitude, radius)
            .setExpirationDuration(Geofence.NEVER_EXPIRE)
            .setTransitionTypes(transitionTypes)
            .setLoiteringDelay(LOITERING_DELAY_MS)
            .build()

        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofence(geofence)
            .build()

        geofencingClient.addGeofences(request, geofencePendingIntent)
            .addOnSuccessListener {
                // Store geofence data
                activeGeofences[id] = GeofenceData(
                    id = id,
                    name = name,
                    latitude = latitude,
                    longitude = longitude,
                    radius = radius,
                    transitionTypes = transitionTypes,
                    action = action,
                    actionPayload = actionPayload
                )

                android.util.Log.d(TAG, "Geofence added: $id at ($latitude, $longitude)")
                promise.resolve(true)
            }
            .addOnFailureListener { e ->
                android.util.Log.e(TAG, "Failed to add geofence: ${e.message}")
                promise.reject("ADD_FAILED", e.message)
            }
    }

    /**
     * Remove a geofence by ID
     */
    @ReactMethod
    fun removeGeofence(id: String, promise: Promise) {
        geofencingClient.removeGeofences(listOf(id))
            .addOnSuccessListener {
                activeGeofences.remove(id)
                android.util.Log.d(TAG, "Geofence removed: $id")
                promise.resolve(true)
            }
            .addOnFailureListener { e ->
                android.util.Log.e(TAG, "Failed to remove geofence: ${e.message}")
                promise.reject("REMOVE_FAILED", e.message)
            }
    }

    /**
     * Remove all geofences
     */
    @ReactMethod
    fun removeAllGeofences(promise: Promise) {
        geofencingClient.removeGeofences(geofencePendingIntent)
            .addOnSuccessListener {
                activeGeofences.clear()
                android.util.Log.d(TAG, "All geofences removed")
                promise.resolve(true)
            }
            .addOnFailureListener { e ->
                android.util.Log.e(TAG, "Failed to remove all geofences: ${e.message}")
                promise.reject("REMOVE_FAILED", e.message)
            }
    }

    /**
     * Get all active geofences
     */
    @ReactMethod
    fun getActiveGeofences(promise: Promise) {
        val array = Arguments.createArray()
        for ((_, data) in activeGeofences) {
            val map = Arguments.createMap().apply {
                putString("id", data.id)
                putString("name", data.name)
                putDouble("latitude", data.latitude)
                putDouble("longitude", data.longitude)
                putDouble("radius", data.radius.toDouble())
                putString("action", data.action)
                if (data.actionPayload != null) {
                    putString("actionPayload", data.actionPayload)
                }
            }
            array.pushMap(map)
        }
        promise.resolve(array)
    }

    /**
     * Add common locations (home, work)
     */
    @ReactMethod
    fun addNamedLocation(name: String, latitude: Double, longitude: Double, promise: Promise) {
        val options = Arguments.createMap().apply {
            putString("id", "named_${name.lowercase()}")
            putString("name", name)
            putDouble("latitude", latitude)
            putDouble("longitude", longitude)
            putDouble("radius", DEFAULT_RADIUS.toDouble())
            putBoolean("onEnter", true)
            putBoolean("onExit", true)
            putString("action", "named_location")
            putString("actionPayload", name)
        }
        addGeofence(options, promise)
    }

    /**
     * Get geofence data for a triggered event
     */
    fun getGeofenceData(id: String): GeofenceData? {
        return activeGeofences[id]
    }

    /**
     * Emit geofence event to JS
     */
    fun emitGeofenceEvent(eventType: String, geofenceIds: List<String>) {
        val array = Arguments.createArray()
        for (id in geofenceIds) {
            val data = activeGeofences[id]
            if (data != null) {
                val map = Arguments.createMap().apply {
                    putString("id", data.id)
                    putString("name", data.name)
                    putDouble("latitude", data.latitude)
                    putDouble("longitude", data.longitude)
                    putString("action", data.action)
                    if (data.actionPayload != null) {
                        putString("actionPayload", data.actionPayload)
                    }
                }
                array.pushMap(map)
            }
        }

        val params = Arguments.createMap().apply {
            putString("type", eventType) // "enter", "exit", "dwell"
            putArray("geofences", array)
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }

        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onGeofenceEvent", params)
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to emit event: ${e.message}")
        }
    }
}
