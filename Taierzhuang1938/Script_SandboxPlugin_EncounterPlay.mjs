// 独立遭遇试玩插件（与正式第一关共用 CreateEncounterPlayPluginInstance）。
import { EncounterPlay } from "./Script_EncounterPlay.mjs";
import { ENCOUNTER_PLAY_PHASE } from "./Script_EncounterPlayScene.mjs";
import { ENCOUNTER_PLAY_STARTUP } from "./Data_Tuning_EncounterPlayStartup.mjs";
import { FirstLevelWhiteboxField } from "./Script_FirstLevelWhiteboxField.mjs";
import { SandboxInstance } from "./Script_SandboxPluginKit.mjs";

/** 遭遇设计试玩与第一关正式战役共用的插件装配（同一份 EncounterPlay 运行时与钩子）。 */
export function CreateEncounterPlayPluginInstance(h, options = {}) {
  const runtime = new EncounterPlay(h, options);
  return SandboxInstance(runtime, {
    id: options.mode === "campaign" ? "firstLevelCampaign" : "encounterPlay",
    debugName: "EncounterPlay",
    updateSlot: "beforeAi",
    holdsRespawn: true,
    captureViewportName: "视口 1 · 玩家视角",
    ScaleDt: (dt) => runtime.ScaleDt(dt),
    CapturesInput: () => runtime.CapturesInput(),
    ApplyCamera: (camera) => runtime.ApplyCamera(camera),
    OnKey: (detail) => runtime.OnKey(detail),
    OnPlayerDown: () => runtime.Fail(),
    ViewportSize: () => runtime.view.Size(),
    AfterRender: (dt, frameOptions) => runtime.AfterRender(dt, frameOptions),
    Warmup: (onStep) => runtime.Warmup(onStep),
  });
}

export function CreatePlugin() {
  return {
    phase: ENCOUNTER_PLAY_PHASE,
    World: FirstLevelWhiteboxField,
    startup: ENCOUNTER_PLAY_STARTUP,
    Create(h) { return CreateEncounterPlayPluginInstance(h, { mode: "editor" }); },
  };
}
