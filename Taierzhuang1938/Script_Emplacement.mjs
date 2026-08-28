// 《滕县 一九三八》架设武器 —— 可接管的固定机枪位。**纯规则，不许 import three。**
//
// ── 为什么单独一个模块 ───────────────────────────────────────────────────────
// 第五关的招牌就是这挺枪（docs/Data_MissionRemake.md §6 阶段⑥与⑩）：
// 玩家接过最后一个火力点的重机枪掩护担架队 → 控过热 → 优先打掷弹筒 →
// 最终卡壳/弹尽（脚本触发的必然失效）→ 改步枪。
// Data_MissionCh5 的 ENGINE_REQUEST 把它拆成两条：`emplacedGun` 与 `gunJam`。
//
// 这些差别只有一张表的事（射界多宽、多少发过热、几板弹、卡壳判据），
// **不是每个火力点一套逻辑**，所以这里是 `EMPLACEMENT_KINDS` 一张表 + 一台状态机，
// 集成批只写 `CreateEmplacement({ kindId:"Type92Hmg", position, seat, baseYaw })`。
//
// ── 三条纪律 ────────────────────────────────────────────────────────────────
//
// 一、**不夺控制权。** 上枪位与下枪位永远是玩家自己按的：脚本只能 `ForceJam`
//     （把枪弄坏），不能替玩家 `Occupy`。这是 docs/Data_MissionDesign.md 的实机演出
//     规矩，也是第五关成立的前提 —— 顺子回到机枪位必须是玩家自己走回去按的那一下。
//
// 二、**一个战位只填一个人，和 Script_Ai 用同一道闸。** AiDirector.Spawn 早就有
//     「一挺九二式就是一挺」的存量检查（判据是 `WEAPONS[...].emplaced`，战位名存在
//     `soldier.emplacementId` 上）。这里**不另造一套占位表**：spec 给一个 `aiKey`，
//     `SyncNpc(soldiers)` 每帧按 `soldier.emplacementId === aiKey` 认领/释放。
//     NPC 占着时玩家不可接管；NPC 阵亡后战位自动空出（这正是「重新架枪」该有的样子）。
//     NPC 的开火仍由 Script_Ai 结算 —— 这里一发都不替它打。
//
// 三、**弹道不在这里算。** 这一层只决定「这一发在什么时候、从哪儿、朝哪儿出去」，
//     真正的步进积分、命中、破坏、曳光全在装配层的 `Fire(shot)` 钩子里
//     （与玩家步枪同一条 MarchBullet）。所以整台状态机在纯 Node 里跑得完，
//     回归口 `Script_EmplacementTest.mjs`。
//
// ── 键位语义（装配层照这个接线）──────────────────────────────────────────────
//   F（interact）  空位时＝接管（走 Script_Interact 的注册点）；在位时＝离位/弃枪。
//   R（reload）    卡壳时＝拉枪机 / 按住排障；弹板空时＝换弹板。
//   左键           开火（走本层的射速与过热闸，不走 TryFire 那条步枪链）。
//   鼠标           在射界限位内自由瞄准；顶到限位画面就停，不再带着身体转。
//
// ── 过热是这一关的教学 ──────────────────────────────────────────────────────
// §6 阶段④里原射手交代给炊事兵的三句「枪托抵稳。」「短点射。」「莫一直压。」
// 就是这套热量模型的说明书：一条 30 发保弹板一口气压完差不多就顶到红线，
// 而三、五发一点射永远不会过热。台词不是气氛，是判据。

import { WEAPONS } from "./Data_Weapons.mjs";
import { Mulberry32, Clamp, Clamp01 } from "./Script_Noise.mjs";

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

/**
 * 架设武器档案表。**数值只在这里**，文档写常量名不抄数（AGENTS 硬规矩 12）。
 *
 * 射速 / 伤害 / 有效射程 / 换弹时间一律**不在这张表里重复**：
 * 它们在 `Data_Weapons.WEAPONS[weaponId]` 上，这里只放「架起来之后才有的那些数」。
 * 抄一遍的代价见 Data_Weapons 头注 —— 两处数字第二天就会分叉。
 *
 * arcYawDeg / arcUpDeg / arcDownDeg
 *   三脚架的回旋与俯仰限位（度，相对 baseYaw / 水平）。九二式的三脚架是可以
 *   松开回旋卡箍的，但架在射孔或街垒后头时真正限住射界的是工事本身 —— 30° 是
 *   「封住一条街 + 两侧院门」够用、又明显是一挺**固定**武器的宽度。
 * heatPerShot / coolPerS / overheatCoolPerS / resumeHeat / warnHeat
 *   热量 0—1，**升温与散热一直同时在跑**，所以「能压多少发」不是 1/heatPerShot，
 *   而是 1 / (heatPerShot/fireIntervalS − coolPerS)。两个数是照这两条目标解出来的：
 *     ① 一直压着不放 → 差不多一条保弹板打完就顶到红线（教「莫一直压」）；
 *     ② 可持续占空比 = coolPerS / (heatPerShot/fireIntervalS) ≈ 五成
 *        —— 打一梭歇一梭就永远不会过热（教「短点射」）。
 *   resumeHeat 是强制冷却之后放行的门槛（不是 0 —— 停火两秒就能接着压的话，
 *   过热就不是代价了）。
 * jamHeatFloor / jamChanceAtMax
 *   概率性小卡只在**热枪**上发生：低于 floor 一次都不卡，到 1.0 时每发 jamChanceAtMax。
 *   冷枪不卡是有意的 —— 「短点射」的玩家不该被随机数惩罚。
 * clearS / clearHeatVent
 *   小卡排障要按住多久；排完顺手放掉多少热（开盖排壳本来就在散热）。
 * deadPulls
 *   **必然失效**（ForceJam）之后要拉几次枪机才判定这挺枪彻底废了。
 *   §6 阶段⑩②「顺子拉枪机『妈卖批！』『早不卡晚不卡！』」就是这几下。
 * beltRounds / belts
 *   一板多少发、身边有几板。九二式是 30 发金属保弹板横向供弹（reloadKind:"stripFeed"）。
 * spreadDeg
 *   架起来的枪比端着的稳得多：比中正式腰射的 spreadHipDeg 小一个量级。
 */
