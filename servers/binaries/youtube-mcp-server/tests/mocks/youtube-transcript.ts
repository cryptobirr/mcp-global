/**
 * YouTube Transcript Mock Module
 *
 * Provides mock functionality for youtube-transcript package to enable
 * comprehensive testing without external API dependencies.
 */

import { vi } from 'vitest';

// Mock transcript entry interface matching real implementation
export interface MockTranscriptEntry {
  text: string;
  duration: number;
  offset: number;
}

// Mock transcript data for various scenarios
export const MOCK_TRANSCRIPTS = {
  // Standard video transcript
  standard: [
    { text: 'Hello and welcome to this tutorial', duration: 3000, offset: 0 },
    { text: 'Today we&#39;re going to learn about testing', duration: 2500, offset: 3000 },
    { text: 'Testing is crucial for software quality', duration: 2800, offset: 5500 },
    { text: 'Let&#39;s start with the basics', duration: 2000, offset: 8300 },
    { text: 'First, we need to set up our environment', duration: 3200, offset: 10300 },
  ],

  // Long transcript for memory/performance testing (60k entries)
  long: Array.from({ length: 60000 }, (_, i) => ({
    text: `Word ${i} test content with some length to simulate real transcript data entry number ${i}`,
    duration: 1000,
    offset: i * 1000
  })) as MockTranscriptEntry[],

  // Transcript with special characters and HTML entities
  specialChars: [
    { text: 'Test &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;', duration: 2000, offset: 0 },
    { text: 'It&#39;s working with &#34;quotes&#34; and &amp; symbols', duration: 2500, offset: 2000 },
    { text: 'Café résumé naïve façade', duration: 1800, offset: 4500 },
  ],

  // Empty transcript (edge case)
  empty: [] as MockTranscriptEntry[],

  // Single entry transcript
  single: [
    { text: 'Single entry test', duration: 1000, offset: 0 }
  ] as MockTranscriptEntry[],
};

// Error scenarios
export const MOCK_ERRORS = {
  transcriptsDisabled: new Error('TranscriptsDisabled'),
  notFound: new Error('Could not find transcript'),
  networkError: new Error('Network timeout'),
  invalidUrl: new Error('Invalid video URL'),
  privateVideo: new Error('Video is private'),
};

// Mock YouTube transcript response data
export interface MockYoutubeTranscriptResponse {
  videoId: string;
  transcript: MockTranscriptEntry[];
  error?: Error;
}

// Mock fetchTranscript function
export const mockFetchTranscript = vi.fn();

// Default mock implementation
mockFetchTranscript.mockImplementation((url: string) => {
  // Extract video ID from various YouTube URL formats
  const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/);
  const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';

  // Return different responses based on video ID patterns
  if (videoId.includes('error-disabled')) {
    throw MOCK_ERRORS.transcriptsDisabled;
  }

  if (videoId.includes('error-notfound')) {
    throw MOCK_ERRORS.notFound;
  }

  if (videoId.includes('error-network')) {
    throw MOCK_ERRORS.networkError;
  }

  if (videoId.includes('long')) {
    return Promise.resolve(MOCK_TRANSCRIPTS.long);
  }

  if (videoId.includes('empty')) {
    return Promise.resolve(MOCK_TRANSCRIPTS.empty);
  }

  if (videoId.includes('special')) {
    return Promise.resolve(MOCK_TRANSCRIPTS.specialChars);
  }

  // Default response
  return Promise.resolve(MOCK_TRANSCRIPTS.standard);
});

// Setup module mocking
export function setupYoutubeTranscriptMock() {
  vi.mock('youtube-transcript', () => ({
    YoutubeTranscript: {
      fetchTranscript: mockFetchTranscript,
    },
  }));
}

// Helper functions for test setup
export const mockTestHelpers = {
  // Reset mock call history
  resetMocks: () => {
    mockFetchTranscript.mockClear();
  },

  // Set custom mock response
  setCustomResponse: (response: MockTranscriptEntry[] | Error) => {
    if (response instanceof Error) {
      mockFetchTranscript.mockImplementation(() => {
        throw response;
      });
    } else {
      mockFetchTranscript.mockImplementation(() => Promise.resolve(response));
    }
  },

  // Verify mock was called with specific URL
  verifyCalledWith: (url: string) => {
    expect(mockFetchTranscript).toHaveBeenCalledWith(url);
  },

  // Get call count
  getCallCount: () => mockFetchTranscript.mock.calls.length,

  // Get last called URL
  getLastCalledUrl: () => {
    const calls = mockFetchTranscript.mock.calls;
    return calls.length > 0 ? calls[calls.length - 1][0] : null;
  },
};

export default {
  setupYoutubeTranscriptMock,
  mockFetchTranscript,
  MOCK_TRANSCRIPTS,
  MOCK_ERRORS,
  mockTestHelpers,
};