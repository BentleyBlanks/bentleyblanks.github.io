// 一次性转换（2026-11-01，docs/Data_Scene.md §9）：把第一关两个场景里烘死在高度图上的壕沟换成场景里的样条沟。
//
//   · 01–05 那二十六段：原来是退休生成器 Script_EditorBlockoutFirstLevel0105Scene.L0105TrenchSpec 挖的，原样搬进
//     trenches.segments；生成器挖完沟之后补的几刀改成沟的参数——交通沟板桥往南的坡道 → datumAlong，支沟口不许把交通沟
//     挖深 → 支沟 depthAlong，旧交通沟塌的几截 → collapses，板桥两头的路面、干沟沟底不堆弃土 → noBerm。
//   · 11–18 村北沿战壕（七二七团）：原来是生成器里按方坑手挖的（Trench），改成两段样条沟（临时掘壕）。
//   · 高度图换成「沟没挖之前」的地面（两个生成器关掉挖沟重算），另存挖沟基准面（01–05 的自然地面，1 m 格）。
//   · ways.trenches 里被网络取代的那几条中线删掉（读场景时从网络现取）。
//
// 用法（从 worktree 根）：node Taierzhuang1938/Script_SceneTrenchMigrate.mjs [--write]
//   不带 --write 只算、报「现挖」和原高度图差多少；带了才写两个场景的 JSON、.height.bin、.trench.bin。
// 这是转换脚本不是门禁，不进 TestRunner；转完以后场景文件为准，不要再跑。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DecodeSceneHeights, EncodeSceneHeights, FormatSceneJson, ValidateScene, SceneDir, SceneFileName } from "./Script_SceneDoc.mjs";
import { CompileTrenchNetwork } from "./Script_TrenchPlan.mjs";
import { EncodeTrenchDatum, PrepareSceneTerrain } from "./Script_SceneTrenches.mjs";
import {
  L0105Ground, L0105TrenchSpec, NaturalHeight, TrafficBaseLift,
} from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import { L1218Ground } from "./Script_EditorBlockoutFirstLevel1218Scene.mjs";
import {
  L0105_BOUNDS, L0105_OLD_POSITION, L0105_ROAD, L0105_ROAD_WIDTH_M, L0105_BRIDGE, L0105_PLACES, L0105_TRENCH_SECTION, PointAlong, L0105_GULLY,
} from "./Data_EditorBlockoutFirstLevel0105Space.mjs";
import { L1218_BOUNDS, L1218_TRENCH, L1218_HEIGHTS } from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SCENES = ["FirstLevelWhitebox", "FirstLevel"];
const R2 = (v) => Math.round(v * 100) / 100;
const DATUM_CELL_M = 1;

// ---------------------------------------------------------------------------
// 01–05 的段

const OLD_IDS = /^Old/;
function GroupOf(id) {
  if (OLD_IDS.test(id)) return "01–05/壕沟/旧阵地";
  if (/^(Traffic|Traffic2|Branch|CrawlSap)$/.test(id)) return "01–05/壕沟/交通沟";
  return "01–05/壕沟/前沿";
}

/** 段上弧长 s：点投到编好的段中线上。 */
function ArcOf(seg, x, z) {
  const pts = seg.path.points;
  let best = Infinity, bestS = 0, acc = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, z0] = pts[k], dx = pts[k + 1][0] - x0, dz = pts[k + 1][1] - z0, len2 = dx * dx + dz * dz || 1, len = Math.sqrt(len2);
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / len2));
    const d = Math.hypot(x - x0 - dx * t, z - z0 - dz * t);
    if (d < best) { best = d; bestS = acc + len * t; }
    acc += len;
  }
  return bestS;
}

/** 折线按容差抽稀（Douglas–Peucker，[s, d] 二维）。 */
function Simplify(points, tol) {
  if (points.length <= 2) return points;
  const [a, b] = [points[0], points[points.length - 1]];
  let worst = -1, at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], t = (p[0] - a[0]) / ((b[0] - a[0]) || 1), d = Math.abs(p[1] - (a[1] + (b[1] - a[1]) * t));
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= tol) return [a, b];
  return [...Simplify(points.slice(0, at + 1), tol).slice(0, -1), ...Simplify(points.slice(at), tol)];
}

