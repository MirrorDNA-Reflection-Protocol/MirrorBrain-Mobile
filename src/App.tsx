/**
 * MirrorBrain Mobile — Root App Component
 *
 * Sovereign launcher with 5 panels (PULSE first).
 * Navigation: Swipe. Minimal dot indicator.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    StatusBar,
    TouchableOpacity,
    NativeSyntheticEvent,
    NativeScrollEvent,
    Platform,
    useWindowDimensions,
} from 'react-native';
import { PulseScreen, NowScreen, AskScreen, VaultScreen, ActionsScreen } from './screens';
import { IdentityImportModal, hasSeedBeenSkipped } from './components';
import {
    VaultService,
    IdentityService,
    registerDeviceTools,
    PassiveIntelligenceService,
    MobileBusService,
    MeshService,
    OverlayService,
    GestureService,
    HapticService,
} from './services';
import { colors, spacing } from './theme';
import { moderateScale } from './theme/responsive';
import type { PanelName } from './types';

interface Panel {
    key: PanelName;
    component: React.ReactNode;
}

export const App: React.FC = () => {
    const { width: screenWidth } = useWindowDimensions();
    const scrollViewRef = useRef<ScrollView>(null);
    const [currentPanel, setCurrentPanel] = useState<PanelName>('PULSE');
    const [isOnline, setIsOnline] = useState(false);
    const [identityLoaded, setIdentityLoaded] = useState(false);
    const [showIdentityModal, setShowIdentityModal] = useState(false);
    const [isGraphActive, setIsGraphActive] = useState(false);
    const [panelHeight, setPanelHeight] = useState(0);

    useEffect(() => {
        initializeApp();
    }, []);

    const initializeApp = async () => {
        try {
            await VaultService.initialize();
            const hasIdentity = IdentityService.hasIdentity();
            setIdentityLoaded(hasIdentity);
            registerDeviceTools();
            await PassiveIntelligenceService.initialize();

            // Initialize Mobile Bus for hub communication
            await MobileBusService.initialize();

            // Initialize Mesh Service with auto-connect for agent communication
            try {
                await MeshService.initialize();
                await MeshService.connect();
                console.log('[App] Mesh service connected');
            } catch (meshError) {
                console.warn('[App] Mesh service failed to connect:', meshError);
            }

            // Start floating overlay bubble (if permission granted)
            try {
                const hasOverlayPerm = await OverlayService.hasPermission();
                if (hasOverlayPerm) {
                    await OverlayService.start();
                    OverlayService.onQuery((event) => {
                        // Navigate to ASK panel when user queries from overlay
                        scrollViewRef.current?.scrollTo({ x: 2 * screenWidth, animated: true });
                        setCurrentPanel('ASK');
                        console.log('[App] Overlay query:', event.query);
                    });
                    console.log('[App] Overlay bubble started');
                }
            } catch (overlayError) {
                console.warn('[App] Overlay service failed:', overlayError);
            }

            // Start shake gesture detection
            try {
                await GestureService.start();
                GestureService.onGesture((event) => {
                    if (event.type === 'shake') {
                        HapticService.impact();
                        // Shake → jump to ASK panel
                        scrollViewRef.current?.scrollTo({ x: 2 * screenWidth, animated: true });
                        setCurrentPanel('ASK');
                        console.log('[App] Shake detected, navigating to ASK');
                    }
                });
                console.log('[App] Gesture service started');
            } catch (gestureError) {
                console.warn('[App] Gesture service failed:', gestureError);
            }

            if (!hasIdentity) {
                const skipped = await hasSeedBeenSkipped();
                if (!skipped) {
                    setTimeout(() => setShowIdentityModal(true), 1000);
                }
            }
        } catch (error) {
            console.error('Failed to initialize app:', error);
        }
    };

    const handleToggleOnline = useCallback(() => {
        setIsOnline(prev => !prev);
    }, []);

    const handleIdentityImported = () => {
        setIdentityLoaded(true);
    };

    const panels: Panel[] = [
        { key: 'PULSE', component: <PulseScreen /> },
        { key: 'NOW', component: <NowScreen isOnline={isOnline} /> },
        {
            key: 'ASK',
            component: (
                <AskScreen
                    isOnline={isOnline}
                    onToggleOnline={handleToggleOnline}
                    identityLoaded={identityLoaded}
                />
            ),
        },
        { key: 'VAULT', component: <VaultScreen onLockSwipe={setIsGraphActive} /> },
        { key: 'ACTIONS', component: <ActionsScreen /> },
    ];

    const handleScrollEnd = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const offsetX = event.nativeEvent.contentOffset.x;
            const index = Math.round(offsetX / screenWidth);
            if (index >= 0 && index < panels.length) {
                setCurrentPanel(panels[index].key);
                // Exit graph mode when swiping away from VAULT
                if (panels[index].key !== 'VAULT' && isGraphActive) {
                    setIsGraphActive(false);
                }
            }
        },
        [panels, isGraphActive]
    );

    const scrollToPanel = (index: number) => {
        // Exit graph mode when navigating away from VAULT via dots
        if (isGraphActive && panels[index].key !== 'VAULT') {
            setIsGraphActive(false);
        }
        scrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
    };

    const currentIndex = panels.findIndex(p => p.key === currentPanel);

    return (
        <View style={styles.container}>
            <StatusBar
                barStyle="light-content"
                backgroundColor="#000000"
                translucent={false}
            />

            {/* Panel content */}
            <View
                style={styles.contentContainer}
                onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
            >
                {panelHeight > 0 && (
                    <ScrollView
                        ref={scrollViewRef}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        bounces={false}
                        onMomentumScrollEnd={handleScrollEnd}
                        scrollEventThrottle={16}
                        nestedScrollEnabled={true}
                    >
                        {panels.map((panel) => (
                            <View key={panel.key} style={{ width: screenWidth, height: panelHeight }}>
                                {panel.component}
                            </View>
                        ))}
                    </ScrollView>
                )}
            </View>

            {/* Ultra-minimal dot indicator */}
            <View style={styles.navContainer}>
                <View style={styles.dotsRow}>
                    {panels.map((panel, index) => (
                        <TouchableOpacity
                            key={panel.key}
                            onPress={() => scrollToPanel(index)}
                            style={styles.dotTouch}
                            activeOpacity={0.7}
                        >
                            <View
                                style={[
                                    styles.dot,
                                    currentIndex === index && styles.dotActive,
                                ]}
                            />
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <IdentityImportModal
                visible={showIdentityModal}
                onClose={() => setShowIdentityModal(false)}
                onImportComplete={handleIdentityImported}
            />
        </View>
    );
};

const STATUSBAR_HEIGHT = Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        paddingTop: STATUSBAR_HEIGHT,
    },
    contentContainer: {
        flex: 1,
    },

    // Ultra-minimal navigation
    navContainer: {
        backgroundColor: '#000000',
        paddingBottom: moderateScale(28),
        paddingTop: moderateScale(12),
    },
    dotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: moderateScale(12),
    },
    dotTouch: {
        padding: moderateScale(8),
    },
    dot: {
        width: moderateScale(6),
        height: moderateScale(6),
        borderRadius: moderateScale(3),
        backgroundColor: colors.textMuted,
        opacity: 0.4,
    },
    dotActive: {
        backgroundColor: '#f59e0b', // Amber from branding
        opacity: 1,
        width: moderateScale(8),
        height: moderateScale(8),
        borderRadius: moderateScale(4),
    },
});

export default App;
