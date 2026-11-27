// 《台儿庄：血战滕县》连续水面几何构建器（纯几何，仅依赖 three，零渲染管线依赖）。
//
// 解决的问题：
//   场景与 PCG 里用一串独立旋转矩形水块拼弯河（RiverWater_1_00..21、RiverWater_2、
//   HechaTailWater*、TributaryWater_1..4、SandRiverWater_01..63）时，每段各自画成刚性方盒，
//   弯道外侧必然扯开三角缺口、宽窄变化处出现锯齿台阶、内弯三角形重叠闪烁。
//
// 做法：
//   1. 自动按水面高程与端面几何邻接将首尾相接的水块聚合成有序折线链（支持 X 轴或 Z 轴沿河，
//      即使短段宽大于长如 HechaTailWater_2 也能准确顺接）；
//   2. 还原相邻两段重合处的真实中心线控制点与平滑半宽，用张力受控的平滑曲线（0.5 混合
//      Catmull-Rom，贴合河床不漂出沟外）做加密重采样，并以柔和岸坡嵌边（bankTuckM）将
//      水面边缘自然埋入斜坡河岸，彻底消除弯道缺口、锯齿台阶与岸边干缝；
//   3. 高水位支流（如 TributaryWater）末端若落入低水位干流覆盖范围内，末段平滑缓坡汇入干流水面；
//   4. 同时统一支持 meta.waterRibbon（如 SandRiverSurface、Pond_*_Water）与独立矩形水池。
//
// 消费方：Script_Water / Script_EditorBlockoutCreek / Script_FirstLevelWhiteboxLooks /
//         Script_FirstLevelWhiteboxField / AdvancedTools/Script_SceneEditor。

import * as THREE from "three";

const DEG = Math.PI / 180;

function Clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/** 兼容白盒块 {x,y,z,w,h,d,ry} 与场景 JSON 物件 {pos,size,yawDeg,meta}。 */
function NormalizeWaterItem(item, groundAt) {
  if (!item) return null;
  const ribbon = item.waterRibbon || item.meta?.waterRibbon || null;
  if (Array.isArray(item.pos)) {
    const x = item.pos[0] || 0;
    const z = item.pos[2] || 0;
    const [w = 1, h = 0.1, d = 1] = item.size || [];
    const baseY = Number.isFinite(item.pos[1]) ? item.pos[1] : (groundAt ? groundAt(x, z) : 0);
    const ry = (item.yawDeg || 0) * DEG;
    return { id: item.id || "", x, z, w, h, d, ry, yTop: baseY + h, ribbon };
  }
  const x = item.x || 0;
  const z = item.z || 0;
  const w = item.w || 1;
  const h = item.h || 0;
  const d = item.d || 1;
  const ry = item.ry || 0;
  const centerY = Number.isFinite(item.y) ? item.y : (groundAt ? groundAt(x, z) : 0);
  return { id: item.id || "", x, z, w, h, d, ry, yTop: centerY + h * 0.5, ribbon };
}

/** 构造一条矩形水块在 Z 轴或 X 轴方向上的中心线段与两端点。 */
function SegmentForAxis(seg, axis) {
  const c = Math.cos(seg.ry), s = Math.sin(seg.ry);
  // 与 Three.js rotation.y 及 Script_EditorBlockoutLevels / Script_SceneEditor 完全一致：
  // 局部 (lx, lz) -> 世界 (x + lx*c + lz*s, z - lx*s + lz*c)
  const dx = axis === "z" ? s : c;
  const dz = axis === "z" ? c : -s;
  const len = axis === "z" ? seg.d : seg.w;
  const hw = (axis === "z" ? seg.w : seg.d) * 0.5;
  const halfLen = len * 0.5;
  return {
    axis,
    dx, dz, len, hw,
    yTop: seg.yTop,
    // end 0 = 负方向端，外向法线 = (-dx, -dz)；end 1 = 正方向端，外向法线 = (+dx, +dz)
    pts: [
      { x: seg.x - dx * halfLen, z: seg.z - dz * halfLen, ox: -dx, oz: -dz },
      { x: seg.x + dx * halfLen, z: seg.z + dz * halfLen, ox: dx, oz: dz },
    ],
  };
}

