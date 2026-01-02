/**
 * LLM Service — Local Inference via llama.rn
 * From Spec Part VII
 * 
 * Recommended Model Stack:
 * - Qwen 2.5 1.5B (Q4_K_M) — Primary
 * - SmolLM2 360M (Q4_K_M) — Instant simple queries
 * 
 * Performance Targets (Pixel 9 Pro XL):
 * - First token: Under 500ms
 * - Sustained: 30+ tokens/second
 * - Model cold load: Under 3 seconds
 */

import { initLlama, type LlamaContext } from 'llama.rn';
import RNFS from 'react-native-fs';
import { STORAGE_PATHS } from './vault.service';
import type { LLMConfig, CompletionResult, ChatMessage } from '../types';

// Default stop tokens for various model families
const STOP_TOKENS = [
    '&lt;/s&gt;',
    '&lt;|end|&gt;',
    '&lt;|eot_id|&gt;',
    '&lt;|end_of_text|&gt;',
    '&lt;|im_end|&gt;',
    '&lt;|EOT|&gt;',
    '&lt;|END_OF_TURN_TOKEN|&gt;',
    '&lt;|end_of_turn|&gt;',
    '&lt;|endoftext|&gt;',
];

// Default config for Pixel 9 Pro XL
const DEFAULT_CONFIG: LLMConfig = {
    modelPath: '',
    contextSize: 2048,
    gpuLayers: 99, // Offload all layers to GPU
};

// Model info for downloading
export const AVAILABLE_MODELS = [
    {
        id: 'qwen-2.5-1.5b',
        name: 'Qwen 2.5 1.5B',
        filename: 'qwen-2.5-1.5b-q4_k_m.gguf',
        size: '1.1 GB',
        sizeBytes: 1100000000,
        description: 'Primary — good reasoning, fast',
        url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    },
    {
        id: 'smollm2-360m',
        name: 'SmolLM2 360M',
        filename: 'smollm2-360m-q4_k_m.gguf',
        size: '250 MB',
        sizeBytes: 250000000,
        description: 'Instant simple queries',
        url: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q4_k_m.gguf',
    },
] as const;

export type ModelId = typeof AVAILABLE_MODELS[number]['id'];

class LLMServiceClass {
    private context: LlamaContext | null = null;
    private config: LLMConfig = DEFAULT_CONFIG;
    private isLoading: boolean = false;
    private loadedModel: string | null = null;

    /**
     * Check if a model exists locally
     */
    async modelExists(modelId: ModelId): Promise<boolean> {
        const model = AVAILABLE_MODELS.find(m => m.id === modelId);
        if (!model) return false;

        const modelPath = this.getModelPath(model.filename);
        return await RNFS.exists(modelPath);
    }

    /**
     * Get path to model file
     */
    getModelPath(filename: string): string {
        return `${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.MODELS}/${filename}`;
    }

    /**
     * List locally available models
     */
    async listLocalModels(): Promise<string[]> {
        const modelsDir = `${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.MODELS}`;

        try {
            const exists = await RNFS.exists(modelsDir);
            if (!exists) {
                await RNFS.mkdir(modelsDir);
                return [];
            }

            const files = await RNFS.readDir(modelsDir);
            return files
                .filter(f => f.name.endsWith('.gguf'))
                .map(f => f.name);
        } catch (error) {
            console.error('Failed to list models:', error);
            return [];
        }
    }

    /**
     * Download a model from HuggingFace
     */
    async downloadModel(
        modelId: ModelId,
        onProgress?: (progress: number) => void
    ): Promise<boolean> {
        const model = AVAILABLE_MODELS.find(m => m.id === modelId);
        if (!model) {
            console.error('Unknown model:', modelId);
            return false;
        }

        const modelPath = this.getModelPath(model.filename);
        const modelsDir = `${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.MODELS}`;

        try {
            // Ensure models directory exists
            const exists = await RNFS.exists(modelsDir);
            if (!exists) {
                await RNFS.mkdir(modelsDir);
            }

            // Download with progress
            const downloadResult = RNFS.downloadFile({
                fromUrl: model.url,
                toFile: modelPath,
                progress: (res) => {
                    const progress = res.bytesWritten / res.contentLength;
                    onProgress?.(progress);
                },
                progressInterval: 500,
            });

            const result = await downloadResult.promise;

            if (result.statusCode === 200) {
                console.log('Model downloaded:', modelPath);
                return true;
            } else {
                console.error('Download failed with status:', result.statusCode);
                return false;
            }
        } catch (error) {
            console.error('Failed to download model:', error);
            return false;
        }
    }

