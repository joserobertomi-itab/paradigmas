import { qs, on } from '../ui/dom.js';
import * as actions from './actions.js';
import { selectK, selectQuery, selectSort, selectPage, selectPageSize } from './selectors.js';
import { findCities } from '../api/geodbClient.js';
import { pageToOffset } from '../api/paging.js';

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
    
    // Convert sort format: "population-desc", "population:desc", or "-population" -> "population" with order "desc"
    let sortParam = sort;
    if (sort.includes(':')) {
      sortParam = sort.split(':')[0];
    } else if (sort.includes('-') && !sort.startsWith('-')) {
      // Format: "population-desc"
      sortParam = sort.split('-')[0];
    } else if (sort.startsWith('-')) {
      sortParam = sort.substring(1);
    }

    store.dispatch(actions.addLog(`[Request #${newRequestId}] Parâmetros: query="${query}", sort="${sortParam}", page=${page}, offset=${offset}`));

    const result = await findCities({
      namePrefix: query || undefined,
      sort: sortParam,
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

  // Sort select
  const sortSelect = qs('#sort-select', root);
  if (sortSelect) {
    on(sortSelect, 'change', (e) => {
      store.dispatch(actions.setSort(e.target.value));
    });
  }

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
  if (processBtn) {
    on(processBtn, 'click', () => {
      const state = store.getState();
      const k = selectK(state);
      store.dispatch(actions.setStatus('loading'));
      // TODO: Call bulk load + kmeans service
      store.dispatch(actions.addLog(`Iniciando processamento com k=${k}...`));
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
}
