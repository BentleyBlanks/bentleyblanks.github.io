// Data_FirstLevelMissionTerrain.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { FRONT_BREACHES } from "./Data_FirstLevelMissionFront.mjs";
import { MISSION_PONTOON_BRIDGE } from "./Data_FirstLevelMissionTopology.mjs";
import { RiverCutAt, RiverMudAt } from "./Script_FirstLevelMissionTopology.mjs";
import { WhiteboxShapeDistance } from "./Script_FirstLevelWhiteboxTerrain.mjs";
import { TERRAIN_GROUND_SURFACE, TERRAIN_RUTS } from "./Data_Tuning_Terrain.mjs";
import { MISSION_TERRAIN, NATURAL_RAMPS, PATH_EDGE_M, RAIL_BERM_FADE_M, RIVER_MUD_TINT, STUBBLE_CLEAR_M, SampleMissionNaturalHeight, Smooth, TrenchPlanFor, roadBounds, routeBounds } from "./Data_FirstLevelMissionTerrain.mjs";

export function RailBermWeight(z) {
  const [north, south] = MISSION_PONTOON_BRIDGE.railGapZ;
  if (z <= north || z >= south) return 1;
  return 1 - Smooth(Math.min((z - north) / RAIL_BERM_FADE_M, (south - z) / RAIL_BERM_FADE_M));
}

export function MissionPathDistance(point, route) {
  let best = Infinity;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)),
    );
    best = Math.min(best, Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t));
  }
  return best;
}

export function SampleMissionTerrain(x, z, spec = MISSION_TERRAIN) {
  const natural = spec.naturalHeight ? spec.naturalHeight(x, z) : SampleMissionNaturalHeight(x, z);
  let height = natural;
  // 道路与场坪的压平因子同时是抛土堆的掩码：挖出来的土堆在沟沿上是对的，堆到
  // 碾平的路面或场坪上就成了一道谁也解释不了的坎（担架队和大车正从那儿过）。
  let bermMask = 1;
  for (const pad of spec.pads) {
    const d = Math.hypot(
      Math.max(0, Math.abs(x - pad.x) - pad.w / 2),
      Math.max(0, Math.abs(z - pad.z) - pad.d / 2),
    );
    const factor = Smooth(d / 5);
    height *= factor;
    if (factor < bermMask) bermMask = factor;
  }
  for (const road of spec.roads) {
    // Beyond width/2 + 3 m the factor is exactly 1; the box test skips the polyline walk.
    const reach = road.width / 2 + 3, box = RoadBounds(road);
    if (x < box.minX - reach || x > box.maxX + reach || z < box.minZ - reach || z > box.maxZ + reach) continue;
    const d = MissionPathDistance({ x, z }, road.points);
    const factor = 0.15 + 0.85 * Smooth((d - road.width / 2) / 3);
    height = height * factor;
    if (factor < bermMask) bermMask = factor;
  }
  // A continuous rail embankment, never a box pretending to be soil.
  const rail = Math.abs(x + 77);
  height += 0.62 * (1 - Smooth((rail - 2.4) / 4)) * RailBermWeight(z);
  // 开挖并集 + 沟沿抛土：旧的 `for (trench)` 循环搬进了 Script_TrenchPlan.Apply。
  // 挖下去的部分照旧取 min；抬起来的那部分（抛土）乘上面那张掩码。
  const applied = TrenchPlanFor(spec).Apply(x, z, height, natural);
  height = applied > height ? height + (applied - height) * bermMask : applied;
  // Each blend below is exactly zero past its reach; the squared test skips the hypot.
  for (const breach of FRONT_BREACHES) {
    if((x-breach.x)**2+(z-breach.z)**2>=breach.radius**2)continue;
    const blend=1-Smooth(Math.hypot(x-breach.x,z-breach.z)/breach.radius);
    if(blend>0)height=Math.max(height,height+(natural-breach.depth-height)*blend);
  }
  for (const step of spec.steps) {
    if ((x - step.x) ** 2 + (z - step.z) ** 2 >= (step.radius + 1.3) ** 2) continue;
    const d = Math.hypot(x - step.x, z - step.z),
      t = 1 - Smooth((d - step.radius) / 1.3);
    if (t > 0) height = height * (1 - t) + (natural - step.depth) * t;
  }
  // 05–18 白盒局部修饰（土坎/沟/下沉路/台地）。放在河槽之前：河岸以内与浅滩仍由 RiverCutAt 说了算；
  // 放在四处回归缓坡之前：沟口与院口的可走坡不会被修饰抬走。
  if (spec.whiteboxTerrain) height = spec.whiteboxTerrain.Apply(x, z, height, natural);
  // 北沙河。旧写法是一行硬编码（54<x<99 就把地面压到 -1.8 的一条排水沟）；
  // 现在是数据驱动的东西贯穿河槽，断面按 x 插值（浅滩），口径在
  // Data_FirstLevelMissionTopology.MISSION_NORTH_RIVER。取 min 而不是相减：
  // 路面/场坪/铁路路基先算完，河槽直接把它们切掉 —— 桥归桥、地形归地形。
  for (const river of spec.rivers || []) {
    const cut = RiverCutAt(x, z, river);
    if (cut > 0) height = Math.min(height, natural - cut);
  }
  for (const point of NATURAL_RAMPS) {
    if ((x - point.x) ** 2 + (z - point.z) ** 2 >= 81) continue;
    const distance = Math.hypot(x - point.x, z - point.z);
    const blend = 1 - Smooth(distance / 9);
    height = height * (1 - blend) + natural * blend;
  }
  return height;
}

