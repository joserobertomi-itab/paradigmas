/**
 * Mathematical utility functions
 */

/**
 * Calculate mean of values
 * @param {Array<number>} values - Array of numbers
 * @returns {number} Mean value
 */
export function mean(values) {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Calculate variance of values
 * @param {Array<number>} values - Array of numbers
 * @returns {number} Variance
 */
export function variance(values) {
  if (!values || values.length === 0) return 0;
  const m = mean(values);
  const squaredDiffs = values.map(val => Math.pow(val - m, 2));
  return mean(squaredDiffs);
}

/**
 * Calculate standard deviation
 * @param {Array<number>} values - Array of numbers
 * @returns {number} Standard deviation
 */
export function stdDev(values) {
  return Math.sqrt(variance(values));
}
