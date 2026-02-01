/**
 * Orchestrator Service — Chrysalis V2 Agent Brain
 * 
 * ReAct loop: Think → Act → Observe → Repeat
 * 
 * Design:
 * - Tool-agnostic: works with any device that registers tools
 * - LLM-agnostic: uses injected inference function
 * - Transport-agnostic: local tools or remote via A2A
 * - Failure-resilient: retries with backoff, graceful degradation
 * - Context-aware: manages token budget, prunes history
 */

import { LLMService } from './llm.service';
import { OllamaService } from './ollama.service';
import type { ChatMessage } from '../types';

// Tool definition — matches MCP schema for future interop
export interface Tool {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
            enum?: string[];
        }>;
        required?: string[];
    };
    execute: (params: Record<string, unknown>) => Promise<ToolResult>;
    source?: 'local' | 'remote';
    deviceId?: string;
    requiresNetwork?: boolean;
    maxRetries?: number;
    timeoutMs?: number;
}

export interface ToolResult {
    success: boolean;
    data?: unknown;
    error?: string;
    retryable?: boolean;
}

export interface OrchestrationResult {
    thought: string;
    action?: { tool: string; params: Record<string, unknown> };
    observation?: string;
    finalAnswer?: string;
    tokensUsed: number;
    iterations: number;
    failedTools: string[];
}

interface ToolFailure {
    tool: string;
    attempts: number;
    lastError: string;
    backoffUntil: number;
}

// Context management constants
const MAX_CONTEXT_TOKENS = 1800; // Leave buffer for Qwen's 2048 limit
const MAX_HISTORY_MESSAGES = 10;
const CHARS_PER_TOKEN_ESTIMATE = 4;

// ReAct prompt — compact to save tokens
const REACT_SYSTEM_PROMPT = `You are MirrorBrain, a personal agent on the user's device.

Tools:
{tools}

Format:
THOUGHT: [reasoning]
ACTION: [tool_name] {"param": "value"}
or
THOUGHT: [reasoning]
ANSWER: [response]

Rules: One action per turn. Be concise. If a tool fails twice, answer without it.`;

// Support both JSON params and function-call style: ACTION: tool_name {"x":1} OR ACTION: tool_name() OR ACTION: tool_name
const ACTION_REGEX_JSON = /ACTION:\s*(\w+)\s*(\{[\s\S]*?\})/;
const ACTION_REGEX_PAREN = /ACTION:\s*(\w+)\s*\(\s*\)/;
const ACTION_REGEX_BARE = /ACTION:\s*(\w+)(?:\s|$)/;
const THOUGHT_REGEX = /THOUGHT:\s*([\s\S]*?)(?=ACTION:|ANSWER:|$)/;
const ANSWER_REGEX = /ANSWER:\s*([\s\S]*?)$/;

class OrchestratorServiceClass {
    private tools: Map<string, Tool> = new Map();
    private maxIterations: number = 6; // More iterations for better reasoning
    private history: ChatMessage[] = [];
    private toolFailures: Map<string, ToolFailure> = new Map();
    private isOnline: boolean = true;
    private useOllama: boolean = true; // Prefer Ollama for smarter inference
    private ollamaChecked: boolean = false;

    /**
     * Set network status
     */
    setNetworkStatus(online: boolean): void {
        this.isOnline = online;
    }

    /**
     * Initialize Ollama connection
     */
    async initOllama(): Promise<boolean> {
        if (this.ollamaChecked) return OllamaService.isReady();
        this.ollamaChecked = true;
        const available = await OllamaService.checkConnection();
        console.log('[Orchestrator] Ollama available:', available);
        return available;
    }

    /**
     * Set whether to prefer Ollama
     */
    setUseOllama(use: boolean): void {
        this.useOllama = use;
        console.log('[Orchestrator] Use Ollama:', use);
    }

