// 场景里的样条空气墙（docs/Data_Scene.md §10）：场景文件 airWalls 一节用折线 / 圆角样条声明玩家阻挡边界与阶段门禁，
// 运行时与编辑器编译展开为标准 tag:"airWall"、visual:false 的 OBB 体块，零侵入复用 Rapier IG_AIR_WALL 物理与 2D/3D 预览。
//
// 纯模块：零 three、零 DOM，Node 与浏览器共用。

export const SCENE_AIR_WALL_KEYS = Object.freeze([
  "id", "points", "closed", "height", "thickness", "overlap", "cornerRadiusM",
  "maxSegmentM", "maxReliefM", "y", "embedM", "noClimb", "group", "hideOn", "showOn", "note",
]);

export const AIR_WALL_DEFAULTS = Object.freeze({
  closed: false,
  height: 6,
  thickness: 0.4,
  cornerRadiusM: 0,
  maxSegmentM: 0,
  maxReliefM: 0,
  y: null,
  embedM: 0.5,
  noClimb: true,
  group: "空气墙",
});

const AIR_WALL_NUMBERS = Object.freeze({
  height: [0.2, 50],
  thickness: [0.05, 10],
  overlap: [0, 5],
  cornerRadiusM: [0, 25],
  maxSegmentM: [0, 500],
  maxReliefM: [0, 20],
  embedM: [0, 10],
});

const ID_RE = /^[A-Za-z0-9_]+$/;
const ID_MAX = 96;
const GROUP_MAX = 120;
const MIN_EDGE_M = 0.05;
const RAD_TO_DEG = 180 / Math.PI;

const IsObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const Finite = (v) => typeof v === "number" && Number.isFinite(v);
const NonEmpty = (v) => typeof v === "string" && v.length > 0;
const Fix = (v, digits = 4) => Number(v.toFixed(digits));

/** 判断一个场景物件是不是空气墙（兼容手摆物件与样条编译物件）。 */
export function IsAirWallObject(obj) {
  return Boolean(obj && (obj.tag === "airWall" || obj.material === "Whitebox/AirWall" || /空气墙/.test(obj.group || "")));
}

/** 样条空气墙的分组（缺省「空气墙」）。 */
export function AirWallGroup(spline) {
  return spline?.group || AIR_WALL_DEFAULTS.group;
}

// ---------------------------------------------------------------------------
// 校验

/** airWalls 一节的写法问题，推进 errors。existingObjectIds 可选（检查与 objects.id 重名）。 */
export function SceneAirWallIssues(airWalls, errors, existingObjectIds = null, at = "airWalls") {
  if (!Array.isArray(airWalls)) { errors.push(`${at} 要是数组`); return; }
  const ids = new Set();
  airWalls.forEach((wall, i) => {
    const wat = `${at}[${i}]`;
    if (!IsObject(wall)) { errors.push(`${wat} 要是对象`); return; }
    if (!NonEmpty(wall.id) || wall.id.length > ID_MAX || !ID_RE.test(wall.id)) {
      errors.push(`${wat}.id 要是 1–${ID_MAX} 字的字母数字下划线`);
    } else if (ids.has(wall.id)) {
      errors.push(`${wat}.id 重复：${wall.id}`);
    } else if (existingObjectIds && existingObjectIds.has(wall.id)) {
      errors.push(`${wat}.id 与 objects 重名：${wall.id}`);
    } else {
      ids.add(wall.id);
    }
    if (wall.closed !== undefined && typeof wall.closed !== "boolean") errors.push(`${wat}.closed 要是 true / false`);
    if (wall.noClimb !== undefined && typeof wall.noClimb !== "boolean") errors.push(`${wat}.noClimb 要是 true / false`);
    const minPts = wall.closed === true ? 3 : 2;
    if (!Array.isArray(wall.points) || wall.points.length < minPts
      || !wall.points.every((p) => Array.isArray(p) && p.length === 2 && Finite(p[0]) && Finite(p[1]))) {
      errors.push(`${wat}.points 要是至少 ${minPts} 个 [x, z]`);
    }
    if (wall.y !== undefined && wall.y !== null && !Finite(wall.y)) errors.push(`${wat}.y 要是有限数字或 null`);
    for (const [k, [lo, hi]] of Object.entries(AIR_WALL_NUMBERS)) {
      if (wall[k] !== undefined && !(Finite(wall[k]) && wall[k] >= lo && wall[k] <= hi)) {
        errors.push(`${wat}.${k} 要是 ${lo}…${hi} 的数`);
      }
    }
    if (wall.group !== undefined && !(typeof wall.group === "string" && wall.group.length <= GROUP_MAX)) {
      errors.push(`${wat}.group 要是至多 ${GROUP_MAX} 字的字符串`);
    }
    if (wall.hideOn !== undefined && !NonEmpty(wall.hideOn)) errors.push(`${wat}.hideOn 要是信号名`);
    if (wall.showOn !== undefined && !NonEmpty(wall.showOn)) errors.push(`${wat}.showOn 要是信号名`);
    if (wall.note !== undefined && typeof wall.note !== "string") errors.push(`${wat}.note 要是字符串`);
    for (const k of Object.keys(wall)) {
      if (!SCENE_AIR_WALL_KEYS.includes(k)) errors.push(`${wat} 不认识的字段 ${k}`);
    }
  });
}

