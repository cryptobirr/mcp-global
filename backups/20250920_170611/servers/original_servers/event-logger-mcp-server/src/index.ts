#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { PostgresAgent, QueryExecutionResult } from './common/pg_agent.js';
import { ZodError, z } from 'zod';

console.log("Starting Event Logger MCP Server...");

// --- Zod Schemas for Tool Inputs ---

const LogEventArgsSchema = z.object({
    event_name: z.string().describe("Name of the event (e.g., 'journal_creation', 'file_scan')"),
    source: z.string().describe("Source of the event (e.g., 'journal_system', 'task_manager')"),
    resource_path: z.string().optional().describe("Path to the resource being acted upon (optional)"),
    details: z.record(z.any()).optional().describe("Additional details about the event (optional)"),
}).strict();

const QueryEventsArgsSchema = z.object({
    event_name: z.string().optional().describe("Filter by event name (optional)"),
    source: z.string().optional().describe("Filter by source (optional)"),
    resource_path: z.string().optional().describe("Filter by resource path (optional)"),
    start_date: z.string().optional().describe("Filter by start date (ISO format, optional)"),
    end_date: z.string().optional().describe("Filter by end date (ISO format, optional)"),
    limit: z.number().int().positive().optional().default(100).describe("Maximum number of events to return (default: 100)"),
    offset: z.number().int().nonnegative().optional().default(0).describe("Offset for pagination (default: 0)"),
}).strict();

// --- JSON Schemas for Tool Inputs ---

const LogEventInputSchema = {
    type: 'object' as const,
    properties: {
        event_name: { type: 'string', description: "Name of the event (e.g., 'journal_creation', 'file_scan')" },
        source: { type: 'string', description: "Source of the event (e.g., 'journal_system', 'task_manager')" },
        resource_path: { type: 'string', description: "Path to the resource being acted upon (optional)" },
        details: { type: 'object', description: "Additional details about the event (optional)" },
    },
    required: ['event_name', 'source'],
    additionalProperties: false,
};

const QueryEventsInputSchema = {
    type: 'object' as const,
    properties: {
        event_name: { type: 'string', description: "Filter by event name (optional)" },
        source: { type: 'string', description: "Filter by source (optional)" },
        resource_path: { type: 'string', description: "Filter by resource path (optional)" },
        start_date: { type: 'string', description: "Filter by start date (ISO format, optional)" },
        end_date: { type: 'string', description: "Filter by end date (ISO format, optional)" },
        limit: { type: 'integer', minimum: 1, default: 100, description: "Maximum number of events to return (default: 100)" },
        offset: { type: 'integer', minimum: 0, default: 0, description: "Offset for pagination (default: 0)" },
    },
    required: [],
    additionalProperties: false,
};

// --- Tool Definitions ---

const tools: Tool[] = [
    {
        name: 'log_event',
        description: 'Log a new event to the database',
        inputSchema: LogEventInputSchema,
    },
    {
        name: 'query_events',
        description: 'Query events from the database with filters',
        inputSchema: QueryEventsInputSchema,
    },
];

// --- Server Implementation ---

class EventLoggerMcpServer {
    private server: Server;
    private dbAgent: PostgresAgent;

