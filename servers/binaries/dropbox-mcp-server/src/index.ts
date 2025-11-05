#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Dropbox, files } from 'dropbox'; // Import Dropbox SDK
import * as fs from 'fs/promises'; // Import fs for file writing
import * as pathUtils from 'path'; // Import path for ensuring directory exists

// Retrieve the access token from environment variables
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
if (!DROPBOX_ACCESS_TOKEN) {
  // Log error to stderr so MCP client can see it
  console.error('Error: DROPBOX_ACCESS_TOKEN environment variable is required.');
  // Exit gracefully if the token is missing
  process.exit(1); 
}

// Type guard for list_files arguments
const isValidListFilesArgs = (
  args: any
): args is { path?: string; recursive?: boolean; limit?: number } => {
  return (
    typeof args === 'object' &&
    args !== null &&
    (args.path === undefined || typeof args.path === 'string') &&
    (args.recursive === undefined || typeof args.recursive === 'boolean') &&
    (args.limit === undefined || typeof args.limit === 'number')
  );
};

// Type guard for download_file arguments
const isValidDownloadFileArgs = (
  args: any
): args is { dropbox_path: string; local_path: string } => {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof args.dropbox_path === 'string' &&
    args.dropbox_path.length > 0 && // Ensure dropbox_path is not empty
    typeof args.local_path === 'string' &&
    args.local_path.length > 0 // Ensure local_path is not empty
  );
};

// Type guard for delete_file arguments
const isValidDeleteFileArgs = (
  args: any
): args is { dropbox_path: string } => {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof args.dropbox_path === 'string' &&
    args.dropbox_path.length > 0 // Ensure dropbox_path is not empty
  );
};

// Type guard for move_file arguments
const isValidMoveFileArgs = (
  args: any
): args is { from_path: string; to_path: string } => {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof args.from_path === 'string' && args.from_path.length > 0 &&
    typeof args.to_path === 'string' && args.to_path.length > 0
  );
};

// Type guard for create_folder arguments
const isValidCreateFolderArgs = (
  args: any
): args is { path: string } => {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof args.path === 'string' && args.path.length > 0
  );
};

// Type guard for batch_download_folder arguments
const isValidBatchDownloadFolderArgs = (
  args: any
): args is { dropbox_folder_path: string; local_destination_path: string } => {
  return (
    typeof args === 'object' &&
    args !== null &&
    typeof args.dropbox_folder_path === 'string' && args.dropbox_folder_path.length > 0 &&
    typeof args.local_destination_path === 'string' && args.local_destination_path.length > 0
  );
};


class DropboxServer {
  private server: Server;
  private dbx: Dropbox;

