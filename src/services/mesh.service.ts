/**
 * Mesh Service — Agent Communication Network
 *
 * WebSocket client for connecting to the MirrorDNA mesh relay.
 * Enables cross-agent chat, task delegation, and presence sharing.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { DeviceService } from './device.service';
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
    type: 'agents' | 'registered' | 'error';
    [key: string]: unknown;
};

type MessageCallback = (message: MeshMessage) => void;
type ConnectionCallback = (connected: boolean) => void;

// Default relay address (Tailscale IP of Mac)
const DEFAULT_RELAY_HOST = '100.114.247.53'; // active-mirror-hub Tailscale IP
const DEFAULT_RELAY_PORT = 8766;

class MeshServiceClass {
    private ws: WebSocket | null = null;
    private agentId: string = '';
    private agentName: string = '';
    private connected: boolean = false;
    private reconnecting: boolean = false;
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;

    private agents: Map<string, MeshAgent> = new Map();
    private messageCallbacks: Set<MessageCallback> = new Set();
    private connectionCallbacks: Set<ConnectionCallback> = new Set();
    private pendingTasks: Map<string, (result: TaskResultMessage) => void> = new Map();

    private relayHost: string = DEFAULT_RELAY_HOST;
    private relayPort: number = DEFAULT_RELAY_PORT;

    /**
     * Initialize the mesh service
     */
    async initialize(relayHost?: string, relayPort?: number): Promise<void> {
        if (relayHost) this.relayHost = relayHost;
        if (relayPort) this.relayPort = relayPort;

        // Get device info for agent identity
        const deviceInfo = await DeviceService.getDeviceInfo();
        this.agentId = `phone-${deviceInfo.deviceId.substring(0, 8)}`;
        this.agentName = deviceInfo.deviceName || 'MirrorBrain Phone';

        console.log(`[MeshService] Initialized as ${this.agentId}`);
    }

    /**
     * Connect to the mesh relay
     */
    async connect(): Promise<boolean> {
        if (this.connected || this.reconnecting) {
            return this.connected;
        }

        return new Promise((resolve) => {
            try {
                const url = `ws://${this.relayHost}:${this.relayPort}`;
                console.log(`[MeshService] Connecting to ${url}...`);

                this.ws = new WebSocket(url);

                this.ws.onopen = () => {
                    console.log('[MeshService] Connected to relay');
                    this.connected = true;
                    this.reconnecting = false;
                    this.register();
                    this.startHeartbeat();
                    this.notifyConnectionCallbacks(true);
                    resolve(true);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (error) => {
                    console.error('[MeshService] WebSocket error:', error);
                };

                this.ws.onclose = () => {
                    console.log('[MeshService] Disconnected from relay');
                    this.connected = false;
                    this.stopHeartbeat();
                    this.notifyConnectionCallbacks(false);
                    this.scheduleReconnect();
                    resolve(false);
                };

            } catch (error) {
                console.error('[MeshService] Connection error:', error);
                this.scheduleReconnect();
                resolve(false);
            }
        });
    }

    /**
     * Disconnect from the mesh
     */
    disconnect(): void {
        this.stopHeartbeat();
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.reconnecting = false;
    }

    /**
     * Register with the relay
     */
    private register(): void {
        const capabilities = [
            'llm',
            'tools',
            'notifications',
            'sms',
            'camera',
            'location',
            'automation'
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
    sendChat(to: string, content: string): void {
        const message: ChatMessage = {
            type: 'chat',
            id: this.generateId('msg'),
            from: this.agentId,
            to,
            content,
            timestamp: new Date().toISOString()
        };

        this.send(message);
    }

    /**
     * Broadcast a chat message to all agents
     */
    broadcast(content: string): void {
        this.sendChat('*', content);
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

            // Set up timeout
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

            // Store resolver
            this.pendingTasks.set(taskId, (result) => {
                clearTimeout(timeoutHandle);
                this.pendingTasks.delete(taskId);
                resolve(result);
            });

            this.send(message);
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
        return () => this.connectionCallbacks.delete(callback);
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Get own agent ID
     */
    getAgentId(): string {
        return this.agentId;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Internal Methods
    // ─────────────────────────────────────────────────────────────────────────────

    private send(message: Record<string, unknown>): void {
        if (this.ws && this.connected) {
            this.ws.send(JSON.stringify(message));
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
                    this.handleAgentsList(message as { agents: MeshAgent[] });
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

                case 'chat':
                    // Pass through to callbacks
                    break;

                case 'error':
                    console.error('[MeshService] Error:', (message as { error: string }).error);
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
        console.log(`[MeshService] Updated agents list: ${this.agents.size} agents`);
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
            // Execute task via orchestrator
            const result = await OrchestratorService.executeTool(
                message.action,
                message.params
            );

            // Send result back
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
        this.heartbeatInterval = setInterval(() => {
            this.send({
                type: 'heartbeat',
                agent_id: this.agentId
            });
        }, 15000);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnecting) return;

        this.reconnecting = true;
        console.log('[MeshService] Scheduling reconnect in 5s...');

        this.reconnectTimeout = setTimeout(() => {
            this.reconnecting = false;
            this.connect();
        }, 5000);
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
