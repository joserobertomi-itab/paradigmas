import { qs, on } from '../ui/dom.js';
import * as actions from './actions.js';
import { selectK, selectQuery, selectSort, selectPage, selectPageSize, selectBulkTotalTarget } from './selectors.js';
import { findCities } from '../api/geodbClient.js';
import { pageToOffset } from '../api/paging.js';
import { createSharedCityBuffers, getAllCities, getWriteIndex } from '../workers/sharedMemory.js';
import { createWorkerPool } from '../workers/workerPool.js';
import { kmeans as runKmeans } from '../kmeans/kmeans.js';

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
  const kInput = qs('#k-input', root);
  if (kInput) {
    on(kInput, 'input', (e) => {
      const k = parseInt(e.target.value, 10);
      if (!isNaN(k) && k > 0) {
        store.dispatch(actions.setK(k));
      }
    });
  }

  // Process button
  const processBtn = qs('#process-btn', root);
  let currentPool = null; // Store reference to worker pool for cancellation
  
  if (processBtn) {
    on(processBtn, 'click', async () => {
      // Reset cancellation flag
      store.dispatch(actions.resetAsync());
      currentPool = await startBulkLoadAndKmeans(store, (pool) => {
        currentPool = pool;
      });
    });
  }

  // Cancel button
  const cancelBtn = qs('#cancel-btn', root);
  if (cancelBtn) {
    on(cancelBtn, 'click', () => {
      store.dispatch(actions.cancelOperation());
      store.dispatch(actions.addLog('Operação cancelada pelo usuário'));
      
      // Terminate workers
      if (currentPool) {
        currentPool.terminate();
        currentPool = null;
      }
      
      // Reset state
      store.dispatch(actions.setStatus('idle'));
      store.dispatch(actions.setProgress(0));
      store.dispatch(actions.setBulkLoaded(0));
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

      if (clusters) {
        const exportData = {
          clusters: clusters.map((cluster, index) => ({
            clusterId: index,
            centroid: cluster.centroid,
            size: cluster.size,
            cities: cluster.cities
          })),
          metrics: {
            ...metrics,
            iterations
          },
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
 * Start bulk load and K-means clustering
 */
async function startBulkLoadAndKmeans(store) {
  const state = store.getState();
  const k = selectK(state);
  const totalTarget = selectBulkTotalTarget(state);
  const sort = selectSort(state);
  const apiKey = import.meta.env.VITE_RAPIDAPI_KEY;
  const apiHost = import.meta.env.VITE_RAPIDAPI_HOST || 'wft-geo-db.p.rapidapi.com';

  if (!apiKey) {
    store.dispatch(actions.setError('API key não configurada. Configure VITE_RAPIDAPI_KEY no .env'));
    store.dispatch(actions.setStatus('error'));
    return;
  }

  // Check SharedArrayBuffer support
  if (typeof SharedArrayBuffer === 'undefined') {
    store.dispatch(actions.setError('SharedArrayBuffer não disponível. Use HTTPS ou localhost.'));
    store.dispatch(actions.setStatus('error'));
    return;
  }

  try {
    const startTime = performance.now();
    store.dispatch(actions.setStatus('loading'));
    store.dispatch(actions.clearLogs());
    store.dispatch(actions.addLog(`Iniciando carregamento massivo de ~${totalTarget} cidades...`));
    store.dispatch(actions.setProgress(0));
    store.dispatch(actions.setBulkLoaded(0));

    // Determine number of workers (use hardware concurrency - 1, min 2, max 8)
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    const workerCount = Math.max(2, Math.min(8, hardwareConcurrency - 1));
    
    store.dispatch(actions.addLog(`Usando ${workerCount} workers paralelos`));

    // Create shared buffers
    const buffers = createSharedCityBuffers(totalTarget);
    store.dispatch(actions.addLog(`Buffers compartilhados criados (capacidade: ${totalTarget})`));

    // Create worker pool
    const workerUrl = new URL('../workers/fetchWorker.js', import.meta.url).href;
    const pool = createWorkerPool({ size: workerCount, workerUrl });

    // Calculate parameters
    const pageSize = 10; // Free plan limit per page
    const sortParam = sort.includes(':') ? sort.split(':')[0] : 
                     sort.includes('-') ? sort.split('-')[0] : sort;

    // Distribute work: each worker fetches strided pages
    // Worker i fetches: i*pageSize, (i+W)*pageSize, (i+2W)*pageSize...
    const pagesPerWorker = Math.ceil(totalTarget / (workerCount * pageSize));
    const totalPages = pagesPerWorker * workerCount;

    store.dispatch(actions.addLog(`Distribuindo ${totalPages} páginas entre ${workerCount} workers`));

    // Check for cancellation before starting
    if (store.getState().async.cancelled) {
      pool.terminate();
      return null;
    }

    // Start all workers
    const workerPromises = [];

    for (let i = 0; i < workerCount; i++) {
      // Check for cancellation
      if (store.getState().async.cancelled) {
        break;
      }
      const startOffset = i * pageSize;
      const endOffset = startOffset + (pagesPerWorker * workerCount * pageSize);

      const promise = pool.runTask(
        {
          workerId: i,
          totalWorkers: workerCount,
          pageSize,
          startOffset,
          endOffset,
          apiKey,
          apiHost,
          sort: sortParam,
          sharedBuffers: {
            indexBuffer: buffers.indexBuffer,
            writeIndex: buffers.writeIndex,
            latBuffer: buffers.latBuffer,
            latitudes: buffers.latitudes,
            lonBuffer: buffers.lonBuffer,
            longitudes: buffers.longitudes,
            popBuffer: buffers.popBuffer,
            populations: buffers.populations,
            idxBuffer: buffers.idxBuffer,
            localIndices: buffers.localIndices,
            capacity: buffers.capacity
          },
          idsLocal: buffers.idsLocal
        },
        (update) => {
          // Progress callback
          const { type, payload: progress } = update;
          
          if (type === 'city-ids') {
            // Map city IDs to local indices
            for (const { slot, id } of progress.cityData) {
              buffers.idsLocal[slot] = id;
            }
            return;
          }
          
          if (progress.capacityExceeded) {
            store.dispatch(actions.addLog(`Worker ${progress.workerId}: Capacidade atingida`));
          } else if (progress.error) {
            store.dispatch(actions.addLog(`Worker ${progress.workerId}: Erro em offset ${progress.offset}: ${progress.error}`));
          } else {
            const currentCount = getWriteIndex(buffers.writeIndex);
            const progressPercent = Math.min(100, Math.round((currentCount / totalTarget) * 100));
            
            store.dispatch(actions.setProgress(progressPercent));
            store.dispatch(actions.setBulkLoaded(currentCount));
            
            if (progress.offset && progress.offset % (pageSize * 10) === 0) {
              store.dispatch(actions.addLog(`Progresso: ${currentCount}/${totalTarget} cidades (${progressPercent}%)`));
            }
          }
        }
      );

      workerPromises.push(promise);
    }

    // Wait for all workers to complete (with cancellation check)
    const results = await Promise.allSettled(workerPromises);
    
    // Check if cancelled
    if (store.getState().async.cancelled) {
      pool.terminate();
      store.dispatch(actions.addLog('Carregamento cancelado'));
      return null;
    }
    
    const finalCount = getWriteIndex(buffers.writeIndex);
    const loadEndTime = performance.now();
    const loadTimeMs = loadEndTime - startTime;
    
    store.dispatch(actions.setBulkLoaded(finalCount));
    store.dispatch(actions.setProgress(100));
    store.dispatch(actions.addLog(`Carregamento concluído: ${finalCount} cidades carregadas em ${(loadTimeMs / 1000).toFixed(2)}s`));

    // Check for errors
    const errors = results.filter(r => r.status === 'rejected');
    if (errors.length > 0) {
      store.dispatch(actions.addLog(`Aviso: ${errors.length} workers falharam`));
      // Log error details
      errors.forEach((error, idx) => {
        const reason = error.reason?.message || error.reason || 'Erro desconhecido';
        store.dispatch(actions.addLog(`  Worker ${idx + 1} falhou: ${reason}`));
      });
    }

    // Terminate pool
    pool.terminate();

    // Map IDs from local indices
    const cities = [];
    for (let i = 0; i < Math.min(finalCount, buffers.capacity); i++) {
      const localIndex = buffers.localIndices[i];
      if (localIndex >= 0 && buffers.idsLocal[localIndex]) {
        cities.push({
          id: buffers.idsLocal[localIndex],
          latitude: buffers.latitudes[i],
          longitude: buffers.longitudes[i],
          population: buffers.populations[i]
        });
      }
    }

    store.dispatch(actions.addLog(`Preparando ${finalCount} cidades para K-means (k=${k})...`));
    
    // Log selected cities for clustering
    if (cities.length > 0) {
      const cityIds = cities.map(c => c.id);
      const maxDisplay = 30;
      if (cityIds.length <= maxDisplay) {
        store.dispatch(actions.addLog(`Cidades selecionadas para clustering (${cityIds.length}): ${cityIds.join(', ')}`));
      } else {
        const displayedIds = cityIds.slice(0, maxDisplay);
        store.dispatch(actions.addLog(`Cidades selecionadas para clustering (${cityIds.length}): ${displayedIds.join(', ')}... (+${cityIds.length - maxDisplay} mais)`));
      }
    } else {
      store.dispatch(actions.addLog(`Nenhuma cidade disponível para clustering`));
      // Diagnostic: check if there are any IDs in idsLocal array
      const idsInBuffer = buffers.idsLocal.filter(id => id != null).length;
      if (idsInBuffer > 0) {
        store.dispatch(actions.addLog(`Diagnóstico: ${idsInBuffer} IDs encontrados em idsLocal, mas writeIndex=${finalCount}`));
      }
    }

    // Check for cancellation before K-means
    if (store.getState().async.cancelled) {
      return null;
    }

    // Start K-means clustering
    const kmeansStartTime = performance.now();
    store.dispatch(actions.setStatus('clustering'));
    store.dispatch(actions.setProgress(0));
    store.dispatch(actions.addLog(`Iniciando K-means com k=${k}...`));

    const kmeansWorkerCount = Math.max(2, Math.min(8, workerCount));

    const kmeansResult = await runKmeans(buffers, k, {
      maxIter: 100,
      epsilon: 0.0001,
      workerCount: kmeansWorkerCount,
      isCancelled: () => store.getState().async.cancelled,
      onPoolCreated: (pool) => {
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

    const kmeansEndTime = performance.now();
    const kmeansTimeMs = kmeansEndTime - kmeansStartTime;
    const totalTimeMs = kmeansEndTime - startTime;

    store.dispatch(actions.addLog(`K-means concluído em ${kmeansResult.iterations} iterações em ${(kmeansTimeMs / 1000).toFixed(2)}s`));
    store.dispatch(actions.addLog(`Clusters criados: ${kmeansResult.clusters.length}`));
    
    // Log cluster sizes
    kmeansResult.clusterSizes.forEach((size, i) => {
      store.dispatch(actions.addLog(`Cluster ${i}: ${size} cidades`));
    });

    // Update state with results and metrics
    store.dispatch(actions.setClusters(kmeansResult.clusters));
    store.dispatch(actions.setKmeansIterations(kmeansResult.iterations));
    store.dispatch(actions.setKmeansStatus('done'));
    store.dispatch(actions.setKmeansMetrics({
      loadTimeMs,
      kmeansTimeMs,
      totalTimeMs,
      workersUsed: kmeansWorkerCount
    }));
    store.dispatch(actions.setProgress(100));
    store.dispatch(actions.setStatus('done'));
    store.dispatch(actions.addLog(`Processo concluído em ${(totalTimeMs / 1000).toFixed(2)}s total!`));

  } catch (error) {
    // Check if it was a cancellation
    if (error.message === 'K-means cancelled' || store.getState().async.cancelled) {
      store.dispatch(actions.addLog('K-means cancelado pelo usuário'));
      store.dispatch(actions.setStatus('idle'));
      return null;
    }
    
    // Handle other errors
    const errorMessage = error.message || 'Erro desconhecido';
    store.dispatch(actions.setError(errorMessage));
    store.dispatch(actions.setStatus('error'));
    store.dispatch(actions.addLog(`Erro: ${errorMessage}`));
    
    // Keep UI functional - don't crash
    console.error('Error during bulk load/kmeans:', error);
  }
  
  return null;
}
