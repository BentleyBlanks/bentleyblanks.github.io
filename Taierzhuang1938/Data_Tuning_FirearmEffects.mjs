// Visual-only discharge envelopes. Existing masks and GPU smoke pools are reused.
// The recipes separate a brief gas jet from a sparse, slower wisp; smoke density
// remains bounded during automatic fire instead of building an opaque aim screen.
import { MUZZLE_FLASH } from "./Data_Tuning_FirearmHandling.mjs";

export const FIREARM_EFFECTS = Object.freeze({
  boltRifle: Object.freeze({
    ...MUZZLE_FLASH, id:"boltRifle", lifeS:.036, lightLifeS:.047,
    widthM:.090, lengthM:.230, coreM:.100, radiance:6.8,
    minScale:.88, maxScale:1.10, lightIntensity:24,
    quickSmoke:{count:2,life:[.14,.22],speed:2.8,size:[.026,.135],opacity:.10},
    lingering:{intervalS:.20,life:[.55,.85],size:[.020,.15],opacity:.075},
  }),
  lmg: Object.freeze({
    ...MUZZLE_FLASH, id:"lmg", lifeS:.026, lightLifeS:.036,
    widthM:.070, lengthM:.175, coreM:.078, radiance:6.0,
    minScale:.86, maxScale:1.08, lightIntensity:19,
    quickSmoke:{count:1,life:[.12,.18],speed:3.0,size:[.022,.110],opacity:.075},
    lingering:{intervalS:.24,life:[.48,.68],size:[.018,.13],opacity:.055},
  }),
  hmg: Object.freeze({
    ...MUZZLE_FLASH, id:"hmg", lifeS:.043, lightLifeS:.054,
    widthM:.105, lengthM:.265, coreM:.115, radiance:7.2,
    minScale:.90, maxScale:1.12, lightIntensity:31,
    quickSmoke:{count:2,life:[.15,.23],speed:3.4,size:[.030,.165],opacity:.095},
    lingering:{intervalS:.22,life:[.60,.90],size:[.022,.18],opacity:.075},
  }),
  pistol: Object.freeze({
    ...MUZZLE_FLASH,id:"pistol",lifeS:.023,lightLifeS:.032,
    widthM:.065,lengthM:.115,coreM:.070,radiance:5.8,
    minScale:.85,maxScale:1.1,lightIntensity:16,
    quickSmoke:{count:1,life:[.10,.16],speed:2.1,size:[.018,.095],opacity:.075},
    lingering:{intervalS:.20,life:[.40,.65],size:[.015,.11],opacity:.05},
  }),
});

export function FirearmEffects(weaponOrKind) {
  const kind=typeof weaponOrKind==="string"?weaponOrKind:weaponOrKind?.kind;
  return FIREARM_EFFECTS[kind] || FIREARM_EFFECTS.boltRifle;
}
