// Script_FirstLevelAirRaid.mjs — 第一关 01–06 中远处的日机轮番轰炸（2026-09-26；2026-09-28 物理化 + 中队规模）。
//
// 从 01 先头兵经过洞口（FrontPass）起，一轮接一轮：两架到九架日机从北、东北进场，
// 直线平飞到投弹点，每架投一串炸弹，投完弹飞机变轻上浮，再压坡度转弯离场；
// 炸弹带着飞机的速度离机，按二次空气阻力的外弹道往前飞着落下去（Script_BombBallistics），
// 落在离听者 125 m 以外的中远处（我方两翼阵地与后方）。落地是按装药立方根缩放的爆炸
//（Script_Vfx.BombBlast：火球、冲击环、抛射土柱、底涌尘浪、久留烟团），声音按距离后到、滚成一片闷雷，
// 脚下先是地震波的一抖、再是跟着声音到的气浪；飞机离场后隔十几二十秒下一轮。
//
// 一轮的时间线（t 从进场起算，tc = 长机飞到瞄准点正上方的时刻 = approachM / speed）：
//   0                引擎声起（一条，挂在长机上，逐帧搬位置 + 多普勒）
//   tc − 前冲/speed   长机投下一串的中间那颗（前冲距离 = 这一高度、这一速度下炸弹飞过的水平距离）；
//                    僚机看见长机投弹才按电门，晚零点几秒
//   tImpact − 2.8 s  长机头一颗与离听者最近的那一颗：下落啸声起（按落点距离延迟，最响处硬停在爆炸声到耳朵的那一刻）
//   tImpact          落地：画面先到；地震波 d/600 后一抖；爆炸声由引擎按 d/340 延迟，气浪跟着声音到
//   最后一颗离机后      上浮几米，压坡度协调转弯（角速度 g·tanφ / v）
//   (approachM + exitM) / speed  离场，编队收起，引擎声淡出
//
// **纯氛围层**：不伤人、不改地形、不记任务事实；落点离活人与战车、离听者都有下限（按弹型）。
// **纯规则，不 import three**：宿主把世界能力用函数交进来（地面、听者、空间档、画面、震屏、避人、
// 共享声部、编队与炸弹的摆位），测试用假宿主直接跑。随机走 Mulberry32，逐轮可复现。
// 数全在 Data_FirstLevelAirRaid / Data_AerialBombs；挂在 Script_FirstLevelMissionBattleSound 下，
// 与前线床、场外炮击共用 sharedMaxVoices 那一本声部账。

import { Mulberry32, Clamp01 } from "./Script_Noise.mjs";
import { FIRST_LEVEL_AIR_RAID } from "./Data_FirstLevelAirRaid.mjs";
import { BOMB_PHYSICS } from "./Data_AerialBombs.mjs";
import { P012_HORIZON_BLOCKS } from "./Data_FirstLevelP012Horizon.mjs";
import { BombSpec, DragK, DropTrajectory, FlatDrop, TrajectoryAt, GroundImpact, BombAttitude, BlastScale }
  from "./Script_BombBallistics.mjs";

const DEG = Math.PI / 180;
/** 最后一颗离机后多久开始压坡度、压到位要多久（秒）。 */
const TURN_DELAY_S = 1.2;
const ROLL_IN_S = 3.5;
/** 转弯航迹的积分步长（秒）。 */
const TURN_STEP_S = 0.05;
/** 外圈的土丘与农舍（落进去的炸弹只剩一根烟柱）。 */
const HORIZON_SOLIDS = P012_HORIZON_BLOCKS.filter((b) => b.solid && b.semantic === "structure");

function Smooth(u) { const x = Clamp01(u); return x * x * (3 - 2 * x); }
function WrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

export class FirstLevelAirRaid {
  /**
   * @param {object} host
   * @param {object}   host.audio          AudioEngine（Play / MoveVoice / StopVoice / pendingVoices / listenerPos）
   * @param {function} [host.Listener]     () → {x,y,z}（缺省读 audio.listenerPos）
   * @param {function} [host.Ground]       (x, z) → 地面高度
   * @param {function} [host.Zone]         () → 听者空间档（"trench" / "dugout" / …）
   * @param {function} [host.Visual]       (at, blast, d, column) → 落地那一团画面（blast：弹型、装药、画面半径、
   *                                       摊薄系数、弹着方向；column：要不要常驻土柱）；返回土柱烟源句柄（可空）
   * @param {function} [host.RemoveVisual] (handle) → 撤掉土柱烟源
   * @param {function} [host.Shake]        (trauma) → 往创伤桶里加
   * @param {function} [host.Blocked]      (at, clearM) → true 表示这里有人 / 有车
   * @param {function} [host.SharedRoom]   (n) → 与前线、炮击合计还放得下 n 条吗
   * @param {function} [host.Formation]    (poses) → 编队摆位（空数组 = 收起）
   * @param {function} [host.Bombs]        (list) → 在空中的炸弹摆位（空数组 = 收起）
   * @param {number}   [seed]
   * @param {object}   [data]              默认 FIRST_LEVEL_AIR_RAID；测试可注入
   */
  constructor(host, seed = 0x19380926, data = FIRST_LEVEL_AIR_RAID) {
    this.host = host;
    this.D = data;
    this.rng = Mulberry32(seed >>> 0);
    this.time = 0;
    this.started = false;
    this.startedAt = null;
    this.nextAt = null;
    this.deferred = 0;
    this.stage = null;
    this.stageAt = 0;
    this.wave = null;
    this.waveIndex = 0;
    this.pending = [];          // 排了时刻还没发生的动作：{ at, kind, … }
    this.voices = [];
    this.columns = [];          // 土柱烟源：{ handle, until }
    this.shakes = [];           // 最近 windowS 秒里加过的震：{ at, trauma }
    this.lastSoundAt = -Infinity;
    this.speaking = false;
    this.airCut = 0;
    this.zoneOverride = null;
    this.trajectories = new Map();   // `${bomb}|${speed}` → 相对航迹（同一种编队每轮都一样，算一次留着）
    // 取证
    this.waves = 0;
    this.bombsDropped = 0;
    this.impacts = 0;
    this.sounds = 0;
    this.whistles = 0;
    this.layersDropped = 0;
    this.skipped = 0;
    this.peakVoices = 0;
    this.events = [];
  }

