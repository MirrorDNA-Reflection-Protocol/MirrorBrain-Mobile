package com.mirrorbrainmobile.root

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * RootDaemon — Main daemon coordinator with React Native bridge
 *
 * Coordinates:
 * - Root shell access via libsu
 * - Background service lifecycle
 * - Heartbeat events to JS layer
 * - System-level operations
 */
class RootDaemon(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "RootDaemon"

        @Volatile
        private var reactContext: ReactApplicationContext? = null

        /** Called when DaemonService starts */
        fun onServiceStarted() {
            Log.i(TAG, "Daemon service started")
            sendEvent("daemonStarted", Arguments.createMap().apply {
                putBoolean("rootAvailable", RootShellManager.isRootAvailable)
            })
        }

        /** Called when DaemonService stops */
        fun onServiceStopped() {
            Log.i(TAG, "Daemon service stopped")
            sendEvent("daemonStopped", Arguments.createMap())
        }

        /** Called on each heartbeat */
        fun onHeartbeat(count: Long) {
            sendEvent("daemonHeartbeat", Arguments.createMap().apply {
                putDouble("count", count.toDouble())
                putBoolean("rootActive", RootShellManager.isRootActive)
            })
        }

        private fun sendEvent(eventName: String, params: WritableMap) {
            reactContext?.let { ctx ->
                if (ctx.hasActiveReactInstance()) {
                    ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit(eventName, params)
                }
            }
        }
    }

    init {
        Companion.reactContext = reactContext
    }

    override fun getName(): String = "RootDaemon"

    /**
     * Initialize the root shell and daemon
     */
    @ReactMethod
    fun initialize(promise: Promise) {
        try {
            RootShellManager.initialize()
            promise.resolve(Arguments.createMap().apply {
                putBoolean("rootAvailable", RootShellManager.isRootAvailable)
                putBoolean("rootActive", RootShellManager.isRootActive)
            })
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    /**
     * Start the background daemon service
     */
    @ReactMethod
    fun startDaemon(promise: Promise) {
        try {
            reactApplicationContext?.let { context ->
                DaemonService.start(context)
                promise.resolve(true)
            } ?: promise.reject("NO_CONTEXT", "No application context")
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message, e)
        }
    }

    /**
     * Stop the background daemon service
     */
    @ReactMethod
    fun stopDaemon(promise: Promise) {
        try {
            reactApplicationContext?.let { context ->
                DaemonService.stop(context)
                promise.resolve(true)
            } ?: promise.reject("NO_CONTEXT", "No application context")
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    /**
     * Check if daemon is running
     */
    @ReactMethod
    fun isDaemonRunning(promise: Promise) {
        promise.resolve(DaemonService.isRunning)
    }

    /**
     * Check if root is available
     */
    @ReactMethod
    fun isRootAvailable(promise: Promise) {
        promise.resolve(RootShellManager.isRootAvailable)
    }

    /**
     * Execute a root command
     */
    @ReactMethod
    fun executeRoot(command: String, promise: Promise) {
        try {
            if (!RootShellManager.isRootAvailable) {
                promise.reject("NO_ROOT", "Root access not available")
                return
            }

            val result = RootShellManager.execute(command)
            promise.resolve(Arguments.createMap().apply {
                putBoolean("success", result.success)
                putString("output", result.output)
                putString("error", result.error)
                putInt("exitCode", result.exitCode)
            })
        } catch (e: Exception) {
            promise.reject("EXEC_ERROR", e.message, e)
        }
    }

    /**
     * Read a file with root access
     */
    @ReactMethod
    fun readFileRoot(path: String, promise: Promise) {
        try {
            val content = RootShellManager.readFile(path)
            if (content != null) {
                promise.resolve(content)
            } else {
                promise.reject("READ_ERROR", "Failed to read file: $path")
            }
        } catch (e: Exception) {
            promise.reject("READ_ERROR", e.message, e)
        }
    }

    /**
     * Write a file with root access
     */
    @ReactMethod
    fun writeFileRoot(path: String, content: String, promise: Promise) {
        try {
            val success = RootShellManager.writeFile(path, content)
            promise.resolve(success)
        } catch (e: Exception) {
            promise.reject("WRITE_ERROR", e.message, e)
        }
    }

    /**
     * Get running processes
     */
    @ReactMethod
    fun getProcesses(promise: Promise) {
        try {
            val processes = RootShellManager.getProcessList()
            val array = Arguments.createArray()
            processes.forEach { proc ->
                array.pushMap(Arguments.createMap().apply {
                    putInt("pid", proc.pid)
                    putString("user", proc.user)
                    putString("name", proc.name)
                })
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("PROC_ERROR", e.message, e)
        }
    }

    /**
     * Set auto-start preference
     */
    @ReactMethod
    fun setAutoStart(enabled: Boolean, promise: Promise) {
        try {
            reactApplicationContext?.let { context ->
                val prefs = context.getSharedPreferences("mirrorbrain_daemon", Context.MODE_PRIVATE)
                prefs.edit().putBoolean("auto_start", enabled).apply()
                promise.resolve(true)
            } ?: promise.reject("NO_CONTEXT", "No application context")
        } catch (e: Exception) {
            promise.reject("PREF_ERROR", e.message, e)
        }
    }

    /**
     * Get daemon status
     */
    @ReactMethod
    fun getStatus(promise: Promise) {
        promise.resolve(Arguments.createMap().apply {
            putBoolean("daemonRunning", DaemonService.isRunning)
            putBoolean("rootAvailable", RootShellManager.isRootAvailable)
            putBoolean("rootActive", RootShellManager.isRootActive)
        })
    }

    /**
     * Required for RN event emitter
     */
    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for RN event emitter
    }
}