export const EMPLACEMENT_KINDS = {
  Type92Hmg: {
    id: "Type92Hmg",
    weaponId: "Type92Hmg",
    label: "九二式重机枪",
    note: "架在街垒上的重机枪。短点射，莫一直压。",
    arcYawDeg: 30, arcUpDeg: 12, arcDownDeg: 10,
    // 200 rpm（0.3 s 一发）：净升温 0.119/s → 一直压着约 8.4 s / 28 发顶红线，
    // 一条 30 发保弹板压到底正好过热；可持续占空比 0.125/0.2433 ≈ 51%。
    heatPerShot: 0.073, coolPerS: 0.125, overheatCoolPerS: 0.20,
    resumeHeat: 0.35, warnHeat: 0.70,
    jamHeatFloor: 0.65, jamChanceAtMax: 0.035,
    clearS: 1.2, clearHeatVent: 0.30,
    deadPulls: 3,
    beltRounds: 30, belts: 5, maxBelts: 8,
    spreadDeg: 0.30,
    // 枪身相对 position 的几何：枪口往前多少、瞄准线离基座多高、射手站在后头多远。
    muzzleAheadM: 0.55, sightRiseM: 0.10, seatBackM: 0.85,
    stance: "crouch",
    sfxFire: "type92", sfxDry: "bolt", sfxBolt: "bolt",
    sfxReload: "stripperLoad", sfxMount: "magIn",
  },
  Zb26Nest: {
    id: "Zb26Nest",
    weaponId: "Zb26",
    label: "捷克式（架起来的）",
    note: "两脚架撑在墙垛上。二十发一匣，换得勤。",
    // 两脚架只能在垛口那一段扫，比三脚架窄；但抬得起来打屋顶。
    arcYawDeg: 22, arcUpDeg: 18, arcDownDeg: 12,
    // 500 rpm（0.12 s 一发）：净升温 0.139/s → 一直压着约 7.2 s / 60 发顶红线；
    // 一匣 20 发压到底只到七成热，换匣那 3 秒就把它散掉 —— 弹匣本身就是节奏器。
    heatPerShot: 0.0347, coolPerS: 0.15, overheatCoolPerS: 0.24,
    resumeHeat: 0.30, warnHeat: 0.68,
    // 捷克式可以快速换枪管，热到卡壳之前枪管就该换了 —— 卡壳概率比九二式低。
    jamHeatFloor: 0.72, jamChanceAtMax: 0.025,
    clearS: 1.0, clearHeatVent: 0.35,
    deadPulls: 3,
    beltRounds: 20, belts: 6, maxBelts: 10,
    spreadDeg: 0.42,
    muzzleAheadM: 0.45, sightRiseM: 0.08, seatBackM: 0.70,
    stance: "prone",
    sfxFire: "zb26", sfxDry: "bolt", sfxBolt: "bolt",
    sfxReload: "magIn", sfxMount: "magIn",
  },
};

/** 卸下之后再上枪位之前的空窗。没有它，一次 F 会在同一帧下枪又上枪。 */
const REMOUNT_LOCK_S = 0.40;

/**
 * 取一个数，取不到就用兜底值。
 * **不许写 `Number(x) || fallback`**：yaw = 0 是完全合法的朝向（正东偏南那条轴），
 * 而 0 是 falsy —— 那个写法会把「正对着射界中心」悄悄换成兜底值。
 */
function Num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** 把角度绕进 (-π, π]。射界判定必须绕环，否则 baseYaw 在 ±π 附近整条射界会翻面。 */
function WrapPi(angle) {
  let a = Num(angle) % TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}

/** 把 yaw 夹进 [base-span, base+span]（弧度，绕环安全）。 */
export function ClampYawToArc(yaw, baseYaw, spanRad) {
  const delta = WrapPi(yaw - baseYaw);
  return baseYaw + Clamp(delta, -spanRad, spanRad);
}

/**
 * host 是装配层注入的窄接口（同 CarrySystem / MeleeQteDirector 的约定）：
 *   Play(name, opts)            放一条音效
 *   Hint(text, seconds)         一次性提示语
 *   Say(who, text, seconds)     让人喊一句
 *   Time() -> number            关内秒表（取证与冷却用）
 *   Fire(shot) -> any           **真正把这一发打出去**（弹道/命中/破坏/曳光/枪口焰）
 *   Aim(emplacementView)        每帧把枪的指向交回去（世界模型跟着转）
 *   Seat({id,seat,yaw,stance})  接管那一刻把人挪到射手位（装配层才有物理体）
 */
export class EmplacementSystem {
  constructor(host = {}, { seed = 1938 } = {}) {
    this.host = host;
    /** id -> 战位。摆点是集成批的事，引擎只读这张表。 */
    this.guns = new Map();
    this.autoId = 0;
    /** 玩家此刻占着的那一个；null = 没上枪位。 */
    this.mounted = null;
    this.player = null;
    this.firing = false;
    this.clearing = false;
    this.remountLockS = 0;
    this.rnd = Mulberry32(seed >>> 0);
    this.stats = {
      created: 0, occupied: 0, vacated: 0, shots: 0, overheats: 0,
      minorJams: 0, fatalJams: 0, cleared: 0, pulls: 0, dead: 0,
      reloads: 0, resupplies: 0, npcTaken: 0, npcFreed: 0, refused: 0,
    };
    /** 最后一次离位的取证记录。 */
    this.lastVacate = null;
  }

