// 人物战场反应测试场插件（按需懒加载，与炮击扬尘场共用 Scenes/TestShellImpact/Scene_TestShellImpact.json）。
import { BATTLE_REACTION_RANGE_PHASE } from "./Data_BattleReactionRange.mjs";
import { BuildShellImpactSceneLayout } from "./Script_ShellImpactRangeTerrain.mjs";
import { ShellImpactRangeField } from "./Script_ShellImpactRangeField.mjs";
import { BattleReactionRange } from "./Script_BattleReactionRange.mjs";
import { AttachSceneAsset } from "./Script_SceneAssetLoader.mjs";
import { SandboxInstance, FireRangeOptions } from "./Script_SandboxPluginKit.mjs";

export function CreatePlugin() {
  return {
    phase: AttachSceneAsset(BATTLE_REACTION_RANGE_PHASE, "TestShellImpact", {
      layoutTransform: BuildShellImpactSceneLayout,
    }),
    World: ShellImpactRangeField,
    Create: (h) => {
      const runtime = new BattleReactionRange(FireRangeOptions(h));
      return SandboxInstance(runtime, {
        debugName: "BattleReaction",
        updateSlot: "afterCombat",
        ScaleDt: (dt) => runtime.ScaleDt(dt),
      });
    },
  };
}
