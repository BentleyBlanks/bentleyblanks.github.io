// 第一关小队行进 PCG 样条与行进视线统一适配层（纯数学，零 three，零 DOM）。
//
// 同时服务：
//   1. Encounter Designer 确定性时间轴采样（Script_LevelFlowModel / Script_LevelFlowEncounter / Script_LevelFlowMerged）
//   2. 第一关正式战役与试玩 3D 运行时（Script_EncounterPlay：每名士兵的自然弯曲路点、错峰步速、实时头颈左顾右盼）
//
// 核心保障：
//   · 严格按 squadKey / group.id 隔离，两条交叉路线上的小队绝不合并；
//   · 起点（含遮挡安全段 concealmentHeadM）与终点平滑羽化归零，确保敌军遮挡生成、白刃 1.2m 接敌、掩体停靠与节拍衔接 100% 精确；
//   · 任意前跳 / 倒拖时间轴 100% 确定性一致。

import { MakeRoadPath } from "./Script_RoadPath.mjs";
import { SQUAD_SPLINE_PROFILES } from "./Data_Tuning_SquadSpline.mjs";
import { FIRST_LEVEL_SQUAD_SPLINE_CONFIG } from "./Data_FirstLevelSquadSplines.mjs";
import { ResolveSquadSplineTuning } from "./Script_SquadSplinePcg.mjs";
import { HashString, MakeRng, ProceduralGazeAgent, SplitGazeChain } from "./Script_ProceduralGaze.mjs";

const DEG = Math.PI / 180;
const Clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const Smoothstep = (e0, e1, x) => {
  if (e1 <= e0) return x >= e1 ? 1 : 0;
  const t = Clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ Profile 解析

export function ResolveScriptedSquadConfig(squadKey) {
  const entry = FIRST_LEVEL_SQUAD_SPLINE_CONFIG.scriptedSquads[squadKey];
  if (!entry) return null;
  return {
    ...entry,
    tuning: ResolveSquadSplineTuning(entry.profile),
  };
}

export function ResolveEncounterGroupSplineConfig(group) {
  if (!group) return null;
  if (group.splineProfile && SQUAD_SPLINE_PROFILES[group.splineProfile]) {
    const base = FIRST_LEVEL_SQUAD_SPLINE_CONFIG.encounterGroups[group.id]
      || FIRST_LEVEL_SQUAD_SPLINE_CONFIG.behaviorFallback[group.behavior]
      || FIRST_LEVEL_SQUAD_SPLINE_CONFIG.behaviorFallback.advance_enemy;
    return {
      ...base,
      profile: group.splineProfile,
      tuning: ResolveSquadSplineTuning(group.splineProfile),
    };
  }
  const explicit = FIRST_LEVEL_SQUAD_SPLINE_CONFIG.encounterGroups[group.id];
  if (explicit) {
    return { ...explicit, tuning: ResolveSquadSplineTuning(explicit.profile) };
  }
  if (["guard", "suppress"].includes(group.behavior)) return null;
  const key = group.behavior === "advance"
    ? (group.side === "friend" ? "advance_friend" : "advance_enemy")
    : group.behavior;
  const fallback = FIRST_LEVEL_SQUAD_SPLINE_CONFIG.behaviorFallback[key];
  if (!fallback) return null;
  return { ...fallback, tuning: ResolveSquadSplineTuning(fallback.profile) };
}

// ------------------------------------------------------------------ 轻量确定性路径缓存（折线 + Catmull-Rom 融合）

const pathCache = new Map();

function RouteSignature(route, splineBlend) {
  let h = 2166136261 ^ Math.round(splineBlend * 1000);
  for (let i = 0; i < route.length; i += 1) {
    h = Math.imul(h ^ Math.round(route[i][0] * 100), 16777619) >>> 0;
    h = Math.imul(h ^ Math.round(route[i][1] * 100), 16777619) >>> 0;
  }
  return `${route.length}:${h}:${Math.round(splineBlend * 100)}`;
}

function SamplePolylineAtS(route, cumS, s) {
  const total = cumS[cumS.length - 1] || 0;
  if (total <= 1e-6 || route.length < 2) {
    return { x: route[0][0], z: route[0][1], tx: 0, tz: -1, rx: 1, rz: 0, curvature: 0 };
  }
  const cs = Clamp(s, 0, total);
  let lo = 0, hi = cumS.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumS[mid] <= cs) lo = mid; else hi = mid;
  }
  const span = Math.max(1e-6, cumS[hi] - cumS[lo]);
  const f = Clamp((cs - cumS[lo]) / span, 0, 1);
  const a = route[lo], b = route[hi];
  const x = a[0] + (b[0] - a[0]) * f;
  const z = a[1] + (b[1] - a[1]) * f;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const tx = dx / len, tz = dz / len;
  return { x, z, tx, tz, rx: -tz, rz: tx, curvature: 0 };
}