  get Mounted() { return !!this.mounted; }
  get MountedId() { return this.mounted ? this.mounted.id : null; }
  /** 上着枪位时常规武器与冲刺一律停用 —— 装配层读这一条。 */
  get Blocking() { return !!this.mounted; }
  get GunCount() { return this.guns.size; }

  Time() { return Number(this.host.Time?.() ?? 0); }

  // -------------------------------------------------------------------------
  // 摆点
  // -------------------------------------------------------------------------

  /**
   * 摆一个战位。**同 id 重复注册是覆盖，不是报错** —— 换关重摆是常态。
   *
   * @param {object} spec
   *   id         字符串；不给就自动编号
   *   kindId     EMPLACEMENT_KINDS 的键（默认 Type92Hmg）
   *   position   {x,y,z} 枪身基座（回旋轴）所在
   *   seat       {x,y,z} 射手站位；不给就按 baseYaw 往后退 seatBackM 现算
   *   baseYaw    射界中心朝向（弧度，全项目 -Z 契约：0 = 面朝 -Z）
   *   arcYawDeg / arcUpDeg / arcDownDeg   覆盖档案表的射界
   *   belts      开局身边有几板（不给用档案表）
   *   aiKey      与 Script_Ai 对齐的战位名（`${side}_${squadId}`）；给了就由 SyncNpc 认领
   *   side       这挺枪是谁的（"nra" / "ija"）；玩家只接管 nra 的
   *   label / note / tag / payload
   *   OnOccupy(info) / OnVacate(info) / OnJam(info) / OnDead(info) / OnEmpty(info)
   * @returns {string} 战位 id
   */
  CreateEmplacement(spec = {}) {
    const kind = EMPLACEMENT_KINDS[spec.kindId] || EMPLACEMENT_KINDS.Type92Hmg;
    const id = String(spec.id ?? `emp_${++this.autoId}`);
    const weapon = WEAPONS[kind.weaponId] || {};
    const baseYaw = WrapPi(spec.baseYaw);
    const position = {
      x: Num(spec.position?.x), y: Num(spec.position?.y), z: Num(spec.position?.z),
    };
    const seat = spec.seat ? {
      x: Num(spec.seat.x), y: Num(spec.seat.y), z: Num(spec.seat.z),
    } : {
      // 射手在枪后头：朝向是 -Z，所以「往后」就是 +（sin,cos）方向。
      x: position.x + Math.sin(baseYaw) * kind.seatBackM,
      y: position.y,
      z: position.z + Math.cos(baseYaw) * kind.seatBackM,
    };
    const belts = Math.max(0, Math.floor(Number(spec.belts ?? kind.belts)));
    const gun = {
      id, kind, weapon,
      label: String(spec.label ?? kind.label),
      note: String(spec.note ?? kind.note ?? ""),
      side: spec.side === "ija" ? "ija" : "nra",
      position, seat, baseYaw,
      arc: {
        yaw: Num(spec.arcYawDeg ?? kind.arcYawDeg) * D2R,
        up: Num(spec.arcUpDeg ?? kind.arcUpDeg) * D2R,
        down: Num(spec.arcDownDeg ?? kind.arcDownDeg) * D2R,
      },
      yaw: baseYaw, pitch: 0,
      heat: 0, overheated: false,
      rounds: belts > 0 ? kind.beltRounds : 0,
      belts: belts > 0 ? belts - 1 : 0,
      reloadT: 0,
      jam: null,
      dead: false,
      occupant: null,           // null | "player" | { npc: soldier }
      npc: null,
      aiKey: spec.aiKey ?? null,
      fireCooldown: 0,
      shots: 0, roundsFired: 0,
      tag: spec.tag ?? null,
      payload: spec.payload ?? null,
      OnOccupy: spec.OnOccupy ?? null,
      OnVacate: spec.OnVacate ?? null,
      OnJam: spec.OnJam ?? null,
      OnDead: spec.OnDead ?? null,
      OnEmpty: spec.OnEmpty ?? null,
      createdAt: this.Time(),
    };
    if (this.mounted && this.mounted.id === id) this.Vacate("replaced");
    this.guns.set(id, gun);
    this.stats.created += 1;
    return id;
  }

  Emplacement(id) { return this.guns.get(String(id)) || null; }
  List(tag = null) {
    return [...this.guns.values()].filter((gun) => tag === null || gun.tag === tag);
  }

  Remove(id) {
    const gun = this.guns.get(String(id));
    if (!gun) return false;
    if (this.mounted === gun) this.Vacate("removed");
    return this.guns.delete(String(id));
  }

  /** 按 tag 批量清理；不给 tag 就整表清空（换关走这一条）。 */
  Clear(tag = null) {
    let removed = 0;
    for (const [id, gun] of [...this.guns]) {
      if (tag !== null && gun.tag !== tag) continue;
      if (this.mounted === gun) this.Vacate("cleared");
      this.guns.delete(id);
      removed += 1;
    }
    return removed;
  }

  /** 换关 / 复活 / 出错的兜底。不记 vacated，也不放音。 */
  Reset(reason = "reset") {
    if (this.mounted) {
      const gun = this.mounted;
      this.mounted = null;
      gun.occupant = gun.npc ? { npc: gun.npc } : null;
      this.lastVacate = { id: gun.id, reason, how: "reset" };
    }
    this.firing = false;
    this.clearing = false;
    this.remountLockS = 0;
    return true;
  }

  // -------------------------------------------------------------------------
  // 占位
  // -------------------------------------------------------------------------

