// 断肢规则层的纯 Node 闸门（毫秒级，零浏览器）。口径：docs/Data_Dismemberment.md §10.1。
//
// 这条测试**不 import three**：规则层与 Data_* 是零 three 的（契约 2），
// 肢体 id 与命中体 shape id 的互核走纯数据的 `Data_CharacterHitbox.mjs`。

import assert from "node:assert/strict";
import { LIMBS, SEVER_RULES, BUDGET, LAUNCH, ENABLED, LIMB_POOLS } from "./Data_Tuning_Gore.mjs";
import { CHARACTER_HITBOX_IDS } from "./Data_CharacterHitbox.mjs";
import {
  LIMB_IDS, LimbSubtree, LimbForBone, ClassifyVertices, FilterIndex, ResolveSever,
  GoreBudget, CodeForLimb, LimbForCode, SetGoreEnabled, IsGoreEnabled, PickMeleeShape,
} from "./Script_Dismemberment.mjs";

let checks = 0;
const Ok = (condition, label) => { checks += 1; assert.ok(condition, label); };
const Eq = (actual, expected, label) => { checks += 1; assert.equal(actual, expected, label); };

/** 与 Soldier.rnd 同族的确定性随机（Mulberry32），测试自带一份免得 import 运行时。 */
function Mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 1. 数据表与命中体互核（§10.1 最后一条）
// ---------------------------------------------------------------------------
Eq(ENABLED, true, "内容总闸出厂是开的");
for (const id of LIMB_IDS) {
  Ok(CHARACTER_HITBOX_IDS.includes(id), `肢体 ${id} 在 CHARACTER_HITBOX_PROFILE 里有同名 shape`);
  const spec = LIMBS[id];
  Ok(spec.bones instanceof RegExp, `${id} 的 bones 是正则`);
  Ok(spec.capRadius > 0 && spec.mass > 0 && spec.halfLength > 0, `${id} 的尺寸/质量为正`);
  Ok(!spec.axisTo || LIMBS[id].joint !== spec.axisTo, `${id} 的断口轴两端不同`);
  Eq(CodeForLimb(id) > 0, true, `${id} 有非零编码`);
  Eq(LimbForCode(CodeForLimb(id)), id, `${id} 编码可逆`);
}
Eq(CodeForLimb(null), 0, "躯干编码是 0");
Eq(LimbForCode(0), null, "0 不是任何肢体");
// 躯干那三只不许被当成可卸肢体（不做腰斩）。
for (const id of ["upperTorso", "lowerTorso"]) {
  Eq(LIMBS[id], undefined, `${id} 不在可卸肢体表里`);
}
for (const kind of Object.keys(SEVER_RULES)) {
  const rule = SEVER_RULES[kind];
  Ok(rule.chance && rule.chance.limb >= 0 && rule.chance.head >= 0, `${kind} 有两档概率`);
  Ok(LAUNCH[kind], `${kind} 有对应的 LAUNCH 初速`);
}
for (const quality of ["low", "medium", "high", "ultra"]) {
  const budget = BUDGET[quality];
  Ok(budget && budget.maxParts > 0 && budget.partLifeS > 0, `${quality} 档预算完整`);
}
Ok(BUDGET.low.maxParts < BUDGET.ultra.maxParts, "画质越高肢块上限越高");
for (const [name, pool] of Object.entries(LIMB_POOLS)) {
  Ok(pool.length > 0 && pool.every((id) => LIMBS[id]), `LIMB_POOLS.${name} 全是可卸肢体`);
  Ok(!pool.includes("head"), `LIMB_POOLS.${name} 不含头（头只按命中体报 head 时骰）`);
}
{
  const tiers = SEVER_RULES.blast.tiers;
  Ok(Array.isArray(tiers) && tiers.length >= 2, "爆炸有 falloff 分档表");
  for (let i = 1; i < tiers.length; i += 1) {
    Ok(tiers[i].minFalloff < tiers[i - 1].minFalloff, "分档表按 minFalloff 降序");
    Ok(tiers[i].maxLimbs <= tiers[i - 1].maxLimbs, "越远段数越少");
  }
  Eq(tiers[tiers.length - 1].minFalloff, SEVER_RULES.blast.minFalloff, "最后一档的门槛就是 minFalloff");
}

