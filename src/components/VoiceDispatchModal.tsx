/**
 * Voice Dispatch Modal — Tap mic → Google Speech → Resolve Intent → Execute Tool
 *
 * UX: Tap mic → Google speech UI → transcript → resolve to tool → execute locally.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Animated,
    ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../theme';
import { HapticService } from '../services';
import { OrchestratorService } from '../services/orchestrator.service';
import { VoiceService } from '../services/voice.service';

interface VoiceDispatchModalProps {
    visible: boolean;
    onClose: () => void;
}

type DispatchState = 'idle' | 'listening' | 'processing' | 'dispatched' | 'error';

/** Simple intent resolver: maps natural language to tool + params */
function resolveIntent(text: string): { tool: string; params: Record<string, unknown> } | null {
    const lower = text.toLowerCase().trim();

    // open/launch app
    const appMatch = lower.match(/(?:open|launch|start)\s+(.+)/);
    if (appMatch) {
        const appName = appMatch[1].replace(/\bapp\b/, '').trim();
        return { tool: 'open_app', params: { app_name: appName } };
    }

    // battery
    if (/battery|charge|power level/.test(lower)) {
        return { tool: 'get_battery', params: {} };
    }

    // vibrate
    if (/vibrate|buzz|haptic/.test(lower)) {
        return { tool: 'vibrate', params: {} };
    }

    // time
    if (/what time|current time|time is it|clock/.test(lower)) {
        return { tool: 'get_time', params: {} };
    }

    // weather
    if (/weather|temperature|forecast/.test(lower)) {
        return { tool: 'get_weather', params: {} };
    }

    // clipboard
    if (/clipboard|paste|what.*copied/.test(lower)) {
        return { tool: 'get_clipboard', params: {} };
    }

    // storage
    if (/storage|disk|space|memory/.test(lower)) {
        return { tool: 'get_storage', params: {} };
    }

    // network
    if (/network|wifi|internet|connection/.test(lower)) {
        return { tool: 'get_network', params: {} };
    }

    // save note
    const noteMatch = lower.match(/(?:save|write|remember|note)\s+(.+)/);
    if (noteMatch) {
        return { tool: 'save_note', params: { text: noteMatch[1] } };
    }

    // contacts
    if (/contacts|people|address book/.test(lower)) {
        return { tool: 'get_contacts', params: {} };
    }

    // calendar/schedule
    if (/calendar|schedule|events|appointments/.test(lower)) {
        return { tool: 'get_events', params: {} };
    }

    // notifications
    if (/notification/.test(lower)) {
        return { tool: 'get_notifications', params: {} };
    }

    // device info
    if (/device info|phone info|about.*phone|system info/.test(lower)) {
        return { tool: 'get_device_info', params: {} };
    }

    // health report
    if (/health|status|report/.test(lower)) {
        return { tool: 'send_health_report', params: {} };
    }

    // alert
    if (/alert|alarm|warn/.test(lower)) {
        return { tool: 'send_alert', params: { message: text } };
    }

    return null;
}

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

    const executeIntent = useCallback(async (text: string) => {
        setTranscript(text);
        setState('processing');

        const intent = resolveIntent(text);
        if (!intent) {
            HapticService.error();
            setState('error');
            setLastResult(`No matching command for: "${text}"`);
            return;
        }

        try {
            const result = await OrchestratorService.executeTool(intent.tool, intent.params);

            if (result.success) {
                HapticService.success();
                setState('dispatched');
                const display = result.formatted
                    ? result.formatted
                    : result.data
                        ? JSON.stringify(result.data)
                        : `${intent.tool}: done`;
                setLastResult(display);
            } else {
                throw new Error(result.error || 'execution failed');
            }
        } catch (err: any) {
            HapticService.error();
            setState('error');
            setLastResult(`Error: ${err?.message || 'unknown'}`);
        }
    }, []);

    const handleMicTap = useCallback(async () => {
        HapticService.tap();
        setState('listening');
        setTranscript('');
        setLastResult(null);
        startPulse();

        const started = await VoiceService.startListening((text, isFinal) => {
            if (isFinal) {
                stopPulse();
                executeIntent(text);
            } else {
                setTranscript(text);
            }
        });

        if (!started) {
            stopPulse();
            const err = VoiceService.getLastError();
            setState('error');
            setLastResult(`Voice error: ${err || 'Could not start speech recognition'}`);
            HapticService.error();
        }
    }, [executeIntent]);

    useEffect(() => {
        if (state !== 'listening') {
            stopPulse();
        }
    }, [state]);

    const handleClose = () => {
        setState('idle');
        setTranscript('');
        setLastResult(null);
        stopPulse();
        onClose();
    };

    const stateLabel = {
        idle: 'Tap to Speak',
        listening: 'Listening...',
        processing: 'Processing...',
        dispatched: 'Done',
        error: 'Failed',
    };

    const stateColor = {
        idle: colors.textMuted,
        listening: colors.accentPrimary,
        processing: colors.accentPrimary,
        dispatched: colors.success,
        error: colors.error,
    };

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <Text style={styles.title}>Voice Dispatch</Text>
                    <Text style={styles.subtitle}>
                        Tap the mic and say a command like "open Chrome", "battery", "what time is it", or "check weather".
                    </Text>

                    {/* Mic Button */}
                    <View style={styles.micContainer}>
                        <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }], borderColor: stateColor[state] }]} />
                        <TouchableOpacity
                            style={[styles.micBtn, { borderColor: stateColor[state] }]}
                            onPress={handleMicTap}
                            disabled={state === 'processing' || state === 'listening'}
                            activeOpacity={0.8}
                        >
                            {state === 'processing' ? (
                                <ActivityIndicator color={colors.accentPrimary} size="large" />
                            ) : (
                                <Text style={styles.micIcon}>
                                    {state === 'dispatched' ? '\u2713' : state === 'error' ? '\u2717' : '\uD83C\uDF99'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.stateText, { color: stateColor[state] }]}>
                        {stateLabel[state]}
                    </Text>

                    {/* Transcript */}
                    {transcript !== '' && (
                        <View style={styles.transcriptCard}>
                            <Text style={styles.transcriptLabel}>Transcript</Text>
                            <Text style={styles.transcriptText}>{transcript}</Text>
                        </View>
                    )}

                    {/* Last Result */}
                    {lastResult && (
                        <View style={styles.resultCard}>
                            <Text style={styles.resultLabel}>{state === 'error' ? 'Error' : 'Result'}</Text>
                            <Text style={[styles.resultText, { color: state === 'error' ? colors.error : colors.success }]}>
                                {lastResult}
                            </Text>
                        </View>
                    )}

                    <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
                        <Text style={styles.closeText}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.lg },
    card: {
        padding: spacing.lg,
        alignItems: 'center',
        backgroundColor: 'rgba(30, 35, 55, 0.95)',
        borderRadius: borderRadius.xl,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
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

    transcriptCard: {
        padding: spacing.md,
        width: '100%',
        marginBottom: spacing.sm,
        backgroundColor: 'rgba(15, 20, 35, 0.75)',
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    transcriptLabel: { ...typography.labelSmall, color: colors.textMuted, marginBottom: spacing.xs },
    transcriptText: { ...typography.bodyMedium, color: colors.textPrimary },

    resultCard: {
        padding: spacing.md,
        width: '100%',
        marginBottom: spacing.sm,
        backgroundColor: 'rgba(15, 20, 35, 0.75)',
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    resultLabel: { ...typography.labelSmall, color: colors.textMuted, marginBottom: spacing.xs },
    resultText: { ...typography.bodyMedium },

    closeBtn: { marginTop: spacing.sm, padding: spacing.sm },
    closeText: { ...typography.bodyMedium, color: colors.textMuted },
});
