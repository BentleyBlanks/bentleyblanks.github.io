// 头发胡子测试场的静态场地：从 Scenes/TestHair/Scene_TestHair.json 读取地面、米格线与全部胸像台座。
// 胸像与头发归 Script_HairRange。
import { TestSceneField } from "./Script_TestSceneField.mjs";
import { T } from "./Script_Text.mjs";
import { HAIR_RANGE_ID, HAIR_RANGE_WORLD, HAIR_RANGE_CAMERA_FAR } from "./Data_HairRange.mjs";

export class HairRangeField extends TestSceneField {
  constructor(scene, library, options = {}) {
    super(scene, library, {
      bounds: HAIR_RANGE_WORLD,
      zones: [],
      levelId: HAIR_RANGE_ID,
      defaultSector: "HairRange",
      defaultColliderTag: "hairPedestal",
      defaultRoughness: 0.92,
      ...options,
    });
    this.worldLimits = HAIR_RANGE_WORLD;
    this.cameraFar = HAIR_RANGE_CAMERA_FAR;
  }

  *BuildSteps() {
    yield { label: T("range.build.hairFixtures"), progress: 0.3 };
    this.BuildGround();
    this.BuildStructures();
    this.BuildCollisionGrid();
    yield { label: T("range.build.hairReady"), progress: 1 };
  }
}

export default HairRangeField;
