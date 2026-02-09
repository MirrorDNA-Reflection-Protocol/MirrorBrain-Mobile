package com.mirrorbrainmobile.assistant

import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.util.Log

/**
 * MirrorBrain Voice Interaction Service
 *
 * Replaces Google Assistant when set as default assistant.
 * Triggered by:
 * - Long-press home button
 * - Swipe from corners (gesture navigation)
 * - "Hey Google" redirect (if configured)
 */
class MirrorAssistantService : VoiceInteractionService() {

    companion object {
        private const val TAG = "MirrorAssistant"
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "MirrorBrain Assistant Service created")
    }

    override fun onReady() {
        super.onReady()
        Log.d(TAG, "MirrorBrain Assistant Service ready")
    }

    override fun onShutdown() {
        Log.d(TAG, "MirrorBrain Assistant Service shutdown")
        super.onShutdown()
    }
}
