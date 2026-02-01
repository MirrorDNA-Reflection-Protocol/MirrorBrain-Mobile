/**
 * Focus Mode Service — Deep Work & Auto-Responder
 *
 * Purpose: Manage focus mode with intelligent auto-replies.
 */

import {
    NativeModules,
    NativeEventEmitter,
    Platform,
} from 'react-native';

const { FocusModeService: NativeFocus } = NativeModules;

export interface FocusStatus {
    active: boolean;
    startedAt?: number;
    endsAt?: number;
    elapsedMinutes?: number;
    remainingMinutes?: number;
    reason?: string;
    preset?: string;
    allowedContacts?: string[];
}

export interface FocusPreset {
    id: string;
    name: string;
    icon: string;
    defaultDuration: number;
    message: string;
}

export interface FocusOptions {
    duration: number; // minutes
    reason?: string;
    preset?: string;
    allowedContacts?: string[];
}

export interface FocusEvent {
    type: 'started' | 'ended' | 'extended';
    minutes: number;
    timestamp: number;
}

type FocusCallback = (event: FocusEvent) => void;

class FocusServiceClass {
    private emitter: NativeEventEmitter | null = null;
    private subscription: any = null;
    private callbacks: Set<FocusCallback> = new Set();

    /**
     * Initialize focus service
     */
    async initialize(): Promise<void> {
        if (Platform.OS !== 'android' || !NativeFocus) {
            console.warn('[FocusService] Only available on Android');
            return;
        }

        // Set up event listener
        this.emitter = new NativeEventEmitter(NativeFocus);
        this.subscription = this.emitter.addListener(
            'onFocusEvent',
            this.handleEvent.bind(this)
        );

        console.log('[FocusService] Initialized');
    }

    /**
     * Clean up
     */
    destroy(): void {
        if (this.subscription) {
            this.subscription.remove();
            this.subscription = null;
        }
    }

    /**
     * Subscribe to focus events
     */
    subscribe(callback: FocusCallback): () => void {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Focus Mode Control
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Check if focus mode is active
     */
    async isActive(): Promise<boolean> {
        if (!NativeFocus) return false;
        return NativeFocus.isActive();
    }

    /**
     * Start focus mode
     */
    async start(options: FocusOptions): Promise<{ success: boolean; endsAt?: number }> {
        if (!NativeFocus) {
            return { success: false };
        }

        try {
            const result = await NativeFocus.startFocus(options);
            console.log('[FocusService] Started focus mode');
            return result;
        } catch (error) {
            console.error('[FocusService] Failed to start:', error);
            return { success: false };
        }
    }

    /**
     * End focus mode
     */
    async end(): Promise<boolean> {
        if (!NativeFocus) return false;

        try {
            await NativeFocus.endFocus();
            console.log('[FocusService] Ended focus mode');
            return true;
        } catch (error) {
            console.error('[FocusService] Failed to end:', error);
            return false;
        }
    }

    /**
     * Extend focus mode
     */
    async extend(additionalMinutes: number): Promise<{ endsAt?: number }> {
        if (!NativeFocus) {
            return {};
        }

        try {
            return await NativeFocus.extendFocus(additionalMinutes);
        } catch (error) {
            console.error('[FocusService] Failed to extend:', error);
            return {};
        }
    }

    /**
     * Get current focus status
     */
    async getStatus(): Promise<FocusStatus> {
        if (!NativeFocus) {
            return { active: false };
        }
        return NativeFocus.getStatus();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Settings
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Set auto-reply message
     */
    async setAutoReplyMessage(message: string): Promise<boolean> {
        if (!NativeFocus) return false;
        return NativeFocus.setAutoReplyMessage(message);
    }

    /**
     * Get auto-reply message
     */
    async getAutoReplyMessage(): Promise<string> {
        if (!NativeFocus) return '';
        return NativeFocus.getAutoReplyMessage();
    }

    /**
     * Set allowed contacts (breakthrough list)
     */
    async setAllowedContacts(contacts: string[]): Promise<boolean> {
        if (!NativeFocus) return false;
        return NativeFocus.setAllowedContacts(contacts);
    }

    /**
     * Add a contact to allowed list
     */
    async addAllowedContact(contact: string): Promise<boolean> {
        if (!NativeFocus) return false;
        return NativeFocus.addAllowedContact(contact);
    }

    /**
     * Enable/disable auto-responder
     */
    async setAutoResponderEnabled(enabled: boolean): Promise<boolean> {
        if (!NativeFocus) return false;
        return NativeFocus.setAutoResponderEnabled(enabled);
    }

    /**
     * Check if auto-responder is enabled
     */
    async isAutoResponderEnabled(): Promise<boolean> {
        if (!NativeFocus) return false;
        return NativeFocus.isAutoResponderEnabled();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Presets
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get available focus presets
     */
    async getPresets(): Promise<FocusPreset[]> {
        if (!NativeFocus) {
            return this.getDefaultPresets();
        }
        return NativeFocus.getPresets();
    }

    /**
     * Start focus with a preset
     */
    async startWithPreset(presetId: string, customDuration?: number): Promise<{ success: boolean; endsAt?: number }> {
        const presets = await this.getPresets();
        const preset = presets.find(p => p.id === presetId);

        if (!preset) {
            return { success: false };
        }

        return this.start({
            duration: customDuration || preset.defaultDuration,
            reason: preset.name,
            preset: presetId,
        });
    }

    /**
     * Default presets (fallback)
     */
    private getDefaultPresets(): FocusPreset[] {
        return [
            { id: 'deep_work', name: 'Deep Work', icon: '🎯', defaultDuration: 50, message: "I'm in deep focus mode." },
            { id: 'meeting', name: 'In a Meeting', icon: '📅', defaultDuration: 60, message: "I'm in a meeting." },
            { id: 'personal', name: 'Personal Time', icon: '🏠', defaultDuration: 120, message: 'Taking personal time.' },
            { id: 'sleep', name: 'Sleep Mode', icon: '😴', defaultDuration: 480, message: "I'm sleeping." },
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Convenience Methods
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Start a quick 25-minute focus session (Pomodoro)
     */
    async startPomodoro(): Promise<{ success: boolean; endsAt?: number }> {
        return this.start({
            duration: 25,
            reason: 'Pomodoro',
            preset: 'deep_work',
        });
    }

    /**
     * Start a 50-minute deep work session
     */
    async startDeepWork(): Promise<{ success: boolean; endsAt?: number }> {
        return this.startWithPreset('deep_work');
    }

    /**
     * Start meeting mode
     */
    async startMeeting(durationMinutes: number = 60): Promise<{ success: boolean; endsAt?: number }> {
        return this.startWithPreset('meeting', durationMinutes);
    }

    /**
     * Start sleep mode
     */
    async startSleepMode(): Promise<{ success: boolean; endsAt?: number }> {
        return this.startWithPreset('sleep');
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Event Handling
    // ─────────────────────────────────────────────────────────────────────────────

    private handleEvent(event: FocusEvent): void {
        console.log('[FocusService] Event:', event.type);

        this.callbacks.forEach(cb => {
            try {
                cb(event);
            } catch (error) {
                console.error('[FocusService] Callback error:', error);
            }
        });
    }

    /**
     * Check if service is available
     */
    isAvailable(): boolean {
        return Platform.OS === 'android' && NativeFocus != null;
    }
}

export const FocusService = new FocusServiceClass();
