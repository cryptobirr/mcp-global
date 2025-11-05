#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { google, type Auth, type gmail_v1 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { authenticate } from '@google-cloud/local-auth';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
// Removed Gemini import

// Read paths from environment variables provided by MCP settings
const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH;
const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH;
// Removed Gemini API key reading and check

// Check if the required paths are provided
if (!TOKEN_PATH || !CREDENTIALS_PATH) {
  throw new Error('Missing GMAIL_TOKEN_PATH or GMAIL_CREDENTIALS_PATH environment variables');
}

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.modify'
];

// Function to perform local Markdown cleanup
function cleanMarkdownLocally(markdown: string): string {
  let cleaned = markdown;

  // --- Aggressive Cleanup Rules ---

  // 1. Remove tracking pixels and hidden preheaders (often at start/end)
  cleaned = cleaned.replace(/!\[\]\(https:\/\/clicks\.eventbrite\.com\/q\/[^)]+\)[^{]*\{[^}]*\}/g, ''); // Eventbrite tracking pixel
  cleaned = cleaned.replace(/::::\s*\{\.hide.*?::::/gs, ''); // Hidden preheader blocks
  cleaned = cleaned.replace(/::::\s*\{style="color:transparent.*?::::/gs, ''); // Other hidden style blocks

  // 2. Remove Pandoc style/class blocks `::: {.*}`
  cleaned = cleaned.replace(/:::+\s*\{[^\}]*\}\s*/g, '');

  // 3. Remove Pandoc table artifacts `+:-...`, `| ... |` if they don't contain core text well
  //    This is tricky; let's try removing lines that are purely separators first.
  cleaned = cleaned.replace(/^\s*\+[:\-+]+\s*$/gm, ''); // Remove lines like +:------:+
  //    Remove lines that seem to be empty table cells or just formatting
  cleaned = cleaned.replace(/^\s*\|?\s*(&nbsp;|\s)*\|?\s*$/gm, '');

  // 4. Remove specific boilerplate sections (Logos, Social, Footer)
  cleaned = cleaned.replace(/::: \{\.row-logo-[^}]*?\}.*?:::?/gs, ''); // Eventbrite logo sections
  //    Remove social media block (identified by icon image names)
  cleaned = cleaned.replace(/\[\s*!\[(twitter|facebook|instagram)\].*?\]\([^)]+\)/gs, '');
  //    Remove footer section (starting from "This email was sent to")
  cleaned = cleaned.replace(/\[\s*\[\s*This email was sent to[\s\S]*/g, '');

  // 5. Clean URLs (remove common tracking parameters, case-insensitive) - Keep this
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', // Mailchimp
    '_hsenc', '_hsmi', // Hubspot
    'vero_conv', 'vero_id' // Vero
  ];
  const trackingParamRegex = new RegExp(`([?&])(${trackingParams.join('|')})=[^&#]+`, 'gi');

  // Clean standalone URLs
  cleaned = cleaned.replace(/(https?:\/\/[^?\s]+)(\?[^#\s]*)?/g, (match, baseUrl, query) => {
    if (!query) return baseUrl;
    let cleanedQuery = query.replace(trackingParamRegex, '');
    // Remove leading '&' if first param was removed
    cleanedQuery = cleanedQuery.replace(/^\&/, '?'); 
    // If query becomes just '?' or empty, remove it
    return baseUrl + (cleanedQuery.length > 1 ? cleanedQuery : '');
  });

   // Clean URLs within Markdown links [text](url)
  cleaned = cleaned.replace(/(\[.*?\]\()([^)]+)(\))/g, (match, prefix, url, suffix) => {
      let cleanedUrl = url.replace(trackingParamRegex, '');
      // Remove leading '&' if first param was removed
      cleanedUrl = cleanedUrl.replace(/(\?)&/, '$1');
      // If query becomes just '?' or empty, remove it
      cleanedUrl = cleanedUrl.replace(/\?$/, '');
      return prefix + cleanedUrl + suffix;
  });


  // 3. Normalize whitespace
  //    - Replace multiple blank lines with a single blank line
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  //    - Trim leading/trailing whitespace from each line
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
   //   - Trim leading/trailing whitespace from the whole text
  cleaned = cleaned.trim();

  // 6. Normalize whitespace (more aggressive)
  cleaned = cleaned.replace(/ /g, ' '); // Replace non-breaking spaces with regular spaces
  cleaned = cleaned.replace(/(\r\n|\r|\n)/g, '\n'); // Normalize line endings
  cleaned = cleaned.replace(/[ \t]+/g, ' '); // Replace multiple spaces/tabs with single space
  cleaned = cleaned.replace(/\n[ \t]+/g, '\n'); // Remove leading spaces/tabs from lines
  cleaned = cleaned.replace(/[ \t]+\n/g, '\n'); // Remove trailing spaces/tabs from lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Collapse multiple blank lines
  cleaned = cleaned.trim(); // Trim leading/trailing whitespace from the whole string

  // 7. Remove remaining isolated formatting characters or lines
  cleaned = cleaned.replace(/^\s*[-*_]{3,}\s*$/gm, ''); // Remove horizontal rule lines if they are redundant
  cleaned = cleaned.replace(/^\s*[:*+->]\s*$/gm, ''); // Remove lines with only list/quote markers

  // Final trim
  cleaned = cleaned.trim();

  return cleaned;
}