  R(min, max) { return min + (max - min) * this.rng(); }

  Listener() {
    const L = this.host.Listener?.() || this.host.audio?.listenerPos;
    return L ? { x: L.x, y: L.y, z: L.z } : null;
  }

  /** 本层真在响的声部（引擎声算一条）。 */
  Active() { return this.voices.length + (this.wave?.drone ? 1 : 0); }

  /** 落弹窗口（第一颗落地前 reserveLeadS 到最后一颗落地后 reserveTailS）里吗。 */
  Reserving() {
    const w = this.wave, A = this.D.audio;
    return !!w && w.t >= w.firstImpact - A.reserveLeadS && w.t <= w.lastImpact + A.reserveTailS;
  }

  /**
   * 给别人看的占位：落弹窗口里按 reserveVoices 留着（与场外炮击的啸声留位同一个意思）——
   * 前线床从落弹前几秒就不再起新声，一串十几颗落地时共享声部账里有这一串的位置。
   * 2026-09-26 实机取证（04）：不留位时共享的 8 条常被前线床占满，一串 12 颗只响出 2 声。
   */
  Busy() {
    const own = this.voices.length;
    return Math.max(own, this.Reserving() ? this.D.audio.reserveVoices : 0) + (this.wave?.drone ? 1 : 0);
  }

  /** 自己要放一条：本层上限按真在响的数；共享账由宿主按「别人 + 本层真在响」算（自己的留位不挡自己）。 */
  Room(n = 1) {
    if (this.Active() + n > this.D.audio.maxVoices) return false;
    return this.host.SharedRoom ? this.host.SharedRoom(n) !== false : true;
  }

  StageProfile(stage) { return (stage && this.D.stages[stage]) || null; }

  /**
   * 每帧一次。
   * @param {number} dt
   * @param {string|null} stage  当前内部步骤 id
   * @param {object} [ctx]
   * @param {boolean} [ctx.started]   起点到了没有（01 走到 FrontPass；02 以后恒真）
   * @param {boolean} [ctx.speaking]  正在播对白
   * @param {boolean} [ctx.scripted]  有别的脚本飞机在天上（03 开头的横飞），先不起新的一轮
   */
  Update(dt, stage, { started = false, speaking = false, scripted = false } = {}) {
    this.time += Math.max(0, dt);
    this.speaking = !!speaking;
    const now = this.time;
    this.voices = this.voices.filter((e) => now < e.until && this.host.audio?.pendingVoices?.has?.(e.v) !== false);
    this.UpdateColumns();
    const P = this.StageProfile(stage);
    if (stage !== this.stage) {
      this.stage = stage;
      this.stageAt = now;
      if (P?.holdS && this.nextAt !== null) this.nextAt = Math.max(this.nextAt, now + P.holdS);
    }
    this.airCut = P?.airCut || 0;
    this.zoneOverride = P?.listenerZone || null;
    if (P && started && !this.started) {
      this.started = true;
      this.startedAt = now;
      this.nextAt = now + this.D.firstAfterS;
      if (P.holdS) this.nextAt = Math.max(this.nextAt, this.stageAt + P.holdS);
    }
    if (this.wave) this.UpdateWave(dt);
    this.RunPending();
    // 07 以后（或还没到起点）不起新的一轮；已经在天上的那一轮照常飞完。
    if (!P || !this.started || this.wave || this.nextAt === null || now < this.nextAt) return;
    if (scripted) { this.nextAt = now + 1; return; }
    if (speaking && this.deferred < this.D.speechDeferS) {
      this.deferred += this.D.speechStepS;
      this.nextAt = now + this.D.speechStepS;
      return;
    }
    this.deferred = 0;
    if (!this.StartWave()) { this.skipped += 1; this.nextAt = now + this.D.retryS; }
  }

  // ===========================================================================
  // 一轮
  // ===========================================================================

