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
import { RequestThrottler } from './throttle.js';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import he from 'he';
import os from 'os';

const CLINE_CWD = process.cwd();

/**
 * Validates output path to prevent path traversal attacks
 * @param outputPath - User-provided output path
 * @throws McpError if path validation fails
 */
function validateOutputPath(outputPath: string): void {
  // Reject empty paths
  if (!outputPath || outputPath.trim() === '') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Path validation failed'
    );
  }

  // Check for null bytes and dangerous characters
  if (outputPath.includes('\0')) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Path validation failed'
    );
  }

  // Decode path and check for traversal attempts
  const decodedPath = decodeURIComponent(outputPath);

  // Check for any traversal sequences
  if (decodedPath.includes('../') || decodedPath.includes('..\\')) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Path validation failed'
    );
  }

  // Check for absolute paths (both Unix and Windows)
  if (path.isAbsolute(outputPath) || path.isAbsolute(decodedPath)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Path validation failed'
    );
  }

  // Check for Windows drive letters
  if (/^[A-Za-z]:/.test(outputPath) || /^[A-Za-z]:/.test(decodedPath)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Path validation failed'
    );
  }

  // Resolve path against current working directory
  const resolvedPath = path.resolve(CLINE_CWD, outputPath);

  // Final check: ensure resolved path is within current working directory
  if (!resolvedPath.startsWith(CLINE_CWD)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Path validation failed'
    );
  }
}

// Helper function to validate arguments for the single transcript tool
const isValidGetTranscriptArgs = (
  args: any
): args is { video_url: string; output_path?: string } =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.video_url === 'string' &&
  (args.output_path === undefined || typeof args.output_path === 'string');

/**
 * Arguments for batch_get_transcripts tool
 */
interface BatchGetTranscriptsArgs {
  video_urls: string[];
  output_mode: 'aggregated' | 'individual';
  output_path: string;
}

/**
 * Type guard for batch_get_transcripts arguments
 */
const isValidBatchGetTranscriptsArgs = (
  args: any
): args is BatchGetTranscriptsArgs =>
  typeof args === 'object' &&
  args !== null &&
  Array.isArray(args.video_urls) &&
  args.video_urls.length >= 1 &&
  args.video_urls.length <= 50 &&
  args.video_urls.every((url: any) => typeof url === 'string') &&
  (args.output_mode === 'aggregated' || args.output_mode === 'individual') &&
  typeof args.output_path === 'string';

/**
 * Result of processing a single transcript
 */
interface TranscriptResult {
  success: boolean;
  videoUrl: string;
  filePath?: string;
  title?: string;
  error?: string;
  errorType?: ErrorType;
}

/**
 * Represents a single transcript entry from YouTube
 */
interface TranscriptEntry {
  text: string;       // Raw transcript text (may contain HTML entities)
  duration: number;   // Duration of this entry in seconds
  offset: number;     // Start time offset in seconds
}

/**
 * Categorized error types for transcript processing
 */
type ErrorType = 'TranscriptsDisabled' | 'NotFound' | 'RateLimit' | 'Unknown';

/**
 * Result of batch transcript processing
 */
interface BatchResult {
  results: TranscriptResult[];
  outputPath: string;
  mode: 'aggregated' | 'individual';
  totalVideos: number;
  successfulVideos: number;
  failedVideos: number;
}

