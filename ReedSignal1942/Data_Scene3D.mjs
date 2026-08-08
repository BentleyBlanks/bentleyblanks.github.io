export const WorldScale = 0.01;

export const RenderProfiles = Object.freeze({
  desktop: Object.freeze({ pixelRatio: 1.65, shadows: true, shadowMap: 1536, reedDensity: 0.78, dustCount: 150 }),
  balanced: Object.freeze({ pixelRatio: 1.35, shadows: true, shadowMap: 1024, reedDensity: 0.58, dustCount: 95 }),
  mobile: Object.freeze({ pixelRatio: 1.15, shadows: false, shadowMap: 512, reedDensity: 0.38, dustCount: 58 }),
});

export const ChapterVisuals = Object.freeze({
  school: Object.freeze({
    sky: 0x0d2024,
    fog: 0x263b37,
    fogDensity: 0.012,
    exposure: 1.28,
    moon: 0xc6d0c7,
    moonIntensity: 3.15,
    ambientSky: 0x8ba7a0,
    ambientGround: 0x3c3021,
    ambientIntensity: 1.22,
    ground: 0x484a3d,
    earth: 0x665842,
    plaster: 0xaaa98f,
    plasterDark: 0x656d61,
    wood: 0x524435,
    reed: 0x6d7c64,
    accent: 0xe0a95f,
    water: 0x3c5c58,
    camera: Object.freeze({ fov: 23, distance: 15.2, lift: 2.84, lookLift: 1.34 }),
    shots: Object.freeze([
      Object.freeze({ x0: 0, x1: 620, kind: "establish", anchorX: 460, viewDistance: 25.8, lift: 4.18, lookLift: 1.42, targetZ: -3.6, fov: 25.4, reason: "从空教室、院门和远处岗楼建立整座村庄的尺度" }),
      Object.freeze({ x0: 620, x1: 1120, kind: "approach", viewDistance: 15.8, lift: 2.88, lookLift: 1.34, targetZ: -1.2, fov: 24.1, reason: "苇帘与麦子进入人物尺度" }),
      Object.freeze({ x0: 1120, x1: 1840, kind: "action", anchorX: 1515, viewDistance: 12.4, lift: 2.56, lookLift: 1.4, targetZ: -0.74, fov: 24.5, reason: "推车、残墙和探照灯形成紧张的动作镜头" }),
      Object.freeze({ x0: 1840, x1: 2920, kind: "escape", viewDistance: 15.2, lift: 2.76, lookLift: 1.3, targetZ: -1.55, fov: 24.0, reason: "压低镜头进入排水洞，保留前景土坡遮挡" }),
    ]),
  }),
  blockade: Object.freeze({
    sky: 0x09262c,
    fog: 0x244341,
    fogDensity: 0.014,
    exposure: 1.34,
    moon: 0xb7cbc8,
    moonIntensity: 3.25,
    ambientSky: 0x7ba3a3,
    ambientGround: 0x283029,
    ambientIntensity: 1.34,
    ground: 0x424b3f,
    earth: 0x5a543f,
    plaster: 0x879589,
    plasterDark: 0x4b6159,
    wood: 0x59462f,
    reed: 0x58796a,
    accent: 0xe0bd70,
    water: 0x1c4650,
    camera: Object.freeze({ fov: 24, distance: 15.6, lift: 2.98, lookLift: 1.34 }),
    shots: Object.freeze([
      Object.freeze({ x0: 0, x1: 720, kind: "establish", anchorX: 590, viewDistance: 28.2, lift: 4.72, lookLift: 1.58, targetZ: -5.2, fov: 25.8, reason: "长堤、封锁沟、岗楼与远村灯线同框" }),
      Object.freeze({ x0: 720, x1: 1460, kind: "approach", viewDistance: 15.6, lift: 2.88, lookLift: 1.34, targetZ: -1.65, fov: 24.1, reason: "让苇梢和空船成为可读的风声机关" }),
      Object.freeze({ x0: 1460, x1: 2260, kind: "action", anchorX: 1750, viewDistance: 12.5, lift: 2.66, lookLift: 1.4, targetZ: -0.82, fov: 24.5, reason: "水闸、长杆、脚下门板和水纹进入动作近景" }),
      Object.freeze({ x0: 2260, x1: 3340, kind: "escape", viewDistance: 16.8, lift: 3.04, lookLift: 1.34, targetZ: -2.35, fov: 24.2, reason: "贴水穿过第二束灯，远岸仍作为目的地" }),
    ]),
  }),
  tunnel: Object.freeze({
    sky: 0x2e2117,
    fog: 0x392719,
    fogDensity: 0.026,
    exposure: 2.08,
    moon: 0xa9c9c4,
    moonIntensity: 1.55,
    ambientSky: 0x8b7052,
    ambientGround: 0x2b1b10,
    ambientIntensity: 4.05,
    ground: 0x493424,
    earth: 0x6f5234,
    plaster: 0x887157,
    plasterDark: 0x4c3827,
    wood: 0x684a2a,
    reed: 0x6e7158,
    accent: 0xe7a65b,
    water: 0x243536,
    camera: Object.freeze({ fov: 24, distance: 13.4, lift: 2.22, lookLift: 1.3 }),
    shots: Object.freeze([
      Object.freeze({ x0: 0, x1: 720, kind: "establish", anchorX: 560, viewDistance: 22.8, lift: 3.58, lookLift: 1.3, targetZ: -4.9, fov: 25.2, reason: "土层剖面、第一口枯井和远端烟路同时可读" }),
      Object.freeze({ x0: 720, x1: 1540, kind: "approach", viewDistance: 13.1, lift: 2.2, lookLift: 1.28, targetZ: -1.12, fov: 24.0, reason: "低顶支架贴近前景，烟从深处压来" }),
      Object.freeze({ x0: 1540, x1: 2360, kind: "action", anchorX: 1980, viewDistance: 10.9, lift: 1.98, lookLift: 1.34, targetZ: -0.96, fov: 24.5, reason: "点名、抱起栓儿和递手发生在人物近景" }),
      Object.freeze({ x0: 2360, x1: 3020, kind: "release", viewDistance: 14.6, lift: 2.44, lookLift: 1.34, targetZ: -1.82, fov: 24.1, reason: "窄井之后重新看见出口的冷光" }),
    ]),
  }),
  ferry: Object.freeze({
    sky: 0x2a4550,
    fog: 0x415754,
    fogDensity: 0.0075,
    exposure: 1.2,
    moon: 0xd9d2ad,
    moonIntensity: 3.0,
    ambientSky: 0xb5c7bd,
    ambientGround: 0x44483a,
    ambientIntensity: 1.16,
    ground: 0x535d4d,
    earth: 0x6f624c,
    plaster: 0x969d8e,
    plasterDark: 0x59665b,
    wood: 0x5d4935,
    reed: 0x72866f,
    accent: 0xe1b56b,
    water: 0x3b656d,
    camera: Object.freeze({ fov: 23, distance: 16.2, lift: 2.94, lookLift: 1.34 }),
    shots: Object.freeze([
      Object.freeze({ x0: 0, x1: 820, kind: "establish", anchorX: 650, viewDistance: 30.4, lift: 5.18, lookLift: 1.72, targetZ: -7.2, fov: 26.2, reason: "六名孩子、长堤、远岸与渡船先建立空间关系" }),
      Object.freeze({ x0: 820, x1: 1580, kind: "approach", viewDistance: 16.2, lift: 3.04, lookLift: 1.34, targetZ: -1.9, fov: 24.1, reason: "苇障和队伍纪律进入可操作尺度" }),
      Object.freeze({ x0: 1580, x1: 2320, kind: "action", anchorX: 1960, viewDistance: 12.1, lift: 2.6, lookLift: 1.4, targetZ: -0.76, fov: 24.5, reason: "母女交接、点名簿与白布信号进入人物近景" }),
      Object.freeze({ x0: 2320, x1: 3660, kind: "finale", anchorX: 3070, viewDistance: 22.6, lift: 4.04, lookLift: 1.46, targetZ: -4.6, fov: 24.8, reason: "灯转南汊，船从北汊离岸并驶向远景" }),
    ]),
  }),
});