function RoadBounds(road) {
  let box = roadBounds.get(road);
  if (!box) {
    box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of road.points) {
      box.minX = Math.min(box.minX, p.x); box.maxX = Math.max(box.maxX, p.x);
      box.minZ = Math.min(box.minZ, p.z); box.maxZ = Math.max(box.maxZ, p.z);
    }
    roadBounds.set(road, box);
  }
  return box;
}

function RouteBounds(route) {
  let bounds = routeBounds.get(route);
  if (!bounds) {
    bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const p of route) {
      if (p.x < bounds.minX) bounds.minX = p.x;
      if (p.x > bounds.maxX) bounds.maxX = p.x;
      if (p.z < bounds.minZ) bounds.minZ = p.z;
      if (p.z > bounds.maxZ) bounds.maxZ = p.z;
    }
    routeBounds.set(route, bounds);
  }
  return bounds;
}

/**
 * Distance from (x, z) to a polyline, or Infinity once it is farther than
 * `reach` — the blends below are exactly zero beyond their own reach, so the
 * early-out never changes a colour. Segment rejection is a box test; the one
 * square root is taken at the end.
 */
function RouteDistanceWithin(x, z, route, reach) {
  const bounds = RouteBounds(route);
  if (x < bounds.minX - reach || x > bounds.maxX + reach
    || z < bounds.minZ - reach || z > bounds.maxZ + reach) return Infinity;
  let best = reach * reach;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const loX = a.x < b.x ? a.x : b.x, hiX = a.x < b.x ? b.x : a.x;
    if (x < loX - reach || x > hiX + reach) continue;
    const loZ = a.z < b.z ? a.z : b.z, hiZ = a.z < b.z ? b.z : a.z;
    if (z < loZ - reach || z > hiZ + reach) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - a.x - dx * t, ez = z - a.z - dz * t, d2 = ex * ex + ez * ez;
    if (d2 < best) best = d2;
  }
  return best < reach * reach ? Math.sqrt(best) : Infinity;
}