  /** 挑落区与航向，把整轮（每架的航迹、每颗炸弹的离机 / 落地时刻与位置）一次排好。 */
  StartWave() {
    const D = this.D;
    const L = this.Listener();
    if (!L) return false;
    const key = D.order[this.waveIndex % D.order.length];
    const F = D.formations[key];
    if (!F) return false;
    for (let attempt = 0; attempt < D.pickTries; attempt += 1) {
      const zone = D.zones[Math.floor(this.rng() * D.zones.length)];
      const cx = this.R(zone.xMin, zone.xMax), cz = this.R(zone.zMin, zone.zMax);
      const d = Math.hypot(cx - L.x, cz - L.z);
      if (d < D.minM || d > D.maxM) continue;
      const plan = this.PlanWave(key, F, zone, cx, cz, L);
      if (!plan) continue;
      this.wave = plan;
      this.waveIndex += 1;
      this.waves += 1;
      this.nextAt = null;
      this.StartDrone(plan);
      this.events.push({ at: +this.time.toFixed(2), wave: key, zone: zone.id, x: +cx.toFixed(1), z: +cz.toFixed(1),
        d: +d.toFixed(1), planes: F.slots.length, bombs: plan.bombs.length, bomb: plan.spec.id, overhead: plan.overhead,
        nearestM: +plan.nearestM.toFixed(1) });
      if (this.events.length > 12) this.events.shift();
      this.UpdateWave(0);
      return true;
    }
    return false;
  }

  /**
   * 引擎声：一条挂在长机上（一整队的合声在几百米外听不出是几条，省声部；机多就按 droneGain 加厚）。
   * 长机进到 droneStartM 以内才起（再远只剩 −25 dB 以下，04 激战时引擎节点预算贴着 120，
   * 两公里外那一条既听不见、又一定被预算闸饿死 —— 2026-09-26 实机取证）。起了走 priority：
   * 整轮只有这一条（与扫射航线的引擎声同一个口径），声部数由本层自己数。
   * 起不来（本层 / 共享声部满了）就隔 droneRetryS 再试。
   */
  StartDrone(plan) {
    const A = this.D.audio;
    plan.droneTryAt = plan.t + A.droneRetryS;
    const at = this.LeadPoint(plan, plan.t), L = this.Listener();
    if (!L || Math.hypot(at.x - L.x, at.y - L.y, at.z - L.z) > A.droneStartM) return;
    if (!this.Room(1)) { this.layersDropped += 1; return; }
    const F = this.D.formations[plan.key];
    plan.drone = this.host.audio?.Play?.(A.droneCue, {
      position: at, volume: A.droneVolume * (F?.droneGain ?? 1), sourceSizeM: A.droneSizeM * Math.sqrt(plan.slots.length / 3),
      priority: true, selfCapped: true, airCut: this.airCut > 0 ? this.airCut : undefined,
    }) || null;
  }

  /** 这一种弹、这一速度的相对航迹（一轮里所有弹共用；按键缓存）。 */
  Trajectory(spec, speed, dropM) {
    const key = `${spec.id}|${speed}`;
    let traj = this.trajectories.get(key);
    const need = dropM + 60;
    if (!traj || -traj.y[traj.y.length - 1] < need) {
      traj = DropTrajectory(speed, DragK(spec), need + 80, { vDown: this.D.bomb.ejectMps });
      this.trajectories.set(key, traj);
    }
    return traj;
  }

