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
import { google, type Auth, type calendar_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { authenticate } from '@google-cloud/local-auth';
import path from 'path';
import fs from 'fs/promises';

// Read paths from environment variables provided by MCP settings
// We'll need to define these in the MCP settings later
const TOKEN_PATH = process.env.GCAL_TOKEN_PATH;
const CREDENTIALS_PATH = process.env.GCAL_CREDENTIALS_PATH;

// Check if the required paths are provided
if (!TOKEN_PATH || !CREDENTIALS_PATH) {
  throw new Error('Missing GCAL_TOKEN_PATH or GCAL_CREDENTIALS_PATH environment variables');
}

// Scopes required for Google Calendar API access
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events', // Read/write access to events
  'https://www.googleapis.com/auth/calendar.readonly', // Read-only access if needed later
];

class GoogleCalendarMcpServer {
  private server: Server;
  private auth: Auth.OAuth2Client | undefined;

  constructor() {
    this.server = new Server(
      {
        name: 'google-calendar-mcp',
        version: '0.1.0',
        description: 'MCP Server for interacting with Google Calendar'
      },
      {
        capabilities: {
          resources: {}, // No resources planned for now
          tools: {},     // Tools will be defined here
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers(); // Keep basic resource handlers

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  // --- Authentication Logic (Adapted from Gmail Server) ---

  private async loadSavedCredentialsIfExist(): Promise<OAuth2Client | null> {
    if (!TOKEN_PATH || !CREDENTIALS_PATH) return null;

    try {
      const credContent = await fs.readFile(CREDENTIALS_PATH);
      const keys = JSON.parse(credContent.toString());
      const key = keys.installed || keys.web;
      if (!key || !key.client_id || !key.client_secret) {
        console.error('Invalid credentials.json structure:', CREDENTIALS_PATH);
        return null;
      }
      const clientId = key.client_id;
      const clientSecret = key.client_secret;
      const redirectUri = 'http://localhost:8080'; // Consistent redirect URI

      const tokenContent = await fs.readFile(TOKEN_PATH);
      const tokenData = JSON.parse(tokenContent.toString());

      if (!tokenData.refresh_token) {
        console.error('Refresh token not found in token.json:', TOKEN_PATH);
        return null;
      }

      const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      client.setCredentials({ refresh_token: tokenData.refresh_token });

      console.log('Successfully loaded Google Calendar credentials from token.json');
      return client;

    } catch (err: unknown) {
      console.error('Error loading Google Calendar credentials:', err);
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
         console.log('Calendar token.json not found. Proceeding to authorization.');
      } else {
         console.error('Failed to parse token.json or credentials.json, or other error:', err);
      }
      return null;
    }
  }

  // Note: We need a separate get-tokens script for Calendar, similar to Gmail
  // This saveCredentials function assumes a refresh token is obtained externally
  private async saveCredentials(client: OAuth2Client): Promise<void> {
     if (!TOKEN_PATH || !CREDENTIALS_PATH) return;
     const content = await fs.readFile(CREDENTIALS_PATH);
     const keys = JSON.parse(content.toString());
     const key = keys.installed || keys.web;
     if (!key || !key.client_id || !key.client_secret) {
       console.error('Invalid credentials file structure:', CREDENTIALS_PATH);
       return;
     }
     if (!client.credentials.refresh_token) {
        console.error('Attempted to save Calendar credentials without a refresh token.');
        // This indicates the auth flow needs to be run (e.g., via a separate script)
        return;
     }
     const payload = JSON.stringify({
       type: 'authorized_user',
       client_id: key.client_id,
       client_secret: key.client_secret,
       refresh_token: client.credentials.refresh_token,
     });
     await fs.writeFile(TOKEN_PATH, payload);
     console.log('Saved Google Calendar credentials to token.json');
   }


  private async authorize(): Promise<OAuth2Client> {
    if (!CREDENTIALS_PATH) {
       throw new Error('Calendar credentials path not set');
    }
    let client = await this.loadSavedCredentialsIfExist();
    if (client) {
      return client;
    }
    // If no token exists, authentication needs to happen externally first
    // (e.g., using a separate script like get-calendar-tokens.js)
    // This server *requires* a pre-existing token.json.
    // Use InternalError as a fallback since specific auth codes seem problematic
    throw new McpError(
        ErrorCode.InternalError,
        `Google Calendar token file not found or invalid (${TOKEN_PATH}). Please run the authorization flow first.`
    );
    // The code below would trigger the interactive flow, which we want to avoid in the server itself.
    /*
    client = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    }) as OAuth2Client;
    if (client.credentials && client.credentials.refresh_token) {
      await this.saveCredentials(client);
    } else {
        console.error("Authorization completed but no refresh token was obtained. Cannot save credentials.");
    }
    return client;
    */
  }

  private async getCalendarClient(): Promise<calendar_v3.Calendar> {
    if (!this.auth) {
      this.auth = await this.authorize();
    }
    if (!this.auth) {
      // Authorize should throw before this point if it fails
      throw new McpError(ErrorCode.InternalError, 'Failed to authenticate with Google Calendar');
    }
    return google.calendar({ version: 'v3', auth: this.auth });
  }

  // --- Tool Handlers (Placeholders) ---

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_calendars',
          description: 'List all accessible calendars.',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'list_events',
          description: 'List events from a specified calendar within a time range.',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'Calendar identifier. Use "primary" for the primary calendar.',
                default: 'primary'
              },
              timeMin: {
                type: 'string',
                format: 'date-time',
                description: 'Start of the time range (RFC3339 timestamp, e.g., 2025-04-05T10:00:00Z). Defaults to now.'
              },
              timeMax: {
                type: 'string',
                format: 'date-time',
                description: 'End of the time range (RFC3339 timestamp, e.g., 2025-04-06T10:00:00Z). Required if timeMin is provided.'
              },
              maxResults: {
                type: 'integer',
                description: 'Maximum number of events to return.',
                default: 10
              },
              q: {
                type: 'string',
                description: 'Free text search query.'
              },
              orderBy: {
                type: 'string',
                enum: ['startTime', 'updated'],
                description: 'Order of the events returned.',
                default: 'startTime'
              },
              singleEvents: {
                type: 'boolean',
                description: 'Whether to expand recurring events into single instances.',
                default: true
              }
            },
            required: [] // timeMin/timeMax are common, but let API use defaults if not provided
          }
        },
        {
          name: 'create_event',
          description: 'Create a new event in a specified calendar.',
          inputSchema: {
            type: 'object',
            properties: {
              calendarId: {
                type: 'string',
                description: 'Calendar identifier. Use "primary" for the primary calendar.',
                default: 'primary'
              },
              event: {
                type: 'object',
                description: 'Event resource object (see Google Calendar API docs). Requires at least summary, start, and end.',
                properties: {
                   summary: { type: 'string', description: 'Event title.' },
                   description: { type: 'string', description: 'Event description (optional).' },
                   start: {
                     type: 'object',
                     properties: {
                       dateTime: { type: 'string', format: 'date-time', description: 'Start time (RFC3339) for timed events.' },
                       date: { type: 'string', format: 'date', description: 'Start date (YYYY-MM-DD) for all-day events.' },
                       timeZone: { type: 'string', description: 'Timezone (e.g., "America/Los_Angeles"). Optional.' }
                     },
                     required: [] // Either dateTime or date must be present
                   },
                   end: {
                     type: 'object',
                     properties: {
                       dateTime: { type: 'string', format: 'date-time', description: 'End time (RFC3339) for timed events.' },
                       date: { type: 'string', format: 'date', description: 'End date (YYYY-MM-DD) for all-day events.' },
                       timeZone: { type: 'string', description: 'Timezone (e.g., "America/Los_Angeles"). Optional.' }
                     },
                     required: [] // Either dateTime or date must be present
                   },
                   attendees: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { email: { type: 'string', format: 'email' } }
                      },
                      description: 'List of attendees (optional).'
                   },
                   // Add other common fields like location, recurrence, etc. as needed
                },
                required: ['summary', 'start', 'end']
              }
            },
            required: ['event']
          }
        },
        {
            name: 'update_event',
            description: 'Update an existing event in a specified calendar.',
            inputSchema: {
              type: 'object',
              properties: {
                calendarId: {
                  type: 'string',
                  description: 'Calendar identifier. Use "primary" for the primary calendar.',
                  default: 'primary'
                },
                eventId: {
                  type: 'string',
                  description: 'The ID of the event to update.'
                },
                event: {
                  type: 'object',
                  description: 'Event resource object containing the fields to update (see Google Calendar API docs).',
                  // Define properties you expect to update, e.g., summary, start, end, reminders, location
                  properties: {
                     summary: { type: 'string', description: 'New event title (optional).' },
                     description: { type: 'string', description: 'New event description (optional).' },
                     location: { type: 'string', description: 'New event location (optional).' },
                     start: {
                       type: 'object',
                       properties: {
                         dateTime: { type: 'string', format: 'date-time' },
                         date: { type: 'string', format: 'date' },
                         timeZone: { type: 'string' }
                       },
                       description: 'New start time/date (optional).'
                     },
                     end: {
                       type: 'object',
                       properties: {
                         dateTime: { type: 'string', format: 'date-time' },
                         date: { type: 'string', format: 'date' },
                         timeZone: { type: 'string' }
                       },
                       description: 'New end time/date (optional).'
                     },
                     reminders: {
                        type: 'object',
                        properties: {
                            useDefault: { type: 'boolean' },
                            overrides: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        method: { type: 'string', enum: ['email', 'popup'] },
                                        minutes: { type: 'integer' }
                                    },
                                    required: ['method', 'minutes']
                                }
                            }
                        },
                        description: 'New reminder settings (optional).'
                     }
                     // Add other updatable fields as needed
                  }
                }
              },
              required: ['eventId', 'event']
            }
          },
          {
            name: 'get_event',
            description: 'Get details for a specific event by its ID.',
            inputSchema: {
                type: 'object',
                properties: {
                    calendarId: {
                        type: 'string',
                        description: 'Calendar identifier. Use "primary" for the primary calendar.',
                        default: 'primary'
                    },
                    eventId: {
                        type: 'string',
                        description: 'The ID of the event to retrieve.'
                    }
                },
                required: ['eventId']
            }
          }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const calendar = await this.getCalendarClient();

      try {
        switch (request.params.name) {
          // TODO: Implement tool logic here
          case 'list_calendars':
             const res = await calendar.calendarList.list();
             return {
               content: [{
                 type: 'text',
                 text: JSON.stringify(res.data.items || [], null, 2)
               }]
             };

          case 'list_events':
            const listParams = request.params.arguments || {};

            // --- Calculate default time range (current week) ---
            let defaultTimeMin: string | undefined;
            let defaultTimeMax: string | undefined;
            if (!listParams.timeMin && !listParams.timeMax) {
              const now = new Date();
              const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
              const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust Sunday to be previous week's Monday

              const startOfWeek = new Date(now);
              startOfWeek.setDate(now.getDate() + diffToMonday);
              startOfWeek.setHours(0, 0, 0, 0); // Start of Monday

              const endOfWeek = new Date(startOfWeek);
              endOfWeek.setDate(startOfWeek.getDate() + 6);
              endOfWeek.setHours(23, 59, 59, 999); // End of Sunday

              defaultTimeMin = startOfWeek.toISOString();
              defaultTimeMax = endOfWeek.toISOString();
              console.log(`Defaulting list_events time range to current week: ${defaultTimeMin} to ${defaultTimeMax}`);
            }
            // --- End Calculate default time range ---

            const eventsRes = await calendar.events.list({
              calendarId: listParams.calendarId || 'primary',
              timeMin: listParams.timeMin || defaultTimeMin, // Use calculated default if needed
              timeMax: listParams.timeMax || defaultTimeMax, // Use calculated default if needed
              maxResults: listParams.maxResults || 10,
              singleEvents: listParams.singleEvents !== undefined ? listParams.singleEvents : true,
              orderBy: listParams.orderBy || 'startTime',
              q: listParams.q,
            } as calendar_v3.Params$Resource$Events$List); // Type assertion
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(eventsRes.data.items || [], null, 2)
              }]
            };

          case 'create_event':
             const createParams = request.params.arguments;
             // Add type check for createParams first
             if (!createParams || typeof createParams !== 'object' || createParams === null) {
                 throw new McpError(ErrorCode.InvalidParams, 'Missing arguments for create_event.');
             }
             // Assert event as 'any' to bypass strict checks before validation
             const eventInput = createParams.event as any;

             // Now validate the structure using the asserted type
             if (
               !eventInput || typeof eventInput !== 'object' || eventInput === null ||
               typeof eventInput.summary !== 'string' ||
               !eventInput.start || typeof eventInput.start !== 'object' || eventInput.start === null ||
               !eventInput.end || typeof eventInput.end !== 'object' || eventInput.end === null
             ) {
               throw new McpError(ErrorCode.InvalidParams, 'Invalid or missing required event details (event object with summary, start, end) for create_event.');
             }
             // Type assertion for start and end after the check
             const eventStart = eventInput.start as { dateTime?: string; date?: string };
             const eventEnd = eventInput.end as { dateTime?: string; date?: string };

             // Validate start/end object structure minimally
             if (!(eventStart.dateTime || eventStart.date) || !(eventEnd.dateTime || eventEnd.date)) {
                throw new McpError(ErrorCode.InvalidParams, 'Event start and end must have either a "dateTime" or "date" property.');
             }

             const calendarId = (typeof createParams.calendarId === 'string' ? createParams.calendarId : 'primary');

             const createRes = await calendar.events.insert({
               calendarId: calendarId,
               requestBody: eventInput as calendar_v3.Schema$Event // Use the asserted eventInput
             } as calendar_v3.Params$Resource$Events$Insert);
             return {
               content: [{
                 type: 'text',
                 text: `Event created successfully. ID: ${createRes.data.id}\nLink: ${createRes.data.htmlLink}`
               }]
             };

          case 'update_event':
            const updateParams = request.params.arguments;
            if (!updateParams || typeof updateParams !== 'object' || updateParams === null) {
                throw new McpError(ErrorCode.InvalidParams, 'Missing arguments for update_event.');
            }
            const eventIdToUpdate = updateParams.eventId as string;
            const partialEventUpdateData = updateParams.event as any; // The updates provided by the user

            if (!eventIdToUpdate || typeof eventIdToUpdate !== 'string') {
                throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid "eventId" for update_event.');
            }
            if (!partialEventUpdateData || typeof partialEventUpdateData !== 'object' || partialEventUpdateData === null || Object.keys(partialEventUpdateData).length === 0) {
                throw new McpError(ErrorCode.InvalidParams, 'Missing or empty "event" object containing update data for update_event.');
            }

            const calendarIdToUpdate = (typeof updateParams.calendarId === 'string' ? updateParams.calendarId : 'primary');

            // --- Fetch existing event data ---
            let existingEventData: calendar_v3.Schema$Event;
            try {
                const getRes = await calendar.events.get({
                    calendarId: calendarIdToUpdate,
                    eventId: eventIdToUpdate,
                } as calendar_v3.Params$Resource$Events$Get);
                existingEventData = getRes.data;
                if (!existingEventData) {
                     throw new Error('Event not found'); // Should be caught below
                }
            } catch (getErr) {
                 const getMessage = getErr instanceof Error ? getErr.message : 'Unknown error fetching event';
                 // Handle specific 'Not Found' error if possible, otherwise generic internal error
                 if (getMessage.includes('Not Found') || (getErr as any)?.code === 404) {
                     throw new McpError(ErrorCode.InvalidParams, `Event with ID "${eventIdToUpdate}" not found in calendar "${calendarIdToUpdate}".`);
                 }
                 throw new McpError(ErrorCode.InternalError, `Failed to fetch existing event details: ${getMessage}`);
            }

            // --- Merge updates onto existing data ---
            // Simple merge: overwrite top-level fields provided in the update.
            // Note: For nested objects like 'reminders', this replaces the whole object.
            // A more sophisticated deep merge could be implemented if needed.
            const mergedEventData = {
                ...existingEventData,
                ...partialEventUpdateData,
                // Ensure reminders object is handled correctly (overwrite if provided)
                reminders: partialEventUpdateData.reminders !== undefined
                    ? partialEventUpdateData.reminders
                    : existingEventData.reminders,
            };

            // --- Perform the update ---
            const updateRes = await calendar.events.update({
                calendarId: calendarIdToUpdate,
                eventId: eventIdToUpdate,
                requestBody: mergedEventData as calendar_v3.Schema$Event // Send the merged data
            } as calendar_v3.Params$Resource$Events$Update);

            return {
                content: [{
                    type: 'text',
                    text: `Event updated successfully. ID: ${updateRes.data.id}\nLink: ${updateRes.data.htmlLink}`
                }]
            };

          case 'get_event':
            const getParams = request.params.arguments;
            if (!getParams || typeof getParams !== 'object' || getParams === null) {
                throw new McpError(ErrorCode.InvalidParams, 'Missing arguments for get_event.');
            }
            const eventIdToGet = getParams.eventId as string;
            if (!eventIdToGet || typeof eventIdToGet !== 'string') {
                throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid "eventId" for get_event.');
            }
            const calendarIdToGet = (typeof getParams.calendarId === 'string' ? getParams.calendarId : 'primary');

            const getRes = await calendar.events.get({
                calendarId: calendarIdToGet,
                eventId: eventIdToGet,
            } as calendar_v3.Params$Resource$Events$Get);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(getRes.data, null, 2)
                }]
            };

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        // Check for specific Google API errors if needed
        if (error instanceof McpError) throw error; // Don't re-wrap MCP errors
        throw new McpError(ErrorCode.InternalError, `Google Calendar API error: ${message}`);
      }
    });
  }

  // --- Resource Handlers (Basic Stubs) ---

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [] // No static resources defined
    }));

    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
      resourceTemplates: [] // No dynamic resources defined
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
       // Use MethodNotFound for unimplemented resource reads
       throw new McpError(ErrorCode.MethodNotFound, `Resource URI not supported: ${request.params.uri}`);
    });
  }

  // --- Server Start ---

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Google Calendar MCP server running on stdio');
  }
}

const server = new GoogleCalendarMcpServer();
server.run().catch(console.error);
