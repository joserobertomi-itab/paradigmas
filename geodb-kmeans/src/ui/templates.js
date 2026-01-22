// City card template
export function cityCard(city, showAddButton = true, isSelected = false) {
  if (!city) return '';
  
  const name = city.name || 'Unknown';
  const country = city.country || 'Unknown';
  const population = city.population ? city.population.toLocaleString() : 'N/A';
  const lat = city.latitude || 'N/A';
  const lon = city.longitude || 'N/A';
  
  let buttonHTML;
  if (showAddButton) {
    const disabled = isSelected ? 'disabled' : '';
    const disabledClass = isSelected ? 'btn-disabled' : '';
    buttonHTML = `<button class="btn btn-primary btn-small ${disabledClass}" data-action="add-city" data-city-id="${city.id}" ${disabled}>${isSelected ? 'Já selecionada' : 'Adicionar'}</button>`;
  } else {
    buttonHTML = `<button class="btn btn-secondary btn-small" data-action="remove-city" data-city-id="${city.id}">Remover</button>`;
  }

  return `
    <div class="city-card" data-city-id="${city.id}">
      <div class="city-info">
        <h3 class="city-name">${escapeHtml(name)}</h3>
        <p class="city-country">${escapeHtml(country)}</p>
        <div class="city-details">
          <span class="city-population">População: ${population}</span>
          <span class="city-coords">Lat: ${lat}, Lon: ${lon}</span>
        </div>
      </div>
      <div class="city-actions">
        ${buttonHTML}
      </div>
    </div>
  `;
}

// Results list template
export function resultsList(cities, selectedIds = new Set()) {
  if (!Array.isArray(cities) || cities.length === 0) {
    return '<div class="empty-state">Nenhum resultado encontrado</div>';
  }

  return cities.map(city => cityCard(city, true, selectedIds.has(city.id))).join('');
}

// Selected cities list template
export function selectedCitiesList(cities) {
  if (!Array.isArray(cities) || cities.length === 0) {
    return '<div class="empty-state">Nenhuma cidade selecionada</div>';
  }

  return cities.map(city => cityCard(city, false)).join('');
}

// Page info template
export function pageInfo(currentPage, totalLoaded) {
  return `
    <span class="page-info-text">
      Página: <strong>${currentPage}</strong> | 
      Total carregado: <strong>${totalLoaded}</strong>
    </span>
  `;
}

// Status template
export function statusBadge(status) {
  const statusClass = `status-${status}`;
  return `<span class="status-text ${statusClass}">${escapeHtml(status)}</span>`;
}

// Progress bar template
export function progressBar(progress) {
  const progressValue = Math.max(0, Math.min(100, progress || 0));
  return `
    <div class="progress-container">
      <progress class="progress-bar" value="${progressValue}" max="100">${progressValue}%</progress>
      <span class="progress-text">${progressValue}%</span>
    </div>
  `;
}

// Logs template
export function logsTextarea(logs) {
  if (!Array.isArray(logs)) return '';
  return logs.join('\n');
}

// Cluster card template (detailed)
export function clusterCard(cluster, index, isVisible = true) {
  if (!cluster) return '';
  
  const centroid = cluster.centroid || {};
  const cities = cluster.cities || [];
  const size = cluster.size || cities.length;
  const displayStyle = isVisible ? '' : 'display: none;';

  const centroidLat = centroid.latitude?.toFixed(4) || 'N/A';
  const centroidLon = centroid.longitude?.toFixed(4) || 'N/A';
  const centroidPop = centroid.population ? Math.round(centroid.population).toLocaleString() : 'N/A';

  // Limit sample to 30 cities for performance
  const sampleCities = cities.slice(0, 30);
  const remainingCount = cities.length > 30 ? cities.length - 30 : 0;

  return `
    <div class="cluster-card-detailed" data-cluster-id="${index}" style="${displayStyle}">
      <div class="cluster-header">
        <h3 class="cluster-title">Cluster ${index} (n=${size})</h3>
      </div>
      <div class="cluster-centroid">
        <h4>Centroide</h4>
        <div class="centroid-details">
          <p><strong>Latitude:</strong> ${centroidLat}</p>
          <p><strong>Longitude:</strong> ${centroidLon}</p>
          <p><strong>População:</strong> ${centroidPop}</p>
        </div>
      </div>
      <div class="cluster-cities-list">
        <h4>Cidades (amostra)</h4>
        <div class="cities-sample">
          ${sampleCities.length > 0 
            ? sampleCities.map(city => `
                <div class="city-sample-item">
                  <span class="city-sample-name">${escapeHtml(city.name || 'Unknown')}</span>
                  <span class="city-sample-country">${escapeHtml(city.country || 'Unknown')}</span>
                  <span class="city-sample-pop">${city.population ? city.population.toLocaleString() : 'N/A'}</span>
                </div>
              `).join('')
            : '<div class="empty-state">Nenhuma cidade na amostra</div>'
          }
          ${remainingCount > 0 ? `<div class="cities-more">+${remainingCount} mais cidades neste cluster</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

// Cluster list template (with filter support)
export function clusterList(clusters, filterId = null) {
  if (!clusters || !Array.isArray(clusters) || clusters.length === 0) {
    return '<div class="empty-state">Nenhum cluster disponível</div>';
  }

  // Render clusters using document fragments for performance
  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.className = 'clusters-list-container';

  clusters.forEach((cluster, index) => {
    const isVisible = filterId === null || filterId === index;
    const cardHTML = clusterCard(cluster, index, isVisible);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cardHTML;
    container.appendChild(tempDiv.firstElementChild);
  });

  return container.outerHTML;
}

// Metrics panel template
export function metricsPanel(metrics) {
  if (!metrics) return '';

  const formatTime = (ms) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return `
    <div class="metrics-panel">
      <h3>Métricas</h3>
      <div class="metrics-grid">
        <div class="metric-item">
          <span class="metric-label">Tempo de carregamento:</span>
          <span class="metric-value">${formatTime(metrics.loadTimeMs || 0)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Tempo K-means:</span>
          <span class="metric-value">${formatTime(metrics.kmeansTimeMs || 0)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Tempo total:</span>
          <span class="metric-value">${formatTime(metrics.totalTimeMs || 0)}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Iterações:</span>
          <span class="metric-value">${metrics.iterations || 0}</span>
        </div>
        <div class="metric-item">
          <span class="metric-label">Workers usados:</span>
          <span class="metric-value">${metrics.workersUsed || 0}</span>
        </div>
      </div>
    </div>
  `;
}

// Helper: escape HTML
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
