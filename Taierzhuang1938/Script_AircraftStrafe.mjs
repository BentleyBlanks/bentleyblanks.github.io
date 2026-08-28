// 《滕县 一九三八》日机扫射航线 —— 脚本驱动的一次通场：进入 → 扫射 → 拉起离场。
//
// **纯规则，不许 import three。** 「飞机这一秒在哪儿、弹着点扫到哪儿、谁被打倒、
// 玩家躲没躲开」这四件事与画面无关，所以整条航线在纯 Node 里跑得完
// （回归口 `Script_AircraftStrafeTest.mjs`）。画面那一半在 `Script_Aircraft.mjs`：
// 它按本层每帧给出的 `View()` 摆那架飞机，曳光与尘土由装配层转给 Script_Vfx。
//
// ── 为什么另开一层，而不是把它塞进 Script_Aircraft ─────────────────────────────
// `Script_Aircraft.AircraftFlight` 是**纯渲染**的远方机群：绕圈、不索敌、不投弹，
// 二关到终章都靠它给天上一点动静。那一条不能动 —— 所以扫射是**叠加能力**：
// 航线活着的时候，本层点名的那一架脱离圆周被脚本接管；航线走完它回到圆周上。
// 其余两架照转。
//
// ── 三条航线（docs/Data_MissionRemake.md §2 阶段五 / 六 / 八）────────────────
// §0「明确保留的三项创作性还原」第 1 条：**日机识别出白布担架、医护人员、撤离百姓
// 之后仍主动转向扫射**。这一条不删除、不弱化、不自我辩解 —— 所以 `crowdTurn`
// 那条航线真的会打倒担架员与百姓，只是**打谁、什么时候倒，全部由脚本点名**
// （`victims` 白名单），一次随机数都不掷。画面上不做血腥特写：被点名的人走
// 现有的倒地表现（Soldier.Kill → Ragdoll + 旁边人喊），本层不出血雾。
//
//   ① railPass   第一次掠过：沿铁路打车辆，不针对任何人。纯演出 + 压迫感。
//   ② crowdTurn  转向人群：拉起、转弯、降高，弹线**沿道路追赶队列**（`chase`）。
//   ③ divePress  配合松手：弹线逼近玩家，给【扑入路沟】的窗口；不躲就被击倒。
//
// ── 白名单：脚本化牺牲不靠随机 ──────────────────────────────────────────────
// `victims: [{ ref, at }]` —— **必死**。`at` 是扫射窗口内的归一化时刻，
// 集成批照台词节拍排（担架员中弹那一声要压在罗班长喊「顺子，接后头！」之前）。
// `immune: [ref, ...]` —— **必不死**。哪怕开了 `damage.npc:"line"`（弹线沿途见人就打）
// 也碰不到他们：伤员、幺娃、罗班长这些后面还有戏的人一律进这张表。
// 默认 `damage.npc:"whitelist"`：**只有点名的人会倒**，弹线从谁身上扫过都不算数。
//
// ── 玩家伤害是一扇窗，不是一次射线 ──────────────────────────────────────────
// §2 阶段八：提示【扑入路沟】，「不躲则被击倒并从数秒前重来」。所以本层给的是
// 「提示 → 窗口 → 结算」三拍，`Dodge()` 由输入/交互侧在窗口内调一次即可。
// 开关与窗口时长归集成批：`SetPlayerDamage(false)` 整条关掉、`SetPlayerWindow(s)`
// 调宽窄。**「从数秒前重来」不在本层**：本层只把击倒回执交给 `host.HitPlayer`，
// 检查点是装配层的事（常规 respawn 会把玩家扔到路标后方，会把这一拍整个跳过去）。
//
// ── 给集成批的 CH1 摆点示例（坐标照 Data_MissionCh1.CHAPTER.zones）────────────
// 大车路一路向南（+Z），队列从涵洞 (-458,-30) 经 (-436,30) 走到路沟 (-448,130)；
// 津浦路路基在西边一线（C1_Railbed −466,−150）。三条航线**都朝 +Z 飞**，
// 与队列同向 —— 逆着飞的话弹线是迎面扫过来的，玩家看不见「它在追人」。
//
//   // 阶段五：沿路基打车辆。离队列四十多米，一个人都不伤。
//   strafe.StrafeRun({ preset: "railPass",
//     from: { x: -486, z: -60 }, to: { x: -482, z: 150 } });
//
//   // 阶段六：转向人群。弹线追队列头，担架员与一名百姓被点名。
//   strafe.StrafeRun({ preset: "crowdTurn",
//     from: { x: -440, z: 55 }, to: { x: -450, z: 165 },
//     TrackTo: () => column.HeadPosition(),          // 队列头，每帧问一次
//     victims: [{ ref: bearerB, at: 0.30 }, { ref: civilianWoman, at: 0.72 }],
//     immune: [luo, yaowa, heyoutian, woundedOnStretcher, xiaoqin],
//     OnPhase: (beat) => { if (beat === "cease") column.Scatter(); } });
//
//   // 阶段八：配合松手。弹线逼到玩家脚下，提示【扑入路沟】。
//   strafe.StrafeRun({ preset: "divePress",
//     from: { x: -444, z: 100 }, to: { x: -452, z: 195 },
//     TrackTo: () => player.position,
//     player: { atS: null },                          // 不给就落在扫射窗口的 55%
//     OnDodge: () => { carry.ForceRelease("dive"); },  // 「你的手是先松开的」
//     OnPlayerHit: () => checkpoint.Rewind(4) });      // 「从数秒前重来」——不在本层
//
// ── 音效 ────────────────────────────────────────────────────────────────────
// 四条 key 由 A2 批登记在 Data_SfxSources（PlaneDive / StrafeNear / StrafeFar /
// StrafeDirt）。**同名合成配方合上之前 `audio.Play` 会静默返回 null**，所以每条
// 都带一个「现有最近的源」当备胎（见 STRAFE_SFX），第一次播不响就换备胎并记住。

import { Mulberry32, Clamp, Clamp01, SmoothStep } from "./Script_Noise.mjs";

/** 航线的五个相位。`idle` 是没有航线时的取值。 */
export const STRAFE_PHASES = Object.freeze(["idle", "approach", "strafe", "egress", "done"]);

