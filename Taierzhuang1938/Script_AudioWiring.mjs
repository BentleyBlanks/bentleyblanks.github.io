// 《台儿庄：血战滕县》音频**接线层**：把已经存在的声音接到真正发生的事情上。
//
// 为什么单独一层：Script_Audio 是**引擎**（怎么发声），Script_Main / Script_Ai /
// Script_Combat 是**玩法**（发生了什么）。中间这一层回答的是第三个问题 ——
// 「这件事在什么条件下、以多大音量、在哪个位置、多久一次值得响一声」。
// 原来它散在三个文件的调用点里，后果是一整批 cue 从来没被调用过
// （launcherPop 一次都没播过、footstep* 只有两条且按帧号轮、AI 一条 foley 都没有），
// 而调用点自己又没有任何限频，一梭子机枪能在同一帧里请求四条弹啸。
//
// 三条贯穿全层的规矩：
//   1. **不许 Math.random**。所有随机走 Mulberry32，种子来自帧号/序号 ——
//      与 Script_Audio 同一条理由：逐轮录音比对要可复现。
//   2. **所有对引擎新 API 的调用一律判空**（`audio.SetProbes?.()`）。引擎那一批
//      改动与这一层并行推进，合并顺序不确定；缺了新 API 也必须能单独跑。
//   3. **数值不写在这里**，全在 Data_Tuning_Audio.mjs。这一层只有规则。
//
// 取证入口：`Debug.AudioZone()`（玩家当前空间档 + 到最近几个兵的遮挡值）。
// 口径与限频表见 docs/Data_AudioWiring.md。

import { Mulberry32, Clamp, Clamp01 } from "./Script_Noise.mjs";
import {
  PROBE, NEAR_MISS, RICOCHET, AI_FOLEY, PLAYER_STEP, BODY_FOLEY,
  GRENADE_FOLEY, BLAST_AUDIO, FIRE_SPOT,
} from "./Data_Tuning_Audio.mjs";

/**
 * 脚下材质 → 脚步 cue。
 *
 * 键与 Script_Main 的 SURFACE_BY_TAG 值域同一套（弹着表面），只是脚踩上去的声音
 * 与子弹打上去的声音不是一回事：沙包踩上去是布和土，不是弹着那记闷响。
 * 没查到就 dirt —— 三月的鲁南，出了城全是土路。
 */
const FOOTSTEP_BY_SURFACE = {
  dirt: "footstepDirt", sandbag: "footstepDirt",
  brick: "footstepStone", stone: "footstepStone", metal: "footstepStone",
  wood: "footstepWood", rubble: "footstepRubble",
  grass: "footstepGrass", mud: "footstepMud", water: "footstepMud",
};

/**
 * 碰撞盒 tag → **脚下**材质。与 SURFACE_BY_TAG（弹着）故意分成两张表：
 * 同一个 tag 在两件事上给的答案本来就不同 —— `rubble` 挨枪出砖灰（brick），
 * 踩上去是碎砖滑动（rubble）；`villageStraw` 挨枪是土，踩上去是麦秸。
 * 这里只列**踩得到顶面**的那些 tag，其余落回 SURFACE_BY_TAG 再落回 dirt。
 */
const STEP_BY_TAG = {
  rubble: "rubble",
  villageStraw: "grass", fieldBank: "grass", kan: "grass", grave: "grass",
  platform: "wood", bridge: "wood", floor: "wood", balk: "wood",
  villageCourtyard: "stone", villageFoundation: "stone",
  terrain: "dirt", dirt: "dirt", embankment: "dirt", ramp: "dirt",
};

/** 立面 tag：数「六米内围着几面墙」时只认这些。矮的、通透的不算。 */
const WALL_TAGS = new Set([
  "wall", "wallDetail", "parapet", "zhaiWall", "villageWall", "villageStoneWall",
  "prisonWall", "whiteboxWall", "innerArch", "outerArch", "barricade",
  "sandbagEmplacement", "villageFoundation",
]);

/** 屋顶 tag：向上那条射线撞到这些才算「在屋里」。 */
const CEILING_TAGS = new Set([
  "roof", "ceiling", "whiteboxCeiling", "floor", "platform", "bridge",
]);

/**
 * 头顶那一击算不算「屋顶」。
 *
 * 光看「上面有没有东西」不行：一辆板车、一根电线杆、一棵树都会挡住向上那条射线，
 * 于是玩家站在街心也会被判成在屋里，整条街的混响换成室内 IR ——
 * 「不知道从哪儿来的音效」会以另一种形式再来一次。所以要么 tag 明说是屋顶/楼板，
 * 要么这块盖子横向至少 2.5 m 见方（那就只能是房顶或城门洞了）。
 *
 * 【2026-09-09】还要**够高**。只看横向尺寸的话，津浦路路基那种
 * 9.3 × 15.2 m、只有 0.34 m 厚的板会被当成屋顶 —— 实测开阔地上 40 个采样点，
 * 贴地那一档 12 个（30%）判成 interior，而抬到 1.35 m 只剩 4 个。
 * 屋顶总在人头顶上方两米开外；贴着脚背的那块板是**地面**。
 * `t` 是那一击距射线起点的距离，起点就是被问的那个位置（见 Zone）。
 */
function IsCeiling(hit) {
  const box = hit?.box;
  if (!box || !box.min || !box.max) return false;
  if (!(hit.t >= PROBE.ceilingMinClearM)) return false;
  if (box.tag && CEILING_TAGS.has(box.tag)) return true;
  return (box.max[0] - box.min[0]) >= 2.5 && (box.max[2] - box.min[2]) >= 2.5;
}

