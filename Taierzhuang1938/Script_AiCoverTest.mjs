// ===========================================================================
// Script_AiCoverTest.mjs —— 战术位置系统的回归口（纯 Node，毫秒级）
//
// 覆盖 docs/Data_EnemyAi.md §4.2 / §9 里属于掩体的那一条：
//   ① 三套字段名（h/fx/fz、height/faceX/faceZ、height/nx/nz）归一到同一个形状，
//      id 按坐标哈希、重建后不变；缺法线的点有可判断的标记；
//   ② 空间散列邻域：远处的点根本不进候选（不再全表随机抽 24 个）；
//   ③ 射线验证：假 Raycast（一堵 x=10、高 1.2 m 的墙）下，蹲着挡得住、站着挡不住；
//   ④ 侧翼判定的正反例；
//   ⑤ 占用互斥与 Release；重建后占用按 id 保留；
//   ⑥ 矮 / 高掩体的探头姿势不同，侧步取"威胁看得见"的那一侧；
//   ⑦ 打分单调性：更近 / 更对朝向 / 验证真挡住 的分更高；
//   ⑧ maxValidate 真的限住射线次数（计数 host），验证结果按 validCacheS 缓存；
//   ⑨ 无朝向掩体照样选得上，只是不吃朝向分。
//
// 为什么全在纯 Node 里：这一层不认识 three、不认识场景 —— 「哪个点挡得住谁、
// 怎么藏怎么探头」是规则，画面与真射线在 Script_Ai 那一侧（由浏览器测试覆盖）。
//
// 断言里的期望值一律从 Data_Tuning_AiCover 读，不抄数（docs/Data_TextAndTuning.md §4）。
//
// 跑法：node Taierzhuang1938/Script_AiCoverTest.mjs
//   或：node Taierzhuang1938/Script_TestRunner.mjs --only=AiCoverTest
// ===========================================================================

import assert from "node:assert/strict";
import { CoverRegistry, NormalizeCover, CoverId } from "./Script_AiCover.mjs";
import { COVER, COVER_WEIGHTS } from "./Data_Tuning_AiCover.mjs";

let checks = 0;
function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

// ---------------------------------------------------------------- 假 host

/** 轴对齐盒的解析求交（slab 法）。返回 { t, normal, box } 或 null。 */
function RayBox(from, dir, box, maxDist) {
  const o = [from.x, from.y, from.z];
  const d = [dir.x, dir.y, dir.z];
  let tmin = 0, tmax = maxDist;
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < box.min[i] || o[i] > box.max[i]) return null;
      continue;
    }
    let t1 = (box.min[i] - o[i]) / d[i];
    let t2 = (box.max[i] - o[i]) / d[i];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return { t: tmin, normal: [0, 1, 0], box };
}

/**
 * 假宿主。walls 是轴对齐盒 { min:[x,y,z], max:[x,y,z] }。
 * 眼高与 AiDirector.StanceEye 同一组数（站 1.5 / 蹲 1.0 / 卧 0.5）。
 */
function MakeHost(over = {}) {
  const state = { time: over.time || 0, rays: 0, walls: over.walls || [], steers: 0 };
  const host = {
    state,
    Time: () => state.time,
    Rnd: () => { throw new Error("CoverRegistry 不许调随机数（确定性契约）"); },
    StanceEye: (stance) => (stance === 2 ? 0.5 : stance === 1 ? 1.0 : 1.5),
    SightRange: () => 120,
    GroundHeight: over.GroundHeight || (() => 0),
    Walkable: over.Walkable || (() => true),
    BlocksSight: () => false,
    Raycast: (from, dir, maxDist) => {
      state.rays += 1;
      let best = null;
      for (const box of state.walls) {
        const hit = RayBox(from, dir, box, maxDist);
        if (hit && (!best || hit.t < best.t)) best = hit;
      }
      return best;
    },
  };
  if (over.Steer) host.Steer = (...args) => { state.steers += 1; return over.Steer(...args); };
  return host;
}

