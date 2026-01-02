/**
 * Vault Service — Local Storage Operations
 * From Spec Part V & Part XII
 * 
 * Storage Layout:
 * /sdcard/MirrorBrain/
 * ├── Config/
 * ├── Models/
 * ├── Vault/
 * ├── Captures/
 * └── Logs/
 */

import RNFS from 'react-native-fs';
import type { VaultItem, CaptureItem, SessionClosure, ChatMessage } from '../types';

// Storage paths matching spec Part XII
// Using DocumentDirectoryPath for Android 13+ compatibility (scoped storage)
export const STORAGE_PATHS = {
    // Root - app-specific storage that doesn't require special permissions
    ROOT: `${RNFS.DocumentDirectoryPath}/MirrorBrain`,

    // Subdirectories
    CONFIG: 'Config',
    MODELS: 'Models',
    VAULT: 'Vault',
    CAPTURES: 'Captures',
    LOGS: 'Logs',

    // Config files
    IDENTITY: 'Config/identity.json',
    PREFERENCES: 'Config/preferences.json',
    MODELS_CONFIG: 'Config/models.json',

    // Vault subdirectories
    VAULT_CAPTURES: 'Vault/captures',
    VAULT_DECISIONS: 'Vault/decisions',
    VAULT_SESSIONS: 'Vault/sessions',

    // Capture subdirectories
    CAPTURES_NOTES: 'Captures/notes',
    CAPTURES_VOICE: 'Captures/voice',
    CAPTURES_SCREENSHOTS: 'Captures/screenshots',
} as const;

export interface VaultServiceConfig {
    rootPath: string;
}

interface StoredCapture {
    id: string;
    type: 'note' | 'voice' | 'screenshot';
    title: string;
    content: string;
    mediaPath?: string;
    createdAt: string;
    updatedAt: string;
    tags?: string[];
}

interface StoredDecision {
    id: string;
    decision: string;
    rationale: string;
    context?: string;
    createdAt: string;
}

interface StoredSession {
    id: string;
    messages: ChatMessage[];
    closure: SessionClosure;
    createdAt: string;
}

class VaultServiceClass {
    private rootPath: string = STORAGE_PATHS.ROOT;
    private initialized: boolean = false;

    /**
     * Initialize storage directories
     * Should be called on app startup
     */
    async initialize(config?: VaultServiceConfig): Promise<boolean> {
        if (config?.rootPath) {
            this.rootPath = config.rootPath;
        }

        try {
            const directories = [
                this.getPath(STORAGE_PATHS.CONFIG),
                this.getPath(STORAGE_PATHS.MODELS),
                this.getPath(STORAGE_PATHS.VAULT),
                this.getPath(STORAGE_PATHS.CAPTURES),
                this.getPath(STORAGE_PATHS.LOGS),
                this.getPath(STORAGE_PATHS.VAULT_CAPTURES),
                this.getPath(STORAGE_PATHS.VAULT_DECISIONS),
                this.getPath(STORAGE_PATHS.VAULT_SESSIONS),
                this.getPath(STORAGE_PATHS.CAPTURES_NOTES),
                this.getPath(STORAGE_PATHS.CAPTURES_VOICE),
                this.getPath(STORAGE_PATHS.CAPTURES_SCREENSHOTS),
            ];

            // Create all directories
            for (const dir of directories) {
                const exists = await RNFS.exists(dir);
                if (!exists) {
                    await RNFS.mkdir(dir);
                }
            }

            console.log('Vault initialized at:', this.rootPath);
            this.initialized = true;
            return true;
        } catch (error) {
            console.error('Failed to initialize vault:', error);
            return false;
        }
    }

    /**
     * Get full path for a storage location
     */
    getPath(subPath: string): string {
        return `${this.rootPath}/${subPath}`;
    }

    /**
     * Check if vault is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get root path
     */
    getRootPath(): string {
        return this.rootPath;
    }

