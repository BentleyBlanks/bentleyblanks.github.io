// ===========================================================================
// Script_EmplacementTest.mjs —— 架设机枪位的回归口（纯 Node，毫秒级）
//
// 覆盖 docs/Data_MissionRemake.md §6 第五关那挺招牌机枪的全部规则：
//   ① 摆点与档案表（射界、热量、弹药、两种枪的分档）；
//   ② 接管 / 离位：只有玩家按得动，脚本上不去；离位之后能再上；
//   ③ 射界限位：限位内自由瞄准，顶到边就停，绕 ±π 也不许翻面；
//   ④ 过热曲线：一直压着一条弹板就顶红线；短点射永远不过热（台词「短点射。莫一直压。」的判据）；
//   ⑤ 两种卡壳：概率性小卡（排障恢复）与脚本触发的必然失效（拉枪机数次 → 报废，只能弃枪）；
//   ⑥ NPC 占位互斥：与 Script_Ai 的 `soldier.emplacementId` 同一道闸，射手阵亡战位空出；
//   ⑦ 补弹：走 Script_Interact 的注册点，废枪不补。
//
// 为什么全在纯 Node 里：这一层不认识 three、不认识场景 —— 「什么时候打得出去、
// 指到哪儿、卡不卡」是规则，弹道与画面在装配层的 Fire 钩子那一侧
// （由 GunFeelTest / PlayTest 覆盖）。
//
// 跑法：node Taierzhuang1938/Script_TestRunner.mjs --only=EmplacementTest
// ===========================================================================

import assert from "node:assert/strict";
import {
  EmplacementSystem, EMPLACEMENT_KINDS, ClampYawToArc,
  EmplacementInteraction, AmmoResupplyInteraction,
} from "./Script_Emplacement.mjs";
import { InteractSystem } from "./Script_Interact.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";

let checks = 0;
function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

const D2R = Math.PI / 180;

/** 假玩家：这一层只读这几样。yaw=0 时正面朝 -Z（全项目朝向契约）。 */
function MakePlayer(over = {}) {
  return {
    Alive: over.Alive ?? true,
    yaw: over.yaw ?? 0,
    pitch: over.pitch ?? 0,
    aimYaw: 0, aimPitch: 0,
    position: { x: over.x ?? 0, y: over.y ?? 0, z: over.z ?? 0 },
    carrySpeedScale: 1,
  };
}

/** 假战场兵：SyncNpc 只读 alive / emplacementId / id。 */
function MakeSoldier(id, emplacementId) {
  return { id, alive: true, emplacementId };
}

/** 一台接好线的系统 + 一挺摆在原点朝 -Z 的九二式。 */
function MakeRig(spec = {}, hostOver = {}) {
  const log = { played: [], hints: [], said: [], shots: [], aims: 0, seats: [] };
  const sys = new EmplacementSystem({
    Time: () => 0,
    Play: (name, opts) => log.played.push({ name, opts }),
    Hint: (text) => log.hints.push(text),
    Say: (who, text) => log.said.push(text),
    Fire: (shot) => log.shots.push(shot),
    Aim: () => { log.aims += 1; },
    Seat: (info) => log.seats.push(info),
    ...hostOver,
  }, { seed: 4242 });
  const id = sys.CreateEmplacement({
    id: "nest", tag: "CH5_Chengqiang",
    position: { x: 0, y: 0, z: 0 }, baseYaw: 0, ...spec,
  });
  return { sys, id, log };
}

/** 推 seconds 秒；每帧顺手把返回的弹收进 out。 */
function Step(sys, player, seconds, dt = 1 / 60) {
  let fired = 0;
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    const shots = sys.Update(dt, player);
    if (shots) fired += shots.length;
  }
  return fired;
}

// ===========================================================================
// 一、档案表
// ===========================================================================

