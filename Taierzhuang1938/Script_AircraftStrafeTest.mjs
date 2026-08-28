// ===========================================================================
// Script_AircraftStrafeTest.mjs —— 日机扫射航线的回归口（纯 Node，毫秒级）
//
// 覆盖 docs/Data_MissionRemake.md §2 阶段五 / 六 / 八，以及 §0「明确保留的三项
// 创作性还原」第 1 条（日机认出白布担架与百姓之后仍主动转向扫射）：
//   ① 四条预设的档案表：预设名、机型、伤害口径、signals 与 EVENTS 对得上；
//   ② 航线相位机：approach → strafe → egress → done，四个节拍一次不多一次不少；
//   ③ 几何：进入段接得上扫射段（不瞬移）、机身在弹着点后方 leadM、高度按段走；
//   ④ 弹着线推进：沿线段扫过去；chase 时弹线**拐向**被追的那一头；
//   ⑤ 白名单：点名的必死、immune 的必不死、一次随机都不掷（同种子逐帧可重放）；
//   ⑥ 玩家伤害窗口：提示 → 躲开则不掉血 / 不躲则被击倒；开关与窗口时长可调；
//   ⑦ 音效降级：A2 批那四条实录没合上时退到现有最近的源，且只解析一次；
//   ⑧ 打飞机：命中判定真的存在（Ping 有回执），但一枪也打不下来；
//   ⑨ 换关兜底：Reset 不回调、不结算；Abort 不算 finished。
//
// 为什么全在纯 Node 里：这一层不认识 three、不认识场景 —— 「飞机这一秒在哪儿、
// 谁被打倒、玩家躲没躲开」是规则；模型摆位与曳光/尘土在 Script_Aircraft 与
// Script_Vfx 那一侧（由 BootTest / PlayTest 覆盖）。
//
// 跑法：node Taierzhuang1938/Script_TestRunner.mjs --only=AircraftStrafeTest
// ===========================================================================

import assert from "node:assert/strict";
import {
  AircraftStrafeDirector, STRAFE_PRESETS, STRAFE_DEFAULTS, STRAFE_SFX, STRAFE_PHASES, STRAFE_BEATS,
} from "./Script_AircraftStrafe.mjs";
import { EVENTS } from "./Data_MissionCh1.mjs";

let checks = 0;
function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

/**
 * 预设只写与默认值不同的字段（这是有意的：改一处默认值三条航线一起变），
 * 所以断言与算时刻一律用铺完默认值的这一份，别直接读 STRAFE_PRESETS 的裸字段。
 */
const P = Object.fromEntries(
  Object.entries(STRAFE_PRESETS).map(([id, preset]) => [id, { ...STRAFE_DEFAULTS, ...preset }]));

/** 假 NPC：本层只读 position / alive，只调 TakeHit / Kill。 */
function MakeNpc(id, x = 0, z = 0) {
  const npc = {
    id, alive: true, position: { x, y: 0, z },
    hits: [], killed: false,
    TakeHit(damage, part, dir) {
      npc.hits.push({ damage, part, dir });
      return false;                                   // 「打中了但没死」——必死要靠 Kill 兜
    },
    Kill(dir) { npc.killed = true; npc.alive = false; npc.killDir = dir; return true; },
  };
  return npc;
}

/** 假玩家：HitPlayer 只记账。 */
function MakeRig(hostOver = {}, opts = {}) {
  const log = {
    played: [], hints: [], said: [], signals: [], tracers: [], impacts: [],
    playerHits: [], npcHits: [], phases: [], ends: [],
  };
  const host = {
    Time: () => 0,
    // 默认宿主：**A2 批那四条实录还没合上**，所以第一个名字一律播不响 ——
    // 这正是线上此刻的状态，测试就按这个状态测降级。
    Play: (name, opts2) => {
      const primary = new Set(Object.values(STRAFE_SFX).map((s) => s.names[0]));
      if (primary.has(name) && name !== "impactFlesh") return null;
      log.played.push({ name, opts: opts2 });
      return { name };
    },
    Hint: (text, seconds) => log.hints.push({ text, seconds }),
    Say: (who, text) => log.said.push({ who, text }),
    Signal: (name) => log.signals.push(name),
    Tracer: (from, to) => log.tracers.push({ from, to }),
    Impact: (point, normal, surface) => log.impacts.push({ point, normal, surface }),
    GroundHeight: () => 0,
    HitPlayer: (damage, dir, info) => log.playerHits.push({ damage, dir, info }),
    PlayerPos: () => ({ x: 0, y: 0, z: 0 }),
    ...hostOver,
  };
  const sys = new AircraftStrafeDirector(host, opts);
  return { sys, log, host };
}

