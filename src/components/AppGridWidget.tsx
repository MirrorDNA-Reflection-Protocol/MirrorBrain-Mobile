import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GlassView } from './GlassView';
import { colors, typography, spacing } from '../theme';

interface AppShortcut {
    id: string;
    label: string;
    icon: string; // Emoji for now, could be Image
    color: string;
}

const SHORTCUTS: AppShortcut[] = [
    { id: 'focus', label: 'Focus', icon: '🎯', color: '#EF4444' },
    { id: 'work', label: 'Work', icon: '💼', color: '#3B82F6' },
    { id: 'photos', label: 'Photos', icon: '🌸', color: '#EC4899' },
    { id: 'mail', label: 'Mail', icon: '✉️', color: '#10B981' },
];

export const AppGridWidget: React.FC = () => {
    return (
        <View style={styles.container}>
            <View style={styles.row}>
                {SHORTCUTS.slice(0, 2).map((app) => (
                    <AppIcon key={app.id} app={app} />
                ))}
            </View>
            <View style={styles.row}>
                {SHORTCUTS.slice(2, 4).map((app) => (
                    <AppIcon key={app.id} app={app} />
                ))}
            </View>
        </View>
    );
};

const AppIcon: React.FC<{ app: AppShortcut }> = ({ app }) => (
    <TouchableOpacity style={styles.appItem}>
        <View style={[styles.iconContainer, { backgroundColor: app.color }]}>
            <Text style={styles.icon}>{app.icon}</Text>
        </View>
        <Text style={styles.label}>{app.label}</Text>
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // No glass wrapper, icons float on background
        justifyContent: 'center',
        gap: spacing.md,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    appItem: {
        alignItems: 'center',
        width: 60,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24, // Circle
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: spacing.xs,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    icon: {
        fontSize: 24,
    },
    label: {
        ...typography.labelSmall,
        color: colors.glass.text,
        fontSize: 10,
        fontWeight: '600',
    },
});
