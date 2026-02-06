/**
 * Distance functions for K-means clustering
 * Pure functions for calculating distances between vectors
 */

import { minMaxNormalize } from './normalize.js';

/**
 * Calculate Euclidean distance between two 3D vectors
 * @param {Array<number>} vector1 - First vector [x, y, z]
 * @param {Array<number>} vector2 - Second vector [x, y, z]
 * @returns {number} Euclidean distance
 */
export function euclideanDistance(vector1, vector2) {
  if (!vector1 || !vector2 || vector1.length !== vector2.length) {
    return Infinity;
  }
  const sumSquaredDiffs = vector1.reduce(
    (sum, _, i) => sum + (vector1[i] - vector2[i]) ** 2,
    0
  );
  return Math.sqrt(sumSquaredDiffs);
}

/**
 * Calculate squared Euclidean distance (faster, avoids sqrt)
 * @param {Array<number>} vector1 - First vector
 * @param {Array<number>} vector2 - Second vector
 * @returns {number} Squared Euclidean distance
 */
export function euclideanDistanceSquared(vector1, vector2) {
  if (!vector1 || !vector2 || vector1.length !== vector2.length) {
    return Infinity;
  }
  return vector1.reduce(
    (sum, _, i) => sum + (vector1[i] - vector2[i]) ** 2,
    0
  );
}

/**
 * Calculate Manhattan distance (L1 norm)
 * @param {Object} point1 - Point with latitude, longitude, population
 * @param {Object} point2 - Point with latitude, longitude, population
 * @param {Object} normalization - Normalization parameters
 * @returns {number} Manhattan distance
 */
export function manhattanDistance(point1, point2, normalization = null) {
  if (!point1 || !point2) return Infinity;

  const coord = (p, key) => {
    const v = p[key] || 0;
    if (!normalization) return v;
    const minKey = key === 'latitude' ? 'latMin' : key === 'longitude' ? 'lonMin' : 'popMin';
    const maxKey = key === 'latitude' ? 'latMax' : key === 'longitude' ? 'lonMax' : 'popMax';
    return minMaxNormalize(v, normalization[minKey], normalization[maxKey]);
  };
  const lat1 = coord(point1, 'latitude');
  const lon1 = coord(point1, 'longitude');
  const pop1 = coord(point1, 'population');
  const lat2 = coord(point2, 'latitude');
  const lon2 = coord(point2, 'longitude');
  const pop2 = coord(point2, 'population');

  return Math.abs(lat1 - lat2) + Math.abs(lon1 - lon2) + Math.abs(pop1 - pop2);
}

/**
 * Calculate normalization parameters from dataset
 * @param {Array<Object>} points - Array of points with latitude, longitude, population
 * @returns {Object} Normalization parameters
 */
export function calculateNormalization(points) {
  if (!points || points.length === 0) {
    return {
      latMin: -90, latMax: 90,
      lonMin: -180, lonMax: 180,
      popMin: 0, popMax: 1
    };
  }

  const latitudes = points.map(p => p.latitude || 0);
  const longitudes = points.map(p => p.longitude || 0);
  const populations = points.map(p => p.population || 0);

  return {
    latMin: Math.min(...latitudes),
    latMax: Math.max(...latitudes),
    lonMin: Math.min(...longitudes),
    lonMax: Math.max(...longitudes),
    popMin: Math.min(...populations),
    popMax: Math.max(...populations)
  };
}
