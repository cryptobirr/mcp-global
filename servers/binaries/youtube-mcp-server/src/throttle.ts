/**
 * Request throttling module for YouTube MCP Server
 * 
 * Implements configurable request throttling to prevent YouTube from blocking
 * or rate-limiting transcript fetch requests during batch operations.
 * 
 * @module throttle
 */

/**
 * Configuration interface for throttle behavior
 */
export interface ThrottleConfig {
  minDelay: number;
  maxRetries: number;
  backoffMultiplier: number;
  jitter: boolean;
}

/**
 * Default throttle configuration
 */
export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  minDelay: 2000,
  maxRetries: 3,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Request throttler with exponential backoff retry logic
 */
export class RequestThrottler {
  private lastRequestTime = 0;
  private config: ThrottleConfig;

  constructor() {
    this.config = this.loadConfig();
    const configJson = `{"minDelay":${this.config.minDelay},"maxRetries":${this.config.maxRetries},"backoffMultiplier":${this.config.backoffMultiplier},"jitter":${this.config.jitter}}`;
    console.error(`Throttle config loaded: ${configJson}`);
  }

  private loadConfig(): ThrottleConfig {
    const config: ThrottleConfig = { ...DEFAULT_THROTTLE_CONFIG };
    let hasInvalidConfig = false;

    if (process.env.YOUTUBE_MIN_DELAY !== undefined) {
      const minDelay = parseInt(process.env.YOUTUBE_MIN_DELAY, 10);
      if (!isNaN(minDelay) && minDelay >= 0 && minDelay <= 60000) {
        config.minDelay = minDelay;
      } else {
        hasInvalidConfig = true;
        console.error(`Invalid YOUTUBE_MIN_DELAY. Must be 0-60000. Using default: ${DEFAULT_THROTTLE_CONFIG.minDelay}`);
      }
    }

    if (process.env.YOUTUBE_MAX_RETRIES !== undefined) {
      const maxRetries = parseInt(process.env.YOUTUBE_MAX_RETRIES, 10);
      if (!isNaN(maxRetries) && maxRetries >= 0 && maxRetries <= 10) {
        config.maxRetries = maxRetries;
      } else {
        hasInvalidConfig = true;
        console.error(`Invalid YOUTUBE_MAX_RETRIES. Must be 0-10. Using default: ${DEFAULT_THROTTLE_CONFIG.maxRetries}`);
      }
    }

    if (process.env.YOUTUBE_BACKOFF_MULTIPLIER !== undefined) {
      const backoffMultiplier = parseFloat(process.env.YOUTUBE_BACKOFF_MULTIPLIER);
      if (!isNaN(backoffMultiplier) && backoffMultiplier >= 1.0 && backoffMultiplier <= 5.0) {
        config.backoffMultiplier = backoffMultiplier;
      } else {
        hasInvalidConfig = true;
        console.error(`Invalid YOUTUBE_BACKOFF_MULTIPLIER. Must be 1.0-5.0. Using default: ${DEFAULT_THROTTLE_CONFIG.backoffMultiplier}`);
      }
    }

    if (process.env.YOUTUBE_JITTER !== undefined) {
      const jitterValue = process.env.YOUTUBE_JITTER.toLowerCase();
      if (jitterValue === 'false' || jitterValue === '0') {
        config.jitter = false;
      } else if (jitterValue === 'true' || jitterValue === '1') {
        config.jitter = true;
      } else {
        hasInvalidConfig = true;
        console.error(`Invalid YOUTUBE_JITTER. Must be true/false. Using default: ${DEFAULT_THROTTLE_CONFIG.jitter}`);
      }
    }

    if (hasInvalidConfig) {
      console.error('Invalid throttle config detected, using defaults where applicable');
    }

    return config;
  }

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const requiredDelay = Math.max(0, this.config.minDelay - timeSinceLastRequest);

    const delay = this.config.jitter
      ? Math.floor(requiredDelay * (0.8 + Math.random() * 0.4))
      : requiredDelay;

    if (delay > 0) {
      console.error(`Throttling: waiting ${delay}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();

    return this.withRetry(fn, 1);
  }

  private async withRetry<T>(fn: () => Promise<T>, attempt: number): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      if (this.isRateLimitError(error) && attempt <= this.config.maxRetries) {
        const backoffDelay = Math.floor(
          this.config.minDelay * Math.pow(this.config.backoffMultiplier, attempt - 1)
        );

        console.error(`Rate limited. Retry ${attempt}/${this.config.maxRetries} after ${backoffDelay}ms`);

        await new Promise(resolve => setTimeout(resolve, backoffDelay));

        return this.withRetry(fn, attempt + 1);
      }

      if (this.isRateLimitError(error) && attempt > this.config.maxRetries) {
        throw new Error(`Max retries (${this.config.maxRetries}) exceeded. YouTube rate limit persists. Original error: ${error.message}`);
      }

      throw error;
    }
  }

  private isRateLimitError(error: any): boolean {
    if (!error || !error.message) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('429') ||
      message.includes('too many requests') ||
      message.includes('rate limit')
    );
  }
}
