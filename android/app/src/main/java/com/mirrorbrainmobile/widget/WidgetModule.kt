package com.mirrorbrainmobile.widget

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ViewManager

/**
 * WidgetModule — React Native bridge for home screen widget
 */
class WidgetModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MirrorBrainWidget"

    /**
     * Update widget with new data
     */
    @ReactMethod
    fun updateWidget(data: ReadableMap, promise: Promise) {
        try {
            val greeting = if (data.hasKey("greeting")) data.getString("greeting") else null
            val status = if (data.hasKey("status")) data.getString("status") else null
            val pendingCount = if (data.hasKey("pendingCount")) data.getInt("pendingCount") else 0
            val nextEvent = if (data.hasKey("nextEvent")) data.getString("nextEvent") else null

            reactApplicationContext?.let { context ->
                MirrorBrainWidgetProvider.updateWidgetData(
                    context,
                    greeting,
                    status,
                    pendingCount,
                    nextEvent
                )
                promise.resolve(true)
            } ?: promise.reject("NO_CONTEXT", "No application context")
        } catch (e: Exception) {
            promise.reject("UPDATE_ERROR", e.message, e)
        }
    }

    /**
     * Trigger widget refresh
     */
    @ReactMethod
    fun refreshWidget(promise: Promise) {
        try {
            reactApplicationContext?.let { context ->
                MirrorBrainWidgetProvider.updateWidget(context)
                promise.resolve(true)
            } ?: promise.reject("NO_CONTEXT", "No application context")
        } catch (e: Exception) {
            promise.reject("REFRESH_ERROR", e.message, e)
        }
    }
}

/**
 * WidgetPackage — React Native package for widget module
 */
class WidgetPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(WidgetModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
