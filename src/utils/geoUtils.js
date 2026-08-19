/**
 * GeoJSON Parser & Geographic Utilities for ART-Vis Route Validator
 * 
 * Handles:
 * - Parsing OpenStreetMap GeoJSON exports
 * - Road width calculation from OSM attributes
 * - Geographic coordinate → Canvas pixel projection (Mercator)
 * - Road boundary (offset polyline) generation for collision detection
 * - Path interpolation for vehicle movement
 */

// =============================================
//  CONSTANTS
// =============================================

/** Default road width in meters when no data is available */
const DEFAULT_ROAD_WIDTH = 7;

/** Assumed width per lane in meters */
const LANE_WIDTH_METERS = 3.5;

/** Earth's mean radius in meters (WGS84) */
const EARTH_RADIUS = 6371000;

/** Highway types to include (OSM hierarchy) */
const VALID_HIGHWAY_TYPES = [
  'motorway', 'motorway_link',
  'trunk', 'trunk_link',
  'primary', 'primary_link',
  'secondary', 'secondary_link',
  'tertiary', 'tertiary_link',
  'residential',
  'living_street',
  'service',
  'unclassified',
];

/** Visual styling per highway type */
export const ROAD_STYLES = {
  motorway:       { color: '#e88a36', width: 2.5, zIndex: 10 },
  motorway_link:  { color: '#e88a36', width: 1.5, zIndex: 9 },
  trunk:          { color: '#e88a36', width: 2.5, zIndex: 10 },
  trunk_link:     { color: '#e88a36', width: 1.5, zIndex: 9 },
  primary:        { color: '#fbbf24', width: 2.0, zIndex: 8 },
  primary_link:   { color: '#fbbf24', width: 1.5, zIndex: 7 },
  secondary:      { color: '#f8fafc', width: 1.8, zIndex: 6 },
  secondary_link: { color: '#f8fafc', width: 1.2, zIndex: 5 },
  tertiary:       { color: '#94a3b8', width: 1.5, zIndex: 4 },
  tertiary_link:  { color: '#94a3b8', width: 1.0, zIndex: 3 },
  residential:    { color: '#64748b', width: 1.0, zIndex: 2 },
  living_street:  { color: '#475569', width: 0.8, zIndex: 1 },
  service:        { color: '#475569', width: 0.6, zIndex: 0 },
  unclassified:   { color: '#64748b', width: 1.0, zIndex: 2 },
};

// =============================================
//  GEOJSON PARSING
// =============================================

/**
 * Parse a GeoJSON FeatureCollection and extract road features.
 * @param {Object} geojsonData - Parsed GeoJSON object
 * @returns {Array<Object>} Array of road segment objects
 */
export function parseGeoJSON(geojsonData) {
  if (!geojsonData || geojsonData.type !== 'FeatureCollection' || !Array.isArray(geojsonData.features)) {
    return [];
  }

  const roads = [];

  for (const feature of geojsonData.features) {
    // Only process LineString geometries with a highway property
    if (
      feature.geometry &&
      feature.geometry.type === 'LineString' &&
      feature.properties &&
      feature.properties.highway
    ) {
      const highway = feature.properties.highway;

      // Filter to known highway types
      if (!VALID_HIGHWAY_TYPES.includes(highway)) continue;

      const coords = feature.geometry.coordinates; // [[lon, lat], ...]
      if (!coords || coords.length < 2) continue;

      const width = getRoadWidth(feature);
      const name = feature.properties.name || '';
      const id = feature.properties['@id'] || feature.id || `road_${roads.length}`;

      roads.push({
        id,
        name,
        highway,
        width,        // meters
        oneway: feature.properties.oneway === 'yes',
        lanes: feature.properties.lanes ? parseInt(feature.properties.lanes, 10) : null,
        surface: feature.properties.surface || '',
        coords,       // [[lon, lat], ...] raw geographic coords
        style: ROAD_STYLES[highway] || ROAD_STYLES.unclassified,
      });
    }
  }

  // Sort by z-index so smaller roads draw first, bigger roads on top
  roads.sort((a, b) => (a.style.zIndex || 0) - (b.style.zIndex || 0));

  return roads;
}

