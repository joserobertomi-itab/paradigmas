import { qs, on } from '../ui/dom.js';
import * as actions from './actions.js';
import { selectK, selectSelectedCities, selectRadius, selectQuery, selectSort, selectPage, selectPageSize } from './selectors.js';
import { findCities } from '../api/geodbClient.js';
import { pageToOffset } from '../api/paging.js';
import { createSharedCityBuffers, getAllCities, writeCity } from '../workers/sharedMemory.js';
import { createWorkerPool } from '../workers/workerPool.js';
import RadiusFetchWorker from '../workers/radiusFetchWorker.js?worker&inline';
import { kmeans as runKmeans } from '../kmeans/kmeans.js';
import { kmeansSingle } from '../kmeans/kmeansSingle.js';
import { kmeansParallel } from '../kmeans/kmeansParallel.js';

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

/** Max capacity for progress display during fetch (actual buffer size is set after merge) */
const RADIUS_BULK_TARGET = 500_000;

/**
 * Start radius-based load and K-means clustering.
 *
 * Flow:
 * 1. Require at least one selected city and valid radius.
 * 2. Split reference city IDs across workers; each worker calls api/v1/cities/radius for its chunk.
 * 3. Main thread collects partial results, merges, dedupes, adds reference cities, writes to shared memory.
 * 4. Run K-means on the dataset in shared memory.
 *
 * @param {Object} store - Redux store
 * @param {Function} onPoolCreated - Callback when worker pool is created (for cancellation)
 * @returns {Promise<Object|null>} null
 */
