// Data_FirstLevelPropDressing.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { PROP_DRESSING, PROP_GROUND, PROP_RUBBLE } from "./Data_FirstLevelPropDressing.mjs";

// ---------------------------------------------------------------------------
// 纯函数（运行时与 node 测试共用）
// ---------------------------------------------------------------------------
export function HashSeed(text, seed = 2166136261) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export function Rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 模型尺寸（归一化后：底面中心为原点，[x, y, z] 米）配到一只盒子（块自身轴 w, h, d）。
 * 候选朝向：原样 / 绕 Y 转 90°（长边、薄边对上盒子的那一边）；`rollDeg` 先把模型绕自身 Z 轴歪倒这么多度
 * （90 = 放倒；外观按歪倒后的包围盒四角算，比真实轮廓略大一点）。
 * 逐轴缩放 s_i = box_i / model_i，再按几何平均把压扁/拉长收进 maxStretch 以内，取变形最小的朝向。
 * 返回模型轴上的缩放、附加偏航、以及外观在盒子轴上的实际尺寸（测试拿它和碰撞盒比）。
 */
export function RolledSize(modelSize, rollDeg = 0) {
  const a = rollDeg * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return [modelSize[0] * c + modelSize[1] * s, modelSize[0] * s + modelSize[1] * c, modelSize[2]];
}

export function FitPropToBox(modelSize, box, { maxStretch = 1.35, rollDeg = 0 } = {}) {
  const base = rollDeg ? RolledSize(modelSize, rollDeg) : modelSize;
  let best = null;
  for (const swap of [false, true]) {
    const model = swap ? [base[2], base[1], base[0]] : base;
    const target = [box.w, box.h, box.d];
    const raw = target.map((value, i) => value / Math.max(model[i], 1e-4));
    const g = Math.cbrt(raw[0] * raw[1] * raw[2]);
    const scale = raw.map((s) => Math.min(g * maxStretch, Math.max(g / maxStretch, s)));
    const distortion = raw.reduce((sum, s) => sum + Math.abs(Math.log(s / g)), 0);
    const visual = model.map((m, i) => m * scale[i]);
    if (!best || distortion < best.distortion - 1e-9) {
      // 模型轴上的缩放：swap 时模型 x 对的是盒子 d、模型 z 对的是盒子 w。
      const modelScale = swap ? [scale[2], scale[1], scale[0]] : scale;
      best = { swap, distortion, scale: modelScale, visual, yaw: swap ? Math.PI / 2 : 0 };
    }
  }
  return best;
}

function CornersOf(block) {
  const c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0), hw = block.w / 2, hd = block.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([a, b]) => ({ x: block.x + a * c + b * s, z: block.z - a * s + b * c }));
}

/** 主块 + 附属件在主块自身坐标系里的并集盒。 */
function UnionBox(main, parts) {
  const c = Math.cos(main.ry || 0), s = Math.sin(main.ry || 0);
  let minX = -main.w / 2, maxX = main.w / 2, minZ = -main.d / 2, maxZ = main.d / 2;
  let bottom = main.y - main.h / 2, top = main.y + main.h / 2;
  for (const part of parts) {
    for (const corner of CornersOf(part)) {
      const dx = corner.x - main.x, dz = corner.z - main.z;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      minX = Math.min(minX, lx); maxX = Math.max(maxX, lx); minZ = Math.min(minZ, lz); maxZ = Math.max(maxZ, lz);
    }
    bottom = Math.min(bottom, part.y - part.h / 2); top = Math.max(top, part.y + part.h / 2);
  }
  // 并集中心在主块轴上的偏移（轮廓不对称时，比如缸沿比缸身宽，中心不动）。
  const ox = (minX + maxX) / 2, oz = (minZ + maxZ) / 2;
  return { x: main.x + ox * c + oz * s, z: main.z - ox * s + oz * c, ry: main.ry || 0,
    w: maxX - minX, d: maxZ - minZ, bottom, top };
}