class GmailMcpServer {
  private server: Server;
  private auth: Auth.OAuth2Client | undefined;

  constructor() {
    this.server = new Server(
      {
        name: 'gmail-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async loadSavedCredentialsIfExist(): Promise<OAuth2Client | null> {
    if (!TOKEN_PATH || !CREDENTIALS_PATH) return null; // Need both paths

    try {
      // Read client ID and secret from credentials.json
      const credContent = await fs.readFile(CREDENTIALS_PATH);
      const keys = JSON.parse(credContent.toString());
      const key = keys.installed || keys.web;
      if (!key || !key.client_id || !key.client_secret) {
        console.error('Invalid credentials.json structure:', CREDENTIALS_PATH);
        return null;
      }
      const clientId = key.client_id;
      const clientSecret = key.client_secret;
      // Use the redirect URI that worked for get-tokens.js
      const redirectUri = 'http://localhost:8080'; 

      // Read refresh token from token.json
      const tokenContent = await fs.readFile(TOKEN_PATH);
      const tokenData = JSON.parse(tokenContent.toString());

      if (!tokenData.refresh_token) {
        console.error('Refresh token not found in token.json:', TOKEN_PATH);
        return null; // Cannot authenticate without refresh token
      }

      // Create client and set credentials
      const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      client.setCredentials({ refresh_token: tokenData.refresh_token });

      // Optional: Refresh the access token immediately to check validity
      // await client.getAccessToken(); 
      
      console.log('Successfully loaded credentials from token.json');
      return client;

    } catch (err: unknown) { // Explicitly type err as unknown
      console.error('Error loading credentials:', err);
      // If token file doesn't exist or is invalid, return null to trigger authenticate()
      // Check if the error is specifically ENOENT (file not found)
      // Type guard to safely access err.code
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') { 
         console.log('token.json not found. Proceeding to authorization.');
      } else {
         console.error('Failed to parse token.json or credentials.json, or other error:', err);
      }
      return null;
    }
  }

  private async saveCredentials(client: OAuth2Client): Promise<void> {
    if (!TOKEN_PATH || !CREDENTIALS_PATH) return; // Should not happen
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content.toString());
    const key = keys.installed || keys.web;
    if (!key || !key.client_id || !key.client_secret) {
      console.error('Invalid credentials file structure:', CREDENTIALS_PATH);
      return;
    }
    if (!client.credentials.refresh_token) {
       console.error('Attempted to save credentials without a refresh token.');
       // Optionally, re-run authorization if refresh token is missing
       // For now, we just won't save, assuming get-tokens.js handles generation
       return;
    }
    const payload = JSON.stringify({
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
    });
    await fs.writeFile(TOKEN_PATH, payload);
  }