  /**
   * 排一轮。瞄准点 = 落区里随机的一点；航向 = 落区的来向 ± 抖动（有一半机会改成从听者头顶压过去）。
   * 投弹手在平地上算前冲距离，长机在差这段距离时投下一串的中间那颗；每颗弹的落点从离机那一刻积出来。
   * 有一颗落点离人 / 车、离听者太近，或者砸进外圈土丘与农舍，就整轮作废（换一块落区再挑）。
   */
  PlanWave(key, F, zone, cx, cz, L) {
    const D = this.D, B = D.bomb;
    const spec = BombSpec(F.load.bomb);
    if (!spec) return null;
    const fromLen = Math.hypot(zone.from.x, zone.from.z) || 1;
    const nominal = Math.atan2(-zone.from.x / fromLen, -zone.from.z / fromLen);
    let a = nominal + this.R(-1, 1) * D.headingJitterDeg * DEG;
    let overhead = false;
    const O = D.overhead;
    if (O && L && this.rng() < O.chance) {
      // 把航向对准「听者 → 瞄准点」，再偏一个让航迹从头顶 missM 以内擦过去的小角；
      // 这样飞还得是从北边来（航向偏正南不超过 maxFromNorthDeg）。
      const toC = Math.hypot(cx - L.x, cz - L.z);
      const over = Math.atan2(cx - L.x, cz - L.z) + Math.asin(Math.max(-0.95, Math.min(0.95, this.R(-1, 1) * O.missM / Math.max(1, toC))));
      if (toC > 1 && Math.abs(WrapAngle(over)) <= O.maxFromNorthDeg * DEG) { a = over; overhead = true; }
    }
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    const right = { x: -dir.z, z: dir.x };
    const groundC = this.Ground(cx, cz);
    const speed = F.speedMps;
    const tCenter = D.approachM / speed;
    const plan = { key, zone: zone.id, aircraft: F.aircraft, center: { x: cx, y: groundC, z: cz }, dir, right, speed,
      altitude: groundC + F.altitudeM, tCenter, endT: (D.approachM + D.exitM) / speed, t: 0,
      slots: F.slots, bombs: [], drone: null, spec, overhead, columns: 0, nearestM: Infinity,
      balloonM: F.balloonM ?? 0, balloonS: F.balloonS ?? 2, lastRelease: [], turn: null };
    // 投弹手：这一高度（弹舱离地）、这一速度下，炸弹沿航向要飞多远才落地。
    const dropM = F.altitudeM - B.bayDropM;
    const traj = plan.traj = this.Trajectory(spec, speed, F.altitudeM + 30);
    const aim = FlatDrop(traj, dropM);
    plan.aimRangeM = aim.rangeM;
    plan.aimFallS = aim.fallS;
    // 一串中间那颗的离机时刻：长机离瞄准点还差前冲距离。
    const n = F.load.count;
    const tMid = tCenter - aim.rangeM / speed;
    // 先按平地粗排一遍（不查地面）：离人、离听者、砸土丘，有一颗不行就整轮作废 ——
    // 挑落区时大半的候选在这一步就被否掉，省下逐颗求地面交点的几百次地面查询。
    const bad = (at, margin) => !!this.host.Blocked?.({ x: at.x, z: at.z }, spec.clearM)
      || this.InSolid(at) || (L && Math.hypot(at.x - L.x, at.z - L.z) < spec.minListenerM - margin);
    for (let j = 0; j < F.slots.length; j += 1) {
      const lag = j === 0 ? 0 : this.R(F.dropLagS[0], F.dropLagS[1]);
      let last = -Infinity;
      for (let k = 0; k < n; k += 1) {
        const tRelease = tMid + (k - (n - 1) / 2) * F.intervalS + lag;
        last = Math.max(last, tRelease);
        const plane = this.PlanePoint(plan, j, tRelease);
        const from = { x: plane.x, y: plane.y - B.bayDropM, z: plane.z };
        const lat = this.R(-1, 1) * B.dispersionM[0], lon = this.R(-1, 1) * B.dispersionM[1];
        const b = { plane: j, index: k, tRelease, from, lat, lon, seed: this.rng(), fallS: 0, tImpact: 0,
          at: null, released: false, landed: false, first: k === 0, lead: j === 0 && k === 0 };
        if (bad(this.BombPlace(plan, b, aim.fallS, aim.fallS), 10)) return null;
        plan.bombs.push(b);
      }
      plan.lastRelease[j] = last;
    }
    // 再逐颗求真的落点：离机点 + 航迹（带散布）与地面的交点。
    for (const b of plan.bombs) {
      const fallS = GroundImpact(traj, (u) => this.BombPlace(plan, b, u, aim.fallS), (x, z) => this.Ground(x, z),
        { originY: b.from.y, guessGround: groundC });
      b.fallS = fallS;
      b.tImpact = b.tRelease + fallS;
      b.at = this.BombPlace(plan, b, fallS, fallS);
      b.at.y = this.Ground(b.at.x, b.at.z);
      if (bad(b.at, 0)) return null;
      if (L) plan.nearestM = Math.min(plan.nearestM, Math.hypot(b.at.x - L.x, b.at.z - L.z));
    }
    plan.bombs.sort((p, q) => p.tImpact - q.tImpact);
    plan.firstImpact = plan.bombs[0].tImpact;
    plan.lastImpact = plan.bombs[plan.bombs.length - 1].tImpact;
    plan.turn = this.BuildTurn(plan, F, L);
    this.PickWhistles(plan, L);
    return plan;
  }

  /**
   * 哪几颗有下落啸声：长机头一颗，再加离听者最近的那一颗（落地与已选的隔 gapS 以上），最多 perWave 颗。
   * 每颗的变调取自它自己的 seed，起播时刻 = 落地 − durS / pitch。
   */
  PickWhistles(plan, L) {
    const W = this.D.audio.whistle;
    if (!W || !(W.perWave > 0)) return;
    const near = (b) => (L ? Math.hypot(b.at.x - L.x, b.at.z - L.z) : 0);
    const order = [plan.bombs.find((b) => b.lead), ...plan.bombs.filter((b) => !b.lead).sort((p, q) => near(p) - near(q))];
    const picked = [];
    for (const b of order) {
      if (!b || picked.length >= W.perWave) continue;
      if (picked.some((o) => Math.abs(o.tImpact - b.tImpact) < W.gapS)) continue;
      picked.push(b);
    }
    for (const b of picked) {
      b.whistlePitch = 1 + (b.seed - 0.5) * (W.pitchSpread ?? 0);   // 用这颗自己的种子，不动整轮的随机序列
      b.whistleAt = b.tImpact - W.durS / b.whistlePitch;
    }
  }

