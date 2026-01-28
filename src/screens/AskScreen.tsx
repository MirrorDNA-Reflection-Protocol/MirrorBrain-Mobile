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
import { VaultService, IdentityService, HapticSymphony, VoiceService, SearchService, OrchestratorService } from '../services';
import type { SearchResult, MemorySpark } from '../services';
import { BrowserPane, SearchResultCard } from '../components';
import { RefineButton } from '../components/RefineButton';
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

    // Closure modal state
    const [showClosureModal, setShowClosureModal] = useState(false);
    const [closureType, setClosureType] = useState<SessionClosure['type'] | null>(null);
    const [closureInput, setClosureInput] = useState('');

    // Agent orchestrator state
    const [isAgentRunning, setIsAgentRunning] = useState(false);
    const [agentStatus, setAgentStatus] = useState('');

    // Voice State
    const [isListening, setIsListening] = useState(false);

    // Search/Browse State
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [browserUrl, setBrowserUrl] = useState<string | null>(null);

    // Serendipity
    const [spark, setSpark] = useState<MemorySpark | null>(null);

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
        HapticSymphony.tap();
        setInput('');
        setIsListening(true);

        const started = await VoiceService.startListening((text, _isFinal) => {
            setInput(text);
        });

        if (!started) {
            setIsListening(false);
        }
    };

    const handleStopVoice = async () => {
        HapticSymphony.select();
        await VoiceService.stopListening();
        setIsListening(false);
    };

    // Sync network status to orchestrator
    useEffect(() => {
        OrchestratorService.setNetworkStatus(isOnline);
    }, [isOnline]);

    // Check for model on mount only
    useEffect(() => {
        const checkInitialModel = async () => {
            const hasQwen = await checkModelExists('qwen-2.5-1.5b');
            if (hasQwen && !isModelLoaded) {
                await loadModel('qwen-2.5-1.5b');
            } else if (!hasQwen) {
                setShowModelModal(true);
            }
        };
        checkInitialModel();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Load Serendipity Spark
    useEffect(() => {
        const loadSpark = async () => {
            const memory = await VaultService.getRandomMemory();
            if (memory) setSpark(memory);
        };
        loadSpark();
    }, []);

    // Haptic Heartbeat during generation or agent run
    useEffect(() => {
        let heartbeatInterval: ReturnType<typeof setTimeout> | null = null;
        if (isGenerating || isAgentRunning) {
            HapticSymphony.heartbeat();
            heartbeatInterval = setInterval(() => {
                HapticSymphony.heartbeat();
            }, 2000);
        }
        return () => {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
        };
    }, [isGenerating, isAgentRunning]);

    const handleModeChange = (newMode: AskMode) => {
        setMode(newMode);
        if (newMode === 'Online' && mode === 'Online') {
            onToggleOnline();
        } else if (newMode === 'Online' && !isOnline) {
            onToggleOnline();
        }
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        Keyboard.dismiss();

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
                const fallbackMessage: ChatMessage = {
                    role: 'assistant',
                    content: 'Model not loaded. Tap the settings button to download a model.',
                    timestamp: new Date(),
                };
                setMessages([...newMessages, fallbackMessage]);
                return;
            }

            // Build system prompt prefix with identity + RAG context
            let systemPromptPrefix = MIRRORMESH_SYSTEM_PROMPT;

            // 1. Identity Context
            if (identityLoaded) {
                const identityContext = IdentityService.getContext();
                if (identityContext) {
                    systemPromptPrefix += `\n\nUser Identity:\n${identityContext}`;
                }
            }

            // 2. RAG Context (The "Mind" Integration)
            try {
                const relevantNotes = await VaultService.search(userMessage.content);
                if (relevantNotes.length > 0) {
                    const topContext = relevantNotes.slice(0, 3).map(n =>
                        `[Note: ${n.title}]\n${n.content.slice(0, 300)}...`
                    ).join('\n\n');

                    systemPromptPrefix += `\n\nRELEVANT MEMORIES FROM VAULT:\n${topContext}\n\n(Use these memories to ground your answer in the user's reality. If they contradict general knowledge, prefer the memories.)`;
                    console.log('[RAG] Injected context tokens');
                }
            } catch {
                // No action needed if RAG fails, just proceed without context
            }

            // Run via OrchestratorService (ReAct agent loop with tools)
            setIsAgentRunning(true);
            setAgentStatus('Thinking...');

            // Friendly tool name mapping for UI
            const toolDisplayNames: Record<string, string> = {
                get_battery: 'Checking battery...',
                vibrate: 'Sending haptic...',
                open_app: 'Opening app...',
                list_apps: 'Listing apps...',
                save_note: 'Saving note...',
                get_events: 'Checking calendar...',
                get_weather: 'Checking weather...',
                get_contacts: 'Looking up contacts...',
            };

            try {
                const result = await OrchestratorService.run(
                    userMessage.content,
                    systemPromptPrefix,
                    (thought) => {
                        // Show abbreviated thought as status
                        const summary = thought.length > 60 ? thought.slice(0, 57) + '...' : thought;
                        setAgentStatus(summary);
                    },
                    (action) => {
                        // Show friendly tool name
                        setAgentStatus(toolDisplayNames[action] || `Using ${action}...`);
                    },
                    // No onToken — raw ReAct text is not user-friendly
                );

                const assistantMessage: ChatMessage = {
                    role: 'assistant',
                    content: result.finalAnswer || 'I wasn\'t able to come up with an answer.',
                    timestamp: new Date(),
                };
                setMessages([...newMessages, assistantMessage]);
            } catch (error) {
                const errorMessage: ChatMessage = {
                    role: 'assistant',
                    content: 'Something went wrong. Please try again.',
                    timestamp: new Date(),
                };
                setMessages([...newMessages, errorMessage]);
                console.error('[AskScreen] Orchestrator error:', error);
            } finally {
                setIsAgentRunning(false);
                setAgentStatus('');
                setStreamingText('');
            }
        } else if (mode === 'Vault') {
            const results = await VaultService.search(input.trim());
            const responseMessage: ChatMessage = {
                role: 'assistant',
                content: results.length > 0
                    ? `Found ${results.length} items:\n${results.slice(0, 5).map(r => `• ${r.title}`).join('\n')}`
                    : 'No items found in vault.',
                timestamp: new Date(),
            };
            setMessages([...newMessages, responseMessage]);
        } else if (mode === 'Online') {
            // Web Search Mode
            setIsSearching(true);
            try {
                const searchResponse = await SearchService.search(input.trim(), 5);
                setSearchResults(searchResponse.results);

                // Create summary message
                const summary = searchResponse.results.length > 0
                    ? `Found ${searchResponse.results.length} results for "${input.trim()}":`
                    : 'No results found.';

                const responseMessage: ChatMessage = {
                    role: 'assistant',
                    content: summary,
                    timestamp: new Date(),
                };
                setMessages([...newMessages, responseMessage]);
            } catch {
                const errorMessage: ChatMessage = {
                    role: 'assistant',
                    content: 'Search failed. Please try again.',
                    timestamp: new Date(),
                };
                setMessages([...newMessages, errorMessage]);
            } finally {
                setIsSearching(false);
            }
        }
    };

    // Open closure modal with type
    const openClosureModal = (type: SessionClosure['type']) => {
        setClosureType(type);
        setClosureInput('');
        setShowClosureModal(true);
    };

    // Execute closure and save session
    const executeClosure = async () => {
        if (!closureType) return;

        let closure: SessionClosure;
        const inputText = closureInput.trim();

        switch (closureType) {
            case 'decide':
                closure = {
                    type: 'decide',
                    decision: inputText || 'Decision made',
                    rationale: messages.length > 0
                        ? messages[messages.length - 1].content.slice(0, 200)
                        : 'Based on conversation',
                };
                break;
            case 'defer':
                closure = {
                    type: 'defer',
                    reason: inputText || 'Need more information',
                };
                break;
            case 'next':
                closure = {
                    type: 'next',
                    action: inputText || 'Follow up required',
                };
                break;
            case 'pause':
            default:
                closure = {
                    type: 'pause',
                    note: inputText || undefined,
                };
                break;
        }

        // Haptic confirmation
        await HapticSymphony.shatter();
        await new Promise<void>(r => setTimeout(r, 300));

        // Save session to vault
        await VaultService.saveSession(messages, closure);

        // Close modal and clear session
        setShowClosureModal(false);
        setClosureType(null);
        setClosureInput('');
        setMessages([]);
        setStreamingText('');
        OrchestratorService.clearHistory();
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

    const getClosurePrompt = (): string => {
        switch (closureType) {
            case 'decide': return 'What did you decide?';
            case 'defer': return 'Why are you deferring?';
            case 'next': return 'What\'s the next action?';
            case 'pause': return 'Any notes? (optional)';
            default: return '';
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
                <TouchableOpacity style={styles.onlineBanner} onPress={onToggleOnline}>
                    <Text style={styles.onlineBannerText}>🌐 Online — tap to disconnect</Text>
                </TouchableOpacity>
            )}

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={styles.glyph}>{glyphs.synthesis}</Text>
                    <Text style={styles.title}>ASK</Text>
                </View>
                <TouchableOpacity style={styles.modelButton} onPress={() => setShowModelModal(true)}>
                    <Text style={styles.modelButtonText}>{isModelLoaded ? '⚙️' : '⚠️'}</Text>
                </TouchableOpacity>
            </View>

            {/* Mode chips */}
            <View style={styles.modeChips}>
                <ModeChip label="MirrorMesh" active={mode === 'MirrorMesh'} onPress={() => handleModeChange('MirrorMesh')} />
                <ModeChip label="Vault" active={mode === 'Vault'} onPress={() => handleModeChange('Vault')} />
                <ModeChip label="Search" active={mode === 'Online'} onPress={() => handleModeChange('Online')} indicator={mode === 'Online'} />
            </View>

            {/* Model warning */}
            {!isModelLoaded && mode === 'MirrorMesh' && (
                <TouchableOpacity style={styles.modelWarning} onPress={() => setShowModelModal(true)}>
                    <Text style={styles.modelWarningText}>⚠️ No model loaded — tap to download</Text>
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
                            {mode === 'MirrorMesh' ? "What are you trying to decide, build, or understand?"
                                : mode === 'Vault' ? "Search your vault..."
                                    : "Search the web..."}
                        </Text>
                        {identityLoaded && (
                            <Text style={styles.identityIndicator}>{glyphs.truth} Identity loaded</Text>
                        )}

                        {/* Serendipity Spark */}
                        {spark && mode === 'MirrorMesh' && (
                            <TouchableOpacity
                                style={styles.sparkCard}
                                onPress={() => setInput(`Let's talk about this memory: "${spark.title}"`)}
                            >
                                <View style={styles.sparkHeader}>
                                    <Text style={styles.sparkIcon}>⚡</Text>
                                    <Text style={styles.sparkLabel}>MEMORY SPARK</Text>
                                    <Text style={styles.sparkDate}>{spark.date.toLocaleDateString()}</Text>
                                </View>
                                <Text style={styles.sparkTitle}>{spark.title}</Text>
                                <Text style={styles.sparkPreview} numberOfLines={3}>{spark.content}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    messages.map((msg, index) => <MessageBubble key={index} message={msg} />)
                )}

                {streamingText && (
                    <View style={styles.messageBubble}>
                        <Text style={styles.messageText}>{streamingText}</Text>
                        <Text style={styles.streamingCursor}>▊</Text>
                    </View>
                )}

                {isGenerating && !streamingText && !isAgentRunning && (
                    <View style={styles.streamingIndicator}>
                        <ActivityIndicator size="small" color={colors.accentPrimary} />
                        <Text style={styles.streamingText}>Thinking...</Text>
                    </View>
                )}

                {isAgentRunning && (
                    <View style={styles.streamingIndicator}>
                        <ActivityIndicator size="small" color={colors.accentPrimary} />
                        <Text style={styles.streamingText}>{agentStatus || 'Thinking...'}</Text>
                    </View>
                )}

                {/* Search Results with Citations */}
                {mode === 'Online' && searchResults.length > 0 && (
                    <View style={styles.searchResults}>
                        {searchResults.map((result, index) => (
                            <SearchResultCard
                                key={result.url}
                                result={result}
                                index={index}
                                onPress={(url) => setBrowserUrl(url)}
                            />
                        ))}
                    </View>
                )}

                {isSearching && (
                    <View style={styles.streamingIndicator}>
                        <ActivityIndicator size="small" color={colors.accentPrimary} />
                        <Text style={styles.streamingText}>Searching the web...</Text>
                    </View>
                )}
            </ScrollView>

            {/* Session closure buttons */}
            {hasActiveSession && mode === 'MirrorMesh' && !isGenerating && !isAgentRunning && (
                <View style={styles.closureButtons}>
                    <ClosureButton label="Decide" glyph={glyphs.decision} onPress={() => openClosureModal('decide')} />
                    <ClosureButton label="Defer" onPress={() => openClosureModal('defer')} />
                    <ClosureButton label="Next" onPress={() => openClosureModal('next')} />
                    <ClosureButton label="Pause" onPress={() => openClosureModal('pause')} />
                </View>
            )}

            {/* Input area */}
            <View style={styles.inputContainer}>
                <TouchableOpacity style={styles.micButton} onPress={isListening ? handleStopVoice : handleStartVoice}>
                    <Text style={styles.micButtonText}>{isListening ? '🛑' : '🎤'}</Text>
                </TouchableOpacity>
                <RefineButton
                    text={input}
                    onRefine={(polished) => setInput(polished)}
                    style={{ marginRight: spacing.sm }}
                />
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
                    style={[styles.sendButton, (!input.trim() || isGenerating || isAgentRunning) && styles.sendButtonDisabled]}
                    onPress={handleSend}
                    disabled={!input.trim() || isGenerating || isAgentRunning}
                >
                    {(isGenerating || isAgentRunning) ? (
                        <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                        <Text style={styles.sendButtonText}>→</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Voice Overlay */}
            {isListening && (
                <TouchableOpacity style={styles.voiceOverlay} activeOpacity={1} onPress={handleStopVoice}>
                    <View style={styles.voiceIndicator}>
                        <Text style={styles.voiceGlyph}>🎤</Text>
                        <Text style={styles.voiceText}>Listening...</Text>
                    </View>
                </TouchableOpacity>
            )}

            {/* Closure Modal */}
            <Modal visible={showClosureModal} transparent animationType="fade" onRequestClose={() => setShowClosureModal(false)}>
                <View style={styles.closureModalOverlay}>
                    <View style={styles.closureModalContent}>
                        <Text style={styles.closureModalTitle}>
                            {closureType === 'decide' ? '△ Decide'
                                : closureType === 'defer' ? '⏸ Defer'
                                    : closureType === 'next' ? '→ Next Action'
                                        : '◯ Pause'}
                        </Text>
                        <Text style={styles.closureModalPrompt}>{getClosurePrompt()}</Text>
                        <TextInput
                            style={styles.closureModalInput}
                            placeholder={closureType === 'pause' ? 'Optional note...' : 'Enter details...'}
                            placeholderTextColor={colors.textMuted}
                            value={closureInput}
                            onChangeText={setClosureInput}
                            multiline
                            autoFocus
                        />
                        <View style={styles.closureModalButtons}>
                            <TouchableOpacity style={styles.closureModalCancel} onPress={() => setShowClosureModal(false)}>
                                <Text style={styles.closureModalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.closureModalConfirm} onPress={executeClosure}>
                                <Text style={styles.closureModalConfirmText}>Save & Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Model download modal */}
            <Modal visible={showModelModal} transparent animationType="slide" onRequestClose={() => setShowModelModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Models</Text>
                            <TouchableOpacity onPress={() => setShowModelModal(false)} style={styles.closeButton}>
                                <Text style={styles.closeButtonText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalSubtitle}>{loadedModel ? `Loaded: ${loadedModel}` : 'No model loaded'}</Text>

                        {availableModels.map(model => (
                            <View key={model.id} style={styles.modelCard}>
                                <View style={styles.modelInfo}>
                                    <Text style={styles.modelName}>{model.name}</Text>
                                    <Text style={styles.modelSize}>{model.size}</Text>
                                    <Text style={styles.modelDesc}>{model.description}</Text>
                                </View>
                                <TouchableOpacity
                                    style={[styles.downloadButton, loadedModel === model.id && styles.downloadButtonLoaded]}
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
                                <View style={[styles.progressBar, { width: `${downloadProgress * 100}%` }]} />
                                <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}%</Text>
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

            {/* Browser Pane Modal */}
            {browserUrl && (
                <Modal visible={true} animationType="slide" onRequestClose={() => setBrowserUrl(null)}>
                    <BrowserPane
                        url={browserUrl}
                        onClose={() => setBrowserUrl(null)}
                    />
                </Modal>
            )}
        </KeyboardAvoidingView>
    );
};

// Helper components
const ModeChip: React.FC<{
    label: string;
    active: boolean;
    onPress: () => void;
    indicator?: boolean;
}> = ({ label, active, onPress, indicator }) => (
    <TouchableOpacity style={[styles.modeChip, active && styles.modeChipActive]} onPress={onPress}>
        {indicator && <View style={styles.onlineDot} />}
        <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{label}</Text>
    </TouchableOpacity>
);

const MessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isUser = message.role === 'user';
    return (
        <View style={[styles.messageBubble, isUser && styles.userBubble]}>
            <Text style={[styles.messageText, isUser && styles.userMessageText]}>{message.content}</Text>
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
    container: { flex: 1, backgroundColor: colors.background },

    // Online banner
    onlineBanner: { backgroundColor: colors.online, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
    onlineBannerText: { ...typography.labelMedium, color: colors.background },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, paddingBottom: spacing.md },
    headerLeft: { flexDirection: 'row', alignItems: 'center' },
    glyph: { fontSize: 24, color: colors.glyphSynthesis, marginRight: spacing.sm },
    title: { ...typography.displayLarge, color: colors.textPrimary },
    modelButton: { padding: spacing.sm },
    modelButtonText: { fontSize: 20 },

    // Mode chips
    modeChips: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
    modeChip: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'transparent' },
    modeChipActive: { borderColor: colors.accentPrimary, backgroundColor: colors.surfaceElevated },
    modeChipText: { ...typography.labelMedium, color: colors.textSecondary },
    modeChipTextActive: { color: colors.accentLight },
    onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.online, marginRight: spacing.xs },

    // Model warning
    modelWarning: { marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.warning },
    modelWarningText: { ...typography.labelSmall, color: colors.warning, textAlign: 'center' },

    // Chat area
    chatArea: { flex: 1 },
    chatContent: { padding: spacing.lg, paddingBottom: spacing.xl },
    emptyState: { alignItems: 'center', paddingTop: spacing.xxl },
    emptyPrompt: { ...typography.headlineSmall, color: colors.textSecondary, textAlign: 'center' },
    identityIndicator: { ...typography.labelSmall, color: colors.glyphTruth, marginTop: spacing.lg },

    // Messages
    messageBubble: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 12, marginBottom: spacing.sm, maxWidth: '85%', alignSelf: 'flex-start' },
    userBubble: { backgroundColor: colors.accentDark, alignSelf: 'flex-end' },
    messageText: { ...typography.bodyMedium, color: colors.textPrimary },
    userMessageText: { color: colors.textPrimary },
    streamingCursor: { color: colors.accentPrimary },
    streamingIndicator: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, gap: spacing.sm },
    streamingText: { ...typography.labelSmall, color: colors.textMuted, fontStyle: 'italic' },

    // Closure buttons
    closureButtons: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.surface },
    closureButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, borderRadius: 8, backgroundColor: colors.surface },
    closureGlyph: { color: colors.glyphDecision, marginRight: spacing.xs },
    closureButtonText: { ...typography.labelMedium, color: colors.textSecondary },

    // Input
    inputContainer: { flexDirection: 'row', padding: spacing.md, paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.xl, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: colors.surface, backgroundColor: colors.background },
    input: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...typography.bodyMedium, color: colors.textPrimary, maxHeight: 100 },
    sendButton: { marginLeft: spacing.sm, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center' },
    sendButtonDisabled: { backgroundColor: colors.surface },
    sendButtonText: { fontSize: 24, color: colors.textPrimary, fontWeight: 'bold' },
    micButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
    micButtonText: { fontSize: 20 },

    // Closure Modal
    closureModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
    closureModalContent: { backgroundColor: colors.surface, borderRadius: 16, padding: spacing.lg, width: '100%', maxWidth: 400 },
    closureModalTitle: { ...typography.headlineMedium, color: colors.textPrimary, marginBottom: spacing.sm },
    closureModalPrompt: { ...typography.bodyMedium, color: colors.textSecondary, marginBottom: spacing.md },
    closureModalInput: { backgroundColor: colors.background, borderRadius: 8, padding: spacing.md, ...typography.bodyMedium, color: colors.textPrimary, minHeight: 80, textAlignVertical: 'top' },
    closureModalButtons: { flexDirection: 'row', marginTop: spacing.lg, gap: spacing.sm },
    closureModalCancel: { flex: 1, paddingVertical: spacing.md, borderRadius: 8, backgroundColor: colors.background, alignItems: 'center' },
    closureModalCancelText: { ...typography.labelMedium, color: colors.textSecondary },
    closureModalConfirm: { flex: 1, paddingVertical: spacing.md, borderRadius: 8, backgroundColor: colors.accentPrimary, alignItems: 'center' },
    closureModalConfirmText: { ...typography.labelMedium, color: colors.textPrimary },

    // Voice Overlay
    voiceOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    voiceIndicator: { backgroundColor: colors.surfaceElevated, padding: spacing.xl, borderRadius: 24, alignItems: 'center' },
    voiceGlyph: { fontSize: 48, marginBottom: spacing.md, color: colors.accentPrimary },
    voiceText: { ...typography.headlineMedium, color: colors.textPrimary },

    // Model Modal
    modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: spacing.xxl },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    modalTitle: { ...typography.headlineMedium, color: colors.textPrimary },
    modalSubtitle: { ...typography.labelSmall, color: colors.textMuted, marginBottom: spacing.lg },
    closeButton: { padding: spacing.sm },
    closeButtonText: { ...typography.headlineMedium, color: colors.textMuted },
    modelCard: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, alignItems: 'center' },
    modelInfo: { flex: 1 },
    modelName: { ...typography.headlineSmall, color: colors.textPrimary },
    modelSize: { ...typography.labelSmall, color: colors.textMuted },
    modelDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
    downloadButton: { backgroundColor: colors.accentPrimary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: 8 },
    downloadButtonLoaded: { backgroundColor: colors.success },
    downloadButtonText: { ...typography.labelMedium, color: colors.textPrimary },
    progressContainer: { height: 24, backgroundColor: colors.background, borderRadius: 12, marginTop: spacing.md, overflow: 'hidden', position: 'relative' },
    progressBar: { height: '100%', backgroundColor: colors.accentPrimary },
    progressText: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, textAlign: 'center', lineHeight: 24, ...typography.labelSmall, color: colors.textPrimary },
    loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, gap: spacing.sm },
    loadingText: { ...typography.labelSmall, color: colors.textMuted },

    // Search Results
    searchResults: { marginTop: spacing.md },

    // Serendipity Spark
    sparkCard: { marginTop: spacing.xl, padding: spacing.md, backgroundColor: '#1A1A1A', borderRadius: 12, borderWidth: 1, borderColor: colors.accentSecondary, maxWidth: '90%' },
    sparkHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
    sparkIcon: { fontSize: 16, marginRight: spacing.xs },
    sparkLabel: { ...typography.labelSmall, color: colors.accentSecondary, fontWeight: 'bold', flex: 1 },
    sparkDate: { ...typography.labelSmall, color: colors.textMuted },
    sparkTitle: { ...typography.headlineSmall, color: colors.textPrimary, marginBottom: 4 },
    sparkPreview: { ...typography.bodySmall, color: colors.textSecondary },
});

export default AskScreen;
