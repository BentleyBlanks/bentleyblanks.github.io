// 人物分部位命中体的**纯数据**清单（零 three，契约 2）。
//
// 这张表原来住在 `Script_CharacterModel.mjs` 里，那个模块 import three；
// 断肢规则层（`Script_Dismemberment.mjs`）与它的纯 Node 测试要拿 shape id 与
// `Data_Tuning_Gore.LIMBS` 互核（同名肢体必须两边都有），不能为此把 three 拖进
// 规则层。所以把定义搬到这里，`Script_CharacterModel` 原样 re-export ——
// 运行时读到的仍是同一个冻结数组，行为一字不变。
//
// 语义（沿用原注释）：
//   id       —— 唯一名。断肢系统按它认肢体（`upperArmL/forearmL/thighL/calfL/head`）。
//   type     —— sphere（球，按 role 取一个节点）/ capsule（胶囊，a→b 两根骨头）。
//                NRA 的头在运行时改判 ellipsoid（帽檐比颅骨宽），那是 rig 侧的事。
//   radius   —— 名义半径（米），运行时按 rig 的**世界缩放**乘一次。
//   part     —— 交给伤害口径的粗分类（head / torso / limb），见 Soldier.TakeHit。
//   priority —— 同距离时谁优先（头 > 躯干 > 四肢）。

export const CHARACTER_HITBOX_PROFILE = Object.freeze([
  { id: "head", type: "sphere", role: "headCenter", radius: 0.15, nraWidthScale: 0.8,
    part: "head", priority: 3 },
  { id: "upperTorso", type: "capsule", a: "chest", b: "neck", radius: 0.135, part: "torso", priority: 1 },
  { id: "lowerTorso", type: "capsule", a: "pelvis", b: "chest", radius: 0.19, part: "torso", priority: 1 },
  { id: "upperArmL", type: "capsule", a: "upperArmL", b: "forearmL", radius: 0.075, part: "limb", priority: 0 },
  { id: "forearmL", type: "capsule", a: "forearmL", b: "handL", radius: 0.060, part: "limb", priority: 0 },
  { id: "upperArmR", type: "capsule", a: "upperArmR", b: "forearmR", radius: 0.075, part: "limb", priority: 0 },
  { id: "forearmR", type: "capsule", a: "forearmR", b: "handR", radius: 0.060, part: "limb", priority: 0 },
  { id: "thighL", type: "capsule", a: "thighL", b: "calfL", radius: 0.10, part: "limb", priority: 0 },
  { id: "calfL", type: "capsule", a: "calfL", b: "footL", radius: 0.075, part: "limb", priority: 0 },
  { id: "thighR", type: "capsule", a: "thighR", b: "calfR", radius: 0.10, part: "limb", priority: 0 },
  { id: "calfR", type: "capsule", a: "calfR", b: "footR", radius: 0.075, part: "limb", priority: 0 },
]);

/** shape id 的集合，供规则层与测试互核。 */
export const CHARACTER_HITBOX_IDS = Object.freeze(CHARACTER_HITBOX_PROFILE.map((shape) => shape.id));
