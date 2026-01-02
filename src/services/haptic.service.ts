/**
 * Haptic Feedback Service
 * 
 * Tactile responses for better UX.
 */

import { Vibration, Platform } from 'react-native';

type FeedbackType = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'selection';

class HapticServiceClass {
    private enabled: boolean = true;

    /**
     * Enable/disable haptics
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * Trigger haptic feedback
     */
    trigger(type: FeedbackType = 'light'): void {
        if (!this.enabled) return;

        // Different patterns for different feedback types
        const patterns: Record<FeedbackType, number | number[]> = {
            light: 10,
            medium: 20,
            heavy: 40,
            success: [0, 10, 50, 10],
            error: [0, 50, 50, 50],
            selection: 5,
        };

        const pattern = patterns[type];

        if (Platform.OS === 'android') {
            if (Array.isArray(pattern)) {
                Vibration.vibrate(pattern);
            } else {
                Vibration.vibrate(pattern);
            }
        }
        // iOS would use react-native-haptic-feedback for better control
    }

    /**
     * Light tap feedback - for button presses
     */
    tap(): void {
        this.trigger('light');
    }

    /**
     * Selection feedback - for mode changes
     */
    select(): void {
        this.trigger('selection');
    }

    /**
     * Success feedback - for completed actions
     */
    success(): void {
        this.trigger('success');
    }

    /**
     * Error feedback - for failed actions
     */
    error(): void {
        this.trigger('error');
    }

    /**
     * Impact feedback - for significant actions
     */
    impact(): void {
        this.trigger('medium');
    }
}

// Singleton export
export const HapticService = new HapticServiceClass();

export default HapticService;
