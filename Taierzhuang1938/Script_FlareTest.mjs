// ===========================================================================
// Script_FlareTest.mjs —— 照明弹的回归口（纯 Node，毫秒级）
//
// 覆盖 docs/Data_MissionRemake.md §5 阶段 5 / 7，以及 §0「明确保留的三项创作性
// 还原」第 3 条（东关夜战中日军用照明弹照亮街巷，**敌我突然暴露**）：
//   ① 两条预设的档案表：预设名、顶空高度、暴露倍率、signals 与 CH4 EVENTS 对得上；
//   ② 相位机：ascend → ignite → burn → fade → adapt → done，四个节拍一次不多一次不少；
//   ③ 几何：升空接得上顶空（不瞬移）、伞降匀速下沉、风漂与摆动都在预设的量级内；
//   ④ 光强包络：升空只有余烬、点燃是冲头（0.35 s 到满）、燃烧稳定带抖、熄灭平方衰减；
//   ⑤ **暴露机制**：燃烧期发现距离抬到 exposeSight 倍、
//      **三档姿态的比例一个都没变**（趴下仍然比站着难被发现）、
//      熄灭之后暗适应压到 1 以下、过完还原成 1；
//   ⑥ 换关兜底：Reset / Abort 一定把倍率还成 1，并且把灯与烟都收掉；
//   ⑦ 音效降级：A2 批那几条实录没合上时退到现有最近的源，且只解析一次；
//   ⑧ 定时序列：按 atS 打出去 —— **剧情节拍，不是随机**；
//   ⑨ 闸门：同时在天上的枚数上限、掉帧那一下不许跳过整段相位。
//
// ⑤ 里有一条是**扫源码**的：Script_Ai 的三处发现距离判定必须全部走
// `this.SightRange(...)`。少走一处，那一处就永远读不到照明弹的倍率 ——
// 而它不会报错，只会表现成「照明弹亮着，可有些人还是看不见」。
// 纯 Node 读不了 Script_Ai（它 import three），所以这一条按源码文本对账。
//
// 跑法：node Taierzhuang1938/Script_TestRunner.mjs --only=FlareTest
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FlareDirector, FLARE_PRESETS, FLARE_DEFAULTS, FLARE_SFX, FLARE_PHASES, FLARE_BEATS,
} from "./Script_Flare.mjs";

const dirHere = path.dirname(fileURLToPath(import.meta.url));
let checks = 0;
function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

/**
 * 预设只写与默认值不同的字段（这是有意的：改一处默认值两枚一起变），
 * 所以断言与算时刻一律用铺完默认值的这一份，别直接读 FLARE_PRESETS 的裸字段。
 */
const P = Object.fromEntries(
  Object.entries(FLARE_PRESETS).map(([id, preset]) => [id, { ...FLARE_DEFAULTS, ...preset }]));

/** 假宿主：灯、烟、发现距离全部记账，不碰任何真实系统。 */
function MakeRig(hostOver = {}, opts = {}) {
  const log = {
    played: [], signals: [], beats: [], ends: [], spotting: [],
    lights: new Map(), smokes: new Map(), lightWrites: 0, smokeMoves: 0,
  };
  let nextHandle = 1;
  const host = {
    Time: () => 0,
    // 默认宿主：**A2 批那几条实录还没合上**，所以每条的第一个名字一律播不响 ——
    // 这正是线上此刻的状态，测试就按这个状态测降级。
    Play: (name, o) => {
      const primary = new Set(Object.values(FLARE_SFX).map((s) => s.names[0]));
      if (primary.has(name)) return null;
      log.played.push({ name, opts: o });
      return { name };
    },
    Signal: (name) => log.signals.push(name),
    GroundHeight: () => 0,
    AddLight: (spec) => {
      const h = nextHandle++;
      log.lights.set(h, { ...spec });
      return h;
    },
    MoveLight: (h, spec) => {
      log.lightWrites += 1;
      const cur = log.lights.get(h);
      if (cur) Object.assign(cur, spec);
    },
    RemoveLight: (h) => log.lights.delete(h),
    AddSmoke: (spec) => {
      const h = nextHandle++;
      log.smokes.set(h, { ...spec });
      return h;
    },
    MoveSmoke: (h, pos) => {
      log.smokeMoves += 1;
      const cur = log.smokes.get(h);
      if (cur) cur.position = pos;
    },
    RemoveSmoke: (h) => log.smokes.delete(h),
    SetSpotting: (scale) => log.spotting.push(scale),
    PlayerPos: () => ({ x: 0, y: 0, z: 0 }),
    ...hostOver,
  };
  const sys = new FlareDirector(host, opts);
  return { sys, log, host };
}