/**
 * 将一组矩形水块按高程与端面邻接聚合成有序折线链（chains）和独立水体（singles）。
 * 每条链返回平滑还原后的控制站列表 [{ x, z, y, hw }, ...]。
 */
export function TraceWaterChains(rawBlocks, groundAt = null) {
  const normalizedBlocks = [];
  const ribbons = [];
  for (const b of rawBlocks || []) {
    const nb = (b && typeof b.yTop === "number") ? b : NormalizeWaterItem(b, groundAt);
    if (!nb) continue;
    if (Array.isArray(nb.ribbon) && nb.ribbon.length >= 2) ribbons.push(nb);
    else normalizedBlocks.push(nb);
  }
  const n = normalizedBlocks.length;
  if (n === 0) return { chains: [], singles: [], ribbons };

  const geom = normalizedBlocks.map((b) => ({
    z: SegmentForAxis(b, "z"),
    x: SegmentForAxis(b, "x"),
  }));

  // 收集所有合法的端对端连接候选（仅允许同水位、端距近、方向顺接、宽度相近）
  const candidates = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (Math.abs(normalizedBlocks[i].yTop - normalizedBlocks[j].yTop) > 0.18) continue;
      for (const axI of ["z", "x"]) {
        const gI = geom[i][axI];
        for (const axJ of ["z", "x"]) {
          const gJ = geom[j][axJ];
          const maxHw = Math.max(gI.hw, gJ.hw);
          const minHw = Math.max(0.2, Math.min(gI.hw, gJ.hw));
          if (maxHw / minHw > 2.2) continue;
          const maxGap = Math.max(1.85, Math.min(gI.len, gJ.len) * 0.36);
          for (let eI = 0; eI < 2; eI += 1) {
            const pI = gI.pts[eI];
            for (let eJ = 0; eJ < 2; eJ += 1) {
              const pJ = gJ.pts[eJ];
              const dist = Math.hypot(pI.x - pJ.x, pI.z - pJ.z);
              if (dist > maxGap) continue;
              // 外向切线应当近似反向（dot <= -0.25 表示转角不超过 ~75°）
              const dirDot = pI.ox * pJ.ox + pI.oz * pJ.oz;
              if (dirDot > -0.25) continue;
              // 过滤横向侧贴：两点连线相对段中心距离不能大于两段半长之和过多
              const cDist = Math.hypot(normalizedBlocks[i].x - normalizedBlocks[j].x, normalizedBlocks[i].z - normalizedBlocks[j].z);
              if (cDist < Math.min(gI.len, gJ.len) * 0.35) continue;
              const score = dist + 0.35 * (1 + dirDot) + 0.12 * Math.abs(gI.hw - gJ.hw);
              candidates.push({ i, axI, eI, j, axJ, eJ, score });
            }
          }
        }
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score);

  const chosenAxis = new Array(n).fill(null);
  const links = Array.from({ length: n }, () => [null, null]);
  // 并查集防止闭环破坏折线顺序
  const parent = Array.from({ length: n }, (_, k) => k);
  const Find = (k) => (parent[k] === k ? k : (parent[k] = Find(parent[k])));

  for (const c of candidates) {
    if (chosenAxis[c.i] && chosenAxis[c.i] !== c.axI) continue;
    if (chosenAxis[c.j] && chosenAxis[c.j] !== c.axJ) continue;
    if (links[c.i][c.eI] || links[c.j][c.eJ]) continue;
    if (Find(c.i) === Find(c.j)) continue;
    chosenAxis[c.i] = c.axI;
    chosenAxis[c.j] = c.axJ;
    links[c.i][c.eI] = { to: c.j, toEnd: c.eJ };
    links[c.j][c.eJ] = { to: c.i, toEnd: c.eI };
    parent[Find(c.i)] = Find(c.j);
  }

  const visited = new Uint8Array(n);
  const chains = [];
  const singles = [];

  for (let i = 0; i < n; i += 1) {
    if (visited[i]) continue;
    const deg = (links[i][0] ? 1 : 0) + (links[i][1] ? 1 : 0);
    if (deg === 0) {
      visited[i] = 1;
      singles.push(normalizedBlocks[i]);
      continue;
    }
    if (deg > 1) continue; // 只从链端出发遍历
    const ordered = [];
    let cur = i;
    let enterEnd = links[i][0] ? 1 : 0; // 没有连接的那一端作为起点
    while (cur != null && !visited[cur]) {
      visited[cur] = 1;
      const exitEnd = 1 - enterEnd;
      const seg = geom[cur][chosenAxis[cur]];
      ordered.push({
        block: normalizedBlocks[cur],
        start: seg.pts[enterEnd],
        end: seg.pts[exitEnd],
        yTop: seg.yTop,
        hw: seg.hw,
      });
      const next = links[cur][exitEnd];
      if (!next) break;
      cur = next.to;
      enterEnd = next.toEnd;
    }
    if (ordered.length >= 2) {
      const stations = [];
      stations.push({
        x: ordered[0].start.x,
        z: ordered[0].start.z,
        y: ordered[0].yTop,
        hw: ordered[0].hw,
      });
      for (let k = 1; k < ordered.length; k += 1) {
        const prev = ordered[k - 1];
        const curr = ordered[k];
        stations.push({
          x: 0.5 * (prev.end.x + curr.start.x),
          z: 0.5 * (prev.end.z + curr.start.z),
          y: 0.5 * (prev.yTop + curr.yTop),
          hw: 0.5 * (prev.hw + curr.hw),
        });
      }
      const last = ordered[ordered.length - 1];
      stations.push({
        x: last.end.x,
        z: last.end.z,
        y: last.yTop,
        hw: last.hw,
      });
      chains.push({ stations, yTop: ordered[0].yTop, ids: ordered.map((o) => o.block.id) });
    } else if (ordered.length === 1) {
      singles.push(ordered[0].block);
    }
  }
  // 兜底任何未访问节点
  for (let i = 0; i < n; i += 1) {
    if (!visited[i]) singles.push(normalizedBlocks[i]);
  }

  // 支流汇流平滑衔接：若高水位链的起点或终点落入低水位干流覆盖带宽内，
  // 末段柔和延顺并微坡衔接至干流水面，消除支流口悬空方头。
  for (let aIdx = 0; aIdx < chains.length; aIdx += 1) {
    const chain = chains[aIdx];
    const st = chain.stations;
    if (st.length < 2) continue;
    for (const isEnd of [false, true]) {
      const tip = isEnd ? st[st.length - 1] : st[0];
      let targetY = null;
      let bestDist = Infinity;
      for (let bIdx = 0; bIdx < chains.length; bIdx += 1) {
        if (bIdx === aIdx) continue;
        const other = chains[bIdx].stations;
        for (let k = 1; k < other.length; k += 1) {
          const p0 = other[k - 1], p1 = other[k];
          if (0.5 * (p0.y + p1.y) >= tip.y - 0.12) continue;
          const dx = p1.x - p0.x, dz = p1.z - p0.z;
          const len2 = dx * dx + dz * dz || 1;
          const t = Clamp(((tip.x - p0.x) * dx + (tip.z - p0.z) * dz) / len2, 0, 1);
          const qx = p0.x + dx * t, qz = p0.z + dz * t;
          const qHw = p0.hw + (p1.hw - p0.hw) * t;
          const dist = Math.hypot(tip.x - qx, tip.z - qz);
          if (dist <= qHw + 2.2 && dist < bestDist) {
            bestDist = dist;
            targetY = p0.y + (p1.y - p0.y) * t;
          }
        }
      }
      if (targetY !== null) {
        const prev = isEnd ? st[st.length - 2] : st[1];
        const dx = tip.x - prev.x, dz = tip.z - prev.z;
        const len = Math.hypot(dx, dz) || 1;
        // 往干流内顺延 0.6 m 并在末段 2.4 m 内平滑落水至干流水面
        const ux = dx / len, uz = dz / len;
        if (len > 3.0) {
          const split = {
            x: tip.x - ux * 2.4,
            z: tip.z - uz * 2.4,
            y: tip.y,
            hw: tip.hw,
          };
          if (isEnd) st.splice(st.length - 1, 0, split);
          else st.splice(1, 0, split);
        }
        tip.x += ux * 0.65;
        tip.z += uz * 0.65;
        tip.y = targetY + 0.01;
      }
    }
  }

  return { chains, singles, ribbons };
}

