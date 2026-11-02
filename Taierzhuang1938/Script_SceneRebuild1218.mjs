// 一次性重建、可重放（2026-11-02，《FirstLevel1218 白盒第四版契约》第四节 A）：把第一关两个场景里 11–18 这一片（z ≥ 556）换成第四版布局。
//
// 做法（同 Script_SceneForkFormal 的口径：转换脚本不是门禁，不进 TestRunner）：
//   1. 读当前两份场景文件（Scenes/FirstLevelWhitebox、Scenes/FirstLevel，各自的 .json / .height.bin / .trench.bin）；
//   2. 高度图往南加长到 z 1080（bounds.maxZ、terrain.rows 跟着改）：z < 556 的格点原样保留（0610 的地面一个不动），
//      只有 x < −20 这一条（0610 场地没盖到）从 z 480 起叠铁路路基；z ≥ 556 全部按 Script_EditorBlockoutFirstLevel1218Scene.L1218Ground 重烘
//      （烘出来的是「沟没挖之前」的地面：村口反坦克沟烘进去，村北沿战壕是样条沟，读场景时现挖）；
//   3. 删掉 11–18 南片：z ≥ 556 的物件（都是 group 11–18/… 的）、地标、涂色 / 路 / 沟中线里伸到 z > 556 的；
//      z < 556 的一切不动（包括 group 是 11–18 但 z < 556 的那些借来的 0610 块）；
//   4. 按新锚点（Data_EditorBlockoutFirstLevel1218Space）生成这一片的体块 / 随信号体块 / 涂色 / 地标 / 路 / 沟，
//      用 Script_SceneImportBlockout.BlockToObject 转成场景物件、Script_SceneGroupHierarchy 归层级，拼进去；正式场景按 Script_SceneForkFormal.FormalObject 换道具与树；
//   5. 场景 trenches：村北沿两段样条沟换成第四版的点与 depthAlong，挖沟基准面第二块（11–18）重烘、.trench.bin 重写；不堆弃土区里旧的 11–18 那一条换掉。
// 同一输入跑两次逐字相同：不读时钟、不读 git、没有随机数（source.importedAt / forkedAt 原样保留）。
//
// 用法（从 worktree 根）：node Taierzhuang1938/Script_SceneRebuild1218.mjs [--check]   --check 只算、报统计，不写文件
// 提交前 rebase 撞了二进制冲突：取 origin 那份场景文件，再跑一遍本脚本。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DecodeSceneHeights, EncodeSceneHeights, FormatSceneJson, ValidateScene, SceneDir, SceneFileName } from "./Script_SceneDoc.mjs";
import { DecodeTrenchDatum, EncodeTrenchDatum, GridSampler } from "./Script_SceneTrenches.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { BlockToObject } from "./Script_SceneImportBlockout.mjs";
import { HierarchyPaths } from "./Script_SceneGroupHierarchy.mjs";
import { FormalObject } from "./Script_SceneForkFormal.mjs";
import { SCENE_EVENTS } from "./Data_SceneEvents.mjs";
import { L1218Ground, BuildFirstLevel1218Site, L1218TrenchSegments, L1218TrenchDatumBox, L1218NoBerm } from "./Script_EditorBlockoutFirstLevel1218Scene.mjs";
import { L1218_BOUNDS, L1218_GROUND, L1218_RAIL, L1218_SIGNALS } from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SCENES = Object.freeze([{ id: "FirstLevelWhitebox", formal: false }, { id: "FirstLevel", formal: true }]);
const SEAM_Z = L1218_GROUND.seamZ;
const GROUP = "11–18";
const DATUM_CELL_M = 1;
const OLD_SIGNALS = Object.freeze(["FamilyHidden"]);   // 第三版有、第四版删掉的剧情事件
const SOURCE_NOTE = "2026-11-02 11–18 换成第四版布局（Script_SceneRebuild1218，契约 tmp/Contract1218_v4.md）：z ≥ 556 重烘、高度图加长到 z 1080；z < 556 一个格点 / 物件不动。";

const MaxZ = (pts) => Math.max(...pts.map((p) => p.z));
const IsSouth = (pts) => MaxZ(pts) > SEAM_Z;

