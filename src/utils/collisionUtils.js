/**
 * Collision Detection & Path Interpolation Utilities
 * for ART-Vis Satellite Image Validator
 */

// =============================================
//  PATH INTERPOLATION
// =============================================

/**
 * Compute cumulative distances along a polyline (in pixels).
 * @param {Array<{x: number, y: number}>} points
 * @returns {Array<number>} Cumulative distance at each point
 */
export function computeCumulativeDistances(points) {
  const dists = [0];
  if (!points || points.length === 0) return dists;
  
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
  if (!points || points.length === 0) return { x: 0, y: 0, angle: 0 };
  if (points.length === 1) return { x: points[0].x, y: points[0].y, angle: 0 };

  const totalLength = cumulDists[cumulDists.length - 1];

  // Extrapolate backwards if distance is negative
  if (distance <= 0) {
    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: points[0].x, y: points[0].y, angle: 0 };
    const nx = dx / len;
    const ny = dy / len;
    return { 
      x: points[0].x + distance * nx, 
      y: points[0].y + distance * ny, 
      angle: Math.atan2(dy, dx) 
    };
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

  // Fallback
  const n = points.length;
  return { x: points[n - 1].x, y: points[n - 1].y, angle: 0 };
}


// =============================================
//  KINEMATIC PATH TRACKING
// =============================================

/**
 * Generates a physically realizable path using a Kinematic Bicycle Model with Pure Pursuit.
 * If the target path corners are too sharp, the generated path will naturally understeer
 * and swing wide due to the maxSteeringAngle limit.
 */
export function generateRealizedPath(targetPath, wheelbase, maxSteeringAngle, pixelsPerMeter) {
  if (!targetPath || targetPath.length < 2) return targetPath;

  const maxSteerRad = maxSteeringAngle * (Math.PI / 180);
  
  // R_min = WB / tan(delta_max)
  // For ART (symmetric Multi-Axle steering), it behaves similarly, but Ackermann is standard baseline.
  // We use standard Ackermann or if user requested ART-specific, R_min = WB / (2 * tan(delta_max)).
  // Let's stick to standardAckermann or what App.jsx uses for physicalRadius.
  // Actually, ART AWS has roughly R_min = WB / tan(delta_max) if we consider the body centerline?
  // Let's use standard:
  const R_min = wheelbase / Math.tan(maxSteerRad);
  const kappa_max_m = 1 / R_min; // max curvature in meters
  const kappa_max_px = kappa_max_m / pixelsPerMeter; // max curvature in pixels

  const Ld_m = Math.max(wheelbase, 3.0); // Lookahead distance (meters). Tune this for "aggressiveness".
  const Ld_px = Ld_m * pixelsPerMeter;
  const step_px = 0.5 * pixelsPerMeter; // simulation resolution (pixels)

  const realizedPath = [];
  
  let x = targetPath[0].x;
  let y = targetPath[0].y;
  let dx = targetPath[1].x - targetPath[0].x;
  let dy = targetPath[1].y - targetPath[0].y;
  let theta = Math.atan2(dy, dx);
  
  realizedPath.push({ x, y });

  const cumulDists = computeCumulativeDistances(targetPath);
  const totalLength = cumulDists[cumulDists.length - 1];

  let currentDist = 0;
  
  // We limit iterations to prevent infinite loops (e.g. 100,000 steps ~ 50km at 0.5m step)
  for (let iter = 0; iter < 100000; iter++) {
    // 1. Find lookahead point
    let lookaheadPt = targetPath[targetPath.length - 1];
    let searchDist = currentDist;
    let found = false;
    
    while (searchDist <= totalLength) {
      const pt = getPositionAlongPath(targetPath, cumulDists, searchDist);
      const dist = Math.sqrt((pt.x - x)*(pt.x - x) + (pt.y - y)*(pt.y - y));
      if (dist >= Ld_px) {
        lookaheadPt = pt;
        found = true;
        break;
      }
      searchDist += step_px;
    }

    // 2. Pure pursuit control law
    const alpha = Math.atan2(lookaheadPt.y - y, lookaheadPt.x - x) - theta;
    const normalizedAlpha = Math.atan2(Math.sin(alpha), Math.cos(alpha));
    
    // Curvature kappa = 2*sin(alpha)/Ld
    let kappa = (2 * Math.sin(normalizedAlpha)) / Ld_px;
    
    // 3. Apply Steering Constraint (Saturation)
    kappa = Math.max(-kappa_max_px, Math.min(kappa_max_px, kappa));

    // 4. Update kinematic state
    theta += kappa * step_px;
    x += step_px * Math.cos(theta);
    y += step_px * Math.sin(theta);
    
    realizedPath.push({ x, y });

    // 5. Update progress (closest point on targetPath to (x,y))
    let bestD = currentDist;
    let minDist = Infinity;
    // search locally forward to avoid going backward
    for(let d = currentDist; d <= Math.min(currentDist + Ld_px * 2, totalLength); d += step_px) {
      const pt = getPositionAlongPath(targetPath, cumulDists, d);
      const dist = Math.sqrt((pt.x - x)*(pt.x - x) + (pt.y - y)*(pt.y - y));
      if (dist < minDist) {
        minDist = dist;
        bestD = d;
      }
    }
    currentDist = bestD;

    // 6. Check termination (reached the end)
    const endPt = targetPath[targetPath.length - 1];
    const distToEnd = Math.sqrt((endPt.x - x)*(endPt.x - x) + (endPt.y - y)*(endPt.y - y));
    if (distToEnd < step_px || currentDist >= totalLength - step_px) {
      realizedPath.push({ x: endPt.x, y: endPt.y });
      break;
    }
  }

  return realizedPath;
}

