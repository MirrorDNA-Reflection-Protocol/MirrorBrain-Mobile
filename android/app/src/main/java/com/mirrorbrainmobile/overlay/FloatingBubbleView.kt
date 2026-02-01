package com.mirrorbrainmobile.overlay

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.os.Build
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.OvershootInterpolator
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * FloatingBubbleView — Draggable floating bubble UI
 *
 * A chat-head style bubble that can be dragged around the screen
 * and expands when tapped.
 */
class FloatingBubbleView(
    context: Context,
    private val windowManager: WindowManager,
    private val onTap: () -> Unit,
    private val onDismiss: () -> Unit
) : View(context) {

    companion object {
        private const val TAG = "FloatingBubbleView"
        private const val BUBBLE_SIZE_DP = 56
        private const val TAP_THRESHOLD_PX = 10
        private const val EDGE_MARGIN_DP = 8
        private const val SNAP_DURATION_MS = 300L
    }

    private val bubbleSizePx: Int
    private val edgeMarginPx: Int

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#6366f1") // Accent primary
        style = Paint.Style.FILL
    }

    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = 24f * context.resources.displayMetrics.density
        textAlign = Paint.Align.CENTER
    }

    val layoutParams: WindowManager.LayoutParams

    private var initialX = 0
    private var initialY = 0
    private var initialTouchX = 0f
    private var initialTouchY = 0f
    private var isDragging = false

    private var screenWidth = 0
    private var screenHeight = 0

    init {
        val density = context.resources.displayMetrics.density
        bubbleSizePx = (BUBBLE_SIZE_DP * density).toInt()
        edgeMarginPx = (EDGE_MARGIN_DP * density).toInt()

        // Get screen dimensions
        val metrics = context.resources.displayMetrics
        screenWidth = metrics.widthPixels
        screenHeight = metrics.heightPixels

        // Layout params for overlay window
        layoutParams = WindowManager.LayoutParams(
            bubbleSizePx,
            bubbleSizePx,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = screenWidth - bubbleSizePx - edgeMarginPx
            y = screenHeight / 3
        }

        // Enable touch events
        isClickable = true
        isFocusable = true
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val cx = width / 2f
        val cy = height / 2f
        val radius = width / 2f - 4

        // Draw bubble circle
        canvas.drawCircle(cx, cy, radius, paint)

        // Draw icon (brain symbol)
        canvas.drawText("\uD83E\uDDE0", cx, cy + iconPaint.textSize / 3, iconPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                initialX = layoutParams.x
                initialY = layoutParams.y
                initialTouchX = event.rawX
                initialTouchY = event.rawY
                isDragging = false
                return true
            }

            MotionEvent.ACTION_MOVE -> {
                val dx = event.rawX - initialTouchX
                val dy = event.rawY - initialTouchY
                val distance = sqrt(dx * dx + dy * dy)

                if (distance > TAP_THRESHOLD_PX) {
                    isDragging = true
                }

                if (isDragging) {
                    layoutParams.x = initialX + dx.toInt()
                    layoutParams.y = initialY + dy.toInt()
                    windowManager.updateViewLayout(this, layoutParams)
                }
                return true
            }

            MotionEvent.ACTION_UP -> {
                if (!isDragging) {
                    // It was a tap
                    onTap()
                } else {
                    // Snap to edge
                    snapToEdge()
                }
                isDragging = false
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    private fun snapToEdge() {
        val centerX = layoutParams.x + bubbleSizePx / 2

        // Determine which edge is closer
        val targetX = if (centerX < screenWidth / 2) {
            edgeMarginPx
        } else {
            screenWidth - bubbleSizePx - edgeMarginPx
        }

        // Constrain Y position
        val minY = edgeMarginPx
        val maxY = screenHeight - bubbleSizePx - edgeMarginPx
        val targetY = layoutParams.y.coerceIn(minY, maxY)

        // Animate to edge
        val animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = SNAP_DURATION_MS
            interpolator = OvershootInterpolator(1f)
            addUpdateListener { animation ->
                val fraction = animation.animatedValue as Float
                layoutParams.x = (layoutParams.x + (targetX - layoutParams.x) * fraction).toInt()
                layoutParams.y = (layoutParams.y + (targetY - layoutParams.y) * fraction).toInt()
                try {
                    windowManager.updateViewLayout(this@FloatingBubbleView, layoutParams)
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to update layout during snap animation", e)
                }
            }
        }
        animator.start()
    }

    fun updatePosition(x: Int, y: Int) {
        layoutParams.x = x
        layoutParams.y = y
        try {
            windowManager.updateViewLayout(this, layoutParams)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to update position", e)
        }
    }

    fun setPulseAnimation(enabled: Boolean) {
        if (enabled) {
            val pulseAnimator = ValueAnimator.ofFloat(1f, 1.1f, 1f).apply {
                duration = 1000
                repeatCount = ValueAnimator.INFINITE
                addUpdateListener { animation ->
                    val scale = animation.animatedValue as Float
                    scaleX = scale
                    scaleY = scale
                }
            }
            pulseAnimator.start()
        } else {
            scaleX = 1f
            scaleY = 1f
        }
    }
}
