import pg from 'pg';
const { Pool } = pg;
type PoolClient = pg.PoolClient;
type QueryResult = pg.QueryResult;

// Type for connection parameters
interface ConnectionParams {
    user?: string;
    host?: string;
    database?: string;
    password?: string;
    port?: number;
}

// Type for query results
export interface QueryExecutionResult {
    status: 'success' | 'error';
    rows?: any[]; // Array of result rows (for SELECT)
    rowCount?: number; // Number of rows returned (for SELECT) or affected (for others)
    message?: string; // Error message or success confirmation
}

export class PostgresAgent {
    private pool: pg.Pool;

    constructor(params?: ConnectionParams) {
        const connectionConfig = params || {
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
        };

        // Validate essential parameters
        if (!connectionConfig.user || !connectionConfig.host || !connectionConfig.database || !connectionConfig.password) {
            console.error("CRITICAL: Missing required database environment variables (DB_USER, DB_HOST, DB_NAME, DB_PASSWORD). Pool creation might fail.");
        }

        console.log("Initializing database pool...");
        this.pool = new Pool(connectionConfig);
        this.pool.on('error', (err: Error, client: PoolClient) => {
            console.error('Unexpected error on idle client', err);
        });
        console.log("Postgres Agent Initialized. Pool created.");
    }

    async connect(): Promise<string> {
        let client: PoolClient | null = null;
        try {
            client = await this.pool.connect();
            console.log("Database connection test successful.");
            return "Connected to database";
        } catch (error: any) {
            console.error("Database connection test failed:", error);
            return `Connection error: ${error.message}`;
        } finally {
            if (client) {
                client.release();
            }
        }
    }

    async execute(query: string, params: any[] = []): Promise<QueryExecutionResult> {
        let client: PoolClient | null = null;
        console.log(`Executing query: ${query} with params: ${JSON.stringify(params)}`);
        try {
            client = await this.pool.connect();
            const result: QueryResult = await client.query(query, params);
            console.log(`Query executed successfully. Row count: ${result.rowCount}`);
            return {
                status: 'success',
                rows: result.rows,
                rowCount: result.rowCount ?? 0,
                message: 'Query executed successfully'
            };
        } catch (error: any) {
            console.error(`Query error: ${error.message}`, error);
            return {
                status: 'error',
                message: `Query error: ${error.message}`
            };
        } finally {
            if (client) {
                client.release();
                console.log("Client released back to pool.");
            }
        }
    }

    async close(): Promise<string> {
        if (this.pool) {
            try {
                await this.pool.end();
                console.log("Database pool closed.");
                return "Connection pool closed";
            } catch (error: any) {
                console.error("Error closing database pool:", error);
                return `Error closing pool: ${error.message}`;
            }
        } else {
            console.log("Database pool was not initialized (or already closed).");
            return "Connection pool was not active";
        }
    }
}