/**
 * Single-threaded K-means clustering implementation
 * Pure functions, no mutations, no DOM, no fetch
 */

import { toVector, validateCity } from './schema.js';
import { calculateMinMax, normalizeVectorMinMax } from './normalize.js';
import { euclideanDistanceSquared } from './distance.js';
import { randomInit } from './init.js';

/**
 * Assign each point to the nearest centroid
 * @param {Array<Array<number>>} vectors - Array of normalized vectors
 * @param {Array<Array<number>>} centroids - Array of centroid vectors
 * @returns {Array<number>} Assignment array (index = point index, value = cluster index)
 */
function assignPoints(vectors, centroids) {
  const assignments = new Array(vectors.length);

  for (let i = 0; i < vectors.length; i++) {
    const vector = vectors[i];
    let minDistance = Infinity;
    let nearestCluster = 0;

    for (let j = 0; j < centroids.length; j++) {
      const distance = euclideanDistanceSquared(vector, centroids[j]);
      if (distance < minDistance) {
        minDistance = distance;
        nearestCluster = j;
      }
    }

    assignments[i] = nearestCluster;
  }

  return assignments;
}

/**
 * Recompute centroids based on current assignments
 * @param {Array<Array<number>>} vectors - Array of normalized vectors
 * @param {Array<number>} assignments - Assignment array
 * @param {number} k - Number of clusters
 * @returns {Array<Array<number>>} New centroids
 */
function recomputeCentroids(vectors, assignments, k) {
  const dimensions = vectors[0].length;
  const sums = new Array(k).fill(null).map(() => new Array(dimensions).fill(0));
  const counts = new Array(k).fill(0);

  // Sum vectors for each cluster
  for (let i = 0; i < vectors.length; i++) {
    const clusterId = assignments[i];
    const vector = vectors[i];
    
    for (let d = 0; d < dimensions; d++) {
      sums[clusterId][d] += vector[d];
    }
    counts[clusterId]++;
  }

  // Compute new centroids (mean of points in each cluster)
  const newCentroids = [];
  for (let i = 0; i < k; i++) {
    if (counts[i] > 0) {
      const centroid = sums[i].map(sum => sum / counts[i]);
      newCentroids.push(centroid);
    } else {
      // Empty cluster - keep previous centroid (will be handled by caller)
      newCentroids.push(null);
    }
  }

  return newCentroids;
}

/**
 * Calculate average change in centroids
 * @param {Array<Array<number>>} oldCentroids - Previous centroids
 * @param {Array<Array<number>>} newCentroids - New centroids
 * @returns {number} Average change
 */
function calculateCentroidChange(oldCentroids, newCentroids) {
  let totalChange = 0;
  let validChanges = 0;

  for (let i = 0; i < oldCentroids.length; i++) {
    if (newCentroids[i] !== null) {
      const change = euclideanDistanceSquared(oldCentroids[i], newCentroids[i]);
      totalChange += Math.sqrt(change); // Convert squared distance to distance
      validChanges++;
    }
  }

  return validChanges > 0 ? totalChange / validChanges : Infinity;
}

/**
 * Check if assignments have changed
 * @param {Array<number>} oldAssignments - Previous assignments
 * @param {Array<number>} newAssignments - New assignments
 * @returns {boolean} True if assignments are the same
 */