/**
 * 四个关键节拍（`OnPhase(beat, view)` 的第一个参数，也是 `signals` 表的键）。
 * 另有三条只在玩家那一段出现：`playerCue` / `playerDodge` / `playerHit`。
 */
export const STRAFE_BEATS = Object.freeze(["enter", "fire", "cease", "exit"]);

/**
 * 音效档案。每条两个名字：**先播 A2 批那条实录，播不响就退到现有最近的源**。
 *   planeDive  ← amb.planeFar   同一架飞机的远场盘旋（环境包里那条）
 *   strafeNear ← type92         九二式重机的近射；航空机枪没有单独的合成配方
 *   strafeFar  ← type11         十一年式，机械噪声重、远场糊得开
 *   strafeDirt ← impactDirt     单发打土，连着触发就是一串
 */
export const STRAFE_SFX = Object.freeze({
  engine: { names: ["planeDive", "amb.planeFar"], volume: 0.95 },
  gunNear: { names: ["strafeNear", "type92"], volume: 0.95, burst: 3 },
  gunFar: { names: ["strafeFar", "type11"], volume: 0.8, burst: 3 },
  dirt: { names: ["strafeDirt", "impactDirt"], volume: 0.85 },
  flesh: { names: ["impactFlesh"], volume: 0.9 },
});

/** 近/远两条机枪录音的分界（米）。与 Script_Audio 的 GUN_NEAR_M 不是同一本账：
 *  这挺枪在**天上**，一百米外就只剩尾巴了。 */
const GUN_NEAR_M = 110;

/**
 * 航线默认值。数值只在这里，文档里只写常量名（AGENTS 硬规矩 12）。
 *
 * speed        通场速度（m/s）。96 ≈ 345 km/h，九七式轻轰的巡航量级。
 * altitudeM    扫射段离地高度。低到能看清机腹，高到不至于撞树。
 * entryAltM    远方接近时的高度；approachM 这一段一路降到 altitudeM。
 * exitAltM     拉起离场爬到的高度（与 Data_AircraftAssets 的盘旋高度同量级，
 *              这样航线走完那一架归队时不至于凭空掉两百米）。
 * approachM    进入航线的前置直线距离；除以 speed 就是「远方接近」那几秒。
 * exitM        离场直线距离。
 * leadM        弹着点比机身**超前**多少。俯角 = atan(altitudeM / leadM)：
 *              60 / 95 ≈ 32°，正是低空扫射的角度。给反了（弹着落在机身后面）
 *              的话，画面上就成了「飞机在追自己的弹」。
 * burstS/gapS  连发与停顿。航空机枪 ~900 rpm，逐发排会被音频预算闸吃掉一半，
 *              所以声音走**成段**的三连发，画面走 impactHz 的弹着点。
 * impactHz     每秒落几个弹着尘土点（连发段内）。
 * tracerHz     每秒画几条曳光。曳光比弹着稀是对的：不是每发都是曳光弹。
 * spreadM      弹着点在弹线两侧的横向散布半宽。
 * lethalRadiusM  `damage.npc:"line"` 时弹线两侧多宽算打着。
 * chase        弹线追不追（第二轮追人群那一条）。
 * chaseTurnRateRad  弹线每秒最多拐多少 —— 它是一梭子子弹，不是遥控导弹。
 */
export const STRAFE_DEFAULTS = Object.freeze({
  aircraftId: "NakajimaKi43",
  speed: 96,
  altitudeM: 60,
  entryAltM: 190,
  exitAltM: 215,
  approachM: 430,
  exitM: 540,
  leadM: 95,
  entryBankRad: 0,
  exitBankRad: 0.55,
  burstS: 0.55,
  gapS: 0.28,
  impactHz: 15,
  tracerHz: 5,
  spreadM: 1.6,
  lethalRadiusM: 5.5,
  chase: false,
  chaseTurnRateRad: 0.55,
  cueText: null,
});

/**
 * 玩家那一段的默认窗口。
 *
 * **窗口是 [atS − windowS, atS]，不是 [提示, 提示 + 时长]。**
 * `atS` 是**弹线扫到玩家脚下**的那一刻（不给就落在扫射窗口的 55%），
 * 窗口在它之前 windowS 秒打开并给出提示。这样两件事同时成立：
 *   · 提示出现在飞机压下来的时候（玩家还看得见它拐过来），不是子弹已经过去之后；
 *   · 没躲的那一下**正好落在弹线到达的那一帧**，不是拖到扫射结束以后再补一枪。
 * 「调窗口时长」就是调 windowS：调大 = 提示更早、给的反应时间更长，落点不变。
 */
export const STRAFE_PLAYER_DEFAULTS = Object.freeze({
  enabled: false,
  damage: 96,          // 一发够把满血的人打到重伤边缘；真正的「击倒」由 lethal 决定
  lethal: true,        // §2 原文「不躲则被击倒」——不是擦伤
  windowS: 2.2,        // 提示提前多久出来 = 有多久可以躲
  part: "torso",
});

/**
 * 三条预设（docs/Data_MissionRemake.md §2 阶段五 / 六 / 八）。
 * 每条只写与默认值不同的字段；`signals` 里的名字与 Data_MissionCh1.EVENTS 逐条对应。
 */
