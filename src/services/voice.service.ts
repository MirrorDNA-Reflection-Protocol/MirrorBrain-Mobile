/**
 * Voice Service — Dictation & Listening
 * From Spec Part VI
 * 
 * Uses on-device speech recognition via @react-native-voice/voice
 */

import Voice, {
    SpeechResultsEvent,
    SpeechErrorEvent,
    SpeechStartEvent,
    SpeechEndEvent
} from '@react-native-voice/voice';
import { PermissionsAndroid, Platform } from 'react-native';

type VoiceCallback = (text: string, isFinal: boolean) => void;

class VoiceServiceClass {
    private isListening: boolean = false;
    private onResultCallback: VoiceCallback | null = null;

    constructor() {
        Voice.onSpeechStart = this.onSpeechStart;
        Voice.onSpeechEnd = this.onSpeechEnd;
        Voice.onSpeechError = this.onSpeechError;
        Voice.onSpeechResults = this.onSpeechResults;
        Voice.onSpeechPartialResults = this.onSpeechPartialResults;
    }

    private onSpeechStart = (e: SpeechStartEvent) => {
        console.log('Voice: Start', e);
        this.isListening = true;
    };

    private onSpeechEnd = (e: SpeechEndEvent) => {
        console.log('Voice: End', e);
        this.isListening = false;
    };

    private onSpeechError = (e: SpeechErrorEvent) => {
        console.log('Voice: Error', e);
        this.isListening = false;
    };

    private onSpeechResults = (e: SpeechResultsEvent) => {
        if (e.value && e.value[0] && this.onResultCallback) {
            this.onResultCallback(e.value[0], true);
        }
    };

    private onSpeechPartialResults = (e: SpeechResultsEvent) => {
        if (e.value && e.value[0] && this.onResultCallback) {
            this.onResultCallback(e.value[0], false);
        }
    };

    /**
     * Request microphone permission
     */
    async requestPermission(): Promise<boolean> {
        if (Platform.OS !== 'android') return true;

        try {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                {
                    title: 'Microphone Permission',
                    message: 'MirrorBrain needs microphone access for voice capture.',
                    buttonNeutral: 'Ask Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        } catch (error) {
            console.error('Failed to request mic permission:', error);
            return false;
        }
    }

    /**
     * Start listening
     */
    async startListening(callback: VoiceCallback): Promise<boolean> {
        if (this.isListening) {
            await this.stopListening();
        }

        const hasPermission = await this.requestPermission();
        if (!hasPermission) return false;

        this.onResultCallback = callback;

        try {
            await Voice.start('en-US');
            return true;
        } catch (e) {
            console.error('Voice: Failed to start', e);
            return false;
        }
    }

    /**
     * Stop listening
     */
    async stopListening(): Promise<void> {
        try {
            await Voice.stop();
            this.isListening = false;
            this.onResultCallback = null;
        } catch (e) {
            console.error('Voice: Failed to stop', e);
        }
    }

    /**
     * Destroy voice instance (cleanup)
     */
    async destroy(): Promise<void> {
        try {
            await Voice.destroy();
            Voice.removeAllListeners();
        } catch (e) {
            console.error('Voice: Failed to destroy', e);
        }
    }
}

export const VoiceService = new VoiceServiceClass();
export default VoiceService;
