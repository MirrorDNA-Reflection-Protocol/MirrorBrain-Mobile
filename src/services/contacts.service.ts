/**
 * Contacts Service — Priority Contacts
 * 
 * Manage priority contacts for notifications and quick access.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

export interface PriorityContact {
    id: string;
    name: string;
    phone?: string;
    phoneNumber?: string; // alias for phone
    email?: string;
    emoji?: string;
}

const CONTACTS_KEY = '@mirrorbrain/priority_contacts';

// Default contacts (user customizable)
const DEFAULT_CONTACTS: PriorityContact[] = [
    { id: '1', name: 'Mom', emoji: '👩' },
    { id: '2', name: 'Dad', emoji: '👨' },
    { id: '3', name: 'Partner', emoji: '❤️' },
    { id: '4', name: 'Work', emoji: '💼' },
];

class ContactsServiceClass {
    private contacts: PriorityContact[] = [];
    private initialized = false;

    /**
     * Initialize and load contacts
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            const stored = await AsyncStorage.getItem(CONTACTS_KEY);
            if (stored) {
                this.contacts = JSON.parse(stored);
            } else {
                this.contacts = DEFAULT_CONTACTS;
                await this.saveContacts();
            }
            this.initialized = true;
        } catch (error) {
            console.error('Failed to load contacts:', error);
            this.contacts = DEFAULT_CONTACTS;
            this.initialized = true;
        }
    }

    /**
     * Get all priority contacts
     */
    async getContacts(): Promise<PriorityContact[]> {
        await this.initialize();
        return this.contacts;
    }

    /**
     * Add a contact
     */
    async addContact(contact: Omit<PriorityContact, 'id'>): Promise<PriorityContact> {
        await this.initialize();

        const newContact: PriorityContact = {
            ...contact,
            id: `contact-${Date.now()}`,
        };

        this.contacts.push(newContact);
        await this.saveContacts();
        return newContact;
    }

    /**
     * Update a contact
     */
    async updateContact(id: string, updates: Partial<PriorityContact>): Promise<void> {
        await this.initialize();

        const index = this.contacts.findIndex(c => c.id === id);
        if (index >= 0) {
            this.contacts[index] = { ...this.contacts[index], ...updates };
            await this.saveContacts();
        }
    }

    /**
     * Remove a contact
     */
    async removeContact(id: string): Promise<void> {
        await this.initialize();
        this.contacts = this.contacts.filter(c => c.id !== id);
        await this.saveContacts();
    }

    /**
     * Call a contact
     */
    async call(contact: PriorityContact): Promise<boolean> {
        if (!contact.phone) return false;

        try {
            await Linking.openURL(`tel:${contact.phone}`);
            return true;
        } catch (error) {
            console.error('Failed to call:', error);
            return false;
        }
    }

    /**
     * Message a contact
     */
    async message(contact: PriorityContact): Promise<boolean> {
        if (!contact.phone) return false;

        try {
            await Linking.openURL(`sms:${contact.phone}`);
            return true;
        } catch (error) {
            console.error('Failed to message:', error);
            return false;
        }
    }

    /**
     * Email a contact
     */
    async email(contact: PriorityContact): Promise<boolean> {
        if (!contact.email) return false;

        try {
            await Linking.openURL(`mailto:${contact.email}`);
            return true;
        } catch (error) {
            console.error('Failed to email:', error);
            return false;
        }
    }

    /**
     * Check if a sender is a priority contact
     */
    isPriority(senderName: string): boolean {
        return this.contacts.some(c =>
            c.name.toLowerCase() === senderName.toLowerCase()
        );
    }

    /**
     * Save contacts to storage
     */
    private async saveContacts(): Promise<void> {
        try {
            await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(this.contacts));
        } catch (error) {
            console.error('Failed to save contacts:', error);
        }
    }

    /**
     * Search contacts by name
     * Used by ActionExecutor for message and call intents
     */
    async search(query: string): Promise<PriorityContact[]> {
        await this.initialize();
        if (!query || query.trim().length === 0) return [];

        const lowerQuery = query.toLowerCase();
        return this.contacts.filter(c =>
            c.name.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Get priority contacts (alias for getContacts)
     * Used by BriefingService and NotificationFilter
     */
    async getPriorityContacts(): Promise<PriorityContact[]> {
        return this.getContacts();
    }
}

// Singleton export
export const ContactsService = new ContactsServiceClass();

export default ContactsService;
