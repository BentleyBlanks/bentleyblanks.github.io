// 炮击扬尘测试场插件（按需懒加载，场景来自 Scenes/TestShellImpact/Scene_TestShellImpact.json）。
import { SHELL_IMPACT_RANGE_PHASE } from "./Data_ShellImpactRange.mjs";
import { BuildShellImpactSceneLayout } from "./Script_ShellImpactRangeTerrain.mjs";
import { ShellImpactRangeField } from "./Script_ShellImpactRangeField.mjs";
import { ShellImpactRange } from "./Script_ShellImpactRange.mjs";
import { AttachSceneAsset } from "./Script_SceneAssetLoader.mjs";
import { SandboxInstance, FireRangeOptions } from "./Script_SandboxPluginKit.mjs";

export function CreatePlugin() {
  return {
    phase: AttachSceneAsset(SHELL_IMPACT_RANGE_PHASE, "TestShellImpact", {
      layoutTransform: BuildShellImpactSceneLayout,
    }),
    World: ShellImpactRangeField,
    Create: (h) => {
      const runtime = new ShellImpactRange(FireRangeOptions(h));
      return SandboxInstance(runtime, {
        debugName: "ShellImpact",
        updateSlot: "afterCombat",
        ScaleDt: (dt) => runtime.ScaleDt(dt),
        CapturesInput: () => runtime.CapturesInput(),
        ApplyCamera: (camera) => runtime.ApplyCamera(camera),
      });
    },
  };
}
