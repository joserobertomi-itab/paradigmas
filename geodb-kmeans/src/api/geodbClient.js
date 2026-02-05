import { createRateLimiter } from './rateLimit.js';

/**
 * Normalize city data to stable format
 * Maps FastAPI CityRead format to internal format
 * @param {Object} city - Raw city data from FastAPI
 * @returns {Object} Normalized city object
 */
function normalizeCity(city) {
  if (!city) return null;

  return {
    id: String(city.id || ''),
    name: city.city_ascii || city.city || '',
    country: city.country || '',
    region: city.admin_name || '',
    latitude: parseFloat(city.lat) || 0,
    longitude: parseFloat(city.lng) || 0,
    population: parseInt(city.population, 10) || 0
  };
}

/**
 * Fetch-based implementation for local FastAPI endpoint
 */
class FetchGeoDBClient {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = apiBaseUrl || 'http://localhost:8000';
    this.baseUrl = `${this.apiBaseUrl}/api/v1/cities`;
    this.rateLimiter = createRateLimiter({
      maxTokens: 10,
      refillRate: 2 // 2 requests per second
    });
  }

  async findCities({ namePrefix = '', sort = 'population', offset = 0, limit = 10 }) {
    try {
      // Wait for rate limiter
      await this.rateLimiter.wait();

      const params = new URLSearchParams({
        limit: Math.min(limit, 1000).toString(), // FastAPI max is 1000
        offset: offset.toString()
      });

      if (namePrefix) {
        params.append('prefix', namePrefix); // FastAPI uses 'prefix' instead of 'namePrefix'
      }

      // FastAPI doesn't support sort parameter in the current implementation
      // We'll fetch and sort client-side if needed, or just ignore sort for now
      // Note: The endpoint returns cities but doesn't support sorting yet
      
      if (import.meta.env.DEV) {
        console.log('[FastAPI Client] Request params:', {
          namePrefix,
          sort,
          offset,
          limit,
          finalParams: Object.fromEntries(params)
        });
      }

      const url = `${this.baseUrl}?${params.toString()}`;

      // Debug: Log request details
      if (import.meta.env.DEV) {
        console.log('[FastAPI Request]', {
          url: url,
          method: 'GET',
          params: Object.fromEntries(params)
        });
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorData.error || errorMessage;
          
          // Include full error details in console for debugging
          console.error('[FastAPI Error]', {
            status: response.status,
            statusText: response.statusText,
            error: errorData,
            url: url
          });
        } catch (e) {
          // Use default error message
          console.error('[FastAPI Error]', {
            status: response.status,
            statusText: response.statusText,
            rawError: errorText,
            url: url
          });
        }

        // Include more details in error message
        const fullErrorMessage = `${errorMessage} (Status: ${response.status})`;
        throw new Error(fullErrorMessage);
      }

      // FastAPI returns a direct array of cities, not wrapped in {data, metadata}
      const cities = await response.json();

      // Normalize cities (pure: map + filter produce new array)
      const normalized = (cities || []).map(normalizeCity).filter(Boolean);

      // Immutable sort: copy then sort (no mutation of normalized)
      const data = sort
        ? [...normalized].sort((a, b) => {
            const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
            const sortOrder = sort.startsWith('-') ? 'desc' : 'asc';
            let aVal = a[sortField];
            let bVal = b[sortField];
            if (sortField === 'population') {
              aVal = aVal || 0;
              bVal = bVal || 0;
            }
            const cmp = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            return sortOrder === 'desc' ? -cmp : cmp;
          })
        : normalized;

      // Extract metadata (estimate based on response)
      // Since FastAPI doesn't return totalCount, we estimate hasMore based on limit
      const metadata = {
        totalCount: data.length, // We don't know the total, so use current count
        offset: offset,
        limit: limit,
        hasMore: data.length === limit // If we got a full page, there might be more
      };

      return { data, metadata };
    } catch (error) {
      // Provide friendly error messages
      if (error.message.includes('API request failed')) {
        throw error;
      }
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to FastAPI. Please check if the backend is running.');
      }

      throw new Error(`Failed to fetch cities: ${error.message}`);
    }
  }

  async findCitiesWithinRadius({ cityIds, radiusKm }) {
    try {
      // Validate inputs
      if (!Array.isArray(cityIds) || cityIds.length === 0) {
        throw new Error('cityIds must be a non-empty array');
      }

      if (typeof radiusKm !== 'number' || radiusKm <= 0 || isNaN(radiusKm)) {
        throw new Error('radiusKm must be a positive number');
      }

      // Wait for rate limiter
      await this.rateLimiter.wait();

      // Build query parameters
      // FastAPI expects multiple city_ids query params: ?city_ids=1&city_ids=2&radius_km=100
      const params = new URLSearchParams();
      cityIds.forEach(id => {
        params.append('city_ids', String(id));
      });
      params.append('radius_km', String(radiusKm));

      const url = `${this.baseUrl}/radius?${params.toString()}`;

      if (import.meta.env.DEV) {
        console.log('[FastAPI Request] findCitiesWithinRadius', {
          url: url,
          method: 'GET',
          cityIds: cityIds,
          radiusKm: radiusKm
        });
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorData.error || errorMessage;
          
          // Include full error details in console for debugging
          console.error('[FastAPI Error] findCitiesWithinRadius', {
            status: response.status,
            statusText: response.statusText,
            error: errorData,
            url: url
          });
        } catch (e) {
          // Use default error message
          console.error('[FastAPI Error] findCitiesWithinRadius', {
            status: response.status,
            statusText: response.statusText,
            rawError: errorText,
            url: url
          });
        }

        // Include more details in error message
        const fullErrorMessage = `${errorMessage} (Status: ${response.status})`;
        throw new Error(fullErrorMessage);
      }

      // FastAPI returns { count: number, data: CityRead[] }
      const result = await response.json();
      const cities = result.data || result || [];

      // Normalize cities using the existing normalizeCity function
      const normalizedCities = (cities || []).map(normalizeCity).filter(Boolean);

      if (import.meta.env.DEV) {
        console.log('[FastAPI Response] findCitiesWithinRadius', {
          cityIds: cityIds,
          radiusKm: radiusKm,
          citiesFound: normalizedCities.length,
          count: result.count
        });
      }

      return normalizedCities;
    } catch (error) {
      // Provide friendly error messages
      if (error.message.includes('API request failed')) {
        throw error;
      }
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to FastAPI. Please check if the backend is running.');
      }

      throw new Error(`Failed to fetch cities within radius: ${error.message}`);
    }
  }
}