const LOW_H = 1.2;                     // 矮掩体：蹲得住、站不住
const TALL_H = 2.0;                    // 高掩体：站得住

// ---------------------------------------------------------------- ① 归一与 id

{
  const a = NormalizeCover({ x: 4, z: 6, h: 1.8, fx: 3, fz: 4 });               // WallPlan 的中间产物
  const b = NormalizeCover({ x: 4, z: 6, height: 1.8, faceX: 3, faceZ: 4 });    // World.Cover 的正式形状
  const c = NormalizeCover({ x: 4, z: 6, height: 1.8, nx: 3, nz: 4 });          // 测试假件的形状
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  checks += 2;
  Check(Math.abs(a.nx - 0.6) < 1e-12 && Math.abs(a.nz - 0.8) < 1e-12, "法线归一化成单位长");
  Check(a.hasNormal === true, "给了法线就标记 hasNormal");
  Check(a.tall === (1.8 >= COVER.tallM), "tall 按 COVER.tallM 判");

  const none = NormalizeCover({ x: 4, z: 6, height: 1.0 });
  Check(none.nx === 0 && none.nz === 0 && none.hasNormal === false,
    "缺法线时 nx=nz=0 且 hasNormal=false（打分按无朝向处理）");
  const degenerate = NormalizeCover({ x: 4, z: 6, height: 1.0, faceX: 0, faceZ: 0 });
  Check(degenerate.hasNormal === false, "零长法线等同于没给法线");

  Check(NormalizeCover(null) === null && NormalizeCover({ z: 1, height: 1 }) === null,
    "坐标不是有限数就返回 null，调用方跳过");

  // id 只吃坐标：同一坐标（含量化以内的浮点噪音）重建后不变
  Check(a.id === CoverId(4, 6), "id 就是坐标哈希");
  Check(NormalizeCover({ x: 4, z: 6, height: 0.9, nx: 0, nz: -1 }).id === a.id,
    "同一坐标、不同高度/法线仍是同一个 id");
  Check(CoverId(4, 6) === CoverId(4 + COVER.hashQuantM * 0.4, 6 - COVER.hashQuantM * 0.4),
    "量化以内的浮点噪音不换 id");
  Check(CoverId(4, 6) !== CoverId(4 + COVER.hashQuantM * 4, 6), "隔着几格量化就是另一个点");
}
console.log("ok  三套字段名归一到同一形状；法线归一；无朝向有标记；id 按坐标稳定");

// ---------------------------------------------------------------- 表的过滤与重建

{
  const host = MakeHost();
  const raw = [
    { x: 0, z: 0, height: LOW_H, faceX: 0, faceZ: 1 },
    { x: 3, z: 0, height: LOW_H, faceX: 0, faceZ: 1 },
    { x: 0, z: 4, height: COVER.minUsefulM * 0.5, faceX: 0, faceZ: 1 },   // 太矮，丢掉
  ];
  const reg = new CoverRegistry(raw, host);
  Check(reg.Count() === 2, "低于 minUsefulM 的登记点不进表");

  const idsBefore = reg.covers.map((c) => c.id);
  reg.Rebuild(raw);
  assert.deepEqual(reg.covers.map((c) => c.id), idsBefore);
  checks += 1;
}
console.log("ok  太矮的点不进表；重建后 id 不变");

// ---------------------------------------------------------------- ② 空间散列