// Short, authored camera beats keep the 3D scene in the playable world.  They
// are deliberately data-only so the rules layer can attach a cue without
// importing Three.js or any browser API.
export const CinematicCues = Object.freeze({
  takeRegister: Object.freeze({ duration: 1.75, pose: "write", camera: Object.freeze({ targetX: -0.22, targetY: 0.18, positionX: -0.38, positionY: 0.24, positionZ: -1.45 }) }),
  findMizi: Object.freeze({ duration: 1.2, pose: "peek", camera: Object.freeze({ targetX: 0.24, targetY: 0.1, positionX: 0.3, positionY: 0.08, positionZ: -1.2 }) }),
  dropBlind: Object.freeze({ duration: 1.55, pose: "shield", followerPose: "peek", camera: Object.freeze({ targetX: 0.16, targetY: 0.22, positionX: 0.12, positionY: 0.24, positionZ: -1.55 }) }),
  cartPlaced: Object.freeze({ duration: 1.3, pose: "push", camera: Object.freeze({ targetX: 0.35, targetY: -0.04, positionX: 0.44, positionY: 0.12, positionZ: -1.15 }) }),
  openDrain: Object.freeze({ duration: 1.6, pose: "brace", camera: Object.freeze({ targetX: 0.48, targetY: -0.16, positionX: 0.32, positionY: 0.05, positionZ: -1.48 }) }),
  readWind: Object.freeze({ duration: 1.35, pose: "listen", camera: Object.freeze({ targetX: 0.12, targetY: 0.24, positionX: -0.25, positionY: 0.25, positionZ: -1.15 }) }),
  releaseBoat: Object.freeze({ duration: 1.65, pose: "pull", camera: Object.freeze({ targetX: 0.54, targetY: 0.04, positionX: 0.44, positionY: 0.12, positionZ: -1.8 }) }),
  raiseSluice: Object.freeze({ duration: 1.9, pose: "brace", camera: Object.freeze({ targetX: 0.72, targetY: -0.1, positionX: 0.5, positionY: 0.08, positionZ: -2.0 }) }),
  markRoute: Object.freeze({ duration: 1.25, pose: "signal", camera: Object.freeze({ targetX: 0.18, targetY: 0.28, positionX: 0.12, positionY: 0.24, positionZ: -1.3 }) }),
  openWellVent: Object.freeze({ duration: 1.7, pose: "lift", camera: Object.freeze({ targetX: 0.25, targetY: 0.32, positionX: 0.08, positionY: 0.28, positionZ: -1.6 }) }),
  sealEastCrack: Object.freeze({ duration: 1.75, pose: "push", camera: Object.freeze({ targetX: 0.35, targetY: 0.02, positionX: 0.42, positionY: 0.08, positionZ: -1.55 }) }),
  findChildren: Object.freeze({ duration: 1.45, pose: "count", followerPose: "peek", camera: Object.freeze({ targetX: 0.4, targetY: 0.12, positionX: 0.28, positionY: 0.16, positionZ: -1.45 }) }),
  liftShuan: Object.freeze({ duration: 1.55, pose: "lift", followerPose: "shield", camera: Object.freeze({ targetX: 0.42, targetY: 0.08, positionX: 0.36, positionY: 0.1, positionZ: -1.65 }) }),
  handShuanUp: Object.freeze({ duration: 1.7, pose: "pass", followerPose: "pass", camera: Object.freeze({ targetX: 0.54, targetY: 0.34, positionX: 0.42, positionY: 0.2, positionZ: -1.75 }) }),
  openReedExit: Object.freeze({ duration: 1.35, pose: "peek", followerPose: "board", camera: Object.freeze({ targetX: 0.55, targetY: 0.2, positionX: 0.34, positionY: 0.16, positionZ: -1.4 }) }),
  countChildren: Object.freeze({ duration: 1.55, pose: "count", followerPose: "count", camera: Object.freeze({ targetX: 0.18, targetY: 0.2, positionX: -0.12, positionY: 0.2, positionZ: -1.6 }) }),
  raiseScreen: Object.freeze({ duration: 1.9, pose: "push", followerPose: "peek", camera: Object.freeze({ targetX: 0.5, targetY: 0.18, positionX: 0.38, positionY: 0.15, positionZ: -1.7 }) }),
  meetMother: Object.freeze({ duration: 1.35, pose: "pass", followerPose: "peek", camera: Object.freeze({ targetX: 0.42, targetY: 0.18, positionX: 0.3, positionY: 0.2, positionZ: -1.45 }) }),
  motherSignal: Object.freeze({ duration: 1.65, pose: "signal", followerPose: "shield", camera: Object.freeze({ targetX: 0.62, targetY: 0.3, positionX: 0.5, positionY: 0.22, positionZ: -1.85 }) }),
  boardFerry: Object.freeze({ duration: 2.2, pose: "board", followerPose: "board", camera: Object.freeze({ targetX: 0.85, targetY: 0.08, positionX: 0.72, positionY: 0.1, positionZ: -2.1 }) }),
});

export function GetVisualProfile(chapterId) {
  return ChapterVisuals[chapterId] || ChapterVisuals.school;
}

export function GetCinematicCue(actionId) {
  return CinematicCues[actionId] || null;
}

export function GetCameraShot(chapterId, playerX) {
  const profile = GetVisualProfile(chapterId);
  const shot = profile.shots.find((candidate) => playerX >= candidate.x0 && playerX <= candidate.x1) || profile.shots[profile.shots.length - 1];
  // Wide shots keep the camera almost level, placing the playable ground in
  // the lower quarter instead of exposing a large, empty foreground stage.
  // Tunnel close shots use the same principle to keep the cutaway from being
  // squeezed between a heavy ceiling strip and a heavy floor strip.
  const establishingLookLift = { school: 3.68, blockade: 3.4, tunnel: 2.55, ferry: 3.8 };
  const tunnelLookLift = { approach: 1.55, action: 1.72, release: 1.6 };
  if (shot.kind === "establish") return { ...shot, lookLift: establishingLookLift[chapterId] ?? shot.lookLift };
  if (chapterId === "tunnel" && tunnelLookLift[shot.kind] !== undefined) return { ...shot, lookLift: tunnelLookLift[shot.kind] };
  return shot;
}
