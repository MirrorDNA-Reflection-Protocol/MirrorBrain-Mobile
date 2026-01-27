import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { colors, spacing } from '../theme';
import { AppLauncherService } from '../services';
import { HapticService } from '../services';

interface AppShortcut {
    id: string;
    label: string;
    icon: string;
    color: string;
    packageName?: string;
}

const SHORTCUTS: AppShortcut[] = [
    { id: 'vault', label: 'Vault', icon: '🗄️', color: '#6366F1', packageName: 'md.obsidian' },
    { id: 'camera', label: 'Camera', icon: '📷', color: '#3B82F6', packageName: 'com.google.android.camera' },
    { id: 'files', label: 'Files', icon: '📁', color: '#10B981', packageName: 'com.google.android.apps.nbu.files' },
    { id: 'notes', label: 'Notes', icon: '📝', color: '#F59E0B', packageName: 'com.google.android.keep' },
];

export const AppGridWidget: React.FC = () => {
    const handlePress = async (app: AppShortcut) => {
        HapticService.tap();
        if (app.packageName) {
            try {
                await AppLauncherService.launchApp(app.packageName);
            } catch (error) {
                console.log(`Could not launch ${app.label}`);
            }
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.row}>
                {SHORTCUTS.slice(0, 2).map((app) => (
                    <AppIcon key={app.id} app={app} onPress={() => handlePress(app)} />
                ))}
            </View>
            <View style={styles.row}>
                {SHORTCUTS.slice(2, 4).map((app) => (
                    <AppIcon key={app.id} app={app} onPress={() => handlePress(app)} />
                ))}
            </View>
        </View>
    );
};

interface AppIconProps {
    app: AppShortcut;
    onPress: () => void;
}

const AppIcon: React.FC<AppIconProps> = ({ app, onPress }) => (
    <TouchableOpacity style={styles.appItem} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.iconContainer, { backgroundColor: app.color }]}>
            <Text style={styles.icon}>{app.icon}</Text>
        </View>
        <Text style={styles.label}>{app.label}</Text>
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        gap: spacing.sm,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        gap: spacing.sm,
    },
    appItem: {
        alignItems: 'center',
        width: 68,
    },
    iconContainer: {
        width: 54,
        height: 54,
        borderRadius: 14, // Rounded square like iOS
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 6,
        ...Platform.select({
            android: {
                elevation: 6,
            },
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.25,
                shadowRadius: 5,
            },
        }),
    },
    icon: {
        fontSize: 26,
    },
    label: {
        fontSize: 11,
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.85)',
        textAlign: 'center',
    },
});