// =============================================
//  COLLISION DETECTION
// =============================================

/**
 * Get the 4 corner points of a vehicle body given position, angle, length, width.
 * @param {number} x - Center x (pixels)
 * @param {number} y - Center y (pixels)
 * @param {number} angle - Heading angle in radians
 * @param {number} halfLengthPx - Half of vehicle length in pixels
 * @param {number} halfWidthPx - Half of vehicle width in pixels
 * @returns {Array<{x: number, y: number}>} [frontLeft, frontRight, rearRight, rearLeft]
 */
export function getVehicleCorners(x, y, angle, halfLengthPx, halfWidthPx) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  // Forward/backward along heading
  const fx = halfLengthPx * cosA;
  const fy = halfLengthPx * sinA;

  // Sideways (perpendicular to heading)
  const sx = halfWidthPx * (-sinA);
  const sy = halfWidthPx * cosA;

  return [
    { x: x + fx + sx, y: y + fy + sy },  // front-left
    { x: x + fx - sx, y: y + fy - sy },  // front-right
    { x: x - fx - sx, y: y - fy - sy },  // rear-right
    { x: x - fx + sx, y: y - fy + sy },  // rear-left
  ];
}

/**
 * Check if two line segments intersect.
 * Uses 2D cross product.
 */
export function segmentsIntersect(a1, a2, b1, b2) {
  const crossProduct = (p1, p2, p3) => {
    return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  };

  const isPointOnSegment = (p, p1, p2) => {
    return p.x >= Math.min(p1.x, p2.x) && p.x <= Math.max(p1.x, p2.x) &&
           p.y >= Math.min(p1.y, p2.y) && p.y <= Math.max(p1.y, p2.y);
  };

  const d1 = crossProduct(b1, b2, a1);
  const d2 = crossProduct(b1, b2, a2);
  const d3 = crossProduct(a1, a2, b1);
  const d4 = crossProduct(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (d1 === 0 && isPointOnSegment(a1, b1, b2)) return true;
  if (d2 === 0 && isPointOnSegment(a2, b1, b2)) return true;
  if (d3 === 0 && isPointOnSegment(b1, a1, a2)) return true;
  if (d4 === 0 && isPointOnSegment(b2, a1, a2)) return true;

  return false;
}

/**
 * Check if a polygon (e.g., vehicle body) intersects with a polyline (e.g., boundary).
 * @param {Array<{x,y}>} polygonCorners - Points forming a closed polygon
 * @param {Array<{x,y}>} polylinePoints - Points forming an open polyline
 * @returns {boolean} True if they intersect
 */
export function checkPolygonVsPolyline(polygonCorners, polylinePoints) {
  if (!polygonCorners || polygonCorners.length < 3) return false;
  if (!polylinePoints || polylinePoints.length < 2) return false;

  const numCorners = polygonCorners.length;
  
  // For each edge of the polyline
  for (let i = 0; i < polylinePoints.length - 1; i++) {
    const b1 = polylinePoints[i];
    const b2 = polylinePoints[i + 1];
    
    // Check against each edge of the polygon
    for (let j = 0; j < numCorners; j++) {
      const p1 = polygonCorners[j];
      const p2 = polygonCorners[(j + 1) % numCorners]; // loop back to start
      
      if (segmentsIntersect(p1, p2, b1, b2)) {
        return true;
      }
    }
  }
  
  return false;
}