/**
 * Determine road width in meters from GeoJSON feature properties.
 * Priority: width attribute > lanes * 3.5 > default 7m
 * @param {Object} feature - GeoJSON feature
 * @returns {number} Road width in meters
 */
export function getRoadWidth(feature) {
  const props = feature.properties || {};

  // 1. Explicit width attribute
  if (props.width) {
    const w = parseFloat(props.width);
    if (!isNaN(w) && w > 0) return w;
  }

  // 2. Calculate from lanes
  if (props.lanes) {
    const lanes = parseInt(props.lanes, 10);
    if (!isNaN(lanes) && lanes > 0) return lanes * LANE_WIDTH_METERS;
  }

  // 3. Default
  return DEFAULT_ROAD_WIDTH;
}

// =============================================
//  COORDINATE PROJECTION
// =============================================

/**
 * Haversine formula: distance in meters between two geographic points.
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lon1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lon2 - Longitude of point 2 (degrees)
 * @returns {number} Distance in meters
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Create a projection function that maps [lon, lat] → {x, y} canvas pixels.
 * Uses equirectangular approximation scaled by cos(centerLat) for longitude.
 * Auto-fits all roads to the canvas with padding.
 *
 * @param {Array<Object>} roads - Array of road objects from parseGeoJSON()
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {number} [padding=60] - Padding in pixels around the edges
 * @returns {Object} { transform, inverseTransform, metersPerPixel, bounds, center }
 */
