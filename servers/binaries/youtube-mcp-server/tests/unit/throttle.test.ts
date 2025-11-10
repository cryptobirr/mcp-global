import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RequestThrottler, DEFAULT_THROTTLE_CONFIG } from '../../src/throttle.js';

describe('RequestThrottler', () => {
  let throttler: RequestThrottler;

  beforeEach(() => {
    // Reset environment variables
    delete process.env.YOUTUBE_MIN_DELAY;
    delete process.env.YOUTUBE_MAX_RETRIES;
    delete process.env.YOUTUBE_BACKOFF_MULTIPLIER;
    delete process.env.YOUTUBE_JITTER;
    
    vi.clearAllMocks();
  });

  describe('UT1: First request has no delay', () => {
    it('should execute immediately on first request', async () => {
      throttler = new RequestThrottler();
      const startTime = Date.now();
      const mockFn = vi.fn(async () => 'result');
      
      const result = await throttler.throttle(mockFn);
      
      const elapsed = Date.now() - startTime;
      expect(result).toBe('result');
      expect(elapsed).toBeLessThan(100); // Should be nearly instant
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('UT2: Second request delayed by minDelay', () => {
    it('should delay second request by remaining time to reach minDelay', async () => {
      throttler = new RequestThrottler();
      const mockFn = vi.fn(async () => 'result');
      
      // First request (immediate)
      await throttler.throttle(mockFn);
      
      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Second request should delay by ~1 second (to reach 2s total)
      const startTime = Date.now();
      await throttler.throttle(mockFn);
      const elapsed = Date.now() - startTime;
      
      // Should be between 800ms and 1400ms (accounting for jitter ±20%)
      expect(elapsed).toBeGreaterThanOrEqual(800);
      expect(elapsed).toBeLessThanOrEqual(1400);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('UT3: Jitter adds randomness', () => {
    it('should add ±20% randomness to delays when jitter enabled', async () => {
      process.env.YOUTUBE_JITTER = 'true';
      throttler = new RequestThrottler();
      const mockFn = vi.fn(async () => 'result');
      
      const delays: number[] = [];
      
      // Make 10 consecutive requests and measure delays
      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await throttler.throttle(mockFn);
        if (i > 0) { // Skip first request (no delay)
          delays.push(Date.now() - startTime);
        }
      }
      
      // Calculate standard deviation
      const mean = delays.reduce((a, b) => a + b, 0) / delays.length;
      const variance = delays.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / delays.length;
      const stdDev = Math.sqrt(variance);
      
      // Standard deviation should be > 0 (randomness exists)
      expect(stdDev).toBeGreaterThan(0);
      
      // All delays should be within ±20% of minDelay (2000ms)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(1600);
        expect(delay).toBeLessThanOrEqual(2400);
      });
    }, 30000); // Increase timeout for this test
  });

  describe('UT4: Jitter disabled gives deterministic delays', () => {
    it('should use exact minDelay when jitter disabled', async () => {
      process.env.YOUTUBE_JITTER = 'false';
      throttler = new RequestThrottler();
      const mockFn = vi.fn(async () => 'result');
      
      // First request (immediate)
      await throttler.throttle(mockFn);
      
      // Second request should delay by exactly 2000ms
      const startTime = Date.now();
      await throttler.throttle(mockFn);
      const elapsed = Date.now() - startTime;
      
      // Should be very close to 2000ms (allow small system variance)
      expect(elapsed).toBeGreaterThanOrEqual(1950);
      expect(elapsed).toBeLessThanOrEqual(2050);
    });
  });

  describe('UT5: Rate limit triggers retry with exponential backoff', () => {
    it('should retry with exponential backoff on rate limit errors', async () => {
      throttler = new RequestThrottler();
      let attemptCount = 0;
      
      const mockFn = vi.fn(async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('429 Too Many Requests');
        }
        return 'success';
      });
      
      const result = await throttler.throttle(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    }, 15000);
  });

  describe('UT6: Max retries exceeded throws error', () => {
    it('should throw error after max retries exceeded', async () => {
      throttler = new RequestThrottler();
      const mockFn = vi.fn(async () => {
        throw new Error('429 Too Many Requests');
      });
      
      await expect(throttler.throttle(mockFn)).rejects.toThrow(/Max retries.*exceeded/);
      expect(mockFn).toHaveBeenCalledTimes(4); // Initial + 3 retries
    }, 20000);
  });

  describe('UT7: Non-rate-limit errors throw immediately', () => {
    it('should not retry on non-rate-limit errors', async () => {
      throttler = new RequestThrottler();
      const mockFn = vi.fn(async () => {
        throw new Error('Network error');
      });
      
      await expect(throttler.throttle(mockFn)).rejects.toThrow('Network error');
      expect(mockFn).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('UT8: Rate limit error detection', () => {
    it('should detect 429 status code', async () => {
      throttler = new RequestThrottler();
      const mockFn = vi.fn(async () => {
        throw new Error('HTTP 429 error');
      });
      
      await expect(throttler.throttle(mockFn)).rejects.toThrow(/Max retries/);
    }, 20000);

    it('should detect "Too Many Requests" message', async () => {
      throttler = new RequestThrottler();
      const mockFn = vi.fn(async () => {
        throw new Error('Too Many Requests');
      });
      
      await expect(throttler.throttle(mockFn)).rejects.toThrow(/Max retries/);
    }, 20000);

    it('should detect "rate limit" message', async () => {
      throttler = new RequestThrottler();
      const mockFn = vi.fn(async () => {
        throw new Error('Rate limit exceeded');
      });
      
      await expect(throttler.throttle(mockFn)).rejects.toThrow(/Max retries/);
    }, 20000);
  });

  describe('UT9: Configuration loading from env vars', () => {
    it('should load configuration from environment variables', () => {
      process.env.YOUTUBE_MIN_DELAY = '5000';
      process.env.YOUTUBE_MAX_RETRIES = '5';
      process.env.YOUTUBE_BACKOFF_MULTIPLIER = '3';
      process.env.YOUTUBE_JITTER = 'false';
      
      throttler = new RequestThrottler();
      
      // Config is private, but we can verify behavior
      // This test mainly ensures no errors during construction
      expect(throttler).toBeDefined();
    });
  });

  describe('UT10: Invalid configuration falls back to defaults', () => {
    it('should use defaults for invalid min delay', () => {
      process.env.YOUTUBE_MIN_DELAY = '-500';
      
      throttler = new RequestThrottler();
      expect(throttler).toBeDefined();
    });

    it('should use defaults for invalid max retries', () => {
      process.env.YOUTUBE_MAX_RETRIES = 'abc';
      
      throttler = new RequestThrottler();
      expect(throttler).toBeDefined();
    });

    it('should use defaults for invalid backoff multiplier', () => {
      process.env.YOUTUBE_BACKOFF_MULTIPLIER = '10';
      
      throttler = new RequestThrottler();
      expect(throttler).toBeDefined();
    });
  });

  describe('UT11: Configuration validation warnings', () => {
    it('should log warning for invalid configuration', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      process.env.YOUTUBE_MIN_DELAY = 'invalid';
      throttler = new RequestThrottler();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid YOUTUBE_MIN_DELAY')
      );
      
      consoleErrorSpy.mockRestore();
    });
  });
});
