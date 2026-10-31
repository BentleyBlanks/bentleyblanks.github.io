// 一次性转换（2026-10-31，用户拍板「三段合一、场景文件为准」）：把白盒编辑器第一关新剧本的三份场地
// Blockout/FirstLevel0105|0610|1218.scene.json 合成一个场景 Scenes/FirstLevelWhitebox（docs/Data_Scene.md §5）。
//
// 转完以后场景文件就是唯一真相，三份旧文件删掉、场景生成器不再写文件。这个脚本留着只为能从 git 历史重放：
//   node Taierzhuang1938/Script_SceneImportBlockout.mjs --rev=<旧文件还在的提交> [--out=<目录>] [--report=<文件>]
//
// 合并规矩：
//   · 地形：拼成一张 0.5 m 网格。三段重叠处按重叠带中线切开（z < 160 归 01–05，160 ≤ z < 520 归 06–10，其余归 11–18）——
//     旧文件互相不一致的格点只出现在各自外边缘（z 198–200、558–560），中线两边逐点等于原文件；
//     哪段都没覆盖到的角落取本带那一段的边缘高度往外延。
//   · 物件：按 id 合并。几份完全一样 → 一个；同一个 id 位置差得远（> 20 m）是重名的不同物件 → 后来的改名加段号；
//     同一个物件几份不一样 → 一份是随信号出现 / 消失的块、另一份是 1218 抄成常驻块（带 from0610）时取前者，
//     其余取它所在那一带的段落的版本。每一条都写进报告。
//   · 地标同物件；地面涂色、路与沟按顺序拼起来；远景层只有 01–05 有，原样搬（远景物件进 objects，layer = backdrop）。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { WhiteboxMaterialFor } from "./Data_SceneAssets.mjs";
import {
  SCENE_SCHEMA, SCENE_HEIGHT_ENCODING, SceneDir, SceneFileName, ValidateScene, EncodeSceneHeights, FormatSceneJson,
} from "./Script_SceneDoc.mjs";

const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCENE_ID = "FirstLevelWhitebox";
const SEGMENTS = Object.freeze([
  { level: "FirstLevel0105", short: "0105", group: "01–05", fromZ: -Infinity, toZ: 160 },
  { level: "FirstLevel0610", short: "0610", group: "06–10", fromZ: 160, toZ: 520 },
  { level: "FirstLevel1218", short: "1218", group: "11–18", fromZ: 520, toZ: Infinity },
]);
const SAME_OBJECT_M = 20;
export const STAGE_0105_DONE = "Stage0105Done";
const DEG = 180 / Math.PI;
const Round4 = (v) => Number(v.toFixed(4));
const BLOCK_TOP_KEYS = new Set(["id", "x", "z", "w", "d", "h", "ry", "semantic", "solid", "y", "visual", "tag", "noClimb", "standOn", "cover", "signal", "appearSignal"]);

function Args() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return out;
}

function ReadOld(level, rev) {
  const rel = `Taierzhuang1938/Blockout/${level}.scene.json`;
  if (rev) return { doc: JSON.parse(execFileSync("git", ["show", `${rev}:${rel}`], { cwd: PROJECT_DIR, maxBuffer: 64 << 20 }).toString("utf8")), from: `${rev}:${rel}` };
  const file = path.join(PROJECT_DIR, "Blockout", `${level}.scene.json`);
  if (!fs.existsSync(file)) throw new Error(`${rel} 不在了：用 --rev=<旧文件还在的提交> 从 git 历史读`);
  return { doc: JSON.parse(fs.readFileSync(file, "utf8")), from: rel };
}

const BandOf = (z) => SEGMENTS.findIndex(s => z >= s.fromZ && z < s.toZ);

function TerrainExtent(t) {
  return { minX: t.minX, minZ: t.minZ, maxX: t.minX + t.cols * t.cellM, maxZ: t.minZ + t.rows * t.cellM };
}

