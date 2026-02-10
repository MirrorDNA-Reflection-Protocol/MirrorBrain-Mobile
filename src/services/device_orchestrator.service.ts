/**
 * Device Orchestrator Client — Ambient OS (Mode C)
 *
 * Dispatches intents to Tasker HTTP Server (port 8081) or Mac orchestrator (port 8098).
 * Handles: intent dispatch, run tracking, device status, offline queue.
 *
 * Flow: App → Tasker HTTP (localhost:8081) → device command
 *       App → Mac Orchestrator (8098) → policy gate → Tasker (8081) → device command
 */

import RNFS from 'react-native-fs';

// Tasker HTTP Server — runs on same phone (fastest path)
const TASKER_LOCAL = 'http://localhost:8081';
// Mac orchestrator — policy gate (fallback)
const ORCH_URL_TAILSCALE = 'http://100.114.247.53:8098';
const ORCH_URL_LAN = 'http://192.168.0.112:8098';
const ORCH_QUEUE_FILE = `${RNFS.DocumentDirectoryPath}/MirrorBrain/orch_queue.json`;
const TIMEOUT_MS = 10000;

export interface DeviceCommand {
    idempotency_key: string;
    run_id: string;
    skill_id: string;
    args: Record<string, unknown>;
    requested_at: string;
    policy_hash: string;
    kill_switch_level: number;
    return_to: string;
    evidence: { screenshot: boolean; notification: boolean };
}

export interface RunRecord {
    run_id: string;
    idempotency_key: string;
    skill_id: string;
    device_id: string;
    args: Record<string, unknown>;
    risk_tier: string;
    status: 'pending' | 'dispatched' | 'completed' | 'failed' | 'blocked';
    requested_at: string;
    completed_at: string | null;
    policy_hash: string | null;
    kill_switch_level: string;
    result: DeviceCommand | unknown;
    error: string | null;
}

export interface DeviceStatus {
    device_id: string;
    locked: boolean;
    lock_run_id: string | null;
    lock_acquired_at: string | null;
}

export interface SkillDef {
    skill_id: string;
    risk_tier: string;
    requires_autoinput: boolean;
}

interface QueuedIntent {
    id: string;
    intent: string;
    device_id: string;
    args?: Record<string, unknown>;
    idempotency_key: string;
    createdAt: string;
}

class DeviceOrchestratorServiceClass {
    private baseUrl: string = TASKER_LOCAL;
    private isTaskerDirect: boolean = false;
    private online: boolean = false;
    private queue: QueuedIntent[] = [];
    private recentRuns: RunRecord[] = [];

    async initialize(): Promise<void> {
        await this._loadQueue();
        await this.checkConnectivity();
    }