    /**
     * Register a tool
     */
    registerTool(tool: Tool): void {
        this.tools.set(tool.name, {
            maxRetries: 2,
            timeoutMs: 5000,
            requiresNetwork: false,
            ...tool,
        });
        console.log(`[Orchestrator] Tool registered: ${tool.name}`);
    }

    /**
     * Register multiple tools
     */
    registerTools(tools: Tool[]): void {
        tools.forEach(t => this.registerTool(t));
    }

    /**
     * Unregister a tool
     */
    unregisterTool(name: string): void {
        this.tools.delete(name);
        this.toolFailures.delete(name);
    }

    /**
     * List available tools (excludes network tools when offline)
     */
    listTools(): Tool[] {
        return Array.from(this.tools.values()).filter(t => {
            if (t.requiresNetwork && !this.isOnline) return false;
            return true;
        });
    }

    /**
     * Estimate token count for a string
     */
    private estimateTokens(text: string): number {
        return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
    }

    /**
     * Prune history to fit context window
     */
    private pruneHistory(): void {
        // Keep last N messages
        if (this.history.length > MAX_HISTORY_MESSAGES) {
            this.history = this.history.slice(-MAX_HISTORY_MESSAGES);
        }

        // Check token budget
        let totalTokens = this.estimateTokens(this.buildSystemPrompt());
        const prunedHistory: ChatMessage[] = [];

        // Add messages from newest to oldest until budget exhausted
        for (let i = this.history.length - 1; i >= 0; i--) {
            const msgTokens = this.estimateTokens(this.history[i].content);
            if (totalTokens + msgTokens > MAX_CONTEXT_TOKENS) break;
            totalTokens += msgTokens;
            prunedHistory.unshift(this.history[i]);
        }

        this.history = prunedHistory;
    }

    /**
     * Build system prompt with available tool descriptions
     */
    private buildSystemPrompt(prefix?: string): string {
        const availableTools = this.listTools();
        const failedToolNames = new Set(
            Array.from(this.toolFailures.values())
                .filter(f => f.attempts >= (this.tools.get(f.tool)?.maxRetries || 2))
                .map(f => f.tool)
        );

        const toolDescriptions = availableTools
            .filter(t => !failedToolNames.has(t.name))
            .map(t => {
                const params = Object.entries(t.parameters.properties)
                    .map(([k, v]) => `${k}:${v.type}`)
                    .join(', ');
                return `• ${t.name}(${params}): ${t.description}`;
            })
            .join('\n');

        const basePrompt = REACT_SYSTEM_PROMPT.replace('{tools}', toolDescriptions || 'None');
        return prefix ? `${prefix}\n\n${basePrompt}` : basePrompt;
    }

    /**
     * Parse LLM response for thought/action/answer
     * Priority: If ACTION is present, ignore ANSWER (it's likely hallucinated)
     */
    private parseResponse(text: string): {
        thought?: string;
        action?: { tool: string; params: Record<string, unknown> };
        answer?: string;
    } {
        const thoughtMatch = text.match(THOUGHT_REGEX);
        const answerMatch = text.match(ANSWER_REGEX);

        // Try multiple action formats
        let action: { tool: string; params: Record<string, unknown> } | undefined;

        // Try JSON params first: ACTION: tool_name {"param": "value"}
        const jsonMatch = text.match(ACTION_REGEX_JSON);
        if (jsonMatch) {
            try {
                action = {
                    tool: jsonMatch[1],
                    params: JSON.parse(jsonMatch[2]),
                };
            } catch {
                console.warn('[Orchestrator] Failed to parse JSON action params');
            }
        }

        // Try parenthesis format: ACTION: tool_name()
        if (!action) {
            const parenMatch = text.match(ACTION_REGEX_PAREN);
            if (parenMatch) {
                action = {
                    tool: parenMatch[1],
                    params: {},
                };
            }
        }

        // Try bare format: ACTION: tool_name
        if (!action) {
            const bareMatch = text.match(ACTION_REGEX_BARE);
            if (bareMatch) {
                action = {
                    tool: bareMatch[1],
                    params: {},
                };
            }
        }

        // If there's an ACTION, ignore any ANSWER (it's hallucinated without tool result)
        return {
            thought: thoughtMatch?.[1]?.trim(),
            action,
            answer: action ? undefined : answerMatch?.[1]?.trim(),
        };
    }