for (const [id, kind] of Object.entries(EMPLACEMENT_KINDS)) {
  Check(kind.id === id, `${id} 的 id 字段与键一致`);
  Check(!!WEAPONS[kind.weaponId], `${id} 指向一件真的存在的武器`);
  Check(kind.arcYawDeg > 0 && kind.arcYawDeg < 180, `${id} 是**固定**武器：射界必须有限`);
  Check(kind.arcUpDeg > 0 && kind.arcDownDeg > 0, `${id} 俯仰两侧都有限位`);
  Check(kind.heatPerShot > 0 && kind.coolPerS > 0, `${id} 升温与散热都要有`);
  Check(kind.resumeHeat > 0 && kind.resumeHeat < 1, `${id} 强制冷却之后不是「停两秒就能接着压」`);
  Check(kind.warnHeat > kind.resumeHeat && kind.warnHeat < 1, `${id} 警戒线在放行线与红线之间`);
  Check(kind.jamHeatFloor > 0.5, `${id} 冷枪不卡壳 —— 短点射的玩家不该被随机数罚`);
  Check(kind.beltRounds > 0 && kind.belts > 0 && kind.maxBelts >= kind.belts, `${id} 弹药档齐全`);
  Check(kind.spreadDeg < (WEAPONS[kind.weaponId].spreadHipDeg ?? 3),
    `${id} 架起来比端着稳`);

  // 这两条是**策划案的工程落点**，不是手感偏好：
  //   一直压着 → 大约一条弹板就顶红线；打一梭歇一梭 → 永远不过热。
  const interval = WEAPONS[kind.weaponId].fireIntervalS;
  const netPerS = kind.heatPerShot / interval - kind.coolPerS;
  Check(netPerS > 0, `${id} 一直压着必须会过热（否则「莫一直压」是空话）`);
  const duty = kind.coolPerS / (kind.heatPerShot / interval);
  Check(duty > 0.35 && duty < 0.75, `${id} 可持续占空比落在「打一梭歇一梭」那个区间`);
}
Check(EMPLACEMENT_KINDS.Type92Hmg.arcYawDeg > EMPLACEMENT_KINDS.Zb26Nest.arcYawDeg,
  "三脚架的回旋比两脚架宽");
Check(EMPLACEMENT_KINDS.Zb26Nest.arcUpDeg > EMPLACEMENT_KINDS.Type92Hmg.arcUpDeg,
  "两脚架架在墙垛上，抬得起来打屋顶");

console.log(`ok  档案表：${Object.keys(EMPLACEMENT_KINDS).length} 种架设武器，射界/热量/弹药分档正确`);

// ===========================================================================
// 二、接管与离位
// ===========================================================================

{
  const { sys, id, log } = MakeRig();
  const player = MakePlayer();

  Check(sys.Mounted === false && sys.View() === null, "开局没上枪位");
  Check(sys.CanOccupy(id).ok === true, "空着的枪位可以接管");
  Check(sys.Occupy(id, player) === true, "玩家接管");
  Check(sys.Mounted === true && sys.MountedId === id, "上了枪位");
  Check(sys.Blocking === true, "上着枪位时常规武器/冲刺一并停用（装配层读 Blocking）");
  Check(log.played.some((p) => p.name === EMPLACEMENT_KINDS.Type92Hmg.sfxMount), "接管有声音");
  // 「视角接到枪上」：装配层收到射手位与射手姿态（挪人这件事它才做得了）。
  Check(log.seats.length === 1, "接管时通知装配层把人挪到射手位");
  Check(log.seats[0].seat.z > 0 && log.seats[0].stance === EMPLACEMENT_KINDS.Type92Hmg.stance,
    "给的是射手位坐标 + 档案表里那个姿态");
  Check(sys.CanOccupy(id).ok === false, "已经在枪上了就不能再接管一次");

  Check(sys.Vacate("player") === true, "玩家离位");
  Check(sys.Mounted === false, "下了枪位");
  Check(sys.lastVacate.abandoned === false, "枪没废，这不是弃枪");
  // 空窗：没有它，一次 F 会在同一帧下枪又上枪。
  Check(sys.CanOccupy(id).reason === "cooldown", "刚下来的那一瞬不许立刻再上");
  Step(sys, player, 0.6);
  Check(sys.CanOccupy(id).ok === true, "空窗过了可以重占（§6 阶段⑨『重占机枪位』）");
  Check(sys.Occupy(id, player) === true, "重占成功");

  // 人倒了就自然离位；这不记「弃枪」，那是另一件事。
  player.Alive = false;
  Step(sys, player, 0.05);
  Check(sys.Mounted === false && sys.lastVacate.reason === "playerDown", "玩家倒下自动离位");
}

