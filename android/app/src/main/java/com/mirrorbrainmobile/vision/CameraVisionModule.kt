package com.mirrorbrainmobile.vision

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

/**
 * Camera Vision Module
 *
 * Provides camera access for visual AI queries:
 * - "What is this?" - Point at anything
 * - "Read this" - OCR on documents/signs
 * - "Identify" - Object/plant/animal recognition
 */
class CameraVisionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        private const val TAG = "CameraVision"
        private const val REQUEST_IMAGE_CAPTURE = 1001
        private const val REQUEST_CAMERA_PERMISSION = 1002
        private const val MAX_IMAGE_SIZE = 1024
    }

    private var capturePromise: Promise? = null
    private var currentPhotoPath: String? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "CameraVisionModule"

    @ReactMethod
    fun captureImage(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }

        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            capturePromise = promise
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.CAMERA),
                REQUEST_CAMERA_PERMISSION
            )
            return
        }

        launchCamera(activity, promise)
    }

    private fun launchCamera(activity: Activity, promise: Promise) {
        capturePromise = promise

        val takePictureIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        if (takePictureIntent.resolveActivity(activity.packageManager) == null) {
            promise.reject("NO_CAMERA", "No camera app available")
            return
        }

        try {
            val photoFile = createImageFile()
            currentPhotoPath = photoFile.absolutePath

            val photoURI = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                photoFile
            )

            takePictureIntent.putExtra(MediaStore.EXTRA_OUTPUT, photoURI)
            activity.startActivityForResult(takePictureIntent, REQUEST_IMAGE_CAPTURE)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to create image file: ${e.message}")
            promise.reject("FILE_ERROR", "Failed to create image file: ${e.message}")
        }
    }

    private fun createImageFile(): File {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        val storageDir = reactApplicationContext.getExternalFilesDir(Environment.DIRECTORY_PICTURES)
        return File.createTempFile("VISION_${timeStamp}_", ".jpg", storageDir)
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_IMAGE_CAPTURE) return

        val promise = capturePromise ?: return
        capturePromise = null

        if (resultCode != Activity.RESULT_OK) {
            promise.reject("CANCELLED", "Image capture cancelled")
            return
        }

        val photoPath = currentPhotoPath
        if (photoPath == null) {
            promise.reject("NO_IMAGE", "No image path available")
            return
        }

        try {
            val bitmap = loadAndResizeBitmap(photoPath)
            if (bitmap == null) {
                promise.reject("LOAD_ERROR", "Failed to load image")
                return
            }

            val base64 = bitmapToBase64(bitmap)

            val result = Arguments.createMap().apply {
                putString("path", photoPath)
                putString("base64", base64)
                putInt("width", bitmap.width)
                putInt("height", bitmap.height)
            }

            promise.resolve(result)
            bitmap.recycle()

        } catch (e: Exception) {
            Log.e(TAG, "Failed to process image: ${e.message}")
            promise.reject("PROCESS_ERROR", "Failed to process image: ${e.message}")
        }
    }

    override fun onNewIntent(intent: Intent) {
        // Not needed
    }

    private fun loadAndResizeBitmap(path: String): Bitmap? {
        val options = BitmapFactory.Options().apply {
            inJustDecodeBounds = true
        }
        BitmapFactory.decodeFile(path, options)

        val maxDim = maxOf(options.outWidth, options.outHeight)
        var sampleSize = 1
        while (maxDim / sampleSize > MAX_IMAGE_SIZE * 2) {
            sampleSize *= 2
        }

        val loadOptions = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
        }
        var bitmap = BitmapFactory.decodeFile(path, loadOptions) ?: return null

        val scale = MAX_IMAGE_SIZE.toFloat() / maxOf(bitmap.width, bitmap.height)
        if (scale < 1) {
            val newWidth = (bitmap.width * scale).toInt()
            val newHeight = (bitmap.height * scale).toInt()
            val scaled = Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
            bitmap.recycle()
            bitmap = scaled
        }

        return bitmap
    }

    private fun bitmapToBase64(bitmap: Bitmap): String {
        val outputStream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 85, outputStream)
        val bytes = outputStream.toByteArray()
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    @ReactMethod
    fun analyzeImage(base64Image: String, question: String, promise: Promise) {
        Log.d(TAG, "Analyze image request: ${question.take(50)}...")

        if (base64Image.isEmpty()) {
            promise.reject("INVALID_IMAGE", "No image provided")
            return
        }

        val result = Arguments.createMap().apply {
            putBoolean("valid", true)
            putString("question", question)
            putInt("imageSize", base64Image.length)
        }
        promise.resolve(result)
    }

    @ReactMethod
    fun quickCapture(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity available")
            return
        }

        capturePromise = promise

        val takePictureIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        if (takePictureIntent.resolveActivity(activity.packageManager) == null) {
            promise.reject("NO_CAMERA", "No camera app available")
            return
        }

        activity.startActivityForResult(takePictureIntent, REQUEST_IMAGE_CAPTURE)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
