/**
 * OCR Service — Screenshot Text Extraction
 *
 * Purpose: Extract text from screenshots using ML Kit.
 * Listens for screenshot events and processes them automatically.
 */

import {
    NativeModules,
    NativeEventEmitter,
    Platform,
} from 'react-native';
import { VaultService } from './vault.service';

const { OCRModule } = NativeModules;

export interface OCRResult {
    fullText: string;
    blocks: OCRBlock[];
    confidence: number;
    processingTimeMs: number;
}

export interface OCRBlock {
    text: string;
    lines: OCRLine[];
    boundingBox?: BoundingBox;
}

export interface OCRLine {
    text: string;
    confidence: number;
    boundingBox?: BoundingBox;
}

export interface BoundingBox {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface ExtractedPatterns {
    urls: string[];
    emails: string[];
    phones: string[];
    dates: string[];
    times: string[];
}

export interface ScreenshotEvent {
    path: string;
    filename: string;
    size: number;
    timestamp: number;
}

export interface ScreenshotCapture {
    event: ScreenshotEvent;
    ocrResult?: OCRResult;
    patterns?: ExtractedPatterns;
    savedToVault?: boolean;
}

type ScreenshotCallback = (capture: ScreenshotCapture) => void;

class OCRServiceClass {
    private emitter: NativeEventEmitter | null = null;
    private subscription: any = null;
    private callbacks: Set<ScreenshotCallback> = new Set();
    private autoSaveToVault: boolean = true;
    private autoOCR: boolean = true;

    /**
     * Start listening for screenshots
     */
    async start(options?: {
        autoOCR?: boolean;
        autoSaveToVault?: boolean;
    }): Promise<boolean> {
        if (Platform.OS !== 'android' || !OCRModule) {
            console.warn('[OCRService] Only available on Android');
            return false;
        }

        this.autoOCR = options?.autoOCR ?? true;
        this.autoSaveToVault = options?.autoSaveToVault ?? true;

        try {
            await OCRModule.startScreenshotObserver();

            // Set up event listener
            this.emitter = new NativeEventEmitter(OCRModule);
            this.subscription = this.emitter.addListener(
                'onScreenshotCaptured',
                this.handleScreenshot.bind(this)
            );

            console.log('[OCRService] Started screenshot observation');
            return true;
        } catch (error) {
            console.error('[OCRService] Failed to start:', error);
            return false;
        }
    }

    /**
     * Stop listening for screenshots
     */
    async stop(): Promise<void> {
        if (this.subscription) {
            this.subscription.remove();
            this.subscription = null;
        }

        if (OCRModule) {
            await OCRModule.stopScreenshotObserver();
        }

        console.log('[OCRService] Stopped');
    }

    /**
     * Subscribe to screenshot captures
     */
    subscribe(callback: ScreenshotCallback): () => void {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    /**
     * Extract text from an image path
     */
    async extractText(imagePath: string): Promise<OCRResult | null> {
        if (Platform.OS !== 'android' || !OCRModule) {
            return null;
        }

        try {
            const result = await OCRModule.extractText(imagePath);
            return result as OCRResult;
        } catch (error) {
            console.error('[OCRService] OCR failed:', error);
            return null;
        }
    }

    /**
     * Extract patterns (URLs, emails, etc.) from text
     */
    extractPatterns(text: string): ExtractedPatterns {
        const patterns: ExtractedPatterns = {
            urls: [],
            emails: [],
            phones: [],
            dates: [],
            times: [],
        };

        // URLs
        const urlRegex = /https?:\/\/[^\s]+/g;
        patterns.urls = text.match(urlRegex) || [];

        // Emails
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        patterns.emails = text.match(emailRegex) || [];

        // Phone numbers
        const phoneRegex = /[\+]?[(]?[0-9]{1,3}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}/g;
        patterns.phones = text.match(phoneRegex) || [];

        // Dates
        const dateRegex = /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g;
        patterns.dates = text.match(dateRegex) || [];

        // Times
        const timeRegex = /\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?/gi;
        patterns.times = text.match(timeRegex) || [];

        return patterns;
    }

    /**
     * Handle screenshot event
     */
    private async handleScreenshot(event: ScreenshotEvent): Promise<void> {
        console.log('[OCRService] Screenshot detected:', event.filename);

        const capture: ScreenshotCapture = {
            event,
        };

        // Run OCR if enabled
        if (this.autoOCR) {
            const ocrResult = await this.extractText(event.path);
            if (ocrResult && ocrResult.fullText) {
                capture.ocrResult = ocrResult;
                capture.patterns = this.extractPatterns(ocrResult.fullText);

                // Auto-save to vault if enabled and text was found
                if (this.autoSaveToVault && ocrResult.fullText.length > 10) {
                    capture.savedToVault = await this.saveToVault(capture);
                }
            }
        }

        // Notify subscribers
        this.callbacks.forEach(cb => {
            try {
                cb(capture);
            } catch (error) {
                console.error('[OCRService] Callback error:', error);
            }
        });
    }

    /**
     * Save screenshot capture to vault
     */
    private async saveToVault(capture: ScreenshotCapture): Promise<boolean> {
        if (!capture.ocrResult?.fullText) return false;

        try {
            const { event, ocrResult, patterns } = capture;
            const date = new Date(event.timestamp).toLocaleDateString();
            const preview = ocrResult.fullText.slice(0, 100);

            // Build content
            let content = `**Screenshot captured:** ${date}\n\n`;
            content += `## Extracted Text\n\n${ocrResult.fullText}\n\n`;

            // Add patterns if found
            if (patterns) {
                const patternParts: string[] = [];
                if (patterns.urls.length > 0) {
                    patternParts.push(`**URLs:** ${patterns.urls.join(', ')}`);
                }
                if (patterns.emails.length > 0) {
                    patternParts.push(`**Emails:** ${patterns.emails.join(', ')}`);
                }
                if (patterns.phones.length > 0) {
                    patternParts.push(`**Phones:** ${patterns.phones.join(', ')}`);
                }

                if (patternParts.length > 0) {
                    content += `## Extracted Data\n\n${patternParts.join('\n')}\n`;
                }
            }

            await VaultService.createSpark(
                `Screenshot: ${preview}...\n\n${content}`,
                'screenshot'
            );

            console.log('[OCRService] Saved to vault');
            return true;
        } catch (error) {
            console.error('[OCRService] Failed to save to vault:', error);
            return false;
        }
    }

    /**
     * Process an existing image file
     */
    async processImage(imagePath: string): Promise<ScreenshotCapture | null> {
        const ocrResult = await this.extractText(imagePath);
        if (!ocrResult) return null;

        const capture: ScreenshotCapture = {
            event: {
                path: imagePath,
                filename: imagePath.split('/').pop() || 'unknown',
                size: 0,
                timestamp: Date.now(),
            },
            ocrResult,
            patterns: this.extractPatterns(ocrResult.fullText),
        };

        return capture;
    }

    /**
     * Check if OCR module is available
     */
    isAvailable(): boolean {
        return Platform.OS === 'android' && OCRModule != null;
    }
}

export const OCRService = new OCRServiceClass();