function StitchTerrain(segs, report) {
  const cellM = segs[0].doc.terrain.cellM;
  if (!segs.every(s => s.doc.terrain.cellM === cellM)) throw new Error("三段的格距不一样，拼不起来");
  const ext = segs.map(s => TerrainExtent(s.doc.terrain));
  const minX = Math.min(...ext.map(e => e.minX)), maxX = Math.max(...ext.map(e => e.maxX));
  const minZ = Math.min(...ext.map(e => e.minZ)), maxZ = Math.max(...ext.map(e => e.maxZ));
  const cols = Math.round((maxX - minX) / cellM), rows = Math.round((maxZ - minZ) / cellM);
  const samplers = segs.map(s => HeightGridSampler(s.doc.terrain));
  const covers = (i, x, z) => x >= ext[i].minX && x <= ext[i].maxX && z >= ext[i].minZ && z <= ext[i].maxZ;
  const heights = new Float32Array((cols + 1) * (rows + 1));
  const used = segs.map(() => 0);
  let extended = 0;
  for (let iz = 0; iz <= rows; iz++) {
    const z = minZ + iz * cellM;
    const owner = BandOf(z);
    for (let ix = 0; ix <= cols; ix++) {
      const x = minX + ix * cellM;
      let pick = covers(owner, x, z) ? owner : segs.findIndex((_, i) => covers(i, x, z));
      if (pick < 0) { pick = owner; extended++; } else used[pick]++;
      heights[iz * (cols + 1) + ix] = samplers[pick](x, z);
    }
  }
  report.push(`地形：${cols}×${rows} 格（${cellM} m），x ${minX}…${maxX}、z ${minZ}…${maxZ}；各段贡献格点 ${segs.map((s, i) => `${s.short} ${used[i]}`).join("、")}；没人覆盖、往外延的 ${extended}`);
  return { terrain: { file: `${SceneFileName(SCENE_ID).replace(/\.json$/, "")}.height.bin`, encoding: SCENE_HEIGHT_ENCODING, minX, minZ, cellM, cols, rows }, heights };
}