    /**
     * Check if tool is in backoff period
     */
    private isToolInBackoff(toolName: string): boolean {
        const failure = this.toolFailures.get(toolName);
        if (!failure) return false;
        return Date.now() < failure.backoffUntil;
    }

    /**
     * Record tool failure and calculate backoff
     */
    private recordToolFailure(toolName: string, error: string): void {
        const existing = this.toolFailures.get(toolName);
        const attempts = (existing?.attempts || 0) + 1;
        const backoffMs = Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30s

        this.toolFailures.set(toolName, {
            tool: toolName,
            attempts,
            lastError: error,
            backoffUntil: Date.now() + backoffMs,
        });
    }

    /**
     * Clear tool failure record on success
     */
    private clearToolFailure(toolName: string): void {
        this.toolFailures.delete(toolName);
    }

    /**
     * Find closest matching tool name (handles LLM typos)
     */
    private findTool(name: string): Tool | undefined {
        // Exact match first
        if (this.tools.has(name)) {
            return this.tools.get(name);
        }

        // Fuzzy match - find tool that starts with or contains the name
        const lowerName = name.toLowerCase();
        for (const [toolName, tool] of this.tools) {
            // Check if tool name starts with the input or input starts with tool name
            if (toolName.startsWith(lowerName) || lowerName.startsWith(toolName.replace('get_', 'ge_'))) {
                console.log(`[Orchestrator] Fuzzy matched "${name}" to "${toolName}"`);
                return tool;
            }
            // Check edit distance for close matches (1-2 char difference)
            if (this.isCloseName(name, toolName)) {
                console.log(`[Orchestrator] Close match "${name}" to "${toolName}"`);
                return tool;
            }
        }
        return undefined;
    }

    /**
     * Check if two names are within 2 character edits
     */
    private isCloseName(a: string, b: string): boolean {
        if (Math.abs(a.length - b.length) > 2) return false;
        let diff = 0;
        const longer = a.length >= b.length ? a : b;
        const shorter = a.length < b.length ? a : b;
        for (let i = 0; i < longer.length && diff <= 2; i++) {
            if (shorter[i] !== longer[i]) diff++;
        }
        return diff <= 2;
    }

    /**
     * Clean raw LLM response - strip THOUGHT/ACTION prefixes for user display
     */
    private cleanResponse(text: string): string {
        // Remove THOUGHT: prefix and content
        let cleaned = text.replace(/THOUGHT:\s*[\s\S]*?(?=ACTION:|ANSWER:|$)/gi, '').trim();
        // Remove ACTION: prefix and content
        cleaned = cleaned.replace(/ACTION:\s*\w+\s*\{[\s\S]*?\}/gi, '').trim();
        cleaned = cleaned.replace(/ACTION:\s*\w+\s*\(\s*\)/gi, '').trim();
        // Extract ANSWER: content if present
        const answerMatch = cleaned.match(/ANSWER:\s*([\s\S]*)/i);
        if (answerMatch) {
            return answerMatch[1].trim();
        }
        // If nothing meaningful left, return a fallback
        if (!cleaned || cleaned.length < 10) {
            return "I'm working on that. Please try again.";
        }
        return cleaned;
    }