export const STRAFE_PRESETS = Object.freeze({
  // ── 阶段五｜第一次掠过 ─────────────────────────────────────────────────────
  // 沿铁路/大车路打**车辆**，不针对队列。玩家可以开枪，步枪威胁不到它
  // （Ping() 有回执但永远打不下来）。这一条一个人都不许伤到。
  railPass: Object.freeze({
    id: "railPass",
    label: "第一次掠过 · 沿铁路打车辆",
    aircraftId: "MitsubishiKi30",   // 九七式轻轰：打车辆的是它，不是战斗机
    speed: 104,
    altitudeM: 78,
    approachM: 520,
    exitM: 620,
    leadM: 118,
    burstS: 0.7, gapS: 0.45,
    impactHz: 13, tracerHz: 4,
    spreadM: 2.4,
    chase: false,
    damage: Object.freeze({ npc: "none", player: false }),
    signals: Object.freeze({ enter: "AircraftFirstPass" }),
    note: "不打人：damage.npc = none。压迫感全在引擎声与弹着线离队列多远。",
  }),

  // ── 阶段六｜转向伤员与百姓 ─────────────────────────────────────────────────
  // 拉起、转弯、降高，重新对准大车路上的人群；**弹线沿道路追赶队列**。
  // 转向那一刻起飞机必须在玩家的自由视角里看得见 —— 所以进入段慢、压得低、
  // 带一个大坡度的转弯（entryBankRad）。
  crowdTurn: Object.freeze({
    id: "crowdTurn",
    label: "转向人群 · 弹线追着队列走",
    aircraftId: "NakajimaKi43",
    speed: 82,
    altitudeM: 46,
    entryAltM: 150,
    approachM: 400,
    exitM: 520,
    leadM: 72,
    entryBankRad: 0.85,             // 转弯：这一下是玩家「看见它拐回来」的全部
    burstS: 0.85, gapS: 0.22,
    impactHz: 18, tracerHz: 6,
    spreadM: 1.4,
    chase: true,
    chaseTurnRateRad: 0.7,
    damage: Object.freeze({ npc: "whitelist", player: false }),
    signals: Object.freeze({ enter: "AircraftTurnCrowd" }),
    note: "victims 由集成批点名（担架员/百姓）；伤员、幺娃、罗班长一律进 immune。",
  }),

  // ── 阶段八｜配合松手 ───────────────────────────────────────────────────────
  // 第三次进入攻击航线，弹线**逼近玩家**。提示【扑入路沟】，不躲则被击倒。
  // 躲开之后由集成批接 OnDodge → CarrySystem.ForceRelease("dive")：
  // 「你的手是先松开的」是剧情要求，不是玩家操作失误。
  divePress: Object.freeze({
    id: "divePress",
    label: "配合松手 · 弹线逼到脚下",
    aircraftId: "NakajimaKi43",
    speed: 88,
    altitudeM: 38,
    entryAltM: 130,
    approachM: 330,
    exitM: 500,
    leadM: 58,
    entryBankRad: 0.35,
    burstS: 1.0, gapS: 0.18,
    impactHz: 20, tracerHz: 7,
    spreadM: 1.1,
    chase: true,
    chaseTurnRateRad: 0.5,
    cueText: "扑入路沟",
    damage: Object.freeze({ npc: "whitelist", player: true }),
    player: Object.freeze({ enabled: true, windowS: 2.2 }),
    signals: Object.freeze({ enter: "DiveCue" }),
    note: "玩家伤害的总开关在 SetPlayerDamage()，窗口时长在 SetPlayerWindow()。",
  }),

  // ── 第二关阶段一｜只有飞越声 ───────────────────────────────────────────────
  // §3 阶段一：「空中再现飞机声时幺娃下意识抬头骂『妈卖批，又来了？』
  // （心理残留，即使飞机不攻击）」。所以这一条 `guns:false` —— 高空过一趟，
  // 一发不打、一处弹着都不落，只有引擎声与一个从头顶掠过的黑影。
  // 那句台词的分量全在「它这次没打」上，落一颗弹就把这一拍毁了。
  flybyOnly: Object.freeze({
    id: "flybyOnly",
    label: "只有飞越声 · 心理残留",
    aircraftId: "MitsubishiKi21Ia",   // 高空重轰：只是路过，不是来找你的
    speed: 118,
    altitudeM: 150,
    entryAltM: 205,
    exitAltM: 235,
    approachM: 700,
    exitM: 820,
    leadM: 0,                         // 不开枪，就没有「弹着超前」这回事
    exitBankRad: 0.2,
    guns: false,
    chase: false,
    damage: Object.freeze({ npc: "none", player: false }),
    note: "二关到终章的氛围过场都可以用它；不给 signals，章节自己接 OnPhase。",
  }),
});

// ---------------------------------------------------------------------------
// 小工具（全是纯算术；本层一个 three 类型都不碰）
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

/** 把角差折回 (-π, π]，免得从 179° 转到 -179° 走了一圈。 */
function WrapAngle(a) {
  let v = a % TAU;
  if (v > Math.PI) v -= TAU;
  if (v <= -Math.PI) v += TAU;
  return v;
}

function Num(value, fallback) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

/** 只取 x/z 的点；y 由 GroundHeight 补。 */
function Flat(point) {
  if (!point) return null;
  return { x: Num(point.x, 0), z: Num(point.z, 0) };
}

// ---------------------------------------------------------------------------
// 航线
// ---------------------------------------------------------------------------

/**
 * host 是装配层注入的窄接口（同 CarrySystem / EmplacementSystem 的约定）。
 * 每一条都是可选的：全不给也跑得完整条航线（纯规则测试就是这么跑的）。
 *
 *   Time() -> number                    关内秒表（取证用）
 *   Play(name, opts) -> voice|null      放一条音效；返回假值 = 这条没响
 *   Hint(text, seconds)                 HUD 一次性提示（【扑入路沟】）
 *   Say(who, text, seconds)             让人喊一句
 *   Signal(name)                        推一条 story 事件
 *   Tracer(from, to, opts)              画一条曳光
 *   Impact(point, normal, surface)      落一处弹着尘土
 *   GroundHeight(x, z) -> number        地面高度；不给按 0
 *   HitNpc(ref, info) -> bool           打倒一名 NPC；不给走内置的鸭子类型兜底
 *   HitPlayer(damage, dir, info)        打倒玩家
 *   PlayerPos() -> {x,y,z}              玩家位置（默认落点、音效定位）
 *   Soldiers() -> array                 damage.npc:"line" 才用得到
 */
export class AircraftStrafeDirector {
  constructor(host = {}, opts = {}) {
    this.host = host;
    /** 当前航线；null = 天上只有绕圈的那几架。 */
    this.run = null;
    this.serial = 0;
    /** 弹着散布的随机源。**只用来抖弹着点**，一个玩法判定都不许读它。 */
    this.rnd = Mulberry32(Num(opts.seed, 19380314) >>> 0);
    /** 集成批的两个旋钮（见文件头）。 */
    this.playerDamage = opts.playerDamage !== false;
    this.playerWindowS = Num(opts.playerWindowS, 0) > 0 ? Number(opts.playerWindowS) : null;
    /** 音效解析结果：哪条 key 真的响过。一条只解析一次。 */
    this.sfxPick = new Map();
    this.stats = {
      runs: 0, finished: 0, aborted: 0, bursts: 0, impacts: 0, tracers: 0,
      npcHits: 0, npcKills: 0, playerHits: 0, dodges: 0, cues: 0, pings: 0,
    };
    /** 最后一条走完的航线的取证记录。 */
    this.lastRun = null;
  }