export function SampleMissionGroundColor(x, z, out = [0, 0, 0]) {
  const variation=.94+.06*Math.sin(x*.37)*Math.sin(z*.29);
  // Mild albedo multipliers: preserve generated soil detail without double-darkening.
  let r=.91*variation, g=.94*variation, b=.87*variation;
  for(const road of MISSION_TERRAIN.roads) {
    const d=RouteDistanceWithin(x,z,road.points,road.width/2+1.8);
    if(d===Infinity)continue;
    const t=1-Smooth((d-road.width/2)/1.8);
    r+=(1-r)*t; g+=(.97-g)*t; b+=(.90-b)*t;
  }
  // 白盒小路（Data_FirstLevelWhiteboxTerrain 各区 paths）：只染色不改高度，踩实程度 wear 打折。
  for(const path of MISSION_TERRAIN.whiteboxTerrain?.paths || []) {
    const d=RouteDistanceWithin(x,z,path.points,path.width/2+PATH_EDGE_M);
    if(d===Infinity)continue;
    const t=(1-Smooth((d-path.width/2)/PATH_EDGE_M))*path.wear;
    r+=(1-r)*t; g+=(.97-g)*t; b+=(.90-b)*t;
  }
  for(const pad of MISSION_TERRAIN.pads) {
    const ex=Math.abs(x-pad.x)-pad.w/2, ez=Math.abs(z-pad.z)-pad.d/2;
    if(ex>=3||ez>=3)continue;
    const dx=ex>0?ex:0, dz=ez>0?ez:0, d=Math.sqrt(dx*dx+dz*dz);
    const t=.75*(1-Smooth(d/3));
    if(t<=0)continue;
    r+=(1-r)*t; g+=(.97-g)*t; b+=(.90-b)*t;
  }
  // 壕沟走廊：一次 Apply(x,z,0,0) 同时给两个答案 —— 负数是开挖深度，正数是沟沿
  // 抛土高度，空地上是 0（分桶网格里那一格没有边，直接返回）。旧写法是逐条走 7
  // 条折线，这里只碰落在同一格里的几条边，比旧的还省。
  const soil=TrenchPlanFor(MISSION_TERRAIN).Apply(x,z,0,0);
  if(soil<0) {
    const t=-soil/2;
    r+=(.83-r)*t; g+=(.80-g)*t; b+=(.75-b)*t;
  } else if(soil>0) {
    // 新翻出来的土比原地皮干一点、浅一点；抛土堆最高 0.42 m，别调过头。
    const t=.5*(soil<.4?soil/.4:1);
    r+=(.98-r)*t; g+=(.96-g)*t; b+=(.88-b)*t;
  }
  const rail=Math.abs(x+77);
  const railT=(1-Smooth((rail-2.4)/1.5))*RailBermWeight(z);
  if(railT>0){ r+=(.43-r)*railT; g+=(.44-g)*railT; b+=(.41-b)*railT; }
  const mud=RiverMudAt(x,z);
  if(mud>0){ r+=(RIVER_MUD_TINT[0]*r-r)*mud; g+=(RIVER_MUD_TINT[1]*g-g)*mud; b+=(RIVER_MUD_TINT[2]*b-b)*mud; }
  out[0]=r; out[1]=g; out[2]=b;
  return out;
}

/**
 * 带符号的「离折线多远」：正负号 = 在最近那段的左/右（叉积）。`reach` 以外返回 null。
 * 车辙用它当横向坐标（Data_Tuning_Terrain.TERRAIN_RUTS）；在一段直线上它对位置是线性的，
 * 所以写进顶点、由光栅化插值是精确的。
 */
function RouteSignedDistanceWithin(x, z, route, reach) {
  const bounds = RouteBounds(route);
  if (x < bounds.minX - reach || x > bounds.maxX + reach
    || z < bounds.minZ - reach || z > bounds.maxZ + reach) return null;
  let best = reach * reach, signed = null;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i];
    const dx = b.x - a.x, dz = b.z - a.z;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - a.x - dx * t, ez = z - a.z - dz * t, d2 = ex * ex + ez * ez;
    if (d2 < best) {
      best = d2;
      const side = dx * (z - a.z) - dz * (x - a.x);
      signed = side < 0 ? -Math.sqrt(d2) : Math.sqrt(d2);
    }
  }
  return signed;
}

// 白盒地形修饰（Data_FirstLevelWhiteboxTerrain）怎么落到地表图层上：够陡的土壁铺裸土，窄而深的
// 折线 cut 是交通沟（沟底也铺裸土），下沉的 level 洼地是踩实的场地。编译一次（形状表是冻结的）。
let whiteboxSurfaceShapes = null;

