// Independent firearm range geometry driven by Scenes/TestWeapon/Scene_TestWeapon.json.
// Localized signs and the painted measurement ring are batched alongside the scene blocks.
import * as THREE from "three";
import { TestSceneField, CreateSignAtlas, AddAtlasSignToSink } from "./Script_TestSceneField.mjs";
import { PlaceGeometry } from "./Script_Geo.mjs";
import { T, Localize } from "./Script_Text.mjs";
import { WeaponNameId } from "./Script_TextIds.mjs";
import {
  WEAPON_RANGE_LEVEL_ID, WEAPON_RANGE_WORLD, WEAPON_RANGE_CAMERA_FAR,
  WEAPON_RANGE_STATIONS, WEAPON_RANGE_FIRING_ORIGIN, WEAPON_RANGE_WEAPONS, WEAPON_RANGE_TARGETS,
} from "./Data_WeaponRange.mjs";

/** Stable sign manifest doubles as a pure inspectable accessibility contract. */
export function WeaponRangeSigns() {
  return [
    { id: "WeaponRangeWelcome", text: T("range.weapon.signWelcome"), subtext: T("range.weapon.signWelcomeSub") },
    { id: "WeaponRangeMeasure", text: T("range.weapon.signMeasure"), subtext: T("range.weapon.signMeasureSub") },
    ...WEAPON_RANGE_WEAPONS.map((slot) => ({
      id: `WeaponRangeGun${slot.slot}`,
      text: `${String(slot.slot + 1).padStart(2, "0")}  ${Localize(WeaponNameId(slot.weaponId), slot.name)}`,
      subtext: T("range.weapon.signSlotSub"),
    })),
    ...WEAPON_RANGE_TARGETS.map((target) => ({
      id: target.id,
      text: `${target.distanceM} m`,
      subtext: target.moving ? T("range.weapon.signTargetMoving", { id: target.id })
        : T("range.weapon.signTargetStatic", { id: target.id }),
    })),
  ];
}

export class WeaponRangeField extends TestSceneField {
  constructor(scene, library, options = {}) {
    super(scene, library, {
      bounds: WEAPON_RANGE_WORLD,
      zones: WEAPON_RANGE_STATIONS,
      levelId: WEAPON_RANGE_LEVEL_ID,
      defaultSector: "WeaponRangeRear",
      defaultColliderTag: "weaponRangeWall",
      defaultRoughness: 0.88,
      ...options,
    });
    this.worldLimits = WEAPON_RANGE_WORLD;
    this.cameraFar = WEAPON_RANGE_CAMERA_FAR;
    this.signManifest = WeaponRangeSigns();
  }

  BuildExtraStructures(sink, materialMap) {
    const originMarker = this.Marker("OriginRing");
    const ox = originMarker?.x ?? WEAPON_RANGE_FIRING_ORIGIN.x;
    const oy = originMarker?.y ?? 0.023;
    const oz = originMarker?.z ?? WEAPON_RANGE_FIRING_ORIGIN.z;
    const ringMat = this.ColorMaterial("#1266c0", 0.88, 0, "WeaponRangeRing");
    materialMap.set("WeaponRangeRing", ringMat);
    sink.SetSector("WeaponRangeRear");
    sink.Add("WeaponRangeRing", PlaceGeometry(new THREE.RingGeometry(0.40, 0.50, 48), { x: ox, y: oy, z: oz, rx: -Math.PI / 2 }));

    const atlas = CreateSignAtlas(this.signManifest, {
      cols: 4, tileW: 512, tileH: 128,
      background: "#edf0f0", textColor: "#244455",
      titleFont: "bold 42px sans-serif", titleY: 49,
      subFont: "24px sans-serif", subY: 97,
      insetPx: 3, anisotropy: 4,
      accentBar: (sign) => (sign.id.startsWith("M") ? "#ad3037" : "#244455"),
    });
    this.ownedTextures.push(atlas.texture);
    const signMat = new THREE.MeshBasicMaterial({
      name: "WeaponRangeSigns",
      map: atlas.texture,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.ownedMaterials.set("WeaponRangeSigns", signMat);
    materialMap.set("WeaponRangeSigns", signMat);
    sink.SetSector("WeaponRangeSigns");
    for (const marker of this.Markers((m) => !!m.meta?.signId)) {
      const { signId, w = 1.8, h = 0.5, rx = 0, ry = 0 } = marker.meta;
      AddAtlasSignToSink(sink, "WeaponRangeSigns", atlas, signId,
        marker.x, marker.y ?? 0, marker.z, w, h, rx, ry);
    }
  }

  *BuildSteps() {
    yield { label: T("range.build.weaponWhitebox"), progress: 0.3 };
    this.BuildGround();
    this.BuildStructures();
    yield { label: T("range.build.weaponCollision"), progress: 0.85 };
    this.BuildCollisionGrid();
    yield { label: T("range.build.ready"), progress: 1 };
  }

  CheckSightCorridor() { return { ok: true, blockers: [], scene: "weaponRange", applies: false }; }
}

export default WeaponRangeField;