/** 旧体块 → 场景物件。 */
function BlockToObject(block, group, report) {
  const material = WhiteboxMaterialFor(block.semantic);
  if (!material) throw new Error(`体块 ${block.id} 的 semantic ${block.semantic} 没有对应的白盒材质（Data_SceneAssets）`);
  const meta = {};
  for (const [k, v] of Object.entries(block)) if (!BLOCK_TOP_KEYS.has(k)) meta[k] = v;
  // 底面高与角度收到万分位（y − h/2、弧度换角度会留下 -0.040000000000000036 这种尾巴）
  return {
    id: block.id, asset: "Whitebox/Box", material,
    pos: [block.x, Number.isFinite(block.y) ? Round4(block.y - block.h / 2) : null, block.z],
    ...(block.ry ? { yawDeg: Round4(block.ry * DEG) } : {}),
    size: [block.w, block.h, block.d],
    ...(block.solid === false ? { solid: false } : {}),
    ...(block.visual === false ? { visual: false } : {}),
    ...(block.tag ? { tag: block.tag } : {}),
    ...(block.noClimb === true ? { noClimb: true } : {}),
    ...(block.standOn === true ? { standOn: true } : {}),
    ...(block.cover ? { cover: { ...block.cover } } : {}),
    ...(block.signal ? { hideOn: block.signal } : {}),
    ...(block.appearSignal ? { showOn: block.appearSignal } : {}),
    group,
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

/**
 * 按 id 合并：items = [{ seg, item }]；Same(a, b) 判断两份是不是同一个东西；Pick(cluster) 挑代表。
 * 返回 [{ id, item, seg }]，重名的不同东西改名加段号。
 */
function MergeById(items, kind, report, { Pick }) {
  const byId = new Map();
  for (const entry of items) {
    if (!byId.has(entry.item.id)) byId.set(entry.item.id, []);
    byId.get(entry.item.id).push(entry);
  }
  const out = [];
  const taken = new Set(items.map(e => e.item.id));
  for (const [id, versions] of byId) {
    const clusters = [];
    for (const v of versions) {
      const home = clusters.find(c => Math.hypot(c[0].item.x - v.item.x, c[0].item.z - v.item.z) <= SAME_OBJECT_M);
      if (home) home.push(v); else clusters.push([v]);
    }
    clusters.forEach((cluster, ci) => {
      const distinct = [...new Set(cluster.map(v => JSON.stringify(v.item)))];
      const chosen = distinct.length === 1 ? cluster[0] : Pick(cluster);
      if (distinct.length > 1) {
        report.push(`${kind} ${id}：${cluster.map(v => v.seg.short).join(" / ")} 几份不一样，取 ${chosen.seg.short} 的（${cluster.filter(v => v !== chosen).map(v => `${v.seg.short} 那份差在 ${DiffKeys(chosen.item, v.item)}`).join("；")}）`);
      }
      let outId = id;
      if (ci > 0) {
        outId = `${id}_${chosen.seg.short}`;
        while (taken.has(outId)) outId += "_";
        taken.add(outId);
        report.push(`${kind} ${id}：${chosen.seg.short} 那个在 (${chosen.item.x}, ${chosen.item.z})，跟 (${clusters[0][0].item.x}, ${clusters[0][0].item.z}) 不是同一个东西，改名 ${outId}`);
      }
      out.push({ id: outId, item: { ...chosen.item, id: outId }, seg: chosen.seg });
    });
  }
  return out;
}

function DiffKeys(a, b) {
  return Object.keys({ ...a, ...b }).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map(k => `${k} ${JSON.stringify(b[k])}→${JSON.stringify(a[k])}`).join("、");
}

/** 同一个物件几份不一样时挑哪份：随信号的块胜过抄成常驻的块；否则取所在那一带的段落。 */
function PickBlock(cluster) {
  const gate = cluster.find(v => v.item.signal || v.item.appearSignal);
  if (gate && cluster.some(v => v.item.from0610)) return gate;
  const band = BandOf(cluster[0].item.z);
  return cluster.find(v => SEGMENTS.indexOf(v.seg) === band) || cluster[0];
}

function UniqueIds(list, kind, report) {
  const seen = new Set();
  return list.map(item => {
    let id = item.id;
    if (seen.has(id)) { while (seen.has(id)) id += "_"; report.push(`${kind} ${item.id} 重名，改成 ${id}`); }
    seen.add(id);
    return { ...item, id };
  });
}

function DedupeLines(lines) {
  const seen = new Set();
  return lines.filter(line => { const key = JSON.stringify(line); if (seen.has(key)) return false; seen.add(key); return true; });
}

export function ImportFirstLevelWhitebox({ rev = null } = {}) {
  const report = [];
  const segs = SEGMENTS.map(seg => ({ ...seg, ...ReadOld(seg.level, rev) }));
  const { terrain, heights } = StitchTerrain(segs, report);

  const blockItems = segs.flatMap(seg => [...seg.doc.blocks, ...(seg.doc.gates || [])].map(item => ({ seg, item })));
  const mergedBlocks = MergeById(blockItems, "物件", report, { Pick: PickBlock });
  // 01–05 的「玩家出不了沟」隐形墙在场地南边界（z = 200）把凹路封了口；三段连起来以后凹路接着往南通 06–10，封口那一段去掉
  const SEAM_CAPS = new Set(["KeepIn_0536"]);
  const kept = mergedBlocks.filter(({ item }) => {
    if (!SEAM_CAPS.has(item.id)) return true;
    if (item.tag !== "airWall" || Math.abs(item.z - 200) > 0.5) throw new Error(`${item.id} 不在 01–05 南边界上了，封口规矩要重看`);
    report.push(`物件 ${item.id}：01–05 南边界上封凹路口的隐形墙，三段连通后去掉`);
    return false;
  });
  // 01–05 那圈「玩家出不了沟」的隐形墙（KeepIn_*）只管 01–05：随 Stage0105Done 消失，06–10 / 11–18 进来就当它已经发生
  let keepIn = 0;
  const objects = kept.map(({ item, seg }) => {
    const obj = BlockToObject(item, SEGMENTS[Math.max(0, BandOf(item.z))].group ?? seg.group, report);
    if (/^KeepIn_/.test(obj.id) && obj.tag === "airWall") {
      if (obj.hideOn || obj.showOn) throw new Error(`${obj.id} 已经带信号，KeepIn 规矩要重看`);
      obj.hideOn = STAGE_0105_DONE;
      keepIn++;
    }
    return obj;
  });
  report.push(`物件：${keepIn} 段 KeepIn_* 隐形墙（01–05 玩家出不了沟）加 hideOn ${STAGE_0105_DONE}，后两段不挡人`);
  report.push(`物件：三段原有 ${blockItems.length} 个，合并后 ${objects.length} 个`);

  const backdropSeg = segs.find(s => s.doc.backdrop);
  if (segs.filter(s => s.doc.backdrop).length > 1) throw new Error("不止一段有远景层，合并规矩没写");
  let backdrop;
  if (backdropSeg) {
    const bd = backdropSeg.doc.backdrop;
    const kindAsset = { box: "Backdrop/Box", blob: "Backdrop/Blob", hill: "Backdrop/Hill", tree: "Backdrop/Tree" };
    for (const shape of bd.shapes || []) {
      const { id, kind, x, z, ry, ...params } = shape;
      objects.push({ id, asset: kindAsset[kind], pos: [x, null, z], ...(ry ? { yawDeg: Round4(ry * DEG) } : {}), layer: "backdrop", group: "远景", params });
    }
    backdrop = { far: bd.far, ground: { ...bd.ground }, ...(bd.haze ? { haze: { ...bd.haze } } : {}), paint: bd.paint || [], siteBounds: { ...backdropSeg.doc.bounds } };
    report.push(`远景：${backdropSeg.short} 的 ${(bd.shapes || []).length} 个远景物件进 objects（layer backdrop），${(bd.paint || []).length} 项远景涂色`);
  }

  const markerItems = segs.flatMap(seg => (seg.doc.landmarks || []).map(item => ({ seg, item })));
  const markers = MergeById(markerItems, "地标", report, { Pick: (cluster) => cluster.find(v => SEGMENTS.indexOf(v.seg) === BandOf(cluster[0].item.z)) || cluster[0] })
    .map(({ item }) => item);
  const paint = UniqueIds(segs.flatMap(seg => seg.doc.paint || []), "涂色", report);
  const colorSemantics = [...new Set(segs.flatMap(seg => seg.doc.colorSemantics || []))];
  const semanticColors = Object.assign({}, ...segs.map(seg => seg.doc.semanticColors || {}));
  const heightTint = segs.find(seg => seg.doc.heightTint)?.doc.heightTint;
  const bounds = {
    minX: Math.min(...segs.map(s => s.doc.bounds.minX)), maxX: Math.max(...segs.map(s => s.doc.bounds.maxX)),
    minZ: Math.min(...segs.map(s => s.doc.bounds.minZ)), maxZ: Math.max(...segs.map(s => s.doc.bounds.maxZ)),
  };

  const scene = {
    schema: SCENE_SCHEMA,
    id: SCENE_ID,
    title: "第一关 · 白盒（01–18 新剧本）",
    source: {
      importedFrom: segs.map(s => s.from),
      importer: "Script_SceneImportBlockout.mjs",
      importedAt: new Date().toISOString(),
      notes: "2026-10-31 三段合一；之后以本文件为准（场景编辑器 / 人 / agent 直接改），生成器不再写。",
    },
    bounds,
    spawn: { ...segs[0].doc.spawn },
    terrain,
    look: { ...(heightTint ? { heightTint: { ...heightTint } } : {}), colorSemantics, semanticColors },
    ...(backdrop ? { backdrop } : {}),
    paint,
    ways: {
      roads: DedupeLines(segs.flatMap(s => s.doc.ways?.roads || [])),
      trenches: DedupeLines(segs.flatMap(s => s.doc.ways?.trenches || [])),
    },
    markers,
    objects,
  };
  const check = ValidateScene(scene);
  if (!check.ok) throw new Error(`合出来的场景过不了校验：${check.errors.slice(0, 5).join("；")}`);
  return { scene, heights, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Args();
  const { scene, heights, report } = ImportFirstLevelWhitebox({ rev: typeof args.rev === "string" ? args.rev : null });
  const outDir = typeof args.out === "string" ? path.resolve(args.out) : path.join(PROJECT_DIR, SceneDir(SCENE_ID));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, SceneFileName(SCENE_ID)), FormatSceneJson(scene));
  fs.writeFileSync(path.join(outDir, scene.terrain.file), EncodeSceneHeights(heights));
  const text = report.map(line => `- ${line}`).join("\n") + "\n";
  if (typeof args.report === "string") fs.writeFileSync(path.resolve(args.report), text);
  process.stdout.write(text);
  console.log(`写到 ${outDir}：${scene.objects.length} 个物件、${scene.markers.length} 个地标、${scene.paint.length} 项涂色`);
}
