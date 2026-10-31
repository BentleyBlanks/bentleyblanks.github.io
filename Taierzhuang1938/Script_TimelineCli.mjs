// Timeline 的命令行（给 agent 用；人用的是白盒编辑器底下那条 Timeline 面板）。纯 Node，不起浏览器。
//
//   node Taierzhuang1938/Script_TimelineCli.mjs list
//   node Taierzhuang1938/Script_TimelineCli.mjs show  [Id] [--segment=01-2]   按主时间轴列出每段的镜头 / 台词 / 事件
//   node Taierzhuang1938/Script_TimelineCli.mjs check [Id]                    核对（关键帧、单位、台词 id、时长）；有错退出 1
//   node Taierzhuang1938/Script_TimelineCli.mjs sync  [Id]                    照 copiedFrom 从白盒预演重新拷一遍（覆盖本地改动）
//   node Taierzhuang1938/Script_TimelineCli.mjs new <Id> --from=<Level> --keyframes=a,b,c [--title=…]
//        从某关白盒预演拷几段建一份新的（写 Timeline/<Id>.timeline.json，并提示在 Script_TimelinePlan.TIMELINES 登记）
//
// 改内容：直接改 Timeline/<Id>.timeline.json（子序列字段口径 docs/Data_EditorBlockout.md §14.1），
// 开着的 Timeline 面板 2 s 内重读。浏览器里取状态 / 拖到某一秒走 window.Tengxian.Debug.Blockout.Timeline。

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  TIMELINES, DEFAULT_TIMELINE_ID, TIMELINE_SCHEMA, FindTimeline, ValidateTimeline, VoiceLineTable,
  TimelineLayout, TimelineTracks, DescribeTimeline, TIMELINE_LINE_FALLBACK_S,
} from "./Script_TimelinePlan.mjs";

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

function Load(id) {
  const entry = FindTimeline(id);
  if (!entry) throw new Error(`没有登记这份 Timeline：${id}（已登记：${TIMELINES.map((t) => t.id).join(", ")}）`);
  const doc = ReadJson(entry.file);
  const config = Exists(`Blockout/${doc.level}.json`) ? ReadJson(`Blockout/${doc.level}.json`) : null;
  const voice = doc.voice && Exists(doc.voice) ? ReadJson(doc.voice) : null;
  const table = VoiceLineTable(voice);
  const lineDuration = (lineId) => table.get(lineId)?.durationS ?? TIMELINE_LINE_FALLBACK_S;
  const layout = TimelineLayout(doc, { lineDuration });
  const tracks = TimelineTracks(doc, layout, { lineInfo: (lineId) => table.get(lineId) || null });
  return { entry, doc, config, voice, layout, tracks };
}

/** 从白盒预演拷子序列（深拷贝，原样）。 */
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

function Write(entry, doc) {
  fs.mkdirSync(path.dirname(path.join(HERE, entry.file)), { recursive: true });
  fs.writeFileSync(path.join(HERE, entry.file), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

function Check(id) {
  const { doc, config, voice, layout } = Load(id);
  const result = ValidateTimeline(doc, { config, voice });
  console.log(`${id}：${layout.segments.length} 段 / ${layout.durationS.toFixed(2)} s · 错误 ${result.errors.length} · 警告 ${result.warnings.length}`
    + (config ? "" : "（没找到关卡配置，关键帧没核对）") + (voice ? "" : "（没找到台词清单，台词 id 没核对）"));
  for (const e of result.errors) console.log(`  ✗ ${e}`);
  for (const w of result.warnings) console.log(`  · ${w}`);
  return result.ok;
}

try {
  if (command === "list") {
    for (const entry of TIMELINES) {
      const { doc, layout } = Load(entry.id);
      console.log(`${entry.id}  ${doc.title || entry.title}  ${layout.segments.length} 段 ${layout.durationS.toFixed(2)} s  关卡 ${doc.level}  ${entry.file}`);
    }
  } else if (command === "show") {
    const { doc, layout, tracks } = Load(positional[0] || DEFAULT_TIMELINE_ID);
    console.log(DescribeTimeline(doc, layout, tracks, { segment: typeof flags.segment === "string" ? flags.segment : null }));
  } else if (command === "check") {
    const ids = positional.length ? positional : TIMELINES.map((t) => t.id);
    let ok = true;
    for (const id of ids) ok = Check(id) && ok;
    process.exitCode = ok ? 0 : 1;
  } else if (command === "sync") {
    const id = positional[0] || DEFAULT_TIMELINE_ID;
    const entry = FindTimeline(id);
    const doc = ReadJson(entry.file);
    const from = doc.copiedFrom;
    if (!from) throw new Error(`${id} 不是拷贝来的（没有 copiedFrom），没法 sync`);
    const level = path.basename(from.file).replace(/\.previz\.json$/, "");
    const copy = CopySequences(level, from.keyframes);
    doc.sequences = copy.sequences;
    doc.voice = copy.previz.voice;
    doc.faceTracks = copy.previz.faceTracks;
    doc.copiedFrom = { ...from, at: Today(), sha1: copy.sha1 };
    Write(entry, doc);
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
    Write(entry, doc);
    console.log(`写了 ${entry.file}（${keyframes.length} 段）。在 Script_TimelinePlan.TIMELINES 里加一行：`);
    console.log(`  Object.freeze({ id: "${id}", title: "${doc.title}", level: "${flags.from}", file: "${entry.file}" }),`);
  } else {
    console.log("用法见文件头：list / show / check / sync / new");
    process.exitCode = 2;
  }
} catch (error) {
  console.error(String(error?.message || error));
  process.exitCode = 1;
}
