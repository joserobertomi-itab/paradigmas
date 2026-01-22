/**
 * K-means Worker
 * 
 * Processes a range of points from shared memory buffers
 * Calculates nearest centroid for each point and accumulates sums
 */

/**
 * Calculate Euclidean distance squared (faster, same ordering)
 */
function distanceSquared(point, centroid, normalization) {
  let lat1 = point.latitude || 0;
  let lon1 = point.longitude || 0;
  let pop1 = point.population || 0;
  
  let lat2 = centroid.latitude || 0;
  let lon2 = centroid.longitude || 0;
  let pop2 = centroid.population || 0;

  // Apply normalization if provided
  if (normalization) {
    const normalize = (val, min, max) => (max === min ? 0.5 : (val - min) / (max - min));
    lat1 = normalize(lat1, normalization.latMin, normalization.latMax);
    lon1 = normalize(lon1, normalization.lonMin, normalization.lonMax);
    pop1 = normalize(pop1, normalization.popMin, normalization.popMax);
    lat2 = normalize(lat2, normalization.latMin, normalization.latMax);
    lon2 = normalize(lon2, normalization.lonMin, normalization.lonMax);
    pop2 = normalize(pop2, normalization.popMin, normalization.popMax);
  }

  const dLat = lat1 - lat2;
  const dLon = lon1 - lon2;
  const dPop = pop1 - pop2;

  return dLat * dLat + dLon * dLon + dPop * dPop;
}

self.onmessage = function(e) {
  const { taskId, payload } = e.data;
  const {
    centroids,
    startIndex,
    endIndex,
    sharedBuffers,
    normalization
  } = payload;

  try {
    const k = centroids.length;
    
    // Initialize accumulation arrays (not shared, local to worker)
    const sumLat = new Array(k).fill(0);
    const sumLon = new Array(k).fill(0);
    const sumPop = new Array(k).fill(0);
    const counts = new Array(k).fill(0);
    const assignments = []; // Store assignments for this chunk

    // Process each point in the range
    for (let i = startIndex; i < endIndex; i++) {
      // Read point from shared buffers
      const point = {
        latitude: sharedBuffers.latitudes[i],
        longitude: sharedBuffers.longitudes[i],
        population: sharedBuffers.populations[i]
      };

      // Find nearest centroid
      let minDist = Infinity;
      let nearestCluster = 0;

      for (let j = 0; j < k; j++) {
        const dist = distanceSquared(point, centroids[j], normalization);
        if (dist < minDist) {
          minDist = dist;
          nearestCluster = j;
        }
      }

      // Accumulate sums for this cluster
      sumLat[nearestCluster] += point.latitude;
      sumLon[nearestCluster] += point.longitude;
      sumPop[nearestCluster] += point.population;
      counts[nearestCluster]++;

      assignments.push(nearestCluster);
    }

    // Send results back to main thread
    self.postMessage({
      taskId,
      type: 'task-complete',
      payload: {
        sumLat,
        sumLon,
        sumPop,
        counts,
        assignments,
        startIndex,
        endIndex
      }
    });
  } catch (error) {
    self.postMessage({
      taskId,
      type: 'task-error',
      error: error.message
    });
  }
};
