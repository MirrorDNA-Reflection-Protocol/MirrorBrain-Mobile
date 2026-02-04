/**
 * Assistant Service — Personal AI Assistant
 *
 * Integrates all assistant triggers:
 * - Voice Interaction Service (long-press home, corner swipe)
 * - Wake Word Detection ("Hey Mirror")
 * - Double-tap back gesture
 *
 * Provides unified interface for voice assistant functionality.
 */

import { NativeModules, NativeEventEmitter, AppState, Platform } from 'react-native';
import { VoiceService } from './voice.service';
import { TTSService } from './tts.service';
import { OrchestratorService } from './orchestrator.service';

const { WakeWordModule, DoubleTapModule } = NativeModules;

export type AssistantTrigger = 'voice_interaction' | 'wake_word' | 'double_tap_back' | 'manual';

export interface AssistantConfig {
    wakeWordEnabled: boolean;
    doubleTapEnabled: boolean;
    onlyWhenCharging: boolean;
    speakResponses: boolean;
    autoListen: boolean;
}

export interface AssistantEvent {
    type: AssistantTrigger;
    timestamp: number;
    screenContext?: string;
}

type AssistantCallback = (event: AssistantEvent) => void;

const DEFAULT_CONFIG: AssistantConfig = {
    wakeWordEnabled: false,  // Off by default (battery)
    doubleTapEnabled: false,  // Off by default - uses accelerometer constantly
    onlyWhenCharging: true,   // Wake word only when charging
    speakResponses: true,
    autoListen: true,
};

class AssistantServiceClass {
    private config: AssistantConfig = DEFAULT_CONFIG;
    private callbacks: Set<AssistantCallback> = new Set();
    private wakeWordEmitter: NativeEventEmitter | null = null;
    private doubleTapEmitter: NativeEventEmitter | null = null;
    private isInitialized = false;
    private isListening = false;

    /**
     * Initialize assistant service
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        if (Platform.OS !== 'android') {
            console.warn('[AssistantService] Only available on Android');
            return;
        }

        console.log('[AssistantService] Initializing...');

        // Set up event listeners
        this.setupEventListeners();

        // Start enabled features
        if (this.config.doubleTapEnabled) {
            await this.startDoubleTapDetection();
        }

        if (this.config.wakeWordEnabled) {
            await this.startWakeWordDetection();
        }

        // Handle app state changes
        AppState.addEventListener('change', this.handleAppStateChange);

        this.isInitialized = true;
        console.log('[AssistantService] Initialized');
    }

    /**
     * Set up native event listeners
     */
    private setupEventListeners(): void {
        // Wake word events
        if (WakeWordModule) {
            this.wakeWordEmitter = new NativeEventEmitter(WakeWordModule);
            this.wakeWordEmitter.addListener('onWakeWordDetected', (event) => {
                console.log('[AssistantService] Wake word detected:', event);
                this.handleTrigger('wake_word', event);
            });
        }

        // Double-tap events
        if (DoubleTapModule) {
            this.doubleTapEmitter = new NativeEventEmitter(DoubleTapModule);
            this.doubleTapEmitter.addListener('onAssistantTrigger', (event) => {
                console.log('[AssistantService] Double-tap detected:', event);
                this.handleTrigger('double_tap_back', event);
            });
        }
    }

    /**
     * Handle app state changes
     */
    private handleAppStateChange = (state: string): void => {
        if (state === 'active') {
            // Resume detection when app comes to foreground
            if (this.config.doubleTapEnabled) {
                this.startDoubleTapDetection();
            }
        } else if (state === 'background') {
            // Keep running in background for always-on detection
        }
    };

    /**
     * Handle assistant trigger
     */
    private handleTrigger(type: AssistantTrigger, eventData?: any): void {
        const event: AssistantEvent = {
            type,
            timestamp: Date.now(),
            screenContext: eventData?.screenContext,
        };

        // Notify all callbacks
        this.callbacks.forEach(cb => {
            try {
                cb(event);
            } catch (e) {
                console.error('[AssistantService] Callback error:', e);
            }
        });

        // Auto-start listening if configured
        if (this.config.autoListen) {
            this.startListening();
        }
    }

    /**
     * Start wake word detection
     */
    async startWakeWordDetection(): Promise<boolean> {
        if (!WakeWordModule) {
            console.warn('[AssistantService] WakeWordModule not available');
            return false;
        }

        try {
            WakeWordModule.setOnlyWhenCharging(this.config.onlyWhenCharging);
            WakeWordModule.start();
            console.log('[AssistantService] Wake word detection started');
            return true;
        } catch (e) {
            console.error('[AssistantService] Failed to start wake word:', e);
            return false;
        }
    }