{
  // **不夺控制权**：脚本没有「替玩家上枪位」的口子。
  const api = Object.getOwnPropertyNames(EmplacementSystem.prototype);
  Check(api.includes("ForceJam"), "脚本能把枪弄坏");
  Check(!api.some((name) => /^Force(Occupy|Mount|Take)/.test(name)),
    "脚本**没有**强行上枪位的口子（docs/Data_MissionDesign.md 的实机演出规矩）");
  Check(!api.some((name) => /^ForceVacate/.test(name)),
    "脚本也没有强行把玩家从枪上拽下来的口子");
}

console.log("ok  接管/离位：上得去、下得来、能重占、玩家倒下自动松手、脚本上不去");

// ===========================================================================
// 三、射界限位
// ===========================================================================

{
  const arcDeg = 30;
  const { sys, id } = MakeRig({ arcYawDeg: arcDeg, arcUpDeg: 12, arcDownDeg: 10 });
  const player = MakePlayer();
  sys.Occupy(id, player);

  // 限位以内：视线原样通过（自由瞄准）。
  player.yaw = 10 * D2R; player.pitch = 5 * D2R;
  sys.Update(1 / 60, player);
  Check(Math.abs(player.yaw - 10 * D2R) < 1e-6, "限位内的转向原样通过");
  Check(Math.abs(sys.View().yaw - 10 * D2R) < 1e-6, "枪跟着转到同一个角度");
  Check(sys.View().atYawLimit === false, "没顶到边");

  // 限位以外：夹住，而且**把夹住的结果写回玩家** —— 画面要跟着停，不能只让弹道停。
  player.yaw = 80 * D2R;
  sys.Update(1 / 60, player);
  Check(Math.abs(player.yaw - arcDeg * D2R) < 1e-6, "越界的转向被夹回射界边");
  Check(sys.View().atYawLimit === true, "HUD 读得到「顶到射界边了」");
  player.pitch = 1.2;
  sys.Update(1 / 60, player);
  Check(Math.abs(player.pitch - 12 * D2R) < 1e-6, "抬头被上限位夹住");
  player.pitch = -1.2;
  sys.Update(1 / 60, player);
  Check(Math.abs(player.pitch + 10 * D2R) < 1e-6, "低头被下限位夹住");

  // 自由瞄准那一段在架上没有意义（枪固定在座上），必须清掉，
  // 不清的话它会把视线一点点推出射界。
  player.aimYaw = 0.3; player.aimPitch = -0.2;
  sys.Update(1 / 60, player);
  Check(player.aimYaw === 0 && player.aimPitch === 0, "架上不再有自由瞄准偏移");
}

{
  // 绕环：baseYaw 落在 ±π 附近时，射界不许翻到背后去。
  const base = Math.PI - 0.05;
  const span = 30 * D2R;
  Check(Math.abs(ClampYawToArc(base + 0.02, base, span) - (base + 0.02)) < 1e-9,
    "射界内的角度不动");
  const over = ClampYawToArc(-Math.PI + 0.4, base, span);   // 绕过 ±π 的另一侧
  Check(Math.abs(((over - base + Math.PI) % (Math.PI * 2)) - Math.PI) <= span + 1e-9,
    "绕过 ±π 之后仍然夹在射界里，不翻面");
}

console.log("ok  射界：限位内自由瞄准、顶到边就停、结果写回玩家、绕 ±π 不翻面");

// ===========================================================================
// 四、过热曲线（「短点射。莫一直压。」的判据）
// ===========================================================================