{
  const host = MakeHost();
  const reg = new CoverRegistry([
    { x: 0, z: 0, height: LOW_H, faceX: 0, faceZ: 1 },
    { x: 3, z: 0, height: LOW_H, faceX: 0, faceZ: 1 },
    { x: 5.5, z: 0, height: LOW_H, faceX: 0, faceZ: 1 },   // 同一散列格里但超出半径
    { x: 30, z: 0, height: LOW_H, faceX: 0, faceZ: 1 },    // 邻域外
  ], host);

  const near = reg.Nearby(0, 0, 5).map((c) => c.x).sort((p, q) => p - q);
  assert.deepEqual(near, [0, 3]);
  checks += 1;
  Check(reg.Nearby(0, 0, 6).length === 3, "半径放大到 6 才收得进 5.5 m 那个");
  Check(reg.Nearby(0, 0, 40).length === 4, "半径足够大时全收");

  const out = reg.Query({ x: 0, z: 0 }, [{ x: 0, y: 0, z: -40, stance: 0 }], { radiusM: 5 });
  Check(out.every((r) => r.cover.x !== 30), "远处的点不进候选");
}
console.log("ok  空间散列邻域：格外的点扫不到、格内超半径的点也筛掉");

// ---------------------------------------------------------------- ③ 射线验证

{
  // 一堵 x=10、厚 0.4、高 1.2 m 的墙；威胁在 x=20 的东边
  const host = MakeHost({ walls: [{ min: [9.8, 0, -50], max: [10.2, 1.2, 50] }] });
  const reg = new CoverRegistry([{ x: 10, z: 0, height: LOW_H, faceX: 1, faceZ: 0 }], host);
  const cover = reg.covers[0];
  const threat = { x: 20, y: 0, z: 0, stance: 0, id: "p" };

  const pose = reg.PeekPose(cover, threat);
  Check(Math.abs(pose.hidePos.x - (10 - COVER.standoffM)) < 1e-9 && Math.abs(pose.hidePos.z) < 1e-9,
    "隐蔽位在背离威胁的一侧，离登记点 standoffM");

  const v = reg.Validate(cover, threat);
  Check(v.blockedCrouched === true, "蹲在墙后：威胁的视线被 1.2 m 的墙挡住");
  Check(v.blockedStanding === false, "站起来就露头：同一堵墙挡不住站姿眼高");
  Check(host.state.rays === 2, "一次验证正好两条射线（站眼高 / 蹲眼高）");

  // 缓存：同一威胁、同一时刻再问不打射线
  reg.Validate(cover, threat);
  Check(host.state.rays === 2 && reg.validOut.cached === true, "validCacheS 内复用上次结果");
  host.state.time += COVER.validCacheS * 2;
  reg.Validate(cover, threat);
  Check(host.state.rays === 4, "过了 validCacheS 重新打射线");
  // 威胁走远：缓存作废
  host.state.rays = 0;
  reg.Validate(cover, { x: 20 + COVER.validCacheMoveM * 2, y: 0, z: 0, stance: 0 });
  Check(host.state.rays === 2, "威胁走出 validCacheMoveM 就重新验证");

  // 墙拆了（重建）之后缓存不许留
  host.state.rays = 0;
  reg.Rebuild([{ x: 10, z: 0, height: LOW_H, faceX: 1, faceZ: 0 }]);
  reg.Validate(reg.covers[0], threat);
  Check(host.state.rays === 2, "重建把验证缓存全部作废（世界几何变了）");
}
console.log("ok  假射线下 blockedCrouched=true / blockedStanding=false；缓存按时间、威胁位移与重建作废");

// ---------------------------------------------------------------- ④ 侧翼

