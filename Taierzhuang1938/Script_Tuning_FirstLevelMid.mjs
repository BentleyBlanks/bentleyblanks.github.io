// Data_Tuning_FirstLevelMid.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { MID_TUNING } from "./Data_Tuning_FirstLevelMid.mjs";

/** 08 担架停车位：空间包的三个点打底，多出来的按行往北排。 */
export function MidLitterHoldSlots(litterWait, count) {
  const base = litterWait.map((point) => ({ ...point }));
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / base.length), anchor = base[i % base.length];
    return {
      x: anchor.x + (row % 2 ? MID_TUNING.litterHoldLateralM * 0.5 : 0),
      z: anchor.z - row * MID_TUNING.litterHoldRowM,
      yaw: anchor.yaw ?? 0,
    };
  });
}

/** 08 步行的人（民夫/替补）停在同一道遮挡后面，横着排开，不挡担架。 */
export function MidWalkerHoldSlots(litterWait, count) {
  const west = litterWait.reduce((best, point) => (point.x < best.x ? point : best), litterWait[0]);
  return Array.from({ length: count }, (_, i) => ({
    x: west.x - MID_TUNING.litterHoldLateralM - (i % 2) * 1.4,
    z: west.z - Math.floor(i / 2) * MID_TUNING.litterHoldRowM,
    yaw: 0,
  }));
}

/** 11 接运点现场的步行伤员：三对互相搀扶。 */
export function MidWalkingWounded() {
  const origin = MID_TUNING.walkingWoundedOrigin;
  return Array.from({ length: MID_TUNING.walkingWoundedCount }, (_, i) => {
    const pair = Math.floor(i / 2), side = i % 2 ? 1 : -1;
    return {
      id: `TransferWalker${i}`,
      x: origin.x + pair * MID_TUNING.walkingWoundedSpacingM + side * MID_TUNING.walkingWoundedPairM,
      z: origin.z + (pair % 2) * 1.4,
      yaw: Math.PI,
      pair,
      // 搀扶的那个走外侧（side=+1），被搀的在内侧。
      supporting: side > 0,
      sorted: false,
      visible: false,
    };
  });
}

/** 车位 / 过路车的牲口种类。下标不在表里的一律是马。 */
export function MidDraftKind(kind, index) {
  const list = kind === "bay" ? MID_TUNING.oxBayIndices : MID_TUNING.oxTrafficIndices;
  return list.includes(index) ? "ox" : "horse";
}

/**
 * 13 散开：给每个人挑同侧最近的路边遮挡点，返回 { cover, route }（route 最后一点是停的地方）。
 * 不在路上（离 x76 ≥ scatterFromRoadM）的给 null；force 时一律分配（11 的步行伤员）。
 * 已经站在墙外侧的人跳过车路一侧的那几个折点，直接走到遮挡点。
 */
export function MidTransferScatterPlan(points, { force = false } = {}) {
  const E = MID_TUNING.transferEvac, W = E.walls, load = new Map();
  return points.map((point) => {
    if (!force && Math.abs(point.x - E.roadX) >= MID_TUNING.scatterFromRoadM) return null;
    const side = point.x <= E.roadX ? -1 : 1;
    let best = null, bestCost = Infinity;
    for (const cover of E.covers) {
      if (cover.side !== side) continue;
      const hold = cover.path.at(-1);
      const used = load.get(cover.id) || 0;
      const cost = Math.abs(hold.z - point.z) + 0.3 * Math.abs(hold.x - point.x) + 4 * used
        + (used >= E.slotsPerCover ? 1e4 * used : 0);
      if (cost < bestCost) { bestCost = cost; best = cover; }
    }
    const k = load.get(best.id) || 0;
    load.set(best.id, k + 1);
    const slot = k % E.slotsPerCover, offset = (slot % 2 ? -1 : 1) * Math.ceil(slot / 2) * E.slotSpreadM;
    const outside = side < 0 ? point.x < W.westX : point.x > W.eastX;
    const route = best.path
      .filter((p, i) => i === best.path.length - 1 || !outside || (side < 0 ? p.x < W.westX : p.x > W.eastX))
      .map((p) => ({ x: p.x, z: p.z }));
    route[route.length - 1].z += offset;
    return { cover: best.id, route };
  });
}

/**
 * 15A 撤退：从 point 接到三条通道之一，返回从 point 之后到下沟口（含）的折线。
 * 调用方在前面补 point 本身、在后面接 evacuation 的剩余段。
 */
