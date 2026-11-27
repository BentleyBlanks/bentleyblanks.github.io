// 通用小队行进 PCG Spline 自动化仿真与确定性编译器（L2–L5 融合层）：纯数学、零 Three.js、零 DOM。
//
// 核心设计：
//   · 归属判定严格按编排数据身份（squad.id），绝不按空间交叉误合并两支独立小队；
//   · 两支交叉小队各自保持独立领队、独立社交簇与独立节奏，但在 L4 共享前瞻避让（TTC 礼让错身）与 L5 彼此侧目；
//   · 同一份纯数学仿真产出紧凑的确定性轨迹表（CompiledSquadScene），支持任意秒 O(log N) 随机 Seek，
//     同时也产出「原版折线机器人对照组（baseline）」与可量化自然度遥测指标，供编辑器直观对比与 Node 门禁验收。

import { SQUAD_SPLINE_DEFAULTS as D, SQUAD_SPLINE_PROFILES } from "./Data_Tuning_SquadSpline.mjs";
import { BuildSquadCorridor } from "./Script_SquadSpline.mjs";
import { MakeGazeRandom, ProceduralGazeAgent } from "./Script_ProceduralGaze.mjs";

const Clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const Lerp = (a, b, t) => a + (b - a) * t;
const AngleLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const Smoothstep = (e0, e1, x) => {
  if (e1 <= e0) return x >= e1 ? 1 : 0;
  const t = Clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 合成指定 Profile + 自定义覆盖的完整调参对象。 */
export function ResolveSquadSplineTuning(profileId = "trench_march_cautious", overrides = {}) {
  const profile = SQUAD_SPLINE_PROFILES[profileId] || SQUAD_SPLINE_PROFILES.trench_march_cautious;
  return { ...D, ...(profile.overrides || {}), ...(overrides || {}) };
}

/** 软夹持：接近边界时平滑收敛，避免硬夹持把移动轨迹压成紧贴墙面的僵硬直线。 */
function SoftClamp(val, lo, hi) {
  if (hi <= lo) return (lo + hi) * 0.5;
  const mid = (lo + hi) * 0.5;
  const half = (hi - lo) * 0.5;
  const norm = (val - mid) / Math.max(1e-4, half);
  return mid + Math.tanh(norm * 0.92) * half;
}

/** 计算一条原始折线的总长与线性取样（用于「原版机器人折线」对照鬼影）。 */
function SamplePolyline(route, distance) {
  const pts = route.map((p) => (Array.isArray(p) ? p : [p.x ?? p.p?.[0] ?? 0, p.z ?? p.p?.[1] ?? 0]));
  let total = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i += 1) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(len);
    total += len;
  }
  let rem = Clamp(distance, 0, total);
  for (let i = 0; i < segs.length; i += 1) {
    if (rem <= segs[i] || i === segs.length - 1) {
      const u = segs[i] > 1e-6 ? Clamp(rem / segs[i], 0, 1) : 0;
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
      return {
        x: pts[i][0] + dx * u,
        z: pts[i][1] + dz * u,
        yaw: Math.hypot(dx, dz) > 1e-5 ? Math.atan2(-dx, -dz) : 0,
        total,
      };
    }
    rem -= segs[i];
  }
  return { x: pts[0][0], z: pts[0][1], yaw: 0, total };
}

/**
 * 为一支小队的成员生成非均匀社交微簇（L2）：
 *   · leader 单独领跑（略前）；
 *   · mgGunner + mgAssistant 强制绑成一对主副射手弹性搭档；
 *   · 其余队员按确定性种子划分为 1–3 人松散社交簇（破除等距串珠），同时给出受限走廊与开阔野外两套槽位坐标。
 */