{
  const host = MakeHost();
  const reg = new CoverRegistry([{ x: 0, z: 0, height: LOW_H, faceX: 0, faceZ: 1 }], host);
  const cover = reg.covers[0];
  const north = { x: 0, y: 0, z: -30, stance: 0 };   // Z 向南，所以 -Z 是北
  const east = { x: 30, y: 0, z: 0, stance: 0 };
  const south = { x: 0, y: 0, z: 30, stance: 0 };
  const ref = { x: 0, z: COVER.standoffM };          // 兵站在掩体南面

  Check(reg.IsFlanked(cover, north, ref) === false, "威胁在掩体正对面：没被抄");
  Check(reg.IsFlanked(cover, east, ref) === true, "威胁转到正侧面（90° > flankAngleRad）：被抄");
  Check(reg.IsFlanked(cover, south, ref) === true, "威胁绕到掩体背面（我这一侧）：被抄");

  // 不给 ref 时靠上一次选点记下的保护侧
  reg.PeekPose(cover, north);
  Check(reg.IsFlanked(cover, north) === false && reg.IsFlanked(cover, east) === true,
    "不给 ref 时用上次记下的 faceSign 判");

  // 刚好卡在阈值两边
  const angle = COVER.flankAngleRad;
  const inside = { x: Math.sin(angle * 0.8) * 30, y: 0, z: -Math.cos(angle * 0.8) * 30, stance: 0 };
  const outside = { x: Math.sin(angle * 1.2) * 30, y: 0, z: -Math.cos(angle * 1.2) * 30, stance: 0 };
  Check(reg.IsFlanked(cover, inside, ref) === false, "夹角小于 flankAngleRad 不算被抄");
  Check(reg.IsFlanked(cover, outside, ref) === true, "夹角超过 flankAngleRad 算被抄");

  const blind = new CoverRegistry([{ x: 0, z: 0, height: LOW_H }], host);
  Check(blind.IsFlanked(blind.covers[0], east) === false,
    "无朝向掩体又没给 ref：判不了就不谎报被抄");
  Check(blind.IsFlanked(blind.covers[0], east, { x: -5, z: 0 }) === false,
    "无朝向掩体给了站位就能判：威胁在掩体另一侧，没被抄");
  Check(blind.IsFlanked(blind.covers[0], east, { x: 5, z: 0 }) === true,
    "无朝向掩体给了站位就能判：威胁和我在同一侧，被抄");
}
console.log("ok  侧翼判定：正对不算、侧面与背面算；无朝向且无站位时不谎报");

// ---------------------------------------------------------------- ⑤ 占用

{
  const host = MakeHost();
  const reg = new CoverRegistry([
    { x: 0, z: 0, height: LOW_H, faceX: 0, faceZ: 1 },
    { x: 4, z: 0, height: LOW_H, faceX: 0, faceZ: 1 },
    { x: 8, z: 0, height: LOW_H, faceX: 0, faceZ: 1 },
  ], host);
  const [c0, c1, c2] = reg.covers;

  Check(reg.Claim(c0.id, "a") === true, "空点占得下");
  Check(reg.Claim(c0.id, "b") === false, "别人占着就占不下（互斥）");
  Check(reg.Claim(c0.id, "a") === true, "自己再占一次是幂等的");
  Check(reg.OccupantOf(c0.id) === "a" && reg.OccupantOf(c1.id) === null, "OccupantOf 报得对");
  Check(reg.Claim(0xdeadbeef, "a") === false, "陈旧 id 占不住一个不存在的点");

  reg.Claim(c1.id, "a");
  Check(reg.Release("a") === 2, "Release 放掉这个人持有的所有点");
  Check(reg.OccupantOf(c0.id) === null && reg.OccupantOf(c1.id) === null, "放完之后两个点都空");
  Check(reg.Claim(c0.id, "b") === true, "放掉之后别人占得下");

  // 重建：掩体还在就保留占用，掩体没了就释放
  reg.Claim(c2.id, "c");
  reg.Rebuild([
    { x: 0, z: 0, height: LOW_H, faceX: 0, faceZ: 1 },
    { x: 4, z: 0, height: LOW_H, faceX: 0, faceZ: 1 },
  ]);
  Check(reg.OccupantOf(c0.id) === "b", "重建后占用按 id 保留");
  Check(reg.OccupantOf(c2.id) === null, "被炸掉的点上的占用释放了");
  Check(reg.Release("c") === 0, "被炸掉的点不会在 bySoldier 里留渣");

  // 占用要真的影响打分
  const reg2 = new CoverRegistry([{ x: 5, z: 0, height: LOW_H, faceX: 1, faceZ: 0 }], MakeHost());
  const me = { x: 0, z: 0, id: "me" };
  const threat = [{ x: 30, y: 0, z: 0, stance: 0 }];
  const free = reg2.Score(me, reg2.covers[0], threat);
  reg2.Claim(reg2.covers[0].id, "someoneElse");
  const taken = reg2.Score(me, reg2.covers[0], threat);
  Check(Math.abs((taken - free) - COVER_WEIGHTS.occupiedOther) < 1e-9,
    "别人占着的点扣 weights.occupiedOther");
  Check(Math.abs(reg2.Score(me, reg2.covers[0], threat, { soldierId: "someoneElse" }) - free) < 1e-9,
    "自己占着的点不扣自己的分");
}
console.log("ok  占用互斥 / Release 清空 / 重建按 id 保留 / 占用真的进打分");

