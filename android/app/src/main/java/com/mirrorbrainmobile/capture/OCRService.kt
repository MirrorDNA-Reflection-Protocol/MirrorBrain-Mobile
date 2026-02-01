package com.mirrorbrainmobile.capture

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * OCRService — ML Kit Text Recognition
 *
 * Purpose: Extract text from screenshots and images using ML Kit.
 * Returns structured text with block/line/element hierarchy.
 */
object OCRService {
    private const val TAG = "OCRService"
    private var recognizer: TextRecognizer? = null

    /**
     * OCR Result containing extracted text
     */
    data class OCRResult(
        val fullText: String,
        val blocks: List<TextBlock>,
        val confidence: Float,
        val processingTimeMs: Long
    )

    data class TextBlock(
        val text: String,
        val lines: List<TextLine>,
        val boundingBox: BoundingBox?
    )

    data class TextLine(
        val text: String,
        val confidence: Float,
        val boundingBox: BoundingBox?
    )

    data class BoundingBox(
        val left: Int,
        val top: Int,
        val right: Int,
        val bottom: Int
    )

    /**
     * Get or create the text recognizer instance
     */
    private fun getRecognizer(): TextRecognizer {
        if (recognizer == null) {
            recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        }
        return recognizer!!
    }

    /**
     * Extract text from an image file path
     */
    suspend fun extractText(imagePath: String): OCRResult {
        val startTime = System.currentTimeMillis()

        // Load bitmap
        val bitmap = loadBitmap(imagePath)
            ?: throw IllegalArgumentException("Could not load image: $imagePath")

        return extractTextFromBitmap(bitmap, startTime)
    }

    /**
     * Extract text from a content URI
     */
    suspend fun extractText(context: Context, uri: Uri): OCRResult {
        val startTime = System.currentTimeMillis()

        val inputImage = InputImage.fromFilePath(context, uri)
        return processImage(inputImage, startTime)
    }

    /**
     * Extract text from a Bitmap
     */
    suspend fun extractTextFromBitmap(bitmap: Bitmap, startTime: Long = System.currentTimeMillis()): OCRResult {
        val inputImage = InputImage.fromBitmap(bitmap, 0)
        return processImage(inputImage, startTime)
    }

    /**
     * Process an InputImage with ML Kit
     */
    private suspend fun processImage(inputImage: InputImage, startTime: Long): OCRResult =
        suspendCancellableCoroutine { continuation ->
            getRecognizer().process(inputImage)
                .addOnSuccessListener { visionText ->
                    val processingTime = System.currentTimeMillis() - startTime

                    // Convert ML Kit result to our structure
                    val blocks = visionText.textBlocks.map { block ->
                        TextBlock(
                            text = block.text,
                            lines = block.lines.map { line ->
                                TextLine(
                                    text = line.text,
                                    confidence = line.confidence ?: 0f,
                                    boundingBox = line.boundingBox?.let {
                                        BoundingBox(it.left, it.top, it.right, it.bottom)
                                    }
                                )
                            },
                            boundingBox = block.boundingBox?.let {
                                BoundingBox(it.left, it.top, it.right, it.bottom)
                            }
                        )
                    }

                    // Calculate average confidence
                    val allConfidences = blocks.flatMap { block ->
                        block.lines.map { it.confidence }
                    }
                    val avgConfidence = if (allConfidences.isNotEmpty()) {
                        allConfidences.average().toFloat()
                    } else 0f

                    val result = OCRResult(
                        fullText = visionText.text,
                        blocks = blocks,
                        confidence = avgConfidence,
                        processingTimeMs = processingTime
                    )

                    android.util.Log.d(TAG, "OCR complete: ${result.fullText.length} chars in ${processingTime}ms")
                    continuation.resume(result)
                }
                .addOnFailureListener { e ->
                    android.util.Log.e(TAG, "OCR failed: ${e.message}")
                    continuation.resumeWithException(e)
                }

            continuation.invokeOnCancellation {
                android.util.Log.d(TAG, "OCR cancelled")
            }
        }

    /**
     * Load bitmap from file path with size limits
     */
    private fun loadBitmap(path: String): Bitmap? {
        return try {
            val file = File(path)
            if (!file.exists()) return null

            // First decode bounds to check size
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeFile(path, options)

            // Calculate sample size to keep image under 2048px
            val maxDimension = maxOf(options.outWidth, options.outHeight)
            var sampleSize = 1
            while (maxDimension / sampleSize > 2048) {
                sampleSize *= 2
            }

            // Decode with sample size
            val decodeOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
            }
            BitmapFactory.decodeFile(path, decodeOptions)
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to load bitmap: ${e.message}")
            null
        }
    }

    /**
     * Quick check if image likely contains text
     * Uses a smaller sample for fast preliminary check
     */
    suspend fun containsText(imagePath: String): Boolean {
        return try {
            val result = extractText(imagePath)
            result.fullText.isNotBlank()
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Extract specific patterns from text (URLs, emails, phone numbers)
     */
    fun extractPatterns(text: String): Map<String, List<String>> {
        val patterns = mapOf(
            "urls" to Regex("""https?://[^\s]+"""),
            "emails" to Regex("""[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"""),
            "phones" to Regex("""[\+]?[(]?[0-9]{1,3}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}"""),
            "dates" to Regex("""\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}"""),
            "times" to Regex("""\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?""", RegexOption.IGNORE_CASE)
        )

        return patterns.mapValues { (_, regex) ->
            regex.findAll(text).map { it.value }.toList()
        }.filterValues { it.isNotEmpty() }
    }

    /**
     * Cleanup recognizer resources
     */
    fun close() {
        recognizer?.close()
        recognizer = null
    }
}
