/**
 * MirrorBrain Mobile — Type Definitions
 * Core types matching spec requirements
 */

// Panel types from spec Part II
export type PanelName = 'NOW' | 'ASK' | 'VAULT' | 'ACTIONS';

// NOW Panel types from spec Part III
export interface NowPanelData {
    whereWeAre: string;           // 1 sentence — day, time context, location
    whatMatters: string[];        // ≤2 items
    whatToIgnore: string[];       // ≤2 items
    gentleAction: string | null;  // Single small completable task
    signals: Signal[];            // ≤2 items
}

export interface Signal {
    type: 'weather' | 'battery' | 'connectivity' | 'calendar';
    value: string;
    icon?: string;
}

// ASK Panel types from spec Part IV
export type AskMode = 'MirrorMesh' | 'Vault' | 'Online';

export interface MirrorMeshSession {
    id: string;
    started: Date;
    messages: ChatMessage[];
    closure: SessionClosure | null;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

// Session closure from spec Part IV
export type SessionClosure =
    | { type: 'decide'; decision: string; rationale: string }
    | { type: 'defer'; reason: string; revisitDate?: Date }
    | { type: 'next'; action: string }
    | { type: 'pause'; note?: string };

// VAULT types from spec Part V
export interface VaultItem {
    id: string;
    type: 'capture' | 'decision' | 'session';
    title: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    tags?: string[];
}

export interface CaptureItem extends VaultItem {
    type: 'capture';
    captureType: 'note' | 'voice' | 'screenshot';
    mediaPath?: string;
}

// Identity from spec Part VIII
export interface IdentityKernel {
    version: string;
    seed: MirrorSeed;
    loadedAt: Date;
}

export interface MirrorSeed {
    name?: string;
    values?: string[];
    context?: string;
    // Additional fields from Mirror Seed spec
    [key: string]: unknown;
}

// App state
export interface AppState {
    currentPanel: PanelName;
    isOnline: boolean;
    identity: IdentityKernel | null;
    llmLoaded: boolean;
    llmLoading: boolean;
}

// LLM types
export interface LLMConfig {
    modelPath: string;
    contextSize: number;
    gpuLayers: number;
}

export interface CompletionResult {
    text: string;
    tokensPerSecond: number;
    totalTokens: number;
}
