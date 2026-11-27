// Timeline 命令行（支持 v1 白盒预演 Timeline 与 v2 Unity-style 自包含 Timeline）。纯 Node，不起浏览器。
//
//   node Taierzhuang1938/Script_TimelineCli.mjs list
//   node Taierzhuang1938/Script_TimelineCli.mjs show  [Id] [--segment=01-2]
//   node Taierzhuang1938/Script_TimelineCli.mjs check [Id]
//   node Taierzhuang1938/Script_TimelineCli.mjs deps  [Id]               打印 v2 Timeline 的静态依赖清单（预热用）
//   node Taierzhuang1938/Script_TimelineCli.mjs compile-v2 <V1Id> --out=<Id> [--keyframes=a,b,c] [--drop=Squad1,Squad2,Squad3] [--signals=Stage0105Done]
//   node Taierzhuang1938/Script_TimelineCli.mjs sync  [Id]               v1 拷贝同步
//   node Taierzhuang1938/Script_TimelineCli.mjs new <Id> --from=<Level> --keyframes=a,b,c [--title=…]

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  TIMELINES, TIMELINE_V2_CATALOG, DEFAULT_TIMELINE_ID, TIMELINE_SCHEMA,
  FindTimeline, FindTimelineV2, ValidateTimeline, VoiceLineTable,
  TimelineLayout, TimelineTracks, DescribeTimeline, TIMELINE_LINE_FALLBACK_S,
} from "./Script_TimelinePlan.mjs";
import {
  TIMELINE_V2_SCHEMA, IsTimelineV2, ValidateTimelineAsset, NormalizeTimelineAsset,
  CollectTimelineDependencies, TimelineAssetOverview, CompileLegacyTimelineToV2,
  BuildVoiceLineMap, TIMELINE_V2_LINE_FALLBACK_S,
} from "./Script_TimelineAsset.mjs";
import { FormatTimecode } from "./Script_TimelinePlan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [command = "list", ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => {
  const [k, ...v] = a.slice(2).split("=");
  return [k, v.join("=") || true];
}));
const positional = rest.filter((a) => !a.startsWith("--"));