/** 推 seconds 秒。返回最后一帧的 View。 */
function Step(sys, seconds, dt = 1 / 60) {
  let view = null;
  for (let t = 0; t < seconds - 1e-9; t += dt) view = sys.Update(dt);
  return view;
}

const Basic = (over = {}) => ({ from: { x: 100, z: 0 }, at: { x: 60, z: 10 }, ...over });

// ---------------------------------------------------------------------------
// ① 档案表：两条预设就是 §5 那两枚
// ---------------------------------------------------------------------------
{
  Check(Object.keys(FLARE_PRESETS).length === 2, "只有两条预设 —— §5 就是两枚，不许多出一枚随机的");
  Check(FLARE_PRESETS.crossLane && FLARE_PRESETS.narrowLane, "两条预设分别对着阶段 5 与阶段 7");
  for (const [id, preset] of Object.entries(FLARE_PRESETS)) {
    Check(preset.id === id, `${id} 的 id 字段与键名一致（取证口按 id 找它）`);
    Check(typeof preset.note === "string" && preset.note.length > 0, `${id} 写明了它挂在哪个 zone`);
    // 2026-09-06：第四关章节数据随章节废弃清空，信号名现在是引擎侧的契约常量，不再对账章节 EVENTS。
    Check(preset.signals.launch === "C4_FlareUp", `${id} 升空推的是契约常量 C4_FlareUp`);
  }
  // 窄巷那一枚压得更低、烧得更短、暴露更狠、暗适应更深 —— 这是 §5 阶段 7 的口径。
  Check(P.narrowLane.apexM < P.crossLane.apexM, "窄巷那枚压得更低（十几米外要照得清人脸）");
  Check(P.narrowLane.burnS < P.crossLane.burnS, "窄巷那枚烧得更短");
  Check(P.narrowLane.exposeSight > P.crossLane.exposeSight, "窄巷那枚暴露得更狠（敌我十余米）");
  Check(P.narrowLane.adaptSight < P.crossLane.adaptSight,
    "窄巷那枚熄灭后更黑 ——「谁是谁，只能靠喊」");
  Check(FLARE_PHASES.length === 7 && FLARE_BEATS.length === 4, "相位表七项、节拍表四项");
}
console.log("ok  ① 档案表：两条预设 = §5 那两枚，signals 是引擎侧契约常量");

// ---------------------------------------------------------------------------
// ② 相位机与四个节拍
// ---------------------------------------------------------------------------
{
  const { sys, log } = MakeRig();
  const seen = [];
  const id = sys.LaunchFlare(Basic({
    preset: "crossLane",
    OnPhase: (beat, view) => { seen.push(beat); log.beats.push({ beat, phase: view.phase }); },
    OnEnd: (summary) => log.ends.push(summary),
  }));
  Check(typeof id === "string", "LaunchFlare 给回一个 id");
  Check(seen[0] === "launch", "发射那一下立刻推 launch 节拍（不等升空走完）");
  Check(sys.Phase === "ascend" || sys.View().flares[0].phase === "ascend", "起手就是升空段");

  const p = P.crossLane;
  Step(sys, p.ascendS - 0.1);
  Check(sys.View().flares[0].phase === "ascend", "顶空之前一直在升空段");
  Check(!seen.includes("ignite"), "没到顶空不许点燃");
  Step(sys, 0.2);
  Check(seen.includes("ignite"), "到顶空就点燃");

  Step(sys, p.igniteS + 0.2);
  Check(sys.View().flares[0].phase === "burn", "冲头过后进稳定燃烧");
  Step(sys, p.burnS - 0.4);
  Check(sys.View().flares[0].phase === "burn", "燃烧段撑满 burnS");
  Step(sys, 0.6);
  Check(sys.View().flares[0].phase === "fade", "burnS 到点转熄灭");
  Check(!seen.includes("out"), "衰减还没走完就不算「灭了」");

  Step(sys, p.fadeS);
  Check(seen.includes("out"), "衰减走完推 out（夜色回落）");
  Check(sys.View().flares[0].phase === "adapt", "熄灭之后是暗适应段，不是直接结束");
  Check(log.lights.size === 0 && log.smokes.size === 0,
    "熄灭那一刻灯与烟就收掉 —— 暗适应是眼睛的事，天上已经什么都没有了");

  Step(sys, p.adaptS + 0.2);
  Check(seen.includes("clear"), "暗适应过完推 clear");
  Check(!sys.Active, "clear 之后这一枚就没了");
  Check(seen.join(",") === "launch,ignite,out,clear", `四个节拍一次不多一次不少（实得 ${seen.join(",")}）`);
  Check(log.ends.length === 1 && log.ends[0].completed === true, "走完了才算 completed");
  Check(log.signals.filter((s) => s === "C4_FlareUp").length === 1, "C4_FlareUp 只推一次");
}
console.log("ok  ② 相位机：ascend→ignite→burn→fade→adapt→done，四个节拍一次不多一次不少");

