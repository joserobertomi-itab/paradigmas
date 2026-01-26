import { qs, on } from '../ui/dom.js';
import * as actions from './actions.js';
import { selectK, selectQuery, selectSort, selectPage, selectPageSize, selectBulkTotalTarget, selectRadius, selectSelectedCities, selectSelectedOrder } from './selectors.js';
import { findCities, findCitiesWithinRadius } from '../api/geodbClient.js';
import { pageToOffset } from '../api/paging.js';
import { createSharedCityBuffers, getAllCities, getWriteIndex, writeCity } from '../workers/sharedMemory.js';
import { createWorkerPool } from '../workers/workerPool.js';
import { kmeans as runKmeans } from '../kmeans/kmeans.js';
import { kmeansSingle } from '../kmeans/kmeansSingle.js';
import { kmeansParallel } from '../kmeans/kmeansParallel.js';
import { createRateLimiter } from '../api/rateLimit.js';

/**
 * Fetch cities from API with race condition prevention
 */
async function fetchCities(store, page, query, sort) {
  const state = store.getState();
  const currentRequestId = state.async.requestId || 0;
  const newRequestId = currentRequestId + 1;
  const pageSize = selectPageSize(state);

  // Set loading state and new request ID
  store.dispatch(actions.setRequestId(newRequestId));
  store.dispatch(actions.setStatus('loading'));
  store.dispatch(actions.addLog(`[Request #${newRequestId}] Buscando cidades...`));
  store.dispatch(actions.setProgress(0));

  try {
    const offset = pageToOffset(page, pageSize);
    
    // Normalize sort format: convert "population-desc" to "population:desc" for consistency
    // The API client handles both formats, but we normalize to colon format
    let normalizedSort = sort;
    if (sort.includes('-') && !sort.startsWith('-')) {
      // Format: "population-desc" -> "population:desc"
      const parts = sort.split('-');
      normalizedSort = `${parts[0]}:${parts[1] || 'desc'}`;
    } else if (!sort.includes(':') && !sort.includes('-')) {
      // Format: "population" -> "population:asc" (default)
      normalizedSort = `${sort}:asc`;
    }
    // If already in "population:desc" format, keep it as is

    store.dispatch(actions.addLog(`[Request #${newRequestId}] Parâmetros: query="${query}", sort="${normalizedSort}", page=${page}, offset=${offset}`));

    const result = await findCities({
      namePrefix: query || undefined,
      sort: normalizedSort, // Pass full sort string with order to API client
      offset,
      limit: pageSize
    });

    // Check if this is still the latest request
    const latestState = store.getState();
    if (latestState.async.requestId !== newRequestId) {
      store.dispatch(actions.addLog(`[Request #${newRequestId}] Ignorado: requisição mais recente (#${latestState.async.requestId}) já em andamento`));
      return;
    }

    // Update results with request ID check
    store.dispatch(actions.setResultsWithId(result.data || [], newRequestId));
    store.dispatch(actions.setStatus('idle'));
    store.dispatch(actions.setProgress(100));
    store.dispatch(actions.addLog(`[Request #${newRequestId}] Sucesso: ${result.data?.length || 0} cidades encontradas`));
    
    if (result.metadata) {
      store.dispatch(actions.addLog(`[Request #${newRequestId}] Total disponível: ${result.metadata.totalCount || 0}`));
    }
  } catch (error) {
    // Check if this is still the latest request
    const latestState = store.getState();
    if (latestState.async.requestId !== newRequestId) {
      store.dispatch(actions.addLog(`[Request #${newRequestId}] Erro ignorado: requisição mais recente (#${latestState.async.requestId}) já em andamento`));
      return;
    }

    // Handle error
    const errorMessage = error.message || 'Erro desconhecido ao buscar cidades';
    store.dispatch(actions.setError(errorMessage));
    store.dispatch(actions.setStatus('error'));
    store.dispatch(actions.addLog(`[Request #${newRequestId}] Erro: ${errorMessage}`));
    store.dispatch(actions.setProgress(0));
  }
}

