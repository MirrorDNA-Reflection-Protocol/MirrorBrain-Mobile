package com.mirrorbrainmobile.capture

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*

/**
 * OCRModule — React Native Bridge for OCR and Screenshot Observation
 */
class OCRModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var screenshotObserver: ScreenshotObserver? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun getName(): String = "OCRModule"

    /**
     * Start observing for screenshots
     */
    @ReactMethod
    fun startScreenshotObserver(promise: Promise) {
        try {
            if (screenshotObserver != null) {
                promise.resolve(true)
                return
            }

            screenshotObserver = ScreenshotObserver(reactContext) { path ->
                // Auto-run OCR on detected screenshots
                scope.launch {
                    try {
                        val result = OCRService.extractText(path)
                        val params = Arguments.createMap().apply {
                            putString("path", path)
                            putString("text", result.fullText)
                            putDouble("confidence", result.confidence.toDouble())
                            putDouble("processingTimeMs", result.processingTimeMs.toDouble())
                        }
                        sendEvent("onScreenshotOCRComplete", params)
                    } catch (e: Exception) {
                        android.util.Log.e("OCRModule", "OCR failed: ${e.message}")
                    }
                }
            }
            screenshotObserver?.start()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_ERROR", e.message)
        }
    }

    /**
     * Stop observing for screenshots
     */
    @ReactMethod
    fun stopScreenshotObserver(promise: Promise) {
        try {
            screenshotObserver?.stop()
            screenshotObserver = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_ERROR", e.message)
        }
    }

    /**
     * Extract text from an image path
     */
    @ReactMethod
    fun extractText(imagePath: String, promise: Promise) {
        scope.launch {
            try {
                val result = OCRService.extractText(imagePath)

                // Convert blocks to WritableArray
                val blocksArray = Arguments.createArray()
                for (block in result.blocks) {
                    val blockMap = Arguments.createMap().apply {
                        putString("text", block.text)

                        // Lines
                        val linesArray = Arguments.createArray()
                        for (line in block.lines) {
                            val lineMap = Arguments.createMap().apply {
                                putString("text", line.text)
                                putDouble("confidence", line.confidence.toDouble())
                                line.boundingBox?.let { box ->
                                    putMap("boundingBox", Arguments.createMap().apply {
                                        putInt("left", box.left)
                                        putInt("top", box.top)
                                        putInt("right", box.right)
                                        putInt("bottom", box.bottom)
                                    })
                                }
                            }
                            linesArray.pushMap(lineMap)
                        }
                        putArray("lines", linesArray)

                        // Bounding box
                        block.boundingBox?.let { box ->
                            putMap("boundingBox", Arguments.createMap().apply {
                                putInt("left", box.left)
                                putInt("top", box.top)
                                putInt("right", box.right)
                                putInt("bottom", box.bottom)
                            })
                        }
                    }
                    blocksArray.pushMap(blockMap)
                }

                val resultMap = Arguments.createMap().apply {
                    putString("fullText", result.fullText)
                    putArray("blocks", blocksArray)
                    putDouble("confidence", result.confidence.toDouble())
                    putDouble("processingTimeMs", result.processingTimeMs.toDouble())
                }

                promise.resolve(resultMap)
            } catch (e: Exception) {
                promise.reject("OCR_ERROR", e.message)
            }
        }
    }

    /**
     * Extract patterns from text (URLs, emails, phones)
     */
    @ReactMethod
    fun extractPatterns(text: String, promise: Promise) {
        try {
            val patterns = OCRService.extractPatterns(text)

            val resultMap = Arguments.createMap()
            for ((key, values) in patterns) {
                val array = Arguments.createArray()
                values.forEach { array.pushString(it) }
                resultMap.putArray(key, array)
            }

            promise.resolve(resultMap)
        } catch (e: Exception) {
            promise.reject("PATTERN_ERROR", e.message)
        }
    }

    /**
     * Check if image contains text (quick check)
     */
    @ReactMethod
    fun containsText(imagePath: String, promise: Promise) {
        scope.launch {
            try {
                val hasText = OCRService.containsText(imagePath)
                promise.resolve(hasText)
            } catch (e: Exception) {
                promise.reject("CHECK_ERROR", e.message)
            }
        }
    }

    /**
     * Send event to JS
     */
    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        screenshotObserver?.stop()
        scope.cancel()
        OCRService.close()
    }
}
