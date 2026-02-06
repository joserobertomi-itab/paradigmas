/**
 * Worker for fetching cities in parallel from api/v1/cities only.
 *
 * Strided assignment: worker i fetches offsets i*pageSize, (i+W)*pageSize,
 * (i+2*W)*pageSize, ... (W = totalWorkers). Stops when a page returns fewer than
 * pageSize items, capacity is reached, or currentOffset >= endOffset.
 *
 * Rate limiting: per-worker queue with REQUEST_DELAY_MS and jitter to avoid
 * saturating the API or triggering rate limits. Workers do not share a global
 * limiter; main assigns distinct page subsets so load is spread.
 *
 * Writes: only to shared buffers via Atomics (allocateSlot). String IDs are
 * sent to the main thread via city-ids messages; main fills idsLocal.
 *
 * Note: This file must be loaded as a module worker (type: 'module').
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

// Rate limiting constants (immutable)
const MAX_CONCURRENT_REQUESTS = 2;
const REQUEST_DELAY_MS = 500;
const JITTER_MS = 200;

/**
 * Pure: add jitter to delay (no side effects, deterministic only in tests if seed needed)
 */
function jitteredDelay(baseDelay) {
  return baseDelay + Math.random() * JITTER_MS;
}

/**
 * Creates a rate-limited fetcher with queue state encapsulated in closure (no module-level mutable state).
 */
function createRateLimitedFetcher() {
  const requestQueue = [];
  let activeRequests = 0;

  function processQueue() {
    if (activeRequests >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) {
      return;
    }
    const request = requestQueue.shift();
    activeRequests += 1;
    Promise.resolve(request())
      .finally(() => {
        activeRequests -= 1;
        setTimeout(processQueue, jitteredDelay(REQUEST_DELAY_MS));
      });
  }

  return function fetchCitiesPage({ apiBaseUrl, sort, offset, limit }) {
    return new Promise((resolve, reject) => {
      requestQueue.push(async () => {
        try {
          const params = new URLSearchParams({
            limit: limit.toString(),
            offset: offset.toString()
          });
          const baseUrl = apiBaseUrl || 'http://localhost:8000';
          const url = `${baseUrl}/api/v1/cities?${params.toString()}`;

          const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });

          if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `API error: ${response.status} ${response.statusText}`;
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData.detail || errorData.message || errorData.error || errorMessage;
            } catch (_e) {
              // keep default
            }
            throw new Error(errorMessage);
          }

          const cities = await response.json();
          resolve({ data: cities || [] });
        } catch (error) {
          reject(error);
        }
      });
      processQueue();
    });
  };
}

const fetchCitiesPage = createRateLimitedFetcher();

/**
 * Pure: compute next loop state from current state and fetch result.
 * @param {{ fetched: number, written: number, offset: number }} state
 * @param {{ fetchedDelta: number, writtenDelta: number, pageSize: number, totalWorkers: number, capacityExceeded: boolean }} result
 * @returns {{ fetched: number, written: number, offset: number, done: boolean }}
 */
function nextState(state, result) {
  const { fetched, written, offset } = state;
  const { fetchedDelta, writtenDelta, pageSize, totalWorkers, capacityExceeded } = result;
  return {
    fetched: fetched + fetchedDelta,
    written: written + writtenDelta,
    offset: offset + totalWorkers * pageSize,
    done: fetchedDelta < pageSize || capacityExceeded
  };
}

/**
 * Normalize city data from FastAPI format
 */
function normalizeCity(city) {
  return {
    id: String(city.id || ''),
    name: city.city_ascii || city.city || '',
    country: city.country || '',
    latitude: parseFloat(city.lat) || 0,
    longitude: parseFloat(city.lng) || 0,
    population: parseInt(city.population, 10) || 0
  };
}

self.onmessage = async function(e) {
  const { taskId, payload } = e.data;
  if (!payload) {
    self.postMessage({ taskId, type: 'task-error', error: 'Missing payload' });
    return;
  }
  const {
    workerId,
    totalWorkers,
    pageSize,
    startOffset,
    endOffset,
    apiBaseUrl,
    sort,
    sharedBuffers
  } = payload;

  if (!sharedBuffers || !sharedBuffers.writeIndex || sharedBuffers.capacity == null) {
    self.postMessage({ taskId, type: 'task-error', error: 'Missing or invalid sharedBuffers (need writeIndex, capacity)' });
    return;
  }

  try {
    let state = { fetched: 0, written: 0, offset: startOffset, done: false };

    while (state.offset < endOffset && !state.done) {
      self.postMessage({
        taskId,
        type: 'progress',
        payload: {
          workerId,
          offset: state.offset,
          fetched: state.fetched,
          written: state.written
        }
      });

      try {
        const result = await fetchCitiesPage({
          apiBaseUrl,
          sort,
          offset: state.offset,
          limit: pageSize
        });

        const cities = result.data || [];
        const cityIds = [];
        let capacityExceeded = false;

        for (const city of cities) {
          const normalized = normalizeCity(city);
          const slot = allocateSlot(sharedBuffers.writeIndex);

          if (slot >= sharedBuffers.capacity) {
            capacityExceeded = true;
            self.postMessage({
              taskId,
              type: 'progress',
              payload: {
                workerId,
                offset: state.offset,
                fetched: state.fetched + cities.length,
                written: state.written,
                capacityExceeded: true
              }
            });
            break;
          }

          sharedBuffers.latitudes[slot] = normalized.latitude || 0;
          sharedBuffers.longitudes[slot] = normalized.longitude || 0;
          sharedBuffers.populations[slot] = normalized.population || 0;
          sharedBuffers.localIndices[slot] = slot;
          cityIds.push({
            slot,
            id: normalized.id,
            name: normalized.name || '',
            country: normalized.country || ''
          });
        }

        const writtenThisPage = cityIds.length;
        if (cityIds.length > 0) {
          self.postMessage({
            taskId,
            type: 'city-ids',
            payload: { workerId, cityData: cityIds }
          });
        }

        state = nextState(state, {
          fetchedDelta: cities.length,
          writtenDelta: writtenThisPage,
          pageSize,
          totalWorkers,
          capacityExceeded: capacityExceeded || Atomics.load(sharedBuffers.writeIndex, 0) >= sharedBuffers.capacity
        });
      } catch (error) {
        self.postMessage({
          taskId,
          type: 'progress',
          payload: {
            workerId,
            offset: state.offset,
            error: error.message,
            fetched: state.fetched,
            written: state.written
          }
        });
        state = nextState(state, {
          fetchedDelta: pageSize,
          writtenDelta: 0,
          pageSize,
          totalWorkers,
          capacityExceeded: false
        });
      }
    }

    self.postMessage({
      taskId,
      type: 'task-complete',
      payload: {
        workerId,
        fetched: state.fetched,
        written: state.written
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
