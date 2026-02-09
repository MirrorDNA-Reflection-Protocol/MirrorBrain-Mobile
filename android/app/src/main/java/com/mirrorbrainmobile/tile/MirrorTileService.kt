package com.mirrorbrainmobile.tile

import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log
import com.mirrorbrainmobile.MainActivity
import com.mirrorbrainmobile.R

/**
 * MirrorBrain Quick Settings Tile
 *
 * Provides one-tap access to MirrorBrain assistant from the notification shade.
 * Works from lock screen if device policy allows.
 *
 * Long-press tile → Opens app settings
 * Tap tile → Opens voice assistant mode
 */
class MirrorTileService : TileService() {

    companion object {
        private const val TAG = "MirrorTileService"
    }

    override fun onStartListening() {
        super.onStartListening()
        Log.d(TAG, "Tile started listening")
        updateTile()
    }

    override fun onStopListening() {
        super.onStopListening()
        Log.d(TAG, "Tile stopped listening")
    }

    override fun onClick() {
        super.onClick()
        Log.d(TAG, "Tile clicked")

        // Launch MirrorBrain in voice assistant mode
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("mode", "voice_assistant")
            putExtra("trigger", "quick_settings_tile")
            putExtra("auto_listen", true)
        }

        // Collapse the notification shade and start activity
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(
                android.app.PendingIntent.getActivity(
                    this, 0, intent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                )
            )
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }

        // Update tile state
        updateTile()
    }

    override fun onTileAdded() {
        super.onTileAdded()
        Log.d(TAG, "Tile added to Quick Settings")
        updateTile()
    }

    override fun onTileRemoved() {
        super.onTileRemoved()
        Log.d(TAG, "Tile removed from Quick Settings")
    }

    private fun updateTile() {
        qsTile?.let { tile ->
            tile.state = Tile.STATE_INACTIVE  // Always ready to activate
            tile.label = "MirrorBrain"
            tile.subtitle = "Ask anything"

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                tile.icon = Icon.createWithResource(this, R.mipmap.ic_launcher)
            }

            tile.updateTile()
        }
    }
}
