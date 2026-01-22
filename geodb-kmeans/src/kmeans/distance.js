/**
 * Distance functions for K-means clustering
 * 
 * Uses 3D Euclidean distance: (latitude, longitude, population)
 * with simple normalization to handle different scales
 */

/**
 * Normalize a value to [0, 1] range
 * @param {number} value - Value to normalize
 * @param {number} min - Minimum value in dataset
 * @param {number} max - Maximum value in dataset
 * @returns {number} Normalized value [0, 1]
 */
function normalize(value, min, max) {
  if (max === min) return 0.5; // Avoid division by zero
  return (value - min) / (max - min);
}

/**
 * Calculate Euclidean distance in 3D space (lat, lon, pop) with normalization
 * @param {Object} point1 - Point with latitude, longitude, population
 * @param {Object} point2 - Point with latitude, longitude, population
 * @param {Object} normalization - Normalization parameters { latMin, latMax, lonMin, lonMax, popMin, popMax }
 * @returns {number} Euclidean distance
 */
export function euclideanDistance(point1, point2, normalization = null) {
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

  // Calculate 3D Euclidean distance
  const dLat = lat1 - lat2;
  const dLon = lon1 - lon2;
  const dPop = pop1 - pop2;

  return Math.sqrt(dLat * dLat + dLon * dLon + dPop * dPop);
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
