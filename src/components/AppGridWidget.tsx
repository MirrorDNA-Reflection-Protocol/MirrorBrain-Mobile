import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { spacing } from '../theme';
import { AppLauncherService } from '../services';
import { HapticService } from '../services';

interface AppShortcut {
    id: string;
    label: string;
    icon: string;
    color: string;
    packageName: string;
}

export const AppGridWidget: React.FC = () => {
    const [shortcuts, setShortcuts] = React.useState<AppShortcut[]>([]);

    React.useEffect(() => {
        const contextualApps = AppLauncherService.getContextualShortcuts(4);
        const mappedShortcuts: AppShortcut[] = contextualApps.map(app => ({
            id: app.packageName,
            label: app.label,
            icon: app.icon || '📱',
            color: getAppColor(app.packageName),
            packageName: app.packageName
        }));
        setShortcuts(mappedShortcuts);
    }, []);

    const handlePress = async (app: AppShortcut) => {
        HapticService.tap();
        if (app.packageName) {
            try {
                await AppLauncherService.launchApp(app.packageName);
            } catch {
                console.log(`Could not launch ${app.label}`);
            }
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.row}>
                {shortcuts.slice(0, 2).map((app) => (
                    <AppIcon key={app.id} app={app} onPress={() => handlePress(app)} />
                ))}
            </View>
            <View style={styles.row}>
                {shortcuts.slice(2, 4).map((app) => (
                    <AppIcon key={app.id} app={app} onPress={() => handlePress(app)} />
                ))}
            </View>
        </View>
    );
};

// Helper to get consistent colors for apps
const getAppColor = (packageName: string): string => {
    const colors_map: Record<string, string> = {
        'com.android.chrome': '#4285F4',
        'com.google.android.apps.messaging': '#34A853',
        'com.google.android.dialer': '#EA4335',
        'com.google.android.apps.photos': '#FBBC05',
        'com.google.android.gm': '#D93025',
        'com.google.android.calendar': '#4285F4',
        'com.google.android.apps.maps': '#34A853',
        'com.spotify.music': '#1DB954',
        'org.telegram.messenger': '#0088CC',
        'com.whatsapp': '#25D366',
        'md.obsidian': '#7C3AED',
        'com.android.settings': '#6B7280',
    };
    return colors_map[packageName] || '#6366F1';
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

