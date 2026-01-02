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
import { VaultService, SyncService } from '../services';
import type { VaultItem, ChatMessage } from '../types';

interface VaultScreenProps {
    // Future: onOpenItem, onExport, etc.
}

export const VaultScreen: React.FC<VaultScreenProps> = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'capture' | 'decision' | 'session'>('all');
    const [items, setItems] = useState<VaultItem[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [storageInfo, setStorageInfo] = useState<{ items: number } | null>(null);

    // Session detail modal
    const [selectedSession, setSelectedSession] = useState<{
        id: string;
        messages: ChatMessage[];
        closure: unknown;
        createdAt: string;
    } | null>(null);
    const [showSessionModal, setShowSessionModal] = useState(false);

    // Load items on mount and filter change
    useEffect(() => {
        loadItems();
    }, [filter]);

    const loadItems = useCallback(async () => {
        try {
            const filterType = filter === 'all' ? undefined : filter;
            const vaultItems = await VaultService.listItems(filterType);
            setItems(vaultItems);

            const info = await VaultService.getStorageInfo();
            setStorageInfo(info);
        } catch (error) {
            console.error('Failed to load vault items:', error);
        }
    }, [filter]);

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

            {/* Items list */}
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
                        const path = await SyncService.exportAsMarkdown();
                        if (path) {
                            Alert.alert('Exported', 'Obsidian markdown files created');
                        } else {
                            Alert.alert('No Data', 'Create some captures first');
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
        padding: spacing.lg,
        paddingBottom: spacing.md,
    },
    glyph: {
        fontSize: 24,
        color: colors.glyphPattern,
        marginRight: spacing.sm,
    },
    title: {
        ...typography.displayLarge,
        color: colors.textPrimary,
        flex: 1,
    },
    itemCount: {
        ...typography.labelSmall,
        color: colors.textMuted,
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
});

export default VaultScreen;