{
  const kind = EMPLACEMENT_KINDS.Type92Hmg;
  const { sys, id } = MakeRig({ belts: kind.maxBelts });
  const player = MakePlayer();
  sys.Occupy(id, player);
  sys.SetFire(true);

  let t = 0, fired = 0, overheatAt = null;
  while (t < 30 && overheatAt === null) {
    const shots = sys.Update(1 / 60, player);
    if (shots) fired += shots.length;
    t += 1 / 60;
    const view = sys.View();
    if (view.overheated) overheatAt = { t, fired };
    if (view.block === "empty") sys.Reload();
    if (view.jam) { sys.PullBolt(); sys.BeginClear(); }
  }
  Check(overheatAt !== null, "一直压着一定会过热");
  // 一条保弹板压到底差不多就顶红线：多了就没有代价，少了连一梭都打不完。
  Check(overheatAt.fired >= kind.beltRounds * 0.6 && overheatAt.fired <= kind.beltRounds * 1.4,
    `一直压着约一条弹板顶红线（实测 ${overheatAt.fired} 发 / ${kind.beltRounds} 发一板）`);

  // 过热之后：打不出去，而且不是"停两秒就能接着压"。
  const before = sys.State().stats.shots;
  Step(sys, player, 1.0);
  Check(sys.State().stats.shots === before, "过热期间一发都打不出去");
  Check(sys.View().block === "overheat" && sys.View().heatState === "overheat",
    "HUD 读得到「过热」这一档");
  // 退到 resumeHeat 才放行；这一段有多长由 overheatCoolPerS 决定。
  // 量之前先松开左键：不松的话放行那一帧枪就会立刻打出一发，把热量又顶回门槛之上，
  // 于是"放行时的热量"永远量不准（这不是 bug，是这条断言要的是**门槛**）。
  sys.SetFire(false);
  let cooled = 0;
  while (cooled < 20 && sys.View().overheated) { Step(sys, player, 0.1); cooled += 0.1; }
  Check(!sys.View().overheated, "冷下来之后放行");
  Check(cooled > 1.0, "强制冷却不是眨眼就过去的");
  Check(sys.View().heat <= kind.resumeHeat + 1e-6, "放行时热量确实退到了门槛以下");
}

{
  // 短点射：打一梭歇一梭，九十秒都不过热 —— 这就是那三句台词教的打法。
  const { sys, id } = MakeRig({ belts: EMPLACEMENT_KINDS.Type92Hmg.maxBelts });
  const player = MakePlayer();
  sys.Occupy(id, player);
  let t = 0, peak = 0, overheated = false;
  while (t < 90) {
    sys.SetFire(Math.floor(t / 1.2) % 2 === 0);
    if (sys.View().block === "empty") sys.Reload();
    sys.Update(1 / 60, player);
    t += 1 / 60;
    peak = Math.max(peak, sys.View().heat);
    if (sys.View().overheated) overheated = true;
  }
  Check(overheated === false, "短点射九十秒不过热");
  Check(peak < EMPLACEMENT_KINDS.Type92Hmg.warnHeat,
    `短点射连警戒线都到不了（峰值 ${peak.toFixed(2)}）`);
  Check(sys.State().stats.shots > 60, "而且这九十秒里真的一直在打（不是没开火所以不热）");
}

console.log("ok  过热：一直压约一条弹板顶红线、强制冷却到门槛才放行、短点射永不过热");

// ===========================================================================
// 五、两种卡壳
// ===========================================================================