function AssignSocialSlots(members, tuning, seed) {
  const rnd = MakeGazeRandom(`${seed}:slots`);
  const list = members.map((m, idx) => ({
    id: String(m.id ?? `m${idx}`),
    name: m.name || `成员 ${idx + 1}`,
    role: m.role || (idx === 0 ? "leader" : "rifleman"),
    socialGroup: m.socialGroup || null,
    index: idx,
  }));

  // 划分微簇
  const clusters = [];
  let i = 0;
  while (i < list.length) {
    const cur = list[i];
    if (cur.role === "leader") {
      clusters.push([cur]);
      i += 1;
      continue;
    }
    if (cur.role === "mgGunner" && list[i + 1]?.role === "mgAssistant") {
      clusters.push([cur, list[i + 1]]);
      i += 2;
      continue;
    }
    if (cur.socialGroup) {
      const grp = [cur];
      while (i + 1 < list.length && list[i + 1].socialGroup === cur.socialGroup && grp.length < 3) {
        i += 1;
        grp.push(list[i]);
      }
      clusters.push(grp);
      i += 1;
      continue;
    }
    const minC = Math.max(1, Math.round(tuning.clusterSizeMin));
    const maxC = Math.max(minC, Math.round(tuning.clusterSizeMax));
    const size = Math.min(list.length - i, minC + Math.floor(rnd() * (maxC - minC + 1)));
    clusters.push(list.slice(i, i + size));
    i += size;
  }

  // 为每个成员计算「走廊槽位」与「开阔地战术槽位」
  const slots = [];
  let cursorBack = 0;
  let prevSideBias = rnd() < 0.5 ? -1 : 1;

  for (let cIdx = 0; cIdx < clusters.length; cIdx += 1) {
    const cl = clusters[cIdx];
    const isLeader = cl.length === 1 && cl[0].role === "leader";
    const isMgPair = cl.length === 2 && cl[0].role === "mgGunner";
    const isFirstAfterLeader = cIdx === 1 && clusters[0]?.[0]?.role === "leader";

    if (cIdx > 0) {
      const gap = isFirstAfterLeader
        ? tuning.leaderLeadM * (0.85 + rnd() * 0.35)
        : tuning.interClusterGapM * (0.76 + rnd() * 0.48);
      cursorBack += gap;
    }

    for (let k = 0; k < cl.length; k += 1) {
      const m = cl[k];
      let corridorSideNorm = 0; // -1..+1
      let corridorBack = cursorBack;
      let openSideNorm = 0;
      let openBack = cursorBack;

      if (isLeader) {
        corridorSideNorm = (rnd() - 0.5) * 0.28;
        openSideNorm = (rnd() - 0.5) * 0.18;
      } else if (isMgPair) {
        // 机枪正副射手：主射手居中微偏，副射手斜后侧提弹药箱伴随
        const side = prevSideBias;
        corridorSideNorm = k === 0 ? -side * 0.22 : side * 0.48;
        corridorBack = cursorBack + (k === 0 ? 0 : tuning.mgBuddyGapM * 0.72);
        openSideNorm = k === 0 ? -side * 0.18 : side * 0.52;
        openBack = cursorBack + (k === 0 ? 0 : tuning.mgBuddyGapM);
      } else {
        // 簇内分布：2 人微错并肩，3 人松散三角，1 人自然偏侧
        if (cl.length === 1) {
          prevSideBias = -prevSideBias;
          corridorSideNorm = prevSideBias * (0.28 + rnd() * 0.42);
          openSideNorm = prevSideBias * (0.35 + rnd() * 0.52);
        } else if (cl.length === 2) {
          const sign = k === 0 ? -prevSideBias : prevSideBias;
          corridorSideNorm = sign * (0.42 + rnd() * 0.34);
          corridorBack = cursorBack + (k === 0 ? 0 : tuning.intraClusterGapM * (0.25 + rnd() * 0.45));
          openSideNorm = sign * (0.45 + rnd() * 0.45);
          openBack = cursorBack + (k === 0 ? 0 : tuning.intraClusterGapM * (0.45 + rnd() * 0.55));
        } else {
          // 3 人三角：中前 + 左后 + 右稍后
          const pattern = [0, -1, 1][k] || 0;
          corridorSideNorm = pattern * (0.58 + rnd() * 0.28) + (pattern === 0 ? (rnd() - 0.5) * 0.25 : 0);
          corridorBack = cursorBack + (k === 0 ? 0 : tuning.intraClusterGapM * (0.55 + k * 0.32 + rnd() * 0.25));
          openSideNorm = pattern * (0.68 + rnd() * 0.30) + (pattern === 0 ? (rnd() - 0.5) * 0.20 : 0);
          openBack = cursorBack + (k === 0 ? 0 : tuning.intraClusterGapM * (0.85 + k * 0.42));
        }
        prevSideBias = -prevSideBias;
      }

      // 针对 wedge / echelon / column 风格做战术几何偏置
      if (!isLeader && !isMgPair) {
        const rank = slots.length;
        if (tuning.formationStyle === "wedge") {
          const wing = rank % 2 === 1 ? -1 : 1;
          const tier = Math.ceil(rank / 2);
          openSideNorm = Clamp(wing * (0.36 + tier * 0.28) + (rnd() - 0.5) * 0.16, -1.0, 1.0);
          openBack = tier * (tuning.intraClusterGapM * 1.15) + (rnd() - 0.5) * 0.7;
        } else if (tuning.formationStyle === "echelon") {
          const tier = rank;
          openSideNorm = Clamp(-0.75 + (tier / Math.max(1, list.length - 1)) * 1.55 + (rnd() - 0.5) * 0.18, -1.0, 1.0);
          openBack = tier * (tuning.intraClusterGapM * 0.92) + (rnd() - 0.5) * 0.6;
        } else if (tuning.formationStyle === "column") {
          corridorSideNorm *= 0.45;
          openSideNorm *= 0.40;
        }
      }

      slots.push({
        ...m,
        clusterId: cIdx,
        clusterSize: cl.length,
        slotRank: slots.length,
        corridorSideNorm,
        corridorBack,
        openSideNorm,
        openBack,
        narrowExtraBack: k * 0.85 + (corridorSideNorm > 0 ? 0.35 : 0),
        cornerCutBias: 0.28 + rnd() * 0.44,
        wanderPhaseA: rnd() * Math.PI * 2,
        wanderPhaseB: rnd() * Math.PI * 2,
        strideScale: 1 + (rnd() - 0.5) * 2 * tuning.speedVariation,
        paceHz: tuning.paceHzMin + rnd() * Math.max(0.01, tuning.paceHzMax - tuning.paceHzMin),
        pacePhase: rnd() * Math.PI * 2,
        personalGapM: tuning.minGapM * (0.86 + rnd() * 0.34),
      });
    }
    if (cl.length > 1) cursorBack += tuning.intraClusterGapM * (cl.length - 1) * 0.55;
  }

  return slots;
}

