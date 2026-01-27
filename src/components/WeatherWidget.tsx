import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlassView } from './GlassView';
import { colors, typography, spacing } from '../theme';

export const WeatherWidget: React.FC = () => {
    return (
        <GlassView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.location}>San Francisco</Text>
                <Text style={styles.temp}>12°</Text>
                <View style={styles.conditionRow}>
                    <Text style={styles.icon}>☁️</Text>
                    <View>
                        <Text style={styles.condition}>Partly Cloudy</Text>
                        <Text style={styles.range}>H:14° L:10°</Text>
                    </View>
                </View>
                <Text style={styles.source}>Weather</Text>
            </View>
        </GlassView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        aspectRatio: 1, // Square
        marginRight: spacing.md,
    },
    content: {
        padding: spacing.md,
        flex: 1,
        justifyContent: 'space-between',
    },
    location: {
        ...typography.labelSmall,
        color: colors.glass.text,
        textTransform: 'uppercase',
    },
    temp: {
        fontSize: 48,
        fontWeight: '200',
        color: colors.glass.text,
        marginVertical: spacing.xs,
    },
    conditionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    icon: {
        fontSize: 24,
        marginRight: spacing.sm,
    },
    condition: {
        ...typography.labelSmall,
        color: colors.glass.text,
        fontWeight: '600',
    },
    range: {
        ...typography.labelSmall,
        color: colors.glass.textSecondary,
    },
    source: {
        ...typography.labelSmall,
        color: colors.glass.textSecondary,
        textAlign: 'right',
        marginTop: spacing.sm,
    },
});
