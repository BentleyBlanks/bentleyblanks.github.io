// 样条围墙生成器：寨墙 / 坝墙 / 干垒石墙 / 村院墙共用的**唯一**一份沿线布墙代码。
//
// 摆位计划在 Script_WallPlan（纯数学，Node 可测）；本文件负责三件事：
//   1. 按风格烘 variants 份「墙段模块」几何（顶檐各不相同，taper/护坡土按风格）
//   2. 把计划里的模块按「变体 × 分区」分桶成 InstancedMesh 的矩阵表 + 逐实例色
//   3. 碰撞盒 / 掩体点照旧走 BuildSink（碰撞不实例化 —— AI/破坏/命中读的是 OBB 表）
//
// ## 为什么是 InstancedMesh 而不是继续 MergeGeometries
// 一条 660 m 的坝墙合并出 ~220 段独立盒子几何（约 5 万顶点、全部常驻显存），
// 而它本质是同一个模块的 220 次摆放。实例化后顶点只有 variants 份模块自己的，
// 每份一次 draw（× 分区数），矩阵表 16 float/段。仓库先例：沙包/瓦砾
// （Script_TengxianCity.FlushProps）、布设 PropBatch、人物 ActorBatch。
//
// ## 与光照/管线的契约（改材质注入的人注意）
// 实例化网格吃 GI 的唯一保证是 Script_Materials.InjectIndirectLighting 里
// USE_INSTANCING 分支重算的 vGiWorldPos —— 本文件只用 library 出的共享材质，
// 不许另配自定义材质。逐实例色走 instanceColor（r185 下 instanceColor 自动
// 定义 USE_COLOR，材质不用开 vertexColors）。
//
// ## 已知让步
// 实例化材质不吃破口 OBB 裁切（那是 library.Static 合并网格的通道）。
// 围墙类 tag（zhaiWall / villageStoneWall / villageCourtyard）的运行时破坏
// 当前本来就关着（Data_Destruction.GAMEPLAY_DESTRUCTION_ENABLED = false），
// 破坏预览编辑器里凿这些墙会只掉碰撞不掉画面 —— 账记在 docs/Data_WallSpline.md。

import * as THREE from "three";
import {
  MakeBox, MergeGeometries, MakeInstanced, TILE_METERS, BRICK_UV_GRID,
} from "./Script_Geo.mjs";
import { Mulberry32, HashString } from "./Script_Noise.mjs";
import { PlanWallRoute } from "./Script_WallPlan.mjs";

export { PlanWallRoute };

// ---------------------------------------------------------------------------
// 风格表：几何侧的差异全在这里（规划侧的数值差异由调用方传参）
// ---------------------------------------------------------------------------

const WALL_STYLES = {
  // 夯土寨墙/坝墙：断面收分（顶窄底宽）、墙脚一条护坡土裙（把逐段采地的缝盖住）
  rammedEarth: { tile: TILE_METERS.adobe, grid: null, taper: true, foot: true, crest: 0.06 },
  // 干垒石墙：不收分、顶更参差、无护坡
  dryStone: { tile: TILE_METERS.stone, grid: null, taper: false, foot: false, crest: 0.11 },
  // 村院土坯墙：薄板、顶微参差
  yardAdobe: { tile: TILE_METERS.adobe, grid: null, taper: false, foot: false, crest: 0.035 },
  // 村院砖墙：同上，砖 UV 错缝
  yardBrick: { tile: TILE_METERS.brick, grid: BRICK_UV_GRID, taper: false, foot: false, crest: 0.03 },
};

/**
 * 烘一份墙段模块几何（局部原点在模块几何中心，长轴 = +x）。
 * 顶部四角按变体种子各自抬压：模块级的「顶不平」；相邻实例又各挑变体，
 * 一条墙的天际线就不再是一根直线。
 */
function MakeWallModuleGeometry(styleKey, variant, {
  moduleLen, height, topWidth, baseWidth,
}, seed) {
  const style = WALL_STYLES[styleKey];
  if (!style) throw new Error(`未知墙体风格 ${styleKey}`);
  const rnd = Mulberry32(HashString(`${seed}:geo${variant}`));
  const body = MakeBox(moduleLen, height, baseWidth, style.tile,
    `${seed}:v${variant}`, style.grid);
  const position = body.attributes.position;
  const topScale = style.taper ? Math.max(0.2, topWidth / baseWidth) : 1;
  // 顶四角位移：按 (signX, signZ) 归到同一角，保证共享角的三个面同步动
  const cornerDy = {};
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      cornerDy[`${sx}${sz}`] = (rnd() - 0.5) * 2 * style.crest * height;
    }
  }
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) < height / 2 - 1e-4) continue;
    const key = `${Math.sign(position.getX(i)) || 1}${Math.sign(position.getZ(i)) || 1}`;
    position.setY(i, position.getY(i) + cornerDy[key]);
    if (topScale !== 1) position.setZ(i, position.getZ(i) * topScale);
  }
  body.computeVertexNormals();
  if (!style.foot) {
    body.computeBoundingSphere();
    return body;
  }
  // 护坡土：夯土圩子不是一块立起来的板，脚下总堆着塌下来的土（坝墙实拍的账）
  const footW = baseWidth * (1.7 + rnd() * 0.5);
  const foot = MakeBox(moduleLen * 1.05, 0.9, footW, style.tile, `${seed}:f${variant}`);
  foot.translate(0, -height / 2 + 0.36, 0);
  const merged = MergeGeometries([body, foot]);
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------
// 建造
// ---------------------------------------------------------------------------

