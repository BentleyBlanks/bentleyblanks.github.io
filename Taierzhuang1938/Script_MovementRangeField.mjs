// Movement lab static field: geometry and sign anchors come from Scenes/TestMovement/Scene_TestMovement.json;
// readable localized metre-ruler signs are rendered into one batched Canvas atlas.
import * as THREE from "three";
import { TestSceneField, CreateSignAtlas, AddAtlasSignToSink } from "./Script_TestSceneField.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { PlayerMovementReference } from "./Script_Player.mjs";
import { T } from "./Script_Text.mjs";
import { MOVEMENT_RANGE_ID, MOVEMENT_RANGE_WORLD, MOVEMENT_RANGE_STATIONS, MOVEMENT_FIXTURES } from "./Data_MovementRange.mjs";

const Metres = (value) => value.toFixed(2) + " m";

export function MovementRangeSigns() {
  const ref = PlayerMovementReference();
  return [
    { id: "Welcome", text: T("range.movement.signWelcome"), sub: T("range.movement.signWelcomeSub") },
    ...MOVEMENT_RANGE_STATIONS.map((s) => ({
      id: s.id,
      text: s.name,
      sub: s.id === "RunJump" ? T("range.movement.signRunJump") : s.id === "Vault" ? T("range.movement.signVault")
        : s.id === "Jump" ? T("range.movement.signJump")
          : s.id === "Crouch" ? T("range.movement.signCrouch")
            : T("range.movement.signProne"),
    })),
    ...MOVEMENT_FIXTURES.map((f) => ({
      id: f.id,
      text: f.kind === "tunnel" ? T("range.movement.signClearance", { value: Metres(f.clearance) })
        : T("range.movement.signHeight", { value: Metres(f.h) }),
      sub: f.kind === "tunnel" ? T("range.movement.signTunnel")
        : f.h > TRAVERSAL.mantleMax ? T("range.movement.signOverLimit")
          : f.h === TRAVERSAL.mantleMax ? T("range.movement.signMantleTop")
            : f.h === TRAVERSAL.vaultMax ? T("range.movement.signVaultTop")
              : f.h <= TRAVERSAL.stepMax ? T("range.movement.signStep") : T("range.movement.signMeasured"),
    })),
    { id: "JumpReference", text: T("range.movement.signJumpRef"),
      sub: T("range.movement.signJumpRefSub", { standing: Metres(ref.standingRiseM), running: Metres(ref.runningRiseM) }) },
    { id: "JumpLimit", text: T("range.movement.signJumpLimit", { value: Metres(TRAVERSAL.jumpRiseMax) }),
      sub: T("range.movement.signJumpLimitSub") },
    { id: "VaultReference",
      text: T("range.movement.signVaultRef", { vault: Metres(TRAVERSAL.vaultMax), mantle: Metres(TRAVERSAL.mantleMax) }),
      sub: T("range.movement.signVaultRefSub", { vault: Metres(TRAVERSAL.vaultReachM), mantle: Metres(TRAVERSAL.mantleReachM) }) },
    { id: "RunZero", text: T("range.movement.signRunZero"), sub: T("range.movement.signRunZeroSub") },
    { id: "RunBest", text: T("range.movement.signRunBest"), sub: T("range.movement.signRunBestSub") },
    ...Array.from({ length: 17 }, (_, i) => ({ id: "Distance" + i, text: Metres(i / 2), sub: "" })),
    ...Array.from({ length: 7 }, (_, i) => ({ id: "Height" + i, text: Metres(i / 2), sub: T("range.movement.signHeightSub") })),
  ];
}

export class MovementRangeField extends TestSceneField {
  constructor(scene, library, options = {}) {
    super(scene, library, {
      bounds: MOVEMENT_RANGE_WORLD,
      zones: MOVEMENT_RANGE_STATIONS,
      levelId: MOVEMENT_RANGE_ID,
      defaultSector: "MovementRange",
      defaultColliderTag: "movementFixture",
      defaultRoughness: 0.92,
      ...options,
    });
    this.worldLimits = MOVEMENT_RANGE_WORLD;
    this.cameraFar = 160;
    this.signManifest = MovementRangeSigns();
  }

  BuildExtraStructures(sink, materialMap) {
    const atlas = CreateSignAtlas(this.signManifest, {
      cols: 4, tileW: 768, tileH: 160, background: "#edf1f2", textColor: "#263f50",
    });
    this.ownedTextures.push(atlas.texture);
    const mat = new THREE.MeshBasicMaterial({
      name: "MovementRangeSigns",
      map: atlas.texture,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.ownedMaterials.set("MovementRangeSigns", mat);
    materialMap.set("MovementRangeSigns", mat);
    sink.SetSector("MovementSigns");
    for (const marker of this.Markers((m) => !!m.meta?.signId)) {
      const { signId, w = 3.6, h = 0.75, ground = false } = marker.meta;
      AddAtlasSignToSink(sink, "MovementRangeSigns", atlas, signId,
        marker.x, marker.y ?? 0, marker.z, w, h, ground ? -Math.PI / 2 : 0, marker.ry || 0);
    }
  }

  *BuildSteps() {
    yield { label: T("range.build.movementFixtures"), progress: 0.3 };
    this.BuildGround();
    this.BuildStructures();
    this.BuildCollisionGrid();
    yield { label: T("range.build.movementReady"), progress: 1 };
  }
}

export default MovementRangeField;
