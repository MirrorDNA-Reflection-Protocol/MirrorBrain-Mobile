package com.mirrorbrainmobile.capture

import android.content.ContentResolver
import android.content.Context
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

/**
 * ScreenshotObserver — Detect Screenshots
 *
 * Uses ContentObserver on MediaStore to detect new screenshots.
 * Sends path to JS for OCR processing.
 */
class ScreenshotObserver(
    private val context: ReactApplicationContext,
    private val onScreenshot: ((String) -> Unit)? = null
) {
    private var contentObserver: ContentObserver? = null
    private var fileObserver: FileObserver? = null
    private val handler = Handler(Looper.getMainLooper())
    private val processedPaths = mutableSetOf<String>()
    private var lastProcessedTime = 0L

    // Common screenshot directories
    private val screenshotDirs = listOf(
        "${Environment.getExternalStorageDirectory()}/Pictures/Screenshots",
        "${Environment.getExternalStorageDirectory()}/DCIM/Screenshots",
        "${Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES)}/Screenshots",
    )

    companion object {
        private const val TAG = "ScreenshotObserver"
        private const val DEBOUNCE_MS = 1000L // Ignore duplicates within 1 second
        private val SCREENSHOT_KEYWORDS = listOf("screenshot", "screen_shot", "screen-shot", "capture")
    }

    /**
     * Start observing for screenshots
     */
    fun start() {
        startContentObserver()
        startFileObserver()
        android.util.Log.d(TAG, "Started screenshot observation")
    }

    /**
     * Stop observing
     */
    fun stop() {
        contentObserver?.let {
            context.contentResolver.unregisterContentObserver(it)
        }
        contentObserver = null

        fileObserver?.stopWatching()
        fileObserver = null

        android.util.Log.d(TAG, "Stopped screenshot observation")
    }

    /**
     * Use ContentObserver on MediaStore (preferred method)
     */
    private fun startContentObserver() {
        contentObserver = object : ContentObserver(handler) {
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                uri?.let { handleMediaChange(it) }
            }
        }

        // Observe external images
        context.contentResolver.registerContentObserver(
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            true,
            contentObserver!!
        )
    }

    /**
     * Handle media store change
     */
    private fun handleMediaChange(uri: Uri) {
        try {
            val projection = arrayOf(
                MediaStore.Images.Media.DATA,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.DISPLAY_NAME
            )

            context.contentResolver.query(
                uri,
                projection,
                null,
                null,
                "${MediaStore.Images.Media.DATE_ADDED} DESC"
            )?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val pathIndex = cursor.getColumnIndex(MediaStore.Images.Media.DATA)
                    val nameIndex = cursor.getColumnIndex(MediaStore.Images.Media.DISPLAY_NAME)

                    if (pathIndex >= 0) {
                        val path = cursor.getString(pathIndex)
                        val name = if (nameIndex >= 0) cursor.getString(nameIndex) else ""

                        if (isScreenshot(path, name)) {
                            processScreenshot(path)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Error querying media: ${e.message}")
        }
    }

    /**
     * Fallback: Use FileObserver on screenshot directories
     */
    private fun startFileObserver() {
        val existingDir = screenshotDirs.firstOrNull { File(it).exists() } ?: return

        fileObserver = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            object : FileObserver(File(existingDir), CREATE or MOVED_TO) {
                override fun onEvent(event: Int, path: String?) {
                    path?.let {
                        val fullPath = "$existingDir/$it"
                        if (isScreenshot(fullPath, it)) {
                            // Delay to ensure file is fully written
                            handler.postDelayed({
                                processScreenshot(fullPath)
                            }, 500)
                        }
                    }
                }
            }
        } else {
            @Suppress("DEPRECATION")
            object : FileObserver(existingDir, CREATE or MOVED_TO) {
                override fun onEvent(event: Int, path: String?) {
                    path?.let {
                        val fullPath = "$existingDir/$it"
                        if (isScreenshot(fullPath, it)) {
                            handler.postDelayed({
                                processScreenshot(fullPath)
                            }, 500)
                        }
                    }
                }
            }
        }

        fileObserver?.startWatching()
    }

    /**
     * Check if a file is likely a screenshot
     */
    private fun isScreenshot(path: String, name: String): Boolean {
        val pathLower = path.lowercase()
        val nameLower = name.lowercase()

        // Check path/name for screenshot keywords
        for (keyword in SCREENSHOT_KEYWORDS) {
            if (pathLower.contains(keyword) || nameLower.contains(keyword)) {
                return true
            }
        }

        // Check if in a screenshot directory
        for (dir in screenshotDirs) {
            if (pathLower.startsWith(dir.lowercase())) {
                return true
            }
        }

        return false
    }

    /**
     * Process a detected screenshot
     */
    private fun processScreenshot(path: String) {
        val now = System.currentTimeMillis()

        // Debounce: ignore if processed recently
        if (now - lastProcessedTime < DEBOUNCE_MS) {
            return
        }

        // Skip if already processed
        if (processedPaths.contains(path)) {
            return
        }

        // Verify file exists and is readable
        val file = File(path)
        if (!file.exists() || !file.canRead()) {
            android.util.Log.w(TAG, "Screenshot file not accessible: $path")
            return
        }

        // Track as processed
        processedPaths.add(path)
        lastProcessedTime = now

        // Limit cache size
        if (processedPaths.size > 50) {
            processedPaths.clear()
        }

        android.util.Log.d(TAG, "Screenshot detected: $path")

        // Callback if set
        onScreenshot?.invoke(path)

        // Send event to JS
        sendScreenshotEvent(path, file.name, file.length())
    }

    /**
     * Send screenshot event to React Native
     */
    private fun sendScreenshotEvent(path: String, filename: String, size: Long) {
        val params = Arguments.createMap().apply {
            putString("path", path)
            putString("filename", filename)
            putDouble("size", size.toDouble())
            putDouble("timestamp", System.currentTimeMillis().toDouble())
        }

        try {
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("onScreenshotCaptured", params)
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to send event: ${e.message}")
        }
    }
}