const ReadJson = (rel) => JSON.parse(fs.readFileSync(path.join(HERE, rel.replace(/^\.\//, "")), "utf8"));
const Exists = (rel) => fs.existsSync(path.join(HERE, rel.replace(/^\.\//, "")));
const Sha1 = (text) => createHash("sha1").update(text).digest("hex");
const Today = () => new Date().toISOString().slice(0, 10);

function FindAny(id) {
  const v2 = FindTimelineV2(id);
  if (v2) return { version: 2, entry: v2 };
  const v1 = FindTimeline(id);
  if (v1) return { version: 1, entry: v1 };
  return null;
}

function Load(id) {
  const found = FindAny(id);
  if (!found) {
    const all = [...TIMELINES.map((t) => t.id), ...TIMELINE_V2_CATALOG.map((t) => t.id)].join(", ");
    throw new Error(`没有登记这份 Timeline：${id}（已登记：${all}）`);
  }
  const { entry } = found;
  const doc = ReadJson(entry.file);
  const voice = doc.voice && Exists(doc.voice) ? ReadJson(doc.voice) : null;
  if (IsTimelineV2(doc)) {
    const norm = NormalizeTimelineAsset(doc);
    const table = BuildVoiceLineMap(voice);
    const overview = TimelineAssetOverview(norm, { lineInfo: (lid) => table.get(lid) || null });
    const deps = CollectTimelineDependencies(norm);
    return { version: 2, entry, doc: norm, rawDoc: doc, voice, overview, deps };
  }
  const config = doc.level && Exists(`Blockout/${doc.level}.json`) ? ReadJson(`Blockout/${doc.level}.json`) : null;
  const table = VoiceLineTable(voice);
  const lineDuration = (lineId) => table.get(lineId)?.durationS ?? TIMELINE_LINE_FALLBACK_S;
  const layout = TimelineLayout(doc, { lineDuration });
  const tracks = TimelineTracks(doc, layout, { lineInfo: (lineId) => table.get(lineId) || null });
  return { version: 1, entry, doc, config, voice, layout, tracks };
}

function CopySequences(level, keyframes) {
  const rel = `Blockout/${level}.previz.json`;
  const text = fs.readFileSync(path.join(HERE, rel), "utf8");
  const previz = JSON.parse(text);
  const sequences = keyframes.map((kf) => {
    const seq = previz.sequences.find((s) => s.keyframe === kf);
    if (!seq) throw new Error(`${rel} 里没有关键帧 ${kf} 的预演`);
    return JSON.parse(JSON.stringify(seq));
  });
  return { rel, previz, sequences, sha1: Sha1(text) };
}

function Write(relFile, doc) {
  const abs = path.join(HERE, relFile);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

function Check(id) {
  const loaded = Load(id);
  if (loaded.version === 2) {
    const result = ValidateTimelineAsset(loaded.rawDoc, { voice: loaded.voice });
    console.log(`[v2] ${id} (${loaded.doc.mode})：${loaded.doc.tracks.length} 轨 / ${loaded.overview.durationS.toFixed(2)} s · 错误 ${result.errors.length} · 警告 ${result.warnings.length}`);
    for (const e of result.errors) console.log(`  ✗ ${e}`);
    for (const w of result.warnings) console.log(`  · ${w}`);
    return result.ok;
  }
  const { doc, config, voice, layout } = loaded;
  const result = ValidateTimeline(doc, { config, voice });
  console.log(`[v1] ${id}：${layout.segments.length} 段 / ${layout.durationS.toFixed(2)} s · 错误 ${result.errors.length} · 警告 ${result.warnings.length}`
    + (config ? "" : "（没找到关卡配置，关键帧没核对）") + (voice ? "" : "（没找到台词清单，台词 id 没核对）"));
  for (const e of result.errors) console.log(`  ✗ ${e}`);
  for (const w of result.warnings) console.log(`  · ${w}`);
  return result.ok;
}

try {
  if (command === "list") {
    for (const entry of TIMELINES) {
      const { doc, layout } = Load(entry.id);
      console.log(`[v1] ${entry.id}  ${doc.title || entry.title}  ${layout.segments.length} 段 ${layout.durationS.toFixed(2)} s  关卡 ${doc.level}  ${entry.file}`
        + (entry.ownsPreviz ? `  · ${doc.level} 这几段预演的原件` : "  · 拷贝"));
    }
    for (const entry of TIMELINE_V2_CATALOG) {
      if (!Exists(entry.file)) {
        console.log(`[v2] ${entry.id}  (未生成)  ${entry.file}`);
        continue;
      }
      const { doc, overview } = Load(entry.id);
      console.log(`[v2] ${entry.id}  ${doc.title || entry.title}  mode=${doc.mode}  ${doc.tracks.length} 轨 ${overview.durationS.toFixed(2)} s  ${entry.file}`);
    }
  } else if (command === "show") {
    const loaded = Load(positional[0] || DEFAULT_TIMELINE_ID);
    if (loaded.version === 2) {
      const { doc, overview } = loaded;
      console.log(`[v2] ${doc.id} · ${doc.title || ""} · mode=${doc.mode} · inputLock=${doc.inputLock} · ${doc.tracks.length} 轨 · ${overview.durationS.toFixed(2)} s（${FormatTimecode(overview.durationS)}）`);
      console.log(`  bindings (${doc.bindings.length}): ${doc.bindings.map((b) => `${b.slot}:${b.type}(${b.onMissing})`).join(", ")}`);
      console.log(`  spawns (${doc.spawns.length}): ${doc.spawns.map((s) => `${s.slot}:${s.prefab}`).join(", ")}`);
      for (const seg of overview.segments) {
        console.log(`  ■ ${seg.id} ${seg.title}  ${FormatTimecode(seg.start)} → ${FormatTimecode(seg.end)}（${seg.durationS.toFixed(2)} s）`);
      }
      console.log(`  镜头 ${overview.shots.length} · 台词 ${overview.lines.length} · 事件 ${overview.events.length}`);
    } else {
      console.log(DescribeTimeline(loaded.doc, loaded.layout, loaded.tracks, { segment: typeof flags.segment === "string" ? flags.segment : null }));
    }
  } else if (command === "deps") {
    const id = positional[0] || TIMELINE_V2_CATALOG[0]?.id;
    const loaded = Load(id);
    if (loaded.version !== 2) throw new Error(`${id} 是 v1 文件，deps 仅支持 v2 Timeline`);
    console.log(JSON.stringify(loaded.deps, null, 2));
  } else if (command === "check") {
    const ids = positional.length
      ? positional
      : [...TIMELINES.map((t) => t.id), ...TIMELINE_V2_CATALOG.filter((t) => Exists(t.file)).map((t) => t.id)];
    let ok = true;
    for (const id of ids) ok = Check(id) && ok;
    process.exitCode = ok ? 0 : 1;
  } else if (command === "compile-v2") {
    const v1Id = positional[0] || DEFAULT_TIMELINE_ID;
    const v1Entry = FindTimeline(v1Id);
    if (!v1Entry) throw new Error(`找不到 v1 源 Timeline：${v1Id}`);
    const outId = typeof flags.out === "string" ? flags.out : `${v1Id}Campaign`;
    const v1Doc = ReadJson(v1Entry.file);
    const config = ReadJson(`Blockout/${v1Doc.level}.json`);
    const voice = v1Doc.voice && Exists(v1Doc.voice) ? ReadJson(v1Doc.voice) : null;
    const sequenceIds = typeof flags.keyframes === "string" ? flags.keyframes.split(",").map((s) => s.trim()).filter(Boolean) : null;
    const dropUnits = typeof flags.drop === "string" ? flags.drop.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const baseSignals = typeof flags.signals === "string" ? flags.signals.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const v2 = CompileLegacyTimelineToV2(v1Doc, config, {
      id: outId,
      title: typeof flags.title === "string" ? flags.title : `${v1Doc.title || v1Id}`,
      mode: typeof flags.mode === "string" ? flags.mode : "cinematic",
      sequenceIds,
      dropUnits,
      voice,
      baseSignals,
    });
    const outRel = `Timeline/${outId}.timeline.json`;
    Write(outRel, v2);
    const check = ValidateTimelineAsset(v2, { voice });
    console.log(`已编译自包含 v2 Timeline → ${outRel}（${v2.segments.length} 段，${v2.tracks.length} 轨，${v2.durationS.toFixed(2)} s，bindings=${v2.bindings.length}，spawns=${v2.spawns.length}）`);
    if (!check.ok) {
      for (const e of check.errors) console.error(`  ✗ ${e}`);
      process.exitCode = 1;
    }
  } else if (command === "sync") {
    const id = positional[0] || DEFAULT_TIMELINE_ID;
    const entry = FindTimeline(id);
    if (!entry) throw new Error(`没有登记这份 v1 Timeline：${id}`);
    if (entry.ownsPreviz) throw new Error(`${id} 是 ${entry.level} 这几段预演的原件（ownsPreviz），不从预演往回拷；改它直接改 ${entry.file}`);
    const doc = ReadJson(entry.file);
    const from = doc.copiedFrom;
    if (!from) throw new Error(`${id} 不是拷贝来的（没有 copiedFrom），没法 sync`);
    const level = path.basename(from.file).replace(/\.previz\.json$/, "");
    const copy = CopySequences(level, from.keyframes);
    doc.sequences = copy.sequences;
    doc.voice = copy.previz.voice;
    doc.faceTracks = copy.previz.faceTracks;
    doc.copiedFrom = { ...from, at: Today(), sha1: copy.sha1 };
    Write(entry.file, doc);
    console.log(`已从 ${copy.rel} 重新拷 ${from.keyframes.join(", ")} → ${entry.file}`);
    process.exitCode = Check(id) ? 0 : 1;
  } else if (command === "new") {
    const id = positional[0];
    if (!id || !/^[A-Z][A-Za-z0-9]*$/.test(id)) throw new Error("new 要一个 PascalCase 的 Id");
    if (typeof flags.from !== "string" || typeof flags.keyframes !== "string") throw new Error("new 要 --from=<Level> --keyframes=a,b,c");
    const keyframes = flags.keyframes.split(",").map((s) => s.trim()).filter(Boolean);
    const copy = CopySequences(flags.from, keyframes);
    const entry = { id, file: `Timeline/${id}.timeline.json` };
    if (Exists(entry.file)) throw new Error(`${entry.file} 已经有了`);
    const doc = {
      schema: TIMELINE_SCHEMA, id, title: typeof flags.title === "string" ? flags.title : id, level: flags.from,
      copiedFrom: { file: copy.rel, keyframes, at: Today(), sha1: copy.sha1 },
      voice: copy.previz.voice, faceTracks: copy.previz.faceTracks, sequences: copy.sequences,
    };
    Write(entry.file, doc);
    console.log(`写了 ${entry.file}（${keyframes.length} 段）。在 Script_TimelinePlan.TIMELINES 里加一行：`);
    console.log(`  Object.freeze({ id: "${id}", title: "${doc.title}", level: "${flags.from}", file: "${entry.file}" }),`);
  } else {
    console.log("用法见文件头：list / show / check / deps / compile-v2 / sync / new");
    process.exitCode = 2;
  }
} catch (error) {
  console.error(String(error?.message || error));
  process.exitCode = 1;
}
