// Action type constants
export const ActionTypes = {
  // UI
  UI_SET_QUERY: 'UI/SET_QUERY',
  UI_SET_SORT: 'UI/SET_SORT',
  UI_SET_PAGE: 'UI/SET_PAGE',
  UI_SET_K: 'UI/SET_K',

  // Data
  DATA_SET_RESULTS: 'DATA/SET_RESULTS',
  DATA_ADD_SELECTED: 'DATA/ADD_SELECTED',
  DATA_REMOVE_SELECTED: 'DATA/REMOVE_SELECTED',
  DATA_CLEAR_SELECTED: 'DATA/CLEAR_SELECTED',

  // Async
  ASYNC_SET_STATUS: 'ASYNC/SET_STATUS',
  ASYNC_ADD_LOG: 'ASYNC/ADD_LOG',
  ASYNC_SET_PROGRESS: 'ASYNC/SET_PROGRESS',
  ASYNC_SET_ERROR: 'ASYNC/SET_ERROR',
  ASYNC_CLEAR_LOGS: 'ASYNC/CLEAR_LOGS',

  // Bulk
  BULK_SET_LOADED: 'BULK/SET_LOADED',

  // K-means
  KMEANS_SET_CLUSTERS: 'KMEANS/SET_CLUSTERS',
  KMEANS_SET_STATUS: 'KMEANS/SET_STATUS',
  KMEANS_SET_ITERATIONS: 'KMEANS/SET_ITERATIONS',
};

// Generic action creator
export function createAction(type, payload) {
  return { type, payload };
}

// UI actions
export const setQuery = (query) => ({
  type: ActionTypes.UI_SET_QUERY,
  payload: query
});

export const setSort = (sort) => ({
  type: ActionTypes.UI_SET_SORT,
  payload: sort
});

export const setPage = (page) => ({
  type: ActionTypes.UI_SET_PAGE,
  payload: page
});

export const setK = (k) => ({
  type: ActionTypes.UI_SET_K,
  payload: k
});

// Data actions
export const setResults = (results) => ({
  type: ActionTypes.DATA_SET_RESULTS,
  payload: results
});

export const addSelected = (city) => ({
  type: ActionTypes.DATA_ADD_SELECTED,
  payload: city
});

export const removeSelected = (id) => ({
  type: ActionTypes.DATA_REMOVE_SELECTED,
  payload: id
});

export const clearSelected = () => ({
  type: ActionTypes.DATA_CLEAR_SELECTED
});

// Async actions
export const setStatus = (status) => ({
  type: ActionTypes.ASYNC_SET_STATUS,
  payload: status
});

export const addLog = (log) => ({
  type: ActionTypes.ASYNC_ADD_LOG,
  payload: typeof log === 'string' ? log : JSON.stringify(log)
});

export const setProgress = (progress) => ({
  type: ActionTypes.ASYNC_SET_PROGRESS,
  payload: progress
});

export const setError = (error) => ({
  type: ActionTypes.ASYNC_SET_ERROR,
  payload: error
});

export const clearLogs = () => ({
  type: ActionTypes.ASYNC_CLEAR_LOGS
});

// Bulk actions
export const setBulkLoaded = (loaded) => ({
  type: ActionTypes.BULK_SET_LOADED,
  payload: loaded
});

// K-means actions
export const setClusters = (clusters) => ({
  type: ActionTypes.KMEANS_SET_CLUSTERS,
  payload: clusters
});

export const setKmeansStatus = (status) => ({
  type: ActionTypes.KMEANS_SET_STATUS,
  payload: status
});

export const setKmeansIterations = (iterations) => ({
  type: ActionTypes.KMEANS_SET_ITERATIONS,
  payload: iterations
});

// Export all actions as an object for convenience
export const actions = {
  // UI
  setQuery,
  setSort,
  setPage,
  setK,

  // Data
  setResults,
  addSelected,
  removeSelected,
  clearSelected,

  // Async
  setStatus,
  addLog,
  setProgress,
  setError,
  clearLogs,

  // Bulk
  setBulkLoaded,

  // K-means
  setClusters,
  setKmeansStatus,
  setKmeansIterations,
};