  get Active() { return !!this.run; }
  get Phase() { return this.run ? this.run.phase : "idle"; }
  get RunId() { return this.run ? this.run.id : null; }
  get Firing() { return !!this.run && this.run.phase === "strafe" && this.run.burstOn; }

  Time() { return Num(this.host.Time?.(), 0); }

  // -------------------------------------------------------------------------
  // 主 API
  // -------------------------------------------------------------------------

  /**
   * 起一条扫射航线。
   *
   * @param {object} spec
   *   preset        STRAFE_PRESETS 的键；给了就先铺预设再让 spec 覆盖
   *   from / to     地面线段的起止点 {x, z}（弹线扫过的那一条）
   *   speed / altitudeM / approachM / exitM / leadM …   见 STRAFE_DEFAULTS
   *   fireFromS     扫射起始时刻（关内秒，自航线起点算）；默认 = 走完 approachM
   *   fireToS       扫射结束时刻；默认 = 弹线扫完整条线段
   *   chase         弹线追不追；true 时每帧问 TrackTo() 要一个新的落点
   *   TrackTo()     -> {x, z}   被追的那一头（队列头、玩家、任意点）
   *   damage        { npc: "none"|"whitelist"|"line", player: bool }
   *   victims       [{ ref, at, damage, lethal }]  **必死**名单，at ∈ [0,1]
   *   immune        [ref, ...]                     **必不死**名单
   *   guns          false = 一发不打（只有飞越声）；默认 true
   *   player        { enabled, atS, windowS, damage, lethal }
   *                 窗口 = [atS − windowS, atS]，见 STRAFE_PLAYER_DEFAULTS
   *   signals       { enter, fire, cease, exit }   → host.Signal(name)
   *   OnPhase(beat, view)                          四个节拍 + 玩家那三条
   *   OnDodge(view) / OnPlayerHit(view)
   *   OnEnd(summary)                               结束回调
   * @returns {string|null} 航线 id；起不来返回 null
   */
  StrafeRun(spec = {}) {
    if (this.run) return null;                       // 同时只跑一条：两条弹线谁也读不清
    const preset = spec.preset ? STRAFE_PRESETS[spec.preset] : null;
    if (spec.preset && !preset) return null;
    const cfg = { ...STRAFE_DEFAULTS, ...(preset || {}), ...spec };
    const from = Flat(cfg.from);
    const to = Flat(cfg.to);
    if (!from || !to) return null;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthM = Math.hypot(dx, dz);
    if (!(lengthM > 1)) return null;                 // 一米以内的「线段」没有方向可言

    const speed = Math.max(8, Num(cfg.speed, STRAFE_DEFAULTS.speed));
    const approachM = Math.max(0, Num(cfg.approachM, STRAFE_DEFAULTS.approachM));
    const exitM = Math.max(0, Num(cfg.exitM, STRAFE_DEFAULTS.exitM));
    const enterS = approachM / speed;
    const fireFromS = Math.max(0, Num(cfg.fireFromS, enterS));
    const fireToS = Math.max(fireFromS + 0.05, Num(cfg.fireToS, fireFromS + lengthM / speed));
    const exitS = exitM / speed;

    const damage = { npc: "none", player: false, ...(preset?.damage || {}), ...(spec.damage || {}) };
    const playerCfg = {
      ...STRAFE_PLAYER_DEFAULTS,
      ...(preset?.player || {}),
      ...(spec.player || {}),
    };
    // 集成批的窗口时长覆盖章节数据；关掉玩家伤害是**一票否决**。
    if (this.playerWindowS !== null) playerCfg.windowS = this.playerWindowS;
    const playerOn = !!damage.player && playerCfg.enabled !== false && this.playerDamage;
    const playerAtS = Num(playerCfg.atS, fireFromS + (fireToS - fireFromS) * 0.55);

    const immune = new Set();
    for (const ref of cfg.immune || []) if (ref) immune.add(ref);
    const victims = [];
    for (const raw of cfg.victims || []) {
      const ref = raw && (raw.ref ?? raw.target ?? raw);
      if (!ref || immune.has(ref)) continue;          // 必不死压过必死：白名单不许自相矛盾
      victims.push({
        ref,
        at: Clamp01(Num(raw.at, victims.length ? 1 : 0.5)),
        damage: Num(raw.damage, 140),
        lethal: raw.lethal !== false,
        part: raw.part || "torso",
        struck: false,
      });
    }
    victims.sort((a, b) => a.at - b.at);

    this.serial += 1;
    const heading = Math.atan2(dx, dz);              // 数学角：forward = (sin, cos)
    this.run = {
      id: `strafe${this.serial}`,
      presetId: preset ? preset.id : (spec.preset || null),
      label: String(cfg.label || "扫射航线"),
      aircraftId: String(cfg.aircraftId || STRAFE_DEFAULTS.aircraftId),
      cfg,
      from, to, lengthM,
      speed, approachM, exitM, leadM: Math.max(0, Num(cfg.leadM, STRAFE_DEFAULTS.leadM)),
      altitudeM: Num(cfg.altitudeM, STRAFE_DEFAULTS.altitudeM),
      entryAltM: Num(cfg.entryAltM, STRAFE_DEFAULTS.entryAltM),
      exitAltM: Num(cfg.exitAltM, STRAFE_DEFAULTS.exitAltM),
      entryBankRad: Num(cfg.entryBankRad, 0),
      exitBankRad: Num(cfg.exitBankRad, 0),
      burstS: Math.max(0.05, Num(cfg.burstS, STRAFE_DEFAULTS.burstS)),
      gapS: Math.max(0.02, Num(cfg.gapS, STRAFE_DEFAULTS.gapS)),
      impactHz: Math.max(1, Num(cfg.impactHz, STRAFE_DEFAULTS.impactHz)),
      tracerHz: Math.max(0, Num(cfg.tracerHz, STRAFE_DEFAULTS.tracerHz)),
      spreadM: Math.max(0, Num(cfg.spreadM, STRAFE_DEFAULTS.spreadM)),
      lethalRadiusM: Math.max(0.5, Num(cfg.lethalRadiusM, STRAFE_DEFAULTS.lethalRadiusM)),
      guns: cfg.guns !== false,
      chase: !!cfg.chase,
      chaseTurnRateRad: Math.max(0, Num(cfg.chaseTurnRateRad, STRAFE_DEFAULTS.chaseTurnRateRad)),
      TrackTo: typeof cfg.TrackTo === "function" ? cfg.TrackTo : null,
      damage,
      victims, immune,
      lineHit: new Set(),
      player: {
        on: playerOn,
        atS: playerAtS,
        windowS: Math.max(0.1, Num(playerCfg.windowS, STRAFE_PLAYER_DEFAULTS.windowS)),
        damage: Num(playerCfg.damage, STRAFE_PLAYER_DEFAULTS.damage),
        lethal: playerCfg.lethal !== false,
        part: playerCfg.part || "torso",
        cued: false, open: false, dodged: false, resolved: false, hit: false,
      },
      cueText: cfg.cueText || null,
      signals: { ...(preset?.signals || {}), ...(spec.signals || {}) },
      OnPhase: typeof cfg.OnPhase === "function" ? cfg.OnPhase : null,
      OnDodge: typeof cfg.OnDodge === "function" ? cfg.OnDodge : null,
      OnPlayerHit: typeof cfg.OnPlayerHit === "function" ? cfg.OnPlayerHit : null,
      OnEnd: typeof cfg.OnEnd === "function" ? cfg.OnEnd : null,
      // 运行态
      t: 0, phase: "approach", fireFromS, fireToS, exitS, enterS,
      heading,
      impact: { x: from.x, z: from.z },
      lastImpact: { x: from.x, z: from.z },
      sweptM: 0,
      burstOn: false, burstT: 0, emitAcc: 0, tracerAcc: 0,
      air: { x: 0, y: 0, z: 0, agl: 0, dirX: Math.sin(heading), dirZ: Math.cos(heading), climb: 0, bank: 0 },
      beats: [],
      beganAt: this.Time(),
    };
    this.stats.runs += 1;
    this.PlaceAircraft(0);
    this.Beat("enter");
    // 引擎声由远及近：**多普勒是录出来的**（Data_SfxSources 的 PlaneDive 头注：
    // 那条 7 秒的通场从 −36 dB 涨到 −9 dB 再落回 −34 dB），所以这里只放一条、
    // 不做变调 —— 变调做出来的多普勒一听就是合成器。
    //
    // 定位取**扫射线段的中点**，不取航线起点：那条录音的响度峰值在 3.5 s 处，
    // 而进入段本来就是几秒钟，峰值正好落在飞机压到人头顶的时候。挂在四百米外的
    // 起点上的话，最响的那一下会从一个错误的方向传过来。
    this.Sfx("engine", {
      position: {
        x: (from.x + to.x) * 0.5,
        y: this.Ground((from.x + to.x) * 0.5, (from.z + to.z) * 0.5) + this.run.altitudeM,
        z: (from.z + to.z) * 0.5,
      },
      volume: 0.9,
    });
    return this.run.id;
  }

