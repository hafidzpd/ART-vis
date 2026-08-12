/**
 * Calculates the minimum physical turning radius.
 * R = wheelbase / tan(angle)
 */
export const calculatePhysicalRadius = (wheelbase, maxSteeringAngle) => {
  if (maxSteeringAngle <= 0) return Infinity;
  const angleRad = (maxSteeringAngle * Math.PI) / 180;
  return wheelbase / Math.tan(angleRad);
};

/**
 * Calculates the inner and outer sweep radii of the vehicle body
 * for an ART (Autonomous Rail Rapid Transit) with All-Wheel Steering.
 * In this system, all axles follow the exact same path of radius R.
 *
 * @param {number} R - Turning radius of the axles' path (meters)
 * @param {number} width - Vehicle body width (meters)
 * @param {number} wheelbase - Distance between front and rear axles (meters)
 * @param {number} length - Total body length (meters)
 * @returns {{ rInner: number, rOuter: number, sweptWidth: number }}
 */
export const calculateSweepRadii = (R, width, wheelbase, length) => {
  // Since both front and rear axles lie on the circle of radius R,
  // the vehicle body acts as a secant line (chord) on this circle.
  // The distance from the turn center to the longitudinal centerline of the carriage:
  const R_center = Math.sqrt(Math.pow(R, 2) - Math.pow(wheelbase / 2, 2));

  // The innermost point is the belly (midpoint) of the inner side of the carriage.
  const rInner = R_center - (width / 2);

  // The outermost point is the front (and rear) outer corners of the carriage.
  // The corners are at a distance of length/2 from the midpoint along the secant.
  const rOuter = Math.sqrt(Math.pow(length / 2, 2) + Math.pow(R_center + width / 2, 2));

  const sweptWidth = rOuter - rInner;

  return { rInner: Math.max(0, rInner), rOuter, sweptWidth };
};

/**
 * Calculates the swept path width (simplified export for HUD display).
 */
export const calculateSweptPath = (targetRadius, width, wheelbase, length, clearance) => {
  const { sweptWidth } = calculateSweepRadii(targetRadius, width, wheelbase, length);
  return sweptWidth + clearance * 2;
};

/**
 * Checks for collisions in a 90-degree intersection for a right turn (LHT).
 */
export const checkIntersectionCollision = (config, laneWidth) => {
  const { targetRadius, width, wheelbase, length, roadWidthPerDirection, trainLaneWidth, intersectionMargin } = config;
  const R = targetRadius;
  const W = width;
  const L = length;
  const WB = wheelbase;

  const laneOff = (trainLaneWidth || 3.5) / 2;
  const halfRW = (roadWidthPerDirection || 10.5) + (intersectionMargin || 0);

  const { rInner, rOuter } = calculateSweepRadii(R, W, WB, L);

  // Turn geometry
  let acx = laneOff - R;
  let acy = -laneOff + R;

  // Realistic Overshoot Constraint:
  // A vehicle physically cannot start turning before the intersection begins.
  // So the arc center X (acx) cannot be less than -halfRW.
  // If the targetRadius is so large that acx would be < -halfRW, we must shift the entire turn right.
  // This causes the vehicle to finish the turn at a wider X coordinate (overshooting the lane).
  let overshotX = 0;
  if (acx < -halfRW) {
    const shift = -halfRW - acx;
    acx += shift; // acx is now strictly -halfRW
    overshotX = shift; // The destination path is shifted by this much!
  }

  let crashReasons = [];
  
  // 1. Physical limit
  const minR = calculatePhysicalRadius(WB, config.maxSteeringAngle);
  if (R < minR) {
    crashReasons.push(`Radius ${R.toFixed(1)}m lebih tajam dari batas fisik (${minR.toFixed(1)}m)`);
  }

  // If overshot, the vehicle deviates from the lane
  if (overshotX > 0.1) {
    crashReasons.push(`Melenceng dari lajur tujuan sejauh ${overshotX.toFixed(1)}m karena sudut belok kurang tajam.`);
  }

  // 2. Outer Crashes (Hitting Sidewalk/Curbs)
  // Top-Left Wall (swing out at start)
  if (acy - rOuter < -halfRW) {
    crashReasons.push(`Bodi luar menabrak trotoar jalan asal`);
  }
  // Bottom-Right Wall (swing out at end)
  if (acx + rOuter > halfRW) {
    crashReasons.push(`Bodi luar menabrak trotoar jalan tujuan`);
  }
  // Top-Right Corner (cutting the corner sidewalk)
  const distToTR = Math.sqrt(Math.pow(halfRW - acx, 2) + Math.pow(-halfRW - acy, 2));
  if (distToTR < rOuter) {
    crashReasons.push(`Bodi luar naik ke trotoar sudut perempatan`);
  }

  // 3. Inner Crashes (Hitting Medians)
  if (rInner > Math.abs(acy)) {
    const x_int = acx + Math.sqrt(Math.pow(rInner, 2) - Math.pow(acy, 2));
    if (x_int < -halfRW) crashReasons.push(`Bodi dalam menabrak median jalan asal`);
    if (x_int > halfRW) crashReasons.push(`Bodi dalam menabrak median seberang`);
  }

  if (rInner > Math.abs(acx)) {
    const y_int = acy - Math.sqrt(Math.pow(rInner, 2) - Math.pow(acx, 2));
    if (y_int > halfRW) crashReasons.push(`Bodi dalam menabrak median jalan tujuan`);
    if (y_int < -halfRW) crashReasons.push(`Bodi dalam menabrak median atas`);
  }

  return {
    isCrash: crashReasons.length > 0,
    crashReasons,
    overshotX, // Return this so the canvas can draw the shifted path!
    acx,
    acy
  };
};

/**
 * Finds the optimal target radius that produces no collisions.
 */
export const findOptimalRadius = (config, laneWidth) => {
  const minR = Math.ceil(calculatePhysicalRadius(config.wheelbase, config.maxSteeringAngle));
  
  // Try radii from minR up to 100
  for (let R = minR; R <= 100; R++) {
    const testConfig = { ...config, targetRadius: R };
    const { isCrash } = checkIntersectionCollision(testConfig, laneWidth);
    if (!isCrash) return R;
  }
  return null; // No safe radius found
};

