package com.mirrorbrainmobile.root

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * DaemonBootReceiver — Starts daemon on device boot
 *
 * Listens for BOOT_COMPLETED broadcast to restart the daemon service
 * after device reboot.
 */
class DaemonBootReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "DaemonBootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON" -> {
                Log.i(TAG, "Boot completed, starting daemon service")
                startDaemonService(context)
            }
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                Log.i(TAG, "Package updated, restarting daemon service")
                startDaemonService(context)
            }
        }
    }

    private fun startDaemonService(context: Context) {
        try {
            // Check if daemon should auto-start (user preference)
            val prefs = context.getSharedPreferences("mirrorbrain_daemon", Context.MODE_PRIVATE)
            val autoStart = prefs.getBoolean("auto_start", true)

            if (autoStart) {
                DaemonService.start(context)
                Log.i(TAG, "Daemon service started")
            } else {
                Log.i(TAG, "Auto-start disabled, skipping daemon")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start daemon service", e)
        }
    }
}
