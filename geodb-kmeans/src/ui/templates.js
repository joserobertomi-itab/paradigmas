// City card template
export function cityCard(city, showAddButton = true) {
  if (!city) return '';
  
  const name = city.name || 'Unknown';
  const country = city.country || 'Unknown';
  const population = city.population ? city.population.toLocaleString() : 'N/A';
  const lat = city.latitude || 'N/A';
  const lon = city.longitude || 'N/A';
  
  const buttonHTML = showAddButton
    ? `<button class="btn btn-primary btn-small" data-action="add-city" data-city-id="${city.id}">Adicionar</button>`
    : `<button class="btn btn-secondary btn-small" data-action="remove-city" data-city-id="${city.id}">Remover</button>`;

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
export function resultsList(cities) {
  if (!Array.isArray(cities) || cities.length === 0) {
    return '<div class="empty-state">Nenhum resultado encontrado</div>';
  }

  return cities.map(city => cityCard(city, true)).join('');
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

// Cluster list template
export function clusterList(clusters) {
  if (!clusters || !Array.isArray(clusters) || clusters.length === 0) {
    return '<div class="empty-state">Nenhum cluster disponível</div>';
  }

  return clusters.map((cluster, index) => {
    const centroid = cluster.centroid || {};
    const cities = cluster.cities || [];
    const cityCount = cities.length;
    
    return `
      <div class="cluster-card" data-cluster-id="${index}">
        <h3 class="cluster-title">Cluster ${index + 1}</h3>
        <div class="cluster-info">
          <p><strong>Centroide:</strong> Lat: ${centroid.latitude?.toFixed(4) || 'N/A'}, Lon: ${centroid.longitude?.toFixed(4) || 'N/A'}</p>
          <p><strong>Cidades:</strong> ${cityCount}</p>
        </div>
        <div class="cluster-cities">
          ${cities.slice(0, 10).map(city => 
            `<span class="cluster-city-tag">${escapeHtml(city.name || 'Unknown')}</span>`
          ).join('')}
          ${cityCount > 10 ? `<span class="cluster-city-more">+${cityCount - 10} mais</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Helper: escape HTML
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
