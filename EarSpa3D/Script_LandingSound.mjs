// footprint 是可见耳垢的半宽/半高（毫米）；按等面积直径分档，长薄片不会仅凭长度变成重块。
export function LandingSound(chunk = {}) {
  if (chunk.toolId === 'suction') return { cue: 'vacuumSuck', gain: .3, sizeMm: 0, tier: 'suction' };
  const footprint = chunk.footprint;
  const sizeMm = chunk.fine ? .17 : footprint?.length === 2 && footprint.every(v => Number.isFinite(v) && v > 0)
    ? 2 * Math.sqrt(footprint[0] * footprint[1])
    : Number.isFinite(chunk.size) && chunk.size > 0 ? chunk.size * 2 : 0;
  const tier = sizeMm <= .8 ? 'small' : sizeMm <= 2.3 ? 'medium' : 'large';
  const cue = { small: 'waxLandSmall', medium: 'waxLandMedium', large: 'waxLandLarge' }[tier];
  return { cue, gain: { small: .45, medium: .6, large: .72 }[tier], sizeMm, tier };
}
