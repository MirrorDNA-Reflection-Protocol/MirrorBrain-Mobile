/**
 * PULSE Screen — Confidence Launch Hero
 *
 * Purpose: System health at a glance. Open app → trust visible in <2 seconds.
 * Shows: Health status, live metrics, quick actions (Runs, Voice, Shield).
 *
 * UX Flow:
 *   Tap Runs → RunsFeedScreen
 *   Tap Voice → VoiceDispatchModal
 *   Tap Shield → TrustPanelScreen
 *   Swipe Right → Daily Brief (via panel navigation)
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
    ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, glyphs } from '../theme';
import { GlassView } from '../components';
import { RouterService, HapticService, DeviceOrchestratorService, PassiveIntelligenceService, NudgeService } from '../services';
import type { RunRecord } from '../services/device_orchestrator.service';
import type { ClipboardCapture, NotificationData } from '../services/passive.service';
import type { Nudge } from '../services/nudge.service';
import { RunsFeedScreen } from './RunsFeedScreen';
import { TrustPanelScreen } from './TrustPanelScreen';
import { VoiceDispatchModal } from '../components/VoiceDispatchModal';

interface HealthData {
    status: string;
    kill_switch: string;
    policy_version: string;
}

interface AnalyticsData {
    total_runs: number;
    evidence_finalized: number;
    evidence_quarantined: number;
    retry_rate: number;
    success_rate_by_skill: Record<string, number>;
    skill_reliability_score: Record<string, number>;
}

export const PulseScreen: React.FC = () => {
    const [health, setHealth] = useState<HealthData | null>(null);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showRuns, setShowRuns] = useState(false);
    const [showTrust, setShowTrust] = useState(false);
    const [showVoice, setShowVoice] = useState(false);
    const [deviceRuns, setDeviceRuns] = useState<RunRecord[]>([]);
    const [orchOnline, setOrchOnline] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [recentClips, setRecentClips] = useState<ClipboardCapture[]>([]);
    const [recentNotifs, setRecentNotifs] = useState<NotificationData[]>([]);
    const [activeNudges, setActiveNudges] = useState<Nudge[]>([]);

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        loadData();

        // Subscribe to clipboard captures
        const unsubClip = PassiveIntelligenceService.clipboard.start({
            onCapture: (capture) => {
                setRecentClips(prev => [capture, ...prev].slice(0, 5));
            },
        });

        // Load active notifications
        PassiveIntelligenceService.notifications.getActive()
            .then(notifs => setRecentNotifs(notifs.slice(0, 5)))
            .catch(() => {});

        // Subscribe to nudges
        setActiveNudges(NudgeService.getActiveNudges());
        const unsubNudge = NudgeService.subscribe(() => {
            setActiveNudges(NudgeService.getActiveNudges());
        });

        return () => {
            unsubNudge();
        };
    }, []);

    const loadData = async () => {
        try {
            await RouterService.initialize();
            await DeviceOrchestratorService.initialize();
            const [healthRes, analyticsRes] = await Promise.all([
                RouterService.getHealth(),
                RouterService.getAnalytics(),
            ]);
            if (healthRes.ok && healthRes.data) setHealth(healthRes.data);
            if (analyticsRes.ok && analyticsRes.data) setAnalytics(analyticsRes.data as AnalyticsData);

            // Load device orchestrator state
            setOrchOnline(DeviceOrchestratorService.isOnline());
            const runs = await DeviceOrchestratorService.getRecentRuns(5);
            setDeviceRuns(runs);
        } catch {
            // Offline — show degraded
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

    const timeStr = currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const dateStr = currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const isOnline = RouterService.isOnline();
    const ksLevel = health?.kill_switch || 'OFF';
    const ksColor = ksLevel === 'OFF' ? colors.success : ksLevel.startsWith('K0') || ksLevel.startsWith('K1') ? colors.warning : colors.error;

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.timeText}>{timeStr}</Text>
                    <Text style={styles.dateText}>{dateStr}</Text>
                </View>

                {/* System Pulse */}
                <GlassView style={styles.pulseCard}>
                    <View style={styles.pulseHeader}>
                        <View style={[styles.pulseDot, { backgroundColor: isOnline ? colors.success : colors.offline }]} />
                        <Text style={styles.pulseTitle}>
                            {isOnline ? 'System Alive' : 'Offline'}
                        </Text>
                        <View style={[styles.ksBadge, { backgroundColor: ksColor + '22', borderColor: ksColor }]}>
                            <Text style={[styles.ksText, { color: ksColor }]}>
                                {ksLevel === 'OFF' ? 'CLEAR' : ksLevel}
                            </Text>
                        </View>
                    </View>
                    {health && (
                        <Text style={styles.pulseSubtext}>
                            Policy {health.policy_version} {glyphs.truth} Router v0.3.0
                        </Text>
                    )}
                </GlassView>

                {/* Metrics Row */}
                <View style={styles.metricsRow}>
                    <GlassView style={styles.metricCard} variant="subtle">
                        <Text style={styles.metricValue}>{analytics?.total_runs ?? '—'}</Text>
                        <Text style={styles.metricLabel}>Runs</Text>
                    </GlassView>
                    <GlassView style={styles.metricCard} variant="subtle">
                        <Text style={styles.metricValue}>{analytics?.evidence_finalized ?? '—'}</Text>
                        <Text style={styles.metricLabel}>Evidence</Text>
                    </GlassView>
                    <GlassView style={styles.metricCard} variant="subtle">
                        <Text style={styles.metricValue}>
                            {analytics?.retry_rate !== undefined ? `${Math.round(analytics.retry_rate * 100)}%` : '—'}
                        </Text>
                        <Text style={styles.metricLabel}>Retry Rate</Text>
                    </GlassView>
                </View>

                {/* Skill Reliability */}
                {analytics && Object.keys(analytics.skill_reliability_score).length > 0 && (
                    <GlassView style={styles.skillsCard} variant="subtle">
                        <Text style={styles.sectionTitle}>{glyphs.pattern} Skill Reliability</Text>
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
                )}

                {/* Device Actions (Ambient OS) */}
                <GlassView style={styles.deviceCard} variant="subtle">
                    <View style={styles.deviceHeader}>
                        <Text style={styles.sectionTitle}>
                            {glyphs.decision} Device Actions
                        </Text>
                        <View style={[styles.pulseDot, { backgroundColor: orchOnline ? colors.success : colors.offline }]} />
                    </View>
                    {deviceRuns.length > 0 ? (
                        deviceRuns.slice(0, 3).map(run => (
                            <View key={run.run_id} style={styles.deviceRunRow}>
                                <Text style={[styles.deviceRunStatus, {
                                    color: run.status === 'dispatched' ? colors.accentPrimary
                                        : run.status === 'completed' ? colors.success
                                        : run.status === 'failed' || run.status === 'blocked' ? colors.error
                                        : colors.textMuted
                                }]}>
                                    {run.status === 'dispatched' ? '>' : run.status === 'completed' ? '+' : run.status === 'blocked' ? 'x' : '-'}
                                </Text>
                                <Text style={styles.deviceRunSkill}>{run.skill_id}</Text>
                                <Text style={styles.deviceRunArgs} numberOfLines={1}>
                                    {Object.values(run.args).join(', ')}
                                </Text>
                            </View>
                        ))
                    ) : (
                        <Text style={styles.deviceEmpty}>No device actions yet</Text>
                    )}
                    {DeviceOrchestratorService.getQueueSize() > 0 && (
                        <Text style={styles.deviceQueue}>
                            {DeviceOrchestratorService.getQueueSize()} queued
                        </Text>
                    )}
                </GlassView>

                {/* Active Nudges */}
                {activeNudges.length > 0 && (
                    <GlassView style={styles.nudgeCard} variant="subtle">
                        <Text style={styles.sectionTitle}>Needs Attention</Text>
                        {activeNudges.slice(0, 4).map(nudge => (
                            <View key={nudge.id} style={styles.nudgeRow}>
                                <View style={[
                                    styles.nudgePriority,
                                    { backgroundColor: nudge.priority === 'urgent' ? colors.error
                                        : nudge.priority === 'high' ? colors.warning
                                        : colors.accentPrimary },
                                ]} />
                                <View style={styles.nudgeContent}>
                                    <Text style={styles.nudgeTitle}>{nudge.title}</Text>
                                    <Text style={styles.nudgeMessage} numberOfLines={1}>{nudge.message}</Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => {
                                        HapticService.tap();
                                        NudgeService.dismiss(nudge.id);
                                        setActiveNudges(NudgeService.getActiveNudges());
                                    }}
                                    style={styles.nudgeDismiss}
                                    activeOpacity={0.6}
                                >
                                    <Text style={styles.nudgeDismissText}>x</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </GlassView>
                )}

                {/* Context Feed — PassiveIntelligence */}
                {(recentClips.length > 0 || recentNotifs.length > 0) && (
                    <GlassView style={styles.contextCard} variant="subtle">
                        <Text style={styles.sectionTitle}>{glyphs.pattern} Context Feed</Text>
                        {recentClips.map((clip, i) => (
                            <View key={`clip-${i}`} style={styles.contextRow}>
                                <Text style={styles.contextIcon}>
                                    {clip.type === 'url' ? '🔗' : clip.type === 'phone' ? '📞' : clip.type === 'email' ? '📧' : '📋'}
                                </Text>
                                <Text style={styles.contextText} numberOfLines={1}>
                                    {clip.text}
                                </Text>
                                <Text style={styles.contextType}>{clip.type}</Text>
                            </View>
                        ))}
                        {recentNotifs.map((notif, i) => (
                            <View key={`notif-${i}`} style={styles.contextRow}>
                                <Text style={styles.contextIcon}>🔔</Text>
                                <Text style={styles.contextText} numberOfLines={1}>
                                    {notif.title || notif.appName}: {notif.text}
                                </Text>
                                <Text style={styles.contextType}>{notif.appName}</Text>
                            </View>
                        ))}
                    </GlassView>
                )}

                {/* Quick Actions */}
                <Text style={styles.sectionHeader}>Quick Actions</Text>
                <View style={styles.actionsRow}>
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => { HapticService.tap(); setShowRuns(true); }}
                        activeOpacity={0.7}
                    >
                        <GlassView style={styles.actionInner}>
                            <Text style={styles.actionIcon}>{glyphs.decision}</Text>
                            <Text style={styles.actionLabel}>Runs</Text>
                        </GlassView>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => { HapticService.tap(); setShowVoice(true); }}
                        activeOpacity={0.7}
                    >
                        <GlassView style={styles.actionInner}>
                            <Text style={styles.actionIcon}>🎙</Text>
                            <Text style={styles.actionLabel}>Voice</Text>
                        </GlassView>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => { HapticService.tap(); setShowTrust(true); }}
                        activeOpacity={0.7}
                    >
                        <GlassView style={styles.actionInner}>
                            <Text style={styles.actionIcon}>{glyphs.truth}</Text>
                            <Text style={styles.actionLabel}>Shield</Text>
                        </GlassView>
                    </TouchableOpacity>
                </View>

                {/* Offline Queue Indicator */}
                {RouterService.getQueueSize() > 0 && (
                    <GlassView style={styles.queueCard}>
                        <Text style={styles.queueText}>
                            {RouterService.getQueueSize()} queued requests — will sync when online
                        </Text>
                    </GlassView>
                )}

                <View style={{ height: spacing.xl }} />
            </ScrollView>

            {/* Modals */}
            <Modal visible={showRuns} animationType="slide" presentationStyle="fullScreen">
                <RunsFeedScreen onClose={() => setShowRuns(false)} />
            </Modal>

            <Modal visible={showTrust} animationType="slide" presentationStyle="fullScreen">
                <TrustPanelScreen onClose={() => setShowTrust(false)} />
            </Modal>

            <VoiceDispatchModal visible={showVoice} onClose={() => setShowVoice(false)} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    scrollContent: { padding: spacing.md },

    header: { marginBottom: spacing.lg, marginTop: spacing.sm },
    timeText: { ...typography.displayLarge, color: colors.textPrimary, fontWeight: '200' },
    dateText: { ...typography.bodyLarge, color: colors.textSecondary, marginTop: spacing.xs },

    pulseCard: { padding: spacing.md, marginBottom: spacing.md },
    pulseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    pulseDot: { width: 10, height: 10, borderRadius: 5 },
    pulseTitle: { ...typography.headlineSmall, color: colors.textPrimary, flex: 1 },
    ksBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
    ksText: { ...typography.labelSmall, fontWeight: '700' },
    pulseSubtext: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },

    metricsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    metricCard: { flex: 1, padding: spacing.md, alignItems: 'center' },
    metricValue: { ...typography.headlineMedium, color: colors.textPrimary, fontWeight: '600' },
    metricLabel: { ...typography.labelSmall, color: colors.textMuted, marginTop: spacing.xs },

    skillsCard: { padding: spacing.md, marginBottom: spacing.md },
    sectionTitle: { ...typography.labelMedium, color: colors.textSecondary, marginBottom: spacing.sm },
    skillRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
    skillName: { ...typography.bodySmall, color: colors.textSecondary, width: 100 },
    skillBarBg: { flex: 1, height: 4, backgroundColor: colors.surfaceElevated, borderRadius: 2, marginHorizontal: spacing.sm },
    skillBar: { height: 4, backgroundColor: colors.accentPrimary, borderRadius: 2 },
    skillScore: { ...typography.labelSmall, color: colors.textMuted, width: 36, textAlign: 'right' },

    sectionHeader: { ...typography.labelMedium, color: colors.textMuted, marginBottom: spacing.sm, letterSpacing: 1 },
    actionsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    actionBtn: { flex: 1 },
    actionInner: { padding: spacing.md, alignItems: 'center' },
    actionIcon: { fontSize: 28, marginBottom: spacing.xs },
    actionLabel: { ...typography.labelMedium, color: colors.textSecondary },

    deviceCard: { padding: spacing.md, marginBottom: spacing.md },
    deviceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
    deviceRunRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, gap: spacing.xs },
    deviceRunStatus: { ...typography.labelSmall, fontWeight: '700', width: 14 },
    deviceRunSkill: { ...typography.bodySmall, color: colors.textPrimary, width: 90 },
    deviceRunArgs: { ...typography.bodySmall, color: colors.textMuted, flex: 1 },
    deviceEmpty: { ...typography.bodySmall, color: colors.textMuted, fontStyle: 'italic' },
    deviceQueue: { ...typography.labelSmall, color: colors.warning, marginTop: spacing.xs },

    queueCard: { padding: spacing.sm },
    queueText: { ...typography.bodySmall, color: colors.warning, textAlign: 'center' },

    nudgeCard: { padding: spacing.md, marginBottom: spacing.md },
    nudgeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: spacing.sm },
    nudgePriority: { width: 4, height: 28, borderRadius: 2 },
    nudgeContent: { flex: 1 },
    nudgeTitle: { ...typography.labelSmall, color: colors.textPrimary, fontWeight: '600' },
    nudgeMessage: { ...typography.bodySmall, color: colors.textMuted, marginTop: 1 },
    nudgeDismiss: { padding: spacing.xs, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    nudgeDismissText: { ...typography.labelSmall, color: colors.textMuted, fontWeight: '700' },

    contextCard: { padding: spacing.md, marginBottom: spacing.md },
    contextRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, gap: spacing.xs },
    contextIcon: { fontSize: 14, width: 20 },
    contextText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
    contextType: { ...typography.labelSmall, color: colors.textMuted, width: 50, textAlign: 'right' },
});