{
  // 概率性小卡：只在热枪上出现，排障能恢复。
  // **把骰子按死**（rnd 恒返 0）再看判据，不是打一万发碰运气 —— 测试不许押注 RNG。
  const { sys, id, log } = MakeRig({ belts: 8 });
  const gun = sys.Emplacement(id);
  const player = MakePlayer();
  sys.rnd = () => 0;
  sys.Occupy(id, player);

  // 冷枪：骰子按死也不卡。这一条是「打短点射的玩家不该被随机数罚」的判据。
  gun.heat = gun.kind.jamHeatFloor * 0.5;
  sys.SetFire(true);
  sys.Update(1 / 60, player);
  Check(sys.View().jam === null, "冷枪一次都不卡（骰子已经按死了）");

  // 热枪：同一颗骰子就卡。
  gun.heat = (gun.kind.jamHeatFloor + 1) * 0.5;
  gun.fireCooldown = 0;
  sys.Update(1 / 60, player);
  Check(sys.View().jam !== null && sys.View().jam.kind === "minor", "热枪会卡一次小卡");
  Check(sys.View().block === "jam", "卡着的时候打不出去");
  const shotsAtJam = sys.State().stats.shots;
  Step(sys, player, 1.0);
  Check(sys.State().stats.shots === shotsAtJam, "不排障就一直打不出去");

  // 排障：拉一下枪机起手，按住把进度走满。
  Check(sys.PullBolt() === true, "拉枪机");
  Check(sys.BeginClear() === true, "开始排障");
  const heatBefore = sys.View().heat;
  Step(sys, player, gun.kind.clearS + 0.2);
  Check(sys.View().jam === null, "排障之后恢复");
  Check(sys.View().heat < heatBefore, "开盖排壳顺手散了一截热");
  Check(sys.State().stats.cleared === 1, "记了一次排障");
  Check(log.hints.some((h) => h.includes("排")), "提示告诉玩家怎么排");

  // 松手不清零：手抖一下不该从头再来（与 Script_Interact 的 hold 型同一条口径）。
  gun.jam = { kind: "minor", pulls: 0, t: 0, need: 1 };
  sys.BeginClear();
  Step(sys, player, gun.kind.clearS * 0.5);
  const half = sys.View().jam.t;
  sys.EndClear();
  Step(sys, player, 0.5);
  Check(sys.View().jam !== null && Math.abs(sys.View().jam.t - half) < 1e-6,
    "松手之后进度停住，但不清零");
}

{
  // **脚本触发的必然失效**（ENGINE_REQUEST gunJam）：排不掉，只能弃枪。
  const { sys, id, log } = MakeRig({ belts: 6 });
  const player = MakePlayer();
  let deadInfo = null;
  sys.Emplacement(id).OnDead = (info) => { deadInfo = info; };
  sys.Occupy(id, player);
  sys.SetFire(true);
  Step(sys, player, 1.0);
  Check(sys.State().stats.shots > 0, "先能打");

  Check(sys.ForceJam(id) === true, "脚本把这挺枪弄坏（§6 阶段⑩②）");
  const kind = EMPLACEMENT_KINDS.Type92Hmg;
  Check(sys.View().jam.kind === "fatal", "这是必然失效，不是小卡");
  Check(sys.View().rounds === 0 && sys.View().belts === 0, "默认口径是「卡壳/弹尽」两件一起");
  Check(sys.BeginClear() === false, "必然失效按住排不掉");
  Step(sys, player, 5.0);
  Check(sys.View().jam !== null, "按住五秒也排不掉");
  Check(sys.Reload() === false, "也换不了弹板");

  // 拉枪机数次之后判废。**判废不自动离位** —— 走不走是玩家的事。
  for (let i = 0; i < kind.deadPulls - 1; i += 1) {
    Check(sys.PullBolt() === true, `第 ${i + 1} 次拉枪机`);
    Check(sys.View().dead === false, `拉了 ${i + 1} 次还没判废`);
  }
  Check(sys.PullBolt() === true, "最后一次拉枪机");
  Check(sys.View().dead === true, "判定这挺枪彻底废了");
  Check(deadInfo && deadInfo.id === id, "OnDead 回调报到集成批（接『改步枪＋手榴弹』那一拍）");
  Check(sys.Mounted === true, "**没有**替玩家离位（不夺控制权）");
  Check(sys.View().exit === "弃枪", "HUD 上那两个字从「离位」变成「弃枪」");
  Check(log.hints.some((h) => h.includes("废")), "提示明说这挺枪废了");

  const shotsBefore = sys.State().stats.shots;
  sys.SetFire(true);
  Step(sys, player, 2.0);
  Check(sys.State().stats.shots === shotsBefore, "废枪一发都打不出去");
  Check(sys.Resupply(id, 3) === false, "废枪不补弹（补了也打不响）");

  Check(sys.Vacate("player") === true, "玩家自己按 F 弃枪");
  Check(sys.lastVacate.abandoned === true, "这一次记的是弃枪");
  Step(sys, player, 1.0);
  Check(sys.CanOccupy(id).ok === false && sys.CanOccupy(id).reason === "dead",
    "废了的枪不能再上");
}