/** 推 seconds 秒。返回最后一帧的 View（航线走完就是 null）。 */
function Step(sys, seconds, dt = 1 / 60) {
  let view = null;
  for (let t = 0; t < seconds - 1e-9; t += dt) view = sys.Update(dt);
  return view;
}

/** 一条最小可用的航线：南北向 120 m 的线段。 */
function BasicSpec(over = {}) {
  return {
    from: { x: 0, z: 0 },
    to: { x: 0, z: 120 },
    ...over,
  };
}

// ===========================================================================
// 一、档案表：四条预设与 CH1 的 EVENTS 对得上
// ===========================================================================

{
  Check(STRAFE_PHASES.length === 5 && STRAFE_PHASES[0] === "idle", "五个相位，idle 排头");
  Check(STRAFE_BEATS.join(",") === "enter,fire,cease,exit", "四个关键节拍的名字与顺序是契约");

  const ids = Object.keys(STRAFE_PRESETS);
  Check(ids.length === 4, "四条预设：CH1 阶段五 / 六 / 八，外加 CH2 那条只有飞越声的");
  for (const [key, preset] of Object.entries(P)) {
    Check(preset.id === key, `${key} 的 id 字段与键一致`);
    Check(typeof preset.label === "string" && preset.label.length > 0, `${key} 有中文标签`);
    Check(preset.speed > 0 && preset.altitudeM > 0, `${key} 的速度与高度是正数`);
    // 不开枪的那条没有「弹着超前」这回事，其余三条必须是正的（弹着在机身前方）。
    if (preset.guns === false) Check(preset.leadM === 0, `${key} 不开枪，超前量归零`);
    else Check(preset.leadM > 0, `${key} 的弹着超前量 > 0（弹着落在机身前方，不是后方）`);
    Check(preset.entryAltM > preset.altitudeM, `${key} 是**降**高度进来的`);
    Check(preset.exitAltM > preset.altitudeM, `${key} 是**拉起**离场的`);
  }

  // signals 的名字必须在 Data_MissionCh1.EVENTS 里查得到 —— 这张表是给集成批的契约，
  // 名字对不上的话章节 beats 会一路等到 80 s 的兜底（Data_MissionCh1 ENGINE_REQUEST 7）。
  const known = new Set(EVENTS.map((e) => e.name));
  const wired = [];
  for (const preset of Object.values(STRAFE_PRESETS)) {
    for (const name of Object.values(preset.signals || {})) {
      Check(known.has(name), `预设推的信号 ${name} 在 Data_MissionCh1.EVENTS 里登记过`);
      wired.push(name);
    }
  }
  Check(wired.includes("AircraftFirstPass"), "阶段五推 AircraftFirstPass");
  Check(wired.includes("AircraftTurnCrowd"), "阶段六推 AircraftTurnCrowd");
  Check(wired.includes("DiveCue"), "阶段八推 DiveCue");

  // 第一次掠过**不许伤人**（§2「沿铁路攻击车辆，不针对玩家」）。
  Check(STRAFE_PRESETS.railPass.damage.npc === "none", "railPass 一个人都不伤");
  Check(STRAFE_PRESETS.railPass.damage.player === false, "railPass 不打玩家");
  Check(STRAFE_PRESETS.crowdTurn.damage.npc === "whitelist", "crowdTurn 只打点名的人");
  Check(STRAFE_PRESETS.crowdTurn.chase === true, "crowdTurn 的弹线追人群");
  Check(STRAFE_PRESETS.divePress.damage.player === true, "divePress 打得到玩家");
  Check(STRAFE_PRESETS.divePress.cueText === "扑入路沟", "divePress 的提示逐字照策划案");
  Check(STRAFE_PRESETS.flybyOnly.guns === false, "flybyOnly 一发不打（二关只要飞越音）");
  Check(P.railPass.guns !== false && P.crowdTurn.guns !== false && P.divePress.guns !== false,
    "另外三条是真开枪的");
}

console.log("ok  档案表：四条预设、机型/高度/超前量口径、signals 与 CH1 的 EVENTS 对得上");

// ===========================================================================
// 二、相位机与四个节拍
// ===========================================================================

