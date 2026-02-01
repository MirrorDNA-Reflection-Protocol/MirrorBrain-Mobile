/**
 * useOverlayOrchestrator Hook — Overlay + AI Integration
 *
 * Purpose: Connect floating overlay queries to OrchestratorService.
 * Handles query processing, intent parsing, and action execution.
 */

import { useEffect, useCallback, useRef } from 'react';
import {
    OverlayService,
    OrchestratorService,
    IntentParser,
    ActionExecutor,
    VaultService,
    IdentityService,
} from '../services';

const OVERLAY_SYSTEM_PROMPT = `You are MirrorBrain, a helpful AI assistant accessed via floating overlay.
Keep responses brief and actionable (2-3 sentences max).
If the user wants to perform an action, confirm what you'll do.
Be conversational but efficient - the user is multitasking.`;

interface UseOverlayOrchestratorOptions {
    enabled?: boolean;
    onResponse?: (response: string) => void;
    onError?: (error: string) => void;
}

export function useOverlayOrchestrator(options: UseOverlayOrchestratorOptions = {}) {
    const { enabled = true, onResponse, onError } = options;
    const isProcessing = useRef(false);

    const handleQuery = useCallback(async (query: string) => {
        if (isProcessing.current) {
            console.log('[useOverlayOrchestrator] Already processing, ignoring');
            return;
        }

        isProcessing.current = true;
        console.log('[useOverlayOrchestrator] Processing query:', query);

        try {
            // First, try to parse as an actionable intent
            const intent = IntentParser.parse(query);

            if (intent.type !== 'unknown' && intent.confidence > 0.6) {
                // Execute the action
                const result = await ActionExecutor.execute(intent);

                if (result.success) {
                    await OverlayService.setResponse(result.message);
                    onResponse?.(result.message);

                    // If there's a follow-up, show it
                    if (result.followUp) {
                        setTimeout(async () => {
                            await OverlayService.setResponse(
                                `${result.message}\n\n${result.followUp}`
                            );
                        }, 1500);
                    }
                } else {
                    // Action failed, pass to AI
                    await processWithAI(query);
                }
            } else {
                // Not a clear action, process with AI
                await processWithAI(query);
            }
        } catch (error) {
            console.error('[useOverlayOrchestrator] Error:', error);
            const errorMsg = 'Something went wrong. Please try again.';
            await OverlayService.setResponse(errorMsg);
            onError?.(errorMsg);
        } finally {
            isProcessing.current = false;
        }
    }, [onResponse, onError]);

    const processWithAI = async (query: string) => {
        // Build context
        let systemPrompt = OVERLAY_SYSTEM_PROMPT;

        // Add identity context if available
        const identityContext = IdentityService.getContext();
        if (identityContext) {
            systemPrompt += `\n\nUser context:\n${identityContext}`;
        }

        // Add relevant vault context
        try {
            const relevantNotes = await VaultService.search(query);
            if (relevantNotes.length > 0) {
                const context = relevantNotes.slice(0, 2).map(n =>
                    `[${n.title}]: ${n.content.slice(0, 150)}...`
                ).join('\n');
                systemPrompt += `\n\nRelevant memories:\n${context}`;
            }
        } catch {
            // Vault search failed, continue without context
        }

        // Show loading state
        await OverlayService.setPulse(true);

        try {
            const result = await OrchestratorService.run(
                query,
                systemPrompt,
                undefined, // onThought
                undefined, // onAction
                undefined, // onToken
            );

            const response = result.finalAnswer || "I'm not sure how to help with that.";
            await OverlayService.setResponse(response);
            onResponse?.(response);
        } finally {
            await OverlayService.setPulse(false);
        }
    };

    const handleQuickAction = useCallback(async (action: string) => {
        console.log('[useOverlayOrchestrator] Quick action:', action);

        switch (action) {
            case 'capture':
                // Note capture is handled by native code
                await OverlayService.setResponse('Opening voice capture...');
                break;
            case 'calendar':
                await handleQuery('What\'s on my calendar today?');
                break;
            case 'notes':
                await handleQuery('Show me my recent notes');
                break;
            default:
                await handleQuery(`Help me with ${action}`);
        }
    }, [handleQuery]);

    useEffect(() => {
        if (!enabled) return;

        // Subscribe to overlay events
        const unsubQuery = OverlayService.onQuery(async (event) => {
            await handleQuery(event.query);
        });

        const unsubAction = OverlayService.onQuickAction(async (event) => {
            await handleQuickAction(event.action);
        });

        return () => {
            unsubQuery();
            unsubAction();
        };
    }, [enabled, handleQuery, handleQuickAction]);

    return {
        processQuery: handleQuery,
        processQuickAction: handleQuickAction,
    };
}