// ---------------------------------------------------------------- ⑥ 探头姿势

{
  const host = MakeHost();
  const reg = new CoverRegistry([
    { x: 0, z: 0, height: LOW_H, faceX: 1, faceZ: 0 },     // 矮
    { x: 40, z: 0, height: TALL_H, faceX: 1, faceZ: 0 },   // 高
  ], host);
  const [low, tall] = reg.covers;
  Check(low.tall === false && tall.tall === true, "高矮按 COVER.tallM 分类");

  const eastThreat = { x: 10, y: 0, z: 0, stance: 0 };
  const lowPose = reg.PeekPose(low, eastThreat);
  Check(lowPose.side === "over", "矮掩体从上方探头");
  Check(lowPose.firePos.x === lowPose.hidePos.x && lowPose.firePos.z === lowPose.hidePos.z,
    "矮掩体的射击位就是隐蔽位（原地起身）");
  Check(lowPose.fireStance === 1 && lowPose.hideStance === 1, "矮掩体：蹲藏、跪射");
  Check(reg.PeekPose(low, eastThreat, { suppression: COVER.suppressionProneAt + 0.1 }).hideStance === 2,
    "压制大时矮掩体的隐蔽姿态降到卧");

  // 高掩体：贴墙站，侧步探头；侧步方向取威胁横向偏在的那一边
  const northOffset = { x: 50, y: 0, z: -4, stance: 0 };   // 相对掩体偏北
  const southOffset = { x: 50, y: 0, z: 4, stance: 0 };    // 相对掩体偏南
  const poseN = reg.PeekPose(tall, northOffset);
  const poseS = reg.PeekPose(tall, southOffset);
  Check(poseN.fireStance === 0 && poseN.hideStance === 0, "高掩体：站着藏、站着打");
  Check(reg.PeekPose(tall, northOffset, { suppression: COVER.suppressionProneAt + 0.1 }).hideStance === 1,
    "压制大时高掩体的隐蔽姿态降到蹲");
  Check(poseN.side === "left" || poseN.side === "right", "高掩体给出左右侧步");
  Check(Math.abs(Math.hypot(poseN.firePos.x - poseN.hidePos.x, poseN.firePos.z - poseN.hidePos.z)
    - COVER.sideStepM) < 1e-9, "侧步距离就是 sideStepM");
  Check(poseN.firePos.z < poseN.hidePos.z && poseS.firePos.z > poseS.hidePos.z,
    "侧步方向跟着威胁的横向偏移走（威胁看得见的那一侧）");
  Check(poseN.side !== poseS.side, "两侧的 side 标签相反");
  // 正对掩体（横向偏移为 0）时要确定性：同一个点反复问答案不变
  const a = reg.PeekPose(tall, { x: 50, y: 0, z: 0, stance: 0 });
  const b = reg.PeekPose(tall, { x: 50, y: 0, z: 0, stance: 0 });
  Check(a.side === b.side && a.firePos.z === b.firePos.z, "威胁正对时按 id 定侧，不左右横跳");

  // 隐蔽位永远在背离威胁的一侧，与生产方给的法线正负无关
  const flipped = new CoverRegistry([{ x: 0, z: 0, height: TALL_H, faceX: -1, faceZ: 0 }], host);
  const flippedPose = flipped.PeekPose(flipped.covers[0], eastThreat);
  Check(flippedPose.hidePos.x < 0, "法线写反了也照样躲在背对威胁的那一面");
}
console.log("ok  矮掩体蹲藏跪射 / 高掩体贴墙侧步；侧步取威胁可见侧；法线正负不影响保护侧");