{
  const { sys, log } = MakeRig();
  const phases = [];
  const id = sys.StrafeRun(BasicSpec({
    preset: "railPass",
    OnPhase: (beat, view) => { phases.push(beat); log.phases.push({ beat, phase: view.phase }); },
    OnEnd: (summary) => log.ends.push(summary),
  }));
  Check(typeof id === "string", "StrafeRun 返回航线 id");
  Check(sys.Active && sys.Phase === "approach", "起手就在进入段");
  Check(phases.join(",") === "enter", "起手只推 enter 这一拍");
  Check(log.signals.join(",") === "AircraftFirstPass", "enter 那一拍推了 story 信号");

  // 同时只跑一条：第二条起不来。
  Check(sys.StrafeRun(BasicSpec()) === null, "航线活着的时候起不了第二条");

  const preset = P.railPass;
  const enterS = preset.approachM / preset.speed;
  Step(sys, enterS - 0.2);
  Check(sys.Phase === "approach", "进入段没走完之前一直是 approach");
  Check(phases.join(",") === "enter", "还没到开火那一拍");

  Step(sys, 0.4);
  Check(sys.Phase === "strafe", "走完 approachM 就进扫射段");
  Check(phases.join(",") === "enter,fire", "第二拍是 fire");

  const fireS = 120 / preset.speed;
  Step(sys, fireS + 0.2);
  Check(sys.Phase === "egress", "弹线扫完线段就拉起");
  Check(phases.join(",") === "enter,fire,cease", "第三拍是 cease");

  Step(sys, preset.exitM / preset.speed + 0.2);
  Check(!sys.Active && sys.Phase === "idle", "离场走完航线就收了");
  Check(phases.join(",") === "enter,fire,cease,exit", "四拍齐全且有序");
  Check(log.ends.length === 1 && log.ends[0].completed === true, "OnEnd 只回调一次且标记走完");
  Check(log.ends[0].beats.join(",") === "enter,fire,cease,exit", "summary 里也留了节拍序列");
  Check(sys.View() === null, "航线收了之后 View() 是 null（渲染层据此归队）");
  Check(sys.State().stats.finished === 1, "取证口记了一条走完的航线");
}

console.log("ok  相位机：approach → strafe → egress → done，四拍有序、只推一次、结束回调一次");

// ===========================================================================
// 三、几何：进入段接得上扫射段、机身在弹着点后方、高度按段走
// ===========================================================================

{
  const { sys } = MakeRig();
  sys.StrafeRun(BasicSpec({ preset: "crowdTurn" }));
  const preset = P.crowdTurn;
  const first = sys.View();
  // 进入段起点：from 往后退 (approachM + leadM)。线段朝 +Z，所以 z 是负的一大截。
  Check(Math.abs(first.aircraft.z + preset.approachM + preset.leadM) < 1e-6,
    "进入段从 from 后方 approachM + leadM 起飞");
  Check(Math.abs(first.aircraft.agl - preset.entryAltM) < 1e-6, "起手在 entryAltM 上");

  const enterS = preset.approachM / preset.speed;
  const before = Step(sys, enterS - 1 / 60);
  const after = sys.Update(1 / 60);
  Check(before.phase === "approach" && after.phase === "strafe", "刚好跨过开火那一帧");
  // **不许瞬移**：进入段最后一帧与扫射段第一帧的机位差不该超过一帧的位移。
  const jump = Math.hypot(after.aircraft.x - before.aircraft.x, after.aircraft.z - before.aircraft.z);
  Check(jump < preset.speed * (1 / 60) * 3,
    `进入段接扫射段不瞬移（实测跨帧位移 ${jump.toFixed(2)} m）`);
  Check(Math.abs(after.aircraft.agl - preset.altitudeM) < 1e-6, "扫射段维持 altitudeM");

  // 机身在弹着点**后方** leadM：俯角就是这么定的，反了就成了「飞机追自己的弹」。
  const mid = Step(sys, 0.5);
  const lead = Math.hypot(mid.impact.x - mid.aircraft.x, mid.impact.z - mid.aircraft.z);
  Check(Math.abs(lead - preset.leadM) < 0.5, `弹着点比机身超前 leadM（实测 ${lead.toFixed(1)} m）`);
  Check(mid.impact.z > mid.aircraft.z, "弹着点在机身前方（线段朝 +Z）");

  // 离场：一路爬到 exitAltM。（上面已经推过 0.5 s 扫射，这里留 1.5 s 余量别推过头。）
  Step(sys, 120 / preset.speed + preset.exitM / preset.speed - 1.5);
  const out = sys.View();
  Check(out.phase === "egress" && out.aircraft.agl > preset.altitudeM * 2, "离场段真的在爬高");
  Check(out.aircraft.climb > 0, "离场时爬升角为正（抬头）");
}

