package com.mirrorbrainmobile.automation

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.view.accessibility.AccessibilityNodeInfo
import com.mirrorbrainmobile.passive.ScreenContextService
import kotlinx.coroutines.delay

/**
 * AccessibilityActionExecutor — Cross-App Action Execution
 *
 * Purpose: Execute actions in other apps via accessibility service.
 * Used for automation like sending messages, clicking buttons, etc.
 */
object AccessibilityActionExecutor {
    private const val TAG = "AccessibilityActionExecutor"

    /**
     * Action execution result
     */
    data class ActionResult(
        val success: Boolean,
        val message: String,
        val data: Map<String, Any>? = null
    )

    /**
     * Click on a node with the given text
     */
    suspend fun clickByText(text: String, exact: Boolean = false): ActionResult {
        val service = ScreenContextService.instance
            ?: return ActionResult(false, "Accessibility service not running")

        val root = service.rootInActiveWindow
            ?: return ActionResult(false, "No active window")

        try {
            val node = findNodeByText(root, text, exact)
            if (node != null) {
                val result = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                node.recycle()
                return if (result) {
                    ActionResult(true, "Clicked on '$text'")
                } else {
                    ActionResult(false, "Click action failed")
                }
            }
            return ActionResult(false, "Element with text '$text' not found")
        } finally {
            root.recycle()
        }
    }

    /**
     * Click on a node with the given view ID
     */
    suspend fun clickById(viewId: String): ActionResult {
        val service = ScreenContextService.instance
            ?: return ActionResult(false, "Accessibility service not running")

        val root = service.rootInActiveWindow
            ?: return ActionResult(false, "No active window")

        try {
            val nodes = root.findAccessibilityNodeInfosByViewId(viewId)
            if (nodes.isNotEmpty()) {
                val node = nodes[0]
                val result = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                nodes.forEach { it.recycle() }
                return if (result) {
                    ActionResult(true, "Clicked on view '$viewId'")
                } else {
                    ActionResult(false, "Click action failed")
                }
            }
            return ActionResult(false, "View with ID '$viewId' not found")
        } finally {
            root.recycle()
        }
    }

    /**
     * Click at specific coordinates using gesture
     */
    suspend fun clickAtCoordinates(x: Float, y: Float): ActionResult {
        val service = ScreenContextService.instance
            ?: return ActionResult(false, "Accessibility service not running")

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return ActionResult(false, "Gesture actions require Android N or higher")
        }