    /**
     * Execute a tool with timeout and retry logic
     */
    private async executeTool(
        toolName: string,
        params: Record<string, unknown>
    ): Promise<ToolResult> {
        const tool = this.findTool(toolName);

        if (!tool) {
            return { success: false, error: `Unknown tool: ${toolName}`, retryable: false };
        }

        // Check network requirement
        if (tool.requiresNetwork && !this.isOnline) {
            return { success: false, error: 'Network unavailable', retryable: true };
        }

        // Check backoff
        if (this.isToolInBackoff(toolName)) {
            const failure = this.toolFailures.get(toolName)!;
            return {
                success: false,
                error: `Tool in backoff: ${failure.lastError}`,
                retryable: false
            };
        }

        // Check max retries exceeded
        const failure = this.toolFailures.get(toolName);
        if (failure && failure.attempts >= (tool.maxRetries || 2)) {
            return {
                success: false,
                error: `Max retries exceeded: ${failure.lastError}`,
                retryable: false
            };
        }

        try {
            // Execute with timeout
            const timeoutPromise = new Promise<ToolResult>((_, reject) => {
                setTimeout(() => reject(new Error('Timeout')), tool.timeoutMs || 5000);
            });

            const result = await Promise.race([
                tool.execute(params),
                timeoutPromise,
            ]);

            if (result.success) {
                this.clearToolFailure(toolName);
            } else if (result.retryable !== false) {
                this.recordToolFailure(toolName, result.error || 'Unknown error');
            }

            return result;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Execution failed';
            this.recordToolFailure(toolName, errorMsg);
            return { success: false, error: errorMsg, retryable: true };
        }
    }

    /**
     * Get list of tools that have exceeded retry limits
     */
    private getExhaustedTools(): string[] {
        return Array.from(this.toolFailures.values())
            .filter(f => f.attempts >= (this.tools.get(f.tool)?.maxRetries || 2))
            .map(f => f.tool);
    }