console.log("ok  几何：起点/超前量/高度分段，进入段接扫射段不瞬移");

// ===========================================================================
// 四、弹着线推进与「追人群」
// ===========================================================================

{
  // 不追：弹线沿 from→to 的直线走，横向偏移始终为零。
  const { sys, log } = MakeRig();
  sys.StrafeRun(BasicSpec({ preset: "railPass" }));
  Step(sys, P.railPass.approachM / P.railPass.speed + 0.02);
  const a = sys.View().impact;
  Step(sys, 0.4);
  const b = sys.View().impact;
  Check(b.z > a.z + 20, "弹着点沿线段往前推进");
  Check(Math.abs(b.x) < 1e-6, "不追的时候弹线是直的（横向零偏）");
  Check(log.impacts.length > 0, "落了弹着尘土点");
  Check(log.tracers.length > 0, "画了曳光");
  Check(log.impacts.length > log.tracers.length, "弹着比曳光密（不是每发都是曳光弹）");
  Check(log.impacts.every((i) => i.surface === "dirt"), "弹着走 dirt 面（打的是土路）");
}

{
  // 追：被追的那一头在 +X 侧，弹线必须**拐过去**。
  const crowd = { x: 60, z: 130 };
  const { sys } = MakeRig();
  sys.StrafeRun(BasicSpec({ preset: "crowdTurn", TrackTo: () => crowd }));
  const preset = P.crowdTurn;
  Step(sys, preset.approachM / preset.speed + 0.02);
  const start = sys.View().impact;
  Step(sys, 1.0);
  const now = sys.View().impact;
  Check(now.x > start.x + 3, `弹线拐向被追的那一头（x ${start.x.toFixed(1)} → ${now.x.toFixed(1)}）`);
  // 但拐得有限：一梭子子弹不是遥控导弹。一秒内最多拐 chaseTurnRateRad 弧度。
  const heading = Math.atan2(now.x - start.x, now.z - start.z);
  Check(Math.abs(heading) <= preset.chaseTurnRateRad * 1.05,
    `一秒之内拐的角度不超过 chaseTurnRateRad（实测 ${heading.toFixed(2)} rad）`);
}

{
  // 只有飞越声：四个节拍照推，但一发不打、一处弹着不落、点名的也不倒。
  // §3 阶段一「即使飞机不攻击」幺娃照样抬头骂 —— 落一颗弹就把那一拍毁了。
  const victim = MakeNpc("v", 0, 60);
  const { sys, log } = MakeRig();
  const beats = [];
  sys.StrafeRun(BasicSpec({
    preset: "flybyOnly",
    victims: [{ ref: victim, at: 0.5 }],
    damage: { npc: "whitelist" },
    OnPhase: (b) => beats.push(b),
  }));
  Step(sys, 22);
  Check(beats.join(",") === "enter,fire,cease,exit", "飞越那一条照样走完四拍（章节接 fire 那一拍）");
  Check(log.impacts.length === 0 && log.tracers.length === 0, "一处弹着、一条曳光都没有");
  Check(!victim.killed, "guns:false 时白名单不生效");
  Check(sys.State().stats.bursts === 0, "一梭子都没打");
  Check(log.played.some((p) => p.name === "amb.planeFar"), "但引擎声照放（要的就是这个）");
}

console.log("ok  弹着线：沿线段推进、chase 时拐向被追的那一头且拐幅有上限、飞越声不打枪");

// ===========================================================================
// 五、白名单：点名的必死、immune 的必不死、一次随机都不掷
// ===========================================================================