  /**
   * 现在能不能接管这一挺。**返回理由**而不是布尔：HUD 要把「有人在打」
   * 与「这挺枪废了」说成两句不同的话，一个 false 说不清。
   */
  CanOccupy(id, player = this.player) {
    const gun = this.guns.get(String(id));
    if (!gun) return { ok: false, reason: "none", text: "" };
    if (this.mounted) {
      return this.mounted === gun
        ? { ok: false, reason: "already", text: "" }
        : { ok: false, reason: "busy", text: "手上已经有一挺了" };
    }
    if (this.remountLockS > 0) return { ok: false, reason: "cooldown", text: "" };
    if (gun.side !== "nra") return { ok: false, reason: "enemy", text: "" };
    if (gun.dead) return { ok: false, reason: "dead", text: "这挺枪废了" };
    // NPC 占着的战位玩家不能抢 —— 与 Script_Ai 的「一个战位只填一个人」同一道闸。
    if (gun.npc && gun.npc.alive !== false) return { ok: false, reason: "manned", text: "有人在打" };
    if (player && player.Alive === false) return { ok: false, reason: "down", text: "" };
    return { ok: true, reason: "ok", text: "接管机枪" };
  }

  /**
   * 玩家上枪位。**只能由玩家自己那一下 F 触发**（走 Script_Interact 的注册点），
   * 脚本不许替他上 —— 见文件头「三条纪律」第一条。
   */
  Occupy(id, player = this.player) {
    const check = this.CanOccupy(id, player);
    if (!check.ok) {
      if (check.text) this.host.Hint?.(check.text, 1.8);
      if (check.reason === "manned" || check.reason === "dead") this.stats.refused += 1;
      return false;
    }
    const gun = this.guns.get(String(id));
    if (player) this.player = player;
    gun.occupant = "player";
    // 接上枪位那一刻，指向从玩家此刻的视线出发但立刻夹进射界 ——
    // 不夹的话第一帧会出现「枪指着身后」再被拉回来的一抖。
    const yaw = this.player ? Num(this.player.yaw, gun.baseYaw) : gun.baseYaw;
    const pitch = this.player ? Num(this.player.pitch) : 0;
    gun.yaw = ClampYawToArc(yaw, gun.baseYaw, gun.arc.yaw);
    gun.pitch = Clamp(pitch, -gun.arc.down, gun.arc.up);
    this.mounted = gun;
    this.firing = false;
    this.clearing = false;
    this.stats.occupied += 1;
    this.host.Play?.(gun.kind.sfxMount, { volume: 0.5 });
    // 「视角接到枪上」这件事的唯一动作：把人挪到射手位、换成射手该有的姿态。
    // 这一层不认识物理体，所以交给装配层去挪 —— 它才有 body.Teleport。
    this.host.Seat?.({
      id: gun.id, seat: { ...gun.seat }, yaw: gun.yaw, stance: gun.kind.stance,
    });
    gun.OnOccupy?.(this.Info(gun, "player"));
    return true;
  }

  /**
   * 玩家下枪位。枪废了的时候这一下就是「弃枪」——
   * §6 阶段⑩②「改步枪＋手榴弹」的工程落点。
   */
  Vacate(reason = "player") {
    const gun = this.mounted;
    if (!gun) return false;
    this.mounted = null;
    this.firing = false;
    this.clearing = false;
    this.remountLockS = REMOUNT_LOCK_S;
    gun.occupant = gun.npc ? { npc: gun.npc } : null;
    const info = { ...this.Info(gun, "player"), reason, abandoned: !!gun.dead };
    this.lastVacate = info;
    this.stats.vacated += 1;
    gun.OnVacate?.(info);
    return true;
  }

  /**
   * NPC 占位。**与 Script_Ai 的战位闸同一份事实**：调用方要么直接把那个
   * soldier 交进来（演员占位），要么给 spec 配 `aiKey` 让 SyncNpc 自己认领。
   */
  NpcOccupy(id, soldier) {
    const gun = this.guns.get(String(id));
    if (!gun || !soldier) return false;
    if (this.mounted === gun) return false;      // 玩家在打，不许把人塞进来
    if (gun.npc && gun.npc !== soldier && gun.npc.alive !== false) return false;
    gun.npc = soldier;
    gun.occupant = { npc: soldier };
    this.stats.npcTaken += 1;
    return true;
  }

  NpcVacate(id, reason = "npc") {
    const gun = this.guns.get(String(id));
    if (!gun || !gun.npc) return false;
    gun.npc = null;
    if (this.mounted !== gun) gun.occupant = null;
    this.stats.npcFreed += 1;
    gun.OnVacate?.({ ...this.Info(gun, "npc"), reason });
    return true;
  }

  /**
   * 每帧按 `soldier.emplacementId` 认领 / 释放 NPC 射手。
   *
   * 这是「别造两套」那条纪律的落点：占位的唯一事实在 AiDirector.Spawn 写的
   * `emplacementId` 上，这里只是读它。射手阵亡 → 战位空出 → 下一次补兵会重新填人，
   * 玩家也能上去 —— §6 阶段⑥「射手阵亡、副射手重伤」正是这个状态。
   */
  SyncNpc(soldiers = []) {
    if (!this.guns.size) return 0;
    let bound = 0;
    for (const gun of this.guns.values()) {
      if (!gun.aiKey) continue;
      if (gun.npc && (gun.npc.alive === false || gun.npc.emplacementId !== gun.aiKey)) {
        this.NpcVacate(gun.id, "gunnerDown");
      }
      if (gun.npc) { bound += 1; continue; }
      if (this.mounted === gun) continue;
      const taker = soldiers.find((s) => s && s.alive && s.emplacementId === gun.aiKey);
      if (taker && this.NpcOccupy(gun.id, taker)) bound += 1;
    }
    return bound;
  }

  // -------------------------------------------------------------------------
  // 卡壳 / 排障 / 补弹
  // -------------------------------------------------------------------------

