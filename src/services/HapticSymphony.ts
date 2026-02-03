/**
 * Haptic Symphony — The Physical Language of MirrorBrain
 * 
 * Maps cognitive states to physical sensations.
 * Uses react-native-haptic-feedback for rich patterns.
 */

import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

const options = {
    enableVibrateFallback: true,
    ignoreAndroidSystemSettings: true,
};

export const HapticSymphony = {
    // The heartbeat of the system. Used in "Ask" waiting states.
    heartbeat: async () => {
        ReactNativeHapticFeedback.trigger('impactLight', options);
        await new Promise<void>(r => setTimeout(r, 100)); // Systole
        ReactNativeHapticFeedback.trigger('impactHeavy', options);
    },

    // Used when a difficult decision is resolved.
    shatter: async () => {
        ReactNativeHapticFeedback.trigger('impactHeavy', options);
        await new Promise(r => setTimeout(() => r(null), 100)); // Systole
        // Diastole (weaker)
        ReactNativeHapticFeedback.trigger('impactLight', options);
        await new Promise(r => setTimeout(() => r(null), 50));
        // Pause
        await new Promise(r => setTimeout(() => r(null), 50));
        // Systole
        ReactNativeHapticFeedback.trigger('impactMedium', options);
        await new Promise(r => setTimeout(() => r(null), 50));
        ReactNativeHapticFeedback.trigger('notificationSuccess', options);
    },

    // "Crystallizing" text or ideas.
    crystallize: () => {
        ReactNativeHapticFeedback.trigger('selection', options);
    },

    // Standard interactions
    tap: () => ReactNativeHapticFeedback.trigger('impactLight', options),
    select: () => ReactNativeHapticFeedback.trigger('selection', options),
    success: () => ReactNativeHapticFeedback.trigger('notificationSuccess', options),
    warning: () => ReactNativeHapticFeedback.trigger('notificationWarning', options),
    error: () => ReactNativeHapticFeedback.trigger('notificationError', options),
    attention: () => ReactNativeHapticFeedback.trigger('notificationWarning', options),
};
