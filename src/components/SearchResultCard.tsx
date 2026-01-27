/**
 * Search Result Card — Citation Display
 * 
 * Displays a search result with source, title, snippet, and link.
 * Tapping opens in BrowserPane.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { GlassView } from './GlassView';
import { colors, spacing } from '../theme';
import { SearchResult } from '../services/search.service';

interface SearchResultCardProps {
    result: SearchResult;
    index: number;
    onPress: (url: string) => void;
}

export const SearchResultCard: React.FC<SearchResultCardProps> = ({
    result,
    index,
    onPress,
}) => {
    return (
        <TouchableOpacity
            onPress={() => onPress(result.url)}
            activeOpacity={0.8}
        >
            <GlassView style={styles.container} variant="subtle">
                <View style={styles.content}>
                    {/* Citation Badge + Favicon */}
                    <View style={styles.header}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>{index + 1}</Text>
                        </View>
                        {result.favicon && (
                            <Image
                                source={{ uri: result.favicon }}
                                style={styles.favicon}
                            />
                        )}
                        <Text style={styles.source} numberOfLines={1}>
                            {result.source}
                        </Text>
                    </View>

                    {/* Title */}
                    <Text style={styles.title} numberOfLines={2}>
                        {result.title}
                    </Text>

                    {/* Snippet */}
                    <Text style={styles.snippet} numberOfLines={2}>
                        {result.snippet}
                    </Text>
                </View>
            </GlassView>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: spacing.sm,
    },
    content: {
        padding: spacing.md,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.xs,
    },
    badge: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: colors.accentPrimary,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },
    favicon: {
        width: 16,
        height: 16,
        borderRadius: 2,
        marginRight: 6,
    },
    source: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        flex: 1,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 4,
        lineHeight: 20,
    },
    snippet: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        lineHeight: 18,
    },
});

export default SearchResultCard;
