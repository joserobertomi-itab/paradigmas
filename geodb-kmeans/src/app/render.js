import { qs, setHTML, setText } from '../ui/dom.js';
import {
  resultsList,
  selectedCitiesList,
  pageInfo,
  statusBadge,
  progressBar,
  logsTextarea,
  clusterList,
  metricsPanel
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
  selectKmeansClusters,
  selectKmeansMetrics,
  selectKmeansIterations,
  selectClusterFilter
} from './selectors.js';

function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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
  const clusterFilter = selectClusterFilter(state);
  
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
        
        // Create controls
        const controlsHTML = `
          <div class="clusters-controls">
            <h2>Clusters</h2>
            <div class="clusters-filters">
              <label for="cluster-filter-select">Filtrar por cluster:</label>
              <select id="cluster-filter-select" class="cluster-filter-select">
                <option value="">Todos</option>
                ${clusters.map((_, i) => `<option value="${i}">Cluster ${i}</option>`).join('')}
              </select>
              <button id="export-json-btn" class="btn btn-secondary">Exportar JSON</button>
            </div>
          </div>
          <div id="clusters-list"></div>
        `;
        clustersContainer.innerHTML = controlsHTML;
        processingSection.appendChild(clustersContainer);
      }
    }
    
    // Update filter select value
    const filterSelect = qs('#cluster-filter-select', clustersContainer);
    if (filterSelect) {
      filterSelect.value = clusterFilter === null ? '' : clusterFilter.toString();
    }
    
    // Render clusters list with filter
    const clustersListEl = qs('#clusters-list', clustersContainer);
    if (clustersListEl) {
      // Use requestAnimationFrame for non-blocking render
      requestAnimationFrame(() => {
        setHTML(clustersListEl, clusterList(clusters, clusterFilter));
      });
    }

    // Render metrics panel
    const metrics = selectKmeansMetrics(state);
    const iterations = selectKmeansIterations(state);
    if (metrics) {
      let metricsEl = qs('#metrics-panel', clustersContainer);
      if (!metricsEl) {
        metricsEl = document.createElement('div');
        metricsEl.id = 'metrics-panel';
        clustersContainer.insertBefore(metricsEl, clustersListEl);
      }
      setHTML(metricsEl, metricsPanel({ ...metrics, iterations }));
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
    const pageSize = state.pageSize || 10;
    nextPageBtn.disabled = results.length < pageSize;
  }

  const cancelBtn = qs('#cancel-btn', root);
  
  if (processBtn) {
    const status = selectAsyncStatus(state);
    const isRunning = status === 'loading' || status === 'clustering';
    processBtn.disabled = isRunning;
    
    // Show/hide cancel button
    if (cancelBtn) {
      cancelBtn.style.display = isRunning ? 'inline-block' : 'none';
    }
  }
  
  // Update cancel button state
  if (cancelBtn) {
    const status = selectAsyncStatus(state);
    const isRunning = status === 'loading' || status === 'clustering';
    cancelBtn.disabled = !isRunning;
  }
}
