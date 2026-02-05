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
  selectSelectedOrder,
  selectPage,
  selectBulkLoaded,
  selectAsyncStatus,
  selectAsyncProgress,
  selectAsyncLogs,
  selectK,
  selectKmeansClusters,
  selectKmeansMetrics,
  selectKmeansIterations,
  selectClusterFilter,
  selectSort,
  selectRadius
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

  // Update sort select value to match state (only if different to prevent event loops)
  const sortSelect = qs('#sort-select', root);
  if (sortSelect) {
    const currentSort = selectSort(state);
    // Convert "population:desc" format to "population-desc" for HTML select
    let htmlSortValue = currentSort;
    if (currentSort.includes(':')) {
      htmlSortValue = currentSort.replace(':', '-');
    } else if (!currentSort.includes('-') && !currentSort.startsWith('-')) {
      // Handle plain "population" format
      htmlSortValue = `${currentSort}-desc`;
    }
    
    // Only update if value is different to prevent triggering change event
    if (sortSelect.value !== htmlSortValue) {
      // Temporarily remove event listener to prevent loop, then restore
      const currentValue = sortSelect.value;
      sortSelect.value = htmlSortValue;
      
      if (import.meta.env.DEV && currentValue !== htmlSortValue) {
        console.log('[Render] Updated sort select:', { 
          from: currentValue, 
          to: htmlSortValue,
          stateSort: currentSort 
        });
      }
    }
  }

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
  const statusTextEl = qs('#statusText', root);
  if (statusTextEl) {
    const status = selectAsyncStatus(state);
    // Remove all status classes
    statusTextEl.className = 'status-text';
    // Add current status class
    statusTextEl.classList.add(`status-${status}`);
    setText(statusTextEl, status);
  }

  // Render progress
  const progressBarEl = qs('#progressBar', root);
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
  const logsTextareaEl = qs('#logBox', root);
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
    
    // Update filter select options and value
    const filterSelect = qs('#cluster-filter-select', clustersContainer);
    if (filterSelect) {
      // Update options if clusters changed
      const currentOptions = Array.from(filterSelect.options).map(opt => opt.value);
      const expectedOptions = ['', ...clusters.map((_, i) => i.toString())];
      const optionsChanged = currentOptions.length !== expectedOptions.length || 
        currentOptions.some((val, idx) => val !== expectedOptions[idx]);
      
      if (optionsChanged) {
        filterSelect.innerHTML = `
          <option value="">Todos</option>
          ${clusters.map((_, i) => `<option value="${i}">Cluster ${i}</option>`).join('')}
        `;
      }
      
      // Set filter value (preserve selection)
      const filterValue = clusterFilter === null ? '' : clusterFilter.toString();
      if (filterSelect.value !== filterValue) {
        filterSelect.value = filterValue;
      }
    }
    
    // Render clusters list with filter
    const clustersListEl = qs('#clusters-list', clustersContainer);
    if (clustersListEl) {
      // Render immediately to ensure filter is applied
      setHTML(clustersListEl, clusterList(clusters, clusterFilter));
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
  const runBulkKmeansBtn = qs('#runBulkKmeansBtn', root);
  
  if (prevPageBtn) {
    const page = selectPage(state);
    prevPageBtn.disabled = page <= 1;
  }
  
  if (nextPageBtn) {
    const results = selectResults(state);
    const pageSize = state.pageSize || 10;
    nextPageBtn.disabled = results.length < pageSize;
  }

  // Update run K-means button state (enabled when not running and k >= 2)
  if (runBulkKmeansBtn) {
    const status = selectAsyncStatus(state);
    const isRunning = status === 'loading' || status === 'clustering';
    const k = selectK(state);
    runBulkKmeansBtn.disabled = isRunning || k < 2;
  }

  const cancelBtn = qs('#cancel-btn', root);
  
  // Show/hide cancel button and update state
  if (cancelBtn) {
    const status = selectAsyncStatus(state);
    const isRunning = status === 'loading' || status === 'clustering';
    cancelBtn.style.display = isRunning ? 'inline-block' : 'none';
    cancelBtn.disabled = !isRunning;
    
    // Update button text based on status
    if (isRunning) {
      const statusText = status === 'loading' ? 'Cancelar busca' : 'Cancelar K-means';
      if (cancelBtn.textContent !== statusText) {
        cancelBtn.textContent = statusText;
      }
    }
  }
  
  // Render error message if present
  const asyncError = state.async?.error;
  if (asyncError) {
    let errorEl = qs('#error-message', root);
    if (!errorEl) {
      const processingSection = qs('.processing-section', root);
      if (processingSection) {
        errorEl = document.createElement('div');
        errorEl.id = 'error-message';
        errorEl.className = 'error-message';
        errorEl.style.cssText = 'background: #ffebee; border: 1px solid #f44336; padding: 12px; margin: 10px 0; border-radius: 4px;';
        processingSection.insertBefore(errorEl, processingSection.firstChild);
      }
    }
    if (errorEl) {
      errorEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #c62828; font-weight: bold;">⚠️ Erro: ${escapeHtml(asyncError)}</span>
          <button id="dismiss-error-btn" class="btn btn-small" style="margin-left: 10px;">Dispensar</button>
        </div>
      `;
    }
  } else {
    // Remove error message if no error
    const errorEl = qs('#error-message', root);
    if (errorEl) {
      errorEl.remove();
    }
  }

  // Update radius input value (only if not focused to avoid interrupting user input)
  const radiusInput = qs('#radiusInput', root);
  if (radiusInput) {
    const radius = selectRadius(state);
    const isFocused = document.activeElement === radiusInput;
    
    // Only update if input is not focused and value is different
    if (!isFocused && radiusInput.value !== String(radius)) {
      radiusInput.value = String(radius);
    }
  }

  // Render processing info (selected count, radius, dataset size)
  const processingSection = qs('.processing-section', root);
  if (processingSection) {
    let infoEl = qs('#processing-info', root);
    if (!infoEl) {
      infoEl = document.createElement('div');
      infoEl.id = 'processing-info';
      infoEl.className = 'processing-info';
      // Insert after processing-controls
      const controlsEl = qs('.processing-controls', processingSection);
      if (controlsEl && controlsEl.nextSibling) {
        processingSection.insertBefore(infoEl, controlsEl.nextSibling);
      } else if (controlsEl) {
        processingSection.appendChild(infoEl);
      }
    }

    const selectedCount = selectSelectedCount(state);
    const radius = selectRadius(state);
    const bulkLoaded = selectBulkLoaded(state);
    
    let infoText = `Selecionadas: ${selectedCount}`;
    infoText += ` | Raio: ${radius} km`;
    
    // Show dataset size if available (after load)
    if (bulkLoaded > 0) {
      infoText += ` | Dataset final (raio + referências): ${bulkLoaded} cidade(s)`;
    }
    
    setText(infoEl, infoText);
  }
}
