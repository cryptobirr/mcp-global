#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { YoutubeTranscript } from 'youtube-transcript';
import fs from 'fs/promises';
import path from 'path';
import he from 'he'; // Import the 'he' library

const CLINE_CWD = process.cwd();

// Helper function to validate arguments for the tool
const isValidGetTranscriptArgs = (
  args: any
): args is { video_url: string; output_path: string } =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.video_url === 'string' &&
  typeof args.output_path === 'string';

class YoutubeMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'youtube-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {}, // No resources defined for this server
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    // Basic error handling and graceful shutdown
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
          name: 'get_transcript_and_save',
          description:
            'Fetches the transcript for a YouTube video and saves it as a Markdown file.',
          inputSchema: {
            type: 'object',
            properties: {
              video_url: {
                type: 'string',
                description: 'The full URL of the YouTube video.',
              },
              output_path: {
                type: 'string',
                description:
                  'The local file path where the Markdown transcript should be saved (e.g., transcripts/video_title.md).',
              },
            },
            required: ['video_url', 'output_path'],
          },
        },
      ],
    }));

    // Handler to execute the tool
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        if (request.params.name !== 'get_transcript_and_save') {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
        }

        if (!isValidGetTranscriptArgs(request.params.arguments)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for get_transcript_and_save. Requires "video_url" (string) and "output_path" (string).'
          );
        }

        let { video_url, output_path } = request.params.arguments;

        // Convert Shorts URL to standard watch URL if necessary
        const shortsRegex = /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/;
        const shortsMatch = video_url.match(shortsRegex);
        if (shortsMatch && shortsMatch[1]) {
          const videoId = shortsMatch[1];
          const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;
          console.error(`Detected Shorts URL. Converting to: ${standardUrl}`);
          video_url = standardUrl; // Use the converted URL
        }


        try {
          // 1. Fetch transcript
          console.error(`Fetching transcript for: ${video_url}`);
          const transcriptEntries = await YoutubeTranscript.fetchTranscript(
            video_url
          );

          if (!transcriptEntries || transcriptEntries.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `No transcript found or available for ${video_url}`,
                },
              ],
              isError: true,
            };
          }

          // 2. Format transcript to Markdown and generate title
          console.error('Formatting transcript and generating title...');
          // Manually replace common apostrophe entities first, then decode others
          const rawTranscriptText = transcriptEntries.map((entry) => entry.text).join(' ');
          const preDecodedText = rawTranscriptText
              .replace(/&#39;/g, "'") // Replace numeric entity
              .replace(/'/g, "'"); // Replace named entity
          // Use preDecodedText for filename generation, decode fully for content
          const decodedTranscriptText = he.decode(preDecodedText);


          // Generate title from the first ~10 words of the *fully* decoded text
          const titleWords = decodedTranscriptText.split(' ').slice(0, 10).join(' ');
          const title = titleWords ? titleWords.trim() + '...' : 'Transcript'; // Add ellipsis if truncated

          // Use *fully* decoded text for the file content
          const markdownContent = `# ${title}\n\n${decodedTranscriptText}`;

          // Generate a sanitized filename from the first ~5 words of the *pre-decoded* text
          const filenameWords = preDecodedText.split(' ').slice(0, 5).join(' '); // Use preDecodedText here
          let baseFilename = filenameWords
              ? filenameWords
                  .trim()
                  .toLowerCase()
                  // First, replace spaces with hyphens
                  .replace(/\s+/g, '-')
                  // Then, remove any character that is NOT a letter, number, or hyphen
                  .replace(/[^a-z0-9-]/g, '')
              : `transcript-${Date.now()}`; // Fallback filename
          if (!baseFilename || baseFilename === '-') { // Handle cases where sanitization results in empty string or just hyphens
              baseFilename = `transcript-${Date.now()}`;
          }
          const finalFilename = `${baseFilename}.md`;

          // Construct the final path using the original output_path's directory
          const originalOutputDir = path.dirname(path.resolve(CLINE_CWD, output_path));
          const absoluteOutputPath = path.join(originalOutputDir, finalFilename);
          const outputDir = path.dirname(absoluteOutputPath); // Should be the same as originalOutputDir

          console.error(`Ensuring directory exists: ${outputDir}`);
          await fs.mkdir(outputDir, { recursive: true });

          console.error(`Saving transcript to: ${absoluteOutputPath}`);
          await fs.writeFile(absoluteOutputPath, markdownContent, 'utf-8');

          // 4. Return success message using the actual saved path relative to CWD
          const relativeSavedPath = path.relative(CLINE_CWD, absoluteOutputPath);
          return {
            content: [
              {
                type: 'text',
                text: `Transcript successfully saved to ${relativeSavedPath}`,
              },
            ],
          };
        } catch (error: any) {
          console.error('Error during transcript processing:', error);
          // Handle specific youtube-transcript errors if needed, otherwise generic error
          let errorMessage = `Failed to process transcript for ${video_url}.`;
          if (error instanceof Error) {
            errorMessage += ` Error: ${error.message}`;
          } else if (typeof error === 'string') {
             errorMessage += ` Error: ${error}`;
          }

          // Check if it's a "TranscriptsDisabled" error specifically
          if (error.message?.includes('TranscriptsDisabled')) {
             errorMessage = `Transcripts are disabled for the video: ${video_url}`;
          } else if (error.message?.includes('Could not find transcript')) {
             errorMessage = `Could not find a transcript for the video: ${video_url}`;
          }


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
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('YouTube MCP server running on stdio');
  }
}

const server = new YoutubeMcpServer();
server.run().catch(console.error);
