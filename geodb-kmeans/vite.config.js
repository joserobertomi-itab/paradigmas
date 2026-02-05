import { defineConfig } from 'vite';

/**
 * Vite configuration for GeoDB K-means project
 * 
 * IMPORTANT: SharedArrayBuffer requires Cross-Origin Isolation headers (COOP/COEP)
 * These headers are configured in the dev server to allow SharedArrayBuffer usage.
 * 
 * Without these headers, browsers will throw:
 * "SharedArrayBuffer is not available. Use HTTPS or localhost."
 * 
 * Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements
 */
export default defineConfig({
  server: {
    headers: {
      // Cross-Origin-Opener-Policy: same-origin
      // Required for SharedArrayBuffer to work
      'Cross-Origin-Opener-Policy': 'same-origin',
      
      // Cross-Origin-Embedder-Policy: require-corp
      // Required for SharedArrayBuffer to work
      'Cross-Origin-Embedder-Policy': 'require-corp',

      // Cross-Origin-Resource-Policy: same-origin
      // Required so worker scripts and assets load when COEP is enabled
      'Cross-Origin-Resource-Policy': 'same-origin'
    },
    // Ensure HTTPS is used in production (or localhost for dev)
    // SharedArrayBuffer only works with HTTPS or localhost
    https: false, // Set to true if you want HTTPS in dev (requires cert setup)
  },
  
  // Build configuration
  build: {
    target: 'esnext', // Use modern JS features
    minify: 'esbuild',
    sourcemap: false,
  },
  
  // Optimize dependencies
  optimizeDeps: {
    exclude: [], // Add any dependencies that shouldn't be pre-bundled
  }
});