{
  // ForceJam 的三档口径：只卡壳 / 只弹尽 / 两件一起。
  const { sys, id } = MakeRig({ belts: 4 });
  Check(sys.ForceJam(id, { mode: "ammoOut" }) === true, "只打光");
  Check(sys.Emplacement(id).jam === null, "只打光不卡壳");
  Check(sys.Emplacement(id).belts === 0, "身边的弹板也没了");

  const rig2 = MakeRig({ belts: 4 });
  const beltsBefore = rig2.sys.Emplacement(rig2.id).belts;
  Check(rig2.sys.ForceJam(rig2.id, { mode: "jam", pulls: 1 }) === true, "只卡壳");
  Check(rig2.sys.Emplacement(rig2.id).belts === beltsBefore, "只卡壳不动弹药");
  Check(rig2.sys.Emplacement(rig2.id).jam.need === 1, "拉几下判废可以由脚本指定");
}

console.log("ok  卡壳两种：小卡可排（松手不清零）、必然失效排不掉且判废不夺控制权");

// ===========================================================================
// 六、NPC 占位互斥（与 Script_Ai 的战位闸同一份事实）
// ===========================================================================

{
  const { sys, id } = MakeRig({ aiKey: "nra_Hmg_CH5_0" });
  const player = MakePlayer();
  const gunner = MakeSoldier(7, "nra_Hmg_CH5_0");
  const rifleman = MakeSoldier(8, null);

  // 认领走的是 `soldier.emplacementId`，不是这里另建一张占位表。
  Check(sys.SyncNpc([rifleman]) === 0, "没有人占这个战位");
  Check(sys.SyncNpc([rifleman, gunner]) === 1, "按 emplacementId 认领射手");
  Check(sys.State().guns[0].occupant === "npc", "战位上是 NPC");
  const busy = sys.CanOccupy(id, player);
  Check(busy.ok === false && busy.reason === "manned", "有人在打，玩家不可接管");
  Check(sys.Occupy(id, player) === false, "硬上也上不去");
  Check(sys.State().stats.refused === 1, "记一次被拒");

  // 射手阵亡 → 战位空出来（这正是「重新架枪」该有的样子）。
  gunner.alive = false;
  Check(sys.SyncNpc([rifleman, gunner]) === 0, "射手阵亡，战位释放");
  Check(sys.CanOccupy(id, player).ok === true, "空出来的战位玩家可以接管");
  Check(sys.Occupy(id, player) === true, "玩家接过来（§6 阶段⑥『射手还趴在枪身上』）");

  // 玩家在打的时候不许再把 NPC 塞进来 —— 一个战位只填一个人。
  const newcomer = MakeSoldier(9, "nra_Hmg_CH5_0");
  Check(sys.NpcOccupy(id, newcomer) === false, "玩家在打，NPC 塞不进来");
  Check(sys.SyncNpc([newcomer]) === 0, "SyncNpc 也不会抢玩家的枪");
}

{
  // 日方的火力点玩家不接管（那是敌人的枪）。
  const { sys, id } = MakeRig({ side: "ija" });
  const check = sys.CanOccupy(id, MakePlayer());
  Check(check.ok === false && check.reason === "enemy", "日军的机枪位玩家接不了");
}

console.log("ok  NPC 占位：按 emplacementId 认领、占着时玩家不可接管、阵亡即空出");

// ===========================================================================
// 七、弹药与补弹
// ===========================================================================

