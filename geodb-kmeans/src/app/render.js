import { qs, setHTML, setText } from '../ui/dom.js';
import {
  resultsList,
  selectedCitiesList,
  pageInfo,
  statusBadge,
  progressBar,
  logsTextarea,
  clusterList
} from '../ui/templates.js';
import {
  selectResults,
  selectSelectedCities,
  selectSelected,
  selectSelectedCount,
  selectPage,
  selectBulkLoaded,
  selectAsyncStatus,
  selectAsyncProgress,
  selectAsyncLogs,
  selectKmeansClusters
} from './selectors.js';

export function render(root, state) {
  if (!root) {
    root = document.getElementById('app');
  }
  if (!root) return;

  // Render API results
  const apiResultsContainer = qs('#api-results-container', root);
  if (apiResultsContainer) {
    const results = selectResults(state);
    const selected = selectSelected(state);
    const selectedIds = new Set(Object.keys(selected));
    setHTML(apiResultsContainer, resultsList(results, selectedIds));
  }

  // Render selected cities
  const selectedContainer = qs('#selected-cities-container', root);
  if (selectedContainer) {
    const selectedCities = selectSelectedCities(state);
    setHTML(selectedContainer, selectedCitiesList(selectedCities));
  }

  // Render selected count
  const selectedCountEl = qs('#selected-count', root);
  if (selectedCountEl) {
    const selectedCount = selectSelectedCount(state);
    setText(selectedCountEl, selectedCount.toString());
  }

  // Render page info
  const currentPageEl = qs('#current-page', root);
  const totalLoadedEl = qs('#total-loaded', root);
  if (currentPageEl) {
    const page = selectPage(state);
    setText(currentPageEl, page.toString());
  }
  if (totalLoadedEl) {
    const totalLoaded = selectBulkLoaded(state);
    setText(totalLoadedEl, totalLoaded.toString());
  }

  // Render status
  const statusTextEl = qs('#status-text', root);
  if (statusTextEl) {
    const status = selectAsyncStatus(state);
    // Remove all status classes
    statusTextEl.className = 'status-text';
    // Add current status class
    statusTextEl.classList.add(`status-${status}`);
    setText(statusTextEl, status);
  }

  // Render progress
  const progressBarEl = qs('#progress-bar', root);
  const progressTextEl = qs('#progress-text', root);
  if (progressBarEl) {
    const progress = selectAsyncProgress(state);
    progressBarEl.value = progress;
    progressBarEl.textContent = `${progress}%`;
  }
  if (progressTextEl) {
    const progress = selectAsyncProgress(state);
    setText(progressTextEl, `${progress}%`);
  }

  // Render logs
  const logsTextareaEl = qs('#logs-textarea', root);
  if (logsTextareaEl) {
    const logs = selectAsyncLogs(state);
    logsTextareaEl.value = logsTextarea(logs);
    // Auto-scroll to bottom
    logsTextareaEl.scrollTop = logsTextareaEl.scrollHeight;
  }

  // Render clusters if available
  const clusters = selectKmeansClusters(state);
  if (clusters && clusters.length > 0) {
    // Create or update clusters container
    let clustersContainer = qs('#clusters-container', root);
    if (!clustersContainer) {
      // Create clusters section if it doesn't exist
      const processingSection = qs('.processing-section', root);
      if (processingSection) {
        clustersContainer = document.createElement('div');
        clustersContainer.id = 'clusters-container';
        clustersContainer.className = 'clusters-container';
        clustersContainer.innerHTML = '<h2>Clusters</h2><div id="clusters-list"></div>';
        processingSection.appendChild(clustersContainer);
      }
    }
    
    const clustersListEl = qs('#clusters-list', clustersContainer);
    if (clustersListEl) {
      setHTML(clustersListEl, clusterList(clusters));
    }
  } else {
    // Remove clusters container if no clusters
    const clustersContainer = qs('#clusters-container', root);
    if (clustersContainer) {
      clustersContainer.remove();
    }
  }

  // Update button states
  const prevPageBtn = qs('#prev-page-btn', root);
  const nextPageBtn = qs('#next-page-btn', root);
  const processBtn = qs('#process-btn', root);
  
  if (prevPageBtn) {
    const page = selectPage(state);
    prevPageBtn.disabled = page <= 1;
  }
  
  if (nextPageBtn) {
    const results = selectResults(state);
    const pageSize = state.pageSize || 50;
    nextPageBtn.disabled = results.length < pageSize;
  }

  if (processBtn) {
    const status = selectAsyncStatus(state);
    processBtn.disabled = status === 'loading' || status === 'clustering';
  }
}