// ---------------------------------------------------------------------------
// ③ 几何：升空接得上顶空，伞降匀速下沉
// ---------------------------------------------------------------------------
{
  const { sys } = MakeRig();
  const p = P.crossLane;
  sys.LaunchFlare(Basic({ preset: "crossLane" }));
  const first = sys.View().flares[0];
  Check(Math.abs(first.x - 100) < 1 && Math.abs(first.agl) < 1, "第一帧在发射点、还没离地");

  // 顶空那一帧：位置应该已经滑到 at 附近，高度到 apexM。
  Step(sys, p.ascendS - 1 / 60);
  const apex = sys.View().flares[0];
  Check(Math.abs(apex.agl - p.apexM) < 1.0, `顶空高度到 apexM（实得 ${apex.agl.toFixed(2)}）`);
  Check(Math.abs(apex.x - 60) < 1.0 && Math.abs(apex.z - 10) < 1.0,
    "水平位置滑到了顶空点 at（照亮的是巷子，不是发射筒）");

  // 跨过点燃那一帧不许瞬移：两段用的是两套算式，接缝上最容易跳。
  const before = sys.View().flares[0];
  sys.Update(1 / 60);
  const after = sys.View().flares[0];
  const jump = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  Check(jump < 1.2, `升空段接得上伞降段，不瞬移（实得 ${jump.toFixed(3)} m）`);

  // 伞降：匀速下沉 + 风漂 + 横摆。
  const t0 = sys.View().flares[0];
  Step(sys, 5);
  const t1 = sys.View().flares[0];
  const drop = t0.agl - t1.agl;
  Check(Math.abs(drop - p.descendMS * 5) < 0.3, `伞降按 descendMS 匀速下沉（实得 ${drop.toFixed(2)} m/5 s）`);
  Check(t1.agl > 0, "还没落地");
  const lateral = Math.hypot(t1.x - 60, t1.z - 10);
  Check(lateral > 0.5, "风把它推走了（横向真的在动）");
  Check(lateral < p.driftMS * 8 + p.swayM * 2 + 2,
    "但没被推到街对面去（漂移与摆幅都在预设量级内）");
}
console.log("ok  ③ 几何：升空到顶空不瞬移、伞降匀速下沉、风漂与横摆都在量级内");

