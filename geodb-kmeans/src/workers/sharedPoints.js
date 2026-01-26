/**
 * Shared Memory for normalized vectors (points)
 * 
 * Creates SharedArrayBuffer for normalized vectors to avoid copying
 * data via postMessage in parallel K-means
 */

/**
 * Create shared buffers for normalized vectors
 * @param {Array<Array<number>>} vectors - Array of normalized 3D vectors [x, y, z]
 * @returns {Object} Shared buffers and metadata
 */
export function createSharedPoints(vectors) {
  // Check if SharedArrayBuffer is available
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'SharedArrayBuffer is not available. ' +
      'Required: HTTPS or localhost + Cross-Origin Isolation headers (COOP/COEP). ' +
      'Check vite.config.js server headers configuration.'
    );
  }

  if (!vectors || vectors.length === 0) {
    throw new Error('Vectors array is empty');
  }

  const length = vectors.length;
  const dimensions = vectors[0].length; // Should be 3 for [lat, lng, pop]

  // Create SharedArrayBuffer for each dimension (Float64 = 8 bytes per value)
  const xBuffer = new SharedArrayBuffer(length * 8); // Dimension 0 (latitude)
  const yBuffer = new SharedArrayBuffer(length * 8); // Dimension 1 (longitude)
  const zBuffer = new SharedArrayBuffer(length * 8); // Dimension 2 (population)

  // Create TypedArray views
  const xArray = new Float64Array(xBuffer);
  const yArray = new Float64Array(yBuffer);
  const zArray = new Float64Array(zBuffer);

  // Fill buffers with vector data
  for (let i = 0; i < length; i++) {
    const vector = vectors[i];
    xArray[i] = vector[0] || 0;
    yArray[i] = vector[1] || 0;
    zArray[i] = vector[2] || 0;
  }

  return {
    // Shared buffers
    xBuffer,
    yBuffer,
    zBuffer,
    // TypedArray views (for main thread access)
    xArray,
    yArray,
    zArray,
    // Metadata
    length,
    dimensions
  };
}

/**
 * Get metadata for a slice of shared points
 * @param {Object} sharedPoints - Shared points object from createSharedPoints
 * @param {number} start - Start index (inclusive)
 * @param {number} end - End index (exclusive)
 * @returns {Object} Metadata for the slice
 */
export function getSliceMeta(sharedPoints, start, end) {
  const { length } = sharedPoints;
  const clampedStart = Math.max(0, Math.min(start, length));
  const clampedEnd = Math.max(clampedStart, Math.min(end, length));
  const sliceLength = clampedEnd - clampedStart;

  return {
    xBuffer: sharedPoints.xBuffer,
    yBuffer: sharedPoints.yBuffer,
    zBuffer: sharedPoints.zBuffer,
    byteOffset: clampedStart * 8, // Float64 = 8 bytes
    length: sliceLength,
    startIndex: clampedStart
  };
}
