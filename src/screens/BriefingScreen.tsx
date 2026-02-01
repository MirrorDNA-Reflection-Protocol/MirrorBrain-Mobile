/**
 * Briefing Screen — Morning & Evening Rituals
 *
 * Purpose: Display contextual briefings with interactive elements.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
    ActivityIndicator,
} from 'react-native';

import { colors, typography, spacing, borderRadius } from '../theme';
import { GlassView } from '../components';
import {
    BriefingService,
    HapticService,
    type Briefing,
    type BriefingSection,
    type BriefingItem,
    type BriefingType,
} from '../services';

interface BriefingScreenProps {
    type?: BriefingType;
    onNavigate?: (screen: string, params?: any) => void;
}

export const BriefingScreen: React.FC<BriefingScreenProps> = ({
    type: initialType,
    onNavigate,
}) => {
    const [briefing, setBriefing] = useState<Briefing | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeType, setActiveType] = useState<BriefingType>(initialType || getDefaultType());

    // Determine default type based on time of day
    function getDefaultType(): BriefingType {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 18 && hour < 23) return 'evening';
        return 'quick';
    }

    // Load briefing on mount and type change
    useEffect(() => {
        loadBriefing();
    }, [activeType]);

    const loadBriefing = async () => {
        setLoading(true);
        try {
            const result = await BriefingService.generateBriefing(activeType);
            setBriefing(result);
        } catch (error) {
            console.error('[BriefingScreen] Failed to load briefing:', error);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        HapticService.tap();
        await loadBriefing();
        setRefreshing(false);
    }, [activeType]);

    const handleTypeChange = (newType: BriefingType) => {
        if (newType !== activeType) {
            HapticService.tap();
            setActiveType(newType);
        }
    };

    const handleItemAction = (item: BriefingItem) => {
        HapticService.tap();
        if (item.action && onNavigate) {
            onNavigate(item.action.payload?.screen, item.action.payload);
        }
    };

    const handleSectionAction = (section: BriefingSection) => {
        HapticService.tap();
        if (section.action && onNavigate) {
            onNavigate(section.action.payload?.screen, section.action.payload);
        }
    };

    if (loading && !briefing) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accentPrimary} />
                <Text style={styles.loadingText}>Preparing your briefing...</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={colors.textSecondary}
                />
            }
            showsVerticalScrollIndicator={false}
        >
            {/* Type Selector */}
            <View style={styles.typeSelector}>
                {(['morning', 'evening', 'quick'] as BriefingType[]).map((t) => (
                    <TouchableOpacity
                        key={t}
                        style={[styles.typeButton, activeType === t && styles.typeButtonActive]}
                        onPress={() => handleTypeChange(t)}
                    >
                        <Text style={[styles.typeButtonText, activeType === t && styles.typeButtonTextActive]}>
                            {t === 'morning' ? '🌅 Morning' : t === 'evening' ? '🌙 Evening' : '⚡ Quick'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Header */}
            {briefing && (
                <>
                    <View style={styles.header}>
                        <Text style={styles.greeting}>{briefing.greeting}</Text>
                        <Text style={styles.summary}>{briefing.summary}</Text>
                        {briefing.aiInsight && (
                            <GlassView style={styles.insightCard}>
                                <Text style={styles.insightIcon}>✨</Text>
                                <Text style={styles.insightText}>{briefing.aiInsight}</Text>
                            </GlassView>
                        )}
                    </View>

                    {/* Sections */}
                    {briefing.sections.map((section, index) => (
                        <BriefingSectionCard
                            key={`section_${index}`}
                            section={section}
                            onItemPress={handleItemAction}
                            onActionPress={() => handleSectionAction(section)}
                        />
                    ))}

                    {/* Generated timestamp */}
                    <Text style={styles.timestamp}>
                        Generated {briefing.generatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                </>
            )}
        </ScrollView>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Section Card Component
// ─────────────────────────────────────────────────────────────────────────────

interface SectionCardProps {
    section: BriefingSection;
    onItemPress: (item: BriefingItem) => void;
    onActionPress: () => void;
}

const BriefingSectionCard: React.FC<SectionCardProps> = ({
    section,
    onItemPress,
    onActionPress,
}) => {
    return (
        <GlassView style={styles.sectionCard}>
            {/* Section Header */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>{section.icon}</Text>
                <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>

            {/* Section Content */}
            <Text style={styles.sectionContent}>{section.content}</Text>

            {/* Items */}
            {section.items && section.items.length > 0 && (
                <View style={styles.itemsList}>
                    {section.items.map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.item}
                            onPress={() => onItemPress(item)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.itemContent}>
                                <View style={styles.itemHeader}>
                                    {item.priority && (
                                        <View style={[
                                            styles.priorityDot,
                                            item.priority === 'high' && styles.priorityHigh,
                                            item.priority === 'medium' && styles.priorityMedium,
                                            item.priority === 'low' && styles.priorityLow,
                                        ]} />
                                    )}
                                    <Text style={styles.itemText} numberOfLines={1}>
                                        {item.text}
                                    </Text>
                                </View>
                                {item.subtext && (
                                    <Text style={styles.itemSubtext} numberOfLines={1}>
                                        {item.subtext}
                                    </Text>
                                )}
                            </View>
                            {item.action && (
                                <Text style={styles.itemAction}>{item.action.label} →</Text>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Section Action */}
            {section.action && (
                <TouchableOpacity
                    style={styles.sectionAction}
                    onPress={onActionPress}
                    activeOpacity={0.7}
                >
                    <Text style={styles.sectionActionText}>{section.action.label}</Text>
                </TouchableOpacity>
            )}
        </GlassView>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: spacing.lg,
        paddingTop: spacing.xxl,
        paddingBottom: spacing.xxl * 2,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        ...typography.bodyMedium,
        color: colors.textSecondary,
        marginTop: spacing.md,
    },

    // Type Selector
    typeSelector: {
        flexDirection: 'row',
        marginBottom: spacing.xl,
        gap: spacing.sm,
    },
    typeButton: {
        flex: 1,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: borderRadius.lg,
        backgroundColor: colors.glass.background,
        alignItems: 'center',
    },
    typeButtonActive: {
        backgroundColor: colors.accentPrimary,
    },
    typeButtonText: {
        ...typography.labelMedium,
        color: colors.textSecondary,
    },
    typeButtonTextActive: {
        color: colors.textPrimary,
        fontWeight: '600',
    },

    // Header
    header: {
        marginBottom: spacing.xl,
    },
    greeting: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: spacing.xs,
    },
    summary: {
        ...typography.bodyLarge,
        color: colors.textSecondary,
        marginBottom: spacing.md,
    },
    insightCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: spacing.md,
        marginTop: spacing.sm,
    },
    insightIcon: {
        fontSize: 20,
        marginRight: spacing.sm,
    },
    insightText: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
        flex: 1,
        fontStyle: 'italic',
    },

    // Section Card
    sectionCard: {
        padding: spacing.md,
        marginBottom: spacing.md,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    sectionIcon: {
        fontSize: 20,
        marginRight: spacing.sm,
    },
    sectionTitle: {
        ...typography.headlineSmall,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    sectionContent: {
        ...typography.bodyMedium,
        color: colors.textSecondary,
        marginBottom: spacing.sm,
    },

    // Items List
    itemsList: {
        marginTop: spacing.sm,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.glass.border,
    },
    itemContent: {
        flex: 1,
        marginRight: spacing.sm,
    },
    itemHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    priorityDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: spacing.xs,
    },
    priorityHigh: {
        backgroundColor: colors.status.error,
    },
    priorityMedium: {
        backgroundColor: colors.status.warning,
    },
    priorityLow: {
        backgroundColor: colors.status.success,
    },
    itemText: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
        flex: 1,
    },
    itemSubtext: {
        ...typography.labelSmall,
        color: colors.textSecondary,
        marginTop: 2,
        marginLeft: 12,
    },
    itemAction: {
        ...typography.labelSmall,
        color: colors.accentPrimary,
    },

    // Section Action
    sectionAction: {
        marginTop: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
        backgroundColor: colors.accentPrimary,
        alignItems: 'center',
    },
    sectionActionText: {
        ...typography.labelMedium,
        color: colors.textPrimary,
        fontWeight: '600',
    },

    // Timestamp
    timestamp: {
        ...typography.labelSmall,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: spacing.lg,
        opacity: 0.6,
    },
});
