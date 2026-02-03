/**
 * MirrorBrain Mobile — Root App Component
 *
 * Sovereign launcher with 4 panels.
 * Navigation: Swipe. Minimal dot indicator.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Dimensions,
    ScrollView,
    StatusBar,
    TouchableOpacity,
    NativeSyntheticEvent,
    NativeScrollEvent,
    Platform,
} from 'react-native';
import { NowScreen, AskScreen, VaultScreen, ActionsScreen } from './screens';
import { IdentityImportModal } from './components';
import {
    VaultService,
    IdentityService,
    registerDeviceTools,
    PassiveIntelligenceService,
    MobileBusService,
    MeshService,
} from './services';
import { colors, spacing } from './theme';
import type { PanelName } from './types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Panel {
    key: PanelName;
    component: React.ReactNode;
}

export const App: React.FC = () => {
    const scrollViewRef = useRef<ScrollView>(null);
    const [currentPanel, setCurrentPanel] = useState<PanelName>('NOW');
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

            if (!hasIdentity) {
                setTimeout(() => setShowIdentityModal(true), 1000);
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
            const index = Math.round(offsetX / SCREEN_WIDTH);
            if (index >= 0 && index < panels.length) {
                setCurrentPanel(panels[index].key);
            }
        },
        [panels]
    );

    const scrollToPanel = (index: number) => {
        scrollViewRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
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
                        scrollEnabled={currentPanel !== 'VAULT' || !isGraphActive}
                        showsHorizontalScrollIndicator={false}
                        bounces={false}
                        onMomentumScrollEnd={handleScrollEnd}
                        scrollEventThrottle={16}
                    >
                        {panels.map((panel) => (
                            <View key={panel.key} style={{ width: SCREEN_WIDTH, height: panelHeight }}>
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
        paddingBottom: 28, // Clear of gesture bar
        paddingTop: 12,
    },
    dotsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    dotTouch: {
        padding: 8,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.textMuted,
        opacity: 0.4,
    },
    dotActive: {
        backgroundColor: '#f59e0b', // Amber from branding
        opacity: 1,
        width: 8,
        height: 8,
        borderRadius: 4,
    },
});

export default App;
