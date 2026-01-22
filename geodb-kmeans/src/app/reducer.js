import { initialState } from './initialState.js';

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

    case 'UI/SET_SORT':
      return {
        ...state,
        sort: action.payload || 'population:desc'
      };

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

    // Data actions
    case 'DATA/SET_RESULTS':
      return {
        ...state,
        results: Array.isArray(action.payload) ? action.payload : []
      };

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

    default:
      return state;
  }
}