{
  const danjia = MakeNpc("danjiayuan", 0, 40);
  const baixing = MakeNpc("baixing", 2, 70);
  const shangbing = MakeNpc("shangbing", -1, 55);      // 后面还有戏，必不死
  const { sys, log } = MakeRig({
    HitPlayer: () => {},
  });
  sys.StrafeRun(BasicSpec({
    preset: "crowdTurn",
    victims: [{ ref: danjia, at: 0.25 }, { ref: baixing, at: 0.7 }],
    immune: [shangbing],
  }));
  const preset = P.crowdTurn;
  const enterS = preset.approachM / preset.speed;
  const fireS = 120 / preset.speed;

  Step(sys, enterS + fireS * 0.2);
  Check(!danjia.killed, "0.2 还没到 0.25，担架员还没倒");
  Step(sys, fireS * 0.12);
  Check(danjia.killed, "过了 at=0.25 担架员倒下（脚本点名，不掷随机）");
  Check(!baixing.killed, "at=0.7 那个还站着");
  Check(danjia.hits.length === 1, "先 TakeHit 再 Kill，只结算一次");

  Step(sys, fireS * 0.55);
  Check(baixing.killed, "过了 at=0.7 百姓倒下");
  Check(!shangbing.killed && shangbing.alive, "immune 名单上的人一根汗毛都没掉");
  Check(shangbing.hits.length === 0, "immune 连 TakeHit 都不走");
  Check(sys.State().stats.npcKills === 2, "取证口记了两条");
  Check(log.played.some((p) => p.name === "impactFlesh"), "打中人有听得见的回执");
}

{
  // 同一条航线逐帧重放两遍：白名单的结算时刻必须逐帧相同（不掷随机）。
  const Run = () => {
    const victim = MakeNpc("v", 0, 60);
    const { sys } = MakeRig();
    let killedAt = -1;
    sys.StrafeRun(BasicSpec({ preset: "crowdTurn", victims: [{ ref: victim, at: 0.5 }] }));
    for (let i = 0; i < 900 && sys.Active; i += 1) {
      sys.Update(1 / 60);
      if (victim.killed && killedAt < 0) killedAt = i;
    }
    return killedAt;
  };
  const a = Run(), b = Run();
  Check(a > 0 && a === b, `两次重放在同一帧结算（第 ${a} 帧）`);
}

{
  // damage.npc:"none" 的那一条：点名了也不许倒（railPass 明确不伤人）。
  const victim = MakeNpc("v", 0, 60);
  const { sys } = MakeRig();
  sys.StrafeRun(BasicSpec({ preset: "railPass", victims: [{ ref: victim, at: 0.5 }] }));
  Step(sys, 12);
  Check(!victim.killed, "damage.npc:none 时白名单也不生效（第一次掠过不伤人）");
}

{
  // "line" 模式：弹线沿途见人就打，immune 除外。默认不开，这里显式打开。
  const onLine = MakeNpc("onLine", 0, 60);
  const offLine = MakeNpc("offLine", 40, 60);
  const spared = MakeNpc("spared", 0, 80);
  const { sys } = MakeRig({ Soldiers: () => [onLine, offLine, spared] });
  sys.StrafeRun(BasicSpec({
    preset: "crowdTurn", damage: { npc: "line" }, immune: [spared],
  }));
  Step(sys, 14);
  Check(onLine.killed, "line 模式下压在弹线上的人被打倒");
  Check(!offLine.killed, "离弹线四十米的人没事");
  Check(!spared.killed, "immune 在 line 模式下同样必不死");
}

console.log("ok  白名单：必死按 at 结算且可逐帧重放、必不死一票否决、none 模式谁也不伤");

// ===========================================================================
// 六、玩家躲避窗口：提示 → 躲开 / 不躲
// ===========================================================================

const divePreset = P.divePress;
const diveEnterS = divePreset.approachM / divePreset.speed;

{
  // 不躲：弹线扫到脚下那一帧被击倒。
  const { sys, log } = MakeRig();
  const beats = [];
  sys.StrafeRun(BasicSpec({ preset: "divePress", OnPhase: (b) => beats.push(b) }));
  Step(sys, 1.0);
  Check(!sys.View().player.cued, "刚起飞还没到提示时刻");
  Step(sys, 12);
  Check(log.hints.length === 1 && log.hints[0].text === "扑入路沟", "提示逐字出了一次");
  Check(beats.includes("playerCue"), "提示那一拍有回调");
  // **提示排在开火之前**：飞机压下来的时候玩家就该看见【扑入路沟】，
  // 而不是子弹已经从身边过去之后才提示。
  Check(beats.indexOf("playerCue") < beats.indexOf("fire"), "提示排在开火之前");
  Check(log.playerHits.length === 1, "不躲就挨这一下");
  Check(beats.includes("playerHit"), "挨打那一拍有回调");
  Check(beats.indexOf("playerHit") > beats.indexOf("fire"), "挨的这一下落在扫射段里");
  Check(log.playerHits[0].info.lethal === true, "§2 原文是「被击倒」，不是擦伤");
  Check(sys.State().stats.playerHits === 1 && sys.State().stats.dodges === 0, "取证口记账正确");
}

