/**
 * useLLM Hook — React interface to LLM Service
 * Provides state management for model loading and inference
 */

import { useState, useCallback, useEffect } from 'react';
import { LLMService, AVAILABLE_MODELS, type ModelId } from '../services';
import type { ChatMessage, CompletionResult } from '../types';

interface UseLLMResult {
    // State
    isLoading: boolean;
    isModelLoaded: boolean;
    loadedModel: string | null;
    isGenerating: boolean;

    // Actions
    loadModel: (modelId: ModelId) => Promise<boolean>;
    unloadModel: () => Promise<void>;
    chat: (
        messages: ChatMessage[],
        systemPrompt?: string,
        onToken?: (token: string) => void
    ) => Promise<CompletionResult | null>;
    complete: (
        prompt: string,
        maxTokens?: number,
        onToken?: (token: string) => void
    ) => Promise<CompletionResult | null>;
    downloadModel: (
        modelId: ModelId,
        onProgress?: (progress: number) => void
    ) => Promise<boolean>;

    // Model info
    availableModels: typeof AVAILABLE_MODELS;
    checkModelExists: (modelId: ModelId) => Promise<boolean>;
}

export function useLLM(): UseLLMResult {
    const [isLoading, setIsLoading] = useState(false);
    const [isModelLoaded, setIsModelLoaded] = useState(false);
    const [loadedModel, setLoadedModel] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // Check initial state
    useEffect(() => {
        setIsModelLoaded(LLMService.isModelLoaded());
        setLoadedModel(LLMService.getLoadedModel());
    }, []);

    const loadModel = useCallback(async (modelId: ModelId): Promise<boolean> => {
        setIsLoading(true);
        try {
            const success = await LLMService.loadModel(modelId);
            setIsModelLoaded(success);
            setLoadedModel(success ? modelId : null);
            return success;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const unloadModel = useCallback(async (): Promise<void> => {
        await LLMService.unloadModel();
        setIsModelLoaded(false);
        setLoadedModel(null);
    }, []);

    const chat = useCallback(async (
        messages: ChatMessage[],
        systemPrompt?: string,
        onToken?: (token: string) => void
    ): Promise<CompletionResult | null> => {
        setIsGenerating(true);
        try {
            return await LLMService.chat(messages, systemPrompt, onToken);
        } finally {
            setIsGenerating(false);
        }
    }, []);

    const complete = useCallback(async (
        prompt: string,
        maxTokens: number = 256,
        onToken?: (token: string) => void
    ): Promise<CompletionResult | null> => {
        setIsGenerating(true);
        try {
            return await LLMService.complete(prompt, maxTokens, onToken);
        } finally {
            setIsGenerating(false);
        }
    }, []);

    const downloadModel = useCallback(async (
        modelId: ModelId,
        onProgress?: (progress: number) => void
    ): Promise<boolean> => {
        setIsLoading(true);
        try {
            return await LLMService.downloadModel(modelId, onProgress);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const checkModelExists = useCallback(async (modelId: ModelId): Promise<boolean> => {
        return await LLMService.modelExists(modelId);
    }, []);

    return {
        isLoading,
        isModelLoaded,
        loadedModel,
        isGenerating,
        loadModel,
        unloadModel,
        chat,
        complete,
        downloadModel,
        availableModels: AVAILABLE_MODELS,
        checkModelExists,
    };
}

export default useLLM;
