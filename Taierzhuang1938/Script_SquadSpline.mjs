// 通用小队行进 PCG 走廊样条（L1 几何与环境感知层）：纯数学、零 Three.js、零 DOM。
// 复用 Script_RoadPath.MakeRoadPath（向心 Catmull-Rom + 等弧长重采样），并直接读取 Scene_*.json 的
// trenches / ways.roadRibbons / ways.roads / surface.ramps / objects（建筑与掩体）/ airWalls，
// 自动计算每个弧长站点的非对称有效左右通行边界 [dMin(s), dMax(s)]、有符号曲率与自动战术 POI。

import { MakeRoadPath } from "./Script_RoadPath.mjs";
import { SQUAD_SPLINE_DEFAULTS as D } from "./Data_Tuning_SquadSpline.mjs";

const Clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const Smoothstep = (edge0, edge1, x) => {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function PointXZ(p) {
  if (Array.isArray(p)) return [Number(p[0]) || 0, Number(p[1]) || 0];
  if (p && typeof p === "object") return [Number(p.x ?? p.p?.[0]) || 0, Number(p.z ?? p.p?.[1]) || 0];
  return [0, 0];
}

function SegDistSq(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-9 ? Clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0;
  const qx = ax + dx * t, qz = az + dz * t;
  const rx = px - qx, rz = pz - qz;
  return rx * rx + rz * rz;
}

function PolylineDistance(px, pz, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1], b = pts[i];
    const d2 = SegDistSq(px, pz, a[0], a[1], b[0], b[1]);
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/** 从 Scene_<Id>.json 提取轻量空间环境索引（走廊、阻挡盒、掩体、空气墙、高度采样器）。 */
export function BuildSceneCorridorEnv(sceneDoc, { heightAt = null } = {}) {
  const trenches = [];
  const roads = [];
  const obstacles = [];
  const covers = [];
  const airWalls = [];
  const landmarks = [];

  if (sceneDoc && typeof sceneDoc === "object") {
    for (const seg of sceneDoc.trenches?.segments || []) {
      const pts = (seg.points || []).map(PointXZ);
      if (pts.length >= 2) {
        trenches.push({
          id: seg.id || "trench",
          points: pts,
          width: Math.max(1.4, Number(seg.floorW) || 3.4),
          depth: Number(seg.depth) || 1.6,
        });
      }
    }
    for (const line of sceneDoc.ways?.trenches || []) {
      const pts = (line || []).map(PointXZ);
      if (pts.length >= 2) trenches.push({ id: "wayTrench", points: pts, width: 3.6, depth: 1.5 });
    }
    for (const rib of sceneDoc.ways?.roadRibbons || []) {
      const pts = (rib.points || []).map(PointXZ);
      if (pts.length >= 2) {
        roads.push({ id: rib.id || "road", points: pts, width: Math.max(1.8, Number(rib.width) || 3.6), kind: rib.kind || "road" });
      }
    }
    for (const line of sceneDoc.ways?.roads || []) {
      const pts = (line || []).map(PointXZ);
      if (pts.length >= 2) roads.push({ id: "wayRoad", points: pts, width: 4.8, kind: "road" });
    }
    for (const ramp of sceneDoc.surface?.ramps || []) {
      const pts = (ramp.points || []).map(PointXZ);
      if (pts.length >= 2) roads.push({ id: ramp.id || "ramp", points: pts, width: Math.max(1.6, Number(ramp.width) || 2.4), kind: "ramp" });
    }
    for (const obj of sceneDoc.objects || []) {
      if (!obj?.pos || obj.layer === "backdrop" || /^远景/.test(obj.group || "")) continue;
      if (obj.showOn) continue; // 默认隐藏的剧情物件不提前挡路
      const x = Number(obj.pos[0]) || 0;
      const z = Number(obj.pos[2]) || 0;
      const size = Array.isArray(obj.size) ? obj.size : [obj.params?.w || 1.2, obj.params?.h || 1.2, obj.params?.d || 1.2];
      const w = Math.abs(Number(size[0]) || 0);
      const h = Math.abs(Number(size[1]) || 0);
      const d = Math.abs(Number(size[2]) || 0);
      if (w < 0.15 || d < 0.15 || h < 0.25) continue;
      if (w > 45 && d > 45) continue; // 跳过整片大地坪/屋顶大面片
      const isCover = !!obj.cover || obj.planning === true || obj.material === "Whitebox/Cover";
      const isTree = /^Tree\//i.test(obj.asset || "") || obj.material === "Whitebox/Foliage";
      const isSolid = obj.solid !== false && !obj.airWall && !/^AirWall|KeepIn|StageGate/i.test(obj.id || "");
      const ry = (Number(obj.ry) || Number(obj.rot?.[1]) || 0) * (Math.abs(Number(obj.ry) || 0) > 6.5 ? Math.PI / 180 : 1);
      const radius = Math.hypot(w * 0.5, d * 0.5);
      const entry = { id: obj.id || "", x, z, hx: w * 0.5, hz: d * 0.5, h, ry, cos: Math.cos(ry), sin: Math.sin(ry), radius, isCover, isTree };
      if (isCover) covers.push(entry);
      if (isSolid || isCover) obstacles.push(entry);
    }
    for (const wall of sceneDoc.airWalls || []) {
      const pts = (wall.points || []).map(PointXZ);
      if (pts.length >= 2) airWalls.push({ id: wall.id || "airWall", points: pts });
    }
    for (const mk of sceneDoc.markers || []) {
      if (Number.isFinite(mk?.x) && Number.isFinite(mk?.z)) {
        landmarks.push({ id: mk.id || "", name: mk.name || "", x: mk.x, z: mk.z, kind: mk.kind || "marker" });
      }
    }
  }

  /** 点到单个 OBB（局部轴对齐盒子）的带符号距离（<0 在内部）。 */
  function BoxSignedDistance(px, pz, box) {
    const dx = px - box.x, dz = pz - box.z;
    // 旋转回盒局部系
    const lx = dx * box.cos - dz * box.sin;
    const lz = dx * box.sin + dz * box.cos;
    const qx = Math.abs(lx) - box.hx;
    const qz = Math.abs(lz) - box.hz;
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qz, 0));
    const inside = Math.min(Math.max(qx, qz), 0);
    return outside + inside;
  }

  /** 判断某世界点是否被静态阻挡物/空气墙占据（带 clearance 净空）。 */
  function IsBlocked(px, pz, clearance = D.obstacleClearanceM) {
    for (const box of obstacles) {
      if (Math.abs(px - box.x) > box.radius + clearance || Math.abs(pz - box.z) > box.radius + clearance) continue;
      if (BoxSignedDistance(px, pz, box) < clearance) return true;
    }
    for (const wall of airWalls) {
      if (PolylineDistance(px, pz, wall.points) < clearance) return true;
    }
    return false;
  }

  /** 查询点所处的场景通道（优先壕沟，其次坡道/道路），没有则返回 null（视作开阔野外）。 */
  function CorridorHintAt(px, pz) {
    let bestTrench = null;
    for (const tr of trenches) {
      const dist = PolylineDistance(px, pz, tr.points);
      if (dist <= tr.width * 0.72 + 1.1 && (!bestTrench || dist < bestTrench.dist)) {
        bestTrench = { kind: "trench", width: tr.width, depth: tr.depth, dist, id: tr.id };
      }
    }
    if (bestTrench) return bestTrench;
    let bestRoad = null;
    for (const rd of roads) {
      const dist = PolylineDistance(px, pz, rd.points);
      if (dist <= rd.width * 0.72 + 0.9 && (!bestRoad || dist < bestRoad.dist)) {
        bestRoad = { kind: rd.kind || "road", width: rd.width, depth: 0, dist, id: rd.id };
      }
    }
    return bestRoad;
  }

  return {
    id: sceneDoc?.id || "Synthetic",
    trenches,
    roads,
    obstacles,
    covers,
    airWalls,
    landmarks,
    heightAt: typeof heightAt === "function" ? heightAt : () => 0,
    BoxSignedDistance,
    IsBlocked,
    CorridorHintAt,
  };
}

