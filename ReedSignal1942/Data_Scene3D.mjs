export const WorldScale = 0.01;

export const RenderProfiles = Object.freeze({
  desktop: Object.freeze({ pixelRatio: 1.65, shadows: true, shadowMap: 1536, reedDensity: 1, dustCount: 150 }),
  balanced: Object.freeze({ pixelRatio: 1.35, shadows: true, shadowMap: 1024, reedDensity: 0.72, dustCount: 95 }),
  mobile: Object.freeze({ pixelRatio: 1.15, shadows: false, shadowMap: 512, reedDensity: 0.48, dustCount: 58 }),
});

export const ChapterVisuals = Object.freeze({
  school: Object.freeze({
    sky: 0x0d2024,
    fog: 0x263b37,
    fogDensity: 0.018,
    exposure: 1.24,
    moon: 0xc6d0c7,
    moonIntensity: 2.35,
    ambientSky: 0x8ba7a0,
    ambientGround: 0x3c3021,
    ambientIntensity: 1.55,
    ground: 0x484a3d,
    earth: 0x665842,
    plaster: 0xaaa98f,
    plasterDark: 0x656d61,
    wood: 0x524435,
    reed: 0x6d7c64,
    accent: 0xe0a95f,
    water: 0x3c5c58,
    camera: Object.freeze({ fov: 23, distance: 17.1, lift: 2.7, lookLift: 1.18 }),
    shots: Object.freeze([
      Object.freeze({ x0: 0, x1: 720, anchorX: 480, viewDistance: 16.2, lift: 2.6, reason: "空教室与点名簿同框" }),
      Object.freeze({ x0: 720, x1: 1840, viewDistance: 18.2, lift: 3.0, reason: "拉远读清探照灯和推车" }),
      Object.freeze({ x0: 1840, x1: 2920, viewDistance: 16.6, lift: 2.45, reason: "压低镜头进入排水洞" }),
    ]),
  }),
  blockade: Object.freeze({
    sky: 0x09262c,
    fog: 0x244341,
    fogDensity: 0.022,
    exposure: 1.23,
    moon: 0xb7cbc8,
    moonIntensity: 2.3,
    ambientSky: 0x7ba3a3,
    ambientGround: 0x283029,
    ambientIntensity: 1.5,
    ground: 0x424b3f,
    earth: 0x5a543f,
    plaster: 0x879589,
    plasterDark: 0x4b6159,
    wood: 0x59462f,
    reed: 0x58796a,
    accent: 0xe0bd70,
    water: 0x1c4650,
    camera: Object.freeze({ fov: 24, distance: 16.8, lift: 2.8, lookLift: 1.05 }),
    shots: Object.freeze([
      Object.freeze({ x0: 0, x1: 1120, viewDistance: 15.6, lift: 2.5, reason: "让苇梢成为风声量表" }),
      Object.freeze({ x0: 1120, x1: 2260, anchorX: 1750, viewDistance: 18.3, lift: 3.35, reason: "空船、水闸与浮桥因果同框" }),
      Object.freeze({ x0: 2260, x1: 3340, viewDistance: 16.1, lift: 2.55, reason: "贴水穿过第二束灯" }),
    ]),
  }),
  tunnel: Object.freeze({
    sky: 0x2e2117,
    fog: 0x392719,
    fogDensity: 0.032,
    exposure: 2.08,
    moon: 0xa9c9c4,
    moonIntensity: 1.2,
    ambientSky: 0x8b7052,
    ambientGround: 0x2b1b10,
    ambientIntensity: 4.35,
    ground: 0x493424,
    earth: 0x6f5234,
    plaster: 0x887157,
    plasterDark: 0x4c3827,
    wood: 0x684a2a,
    reed: 0x6e7158,
    accent: 0xe7a65b,
    water: 0x243536,
    camera: Object.freeze({ fov: 24, distance: 14.8, lift: 1.92, lookLift: 0.78 }),
    shots: Object.freeze([
      Object.freeze({ x0: 0, x1: 800, anchorX: 570, viewDistance: 14.6, lift: 1.9, reason: "枯井冷光切开土层" }),
      Object.freeze({ x0: 800, x1: 1740, viewDistance: 15.4, lift: 1.95, reason: "低顶支架与来烟前兆同框" }),
      Object.freeze({ x0: 1740, x1: 3020, viewDistance: 14.6, lift: 1.82, reason: "栓儿与窄井压近人物" }),
    ]),
  }),
  ferry: Object.freeze({
    sky: 0x314c55,
    fog: 0x81928a,
    fogDensity: 0.016,
    exposure: 1.18,
    moon: 0xd9d2ad,
    moonIntensity: 2.05,
    ambientSky: 0xb5c7bd,
    ambientGround: 0x44483a,
    ambientIntensity: 1.48,
    ground: 0x535d4d,
    earth: 0x6f624c,
    plaster: 0x969d8e,
    plasterDark: 0x59665b,
    wood: 0x5d4935,
    reed: 0x72866f,
    accent: 0xe1b56b,
    water: 0x3b656d,
    camera: Object.freeze({ fov: 23, distance: 17.2, lift: 2.75, lookLift: 1.02 }),
    shots: Object.freeze([
      Object.freeze({ x0: 0, x1: 1510, viewDistance: 17.4, lift: 2.8, reason: "六名孩子必须在同一构图内" }),
      Object.freeze({ x0: 1510, x1: 2300, anchorX: 1930, viewDistance: 14.8, lift: 2.48, reason: "母女交接与白布信号" }),
      Object.freeze({ x0: 2300, x1: 3660, anchorX: 3070, viewDistance: 18.4, lift: 3.0, reason: "灯转南汊、渡船在北汊" }),
    ]),
  }),
});

export function GetVisualProfile(chapterId) {
  return ChapterVisuals[chapterId] || ChapterVisuals.school;
}

export function GetCameraShot(chapterId, playerX) {
  const profile = GetVisualProfile(chapterId);
  return profile.shots.find((shot) => playerX >= shot.x0 && playerX <= shot.x1) || profile.shots[profile.shots.length - 1];
}