// ---------------------------------------------------------------------------
// 折线采样（可选拐角倒圆）

function FilletCorner(prev, curr, next, radiusM) {
  const ux = prev[0] - curr[0], uz = prev[1] - curr[1];
  const vx = next[0] - curr[0], vz = next[1] - curr[1];
  const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
  if (lu < MIN_EDGE_M || lv < MIN_EDGE_M) return [curr];
  const dux = ux / lu, duz = uz / lu, dvx = vx / lv, dvz = vz / lv;
  const dot = Math.max(-1, Math.min(1, dux * dvx + duz * dvz));
  const angle = Math.acos(dot);
  // 几乎共线或 180° 折返不倒圆
  if (angle < 0.08 || Math.abs(Math.PI - angle) < 0.05) return [curr];
  const halfAngle = angle / 2;
  const maxTrim = Math.min(lu, lv) * 0.4;
  const desiredTrim = radiusM / Math.tan(halfAngle);
  const trim = Math.min(desiredTrim, maxTrim);
  const actualR = trim * Math.tan(halfAngle);
  if (actualR < 0.1 || trim < 0.05) return [curr];
  const t1 = [curr[0] + dux * trim, curr[1] + duz * trim];
  const t2 = [curr[0] + dvx * trim, curr[1] + dvz * trim];
  const bx = dux + dvx, bz = duz + dvz;
  const bl = Math.hypot(bx, bz);
  if (bl < 1e-6) return [curr];
  const centerDist = actualR / Math.sin(halfAngle);
  const cx = curr[0] + (bx / bl) * centerDist;
  const cz = curr[1] + (bz / bl) * centerDist;
  const a1 = Math.atan2(t1[1] - cz, t1[0] - cx);
  let delta = Math.atan2(t2[1] - cz, t2[0] - cx) - a1;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const arcLen = Math.abs(delta) * actualR;
  const steps = Math.max(2, Math.min(12, Math.ceil(arcLen / 1.5)));
  const out = [];
  for (let s = 0; s <= steps; s++) {
    const a = a1 + (delta * s) / steps;
    out.push([cx + Math.cos(a) * actualR, cz + Math.sin(a) * actualR]);
  }
  return out;
}

/** 控制点 → 采样后的折线顶点（closed 与 cornerRadiusM 生效）。 */
export function SampleAirWallPath(spline) {
  const raw = spline?.points || [];
  if (raw.length < 2) return [];
  const closed = spline.closed === true && raw.length >= 3;
  const radius = Finite(spline.cornerRadiusM) && spline.cornerRadiusM > 0 ? spline.cornerRadiusM : 0;
  if (radius <= 0) return raw.map(([x, z]) => [x, z]);
  const n = raw.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) {
      out.push([raw[i][0], raw[i][1]]);
      continue;
    }
    const prev = raw[(i - 1 + n) % n];
    const curr = raw[i];
    const next = raw[(i + 1) % n];
    for (const pt of FilletCorner(prev, curr, next, radius)) out.push(pt);
  }
  return out;
}

/** 样条空气墙的水平包围盒。 */
export function AirWallBounds(spline) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const pad = (Finite(spline?.thickness) ? spline.thickness : AIR_WALL_DEFAULTS.thickness) * 0.5;
  for (const pt of spline?.points || []) {
    minX = Math.min(minX, pt[0] - pad); maxX = Math.max(maxX, pt[0] + pad);
    minZ = Math.min(minZ, pt[1] - pad); maxZ = Math.max(maxZ, pt[1] + pad);
  }
  return Number.isFinite(minX) ? { minX, maxX, minZ, maxZ } : null;
}

// ---------------------------------------------------------------------------
// 编译：样条 → 标准 Whitebox/AirWall OBB 场景物件

function SubdivideEdge(a, b, { maxSegmentM, maxReliefM, groundAt, fixedY }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < MIN_EDGE_M) return [];
  let parts = 1;
  if (maxSegmentM > 0 && len > maxSegmentM) {
    parts = Math.max(parts, Math.ceil(len / maxSegmentM));
  } else if (groundAt && !fixedY && maxReliefM > 0 && len > 8) {
    const probes = Math.max(3, Math.ceil(len / 4));
    let minG = Infinity, maxG = -Infinity;
    for (let k = 0; k <= probes; k++) {
      const t = k / probes;
      const g = groundAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      if (g < minG) minG = g;
      if (g > maxG) maxG = g;
    }
    if (maxG - minG > maxReliefM) {
      const targetLen = Math.max(6, Math.min(12, len / Math.ceil((maxG - minG) / maxReliefM)));
      parts = Math.max(parts, Math.ceil(len / targetLen));
    }
  }
  if (parts <= 1) return [[a, b]];
  const out = [];
  for (let i = 0; i < parts; i++) {
    const t0 = i / parts, t1 = (i + 1) / parts;
    out.push([
      [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
      [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1],
    ]);
  }
  return out;
}

