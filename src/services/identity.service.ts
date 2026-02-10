/**
 * Identity Service — Mirror Seed & MirrorDNA Integration
 * From Spec Part VIII
 * 
 * Connects to MirrorBrain server to fetch identity kernel.
 * Falls back to cached identity when offline.
 */

import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_PATHS } from './vault.service';

// MirrorBrain server endpoint — configurable via AsyncStorage
const DEFAULT_HOST = 'http://192.168.1.100:8083';
const HOST_STORAGE_KEY = '@mirrorbrain/host';

const IDENTITY_CACHE_KEY = '@mirrorbrain/identity';
const IDENTITY_FILE = 'Config/identity.json';

export interface IdentityKernel {
    version: string;
    name?: string;
    values?: string[];
    context?: string;
    timezone?: string;
    loadedAt: Date;
    // Extended MirrorDNA fields
    persona?: {
        tone?: string;
        voice?: string;
        approach?: string;
    };
    moodTrace?: {
        energy?: string;
        focus?: string;
        rhythm?: string;
    };
    temporalProfile?: {
        ageInDays?: number;
        lastActive?: string;
    };
}

export interface MirrorSeed {
    name: string;
    values?: string[];
    context?: string;
    timezone?: string;
}

class IdentityServiceClass {
    private kernel: IdentityKernel | null = null;
    private isLoading: boolean = false;
    private hostOverride: string | null = null;