function L0105Segments() {
  const spec = L0105TrenchSpec();
  const plan = CompileTrenchNetwork(spec, { natural: NaturalHeight });
  const byId = new Map(plan.segments.map((s) => [s.id, s]));
  const S = L0105_TRENCH_SECTION;
  const out = spec.segments.map((raw) => {
    const { id, preset, points, source, ...rest } = raw;
    const seg = { id, preset, points: points.map((p) => [R2(p.x), R2(p.z)]), group: GroupOf(id), note: source };
    for (const [k, v] of Object.entries(rest)) seg[k] = typeof v === "number" ? R2(v) : v;
    seg.look = OLD_IDS.test(id) ? "abandoned" : "bare";
    return seg;
  });
  const Seg = (id) => out.find((s) => s.id === id);
  // 交通沟：板桥往北加深、过坡顶变浅、坡顶往南顺坡落到干沟沟底（原来是 Apply 的基准面抬高 TrafficBaseLift）
  {
    const compiled = byId.get("Traffic"), samples = [];
    for (let s = 0; s <= compiled.path.length + 1e-6; s += 0.5) {
      const p = compiled.path.At(Math.min(s, compiled.path.length));
      samples.push([R2(s), R2(TrafficBaseLift(p.x, p.z))]);
    }
    if (samples.some(([, d]) => Math.abs(d) > 0.005)) Seg("Traffic").datumAlong = Simplify(samples, 0.01);
  }
  // 支沟：沟口那一截（台阶西边）不比交通沟深（原来生成器在沟口夹到交通沟底）
  {
    const compiled = byId.get("Branch"), stepTopX = L0105_PLACES.steps.x - (L0105_PLACES.steps.count * 0.45) / 2;
    const mouthX = L0105_PLACES.branchMouth.x - 6;
    const sTop = ArcOf(compiled, stepTopX, compiled.path.At(0).z), sMouth = ArcOf(compiled, mouthX, compiled.path.At(0).z);
    const [lo, hi] = sTop < sMouth ? [sTop, sMouth] : [sMouth, sTop];
    const deep = Seg("Branch").depth, shallow = S.traffic.depth;
    // 台阶在 sTop 那一头：沟口一侧浅、台阶以里深
    Seg("Branch").depthAlong = sTop > sMouth
      ? [[R2(lo - 0.01), shallow], [R2(hi), shallow], [R2(hi + 0.02), deep]]
      : [[R2(lo - 0.02), deep], [R2(lo), shallow], [R2(hi + 0.01), shallow]];
    delete Seg("Branch").depth;
  }
  // 旧交通沟塌的几截
  for (const [id, line, alongs] of [["OldComm", L0105_OLD_POSITION.comm, L0105_OLD_POSITION.commCollapsed], ["OldSap", L0105_OLD_POSITION.sap, L0105_OLD_POSITION.sapCollapsed]]) {
    const compiled = byId.get(id);
    Seg(id).collapses = alongs.map((c) => { const p = PointAlong(line, c); return { s: R2(ArcOf(compiled, p.x, p.z)), halfLenM: 1.4, featherM: 1.2, depthM: 0.3 }; });
  }
  return { segments: out, plan };
}

/** 不堆弃土的地方：板桥两头的路面；干沟沟底（原来生成器挖完沟再压平）。 */
function L0105NoBerm(plan) {
  const zones = [];
  // 板桥：路中线在桥心 spanM 以内的那一截，两侧各路宽一半 + 1.2 m
  const B = L0105_BRIDGE, line = [];
  for (let i = 1; i < L0105_ROAD.length; i++) {
    const a = L0105_ROAD[i - 1], b = L0105_ROAD[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0; d <= len; d += 0.5) {
      const x = a.x + (b.x - a.x) * d / len, z = a.z + (b.z - a.z) * d / len;
      if (Math.hypot(x - B.x, z - B.z) < B.spanM) line.push([R2(x), R2(z)]);
    }
  }
  if (line.length >= 2) zones.push({ line: [line[0], ...line.filter((_, i) => i && i % 4 === 0), line[line.length - 1]], halfW: R2(L0105_ROAD_WIDTH_M / 2 + 1.2) });
  // 干沟：沟底到半坡（原来生成器挖完沟再把沟底压平，堆进去的弃土被抹掉）：主沟、支沟各一条变宽的带子
  const G = L0105_GULLY;
  zones.push({ line: G.line.map((p, i) => [R2(p.x), R2(p.z), R2(G.halfW[i] * (1 + G.wobble) + G.wallM / 4)]), halfW: R2(G.wallM) });
  zones.push({ line: G.branch.map((p, i) => [R2(p.x), R2(p.z), R2(G.branchHalfW[i] + G.branchWallM / 4)]), halfW: R2(G.branchWallM) });
  return zones;
}