    /**
     * Run the ReAct loop
     */
    async run(
        userMessage: string,
        systemPromptPrefix?: string,
        onThought?: (thought: string) => void,
        onAction?: (action: string, params: Record<string, unknown>) => void,
        onToken?: (token: string) => void
    ): Promise<OrchestrationResult> {
        // Check for Ollama first (smarter brain on Mac)
        const ollamaAvailable = this.useOllama && await this.initOllama();

        // Fall back to local LLM if Ollama not available
        if (!ollamaAvailable && !LLMService.isModelLoaded()) {
            return {
                thought: 'No model loaded',
                finalAnswer: 'I need a model loaded to help you. Or connect to your Mac running Ollama.',
                tokensUsed: 0,
                iterations: 0,
                failedTools: [],
            };
        }

        console.log('[Orchestrator] Using:', ollamaAvailable ? 'Ollama (Mac)' : 'Local LLM');

        // Prune history before starting
        this.pruneHistory();

        let totalTokens = 0;
        let iterations = 0;

        // Add user message to history
        this.history.push({
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
        });

        // Working messages for this run (may include observations not saved to history)
        const messages: ChatMessage[] = [...this.history];

        while (iterations < this.maxIterations) {
            iterations++;

            // Rebuild system prompt (excludes exhausted tools)
            const systemPrompt = this.buildSystemPrompt(systemPromptPrefix);

            // Get LLM response (Ollama or local)
            let responseText: string | null = null;

            if (ollamaAvailable) {
                // Use Ollama on Mac for smarter inference
                const ollamaMessages = [
                    { role: 'system' as const, content: systemPrompt },
                    ...messages.map(m => ({
                        role: m.role as 'user' | 'assistant',
                        content: m.content,
                    })),
                ];
                responseText = await OllamaService.chat(ollamaMessages, 1024);
                totalTokens += responseText ? Math.ceil(responseText.length / 4) : 0;
            } else {
                // Use local LLM
                const result = await LLMService.chat(messages, systemPrompt, onToken);
                if (result) {
                    responseText = result.text;
                    totalTokens += result.totalTokens;
                }
            }

            if (!responseText) {
                return {
                    thought: 'LLM failed to respond',
                    finalAnswer: 'Something went wrong with my thinking.',
                    tokensUsed: totalTokens,
                    iterations,
                    failedTools: this.getExhaustedTools(),
                };
            }

            console.log(`[Orchestrator] LLM output (iter ${iterations}):`, responseText.slice(0, 200));
            const parsed = this.parseResponse(responseText);
            console.log(`[Orchestrator] Parsed:`, JSON.stringify({ thought: !!parsed.thought, action: parsed.action?.tool, answer: !!parsed.answer }));

            if (parsed.thought) {
                onThought?.(parsed.thought);
            }

            // Final answer — done
            if (parsed.answer) {
                this.history.push({
                    role: 'assistant',
                    content: parsed.answer,
                    timestamp: new Date(),
                });

                return {
                    thought: parsed.thought || '',
                    finalAnswer: parsed.answer,
                    tokensUsed: totalTokens,
                    iterations,
                    failedTools: this.getExhaustedTools(),
                };
            }

            // Action requested
            if (parsed.action) {
                console.log(`[Orchestrator] Executing tool: ${parsed.action.tool}`);
                onAction?.(parsed.action.tool, parsed.action.params);

                const toolResult = await this.executeTool(
                    parsed.action.tool,
                    parsed.action.params
                );
                console.log(`[Orchestrator] Tool result:`, toolResult.success ? 'success' : toolResult.error);

                // Use formatted response if available, otherwise JSON data
                const observation = toolResult.success
                    ? ((toolResult as any).formatted || JSON.stringify(toolResult.data)).slice(0, 500)
                    : `Error: ${toolResult.error}`;

                // Add to working context (not permanent history)
                messages.push({
                    role: 'assistant',
                    content: `THOUGHT: ${parsed.thought || ''}\nACTION: ${parsed.action.tool} ${JSON.stringify(parsed.action.params)}`,
                    timestamp: new Date(),
                });
                messages.push({
                    role: 'user',
                    content: `OBSERVATION: ${observation}`,
                    timestamp: new Date(),
                });

                continue;
            }

            // No action or answer — clean up raw response for display
            const cleanedAnswer = this.cleanResponse(responseText);
            this.history.push({
                role: 'assistant',
                content: cleanedAnswer,
                timestamp: new Date(),
            });

            return {
                thought: parsed.thought || '',
                finalAnswer: cleanedAnswer,
                tokensUsed: totalTokens,
                iterations,
                failedTools: this.getExhaustedTools(),
            };
        }

        // Max iterations — graceful exit
        const exhaustedTools = this.getExhaustedTools();
        const failureNote = exhaustedTools.length > 0
            ? ` (${exhaustedTools.join(', ')} unavailable)`
            : '';

        return {
            thought: 'Max iterations reached',
            finalAnswer: `I couldn't complete that in time${failureNote}. Try a simpler request.`,
            tokensUsed: totalTokens,
            iterations,
            failedTools: exhaustedTools,
        };
    }

    /**
     * Clear conversation history
     */
    clearHistory(): void {
        this.history = [];
    }

    /**
     * Get conversation history
     */
    getHistory(): ChatMessage[] {
        return [...this.history];
    }

    /**
     * Set max iterations for ReAct loop
     */
    setMaxIterations(max: number): void {
        this.maxIterations = Math.min(max, 6); // Cap at 6 to protect context
    }

    /**
     * Reset all tool failures (e.g., when network restored)
     */
    resetToolFailures(): void {
        this.toolFailures.clear();
    }

    /**
     * Get current failure status for debugging
     */
    getToolStatus(): Record<string, { available: boolean; failures: number; error?: string }> {
        const status: Record<string, { available: boolean; failures: number; error?: string }> = {};

        for (const [name, tool] of this.tools) {
            const failure = this.toolFailures.get(name);
            const maxRetries = tool.maxRetries || 2;

            status[name] = {
                available: !failure || failure.attempts < maxRetries,
                failures: failure?.attempts || 0,
                error: failure?.lastError,
            };
        }

        return status;
    }
}

// Singleton export
export const OrchestratorService = new OrchestratorServiceClass();

export default OrchestratorService;
