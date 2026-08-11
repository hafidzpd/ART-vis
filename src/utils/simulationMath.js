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