// ---------------------------------------------------------------------------
// 11–18 村北沿战壕

function L1218Segments(datumAt) {
  const TR = L1218_TRENCH, floorY = L1218_HEIGHTS.trenchFloorY;
  // 西段自西向东（minus = 北），东段反过来自东向西（plus = 北）：弃土都在北沿
  const lines = [
    { id: "VillageNorthWest", pts: TR.west, side: "minus" },
    { id: "VillageNorthEast", pts: [...TR.east].reverse(), side: "plus" },
  ];
  return lines.map(({ id, pts, side }) => {
    // 壕底是绝对高度（floorY）：沿沟深度 = 基准面（不含反坦克沟的地面）− 壕底；伸进反坦克沟那截照样挖到壕底，沟里本来更低的不动
    const compiled = CompileTrenchNetwork({ seed: "probe", segments: [{ id, preset: "fire", points: pts, cornerRadiusM: 0, jitterScale: 0 }] }).segments[0];
    const samples = [];
    for (let s = 0; s <= compiled.path.length + 1e-6; s += 0.5) {
      const p = compiled.path.At(Math.min(s, compiled.path.length));
      samples.push([R2(s), R2(Math.max(0, datumAt(p.x, p.z) - floorY))]);
    }
    const depths = samples.map(([, d]) => d);
    return {
      id, preset: "fire", points: pts.map((p) => [R2(p.x), R2(p.z)]), group: "11–18/壕沟",
      note: `L1218_TRENCH.${id === "VillageNorthWest" ? "west" : "east"}（村北沿战壕，七二七团；壕底宽 1、深 1.2、北沿堆土）`,
      depthAlong: Simplify(samples, 0.01), floorW: TR.floorW, bankW: TR.wallM, bermH: TR.bermH,
      // 原来的土垄从沟沿 0.85 m 堆到离中线 2.2 m（宽 1.35）；场景网络用压实断面档，弃土宽乘 1.5，所以写 1.35 / 1.5
      bermW: R2((TR.bermOffM + TR.bermW / 2 - TR.floorW / 2 - TR.wallM) / 1.5), bermSide: side, cornerRadiusM: 0, jitterScale: 0, look: "scrape",
      _depthSpread: Math.max(...depths) - Math.min(...depths),
    };
  });
}

// ---------------------------------------------------------------------------