  /**
   * **脚本触发的必然失效**（ENGINE_REQUEST `gunJam`）。
   *
   * 与概率性小卡完全两回事：这一条排不掉。玩家拉几次枪机（`PullBolt`）之后
   * 判定这挺枪彻底废了，只能弃枪改步枪。集成批在「最后防守第二层」调它。
   *
   * @param {string} id
   * @param {object} opts
   *   mode   "jam" 只卡壳 / "ammoOut" 只打光 / "both"（默认，§6 写的就是「卡壳/弹尽」）
   *   pulls  要拉几下才判废（默认取档案表 deadPulls）
   *   silent 不放音、不弹提示（换关兜底用）
   */
  ForceJam(id, opts = {}) {
    const gun = this.guns.get(String(id));
    if (!gun || gun.dead) return false;
    const mode = opts.mode || "both";
    if (mode === "ammoOut" || mode === "both") { gun.rounds = 0; gun.belts = 0; }
    if (mode === "jam" || mode === "both") {
      gun.jam = {
        kind: "fatal", pulls: 0, t: 0,
        need: Math.max(1, Math.floor(Number(opts.pulls ?? gun.kind.deadPulls))),
      };
    }
    gun.reloadT = 0;
    this.clearing = false;
    this.stats.fatalJams += 1;
    if (!opts.silent) {
      this.host.Play?.(gun.kind.sfxDry, { volume: 0.5, pitch: 1.35 });
      if (this.mounted === gun) this.host.Hint?.("卡壳了 —— 按 R 拉枪机", 2.6);
    }
    gun.OnJam?.({ ...this.Info(gun, "script"), kind: "fatal", forced: true });
    return true;
  }

  /**
   * 拉一次枪机（R 点按）。小卡这一下就当排障起手；必然失效那一条数着拉了几下，
   * 拉够了就宣布这挺枪废了。**判废之后不自动离位** —— 走不走是玩家的事。
   */
  PullBolt() {
    const gun = this.mounted;
    if (!gun || gun.dead) return false;
    const jam = gun.jam;
    if (!jam) {
      // 没卡壳时 R 是换弹板（弹板还满的话什么也不做，不弹废话提示）。
      return this.Reload();
    }
    this.stats.pulls += 1;
    jam.pulls += 1;
    this.host.Play?.(gun.kind.sfxBolt, { volume: 0.55, pitch: 0.92 });
    if (jam.kind !== "fatal") {
      // 小卡：拉一下就开始排，剩下的进度交给按住（BeginClear/Update）。
      this.clearing = true;
      return true;
    }
    if (jam.pulls >= jam.need) {
      gun.dead = true;
      this.stats.dead += 1;
      this.host.Hint?.("这挺枪废了。按 F 弃枪。", 3.4);
      gun.OnDead?.(this.Info(gun, "player"));
      return true;
    }
    this.host.Hint?.("拉不动 —— 再来", 1.4);
    return true;
  }

  /** 按住 R 排障（小卡）。必然失效那一条按住也没用，只有拉枪机的次数算数。 */
  BeginClear() {
    const gun = this.mounted;
    if (!gun || gun.dead || !gun.jam || gun.jam.kind === "fatal") return false;
    this.clearing = true;
    return true;
  }

  EndClear() {
    if (!this.clearing) return false;
    this.clearing = false;
    // 松手不清零：手抖一下不该从头再来（与 Script_Interact 的 hold 型同一条口径）。
    return true;
  }

  /** 换一板弹。弹板已满、身边没板、枪废了三种情况都返回 false 且不吭声。 */
  Reload() {
    const gun = this.mounted;
    if (!gun || gun.dead || gun.jam) return false;
    if (gun.reloadT > 0) return false;
    if (gun.rounds >= gun.kind.beltRounds) return false;
    if (gun.belts <= 0) {
      this.host.Hint?.("没得弹板了", 1.8);
      return false;
    }
    // 板在按下 R 那一刻就从身边拿走了，不是装完才扣：中途被打断（人倒了、换关）
    // 那一板也回不来 —— 弹药经济必须在**取用**的那一刻结账。
    gun.belts -= 1;
    gun.reloadT = Math.max(0.2, Number(gun.weapon.reloadTimeS) || 4.0);
    this.host.Play?.(gun.kind.sfxReload, { volume: 0.6 });
    this.stats.reloads += 1;
    return true;
  }

  /**
   * 补弹（队友/玩家往战位里送弹药箱）。走 Script_Interact 的注册点摆，
   * 预制在文件末尾 `AmmoResupplyInteraction`。废了的枪不补 —— 补了也打不响。
   */
  Resupply(id, belts = 1) {
    const gun = this.guns.get(String(id));
    if (!gun || gun.dead) return false;
    const add = Math.max(1, Math.floor(Number(belts) || 1));
    const before = gun.belts;
    gun.belts = Math.min(gun.kind.maxBelts, gun.belts + add);
    if (gun.belts === before) return false;
    this.stats.resupplies += 1;
    this.host.Play?.(gun.kind.sfxReload, { volume: 0.5 });
    return true;
  }

  // -------------------------------------------------------------------------
  // 瞄准与开火
  // -------------------------------------------------------------------------

  /** 左键按住/松开。真正的射速与过热闸在 Update 里推。 */
  SetFire(down) { this.firing = !!down && !!this.mounted; return this.firing; }

  /** 这一发从哪儿出去、朝哪儿。世界模型与枪口焰也读它。 */
  Muzzle(gun = this.mounted) {
    if (!gun) return null;
    const cp = Math.cos(gun.pitch), sp = Math.sin(gun.pitch);
    const dx = -Math.sin(gun.yaw) * cp, dy = sp, dz = -Math.cos(gun.yaw) * cp;
    const ahead = gun.kind.muzzleAheadM;
    return {
      origin: {
        x: gun.position.x + dx * ahead,
        y: gun.position.y + gun.kind.sightRiseM + dy * ahead,
        z: gun.position.z + dz * ahead,
      },
      dir: { x: dx, y: dy, z: dz },
    };
  }

