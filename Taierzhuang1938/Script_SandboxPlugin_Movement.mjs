// 操作交互测试场插件（按需懒加载，场景来自 Scenes/TestMovement/Scene_TestMovement.json）。
import { MOVEMENT_RANGE_PHASE } from "./Data_MovementRange.mjs";
import { MovementRangeField } from "./Script_MovementRangeField.mjs";
import { MovementRange } from "./Script_MovementRange.mjs";
import { AttachSceneAsset } from "./Script_SceneAssetLoader.mjs";
import { SandboxInstance } from "./Script_SandboxPluginKit.mjs";

export function CreatePlugin() {
  return {
    phase: AttachSceneAsset(MOVEMENT_RANGE_PHASE, "TestMovement"),
    World: MovementRangeField,
    Create: (h) => SandboxInstance(
      new MovementRange({ player: h.player, scene: h.scene, battlefield: h.battlefield, CanUse: h.CanUse }),
      { debugName: "MovementRange", updateSlot: "afterPlayer" },
    ),
  };
}
