#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
    Tool, // Changed from ToolDefinition
    // CallToolRequestParams removed
} from '@modelcontextprotocol/sdk/types.js';
import { PostgresAgent, QueryExecutionResult } from './common/pg_agent.js';
import { ZodError, z } from 'zod';

console.log("Starting Postgres MCP Server...");

// --- Zod Schemas for Tool Inputs ---

const ListTablesArgsSchema = z.object({
    schema_name: z.string().optional().default('public').describe("Database schema name (default: public)"),
}).strict();

const DescribeTableArgsSchema = z.object({
    table_name: z.string().describe("Name of the table to describe (optionally schema-qualified, e.g., 'public.users')"),
}).strict();

const SelectArgsSchema = z.object({
    table_name: z.string().describe("Name of the table to select from (optionally schema-qualified)"),
    columns: z.array(z.string()).optional().default(['*']).describe("List of columns to select (default: ['*'])"),
    where_clause: z.string().optional().describe("SQL WHERE clause (without 'WHERE', e.g., 'id = $1 AND status = $2')"),
    where_params: z.array(z.any()).optional().default([]).describe("Parameters for the WHERE clause placeholders ($1, $2, ...)"),
    order_by: z.string().optional().describe("SQL ORDER BY clause (without 'ORDER BY', e.g., 'created_at DESC')"),
    limit: z.number().int().positive().optional().describe("Maximum number of rows to return"),
}).strict();

const InsertArgsSchema = z.object({
    table_name: z.string().describe("Name of the table to insert into (optionally schema-qualified)"),
    data: z.record(z.any()).describe("Object where keys are column names and values are the data to insert"),
}).strict().refine(obj => Object.keys(obj.data).length > 0, { // Moved .strict() before .refine()
    message: "Data object cannot be empty",
});

const UpdateArgsSchema = z.object({
    table_name: z.string().describe("Name of the table to update (optionally schema-qualified)"),
    data: z.record(z.any()).describe("Object where keys are column names and values are the new data"),
    where_clause: z.string().describe("SQL WHERE clause to specify rows to update (without 'WHERE', e.g., 'id = $1')"),
    where_params: z.array(z.any()).describe("Parameters for the WHERE clause placeholders ($1, ...)"),
}).strict().refine(obj => Object.keys(obj.data).length > 0, { // Moved .strict() before .refine()
    message: "Data object cannot be empty",
});


const DeleteArgsSchema = z.object({
    table_name: z.string().describe("Name of the table to delete from (optionally schema-qualified)"),
    where_clause: z.string().describe("SQL WHERE clause to specify rows to delete (without 'WHERE', e.g., 'id = $1')"),
    where_params: z.array(z.any()).describe("Parameters for the WHERE clause placeholders ($1, ...)"),
}).strict();

const ExecuteRawQueryArgsSchema = z.object({
    query: z.string().describe("The raw SQL query to execute"),
    params: z.array(z.any()).optional().default([]).describe("Parameters for query placeholders ($1, $2, ...)"),
}).strict();


// --- JSON Schemas for Tool Inputs (Manual Definition) ---
// Note: These should ideally match the Zod schemas above.

const ListTablesInputSchema = {
    type: 'object' as const, // Added 'as const'
    properties: {
        schema_name: { type: 'string', description: "Database schema name (default: public)", default: 'public' },
    },
    required: [],
    additionalProperties: false,
};

const DescribeTableInputSchema = {
    type: 'object' as const, // Added 'as const'
    properties: {
        table_name: { type: 'string', description: "Name of the table to describe (optionally schema-qualified, e.g., 'public.users')" },
    },
    required: ['table_name'],
    additionalProperties: false,
};

const SelectInputSchema = {
    type: 'object' as const, // Added 'as const'
    properties: {
        table_name: { type: 'string', description: "Name of the table to select from (optionally schema-qualified)" },
        columns: { type: 'array', items: { type: 'string' }, default: ['*'], description: "List of columns to select (default: ['*'])" },
        where_clause: { type: 'string', description: "SQL WHERE clause (without 'WHERE', e.g., 'id = $1 AND status = $2')" },
        where_params: { type: 'array', items: {}, default: [], description: "Parameters for the WHERE clause placeholders ($1, $2, ...)" },
        order_by: { type: 'string', description: "SQL ORDER BY clause (without 'ORDER BY', e.g., 'created_at DESC')" },
        limit: { type: 'integer', minimum: 1, description: "Maximum number of rows to return" },
    },
    required: ['table_name'],
    additionalProperties: false,
};

