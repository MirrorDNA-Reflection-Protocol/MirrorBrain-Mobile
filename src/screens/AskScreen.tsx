/**
 * ASK Panel — Front Door
 * From Spec Part IV
 * 
 * Purpose: Single entry point for all cognitive assistance.
 * Every session must terminate with closure.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Modal,
    ActivityIndicator,
    Keyboard,
} from 'react-native';
import { colors, typography, spacing, glyphs } from '../theme';
import { useLLM } from '../hooks';
import { VaultService, IdentityService, HapticSymphony, VoiceService } from '../services';
import type { AskMode, ChatMessage, SessionClosure } from '../types';

// System prompt for MirrorMesh
const MIRRORMESH_SYSTEM_PROMPT = `You are MirrorMesh, a calm and thoughtful assistant integrated into MirrorBrain Mobile.
Your role is to help the user think through decisions, understand concepts, or build solutions.
Be concise but thorough. Never create urgency or anxiety.
Every session should move toward a closure: Decide, Defer, Next Action, or Pause.
If the user has identity context, use it to personalize your responses.`;

interface AskScreenProps {
    isOnline: boolean;
    onToggleOnline: () => void;
    identityLoaded: boolean;
}

export const AskScreen: React.FC<AskScreenProps> = ({
    isOnline,
    onToggleOnline,
    identityLoaded,
}) => {
    const [mode, setMode] = useState<AskMode>('MirrorMesh');
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [streamingText, setStreamingText] = useState('');
    const [showModelModal, setShowModelModal] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const scrollViewRef = useRef<ScrollView>(null);

    // Voice State
    const [isListening, setIsListening] = useState(false);

    const {
        isModelLoaded,
        loadedModel,
        isLoading,
        isGenerating,
        loadModel,
        downloadModel,
        chat,
        availableModels,
        checkModelExists,
    } = useLLM();

    // Voice Handlers
    const handleStartVoice = async () => {
        HapticSymphony.tap(); // Initial cue
        setInput('');
        setIsListening(true);

        const started = await VoiceService.startListening((text, isFinal) => {
            setInput(text);
            if (isFinal) {
                // Optional: Auto-send on final silence? For now let user confirm.
            }
        });

        if (!started) {
            setIsListening(false);
        }
    };

    const handleStopVoice = async () => {
        HapticSymphony.select(); // Confirmation cue
        await VoiceService.stopListening();
        setIsListening(false);
    };

    // Check for model on mount
    useEffect(() => {
        checkInitialModel();
    }, []);

    const checkInitialModel = async () => {
        const hasQwen = await checkModelExists('qwen-2.5-1.5b');
        if (hasQwen && !isModelLoaded) {
            await loadModel('qwen-2.5-1.5b');
        } else if (!hasQwen) {
            // Show model download modal on first use
            setShowModelModal(true);
        }
    };

    // Haptic Heartbeat during generation
    useEffect(() => {
        let heartbeatInterval: NodeJS.Timeout;
        if (isGenerating) {
            // Initial beat
            HapticSymphony.heartbeat();
            // Rhythm
            heartbeatInterval = setInterval(() => {
                HapticSymphony.heartbeat();
            }, 2000); // Slow, deliberate thought rhythm
        }
        return () => {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
        };
    }, [isGenerating]);

    const handleModeChange = (newMode: AskMode) => {
        setMode(newMode);
        // When switching to Online mode, turn on online
        // When tapping Online while already in Online mode, toggle off
        if (newMode === 'Online' && mode === 'Online') {
            onToggleOnline(); // Toggle off
        } else if (newMode === 'Online' && !isOnline) {
            onToggleOnline(); // Turn on
        }
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setStreamingText('');

        if (mode === 'MirrorMesh') {
            if (!isModelLoaded) {
                // Fallback if no model
                const fallbackMessage: ChatMessage = {
                    role: 'assistant',
                    content: 'Model not loaded. Tap the settings button to download a model.',
                    timestamp: new Date(),
                };
                setMessages([...newMessages, fallbackMessage]);
                return;
            }

            // Build system prompt with identity context
            let systemPrompt = MIRRORMESH_SYSTEM_PROMPT;
            if (identityLoaded) {
                const identityContext = IdentityService.getContext();
                if (identityContext) {
                    systemPrompt = `${MIRRORMESH_SYSTEM_PROMPT}\n\nUser Identity:\n${identityContext}`;
                }
            }

            // Stream response with minimum thinking time (Pinnacle Experience)
            const thinkingDelay = new Promise(resolve => setTimeout(resolve, 2000)); // 2s minimum heartbeats

            const [result] = await Promise.all([
                chat(
                    newMessages,
                    systemPrompt,
                    (token) => {
                        setStreamingText(prev => prev + token);
                    }
                ),
                thinkingDelay
            ]);

            if (result) {
                const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: result.text,
                    timestamp: new Date(),
                };
                setMessages([...newMessages, assistantMessage]);
                setStreamingText('');
            }
        } else if (mode === 'Vault') {
            // Search vault
            const results = await VaultService.search(input.trim());
            const responseMessage: ChatMessage = {
                role: 'assistant',
                content: results.length > 0
                    ? `Found ${results.length} items:\n${results.slice(0, 5).map(r => `• ${(r as { title: string }).title}`).join('\n')}`
                    : 'No items found in vault.',
                timestamp: new Date(),
            };
            setMessages([...newMessages, responseMessage]);
        } else {
            // Online mode - placeholder
            const responseMessage: ChatMessage = {
                role: 'assistant',
                content: 'Online search requires network access. This will use a privacy-respecting provider like Brave or Kagi.',
                timestamp: new Date(),
            };
            setMessages([...newMessages, responseMessage]);
        }
    };

    const handleClosure = async (closure: SessionClosure) => {
        // 1. Physical confirmation (The Shatter)
        await HapticSymphony.shatter();

        // 2. Visual confirmation (could add a toast here, for now just a small pause)
        await new Promise(r => setTimeout(r, 500));

        // 3. Save session to vault
        await VaultService.saveSession(messages, closure);

        // 4. Clear connection
        setMessages([]);
        setStreamingText('');
    };



    const handleDownloadModel = async (modelId: 'qwen-2.5-1.5b' | 'smollm2-360m') => {
        setDownloadProgress(0);

        const success = await downloadModel(modelId, (progress) => {
            setDownloadProgress(progress);
        });

        setDownloadProgress(null);

        if (success) {
            await loadModel(modelId);
            setShowModelModal(false);
        }
    };

    const hasActiveSession = messages.length > 0;

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 60}
        >
            {/* Online banner */}
            {isOnline && (
                <TouchableOpacity
                    style={styles.onlineBanner}
                    onPress={onToggleOnline}
                >
                    <Text style={styles.onlineBannerText}>
                        🌐 Online — tap to disconnect
                    </Text>
                </TouchableOpacity>
            )}

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={styles.glyph}>{glyphs.synthesis}</Text>
                    <Text style={styles.title}>ASK</Text>
                </View>
                <TouchableOpacity
                    style={styles.modelButton}
                    onPress={() => setShowModelModal(true)}
                >
                    <Text style={styles.modelButtonText}>
                        {isModelLoaded ? '⚙️' : '⚠️'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Mode chips */}
            <View style={styles.modeChips}>
                <ModeChip
                    label="MirrorMesh"
                    active={mode === 'MirrorMesh'}
                    onPress={() => handleModeChange('MirrorMesh')}
                />
                <ModeChip
                    label="Vault"
                    active={mode === 'Vault'}
                    onPress={() => handleModeChange('Vault')}
                />
                <ModeChip
                    label="Online"
                    active={mode === 'Online'}
                    onPress={() => handleModeChange('Online')}
                    indicator={isOnline}
                />
            </View>

            {/* Model status */}
            {!isModelLoaded && mode === 'MirrorMesh' && (
                <TouchableOpacity
                    style={styles.modelWarning}
                    onPress={() => setShowModelModal(true)}
                >
                    <Text style={styles.modelWarningText}>
                        ⚠️ No model loaded — tap to download
                    </Text>
                </TouchableOpacity>
            )}

            {/* Chat area */}
            <ScrollView
                ref={scrollViewRef}
                style={styles.chatArea}
                contentContainerStyle={styles.chatContent}
                onContentSizeChange={() => scrollViewRef.current?.scrollToEnd()}
            >
                {messages.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyPrompt}>
                            {mode === 'MirrorMesh'
                                ? "What are you trying to decide, build, or understand?"
                                : mode === 'Vault'
                                    ? "Search your vault..."
                                    : "Search the web..."}
                        </Text>
                        {identityLoaded && (
                            <Text style={styles.identityIndicator}>
                                {glyphs.truth} Identity loaded
                            </Text>
                        )}
                    </View>
                ) : (
                    messages.map((msg, index) => (
                        <MessageBubble key={index} message={msg} />
                    ))
                )}

                {/* Streaming text */}
                {streamingText && (
                    <View style={styles.messageBubble}>
                        <Text style={styles.messageText}>{streamingText}</Text>
                        <Text style={styles.streamingCursor}>▊</Text>
                    </View>
                )}

                {isGenerating && !streamingText && (
                    <View style={styles.streamingIndicator}>
                        <ActivityIndicator size="small" color={colors.accentPrimary} />
                        <Text style={styles.streamingText}>Thinking...</Text>
                    </View>
                )}
            </ScrollView>

            {/* Session closure buttons - show when session active */}
            {hasActiveSession && mode === 'MirrorMesh' && !isGenerating && (
                <View style={styles.closureButtons}>
                    <ClosureButton
                        label="Decide"
                        glyph={glyphs.decision}
                        onPress={() => handleClosure({
                            type: 'decide',
                            decision: 'TBD',
                            rationale: 'TBD'
                        })}
                    />
                    <ClosureButton
                        label="Defer"
                        onPress={() => handleClosure({ type: 'defer', reason: 'Need more info' })}
                    />
                    <ClosureButton
                        label="Next"
                        onPress={() => handleClosure({ type: 'next', action: 'Follow up' })}
                    />
                    <ClosureButton
                        label="Pause"
                        onPress={() => handleClosure({ type: 'pause' })}
                    />
                </View>
            )}

            {/* Input area */}
            <View style={styles.inputContainer}>
                <TouchableOpacity
                    style={styles.micButton}
                    onPress={isListening ? handleStopVoice : handleStartVoice}
                >
                    <Text style={styles.micButtonText}>
                        {isListening ? '🛑' : '🎤'}
                    </Text>
                </TouchableOpacity>

                <TextInput
                    style={styles.input}
                    placeholder={isListening ? "Listening..." : getPlaceholder(mode)}
                    placeholderTextColor={isListening ? colors.accentPrimary : colors.textMuted}
                    value={input}
                    onChangeText={setInput}
                    multiline
                    maxLength={2000}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                />
                <TouchableOpacity
                    style={[
                        styles.sendButton,
                        (!input.trim() || isGenerating) && styles.sendButtonDisabled
                    ]}
                    onPress={handleSend}
                    disabled={!input.trim() || isGenerating}
                >
                    {isGenerating ? (
                        <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                        <Text style={styles.sendButtonText}>→</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Voice Overlay */}
            {isListening && (
                <TouchableOpacity
                    style={styles.voiceOverlay}
                    activeOpacity={1}
                    onPress={handleStopVoice}
                >
                    <View style={[styles.voiceIndicator, { transform: [{ scale: 1.2 }] }]}>
                        <Text style={styles.voiceGlyph}>🎤</Text>
                        <Text style={styles.voiceText}>Listening...</Text>
                    </View>
                </TouchableOpacity>
            )}

            {/* Model download modal */}
            <Modal
                visible={showModelModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowModelModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Models</Text>
                            <TouchableOpacity
                                onPress={() => setShowModelModal(false)}
                                style={styles.closeButton}
                            >
                                <Text style={styles.closeButtonText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalSubtitle}>
                            {loadedModel ? `Loaded: ${loadedModel}` : 'No model loaded'}
                        </Text>

                        {availableModels.map(model => (
                            <View key={model.id} style={styles.modelCard}>
                                <View style={styles.modelInfo}>
                                    <Text style={styles.modelName}>{model.name}</Text>
                                    <Text style={styles.modelSize}>{model.size}</Text>
                                    <Text style={styles.modelDesc}>{model.description}</Text>
                                </View>
                                <TouchableOpacity
                                    style={[
                                        styles.downloadButton,
                                        loadedModel === model.id && styles.downloadButtonLoaded,
                                    ]}
                                    onPress={() => handleDownloadModel(model.id as 'qwen-2.5-1.5b' | 'smollm2-360m')}
                                    disabled={isLoading || loadedModel === model.id}
                                >
                                    <Text style={styles.downloadButtonText}>
                                        {loadedModel === model.id ? '✓ Loaded' : 'Download'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ))}

                        {downloadProgress !== null && (
                            <View style={styles.progressContainer}>
                                <View
                                    style={[
                                        styles.progressBar,
                                        { width: `${downloadProgress * 100}%` }
                                    ]}
                                />
                                <Text style={styles.progressText}>
                                    {Math.round(downloadProgress * 100)}%
                                </Text>
                            </View>
                        )}

                        {isLoading && downloadProgress === null && (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="small" color={colors.accentPrimary} />
                                <Text style={styles.loadingText}>Loading model...</Text>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
};

const ModeChip: React.FC<{
    label: string;
    active: boolean;
    onPress: () => void;
    indicator?: boolean;
}> = ({ label, active, onPress, indicator }) => (
    <TouchableOpacity
        style={[styles.modeChip, active && styles.modeChipActive]}
        onPress={onPress}
    >
        {indicator && <View style={styles.onlineDot} />}
        <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
            {label}
        </Text>
    </TouchableOpacity>
);

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isUser = message.role === 'user';
    return (
        <View style={[styles.messageBubble, isUser && styles.userBubble]}>
            <Text style={[styles.messageText, isUser && styles.userMessageText]}>
                {message.content}
            </Text>
        </View>
    );
};

const ClosureButton: React.FC<{
    label: string;
    glyph?: string;
    onPress: () => void;
}> = ({ label, glyph, onPress }) => (
    <TouchableOpacity style={styles.closureButton} onPress={onPress}>
        {glyph && <Text style={styles.closureGlyph}>{glyph}</Text>}
        <Text style={styles.closureButtonText}>{label}</Text>
    </TouchableOpacity>
);

const getPlaceholder = (mode: AskMode): string => {
    switch (mode) {
        case 'MirrorMesh': return 'Ask MirrorMesh...';
        case 'Vault': return 'Search vault...';
        case 'Online': return 'Search the web...';
    }
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },

    // Online banner
    onlineBanner: {
        backgroundColor: colors.online,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        alignItems: 'center',
    },
    onlineBannerText: {
        ...typography.labelMedium,
        color: colors.background,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.lg,
        paddingBottom: spacing.md,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    glyph: {
        fontSize: 24,
        color: colors.glyphSynthesis,
        marginRight: spacing.sm,
    },
    title: {
        ...typography.displayLarge,
        color: colors.textPrimary,
    },
    modelButton: {
        padding: spacing.sm,
    },
    modelButtonText: {
        fontSize: 20,
    },

    // Mode chips
    modeChips: {
        flexDirection: 'row',
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.md,
        gap: spacing.sm,
    },
    modeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: 20,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    modeChipActive: {
        borderColor: colors.accentPrimary,
        backgroundColor: colors.surfaceElevated,
    },
    modeChipText: {
        ...typography.labelMedium,
        color: colors.textSecondary,
    },
    modeChipTextActive: {
        color: colors.accentLight,
    },
    onlineDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.online,
        marginRight: spacing.xs,
    },

    // Model warning
    modelWarning: {
        marginHorizontal: spacing.lg,
        marginBottom: spacing.md,
        padding: spacing.sm,
        backgroundColor: colors.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.warning,
    },
    modelWarningText: {
        ...typography.labelSmall,
        color: colors.warning,
        textAlign: 'center',
    },

    // Chat area
    chatArea: {
        flex: 1,
    },
    chatContent: {
        padding: spacing.lg,
        paddingBottom: spacing.xl,
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: spacing.xxl,
    },
    emptyPrompt: {
        ...typography.headlineSmall,
        color: colors.textSecondary,
        textAlign: 'center',
    },
    identityIndicator: {
        ...typography.labelSmall,
        color: colors.glyphTruth,
        marginTop: spacing.lg,
    },

    // Messages
    messageBubble: {
        backgroundColor: colors.surface,
        padding: spacing.md,
        borderRadius: 12,
        marginBottom: spacing.sm,
        maxWidth: '85%',
        alignSelf: 'flex-start',
    },
    userBubble: {
        backgroundColor: colors.accentDark,
        alignSelf: 'flex-end',
    },
    messageText: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
    },
    userMessageText: {
        color: colors.textPrimary,
    },
    streamingCursor: {
        color: colors.accentPrimary,
    },
    streamingIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.sm,
        gap: spacing.sm,
    },
    streamingText: {
        ...typography.labelSmall,
        color: colors.textMuted,
        fontStyle: 'italic',
    },

    // Closure buttons
    closureButtons: {
        flexDirection: 'row',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        gap: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.surface,
    },
    closureButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.sm,
        borderRadius: 8,
        backgroundColor: colors.surface,
    },
    closureGlyph: {
        color: colors.glyphDecision,
        marginRight: spacing.xs,
    },
    closureButtonText: {
        ...typography.labelMedium,
        color: colors.textSecondary,
    },

    // Input
    inputContainer: {
        flexDirection: 'row',
        padding: spacing.md,
        paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.xl,
        alignItems: 'flex-end',
        borderTopWidth: 1,
        borderTopColor: colors.surface,
        backgroundColor: colors.background,
    },
    input: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 12,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        ...typography.bodyMedium,
        color: colors.textPrimary,
        maxHeight: 100,
    },
    sendButton: {
        marginLeft: spacing.sm,
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.accentPrimary,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    sendButtonDisabled: {
        backgroundColor: colors.surface,
        elevation: 0,
        shadowOpacity: 0,
    },
    sendButtonText: {
        fontSize: 24,
        color: colors.textPrimary,
        fontWeight: 'bold',
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
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },
    modalTitle: {
        ...typography.headlineMedium,
        color: colors.textPrimary,
    },
    modalSubtitle: {
        ...typography.labelSmall,
        color: colors.textMuted,
        marginBottom: spacing.lg,
    },
    closeButton: {
        padding: spacing.sm,
    },
    closeButtonText: {
        ...typography.headlineMedium,
        color: colors.textMuted,
    },

    // Model cards
    modelCard: {
        flexDirection: 'row',
        backgroundColor: colors.background,
        borderRadius: 12,
        padding: spacing.md,
        marginBottom: spacing.sm,
        alignItems: 'center',
    },
    modelInfo: {
        flex: 1,
    },
    modelName: {
        ...typography.headlineSmall,
        color: colors.textPrimary,
    },
    modelSize: {
        ...typography.labelSmall,
        color: colors.textMuted,
    },
    modelDesc: {
        ...typography.bodySmall,
        color: colors.textSecondary,
        marginTop: spacing.xs,
    },
    downloadButton: {
        backgroundColor: colors.accentPrimary,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: 8,
    },
    downloadButtonLoaded: {
        backgroundColor: colors.success,
    },
    downloadButtonText: {
        ...typography.labelMedium,
        color: colors.textPrimary,
    },

    // Progress
    progressContainer: {
        height: 24,
        backgroundColor: colors.background,
        borderRadius: 12,
        marginTop: spacing.md,
        overflow: 'hidden',
        position: 'relative',
    },
    progressBar: {
        height: '100%',
        backgroundColor: colors.accentPrimary,
    },
    progressText: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        textAlign: 'center',
        lineHeight: 24,
        ...typography.labelSmall,
        color: colors.textPrimary,
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: spacing.md,
        gap: spacing.sm,
    },
    loadingText: {
        ...typography.labelSmall,
        color: colors.textMuted,
    },

    // Voice Overlay
    voiceOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    voiceIndicator: {
        backgroundColor: colors.surfaceElevated,
        padding: spacing.xl,
        borderRadius: 24,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    voiceGlyph: {
        fontSize: 48,
        marginBottom: spacing.md,
        color: colors.accentPrimary,
    },
    voiceText: {
        ...typography.headlineMedium,
        color: colors.textPrimary,
    },
    micButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.sm,
    },
    micButtonText: {
        fontSize: 20,
    },
});

export default AskScreen;