// ---------------------------------------------------------------- ⑦ 打分单调性

{
  const host = MakeHost();
  const me = { x: 0, z: 0, id: "me" };
  const threat = [{ x: 30, y: 0, z: 0, stance: 0, id: "p" }];
  const reg = new CoverRegistry([], host);

  // 更近的分更高
  const near = NormalizeCover({ x: 5, z: 0, height: LOW_H, faceX: 1, faceZ: 0 });
  const far = NormalizeCover({ x: 15, z: 0, height: LOW_H, faceX: 1, faceZ: 0 });
  const dNear = reg.Score(me, near, threat), dFar = reg.Score(me, far, threat);
  Check(dNear > dFar, "同样的墙，近的分更高");
  Check(Math.abs((dNear - dFar) - (-COVER_WEIGHTS.distanceM * 10)) < 1e-9,
    "差值正好是十米的 weights.distanceM");

  // 更正对威胁的分更高
  const aligned = NormalizeCover({ x: 10, z: 0, height: LOW_H, faceX: 1, faceZ: 0 });
  const across = NormalizeCover({ x: 10, z: 0, height: LOW_H, faceX: 0, faceZ: 1 });
  const blind = NormalizeCover({ x: 10, z: 0, height: LOW_H });
  const sAligned = reg.Score(me, aligned, threat);
  const sAcross = reg.Score(me, across, threat);
  const sBlind = reg.Score(me, blind, threat);
  Check(sAligned > sAcross, "墙面正对威胁的分更高");
  Check(Math.abs((sAligned - sBlind) - (COVER_WEIGHTS.alignment - COVER_WEIGHTS.noNormal)) < 1e-9,
    "满对齐与无朝向的差正好是 weights.alignment - weights.noNormal");
  Check(Math.abs(sAcross - sBlind - (0 - COVER_WEIGHTS.noNormal)) < 1e-9,
    "与威胁方向垂直的墙面拿不到对齐分，与无朝向同价");

  // 更高的墙分更高，但封顶
  const low = NormalizeCover({ x: 10, z: 0, height: 0.8, faceX: 1, faceZ: 0 });
  const high = NormalizeCover({ x: 10, z: 0, height: COVER.heightCapM, faceX: 1, faceZ: 0 });
  const over = NormalizeCover({ x: 10, z: 0, height: COVER.heightCapM + 3, faceX: 1, faceZ: 0 });
  Check(reg.Score(me, high, threat) > reg.Score(me, low, threat), "更高的墙分更高");
  Check(Math.abs(reg.Score(me, over, threat) - reg.Score(me, high, threat)) < 1e-9,
    "高度打分在 heightCapM 封顶");

  // 隐蔽位走不到 / 路上有墙
  const blocked = new CoverRegistry([], MakeHost({ Walkable: (x) => x < 9.0 }));
  Check(blocked.Score(me, aligned, threat) < reg.Score(me, aligned, threat),
    "隐蔽位不可走要扣分");

  // 友军挤在同一个点
  const hidePos = reg.PeekPose(aligned, threat[0]).hidePos;
  const crowded = reg.Score(me, aligned, threat,
    { allies: [{ x: hidePos.x, z: hidePos.z, id: "mate" }] });
  Check(Math.abs((crowded - sAligned) - COVER_WEIGHTS.allySpacing) < 1e-9,
    "友军站在隐蔽位上扣满 weights.allySpacing");
  Check(Math.abs(reg.Score(me, aligned, threat,
    { allies: [{ x: hidePos.x + COVER.minAllySpacingM * 2, z: hidePos.z }] }) - sAligned) < 1e-9,
    "隔开 minAllySpacingM 之后不扣");

  // 威胁站得比掩体顶高（俯射）
  const highThreat = [{ x: 30, y: 6, z: 0, stance: 0 }];
  Check(reg.Score(me, aligned, highThreat) < reg.Score(me, aligned, threat),
    "威胁在高处俯射时矮墙掉分");

  // 跃进：朝目标方向推进的点加分
  const forwardOpts = { towardX: 30, towardZ: 0 };
  Check(reg.Score(me, far, threat, forwardOpts) > reg.Score(me, near, threat, forwardOpts),
    "带 toward 时更靠前的点反超（跃进）");
}
console.log("ok  打分单调：更近 / 更正对 / 更高（封顶）/ 不可走扣分 / 友军挤扣分 / 俯射掉分 / toward 反超");

