/**
 * K-means initialization methods
 */

/**
 * Simple random initialization with seed control
 * @param {Array<Object>} data - Array of data points
 * @param {number} k - Number of clusters
 * @param {number} seed - Random seed for reproducibility
 * @returns {Array<Object>} Initial centroids
 */
export function randomInit(data, k, seed = null) {
  if (!data || data.length === 0 || k <= 0) {
    return [];
  }

  if (k >= data.length) {
    // If k >= data.length, return all points as centroids
    return data.slice(0, k).map(p => ({
      latitude: p.latitude || 0,
      longitude: p.longitude || 0,
      population: p.population || 0
    }));
  }

  // Simple seeded random number generator
  let random = Math.random;
  if (seed !== null) {
    let seedValue = seed;
    random = () => {
      seedValue = (seedValue * 9301 + 49297) % 233280;
      return seedValue / 233280;
    };
  }

  const centroids = [];
  const usedIndices = new Set();

  for (let i = 0; i < k; i++) {
    let index;
    do {
      index = Math.floor(random() * data.length);
    } while (usedIndices.has(index));

    usedIndices.add(index);
    const point = data[index];
    centroids.push({
      latitude: point.latitude || 0,
      longitude: point.longitude || 0,
      population: point.population || 0
    });
  }

  return centroids;
}

/**
 * K-means++ initialization (better initial centroids)
 * @param {Array<Object>} data - Array of data points
 * @param {number} k - Number of clusters
 * @param {Function} distanceFn - Distance function
 * @param {Object} normalization - Normalization parameters
 * @returns {Array<Object>} Initial centroids
 */
export function kmeansPlusPlus(data, k, distanceFn, normalization = null) {
  if (!data || data.length === 0 || k <= 0) {
    return [];
  }

  if (k >= data.length) {
    return data.slice(0, k).map(p => ({
      latitude: p.latitude || 0,
      longitude: p.longitude || 0,
      population: p.population || 0
    }));
  }

  const centroids = [];
  
  // First centroid: random point
  const firstIndex = Math.floor(Math.random() * data.length);
  centroids.push({
    latitude: data[firstIndex].latitude || 0,
    longitude: data[firstIndex].longitude || 0,
    population: data[firstIndex].population || 0
  });

  // Select remaining k-1 centroids
  for (let i = 1; i < k; i++) {
    const distances = data.map(point => {
      // Find minimum distance to existing centroids
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = distanceFn(point, centroid, normalization);
        if (dist < minDist) {
          minDist = dist;
        }
      }
      return minDist;
    });

    // Calculate probabilities (squared distances)
    const probabilities = distances.map(d => d * d);
    const sum = probabilities.reduce((acc, p) => acc + p, 0);
    const normalizedProbs = probabilities.map(p => p / sum);

    // Select next centroid based on probabilities
    let random = Math.random();
    let cumulative = 0;
    let selectedIndex = 0;

    for (let j = 0; j < normalizedProbs.length; j++) {
      cumulative += normalizedProbs[j];
      if (random <= cumulative) {
        selectedIndex = j;
        break;
      }
    }

    centroids.push({
      latitude: data[selectedIndex].latitude || 0,
      longitude: data[selectedIndex].longitude || 0,
      population: data[selectedIndex].population || 0
    });
  }

  return centroids;
}
