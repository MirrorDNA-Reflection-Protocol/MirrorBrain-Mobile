import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { colors, borderRadius, spacing } from '../theme';

interface GlassViewProps {
    children: React.ReactNode;
    style?: ViewStyle;
    blurAmount?: number;
    blurType?: 'light' | 'dark' | 'xlight';
    variant?: 'default' | 'prominent' | 'subtle';
}

export const GlassView: React.FC<GlassViewProps> = ({
    children,
    style,
    blurAmount = 25,
    blurType = 'dark',
    variant = 'default'
}) => {
    const variantStyles = {
        default: styles.containerDefault,
        prominent: styles.containerProminent,
        subtle: styles.containerSubtle,
    };

    return (
        <View style={[styles.container, variantStyles[variant], style]}>
            {/* Glow effect behind */}
            <View style={styles.glowLayer} />

            <BlurView
                style={StyleSheet.absoluteFill}
                blurType={blurType}
                blurAmount={blurAmount}
                reducedTransparencyFallbackColor="rgba(20, 25, 40, 0.85)"
            />

            {/* Inner highlight border */}
            <View style={styles.innerHighlight} />

            <View style={styles.content}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        borderRadius: borderRadius.xl,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderWidth: 1,
        ...Platform.select({
            android: {
                elevation: 8,
            },
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.3,
                shadowRadius: 16,
            },
        }),
    },
    containerDefault: {},
    containerProminent: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        borderColor: 'rgba(255, 255, 255, 0.25)',
    },
    containerSubtle: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    glowLayer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(100, 150, 255, 0.03)',
        borderRadius: borderRadius.xl,
    },
    innerHighlight: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
    },
    content: {
        zIndex: 1,
    },
});

