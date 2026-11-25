// 布料模拟测试场插件（按需懒加载，场景来自 Scenes/TestCloth/Scene_TestCloth.json）。
import { CLOTH_RANGE_PHASE } from "./Data_ClothRange.mjs";
import { ClothRangeField } from "./Script_ClothRangeField.mjs";
import { ClothRange } from "./Script_ClothRange.mjs";
import { AttachSceneAsset } from "./Script_SceneAssetLoader.mjs";
import { SandboxInstance } from "./Script_SandboxPluginKit.mjs";

export function CreatePlugin() {
  return {
    phase: AttachSceneAsset(CLOTH_RANGE_PHASE, "TestCloth"),
    World: ClothRangeField,
    Create: (h) => {
      const runtime = new ClothRange({
        battlefield: h.battlefield, player: h.player, camera: h.camera, scene: h.scene, library: h.library, canvas: h.canvas,
        renderer: h.renderer, post: h.post, state: h.state, CanUse: h.CanUse, SetViewmodelHidden: h.SetViewmodelHidden,
      });
      runtime.UpdateCamera(0);
      return SandboxInstance(runtime, {
        debugName: "ClothRange",
        ownsFrame: true,
        dropDebugOnDispose: true,
        UpdateCamera: (dt) => runtime.UpdateCamera(dt),
      });
    },
  };
}