    async checkConnectivity(): Promise<boolean> {
        // Try local Tasker first (same phone), then Mac orchestrator
        for (const url of [TASKER_LOCAL, ORCH_URL_TAILSCALE, ORCH_URL_LAN]) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3000);
                // Tasker uses /command endpoint, orchestrator uses /health
                const endpoint = url === TASKER_LOCAL ? `${url}/command` : `${url}/health`;
                const method = url === TASKER_LOCAL ? 'POST' : 'GET';
                const res = await fetch(endpoint, {
                    method,
                    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
                    body: method === 'POST' ? JSON.stringify({ skill_id: 'health_check' }) : undefined,
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                if (res.ok) {
                    this.baseUrl = url;
                    this.isTaskerDirect = url === TASKER_LOCAL;
                    this.online = true;
                    console.log(`[DeviceOrch] Connected to ${url === TASKER_LOCAL ? 'local Tasker' : 'Mac orchestrator'}`);
                    await this._flushQueue();
                    return true;
                }
            } catch { /* try next */ }
        }
        this.online = false;
        return false;
    }

    isOnline(): boolean {
        return this.online;
    }

    /**
     * Dispatch an intent to the orchestrator
     * Returns the run record with device command embedded
     */
    async dispatch(
        intent: string,
        deviceId: string,
        args?: Record<string, unknown>,
    ): Promise<{ ok: boolean; run?: RunRecord; error?: string; queued?: boolean }> {
        const idempotencyKey = this._uuid();

        if (!this.online) {
            await this._enqueue(intent, deviceId, args, idempotencyKey);
            return { ok: false, error: 'offline', queued: true };
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

            let run: RunRecord;

            if (this.isTaskerDirect) {
                // Direct to Tasker HTTP Server on same phone
                const res = await fetch(`${this.baseUrl}/command`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        skill_id: intent,
                        run_id: idempotencyKey,
                        args: args || {},
                        kill_switch_level: 0,
                    }),
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                const taskerResult = await res.json();

                // Map Tasker response to RunRecord format
                run = {
                    run_id: idempotencyKey,
                    idempotency_key: idempotencyKey,
                    skill_id: intent,
                    device_id: deviceId,
                    args: args || {},
                    risk_tier: 'T1',
                    status: taskerResult.success ? 'completed' : 'failed',
                    requested_at: new Date().toISOString(),
                    completed_at: new Date().toISOString(),
                    policy_hash: null,
                    kill_switch_level: '0',
                    result: taskerResult,
                    error: taskerResult.success ? null : (taskerResult.error || 'Tasker execution failed'),
                };
            } else {
                // Via Mac orchestrator (policy gate)
                const res = await fetch(`${this.baseUrl}/intent/dispatch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        intent,
                        device_id: deviceId,
                        args,
                        idempotency_key: idempotencyKey,
                    }),
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                run = (await res.json()) as RunRecord;
            }

            // Track locally
            this.recentRuns.unshift(run);
            if (this.recentRuns.length > 50) this.recentRuns.pop();

            return {
                ok: run.status === 'completed' || run.status === 'dispatched',
                run,
                error: run.error ?? undefined,
            };
        } catch (err: any) {
            this.online = false;
            await this._enqueue(intent, deviceId, args, idempotencyKey);
            return { ok: false, error: err?.message || 'network error', queued: true };
        }
    }

    /**
     * Get run status
     */
    async getRun(runId: string): Promise<RunRecord | null> {
        if (!this.online) return null;
        try {
            const res = await fetch(`${this.baseUrl}/run/${runId}`);
            if (!res.ok) return null;
            return (await res.json()) as RunRecord;
        } catch { return null; }
    }

    /**
     * Get recent runs from orchestrator
     */
    async getRecentRuns(limit: number = 20): Promise<RunRecord[]> {
        if (!this.online) return this.recentRuns;
        try {
            const res = await fetch(`${this.baseUrl}/runs?limit=${limit}`);
            if (!res.ok) return this.recentRuns;
            const data = (await res.json()) as { runs: RunRecord[] };
            this.recentRuns = data.runs;
            return data.runs;
        } catch { return this.recentRuns; }
    }

    /**
     * Get device lock status
     */
    async getDeviceStatus(deviceId: string): Promise<DeviceStatus | null> {
        if (!this.online) return null;
        try {
            const res = await fetch(`${this.baseUrl}/device/status?device_id=${deviceId}`);
            if (!res.ok) return null;
            return (await res.json()) as DeviceStatus;
        } catch { return null; }
    }

    /**
     * Get available skills
     */
    async getSkills(): Promise<SkillDef[]> {
        if (!this.online) return [];
        try {
            const res = await fetch(`${this.baseUrl}/skills`);
            if (!res.ok) return [];
            const data = (await res.json()) as { skills: SkillDef[] };
            return data.skills;
        } catch { return []; }
    }

    /**
     * Post device result back to orchestrator
     */
    async postResult(
        runId: string,
        success: boolean,
        result?: unknown,
        error?: string,
        evidence?: { notification_shown?: boolean; execution_ms?: number },
    ): Promise<boolean> {
        if (!this.online) return false;
        try {
            const res = await fetch(`${this.baseUrl}/device/result`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ run_id: runId, success, result, error, evidence }),
            });
            return res.ok;
        } catch { return false; }
    }

    getQueueSize(): number {
        return this.queue.length;
    }

    getLocalRuns(): RunRecord[] {
        return this.recentRuns;
    }

    // --- Private ---

    private _uuid(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    private async _enqueue(intent: string, deviceId: string, args?: Record<string, unknown>, idempotencyKey?: string): Promise<void> {
        this.queue.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            intent,
            device_id: deviceId,
            args,
            idempotency_key: idempotencyKey ?? this._uuid(),
            createdAt: new Date().toISOString(),
        });
        await this._saveQueue();
        console.log(`[DeviceOrch] Queued intent: ${intent} (${this.queue.length} in queue)`);
    }

    private async _flushQueue(): Promise<void> {
        if (this.queue.length === 0) return;
        console.log(`[DeviceOrch] Flushing ${this.queue.length} queued intents...`);
        const pending = [...this.queue];
        this.queue = [];

        for (const item of pending) {
            try {
                const endpoint = this.isTaskerDirect ? `${this.baseUrl}/command` : `${this.baseUrl}/intent/dispatch`;
                const body = this.isTaskerDirect
                    ? { skill_id: item.intent, run_id: item.idempotency_key, args: item.args || {}, kill_switch_level: 0 }
                    : { intent: item.intent, device_id: item.device_id, args: item.args, idempotency_key: item.idempotency_key };

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    this.queue.push(item);
                }
            } catch {
                this.queue.push(item);
            }
        }
        await this._saveQueue();
    }

    private async _loadQueue(): Promise<void> {
        try {
            const exists = await RNFS.exists(ORCH_QUEUE_FILE);
            if (exists) {
                const raw = await RNFS.readFile(ORCH_QUEUE_FILE, 'utf8');
                this.queue = JSON.parse(raw);
            }
        } catch { this.queue = []; }
    }

    private async _saveQueue(): Promise<void> {
        try {
            await RNFS.writeFile(ORCH_QUEUE_FILE, JSON.stringify(this.queue), 'utf8');
        } catch (err) {
            console.error('[DeviceOrch] Failed to save queue:', err);
        }
    }
}

export const DeviceOrchestratorService = new DeviceOrchestratorServiceClass();
export default DeviceOrchestratorService;