/** 武器 id → PlayGunshot 的 weaponClass（引擎侧按它挑枪尾）。 */
export function WeaponClassOf(weaponId) {
  return weaponId === "Zb26" || weaponId === "Type11" || weaponId === "Type92Hmg"
    ? "mg" : "rifle";
}

export class AudioWiring {
  /**
   * @param {object} host 用**取值器**接进来（battlefield / player / vfx 会随换关重建，
   *   拷一份引用出来的话换一次关这一层就整体哑了）。
   *   { audio, battlefield, player, vfx, ai }
   */
  constructor(host) {
    this.host = host;
    this.time = 0;
    this.frame = 0;

    // --- 探针缓存（1 m 网格 / 0.5 s）------------------------------------
    this.occCache = new Map();
    this.zoneCache = new Map();

    // --- 逐弹弹啸的限速 --------------------------------------------------
    this.crackFrame = -1;
    this.crackInFrame = 0;
    this.crackTimes = [];

    // --- 玩家 foley 的状态 -----------------------------------------------
    this.lastFootstepAt = 0;
    this.lastLandSerial = 0;
    this.lastStance = null;
    this.lastVaultCount = 0;
    this.lastMantleCount = 0;
    this.sprintHeldS = 0;
    this.gearTimer = 0;
    this.breathVoice = null;
    this.breathUntil = 0;
    this.breathHoldS = 0;

    // --- 火焰点声源 -------------------------------------------------------
    this.fireVoices = new Map();      // vfx 烟源 handle → { voice, at, until }
    this.fireRescanAt = 0;

    // --- 手榴弹接触 -------------------------------------------------------
    this.grenadeState = new WeakMap();

    this.playCounter = 0;
  }

  get Audio() { return this.host.audio || null; }
  get Battlefield() { return this.host.battlefield || null; }
  get Player() { return this.host.player || null; }

  /** 每次换关调一次：缓存里存的是上一张地图的墙。 */
  Reset() {
    this.occCache.clear();
    this.zoneCache.clear();
    this.StopAllFire();
    this.StopBreath(0);
    this.lastFootstepAt = 0;
    this.lastStance = null;
    this.sprintHeldS = 0;
  }

  // =========================================================================
  // 一、宿主探针
  // =========================================================================

  /**
   * 交给 `audio.SetProbes()` 的两条探针。
   *
   * 引擎侧拿它们决定枪尾用哪一条 IR、隔着墙的声音削多少高频 —— 也就是说
   * **这两条函数的返回值直接决定整场的空间感**，所以它们必须便宜到可以每帧问。
   * 便宜靠缓存（见 Data_Tuning_Audio.PROBE 的注释），不靠少问。
   */
  Probes() {
    return {
      occlusion: (from, to) => this.Occlusion(from, to),
      zone: (position) => this.Zone(position),
    };
  }