    /**
     * Initialize identity service — try to load cached identity
     */
    async initialize(): Promise<boolean> {
        try {
            // Load saved host override
            const savedHost = await AsyncStorage.getItem(HOST_STORAGE_KEY);
            if (savedHost) this.hostOverride = savedHost;

            const cached = await this.loadFromCache();
            if (cached) {
                this.kernel = cached;
                console.log('Identity loaded from cache:', this.kernel.name);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to initialize identity:', error);
            return false;
        }
    }

    /**
     * Get the configured server host
     */
    getHost(): string {
        return this.hostOverride || DEFAULT_HOST;
    }

    /**
     * Set the MirrorBrain server host (persisted to AsyncStorage)
     */
    async setHost(host: string): Promise<void> {
        this.hostOverride = host;
        await AsyncStorage.setItem(HOST_STORAGE_KEY, host);
        console.log('Identity server host set to:', host);
    }

    /**
     * Fetch identity from MirrorBrain server
     */
    async fetchFromServer(host?: string): Promise<boolean> {
        if (this.isLoading) return false;
        this.isLoading = true;

        const serverHost = host || this.getHost();

        try {
            // Fetch identity kernel from MirrorBrain MCP
            const response = await fetch(`${serverHost}/api/identity`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                // Short timeout for local network
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();

            this.kernel = {
                version: data.version || '1.0',
                name: data.name || data.human_name || 'Unknown',
                values: data.values || data.core_values || [],
                context: data.context || data.mission || '',
                timezone: data.timezone || 'Asia/Kolkata',
                persona: data.persona,
                moodTrace: data.mood_trace,
                temporalProfile: data.temporal_profile,
                loadedAt: new Date(),
            };

            // Cache for offline use
            await this.saveToCache();

            console.log('Identity fetched from server:', this.kernel.name);
            this.isLoading = false;
            return true;
        } catch (error) {
            console.warn('Failed to fetch identity from server:', error);
            this.isLoading = false;
            return false;
        }
    }

    /**
     * Import identity from text (paste) or JSON data
     */
    async importIdentity(seedData: string | MirrorSeed): Promise<boolean> {
        try {
            let seed: MirrorSeed;

            if (typeof seedData === 'string') {
                seed = JSON.parse(seedData);
            } else {
                seed = seedData;
            }

            this.kernel = {
                version: '1.0',
                name: seed.name,
                values: seed.values,
                context: seed.context,
                timezone: seed.timezone,
                loadedAt: new Date(),
            };

            // Save to cache and file
            await this.saveToCache();
            await this.saveToFile();

            console.log('Identity imported:', this.kernel.name);
            return true;
        } catch (error) {
            console.error('Failed to import identity:', error);
            return false;
        }
    }

    /**
     * Check if identity is loaded
     */
    hasIdentity(): boolean {
        return this.kernel !== null;
    }

    /**
     * Get current identity kernel
     */
    getKernel(): IdentityKernel | null {
        return this.kernel;
    }

    /**
     * Get rich identity context for MirrorMesh prompts
     * This is the key method for LLM personalization
     */
    getContext(): string {
        if (!this.kernel) {
            return '';
        }

        const parts: string[] = [];

        // Core identity
        if (this.kernel.name) {
            parts.push(`Human: ${this.kernel.name}`);
        }
        if (this.kernel.values && this.kernel.values.length > 0) {
            parts.push(`Core Values: ${this.kernel.values.join(', ')}`);
        }
        if (this.kernel.context) {
            parts.push(`Context: ${this.kernel.context}`);
        }
        if (this.kernel.timezone) {
            parts.push(`Timezone: ${this.kernel.timezone}`);
        }

        // Persona profile
        if (this.kernel.persona) {
            const { tone, voice, approach } = this.kernel.persona;
            if (tone) parts.push(`Persona Tone: ${tone}`);
            if (voice) parts.push(`Voice Style: ${voice}`);
            if (approach) parts.push(`Approach: ${approach}`);
        }

        // Mood trace
        if (this.kernel.moodTrace) {
            const { energy, focus, rhythm } = this.kernel.moodTrace;
            if (energy) parts.push(`Current Energy: ${energy}`);
            if (focus) parts.push(`Focus State: ${focus}`);
            if (rhythm) parts.push(`Work Rhythm: ${rhythm}`);
        }

        return parts.join('\n');
    }

    /**
     * Get user's name for display
     */
    getName(): string {
        return this.kernel?.name || 'User';
    }

    /**
     * Clear identity (user logout)
     */
    async clearIdentity(): Promise<void> {
        this.kernel = null;
        try {
            await AsyncStorage.removeItem(IDENTITY_CACHE_KEY);
            const filePath = `${STORAGE_PATHS.ROOT}/${IDENTITY_FILE}`;
            if (await RNFS.exists(filePath)) {
                await RNFS.unlink(filePath);
            }
        } catch (error) {
            console.warn('Failed to clear identity:', error);
        }
        console.log('Identity cleared');
    }

    /**
     * Export identity for backup
     */
    async exportIdentity(): Promise<string | null> {
        if (!this.kernel) {
            return null;
        }
        return JSON.stringify(this.kernel, null, 2);
    }

    /**
     * Get deep link URL for creating identity
     */
    getCreateIdentityUrl(): string {
        return 'https://id.activemirror.ai';
    }

    // Private helpers

    private async loadFromCache(): Promise<IdentityKernel | null> {
        try {
            const cached = await AsyncStorage.getItem(IDENTITY_CACHE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                data.loadedAt = new Date(data.loadedAt);
                return data;
            }
        } catch (error) {
            console.warn('Failed to load identity from cache:', error);
        }
        return null;
    }

    private async saveToCache(): Promise<void> {
        if (!this.kernel) return;
        try {
            await AsyncStorage.setItem(IDENTITY_CACHE_KEY, JSON.stringify(this.kernel));
        } catch (error) {
            console.warn('Failed to save identity to cache:', error);
        }
    }

    private async saveToFile(): Promise<void> {
        if (!this.kernel) return;
        try {
            const filePath = `${STORAGE_PATHS.ROOT}/${IDENTITY_FILE}`;
            await RNFS.writeFile(filePath, JSON.stringify(this.kernel, null, 2), 'utf8');
        } catch (error) {
            console.warn('Failed to save identity to file:', error);
        }
    }
}

// Singleton export
export const IdentityService = new IdentityServiceClass();

export default IdentityService;