{
  const kind = EMPLACEMENT_KINDS.Type92Hmg;
  const { sys, id } = MakeRig({ belts: 2 });
  const player = MakePlayer();
  sys.Occupy(id, player);
  Check(sys.View().rounds === kind.beltRounds, "开局枪上压着一整板");
  Check(sys.View().belts === 1, "身边还有一板（开局那一板已经上枪了）");

  // 打空这一板
  sys.SetFire(true);
  let guard = 0;
  while (sys.View().rounds > 0 && guard < 4000) { sys.Update(1 / 60, player); guard += 1; }
  Check(sys.View().rounds === 0, "打空");
  Check(sys.View().block === "empty", "还有板，提示换板");
  sys.SetFire(false);              // 松开左键再换板，否则装完立刻又打掉几发
  Check(sys.Reload() === true, "换板");
  Check(sys.View().reloading === true, "换板要时间");
  Check(sys.Reload() === false, "换板中不许再按一次");
  Step(sys, player, (WEAPONS.Type92Hmg.reloadTimeS || 4) + 0.2);
  Check(sys.View().rounds === kind.beltRounds && sys.View().belts === 0, "换完了，板也用光了");

  // 补弹：走注册点（预制在 Script_Emplacement 末尾）
  Check(sys.Resupply(id, 2) === true, "队友送来两板");
  Check(sys.View().belts === 2, "弹药上账");
  Check(sys.Resupply(id, 99) === true, "再送就顶到上限");
  Check(sys.View().belts === kind.maxBelts, "封顶");
  Check(sys.Resupply(id, 1) === false, "满了就不再收（交互点会整条不出现）");

  // 弹尽：没板了也打不出去，OnEmpty 报给集成批
  let emptyHits = 0;
  sys.Emplacement(id).OnEmpty = () => { emptyHits += 1; };
  sys.Emplacement(id).rounds = 0;
  sys.Emplacement(id).belts = 0;
  sys.SetFire(true);
  Step(sys, player, 0.5);
  Check(sys.View().block === "out" && emptyHits >= 1, "弹尽有回执");
}

console.log("ok  弹药：一板 30 发、换板要时间、补弹封顶、弹尽有回执");

// ===========================================================================
// 八、交互预制（接管入口真的是 Script_Interact 的注册点）
// ===========================================================================

{
  const { sys, id } = MakeRig({ position: { x: 10, y: 0, z: 0 }, baseYaw: 0 });
  const interact = new InteractSystem({}, {});
  const takeId = interact.Register(EmplacementInteraction({
    emplacement: sys, gunId: id, tag: "CH5_Chengqiang",
  }));
  Check(interact.PointCount === 1, "接管入口注册进了 S1 的交互框架");
  const point = interact.Point(takeId);
  Check(point.gesture === "tap", "上枪位是点按 —— 不该让人按住读条");
  // kind 不许撞上 Script_Interact 的两条内建分流（pickup / ammo）：撞了之后
  // Complete() 会按内建那条结算，表现成「按了没反应」而两处代码都没错。
  const builtinKinds = new Set(["pickup", "ammo"]);
  Check(!builtinKinds.has(point.kind), `接管点的 kind 不撞内建（${point.kind}）`);
  Check(!builtinKinds.has(AmmoResupplyInteraction({}).kind),
    `补弹点的 kind 不撞内建（${AmmoResupplyInteraction({}).kind}）`);
  Check(point.once === false, "不是一次性：这挺枪要反复上下（§6 阶段⑨重占机枪位）");

  // 锚点是**射手站位**而不是枪身：贴着枪管侧面不该能接管。
  const seat = sys.Emplacement(id).seat;
  Check(Math.abs(seat.x - 10) < 1e-6 && seat.z > 0, "射手站位算在枪后头");

  const far = MakePlayer({ x: 10, z: 20 });
  Check(interact.Query(far) === null, "站远了够不着");

  // 走到射手位背后、朝着枪：够得着，标签是「接管九二式重机枪」。
  // yaw=0 面朝 -Z，而射手位在枪的 +Z 一侧，所以玩家要站在 seat 再往 +Z 一点。
  const near = MakePlayer({ x: seat.x, y: seat.y, z: seat.z + 0.3 });
  const candidate = interact.Query(near);
  Check(candidate && candidate.point.id === takeId, "站到射手位上够得着");
  Check(candidate.label.includes("接管"), `提示语说的是接管（${candidate.label}）`);
  Check(interact.Press(near) !== null, "按 F 接管");
  Check(sys.Mounted === true, "真的上了枪位");
  Check(interact.Query(near) === null, "已经在枪上了，接管点整条不出现（不给灰提示）");

  sys.Vacate("player");
  Step(sys, near, 0.6);

  // 手上占着东西的时候整条不出现：抬着担架的人腾不出手来打机枪。
  const fakeCarry = { Active: true };
  const gated = new InteractSystem({}, {});
  gated.Register(EmplacementInteraction({
    emplacement: sys, gunId: id, tag: "CH5_Chengqiang", carry: fakeCarry,
  }));
  Check(gated.Query(near) === null, "抬着东西时接管点不出现");
  fakeCarry.Active = false;
  Check(gated.Query(near) !== null, "放下之后又出现了");

  const gun = sys.Emplacement(id);
  gun.dead = true;
  Check(interact.Query(near) === null, "废了的枪也不出现接管提示");
}

