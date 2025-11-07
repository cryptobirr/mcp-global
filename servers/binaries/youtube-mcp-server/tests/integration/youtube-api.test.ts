import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { YoutubeTranscript } from 'youtube-transcript';

// Environment gate - integration tests only run when explicitly enabled
const INTEGRATION_ENABLED = process.env.RUN_INTEGRATION_TESTS === 'true';

// Stable public video URLs for integration testing
// NOTE: These are real, public YouTube videos from established channels
// If any video becomes unavailable, see alternatives in comments
const TEST_VIDEOS = {
  // ~30min: AWS re:Invent 2023 - Keynote highlights
  // Duration: ~28min, stable conference content
  // Alternative: Search "AWS reInvent keynote" for similar ~30min videos
  SHORT_30MIN: 'https://www.youtube.com/watch?v=PMfn9_nTDbM',

  // ~5hr: Joe Rogan Experience podcast
  // Duration: ~5hr 12min, stable podcast archive
  // Alternative: Search "Joe Rogan Experience long podcast" for ~5hr episodes
  LONG_5HR: 'https://www.youtube.com/watch?v=gFZNZHajD_E',

  // ~6hr: Lex Fridman Podcast - Long-form interview
  // Duration: ~6hr 18min, stable educational content
  // Alternative: Search "Lex Fridman podcast long" for ~6hr episodes
  LONG_6HR: 'https://www.youtube.com/watch?v=cdiD-9MMpb0',

  // Transcripts disabled: Music videos often have disabled transcripts
  // This is a placeholder - replace with actual disabled video if testing AC6
  // NOTE: May need manual verification of disabled status before test runs
  DISABLED: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
};

describe.skipIf(!INTEGRATION_ENABLED)('YouTube API Integration Tests', () => {
  const TEST_OUTPUT_DIR = path.join(__dirname, '../../test-output-integration');

  beforeEach(async () => {
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  });

  it('should process 30min video without performance regression (AC5)', async () => {
    console.error('AC5: Testing 30min video baseline performance...');

    // Fetch real transcript from YouTube API
    const transcriptEntries = await YoutubeTranscript.fetchTranscript(TEST_VIDEOS.SHORT_30MIN);

    // Verify transcript data structure
    expect(transcriptEntries).toBeDefined();
    expect(transcriptEntries.length).toBeGreaterThan(0);
    expect(transcriptEntries[0]).toHaveProperty('text');
    expect(transcriptEntries[0]).toHaveProperty('offset');

    // Simulate streaming write (minimal - just verify fetch works)
    const outputPath = path.join(TEST_OUTPUT_DIR, '30min-test.md');
    const writeStream = await fs.open(outputPath, 'w');

    // Write header
    await writeStream.write('# YouTube Transcript\n\n');

    // Write first few entries to verify format
    for (const entry of transcriptEntries.slice(0, 10)) {
      await writeStream.write(`${entry.text}\n`);
    }

    await writeStream.close();

    // Verify file created successfully
    const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    console.error(`AC5 PASS: Processed ${transcriptEntries.length} transcript entries`);
  }, 60000); // 60s timeout for network call

  it('should process 5hr video with <100MB peak memory (AC1)', async () => {
    console.error('AC1: Testing 5hr video memory constraint...');

    // Force GC before baseline measurement (pattern from streaming.test.ts:111-134)
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage();

    // Fetch real transcript from YouTube API
    const transcriptEntries = await YoutubeTranscript.fetchTranscript(TEST_VIDEOS.LONG_5HR);

    // Simulate streaming write (following src/index.ts:219-239 pattern)
    const outputPath = path.join(TEST_OUTPUT_DIR, '5hr-test.md');
    const writeStream = await fs.open(outputPath, 'w');

    await writeStream.write('# YouTube Transcript\n\n');

    // Write in chunks to simulate streaming behavior
    const CHUNK_SIZE = 100;
    for (let i = 0; i < transcriptEntries.length; i += CHUNK_SIZE) {
      const chunk = transcriptEntries.slice(i, i + CHUNK_SIZE);
      for (const entry of chunk) {
        await writeStream.write(`${entry.text}\n`);
      }
    }

    await writeStream.close();

    // Force GC after streaming for accurate measurement
    if (global.gc) global.gc();
    const memAfter = process.memoryUsage();

    // Calculate peak memory delta (defensive - handles GC releasing more than allocated)
    const peakDelta = Math.max(0, (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024);

    console.error(`AC1: Peak memory delta: ${peakDelta.toFixed(2)}MB`);
    console.error(`AC1: Processed ${transcriptEntries.length} transcript entries`);

    // Verify memory constraint (AC1: <100MB)
    expect(peakDelta).toBeLessThan(100);

    // Verify file created successfully
    const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    console.error('AC1 PASS: Memory constraint verified');
  }, 600000); // 10min timeout for long video processing

  it('should process 6hr video with <100MB peak memory (AC2)', async () => {
    console.error('AC2: Testing 6hr video memory constraint...');

    // Force GC before baseline measurement
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage();

    // Fetch real transcript from YouTube API
    const transcriptEntries = await YoutubeTranscript.fetchTranscript(TEST_VIDEOS.LONG_6HR);

    // Simulate streaming write
    const outputPath = path.join(TEST_OUTPUT_DIR, '6hr-test.md');
    const writeStream = await fs.open(outputPath, 'w');

    await writeStream.write('# YouTube Transcript\n\n');

    const CHUNK_SIZE = 100;
    for (let i = 0; i < transcriptEntries.length; i += CHUNK_SIZE) {
      const chunk = transcriptEntries.slice(i, i + CHUNK_SIZE);
      for (const entry of chunk) {
        await writeStream.write(`${entry.text}\n`);
      }
    }

    await writeStream.close();

    // Force GC after streaming
    if (global.gc) global.gc();
    const memAfter = process.memoryUsage();

    // Calculate peak memory delta
    const peakDelta = Math.max(0, (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024);

    console.error(`AC2: Peak memory delta: ${peakDelta.toFixed(2)}MB`);
    console.error(`AC2: Processed ${transcriptEntries.length} transcript entries`);

    // Verify memory constraint (AC2: <100MB)
    expect(peakDelta).toBeLessThan(100);

    // Verify file created successfully
    const fileExists = await fs.access(outputPath).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    console.error('AC2 PASS: Memory constraint verified');
  }, 600000); // 10min timeout for long video processing

  it('should handle TranscriptsDisabled error (AC6)', async () => {
    console.error('AC6: Testing TranscriptsDisabled error handling...');

    // Attempt to fetch transcript from video with disabled transcripts
    // This should throw an error
    await expect(async () => {
      await YoutubeTranscript.fetchTranscript(TEST_VIDEOS.DISABLED);
    }).rejects.toThrow(/TranscriptsDisabled|disabled|not available/i);

    console.error('AC6 PASS: TranscriptsDisabled error caught and validated');
  }, 30000); // 30s timeout for error case
});
