/**
 * Worker for fetching cities in parallel
 * 
 * This worker fetches pages in a strided pattern:
 * Worker i fetches offsets: i*pageSize, (i+W)*pageSize, (i+2W)*pageSize...
 * where W is the number of workers.
 * 
 * Note: This file must be loaded as a module worker (type: 'module')
 */

// Import shared memory functions
// Note: In a real implementation, you might need to bundle these or use importScripts
// For now, we'll use the functions directly assuming they're available

/**
 * Atomically increment write index and return previous value
 */
function allocateSlot(writeIndex) {
  return Atomics.add(writeIndex, 0, 1);
}

/**
 * Write city data to shared buffers
 */
function writeCity(sharedBuffers, city, localIndex) {
  const slot = allocateSlot(sharedBuffers.writeIndex);
  
  if (slot >= sharedBuffers.capacity) {
    throw new Error(`Capacity exceeded: ${slot} >= ${sharedBuffers.capacity}`);
  }

  // Write data atomically
  sharedBuffers.latitudes[slot] = city.latitude || 0;
  sharedBuffers.longitudes[slot] = city.longitude || 0;
  sharedBuffers.populations[slot] = city.population || 0;
  sharedBuffers.localIndices[slot] = localIndex;

  return slot;
}

// Rate limiting configuration
const MAX_CONCURRENT_REQUESTS = 2; // Max concurrent requests per worker
const REQUEST_DELAY_MS = 500; // Base delay between requests
const JITTER_MS = 200; // Random jitter to avoid thundering herd

let requestQueue = [];
let activeRequests = 0;

/**
 * Add jitter to delay
 */
function jitteredDelay(baseDelay) {
  const jitter = Math.random() * JITTER_MS;
  return baseDelay + jitter;
}

/**
 * Process request queue
 */
async function processQueue() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) {
    return;
  }

  const request = requestQueue.shift();
  activeRequests++;

  try {
    await request();
  } finally {
    activeRequests--;
    // Process next request after delay
    setTimeout(() => processQueue(), jitteredDelay(REQUEST_DELAY_MS));
  }
}

/**
 * Fetch cities from API with rate limiting
 */
async function fetchCitiesPage({ apiKey, apiHost, sort, offset, limit }) {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString(),
          types: 'CITY',
          sort: sort,
          order: 'desc'
        });

        const url = `https://${apiHost}/v1/geo/cities?${params.toString()}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': apiKey,
            'X-RapidAPI-Host': apiHost
          }
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    processQueue();
  });
}

/**
 * Normalize city data
 */
function normalizeCity(city) {
  return {
    id: String(city.id || city.wikiDataId || city.code || ''),
    name: city.name || '',
    country: city.country || city.countryCode || '',
    latitude: parseFloat(city.latitude) || 0,
    longitude: parseFloat(city.longitude) || 0,
    population: parseInt(city.population, 10) || 0
  };
}

self.onmessage = async function(e) {
  const { taskId, payload } = e.data;
  const {
    workerId,
    totalWorkers,
    pageSize,
    startOffset,
    endOffset,
    apiKey,
    apiHost,
    sort,
    sharedBuffers,
    idsLocal
  } = payload;

  try {
    let fetched = 0;
    let written = 0;
    let currentOffset = startOffset;

    // Fetch pages in strided pattern
    while (currentOffset < endOffset) {
      // Send progress update
      self.postMessage({
        taskId,
        type: 'progress',
        payload: {
          workerId,
          offset: currentOffset,
          fetched,
          written
        }
      });

      try {
        // Fetch page
        const result = await fetchCitiesPage({
          apiKey,
          apiHost,
          sort,
          offset: currentOffset,
          limit: pageSize
        });

        const cities = result.data || [];
        fetched += cities.length;

        // Write cities to shared buffers
        // Note: idsLocal array is not shared, so we coordinate via messages
        const cityIds = [];
        
        for (const city of cities) {
          const normalized = normalizeCity(city);
          
          // Allocate slot atomically
          const slot = allocateSlot(sharedBuffers.writeIndex);
          
          if (slot >= sharedBuffers.capacity) {
            self.postMessage({
              taskId,
              type: 'progress',
              payload: {
                workerId,
                offset: currentOffset,
                fetched,
                written,
                capacityExceeded: true
              }
            });
            break;
          }

          // Write numeric data to shared buffers atomically
          sharedBuffers.latitudes[slot] = normalized.latitude || 0;
          sharedBuffers.longitudes[slot] = normalized.longitude || 0;
          sharedBuffers.populations[slot] = normalized.population || 0;
          sharedBuffers.localIndices[slot] = slot; // Use slot as temporary index
          
          // Store ID to send back to main thread
          cityIds.push({ slot, id: normalized.id });
          written++;
        }

        // Send city IDs back to main thread for mapping
        if (cityIds.length > 0) {
          self.postMessage({
            taskId,
            type: 'city-ids',
            payload: {
              workerId,
              cityData: cityIds
            }
          });
        }

        // Check if we've reached capacity
        const currentCount = Atomics.load(sharedBuffers.writeIndex, 0);
        if (currentCount >= sharedBuffers.capacity) {
          break;
        }

        // Move to next strided offset
        currentOffset += totalWorkers * pageSize;

        // If no more cities in this page, we're done
        if (cities.length < pageSize) {
          break;
        }
      } catch (error) {
        self.postMessage({
          taskId,
          type: 'progress',
          payload: {
            workerId,
            offset: currentOffset,
            error: error.message,
            fetched,
            written
          }
        });
        // Continue with next offset
        currentOffset += totalWorkers * pageSize;
      }
    }

    // Task complete
    self.postMessage({
      taskId,
      type: 'task-complete',
      payload: {
        workerId,
        fetched,
        written
      }
    });
  } catch (error) {
    self.postMessage({
      taskId,
      type: 'task-error',
      error: error.message
    });
  }
};
