// 《台儿庄：血战滕县》具名同伴 —— 把剧本里那几个名字变成场上真的站着的人。
//
// **纯规则，不许 import three。** 「谁在场、他该站在哪儿、他现在在哪儿」这三件事
// 与画面无关，所以整条逻辑在纯 Node 里跑得完（回归口 `Script_MissionHooksTest.mjs`）。
// 造人、挪人、倒地全走宿主注入的窄回调，接线在 Script_Main（`new CompanionDirector({...})`
// 那一段，把每件事翻给 AiDirector）。
//
// ── 为什么要有这一层 ────────────────────────────────────────────────────────
// 剧本里罗班长喊「顺子，接后头！」、幺娃在旁边骂「日你先人！」—— 这两句现在都是
// **从玩家脑门上发出来的**：Script_Story 的 AttachVoice 有一个 locate 参数，
// 而装配层那一行写着「locate 暂缺」。声音没有方位，玩家不知道该往哪儿看；
// 更要紧的是，班里那几个人在场上根本不存在 —— 撒兵撒出来的是无名的 nra，
// 谁都不是罗班长。§0 的定位是「群像情绪递进」，群像得先有像。
//
// 所以这一层做三件事，一件都不多：
//   1. **按名册在玩家附近生成具名 NRA 演员**（复用 AiDirector/ActorFactory 那条管线，
//      不另造一套行为树 —— 他们就是普通国军兵，只是有名字、跟着你走）；
//   2. **Locate(castId) → 世界坐标**，接进 story.AttachVoice 的 locate 参数；
//   3. **接受剧本指令**：某人从此缺席（罗班长 CH5 起）、某人倒下（走现有倒地）、
//      某人临时脱离跟随（小秦蹲下查断点、幺娃去抬人）。
//
// ── 两种模式，不做第三种 ────────────────────────────────────────────────────
//   follow  跟着玩家走（班组的常态）。每人一个固定的横向/纵深偏移，不排成一串。
//   hold    钉在指定路标里待命（军医守救护所、排长守街口、机枪副射手守机枪位）。
// 「跟着担架队走」「沿电话线前进」这类专用队列不归这里 —— 那是 escortColumn /
// phoneLine 的事（S 批），这一层不许长成一个通用编队系统。
//
// ── 兵力预算 ────────────────────────────────────────────────────────────────
// 同伴是**从 nra 名额里出**的，不是额外加的人：装配层在 SeedSoldiers 之前先摆同伴，
// SeedSoldiers 的 `CountNear("nra",40)` 与 `ai.CountSide("nra")` 都会把他们数进去，
// 于是撒兵自动少撒同样多。开机红线（drawCalls ≤ 5000 / triangles ≤ 600 万）因此
// 不受影响 —— 场上活人总数一个没多。MAX_COMPANIONS 是这条账的保险丝。

import { T } from "./Script_Text.mjs";
import {
  COMPANION_CAST, MAX_COMPANIONS, DEFAULT_PLAYER_CAST, COMPANION_TUNING,
} from "./Data_Companions.mjs";

// 名册、上限、跟随节奏与默认玩家角色全在 `Data_Companions.mjs`
//（labelKey 指向 Data_Text_Gameplay 的 `gameplay.cast.*`）。
// 这里 re-export，老调用点与章节数据里写的常量名一行不改。
export { COMPANION_CAST, MAX_COMPANIONS, DEFAULT_PLAYER_CAST, COMPANION_TUNING };