  constructor() {
    this.server = new Server(
      {
        name: 'dropbox-mcp-server',
        version: '0.1.0',
        description: 'MCP Server for interacting with Dropbox',
      },
      {
        capabilities: {
          resources: {}, // No resources defined initially
          tools: {}, // Tools will be defined below
        },
      }
    );

    // Initialize Dropbox client
    this.dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });

    this.setupToolHandlers();

    // Standard error handling and shutdown
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // Handler to list available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_files',
          description: 'List files and folders in a Dropbox path.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The path to list. Defaults to the root folder (\'\'). Use /folder_name for specific folders.',
                default: '', // Root folder
              },
              recursive: {
                type: 'boolean',
                description: 'If true, list files recursively.',
                default: false,
              },
              limit: {
                type: 'number',
                description: 'The maximum number of results to return.',
                default: 100,
              },
            },
            required: [], // No required properties, defaults are used
          },
        },
        {
          name: 'download_file',
          description: 'Download a file from Dropbox to a local path.',
          inputSchema: {
            type: 'object',
            properties: {
              dropbox_path: {
                type: 'string',
                description: 'The full path of the file to download in Dropbox (e.g., /folder/file.txt).',
              },
              local_path: {
                type: 'string',
                description: 'The local file path where the downloaded file should be saved (e.g., /Users/me/Downloads/file.txt). The directory will be created if it doesn\'t exist.',
              },
            },
            required: ['dropbox_path', 'local_path'],
          },
        },
        {
          name: 'delete_file',
          description: 'Delete a file or folder at a specified Dropbox path.',
          inputSchema: {
            type: 'object',
            properties: {
              dropbox_path: {
                type: 'string',
                description: 'The full path of the file or folder to delete in Dropbox (e.g., /folder/file.txt or /folder).',
              },
            },
            required: ['dropbox_path'],
          },
        },
        {
          name: 'move_file',
          description: 'Move or rename a file or folder in Dropbox.',
          inputSchema: {
            type: 'object',
            properties: {
              from_path: {
                type: 'string',
                description: 'The path of the file or folder to move/rename.',
              },
              to_path: {
                type: 'string',
                description: 'The destination path, including the new name if renaming.',
              },
            },
            required: ['from_path', 'to_path'],
          },
        },
        {
          name: 'create_folder',
          description: 'Create a new folder at a specified Dropbox path.',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'The full path of the folder to create (e.g., /new_folder).',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'batch_download_folder',
          description: 'Download all files within a specified Dropbox folder (non-recursively) to a local destination.',
          inputSchema: {
            type: 'object',
            properties: {
              dropbox_folder_path: {
                type: 'string',
                description: 'The full path of the Dropbox folder to download from (e.g., /Apps/MyApp/Data).',
              },
              local_destination_path: {
                type: 'string',
                description: 'The local directory path where the files should be saved (e.g., /Users/me/Downloads/DropboxData). The directory will be created if it doesn\'t exist.',
              },
            },
            required: ['dropbox_folder_path', 'local_destination_path'],
          },
        },
        // Add more tool definitions here later
      ],
    }));

    // Handler to execute tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'list_files') {
        if (!isValidListFilesArgs(request.params.arguments)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for list_files'
          );
        }

        const args = request.params.arguments;
        const path = args.path || ''; // Default to root
        const recursive = args.recursive || false;
        const limit = args.limit || 100;

        try {
          const response = await this.dbx.filesListFolder({
            path: path,
            recursive: recursive,
            limit: limit,
            // include_media_info: false,
            // include_deleted: false,
            // include_has_explicit_shared_members: false,
            // include_mounted_folders: true,
          });

          // Format the result for the MCP client
          const formattedResult = response.result.entries.map((entry) => {
            const baseInfo = {
              name: entry.name,
              path: entry.path_display,
              type: entry['.tag'], // 'file', 'folder', or 'deleted'
            };

            if (entry['.tag'] === 'file') {
              return {
                ...baseInfo,
                id: entry.id,
                size: entry.size,
                modified: entry.client_modified,
              };
            } else if (entry['.tag'] === 'folder') {
              return {
                ...baseInfo,
                id: entry.id,
                size: undefined, // Folders don't have size in this context
                modified: undefined, // Folders don't have client_modified
              };
            } else { // Deleted entry
              return {
                ...baseInfo,
                id: undefined, // Deleted entries don't have an ID here
                size: undefined,
                modified: undefined,
              };
            }
          });

          return {
            content: [
              {
                type: 'text', // Correct type for text content
                text: JSON.stringify(formattedResult, null, 2),
              },
            ],
          };
        } catch (error: any) {
          console.error('Dropbox API Error:', error);
          // Handle potential Dropbox API errors
          let errorMessage = 'Failed to list Dropbox files.';
          if (error.status === 401) {
            errorMessage = 'Dropbox authentication failed. Check your access token.';
          } else if (error.status === 409 && error.error?.error_summary?.startsWith('path/not_found/')) {
             errorMessage = `Dropbox path not found: ${path}`;
          } else if (error.error?.error_summary) {
            errorMessage = `Dropbox API error: ${error.error.error_summary}`;
          } else if (error.message) {
            errorMessage = `Error: ${error.message}`;
          }

          // Return an error response via MCP
           return {
             content: [
               {
                 type: 'text',
                 text: errorMessage,
               },
             ],
             isError: true,
           };
        }
      } else if (request.params.name === 'download_file') {
        if (!isValidDownloadFileArgs(request.params.arguments)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for download_file. Requires "dropbox_path" and "local_path".'
          );
        }
        const { dropbox_path, local_path } = request.params.arguments;

        try {
          // Ensure the local directory exists before writing the file
          const localDir = pathUtils.dirname(local_path);
          await fs.mkdir(localDir, { recursive: true });

          // Download the file
          const response = await this.dbx.filesDownload({ path: dropbox_path });

          // The Dropbox SDK types indicate fileBinary might not exist,
          // but for a successful download, it should be present.
          // We cast to access it, but handle potential issues.
          const fileData = (response.result as any).fileBinary;

          if (!fileData) {
             throw new Error('Downloaded file data is missing.');
          }

          // Write the file to the local path
          await fs.writeFile(local_path, fileData, 'binary');

          return {
            content: [
              {
                type: 'text',
                text: `Successfully downloaded '${dropbox_path}' to '${local_path}'`,
              },
            ],
          };
        } catch (error: any) {
          console.error('Dropbox Download Error:', error);
          let errorMessage = `Failed to download file from Dropbox: ${dropbox_path}`;
           if (error.status === 401) {
             errorMessage = 'Dropbox authentication failed. Check your access token.';
           } else if (error.status === 409) {
             // More specific error handling for path issues
             const errorSummary = error.error?.error_summary;
             if (errorSummary?.startsWith('path/not_found/')) {
               errorMessage = `Dropbox path not found: ${dropbox_path}`;
             } else if (errorSummary?.startsWith('path/not_file/')) {
               errorMessage = `Path is not a file: ${dropbox_path}`;
             } else {
                errorMessage = `Dropbox API error: ${errorSummary || 'Unknown 409 error'}`;
             }
           } else if (error.code === 'ENOENT') { // File system error
             errorMessage = `Local path error: ${error.message}`;
           } else if (error.message) {
             errorMessage = `Error: ${error.message}`;
           }

          return {
            content: [{ type: 'text', text: errorMessage }],
             isError: true,
           };
        }
      } else if (request.params.name === 'delete_file') {
         if (!isValidDeleteFileArgs(request.params.arguments)) {
           throw new McpError(
             ErrorCode.InvalidParams,
             'Invalid arguments for delete_file. Requires "dropbox_path".'
           );
         }
         const { dropbox_path } = request.params.arguments;

         try {
           // Delete the file or folder
           const response = await this.dbx.filesDeleteV2({ path: dropbox_path });

           // Extract the name of the deleted item for the success message
           const deletedItemName = response.result.metadata.name;

           return {
             content: [
               {
                 type: 'text',
                 text: `Successfully deleted '${deletedItemName}' at path '${dropbox_path}'`,
               },
             ],
           };
         } catch (error: any) {
           console.error('Dropbox Delete Error:', error);
           let errorMessage = `Failed to delete item from Dropbox: ${dropbox_path}`;
           if (error.status === 401) {
             errorMessage = 'Dropbox authentication failed. Check your access token.';
           } else if (error.status === 409) {
             const errorSummary = error.error?.error_summary;
              if (errorSummary?.startsWith('path_lookup/not_found/')) {
               errorMessage = `Dropbox path not found: ${dropbox_path}`;
             } else {
                errorMessage = `Dropbox API error: ${errorSummary || 'Unknown 409 error'}`;
             }
           } else if (error.message) {
             errorMessage = `Error: ${error.message}`;
           }

           return {
             content: [{ type: 'text', text: errorMessage }],
             isError: true,
           };
         }
      } else if (request.params.name === 'move_file') {
        if (!isValidMoveFileArgs(request.params.arguments)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for move_file. Requires "from_path" and "to_path".'
          );
        }
        const { from_path, to_path } = request.params.arguments;

        try {
          const response = await this.dbx.filesMoveV2({
            from_path: from_path,
            to_path: to_path,
            autorename: false, // Set to true to automatically rename if conflict
            allow_ownership_transfer: false,
          });

          const movedItemName = response.result.metadata.name;
          return {
            content: [
              {
                type: 'text',
                text: `Successfully moved/renamed '${movedItemName}' from '${from_path}' to '${to_path}'`,
              },
            ],
          };
        } catch (error: any) {
          console.error('Dropbox Move Error:', error);
          let errorMessage = `Failed to move/rename item from '${from_path}' to '${to_path}'`;
          if (error.status === 401) {
            errorMessage = 'Dropbox authentication failed. Check your access token.';
          } else if (error.status === 409) {
             const errorSummary = error.error?.error_summary;
             if (errorSummary?.startsWith('from_lookup/not_found/')) {
               errorMessage = `Source path not found: ${from_path}`;
             } else if (errorSummary?.startsWith('to/conflict/')) {
                errorMessage = `An item already exists at the destination path: ${to_path}`;
             } else {
                errorMessage = `Dropbox API error: ${errorSummary || 'Unknown 409 error'}`;
             }
          } else if (error.message) {
            errorMessage = `Error: ${error.message}`;
          }
          return {
            content: [{ type: 'text', text: errorMessage }],
            isError: true,
          };
        }
      } else if (request.params.name === 'create_folder') {
        if (!isValidCreateFolderArgs(request.params.arguments)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for create_folder. Requires "path".'
          );
        }
        const { path } = request.params.arguments;

        try {
          const response = await this.dbx.filesCreateFolderV2({
            path: path,
            autorename: false, // Set to true to automatically rename if conflict
          });

          const createdFolderName = response.result.metadata.name;
          return {
            content: [
              {
                type: 'text',
                text: `Successfully created folder '${createdFolderName}' at path '${path}'`,
              },
            ],
          };
        } catch (error: any) {
           console.error('Dropbox Create Folder Error:', error);
           let errorMessage = `Failed to create folder at path: ${path}`;
           if (error.status === 401) {
             errorMessage = 'Dropbox authentication failed. Check your access token.';
           } else if (error.status === 409) {
             const errorSummary = error.error?.error_summary;
             if (errorSummary?.startsWith('path/conflict/folder/')) {
               errorMessage = `A folder already exists at path: ${path}`;
             } else if (errorSummary?.startsWith('path/conflict/file/')) {
                errorMessage = `A file already exists at path: ${path}`;
             } else {
                errorMessage = `Dropbox API conflict error (409): ${errorSummary || 'Unknown conflict'}`;
             }
           } else if (error.status === 400) { // More specific 400 handling
              const errorBody = error.error ? JSON.stringify(error.error) : 'No details available';
              errorMessage = `Dropbox API Bad Request (400). Path: ${path}. Details: ${errorBody}`;
           } else if (error.message) {
             errorMessage = `Error: ${error.message}`;
           }

           return {
            content: [{ type: 'text', text: errorMessage }],
             isError: true,
           };
         }
      } else if (request.params.name === 'batch_download_folder') {
        if (!isValidBatchDownloadFolderArgs(request.params.arguments)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for batch_download_folder. Requires "dropbox_folder_path" and "local_destination_path".'
          );
        }
        const { dropbox_folder_path, local_destination_path } = request.params.arguments;
        let downloadedFiles = 0;
        let skippedItems = 0;
        const errors: string[] = [];

        try {
          // Ensure the local destination directory exists
          await fs.mkdir(local_destination_path, { recursive: true });

          // List folder contents (non-recursively)
          // Note: For very large folders, pagination (filesListFolderContinue) would be needed.
          // This implementation handles only the first page of results (default limit).
          const listResponse = await this.dbx.filesListFolder({
            path: dropbox_folder_path,
            recursive: false, // Only download files directly in this folder
          });

          // Iterate through entries and download only files
          for (const entry of listResponse.result.entries) {
            if (entry['.tag'] === 'file') {
              const fileMetadata = entry as files.FileMetadata;
              const localFilePath = pathUtils.join(local_destination_path, fileMetadata.name);
              try {
                const downloadResponse = await this.dbx.filesDownload({ path: fileMetadata.path_lower! }); // Use path_lower for consistency
                const fileData = (downloadResponse.result as any).fileBinary;
                if (!fileData) {
                  throw new Error(`Downloaded file data is missing for ${fileMetadata.name}.`);
                }
                await fs.writeFile(localFilePath, fileData, 'binary');
                downloadedFiles++;
              } catch (downloadError: any) {
                 console.error(`Failed to download ${fileMetadata.name}:`, downloadError);
                 errors.push(`Failed to download ${fileMetadata.name}: ${downloadError.message || 'Unknown download error'}`);
              }
            } else {
              skippedItems++; // Count skipped folders/deleted items
            }
          }

          let summary = `Batch download complete for folder '${dropbox_folder_path}'. Downloaded: ${downloadedFiles} files. Skipped: ${skippedItems} non-file items.`;
          if (errors.length > 0) {
            summary += ` Errors encountered: ${errors.length}\n${errors.join('\n')}`;
          }

          return {
            content: [{ type: 'text', text: summary }],
            isError: errors.length > 0, // Mark as error if any download failed
          };

        } catch (error: any) {
          console.error('Batch Download Error:', error);
          let errorMessage = `Failed to process batch download for folder: ${dropbox_folder_path}`;
          if (error.status === 401) {
            errorMessage = 'Dropbox authentication failed. Check your access token.';
          } else if (error.status === 409 && error.error?.error_summary?.startsWith('path/not_found/')) {
             errorMessage = `Dropbox folder path not found: ${dropbox_folder_path}`;
          } else if (error.message) {
            errorMessage = `Error: ${error.message}`;
          }
          return {
            content: [{ type: 'text', text: errorMessage }],
            isError: true,
          };
        }
      } else {
        // Handle unknown tool requests
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // Log to stderr so it doesn't interfere with MCP communication on stdout
    console.error('Dropbox MCP server running on stdio');
  }
}

// Create and run the server instance
const server = new DropboxServer();
server.run().catch((err) => {
  console.error("Failed to start Dropbox MCP server:", err);
  process.exit(1); // Exit if server fails to start
});
