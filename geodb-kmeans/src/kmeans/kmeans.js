/**
 * K-means clustering orchestrator
 * 
 * Coordinates parallel K-means clustering using workers
 */

import { randomInit } from './init.js';
import { calculateNormalization } from './distance.js';
import { createWorkerPool } from '../workers/workerPool.js';
import KmeansWorker from '../workers/kmeansWorker.js?worker&inline';

/**
 * Run K-means clustering with parallel workers
 * @param {Object} buffers - Shared memory buffers from sharedMemory.js
 * @param {number} k - Number of clusters
 * @param {Object} options - Configuration options
 * @param {number} options.maxIter - Maximum iterations (default: 100)
 * @param {number} options.epsilon - Convergence threshold (default: 0.0001)
 * @param {number} options.workerCount - Number of workers (default: 4)
 * @param {Function} options.onProgress - Progress callback
 * @param {AbortSignal} [options.signal] - AbortSignal for cancellation (pool terminated on abort)
 * @returns {Promise<Object>} Clustering results
 */
export async function kmeans(buffers, k, options = {}) {
  const {
    maxIter = 100,
    epsilon = 0.0001,
    workerCount = 4,
    onProgress = null,
    isCancelled = () => false,
    onPoolCreated = null,
    signal = null
  } = options;

  const totalPoints = buffers.writeIndex[0];
  if (totalPoints === 0) {
    throw new Error('No points available for clustering');
  }

  if (k <= 0 || k > totalPoints) {
    throw new Error(`Invalid k: ${k}. Must be between 1 and ${totalPoints}`);
  }

  // Calculate normalization parameters
  const sampleSize = Math.min(1000, totalPoints);
  const samplePoints = [];
  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.floor((i / sampleSize) * totalPoints);
    samplePoints.push({
      latitude: buffers.latitudes[idx],
      longitude: buffers.longitudes[idx],
      population: buffers.populations[idx]
    });
  }
  const normalization = calculateNormalization(samplePoints);

  // Initialize centroids
  const allPoints = [];
  for (let i = 0; i < totalPoints; i++) {
    allPoints.push({
      latitude: buffers.latitudes[i],
      longitude: buffers.longitudes[i],
      population: buffers.populations[i]
    });
  }
  let centroids = randomInit(allPoints, k, Date.now());

  // Create worker pool (Vite ?worker for correct bundling)
  const pool = createWorkerPool({ size: workerCount, WorkerConstructor: KmeansWorker });
  
  // Notify pool creation for cancellation support
  if (onPoolCreated) {
    onPoolCreated(pool);
  }

  let iterations = 0;
  let converged = false;
  let previousAssignments = null;

  try {
    while (iterations < maxIter && !converged) {
      // Check for cancellation (state flag or AbortSignal)
      if (isCancelled() || signal?.aborted) {
        pool.terminate();
        throw new Error('K-means cancelled');
      }
      
      iterations++;

      // Divide work among workers
      const chunkSize = Math.ceil(totalPoints / workerCount);
      const workerPromises = [];

      for (let w = 0; w < workerCount; w++) {
        const startIndex = w * chunkSize;
        const endIndex = Math.min(startIndex + chunkSize, totalPoints);

        if (startIndex >= totalPoints) break;

        const promise = pool.runTask({
          centroids,
          startIndex,
          endIndex,
          sharedBuffers: {
            latitudes: buffers.latitudes,
            longitudes: buffers.longitudes,
            populations: buffers.populations
          },
          normalization
        });

        workerPromises.push(promise);
      }

      // Wait for all workers to complete
      const results = await Promise.allSettled(workerPromises);

      // Reduce: combine partial sums from all workers
      const sumLat = new Array(k).fill(0);
      const sumLon = new Array(k).fill(0);
      const sumPop = new Array(k).fill(0);
      const counts = new Array(k).fill(0);
      const allAssignments = new Array(totalPoints);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { sumLat: sl, sumLon: slo, sumPop: sp, counts: c, assignments, startIndex } = result.value;
          
          // Accumulate sums
          for (let i = 0; i < k; i++) {
            sumLat[i] += sl[i];
            sumLon[i] += slo[i];
            sumPop[i] += sp[i];
            counts[i] += c[i];
          }

          // Store assignments
          for (let i = 0; i < assignments.length; i++) {
            allAssignments[startIndex + i] = assignments[i];
          }
        }
      }

      // Update centroids
      const newCentroids = [];
      let totalChange = 0;

      for (let i = 0; i < k; i++) {
        if (counts[i] > 0) {
          const newCentroid = {
            latitude: sumLat[i] / counts[i],
            longitude: sumLon[i] / counts[i],
            population: sumPop[i] / counts[i]
          };
          newCentroids.push(newCentroid);

          // Calculate change from previous centroid
          const oldCentroid = centroids[i];
          const change = Math.sqrt(
            Math.pow(newCentroid.latitude - oldCentroid.latitude, 2) +
            Math.pow(newCentroid.longitude - oldCentroid.longitude, 2) +
            Math.pow(newCentroid.population - oldCentroid.population, 2)
          );
          totalChange += change;
        } else {
          // Empty cluster - keep old centroid or reinitialize
          newCentroids.push(centroids[i]);
        }
      }

      centroids = newCentroids;

      // Check convergence
      const avgChange = totalChange / k;
      const assignmentsStable = previousAssignments && 
        allAssignments.every((a, i) => a === previousAssignments[i]);

      converged = avgChange < epsilon || assignmentsStable;

      // Progress callback
      if (onProgress) {
        onProgress({
          iteration: iterations,
          converged,
          avgChange,
          centroids,
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

    // Build final clusters with sample cities for visualization
    const clusters = [];
    const citySamples = new Array(k).fill(null).map(() => []);

    // Collect sample cities per cluster (max 30 per cluster)
    for (let i = 0; i < totalPoints && i < previousAssignments.length; i++) {
      const clusterId = previousAssignments[i];
      if (citySamples[clusterId].length < 30) {
        const localIndex = buffers.localIndices[i];
        if (localIndex >= 0 && buffers.idsLocal[localIndex]) {
          citySamples[clusterId].push({
            id: buffers.idsLocal[localIndex],
            latitude: buffers.latitudes[i],
            longitude: buffers.longitudes[i],
            population: buffers.populations[i]
          });
        }
      }
    }

    // Build cluster objects
    for (let i = 0; i < k; i++) {
      clusters.push({
        centroid: centroids[i],
        size: counts[i],
        cities: citySamples[i]
      });
    }

    return {
      centroids,
      clusters,
      iterations,
      converged,
      clusterSizes: counts
    };
  } catch (error) {
    pool.terminate();
    throw error;
  }
}