/**
 * 按替换表出摆位。`modelSizes`：Map / 对象，资产 id → 归一化尺寸 [x, y, z]。
 * 返回 { placements, replaced, missing }；placements 每件：
 *   { id, block, asset, x, y（底）, z, yaw, rollDeg, scale:[歪倒后的模型轴], visual:[w,h,d], box:{w,h,d} }
 */
export function PlanPropDressing(blocks, groundAt, modelSizes, entries = PROP_DRESSING) {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const SizeOf = (asset) => (modelSizes instanceof Map ? modelSizes.get(asset) : modelSizes[asset]);
  const placements = [], replaced = new Set(), missing = [];
  for (const entry of entries) {
    const main = byId.get(entry.block), size = SizeOf(entry.asset);
    const parts = (entry.hide || []).map((id) => byId.get(id));
    const overlaps = (entry.hideOverlaps || []).map((id) => byId.get(id));
    if (!main || !size || parts.some((part) => !part) || overlaps.some((part) => !part)) { missing.push(entry.block); continue; }
    const union = UnionBox(main, parts);
    // 贴地：盒底就在地面附近的，按并集脚印四角 + 中心取最低地面再压进土里，顶面不动。
    const corners = CornersOf({ x: union.x, z: union.z, w: union.w, d: union.d, ry: union.ry });
    const centerGround = groundAt(union.x, union.z);
    let bottom = union.bottom;
    if (Math.abs(bottom - centerGround) <= PROP_GROUND.snapM) {
      bottom = Math.min(centerGround, ...corners.map((p) => groundAt(p.x, p.z))) - PROP_GROUND.embedM;
    }
    const [nw, nh, nd] = entry.tile || [1, 1, 1];
    const cell = { w: union.w / nw, h: (union.top - bottom) / nh, d: union.d / nd };
    const c = Math.cos(union.ry), s = Math.sin(union.ry);
    const rng = Rng(HashSeed(entry.block));
    for (let iy = 0; iy < nh; iy++) for (let iz = 0; iz < nd; iz++) for (let ix = 0; ix < nw; ix++) {
      const fit = FitPropToBox(size, cell, entry);
      const lx = -union.w / 2 + (ix + 0.5) * cell.w, lz = -union.d / 2 + (iz + 0.5) * cell.d;
      const jitter = (entry.jitterYaw ?? (nw * nh * nd > 1 ? 0.06 : 0)) * (rng() * 2 - 1);
      placements.push({
        id: `${entry.block}#${ix}${iy}${iz}`, block: entry.block, asset: entry.asset,
        x: union.x + lx * c + lz * s, y: bottom + iy * cell.h, z: union.z - lx * s + lz * c,
        // A 180-degree facing flip keeps the measured box/scale and all collision contracts intact.
        yaw: union.ry + fit.yaw + jitter + (entry.flipFacing ? Math.PI : 0), rollDeg: entry.rollDeg || 0, scale: fit.scale, visual: fit.visual,
        box: { ...cell },
      });
    }
    replaced.add(main.id);
    for (const part of parts) replaced.add(part.id);
    for (const part of overlaps) replaced.add(part.id);
  }
  return { placements, replaced, missing };
}

/** 碎砖瓦的「散块」判据（白盒 RubbleStrip 的产物）。 */
export function IsLooseRubbleBlock(block, groundAt, rules = PROP_RUBBLE.loose) {
  if (block.solid !== false || block.cover || block.dynamic || block.treeModel) return false;
  if (!rules.idPattern.test(block.id) || rules.excludePattern.test(block.id)) return false;
  if (!rules.semantics.includes(block.semantic)) return false;
  if (Math.max(block.w, block.d) > rules.maxFootprintM || block.h > rules.maxHeightM) return false;
  return Math.abs(block.y - block.h / 2 - groundAt(block.x, block.z)) <= rules.groundSnapM;
}

