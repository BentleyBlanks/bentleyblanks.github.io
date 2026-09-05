// Shared explosive / earth response catalogue. Pure data; no renderer dependency.
// Historical fillings establish relative energy, NOT measured crater dimensions.
// Crater dimensions are gameplay estimates for dry soil and surface bursts.
// Sources and the distinction between evidence and tuning: docs/Data_ExplosionRange.md.
export const EXPLOSIVE_SOURCES = {
  M24: "https://ebadatelnavhm.vhu.sk/item/9/31",
  JapaneseArmy: "https://www.bulletpicker.com/pdf/Japanese-Ammunition-Part-4.pdf",
  JapaneseOrdnance: "https://www.bulletpicker.com/pdf/TM-9-1985-5.pdf",
  MortarAnalogue: "https://www.bulletpicker.com/pdf/Catalog-of-Standard-Ordnance-Items-Vol-3.pdf",
  Frostbite: "https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/chapter5-andersson-terrain-rendering-in-frostbite.pdf",
  Cod: "https://cdn2.callofduty.com/assets/codbo/pdf/COD_NDS_OMAN_US_v4.pdf",
};

export const EXPLOSIVES = {
  Grenade: { name: "木柄手榴弹", fillingKg: 0.165, evidence: "M24 analogue; Chinese filling varies", craterRadiusM: 0.85, craterDepthM: 0.13, groundReachM: 1.2 },
  GrenadeBundle: { name: "集束手榴弹", fillingKg: 1.155, evidence: "seven M24 analogue heads", craterRadiusM: 1.6, craterDepthM: 0.42, groundReachM: 2.0 },
  Shell37: { name: "37毫米榴弹", fillingKg: 0.058, evidence: "Type 94 HE, 2.05 oz", craterRadiusM: 0.95, craterDepthM: 0.19, groundReachM: 1.3 },
  Shell57: { name: "57毫米榴弹", fillingKg: 0.25, evidence: "Type 90 HE", craterRadiusM: 1.35, craterDepthM: 0.32, groundReachM: 1.6 },
  Shell50: { name: "50毫米掷弹筒弹", fillingKg: 0.153, evidence: "Type 89 HE, 5.4 oz; TM 9-1985-5 p372", craterRadiusM: 1.15, craterDepthM: 0.25, groundReachM: 1.5 },
  Shell82: { name: "82毫米迫击炮弹", fillingKg: 0.553, evidence: "81-mm M43A1 analogue, 1.22 lb; not an identified Chinese shell filling", craterRadiusM: 1.75, craterDepthM: 0.48, groundReachM: 2.1 },
  Shell75: { name: "75毫米野炮榴弹", fillingKg: 0.81, evidence: "Type 94 HE; TM 9-1985-5 p321", craterRadiusM: 2.15, craterDepthM: 0.62, groundReachM: 2.5 },
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
