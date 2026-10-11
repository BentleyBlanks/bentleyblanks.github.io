// First-level M15/M16: Blender-authored furniture and medical vessels.
// Source .blend stays outside the repository; rebuild and inspection: docs/Data_WardProps.md.
// Preserve authored UVs/materials (ceramic/enamel/glass must not inherit Stone/Sandbag).
export const PACK = Object.freeze({
  id: "WardProps", url: "./Model/Model_WardProps.glb?v=20261011",
});

const Asset = (label, node) => Object.freeze({
  label, node, material: null, projectUvs: false, tag: "prop", category: "接收院医疗陈设",
});
export const ASSETS = Object.freeze({
  wardMedicineCabinet: Asset("旧木药柜", "WardMedicineCabinet"),
  wardStockedShelf: Asset("接收院药架与药品", "WardStockedShelf"),
  wardTreatmentTable: Asset("接收院药桌", "WardTreatmentTable"),
  wardWoodStool: Asset("接收院方凳", "WardWoodStool"),
  wardWoodBench: Asset("接收院长凳", "WardWoodBench"),
  wardAmberBottle: Asset("棕色软木塞药瓶", "WardAmberBottle"),
  wardGreenBottle: Asset("绿色软木塞药瓶", "WardGreenBottle"),
  wardCeramicJar: Asset("带盖陶药罐", "WardCeramicJar"),
  wardEnamelBasin: Asset("蓝边搪瓷盆", "WardEnamelBasin"),
  wardBandageRoll: Asset("卷纱布", "WardBandageRoll"),
  wardDressingBundle: Asset("折叠包扎布", "WardDressingBundle"),
});