function SegmentDistance(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len));
  return Math.hypot(px - a.x - dx * t, pz - a.z - dz * t);
}

/** 路线折线 → 16 m 分桶的线段表，查「离最近路线多远」（cap 以外返回 cap）。 */
export function RouteIndex(routes, cellM = 16) {
  const grid = new Map();
  const Key = (ix, iz) => ix * 73856093 ^ iz * 19349663;
  for (const route of routes) for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const x0 = Math.floor(Math.min(a.x, b.x) / cellM) - 1, x1 = Math.floor(Math.max(a.x, b.x) / cellM) + 1;
    const z0 = Math.floor(Math.min(a.z, b.z) / cellM) - 1, z1 = Math.floor(Math.max(a.z, b.z) / cellM) + 1;
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const key = Key(ix, iz);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push([a, b]);
    }
  }
  return {
    Distance(x, z, cap = cellM) {
      const list = grid.get(Key(Math.floor(x / cellM), Math.floor(z / cellM)));
      let best = cap;
      if (list) for (const [a, b] of list) best = Math.min(best, SegmentDistance(x, z, a, b));
      return best;
    },
  };
}

/** 点表（锚点、交互点）→ 同样的分桶，查最近点距离。 */
export function PointIndex(points, cellM = 16) {
  const grid = new Map();
  const Key = (ix, iz) => ix * 73856093 ^ iz * 19349663;
  for (const p of points) {
    for (let ix = Math.floor(p.x / cellM) - 1; ix <= Math.floor(p.x / cellM) + 1; ix++)
      for (let iz = Math.floor(p.z / cellM) - 1; iz <= Math.floor(p.z / cellM) + 1; iz++) {
        const key = Key(ix, iz);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(p);
      }
  }
  return {
    Distance(x, z, cap = cellM) {
      const list = grid.get(Key(Math.floor(x / cellM), Math.floor(z / cellM)));
      let best = cap;
      if (list) for (const p of list) best = Math.min(best, Math.hypot(x - p.x, z - p.z));
      return best;
    },
  };
}

function PickKind(rng, kinds) {
  const total = kinds.reduce((sum, kind) => sum + kind.weight, 0);
  let r = rng() * total;
  for (const kind of kinds) { r -= kind.weight; if (r <= 0) return kind; }
  return kinds[kinds.length - 1];
}

/**
 * 碎砖瓦撒点。ctx：{ blocks, groundAt, routes（折线数组）, anchors（点数组）, craters }。
 * 返回 { pieces:[{x,y,z,yaw,tilt,kind,size:[l,h,w],shade}], hidden:Set（换掉的散块 id） }。
 */