{
  // 躲开：窗口内 Dodge 一次，一滴血不掉。
  const { sys, log } = MakeRig();
  const beats = [];
  let dodgedView = null;
  sys.StrafeRun(BasicSpec({
    preset: "divePress",
    OnPhase: (b) => beats.push(b),
    OnDodge: (view) => { dodgedView = view; },
  }));
  Check(sys.Dodge() === false, "窗口没开的时候躲不了（也不算数）");
  Step(sys, diveEnterS + 0.2);
  Check(sys.View().player.open, "窗口开着");
  Check(sys.View().player.remainS > 0, "View 里给得出还剩多久");
  Check(sys.Dodge("dive") === true, "窗口内躲得掉");
  Check(sys.Dodge("dive") === false, "躲过一次就结算了，第二次不算数");
  Check(dodgedView !== null, "OnDodge 回调拿得到 view（集成批在这里接 CarrySystem.ForceRelease）");
  Step(sys, 8);
  Check(log.playerHits.length === 0, "躲开了就一滴血不掉");
  Check(beats.includes("playerDodge") && !beats.includes("playerHit"), "只推躲开那一拍");
  Check(sys.State().lastRun.playerDodged === true, "summary 记下躲开了");
}

{
  // 集成批的两个旋钮：整条关掉、调宽窗口。
  const { sys, log } = MakeRig();
  sys.SetPlayerDamage(false);
  sys.StrafeRun(BasicSpec({ preset: "divePress" }));
  Step(sys, 14);
  Check(log.playerHits.length === 0, "SetPlayerDamage(false) 之后玩家不挨这一下");
  Check(log.hints.length === 0, "关掉之后连提示都不给（不给玩家一个假窗口）");

  const rig2 = MakeRig();
  rig2.sys.SetPlayerWindow(6);
  rig2.sys.StrafeRun(BasicSpec({ preset: "divePress" }));
  Step(rig2.sys, 0.2);
  Check(rig2.sys.View().player.cued,
    "窗口调到 6 s 之后航线一开头就给提示（默认 2.2 s 要等到关内 2.3 s）");
  Check(Math.abs(rig2.sys.View().player.windowS - 6) < 1e-6, "View 报的是调过的窗口时长");
  Check(rig2.sys.SetPlayerWindow(0) === null, "传 0 把窗口时长交还给章节数据");
}

{
  // 窗口 = [atS − windowS, atS]：提示提前 windowS 出，结算落在 atS 那一帧。
  const { sys, log } = MakeRig();
  const marks = [];
  sys.StrafeRun(BasicSpec({
    preset: "divePress",
    player: { atS: diveEnterS + 1.0, windowS: 1.2 },
    OnPhase: (b, v) => marks.push({ b, t: v.t }),
  }));
  Step(sys, 14);
  const cue = marks.find((m) => m.b === "playerCue");
  const hit = marks.find((m) => m.b === "playerHit");
  Check(cue && Math.abs(cue.t - (diveEnterS - 0.2)) < 0.05, "提示落在 atS − windowS 上");
  Check(hit && Math.abs(hit.t - (diveEnterS + 1.0)) < 0.05, "结算落在 atS 上（弹线到达那一帧）");
  Check(hit.t > cue.t, "结算永远排在提示之后");
  Check(Math.abs((hit.t - cue.t) - 1.2) < 0.05, "两者之差就是 windowS");
  Check(log.hints[0].seconds === 1.2, "HUD 提示的存活时间跟窗口一样长");
}

console.log("ok  玩家窗口：提示/躲开/被击倒三条路径、开关与窗口时长可调、先后顺序固定");

// ===========================================================================
// 七、音效降级与解析缓存
// ===========================================================================

