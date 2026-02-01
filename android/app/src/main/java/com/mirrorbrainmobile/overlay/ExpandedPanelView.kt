package com.mirrorbrainmobile.overlay

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * ExpandedPanelView — Expanded action panel overlay
 *
 * Shows when floating bubble is tapped, providing:
 * - Text input for quick queries
 * - Recent actions/suggestions
 * - Quick action buttons
 */
class ExpandedPanelView(
    context: Context,
    private val windowManager: WindowManager,
    private val onQuery: (String) -> Unit,
    private val onClose: () -> Unit,
    private val onQuickAction: (String) -> Unit
) : FrameLayout(context) {

    companion object {
        private const val TAG = "ExpandedPanelView"
        private const val PANEL_WIDTH_DP = 320
        private const val PANEL_HEIGHT_DP = 400
        private const val CORNER_RADIUS_DP = 16
    }

    private val panelWidthPx: Int
    private val panelHeightPx: Int
    private val cornerRadiusPx: Float

    val layoutParams: WindowManager.LayoutParams

    private var inputField: EditText? = null
    private var responseText: TextView? = null
    private var isExpanded = false

    init {
        val density = context.resources.displayMetrics.density
        panelWidthPx = (PANEL_WIDTH_DP * density).toInt()
        panelHeightPx = (PANEL_HEIGHT_DP * density).toInt()
        cornerRadiusPx = CORNER_RADIUS_DP * density

        val screenWidth = context.resources.displayMetrics.widthPixels
        val screenHeight = context.resources.displayMetrics.heightPixels

        // Layout params for overlay
        layoutParams = WindowManager.LayoutParams(
            panelWidthPx,
            panelHeightPx,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                @Suppress("DEPRECATION")
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 16
            y = screenHeight / 4
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
        }

        setupUI()
    }

    private fun setupUI() {
        // Background with rounded corners
        val background = GradientDrawable().apply {
            setColor(Color.parseColor("#1a1a22")) // surface color
            cornerRadius = cornerRadiusPx
        }
        setBackgroundDrawable(background)
        setPadding(
            (16 * resources.displayMetrics.density).toInt(),
            (16 * resources.displayMetrics.density).toInt(),
            (16 * resources.displayMetrics.density).toInt(),
            (16 * resources.displayMetrics.density).toInt()
        )

        // Main layout
        val mainLayout = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        }

        // Header with close button
        val header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (12 * resources.displayMetrics.density).toInt()
            }
        }

        val title = TextView(context).apply {
            text = "MirrorBrain"
            textSize = 18f
            setTextColor(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val closeButton = ImageButton(context).apply {
            setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
            setBackgroundColor(Color.TRANSPARENT)
            setOnClickListener { onClose() }
        }

        header.addView(title)
        header.addView(closeButton)

        // Input field
        inputField = EditText(context).apply {
            hint = "Ask anything..."
            setHintTextColor(Color.parseColor("#606070"))
            setTextColor(Color.WHITE)
            textSize = 14f
            setBackgroundResource(android.R.drawable.edit_text)
            background.setTint(Color.parseColor("#121218"))
            setPadding(
                (12 * resources.displayMetrics.density).toInt(),
                (10 * resources.displayMetrics.density).toInt(),
                (12 * resources.displayMetrics.density).toInt(),
                (10 * resources.displayMetrics.density).toInt()
            )
            imeOptions = EditorInfo.IME_ACTION_SEND
            setSingleLine(true)

            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (12 * resources.displayMetrics.density).toInt()
            }

            setOnEditorActionListener { _, actionId, event ->
                if (actionId == EditorInfo.IME_ACTION_SEND ||
                    (event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN)) {
                    val query = text.toString().trim()
                    if (query.isNotEmpty()) {
                        onQuery(query)
                        text.clear()
                    }
                    true
                } else false
            }
        }

        // Quick action buttons
        val quickActions = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (12 * resources.displayMetrics.density).toInt()
            }
        }

        val quickActionItems = listOf(
            "Capture" to "capture",
            "Calendar" to "calendar",
            "Notes" to "notes"
        )

        quickActionItems.forEach { (label, action) ->
            val button = TextView(context).apply {
                text = label
                textSize = 12f
                setTextColor(Color.parseColor("#a0a0b0"))
                setBackgroundResource(android.R.drawable.btn_default_small)
                background.setTint(Color.parseColor("#252530"))
                setPadding(
                    (16 * resources.displayMetrics.density).toInt(),
                    (8 * resources.displayMetrics.density).toInt(),
                    (16 * resources.displayMetrics.density).toInt(),
                    (8 * resources.displayMetrics.density).toInt()
                )
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    marginEnd = (8 * resources.displayMetrics.density).toInt()
                }
                setOnClickListener { onQuickAction(action) }
            }
            quickActions.addView(button)
        }

        // Response area (scrollable)
        val responseScroll = ScrollView(context).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        }

        responseText = TextView(context).apply {
            text = "Tap to ask a question or use quick actions above."
            textSize = 14f
            setTextColor(Color.parseColor("#a0a0b0"))
            setLineSpacing(0f, 1.3f)
        }

        responseScroll.addView(responseText)

        // Assemble layout
        mainLayout.addView(header)
        mainLayout.addView(inputField)
        mainLayout.addView(quickActions)
        mainLayout.addView(responseScroll)

        addView(mainLayout)
    }

    fun setResponse(text: String) {
        responseText?.text = text
        responseText?.setTextColor(Color.WHITE)
    }

    fun setLoading(loading: Boolean) {
        responseText?.text = if (loading) "Thinking..." else ""
        responseText?.setTextColor(Color.parseColor("#a0a0b0"))
    }

    fun focusInput() {
        inputField?.requestFocus()
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.showSoftInput(inputField, InputMethodManager.SHOW_IMPLICIT)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        // Hide keyboard when panel closes
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        imm.hideSoftInputFromWindow(windowToken, 0)
    }
}
