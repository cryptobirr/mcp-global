/**
 * YouTube Transcript Mock Module
 *
 * Provides mock implementations for the youtube-transcript package.
 * This allows tests to run without actual YouTube API calls.
 */

import { vi } from 'vitest';

// Mock transcript entry interface
export interface MockTranscriptEntry {
  text: string;
  duration: number;
  offset: number;
}

// Mock transcript data sets
export const mockTranscripts = {
  standard: [
    { text: "Hello everyone and welcome to this video", duration: 3000, offset: 0 },
    { text: "Today we're going to learn about TypeScript", duration: 4000, offset: 3000 },
    { text: "TypeScript is a superset of JavaScript", duration: 3500, offset: 7000 },
    { text: "It adds static typing to the language", duration: 3000, offset: 10500 },
    { text: "Let's start with some basic examples", duration: 2500, offset: 13500 }
  ],

  long: Array.from({ length: 60000 }, (_, i) => ({
    text: `This is transcript entry number ${i + 1} with substantial content to simulate real YouTube transcript data including punctuation and various text elements that would normally appear in spoken content.`,
    duration: 1000,
    offset: i * 1000
  })),

  specialChars: [
    { text: "Let's test special characters: &lt;script&gt; &amp; &quot;quotes&quot;", duration: 2000, offset: 0 },
    { text: "HTML entities: &#39; apostrophes and &#34; quotes", duration: 1500, offset: 2000 },
    { text: "Unicode: café naïve résumé", duration: 1000, offset: 3500 }
  ],

  empty: [],

  shorts: [
    { text: "This is a YouTube Short", duration: 15000, offset: 0 },
    { text: "Very quick content", duration: 5000, offset: 15000 }
  ]
};

// Mock YouTubeTranscript class
class MockYoutubeTranscript {
  static async fetchTranscript(videoUrl: string): Promise<MockTranscriptEntry[]> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 10));

    // Return different mock data based on URL patterns
    if (videoUrl.includes('shorts')) {
      return mockTranscripts.shorts;
    }

    if (videoUrl.includes('long')) {
      return mockTranscripts.long;
    }

    if (videoUrl.includes('special') || videoUrl.includes('chars')) {
      return mockTranscripts.specialChars;
    }

    if (videoUrl.includes('empty')) {
      return mockTranscripts.empty;
    }

    // Default to standard transcript
    return mockTranscripts.standard;
  }
}

// Error simulation helpers
export const mockErrors = {
  transcriptsDisabled: new Error('Transcripts are disabled for this video'),
  videoNotFound: new Error('Video not found'),
  networkError: new Error('Network error occurred'),
  rateLimit: new Error('Rate limit exceeded')
};

// Mock state management
let mockErrorState: Error | null = null;
let mockTranscriptOverride: MockTranscriptEntry[] | null = null;

export const mockYoutubeTranscriptHelpers = {
  // Set error state for testing error scenarios
  setError(error: Error | null) {
    mockErrorState = error;
  },

  // Override transcript data
  setTranscript(transcript: MockTranscriptEntry[] | null) {
    mockTranscriptOverride = transcript;
  },

  // Reset mock state
  reset() {
    mockErrorState = null;
    mockTranscriptOverride = null;
  },

  // Get current mock state
  getState() {
    return {
      error: mockErrorState,
      transcriptOverride: mockTranscriptOverride
    };
  }
};

// Setup the mock
export function setupYoutubeTranscriptMock() {
  // Mock the youtube-transcript module
  vi.mock('youtube-transcript', () => ({
    YoutubeTranscript: {
      fetchTranscript: vi.fn(async (videoUrl: string) => {
        // Check for error state first
        if (mockErrorState) {
          throw mockErrorState;
        }

        // Check for transcript override
        if (mockTranscriptOverride) {
          return mockTranscriptOverride;
        }

        // Use default mock implementation
        return MockYoutubeTranscript.fetchTranscript(videoUrl);
      })
    }
  }));

  return {
    mockTranscripts,
    mockErrors,
    mockYoutubeTranscriptHelpers
  };
}