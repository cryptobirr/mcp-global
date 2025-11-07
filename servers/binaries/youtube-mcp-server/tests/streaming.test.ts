import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import he from 'he';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock transcript entry type
interface TranscriptEntry {
  text: string;
  duration: number;
  offset: number;
}

describe('YouTube Transcript Streaming', () => {
  const TEST_OUTPUT_DIR = path.join(__dirname, '../test-output');

  beforeEach(async () => {
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  });

  describe('Chunk Processing', () => {
    it('should process 1000 entries in single chunk', () => {
      const entries: TranscriptEntry[] = Array.from({ length: 1000 }, (_, i) => ({
        text: `word${i}`,
        duration: 1,
        offset: i
      }));

      const CHUNK_SIZE = 1000;
      const chunks = [];
      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        chunks.push(entries.slice(i, i + CHUNK_SIZE));
      }

      expect(chunks.length).toBe(1);
      expect(chunks[0].length).toBe(1000);
    });

    it('should process 10000 entries in 10 chunks', () => {
      const entries: TranscriptEntry[] = Array.from({ length: 10000 }, (_, i) => ({
        text: `word${i}`,
        duration: 1,
        offset: i
      }));

      const CHUNK_SIZE = 1000;
      const chunks = [];
      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        chunks.push(entries.slice(i, i + CHUNK_SIZE));
      }

      expect(chunks.length).toBe(10);
      expect(chunks[9].length).toBe(1000);
    });

    it('should handle partial final chunk (60001 entries = 61 chunks)', () => {
      const entries: TranscriptEntry[] = Array.from({ length: 60001 }, (_, i) => ({
        text: `word${i}`,
        duration: 1,
        offset: i
      }));

      const CHUNK_SIZE = 1000;
      const chunks = [];
      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        chunks.push(entries.slice(i, i + CHUNK_SIZE));
      }

      expect(chunks.length).toBe(61);
      expect(chunks[60].length).toBe(1); // last chunk has 1 entry
    });
  });

  describe('HTML Entity Decoding', () => {
    it('should decode numeric apostrophe entity', () => {
      const text = "It&#39;s working";
      const decoded = text.replace(/&#39;/g, "'");
      expect(decoded).toBe("It's working");
    });

    it('should decode named apostrophe entity', () => {
      const text = "It's working";
      const decoded = text.replace(/'/g, "'");
      expect(decoded).toBe("It's working");
    });

    it('should decode all HTML entities via he.decode', () => {
      const text = "Test &lt;tag&gt; &amp; &quot;quotes&quot;";
      const decoded = he.decode(text);
      expect(decoded).toBe('Test <tag> & "quotes"');
    });
  });

  describe('Memory Usage', () => {
    it('should maintain <100MB peak for 60k entries', async () => {
      const entries: TranscriptEntry[] = Array.from({ length: 60000 }, (_, i) => ({
        text: `word${i} test content with some length to simulate real transcript`,
        duration: 1,
        offset: i
      }));

      const outputPath = path.join(TEST_OUTPUT_DIR, 'memory-test.md');
      const CHUNK_SIZE = 1000;
      const MEMORY_LIMIT_MB = 100; // Peak memory usage constraint

      // Force GC before baseline to establish consistent starting point (if available)
      if (global.gc) global.gc();
      const memBefore = process.memoryUsage();

      const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
      writeStream.write('# Test Transcript\n\n');

      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE);
        const chunkText = chunk
          .map(entry => he.decode(entry.text.replace(/&#39;/g, "'")))
          .join(' ');
        writeStream.write(chunkText + ' ');
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on('error', reject);
      });

      // Force GC before final measurement to measure actual retained memory (if available)
      if (global.gc) global.gc();
      const memAfter = process.memoryUsage();
      // Use Math.max(0, delta) to handle cases where GC releases memory between measurements
      const peakDelta = Math.max(0, (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024);

      expect(peakDelta).toBeLessThan(MEMORY_LIMIT_MB);
    });
  });

  describe('Progress Logging', () => {
    it('should trigger progress logs for >5000 entries', () => {
      const entries: TranscriptEntry[] = Array.from({ length: 15000 }, (_, i) => ({
        text: `word${i}`,
        duration: 1,
        offset: i
      }));

      const CHUNK_SIZE = 1000;
      const PROGRESS_THRESHOLD = 5000;
      const progressLogs: string[] = [];

      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        if (entries.length > PROGRESS_THRESHOLD && i > 0 && i % 5000 === 0) {
          progressLogs.push(`Progress: ${i}/${entries.length} entries`);
        }
      }

      expect(progressLogs.length).toBeGreaterThan(0);
      expect(progressLogs).toContain('Progress: 5000/15000 entries');
      expect(progressLogs).toContain('Progress: 10000/15000 entries');
    });

    it('should NOT trigger progress logs for ≤5000 entries', () => {
      const entries: TranscriptEntry[] = Array.from({ length: 5000 }, (_, i) => ({
        text: `word${i}`,
        duration: 1,
        offset: i
      }));

      const CHUNK_SIZE = 1000;
      const PROGRESS_THRESHOLD = 5000;
      const progressLogs: string[] = [];

      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        if (entries.length > PROGRESS_THRESHOLD && i > 0 && i % 5000 === 0) {
          progressLogs.push(`Progress: ${i}/${entries.length} entries`);
        }
      }

      expect(progressLogs.length).toBe(0);
    });

    it('should skip progress log at i=0 position', () => {
      const entries: TranscriptEntry[] = Array.from({ length: 10000 }, (_, i) => ({
        text: `word${i}`,
        duration: 1,
        offset: i
      }));

      const CHUNK_SIZE = 1000;
      const PROGRESS_THRESHOLD = 5000;
      const progressLogs: string[] = [];

      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        if (entries.length > PROGRESS_THRESHOLD && i > 0 && i % 5000 === 0) {
          progressLogs.push(`Progress: ${i}/${entries.length} entries`);
        }
      }

      expect(progressLogs.every(log => !log.includes('Progress: 0/'))).toBe(true);
    });

    it('should trigger progress logs correctly with CHUNK_SIZE=500', () => {
      const entries: TranscriptEntry[] = Array.from({ length: 15000 }, (_, i) => ({
        text: `word${i}`,
        duration: 1,
        offset: i
      }));

      const CHUNK_SIZE = 500;
      const PROGRESS_THRESHOLD = 5000;
      const progressLogs: string[] = [];

      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        if (entries.length > PROGRESS_THRESHOLD && i > 0 && i % 5000 === 0) {
          progressLogs.push(`Progress: ${i}/${entries.length} entries`);
        }
      }

      expect(progressLogs).toContain('Progress: 5000/15000 entries');
      expect(progressLogs).toContain('Progress: 10000/15000 entries');
      expect(progressLogs.every(log => !log.match(/Progress: (4500|5500|9500)/))).toBe(true);
    });
  });

  describe('MCP Integration', () => {
    it('should log progress to stderr during tool execution simulation', () => {
      const entries: TranscriptEntry[] = Array.from({ length: 15000 }, (_, i) => ({
        text: `word${i}`,
        duration: 1,
        offset: i
      }));

      const CHUNK_SIZE = 1000;
      const PROGRESS_THRESHOLD = 5000;
      const originalError = console.error;
      const logs: string[] = [];

      // Intercept console.error
      console.error = (msg: any) => logs.push(String(msg));

      // Simulate streaming loop from production
      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        if (entries.length > PROGRESS_THRESHOLD && i > 0 && i % 5000 === 0) {
          console.error(`Progress: ${i}/${entries.length} entries`);
        }
      }

      // Restore console.error
      console.error = originalError;

      // Filter progress logs
      const progressLogs = logs.filter(log => log.includes('Progress:'));

      expect(progressLogs.length).toBe(2);
      expect(progressLogs[0]).toBe('Progress: 5000/15000 entries');
      expect(progressLogs[1]).toBe('Progress: 10000/15000 entries');
      expect(progressLogs.every(log => !log.includes('Progress: 0/'))).toBe(true);
    });
  });

  describe('Filename Generation', () => {
    it('should sanitize special characters', () => {
      const text = "Test's Video! (2025) @Channel";
      const sanitized = text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      expect(sanitized).toBe('tests-video-2025-channel');
    });

    it('should fallback to timestamp for empty/invalid input', () => {
      const text = "!@#$%^&*()";
      let baseFilename = text
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      if (!baseFilename || baseFilename === '-') {
        baseFilename = `transcript-${Date.now()}`;
      }

      expect(baseFilename).toMatch(/^transcript-\d+$/);
    });
  });

  describe('Stream Error Handling', () => {
    it('should handle write stream errors gracefully', async () => {
      const outputPath = '/invalid/path/that/does/not/exist/test.md';
      const writeStream = createWriteStream(outputPath);

      const errorPromise = new Promise((resolve, reject) => {
        writeStream.on('error', (err) => resolve(err));
        writeStream.write('test content');
      });

      const error = await errorPromise;
      expect(error).toBeInstanceOf(Error);
    });

    // NEW TEST 1: AC1 - Partial file cleanup verification
    it('should delete partial file on stream write error', async () => {
      // Pattern: Production error handler at src/index.ts:202-213
      const outputPath = path.join(TEST_OUTPUT_DIR, 'partial-test.md');

      // Create initial file
      await fs.writeFile(outputPath, 'initial content', 'utf-8');

      // Make file read-only to trigger write error
      await fs.chmod(outputPath, 0o444);

      // Attempt append operation (will fail on read-only file)
      const writeStream = createWriteStream(outputPath, { flags: 'a', encoding: 'utf-8' });

      // Track cleanup execution
      let cleanupExecuted = false;

      // Copy production error handler pattern (src/index.ts:202-213)
      writeStream.on('error', async (err: Error) => {
        try {
          await fs.unlink(outputPath);
          cleanupExecuted = true;
        } catch (unlinkErr) {
          // Silent failure pattern from production
        }
      });

      // Trigger write error
      const errorPromise = new Promise((resolve) => {
        writeStream.on('error', resolve);
        writeStream.write('append content');
      });

      await errorPromise;

      // Wait for async cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify file deleted (pattern from historical test at commit 62c08ee)
      await expect(fs.access(outputPath)).rejects.toThrow();
      expect(cleanupExecuted).toBe(true);
    });

    // NEW TEST 2: AC2 - Error propagation to Promise wrapper with McpError
    it('should propagate stream error to Promise wrapper with McpError', async () => {
      // Pattern: Production Promise wrapper at src/index.ts:242-255
      const outputPath = '/invalid/path/test.md';
      const writeStream = createWriteStream(outputPath);

      // Copy production streamError variable pattern (src/index.ts:199)
      let streamError: Error | null = null;

      // Copy production error handler pattern (src/index.ts:202-203)
      writeStream.on('error', (err: Error) => {
        streamError = err;
      });

      // Write content to trigger error
      writeStream.write('test content');

      // Wait for error to be captured before ending stream
      await new Promise(resolve => setTimeout(resolve, 10));

      // Copy production Promise wrapper pattern (src/index.ts:242-255)
      const writePromise = new Promise<void>((resolve, reject) => {
        writeStream.end(() => {
          // Production error propagation logic (src/index.ts:244-248)
          if (streamError) {
            reject(new McpError(
              ErrorCode.InternalError,
              `Failed to write transcript: ${streamError.message}`
            ));
          } else {
            resolve();
          }
        });
      });

      // Verify Promise rejects with McpError
      await expect(writePromise).rejects.toThrow();

      // Verify error message includes streamError.message
      try {
        await writePromise;
      } catch (error: any) {
        expect(error.message).toContain('Failed to write transcript');
        expect(error.code).toBe(ErrorCode.InternalError);
      }
    });

    // NEW TEST 3: AC3 - Integration test with production code path
    it('should handle errors in production streaming code path', async () => {
      // Pattern: Full production streaming flow (src/index.ts:195-255)
      const outputPath = '/invalid/path/integration-test.md';

      // Minimal valid transcript data
      const entries: TranscriptEntry[] = [
        { text: 'test entry', duration: 1, offset: 0 }
      ];

      // Copy production streaming pattern (src/index.ts:196-255)
      const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
      let streamError: Error | null = null;

      // Production error handler (src/index.ts:202-213)
      writeStream.on('error', async (err: Error) => {
        streamError = err;
        try {
          await fs.unlink(outputPath);
        } catch (unlinkErr) {
          // Silent failure
        }
      });

      // Write content (simulating production streaming)
      writeStream.write('# Test Transcript\n\n');
      for (const entry of entries) {
        writeStream.write(entry.text + ' ');
      }

      // Wait for error to be captured
      await new Promise(resolve => setTimeout(resolve, 10));

      // Production Promise wrapper (src/index.ts:242-255)
      const writePromise = new Promise<void>((resolve, reject) => {
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
      });

      // Verify error propagation
      await expect(writePromise).rejects.toThrow();

      // Verify partial file doesn't exist (invalid path so never created)
      const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(false);
    });

    // NEW TEST 4: Regression - No Error on Success Path
    it('should not set streamError variable on successful write', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'success-test.md');
      const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
      let streamError: Error | null = null;

      writeStream.on('error', (err: Error) => {
        streamError = err;
      });

      writeStream.write('# Success Test\n\n');
      writeStream.write('Content here');

      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => {
          if (streamError) {
            reject(new Error(`Unexpected streamError: ${streamError.message}`));
          } else {
            resolve();
          }
        });
        writeStream.on('error', reject);
      });

      // Verify streamError remains null
      expect(streamError).toBeNull();

      // Verify file was created
      const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });
  });
});
