// 断肢测试场插件（按需懒加载，场景来自 Scenes/TestGore/Scene_TestGore.json）。
import { GORE_RANGE_PHASE } from "./Data_GoreRange.mjs";
import { GoreRangeField } from "./Script_GoreRangeField.mjs";
import { GoreRange } from "./Script_GoreRange.mjs";
import { AttachSceneAsset } from "./Script_SceneAssetLoader.mjs";
import { SandboxInstance } from "./Script_SandboxPluginKit.mjs";

export function CreatePlugin() {
  return {
    phase: AttachSceneAsset(GORE_RANGE_PHASE, "TestGore"),
    World: GoreRangeField,
    Create: (h) => {
      const runtime = new GoreRange({
        ai: h.ai, player: h.player, camera: h.camera, scene: h.scene, combat: h.combat, battlefield: h.battlefield,
        renderer: h.renderer, post: h.post, vfx: h.vfx, audio: h.audio, hud: h.hud, canvas: h.canvas, state: h.state,
        Pickup: h.Pickup, Refill: h.Refill, GiveGrenade: h.GiveGrenade, SetViewmodelHidden: h.SetViewmodelHidden,
        ctx: h.ctx,
        Gore: h.GoreDebug, CanUse: h.CanUse, Focus: h.Focus,
      });
      return SandboxInstance(runtime, {
        debugName: "GoreRange",
        updateSlot: "afterPlayer",
        ScaleDt: (dt) => runtime.ScaleDt(dt),
        CapturesInput: () => runtime.CapturesInput(),
        ApplyCamera: (camera) => runtime.ApplyCamera(camera),
      });
    },
  };
}
