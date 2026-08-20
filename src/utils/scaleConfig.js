/**
 * Google Maps Configuration for ART-Vis
 *
 * pixelsPerMeter is no longer a static constant — it is computed dynamically
 * from the Google Maps zoom level and latitude each render frame using:
 *
 *   metersPerPixel = (156543.03392 * cos(lat * π/180)) / 2^zoom
 *   pixelsPerMeter = 1 / metersPerPixel
 *
 * This file provides the initial map center and zoom for Surabaya.
 */

// =============================================
//  MAP CENTER & ZOOM (Surabaya, East Java)
// =============================================

/**
 * Initial center of the Google Map when the app loads.
 * Coordinates for Kota Surabaya, Jawa Timur, Indonesia.
 */
export const MAP_CENTER = {
  lat: -7.2575,
  lng: 112.7521,
};

/**
 * Initial zoom level.
 * 14 = city-level view; zoom in to street/junction level (17–19) for tracing.
 */
export const MAP_ZOOM = 14;

// =============================================
//  HELPERS (for non-Google-Maps contexts)
// =============================================

/**
 * Compute pixelsPerMeter for a given Google Maps zoom level and latitude.
 * @param {number} zoom - Google Maps zoom level
 * @param {number} lat  - Latitude in degrees
 * @returns {number} Pixels per meter at that zoom and latitude
 */
export const computePixelsPerMeter = (zoom, lat) => {
  const metersPerPixel = (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom);
  return 1 / metersPerPixel;
};
