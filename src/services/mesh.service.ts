/**
 * Mesh Service — Agent Communication Network (v2 - Robust)
 *
 * WebSocket client for connecting to the MirrorDNA mesh relay.
 * Handles background/foreground transitions, aggressive reconnection.
 */

import { AppState, AppStateStatus } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { OrchestratorService } from './orchestrator.service';

// Message types
export interface MeshAgent {
    id: string;
    name: string;
    type: 'phone' | 'desktop' | 'claude' | 'ollama';
    capabilities: string[];
    status: 'online' | 'busy' | 'idle' | 'offline';
    lastSeen?: string;
    context?: string;
}

export interface ChatMessage {
    type: 'chat';
    id: string;
    from: string;
    to: string;
    content: string;
    timestamp: string;
}

export interface TaskMessage {
    type: 'task';
    id: string;
    from: string;
    to: string;
    action: string;
    params: Record<string, unknown>;
    timeout: number;
    timestamp: string;
}

export interface TaskResultMessage {
    type: 'task_result';
    id: string;
    from: string;
    to: string;
    success: boolean;
    result?: unknown;
    error?: string;
    timestamp: string;
}

export interface PresenceMessage {
    type: 'presence';
    agent_id: string;
    status: 'online' | 'busy' | 'idle' | 'offline';
    context?: string;
    timestamp: string;
}

export type MeshMessage = ChatMessage | TaskMessage | TaskResultMessage | PresenceMessage | {
    type: 'agents' | 'registered' | 'error' | 'ping' | 'pong';
    [key: string]: unknown;
};

type MessageCallback = (message: MeshMessage) => void;
type ConnectionCallback = (connected: boolean) => void;

// Relay addresses — try multiple hosts
const RELAY_HOSTS = [
    'localhost',                    // ADB reverse (USB connected)
    '100.114.247.53',              // Tailscale IP
    '192.168.0.112',               // LAN IP (home network)
];
const DEFAULT_RELAY_PORT = 8766;
const HEARTBEAT_INTERVAL = 8000;   // 8 seconds (aggressive)
const RECONNECT_DELAY = 1500;      // 1.5 seconds
const CONNECTION_TIMEOUT = 5000;   // 5 second timeout per host

class MeshServiceClass {
    private ws: WebSocket | null = null;
    private agentId: string = '';
    private agentName: string = '';
    private connected: boolean = false;
    private reconnecting: boolean = false;
    private initialized: boolean = false;
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private appStateSubscription: { remove: () => void } | null = null;

    private agents: Map<string, MeshAgent> = new Map();
    private messageCallbacks: Set<MessageCallback> = new Set();
    private connectionCallbacks: Set<ConnectionCallback> = new Set();
    private pendingTasks: Map<string, (result: TaskResultMessage) => void> = new Map();

    private connectedHost: string = '';
    private lastMessageTime: number = 0;
    private connectionAttempts: number = 0;

    /**
     * Initialize the mesh service
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            console.log('[MeshService] Already initialized');
            return;
        }

        // Get device info for agent identity
        try {
            const deviceId = await DeviceInfo.getUniqueId();
            const deviceName = await DeviceInfo.getDeviceName();
            this.agentId = `phone-${deviceId.substring(0, 8)}`;
            this.agentName = deviceName || 'MirrorBrain Phone';
        } catch (error) {
            // Fallback if device info fails
            this.agentId = `phone-${Date.now().toString(36)}`;
            this.agentName = 'MirrorBrain Phone';
            console.warn('[MeshService] Device info failed, using fallback:', error);
        }

        // Set up AppState listener for foreground/background
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

        this.initialized = true;
        console.log(`[MeshService] Initialized as ${this.agentId} (${this.agentName})`);
    }

    /**
     * Handle app state changes (foreground/background)
     */
    private handleAppStateChange = (nextState: AppStateStatus): void => {
        console.log(`[MeshService] App state changed to: ${nextState}`);

        if (nextState === 'active') {
            // App came to foreground - reconnect if needed
            if (!this.connected) {
                console.log('[MeshService] App active - attempting reconnect');
                this.connect();
            } else {
                // Send heartbeat to verify connection
                this.sendHeartbeat();
            }
        } else if (nextState === 'background') {
            // Going to background - connection may be killed by Android
            console.log('[MeshService] App going to background');
        }
    };

