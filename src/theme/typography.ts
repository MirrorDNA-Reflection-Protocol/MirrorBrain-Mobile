/**
 * MirrorBrain Mobile — Typography
 * From Spec Part XVII: Design Language
 * 
 * Typography-forward — Inter or system font, clear hierarchy
 */

import { Platform, TextStyle } from 'react-native';

// Use Inter on Android (downloadable), SF Pro on iOS (system)
const fontFamily = Platform.select({
    ios: 'System',
    android: 'Inter',
    default: 'System',
});

export const typography = {
    // Display - for large headers
    displayLarge: {
        fontFamily,
        fontSize: 32,
        fontWeight: '700',
        lineHeight: 40,
        letterSpacing: -0.5,
    } as TextStyle,

    displayMedium: {
        fontFamily,
        fontSize: 28,
        fontWeight: '600',
        lineHeight: 36,
        letterSpacing: -0.25,
    } as TextStyle,

    // Headlines
    headlineLarge: {
        fontFamily,
        fontSize: 24,
        fontWeight: '600',
        lineHeight: 32,
    } as TextStyle,

    headlineMedium: {
        fontFamily,
        fontSize: 20,
        fontWeight: '600',
        lineHeight: 28,
    } as TextStyle,

    headlineSmall: {
        fontFamily,
        fontSize: 18,
        fontWeight: '500',
        lineHeight: 24,
    } as TextStyle,

    // Body
    bodyLarge: {
        fontFamily,
        fontSize: 16,
        fontWeight: '400',
        lineHeight: 24,
    } as TextStyle,

    bodyMedium: {
        fontFamily,
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 20,
    } as TextStyle,

    bodySmall: {
        fontFamily,
        fontSize: 12,
        fontWeight: '400',
        lineHeight: 16,
    } as TextStyle,

    // Labels
    labelLarge: {
        fontFamily,
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
        letterSpacing: 0.1,
    } as TextStyle,

    labelMedium: {
        fontFamily,
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 16,
        letterSpacing: 0.5,
    } as TextStyle,

    labelSmall: {
        fontFamily,
        fontSize: 11,
        fontWeight: '500',
        lineHeight: 16,
        letterSpacing: 0.5,
    } as TextStyle,

    // Monospace for code/technical
    mono: {
        fontFamily: Platform.select({
            ios: 'Menlo',
            android: 'monospace',
            default: 'monospace',
        }),
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 20,
    } as TextStyle,
} as const;

export type TypographyKey = keyof typeof typography;
