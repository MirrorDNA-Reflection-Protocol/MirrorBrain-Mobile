package com.mirrorbrainmobile.focus

import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Intent
import android.os.Bundle
import android.service.notification.StatusBarNotification
import com.mirrorbrainmobile.passive.NotificationInterceptorService

/**
 * AutoResponderService — Intelligent Auto-Reply
 *
 * Purpose: Send contextual auto-replies when in focus mode.
 * Integrates with notification listener to intercept and reply.
 */
object AutoResponderService {
    private const val TAG = "AutoResponderService"

    const val DEFAULT_MESSAGE = "I'm currently focusing and will respond when I'm available. Thanks for your patience!"

    private var isActive = false
    private var customMessage: String = DEFAULT_MESSAGE
    private var allowedContacts: Set<String> = emptySet()
    private val respondedNotifications = mutableSetOf<String>()

    // Apps that support direct reply
    private val SUPPORTED_APPS = setOf(
        "com.whatsapp",
        "org.telegram.messenger",
        "com.google.android.apps.messaging",
        "com.Slack",
        "com.slack",
        "com.discord",
        "com.facebook.orca",
    )

    // Track last reply time per contact to avoid spamming
    private val lastReplyTime = mutableMapOf<String, Long>()
    private const val MIN_REPLY_INTERVAL_MS = 5 * 60 * 1000L // 5 minutes

    /**
     * Set auto-responder active state
     */
    fun setActive(active: Boolean) {
        isActive = active
        if (!active) {
            respondedNotifications.clear()
        }
        android.util.Log.d(TAG, "Auto-responder active: $active")
    }

    /**
     * Check if auto-responder is active
     */
    fun isActive(): Boolean = isActive

    /**
     * Set custom auto-reply message
     */
    fun setCustomMessage(message: String) {
        customMessage = message.ifEmpty { DEFAULT_MESSAGE }
    }

    /**
     * Get current message
     */
    fun getMessage(): String = customMessage

    /**
     * Set allowed contacts (won't auto-reply to these)
     */
    fun setAllowedContacts(contacts: Set<String>) {
        allowedContacts = contacts
    }

    /**
     * Process an incoming notification for potential auto-reply
     * Called from NotificationInterceptorService
     */
    fun processNotification(sbn: StatusBarNotification): Boolean {
        if (!isActive) return false

        // Check if we support this app
        if (!SUPPORTED_APPS.contains(sbn.packageName)) {
            return false
        }

        // Get notification details
        val notification = sbn.notification ?: return false
        val extras = notification.extras ?: return false

        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""

        // Skip if already responded to this notification
        if (respondedNotifications.contains(sbn.key)) {
            return false
        }

        // Skip if from allowed contact
        if (isAllowedContact(title)) {
            android.util.Log.d(TAG, "Skipping allowed contact: $title")
            return false
        }

        // Check rate limiting
        if (!canReplyTo(title)) {
            android.util.Log.d(TAG, "Rate limited for: $title")
            return false
        }

        // Skip if it's a group chat (usually indicated by specific patterns)
        if (isGroupChat(sbn.packageName, title, extras)) {
            android.util.Log.d(TAG, "Skipping group chat: $title")
            return false
        }

        // Try to send auto-reply
        val replied = sendAutoReply(sbn, notification)

        if (replied) {
            respondedNotifications.add(sbn.key)
            lastReplyTime[title] = System.currentTimeMillis()
            android.util.Log.d(TAG, "Auto-replied to: $title")
        }

        return replied
    }

    /**
     * Send auto-reply using notification's reply action
     */
    private fun sendAutoReply(sbn: StatusBarNotification, notification: Notification): Boolean {
        // Find the reply action
        val replyAction = findReplyAction(notification) ?: return false

        // Get RemoteInput for the reply
        val remoteInput = replyAction.remoteInputs?.firstOrNull() ?: return false

        // Build the reply intent
        val intent = Intent()
        val replyBundle = Bundle().apply {
            putCharSequence(remoteInput.resultKey, buildReplyMessage())
        }
        RemoteInput.addResultsToIntent(arrayOf(remoteInput), intent, replyBundle)

        // Send the reply
        return try {
            replyAction.actionIntent?.send(
                NotificationInterceptorService.instance?.applicationContext,
                0,
                intent
            )
            true
        } catch (e: Exception) {
            android.util.Log.e(TAG, "Failed to send reply: ${e.message}")
            false
        }
    }

    /**
     * Find a reply action in the notification
     */
    private fun findReplyAction(notification: Notification): Notification.Action? {
        // Check actions for one with RemoteInput
        notification.actions?.forEach { action ->
            if (action.remoteInputs?.isNotEmpty() == true) {
                // Prefer actions labeled as "reply"
                val title = action.title?.toString()?.lowercase() ?: ""
                if (title.contains("reply") || title.contains("respond")) {
                    return action
                }
            }
        }

        // Fall back to any action with RemoteInput
        return notification.actions?.firstOrNull {
            it.remoteInputs?.isNotEmpty() == true
        }
    }

    /**
     * Build the reply message with context
     */
    private fun buildReplyMessage(): String {
        val focusReason = FocusModeService.instance?.getCurrentReason()

        return if (!focusReason.isNullOrEmpty() && focusReason != "Focusing") {
            "$customMessage\n\n[Reason: $focusReason]"
        } else {
            customMessage
        }
    }

    /**
     * Check if a contact is in the allowed list
     */
    private fun isAllowedContact(contactName: String): Boolean {
        return allowedContacts.any { allowed ->
            contactName.contains(allowed, ignoreCase = true)
        }
    }

    /**
     * Check rate limiting for a contact
     */
    private fun canReplyTo(contactName: String): Boolean {
        val lastTime = lastReplyTime[contactName] ?: return true
        return System.currentTimeMillis() - lastTime > MIN_REPLY_INTERVAL_MS
    }

    /**
     * Detect if notification is from a group chat
     */
    private fun isGroupChat(packageName: String, title: String, extras: Bundle): Boolean {
        // WhatsApp group detection
        if (packageName == "com.whatsapp") {
            // Groups often have multiple participants indicator
            val conversationTitle = extras.getString(Notification.EXTRA_CONVERSATION_TITLE)
            if (conversationTitle != null) return true

            // Check for group indicators in title
            if (title.contains("(") && title.contains(")")) return true
        }

        // Telegram group detection
        if (packageName == "org.telegram.messenger") {
            // Channels and groups usually have specific formatting
            if (title.endsWith(" group") || title.endsWith(" channel")) return true
        }

        // Slack channel detection
        if (packageName == "com.Slack" || packageName == "com.slack") {
            // Channels start with #
            if (title.startsWith("#")) return true
        }

        // Check for common group indicators
        if (extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false)) {
            return true
        }

        return false
    }

    /**
     * Clear response tracking (call when focus ends)
     */
    fun clearTracking() {
        respondedNotifications.clear()
        lastReplyTime.clear()
    }

    /**
     * Get stats about auto-replies sent
     */
    fun getStats(): Map<String, Any> {
        return mapOf(
            "repliesSent" to respondedNotifications.size,
            "isActive" to isActive,
            "message" to customMessage,
            "allowedContacts" to allowedContacts.size
        )
    }
}
