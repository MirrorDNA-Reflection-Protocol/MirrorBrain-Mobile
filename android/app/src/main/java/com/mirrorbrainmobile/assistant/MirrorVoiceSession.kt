package com.mirrorbrainmobile.assistant

import android.app.assist.AssistContent
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.mirrorbrainmobile.MainActivity

/**
 * MirrorBrain Voice Interaction Session
 *
 * Handles the actual voice interaction when assistant is triggered.
 * Shows a voice UI overlay and processes voice commands.
 */
class MirrorVoiceSession(context: Context) : VoiceInteractionSession(context) {

    companion object {
        private const val TAG = "MirrorVoiceSession"
    }

    private var screenContext: String? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Voice session created")
    }

    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        Log.d(TAG, "Voice session shown, flags: $showFlags")

        // Launch MirrorBrain in voice mode
        launchVoiceMode()
    }

    override fun onHandleAssist(
        data: Bundle?,
        structure: AssistStructure?,
        content: AssistContent?
    ) {
        super.onHandleAssist(data, structure, content)

        // Extract screen context from assist structure
        if (structure != null) {
            screenContext = extractScreenContext(structure)
            Log.d(TAG, "Screen context: ${screenContext?.take(100)}...")
        }

        // Get any content hints
        if (content != null) {
            val webUri = content.webUri
            val clipData = content.clipData
            Log.d(TAG, "Content URI: $webUri, ClipData: $clipData")
        }
    }

    override fun onHandleAssistSecondary(
        data: Bundle?,
        structure: AssistStructure?,
        content: AssistContent?,
        index: Int,
        count: Int
    ) {
        // Handle multi-window assist data
        super.onHandleAssistSecondary(data, structure, content, index, count)
    }

    override fun onHandleScreenshot(screenshot: Bitmap?) {
        super.onHandleScreenshot(screenshot)
        if (screenshot != null) {
            Log.d(TAG, "Got screenshot: ${screenshot.width}x${screenshot.height}")
            // Could process screenshot for OCR/context
        }
    }

    override fun onHide() {
        super.onHide()
        Log.d(TAG, "Voice session hidden")
    }

    override fun onDestroy() {
        Log.d(TAG, "Voice session destroyed")
        super.onDestroy()
    }

    override fun onCancelRequest(request: Request?) {
        super.onCancelRequest(request)
        Log.d(TAG, "Voice request cancelled")
    }

    /**
     * Launch MirrorBrain app in voice/assistant mode
     */
    private fun launchVoiceMode() {
        try {
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("mode", "voice_assistant")
                putExtra("screen_context", screenContext)
                putExtra("auto_listen", true)
            }
            context.startActivity(intent)

            // Hide the voice interaction UI after launching
            hide()

        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch voice mode: ${e.message}")
        }
    }

    /**
     * Extract text content from the assist structure
     */
    private fun extractScreenContext(structure: AssistStructure): String {
        val builder = StringBuilder()

        for (i in 0 until structure.windowNodeCount) {
            val windowNode = structure.getWindowNodeAt(i)
            val rootNode = windowNode.rootViewNode
            extractTextFromNode(rootNode, builder)
        }

        return builder.toString().take(2000) // Limit context size
    }

    private fun extractTextFromNode(node: AssistStructure.ViewNode?, builder: StringBuilder) {
        if (node == null) return

        // Get text content
        node.text?.let {
            if (it.isNotBlank()) {
                builder.append(it).append(" ")
            }
        }

        // Get content description (for images, buttons, etc.)
        node.contentDescription?.let {
            if (it.isNotBlank()) {
                builder.append("[").append(it).append("] ")
            }
        }

        // Recursively process children
        for (i in 0 until node.childCount) {
            extractTextFromNode(node.getChildAt(i), builder)
        }
    }
}
