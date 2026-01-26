/**
 * K-means initialization methods
 * Pure functions for deterministic centroid initialization
 */

/**
 * Seeded random number generator (Linear Congruential Generator)
 * @param {number} seed - Initial seed value
 * @returns {Function} Random number generator function
 */
function createSeededRandom(seed) {
  let state = seed;
  return () => {
    // LCG parameters (same as used in many systems)
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

/**
 * Deterministic random initialization with seed
 * @param {Array<Array<number>>} vectors - Array of 3D vectors
 * @param {number} k - Number of clusters
 * @param {number} seed - Random seed for reproducibility
 * @returns {Array<Array<number>>} Initial centroids as vectors
 */
export function randomInit(vectors, k, seed = null) {
  if (!vectors || vectors.length === 0 || k <= 0) {
    return [];
  }

  if (k >= vectors.length) {
    // If k >= vectors.length, return all vectors as centroids
    return vectors.slice(0, k).map(v => [...v]); // Copy vectors
  }

  // Create seeded random generator
  const random = seed !== null ? createSeededRandom(seed) : Math.random;

  const centroids = [];
  const usedIndices = new Set();

  for (let i = 0; i < k; i++) {
    let index;
    do {
      index = Math.floor(random() * vectors.length);
    } while (usedIndices.has(index));

    usedIndices.add(index);
    // Copy vector to avoid mutation
    centroids.push([...vectors[index]]);
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
