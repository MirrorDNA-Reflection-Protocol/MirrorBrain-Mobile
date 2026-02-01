/**
 * Automation Service — Cross-App Action Execution
 *
 * Purpose: Execute actions in other apps via accessibility.
 * Provides high-level APIs for common automation tasks.
 */

import { NativeModules, Platform } from 'react-native';

const { AutomationModule } = NativeModules;

export interface ActionResult {
    success: boolean;
    message: string;
    data?: Record<string, unknown>;
}

export interface ClickableElement {
    text: string;
    viewId: string;
    className: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export type ScrollDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

class AutomationServiceClass {
    /**
     * Check if automation is available
     */
    isAvailable(): boolean {
        return Platform.OS === 'android' && AutomationModule != null;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Click Actions
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Click on element by text content
     */
    async clickByText(text: string, exact: boolean = false): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.clickByText(text, exact);
    }

    /**
     * Click on element by view ID (e.g., "com.whatsapp:id/send")
     */
    async clickById(viewId: string): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.clickById(viewId);
    }

    /**
     * Click at specific screen coordinates
     */
    async clickAt(x: number, y: number): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.clickAtCoordinates(x, y);
    }

    /**
     * Long press on element by text
     */
    async longPress(text: string): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.longPressByText(text);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Text Input
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Set text in an editable field
     */
    async setText(text: string, fieldHint?: string): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.setText(text, fieldHint || null);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Navigation
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Scroll in a direction
     */
    async scroll(direction: ScrollDirection): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.scroll(direction);
    }

    /**
     * Press the back button
     */
    async pressBack(): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.pressBack();
    }

    /**
     * Press the home button
     */
    async pressHome(): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.pressHome();
    }

    /**
     * Open recent apps
     */
    async openRecents(): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.openRecents();
    }

    /**
     * Open notification shade
     */
    async openNotifications(): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.openNotifications();
    }

    /**
     * Open quick settings
     */
    async openQuickSettings(): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.openQuickSettings();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Screen Analysis
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Get all clickable elements on screen
     */
    async getClickableElements(): Promise<ClickableElement[]> {
        if (!this.isAvailable()) {
            return [];
        }
        return AutomationModule.getClickableElements();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // High-Level App Actions
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Send a message via messaging app
     * Tries WhatsApp, Telegram, then default SMS
     */
    async sendMessage(contact: string, message: string): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.sendMessage(contact, message);
    }

    /**
     * Open a chat with a contact
     */
    async openChat(contact: string, preferredApp?: string): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.openChat(contact, preferredApp || null);
    }

    /**
     * Open an app by package name
     */
    async openApp(packageName: string): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.openApp(packageName);
    }

    /**
     * Open a URL in the browser
     */
    async openUrl(url: string): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.openUrl(url);
    }

    /**
     * Share text to an app
     */
    async shareText(text: string, targetPackage?: string): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.shareText(text, targetPackage || null);
    }

    /**
     * Create a calendar event
     */
    async createCalendarEvent(options: {
        title: string;
        description?: string;
        startTime?: number;
        endTime?: number;
    }): Promise<ActionResult> {
        if (!this.isAvailable()) {
            return { success: false, message: 'Automation not available' };
        }
        return AutomationModule.createCalendarEvent(options);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Convenience Methods
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Open WhatsApp chat with a phone number
     */
    async openWhatsApp(phoneNumber: string): Promise<ActionResult> {
        return this.openChat(phoneNumber, 'com.whatsapp');
    }

    /**
     * Send WhatsApp message
     */
    async sendWhatsApp(phoneNumber: string, message: string): Promise<ActionResult> {
        // This uses the WhatsApp-specific handler
        return this.sendMessage(phoneNumber, message);
    }

    /**
     * Open Telegram chat
     */
    async openTelegram(username: string): Promise<ActionResult> {
        return this.openChat(username, 'org.telegram.messenger');
    }

    /**
     * Open Slack
     */
    async openSlack(): Promise<ActionResult> {
        return this.openApp('com.Slack');
    }

    /**
     * Search on Google
     */
    async searchGoogle(query: string): Promise<ActionResult> {
        return this.openUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
    }

    /**
     * Navigate with Google Maps
     */
    async navigateTo(destination: string): Promise<ActionResult> {
        return this.openUrl(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`);
    }
}

export const AutomationService = new AutomationServiceClass();