    constructor() {
        console.log("Initializing EventLoggerMcpServer...");
        this.dbAgent = new PostgresAgent(); // Uses env vars by default
        this.server = new Server(
            {
                name: 'event-logger-mcp-server',
                version: '0.1.0',
            },
            {
                capabilities: {
                    resources: {}, // No resources defined for now
                    tools: {},
                },
            }
        );

        this.setupToolHandlers();

        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            console.log("Received SIGINT, shutting down...");
            await this.dbAgent.close();
            await this.server.close();
            process.exit(0);
        });
        console.log("EventLoggerMcpServer Initialized.");
    }

    private async ensureEventsTableExists(): Promise<void> {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS events (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                event_name VARCHAR(255) NOT NULL,
                source VARCHAR(255) NOT NULL,
                resource_path VARCHAR(255),
                details JSONB
            );
            
            -- Create indexes for efficient querying
            CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name);
            CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
            CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
            CREATE INDEX IF NOT EXISTS idx_events_resource_path ON events(resource_path);
        `;

        const result = await this.dbAgent.execute(createTableQuery);
        if (result.status === 'success') {
            console.log("Events table created or already exists");
        } else {
            console.error("Failed to create events table:", result.message);
            throw new Error(`Failed to create events table: ${result.message}`);
        }
    }

    private setupToolHandlers() {
        // List Tools Handler
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            console.log("Handling ListTools request.");
            return { tools };
        });

        // Call Tool Handler
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            console.log(`Handling CallTool request for tool: ${name} with args: ${JSON.stringify(args)}`);

            try {
                // Ensure the events table exists before handling any tool requests
                await this.ensureEventsTableExists();

                switch (name) {
                    case 'log_event':
                        return this.handleLogEvent(args);
                    case 'query_events':
                        return this.handleQueryEvents(args);
                    default:
                        console.error(`Unknown tool requested: ${name}`);
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
                }
            } catch (error: any) {
                console.error(`Error processing tool ${name}:`, error);
                // Handle Zod validation errors specifically
                if (error instanceof ZodError) {
                    throw new McpError(
                        ErrorCode.InvalidParams,
                        `Invalid arguments for tool ${name}: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
                    );
                }
                // Handle potential McpErrors thrown by handlers
                if (error instanceof McpError) {
                    throw error;
                }
                // Handle generic errors
                throw new McpError(ErrorCode.InternalError, `Error executing tool ${name}: ${error.message}`);
            }
        });
        console.log("Tool handlers set up.");
    }

    // --- Helper to format DB results for MCP ---
    private formatResult(dbResult: QueryExecutionResult) {
        if (dbResult.status === 'error') {
            throw new Error(dbResult.message || 'Unknown database error');
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        message: dbResult.message,
                        rows: dbResult.rows,
                        rowCount: dbResult.rowCount
                    }, null, 2)
                }
            ]
        };
    }

    // --- Individual Tool Handlers ---

    private async handleLogEvent(args: any) {
        const parsedArgs = LogEventArgsSchema.parse(args);
        console.log(`Logging event: ${parsedArgs.event_name} from source: ${parsedArgs.source}`);

        const query = `
            INSERT INTO events (event_name, source, resource_path, details)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;

        const params = [
            parsedArgs.event_name,
            parsedArgs.source,
            parsedArgs.resource_path || null,
            parsedArgs.details ? JSON.stringify(parsedArgs.details) : null
        ];

        return this.formatResult(await this.dbAgent.execute(query, params));
    }

    private async handleQueryEvents(args: any) {
        const parsedArgs = QueryEventsArgsSchema.parse(args);
        console.log(`Querying events with filters: ${JSON.stringify(parsedArgs)}`);

        let whereConditions = [];
        let params = [];
        let paramIndex = 1;

        if (parsedArgs.event_name) {
            whereConditions.push(`event_name = $${paramIndex++}`);
            params.push(parsedArgs.event_name);
        }

        if (parsedArgs.source) {
            whereConditions.push(`source = $${paramIndex++}`);
            params.push(parsedArgs.source);
        }

        if (parsedArgs.resource_path) {
            whereConditions.push(`resource_path = $${paramIndex++}`);
            params.push(parsedArgs.resource_path);
        }

        if (parsedArgs.start_date) {
            whereConditions.push(`timestamp >= $${paramIndex++}`);
            params.push(parsedArgs.start_date);
        }

        if (parsedArgs.end_date) {
            whereConditions.push(`timestamp <= $${paramIndex++}`);
            params.push(parsedArgs.end_date);
        }

        let query = `
            SELECT * FROM events
            ${whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''}
            ORDER BY timestamp DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++};
        `;

        params.push(parsedArgs.limit);
        params.push(parsedArgs.offset);

        return this.formatResult(await this.dbAgent.execute(query, params));
    }

    // --- Run Method ---
    async run() {
        console.log("Attempting to connect MCP server transport...");
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('Event Logger MCP server running on stdio');

        // Explicitly test DB connection on startup
        console.log("Testing database connection on startup...");
        const dbStatus = await this.dbAgent.connect();
        console.log(`Initial DB connection status: ${dbStatus}`);
        if (dbStatus.startsWith('Connection error:')) {
            throw new Error(`Database connection failed on startup: ${dbStatus}`);
        }
        console.log("Database connection verified.");

        // Ensure the events table exists
        await this.ensureEventsTableExists();
    }
}

// --- Start the Server ---
const server = new EventLoggerMcpServer();
server.run().catch(error => {
    console.error("Failed to start Event Logger MCP server:", error);
    process.exit(1);
});