  /** 玩家扑入路沟。窗口开着才算数；返回躲没躲成。 */
  Dodge(reason = "player") {
    const run = this.run;
    if (!run || !run.player.open || run.player.resolved) return false;
    run.player.dodged = true;
    run.player.dodgeReason = reason;
    this.stats.dodges += 1;
    this.ResolvePlayer();
    return true;
  }

  /** 玩家伤害的总开关（集成批用；下一条航线起效）。 */
  SetPlayerDamage(on) {
    this.playerDamage = on !== false;
    if (this.run && !this.playerDamage) this.run.player.on = false;
    return this.playerDamage;
  }

  /** 躲避窗口时长（秒）。传 0 / null 交还给章节数据。 */
  SetPlayerWindow(seconds) {
    const v = Number(seconds);
    this.playerWindowS = Number.isFinite(v) && v > 0 ? v : null;
    if (this.run && this.playerWindowS !== null && !this.run.player.cued) {
      this.run.player.windowS = this.playerWindowS;
    }
    return this.playerWindowS;
  }

  /**
   * 玩家朝飞机开的那一枪。§2 阶段五原文：「玩家可射击但步枪无法威胁飞机」——
   * **命中判定要真的存在**（不然玩家以为是 bug），但**永远打不下来**。
   * 返回 { hit, at, distance }；hit 时装配层可以给一记跳弹火星。
   */
  Ping(origin, dir, maxDistM = 500) {
    const run = this.run;
    if (!run || !origin || !dir) return { hit: false, at: null, distance: 0 };
    const a = run.air;
    const ox = Num(origin.x, 0), oy = Num(origin.y, 0), oz = Num(origin.z, 0);
    let dxn = Num(dir.x, 0), dyn = Num(dir.y, 0), dzn = Num(dir.z, 0);
    const len = Math.hypot(dxn, dyn, dzn);
    if (!(len > 1e-6)) return { hit: false, at: null, distance: 0 };
    dxn /= len; dyn /= len; dzn /= len;
    const rx = a.x - ox, ry = a.y - oy, rz = a.z - oz;
    const along = rx * dxn + ry * dyn + rz * dzn;
    const distance = Math.hypot(rx, ry, rz);
    if (along <= 0 || along > maxDistM) return { hit: false, at: null, distance };
    const px = ox + dxn * along, py = oy + dyn * along, pz = oz + dzn * along;
    const miss = Math.hypot(a.x - px, a.y - py, a.z - pz);
    // 半径 6 m：一架单发战斗机的翼展量级。命中只出火星，血量一点不掉。
    const hit = miss <= 6;
    if (hit) this.stats.pings += 1;
    return { hit, at: hit ? { x: px, y: py, z: pz } : null, distance, miss };
  }

  /** 提前掐掉（换关、剧情跳过）。不记 finished。 */
  Abort(reason = "abort") {
    if (!this.run) return false;
    this.stats.aborted += 1;
    this.Finish(reason, false);
    return true;
  }

