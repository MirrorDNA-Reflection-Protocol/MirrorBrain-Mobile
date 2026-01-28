/**
 * MirrorBrain Mobile — Root App Component
 * 
 * Sovereign launcher with 4 panels:
 * NOW → ASK → VAULT → ACTIONS
 * 
 * Navigation: Horizontal swipe between panels. NOW is home.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    FlatList,
    StatusBar,
    SafeAreaView,
    TouchableOpacity,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { NowScreen, AskScreen, VaultScreen, ActionsScreen } from './screens';
import { IdentityImportModal } from './components';
import {
    VaultService,
    IdentityService,
    SearchService,
    OrchestratorService,
    AppLauncherService,
    WeatherService
} from './services';
import { colors, typography, spacing, glyphs } from './theme';
import type { PanelName } from './types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Panel {
    key: PanelName;
    label: string;
    glyph: string;
    component: React.ReactNode;
}

export const App: React.FC = () => {
    const flatListRef = useRef<FlatList>(null);
    const [currentPanel, setCurrentPanel] = useState<PanelName>('NOW');
    const [isOnline, setIsOnline] = useState(false);
    const [identityLoaded, setIdentityLoaded] = useState(false);
    const [showIdentityModal, setShowIdentityModal] = useState(false);
    const [isGraphActive, setIsGraphActive] = useState(false);

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

            // Register Orchestrator Tools
            OrchestratorService.registerTools([
                {
                    name: 'launch_app',
                    description: 'Launch an installed android application by package name',
                    parameters: {
                        type: 'object',
                        properties: {
                            packageName: { type: 'string', description: 'Package name (e.g. com.spotify.music)' }
                        },
                        required: ['packageName']
                    },
                    execute: async ({ packageName }: { packageName?: string }) => {
                        const success = await AppLauncherService.launchApp(packageName || '');
                        return { success, data: success ? 'App launched' : 'Failed to launch app' };
                    }
                },
                {
                    name: 'get_weather',
                    description: 'Get current weather for user location',
                    parameters: { type: 'object', properties: {} },
                    execute: async () => {
                        const weather = await WeatherService.getWeather();
                        return { success: true, data: weather };
                    }
                },
                {
                    name: 'capture_note',
                    description: 'Save a text note to the user vault',
                    parameters: {
                        type: 'object',
                        properties: {
                            content: { type: 'string', description: 'Note content' },
                            title: { type: 'string', description: 'Optional title' }
                        },
                        required: ['content']
                    },
                    execute: async ({ content, title }: { content?: string; title?: string }) => {
                        const id = await VaultService.saveCapture('note', content || '', title || '');
                        return { success: !!id, data: { id } };
                    }
                },
                {
                    name: 'search_web',
                    description: 'Search the web for real-time information with citations',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query' }
                        },
                        required: ['query']
                    },
                    execute: async ({ query }: { query?: string }) => {
                        const response = await SearchService.search(query || '');
                        return { success: true, data: response };
                    }
                }
            ]);

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

    const handleViewableItemsChanged = useCallback(
        ({ viewableItems }: { viewableItems: Array<{ key?: string }> }) => {
            if (viewableItems.length > 0 && viewableItems[0].key) {
                setCurrentPanel(viewableItems[0].key as PanelName);
            }
        },
        []
    );

    const viewabilityConfig = {
        itemVisiblePercentThreshold: 50,
    };

    const scrollToPanel = (index: number) => {
        flatListRef.current?.scrollToIndex({ index, animated: true });
    };

    const renderPanel = ({ item }: { item: Panel }) => (
        <View style={styles.panelContainer}>
            {item.component}
        </View>
    );

    const currentIndex = panels.findIndex(p => p.key === currentPanel);

    return (
        <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            style={styles.container}
        >
            <SafeAreaView style={styles.contentContainer}>
                <StatusBar
                    barStyle="light-content"
                    backgroundColor="transparent"
                    translucent={true}
                />

                {/* Top navigation bar */}
                <View style={styles.navBar}>
                    {panels.map((panel, index) => (
                        <TouchableOpacity
                            key={panel.key}
                            style={[
                                styles.navItem,
                                currentPanel === panel.key && styles.navItemActive,
                            ]}
                            onPress={() => scrollToPanel(index)}
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

                {/* Progress indicator */}
                <View style={styles.progressContainer}>
                    <View
                        style={[
                            styles.progressBar,
                            { width: `${((currentIndex + 1) / panels.length) * 100}%` }
                        ]}
                    />
                </View>

                {/* Horizontal panel navigation */}
                <FlatList
                    ref={flatListRef}
                    data={panels}
                    keyExtractor={item => item.key}
                    renderItem={renderPanel}
                    horizontal
                    pagingEnabled
                    scrollEnabled={currentPanel !== 'VAULT' || !isGraphActive}
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    onViewableItemsChanged={handleViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    getItemLayout={(_, index) => ({
                        length: SCREEN_WIDTH,
                        offset: SCREEN_WIDTH * index,
                        index,
                    })}
                    initialScrollIndex={0}
                    decelerationRate="fast"
                    snapToInterval={SCREEN_WIDTH}
                    snapToAlignment="start"
                />

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
            </SafeAreaView>
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
    panelContainer: {
        width: SCREEN_WIDTH,
        flex: 1,
    },

    // Navigation bar
    navBar: {
        flexDirection: 'row',
        backgroundColor: colors.glass.background, // Glass effect
        borderColor: colors.glass.border,
        borderBottomWidth: 1,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.xs,
    },
    navItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: spacing.xs,
        borderRadius: 8,
    },
    navItemActive: {
        backgroundColor: colors.surfaceElevated,
    },
    navGlyph: {
        fontSize: 16,
        color: colors.textMuted,
        marginBottom: 2,
    },
    navGlyphActive: {
        color: colors.accentPrimary,
    },
    navLabel: {
        ...typography.labelSmall,
        color: colors.textMuted,
        fontSize: 10,
    },
    navLabelActive: {
        color: colors.textPrimary,
    },

    // Progress indicator
    progressContainer: {
        height: 2,
        backgroundColor: colors.surface,
    },
    progressBar: {
        height: '100%',
        backgroundColor: colors.accentPrimary,
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
