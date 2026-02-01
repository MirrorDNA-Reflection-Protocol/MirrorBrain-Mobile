/**
 * Ollama Service — Remote LLM via Mac
 *
 * Connects to Ollama running on the local network for smarter inference.
 * The phone becomes the hands, Mac becomes the brain.
 */

// Configuration - update this to your Mac's IP
const OLLAMA_HOST = '192.168.0.112';
const OLLAMA_PORT = 11434;
const OLLAMA_MODEL = 'qwen2.5:7b';

interface OllamaResponse {
    model: string;
    response: string;
    done: boolean;
}

interface OllamaGenerateRequest {
    model: string;
    prompt: string;
    stream: false;
    options?: {
        temperature?: number;
        num_predict?: number;
        stop?: string[];
    };
}

class OllamaServiceClass {
    private baseUrl: string;
    private model: string;
    private isAvailable: boolean = false;

    constructor() {
        this.baseUrl = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;
        this.model = OLLAMA_MODEL;
    }

    /**
     * Check if Ollama is reachable
     */
    async checkConnection(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            this.isAvailable = response.ok;
            if (this.isAvailable) {
                console.log('[Ollama] Connected to', this.baseUrl);
            }
            return this.isAvailable;
        } catch (error) {
            console.log('[Ollama] Not reachable:', error);
            this.isAvailable = false;
            return false;
        }
    }

    /**
     * Generate completion from Ollama
     */
    async generate(prompt: string, maxTokens: number = 512): Promise<string | null> {
        try {
            const request: OllamaGenerateRequest = {
                model: this.model,
                prompt,
                stream: false,
                options: {
                    temperature: 0.7,
                    num_predict: maxTokens,
                    stop: ['OBSERVATION:', '\n\nUser:', '\n\nHuman:'],
                },
            };

            console.log('[Ollama] Generating with', this.model);
            const startTime = Date.now();

            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                console.error('[Ollama] Generate failed:', response.status);
                return null;
            }

            const data: OllamaResponse = await response.json();
            const elapsed = Date.now() - startTime;
            console.log(`[Ollama] Generated in ${elapsed}ms`);

            return data.response;
        } catch (error) {
            console.error('[Ollama] Generate error:', error);
            return null;
        }
    }

    /**
     * Chat completion (for conversational context)
     */
    async chat(
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        maxTokens: number = 512
    ): Promise<string | null> {
        try {
            console.log('[Ollama] Chat with', messages.length, 'messages');
            const startTime = Date.now();

            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages,
                    stream: false,
                    options: {
                        temperature: 0.7,
                        num_predict: maxTokens,
                    },
                }),
            });

            if (!response.ok) {
                console.error('[Ollama] Chat failed:', response.status);
                return null;
            }

            const data = await response.json();
            const elapsed = Date.now() - startTime;
            console.log(`[Ollama] Chat completed in ${elapsed}ms`);

            return data.message?.content || null;
        } catch (error) {
            console.error('[Ollama] Chat error:', error);
            return null;
        }
    }

    /**
     * Set the model to use
     */
    setModel(model: string): void {
        this.model = model;
        console.log('[Ollama] Model set to', model);
    }

    /**
     * Set the host (for dynamic configuration)
     */
    setHost(host: string, port: number = 11434): void {
        this.baseUrl = `http://${host}:${port}`;
        console.log('[Ollama] Host set to', this.baseUrl);
    }

    /**
     * Check if available
     */
    isReady(): boolean {
        return this.isAvailable;
    }

    /**
     * Get current config
     */
    getConfig(): { host: string; model: string; available: boolean } {
        return {
            host: this.baseUrl,
            model: this.model,
            available: this.isAvailable,
        };
    }
}

export const OllamaService = new OllamaServiceClass();
export default OllamaService;