function WhiteboxSurfaceShapes() {
  if (whiteboxSurfaceShapes) return whiteboxSurfaceShapes;
  const G = TERRAIN_GROUND_SURFACE;
  whiteboxSurfaceShapes = [];
  for (const entry of MISSION_TERRAIN.whiteboxTerrain?.shapes || []) {
    const shape = entry.shape;
    const dys = [shape.dy ?? 0, ...(shape.points || []).map((p) => p.dy ?? shape.dy ?? 0)];
    const dyMax = Math.max(...dys.map(Math.abs));
    const steep = 1.5 * dyMax / Math.max(shape.feather, 1e-3);
    const wall = dyMax >= G.wallMinDyM && steep > G.wallSlope[0];
    const trench = wall && shape.op === "cut" && shape.kind === "line" && shape.halfW <= G.trenchHalfWM;
    const hollow = shape.op === "level" && (shape.dy ?? 0) <= G.hollowDyM;
    if (!wall && !hollow) continue;
    const reach = shape.feather + G.wallFadeM + (trench ? G.trenchSpillM : 0);
    const b = entry.clips.reduce((acc, c) => ({ minX: Math.min(acc.minX, c.minX), maxX: Math.max(acc.maxX, c.maxX),
      minZ: Math.min(acc.minZ, c.minZ), maxZ: Math.max(acc.maxZ, c.maxZ) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    whiteboxSurfaceShapes.push({ shape, clips: entry.clips, wall, trench, hollow, reach, b });
  }
  // 整组外接框（含 reach）：地块大半在框外，一次比较就跳过整圈形状。
  whiteboxSurfaceShapes.bounds = whiteboxSurfaceShapes.reduce((acc, s) => ({
    minX: Math.min(acc.minX, s.b.minX - s.reach), maxX: Math.max(acc.maxX, s.b.maxX + s.reach),
    minZ: Math.min(acc.minZ, s.b.minZ - s.reach), maxZ: Math.max(acc.maxZ, s.b.maxZ + s.reach),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  return whiteboxSurfaceShapes;
}

export function SampleMissionGroundSurface(x, z, color = [0, 0, 0], layers = [0, 0, 0, 1], spec = MISSION_TERRAIN) {
  let track = 0, spoil = 0, worked = 0, rut = 1, rutDist = Infinity, padTrack = 0, padNoRuts = 0;
  const rutRange = TERRAIN_RUTS.encodeRangeM;
  for (const road of spec.roads) {
    const d = RouteDistanceWithin(x, z, road.points, road.width / 2 + STUBBLE_CLEAR_M);
    if (d === Infinity) continue;
    const t = 1 - Smooth((d - road.width / 2) / 1.8);
    if (t > track) track = t;
    const w = 1 - Smooth((d - road.width / 2) / STUBBLE_CLEAR_M);
    if (w > worked) worked = w;
    if (road.ruts !== false && d < rutDist && d < rutRange) {
      const s = RouteSignedDistanceWithin(x, z, road.points, rutRange);
      if (s !== null) { rutDist = d; rut = Math.max(-1, Math.min(1, s / rutRange)); }
    }
  }
  // 白盒小路（各区 paths，docs/Data_FirstLevelGuidance20260928.md §3）：踩出来的路只进纹理层，
  // 路面权重按 wear 打折，麦茬照旧退让 3.5 m —— 高度采样不读它（SampleMissionTerrain 逐位不变）。
  for (const path of spec.whiteboxTerrain?.paths || []) {
    const d = RouteDistanceWithin(x, z, path.points, path.width / 2 + STUBBLE_CLEAR_M);
    if (d === Infinity) continue;
    const t = (1 - Smooth((d - path.width / 2) / PATH_EDGE_M)) * path.wear;
    if (t > track) track = t;
    const w = 1 - Smooth((d - path.width / 2) / STUBBLE_CLEAR_M);
    if (w > worked) worked = w;
  }
  for (const pad of spec.pads) {
    const ex = Math.abs(x - pad.x) - pad.w / 2, ez = Math.abs(z - pad.z) - pad.d / 2;
    if (ex >= STUBBLE_CLEAR_M || ez >= STUBBLE_CLEAR_M) continue;
    const dx = ex > 0 ? ex : 0, dz = ez > 0 ? ez : 0, d = Math.sqrt(dx * dx + dz * dz);
    const t = 1 - Smooth(d / 3);
    if (t > track) track = t;
    if (t > padTrack) padTrack = t;
    if (pad.ruts === false && t > padNoRuts) padNoRuts = t;
    const w = 1 - Smooth(d / STUBBLE_CLEAR_M);
    if (w > worked) worked = w;
  }
  // 车辙穿不过 ruts:false 的场坪：把横向坐标推到车辙之外（1 = 离中线 encodeRangeM 米），在场坪边上渐变。
  if (padNoRuts > 0 && rut < 1) rut = rut + ((rut < 0 ? -1 : 1) - rut) * padNoRuts;
  // 壕沟翻土层跟着样条计划的**实际**沟沿走（带噪声的 halfFloor / bank，分桶网格只碰
  // 同一格里的边），沿沟沿再多铺 0.8 m —— 挖出来的土就堆在唇上。Corridor 的可见范围
  // 到坡顶外 bermW 为止，够这一层用；麦茬的 3.5 m 退让带比它远，照旧按标称折线量。
  const corridor = TrenchPlanFor(spec).Corridor(x, z);
  if (corridor) {
    const spoilWidth = spec.trenchNetwork?.earthProfile ? corridor.bermWidth : .8;
    const t = 1 - Smooth((corridor.d - corridor.halfFloor - corridor.bank * 0.5) / (corridor.bank * 0.5 + spoilWidth));
    if (t > spoil) spoil = t;
  }
  for (const trench of spec.trenches) {
    const d = RouteDistanceWithin(x, z, trench.points, trench.bottom / 2 + trench.bank + STUBBLE_CLEAR_M);
    if (d === Infinity) continue;
    const w = 1 - Smooth((d - trench.bottom / 2) / (trench.bank + STUBBLE_CLEAR_M));
    if (w > worked) worked = w;
  }
  const G = TERRAIN_GROUND_SURFACE;
  // 壕沟真的切断了路/场坪：沟底与沟壁不画路面（shader 里翻土层让位给车道，见 Script_TrenchSurfaceMaterial）。
  if (track > 0) {
    const dig = -TrenchPlanFor(spec).Apply(x, z, 0, 0);
    if (dig > G.digTrackM[0]) track *= 1 - Smooth((dig - G.digTrackM[0]) / (G.digTrackM[1] - G.digTrackM[0]));
  }
  // 白盒地形修饰：陡土壁 / 交通沟 → 裸土；下沉洼地的底 → 踩实的场地（车道层），把穿进来的壕沟翻土盖掉。
  const shapes = WhiteboxSurfaceShapes(), sb = shapes.bounds;
  for (const item of x < sb.minX || x > sb.maxX || z < sb.minZ || z > sb.maxZ ? [] : shapes) {
    const b = item.b, reach = item.reach;
    if (x < b.minX - reach || x > b.maxX + reach || z < b.minZ - reach || z > b.maxZ + reach) continue;
    if (!item.clips.some((c) => x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ)) continue;
    const shape = item.shape, { d, dy } = WhiteboxShapeDistance(shape, x, z);
    if (d > reach) continue;
    const f = shape.feather;
    if (item.hollow) {
      const yard = Smooth(-d / G.hollowEdgeM);
      if (yard > 0) {
        if (yard > track) track = yard;
        if (yard > worked) worked = yard;
        spoil *= 1 - yard;
      }
    }
    if (item.wall) {
      const steep = 1.5 * Math.abs(dy) / Math.max(f, 1e-3);
      const s = Smooth((steep - G.wallSlope[0]) / (G.wallSlope[1] - G.wallSlope[0]));
      let band = s * (1 - Smooth((Math.abs(d - f / 2) - f / 2) / G.wallFadeM));
      // 交通沟：沟底（核心）与沟外抛土一带也是裸土。
      if (item.trench) band = Math.max(band, s * (1 - Smooth((d - f) / (G.wallFadeM + G.trenchSpillM))));
      if (band > 0) {
        if (band > spoil) spoil = band;
        if (band > worked) worked = band;
        track *= 1 - band;
      }
    }
  }
  const rail = Math.abs(x + 77);
  const bermK = RailBermWeight(z);
  const railT = (1 - Smooth((rail - 2.4) / 1.5)) * bermK;
  const railNear = (1 - Smooth((rail - 2.4) / STUBBLE_CLEAR_M)) * bermK;
  if (railNear > worked) worked = railNear;
  let r = 1, g = 1, b = 1;
  if (railT > 0) { r += (.43 - r) * railT; g += (.44 - g) * railT; b += (.41 - b) * railT; }
  // 拓宽河段两岸的烂泥滩：翻土层（裸土）铺满、麦茬退让、顶点色压暗（RIVER_MUD_TINT）。路面（小路 / 踩道）仍盖在上面。
  const mud = RiverMudAt(x, z);
  if (mud > 0) {
    if (mud * 0.92 > spoil) spoil = mud * 0.92;
    if (mud > worked) worked = mud;
    r += (RIVER_MUD_TINT[0] - 1) * mud; g += (RIVER_MUD_TINT[1] - 1) * mud; b += (RIVER_MUD_TINT[2] - 1) * mud;
  }
  color[0] = r; color[1] = g; color[2] = b;
  layers[0] = track; layers[1] = spoil; layers[2] = 1 - worked; layers[3] = rut;
  return color;
}