/**
 * 确定性编译多支小队在同一场景上的 PCG 行进轨迹（同时生成原版折线对照组与量化指标）。
 * @param {object} spec
 *   { env, durationS, stepS, stimuli, squads: [{ id, label, side, profile, seed, startTimeS, route, members, overrides, speakerEvents }] }
 */
export function CompileSquadScene(spec) {
  const {
    env = null,
    durationS = 32,
    stepS = 0.15,
    stimuli = [],
    squads: rawSquads = [],
  } = spec || {};

  const dt = Clamp(stepS, 0.05, 0.25);
  const steps = Math.max(2, Math.ceil(durationS / dt));

  // 1) 为每支小队独立编译走廊、槽位与个体状态（严格按 squad.id 隔离，绝不因路线交叉混编）
  const squadRuntimes = rawSquads.map((sq, sqIdx) => {
    const profileId = sq.profile || "trench_march_cautious";
    const tuning = ResolveSquadSplineTuning(profileId, sq.overrides);
    const seed = String(sq.seed ?? `${sq.id || sqIdx}`);
    const corridor = BuildSquadCorridor(sq.route, {
      env,
      openSpreadM: tuning.openSpreadM,
      obstacleClearanceM: tuning.obstacleClearanceM,
      startTaperM: tuning.startTaperM,
      endTaperM: tuning.endTaperM,
      concealmentClamp: tuning.concealmentClamp || sq.concealmentClamp === true,
    });
    const slots = AssignSocialSlots(sq.members || [], tuning, seed);
    const rnd = MakeGazeRandom(`${seed}:cadence`);
    const startTimeS = Number(sq.startTimeS) || 0;

    // 计算初始弧长排列：保证即使 12 人进窄战壕，队尾与队头之间也有足够纵向松弛空间，不把人挤叠在 s=0
    const maxStartBack = slots.reduce((mx, sl) => Math.max(mx, sl.corridorBack), 0);
    const minStartSpan = Math.min(corridor.length * 0.42, Math.max(0, (slots.length - 1) * 0.92));
    const initialSpan = Math.min(corridor.length * 0.45, Math.max(minStartSpan, maxStartBack * 0.85));

    const actors = slots.map((slot, idx) => {
      const ratio = maxStartBack > 0 ? (slot.corridorBack / maxStartBack) : (slots.length > 1 ? idx / (slots.length - 1) : 0);
      const startS = Clamp(initialSpan * (1 - ratio), 0, corridor.length * 0.45);
      const st0 = corridor.SampleAt(startS);
      const openBlend0 = Smoothstep(tuning.openFieldThresholdM * 0.72, tuning.openFieldThresholdM * 1.25, st0.width);
      const wantD0 = Lerp(slot.corridorSideNorm * Math.min(tuning.maxSpreadM * 0.5, st0.width * 0.42),
        slot.openSideNorm * Math.min(tuning.openSpreadM * 0.5, st0.width * 0.46), openBlend0) * st0.envelope;
      const d0 = SoftClamp(wantD0, st0.dMin, st0.dMax);
      const w0 = corridor.ToWorld(startS, d0);
      const firstRun = tuning.runMinS * tuning.firstRunScale;
      const startDelay = slot.role === "leader"
        ? 0
        : Math.min(2.6, idx * tuning.startDelayWaveS + rnd() * tuning.startDelayJitterS);

      return {
        squadId: String(sq.id || `squad_${sqIdx}`),
        squadLabel: sq.label || `小队 ${sqIdx + 1}`,
        side: sq.side || "friend",
        profileId,
        slot,
        id: `${sq.id || sqIdx}:${slot.id}`,
        localId: slot.id,
        name: slot.name,
        role: slot.role,
        s: startS,
        d: d0,
        x: w0.x,
        z: w0.z,
        y: w0.y,
        vx: 0,
        vz: 0,
        speed: 0,
        yaw: Math.atan2(-st0.tx, -st0.tz),
        phase: "startDelay", // startDelay | move | brake | pause | rest | stalkPause | ease | arrived
        startAt: startTimeS + startDelay,
        runLeft: firstRun + rnd() * Math.max(0.4, tuning.runMaxS - firstRun),
        pauseLeft: 0,
        lastStop: -99,
        blockedS: 0,
        overtakeBias: 0,
        overtakeUntil: -99,
        avoidOffsetD: 0,
        gaze: new ProceduralGazeAgent(slot.id, slot.role, seed, tuning),
        rnd: MakeGazeRandom(`${seed}:act:${slot.id}`),
        // 原版折线机器人对照参数（等距等速单轨）
        baselineStart: startTimeS + idx * 0.40,
        baselineSpeed: tuning.speedMps,
        baselineStopS: Math.max(0.5, corridor.length - idx * 1.65),
        // 遥测采样
        speedSamples: [],
        lateralSamples: [],
        gazeActiveSteps: 0,
        totalMoveSteps: 0,
        pauseCount: 0,
      };
    });

    return {
      id: String(sq.id || `squad_${sqIdx}`),
      label: sq.label || `小队 ${sqIdx + 1}`,
      side: sq.side || "friend",
      profileId,
      seed,
      startTimeS,
      tuning,
      corridor,
      route: sq.route,
      speakerEvents: sq.speakerEvents || [],
      actors,
      lastSquadStop: -99,
    };
  });

  const allActors = squadRuntimes.flatMap((sq) => sq.actors);
  const frames = [];
  let minPairDistGlobal = Infinity;
  let crossSquadAvoidEvents = 0;

  // 2) 固定步长确定性仿真（烘焙成随机 Seek 帧表）
  for (let step = 0; step <= steps; step += 1) {
    const time = Number((step * dt).toFixed(4));

    // 先收集所有人的当前位置供跨队 TTC 与社交凝视读取
    const peerSnapshots = allActors.map((a) => ({
      id: a.localId, fullId: a.id, name: a.name, squadId: a.squadId, side: a.side,
      x: a.x, z: a.z, vx: a.vx, vz: a.vz, speed: a.speed,
    }));

    // 逐小队更新 L2 + L3 + L4 + L5
    for (const sq of squadRuntimes) {
      const t = sq.tuning;
      const cor = sq.corridor;
      const leader = sq.actors.find((a) => a.role === "leader") || sq.actors[0];
      const leadS = leader ? leader.s : 0;

      // 当前正在说话的成员（来自编排对白事件）
      const activeSpeakers = [];
      for (const ev of sq.speakerEvents) {
        if (time >= ev.t0 && time <= ev.t1) {
          const sp = sq.actors.find((a) => a.localId === ev.speakerId);
          if (sp) activeSpeakers.push({ id: sp.localId, name: sp.name, x: sp.x, z: sp.z, eventKey: `${ev.t0}` });
        }
      }

      // 计算队尾参考点供班长定期回头确认
      const rearActor = sq.actors.reduce((rear, a) => (!rear || a.s < rear.s ? a : rear), null);
      const rearPoint = rearActor && rearActor !== leader ? [rearActor.x, rearActor.z] : null;

      // 按各自当前已停人数限流局部停步密度
      const activeStoppedCount = () => sq.actors.filter((a) => a.role !== "leader" && ["brake", "pause", "rest", "stalkPause", "ease"].includes(a.phase)).length;
      const maxStopped = Math.max(1, Math.floor(Math.max(1, sq.actors.length - 1) * t.restFraction));

      for (const a of sq.actors) {
        const st = cor.SampleAt(a.s);
        const endSpreadBack = Math.max(a.slot.corridorBack * 0.65, a.slot.slotRank * 0.95);
        const goalS = Math.max(0.5, cor.length - (a.role === "leader" ? 0 : Math.min(cor.length * 0.42, endSpreadBack)));
        const remS = Math.max(0, goalS - a.s);

        // 2a) L5 注意力与左顾右盼评估
        const gazeOut = a.gaze.Step(step === 0 ? 0.001 : dt, {
          x: a.x, z: a.z, y: a.y, yaw: a.yaw, speedMps: a.speed, pose: a.phase,
          terrainKind: st.terrainKind, squadId: sq.id,
          pois: cor.pois, stimuli, peers: peerSnapshots, speakers: activeSpeakers, rearPoint,
        });
        a.lastGaze = gazeOut;

        if (step === 0) continue;

        // 2b) 到达终点
        if (remS <= 0.35 && a.phase !== "startDelay") {
          a.phase = "arrived";
          a.speed = Math.max(0, a.speed - t.decelMps2 * dt);
          a.vx = 0; a.vz = 0;
          continue;
        }

        // 2c) 多米诺起步波
        if (a.phase === "startDelay") {
          if (time >= a.startAt) a.phase = "move";
          else { a.speed = 0; a.vx = 0; a.vz = 0; continue; }
        }

        // 2d) L3 错峰微停 / 潜行蹲停 / 喘息 / 缓步状态机（班长豁免普通随机喘息，但 stalk/bounds 可执行战术停听）
        const narrow = st.width < 1.65;
        const canRandomPause = !narrow && remS > 3.2 && a.s > t.startTaperM
          && (a.role !== "leader" || t.cadence === "stalk");

        if (a.phase === "move") {
          if (a.speed > 0.35) a.runLeft -= dt;
          if (canRandomPause && a.runLeft <= 0) {
            const allowDensity = activeStoppedCount() < maxStopped && (time - sq.lastSquadStop >= t.stopGapS);
            if (allowDensity) {
              sq.lastSquadStop = time;
              a.lastStop = time;
              a.pauseLeft = t.pauseMinS + a.rnd() * Math.max(0.1, t.pauseMaxS - t.pauseMinS);
              a.pauseCount += 1;
              a.phase = t.cadence === "ease" ? "ease" : "brake";
            } else {
              // 被密度限制驳回后错峰重试，防止解除瞬间扎堆同时刹住
              a.runLeft = 0.55 + a.rnd() * 1.45;
            }
          }
        } else if (a.phase === "brake") {
          if (a.speed <= 0.08) {
            a.speed = 0;
            a.phase = t.cadence === "rest" ? "rest" : (t.cadence === "stalk" || t.cadence === "bounds" ? "stalkPause" : "pause");
          }
        } else if (a.phase === "pause" || a.phase === "rest" || a.phase === "stalkPause" || a.phase === "ease") {
          a.pauseLeft -= dt;
          if (a.pauseLeft <= 0) {
            a.phase = "move";
            a.runLeft = t.runMinS + a.rnd() * Math.max(0.2, t.runMaxS - t.runMinS);
          }
        }

        // 2e) L2 动态双形态期望横向偏移 d*（受限走廊拉链 ↔ 开阔野外散兵楔形/阶梯）
        const openBlend = Smoothstep(t.openFieldThresholdM * 0.72, t.openFieldThresholdM * 1.25, st.width);
        const narrowFactor = 1 - Smoothstep(1.3, 2.35, st.width);
        const corHalf = Math.min(t.maxSpreadM * 0.5, st.width * 0.44);
        const openHalf = Math.min(t.openSpreadM * 0.5, st.width * 0.46);
        const baseSlotD = Lerp(a.slot.corridorSideNorm * corHalf, a.slot.openSideNorm * openHalf, openBlend);

        // 人类切内弯偏置（顺曲率偏向弯内侧）
        const cutD = -Clamp(st.curvature * t.cornerCutGain, -1, 1) * t.cornerCutStrength * a.slot.cornerCutBias * Math.min(st.width * 0.42, 1.8);
        // 低频双阶有机横向漫游
        const wanderScale = Lerp(0.65, 1.35, openBlend);
        const wanderD = t.wanderAmpM * wanderScale * (
          0.65 * Math.sin((a.s / t.wanderWaveA) * Math.PI * 2 + a.slot.wanderPhaseA)
          + 0.35 * Math.sin((a.s / t.wanderWaveB) * Math.PI * 2 + a.slot.wanderPhaseB)
        );
        // 借道超车偏移衰减
        if (time > a.overtakeUntil) a.overtakeBias *= Math.exp(-dt * 2.2);

        const rawWantD = (baseSlotD + cutD + wanderD + a.overtakeBias + a.avoidOffsetD) * st.envelope;
        const targetD = SoftClamp(rawWantD, st.dMin, st.dMax);

        // 2f) L3 纵向速度目标：基准速度 × 个体步频 × 步速呼吸 × 队形弹性归位 × 回头微减速 × IDM 跟驰
        let pace = a.slot.strideScale * (1 + t.paceWobble * Math.sin(time * a.slot.paceHz * Math.PI * 2 + a.slot.pacePhase));
        if (a.role === "leader" && sq.actors.length > 1) {
          pace *= t.leaderSpeedScale;
        } else {
          // 期望纵向滞后（窄口自动叠加拉链错位补正）
          const desiredBack = Lerp(a.slot.corridorBack, a.slot.openBack, openBlend) + narrowFactor * a.slot.narrowExtraBack;
          const lagError = (leadS - desiredBack) - a.s;
          if (Math.abs(lagError) > 1.2) {
            pace *= 1 + Clamp(Math.sign(lagError) * (Math.abs(lagError) - 1.2) * 0.065, -0.18, 0.24);
          }
        }
        if (a.phase === "ease") pace *= t.easeScale;
        pace *= gazeOut.speedFactor;

        let wantedSpeed = t.speedMps * pace;
        // 终点平顺刹车曲线
        wantedSpeed = Math.min(wantedSpeed, Math.sqrt(Math.max(0, 2 * t.decelMps2 * Math.max(0, remS - 0.15))));
        if (a.phase === "brake" || a.phase === "pause" || a.phase === "rest" || a.phase === "stalkPause") wantedSpeed = 0;

        // IDM 简化版前车跟驰检测（只看同道前方邻人）
        let minFrontGap = Infinity;
        let frontStopped = false;
        let frontOffsetD = 0;
        for (const other of sq.actors) {
          if (other === a) continue;
          const ds = other.s - a.s;
          if (ds <= 0.05 || ds > 5.0) continue;
          const dd = Math.abs(other.d - a.d);
          if (dd > t.personalSpaceM * 0.95) continue;
          if (ds < minFrontGap) {
            minFrontGap = ds;
            frontStopped = other.speed < 0.25;
            frontOffsetD = other.d - a.d;
          }
        }
        const desiredGap = a.slot.personalGapM + a.speed * t.timeHeadwayS;
        if (minFrontGap < desiredGap * 1.45) {
          const ratio = Clamp((minFrontGap - t.personalSpaceM * 0.85) / Math.max(0.25, desiredGap * 1.45 - t.personalSpaceM * 0.85), 0, 1);
          wantedSpeed *= ratio;
        }
        // 前方有人停步较久且旁边有空间 → 温和横向借道绕过
        if (frontStopped && minFrontGap < desiredGap * 1.15 && a.phase === "move") {
          a.blockedS += dt;
          if (a.blockedS > t.overtakeWaitS && time > a.overtakeUntil && st.width >= 2.1) {
            const roomLeft = a.d - st.dMin;
            const roomRight = st.dMax - a.d;
            const passSign = (frontOffsetD >= 0 && roomLeft > t.overtakeSideM) ? -1
              : (roomRight > t.overtakeSideM ? 1 : (roomLeft > roomRight ? -1 : 1));
            a.overtakeBias = passSign * Math.min(t.overtakeSideM, st.width * 0.36);
            a.overtakeUntil = time + 2.4;
            a.blockedS = 0;
          }
        } else {
          a.blockedS = Math.max(0, a.blockedS - dt * 1.5);
        }

        // 2g) L4 跨小队 & 队内前瞻 TTC 软避让（两条交叉路线相遇时礼让错身，绝不合并身份）
        let ttcLateralImpulse = 0;
        let ttcSpeedScale = 1.0;
        const fwdVx = st.tx * wantedSpeed, fwdVz = st.tz * wantedSpeed;
        for (const other of peerSnapshots) {
          if (other.fullId === a.id) continue;
          const isCrossSquad = other.squadId !== sq.id;
          const rx = other.x - a.x, rz = other.z - a.z;
          const dist = Math.hypot(rx, rz);
          const checkRadius = isCrossSquad ? 4.8 : 3.2;
          if (dist > checkRadius || dist < 1e-4) continue;
          const rvx = fwdVx - other.vx, rvz = fwdVz - other.vz;
          const rv2 = rvx * rvx + rvz * rvz;
          const ttc = rv2 > 1e-4 ? Clamp((rx * rvx + rz * rvz) / rv2, 0, t.ttcHorizonS) : 0;
          const cpaX = rx - rvx * ttc, cpaZ = rz - rvz * ttc;
          const cpaDist = Math.hypot(cpaX, cpaZ);
          const safeDist = isCrossSquad ? t.crossSquadAvoidM : t.personalSpaceM;
          if (cpaDist < safeDist) {
            const urgency = (1 - cpaDist / safeDist) * (1 - ttc / (t.ttcHorizonS * 1.25));
            const latProj = rx * st.rx + rz * st.rz;
            const evadeSign = latProj >= 0 ? -1 : 1;
            ttcLateralImpulse += evadeSign * urgency * t.avoidStrength * (isCrossSquad ? 1.35 : 0.85);
            if (isCrossSquad) crossSquadAvoidEvents += 1;
            if (isCrossSquad && dist < safeDist * 1.35 && (rx * st.tx + rz * st.tz) > 0) {
              ttcSpeedScale = Math.min(ttcSpeedScale, 0.45 + 0.55 * (cpaDist / safeDist));
            }
          }
        }
        a.avoidOffsetD += Clamp(ttcLateralImpulse * dt * 2.2 - a.avoidOffsetD * dt * 1.8, -1.2 * dt, 1.2 * dt);
        a.avoidOffsetD = Clamp(a.avoidOffsetD, -1.6, 1.6);
        wantedSpeed *= ttcSpeedScale;

        // 2h) 积分更新速度、弧长与横向偏移
        a.speed += Clamp(wantedSpeed - a.speed, -t.decelMps2 * dt, t.accelMps2 * dt);
        a.speed = Math.max(0, a.speed);
        a.s = Clamp(a.s + a.speed * dt, 0, cor.length);

        const latRate = a.speed > 0.2 ? 1.85 : 0.45;
        a.d += Clamp(targetD - a.d, -latRate * dt, latRate * dt);
        const stNow = cor.SampleAt(a.s);
        a.d = Clamp(a.d, stNow.dMin, stNow.dMax);

        const world = cor.ToWorld(a.s, a.d);
        const dx = world.x - a.x, dz = world.z - a.z;
        a.vx = dx / dt;
        a.vz = dz / dt;
        a.x = world.x;
        a.z = world.z;
        a.y = world.y;

        if (Math.hypot(dx, dz) > 0.015) {
          const desiredYaw = Math.atan2(-dx, -dz);
          a.yaw = AngleLerp(a.yaw, desiredYaw, Clamp(dt * 6.5, 0, 1));
        }

        // 记录遥测样本
        if (a.phase !== "arrived") {
          a.speedSamples.push(a.speed);
          a.lateralSamples.push(a.d);
          a.totalMoveSteps += 1;
          if (Math.abs(gazeOut.gazeYaw) > 12 * Math.PI / 180) a.gazeActiveSteps += 1;
        }
      }
    }

    // 3) 全局最小个人空间投影松弛（4 次迭代：窄战壕内横向受限时优先沿弧长 s 推开，确保零叠罗汉且不出走廊）
    if (step > 0) {
      for (let iter = 0; iter < 4; iter += 1) {
        for (let i = 0; i < allActors.length; i += 1) {
          for (let j = i + 1; j < allActors.length; j += 1) {
            const A = allActors[i], B = allActors[j];
            if (A.phase === "startDelay" && B.phase === "startDelay") continue;
            const dx = B.x - A.x, dz = B.z - A.z;
            const dist = Math.hypot(dx, dz);
            const minSep = A.squadId === B.squadId ? 0.86 : 0.96;
            if (dist < minSep && dist > 1e-5) {
              const push = (minSep - dist) * 0.54;
              const nx = dx / dist, nz = dz / dist;
              const sqA = squadRuntimes.find((s) => s.id === A.squadId);
              const sqB = squadRuntimes.find((s) => s.id === B.squadId);
              const ApplySafeShift = (act, sq, sx, sz) => {
                const st = sq.corridor.SampleAt(act.s);
                let ds = sx * st.tx + sz * st.tz;
                const dd = sx * st.rx + sz * st.rz;
                const clampedD = Clamp(act.d + dd, st.dMin, st.dMax);
                // 横向被沟壁/掩体顶住时，把未释放的排斥量顺延到弧长方向
                const blockedLat = Math.abs((act.d + dd) - clampedD);
                if (blockedLat > 0.01) ds += (ds >= 0 ? 1 : -1) * blockedLat * 0.85;
                act.s = Clamp(act.s + ds, 0, sq.corridor.length);
                const st2 = sq.corridor.SampleAt(act.s);
                act.d = Clamp(clampedD, st2.dMin, st2.dMax);
                const w = sq.corridor.ToWorld(act.s, act.d);
                act.x = w.x; act.z = w.z; act.y = w.y;
              };
              ApplySafeShift(A, sqA, -nx * push, -nz * push);
              ApplySafeShift(B, sqB, nx * push, nz * push);
            }
          }
        }
      }
    }

    // 统计本帧最小人际间距（运动中的成员）
    for (let i = 0; i < allActors.length; i += 1) {
      for (let j = i + 1; j < allActors.length; j += 1) {
        if (allActors[i].phase === "startDelay" || allActors[j].phase === "startDelay") continue;
        const d = Math.hypot(allActors[i].x - allActors[j].x, allActors[i].z - allActors[j].z);
        if (d < minPairDistGlobal) minPairDistGlobal = d;
      }
    }

    // 4) 写入本帧烘焙快照（含原版折线对照组位置）
    const frameActors = allActors.map((a) => {
      const sq = squadRuntimes.find((s) => s.id === a.squadId);
      const baseDist = Math.min(a.baselineStopS, Math.max(0, time - a.baselineStart) * a.baselineSpeed);
      const basePos = SamplePolyline(sq.route, baseDist);
      const g = a.lastGaze || { gazeYaw: 0, gazePitch: 0, headYaw: 0, neckYaw: 0, chestYaw: 0, gazeKind: "route", gazeLabel: "直视前方", gazeTarget: null };
      return {
        id: a.id,
        localId: a.localId,
        name: a.name,
        squadId: a.squadId,
        squadLabel: a.squadLabel,
        side: a.side,
        role: a.role,
        clusterId: a.slot.clusterId,
        x: a.x,
        z: a.z,
        y: a.y,
        s: a.s,
        d: a.d,
        speed: a.speed,
        yaw: a.yaw,
        phase: a.phase,
        gazeYaw: g.gazeYaw,
        gazePitch: g.gazePitch,
        headYaw: g.headYaw,
        neckYaw: g.neckYaw,
        chestYaw: g.chestYaw,
        gazeKind: g.gazeKind,
        gazeLabel: g.gazeLabel,
        gazeTarget: g.gazeTarget,
        baseX: basePos.x,
        baseZ: basePos.z,
        baseYaw: basePos.yaw,
      };
    });
    frames.push({ time, actors: frameActors });
  }

  // 5) 计算可量化自然度指标（去线性度、去同步度、间距、张望活跃度）
  const telemetry = ComputeTelemetry(squadRuntimes, frames, minPairDistGlobal, crossSquadAvoidEvents);

  /** O(log N) 任意时刻随机 Seek 插值采样（100% 确定性，正播/倒拖完全等价）。 */
  function Sample(timeS) {
    const t = Clamp(Number(timeS) || 0, 0, durationS);
    const f = t / dt;
    const i0 = Math.min(frames.length - 1, Math.floor(f));
    const i1 = Math.min(frames.length - 1, i0 + 1);
    const u = i1 > i0 ? Clamp(f - i0, 0, 1) : 0;
    const A = frames[i0].actors;
    const B = frames[i1].actors;
    const actors = A.map((a, idx) => {
      const b = B[idx];
      return {
        ...a,
        x: Lerp(a.x, b.x, u),
        z: Lerp(a.z, b.z, u),
        y: Lerp(a.y, b.y, u),
        s: Lerp(a.s, b.s, u),
        d: Lerp(a.d, b.d, u),
        speed: Lerp(a.speed, b.speed, u),
        yaw: AngleLerp(a.yaw, b.yaw, u),
        gazeYaw: Lerp(a.gazeYaw, b.gazeYaw, u),
        gazePitch: Lerp(a.gazePitch, b.gazePitch, u),
        headYaw: Lerp(a.headYaw, b.headYaw, u),
        neckYaw: Lerp(a.neckYaw, b.neckYaw, u),
        chestYaw: Lerp(a.chestYaw, b.chestYaw, u),
        baseX: Lerp(a.baseX, b.baseX, u),
        baseZ: Lerp(a.baseZ, b.baseZ, u),
        baseYaw: AngleLerp(a.baseYaw, b.baseYaw, u),
      };
    });
    return { time: t, actors };
  }

  // 为 2D/3D 预览提取每人完整流线（低频降采样用于绘制丝滑轨迹线）
  const streamlines = allActors.map((a, idx) => ({
    id: a.id,
    squadId: a.squadId,
    side: a.side,
    role: a.role,
    points: frames.filter((_, fIdx) => fIdx % 3 === 0 || fIdx === frames.length - 1).map((fr) => [fr.actors[idx].x, fr.actors[idx].z]),
  }));

  return {
    durationS,
    stepS: dt,
    squads: squadRuntimes.map((sq) => ({
      id: sq.id,
      label: sq.label,
      side: sq.side,
      profileId: sq.profileId,
      seed: sq.seed,
      tuning: sq.tuning,
      corridor: sq.corridor,
      route: sq.route,
      memberCount: sq.actors.length,
    })),
    streamlines,
    frames,
    telemetry,
    Sample,
  };
}

function Pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 6) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i += 1) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx2 += a * a; dy2 += b * b;
  }
  return dx2 > 1e-7 && dy2 > 1e-7 ? num / Math.sqrt(dx2 * dy2) : 0;
}

function ComputeTelemetry(squadRuntimes, frames, minPairDistGlobal, crossSquadAvoidEvents) {
  const allActors = squadRuntimes.flatMap((sq) => sq.actors);
  // 1) 横向展开标准差（反映是否还排成一根线）
  const dVals = allActors.flatMap((a) => a.lateralSamples);
  const dMean = dVals.length ? dVals.reduce((s, v) => s + v, 0) / dVals.length : 0;
  const lateralStdM = dVals.length
    ? Math.sqrt(dVals.reduce((s, v) => s + (v - dMean) ** 2, 0) / dVals.length)
    : 0;

  // 2) 同队普通队员两两瞬时速度相关系数（越低越不像齐步走机器人）
  let corrSum = 0, corrCount = 0;
  for (const sq of squadRuntimes) {
    const followers = sq.actors.filter((a) => a.role !== "leader");
    for (let i = 0; i < followers.length; i += 1) {
      for (let j = i + 1; j < followers.length; j += 1) {
        corrSum += Pearson(followers[i].speedSamples, followers[j].speedSamples);
        corrCount += 1;
      }
    }
  }
  const avgSpeedCorr = corrCount ? corrSum / corrCount : 0;

  // 3) 张望活跃占比与总张望次数
  const totalGlances = allActors.reduce((s, a) => s + a.gaze.glances, 0);
  const totalMoveSteps = allActors.reduce((s, a) => s + a.totalMoveSteps, 0);
  const totalGazeSteps = allActors.reduce((s, a) => s + a.gazeActiveSteps, 0);
  const gazeActiveRatio = totalMoveSteps ? totalGazeSteps / totalMoveSteps : 0;
  const totalPauses = allActors.reduce((s, a) => s + a.pauseCount, 0);

  return {
    actorCount: allActors.length,
    squadCount: squadRuntimes.length,
    lateralStdM: Number(lateralStdM.toFixed(3)),
    avgSpeedCorr: Number(avgSpeedCorr.toFixed(3)),
    minPairDistM: Number((Number.isFinite(minPairDistGlobal) ? minPairDistGlobal : 0).toFixed(3)),
    gazeActiveRatio: Number(gazeActiveRatio.toFixed(3)),
    totalGlances,
    totalPauses,
    crossSquadAvoidEvents,
    frameCount: frames.length,
  };
}
