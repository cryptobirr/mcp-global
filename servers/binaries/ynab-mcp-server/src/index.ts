#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance, AxiosError, Method } from 'axios'; // Import Method type

// --- Type Definitions ---
// Existing type for updating transactions
type TransactionUpdatePayload = {
  id: string;
  category_id?: string | null;
  memo?: string | null;
  cleared?: 'cleared' | 'uncleared' | 'reconciled';
  approved?: boolean;
  flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
  account_id?: string;
  payee_id?: string | null;
  date?: string; // YYYY-MM-DD
  amount?: number; // milliunits format
  subtransactions?: any[]; // Keep original for update flexibility, though ideally stricter
};

// NEW: Define a type for subtransactions for clarity
type Subtransaction = {
  amount: number; // Amount of the subtransaction in milliunits
  payee_id?: string | null;
  payee_name?: string | null; // Max 50 chars, only if payee_id is null
  category_id?: string | null; // Category for this split
  memo?: string | null; // Max 200 chars
};

// NEW: Define a type for the payload to create a single transaction (potentially split)
type TransactionCreatePayload = {
  account_id: string;
  date: string; // YYYY-MM-DD
  amount: number; // Total amount in milliunits (MUST be 0 if subtransactions are provided)
  payee_id?: string | null;
  payee_name?: string | null; // Max 50 chars, only if payee_id is null
  category_id?: string | null; // Required if not split (i.e., subtransactions is empty or null)
  memo?: string | null; // Max 200 chars
  cleared?: 'cleared' | 'uncleared' | 'reconciled';
  approved?: boolean;
  flag_color?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;
  subtransactions?: Subtransaction[]; // Array of subtransactions. If provided, the sum of amounts must match the parent amount (which should be 0).
};


// --- Configuration ---
const YNAB_API_KEY = process.env.YNAB_API_KEY;
const YNAB_API_BASE_URL = 'https://api.youneedabudget.com/v1';

if (!YNAB_API_KEY) {
  console.error('Error: YNAB_API_KEY environment variable is required.');
  process.exit(1); // Exit if the API key is missing
}

// --- YNAB API Client ---
class YnabApiClient {
  private axiosInstance: AxiosInstance;

  constructor(apiKey: string) {
    this.axiosInstance = axios.create({
      baseURL: YNAB_API_BASE_URL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async makeRequest(method: Method, endpoint: string, config?: { params?: any; data?: any }): Promise<any> {
    try {
      const response = await this.axiosInstance.request({
        method,
        url: endpoint,
        params: config?.params,
        data: config?.data,
      });
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error(`YNAB API Error (${method.toUpperCase()} ${endpoint}):`, axiosError.response?.status, axiosError.response?.data || axiosError.message);
      throw new McpError(
        ErrorCode.InternalError,
        `YNAB API request failed: ${axiosError.response?.status} ${JSON.stringify(axiosError.response?.data) || axiosError.message}`
      );
    }
  }

  // --- Specific API Methods ---
  async getBudgets(): Promise<any> {
    return this.makeRequest('get', '/budgets');
  }

  async getCategories(budgetId: string): Promise<any> {
    if (!budgetId) {
      throw new McpError(ErrorCode.InvalidParams, 'budget_id is required for get_categories');
    }
    return this.makeRequest('get', `/budgets/${budgetId}/categories`);
  }

  async getTransactions(budgetId: string, sinceDate?: string, type?: 'uncategorized' | 'uncleared'): Promise<any> {
    if (!budgetId) {
      throw new McpError(ErrorCode.InvalidParams, 'budget_id is required for get_transactions');
    }
    const params: Record<string, string> = {};
    if (sinceDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceDate)) {
         throw new McpError(ErrorCode.InvalidParams, 'Invalid since_date format. Use YYYY-MM-DD.');
      }
      params.since_date = sinceDate;
    }
    if (type) {
      if (type !== 'uncategorized' && type !== 'uncleared') {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid type parameter. Use "uncategorized" or "uncleared".');
      }
      params.type = type;
    }
    return this.makeRequest('get', `/budgets/${budgetId}/transactions`, { params });
  }

  async updateTransactions(budgetId: string, transactions: TransactionUpdatePayload[]): Promise<any> {
    if (!budgetId) {
      throw new McpError(ErrorCode.InvalidParams, 'budget_id is required for update_transactions');
    }
    if (!Array.isArray(transactions) || transactions.length === 0) {
       throw new McpError(ErrorCode.InvalidParams, 'transactions must be a non-empty array');
    }
    transactions.forEach(t => {
        if (!t.id || typeof t.id !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'Each transaction must have a valid string id');
        }
    });
    // YNAB API expects { transactions: [...] } in the request body for PATCH
    return this.makeRequest('patch', `/budgets/${budgetId}/transactions`, { data: { transactions } });
  }

