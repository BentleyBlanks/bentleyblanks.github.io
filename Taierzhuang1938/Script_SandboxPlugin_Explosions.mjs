// 爆炸测试场插件（按需懒加载，场景来自 Scenes/TestExplosion/Scene_TestExplosion.json）。
import { EXPLOSION_RANGE_PHASE } from "./Data_ExplosionRange.mjs";
import { ExplosionRangeField } from "./Script_ExplosionRangeField.mjs";
import { ExplosionRange } from "./Script_ExplosionRange.mjs";
import { AttachSceneAsset } from "./Script_SceneAssetLoader.mjs";
import { SandboxInstance } from "./Script_SandboxPluginKit.mjs";

export function CreatePlugin() {
  return {
    phase: AttachSceneAsset(EXPLOSION_RANGE_PHASE, "TestExplosion"),
    World: ExplosionRangeField,
    Create: (h) => {
      const runtime = new ExplosionRange({
        battlefield: h.battlefield, combat: h.combat, interact: h.interact, player: h.player, ai: h.ai,
        hud: h.hud, aircraft: h.aircraft, vfx: h.vfx, audio: h.audio, viewmodel: h.viewmodel,
        library: h.library, scene: h.scene, camera: h.camera, state: h.state,
        CanUse: h.CanUse, Focus: h.Focus, GiveGrenade: h.GiveGrenade, ctx: h.ctx,
      });
      return SandboxInstance(runtime, {
        updateSlot: "afterCombat",
        OnKey: (detail) => runtime.OnKey(detail),
        ActionPrompts: () => runtime.ActionPrompts(),
        UpdatePanel: () => runtime.UpdatePanel(),
        api: runtime.api,
      });
    },
  };
}
