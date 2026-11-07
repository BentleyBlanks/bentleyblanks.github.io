// 头发胡子测试场（?hair=1，docs/Data_HairSystem.md §6）：五排台座，每个台座一个光头胸像 + 一套头发 / 胡子。
// 头发与胡子的造型在 Hair/Data_HairStyles.json（grooms 的 id 对这里的 groom），这里只管摆在哪、哪一排、强制哪一档。
// 纯数据、零 import。

export const HAIR_RANGE_ID = 'HairRange';
export const HAIR_RANGE_WORLD = Object.freeze({ minX: -5, maxX: 5, minZ: -6, maxZ: 8, groundLimit: 24 });
export const HAIR_RANGE_CAMERA_FAR = 60;
// 台座：柱高 1.25 m，胸像底面放在柱顶（头顶约 1.55–1.6 m，站着平视）
export const HAIR_RANGE_PEDESTAL = Object.freeze({ height: 1.25, width: 0.26, color: 0x6f6a60, top: 0x8a857a, floor: 0x77797a, grid: 0x8c8e8c });

const ROW = (id, z, items) => Object.freeze({ id, z, items: Object.freeze(items.map((it, i) => Object.freeze({ ...it, x: (i - (items.length - 1) / 2) * 0.9 }))) });

// 头朝 -Z：相机默认站在 -Z 一侧往 +Z 看，第一排在最前面（z 最小）。
export const HAIR_RANGE_ROWS = Object.freeze([
  ROW('lod', -3.0, [
    { groom: 'HeYoutian_Cast', lod: 'strands' },
    { groom: 'HeYoutian_Cast', lod: 'cards' },
    { groom: 'HeYoutian_Cast', lod: 'shell' },
    { groom: 'HeYoutian_Cast', lod: 'auto' },
    { groom: 'Yi_LongStraight', lod: 'strands' },
    { groom: 'Yi_LongStraight', lod: 'cards' },
    { groom: 'Yi_LongStraight', lod: 'shell' },
  ]),
  ROW('cast', -0.6, [
    { groom: 'Shunzi_Cast' }, { groom: 'Luo_Cast' }, { groom: 'HeYoutian_Cast' },
    { groom: 'SoldierA_Cast' }, { groom: 'Jia_Cast' }, { groom: 'Yi_Cast' },
  ]),
  ROW('length', 1.8, [
    { groom: 'Jia_Buzz' }, { groom: 'HeYoutian_Crew' }, { groom: 'Shunzi_SidePart' },
    { groom: 'Luo_Messy' }, { groom: 'Yi_LongStraight' }, { groom: 'SoldierA_LongWavy' },
  ]),
  ROW('beard', 4.2, [
    { groom: 'Shunzi_Stubble' }, { groom: 'Jia_Mustache' }, { groom: 'HeYoutian_Goatee' },
    { groom: 'Luo_Boxed' }, { groom: 'SoldierA_FullLong' },
  ]),
  ROW('newCast', 6.6, [
    { groom: 'Donggua_Cast' }, { groom: 'Yaowa_Cast' }, { groom: 'LiuWencai_Cast' },
    { groom: 'OldGeng_Cast' }, { groom: 'Nier_Cast' }, { groom: 'TaniHisao_Cast' }, { groom: 'SoldierC_Cast' },
  ]),
]);

export const HAIR_RANGE_PHASE = Object.freeze({
  id: HAIR_RANGE_ID, sandbox: true, sandboxKey: 'hair', sandboxGlyph: '发',
  date: '头发实验', label: '头发胡子测试场', place: '发丝 · 发片 · 头发壳 三档对比',
  sky: 'testSceneDay', ambience: 'overcast', music: null, minutes: 600,
  story: HAIR_RANGE_ID,
  brief: ['十三个人物的光头胸像配上各自的头发胡子，另有不同长短、软硬的发型与胡子样本，以及同一套头发三档（发丝 / 发片 / 头发壳）的并排对比。',
    '按住右键转向，配合 WASD 移动、Q/E 升降、Shift 加速；中键平移，Alt + 左键环绕，滚轮缩放，F 聚焦。场景右上角有五排展示的用途导览。'],
  objectives: ['对比发丝、发片、头发壳三档与各种发型胡子'],
  mechanic: '测试场：独立观察相机，玩家无敌，无敌军与武器。',
  nraPool: 9999, poolGain: 0, ijaPool: 9999, ijaPressure: 0, ijaSpawn: [], ijaSupport: [],
  ijaForce: { lmgEvery: 13, hmgTeams: 0, engineers: false, armor: 0, motorTransport: 'rearOnly' },
  ambientAircraft: false, disarmed: true,
  bounds: HAIR_RANGE_WORLD, cameraFar: HAIR_RANGE_CAMERA_FAR, zones: [Object.freeze({ id: 'Pedestals', name: '台座', x: 0, z: 0, radius: 4 })],
  spawn: { x: 0, z: -5, ry: 0 }, hud: { objectiveMarkers: false }, externalPlacements: [],
  loadoutOverride: { primary: null, secondary: null, melee: null, throwables: { Grenade: 0, GrenadeBundle: 0 }, spareClips: 0,
    note: '只观察头发，不携带武器。' },
});