function BuildCachedPath(route, splineBlend = 0.7) {
  if (!Array.isArray(route) || route.length < 2) return null;
  const sig = RouteSignature(route, splineBlend);
  const cached = pathCache.get(sig);
  if (cached) return cached;

  const cumS = [0];
  for (let i = 1; i < route.length; i += 1) {
    cumS.push(cumS[i - 1] + Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]));
  }
  const total = cumS[cumS.length - 1];
  if (total <= 1e-4) return null;

  let smooth = null;
  if (route.length >= 3) {
    try {
      const road = MakeRoadPath(route, { subdivisions: 10, alpha: 0.5 });
      const stations = [];
      const count = Math.max(8, Math.min(240, Math.ceil(road.length / 0.85)));
      for (let i = 0; i <= count; i += 1) {
        const u = i / count;
        const p = road.At(u * road.length);
        stations.push({ s: u * total, x: p.x, z: p.z, tx: p.tx, tz: p.tz, rx: -p.tz, rz: p.tx, curvature: 0 });
      }
      for (let i = 1; i < stations.length - 1; i += 1) {
        const a = stations[i - 1], b = stations[i + 1];
        const ds = Math.max(0.1, b.s - a.s);
        const cross = a.tx * b.tz - a.tz * b.tx;
        const dot = Clamp(a.tx * b.tx + a.tz * b.tz, -1, 1);
        stations[i].curvature = Clamp(Math.atan2(cross, dot) / ds, -0.45, 0.45);
      }
      smooth = stations;
    } catch {
      smooth = null;
    }
  }

  const entry = { route, cumS, total, smooth, splineBlend };
  if (pathCache.size > 400) pathCache.clear();
  pathCache.set(sig, entry);
  return entry;
}

function SampleCachedPath(cached, s) {
  const poly = SamplePolylineAtS(cached.route, cached.cumS, s);
  if (!cached.smooth) return poly;
  const st = cached.smooth;
  const cs = Clamp(s, 0, cached.total);
  const idxF = (cs / Math.max(1e-6, cached.total)) * (st.length - 1);
  const i0 = Clamp(Math.floor(idxF), 0, st.length - 1);
  const i1 = Math.min(st.length - 1, i0 + 1);
  const f = idxF - i0;
  const a = st[i0], b = st[i1];
  const sx = a.x + (b.x - a.x) * f;
  const sz = a.z + (b.z - a.z) * f;
  const tx = a.tx + (b.tx - a.tx) * f;
  const tz = a.tz + (b.tz - a.tz) * f;
  const tlen = Math.hypot(tx, tz) || 1;
  const stx = tx / tlen, stz = tz / tlen;
  const curv = a.curvature + (b.curvature - a.curvature) * f;
  const w = cached.splineBlend;
  const bx = poly.x + (sx - poly.x) * w;
  const bz = poly.z + (sz - poly.z) * w;
  // 切线与横向法线恒取 C1 连续的平滑样条标架，防止在尖折点处横向偏移跳变
  return { x: bx, z: bz, tx: stx, tz: stz, rx: -stz, rz: stx, curvature: curv * w };
}

// ------------------------------------------------------------------ 个体微参数与阵型横向槽位