async function startBulkLoadAndKmeans(store, onPoolCreated = null) {
  const state = store.getState();
  const k = selectK(state);
  const selectedCities = selectSelectedCities(state);
  const radiusKm = selectRadius(state);

  if (selectedCities.length < 1) {
    store.dispatch(actions.setError('Selecione ao menos uma cidade de referência.'));
    store.dispatch(actions.setStatus('error'));
    store.dispatch(actions.addLog('Erro: nenhuma cidade de referência selecionada.'));
    return null;
  }

  if (typeof radiusKm !== 'number' || radiusKm <= 0 || isNaN(radiusKm)) {
    store.dispatch(actions.setError('Raio deve ser um número positivo (km).'));
    store.dispatch(actions.setStatus('error'));
    store.dispatch(actions.addLog(`Erro: raio inválido: ${radiusKm}`));
    return null;
  }

  if (k < 2) {
    store.dispatch(actions.setError(`k deve ser >= 2. Valor atual: ${k}.`));
    store.dispatch(actions.setStatus('error'));
    store.dispatch(actions.addLog(`Erro: k=${k} é inválido (mínimo: 2)`));
    return null;
  }

  if (typeof SharedArrayBuffer === 'undefined') {
    store.dispatch(actions.setError('SharedArrayBuffer não disponível. Use HTTPS ou localhost.'));
    store.dispatch(actions.setStatus('error'));
    return null;
  }

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
  const hardwareConcurrency = navigator.hardwareConcurrency || 4;
  const maxWorkers = Math.max(2, Math.min(8, hardwareConcurrency));

  const referenceCityIds = selectedCities.map((c) => (typeof c.id === 'string' ? parseInt(c.id, 10) : c.id)).filter((id) => !isNaN(id));

  if (referenceCityIds.length === 0) {
    store.dispatch(actions.setError('IDs das cidades de referência inválidos.'));
    store.dispatch(actions.setStatus('error'));
    return null;
  }

  const fetchWorkerCount = Math.max(1, Math.min(maxWorkers, referenceCityIds.length));

  try {
    const startTime = performance.now();
    store.dispatch(actions.setStatus('loading'));
    store.dispatch(actions.clearLogs());
    store.dispatch(actions.addLog(`Carregando cidades dentro de ${radiusKm} km de ${referenceCityIds.length} cidade(s) de referência com ${fetchWorkerCount} workers...`));
    store.dispatch(actions.setProgress(0));
    store.dispatch(actions.setBulkLoaded(0));
    store.dispatch(actions.setBulkTotalTarget(RADIUS_BULK_TARGET));

    let fetchPool;
    try {
      fetchPool = createWorkerPool({ size: fetchWorkerCount, WorkerConstructor: RadiusFetchWorker });
    } catch (poolErr) {
      const poolMsg = (poolErr && (poolErr.message ?? poolErr.error?.message)) || String(poolErr);
      store.dispatch(actions.setError(`Falha ao criar workers de carregamento: ${poolMsg}`));
      store.dispatch(actions.setStatus('error'));
      store.dispatch(actions.addLog(`Erro: ${poolMsg}`));
      console.error('createWorkerPool error:', poolErr);
      return null;
    }
    if (onPoolCreated) {
      onPoolCreated(fetchPool);
    }

    const partialCitiesByWorker = [];
    for (let w = 0; w < fetchWorkerCount; w++) {
      partialCitiesByWorker.push([]);
    }

    const runTask = (workerId) => {
      const chunk = [];
      for (let i = workerId; i < referenceCityIds.length; i += fetchWorkerCount) {
        chunk.push(referenceCityIds[i]);
      }
      return fetchPool.runTask(
        {
          workerId,
          referenceCityIds: chunk,
          radiusKm,
          apiBaseUrl
        },
        (msg) => {
          if (msg.type === 'radius-result' && msg.payload?.cities) {
            partialCitiesByWorker[msg.payload.workerId] = msg.payload.cities;
            const totalSoFar = partialCitiesByWorker.reduce((sum, arr) => sum + arr.length, 0);
            store.dispatch(actions.setBulkLoaded(totalSoFar));
            store.dispatch(actions.addLog(`Worker ${msg.payload.workerId}: ${msg.payload.cities.length} cidades dentro do raio.`));
          }
        }
      );
    };

    const tasks = [];
    for (let i = 0; i < fetchWorkerCount; i++) {
      if (store.getState().async.cancelled) break;
      tasks.push(runTask(i));
    }

    await Promise.all(tasks);
    fetchPool.terminate();
    if (onPoolCreated) onPoolCreated(null);

    if (store.getState().async.cancelled) {
      store.dispatch(actions.addLog('Operação cancelada após carregamento.'));
      return null;
    }

    const allPartial = partialCitiesByWorker.flat();
    const cityMap = new Map();
    for (const city of allPartial) {
      if (city && city.id != null) {
        cityMap.set(String(city.id), city);
      }
    }
    for (const ref of selectedCities) {
      const id = String(ref.id);
      if (!cityMap.has(id)) {
        cityMap.set(id, {
          id,
          latitude: ref.latitude ?? ref.lat ?? 0,
          longitude: ref.longitude ?? ref.lng ?? 0,
          population: ref.population ?? 0,
          name: ref.name ?? '',
          country: ref.country ?? ''
        });
      }
    }

    const mergedList = Array.from(cityMap.values());

    const buffers = createSharedCityBuffers(mergedList.length);

    buffers.writeIndex[0] = 0;
    const idToMeta = {};
    for (let i = 0; i < mergedList.length; i++) {
      const city = mergedList[i];
      writeCity(buffers, city, i);
      buffers.idsLocal[i] = String(city.id);
      idToMeta[String(city.id)] = { name: city.name ?? '', country: city.country ?? '' };
    }

    const count = mergedList.length;
    store.dispatch(actions.setBulkLoaded(count));
    store.dispatch(actions.setProgress(100));
    store.dispatch(actions.addLog(`Dataset: ${count} cidade(s) (referências + raio).`));

    if (count < 2) {
      store.dispatch(actions.setError('Poucas cidades para K-means (mínimo 2). Selecione mais cidades ou aumente o raio.'));
      store.dispatch(actions.setStatus('error'));
      return null;
    }

    if (k > count) {
      store.dispatch(actions.setError(`k (${k}) não pode ser maior que o número de cidades (${count}).`));
      store.dispatch(actions.setStatus('error'));
      store.dispatch(actions.addLog(`Erro: k=${k} > dataset.length=${count}`));
      return null;
    }

    const finalDataset = getAllCities(buffers);
    const loadTimeMs = performance.now() - startTime;
    store.dispatch(actions.addLog(`Dataset preparado: ${finalDataset.length} cidade(s), k=${k}. Iniciando K-means...`));

    if (store.getState().async.cancelled) {
      store.dispatch(actions.addLog('Operação cancelada antes de iniciar K-means.'));
      return null;
    }

    const kmeansStartTime = performance.now();
    store.dispatch(actions.setStatus('clustering'));
    store.dispatch(actions.setProgress(0));
    const kmeansWorkerCount = Math.max(2, Math.min(8, hardwareConcurrency - 1));
    store.dispatch(actions.addLog(`K-means paralelo com ${kmeansWorkerCount} workers (k=${k})...`));

    let kmeansResult;
    let workersUsed = kmeansWorkerCount;

    try {
      kmeansResult = await kmeansParallel(finalDataset, k, {
        maxIter: 100,
        epsilon: 0.0001,
        seed: Date.now(),
        workerCount: kmeansWorkerCount,
        isCancelled: () => store.getState().async.cancelled,
        onPoolCreated: (pool) => {
          if (onPoolCreated) onPoolCreated(pool);
        },
        onProgress: (progress) => {
          const progressPercent = Math.min(100, Math.round((progress.iteration / 100) * 100));
          store.dispatch(actions.setProgress(progressPercent));
          store.dispatch(actions.setKmeansIterations(progress.iteration));
          store.dispatch(actions.addLog(`Iteração ${progress.iteration}: mudança média = ${progress.avgChange.toFixed(6)}`));
          if (progress.converged) {
            store.dispatch(actions.addLog('Convergência atingida!'));
          }
        }
      });
    } catch (error) {
      if (error.message === 'K-means cancelled') {
        throw error;
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
            store.dispatch(actions.addLog('Convergência atingida!'));
          }
        }
      });
    }

    const kmeansTimeMs = performance.now() - kmeansStartTime;
    const totalTimeMs = performance.now() - startTime;

    store.dispatch(actions.addLog(`K-means concluído em ${kmeansResult.iterations} iterações em ${(kmeansTimeMs / 1000).toFixed(2)}s`));
    store.dispatch(actions.addLog(`Clusters criados: ${kmeansResult.clusters.length}`));
    kmeansResult.clusterSizes.forEach((size, i) => {
      store.dispatch(actions.addLog(`Cluster ${i}: ${size} cidade(s)`));
    });

    const enrichCity = (c) => ({
      ...c,
      name: idToMeta[c.id]?.name ?? 'Unknown',
      country: idToMeta[c.id]?.country ?? 'Unknown'
    });
    const formattedClusters = kmeansResult.clusters.map((cluster, index) => {
      const cities = (cluster.cities || []).map(enrichCity);
      return {
        index,
        size: cluster.size || 0,
        centroid: cluster.centroid || {},
        cities,
        sampleCities: cities.slice(0, 30)
      };
    });

    const assignmentsById = {};
    if (kmeansResult.assignments && finalDataset.length <= 10000) {
      for (let i = 0; i < finalDataset.length && i < kmeansResult.assignments.length; i++) {
        const city = finalDataset[i];
        if (city && city.id) {
          assignmentsById[String(city.id)] = kmeansResult.assignments[i];
        }
      }
    }

    store.dispatch(actions.setClusters(formattedClusters));
    store.dispatch(actions.setKmeansIterations(kmeansResult.iterations));
    store.dispatch(actions.setKmeansStatus('done'));
    store.dispatch(actions.setKmeansMetrics({
      loadTimeMs,
      kmeansTimeMs,
      totalTimeMs,
      workersUsed,
      k,
      datasetSize: finalDataset.length,
      radiusKm,
      assignmentsById: Object.keys(assignmentsById).length > 0 ? assignmentsById : null
    }));
    store.dispatch(actions.setProgress(100));
    store.dispatch(actions.setStatus('done'));
    store.dispatch(actions.addLog(`Processo concluído em ${(totalTimeMs / 1000).toFixed(2)}s total!`));
  } catch (error) {
    const msg = (error && (error.message ?? error.error?.message ?? (typeof error === 'string' ? error : null))) || String(error);
    if (msg === 'K-means cancelled' || store.getState().async.cancelled) {
      store.dispatch(actions.addLog('Operação cancelada pelo usuário'));
      store.dispatch(actions.setStatus('idle'));
      store.dispatch(actions.setProgress(0));
      return null;
    }
    store.dispatch(actions.setError(`Erro durante processamento: ${msg}`));
    store.dispatch(actions.setStatus('error'));
    store.dispatch(actions.addLog(`Erro: ${msg}`));
    console.error('Error during bulk load/kmeans:', error);
    if (error && error.stack) console.error(error.stack);
  }

  return null;
}
