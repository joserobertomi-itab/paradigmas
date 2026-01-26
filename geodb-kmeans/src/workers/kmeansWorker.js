/**
 * K-means Worker
 * 
 * Processes a slice of normalized vectors from SharedArrayBuffer
 * Calculates nearest centroid for each point and accumulates sums
 */

/**
 * Calculate Euclidean distance squared between two vectors
 * @param {number} x1 - X coordinate of first point
 * @param {number} y1 - Y coordinate of first point
 * @param {number} z1 - Z coordinate of first point
 * @param {Array<number>} centroid - Centroid vector [x, y, z]
 * @returns {number} Squared Euclidean distance
 */
function euclideanDistanceSquared(x1, y1, z1, centroid) {
  const dx = x1 - centroid[0];
  const dy = y1 - centroid[1];
  const dz = z1 - centroid[2];
  return dx * dx + dy * dy + dz * dz;
}

self.onmessage = function(e) {
  const { taskId, payload } = e.data;
  const {
    sab,         // SharedArrayBuffer metadata { xBuffer, yBuffer, zBuffer, byteOffset, length, startIndex }
    centroids,   // Array of centroid vectors [x, y, z]
    k            // Number of clusters
  } = payload;

  try {
    // Reconstruct TypedArray views from SharedArrayBuffer
    // Note: SharedArrayBuffer is automatically shared, we just create views
    const xArray = new Float64Array(sab.xBuffer, sab.byteOffset, sab.length);
    const yArray = new Float64Array(sab.yBuffer, sab.byteOffset, sab.length);
    const zArray = new Float64Array(sab.zBuffer, sab.byteOffset, sab.length);

    // Initialize accumulation arrays (local to worker)
    const sumX = new Array(k).fill(0);  // Sum of dimension 0 (x/lat)
    const sumY = new Array(k).fill(0);  // Sum of dimension 1 (y/lng)
    const sumZ = new Array(k).fill(0);  // Sum of dimension 2 (z/pop)
    const counts = new Array(k).fill(0);
    const assignments = []; // Local assignments for this slice

    // Process each point in the range [start, end)
    for (let i = 0; i < sab.length; i++) {
      const x = xArray[i];
      const y = yArray[i];
      const z = zArray[i];

      // Find nearest centroid
      let minDistance = Infinity;
      let nearestCluster = 0;

      for (let j = 0; j < k; j++) {
        const distance = euclideanDistanceSquared(x, y, z, centroids[j]);
        if (distance < minDistance) {
          minDistance = distance;
          nearestCluster = j;
        }
      }

      // Accumulate sums for this cluster
      sumX[nearestCluster] += x;
      sumY[nearestCluster] += y;
      sumZ[nearestCluster] += z;
      counts[nearestCluster]++;

      assignments.push(nearestCluster);
    }

    // Send results back to main thread
    self.postMessage({
      taskId,
      type: 'task-complete',
      payload: {
        sumX,
        sumY,
        sumZ,
        counts,
        assignments,
        startIndex: sab.startIndex,
        vectorCount: sab.length
      }
    });
  } catch (error) {
    self.postMessage({
      taskId,
      type: 'task-error',
      error: error.message || String(error)
    });
  }
};
