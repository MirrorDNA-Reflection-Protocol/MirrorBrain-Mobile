/**
 * LLM Service — Local Inference via ExecuTorch
 * Migrated from llama.rn for TPU/GPU acceleration
 * 
 * Recommended Model Stack:
 * - Llama 3.2 1B — Fast, good quality
 * - Llama 3.2 3B — Best quality (16GB RAM)
 * 
 * Performance Targets (Pixel 9 Pro XL with ExecuTorch):
 * - First token: Under 300ms
 * - Sustained: 15-25 tokens/second
 */

import RNFS from 'react-native-fs';
import { STORAGE_PATHS } from './vault.service';
import type { LLMConfig, CompletionResult, ChatMessage } from '../types';

// Model info for ExecuTorch PTE format
export const AVAILABLE_MODELS = [
    {
        id: 'llama-3.2-1b',
        name: 'Llama 3.2 1B',
        filename: 'llama-3.2-1b.pte',
        tokenizerFilename: 'llama-3.2-1b-tokenizer.bin',
        size: '1.3 GB',
        sizeBytes: 1300000000,
        description: 'Fast — good for quick responses',
        url: 'https://huggingface.co/software-mansion/react-native-executorch-llama-3.2-1b/resolve/main/llama3_2_1b_spinquant.pte',
        tokenizerUrl: 'https://huggingface.co/software-mansion/react-native-executorch-llama-3.2-1b/resolve/main/tokenizer.bin',
    },
    {
        id: 'llama-3.2-3b',
        name: 'Llama 3.2 3B',
        filename: 'llama-3.2-3b.pte',
        tokenizerFilename: 'llama-3.2-3b-tokenizer.bin',
        size: '2.8 GB',
        sizeBytes: 2800000000,
        description: 'Smarter — best quality',
        url: 'https://huggingface.co/software-mansion/react-native-executorch-llama-3.2-3b/resolve/main/llama3_2_3b_spinquant.pte',
        tokenizerUrl: 'https://huggingface.co/software-mansion/react-native-executorch-llama-3.2-3b/resolve/main/tokenizer.bin',
    },
] as const;

export type ModelId = typeof AVAILABLE_MODELS[number]['id'];

const DEFAULT_CONFIG: LLMConfig = {
    modelPath: '',
    contextSize: 2048,
    gpuLayers: 99,
};

class LLMServiceClass {
    private llmInstance: any = null;
    private config: LLMConfig = DEFAULT_CONFIG;
    private isLoading: boolean = false;
    private loadedModel: string | null = null;
    private currentResponse: string = '';
    private tokenCallback: ((token: string) => void) | null = null;

    async modelExists(modelId: ModelId): Promise<boolean> {
        const model = AVAILABLE_MODELS.find(m => m.id === modelId);
        if (!model) return false;
        const modelPath = this.getModelPath(model.filename);
        const tokenizerPath = this.getModelPath(model.tokenizerFilename);
        return (await RNFS.exists(modelPath)) && (await RNFS.exists(tokenizerPath));
    }

    getModelPath(filename: string): string {
        return `${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.MODELS}/${filename}`;
    }

    async listLocalModels(): Promise<string[]> {
        const modelsDir = `${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.MODELS}`;
        try {
            if (!(await RNFS.exists(modelsDir))) {
                await RNFS.mkdir(modelsDir);
                return [];
            }
            const files = await RNFS.readDir(modelsDir);
            return files.filter(f => f.name.endsWith('.pte')).map(f => f.name);
        } catch (error) {
            console.error('Failed to list models:', error);
            return [];
        }
    }

