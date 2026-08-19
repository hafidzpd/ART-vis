/**
 * Scale Configuration for ART-Vis Satellite Image Validator
 * 
 * Central location for the pixel-to-meter conversion ratio.
 * This value determines how vehicle dimensions (in meters) map to
 * pixel sizes on the satellite image.
 * 
 * HOW TO CALIBRATE:
 * 1. Use the Developer Mode tracing tool to measure a known distance 
 *    on the satellite image (e.g., a road segment of known length).
 * 2. Count the pixel distance between two points.
 * 3. PIXELS_PER_METER = pixel_distance / real_world_meters
 * 
 * Example: If a 100m road segment spans 450 pixels → PIXELS_PER_METER = 4.5
 */

// =============================================
//  PRIMARY SCALE CONSTANT
// =============================================

/** 
 * Conversion ratio: how many pixels in the satellite image represent 1 meter.
 * Adjust this value after calibrating with the tracing tool.
 */
export const PIXELS_PER_METER = 4.5;

// =============================================
//  MAP IMAGE CONFIGURATION
// =============================================

/** Path to the satellite image in the public folder */
export const MAP_IMAGE_PATH = '/map-belokan-bgjunction.png';

// =============================================
//  CONVERSION HELPERS
// =============================================

/**
 * Convert a real-world measurement in meters to pixel units on the map.
 * @param {number} meters - Distance in meters
 * @returns {number} Distance in pixels
 */
export const metersToPixels = (meters) => meters * PIXELS_PER_METER;

/**
 * Convert pixel distance on the map to real-world meters.
 * @param {number} pixels - Distance in pixels
 * @returns {number} Distance in meters
 */
export const pixelsToMeters = (pixels) => pixels / PIXELS_PER_METER;
