/**
 * NOW Panel — Daily Governor
 * From Spec Part III
 * 
 * Purpose: Prevent overthinking and decision spirals.
 * Provide orientation in under 60 seconds.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Animated,
    Modal,
    TextInput,
    FlatList,
} from 'react-native';
import { colors, typography, spacing, glyphs } from '../theme';
import type { NowPanelData, Signal } from '../types';
import {
    CalendarService,
    DeviceService,
    AppLauncherService,
    FocusTimerService,
    HapticService,
    FOCUS_DURATIONS,
    type CalendarEvent,
    type InstalledApp,
} from '../services';

interface NowScreenProps {
    isOnline: boolean;
    onToggleQuietMode?: () => void;
}

export const NowScreen: React.FC<NowScreenProps> = ({
    isOnline,
    onToggleQuietMode,
}) => {
    // Real-time clock state
    const [currentTime, setCurrentTime] = useState(new Date());
    const [refreshing, setRefreshing] = useState(false);
    const [quietMode, setQuietMode] = useState(false);
    const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
    const [batteryLevel, setBatteryLevel] = useState<number>(-1);
    const [isCharging, setIsCharging] = useState<boolean>(false);

    // App drawer
    const [showAppDrawer, setShowAppDrawer] = useState(false);

    // Focus timer
    const [showFocusModal, setShowFocusModal] = useState(false);
    const [focusRunning, setFocusRunning] = useState(false);
    const [focusRemaining, setFocusRemaining] = useState(0);
    const [focusTask, setFocusTask] = useState('');

    // Animation for pulse effect
    const [pulseAnim] = useState(new Animated.Value(1));

    // Real-time clock - updates every second
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Load device signals
    useEffect(() => {
        loadSignals();
        const signalInterval = setInterval(loadSignals, 60000);
        return () => clearInterval(signalInterval);
    }, []);

    // Focus timer subscription
    useEffect(() => {
        const unsubscribe = FocusTimerService.subscribe((session) => {
            setFocusRunning(FocusTimerService.isRunning());
            setFocusRemaining(FocusTimerService.getRemaining());
        });
        return unsubscribe;
    }, []);

    // Load calendar data on mount
    useEffect(() => {
        loadCalendarData();
    }, []);

    // Subtle pulse animation
    // Subtle pulse animation (Breathing)
    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.parallel([
                    Animated.timing(pulseAnim, { toValue: 1.05, duration: 3000, useNativeDriver: true }), // Slower, subtler scale
                ]),
                Animated.parallel([
                    Animated.timing(pulseAnim, { toValue: 1, duration: 3000, useNativeDriver: true }),
                ]),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [pulseAnim]);

    const loadSignals = async () => {
        const battery = await DeviceService.getBatteryLevel();
        setBatteryLevel(battery.level);
        setIsCharging(battery.charging);
    };

    const loadCalendarData = async () => {
        try {
            const event = await CalendarService.getNextEvent();
            setNextEvent(event);
        } catch (error) {
            console.log('Calendar not available');
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        HapticService.tap();
        loadCalendarData();
        loadSignals();
        setTimeout(() => setRefreshing(false), 300);
    }, []);

    const handleQuietToggle = () => {
        HapticService.select();
        setQuietMode(!quietMode);
        onToggleQuietMode?.();
    };

    const handleStartFocus = (duration: number) => {
        HapticService.success();
        FocusTimerService.start(duration, focusTask || undefined);
        setShowFocusModal(false);
        setFocusTask('');
    };

    const handleStopFocus = () => {
        HapticService.impact();
        FocusTimerService.stop();
    };

    const handleLaunchApp = async (app: InstalledApp) => {
        HapticService.tap();
        await AppLauncherService.launchApp(app.packageName);
        setShowAppDrawer(false);
    };

    // Formatted time components
    const timeStr = currentTime.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', second: '2-digit'
    });
    const dayName = currentTime.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = currentTime.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    const getGreeting = (): string => {
        const hour = currentTime.getHours();
        if (hour < 6) return 'Deep night';
        if (hour < 12) return 'Morning';
        if (hour < 17) return 'Afternoon';
        if (hour < 21) return 'Evening';
        return 'Night';
    };

    const whatMatters = [
        nextEvent ? `${nextEvent.title} at ${CalendarService.formatEventTime(nextEvent)}` : null,
        'MirrorBrain Mobile launch',
    ].filter(Boolean) as string[];

    const signals: Signal[] = [
        { type: 'battery', value: DeviceService.formatBattery({ level: batteryLevel, charging: isCharging }) },
    ];

    if (quietMode) {
        return (
            <View style={styles.container}>
                <View style={styles.quietContainer}>
                    <Animated.Text style={[styles.quietGlyph, { transform: [{ scale: pulseAnim }] }]}>
                        {glyphs.truth}
                    </Animated.Text>
                    <Text style={styles.quietTime}>{timeStr}</Text>
                    <Text style={styles.quietDate}>{dayName}, {dateStr}</Text>
                    <TouchableOpacity style={styles.expandButton} onPress={handleQuietToggle}>
                        <Text style={styles.expandButtonText}>Expand</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Online indicator */}
            {isOnline && (
                <View style={styles.onlineIndicator}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.onlineText}>Online</Text>
                </View>
            )}

            {/* Focus timer banner */}
            {focusRunning && (
                <TouchableOpacity style={styles.focusBanner} onPress={handleStopFocus}>
                    <Text style={styles.focusTime}>🎯 {FocusTimerService.formatTime(focusRemaining)}</Text>
                    <Text style={styles.focusHint}>Tap to stop</Text>
                </TouchableOpacity>
            )}

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Animated.Text style={[styles.glyph, { transform: [{ scale: pulseAnim }] }]}>
                        {glyphs.truth}
                    </Animated.Text>
                    <Text style={styles.title}>NOW</Text>
                </View>

                {/* Clock */}
                <View style={styles.clockSection}>
                    <Text style={styles.timeDisplay}>{timeStr}</Text>
                    <Text style={styles.dateDisplay}>{dayName}, {dateStr}</Text>
                    <Text style={styles.greetingText}>{getGreeting()}</Text>
                </View>

                {/* Quick actions */}
                <View style={styles.quickActions}>
                    <TouchableOpacity style={styles.quickAction} onPress={() => setShowFocusModal(true)}>
                        <Text style={styles.quickActionIcon}>🎯</Text>
                        <Text style={styles.quickActionLabel}>Focus</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.quickAction} onPress={() => setShowAppDrawer(true)}>
                        <Text style={styles.quickActionIcon}>📱</Text>
                        <Text style={styles.quickActionLabel}>Apps</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.quickAction} onPress={handleQuietToggle}>
                        <Text style={styles.quickActionIcon}>🌙</Text>
                        <Text style={styles.quickActionLabel}>Quiet</Text>
                    </TouchableOpacity>
                </View>

                {/* What matters */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>What matters today</Text>
                    {whatMatters.map((item, index) => (
                        <View key={index} style={styles.listItem}>
                            <Text style={styles.bullet}>•</Text>
                            <Text style={styles.listText}>{item}</Text>
                        </View>
                    ))}
                </View>

                {/* Signals */}
                <View style={styles.signalsSection}>
                    {signals.map((signal, index) => (
                        <View key={index} style={styles.signalBadge}>
                            <Text style={styles.signalIcon}>{DeviceService.getBatteryIcon(batteryLevel)}</Text>
                            <Text style={styles.signalText}>{signal.value}</Text>
                        </View>
                    ))}
                </View>

                <View style={{ height: 80 }} />
            </ScrollView>

            {/* Focus Modal */}
            <Modal visible={showFocusModal} transparent animationType="slide" onRequestClose={() => setShowFocusModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>🎯 Focus Session</Text>
                        <TextInput
                            style={styles.focusInput}
                            placeholder="What are you focusing on?"
                            placeholderTextColor={colors.textMuted}
                            value={focusTask}
                            onChangeText={setFocusTask}
                        />
                        <View style={styles.focusDurations}>
                            <TouchableOpacity style={styles.durationButton} onPress={() => handleStartFocus(FOCUS_DURATIONS.short)}>
                                <Text style={styles.durationText}>15m</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.durationButton} onPress={() => handleStartFocus(FOCUS_DURATIONS.standard)}>
                                <Text style={styles.durationText}>25m</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.durationButton} onPress={() => handleStartFocus(FOCUS_DURATIONS.long)}>
                                <Text style={styles.durationText}>45m</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={styles.cancelButton} onPress={() => setShowFocusModal(false)}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* App Drawer Modal */}
            <Modal visible={showAppDrawer} transparent animationType="slide" onRequestClose={() => setShowAppDrawer(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.drawerContent}>
                        <Text style={styles.modalTitle}>📱 Quick Apps</Text>
                        <FlatList
                            data={AppLauncherService.getFavoriteApps()}
                            numColumns={4}
                            keyExtractor={item => item.packageName}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={styles.appTile} onPress={() => handleLaunchApp(item)}>
                                    <Text style={styles.appIcon}>{AppLauncherService.getAppIcon(item.packageName)}</Text>
                                    <Text style={styles.appLabel} numberOfLines={1}>{item.label}</Text>
                                </TouchableOpacity>
                            )}
                        />
                        <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAppDrawer(false)}>
                            <Text style={styles.cancelText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    scrollContent: { padding: spacing.lg, paddingTop: spacing.md },

    // Online
    onlineIndicator: {
        position: 'absolute', top: spacing.md, right: spacing.lg, flexDirection: 'row',
        alignItems: 'center', zIndex: 10, backgroundColor: colors.surface,
        paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 12,
    },
    onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.online, marginRight: spacing.xs },
    onlineText: { ...typography.labelSmall, color: colors.online },

    // Focus banner
    focusBanner: {
        backgroundColor: colors.accentPrimary, padding: spacing.md, flexDirection: 'row',
        justifyContent: 'center', alignItems: 'center', gap: spacing.md,
    },
    focusTime: { ...typography.headlineMedium, color: colors.textPrimary },
    focusHint: { ...typography.labelSmall, color: colors.textPrimary, opacity: 0.8 },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    glyph: { fontSize: 28, color: colors.glyphTruth, marginRight: spacing.sm },
    title: { ...typography.displayLarge, color: colors.textPrimary, letterSpacing: 2 },

    // Clock
    clockSection: { marginBottom: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.surface },
    timeDisplay: { fontSize: 48, fontWeight: '200', color: colors.textPrimary, fontVariant: ['tabular-nums'], letterSpacing: 2 },
    dateDisplay: { ...typography.headlineSmall, color: colors.textSecondary, marginTop: spacing.xs },
    greetingText: { ...typography.labelMedium, color: colors.accentLight, marginTop: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },

    // Quick actions
    quickActions: { flexDirection: 'row', marginBottom: spacing.lg, gap: spacing.sm },
    quickAction: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, alignItems: 'center' },
    quickActionIcon: { fontSize: 24, marginBottom: spacing.xs },
    quickActionLabel: { ...typography.labelSmall, color: colors.textSecondary },

    // Section
    section: { marginBottom: spacing.lg },
    sectionLabel: { ...typography.labelMedium, color: colors.textSecondary, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
    listItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, paddingLeft: spacing.xs },
    bullet: { ...typography.bodyLarge, color: colors.accentPrimary, marginRight: spacing.sm, width: 16 },
    listText: { ...typography.bodyLarge, color: colors.textPrimary, flex: 1, lineHeight: 24 },

    // Signals
    signalsSection: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    signalBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: 8 },
    signalIcon: { fontSize: 14, marginRight: spacing.xs },
    signalText: { ...typography.labelSmall, color: colors.textSecondary },

    // Quiet mode
    quietContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    quietGlyph: { fontSize: 48, color: colors.glyphTruth, marginBottom: spacing.lg },
    quietTime: { fontSize: 56, fontWeight: '200', color: colors.textPrimary, fontVariant: ['tabular-nums'], letterSpacing: 2 },
    quietDate: { ...typography.headlineSmall, color: colors.textSecondary, marginTop: spacing.sm },
    expandButton: { marginTop: spacing.xxl, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
    expandButtonText: { ...typography.labelMedium, color: colors.textMuted },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xxl },
    modalTitle: { ...typography.headlineMedium, color: colors.textPrimary, marginBottom: spacing.lg, textAlign: 'center' },

    // Focus modal
    focusInput: { backgroundColor: colors.background, borderRadius: 12, padding: spacing.md, ...typography.bodyLarge, color: colors.textPrimary, marginBottom: spacing.md },
    focusDurations: { flexDirection: 'row', gap: spacing.sm },
    durationButton: { flex: 1, backgroundColor: colors.accentPrimary, borderRadius: 12, padding: spacing.md, alignItems: 'center' },
    durationText: { ...typography.headlineSmall, color: colors.textPrimary },
    cancelButton: { marginTop: spacing.md, padding: spacing.md, alignItems: 'center' },
    cancelText: { ...typography.labelMedium, color: colors.textMuted },

    // App drawer
    drawerContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xxl, maxHeight: '70%' },
    appTile: { flex: 1, alignItems: 'center', padding: spacing.md, minWidth: '25%' },
    appIcon: { fontSize: 32, marginBottom: spacing.xs },
    appLabel: { ...typography.labelSmall, color: colors.textSecondary, textAlign: 'center' },
});

export default NowScreen;
