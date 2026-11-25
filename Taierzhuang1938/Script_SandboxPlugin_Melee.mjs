// 白刃战实验场插件（按需懒加载，场景来自 Scenes/TestMelee/Scene_TestMelee.json）。
import { MELEE_QTE_PHASE } from "./Data_MeleeQte.mjs";
import { TestSceneField } from "./Script_TestSceneField.mjs";
import { CreateMeleeLab } from "./Script_MeleeLabRuntime.mjs";
import { AttachSceneAsset } from "./Script_SceneAssetLoader.mjs";
import { SandboxInstance } from "./Script_SandboxPluginKit.mjs";

export function CreatePlugin() {
  return {
    phase: AttachSceneAsset(MELEE_QTE_PHASE, "TestMelee"),
    World: TestSceneField,
    Create: (h) => SandboxInstance(null, CreateMeleeLab(h)),
  };
}