function Main() {
  const write = process.argv.includes("--write");
  const first = path.join(ROOT, SceneDir(SCENES[0]), SceneFileName(SCENES[0]));
  const doc0 = JSON.parse(fs.readFileSync(first, "utf8"));
  if (doc0.trenches) throw new Error("场景里已经有 trenches 了：这个脚本只跑一次");
  const t = doc0.terrain, width = t.cols + 1;
  const old = DecodeSceneHeights(fs.readFileSync(path.join(path.dirname(first), t.file)), t);

  // 1. 未挖地面
  const { segments: seg0105, plan: plan0105 } = L0105Segments();
  const g0105 = L0105Ground({ trenches: false }).Ground, g1218 = L1218Ground({ trench: false }).Ground;
  const pre = new Float32Array(old);
  const Redo = (bounds, band, ground) => {
    let n = 0;
    for (let iz = 0; iz <= t.rows; iz++) {
      const z = t.minZ + iz * t.cellM;
      if (z < bounds.minZ || z > bounds.maxZ || z < band[0] || z >= band[1]) continue;
      for (let ix = 0; ix <= t.cols; ix++) {
        const x = t.minX + ix * t.cellM;
        if (x < bounds.minX || x > bounds.maxX) continue;
        pre[iz * width + ix] = Math.round(ground(x, z) * 100) / 100; n++;
      }
    }
    return n;
  };
  const pad = (b, m) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
  const clip = (b, c) => ({ minX: Math.max(b.minX, c.minX), maxX: Math.min(b.maxX, c.maxX), minZ: Math.max(b.minZ, c.minZ), maxZ: Math.min(b.maxZ, c.maxZ) });
  const n0105 = Redo(clip(pad(plan0105.bounds, 4), L0105_BOUNDS), [-Infinity, 160], g0105);
  const tr = L1218_TRENCH, xs = [...tr.west, ...tr.east].map((p) => p.x), zs = [...tr.west, ...tr.east].map((p) => p.z);
  const box1218 = clip({ minX: Math.min(...xs) - 5, maxX: Math.max(...xs) + 5, minZ: Math.min(...zs) - 5, maxZ: Math.max(...zs) + 5 }, L1218_BOUNDS);
  const n1218 = Redo(box1218, [520, Infinity], g1218);
  console.log(`未挖地面：01–05 重算 ${n0105} 个格点，11–18 重算 ${n1218} 个`);

  // 2. 基准面（01–05 的自然地面，1 m 格）
  const db = pad(plan0105.bounds, 3);
  const patch = { minX: Math.floor(db.minX), minZ: Math.floor(db.minZ), cellM: DATUM_CELL_M };
  patch.cols = Math.ceil(db.maxX) - patch.minX; patch.rows = Math.ceil(db.maxZ) - patch.minZ;
  patch.heights = new Float32Array((patch.cols + 1) * (patch.rows + 1));
  for (let iz = 0; iz <= patch.rows; iz++) for (let ix = 0; ix <= patch.cols; ix++) {
    patch.heights[iz * (patch.cols + 1) + ix] = NaturalHeight(patch.minX + ix * DATUM_CELL_M, patch.minZ + iz * DATUM_CELL_M);
  }
  // 11–18：不含反坦克沟、不挖战壕的地面
  const g1218Datum = L1218Ground({ trench: false, atDitch: false }).Ground;
  const patch2 = { minX: Math.floor(box1218.minX), minZ: Math.floor(box1218.minZ), cellM: DATUM_CELL_M };
  patch2.cols = Math.ceil(box1218.maxX) - patch2.minX; patch2.rows = Math.ceil(box1218.maxZ) - patch2.minZ;
  patch2.heights = new Float32Array((patch2.cols + 1) * (patch2.rows + 1));
  for (let iz = 0; iz <= patch2.rows; iz++) for (let ix = 0; ix <= patch2.cols; ix++) {
    patch2.heights[iz * (patch2.cols + 1) + ix] = g1218Datum(patch2.minX + ix * DATUM_CELL_M, patch2.minZ + iz * DATUM_CELL_M);
  }
  const patches = [patch, patch2];
  const datumBytes = EncodeTrenchDatum(patches);

  // 3. 网络
  const preGrid = (x, z) => {
    const gx = (x - t.minX) / t.cellM, gz = (z - t.minZ) / t.cellM, ix = Math.round(gx), iz = Math.round(gz);
    return pre[iz * width + ix];
  };
  const seg1218 = L1218Segments(g1218Datum);
  for (const s of seg1218) { console.log(`${s.id}：深 ${s.depth} m，沿沟深度起伏 ${s._depthSpread.toFixed(3)} m`); delete s._depthSpread; }
  const datumFile = (id) => `Scene_${id}.trench.bin`;
  const Trenches = (id) => ({
    seed: "tengxian1938:L0105:trench",
    earthProfile: "compact",
    datum: { file: datumFile(id), encoding: "int16-cm-le", patches: patches.map((p) => ({ minX: p.minX, minZ: p.minZ, cellM: p.cellM, cols: p.cols, rows: p.rows })) },
    // 弃土不往坑里堆（机枪坑、掩蔽部、龛：原来生成器先堆土、后挖坑）
    noBermBelowM: 0.4,
    propKinds: ["Prop/militaryCrateClosed", "Prop/battlefieldGrenadeStack", "Prop/marketRiceSack01"],
    // 11–18：原来北沿堆土只堆在 z > 636.5（两头斜下去接反坦克沟那截不堆）
    noBerm: [...L0105NoBerm(plan0105), { minX: 70, maxX: 124, minZ: 620, maxZ: 636.5 }],
    segments: [...seg0105, ...seg1218],
  });

  // 4. 现挖，和原高度图比
  const probe = { ...doc0, trenches: Trenches(SCENES[0]) };
  const { heights, plan } = PrepareSceneTerrain(probe, pre, datumBytes);
  const buckets = [0.02, 0.05, 0.1, 0.25, 0.5];
  const over = buckets.map(() => 0);
  let max = 0, maxAt = null;
  const clusters = new Map();
  for (let i = 0; i < heights.length; i++) {
    const d = Math.abs(heights[i] - old[i]);
    buckets.forEach((b, k) => { if (d > b) over[k]++; });
    if (d > max) { max = d; maxAt = i; }
    if (d > 0.1) {
      const x = t.minX + (i % width) * t.cellM, z = t.minZ + Math.floor(i / width) * t.cellM;
      const key = `${Math.floor(x / 10) * 10},${Math.floor(z / 10) * 10}`;
      const c = clusters.get(key) || { n: 0, max: 0, at: 0 };
      c.n++; if (d > c.max) { c.max = d; c.at = i; } clusters.set(key, c);
    }
  }
  const at = (i) => `x ${(t.minX + (i % width) * t.cellM).toFixed(1)} z ${(t.minZ + Math.floor(i / width) * t.cellM).toFixed(1)}（原 ${old[i].toFixed(2)}，现 ${heights[i].toFixed(2)}）`;
  console.log(`现挖 vs 原高度图：${buckets.map((b, k) => `差 > ${b * 100} cm ${over[k]} 个`).join("，")}；最大 ${max.toFixed(3)} m 在 ${maxAt === null ? "—" : at(maxAt)}`);
  console.log(`差 > 10 cm 的 10 m 格（前 20）：${[...clusters].sort((a, b) => b[1].n - a[1].n).slice(0, 20).map(([k, c]) => `${k}:${c.n}/${c.max.toFixed(2)}`).join("  ")}`);
  if (process.argv.includes("--diag")) for (const [k, c] of [...clusters].sort((a, b) => b[1].n - a[1].n).slice(0, 30)) console.log(`  ${k}：${at(c.at)} 未挖 ${pre[c.at].toFixed(2)}`);
  console.log(`网络 ${plan.segments.length} 段；基准面 ${patches.map((p) => `${p.cols}×${p.rows}`).join(" + ")}（${datumBytes.length} 字节）；不堆土区 ${probe.trenches.noBerm.length} 个`);
  if (!write) { console.log("（没写文件：加 --write 才写）"); return; }

  // 5. 写
  const removed = (line) => line.every((p) => p.z < 160 && p.x >= L0105_BOUNDS.minX && p.x <= L0105_BOUNDS.maxX)
    || [tr.west, tr.east].some((l) => l.length === line.length && l.every((p, i) => Math.abs(p.x - line[i].x) < 0.05 && Math.abs(p.z - line[i].z) < 0.05));
  const preBytes = EncodeSceneHeights(pre);
  for (const id of SCENES) {
    const file = path.join(ROOT, SceneDir(id), SceneFileName(id));
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    const before = doc.ways?.trenches?.length || 0;
    if (doc.ways?.trenches) doc.ways.trenches = doc.ways.trenches.filter((line) => !removed(line));
    // trenches 一节排在 ways 后面
    const out = {};
    for (const [k, v] of Object.entries(doc)) { out[k] = v; if (k === "ways") out.trenches = Trenches(id); }
    const check = ValidateScene(out);
    if (!check.ok) throw new Error(`${id} 校验不过：${check.errors.slice(0, 5).join("；")}`);
    fs.writeFileSync(file, FormatSceneJson(out));
    fs.writeFileSync(path.join(path.dirname(file), doc.terrain.file), preBytes);
    fs.writeFileSync(path.join(path.dirname(file), datumFile(id)), datumBytes);
    console.log(`${id}：写好（ways.trenches ${before} → ${out.ways.trenches.length} 条）`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) Main();