const InsertInputSchema = {
    type: 'object' as const, // Added 'as const'
    properties: {
        table_name: { type: 'string', description: "Name of the table to insert into (optionally schema-qualified)" },
        data: { type: 'object', description: "Object where keys are column names and values are the data to insert", minProperties: 1 },
    },
    required: ['table_name', 'data'],
    additionalProperties: false,
};

const UpdateInputSchema = {
    type: 'object' as const, // Added 'as const'
    properties: {
        table_name: { type: 'string', description: "Name of the table to update (optionally schema-qualified)" },
        data: { type: 'object', description: "Object where keys are column names and values are the new data", minProperties: 1 },
        where_clause: { type: 'string', description: "SQL WHERE clause to specify rows to update (without 'WHERE', e.g., 'id = $1')" },
        where_params: { type: 'array', items: {}, description: "Parameters for the WHERE clause placeholders ($1, ...)" },
    },
    required: ['table_name', 'data', 'where_clause', 'where_params'],
    additionalProperties: false,
};

const DeleteInputSchema = {
    type: 'object' as const, // Added 'as const'
    properties: {
        table_name: { type: 'string', description: "Name of the table to delete from (optionally schema-qualified)" },
        where_clause: { type: 'string', description: "SQL WHERE clause to specify rows to delete (without 'WHERE', e.g., 'id = $1')" },
        where_params: { type: 'array', items: {}, description: "Parameters for the WHERE clause placeholders ($1, ...)" },
    },
    required: ['table_name', 'where_clause', 'where_params'],
    additionalProperties: false,
};

const ExecuteRawQueryInputSchema = {
    type: 'object' as const, // Added 'as const'
    properties: {
        query: { type: 'string', description: "The raw SQL query to execute" },
        params: { type: 'array', items: {}, default: [], description: "Parameters for query placeholders ($1, $2, ...)" },
    },
    required: ['query'],
    additionalProperties: false,
};


// --- Tool Definitions ---

const tools: Tool[] = [ // Changed from ToolDefinition
    {
        name: 'pg_list_tables',
        description: 'Lists tables in a specified PostgreSQL schema (defaults to public).',
        inputSchema: ListTablesInputSchema, // Use manually defined JSON Schema
    },
    {
        name: 'pg_describe_table',
        description: 'Describes the columns and data types of a specified PostgreSQL table.',
        inputSchema: DescribeTableInputSchema, // Use manually defined JSON Schema
    },
    {
        name: 'pg_select',
        description: 'Executes a SELECT query on a specified PostgreSQL table.',
        inputSchema: SelectInputSchema, // Use manually defined JSON Schema
    },
    {
        name: 'pg_insert',
        description: 'Inserts a new row into a specified PostgreSQL table.',
        inputSchema: InsertInputSchema, // Use manually defined JSON Schema
    },
    {
        name: 'pg_update',
        description: 'Updates existing rows in a specified PostgreSQL table based on a WHERE clause.',
        inputSchema: UpdateInputSchema, // Use manually defined JSON Schema
    },
    {
        name: 'pg_delete',
        description: 'Deletes rows from a specified PostgreSQL table based on a WHERE clause.',
        inputSchema: DeleteInputSchema, // Use manually defined JSON Schema
    },
    {
        name: 'pg_execute_raw_query',
        description: 'Executes an arbitrary raw SQL query with parameters. Use with caution.',
        inputSchema: ExecuteRawQueryInputSchema, // Use manually defined JSON Schema
    },
];


// --- Server Implementation ---

class PostgresMcpServer {
    private server: Server;
    private dbAgent: PostgresAgent;