  // NEW: Create a single transaction (potentially split)
  async createTransaction(budgetId: string, transaction: TransactionCreatePayload): Promise<any> {
    if (!budgetId) {
      throw new McpError(ErrorCode.InvalidParams, 'budget_id is required for create_transaction');
    }
    if (!transaction || typeof transaction !== 'object') {
        throw new McpError(ErrorCode.InvalidParams, 'transaction payload is required');
    }
    // Basic validation
    if (!transaction.account_id || !transaction.date || transaction.amount === undefined) {
        throw new McpError(ErrorCode.InvalidParams, 'account_id, date, and amount are required for transaction');
    }
     if (!/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
        throw new McpError(ErrorCode.InvalidParams, 'Invalid date format. Use YYYY-MM-DD.');
    }
    if (transaction.subtransactions && transaction.subtransactions.length > 0) {
        if (transaction.amount !== 0) {
             console.warn('Warning: Parent transaction amount should be 0 for split transactions. Adjusting to 0.');
             transaction.amount = 0; // Enforce 0 amount for parent if splitting
        }
        let subTotal = 0;
        transaction.subtransactions.forEach(sub => {
            if (sub.amount === undefined || typeof sub.amount !== 'number') {
                 throw new McpError(ErrorCode.InvalidParams, 'Each subtransaction must have a numeric amount.');
            }
            if (!sub.category_id) {
                 throw new McpError(ErrorCode.InvalidParams, 'Each subtransaction must have a category_id.');
            }
            subTotal += sub.amount;
        });
        // YNAB API might enforce this, but good to check. Note: YNAB handles positive/negative automatically based on parent.
        // We don't check subTotal === transaction.amount here because parent amount is forced to 0.
    } else {
        // If not split, category is required
        if (!transaction.category_id) {
            throw new McpError(ErrorCode.InvalidParams, 'category_id is required for non-split transactions.');
        }
    }

    // YNAB API expects { transaction: {...} } in the request body for POST
    return this.makeRequest('post', `/budgets/${budgetId}/transactions`, { data: { transaction } });
  }
}

// --- MCP Server Implementation ---
class YnabMcpServer {
  private server: Server;
  private ynabClient: YnabApiClient;