// ---------------------------------------------------------------- ⑦b 验证过的分更高

{
  // 玩家在正北 30 m；两堵一模一样的矮墙，一左一右，只有左边那堵前面有实体挡着
  const host = MakeHost({ walls: [{ min: [-9, 0, -5.2], max: [-3, 1.2, -4.8] }] });
  const reg = new CoverRegistry([
    { x: -6, z: -5, height: LOW_H, faceX: 0, faceZ: 1 },
    { x: 6, z: -5, height: LOW_H, faceX: 0, faceZ: 1 },
  ], host);
  const out = reg.Query({ x: 0, z: 0, id: "me" }, [{ x: 0, y: 0, z: -30, stance: 0, id: "p" }]);

  Check(out.length === 2, "两个候选都留下");
  Check(out[0].validated && out[1].validated, "两个都在 maxValidate 之内，都验证过");
  Check(out[0].cover.x === -6 && out[0].blockedCrouched === true, "真挡得住的那个排第一");
  Check(out[1].blockedCrouched === false && out[1].blockedStanding === false, "另一个是空地上的点");
  Check(Math.abs((out[0].score - out[0].base) - COVER_WEIGHTS.validatedCrouched) < 1e-9,
    "挡住蹲姿加 weights.validatedCrouched");
  Check(Math.abs((out[1].score - out[1].base) - COVER_WEIGHTS.validatedFail) < 1e-9,
    "验证过却挡不住扣 weights.validatedFail");
  Check(out[0].score > out[1].score, "验证真挡住的分更高");
  Check(Math.abs(out[0].base - out[1].base) < 1e-9, "两个点验证之前分数一样（对照组成立）");
}
console.log("ok  射线验证通过的候选排到前面；验证失败的倒扣");

// ---------------------------------------------------------------- ⑧ 限额与缓存

