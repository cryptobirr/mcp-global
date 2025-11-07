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
import { createWriteStream } from 'fs';
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
          /**
           * Fetches and processes YouTube transcript using streaming to minimize memory usage.
           *
           * Process:
           * 1. Fetch transcript entries from YouTube
           * 2. Generate title and filename from first entry
           * 3. Stream transcript to file in chunks (CHUNK_SIZE entries per batch)
           * 4. Decode HTML entities during streaming
           *
           * Memory efficiency:
           * - Processes transcript in 1000-entry chunks
           * - Uses file streams instead of string concatenation
           * - Keeps peak memory <100MB for 60k+ entry transcripts
           */
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

          // 2. Format transcript to Markdown and generate title/filename
          console.error('Formatting transcript and generating title...');

          // Configuration constants
          // CHUNK_SIZE: Balance between memory efficiency (smaller chunks) and I/O overhead (fewer writes)
          // 1000 entries keeps memory usage <100MB for 60k entry transcripts while minimizing disk I/O
          const CHUNK_SIZE = 1000; // entries per batch
          const PROGRESS_THRESHOLD = 5000; // when to show progress

          // Memory monitoring (gated by DEBUG env var)
          let memoryBefore: NodeJS.MemoryUsage | undefined;
          if (process.env.DEBUG?.includes('memory')) {
            memoryBefore = process.memoryUsage();
            console.error(`Memory before streaming: ${Math.round(memoryBefore.heapUsed / 1024 / 1024)}MB`);
          }

          // Generate title from first entry only (avoid loading full transcript)
          const firstEntryText = transcriptEntries[0]?.text || '';
          const preDecodedFirstEntry = firstEntryText
              .replace(/&#39;/g, "'") // Replace numeric entity
              .replace(/'/g, "'"); // Replace named entity
          const decodedFirstEntry = he.decode(preDecodedFirstEntry);

          // Generate title from first ~10 words
          const titleWords = decodedFirstEntry.split(' ').slice(0, 10).join(' ');
          const title = titleWords ? titleWords.trim() + '...' : 'Transcript';

          // Generate sanitized filename from first ~5 words of first entry
          const filenameWords = preDecodedFirstEntry.split(' ').slice(0, 5).join(' ');
          let baseFilename = filenameWords
              ? filenameWords
                  .trim()
                  .toLowerCase()
                  .replace(/\s+/g, '-')
                  .replace(/[^a-z0-9-]/g, '')
              : `transcript-${Date.now()}`;
          if (!baseFilename || baseFilename === '-') {
              baseFilename = `transcript-${Date.now()}`;
          }
          const finalFilename = `${baseFilename}.md`;

          // Construct final path
          const originalOutputDir = path.dirname(path.resolve(CLINE_CWD, output_path));
          const absoluteOutputPath = path.join(originalOutputDir, finalFilename);
          const outputDir = path.dirname(absoluteOutputPath);

          console.error(`Ensuring directory exists: ${outputDir}`);
          await fs.mkdir(outputDir, { recursive: true });

          console.error(`Saving transcript to: ${absoluteOutputPath}`);

          // Create write stream
          const writeStream = createWriteStream(absoluteOutputPath, { encoding: 'utf-8' });

          // Capture stream errors for proper propagation
          let streamError: Error | null = null;

          // Error handling: cleanup partial file on stream errors
          writeStream.on('error', async (err: Error) => {
            streamError = err;
            console.error('Stream write error:', err);

            // Cleanup partial file
            try {
              await fs.unlink(absoluteOutputPath);
              console.error(`Cleaned up partial file: ${absoluteOutputPath}`);
            } catch (unlinkErr) {
              console.error('Failed to cleanup partial file:', unlinkErr);
            }
          });

          // Write markdown header
          writeStream.write(`# ${title}\n\n`);

          // Process and write transcript in chunks
          for (let i = 0; i < transcriptEntries.length; i += CHUNK_SIZE) {
            const chunk = transcriptEntries.slice(i, i + CHUNK_SIZE);

            // Decode chunk text (per entry to avoid large string concat)
            const chunkText = chunk
              .map(entry => {
                const preDecoded = entry.text
                  .replace(/&#39;/g, "'")
                  .replace(/'/g, "'");
                return he.decode(preDecoded);
              })
              .join(' ');

            // Write chunk to stream
            writeStream.write(chunkText + ' ');

            // Progress logging every 5000 entries (use PROGRESS_THRESHOLD constant for modulo check)
            if (transcriptEntries.length > PROGRESS_THRESHOLD && i > 0 && i % PROGRESS_THRESHOLD === 0) {
              console.error(`Progress: ${i}/${transcriptEntries.length} entries`);
            }
          }

          // Close stream and wait for completion
          await new Promise<void>((resolve, reject) => {
            writeStream.end(() => {
              if (streamError) {
                reject(new McpError(
                  ErrorCode.InternalError,
                  `Failed to write transcript: ${streamError.message}`
                ));
              } else {
                console.error(`Transcript saved to: ${absoluteOutputPath}`);
                resolve();
              }
            });
            writeStream.on('error', reject);
          });

          // Memory monitoring (gated by DEBUG env var)
          if (process.env.DEBUG?.includes('memory') && memoryBefore) {
            const memoryAfter = process.memoryUsage();
            console.error(`Memory after streaming: ${Math.round(memoryAfter.heapUsed / 1024 / 1024)}MB`);
            console.error(`Peak memory delta: ${Math.round((memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024)}MB`);
          }

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
