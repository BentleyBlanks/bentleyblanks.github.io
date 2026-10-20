// Visual-only discharge envelopes. Existing masks and GPU smoke pools are reused.
// The recipes separate a brief gas jet from a sparse, slower wisp; smoke density
// remains bounded during automatic fire instead of building an opaque aim screen.
import { MUZZLE_FLASH } from "./Data_Tuning_FirearmHandling.mjs";

// Flash sizes are sprite edge lengths in metres at the viewmodel muzzle. Rifles
// lean to star cells; machine guns to the ragged fireballs of COD's MG flashes;
// automatic lives stay shorter than the fire interval so bursts read as pulses.
export const FIREARM_EFFECTS = Object.freeze({
  boltRifle: Object.freeze({
    ...MUZZLE_FLASH, id:"boltRifle", lifeS:.050, tongueLifeS:.060, glowLifeS:.070, lightLifeS:.060,
    frontM:.20, tongueM:.24, glowM:.30, radiance:3.4, fireballChance:.3, lightIntensity:24,
    quickSmoke:{count:2,life:[.14,.22],speed:2.8,size:[.026,.135],opacity:.10},
    lingering:{intervalS:.20,life:[.55,.85],size:[.020,.15],opacity:.075},
  }),
  lmg: Object.freeze({
    ...MUZZLE_FLASH, id:"lmg", lifeS:.040, tongueLifeS:.048, glowLifeS:.055, lightLifeS:.045,
    frontM:.24, tongueM:.26, glowM:.32, radiance:3.3, fireballChance:.5, lightIntensity:19, adsScale:1.1,
    quickSmoke:{count:1,life:[.12,.18],speed:3.0,size:[.022,.110],opacity:.075},
    lingering:{intervalS:.24,life:[.48,.68],size:[.018,.13],opacity:.055},
  }),
  hmg: Object.freeze({
    ...MUZZLE_FLASH, id:"hmg", lifeS:.050, tongueLifeS:.058, glowLifeS:.070, lightLifeS:.060,
    frontM:.38, tongueM:.34, glowM:.46, radiance:3.6, fireballChance:.75, lightIntensity:31,
    secondFrontChance:.5, adsScale:1.1,
    quickSmoke:{count:2,life:[.15,.23],speed:3.4,size:[.030,.165],opacity:.095},
    lingering:{intervalS:.22,life:[.60,.90],size:[.022,.18],opacity:.075},
  }),
  pistol: Object.freeze({
    ...MUZZLE_FLASH,id:"pistol",lifeS:.035,tongueLifeS:.040,glowLifeS:.050,lightLifeS:.040,
    frontM:.11,tongueM:.12,glowM:.18,radiance:3.0,fireballChance:.3,lightIntensity:16,
    quickSmoke:{count:1,life:[.10,.16],speed:2.1,size:[.018,.095],opacity:.075},
    lingering:{intervalS:.20,life:[.40,.65],size:[.015,.11],opacity:.05},
  }),
});

export function FirearmEffects(weaponOrKind) {
  const kind=typeof weaponOrKind==="string"?weaponOrKind:weaponOrKind?.kind;
  return FIREARM_EFFECTS[kind] || FIREARM_EFFECTS.boltRifle;
}

// The new ZB-26 receiver's lower plate is at y=-.005 m. Its port is below the
// feeding line, so both the release point and velocity differ from a side port.
export const CASE_EJECTION = Object.freeze({
  Zb26: {point:[0,-.006,-.205],minimum:[-.06,-1.55,.02],maximum:[.10,-1.10,.20]},
  default: {minimum:[1.9,1.4,-.30],maximum:[2.7,2.1,.20]},
});

// Imported dark steel/paint atlases need a diffuse contribution under the
// game's probe lighting. Pure-metal scalars made the feed mechanisms black.
// These private viewmodel options preserve the authored maps and world assets.
export const VIEWMODEL_FIREARM_SURFACES = Object.freeze({
  zb26Steel: {roughness:1,metalness:.65,normalScale:1,reflectanceScale:2,envMapIntensity:1.45},
  type11AmmoBox: {roughness:.88,metalness:.25,normalScale:.65},
  type11Body: {roughness:.88,metalness:.35,normalScale:.65},
  type11BodyAlt: {roughness:.90,metalness:.35,normalScale:.65},
  type11Fore: {roughness:.85,metalness:0,normalScale:.65},
});