  /** 现在打不打得出去；打不出去时给一句**理由**（HUD 用它决定显示哪一条）。 */
  FireBlock(gun = this.mounted) {
    if (!gun) return "none";
    if (gun.dead) return "dead";
    if (gun.jam) return "jam";
    if (gun.reloadT > 0) return "reload";
    if (gun.overheated) return "overheat";
    if (gun.rounds <= 0) return gun.belts > 0 ? "empty" : "out";
    return null;
  }

  /**
   * 每帧。**排在 player.Update 之后** —— 射界限位要用这一帧的视线，
   * 夹晚一帧就会看见画面先越界再被拉回来。
   */
  Update(dt, player = this.player) {
    const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
    if (player) this.player = player;
    if (this.remountLockS > 0) this.remountLockS = Math.max(0, this.remountLockS - step);

    for (const gun of this.guns.values()) {
      // 散热对每一挺都在跑：NPC 打热的枪，玩家接过来时是热的。
      const cool = (gun.overheated ? gun.kind.overheatCoolPerS : gun.kind.coolPerS) * step;
      gun.heat = Math.max(0, gun.heat - cool);
      if (gun.overheated && gun.heat <= gun.kind.resumeHeat) {
        gun.overheated = false;
        if (this.mounted === gun) this.host.Hint?.("凉下来了 —— 短点射", 2.0);
      }
      if (gun.reloadT > 0) {
        gun.reloadT = Math.max(0, gun.reloadT - step);
        if (gun.reloadT === 0) gun.rounds = gun.kind.beltRounds;
      }
      if (gun.fireCooldown > 0) gun.fireCooldown = Math.max(0, gun.fireCooldown - step);
      // 战位上的人没了（阵亡/被移走）：战位空出来。
      if (gun.npc && gun.npc.alive === false) this.NpcVacate(gun.id, "gunnerDown");
    }

    const gun = this.mounted;
    if (!gun) { this.firing = false; this.clearing = false; return null; }

    // 人倒了 / 战位没了：自然离位。不记「弃枪」——那是另一件事。
    if (this.player && this.player.Alive === false) { this.Vacate("playerDown"); return null; }

    // --- 射界：限位内自由瞄准，顶到边就停 -----------------------------------
    if (this.player) {
      gun.yaw = ClampYawToArc(Num(this.player.yaw, gun.yaw), gun.baseYaw, gun.arc.yaw);
      gun.pitch = Clamp(Num(this.player.pitch), -gun.arc.down, gun.arc.up);
      this.player.yaw = gun.yaw;
      this.player.pitch = gun.pitch;
      // 自由瞄准那一段在架上没有意义（枪就固定在座上），清掉免得它把视线推出射界。
      this.player.aimYaw = 0;
      this.player.aimPitch = 0;
    }

    // --- 排障进度 -----------------------------------------------------------
    if (gun.jam && gun.jam.kind !== "fatal") {
      if (this.clearing) {
        gun.jam.t = Clamp01(gun.jam.t + step / gun.kind.clearS);
        if (gun.jam.t >= 1) {
          gun.jam = null;
          this.clearing = false;
          this.stats.cleared += 1;
          // 开盖排壳本来就在散热：排完顺手放掉一截，这是小卡唯一的"好处"。
          gun.heat = Math.max(0, gun.heat - gun.kind.clearHeatVent);
          if (gun.heat <= gun.kind.resumeHeat) gun.overheated = false;
          this.host.Play?.(gun.kind.sfxBolt, { volume: 0.6 });
          this.host.Hint?.("排出来了", 1.6);
        }
      }
    } else if (this.clearing) {
      this.clearing = false;
    }

    // --- 开火 ---------------------------------------------------------------
    const shots = [];
    if (this.firing) {
      const block = this.FireBlock(gun);
      if (block === "empty" || block === "out") {
        // 空膛的"咔"只在**刚扣下**那一下响（fireCooldown 拿来当去重窗口），
        // 不然按住左键会得到一串每 0.3 秒一次的干咔。
        if (gun.fireCooldown <= 0) {
          gun.fireCooldown = 0.55;
          this.host.Play?.(gun.kind.sfxDry, { volume: 0.34, pitch: 1.5 });
          if (block === "empty") this.host.Hint?.("按 R 换弹板", 2.0);
          else {
            this.host.Hint?.("弹尽", 2.0);
            gun.OnEmpty?.(this.Info(gun, "player"));
          }
        }
      } else if (!block) {
        const interval = Math.max(0.02, Number(gun.weapon.fireIntervalS) || 0.3);
        // 一帧可能跨过不止一个射击间隔（低帧率），但**每帧最多两发**：
        // 不封顶的话卡一下就会在同一帧喷十几发，热量与弹药一起瞬间见底。
        for (let n = 0; n < 2 && gun.fireCooldown <= 0 && !this.FireBlock(gun); n += 1) {
          gun.fireCooldown += interval;
          shots.push(this.EmitShot(gun));
        }
      }
    }
    if (this.host.Aim) this.host.Aim(this.View());
    return shots.length ? shots : null;
  }