/** 稳定的小哈希：同一个名字永远得到同一个站位偏移。**不许 Math.random。** */
function HashId(text) {
  let h = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** 这个 id 归这一层管吗（在档案表里、且没被标 absent）。 */
export function IsCompanionCast(castId) {
  const spec = COMPANION_CAST[castId];
  return !!spec && !spec.absent;
}

/**
 * 从一章的 beats 推导默认名册：**该章说过话的战斗员自动在场**，按首次开口的顺序。
 *
 * 「说过话」= 有一条 line / shout 的 who 指着他。env / narration / system 没有 who，
 * objective 也没有 —— 那些不算谁在场。
 *
 * 这是 INT1 的默认口径，INT2 会按章精修（谁该在场不只取决于谁说了话：
 * 三关的军医、四关的排长都在场却不一定开口）。精修的做法是给 BeginLevel
 * 传显式 roster，或在章节数据里登记 —— 不是改这个函数。
 *
 * @param {object} opts exclude 这一章不许自动在场的 id（玩家自己走这条）
 */
export function RosterFromBeats(beats = [], limit = MAX_COMPANIONS, opts = {}) {
  const exclude = new Set(Array.isArray(opts.exclude) ? opts.exclude : (opts.exclude ? [opts.exclude] : []));
  const seen = [];
  for (const beat of beats || []) {
    if (!beat || (beat.type !== "line" && beat.type !== "shout")) continue;
    const who = beat.who;
    if (!who || seen.includes(who) || exclude.has(who)) continue;
    const spec = COMPANION_CAST[who];
    if (!spec || spec.absent || !spec.combatant) continue;
    seen.push(who);
    if (seen.length >= limit) break;
  }
  return seen;
}

/**
 * 具名同伴导演。
 *
 * @param {object} host 窄回调集合（接线见 Script_Main 里 `new CompanionDirector({...})` 那一段）：
 *   Time()                     → 秒（关内或全局都行，只用来算间隔）
 *   PlayerPos()                → {x,y,z}|null
 *   PlayerYaw()                → 弧度（玩家正面 = -Z，与 Script_Player 同一套）
 *   Spawn({castId,label,x,z,weapon,squadId}) → handle|null
 *   Despawn(handle)
 *   PositionOf(handle)         → {x,y,z}|null
 *   Alive(handle)              → boolean
 *   Busy(handle)               → boolean（可选）。这个人此刻**归别人管**，跟随不许插手
 *   Place(handle,x,z)          → void（归队瞬移）
 *   SetGoal(handle,x,z)        → void
 *   SetHold(handle,zone|null)  → void（zone: {id,x,z,radius}）
 *   Fell(handle)               → void（走现有倒地，不是 Despawn）
 */
export class CompanionDirector {
  constructor(host = {}, options = {}) {
    this.host = host;
    this.tuning = { ...COMPANION_TUNING, ...(options.tuning || {}) };
    this.max = options.max ?? MAX_COMPANIONS;
    /** castId → { castId, spec, handle, mode, zone, detachUntil, fell } */
    this.members = new Map();
    /** 剧本说「这个人从此不在了」。**跨关保留** —— 罗班长四关牺牲，五关不该又站起来。 */
    this.absent = new Set();
    this.levelId = null;
    this.regoalAt = -99;
    /** 取证：这一关请求过谁、成没成。接线自检看它，别看「有没有报错」。 */
    this.log = [];
  }

  /** 场上还站着的具名同伴（castId 数组）。 */
  get Present() {
    return [...this.members.values()].filter((m) => m.handle && !m.fell).map((m) => m.castId);
  }

  /** 这一关点了名的全部人（含已倒下的）。 */
  get Roster() { return [...this.members.keys()]; }

  /** 剧本让谁缺席了（跨关保留）。 */
  get Absent() { return [...this.absent]; }

  /**
   * 换关：按名册在玩家附近摆一班人。
   *
   * @param {string} levelId
   * @param {object} opts
   *   roster  显式名册（castId 数组）。不给就由 beats 推导（RosterFromBeats）。
   *   beats   本章 beats（roster 缺位时用它推导）
   *   zones   本章路标 [{id,x,z,radius}]，hold 模式按 holdZone 就近钉
   *   playerCast  这一章玩家演的是谁（终章是小秦，写在 CHAPTER.playerCast 上）。
   *              不给就退到 DEFAULT_PLAYER_CAST。**他不进默认名册** ——
   *              否则场上会有两个他。
   */
  BeginLevel(levelId, opts = {}) {
    this.Reset("levelChange");
    this.levelId = levelId || null;
    const playerCast = opts.playerCast || DEFAULT_PLAYER_CAST;
    const wanted = (Array.isArray(opts.roster) && opts.roster.length)
      ? opts.roster.filter((id) => id !== playerCast)
      : RosterFromBeats(opts.beats || [], this.max, { exclude: playerCast });
    const zones = Array.isArray(opts.zones) ? opts.zones : [];
    let placed = 0;
    for (const castId of wanted) {
      if (placed >= this.max) break;
      const spec = COMPANION_CAST[castId];
      if (!spec || spec.absent) {
        // 取证日志是开发者诊断，不是玩家文本（Debug 面板与接线自检读它）。
        this.log.push({ castId, ok: false, why: spec ? `档案标了 absent：${spec.reason}` : "不在同伴档案表里" });  // @text-ok 取证日志：只进 director.log 与接线自检
        continue;
      }
      if (this.absent.has(castId)) {
        this.log.push({ castId, ok: false, why: "剧本已宣告缺席" });  // @text-ok 取证日志
        continue;
      }
      const at = this._SpawnSpot(spec, placed);
      if (!at) { this.log.push({ castId, ok: false, why: "拿不到玩家位置" }); break; }  // @text-ok 取证日志
      let handle = null;
      try {
        handle = this.host.Spawn ? this.host.Spawn({
          castId, label: T(spec.labelKey), x: at.x, z: at.z,
          weapon: spec.weapon || null, squadId: `Companion_${levelId || "?"}`,
        }) : null;
      } catch (err) {
        this.log.push({ castId, ok: false, why: `宿主造人抛异常：${String((err && err.message) || err)}` });  // @text-ok 取证日志
        continue;
      }
      if (!handle) { this.log.push({ castId, ok: false, why: "宿主没造出来（多半是人口预算满了）" }); continue; }  // @text-ok 取证日志
      const mode = spec.mode === "hold" ? "hold" : "follow";
      const member = {
        castId, spec, handle, mode, zone: null, detachUntil: -99, fell: false,
        lane: (spec.slot ?? placed), jitter: HashId(castId),
      };
      this.members.set(castId, member);
      if (mode === "hold") {
        const zone = this._NearestZone(zones, at.x, at.z);
        member.zone = zone;
        if (this.host.SetHold) this.host.SetHold(handle, zone);
      } else if (this.host.SetHold) this.host.SetHold(handle, null);
      this.log.push({ castId, ok: true, mode, x: +at.x.toFixed(1), z: +at.z.toFixed(1) });
      placed += 1;
    }
    return placed;
  }

  /** 换关/收摊：把这一关的人撤掉。**absent 不清** —— 那是剧情事实，不是关卡状态。 */
  Reset(reason = "reset") {
    for (const member of this.members.values()) {
      if (member.handle && this.host.Despawn) {
        try { this.host.Despawn(member.handle); } catch { /* 宿主的事 */ }
      }
    }
    this.members.clear();
    this.levelId = null;
    this.regoalAt = -99;
    this.log = [];
    return reason;
  }

  /**
   * 每帧：把跟随目标喂给 AI。
   *
   * 只按 regoalS 的节奏重设目标 —— 每帧写 goal 等于每帧打断寻路，
   * 表现是同伴在原地一步一顿（这一条与 AiDirector 的守点软约束是同一笔账）。
   *
   * **玩家下的命令优先于跟随。** 轮盘上按了「上刺刀冲锋」「绕过去」之后，
   * 班里的人就归那道命令管了；这一层再每半秒把 goal 拽回玩家身后，
   * 命令等于按了个寂寞 —— 实测就是这样：下了 charge，五个人在玩家脚边打转，
   * 一个都没冲出守区。宿主用 `Busy(handle)` 报「他现在归别人管」，这里让开。
   */
  Update(dt) {
    if (!this.members.size) return 0;
    const now = this.host.Time ? this.host.Time() : (this.regoalAt + dt);
    const player = this.host.PlayerPos ? this.host.PlayerPos() : null;
    let moved = 0;
    // 倒下的人不再跟随，但仍留在名册里（Locate 要能报出「他躺在哪儿」）。
    for (const member of this.members.values()) {
      if (member.fell) continue;
      if (this.host.Alive && member.handle && !this.host.Alive(member.handle)) member.fell = true;
    }
    if (!player) return 0;
    if (now - this.regoalAt < this.tuning.regoalS) return 0;
    this.regoalAt = now;
    const yaw = this.host.PlayerYaw ? this.host.PlayerYaw() : 0;
    for (const member of this.members.values()) {
      if (member.fell || !member.handle) continue;
      if (member.mode !== "follow") continue;
      if (now < member.detachUntil) continue;
      // 玩家的命令、架着的机枪、白刃 QTE …… 谁都比「跟着走」优先。
      if (this.host.Busy && this.host.Busy(member.handle)) continue;
      const spot = this._FollowSpot(player, yaw, member);
      const here = this.host.PositionOf ? this.host.PositionOf(member.handle) : null;
      const far = here ? Math.hypot(here.x - player.x, here.z - player.z) : 0;
      if (here && far > this.tuning.leashM && this.host.Place) {
        // 隔着两条街追不回来：直接归队。**只在离得离谱时做** ——
        // 常态下把人瞬移到玩家身边，玩家会看见同伴凭空出现在眼前。
        this.host.Place(member.handle, spot.x, spot.z);
      } else if (this.host.SetGoal) {
        this.host.SetGoal(member.handle, spot.x, spot.z);
      }
      moved += 1;
    }
    return moved;
  }

  /**
   * 这个人现在在哪儿（世界坐标）。**这是 story.AttachVoice 的 locate 参数。**
   *
   * 返回 null 有三种正常情形：不在这一层的档案里（军官画外音）、这一章没点名、
   * 剧本让他缺席。三种都退化成非空间化播放，不是错误。
   *
   * y 抬到嘴的高度（见 COMPANION_TUNING.mouthY）：宿主给的是脚下坐标，
   * 直接拿去定位的话近处会听成「趴在地上说话」。倒下的人不抬。
   */
  Locate(castId) {
    const member = this.members.get(castId);
    if (!member || !member.handle) return null;
    if (!this.host.PositionOf) return null;
    const at = this.host.PositionOf(member.handle);
    if (!at || !Number.isFinite(at.x)) return null;
    const foot = Number.isFinite(at.y) ? at.y : 0;
    return { x: at.x, y: foot + (member.fell ? this.tuning.fellMouthY : this.tuning.mouthY), z: at.z };
  }

  /** 这个人此刻在不在场（还站着）。 */
  Has(castId) {
    const member = this.members.get(castId);
    return !!(member && member.handle && !member.fell);
  }

  /**
   * 这个人的宿主句柄（场上那一具）。
   *
   * 摆点层要它做两件事：把班里的人塞进扫射航线的 `immune` 白名单
   *（后面还有戏的人一律必不死），以及把某个人交给别的系统当同伴
   *（担架前端、抬罗班长的那两个）。
   *
   * **不许直接读 this.members** —— 那是内部结构；这里给一条窄出口，
   * 将来换存储不影响调用方。倒下的人也返回句柄（尸体也是场上的东西）。
   */
  Handle(castId) {
    const member = this.members.get(castId);
    return member ? member.handle : null;
  }

  /**
   * 剧本指令 ①：某人从此缺席。
   *
   * 罗班长四关牺牲，五关起就不该再出现在任何一章的名册里 —— 所以这条**跨关保留**，
   * 只有 ClearAbsent 能撤销（新开一局、或选章回到他还活着的那一章）。
   * 当场在场的话一并撤走（不是倒地，是「他不在这儿」）。
   */
  SetAbsent(castId, absent = true) {
    if (!castId) return false;
    if (absent) {
      this.absent.add(castId);
      const member = this.members.get(castId);
      if (member) {
        if (member.handle && this.host.Despawn) {
          try { this.host.Despawn(member.handle); } catch { /* 宿主的事 */ }
        }
        this.members.delete(castId);
      }
      return true;
    }
    return this.absent.delete(castId);
  }

  /** 清掉全部缺席宣告（重开一局 / 选章跳回更早的章）。 */
  ClearAbsent() { this.absent.clear(); }

  /**
   * 剧本指令 ②：某人倒下。**走现有倒地**（宿主转成 soldier 的正常死亡链路：
   * 尸体刚体、掉落物、阵亡计数都照旧），不是把人删掉。
   * 倒下的人留在名册里 —— Locate 仍报得出位置，救人那一段要靠它。
   */
  Fell(castId) {
    const member = this.members.get(castId);
    if (!member || !member.handle || member.fell) return false;
    member.fell = true;
    if (this.host.Fell) {
      try { this.host.Fell(member.handle); } catch { /* 宿主的事 */ }
    }
    return true;
  }

  /**
   * 剧本指令 ③：某人临时脱离跟随（小秦蹲下查断点、幺娃去抬人）。
   * seconds ≤ 0 表示一直脱离到 Attach 为止。脱离期间 AI 照常打仗，只是不跟着玩家走。
   */
  Detach(castId, seconds = 0) {
    const member = this.members.get(castId);
    if (!member) return false;
    const now = this.host.Time ? this.host.Time() : 0;
    member.detachUntil = seconds > 0 ? now + seconds : Number.POSITIVE_INFINITY;
    return true;
  }

  /** 撤销 Detach，重新跟上。 */
  Attach(castId) {
    const member = this.members.get(castId);
    if (!member) return false;
    member.detachUntil = -99;
    return true;
  }

  /** 把某人钉在一个路标里待命（军医守院子、机枪副射手守机枪位）。zone=null 改回跟随。 */
  Hold(castId, zone = null) {
    const member = this.members.get(castId);
    if (!member || !member.handle) return false;
    member.mode = zone ? "hold" : "follow";
    member.zone = zone || null;
    if (this.host.SetHold) this.host.SetHold(member.handle, zone || null);
    return true;
  }

  // -------------------------------------------------------------------------

  /** 生成点：玩家身后一圈，按站位序号错开，不叠在一处。 */
  _SpawnSpot(spec, index) {
    const player = this.host.PlayerPos ? this.host.PlayerPos() : null;
    if (!player) return null;
    const yaw = this.host.PlayerYaw ? this.host.PlayerYaw() : 0;
    // 玩家正面 = -Z（与 Script_Player / Script_Ai 同一套约定）
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    // 半圆铺在身后：0 号在正后方，往两边分。
    const slot = spec.slot ?? index;
    const angle = Math.PI + ((slot % 2 === 0 ? 1 : -1) * Math.ceil(slot / 2) * 0.55);
    const dx = fx * Math.cos(angle) - fz * Math.sin(angle);
    const dz = fz * Math.cos(angle) + fx * Math.sin(angle);
    const r = this.tuning.spawnRingM + (slot % 3) * 1.2;
    return { x: player.x + dx * r, z: player.z + dz * r };
  }

  /** 跟随目标：玩家身后 followBackM，按站位序号横向错开。 */
  _FollowSpot(player, yaw, member) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    // 右向量（世界系，玩家正面 = -Z 时右手边 = (-fz, fx) 的反号，见 Script_Main 撒兵那段账）
    const rx = -fz, rz = fx;
    const lane = member.lane;
    const side = (lane % 2 === 0 ? 1 : -1) * Math.ceil(lane / 2);
    const back = this.tuning.followBackM + (lane % 3) * this.tuning.laneSpreadM * 0.5
      + member.jitter * 0.8;
    const lateral = side * this.tuning.laneSpanM;
    return {
      x: player.x - fx * back + rx * lateral,
      z: player.z - fz * back + rz * lateral,
    };
  }

  /** 离出生点最近的那个路标（hold 模式钉在它上面）。 */
  _NearestZone(zones, x, z) {
    let best = null;
    let bestD = Infinity;
    for (const zone of zones || []) {
      if (!zone || !Number.isFinite(zone.x)) continue;
      const d = Math.hypot(zone.x - x, zone.z - z);
      if (d < bestD) { bestD = d; best = zone; }
    }
    if (!best) return null;
    return { id: best.id, x: best.x, z: best.z, radius: Math.min(best.radius ?? this.tuning.holdRadiusM, this.tuning.holdRadiusM) };
  }
}

export default CompanionDirector;
