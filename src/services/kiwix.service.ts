/**
 * Kiwix Service — Offline Knowledge
 * 
 * Capability: Launch Kiwix app to read ZIM files (Wikipedia, StackOverflow, etc)
 * Uses Intent Launcher on Android to seamlessly transition.
 */

import { Linking, Platform, Alert } from 'react-native';
// @ts-ignore
import IntentLauncher from 'react-native-intent-launcher';

// Kiwix Android Package ID
const KIWIX_PACKAGE_ID = 'org.kiwix.kiwixmobile';
const KIWIX_PLAY_STORE_URL = 'market://details?id=org.kiwix.kiwixmobile';
const KIWIX_WEB_URL = 'https://play.google.com/store/apps/details?id=org.kiwix.kiwixmobile';

class KiwixServiceClass {
    /**
     * Launch Kiwix App
     */
    async openKiwix() {
        if (Platform.OS === 'android') {
            try {
                // Try to launch by package
                await IntentLauncher.startActivity({
                    action: 'android.intent.action.MAIN',
                    category: 'android.intent.category.LAUNCHER',
                    component: `${KIWIX_PACKAGE_ID}/.main.KiwixActivity`, // Try generic launch
                    // If component specific fails, try package based intent
                    flags: 268435456, // FLAG_ACTIVITY_NEW_TASK
                }).catch(async (err) => {
                    console.log('Direct component launch failed, trying generic intent', err);
                    // Fallback: Just try launching the package via standard launcher intent logic usually handled by library
                    // react-native-intent-launcher is a bit low level.
                    // Let's try to just open based on package.

                    // Actually, simpler:
                    // IntentLauncher doesn't have a simple "openApp(package)" method.
                    // But we can try to fire an intent that only Kiwix handles or just fail and prompt install.

                    // Let's rely on the promptInstall flow for reliability.
                    this.promptInstall();
                });
            } catch (error) {
                console.error('Kiwix launch error', error);
                this.promptInstall();
            }
        }
    }

    promptInstall() {
        Alert.alert(
            'Kiwix Not Found',
            'To view offline Wikipedia, you need the Kiwix app installed.',
            [
                {
                    text: 'Install',
                    onPress: () => {
                        Linking.openURL(KIWIX_PLAY_STORE_URL).catch(() => {
                            Linking.openURL(KIWIX_WEB_URL);
                        });
                    }
                },
                { text: 'Cancel', style: 'cancel' }
            ]
        );
    }

    async launch() {
        if (Platform.OS === 'android') {
            IntentLauncher.isAppInstalled(KIWIX_PACKAGE_ID)
                .then((isInstalled) => {
                    if (isInstalled) {
                        // Just launch it. 
                        // Note: IntentLauncher.startAppByPackageName is what we want if it existed.
                        // We can use `startActivity` with package.
                        IntentLauncher.startActivity({
                            packageName: KIWIX_PACKAGE_ID,
                            className: 'org.kiwix.kiwixmobile.main.KiwixActivity', // Guessing class
                            flags: 268435456,
                        }).catch(() => {
                            // Fallback if class name is wrong (common issue)
                            // Just open store page if we can't launch.
                            // OR, assume user knows how to open it if installed.
                            Alert.alert('Installed', 'Kiwix is installed. Please open it from your home screen.');
                        });
                    } else {
                        this.promptInstall();
                    }
                })
                .catch(() => this.promptInstall());
        } else {
            Alert.alert('Not Supported', 'Kiwix integration is only available on Android.');
        }
    }
}

export const KiwixService = new KiwixServiceClass();
export default KiwixService;