  /** 真的打出一发：扣弹、升温、掷骰子看卡不卡，然后把这一发交给装配层。 */
  EmitShot(gun) {
    const muzzle = this.Muzzle(gun);
    gun.rounds -= 1;
    gun.shots += 1;
    gun.roundsFired += 1;
    this.stats.shots += 1;
    gun.heat = Clamp01(gun.heat + gun.kind.heatPerShot);
    const shot = {
      id: gun.id,
      weaponId: gun.kind.weaponId,
      origin: muzzle.origin,
      dir: muzzle.dir,
      spreadDeg: gun.kind.spreadDeg,
      damage: Number(gun.weapon.damage) || 80,
      rangeM: Number(gun.weapon.effectiveRangeM) || 800,
      index: gun.shots,
      // 机枪每发都出曳光：满场只有靠它才读得出火力从哪个方向压过来
      //（与玩家步枪的 1/5 比例是两条不同的账，见 Script_Main 的 TRACER_EVERY）。
      tracer: true,
      heat: gun.heat,
      side: gun.side,
    };
    this.host.Play?.(gun.kind.sfxFire, { position: { ...muzzle.origin }, priority: true });
    this.host.Fire?.(shot);
    // 过热：到红线就强制停火，退到 resumeHeat 才放行。
    if (!gun.overheated && gun.heat >= 1) {
      gun.overheated = true;
      this.stats.overheats += 1;
      this.host.Hint?.("枪管红了 —— 停火", 2.6);
      this.host.Say?.("你", "莫一直压！", 1.8);
    }
    // 概率性小卡：只有热枪才卡。冷枪不卡是有意的 —— 打短点射的玩家不该被随机数罚。
    const floor = gun.kind.jamHeatFloor;
    if (!gun.jam && gun.heat > floor) {
      const chance = gun.kind.jamChanceAtMax * ((gun.heat - floor) / Math.max(1e-3, 1 - floor));
      if (this.rnd() < chance) {
        gun.jam = { kind: "minor", pulls: 0, t: 0, need: 1 };
        this.stats.minorJams += 1;
        this.host.Play?.(gun.kind.sfxDry, { volume: 0.5, pitch: 1.3 });
        this.host.Hint?.("卡壳 —— 按住 R 排障", 2.4);
        gun.OnJam?.({ ...this.Info(gun, "player"), kind: "minor", forced: false });
      }
    }
    return shot;
  }

  // -------------------------------------------------------------------------
  // 快照
  // -------------------------------------------------------------------------

  Info(gun, who) {
    return {
      id: gun.id, kindId: gun.kind.id, label: gun.label, who,
      payload: gun.payload, tag: gun.tag,
      heat: gun.heat, rounds: gun.rounds, belts: gun.belts,
      dead: !!gun.dead, jam: gun.jam ? gun.jam.kind : null,
      shots: gun.shots,
    };
  }

  /**
   * 给 HUD 的脱敏快照。**HUD 只读这个**，不认识 gun 本体。
   * `prompt` 是热条底下那一行字，`exit` 是「按 F 干什么」——
   * 枪废了以后那两个字要从「离位」变成「弃枪」，否则玩家读不出这挺枪没了。
   */
  View() {
    const gun = this.mounted;
    if (!gun) return null;
    const block = this.FireBlock(gun);
    const heatState = gun.overheated ? "overheat"
      : gun.heat >= gun.kind.warnHeat ? "hot"
        : gun.heat >= gun.kind.warnHeat * 0.5 ? "warm" : "cool";
    const jam = gun.jam
      ? { kind: gun.jam.kind, t: Clamp01(gun.jam.t), pulls: gun.jam.pulls, need: gun.jam.need }
      : null;
    const prompt = gun.dead ? "这挺枪废了"
      : jam ? (jam.kind === "fatal" ? `拉枪机（${jam.pulls}/${jam.need}）` : "按住 R 排障")
        : gun.reloadT > 0 ? "换弹板……"
          : gun.overheated ? "过热 —— 停火"
            : block === "empty" ? "按 R 换弹板"
              : block === "out" ? "弹尽"
                : heatState === "hot" ? "短点射。莫一直压。" : "";
    return {
      active: true,
      id: gun.id,
      kindId: gun.kind.id,
      label: gun.label,
      note: gun.note,
      heat: gun.heat,
      heatState,
      warnHeat: gun.kind.warnHeat,
      overheated: !!gun.overheated,
      rounds: gun.rounds,
      beltRounds: gun.kind.beltRounds,
      belts: gun.belts,
      reloading: gun.reloadT > 0,
      // 准心画的是**这一枪真实的散布锥**（同 Script_Hud.SetCrosshair 的口径）——
      // 架着枪的时候那个锥来自这里，不是玩家手上那支步枪。
      spreadDeg: gun.kind.spreadDeg,
      jam,
      dead: !!gun.dead,
      block,
      yaw: gun.yaw, pitch: gun.pitch,
      arc: { ...gun.arc },
      baseYaw: gun.baseYaw,
      // 顶到射界边了没有：HUD 要拿它给限位一点视觉反馈（不然玩家只觉得鼠标坏了）。
      atYawLimit: Math.abs(Math.abs(WrapPi(gun.yaw - gun.baseYaw)) - gun.arc.yaw) < 1e-3,
      prompt,
      exit: gun.dead ? "弃枪" : "离位",
      blockFire: false,
    };
  }

  /** 取证口（Debug.Emplacement）。 */
  State() {
    return {
      mounted: this.MountedId,
      view: this.View(),
      firing: !!this.firing,
      clearing: !!this.clearing,
      remountLockS: this.remountLockS,
      stats: { ...this.stats },
      lastVacate: this.lastVacate ? { ...this.lastVacate } : null,
      guns: [...this.guns.values()].map((gun) => ({
        id: gun.id, kindId: gun.kind.id, tag: gun.tag, side: gun.side,
        heat: gun.heat, overheated: !!gun.overheated,
        rounds: gun.rounds, belts: gun.belts, dead: !!gun.dead,
        jam: gun.jam ? gun.jam.kind : null,
        occupant: gun.occupant === "player" ? "player" : (gun.npc ? "npc" : null),
        npcId: gun.npc ? (gun.npc.id ?? null) : null,
        aiKey: gun.aiKey,
        shots: gun.shots,
        yaw: gun.yaw, pitch: gun.pitch,
        position: { ...gun.position }, seat: { ...gun.seat },
      })),
    };
  }
}

