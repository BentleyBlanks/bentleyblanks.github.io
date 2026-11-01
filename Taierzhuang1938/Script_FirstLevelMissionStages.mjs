// Data_FirstLevelMissionStages.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { FIRST_LEVEL_STAGES } from "./Data_FirstLevelMissionStages.mjs";

export function FirstLevelStageForStep(step) {
  return FIRST_LEVEL_STAGES.find(stage => stage.steps.includes(step))
    || (step === "Complete" ? FIRST_LEVEL_STAGES.at(-1) : null);
}

export function ResolveFirstLevelStage(value) {
  const number = typeof value === "number" ? value : /^\d+$/.test(value) ? Number(value) : null;
  const stage = number === null ? FIRST_LEVEL_STAGES.find(stage => stage.id === value)
    : FIRST_LEVEL_STAGES.find(stage => stage.number === number);
  if (!stage) throw new Error(`Unknown first-level stage: ${String(value)}`);
  return stage;
}