export function bindEvents(root, store) {
  if (!root) {
    root = document.getElementById('app');
  }
  if (!root || !store) return;

  // Search input
  const searchInput = qs('#city-search-input', root);
  if (searchInput) {
    on(searchInput, 'input', (e) => {
      store.dispatch(actions.setQuery(e.target.value));
    });

    // Allow Enter key to trigger search
    on(searchInput, 'keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const searchBtn = qs('#search-btn', root);
        if (searchBtn) {
          searchBtn.click();
        }
      }
    });
  }

  // Sort select - auto-search when sort changes (using event delegation)
  // Use event delegation to handle dynamically created elements
  on(root, 'change', async (e) => {
    if (e.target.id === 'sort-select') {
      const htmlSortValue = e.target.value; // Format: "population-desc"
      
      if (import.meta.env.DEV) {
        console.log('[Sort Filter] Changed to:', htmlSortValue);
      }
      
      // Normalize to colon format for state: "population-desc" -> "population:desc"
      let normalizedSort = htmlSortValue;
      if (htmlSortValue.includes('-') && !htmlSortValue.startsWith('-')) {
        const parts = htmlSortValue.split('-');
        normalizedSort = `${parts[0]}:${parts[1] || 'desc'}`;
      }
      
      // Update sort in state (this will automatically sort existing results)
      const currentState = store.getState();
      const hasResults = currentState.results && currentState.results.length > 0;
      
      store.dispatch(actions.setSort(normalizedSort));
      
      // Get state after sort update
      const state = store.getState();
      const query = selectQuery(state);
      
      if (import.meta.env.DEV) {
        console.log('[Sort Filter] Changed:', {
          normalizedSort,
          query,
          resultsCount: state.results?.length || 0,
          sorted: hasResults ? 'Results sorted dynamically' : 'No results to sort'
        });
      }
      
      // Trigger new API search to get properly sorted results from server
      // This ensures pagination and future results are also sorted correctly
      if (query || hasResults) {
        // Reset to page 1 for new sort
        store.dispatch(actions.setPage(1));
        
        if (import.meta.env.DEV) {
          console.log('[Sort Filter] Triggering API search with sort:', normalizedSort);
        }
        
        try {
          await fetchCities(store, 1, query, normalizedSort);
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error('[Sort Filter] API search failed:', error);
          }
        }
      }
    }
  });

  // Search button
  const searchBtn = qs('#search-btn', root);
  if (searchBtn) {
    on(searchBtn, 'click', async () => {
      const state = store.getState();
      const query = selectQuery(state);
      const sort = selectSort(state);
      
      // Reset to page 1 for new search
      store.dispatch(actions.setPage(1));
      
      // Fetch first page
      await fetchCities(store, 1, query, sort);
    });
  }

  // Pagination buttons
  const prevPageBtn = qs('#prev-page-btn', root);
  if (prevPageBtn) {
    on(prevPageBtn, 'click', async () => {
      const state = store.getState();
      const currentPage = selectPage(state);
      
      if (currentPage > 1) {
        const newPage = currentPage - 1;
        store.dispatch(actions.setPage(newPage));
        
        const query = selectQuery(state);
        const sort = selectSort(state);
        await fetchCities(store, newPage, query, sort);
      }
    });
  }

  const nextPageBtn = qs('#next-page-btn', root);
  if (nextPageBtn) {
    on(nextPageBtn, 'click', async () => {
      const state = store.getState();
      const currentPage = selectPage(state);
      const newPage = currentPage + 1;
      
      store.dispatch(actions.setPage(newPage));
      
      const query = selectQuery(state);
      const sort = selectSort(state);
      await fetchCities(store, newPage, query, sort);
    });
  }

  // K input
  const kInput = qs('#kInput', root);
  if (kInput) {
    on(kInput, 'input', (e) => {
      const k = parseInt(e.target.value, 10);
      if (!isNaN(k) && k > 0) {
        store.dispatch(actions.setK(k));
      }
    });
  }

  // Radius input
  const radiusInput = qs('#radiusInput', root);
  if (radiusInput) {
    on(radiusInput, 'input', (e) => {
      const radius = parseFloat(e.target.value);
      if (!isNaN(radius) && radius > 0) {
        store.dispatch(actions.setRadius(radius));
      }
    });
  }

  // Process button (run K-means)
  const runBulkKmeansBtn = qs('#runBulkKmeansBtn', root);
  let currentPool = null; // Store reference to worker pool for cancellation
  let currentOperation = null; // Store reference to current operation promise for cancellation
  
  if (runBulkKmeansBtn) {
    on(runBulkKmeansBtn, 'click', async () => {
      // Reset cancellation flag
      store.dispatch(actions.resetAsync());
      
      // Start operation and store promise
      const operationPromise = startBulkLoadAndKmeans(store, (pool) => {
        currentPool = pool;
      });
      currentOperation = operationPromise;
      
      try {
        await operationPromise;
      } catch (error) {
        // Handle cancellation or errors
        if (error.message === 'K-means cancelled' || store.getState().async.cancelled) {
          // Already handled in startBulkLoadAndKmeans
        } else {
          console.error('Error in K-means operation:', error);
        }
      } finally {
        currentOperation = null;
        currentPool = null;
      }
    });
  }

  // Cancel button
  const cancelBtn = qs('#cancel-btn', root);
  if (cancelBtn) {
    on(cancelBtn, 'click', () => {
      const state = store.getState();
      const status = state.async?.status;
      
      // Only allow cancellation if operation is running
      if (status === 'loading' || status === 'clustering') {
        store.dispatch(actions.cancelOperation());
        store.dispatch(actions.addLog('Cancelamento solicitado pelo usuário...'));
        
        // Terminate workers immediately
        if (currentPool) {
          try {
            currentPool.terminate();
            store.dispatch(actions.addLog('Workers terminados'));
          } catch (error) {
            console.error('Error terminating workers:', error);
            store.dispatch(actions.addLog('Erro ao terminar workers'));
          }
          currentPool = null;
        }
        
        // Reset state to idle (preserve selected cities)
        store.dispatch(actions.setStatus('idle'));
        store.dispatch(actions.setProgress(0));
        store.dispatch(actions.setBulkLoaded(0));
        store.dispatch(actions.addLog('Operação cancelada. Cidades selecionadas preservadas.'));
      }
    });
  }

  // Event delegation for city cards (add/remove buttons)
  const apiResultsContainer = qs('#api-results-container', root);
  if (apiResultsContainer) {
    on(apiResultsContainer, 'click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;

      const action = button.dataset.action;
      const cityId = button.dataset.cityId;

      if (action === 'add-city' && cityId) {
        // Find city in results
        const state = store.getState();
        const city = state.results.find(c => c.id === cityId);
        if (city) {
          store.dispatch(actions.addSelected(city));
        }
      }
    });
  }

  const selectedContainer = qs('#selected-cities-container', root);
  if (selectedContainer) {
    on(selectedContainer, 'click', (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;

      const action = button.dataset.action;
      const cityId = button.dataset.cityId;

      if (action === 'remove-city' && cityId) {
        store.dispatch(actions.removeSelected(cityId));
      }
    });
  }

  // Clear selected button
  const clearSelectedBtn = qs('#clear-selected-btn', root);
  if (clearSelectedBtn) {
    on(clearSelectedBtn, 'click', () => {
      store.dispatch(actions.clearSelected());
    });
  }

  // Cluster filter (event delegation)
  on(root, 'change', (e) => {
    if (e.target.id === 'cluster-filter-select') {
      const value = e.target.value;
      const filterId = value === '' ? null : parseInt(value, 10);
      if (import.meta.env.DEV) {
        console.log('[Cluster Filter] Changed to:', { value, filterId });
      }
      store.dispatch(actions.setClusterFilter(filterId));
    }
  });

  // Export JSON button (event delegation)
  on(root, 'click', (e) => {
    if (e.target.id === 'export-json-btn') {
      const state = store.getState();
      const clusters = state.kmeans?.clusters;
      const metrics = state.kmeans?.metrics;
      const iterations = state.kmeans?.iterations;

      if (clusters && metrics) {
        // Extract centroids array
        const centroids = clusters.map(cluster => cluster.centroid);
        
        // Extract cluster sizes array
        const clusterSizes = clusters.map(cluster => cluster.size);

        const exportData = {
          datasetSize: metrics.datasetSize || 0,
          radiusKm: metrics.radiusKm || 0,
          k: metrics.k || state.kmeans?.k || 5,
          iterations: iterations || 0,
          totalTimeMs: metrics.totalTimeMs || 0,
          centroids: centroids,
          clusterSizes: clusterSizes,
          assignmentsById: metrics.assignmentsById || null, // Optional, only if not too heavy
          exportedAt: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kmeans-results-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        store.dispatch(actions.addLog('Resultados exportados para JSON'));
      }
    }
  });

  // Dismiss error button (event delegation)
  on(root, 'click', (e) => {
    if (e.target.id === 'dismiss-error-btn') {
      store.dispatch(actions.setError(null));
      store.dispatch(actions.setStatus('idle'));
    }
  });
}

