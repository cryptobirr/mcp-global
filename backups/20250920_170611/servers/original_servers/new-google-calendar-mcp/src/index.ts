#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs/promises';
import * as path from 'path';

const GCAL_CREDENTIALS_PATH = process.env.GCAL_CREDENTIALS_PATH;
const GCAL_TOKEN_PATH = process.env.GCAL_TOKEN_PATH;

if (!GCAL_CREDENTIALS_PATH || !GCAL_TOKEN_PATH) {
	throw new Error(
		'GCAL_CREDENTIALS_PATH and GCAL_TOKEN_PATH environment variables are required'
	);
}

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

async function authorize(credentialsPath: string, tokenPath: string): Promise<OAuth2Client> {
	const credentials = JSON.parse(
		await fs.readFile(credentialsPath, 'utf-8')
	);
	const { client_secret, client_id, redirect_uris } = credentials.installed;
	const oAuth2Client = new google.auth.OAuth2(
		client_id,
		client_secret,
		redirect_uris[0]
	);

	try {
		const token = JSON.parse(await fs.readFile(tokenPath, 'utf-8'));
		oAuth2Client.setCredentials(token);
		return oAuth2Client;
	} catch (error) {
		throw new Error(
			`Failed to load token from ${tokenPath}. Please ensure you have run the authorization flow.`
		);
	}
}

class GoogleCalendarServer {
	private server: Server;
	private authClient: OAuth2Client | undefined;

