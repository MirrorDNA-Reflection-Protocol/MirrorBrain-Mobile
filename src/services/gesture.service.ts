/**
 * Gesture Service — JS Bridge for Native Shake Detection
 *
 * Bridges to GestureDetectorService (Kotlin) which uses the accelerometer
 * to detect shake gestures. Emits events to React layer.
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { GestureDetector } = NativeModules;

export interface GestureEvent {
    type: 'shake';
    timestamp: number;
}

type GestureCallback = (event: GestureEvent) => void;

class GestureServiceClass {
    private eventEmitter: NativeEventEmitter | null = null;
    private subscription: any = null;
    private callbacks: GestureCallback[] = [];
    private running: boolean = false;

    constructor() {
        if (Platform.OS === 'android' && GestureDetector) {
            this.eventEmitter = new NativeEventEmitter(GestureDetector);
        }
    }

    /**
     * Start gesture detection service
     */
    async start(): Promise<boolean> {
        if (Platform.OS !== 'android' || !GestureDetector) {
            console.warn('[GestureService] Only available on Android');
            return false;
        }

        if (this.running) return true;

        try {
            await GestureDetector.start();

            // Listen for native events
            this.subscription = this.eventEmitter?.addListener(
                'gestureDetected',
                (event: GestureEvent) => {
                    this.callbacks.forEach(cb => cb(event));
                }
            );

            this.running = true;
            console.log('[GestureService] Started');
            return true;
        } catch (error) {
            console.error('[GestureService] Failed to start:', error);
            return false;
        }
    }

    /**
     * Stop gesture detection
     */
    async stop(): Promise<void> {
        if (!GestureDetector || !this.running) return;

        try {
            this.subscription?.remove();
            this.subscription = null;
            await GestureDetector.stop();
            this.running = false;
            console.log('[GestureService] Stopped');
        } catch (error) {
            console.error('[GestureService] Failed to stop:', error);
        }
    }

    /**
     * Register a callback for gesture events
     */
    onGesture(callback: GestureCallback): () => void {
        this.callbacks.push(callback);
        return () => {
            this.callbacks = this.callbacks.filter(cb => cb !== callback);
        };
    }

    /**
     * Check if service is running
     */
    async isRunning(): Promise<boolean> {
        if (!GestureDetector) return false;
        try {
            return await GestureDetector.isRunning();
        } catch {
            return false;
        }
    }
}

export const GestureService = new GestureServiceClass();
export default GestureService;
