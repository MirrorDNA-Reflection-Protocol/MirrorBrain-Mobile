package com.mirrorbrainmobile.share

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import com.mirrorbrainmobile.MainActivity
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * Share Receiver Activity
 *
 * Receives content shared from other apps via the system share menu.
 * Supports: Text, URLs, Images, Files
 *
 * Processing:
 * - Text/URLs: Send directly to AI for analysis
 * - Images: Send to vision model for description
 * - Files: Extract text if possible, summarize
 */
class ShareReceiverActivity : Activity() {

    companion object {
        private const val TAG = "ShareReceiver"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "Share receiver started")

        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.let { handleIntent(it) }
    }

    private fun handleIntent(intent: Intent) {
        when (intent.action) {
            Intent.ACTION_SEND -> handleSend(intent)
            Intent.ACTION_SEND_MULTIPLE -> handleSendMultiple(intent)
            else -> {
                Log.w(TAG, "Unknown action: ${intent.action}")
                finishWithError("Unsupported share action")
            }
        }
    }

    private fun handleSend(intent: Intent) {
        val type = intent.type ?: ""
        Log.d(TAG, "Handling SEND with type: $type")

        when {
            type.startsWith("text/") -> handleText(intent)
            type.startsWith("image/") -> handleImage(intent)
            else -> handleGenericFile(intent)
        }
    }

    private fun handleSendMultiple(intent: Intent) {
        val type = intent.type ?: ""
        Log.d(TAG, "Handling SEND_MULTIPLE with type: $type")

        when {
            type.startsWith("image/") -> handleMultipleImages(intent)
            else -> handleMultipleFiles(intent)
        }
    }

    private fun handleText(intent: Intent) {
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)

        if (text.isNullOrBlank()) {
            finishWithError("No text content received")
            return
        }

        Log.d(TAG, "Received text: ${text.take(100)}...")

        // Build the query
        val query = buildString {
            if (!subject.isNullOrBlank()) {
                append("Subject: $subject\n\n")
            }
            append(text)
        }

        // Check if it's a URL
        val isUrl = text.trim().matches(Regex("^https?://.*"))
        val mode = if (isUrl) "analyze_url" else "analyze_text"

        launchMirrorBrain(mode, query)
    }

    private fun handleImage(intent: Intent) {
        val imageUri = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(Intent.EXTRA_STREAM)
        }

        if (imageUri == null) {
            finishWithError("No image received")
            return
        }

        Log.d(TAG, "Received image: $imageUri")

        launchMirrorBrain("analyze_image", imageUri.toString())
    }

    private fun handleMultipleImages(intent: Intent) {
        val imageUris = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
        }

        if (imageUris.isNullOrEmpty()) {
            finishWithError("No images received")
            return
        }

        Log.d(TAG, "Received ${imageUris.size} images")

        // For now, just handle the first image
        // TODO: Handle multiple images with gallery view
        launchMirrorBrain("analyze_image", imageUris.first().toString())
    }

    private fun handleGenericFile(intent: Intent) {
        val fileUri = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(Intent.EXTRA_STREAM)
        }

        if (fileUri == null) {
            // Try to get text content as fallback
            val text = intent.getStringExtra(Intent.EXTRA_TEXT)
            if (!text.isNullOrBlank()) {
                handleText(intent)
                return
            }
            finishWithError("No content received")
            return
        }

        Log.d(TAG, "Received file: $fileUri")

        // Try to read text content from file
        try {
            val inputStream = contentResolver.openInputStream(fileUri)
            val reader = BufferedReader(InputStreamReader(inputStream))
            val content = reader.readText().take(10000) // Limit to 10k chars
            reader.close()

            if (content.isNotBlank()) {
                launchMirrorBrain("analyze_text", content)
            } else {
                launchMirrorBrain("analyze_file", fileUri.toString())
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read file: ${e.message}")
            launchMirrorBrain("analyze_file", fileUri.toString())
        }
    }

    private fun handleMultipleFiles(intent: Intent) {
        // For now, show a toast that we only handle one file at a time
        Toast.makeText(this, "Processing first file only", Toast.LENGTH_SHORT).show()

        val fileUris = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
        }

        if (!fileUris.isNullOrEmpty()) {
            val singleIntent = Intent(intent).apply {
                action = Intent.ACTION_SEND
                putExtra(Intent.EXTRA_STREAM, fileUris.first())
            }
            handleGenericFile(singleIntent)
        } else {
            finishWithError("No files received")
        }
    }

    private fun launchMirrorBrain(mode: String, content: String) {
        Log.d(TAG, "Launching MirrorBrain with mode: $mode")

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("mode", "share_receiver")
            putExtra("share_mode", mode)
            putExtra("share_content", content)
            putExtra("auto_process", true)
        }

        startActivity(intent)

        // Show feedback
        Toast.makeText(this, "Processing with MirrorBrain...", Toast.LENGTH_SHORT).show()

        finish()
    }

    private fun finishWithError(message: String) {
        Log.e(TAG, "Error: $message")
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
        finish()
    }
}
