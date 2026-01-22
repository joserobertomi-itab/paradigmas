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
 * @param {Object} city - Raw city data from API
 * @returns {Object} Normalized city object
 */
function normalizeCity(city) {
  if (!city) return null;

  return {
    id: String(city.id || city.wikiDataId || city.code || ''),
    name: city.name || '',
    country: city.country || city.countryCode || '',
    region: city.region || city.regionCode || '',
    latitude: parseFloat(city.latitude) || 0,
    longitude: parseFloat(city.longitude) || 0,
    population: parseInt(city.population, 10) || 0
  };
}

/**
 * Fetch-based implementation (fallback)
 */
class FetchGeoDBClient {
  constructor(apiKey, apiHost) {
    this.apiKey = apiKey;
    this.apiHost = apiHost || 'wft-geo-db.p.rapidapi.com';
    this.baseUrl = `https://${this.apiHost}/v1/geo`;
    this.rateLimiter = createRateLimiter({
      maxTokens: 10,
      refillRate: 2 // 2 requests per second
    });
  }

  async findCities({ namePrefix = '', sort = 'population', offset = 0, limit = 50 }) {
    try {
      // Wait for rate limiter
      await this.rateLimiter.wait();

      const params = new URLSearchParams({
        limit: Math.min(limit, 100).toString(), // API max is 100
        offset: offset.toString(),
        types: 'CITY'
      });

      if (namePrefix) {
        params.append('namePrefix', namePrefix);
      }

      // Sort format: "population-desc", "population:desc", "population:asc", "-population", or "population"
      let sortParam = sort;
      let sortOrder = 'asc';
      
      if (sort.includes(':')) {
        // Format: "population:desc" or "population:asc"
        [sortParam, sortOrder] = sort.split(':');
      } else if (sort.includes('-') && !sort.startsWith('-')) {
        // Format: "population-desc" or "population-asc"
        const parts = sort.split('-');
        sortParam = parts[0];
        sortOrder = parts[1] || 'desc';
      } else if (sort.startsWith('-')) {
        // Format: "-population"
        sortParam = sort.substring(1);
        sortOrder = 'desc';
      }
      
      params.append('sort', sortParam);
      params.append('order', sortOrder);

      const url = `${this.baseUrl}/cities?${params.toString()}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': this.apiHost
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // Use default error message
        }

        throw new Error(errorMessage);
      }

      const result = await response.json();

      // Normalize cities
      const data = (result.data || []).map(normalizeCity).filter(Boolean);

      // Extract metadata
      const metadata = {
        totalCount: result.metadata?.totalCount || 0,
        offset: result.metadata?.offset || offset,
        limit: result.metadata?.limit || limit,
        hasMore: (result.metadata?.offset || offset) + data.length < (result.metadata?.totalCount || 0)
      };

      return { data, metadata };
    } catch (error) {
      // Provide friendly error messages
      if (error.message.includes('API request failed')) {
        throw error;
      }
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to GeoDB API. Please check your internet connection.');
      }

      throw new Error(`Failed to fetch cities: ${error.message}`);
    }
  }
}

/**
 * Library-based implementation (if available)
 */
class LibraryGeoDBClient {
  constructor(apiKey, apiHost, ClientLib) {
    this.ClientLib = ClientLib;
    this.client = new ClientLib({
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': apiHost || 'wft-geo-db.p.rapidapi.com'
    });
    this.rateLimiter = createRateLimiter({
      maxTokens: 10,
      refillRate: 2
    });
  }

  async findCities({ namePrefix = '', sort = 'population', offset = 0, limit = 50 }) {
    try {
      await this.rateLimiter.wait();

      const sortParam = sort.startsWith('-') ? sort.substring(1) : sort;
      const sortOrder = sort.startsWith('-') ? 'desc' : 'asc';

      const params = {
        limit: Math.min(limit, 100),
        offset,
        types: 'CITY'
      };

      if (namePrefix) {
        params.namePrefix = namePrefix;
      }

      // Use library method (adjust based on actual library API)
      // Common methods: getCities, findCities, searchCities
      const result = await (this.client.getCities?.(params) || 
                           this.client.findCities?.(params) ||
                           this.client.searchCities?.(params));

      const data = (result.data || []).map(normalizeCity).filter(Boolean);

      const metadata = {
        totalCount: result.metadata?.totalCount || 0,
        offset: result.metadata?.offset || offset,
        limit: result.metadata?.limit || limit,
        hasMore: (result.metadata?.offset || offset) + data.length < (result.metadata?.totalCount || 0)
      };

      return { data, metadata };
    } catch (error) {
      throw new Error(`Failed to fetch cities: ${error.message}`);
    }
  }
}

/**
 * Create GeoDB client instance
 * @param {Object} options - Configuration options
 * @param {string} options.apiKey - RapidAPI key (from env or passed directly)
 * @param {string} options.apiHost - RapidAPI host (optional)
 * @returns {Promise<Object>} Promise resolving to GeoDB client instance
 */
export async function createGeoDBClient(options = {}) {
  const apiKey = options.apiKey || import.meta.env.VITE_RAPIDAPI_KEY;
  const apiHost = options.apiHost || import.meta.env.VITE_RAPIDAPI_HOST || 'wft-geo-db.p.rapidapi.com';

  if (!apiKey) {
    throw new Error('GeoDB API key is required. Set VITE_RAPIDAPI_KEY in your .env file.');
  }

  // Try to load library
  const ClientLib = await loadLibrary();
  
  // Use library if available, otherwise use fetch fallback
  if (ClientLib) {
    return new LibraryGeoDBClient(apiKey, apiHost, ClientLib);
  }

  return new FetchGeoDBClient(apiKey, apiHost);
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