// ---------------------------------------------------------------------------
// 2. LimbSubtree：contains 递归展开
// ---------------------------------------------------------------------------
assert.deepEqual(LimbSubtree("upperArmL"), ["upperArmL", "forearmL"], "上臂带着前臂一起飞");
checks += 1;
assert.deepEqual(LimbSubtree("thighR"), ["thighR", "calfR"], "大腿带着小腿一起飞");
checks += 1;
assert.deepEqual(LimbSubtree("forearmR"), ["forearmR"], "前臂只有自己");
checks += 1;
assert.deepEqual(LimbSubtree("head"), ["head"], "头只有自己");
checks += 1;
assert.deepEqual(LimbSubtree("nope"), [], "不认识的名字返回空");
checks += 1;

// ---------------------------------------------------------------------------
// 3. ClassifyVertices：合成骨名表（照十套 GLB 的真名写：有空格、无点号）
// ---------------------------------------------------------------------------
const BONES = [
  "Bip001 Spine",        // 0 躯干
  "Bip001 Spine2",       // 1 躯干
  "Bip001 L UpperArm",   // 2
  "Bip001 L Forearm",    // 3
  "Bip001 L Hand",       // 4
  "Bip001 L Finger02",   // 5 手指 → 归前臂
  "Bip001 R Thigh",      // 6
  "Bip001 R Calf",       // 7
  "Bip001 R Toe0",       // 8 脚趾 → 归小腿
  "Bip001 Head",         // 9
  "Bip001 HeadNub",      // 10 头骨的末端节点：**不**算头（正则带 $）
  "Bip001 Pelvis",       // 11 躯干
];
Eq(LimbForBone("Bip001 L Finger02"), "forearmL", "手指顶点归前臂（不是上臂）");
Eq(LimbForBone("Bip001 R Toe0"), "calfR", "脚趾顶点归小腿");
Eq(LimbForBone("Bip001 L UpperArm"), "upperArmL", "上臂骨归上臂");
Eq(LimbForBone("Bip001 Spine2"), null, "Spine 不属于任何可卸肢体");
Eq(LimbForBone("Bip001 Head"), "head", "头骨归头");
Eq(LimbForBone("Bip001 HeadNub"), null, "HeadNub 不归头（正则是精确匹配）");
Eq(LimbForBone("Bip002 L Forearm"), "forearmL", "Bip002 那几套模型同样认");
// GLTFLoader 会把空白换成下划线：运行时读到的是 `Bip001_L_Forearm`，两种写法都得认。
// 这一条是实机取证逼出来的（第一版切了半天一个三角都没少）。
Eq(LimbForBone("Bip001_L_Forearm"), "forearmL", "下划线形（GLTFLoader 归一化后）同样认");
Eq(LimbForBone("Bip001_R_Thigh"), "thighR", "下划线形的大腿同样认");
Eq(LimbForBone("Bip001_Head"), "head", "下划线形的头同样认");
Eq(LimbForBone("Bip001_HeadNub"), null, "下划线形的 HeadNub 仍然不归头");
Eq(LimbForBone("Bip001_Spine2"), null, "下划线形的 Spine 仍然不切");

