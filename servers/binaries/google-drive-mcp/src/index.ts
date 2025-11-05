#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  // Removed ToolDefinition as it's not exported
} from '@modelcontextprotocol/sdk/types.js';
import { google, Auth, drive_v3 } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import process from 'process';

// --- Configuration ---
const CREDENTIALS_PATH = process.env.GDRIVE_CREDENTIALS_PATH;
const TOKEN_PATH = process.env.GDRIVE_TOKEN_PATH;
const SCOPES = ['https://www.googleapis.com/auth/drive']; // Ensure this scope covers all needed actions

if (!CREDENTIALS_PATH || !TOKEN_PATH) {
  console.error('FATAL: GDRIVE_CREDENTIALS_PATH and GDRIVE_TOKEN_PATH environment variables must be set.');
  process.exit(1);
}

// --- Google Auth ---
let authClient: Auth.OAuth2Client | null = null;

async function loadSavedCredentialsIfExist(): Promise<Auth.OAuth2Client | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH!, 'utf-8');
    const credentials = JSON.parse(content);
    if (!credentials.client_id || !credentials.client_secret || !credentials.refresh_token) {
        console.error(`Token file ${TOKEN_PATH} is missing required fields (client_id, client_secret, refresh_token).`);
        return null;
    }
    return google.auth.fromJSON(credentials) as Auth.OAuth2Client;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.error(`Token file not found at ${TOKEN_PATH}. Please run the get-drive-token.js script first.`);
    } else {
      console.error(`Error loading token file from ${TOKEN_PATH}:`, err);
    }
    return null;
  }
}

async function authorize(): Promise<Auth.OAuth2Client> {
    if (authClient) return authClient;

    console.log('Attempting to load saved credentials...');
    authClient = await loadSavedCredentialsIfExist();

    if (!authClient) {
        throw new McpError(ErrorCode.InternalError, 'Google Drive authentication failed: Could not load token.');
    }

    console.log('Credentials loaded successfully.');

    authClient.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
            console.log('Received new refresh token. Saving credentials...');
            const currentCredentials = authClient!.credentials;
            authClient!.setCredentials({
                ...currentCredentials,
                refresh_token: tokens.refresh_token,
                access_token: tokens.access_token,
                expiry_date: tokens.expiry_date,
            });
            saveCredentials(authClient!);
        } else {
             console.log('Access token refreshed.');
        }
    });

    return authClient;
}

async function saveCredentials(client: Auth.OAuth2Client): Promise<void> {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH!, 'utf-8');
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;

    const payload = JSON.stringify({
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
      access_token: client.credentials.access_token,
      expiry_date: client.credentials.expiry_date,
    });

    await fs.writeFile(TOKEN_PATH!, payload);
    console.log(`Credentials updated and saved to ${TOKEN_PATH}`);
  } catch (err) {
    console.error(`Error saving updated credentials to ${TOKEN_PATH}:`, err);
  }
}

// --- Helper Function for API Errors ---
function handleDriveApiError(error: any, operation: string): McpError {
    console.error(`Error during ${operation}:`, error);
    const message = error.response?.data?.error?.message || error.message || 'Unknown Google Drive API error';
    // Consider mapping specific Google API errors to MCP error codes if needed
    return new McpError(ErrorCode.InternalError, `Google Drive API error (${operation}): ${message}`);
}


// --- MCP Server ---

class GoogleDriveMcpServer {
  private server: Server;
  private drive: drive_v3.Drive | null = null;
  private readonly tools: any[]; // Use 'any[]' for simplicity if ToolDefinition is unavailable