/**
 * 编译一条 PCG 走廊样条。
 * @param {Array<[number,number]|{p:[number,number],width?:number,leftWidth?:number,rightWidth?:number,tag?:string,poi?:Array}>} rawPoints
 * @param {object} [options]
 */
export function BuildSquadCorridor(rawPoints, options = {}) {
  const {
    env = null,
    sampleStepM = D.corridorSampleStepM,
    defaultWidthM = D.defaultCorridorWidthM,
    openSpreadM = D.openSpreadM,
    capsuleRadiusM = D.capsuleRadiusM,
    wallMarginM = D.wallMarginM,
    obstacleClearanceM = D.obstacleClearanceM,
    startTaperM = D.startTaperM,
    endTaperM = D.endTaperM,
    autoCorridorFromScene = true,
    concealmentClamp = false,
    concealmentStartM = 12,
  } = options;

  const ctrlSpecs = (rawPoints || []).map((entry) => {
    const p = PointXZ(entry);
    const meta = Array.isArray(entry) ? {} : (entry || {});
    return {
      x: p[0], z: p[1],
      width: Number.isFinite(meta.width) ? meta.width : null,
      leftWidth: Number.isFinite(meta.leftWidth) ? meta.leftWidth : null,
      rightWidth: Number.isFinite(meta.rightWidth) ? meta.rightWidth : null,
      tag: meta.tag || null,
      poi: Array.isArray(meta.poi) ? meta.poi : [],
    };
  });
  if (ctrlSpecs.length < 2) throw new Error("BuildSquadCorridor 需要至少 2 个控制点");

  const road = MakeRoadPath(ctrlSpecs.map((c) => [c.x, c.z]), { alpha: 0.5, subdivisions: 18 });
  const totalLen = Math.max(0.01, road.length);
  const ctrlS = ctrlSpecs.map((c) => road.ClosestS(c.x, c.z));

  /** 插值作者显式指定的宽度覆盖（未指定则返回 null）。 */
  function AuthoredHalfWidths(s) {
    let idx = 0;
    while (idx < ctrlS.length - 2 && ctrlS[idx + 1] < s) idx += 1;
    const a = ctrlSpecs[idx], b = ctrlSpecs[idx + 1];
    const span = Math.max(1e-4, ctrlS[idx + 1] - ctrlS[idx]);
    const t = Clamp((s - ctrlS[idx]) / span, 0, 1);
    const aL = a.leftWidth ?? (a.width != null ? a.width * 0.5 : null);
    const aR = a.rightWidth ?? (a.width != null ? a.width * 0.5 : null);
    const bL = b.leftWidth ?? (b.width != null ? b.width * 0.5 : null);
    const bR = b.rightWidth ?? (b.width != null ? b.width * 0.5 : null);
    if (aL == null && bL == null && aR == null && bR == null) return null;
    const fallback = defaultWidthM * 0.5;
    const left = (aL ?? bL ?? fallback) * (1 - t) + (bL ?? aL ?? fallback) * t;
    const right = (aR ?? bR ?? fallback) * (1 - t) + (bR ?? aR ?? fallback) * t;
    return { left, right };
  }

  const count = Math.max(2, Math.ceil(totalLen / Math.max(0.35, sampleStepM)));
  const stations = [];
  const rawLeft = [];
  const rawRight = [];
  const margin = capsuleRadiusM + wallMarginM;
  const maxProbeHalf = Math.max(openSpreadM * 0.65, defaultWidthM * 0.65, 3.8);

  for (let i = 0; i <= count; i += 1) {
    const s = (totalLen * i) / count;
    const cur = road.At(s);
    const prev = road.At(Math.max(0, s - 1.2));
    const next = road.At(Math.min(totalLen, s + 1.2));
    const ds = Math.max(0.2, Math.min(totalLen, s + 1.2) - Math.max(0, s - 1.2));
    // 右法向（X东 Z南 Y上）：fwd=(tx,tz) => right=(-tz, tx)
    const rx = -cur.tz, rz = cur.tx;
    // 有符号曲率：>0 向右弯，<0 向左弯
    const dtx = (next.tx - prev.tx) / ds;
    const dtz = (next.tz - prev.tz) / ds;
    const curvature = dtx * rx + dtz * rz;

    const hint = autoCorridorFromScene && env ? env.CorridorHintAt(cur.x, cur.z) : null;
    const authored = AuthoredHalfWidths(s);
    let baseLeft = authored ? authored.left : (hint ? hint.width * 0.5 : maxProbeHalf);
    let baseRight = authored ? authored.right : (hint ? hint.width * 0.5 : maxProbeHalf);
    const terrainKind = hint ? hint.kind : "open";

    // 若为开阔地（非战壕），允许更宽的战术展开上限；若为战壕/坡道，以沟底宽度为准
    if (terrainKind === "open" && !authored) {
      baseLeft = Math.max(baseLeft, openSpreadM * 0.55);
      baseRight = Math.max(baseRight, openSpreadM * 0.55);
    }

    // 敌军出生遮挡安全约束：前段收窄横向展开，避免挤出掩护土垄提前暴露
    if (concealmentClamp && s < concealmentStartM) {
      const k = Smoothstep(0, concealmentStartM, s);
      const cap = 0.75 + (maxProbeHalf - 0.75) * k;
      baseLeft = Math.min(baseLeft, cap);
      baseRight = Math.min(baseRight, cap);
    }

    // 向左右法向步进探测场景静态阻挡（建筑/沙包掩体/空气墙/沟壁陡坡）
    const ProbeSide = (sign, limit) => {
      let usable = Math.max(0.2, limit - margin);
      if (!env || !autoCorridorFromScene) return usable;
      const centerY = env.heightAt(cur.x, cur.z);
      const probeStep = 0.35;
      for (let dist = probeStep; dist <= limit; dist += probeStep) {
        const px = cur.x + rx * sign * dist;
        const pz = cur.z + rz * sign * dist;
        if (env.IsBlocked(px, pz, obstacleClearanceM)) {
          usable = Math.max(0.15, dist - obstacleClearanceM * 0.85);
          break;
        }
        if (terrainKind === "trench") {
          const py = env.heightAt(px, pz);
          // 爬出沟壁高差 > 0.65m 即到达壕沟岸壁
          if (Math.abs(py - centerY) > 0.65) {
            usable = Math.max(0.15, dist - margin * 0.7);
            break;
          }
        }
      }
      return usable;
    };

    const leftClear = ProbeSide(-1, baseLeft);
    const rightClear = ProbeSide(1, baseRight);
    rawLeft.push(leftClear);
    rawRight.push(rightClear);

    const centerY = env ? env.heightAt(cur.x, cur.z) : 0;
    const rimLeftY = env ? env.heightAt(cur.x - rx * (leftClear + 1.8), cur.z - rz * (leftClear + 1.8)) : 0;
    const rimRightY = env ? env.heightAt(cur.x + rx * (rightClear + 1.8), cur.z + rz * (rightClear + 1.8)) : 0;

    stations.push({
      s,
      x: cur.x,
      z: cur.z,
      y: centerY,
      tx: cur.tx,
      tz: cur.tz,
      rx,
      rz,
      curvature,
      terrainKind,
      dMin: -leftClear,
      dMax: rightClear,
      width: leftClear + rightClear,
      rimLeftDeltaY: rimLeftY - centerY,
      rimRightDeltaY: rimRightY - centerY,
      envelope: Smoothstep(0, startTaperM, s) * Smoothstep(0, endTaperM, totalLen - s),
    });
  }

  // 对左右净宽做轻度 3 点高斯平滑，但仍取 min 保护障碍（不把掩体边缘抹穿）
  for (let i = 1; i < stations.length - 1; i += 1) {
    const smoothL = rawLeft[i - 1] * 0.25 + rawLeft[i] * 0.5 + rawLeft[i + 1] * 0.25;
    const smoothR = rawRight[i - 1] * 0.25 + rawRight[i] * 0.5 + rawRight[i + 1] * 0.25;
    const finalL = Math.min(rawLeft[i], smoothL + 0.12);
    const finalR = Math.min(rawRight[i], smoothR + 0.12);
    stations[i].dMin = -finalL;
    stations[i].dMax = finalR;
    stations[i].width = finalL + finalR;
  }

  // 自动提取战术兴趣点 POI（拐角盲区、高处沟沿、作者自定义 POI）
  const autoPois = [];
  for (const c of ctrlSpecs) {
    for (const poi of c.poi) {
      const p = PointXZ(poi.p || poi);
      autoPois.push({ x: p[0], z: p[1], y: env ? env.heightAt(p[0], p[1]) : 0, kind: poi.kind || "authored", weight: Number(poi.weight) || 1.0, s: road.ClosestS(p[0], p[1]) });
    }
  }
  let lastCornerS = -99;
  for (let i = 2; i < stations.length - 2; i += 1) {
    const st = stations[i];
    const k = Math.abs(st.curvature);
    if (k > 0.085 && k >= Math.abs(stations[i - 1].curvature) && k >= Math.abs(stations[i + 1].curvature) && st.s - lastCornerS > 8) {
      lastCornerS = st.s;
      const side = st.curvature > 0 ? 1 : -1;
      const px = st.x + st.tx * 2.4 + st.rx * side * 1.4;
      const pz = st.z + st.tz * 2.4 + st.rz * side * 1.4;
      autoPois.push({ x: px, z: pz, y: st.y + 1.2, kind: "blindCorner", weight: 1.0, s: st.s });
    }
    // 战壕高处沟沿（左右交替生成，约每 11 米一个）
    if (i % 15 === 6) {
      if (st.rimLeftDeltaY > 0.75 || st.terrainKind === "trench") {
        const px = st.x - st.rx * (Math.abs(st.dMin) + 2.2);
        const pz = st.z - st.rz * (Math.abs(st.dMin) + 2.2);
        autoPois.push({ x: px, z: pz, y: st.y + Math.max(1.2, st.rimLeftDeltaY), kind: "trenchRim", weight: 0.78, s: st.s });
      }
    } else if (i % 15 === 13) {
      if (st.rimRightDeltaY > 0.75 || st.terrainKind === "trench") {
        const px = st.x + st.rx * (st.dMax + 2.2);
        const pz = st.z + st.rz * (st.dMax + 2.2);
        autoPois.push({ x: px, z: pz, y: st.y + Math.max(1.2, st.rimRightDeltaY), kind: "trenchRim", weight: 0.78, s: st.s });
      }
    }
  }
  // 路边掩体缺口也是自然观察点
  if (env) {
    for (const cov of env.covers) {
      const sNear = road.ClosestS(cov.x, cov.z);
      const pNear = road.At(sNear);
      const dist = Math.hypot(cov.x - pNear.x, cov.z - pNear.z);
      if (dist <= 6.5) {
        autoPois.push({ x: cov.x, z: cov.z, y: env.heightAt(cov.x, cov.z) + 1.0, kind: "coverPost", weight: 0.72, s: sNear });
      }
    }
  }

  /** 按弧长 s 线性插值站点信息。 */
  function SampleAt(s) {
    const c = Clamp(s, 0, totalLen);
    const f = (c / totalLen) * (stations.length - 1);
    const i = Math.min(stations.length - 2, Math.floor(f));
    const w = f - i;
    const a = stations[i], b = stations[i + 1];
    const tx = a.tx + (b.tx - a.tx) * w;
    const tz = a.tz + (b.tz - a.tz) * w;
    const tl = Math.hypot(tx, tz) || 1;
    const ntx = tx / tl, ntz = tz / tl;
    const rx = -ntz, rz = ntx;
    const dMin = a.dMin + (b.dMin - a.dMin) * w;
    const dMax = a.dMax + (b.dMax - a.dMax) * w;
    return {
      s: c,
      x: a.x + (b.x - a.x) * w,
      z: a.z + (b.z - a.z) * w,
      y: a.y + (b.y - a.y) * w,
      tx: ntx,
      tz: ntz,
      rx,
      rz,
      curvature: a.curvature + (b.curvature - a.curvature) * w,
      dMin,
      dMax,
      width: dMax - dMin,
      terrainKind: w < 0.5 ? a.terrainKind : b.terrainKind,
      envelope: a.envelope + (b.envelope - a.envelope) * w,
    };
  }

  /** 从走廊局部坐标 (s, d) 变换为世界坐标 (x, z) 并回传站点。 */
  function ToWorld(s, d) {
    const st = SampleAt(s);
    return {
      x: st.x + st.rx * d,
      z: st.z + st.rz * d,
      y: env ? env.heightAt(st.x + st.rx * d, st.z + st.rz * d) : st.y,
      station: st,
    };
  }

  return {
    road,
    length: totalLen,
    controlPoints: ctrlSpecs,
    stations,
    pois: autoPois,
    SampleAt,
    ToWorld,
    ClosestS: (x, z) => road.ClosestS(x, z),
  };
}
