/**
 * Parallel K-means clustering orchestrator
 * 
 * Divides work among Web Workers and reduces results
 */

import { toVector, validateCity } from './schema.js';
import { calculateMinMax, normalizeVectorMinMax } from './normalize.js';
import { euclideanDistanceSquared } from './distance.js';
import { randomInit } from './init.js';
import { createWorkerPool } from '../workers/workerPool.js';
import { createSharedPoints, getSliceMeta } from '../workers/sharedPoints.js';

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
      totalChange += Math.sqrt(change);
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
 * Run parallel K-means clustering using Web Workers
 * @param {Array<Object>} cities - Array of city objects with latitude, longitude, population
 * @param {number} k - Number of clusters
 * @param {Object} options - Configuration options
 * @param {number} options.maxIter - Maximum iterations (default: 100)
 * @param {number} options.epsilon - Convergence threshold (default: 0.0001)
 * @param {number} options.seed - Random seed for initialization (default: Date.now())
 * @param {number} options.workerCount - Number of workers (default: 4)
 * @param {Function} options.onProgress - Progress callback
 * @param {Function} options.isCancelled - Cancellation check function
 * @param {Function} options.onPoolCreated - Callback when pool is created
 * @returns {Promise<Object>} Clustering results
 */
export async function kmeansParallel(cities, k, options = {}) {
  const {
    maxIter = 100,
    epsilon = 0.0001,
    seed = Date.now(),
    workerCount = 4,
    onProgress = null,
    isCancelled = () => false,
    onPoolCreated = null
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

  // Create SharedArrayBuffer for normalized vectors (once, shared across all workers)
  const sharedPoints = createSharedPoints(normalizedVectors);

  // Initialize centroids deterministically
  let centroids = randomInit(normalizedVectors, k, seed);

  // Create worker pool
  const workerUrl = new URL('../workers/kmeansWorker.js', import.meta.url).href;
  const pool = createWorkerPool({ size: workerCount, workerUrl });

  // Notify pool creation
  if (onPoolCreated) {
    onPoolCreated(pool);
  }

  // Main K-means loop
  let iterations = 0;
  let converged = false;
  let previousAssignments = null;
  let allAssignments = null;

  try {
    while (iterations < maxIter && !converged) {
      // Check for cancellation
      if (isCancelled()) {
        pool.terminate();
        throw new Error('K-means cancelled');
      }

      iterations++;

      // Divide work among workers
      const chunkSize = Math.ceil(normalizedVectors.length / workerCount);
      const workerPromises = [];

      for (let w = 0; w < workerCount; w++) {
        const startIdx = w * chunkSize;
        const endIdx = Math.min(startIdx + chunkSize, normalizedVectors.length);

        if (startIdx >= normalizedVectors.length) break;

        // Get slice metadata from SharedArrayBuffer (no copying!)
        const sliceMeta = getSliceMeta(sharedPoints, startIdx, endIdx);

        const promise = pool.runTask({
          sab: sliceMeta,      // SharedArrayBuffer metadata (automatically shared)
          centroids: centroids, // Current centroids
          k: k                 // Number of clusters
        });

        workerPromises.push(promise);
      }

      // Wait for all workers to complete
      const results = await Promise.allSettled(workerPromises);

      // Check for errors
      const errors = results.filter(r => r.status === 'rejected');
      if (errors.length > 0) {
        pool.terminate();
        throw new Error(`Worker errors: ${errors.map(e => e.reason?.message || e.reason).join(', ')}`);
      }

      // Reduce: combine partial sums from all workers
      const sumX = new Array(k).fill(0);
      const sumY = new Array(k).fill(0);
      const sumZ = new Array(k).fill(0);
      const counts = new Array(k).fill(0);
      allAssignments = new Array(normalizedVectors.length);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { sumX: sx, sumY: sy, sumZ: sz, counts: c, assignments, startIndex } = result.value;

          // Accumulate sums
          for (let i = 0; i < k; i++) {
            sumX[i] += sx[i];
            sumY[i] += sy[i];
            sumZ[i] += sz[i];
            counts[i] += c[i];
          }

          // Store assignments
          for (let i = 0; i < assignments.length; i++) {
            allAssignments[startIndex + i] = assignments[i];
          }
        }
      }

      // Recompute centroids
      const newCentroids = [];
      for (let i = 0; i < k; i++) {
        if (counts[i] > 0) {
          newCentroids.push([
            sumX[i] / counts[i],
            sumY[i] / counts[i],
            sumZ[i] / counts[i]
          ]);
        } else {
          // Empty cluster - reinitialize with random point
          const randomIndex = Math.floor(Math.random() * normalizedVectors.length);
          newCentroids.push([...normalizedVectors[randomIndex]]);
        }
      }

      // Calculate change in centroids
      const avgChange = calculateCentroidChange(centroids, newCentroids);
      centroids = newCentroids;

      // Check convergence
      const assignmentsChanged = !assignmentsStable(previousAssignments, allAssignments);
      converged = avgChange < epsilon || !assignmentsChanged;

      // Progress callback
      if (onProgress) {
        onProgress({
          iteration: iterations,
          converged,
          avgChange,
          clusterSizes: counts
        });
      }

      previousAssignments = allAssignments;

      if (converged) {
        break;
      }
    }

    // Terminate pool
    pool.terminate();

    // Denormalize centroids back to original scale
    const denormalizedCentroids = centroids.map(centroid => {
      const { min, max } = normalizationParams;
      return centroid.map((value, i) => {
        return value * (max[i] - min[i]) + min[i];
      });
    });

    // Build cluster sizes
    const clusterSizes = new Array(k).fill(0);
    for (const clusterId of allAssignments) {
      clusterSizes[clusterId]++;
    }

    // Build final clusters with cities
    const clusters = [];
    const citiesByCluster = new Array(k).fill(null).map(() => []);

    for (let i = 0; i < validCities.length; i++) {
      const clusterId = allAssignments[i];
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
      assignments: allAssignments,
      clusterSizes,
      iterations,
      converged
    };
  } catch (error) {
    pool.terminate();
    throw error;
  }
}