    /**
     * Load a model into memory
     */
    async loadModel(modelId: ModelId): Promise<boolean> {
        if (this.isLoading) {
            console.warn('Model already loading');
            return false;
        }

        const model = AVAILABLE_MODELS.find(m => m.id === modelId);
        if (!model) {
            console.error('Unknown model:', modelId);
            return false;
        }

        const modelPath = this.getModelPath(model.filename);

        // Check if model exists
        const exists = await RNFS.exists(modelPath);
        if (!exists) {
            console.error('Model file not found:', modelPath);
            return false;
        }

        this.isLoading = true;

        try {
            // Release previous context if any
            if (this.context) {
                await this.context.release();
                this.context = null;
            }

            // Initialize llama context
            this.context = await initLlama({
                model: `file://${modelPath}`,
                use_mlock: true,
                n_ctx: this.config.contextSize,
                n_gpu_layers: this.config.gpuLayers,
            });

            this.loadedModel = modelId;
            this.isLoading = false;

            console.log('Model loaded:', modelId);
            return true;
        } catch (error) {
            console.error('Failed to load model:', error);
            this.isLoading = false;
            return false;
        }
    }

    /**
     * Check if model is loaded
     */
    isModelLoaded(): boolean {
        return this.context !== null;
    }

    /**
     * Get loaded model ID
     */
    getLoadedModel(): string | null {
        return this.loadedModel;
    }

    /**
     * Run chat completion
     */
    async chat(
        messages: ChatMessage[],
        systemPrompt?: string,
        onToken?: (token: string) => void
    ): Promise<CompletionResult | null> {
        if (!this.context) {
            console.error('No model loaded');
            return null;
        }

        try {
            const formattedMessages = [
                ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
                ...messages.map(m => ({
                    role: m.role,
                    content: m.content,
                })),
            ];

            const startTime = Date.now();
            let tokenCount = 0;

            const result = await this.context.completion(
                {
                    messages: formattedMessages,
                    n_predict: 512,
                    stop: STOP_TOKENS,
                    temperature: 0.7,
                    top_p: 0.9,
                },
                (data) => {
                    tokenCount++;
                    if (data.token && onToken) {
                        onToken(data.token);
                    }
                }
            );

            const elapsed = (Date.now() - startTime) / 1000;

            return {
                text: result.text,
                tokensPerSecond: tokenCount / elapsed,
                totalTokens: tokenCount,
            };
        } catch (error) {
            console.error('Completion failed:', error);
            return null;
        }
    }

    /**
     * Run text completion (non-chat)
     */
    async complete(
        prompt: string,
        maxTokens: number = 256,
        onToken?: (token: string) => void
    ): Promise<CompletionResult | null> {
        if (!this.context) {
            console.error('No model loaded');
            return null;
        }

        try {
            const startTime = Date.now();
            let tokenCount = 0;

            const result = await this.context.completion(
                {
                    prompt,
                    n_predict: maxTokens,
                    stop: STOP_TOKENS,
                    temperature: 0.7,
                },
                (data) => {
                    tokenCount++;
                    if (data.token && onToken) {
                        onToken(data.token);
                    }
                }
            );

            const elapsed = (Date.now() - startTime) / 1000;

            return {
                text: result.text,
                tokensPerSecond: tokenCount / elapsed,
                totalTokens: tokenCount,
            };
        } catch (error) {
            console.error('Completion failed:', error);
            return null;
        }
    }

    /**
     * Release model from memory
     */
    async unloadModel(): Promise<void> {
        if (this.context) {
            await this.context.release();
            this.context = null;
            this.loadedModel = null;
            console.log('Model unloaded');
        }
    }

    /**
     * Get loading state
     */
    isLoadingModel(): boolean {
        return this.isLoading;
    }

    /**
     * Update config
     */
    setConfig(config: Partial<LLMConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

// Singleton export
export const LLMService = new LLMServiceClass();

export default LLMService;