  /**
   * 起一条下落啸声。摆在听者到落点连线上 share 处、高出落点 heightM；延迟按**落点**的距离 d/340 给
   *（不按摆出来的位置算 —— 要的是它在爆炸声到耳朵的那一刻停住）。晚了几帧就从素材里相应往后切，终点不动。
   * 声部账里这一格不按时间过期，落地那一帧由 Impact 直接移交给同一颗的爆炸本体（按时间过期的话，
   * 同一帧里先落地的别的弹会把刚空出来的这一格抢走，啸声硬停之后没了爆炸）。
   */
  Whistle(plan, b, L) {
    b.whistled = true;
    const W = this.D.audio.whistle, A = this.D.audio;
    const remain = b.tImpact - plan.t;
    if (!L || !(remain > 0.2)) return;
    if (!this.Room(1)) { this.layersDropped += 1; return; }
    const at = b.at, k = W.share;
    const d = Math.hypot(at.x - L.x, at.y - L.y, at.z - L.z);
    const pitch = b.whistlePitch ?? 1;
    const offset = Math.max(0, W.durS - remain * pitch);
    const v = this.Voice(this.host.audio?.Play?.(W.cue, {
      position: { x: L.x + (at.x - L.x) * k, y: at.y + W.heightM, z: L.z + (at.z - L.z) * k },
      volume: W.volume * (this.speaking ? A.speechGain : 1), pitch, offset, sourceSizeM: W.sizeM,
      delay: Math.min(d / BOMB_PHYSICS.soundMps, 1.4), propagate: false, bus: "sfx", selfCapped: true,
      priority: !!A.leadPriority, airCut: this.airCut > 0 ? this.airCut : undefined,
    }), Infinity);
    if (v) { this.whistles += 1; b.whistleVoice = v; }
  }

  /** 落点在外圈土丘 / 农舍的体块里（外扩 hillClearM）吗。 */
  InSolid(at) {
    const m = this.D.hillClearM ?? 0;
    return HORIZON_SOLIDS.some((b) => Math.abs(at.x - b.x) < b.w / 2 + m && Math.abs(at.z - b.z) < b.d / 2 + m);
  }

  /**
   * 离场转弯：最后一颗离机后 TURN_DELAY_S 起压坡度，ROLL_IN_S 压到 bankDeg；协调转弯角速度 g·tanφ / v。
   * 往远离听者的一侧转（听者就在航迹下面时随机）。长机的转弯航迹积一次存表，编队整体跟着转。
   */
  BuildTurn(plan, F, L) {
    const start = Math.max(...plan.lastRelease) + TURN_DELAY_S;
    if (!(F.bankDeg > 0) || start >= plan.endT) return null;
    const lat = L ? (L.x - plan.center.x) * plan.right.x + (L.z - plan.center.z) * plan.right.z : 0;
    const sign = Math.abs(lat) < 40 ? (this.rng() < 0.5 ? -1 : 1) : (lat > 0 ? -1 : 1);
    const g = BOMB_PHYSICS.gravity, v = plan.speed, phi = F.bankDeg * DEG;
    const count = Math.ceil((plan.endT - start) / TURN_STEP_S) + 2;
    const s = new Float64Array(count), l = new Float64Array(count), psi = new Float64Array(count), bank = new Float64Array(count);
    let S = 0, Lat = 0, P = 0;
    for (let i = 0; i < count; i += 1) {
      const b = phi * Smooth((i * TURN_STEP_S) / ROLL_IN_S);
      s[i] = S; l[i] = Lat; psi[i] = P; bank[i] = b;
      const rate = sign * g * Math.tan(b) / v;
      const mid = P + rate * TURN_STEP_S / 2;
      S += v * Math.cos(mid) * TURN_STEP_S;
      Lat += v * Math.sin(mid) * TURN_STEP_S;
      P += rate * TURN_STEP_S;
    }
    return { start, sign, s, l, psi, bank, radiusM: v * v / (g * Math.tan(phi)) };
  }

  Ground(x, z) {
    const y = this.host.Ground ? this.host.Ground(x, z) : 0;
    return Number.isFinite(y) ? y : 0;
  }

  /** 长机在 t 时刻：位置（地面投影）、航向、坡度。转弯之前是直线。 */
  LeadTrack(plan, t) {
    const turn = plan.turn;
    const straight = ((turn ? Math.min(t, turn.start) : t) - plan.tCenter) * plan.speed;
    let x = plan.center.x + plan.dir.x * straight, z = plan.center.z + plan.dir.z * straight;
    if (!turn || t <= turn.start) return { x, z, hx: plan.dir.x, hz: plan.dir.z, bank: 0 };
    const u = (t - turn.start) / TURN_STEP_S;
    const i = Math.min(turn.s.length - 2, Math.floor(u)), f = Math.min(1, u - i);
    const sR = turn.s[i] + (turn.s[i + 1] - turn.s[i]) * f;
    const lR = turn.l[i] + (turn.l[i + 1] - turn.l[i]) * f;
    const psi = turn.psi[i] + (turn.psi[i + 1] - turn.psi[i]) * f;
    const bank = turn.bank[i] + (turn.bank[i + 1] - turn.bank[i]) * f;
    x += plan.dir.x * sR + plan.right.x * lR;
    z += plan.dir.z * sR + plan.right.z * lR;
    const c = Math.cos(psi), s = Math.sin(psi);
    // 右转（sign +1）= 右翼压下 = 绕机首轴负转（机首朝 -Z 时，正的 rotation.z 抬起右翼）。
    return { x, z, hx: plan.dir.x * c + plan.right.x * s, hz: plan.dir.z * c + plan.right.z * s, bank: -turn.sign * bank };
  }