export function createProjection(roads, canvasWidth, canvasHeight, padding = 60) {
  // 1. Find bounding box of all coordinates
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  for (const road of roads) {
    for (const [lon, lat] of road.coords) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  // 2. Convert geographic extent to meters (equirectangular approximation)
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  const metersPerDegLon = (Math.PI / 180) * EARTH_RADIUS * cosLat;
  const metersPerDegLat = (Math.PI / 180) * EARTH_RADIUS;

  const extentX_meters = (maxLon - minLon) * metersPerDegLon;
  const extentY_meters = (maxLat - minLat) * metersPerDegLat;

  // 3. Calculate scale to fit canvas (maintaining aspect ratio)
  const availW = canvasWidth - padding * 2;
  const availH = canvasHeight - padding * 2;

  const scaleX = availW / extentX_meters;
  const scaleY = availH / extentY_meters;
  const pixelsPerMeter = Math.min(scaleX, scaleY);

  const metersPerPixel = 1 / pixelsPerMeter;

  // 4. Center offset
  const renderedW = extentX_meters * pixelsPerMeter;
  const renderedH = extentY_meters * pixelsPerMeter;
  const offsetX = (canvasWidth - renderedW) / 2;
  const offsetY = (canvasHeight - renderedH) / 2;

  /**
   * Transform geographic [lon, lat] to canvas {x, y}.
   * Note: latitude is inverted (canvas y goes down, lat goes up).
   */
  function transform(lon, lat) {
    const mx = (lon - minLon) * metersPerDegLon;
    const my = (maxLat - lat) * metersPerDegLat; // flip Y
    return {
      x: offsetX + mx * pixelsPerMeter,
      y: offsetY + my * pixelsPerMeter,
    };
  }

  /**
   * Inverse transform: canvas {x, y} to geographic [lon, lat].
   */
  function inverseTransform(x, y) {
    const mx = (x - offsetX) / pixelsPerMeter;
    const my = (y - offsetY) / pixelsPerMeter;
    const lon = minLon + mx / metersPerDegLon;
    const lat = maxLat - my / metersPerDegLat;
    return [lon, lat];
  }

  return {
    transform,
    inverseTransform,
    metersPerPixel,
    pixelsPerMeter,
    bounds: { minLon, maxLon, minLat, maxLat },
    center: { lat: centerLat, lon: centerLon },
  };
}

/**
 * Project all road coordinates from geographic to canvas pixels.
 * Also calculates the total length of each road in meters.
 *
 * @param {Array<Object>} roads - Roads from parseGeoJSON()
 * @param {Function} transform - Transform function from createProjection()
 * @returns {Array<Object>} Roads with added `points` [{x,y}] and `lengthMeters` properties
 */
export function projectRoads(roads, transform) {
  return roads.map((road) => {
    const points = road.coords.map(([lon, lat]) => transform(lon, lat));

    // Calculate total road length in meters
    let lengthMeters = 0;
    for (let i = 1; i < road.coords.length; i++) {
      lengthMeters += haversineDistance(
        road.coords[i - 1][1], road.coords[i - 1][0],
        road.coords[i][1], road.coords[i][0]
      );
    }

    return {
      ...road,
      points,        // [{x, y}] canvas pixel coordinates
      lengthMeters,  // total length in meters
    };
  });
}

// =============================================
//  ROAD BOUNDARIES (OFFSET POLYLINES)
// =============================================

/**
 * Compute unit normal vector for a line segment.
 * The normal points to the LEFT of the direction from A to B.
 */
function segmentNormal(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { nx: 0, ny: -1 };
  return { nx: -dy / len, ny: dx / len };
}

/**
 * Generate offset polylines (left and right boundaries) for a road.
 * This creates the "trotoar" / curb edges.
 *
 * @param {Array<{x: number, y: number}>} points - Centerline points in canvas pixels
 * @param {number} halfWidthPx - Half of the road width in pixels
 * @returns {{ left: Array<{x,y}>, right: Array<{x,y}> }}
 */
export function generateOffsetPolyline(points, halfWidthPx) {
  if (points.length < 2) return { left: [], right: [] };

  const left = [];
  const right = [];

  for (let i = 0; i < points.length; i++) {
    let nx, ny;

    if (i === 0) {
      // First point: use the normal of the first segment
      const n = segmentNormal(points[0].x, points[0].y, points[1].x, points[1].y);
      nx = n.nx;
      ny = n.ny;
    } else if (i === points.length - 1) {
      // Last point: use the normal of the last segment
      const n = segmentNormal(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
      nx = n.nx;
      ny = n.ny;
    } else {
      // Middle point: average of the normals of adjacent segments (miter)
      const n1 = segmentNormal(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
      const n2 = segmentNormal(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      nx = (n1.nx + n2.nx) / 2;
      ny = (n1.ny + n2.ny) / 2;

      // Normalize the averaged normal
      const len = Math.sqrt(nx * nx + ny * ny);
      if (len > 0.001) {
        nx /= len;
        ny /= len;

        // Limit miter to prevent spikes at sharp angles
        const dot = n1.nx * n2.nx + n1.ny * n2.ny;
        const miterScale = Math.min(1 / Math.max(0.3, (1 + dot) / 2), 3);
        nx *= miterScale;
        ny *= miterScale;
      }
    }

    left.push({
      x: points[i].x + nx * halfWidthPx,
      y: points[i].y + ny * halfWidthPx,
    });
    right.push({
      x: points[i].x - nx * halfWidthPx,
      y: points[i].y - ny * halfWidthPx,
    });
  }

  return { left, right };
}

/**
 * Generate road boundaries for all projected roads.
 * @param {Array<Object>} projectedRoads - Roads with `points` and `width` properties
 * @param {number} pixelsPerMeter - Scale factor from projection
 * @returns {Array<Object>} Roads with added `boundaries` { left, right } properties
 */
export function generateAllBoundaries(projectedRoads, pixelsPerMeter) {
  return projectedRoads.map((road) => {
    const halfWidthPx = (road.width / 2) * pixelsPerMeter;
    const boundaries = generateOffsetPolyline(road.points, halfWidthPx);
    return { ...road, boundaries };
  });
}

// =============================================
//  PATH INTERPOLATION (for vehicle movement)
// =============================================

/**
 * Compute cumulative distances along a polyline (in pixels).
 * @param {Array<{x: number, y: number}>} points
 * @returns {Array<number>} Cumulative distance at each point
 */
export function computeCumulativeDistances(points) {
  const dists = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    dists.push(dists[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  return dists;
}

/**
 * Get position and heading angle along a polyline at a given distance.
 * @param {Array<{x: number, y: number}>} points - The path points
 * @param {Array<number>} cumulDists - Cumulative distances from computeCumulativeDistances()
 * @param {number} distance - Distance along the path in pixels
 * @returns {{ x: number, y: number, angle: number }} Position and heading
 */
export function getPositionAlongPath(points, cumulDists, distance) {
  const totalLength = cumulDists[cumulDists.length - 1];

  // Clamp to path bounds
  if (distance <= 0) {
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    return { x: points[0].x, y: points[0].y, angle: Math.atan2(dy, dx) };
  }
  if (distance >= totalLength) {
    const n = points.length;
    const dx = points[n - 1].x - points[n - 2].x;
    const dy = points[n - 1].y - points[n - 2].y;
    return { x: points[n - 1].x, y: points[n - 1].y, angle: Math.atan2(dy, dx) };
  }

  // Find the segment containing 'distance'
  for (let i = 1; i < cumulDists.length; i++) {
    if (distance <= cumulDists[i]) {
      const segLen = cumulDists[i] - cumulDists[i - 1];
      if (segLen === 0) continue;
      const t = (distance - cumulDists[i - 1]) / segLen;
      const x = points[i - 1].x + t * (points[i].x - points[i - 1].x);
      const y = points[i - 1].y + t * (points[i].y - points[i - 1].y);
      const angle = Math.atan2(
        points[i].y - points[i - 1].y,
        points[i].x - points[i - 1].x
      );
      return { x, y, angle };
    }
  }

  // Fallback (shouldn't reach here)
  const n = points.length;
  return { x: points[n - 1].x, y: points[n - 1].y, angle: 0 };
}

// =============================================
//  COLLISION DETECTION HELPERS
// =============================================

/**
 * Minimum distance from a point to a line segment.
 * @param {{x: number, y: number}} p - The point
 * @param {{x: number, y: number}} a - Segment start
 * @param {{x: number, y: number}} b - Segment end
 * @returns {number} Minimum distance in pixels
 */
export function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Segment is a point
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ex = p.x - projX;
  const ey = p.y - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Get the 4 corner points of a vehicle body given position, angle, length, width.
 * @param {number} x - Center x
 * @param {number} y - Center y
 * @param {number} angle - Heading angle in radians
 * @param {number} halfLength - Half of vehicle length in pixels
 * @param {number} halfWidth - Half of vehicle width in pixels
 * @returns {Array<{x: number, y: number}>} [frontLeft, frontRight, rearRight, rearLeft]
 */
export function getVehicleCorners(x, y, angle, halfLength, halfWidth) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  // Forward/backward along heading
  const fx = halfLength * cosA;
  const fy = halfLength * sinA;

  // Sideways (perpendicular to heading)
  const sx = halfWidth * (-sinA);
  const sy = halfWidth * cosA;

  return [
    { x: x + fx + sx, y: y + fy + sy },  // front-left
    { x: x + fx - sx, y: y + fy - sy },  // front-right
    { x: x - fx - sx, y: y - fy - sy },  // rear-right
    { x: x - fx + sx, y: y - fy + sy },  // rear-left
  ];
}

/**
 * Check if a point is within the road polygon formed by left and right boundaries.
 * Uses the "point to closest boundary distance" approach: 
 * if the point's distance to the centerline is less than half the road width, it's inside.
 *
 * @param {{x: number, y: number}} point - Point to test
 * @param {Array<{x: number, y: number}>} centerline - Road centerline points
 * @param {number} halfWidthPx - Half road width in pixels
 * @returns {boolean} true if point is within the road
 */
export function isPointOnRoad(point, centerline, halfWidthPx) {
  let minDist = Infinity;
  for (let i = 0; i < centerline.length - 1; i++) {
    const d = pointToSegmentDistance(point, centerline[i], centerline[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist <= halfWidthPx;
}

/**
 * Check collision of a vehicle (given its corner points) against a route's road boundaries.
 * Returns collision info.
 *
 * @param {Array<{x: number, y: number}>} corners - Vehicle corner points
 * @param {Array<Object>} routeSegments - Route road segments with `points` and `width` and `boundaries`
 * @param {number} pixelsPerMeter - Scale factor
 * @returns {{ isColliding: boolean, collisionPoints: Array<{x,y}> }}
 */
export function checkVehicleCollision(corners, routeSegments, pixelsPerMeter) {
  const collisionPoints = [];

  for (const corner of corners) {
    let onAnyRoad = false;

    for (const segment of routeSegments) {
      const halfWidthPx = (segment.width / 2) * pixelsPerMeter;
      if (isPointOnRoad(corner, segment.points, halfWidthPx)) {
        onAnyRoad = true;
        break;
      }
    }

    if (!onAnyRoad) {
      collisionPoints.push(corner);
    }
  }

  return {
    isColliding: collisionPoints.length > 0,
    collisionPoints,
  };
}

/**
 * Build a combined path from multiple route segments for the vehicle to follow.
 * Connects segments end-to-end, reversing segments if needed to form a continuous path.
 *
 * @param {Array<Object>} routeSegments - Selected road segments in order
 * @returns {Array<{x: number, y: number}>} Combined path points
 */
export function buildRoutePath(routeSegments) {
  if (routeSegments.length === 0) return [];

  const combined = [...routeSegments[0].points];

  for (let i = 1; i < routeSegments.length; i++) {
    const prevEnd = combined[combined.length - 1];
    const nextPoints = routeSegments[i].points;

    // Determine if we need to reverse the next segment
    const distToStart = Math.hypot(
      prevEnd.x - nextPoints[0].x,
      prevEnd.y - nextPoints[0].y
    );
    const distToEnd = Math.hypot(
      prevEnd.x - nextPoints[nextPoints.length - 1].x,
      prevEnd.y - nextPoints[nextPoints.length - 1].y
    );

    const ordered = distToEnd < distToStart ? [...nextPoints].reverse() : nextPoints;

    // Skip the first point if it's very close to the last point (avoid duplicates)
    const startIdx = Math.hypot(
      prevEnd.x - ordered[0].x,
      prevEnd.y - ordered[0].y
    ) < 2 ? 1 : 0;

    for (let j = startIdx; j < ordered.length; j++) {
      combined.push(ordered[j]);
    }
  }

  return combined;
}

/**
 * Hit-test: find which road segment a canvas point is closest to.
 * Used for click-to-select road interaction.
 *
 * @param {{x: number, y: number}} clickPoint - Click position in canvas pixels
 * @param {Array<Object>} projectedRoads - Roads with `points` arrays
 * @param {number} pixelsPerMeter - Scale factor
 * @param {number} [maxDistPx=20] - Maximum click distance in pixels
 * @returns {Object|null} The closest road, or null if none within range
 */
export function hitTestRoad(clickPoint, projectedRoads, pixelsPerMeter, maxDistPx = 20) {
  let bestRoad = null;
  let bestDist = maxDistPx;

  for (const road of projectedRoads) {
    // Use road visual width for hit area, minimum 10px
    const hitWidth = Math.max((road.width / 2) * pixelsPerMeter, 10);
    
    for (let i = 0; i < road.points.length - 1; i++) {
      const d = pointToSegmentDistance(clickPoint, road.points[i], road.points[i + 1]);
      if (d < bestDist && d < hitWidth) {
        bestDist = d;
        bestRoad = road;
      }
    }
  }

  return bestRoad;
}