  /**
   * 听者 → 声源之间有没有实体（墙 / 建筑 / 地形）。
   *
   * 【2026-09-09 大修】原来是「从听者眼睛打到宿主给的那个点，撞到就是 1」。
   * 两处都错：
   *
   *   1. **终点贴地**。宿主给的是事件的几何原点 —— 迫击炮弹的爆心就是
   *      `GroundHeight()` 本身，兵的 position 是脚底。于是六十米的射线全程只降
   *      1.6 m，一路擦着地皮走，30 cm 厚的路基板都拦得住。实测 72 个采样点里
   *      29 个判成挡住，把终点抬到 +2.0 m 只剩 18 个 —— 那 11 条假阳性撞的全是
   *      `embankment` / `villageStraw` 这类矮碰撞盒，**一条地形都没有**。
   *   2. **0/1 两档**。真实的墙分两种：一米二的院墙（声音从上面绕过去，只掉高频）
   *      和一整间砖房（真的闷）。一律按 1 算，前者被压掉 −12 dB + 800 Hz，
   *      听感就是「没响」。
   *
   * 现在：射线抬到声源自己地面之上 sourceRiseM 再打；挡住了再问一次
   * clearRiseM 那一档，那一档通了就只算 partialOcc（矮东西绕得过去）。
   * 常见情形（通透）仍然只花一条射线，被挡时才花第二条。
   *
   * @param {object} [opts]
   * @param {boolean} [opts.rise=true] 抬不抬高终点。**只有问「这条线本身通不通」的
   *   调用方才给 false** —— 见 `AiNearMissAtPlayer`：那里问的是一颗子弹的实际弹道
   *   有没有被挡住，抬高会让越过矮墙的那一发变成"没挡住"，于是墙后面的玩家听见
   *   一条根本不存在的弹啸。两个问题只是碰巧共用一条射线，不是同一件事。
   * @returns {number|undefined} 0 通透 / partialOcc 矮挡 / 1 挡死；
   *   undefined = 这一帧没有战场可问
   */
  Occlusion(from, to, { rise = true } = {}) {
    const bf = this.Battlefield;
    if (!bf || !from || !to) return undefined;
    const g = PROBE.gridM;
    const key = `${rise ? "s" : "r"}|`
      + `${Math.round(from.x / g)},${Math.round(from.y / g)},${Math.round(from.z / g)}`
      + `|${Math.round(to.x / g)},${Math.round(to.y / g)},${Math.round(to.z / g)}`;
    const cached = this.occCache.get(key);
    if (cached !== undefined && cached.at > this.time - PROBE.ttlS) return cached.v;

    // 声源自己那块地面。抬高是**相对它的地面**算的，不是相对声源坐标 ——
    // 天上的飞机（y 已经两百米）不该再被抬一次。
    const ground = rise && typeof bf.GroundHeight === "function"
      ? bf.GroundHeight(to.x, to.z) : null;
    const Shoot = (riseM) => {
      const ty = ground === null ? to.y : Math.max(to.y, ground + riseM);
      const dx = to.x - from.x, dy = ty - from.y, dz = to.z - from.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!(dist > 0.05)) return false;
      // terrain:true 不能漏 —— 不带这个标志的射线只跟碰撞盒求交，土坎、河堤、
      // 路基一律穿过去（与弹道、识别那两条是同一个坑）。
      const hit = bf.Raycast(
        { x: from.x, y: from.y, z: from.z },
        { x: dx / dist, y: dy / dist, z: dz / dist },
        dist, { terrain: true },
      );
      // 留 0.4 m 余量：擦着声源旁边的墙角不算挡住。
      return !!(hit && hit.t < dist - 0.4);
    };
    let value = 0;
    if (Shoot(PROBE.sourceRiseM)) {
      // 不抬高的那一路（弹道）没有"矮挡"这一档：子弹要么打在墙上要么没有，
      // 所以也不必再花第二条射线。
      value = !rise || Shoot(PROBE.clearRiseM) ? 1 : PROBE.partialOcc;
    }
    if (this.occCache.size > PROBE.maxEntries) this.occCache.clear();
    this.occCache.set(key, { v: value, at: this.time });
    return value;
  }

  /**
   * 这个位置在什么空间里。引擎侧按它挑混响 IR 与枪尾录音。
   * @returns {"interior"|"courtyard"|"street"|"open"}
   */
  Zone(position) {
    const bf = this.Battlefield;
    if (!bf || !position) return "open";
    const g = PROBE.gridM;
    const key = `${Math.round(position.x / g)},${Math.round(position.y / g)},${Math.round(position.z / g)}`;
    const cached = this.zoneCache.get(key);
    if (cached !== undefined && cached.at > this.time - PROBE.ttlS) return cached.v;

    let zone = "open";
    // 先向上打一条：头顶有屋顶/楼板 = 在屋里。这一条要先判 —— 屋里当然也被墙围着，
    // 但「屋里」与「院子里」的混响差得远（一个有天花板，一个没有）。
    //
    // 【2026-09-09】**立面数不动，只收紧屋顶那一条**（见 IsCeiling）。
    // 想过把整个采样点抬到 1.2 m 再问，但那样 CountWalls 会把一米五的院墙
    // （`box.max[1] < position.y + 0.4` 那道闸）一起筛掉，街巷全变成开阔地 ——
    // 实测抬到 1.35 m 之后 40 个点里 7 个 street 直接掉成 open。
    // 坏的只有屋顶判据一条，别顺手改掉对的那两条。
    const up = bf.Raycast({ x: position.x, y: position.y + 0.1, z: position.z },
      { x: 0, y: 1, z: 0 }, PROBE.ceilingProbeM, { terrain: false });
    if (IsCeiling(up)) {
      zone = "interior";
    } else {
      const walls = this.CountWalls(position);
      zone = walls >= PROBE.courtyardWalls ? "courtyard"
        : walls >= PROBE.streetWalls ? "street" : "open";
    }
    if (this.zoneCache.size > PROBE.maxEntries) this.zoneCache.clear();
    this.zoneCache.set(key, { v: zone, at: this.time });
    return zone;
  }

  /** 六米内围着几面立面。矮过 wallMinHeightM 的不算 —— 田埂挡不住声音。 */
  CountWalls(position) {
    const bf = this.Battlefield;
    if (!bf || typeof bf.NearbyColliders !== "function") return 0;
    const list = bf.NearbyColliders(position.x, position.z, PROBE.wallRadiusM) || [];
    let count = 0;
    for (const box of list) {
      if (!box || !box.min || !box.max) continue;
      if (box.max[1] - box.min[1] < PROBE.wallMinHeightM) continue;
      if (box.max[1] < position.y + 0.4) continue;               // 脚底下的台子不是墙
      if (box.tag && !WALL_TAGS.has(box.tag)) continue;
      // 点到 AABB 的水平距离（在盒里就是 0）
      const dx = Math.max(box.min[0] - position.x, 0, position.x - box.max[0]);
      const dz = Math.max(box.min[2] - position.z, 0, position.z - box.max[2]);
      if (dx * dx + dz * dz > PROBE.wallRadiusM * PROBE.wallRadiusM) continue;
      count += 1;
    }
    return count;
  }

  /**
   * 取证：玩家当前空间档 + 到最近几个兵的遮挡值。
   * 「隔着墙为什么还这么亮」这类问题只有把两条探针的实际返回值摆出来才答得了。
   */
  Report(limit = 5) {
    const player = this.Player;
    const audio = this.Audio;
    const listener = audio?.listenerPos || player?.position || { x: 0, y: 0, z: 0 };
    const soldiers = this.host.ai?.soldiers || [];
    const near = soldiers
      .filter((s) => s.alive)
      .map((s) => ({
        s,
        d: Math.hypot(s.position.x - listener.x, s.position.y - listener.y, s.position.z - listener.z),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, limit);
    return {
      listener: { x: +listener.x.toFixed(2), y: +listener.y.toFixed(2), z: +listener.z.toFixed(2) },
      zone: this.Zone(listener),
      walls: this.CountWalls(listener),
      probesInstalled: !!audio?.probes,
      soldiers: near.map(({ s, d }) => ({
        id: s.missionId || s.id, side: s.side,
        distance: +d.toFixed(1),
        occlusion: this.Occlusion(listener, { x: s.position.x, y: s.position.y + 1.2, z: s.position.z }),
      })),
      fireVoices: this.fireVoices.size,
      cracks: this.crackTimes.length,
    };
  }

  // =========================================================================
  // 二、逐弹弹啸
  // =========================================================================

  /** 这一帧还许不许再播一条弹啸（同帧 2 条、100 ms 内 3 条）。 */
  CrackAllowed() {
    if (this.frame !== this.crackFrame) { this.crackFrame = this.frame; this.crackInFrame = 0; }
    if (this.crackInFrame >= NEAR_MISS.perFrame) return false;
    const cut = this.time - NEAR_MISS.windowS;
    while (this.crackTimes.length && this.crackTimes[0] < cut) this.crackTimes.shift();
    return this.crackTimes.length < NEAR_MISS.perWindow;
  }

  /**
   * 一发子弹从听者身边掠过。
   *
   * **只给玩家播**：AI 之间的近失弹是压制规则的输入，不是听者能听见的事 ——
   * 满场三十个兵互相打，每一发都播的话一秒钟几十条 crack，而且全都不该存在。
   *
   * @param {object} point    最近点（弹道上离身体最近的那一点）
   * @param {number} distance 掠过的距离（m）
   * @param {boolean} blocked 这一段弹道被实体挡住了（子弹根本没到这儿）
   */
  BulletPass(point, distance, blocked = false) {
    const audio = this.Audio;
    if (!audio || blocked || !point) return false;
    if (!this.CrackAllowed()) return false;
    this.crackInFrame += 1;
    this.crackTimes.push(this.time);
    const at = { x: point.x, y: point.y, z: point.z };
    // 步枪与机枪弹初速 700—800 m/s，**全部超音速**：掠过的是弹头自己的激波，
    // 所以不分枪种，只分远近。
    audio.Play("bulletCrack", { position: at, volume: NEAR_MISS.crackVolume, priority: true });
    if (distance < NEAR_MISS.whizzWithinM) {
      // 擦着头皮那一档再叠一条「咻」——激波之后跟着的是弹头搅动空气的湍流声，
      // 一米半以外就听不出来了。
      audio.Play("bulletWhizz", { position: at, volume: NEAR_MISS.whizzVolume, delay: 0.015 });
    }
    return true;
  }

  /**
   * `CollectBulletNearMisses` 的结果里只挑**玩家**那一条来播。
   *
   * 认玩家靠 target 上的 `isPlayer` 标（FireVehicleBullet 建的那个代理对象带着它）——
   * 不用「是不是 PlayerController」判，因为玩家在弹道这条链上从来不是本人，
   * 而是一个临时代理（它要有 stance、suppression 与自己的命中几何）。
   *
   * @param {Map} near      actor → { point, body, distance }
   * @param {Function} Blocked (point, body) => boolean，与压制那条同一个判据
   */
  BulletNearMissesForPlayer(near, Blocked) {
    if (!near) return false;
    for (const [actor, pass] of near) {
      if (!actor || !actor.isPlayer) continue;
      return this.BulletPass(pass.point, pass.distance,
        Blocked ? Blocked(pass.point, pass.body) : false);
    }
    return false;
  }

  /**
   * AI 朝玩家打偏的那一发。
   *
   * 这条链上**没有真实弹道** —— AI 打人是概率判定（Script_Ai 的 acc 那一段），
   * 打偏只有一个 `miss` 距离。所以近失点是照那个距离在瞄点旁边摆出来的：
   * 方向取瞄准方向的水平法线（左右由射击序号定，不用随机 —— 逐轮回放要可复现），
   * 再抬高一点点，「从头边过去」正是这一发该有的位置。
   *
   * **挡住就不播**：从枪口到那一点如果有墙，子弹根本没到过那儿。
   * 这一条不能靠 `targetVisible` 代替 —— 那只保证开枪那一刻看得见。
   *
   * @param {object} soldier 开枪的人（要它的 fireSequence 定左右）
   * @param {object} from    枪口
   * @param {object} dir     射击方向（已归一化）
   * @param {object} aim     瞄点（玩家躯干或露出来的头）
   * @param {number} missM   偏了多少米
   */
  AiNearMissAtPlayer(soldier, from, dir, aim, missM) {
    if (!this.Audio || !(missM < NEAR_MISS.crackWithinM)) return false;
    // 水平法线：dir 绕 Y 转 90°。dir 近乎竖直时退回 X 轴（那种角度上左右已无意义）。
    let ux = dir.z, uz = -dir.x;
    const un = Math.hypot(ux, uz);
    if (un < 1e-4) { ux = 1; uz = 0; } else { ux /= un; uz /= un; }
    const side = ((soldier?.fireSequence || 0) & 1) ? 1 : -1;
    const point = {
      x: aim.x + ux * missM * side,
      y: aim.y + 0.15,
      z: aim.z + uz * missM * side,
    };
    // `rise: false`：这里问的是**这颗子弹的实际弹道**通不通，不是「这个声音听起来
    // 有多闷」。抬高终点会让越过矮墙的那一发变成"没挡住"，于是墙后面的玩家
    // 听见一条根本不存在的弹啸（那一发早就打在墙上了）。
    const blocked = this.Occlusion({ x: from.x, y: from.y, z: from.z }, point,
      { rise: false }) === 1;
    return this.BulletPass(point, missM, blocked);
  }

  // =========================================================================
  // 三、跳弹
  // =========================================================================

  /**
   * 弹着之后的跳弹。硬面才跳（砖 / 石 / 铁），土和沙包把弹头吃进去。
   * 随机走 Mulberry32：同一局回放里第 N 发跳不跳是固定的。
   */
  Ricochet(point, surface, seed = 0) {
    const audio = this.Audio;
    if (!audio || !point || !RICOCHET.surfaces.includes(surface)) return false;
    const rng = Mulberry32((Math.imul(seed + (this.playCounter += 1), 2654435761) ^ 0x5bf03635) >>> 0);
    if (rng() >= RICOCHET.chance) return false;
    audio.Play("ricochet", {
      position: { x: point.x, y: point.y, z: point.z },
      volume: RICOCHET.volume, delay: RICOCHET.delayS,
      pitch: 0.9 + rng() * 0.3,
    });
    return true;
  }

  // =========================================================================
  // 四、AI foley
  // =========================================================================

  /** 这个位置离听者多远。没有听者（出图模式没有 AudioContext）时返回 Infinity。 */
  DistanceToListener(position) {
    const audio = this.Audio;
    if (!audio || !position) return Infinity;
    const L = audio.listenerPos;
    if (!L) return Infinity;
    return Math.hypot(position.x - L.x, position.y - L.y, position.z - L.z);
  }

  /** AI 开完一枪之后手上那一下（栓动才有；自动武器自己上膛）。 */
  AiBolt(soldier, boltAction = true) {
    const audio = this.Audio;
    if (!audio || !soldier || !boltAction) return false;
    if (this.DistanceToListener(soldier.position) > AI_FOLEY.boltWithinM) return false;
    audio.Play("bolt", {
      position: { x: soldier.position.x, y: soldier.position.y + 1.2, z: soldier.position.z },
      volume: AI_FOLEY.boltVolume, delay: AI_FOLEY.boltDelayS,
    });
    return true;
  }

  /** AI 换弹。固定弹仓压桥夹、捷克式换弹匣 —— 两种声音要分得开。 */
  AiReload(soldier, weaponKind) {
    const audio = this.Audio;
    if (!audio || !soldier) return false;
    if (this.DistanceToListener(soldier.position) > AI_FOLEY.reloadWithinM) return false;
    audio.Play(weaponKind === "boltRifle" ? "stripperLoad" : "magIn", {
      position: { x: soldier.position.x, y: soldier.position.y + 1.1, z: soldier.position.z },
      volume: AI_FOLEY.reloadVolume,
    });
    return true;
  }

  /**
   * AI 走了一步。按**步距**触发，不按时间 —— 时间触发的话站在原地转身的人
   * 也会一直响脚步。每个兵自己的限频挂在 soldier 上（`audioStepAt`）。
   */
  AiStep(soldier, dx, dz) {
    const audio = this.Audio;
    if (!audio || !soldier || !soldier.alive) return false;
    soldier.audioStepDist = (soldier.audioStepDist || 0) + Math.hypot(dx, dz);
    if (soldier.audioStepDist < AI_FOLEY.stepStrideM) return false;
    soldier.audioStepDist = 0;
    if (this.time - (soldier.audioStepAt || -99) < AI_FOLEY.stepMinIntervalS) return false;
    if (this.DistanceToListener(soldier.position) > AI_FOLEY.stepWithinM) return false;
    soldier.audioStepAt = this.time;
    const cue = FOOTSTEP_BY_SURFACE[this.SurfaceUnder(soldier.position)] || "footstepDirt";
    audio.Play(cue, {
      position: { x: soldier.position.x, y: soldier.position.y, z: soldier.position.z },
      volume: AI_FOLEY.stepVolume,
    });
    return true;
  }

  // =========================================================================
  // 五、脚下材质
  // =========================================================================

  /**
   * 脚底下踩的是什么。
   *
   * 向下打一条短射线拿碰撞盒的 tag；踩在解析地表上（射线只报 terrain / 什么都没有）
   * 就看水深 —— 界河边和水田里是泥，其余是土。**查不到一律 dirt**，
   * 而不是维持原来那条 `frame % 3` 的假随机：那条听感上是「每走三步换一次地面」。
   */
  SurfaceUnder(position, surfaceByTag = null) {
    const bf = this.Battlefield;
    if (!bf || !position) return "dirt";
    if (typeof bf.WaterDepth === "function"
      && bf.WaterDepth(position.x, position.z, position.y) > 0.03) return "mud";
    const hit = bf.Raycast({ x: position.x, y: position.y + 0.6, z: position.z },
      { x: 0, y: -1, z: 0 }, 1.4, { terrain: true });
    const tag = hit?.box?.tag;
    if (!tag) return "dirt";
    return STEP_BY_TAG[tag] || surfaceByTag?.[tag] || "dirt";
  }

  // =========================================================================
  // 六、玩家脚步与身体 foley
  // =========================================================================

  /**
   * 每帧一次：脚步、姿态布料声、装具、喘息、落地。
   * @param {number} dt
   * @param {number} frame 帧号（弹啸的同帧限速要用）
   * @param {object} surfaceByTag 弹着表面表（脚下材质查不到时的兜底）
   */
  Update(dt, frame, surfaceByTag = null) {
    this.time += Math.max(0, dt);
    this.frame = frame;
    const player = this.Player;
    const audio = this.Audio;
    if (!audio || !player) return;

    this.Footsteps(surfaceByTag);
    this.Landing(surfaceByTag);
    this.BodyFoley(dt);
    this.FireSpots(dt);
  }

  Footsteps(surfaceByTag) {
    const player = this.Player;
    const audio = this.Audio;
    if (!player.Alive || !player.grounded) return;
    const sprinting = player.sprint > 0.5;
    const stride = player.stance === "prone" ? PLAYER_STEP.proneStrideM
      : sprinting ? PLAYER_STEP.sprintStrideM
        : player.stance === "crouch" ? PLAYER_STEP.crouchStrideM : PLAYER_STEP.strideM;
    if (player.stepDistance - this.lastFootstepAt < stride) return;
    this.lastFootstepAt = player.stepDistance;
    const surface = this.SurfaceUnder(player.position, surfaceByTag);
    let volume = PLAYER_STEP.baseVolume;
    if (player.stance === "prone") volume *= PLAYER_STEP.proneGain;
    else if (player.stance === "crouch") volume *= PLAYER_STEP.crouchGain;
    if (sprinting) volume *= PLAYER_STEP.sprintGain;
    if (player.fastCrawl) volume *= PLAYER_STEP.fastCrawlGain;
    // 不给 position：脚就在自己身下，走空间化那条链只会白花一个 panner，
    // 而且 HRTF 会把自己的脚步推到某个方位上去（听着像旁边有人在走）。
    audio.Play(surface === "rubble" ? "footstepRubble" : FOOTSTEP_BY_SURFACE[surface] || "footstepDirt", {
      volume, pitch: sprinting ? PLAYER_STEP.sprintPitch : 1,
    });
  }

  /** 落地。轻跳只有靴底那一下，摔下来才叠身体。 */
  Landing(surfaceByTag) {
    const player = this.Player;
    const audio = this.Audio;
    const jump = player.jump;
    if (!jump || jump.landSerial === this.lastLandSerial) return;
    this.lastLandSerial = jump.landSerial;
    const impact = jump.landImpact || 0;
    const surface = this.SurfaceUnder(player.position, surfaceByTag);
    audio.Play(FOOTSTEP_BY_SURFACE[surface] || "footstepDirt", { volume: 0.42 + impact * 0.38 });
    // bodyLand 而不是 bodyFall：后者是**一个人倒下**（尸体落地 + 装具散开），
    // 拿它当玩家落地音的话每次跳窗台都像有人在旁边被打死了。
    if (impact > BODY_FOLEY.landMinImpact) {
      audio.Play("bodyLand", { volume: BODY_FOLEY.landVolume * (0.5 + impact * 0.6) });
    }
  }

  BodyFoley(dt) {
    const player = this.Player;
    const audio = this.Audio;

    // 姿态切换：起身、蹲下、趴下都是一整套装具跟着动。
    if (this.lastStance === null) this.lastStance = player.stance;
    else if (player.stance !== this.lastStance) {
      this.lastStance = player.stance;
      audio.Play("clothMove", { volume: BODY_FOLEY.stanceVolume });
    }
    // 翻越 / 攀爬：撑上去那一下衣服蹭墙的声音比脚步重要得多 ——
    // 它是「我确实翻过去了」的唯一听觉回执。
    const vaults = (player.vaultCount || 0) + (player.mantleCount || 0);
    const lastVaults = this.lastVaultCount + this.lastMantleCount;
    if (vaults > lastVaults) {
      this.lastVaultCount = player.vaultCount || 0;
      this.lastMantleCount = player.mantleCount || 0;
      audio.Play("clothMove", { volume: BODY_FOLEY.vaultVolume, pitch: 0.92 });
    }

    // 冲刺：装具晃动。间隔固定而不是按步距 —— 晃的是背上的东西，不是脚。
    if (player.sprint > 0.5 && player.Alive) {
      this.sprintHeldS += dt;
      this.gearTimer -= dt;
      if (this.gearTimer <= 0) {
        this.gearTimer = BODY_FOLEY.gearIntervalS;
        audio.Play("gearRattle", { volume: BODY_FOLEY.gearVolume });
      }
    } else {
      this.sprintHeldS = 0;
      this.gearTimer = 0;
    }

    // 喘息：跑久了、或者伤重。**非空间化且不给混响** —— 这是自己的肺，
    // 给了房间就变成「隔壁有人在喘」。
    const hurt = player.Alive && player.health < 100 * BODY_FOLEY.breathHealthFrac;
    const winded = this.sprintHeldS > BODY_FOLEY.breathAfterSprintS;
    if ((hurt || winded) && player.Alive) this.breathHoldS = BODY_FOLEY.breathReleaseS;
    else this.breathHoldS = Math.max(0, this.breathHoldS - dt);
    if (this.breathHoldS > 0) {
      if (this.time >= this.breathUntil) {
        this.breathUntil = this.time + BODY_FOLEY.breathLoopS;
        this.breathVoice = audio.Play("breathHeavy", {
          volume: BODY_FOLEY.breathVolume, priority: true,
        });
      }
    } else if (this.breathVoice) {
      this.StopBreath(0.4);
    }
  }

  StopBreath(fade = 0) {
    const audio = this.Audio;
    if (this.breathVoice && audio) audio.StopVoice?.(this.breathVoice, fade);
    this.breathVoice = null;
    this.breathUntil = 0;
  }

  // =========================================================================
  // 七、手榴弹落地与滚动
  // =========================================================================

  /**
   * 一枚在飞的投掷物这一帧的接触状态。
   *
   * 刚体版（Rapier）不发接触事件，所以这里按**速度的突变**判弹跳：
   * 竖直速度反向、或者速率一帧掉掉三成以上 = 撞上了什么。滚动则是
   * 「贴着地、还在动、持续了一会儿」——那正是木柄弹在砖地上最吓人的那一段。
   *
   * @param {object} p 投掷物 { position, velocity?, body? }
   */
  GrenadeContact(p, dt) {
    const audio = this.Audio;
    if (!audio || !p || !p.position) return null;
    let vx = 0, vy = 0, vz = 0;
    if (p.body && typeof p.body.linvel === "function") {
      const v = p.body.linvel(); vx = v.x; vy = v.y; vz = v.z;
    } else if (p.velocity) { vx = p.velocity.x; vy = p.velocity.y; vz = p.velocity.z; }
    const speed = Math.hypot(vx, vy, vz);
    let st = this.grenadeState.get(p);
    if (!st) { st = { speed, vy, lastBounceAt: -99, contactS: 0, rolled: false }; this.grenadeState.set(p, st); }
    const prevSpeed = st.speed, prevVy = st.vy;
    st.speed = speed; st.vy = vy;
    if (this.DistanceToListener(p.position) > GRENADE_FOLEY.maxAudibleM) return null;

    // 弹跳：向下变成向上（真的弹起来了），或者速率一帧掉了三成（撞墙）。
    const bounced = (prevVy < -GRENADE_FOLEY.bounceMinSpeedMps && vy > 0.2)
      || (prevSpeed > GRENADE_FOLEY.bounceMinSpeedMps && speed < prevSpeed * 0.7);
    if (bounced && this.time - st.lastBounceAt > GRENADE_FOLEY.bounceIntervalS) {
      st.lastBounceAt = this.time;
      st.contactS = 0;
      audio.Play("grenadeBounce", {
        position: { x: p.position.x, y: p.position.y, z: p.position.z },
        volume: GRENADE_FOLEY.bounceVolume * Clamp01(0.4 + prevSpeed / 12),
      });
      return "bounce";
    }
    // 滚：低速、还在动、且持续了一会儿。一枚弹只报一次 —— 滚是一段状态，不是一次事件。
    if (!st.rolled && speed > GRENADE_FOLEY.rollMinSpeedMps
      && speed < GRENADE_FOLEY.bounceMinSpeedMps) {
      st.contactS += dt;
      if (st.contactS > GRENADE_FOLEY.rollAfterS) {
        st.rolled = true;
        audio.Play("grenadeRoll", {
          position: { x: p.position.x, y: p.position.y, z: p.position.z },
          volume: GRENADE_FOLEY.rollVolume,
        });
        return "roll";
      }
    } else if (speed <= GRENADE_FOLEY.rollMinSpeedMps) st.contactS = 0;
    return null;
  }

  // =========================================================================
  // 八、爆炸：三档 + 碎屑 + 耳鸣
  // =========================================================================

  /**
   * 一次爆炸对**听者**来说是什么。距离分三档：
   *   near  (<40 m)  炸在身边：冲击、碎砖、耳鸣
   *   mid   (40—120) 这条街那头：有冲击没有碎片，尾巴还带方位
   *   far   (>120)   城外落弹：只剩一记闷响
   *
   * @param {object} position 爆心
   * @param {number} radius   武器半径（配平用，不是听得见的半径）
   * @param {boolean} occluded 宿主已经算过的遮挡（与震屏那条同一个判据）。
   *   **只在引擎侧没注册遮挡探针时才用**：探针在场时遮挡由引擎独占一层，
   *   见下面那段注释。
   */
  Blast(position, radius, occluded = false) {
    const audio = this.Audio;
    if (!audio || !position) return null;
    const d = this.DistanceToListener(position);
    const cue = d < BLAST_AUDIO.nearM ? "explosionNear"
      : d < BLAST_AUDIO.midM ? "explosionMid" : "explosionFar";
    let volume = Clamp(radius / 8, 0.5, 1.2);
    const opts = { position: { x: position.x, y: position.y, z: position.z }, volume, priority: true };
    // 遮挡**只许算一层**。
    //
    // 【2026-09-09】这是用户报的「炮弹爆炸经常没声音」的直接成因：引擎侧
    // （Script_Audio.Play）会拿同一条 Occlusion 探针自己再问一遍，给 −12 dB 干声
    // + 800 Hz 低通；这里再压 ×0.5 + airCut 900，两层叠起来是 **−18.0 dB 干声
    // 加一道 800 Hz 砖墙**。实测 phase=1，20 m 的一发：干声有效电平
    // 0.1925（通透）→ 0.0242（两层），空气低通 6402 Hz → 800 Hz。
    // 那不是「隔着一堵墙的爆炸」，那是没响。
    //
    // 而且两层的判据根本不是同一条：宿主这条是「爆心抬 0.35 m → 眼睛、余量 0.5 m」，
    // 引擎那条是「眼睛 → 爆心原点、余量 0.4 m」。32 发取样里 3 发「引擎说挡了、
    // 宿主说没挡」，1 发反过来。所以不是"压狠了"，是同一堵墙被两个不同的人各算一遍。
    //
    // 取舍：探针在场时**由引擎独占**（它的那条现在是分级的 0/0.45/1，而且射线抬到
    // 1.2 m 打，见 Occlusion）。这里的两行只留给「引擎侧没有探针」的场合
    // ——编辑器裸跑规则层、以及探针注册之前的那几帧，与 blastAutoDeafen / gunAutoDuck
    // 同一套判空写法。
    if (occluded && !audio.probes?.occlusion) {
      // 隔着一堵墙的爆炸仍然听得见（低频绕射得过去），但**高频全没了**。
      // 只压音量不削高频的话，听感是「小一点的同一声爆炸」，读不出那堵墙。
      opts.volume = volume * BLAST_AUDIO.occludedGain;
      opts.airCut = BLAST_AUDIO.occludedAirCutHz;
    }
    audio.Play(cue, opts);
    // 耳鸣：引擎侧接上「Play 里按爆炸类 cue 自动 Deafen」之后这条是兜底
    // （两条同时生效也只是耳鸣重叠一次，不会更聋 —— Deafen 写的是同一条滤波自动化）。
    if (d < BLAST_AUDIO.deafenWithinM && !audio.blastAutoDeafen) {
      audio.Deafen?.(BLAST_AUDIO.deafenS);
    }
    if (d < BLAST_AUDIO.debrisWithinM) this.Debris(position, d);
    return cue;
  }

  /** 落屑：近炸半秒到一秒之后，砖屑与瓦片才落回地面。位置撒在爆心周围 3—8 m。 */
  Debris(position, distance) {
    const audio = this.Audio;
    const rng = Mulberry32((Math.imul(this.playCounter += 1, 2654435761)
      ^ Math.round(position.x * 73 + position.z * 131)) >>> 0);
    const count = BLAST_AUDIO.debrisCountMin
      + Math.floor(rng() * (BLAST_AUDIO.debrisCountMax - BLAST_AUDIO.debrisCountMin + 1));
    for (let i = 0; i < count; i += 1) {
      const angle = rng() * Math.PI * 2;
      const r = BLAST_AUDIO.debrisRadiusMinM
        + rng() * (BLAST_AUDIO.debrisRadiusMaxM - BLAST_AUDIO.debrisRadiusMinM);
      audio.Play("debrisFall", {
        position: {
          x: position.x + Math.cos(angle) * r,
          y: position.y + 0.2,
          z: position.z + Math.sin(angle) * r,
        },
        volume: BLAST_AUDIO.debrisVolume * Clamp01(1 - distance / BLAST_AUDIO.debrisWithinM),
        delay: BLAST_AUDIO.debrisDelayMinS
          + rng() * (BLAST_AUDIO.debrisDelayMaxS - BLAST_AUDIO.debrisDelayMinS),
      });
    }
    return count;
  }

  /**
   * 开枪压环境。放在这一层而不是调用点，是因为「压多久、压多狠」是接线数值
   * （Data_Tuning_Audio.BLAST_AUDIO），而调用点只知道"我开了一枪"。
   */
  GunDuck() {
    // 引擎侧（Script_Audio.Play）接上「玩家枪自动压环境」之后会置 gunAutoDuck；
    // 那时这里再压一次就是同一枪叠两次 ramp。没接上时这里仍是唯一的一道。
    if (this.Audio?.gunAutoDuck) return;
    this.Audio?.DuckAmbience?.(BLAST_AUDIO.gunDuckS, BLAST_AUDIO.gunDuckAmount);
  }

  // =========================================================================
  // 九、火焰点声源
  // =========================================================================

  /**
   * 烧着的房子/残骸是**一直在响**的东西：给 vfx 的火焰发射器挂一条循环位置音。
   * 同时最多四条（最近的优先）—— 再多只是一片糊的噪声床，而且吃满节点预算。
   */
  FireSpots(dt) {
    const audio = this.Audio;
    const vfx = this.host.vfx;
    if (!audio || !vfx || !vfx.smokeSources) return;

    // 每帧重挑「最近四个」是白花的：火不会跑，玩家半秒也走不出去。
    if (this.time >= this.fireRescanAt) {
      this.fireRescanAt = this.time + FIRE_SPOT.rescanS;
      const want = [];
      for (const [handle, source] of vfx.smokeSources) {
        if (!source || (source.fire || 0) < FIRE_SPOT.minFire) continue;
        const d = this.DistanceToListener(source.position);
        if (d > FIRE_SPOT.audibleM) continue;
        want.push({ handle, source, d });
      }
      want.sort((a, b) => a.d - b.d);
      const keep = new Set(want.slice(0, FIRE_SPOT.maxVoices).map((e) => e.handle));
      for (const [handle, entry] of [...this.fireVoices]) {
        if (keep.has(handle) && vfx.smokeSources.has(handle)) continue;
        if (entry.voice) audio.StopVoice?.(entry.voice, 0.5);
        this.fireVoices.delete(handle);
      }
      for (const e of want.slice(0, FIRE_SPOT.maxVoices)) {
        if (!this.fireVoices.has(e.handle)) this.fireVoices.set(e.handle, { voice: null, until: 0 });
      }
    }

    // 续接与跟位。**一帧只起一条** —— 同名 cue 在 22 ms 去重窗里只活得下来一条，
    // 四条一起起等于白起三条（而且那三条会被记成 drops.dedupe，查起来像在丢音）。
    let started = false;
    for (const [handle, entry] of this.fireVoices) {
      const source = vfx.smokeSources.get(handle);
      if (!source) continue;
      if (entry.voice && this.time < entry.until) {
        audio.MoveVoice?.(entry.voice, source.position);
        continue;
      }
      if (started) continue;
      started = true;
      entry.until = this.time + FIRE_SPOT.loopS;
      entry.voice = audio.Play("fireSpot", {
        position: { x: source.position.x, y: source.position.y + 0.4, z: source.position.z },
        volume: FIRE_SPOT.volume * Clamp01(0.4 + (source.fire || 0) * 0.5),
      });
    }
  }

  StopAllFire() {
    const audio = this.Audio;
    for (const entry of this.fireVoices.values()) {
      if (entry.voice && audio) audio.StopVoice?.(entry.voice, 0.3);
    }
    this.fireVoices.clear();
    this.fireRescanAt = 0;
  }

  Dispose() {
    this.StopAllFire();
    this.StopBreath(0);
    this.occCache.clear();
    this.zoneCache.clear();
  }
}
