// Data_FpsRifleView.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { FPS_RIFLE_VIEW_ACTIONS } from "./Data_FpsRifleView.mjs";

export function RifleActionFraming(kind, time = 0) {
  const action = FPS_RIFLE_VIEW_ACTIONS[kind];
  if (!action) return 1;
  const phase = Math.max(0, Math.min(1, time / action.enter, (1 - time) / (1 - action.leave)));
  const ease = phase * phase * (3 - 2 * phase);
  return 1 - (1 - action.retain) * ease;
}

// Under a camera with focal length 1/tan(world/2), scaling camera-space Z by
// tan(view/2)/tan(world/2) yields exactly the requested view focal length.
export function RifleViewDepthScale(worldFov, viewFov) {
  return Math.tan(viewFov * Math.PI / 360) / Math.tan(worldFov * Math.PI / 360);
}
