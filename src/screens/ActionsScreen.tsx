/**
 * ACTIONS Panel — Handoff Layer
 * From Spec Part VI
 * 
 * Purpose: Quick intents that bridge to other apps or system functions.
 * Each action is explicit, single-step, user-initiated.
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Modal,
    Alert,
    Linking,
    ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, glyphs } from '../theme';
import { VaultService, CalendarService, VoiceService, type CalendarEvent } from '../services';

interface Action {
    id: string;
    icon: string;
    label: string;
    description: string;
    available: boolean;
}

const actions: Action[] = [
    {
        id: 'capture-note',
        icon: '📝',
        label: 'Capture note',
        description: 'Quick text input → Vault',
        available: true,
    },
    {
        id: 'voice-capture',
        icon: '🎤',
        label: 'Voice capture',
        description: 'Record → transcribe → Vault',
        available: true,
    },
    {
        id: 'screenshot-summarize',
        icon: '📸',
        label: 'Screenshot → Vault',
        description: 'Save screenshot (no summary yet)',
        available: false, // Needs vision model
    },
    {
        id: 'calendar-glance',
        icon: '📅',
        label: 'Calendar glance',
        description: 'Today only, read-only',
        available: true,
    },
    {
        id: 'navigation',
        icon: '🗺️',
        label: 'Navigation handoff',
        description: 'Open maps with context',
        available: true,
    },
    {
        id: 'share-inbox',
        icon: '📥',
        label: 'Share inbox',
        description: 'Receive shares from other apps',
        available: false, // Phase 4
    },
];

interface ActionsScreenProps {
    // Future: permissions state, etc.
}

export const ActionsScreen: React.FC<ActionsScreenProps> = () => {
    // Note capture state
    const [captureModalVisible, setCaptureModalVisible] = useState(false);
    const [captureText, setCaptureText] = useState('');
    const [captureTitle, setCaptureTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Calendar state
    const [calendarModalVisible, setCalendarModalVisible] = useState(false);
    const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
    const [loadingCalendar, setLoadingCalendar] = useState(false);

    // Voice state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingText, setRecordingText] = useState('');



    const handleAction = (action: Action) => {
        if (!action.available) {
            Alert.alert('Coming Soon', 'This feature will be available in a future update.');
            return;
        }

        switch (action.id) {
            case 'capture-note':
                setCaptureModalVisible(true);
                break;
            case 'voice-capture':
                handleVoiceCapture();
                break;
            case 'calendar-glance':
                handleCalendarGlance();
                break;
            case 'navigation':
                handleNavigation();
                break;
        }
    };

    const handleNavigation = async () => {
        const url = 'geo:0,0?q=';
        const canOpen = await Linking.canOpenURL(url);

        if (canOpen) {
            await Linking.openURL(url);
        } else {
            Alert.alert('Maps', 'No maps application available.');
        }
    };

    const handleCalendarGlance = async () => {
        setLoadingCalendar(true);
        setCalendarModalVisible(true);

        try {
            const events = await CalendarService.getTodayEvents();
            setCalendarEvents(events);
        } catch (error) {
            Alert.alert('Calendar', 'Failed to load calendar events');
        } finally {
            setLoadingCalendar(false);
        }
    };

    const handleVoiceCapture = async () => {
        if (isRecording) {
            // Stop listening
            setIsRecording(false);
            await VoiceService.stopListening();

            // Save if we have text
            if (recordingText.trim()) {
                await VaultService.saveCapture(
                    'voice',
                    recordingText,
                    `Voice - ${new Date().toLocaleTimeString()}`
                );
                Alert.alert('Saved', 'Transcription saved to vault');
                setRecordingText('');
            }
        } else {
            // Start listening
            setRecordingText('');
            const started = await VoiceService.startListening((text, isFinal) => {
                setRecordingText(text);
            });

            if (started) {
                setIsRecording(true);
            } else {
                Alert.alert('Error', 'Failed to start microphone. Check permissions.');
            }
        }
    };

    const handleSaveCapture = async () => {
        if (!captureText.trim()) return;

        setIsSaving(true);

        try {
            if (!VaultService.isInitialized()) {
                await VaultService.initialize();
            }

            const id = await VaultService.saveCapture(
                'note',
                captureText.trim(),
                captureTitle.trim() || undefined
            );

            if (id) {
                Alert.alert('Saved', 'Note captured to vault');
                setCaptureText('');
                setCaptureTitle('');
                setCaptureModalVisible(false);
            } else {
                Alert.alert('Error', 'Failed to save capture');
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to save capture');
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    const formatEventTime = (event: CalendarEvent): string => {
        if (event.isAllDay) return 'All day';
        return event.startDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.glyph}>{glyphs.decision}</Text>
                <Text style={styles.title}>ACTIONS</Text>
            </View>

            {/* Recording indicator */}
            {isRecording && (
                <TouchableOpacity
                    style={styles.recordingBanner}
                    onPress={handleVoiceCapture}
                >
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingText} numberOfLines={1}>
                        {recordingText || "Listening..."}
                    </Text>
                </TouchableOpacity>
            )}

            {/* Actions grid */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.actionsGrid}
            >
                {actions.map(action => (
                    <TouchableOpacity
                        key={action.id}
                        style={[
                            styles.actionCard,
                            !action.available && styles.actionCardDisabled,
                            action.id === 'voice-capture' && isRecording && styles.actionCardActive,
                        ]}
                        onPress={() => handleAction(action)}
                    >
                        <Text style={styles.actionIcon}>{action.icon}</Text>
                        <Text style={[
                            styles.actionLabel,
                            !action.available && styles.actionLabelDisabled
                        ]}>
                            {action.label}
                        </Text>
                        <Text style={styles.actionDescription}>{action.description}</Text>
                        {!action.available && (
                            <View style={styles.comingSoonBadge}>
                                <Text style={styles.comingSoonText}>Soon</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Constraints reminder */}
            <View style={styles.constraintsSection}>
                <Text style={styles.constraintsTitle}>
                    {glyphs.truth} Principles
                </Text>
                <Text style={styles.constraintsText}>
                    No automation chains. No background actions.{'\n'}
                    Each action is explicit, single-step, user-initiated.
                </Text>
            </View>

            {/* Capture note modal */}
            <Modal
                visible={captureModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setCaptureModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Quick Capture</Text>
                            <TouchableOpacity
                                onPress={() => setCaptureModalVisible(false)}
                                style={styles.closeButton}
                            >
                                <Text style={styles.closeButtonText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            style={styles.titleInput}
                            placeholder="Title (optional)"
                            placeholderTextColor={colors.textMuted}
                            value={captureTitle}
                            onChangeText={setCaptureTitle}
                        />

                        <TextInput
                            style={styles.captureInput}
                            placeholder="What's on your mind?"
                            placeholderTextColor={colors.textMuted}
                            value={captureText}
                            onChangeText={setCaptureText}
                            multiline
                            autoFocus
                        />

                        <TouchableOpacity
                            style={[
                                styles.saveButton,
                                (!captureText.trim() || isSaving) && styles.saveButtonDisabled
                            ]}
                            onPress={handleSaveCapture}
                            disabled={!captureText.trim() || isSaving}
                        >
                            <Text style={styles.saveButtonText}>
                                {isSaving ? 'Saving...' : 'Save to Vault'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Calendar modal */}
            <Modal
                visible={calendarModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setCalendarModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>📅 Today</Text>
                            <TouchableOpacity
                                onPress={() => setCalendarModalVisible(false)}
                                style={styles.closeButton}
                            >
                                <Text style={styles.closeButtonText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {loadingCalendar ? (
                            <ActivityIndicator size="large" color={colors.accentPrimary} />
                        ) : calendarEvents.length === 0 ? (
                            <View style={styles.emptyCalendar}>
                                <Text style={styles.emptyText}>No events today</Text>
                                <Text style={styles.emptyHint}>Your day is clear</Text>
                            </View>
                        ) : (
                            <ScrollView style={styles.eventsList}>
                                {calendarEvents.map(event => (
                                    <View key={event.id} style={styles.eventCard}>
                                        <Text style={styles.eventTime}>
                                            {formatEventTime(event)}
                                        </Text>
                                        <View style={styles.eventInfo}>
                                            <Text style={styles.eventTitle}>{event.title}</Text>
                                            {event.location && (
                                                <Text style={styles.eventLocation}>📍 {event.location}</Text>
                                            )}
                                        </View>
                                    </View>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.lg,
        paddingBottom: spacing.md,
    },
    glyph: {
        fontSize: 24,
        color: colors.glyphDecision,
        marginRight: spacing.sm,
    },
    title: {
        ...typography.displayLarge,
        color: colors.textPrimary,
    },

    // Recording banner
    recordingBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.error,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    recordingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.textPrimary,
        marginRight: spacing.sm,
    },
    recordingText: {
        ...typography.labelMedium,
        color: colors.textPrimary,
    },

    // Actions grid
    scrollView: {
        flex: 1,
    },
    actionsGrid: {
        padding: spacing.lg,
        paddingTop: 0,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md,
    },
    actionCard: {
        width: '47%',
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: spacing.md,
        minHeight: 120,
        position: 'relative',
    },
    actionCardDisabled: {
        opacity: 0.6,
    },
    actionCardActive: {
        borderWidth: 2,
        borderColor: colors.error,
    },
    actionIcon: {
        fontSize: 28,
        marginBottom: spacing.sm,
    },
    actionLabel: {
        ...typography.headlineSmall,
        color: colors.textPrimary,
        marginBottom: spacing.xs,
    },
    actionLabelDisabled: {
        color: colors.textSecondary,
    },
    actionDescription: {
        ...typography.bodySmall,
        color: colors.textSecondary,
    },
    comingSoonBadge: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        paddingVertical: 2,
        paddingHorizontal: spacing.xs,
        borderRadius: 4,
    },
    comingSoonText: {
        ...typography.labelSmall,
        color: colors.textMuted,
        fontSize: 10,
    },

    // Constraints
    constraintsSection: {
        padding: spacing.lg,
        borderTopWidth: 1,
        borderTopColor: colors.surface,
    },
    constraintsTitle: {
        ...typography.labelMedium,
        color: colors.glyphTruth,
        marginBottom: spacing.xs,
    },
    constraintsText: {
        ...typography.bodySmall,
        color: colors.textMuted,
        lineHeight: 18,
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: colors.overlay,
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: spacing.lg,
        paddingBottom: spacing.xxl,
        maxHeight: '70%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    modalTitle: {
        ...typography.headlineMedium,
        color: colors.textPrimary,
    },
    closeButton: {
        padding: spacing.sm,
    },
    closeButtonText: {
        ...typography.headlineMedium,
        color: colors.textMuted,
    },
    titleInput: {
        backgroundColor: colors.background,
        borderRadius: 12,
        padding: spacing.md,
        ...typography.bodyLarge,
        color: colors.textPrimary,
        marginBottom: spacing.sm,
    },
    captureInput: {
        backgroundColor: colors.background,
        borderRadius: 12,
        padding: spacing.md,
        minHeight: 120,
        ...typography.bodyLarge,
        color: colors.textPrimary,
        textAlignVertical: 'top',
        marginBottom: spacing.md,
    },
    saveButton: {
        backgroundColor: colors.accentPrimary,
        borderRadius: 12,
        padding: spacing.md,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        backgroundColor: colors.textMuted,
    },
    saveButtonText: {
        ...typography.labelLarge,
        color: colors.textPrimary,
    },

    // Calendar
    emptyCalendar: {
        alignItems: 'center',
        paddingVertical: spacing.xl,
    },
    emptyText: {
        ...typography.headlineSmall,
        color: colors.textSecondary,
    },
    emptyHint: {
        ...typography.bodySmall,
        color: colors.textMuted,
        marginTop: spacing.xs,
    },
    eventsList: {
        maxHeight: 300,
    },
    eventCard: {
        flexDirection: 'row',
        backgroundColor: colors.background,
        borderRadius: 12,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    eventTime: {
        ...typography.labelMedium,
        color: colors.accentLight,
        width: 70,
    },
    eventInfo: {
        flex: 1,
    },
    eventTitle: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
    },
    eventLocation: {
        ...typography.bodySmall,
        color: colors.textMuted,
        marginTop: spacing.xs,
    },
});

export default ActionsScreen;
