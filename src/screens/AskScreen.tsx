/**
 * ASK Panel — Front Door
 * From Spec Part IV
 *
 * Purpose: Single entry point for all cognitive assistance.
 * Sessions continue naturally without forced closure.
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
    Alert,
} from 'react-native';
import { colors, typography, spacing, glyphs } from '../theme';
import { useLLM, useSessionRestore } from '../hooks';
import { VaultService, IdentityService, HapticSymphony, VoiceService, SearchService, OrchestratorService, TTSService, IntentParser, ActionExecutor, MeshService } from '../services';
import type { SearchResult, MemorySpark } from '../services';
import { BrowserPane, SearchResultCard, Logo } from '../components';
import { RefineButton } from '../components/RefineButton';
import type { AskMode, ChatMessage } from '../types';

// System prompt for MirrorMesh
const MIRRORMESH_SYSTEM_PROMPT = `You are MirrorMesh, a calm and thoughtful assistant integrated into MirrorBrain Mobile.
Your role is to help the user think through decisions, understand concepts, or build solutions.
Be concise but thorough. Never create urgency or anxiety.
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
    const [mode, setMode] = useState<AskMode>('Claude');
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [streamingText, setStreamingText] = useState('');
    const [showModelModal, setShowModelModal] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const scrollViewRef = useRef<ScrollView>(null);

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

    // Session Restore
    const [sessionState, sessionActions] = useSessionRestore();

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

        try {
            const isAvailable = VoiceService.isVoiceAvailable();
            if (!isAvailable) {
                Alert.alert('Voice Not Available', 'Speech recognition is not available on this device.');
                setIsListening(false);
                return;
            }

            const started = await VoiceService.startListening((text, _isFinal) => {
                setInput(text);
            });

            if (!started) {
                const error = VoiceService.getLastError();
                Alert.alert(
                    'Voice Failed',
                    `Could not start voice recognition.\n\nError: ${error || 'Unknown'}\n\nMake sure:\n• Microphone permission is granted\n• Google app is installed\n• Speech recognition is enabled`
                );
                setIsListening(false);
            }
        } catch (error) {
            Alert.alert('Voice Error', String(error));
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

    // Save session on message changes
    useEffect(() => {
        if (messages.length > 0) {
            sessionActions.saveSession(messages, mode);
        }
    }, [messages, mode, sessionActions]);

    // Handle session restore
    const handleRestoreSession = async () => {
        const restored = await sessionActions.restoreSession();
        if (restored) {
            setMessages(restored.messages);
            setMode(restored.mode);
            HapticSymphony.tap();
        }
    };

    const handleStartFresh = async () => {
        await sessionActions.dismissRestore();
        HapticSymphony.tap();
    };

    const handleModeChange = (newMode: AskMode) => {
        setMode(newMode);
        if (newMode === 'Online' && mode === 'Online') {
            onToggleOnline();
        } else if (newMode === 'Online' && !isOnline) {
            onToggleOnline();
        }
    };

    const handleSend = async () => {
        console.log('[AskScreen] handleSend called, input:', input);
        if (!input.trim()) return;

        // Capture and clear input immediately for responsive UX
        const messageText = input.trim();
        console.log('[AskScreen] Sending message:', messageText);
        setInput('');
        setStreamingText('');

        // Don't dismiss keyboard - let user keep typing or dismiss manually
        // This prevents the double-tap issue on Android

        const userMessage: ChatMessage = {
            role: 'user',
            content: messageText,
            timestamp: new Date(),
        };

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);

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

            // ─── SMART ROUTING: Fast intent path before LLM ───
            const parsed = IntentParser.parse(messageText);
            console.log('[AskScreen] Intent:', parsed.type, 'confidence:', parsed.confidence);

            if (parsed.type !== 'unknown' && parsed.confidence > 0.6) {
                // Fast path: direct action execution (no LLM needed)
                setIsAgentRunning(true);
                setAgentStatus(IntentParser.getActionDescription(parsed));

                try {
                    const actionResult = await ActionExecutor.execute(parsed);

                    // If handler says passToAI, fall through to LLM path
                    if (actionResult.data?.passToAI) {
                        console.log('[AskScreen] Action deferred to AI');
                        // Fall through below
                    } else {
                        const assistantMessage: ChatMessage = {
                            role: 'assistant',
                            content: actionResult.message,
                            timestamp: new Date(),
                        };
                        setMessages([...newMessages, assistantMessage]);

                        if (actionResult.message) {
                            TTSService.speak(actionResult.message);
                        }

                        setIsAgentRunning(false);
                        setAgentStatus('');
                        return; // Done — no LLM needed
                    }
                } catch (error) {
                    console.error('[AskScreen] Action error, falling through to LLM:', error);
                } finally {
                    if (!isAgentRunning) {
                        // Already returned above on success
                    }
                }
            }

            // ─── SLOW PATH: LLM ReAct agent loop ───
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
                // Speak the response
                if (result.finalAnswer) {
                    TTSService.speak(result.finalAnswer);
                }
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
        } else if (mode === 'Claude') {
            // Claude mode — route through mesh relay to Mac voice orchestrator
            if (!MeshService.isConnected()) {
                // Try to connect
                setAgentStatus('Connecting to Mac...');
                setIsAgentRunning(true);
                const connected = await MeshService.connect();
                if (!connected) {
                    const errorMessage: ChatMessage = {
                        role: 'assistant',
                        content: 'Cannot reach Claude on Mac. Check Tailscale/mesh relay.',
                        timestamp: new Date(),
                    };
                    setMessages([...newMessages, errorMessage]);
                    setIsAgentRunning(false);
                    setAgentStatus('');
                    return;
                }
            }

            setIsAgentRunning(true);
            setAgentStatus('Sending to Claude...');

            // Send via mesh relay to claude-mac
            const sent = MeshService.sendChat('claude-mac', messageText);
            if (!sent) {
                const errorMessage: ChatMessage = {
                    role: 'assistant',
                    content: 'Failed to send message. Mesh not connected.',
                    timestamp: new Date(),
                };
                setMessages([...newMessages, errorMessage]);
                setIsAgentRunning(false);
                setAgentStatus('');
                return;
            }

            // Listen for response from mesh relay
            const responsePromise = new Promise<string>((resolve) => {
                const timeout = setTimeout(() => {
                    cleanup();
                    resolve('Claude is processing. Response will arrive via voice.');
                }, 15000);

                const cleanup = MeshService.onMessage((msg) => {
                    if (msg.type === 'chat' && 'from' in msg && msg.from === 'claude-mac') {
                        clearTimeout(timeout);
                        cleanup();
                        resolve((msg as { content: string }).content);
                    }
                });
            });

            const response = await responsePromise;
            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: response,
                timestamp: new Date(),
            };
            setMessages([...newMessages, assistantMessage]);
            setIsAgentRunning(false);
            setAgentStatus('');
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

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 60}
        >
            {/* Outer ScrollView prevents keyboard dismissal on button taps (Android fix) */}
            <ScrollView
                style={styles.outerWrapper}
                contentContainerStyle={styles.outerWrapperContent}
                scrollEnabled={false}
                keyboardShouldPersistTaps="always"
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
                    <Logo size={32} showGlow={isGenerating || isAgentRunning} animated={isGenerating || isAgentRunning} />
                    <Text style={styles.title}>ASK</Text>
                </View>
                <TouchableOpacity style={styles.modelButton} onPress={() => setShowModelModal(true)}>
                    <Text style={styles.modelButtonText}>{isModelLoaded ? '⚙️' : '⚠️'}</Text>
                </TouchableOpacity>
            </View>

            {/* Mode chips */}
            <View style={styles.modeChips}>
                <ModeChip label="Claude" active={mode === 'Claude'} onPress={() => handleModeChange('Claude')} indicator={mode === 'Claude' && MeshService.isConnected()} />
                <ModeChip label="MirrorMesh" active={mode === 'MirrorMesh'} onPress={() => handleModeChange('MirrorMesh')} />
                <ModeChip label="Vault" active={mode === 'Vault'} onPress={() => handleModeChange('Vault')} />
                <ModeChip label="Search" active={mode === 'Online'} onPress={() => handleModeChange('Online')} indicator={mode === 'Online'} />
            </View>

            {/* Model warning */}
            {!isModelLoaded && mode === 'MirrorMesh' && mode !== 'Claude' && (
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
                keyboardShouldPersistTaps="handled"
            >
                {messages.length === 0 ? (
                    <View style={styles.emptyState}>
                        {/* Session Restore Prompt */}
                        {sessionState.showRestorePrompt && sessionState.metadata && (
                            <View style={styles.restoreCard}>
                                <Text style={styles.restoreTitle}>Continue where you left off?</Text>
                                <Text style={styles.restoreSubtitle}>
                                    {sessionState.metadata.topic || 'Previous session'} ({sessionState.metadata.messageCount} messages)
                                </Text>
                                <Text style={styles.restoreTime}>{sessionState.timeSince}</Text>
                                <View style={styles.restoreButtons}>
                                    <TouchableOpacity style={styles.restoreButton} onPress={handleRestoreSession}>
                                        <Text style={styles.restoreButtonText}>Continue</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.restoreButtonSecondary} onPress={handleStartFresh}>
                                        <Text style={styles.restoreButtonSecondaryText}>Start Fresh</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {!sessionState.showRestorePrompt && (
                            <>
                                <Text style={styles.emptyPrompt}>
                                    {mode === 'Claude' ? "Talk to Claude on your Mac..."
                                        : mode === 'MirrorMesh' ? "What are you trying to decide, build, or understand?"
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
                            </>
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
                    maxLength={500}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                />
                <TouchableOpacity
                    style={[
                        styles.sendButton,
                        (!input.trim() || isGenerating || isAgentRunning) && styles.sendButtonDisabled,
                    ]}
                    onPress={() => {
                        console.log('[AskScreen] Send button pressed');
                        handleSend();
                    }}
                    disabled={!input.trim() || isGenerating || isAgentRunning}
                    activeOpacity={0.7}
                >
                    {(isGenerating || isAgentRunning) ? (
                        <ActivityIndicator size="small" color={colors.textPrimary} />
                    ) : (
                        <Text style={styles.sendButtonText}>→</Text>
                    )}
                </TouchableOpacity>
            </View>
            </ScrollView>

            {/* Voice Overlay */}
            {isListening && (
                <TouchableOpacity style={styles.voiceOverlay} activeOpacity={1} onPress={handleStopVoice}>
                    <View style={styles.voiceIndicator}>
                        <Text style={styles.voiceGlyph}>🎤</Text>
                        <Text style={styles.voiceText}>Listening...</Text>
                    </View>
                </TouchableOpacity>
            )}

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

const getPlaceholder = (mode: AskMode): string => {
    switch (mode) {
        case 'Claude': return 'Ask Claude...';
        case 'MirrorMesh': return 'Ask MirrorMesh...';
        case 'Vault': return 'Search vault...';
        case 'Online': return 'Search the web...';
    }
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    outerWrapper: { flex: 1 },
    outerWrapperContent: { flex: 1 },

    // Online banner
    onlineBanner: { backgroundColor: colors.online, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center' },
    onlineBannerText: { ...typography.labelMedium, color: colors.background },

    // Header - extra top padding for various notch sizes
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md },
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

    // Input
    inputContainer: { flexDirection: 'row', padding: spacing.md, paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.xl, alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: colors.surface, backgroundColor: colors.background },
    input: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, ...typography.bodyMedium, color: colors.textPrimary, maxHeight: 100 },
    sendButton: { marginLeft: spacing.sm, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center' },
    sendButtonDisabled: { backgroundColor: colors.surface },
    sendButtonText: { fontSize: 24, color: colors.textPrimary, fontWeight: 'bold' },
    micButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
    micButtonText: { fontSize: 20 },

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

    // Session Restore
    restoreCard: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.accentPrimary, maxWidth: '90%', alignItems: 'center' },
    restoreTitle: { ...typography.headlineSmall, color: colors.textPrimary, marginBottom: spacing.xs },
    restoreSubtitle: { ...typography.bodyMedium, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xs },
    restoreTime: { ...typography.labelSmall, color: colors.textMuted, marginBottom: spacing.md },
    restoreButtons: { flexDirection: 'row', gap: spacing.sm },
    restoreButton: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, backgroundColor: colors.accentPrimary, borderRadius: 8 },
    restoreButtonText: { ...typography.labelMedium, color: colors.textPrimary },
    restoreButtonSecondary: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.textMuted },
    restoreButtonSecondaryText: { ...typography.labelMedium, color: colors.textSecondary },
});

export default AskScreen;
