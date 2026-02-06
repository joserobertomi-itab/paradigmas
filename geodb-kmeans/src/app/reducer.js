import { initialState } from './initialState.js';

/**
 * Helper function to sort cities array by sort string
 * @param {Array} cities - Array of city objects
 * @param {string} sort - Sort string in format "field:order" or "field-order"
 * @returns {Array} Sorted array of cities
 */
function sortCitiesBySortString(cities, sort) {
  if (!Array.isArray(cities) || cities.length === 0 || !sort) {
    return cities;
  }

  // Parse sort string
  let sortField = 'population';
  let sortOrder = 'desc';
  
  if (sort.includes(':')) {
    [sortField, sortOrder] = sort.split(':');
  } else if (sort.includes('-') && !sort.startsWith('-')) {
    const parts = sort.split('-');
    sortField = parts[0];
    sortOrder = parts[1] || 'desc';
  }

  // Create sorted copy
  const sorted = [...cities].sort((a, b) => {
    let aValue, bValue;

    switch (sortField) {
      case 'population':
        aValue = a.population || 0;
        bValue = b.population || 0;
        break;
      case 'name':
        aValue = (a.name || '').toLowerCase();
        bValue = (b.name || '').toLowerCase();
        break;
      case 'country':
        aValue = (a.country || '').toLowerCase();
        bValue = (b.country || '').toLowerCase();
        break;
      default:
        aValue = a.population || 0;
        bValue = b.population || 0;
    }

    let comparison = 0;
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else {
      if (aValue < bValue) comparison = -1;
      else if (aValue > bValue) comparison = 1;
    }

    return sortOrder === 'desc' ? -comparison : comparison;
  });

  return sorted;
}

