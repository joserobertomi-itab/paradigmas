/**
 * Convert page number to offset
 * @param {number} page - Page number (1-indexed)
 * @param {number} pageSize - Number of items per page
 * @returns {number} Offset value (0-indexed)
 */
export function pageToOffset(page, pageSize = 50) {
  if (page < 1) return 0;
  return (page - 1) * pageSize;
}

/**
 * Convert offset to page number
 * @param {number} offset - Offset value (0-indexed)
 * @param {number} pageSize - Number of items per page
 * @returns {number} Page number (1-indexed)
 */
export function offsetToPage(offset, pageSize = 10) {
  if (offset < 0) return 1;
  return Math.floor(offset / pageSize) + 1;
}

/**
 * Calculate total pages from total items
 * @param {number} totalItems - Total number of items
 * @param {number} pageSize - Number of items per page
 * @returns {number} Total number of pages
 */
export function calculateTotalPages(totalItems, pageSize = 10) {
  if (totalItems <= 0) return 0;
  return Math.ceil(totalItems / pageSize);
}
