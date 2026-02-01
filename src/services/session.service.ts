/**
 * Session Service — Session Continuity
 *
 * Purpose: Persist chat sessions and enable "where we left off" restore.
 * Sessions auto-save periodically and on app backgrounding.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage } from '../types';

const SESSION_STORAGE_KEY = '@mirrorbrain/active_session';
const SESSION_METADATA_KEY = '@mirrorbrain/session_metadata';

export interface SessionData {
    messages: ChatMessage[];
    mode: 'MirrorMesh' | 'Vault' | 'Online';
    lastUpdated: string; // ISO timestamp
    topic?: string; // Auto-extracted topic from first user message
}

export interface SessionMetadata {
    hasActiveSession: boolean;
    lastUpdated: string;
    messageCount: number;
    topic?: string;
}

class SessionServiceClass {
    private autoSaveInterval: ReturnType<typeof setInterval> | null = null;
    private pendingSession: SessionData | null = null;

    /**
     * Start auto-save interval (call on app mount)
     */
    startAutoSave(intervalMs: number = 30000): void {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        this.autoSaveInterval = setInterval(async () => {
            if (this.pendingSession && this.pendingSession.messages.length > 0) {
                await this.saveSession(this.pendingSession);
            }
        }, intervalMs);
    }

    /**
     * Stop auto-save interval (call on app unmount)
     */
    stopAutoSave(): void {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    /**
     * Update the pending session (call on every message change)
     */
    updatePendingSession(session: SessionData): void {
        this.pendingSession = session;
    }

    /**
     * Save session to persistent storage
     */
    async saveSession(session: SessionData): Promise<void> {
        try {
            // Extract topic from first user message if not set
            if (!session.topic && session.messages.length > 0) {
                const firstUserMsg = session.messages.find(m => m.role === 'user');
                if (firstUserMsg) {
                    session.topic = this.extractTopic(firstUserMsg.content);
                }
            }

            session.lastUpdated = new Date().toISOString();

            await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

            // Update metadata for quick checking
            const metadata: SessionMetadata = {
                hasActiveSession: session.messages.length > 0,
                lastUpdated: session.lastUpdated,
                messageCount: session.messages.length,
                topic: session.topic,
            };
            await AsyncStorage.setItem(SESSION_METADATA_KEY, JSON.stringify(metadata));

            console.log('[SessionService] Session saved:', metadata);
        } catch (error) {
            console.error('[SessionService] Failed to save session:', error);
        }
    }

    /**
     * Load session from persistent storage
     */
    async loadSession(): Promise<SessionData | null> {
        try {
            const data = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
            if (!data) return null;

            const session = JSON.parse(data) as SessionData;

            // Rehydrate Date objects in messages
            session.messages = session.messages.map(msg => ({
                ...msg,
                timestamp: new Date(msg.timestamp),
            }));

            return session;
        } catch (error) {
            console.error('[SessionService] Failed to load session:', error);
            return null;
        }
    }

    /**
     * Get session metadata without loading full session
     */
    async getSessionMetadata(): Promise<SessionMetadata | null> {
        try {
            const data = await AsyncStorage.getItem(SESSION_METADATA_KEY);
            if (!data) return null;
            return JSON.parse(data) as SessionMetadata;
        } catch (error) {
            console.error('[SessionService] Failed to get metadata:', error);
            return null;
        }
    }

    /**
     * Check if there's an active session to restore
     */
    async hasActiveSession(): Promise<boolean> {
        const metadata = await this.getSessionMetadata();
        return metadata?.hasActiveSession ?? false;
    }

    /**
     * Clear the active session
     */
    async clearSession(): Promise<void> {
        try {
            this.pendingSession = null;
            await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
            await AsyncStorage.setItem(SESSION_METADATA_KEY, JSON.stringify({
                hasActiveSession: false,
                lastUpdated: new Date().toISOString(),
                messageCount: 0,
            }));
            console.log('[SessionService] Session cleared');
        } catch (error) {
            console.error('[SessionService] Failed to clear session:', error);
        }
    }

    /**
     * Force save current pending session (call on app background)
     */
    async forceSave(): Promise<void> {
        if (this.pendingSession && this.pendingSession.messages.length > 0) {
            await this.saveSession(this.pendingSession);
        }
    }

    /**
     * Extract a topic from the message content
     */
    private extractTopic(content: string): string {
        // Take first line or first 50 chars
        const firstLine = content.split('\n')[0].trim();
        if (firstLine.length <= 50) {
            return firstLine;
        }
        return firstLine.slice(0, 47) + '...';
    }

    /**
     * Get time since last session update
     */
    async getTimeSinceLastUpdate(): Promise<string | null> {
        const metadata = await this.getSessionMetadata();
        if (!metadata?.lastUpdated) return null;

        const lastUpdate = new Date(metadata.lastUpdated);
        const now = new Date();
        const diffMs = now.getTime() - lastUpdate.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        } else if (diffHours > 0) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffMins > 0) {
            return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        } else {
            return 'just now';
        }
    }
}

export const SessionService = new SessionServiceClass();
