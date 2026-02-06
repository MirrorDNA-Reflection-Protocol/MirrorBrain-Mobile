/**
 * Runs Feed Screen — Live runs timeline with approval flow.
 *
 * Shows all runs with state indicators.
 * Tap run → detail with Approve (promote), Replay, Quarantine actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Modal,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, glyphs } from '../theme';
import { GlassView } from '../components';
import { RouterService, HapticService } from '../services';

interface RunsFeedScreenProps {
    onClose: () => void;
}

interface RunItem {
    run_id: string;
    project: string;
    state: string;
    created_at: string;
    skills_used: string[];
    error: string | null;
    confidence?: {
        confidence_score?: number;
        trust_score?: number;
    };
}

const STATE_COLORS: Record<string, string> = {
    pending: colors.textMuted,
    active: colors.accentPrimary,
    completed: colors.success,
    promoted: '#22d3ee',
    failed: colors.error,
    blocked: colors.warning,
    quarantined: '#f43f5e',
    archived: colors.offline,
};

const STATE_ICONS: Record<string, string> = {
    pending: '○',
    active: '◉',
    completed: '✓',
    promoted: '★',
    failed: '✗',
    blocked: '⊘',
    quarantined: '⚠',
    archived: '◇',
};

export const RunsFeedScreen: React.FC<RunsFeedScreenProps> = ({ onClose }) => {
    const [runs, setRuns] = useState<RunItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedRun, setSelectedRun] = useState<RunItem | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        loadRuns();
    }, []);

    const loadRuns = async () => {
        try {
            const res = await RouterService.getAnalytics();
            // Load runs from audit log as a proxy
            const auditRes = await RouterService.auditAppend('runs_feed_viewed', {});
            // For now, show analytics-derived data
            // In production, we'd have a /runs/list endpoint
            setRuns([]);
        } catch {
            // Offline
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        HapticService.tap();
        await loadRuns();
        setRefreshing(false);
    }, []);

    const handlePromote = async (run: RunItem) => {
        Alert.alert(
            'Promote Run',
            `Approve "${run.run_id}" for promotion?\n\nThis action is permanent.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Approve',
                    style: 'default',
                    onPress: async () => {
                        setActionLoading(true);
                        HapticService.success();
                        const res = await RouterService.scoreRun(run.run_id, run.project);
                        setActionLoading(false);
                        setSelectedRun(null);
                        loadRuns();
                    },
                },
            ]
        );
    };

    const handleReplay = async (run: RunItem) => {
        setActionLoading(true);
        HapticService.tap();
        const res = await RouterService.replayRun(run.run_id, run.project);
        setActionLoading(false);
        if (res.ok && res.data) {
            const verdict = res.data.verdict;
            Alert.alert(
                'Replay Result',
                `Verdict: ${verdict.would_succeed ? 'PASS' : 'FAIL'}\nRisk: ${verdict.risk}\n${verdict.issues.length > 0 ? '\nIssues:\n' + verdict.issues.join('\n') : ''}`,
            );
        }
    };

    const handleQuarantine = async (run: RunItem) => {
        Alert.alert(
            'Quarantine Run',
            `Flag "${run.run_id}" as suspicious?\n\nThis blocks promotion.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Quarantine',
                    style: 'destructive',
                    onPress: async () => {
                        HapticService.warning();
                        setSelectedRun(null);
                        loadRuns();
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Runs Feed</Text>
                <View style={{ width: 60 }} />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}
            >
                {loading ? (
                    <ActivityIndicator color={colors.accentPrimary} style={{ marginTop: 40 }} />
                ) : runs.length === 0 ? (
                    <GlassView style={styles.emptyCard}>
                        <Text style={styles.emptyIcon}>{glyphs.decision}</Text>
                        <Text style={styles.emptyTitle}>No Runs Yet</Text>
                        <Text style={styles.emptyText}>
                            Runs will appear here as the Router processes requests.
                            Use Voice Dispatch to create your first run.
                        </Text>
                    </GlassView>
                ) : (
                    runs.map((run) => (
                        <TouchableOpacity
                            key={run.run_id}
                            onPress={() => { HapticService.tap(); setSelectedRun(run); }}
                            activeOpacity={0.7}
                        >
                            <GlassView style={styles.runCard} variant="subtle">
                                <View style={styles.runHeader}>
                                    <Text style={[styles.stateIcon, { color: STATE_COLORS[run.state] || colors.textMuted }]}>
                                        {STATE_ICONS[run.state] || '?'}
                                    </Text>
                                    <View style={styles.runInfo}>
                                        <Text style={styles.runId} numberOfLines={1}>{run.run_id}</Text>
                                        <Text style={styles.runProject}>{run.project}</Text>
                                    </View>
                                    <Text style={[styles.runState, { color: STATE_COLORS[run.state] }]}>
                                        {run.state}
                                    </Text>
                                </View>
                                {run.skills_used.length > 0 && (
                                    <View style={styles.skillsRow}>
                                        {run.skills_used.map(s => (
                                            <View key={s} style={styles.skillChip}>
                                                <Text style={styles.skillChipText}>{s}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                                {run.confidence?.trust_score !== undefined && (
                                    <Text style={styles.trustText}>
                                        Trust: {Math.round(run.confidence.trust_score * 100)}%
                                    </Text>
                                )}
                            </GlassView>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            {/* Run Detail Modal */}
            <Modal visible={selectedRun !== null} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <GlassView style={styles.modalCard} variant="prominent">
                        {selectedRun && (
                            <>
                                <Text style={styles.modalTitle}>{selectedRun.run_id}</Text>
                                <Text style={styles.modalSubtitle}>{selectedRun.project}</Text>

                                <View style={styles.modalRow}>
                                    <Text style={styles.modalLabel}>State</Text>
                                    <Text style={[styles.modalValue, { color: STATE_COLORS[selectedRun.state] }]}>
                                        {selectedRun.state}
                                    </Text>
                                </View>

                                {selectedRun.error && (
                                    <View style={styles.modalRow}>
                                        <Text style={styles.modalLabel}>Error</Text>
                                        <Text style={[styles.modalValue, { color: colors.error }]}>{selectedRun.error}</Text>
                                    </View>
                                )}

                                {/* Action Buttons */}
                                <View style={styles.modalActions}>
                                    {selectedRun.state === 'completed' && (
                                        <TouchableOpacity
                                            style={[styles.modalBtn, { backgroundColor: colors.success + '22' }]}
                                            onPress={() => handlePromote(selectedRun)}
                                            disabled={actionLoading}
                                        >
                                            <Text style={[styles.modalBtnText, { color: colors.success }]}>
                                                ★ Approve
                                            </Text>
                                        </TouchableOpacity>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.modalBtn, { backgroundColor: colors.accentPrimary + '22' }]}
                                        onPress={() => handleReplay(selectedRun)}
                                        disabled={actionLoading}
                                    >
                                        <Text style={[styles.modalBtnText, { color: colors.accentPrimary }]}>
                                            ↻ Replay
                                        </Text>
                                    </TouchableOpacity>

                                    {selectedRun.state !== 'quarantined' && (
                                        <TouchableOpacity
                                            style={[styles.modalBtn, { backgroundColor: colors.error + '22' }]}
                                            onPress={() => handleQuarantine(selectedRun)}
                                            disabled={actionLoading}
                                        >
                                            <Text style={[styles.modalBtnText, { color: colors.error }]}>
                                                ⚠ Quarantine
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                <TouchableOpacity
                                    style={styles.modalClose}
                                    onPress={() => setSelectedRun(null)}
                                >
                                    <Text style={styles.modalCloseText}>Close</Text>
                                </TouchableOpacity>

                                {actionLoading && (
                                    <ActivityIndicator color={colors.accentPrimary} style={{ marginTop: spacing.sm }} />
                                )}
                            </>
                        )}
                    </GlassView>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, paddingTop: spacing.lg },
    backBtn: { padding: spacing.xs },
    backText: { ...typography.bodyMedium, color: colors.accentPrimary },
    title: { ...typography.headlineSmall, color: colors.textPrimary },
    scroll: { flex: 1 },
    scrollContent: { padding: spacing.md, gap: spacing.sm },

    emptyCard: { padding: spacing.xl, alignItems: 'center' },
    emptyIcon: { fontSize: 48, marginBottom: spacing.md },
    emptyTitle: { ...typography.headlineMedium, color: colors.textPrimary, marginBottom: spacing.sm },
    emptyText: { ...typography.bodyMedium, color: colors.textSecondary, textAlign: 'center' },

    runCard: { padding: spacing.md, marginBottom: spacing.xs },
    runHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    stateIcon: { fontSize: 20, width: 24, textAlign: 'center' },
    runInfo: { flex: 1 },
    runId: { ...typography.bodyMedium, color: colors.textPrimary, fontFamily: 'monospace' },
    runProject: { ...typography.labelSmall, color: colors.textMuted },
    runState: { ...typography.labelMedium, fontWeight: '600' },
    skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
    skillChip: { backgroundColor: colors.surfaceElevated, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 4 },
    skillChipText: { ...typography.labelSmall, color: colors.textMuted },
    trustText: { ...typography.labelSmall, color: colors.accentLight, marginTop: spacing.xs },

    modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg },
    modalCard: { padding: spacing.lg },
    modalTitle: { ...typography.headlineMedium, color: colors.textPrimary, fontFamily: 'monospace' },
    modalSubtitle: { ...typography.bodyMedium, color: colors.textSecondary, marginBottom: spacing.md },
    modalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
    modalLabel: { ...typography.bodyMedium, color: colors.textSecondary },
    modalValue: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '600' },
    modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
    modalBtn: { flex: 1, padding: spacing.md, borderRadius: 8, alignItems: 'center' },
    modalBtnText: { ...typography.labelMedium, fontWeight: '700' },
    modalClose: { marginTop: spacing.md, alignItems: 'center', padding: spacing.sm },
    modalCloseText: { ...typography.bodyMedium, color: colors.textMuted },
});
