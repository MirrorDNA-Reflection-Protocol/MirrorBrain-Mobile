import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { colors, borderRadius, spacing } from '../theme';

interface GlassViewProps {
    children: React.ReactNode;
    style?: ViewStyle;
    blurAmount?: number;
    blurType?: 'light' | 'dark' | 'xlight';
}

export const GlassView: React.FC<GlassViewProps> = ({
    children,
    style,
    blurAmount = 20,
    blurType = 'dark'
}) => {
    return (
        <View style={[styles.container, style]}>
            <BlurView
                style={StyleSheet.absoluteFill}
                blurType={blurType}
                blurAmount={blurAmount}
                reducedTransparencyFallbackColor="rgba(20, 20, 30, 0.9)"
            />
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
        backgroundColor: colors.glass.background,
        borderColor: colors.glass.border,
        borderWidth: 1,
    },
    content: {
        zIndex: 1,
    },
});
