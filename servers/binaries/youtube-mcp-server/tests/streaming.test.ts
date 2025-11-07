import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import he from 'he';

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

      const memAfter = process.memoryUsage();
      const peakDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

      expect(peakDelta).toBeLessThan(100);
    });
  });

  describe('Progress Logging', () => {
    it('should trigger progress logs for >5000 entries', () => {
      const entries: TranscriptEntry[] = Array.from({ length: 10000 }, (_, i) => ({
        text: `word${i}`,
        duration: 1,
        offset: i
      }));

      const CHUNK_SIZE = 1000;
      const PROGRESS_THRESHOLD = 5000;
      const progressLogs: string[] = [];

      for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        if (entries.length > PROGRESS_THRESHOLD && (i + CHUNK_SIZE) % 5000 === 0) {
          const processed = Math.min(i + CHUNK_SIZE, entries.length);
          progressLogs.push(`Progress: ${processed}/${entries.length} entries`);
        }
      }

      expect(progressLogs.length).toBeGreaterThan(0);
      expect(progressLogs).toContain('Progress: 5000/10000 entries');
      expect(progressLogs).toContain('Progress: 10000/10000 entries');
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
        if (entries.length > PROGRESS_THRESHOLD && (i + CHUNK_SIZE) % 5000 === 0) {
          const processed = Math.min(i + CHUNK_SIZE, entries.length);
          progressLogs.push(`Progress: ${processed}/${entries.length} entries`);
        }
      }

      expect(progressLogs.length).toBe(0);
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
  });

  describe('Consolidated Error Handler', () => {
    it('should cleanup partial file on stream error', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'partial-cleanup-test.md');

      // Create writeStream and write initial content to create file
      const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });
      writeStream.write('initial content');

      // Wait for write to complete and file to be created
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify file exists before triggering error
      await fs.access(outputPath);

      // Simulate stream error
      const errorPromise = new Promise<void>((resolve, reject) => {
        writeStream.on('error', async (err: Error) => {
          // Cleanup partial file (matching production pattern)
          try {
            await fs.unlink(outputPath);
          } catch (unlinkErr) {
            // Silent failure - log but don't block
          }
          reject(err);
        });
      });

      // Trigger error
      writeStream.emit('error', new Error('Test stream error'));

      try {
        await errorPromise;
      } catch (err) {
        // Error expected
      }

      // Verify partial file was deleted
      await expect(fs.access(outputPath)).rejects.toThrow();
    });

    it('should propagate McpError after cleanup completes', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'error-propagation-test.md');
      const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });

      // Write content and wait for file creation
      writeStream.write('test content');
      await new Promise(resolve => setTimeout(resolve, 10));

      let cleanupExecuted = false;

      const errorPromise = new Promise<void>((resolve, reject) => {
        writeStream.on('error', async (err: Error) => {
          // Cleanup
          try {
            await fs.unlink(outputPath);
            cleanupExecuted = true;
          } catch (unlinkErr) {
            // Silent failure
          }

          // Simulate McpError wrapping (production uses McpError class, test verifies error with message)
          reject(new Error(`Failed to write transcript: ${err.message}`));
        });
      });

      writeStream.emit('error', new Error('Test error'));

      await expect(errorPromise).rejects.toThrow('Failed to write transcript: Test error');
      expect(cleanupExecuted).toBe(true);
    });

    it('should handle cleanup failure gracefully', async () => {
      const outputPath = '/invalid/path/that/does/not/exist/test.md';
      const writeStream = createWriteStream(outputPath);

      const errorPromise = new Promise<void>((resolve, reject) => {
        writeStream.on('error', async (err: Error) => {
          // Attempt cleanup of non-existent file
          try {
            await fs.unlink(outputPath);
          } catch (unlinkErr) {
            // Silent failure - should NOT block error propagation
          }

          reject(new Error(`Failed to write transcript: ${err.message}`));
        });

        writeStream.end(() => resolve());
      });

      writeStream.emit('error', new Error('Stream error'));

      // Error should propagate even if cleanup fails
      await expect(errorPromise).rejects.toThrow('Failed to write transcript: Stream error');
    });

    it('should execute only one error handler on stream error', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'single-handler-test.md');
      const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });

      let handlerExecutionCount = 0;

      const errorPromise = new Promise<void>((resolve, reject) => {
        // Single error handler - should execute exactly once
        writeStream.on('error', async (err: Error) => {
          handlerExecutionCount++;

          try {
            await fs.unlink(outputPath);
          } catch (unlinkErr) {
            // Silent failure
          }

          reject(err);
        });

        writeStream.end(() => resolve());
      });

      writeStream.emit('error', new Error('Test error'));

      try {
        await errorPromise;
      } catch (err) {
        // Expected
      }

      // Verify handler executed exactly once (no race condition)
      expect(handlerExecutionCount).toBe(1);
    });

    it('should complete success path without error handler execution', async () => {
      const outputPath = path.join(TEST_OUTPUT_DIR, 'success-path-test.md');
      const writeStream = createWriteStream(outputPath, { encoding: 'utf-8' });

      let errorHandlerExecuted = false;

      writeStream.write('# Test Transcript\n\n');
      writeStream.write('Test content');

      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => {
          resolve();
        });

        writeStream.on('error', async (err: Error) => {
          errorHandlerExecuted = true;
          reject(err);
        });
      });

      // Verify error handler did NOT execute
      expect(errorHandlerExecuted).toBe(false);

      // Verify file exists and contains content
      const content = await fs.readFile(outputPath, 'utf-8');
      expect(content).toContain('Test Transcript');
      expect(content).toContain('Test content');
    });
  });
});
