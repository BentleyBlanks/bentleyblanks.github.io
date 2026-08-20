// 《滕县 一九三八》场景破坏数据。
//
// 这张表只回答两件事：
//   1. 哪些是承重结构，绝不能因为一颗手榴弹把关卡骨架拆掉；
//   2. 其余材质吃多少枪弹／爆炸能量才形成一个真正可通行的破口。
//
// 运行时算法、Rapier 拓扑与视觉残骸在 Script_Destruction.mjs。把数字留在这里，
// 是为了以后换武器、加场景时不用去碰那套几何布尔逻辑。

const FreezeProfile = (profile) => Object.freeze(profile);

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