  constructor() {
    this.tools = [
        // Existing Tool
        {
          name: 'create_note',
          description: 'Create a new note (Google Doc) in Google Drive',
          inputSchema: {
            type: 'object', properties: {
              title: { type: 'string', description: 'Title of the note' },
              content: { type: 'string', description: 'Text content of the note' },
              parentFolderId: { type: 'string', description: 'Optional ID of the parent folder (default: root)' },
            }, required: ['title', 'content'],
          },
        },
        // New Tools
        {
          name: 'list_files',
          description: 'List files and folders in Google Drive, optionally within a specific folder.',
          inputSchema: {
            type: 'object', properties: {
              folderId: { type: 'string', description: "ID of the folder to list (default: 'root')", default: 'root' },
              pageSize: { type: 'number', description: 'Maximum number of items to return', default: 100 },
              query: { type: 'string', description: 'Optional Drive query string (e.g., "mimeType=\'application/vnd.google-apps.folder\'")' },
              fields: { type: 'string', description: 'Fields to include in the response (e.g., "files(id, name, mimeType)")', default: 'files(id, name, mimeType)' },
            },
          },
        },
        {
          name: 'get_metadata',
          description: 'Get metadata for a specific file or folder by ID.',
          inputSchema: {
            type: 'object', properties: {
              fileId: { type: 'string', description: 'ID of the file or folder' },
              fields: { type: 'string', description: 'Fields to include in the response (e.g., "id, name, mimeType, parents, modifiedTime")', default: '*' },
            }, required: ['fileId'],
          },
        },
        {
          name: 'create_folder',
          description: 'Create a new folder.',
          inputSchema: {
            type: 'object', properties: {
              name: { type: 'string', description: 'Name of the new folder' },
              parentFolderId: { type: 'string', description: 'ID of the parent folder (default: root)', default: 'root' },
            }, required: ['name'],
          },
        },
        // { // Temporarily removed move_file tool definition due to persistent TS errors
        //   name: 'move_file',
        //   description: 'Move a file or folder to a different parent folder.',
        //   inputSchema: {
        //     type: 'object', properties: {
        //       fileId: { type: 'string', description: 'ID of the file or folder to move' },
        //       targetFolderId: { type: 'string', description: 'ID of the destination folder' },
        //     }, required: ['fileId', 'targetFolderId'],
        //   },
        // },
        {
          name: 'rename_file',
          description: 'Rename a file or folder.',
          inputSchema: {
            type: 'object', properties: {
              fileId: { type: 'string', description: 'ID of the file or folder to rename' },
              newName: { type: 'string', description: 'The new name for the file or folder' },
            }, required: ['fileId', 'newName'],
          },
        },
        {
          name: 'delete_file',
          description: 'Move a file or folder to the trash (soft delete).',
          inputSchema: {
            type: 'object', properties: {
              fileId: { type: 'string', description: 'ID of the file or folder to move to trash' },
            }, required: ['fileId'],
          },
        },
    ];

    this.server = new Server(
      { name: 'google-drive-mcp', version: '0.2.0', description: 'MCP Server for interacting with Google Drive' },
      { capabilities: { resources: {}, tools: {} } }
    );

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async initializeDriveClient(): Promise<drive_v3.Drive> {
      if (this.drive) return this.drive;
      try {
          const auth = await authorize();
          this.drive = google.drive({ version: 'v3', auth });
          console.log('Google Drive client initialized.');
          return this.drive;
      } catch (error) {
          console.error('Failed to initialize Google Drive client:', error);
          // Propagate the McpError from authorize() or wrap other errors
          if (error instanceof McpError) throw error;
          throw new McpError(ErrorCode.InternalError, 'Failed to initialize Google Drive client.');
      }
  }

  private setupToolHandlers() {
    // List Tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.tools }));

    // Call Tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const drive = await this.initializeDriveClient(); // Ensure Drive client is ready
      const toolName = request.params.name;
      const args = request.params.arguments;

      console.log(`Received call for tool: ${toolName} with args:`, args);

      try {
        switch (toolName) {
          case 'create_note': {
            if (typeof args !== 'object' || args === null || typeof args.title !== 'string' || typeof args.content !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid args for create_note. Requires { title: string, content: string, parentFolderId?: string }');
            }
            
            // Build request parameters
            const requestParams: any = {
              requestBody: {
                name: args.title,
                mimeType: 'application/vnd.google-apps.document',
              },
              fields: 'id, name, webViewLink'
            };
            
            // Add parents only if parentFolderId is provided
            if (args.parentFolderId) {
              requestParams.requestBody.parents = [args.parentFolderId];
            }
            
            // Add media content
            requestParams.media = {
              mimeType: 'text/plain',
              body: args.content
            };
            
            // Create file
            const response = await drive.files.create(requestParams);
            return { content: [{ type: 'text', text: `Note created successfully.\nID: ${response.data.id}\nTitle: ${response.data.name}\nLink: ${response.data.webViewLink}` }] };
          }

          case 'list_files': {
            if (typeof args !== 'object' || args === null) throw new McpError(ErrorCode.InvalidParams, 'Invalid args for list_files.');
            const folderId = typeof args.folderId === 'string' ? args.folderId : 'root';
            const pageSize = typeof args.pageSize === 'number' ? args.pageSize : 100;
            const query = typeof args.query === 'string' ? args.query : '';
            const fields = typeof args.fields === 'string' ? args.fields : 'files(id, name, mimeType)';

            let q = `'${folderId}' in parents and trashed = false`;
            if (query) {
                q += ` and (${query})`;
            }

            const response = await drive.files.list({ q: q, pageSize: pageSize, fields: `nextPageToken, ${fields}` });
            return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
          }

          case 'get_metadata': {
            if (typeof args !== 'object' || args === null || typeof args.fileId !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid args for get_metadata. Requires { fileId: string, fields?: string }');
            }
            const fields = typeof args.fields === 'string' ? args.fields : '*';
            const response = await drive.files.get({ fileId: args.fileId, fields: fields });
            return { content: [{ type: 'text', text: JSON.stringify(response.data, null, 2) }] };
          }

          case 'create_folder': {
            if (typeof args !== 'object' || args === null || typeof args.name !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid args for create_folder. Requires { name: string, parentFolderId?: string }');
            }
            
            // Build request parameters
            const requestParams: any = {
              requestBody: {
                name: args.name,
                mimeType: 'application/vnd.google-apps.folder',
              },
              fields: 'id, name'
            };
            
            // Add parents only if parentFolderId is provided
            if (args.parentFolderId) {
              requestParams.requestBody.parents = [args.parentFolderId];
            }
            
            // Create folder
            const response = await drive.files.create(requestParams);
            return { content: [{ type: 'text', text: `Folder created successfully.\nID: ${response.data.id}\nName: ${response.data.name}` }] };
          }

          // case 'move_file': {
          //   // Temporarily commented out due to persistent TS type errors with 'parents' field
          //   // TODO: Revisit and fix type handling for move_file
          //   if (typeof args !== 'object' || args === null || typeof args.fileId !== 'string' || typeof args.targetFolderId !== 'string') {
          //     throw new McpError(ErrorCode.InvalidParams, 'Invalid args for move_file. Requires { fileId: string, targetFolderId: string }');
          //   }
          //   // Get current parents to remove them
          //   const file = await drive.files.get({ fileId: args.fileId, fields: 'parents' });
          //   // Ensure previousParents is explicitly string | undefined
          //   let previousParents: string | undefined = undefined;
          //   if (Array.isArray(file.data.parents) && file.data.parents.length > 0) {
          //       previousParents = file.data.parents.join(',');
          //   }
          //   // Update with new parent and remove old ones
          //   // Ensure parameters match expected types (string | undefined)
          //   await drive.files.update({
          //     fileId: args.fileId,
          //     addParents: args.targetFolderId, // Should be string
          //     removeParents: previousParents, // Should be string | undefined
          //     // Request minimal fields to simplify response handling
          //     fields: 'id',
          //   });
          //   // Simplify the success message, avoiding potential issues with response.data.parents type
          //   return { content: [{ type: 'text', text: `File ${args.fileId} moved successfully to folder ${args.targetFolderId}.` }] };
          // }

          case 'rename_file': {
            if (typeof args !== 'object' || args === null || typeof args.fileId !== 'string' || typeof args.newName !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid args for rename_file. Requires { fileId: string, newName: string }');
            }
            const response = await drive.files.update({
              fileId: args.fileId,
              requestBody: { name: args.newName },
              fields: 'id, name',
            });
            return { content: [{ type: 'text', text: `File ${response.data.id} renamed successfully to "${response.data.name}"` }] };
          }

          case 'delete_file': {
            if (typeof args !== 'object' || args === null || typeof args.fileId !== 'string') {
              throw new McpError(ErrorCode.InvalidParams, 'Invalid args for delete_file. Requires { fileId: string }');
            }
            // This moves the file to trash. For permanent deletion, use files.delete()
            await drive.files.update({ fileId: args.fileId, requestBody: { trashed: true } });
            return { content: [{ type: 'text', text: `File ${args.fileId} moved to trash successfully.` }] };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
        }
      } catch (error: any) {
          // Handle McpErrors thrown explicitly, otherwise wrap API errors
          if (error instanceof McpError) throw error;
          throw handleDriveApiError(error, toolName);
      }
    });
  }

  async run() {
    try {
        await this.initializeDriveClient();
    } catch (error) {
        console.error("Server startup failed due to authorization error. Please check credentials and token.", error);
        process.exit(1);
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('Google Drive MCP server running on stdio');
  }
}

// --- Start Server ---
const server = new GoogleDriveMcpServer();
server.run().catch(error => {
    console.error("Server failed to run:", error);
    process.exit(1);
});
