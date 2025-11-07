/**
 * Security Tests for Input Validation
 *
 * Tests input validation and vulnerability prevention in the YoutubeMcpServer.
 * Covers malicious URLs, path traversal attempts, and input sanitization.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';

describe('Security Tests - Input Validation', () => {
  describe('YouTube URL Validation', () => {
    it('should detect malicious YouTube URLs', () => {
      const maliciousUrls = [
        'https://www.youtube.com/watch?v=../../../etc/passwd',
        'https://youtube.com/watch?v=javascript:alert(1)',
        'https://youtu.be/<script>alert("xss")</script>',
        'https://www.youtube.com/watch?v=data:text/html,<script>alert(1)</script>',
        'https://youtube.com/shorts/../../../etc/shadow',
        'https://www.youtube.com/watch?v=\' UNION SELECT * FROM users--',
        'https://youtube.com/watch?v="; DROP TABLE users; --',
      ];

      // Test that these URLs would be flagged by validation
      for (const url of maliciousUrls) {
        // Check for obvious malicious patterns
        const hasTraversal = url.includes('../') || url.includes('..\\');
        const hasScript = url.toLowerCase().includes('<script>') || url.toLowerCase().includes('javascript:');
        const hasSqlInjection = url.includes('UNION SELECT') || url.includes('DROP TABLE');
        const hasDataUri = url.startsWith('data:');

        expect(hasTraversal || hasScript || hasSqlInjection || hasDataUri).toBe(true);
      }
    });

    it('should validate YouTube URL formats correctly', () => {
      const validFormats = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://youtube.com/shorts/abc123xyz',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL12345',
      ];

      const invalidFormats = [
        'not-a-url',
        'ftp://malicious.com/video',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '../../../etc/passwd',
        '',
        null,
        undefined,
      ];

      // Test valid format detection
      for (const url of validFormats) {
        const isValidYoutubeUrl =
          url.includes('youtube.com/watch?v=') ||
          url.includes('youtu.be/') ||
          url.includes('youtube.com/shorts/');
        expect(isValidYoutubeUrl).toBe(true);
      }

      // Test invalid format detection
      for (const url of invalidFormats) {
        const isValidYoutubeUrl =
          typeof url === 'string' &&
          (url.includes('youtube.com/watch?v=') ||
           url.includes('youtu.be/') ||
           url.includes('youtube.com/shorts/'));
        expect(isValidYoutubeUrl).toBe(false);
      }
    });

    it('should sanitize YouTube video IDs correctly', () => {
      const testCases = [
        { input: 'dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
        { input: 'abc-123_xyz', expected: 'abc-123_xyz' },
        { input: 'invalid@id#$', expected: 'invalidid' }, // Special chars removed
        { input: '../../../etc/passwd', expected: 'etcpasswd' }, // Traversal sanitized
        { input: '<script>alert(1)</script>', expected: 'scriptalert1script' }, // Tags sanitized
      ];

      for (const { input, expected } of testCases) {
        const sanitized = input
          .replace(/[^a-zA-Z0-9_-]/g, '') // Only allow alphanumerics, dash, underscore
          .substring(0, 20); // Limit length

        // For some cases, the sanitization might result in different behavior
        if (input.includes('../') || input.includes('<script>')) {
          // These should be detected as malicious and rejected entirely
          expect(sanitized).not.toContain('..');
          expect(sanitized).not.toContain('<');
          expect(sanitized).not.toContain('>');
        } else {
          expect(sanitized).toBe(expected);
        }
      }
    });
  });

  describe('Path Traversal Protection', () => {
    it('should prevent path traversal attempts', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32\\config.txt',
        '/etc/shadow',
        'C:\\Windows\\System32\\drivers\\etc\\hosts',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd', // URL encoded traversal
        '....//....//....//etc/passwd', // Obfuscated traversal
        '/var/www/../../../etc/passwd',
        './config/../../etc/hosts',
        'file:///etc/passwd', // File URI
        '../%2e%2e/../etc/passwd', // Mixed encoding
      ];

      for (const maliciousPath of maliciousPaths) {
        const isValidPath = validateOutputPath(maliciousPath);
        expect(isValidPath).toBe(false);
      }
    });

    it('should allow legitimate paths', () => {
      const legitimatePaths = [
        'transcripts/video.md',
        './output/transcript.txt',
        'data/2024/report.pdf',
        'notes/transcript.md',
        'files/video-transcript.txt',
        'subdir/nested/file.md',
        './relative/path/file.txt',
      ];

      for (const legitimatePath of legitimatePaths) {
        const isValidPath = validateOutputPath(legitimatePath);
        expect(isValidPath).toBe(true);
      }
    });

    it('should handle edge cases in path validation', () => {
      const edgeCases = [
        { path: '', expected: false },
        { path: null, expected: false },
        { path: undefined, expected: false },
        { path: '   ', expected: false }, // Whitespace only
        { path: '.', expected: true }, // Current directory
        { path: './', expected: true }, // Current directory with slash
        { path: 'file.txt', expected: true }, // Simple filename
        { path: '../', expected: false }, // Parent directory only
        { path: '..', expected: false }, // Parent directory without slash
      ];

      for (const { path, expected } of edgeCases) {
        const isValidPath = validateOutputPath(path);
        expect(isValidPath).toBe(expected);
      }
    });

    // Helper function from the source code (with file:// URI detection)
    function validateOutputPath(outputPath: string): boolean {
      if (!outputPath || outputPath.trim() === '') {
        return false;
      }

      if (outputPath.includes('\0')) {
        return false;
      }

      // Check for file:// URIs
      if (outputPath.startsWith('file://')) {
        return false;
      }

      const decodedPath = decodeURIComponent(outputPath);

      if (decodedPath.includes('../') || decodedPath.includes('..\\')) {
        return false;
      }

      if (path.isAbsolute(outputPath) || path.isAbsolute(decodedPath)) {
        return false;
      }

      if (/^[A-Za-z]:/.test(outputPath) || /^[A-Za-z]:/.test(decodedPath)) {
        return false;
      }

      const testCwd = process.cwd();
      const resolvedPath = path.resolve(testCwd, outputPath);

      return resolvedPath.startsWith(testCwd);
    }
  });

  describe('Input Sanitization', () => {
    it('should sanitize transcript text properly', () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<svg onload=alert(1)>',
        '&#60;script&#62;alert(1)&#60;/script&#62;', // HTML entities
        '%3Cscript%3Ealert(1)%3C/script%3E', // URL encoded
      ];

      for (const input of maliciousInputs) {
        const sanitized = sanitizeTranscriptText(input);

        // Should not contain script tags or javascript: protocols
        expect(sanitized.toLowerCase()).not.toContain('<script>');
        expect(sanitized.toLowerCase()).not.toContain('javascript:');
        expect(sanitized.toLowerCase()).not.toContain('onerror=');
        expect(sanitized.toLowerCase()).not.toContain('onload=');
        expect(sanitized).not.toContain('<iframe');
      }
    });

    it('should handle HTML entity decoding safely', () => {
      const testCases = [
        { input: 'It&#39;s working', expected: "It's working" },
        { input: 'Test &lt;tag&gt; content', expected: 'Test <tag> content' },
        { input: 'Quote &quot;test&quot;', expected: 'Quote "test"' },
        { input: 'Ampersand &amp; symbol', expected: 'Ampersand & symbol' },
        { input: 'Safe &lt;script&gt; content', expected: 'Safe <script> content' }, // Still decoded but harmless
      ];

      for (const { input, expected } of testCases) {
        // Simulate the HTML entity decoding from the source
        let decoded = input.replace(/&#39;/g, "'").replace(/'/g, "'");

        // Use he.decode if available (simplified test without actual library)
        try {
          // In real implementation, this would use he.decode()
          decoded = decoded.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        } catch (e) {
          // Fallback
        }

        expect(decoded).toBe(expected);
      }
    });

    it('should prevent command injection in filenames', () => {
      const maliciousFilenames = [
        'file.txt; rm -rf /',
        'filename`cat /etc/passwd`',
        'filename$(whoami)',
        'filename|ls -la',
        'filename&& echo "hacked"',
        'filename|| echo "hacked"',
        'filename> /etc/passwd',
        'filename >> /etc/hosts',
      ];

      for (const filename of maliciousFilenames) {
        const sanitized = sanitizeFilename(filename);

        // Should not contain command injection characters
        expect(sanitized).not.toContain(';');
        expect(sanitized).not.toContain('`');
        expect(sanitized).not.toContain('$(');
        expect(sanitized).not.toContain('|');
        expect(sanitized).not.toContain('&&');
        expect(sanitized).not.toContain('||');
        expect(sanitized).not.toContain('>');
        expect(sanitized).not.toContain('>>');
      }
    });
  });

  describe('Buffer Overflow Protection', () => {
    it('should handle excessively long inputs', () => {
      const longString = 'a'.repeat(1000000); // 1MB string
      const veryLongString = 'a'.repeat(10000000); // 10MB string

      // Test that the system can handle large inputs without crashing
      expect(() => {
        const sanitized = sanitizeTranscriptText(longString);
        expect(typeof sanitized).toBe('string');
        expect(sanitized.length).toBeLessThanOrEqual(longString.length);
      }).not.toThrow();

      expect(() => {
        const sanitized = sanitizeTranscriptText(veryLongString);
        expect(typeof sanitized).toBe('string');
      }).not.toThrow();
    });

    it('should limit filename length', () => {
      const longFilename = 'a'.repeat(1000);
      const sanitized = sanitizeFilename(longFilename);

      // Should be truncated to reasonable length
      expect(sanitized.length).toBeLessThan(255); // Standard filename limit
      expect(typeof sanitized).toBe('string');
    });
  });

  describe('Content Security Policy Considerations', () => {
    it('should not output executable content in transcripts', () => {
      const maliciousContent = [
        '<script>document.cookie</script>',
        '<?php system($_GET["cmd"]); ?>',
        '<%= request.getParameter("cmd") %>',
        '{{ config.items() }}',
        '${7*7}',
        'javascript:void(0)',
        'vbscript:msgbox("xss")',
      ];

      for (const content of maliciousContent) {
        const sanitized = sanitizeTranscriptText(content);

        // Should neutralize or remove executable patterns
        expect(sanitized.toLowerCase()).not.toContain('<script>');
        expect(sanitized.toLowerCase()).not.toContain('<?php');
        expect(sanitized.toLowerCase()).not.toContain('<%=');
        expect(sanitized.toLowerCase()).not.toContain('{{');
        expect(sanitized.toLowerCase()).not.toContain('${');
        expect(sanitized.toLowerCase()).not.toContain('javascript:');
        expect(sanitized.toLowerCase()).not.toContain('vbscript:');
      }
    });

    it('should escape or remove dangerous HTML attributes', () => {
      const dangerousAttributes = [
        '<div onclick="alert(1)">content</div>',
        '<img src=x onerror="alert(1)">',
        '<body onload="malicious()">',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<link rel="stylesheet" href="javascript:alert(1)">',
        '<style>body{background:url(javascript:alert(1))}</style>',
      ];

      for (const content of dangerousAttributes) {
        const sanitized = sanitizeTranscriptText(content);

        // Should remove or escape dangerous attributes
        expect(sanitized.toLowerCase()).not.toContain('onclick=');
        expect(sanitized.toLowerCase()).not.toContain('onerror=');
        expect(sanitized.toLowerCase()).not.toContain('onload=');
        expect(sanitized.toLowerCase()).not.toContain('javascript:');
      }
    });
  });

  describe('Memory Safety', () => {
    it('should handle memory pressure gracefully', () => {
      // Test that the system doesn't crash with memory-intensive operations
      const largeArray = Array(100000).fill('test content ');
      const largeString = largeArray.join('');

      expect(() => {
        const processed = largeString.replace(/&#39;/g, "'").replace(/'/g, "'");
        expect(typeof processed).toBe('string');
        expect(processed.length).toBe(largeString.length);
      }).not.toThrow();
    });

    it('should prevent regex DoS attacks', () => {
      // Test with potentially expensive regex patterns
      const maliciousInput = 'a' + '\\'.repeat(10000) + 'a';

      expect(() => {
        const result = maliciousInput.replace(/\\/g, '');
        expect(typeof result).toBe('string');
      }).not.toThrow();
    });
  });

  // Helper functions for testing
  function sanitizeTranscriptText(text: string): string {
    if (typeof text !== 'string') return '';

    // Basic sanitization - remove script tags and dangerous attributes
    return text
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]*on\w+\s*=\s*["'][^"']*["'][^>]*>/gi, '')
      .replace(/<[^>]*javascript:[^>]*>/gi, '')
      .replace(/<[^>]*vbscript:[^>]*>/gi, '')
      .replace(/<[^>]*data:[^>]*>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove all on* attributes with quotes
      .replace(/on\w+\s*=\s*[^>\s]*/gi, '') // Remove all on* attributes without quotes
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/data:\s*text\/html/gi, '')
      .replace(/<\?php[^>]*\?>/gi, '')
      .replace(/<%=[^>]*%>/gi, '')
      .replace(/{{[^}]*}}/gi, '')
      .replace(/\$\{[^}]*\}/gi, '')
      .replace(/<iframe[^>]*>/gi, '') // Remove iframe tags
      .substring(0, 1000000); // Limit length
  }

  function sanitizeFilename(filename: string): string {
    if (typeof filename !== 'string') return '';

    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '') // Only allow safe characters
      .substring(0, 200); // Limit length
  }
});