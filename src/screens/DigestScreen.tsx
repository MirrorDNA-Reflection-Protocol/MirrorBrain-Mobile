/**
 * Digest Screen — Weekly Summary
 *
 * Purpose: Display AI-generated weekly digest with insights.
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
    DigestService,
    HapticService,
    type WeeklyDigest,
    type DigestSection,
    type DigestMetric,
    type DigestItem,
} from '../services';

interface DigestScreenProps {
    onNavigate?: (screen: string, params?: any) => void;
}

export const DigestScreen: React.FC<DigestScreenProps> = ({
    onNavigate,
}) => {
    const [digest, setDigest] = useState<WeeklyDigest | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadDigest();
    }, []);

    const loadDigest = async () => {
        setLoading(true);
        try {
            await DigestService.initialize();
            const latestDigest = DigestService.getLatestDigest();
            setDigest(latestDigest);
        } catch (error) {
            console.error('[DigestScreen] Failed to load:', error);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        HapticService.tap();
        await loadDigest();
        setRefreshing(false);
    }, []);

    const handleGenerateDigest = async () => {
        setGenerating(true);
        HapticService.tap();
        try {
            const newDigest = await DigestService.generateWeeklyDigest();
            setDigest(newDigest);
        } catch (error) {
            console.error('[DigestScreen] Failed to generate:', error);
        } finally {
            setGenerating(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accentPrimary} />
                <Text style={styles.loadingText}>Loading digest...</Text>
            </View>
        );
    }

    if (!digest) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📊</Text>
                <Text style={styles.emptyTitle}>No Digest Yet</Text>
                <Text style={styles.emptyText}>
                    Generate your weekly digest to see insights about your productivity and communication.
                </Text>
                <TouchableOpacity
                    style={styles.generateButton}
                    onPress={handleGenerateDigest}
                    disabled={generating}
                >
                    {generating ? (
                        <ActivityIndicator color={colors.textPrimary} />
                    ) : (
                        <Text style={styles.generateButtonText}>Generate Digest</Text>
                    )}
                </TouchableOpacity>
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
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Weekly Digest</Text>
                <Text style={styles.dateRange}>
                    {formatDateRange(digest.weekStart, digest.weekEnd)}
                </Text>
            </View>

            {/* Summary */}
            <GlassView style={styles.summaryCard}>
                <Text style={styles.summaryText}>{digest.summary}</Text>
            </GlassView>

            {/* Highlights */}
            {digest.highlights.length > 0 && (
                <View style={styles.highlightsContainer}>
                    <Text style={styles.sectionTitle}>✨ Highlights</Text>
                    <View style={styles.highlightsList}>
                        {digest.highlights.map((highlight, index) => (
                            <View key={index} style={styles.highlightItem}>
                                <Text style={styles.highlightBullet}>•</Text>
                                <Text style={styles.highlightText}>{highlight}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {/* Sections */}
            {digest.sections.map((section, index) => (
                <DigestSectionCard key={index} section={section} />
            ))}

            {/* AI Insights */}
            {digest.insights.length > 0 && (
                <View style={styles.insightsContainer}>
                    <Text style={styles.sectionTitle}>🧠 AI Insights</Text>
                    {digest.insights.map((insight, index) => (
                        <GlassView key={index} style={styles.insightCard}>
                            <Text style={styles.insightText}>{insight}</Text>
                        </GlassView>
                    ))}
                </View>
            )}

            {/* Goals */}
            {digest.goals && digest.goals.length > 0 && (
                <View style={styles.goalsContainer}>
                    <Text style={styles.sectionTitle}>🎯 Suggested Goals</Text>
                    {digest.goals.map((goal, index) => (
                        <View key={index} style={styles.goalItem}>
                            <View style={styles.goalCheckbox} />
                            <Text style={styles.goalText}>{goal}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Regenerate Button */}
            <TouchableOpacity
                style={styles.regenerateButton}
                onPress={handleGenerateDigest}
                disabled={generating}
            >
                {generating ? (
                    <ActivityIndicator color={colors.textSecondary} />
                ) : (
                    <Text style={styles.regenerateText}>Regenerate Digest</Text>
                )}
            </TouchableOpacity>

            {/* Generated timestamp */}
            <Text style={styles.timestamp}>
                Generated {digest.generatedAt.toLocaleDateString()} at{' '}
                {digest.generatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Text>
        </ScrollView>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Section Card Component
// ─────────────────────────────────────────────────────────────────────────────

const DigestSectionCard: React.FC<{ section: DigestSection }> = ({ section }) => {
    return (
        <GlassView style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>{section.icon}</Text>
                <Text style={styles.sectionCardTitle}>{section.title}</Text>
            </View>

            <Text style={styles.sectionContent}>{section.content}</Text>

            {/* Metrics */}
            {section.metrics && section.metrics.length > 0 && (
                <View style={styles.metricsRow}>
                    {section.metrics.map((metric, index) => (
                        <MetricBadge key={index} metric={metric} />
                    ))}
                </View>
            )}

            {/* Items */}
            {section.items && section.items.length > 0 && (
                <View style={styles.itemsList}>
                    {section.items.map((item, index) => (
                        <DigestItemRow key={index} item={item} />
                    ))}
                </View>
            )}
        </GlassView>
    );
};

const MetricBadge: React.FC<{ metric: DigestMetric }> = ({ metric }) => {
    const trendIcon = metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '';
    const trendColor = metric.trend === 'up' ? colors.status.success :
                       metric.trend === 'down' ? colors.status.error : colors.textSecondary;

    return (
        <View style={styles.metricBadge}>
            <Text style={styles.metricValue}>
                {metric.value}
                {trendIcon && <Text style={{ color: trendColor }}> {trendIcon}</Text>}
            </Text>
            <Text style={styles.metricLabel}>{metric.label}</Text>
        </View>
    );
};

const DigestItemRow: React.FC<{ item: DigestItem }> = ({ item }) => {
    const iconMap = {
        achievement: '🏆',
        insight: '💡',
        suggestion: '👉',
        warning: '⚠️',
    };

    return (
        <View style={styles.itemRow}>
            <Text style={styles.itemIcon}>{iconMap[item.type]}</Text>
            <View style={styles.itemContent}>
                <Text style={styles.itemText}>{item.text}</Text>
                {item.subtext && <Text style={styles.itemSubtext}>{item.subtext}</Text>}
            </View>
        </View>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateRange(start: Date, end: Date): string {
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startStr} - ${endStr}`;
}

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
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: spacing.lg,
    },
    emptyTitle: {
        ...typography.headlineMedium,
        color: colors.textPrimary,
        marginBottom: spacing.sm,
    },
    emptyText: {
        ...typography.bodyMedium,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: spacing.xl,
    },
    generateButton: {
        backgroundColor: colors.accentPrimary,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: borderRadius.lg,
    },
    generateButtonText: {
        ...typography.labelLarge,
        color: colors.textPrimary,
        fontWeight: '600',
    },

    // Header
    header: {
        marginBottom: spacing.lg,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    dateRange: {
        ...typography.bodyMedium,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },

    // Summary
    summaryCard: {
        padding: spacing.lg,
        marginBottom: spacing.lg,
    },
    summaryText: {
        ...typography.bodyLarge,
        color: colors.textPrimary,
        lineHeight: 24,
    },

    // Highlights
    highlightsContainer: {
        marginBottom: spacing.lg,
    },
    sectionTitle: {
        ...typography.headlineSmall,
        color: colors.textPrimary,
        marginBottom: spacing.sm,
    },
    highlightsList: {
        paddingLeft: spacing.sm,
    },
    highlightItem: {
        flexDirection: 'row',
        marginBottom: spacing.xs,
    },
    highlightBullet: {
        color: colors.accentPrimary,
        marginRight: spacing.sm,
        fontSize: 18,
    },
    highlightText: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
        flex: 1,
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
    sectionCardTitle: {
        ...typography.headlineSmall,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    sectionContent: {
        ...typography.bodyMedium,
        color: colors.textSecondary,
    },

    // Metrics
    metricsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: spacing.md,
        gap: spacing.sm,
    },
    metricBadge: {
        backgroundColor: colors.glass.background,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    metricValue: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    metricLabel: {
        ...typography.labelSmall,
        color: colors.textSecondary,
    },

    // Items
    itemsList: {
        marginTop: spacing.md,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: spacing.sm,
    },
    itemIcon: {
        fontSize: 14,
        marginRight: spacing.sm,
        marginTop: 2,
    },
    itemContent: {
        flex: 1,
    },
    itemText: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
    },
    itemSubtext: {
        ...typography.labelSmall,
        color: colors.textSecondary,
        marginTop: 2,
    },

    // Insights
    insightsContainer: {
        marginBottom: spacing.lg,
    },
    insightCard: {
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    insightText: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
        fontStyle: 'italic',
    },

    // Goals
    goalsContainer: {
        marginBottom: spacing.lg,
    },
    goalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    goalCheckbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: colors.glass.border,
        marginRight: spacing.sm,
    },
    goalText: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
    },

    // Regenerate
    regenerateButton: {
        alignSelf: 'center',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.glass.border,
        marginTop: spacing.lg,
    },
    regenerateText: {
        ...typography.labelMedium,
        color: colors.textSecondary,
    },

    // Timestamp
    timestamp: {
        ...typography.labelSmall,
        color: colors.textSecondary,
        textAlign: 'center',
        marginTop: spacing.md,
        opacity: 0.6,
    },
});