    /**
     * Connect to the mesh relay (tries multiple hosts)
     */
    async connect(): Promise<boolean> {
        if (this.connected) {
            console.log('[MeshService] Already connected');
            return true;
        }

        if (this.reconnecting) {
            console.log('[MeshService] Already reconnecting...');
            return false;
        }

        this.connectionAttempts++;
        console.log(`[MeshService] Connection attempt #${this.connectionAttempts}`);

        // Try each host in order
        for (const host of RELAY_HOSTS) {
            try {
                const success = await this.tryConnect(host);
                if (success) {
                    this.connectedHost = host;
                    this.connectionAttempts = 0; // Reset on success
                    console.log(`[MeshService] Connected via ${host}`);
                    return true;
                }
            } catch (error) {
                console.log(`[MeshService] Failed to connect to ${host}:`, error);
            }
        }

        // All hosts failed - schedule reconnect
        console.log('[MeshService] All hosts failed, scheduling reconnect');
        this.scheduleReconnect();
        return false;
    }

    /**
     * Try connecting to a specific host
     */
    private tryConnect(host: string): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                const url = `ws://${host}:${DEFAULT_RELAY_PORT}`;
                console.log(`[MeshService] Trying ${url}...`);

                const ws = new WebSocket(url);
                let resolved = false;

