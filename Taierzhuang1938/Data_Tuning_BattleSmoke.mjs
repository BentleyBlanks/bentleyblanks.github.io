// Linear working-space colors, art motion and quality budgets for ambient smoke.
// Six intentionally different silhouettes: column, billow, sheet, ribbon,
// low white screen, and a staggered dust eruption. Shared by scene and GPU test.
export const BATTLE_SMOKE_QUALITY = Object.freeze({
  low: { lobes: 8, steps: 8, opacity: 1.4 },
  medium: { lobes: 11, steps: 8, opacity: 1.15 },
  high: { lobes: 14, steps: 10, opacity: 1 },
  ultra: { lobes: 16, steps: 12, opacity: 1 },
});
// Denser 04–06 battlefield art direction: light is absorbed through each lobe,
// leaving deep cores and a lit, translucent outer shell. No global fog change.
export const BATTLE_SMOKE_LIGHTING = Object.freeze({ ambient: .24, direct: 1.05, extinction: 2.8 });
export const BATTLE_FIRE_QUALITY = Object.freeze({low:1024,medium:1536,high:2048,ultra:2048});
export const BATTLE_FIRE = Object.freeze({emission:1.2,hot:[2.6,.55,.06],cool:[.28,.015,.002]});
export const BATTLE_SMOKE_ROOT = Object.freeze({lobes:4,height:2.6,baseWidth:.6,crownWidth:3.0,life:4.8,opacity:.78});
export const BATTLE_SMOKE_STYLES = Object.freeze([
  { id: "sootColumn", tint: [.065,.061,.054], opticalDepth: 2.5, motion: [.10,.025,.10,.08] },
  { id: "billowColumn", tint: [.36,.345,.315], opticalDepth: 2.2, motion: [-.23,.060,.15,.14] },
  { id: "dustBank", tint: [.40,.28,.15], opticalDepth: 2.0, motion: [.16,.080,.10,.26] },
  { id: "windShear", tint: [.25,.24,.22], opticalDepth: 2.4, motion: [-.18,.075,.13,.22] },
  { id: "groundScreen", tint: [.64,.62,.57], opticalDepth: 2.0, motion: [.29,.065,.17,.18] },
  { id: "burstDust", tint: [.38,.255,.13], opticalDepth: 2.6, motion: [-.32,.090,.14,.12] },
].map(style=>Object.freeze({...style,tint:Object.freeze(style.tint),motion:Object.freeze(style.motion)})));