  private async authorize(): Promise<OAuth2Client> {
    if (!CREDENTIALS_PATH) {
       throw new Error('Credentials path not set'); // Should not happen
    }
    let client = await this.loadSavedCredentialsIfExist();
    if (client) {
      return client;
    }
    client = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH, // This might still try to use local-auth's flow if load fails
    }) as OAuth2Client;
    // We don't need to save credentials here anymore if get-tokens.js handles it
    // if (client.credentials) {
    //   await this.saveCredentials(client);
    // }
    return client;
  }

  private async getGmailClient(): Promise<gmail_v1.Gmail> {
    if (!this.auth) {
      this.auth = await this.authorize();
    }
    if (!this.auth) {
      throw new McpError(ErrorCode.InternalError, 'Failed to authenticate with Gmail');
    }
    return google.gmail({ version: 'v1', auth: this.auth });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_labels',
          description: 'List all Gmail labels',
          inputSchema: {
            type: 'object',
            properties: {},
            required: []
          }
        },
        {
          name: 'list_messages',
          description: 'List messages matching query',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Gmail search query'
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of results',
                default: 10
              }
            },
            required: ['query']
          }
        },
        {
          name: 'get_message',
          description: 'Get full message content by ID',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Message ID'
              }
            },
            required: ['id']
          }
        },
        {
          name: 'delete_message',
          description: 'Delete a message by ID (moves it to trash)',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Message ID to delete'
              },
              permanent: {
                type: 'boolean',
                description: 'If true, permanently deletes the message instead of moving to trash',
                default: false
              }
            },
            required: ['id']
          }
        },
        {
          name: 'modify_message',
          description: 'Modify message properties (read/unread status, labels)',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Message ID to modify'
              },
              markRead: {
                type: 'boolean',
                description: 'If true, marks the message as read; if false, marks as unread'
              },
              addLabels: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Array of label IDs to add to the message'
              },
              removeLabels: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Array of label IDs to remove from the message'
              }
            },
            required: ['id']
          }
        },
        {
          name: 'batch_process',
          description: 'Process multiple messages in a single operation',
          inputSchema: {
            type: 'object',
            properties: {
              ids: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Array of message IDs to process'
              },
              action: {
                type: 'string',
                enum: ['delete', 'trash', 'markRead', 'markUnread', 'archive'],
                description: 'Action to perform on all messages'
              },
              addLabels: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Array of label IDs to add to all messages'
              },
              removeLabels: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Array of label IDs to remove from all messages'
              }
            },
            required: ['ids', 'action']
          }
        },
        {
          name: 'get_messages',
          description: 'Get full message content for multiple messages matching a query in a single operation',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Gmail search query'
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of messages to return',
                default: 5
              },
              format: {
                type: 'string',
                enum: ['full', 'metadata', 'minimal'],
                description: 'Amount of message data to include',
                default: 'full'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'save_email_as_markdown',
          description: 'Fetch an email, convert its HTML body to Markdown using pandoc, and save it to a file.',
          inputSchema: {
            type: 'object',
            properties: {
              message_id: {
                type: 'string',
                description: 'The ID of the Gmail message to convert.'
              },
              output_path: {
                type: 'string',
                description: 'The file path where the Markdown content should be saved (e.g., emails/message.md).'
              }
            },
            required: ['message_id', 'output_path']
          }
        },
        {
          name: 'send_email',
          description: 'Send an email using Gmail.',
          inputSchema: {
            type: 'object',
            properties: {
              to: {
                type: 'string',
                description: 'Recipient email address(es), comma-separated.'
              },
              subject: {
                type: 'string',
                description: 'Email subject line.'
              },
              body: {
                type: 'string',
                description: 'Email body content (plain text).'
              },
              cc: {
                type: 'string',
                description: 'CC recipient email address(es), comma-separated (optional).'
              },
              bcc: {
                type: 'string',
                description: 'BCC recipient email address(es), comma-separated (optional).'
              }
            },
            required: ['to', 'subject', 'body']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const gmail = await this.getGmailClient();
      
      try {
        switch (request.params.name) {
          case 'list_labels':
            const labelsRes = await gmail.users.labels.list({
              userId: 'me'
            } as gmail_v1.Params$Resource$Users$Labels$List);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(labelsRes.data.labels || [], null, 2)
              }]
            };
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(labelsRes.data.labels, null, 2)
              }]
            };
            
          case 'list_messages':
            if (!request.params.arguments) {
              throw new McpError(ErrorCode.InvalidParams, 'Missing arguments');
            }
            const messagesRes = await gmail.users.messages.list({
              userId: 'me',
              q: request.params.arguments.query,
              maxResults: request.params.arguments.maxResults || 10
            } as gmail_v1.Params$Resource$Users$Messages$List);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(messagesRes.data.messages || [], null, 2)
              }]
            };
            
          case 'get_message':
            if (!request.params.arguments) {
              throw new McpError(ErrorCode.InvalidParams, 'Missing arguments');
            }
            const messageRes = await gmail.users.messages.get({
              userId: 'me',
              id: request.params.arguments.id,
              format: 'full'
            } as gmail_v1.Params$Resource$Users$Messages$Get);
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(messageRes.data || {}, null, 2)
              }]
            };

          case 'save_email_as_markdown':
            if (!request.params.arguments || !request.params.arguments.message_id || !request.params.arguments.output_path) {
              throw new McpError(ErrorCode.InvalidParams, 'Missing message_id or output_path argument');
            }
            const messageId = request.params.arguments.message_id;
            let outputPath = request.params.arguments.output_path as string; // Ensure string type

            // Resolve relative paths based on the assumed project root
            const projectRoot = '/Users/mekonen/Library/Mobile Documents/com~apple~CloudDocs/Projects/nenokem-personal';
            if (!path.isAbsolute(outputPath)) {
              outputPath = path.resolve(projectRoot, outputPath);
              console.log(`Resolved relative output path to: ${outputPath}`);
            }

            // 1. Fetch the message
            const msgRes = await gmail.users.messages.get({
              userId: 'me',
              id: messageId,
              format: 'full' // Ensure we get the payload
            } as gmail_v1.Params$Resource$Users$Messages$Get);

            if (!msgRes.data || !msgRes.data.payload) {
              throw new McpError(ErrorCode.InternalError, 'Could not retrieve message payload.');
            }

            // 2. Find and decode HTML part
            let htmlBase64 = '';
            if (msgRes.data.payload.mimeType === 'text/html' && msgRes.data.payload.body?.data) {
              htmlBase64 = msgRes.data.payload.body.data;
            } else if (msgRes.data.payload.parts) {
              const htmlPart = msgRes.data.payload.parts.find(part => part.mimeType === 'text/html');
              if (htmlPart?.body?.data) {
                htmlBase64 = htmlPart.body.data;
              }
            }

            if (!htmlBase64) {
              // Try plain text part if HTML not found
              let textBase64 = '';
               if (msgRes.data.payload.mimeType === 'text/plain' && msgRes.data.payload.body?.data) {
                 textBase64 = msgRes.data.payload.body.data;
               } else if (msgRes.data.payload.parts) {
                 const textPart = msgRes.data.payload.parts.find(part => part.mimeType === 'text/plain');
                 if (textPart?.body?.data) {
                   textBase64 = textPart.body.data;
                 }
               }
               if (textBase64) {
                 const plainText = Buffer.from(textBase64, 'base64').toString('utf-8');
                 // Ensure outputPath is treated as string for fs functions
                 await fs.writeFile(outputPath as string, plainText); 
                 return {
                   content: [{ type: 'text', text: `Saved plain text content to ${outputPath} (HTML part not found).` }]
                 };
               } else {
                  throw new McpError(ErrorCode.InternalError, 'Could not find HTML or plain text part in the email.');
               }
            }

            const htmlContent = Buffer.from(htmlBase64, 'base64').toString('utf-8');

            // 3. Convert using pandoc
            const markdownContent = await new Promise<string>((resolve, reject) => {
              const pandoc = spawn('pandoc', ['-f', 'html', '-t', 'markdown']);
              let output = '';
              let errorOutput = '';

              pandoc.stdout.on('data', (data) => {
                output += data.toString();
              });

              pandoc.stderr.on('data', (data) => {
                 errorOutput += data.toString();
              });

              pandoc.on('close', (code) => {
                if (code === 0) {
                  resolve(output);
                } else {
                  reject(new Error(`Pandoc exited with code ${code}: ${errorOutput}`));
                }
              });
              
              pandoc.on('error', (err) => {
                 reject(new Error(`Failed to start pandoc: ${err.message}`));
              });

              // Write HTML to pandoc's stdin
              pandoc.stdin.write(htmlContent);
              pandoc.stdin.end();
            });

            // 4. Clean Markdown locally
            let finalMarkdownContent = cleanMarkdownLocally(markdownContent);
            console.log('Performed local Markdown cleanup.');

            // 5. Save final Markdown to file
            // Ensure directory exists (create if not) - requires path module
            const outputDir = path.dirname(outputPath as string); // Ensure string
            try {
              await fs.mkdir(outputDir, { recursive: true });
            } catch (mkdirError: unknown) { // Add type annotation
              // Ignore error if directory already exists, otherwise rethrow
              // Add type guard
              if (!(mkdirError && typeof mkdirError === 'object' && 'code' in mkdirError && mkdirError.code === 'EEXIST')) {
                 throw mkdirError; // Rethrow if it's not an 'EEXIST' error
              }
            }
            await fs.writeFile(outputPath as string, finalMarkdownContent); // Save final content

            return {
              content: [{
                type: 'text',
                text: `Successfully converted email ${messageId}, performed local cleanup, and saved Markdown to ${outputPath}`
              }]
            };

          case 'send_email':
            if (!request.params.arguments || !request.params.arguments.to || !request.params.arguments.subject || !request.params.arguments.body) {
              throw new McpError(ErrorCode.InvalidParams, 'Missing required arguments: to, subject, or body');
            }
            const { to, subject, body, cc, bcc } = request.params.arguments;

            // Construct the email message (RFC 2822 format)
            let emailLines = [];
            emailLines.push(`To: ${to}`);
            if (cc) emailLines.push(`Cc: ${cc}`);
            if (bcc) emailLines.push(`Bcc: ${bcc}`); // Note: Gmail API handles BCC delivery without showing it in headers of sent item
            emailLines.push(`Subject: ${subject}`);
            emailLines.push('Content-Type: text/plain; charset=utf-8');
            emailLines.push(''); // Blank line separates headers from body
            emailLines.push(body);

            const email = emailLines.join('\r\n');

            // Encode the message in base64url format
            const base64EncodedEmail = Buffer.from(email).toString('base64url');

            const sendRes = await gmail.users.messages.send({
              userId: 'me',
              requestBody: {
                raw: base64EncodedEmail
              }
            } as gmail_v1.Params$Resource$Users$Messages$Send);

            return {
              content: [{
                type: 'text',
                text: `Email sent successfully. Message ID: ${sendRes.data.id}`
              }]
            };
            
          case 'delete_message':
            if (!request.params.arguments || !request.params.arguments.id) {
              throw new McpError(ErrorCode.InvalidParams, 'Missing message ID');
            }
            
            const deleteMessageId = request.params.arguments.id;
            const permanent = request.params.arguments.permanent === true;
            
            if (permanent) {
              // Permanently delete the message
              await gmail.users.messages.delete({
                userId: 'me',
                id: deleteMessageId
              } as gmail_v1.Params$Resource$Users$Messages$Delete);
              
              return {
                content: [{
                  type: 'text',
                  text: `Message ${deleteMessageId} was permanently deleted.`
                }]
              };
            } else {
              // Move the message to trash (default behavior)
              await gmail.users.messages.trash({
                userId: 'me',
                id: deleteMessageId
              } as gmail_v1.Params$Resource$Users$Messages$Trash);
              
              return {
                content: [{
                  type: 'text',
                  text: `Message ${deleteMessageId} was moved to trash.`
                }]
              };
            }
            
          case 'modify_message':
            if (!request.params.arguments || !request.params.arguments.id) {
              throw new McpError(ErrorCode.InvalidParams, 'Missing message ID');
            }
            
            const modifyMessageId = request.params.arguments.id;
            const markRead = request.params.arguments.markRead;
            
            // Prepare the modification request
            const modifyRequest: gmail_v1.Schema$ModifyMessageRequest = {
              addLabelIds: Array.isArray(request.params.arguments.addLabels) ? request.params.arguments.addLabels : [],
              removeLabelIds: Array.isArray(request.params.arguments.removeLabels) ? request.params.arguments.removeLabels : []
            };
            
            // Handle read/unread status specifically
            if (markRead === true) {
              // Remove UNREAD label to mark as read
              if (!modifyRequest.removeLabelIds) {
                modifyRequest.removeLabelIds = [];
              }
              if (!modifyRequest.removeLabelIds.includes('UNREAD')) {
                modifyRequest.removeLabelIds.push('UNREAD');
              }
            } else if (markRead === false) {
              // Add UNREAD label to mark as unread
              if (!modifyRequest.addLabelIds) {
                modifyRequest.addLabelIds = [];
              }
              if (!modifyRequest.addLabelIds.includes('UNREAD')) {
                modifyRequest.addLabelIds.push('UNREAD');
              }
            }
            
            // Only proceed if we have something to modify
            if ((modifyRequest.addLabelIds && modifyRequest.addLabelIds.length > 0) ||
                (modifyRequest.removeLabelIds && modifyRequest.removeLabelIds.length > 0)) {
              
              const modifyRes = await gmail.users.messages.modify({
                userId: 'me',
                id: modifyMessageId,
                requestBody: modifyRequest
              } as gmail_v1.Params$Resource$Users$Messages$Modify);
              
              return {
                content: [{
                  type: 'text',
                  text: `Message ${modifyMessageId} was successfully modified.`
                }]
              };
            } else {
              return {
                content: [{
                  type: 'text',
                  text: `No modifications were specified for message ${modifyMessageId}.`
                }]
              };
            }
            
          case 'batch_process':
            if (!request.params.arguments || !request.params.arguments.ids || !request.params.arguments.action) {
              throw new McpError(ErrorCode.InvalidParams, 'Missing required arguments: ids or action');
            }
            
            const messageIds = request.params.arguments.ids;
            const action = request.params.arguments.action;
            
            if (!Array.isArray(messageIds) || messageIds.length === 0) {
              throw new McpError(ErrorCode.InvalidParams, 'Message IDs must be a non-empty array');
            }
            
            const results = [];
            const errors = [];
            
            // Process each message based on the action
            for (const id of messageIds) {
              try {
                switch (action) {
                  case 'delete':
                    await gmail.users.messages.delete({
                      userId: 'me',
                      id
                    } as gmail_v1.Params$Resource$Users$Messages$Delete);
                    results.push(`Message ${id} was permanently deleted.`);
                    break;
                    
                  case 'trash':
                    await gmail.users.messages.trash({
                      userId: 'me',
                      id
                    } as gmail_v1.Params$Resource$Users$Messages$Trash);
                    results.push(`Message ${id} was moved to trash.`);
                    break;
                    
                  case 'markRead':
                    await gmail.users.messages.modify({
                      userId: 'me',
                      id,
                      requestBody: {
                        removeLabelIds: ['UNREAD']
                      }
                    } as gmail_v1.Params$Resource$Users$Messages$Modify);
                    results.push(`Message ${id} was marked as read.`);
                    break;
                    
                  case 'markUnread':
                    await gmail.users.messages.modify({
                      userId: 'me',
                      id,
                      requestBody: {
                        addLabelIds: ['UNREAD']
                      }
                    } as gmail_v1.Params$Resource$Users$Messages$Modify);
                    results.push(`Message ${id} was marked as unread.`);
                    break;
                    
                  case 'archive':
                    await gmail.users.messages.modify({
                      userId: 'me',
                      id,
                      requestBody: {
                        removeLabelIds: ['INBOX']
                      }
                    } as gmail_v1.Params$Resource$Users$Messages$Modify);
                    results.push(`Message ${id} was archived.`);
                    break;
                    
                  default:
                    errors.push(`Unknown action: ${action} for message ${id}`);
                }
                
                // Handle additional label modifications if provided
                if (action !== 'delete' && action !== 'trash') {
                  const addLabels = Array.isArray(request.params.arguments.addLabels) ? request.params.arguments.addLabels : [];
                  const removeLabels = Array.isArray(request.params.arguments.removeLabels) ? request.params.arguments.removeLabels : [];
                  
                  if (addLabels.length > 0 || removeLabels.length > 0) {
                    await gmail.users.messages.modify({
                      userId: 'me',
                      id,
                      requestBody: {
                        addLabelIds: addLabels,
                        removeLabelIds: removeLabels
                      }
                    } as gmail_v1.Params$Resource$Users$Messages$Modify);
                    
                    if (addLabels.length > 0) {
                      results.push(`Added labels [${addLabels.join(', ')}] to message ${id}.`);
                    }
                    
                    if (removeLabels.length > 0) {
                      results.push(`Removed labels [${removeLabels.join(', ')}] from message ${id}.`);
                    }
                  }
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                errors.push(`Failed to process message ${id}: ${errorMessage}`);
              }
            }
            
            return {
              content: [{
                type: 'text',
                text: `Batch processing completed.\n\nSuccesses (${results.length}):\n${results.join('\n')}\n\nErrors (${errors.length}):\n${errors.length > 0 ? errors.join('\n') : 'None'}`
              }]
            };
            
          case 'get_messages':
            if (!request.params.arguments || !request.params.arguments.query) {
              throw new McpError(ErrorCode.InvalidParams, 'Missing query parameter');
            }
            
            const query = request.params.arguments.query;
            const maxResults = request.params.arguments.maxResults || 5;
            const format = request.params.arguments.format || 'full';
            
            // Step 1: Get message IDs matching the query
            const listRes = await gmail.users.messages.list({
              userId: 'me',
              q: query,
              maxResults: maxResults
            } as gmail_v1.Params$Resource$Users$Messages$List);
            
            if (!listRes.data.messages || listRes.data.messages.length === 0) {
              return {
                content: [{
                  type: 'text',
                  text: 'No messages found matching the query.'
                }]
              };
            }
            
            // Step 2: Fetch full content for each message
            const messages = [];
            for (const message of listRes.data.messages) {
              if (!message.id) continue;
              
              try {
                const msgRes = await gmail.users.messages.get({
                  userId: 'me',
                  id: message.id,
                  format: format
                } as gmail_v1.Params$Resource$Users$Messages$Get);
                
                messages.push(msgRes.data);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Error fetching message ${message.id}: ${errorMessage}`);
                // Continue with other messages even if one fails
              }
            }
            
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(messages, null, 2)
              }]
            };

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new McpError(ErrorCode.InternalError, `Gmail API error: ${message}`);
      }
    });
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: []
    }));

    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
      resourceTemplates: []
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async () => ({
      contents: []
    }));
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Gmail MCP server running on stdio');
  }
}

const server = new GmailMcpServer();
server.run().catch(console.error);