function MemberSignature(squadKey, memberIndex, memberCount, role, config) {
  const tuning = config.tuning;
  const rng = MakeRng(`${squadKey}:${config.profile}:${memberIndex}`);
  const sideSign = memberIndex === 0 ? 0 : (memberIndex % 2 === 1 ? -1 : 1);
  const jitter = (rng() - 0.5) * 0.24;

  // 社交微簇索引：同簇内紧凑、簇间拉开轻微呼吸间距
  let clusterId = 0, inClusterIdx = 0;
  if (Array.isArray(config.clusterSizes) && config.clusterSizes.length) {
    let acc = 0;
    for (let c = 0; c < config.clusterSizes.length; c += 1) {
      if (memberIndex < acc + config.clusterSizes[c]) {
        clusterId = c;
        inClusterIdx = memberIndex - acc;
        break;
      }
      acc += config.clusterSizes[c];
      clusterId = c + 1;
    }
  } else {
    clusterId = Math.floor(memberIndex / 2);
    inClusterIdx = memberIndex % 2;
  }

  let laneFrac = 0;
  const style = tuning.formationStyle || "zipper";
  if (role === "leader" || memberIndex === 0) {
    laneFrac = jitter * 0.28;
  } else if (role === "mgGunner" || role === "mgAssistant") {
    laneFrac = (role === "mgGunner" ? -0.38 : 0.28) + jitter * 0.15;
  } else if (style === "wedge") {
    const rank = Math.ceil(memberIndex / 2);
    const maxRank = Math.max(1, Math.ceil((memberCount - 1) / 2));
    laneFrac = sideSign * (0.34 + 0.62 * (rank / maxRank)) + jitter * 0.22;
  } else if (style === "echelon") {
    const rank = memberIndex / Math.max(1, memberCount - 1);
    laneFrac = (0.18 + 0.72 * rank) * (memberIndex % 3 === 0 ? -0.55 : 1) + jitter * 0.20;
  } else if (style === "column") {
    laneFrac = sideSign * 0.26 + jitter * 0.35;
  } else if (style === "convoy") {
    laneFrac = sideSign * (0.42 + (memberIndex % 3) * 0.14) + jitter * 0.24;
  } else if (style === "looseCluster") {
    const clusterSign = clusterId % 2 === 0 ? -1 : 1;
    laneFrac = (inClusterIdx === 0 ? clusterSign * 0.44 : -clusterSign * 0.56) + jitter * 0.34;
  } else {
    // zipper（默认拉链交错）
    laneFrac = sideSign * (0.58 + (inClusterIdx % 2) * 0.16) + jitter * 0.28;
  }

  return {
    laneFrac: Clamp(laneFrac, -0.96, 0.96),
    clusterId,
    inClusterIdx,
    wanderFreq1: 0.16 + rng() * 0.11,
    wanderFreq2: 0.39 + rng() * 0.17,
    wanderPhase1: rng() * Math.PI * 2,
    wanderPhase2: rng() * Math.PI * 2,
    pacePhase: rng() * Math.PI * 2,
    paceFreq: 0.28 + rng() * 0.22,
    speedBias: (rng() - 0.5) * 2 * (tuning.speedVariation || 0.08),
    gazeSeed: HashString(`${squadKey}:gaze:${memberIndex}`),
  };
}

// ------------------------------------------------------------------ L5 确定性时间轴程序化视线（无状态可倒拖）

