export const initialState = {
  // UI state
  query: '',
  sort: 'population:desc',
  page: 1,
  pageSize: 50,

  // API results (current page)
  results: [],

  // Selected cities
  selected: {}, // Map by id: { [id]: city }
  selectedOrder: [], // Array of ids to preserve order

  // Async operations
  async: {
    status: 'idle', // idle | loading | clustering | done | error
    error: null,
    inFlight: false,
    requestId: 0, // Incremental ID to prevent race conditions
    progress: 0,
    logs: []
  },

  // Bulk loading
  bulk: {
    totalTarget: 10000,
    loaded: 0
  },

  // K-means clustering
  kmeans: {
    k: 5,
    status: 'idle', // idle | running | done | error
    iterations: 0,
    clusters: null
  }
};
