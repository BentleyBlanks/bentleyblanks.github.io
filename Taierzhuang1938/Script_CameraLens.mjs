// Full-frame vertical field of view, shared by scene and menu cameras.
export function FovFromFocalMm(focalMm, sensorHeightMm = 24) {
  const f = Math.max(4, focalMm || 50);
  return (2 * Math.atan(sensorHeightMm / (2 * f)) * 180) / Math.PI;
}
