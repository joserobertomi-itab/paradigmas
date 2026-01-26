/**
 * Distance functions for K-means clustering
 * 
 * Pure functions for calculating distances between vectors
 */

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

  let sumSquaredDiffs = 0;
  for (let i = 0; i < vector1.length; i++) {
    const diff = vector1[i] - vector2[i];
    sumSquaredDiffs += diff * diff;
  }

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

  let sumSquaredDiffs = 0;
  for (let i = 0; i < vector1.length; i++) {
    const diff = vector1[i] - vector2[i];
    sumSquaredDiffs += diff * diff;
  }

  return sumSquaredDiffs;
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

  let lat1 = point1.latitude || 0;
  let lon1 = point1.longitude || 0;
  let pop1 = point1.population || 0;

  let lat2 = point2.latitude || 0;
  let lon2 = point2.longitude || 0;
  let pop2 = point2.population || 0;

  // Apply normalization if provided
  if (normalization) {
    lat1 = normalize(lat1, normalization.latMin, normalization.latMax);
    lon1 = normalize(lon1, normalization.lonMin, normalization.lonMax);
    pop1 = normalize(pop1, normalization.popMin, normalization.popMax);

    lat2 = normalize(lat2, normalization.latMin, normalization.latMax);
    lon2 = normalize(lon2, normalization.lonMin, normalization.lonMax);
    pop2 = normalize(pop2, normalization.popMin, normalization.popMax);
  }

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
