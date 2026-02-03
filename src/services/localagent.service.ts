/**
 * SC1 Local Agent — Sovereign Intelligence Daemon
 *
 * The brain that never sleeps. Monitors, protects, optimizes, and acts
 * autonomously while maintaining full transparency and user sovereignty.
 *
 * This is not a chatbot. This is device consciousness.
 */

import { NativeModules, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceService } from './device.service';
import { VaultService } from './vault.service';
import { PassiveIntelligenceService, ClipboardWatcher, ScreenContext } from './passive.service';
import { OrchestratorService } from './orchestrator.service';
import { HapticService } from './haptic.service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentState {
    isRunning: boolean;
    lastHeartbeat: number;
    lastHealthCheck: number;
    lastHubSync: number;
    pendingTasks: AgentTask[];
    activeAlerts: Alert[];
    deviceProfile: DeviceProfile;
}

export interface DeviceProfile {
    deviceId: string;
    deviceName: string;
    platform: string;
    osVersion: string;
    capabilities: string[];
}

export interface HealthReport {
    timestamp: number;
    battery: { level: number; charging: boolean; temperature?: number };
    storage: { freeGb: number; totalGb: number };
    memory: { usedPercent: number };
    cpu: { usedPercent?: number };
    network: { connected: boolean; type: string };
    uptime: number;
    alerts: Alert[];
}

export interface Alert {
    id: string;
    level: 'info' | 'warning' | 'alert' | 'critical';
    category: 'health' | 'security' | 'resource' | 'sync';
    message: string;
    timestamp: number;
    acknowledged: boolean;
}

export interface AgentTask {
    id: string;
    from: 'hub' | 'peer' | 'self' | 'user';
    command: string;
    params: Record<string, any>;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    createdAt: number;
    expiresAt?: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: any;
}

export interface Trigger {
    id: string;
    type: 'time' | 'location' | 'event' | 'condition';
    condition: Record<string, any>;
    action: string;
    params: Record<string, any>;
    enabled: boolean;
    lastFired?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
    STATE: '@sc1_agent_state',
    TASKS: '@sc1_agent_tasks',
    ALERTS: '@sc1_agent_alerts',
    TRIGGERS: '@sc1_agent_triggers',
    CONFIG: '@sc1_agent_config',
};

const THRESHOLDS = {
    BATTERY_WARNING: 15,
    BATTERY_CRITICAL: 5,
    STORAGE_WARNING_GB: 1,
    STORAGE_CRITICAL_GB: 0.5,
    MEMORY_WARNING: 80,
    MEMORY_CRITICAL: 95,
    TEMP_WARNING: 40,
    TEMP_CRITICAL: 45,
    CPU_RUNAWAY: 50,
    OFFLINE_ALERT_HOURS: 6,
    DEAD_MAN_SWITCH_HOURS: 72,
};

const INTERVALS = {
    HEARTBEAT_MS: 60000,        // 1 minute
    HEALTH_CHECK_MS: 300000,    // 5 minutes
    HUB_SYNC_MS: 900000,        // 15 minutes
    TRIGGER_CHECK_MS: 30000,    // 30 seconds
};

// ─────────────────────────────────────────────────────────────────────────────
// The Agent
// ─────────────────────────────────────────────────────────────────────────────

class LocalAgentServiceClass {
    private state: AgentState;
    private intervals: { [key: string]: ReturnType<typeof setInterval> | undefined } = {};
    private triggers: Trigger[] = [];
    private isInitialized = false;

