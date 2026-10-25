// Independent cloth material and simulation laboratory. No campaign cloth settings are read or changed here.
export const CLOTH_RANGE_ID = "ClothRange";
export const CLOTH_RANGE_WORLD = Object.freeze({ minX: -9, maxX: 9, minZ: -7, maxZ: 10, groundLimit: 32 });
export const CLOTH_RANGE_CAMERA_FAR = 80;
export const CLOTH_RANGE_STATIONS = Object.freeze([
  Object.freeze({ id: "Quilt", name: "冬瓜的棉被", x: -3, z: 0, radius: 1.2 }),
  Object.freeze({ id: "Curtain", name: "进门棉门帘", x: 0, z: 0, radius: 1.2 }),
  Object.freeze({ id: "Banner", name: "川军出川锦旗", x: 3, z: 0, radius: 1.2 }),
  Object.freeze({ id: "Muslin", name: "细棉布", x: -4.5, z: 4.2, radius: 1.2, materialSample: true }),
  Object.freeze({ id: "Silk", name: "绸布", x: -1.5, z: 4.2, radius: 1.2, materialSample: true }),
  Object.freeze({ id: "Canvas", name: "帆布", x: 1.5, z: 4.2, radius: 1.2, materialSample: true }),
  Object.freeze({ id: "Wool", name: "羊毛毯", x: 4.5, z: 4.2, radius: 1.2, materialSample: true }),
  Object.freeze({ id: "SingleBlanket", name: "薄单被吸血样片", x: -1.6, z: -4.2, radius: 1.2, materialSample: true }),
  Object.freeze({ id: "Towel", name: "毛巾吸血样片", x: 1.6, z: -4.2, radius: 1.2, materialSample: true }),
]);
export const CLOTH_RANGE_FIXTURES = Object.freeze({
  curtain: Object.freeze({ x: 0, z: 0, openingWidth: 1.5, top: 2.5, beam: 0.12, depth: 0.20 }),
  banner: Object.freeze({ x: 3, z: 0, width: 1.65, top: 2.8, beam: 0.07 }),
  materialStand: Object.freeze({ clothWidth: 1.45, clothLength: 1.75, openingWidth: 1.85, top: 2.8,
    beam: 0.07, depth: 0.10, footWidth: 0.42, footHeight: 0.06, footDepth: 0.65 }),
  palette: Object.freeze({ Floor: 0x8e938e, Grid: 0xaeb4ac, Wood: 0x554737, Metal: 0x6c6657 }),
});
export const CLOTH_RANGE_PHASE = Object.freeze({
  id: CLOTH_RANGE_ID, sandbox: true, sandboxKey: "cloth", sandboxGlyph: "布",
  date: "布料实验", label: "布料模拟测试场", place: "九件布料 · 材质与吸血对比",
  sky: "testSceneDay", ambience: "overcast", music: null, minutes: 600,
  story: CLOTH_RANGE_ID, cutsceneIn: null, cutsceneOut: null,
  brief: ["九件布料独立对比：厚棉被、棉门帘、锦旗、四种材质样片，以及薄单被与毛巾吸血样片。参数只在本场景生效，不改现有布料。",
    "前排四件对比材质，后排两件对比吸血、洇染与背面渗透。拖动画面转动观察，滚轮缩放；用面板注入、持续供血、掀角、折叠或暂停单步。"],
  objectives: ["对比布料的厚度、垂坠、运动与吸血洇染"],
  mechanic: "测试场：独立观察相机，玩家无敌，无敌军与武器。",
  nraPool: 9999, poolGain: 0, ijaPool: 9999, ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: "rearOnly" },
  ambientAircraft: false, disarmed: true,
  bounds: CLOTH_RANGE_WORLD, cameraFar: CLOTH_RANGE_CAMERA_FAR, zones: CLOTH_RANGE_STATIONS,
  spawn: { x: 5, z: 7, ry: 0 }, hud: { objectiveMarkers: false }, externalPlacements: [],
  loadoutOverride: { primary: null, secondary: null, melee: null, throwables: { Grenade: 0, GrenadeBundle: 0 }, spareClips: 0,
    note: "只观察布料，不携带武器。" },
});
