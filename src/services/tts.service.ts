/**
 * TTS Service — Text-to-Speech
 *
 * Uses native Android TextToSpeech for speaking responses aloud.
 */

import { NativeModules, NativeEventEmitter } from 'react-native';

const { TTSModule } = NativeModules;

class TTSServiceClass {
    private eventEmitter: NativeEventEmitter | null = null;
    private isAvailable: boolean = false;
    private isSpeaking: boolean = false;

    constructor() {
        this.setup();
    }

    private setup(): void {
        if (!TTSModule) {
            console.warn('[TTSService] TTSModule not available');
            return;
        }

        try {
            this.eventEmitter = new NativeEventEmitter(TTSModule);

            this.eventEmitter.addListener('onTTSStart', () => {
                this.isSpeaking = true;
            });

            this.eventEmitter.addListener('onTTSDone', () => {
                this.isSpeaking = false;
            });

            this.eventEmitter.addListener('onTTSError', () => {
                this.isSpeaking = false;
            });

            this.isAvailable = true;
            console.log('[TTSService] Initialized');
        } catch (e) {
            console.warn('[TTSService] Setup failed:', e);
        }
    }

    /**
     * Check if TTS is available
     */
    async checkAvailable(): Promise<boolean> {
        if (!TTSModule) return false;
        try {
            return await TTSModule.isAvailable();
        } catch {
            return false;
        }
    }

    /**
     * Speak text aloud
     */
    async speak(text: string): Promise<boolean> {
        console.log('[TTSService] speak() called with:', text?.substring(0, 50));
        console.log('[TTSService] TTSModule available:', !!TTSModule);

        if (!TTSModule) {
            console.warn('[TTSService] Not available - TTSModule is null');
            return false;
        }

        try {
            console.log('[TTSService] Calling TTSModule.speak...');
            await TTSModule.speak(text);
            console.log('[TTSService] speak() succeeded');
            return true;
        } catch (e) {
            console.error('[TTSService] Speak error:', e);
            return false;
        }
    }

    /**
     * Stop speaking
     */
    async stop(): Promise<void> {
        if (!TTSModule) return;
        try {
            await TTSModule.stop();
        } catch (e) {
            console.warn('[TTSService] Stop error:', e);
        }
    }

    /**
     * Set speech rate (0.5 = slow, 1.0 = normal, 2.0 = fast)
     */
    async setRate(rate: number): Promise<void> {
        if (!TTSModule) return;
        try {
            await TTSModule.setSpeechRate(rate);
        } catch (e) {
            console.warn('[TTSService] Rate error:', e);
        }
    }

    /**
     * Check if currently speaking
     */
    getSpeaking(): boolean {
        return this.isSpeaking;
    }
}

export const TTSService = new TTSServiceClass();
export default TTSService;