    async downloadModel(
        modelId: ModelId,
        onProgress?: (progress: number) => void
    ): Promise<boolean> {
        const model = AVAILABLE_MODELS.find(m => m.id === modelId);
        if (!model) return false;

        const modelPath = this.getModelPath(model.filename);
        const tokenizerPath = this.getModelPath(model.tokenizerFilename);
        const modelsDir = `${STORAGE_PATHS.ROOT}/${STORAGE_PATHS.MODELS}`;

        try {
            if (!(await RNFS.exists(modelsDir))) {
                await RNFS.mkdir(modelsDir);
            }

            console.log(`Starting download for ${model.name}...`);

            // Helper to download a single file
            const downloadFile = async (url: string, dest: string, weight: number, offset: number) => {
                let lastProgress = 0;
                const result = await RNFS.downloadFile({
                    fromUrl: url,
                    toFile: dest,
                    progress: (res) => {
                        const dlProgress = res.bytesWritten / res.contentLength;
                        if (dlProgress - lastProgress > 0.01) {
                            lastProgress = dlProgress;
                            // Calculate total progress: offset + (this_file_progress * this_file_weight)
                            onProgress?.(offset + (dlProgress * weight));
                        }
                    },
                    begin: (res) => {
                        console.log(`Download started: ${url} (${res.contentLength} bytes)`);
                    }
                }).promise;
                return result.statusCode === 200;
            };

            // Download Tokenizer (small, 1% weight)
            console.log('Downloading tokenizer...');
            const tokSuccess = await downloadFile(model.tokenizerUrl, tokenizerPath, 0.01, 0);
            if (!tokSuccess) throw new Error('Tokenizer download failed');

            // Download Model (large, 99% weight)
            console.log('Downloading model...');
            const modelSuccess = await downloadFile(model.url, modelPath, 0.99, 0.01);
            if (!modelSuccess) throw new Error('Model download failed');

            onProgress?.(1.0); // Ensure 100%
            console.log('Download complete.');
            return true;
        } catch (error) {
            console.error('Download failed:', error);
            // Cleanup on failure
            try {
                if (await RNFS.exists(modelPath)) await RNFS.unlink(modelPath);
                if (await RNFS.exists(tokenizerPath)) await RNFS.unlink(tokenizerPath);
            } catch (e) { /* ignore */ }
            return false;
        }
    }

    async loadModel(modelId: ModelId): Promise<boolean> {
        if (this.isLoading) return false;

        const model = AVAILABLE_MODELS.find(m => m.id === modelId);
        if (!model) return false;

        this.isLoading = true;

        try {
            const { LLMModule } = await import('react-native-executorch');

            if (this.llmInstance) {
                await this.unloadModel();
            }

            this.llmInstance = new LLMModule({
                tokenCallback: (token) => {
                    this.currentResponse += token;
                    this.tokenCallback?.(token);
                }
            });

            const modelPath = this.getModelPath(model.filename);
            const tokenizerPath = this.getModelPath(model.tokenizerFilename);

            await this.llmInstance.load({
                modelSource: `file://${modelPath}`,
                tokenizerSource: `file://${tokenizerPath}`,
            });

            this.loadedModel = modelId;
            this.isLoading = false;
            console.log('ExecuTorch model loaded:', modelId);
            return true;
        } catch (error) {
            console.error('Load failed:', error);
            this.isLoading = false;
            return false;
        }
    }

    isModelLoaded(): boolean {
        return this.llmInstance !== null;
    }

    getLoadedModel(): string | null {
        return this.loadedModel;
    }

    async chat(
        messages: ChatMessage[],
        systemPrompt?: string,
        onToken?: (token: string) => void
    ): Promise<CompletionResult | null> {
        if (!this.llmInstance) return null;

        try {
            this.currentResponse = '';
            this.tokenCallback = onToken || null;

            const startTime = Date.now();

            // Format messages for ExecuTorch LLMModule
            const etMessages = [
                ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
                ...messages.map(m => ({ role: m.role as any, content: m.content }))
            ];

            const response = await this.llmInstance.generate(etMessages);
            const elapsed = (Date.now() - startTime) / 1000;
            const tokenCount = this.currentResponse.length / 4; // Rough estimate if not tracked

            return {
                text: response,
                tokensPerSecond: tokenCount / elapsed,
                totalTokens: Math.round(tokenCount),
            };
        } catch (error) {
            console.error('Chat failed:', error);
            return null;
        } finally {
            this.tokenCallback = null;
        }
    }

    async complete(
        prompt: string,
        maxTokens: number = 256,
        onToken?: (token: string) => void
    ): Promise<CompletionResult | null> {
        if (!this.llmInstance) return null;

        try {
            this.currentResponse = '';
            this.tokenCallback = onToken || null;
            const startTime = Date.now();

            // Use forward for single prompt completion if generate feels too chat-centric
            // or just use generate with a single user message.
            const response = await this.llmInstance.forward(prompt);
            const elapsed = (Date.now() - startTime) / 1000;
            const tokenCount = this.currentResponse.length / 4;

            return {
                text: response,
                tokensPerSecond: tokenCount / elapsed,
                totalTokens: Math.round(tokenCount),
            };
        } catch (error) {
            console.error('Complete failed:', error);
            return null;
        } finally {
            this.tokenCallback = null;
        }
    }

    async unloadModel(): Promise<void> {
        if (this.llmInstance) {
            await this.llmInstance.delete();
            this.llmInstance = null;
            this.loadedModel = null;
            console.log('Model unloaded');
        }
    }

    isLoadingModel(): boolean {
        return this.isLoading;
    }

    setConfig(config: Partial<LLMConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

export const LLMService = new LLMServiceClass();
export default LLMService;