// 每顶点四个影响，取权重最大的那根骨。第 3 个顶点故意把主导权给手指、次权给躯干。
const vertexCount = 6;
const skinIndex = new Uint16Array([
  0, 1, 2, 3,     // v0 主导 Spine   → 0
  2, 3, 0, 0,     // v1 主导 L UpperArm
  3, 2, 0, 0,     // v2 主导 L Forearm
  1, 5, 0, 0,     // v3 主导 L Finger02（次权 Spine，权重更小）
  9, 1, 0, 0,     // v4 主导 Head
  8, 7, 0, 0,     // v5 主导 R Toe0 → calfR
]);
const skinWeight = new Float32Array([
  0.7, 0.2, 0.1, 0.0,
  0.8, 0.2, 0.0, 0.0,
  0.9, 0.1, 0.0, 0.0,
  0.3, 0.7, 0.0, 0.0,
  1.0, 0.0, 0.0, 0.0,
  0.6, 0.4, 0.0, 0.0,
]);
const vertexLimb = ClassifyVertices(BONES, skinIndex, skinWeight, vertexCount);
Eq(LimbForCode(vertexLimb[0]), null, "Spine 顶点是 0（躯干不切）");
Eq(LimbForCode(vertexLimb[1]), "upperArmL", "上臂顶点归上臂");
Eq(LimbForCode(vertexLimb[2]), "forearmL", "前臂顶点归前臂");
Eq(LimbForCode(vertexLimb[3]), "forearmL", "手指顶点归前臂（按主导骨，不按加权和）");
Eq(LimbForCode(vertexLimb[4]), "head", "头顶点归头");
Eq(LimbForCode(vertexLimb[5]), "calfR", "脚趾顶点归小腿");
Eq(ClassifyVertices(BONES, null, null, 4).length, 4, "缺蒙皮属性时整片返回 0 而不是抛");

// ---------------------------------------------------------------------------
// 4. FilterIndex：三角守恒 + 跨断口丢弃
//
// 合成一具「三棱柱」：v0/v1 躯干，v2/v3 上臂，v4/v5 前臂，
// 三角形里既有纯躯干、纯肢体，也有跨断口的。
// ---------------------------------------------------------------------------
const prismLimb = new Uint8Array([
  0,                        // v0 躯干
  0,                        // v1 躯干
  CodeForLimb("upperArmL"), // v2
  CodeForLimb("upperArmL"), // v3
  CodeForLimb("forearmL"),  // v4
  CodeForLimb("forearmL"),  // v5
  CodeForLimb("thighR"),    // v6
]);
const prismIndex = new Uint32Array([
  0, 1, 0,   // 纯躯干
  2, 3, 2,   // 纯上臂
  4, 5, 4,   // 纯前臂
  1, 2, 3,   // 躯干↔上臂：跨断口
  3, 4, 5,   // 上臂↔前臂：同一条胳膊内部（卸上臂时应整体进 part）
  0, 6, 1,   // 躯干↔大腿：卸胳膊时不受影响
]);
const totalTriangles = prismIndex.length / 3;

{
  const cut = FilterIndex(prismIndex, prismLimb, ["upperArmL"]);
  const bodyTriangles = cut.body.length / 3;
  let partTriangles = 0;
  for (const list of cut.parts.values()) partTriangles += list.length / 3;
  Eq(bodyTriangles + partTriangles + cut.dropped, totalTriangles,
    "卸上臂：身体 + 肢块 + 丢弃 = 原三角数（守恒）");
  Eq(partTriangles, 3, "整条胳膊（上臂 + 前臂 + 两段之间那片）都进了同一段肢块");
  Eq(cut.dropped, 1, "跨断口的那一片被丢弃（断面盖遮住）");
  Eq(bodyTriangles, 2, "身上只剩两片纯躯干/带大腿的三角");
  Eq([...cut.parts.keys()].join(","), "upperArmL", "肢块只有 upperArmL 一段");
}

{
  const cut = FilterIndex(prismIndex, prismLimb, ["forearmL"]);
  let partTriangles = 0;
  for (const list of cut.parts.values()) partTriangles += list.length / 3;
  Eq(cut.body.length / 3 + partTriangles + cut.dropped, totalTriangles,
    "只卸前臂同样守恒");
  Eq(partTriangles, 1, "只卸前臂时上臂还留在身上");
  Eq(cut.dropped, 1, "上臂↔前臂那片成了新的跨断口三角");
}

{
  const cut = FilterIndex(prismIndex, prismLimb, ["upperArmL", "thighR"]);
  Eq(cut.parts.size, 2, "一次卸两段就有两块肢块");
  let partTriangles = 0;
  for (const list of cut.parts.values()) partTriangles += list.length / 3;
  Eq(cut.body.length / 3 + partTriangles + cut.dropped, totalTriangles, "卸两段仍然守恒");
}