    /**
     * Save a capture to vault
     */
    async saveCapture(
        type: 'note' | 'voice' | 'screenshot',
        content: string,
        title?: string,
        mediaPath?: string,
        tags?: string[]
    ): Promise<string | null> {
        if (!this.initialized) {
            console.error('Vault not initialized');
            return null;
        }

        const id = generateId();
        const timestamp = new Date().toISOString();

        const capture: StoredCapture = {
            id,
            type,
            title: title || `${type} - ${new Date().toLocaleDateString()}`,
            content,
            mediaPath,
            tags,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        try {
            const filePath = `${this.getPath(STORAGE_PATHS.VAULT_CAPTURES)}/${id}.json`;
            await RNFS.writeFile(filePath, JSON.stringify(capture, null, 2), 'utf8');
            console.log('Capture saved:', id);
            return id;
        } catch (error) {
            console.error('Failed to save capture:', error);
            return null;
        }
    }

    /**
     * Save a decision to vault
     */
    async saveDecision(
        decision: string,
        rationale: string,
        context?: string
    ): Promise<string | null> {
        if (!this.initialized) {
            console.error('Vault not initialized');
            return null;
        }

        const id = generateId();
        const timestamp = new Date().toISOString();

        const record: StoredDecision = {
            id,
            decision,
            rationale,
            context,
            createdAt: timestamp,
        };

        try {
            const filePath = `${this.getPath(STORAGE_PATHS.VAULT_DECISIONS)}/${id}.json`;
            await RNFS.writeFile(filePath, JSON.stringify(record, null, 2), 'utf8');
            console.log('Decision saved:', id);
            return id;
        } catch (error) {
            console.error('Failed to save decision:', error);
            return null;
        }
    }

    /**
     * Save a session summary to vault
     */
    async saveSession(
        messages: ChatMessage[],
        closure: SessionClosure
    ): Promise<string | null> {
        if (!this.initialized) {
            console.error('Vault not initialized');
            return null;
        }

        const id = generateId();
        const timestamp = new Date().toISOString();

        const session: StoredSession = {
            id,
            messages,
            closure,
            createdAt: timestamp,
        };

        try {
            const filePath = `${this.getPath(STORAGE_PATHS.VAULT_SESSIONS)}/${id}.json`;
            await RNFS.writeFile(filePath, JSON.stringify(session, null, 2), 'utf8');
            console.log('Session saved:', id);
            return id;
        } catch (error) {
            console.error('Failed to save session:', error);
            return null;
        }
    }

    /**
     * List items from vault
     */
    async listItems(
        type?: 'capture' | 'decision' | 'session'
    ): Promise<VaultItem[]> {
        const items: VaultItem[] = [];

        try {
            const paths: Array<{ path: string; itemType: VaultItem['type'] }> = [];

            if (!type || type === 'capture') {
                paths.push({ path: this.getPath(STORAGE_PATHS.VAULT_CAPTURES), itemType: 'capture' });
            }
            if (!type || type === 'decision') {
                paths.push({ path: this.getPath(STORAGE_PATHS.VAULT_DECISIONS), itemType: 'decision' });
            }
            if (!type || type === 'session') {
                paths.push({ path: this.getPath(STORAGE_PATHS.VAULT_SESSIONS), itemType: 'session' });
            }

            for (const { path, itemType } of paths) {
                const exists = await RNFS.exists(path);
                if (!exists) continue;

                const files = await RNFS.readDir(path);

                for (const file of files) {
                    if (!file.name.endsWith('.json')) continue;

                    try {
                        const content = await RNFS.readFile(file.path, 'utf8');
                        const data = JSON.parse(content);

                        items.push({
                            id: data.id,
                            type: itemType,
                            title: data.title || data.decision || `Session ${data.id.slice(0, 8)}`,
                            content: data.content || data.rationale || `${data.messages?.length || 0} messages`,
                            createdAt: new Date(data.createdAt),
                            updatedAt: new Date(data.updatedAt || data.createdAt),
                            tags: data.tags,
                        });
                    } catch (parseError) {
                        console.warn('Failed to parse vault item:', file.name);
                    }
                }
            }

            // Sort by date, newest first
            items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

            return items;
        } catch (error) {
            console.error('Failed to list vault items:', error);
            return [];
        }
    }

    /**
     * Search vault by keyword
     */
    async search(query: string): Promise<VaultItem[]> {
        const allItems = await this.listItems();
        const lowerQuery = query.toLowerCase();

        return allItems.filter(item =>
            item.title.toLowerCase().includes(lowerQuery) ||
            item.content.toLowerCase().includes(lowerQuery) ||
            item.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Get a specific item by ID
     */
    async getItem(id: string, type: VaultItem['type']): Promise<unknown | null> {
        try {
            let dir: string;
            switch (type) {
                case 'capture':
                    dir = this.getPath(STORAGE_PATHS.VAULT_CAPTURES);
                    break;
                case 'decision':
                    dir = this.getPath(STORAGE_PATHS.VAULT_DECISIONS);
                    break;
                case 'session':
                    dir = this.getPath(STORAGE_PATHS.VAULT_SESSIONS);
                    break;
            }

            const filePath = `${dir}/${id}.json`;
            const exists = await RNFS.exists(filePath);

            if (!exists) return null;

            const content = await RNFS.readFile(filePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Failed to get item:', error);
            return null;
        }
    }

    /**
     * Delete an item from vault
     * User can delete anything, anytime, completely
     */
    async deleteItem(id: string, type: VaultItem['type']): Promise<boolean> {
        try {
            let dir: string;
            switch (type) {
                case 'capture':
                    dir = this.getPath(STORAGE_PATHS.VAULT_CAPTURES);
                    break;
                case 'decision':
                    dir = this.getPath(STORAGE_PATHS.VAULT_DECISIONS);
                    break;
                case 'session':
                    dir = this.getPath(STORAGE_PATHS.VAULT_SESSIONS);
                    break;
            }

            const filePath = `${dir}/${id}.json`;
            const exists = await RNFS.exists(filePath);

            if (!exists) {
                console.warn('Item not found:', id);
                return false;
            }

            await RNFS.unlink(filePath);
            console.log('Item deleted:', id);
            return true;
        } catch (error) {
            console.error('Failed to delete item:', error);
            return false;
        }
    }

    /**
     * Export vault to user-selected location
     */
    async export(targetPath: string): Promise<boolean> {
        try {
            // Create backup directory
            const backupDir = `${targetPath}/MirrorBrain-Backup-${Date.now()}`;
            await RNFS.mkdir(backupDir);

            // Copy directories recursively
            await this.copyDirectory(
                this.getPath(STORAGE_PATHS.VAULT),
                `${backupDir}/Vault`
            );
            await this.copyDirectory(
                this.getPath(STORAGE_PATHS.CONFIG),
                `${backupDir}/Config`
            );

            console.log('Vault exported to:', backupDir);
            return true;
        } catch (error) {
            console.error('Failed to export vault:', error);
            return false;
        }
    }

    /**
     * Helper: Copy directory recursively
     */
    private async copyDirectory(source: string, dest: string): Promise<void> {
        const exists = await RNFS.exists(source);
        if (!exists) return;

        await RNFS.mkdir(dest);

        const files = await RNFS.readDir(source);
        for (const file of files) {
            const destPath = `${dest}/${file.name}`;
            if (file.isDirectory()) {
                await this.copyDirectory(file.path, destPath);
            } else {
                await RNFS.copyFile(file.path, destPath);
            }
        }
    }

    /**
     * Get storage usage info
     */
    async getStorageInfo(): Promise<{
        used: number;
        available: number;
        items: number;
    }> {
        try {
            const fsInfo = await RNFS.getFSInfo();
            const items = await this.listItems();

            return {
                used: fsInfo.totalSpace - fsInfo.freeSpace,
                available: fsInfo.freeSpace,
                items: items.length,
            };
        } catch (error) {
            console.error('Failed to get storage info:', error);
            return {
                used: 0,
                available: 0,
                items: 0,
            };
        }
    }

    /**
     * Check available space before operations
     * From spec Part IX: Alert user BEFORE operation fails
     */
    async hasSpaceFor(bytes: number): Promise<boolean> {
        try {
            const fsInfo = await RNFS.getFSInfo();
            return fsInfo.freeSpace > bytes + 100_000_000; // 100MB buffer
        } catch {
            return true; // Assume OK if check fails
        }
    }
}

/**
 * Generate a unique ID
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Singleton export
export const VaultService = new VaultServiceClass();

export default VaultService;
