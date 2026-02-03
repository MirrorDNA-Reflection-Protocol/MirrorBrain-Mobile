/**
 * Voice Service — Native Speech Recognition
 *
 * Uses custom SpeechModule native module for Android speech recognition.
 * Works with React Native new architecture (TurboModules).
 */

import { NativeModules, NativeEventEmitter, PermissionsAndroid, Platform } from 'react-native';

const { SpeechModule } = NativeModules;

type VoiceCallback = (text: string, isFinal: boolean) => void;

class VoiceServiceClass {
    private isListening: boolean = false;
    private onResultCallback: VoiceCallback | null = null;
    private isAvailable: boolean = false;
    private eventEmitter: NativeEventEmitter | null = null;
    private subscriptions: any[] = [];
    private lastError: string = '';

    constructor() {
        this.setupVoice();
    }

    private setupVoice(): void {
        if (!SpeechModule) {
            console.warn('[VoiceService] SpeechModule not available');
            this.isAvailable = false;
            return;
        }

        try {
            this.eventEmitter = new NativeEventEmitter(SpeechModule);

            // Subscribe to events
            this.subscriptions.push(
                this.eventEmitter.addListener('onSpeechStart', () => {
                    console.log('[VoiceService] Speech started');
                    this.isListening = true;
                })
            );

            this.subscriptions.push(
                this.eventEmitter.addListener('onSpeechEnd', () => {
                    console.log('[VoiceService] Speech ended');
                    this.isListening = false;
                })
            );

            this.subscriptions.push(
                this.eventEmitter.addListener('onSpeechError', (e: any) => {
                    console.log('[VoiceService] Speech error:', e);
                    this.lastError = e?.message || 'Unknown error';
                    this.isListening = false;
                })
            );

            this.subscriptions.push(
                this.eventEmitter.addListener('onSpeechResults', (e: any) => {
                    if (e?.value?.[0] && this.onResultCallback) {
                        this.onResultCallback(e.value[0], true);
                    }
                })
            );

            this.subscriptions.push(
                this.eventEmitter.addListener('onSpeechPartialResults', (e: any) => {
                    if (e?.value?.[0] && this.onResultCallback) {
                        this.onResultCallback(e.value[0], false);
                    }
                })
            );

            this.isAvailable = true;
            console.log('[VoiceService] Native speech recognition initialized');
        } catch (e) {
            console.warn('[VoiceService] Failed to initialize:', e);
            this.isAvailable = false;
        }
    }

    /**
     * Check if voice is available
     */
    isVoiceAvailable(): boolean {
        return this.isAvailable;
    }

    /**
     * Check native availability
     */
    async checkNativeAvailability(): Promise<boolean> {
        if (!SpeechModule) return false;
        try {
            return await SpeechModule.isAvailable();
        } catch {
            return false;
        }
    }

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
            console.error('[VoiceService] Permission error:', error);
            return false;
        }
    }

    /**
     * Start listening
     */
    async startListening(callback: VoiceCallback): Promise<boolean> {
        console.log('[VoiceService] startListening called, isAvailable:', this.isAvailable);

        if (!this.isAvailable || !SpeechModule) {
            console.warn('[VoiceService] Speech not available');
            this.lastError = 'Speech recognition not available on this device';
            return false;
        }

        if (this.isListening) {
            console.log('[VoiceService] Already listening, stopping first');
            await this.stopListening();
        }

        console.log('[VoiceService] Requesting permission...');
        const hasPermission = await this.requestPermission();
        console.log('[VoiceService] Permission result:', hasPermission);

        if (!hasPermission) {
            console.warn('[VoiceService] No microphone permission');
            this.lastError = 'Microphone permission denied';
            return false;
        }

        this.onResultCallback = callback;

        try {
            console.log('[VoiceService] Calling SpeechModule.startListening...');
            await SpeechModule.startListening('en-US');
            console.log('[VoiceService] startListening succeeded');
            return true;
        } catch (e: any) {
            const errorMsg = e?.message || e?.code || String(e);
            console.error('[VoiceService] Failed to start:', errorMsg);
            this.lastError = errorMsg;
            return false;
        }
    }

    /**
     * Get last error message
     */
    getLastError(): string {
        return this.lastError;
    }

    /**
     * Stop listening
     */
    async stopListening(): Promise<void> {
        if (!this.isAvailable || !SpeechModule) return;

        try {
            await SpeechModule.stopListening();
        } catch (e) {
            console.warn('[VoiceService] Stop error:', e);
        }

        this.isListening = false;
        this.onResultCallback = null;
    }

    /**
     * Cancel listening
     */
    async cancel(): Promise<void> {
        if (!this.isAvailable || !SpeechModule) return;

        try {
            await SpeechModule.cancel();
        } catch (e) {
            console.warn('[VoiceService] Cancel error:', e);
        }

        this.isListening = false;
        this.onResultCallback = null;
    }

    /**
     * Destroy voice instance (cleanup)
     */
    async destroy(): Promise<void> {
        if (!this.isAvailable || !SpeechModule) return;

        try {
            await SpeechModule.destroy();
            this.subscriptions.forEach(sub => sub.remove());
            this.subscriptions = [];
        } catch (e) {
            console.warn('[VoiceService] Destroy error:', e);
        }
    }
}

export const VoiceService = new VoiceServiceClass();
export default VoiceService;
