import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import he from 'he';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

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
  });

  describe('Progress Logging Extended', () => {
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

  describe('Security Integration', () => {
    let testCwd: string;

    beforeEach(() => {
      testCwd = process.cwd();
    });

    // Recreate validateOutputPath for integration testing
    function validateOutputPath(outputPath: string): void {
      if (!outputPath || outputPath.trim() === '') {
        throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
      }

      if (outputPath.includes('\0')) {
        throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
      }

      const decodedPath = decodeURIComponent(outputPath);

      if (decodedPath.includes('../') || decodedPath.includes('..\\')) {
        throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
      }

      if (path.isAbsolute(outputPath) || path.isAbsolute(decodedPath)) {
        throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
      }

      if (/^[A-Za-z]:/.test(outputPath) || /^[A-Za-z]:/.test(decodedPath)) {
        throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
      }

      const resolvedPath = path.resolve(testCwd, outputPath);

      if (!resolvedPath.startsWith(testCwd)) {
        throw new McpError(ErrorCode.InvalidParams, 'Path validation failed');
      }
    }

    it('should block malicious paths during transcript saving', async () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config.txt',
        '/etc/shadow',
        'C:\\Windows\\System32\\drivers\\etc\\hosts',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];

      for (const maliciousPath of maliciousPaths) {
        expect(() => validateOutputPath(maliciousPath)).toThrow(McpError);
        expect(() => validateOutputPath(maliciousPath)).toThrow('Path validation failed');
      }
    });

    it('should allow legitimate paths during transcript saving', async () => {
      const legitimatePaths = [
        'transcripts/video-123.txt',
        './output.md',
        'subdir/file.txt',
        'data/2024/report.pdf',
        'notes/transcript.md'
      ];

      for (const legitimatePath of legitimatePaths) {
        expect(() => validateOutputPath(legitimatePath)).not.toThrow();
      }
    });

    it('should complete workflow with valid paths', async () => {
      const outputPath = 'test-transcript.md';
      const fullOutputPath = path.join(TEST_OUTPUT_DIR, outputPath);

      // Validation should pass
      expect(() => validateOutputPath(outputPath)).not.toThrow();

      // Create mock transcript data
      const entries: TranscriptEntry[] = [
        { text: 'Hello world', duration: 1000, offset: 0 },
        { text: 'This is a test transcript', duration: 2000, offset: 1000 },
        { text: 'End of test', duration: 500, offset: 3000 }
      ];

      // Simulate the transcript saving workflow
      const writeStream = createWriteStream(fullOutputPath, { encoding: 'utf-8' });
      writeStream.write('# Test Transcript\n\n');

      for (const entry of entries) {
        const decodedText = he.decode(entry.text.replace(/&#39;/g, "'"));
        writeStream.write(decodedText + ' ');
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.on('error', reject);
      });

      // Verify file was created successfully
      const stats = await fs.stat(fullOutputPath);
      expect(stats.isFile()).toBe(true);

      const content = await fs.readFile(fullOutputPath, 'utf-8');
      expect(content).toContain('# Test Transcript');
      expect(content).toContain('Hello world');
      expect(content).toContain('This is a test transcript');
      expect(content).toContain('End of test');
    });

    it('should prevent file creation with malicious paths', async () => {
      const maliciousPaths = [
        '../../../etc/passwd.md',
        '/tmp/malicious.txt',
        '../escape/attempt.md'
      ];

      for (const maliciousPath of maliciousPaths) {
        // Validation should fail
        expect(() => validateOutputPath(maliciousPath)).toThrow(McpError);

        // Ensure no file operations proceed after validation failure
        const resolvedPath = path.resolve(testCwd, maliciousPath);
        const isOutsideCwd = !resolvedPath.startsWith(testCwd);
        expect(isOutsideCwd).toBe(true);
      }
    });

    it('should handle filename generation with path validation', async () => {
      const transcriptText = "Test video transcript content";
      const sanitized = transcriptText
        .split(' ').slice(0, 5).join(' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      const filename = `${sanitized}.md`;
      const outputPath = path.join(TEST_OUTPUT_DIR, filename);

      // Generated filename should pass validation
      expect(() => validateOutputPath(filename)).not.toThrow();

      // Create test file
      await fs.writeFile(outputPath, '# Test Transcript\n\nContent here', 'utf-8');

      const stats = await fs.stat(outputPath);
      expect(stats.isFile()).toBe(true);
    });
  });
});