{
  // 补弹点：手上没有就整条不出现；补上之后弹药真的进账。
  const { sys, id } = MakeRig({ belts: 1 });
  const interact = new InteractSystem({}, {});
  let stock = 0;
  interact.Register(AmmoResupplyInteraction({
    emplacement: sys, gunId: id, position: { x: 0, y: 0, z: 1.0 },
    belts: 2, seconds: 0.4,
    Consume: () => (stock > 0 ? (stock -= 1, true) : false),
  }));
  // 弹药箱在枪的 +Z 一侧 1 m 处；玩家站在它跟前、转身朝 +Z 面对它（yaw=π）。
  const player = MakePlayer({ x: 0, z: 0.2 });
  player.yaw = Math.PI;
  const candidate = interact.Query(player);
  Check(candidate && candidate.gesture === "hold", "补弹是按住型（抱一箱塞进供弹口要几秒）");

  interact.Press(player);
  for (let i = 0; i < 20; i += 1) interact.Update(0.05, player);
  Check(sys.Emplacement(id).belts === 0, "背包里没有弹药，这一下不算数");
  stock = 1;
  interact.Press(player);
  for (let i = 0; i < 20; i += 1) interact.Update(0.05, player);
  Check(sys.Emplacement(id).belts === 2, "有弹药就补进去两板");
}

console.log("ok  交互预制：接管点走 S1 框架、锚在射手位、补弹按住型且吃背包库存");

// ===========================================================================
// 九、换关兜底与取证口
// ===========================================================================

{
  const { sys, id } = MakeRig({ tag: "CH5_Chengqiang" });
  sys.CreateEmplacement({ id: "other", tag: "CH1_NanLu", position: { x: 60, y: 0, z: 0 } });
  const player = MakePlayer();
  sys.Occupy(id, player);
  Check(sys.GunCount === 2, "两挺枪");
  Check(sys.List("CH5_Chengqiang").length === 1, "按 tag 取得到");
  Check(sys.Clear("CH1_NanLu") === 1, "按 tag 清一段");
  Check(sys.GunCount === 1 && sys.Mounted === true, "清别的 tag 不动玩家手上这一挺");
  Check(sys.Clear() === 1 && sys.Mounted === false, "整表清空（换关走这一条）会连人一起放下来");

  const state = sys.State();
  Check(state.mounted === null && Array.isArray(state.guns) && state.guns.length === 0,
    "取证口给的是脱敏快照");
  Check(typeof state.stats.shots === "number" && typeof state.stats.dead === "number",
    "取证口带累计计数（Debug.Emplacement 读它）");
}

{
  // Reset 是换关/复活的兜底：不记 vacated、不放音。
  const { sys, id, log } = MakeRig();
  const player = MakePlayer();
  sys.Occupy(id, player);
  const played = log.played.length;
  sys.Reset("levelChange");
  Check(sys.Mounted === false, "Reset 把人放下来");
  Check(sys.State().stats.vacated === 0, "Reset 不记离位");
  Check(log.played.length === played, "Reset 不放音");
}

console.log("ok  换关兜底：按 tag 清、整表清、Reset 不污染取证");

console.log(`\nEmplacementTest 通过：${checks} 条断言`);
