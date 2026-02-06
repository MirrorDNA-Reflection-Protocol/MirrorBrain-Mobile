/**
 * Trust Panel Screen — Shield View
 *
 * Shows governance state at a glance:
 *   - Kill switch level + color
 *   - Policy version + hash
 *   - Confidence/Trust scores (aggregate)
 *   - Evidence chain stats
 *   - Offline queue depth
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, glyphs } from '../theme';
import { GlassView } from '../components';
import { RouterService, HapticService } from '../services';

interface TrustPanelScreenProps {
    onClose: () => void;
}

interface HealthData {
    status: string;
    kill_switch: string;
    policy_version: string;
    policy_hash?: string;
}

interface AnalyticsData {
    total_runs: number;
    evidence_finalized: number;
    evidence_quarantined: number;
    retry_rate: number;
    success_rate_by_skill: Record<string, number>;
    skill_reliability_score: Record<string, number>;
    state_distribution?: Record<string, number>;
}

const KS_DESCRIPTIONS: Record<string, string> = {
    OFF: 'All systems nominal. Full capability.',
    K0: 'Intake paused. No new runs accepted.',
    K1: 'Read-only. Only vault reads allowed.',
    K2: 'Local-only. External network blocked.',
    K3: 'Promotions blocked. Runs can execute but not promote.',
    K4: 'Full stop. All operations halted.',
};

const KS_COLORS: Record<string, string> = {
    OFF: colors.success,
    K0: colors.warning,
    K1: colors.warning,
    K2: '#f59e0b',
    K3: colors.error,
    K4: colors.error,
};

export const TrustPanelScreen: React.FC<TrustPanelScreenProps> = ({ onClose }) => {
    const [health, setHealth] = useState<HealthData | null>(null);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [healthRes, analyticsRes] = await Promise.all([
                RouterService.getHealth(),
                RouterService.getAnalytics(),
            ]);
            if (healthRes.ok && healthRes.data) setHealth(healthRes.data as HealthData);
            if (analyticsRes.ok && analyticsRes.data) setAnalytics(analyticsRes.data as AnalyticsData);
        } catch {
            // Offline
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        HapticService.tap();
        await loadData();
        setRefreshing(false);
    }, []);

    const isOnline = RouterService.isOnline();
    const ksLevel = health?.kill_switch || 'OFF';
    const ksColor = KS_COLORS[ksLevel] || colors.textMuted;
    const queueSize = RouterService.getQueueSize();

    // Compute aggregate trust from analytics
    const totalRuns = analytics?.total_runs ?? 0;
    const finalized = analytics?.evidence_finalized ?? 0;
    const quarantined = analytics?.evidence_quarantined ?? 0;
    const retryRate = analytics?.retry_rate ?? 0;
    const evidenceRatio = totalRuns > 0 ? finalized / totalRuns : 0;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>{glyphs.truth} Trust Shield</Text>
                <View style={{ width: 60 }} />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}
            >
                {loading ? (
                    <ActivityIndicator color={colors.accentPrimary} style={{ marginTop: 40 }} />
                ) : (
                    <>
                        {/* Kill Switch Card */}
                        <GlassView style={styles.ksCard}>
                            <View style={styles.ksHeader}>
                                <View style={[styles.ksDot, { backgroundColor: ksColor }]} />
                                <Text style={styles.ksTitle}>Kill Switch</Text>
                                <View style={[styles.ksBadge, { backgroundColor: ksColor + '22', borderColor: ksColor }]}>
                                    <Text style={[styles.ksBadgeText, { color: ksColor }]}>
                                        {ksLevel === 'OFF' ? 'CLEAR' : ksLevel}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.ksDescription}>
                                {KS_DESCRIPTIONS[ksLevel] || 'Unknown state.'}
                            </Text>
                        </GlassView>

                        {/* Connectivity Card */}
                        <GlassView style={styles.infoCard} variant="subtle">
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Router</Text>
                                <Text style={[styles.infoValue, { color: isOnline ? colors.success : colors.offline }]}>
                                    {isOnline ? 'Connected' : 'Offline'}
                                </Text>
                            </View>
                            {health && (
                                <>
                                    <View style={styles.infoRow}>
                                        <Text style={styles.infoLabel}>Policy</Text>
                                        <Text style={styles.infoValue}>{health.policy_version}</Text>
                                    </View>
                                    {health.policy_hash && (
                                        <View style={styles.infoRow}>
                                            <Text style={styles.infoLabel}>Hash</Text>
                                            <Text style={styles.infoValueMono} numberOfLines={1}>
                                                {health.policy_hash.slice(0, 16)}...
                                            </Text>
                                        </View>
                                    )}
                                </>
                            )}
                            {queueSize > 0 && (
                                <View style={styles.infoRow}>
                                    <Text style={styles.infoLabel}>Queue</Text>
                                    <Text style={[styles.infoValue, { color: colors.warning }]}>
                                        {queueSize} pending
                                    </Text>
                                </View>
                            )}
                        </GlassView>

                        {/* Trust Metrics */}
                        <Text style={styles.sectionHeader}>Trust Metrics</Text>
                        <View style={styles.metricsRow}>
                            <GlassView style={styles.metricCard} variant="subtle">
                                <Text style={styles.metricValue}>{totalRuns}</Text>
                                <Text style={styles.metricLabel}>Total Runs</Text>
                            </GlassView>
                            <GlassView style={styles.metricCard} variant="subtle">
                                <Text style={[styles.metricValue, { color: colors.success }]}>{finalized}</Text>
                                <Text style={styles.metricLabel}>Finalized</Text>
                            </GlassView>
                            <GlassView style={styles.metricCard} variant="subtle">
                                <Text style={[styles.metricValue, { color: quarantined > 0 ? colors.error : colors.textMuted }]}>
                                    {quarantined}
                                </Text>
                                <Text style={styles.metricLabel}>Quarantined</Text>
                            </GlassView>
                        </View>

                        {/* Trust Bars */}
                        <GlassView style={styles.barsCard} variant="subtle">
                            <TrustBar label="Evidence Coverage" value={evidenceRatio} color={colors.success} />
                            <TrustBar label="Retry Rate" value={retryRate} color={retryRate > 0.2 ? colors.warning : colors.accentPrimary} inverted />
                            <TrustBar label="System Health" value={isOnline && ksLevel === 'OFF' ? 1.0 : ksLevel !== 'OFF' ? 0.3 : 0.5} color={ksLevel === 'OFF' ? colors.success : colors.warning} />
                        </GlassView>

                        {/* Skill Reliability */}
                        {analytics && Object.keys(analytics.skill_reliability_score).length > 0 && (
                            <>
                                <Text style={styles.sectionHeader}>Skill Reliability</Text>
                                <GlassView style={styles.skillsCard} variant="subtle">
                                    {Object.entries(analytics.skill_reliability_score).map(([skill, score]) => (
                                        <View key={skill} style={styles.skillRow}>
                                            <Text style={styles.skillName}>{skill}</Text>
                                            <View style={styles.skillBarBg}>
                                                <View style={[styles.skillBar, { width: `${Math.round(score * 100)}%` }]} />
                                            </View>
                                            <Text style={styles.skillScore}>{Math.round(score * 100)}%</Text>
                                        </View>
                                    ))}
                                </GlassView>
                            </>
                        )}

                        {/* State Distribution */}
                        {analytics?.state_distribution && Object.keys(analytics.state_distribution).length > 0 && (
                            <>
                                <Text style={styles.sectionHeader}>Run States</Text>
                                <GlassView style={styles.statesCard} variant="subtle">
                                    {Object.entries(analytics.state_distribution).map(([state, count]) => (
                                        <View key={state} style={styles.stateRow}>
                                            <Text style={styles.stateName}>{state}</Text>
                                            <Text style={styles.stateCount}>{count}</Text>
                                        </View>
                                    ))}
                                </GlassView>
                            </>
                        )}

                        <View style={{ height: spacing.xl }} />
                    </>
                )}
            </ScrollView>
        </View>
    );
};

