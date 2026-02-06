/**
 * Normalization functions for K-means clustering
 * Pure functions for data normalization (min-max and z-score)
 */

/**
 * Min-Max normalization: scale values to [0, 1] range
 * @param {number} value - Value to normalize
 * @param {number} min - Minimum value in dataset
 * @param {number} max - Maximum value in dataset
 * @returns {number} Normalized value in [0, 1]
 */
export function minMaxNormalize(value, min, max) {
  if (max === min) {
    return 0.5; // Avoid division by zero, return middle value
  }
  return (value - min) / (max - min);
}

/**
 * Z-score normalization: standardize to mean=0, std=1
 * @param {number} value - Value to normalize
 * @param {number} mean - Mean value in dataset
 * @param {number} stdDev - Standard deviation in dataset
 * @returns {number} Normalized value (z-score)
 */
export function zScoreNormalize(value, mean, stdDev) {
  if (stdDev === 0) {
    return 0; // Avoid division by zero
  }
  return (value - mean) / stdDev;
}

/**
 * Calculate min and max for each dimension from dataset
 * @param {Array<Array<number>>} vectors - Array of 3D vectors
 * @returns {Object} Min and max for each dimension
 */
export function calculateMinMax(vectors) {
  if (!vectors || vectors.length === 0) {
    return {
      min: [0, 0, 0],
      max: [1, 1, 1]
    };
  }

  const dimensions = vectors[0].length;
  const init = { mins: Array.from({ length: dimensions }, () => Infinity), maxs: Array.from({ length: dimensions }, () => -Infinity) };
  const { mins, maxs } = vectors.reduce((acc, vector) => {
    for (let i = 0; i < dimensions; i++) {
      const value = vector[i];
      if (value < acc.mins[i]) acc.mins[i] = value;
      if (value > acc.maxs[i]) acc.maxs[i] = value;
    }
    return acc;
  }, init);

  return { min: mins, max: maxs };
}

/**
 * Calculate mean and standard deviation for each dimension
 * @param {Array<Array<number>>} vectors - Array of 3D vectors
 * @returns {Object} Mean and stdDev for each dimension
 */
export function calculateMeanStd(vectors) {
  if (!vectors || vectors.length === 0) {
    return {
      mean: [0, 0, 0],
      stdDev: [1, 1, 1]
    };
  }

  const dimensions = vectors[0].length;
  const sumReducer = (acc, vector) => {
    for (let i = 0; i < dimensions; i++) {
      acc[i] += vector[i];
    }
    return acc;
  };
  const sums = vectors.reduce(sumReducer, Array.from({ length: dimensions }, () => 0));
  const means = sums.map(s => s / vectors.length);

  const sumSqReducer = (acc, vector) => {
    for (let i = 0; i < dimensions; i++) {
      const diff = vector[i] - means[i];
      acc[i] += diff * diff;
    }
    return acc;
  };
  const sumSqDiffs = vectors.reduce(sumSqReducer, Array.from({ length: dimensions }, () => 0));
  const stdDevs = sumSqDiffs.map(s => Math.sqrt(s / vectors.length));

  return { mean: means, stdDev: stdDevs };
}

/**
 * Normalize a vector using min-max normalization
 * @param {Array<number>} vector - Vector to normalize
 * @param {Object} params - Normalization parameters { min, max }
 * @returns {Array<number>} Normalized vector
 */
export function normalizeVectorMinMax(vector, params) {
  const { min, max } = params;
  return vector.map((value, i) => minMaxNormalize(value, min[i], max[i]));
}

/**
 * Normalize a vector using z-score normalization
 * @param {Array<number>} vector - Vector to normalize
 * @param {Object} params - Normalization parameters { mean, stdDev }
 * @returns {Array<number>} Normalized vector
 */
export function normalizeVectorZScore(vector, params) {
  const { mean, stdDev } = params;
  return vector.map((value, i) => zScoreNormalize(value, mean[i], stdDev[i]));
}
