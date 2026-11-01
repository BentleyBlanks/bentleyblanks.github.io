// Camera-relative framing fitted to the user's COD WWII Type 38 reference
// (Hectorlo, 01:07:54). Metres and radians; model geometry stays at real scale.
// A rigid transform of the complete arms/weapon assembly preserves the baked
// finger contacts and reload mechanics. ADS and sprint retain their own poses.
const Pose = (position, rotation) => Object.freeze({
  position: Object.freeze(position), rotation: Object.freeze(rotation),
});

export const FPS_RIFLE_VIEW = Object.freeze({
  Type38: Object.freeze({ fovDeg: 52, hip: Pose([.084, -.078, -.075], [.012, 0, 0]) }),
  ZhongZheng: Object.freeze({ fovDeg: 52, hip: Pose([.087, -.072, -.105], [.010, -.005, 0]) }),
  HanYang: Object.freeze({ fovDeg: 52, hip: Pose([.096, -.082, -.085], [.018, -.005, 0]) }),
});

// The working hand needs room above the receiver. Retain a little of the close
// hold during loading, then smoothly return once the hand is back on the stock.
export const FPS_RIFLE_VIEW_ACTIONS = Object.freeze({
  reload: Object.freeze({ retain: .18, enter: .14, leave: .84 }),
  bolt: Object.freeze({ retain: .68, enter: .16, leave: .80 }),
});