// ===========================================================================
// 交互预制
//
// 与 Script_Interact 末尾那八个救护预制同一套约定：**纯函数**，吃一份摆点参数，
// 吐一个可以直接 `interact.Register(spec)` 的 spec。引擎不知道第五关在哪儿摆了几挺。
//
// ── 摆点示例（集成批照抄这一段）──────────────────────────────────────────────
//
//   import { EmplacementInteraction, AmmoResupplyInteraction } from "./Script_Emplacement.mjs";
//
//   const T = window.Taierzhuang;
//   // §6 阶段⑥「最后一个火力点」：掩护长街的那挺机枪，射手还趴在枪身上。
//   const gunId = T.emplacement.CreateEmplacement({
//     id: "ch5_lastNest", tag: "CH5_Chengqiang", kindId: "Type92Hmg",
//     position: { x: -230, y: 0, z: 0 },      // 街心那道街垒后头
//     baseYaw: -Math.PI / 2,                  // 面朝东（+X）——日军是从长街那头压过来的
//     arcYawDeg: 34, belts: 4,
//     OnOccupy: () => story.Signal("GunNestTaken"),
//     OnDead: () => story.Signal("GunJam"),
//   });
//   T.interact.Register(EmplacementInteraction({
//     id: "ch5_lastNest_take", tag: "CH5_Chengqiang",
//     emplacement: T.emplacement, gunId, carry: T.carry,   // 抬着担架就不出现
//   }));
//   T.interact.Register(AmmoResupplyInteraction({
//     id: "ch5_lastNest_ammo", tag: "CH5_Chengqiang",
//     emplacement: T.emplacement, gunId,
//     position: { x: -232, y: 0, z: 2 },      // 墙根那口弹药箱
//     Consume: () => inventory.Take("hmgBelt"),
//   }));
//
//   // §6 阶段⑩②：最后防守第二层，脚本把这挺枪弄坏（卡壳 + 弹尽）。
//   // **不许替玩家离位** —— 拉几下枪机、什么时候弃枪，是玩家自己的事。
//   T.emplacement.ForceJam(gunId);            // 台词 ch5_shunzi_12/13 与它同拍
// ===========================================================================

/**
 * 「接管机枪」交互点。tap —— 上枪位不该让人按住读条，那一下就该立刻接上。
 *
 * 锚点默认取战位的**射手站位**而不是枪身：玩家是站到射手位上去的，
 * 把锚点放在枪身上会出现「贴着枪管侧面也能接管」。
 */
export function EmplacementInteraction({
  id, emplacement, gunId, tag = null, label,
  position, Anchor, reachM = 1.9, facingDot = 0.10,
  priority = 20, carry = null, Available = null, OnComplete, payload = null,
} = {}) {
  const Gun = () => emplacement?.Emplacement(gunId) || null;
  return {
    id: id ?? `${gunId}_take`,
    tag, payload,
    kind: "emplacement",
    gesture: "tap", seconds: 0,
    // 一次性会在接管之后把点摘掉 —— 而这挺枪是要反复上下的（§6 阶段⑨「重占机枪位」）。
    once: false,
    reachM, facingDot, priority,
    Anchor: Anchor || (() => (position || Gun()?.seat || null)),
    label: label ?? (() => {
      const gun = Gun();
      return gun ? `接管${gun.label}` : "接管机枪";
    }),
    // 打不了的时候整条不出现（不给灰提示）：有人在打、枪废了、玩家已经在枪上，
    // 外加**手上占着东西**（抬着担架的人腾不出手来打机枪 —— 传 carry 就自动带上这条）。
    Enabled: (ctx) => {
      if (carry && carry.Active) return false;
      if (Available && !Available(ctx)) return false;
      return !!emplacement?.CanOccupy(gunId).ok;
    },
    OnComplete: (ctx) => {
      if (!emplacement?.Occupy(gunId, ctx.player)) return false;
      OnComplete?.(ctx);
      return true;
    },
  };
}

/**
 * 「给机枪组补弹」交互点。hold —— 抱一箱保弹板塞进供弹口是要几秒的。
 *
 * §6 阶段⑤「帮机枪组重新架枪」与一关「给机枪组补弹」都摆这一条；
 * 补给从哪儿来由 `Consume` 回调决定（返回 false 就这一下不算数）。
 */
export function AmmoResupplyInteraction({
  id, emplacement, gunId, tag = null, position, Anchor,
  belts = 1, seconds = 1.8, label = "给机枪补弹", reachM = 2.2,
  Consume, OnComplete, payload = null,
} = {}) {
  const Gun = () => emplacement?.Emplacement(gunId) || null;
  return {
    id: id ?? `${gunId}_ammo`,
    tag, payload, once: false, cooldownS: 1.2,
    // 不给坐标就锚在枪身上（供弹口就在那儿）；给了就用给的那口弹药箱。
    position,
    Anchor: Anchor || (position ? null : () => Gun()?.position || null),
    // kind **不许叫 "ammo"**：那是 Script_Interact 内建「分一个桥夹给弟兄」那一条的
    // 语义名，`Complete()` 按 kind 分流，撞名之后这一下会被当成分桥夹处理
    // （hooks.GiveClip 不存在 → 静默返回 false，读起来像「按了没反应」）。
    kind: "gunAmmo", gesture: "hold", seconds, label, reachM,
    hint: "弹板压进去了。", sound: "stripperLoad",
    Enabled: () => {
      const gun = Gun();
      return !!gun && !gun.dead && gun.belts < gun.kind.maxBelts;
    },
    OnComplete: (ctx) => {
      if (Consume && Consume(ctx) === false) return false;
      if (!emplacement?.Resupply(gunId, belts)) return false;
      OnComplete?.(ctx);
      return true;
    },
  };
}

export default EmplacementSystem;
