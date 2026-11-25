// 头发胡子测试场（?hair=1，docs/Data_HairSystem.md §6）：每名游戏角色一个头部预览。
// 头发与胡子的造型在 Hair/Data_HairStyles.json（grooms 的 id 对这里的 groom），没有单独毛发套装的角色从现行游戏模型读取头部。
// 纯数据、零 import。

export const HAIR_RANGE_ID = 'HairRange';
export const HAIR_RANGE_WORLD = Object.freeze({ minX: -5, maxX: 5, minZ: -6, maxZ: 8, groundLimit: 24 });
export const HAIR_RANGE_CAMERA_FAR = 60;
// 台座：柱高 1.25 m，胸像底面放在柱顶（头顶约 1.55–1.6 m，站着平视）
export const HAIR_RANGE_PEDESTAL = Object.freeze({ height: 1.25, width: 0.26, color: 0x6f6a60, top: 0x8a857a, floor: 0x77797a, grid: 0x8c8e8c });

const ROW = (id, z, items) => Object.freeze({ id, z, items: Object.freeze(items.map((it, i) => Object.freeze({ ...it, x: (i - (items.length - 1) / 2) * 0.9 }))) });

// 头朝 -Z：相机默认站在 -Z 一侧往 +Z 看，第一排在最前面（z 最小）。
export const HAIR_RANGE_ROWS = Object.freeze([
  ROW('cast', -2.4, [
    { character: 'shunzi', groom: 'Shunzi_Cast' },
    { character: 'luo', groom: 'Luo_Cast' },
    { character: 'heYoutian', groom: 'HeYoutian_Cast' },
    { character: 'donggua', groom: 'Donggua_Cast' },
    { character: 'yaowa', groom: 'Yaowa_Cast' },
    { character: 'liuWencai', groom: 'LiuWencai_Cast' },
    { character: 'oldGeng', groom: 'OldGeng_Cast' },
  ]),
  ROW('civilian', 0, [
    { character: 'nier', groom: 'Nier_Cast' },
    { character: 'erya' },
    { character: 'tianSao' },
  ]),
  ROW('ija', 2.4, [
    { character: 'ijaA', groom: 'SoldierA_Cast' },
    { character: 'ijaJia', groom: 'Jia_Cast' },
    { character: 'ijaYi', groom: 'Yi_Cast' },
    { character: 'ijaC', groom: 'SoldierC_Cast' },
    { character: 'taniHisao', groom: 'TaniHisao_Cast' },
    { character: 'azumaShiro', groom: 'AzumaShiro_Cast' },
    { character: 'interpreter', groom: 'Interpreter_Cast' },
  ]),
]);

export const HAIR_RANGE_PHASE = Object.freeze({
  id: HAIR_RANGE_ID, sandbox: true, sandboxKey: 'hair', sandboxGlyph: '发',
  date: '头发实验', label: '头发胡子测试场', place: '游戏角色头部预览',
  sky: 'testSceneDay', ambience: 'overcast', music: null, minutes: 600,
  story: HAIR_RANGE_ID,
  brief: ['按角色查看游戏人物的头部、发型和胡须。',
    '按住右键转向，配合 WASD 移动、Q/E 升降、Shift 加速；中键平移，Alt + 左键环绕，滚轮缩放，F 聚焦。可从右上角切换角色分组。'],
  objectives: ['查看游戏角色头部'],
  mechanic: '测试场：独立观察相机，玩家无敌，无敌军与武器。',
  nraPool: 9999, poolGain: 0, ijaPool: 9999, ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: 'rearOnly' },
  ambientAircraft: false, disarmed: true,
  bounds: HAIR_RANGE_WORLD, cameraFar: HAIR_RANGE_CAMERA_FAR, zones: [Object.freeze({ id: 'Pedestals', name: '台座', x: 0, z: 0, radius: 4 })],
  spawn: { x: 0, z: -5, ry: 0 }, hud: { objectiveMarkers: false }, externalPlacements: [],
  loadoutOverride: { primary: null, secondary: null, melee: null, throwables: { Grenade: 0, GrenadeBundle: 0 }, spareClips: 0,
    note: '只观察头发，不携带武器。' },
});
