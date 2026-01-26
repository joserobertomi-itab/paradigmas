import { createRateLimiter } from './rateLimit.js';

// Cache for library import
let GeoDBClientLib = null;
let libraryImportPromise = null;

/**
 * Try to import the official client library (lazy loading)
 */
async function loadLibrary() {
  if (GeoDBClientLib !== null) {
    return GeoDBClientLib;
  }

  if (libraryImportPromise) {
    return libraryImportPromise;
  }

  libraryImportPromise = (async () => {
    try {
      // Use dynamic import with string literal to avoid build-time resolution
      const moduleName = 'wft-geodb-js-client';
      const module = await import(/* @vite-ignore */ moduleName);
      GeoDBClientLib = module.GeoDBClient || module.default || null;
      return GeoDBClientLib;
    } catch (e) {
      // Library not available, will use fetch fallback
      GeoDBClientLib = false; // Mark as attempted
      return null;
    }
  })();

  return libraryImportPromise;
}

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

      // Normalize cities
      const data = (cities || []).map(normalizeCity).filter(Boolean);

      // Client-side sorting if needed (FastAPI doesn't support sort yet)
      if (sort) {
        const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
        const sortOrder = sort.startsWith('-') ? 'desc' : 'asc';
        
        data.sort((a, b) => {
          let aVal = a[sortField];
          let bVal = b[sortField];
          
          // Handle numeric fields
          if (sortField === 'population') {
            aVal = aVal || 0;
            bVal = bVal || 0;
          }
          
          if (sortOrder === 'desc') {
            return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
          } else {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
          }
        });
      }

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
  const client = await createGeoDBClient();
  return client.findCities(params);
}

// Export default client instance (lazy initialization)
let defaultClient = null;
let defaultClientPromise = null;

export async function getDefaultClient() {
  if (defaultClient) {
    return defaultClient;
  }

  if (defaultClientPromise) {
    return defaultClientPromise;
  }

  defaultClientPromise = createGeoDBClient().then(client => {
    defaultClient = client;
    return client;
  });

  return defaultClientPromise;
}