{
  const { sys, log } = MakeRig();
  sys.StrafeRun(BasicSpec({ preset: "crowdTurn" }));
  Step(sys, 14);
  const names = new Set(log.played.map((p) => p.name));
  Check(!names.has("planeDive") && names.has("amb.planeFar"), "引擎声退到 amb.planeFar");
  Check(!names.has("strafeNear") && (names.has("type92") || names.has("type11")), "机枪退到现有配方");
  Check(!names.has("strafeDirt") && names.has("impactDirt"), "弹着噼啪退到 impactDirt");
  const picked = sys.State().sfx;
  Check(picked.engine === "amb.planeFar" && picked.dirt === "impactDirt", "解析结果记在取证口里");

  // 解析只做一次：弹着噼啪一秒放五次，播不响的那条名字整条航线只许试一遍。
  const attempts = [];
  const rig2 = MakeRig({
    Play: (name) => { attempts.push(name); return name.startsWith("strafe") || name === "planeDive" ? null : { name }; },
  });
  rig2.sys.StrafeRun(BasicSpec({ preset: "crowdTurn" }));
  Step(rig2.sys, 14);
  Check(attempts.filter((n) => n === "impactDirt").length > 3, "弹着噼啪放了好几次");
  Check(attempts.filter((n) => n === "strafeDirt").length === 1, "播不响的那条名字整条航线只试一次");
  Check(log.played.length > 0, "至少放出了几条音");
}

{
  // 实录合上之后：第一个名字就该中，备胎一次都不试。
  const attempts = [];
  const { sys } = MakeRig({ Play: (name) => { attempts.push(name); return { name }; } });
  sys.StrafeRun(BasicSpec({ preset: "crowdTurn" }));
  Step(sys, 6);
  Check(!attempts.includes("amb.planeFar") && attempts.includes("planeDive"),
    "A2 那四条合上之后走实录，不碰备胎");
  Check(attempts.includes("strafeNear") || attempts.includes("strafeFar"), "机枪走实录");
}

{
  // 近/远两条录音按听者与飞机的距离挑，不靠低通造（Data_SfxSources 的 StrafeFar 头注）。
  const crowd = P.crowdTurn;
  const Listen = (z) => {
    const heard = [];
    const rig = MakeRig({
      PlayerPos: () => ({ x: 0, y: 0, z }),
      Play: (n) => { heard.push(n); return { name: n }; },
    });
    rig.sys.StrafeRun(BasicSpec({ preset: "crowdTurn" }));
    Step(rig.sys, crowd.approachM / crowd.speed + 0.05);
    return heard;
  };
  // 开火那一帧机身在 from − leadM（z = −72）、离地 46 m。
  const near = Listen(-60);
  const far = Listen(900);
  Check(near.includes("strafeNear"), "站在弹线边上听的是近场那条录音");
  Check(!near.includes("strafeFar"), "近场就不放远场那条");
  Check(far.includes("strafeFar"), "站在九百米外听的是远场那条录音");
  Check(!far.includes("strafeNear"), "远场就不放近场那条");
}

console.log("ok  音效：四条实录优先、缺配方时退到现有最近的源、解析只做一次、近远分录音");

// ===========================================================================
// 八、打飞机：判定真的存在，但一枪也打不下来
// ===========================================================================

{
  const { sys } = MakeRig();
  sys.StrafeRun(BasicSpec({ preset: "railPass" }));
  Step(sys, P.railPass.approachM / P.railPass.speed + 0.3);
  const view = sys.View();
  const eye = { x: 0, y: 1.6, z: 0 };
  const a = view.aircraft;
  const len = Math.hypot(a.x - eye.x, a.y - eye.y, a.z - eye.z);
  const aim = { x: (a.x - eye.x) / len, y: (a.y - eye.y) / len, z: (a.z - eye.z) / len };
  const on = sys.Ping(eye, aim, 800);
  Check(on.hit === true && on.at !== null, "对着飞机开枪打得中（回执真的存在）");
  const off = sys.Ping(eye, { x: 1, y: 0, z: 0 }, 800);
  Check(off.hit === false, "打偏了就是打偏了");

  // 打一百枪也不掉一架：Ping 不改任何航线状态。
  for (let i = 0; i < 100; i += 1) sys.Ping(eye, aim, 800);
  Check(sys.Active && sys.Phase !== "done", "**步枪威胁不到它** —— 打一百枪航线照走");
  Check(sys.State().stats.pings === 101, "命中次数记了账（HUD 想给火星回执读它）");

  const behind = sys.Ping(eye, { x: -aim.x, y: -aim.y, z: -aim.z }, 800);
  Check(behind.hit === false, "背对着开枪打不中（along <= 0 那一支）");
}

console.log("ok  打飞机：命中判定存在、打偏认得出、打一百枪也击不落");

// ===========================================================================
// 九、参数校验与换关兜底
// ===========================================================================

