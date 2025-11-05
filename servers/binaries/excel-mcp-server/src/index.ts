#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

// Helper function to resolve relative paths from the CWD where Cline operates
function resolvePath(filePath: string): string {
  // Assuming Cline's CWD is passed via an env variable or is known
  const clineCwd = process.env.CLINE_CWD || '/Users/mekonen/Library/Mobile Documents/com~apple~CloudDocs/Projects/nenokem-personal';
  return path.resolve(clineCwd, filePath);
}

// Helper function to load or create a workbook
async function loadWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  const resolvedPath = resolvePath(filePath);
  const workbook = new ExcelJS.Workbook();
  if (fs.existsSync(resolvedPath)) {
    try {
      await workbook.xlsx.readFile(resolvedPath);
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, `Failed to read Excel file: ${error.message}`);
    }
  }
  return workbook;
}

// Helper function to save a workbook
async function saveWorkbook(workbook: ExcelJS.Workbook, filePath: string): Promise<void> {
  const resolvedPath = resolvePath(filePath);
  try {
    // Ensure directory exists
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    await workbook.xlsx.writeFile(resolvedPath);
  } catch (error: any) {
    throw new McpError(ErrorCode.InternalError, `Failed to write Excel file: ${error.message}`);
  }
}

// Type guards for tool arguments
const isListSheetsArgs = (args: any): args is { file_path: string } =>
  typeof args === 'object' && args !== null && typeof args.file_path === 'string';

const isReadSheetArgs = (args: any): args is { file_path: string; sheet_name: string } =>
  typeof args === 'object' && args !== null && typeof args.file_path === 'string' && typeof args.sheet_name === 'string';

const isReadCellArgs = (args: any): args is { file_path: string; sheet_name: string; cell_address: string } =>
  typeof args === 'object' && args !== null && typeof args.file_path === 'string' && typeof args.sheet_name === 'string' && typeof args.cell_address === 'string';

const isWriteCellArgs = (args: any): args is { file_path: string; sheet_name: string; cell_address: string; value: any } =>
  typeof args === 'object' && args !== null && typeof args.file_path === 'string' && typeof args.sheet_name === 'string' && typeof args.cell_address === 'string' && args.value !== undefined;

const isWriteRowsArgs = (args: any): args is { file_path: string; sheet_name: string; start_cell_address: string; data: any[][] } =>
  typeof args === 'object' && args !== null &&
  typeof args.file_path === 'string' &&
  typeof args.sheet_name === 'string' &&
  typeof args.start_cell_address === 'string' &&
  Array.isArray(args.data) && args.data.every((row: any) => Array.isArray(row));

class ExcelServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'excel-mcp-server',
        version: '0.1.0',
        description: 'MCP Server for reading and writing Microsoft Excel (.xlsx) files.',
      },
      {
        capabilities: {
          resources: {}, // No resources defined for now
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    // Error handling
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
        {
          name: 'excel_list_sheets',
          description: 'Lists the names of all sheets in an Excel workbook.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Path to the .xlsx file.' },
            },
            required: ['file_path'],
          },
        },
        {
          name: 'excel_read_sheet',
          description: 'Reads the entire content of a specified sheet as a 2D array.',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Path to the .xlsx file.' },
              sheet_name: { type: 'string', description: 'Name of the sheet to read.' },
            },
            required: ['file_path', 'sheet_name'],
          },
        },
        {
          name: 'excel_read_cell',
          description: 'Reads the value of a specific cell (e.g., "A1", "B5").',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: { type: 'string', description: 'Path to the .xlsx file.' },
              sheet_name: { type: 'string', description: 'Name of the sheet containing the cell.' },
              cell_address: { type: 'string', description: 'Cell address (e.g., "A1").' },
            },
            required: ['file_path', 'sheet_name', 'cell_address'],
          },
        },
        {
            name: 'excel_write_cell',
            description: 'Writes a value to a specific cell (e.g., "A1", "B5"). Creates the file or sheet if it does not exist.',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Path to the .xlsx file.' },
                sheet_name: { type: 'string', description: 'Name of the sheet for the cell.' },
                cell_address: { type: 'string', description: 'Cell address (e.g., "A1").' },
                value: { description: 'The value to write (string, number, boolean, or Date).' },
              },
            required: ['file_path', 'sheet_name', 'cell_address', 'value'],
          },
        },
        {
            name: 'excel_write_rows',
            description: 'Writes multiple rows of data to a specified sheet, starting from a given cell address. Creates the file or sheet if it does not exist.',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'Path to the .xlsx file.' },
                sheet_name: { type: 'string', description: 'Name of the sheet for the data.' },
                start_cell_address: { type: 'string', description: 'The top-left cell address where writing should begin (e.g., "A1").' },
                data: {
                  type: 'array',
                  description: 'A 2D array of data to write. Each inner array represents a row.',
                  items: {
                    type: 'array',
                    items: { description: 'Cell value (string, number, boolean, or Date).' }
                  }
                },
              },
              required: ['file_path', 'sheet_name', 'start_cell_address', 'data'],
            },
          },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'excel_list_sheets': {
            if (!isListSheetsArgs(args)) throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for excel_list_sheets');
            const workbook = await loadWorkbook(args.file_path);
            const sheetNames = workbook.worksheets.map(ws => ws.name);
            return { content: [{ type: 'text', text: JSON.stringify(sheetNames) }] };
          }

          case 'excel_read_sheet': {
            if (!isReadSheetArgs(args)) throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for excel_read_sheet');
            const workbook = await loadWorkbook(args.file_path);
            const sheet = workbook.getWorksheet(args.sheet_name);
            if (!sheet) throw new McpError(ErrorCode.InvalidRequest, `Sheet "${args.sheet_name}" not found in ${args.file_path}`);

            const data: any[][] = [];
            // Use row.values which returns a sparse array (1-based index)
            sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
              const sparseRowValues = row.values as ExcelJS.CellValue[]; // Type assertion
              const denseRowData: any[] = [];
              // Get the highest index (column number) in the sparse array
              const maxCol = Object.keys(sparseRowValues).reduce((max, k) => Math.max(max, parseInt(k, 10)), 0);

              // Convert sparse 1-based array to dense 0-based array
              for (let i = 1; i <= maxCol; i++) {
                const cellValue = sparseRowValues[i]; // Access sparse array by index
                let processedValue: any = ''; // Default to empty string

                if (cellValue instanceof Date) {
                  processedValue = cellValue.toISOString();
                } else if (cellValue !== null && typeof cellValue === 'object') {
                  if ('hyperlink' in cellValue && 'text' in cellValue) {
                    const hyperlinkValue = cellValue as { text: string; hyperlink: string };
                    processedValue = `${hyperlinkValue.text} (${hyperlinkValue.hyperlink})`;
                  } else if ('richText' in cellValue) {
                    const richTextValue = cellValue as { richText: { font?: ExcelJS.Font; text: string }[] };
                    processedValue = richTextValue.richText.map((rt: { text: string }) => rt.text).join('');
                  } else if ('result' in cellValue) { // Check for formula result
                     processedValue = cellValue.result !== undefined ? cellValue.result : `#FORMULA!`; // Simplified formula display
                  } else {
                     processedValue = cellValue; // Keep other objects as is (might be errors, etc.)
                  }
                } else if (cellValue !== null && cellValue !== undefined) {
                  processedValue = cellValue;
                }
                denseRowData.push(processedValue);
              }
              data.push(denseRowData);
            });
            return { content: [{ type: 'text', text: JSON.stringify(data) }] };
          }

          case 'excel_read_cell': {
            if (!isReadCellArgs(args)) throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for excel_read_cell');
            const workbook = await loadWorkbook(args.file_path);
            const sheet = workbook.getWorksheet(args.sheet_name);
            if (!sheet) throw new McpError(ErrorCode.InvalidRequest, `Sheet "${args.sheet_name}" not found in ${args.file_path}`);
            const cell = sheet.getCell(args.cell_address);
            let value = cell.value;
             // Handle different cell types appropriately
             if (cell.formula) {
                value = cell.result !== undefined ? cell.result : `#FORMULA! ${cell.formula}`;
             } else if (value instanceof Date) {
                value = value.toISOString();
             } else if (value !== null && typeof value === 'object' && 'hyperlink' in value && 'text' in value) {
                // Use inline type check
                const hyperlinkValue = value as { text: string; hyperlink: string };
                value = `${hyperlinkValue.text} (${hyperlinkValue.hyperlink})`;
             } else if (value !== null && typeof value === 'object' && 'richText' in value) {
                 // Use inline type check
                const richTextValue = value as { richText: { font?: ExcelJS.Font; text: string }[] };
                value = richTextValue.richText.map((rt: { text: string }) => rt.text).join('');
             }
            return { content: [{ type: 'text', text: JSON.stringify(value) }] }; // Return null if cell is empty
          }

          case 'excel_write_cell': {
            if (!isWriteCellArgs(args)) throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for excel_write_cell');
            const workbook = await loadWorkbook(args.file_path);
            let sheet = workbook.getWorksheet(args.sheet_name);
            if (!sheet) {
              sheet = workbook.addWorksheet(args.sheet_name);
            }
            const cell = sheet.getCell(args.cell_address);
            cell.value = args.value; // exceljs handles type conversion (string, number, boolean, Date)
            await saveWorkbook(workbook, args.file_path);
            return { content: [{ type: 'text', text: `Successfully wrote value to ${args.cell_address} in sheet "${args.sheet_name}" of ${args.file_path}` }] };
          }

          case 'excel_write_rows': {
            if (!isWriteRowsArgs(args)) throw new McpError(ErrorCode.InvalidParams, 'Invalid arguments for excel_write_rows');
            const workbook = await loadWorkbook(args.file_path);
            let sheet = workbook.getWorksheet(args.sheet_name);
            if (!sheet) {
              sheet = workbook.addWorksheet(args.sheet_name);
            }

            // Use addRows for potentially better performance with contiguous rows
            // Note: addRows appends. If we need to write starting at a specific cell that's not the next available row,
            // we need manual iteration. Let's stick to manual for precise placement based on start_cell_address.

            const startCell = sheet.getCell(args.start_cell_address as string); // Explicit cast to satisfy potential linter confusion
            const startRowIndex = startCell.row; // 1-based
            const startColIndex = startCell.col; // 1-based

            args.data.forEach((rowData, rowIndex) => {
              const currentRow = sheet.getRow(Number(startRowIndex + rowIndex)); // Explicitly cast sum to Number
              rowData.forEach((cellData, colIndex) => {
                // Get cell using 1-based index directly
                const currentCell = currentRow.getCell(Number(startColIndex + colIndex)); // Explicitly cast sum to Number
                currentCell.value = cellData;
              });
              // Commit row after setting values (might improve performance for large datasets)
              // currentRow.commit(); // Removed as commit() is more for streaming writes
            });

            await saveWorkbook(workbook, args.file_path);
            return { content: [{ type: 'text', text: `Successfully wrote ${args.data.length} rows starting at ${args.start_cell_address} in sheet "${args.sheet_name}" of ${args.file_path}` }] };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error: any) {
        // Catch McpErrors and re-throw, wrap other errors
        if (error instanceof McpError) {
          throw error;
        } else {
          console.error(`Error executing tool ${name}:`, error);
          throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error.message}`);
        }
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Excel MCP server running on stdio');
  }
}

const server = new ExcelServer();
server.run().catch(error => {
    // Ensure errors during startup are logged clearly
    console.error("Failed to start Excel MCP server:", error);
    process.exit(1);
});
