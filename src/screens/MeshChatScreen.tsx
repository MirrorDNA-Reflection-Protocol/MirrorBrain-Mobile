/**
 * Mesh Chat Screen — Agent Communication
 *
 * Chat interface for communicating with other agents in the mesh.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Animated,
} from 'react-native';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';

import { colors, typography, spacing, borderRadius } from '../theme';
import { GlassView } from '../components';
import {
    MeshService,
    HapticService,
    type MeshAgent,
    type ChatMessage,
    type MeshMessage,
} from '../services';

interface Message {
    id: string;
    from: string;
    fromName: string;
    content: string;
    timestamp: Date;
    type: 'chat' | 'task' | 'task_result' | 'system';
    isOwn: boolean;
}

export const MeshChatScreen: React.FC = () => {
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [agents, setAgents] = useState<MeshAgent[]>([]);
    const [inputText, setInputText] = useState('');
    const [selectedAgent, setSelectedAgent] = useState<string>('*'); // '*' for broadcast
    const [isRecording, setIsRecording] = useState(false);
    const [voiceSupported, setVoiceSupported] = useState(false);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const flatListRef = useRef<FlatList>(null);
    const myAgentId = MeshService.getAgentId();

    useEffect(() => {
        // Initialize and connect
        const init = async () => {
            setConnecting(true);
            try {
                await MeshService.initialize();
                await MeshService.connect();
            } catch (error) {
                console.error('[MeshChatScreen] Init error:', error);
            } finally {
                setConnecting(false);
            }
        };

        init();

        // Subscribe to connection changes
        const unsubConnection = MeshService.onConnectionChange((isConnected) => {
            setConnected(isConnected);
            if (isConnected) {
                addSystemMessage('Connected to mesh relay');
                setAgents(MeshService.getAgents());
            } else {
                addSystemMessage('Disconnected from mesh relay');
            }
        });

        // Subscribe to messages
        const unsubMessages = MeshService.onMessage((msg) => {
            handleIncomingMessage(msg);
        });

        // Initialize voice
        Voice.isAvailable().then(available => {
            setVoiceSupported(!!available);
        });

        Voice.onSpeechResults = (e: SpeechResultsEvent) => {
            if (e.value && e.value[0]) {
                setInputText(prev => prev + (prev ? ' ' : '') + e.value![0]);
            }
            setIsRecording(false);
            stopPulseAnimation();
        };

        Voice.onSpeechError = (e: SpeechErrorEvent) => {
            console.error('[Voice] Error:', e.error);
            setIsRecording(false);
            stopPulseAnimation();
        };

        Voice.onSpeechEnd = () => {
            setIsRecording(false);
            stopPulseAnimation();
        };

        return () => {
            unsubConnection();
            unsubMessages();
            Voice.destroy().then(Voice.removeAllListeners);
        };
    }, []);

    const addSystemMessage = (content: string) => {
        const message: Message = {
            id: `sys-${Date.now()}`,
            from: 'system',
            fromName: 'System',
            content,
            timestamp: new Date(),
            type: 'system',
            isOwn: false,
        };
        setMessages(prev => [...prev, message]);
    };

    const handleIncomingMessage = useCallback((msg: MeshMessage) => {
        if (msg.type === 'chat') {
            const chatMsg = msg as ChatMessage;
            const agent = MeshService.getAgents().find(a => a.id === chatMsg.from);

            const message: Message = {
                id: chatMsg.id,
                from: chatMsg.from,
                fromName: agent?.name || chatMsg.from,
                content: chatMsg.content,
                timestamp: new Date(chatMsg.timestamp),
                type: 'chat',
                isOwn: chatMsg.from === myAgentId,
            };

            setMessages(prev => [...prev, message]);
            scrollToBottom();

        } else if (msg.type === 'agents') {
            setAgents((msg as unknown as { agents: MeshAgent[] }).agents);

        } else if (msg.type === 'presence') {
            setAgents(MeshService.getAgents());

        } else if (msg.type === 'task_result') {
            const result = msg as any;
            addSystemMessage(`Task result from ${result.from}: ${result.success ? 'Success' : 'Failed'}`);
        }
    }, [myAgentId]);

    const scrollToBottom = () => {
        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
    };

    const handleSend = () => {
        if (!inputText.trim() || !connected) return;

        HapticService.tap();

        // Check for task syntax: @agent:action params
        const taskMatch = inputText.match(/^@(\S+):(\S+)\s*(.*)?$/);

        if (taskMatch) {
            const [, target, action, paramsStr] = taskMatch;
            let params = {};
            try {
                params = paramsStr ? JSON.parse(paramsStr) : {};
            } catch {
                params = { text: paramsStr };
            }

            MeshService.sendTask(target, action, params);
            addSystemMessage(`Sent task '${action}' to ${target}`);

        } else {
            // Regular chat message
            MeshService.sendChat(selectedAgent, inputText);

            // Add to local messages (own message)
            const message: Message = {
                id: `own-${Date.now()}`,
                from: myAgentId,
                fromName: 'You',
                content: inputText,
                timestamp: new Date(),
                type: 'chat',
                isOwn: true,
            };
            setMessages(prev => [...prev, message]);
        }

        setInputText('');
        scrollToBottom();
    };

    const handleReconnect = async () => {
        setConnecting(true);
        await MeshService.connect();
        setConnecting(false);
    };

    const startPulseAnimation = () => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.2,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    };

    const stopPulseAnimation = () => {
        pulseAnim.stopAnimation();
        pulseAnim.setValue(1);
    };

    const handleVoiceRecord = async () => {
        if (!voiceSupported) return;

        HapticService.tap();

        if (isRecording) {
            try {
                await Voice.stop();
                setIsRecording(false);
                stopPulseAnimation();
            } catch (e) {
                console.error('[Voice] Stop error:', e);
            }
        } else {
            try {
                setIsRecording(true);
                startPulseAnimation();
                await Voice.start('en-US');
            } catch (e) {
                console.error('[Voice] Start error:', e);
                setIsRecording(false);
                stopPulseAnimation();
            }
        }
    };

    const renderMessage = ({ item }: { item: Message }) => {
        if (item.type === 'system') {
            return (
                <View style={styles.systemMessage}>
                    <Text style={styles.systemText}>{item.content}</Text>
                </View>
            );
        }

        return (
            <View style={[
                styles.messageContainer,
                item.isOwn ? styles.ownMessage : styles.otherMessage
            ]}>
                {!item.isOwn && (
                    <Text style={styles.senderName}>{item.fromName}</Text>
                )}
                <View style={[
                    styles.messageBubble,
                    item.isOwn ? styles.ownBubble : styles.otherBubble
                ]}>
                    <Text style={styles.messageText}>{item.content}</Text>
                </View>
                <Text style={styles.timestamp}>
                    {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        );
    };

    const renderAgent = (agent: MeshAgent) => {
        const isSelected = selectedAgent === agent.id;
        const statusColor = agent.status === 'online' ? colors.success :
            agent.status === 'busy' ? colors.warning : colors.textMuted;

        return (
            <TouchableOpacity
                key={agent.id}
                style={[styles.agentChip, isSelected && styles.agentChipSelected]}
                onPress={() => {
                    HapticService.tap();
                    setSelectedAgent(agent.id);
                }}
            >
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={styles.agentName} numberOfLines={1}>
                    {agent.name.split(' ')[0]}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={100}
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Mesh Chat</Text>
                <View style={[
                    styles.connectionStatus,
                    { backgroundColor: connected ? colors.success : colors.error }
                ]} />
            </View>

            {/* Agents bar */}
            <View style={styles.agentsBar}>
                <TouchableOpacity
                    style={[styles.agentChip, selectedAgent === '*' && styles.agentChipSelected]}
                    onPress={() => {
                        HapticService.tap();
                        setSelectedAgent('*');
                    }}
                >
                    <Text style={styles.agentName}>All</Text>
                </TouchableOpacity>
                {agents.filter(a => a.id !== myAgentId).map(renderAgent)}
            </View>

            {/* Messages */}
            {connecting ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accentPrimary} />
                    <Text style={styles.loadingText}>Connecting to mesh...</Text>
                </View>
            ) : !connected ? (
                <View style={styles.disconnectedContainer}>
                    <Text style={styles.disconnectedIcon}>📡</Text>
                    <Text style={styles.disconnectedTitle}>Not Connected</Text>
                    <Text style={styles.disconnectedText}>
                        Unable to connect to the mesh relay.
                    </Text>
                    <TouchableOpacity style={styles.reconnectButton} onPress={handleReconnect}>
                        <Text style={styles.reconnectText}>Reconnect</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.messagesList}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>No messages yet</Text>
                            <Text style={styles.emptyHint}>
                                Send a message to other agents in the mesh
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Input */}
            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder={connected ? `Message ${selectedAgent === '*' ? 'everyone' : selectedAgent}...` : 'Not connected'}
                    placeholderTextColor={colors.textMuted}
                    value={inputText}
                    onChangeText={setInputText}
                    editable={connected}
                    multiline
                    maxLength={1000}
                />
                {voiceSupported && (
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <TouchableOpacity
                            style={[styles.micButton, isRecording && styles.micButtonActive]}
                            onPress={handleVoiceRecord}
                            disabled={!connected}
                        >
                            <Text style={styles.micButtonText}>{isRecording ? '...' : 'Mic'}</Text>
                        </TouchableOpacity>
                    </Animated.View>
                )}
                <TouchableOpacity
                    style={[styles.sendButton, (!connected || !inputText.trim()) && styles.sendButtonDisabled]}
                    onPress={handleSend}
                    disabled={!connected || !inputText.trim()}
                >
                    <Text style={styles.sendButtonText}>Send</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
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
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.sm,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    connectionStatus: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },

    // Agents bar
    agentsBar: {
        flexDirection: 'row',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.xs,
    },
    agentChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderRadius: borderRadius.full,
        gap: spacing.xs,
    },
    agentChipSelected: {
        backgroundColor: colors.accentPrimary,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    agentName: {
        ...typography.labelSmall,
        color: colors.textPrimary,
        maxWidth: 80,
    },

    // Messages
    messagesList: {
        padding: spacing.md,
        flexGrow: 1,
    },
    messageContainer: {
        marginBottom: spacing.md,
        maxWidth: '80%',
    },
    ownMessage: {
        alignSelf: 'flex-end',
        alignItems: 'flex-end',
    },
    otherMessage: {
        alignSelf: 'flex-start',
        alignItems: 'flex-start',
    },
    senderName: {
        ...typography.labelSmall,
        color: colors.textSecondary,
        marginBottom: 2,
    },
    messageBubble: {
        padding: spacing.sm,
        borderRadius: borderRadius.lg,
    },
    ownBubble: {
        backgroundColor: colors.accentPrimary,
    },
    otherBubble: {
        backgroundColor: colors.surface,
    },
    messageText: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
    },
    timestamp: {
        ...typography.labelSmall,
        color: colors.textMuted,
        marginTop: 2,
    },

    // System message
    systemMessage: {
        alignSelf: 'center',
        marginVertical: spacing.sm,
    },
    systemText: {
        ...typography.labelSmall,
        color: colors.textSecondary,
        fontStyle: 'italic',
    },

    // Empty state
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: spacing.xxl * 2,
    },
    emptyText: {
        ...typography.bodyLarge,
        color: colors.textSecondary,
    },
    emptyHint: {
        ...typography.bodySmall,
        color: colors.textMuted,
        marginTop: spacing.xs,
    },

    // Loading
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

    // Disconnected
    disconnectedContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    disconnectedIcon: {
        fontSize: 48,
        marginBottom: spacing.md,
    },
    disconnectedTitle: {
        ...typography.headlineMedium,
        color: colors.textPrimary,
        marginBottom: spacing.sm,
    },
    disconnectedText: {
        ...typography.bodyMedium,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: spacing.lg,
    },
    reconnectButton: {
        backgroundColor: colors.accentPrimary,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        borderRadius: borderRadius.md,
    },
    reconnectText: {
        ...typography.labelMedium,
        color: colors.textPrimary,
    },

    // Input
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        padding: spacing.md,
        backgroundColor: colors.surface,
        gap: spacing.sm,
    },
    input: {
        flex: 1,
        backgroundColor: colors.background,
        borderRadius: borderRadius.lg,
        padding: spacing.sm,
        paddingTop: spacing.sm,
        ...typography.bodyMedium,
        color: colors.textPrimary,
        maxHeight: 100,
    },
    sendButton: {
        backgroundColor: colors.accentPrimary,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: borderRadius.md,
    },
    sendButtonDisabled: {
        backgroundColor: colors.textMuted,
    },
    sendButtonText: {
        ...typography.labelMedium,
        color: colors.textPrimary,
    },
    micButton: {
        backgroundColor: colors.surface,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.accentPrimary,
    },
    micButtonActive: {
        backgroundColor: colors.error,
        borderColor: colors.error,
    },
    micButtonText: {
        ...typography.labelMedium,
        color: colors.textPrimary,
    },
});

export default MeshChatScreen;
