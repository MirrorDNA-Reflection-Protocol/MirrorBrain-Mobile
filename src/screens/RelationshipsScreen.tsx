/**
 * Relationships Screen — Communication Insights
 *
 * Purpose: Display relationship health, contact frequency, and suggestions.
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
    RelationshipService,
    HapticService,
    type RelationshipRecord,
    type RelationshipInsight,
} from '../services';

interface RelationshipsScreenProps {
    onContactPress?: (contactId: string, contactName: string) => void;
}

export const RelationshipsScreen: React.FC<RelationshipsScreenProps> = ({
    onContactPress,
}) => {
    const [relationships, setRelationships] = useState<RelationshipRecord[]>([]);
    const [insights, setInsights] = useState<RelationshipInsight[]>([]);
    const [summary, setSummary] = useState<ReturnType<typeof RelationshipService.getSummary> | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'all' | 'priority' | 'pending'>('priority');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            await RelationshipService.initialize();
            updateData();
        } catch (error) {
            console.error('[RelationshipsScreen] Failed to load:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateData = () => {
        setRelationships(RelationshipService.getRelationships());
        setInsights(RelationshipService.getInsights());
        setSummary(RelationshipService.getSummary());
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        HapticService.tap();
        await loadData();
        setRefreshing(false);
    }, []);

    const handleContactPress = (record: RelationshipRecord) => {
        HapticService.tap();
        onContactPress?.(record.contactId, record.contactName);
    };

    const handleFilterChange = (newFilter: typeof filter) => {
        HapticService.tap();
        setFilter(newFilter);
    };

    const filteredRelationships = relationships.filter(r => {
        switch (filter) {
            case 'priority':
                return r.isPriority;
            case 'pending':
                return r.pendingReply;
            default:
                return true;
        }
    });

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accentPrimary} />
                <Text style={styles.loadingText}>Loading relationships...</Text>
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
                <Text style={styles.title}>Relationships</Text>
                <Text style={styles.subtitle}>Stay connected with who matters</Text>
            </View>

            {/* Summary Card */}
            {summary && (
                <GlassView style={styles.summaryCard}>
                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryValue}>{summary.priorityCount}</Text>
                            <Text style={styles.summaryLabel}>Priority</Text>
                        </View>
                        <View style={styles.summaryDivider} />
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryValue}>{summary.pendingReplies}</Text>
                            <Text style={styles.summaryLabel}>Pending</Text>
                        </View>
                        <View style={styles.summaryDivider} />
                        <View style={styles.summaryItem}>
                            <Text style={styles.summaryValue}>{summary.neglectedCount}</Text>
                            <Text style={styles.summaryLabel}>Neglected</Text>
                        </View>
                        <View style={styles.summaryDivider} />
                        <View style={styles.summaryItem}>
                            <Text style={[styles.summaryValue, { color: getHealthColor(summary.averageHealthScore) }]}>
                                {summary.averageHealthScore}
                            </Text>
                            <Text style={styles.summaryLabel}>Health</Text>
                        </View>
                    </View>
                </GlassView>
            )}

            {/* Insights */}
            {insights.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Insights</Text>
                    {insights.slice(0, 4).map((insight, index) => (
                        <InsightCard key={index} insight={insight} />
                    ))}
                </View>
            )}

            {/* Filter */}
            <View style={styles.filterRow}>
                {(['priority', 'pending', 'all'] as const).map((f) => (
                    <TouchableOpacity
                        key={f}
                        style={[styles.filterButton, filter === f && styles.filterButtonActive]}
                        onPress={() => handleFilterChange(f)}
                    >
                        <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                            {f === 'priority' ? '⭐ Priority' : f === 'pending' ? '💬 Pending' : '👥 All'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Relationships List */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                    {filter === 'priority' ? 'Priority Contacts' : filter === 'pending' ? 'Needs Reply' : 'All Contacts'}
                </Text>
                {filteredRelationships.length === 0 ? (
                    <Text style={styles.emptyText}>No contacts found</Text>
                ) : (
                    filteredRelationships.map((record) => (
                        <RelationshipCard
                            key={record.contactId}
                            record={record}
                            onPress={() => handleContactPress(record)}
                        />
                    ))
                )}
            </View>
        </ScrollView>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const InsightCard: React.FC<{ insight: RelationshipInsight }> = ({ insight }) => {
    const iconMap = {
        pending_reply: '💬',
        neglected: '👋',
        one_sided: '↔️',
        strong: '💪',
    };

    return (
        <GlassView style={styles.insightCard}>
            <Text style={styles.insightIcon}>{iconMap[insight.type]}</Text>
            <View style={styles.insightContent}>
                <Text style={styles.insightMessage}>{insight.message}</Text>
                {insight.suggestedAction && (
                    <Text style={styles.insightAction}>{insight.suggestedAction}</Text>
                )}
            </View>
        </GlassView>
    );
};

const RelationshipCard: React.FC<{
    record: RelationshipRecord;
    onPress: () => void;
}> = ({ record, onPress }) => {
    const healthColor = getHealthColor(record.healthScore);
    const lastContact = record.lastOutgoing || record.lastIncoming;
    const lastContactText = lastContact
        ? formatRelativeTime(lastContact)
        : 'Never contacted';

    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            <GlassView style={styles.relationshipCard}>
                <View style={styles.relationshipHeader}>
                    <View style={styles.relationshipAvatar}>
                        <Text style={styles.avatarText}>
                            {record.contactName.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                    <View style={styles.relationshipInfo}>
                        <View style={styles.nameRow}>
                            <Text style={styles.relationshipName}>{record.contactName}</Text>
                            {record.isPriority && <Text style={styles.priorityBadge}>⭐</Text>}
                            {record.pendingReply && <Text style={styles.pendingBadge}>💬</Text>}
                        </View>
                        <Text style={styles.lastContact}>{lastContactText}</Text>
                    </View>
                    <View style={styles.healthContainer}>
                        <Text style={[styles.healthScore, { color: healthColor }]}>
                            {record.healthScore}
                        </Text>
                        <View style={[styles.healthBar, { backgroundColor: colors.glass.border }]}>
                            <View
                                style={[
                                    styles.healthBarFill,
                                    { width: `${record.healthScore}%`, backgroundColor: healthColor },
                                ]}
                            />
                        </View>
                    </View>
                </View>
                <View style={styles.relationshipStats}>
                    <View style={styles.stat}>
                        <Text style={styles.statValue}>{record.outgoingCount30d}</Text>
                        <Text style={styles.statLabel}>Sent</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={styles.statValue}>{record.incomingCount30d}</Text>
                        <Text style={styles.statLabel}>Received</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={styles.statValue}>
                            {record.frequencyTrend === 'increasing' ? '📈' :
                             record.frequencyTrend === 'decreasing' ? '📉' : '➡️'}
                        </Text>
                        <Text style={styles.statLabel}>Trend</Text>
                    </View>
                </View>
            </GlassView>
        </TouchableOpacity>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getHealthColor(score: number): string {
    if (score >= 70) return colors.status.success;
    if (score >= 40) return colors.status.warning;
    return colors.status.error;
}

function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 14) return 'Last week';
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
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

    // Header
    header: {
        marginBottom: spacing.xl,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    subtitle: {
        ...typography.bodyMedium,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },

    // Summary
    summaryCard: {
        padding: spacing.md,
        marginBottom: spacing.lg,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    summaryItem: {
        alignItems: 'center',
    },
    summaryValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    summaryLabel: {
        ...typography.labelSmall,
        color: colors.textSecondary,
        marginTop: 2,
    },
    summaryDivider: {
        width: 1,
        height: 30,
        backgroundColor: colors.glass.border,
    },

    // Section
    section: {
        marginBottom: spacing.lg,
    },
    sectionTitle: {
        ...typography.headlineSmall,
        color: colors.textPrimary,
        marginBottom: spacing.sm,
    },
    emptyText: {
        ...typography.bodyMedium,
        color: colors.textSecondary,
        textAlign: 'center',
        padding: spacing.lg,
    },

    // Filter
    filterRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },
    filterButton: {
        flex: 1,
        paddingVertical: spacing.sm,
        borderRadius: borderRadius.md,
        backgroundColor: colors.glass.background,
        alignItems: 'center',
    },
    filterButtonActive: {
        backgroundColor: colors.accentPrimary,
    },
    filterText: {
        ...typography.labelMedium,
        color: colors.textSecondary,
    },
    filterTextActive: {
        color: colors.textPrimary,
        fontWeight: '600',
    },

    // Insight Card
    insightCard: {
        flexDirection: 'row',
        padding: spacing.sm,
        marginBottom: spacing.sm,
    },
    insightIcon: {
        fontSize: 20,
        marginRight: spacing.sm,
    },
    insightContent: {
        flex: 1,
    },
    insightMessage: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
    },
    insightAction: {
        ...typography.labelSmall,
        color: colors.accentPrimary,
        marginTop: 2,
    },

    // Relationship Card
    relationshipCard: {
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    relationshipHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    relationshipAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.accentPrimary,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.sm,
    },
    avatarText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    relationshipInfo: {
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    relationshipName: {
        ...typography.bodyLarge,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    priorityBadge: {
        fontSize: 12,
        marginLeft: spacing.xs,
    },
    pendingBadge: {
        fontSize: 12,
        marginLeft: spacing.xs,
    },
    lastContact: {
        ...typography.labelSmall,
        color: colors.textSecondary,
    },
    healthContainer: {
        alignItems: 'flex-end',
    },
    healthScore: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    healthBar: {
        width: 40,
        height: 4,
        borderRadius: 2,
        marginTop: 4,
        overflow: 'hidden',
    },
    healthBarFill: {
        height: '100%',
        borderRadius: 2,
    },
    relationshipStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: spacing.md,
        paddingTop: spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.glass.border,
    },
    stat: {
        alignItems: 'center',
    },
    statValue: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
        fontWeight: '600',
    },
    statLabel: {
        ...typography.labelSmall,
        color: colors.textSecondary,
    },
});
