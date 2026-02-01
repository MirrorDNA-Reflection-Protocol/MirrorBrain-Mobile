package com.mirrorbrainmobile.automation

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.mirrorbrainmobile.passive.ScreenContextService
import kotlinx.coroutines.delay

/**
 * AppActionRegistry — Per-App Action Recipes
 *
 * Purpose: Define action sequences for specific apps.
 * Each recipe knows how to perform common tasks in that app.
 */
object AppActionRegistry {
    private const val TAG = "AppActionRegistry"

    /**
     * App-specific action handler interface
     */
    interface AppActionHandler {
        val packageName: String
        val appName: String
        suspend fun sendMessage(contact: String, message: String): AccessibilityActionExecutor.ActionResult
        suspend fun makeCall(contact: String): AccessibilityActionExecutor.ActionResult
        suspend fun openChat(contact: String): AccessibilityActionExecutor.ActionResult
    }

    // Registry of app handlers
    private val handlers = mutableMapOf<String, AppActionHandler>()

    init {
        // Register built-in handlers
        registerHandler(WhatsAppHandler())
        registerHandler(TelegramHandler())
        registerHandler(MessagesHandler())
        registerHandler(SlackHandler())
    }

    /**
     * Register an app action handler
     */
    fun registerHandler(handler: AppActionHandler) {
        handlers[handler.packageName] = handler
    }

    /**
     * Get handler for a package
     */
    fun getHandler(packageName: String): AppActionHandler? {
        return handlers[packageName]
    }

    /**
     * Get all registered handlers
     */
    fun getAllHandlers(): List<AppActionHandler> {
        return handlers.values.toList()
    }

    /**
     * Send a message using the best available app
     */
    suspend fun sendMessage(context: Context, contact: String, message: String): AccessibilityActionExecutor.ActionResult {
        // Try WhatsApp first (most common)
        val whatsapp = handlers["com.whatsapp"]
        if (whatsapp != null && isAppInstalled(context, whatsapp.packageName)) {
            return whatsapp.sendMessage(contact, message)
        }

        // Fall back to Telegram
        val telegram = handlers["org.telegram.messenger"]
        if (telegram != null && isAppInstalled(context, telegram.packageName)) {
            return telegram.sendMessage(contact, message)
        }

        // Fall back to default messaging
        val messages = handlers["com.google.android.apps.messaging"]
        if (messages != null && isAppInstalled(context, messages.packageName)) {
            return messages.sendMessage(contact, message)
        }

        return AccessibilityActionExecutor.ActionResult(false, "No messaging app available")
    }

    /**
     * Open a chat with a contact
     */
    suspend fun openChat(context: Context, contact: String, preferredApp: String? = null): AccessibilityActionExecutor.ActionResult {
        val handler = if (preferredApp != null) {
            handlers[preferredApp]
        } else {
            handlers.values.firstOrNull { isAppInstalled(context, it.packageName) }
        }

        return handler?.openChat(contact)
            ?: AccessibilityActionExecutor.ActionResult(false, "No suitable app found")
    }

