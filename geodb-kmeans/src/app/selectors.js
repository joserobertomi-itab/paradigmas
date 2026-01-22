// Base selector
export function selectState(state) {
  return state;
}

// UI selectors
export function selectQuery(state) {
  return state.query || '';
}

export function selectSort(state) {
  return state.sort || 'population:desc';
}

export function selectPage(state) {
  return state.page || 1;
}

export function selectPageSize(state) {
  return state.pageSize || 50;
}

export function selectK(state) {
  return state.kmeans?.k || 5;
}

// Data selectors
export function selectResults(state) {
  return state.results || [];
}

export function selectSelected(state) {
  return state.selected || {};
}

export function selectSelectedOrder(state) {
  return state.selectedOrder || [];
}

export function selectSelectedCities(state) {
  const selected = selectSelected(state);
  const order = selectSelectedOrder(state);
  return order.map(id => selected[id]).filter(Boolean);
}

export function selectSelectedCount(state) {
  return selectSelectedOrder(state).length;
}

export function isCitySelected(state, cityId) {
  return !!(state.selected && state.selected[cityId]);
}

// Async selectors
export function selectAsyncStatus(state) {
  return state.async?.status || 'idle';
}

export function selectAsyncError(state) {
  return state.async?.error || null;
}

export function selectAsyncInFlight(state) {
  return state.async?.inFlight || false;
}

export function selectAsyncProgress(state) {
  return state.async?.progress || 0;
}

export function selectAsyncLogs(state) {
  return state.async?.logs || [];
}

// Bulk selectors
export function selectBulkTotalTarget(state) {
  return state.bulk?.totalTarget || 10000;
}

export function selectBulkLoaded(state) {
  return state.bulk?.loaded || 0;
}

export function selectBulkProgress(state) {
  const total = selectBulkTotalTarget(state);
  const loaded = selectBulkLoaded(state);
  return total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
}

// K-means selectors
export function selectKmeansK(state) {
  return state.kmeans?.k || 5;
}

export function selectKmeansStatus(state) {
  return state.kmeans?.status || 'idle';
}

export function selectKmeansIterations(state) {
  return state.kmeans?.iterations || 0;
}

export function selectKmeansClusters(state) {
  return state.kmeans?.clusters || null;
}

export function selectKmeansMetrics(state) {
  return state.kmeans?.metrics || null;
}

export function selectClusterFilter(state) {
  return state.clusterFilter !== undefined ? state.clusterFilter : null;
}

// Computed selectors
export function selectCurrentPageInfo(state) {
  return {
    current: selectPage(state),
    pageSize: selectPageSize(state),
    totalLoaded: selectBulkLoaded(state)
  };
}

export function selectCanGoNextPage(state) {
  const results = selectResults(state);
  return results.length === selectPageSize(state);
}

export function selectCanGoPrevPage(state) {
  return selectPage(state) > 1;
}