/**
 * Start bulk load and K-means clustering using selected cities as reference points
 * 
 * Flow:
 * 1. Get selected cities and IDs from state
 * 2. Call findCitiesWithinRadius with selected IDs and radius (with rate limiting)
 * 3. Build final dataset: cities from radius + selected cities (no duplicates)
 * 4. Validate k (>= 2 and <= dataset.length)
 * 5. Run K-means on final dataset
 * 
 * Note: Selected cities already have lat/lng/pop in state because they come from
 * normalized API results (via normalizeCity in geodbClient.js). They are stored
 * in state.selected as complete city objects with all required fields.
 * 
 * @param {Object} store - Redux store
 * @param {Function} onPoolCreated - Callback when worker pool is created (for cancellation)
 * @returns {Promise<Object|null>} Worker pool or null if cancelled/errored
 */
async function startBulkLoadAndKmeans(store, onPoolCreated = null) {
  const state = store.getState();
  
  // Get inputs from state
  const selectedCities = selectSelectedCities(state);
  const selectedIds = selectSelectedOrder(state);
  const radiusKm = selectRadius(state);
  const k = selectK(state);

  // Step 1: Validate that we have selected cities
  if (!selectedCities || selectedCities.length === 0) {
    store.dispatch(actions.setError('Nenhuma cidade selecionada. Selecione pelo menos uma cidade antes de rodar K-means.'));
    store.dispatch(actions.setStatus('error'));
    store.dispatch(actions.addLog('Aviso: Nenhuma cidade selecionada. Operação cancelada.'));
    return null;
  }

  // Check SharedArrayBuffer support
  if (typeof SharedArrayBuffer === 'undefined') {
    store.dispatch(actions.setError('SharedArrayBuffer não disponível. Use HTTPS ou localhost.'));
    store.dispatch(actions.setStatus('error'));
    return null;
  }

  try {
    const startTime = performance.now();
    store.dispatch(actions.setStatus('loading'));
    store.dispatch(actions.clearLogs());
    store.dispatch(actions.addLog(`Iniciando busca de cidades no raio de ${radiusKm}km de ${selectedCities.length} cidade(s) de referência...`));
    store.dispatch(actions.setProgress(0));
    store.dispatch(actions.setBulkLoaded(0));

    // Step 2: Call findCitiesWithinRadius
    // Convert selected IDs to numbers (they might be strings)
    const cityIds = selectedIds.map(id => {
      const numId = typeof id === 'string' ? parseInt(id, 10) : id;
      return isNaN(numId) ? null : numId;
    }).filter(id => id !== null);

    if (cityIds.length === 0) {
      store.dispatch(actions.setError('IDs de cidades inválidos.'));
      store.dispatch(actions.setStatus('error'));
      return null;
    }

    store.dispatch(actions.addLog(`Buscando cidades no raio de ${radiusKm}km das cidades: ${cityIds.join(', ')}`));
    
    // Rate limiting for /radius endpoint (if multiple calls needed in future)
    // For now, single call, but rate limiter ensures we don't overwhelm API
    const radiusRateLimiter = createRateLimiter({
      maxTokens: 5,
      refillRate: 1 // 1 request per second max
    });
    
    await radiusRateLimiter.wait();
    
    // Check for cancellation before API call
    if (store.getState().async.cancelled) {
      store.dispatch(actions.addLog('Operação cancelada antes da chamada à API'));
      return null;
    }
    
    let citiesWithinRadius;
    try {
      citiesWithinRadius = await findCitiesWithinRadius({
        cityIds: cityIds,
        radiusKm: radiusKm
      });
    } catch (error) {
      // Preserve selected cities on error
      const errorMessage = error.message || 'Erro desconhecido ao buscar cidades no raio';
      store.dispatch(actions.setError(`Erro ao buscar cidades: ${errorMessage}. As cidades selecionadas foram preservadas.`));
      store.dispatch(actions.setStatus('error'));
      store.dispatch(actions.addLog(`Erro na busca: ${errorMessage}`));
      return null;
    }

    // Check for cancellation after API call
    if (store.getState().async.cancelled) {
      store.dispatch(actions.addLog('Operação cancelada após chamada à API'));
      return null;
    }

    store.dispatch(actions.addLog(`Encontradas ${citiesWithinRadius.length} cidade(s) dentro do raio`));

    // Step 3: Build final dataset
    // Include cities from radius + selected cities (no duplicates by id)
    const datasetMap = new Map();
    
    // First, add cities from radius
    citiesWithinRadius.forEach(city => {
      if (city && city.id) {
        datasetMap.set(String(city.id), city);
      }
    });
    
    // Then, add selected cities (these are the reference cities)
    // Note: Selected cities already have lat/lng/pop because they come from normalized API results
    selectedCities.forEach(city => {
      if (city && city.id) {
        // Overwrite if exists (selected cities take precedence to ensure they have all fields)
        datasetMap.set(String(city.id), city);
      }
    });

    const finalDataset = Array.from(datasetMap.values());
    
    store.dispatch(actions.addLog(`Dataset final: ${finalDataset.length} cidade(s) (${citiesWithinRadius.length} do raio + ${selectedCities.length} de referência, sem duplicatas)`));

    // Step 4: Validate k
    if (k < 2) {
      const errorMessage = `k deve ser >= 2. Valor atual: ${k}. As cidades selecionadas foram preservadas.`;
      store.dispatch(actions.setError(errorMessage));
      store.dispatch(actions.setStatus('error'));
      store.dispatch(actions.addLog(`Erro: k=${k} é inválido (mínimo: 2)`));
      return null;
    }

    if (k > finalDataset.length) {
      const errorMessage = `k (${k}) não pode ser maior que o número de cidades (${finalDataset.length}). As cidades selecionadas foram preservadas.`;
      store.dispatch(actions.setError(errorMessage));
      store.dispatch(actions.setStatus('error'));
      store.dispatch(actions.addLog(`Erro: k=${k} > dataset.length=${finalDataset.length}`));
      return null;
    }

    // Check for cancellation
    if (store.getState().async.cancelled) {
      store.dispatch(actions.addLog('Operação cancelada antes de iniciar K-means'));
      return null;
    }

    // Step 5: Prepare data for K-means
    // Create shared buffers with capacity = dataset.length
    const capacity = finalDataset.length;
    const buffers = createSharedCityBuffers(capacity);
    store.dispatch(actions.addLog(`Criando buffers compartilhados (capacidade: ${capacity})`));

    // Fill buffers with dataset cities
    finalDataset.forEach((city, index) => {
      // Use index as localIndex (since we're filling sequentially)
      writeCity(buffers, {
        id: city.id,
        latitude: city.latitude || 0,
        longitude: city.longitude || 0,
        population: city.population || 0
      }, index);
      
      // Store ID in idsLocal array
      buffers.idsLocal[index] = String(city.id);
    });

    // Update writeIndex to reflect the actual count
    buffers.writeIndex[0] = capacity;
    
    store.dispatch(actions.setBulkLoaded(capacity));
    store.dispatch(actions.setProgress(100));
    store.dispatch(actions.addLog(`Dataset preparado: ${capacity} cidade(s) prontas para K-means (k=${k})`));

    // Check for cancellation before K-means
    if (store.getState().async.cancelled) {
      store.dispatch(actions.addLog('Operação cancelada antes de iniciar K-means'));
      return null;
    }

    // Step 6: Start K-means clustering (parallel with single-thread fallback)
    const kmeansStartTime = performance.now();
    store.dispatch(actions.setStatus('clustering'));
    store.dispatch(actions.setProgress(0));
    
    // Determine number of workers
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    const kmeansWorkerCount = Math.max(2, Math.min(8, hardwareConcurrency - 1));
    
    store.dispatch(actions.addLog(`Iniciando K-means paralelo com ${kmeansWorkerCount} workers (k=${k})...`));

    let kmeansResult;
    let workersUsed = kmeansWorkerCount;

    try {
      // Try parallel version first
      kmeansResult = await kmeansParallel(finalDataset, k, {
        maxIter: 100,
        epsilon: 0.0001,
        seed: Date.now(),
        workerCount: kmeansWorkerCount,
        isCancelled: () => store.getState().async.cancelled,
        onPoolCreated: (pool) => {
          // Store pool reference for cancellation
          if (onPoolCreated) {
            onPoolCreated(pool);
          }
        },
        onProgress: (progress) => {
          const progressPercent = Math.min(100, Math.round((progress.iteration / 100) * 100));
          store.dispatch(actions.setProgress(progressPercent));
          store.dispatch(actions.setKmeansIterations(progress.iteration));
          store.dispatch(actions.addLog(`Iteração ${progress.iteration}: mudança média = ${progress.avgChange.toFixed(6)}`));
          
          if (progress.converged) {
            store.dispatch(actions.addLog(`Convergência atingida!`));
          }
        }
      });
    } catch (error) {
      // Fallback to single-thread if parallel fails
      if (error.message === 'K-means cancelled') {
        throw error; // Re-throw cancellation
      }

      store.dispatch(actions.addLog(`Aviso: K-means paralelo falhou (${error.message}), usando versão single-thread...`));
      workersUsed = 1;

      kmeansResult = kmeansSingle(finalDataset, k, {
        maxIter: 100,
        epsilon: 0.0001,
        seed: Date.now(),
        onProgress: (progress) => {
          const progressPercent = Math.min(100, Math.round((progress.iteration / 100) * 100));
          store.dispatch(actions.setProgress(progressPercent));
          store.dispatch(actions.setKmeansIterations(progress.iteration));
          store.dispatch(actions.addLog(`Iteração ${progress.iteration}: mudança média = ${progress.avgChange.toFixed(6)}`));
          
          if (progress.converged) {
            store.dispatch(actions.addLog(`Convergência atingida!`));
          }
        }
      });
    }

    const kmeansEndTime = performance.now();
    const kmeansTimeMs = kmeansEndTime - kmeansStartTime;
    const totalTimeMs = kmeansEndTime - startTime;

    store.dispatch(actions.addLog(`K-means concluído em ${kmeansResult.iterations} iterações em ${(kmeansTimeMs / 1000).toFixed(2)}s`));
    store.dispatch(actions.addLog(`Clusters criados: ${kmeansResult.clusters.length}`));
    
    // Log cluster sizes
    kmeansResult.clusterSizes.forEach((size, i) => {
      store.dispatch(actions.addLog(`Cluster ${i}: ${size} cidade(s)`));
    });

    // Transform clusters to include index and limit sampleCities to 30
    // Keep all cities in cluster.cities for potential export, but use sampleCities for display
    const formattedClusters = kmeansResult.clusters.map((cluster, index) => ({
      index,
      size: cluster.size || 0,
      centroid: cluster.centroid || {},
      cities: cluster.cities || [], // Keep all cities for reference
      sampleCities: (cluster.cities || []).slice(0, 30) // Limit to 30 cities for display
    }));

    // Store assignments by city ID for export (if not too heavy)
    // Map city IDs to cluster assignments
    // Note: assignments array index corresponds to finalDataset index
    const assignmentsById = {};
    if (kmeansResult.assignments && finalDataset.length <= 10000) {
      // Only include assignments if dataset is not too large (to avoid heavy JSON)
      for (let i = 0; i < finalDataset.length && i < kmeansResult.assignments.length; i++) {
        const city = finalDataset[i];
        if (city && city.id) {
          assignmentsById[String(city.id)] = kmeansResult.assignments[i];
        }
      }
    }

    // Update state with results and metrics
    store.dispatch(actions.setClusters(formattedClusters));
    store.dispatch(actions.setKmeansIterations(kmeansResult.iterations));
    store.dispatch(actions.setKmeansStatus('done'));
    store.dispatch(actions.setKmeansMetrics({
      loadTimeMs: 0, // No bulk loading in this flow
      kmeansTimeMs,
      totalTimeMs,
      workersUsed: workersUsed,
      k: k,
      datasetSize: finalDataset.length,
      radiusKm: radiusKm,
      assignmentsById: Object.keys(assignmentsById).length > 0 ? assignmentsById : null
    }));
    store.dispatch(actions.setProgress(100));
    store.dispatch(actions.setStatus('done'));
    store.dispatch(actions.addLog(`Processo concluído em ${(totalTimeMs / 1000).toFixed(2)}s total!`));

  } catch (error) {
    // Check if it was a cancellation
    if (error.message === 'K-means cancelled' || store.getState().async.cancelled) {
      store.dispatch(actions.addLog('Operação cancelada pelo usuário'));
      store.dispatch(actions.setStatus('idle'));
      store.dispatch(actions.setProgress(0));
      store.dispatch(actions.addLog('Cidades selecionadas preservadas.'));
      return null;
    }
    
    // Handle other errors - preserve selected cities
    const errorMessage = error.message || 'Erro desconhecido';
    const userFriendlyMessage = `Erro durante processamento: ${errorMessage}. As cidades selecionadas foram preservadas.`;
    
    store.dispatch(actions.setError(userFriendlyMessage));
    store.dispatch(actions.setStatus('error'));
    store.dispatch(actions.addLog(`Erro: ${errorMessage}`));
    store.dispatch(actions.addLog('Cidades selecionadas preservadas.'));
    
    // Keep UI functional - don't crash
    console.error('Error during radius search/kmeans:', error);
  }
  
  return null;
}
