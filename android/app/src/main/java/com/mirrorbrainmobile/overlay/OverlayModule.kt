package com.mirrorbrainmobile.overlay

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * OverlayModule — React Native bridge for overlay service
 */
class OverlayModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        OverlayService.setReactContext(reactContext)
    }

    override fun getName(): String = "OverlayService"

    @ReactMethod
    fun start(promise: Promise) {
        try {
            reactApplicationContext?.let { context ->
                if (OverlayService.canDrawOverlays(context)) {
                    OverlayService.start(context)
                    promise.resolve(true)
                } else {
                    promise.reject("NO_PERMISSION", "Overlay permission not granted")
                }
            } ?: promise.reject("NO_CONTEXT", "No application context")
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            reactApplicationContext?.let { context ->
                OverlayService.stop(context)
                promise.resolve(true)
            } ?: promise.reject("NO_CONTEXT", "No application context")
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(OverlayService.isRunning)
    }

    @ReactMethod
    fun hasPermission(promise: Promise) {
        reactApplicationContext?.let { context ->
            promise.resolve(OverlayService.canDrawOverlays(context))
        } ?: promise.resolve(false)
    }

    @ReactMethod
    fun requestPermission(promise: Promise) {
        try {
            reactApplicationContext?.let { context ->
                OverlayService.requestOverlayPermission(context)
                promise.resolve(true)
            } ?: promise.reject("NO_CONTEXT", "No application context")
        } catch (e: Exception) {
            promise.reject("PERMISSION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setResponse(text: String, promise: Promise) {
        OverlayService.instance?.setResponse(text)
        promise.resolve(true)
    }

    @ReactMethod
    fun setPulse(enabled: Boolean, promise: Promise) {
        OverlayService.instance?.setPulse(enabled)
        promise.resolve(true)
    }

    @ReactMethod
    fun moveBubble(x: Int, y: Int, promise: Promise) {
        OverlayService.instance?.moveBubble(x, y)
        promise.resolve(true)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }
}

/**
 * OverlayPackage — React Native package for overlay module
 */
class OverlayPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(OverlayModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
