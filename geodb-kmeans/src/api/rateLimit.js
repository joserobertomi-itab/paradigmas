/**
 * Simple Token Bucket Rate Limiter
 * 
 * @param {Object} options - Configuration options
 * @param {number} options.maxTokens - Maximum number of tokens in bucket
 * @param {number} options.refillRate - Tokens added per second
 * @param {number} options.initialTokens - Initial token count (default: maxTokens)
 * @returns {Object} Rate limiter instance
 */
export function createRateLimiter(options = {}) {
  const {
    maxTokens = 10,
    refillRate = 2, // tokens per second
    initialTokens = maxTokens
  } = options;

  let tokens = initialTokens;
  let lastRefill = Date.now();
  const queue = [];
  let processing = false;

  /**
   * Refill tokens based on elapsed time
   */
  function refillTokens() {
    const now = Date.now();
    const elapsed = (now - lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * refillRate;
    
    tokens = Math.min(maxTokens, tokens + tokensToAdd);
    lastRefill = now;
  }

  /**
   * Process queued requests
   */
  function processQueue() {
    if (processing || queue.length === 0) return;
    
    processing = true;
    
    while (queue.length > 0) {
      refillTokens();
      
      if (tokens >= 1) {
        tokens -= 1;
        const { resolve } = queue.shift();
        resolve();
      } else {
        // Not enough tokens, wait a bit
        const waitTime = (1 - tokens) / refillRate * 1000;
        setTimeout(() => {
          processing = false;
          processQueue();
        }, waitTime);
        return;
      }
    }
    
    processing = false;
  }

  return {
    /**
     * Check if request can proceed immediately
     * @returns {boolean} True if request can proceed
     */
    check() {
      refillTokens();
      return tokens >= 1;
    },

    /**
     * Wait for token availability (returns promise that resolves when ready)
     * @returns {Promise<void>} Promise that resolves when token is available
     */
    async wait() {
      refillTokens();
      
      if (tokens >= 1) {
        tokens -= 1;
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        queue.push({ resolve });
        processQueue();
      });
    },

    /**
     * Get current token count
     * @returns {number} Current number of tokens
     */
    getTokens() {
      refillTokens();
      return tokens;
    },

    /**
     * Reset rate limiter
     */
    reset() {
      tokens = initialTokens;
      lastRefill = Date.now();
      queue.length = 0;
      processing = false;
    }
  };
}
