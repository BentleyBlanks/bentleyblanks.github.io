// Shared explosive / earth response catalogue. Pure data; no renderer dependency.
// Historical fillings establish relative energy, NOT measured crater dimensions.
// Crater dimensions are gameplay estimates for dry soil and surface bursts.
// Sources and the distinction between evidence and tuning: docs/Data_ExplosionRange.md.
import { AERIAL_BOMBS } from "./Data_AerialBombs.mjs";

export const EXPLOSIVE_SOURCES = {
  M24: "https://ebadatelnavhm.vhu.sk/item/9/31",
  M24Filling: "https://en.wikipedia.org/wiki/Stielhandgranate_24",
  ChineseStickGrenade: "https://en.wikipedia.org/wiki/Type_67_hand_grenade",
  Type98Copy: "https://en.wikipedia.org/wiki/Type_98_grenade",
  JapaneseArmy: "https://www.bulletpicker.com/pdf/Japanese-Ammunition-Part-4.pdf",
  JapaneseOrdnance: "https://www.bulletpicker.com/pdf/TM-9-1985-5.pdf",
  MortarAnalogue: "https://www.bulletpicker.com/pdf/Catalog-of-Standard-Ordnance-Items-Vol-3.pdf",
  Frostbite: "https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/chapter5-andersson-terrain-rendering-in-frostbite.pdf",
  Cod: "https://cdn2.callofduty.com/assets/codbo/pdf/COD_NDS_OMAN_US_v4.pdf",
  JapaneseArtilleryWeights: "https://mobile.lonesentry.com/articles/ttt/japanese-weapons-artillery.html",
};

// 2026-10-20 shell impact range: heavier rounds. Their fillings are ESTIMATES —
// projectile weight from the Lone Sentry table times the Type 94 75 mm filling
// ratio (0.81 kg / 6.6 kg = 0.123); no identified filling figure was found.
const TYPE94_FILL_RATIO = 0.123;

// burst（落地扬尘怎么起，Data_Tuning_GroundImpact.GROUND_IMPACT_BURSTS）：缺省 = 带引信的炮弹 / 航弹，落地时略钻进土里才炸，掀土最多；
// "surface" = 手榴弹：躺在地面上、薄铁皮壳炸开（M24 本是靠爆风的进攻型手榴弹，破片很少），几乎不钻土，掀起的土远少于同装药的炮弹。
// 2026-10-22 用户嫌手榴弹扬尘过大、要按历史上的威力收：德国 M24 装 165–170 g TNT；中国仿制型装 TNT 掺硝酸钾、一般比原型弱；
// 日军照中国木柄弹仿制的九八式只装 85 g 苦味酸（不到 M24 一半）。中国二十四年式的确切克数没查到可靠出处，装药仍按 M24 记。
export const EXPLOSIVES = {
  Grenade: { name: "木柄手榴弹", fillingKg: 0.165, evidence: "M24 analogue; Chinese filling varies", craterRadiusM: 0.85, craterDepthM: 0.13, groundReachM: 1.2, burst: "surface" },
  GrenadeBundle: { name: "集束手榴弹", fillingKg: 1.155, evidence: "seven M24 analogue heads", craterRadiusM: 1.6, craterDepthM: 0.42, groundReachM: 2.0, burst: "surface" },
  Shell37: { name: "37毫米榴弹", fillingKg: 0.058, evidence: "Type 94 HE, 2.05 oz", craterRadiusM: 0.95, craterDepthM: 0.19, groundReachM: 1.3 },
  Shell57: { name: "57毫米榴弹", fillingKg: 0.25, evidence: "Type 90 HE", craterRadiusM: 1.35, craterDepthM: 0.32, groundReachM: 1.6 },
  Shell50: { name: "50毫米掷弹筒弹", fillingKg: 0.153, evidence: "Type 89 HE, 5.4 oz; TM 9-1985-5 p372", craterRadiusM: 1.15, craterDepthM: 0.25, groundReachM: 1.5 },
  Shell82: { name: "82毫米迫击炮弹", fillingKg: 0.553, evidence: "81-mm M43A1 analogue, 1.22 lb; not an identified Chinese shell filling", craterRadiusM: 1.75, craterDepthM: 0.48, groundReachM: 2.1 },
  Shell75: { name: "75毫米野炮榴弹", fillingKg: 0.81, evidence: "Type 94 HE; TM 9-1985-5 p321", craterRadiusM: 2.15, craterDepthM: 0.62, groundReachM: 2.5 },
  Shell105: { name: "105毫米榴弹", fillingKg: +(16.0 * TYPE94_FILL_RATIO).toFixed(2), evidence: "estimate: Model 91 10 cm howitzer HE 35 lb 4 oz x Type 94 fill ratio", craterRadiusM: 2.8, craterDepthM: 0.85, groundReachM: 3.0 },
  Shell150: { name: "150毫米榴弹", fillingKg: +(35.6 * TYPE94_FILL_RATIO).toFixed(2), evidence: "estimate: Model 96 / 4th Year 15 cm howitzer HE 78 lb 8 oz x Type 94 fill ratio", craterRadiusM: 3.5, craterDepthM: 1.15, groundReachM: 3.6 },
  Bomb50kg: { name: "50公斤级航空炸弹", fillingKg: AERIAL_BOMBS.Bomb50kg.chargeKg, evidence: "Data_AerialBombs class estimate", craterRadiusM: 4.2, craterDepthM: 1.6, groundReachM: 4.5 },
  Bomb250kg: { name: "250公斤级航空炸弹", fillingKg: AERIAL_BOMBS.Bomb250kg.chargeKg, evidence: "Data_AerialBombs class estimate", craterRadiusM: 6.5, craterDepthM: 2.3, groundReachM: 6.0 },
};

export const VEHICLE_EXPLOSIVES = {
  Type89Tank: "Shell57", Type95HaGo: "Shell37", Type97ChiHa: "Shell57",
};

export const TERRAIN_DEFORMATION = Object.freeze({
  cellM: 0.25, tileCells: 32, maxDepthM: 2.4,
  maxRimM: 0.22, rimWidthM: 1.25,
  // Per-axis bound guarantees the triangle's total grade is below the slide angle.
  maxAxisGrade: 0.38, foundationMarginM: 0.55,
});

export const GRENADE_RETURN = Object.freeze({
  reachM: 2.3, heightM: 1.65, minFuseS: 0.45, pickupS: 0.28,
  releaseGraceS: 0.45, power: 0.72,
});

export function ExplosiveIdFor(kind) {
  if (EXPLOSIVES[kind]) return kind;
  if (VEHICLE_EXPLOSIVES[kind]) return VEHICLE_EXPLOSIVES[kind];
  return ({ grenade: "Grenade", tank: "GrenadeBundle", launcher: "Shell50", mortar: "Shell82", artillery: "Shell75", shell: "Shell75" })[kind] || "Shell75";
}