/**
 * 沿样条建一条围墙。规划参数见 Script_WallPlan.PlanWallRoute；本层追加：
 *
 * @param sink BuildSink（真的，编辑器传替身也行：要有 Solid/Cover/props）
 * @param {object} opts
 *   style      WALL_STYLES 键
 *   material   材质桶名（ZhaiEarth / DryStone / Adobe / HouseBrick…）
 *   tag        碰撞 tag（zhaiWall / villageStoneWall / villageCourtyard…）
 *   name       实例化网格名前缀（排查 draw call 时认得出是谁）
 *   sectorKey  (x,z)=>string 分区键 —— 每分区一只 InstancedMesh，视锥剔除不失效
 *   castShadow 默认 true
 *
 * 实例化桶不直接进 scene（本层拿不到 scene），推进 sink.props
 * （kind:"wallInstances"），由宿主收尾时调 FlushWallInstances 变成网格 ——
 * 与 sandbags/breachSpill 走 FlushProps 同一条通道。
 *
 * @returns {{ stats, fallenRuns }}
 */
export function BuildWallSpline(sink, opts) {
  const {
    style = "rammedEarth", material, tag = "wall", name = "WallSpline",
    sectorKey = null, castShadow = true, ...planOpts
  } = opts;
  const plan = PlanWallRoute(planOpts);
  const variants = planOpts.variants ?? 4;
  const nominal = plan.nominal;
  // 几何变体按「风格×材质×尺寸」在 sink 级共享 —— 三十个村院各烘一套变体会
  // 变成一百多只小实例网格，实例化的意义（同几何大批矩阵）就没了。共享后
  // 逐院的差异全靠逐模块随机（高度/姿态/tint/变体挑选），这正是实例化的用法。
  // 缓存挂在 sink 上：几何生命周期 = 一次建关（宿主 Dispose 会 dispose 几何）。
  if (!sink._wallGeoCache) sink._wallGeoCache = new Map();
  const geoKey = `${style}|${material}|${variants}|${nominal.moduleLen.toFixed(2)}`
    + `|${nominal.height.toFixed(2)}|${nominal.topWidth}|${nominal.baseWidth}`;
  let geoms = sink._wallGeoCache.get(geoKey);
  if (!geoms) {
    geoms = [];
    for (let v = 0; v < variants; v += 1) {
      geoms.push(MakeWallModuleGeometry(style, v, nominal, geoKey));
    }
    sink._wallGeoCache.set(geoKey, geoms);
  }

  // 变体 × 分区 → 一只 InstancedMesh
  const groups = new Map();
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  for (const m of plan.modules) {
    const sector = sectorKey ? sectorKey(m.x, m.z) : "";
    const key = `${m.variant}|${sector}`;
    if (!groups.has(key)) {
      groups.set(key, { variant: m.variant, sector, matrices: [], colors: [] });
    }
    const group = groups.get(key);
    euler.set(m.roll, m.yaw, 0, "YXZ");
    quat.setFromEuler(euler);
    pos.set(m.x, m.y, m.z);
    scl.set(m.sx, m.sy, m.sz);
    matrix.compose(pos, quat, scl);
    group.matrices.push(matrix.clone());
    group.colors.push(m.tint);
  }
  for (const group of groups.values()) {
    sink.props.push({
      kind: "wallInstances",
      name: `WallPCG_${style}_${material}_v${group.variant}${group.sector ? `_${group.sector}` : ""}`,
      material,
      sector: group.sector,
      geometry: geoms[group.variant],
      matrices: group.matrices,
      colors: group.colors,
      castShadow,
    });
  }

  for (const c of plan.colliders) sink.Solid(c.x, c.y, c.z, c.hx, c.hy, c.hz, tag, c.ry);
  for (const c of plan.covers) sink.Cover(c.x, c.z, c.h, c.fx, c.fz);

  return { stats: { ...plan.stats, buckets: groups.size }, fallenRuns: plan.fallenRuns };
}

/**
 * 把 sink.props 里的 wallInstances 桶变成 InstancedMesh 挂进场景。
 * 宿主（TengxianCity.FlushProps / TengxianOutfield 收尾）各调一次；
 * 处理过的条目从 props 里摘掉，不影响宿主对其它 kind 的遍历。
 * 不同调用的同几何同分区桶在这里合并 —— 一个村的八个院墙圈共享几何，
 * 合并后是「每变体×每分区」一只网格，不是每院四只。
 *
 * @param resolve (materialName, library) => THREE.Material（宿主自己的调色表）
 * @returns 建出的网格数
 */
export function FlushWallInstances(sink, { scene, meshes, library, resolve }) {
  const merged = new Map();
  for (let i = sink.props.length - 1; i >= 0; i -= 1) {
    const p = sink.props[i];
    if (p.kind !== "wallInstances") continue;
    sink.props.splice(i, 1);
    if (!p.matrices.length) continue;
    const key = `${p.geometry.id}|${p.material}|${p.castShadow}|${p.sector ?? ""}`;
    const bucket = merged.get(key);
    if (bucket) {
      bucket.matrices.push(...p.matrices);
      bucket.colors.push(...p.colors);
    } else {
      merged.set(key, p);
    }
  }
  const color = new THREE.Color();
  let built = 0;
  for (const p of merged.values()) {
    const mesh = MakeInstanced(p.geometry, resolve(p.material, library), p.matrices,
      { castShadow: p.castShadow !== false });
    for (let k = 0; k < p.colors.length; k += 1) {
      color.setRGB(p.colors[k][0], p.colors[k][1], p.colors[k][2]);
      mesh.setColorAt(k, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = p.name;
    scene.add(mesh);
    meshes.push(mesh);
    built += 1;
  }
  return built;
}

export default BuildWallSpline;
