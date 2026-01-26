/**
 * Schema and validation for city data
 * Pure functions for data transformation
 */

/**
 * Convert city object to 3D vector [latitude, longitude, population]
 * @param {Object} city - City object with latitude, longitude, population
 * @returns {Array<number>} 3D vector [lat, lng, pop]
 */
export function toVector(city) {
  if (!city) {
    return [0, 0, 0];
  }

  return [
    parseFloat(city.latitude) || 0,
    parseFloat(city.longitude) || 0,
    parseFloat(city.population) || 0
  ];
}

/**
 * Validate city object has required fields
 * @param {Object} city - City object to validate
 * @returns {boolean} True if city is valid
 */
export function validateCity(city) {
  if (!city || typeof city !== 'object') {
    return false;
  }

  // Check that latitude, longitude, and population are present and numeric
  const lat = city.latitude;
  const lng = city.longitude;
  const pop = city.population;

  // Allow 0 values, but check that they are numbers
  return (
    (lat !== undefined && lat !== null && !isNaN(parseFloat(lat))) &&
    (lng !== undefined && lng !== null && !isNaN(parseFloat(lng))) &&
    (pop !== undefined && pop !== null && !isNaN(parseFloat(pop)))
  );
}
