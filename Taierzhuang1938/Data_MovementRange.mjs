// Permanent movement acceptance fixtures; metres, +Y up, all approaches face -Z.
// Boundary fixtures derive from the production traversal table, never from labels.
import { TRAVERSAL } from "./Data_Traversal.mjs";
export const MOVEMENT_RANGE_ID = "MovementRange";
export const MOVEMENT_RANGE_WORLD = { minX: 3150, maxX: 3248, minZ: 3150, maxZ: 3225, groundLimit: 3400 };
export const MOVEMENT_RANGE_STATIONS = [
  { id: "Jump", name: "01 跳跃高度", x: 3162, z: 3206, radius: 2, ry: 0, color: "Blue" },
  { id: "RunJump", name: "02 助跑跳远", x: 3183, z: 3208, radius: 2, ry: 0, color: "Green" },
  { id: "Vault", name: "03 翻越 / 攀爬", x: 3206, z: 3206, radius: 2, ry: 0, color: "Orange" },
  { id: "Crouch", name: "04 蹲起移动", x: 3167, z: 3176, radius: 2, ry: 0, color: "Cyan" },
  { id: "Prone", name: "05 匍匐移动", x: 3201, z: 3176, radius: 2, ry: 0, color: "Purple" },
];
export const MOVEMENT_RUNWAY = { x: 3183, startZ: 3208, zeroZ: 3194, endZ: 3186, width: 5 };
export const MOVEMENT_HEIGHTS = [0.30, TRAVERSAL.stepMax, TRAVERSAL.vaultMin,
  TRAVERSAL.jumpRiseMax, TRAVERSAL.jumpRiseMax + 0.10];
export const MOVEMENT_VAULT_HEIGHTS = [TRAVERSAL.vaultMin, 1.0, TRAVERSAL.vaultMax,
  TRAVERSAL.vaultMax + 0.05, 1.6, TRAVERSAL.mantleMax, TRAVERSAL.mantleMax + 0.10];
export const MOVEMENT_FIXTURES = [
  ...MOVEMENT_HEIGHTS.map((h, i) => ({ id: 'Jump' + i, station: 'Jump', x: 3158 + i % 3 * 5,
    z: 3199 - Math.floor(i / 3) * 8, w: 2.6, h, d: 0.5, kind: 'height', color: 'Blue' })),
  ...MOVEMENT_VAULT_HEIGHTS.map((h, i) => ({ id: 'Vault' + i, station: 'Vault', x: 3203 + i % 4 * 8,
    z: 3199 - Math.floor(i / 4) * 9, w: 3, h, d: 0.5, kind: 'height',
    color: h > TRAVERSAL.mantleMax ? 'Red' : h > TRAVERSAL.vaultMax ? 'Purple' : 'Orange' })),
  ...[1.1, 1.3, 1.85].map((clearance, i) => ({ id: 'Crouch' + i, station: 'Crouch',
    x: 3161 + i * 6, z: 3166, w: 2.5, d: 7, clearance, kind: 'tunnel', color: 'Cyan' })),
  ...[0.65, 0.9, 1.1].map((clearance, i) => ({ id: 'Prone' + i, station: 'Prone',
    x: 3195 + i * 6, z: 3166, w: 2.5, d: 7, clearance, kind: 'tunnel', color: 'Purple' })),
];
export const MOVEMENT_RANGE_PHASE = {
  id: MOVEMENT_RANGE_ID, sandbox: true, sandboxKey: 'movement', sandboxGlyph: '跃',
  date: '操作白盒', label: '操作交互测试场', place: '跳跃 / 跑跳 / 翻越 / 蹲行 / 匍匐',
  sky: 'testSceneDay', music: null, minutes: 600, story: MOVEMENT_RANGE_ID,
  cutsceneIn: null, cutsceneOut: null,
  brief: ['五个工位共用正式角色控制器。白盒刻度单位为米，高度以脚底为零点。',
    'Home 复位并恢复体力；PageUp / PageDown 切换工位。右侧记录本次与会话最佳实测成绩。'],
  objectives: ['自由测试操作'], mechanic: 'Space 跳跃 / 翻越；Shift 冲刺；C 蹲起；Z 趴下。',
  nraPool: 9999, poolGain: 0, ijaPool: 9999, ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: 'rearOnly' },
  bounds: MOVEMENT_RANGE_WORLD, cameraFar: 160, zones: MOVEMENT_RANGE_STATIONS,
  spawn: { x: 3183, z: 3216, ry: 0 }, hud: { objectiveMarkers: false },
  loadoutOverride: { primary: 'HanYang', secondary: null, melee: 'Dadao',
    throwables: { Grenade: 0, GrenadeBundle: 0 }, spareClips: 0, note: '操作测试，无敌军。' },
};