export function SampleDeterministicGaze({
  seed,
  time,
  tuning,
  role = "rifleman",
  curvature = 0,
  moving = true,
  firing = false,
  pose = "walk",
}) {
  if (firing || ["dead", "hit", "melee", "down"].includes(pose)) {
    return { gazeYaw: 0, gazePitch: 0, headYaw: 0, neckYaw: 0, chestYaw: 0, gazeKind: "route" };
  }
  const alertness = tuning?.alertness ?? 0.65;
  const maxYaw = (tuning?.maxGazeYawDeg ?? 52) * DEG;
  const cycleMin = Math.max(1.6, (tuning?.scanIntervalMinS ?? 2.2) + 0.9);
  const cycleSpan = Math.max(1.2, (tuning?.scanIntervalMaxS ?? 4.8) - (tuning?.scanIntervalMinS ?? 2.2));
  const rimPitch = (tuning?.rimPitchDeg ?? 10) * DEG;

  // 逐槽泊松式伪随机周期（无状态、支持任意倒拖）
  const slotLen = cycleMin + ((seed % 997) / 997) * cycleSpan * 0.65;
  const phaseOffset = ((seed * 2654435761 >>> 0) / 4294967296) * slotLen;
  const shifted = Math.max(0, time + phaseOffset);
  const slotIdx = Math.floor(shifted / slotLen);
  const localT = shifted - slotIdx * slotLen;

  const slotHash = HashString(`${seed}:${slotIdx}`);
  const r0 = (slotHash & 0xffff) / 0xffff;
  const r1 = ((slotHash >>> 16) & 0xffff) / 0xffff;
  const activeChance = Clamp(alertness * (moving ? 0.92 : 0.78), 0.22, 0.94);

  let targetYaw = 0;
  let targetPitch = 0;
  let gazeKind = "route";

  // 1) 弯道盲区拐角优先预览（P1）
  if (moving && Math.abs(curvature) > 0.045 && (tuning?.poiWeight ?? 0.8) > 0.25) {
    targetYaw = Clamp(-Math.sign(curvature) * Math.min(maxYaw * 0.72, Math.abs(curvature) * 5.2), -maxYaw, maxYaw);
    targetPitch = rimPitch * 0.35;
    gazeKind = "poi";
  } else if (r0 < activeChance) {
    // 2) 非对称扫视-凝视-回正包络：快转出(0.28s) → 凝视停留 → 慢回正(0.45s)
    const saccadeS = 0.26;
    const fixS = Clamp((tuning?.fixationMinS ?? 0.45) + r1 * ((tuning?.fixationMaxS ?? 1.25) - (tuning?.fixationMinS ?? 0.45)), 0.35, 1.5);
    const returnS = 0.48;
    const activeDur = saccadeS + fixS + returnS;
    if (localT < activeDur) {
      let env = 0;
      if (localT < saccadeS) {
        const u = localT / saccadeS;
        env = 1 - (1 - u) * (1 - u);
      } else if (localT < saccadeS + fixS) {
        env = 1;
      } else {
        const u = (localT - saccadeS - fixS) / returnS;
        env = 1 - u * u * (3 - 2 * u);
      }
      const sign = (slotHash & 1) ? 1 : -1;
      const leaderCheck = role === "leader" && moving && r1 > 0.62;
      const rimGlance = rimPitch > 0.06 && r1 < 0.34;
      const socialGlance = !leaderCheck && !rimGlance && r1 > 0.58 && (tuning?.socialWeight ?? 0.5) > 0.35;
      if (leaderCheck) {
        targetYaw = sign * Math.min(maxYaw, 1.02) * env;
        gazeKind = "leaderCheck";
      } else if (rimGlance) {
        targetYaw = sign * maxYaw * (0.45 + 0.38 * r0) * env;
        targetPitch = rimPitch * (0.65 + 0.35 * r1) * env;
        gazeKind = "poi";
      } else if (socialGlance) {
        targetYaw = sign * maxYaw * (0.38 + 0.28 * r0) * env;
        gazeKind = "social";
      } else {
        targetYaw = sign * maxYaw * (0.42 + 0.48 * r1) * env;
        targetPitch = (r0 < 0.16 ? -0.10 : 0.04) * env;
        gazeKind = "scan";
      }
    }
  }

  const share = SplitGazeChain(targetYaw);
  return {
    gazeYaw: targetYaw,
    gazePitch: targetPitch,
    headYaw: targetYaw * share.head,
    neckYaw: targetYaw * share.neck,
    chestYaw: targetYaw * share.chest,
    gazeKind,
  };
}

// ------------------------------------------------------------------ 统一 PCG 样条采样（供 LevelFlowModel & LevelFlowEncounter 共用）

/**
 * 将原本在折线上机械排队的单兵采样升级为自然走廊样条 + 社交微簇 + 错峰步速 + 程序化视线。
 * 返回 { p: [x, z], heading, gazeYaw, gazePitch, gazeKind, splineProfile }。
 *   heading 遵循 Encounter Designer 口径：0 = 正北 (-Z)，+PI/2 = 正东 (+X)，即 Math.atan2(dx, -dz)。
 */