export function MidTransferRetreatJoin(point) {
  const E = MID_TUNING.transferEvac, W = E.walls, T = E.triageGap;
  const Lane = (z) => E.lanes.find((lane) => z < lane.untilZ);
  const out = [];
  // 西墙 z 109.6–122 那段敞口里、分拣台一带（x ≥ 68）的人按车路一侧算：从车路进通道口，
  // 斜着穿分拣台会撞上担架凳和物资堆。
  const inTriageGap = point.x >= T.minX && point.z > T.minZ && point.z < T.maxZ;
  if (point.x < W.westX && !inTriageGap) {
    // 已经在西墙外：直接接通道缺口以西那一段。棚下（x < westDirectMaxX）的直接去下沟口；
    // 西墙南段背后的先贴墙走到墙头，再横过去。
    const lane = Lane(point.z);
    if (lane.westDirect && point.x < lane.westDirect.maxX) out.push(lane.westDirect.via);
    else {
      if (lane.westEntry && point.x >= lane.westEntry.minX) out.push(lane.westEntry.via);
      out.push(...lane.points);
    }
  } else {
    let z = point.z;
    const behindEastTall = point.x > W.eastTallX + W.eastThickTallM / 2
      && W.eastTall.some(([z0, z1]) => point.z > z0 - 1 && point.z < z1 + 1);
    if ((point.x > W.eastX && point.z < E.eastNorthZ) || behindEastTall) {
      // 东墙外：先离墙站开，再从最近的东缺口 / 门洞钻进车路（东高墙后面的从院门式开口出来）。
      const wallX = behindEastTall ? W.eastTallX : W.eastX;
      const gap = E.eastGapZ.reduce((a, b) => (Math.abs(b - point.z) < Math.abs(a - point.z) ? b : a));
      if (point.x < wallX + 2.5) out.push({ x: wallX + 2.5, z: point.z });
      out.push({ x: wallX + 1.8, z: gap }, { x: wallX - 1.8, z: gap });
      z = gap;
    } else if (point.x < E.corridorX && point.z < E.eastNorthZ) {
      // 北段车路里贴着西墙的人先横到路中间，再顺路往南，不贴墙蹭过去。
      out.push({ x: E.corridorX, z: point.z });
    }
    // 车路一侧的人不走 westOnly 的通道（它的口子在西高墙里）。
    const lane = E.lanes.find((entry) => !entry.westOnly && z < (entry.roadUntilZ ?? entry.untilZ));
    out.push(lane.gate, ...lane.points);
  }
  out.push(E.ditchMouth);
  return out.map((p) => ({ x: p.x, z: p.z }));
}

/**
 * 12 班里人上射位 / 何有田接替射位：从 from 走到 to 的折线（不含 from）。直线要是从车路两侧
 * 残墙的墙段中间穿过去，就改走最近的缺口（缺口两侧各一个折点，离墙 1.5 m），其余照直走。
 * 这些人由 squadRoutes 驱动，没有寻路，只会贴墙滑 —— 墙段中间正对着过去就会顶在墙上。
 */
export function MidTransferWalkRoute(from, to, { minGapM = 0 } = {}) {
  const W = MID_TUNING.transferEvac.walls, out = [];
  // minGapM：墙段之间比它窄的缺口不当路走。14 救人的人是 AI 身体 + MoveActor 直线，2.2 m 宽的缺口（z 101.4–103.6）
  // 实测过不去（人卡在缺口里不动），只认门洞。默认 0 = 所有缺口都算（12 班里人上射位）。
  const Gaps = (segs) => {
    const sorted = [...segs].sort((a, b) => a[0] - b[0]);
    const between = sorted.slice(1).filter((seg, i) => seg[0] - sorted[i][1] >= minGapM).map((seg) => {
      const previous = sorted[sorted.indexOf(seg) - 1];
      return (previous[1] + seg[0]) / 2;
    });
    return [sorted[0][0] - 1.5, ...between, sorted.at(-1)[1] + 1.5];
  };
  let a = { x: from.x, z: from.z };
  // 东西向的横墙：村口低墙（12 的守线，z≈84）与场院东头的沙袋墙角 TransferCorner（z 96）。
  // 直线从墙这边到墙那边、穿墙点又落在墙身（连 0.9 m 余量）上，就绕到 gapX（路口 / 墙头外）
  // 过去，墙两侧各 1.5 m 一个折点。
  const ZWalls = [MID_TUNING.villageWall, MID_TUNING.yardCorner];
  for (let guard = 0; guard < 4; guard++) {
    let hit = null;
    for (const V of ZWalls) {
      if ((a.z - V.z) * (to.z - V.z) >= 0) continue;
      const t = (V.z - a.z) / (to.z - a.z), x = a.x + (to.x - a.x) * t;
      if (!V.runs.some(([x0, x1]) => x > x0 - .9 && x < x1 + .9)) continue;
      if (!hit || t < hit.t) hit = { t, wall: V };
    }
    for (const [x, segs] of [[W.westX, W.west], [W.eastX, W.east], [W.eastTallX, W.eastTall]]) {
      if ((a.x - x) * (to.x - x) >= 0) continue;
      const t = (x - a.x) / (to.x - a.x), z = a.z + (to.z - a.z) * t;
      // 斜着擦过墙头也算：看这一段离每个墙段（连 0.9 m 余量）是否有交，不只看穿墙点。
      const length = Math.hypot(to.x - a.x, to.z - a.z), n = Math.ceil(length / .2);
      const near = segs.some(([z0, z1]) => {
        for (let i = 0; i <= n; i++) {
          const px = a.x + (to.x - a.x) * i / n, pz = a.z + (to.z - a.z) * i / n;
          if (Math.abs(px - x) < W.thickM / 2 + .9 && pz > z0 - .9 && pz < z1 + .9) return true;
        }
        return false;
      });
      if (!near) continue;
      if (!hit || t < hit.t) hit = { t, x, z, segs };
    }
    if (!hit) break;
    if (hit.wall) {
      const side = Math.sign(to.z - a.z);
      out.push({ x: hit.wall.gapX, z: hit.wall.z - side * 1.5 }, { x: hit.wall.gapX, z: hit.wall.z + side * 1.5 });
      a = out.at(-1);
      continue;
    }
    const gap = Gaps(hit.segs).reduce((best, g) => (Math.abs(g - hit.z) < Math.abs(best - hit.z) ? g : best));
    const side = Math.sign(to.x - a.x);
    out.push({ x: hit.x - side * 1.5, z: gap }, { x: hit.x + side * 1.5, z: gap });
    a = out.at(-1);
  }
  out.push({ x: to.x, z: to.z });
  return out;
}
