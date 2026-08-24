// 《滕县 一九三八》场景破坏数据。
//
// 这张表只回答两件事：
//   1. 哪些是承重结构，绝不能因为一颗手榴弹把关卡骨架拆掉；
//   2. 其余材质吃多少枪弹／爆炸能量才形成一个真正可通行的破口。
//
// 运行时算法、Rapier 拓扑、真实断面与飞散碎块在 Script_Destruction.mjs。把数字留在这里，
// 是为了以后换武器、加场景时不用去碰那套几何布尔逻辑。

const FreezeProfile = (profile) => Object.freeze(profile);

// 新预破碎表现完成专项验收前，正式玩法不改变场景拓扑。破坏预览编辑器会显式
// 打开 previewMode；以后要向正片放行，只需把这个开关改成 true 并跑完整回归。
export const GAMEPLAY_DESTRUCTION_ENABLED = false;

export const DESTRUCTION_PROFILES = Object.freeze({
  structural: FreezeProfile({
    id: "structural", label: "承重结构", destructible: false,
    health: Infinity, bulletScale: 0, blastScale: 0, surface: "brick",
  }),
  masonry: FreezeProfile({
    id: "masonry", label: "砖石墙面", destructible: true,
    health: 270, bulletScale: 0.22, blastScale: 1.0, surface: "brick",
    bulletOpening: [0.58, 0.72], blastOpening: [0.95, 1.18], maxOpening: [1.65, 1.55],
    fragmentHealthScale: 0.72,
  }),
  heavyMasonry: FreezeProfile({
    id: "heavyMasonry", label: "寨墙砖体", destructible: true,
    health: 390, bulletScale: 0.12, blastScale: 0.92, surface: "brick",
    bulletOpening: [0.52, 0.65], blastOpening: [1.05, 1.18], maxOpening: [2.15, 1.72],
    fragmentHealthScale: 0.78,
  }),
  lightMasonry: FreezeProfile({
    id: "lightMasonry", label: "女墙与矮墙", destructible: true,
    health: 165, bulletScale: 0.30, blastScale: 1.15, surface: "brick",
    bulletOpening: [0.62, 0.72], blastOpening: [1.10, 1.02], maxOpening: [1.80, 1.30],
    fragmentHealthScale: 0.66,
  }),
  wood: FreezeProfile({
    id: "wood", label: "木构与楼板", destructible: true,
    health: 82, bulletScale: 0.92, blastScale: 1.35, surface: "wood",
    bulletOpening: [0.72, 0.70], blastOpening: [1.20, 1.10], maxOpening: [2.25, 1.55],
    fragmentHealthScale: 0.58,
  }),
  roofTile: FreezeProfile({
    id: "roofTile", label: "民居瓦顶", destructible: true,
    health: 105, bulletScale: 0.52, blastScale: 1.48, surface: "brick",
    bulletOpening: [0.68, 0.62], blastOpening: [1.30, 1.16], maxOpening: [2.35, 1.68],
    fragmentHealthScale: 0.56,
  }),
  straw: FreezeProfile({
    id: "straw", label: "草垛", destructible: true,
    health: 38, bulletScale: 0.78, blastScale: 1.70, surface: "dirt",
    bulletOpening: [0.78, 0.72], blastOpening: [1.36, 1.20], maxOpening: [2.20, 1.75],
    fragmentHealthScale: 0.48,
  }),
  sandbag: FreezeProfile({
    id: "sandbag", label: "沙袋与临时工事", destructible: true,
    health: 125, bulletScale: 0.45, blastScale: 1.28, surface: "sandbag",
    bulletOpening: [0.62, 0.60], blastOpening: [1.15, 0.92], maxOpening: [1.90, 1.25],
    fragmentHealthScale: 0.62,
  }),
  earth: FreezeProfile({
    id: "earth", label: "土坎与路基", destructible: true,
    health: 330, bulletScale: 0.06, blastScale: 0.82, surface: "dirt",
    bulletOpening: [0.48, 0.48], blastOpening: [1.25, 0.95], maxOpening: [2.40, 1.45],
    fragmentHealthScale: 0.80,
  }),
});

/**
 * 承重结构白名单。
 *
 * cityWall   11.5 m 包砖城墙本体与台面；
 * rampart    老式大体量城垣／墙基；
 * ramp       上城马道，拆掉会让主线路断路；
 * tower      城楼／角楼承重台基。
 *
 * 女墙（parapet）不在这张表里：它只是墙顶掩体，不承重，应该能被炮火削掉。
 */
export const STRUCTURAL_TAGS = Object.freeze(["cityWall", "rampart", "ramp", "tower"]);
const STRUCTURAL_SET = new Set(STRUCTURAL_TAGS);

const TAG_PROFILE = Object.freeze({
  wall: "masonry",
  villageWall: "masonry",
  villageFoundation: "heavyMasonry",
  villageStoneWall: "heavyMasonry",
  villageCourtyard: "lightMasonry",
  villageRoof: "roofTile",
  villageGate: "wood",
  villagePost: "wood",
  villageCart: "wood",
  villageStraw: "straw",
  zhaiWall: "heavyMasonry",
  parapet: "lightMasonry",
  prop: "wood",
  balk: "wood",
  bridge: "wood",
  platform: "wood",
  floor: "wood",
  ceiling: "wood",
  roof: "wood",
  door: "wood",
  furniture: "wood",
  barricade: "sandbag",
  sandbagPlug: "sandbag",
  grave: "earth",
  kan: "earth",
  embankment: "earth",
  // 【2026-08-25 补齐】下面这些 tag 场上一直在用，却从来没进过这张表，
  // 于是全部落到 `masonry` 默认档 —— 柴垛、货摊、木栅栏、沙袋工事按砖墙算血量，
  // 而 Script_Main 的 SURFACE_BY_TAG 同样漏了它们，打上去还出砖灰。
  // 一次对齐：这张表管吃多少火力，那张表管出什么屑，两边的键必须是同一套。
  householdWoodpile: "wood",
  householdCart: "wood",
  householdCrock: "lightMasonry",   // 陶缸：脆，但不是木头
  householdBasket: "wood",          // 荆条筐
  streetStall: "wood",
  fence: "wood",                    // 枣刺篱笆
  sandbagEmplacement: "sandbag",
  rubble: "lightMasonry",           // 下载来的砖瓦堆、可堆石块
  deadTree: "wood",                 // 枯树干
  dirt: "earth",
  fieldBank: "earth",
});

/** 未登记的新布景默认可破坏；只有显式承重 tag 才能豁免。 */
export function DestructionProfileForTag(tag) {
  if (STRUCTURAL_SET.has(tag)) return DESTRUCTION_PROFILES.structural;
  return DESTRUCTION_PROFILES[TAG_PROFILE[tag] || "masonry"];
}

/** BuildSink 写进碰撞记录的轻量元数据。 */
export function ColliderDestructionData(tag) {
  const profile = DestructionProfileForTag(tag);
  return Object.freeze({
    profile: profile.id,
    destructible: profile.destructible,
    structural: !profile.destructible,
  });
}