{
  const untouched = FilterIndex(prismIndex, prismLimb, []);
  Eq(untouched.body.length, prismIndex.length, "一段都不卸时 index 原样返回");
  Eq(untouched.dropped, 0, "一段都不卸时不丢三角");
  Eq(untouched.parts.size, 0, "一段都不卸时没有肢块");
}

{
  // 非索引几何（index = null）走隐式顺序。
  const flat = FilterIndex(null, new Uint8Array([0, 0, 0, CodeForLimb("head"),
    CodeForLimb("head"), CodeForLimb("head")]), ["head"]);
  Eq(flat.body.length / 3, 1, "非索引几何：躯干那片留下");
  Eq(flat.parts.get("head").length / 3, 1, "非索引几何：头那片进肢块");
}

// ---------------------------------------------------------------------------
// 5. ResolveSever
// ---------------------------------------------------------------------------
const Hit = (extra = {}) => ({
  part: "limb", shapeId: "forearmL", kind: "bullet", damage: 90, wouldDie: true,
  rng: Mulberry32(1938), ...extra,
});

// 同 seed 同结果
{
  const a = ResolveSever(Hit({ kind: "hmg", rng: Mulberry32(7) }));
  const b = ResolveSever(Hit({ kind: "hmg", rng: Mulberry32(7) }));
  assert.deepEqual(a, b, "同一个种子两次判定完全一致");
  checks += 1;
}

// 步枪弹：未致死永不断
for (let seed = 1; seed <= 40; seed += 1) {
  const result = ResolveSever(Hit({ wouldDie: false, rng: Mulberry32(seed) }));
  Eq(result.limbs.length, 0, `bullet 未致死永不断（seed ${seed}）`);
  Eq(result.reason, "notLethal", `bullet 未致死的理由是 notLethal（seed ${seed}）`);
}

// 步枪弹伤害不够（擦伤致死也不卸）
Eq(ResolveSever(Hit({ damage: 20 })).reason, "lowDamage", "伤害低于 minDamage 不断");

// 步枪弹概率极低：四百次里断的次数在合理区间（chance 0.06）
{
  let severed = 0;
  for (let seed = 1; seed <= 400; seed += 1) {
    if (ResolveSever(Hit({ rng: Mulberry32(seed * 977) })).limbs.length) severed += 1;
  }
  Ok(severed > 5 && severed < 60, `bullet 400 次里断 ${severed} 次（chance 0.06 的合理区间）`);
}

// 步枪打头永不断（chance.head = 0）
for (let seed = 1; seed <= 60; seed += 1) {
  const result = ResolveSever(Hit({ shapeId: "head", part: "head", rng: Mulberry32(seed * 31) }));
  Eq(result.limbs.length, 0, `bullet 打头不爆头（seed ${seed}）`);
}

// 刺刀 / 枪托永不断
for (const kind of ["thrust", "bash"]) {
  for (let seed = 1; seed <= 40; seed += 1) {
    const result = ResolveSever(Hit({ kind, mode: kind, damage: 260, rng: Mulberry32(seed * 13) }));
    Eq(result.limbs.length, 0, `${kind} 永不卸肢（seed ${seed}）`);
  }
}

// 大刀：只认 slash / cut
Eq(ResolveSever(Hit({ kind: "blade", mode: "thrust", damage: 260, rng: Mulberry32(3) })).reason,
  "mode", "大刀链里的捅刺动作被 modes 挡住");
{
  let severed = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    if (ResolveSever(Hit({ kind: "blade", mode: "slash", damage: 260, rng: Mulberry32(seed * 17) }))
      .limbs.length) severed += 1;
  }
  Ok(severed > 30, `大刀劈砍大多数会断（60 次里 ${severed} 次，chance 0.80）`);
}

