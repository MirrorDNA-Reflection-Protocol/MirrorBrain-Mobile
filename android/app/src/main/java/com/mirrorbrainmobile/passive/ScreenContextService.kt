package com.mirrorbrainmobile.passive

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Rect
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

/**
 * ScreenContext — Passive Intelligence Layer
 *
 * Accessibility service for "what am I looking at?" context awareness.
 * User must enable in Settings > Accessibility > MirrorBrain Screen Reader.
 */
class ScreenContextService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: ScreenContextService? = null
            private set

        private const val MAX_TEXT_LENGTH = 500
        private const val MAX_NODES = 50
    }

    // Current screen state
    private var currentPackage: String = ""
    private var currentActivity: String = ""
    private var lastWindowChange: Long = 0

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    override fun onServiceConnected() {
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                    AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED

            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                    AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS

            notificationTimeout = 100
        }
        serviceInfo = info
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                currentPackage = event.packageName?.toString() ?: ""
                currentActivity = event.className?.toString() ?: ""
                lastWindowChange = System.currentTimeMillis()
            }
        }
    }

    override fun onInterrupt() {
        // Service interrupted
    }

    /**
     * Get current screen context (called from JS via native module)
     */
    fun getScreenContext(): WritableMap {
        val result = Arguments.createMap()

        result.putString("packageName", currentPackage)
        result.putString("activityName", currentActivity)
        result.putDouble("lastWindowChange", lastWindowChange.toDouble())

        // Extract visible text from screen
        val rootNode = rootInActiveWindow
        if (rootNode != null) {
            val textElements = Arguments.createArray()
            val interactiveElements = Arguments.createArray()

            extractNodeInfo(rootNode, textElements, interactiveElements, 0)

            result.putArray("textElements", textElements)
            result.putArray("interactiveElements", interactiveElements)

            // Build summary text
            val summaryBuilder = StringBuilder()
            for (i in 0 until minOf(textElements.size(), 20)) {
                val element = textElements.getMap(i)
                val text = element?.getString("text") ?: ""
                if (text.isNotBlank()) {
                    summaryBuilder.append(text).append(" ")
                }
            }
            result.putString("summary", summaryBuilder.toString().take(1000))

            rootNode.recycle()
        }

        // Try to identify app name
        try {
            if (currentPackage.isNotEmpty()) {
                val appInfo = packageManager.getApplicationInfo(currentPackage, 0)
                val appName = packageManager.getApplicationLabel(appInfo).toString()
                result.putString("appName", appName)
            }
        } catch (e: Exception) {
            result.putString("appName", currentPackage)
        }

        return result
    }

    /**
     * Recursively extract text and interactive elements from view hierarchy
     */
    private fun extractNodeInfo(
        node: AccessibilityNodeInfo,
        textElements: WritableArray,
        interactiveElements: WritableArray,
        depth: Int
    ) {
        if (depth > 15 || textElements.size() >= MAX_NODES) return

        // Extract text content
        val text = node.text?.toString()?.trim()
        val contentDesc = node.contentDescription?.toString()?.trim()
        val displayText = text ?: contentDesc

        if (!displayText.isNullOrBlank() && displayText.length <= MAX_TEXT_LENGTH) {
            val bounds = Rect()
            node.getBoundsInScreen(bounds)

            val element = Arguments.createMap().apply {
                putString("text", displayText)
                putString("className", node.className?.toString() ?: "")
                putInt("x", bounds.centerX())
                putInt("y", bounds.centerY())
            }
            textElements.pushMap(element)
        }

        // Track interactive elements
        if (node.isClickable || node.isFocusable) {
            val bounds = Rect()
            node.getBoundsInScreen(bounds)

            val element = Arguments.createMap().apply {
                putString("text", displayText ?: "")
                putString("className", node.className?.toString() ?: "")
                putString("viewId", node.viewIdResourceName ?: "")
                putBoolean("isClickable", node.isClickable)
                putBoolean("isEditable", node.isEditable)
                putInt("x", bounds.centerX())
                putInt("y", bounds.centerY())
                putInt("width", bounds.width())
                putInt("height", bounds.height())
            }
            interactiveElements.pushMap(element)
        }

        // Recurse into children
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            extractNodeInfo(child, textElements, interactiveElements, depth + 1)
            child.recycle()
        }
    }

    /**
     * Perform click action at coordinates (for future agentic control)
     */
    fun performClick(x: Int, y: Int): Boolean {
        // This would require GLOBAL_ACTION_* permissions
        // For now, just document the capability
        return false
    }
}