  LeadPoint(plan, t) { return this.PlanePoint(plan, 0, t); }

  /** 第 j 架投完弹之后的上浮（米）与此刻的爬升角。 */
  Balloon(plan, j, t) {
    const since = t - (plan.lastRelease[j] ?? Infinity);
    if (!(since > 0) || !(plan.balloonM > 0)) return { h: 0, climb: 0 };
    const e = Math.exp(-since / plan.balloonS);
    return { h: plan.balloonM * (1 - e), climb: Math.atan2(plan.balloonM / plan.balloonS * e, plan.speed) };
  }

  /** 第 j 架在 t 时刻的位置：长机航迹 + 队形偏移（随航向一起转）+ 投弹后的上浮。 */
  PlanePoint(plan, j, t) {
    const s = plan.slots[j], lead = this.LeadTrack(plan, t);
    const rx = -lead.hz, rz = lead.hx;
    return {
      x: lead.x + rx * s.side - lead.hx * s.back,
      y: plan.altitude + s.up + this.Balloon(plan, j, t).h,
      z: lead.z + rz * s.side - lead.hz * s.back,
    };
  }

  /** 编队层要的姿态：位置 + 航向 + 爬升角 + 坡度。 */
  PlanePose(plan, j, t) {
    const p = this.PlanePoint(plan, j, t), lead = this.LeadTrack(plan, t);
    return { id: plan.aircraft, x: p.x, y: p.y, z: p.z, dirX: lead.hx, dirZ: lead.hz,
      climb: this.Balloon(plan, j, t).climb, bank: lead.bank };
  }

  /**
   * 离机 u 秒时弹的世界位置：离机点 + 相对航迹（沿航向）+ 散布（按 (u/T)² 长起来，T 是这颗的落地时间；
   * 排弹时还不知道，先用平地估的 aimFallS）。投弹全部发生在转弯之前，所以沿航向就是这一轮的直线航向。
   */
  BombPlace(plan, b, u, T, out = {}) {
    const r = TrajectoryAt(plan.traj, u, this._traj ||= {});
    const q = Math.min(1, (u / Math.max(1e-3, T)) ** 2);
    const along = r.s + b.lon * q, side = b.lat * q;
    out.x = b.from.x + plan.dir.x * along + plan.right.x * side;
    out.y = b.from.y + r.y;
    out.z = b.from.z + plan.dir.z * along + plan.right.z * side;
    return out;
  }