// 爆炸：falloff 不够不断；够了最多 maxLimbs 段且互不冲突
for (let seed = 1; seed <= 30; seed += 1) {
  const result = ResolveSever(Hit({
    kind: "blast", shapeId: null, part: "torso", wouldDie: true, falloff: 0.3,
    rng: Mulberry32(seed * 5),
  }));
  Eq(result.limbs.length, 0, `blast falloff 0.3 < minFalloff 不断（seed ${seed}）`);
  Eq(result.reason, "falloff", `blast falloff 不够的理由是 falloff（seed ${seed}）`);
}
{
  let maxSeen = 0, severedCount = 0, forceKilled = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const result = ResolveSever(Hit({
      kind: "blast", shapeId: null, part: "torso", wouldDie: true, falloff: 0.95,
      rng: Mulberry32(seed * 2654435761),
    }));
    if (!result.limbs.length) continue;
    severedCount += 1;
    maxSeen = Math.max(maxSeen, result.limbs.length);
    if (result.forceKill) forceKilled += 1;
    Ok(result.limbs.length <= SEVER_RULES.blast.tiers[0].maxLimbs,
      `blast 一次最多 ${SEVER_RULES.blast.tiers[0].maxLimbs} 段（seed ${seed} 出了 ${result.limbs.length}）`);
    Eq(new Set(result.limbs).size, result.limbs.length, `blast 不重复卸同一段（seed ${seed}）`);
    for (const a of result.limbs) {
      for (const b of result.limbs) {
        if (a === b) continue;
        Ok(!LimbSubtree(a).includes(b), `blast 不同时卸 ${a} 与它的子段 ${b}`);
      }
    }
    Ok(!result.limbs.includes("head"), `blast 未命中头部时不挑头（seed ${seed}）`);
  }
  Ok(severedCount > 150, `blast 近炸绝大多数会断（200 次里 ${severedCount} 次）`);
  Eq(forceKilled, 0, "blast 只在致死的那一发上卸肢，从不把人抬成致死（断肢不改生死）");
  for (let seed = 1; seed <= 40; seed += 1) {
    const result = ResolveSever(Hit({ kind: "blast", shapeId: null, part: "torso", wouldDie: false, falloff: 0.95,
      rng: Mulberry32(seed * 977) }));
    Eq(result.limbs.length, 0, `blast 近炸但没炸死的人不卸肢（seed ${seed}）`);
    Eq(result.reason, "notLethal", "理由是 notLethal");
  }
  Ok(maxSeen >= 2, `blast 会出现多段同时卸（最多见到 ${maxSeen} 段）`);
}
// 爆炸按 falloff 分档：一米圈多段、两米圈最多两段、三米圈只掉一段、再远不断
// （木柄手榴弹 6.5 m × radiusScale 1.9：1 m ≈ 0.91 / 2 m ≈ 0.83 / 3 m ≈ 0.75 / 4 m ≈ 0.67）。
{
  const Count = (falloff, seeds = 120) => {
    let severed = 0, multi = 0, maxSeen = 0;
    for (let seed = 1; seed <= seeds; seed += 1) {
      const result = ResolveSever(Hit({ kind: "blast", shapeId: null, part: "torso", wouldDie: true,
        falloff, rng: Mulberry32(seed * 7919) }));
      if (!result.limbs.length) continue;
      severed += 1;
      if (result.limbs.length >= 2) multi += 1;
      maxSeen = Math.max(maxSeen, result.limbs.length);
    }
    return { severed, multi, maxSeen };
  };
  const ring1 = Count(0.91), ring2 = Count(0.83), ring3 = Count(0.75), ring4 = Count(0.67);
  Ok(ring1.maxSeen >= 3 && ring1.multi > ring1.severed * 0.8,
    `一米圈大多数连卸两段以上（${ring1.multi}/${ring1.severed}，最多 ${ring1.maxSeen} 段）`);
  Ok(ring2.maxSeen <= 2 && ring2.multi > 0, `两米圈最多两段（最多 ${ring2.maxSeen}，多段 ${ring2.multi} 次）`);
  Eq(ring3.maxSeen, 1, "三米圈只掉一段");
  Ok(ring3.severed > 100, `三米圈仍几乎必断一段（${ring3.severed}/120）`);
  Eq(ring4.severed, 0, "四米圈一段都不掉（低于 minFalloff）");
}

