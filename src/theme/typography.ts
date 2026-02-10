/**
 * MirrorBrain Mobile — Typography
 * From Spec Part XVII: Design Language
 * 
 * Typography-forward — Inter or system font, clear hierarchy
 */

import { Platform, TextStyle, PixelRatio } from 'react-native';
import { fontScale } from './responsive';

// Use Inter on Android (downloadable), SF Pro on iOS (system)
const fontFamily = Platform.select({
    ios: 'System',
    android: 'Inter',
    default: 'System',
});

// Prevent system font scaling from blowing up layout.
// We handle scaling ourselves via fontScale() which caps at 1.3x.
// Set allowFontScaling=false on Text components OR use these pre-scaled values.
export const typography = {
    // Display - for large headers
    displayLarge: {
        fontFamily,
        fontSize: fontScale(32),
        fontWeight: '700',
        lineHeight: fontScale(40),
        letterSpacing: -0.5,
    } as TextStyle,

    displayMedium: {
        fontFamily,
        fontSize: fontScale(28),
        fontWeight: '600',
        lineHeight: fontScale(36),
        letterSpacing: -0.25,
    } as TextStyle,

    displaySmall: {
        fontFamily,
        fontSize: fontScale(24),
        fontWeight: '600',
        lineHeight: fontScale(32),
        letterSpacing: 0,
    } as TextStyle,

    // Headlines
    headlineLarge: {
        fontFamily,
        fontSize: fontScale(24),
        fontWeight: '600',
        lineHeight: fontScale(32),
    } as TextStyle,

    headlineMedium: {
        fontFamily,
        fontSize: fontScale(20),
        fontWeight: '600',
        lineHeight: fontScale(28),
    } as TextStyle,

    headlineSmall: {
        fontFamily,
        fontSize: fontScale(18),
        fontWeight: '500',
        lineHeight: fontScale(24),
    } as TextStyle,

    // Body
    bodyLarge: {
        fontFamily,
        fontSize: fontScale(16),
        fontWeight: '400',
        lineHeight: fontScale(24),
    } as TextStyle,

    bodyMedium: {
        fontFamily,
        fontSize: fontScale(14),
        fontWeight: '400',
        lineHeight: fontScale(20),
    } as TextStyle,

    bodySmall: {
        fontFamily,
        fontSize: fontScale(12),
        fontWeight: '400',
        lineHeight: fontScale(16),
    } as TextStyle,

    // Labels
    labelLarge: {
        fontFamily,
        fontSize: fontScale(14),
        fontWeight: '500',
        lineHeight: fontScale(20),
        letterSpacing: 0.1,
    } as TextStyle,

    labelMedium: {
        fontFamily,
        fontSize: fontScale(12),
        fontWeight: '500',
        lineHeight: fontScale(16),
        letterSpacing: 0.5,
    } as TextStyle,

    labelSmall: {
        fontFamily,
        fontSize: fontScale(11),
        fontWeight: '500',
        lineHeight: fontScale(16),
        letterSpacing: 0.5,
    } as TextStyle,

    // Monospace for code/technical
    mono: {
        fontFamily: Platform.select({
            ios: 'Menlo',
            android: 'monospace',
            default: 'monospace',
        }),
        fontSize: fontScale(14),
        fontWeight: '400',
        lineHeight: fontScale(20),
    } as TextStyle,
} as const;

export type TypographyKey = keyof typeof typography;