export function reducer(state = initialState, action) {
  if (!action || !action.type) {
    return state;
  }

  switch (action.type) {
    // UI actions
    case 'UI/SET_QUERY':
      return {
        ...state,
        query: action.payload || ''
      };

    case 'UI/SET_SORT': {
      const sort = action.payload || 'population:desc';
      const results = state.results || [];
      
      // Sort existing results immediately
      const sortedResults = sortCitiesBySortString(results, sort);
      
      if (import.meta.env.DEV && sortedResults.length > 0) {
        console.log('[Reducer] Results sorted on sort change:', {
          sort: sort,
          count: sortedResults.length,
          sample: sortedResults.slice(0, 3).map(c => ({
            name: c.name,
            population: c.population
          }))
        });
      }
      
      return {
        ...state,
        sort: sort,
        results: sortedResults
      };
    }

    case 'UI/SET_PAGE':
      return {
        ...state,
        page: action.payload || 1
      };

    case 'UI/SET_K':
      return {
        ...state,
        kmeans: {
          ...state.kmeans,
          k: action.payload || 5
        }
      };

    case 'UI/SET_RADIUS': {
      // Convert to number if string, clamp between 1 and 500
      let radius = action.payload;
      if (typeof radius === 'string') {
        radius = parseFloat(radius);
      }
      if (typeof radius !== 'number' || isNaN(radius)) {
        radius = 500; // Default value
      }
      // Clamp between 1 and 50000
      radius = Math.max(1, Math.min(50000, radius));
      
      return {
        ...state,
        radius: radius
      };
    }

    // Data actions
    case 'DATA/SET_RESULTS': {
      const results = Array.isArray(action.payload) ? action.payload : [];
      // Sort results according to current sort preference
      const sortedResults = sortCitiesBySortString(results, state.sort || 'population:desc');
      return {
        ...state,
        results: sortedResults
      };
    }

    case 'DATA/SET_RESULTS_WITH_ID': {
      const { results, requestId } = action.payload;
      // Only update if this is the latest request (prevent race conditions)
      if (requestId >= state.async.requestId) {
        // Sort results according to current sort preference
        const currentSort = state.sort || 'population:desc';
        const sortedResults = sortCitiesBySortString(
          Array.isArray(results) ? results : [],
          currentSort
        );
        
        if (import.meta.env.DEV && sortedResults.length > 0) {
          console.log('[Reducer] Results sorted after API fetch:', {
            sort: currentSort,
            count: sortedResults.length,
            sample: sortedResults.slice(0, 3).map(c => ({
              name: c.name,
              population: c.population
            }))
          });
        }
        
        return {
          ...state,
          results: sortedResults,
          async: {
            ...state.async,
            requestId
          }
        };
      }
      // Ignore stale responses
      return state;
    }

    case 'DATA/SORT_RESULTS': {
      const sort = action.payload || state.sort || 'population:desc';
      const results = state.results || [];
      
      if (results.length === 0) {
        return state;
      }

      // Use helper function to sort
      const sortedResults = sortCitiesBySortString(results, sort);

      return {
        ...state,
        results: sortedResults
      };
    }

    case 'DATA/ADD_SELECTED': {
      const city = action.payload;
      if (!city || !city.id) {
        return state;
      }

      // Check if already selected
      if (state.selected[city.id]) {
        return state;
      }

      return {
        ...state,
        selected: {
          ...state.selected,
          [city.id]: city
        },
        selectedOrder: [...state.selectedOrder, city.id]
      };
    }

    case 'DATA/REMOVE_SELECTED': {
      const id = action.payload;
      if (!id || !state.selected[id]) {
        return state;
      }

      const newSelected = { ...state.selected };
      delete newSelected[id];

      return {
        ...state,
        selected: newSelected,
        selectedOrder: state.selectedOrder.filter(selectedId => selectedId !== id)
      };
    }

    case 'DATA/CLEAR_SELECTED':
      return {
        ...state,
        selected: {},
        selectedOrder: []
      };

    // Async actions
    case 'ASYNC/SET_STATUS':
      return {
        ...state,
        async: {
          ...state.async,
          status: action.payload || 'idle',
          inFlight: action.payload === 'loading' || action.payload === 'clustering'
        }
      };

    case 'ASYNC/SET_REQUEST_ID':
      return {
        ...state,
        async: {
          ...state.async,
          requestId: action.payload || 0
        }
      };

    case 'ASYNC/CANCEL':
      return {
        ...state,
        async: {
          ...state.async,
          cancelled: true,
          status: 'cancelled',
          inFlight: false
        }
      };

    case 'ASYNC/RESET':
      return {
        ...state,
        async: {
          ...state.async,
          cancelled: false,
          status: 'idle',
          error: null,
          inFlight: false,
          progress: 0
        },
        bulk: {
          ...state.bulk,
          loaded: 0
        },
        kmeans: {
          ...state.kmeans,
          status: 'idle',
          clusters: null,
          iterations: 0,
          metrics: {
            loadTimeMs: 0,
            kmeansTimeMs: 0,
            totalTimeMs: 0,
            workersUsed: 0
          }
        }
      };

    case 'ASYNC/ADD_LOG': {
      const log = action.payload;
      if (!log) {
        return state;
      }

      return {
        ...state,
        async: {
          ...state.async,
          logs: [...state.async.logs, log]
        }
      };
    }

    case 'ASYNC/SET_PROGRESS':
      return {
        ...state,
        async: {
          ...state.async,
          progress: Math.max(0, Math.min(100, action.payload || 0))
        }
      };

    case 'ASYNC/SET_ERROR':
      return {
        ...state,
        async: {
          ...state.async,
          status: 'error',
          error: action.payload || null,
          inFlight: false
        }
      };

    case 'ASYNC/CLEAR_LOGS':
      return {
        ...state,
        async: {
          ...state.async,
          logs: []
        }
      };

    // Bulk actions
    case 'BULK/SET_LOADED':
      return {
        ...state,
        bulk: {
          ...state.bulk,
          loaded: Math.max(0, action.payload || 0)
        }
      };

    case 'BULK/SET_TOTAL_TARGET':
      return {
        ...state,
        bulk: {
          ...state.bulk,
          totalTarget: Math.max(0, action.payload || 0)
        }
      };

    case 'BULK/SET_DATA_SOURCE':
      return {
        ...state,
        bulk: {
          ...state.bulk,
          dataSource: action.payload === 'pages' ? 'pages' : 'radius'
        }
      };

    case 'BULK/SET_TARGET_COUNT':
      return {
        ...state,
        bulk: {
          ...state.bulk,
          targetCount: Math.max(1000, Math.min(50000, action.payload || 10000))
        }
      };

    // K-means actions
    case 'KMEANS/SET_CLUSTERS':
      return {
        ...state,
        kmeans: {
          ...state.kmeans,
          clusters: action.payload || null,
          status: action.payload ? 'done' : 'idle'
        }
      };

    case 'KMEANS/SET_STATUS':
      return {
        ...state,
        kmeans: {
          ...state.kmeans,
          status: action.payload || 'idle'
        }
      };

    case 'KMEANS/SET_ITERATIONS':
      return {
        ...state,
        kmeans: {
          ...state.kmeans,
          iterations: action.payload || 0
        }
      };

    case 'KMEANS/SET_METRICS':
      return {
        ...state,
        kmeans: {
          ...state.kmeans,
          metrics: {
            ...state.kmeans.metrics,
            ...action.payload
          }
        }
      };

    case 'UI/SET_CLUSTER_FILTER':
      return {
        ...state,
        clusterFilter: action.payload
      };

    default:
      return state;
  }
}