  /** 换关 / 复活 / 出错时的兜底：不记 aborted，也不回调。 */
  Reset(reason = "reset") {
    if (this.run) {
      this.run.OnEnd = null;
      this.run.OnPhase = null;
      this.Finish(reason, false);
    }
    this.sfxPick.clear();
    return true;
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  /**
   * 推一帧。**排在玩家死亡判定之前**（它打得倒玩家），排在过场/暂停分支**之后**
   * （航线是玩法，不是天上的环境；暂停时它必须停在原地）。
   */
  Update(dt) {
    const run = this.run;
    if (!run) return null;
    const step = Clamp(Num(dt, 0), 0, 0.1);
    run.t += step;

    if (run.phase === "approach") {
      if (run.t >= run.fireFromS) {
        run.phase = "strafe";
        run.burstOn = run.guns; run.burstT = 0; run.emitAcc = 0; run.tracerAcc = 0;
        this.PlaceAircraft(step);
        this.Beat("fire");
        // `guns:false`（二关那条只有飞越声的）一发不打 —— 连节拍都照推，
        // 章节侧接的是「它又来了」这件事，不是「它开枪了」。
        if (run.guns) this.PlayGuns();
      } else {
        this.PlaceAircraft(step);
      }
    } else if (run.phase === "strafe") {
      this.StepStrafe(step);
      if (run.t >= run.fireToS) {
        run.burstOn = false;
        run.phase = "egress";
        this.Beat("cease");
      }
    } else if (run.phase === "egress") {
      this.PlaceAircraft(step);
      if (run.t >= run.fireToS + run.exitS) {
        this.Beat("exit");
        this.Finish("done", true);
        return null;
      }
    }
    // 玩家那一段的三拍与相位无关（提示可能落在进入段的尾巴上）。
    this.StepPlayerWindow();
    return this.View();
  }

  /** 扫射段：推弹着点、发弹着与曳光、结算白名单。 */
  StepStrafe(step) {
    const run = this.run;
    run.lastImpact.x = run.impact.x;
    run.lastImpact.z = run.impact.z;

    // 弹线的朝向。追人群那一条每帧把机头往被追的那个点上拧一点点，
    // 但拧的速度有上限 —— 它是一梭子子弹，不是遥控导弹。
    if (run.chase) {
      const aim = run.TrackTo ? Flat(run.TrackTo()) : run.to;
      if (aim) {
        const ax = aim.x - run.impact.x;
        const az = aim.z - run.impact.z;
        // 被追的那一头必须还在**前方**：弹线追过头了就让它飞出去，不许掉头回来扫。
        // 没有这一条，弹着点越过队列头之后 want 会翻到 ±π，整条线原地打转。
        const ahead = ax * Math.sin(run.heading) + az * Math.cos(run.heading);
        if (ahead > 0 && Math.hypot(ax, az) > 1e-3) {
          const want = Math.atan2(ax, az);
          const delta = WrapAngle(want - run.heading);
          const most = run.chaseTurnRateRad * step;
          run.heading += Clamp(delta, -most, most);
        }
      }
    }
    const dirX = Math.sin(run.heading);
    const dirZ = Math.cos(run.heading);
    const advance = run.speed * step;
    run.impact.x += dirX * advance;
    run.impact.z += dirZ * advance;
    run.sweptM += advance;

    this.PlaceAircraft(step, dirX, dirZ);

    // `guns:false` 到此为止：不响、不落弹着、**也不结算任何人**。
    // 「一发不打」就是一发不打 —— 白名单在这条航线上不生效。
    if (!run.guns) return;

    // 连发节拍。声音走成段的三连发（Data_SfxSources 的 StrafeNear 头注），
    // 画面走 impactHz 的弹着点 —— 两者不必逐发对齐，也对不齐。
    run.burstT += step;
    if (run.burstOn && run.burstT >= run.burstS) {
      run.burstOn = false; run.burstT = 0;
    } else if (!run.burstOn && run.burstT >= run.gapS) {
      run.burstOn = true; run.burstT = 0;
      this.PlayGuns();
    }
    if (run.burstOn) {
      run.emitAcc += step * run.impactHz;
      run.tracerAcc += step * run.tracerHz;
      let guard = 32;                                 // 掉一帧也不许一次吐出上百个粒子
      while (run.emitAcc >= 1 && guard-- > 0) {
        run.emitAcc -= 1;
        this.EmitImpact(dirX, dirZ);
      }
      if (run.emitAcc > 1) run.emitAcc = 0;
      guard = 12;
      while (run.tracerAcc >= 1 && guard-- > 0) {
        run.tracerAcc -= 1;
        this.EmitTracer();
      }
      if (run.tracerAcc > 1) run.tracerAcc = 0;
    }

    this.StepVictims();
    if (run.damage.npc === "line") this.StepLineDamage();
  }

  /** 白名单：到点就倒。**一次随机数都不掷。** */
  StepVictims() {
    const run = this.run;
    if (run.damage.npc === "none" || !run.victims.length) return;
    const span = Math.max(1e-3, run.fireToS - run.fireFromS);
    const u = Clamp01((run.t - run.fireFromS) / span);
    for (const v of run.victims) {
      if (v.struck || u < v.at) continue;
      v.struck = true;
      this.StrikeNpc(v.ref, { damage: v.damage, lethal: v.lethal, part: v.part, scripted: true });
    }
  }

  /** `damage.npc:"line"` —— 弹线沿途见人就打（immune 名单除外）。默认不开。 */
  StepLineDamage() {
    const run = this.run;
    const soldiers = this.host.Soldiers?.();
    if (!Array.isArray(soldiers) || !soldiers.length) return;
    const ax = run.lastImpact.x, az = run.lastImpact.z;
    const bx = run.impact.x, bz = run.impact.z;
    const sx = bx - ax, sz = bz - az;
    const segLen2 = sx * sx + sz * sz;
    for (const s of soldiers) {
      if (!s || s.alive === false || run.immune.has(s) || run.lineHit.has(s)) continue;
      const px = Num(s.position?.x, 0) - ax;
      const pz = Num(s.position?.z, 0) - az;
      const u = segLen2 > 1e-6 ? Clamp01((px * sx + pz * sz) / segLen2) : 0;
      const d = Math.hypot(px - sx * u, pz - sz * u);
      if (d > run.lethalRadiusM) continue;
      run.lineHit.add(s);
      this.StrikeNpc(s, { damage: 140, lethal: true, part: "torso", scripted: false });
    }
  }

  /**
   * 打倒一名 NPC。走 host.HitNpc；不给就用鸭子类型兜底（TakeHit → 还站着就 Kill）。
   * **必死是「必」**：`lethal` 时不看伤害够不够，直接把人放倒 ——
   * 脚本化牺牲不许被血量表决。
   */
  StrikeNpc(ref, info) {
    if (!ref || this.run?.immune.has(ref)) return false;
    const dir = this.HitDirection(ref);
    this.stats.npcHits += 1;
    let died = false;
    if (typeof this.host.HitNpc === "function") {
      died = !!this.host.HitNpc(ref, { ...info, dir });
    } else {
      if (typeof ref.TakeHit === "function") died = !!ref.TakeHit(info.damage, info.part, dir);
      if (!died && info.lethal && typeof ref.Kill === "function") died = !!ref.Kill(dir);
    }
    if (died) this.stats.npcKills += 1;
    // 被打中的那一下要听得见；倒地表现走现有那一套（Ragdoll + 旁边人喊），
    // 本层不出血雾 —— §0 的口径是不做血腥特写。
    const at = ref.position ? { x: Num(ref.position.x, 0), y: Num(ref.position.y, 0) + 1, z: Num(ref.position.z, 0) } : null;
    this.Sfx("flesh", { position: at, volume: 0.85 });
    return died;
  }

  /** 玩家那一段：提示 → 窗口 → 结算。三拍都可能落在进入段与扫射段的交界上。 */
  StepPlayerWindow() {
    const run = this.run;
    if (!run) return;
    const p = run.player;
    if (!p.on || p.resolved) return;
    // 窗口 = [atS − windowS, atS]：提示在飞机压下来的时候出，结算落在弹线到达那一帧。
    if (!p.cued && run.t >= p.atS - p.windowS) {
      p.cued = true;
      p.open = true;
      p.closeAt = p.atS;
      this.stats.cues += 1;
      if (run.cueText) this.host.Hint?.(run.cueText, p.windowS);
      this.Beat("playerCue");
    }
    if (p.open && run.t >= p.closeAt) this.ResolvePlayer();
  }

  /** 窗口关上（或玩家躲了）那一下的结算。 */
  ResolvePlayer() {
    const run = this.run;
    const p = run.player;
    if (p.resolved) return;
    p.resolved = true;
    p.open = false;
    if (p.dodged) {
      run.OnDodge?.(this.View());
      this.Beat("playerDodge");
      return;
    }
    p.hit = true;
    this.stats.playerHits += 1;
    const at = this.AirPoint();
    const target = this.PlayerPoint();
    const dir = this.Direction(at, target);
    this.host.HitPlayer?.(p.damage, dir, {
      from: at, part: p.part, lethal: p.lethal, runId: run.id, strafe: true,
    });
    run.OnPlayerHit?.(this.View());
    this.Beat("playerHit");
  }

  // -------------------------------------------------------------------------
  // 几何
  // -------------------------------------------------------------------------

  /**
   * 把飞机摆到这一秒该在的位置。
   *
   * 三段各有各的算法：
   *   approach  沿 from→to 的直线从 −(approachM + leadM) 推到 −leadM，高度一路降下来
   *   strafe    机身 = 弹着点往后退 leadM（俯角就是这么定的），高度维持
   *   egress    顺着最后那个航向继续飞，一路爬到 exitAltM 并压坡度离场
   */
  PlaceAircraft(step, dirX = null, dirZ = null) {
    const run = this.run;
    const a = run.air;
    const dx = dirX === null ? Math.sin(run.heading) : dirX;
    const dz = dirZ === null ? Math.cos(run.heading) : dirZ;
    const prevY = a.y;
    if (run.phase === "approach") {
      // **进入段按比例走，不按速度积分**：这样不论 fireFromS 被章节改成多少，
      // 这一段的终点永远是 from − dir·leadM —— 也就是扫射段第一帧的机位。
      // 按 speed·t 算的话，改了 fireFromS 就会在开火那一帧瞬移一截。
      const p = run.fireFromS > 1e-3 ? Clamp01(run.t / run.fireFromS) : 1;
      const s = -(run.approachM + run.leadM) + run.approachM * p;
      a.x = run.from.x + dx * s;
      a.z = run.from.z + dz * s;
      a.agl = run.entryAltM + (run.altitudeM - run.entryAltM) * SmoothStep(0, 1, p);
      a.bank = run.entryBankRad * Math.sin(Math.PI * p);
    } else if (run.phase === "strafe") {
      a.x = run.impact.x - dx * run.leadM;
      a.z = run.impact.z - dz * run.leadM;
      a.agl = run.altitudeM;
      a.bank = 0;
    } else {
      const eT = Math.max(0, run.t - run.fireToS);
      a.x += dx * run.speed * step;
      a.z += dz * run.speed * step;
      const q = run.exitS > 1e-3 ? Clamp01(eT / run.exitS) : 1;
      a.agl = run.altitudeM + (run.exitAltM - run.altitudeM) * SmoothStep(0, 1, q);
      a.bank = run.exitBankRad * Math.sin(Math.PI * q);
    }
    a.dirX = dx; a.dirZ = dz;
    a.y = this.Ground(a.x, a.z) + a.agl;
    // 爬升角：高度变化 / 水平位移。零步长（起飞那一帧）不算，免得除出无穷大。
    const horizM = run.speed * step;
    a.climb = horizM > 1e-4 ? Math.atan2(a.y - prevY, horizM) : 0;
  }

  /** 落一处弹着尘土。横向散布是唯一用到随机的地方，且只影响画面。 */
  EmitImpact(dirX, dirZ) {
    const run = this.run;
    const lateral = (this.rnd() - 0.5) * 2 * run.spreadM;
    const along = (this.rnd() - 0.5) * run.spreadM;
    const x = run.impact.x - dirZ * lateral + dirX * along;
    const z = run.impact.z + dirX * lateral + dirZ * along;
    const y = this.Ground(x, z);
    this.stats.impacts += 1;
    this.host.Impact?.({ x, y, z }, { x: 0, y: 1, z: 0 }, "dirt");
    // 「噼啪」那一串按 impactHz 的三分之一放，逐个放就成了噪声墙。
    if (this.stats.impacts % 3 === 0) this.Sfx("dirt", { position: { x, y, z }, volume: 0.7 });
  }

  /** 从机腹拉一条曳光到弹着点。日方是冷白（Script_Vfx 的 kind:"ija"）。 */
  EmitTracer() {
    const run = this.run;
    const a = run.air;
    const from = { x: a.x + a.dirX * 3.2, y: a.y - 0.8, z: a.z + a.dirZ * 3.2 };
    const to = { x: run.impact.x, y: this.Ground(run.impact.x, run.impact.z) + 0.1, z: run.impact.z };
    this.stats.tracers += 1;
    this.host.Tracer?.(from, to, { speed: 620, kind: "ija" });
  }

  Ground(x, z) { return Num(this.host.GroundHeight?.(x, z), 0); }

  AirPoint() {
    const a = this.run ? this.run.air : null;
    return a ? { x: a.x, y: a.y, z: a.z } : { x: 0, y: 0, z: 0 };
  }

  PlayerPoint() {
    const p = this.host.PlayerPos?.();
    if (p) return { x: Num(p.x, 0), y: Num(p.y, 0), z: Num(p.z, 0) };
    const run = this.run;
    return run ? { x: run.impact.x, y: this.Ground(run.impact.x, run.impact.z), z: run.impact.z } : { x: 0, y: 0, z: 0 };
  }

  Direction(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / len, y: dy / len, z: dz / len };
  }