// 大刀没给命中体时只砍胳膊（不掉腿、不随机掉头）
{
  let severed = 0;
  for (let seed = 1; seed <= 80; seed += 1) {
    const result = ResolveSever(Hit({ kind: "blade", mode: "slash", damage: 260, shapeId: null,
      part: "torso", rng: Mulberry32(seed * 31) }));
    if (!result.limbs.length) continue;
    severed += 1;
    Eq(result.limbs.length, 1, "大刀一刀只卸一段");
    Ok(LIMB_POOLS.blade.includes(result.limbs[0]), `大刀卸的是胳膊，不是 ${result.limbs[0]}`);
  }
  Ok(severed > 40, `大刀无命中体时照样按 0.80 断（80 次里 ${severed} 次）`);
  // 命中体报了头，才按 head 那一档骰头。
  let heads = 0;
  for (let seed = 1; seed <= 80; seed += 1) {
    const result = ResolveSever(Hit({ kind: "blade", mode: "slash", damage: 260, shapeId: "head",
      part: "head", rng: Mulberry32(seed * 37) }));
    if (result.limbs.length) { heads += 1; Eq(result.limbs[0], "head", "劈中头就卸头"); }
  }
  Ok(heads > 8 && heads < 45, `劈头按 chance.head 0.30 骰（80 次里 ${heads} 次）`);
}

// AI 打 AI 那条链只有粗部位：抽到 arm 就在四条胳膊段里挑，leg 同理
for (const [part, pool] of [["arm", LIMB_POOLS.arm], ["leg", LIMB_POOLS.leg]]) {
  let severed = 0;
  for (let seed = 1; seed <= 120; seed += 1) {
    const result = ResolveSever(Hit({ kind: "hmg", shapeId: null, part, damage: 95, wouldDie: true,
      rng: Mulberry32(seed * 101) }));
    if (!result.limbs.length) continue;
    severed += 1;
    Ok(pool.includes(result.limbs[0]), `部位 ${part} 只卸 ${pool.join("/")}，不是 ${result.limbs[0]}`);
  }
  Ok(severed > 15, `hmg 打 ${part} 按 0.30 断（120 次里 ${severed} 次）`);
}

// PickMeleeShape：离挥砍视线最近的那一段（纯几何）
{
  const shapes = [
    { id: "head", type: "sphere", center: { x: 0, y: 1.6, z: -2 } },
    { id: "upperArmL", type: "capsule", start: { x: 0.25, y: 1.4, z: -2 }, end: { x: 0.3, y: 1.1, z: -2 } },
    { id: "forearmL", type: "capsule", start: { x: 0.3, y: 1.1, z: -2 }, end: { x: 0.35, y: 0.85, z: -2 } },
    { id: "upperArmR", type: "capsule", start: { x: -0.25, y: 1.4, z: -2 }, end: { x: -0.3, y: 1.1, z: -2 } },
    { id: "thighL", type: "capsule", start: { x: 0.1, y: 0.9, z: -2 }, end: { x: 0.1, y: 0.5, z: -2 } },
    { id: "upperTorso", type: "capsule", start: { x: 0, y: 1.2, z: -2 }, end: { x: 0, y: 1.45, z: -2 } },
  ];
  const eye = { x: 0, y: 1.6, z: 0 };
  Eq(PickMeleeShape(eye, { x: 0.3, y: -0.35, z: -2 }, shapes), "upperArmL", "朝左肩挥过去劈中左上臂");
  Eq(PickMeleeShape(eye, { x: -0.3, y: -0.35, z: -2 }, shapes), "upperArmR", "朝右肩挥过去劈中右上臂");
  Eq(PickMeleeShape(eye, { x: 0.35, y: -0.65, z: -2 }, shapes), "forearmL", "低一点劈中左前臂");
  Eq(PickMeleeShape(eye, { x: 0, y: 0, z: -2 }, shapes, ["head", "upperArmL"]), "head", "池子里有头且视线正对头才选头");
  Eq(PickMeleeShape(eye, { x: 0.1, y: -1.0, z: -2 }, shapes), "forearmL", "默认池子里没有腿：朝腿劈也只报最近的胳膊段");
  Eq(PickMeleeShape(eye, { x: 0, y: 0, z: 2 }, shapes), null, "身后的段不算");
  Eq(PickMeleeShape(eye, { x: 0, y: 0, z: -2 }, []), null, "没有命中体返回 null");
}

