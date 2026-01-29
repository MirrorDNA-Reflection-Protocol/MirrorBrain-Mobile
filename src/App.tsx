/**
 * MirrorBrain Mobile — Root App Component
 *
 * Sovereign launcher with 4 panels:
 * NOW → ASK → VAULT → ACTIONS
 *
 * Navigation: Horizontal swipe between panels. NOW is home.
 * Floating draggable pill nav can be moved anywhere on screen.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    ScrollView,
    StatusBar,
    TouchableOpacity,
    NativeSyntheticEvent,
    NativeScrollEvent,
    Animated,
    PanResponder,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { NowScreen, AskScreen, VaultScreen, ActionsScreen } from './screens';
import { IdentityImportModal } from './components';
import {
    VaultService,
    IdentityService,
    registerDeviceTools,
    PassiveIntelligenceService,
} from './services';
import { colors, typography, spacing, glyphs } from './theme';
import type { PanelName } from './types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Panel {
    key: PanelName;
    label: string;
    glyph: string;
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

    // Draggable nav position
    const pan = useRef(new Animated.ValueXY({ x: (SCREEN_WIDTH - 280) / 2, y: 60 })).current;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                // Only capture drag if moved more than 5px (avoids capturing taps)
                return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
            },
            onPanResponderGrant: () => {
                pan.setOffset({
                    x: (pan.x as any)._value,
                    y: (pan.y as any)._value,
                });
                pan.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: Animated.event(
                [null, { dx: pan.x, dy: pan.y }],
                { useNativeDriver: false }
            ),
            onPanResponderRelease: () => {
                pan.flattenOffset();
                // Clamp to screen bounds
                const x = Math.max(10, Math.min((pan.x as any)._value, SCREEN_WIDTH - 290));
                const y = Math.max(40, Math.min((pan.y as any)._value, SCREEN_HEIGHT - 100));
                Animated.spring(pan, {
                    toValue: { x, y },
                    useNativeDriver: false,
                    friction: 7,
                }).start();
            },
        })
    ).current;

    // Initialize services on mount
    useEffect(() => {
        initializeApp();
    }, []);

    const initializeApp = async () => {
        try {
            // Initialize vault storage
            await VaultService.initialize();

            // Check for existing identity
            const hasIdentity = IdentityService.hasIdentity();
            setIdentityLoaded(hasIdentity);

            // Register all device tools with orchestrator
            registerDeviceTools();

            // Initialize passive intelligence (clipboard watcher starts automatically)
            await PassiveIntelligenceService.initialize();

            // If no identity, prompt to import on first launch
            if (!hasIdentity) {
                // Small delay to let UI render first
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
        {
            key: 'NOW',
            label: 'NOW',
            glyph: glyphs.truth,
            component: <NowScreen isOnline={isOnline} />,
        },
        {
            key: 'ASK',
            label: 'ASK',
            glyph: glyphs.synthesis,
            component: (
                <AskScreen
                    isOnline={isOnline}
                    onToggleOnline={handleToggleOnline}
                    identityLoaded={identityLoaded}
                />
            ),
        },
        {
            key: 'VAULT',
            label: 'VAULT',
            glyph: glyphs.pattern,
            component: <VaultScreen onLockSwipe={setIsGraphActive} />,
        },
        {
            key: 'ACTIONS',
            label: 'ACTIONS',
            glyph: glyphs.decision,
            component: <ActionsScreen />,
        },
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
        <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.container}
        >
            <StatusBar
                barStyle="light-content"
                backgroundColor={colors.gradientStart}
                translucent={false}
            />

            {/* Full-screen panel content */}
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

            {/* Floating draggable navigation pill */}
            <Animated.View
                style={[
                    styles.floatingNav,
                    {
                        transform: [
                            { translateX: pan.x },
                            { translateY: pan.y },
                        ],
                    },
                ]}
                {...panResponder.panHandlers}
            >
                {/* Progress bar inside pill */}
                <View style={styles.progressContainer}>
                    <View
                        style={[
                            styles.progressBar,
                            { width: `${((currentIndex + 1) / panels.length) * 100}%` }
                        ]}
                    />
                </View>

                {/* Nav items */}
                <View style={styles.navItems}>
                    {panels.map((panel, index) => (
                        <TouchableOpacity
                            key={panel.key}
                            style={[
                                styles.navItem,
                                currentPanel === panel.key && styles.navItemActive,
                            ]}
                            onPress={() => scrollToPanel(index)}
                            activeOpacity={0.7}
                        >
                            <Text style={[
                                styles.navGlyph,
                                currentPanel === panel.key && styles.navGlyphActive,
                            ]}>
                                {panel.glyph}
                            </Text>
                            <Text style={[
                                styles.navLabel,
                                currentPanel === panel.key && styles.navLabelActive,
                            ]}>
                                {panel.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Drag handle indicator */}
                <View style={styles.dragHandle} />
            </Animated.View>

            {/* Swipe hint for first-time users */}
            {currentIndex === 0 && (
                <View style={styles.swipeHint}>
                    <Text style={styles.swipeHintText}>← Swipe to explore →</Text>
                </View>
            )}

            {/* Identity import modal */}
            <IdentityImportModal
                visible={showIdentityModal}
                onClose={() => setShowIdentityModal(false)}
                onImportComplete={handleIdentityImported}
            />
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    contentContainer: {
        flex: 1,
    },

    // Floating navigation pill
    floatingNav: {
        position: 'absolute',
        width: 280,
        backgroundColor: 'rgba(20, 20, 25, 0.95)',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.accentPrimary,
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 15,
        overflow: 'hidden',
    },
    progressContainer: {
        height: 3,
        backgroundColor: colors.surface,
    },
    progressBar: {
        height: '100%',
        backgroundColor: colors.accentPrimary,
    },
    navItems: {
        flexDirection: 'row',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.xs,
    },
    navItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: spacing.xs,
        borderRadius: 12,
    },
    navItemActive: {
        backgroundColor: colors.accentDark,
    },
    navGlyph: {
        fontSize: 18,
        color: colors.textMuted,
        marginBottom: 2,
    },
    navGlyphActive: {
        color: colors.accentPrimary,
    },
    navLabel: {
        ...typography.labelSmall,
        color: colors.textMuted,
        fontSize: 9,
    },
    navLabelActive: {
        color: colors.textPrimary,
    },
    dragHandle: {
        width: 40,
        height: 4,
        backgroundColor: colors.textMuted,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: spacing.xs,
        opacity: 0.5,
    },

    // Swipe hint
    swipeHint: {
        position: 'absolute',
        bottom: spacing.xl,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    swipeHintText: {
        ...typography.labelSmall,
        color: colors.textMuted,
        backgroundColor: colors.surface,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: 12,
        overflow: 'hidden',
    },
});

export default App;
