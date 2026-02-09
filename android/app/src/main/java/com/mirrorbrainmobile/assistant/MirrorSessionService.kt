package com.mirrorbrainmobile.assistant

import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.util.Log

/**
 * Session Service - Creates voice interaction sessions
 */
class MirrorSessionService : VoiceInteractionSessionService() {

    companion object {
        private const val TAG = "MirrorSession"
    }

    override fun onNewSession(args: Bundle?): VoiceInteractionSession {
        Log.d(TAG, "Creating new voice interaction session")
        return MirrorVoiceSession(this)
    }
}