{
  const raw = [];
  for (let x = -6; x <= 6; x += 2) raw.push({ x, z: -5, height: LOW_H, faceX: 0, faceZ: 1 });
  const threat = [{ x: 0, y: 0, z: -30, stance: 0, id: "p" }];

  const host = MakeHost();
  const reg = new CoverRegistry(raw, host);
  Check(reg.Count() === 7, "七个候选点");

  const out = reg.Query({ x: 0, z: 0, id: "me" }, threat, { maxCandidates: 5, maxValidate: 2 });
  Check(out.length === 5, "候选数被 maxCandidates 限住");
  for (let i = 1; i < out.length; i += 1) {
    Check(out[i - 1].score >= out[i].score, "结果按 score 降序");
  }
  Check(host.state.rays === 4, "maxValidate=2 → 最多 2×2 条射线");
  Check(out.filter((r) => r.validated).length === 2, "只有前 maxValidate 个带验证标记");

  // 再问一次：还在 validCacheS 内，一条射线都不该再打
  reg.Query({ x: 0, z: 0, id: "me" }, threat, { maxCandidates: 5, maxValidate: 2 });
  Check(host.state.rays === 4, "缓存内重复查询不再打射线");

  const zero = MakeHost();
  new CoverRegistry(raw, zero).Query({ x: 0, z: 0 }, threat, { maxValidate: 0 });
  Check(zero.state.rays === 0, "maxValidate=0 完全不打射线");

  const noThreat = MakeHost();
  const out2 = new CoverRegistry(raw, noThreat).Query({ x: 0, z: 0 }, null, {});
  Check(noThreat.state.rays === 0 && out2.length === 7, "没有威胁时不验证，但仍然给得出候选");

  // Steer 默认不调（每个候选一张 dijkstra 场会把导航缓存冲垮）
  const steerHost = MakeHost({ Steer: () => true });
  const steerReg = new CoverRegistry(raw, steerHost);
  steerReg.Query({ x: 0, z: 0 }, threat, {});
  Check(steerHost.state.steers === 0, "默认不调 host.Steer");
  steerReg.Query({ x: 0, z: 0 }, threat, { useSteer: true, maxValidate: 2 });
  Check(steerHost.state.steers === 2, "显式 useSteer 时只对验证过的候选各调一次");
}
console.log("ok  maxCandidates / maxValidate 限额生效；结果降序；缓存与 Steer 的默认关闭");

// ---------------------------------------------------------------- ⑨ 无朝向掩体照样能用

{
  const host = MakeHost();
  const reg = new CoverRegistry([{ x: 10, z: 0, height: LOW_H }], host);
  const out = reg.Query({ x: 0, z: 0, id: "me" }, [{ x: 30, y: 0, z: 0, stance: 0 }]);
  Check(out.length === 1, "无朝向掩体选得上");
  Check(out[0].hidePos.x < out[0].cover.x, "无朝向时隐蔽位取「正背着威胁」的一侧");
  Check(Math.abs(out[0].hidePos.x - (10 - COVER.standoffM)) < 1e-9, "退让距离仍是 standoffM");
}
console.log("ok  无朝向掩体：选得上、不吃朝向分、隐蔽位正背着威胁");

// ---------------------------------------------------------------- 硬条件与复用契约

{
  const host = MakeHost();
  const reg = new CoverRegistry([
    { x: 5, z: 0, height: LOW_H, faceX: 1, faceZ: 0 },     // 在我与威胁之间
    { x: -12, z: 0, height: LOW_H, faceX: 1, faceZ: 0 },   // 在我背后，离威胁更远
  ], host);
  const out = reg.Query({ x: 0, z: 0 }, [{ x: 30, y: 0, z: 0, stance: 0 }], { radiusM: 30 });
  Check(out.length === 1 && out[0].cover.x === 5, "背对威胁那一侧的点被硬条件筛掉");
  const retreat = reg.Query({ x: 0, z: 0 }, [{ x: 30, y: 0, z: 0, stance: 0 }], { radiusM: 30, allowRetreat: true });
  Check(retreat.some(c=>c.cover.x===-12), "避险允许后退到掩体，保护仍由射线验证");

  // 返回值复用：下一次 Query 会覆盖上一次的结果（头注写明的契约）
  const first = reg.Query({ x: 0, z: 0 }, [{ x: 30, y: 0, z: 0, stance: 0 }], { radiusM: 30 });
  const second = reg.Query({ x: 0, z: 0 }, [{ x: 30, y: 0, z: 0, stance: 0 }], { radiusM: 30 });
  Check(first === second, "Query 返回的是同一个复用数组");

  const stats = reg.Stats();
  Check(stats.covers === 2 && stats.rays > 0 && stats.revision >= 1, "取证口给得出表况");
}
console.log("ok  「掩体在我与威胁之间」硬条件；返回值复用契约；取证口");

console.log(`\nAiCoverTest 通过：${checks} 条断言`);
