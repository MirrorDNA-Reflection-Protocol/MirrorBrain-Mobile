/**
 * A2A Bridge — Agent-to-Agent Communication
 * 
 * Enables cross-device tool execution:
 * - This device can expose tools to other agents
 * - This device can call tools on remote agents
 * 
 * Transport: WebSocket over local network (Tailscale/LAN)
 * Protocol: JSON-based, MirrorDNA compatible
 */

import { OrchestratorService, type Tool, type ToolResult } from './orchestrator.service';

// A2A Message types
export interface A2ARequest {
    type: 'tool_call' | 'tool_list' | 'ping';
    id: string;
    source: DeviceIdentity;
    payload?: {
        tool?: string;
        params?: Record<string, unknown>;
    };
}

export interface A2AResponse {
    type: 'tool_result' | 'tool_list' | 'pong' | 'error';
    id: string;
    source: DeviceIdentity;
    payload?: {
        result?: ToolResult;
        tools?: ToolInfo[];
        error?: string;
    };
}

export interface DeviceIdentity {
    id: string;
    name: string;
    type: 'phone' | 'desktop' | 'tablet';
    capabilities: string[];
}

export interface ToolInfo {
    name: string;
    description: string;
    parameters: Tool['parameters'];
}

export interface RemoteDevice {
    identity: DeviceIdentity;
    address: string;
    lastSeen: Date;
    tools: ToolInfo[];
}

class A2ABridgeClass {
    private localIdentity: DeviceIdentity | null = null;
    private remoteDevices: Map<string, RemoteDevice> = new Map();
    private ws: WebSocket | null = null;
    private serverPort: number = 8765;
    private listeners: Set<(msg: A2ARequest | A2AResponse) => void> = new Set();

    /**
     * Initialize local device identity
     */
    setIdentity(identity: DeviceIdentity): void {
        this.localIdentity = identity;
    }

    /**
     * Get local identity
     */
    getIdentity(): DeviceIdentity | null {
        return this.localIdentity;
    }

    /**
     * Connect to a remote device
     */
    async connectTo(address: string): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                const ws = new WebSocket(`ws://${address}:${this.serverPort}`);

                ws.onopen = () => {
                    console.log(`[A2A] Connected to ${address}`);
                    this.ws = ws;
                    // Request tool list
                    this.send({ type: 'tool_list', id: this.generateId(), source: this.localIdentity! });
                    resolve(true);
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data) as A2AResponse;
                        this.handleMessage(msg);
                    } catch (e) {
                        console.warn('[A2A] Invalid message:', e);
                    }
                };

                ws.onerror = (error) => {
                    console.error('[A2A] Connection error:', error);
                    resolve(false);
                };

                ws.onclose = () => {
                    console.log('[A2A] Connection closed');
                    this.ws = null;
                };

            } catch (error) {
                console.error('[A2A] Failed to connect:', error);
                resolve(false);
            }
        });
    }

    /**
     * Handle incoming A2A message
     */
    private handleMessage(msg: A2AResponse): void {
        this.listeners.forEach(l => l(msg));

        switch (msg.type) {
            case 'tool_list':
                if (msg.payload?.tools && msg.source) {
                    this.remoteDevices.set(msg.source.id, {
                        identity: msg.source,
                        address: '', // Would need to track this
                        lastSeen: new Date(),
                        tools: msg.payload.tools,
                    });
                    // Register remote tools with orchestrator
                    this.registerRemoteTools(msg.source.id, msg.payload.tools);
                }
                break;
            case 'pong':
                console.log(`[A2A] Pong from ${msg.source.name}`);
                break;
        }
    }

    /**
     * Register tools from a remote device
     */
    private registerRemoteTools(deviceId: string, tools: ToolInfo[]): void {
        tools.forEach(t => {
            const remoteTool: Tool = {
                name: `${deviceId}:${t.name}`,
                description: `[Remote] ${t.description}`,
                parameters: t.parameters,
                execute: async (params) => this.callRemoteTool(deviceId, t.name, params),
                source: 'remote',
                deviceId,
            };
            OrchestratorService.registerTool(remoteTool);
        });
        console.log(`[A2A] Registered ${tools.length} tools from ${deviceId}`);
    }

    /**
     * Call a tool on a remote device
     */
    async callRemoteTool(
        deviceId: string,
        toolName: string,
        params: Record<string, unknown>
    ): Promise<ToolResult> {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return { success: false, error: 'Not connected to remote device' };
        }

        const id = this.generateId();
        const request: A2ARequest = {
            type: 'tool_call',
            id,
            source: this.localIdentity!,
            payload: { tool: toolName, params },
        };

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.listeners.delete(handler);
                resolve({ success: false, error: 'Request timeout' });
            }, 10000);

            const handler = (msg: A2ARequest | A2AResponse) => {
                if ('type' in msg && msg.type === 'tool_result' && msg.id === id) {
                    clearTimeout(timeout);
                    this.listeners.delete(handler);
                    resolve(msg.payload?.result || { success: false, error: 'No result' });
                }
            };

            this.listeners.add(handler);
            this.send(request);
        });
    }

    /**
     * Send message to connected device
     */
    private send(msg: A2ARequest | A2AResponse): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    /**
     * Generate unique request ID
     */
    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * List known remote devices
     */
    getRemoteDevices(): RemoteDevice[] {
        return Array.from(this.remoteDevices.values());
    }

    /**
     * Disconnect from current remote
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// Singleton export
export const A2ABridge = new A2ABridgeClass();

export default A2ABridge;