/**
 * 单条样条空气墙 → 一组标准场景物件（asset:"Whitebox/Box", material:"Whitebox/AirWall", visual:false, tag:"airWall"）。
 * - 提供 groundAt 且样条未指定固定 y 时：按段内地形最低点下埋 embedM，且顶高不低于段内最高地面 + height，避免坡地悬空或露顶；
 * - 拐角与分段处自动沿切向延长 overlap（缺省 = thickness），保证首尾咬合零缝隙。
 */
export function CompileAirWallSpline(spline, { groundAt = null } = {}) {
  const path = SampleAirWallPath(spline);
  if (path.length < 2) return [];
  const closed = spline.closed === true && spline.points.length >= 3;
  const height = Finite(spline.height) ? spline.height : AIR_WALL_DEFAULTS.height;
  const thickness = Finite(spline.thickness) ? spline.thickness : AIR_WALL_DEFAULTS.thickness;
  const overlap = Finite(spline.overlap) ? spline.overlap : thickness;
  const maxSegmentM = Finite(spline.maxSegmentM) ? spline.maxSegmentM : AIR_WALL_DEFAULTS.maxSegmentM;
  const maxReliefM = Finite(spline.maxReliefM) ? spline.maxReliefM : AIR_WALL_DEFAULTS.maxReliefM;
  const embedM = Finite(spline.embedM) ? spline.embedM : AIR_WALL_DEFAULTS.embedM;
  const fixedY = Finite(spline.y);
  const noClimb = spline.noClimb !== false;
  const group = AirWallGroup(spline);

  const subEdges = [];
  const edgeCount = closed ? path.length : path.length - 1;
  for (let i = 0; i < edgeCount; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    for (const seg of SubdivideEdge(a, b, { maxSegmentM, maxReliefM, groundAt, fixedY })) {
      subEdges.push(seg);
    }
  }
  if (!subEdges.length) return [];

  const total = subEdges.length;
  const padWidth = total >= 100 ? 3 : 2;
  return subEdges.map(([p0, p1], idx) => {
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
    const len = Math.hypot(dx, dz);
    const cx = Fix((p0[0] + p1[0]) / 2);
    const cz = Fix((p0[1] + p1[1]) / 2);
    const rawYaw = Fix(-Math.atan2(dz, dx) * RAD_TO_DEG);
    const yawDeg = Object.is(rawYaw, -0) ? 0 : rawYaw;
    let posY = fixedY ? spline.y : null;
    let segH = height;
    if (!fixedY && groundAt) {
      const probes = Math.max(4, Math.ceil(len / 4));
      let minG = Infinity, maxG = -Infinity;
      for (let k = 0; k <= probes; k++) {
        const t = k / probes;
        const g = groundAt(p0[0] + dx * t, p0[1] + dz * t);
        if (g < minG) minG = g;
        if (g > maxG) maxG = g;
      }
      posY = Fix(minG - embedM, 3);
      segH = Fix(Math.max(height, (maxG - posY) + height), 3);
    }
    const id = total === 1 ? spline.id : `${spline.id}_${String(idx + 1).padStart(padWidth, "0")}`;
    return {
      id,
      asset: "Whitebox/Box",
      material: "Whitebox/AirWall",
      pos: [cx, posY, cz],
      ...(yawDeg !== 0 ? { yawDeg } : {}),
      size: [Fix(len + overlap), segH, thickness],
      visual: false,
      ...(noClimb ? { noClimb: true } : {}),
      tag: "airWall",
      group,
      ...(spline.hideOn ? { hideOn: spline.hideOn } : {}),
      ...(spline.showOn ? { showOn: spline.showOn } : {}),
      meta: { airWallSpline: spline.id, segmentIndex: idx },
    };
  });
}

/** 场景 airWalls 数组 → 全部编译后的标准空气墙物件数组。 */
export function CompileSceneAirWalls(airWalls, options = {}) {
  if (!Array.isArray(airWalls) || !airWalls.length) return [];
  const out = [];
  for (const spline of airWalls) {
    for (const obj of CompileAirWallSpline(spline, options)) out.push(obj);
  }
  return out;
}

/** 收集场景的全部空气墙物件（兼容保留在 objects 里的旧手摆块 + airWalls 样条编译结果）。 */
export function SceneAirWallObjects(doc, options = {}) {
  const legacy = (doc?.objects || []).filter((obj) => obj.layer !== "backdrop" && IsAirWallObject(obj));
  const compiled = CompileSceneAirWalls(doc?.airWalls, options);
  return compiled.length ? [...legacy, ...compiled] : legacy;
}
