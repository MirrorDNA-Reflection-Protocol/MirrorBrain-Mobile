/**
 * useSessionRestore Hook — Session Continuity
 *
 * Purpose: React hook for session restore functionality.
 * Shows restore prompt when previous session exists.
 */

import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { SessionService, SessionData, SessionMetadata } from '../services/session.service';
import type { ChatMessage, AskMode } from '../types';

export interface SessionRestoreState {
    /** Whether there's a session available to restore */
    hasSession: boolean;
    /** Session metadata for displaying restore prompt */
    metadata: SessionMetadata | null;
    /** Time since last update (human-readable) */
    timeSince: string | null;
    /** Loading state */
    isLoading: boolean;
    /** Whether restore prompt should be shown */
    showRestorePrompt: boolean;
}

export interface SessionRestoreActions {
    /** Restore the previous session */
    restoreSession: () => Promise<{ messages: ChatMessage[]; mode: AskMode } | null>;
    /** Dismiss the restore prompt and start fresh */
    dismissRestore: () => Promise<void>;
    /** Save current session state */
    saveSession: (messages: ChatMessage[], mode: AskMode) => void;
    /** Clear the current session */
    clearSession: () => Promise<void>;
}

export function useSessionRestore(): [SessionRestoreState, SessionRestoreActions] {
    const [hasSession, setHasSession] = useState(false);
    const [metadata, setMetadata] = useState<SessionMetadata | null>(null);
    const [timeSince, setTimeSince] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showRestorePrompt, setShowRestorePrompt] = useState(false);

    // Check for existing session on mount
    useEffect(() => {
        const checkSession = async () => {
            setIsLoading(true);
            try {
                const meta = await SessionService.getSessionMetadata();
                const has = meta?.hasActiveSession ?? false;
                setHasSession(has);
                setMetadata(meta);

                if (has) {
                    const time = await SessionService.getTimeSinceLastUpdate();
                    setTimeSince(time);
                    setShowRestorePrompt(true);
                }
            } catch (error) {
                console.error('[useSessionRestore] Check failed:', error);
            } finally {
                setIsLoading(false);
            }
        };

        checkSession();

        // Start auto-save
        SessionService.startAutoSave(30000);

        return () => {
            SessionService.stopAutoSave();
        };
    }, []);

    // Handle app state changes (save on background)
    useEffect(() => {
        const handleAppStateChange = (nextState: AppStateStatus) => {
            if (nextState === 'background' || nextState === 'inactive') {
                SessionService.forceSave();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
        };
    }, []);

    const restoreSession = useCallback(async (): Promise<{ messages: ChatMessage[]; mode: AskMode } | null> => {
        try {
            const session = await SessionService.loadSession();
            if (session) {
                setShowRestorePrompt(false);
                return {
                    messages: session.messages,
                    mode: session.mode as AskMode,
                };
            }
            return null;
        } catch (error) {
            console.error('[useSessionRestore] Restore failed:', error);
            return null;
        }
    }, []);

    const dismissRestore = useCallback(async (): Promise<void> => {
        setShowRestorePrompt(false);
        await SessionService.clearSession();
        setHasSession(false);
        setMetadata(null);
    }, []);

    const saveSession = useCallback((messages: ChatMessage[], mode: AskMode): void => {
        const session: SessionData = {
            messages,
            mode,
            lastUpdated: new Date().toISOString(),
        };
        SessionService.updatePendingSession(session);

        // Update local state
        if (messages.length > 0) {
            setHasSession(true);
        }
    }, []);

    const clearSession = useCallback(async (): Promise<void> => {
        await SessionService.clearSession();
        setHasSession(false);
        setMetadata(null);
        setShowRestorePrompt(false);
    }, []);

    const state: SessionRestoreState = {
        hasSession,
        metadata,
        timeSince,
        isLoading,
        showRestorePrompt,
    };

    const actions: SessionRestoreActions = {
        restoreSession,
        dismissRestore,
        saveSession,
        clearSession,
    };

    return [state, actions];
}
