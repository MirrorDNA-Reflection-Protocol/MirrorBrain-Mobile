import React, { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { colors } from '../theme';
import { LLMService } from '../services';

interface RefineButtonProps {
    text: string;
    onRefine: (newText: string) => void;
    style?: any;
}

export const RefineButton: React.FC<RefineButtonProps> = ({ text, onRefine, style }) => {
    const [isRefining, setIsRefining] = useState(false);

    const handleRefine = async () => {
        if (!text.trim()) {
            Alert.alert('Empty', 'Type something to refine first.');
            return;
        }

        if (!LLMService.isModelLoaded()) {
            Alert.alert('No Brain', 'Load a model in settings to use the Magic Wand.');
            return;
        }

        setIsRefining(true);

        try {
            const prompt = `System: You are an expert editor. Rewrite the following raw text into clear, structured Markdown. Fix grammar, improve flow, and add tags if relevant. Do not add conversational filler. Just the polished text.

Raw Text: "${text}"

Polished Version:`;

            const result = await LLMService.complete(prompt, 512);

            if (result && result.text) {
                onRefine(result.text.trim());
            } else {
                Alert.alert('Failed', 'The neural engine stalled.');
            }
        } catch {
            console.log('Action failed');
        } finally {
            setIsRefining(false);
        }
    };

    return (
        <TouchableOpacity
            style={[styles.button, isRefining && styles.buttonActive, style]}
            onPress={handleRefine}
            disabled={isRefining}
        >
            {isRefining ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
                <Text style={styles.icon}>✨</Text>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    button: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.accentSecondary,
    },
    buttonActive: {
        backgroundColor: colors.accentSecondary,
    },
    icon: {
        fontSize: 22,
    },
});