  HitDirection(ref) {
    const at = this.AirPoint();
    const target = ref?.position
      ? { x: Num(ref.position.x, 0), y: Num(ref.position.y, 0) + 1, z: Num(ref.position.z, 0) }
      : this.PlayerPoint();
    return this.Direction(at, target);
  }

  // -------------------------------------------------------------------------
  // 节拍、音效、收尾
  // -------------------------------------------------------------------------

  /** 一个节拍：记进取证、推 story 信号、回调章节侧。三件事的顺序是固定的。 */
  Beat(name) {
    const run = this.run;
    if (!run) return;
    run.beats.push({ name, t: run.t, at: this.Time() });
    const signal = run.signals[name];
    if (signal) this.host.Signal?.(signal);
    run.OnPhase?.(name, this.View());
  }

  /** 机枪声：按听者与飞机的距离挑近/远那条真的录音，不靠低通造。 */
  PlayGuns() {
    const run = this.run;
    this.stats.bursts += 1;
    const at = this.AirPoint();
    const ear = this.PlayerPoint();
    const d = Math.hypot(at.x - ear.x, at.y - ear.y, at.z - ear.z);
    this.Sfx(d > GUN_NEAR_M ? "gunFar" : "gunNear", { position: at, volume: d > GUN_NEAR_M ? 0.8 : 0.95 });
  }

