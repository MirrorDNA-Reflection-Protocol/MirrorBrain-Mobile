/**
 * NOW Panel — Glass Mirror Design
 * 
 * Purpose: Aesthetic orientation.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
} from 'react-native';

import { colors, typography, spacing } from '../theme';
import { GlassView, WeatherWidget, AppGridWidget, IdentityPulseWidget, Logo } from '../components';
import {
    CalendarService,
    HapticService,
    type CalendarEvent,
} from '../services';

interface NowScreenProps {
    isOnline: boolean;
    onToggleQuietMode?: () => void;
}

export const NowScreen: React.FC<NowScreenProps> = () => {
    // Real-time clock state
    const [currentTime, setCurrentTime] = useState(new Date());
    const [refreshing, setRefreshing] = useState(false);
    const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);

    // Real-time clock - updates every second
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Load calendar data on mount
    useEffect(() => {
        loadCalendarData();
    }, []);

    const loadCalendarData = async () => {
        try {
            const event = await CalendarService.getNextEvent();
            setNextEvent(event);
        } catch {
            console.log('Calendar not available');
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        HapticService.tap();
        loadCalendarData();
        setTimeout(() => setRefreshing(false), 300);
    }, []);

    // Formatted time components
    const timeStr = currentTime.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit'
    });
    const dayName = currentTime.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = currentTime.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    const getGreeting = (): string => {
        const hour = currentTime.getHours();
        if (hour < 6) return 'Deep Night';
        if (hour < 12) return 'Good Morning';
        if (hour < 17) return 'Good Afternoon';
        if (hour < 21) return 'Good Evening';
        return 'Good Night';
    };

    return (
        <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />
            }
            showsVerticalScrollIndicator={false}
        >
            {/* Header / Greeting */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <Logo size={40} showGlow animated style={styles.logo} />
                    <Text style={styles.brandText}>Active Mirror</Text>
                </View>
                <Text style={styles.dateDisplay}>{timeStr} • {dayName} {dateStr}</Text>
                <Text style={styles.greetingText}>{getGreeting()}</Text>
            </View>

            {/* Widget Row 1 */}
            <View style={styles.widgetRow}>
                <WeatherWidget />
                <View style={styles.appGridContainer}>
                    <AppGridWidget />
                </View>
            </View>

            {/* Identity Pulse */}
            <IdentityPulseWidget />

            {/* Calendar Widget */}
            <GlassView style={styles.calendarWidget}>
                <View style={styles.calendarContent}>
                    <View style={styles.timelineContainer}>
                        {/* Mock Timeline lines */}
                        <View style={styles.timelineLine} />
                        <View style={[styles.timelineLine, { marginTop: 24, width: 2 }]} />
                        <View style={[styles.timelineLine, { marginTop: 48, width: 2 }]} />
                    </View>
                    <View style={styles.eventsContainer}>
                        <Text style={styles.widgetTitle}>{currentTime.toLocaleDateString('en-US', { month: 'long' }).toUpperCase()}</Text>
                        <Text style={styles.calendarTitle}>
                            {nextEvent ? nextEvent.title : 'No immediate events'}
                        </Text>
                        <Text style={styles.calendarTime}>
                            {nextEvent ? CalendarService.formatEventTime(nextEvent) : 'Visuals quiet'}
                        </Text>
                    </View>

                    {/* Tiny Month Grid Mockup */}
                    <View style={styles.miniMonth}>
                        <Text style={styles.miniMonthText}>M T W T F S S</Text>
                        <View style={styles.miniDays}>
                            <Text style={[styles.miniDay, styles.activeDay]}>1</Text>
                            <Text style={styles.miniDay}>2</Text>
                            <Text style={styles.miniDay}>3</Text>
                            <Text style={styles.miniDay}>4</Text>
                        </View>
                    </View>
                </View>
            </GlassView>

        </ScrollView>
    );
};

const styles = StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: { padding: spacing.lg, paddingTop: spacing.xxl },

    header: {
        marginBottom: spacing.xl,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    logo: {
        marginRight: spacing.sm,
    },
    brandText: {
        ...typography.headlineMedium,
        color: colors.accentPrimary,
        fontWeight: '600',
        letterSpacing: 1,
    },
    dateDisplay: {
        ...typography.labelMedium,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        opacity: 0.8,
    },
    greetingText: {
        fontSize: 36,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginTop: spacing.xs,
        letterSpacing: 0.5,
    },

    // Widgets
    widgetRow: {
        flexDirection: 'row',
        height: 160,
        marginBottom: spacing.lg,
    },
    appGridContainer: {
        flex: 1,
        justifyContent: 'center',
        paddingLeft: spacing.md,
    },

    // Calendar
    calendarWidget: {
        height: 140,
        marginBottom: spacing.lg,
    },
    calendarContent: {
        flex: 1,
        flexDirection: 'row',
        padding: spacing.md,
    },
    timelineContainer: {
        width: 4,
        marginRight: spacing.md,
        alignItems: 'center',
    },
    timelineLine: {
        width: 3,
        height: 20,
        backgroundColor: colors.glass.border,
        borderRadius: 2,
        marginBottom: 4,
    },
    eventsContainer: {
        flex: 2,
        justifyContent: 'center',
    },
    widgetTitle: {
        ...typography.labelSmall,
        color: colors.glass.textSecondary,
        marginBottom: spacing.xs,
    },
    calendarTitle: {
        ...typography.headlineSmall,
        color: colors.glass.text,
        fontSize: 18,
        marginBottom: 4,
    },
    calendarTime: {
        ...typography.labelSmall,
        color: colors.glass.textSecondary,
    },

    miniMonth: {
        flex: 1,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    miniMonthText: {
        fontSize: 10,
        color: colors.glass.textSecondary,
        marginBottom: 4,
    },
    miniDays: {
        flexDirection: 'row',
        gap: 4,
    },
    miniDay: {
        fontSize: 10,
        color: colors.glass.textSecondary,
        width: 14,
        textAlign: 'center',
    },
    activeDay: {
        color: colors.accentPrimary,
        fontWeight: 'bold',
        backgroundColor: colors.glass.background,
        borderRadius: 4,
    },
});