export function SampleSquadSplinePoint({
  squadKey,
  config,
  memberIndex = 0,
  memberCount = 1,
  role = "rifleman",
  route,
  distance,
  totalLength,
  time = 0,
  moving = true,
  firing = false,
  pose = "walk",
  noAdvanceBeyondDistance = false,
}) {
  if (!config || !Array.isArray(route) || route.length < 2) return null;
  const cached = BuildCachedPath(route, config.splineBlend ?? 0.65);
  if (!cached || cached.total < 1.5) return null;

  const total = Number.isFinite(totalLength) && totalLength > 0 ? totalLength : cached.total;
  const sBase = Clamp(distance, 0, total);
  const sig = MemberSignature(squadKey, memberIndex, Math.max(1, memberCount), role, config);
  const tuning = config.tuning;

  // 起止平滑羽化包络：保证起点遮挡区（concealmentHeadM）与终点掩体/白刃位精确归零
  const headM = Math.max(config.featherStartM ?? 2.0, config.concealmentHeadM ?? 0);
  const tailM = config.featherEndM ?? 2.4;
  const envStart = Smoothstep(0.15, Math.min(headM, total * 0.35), sBase);
  const envEnd = 1 - Smoothstep(Math.max(0, total - Math.min(tailM, total * 0.35)), Math.max(0.01, total - 0.08), sBase);
  const env = envStart * envEnd;

  // L3：有机步速呼吸与社交微簇错峰（沿弧长单调推进，驻停时零滑步、两端归零，不破坏任何到达节拍或 standoff 距离）
  const paceJitterM = config.paceJitterM ?? 0.42;
  const clusterBreath = memberCount >= 3 ? (sig.inClusterIdx === 0 ? 0.14 : -0.18) * paceJitterM : 0;
  let ds = Clamp((
    Math.sin(sBase * 0.22 + sig.pacePhase) * paceJitterM * 0.72
    + sig.speedBias * Math.min(sBase, total - sBase) * 0.12
    + clusterBreath
  ) * env, -paceJitterM, paceJitterM);
  if (noAdvanceBeyondDistance && ds > 0) ds = 0;
  const sEff = Clamp(sBase + ds, 0, total);

  // L1：采样平滑走廊中心线（按弧长比例映射到缓存路径）
  const pathS = total > 1e-6 ? (sEff / total) * cached.total : 0;
  const st = SampleCachedPath(cached, pathS);

  // L2：阵型横向槽位 + 过弯自然收束（防止外圈角速度超速）+ 人类切内弯 + 2-octave 有机低频横向漫游
  const maxOff = config.maxOffsetM ?? 0.65;
  const bendTighten = 1 / (1 + Math.abs(st.curvature) * 2.8);
  const laneD = sig.laneFrac * maxOff * 0.80 * bendTighten;
  const cornerCut = -st.curvature * (tuning.cornerCutStrength ?? 0.4) * Math.min(maxOff, 1.0) * 1.15;
  const wanderAmp = Math.min(tuning.wanderAmpM ?? 0.25, maxOff * 0.30) * bendTighten;
  const wander = (
    Math.sin(sEff * sig.wanderFreq1 + sig.wanderPhase1) * 0.65
    + Math.sin(sEff * sig.wanderFreq2 + sig.wanderPhase2) * 0.35
  ) * wanderAmp;
  const d = Clamp(laneD + cornerCut + wander, -maxOff, maxOff) * env;

  const px = st.x + st.rx * d;
  const pz = st.z + st.rz * d;
  // LevelFlow 2D/3D 朝向约定：0 = 正北 (-Z)，+PI/2 = 正东 (+X)
  const heading = Math.atan2(st.tx, -st.tz);

  const gaze = SampleDeterministicGaze({
    seed: sig.gazeSeed,
    time,
    tuning,
    role,
    curvature: st.curvature,
    moving,
    firing,
    pose,
  });

  return {
    p: [px, pz],
    heading,
    gazeYaw: gaze.gazeYaw,
    gazePitch: gaze.gazePitch,
    gazeKind: gaze.gazeKind,
    splineProfile: config.profile,
  };
}

// ------------------------------------------------------------------ 3D 实时游戏路线与活体视线（Script_EncounterPlay）

