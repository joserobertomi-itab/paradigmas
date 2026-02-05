/**
 * Shared Memory for parallel city loading
 *
 * API returns city IDs as strings; SharedArrayBuffer only supports numeric types.
 * So string IDs live in idsLocal (main thread only); shared buffers hold numeric
 * data (lat, lng, pop) and localIndices (Int32). readCity(buffers, slot) returns
 * id from buffers.idsLocal[buffers.localIndices[slot]].
 *
 * Bulk load (fetch workers): each worker allocates a slot with Atomics, writes
 * lat/lng/pop and sets localIndices[slot] = slot, then sends { slot, id } to main.
 * Main thread fills idsLocal[slot] = id from city-ids messages. So after all
 * workers complete, idsLocal[0..count-1] and localIndices[0..count-1]=0..count-1
 * are consistent and getAllCities works.
 */

/**
 * Create shared buffers for city data
 * @param {number} capacity - Maximum number of cities to store
 * @returns {Object} Shared buffers and metadata
 */
export function createSharedCityBuffers(capacity) {
  // Check if SharedArrayBuffer is available
  if (typeof SharedArrayBuffer === 'undefined') {
    throw new Error(
      'SharedArrayBuffer is not available. ' +
      'Required: HTTPS or localhost + Cross-Origin Isolation headers (COOP/COEP). ' +
      'Check vite.config.js server headers configuration.'
    );
  }

  // Create SharedArrayBuffer for write index (atomic counter)
  const indexBuffer = new SharedArrayBuffer(4); // Int32 = 4 bytes
  const writeIndex = new Int32Array(indexBuffer);
  writeIndex[0] = 0; // Initialize to 0

  // Create SharedArrayBuffer for latitudes (Float64 = 8 bytes per value)
  const latBuffer = new SharedArrayBuffer(capacity * 8);
  const latitudes = new Float64Array(latBuffer);

  // Create SharedArrayBuffer for longitudes
  const lonBuffer = new SharedArrayBuffer(capacity * 8);
  const longitudes = new Float64Array(lonBuffer);

  // Create SharedArrayBuffer for populations (Float64 to handle large numbers)
  const popBuffer = new SharedArrayBuffer(capacity * 8);
  const populations = new Float64Array(popBuffer);

  // Create SharedArrayBuffer for local indices (Int32 = 4 bytes per value)
  // This stores the index into the idsLocal array in main thread
  const idxBuffer = new SharedArrayBuffer(capacity * 4);
  const localIndices = new Int32Array(idxBuffer);
  // Initialize with -1 to indicate empty slots
  localIndices.fill(-1);

  // Regular array for string IDs (not shared, only in main thread)
  const idsLocal = new Array(capacity);
  
  return {
    capacity,
    // Shared buffers
    indexBuffer,
    writeIndex,
    latBuffer,
    latitudes,
    lonBuffer,
    longitudes,
    popBuffer,
    populations,
    idxBuffer,
    localIndices,
    // Regular array for string IDs (main thread only)
    idsLocal
  };
}

/**
 * Get current write index atomically
 * @param {Int32Array} writeIndex - Atomic write index
 * @returns {number} Current index
 */
export function getWriteIndex(writeIndex) {
  return Atomics.load(writeIndex, 0);
}

/**
 * Atomically increment write index and return previous value
 * @param {Int32Array} writeIndex - Atomic write index
 * @returns {number} Previous index (slot to write to)
 */
export function allocateSlot(writeIndex) {
  return Atomics.add(writeIndex, 0, 1);
}

/**
 * Write city data to shared buffers
 * @param {Object} buffers - Shared buffers object
 * @param {Object} city - City object with id, latitude, longitude, population
 * @param {number} localIndex - Index in idsLocal array
 * @returns {number} Slot index where data was written
 */
export function writeCity(buffers, city, localIndex) {
  const slot = allocateSlot(buffers.writeIndex);
  
  if (slot >= buffers.capacity) {
    throw new Error(`Capacity exceeded: ${slot} >= ${buffers.capacity}`);
  }

  // Write data atomically
  buffers.latitudes[slot] = city.latitude || 0;
  buffers.longitudes[slot] = city.longitude || 0;
  buffers.populations[slot] = city.population || 0;
  buffers.localIndices[slot] = localIndex;

  return slot;
}

/**
 * Read city data from shared buffers
 * @param {Object} buffers - Shared buffers object
 * @param {number} slot - Slot index to read from
 * @returns {Object|null} City object or null if slot is empty
 */
export function readCity(buffers, slot) {
  if (slot < 0 || slot >= buffers.capacity) {
    return null;
  }

  const localIndex = buffers.localIndices[slot];
  if (localIndex < 0) {
    return null; // Empty slot
  }

  return {
    id: buffers.idsLocal[localIndex],
    latitude: buffers.latitudes[slot],
    longitude: buffers.longitudes[slot],
    population: buffers.populations[slot]
  };
}

/**
 * Get all cities from shared buffers
 * @param {Object} buffers - Shared buffers object
 * @returns {Array} Array of city objects
 */
export function getAllCities(buffers) {
  const count = getWriteIndex(buffers.writeIndex);
  const cities = [];

  for (let i = 0; i < Math.min(count, buffers.capacity); i++) {
    const city = readCity(buffers, i);
    if (city) {
      cities.push(city);
    }
  }

  return cities;
}
