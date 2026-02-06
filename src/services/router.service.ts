/**
 * Router Service — MCP Router Client for Mobile
 * Routes all actions through the MirrorGate Router (localhost:8097)
 * with offline queue support.
 *
 * When offline: saves requests to local queue file.
 * When online: flushes queue, then operates normally.
 */

import RNFS from 'react-native-fs';
import { STORAGE_PATHS } from './vault.service';

const ROUTER_URL = 'http://10.0.2.2:8097'; // Android emulator → host localhost
const ROUTER_URL_DEVICE = 'http://192.168.1.100:8097'; // LAN fallback (configure per network)
const QUEUE_FILE = `${RNFS.DocumentDirectoryPath}/MirrorBrain/router_queue.json`;
const TIMEOUT_MS = 10000;

interface QueuedRequest {
    id: string;
    endpoint: string;
    body: Record<string, unknown>;
    createdAt: string;
    retries: number;
}

interface RouterResponse<T = unknown> {
    ok: boolean;
    data?: T;
    error?: string;
    queued?: boolean;
}

class RouterServiceClass {
    private baseUrl: string = ROUTER_URL;
    private online: boolean = false;
    private queue: QueuedRequest[] = [];
    private initialized: boolean = false;

    async initialize(): Promise<void> {
        if (this.initialized) return;
        await this._loadQueue();
        await this.checkConnectivity();
        this.initialized = true;
    }

    /**
     * Check if Router is reachable
     */
    async checkConnectivity(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);

            const res = await fetch(`${this.baseUrl}/health`, { signal: controller.signal });
            clearTimeout(timeout);

            if (res.ok) {
                this.online = true;
                // Flush any queued requests
                await this._flushQueue();
                return true;
            }
        } catch {
            // Try LAN fallback
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3000);
                const res = await fetch(`${ROUTER_URL_DEVICE}/health`, { signal: controller.signal });
                clearTimeout(timeout);
                if (res.ok) {
                    this.baseUrl = ROUTER_URL_DEVICE;
                    this.online = true;
                    await this._flushQueue();
                    return true;
                }
            } catch {
                // Both failed
            }
        }
        this.online = false;
        return false;
    }

    isOnline(): boolean {
        return this.online;
    }

    // --- Core API Methods ---

    /**
     * Write a draft to Vault via Router
     * Used by: Capture note, Voice capture
     */
    async vaultWriteDraft(title: string, content: string, project?: string, tags?: string[]): Promise<RouterResponse<{ draft_id: string; path: string }>> {
        return this._post('/vault/write_draft', { title, content, project, tags: tags || [] });
    }

    /**
     * Read from Vault via Router
     * Used by: Briefing
     */
    async vaultRead(pointer: string): Promise<RouterResponse<{ content: string; size: number }>> {
        return this._post('/vault/read', { pointer });
    }

    /**
     * Check policy before an action
     */
    async policyCheck(action: string, tier: string = 'T1'): Promise<RouterResponse<{ allowed: boolean; reason?: string }>> {
        return this._post('/policy/check', { action, tier });
    }

    /**
     * Append an audit event
     */
    async auditAppend(event: string, data: Record<string, unknown> = {}): Promise<RouterResponse<{ ok: boolean }>> {
        return this._post('/audit/append', { event, data });
    }

    /**
     * Search knowledge
     */
    async knowledgeSearch(source: string, query: string): Promise<RouterResponse<{ results: unknown[] }>> {
        return this._post('/knowledge/search', { source, query });
    }

    /**
     * Get the last run ID for "continue where you left off"
     */
    async getLastRunId(): Promise<string | null> {
        try {
            const res = await this._post<{ entries: Array<{ run_id?: string }> }>('/audit/query', { limit: 1 });
            if (res.ok && res.data?.entries?.length) {
                return res.data.entries[0]?.run_id || null;
            }
        } catch { /* ignore */ }
        return null;
    }

    // --- Internal ---

    private async _post<T = unknown>(endpoint: string, body: Record<string, unknown>): Promise<RouterResponse<T>> {
        if (!this.online) {
            // Queue the request for later
            await this._enqueue(endpoint, body);
            return { ok: false, error: 'offline', queued: true };
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

            const res = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                return { ok: false, error: errBody.detail || `HTTP ${res.status}` };
            }

            const data = await res.json() as T;
            return { ok: true, data };
        } catch (err: any) {
            // Network error — queue and mark offline
            this.online = false;
            await this._enqueue(endpoint, body);
            return { ok: false, error: err?.message || 'network error', queued: true };
        }
    }

    private async _enqueue(endpoint: string, body: Record<string, unknown>): Promise<void> {
        const req: QueuedRequest = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            endpoint,
            body,
            createdAt: new Date().toISOString(),
            retries: 0,
        };
        this.queue.push(req);
        await this._saveQueue();
        console.log(`[RouterService] Queued ${endpoint} (${this.queue.length} in queue)`);
    }

    private async _flushQueue(): Promise<void> {
        if (this.queue.length === 0) return;

        console.log(`[RouterService] Flushing ${this.queue.length} queued requests...`);
        const pending = [...this.queue];
        this.queue = [];

        for (const req of pending) {
            try {
                const res = await fetch(`${this.baseUrl}${req.endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(req.body),
                });

                if (!res.ok && req.retries < 3) {
                    req.retries++;
                    this.queue.push(req);
                }
            } catch {
                if (req.retries < 3) {
                    req.retries++;
                    this.queue.push(req);
                }
            }
        }

        await this._saveQueue();
        console.log(`[RouterService] Flush complete. ${this.queue.length} remaining.`);
    }

    private async _loadQueue(): Promise<void> {
        try {
            const exists = await RNFS.exists(QUEUE_FILE);
            if (exists) {
                const raw = await RNFS.readFile(QUEUE_FILE, 'utf8');
                this.queue = JSON.parse(raw);
            }
        } catch {
            this.queue = [];
        }
    }

    private async _saveQueue(): Promise<void> {
        try {
            await RNFS.writeFile(QUEUE_FILE, JSON.stringify(this.queue), 'utf8');
        } catch (err) {
            console.error('[RouterService] Failed to save queue:', err);
        }
    }

    /**
     * Get queue size (for UI indicators)
     */
    getQueueSize(): number {
        return this.queue.length;
    }
}

export const RouterService = new RouterServiceClass();
export default RouterService;
