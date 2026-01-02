/**
 * Identity Import Modal
 * From Spec Part VIII
 * 
 * First Launch: Prompt to import Mirror Seed
 * Options: Paste text or select file
 * Link to id.activemirror.ai if no identity
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    Modal,
    TouchableOpacity,
    Linking,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, glyphs } from '../theme';
import { IdentityService } from '../services';

interface IdentityImportModalProps {
    visible: boolean;
    onClose: () => void;
    onImportComplete: () => void;
}

export const IdentityImportModal: React.FC<IdentityImportModalProps> = ({
    visible,
    onClose,
    onImportComplete,
}) => {
    const [mode, setMode] = useState<'choose' | 'paste'>('choose');
    const [pasteText, setPasteText] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handlePasteImport = async () => {
        if (!pasteText.trim()) {
            Alert.alert('Error', 'Please paste your Mirror Seed JSON');
            return;
        }

        setIsLoading(true);

        try {
            const success = await IdentityService.importIdentity(pasteText.trim());

            if (success) {
                Alert.alert('Success', 'Mirror Seed imported successfully');
                setPasteText('');
                setMode('choose');
                onImportComplete();
                onClose();
            } else {
                Alert.alert('Error', 'Invalid Mirror Seed format');
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to parse Mirror Seed. Please check the format.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateNew = () => {
        Linking.openURL(IdentityService.getCreateIdentityUrl());
    };

    const handleSkip = () => {
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.content}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.glyph}>{glyphs.truth}</Text>
                        <Text style={styles.title}>Mirror Seed</Text>
                    </View>

                    {mode === 'choose' ? (
                        <>
                            <Text style={styles.description}>
                                Import your identity to personalize MirrorMesh responses.
                                Your data stays on this device.
                            </Text>

                            {/* Options */}
                            <TouchableOpacity
                                style={styles.optionButton}
                                onPress={() => setMode('paste')}
                            >
                                <Text style={styles.optionIcon}>📋</Text>
                                <View style={styles.optionContent}>
                                    <Text style={styles.optionTitle}>Paste JSON</Text>
                                    <Text style={styles.optionDesc}>
                                        Paste your Mirror Seed from clipboard
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.optionButton}
                                onPress={handleCreateNew}
                            >
                                <Text style={styles.optionIcon}>🌐</Text>
                                <View style={styles.optionContent}>
                                    <Text style={styles.optionTitle}>Create New</Text>
                                    <Text style={styles.optionDesc}>
                                        Generate at id.activemirror.ai
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            {/* Skip option */}
                            <TouchableOpacity
                                style={styles.skipButton}
                                onPress={handleSkip}
                            >
                                <Text style={styles.skipText}>Skip for now</Text>
                            </TouchableOpacity>

                            <Text style={styles.footnote}>
                                MirrorMesh works without identity (generic mode)
                            </Text>
                        </>
                    ) : (
                        <>
                            {/* Paste mode */}
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={() => setMode('choose')}
                            >
                                <Text style={styles.backText}>← Back</Text>
                            </TouchableOpacity>

                            <Text style={styles.pasteLabel}>
                                Paste your Mirror Seed JSON:
                            </Text>

                            <TextInput
                                style={styles.pasteInput}
                                placeholder='{"name": "...", "values": [...], ...}'
                                placeholderTextColor={colors.textMuted}
                                value={pasteText}
                                onChangeText={setPasteText}
                                multiline
                                autoFocus
                            />

                            <TouchableOpacity
                                style={[
                                    styles.importButton,
                                    (!pasteText.trim() || isLoading) && styles.importButtonDisabled
                                ]}
                                onPress={handlePasteImport}
                                disabled={!pasteText.trim() || isLoading}
                            >
                                {isLoading ? (
                                    <ActivityIndicator size="small" color={colors.textPrimary} />
                                ) : (
                                    <Text style={styles.importButtonText}>Import Identity</Text>
                                )}
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: colors.overlay,
        justifyContent: 'flex-end',
    },
    content: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: spacing.lg,
        paddingBottom: spacing.xxl,
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    glyph: {
        fontSize: 24,
        color: colors.glyphTruth,
        marginRight: spacing.sm,
    },
    title: {
        ...typography.headlineLarge,
        color: colors.textPrimary,
    },

    // Description
    description: {
        ...typography.bodyMedium,
        color: colors.textSecondary,
        marginBottom: spacing.lg,
        lineHeight: 22,
    },

    // Options
    optionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background,
        borderRadius: 12,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    optionIcon: {
        fontSize: 24,
        marginRight: spacing.md,
    },
    optionContent: {
        flex: 1,
    },
    optionTitle: {
        ...typography.headlineSmall,
        color: colors.textPrimary,
    },
    optionDesc: {
        ...typography.bodySmall,
        color: colors.textSecondary,
    },

    // Skip
    skipButton: {
        alignItems: 'center',
        paddingVertical: spacing.md,
        marginTop: spacing.sm,
    },
    skipText: {
        ...typography.labelMedium,
        color: colors.textMuted,
    },
    footnote: {
        ...typography.bodySmall,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: spacing.sm,
    },

    // Paste mode
    backButton: {
        marginBottom: spacing.md,
    },
    backText: {
        ...typography.labelMedium,
        color: colors.accentLight,
    },
    pasteLabel: {
        ...typography.labelMedium,
        color: colors.textSecondary,
        marginBottom: spacing.sm,
    },
    pasteInput: {
        backgroundColor: colors.background,
        borderRadius: 12,
        padding: spacing.md,
        minHeight: 150,
        ...typography.mono,
        color: colors.textPrimary,
        textAlignVertical: 'top',
        marginBottom: spacing.md,
    },
    importButton: {
        backgroundColor: colors.accentPrimary,
        borderRadius: 12,
        padding: spacing.md,
        alignItems: 'center',
    },
    importButtonDisabled: {
        backgroundColor: colors.textMuted,
    },
    importButtonText: {
        ...typography.labelLarge,
        color: colors.textPrimary,
    },
});

export default IdentityImportModal;
