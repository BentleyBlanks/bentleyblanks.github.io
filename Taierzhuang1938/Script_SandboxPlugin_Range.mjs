// 玩法测试靶场插件（按需懒加载，场景来自 Scenes/TestRange/Scene_TestRange.json）。
import { RANGE_PHASE } from "./Data_Range.mjs";
import { TestSceneField } from "./Script_TestSceneField.mjs";
import { CreateRangeTargets } from "./Script_RangeTargets.mjs";
import { AttachSceneAsset } from "./Script_SceneAssetLoader.mjs";
import { SandboxInstance } from "./Script_SandboxPluginKit.mjs";

export function CreatePlugin() {
  return {
    phase: AttachSceneAsset(RANGE_PHASE, "TestRange"),
    World: TestSceneField,
    Create: (h) => SandboxInstance(null, CreateRangeTargets(h)),
  };
}