/**
 * Library-based implementation is no longer used since we're using local FastAPI
 * This class is kept for backward compatibility but will not be instantiated
 */
class LibraryGeoDBClient {
  // This class is deprecated - we only use FetchGeoDBClient now
}

/**
 * Create FastAPI client instance
 * @param {Object} options - Configuration options
 * @param {string} options.apiBaseUrl - FastAPI base URL (from env or passed directly)
 * @returns {Promise<Object>} Promise resolving to FastAPI client instance
 */
export async function createGeoDBClient(options = {}) {
  const apiBaseUrl = options.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  // Debug: Log environment variable status
  if (import.meta.env.DEV) {
    console.log('[FastAPI Client] Environment check:', {
      apiBaseUrl: apiBaseUrl
    });
  }

  // No API key required for local FastAPI endpoint
  return new FetchGeoDBClient(apiBaseUrl);
}

/**
 * Main function to find cities
 * @param {Object} params - Search parameters
 * @param {string} params.namePrefix - City name prefix to search
 * @param {string} params.sort - Sort field (e.g., 'population', '-population', 'name', '-name')
 * @param {number} params.offset - Offset for pagination
 * @param {number} params.limit - Number of results to return
 * @returns {Promise<Object>} Promise resolving to { data, metadata }
 */
export async function findCities(params = {}) {
  const client = await getDefaultClient();
  return client.findCities(params);
}

/**
 * Find cities within radius of reference cities
 * @param {Object} params - Search parameters
 * @param {Array<number|string>} params.cityIds - Array of city IDs to use as reference points
 * @param {number} params.radiusKm - Radius in kilometers (must be > 0)
 * @returns {Promise<Array>} Promise resolving to array of normalized city objects
 * @note This function does NOT include the reference cities in the result.
 *       The endpoint /radius excludes reference cities from the response.
 *       If you need the reference cities, include them separately in your use case.
 */
export async function findCitiesWithinRadius({ cityIds, radiusKm }) {
  const client = await getDefaultClient();
  return client.findCitiesWithinRadius({ cityIds, radiusKm });
}

/**
 * Default client getter with lazy initialization. State encapsulated in closure (no module-level mutable vars).
 */
export const getDefaultClient = (function () {
  let clientPromise = null;
  return async function getDefaultClient() {
    if (!clientPromise) {
      clientPromise = createGeoDBClient();
    }
    return clientPromise;
  };
})();
