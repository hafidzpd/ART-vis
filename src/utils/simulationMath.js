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
 * when the vehicle center (rear axle) follows a circular path of radius R.
 *
 * @param {number} R - Turning radius of vehicle center path (meters)
 * @param {number} width - Vehicle body width (meters)
 * @param {number} wheelbase - Distance between axles (meters)
 * @param {number} length - Total body length (meters)
 * @returns {{ rInner: number, rOuter: number, sweptWidth: number }}
 */
export const calculateSweepRadii = (R, width, wheelbase, length) => {
  // Inner body edge = rear body edge toward turn center
  const rInner = R - (width / 2);

  // Outer body edge = front corner away from turn center
  // Front overhang extends beyond front axle
  const frontOverhang = (length - wheelbase) / 2;
  const rOuter = Math.sqrt(Math.pow(R + width / 2, 2) + Math.pow(wheelbase + frontOverhang, 2));

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
  const { targetRadius, width, wheelbase, length, lanesPerDirection, intersectionMargin } = config;
  const R = targetRadius;
  const W = width;
  const L = length;
  const WB = wheelbase;

  const laneOff = laneWidth / 2;
  const halfRW = (lanesPerDirection * laneWidth) + (intersectionMargin || 0);

  const { rInner, rOuter } = calculateSweepRadii(R, W, WB, L);

  // Turn geometry
  const acx = laneOff - R;
  const acy = -laneOff + R;

  let crashReasons = [];
  
  // 1. Physical limit
  const minR = calculatePhysicalRadius(WB, config.maxSteeringAngle);
  if (R < minR) {
    crashReasons.push(`Radius ${R}m lebih kecil dari batas fisik roda (${minR.toFixed(1)}m)`);
  }

  // 2. Outer Crashes (Hitting Sidewalk/Curbs)
  // Top-Left Wall (swing out at start)
  if (acy - rOuter < -halfRW) {
    crashReasons.push(`Bodi luar menabrak trotoar jalan asal (swing-out)`);
  }
  // Bottom-Right Wall (swing out at end)
  if (acx + rOuter > halfRW) {
    crashReasons.push(`Bodi luar menabrak trotoar jalan tujuan (swing-out)`);
  }
  // Top-Right Corner (cutting the corner sidewalk)
  const distToTR = Math.sqrt(Math.pow(halfRW - acx, 2) + Math.pow(-halfRW - acy, 2));
  if (distToTR < rOuter) {
    crashReasons.push(`Bodi luar naik ke trotoar sudut perempatan`);
  }

  // 3. Inner Crashes (Hitting Medians)
  if (rInner > Math.abs(acy)) {
    const x_int = acx + Math.sqrt(Math.pow(rInner, 2) - Math.pow(acy, 2));
    if (x_int < -halfRW) crashReasons.push(`Bodi dalam menabrak median jalan asal (belok terlalu awal)`);
    if (x_int > halfRW) crashReasons.push(`Bodi dalam menabrak median jalan seberang`);
  }

  if (rInner > Math.abs(acx)) {
    const y_int = acy - Math.sqrt(Math.pow(rInner, 2) - Math.pow(acx, 2));
    if (y_int > halfRW) crashReasons.push(`Bodi dalam menabrak median jalan tujuan (belok terlalu lambat)`);
    if (y_int < -halfRW) crashReasons.push(`Bodi dalam menabrak median jalan atas`);
  }

  return {
    isCrash: crashReasons.length > 0,
    crashReasons
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

