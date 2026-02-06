/**
 * Voice Dispatch Modal — Record → Transcribe → Create Run
 *
 * UX: Tap mic → recording pulse → release → transcribe → dispatch to Router.
 * Shows last dispatch result. Supports offline queueing.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Animated,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { colors, typography, spacing, glyphs } from '../theme';
import { GlassView } from './GlassView';
import { RouterService, HapticService } from '../services';

interface VoiceDispatchModalProps {
    visible: boolean;
    onClose: () => void;
}

type DispatchState = 'idle' | 'recording' | 'processing' | 'dispatched' | 'error';

export const VoiceDispatchModal: React.FC<VoiceDispatchModalProps> = ({ visible, onClose }) => {
    const [state, setState] = useState<DispatchState>('idle');
    const [transcript, setTranscript] = useState('');
    const [lastResult, setLastResult] = useState<string | null>(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

    const startPulse = () => {
        pulseRef.current = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.3, duration: 600, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
            ])
        );
        pulseRef.current.start();
    };

    const stopPulse = () => {
        pulseRef.current?.stop();
        pulseAnim.setValue(1);
    };

    const handlePressIn = useCallback(() => {
        HapticService.tap();
        setState('recording');
        setTranscript('');
        setLastResult(null);
        startPulse();
    }, []);

    const handlePressOut = useCallback(async () => {
        stopPulse();
        setState('processing');
        HapticService.impact();

        // Simulate voice transcription
        // In production: AudioRecord → Whisper/on-device STT → transcript
        await new Promise(resolve => setTimeout(resolve, 1200));

        const mockTranscripts = [
            'Check system health and report any issues',
            'Run analytics summary for SovereignLoop',
            'Score the last completed run',
            'Replay the most recent failed run',
            'Show me the trust metrics for today',
        ];
        const simTranscript = mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)];
        setTranscript(simTranscript);

        // Dispatch to Router as a vault draft (captures the voice command)
        try {
            const res = await RouterService.vaultWriteDraft(
                `Voice Dispatch: ${simTranscript.slice(0, 50)}`,
                `**Voice Command**\n\n> ${simTranscript}\n\nDispatched at: ${new Date().toISOString()}`,
                'SovereignLoop',
                ['voice-dispatch'],
            );

            // Also audit the dispatch
            await RouterService.auditAppend('voice_dispatch', {
                transcript: simTranscript,
                dispatched: true,
                queued: res.queued || false,
            });

            if (res.ok) {
                HapticService.success();
                setState('dispatched');
                setLastResult(`Dispatched: "${simTranscript}"`);
            } else if (res.queued) {
                HapticService.select();
                setState('dispatched');
                setLastResult(`Queued (offline): "${simTranscript}"`);
            } else {
                throw new Error(res.error || 'dispatch failed');
            }
        } catch (err: any) {
            HapticService.error();
            setState('error');
            setLastResult(`Error: ${err?.message || 'unknown'}`);
        }
    }, []);

    const handleClose = () => {
        setState('idle');
        setTranscript('');
        setLastResult(null);
        stopPulse();
        onClose();
    };

    const stateLabel = {
        idle: 'Hold to Record',
        recording: 'Recording...',
        processing: 'Processing...',
        dispatched: 'Dispatched',
        error: 'Failed',
    };

    const stateColor = {
        idle: colors.textMuted,
        recording: colors.error,
        processing: colors.accentPrimary,
        dispatched: colors.success,
        error: colors.error,
    };

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={styles.overlay}>
                <GlassView style={styles.card} variant="prominent">
                    <Text style={styles.title}>Voice Dispatch</Text>
                    <Text style={styles.subtitle}>
                        Hold the mic to record a command. Release to transcribe and dispatch.
                    </Text>

                    {/* Mic Button */}
                    <View style={styles.micContainer}>
                        <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }], borderColor: stateColor[state] }]} />
                        <TouchableOpacity
                            style={[styles.micBtn, { borderColor: stateColor[state] }]}
                            onPressIn={handlePressIn}
                            onPressOut={handlePressOut}
                            disabled={state === 'processing'}
                            activeOpacity={0.8}
                        >
                            {state === 'processing' ? (
                                <ActivityIndicator color={colors.accentPrimary} size="large" />
                            ) : (
                                <Text style={styles.micIcon}>
                                    {state === 'dispatched' ? '✓' : state === 'error' ? '✗' : '🎙'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.stateText, { color: stateColor[state] }]}>
                        {stateLabel[state]}
                    </Text>

                    {/* Transcript */}
                    {transcript !== '' && (
                        <GlassView style={styles.transcriptCard} variant="subtle">
                            <Text style={styles.transcriptLabel}>Transcript</Text>
                            <Text style={styles.transcriptText}>{transcript}</Text>
                        </GlassView>
                    )}

                    {/* Last Result */}
                    {lastResult && (
                        <Text style={[styles.resultText, { color: state === 'error' ? colors.error : colors.success }]}>
                            {lastResult}
                        </Text>
                    )}

                    {/* Queue indicator */}
                    {RouterService.getQueueSize() > 0 && (
                        <Text style={styles.queueText}>
                            {RouterService.getQueueSize()} requests queued
                        </Text>
                    )}

                    <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                        <Text style={styles.closeText}>Close</Text>
                    </TouchableOpacity>
                </GlassView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg },
    card: { padding: spacing.lg, alignItems: 'center' },
    title: { ...typography.headlineMedium, color: colors.textPrimary, marginBottom: spacing.xs },
    subtitle: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },

    micContainer: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginVertical: spacing.md },
    pulseRing: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        opacity: 0.3,
    },
    micBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    micIcon: { fontSize: 32 },

    stateText: { ...typography.labelMedium, marginBottom: spacing.md },

    transcriptCard: { padding: spacing.md, width: '100%', marginBottom: spacing.sm },
    transcriptLabel: { ...typography.labelSmall, color: colors.textMuted, marginBottom: spacing.xs },
    transcriptText: { ...typography.bodyMedium, color: colors.textPrimary },

    resultText: { ...typography.bodySmall, textAlign: 'center', marginBottom: spacing.sm },
    queueText: { ...typography.labelSmall, color: colors.warning, marginBottom: spacing.sm },

    closeBtn: { marginTop: spacing.sm, padding: spacing.sm },
    closeText: { ...typography.bodyMedium, color: colors.textMuted },
});
