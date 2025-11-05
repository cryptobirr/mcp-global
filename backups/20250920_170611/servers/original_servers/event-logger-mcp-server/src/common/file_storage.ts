import fs from 'fs';
import path from 'path';

// Define the event interface
export interface Event {
    id: number;
    timestamp: string;
    event_name: string;
    source: string;
    resource_path?: string;
    details?: any;
}

// Define the storage interface
export interface EventStorage {
    logEvent(event: Omit<Event, 'id' | 'timestamp'>): Promise<Event>;
    queryEvents(filters: {
        event_name?: string;
        source?: string;
        resource_path?: string;
        start_date?: string;
        end_date?: string;
        limit?: number;
        offset?: number;
    }): Promise<Event[]>;
}

// File-based storage implementation
export class FileEventStorage implements EventStorage {
    private filePath: string;
    private events: Event[] = [];
    private nextId: number = 1;

    constructor(filePath: string = path.join(process.cwd(), 'events.json')) {
        this.filePath = filePath;
        this.loadEvents();
    }

    private loadEvents(): void {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                const storage = JSON.parse(data);
                this.events = storage.events || [];
                this.nextId = storage.nextId || 1;
            } else {
                this.events = [];
                this.nextId = 1;
                this.saveEvents(); // Create the file
            }
        } catch (error) {
            console.error('Error loading events:', error);
            this.events = [];
            this.nextId = 1;
        }
    }

    private saveEvents(): void {
        try {
            const storage = {
                events: this.events,
                nextId: this.nextId
            };
            fs.writeFileSync(this.filePath, JSON.stringify(storage, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving events:', error);
        }
    }

    async logEvent(event: Omit<Event, 'id' | 'timestamp'>): Promise<Event> {
        const newEvent: Event = {
            id: this.nextId++,
            timestamp: new Date().toISOString(),
            ...event
        };
        
        this.events.push(newEvent);
        this.saveEvents();
        
        return newEvent;
    }

    async queryEvents(filters: {
        event_name?: string;
        source?: string;
        resource_path?: string;
        start_date?: string;
        end_date?: string;
        limit?: number;
        offset?: number;
    }): Promise<Event[]> {
        let results = [...this.events];
        
        // Apply filters
        if (filters.event_name) {
            results = results.filter(event => event.event_name === filters.event_name);
        }
        
        if (filters.source) {
            results = results.filter(event => event.source === filters.source);
        }
        
        if (filters.resource_path) {
            results = results.filter(event => event.resource_path === filters.resource_path);
        }
        
        if (filters.start_date) {
            const startDate = new Date(filters.start_date).getTime();
            results = results.filter(event => new Date(event.timestamp).getTime() >= startDate);
        }
        
        if (filters.end_date) {
            const endDate = new Date(filters.end_date).getTime();
            results = results.filter(event => new Date(event.timestamp).getTime() <= endDate);
        }
        
        // Sort by timestamp (newest first)
        results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        // Apply pagination
        const offset = filters.offset || 0;
        const limit = filters.limit || 100;
        
        return results.slice(offset, offset + limit);
    }
}