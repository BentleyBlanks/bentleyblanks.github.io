// Linear working-space colors, art motion and quality budgets for ambient smoke.
// Six intentionally different silhouettes: column, billow, sheet, ribbon,
// low white screen, and a staggered dust eruption. Shared by scene and GPU test.
export const BATTLE_SMOKE_QUALITY = Object.freeze({
  low: { lobes: 8, steps: 8, opacity: 1.4 },
  medium: { lobes: 11, steps: 8, opacity: 1.15 },
  high: { lobes: 14, steps: 10, opacity: 1 },
  ultra: { lobes: 16, steps: 12, opacity: 1 },
});
export const BATTLE_SMOKE_STYLES = Object.freeze([
  { id: "sootColumn", tint: [.085,.079,.072], motion: [.10,.025,.10,.08] },
  { id: "billowColumn", tint: [.52,.52,.49], motion: [-.23,.060,.15,.14] },
  { id: "dustBank", tint: [.46,.31,.16], motion: [.16,.080,.10,.26] },
  { id: "windShear", tint: [.28,.32,.34], motion: [-.18,.075,.13,.22] },
  { id: "groundScreen", tint: [.68,.67,.63], motion: [.29,.065,.17,.18] },
  { id: "burstDust", tint: [.42,.275,.13], motion: [-.32,.090,.14,.12] },
].map(style=>Object.freeze({...style,tint:Object.freeze(style.tint),motion:Object.freeze(style.motion)})));
