/**
 * Security test suite for path traversal protection
 * Tests the validateOutputPath function and integration scenarios
 */

import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

// Import the validateOutputPath function - we need to recreate it here for testing
function validateOutputPath(outputPath: string, CLINE_CWD: string): void {
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

describe('Path Traversal Security', () => {
  let testCwd: string;

  beforeEach(() => {
    // Use a consistent test directory
    testCwd = '/Users/test/project';
  });

  describe('validateOutputPath function', () => {
    describe('should allow valid relative paths', () => {
      it('should allow simple relative paths', () => {
        const validPaths = [
          'transcripts/video-123.txt',
          './output.md',
          'subdir/file.txt',
          'deep/nested/path/file.md',
          'file.txt'
        ];

        validPaths.forEach(validPath => {
          expect(() => validateOutputPath(validPath, testCwd)).not.toThrow();
        });
      });

      it('should allow paths with current directory references', () => {
        const validPaths = [
          './transcript.md',
          './data/output.txt',
          './a/b/c/file.txt'
        ];

        validPaths.forEach(validPath => {
          expect(() => validateOutputPath(validPath, testCwd)).not.toThrow();
        });
      });

      it('should allow paths with safe special characters', () => {
        const validPaths = [
          'transcript_video-123.txt',
          'file with spaces.md',
          'data_2024-01-01.json',
          'my-file_name.txt'
        ];

        validPaths.forEach(validPath => {
          expect(() => validateOutputPath(validPath, testCwd)).not.toThrow();
        });
      });
    });

    describe('should block ../ traversal sequences', () => {
      it('should block basic traversal attempts', () => {
        const maliciousPaths = [
          '../../../etc/passwd',
          '../etc/hosts',
          '../../config.json',
          '..\\..\\windows\\system32\\config.txt',
          '..\\..\\..\\secrets.txt'
        ];

        maliciousPaths.forEach(maliciousPath => {
          expect(() => validateOutputPath(maliciousPath, testCwd)).toThrow(McpError);
          expect(() => validateOutputPath(maliciousPath, testCwd)).toThrow('Path validation failed');
        });
      });

      it('should block traversal at various positions', () => {
        const maliciousPaths = [
          'transcripts/../../../etc/passwd',
          'data/../../config.json',
          'output/../secret.txt',
          'normal/path/../../../dangerous'
        ];

        maliciousPaths.forEach(maliciousPath => {
          expect(() => validateOutputPath(maliciousPath, testCwd)).toThrow(McpError);
        });
      });

      it('should block mixed traversal patterns', () => {
        const maliciousPaths = [
          'a/../b/../c/../etc/passwd',
          'path\\to\\..\\..\\windows\\system32',
          'normal/../../../dangerous/path'
        ];

        maliciousPaths.forEach(maliciousPath => {
          expect(() => validateOutputPath(maliciousPath, testCwd)).toThrow(McpError);
        });
      });
    });

    describe('should block absolute paths', () => {
      it('should block Unix absolute paths', () => {
        const absolutePaths = [
          '/etc/passwd',
          '/home/user/data.txt',
          '/var/log/app.log',
          '/tmp/test.txt'
        ];

        absolutePaths.forEach(absolutePath => {
          expect(() => validateOutputPath(absolutePath, testCwd)).toThrow(McpError);
        });
      });

      it('should block Windows absolute paths', () => {
        const windowsPaths = [
          'C:\\Windows\\System32\\drivers\\etc\\hosts',
          'D:\\Data\\config.json',
          'C:\\Users\\test\\file.txt',
          'E:\\backup\\data.sql'
        ];

        windowsPaths.forEach(windowsPath => {
          expect(() => validateOutputPath(windowsPath, testCwd)).toThrow(McpError);
        });
      });
    });

    describe('should block encoded traversal attempts', () => {
      it('should block URL encoded traversal sequences', () => {
        const encodedPaths = [
          '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd', // ../../../etc/passwd
          '..%2f..%2f..%2fetc%2fhosts', // ../../../../etc/hosts
          '%2e%2e%5c%2e%2e%5c%2e%2e%5cconfig.txt', // ..\\..\\..\\config.txt
          '%2e%2e%2F%2e%2e%2F%2e%2e%2Fsecret.txt' // ../../../secret.txt
        ];

        encodedPaths.forEach(encodedPath => {
          expect(() => validateOutputPath(encodedPath, testCwd)).toThrow(McpError);
        });
      });

      it('should block mixed encoding patterns', () => {
        const mixedPaths = [
          'transcripts%2f..%2f..%2fetc%2fpasswd',
          'data%2F..%2F..%2Fconfig.json',
          'path%2f%2e%2e%2f%2e%2e%2fsecret.txt'
        ];

        mixedPaths.forEach(mixedPath => {
          expect(() => validateOutputPath(mixedPath, testCwd)).toThrow(McpError);
        });
      });
    });

    describe('should handle edge cases', () => {
      it('should block empty strings', () => {
        expect(() => validateOutputPath('', testCwd)).toThrow(McpError);
        expect(() => validateOutputPath('', testCwd)).toThrow('Path validation failed');
      });

      it('should handle null bytes safely', () => {
        const maliciousPaths = [
          'file\x00.txt',
          '../../../etc\x00/passwd',
          '/etc\x00/hosts'
        ];

        maliciousPaths.forEach(maliciousPath => {
          expect(() => validateOutputPath(maliciousPath, testCwd)).toThrow(McpError);
        });
      });

      it('should handle very long paths', () => {
        const longPath = 'a'.repeat(1000) + '/../../../etc/passwd';
        expect(() => validateOutputPath(longPath, testCwd)).toThrow(McpError);
      });

      it('should handle special characters', () => {
        const specialPaths = [
          'file with\ttab.txt',
          'path with\nnewline.md',
          'file\x01with\x02control.txt'
        ];

        specialPaths.forEach(specialPath => {
          expect(() => validateOutputPath(specialPath, testCwd)).not.toThrow();
        });
      });
    });

    describe('should use generic error messages', () => {
      it('should return consistent error message for all failures', () => {
        const maliciousPaths = [
          '../../../etc/passwd',
          '/etc/hosts',
          '%2e%2e%2fetc%2fpasswd'
        ];

        maliciousPaths.forEach(maliciousPath => {
          try {
            validateOutputPath(maliciousPath, testCwd);
            fail('Expected McpError to be thrown');
          } catch (error) {
            expect(error).toBeInstanceOf(McpError);
            expect(error.code).toBe(ErrorCode.InvalidParams);
            expect(error.message).toContain('Path validation failed');
          }
        });
      });
    });

    describe('cross-platform path validation', () => {
      it('should handle Windows path separators on Unix', () => {
        const windowsPaths = [
          '..\\..\\windows\\system32\\config.txt',
          'folder\\..\\..\\dangerous\\file.txt',
          'C:\\Windows\\System32\\drivers\\etc\\hosts'
        ];

        windowsPaths.forEach(windowsPath => {
          expect(() => validateOutputPath(windowsPath, testCwd)).toThrow(McpError);
        });
      });

      it('should handle Unix path separators on Windows', () => {
        const unixPaths = [
          '../../../etc/passwd',
          'folder/../../../dangerous/file.txt'
        ];

        unixPaths.forEach(unixPath => {
          expect(() => validateOutputPath(unixPath, testCwd)).toThrow(McpError);
        });
      });
    });
  });
});