export function PlanRubbleScatter(ctx, rules = PROP_RUBBLE) {
  const { blocks, groundAt } = ctx;
  const routes = RouteIndex(ctx.routes || []), anchors = PointIndex(ctx.anchors || []);
  const pieces = [], hidden = new Set();
  const Clear = (x, z) => routes.Distance(x, z, rules.routeClearM + 1) > rules.routeClearM
    && anchors.Distance(x, z, rules.anchorClearM + 1) > rules.anchorClearM;
  const Emit = (rng, x, z, maxH = rules.maxHeightM, scaleMul = 1) => {
    if (pieces.length >= rules.maxPieces) return;
    const kind = PickKind(rng, rules.kinds);
    const k = (1 + (rng() * 2 - 1) * kind.jitter) * scaleMul;
    const size = [kind.size[0] * k, Math.min(kind.size[1] * k, maxH), kind.size[2] * k];
    const tilt = (rng() * 2 - 1) * 0.35;
    pieces.push({ x, z, y: groundAt(x, z) - size[1] * 0.28, yaw: rng() * Math.PI * 2, tilt,
      kind: kind.id, size, shade: kind.shade.map((v) => v * (0.85 + rng() * 0.3)) });
  };
  // 1) 白盒散块：整只换掉，块面积 × 密度件，落在块脚印里（块本来就在墙根上）。
  for (const block of blocks) {
    if (!IsLooseRubbleBlock(block, groundAt, rules.loose)) continue;
    hidden.add(block.id);
    const rng = Rng(HashSeed(block.id, rules.seed));
    const count = Math.max(rules.loose.minPieces, Math.min(rules.loose.maxPiecesPerBlock,
      Math.round(block.w * block.d * rules.loose.piecesPerM2 + rng() * 2)));
    const c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0);
    for (let i = 0; i < count; i++) {
      const a = (rng() - 0.5) * block.w * 1.3, b = (rng() - 0.5) * block.d * 1.3;
      Emit(rng, block.x + a * c + b * s, block.z - a * s + b * c, Math.min(rules.maxHeightM, block.h + 0.05));
    }
  }
  // 2) 残墙 / 倒墙脚下、3) 完好墙根：沿块的四条边，往外 bandM 以内。
  const EdgeScatter = (block, perM, bandM, idSalt) => {
    const rng = Rng(HashSeed(block.id + idSalt, rules.seed));
    const corners = CornersOf(block);
    for (let e = 0; e < 4; e++) {
      const a = corners[e], b = corners[(e + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const nx = (b.z - a.z) / (len || 1), nz = -(b.x - a.x) / (len || 1);
      const count = Math.floor(len * perM + rng());
      for (let i = 0; i < count; i++) {
        const t = rng(), out = 0.05 + rng() ** 1.6 * bandM;
        const x = a.x + (b.x - a.x) * t + nx * out, z = a.z + (b.z - a.z) * t + nz * out;
        if (!Clear(x, z) || InsideAnyBlock(x, z)) continue;
        Emit(rng, x, z);
      }
    }
  };
  const grounded = blocks.filter((block) => block.solid !== false
    && Math.abs(block.y - block.h / 2 - groundAt(block.x, block.z)) < 0.6);
  const footIndex = new Map();
  for (const block of grounded) {
    const key = `${Math.floor(block.x / 16)},${Math.floor(block.z / 16)}`;
    if (!footIndex.has(key)) footIndex.set(key, []);
    footIndex.get(key).push(block);
  }
  function InsideAnyBlock(x, z) {
    for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
      for (const block of footIndex.get(`${Math.floor(x / 16) + ix},${Math.floor(z / 16) + iz}`) || []) {
        const dx = x - block.x, dz = z - block.z, c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0);
        if (Math.abs(dx * c - dz * s) < block.w / 2 + 0.02 && Math.abs(dx * s + dz * c) < block.d / 2 + 0.02) return true;
      }
    }
    return false;
  }
  for (const block of grounded) {
    if (block.h >= rules.ruin.minHeightM && rules.ruin.idPattern.test(block.id))
      EdgeScatter(block, rules.ruin.perM, rules.ruin.bandM, ":ruin");
    else if (block.h >= rules.wallFoot.minHeightM && rules.wallFoot.idPattern.test(block.id)
      && rules.wallFoot.semantics.includes(block.semantic))
      EdgeScatter(block, rules.wallFoot.perM, rules.wallFoot.bandM, ":foot");
  }
  // 4) 弹坑沿。
  for (const [i, crater] of (ctx.craters || []).entries()) {
    if (!(crater.radius >= rules.crater.minRadiusM)) continue;
    const rng = Rng(HashSeed(`crater${i}`, rules.seed));
    const count = Math.floor(2 * Math.PI * crater.radius * rules.crater.perM);
    for (let k = 0; k < count; k++) {
      const angle = rng() * Math.PI * 2, r = crater.radius * (0.85 + rng() * 0.2) + rng() ** 1.5 * rules.crater.bandM;
      const x = crater.x + Math.cos(angle) * r, z = crater.z + Math.sin(angle) * r;
      if (!Clear(x, z) || InsideAnyBlock(x, z)) continue;
      Emit(rng, x, z, rules.maxHeightM, 0.9);
    }
  }
  return { pieces, hidden };
}