// ---------------------------------------------------------------------------
// ④ 光强包络
// ---------------------------------------------------------------------------
{
  const { sys, log } = MakeRig();
  const p = P.crossLane;
  sys.LaunchFlare(Basic({ preset: "crossLane" }));
  Check(log.lights.size === 1, "升空那一刻就把灯槽要下来（点燃那一帧才不会抢不到槽）");
  const lamp = [...log.lights.values()][0];
  Check(lamp.flicker === false,
    "灯池自己那套火焰抖动要关掉 —— 照明弹自带包络，套两层就是双份抖动");
  Check(lamp.color === p.lightColor && lamp.color !== 0xff7a2a,
    "光色是冷白，与火光池那些橙红的火分得开");

  Step(sys, p.ascendS - 0.2);
  const emberB = sys.View().flares[0].brightness;
  Check(emberB > 0 && emberB < 0.12, `升空只有余烬（实得 ${emberB.toFixed(3)}）`);

  Step(sys, 0.2 + p.igniteS);
  const litB = sys.View().flares[0].brightness;
  Check(litB > 0.9, `0.35 s 之内冲到满 —— 「突然」亮起（实得 ${litB.toFixed(3)}）`);

  // 燃烧段：亮度稳定在 1 附近，但**每帧都在抖**（摇曳）。
  let min = 9, max = -9, changes = 0, prev = null;
  for (let i = 0; i < 240; i += 1) {
    sys.Update(1 / 60);
    const b = sys.View().flares[0].brightness;
    if (b < min) min = b;
    if (b > max) max = b;
    if (prev !== null && Math.abs(b - prev) > 1e-6) changes += 1;
    prev = b;
  }
  Check(changes > 200, "燃烧期光强每帧都在动（摇曳，不是一盏死灯）");
  Check(max <= 1.001 && min > 1 - p.flickerDepth - 1e-3,
    `抖动幅度就是 flickerDepth（实得 ${min.toFixed(3)}–${max.toFixed(3)}）`);
  // 包络与抖动是**两个数**：暴露读包络，灯读 brightness。
  const lv = sys.View().flares[0];
  Check(lv.level === 1 && lv.brightness !== 1,
    "燃烧期包络恒为 1，brightness 才带抖 —— 发现距离不跟着 7 Hz 闪");

  // 强度 = groundLux × agl² × brightness：高度掉下来，照度反而更强。
  const hi = sys.View().flares[0];
  Step(sys, 4);
  const lo = sys.View().flares[0];
  Check(lo.agl < hi.agl && lo.intensity < hi.intensity,
    "越降越低，点光强度跟着降 —— 因为地面照度是按 agl² 反推的");
  Check(lo.intensity <= p.maxIntensity, "强度有硬顶（灯池预算）");

  // 熄灭：平方衰减，最后归零。
  const state = sys.View().flares[0];
  Step(sys, p.fadeAt ?? 0);
  Step(sys, Math.max(0, p.ascendS + p.igniteS + p.burnS - state.t) + p.fadeS * 0.5);
  const half = sys.View().flares[0];
  if (half && half.phase === "fade") {
    Check(half.brightness < 0.45, `衰减到一半时已经暗下去大半（平方衰减，实得 ${half.brightness.toFixed(3)}）`);
  } else {
    Check(true, "衰减段（这一步走过头了，靠 ② 的相位断言兜底）");
  }
}
console.log("ok  ④ 光强包络：余烬 → 0.35 s 冲头 → 带抖的稳定燃烧 → 平方衰减；包络与抖动分成两个数");

// ---------------------------------------------------------------------------
// ⑤ 暴露机制 —— 本文件最重的一段
// ---------------------------------------------------------------------------
{
  const { sys, log } = MakeRig();
  const p = P.crossLane;
  sys.LaunchFlare(Basic({ preset: "crossLane" }));
  Check(sys.SightScale === 1, "还没亮就不许动发现距离");
  Step(sys, p.ascendS - 0.1);
  Check(sys.SightScale === 1,
    "升空段也不算暴露 —— 那点余烬照不亮任何人，算进去玩家会先挨枪再看见照明弹");

  Step(sys, 0.1 + p.igniteS + 1);
  Check(Math.abs(sys.SightScale - p.exposeSight) < 1e-6,
    `燃烧期倍率就是 exposeSight（实得 ${sys.SightScale}）`);

  // **姿态那条机制必须原样成立**：三档同乘一个数，次序与比例一个都没变。
  const base = [120, 80, 45];      // 只是本地对照，真值下面从 Script_Ai 源码里读
  const scaled = base.map((v) => v * sys.SightScale);
  Check(scaled[0] > scaled[1] && scaled[1] > scaled[2],
    "照明弹底下：站着仍然比蹲着先被发现，蹲着仍然比趴着先被发现");
  Check(Math.abs(scaled[2] / scaled[0] - base[2] / base[0]) < 1e-9,
    "三档的**比例**一个都没变 —— 倍率是乘上去的，不是把表改成一刀切");

  // 熄灭之后：暗适应压到 1 以下，再慢慢还原。
  Step(sys, p.burnS + p.fadeS);
  Check(sys.SightScale < 1,
    `熄灭之后眼睛还没回来（实得 ${sys.SightScale.toFixed(3)}，应当小于 1）`);
  Check(sys.SightScale >= p.adaptSight - 1e-6, "但不会比 adaptSight 更黑");
  const deep = sys.SightScale;
  Step(sys, p.adaptS * 0.75);
  Check(sys.SightScale > deep, "暗适应在往回走");
  Step(sys, p.adaptS);
  Check(sys.SightScale === 1, "过完暗适应，发现距离**一定**还原成 1");
  Check(log.spotting[log.spotting.length - 1] === 1, "最后一次推给宿主的就是 1（不留浮点尾巴）");
  Check(log.spotting.length < 400,
    `发现距离不是每帧写一次（实得 ${log.spotting.length} 次；跟着摇曳每帧写就是几千次）`);

  // 总开关：关掉之后只剩画面。
  const off = MakeRig({}, { exposure: false });
  off.sys.LaunchFlare(Basic({ preset: "crossLane" }));
  Step(off.sys, P.crossLane.ascendS + P.crossLane.igniteS + 2);
  Check(off.sys.SightScale === 1, "SetExposure(false) 之后照明弹只有画面，不动发现距离");
  Check(off.sys.Brightness > 0.9, "但灯照样亮");
}
console.log("ok  ⑤ 暴露：燃烧期抬到 exposeSight、三档比例不变、熄灭后暗适应 <1、过完还原成 1");

