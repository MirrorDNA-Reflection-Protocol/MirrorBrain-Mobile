package com.mirrorbrainmobile.automation

import com.facebook.react.bridge.*
import kotlinx.coroutines.*

/**
 * AutomationModule — React Native Bridge for Cross-App Actions
 */
class AutomationModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun getName(): String = "AutomationModule"

    // ─────────────────────────────────────────────────────────────────────────────
    // Click Actions
    // ─────────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun clickByText(text: String, exact: Boolean, promise: Promise) {
        scope.launch {
            val result = AccessibilityActionExecutor.clickByText(text, exact)
            promise.resolve(resultToMap(result))
        }
    }

    @ReactMethod
    fun clickById(viewId: String, promise: Promise) {
        scope.launch {
            val result = AccessibilityActionExecutor.clickById(viewId)
            promise.resolve(resultToMap(result))
        }
    }

    @ReactMethod
    fun clickAtCoordinates(x: Double, y: Double, promise: Promise) {
        scope.launch {
            val result = AccessibilityActionExecutor.clickAtCoordinates(x.toFloat(), y.toFloat())
            promise.resolve(resultToMap(result))
        }
    }

    @ReactMethod
    fun longPressByText(text: String, promise: Promise) {
        scope.launch {
            val result = AccessibilityActionExecutor.longPressByText(text)
            promise.resolve(resultToMap(result))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Text Input
    // ─────────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun setText(text: String, fieldHint: String?, promise: Promise) {
        scope.launch {
            val result = AccessibilityActionExecutor.setText(text, fieldHint)
            promise.resolve(resultToMap(result))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Navigation
    // ─────────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun scroll(direction: String, promise: Promise) {
        scope.launch {
            val dir = when (direction.uppercase()) {
                "UP" -> AccessibilityActionExecutor.ScrollDirection.UP
                "DOWN" -> AccessibilityActionExecutor.ScrollDirection.DOWN
                "LEFT" -> AccessibilityActionExecutor.ScrollDirection.LEFT
                "RIGHT" -> AccessibilityActionExecutor.ScrollDirection.RIGHT
                else -> {
                    promise.reject("INVALID_DIRECTION", "Invalid direction: $direction")
                    return@launch
                }
            }
            val result = AccessibilityActionExecutor.scroll(dir)
            promise.resolve(resultToMap(result))
        }
    }

    @ReactMethod
    fun pressBack(promise: Promise) {
        val result = AccessibilityActionExecutor.pressBack()
        promise.resolve(resultToMap(result))
    }

    @ReactMethod
    fun pressHome(promise: Promise) {
        val result = AccessibilityActionExecutor.pressHome()
        promise.resolve(resultToMap(result))
    }

    @ReactMethod
    fun openRecents(promise: Promise) {
        val result = AccessibilityActionExecutor.openRecents()
        promise.resolve(resultToMap(result))
    }

    @ReactMethod
    fun openNotifications(promise: Promise) {
        val result = AccessibilityActionExecutor.openNotifications()
        promise.resolve(resultToMap(result))
    }

    @ReactMethod
    fun openQuickSettings(promise: Promise) {
        val result = AccessibilityActionExecutor.openQuickSettings()
        promise.resolve(resultToMap(result))
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Screen Analysis
    // ─────────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun getClickableElements(promise: Promise) {
        val elements = AccessibilityActionExecutor.getClickableElements()

        val array = Arguments.createArray()
        for (element in elements) {
            val map = Arguments.createMap().apply {
                putString("text", element.text)
                putString("viewId", element.viewId)
                putString("className", element.className)
                putInt("x", element.x)
                putInt("y", element.y)
                putInt("width", element.width)
                putInt("height", element.height)
            }
            array.pushMap(map)
        }

        promise.resolve(array)
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // App Actions (High-Level)
    // ─────────────────────────────────────────────────────────────────────────────

    @ReactMethod
    fun sendMessage(contact: String, message: String, promise: Promise) {
        scope.launch {
            val result = AppActionRegistry.sendMessage(reactContext, contact, message)
            promise.resolve(resultToMap(result))
        }
    }

    @ReactMethod
    fun openChat(contact: String, preferredApp: String?, promise: Promise) {
        scope.launch {
            val result = AppActionRegistry.openChat(reactContext, contact, preferredApp)
            promise.resolve(resultToMap(result))
        }
    }

    @ReactMethod
    fun openApp(packageName: String, promise: Promise) {
        val result = AppActionRegistry.openApp(reactContext, packageName)
        promise.resolve(resultToMap(result))
    }

    @ReactMethod
    fun openUrl(url: String, promise: Promise) {
        val result = AppActionRegistry.openUrl(reactContext, url)
        promise.resolve(resultToMap(result))
    }

    @ReactMethod
    fun shareText(text: String, targetPackage: String?, promise: Promise) {
        val result = AppActionRegistry.shareText(reactContext, text, targetPackage)
        promise.resolve(resultToMap(result))
    }

    @ReactMethod
    fun createCalendarEvent(options: ReadableMap, promise: Promise) {
        val title = options.getString("title") ?: run {
            promise.reject("MISSING_TITLE", "Title is required")
            return
        }
        val description = if (options.hasKey("description")) options.getString("description") else null
        val startTime = if (options.hasKey("startTime")) options.getDouble("startTime").toLong() else null
        val endTime = if (options.hasKey("endTime")) options.getDouble("endTime").toLong() else null

        val result = AppActionRegistry.createCalendarEvent(reactContext, title, description, startTime, endTime)
        promise.resolve(resultToMap(result))
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Helper
    // ─────────────────────────────────────────────────────────────────────────────

    private fun resultToMap(result: AccessibilityActionExecutor.ActionResult): WritableMap {
        return Arguments.createMap().apply {
            putBoolean("success", result.success)
            putString("message", result.message)
            if (result.data != null) {
                val dataMap = Arguments.createMap()
                for ((key, value) in result.data) {
                    when (value) {
                        is String -> dataMap.putString(key, value)
                        is Int -> dataMap.putInt(key, value)
                        is Double -> dataMap.putDouble(key, value)
                        is Boolean -> dataMap.putBoolean(key, value)
                    }
                }
                putMap("data", dataMap)
            }
        }
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        scope.cancel()
    }
}