{
  const { sys } = MakeRig();
  Check(sys.StrafeRun({}) === null, "没给线段起不来");
  Check(sys.StrafeRun({ from: { x: 0, z: 0 } }) === null, "只给起点也起不来");
  Check(sys.StrafeRun(BasicSpec({ to: { x: 0, z: 0.5 } })) === null, "半米的「线段」没有方向，起不来");
  Check(sys.StrafeRun(BasicSpec({ preset: "nosuch" })) === null, "预设名写错不许静默用默认值");
  Check(!sys.Active, "上面四条一条都没把航线起起来");

  // 必死与必不死撞了：必不死赢。
  const both = MakeNpc("both", 0, 50);
  Check(typeof sys.StrafeRun(BasicSpec({
    preset: "crowdTurn", victims: [{ ref: both, at: 0.3 }], immune: [both],
  })) === "string", "撞名单的航线照样起得来");
  Step(sys, 14);
  Check(!both.killed, "同时进两张名单时**必不死赢**（白名单不许自相矛盾）");
}

{
  // Abort：不记 finished，回调照走（集成批要知道航线被掐了）。
  const { sys, log } = MakeRig();
  sys.StrafeRun(BasicSpec({ preset: "crowdTurn", OnEnd: (s) => log.ends.push(s) }));
  Step(sys, 2);
  Check(sys.Abort("skip") === true, "掐得掉");
  Check(!sys.Active && sys.State().stats.aborted === 1 && sys.State().stats.finished === 0,
    "Abort 记 aborted 不记 finished");
  Check(log.ends.length === 1 && log.ends[0].completed === false, "OnEnd 说明这条没走完");
  Check(sys.Abort() === false, "没有航线的时候掐不掉");
}

{
  // Reset 是换关兜底：不回调、不结算、不给玩家补刀。
  const { sys, log } = MakeRig();
  sys.StrafeRun(BasicSpec({
    preset: "divePress", OnEnd: (s) => log.ends.push(s), OnPhase: (b) => log.phases.push(b),
  }));
  Step(sys, diveEnterS + divePreset.player.cueLeadS + 0.3);
  const phasesBefore = log.phases.length;
  sys.Reset("levelChange");
  Check(!sys.Active, "Reset 把航线收了");
  Check(log.ends.length === 0, "Reset 不回调 OnEnd");
  Check(log.phases.length === phasesBefore, "Reset 不推节拍");
  Check(log.playerHits.length === 0, "换关不许顺手把玩家打倒（窗口还开着也不结算）");
  Check(sys.State().stats.aborted === 0, "Reset 不记 aborted");
  Check(sys.State().sfx && Object.keys(sys.State().sfx).length === 0, "Reset 顺手清掉音效解析缓存");

  // 收完还能再起一条（换关之后下一关照样能用）。
  Check(typeof sys.StrafeRun(BasicSpec({ preset: "railPass" })) === "string", "Reset 之后还能再起");
}

{
  // 取证口是脱敏快照：不许把 run 本体、回调、白名单引用漏出去。
  const { sys } = MakeRig();
  sys.StrafeRun(BasicSpec({ preset: "crowdTurn", victims: [{ ref: MakeNpc("v"), at: 0.4 }] }));
  Step(sys, 3);
  const state = sys.State();
  Check(state.run && typeof state.run.phase === "string", "取证口带当前航线的快照");
  Check(state.run.OnPhase === undefined && state.run.victims === undefined, "回调与白名单引用不外泄");
  Check(Array.isArray(state.presets) && state.presets.length === 4, "取证口列得出四条预设");
  Check(typeof state.stats.impacts === "number" && typeof state.stats.bursts === "number",
    "取证口带累计计数（Debug.Strafe 读它）");
  Check(state.playerDamage === true && state.playerWindowS === null, "两个旋钮的当前值看得见");
}

{
  // 掉一帧（dt 被夹到 0.1）不许一次吐出上百个粒子。
  const { sys, log } = MakeRig();
  sys.StrafeRun(BasicSpec({ preset: "divePress" }));
  Step(sys, divePreset.approachM / divePreset.speed + 0.02);
  const before = log.impacts.length;
  sys.Update(2.5);                                    // 卡了两秒半的那一帧
  Check(log.impacts.length - before <= 40, "掉帧那一下的弹着点有上限（不许刷爆粒子池）");
}

console.log("ok  参数校验与换关兜底：起不来的四种、必不死优先、Abort/Reset 分账、掉帧有闸");

console.log(`\nAircraftStrafeTest 通过：${checks} 条断言`);