function assignmentsStable(oldAssignments, newAssignments) {
  if (!oldAssignments || oldAssignments.length !== newAssignments.length) {
    return false;
  }

  for (let i = 0; i < oldAssignments.length; i++) {
    if (oldAssignments[i] !== newAssignments[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Run single-threaded K-means clustering
 * @param {Array<Object>} cities - Array of city objects with latitude, longitude, population
 * @param {number} k - Number of clusters
 * @param {Object} options - Configuration options
 * @param {number} options.maxIter - Maximum iterations (default: 100)
 * @param {number} options.epsilon - Convergence threshold (default: 0.0001)
 * @param {number} options.seed - Random seed for initialization (default: Date.now())
 * @param {Function} options.onProgress - Progress callback (iteration, converged, avgChange)
 * @returns {Object} Clustering results
 */
export function kmeansSingle(cities, k, options = {}) {
  const {
    maxIter = 100,
    epsilon = 0.0001,
    seed = Date.now(),
    onProgress = null
  } = options;

  // Validate inputs
  if (!cities || cities.length === 0) {
    throw new Error('No cities provided');
  }

  if (k <= 0 || k > cities.length) {
    throw new Error(`Invalid k: ${k}. Must be between 1 and ${cities.length}`);
  }

  // Validate and convert cities to vectors
  const validCities = cities.filter(validateCity);
  if (validCities.length === 0) {
    throw new Error('No valid cities found');
  }

  const vectors = validCities.map(toVector);

  // Normalize vectors using min-max normalization
  const normalizationParams = calculateMinMax(vectors);
  const normalizedVectors = vectors.map(v => normalizeVectorMinMax(v, normalizationParams));

  // Initialize centroids deterministically
  let centroids = randomInit(normalizedVectors, k, seed);

  // Main K-means loop
  let iterations = 0;
  let converged = false;
  let previousAssignments = null;
  let assignments = null;

  while (iterations < maxIter && !converged) {
    iterations++;

    // Assign points to nearest centroids
    assignments = assignPoints(normalizedVectors, centroids);

    // Recompute centroids
    const newCentroids = recomputeCentroids(normalizedVectors, assignments, k);

    // Handle empty clusters (reinitialize with random point)
    for (let i = 0; i < newCentroids.length; i++) {
      if (newCentroids[i] === null) {
        const randomIndex = Math.floor(Math.random() * normalizedVectors.length);
        newCentroids[i] = [...normalizedVectors[randomIndex]];
      }
    }

    // Calculate change in centroids
    const avgChange = calculateCentroidChange(centroids, newCentroids);
    centroids = newCentroids;

    // Check convergence
    const assignmentsChanged = !assignmentsStable(previousAssignments, assignments);
    converged = avgChange < epsilon || !assignmentsChanged;

    // Progress callback
    if (onProgress) {
      const clusterSizes = new Array(k).fill(0);
      for (const clusterId of assignments) {
        clusterSizes[clusterId]++;
      }

      onProgress({
        iteration: iterations,
        converged,
        avgChange,
        clusterSizes
      });
    }

    previousAssignments = assignments;

    if (converged) {
      break;
    }
  }

  // Denormalize centroids back to original scale
  const denormalizedCentroids = centroids.map(centroid => {
    const { min, max } = normalizationParams;
    return centroid.map((value, i) => {
      // Reverse min-max normalization: value * (max - min) + min
      return value * (max[i] - min[i]) + min[i];
    });
  });

  // Build cluster sizes
  const clusterSizes = new Array(k).fill(0);
  for (const clusterId of assignments) {
    clusterSizes[clusterId]++;
  }

  // Build final clusters with cities
  const clusters = [];
  const citiesByCluster = new Array(k).fill(null).map(() => []);

  for (let i = 0; i < validCities.length; i++) {
    const clusterId = assignments[i];
    citiesByCluster[clusterId].push(validCities[i]);
  }

  for (let i = 0; i < k; i++) {
    clusters.push({
      centroid: {
        latitude: denormalizedCentroids[i][0],
        longitude: denormalizedCentroids[i][1],
        population: denormalizedCentroids[i][2]
      },
      size: clusterSizes[i],
      cities: citiesByCluster[i]
    });
  }

  return {
    centroids: denormalizedCentroids.map(c => ({
      latitude: c[0],
      longitude: c[1],
      population: c[2]
    })),
    clusters,
    assignments,
    clusterSizes,
    iterations,
    converged
  };
}