        val path = Path().apply {
            moveTo(x, y)
        }

        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 100))
            .build()

        var result = false
        service.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                result = true
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                result = false
            }
        }, null)

        // Wait for gesture to complete
        delay(200)

        return if (result) {
            ActionResult(true, "Clicked at ($x, $y)")
        } else {
            ActionResult(false, "Gesture failed")
        }
    }

    /**
     * Set text in an editable field
     */
    suspend fun setText(text: String, fieldHint: String? = null): ActionResult {
        val service = ScreenContextService.instance
            ?: return ActionResult(false, "Accessibility service not running")

        val root = service.rootInActiveWindow
            ?: return ActionResult(false, "No active window")

        try {
            val editNode = if (fieldHint != null) {
                findEditableNodeByHint(root, fieldHint)
            } else {
                findFirstEditableNode(root)
            }

            if (editNode != null) {
                // Focus the field first
                editNode.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                delay(100)

                // Clear existing text
                val clearArgs = Bundle().apply {
                    putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, 0)
                    putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, Int.MAX_VALUE)
                }
                editNode.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, clearArgs)

                // Set new text
                val args = Bundle().apply {
                    putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
                }
                val result = editNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                editNode.recycle()

                return if (result) {
                    ActionResult(true, "Text set successfully")
                } else {
                    ActionResult(false, "Failed to set text")
                }
            }
            return ActionResult(false, "No editable field found")
        } finally {
            root.recycle()
        }
    }

    /**
     * Scroll in a direction
     */
    suspend fun scroll(direction: ScrollDirection): ActionResult {
        val service = ScreenContextService.instance
            ?: return ActionResult(false, "Accessibility service not running")

        val root = service.rootInActiveWindow
            ?: return ActionResult(false, "No active window")

        try {
            val scrollable = findScrollableNode(root)
            if (scrollable != null) {
                val action = when (direction) {
                    ScrollDirection.UP -> AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                    ScrollDirection.DOWN -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                    ScrollDirection.LEFT -> AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                    ScrollDirection.RIGHT -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                }
                val result = scrollable.performAction(action)
                scrollable.recycle()
                return if (result) {
                    ActionResult(true, "Scrolled ${direction.name.lowercase()}")
                } else {
                    ActionResult(false, "Scroll failed")
                }
            }
            return ActionResult(false, "No scrollable element found")
        } finally {
            root.recycle()
        }
    }

    /**
     * Press back button
     */
    fun pressBack(): ActionResult {
        val service = ScreenContextService.instance
            ?: return ActionResult(false, "Accessibility service not running")

        val result = service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
        return if (result) {
            ActionResult(true, "Pressed back")
        } else {
            ActionResult(false, "Back action failed")
        }
    }

    /**
     * Press home button
     */
    fun pressHome(): ActionResult {
        val service = ScreenContextService.instance
            ?: return ActionResult(false, "Accessibility service not running")

        val result = service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
        return if (result) {
            ActionResult(true, "Pressed home")
        } else {
            ActionResult(false, "Home action failed")
        }
    }

    /**
     * Open recent apps
     */
    fun openRecents(): ActionResult {
        val service = ScreenContextService.instance
            ?: return ActionResult(false, "Accessibility service not running")

        val result = service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS)
        return if (result) {
            ActionResult(true, "Opened recents")
        } else {
            ActionResult(false, "Recents action failed")
        }
    }

    /**
     * Open notifications
     */
    fun openNotifications(): ActionResult {
        val service = ScreenContextService.instance
            ?: return ActionResult(false, "Accessibility service not running")

        val result = service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS)
        return if (result) {
            ActionResult(true, "Opened notifications")
        } else {
            ActionResult(false, "Notifications action failed")
        }
    }

    /**
     * Open quick settings
     */
    fun openQuickSettings(): ActionResult {
        val service = ScreenContextService.instance
            ?: return ActionResult(false, "Accessibility service not running")

        val result = service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS)
        return if (result) {
            ActionResult(true, "Opened quick settings")
        } else {
            ActionResult(false, "Quick settings action failed")
        }
    }

    /**
     * Long press on a node with the given text
     */
    suspend fun longPressByText(text: String): ActionResult {
        val service = ScreenContextService.instance
            ?: return ActionResult(false, "Accessibility service not running")

        val root = service.rootInActiveWindow
            ?: return ActionResult(false, "No active window")

        try {
            val node = findNodeByText(root, text, false)
            if (node != null) {
                val result = node.performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK)
                node.recycle()
                return if (result) {
                    ActionResult(true, "Long pressed on '$text'")
                } else {
                    ActionResult(false, "Long press action failed")
                }
            }
            return ActionResult(false, "Element with text '$text' not found")
        } finally {
            root.recycle()
        }
    }

    /**
     * Get all clickable elements on screen
     */
    fun getClickableElements(): List<ClickableElement> {
        val service = ScreenContextService.instance ?: return emptyList()
        val root = service.rootInActiveWindow ?: return emptyList()

        val elements = mutableListOf<ClickableElement>()
        collectClickableElements(root, elements)
        root.recycle()

        return elements
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Helper Methods
    // ─────────────────────────────────────────────────────────────────────────────

    private fun findNodeByText(node: AccessibilityNodeInfo, text: String, exact: Boolean): AccessibilityNodeInfo? {
        val nodeText = node.text?.toString() ?: node.contentDescription?.toString() ?: ""

        val matches = if (exact) {
            nodeText.equals(text, ignoreCase = true)
        } else {
            nodeText.contains(text, ignoreCase = true)
        }

        if (matches && node.isClickable) {
            return AccessibilityNodeInfo.obtain(node)
        }

        // Check if parent is clickable
        if (matches && !node.isClickable) {
            var parent = node.parent
            while (parent != null) {
                if (parent.isClickable) {
                    return parent
                }
                val grandparent = parent.parent
                parent.recycle()
                parent = grandparent
            }
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val result = findNodeByText(child, text, exact)
            if (result != null) {
                child.recycle()
                return result
            }
            child.recycle()
        }

        return null
    }

    private fun findFirstEditableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isEditable) {
            return AccessibilityNodeInfo.obtain(node)
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val result = findFirstEditableNode(child)
            if (result != null) {
                child.recycle()
                return result
            }
            child.recycle()
        }

        return null
    }

    private fun findEditableNodeByHint(node: AccessibilityNodeInfo, hint: String): AccessibilityNodeInfo? {
        val hintText = node.hintText?.toString() ?: ""
        if (node.isEditable && hintText.contains(hint, ignoreCase = true)) {
            return AccessibilityNodeInfo.obtain(node)
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val result = findEditableNodeByHint(child, hint)
            if (result != null) {
                child.recycle()
                return result
            }
            child.recycle()
        }

        return null
    }

    private fun findScrollableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isScrollable) {
            return AccessibilityNodeInfo.obtain(node)
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val result = findScrollableNode(child)
            if (result != null) {
                child.recycle()
                return result
            }
            child.recycle()
        }

        return null
    }

    private fun collectClickableElements(node: AccessibilityNodeInfo, elements: MutableList<ClickableElement>) {
        if (elements.size >= 50) return // Limit

        if (node.isClickable) {
            val bounds = Rect()
            node.getBoundsInScreen(bounds)
            val text = node.text?.toString() ?: node.contentDescription?.toString() ?: ""

            elements.add(ClickableElement(
                text = text,
                viewId = node.viewIdResourceName ?: "",
                className = node.className?.toString() ?: "",
                x = bounds.centerX(),
                y = bounds.centerY(),
                width = bounds.width(),
                height = bounds.height()
            ))
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectClickableElements(child, elements)
            child.recycle()
        }
    }

    enum class ScrollDirection {
        UP, DOWN, LEFT, RIGHT
    }

    data class ClickableElement(
        val text: String,
        val viewId: String,
        val className: String,
        val x: Int,
        val y: Int,
        val width: Int,
        val height: Int
    )
}
