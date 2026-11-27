// L5 行进间注意力与「左顾右盼」程序化引擎（ProceduralGaze）：纯数学、零 Three.js、零 DOM。
//
// 3A 工业界核心原则（Naughty Dog Attention Director + 分级脊柱 Look-At）：
//   1. 拒绝正弦波「电风扇摇头」：采用目标优先级栈（P0 瞬时刺激 > P1 战术 POI > P2 社交凝视 > P3 泊松间隔非对称扫视）；
//   2. 四拍萨卡德曲线（Saccade-Fixation-Return）：快速起转 → 明确凝视停顿（含微呼吸）→ 可选反向二次瞥视 → 缓回正；
//   3. 身体链分级延迟：Head（最快）→ Neck（滞后 ~45ms）→ Spine2/Chest（滞后 ~110ms），且大角度回头联动脚下微减速；
//   4. 语义通道分离：只输出观察用 gazeYaw/gazePitch 与骨段分摊权重，绝不抢占持枪瞄准通道（避免拿枪管扫队友脸）。

import { SQUAD_SPLINE_DEFAULTS as D } from "./Data_Tuning_SquadSpline.mjs";

const DEG = Math.PI / 180;
const Clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const WrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** FNV-1a 32-bit 确定性字符串哈希（供无状态时间轴采样复用）。 */
export function HashString(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** 确定性伪随机（与 Script_SquadMarch 同源 Mulberry32/FNV1a）。 */
export function MakeGazeRandom(seed) {
  let h = HashString(seed);
  return () => {
    h = (h + 0x6D2B79F5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const MakeRng = MakeGazeRandom;

/** 根据总观察偏航角，按人体解剖学拆分为 Head / Neck / Spine2 三个安全权重份额（不扭断脖子，不甩枪口）。 */
export function SplitGazeChain(gazeYawRad) {
  const absDeg = Math.abs(gazeYawRad) / DEG;
  if (absDeg <= 24) {
    return { head: 0.68, neck: 0.27, chest: 0.05 };
  }
  if (absDeg <= 56) {
    const t = (absDeg - 24) / 32;
    return {
      head: 0.68 - 0.22 * t,
      neck: 0.27 - 0.02 * t,
      chest: 0.05 + 0.24 * t,
    };
  }
  return { head: 0.44, neck: 0.25, chest: 0.31 };
}

/** 临界阻尼二阶弹簧（无过冲抖动，Head/Neck/Chest 不同固有频率形成自然跟随延迟）。 */
function StepSpring(val, vel, target, hz, dt) {
  const w = Math.max(1.0, hz * Math.PI * 2);
  const f = 1 + 2 * dt * w;
  const oo = w * w;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  const nextVal = (f * val + dt * vel + hhoo * target) * detInv;
  const nextVel = (vel + hoo * (target - val)) * detInv;
  return [nextVal, nextVel];
}

export class ProceduralGazeAgent {
  constructor(id, role, seed, tuning = D) {
    this.id = String(id);
    this.role = role || "rifleman";
    this.rnd = MakeGazeRandom(`${seed}:gaze:${id}`);
    this.tuning = { ...D, ...tuning };
    this.time = 0;

    // 当前活动注视任务
    this.task = null;
    this.nextAmbientAt = 0.6 + this.rnd() * Math.max(0.8, this.tuning.scanIntervalMinS);
    this.nextLeaderCheckAt = this.tuning.leaderCheckMinS * (0.4 + this.rnd() * 0.6);
    this.cooldowns = new Map(); // targetKey -> unlockTime
    this.stimulusMemory = new Map(); // stimulusId -> reactAt

    // 分级弹簧状态（头/颈/胸各自滞后）
    this.headYaw = 0; this.headVel = 0;
    this.neckYaw = 0; this.neckVel = 0;
    this.chestYaw = 0; this.chestVel = 0;
    this.pitch = 0; this.pitchVel = 0;

    // 统计指标
    this.glances = 0;
    this.lastGlanceSign = 1;
  }

  /**
   * 推进一帧注意力评估与分级骨骼弹簧求解。
   * @param {number} dt
   * @param {object} ctx
   *   { x, z, y, yaw, speedMps, pose, terrainKind, squadId,
   *     pois, stimuli, peers, speakers, rearPoint }
   */
  Step(dt, ctx) {
    const t = this.tuning;
    this.time += dt;
    const maxYaw = t.maxGazeYawDeg * DEG;

    const RelativeYaw = (tx, tz) => {
      const dx = tx - ctx.x, dz = tz - ctx.z;
      if (dx * dx + dz * dz < 0.04) return 0;
      const worldYaw = Math.atan2(-dx, -dz);
      return WrapAngle(worldYaw - ctx.yaw);
    };

    const RelativePitch = (tx, ty, tz) => {
      const horiz = Math.max(0.5, Math.hypot(tx - ctx.x, tz - ctx.z));
      return Clamp(Math.atan2((ty ?? ctx.y) - ctx.y, horiz), -18 * DEG, 24 * DEG);
    };

    // 1) 检查 P0 瞬时刺激（枪声/爆炸/手动点击激励）：最高优、可打断当前普通扫视
    let bestStimulus = null;
    for (const st of ctx.stimuli || []) {
      const age = this.time - st.time;
      if (age < 0 || age > (st.durationS || 2.8)) continue;
      const dist = Math.hypot(st.x - ctx.x, st.z - ctx.z);
      if (dist > (st.radiusM || 45)) continue;
      const key = st.id || `${st.time.toFixed(2)}:${st.x.toFixed(1)}`;
      if (!this.stimulusMemory.has(key)) {
        // 错峰反应延迟 0.10–0.36 s，绝不全员同一帧齐刷刷甩头
        this.stimulusMemory.set(key, st.time + 0.10 + this.rnd() * 0.26);
      }
      if (this.time < this.stimulusMemory.get(key)) continue;
      if (!bestStimulus || st.time > bestStimulus.time) bestStimulus = { ...st, key };
    }

    if (bestStimulus && (!this.task || this.task.key !== bestStimulus.key)) {
      const rel = RelativeYaw(bestStimulus.x, bestStimulus.z);
      const fixS = 1.05 + this.rnd() * 1.05;
      this.task = {
        priority: 0,
        kind: "stimulus",
        key: bestStimulus.key,
        label: bestStimulus.label || "突发声响",
        target: [bestStimulus.x, bestStimulus.z],
        startAt: this.time,
        saccadeS: 0.16 + this.rnd() * 0.08,
        fixS,
        secondYaw: null,
        secondFixS: 0,
        returnS: 0.38,
        yaw: Clamp(rel, -maxYaw * 1.15, maxYaw * 1.15),
        pitch: RelativePitch(bestStimulus.x, (bestStimulus.y ?? ctx.y) + 1.0, bestStimulus.z),
      };
      this.glances += 1;
    }

    // 2) 检查当前任务是否结束
    if (this.task) {
      const total = this.task.saccadeS + this.task.fixS
        + (this.task.secondYaw != null ? this.task.saccadeS * 1.15 + this.task.secondFixS : 0)
        + this.task.returnS;
      if (this.time - this.task.startAt >= total) {
        if (this.task.key) this.cooldowns.set(this.task.key, this.time + 5.5 + this.rnd() * 4.5);
        this.task = null;
      }
    }

    // 3) 若无高优任务，依次评估 P1 战术 POI → P2 社交凝视 → P3 环境警戒扫视
    if (!this.task) {
      let candidate = null;

      // P2-a 班长定期回头确认队伍是否跟上
      if (this.role === "leader" && ctx.rearPoint && this.time >= this.nextLeaderCheckAt) {
        this.nextLeaderCheckAt = this.time + t.leaderCheckMinS + this.rnd() * (t.leaderCheckMaxS - t.leaderCheckMinS);
        const rel = RelativeYaw(ctx.rearPoint[0], ctx.rearPoint[1]);
        const sign = rel >= 0 ? 1 : -1;
        candidate = {
          priority: 2,
          kind: "leaderCheck",
          key: `leaderCheck_${Math.floor(this.time)}`,
          label: "回头确认队伍",
          target: [ctx.rearPoint[0], ctx.rearPoint[1]],
          yaw: sign * Math.min(Math.max(55 * DEG, Math.abs(rel)), Math.max(maxYaw, 74 * DEG)),
          pitch: -2 * DEG,
          fixS: 0.55 + this.rnd() * 0.50,
          saccadeS: 0.24,
          returnS: 0.42,
        };
      }

      // P2-b 正在说话的队友（读对白事件）
      if (!candidate && t.socialWeight > 0.05) {
        for (const sp of ctx.speakers || []) {
          if (sp.id === this.id) continue;
          const dist = Math.hypot(sp.x - ctx.x, sp.z - ctx.z);
          if (dist > t.socialRangeM * 1.35) continue;
          const key = `speak:${sp.id}:${sp.eventKey}`;
          if ((this.cooldowns.get(key) || 0) > this.time) continue;
          const rel = RelativeYaw(sp.x, sp.z);
          if (Math.abs(rel) > 105 * DEG) continue;
          if (this.rnd() < 0.72 * t.socialWeight) {
            candidate = {
              priority: 2,
              kind: "social",
              key,
              label: `看说话人 ${sp.name || sp.id}`,
              target: [sp.x, sp.z],
              yaw: Clamp(rel, -maxYaw, maxYaw),
              pitch: 0,
              fixS: 0.7 + this.rnd() * 0.7,
              saccadeS: 0.22,
              returnS: 0.38,
            };
            break;
          } else {
            this.cooldowns.set(key, this.time + 6);
          }
        }
      }

      // P1 前方战术 POI（盲区拐角、高处沟沿、掩体缺口）
      if (!candidate && t.poiWeight > 0.05 && this.time >= this.nextAmbientAt - 0.6) {
        let bestPoi = null, bestScore = 0;
        for (const poi of ctx.pois || []) {
          const key = `poi:${poi.kind}:${poi.x.toFixed(1)},${poi.z.toFixed(1)}`;
          if ((this.cooldowns.get(key) || 0) > this.time) continue;
          const dist = Math.hypot(poi.x - ctx.x, poi.z - ctx.z);
          if (dist < 2.2 || dist > t.poiRangeM) continue;
          const rel = RelativeYaw(poi.x, poi.z);
          // 只看前方偏侧 12°–78° 的 POI（正前方本来就看着，无需扭头）
          if (Math.abs(rel) < 12 * DEG || Math.abs(rel) > 78 * DEG) continue;
          const score = (poi.weight || 0.8) * t.poiWeight * (1 - dist / (t.poiRangeM * 1.25));
          if (score > bestScore) { bestScore = score; bestPoi = { poi, rel, key }; }
        }
        if (bestPoi && this.rnd() < Math.min(0.88, bestScore * (0.55 + t.alertness * 0.55))) {
          const isRim = bestPoi.poi.kind === "trenchRim";
          candidate = {
            priority: 1,
            kind: "poi",
            key: bestPoi.key,
            label: bestPoi.poi.kind === "blindCorner" ? "警戒拐角盲区" : isRim ? "仰瞥高处沟沿" : "观察掩体/路口",
            target: [bestPoi.poi.x, bestPoi.poi.z],
            yaw: Clamp(bestPoi.rel, -maxYaw, maxYaw),
            pitch: isRim ? t.rimPitchDeg * DEG * (0.7 + this.rnd() * 0.45) : RelativePitch(bestPoi.poi.x, bestPoi.poi.y, bestPoi.poi.z),
            fixS: t.fixationMinS + this.rnd() * (t.fixationMaxS - t.fixationMinS),
            saccadeS: t.saccadeDurS * (0.85 + this.rnd() * 0.35),
            returnS: t.returnDurS,
          };
        }
      }

      // P2-c 邻近跨队擦肩人或同簇并肩搭档侧目
      if (!candidate && t.socialWeight > 0.1 && this.time >= this.nextAmbientAt - 0.3) {
        let bestPeer = null, bestDist = t.socialRangeM;
        for (const peer of ctx.peers || []) {
          if (peer.id === this.id) continue;
          const key = `peer:${peer.id}`;
          if ((this.cooldowns.get(key) || 0) > this.time) continue;
          const dist = Math.hypot(peer.x - ctx.x, peer.z - ctx.z);
          if (dist < 0.8 || dist > bestDist) continue;
          const rel = RelativeYaw(peer.x, peer.z);
          if (Math.abs(rel) < 18 * DEG || Math.abs(rel) > 72 * DEG) continue;
          // 跨队擦肩而过权重更高
          const crossBonus = peer.squadId !== ctx.squadId ? 0.55 : 1.0;
          if (dist * crossBonus < bestDist) { bestDist = dist * crossBonus; bestPeer = { peer, rel, key }; }
        }
        if (bestPeer && this.rnd() < 0.42 * t.socialWeight) {
          candidate = {
            priority: 2,
            kind: "social",
            key: bestPeer.key,
            label: bestPeer.peer.squadId !== ctx.squadId ? `侧目避让 ${bestPeer.peer.name}` : `瞥向同伴 ${bestPeer.peer.name}`,
            target: [bestPeer.peer.x, bestPeer.peer.z],
            yaw: Clamp(bestPeer.rel, -maxYaw, maxYaw),
            pitch: 0,
            fixS: 0.45 + this.rnd() * 0.55,
            saccadeS: 0.22,
            returnS: 0.36,
          };
        }
      }

      // P3 泊松间隔环境警戒扫视（Saccade-Fixation-Return，含可选反向二次扫视）
      if (!candidate && this.time >= this.nextAmbientAt) {
        const paused = ctx.speedMps < 0.18 || ctx.pose === "stalkPause" || ctx.pose === "rest" || ctx.pose === "pause";
        const span = Math.max(0.6, t.scanIntervalMaxS - t.scanIntervalMinS);
        const alertScale = 1.35 - t.alertness * 0.65;
        this.nextAmbientAt = this.time + (t.scanIntervalMinS + this.rnd() * span) * alertScale * (paused ? 0.65 : 1.0);

        const triggerChance = paused ? Math.min(0.92, 0.42 + t.alertness * 0.45) : Math.min(0.85, 0.30 + t.alertness * 0.52);
        if (this.rnd() < triggerChance) {
          // 避免总是往同一边甩头，但也不严格机械交替
          const sign = this.rnd() < 0.68 ? -this.lastGlanceSign : this.lastGlanceSign;
          this.lastGlanceSign = sign;
          const deg = t.ambientScanMinDeg + this.rnd() * Math.max(4, t.ambientScanMaxDeg - t.ambientScanMinDeg);
          const doubleScan = this.rnd() < (paused ? t.doubleGlanceChance * 1.45 : t.doubleGlanceChance);
          const secondDeg = t.ambientScanMinDeg * 0.8 + this.rnd() * Math.max(4, (t.ambientScanMaxDeg - t.ambientScanMinDeg) * 0.85);
          const lookRim = ctx.terrainKind === "trench" && this.rnd() < 0.48;
          const lookGround = !lookRim && !paused && this.rnd() < t.groundGlanceChance;
          candidate = {
            priority: 3,
            kind: "scan",
            key: null,
            label: doubleScan ? "左右警戒扫视" : (lookRim ? "扫视沟沿" : lookGround ? "低头看路" : (sign > 0 ? "向左侧张望" : "向右侧张望")),
            target: null,
            yaw: Clamp(sign * deg * DEG, -maxYaw, maxYaw),
            pitch: lookRim ? t.rimPitchDeg * DEG * (0.65 + this.rnd() * 0.45) : (lookGround ? t.groundPitchDeg * DEG : (this.rnd() - 0.5) * 4 * DEG),
            secondYaw: doubleScan ? Clamp(-sign * secondDeg * DEG, -maxYaw, maxYaw) : null,
            secondFixS: doubleScan ? (0.38 + this.rnd() * 0.52) : 0,
            fixS: t.fixationMinS + this.rnd() * (t.fixationMaxS - t.fixationMinS),
            saccadeS: t.saccadeDurS * (0.85 + this.rnd() * 0.35),
            returnS: t.returnDurS,
          };
        }
      }

      if (candidate) {
        this.task = { startAt: this.time, secondYaw: null, secondFixS: 0, ...candidate };
        this.glances += 1;
        // 调度下一次环境扫描时间（确保结束后有冷静直视期）
        const span = Math.max(0.6, t.scanIntervalMaxS - t.scanIntervalMinS);
        this.nextAmbientAt = Math.max(this.nextAmbientAt, this.time + candidate.fixS + 1.4 + this.rnd() * span * 0.75);
      }
    }

    // 4) 按四拍曲线求当前期望视线角（若任务带世界坐标目标，随走动实时微调相对角）
    let wantedYaw = 0;
    let wantedPitch = 0;
    let activeKind = "route";
    let activeLabel = "直视前方路线";
    let activeTarget = null;

    if (this.task) {
      const tk = this.task;
      activeKind = tk.kind;
      activeLabel = tk.label;
      activeTarget = tk.target;
      let goalYaw = tk.yaw;
      if (tk.target) {
        const dyn = RelativeYaw(tk.target[0], tk.target[1]);
        if (Math.abs(dyn) <= maxYaw * 1.25) goalYaw = Clamp(dyn, -maxYaw * 1.15, maxYaw * 1.15);
      }
      const elapsed = this.time - tk.startAt;
      const t1 = tk.saccadeS;
      const t2 = t1 + tk.fixS;
      const microBreath = Math.sin(this.time * 2.4 + this.id.length) * 1.2 * DEG;
      if (elapsed < t1) {
        const u = elapsed / Math.max(0.05, t1);
        const s = u * u * (3 - 2 * u);
        wantedYaw = goalYaw * s;
        wantedPitch = tk.pitch * s;
      } else if (elapsed < t2) {
        wantedYaw = goalYaw + microBreath;
        wantedPitch = tk.pitch;
      } else if (tk.secondYaw != null) {
        const t3 = t2 + tk.saccadeS * 1.15;
        const t4 = t3 + tk.secondFixS;
        if (elapsed < t3) {
          const u = (elapsed - t2) / Math.max(0.05, t3 - t2);
          const s = u * u * (3 - 2 * u);
          wantedYaw = goalYaw + (tk.secondYaw - goalYaw) * s;
          wantedPitch = tk.pitch * (1 - s * 0.4);
        } else if (elapsed < t4) {
          wantedYaw = tk.secondYaw + microBreath;
          wantedPitch = tk.pitch * 0.6;
        } else {
          const u = Clamp((elapsed - t4) / Math.max(0.05, tk.returnS), 0, 1);
          const s = 1 - u * u * (3 - 2 * u);
          wantedYaw = tk.secondYaw * s;
          wantedPitch = tk.pitch * 0.6 * s;
        }
      } else {
        const u = Clamp((elapsed - t2) / Math.max(0.05, tk.returnS), 0, 1);
        const s = 1 - u * u * (3 - 2 * u);
        wantedYaw = goalYaw * s;
        wantedPitch = tk.pitch * s;
      }
    }

    // 5) 分级弹簧延迟：Head 先动、Neck 滞后、Chest 最慢，合成为总观察角
    const share = SplitGazeChain(wantedYaw);
    [this.headYaw, this.headVel] = StepSpring(this.headYaw, this.headVel, wantedYaw * share.head, t.headSpringHz, dt);
    [this.neckYaw, this.neckVel] = StepSpring(this.neckYaw, this.neckVel, wantedYaw * share.neck, t.neckSpringHz, dt);
    [this.chestYaw, this.chestVel] = StepSpring(this.chestYaw, this.chestVel, wantedYaw * share.chest, t.chestSpringHz, dt);
    [this.pitch, this.pitchVel] = StepSpring(this.pitch, this.pitchVel, wantedPitch, t.headSpringHz * 0.85, dt);

    const totalGazeYaw = this.headYaw + this.neckYaw + this.chestYaw;
    // 大角度回头看时，联动脚步轻微放慢（>52° 生效）
    const overRad = Math.max(0, Math.abs(totalGazeYaw) - 52 * DEG);
    const speedFactor = 1 - Clamp(overRad / (35 * DEG), 0, 1) * t.lookBackSlowdown;

    return {
      gazeYaw: totalGazeYaw,
      gazePitch: this.pitch,
      headYaw: this.headYaw,
      neckYaw: this.neckYaw,
      chestYaw: this.chestYaw,
      gazeKind: Math.abs(totalGazeYaw) > 7 * DEG || activeKind !== "route" ? activeKind : "route",
      gazeLabel: Math.abs(totalGazeYaw) > 7 * DEG || activeKind !== "route" ? activeLabel : "直视前方路线",
      gazeTarget: activeTarget,
      speedFactor,
    };
  }
}
