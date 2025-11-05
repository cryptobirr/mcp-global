#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { drizzle } from 'drizzle-orm/libsql'; // Use libsql driver
import { createClient, Client } from '@libsql/client'; // Import libsql client
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { eq, and, desc, isNull, sql } from 'drizzle-orm'; // Import sql
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables from .env file in the MCP server directory
dotenv.config();

// --- Database Setup ---

// Use environment variables expected by @libsql/client for D1
if (!process.env.D1_DATABASE_URL) {
  throw new Error('D1_DATABASE_URL environment variable is not set');
}
if (!process.env.D1_AUTH_TOKEN) {
  throw new Error('D1_AUTH_TOKEN environment variable is not set');
}

// Define the schema directly here (ideally share from main app)
// Ensure this matches the schema in the main application exactly
const timeLogEntries = sqliteTable(
  'time_log_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    taskDescription: text('task_description').notNull(),
    startTime: integer('start_time', { mode: 'timestamp_ms' }).notNull(),
    stopTime: integer('stop_time', { mode: 'timestamp_ms' }),
    durationMs: integer('duration_ms'),
    // Remove $defaultFn and $onUpdateFn, set manually
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    userIdIdx: index('idx_time_log_entries_user_id').on(table.userId),
    startTimeIdx: index('idx_time_log_entries_start_time').on(table.startTime),
    userIdTaskDescIdx: index('idx_time_log_entries_user_task_desc').on(table.userId, table.taskDescription),
  })
);

// Define the schema object to pass to drizzle
const schema = { timeLogEntries };

// Create libSQL client and Drizzle instance
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDb() {
  if (!db) {
    try {
      const client: Client = createClient({
        url: process.env.D1_DATABASE_URL!,
        authToken: process.env.D1_AUTH_TOKEN!,
      });
      db = drizzle(client, { schema }); // Pass the schema object
      console.log('Database connection initialized via @libsql/client.');
    } catch (error: any) {
        console.error("Failed to initialize database connection:", error);
        throw new Error("Database initialization failed.");
    }
  }
  return db;
}


// --- MCP Server Implementation ---

class TimeTrackerServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'time-tracker-mcp-server',
        version: '0.3.3', // Incremented version patch
        description: 'MCP server for starting and stopping time tracking logs in the D1 database.',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // List Tools Handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'start_task',
          description: 'Starts the timer for a given task description by creating a database entry.',
          inputSchema: {
            type: 'object',
            properties: {
              task_description: {
                type: 'string',
                description: 'A unique description of the task being started.',
              },
              user_id: {
                type: 'string',
                description: 'The ID of the user starting the task.',
              },
            },
            required: ['task_description', 'user_id'],
          },
        },
        {
          name: 'stop_task',
          description: 'Stops the timer for a task, calculates duration, and updates the database entry.',
          inputSchema: {
            type: 'object',
            properties: {
              task_description: {
                type: 'string',
                description: 'The description of the task to stop (must match an active start_task description for the user).',
              },
              user_id: {
                type: 'string',
                description: 'The ID of the user stopping the task.',
              },
            },
            required: ['task_description', 'user_id'],
          },
        },
      ],
    }));

    // Call Tool Handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const dbInstance = getDb();

      if (name === 'start_task') {
        if (!args || typeof args.task_description !== 'string' || typeof args.user_id !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid task_description or user_id arguments.');
        }
        const taskDesc = args.task_description;
        const userId = args.user_id;
        const startTimeMs = Date.now(); // Get timestamp as number
        const now = new Date(); // Get current Date object

        // Check if an active task with the same description already exists for this user
        const existingActive = await dbInstance.query.timeLogEntries.findFirst({
            where: and(
                eq(timeLogEntries.userId, userId),
                eq(timeLogEntries.taskDescription, taskDesc),
                isNull(timeLogEntries.stopTime)
            )
        });

        if (existingActive) {
            console.warn(`Task "${taskDesc}" for user ${userId} was already running. Restarting timer by updating start time.`);
            // Update existing entry's start time (effectively restarting)
            await dbInstance.update(timeLogEntries)
                .set({
                    startTime: new Date(startTimeMs), // Convert number to Date
                    updatedAt: now // Set updatedAt manually
                 })
                .where(eq(timeLogEntries.id, existingActive.id));
             return { content: [{ type: 'text', text: `Timer restarted for task: "${taskDesc}"` }] };
        }

        // Insert new entry
        const newEntryId = uuidv4();
        try {
            await dbInstance.insert(timeLogEntries).values({
                id: newEntryId,
                userId: userId,
                taskDescription: taskDesc,
                startTime: new Date(startTimeMs), // Convert number to Date
                createdAt: now, // Set createdAt manually
                updatedAt: now, // Set updatedAt manually
            });
            console.log(`Task started: "${taskDesc}" for user ${userId} at ${new Date(startTimeMs).toISOString()}`);
            return { content: [{ type: 'text', text: `Timer started for task: "${taskDesc}"` }] };
        } catch (error: any) {
            console.error(`Failed to insert start_task entry for "${taskDesc}" (User: ${userId}):`, error);
            throw new McpError(ErrorCode.InternalError, `Database error starting task: ${error.message}`);
        }

      } else if (name === 'stop_task') {
        if (!args || typeof args.task_description !== 'string' || typeof args.user_id !== 'string') {
          throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid task_description or user_id arguments.');
        }
        const taskDesc = args.task_description;
        const userId = args.user_id;

        // Find the most recent active task matching the description for this user
        const activeTask = await dbInstance.query.timeLogEntries.findFirst({
            where: and(
                eq(timeLogEntries.userId, userId),
                eq(timeLogEntries.taskDescription, taskDesc),
                isNull(timeLogEntries.stopTime)
            ),
            orderBy: desc(timeLogEntries.startTime)
        });

        if (!activeTask) {
          throw new McpError(ErrorCode.InvalidRequest, `No active task named "${taskDesc}" found for user ${userId}.`);
        }

        const stopTimeMs = Date.now(); // Get timestamp as number
        const now = new Date(); // Get current Date object
        // Ensure activeTask.startTime is treated as a number
        const startTimeMs = Number(activeTask.startTime);
        if (isNaN(startTimeMs)) {
             console.error(`Invalid startTime retrieved from DB for task ID ${activeTask.id}:`, activeTask.startTime);
             throw new McpError(ErrorCode.InternalError, `Invalid start time found for task "${taskDesc}".`);
        }
        const durationMs = stopTimeMs - startTimeMs;

        try {
            await dbInstance.update(timeLogEntries)
                .set({
                    stopTime: new Date(stopTimeMs), // Convert number to Date
                    durationMs: durationMs,
                    updatedAt: now // Set updatedAt manually
                })
                .where(eq(timeLogEntries.id, activeTask.id));

            console.log(`Task stopped: "${taskDesc}" for user ${userId} at ${new Date(stopTimeMs).toISOString()}. Duration: ${durationMs}ms`);
            return { content: [{ type: 'text', text: `Stopped timer for task "${taskDesc}". Duration logged.` }] };
        } catch (error: any) {
           console.error(`Failed to update stop_task entry for "${taskDesc}" (User: ${userId}, ID: ${activeTask.id}):`, error);
           throw new McpError(ErrorCode.InternalError, `Database error stopping task: ${error.message}`);
        }

      } else {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });
  }

  async run() {
    // Initialize DB connection on startup
    getDb();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Time Tracker MCP server (DB Mode v0.3.3) running on stdio');
  }
}

const server = new TimeTrackerServer();
server.run().catch(console.error);