// 命中体给了哪一段就卸哪一段
{
  const result = ResolveSever(Hit({ kind: "hmg", shapeId: "thighR", rng: Mulberry32(2) }));
  if (result.limbs.length) Eq(result.limbs[0], "thighR", "命中大腿就卸大腿（主段跟着 shapeId）");
}

// 别名：车载 / 架设机枪按 hmg 判，不认识的 kind 不断
Eq(ResolveSever(Hit({ kind: "vehicle", rng: Mulberry32(11) })).kind, "hmg", "vehicle 按 hmg 判");
Eq(ResolveSever(Hit({ kind: "水果刀", rng: Mulberry32(11) })).reason, "noRule", "不认识的来源不断");
Eq(ResolveSever(Hit({ rng: null })).reason, "noRng", "没给随机源就不断（规则层零 Math.random）");

// force：无视骰子，而且把这一发抬成致死
{
  const result = ResolveSever(Hit({ wouldDie: false, force: true, damage: 1, rng: Mulberry32(9) }));
  Eq(result.limbs.length, 1, "force 无视骰子与 requiresKill/minDamage");
  Eq(result.limbs[0], "forearmL", "force 仍按命中体挑段");
  Eq(result.forceKill, true, "force 断肢同样抬成致死");
}

// 总闸关掉：一律返回空，且不消耗随机
{
  SetGoreEnabled(false);
  Eq(IsGoreEnabled(), false, "SetGoreEnabled(false) 之后总闸是关的");
  const rng = Mulberry32(5);
  const before = Mulberry32(5)();
  const result = ResolveSever(Hit({ kind: "blast", falloff: 1, force: true, rng }));
  Eq(result.limbs.length, 0, "ENABLED=false 时一段都不卸");
  Eq(result.reason, "disabled", "理由是 disabled");
  Eq(rng(), before, "关闭时一次随机都不消耗（重放不会错位）");
  SetGoreEnabled(null);
  Eq(IsGoreEnabled(), true, "覆盖清掉之后回到 Data_Tuning_Gore.ENABLED");
}

// ---------------------------------------------------------------------------
// 6. GoreBudget：FIFO
// ---------------------------------------------------------------------------
{
  const max = 3;
  const budget = new GoreBudget(max);
  const records = [0, 1, 2, 3, 4].map((i) => ({ i }));
  Eq(budget.Acquire(records[0]), null, "没满时不挤人");
  budget.Acquire(records[1]);
  budget.Acquire(records[2]);
  Eq(budget.size, max, "满了就是 max");
  Eq(budget.Acquire(records[3]), records[0], "第 max+1 个 Acquire 挤出最老的一条");
  Eq(budget.size, max, "挤完还是 max");
  Eq(budget.Acquire(records[4]), records[1], "再来一个挤出次老的一条");
  budget.Release(records[2]);
  Eq(budget.size, 2, "Release 之后少一条");
  Eq(budget.Acquire({ i: 5 }), null, "腾出位置后不再挤人");
  const evicted = budget.SetMax(1);
  Eq(evicted.length, 2, "调小上限一次性吐出多余的");
  Eq(budget.size, 1, "调小之后只剩一条");
  budget.Clear();
  Eq(budget.size, 0, "Clear 清空");
}

console.log(`DismembermentTest OK — ${checks} 条断言：肢体表与命中体互核、顶点分类、`
  + `index 三角守恒与跨断口丢弃、六类来源的判定（含可复现、必死与总闸）、预算 FIFO`);