	constructor() {
		this.server = new Server(
			{
				name: 'gcal_new',
				version: '0.1.0',
			},
			{
				capabilities: {
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

	private async getAuthClient(): Promise<OAuth2Client> {
		if (!this.authClient) {
			// Since we check for existence of these env vars at the top level,
			// we can assert they are defined here.
			this.authClient = await authorize(GCAL_CREDENTIALS_PATH!, GCAL_TOKEN_PATH!);
		}
		return this.authClient;
	}

	private setupToolHandlers() {
		this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
			tools: [
				{
					name: 'list_calendars',
					description: 'List all accessible Google calendars.',
					inputSchema: { type: 'object', properties: {} },
				},
				{
					name: 'list_events',
					description:
						'List events from a specified calendar within a time range.',
					inputSchema: {
						type: 'object',
						properties: {
							calendarId: {
								type: 'string',
								description:
									'Calendar identifier. Use "primary" for the primary calendar.',
								default: 'primary',
							},
							timeMin: {
								type: 'string',
								format: 'date-time',
								description:
									'Start of the time range (RFC3339 timestamp, e.g., 2025-04-05T10:00:00Z). Defaults to now.',
							},
							timeMax: {
								type: 'string',
								format: 'date-time',
								description:
									'End of the time range (RFC3339 timestamp, e.g., 2025-04-06T10:00:00Z). Required if timeMin is provided.',
							},
							maxResults: {
								type: 'integer',
								description: 'Maximum number of events to return.',
								default: 10,
							},
							q: {
								type: 'string',
								description: 'Free text search query.',
							},
							orderBy: {
								type: 'string',
								enum: ['startTime', 'updated'],
								description: 'Order of the events returned.',
								default: 'startTime',
							},
							singleEvents: {
								type: 'boolean',
								description:
									'Whether to expand recurring events into single instances.',
								default: true,
							},
						},
					},
				},
				// Add other Google Calendar tools here (create_event, update_event, get_event)
				{
					name: 'create_event',
					description: 'Create a new event in a specified calendar.',
					inputSchema: {
						type: 'object',
						properties: {
							calendarId: {
								type: 'string',
								description:
									'Calendar identifier. Use "primary" for the primary calendar.',
								default: 'primary',
							},
							event: {
								type: 'object',
								description:
									'Event resource object (see Google Calendar API docs). Requires at least summary, start, and end.',
								properties: {
									summary: {
										type: 'string',
										description: 'Event title.',
									},
									description: {
										type: 'string',
										description: 'Event description (optional).',
									},
									start: {
										type: 'object',
										properties: {
											dateTime: {
												type: 'string',
												format: 'date-time',
												description:
													'Start time (RFC3339) for timed events.',
											},
											date: {
												type: 'string',
												format: 'date',
												description:
													'Start date (YYYY-MM-DD) for all-day events.',
											},
											timeZone: {
												type: 'string',
												description:
													'Timezone (e.g., "America/Los_Angeles"). Optional.',
											},
										},
										required: [],
									},
									end: {
										type: 'object',
										properties: {
											dateTime: {
												type: 'string',
												format: 'date-time',
												description:
													'End time (RFC3339) for timed events.',
											},
											date: {
												type: 'string',
												format: 'date',
												description:
													'End date (YYYY-MM-DD) for all-day events.',
											},
											timeZone: {
												type: 'string',
												description:
													'Timezone (e.g., "America/Los_Angeles"). Optional.',
											},
										},
										required: [],
									},
									attendees: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												email: {
													type: 'string',
													format: 'email',
												},
											},
										},
										description: 'List of attendees (optional).',
									},
								},
								required: ['summary', 'start', 'end'],
							},
						},
						required: ['event'],
					},
				},
				{
					name: 'update_event',
					description: 'Update an existing event in a specified calendar.',
					inputSchema: {
						type: 'object',
						properties: {
							calendarId: {
								type: 'string',
								description:
									'Calendar identifier. Use "primary" for the primary calendar.',
								default: 'primary',
							},
							eventId: {
								type: 'string',
								description: 'The ID of the event to update.',
							},
							event: {
								type: 'object',
								description:
									'Event resource object containing the fields to update (see Google Calendar API docs).',
								properties: {
									summary: {
										type: 'string',
										description: 'New event title (optional).',
									},
									description: {
										type: 'string',
										description: 'New event description (optional).',
									},
									location: {
										type: 'string',
										description: 'New event location (optional).',
									},
									start: {
										type: 'object',
										properties: {
											dateTime: {
												type: 'string',
												format: 'date-time',
											},
											date: {
												type: 'string',
												format: 'date',
											},
											timeZone: {
												type: 'string',
											},
										},
										description: 'New start time/date (optional).',
									},
									end: {
										type: 'object',
										properties: {
											dateTime: {
												type: 'string',
												format: 'date-time',
											},
											date: {
												type: 'string',
												format: 'date',
											},
											timeZone: {
												type: 'string',
											},
										},
										description: 'New end time/date (optional).',
									},
									reminders: {
										type: 'object',
										properties: {
											useDefault: {
												type: 'boolean',
											},
											overrides: {
												type: 'array',
												items: {
													type: 'object',
													properties: {
														method: {
															type: 'string',
															enum: ['email', 'popup'],
														},
														minutes: {
															type: 'integer',
														},
													},
													required: ['method', 'minutes'],
												},
											},
										},
										description: 'New reminder settings (optional).',
									},
								},
							},
						},
						required: ['eventId', 'event'],
					},
				},
				{
					name: 'get_event',
					description: 'Get details for a specific event by its ID.',
					inputSchema: {
						type: 'object',
						properties: {
							calendarId: {
								type: 'string',
								description:
									'Calendar identifier. Use "primary" for the primary calendar.',
								default: 'primary',
							},
							eventId: {
								type: 'string',
								description: 'The ID of the event to retrieve.',
							},
						},
						required: ['eventId'],
					},
				},
			],
		}));

		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			const auth = await this.getAuthClient();
			const calendar = google.calendar({ version: 'v3', auth });

			try {
				switch (request.params.name) {
					case 'list_calendars': {
						const res = await calendar.calendarList.list();
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(res.data.items, null, 2),
								},
							],
						};
					}

					case 'list_events': {
						const {
							calendarId = 'primary',
							timeMin,
							timeMax,
							maxResults = 10,
							q,
							orderBy = 'startTime',
							singleEvents = true,
						} = request.params.arguments as any;

						const res = await calendar.events.list({
							calendarId,
							timeMin: timeMin || new Date().toISOString(),
							timeMax,
							maxResults,
							q,
							orderBy,
							singleEvents,
						});

						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(res.data.items, null, 2),
								},
							],
						};
					}

					case 'create_event': {
						const { calendarId = 'primary', event } =
							request.params.arguments as any;
						const res = await calendar.events.insert({
							calendarId,
							requestBody: event,
						});
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(res.data, null, 2),
								},
							],
						};
					}

					case 'update_event': {
						const { calendarId = 'primary', eventId, event } =
							request.params.arguments as any;
						const res = await calendar.events.patch({
							calendarId,
							eventId,
							requestBody: event,
						});
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(res.data, null, 2),
								},
							],
						};
					}

					case 'get_event': {
						const { calendarId = 'primary', eventId } =
							request.params.arguments as any;
						const res = await calendar.events.get({
							calendarId,
							eventId,
						});
						return {
							content: [
								{
									type: 'text',
									text: JSON.stringify(res.data, null, 2),
								},
							],
						};
					}

					default:
						throw new McpError(
							ErrorCode.MethodNotFound,
							`Unknown tool: ${request.params.name}`
						);
				}
			} catch (error) {
				console.error('Google Calendar API error:', error);
				throw new McpError(
					ErrorCode.InternalError,
					`Google Calendar API error: ${error}`
				);
			}
		});
	}

	async run() {
		const transport = new StdioServerTransport();
		await this.server.connect(transport);
		console.error('Google Calendar MCP server running on stdio');
	}
}

const server = new GoogleCalendarServer();
server.run().catch(console.error);