// Sub-component: horizontal trust bar
const TrustBar: React.FC<{ label: string; value: number; color: string; inverted?: boolean }> = ({ label, value, color, inverted }) => {
    const displayValue = Math.round(value * 100);
    return (
        <View style={barStyles.row}>
            <Text style={barStyles.label}>{label}</Text>
            <View style={barStyles.barBg}>
                <View style={[barStyles.bar, { width: `${Math.min(displayValue, 100)}%`, backgroundColor: color }]} />
            </View>
            <Text style={[barStyles.value, inverted && displayValue > 20 && { color: colors.warning }]}>
                {displayValue}%
            </Text>
        </View>
    );
};

const barStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    label: { ...typography.bodySmall, color: colors.textSecondary, width: 130 },
    barBg: { flex: 1, height: 6, backgroundColor: colors.surfaceElevated, borderRadius: 3, marginHorizontal: spacing.sm },
    bar: { height: 6, borderRadius: 3 },
    value: { ...typography.labelSmall, color: colors.textMuted, width: 40, textAlign: 'right' },
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, paddingTop: spacing.lg },
    backBtn: { padding: spacing.xs },
    backText: { ...typography.bodyMedium, color: colors.accentPrimary },
    title: { ...typography.headlineSmall, color: colors.textPrimary },
    scroll: { flex: 1 },
    scrollContent: { padding: spacing.md, gap: spacing.sm },

    ksCard: { padding: spacing.md },
    ksHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    ksDot: { width: 12, height: 12, borderRadius: 6 },
    ksTitle: { ...typography.headlineSmall, color: colors.textPrimary, flex: 1 },
    ksBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
    ksBadgeText: { ...typography.labelSmall, fontWeight: '700' },
    ksDescription: { ...typography.bodyMedium, color: colors.textSecondary, marginTop: spacing.xs },

    infoCard: { padding: spacing.md },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
    infoLabel: { ...typography.bodyMedium, color: colors.textSecondary },
    infoValue: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '600' },
    infoValueMono: { ...typography.bodySmall, color: colors.textMuted, fontFamily: 'monospace' },

    sectionHeader: { ...typography.labelMedium, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.xs, letterSpacing: 1 },

    metricsRow: { flexDirection: 'row', gap: spacing.sm },
    metricCard: { flex: 1, padding: spacing.md, alignItems: 'center' },
    metricValue: { ...typography.headlineMedium, color: colors.textPrimary, fontWeight: '600' },
    metricLabel: { ...typography.labelSmall, color: colors.textMuted, marginTop: spacing.xs },

    barsCard: { padding: spacing.md },

    skillsCard: { padding: spacing.md },
    skillRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
    skillName: { ...typography.bodySmall, color: colors.textSecondary, width: 100 },
    skillBarBg: { flex: 1, height: 4, backgroundColor: colors.surfaceElevated, borderRadius: 2, marginHorizontal: spacing.sm },
    skillBar: { height: 4, backgroundColor: colors.accentPrimary, borderRadius: 2 },
    skillScore: { ...typography.labelSmall, color: colors.textMuted, width: 36, textAlign: 'right' },

    statesCard: { padding: spacing.md },
    stateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
    stateName: { ...typography.bodySmall, color: colors.textSecondary },
    stateCount: { ...typography.bodySmall, color: colors.textPrimary, fontWeight: '600' },
});