  /**
   * 放一条本层的音效。A2 批那四条实录的同名配方合上之前 `Play` 会返回假值 ——
   * 那时退到备胎，并**把结果记下来**：一条 key 只解析一次，不会每次都白试一遍。
   */
  Sfx(key, opts = {}) {
    const spec = STRAFE_SFX[key];
    if (!spec || typeof this.host.Play !== "function") return null;
    const picked = this.sfxPick.get(key);
    const names = picked ? [picked] : spec.names;
    for (const name of names) {
      const played = this.host.Play(name, { volume: spec.volume, burst: spec.burst, ...opts });
      if (played) { this.sfxPick.set(key, name); return name; }
    }
    return null;
  }

  /** 三条收尾路径（走完 / Abort / Reset）的共同出口。 */
  Finish(reason, completed) {
    const run = this.run;
    if (!run) return null;
    // 走完了但窗口还开着（exitS 短过 windowS 的极端配法）：**照样结算** ——
    // 提示已经给过了，玩家没躲就是没躲，不能靠航线走得快把这一下混过去。
    // Abort / Reset 那两条不结算：那是换关与跳过，不是「没躲开」。
    if (completed && run.player.on && run.player.cued && !run.player.resolved) {
      this.ResolvePlayer();
    }
    run.player.open = false;
    const summary = {
      id: run.id, presetId: run.presetId, reason, completed,
      seconds: run.t, sweptM: run.sweptM,
      beats: run.beats.map((b) => b.name),
      victims: run.victims.map((v) => ({ struck: v.struck, at: v.at })),
      struck: run.victims.filter((v) => v.struck).length,
      playerCued: run.player.cued, playerDodged: run.player.dodged, playerHit: run.player.hit,
    };
    this.run = null;
    this.lastRun = summary;
    if (completed) this.stats.finished += 1;
    run.phase = "done";
    run.OnEnd?.(summary);
    return summary;
  }

  // -------------------------------------------------------------------------
  // 取证
  // -------------------------------------------------------------------------

  /**
   * 给渲染层与 HUD 的脱敏快照。**Script_Aircraft 只读这个**，不认识 run 本体。
   * `aircraft.dirX/dirZ` 是世界系的单位前向；模型机首朝局部 -Z，
   * 所以渲染那边取 `yaw = atan2(-dirX, -dirZ)`（与绕圈那条同一个换算）。
   */
  View() {
    const run = this.run;
    if (!run) return null;
    const a = run.air;
    return {
      active: true,
      id: run.id,
      presetId: run.presetId,
      label: run.label,
      phase: run.phase,
      t: run.t,
      firing: run.phase === "strafe" && run.burstOn,
      aircraft: {
        id: run.aircraftId,
        x: a.x, y: a.y, z: a.z, agl: a.agl,
        dirX: a.dirX, dirZ: a.dirZ,
        climb: a.climb, bank: a.bank, speed: run.speed,
      },
      impact: run.phase === "strafe"
        ? { x: run.impact.x, y: this.Ground(run.impact.x, run.impact.z), z: run.impact.z }
        : null,
      sweptM: run.sweptM,
      player: {
        armed: run.player.on,
        cued: run.player.cued,
        open: run.player.open,
        dodged: run.player.dodged,
        hit: run.player.hit,
        remainS: run.player.open ? Math.max(0, run.player.closeAt - run.t) : 0,
        windowS: run.player.windowS,
      },
      beats: run.beats.map((b) => b.name),
    };
  }

  /** 取证口（Debug.Strafe / 冒烟断言读它）。 */
  State() {
    return {
      run: this.View(),
      playerDamage: this.playerDamage,
      playerWindowS: this.playerWindowS,
      stats: { ...this.stats },
      lastRun: this.lastRun ? { ...this.lastRun } : null,
      sfx: Object.fromEntries(this.sfxPick),
      presets: Object.keys(STRAFE_PRESETS),
    };
  }
}

export default AircraftStrafeDirector;