    /**
     * Check if an app is installed
     */
    private fun isAppInstalled(context: Context, packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (e: Exception) {
            false
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // WhatsApp Handler
    // ─────────────────────────────────────────────────────────────────────────────

    private class WhatsAppHandler : AppActionHandler {
        override val packageName = "com.whatsapp"
        override val appName = "WhatsApp"

        override suspend fun sendMessage(contact: String, message: String): AccessibilityActionExecutor.ActionResult {
            val context = ScreenContextService.instance?.applicationContext
                ?: return AccessibilityActionExecutor.ActionResult(false, "No context")

            try {
                // Try to open chat via deep link with pre-filled message
                val uri = Uri.parse("https://api.whatsapp.com/send?phone=$contact&text=${Uri.encode(message)}")
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    setPackage(packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)

                // Wait for WhatsApp to open
                delay(2000)

                // Look for send button and click it
                val sendResult = AccessibilityActionExecutor.clickById("$packageName:id/send")
                if (sendResult.success) {
                    return AccessibilityActionExecutor.ActionResult(true, "Message sent to $contact")
                }

                // Try clicking by content description
                return AccessibilityActionExecutor.clickByText("Send", exact = true)
            } catch (e: Exception) {
                return AccessibilityActionExecutor.ActionResult(false, "Failed: ${e.message}")
            }
        }

        override suspend fun makeCall(contact: String): AccessibilityActionExecutor.ActionResult {
            // WhatsApp calling requires opening chat first
            val chatResult = openChat(contact)
            if (!chatResult.success) return chatResult

            delay(1000)

            // Look for call button
            return AccessibilityActionExecutor.clickById("$packageName:id/voice_call_btn")
        }

        override suspend fun openChat(contact: String): AccessibilityActionExecutor.ActionResult {
            val context = ScreenContextService.instance?.applicationContext
                ?: return AccessibilityActionExecutor.ActionResult(false, "No context")

            try {
                val uri = Uri.parse("https://api.whatsapp.com/send?phone=$contact")
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    setPackage(packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)

                delay(1500)
                return AccessibilityActionExecutor.ActionResult(true, "Opened WhatsApp chat with $contact")
            } catch (e: Exception) {
                return AccessibilityActionExecutor.ActionResult(false, "Failed: ${e.message}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Telegram Handler
    // ─────────────────────────────────────────────────────────────────────────────

    private class TelegramHandler : AppActionHandler {
        override val packageName = "org.telegram.messenger"
        override val appName = "Telegram"

        override suspend fun sendMessage(contact: String, message: String): AccessibilityActionExecutor.ActionResult {
            val context = ScreenContextService.instance?.applicationContext
                ?: return AccessibilityActionExecutor.ActionResult(false, "No context")

            try {
                // Telegram deep link format
                val uri = Uri.parse("tg://msg?text=${Uri.encode(message)}&to=$contact")
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    setPackage(packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)

                delay(2000)

                // Try to find and click send
                return AccessibilityActionExecutor.clickByText("Send", exact = false)
            } catch (e: Exception) {
                return AccessibilityActionExecutor.ActionResult(false, "Failed: ${e.message}")
            }
        }

        override suspend fun makeCall(contact: String): AccessibilityActionExecutor.ActionResult {
            return AccessibilityActionExecutor.ActionResult(false, "Telegram call automation not implemented")
        }

        override suspend fun openChat(contact: String): AccessibilityActionExecutor.ActionResult {
            val context = ScreenContextService.instance?.applicationContext
                ?: return AccessibilityActionExecutor.ActionResult(false, "No context")

            try {
                val uri = Uri.parse("tg://resolve?domain=$contact")
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    setPackage(packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)

                delay(1500)
                return AccessibilityActionExecutor.ActionResult(true, "Opened Telegram chat with $contact")
            } catch (e: Exception) {
                return AccessibilityActionExecutor.ActionResult(false, "Failed: ${e.message}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Messages (Google) Handler
    // ─────────────────────────────────────────────────────────────────────────────

    private class MessagesHandler : AppActionHandler {
        override val packageName = "com.google.android.apps.messaging"
        override val appName = "Messages"

        override suspend fun sendMessage(contact: String, message: String): AccessibilityActionExecutor.ActionResult {
            val context = ScreenContextService.instance?.applicationContext
                ?: return AccessibilityActionExecutor.ActionResult(false, "No context")

            try {
                // Standard SMS intent
                val uri = Uri.parse("smsto:$contact")
                val intent = Intent(Intent.ACTION_SENDTO, uri).apply {
                    putExtra("sms_body", message)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)

                delay(2000)

                // Try to find and click send
                return AccessibilityActionExecutor.clickById("$packageName:id/send_message_button")
            } catch (e: Exception) {
                return AccessibilityActionExecutor.ActionResult(false, "Failed: ${e.message}")
            }
        }

        override suspend fun makeCall(contact: String): AccessibilityActionExecutor.ActionResult {
            val context = ScreenContextService.instance?.applicationContext
                ?: return AccessibilityActionExecutor.ActionResult(false, "No context")

            try {
                val intent = Intent(Intent.ACTION_DIAL).apply {
                    data = Uri.parse("tel:$contact")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)

                return AccessibilityActionExecutor.ActionResult(true, "Opened dialer for $contact")
            } catch (e: Exception) {
                return AccessibilityActionExecutor.ActionResult(false, "Failed: ${e.message}")
            }
        }

        override suspend fun openChat(contact: String): AccessibilityActionExecutor.ActionResult {
            val context = ScreenContextService.instance?.applicationContext
                ?: return AccessibilityActionExecutor.ActionResult(false, "No context")

            try {
                val uri = Uri.parse("smsto:$contact")
                val intent = Intent(Intent.ACTION_SENDTO, uri).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)

                delay(1000)
                return AccessibilityActionExecutor.ActionResult(true, "Opened Messages chat with $contact")
            } catch (e: Exception) {
                return AccessibilityActionExecutor.ActionResult(false, "Failed: ${e.message}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Slack Handler
    // ─────────────────────────────────────────────────────────────────────────────

    private class SlackHandler : AppActionHandler {
        override val packageName = "com.Slack"
        override val appName = "Slack"

        override suspend fun sendMessage(contact: String, message: String): AccessibilityActionExecutor.ActionResult {
            // Slack requires opening the app and navigating to the DM
            val openResult = openChat(contact)
            if (!openResult.success) return openResult

            delay(1000)

            // Type the message
            val textResult = AccessibilityActionExecutor.setText(message)
            if (!textResult.success) return textResult

            delay(500)

            // Send
            return AccessibilityActionExecutor.clickByText("Send", exact = false)
        }

        override suspend fun makeCall(contact: String): AccessibilityActionExecutor.ActionResult {
            return AccessibilityActionExecutor.ActionResult(false, "Slack call automation not implemented")
        }

        override suspend fun openChat(contact: String): AccessibilityActionExecutor.ActionResult {
            val context = ScreenContextService.instance?.applicationContext
                ?: return AccessibilityActionExecutor.ActionResult(false, "No context")

            try {
                // Open Slack
                val intent = context.packageManager.getLaunchIntentForPackage(packageName)?.apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                } ?: return AccessibilityActionExecutor.ActionResult(false, "Slack not installed")

                context.startActivity(intent)
                delay(2000)

                // Open search/jump
                AccessibilityActionExecutor.clickById("$packageName:id/jump_to_button")
                delay(500)

                // Type contact name
                AccessibilityActionExecutor.setText(contact)
                delay(1000)

                // Click first result
                return AccessibilityActionExecutor.clickByText(contact, exact = false)
            } catch (e: Exception) {
                return AccessibilityActionExecutor.ActionResult(false, "Failed: ${e.message}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Generic Actions (work across apps)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Open any app by package name
     */
    fun openApp(context: Context, packageName: String): AccessibilityActionExecutor.ActionResult {
        return try {
            val intent = context.packageManager.getLaunchIntentForPackage(packageName)?.apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            } ?: return AccessibilityActionExecutor.ActionResult(false, "App not found: $packageName")

            context.startActivity(intent)
            AccessibilityActionExecutor.ActionResult(true, "Opened app: $packageName")
        } catch (e: Exception) {
            AccessibilityActionExecutor.ActionResult(false, "Failed to open app: ${e.message}")
        }
    }

    /**
     * Open a URL
     */
    fun openUrl(context: Context, url: String): AccessibilityActionExecutor.ActionResult {
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            AccessibilityActionExecutor.ActionResult(true, "Opened URL: $url")
        } catch (e: Exception) {
            AccessibilityActionExecutor.ActionResult(false, "Failed to open URL: ${e.message}")
        }
    }

    /**
     * Share text to an app
     */
    fun shareText(context: Context, text: String, targetPackage: String? = null): AccessibilityActionExecutor.ActionResult {
        return try {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (targetPackage != null) {
                    setPackage(targetPackage)
                }
            }

            val chooser = if (targetPackage == null) {
                Intent.createChooser(intent, "Share via").apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            } else {
                intent
            }

            context.startActivity(chooser)
            AccessibilityActionExecutor.ActionResult(true, "Share dialog opened")
        } catch (e: Exception) {
            AccessibilityActionExecutor.ActionResult(false, "Failed to share: ${e.message}")
        }
    }

    /**
     * Create a calendar event
     */
    fun createCalendarEvent(
        context: Context,
        title: String,
        description: String? = null,
        startTime: Long? = null,
        endTime: Long? = null
    ): AccessibilityActionExecutor.ActionResult {
        return try {
            val intent = Intent(Intent.ACTION_INSERT).apply {
                data = android.provider.CalendarContract.Events.CONTENT_URI
                putExtra(android.provider.CalendarContract.Events.TITLE, title)
                if (description != null) {
                    putExtra(android.provider.CalendarContract.Events.DESCRIPTION, description)
                }
                if (startTime != null) {
                    putExtra(android.provider.CalendarContract.EXTRA_EVENT_BEGIN_TIME, startTime)
                }
                if (endTime != null) {
                    putExtra(android.provider.CalendarContract.EXTRA_EVENT_END_TIME, endTime)
                }
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            AccessibilityActionExecutor.ActionResult(true, "Calendar event creation opened")
        } catch (e: Exception) {
            AccessibilityActionExecutor.ActionResult(false, "Failed to create event: ${e.message}")
        }
    }
}
