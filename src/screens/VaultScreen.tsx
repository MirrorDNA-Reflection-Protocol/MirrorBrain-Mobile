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
import { VaultService, SyncService, HapticService, RouterService } from '../services';
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
    const [graphFilter, setGraphFilter] = useState<'all' | 'recent' | 'projects' | 'decisions'>('all');

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

    // Auto-clear any stuck privacy lock from previous builds
    useEffect(() => {
        AsyncStorage.removeItem('@mirrorbrain/privacy_mode').catch(() => {});
    }, []);

    const applyGraphFilter = useCallback((data: { nodes: any[], links: any[] }, preset: string) => {
        if (preset === 'all') return data;

        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        let filteredNodes = data.nodes;

        if (preset === 'recent') {
            // Keep folders + files modified in last 7 days (by path heuristic)
            filteredNodes = data.nodes.filter((n: any) =>
                n.type === 'folder' || (n.path && n.mtime && new Date(n.mtime).getTime() > sevenDaysAgo)
            );
            // If no mtime available, fall back to keeping all (graph scan doesn't always have mtime)
            if (filteredNodes.length < 3) filteredNodes = data.nodes;
        } else if (preset === 'projects') {
            filteredNodes = data.nodes.filter((n: any) =>
                n.type === 'folder' ||
                (n.id && (n.id.includes('Project') || n.id.includes('Status') || n.id.includes('Backlog') || n.folder?.includes('Projects')))
            );
        } else if (preset === 'decisions') {
            filteredNodes = data.nodes.filter((n: any) =>
                n.type === 'folder' ||
                (n.id && (n.id.includes('Decision') || n.id.includes('decision') || n.folder?.includes('Decision')))
            );
        }

        const nodeIds = new Set(filteredNodes.map((n: any) => n.id));
        const filteredLinks = data.links.filter((l: any) =>
            nodeIds.has(l.source) && nodeIds.has(l.target)
        );

        return { nodes: filteredNodes, links: filteredLinks };
    }, []);

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

    // Load items on mount
    useEffect(() => {
        loadItems();
    }, [loadItems]);

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
                {storageInfo && (
                    <Text style={styles.itemCount}>{storageInfo.items} items</Text>
                )}
            </View>

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
                    {viewMode === 'graph' && (
                        <View style={styles.filters}>
                            <FilterChip label="All" active={graphFilter === 'all'} onPress={() => setGraphFilter('all')} />
                            <FilterChip label="Last 7 days" active={graphFilter === 'recent'} onPress={() => setGraphFilter('recent')} />
                            <FilterChip label="Projects" active={graphFilter === 'projects'} onPress={() => setGraphFilter('projects')} />
                            <FilterChip label="Decisions" active={graphFilter === 'decisions'} onPress={() => setGraphFilter('decisions')} />
                        </View>
                    )}
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
                                data={applyGraphFilter(graphData, graphFilter)}
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
                            {/* Floating exit button for graph mode - prominent at top */}
                            <TouchableOpacity
                                style={styles.exitGraphButton}
                                onPress={() => {
                                    HapticService.select();
                                    setViewMode('list');
                                    onLockSwipe?.(false);
                                }}
                            >
                                <Text style={styles.exitGraphText}>✕ CLOSE GRAPH</Text>
                            </TouchableOpacity>
                            {/* Instructions at bottom */}
                            <View style={styles.graphInstructions}>
                                <Text style={styles.graphInstructionsText}>Pinch to zoom • Drag to pan • Tap node to open</Text>
                            </View>
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
                            onPress={async () => {
                                setShowSessionModal(false);
                                // Resolve last run_id from Router
                                const lastRunId = await RouterService.getLastRunId();
                                if (lastRunId) {
                                    Alert.alert('Continue', `Resuming from run: ${lastRunId.slice(0, 8)}...`);
                                    // Audit the continuation intent
                                    RouterService.auditAppend('session_continue', {
                                        session_id: selectedSession?.id,
                                        last_run_id: lastRunId,
                                    });
                                } else {
                                    Alert.alert('Continue', 'No previous run found. Starting fresh.');
                                }
                            }}
                        >
                            <Text style={styles.continueButtonText}>Continue where you left off</Text>
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
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
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
    exitGraphButton: {
        position: 'absolute',
        top: 20,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(255, 100, 100, 0.9)',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 12,
        alignItems: 'center',
        zIndex: 1000,
    },
    exitGraphText: {
        fontSize: 18,
        color: '#ffffff',
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    graphInstructions: {
        position: 'absolute',
        bottom: 30,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    graphInstructionsText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.7)',
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