/** 旧场景 → 新场景（纯函数：doc + 未挖高度 + 基准面块 → 新 doc + 新高度 + 新基准面块 + 报告）。 */
export function Rebuild1218(doc, preHeights, datumPatches, { formal = false } = {}) {
  const report = [];
  const t = doc.terrain;
  if (t.minX !== L1218_BOUNDS.minX || t.minX + t.cols * t.cellM !== L1218_BOUNDS.maxX) throw new Error(`场景 x 范围 ${t.minX}…${t.minX + t.cols * t.cellM} 与 1218 场地 ${L1218_BOUNDS.minX}…${L1218_BOUNDS.maxX} 不一样`);
  const { Ground } = L1218Ground();

  // 1. 高度图：加长到 L1218_BOUNDS.maxZ；z < 556 保留（x < railFromX 从 480 起叠路基），z ≥ 556 重烘
  const rows = Math.round((L1218_BOUNDS.maxZ - t.minZ) / t.cellM), width = t.cols + 1;
  const heights = new Float32Array(width * (rows + 1));
  let kept = 0, railed = 0, baked = 0;
  for (let iz = 0; iz <= rows; iz++) {
    const z = t.minZ + iz * t.cellM;
    for (let ix = 0; ix <= t.cols; ix++) {
      const x = t.minX + ix * t.cellM, i = iz * width + ix;
      if (z < SEAM_Z) {
        const old = iz <= t.rows ? preHeights[i] : NaN;
        if (!Number.isFinite(old)) throw new Error(`旧高度图没有 (${x},${z})`);
        // x < −20、z 480…556：0610 的场地没盖到这一条（合并时是往外延的边缘值 + 第三版 x −104 的路基），按 0610 的解析地面重算再叠第四版 x −80 的路基
        if (x < L1218_GROUND.railFromX && z >= L1218_RAIL.fromZ) { heights[i] = Math.round(Ground(x, z) * 100) / 100; railed++; }
        else { heights[i] = old; kept++; }
      } else { heights[i] = Math.round(Ground(x, z) * 100) / 100; baked++; }
    }
  }
  const terrain = { ...t, rows };
  report.push(`高度图：${t.cols}×${t.rows} → ${t.cols}×${rows} 格；保留 ${kept}、x<${L1218_GROUND.railFromX} 叠路基 ${railed}、z≥${SEAM_Z} 重烘 ${baked}`);
  const sample = HeightGridSampler({ ...terrain, heights });

  // 2. 这一片的新东西
  const site = BuildFirstLevel1218Site(sample, { report });
  const blocks = [...site.scene.blocks, ...site.scene.gates];

  // 3. 删南片、拼新片
  const keptObjects = doc.objects.filter((o) => o.layer === "backdrop" || o.pos[2] < SEAM_Z);
  const removed = doc.objects.filter((o) => !(o.layer === "backdrop" || o.pos[2] < SEAM_Z));
  const stray = removed.filter((o) => !String(o.group || "").startsWith(GROUP));
  if (stray.length) throw new Error(`z ≥ ${SEAM_Z} 有不属于 11–18 的物件：${stray.slice(0, 5).map((o) => `${o.id}（${o.group}）`).join("、")}`);
  const taken = new Set(keptObjects.map((o) => o.id));
  const converted = blocks.map((b) => {
    if (taken.has(b.id)) throw new Error(`新物件 ${b.id} 与留下的物件重名`);
    taken.add(b.id);
    const obj = BlockToObject(b, GROUP, report);
    return obj;
  });
  const paths = HierarchyPaths(converted);
  converted.forEach((o, i) => { o.group = paths[i]; });
  const formalized = formal ? converted.map(FormalObject) : converted;
  const objects = [...keptObjects, ...formalized];
  report.push(`物件：删 ${removed.length}（11–18 南片）、加 ${converted.length}（${formal ? `正式：道具 ${formalized.filter((o) => o.asset.startsWith("Prop/")).length}、树 ${formalized.filter((o) => o.asset.startsWith("Tree/")).length}` : "白盒"}）→ ${objects.length}`);

  // 地标、涂色、路、沟中线
  const markers = [...(doc.markers || []).filter((m) => m.z < SEAM_Z)];
  const markerIds = new Set(markers.map((m) => m.id));
  for (const lm of site.scene.landmarks) {
    let id = lm.id;
    if (markerIds.has(id)) { id = `${id}_1218`; while (markerIds.has(id)) id += "_"; report.push(`地标 ${lm.id} 与别段重名，改成 ${id}`); }
    markerIds.add(id);
    markers.push({ ...lm, id });
  }
  const paintKept = (doc.paint || []).filter((p) => !IsSouth(p.poly || p.line));
  const paintIds = new Set(paintKept.map((p) => p.id));
  const paint = [...paintKept, ...site.scene.paint.map((p) => { let id = p.id; while (paintIds.has(id)) id += "_"; paintIds.add(id); return { ...p, id }; })];
  const roads = [...(doc.ways?.roads || []).filter((l) => !IsSouth(l)), ...site.scene.ways.roads];
  const wayTrenches = [...(doc.ways?.trenches || []).filter((l) => !IsSouth(l)), ...site.scene.ways.trenches];
  report.push(`地标 ${(doc.markers || []).length} → ${markers.length}；涂色 ${(doc.paint || []).length} → ${paint.length}；路 ${(doc.ways?.roads || []).length} → ${roads.length}；沟中线 ${(doc.ways?.trenches || []).length} → ${wayTrenches.length}`);

  // 4. 样条沟：村北沿两段换掉；基准面第二块重烘；旧的 11–18 不堆土区换掉
  const trenches = JSON.parse(JSON.stringify(doc.trenches));
  const box = L1218TrenchDatumBox();
  const patch = { minX: box.minX, minZ: box.minZ, cellM: DATUM_CELL_M, cols: box.maxX - box.minX, rows: box.maxZ - box.minZ };
  patch.heights = new Float32Array((patch.cols + 1) * (patch.rows + 1));
  for (let iz = 0; iz <= patch.rows; iz++) for (let ix = 0; ix <= patch.cols; ix++) patch.heights[iz * (patch.cols + 1) + ix] = Math.round(Ground(patch.minX + ix * DATUM_CELL_M, patch.minZ + iz * DATUM_CELL_M) * 100) / 100;
  const oldSouthPatch = datumPatches.findIndex((p) => p.minZ >= SEAM_Z);
  if (oldSouthPatch < 0) throw new Error("基准面里没有 11–18 那一块");
  const patches = datumPatches.map((p, i) => (i === oldSouthPatch ? patch : p));
  trenches.datum.patches = patches.map((p) => ({ minX: p.minX, minZ: p.minZ, cellM: p.cellM, cols: p.cols, rows: p.rows }));
  const datumAt = GridSampler({ minX: patch.minX, minZ: patch.minZ, cellM: patch.cellM, cols: patch.cols, rows: patch.rows }, patch.heights);
  const newSegments = L1218TrenchSegments(datumAt);
  const segIds = new Set(newSegments.map((s) => s.id));
  const otherSegments = trenches.segments.filter((s) => !segIds.has(s.id) && !String(s.group || "").startsWith(GROUP));
  trenches.segments = [...otherSegments, ...newSegments];
  trenches.noBerm = [...(trenches.noBerm || []).filter((z) => !(Number.isFinite(z.minZ) ? z.minZ >= SEAM_Z : Array.isArray(z.line) ? z.line.every((p) => p[1] >= SEAM_Z) : z.z >= SEAM_Z)), ...L1218NoBerm()];
  report.push(`样条沟：${doc.trenches.segments.length} → ${trenches.segments.length} 段（11–18 两段换成第四版）；基准面第二块 ${patch.cols}×${patch.rows}（x ${patch.minX}…${patch.minX + patch.cols}、z ${patch.minZ}…${patch.minZ + patch.rows}）`);

  // 5. 拼文档（键的顺序不变）
  const out = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === "bounds") out[k] = { ...v, maxZ: L1218_BOUNDS.maxZ };
    else if (k === "terrain") out[k] = terrain;
    else if (k === "source") out[k] = { ...v, notes: v.notes && v.notes.includes("第四版布局") ? v.notes : `${v.notes || ""}${v.notes ? " " : ""}${SOURCE_NOTE}` };
    else if (k === "paint") out[k] = paint;
    else if (k === "ways") out[k] = { ...v, roads, trenches: wayTrenches };
    else if (k === "trenches") out[k] = trenches;
    else if (k === "markers") out[k] = markers;
    else if (k === "objects") out[k] = objects;
    else out[k] = v;
  }
  const events = [...new Set(objects.flatMap((o) => [o.hideOn, o.showOn]).filter(Boolean))];
  const missing = events.filter((e) => !SCENE_EVENTS[e]);
  if (missing.length) throw new Error(`剧情事件没有中文名（Data_SceneEvents）：${missing.join("、")}`);
  const leftover = events.filter((e) => OLD_SIGNALS.includes(e));
  if (leftover.length) throw new Error(`第三版的剧情事件还在：${leftover.join("、")}`);
  for (const sg of Object.values(L1218_SIGNALS)) if (!events.includes(sg)) throw new Error(`七个剧情事件缺 ${sg} 的物件`);
  const check = ValidateScene(out);
  if (!check.ok) throw new Error(`重建出来的场景过不了校验：${check.errors.slice(0, 8).join("；")}`);
  return { doc: out, heights, patches, report };
}

function Main() {
  const check = process.argv.includes("--check");
  for (const { id, formal } of SCENES) {
    const dir = path.join(ROOT, SceneDir(id)), file = path.join(dir, SceneFileName(id));
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    const pre = DecodeSceneHeights(fs.readFileSync(path.join(dir, doc.terrain.file)), doc.terrain);
    const datum = DecodeTrenchDatum(doc.trenches.datum, fs.readFileSync(path.join(dir, doc.trenches.datum.file)));
    const { doc: out, heights, patches, report } = Rebuild1218(doc, pre, datum, { formal });
    console.log(`== ${id} ==`);
    for (const line of report) console.log(`- ${line}`);
    if (check) continue;
    fs.writeFileSync(file, FormatSceneJson(out));
    fs.writeFileSync(path.join(dir, out.terrain.file), EncodeSceneHeights(heights));
    fs.writeFileSync(path.join(dir, out.trenches.datum.file), EncodeTrenchDatum(patches));
    console.log(`写了 ${SceneDir(id)}/${SceneFileName(id)}（${out.objects.length} 个物件、${out.markers.length} 个地标、${out.paint.length} 项涂色）、${out.terrain.file}、${out.trenches.datum.file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) Main();