    constructor() {
        console.log("Initializing PostgresMcpServer...");
        this.dbAgent = new PostgresAgent(); // Uses env vars by default
        this.server = new Server(
            {
                name: 'postgres-mcp-server',
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
        console.log("PostgresMcpServer Initialized.");
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
                switch (name) {
                    case 'pg_list_tables':
                        return this.handleListTables(args);
                    case 'pg_describe_table':
                        return this.handleDescribeTable(args);
                    case 'pg_select':
                        return this.handleSelect(args);
                    case 'pg_insert':
                        return this.handleInsert(args);
                    case 'pg_update':
                        return this.handleUpdate(args);
                    case 'pg_delete':
                        return this.handleDelete(args);
                    case 'pg_execute_raw_query':
                        return this.handleExecuteRawQuery(args);
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
            // Throwing an error here will be caught by the main handler and formatted as an McpError
            throw new Error(dbResult.message || 'Unknown database error');
        }
        // Successfully executed (SELECT, INSERT, UPDATE, DELETE)
        return {
            content: [
                {
                    type: 'text', // Changed from 'application/json' to 'text'
                    text: JSON.stringify({
                        message: dbResult.message,
                        rows: dbResult.rows, // Include rows for SELECT
                        rowCount: dbResult.rowCount // Include affected/returned row count
                    }, null, 2) // Pretty print JSON
                }
            ]
        };
    }


    // --- Individual Tool Handlers ---

    private async handleListTables(args: any) {
        const parsedArgs = ListTablesArgsSchema.parse(args);
        console.log(`Listing tables for schema: ${parsedArgs.schema_name}`);
        const query = `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = $1
            ORDER BY table_name;
        `;
        return this.formatResult(await this.dbAgent.execute(query, [parsedArgs.schema_name]));
    }

    private async handleDescribeTable(args: any) {
        const parsedArgs = DescribeTableArgsSchema.parse(args);
        console.log(`Describing table: ${parsedArgs.table_name}`);
        // Basic protection against SQL injection in table name
         if (!/^[a-zA-Z0-9_."]+$/.test(parsedArgs.table_name)) {
             throw new McpError(ErrorCode.InvalidParams, 'Invalid table name format.');
         }

        // Use information_schema for portability
        const query = `
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE (table_schema || '.' || table_name = $1 OR table_name = $1)
              AND table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY ordinal_position;
        `;
         // Attempt to handle both schema.table and just table (assuming public if not specified)
         const tableName = parsedArgs.table_name.includes('.') ? parsedArgs.table_name : `public.${parsedArgs.table_name}`;

        return this.formatResult(await this.dbAgent.execute(query, [tableName]));
    }

    private async handleSelect(args: any) {
        const parsedArgs = SelectArgsSchema.parse(args);
        console.log(`Selecting from table: ${parsedArgs.table_name}`);

        // Basic validation/sanitization (more robust needed for production)
        const columns = parsedArgs.columns.join(', ');
        if (!/^[a-zA-Z0-9_."*,\s]+$/.test(columns)) {
             throw new McpError(ErrorCode.InvalidParams, 'Invalid characters in column names.');
        }
         if (!/^[a-zA-Z0-9_."]+$/.test(parsedArgs.table_name)) {
             throw new McpError(ErrorCode.InvalidParams, 'Invalid table name format.');
         }

        let query = `SELECT ${columns} FROM ${parsedArgs.table_name}`; // Table name assumed safe after check
        if (parsedArgs.where_clause) {
            query += ` WHERE ${parsedArgs.where_clause}`; // Use clause directly, params handled by pg driver
        }
        if (parsedArgs.order_by) {
             if (!/^[a-zA-Z0-9_,\s(ASC|DESC|asc|desc)]+$/.test(parsedArgs.order_by)) {
                 throw new McpError(ErrorCode.InvalidParams, 'Invalid characters in order_by clause.');
             }
            query += ` ORDER BY ${parsedArgs.order_by}`;
        }
        if (parsedArgs.limit) {
            query += ` LIMIT ${parsedArgs.limit}`; // Limit is a number, generally safe
        }
        query += ';';

        return this.formatResult(await this.dbAgent.execute(query, parsedArgs.where_params));
    }

    private async handleInsert(args: any) {
        const parsedArgs = InsertArgsSchema.parse(args);
        console.log(`Inserting into table: ${parsedArgs.table_name}`);
         if (!/^[a-zA-Z0-9_."]+$/.test(parsedArgs.table_name)) {
             throw new McpError(ErrorCode.InvalidParams, 'Invalid table name format.');
         }

        const columns = Object.keys(parsedArgs.data);
        const values = Object.values(parsedArgs.data);
        // Add explicit types here
        const placeholders = columns.map((_: string, i: number) => `$${i + 1}`).join(', ');

        // Basic validation on column names
        if (columns.some(col => !/^[a-zA-Z0-9_]+$/.test(col))) {
             throw new McpError(ErrorCode.InvalidParams, 'Invalid characters in column names for insert.');
        }

        const query = `INSERT INTO ${parsedArgs.table_name} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *;`; // RETURNING * to show inserted row

        return this.formatResult(await this.dbAgent.execute(query, values));
    }

     private async handleUpdate(args: any) {
        const parsedArgs = UpdateArgsSchema.parse(args);
        console.log(`Updating table: ${parsedArgs.table_name}`);
         if (!/^[a-zA-Z0-9_."]+$/.test(parsedArgs.table_name)) {
             throw new McpError(ErrorCode.InvalidParams, 'Invalid table name format.');
         }

        const dataColumns = Object.keys(parsedArgs.data);
        const dataValues = Object.values(parsedArgs.data);

        // Basic validation on column names
        if (dataColumns.some(col => !/^[a-zA-Z0-9_]+$/.test(col))) {
             throw new McpError(ErrorCode.InvalidParams, 'Invalid characters in column names for update.');
        }

        let setParamIndex = 1; // Index for SET clause params
        const setClauses = dataColumns.map((col: string) => `${col} = $${setParamIndex++}`);

        let whereParamIndex = setParamIndex; // Start where param index after set params
        const allParams = [...dataValues, ...parsedArgs.where_params];

        // Adjust where clause parameter indices
        let adjustedWhereClause = parsedArgs.where_clause;
        // Add explicit types here
        parsedArgs.where_params.forEach((_: any, i: number) => {
            // Replace $n in where_clause with $m where m = n + dataValues.length
            const originalPlaceholder = `$${i + 1}`;
            const newPlaceholder = `$${whereParamIndex++}`; // Use separate index for where params
            // Use regex to replace accurately (avoid replacing $10 when looking for $1)
            adjustedWhereClause = adjustedWhereClause.replace(new RegExp(`\\$${i + 1}\\b`, 'g'), newPlaceholder);
        });


        const query = `UPDATE ${parsedArgs.table_name} SET ${setClauses.join(', ')} WHERE ${adjustedWhereClause} RETURNING *;`; // RETURNING * to show updated rows

        return this.formatResult(await this.dbAgent.execute(query, allParams));
    }

    private async handleDelete(args: any) {
        const parsedArgs = DeleteArgsSchema.parse(args);
        console.log(`Deleting from table: ${parsedArgs.table_name}`);
         if (!/^[a-zA-Z0-9_."]+$/.test(parsedArgs.table_name)) {
             throw new McpError(ErrorCode.InvalidParams, 'Invalid table name format.');
         }

        const query = `DELETE FROM ${parsedArgs.table_name} WHERE ${parsedArgs.where_clause};`;

        return this.formatResult(await this.dbAgent.execute(query, parsedArgs.where_params));
    }

    private async handleExecuteRawQuery(args: any) {
        const parsedArgs = ExecuteRawQueryArgsSchema.parse(args);
        console.log(`Executing raw query: ${parsedArgs.query}`);
        // Note: No sanitization is performed on the raw query itself. Use with extreme caution.
        return this.formatResult(await this.dbAgent.execute(parsedArgs.query, parsedArgs.params));
    }


    // --- Run Method ---
    async run() {
        console.log("Attempting to connect MCP server transport...");
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('Postgres MCP server running on stdio');

        // Explicitly test DB connection on startup
        console.log("Testing database connection on startup...");
        const dbStatus = await this.dbAgent.connect();
        console.log(`Initial DB connection status: ${dbStatus}`);
        if (dbStatus.startsWith('Connection error:')) {
             // Throw an error to prevent the server from running with a bad DB connection
             throw new Error(`Database connection failed on startup: ${dbStatus}`);
        }
        console.log("Database connection verified.");
    }
}

// --- Start the Server ---
const server = new PostgresMcpServer();
server.run().catch(error => {
    console.error("Failed to start Postgres MCP server:", error);
    process.exit(1);
});
