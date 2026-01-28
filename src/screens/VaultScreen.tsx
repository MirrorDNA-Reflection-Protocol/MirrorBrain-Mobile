/**
 * VAULT Panel — User-Owned Memory
 * From Spec Part V
 * 
 * Purpose: Continuity and recall without platform dependency.
 * Local-only storage, explicit consent, user can delete anything.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    Alert,
    Modal,
    ScrollView,
} from 'react-native';
import { colors, typography, spacing, glyphs } from '../theme';
import { VaultService, SyncService, HapticService } from '../services';
import { MirrorGraph } from '../components';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { VaultItem, ChatMessage } from '../types';

interface VaultScreenProps {
    onLockSwipe?: (locked: boolean) => void;
}

export const VaultScreen: React.FC<VaultScreenProps> = ({ onLockSwipe }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'capture' | 'decision' | 'session'>('all');
    const [items, setItems] = useState<VaultItem[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [storageInfo, setStorageInfo] = useState<{ items: number } | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
    const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });

    // Handle back button / cleanup
    useEffect(() => {
        return () => {
            onLockSwipe?.(false);
        };
    }, [onLockSwipe]);

    // ... (rest of state code)

    const [showSessionModal, setShowSessionModal] = useState(false);
    const [selectedSession, setSelectedSession] = useState<{
        id: string;
        messages: ChatMessage[];
        closure: unknown;
        createdAt: string;
    } | null>(null);

    // File Preview Modal
    const [showFileModal, setShowFileModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState<{ title: string; content: string; path: string } | null>(null);

    // Privacy Mode / Lock State
    const [privacyModeEnabled, setPrivacyModeEnabled] = useState(false);
    const [isLocked, setIsLocked] = useState(false); // Disabled by default — user enables via toggle
    const [pinInput, setPinInput] = useState('');
    const [pinError, setPinError] = useState(false);

    const loadPrivacySettings = useCallback(async () => {
        try {
            const enabled = await AsyncStorage.getItem('@mirrorbrain/privacy_mode');
            setPrivacyModeEnabled(enabled === 'true');
            // If mode enabled, start locked
            if (enabled === 'true') {
                setIsLocked(true);
            } else {
                setIsLocked(false);
            }
        } catch {
            console.warn('Failed to load privacy settings');
        }
    }, [setPrivacyModeEnabled, setIsLocked]);

    const loadItems = useCallback(async () => {
        try {
            const filterType = filter === 'all' ? undefined : filter;
            const vaultItems = await VaultService.listItems(filterType);
            setItems(vaultItems);

            const info = await VaultService.getStorageInfo();
            setStorageInfo(info);

            // Also load graph data if external vault available
            if (VaultService.hasExternalVault()) {
                const gData = await VaultService.getGraphData();
                setGraphData(gData);
            }
        } catch (error) {
            console.error('Failed to load vault items:', error);
        }
    }, [filter]);

    // Load items and privacy settings on mount
    useEffect(() => {
        loadItems();
        loadPrivacySettings();
    }, [loadItems, loadPrivacySettings]);

    const togglePrivacyMode = async () => {
        const newState = !privacyModeEnabled;
        setPrivacyModeEnabled(newState);
        setIsLocked(newState);
        await AsyncStorage.setItem('@mirrorbrain/privacy_mode', newState.toString());
        HapticService.select();
    };

    const handleUnlock = () => {
        if (pinInput === '1111') { // TODO: Allow user to set PIN
            setIsLocked(false);
            setPinInput('');
            setPinError(false);
            HapticService.success();
        } else {
            setPinError(true);
            setPinInput('');
            HapticService.error();
            setTimeout(() => setPinError(false), 500);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadItems();
        setRefreshing(false);
    }, [loadItems]);

    const handleSearch = useCallback(async () => {
        if (!searchQuery.trim()) {
            loadItems();
            return;
        }

        try {
            const results = await VaultService.search(searchQuery);
            setItems(results);
        } catch (error) {
            console.error('Search failed:', error);
        }
    }, [searchQuery, loadItems]);

    useEffect(() => {
        const debounce = setTimeout(handleSearch, 300);
        return () => clearTimeout(debounce);
    }, [searchQuery, handleSearch]);

    const handleDelete = useCallback((item: VaultItem) => {
        Alert.alert(
            'Delete Item',
            `Are you sure you want to delete "${item.title}"? This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        await VaultService.deleteItem(item.id, item.type);
                        loadItems();
                    }
                },
            ]
        );
    }, [loadItems]);

    const handleViewItem = useCallback(async (item: VaultItem) => {
        if (item.type === 'session') {
            try {
                const session = await VaultService.getItem(item.id, 'session') as {
                    id: string;
                    messages: ChatMessage[];
                    closure: unknown;
                    createdAt: string;
                } | null;
                if (session) {
                    setSelectedSession(session);
                    setShowSessionModal(true);
                }
            } catch (error) {
                console.error('Failed to load session:', error);
                Alert.alert('Error', 'Failed to load session');
            }
        } else {
            // For captures and decisions, show alert with content
            Alert.alert(item.title, item.content);
        }
    }, []);

    const handleExport = useCallback(async () => {
        Alert.alert(
            'Export Vault',
            'This will create a backup of your vault and config. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Export',
                    onPress: async () => {
                        // In real implementation, would use document picker
                        const success = await VaultService.export('/sdcard/Download');
                        if (success) {
                            Alert.alert('Success', 'Vault exported to Downloads folder');
                        } else {
                            Alert.alert('Error', 'Failed to export vault');
                        }
                    }
                }
            ]
        );
    }, []);

    const formatDate = (date: Date): string => {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.glyph}>{glyphs.pattern}</Text>
                <Text style={styles.title}>VAULT</Text>
                <TouchableOpacity
                    style={styles.viewToggle}
                    onPress={async () => {
                        HapticService.select();
                        if (viewMode === 'list') {
                            // Switching to graph view - load graph data
                            console.log('[VaultScreen] Switching to graph view...');
                            setViewMode('graph');
                            onLockSwipe?.(true);

                            try {
                                console.log('[VaultScreen] Has external vault?', VaultService.hasExternalVault());
                                if (!VaultService.hasExternalVault()) {
                                    console.log('[VaultScreen] Requesting external vault access...');
                                    const accessGranted = await VaultService.requestExternalAccess();
                                    console.log('[VaultScreen] Access granted?', accessGranted);
                                }

                                // Check if we can actually read files
                                const canRead = await VaultService.checkAllFilesAccess();
                                console.log('[VaultScreen] Can read files?', canRead);

                                if (!canRead) {
                                    // Need to manually grant "All files access" in Settings
                                    const { Linking } = require('react-native');
                                    Alert.alert(
                                        '⚠️ All Files Access Required',
                                        'MirrorBrain needs special permission to read your Obsidian vault.\n\n' +
                                        '1. Tap "Open Settings"\n' +
                                        '2. Find "MirrorBrain" in the list\n' +
                                        '3. Toggle ON "Allow access to manage all files"\n' +
                                        '4. Return here and tap Graph again',
                                        [
                                            { text: 'Cancel', style: 'cancel', onPress: () => setViewMode('list') },
                                            {
                                                text: 'Open Settings',
                                                onPress: async () => {
                                                    try {
                                                        // Try to open the specific manage all files permission screen
                                                        await Linking.sendIntent(
                                                            'android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION'
                                                        );
                                                    } catch {
                                                        // Fallback to general settings
                                                        Linking.openSettings();
                                                    }
                                                }
                                            }
                                        ]
                                    );
                                    return;
                                }

                                console.log('[VaultScreen] Calling getGraphData...');
                                const gData = await VaultService.getGraphData();
                                console.log('[VaultScreen] Graph data received:', gData.nodes.length, 'nodes,', gData.links.length, 'links');
                                setGraphData(gData);

                                if (gData.nodes.length === 0) {
                                    console.log('[VaultScreen] Graph empty. Running diagnostics...');
                                    const diagLogs = await VaultService.runDiagnostics();

                                    Alert.alert(
                                        'No Notes Found',
                                        'Vault exists but appears empty. This is likely a permission issue.\n\nDebug Info:\n' + diagLogs.substring(0, 500),
                                        [
                                            { text: 'OK', style: 'cancel' },
                                            {
                                                text: 'Fix Permissions',
                                                onPress: async () => {
                                                    const { Linking } = require('react-native');
                                                    try {
                                                        await Linking.sendIntent('android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION');
                                                    } catch {
                                                        Linking.openSettings();
                                                    }
                                                }
                                            }
                                        ]
                                    );
                                }
                            } catch (error) {
                                console.error('[VaultScreen] Error loading graph:', error);
                                Alert.alert('Error', 'Failed to load graph data');
                                setViewMode('list');
                                onLockSwipe?.(false);
                            }
                        } else {
                            setViewMode('list');
                            onLockSwipe?.(false);
                        }
                    }}
                >
                    <Text style={styles.viewToggleText}>
                        {viewMode === 'list' ? '🕸️ Graph' : '📜 List'}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.privacyToggle, privacyModeEnabled && styles.privacyToggleActive]}
                    onPress={togglePrivacyMode}
                >
                    <Text style={styles.privacyToggleText}>
                        {privacyModeEnabled ? '🔒 Secure' : '🔓 Open'}
                    </Text>
                </TouchableOpacity>
                {storageInfo && !isLocked && (
                    <Text style={styles.itemCount}>{storageInfo.items} items</Text>
                )}
            </View>

            {isLocked && privacyModeEnabled ? (
                <View style={styles.lockContainer}>
                    <Text style={styles.lockGlyph}>🔐</Text>
                    <Text style={styles.lockTitle}>Vault Locked</Text>
                    <Text style={styles.lockSubtitle}>Enter PIN to access your memories</Text>

                    <View style={styles.pinDisplay}>
                        {[...Array(4)].map((_, i) => (
                            <View
                                key={i}
                                style={[
                                    styles.pinDot,
                                    pinInput.length > i && styles.pinDotFilled,
                                    pinError && styles.pinDotError
                                ]}
                            />
                        ))}
                    </View>

                    <View style={styles.keypad}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '✓'].map((key) => (
                            <TouchableOpacity
                                key={key.toString()}
                                style={styles.key}
                                onPress={() => {
                                    HapticService.tap();
                                    if (key === 'C') setPinInput('');
                                    else if (key === '✓') handleUnlock();
                                    else if (pinInput.length < 4) {
                                        const newPin = pinInput + key;
                                        setPinInput(newPin);
                                        if (newPin.length === 4) {
                                            // Auto-verify
                                            setTimeout(() => {
                                                if (newPin === '1111') {
                                                    setIsLocked(false);
                                                    setPinInput('');
                                                } else {
                                                    setPinError(true);
                                                    setPinInput('');
                                                }
                                            }, 100);
                                        }
                                    }
                                }}
                            >
                                <Text style={styles.keyText}>{key}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            ) : (
                <>

                    {/* Storage path indicator */}
                    <TouchableOpacity
                        style={styles.pathIndicator}
                        onPress={() => Alert.alert('Vault Path', VaultService.getRootPath())}
                    >
                        <Text style={styles.pathText}>
                            📂 {VaultService.isInitialized() ? 'Vault ready' : 'Initializing...'}
                        </Text>
                    </TouchableOpacity>

                    {/* Search */}
                    <View style={styles.searchContainer}>
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search vault..."
                            placeholderTextColor={colors.textMuted}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>

                    {/* Filters */}
                    {viewMode === 'list' && (
                        <View style={styles.filters}>
                            <FilterChip
                                label="All"
                                active={filter === 'all'}
                                onPress={() => setFilter('all')}
                            />
                            <FilterChip
                                label="Captures"
                                active={filter === 'capture'}
                                onPress={() => setFilter('capture')}
                            />
                            <FilterChip
                                label="Decisions"
                                active={filter === 'decision'}
                                onPress={() => setFilter('decision')}
                            />
                            <FilterChip
                                label="Sessions"
                                active={filter === 'session'}
                                onPress={() => setFilter('session')}
                            />
                        </View>
                    )}

                    {/* Content View */}
                    {viewMode === 'list' ? (
                        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flex: 1 }}>
                            <FlatList
                                data={items}
                                keyExtractor={item => item.id}
                                contentContainerStyle={styles.listContent}
                                refreshControl={
                                    <RefreshControl
                                        refreshing={refreshing}
                                        onRefresh={onRefresh}
                                        tintColor={colors.textSecondary}
                                    />
                                }
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={styles.itemCard}
                                        onPress={() => handleViewItem(item)}
                                        onLongPress={() => handleDelete(item)}
                                    >
                                        <View style={styles.itemHeader}>
                                            <Text style={styles.itemType}>{getTypeIcon(item.type)}</Text>
                                            <Text style={styles.itemTitle} numberOfLines={1}>
                                                {item.title}
                                            </Text>
                                        </View>
                                        <Text style={styles.itemContent} numberOfLines={2}>
                                            {item.content}
                                        </Text>
                                        <View style={styles.itemFooter}>
                                            <Text style={styles.itemDate}>{formatDate(item.createdAt)}</Text>
                                            {item.tags && item.tags.length > 0 && (
                                                <View style={styles.tags}>
                                                    {item.tags.slice(0, 2).map(tag => (
                                                        <Text key={tag} style={styles.tag}>#{tag}</Text>
                                                    ))}
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                )}
                                ListEmptyComponent={
                                    <View style={styles.emptyState}>
                                        <Text style={styles.emptyIcon}>{glyphs.pattern}</Text>
                                        <Text style={styles.emptyText}>
                                            {searchQuery
                                                ? 'No items match your search'
                                                : 'Your vault is empty'}
                                        </Text>
                                        <Text style={styles.emptyHint}>
                                            Use ACTIONS panel to create a capture
                                        </Text>
                                        <TouchableOpacity
                                            style={styles.testButton}
                                            onPress={async () => {
                                                await VaultService.saveCapture(
                                                    'note',
                                                    'This is a test capture to verify the vault is working.',
                                                    'Test Capture'
                                                );
                                                loadItems();
                                                Alert.alert('Created', 'Test capture added to vault');
                                            }}
                                        >
                                            <Text style={styles.testButtonText}>+ Create Test Capture</Text>
                                        </TouchableOpacity>
                                    </View>
                                }
                            />
                        </Animated.View>
                    ) : (
                        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flex: 1 }}>
                            <MirrorGraph
                                data={graphData}
                                onNodePress={async (id) => {
                                    if (id.startsWith('dir_')) {
                                        return; // Ignore folders for now or zoom in
                                    }

                                    console.log('[VaultScreen] Node clicked:', id);
                                    HapticService.select();

                                    // Find node to get path
                                    const node = graphData.nodes.find(n => n.id === id);
                                    if (node && node.path) {
                                        try {
                                            const content = await VaultService.readExternalFile(node.path);
                                            if (content) {
                                                setSelectedFile({
                                                    title: id,
                                                    content: content,
                                                    path: node.path
                                                });
                                                setShowFileModal(true);
                                                return;
                                            }
                                        } catch {
                                            console.warn('Failed to read file for preview');
                                        }
                                    }

                                    // Fallback: Try Deep Link if preview fails
                                    const { Linking } = require('react-native');
                                    const encodedId = encodeURIComponent(id);
                                    const url = `obsidian://open?vault=MirrorDNA-Vault&file=${encodedId}`;
                                    try { await Linking.openURL(url); } catch { }
                                }}
                            />
                        </Animated.View>
                    )}
                    {/* Sync buttons */}
                    <View style={styles.syncButtons}>
                        <TouchableOpacity
                            style={styles.syncButton}
                            onPress={async () => {
                                const success = await SyncService.shareExport();
                                if (!success) {
                                    Alert.alert('No Data', 'Create some captures first');
                                }
                            }}
                        >
                            <Text style={styles.syncIcon}>📤</Text>
                            <Text style={styles.syncButtonText}>Share</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.syncButton}
                            onPress={async () => {
                                const { Linking } = require('react-native');
                                try {
                                    // Direct launch Obsidian via package name
                                    await Linking.openURL('obsidian://open?vault=MirrorDNA-Vault');
                                } catch {
                                    // Try Android intent as fallback
                                    try {
                                        await Linking.sendIntent('android.intent.action.MAIN', [
                                            { key: 'package', value: 'md.obsidian' }
                                        ]);
                                    } catch {
                                        // Last resort: try to open Play Store
                                        try {
                                            await Linking.openURL('market://details?id=md.obsidian');
                                        } catch {
                                            Alert.alert('Cannot Open Obsidian', 'Make sure Obsidian is installed from the Play Store');
                                        }
                                    }
                                }
                            }}
                        >
                            <Text style={styles.syncIcon}>🗂️</Text>
                            <Text style={styles.syncButtonText}>Obsidian</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.syncButton} onPress={handleExport}>
                            <Text style={styles.syncIcon}>💾</Text>
                            <Text style={styles.syncButtonText}>Backup</Text>
                        </TouchableOpacity>
                    </View>
                </>
            )}

            {/* Session Detail Modal */}
            <Modal
                visible={showSessionModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowSessionModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.sessionModalContent}>
                        <View style={styles.sessionModalHeader}>
                            <Text style={styles.sessionModalTitle}>💬 Session History</Text>
                            <TouchableOpacity onPress={() => setShowSessionModal(false)}>
                                <Text style={styles.closeButton}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        {selectedSession && (
                            <>
                                <Text style={styles.sessionDate}>
                                    {new Date(selectedSession.createdAt).toLocaleString()}
                                </Text>
                                <ScrollView style={styles.messagesContainer}>
                                    {selectedSession.messages.map((msg, index) => (
                                        <View
                                            key={index}
                                            style={[
                                                styles.messageBubble,
                                                msg.role === 'user' ? styles.userMessage : styles.assistantMessage,
                                            ]}
                                        >
                                            <Text style={styles.messageRole}>
                                                {msg.role === 'user' ? '👤 You' : '🤖 MirrorMesh'}
                                            </Text>
                                            <Text style={styles.messageContent}>{msg.content}</Text>
                                        </View>
                                    ))}
                                </ScrollView>
                            </>
                        )}
                        <TouchableOpacity
                            style={styles.continueButton}
                            onPress={() => {
                                setShowSessionModal(false);
                                Alert.alert('Coming Soon', 'Session continuation will be added in the next update');
                            }}
                        >
                            <Text style={styles.continueButtonText}>Continue this conversation</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* File Preview Modal (Viral Elegance) */}
            <Modal
                visible={showFileModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowFileModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.fileModalContent}>
                        <View style={styles.fileModalHeader}>
                            <Text style={styles.fileModalTitle}>{selectedFile?.title}</Text>
                            <TouchableOpacity onPress={() => setShowFileModal(false)} style={styles.closeIconBtn}>
                                <Text style={styles.closeButton}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.fileScrollView}>
                            <Text style={styles.fileContentText}>{selectedFile?.content}</Text>
                        </ScrollView>
                        <View style={styles.fileModalFooter}>
                            <TouchableOpacity
                                style={styles.openExternalButton}
                                onPress={async () => {
                                    if (!selectedFile) return;
                                    const { Linking } = require('react-native');
                                    // Try specific file
                                    const url = `obsidian://open?vault=MirrorDNA-Vault&file=${encodeURIComponent(selectedFile.title)}`;
                                    try {
                                        await Linking.openURL(url);
                                    } catch {
                                        Alert.alert('Could not open external editor');
                                    }
                                }}
                            >
                                <Text style={styles.openExternalText}>Open in Editor ↗</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const FilterChip: React.FC<{
    label: string;
    active: boolean;
    onPress: () => void;
}> = ({ label, active, onPress }) => (
    <TouchableOpacity
        style={[styles.filterChip, active && styles.filterChipActive]}
        onPress={onPress}
    >
        <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
            {label}
        </Text>
    </TouchableOpacity>
);

