// Current reference reconstruction. Registration exposes the complete asset to
// the component library; campaign aircraft selection remains explicit.
export const NAKAJIMA_KI4_ASSET = Object.freeze({
  id: "NakajimaKi4",
  catalogId: "nakajimaKi4",
  label: "九四式侦察机 · 141（参考复原）",
  url: "./Model/NakajimaKi4/Model_NakajimaKi4.glb?v=20261028ReferenceV48GameRelease",
  version: "20261028ReferenceV48GameRelease",
  campaignEnabled: false,
  metresPerUnit: 1,
  noseDir: Object.freeze({ x: 0, z: -1 }),
  triangleBudget: 180000,
  wheelRadiusM: .43,
  dimensionsM: Object.freeze({ wingspan: 12, length: 8.25, height: 3.31 }),
  controls: Object.freeze({
    propeller: "Pivot_Propeller", wheelLeft: "Pivot_WheelLeft", wheelRight: "Pivot_WheelRight",
    rudder: "Pivot_Rudder", elevatorLeft: "Pivot_ElevatorLeft", elevatorRight: "Pivot_ElevatorRight",
    aileronLeft: "Pivot_AileronLeft", aileronRight: "Pivot_AileronRight",
    observerYaw: "Pivot_ObserverYaw", observerElevation: "Pivot_ObserverGunElevation",
  }),
  limitsRadians: Object.freeze({ rudder: 25 * Math.PI / 180, elevator: 25 * Math.PI / 180,
    aileron: 18 * Math.PI / 180, observerYaw: 15 * Math.PI / 180, observerElevation: 10 * Math.PI / 180 }),
  reconstructionScope: "Photo02 serial141 appearance; original manual dimensions, photographic unprinted curves and inferred PBR/hidden structure. Does not establish Ki-4 participation in the Tengxian assault. Original photo-fit failures remain recorded.",
});
