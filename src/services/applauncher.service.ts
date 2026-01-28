/**
 * App Launcher Service — Installed Apps
 * 
 * List and launch installed applications.
 * Makes MirrorBrain a true home screen launcher.
 */

import { Linking, Platform } from 'react-native';

export interface InstalledApp {
    packageName: string;
    label: string;
    icon?: string;
}

// Favorite/pinned apps for quick access
const FAVORITE_APPS = [
    { packageName: 'com.android.chrome', label: 'Chrome' },
    { packageName: 'com.google.android.apps.messaging', label: 'Messages' },
    { packageName: 'com.google.android.dialer', label: 'Phone' },
    { packageName: 'com.google.android.apps.photos', label: 'Photos' },
    { packageName: 'com.google.android.gm', label: 'Gmail' },
    { packageName: 'com.google.android.calendar', label: 'Calendar' },
    { packageName: 'com.google.android.apps.maps', label: 'Maps' },
    { packageName: 'com.spotify.music', label: 'Spotify' },
    { packageName: 'org.telegram.messenger', label: 'Telegram' },
    { packageName: 'com.whatsapp', label: 'WhatsApp' },
    { packageName: 'md.obsidian', label: 'Obsidian' },
    { packageName: 'com.android.settings', label: 'Settings' },
];

class AppLauncherServiceClass {
    /**
     * Get favorite apps for the drawer
     */
    getFavoriteApps(): InstalledApp[] {
        return FAVORITE_APPS;
    }

    /**
     * Get contextual shortcuts for the NOW screen based on time of day
     */
    getContextualShortcuts(limit: number = 4): InstalledApp[] {
        const hour = new Date().getHours();

        // Contextual buckets based on daily rhythm
        let preferredPackages: string[] = [];

        if (hour >= 5 && hour < 10) { // Morning (5 AM - 10 AM)
            preferredPackages = ['com.spotify.music', 'com.google.android.calendar', 'com.google.android.gm', 'com.android.chrome'];
        } else if (hour >= 10 && hour < 18) { // Work Hours (10 AM - 6 PM)
            preferredPackages = ['md.obsidian', 'com.google.android.calendar', 'org.telegram.messenger', 'com.google.android.gm'];
        } else if (hour >= 18 && hour < 22) { // Evening (6 PM - 10 PM)
            preferredPackages = ['com.whatsapp', 'com.spotify.music', 'com.google.android.apps.photos', 'com.android.chrome'];
        } else { // Night (10 PM - 5 AM)
            preferredPackages = ['com.whatsapp', 'com.google.android.apps.messaging', 'com.google.android.dialer', 'com.android.settings'];
        }

        return preferredPackages
            .map(pkg => {
                const app = FAVORITE_APPS.find(a => a.packageName === pkg);
                return {
                    packageName: pkg,
                    label: app?.label || 'App',
                    icon: this.getAppIcon(pkg)
                };
            })
            .slice(0, limit);
    }

    /**
     * Launch an app by package name
     */
    async launchApp(packageName: string): Promise<boolean> {
        try {
            if (Platform.OS !== 'android') {
                console.log('App launch only works on Android');
                return false;
            }

            // Try standard approach first
            const canOpen = await Linking.canOpenURL(`package:${packageName}`);
            if (canOpen) {
                await Linking.openURL(`package:${packageName}`);
                return true;
            }

            // Fallback: try opening via Play Store link pattern
            // This works for most apps
            await Linking.openURL(`market://launch?id=${packageName}`);
            return true;
        } catch (error) {
            console.error('Failed to launch app:', packageName, error);
            return false;
        }
    }

    /**
     * Open Android app drawer
     */
    async openAppDrawer(): Promise<void> {
        // On pure Android, the launcher handles this
        // This is a placeholder for when we implement custom app list
        console.log('App drawer requested');
    }

    /**
     * Get icon for app (emoji fallback)
     */
    getAppIcon(packageName: string): string {
        const icons: Record<string, string> = {
            'com.android.chrome': '🌐',
            'com.google.android.apps.messaging': '💬',
            'com.google.android.dialer': '📞',
            'com.google.android.apps.photos': '🖼️',
            'com.google.android.gm': '📧',
            'com.google.android.calendar': '📅',
            'com.google.android.apps.maps': '🗺️',
            'com.spotify.music': '🎵',
            'org.telegram.messenger': '✈️',
            'com.whatsapp': '💬',
            'md.obsidian': '🗄️',
            'com.android.settings': '⚙️',
        };
        return icons[packageName] || '📱';
    }
}

// Singleton export
export const AppLauncherService = new AppLauncherServiceClass();

export default AppLauncherService;