class YoutubeMcpServer {
  private throttler = new RequestThrottler();
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'youtube-mcp-server',
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
            'Fetches the transcript for a YouTube video and saves it to standardized location (~/.youtube-transcripts/)',
          inputSchema: {
            type: 'object',
            properties: {
              video_url: {
                type: 'string',
                description: 'The full URL of the YouTube video (supports watch, shorts, youtu.be, embed formats)',
              },
              output_path: {
                type: 'string',
                description:
                  'DEPRECATED - Custom output path (use YOUTUBE_TRANSCRIPT_DIR environment variable to set storage location)',
              },
            },
            required: ['video_url'],
          },
        },
        {
          name: 'batch_get_transcripts',
          description: `Fetches transcripts for multiple YouTube videos with aggregated or individual output modes.

Output Modes:
- aggregated: Combines all transcripts into a single Markdown file with section markers
- individual: Creates separate Markdown files for each video in the specified directory

Features:
- Batch size: 1-50 videos per call
- Automatic throttling: Prevents YouTube rate limiting
- Error isolation: Individual video failures don't halt batch processing
- Detailed summary: Shows success/failure counts with specific error messages

Performance:
- Processing time: ~4 seconds per video (includes throttle delay)
- Example: 10 video batch = ~40 seconds total

Limitations:
- Sequential processing (no parallelization)
- Playlist URLs not supported (extract video URLs manually)`,
          inputSchema: {
            type: 'object',
            properties: {
              video_urls: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of YouTube video URLs to process (1-50 videos)',
                minItems: 1,
                maxItems: 50,
              },
              output_mode: {
                type: 'string',
                enum: ['aggregated', 'individual'],
                description: 'Output mode: "aggregated" (single file) or "individual" (separate files)',
              },
              output_path: {
                type: 'string',
                description: 'File path for aggregated mode, directory path for individual mode',
              },
            },
            required: ['video_urls', 'output_mode', 'output_path'],
          },
        },
      ],
    }));

    // Handler to execute tools
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        if (request.params.name === 'get_transcript_and_save') {
          if (!isValidGetTranscriptArgs(request.params.arguments)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Invalid arguments for get_transcript_and_save. Requires "video_url" (string) and "output_path" (string).'
            );
          }

          let { video_url, output_path } = request.params.arguments;

          try {
            const result = await this.processSingleTranscript(video_url, output_path);

            if (result.success) {
              return {
                content: [{
                  type: 'text',
                  text: `Transcript saved successfully!\n\nFile: ${result.filePath}\nTitle: ${result.title}`,
                }],
              };
            } else {
              return {
                content: [{ type: 'text', text: result.error || 'Failed to process transcript' }],
                isError: true,
              };
            }
          } catch (error: any) {
            console.error('Error during transcript processing:', error);
            return {
              content: [{
                type: 'text',
                text: `Failed to process transcript for ${video_url}. Error: ${error.message}`,
              }],
              isError: true,
            };
          }
        } else if (request.params.name === 'batch_get_transcripts') {
          if (!isValidBatchGetTranscriptsArgs(request.params.arguments)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Invalid arguments for batch_get_transcripts. Required: video_urls (array, 1-50 items), output_mode ("aggregated" or "individual"), output_path (string)'
            );
          }

          const { video_urls, output_mode, output_path } = request.params.arguments;

          try {
            const result = await this.processBatchTranscripts(
              video_urls,
              output_mode,
              output_path
            );

            return this.formatBatchResponse(result);
          } catch (error: any) {
            console.error('Batch processing error:', error);
            return {
              content: [{
                type: 'text',
                text: `Batch processing failed: ${error.message}`,
              }],
              isError: true,
            };
          }
        } else {
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
        }
      }
    );
  }

  /**
   * Converts YouTube Shorts URLs to standard watch URLs
   * @param url - YouTube video URL
   * @returns Normalized URL
   */
  private normalizeYoutubeUrl(url: string): string {
    const shortsRegex = /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/;
    const match = url.match(shortsRegex);

    if (match && match[1]) {
      const videoId = match[1];
      const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.error(`Detected Shorts URL. Converting to: ${standardUrl}`);
      return standardUrl;
    }

    return url;
  }

  /**
   * Extracts video ID from YouTube URL
   * @param url - YouTube video URL
   * @returns Video ID or null if not found
   */
  private extractVideoId(url: string): string | null {
    // Standard URL: youtube.com/watch?v=VIDEO_ID
    const standardMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (standardMatch && standardMatch[1]) {
      return standardMatch[1];
    }

    // Shorts URL: youtube.com/shorts/VIDEO_ID
    const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch && shortsMatch[1]) {
      return shortsMatch[1];
    }

    // Short URL: youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch && shortMatch[1]) {
      return shortMatch[1];
    }

    // Embed URL: youtube.com/embed/VIDEO_ID
    const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]+)/);
    if (embedMatch && embedMatch[1]) {
      return embedMatch[1];
    }

    return null;
  }

  /**
   * Gets the directory for storing transcripts
   * Priority: YOUTUBE_TRANSCRIPT_DIR env var > default ~/.youtube-transcripts
   */
  private getTranscriptDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
    const defaultDir = path.join(homeDir, '.youtube-transcripts');
    return process.env.YOUTUBE_TRANSCRIPT_DIR || defaultDir;
  }

  /**
   * Generates human-readable title and sanitized filename from transcript
   * @param transcriptEntries - Array of transcript entries
   * @returns Object with title (first 10 words) and filename (first 5 words, sanitized)
   */
  private generateTitleAndFilename(
    transcriptEntries: TranscriptEntry[]
  ): { title: string; filename: string } {
    const firstEntryText = transcriptEntries[0]?.text || '';

    // Decode HTML entities
    const preDecoded = firstEntryText
      .replace(/&#39;/g, "'")
      .replace(/'/g, "'");
    const decodedFirstEntry = he.decode(preDecoded);

    // Generate title (first 10 words)
    const titleWords = decodedFirstEntry.split(' ').slice(0, 10).join(' ');
    const title = titleWords ? titleWords.trim() + '...' : 'Transcript';

    // Generate filename (first 5 words, sanitized)
    const filenameWords = preDecoded.split(' ').slice(0, 5).join(' ');
    let baseFilename = filenameWords
      ? filenameWords
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
      : `transcript-${Date.now()}`;

    // Fallback for empty/invalid filenames
    if (!baseFilename || baseFilename === '-') {
      baseFilename = `transcript-${Date.now()}`;
    }

    const filename = `${baseFilename}.md`;

    return { title, filename };
  }

  /**
   * Constructs absolute output path from relative path and filename
   * @param outputPath - Relative output path (file or directory)
   * @param filename - Generated filename
   * @returns Absolute file path
   */
  private constructOutputPath(outputPath: string, filename: string): string {
    const originalOutputDir = path.dirname(path.resolve(CLINE_CWD, outputPath));
    const absoluteOutputPath = path.join(originalOutputDir, filename);
    return absoluteOutputPath;
  }

  /**
   * Streams transcript to file with chunked processing (memory optimization)
   * @param transcriptEntries - Array of transcript entries
   * @param absolutePath - Absolute file path
   * @param title - Video title for file header
   * @throws {McpError} ENOSPC error if disk full during write
   * @note Partial files are cleaned up on write failure
   */
  private async streamTranscriptToFile(
    transcriptEntries: TranscriptEntry[],
    absolutePath: string,
    title: string
  ): Promise<void> {
    const CHUNK_SIZE = 1000;
    const outputDir = path.dirname(absolutePath);

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // Create write stream
    const writeStream = createWriteStream(absolutePath, { encoding: 'utf-8' });
    let streamError: Error | null = null;

    // Error handling: cleanup partial file
    writeStream.on('error', async (err: Error) => {
      streamError = err;
      try {
        await fs.unlink(absolutePath);
      } catch (unlinkError) {
        console.error('Failed to cleanup partial file:', unlinkError);
      }
    });

    // Write header
    writeStream.write(`# ${title}\n\n`);

    // Write chunks (1000 entries per batch)
    for (let i = 0; i < transcriptEntries.length; i += CHUNK_SIZE) {
      const chunk = transcriptEntries.slice(i, i + CHUNK_SIZE);
      const chunkText = chunk
        .map(entry => {
          const preDecoded = entry.text
            .replace(/&#39;/g, "'")
            .replace(/'/g, "'");
          return he.decode(preDecoded);
        })
        .join(' ');

      writeStream.write(chunkText + ' ');

      // Progress logging for large transcripts
      if (transcriptEntries.length > 5000 && i > 0 && i % 5000 === 0) {
        console.error(`Progress: ${i}/${transcriptEntries.length} entries processed`);
      }
    }

    // Close stream and await completion
    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => {
        if (streamError) {
          reject(new McpError(
            ErrorCode.InternalError,
            `Failed to write transcript: ${streamError.message}`
          ));
        } else {
          resolve();
        }
      });
      writeStream.on('error', reject);
    });
  }

  /**
   * Categorizes errors into specific types for actionable user feedback
   * @param error - Caught error object
   * @param videoUrl - Video URL for error message
   * @returns Object with error message and type
   */
  private categorizeError(
    error: any,
    videoUrl: string
  ): { message: string; type: ErrorType } {
    const errorMessage = error.message?.toLowerCase() || '';

    if (errorMessage.includes('transcriptsdisabled')) {
      return {
        message: `Transcripts are disabled for the video: ${videoUrl}`,
        type: 'TranscriptsDisabled',
      };
    } else if (errorMessage.includes('could not find transcript')) {
      return {
        message: `Could not find a transcript for the video: ${videoUrl}`,
        type: 'NotFound',
      };
    } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return {
        message: `Rate limit exceeded for ${videoUrl}`,
        type: 'RateLimit',
      };
    } else {
      return {
        message: `Failed to process transcript for ${videoUrl}. Error: ${error.message || error}`,
        type: 'Unknown',
      };
    }
  }

  /**
   * Processes a single YouTube transcript with streaming optimization
   * @param videoUrl - YouTube video URL (standard or Shorts format)
   * @param outputPath - Relative path for transcript file
   * @returns TranscriptResult with success status, file path, and optional error
   */
  private async processSingleTranscript(
    videoUrl: string,
    outputPath?: string
  ): Promise<TranscriptResult> {
    try {
      // 1. Normalize URL (Shorts → standard)
      const normalizedUrl = this.normalizeYoutubeUrl(videoUrl);

      // 2. Fetch transcript (with throttling)
      console.error(`Fetching transcript for: ${normalizedUrl}`);
      const transcriptEntries = await this.throttler.throttle(
        () => YoutubeTranscript.fetchTranscript(normalizedUrl)
      );

      // 3. Validate transcript exists
      if (!transcriptEntries || transcriptEntries.length === 0) {
        return {
          success: false,
          videoUrl,
          error: 'No transcript found or available for this video',
          errorType: 'NotFound',
        };
      }

      // 4-5. Generate path and filename (conditional: old vs new behavior)
      let absolutePath: string;
      let title: string;

      if (outputPath) {
        // ═══════════════════════════════════════════════════════════
        // OLD BEHAVIOR (Backward Compatibility)
        // ═══════════════════════════════════════════════════════════
        console.warn(
          'Warning: The output_path parameter is deprecated and will be removed in v2.0.0. ' +
          'Use the YOUTUBE_TRANSCRIPT_DIR environment variable to set a custom storage location.'
        );

        // Generate title and content-based filename
        const filenameResult = this.generateTitleAndFilename(transcriptEntries);
        title = filenameResult.title;

        // Use provided output path (old behavior)
        validateOutputPath(outputPath);
        absolutePath = this.constructOutputPath(outputPath, filenameResult.filename);
        const outputDir = path.dirname(absolutePath);
        await fs.mkdir(outputDir, { recursive: true });

      } else {
        // ═══════════════════════════════════════════════════════════
        // NEW BEHAVIOR (Standardized Storage)
        // ═══════════════════════════════════════════════════════════

        // Extract video ID from URL
        const videoId = this.extractVideoId(videoUrl);
        if (!videoId) {
          throw new Error(
            `Cannot extract video ID from URL: ${videoUrl}\n` +
            'Supported formats:\n' +
            '  - youtube.com/watch?v=VIDEO_ID\n' +
            '  - youtu.be/VIDEO_ID\n' +
            '  - youtube.com/shorts/VIDEO_ID\n' +
            '  - youtube.com/embed/VIDEO_ID'
          );
        }

        // Validate video ID length (YouTube IDs are always 11 characters)
        if (videoId.length !== 11) {
          throw new Error(
            `Invalid video ID extracted: ${videoId} (expected 11 characters, got ${videoId.length})`
          );
        }

        // Generate Unix timestamp (seconds, not milliseconds)
        const timestamp = Math.floor(Date.now() / 1000);

        // Create standardized filename: {video_id}_{timestamp}.txt
        const filename = `${videoId}_${timestamp}.txt`;

        // Get transcript directory (env var or default)
        const transcriptDir = this.getTranscriptDir();

        // Ensure directory exists
        await fs.mkdir(transcriptDir, { recursive: true });

        // Construct absolute path
        absolutePath = path.join(transcriptDir, filename);

        // Extract title from transcript for content (header line)
        const filenameResult = this.generateTitleAndFilename(transcriptEntries);
        title = filenameResult.title;
      }

      // 6. Stream transcript to file
      await this.streamTranscriptToFile(transcriptEntries, absolutePath, title);

      console.error(`Transcript saved to: ${absolutePath}`);

      return {
        success: true,
        videoUrl,
        filePath: path.relative(CLINE_CWD, absolutePath),
        title,
      };
    } catch (error: any) {
      const { message, type } = this.categorizeError(error, videoUrl);
      return {
        success: false,
        videoUrl,
        error: message,
        errorType: type,
      };
    }
  }

  /**
   * Processes batch transcripts in individual mode
   * @param videoUrls - Array of YouTube video URLs
   * @param outputPath - Directory path for individual files
   * @returns BatchResult with processing summary
   */
  private async processIndividualMode(
    videoUrls: string[],
    outputPath: string
  ): Promise<BatchResult> {
    const results: TranscriptResult[] = [];

    // Validate directory path
    validateOutputPath(outputPath);
    const outputDir = path.resolve(CLINE_CWD, outputPath);

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // Process each video sequentially
    for (let i = 0; i < videoUrls.length; i++) {
      const url = videoUrls[i];

      // Extract video ID for unique filename
      const videoId = this.extractVideoId(url);
      const filename = `transcript-${videoId || Date.now()}-${i}.md`;
      const filePath = path.join(outputPath, filename);

      console.error(`[Batch Progress] Processing video ${i + 1}/${videoUrls.length}: ${url}`);

      try {
        const result = await this.processSingleTranscript(url, filePath);
        results.push(result);

        console.error(
          `[Batch Progress] Video ${i + 1}/${videoUrls.length}: ${result.success ? 'SUCCESS' : 'FAILED'}`
        );
      } catch (error: any) {
        // Capture error but continue processing
        results.push({
          success: false,
          videoUrl: url,
          error: error.message || 'Unknown error',
          errorType: 'Unknown',
        });

        console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: FAILED`);
      }
    }

    return {
      results,
      outputPath,
      mode: 'individual',
      totalVideos: videoUrls.length,
      successfulVideos: results.filter(r => r.success).length,
      failedVideos: results.filter(r => !r.success).length,
    };
  }

  /**
   * Processes batch transcripts in aggregated mode
   * @param videoUrls - Array of YouTube video URLs
   * @param outputPath - File path for aggregated output
   * @returns BatchResult with processing summary
   */
  private async processAggregatedMode(
    videoUrls: string[],
    outputPath: string
  ): Promise<BatchResult> {
    const results: TranscriptResult[] = [];

    // Validate file path
    validateOutputPath(outputPath);
    const absolutePath = path.resolve(CLINE_CWD, outputPath);
    const outputDir = path.dirname(absolutePath);

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // Create write stream
    const writeStream = createWriteStream(absolutePath, { encoding: 'utf-8' });

    // Write header
    const timestamp = new Date().toISOString();
    writeStream.write(`# Batch Transcript: ${videoUrls.length} videos\n`);
    writeStream.write(`**Created:** ${timestamp}\n`);
    writeStream.write(`**Mode:** Aggregated\n\n`);

    // Process each video sequentially
    for (let i = 0; i < videoUrls.length; i++) {
      const url = videoUrls[i];

      console.error(`[Batch Progress] Processing video ${i + 1}/${videoUrls.length}: ${url}`);

      // Write section separator
      if (i > 0) {
        writeStream.write(`\n---\n\n`);
      }

      try {
        // Normalize URL
        const normalizedUrl = this.normalizeYoutubeUrl(url);

        // Fetch transcript (with throttling)
        const transcriptEntries = await this.throttler.throttle(
          () => YoutubeTranscript.fetchTranscript(normalizedUrl)
        );

        if (!transcriptEntries || transcriptEntries.length === 0) {
          // Write failure section
          writeStream.write(`## Video ${i + 1}: No transcript available\n`);
          writeStream.write(`**Source:** ${url}\n`);
          writeStream.write(`**Status:** Failed\n`);
          writeStream.write(`**Error:** No transcript found or available\n\n`);

          results.push({
            success: false,
            videoUrl: url,
            error: 'No transcript found or available',
            errorType: 'NotFound',
          });

          console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: FAILED`);
          continue;
        }

        // Generate title
        const { title } = this.generateTitleAndFilename(transcriptEntries);

        // Write success section header
        writeStream.write(`## Video ${i + 1}: ${title}\n`);
        writeStream.write(`**Source:** ${url}\n`);
        writeStream.write(`**Status:** Success\n\n`);

        // Write transcript content (chunked)
        const CHUNK_SIZE = 1000;
        for (let j = 0; j < transcriptEntries.length; j += CHUNK_SIZE) {
          const chunk = transcriptEntries.slice(j, j + CHUNK_SIZE);
          const chunkText = chunk
            .map(entry => {
              const preDecoded = entry.text
                .replace(/&#39;/g, "'")
                .replace(/'/g, "'");
              return he.decode(preDecoded);
            })
            .join(' ');

          writeStream.write(chunkText + ' ');
        }

        writeStream.write(`\n`);

        results.push({
          success: true,
          videoUrl: url,
          filePath: path.relative(CLINE_CWD, absolutePath),
          title,
        });

        console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: SUCCESS`);
      } catch (error: any) {
        // Write failure section
        const { message, type } = this.categorizeError(error, url);

        writeStream.write(`## Video ${i + 1}: Processing failed\n`);
        writeStream.write(`**Source:** ${url}\n`);
        writeStream.write(`**Status:** Failed\n`);
        writeStream.write(`**Error:** ${message}\n\n`);

        results.push({
          success: false,
          videoUrl: url,
          error: message,
          errorType: type,
        });

        console.error(`[Batch Progress] Video ${i + 1}/${videoUrls.length}: FAILED`);
      }
    }

    // Close stream
    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    console.error(`Aggregated batch transcript saved to: ${absolutePath}`);

    return {
      results,
      outputPath,
      mode: 'aggregated',
      totalVideos: videoUrls.length,
      successfulVideos: results.filter(r => r.success).length,
      failedVideos: results.filter(r => !r.success).length,
    };
  }

  /**
   * Processes multiple YouTube transcripts in batch
   * @param videoUrls - Array of YouTube video URLs (1-50)
   * @param outputMode - Output mode: aggregated or individual
   * @param outputPath - File path (aggregated) or directory path (individual)
   * @returns BatchResult with processing summary
   */
  private async processBatchTranscripts(
    videoUrls: string[],
    outputMode: 'aggregated' | 'individual',
    outputPath: string
  ): Promise<BatchResult> {
    // Simple router - delegates to mode-specific handlers
    if (outputMode === 'individual') {
      return this.processIndividualMode(videoUrls, outputPath);
    } else {
      return this.processAggregatedMode(videoUrls, outputPath);
    }
  }

  /**
   * Formats batch processing result as MCP response
   * @param result - BatchResult from processing
   * @returns MCP response object
   */
  private formatBatchResponse(result: BatchResult): object {
    const successList = result.results
      .filter(r => r.success)
      .map(r => `✓ ${r.filePath}`)
      .join('\n');

    const failureList = result.results
      .filter(r => !r.success)
      .map(r => `✗ ${r.videoUrl}: ${r.error}`)
      .join('\n');

    let responseText = `Batch processing complete:\n`;
    responseText += `- Total: ${result.totalVideos} videos\n`;
    responseText += `- Successful: ${result.successfulVideos} transcripts\n`;
    responseText += `- Failed: ${result.failedVideos} transcripts\n\n`;

    if (result.successfulVideos > 0) {
      responseText += `Successful transcripts:\n${successList}\n\n`;
    }

    if (result.failedVideos > 0) {
      responseText += `Failed transcripts:\n${failureList}\n\n`;
    }

    responseText += `Output: ${result.outputPath} (${result.mode} mode)`;

    return {
      content: [{ type: 'text', text: responseText }],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('YouTube MCP server running on stdio');
  }
}

// Export the class for testing
export { YoutubeMcpServer };

const server = new YoutubeMcpServer();
server.run().catch(console.error);