    /**
     * Stop wake word detection
     */
    async stopWakeWordDetection(): Promise<void> {
        if (!WakeWordModule) return;

        try {
            WakeWordModule.stop();
            console.log('[AssistantService] Wake word detection stopped');
        } catch (e) {
            console.error('[AssistantService] Failed to stop wake word:', e);
        }
    }

    /**
     * Start double-tap detection
     */
    async startDoubleTapDetection(): Promise<boolean> {
        if (!DoubleTapModule) {
            console.warn('[AssistantService] DoubleTapModule not available');
            return false;
        }

        try {
            const available = await DoubleTapModule.isAvailable();
            if (!available) {
                console.warn('[AssistantService] Accelerometer not available');
                return false;
            }

            DoubleTapModule.start();
            console.log('[AssistantService] Double-tap detection started');
            return true;
        } catch (e) {
            console.error('[AssistantService] Failed to start double-tap:', e);
            return false;
        }
    }

    /**
     * Stop double-tap detection
     */
    async stopDoubleTapDetection(): Promise<void> {
        if (!DoubleTapModule) return;

        try {
            DoubleTapModule.stop();
            console.log('[AssistantService] Double-tap detection stopped');
        } catch (e) {
            console.error('[AssistantService] Failed to stop double-tap:', e);
        }
    }

    /**
     * Start voice listening
     */
    async startListening(): Promise<void> {
        if (this.isListening) return;

        console.log('[AssistantService] Starting voice listening...');
        this.isListening = true;

        try {
            const result = await VoiceService.listen();
            this.isListening = false;

            if (result) {
                console.log('[AssistantService] Voice result:', result);
                await this.processVoiceInput(result);
            }
        } catch (e) {
            console.error('[AssistantService] Voice listening error:', e);
            this.isListening = false;
        }
    }

    /**
     * Stop voice listening
     */
    async stopListening(): Promise<void> {
        if (!this.isListening) return;

        try {
            await VoiceService.stop();
            this.isListening = false;
        } catch (e) {
            console.error('[AssistantService] Stop listening error:', e);
        }
    }

    /**
     * Process voice input through orchestrator
     */
    async processVoiceInput(text: string): Promise<string> {
        console.log('[AssistantService] Processing:', text);

        try {
            // Process through orchestrator
            const result = await OrchestratorService.orchestrate(text);

            const response = result.finalAnswer || result.synthesis || 'I understood: ' + text;

            // Speak response if enabled
            if (this.config.speakResponses) {
                await TTSService.speak(response);
            }

            return response;
        } catch (e) {
            console.error('[AssistantService] Processing error:', e);
            const errorResponse = 'Sorry, I had trouble processing that.';

            if (this.config.speakResponses) {
                await TTSService.speak(errorResponse);
            }

            return errorResponse;
        }
    }

    /**
     * Manually trigger assistant
     */
    async trigger(): Promise<void> {
        this.handleTrigger('manual');
    }

    /**
     * Update configuration
     */
    async setConfig(config: Partial<AssistantConfig>): Promise<void> {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...config };

        // Handle changes
        if (config.wakeWordEnabled !== undefined) {
            if (config.wakeWordEnabled && !oldConfig.wakeWordEnabled) {
                await this.startWakeWordDetection();
            } else if (!config.wakeWordEnabled && oldConfig.wakeWordEnabled) {
                await this.stopWakeWordDetection();
            }
        }

        if (config.doubleTapEnabled !== undefined) {
            if (config.doubleTapEnabled && !oldConfig.doubleTapEnabled) {
                await this.startDoubleTapDetection();
            } else if (!config.doubleTapEnabled && oldConfig.doubleTapEnabled) {
                await this.stopDoubleTapDetection();
            }
        }

        if (config.onlyWhenCharging !== undefined && WakeWordModule) {
            WakeWordModule.setOnlyWhenCharging(config.onlyWhenCharging);
        }

        console.log('[AssistantService] Config updated:', this.config);
    }

    /**
     * Get current configuration
     */
    getConfig(): AssistantConfig {
        return { ...this.config };
    }

    /**
     * Subscribe to assistant triggers
     */
    onTrigger(callback: AssistantCallback): () => void {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    /**
     * Check if assistant is listening
     */
    getIsListening(): boolean {
        return this.isListening;
    }

    /**
     * Cleanup
     */
    cleanup(): void {
        this.stopWakeWordDetection();
        this.stopDoubleTapDetection();
        this.callbacks.clear();
        this.isInitialized = false;
    }
}

export const AssistantService = new AssistantServiceClass();
export default AssistantService;