  constructor() {
    this.server = new Server(
      {
        name: 'ynab-mcp-server',
        version: '0.1.2', // Incremented version for new feature
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.ynabClient = new YnabApiClient(YNAB_API_KEY!);

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Existing tools...
        {
          name: 'get_budgets',
          description: 'Retrieve a list of all YNAB budgets accessible by the API key.',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'get_categories',
          description: 'Retrieve all categories and category groups for a specific budget.',
          inputSchema: {
            type: 'object',
            properties: { budget_id: { type: 'string', description: 'The ID of the budget (e.g., "last-used" or a specific UUID)' } },
            required: ['budget_id'],
          },
        },
        {
          name: 'get_transactions',
          description: 'Retrieve transactions for a specific budget, optionally filtering by date and type (uncategorized or uncleared).',
          inputSchema: {
            type: 'object',
            properties: {
              budget_id: { type: 'string', description: 'The ID of the budget (e.g., "last-used" or a specific UUID)' },
              since_date: { type: 'string', description: 'Optional. Retrieve transactions on or after this date (YYYY-MM-DD).', format: 'date' },
              type: { type: 'string', description: 'Optional. Filter by type: "uncategorized" or "uncleared".', enum: ['uncategorized', 'uncleared'] },
            },
            required: ['budget_id'],
          },
        },
        {
          name: 'update_transactions',
          description: 'Update multiple transactions in a specific budget. Use for changing category, memo, cleared status, flag, etc. Does not support creating new splits on existing transactions via this tool.',
          inputSchema: {
            type: 'object',
            properties: {
              budget_id: { type: 'string', description: 'The ID of the budget (e.g., "last-used" or a specific UUID)' },
              transactions: {
                type: 'array',
                description: 'An array of transaction objects to update. Each object must have an `id` and the fields to update.',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'The ID of the transaction to update.' },
                    account_id: { type: 'string', description: 'The account ID.' },
                    date: { type: 'string', format: 'date', description: 'The transaction date in YYYY-MM-DD format.' },
                    amount: { type: 'integer', description: 'The transaction amount in milliunits.' },
                    payee_id: { type: ['string', 'null'], description: 'The payee ID.' },
                    payee_name: { type: ['string', 'null'], description: 'The payee name (max 50 chars). Only used if payee_id is null.' },
                    category_id: { type: ['string', 'null'], description: 'The category ID.' },
                    memo: { type: ['string', 'null'], description: 'The memo (max 200 chars).' },
                    cleared: { type: 'string', enum: ['cleared', 'uncleared', 'reconciled'], description: 'The cleared status.' },
                    approved: { type: 'boolean', description: 'Whether the transaction is approved.' },
                    flag_color: { type: ['string', 'null'], enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', null], description: 'The flag color.' },
                  },
                  required: ['id'],
                },
                minItems: 1,
              },
            },
            required: ['budget_id', 'transactions'],
          },
        },
        // NEW Tool Definition for Creating Split Transactions
        {
            name: 'create_split_transaction',
            description: 'Creates a new transaction, potentially splitting it into multiple categories (subtransactions).',
            inputSchema: {
                type: 'object',
                properties: {
                    budget_id: { type: 'string', description: 'The ID of the budget (e.g., "last-used" or a specific UUID)' },
                    transaction: {
                        type: 'object',
                        description: 'The transaction object to create.',
                        properties: {
                            account_id: { type: 'string', description: 'The account ID for the transaction.' },
                            date: { type: 'string', format: 'date', description: 'The transaction date (YYYY-MM-DD).' },
                            amount: { type: 'integer', description: 'The total transaction amount in milliunits. MUST be 0 if providing subtransactions.' },
                            payee_id: { type: ['string', 'null'], description: 'The payee ID.' },
                            payee_name: { type: ['string', 'null'], description: 'The payee name (max 50 chars). Only used if payee_id is null.' },
                            category_id: { type: ['string', 'null'], description: 'The category ID. Required if not a split transaction.' },
                            memo: { type: ['string', 'null'], description: 'The memo (max 200 chars).' },
                            cleared: { type: 'string', enum: ['cleared', 'uncleared', 'reconciled'], description: 'The cleared status.' },
                            approved: { type: 'boolean', description: 'Whether the transaction is approved.' },
                            flag_color: { type: ['string', 'null'], enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', null], description: 'The flag color.' },
                            subtransactions: {
                                type: 'array',
                                description: 'An array of subtransactions to split the main transaction amount across different categories. Required for split transactions.',
                                items: {
                                    type: 'object',
                                    properties: {
                                        amount: { type: 'integer', description: 'Amount of the subtransaction in milliunits.' },
                                        payee_id: { type: ['string', 'null'], description: 'Optional payee ID for subtransaction.' },
                                        payee_name: { type: ['string', 'null'], description: 'Optional payee name for subtransaction.' },
                                        category_id: { type: 'string', description: 'The category ID for this subtransaction.' },
                                        memo: { type: ['string', 'null'], description: 'Optional memo for subtransaction.' },
                                    },
                                    required: ['amount', 'category_id'], // Amount and category are essential for splits
                                },
                                minItems: 2 // A split needs at least two subtransactions
                            }
                        },
                        required: ['account_id', 'date', 'amount'] // Base requirements
                    }
                },
                required: ['budget_id', 'transaction'],
            },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let resultData: any;

        switch (name) {
          case 'get_budgets':
            resultData = await this.ynabClient.getBudgets();
            break;

          case 'get_categories':
            // Validation as before...
            if (!args || typeof args !== 'object' || !('budget_id' in args) || typeof args.budget_id !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid budget_id argument for get_categories');
            }
            resultData = await this.ynabClient.getCategories(args.budget_id);
            break;

          case 'get_transactions':
            // Validation as before...
             if (!args || typeof args !== 'object' || !('budget_id' in args) || typeof args.budget_id !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid budget_id argument for get_transactions');
            }
            const sinceDate = args.since_date;
            if (sinceDate !== undefined && typeof sinceDate !== 'string') {
                 throw new McpError(ErrorCode.InvalidParams, 'Invalid since_date argument type.');
            }
            if (sinceDate && !/^\d{4}-\d{2}-\d{2}$/.test(sinceDate)) {
                throw new McpError(ErrorCode.InvalidParams, 'Invalid since_date format. Use YYYY-MM-DD.');
            }
            const type = args.type;
             if (type !== undefined && (typeof type !== 'string' || (type !== 'uncategorized' && type !== 'uncleared'))) {
                 throw new McpError(ErrorCode.InvalidParams, 'Invalid type argument. Use "uncategorized" or "uncleared".');
            }
            resultData = await this.ynabClient.getTransactions(args.budget_id, sinceDate, type as 'uncategorized' | 'uncleared' | undefined);
            break;

          case 'update_transactions':
            // Validation as before...
             if (!args || typeof args !== 'object' || !('budget_id' in args) || typeof args.budget_id !== 'string' || !('transactions' in args) || !Array.isArray(args.transactions)) {
              throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid budget_id or transactions argument for update_transactions');
            }
             if (args.transactions.length === 0) {
                 throw new McpError(ErrorCode.InvalidParams, 'Transactions array cannot be empty for update_transactions');
             }
             args.transactions.forEach((t: any) => {
                 if (!t || typeof t !== 'object' || !t.id || typeof t.id !== 'string') {
                     throw new McpError(ErrorCode.InvalidParams, 'Each transaction in the array must be an object with a valid string id');
                 }
             });
            resultData = await this.ynabClient.updateTransactions(args.budget_id, args.transactions as TransactionUpdatePayload[]);
            break;

          // NEW: Handle create_split_transaction tool call
          case 'create_split_transaction':
            if (!args || typeof args !== 'object' || !('budget_id' in args) || typeof args.budget_id !== 'string' || !('transaction' in args) || typeof args.transaction !== 'object') {
                throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid budget_id or transaction argument for create_split_transaction');
            }
            // Perform validation based on TransactionCreatePayload structure (already done in client method, but can add more here if needed)
            const transactionPayload = args.transaction as TransactionCreatePayload; // Cast for type safety
            resultData = await this.ynabClient.createTransaction(args.budget_id, transactionPayload);
            break;


          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        // Return the successful result
        return {
          content: [ { type: 'text', text: JSON.stringify(resultData, null, 2) } ],
        };
      } catch (error) {
        // Error handling as before...
        if (error instanceof McpError) {
           return { content: [{ type: 'text', text: error.message }], isError: true, errorCode: error.code };
        } else {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Error executing tool ${name}:`, error);
           return { content: [{ type: 'text', text: `Internal Server Error executing tool ${name}: ${errorMessage}` }], isError: true, errorCode: ErrorCode.InternalError };
        }
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('YNAB MCP server running on stdio');
  }
}

// --- Start the Server ---
const server = new YnabMcpServer();
server.run().catch(error => {
  console.error("Failed to start YNAB MCP server:", error);
  process.exit(1);
});