    constructor() {
        this.state = {
            isRunning: false,
            lastHeartbeat: 0,
            lastHealthCheck: 0,
            lastHubSync: 0,
            pendingTasks: [],
            activeAlerts: [],
            deviceProfile: {
                deviceId: '',
                deviceName: '',
                platform: Platform.OS,
                osVersion: Platform.Version.toString(),
                capabilities: [],
            },
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        console.log('[LocalAgent] Initializing SC1 Local Agent...');

        try {
            // Load persisted state
            await this.loadState();

            // Build device profile
            await this.buildDeviceProfile();

            // Initialize passive intelligence
            await PassiveIntelligenceService.initialize();

            // Load triggers
            await this.loadTriggers();

            // Register app state listener
            AppState.addEventListener('change', this.handleAppStateChange.bind(this));

            this.isInitialized = true;
            console.log('[LocalAgent] Initialized successfully');
        } catch (error) {
            console.error('[LocalAgent] Initialization failed:', error);
        }
    }

    async start(): Promise<void> {
        if (this.state.isRunning) return;

        console.log('[LocalAgent] Starting daemon...');

        this.state.isRunning = true;
        this.state.lastHeartbeat = Date.now();

        // Start heartbeat
        this.intervals.heartbeat = setInterval(
            () => this.heartbeat(),
            INTERVALS.HEARTBEAT_MS
        );

        // Start health monitoring
        this.intervals.healthCheck = setInterval(
            () => this.performHealthCheck(),
            INTERVALS.HEALTH_CHECK_MS
        );

        // Start hub sync
        this.intervals.hubSync = setInterval(
            () => this.syncWithHub(),
            INTERVALS.HUB_SYNC_MS
        );

        // Start trigger engine
        this.intervals.triggerCheck = setInterval(
            () => this.checkTriggers(),
            INTERVALS.TRIGGER_CHECK_MS
        );

        // Initial checks
        await this.performHealthCheck();
        await this.syncWithHub();

        await this.saveState();
        console.log('[LocalAgent] Daemon started');
    }

    async stop(): Promise<void> {
        console.log('[LocalAgent] Stopping daemon...');

        this.state.isRunning = false;

        // Clear all intervals
        Object.values(this.intervals).forEach(handle => {
            if (handle !== undefined) clearInterval(handle);
        });
        this.intervals = {};

        await this.saveState();
        console.log('[LocalAgent] Daemon stopped');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DOCTOR — Health Monitoring
    // ─────────────────────────────────────────────────────────────────────────

    async performHealthCheck(): Promise<HealthReport> {
        console.log('[LocalAgent] Performing health check...');

        const battery = await DeviceService.getBatteryLevel();
        const storage = await this.getStorageInfo();
        const memory = await this.getMemoryInfo();
        const network = await this.getNetworkInfo();

        const report: HealthReport = {
            timestamp: Date.now(),
            battery: {
                level: battery.level,
                charging: battery.charging,
            },
            storage,
            memory,
            cpu: { usedPercent: undefined },
            network,
            uptime: Date.now() - this.state.lastHeartbeat,
            alerts: [],
        };

        // Check thresholds and generate alerts
        const alerts = this.evaluateHealthThresholds(report);
        report.alerts = alerts;

        // Take automatic actions for critical issues
        await this.handleHealthAlerts(alerts);

        this.state.lastHealthCheck = Date.now();
        await this.saveState();

        return report;
    }

    private evaluateHealthThresholds(report: HealthReport): Alert[] {
        const alerts: Alert[] = [];
        const now = Date.now();

        // Battery alerts
        if (report.battery.level <= THRESHOLDS.BATTERY_CRITICAL && !report.battery.charging) {
            alerts.push({
                id: `battery_critical_${now}`,
                level: 'critical',
                category: 'health',
                message: `Battery critically low: ${report.battery.level}%`,
                timestamp: now,
                acknowledged: false,
            });
        } else if (report.battery.level <= THRESHOLDS.BATTERY_WARNING && !report.battery.charging) {
            alerts.push({
                id: `battery_warning_${now}`,
                level: 'warning',
                category: 'health',
                message: `Battery low: ${report.battery.level}%`,
                timestamp: now,
                acknowledged: false,
            });
        }

        // Storage alerts
        if (report.storage.freeGb <= THRESHOLDS.STORAGE_CRITICAL_GB) {
            alerts.push({
                id: `storage_critical_${now}`,
                level: 'critical',
                category: 'resource',
                message: `Storage critically low: ${report.storage.freeGb.toFixed(1)}GB free`,
                timestamp: now,
                acknowledged: false,
            });
        } else if (report.storage.freeGb <= THRESHOLDS.STORAGE_WARNING_GB) {
            alerts.push({
                id: `storage_warning_${now}`,
                level: 'warning',
                category: 'resource',
                message: `Storage low: ${report.storage.freeGb.toFixed(1)}GB free`,
                timestamp: now,
                acknowledged: false,
            });
        }

        // Memory alerts
        if (report.memory.usedPercent >= THRESHOLDS.MEMORY_CRITICAL) {
            alerts.push({
                id: `memory_critical_${now}`,
                level: 'critical',
                category: 'resource',
                message: `Memory critically high: ${report.memory.usedPercent}%`,
                timestamp: now,
                acknowledged: false,
            });
        } else if (report.memory.usedPercent >= THRESHOLDS.MEMORY_WARNING) {
            alerts.push({
                id: `memory_warning_${now}`,
                level: 'warning',
                category: 'resource',
                message: `Memory high: ${report.memory.usedPercent}%`,
                timestamp: now,
                acknowledged: false,
            });
        }

        return alerts;
    }

    private async handleHealthAlerts(alerts: Alert[]): Promise<void> {
        for (const alert of alerts) {
            if (alert.level === 'critical') {
                // Haptic feedback for critical alerts
                HapticService.warning();

                // Log to vault
                await this.logToVault('critical_alert', alert);
            }

            // Update active alerts
            const existingIndex = this.state.activeAlerts.findIndex(
                a => a.category === alert.category && a.level === alert.level
            );
            if (existingIndex >= 0) {
                this.state.activeAlerts[existingIndex] = alert;
            } else {
                this.state.activeAlerts.push(alert);
            }
        }

        // Clean up old acknowledged alerts
        this.state.activeAlerts = this.state.activeAlerts.filter(
            a => !a.acknowledged || Date.now() - a.timestamp < 3600000
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MESSENGER — Hub Communication
    // ─────────────────────────────────────────────────────────────────────────

    async syncWithHub(): Promise<void> {
        console.log('[LocalAgent] Syncing with hub...');

        try {
            // Check for incoming tasks
            await this.checkForHubTasks();

            // Send health report
            await this.sendHealthReportToHub();

            // Send pending task results
            await this.sendTaskResultsToHub();

            this.state.lastHubSync = Date.now();
            await this.saveState();
        } catch (error) {
            console.error('[LocalAgent] Hub sync failed:', error);
        }
    }

    private async checkForHubTasks(): Promise<void> {
        // Read task queue from vault (synced via Syncthing)
        const taskQueuePath = `Paul/_from_hub/task_queue.json`;

        try {
            // This would read from the synced vault
            // For now, we'll use a placeholder
            const tasks = await this.readTaskQueue();

            for (const task of tasks) {
                if (task.status === 'pending') {
                    await this.executeTask(task);
                }
            }
        } catch (error) {
            // No tasks or file doesn't exist
        }
    }

    private async sendHealthReportToHub(): Promise<void> {
        const report = await this.performHealthCheck();

        const hubReport = {
            id: `report_${Date.now()}`,
            from: this.state.deviceProfile.deviceId,
            type: 'health_report',
            timestamp: Date.now(),
            data: report,
        };

        // Write to vault for sync
        await this.writeToHubOutbox('health_report', hubReport);
    }

    private async sendTaskResultsToHub(): Promise<void> {
        const completedTasks = this.state.pendingTasks.filter(
            t => t.status === 'completed' || t.status === 'failed'
        );

        for (const task of completedTasks) {
            await this.writeToHubOutbox('task_result', {
                taskId: task.id,
                status: task.status,
                result: task.result,
                completedAt: Date.now(),
            });
        }

        // Remove completed tasks from pending
        this.state.pendingTasks = this.state.pendingTasks.filter(
            t => t.status === 'pending' || t.status === 'running'
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AUTOMATOR — Trigger Engine
    // ─────────────────────────────────────────────────────────────────────────

    private async checkTriggers(): Promise<void> {
        const now = Date.now();

        for (const trigger of this.triggers) {
            if (!trigger.enabled) continue;

            const shouldFire = await this.evaluateTrigger(trigger);

            if (shouldFire) {
                console.log(`[LocalAgent] Trigger fired: ${trigger.id}`);

                await this.executeTriggerAction(trigger);
                trigger.lastFired = now;
            }
        }
    }

    private async evaluateTrigger(trigger: Trigger): Promise<boolean> {
        switch (trigger.type) {
            case 'time':
                return this.evaluateTimeTrigger(trigger);
            case 'condition':
                return this.evaluateConditionTrigger(trigger);
            case 'event':
                return this.evaluateEventTrigger(trigger);
            default:
                return false;
        }
    }

    private evaluateTimeTrigger(trigger: Trigger): boolean {
        const now = new Date();
        const { hour, minute, dayOfWeek } = trigger.condition;

        if (hour !== undefined && now.getHours() !== hour) return false;
        if (minute !== undefined && now.getMinutes() !== minute) return false;
        if (dayOfWeek !== undefined && now.getDay() !== dayOfWeek) return false;

        // Prevent firing multiple times in same minute
        if (trigger.lastFired) {
            const lastFiredDate = new Date(trigger.lastFired);
            if (
                lastFiredDate.getHours() === now.getHours() &&
                lastFiredDate.getMinutes() === now.getMinutes()
            ) {
                return false;
            }
        }

        return true;
    }

    private async evaluateConditionTrigger(trigger: Trigger): Promise<boolean> {
        const { type, operator, value } = trigger.condition;

        switch (type) {
            case 'battery':
                const battery = await DeviceService.getBatteryLevel();
                return this.compareValue(battery.level, operator, value);

            case 'charging':
                const batteryInfo = await DeviceService.getBatteryLevel();
                return batteryInfo.charging === value;

            case 'storage_free_gb':
                const storage = await this.getStorageInfo();
                return this.compareValue(storage.freeGb, operator, value);

            default:
                return false;
        }
    }

    private evaluateEventTrigger(_trigger: Trigger): boolean {
        // Event triggers are fired externally, not polled
        return false;
    }

    private compareValue(actual: number, operator: string, expected: number): boolean {
        switch (operator) {
            case '<': return actual < expected;
            case '<=': return actual <= expected;
            case '>': return actual > expected;
            case '>=': return actual >= expected;
            case '==': return actual === expected;
            default: return false;
        }
    }

    private async executeTriggerAction(trigger: Trigger): Promise<void> {
        const task: AgentTask = {
            id: `trigger_${trigger.id}_${Date.now()}`,
            from: 'self',
            command: trigger.action,
            params: trigger.params,
            priority: 'normal',
            createdAt: Date.now(),
            status: 'pending',
        };

        await this.executeTask(task);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Task Execution
    // ─────────────────────────────────────────────────────────────────────────

    async executeTask(task: AgentTask): Promise<void> {
        console.log(`[LocalAgent] Executing task: ${task.command}`);

        task.status = 'running';
        this.state.pendingTasks.push(task);

        try {
            const result = await this.runCommand(task.command, task.params);
            task.status = 'completed';
            task.result = result;
        } catch (error) {
            task.status = 'failed';
            task.result = { error: String(error) };
        }

        await this.saveState();
    }

    private async runCommand(command: string, params: Record<string, any>): Promise<any> {
        switch (command) {
            case 'health_check':
                return this.performHealthCheck();

            case 'capture_screen_context':
                return ScreenContext.getContext();

            case 'get_clipboard':
                return ClipboardWatcher.getCurrent();

            case 'sync_now':
                await this.syncWithHub();
                return { success: true };

            case 'clear_cache':
                // Would call native module to clear cache
                return { success: true, message: 'Cache cleared' };

            case 'generate_report':
                return this.generateFullReport();

            case 'ai_query':
                // Run query through local LLM
                return this.runLocalLLMQuery(params.query, params.context);

            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }

    private async runLocalLLMQuery(query: string, context?: string): Promise<string> {
        // This will integrate with llama.rn
        // For now, return a placeholder
        const systemPrompt = `You are SC1, a local AI agent running on this device. You have access to device sensors, files, and can take actions. Be concise and helpful.`;

        const fullPrompt = context
            ? `${systemPrompt}\n\nContext: ${context}\n\nUser: ${query}`
            : `${systemPrompt}\n\nUser: ${query}`;

        // TODO: Integrate with LLMService for local inference
        // const response = await LLMService.chat(fullPrompt, { local: true });

        return `[SC1 Agent] Query received: "${query}". Local LLM integration pending.`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Utilities
    // ─────────────────────────────────────────────────────────────────────────

    private async heartbeat(): Promise<void> {
        this.state.lastHeartbeat = Date.now();
        console.log(`[LocalAgent] Heartbeat at ${new Date().toISOString()}`);
    }

    private async buildDeviceProfile(): Promise<void> {
        const deviceId = await DeviceService.getDeviceId?.() || `device_${Date.now()}`;

        this.state.deviceProfile = {
            deviceId,
            deviceName: Platform.OS === 'android' ? 'Android Device' : 'iOS Device',
            platform: Platform.OS,
            osVersion: Platform.Version.toString(),
            capabilities: [
                'health_monitoring',
                'clipboard_watch',
                'notification_intercept',
                'screen_context',
                'file_access',
                'network_monitor',
            ],
        };
    }

    private async getStorageInfo(): Promise<{ freeGb: number; totalGb: number }> {
        // Would use native module for actual storage info
        // Placeholder for now
        return { freeGb: 45.2, totalGb: 128 };
    }

    private async getMemoryInfo(): Promise<{ usedPercent: number }> {
        // Would use native module for actual memory info
        return { usedPercent: 62 };
    }

    private async getNetworkInfo(): Promise<{ connected: boolean; type: string }> {
        // Would use NetInfo
        return { connected: true, type: 'wifi' };
    }

    private async generateFullReport(): Promise<any> {
        const health = await this.performHealthCheck();
        const passive = await PassiveIntelligenceService.getStatus();

        return {
            timestamp: Date.now(),
            device: this.state.deviceProfile,
            health,
            passive,
            alerts: this.state.activeAlerts,
            pendingTasks: this.state.pendingTasks.length,
            triggers: this.triggers.length,
            uptime: Date.now() - this.state.lastHeartbeat,
        };
    }

    private async logToVault(type: string, data: any): Promise<void> {
        try {
            const logEntry = {
                type,
                timestamp: Date.now(),
                device: this.state.deviceProfile.deviceId,
                data,
            };

            // Would write to vault log file
            console.log('[LocalAgent] Vault log:', JSON.stringify(logEntry));
        } catch (error) {
            console.error('[LocalAgent] Failed to log to vault:', error);
        }
    }

    private async writeToHubOutbox(type: string, data: any): Promise<void> {
        try {
            const filename = `${type}_${Date.now()}.json`;
            const content = JSON.stringify(data, null, 2);

            // Would write to synced outbox folder
            console.log(`[LocalAgent] Hub outbox: ${filename}`);
        } catch (error) {
            console.error('[LocalAgent] Failed to write to hub outbox:', error);
        }
    }

    private async readTaskQueue(): Promise<AgentTask[]> {
        // Would read from synced task queue file
        return [];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Persistence
    // ─────────────────────────────────────────────────────────────────────────

    private async loadState(): Promise<void> {
        try {
            const stateJson = await AsyncStorage.getItem(STORAGE_KEYS.STATE);
            if (stateJson) {
                const savedState = JSON.parse(stateJson);
                this.state = { ...this.state, ...savedState };
            }
        } catch (error) {
            console.error('[LocalAgent] Failed to load state:', error);
        }
    }

    private async saveState(): Promise<void> {
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(this.state));
        } catch (error) {
            console.error('[LocalAgent] Failed to save state:', error);
        }
    }

    private async loadTriggers(): Promise<void> {
        try {
            const triggersJson = await AsyncStorage.getItem(STORAGE_KEYS.TRIGGERS);
            if (triggersJson) {
                this.triggers = JSON.parse(triggersJson);
            } else {
                // Load default triggers
                this.triggers = this.getDefaultTriggers();
                await this.saveTriggers();
            }
        } catch (error) {
            console.error('[LocalAgent] Failed to load triggers:', error);
            this.triggers = this.getDefaultTriggers();
        }
    }

    private async saveTriggers(): Promise<void> {
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.TRIGGERS, JSON.stringify(this.triggers));
        } catch (error) {
            console.error('[LocalAgent] Failed to save triggers:', error);
        }
    }

    private getDefaultTriggers(): Trigger[] {
        return [
            // Sync when charging starts
            {
                id: 'sync_on_charge',
                type: 'condition',
                condition: { type: 'charging', operator: '==', value: true },
                action: 'sync_now',
                params: {},
                enabled: true,
            },
            // Battery warning
            {
                id: 'battery_warning',
                type: 'condition',
                condition: { type: 'battery', operator: '<', value: 15 },
                action: 'health_check',
                params: {},
                enabled: true,
            },
        ];
    }

    private handleAppStateChange(nextAppState: string): void {
        console.log(`[LocalAgent] App state changed to: ${nextAppState}`);

        if (nextAppState === 'active') {
            // App came to foreground
            this.heartbeat();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    getState(): AgentState {
        return { ...this.state };
    }

    getAlerts(): Alert[] {
        return [...this.state.activeAlerts];
    }

    async acknowledgeAlert(alertId: string): Promise<void> {
        const alert = this.state.activeAlerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            await this.saveState();
        }
    }

    async addTrigger(trigger: Trigger): Promise<void> {
        this.triggers.push(trigger);
        await this.saveTriggers();
    }

    async removeTrigger(triggerId: string): Promise<void> {
        this.triggers = this.triggers.filter(t => t.id !== triggerId);
        await this.saveTriggers();
    }

    async queueTask(task: Omit<AgentTask, 'id' | 'createdAt' | 'status'>): Promise<string> {
        const fullTask: AgentTask = {
            ...task,
            id: `task_${Date.now()}`,
            createdAt: Date.now(),
            status: 'pending',
        };

        this.state.pendingTasks.push(fullTask);
        await this.saveState();

        // Execute immediately if high priority
        if (task.priority === 'high' || task.priority === 'urgent') {
            await this.executeTask(fullTask);
        }

        return fullTask.id;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Singleton
// ─────────────────────────────────────────────────────────────────────────────

export const LocalAgentService = new LocalAgentServiceClass();
export default LocalAgentService;