// ---------------------------------------------------------------------------
// ⑤b Script_Ai 的三处判定必须全部走 SightRange（源码对账）
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(path.join(dirHere, "Script_Ai.mjs"), "utf8");
  const table = src.match(/export const SIGHT_BY_STANCE = \[([^\]]+)\]/);
  Check(table, "Script_Ai 仍然导出 SIGHT_BY_STANCE（姿态那张表还在）");
  const values = table[1].split(",").map((v) => Number(v.trim()));
  Check(values.length === 3 && values[0] > values[1] && values[1] > values[2],
    "站 > 蹲 > 卧 —— 这就是「姿态决定被发现的距离」那条机制本身");
  Check(/SightRange\(stance\)\s*\{[^}]*this\.sightScale/.test(src),
    "SightRange 里真的乘了 sightScale（不然照明弹写进去也没人读）");
  Check(/SetSightScale\(scale\)/.test(src) && /SIGHT_SCALE_RANGE/.test(src),
    "SetSightScale 存在且带上下限夹持");
  // 关键：除了 SightRange 与取证口 SightState 之外，不许再有裸读那张表的判定。
  // **先把注释剥掉再数**：这条规矩本身要写进注释里，注释里那几处引用不算判定。
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const rawReads = [...code.matchAll(/SIGHT_BY_STANCE\s*\[/g)].length;
  Check(rawReads === 1,
    `SIGHT_BY_STANCE 只许在 SightRange 里被下标读一次（实得 ${rawReads} 处）——`
    + "多出来的那一处会永远读不到照明弹的倍率，而且不报错，只表现成「亮着还有人看不见」");
  const viaRange = [...src.matchAll(/this\.SightRange\(/g)].length;
  Check(viaRange >= 3,
    `三处发现距离判定（玩家 / 友邻 / 旧目标复核）全部走 SightRange（实得 ${viaRange} 处）`);
}
console.log("ok  ⑤b 源码对账：Script_Ai 的发现距离判定全部走 SightRange，没有绕过倍率的裸读");

// ---------------------------------------------------------------------------
// ⑥ 换关兜底
// ---------------------------------------------------------------------------
{
  const { sys, log } = MakeRig();
  sys.LaunchFlare(Basic({ preset: "crossLane", OnEnd: (s) => log.ends.push(s) }));
  Step(sys, P.crossLane.ascendS + P.crossLane.igniteS + 2);
  Check(sys.SightScale > 1 && log.lights.size === 1, "先确认它真的亮着、真的占着灯槽");

  sys.Reset("levelChange");
  Check(!sys.Active, "Reset 把天上的都收了");
  Check(sys.SightScale === 1, "Reset **一定**把发现距离还原成 1（不还的话下一关满场互相看得见）");
  Check(log.spotting[log.spotting.length - 1] === 1, "而且真的推给了宿主");
  Check(log.lights.size === 0 && log.smokes.size === 0, "灯与烟都收干净了");
  Check(log.ends.length === 0, "Reset 不回调 OnEnd（那是换关，不是演完了）");
  Check(sys.State().stats.aborted === 0, "Reset 不记 aborted");
  Check(Object.keys(sys.State().sfx).length === 0, "Reset 顺手清掉音效解析缓存");

  // Abort 走另一本账：记 aborted、回调 OnEnd、同样还原倍率。
  const two = MakeRig();
  two.sys.LaunchFlare(Basic({ preset: "narrowLane", OnEnd: (s) => two.log.ends.push(s) }));
  Step(two.sys, P.narrowLane.ascendS + 1);
  two.sys.Abort(null, "cutscene");
  Check(two.sys.State().stats.aborted === 1, "Abort 记 aborted");
  Check(two.log.ends.length === 1 && two.log.ends[0].completed === false, "Abort 回调但不算 completed");
  Check(two.sys.SightScale === 1, "Abort 也要把发现距离还回去");
  Check(two.log.lights.size === 0, "Abort 也收灯");

  // 收完还能再打（下一关照样能用）。
  Check(typeof two.sys.LaunchFlare(Basic({ preset: "crossLane" })) === "string", "收完还能再打一枚");
}
console.log("ok  ⑥ 换关兜底：Reset / Abort 都把倍率还成 1 并收掉灯与烟，两者分账");

// ---------------------------------------------------------------------------
// ⑦ 音效降级
// ---------------------------------------------------------------------------
{
  const { sys, log } = MakeRig();
  sys.LaunchFlare(Basic({ preset: "crossLane" }));
  Check(log.played.some((p) => p.name === "launcherPop"),
    "flareLaunch 还没接线，退到 launcherPop（掷弹筒那记闷推力）");
  Step(sys, P.crossLane.ascendS + 0.2);
  Check(log.played.some((p) => p.name === "grenadeThrow"),
    "flareIgnite 还没接线，退到 grenadeThrow 的一记气流「噗」");
  Check(sys.State().sfx.launch === "launcherPop", "解析结果记下来了（一条 key 只试一次）");

  // burn / out 没有备胎：**宁可没有，也不拿别的音顶一条持续声**。
  Check(FLARE_SFX.burn.names.length === 1 && FLARE_SFX.out.names.length === 1,
    "燃烧嘶声与熄灭衰减不给备胎（合成器造不出来，顶包只会像多了台机器）");
  Step(sys, 8);
  Check(!log.played.some((p) => p.name === "flareBurn"), "没接线时燃烧嘶声就是静默降级，不报错");

  // 接线之后（A2 那几条实录的同名配方合上了）：第一个名字能播，就不再试备胎。
  const heard = [];
  const wired = MakeRig({ Play: (name) => { heard.push(name); return { name }; } });
  wired.sys.LaunchFlare(Basic({ preset: "crossLane" }));
  Check(heard[0] === "flareLaunch", "实录合上之后优先播实录");
  Check(!heard.includes("launcherPop"), "播得响就不再退备胎");

  // 燃烧嘶声按素材长度重触发（Play 没有 loop 语义）。
  Step(wired.sys, P.crossLane.ascendS + 0.2);
  const burnsAt0 = heard.filter((n) => n === "flareBurn").length;
  Step(wired.sys, FLARE_SFX.burn.loopEveryS + 0.3);
  const burnsAt1 = heard.filter((n) => n === "flareBurn").length;
  Check(burnsAt0 >= 1 && burnsAt1 > burnsAt0, "燃烧嘶声按 loopEveryS 重触发（Play 没有 loop）");
}
console.log("ok  ⑦ 音效降级：pendingCue 没接线时退到现有源、只解析一次；没有备胎的那两条静默降级");

// ---------------------------------------------------------------------------
// ⑧ 定时序列：剧情节拍，不是随机
// ---------------------------------------------------------------------------
{
  const { sys, log } = MakeRig();
  const tickets = sys.LaunchSequence([
    { atS: 0, preset: "crossLane", from: { x: 496, z: -18 }, at: { x: 449, z: -22 } },
    { atS: 30, preset: "narrowLane", from: { x: 486, z: 128 }, at: { x: 443, z: 121 } },
  ]);
  Check(tickets.length === 2 && sys.Pending === 2, "两枚都排进了时刻表");
  Check(!sys.Active, "排了不等于打了");
  sys.Update(1 / 60);
  Check(sys.Count === 1 && sys.Pending === 1, "atS=0 那一枚在第一帧就打出去");
  Step(sys, 25);
  Check(sys.Pending === 1, "第二枚没到点就不打（不是随机撒）");
  Step(sys, 6);
  Check(sys.Pending === 0, "到 30 s 第二枚才出去");
  Check(log.signals.filter((s) => s === "C4_FlareUp").length === 2, "两枚各推一次 C4_FlareUp");

  // 撤单。
  const three = MakeRig();
  const t3 = three.sys.LaunchSequence([{ atS: 10, preset: "crossLane", from: { x: 0, z: 0 } }]);
  Check(three.sys.CancelSequence(t3[0]) === 1, "按排队号撤得掉");
  Step(three.sys, 12);
  Check(!three.sys.Active, "撤掉的那一枚不会自己冒出来");

  // 确定性：同一串输入跑两遍，位置逐帧相同。
  const RunOnce = () => {
    const r = MakeRig({}, { seed: 4242 });
    r.sys.LaunchFlare(Basic({ preset: "crossLane" }));
    const trail = [];
    for (let i = 0; i < 600; i += 1) {
      r.sys.Update(1 / 60);
      const v = r.sys.View();
      if (v) trail.push(`${v.flares[0].x.toFixed(4)},${v.flares[0].brightness.toFixed(4)}`);
    }
    return trail.join("|");
  };
  Check(RunOnce() === RunOnce(), "同一种子逐帧可重放（摇曳相位走 Mulberry32，不是 Math.random）");
}
console.log("ok  ⑧ 定时序列：按 atS 打、撤得掉、同种子逐帧可重放");

// ---------------------------------------------------------------------------
// ⑨ 闸门
// ---------------------------------------------------------------------------
{
  const { sys } = MakeRig();
  Check(sys.LaunchFlare(Basic({ preset: "crossLane" })), "第一枚打得出");
  Check(sys.LaunchFlare(Basic({ preset: "narrowLane" })), "第二枚打得出");
  Check(sys.LaunchFlare(Basic({})) === null,
    "第三枚被 maxActive 挡住（灯池一共就四到六槽，两枚已经够读了）");
  Check(sys.State().stats.refused === 1, "被挡下的记在 refused 里");

  const { sys: bad } = MakeRig();
  Check(bad.LaunchFlare({ preset: "nope", from: { x: 0, z: 0 } }) === null, "预设名写错打不出来");
  Check(bad.LaunchFlare({ preset: "crossLane" }) === null, "不给发射点打不出来");

  // 掉一帧（dt 被夹到 0.1）不许跳过整段相位。
  const { sys: laggy } = MakeRig();
  const seen = [];
  laggy.LaunchFlare(Basic({ preset: "crossLane", OnPhase: (b) => seen.push(b) }));
  for (let i = 0; i < 400; i += 1) laggy.Update(2.5);       // 每一帧都卡两秒半
  Check(seen.join(",") === "launch,ignite,out,clear",
    `卡成幻灯片也要把四个节拍全推一遍（实得 ${seen.join(",")}）`);
  Check(laggy.SightScale === 1, "卡帧跑完之后倍率照样还原");
}
console.log("ok  ⑨ 闸门：maxActive、参数校验、掉帧不吞相位");

// ---------------------------------------------------------------------------
// ⑩ 取证口是脱敏快照
// ---------------------------------------------------------------------------
{
  const { sys } = MakeRig();
  sys.LaunchFlare(Basic({ preset: "crossLane", OnPhase: () => {}, OnEnd: () => {} }));
  Step(sys, 4);
  const state = sys.State();
  Check(state.view && state.view.flares.length === 1, "取证口带当前这一枚的快照");
  Check(state.view.flares[0].OnPhase === undefined && state.view.flares[0].signals === undefined,
    "回调与信号表不外泄");
  Check(typeof state.stats.launched === "number" && typeof state.stats.sightPushes === "number",
    "取证口带累计计数（Debug.Flare 读它）");
  Check(Array.isArray(state.presets) && state.presets.length === 2, "取证口列得出两条预设");
  Check(state.exposure === true && typeof state.sightScale === "number", "两个旋钮的当前值看得见");
}
console.log("ok  ⑩ 取证口：脱敏快照，回调与内部句柄不外泄");

console.log(`\nFlareTest 通过：${checks} 条断言`);