/** 0.5 混合 Catmull-Rom：既彻底圆化转角，又严格贴合原河道中线不飘出沟壁。 */
function SmoothSample(p0, p1, p2, p3, t, blend = 0.5) {
  const t2 = t * t, t3 = t2 * t;
  const cr = 0.5 * (
    (2 * p1)
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
  const lin = p1 + (p2 - p1) * t;
  return lin + (cr - lin) * blend;
}

function ResampleChain(stations, stepM, smoothBlend) {
  const m = stations.length;
  if (m < 2) return stations;
  const out = [];
  for (let i = 0; i < m - 1; i += 1) {
    const p0 = stations[Math.max(0, i - 1)];
    const p1 = stations[i];
    const p2 = stations[i + 1];
    const p3 = stations[Math.min(m - 1, i + 2)];
    const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const steps = Math.max(3, Math.min(24, Math.ceil(segLen / Math.max(0.6, stepM))));
    const sStart = i === 0 ? 0 : 1;
    for (let s = sStart; s <= steps; s += 1) {
      const t = s / steps;
      const smoothT = t * t * (3 - 2 * t);
      const x = SmoothSample(p0.x, p1.x, p2.x, p3.x, t, smoothBlend);
      const z = SmoothSample(p0.z, p1.z, p2.z, p3.z, t, smoothBlend);
      const y = p1.y + (p2.y - p1.y) * smoothT;
      const hw = p1.hw + (p2.hw - p1.hw) * smoothT;
      out.push({ x, z, y, hw });
    }
  }
  return out;
}

function AppendChainMesh(stations, buffers, { stepM, across, uvScale, bankTuckM, smoothBlend }) {
  const pts = ResampleChain(stations, stepM, smoothBlend);
  const count = pts.length;
  if (count < 2) return;
  const { positions, normals, uvs, edges, indices } = buffers;
  const base = positions.length / 3;
  const cols = Math.max(1, across | 0);

  for (let i = 0; i < count; i += 1) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(count - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tLen = Math.hypot(tx, tz) || 1;
    tx /= tLen;
    tz /= tLen;
    // R = (-tz, tx) => R × T = (0, +1, 0)（严格 +Y 朝上 CCW 绕序）
    const rx = -tz;
    const rz = tx;
    const tuck = Math.min(bankTuckM, pts[i].hw * 0.28);
    const hw = pts[i].hw + tuck;
    const span = hw * 2;
    for (let j = 0; j <= cols; j += 1) {
      const frac = j / cols;
      const off = (frac * 2 - 1) * hw;
      const wx = pts[i].x + rx * off;
      const wz = pts[i].z + rz * off;
      const distBank = Math.min(frac, 1 - frac) * span;
      positions.push(wx, pts[i].y, wz);
      normals.push(0, 1, 0);
      uvs.push(wx * uvScale, wz * uvScale);
      edges.push(Math.min(1.0, distBank / 1.4));
    }
  }

  const stride = cols + 1;
  for (let i = 0; i < count - 1; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      const a = base + i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
}

function AppendRibbonMesh(ribbon, surfaceY, buffers, { across, uvScale, isPond = false }) {
  const count = ribbon?.length || 0;
  if (count < 2) return;
  const { positions, normals, uvs, edges, indices } = buffers;
  const base = positions.length / 3;
  const cols = Math.max(1, across | 0);
  for (let row = 0; row < count; row += 1) {
    const [x, north, south] = ribbon[row];
    const span = Math.abs(south - north);
    const endFactor = isPond ? Math.min(1.0, Math.min(row, count - 1 - row) / 1.5) : 1.0;
    for (let col = 0; col <= cols; col += 1) {
      const t = col / cols;
      const z = north + (south - north) * t;
      const distBank = Math.min(t, 1 - t) * span;
      positions.push(x, surfaceY, z);
      normals.push(0, 1, 0);
      uvs.push(x * uvScale, z * uvScale);
      edges.push(Math.min(1.0, distBank / 1.4) * endFactor);
    }
  }
  const stride = cols + 1;
  for (let row = 1; row < count; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const a = base + (row - 1) * stride + col;
      const b = a + stride;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
}

function AppendSingleBlockMesh(b, buffers, { stepM, uvScale }) {
  const { positions, normals, uvs, edges, indices } = buffers;
  const w = Math.max(0.2, b.w);
  const d = Math.max(0.2, b.d);
  const nx = Math.max(2, Math.min(48, Math.ceil(w / Math.max(0.5, stepM))));
  const nz = Math.max(2, Math.min(48, Math.ceil(d / Math.max(0.5, stepM))));
  const c = Math.cos(b.ry), s = Math.sin(b.ry);
  const base = positions.length / 3;
  for (let iz = 0; iz <= nz; iz += 1) {
    const vz = iz / nz;
    const lz = (vz - 0.5) * d;
    const distZ = Math.min(vz, 1 - vz) * d;
    for (let ix = 0; ix <= nx; ix += 1) {
      const vx = ix / nx;
      const lx = (vx - 0.5) * w;
      const distX = Math.min(vx, 1 - vx) * w;
      const wx = b.x + lx * c + lz * s;
      const wz = b.z - lx * s + lz * c;
      positions.push(wx, b.yTop, wz);
      normals.push(0, 1, 0);
      uvs.push(wx * uvScale, wz * uvScale);
      edges.push(Math.min(1.0, Math.min(distX, distZ) / 1.2));
    }
  }
  const stride = nx + 1;
  for (let iz = 0; iz < nz; iz += 1) {
    for (let ix = 0; ix < nx; ix += 1) {
      const a = base + iz * stride + ix;
      const bIdx = a + 1;
      const cIdx = a + stride;
      const dIdx = cIdx + 1;
      indices.push(a, cIdx, bIdx, bIdx, cIdx, dIdx);
    }
  }
}

/** 将一条显式 waterRibbon（[[x, north, south], ...]）构造成带 aWaterEdge 的连续水面几何。 */
export function BuildWaterRibbonGeometry(ribbon, surfaceY, { across = 12, uvScale = 1.0, isPond = false } = {}) {
  const buffers = { positions: [], normals: [], uvs: [], edges: [], indices: [] };
  AppendRibbonMesh(ribbon, surfaceY, buffers, { across, uvScale, isPond });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute("aWaterEdge", new THREE.Float32BufferAttribute(buffers.edges, 1));
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * 将一批水块 / 场景水物件自动拼接成连续、无缝、无锯齿台阶的平滑水面几何。
 * 同时支持白盒块与场景 JSON 物件、折线弯河（自动合并）、meta.waterRibbon 与独立池塘。
 */
export function BuildContinuousWaterGeometry(items, groundAt = null, {
  stepM = 2.0,
  across = 6,
  uvScale = 1.0,
  bankTuckM = 0.55,
  smoothBlend = 0.5,
  yOffset = 0,
} = {}) {
  const buffers = { positions: [], normals: [], uvs: [], edges: [], indices: [] };
  const rectBlocks = [];
  for (const raw of items || []) {
    const item = NormalizeWaterItem(raw, groundAt);
    if (!item) continue;
    item.yTop += yOffset;
    if (item.ribbon?.length >= 2) {
      const isPond = /^Pond_/.test(item.id);
      AppendRibbonMesh(item.ribbon, item.yTop, buffers, { across: isPond ? Math.min(across, 8) : Math.max(across, 8), uvScale, isPond });
    } else {
      rectBlocks.push(item);
    }
  }

  const { chains, singles } = TraceWaterChains(rectBlocks);
  for (const chain of chains) {
    AppendChainMesh(chain.stations, buffers, { stepM, across, uvScale, bankTuckM, smoothBlend });
  }
  for (const single of singles) {
    AppendSingleBlockMesh(single, buffers, { stepM, uvScale });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(buffers.normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute("aWaterEdge", new THREE.Float32BufferAttribute(buffers.edges, 1));
  geometry.setIndex(buffers.indices);
  geometry.computeBoundingSphere();
  return geometry;
}
