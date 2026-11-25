// Cloth range static scene: reads floor, grid, curtain frame, banner stand and
// material comparison stands from Scenes/TestCloth/Scene_TestCloth.json.
// Cloth meshes, contacts and their visual examples belong exclusively to Script_ClothRange.
import { TestSceneField } from "./Script_TestSceneField.mjs";
import { T } from "./Script_Text.mjs";
import { CLOTH_RANGE_ID, CLOTH_RANGE_WORLD, CLOTH_RANGE_CAMERA_FAR, CLOTH_RANGE_STATIONS } from "./Data_ClothRange.mjs";

export class ClothRangeField extends TestSceneField {
  constructor(scene, library, options = {}) {
    super(scene, library, {
      bounds: CLOTH_RANGE_WORLD,
      zones: CLOTH_RANGE_STATIONS,
      levelId: CLOTH_RANGE_ID,
      defaultSector: "ClothRange",
      defaultColliderTag: "clothFixture",
      defaultRoughness: 0.88,
      ...options,
    });
    this.worldLimits = CLOTH_RANGE_WORLD;
    this.cameraFar = CLOTH_RANGE_CAMERA_FAR;
  }

  *BuildSteps() {
    yield { label: T("range.build.clothFixtures"), progress: 0.3 };
    this.BuildGround();
    this.BuildStructures();
    this.BuildCollisionGrid();
    yield { label: T("range.build.clothReady"), progress: 1 };
  }
}

export default ClothRangeField;