  /**
   * 炸弹在空中的姿态：航迹上的位置、尾翼拉向来流的风标振荡；画面尺寸是真尺寸，
   * 远到不足 minAngularRad 时按距离放大补足（最多 maxScale 倍）。
   */
  BombPose(plan, b, t, L = this.Listener()) {
    const B = this.D.bomb, spec = plan.spec;
    const u = Math.max(0, Math.min(b.fallS, t - b.tRelease));
    const p = u >= b.fallS ? { x: b.at.x, y: b.at.y, z: b.at.z } : this.BombPlace(plan, b, u, b.fallS);
    const r = TrajectoryAt(plan.traj, u, {});
    const att = BombAttitude(r.vs, r.vy, u, b.seed);
    const c = Math.cos(att.yaw), s = Math.sin(att.yaw);
    const d = L ? Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z) : 0;
    return {
      x: p.x, y: p.y, z: p.z,
      dirX: plan.dir.x * c + plan.right.x * s, dirZ: plan.dir.z * c + plan.right.z * s,
      // 机头朝下的角（离机时平躺，越落越竖）；pathPitch 是不带摆动的航迹倾角。
      pitch: att.pitch, pathPitch: att.pathPitch,
      bomb: spec.id, lengthM: spec.lengthM, radiusM: spec.diameterM / 2,
      scale: Math.max(1, Math.min(B.maxScale, B.minAngularRad * d / spec.diameterM)),
    };
  }

  UpdateWave(dt) {
    const plan = this.wave;
    plan.t += Math.max(0, dt);
    const t = plan.t;
    // 编队。
    const poses = [];
    for (let j = 0; j < plan.slots.length; j += 1) poses.push(this.PlanePose(plan, j, t));
    this.host.Formation?.(t < plan.endT ? poses : []);
    // 引擎声跟着长机（没起来的、被引擎偷掉的，飞机还没离场就隔一会儿再试）。
    if (plan.drone && this.host.audio?.pendingVoices?.has?.(plan.drone) === false) plan.drone = null;
    if (!plan.drone && t < plan.endT && t >= (plan.droneTryAt ?? 0)) this.StartDrone(plan);
    if (plan.drone) {
      const lead = poses[0], ahead = this.PlanePoint(plan, 0, t + 0.1);
      this.host.audio?.MoveVoice?.(plan.drone, { x: lead.x, y: lead.y, z: lead.z },
        { velocity: { x: (ahead.x - lead.x) * 10, y: (ahead.y - lead.y) * 10, z: (ahead.z - lead.z) * 10 } });
    }
    // 炸弹：离机的画出来，到点的落地。
    const falling = [];
    const L = this.Listener();
    for (const b of plan.bombs) {
      if (b.landed) continue;
      if (t < b.tRelease) continue;
      if (!b.released) { b.released = true; this.bombsDropped += 1; }
      if (b.whistleAt != null && !b.whistled && t >= b.whistleAt) this.Whistle(plan, b, L);
      if (t >= b.tImpact) { b.landed = true; this.Impact(plan, b); continue; }
      falling.push(this.BombPose(plan, b, t, L));
    }
    this.host.Bombs?.(falling);
    if (t >= plan.endT && plan.bombs.every((b) => b.landed)) this.EndWave();
  }

  EndWave() {
    const plan = this.wave;
    if (!plan) return;
    this.host.Formation?.([]);
    this.host.Bombs?.([]);
    if (plan.drone) this.host.audio?.StopVoice?.(plan.drone, this.D.audio.droneStopFadeS);
    plan.drone = null;
    this.wave = null;
    this.nextAt = this.time + this.R(this.D.gapS[0], this.D.gapS[1]);
    const P = this.StageProfile(this.stage);
    if (P?.holdS) this.nextAt = Math.max(this.nextAt, this.stageAt + P.holdS);
  }

  // ===========================================================================
  // 落地
  // ===========================================================================

  /** 比例距离 Z = d / ∛W 上的一记创伤（Data_FirstLevelAirRaid.shake 的头注）。 */
  ShakeTrauma(d, zone, cube = Math.cbrt(this.D.audio.chargeRefKg)) {
    const S = this.D.shake;
    const z = d / Math.max(0.5, cube);
    const u = Clamp01((z - S.zNear) / Math.max(1, S.zFar - S.zNear));
    return (S.traumaNear + (S.traumaFar - S.traumaNear) * u) * (zone === "dugout" ? S.dugoutScale : 1);
  }

  ListenerZone() { return this.zoneOverride || this.host.Zone?.() || null; }

  /** 落地那一刻：画面先到；地震波与声音按距离后到，震屏与掉土排在它们到达之后。 */
  Impact(plan, b) {
    const D = this.D, A = D.audio;
    const L = this.Listener();
    this.impacts += 1;
    if (!L) return;
    const at = b.at, spec = plan.spec;
    const d = Math.hypot(at.x - L.x, at.y - L.y, at.z - L.z);
    const arrive = d / BOMB_PHYSICS.soundMps;
    const scale = BlastScale(spec.chargeKg);
    const column = b.first && plan.columns < (D.impact.maxColumns ?? Infinity);
    if (column) plan.columns += 1;
    const end = TrajectoryAt(plan.traj, b.fallS, {});
    const blast = { bomb: spec.id, chargeKg: spec.chargeKg, cube: scale.cube, radius: scale.visualRadius,
      budget: Math.min(1, (D.impact.detailBombs ?? Infinity) / plan.bombs.length),
      dirX: plan.dir.x, dirZ: plan.dir.z, impactPitch: Math.atan2(-end.vy, end.vs) };
    const handle = this.host.Visual?.({ x: at.x, y: at.y, z: at.z }, blast, d, column);
    if (handle != null) this.columns.push({ handle, until: this.time + D.impact.column.emitS });
    const gain = Math.min(A.volumeMaxGain ?? 1, Math.max(1, (spec.chargeKg / (A.chargeRefKg || spec.chargeKg)) ** (1 / 6)));
    const speech = (this.speaking ? A.speechGain : 1) * gain;
    const cut = (hz) => (this.airCut > 0 ? Math.min(hz || 20000, this.airCut) : hz || undefined);
    const pos = { x: at.x, y: at.y + 2, z: at.z };
    // 一串十几颗只给其中几颗出声：相邻两声至少隔 minGapS，声部满了就这一颗不出声。
    // 长机头一颗（一轮的第一声）与它的低频层走 priority：04 激战时引擎节点预算贴着上限，
    // 几百米外的远爆偷不到比它更轻的声部，不保这两条一轮就一声不响（2026-09-26 实机取证）。
    // 有下落啸声的那一颗同样保底：啸声硬停之后没有爆炸，比没有啸声更假。它占的那一格此刻移交给爆炸本体。
    if (b.whistleVoice) { this.voices = this.voices.filter((e) => e.v !== b.whistleVoice); b.whistleVoice = null; }
    const priority = !!((b.lead || b.whistleAt != null) && A.leadPriority);
    // 普通的那几声给「已经啸起来、还没落地、账上又没占着格」的弹留位（它的啸声被引擎提前回收或偷掉时）。
    const keyed = b.lead || b.whistleAt != null;
    const owed = keyed ? 0 : plan.bombs.filter((o) => o !== b && !o.landed && o.whistled
      && !this.voices.some((e) => e.v === o.whistleVoice)).length;
    if (keyed || this.time - this.lastSoundAt >= A.minGapS) {
      if (this.Room(1 + owed)) {
        this.lastSoundAt = this.time;
        this.Voice(this.host.audio?.Play?.(A.cue, { position: pos, volume: A.volume * speech, soundField: true, bus: "sfx",
          selfCapped: true, priority, airCut: cut(0) }));
      } else this.layersDropped += 1;
    }
    // 一轮的第一颗（长机那一串的头一颗）：低频冲击层（同名 cue 的 22 ms 去重窗，晚 30 ms 起）。
    if (b.lead) {
      if (this.Room(1)) {
        this.Voice(this.host.audio?.Play?.(A.thumpCue, { position: pos, volume: A.thumpVolume * speech, soundField: true,
          bus: "sfx", selfCapped: true, priority, airCut: cut(A.thumpAirCutHz), delay: A.thumpDelayS }));
      } else this.layersDropped += 1;
    }
    // 每架那一串的第一颗：听者在洞里 / 沟里，声音到了之后耳边掉一阵土。
    if (b.first) {
      const zone = this.ListenerZone();
      if ((zone === "dugout" || zone === "trench") && d < A.dirtWithinM) {
        this.pending.push({ at: this.time + arrive + this.R(A.dirtDelayS[0], A.dirtDelayS[1]), kind: "dirt", zone });
      }
    }
    // 两记震：地震波先到（轻），气浪跟着声音到（重）。
    const S = D.shake;
    if (S.seismicFraction > 0) {
      this.pending.push({ at: this.time + d / BOMB_PHYSICS.groundWaveMps, kind: "shake", d, cube: scale.cube, frac: S.seismicFraction });
    }
    this.pending.push({ at: this.time + arrive, kind: "shake", d, cube: scale.cube, frac: 1 });
  }

  Voice(v, activeS = this.D.audio.voiceActiveS) {
    if (v) {
      this.voices.push({ v, until: this.time + activeS });
      this.sounds += 1;
      this.peakVoices = Math.max(this.peakVoices, this.Active());
    }
    return v;
  }

  RunPending() {
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => p.at <= this.time);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => p.at > this.time);
    const A = this.D.audio, S = this.D.shake;
    const L = this.Listener();
    for (const p of due) {
      if (p.kind === "shake") {
        // 一串连着到：windowS 秒里合计不超过 windowMax（不然十几颗叠满创伤桶，远处的炸弹震得像在脚下）。
        this.shakes = this.shakes.filter((s) => this.time - s.at < S.windowS);
        const spent = this.shakes.reduce((n, s) => n + s.trauma, 0);
        const want = this.ShakeTrauma(p.d, this.ListenerZone(), p.cube) * (p.frac ?? 1);
        const trauma = Math.min(want, Math.max(0, S.windowMax - spent));
        if (trauma > 1e-3) { this.host.Shake?.(trauma); this.shakes.push({ at: this.time, trauma }); }
      } else if (p.kind === "dirt" && L) {
        if (!this.Room(1)) { this.layersDropped += 1; continue; }
        const dugout = p.zone === "dugout";
        const a = this.rng() * Math.PI * 2;
        const r = dugout ? 0.6 : 1.3;
        this.Voice(this.host.audio?.Play?.("debrisFall", {
          position: { x: L.x + Math.sin(a) * r, y: L.y + (dugout ? 0.9 : -0.3), z: L.z + Math.cos(a) * r },
          volume: dugout ? A.dugoutDirtVolume : A.trenchDirtVolume,
          airCut: dugout ? A.dugoutDirtAirCutHz : A.trenchDirtAirCutHz,
        }), A.debrisActiveS);
      }
    }
  }

  /** 到点撤掉土柱的烟源（已经喷出去的烟团自己活完）。all = 全撤。 */
  UpdateColumns(all = false) {
    if (!this.columns.length) return;
    const keep = [];
    for (const c of this.columns) {
      if (all || this.time >= c.until) this.host.RemoveVisual?.(c.handle);
      else keep.push(c);
    }
    this.columns = keep;
  }

  State() {
    const w = this.wave;
    return {
      started: this.started, waves: this.waves, bombsDropped: this.bombsDropped, impacts: this.impacts, sounds: this.sounds,
      whistles: this.whistles, skipped: this.skipped, layersDropped: this.layersDropped, voices: this.voices.length, peakVoices: this.peakVoices,
      reserving: this.Reserving(),
      nextInS: this.nextAt === null ? null : +(this.nextAt - this.time).toFixed(2),
      wave: w ? { key: w.key, zone: w.zone, t: +w.t.toFixed(2), tCenter: +w.tCenter.toFixed(2), endT: +w.endT.toFixed(2),
        planes: w.slots.length, bomb: w.spec.id, bombs: w.bombs.length, landed: w.bombs.filter((b) => b.landed).length,
        drone: !!w.drone, overhead: w.overhead, aimRangeM: +w.aimRangeM.toFixed(1), aimFallS: +w.aimFallS.toFixed(2),
        turn: w.turn ? { start: +w.turn.start.toFixed(2), sign: w.turn.sign, radiusM: Math.round(w.turn.radiusM) } : null,
        lead: (() => { const p = this.LeadPoint(w, w.t); return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) }; })() } : null,
      recent: this.events.slice(-6),
    };
  }

  /** 整个撤掉（换关 / 销毁）：编队与炸弹收起、引擎声掐掉、土柱撤源。 */
  Dispose() {
    if (this.wave?.drone) this.host.audio?.StopVoice?.(this.wave.drone, 0);
    this.wave = null;
    this.host.Formation?.([]);
    this.host.Bombs?.([]);
    for (const e of this.voices) this.host.audio?.FreeVoice?.(e.v);
    this.voices = [];
    this.pending = [];
    this.UpdateColumns(true);
  }
}
