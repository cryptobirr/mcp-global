# Changelog

All notable changes to the YouTube MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CHANGELOG.md for tracking version history
- Edge case documentation for batch processing scenarios

## [0.1.0] - 2025-11-09

### Added
- **Batch Processing**: New `batch_get_transcripts` tool for processing 1-50 videos in single operation
  - Aggregated mode: Combines all transcripts into single file with section markers
  - Individual mode: Saves each transcript as separate file with unique naming
  - Error resilience: Failed videos don't halt batch processing
  - Progress tracking: Detailed logging for batch operations
  - Response summary: Shows successful/failed transcript counts with details
- **Request Throttling**: Automatic throttling to prevent YouTube rate limiting
  - Configurable minimum delay between requests (default: 2s)
  - Exponential backoff retry mechanism for rate limit errors (429)
  - Jitter support: ±20% randomness to prevent synchronized request patterns
  - Environment variable configuration: `YOUTUBE_MIN_DELAY`, `YOUTUBE_MAX_RETRIES`, `YOUTUBE_BACKOFF_MULTIPLIER`, `YOUTUBE_JITTER`
- **Standardized Storage**: Configurable transcript storage location
  - Default location: `~/.youtube-transcripts/`
  - Customizable via `YOUTUBE_TRANSCRIPT_DIR` environment variable
  - Unique filename format: `{video_id}_{unix_timestamp}.txt`
- **Integration Tests**: Real YouTube API verification tests
  - AC1: 5-hour video processing with <100MB peak memory
  - AC2: 6-hour video processing with <100MB peak memory
  - AC5: 30-minute video baseline performance
  - AC6: TranscriptsDisabled error handling
- **Edge Case Tests**: Comprehensive test coverage for batch processing (#25)
  - Empty video URL array handling
  - Single video batch processing
  - Maximum batch size (50 videos)
  - Mixed success/failure scenarios
  - All-failure scenarios
  - Directory creation for individual mode
  - File overwrite handling
  - Invalid output modes

### Changed
- **Code Refactoring**: Extracted 6 reusable private methods from inline logic
  - `normalizeYoutubeUrl()`: URL normalization
  - `extractVideoId()`: Video ID extraction
  - `generateTitleAndFilename()`: Title/filename generation
  - `constructOutputPath()`: Path construction
  - `streamTranscriptToFile()`: Streaming write
  - `categorizeError()`: Error categorization
- **Output Format**: Changed from `.md` to `.txt` extension for transcript files
- **Filename Strategy**: Changed from title-based to video ID + timestamp format
  - Before: First 5 words of transcript + `.md`
  - After: `{video_id}_{unix_timestamp}.txt`

### Fixed
- **Path Traversal Vulnerability** (#17): Critical security fix
  - Sanitized file paths to prevent directory traversal attacks
  - Added comprehensive security tests
- **Stream Error Handling**: Improved async error propagation
  - Proper error capture for stream operations
  - Better error messages for failed transcripts

### Security
- Path traversal vulnerability patched (17 security tests added)
- Input validation for all file paths
- Sanitization of user-provided output paths

## [0.0.1] - 2025-09-20

### Added
- Initial release: `get_transcript_and_save` tool
  - Fetch single YouTube video transcript
  - Save to user-specified path
  - Memory-optimized streaming processing for large videos
  - Support for videos up to 6+ hours
  - Peak memory usage <100MB regardless of video length

### Features
- Streaming transcript processing (no full-content buffering)
- Automatic video title extraction
- Error handling for unavailable transcripts
- TypeScript-based implementation
- MCP protocol compliance

---

**Legend:**
- `Added`: New features
- `Changed`: Changes in existing functionality
- `Deprecated`: Soon-to-be removed features
- `Removed`: Removed features
- `Fixed`: Bug fixes
- `Security`: Security vulnerability fixes

[Unreleased]: https://github.com/cryptobirr/mcp-global/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/cryptobirr/mcp-global/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/cryptobirr/mcp-global/releases/tag/v0.0.1