/**
 * 为第一关实时 3D 士兵（EncounterPlay）生成个体化的自然弯曲路点：
 *   · 精确保留起点 route[0]（保持敌军遮挡生成不暴露）与终点 route.at(-1)（保持掩体战位）；
 *   · 中段沿平滑走廊样条重采样并施加横向拉链/散兵/切内弯/漫游偏移，彻底打破所有士兵走同一根直线的机械感。
 */
export function BuildLiveSquadWaypoints({
  squadKey,
  config,
  memberIndex = 0,
  memberCount = 1,
  role = "rifleman",
  route,
}) {
  if (!config || !Array.isArray(route) || route.length < 2) return route;
  const cached = BuildCachedPath(route, config.splineBlend ?? 0.65);
  if (!cached || cached.total < 5.0) return route;

  const maxOff = config.maxOffsetM ?? 0.60;
  // 极窄巷道（如潜行搜屋 maxOffsetM <= 0.20）直接保留原路线，防止 AI 避障绕门框
  if (maxOff <= 0.22) return route;

  const stepM = Clamp(cached.total / Math.max(4, Math.min(18, Math.round(cached.total / 5.5))), 3.5, 9.0);
  const out = [[route[0][0], route[0][1]]];
  for (let s = stepM; s < cached.total - stepM * 0.55; s += stepM) {
    const sample = SampleSquadSplinePoint({
      squadKey,
      config,
      memberIndex,
      memberCount,
      role,
      route,
      distance: s,
      totalLength: cached.total,
      time: 0,
      moving: true,
      firing: false,
      pose: "run",
    });
    if (sample) out.push([Number(sample.p[0].toFixed(2)), Number(sample.p[1].toFixed(2))]);
  }
  const end = route[route.length - 1];
  out.push([end[0], end[1]]);
  return out;
}

/**
 * 为第一关实时 3D 士兵创建行进间步速呼吸 + 活体程序化视线控制器（复用 Script_ProceduralGaze）。
 */
export function CreateLiveSquadController({ squadKey, config, memberIndex = 0, memberCount = 1, role = "rifleman" }) {
  const profile = config?.profile || FIRST_LEVEL_SQUAD_SPLINE_CONFIG.stationaryGazeProfile;
  const tuning = config?.tuning || ResolveSquadSplineTuning(profile);
  const sig = MemberSignature(squadKey, memberIndex, Math.max(1, memberCount), role, {
    profile,
    tuning,
    maxOffsetM: config?.maxOffsetM ?? 0.5,
  });
  const gaze = new ProceduralGazeAgent({
    id: `${squadKey}_${memberIndex}`,
    seed: `${squadKey}:${memberIndex}`,
    role,
    tuning,
  });
  let lastSpeedFactor = 1;
  return {
    profile,
    tuning,
    sig,
    gaze,
    /** 非接战行进时的自然个体步速倍率（含个体步频差异 + 慢频呼吸起伏 + 大幅回头微减速）。 */
    SpeedScale(elapsed, moving) {
      if (!moving) return 1;
      const wobble = Math.sin(elapsed * sig.paceFreq + sig.pacePhase) * (tuning.paceWobble || 0.06);
      return Clamp((1 + sig.speedBias + wobble) * lastSpeedFactor, 0.72, 1.24);
    },
    /** 每帧/每指令更新头颈左顾右盼，输出相对身体朝向的 gazeYaw / gazePitch（弧度）。 */
    StepGaze(dt, { x, y, z, yaw, speed, combat, aiming, terrainKind = "open", pois = [], peers = [], rearPoint = null, stimuli = [] }) {
      if (combat && aiming) {
        lastSpeedFactor = 1;
        return { gazeYaw: 0, gazePitch: 0, kind: "route" };
      }
      const res = gaze.Step(Math.max(0.01, dt), {
        x,
        y,
        z,
        yaw,
        speedMps: speed,
        pose: speed > 0.15 ? "move" : "pause",
        terrainKind,
        squadId: squadKey,
        pois,
        peers,
        rearPoint,
        stimuli,
      });
      lastSpeedFactor = res.speedFactor ?? 1;
      const scale = combat ? 0.55 : 1.0;
      return {
        gazeYaw: Clamp(res.gazeYaw * scale, -0.92, 0.92),
        gazePitch: Clamp(res.gazePitch * scale, -0.22, 0.30),
        kind: res.gazeKind,
      };
    },
  };
}