const getTypeIcon = (type: VaultItem['type']): string => {
    switch (type) {
        case 'capture': return '📝';
        case 'decision': return glyphs.decision;
        case 'session': return '💬';
        default: return '•';
    }
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
        flexWrap: 'wrap',
        padding: spacing.lg,
        paddingBottom: spacing.md,
        gap: spacing.sm,
    },
    glyph: {
        fontSize: 24,
        color: colors.glyphPattern,
    },
    title: {
        ...typography.headlineLarge,
        color: colors.textPrimary,
        marginRight: 'auto',
    },
    itemCount: {
        ...typography.labelSmall,
        color: colors.textMuted,
    },
    viewToggle: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    viewToggleText: {
        ...typography.labelSmall,
        color: colors.textPrimary,
    },

    // Search
    searchContainer: {
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.md,
    },
    searchInput: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        ...typography.bodyMedium,
        color: colors.textPrimary,
    },

    // Filters
    filters: {
        flexDirection: 'row',
        paddingHorizontal: spacing.lg,
        marginBottom: spacing.md,
        gap: spacing.xs,
    },
    filterChip: {
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        borderRadius: 16,
        backgroundColor: colors.surface,
    },
    filterChipActive: {
        backgroundColor: colors.accentDark,
    },
    filterChipText: {
        ...typography.labelSmall,
        color: colors.textSecondary,
    },
    filterChipTextActive: {
        color: colors.textPrimary,
    },

    // List
    listContent: {
        padding: spacing.lg,
        paddingTop: 0,
        flexGrow: 1,
    },
    itemCard: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    itemHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    itemType: {
        fontSize: 14,
        marginRight: spacing.sm,
    },
    itemTitle: {
        ...typography.headlineSmall,
        color: colors.textPrimary,
        flex: 1,
    },
    itemContent: {
        ...typography.bodySmall,
        color: colors.textSecondary,
        marginBottom: spacing.sm,
    },
    itemFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    itemDate: {
        ...typography.labelSmall,
        color: colors.textMuted,
    },
    tags: {
        flexDirection: 'row',
        gap: spacing.xs,
    },
    tag: {
        ...typography.labelSmall,
        color: colors.accentLight,
    },

    // Empty state
    emptyState: {
        alignItems: 'center',
        paddingTop: spacing.xxl,
        flex: 1,
    },
    emptyIcon: {
        fontSize: 48,
        color: colors.textMuted,
        marginBottom: spacing.md,
    },
    emptyText: {
        ...typography.bodyMedium,
        color: colors.textMuted,
        marginBottom: spacing.xs,
    },
    emptyHint: {
        ...typography.bodySmall,
        color: colors.textMuted,
    },

    // Path indicator
    pathIndicator: {
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        backgroundColor: colors.surface,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    pathText: {
        ...typography.labelSmall,
        color: colors.textMuted,
    },

    // Test button
    testButton: {
        marginTop: spacing.lg,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        backgroundColor: colors.accentPrimary,
        borderRadius: 8,
    },
    testButtonText: {
        ...typography.labelMedium,
        color: colors.textPrimary,
    },

    // Sync buttons
    syncButtons: {
        flexDirection: 'row',
        padding: spacing.md,
        paddingTop: 0,
        gap: spacing.sm,
    },
    syncButton: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: spacing.md,
        alignItems: 'center',
    },
    syncIcon: {
        fontSize: 20,
        marginBottom: spacing.xs,
    },
    syncButtonText: {
        ...typography.labelSmall,
        color: colors.textSecondary,
    },

    // Session Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: colors.overlay,
        justifyContent: 'flex-end',
    },
    sessionModalContent: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: spacing.lg,
        maxHeight: '85%',
    },
    sessionModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    sessionModalTitle: {
        ...typography.headlineMedium,
        color: colors.textPrimary,
    },
    closeButton: {
        fontSize: 24,
        color: colors.textMuted,
        padding: spacing.sm,
    },
    sessionDate: {
        ...typography.labelSmall,
        color: colors.textMuted,
        marginBottom: spacing.md,
    },
    messagesContainer: {
        flex: 1,
        marginBottom: spacing.md,
    },
    messageBubble: {
        padding: spacing.md,
        borderRadius: 12,
        marginBottom: spacing.sm,
    },
    userMessage: {
        backgroundColor: colors.accentDark,
        alignSelf: 'flex-end',
        maxWidth: '85%',
    },
    assistantMessage: {
        backgroundColor: colors.background,
        alignSelf: 'flex-start',
        maxWidth: '85%',
    },
    messageRole: {
        ...typography.labelSmall,
        color: colors.textMuted,
        marginBottom: spacing.xs,
    },
    messageContent: {
        ...typography.bodyMedium,
        color: colors.textPrimary,
    },
    continueButton: {
        backgroundColor: colors.accentPrimary,
        borderRadius: 12,
        padding: spacing.md,
        alignItems: 'center',
    },
    continueButtonText: {
        ...typography.labelMedium,
        color: colors.textPrimary,
        fontWeight: '600',
    },

    // Privacy
    privacyToggle: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.surfaceElevated,
        marginRight: spacing.sm,
    },
    privacyToggleActive: {
        borderColor: colors.accentLight,
    },
    privacyToggleText: {
        ...typography.labelSmall,
        color: colors.textSecondary,
    },

    // Lock Overlay
    lockContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: spacing.xl,
    },
    lockGlyph: {
        fontSize: 64,
        marginBottom: spacing.lg,
    },
    lockTitle: {
        ...typography.displaySmall,
        color: colors.textPrimary,
        marginBottom: spacing.xs,
    },
    lockSubtitle: {
        ...typography.bodyMedium,
        color: colors.textSecondary,
        marginBottom: spacing.xl,
        textAlign: 'center',
    },
    pinDisplay: {
        flexDirection: 'row',
        gap: spacing.md,
        marginBottom: spacing.xxl,
    },
    pinDot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.accentLight,
    },
    pinDotFilled: {
        backgroundColor: colors.accentLight,
    },
    pinDotError: {
        borderColor: colors.error,
        backgroundColor: colors.error,
    },
    keypad: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        width: 280,
        justifyContent: 'center',
        gap: spacing.md,
    },
    key: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    keyText: {
        ...typography.headlineMedium,
        color: colors.textPrimary,
    },

    // File Preview Modal Styles
    fileModalContent: {
        backgroundColor: '#111111',
        borderRadius: 16,
        height: '85%',
        padding: 0,
        borderWidth: 1,
        borderColor: colors.accent, // Neon border
        overflow: 'hidden',
    },
    fileModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.md,
        backgroundColor: '#1A1A1A',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    fileModalTitle: {
        ...typography.headlineSmall,
        color: colors.accent,
        fontWeight: 'bold',
        flex: 1,
    },
    closeIconBtn: {
        padding: 4,
    },
    fileScrollView: {
        flex: 1,
        padding: spacing.md,
    },
    fileContentText: {
        fontFamily: 'monospace',
        fontSize: 14,
        color: '#cccccc',
        lineHeight: 22,
    },
    fileModalFooter: {
        padding: spacing.md,
        borderTopWidth: 1,
        borderTopColor: '#333',
        backgroundColor: '#1A1A1A',
    },
    openExternalButton: {
        backgroundColor: colors.surface,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    openExternalText: {
        color: colors.textPrimary,
        fontWeight: 'bold',
    },
});

export default VaultScreen;
