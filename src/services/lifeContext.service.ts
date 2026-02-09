/**
 * Life Context Service — Continuous Context Accumulator
 *
 * Captures and accumulates ALL digital signals to build a
 * comprehensive "life context" that the local LLM can access.
 *
 * This is something BIG TECH WON'T DO because:
 * 1. They'd have to store it on their servers (privacy nightmare)
 * 2. They can't access system-level data (sandboxed)
 * 3. They don't want AI that knows too much
 *
 * We do it locally, sovereignly, with full system access.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';

// Context types
export type ContextType =
    | 'notification'
    | 'screen'
    | 'clipboard'
    | 'conversation'
    | 'location'
    | 'calendar'
    | 'app_usage'
    | 'search'
    | 'contact'
    | 'file_access'
    | 'voice_command';

export interface ContextEntry {
    id: string;
    type: ContextType;
    timestamp: number;
    content: string;
    metadata: Record<string, unknown>;
    embedding?: number[];  // For semantic search
    importance: number;    // 0-1, for retention priority
}

export interface ContextQuery {
    query: string;
    types?: ContextType[];
    timeRange?: { start: number; end: number };
    limit?: number;
}

export interface ContextSummary {
    totalEntries: number;
    byType: Record<ContextType, number>;
    oldestEntry: number;
    newestEntry: number;
    storageUsedMB: number;
}

// Storage keys
const STORAGE_KEY = '@life_context';
const INDEX_KEY = '@life_context_index';
const SETTINGS_KEY = '@life_context_settings';

// Limits
const MAX_ENTRIES = 50000;          // ~50MB at 1KB per entry
const MAX_ENTRY_SIZE = 5000;        // Characters per entry
const RETENTION_DAYS = 365;         // Keep 1 year of context
const COMPRESSION_THRESHOLD = 1000; // Compress entries older than this count

class LifeContextServiceClass {
    private entries: ContextEntry[] = [];
    private isLoaded = false;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;
    private contextBuffer: ContextEntry[] = [];
    private flushInterval: ReturnType<typeof setInterval> | null = null;

    private settings = {
        enabled: true,
        captureNotifications: true,
        captureScreens: true,
        captureClipboard: true,
        captureConversations: true,
        captureLocation: false,  // Off by default (battery)
        retentionDays: RETENTION_DAYS,
    };

    /**
     * Initialize the service
     */
    async initialize(): Promise<void> {
        if (this.isLoaded) return;

        console.log('[LifeContext] Initializing...');

        // Load settings
        await this.loadSettings();

        // Load existing context
        await this.loadContext();

        // Set up periodic flush
        this.flushInterval = setInterval(() => this.flushBuffer(), 30000);

        // Handle app state changes
        AppState.addEventListener('change', this.handleAppStateChange);

        this.isLoaded = true;
        console.log(`[LifeContext] Loaded ${this.entries.length} entries`);
    }

    /**
     * Add a context entry
     */
    async addContext(
        type: ContextType,
        content: string,
        metadata: Record<string, unknown> = {},
        importance: number = 0.5
    ): Promise<void> {
        if (!this.settings.enabled) return;
        if (!this.shouldCapture(type)) return;

        // Truncate if too long
        const truncatedContent = content.slice(0, MAX_ENTRY_SIZE);

        const entry: ContextEntry = {
            id: `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type,
            timestamp: Date.now(),
            content: truncatedContent,
            metadata,
            importance,
        };

        // Buffer for batch writes
        this.contextBuffer.push(entry);

        // Immediate flush if buffer is large
        if (this.contextBuffer.length >= 50) {
            await this.flushBuffer();
        }
    }

    /**
     * Record a notification
     */
    async recordNotification(
        app: string,
        title: string,
        content: string,
        category?: string
    ): Promise<void> {
        await this.addContext('notification', `[${app}] ${title}: ${content}`, {
            app,
            title,
            category,
        }, this.calculateImportance(app, category));
    }

    /**
     * Record screen context
     */
    async recordScreen(
        app: string,
        screenContent: string,
        screenType?: string
    ): Promise<void> {
        await this.addContext('screen', screenContent, {
            app,
            screenType,
        }, 0.3);  // Lower importance for screens
    }

    /**
     * Record clipboard content
     */
    async recordClipboard(content: string): Promise<void> {
        // Don't record if it looks like a password
        if (this.looksLikeSensitive(content)) {
            console.log('[LifeContext] Skipping sensitive clipboard content');
            return;
        }

        await this.addContext('clipboard', content, {}, 0.6);
    }

    /**
     * Record a conversation
     */
    async recordConversation(
        role: 'user' | 'assistant',
        content: string,
        agent?: string
    ): Promise<void> {
        await this.addContext('conversation', `${role}: ${content}`, {
            role,
            agent,
        }, 0.8);  // High importance for conversations
    }

    /**
     * Record a search query
     */
    async recordSearch(query: string, source?: string): Promise<void> {
        await this.addContext('search', query, { source }, 0.7);
    }

    /**
     * Record app usage
     */
    async recordAppUsage(app: string, duration: number, action?: string): Promise<void> {
        await this.addContext('app_usage', `Used ${app}${action ? `: ${action}` : ''}`, {
            app,
            duration,
            action,
        }, 0.2);
    }

    /**
     * Search context with natural language
     */
    async searchContext(query: ContextQuery): Promise<ContextEntry[]> {
        const { query: searchText, types, timeRange, limit = 50 } = query;

        let results = this.entries;

        // Filter by type
        if (types && types.length > 0) {
            results = results.filter(e => types.includes(e.type));
        }

        // Filter by time range
        if (timeRange) {
            results = results.filter(
                e => e.timestamp >= timeRange.start && e.timestamp <= timeRange.end
            );
        }

        // Simple text matching (TODO: semantic search with embeddings)
        const searchLower = searchText.toLowerCase();
        results = results.filter(e =>
            e.content.toLowerCase().includes(searchLower) ||
            Object.values(e.metadata).some(v =>
                String(v).toLowerCase().includes(searchLower)
            )
        );

        // Sort by relevance (importance * recency)
        const now = Date.now();
        results.sort((a, b) => {
            const recencyA = 1 - (now - a.timestamp) / (RETENTION_DAYS * 24 * 60 * 60 * 1000);
            const recencyB = 1 - (now - b.timestamp) / (RETENTION_DAYS * 24 * 60 * 60 * 1000);
            const scoreA = a.importance * 0.6 + Math.max(0, recencyA) * 0.4;
            const scoreB = b.importance * 0.6 + Math.max(0, recencyB) * 0.4;
            return scoreB - scoreA;
        });

        return results.slice(0, limit);
    }

    /**
     * Get recent context for LLM prompt
     */
    async getRecentContext(
        types?: ContextType[],
        hours: number = 24,
        maxChars: number = 4000
    ): Promise<string> {
        const cutoff = Date.now() - hours * 60 * 60 * 1000;

        let entries = this.entries.filter(e => e.timestamp >= cutoff);

        if (types && types.length > 0) {
            entries = entries.filter(e => types.includes(e.type));
        }

        // Sort by importance and recency
        entries.sort((a, b) => b.importance - a.importance || b.timestamp - a.timestamp);

        // Build context string
        let context = '';
        for (const entry of entries) {
            const line = `[${new Date(entry.timestamp).toLocaleString()}] ${entry.type}: ${entry.content}\n`;
            if (context.length + line.length > maxChars) break;
            context += line;
        }

        return context;
    }

    /**
     * Get context summary
     */
    async getSummary(): Promise<ContextSummary> {
        const byType: Record<ContextType, number> = {} as any;
        for (const entry of this.entries) {
            byType[entry.type] = (byType[entry.type] || 0) + 1;
        }

        const storageSize = JSON.stringify(this.entries).length / (1024 * 1024);

        return {
            totalEntries: this.entries.length,
            byType,
            oldestEntry: this.entries.length > 0
                ? Math.min(...this.entries.map(e => e.timestamp))
                : Date.now(),
            newestEntry: this.entries.length > 0
                ? Math.max(...this.entries.map(e => e.timestamp))
                : Date.now(),
            storageUsedMB: Math.round(storageSize * 100) / 100,
        };
    }

    /**
     * Clear old entries
     */
    async pruneOldEntries(): Promise<number> {
        const cutoff = Date.now() - this.settings.retentionDays * 24 * 60 * 60 * 1000;
        const before = this.entries.length;

        this.entries = this.entries.filter(e => e.timestamp >= cutoff);

        // Also limit total entries
        if (this.entries.length > MAX_ENTRIES) {
            // Keep highest importance entries
            this.entries.sort((a, b) => b.importance - a.importance);
            this.entries = this.entries.slice(0, MAX_ENTRIES);
        }

        const removed = before - this.entries.length;
        if (removed > 0) {
            await this.saveContext();
            console.log(`[LifeContext] Pruned ${removed} old entries`);
        }

        return removed;
    }

    /**
     * Update settings
     */
    async updateSettings(newSettings: Partial<typeof this.settings>): Promise<void> {
        this.settings = { ...this.settings, ...newSettings };
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    }

    /**
     * Get settings
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Export context for backup
     */
    async exportContext(): Promise<string> {
        return JSON.stringify({
            version: 1,
            exportedAt: Date.now(),
            entries: this.entries,
            settings: this.settings,
        });
    }

    /**
     * Import context from backup
     */
    async importContext(data: string): Promise<number> {
        try {
            const parsed = JSON.parse(data);
            if (parsed.version !== 1) throw new Error('Unsupported version');

            const newEntries = parsed.entries as ContextEntry[];
            const existingIds = new Set(this.entries.map(e => e.id));

            let imported = 0;
            for (const entry of newEntries) {
                if (!existingIds.has(entry.id)) {
                    this.entries.push(entry);
                    imported++;
                }
            }

            await this.saveContext();
            return imported;
        } catch (e) {
            console.error('[LifeContext] Import failed:', e);
            throw e;
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Private Methods
    // ─────────────────────────────────────────────────────────────────

    private async loadSettings(): Promise<void> {
        try {
            const stored = await AsyncStorage.getItem(SETTINGS_KEY);
            if (stored) {
                this.settings = { ...this.settings, ...JSON.parse(stored) };
            }
        } catch (e) {
            console.warn('[LifeContext] Failed to load settings:', e);
        }
    }

    private async loadContext(): Promise<void> {
        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored) {
                this.entries = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('[LifeContext] Failed to load context:', e);
            this.entries = [];
        }
    }

    private async saveContext(): Promise<void> {
        try {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
        } catch (e) {
            console.error('[LifeContext] Failed to save context:', e);
        }
    }

    private async flushBuffer(): Promise<void> {
        if (this.contextBuffer.length === 0) return;

        // Move buffer to entries
        this.entries.push(...this.contextBuffer);
        this.contextBuffer = [];

        // Schedule save
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveContext(), 5000);
    }

    private shouldCapture(type: ContextType): boolean {
        switch (type) {
            case 'notification': return this.settings.captureNotifications;
            case 'screen': return this.settings.captureScreens;
            case 'clipboard': return this.settings.captureClipboard;
            case 'conversation': return this.settings.captureConversations;
            case 'location': return this.settings.captureLocation;
            default: return true;
        }
    }

    private calculateImportance(app: string, category?: string): number {
        // High importance apps
        const highImportance = ['messages', 'whatsapp', 'telegram', 'slack', 'email', 'calendar'];
        if (highImportance.some(h => app.toLowerCase().includes(h))) return 0.8;

        // Medium importance
        const mediumImportance = ['twitter', 'linkedin', 'news'];
        if (mediumImportance.some(m => app.toLowerCase().includes(m))) return 0.5;

        // Low importance
        return 0.3;
    }

    private looksLikeSensitive(content: string): boolean {
        // Skip likely passwords/tokens
        if (/^[a-zA-Z0-9!@#$%^&*()_+-=]{8,64}$/.test(content.trim())) return true;
        if (/password|secret|token|api[_-]?key/i.test(content)) return true;
        if (/^[0-9]{13,19}$/.test(content.replace(/\s/g, ''))) return true; // Credit card
        return false;
    }

    private handleAppStateChange = (state: AppStateStatus): void => {
        if (state === 'background') {
            // Flush and save when going to background
            this.flushBuffer();
            this.saveContext();
        }
    };

    /**
     * Cleanup
     */
    cleanup(): void {
        if (this.flushInterval) clearInterval(this.flushInterval);
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.flushBuffer();
        this.saveContext();
    }
}

export const LifeContextService = new LifeContextServiceClass();
export default LifeContextService;
