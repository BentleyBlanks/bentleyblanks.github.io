// 头发胡子测试场插件（按需懒加载，场景来自 Scenes/TestHair/Scene_TestHair.json）。
import { HAIR_RANGE_PHASE } from "./Data_HairRange.mjs";
import { HairRangeField } from "./Script_HairRangeField.mjs";
import { HairRange } from "./Script_HairRange.mjs";
import { AttachSceneAsset } from "./Script_SceneAssetLoader.mjs";
import { SandboxInstance } from "./Script_SandboxPluginKit.mjs";

export function CreatePlugin() {
  return {
    phase: AttachSceneAsset(HAIR_RANGE_PHASE, "TestHair"),
    World: HairRangeField,
    Create: (h) => {
      const runtime = new HairRange({
        scene: h.scene, camera: h.camera, canvas: h.canvas, renderer: h.renderer, post: h.post, ctx: h.ctx,
        CanUse: h.CanUse, SetViewmodelHidden: h.SetViewmodelHidden,
      });
      runtime.UpdateCamera(0);
      return SandboxInstance(runtime, {
        debugName: "HairRange",
        ownsFrame: true,
        dropDebugOnDispose: true,
        UpdateCamera: (dt) => runtime.UpdateCamera(dt),
      });
    },
  };
}
