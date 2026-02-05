/**
 * Cluster plot: 2D scatter (lat/lon) with points colored by cluster and centroids marked.
 * Draws on a canvas; no external dependencies.
 */

const PADDING_DEG = 0.01;

const CLUSTER_COLORS = [
  '#e41a1c',
  '#377eb8',
  '#4daf4a',
  '#984ea3',
  '#ff7f00',
  '#ffff33',
  '#a65628',
  '#f781bf',
  '#999999',
  '#66c2a5'
];

function getClusterColor(index) {
  return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
}

function isValidCoord(lat, lon) {
  return (
    typeof lat === 'number' &&
    !Number.isNaN(lat) &&
    typeof lon === 'number' &&
    !Number.isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * Collect bounds (min/max lat/lon) from clusters (cities + centroids) with padding.
 */
function computeBounds(clusters) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const cluster of clusters) {
    const centroid = cluster.centroid || {};
    if (isValidCoord(centroid.latitude, centroid.longitude)) {
      minLat = Math.min(minLat, centroid.latitude);
      maxLat = Math.max(maxLat, centroid.latitude);
      minLon = Math.min(minLon, centroid.longitude);
      maxLon = Math.max(maxLon, centroid.longitude);
    }
    const cities = cluster.cities || cluster.sampleCities || [];
    for (const city of cities) {
      const lat = city.latitude ?? city.lat;
      const lon = city.longitude ?? city.lon;
      if (isValidCoord(lat, lon)) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
      }
    }
  }

  if (minLat === Infinity) {
    minLat = -90;
    maxLat = 90;
    minLon = -180;
    maxLon = 180;
  } else {
    const padLat = Math.max(PADDING_DEG, (maxLat - minLat) * 0.05 || PADDING_DEG);
    const padLon = Math.max(PADDING_DEG, (maxLon - minLon) * 0.05 || PADDING_DEG);
    minLat -= padLat;
    maxLat += padLat;
    minLon -= padLon;
    maxLon += padLon;
  }

  return { minLat, maxLat, minLon, maxLon };
}

/**
 * Map (lat, lon) to canvas (x, y). North is up.
 * Uses a single scale for both axes so the map aspect ratio is independent of
 * canvas shape and point distribution (no stretch).
 */
function toCanvas(lat, lon, bounds, width, height, padding) {
  const { minLat, maxLat, minLon, maxLon } = bounds;
  const rangeLon = maxLon - minLon || 1;
  const rangeLat = maxLat - minLat || 1;
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const scale = Math.min(innerW / rangeLon, innerH / rangeLat);
  const plotW = rangeLon * scale;
  const plotH = rangeLat * scale;
  const offsetX = padding + (innerW - plotW) / 2;
  const offsetY = padding + (innerH - plotH) / 2;
  const x = offsetX + ((lon - minLon) / rangeLon) * plotW;
  const y = offsetY + (1 - (lat - minLat) / rangeLat) * plotH;
  return { x, y };
}

/**
 * Draw cluster plot on the given canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<{ index?: number, centroid?: { latitude?: number, longitude?: number }, cities?: Array<{ latitude?: number, longitude?: number }>, sampleCities?: Array<{ latitude?: number, longitude?: number }> }>} clusters
 * @param {Object} options
 * @param {number} [options.padding=20] - pixel padding around plot
 * @param {number} [options.pointRadius=2] - radius for city points
 * @param {number} [options.centroidRadius=6] - radius for centroid marker
 */
export function drawClusterPlot(canvas, clusters, options = {}) {
  if (!canvas || !clusters || clusters.length === 0) return;

  const padding = options.padding ?? 20;
  const pointRadius = options.pointRadius ?? 2;
  const centroidRadius = options.centroidRadius ?? 6;

  const dpr = window.devicePixelRatio ?? 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(dpr, dpr);
  const cssWidth = rect.width;
  const cssHeight = rect.height;

  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const bounds = computeBounds(clusters);

  // Draw city points per cluster
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const clusterIndex = cluster.index !== undefined ? cluster.index : i;
    const color = getClusterColor(clusterIndex);
    const cities = cluster.cities || cluster.sampleCities || [];

    ctx.fillStyle = color;
    for (const city of cities) {
      const lat = city.latitude ?? city.lat;
      const lon = city.longitude ?? city.lon;
      if (!isValidCoord(lat, lon)) continue;
      const { x, y } = toCanvas(lat, lon, bounds, cssWidth, cssHeight, padding);
      ctx.beginPath();
      ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw centroids (larger, with stroke)
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const clusterIndex = cluster.index !== undefined ? cluster.index : i;
    const centroid = cluster.centroid || {};
    const lat = centroid.latitude;
    const lon = centroid.longitude;
    if (!isValidCoord(lat, lon)) continue;

    const color = getClusterColor(clusterIndex);
    const { x, y } = toCanvas(lat, lon, bounds, cssWidth, cssHeight, padding);

    ctx.fillStyle = color;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, centroidRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
