import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { GlassView } from './GlassView';
import { colors, spacing, typography, glyphs } from '../theme';
import { IdentityService } from '../services';

export const IdentityPulseWidget: React.FC = () => {
    const kernel = IdentityService.getKernel();
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.2,
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1500,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, [pulseAnim]);

    if (!kernel) return null;

    const energy = kernel.moodTrace?.energy || 'Sustained';
    const focus = kernel.moodTrace?.focus || 'Deep';

    return (
        <GlassView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.glyph}>{glyphs.truth}</Text>
                <Text style={styles.title}>IDENTITY PULSE</Text>
            </View>

            <View style={styles.content}>
                <View style={styles.pulseContainer}>
                    <Animated.View style={[
                        styles.pulseCircle,
                        { transform: [{ scale: pulseAnim }] }
                    ]} />
                    <View style={styles.innerCircle}>
                        <Text style={styles.energyVal}>{energy[0].toUpperCase()}</Text>
                    </View>
                </View>

                <View style={styles.metrics}>
                    <Metric label="Energy" value={energy} />
                    <Metric label="Focus" value={focus} />
                    <Metric label="Rhythm" value={kernel.moodTrace?.rhythm || 'Balanced'} />
                </View>
            </View>
        </GlassView>
    );
};

const Metric: React.FC<{ label: string, value: string }> = ({ label, value }) => (
    <View style={styles.metricItem}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
    </View>
);

const styles = StyleSheet.create({
    container: {
        height: 125,
        marginBottom: spacing.lg,
        padding: spacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    glyph: {
        fontSize: 14,
        color: colors.glyphTruth,
        marginRight: spacing.xs,
    },
    title: {
        ...typography.labelSmall,
        fontSize: 10,
        color: colors.textSecondary,
        letterSpacing: 2,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: spacing.xs,
    },
    pulseContainer: {
        width: 60,
        height: 60,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    pulseCircle: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.accentLight,
        opacity: 0.15,
        position: 'absolute',
    },
    innerCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.accentPrimary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 6,
    },
    energyVal: {
        color: colors.textPrimary,
        fontWeight: 'bold',
        fontSize: 18,
    },
    metrics: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingRight: spacing.sm,
    },
    metricItem: {
        alignItems: 'center',
    },
    metricLabel: {
        ...typography.labelSmall,
        fontSize: 9,
        color: colors.textMuted,
        marginBottom: 2,
        textTransform: 'uppercase',
    },
    metricValue: {
        ...typography.bodyMedium,
        fontSize: 13,
        color: colors.textPrimary,
        fontWeight: '600',
    },
});

export default IdentityPulseWidget;