                const timeout = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        console.log(`[MeshService] Timeout connecting to ${host}`);
                        try { ws.close(); } catch (e) { }
                        resolve(false);
                    }
                }, CONNECTION_TIMEOUT);

                ws.onopen = () => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeout);
                    console.log(`[MeshService] Connected to ${host}`);

                    this.ws = ws;
                    this.connected = true;
                    this.reconnecting = false;
                    this.lastMessageTime = Date.now();

                    this.setupWebSocketHandlers();
                    this.register();
                    this.startHeartbeat();
                    this.notifyConnectionCallbacks(true);
                    resolve(true);
                };

                ws.onerror = (error) => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeout);
                    console.log(`[MeshService] Error connecting to ${host}:`, error);
                    resolve(false);
                };

                ws.onclose = () => {
                    if (resolved) return;
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(false);
                };

            } catch (error) {
                console.error(`[MeshService] Exception connecting to ${host}:`, error);
                resolve(false);
            }
        });
    }

    /**
     * Set up WebSocket event handlers
     */
    private setupWebSocketHandlers(): void {
        if (!this.ws) return;

        this.ws.onmessage = (event) => {
            this.lastMessageTime = Date.now();
            this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
            console.error('[MeshService] WebSocket error:', error);
        };

        this.ws.onclose = (event) => {
            console.log(`[MeshService] Disconnected (code: ${event.code}, reason: ${event.reason})`);
            this.handleDisconnection();
        };
    }

    /**
     * Handle disconnection
     */
    private handleDisconnection(): void {
        const wasConnected = this.connected;
        this.connected = false;
        this.ws = null;
        this.stopHeartbeat();

        if (wasConnected) {
            this.notifyConnectionCallbacks(false);
        }

        // Only auto-reconnect if app is in foreground
        if (AppState.currentState === 'active') {
            this.scheduleReconnect();
        }
    }

    /**
     * Disconnect from the mesh
     */
    disconnect(): void {
        console.log('[MeshService] Disconnecting...');
        this.stopHeartbeat();

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        this.reconnecting = false;

        if (this.ws) {
            try {
                this.ws.close(1000, 'Client disconnect');
            } catch (e) { }
            this.ws = null;
        }

        this.connected = false;
    }

    /**
     * Register with the relay
     */
    private register(): void {
        const capabilities = [
            'llm', 'tools', 'notifications', 'sms',
            'camera', 'location', 'automation'
        ];

        this.send({
            type: 'register',
            agent: {
                id: this.agentId,
                name: this.agentName,
                type: 'phone',
                capabilities,
                status: 'online'
            }
        });
    }

    /**
     * Send a chat message
     */
    sendChat(to: string, content: string): boolean {
        if (!this.connected) {
            console.warn('[MeshService] Cannot send - not connected');
            return false;
        }

        const message: ChatMessage = {
            type: 'chat',
            id: this.generateId('msg'),
            from: this.agentId,
            to,
            content,
            timestamp: new Date().toISOString()
        };

        this.send(message as unknown as Record<string, unknown>);
        return true;
    }

    /**
     * Broadcast a chat message to all agents
     */
    broadcast(content: string): boolean {
        return this.sendChat('*', content);
    }

    /**
     * Send a task request to another agent
     */
    async sendTask(
        to: string,
        action: string,
        params: Record<string, unknown> = {},
        timeout: number = 30000
    ): Promise<TaskResultMessage> {
        return new Promise((resolve) => {
            if (!this.connected) {
                resolve({
                    type: 'task_result',
                    id: 'error',
                    from: to,
                    to: this.agentId,
                    success: false,
                    error: 'Not connected',
                    timestamp: new Date().toISOString()
                });
                return;
            }

            const taskId = this.generateId('task');

            const message: TaskMessage = {
                type: 'task',
                id: taskId,
                from: this.agentId,
                to,
                action,
                params,
                timeout,
                timestamp: new Date().toISOString()
            };

            const timeoutHandle = setTimeout(() => {
                this.pendingTasks.delete(taskId);
                resolve({
                    type: 'task_result',
                    id: taskId,
                    from: to,
                    to: this.agentId,
                    success: false,
                    error: 'Task timeout',
                    timestamp: new Date().toISOString()
                });
            }, timeout);

            this.pendingTasks.set(taskId, (result) => {
                clearTimeout(timeoutHandle);
                this.pendingTasks.delete(taskId);
                resolve(result);
            });

            this.send(message as unknown as Record<string, unknown>);
        });
    }

    /**
     * Update presence status
     */
    updatePresence(status: 'online' | 'busy' | 'idle', context?: string): void {
        this.send({
            type: 'presence',
            agent_id: this.agentId,
            status,
            context,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Request list of online agents
     */
    requestAgentList(): void {
        this.send({ type: 'list_agents' });
    }

    /**
     * Get cached list of agents
     */
    getAgents(): MeshAgent[] {
        return Array.from(this.agents.values());
    }

    /**
     * Subscribe to messages
     */
    onMessage(callback: MessageCallback): () => void {
        this.messageCallbacks.add(callback);
        return () => this.messageCallbacks.delete(callback);
    }

    /**
     * Subscribe to connection state changes
     */
    onConnectionChange(callback: ConnectionCallback): () => void {
        this.connectionCallbacks.add(callback);
        // Immediately notify of current state
        callback(this.connected);
        return () => this.connectionCallbacks.delete(callback);
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connected && this.ws !== null;
    }

    /**
     * Get own agent ID
     */
    getAgentId(): string {
        return this.agentId;
    }

    /**
     * Force reconnection
     */
    forceReconnect(): void {
        console.log('[MeshService] Force reconnect requested');
        this.disconnect();
        setTimeout(() => this.connect(), 500);
    }

    /**
     * Health check
     */
    checkHealth(): boolean {
        if (!this.connected || !this.ws) {
            this.scheduleReconnect();
            return false;
        }

        // Stale connection check (30 seconds)
        if (this.lastMessageTime > 0 && Date.now() - this.lastMessageTime > 30000) {
            console.log('[MeshService] Connection stale, reconnecting...');
            this.forceReconnect();
            return false;
        }

        return true;
    }

    /**
     * Cleanup on app close
     */
    cleanup(): void {
        this.disconnect();
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }
        this.initialized = false;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Internal Methods
    // ─────────────────────────────────────────────────────────────────────────────

    private send(message: Record<string, unknown>): void {
        if (this.ws && this.connected) {
            try {
                this.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error('[MeshService] Send error:', error);
                this.handleDisconnection();
            }
        }
    }

    private handleMessage(data: string): void {
        try {
            const message = JSON.parse(data) as MeshMessage;

            // Handle specific message types
            switch (message.type) {
                case 'registered':
                    console.log('[MeshService] Registration confirmed');
                    this.requestAgentList();
                    break;

                case 'agents':
                    this.handleAgentsList(message as unknown as { agents: MeshAgent[] });
                    break;

                case 'presence':
                    this.handlePresence(message as PresenceMessage);
                    break;

                case 'task':
                    this.handleIncomingTask(message as TaskMessage);
                    break;

                case 'task_result':
                    this.handleTaskResult(message as TaskResultMessage);
                    break;

                case 'ping':
                    this.send({ type: 'pong', agent_id: this.agentId });
                    return;

                case 'error':
                    console.error('[MeshService] Server error:', (message as unknown as { error: string }).error);
                    break;
            }

            // Notify all callbacks
            this.messageCallbacks.forEach(cb => {
                try {
                    cb(message);
                } catch (e) {
                    console.error('[MeshService] Callback error:', e);
                }
            });

        } catch (error) {
            console.error('[MeshService] Failed to parse message:', error);
        }
    }

    private handleAgentsList(message: { agents: MeshAgent[] }): void {
        this.agents.clear();
        for (const agent of message.agents) {
            this.agents.set(agent.id, agent);
        }
        console.log(`[MeshService] Updated agents: ${this.agents.size}`);
    }

    private handlePresence(message: PresenceMessage): void {
        const { agent_id, status, context } = message;

        if (status === 'offline') {
            this.agents.delete(agent_id);
        } else {
            const existing = this.agents.get(agent_id);
            if (existing) {
                existing.status = status;
                existing.context = context;
                existing.lastSeen = message.timestamp;
            }
        }
    }

    private async handleIncomingTask(message: TaskMessage): Promise<void> {
        console.log(`[MeshService] Incoming task: ${message.action} from ${message.from}`);

        try {
            const result = await OrchestratorService.executeTool(
                message.action,
                message.params
            );

            this.send({
                type: 'task_result',
                id: message.id,
                from: this.agentId,
                to: message.from,
                success: result.success,
                result: result.data,
                error: result.error,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.send({
                type: 'task_result',
                id: message.id,
                from: this.agentId,
                to: message.from,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });
        }
    }

    private handleTaskResult(message: TaskResultMessage): void {
        const resolver = this.pendingTasks.get(message.id);
        if (resolver) {
            resolver(message);
        }
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();

        // Send first heartbeat
        this.sendHeartbeat();

        // Then every 8 seconds
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, HEARTBEAT_INTERVAL);
    }

    private sendHeartbeat(): void {
        if (this.ws && this.connected) {
            this.send({
                type: 'heartbeat',
                agent_id: this.agentId,
                timestamp: new Date().toISOString()
            });
        }
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnecting) return;
        if (AppState.currentState !== 'active') {
            console.log('[MeshService] App not active, skipping reconnect');
            return;
        }

        this.reconnecting = true;

        // Exponential backoff: 1.5s, 3s, 6s, max 30s
        const delay = Math.min(RECONNECT_DELAY * Math.pow(2, Math.min(this.connectionAttempts, 4)), 30000);
        console.log(`[MeshService] Reconnecting in ${delay / 1000}s...`);

        this.reconnectTimeout = setTimeout(() => {
            this.reconnecting = false;
            this.connect();
        }, delay);
    }

    private notifyConnectionCallbacks(connected: boolean): void {
        this.connectionCallbacks.forEach(cb => {
            try {
                cb(connected);
            } catch (e) {
                console.error('[MeshService] Connection callback error:', e);
            }
        });
    }

    private generateId(prefix: string): string {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    }
}

export const MeshService = new MeshServiceClass();
