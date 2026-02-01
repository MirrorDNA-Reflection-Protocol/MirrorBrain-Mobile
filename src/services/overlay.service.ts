/**
 * Overlay Service — Floating Bubble Bridge
 *
 * Purpose: TypeScript bridge to native floating overlay system.
 * Provides floating bubble and expanded panel functionality.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { OverlayService: NativeOverlay } = NativeModules;

// Event types
export interface OverlayQueryEvent {
    query: string;
    timestamp: number;
}

export interface OverlayQuickActionEvent {
    action: 'capture' | 'calendar' | 'notes';
    timestamp: number;
}

export interface OverlayBubbleEvent {
    type: 'shown' | 'hidden';
}

export interface OverlayPanelEvent {
    type: 'expanded' | 'collapsed';
}

type OverlayEventCallback<T> = (event: T) => void;

class OverlayServiceClass {
    private eventEmitter: NativeEventEmitter | null = null;
    private subscriptions: Map<string, any> = new Map();

    constructor() {
        if (Platform.OS === 'android' && NativeOverlay) {
            this.eventEmitter = new NativeEventEmitter(NativeOverlay);
        }
    }

    /**
     * Check if overlay permission is granted
     */
    async hasPermission(): Promise<boolean> {
        if (Platform.OS !== 'android' || !NativeOverlay) {
            return false;
        }
        try {
            return await NativeOverlay.hasPermission();
        } catch (error) {
            console.error('[OverlayService] hasPermission failed:', error);
            return false;
        }
    }

    /**
     * Request overlay permission (opens system settings)
     */
    async requestPermission(): Promise<void> {
        if (Platform.OS !== 'android' || !NativeOverlay) {
            return;
        }
        try {
            await NativeOverlay.requestPermission();
        } catch (error) {
            console.error('[OverlayService] requestPermission failed:', error);
        }
    }

    /**
     * Start the overlay service (show floating bubble)
     */
    async start(): Promise<boolean> {
        if (Platform.OS !== 'android' || !NativeOverlay) {
            console.warn('[OverlayService] Not available on this platform');
            return false;
        }

        try {
            const hasPermission = await this.hasPermission();
            if (!hasPermission) {
                console.warn('[OverlayService] Permission not granted');
                return false;
            }

            await NativeOverlay.start();
            console.log('[OverlayService] Started');
            return true;
        } catch (error) {
            console.error('[OverlayService] start failed:', error);
            return false;
        }
    }

    /**
     * Stop the overlay service (hide floating bubble)
     */
    async stop(): Promise<void> {
        if (Platform.OS !== 'android' || !NativeOverlay) {
            return;
        }

        try {
            await NativeOverlay.stop();
            console.log('[OverlayService] Stopped');
        } catch (error) {
            console.error('[OverlayService] stop failed:', error);
        }
    }

    /**
     * Check if overlay service is running
     */
    async isRunning(): Promise<boolean> {
        if (Platform.OS !== 'android' || !NativeOverlay) {
            return false;
        }

        try {
            return await NativeOverlay.isRunning();
        } catch (error) {
            console.error('[OverlayService] isRunning failed:', error);
            return false;
        }
    }

    /**
     * Set response text in expanded panel
     */
    async setResponse(text: string): Promise<void> {
        if (Platform.OS !== 'android' || !NativeOverlay) {
            return;
        }

        try {
            await NativeOverlay.setResponse(text);
        } catch (error) {
            console.error('[OverlayService] setResponse failed:', error);
        }
    }

    /**
     * Enable/disable pulse animation on bubble
     */
    async setPulse(enabled: boolean): Promise<void> {
        if (Platform.OS !== 'android' || !NativeOverlay) {
            return;
        }

        try {
            await NativeOverlay.setPulse(enabled);
        } catch (error) {
            console.error('[OverlayService] setPulse failed:', error);
        }
    }

    /**
     * Move bubble to specific position
     */
    async moveBubble(x: number, y: number): Promise<void> {
        if (Platform.OS !== 'android' || !NativeOverlay) {
            return;
        }

        try {
            await NativeOverlay.moveBubble(x, y);
        } catch (error) {
            console.error('[OverlayService] moveBubble failed:', error);
        }
    }

    /**
     * Subscribe to overlay queries from expanded panel
     */
    onQuery(callback: OverlayEventCallback<OverlayQueryEvent>): () => void {
        if (!this.eventEmitter) {
            return () => {};
        }

        const subscription = this.eventEmitter.addListener('overlayQuery', callback);
        return () => subscription.remove();
    }

    /**
     * Subscribe to quick action events
     */
    onQuickAction(callback: OverlayEventCallback<OverlayQuickActionEvent>): () => void {
        if (!this.eventEmitter) {
            return () => {};
        }

        const subscription = this.eventEmitter.addListener('overlayQuickAction', callback);
        return () => subscription.remove();
    }

    /**
     * Subscribe to bubble show/hide events
     */
    onBubbleStateChange(callback: OverlayEventCallback<OverlayBubbleEvent>): () => void {
        if (!this.eventEmitter) {
            return () => {};
        }

        const showSub = this.eventEmitter.addListener('overlayBubbleShown', () => {
            callback({ type: 'shown' });
        });
        const hideSub = this.eventEmitter.addListener('overlayBubbleHidden', () => {
            callback({ type: 'hidden' });
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }

    /**
     * Subscribe to panel expand/collapse events
     */
    onPanelStateChange(callback: OverlayEventCallback<OverlayPanelEvent>): () => void {
        if (!this.eventEmitter) {
            return () => {};
        }

        const expandSub = this.eventEmitter.addListener('overlayPanelExpanded', () => {
            callback({ type: 'expanded' });
        });
        const collapseSub = this.eventEmitter.addListener('overlayPanelCollapsed', () => {
            callback({ type: 'collapsed' });
        });

        return () => {
            expandSub.remove();
            collapseSub.remove();
        };
    }
}

export const OverlayService = new OverlayServiceClass();
