/**
 * Worker for fetching cities within radius of reference cities (api/v1/cities/radius).
 *
 * Each worker receives a chunk of reference city IDs, calls GET /radius for its chunk
 * (one request per ref ID to spread load and respect rate limits), normalizes
 * response and returns partial results to main. Main thread merges, dedupes,
 * adds reference cities, and writes to shared memory.
 *
 * Rate limiting: delay + jitter before each request to avoid saturating the API.
 *
 * Note: This file must be loaded as a module worker (type: 'module').
 */

const REQUEST_DELAY_MS = 400;
const JITTER_MS = 150;

function jitteredDelay(baseDelay) {
  return baseDelay + Math.random() * JITTER_MS;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize city from FastAPI CityRead to internal format
 */
function normalizeCity(city) {
  return {
    id: String(city.id ?? ''),
    name: city.city_ascii ?? city.city ?? '',
    country: city.country ?? '',
    latitude: parseFloat(city.lat) ?? 0,
    longitude: parseFloat(city.lng) ?? 0,
    population: parseInt(city.population, 10) || 0
  };
}

/**
 * Fetch cities within radius of one or more reference city IDs
 */
async function fetchRadiusPage({ apiBaseUrl, cityIds, radiusKm }) {
  const params = new URLSearchParams();
  cityIds.forEach((id) => params.append('city_ids', String(id)));
  params.set('radius_km', String(radiusKm));

  const baseUrl = apiBaseUrl || 'http://localhost:8000';
  const url = `${baseUrl}/api/v1/cities/radius?${params.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `API error: ${response.status} ${response.statusText}`;
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.detail?.msg ?? errorData.detail ?? errorData.message ?? errorMessage;
    } catch (_) {}
    throw new Error(errorMessage);
  }

  const result = await response.json();
  const data = result.data ?? result ?? [];
  return Array.isArray(data) ? data.map(normalizeCity) : [];
}

self.onmessage = async function (e) {
  const { taskId, payload } = e.data;
  if (!payload) {
    self.postMessage({ taskId, type: 'task-error', error: 'Missing payload' });
    return;
  }

  const { workerId, referenceCityIds, radiusKm, apiBaseUrl } = payload;

  if (!Array.isArray(referenceCityIds) || referenceCityIds.length === 0) {
    self.postMessage({ taskId, type: 'task-complete', payload: { workerId, count: 0 } });
    return;
  }

  if (typeof radiusKm !== 'number' || radiusKm <= 0 || isNaN(radiusKm)) {
    self.postMessage({ taskId, type: 'task-error', error: 'Invalid radiusKm' });
    return;
  }

  try {
    const cityMap = new Map(); // id -> city (dedupe within worker)

    for (let i = 0; i < referenceCityIds.length; i++) {
      await sleep(jitteredDelay(REQUEST_DELAY_MS));

      const cities = await fetchRadiusPage({
        apiBaseUrl,
        cityIds: [referenceCityIds[i]],
        radiusKm
      });

      for (const city of cities) {
        if (city && city.id != null) {
          cityMap.set(String(city.id), city);
        }
      }
    }

    const cities = Array.from(cityMap.values());

    self.postMessage({
      taskId,
      type: 'radius-result',
      payload: { workerId, cities }
    });

    self.postMessage({
      taskId,
      type: 'task-complete',
      payload: { workerId, count: cities.length }
    });
  } catch (error) {
    self.postMessage({
      taskId,
      type: 'task-error',
      error: error.message ?? String(error)
    });
  }
};
