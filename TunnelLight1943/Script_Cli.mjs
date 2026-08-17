// 《地道里的光》命令行工作台 —— 给 agent（和人）问游戏问题用的。
//
// 为什么有这东西：翻了 12 天的会话记录，改这个游戏的开销七成花在**定位**上
// （Read/Grep 打在源码上 ≈149 万 token），另有 ≈40 万花在**现写一次性探针**上
// （12 天里落了 234 个 scratchpad 脚本 + 319 次 node -e）。测试反倒是便宜的
// （≈23 万）。也就是说贵的不是"跑一遍"，是"这东西在哪"和"我想看一眼当时的状态"。
// 每个新会话、每个 subagent 都要把 7000 行的 Script_Core 重趟一遍才知道
// c1_ropeline 在哪一行——同一段 300 行被反复读了 19 次。
//
// 所以这里只做三件事：告诉你东西在哪（where/beats/beat）、让你无头地把游戏
// 跑到任意一拍并把状态打出来（state）、把实拍那套固化成一条命令（shot）。
//
//   node TunnelLight1943/Script_Cli.mjs where 锄头
//   node TunnelLight1943/Script_Cli.mjs beat c1_well
//   node TunnelLight1943/Script_Cli.mjs state c1_well --x 43.0 --input "e,d*90"
//   node TunnelLight1943/Script_Cli.mjs shot c1_well --hold d --dur 4 --phases 6
//   node TunnelLight1943/Script_Cli.mjs shot "c2_digout@x=42.3,level=under,digStarted=0" "c2_digout@x=43,level=under,tunnelDug=1,out=通了"
//   node TunnelLight1943/Script_Cli.mjs shot "c1_dusk@line=9,at=2.6,zoom=sister"   ← 钉到某句台词某一秒 + 裁近景
//   node TunnelLight1943/Script_Cli.mjs doctor
//
// 铁律：**要问游戏状态先跑这个，别再现写探针脚本**。缺什么子命令就往这儿加，
// 加完写进 CLAUDE.md——一次性脚本写完就扔，下一个 agent 还得重写一遍。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
const argv = process.argv.slice(2);
const cmd = argv[0];
const rest = argv.slice(1);

// --k v / --flag 解析。位置参数原样留在 _ 里
function Opts(list) {
  const o = { _: [] };
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (!a.startsWith("--")) { o._.push(a); continue; }
    const k = a.slice(2);
    const next = list[i + 1];
    if (next === undefined || next.startsWith("--")) o[k] = true;
    else { o[k] = next; i += 1; }
  }
  return o;
}

// ---------------------------------------------------------------------------
// where：一张全仓索引。**纯正则扫文件，不 import**——Script_World/Script_Rig
// 都 import three，在 node 里加载不起来，而"这东西在哪"恰恰最需要能随时问。
// ---------------------------------------------------------------------------
// 剧本按章拆在 Data_ScriptC1..C8.mjs（2026-08-15）——节拍的正则打在章文件上。
// 中文条目（台词/提示语/章目标/手记）也一起进索引：策划口里的名字（「车铃」
// 「匀稠的」）多半只出现在这些字符串里，光索引英文标识符等于把一半的问题
// 挡在门外（2026-08-15 补，起因是 `where 车铃` 查无此物）。
const CHAPTER_FILES = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Data_ScriptC${n}.mjs`);
const ZH_TEXT_PATTERNS = [
  [/\bprompt: "([^"]{2,})"/, (m) => [[m[1], "提示语"]]],
  [/\bsay: "([^"]{2,})"/, (m) => [[m[1], "台词"]]],
  [/\bstage: "([^"]{2,})"/, (m) => [[m[1], "旁白"]]],
  [/\bobjective: "([^"]{2,})"/, (m) => [[m[1], "章目标"]]],
  [/\bnote: "([^"]{2,})"/, (m) => [[m[1], "手记"]]],
];
const BEAT_PATTERNS = [
  [/^\s*(?:kind|id): "([a-zA-Z0-9_]+)",?\s*id: "([a-zA-Z0-9_]+)"/, (m) => [[m[2], `节拍 ${m[1]}`]]],
  [/^\s*kind: "([a-zA-Z]+)", id: "([a-zA-Z0-9_]+)"/, (m) => [[m[2], `节拍 ${m[1]}`]]],
  ...ZH_TEXT_PATTERNS,
];
const FN_PATTERNS = (tag) => [
  [/^\s*(?:export )?(?:async )?function ([A-Za-z0-9_]+)\s*\(/, (m) => [[m[1], tag]]],
  [/^\s*(?:export )?const ([A-Z][A-Z0-9_]{2,})\s*=/, (m) => [[m[1], `${tag}常量`]]],
];
const INDEX_SOURCES = [
  ...CHAPTER_FILES.map((f) => [f, BEAT_PATTERNS]),
  ["Script_Core.mjs", [
    [/^\s*export function ([A-Za-z0-9_]+)/, (m) => [[m[1], "Core 导出函数"]]],
    [/^\s*function ([A-Za-z0-9_]+)\s*\(/, (m) => [[m[1], "Core 内部函数"]]],
    [/^\s*(?:export )?const ([A-Z][A-Z0-9_]{2,})\s*=/, (m) => [[m[1], "Core 常量"]]],
    [/\{ type: "([a-zA-Z]+)"/, (m) => [[m[1], "链步骤类型"]]],
    [/^\s*title: "([^"]+)"/, (m) => [[m[1], "章名"]]],
    ...ZH_TEXT_PATTERNS,          // 执行器里现写的微过场台词也在 Core
  ]],
  ["Script_World.js", [
    [/^\s*(?:export )?function ([A-Za-z0-9_]+)\s*\(/, (m) => [[m[1], "World 函数"]]],
    [/^\s*const ([A-Z][A-Z0-9_]{2,})\s*=/, (m) => [[m[1], "World 常量"]]],
  ]],
  // 无状态画笔/绘制序（2026-08-15 从 CreateWorld 闭包抽出）
  ["Script_WorldPaint.mjs", FN_PATTERNS("World 画笔/绘制序")],
  ["Script_Art.mjs", [
    [/^export function (Draw[A-Za-z0-9_]*)/, (m) => [[m[1], "画笔"]]],
    [/label === "([^"]+)"/, (m) => [[m[1], "携带物画法（DrawCarry）"]]],
  ]],
  ["Script_Rig.mjs", [
    [/^\s{2}([a-zA-Z][a-zA-Z0-9]*): \{$/, (m) => [[m[1], "骨架轨道"]]],
    [/s\.pose === "([a-zA-Z0-9]+)"/, (m) => [[m[1], "骨架姿势"]]],
  ]],
  ["Script_Main.js", [
    [/^\s*function ([A-Za-z0-9_]+)\s*\(/, (m) => [[m[1], "外壳函数"]]],
    [/^\s*const ([A-Z][A-Z0-9_]{2,})\s*=/, (m) => [[m[1], "外壳常量"]]],  // PLAY_HW 这一级
  ]],
  ["Script_SmokeTest.mjs", [[/^function (Test[A-Za-z0-9_]+)/, (m) => [[m[1], "回归测试"]]]]],
  // 声音这一侧（2026-08-15 补：改声音以前只能退回 grep）
  ["Script_Audio.js", FN_PATTERNS("Audio 函数")],
  ["Script_Soundtrack.js", FN_PATTERNS("Soundtrack 函数")],
  ["Script_Light.mjs", FN_PATTERNS("Light 函数")],
  ["Script_Fluid.mjs", FN_PATTERNS("Fluid 函数")],
  ["Data_BgmConfig.mjs", [
    [/^\s*(?:export )?const ([A-Z][A-Z0-9_]{2,})\s*=/, (m) => [[m[1], "BGM 配置"]]],
    [/"(AudioBgm_[A-Za-z0-9_]+)/, (m) => [[m[1], "BGM 曲目"]]],
  ]],
  ["Data_AudioMix.mjs", [
    [/^\s*(?:export )?const ([A-Z][A-Z0-9_]{2,})\s*=/, (m) => [[m[1], "混音配置"]]],
    [/^\s*([a-zA-Z][a-zA-Z0-9]*):\s*-?[\d.]+,?/, (m) => [[m[1], "混音电平"]]],
  ]],
  ["Data_VoiceCast.json", [[/^\s{2}"([a-zA-Z0-9_]+)": \{/, (m) => [[m[1], "配音角色"]]]]],
  ["Audio/Sfx/Data_SfxManifest.json", [[/^\s*"([a-zA-Z0-9_]+)": \{/, (m) => [[m[1], "音效 cue"]]]]],
  // HUD：DOM 元素与样式选择器（拇指遮挡这类 bug 全在这两层）
  ["index.html", [[/id="([A-Za-z0-9_]+)"/, (m) => [[m[1], "HUD 元素（DOM id）"]]]]],
  ["Style_Game.css", [
    [/^\s*#([A-Za-z][A-Za-z0-9_-]*)/, (m) => [[m[1], "样式（#id）"]]],
    [/^\s*\.([A-Za-z][A-Za-z0-9_-]*)/, (m) => [[m[1], "样式（.class）"]]],
  ]],
  ["Data_PropArt.json", [[/^\s{4}"([a-zA-Z0-9_]+)": \{/, (m) => [[m[1], "道具登记（画笔/深度带/画布）"]]]]],
  ["Data_Scenes.json", [
    [/"kind": "([a-zA-Z0-9_]+)"/, (m) => [[m[1], "场景里摆着的物体"]]],
    [/"name": "([^"]+)"/, (m) => [[m[1], "老物件（收藏品）"]]],
  ]],
  ["Data_DepthSpec.mjs", [[/^\s*([a-zA-Z][a-zA-Z0-9]*):\s*-?[\d.]+,/, (m) => [[m[1], "深度带/尺度常量"]]]]],
  ["CLAUDE.md", [[/^#{2,4} (.+)$/, (m) => [[m[1], "项目规范章节"]]]]],
  ["Data_StoryC1.md", [
    [/^#{1,3} (.+)$/, (m) => [[m[1], "剧情文档章节"]]],
    [/^([①-⑮]) (?:§\d+ )?\*{0,2}([^（(*]+)/, (m) => [[m[2].trim(), "c1 场次（剧情文档）"]]],
  ]],
  ["Data_DesignHistory.md", [[/^#{1,3} (.+)$/, (m) => [[m[1], "沿革文档章节"]]]]],
];

function BuildIndex() {
  const out = [];
  for (const [file, rules] of INDEX_SOURCES) {
    const fp = path.join(DIR, file);
    if (!fs.existsSync(fp)) continue;
    const lines = fs.readFileSync(fp, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      for (const [re, pick] of rules) {
        const m = re.exec(lines[i]);
        if (!m) continue;
        for (const [name, what] of pick(m)) out.push({ name, what, file, line: i + 1 });
      }
    }
  }
  // 同名同类只留第一处（链步骤类型这种会命中几十遍）
  const seen = new Set();
  return out.filter((r) => {
    const k = r.name + "|" + r.what;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function CmdWhere(o) {
  const q = (o._[0] || "").toLowerCase();
  if (!q) { console.log("用法：where <名字片段>   例：where 锄头 / where ropeline / where DrawHen"); return; }
  const idx = BuildIndex();
  const hit = idx.filter((r) => r.name.toLowerCase().includes(q) || r.what.toLowerCase().includes(q));
  if (!hit.length) {
    console.log(`没找到「${o._[0]}」。索引里有 ${idx.length} 条；试试更短的片段，或 grep 一把。`);
    return;
  }
  // 精确匹配排前面，其余按文件聚
  hit.sort((a, b) => (b.name.toLowerCase() === q) - (a.name.toLowerCase() === q) || a.file.localeCompare(b.file) || a.line - b.line);
  for (const r of hit.slice(0, Number(o.limit || 40))) {
    console.log(`  ${r.name.padEnd(24)} ${r.what.padEnd(22)} TunnelLight1943/${r.file}:${r.line}`);
  }
  if (hit.length > 40) console.log(`  …共 ${hit.length} 条（--limit 调）`);
}

// ---------------------------------------------------------------------------
// anims / anim：骨架里有哪些动作、各叫什么名、在哪一行、谁在用。
// 与浏览器里的动画工作台（设置 → 调试 · 动画工作台 / F4 / ?anim=名字）同一份索引
// （Script_AnimIndex 纯正则扫源码）——工作台负责"看"，这里负责在对话/终端里"点名"。
//   anims             全部清单（轨道 / 姿势 / 步态）
//   anims scoop       名字/说明/节拍里带 scoop 的
//   anim scoopChild   一条的全部：说明、关键帧表、驱动、用在哪几拍、一行引用
// ---------------------------------------------------------------------------
async function AnimIndex() {
  const { ScanAnimIndex } = await import("./Script_AnimIndex.mjs");
  return ScanAnimIndex((f) => { try { return fs.readFileSync(path.join(DIR, f), "utf8"); } catch { return null; } });
}
async function CmdAnims(o) {
  const { FormatRef, KIND_LABEL, DominantKind } = await import("./Script_AnimIndex.mjs");
  const idx = await AnimIndex();
  const q = (o._[0] || "").toLowerCase();
  const rows = [];
  for (const t of Object.values(idx.tracks)) rows.push({ type: "轨道", name: t.name, line: t.line, meta: `${t.dur?.toFixed(2)}s ${t.loop ? "循环" : "单次"} ${t.keys.length}帧`, e: t, hay: `${t.name} ${t.comment} ${t.usages.map((u) => u.beat || u.fn || "").join(" ")}` });
  for (const p of Object.values(idx.poses)) rows.push({ type: "姿势", name: p.name, line: p.line, meta: p.progress ? "进度驱动" : p.calmBreath ? "静态·呼吸" : "静态", e: p, hay: `${p.name} ${p.comment} ${p.usages.map((u) => u.beat || u.fn || "").join(" ")}` });
  for (const L of idx.locomotion) rows.push({ type: "步态", name: L.id, line: L.line, meta: L.label, e: L, hay: `${L.id} ${L.label} ${L.comment}` });
  const hit = rows.filter((r) => !q || r.hay.toLowerCase().includes(q));
  if (o.json) { console.log(JSON.stringify(hit.map((r) => ({ type: r.type, name: r.name, line: r.line, meta: r.meta, ref: FormatRef({ type: r.type === "轨道" ? "track" : r.type === "姿势" ? "pose" : "loco", ...r.e }) })), null, 1)); return; }
  if (!hit.length) { console.log(`没找到「${o._[0]}」。索引里有 ${rows.length} 条：${idx.counts.tracks} 轨道 / ${idx.counts.poses} 姿势 / ${idx.counts.locomotion} 步态`); return; }
  for (const r of hit) {
    const us = (r.e.usages || []).filter((u) => u.kind !== "check" && u.kind !== "ref");
    const beats = [...new Set(us.map((u) => u.beat || u.fn).filter(Boolean))];
    const who = DominantKind(r.e.usages);
    const where = r.type === "步态" ? "" : beats.length ? `用于 ${beats.slice(0, 3).join("/")}${beats.length > 3 ? `…共${beats.length}` : ""}` : "（无引用）";
    console.log(`  ${r.type} ${r.name.padEnd(18)} ${String(r.meta).padEnd(16)} Script_Rig.mjs:${String(r.line ?? "?").padEnd(5)} ${who ? (KIND_LABEL[who] || who).padEnd(4) : "    "} ${where}`);
  }
  console.log(`\n${hit.length} 条（${idx.counts.tracks} 轨道 / ${idx.counts.poses} 姿势 / ${idx.counts.locomotion} 步态）。看一条：anim <名字>；网页里播：设置 → 调试 · 动画工作台（F4）或 ?anim=<名字>`);
}
async function CmdAnim(o) {
  const { FormatRef, KIND_LABEL, RIG_FIELDS } = await import("./Script_AnimIndex.mjs");
  const name = o._[0];
  if (!name) { console.log("用法：anim <名字>   例：anim scoopChild / anim shelter / anim walk"); return; }
  const idx = await AnimIndex();
  const t = idx.tracks[name], p = idx.poses[name], L = idx.locomotion.find((x) => x.id === name);
  const e = t ? { type: "track", ...t } : p ? { type: "pose", ...p } : L ? { type: "loco", ...L } : null;
  if (!e) { console.log(`没有叫「${name}」的轨道/姿势/步态。试试 anims ${name.slice(0, 4)}`); process.exitCode = 1; return; }
  if (o.json) { console.log(JSON.stringify(e, null, 1)); return; }
  console.log(FormatRef(e));
  console.log(`源码  TunnelLight1943/Script_Rig.mjs:${e.line ?? "?"}`);
  if (e.type === "track") {
    console.log(`时长  ${e.dur}s ${e.loop ? "循环" : "单次"} · ${e.keys.length} 帧 · 关节 ${e.joints.length === RIG_FIELDS.length ? "全部 14" : e.joints.join(",")}`);
    const cols = e.joints;
    console.log(`\n  #   t     ${cols.map((c) => c.padStart(6)).join("")}  备注`);
    e.keys.forEach((k, i) => {
      console.log(`  ${String(i + 1).padStart(2)}  ${k.t.toFixed(2).padStart(4)}  ${cols.map((c) => (k.values[c] === undefined ? "·" : String(k.values[c])).padStart(6)).join("")}  ${k.note}`);
    });
  } else if (e.type === "pose") {
    console.log(`类型  ${e.progress ? `进度驱动 · 来源 ${e.progressSource}` : e.calmBreath ? "静态·有呼吸（CALM_BREATH）" + (e.noHip ? "·不动胯" : "") : "静态"}${e.lie ? " · 躺姿（LIE_POSES 整具转 90°）" : ""}${e.usesIK ? " · AimFrontHand 反解" : ""}${e.customBlend ? " · 自定义混合" : ""}`);
    if (e.inputs.length) console.log(`输入  ${e.inputs.map((i) => `${i.key}（${i.label}）`).join("；")}`);
  } else {
    console.log(`分支  ${e.cond} · ${e.label}`);
    if (e.inputs?.length) console.log(`输入  ${e.inputs.map((i) => i.key).join(" ")}`);
  }
  for (const w of e.warnings || []) console.log(`⚠  ${w}`);
  for (const n of e.notes || []) console.log(`·  ${n}`);
  if (e.note) console.log(`·  ${e.note}`);
  if (e.comment) console.log(`\n说明\n${e.comment.split("\n").map((l) => "  " + l).join("\n")}`);
  const us = (e.usages || []);
  const real = us.filter((u) => u.kind !== "check" && u.kind !== "ref");
  console.log(`\n用在哪  ${real.length} 处${us.length - real.length ? `（另 ${us.length - real.length} 处只是判断）` : ""}`);
  for (const u of real) console.log(`  ${(u.file + ":" + u.line).padEnd(26)} ${(u.beat || u.fn || "").padEnd(16)} ${u.kind.padEnd(10)} ${u.subject ? u.subject + (u.kindGuess ? "＝" + (KIND_LABEL[u.kindGuess] || u.kindGuess) : "") : ""}\n      ${u.text}`);
  console.log(`\n网页里播：node TunnelLight1943/Script_Cli.mjs menu anim --anim ${name}   或打开 index.html?anim=${name}`);
}

// ---------------------------------------------------------------------------
// beats / beat：不 import three 也能拿到剧本——Script_Core 只依赖 Data_Scenes
// ---------------------------------------------------------------------------
async function Core() { return import("./Script_Core.mjs"); }

async function CmdBeats(o) {
  const C = await Core();
  const only = o._[0];
  for (let ci = 0; ci < C.CHAPTERS.length; ci += 1) {
    const ch = C.CHAPTERS[ci];
    if (only && only !== ch.id && only !== String(ci + 1)) continue;
    const list = C.ChapterBeatList(ci);
    console.log(`\n${ch.id} ${ch.num} · ${ch.title}   [${ch.scene} / ${ch.light}]  ${list.length} 拍`);
    for (const b of list) {
      console.log(`  ${String(b.index).padStart(3)}  ${(b.id || "-").padEnd(16)} ${(b.kind || "").padEnd(12)} ${b.label || ""}`);
    }
  }
}

/** 在全部章节里找一拍 → {chapterIndex, beatIndex, def} */
async function FindBeat(id) {
  const C = await Core();
  for (let ci = 0; ci < C.CHAPTERS.length; ci += 1) {
    const list = C.ChapterBeatList(ci);
    const hit = list.find((b) => b.id === id);
    if (hit) return { C, ci, bi: hit.index, def: C.SCRIPTS[C.CHAPTERS[ci].id][hit.index] };
  }
  return null;
}

function Brief(v, depth = 0) {
  if (v === null || v === undefined) return String(v);
  if (typeof v === "function") return "ƒ";
  if (Array.isArray(v)) return depth > 1 ? `[${v.length}]` : `[${v.map((x) => Brief(x, depth + 1)).join(", ")}]`;
  if (typeof v === "object") {
    const parts = Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${k}:${Brief(x, depth + 1)}`);
    return `{${parts.join(" ")}}`;
  }
  if (typeof v === "string") return v.length > 46 ? JSON.stringify(v.slice(0, 44) + "…") : JSON.stringify(v);
  return String(v);
}

async function CmdBeat(o) {
  const id = o._[0];
  if (!id) { console.log("用法：beat <beatId>   （beatId 见 beats 子命令）"); return; }
  const found = await FindBeat(id);
  if (!found) { console.log(`没有叫「${id}」的节拍。跑 beats 看全表。`); return; }
  const { C, ci, bi, def } = found;
  const ch = C.CHAPTERS[ci];
  console.log(`${id}   ${ch.id} ${ch.title}   第 ${bi} 拍 / 共 ${C.ChapterBeatList(ci).length}   kind=${def.kind}`);
  console.log(`场景 ${ch.scene}${def.timeOfDay ? " · " + def.timeOfDay : ""}`);
  if (def.objective) console.log(`目标  ${def.objective}`);
  if (def.hint) console.log(`提示  ${def.hint}`);
  if (def.cam) console.log(`镜头  ${Brief(def.cam)}`);
  if (def.zone) console.log(`区域  ${Brief(def.zone)}`);
  for (const k of ["onStart", "tick", "bubbles", "onDone"]) if (def[k]) console.log(`回调  ${k}()`);
  if (Array.isArray(def.steps)) {
    console.log(`步骤 ${def.steps.length}：`);
    def.steps.forEach((st, i) => {
      const bits = Object.entries(st)
        .filter(([k]) => !["effect", "miss", "on"].includes(k))
        .map(([k, v]) => `${k}=${Brief(v)}`);
      console.log(`  ${i}. ${bits.join("  ")}`);
      if (st.effect) console.log("     effect()");
    });
  }
  if (Array.isArray(def.lines)) {
    // 每句标出时长与累计起点：给 shot 的 --dur/--phases 对时用
    //（phases 是在 --dur 里均匀采样，dur 不给够就只拍得到前几句）
    const total = def.lines.reduce((s, l) => s + (l.d || 0), 0);
    console.log(`台词 ${def.lines.length} 句（共 ${total.toFixed(1)}s）：`);
    let acc = 0;
    def.lines.slice(0, Number(o.lines || 6)).forEach((l, i) => {
      const tag = `[${acc.toFixed(1)}s +${(l.d || 0).toFixed(1)}]`;
      acc += l.d || 0;
      // （旁白）＝真上字幕的；（演出）＝只是演出说明，屏幕上一个字都没有
      const mark = l.who ? l.who + "：" : l.stage ? "（旁白）" : l.act ? "（演出）" : "";
      console.log(`  ${i}. ${tag} ${mark}${(l.say || l.stage || l.act || "").slice(0, 60)}`);
    });
    if (def.lines.length > (Number(o.lines || 6))) console.log(`  …（--lines 调）`);
  }
  // 这一拍碰了哪些旗标：从源码文本里扫，比人翻快。
  // 剧本按章拆在 Data_ScriptC*.mjs（2026-08-15），按 id 的章号直接开对应文件
  const chFile = `Data_ScriptC${(id.match(/^c(\d)_/) || [])[1] || "1"}.mjs`;
  const src = fs.readFileSync(path.join(DIR, chFile), "utf8");
  const key = new RegExp(`id: "${id}"`);
  const at = src.split(/\r?\n/).findIndex((l) => key.test(l));
  if (at >= 0) {
    // 只扫到**下一拍**为止。给死 220 行的那一版会把后面几拍的旗标全算进来
    const lines = src.split(/\r?\n/);
    let end = lines.length;
    for (let i = at + 1; i < lines.length; i += 1) {
      if (/^\s*(?:kind: "[a-zA-Z]+", )?id: "c\d_/.test(lines[i])) { end = i; break; }
    }
    const chunk = lines.slice(at, end).join("\n");
    const flags = [...new Set([...chunk.matchAll(/flags\.([a-zA-Z0-9_]+)/g)].map((m) => m[1]))];
    if (flags.length) console.log(`旗标  ${flags.join(" ")}`);
    console.log(`源码  TunnelLight1943/${chFile}:${at + 1}`);
  }
}

// ---------------------------------------------------------------------------
// state：无头把游戏跑到任意一拍，喂真输入，把状态打出来。
// 这一条是冲着那 725 次一次性探针来的。
//
// 输入小语言（--input）：逗号分隔，token*N 表示重复 N 帧
//   d/a 右走/左走   s/w 下梯/上梯   e 按一下交互   E 按住交互
//   c 蹲            . 空转          adv 推过场
// 例：--input "e,d*90,e" = 按一下 E、往右走 90 帧、再按一下 E
// ---------------------------------------------------------------------------
const IDLE = { moveX: 0, climb: 0, crouch: false, interact: false, interactHeld: false, throw: false, advance: false };

// 旗标覆盖（--flag digStarted=0,tunnelDug=1,barrowPlanks=3）。
// 游戏里一堆"是/否"的记号决定画面长什么样：地道挖通没有、门修好没有、
// 车上装了几件料。要拍"没挖通 / 挖了一半 / 挖通了"三张对比图，就得能手拨这些
// 记号——以前只能现写脚本（2026-08-10 用户："开关这个你自己是可以解决的"）。
// 值：1/0/true/false 当布尔，纯数字当数字，其余当字符串。
function ParseFlags(str) {
  const out = {};
  for (const kv of String(str || "").split(",")) {
    const t = kv.trim();
    if (!t) continue;
    const i = t.indexOf("=");
    const k = i < 0 ? t : t.slice(0, i);
    const raw = i < 0 ? "1" : t.slice(i + 1);
    out[k] = raw === "1" || raw === "true" ? true
      : raw === "0" || raw === "false" ? false
        : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  }
  return out;
}
function InputOf(tok) {
  switch (tok) {
    case "d": return { moveX: 1 };
    case "a": return { moveX: -1 };
    case "s": return { climb: 1 };
    case "w": return { climb: -1 };
    case "e": return { interact: true };
    case "E": return { interactHeld: true };
    case "c": return { crouch: true };
    case "adv": return { advance: true };
    case ".": return {};
    // 四动词（2026-08-16）：做功＝按住 E ＋ 一个方向。一个 token 一件事，
    // 按住 E 与方向键分成两个 token 就永远凑不到同一帧上
    case "Ew": return { interactHeld: true, climb: -1 };
    case "Es": return { interactHeld: true, climb: 1 };
    case "Ea": return { interactHeld: true, moveX: -1 };
    case "Ed": return { interactHeld: true, moveX: 1 };
    default: return null;
  }
}

async function CmdState(o) {
  const id = o._[0];
  if (!id) { console.log("用法：state <beatId> [--x 35.6] [--level under] [--input \"e,d*90\"] [--frames 30] [--json]"); return; }
  const found = await FindBeat(id);
  if (!found) { console.log(`没有叫「${id}」的节拍。`); return; }
  const { C, ci, bi } = found;
  const DT = 1 / 30;
  const state = C.CreateGame(ci);
  C.DebugJump(state, ci, bi);
  // --cues：这一段**响了些什么**。声音是唯一一样截图问不出来的东西
  //（序章那团扫荡的动静整个长在耳朵里，画面上一个人都没有），
  // 以前只能现写探针把 state.cues 掏出来。
  // **收完必须清空**：Core 只管往 state.cues 里推，清空是宿主的活
  //（Script_Soundtrack 每帧 `cues.length = 0`）。不照做就是每帧把整条队列
  // 重数一遍——18 秒的序章报出"响了 20951 声"，全是这么来的
  const heard = new Map();
  const step = (inp = {}, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      C.StepGame(state, { ...IDLE, ...inp }, DT);
      for (const c of state.cues || []) {
        const h = heard.get(c.name) || { n: 0, gain: [] };
        h.n += 1;
        if (Number.isFinite(c.gain)) h.gain.push(c.gain);
        heard.set(c.name, h);
      }
      if (state.cues) state.cues.length = 0;
    }
  };
  step({}, 1);
  // 跳进来先把 onStart 起的小过场演完——不然什么提示都还没出来
  if (o.cine !== "keep") for (let i = 0; i < 900 && state.microCine; i += 1) step({ advance: true });
  // 旗标覆盖放在跳幕与微过场之后：beat 自己的 onStart 已经跑完，不会再盖掉
  if (o.flag) Object.assign(state.flags, ParseFlags(o.flag));
  // --step N：链式节拍直接落到第 N 步。**先空跑一帧再改**——链的初始化在第一帧，
  // 提前改 stepIndex 会绕过它（holdP undefined → NaN）。
  // 这是给"看某一步长什么样"用的，**不是**可达性验证：谁走得到那一步是
  // SmokeTest 自动通关的活（CLAUDE.md「自测不许瞬移玩家」说的是那件事）。
  if (o.step !== undefined) { state.beat.stepIndex = Number(o.step); step({}, 1); }
  // 摆位跟 zone 一个语义：给了 x 没给 level 就是地表。上一拍常把人留在地下
  //（DebugJump 逐拍结算），不清 level 的话 x 会被地下走行范围夹走；cineWalk
  // 同理——过场挂的走位会把人一路拖离摆好的位置
  if (o.x !== undefined) {
    state.player.x = Number(o.x);
    state.player.level = o.level ? String(o.level) : "surface";
    state.player.cineWalk = null;
  } else if (o.level) state.player.level = String(o.level);
  step({}, 2);

  const before = JSON.stringify(state.flags);
  const trace = [];
  if (o.input) {
    for (const raw of String(o.input).split(/[,;]/)) {
      const [tok, mul] = raw.trim().split("*");
      const inp = InputOf(tok);
      if (!inp) { console.log(`看不懂的输入 token：${tok}（d a s w e E Ew Es Ea Ed c . adv）`); return; }
      const n = Math.max(1, Number(mul || 1));
      step(inp, n);
      if (o.trace) trace.push(`${raw}: x=${state.player.x.toFixed(2)} step=${state.beat?.stepIndex} prompt=${JSON.stringify(state.prompt)}`);
    }
  }
  if (o.frames) step({}, Number(o.frames));

  const p = state.player;
  const def = C.CurrentBeatDef(state);
  const changed = {};
  const now = JSON.parse(JSON.stringify(state.flags));
  const old = JSON.parse(before);
  for (const k of Object.keys(now)) if (JSON.stringify(now[k]) !== JSON.stringify(old[k])) changed[k] = now[k];

  const live = {};
  // 活卡那八张走 Core 的 LIVE_CARD_FIELDS（唯一一份名单）——这儿原先手抄了
  // 四张，撕布那张不在里头，`state c1_rescue --step 2 --json` 报出来的 live
  // 是空的，看着像"卡根本没立起来"（其实立了）
  for (const k of ["ropeLine", "knot", "winchView", "scribe", ...C.LIVE_CARD_FIELDS,
    "forage", "closeUp", "gesture",
    "thrown", "smoke", "pip", "toast", "detection"]) {
    if (k === "detection" && !(state.detection?.level > 0)) continue;   // 没被盯上就别刷屏
    if (state[k]) live[k] = k === "ropeLine"
      ? { pay: +state[k].pay?.toFixed(2), taut: +state[k].taut?.toFixed(3), pts: state[k].pts?.length, inHand: state[k].inHand }
      : Brief(state[k]);
  }
  const dump = {
    beat: { id: def?.id, kind: def?.kind, index: state.beatIndex, stepIndex: state.beat?.stepIndex },
    player: { x: +p.x.toFixed(2), level: p.level, heading: p.heading, crouch: p.crouch, pose: p.pose,
      item: p.item?.id || null, climbT: +(p.climbT || 0).toFixed(2) },
    prompt: state.prompt, climbHint: state.climbHint || "", objective: def?.objective || "",
    groundItems: state.groundItems.map((g) => `${g.id}@${g.x.toFixed(1)}${g.level === "under" ? "(下)" : ""}`),
    // 在场的人：谁站在哪、摆什么姿势/跑哪条轨道、手里拿什么。
    // 「爹的动作不对」这类问题十次有九次是问这个，以前只能现写探针脚本
    actors: state.actors.filter((a) => a.visible !== false && Math.abs(a.x - p.x) < 14)
      .map((a) => `${a.id}@${a.x.toFixed(2)}${a.level === "under" ? "(下)" : ""}`
        + `${a.pose ? "/" + a.pose : ""}`
        + `${a.track ? "/轨:" + a.track.name + "@" + (a.track.t ?? 0).toFixed(2) : ""}`
        + `${a.carry ? "/持:" + a.carry : ""}${a.rank ? "/排" + a.rank : ""}`),
    bubbles: state.bubbles.map((b) => b.icon),
    flagsChanged: changed,
    live,
  };
  if (o.json) { console.log(JSON.stringify(dump, null, 1)); return; }
  console.log(`节拍  ${dump.beat.id} (${dump.beat.kind})  第 ${dump.beat.index} 拍  步骤 ${dump.beat.stepIndex ?? "-"}`);
  console.log(`玩家  x=${dump.player.x} ${dump.player.level} heading=${dump.player.heading}` +
    `${dump.player.crouch ? " 蹲" : ""}${dump.player.pose ? " pose=" + dump.player.pose : ""}` +
    `${dump.player.item ? " 手里=" + dump.player.item : " 空手"}`);
  console.log(`提示  ${JSON.stringify(dump.prompt)}${dump.climbHint ? "   梯子：" + dump.climbHint : ""}`);
  if (dump.objective) console.log(`目标  ${dump.objective}`);
  if (dump.actors.length) console.log(`在场  ${dump.actors.join("  ")}`);
  if (dump.groundItems.length) console.log(`地上  ${dump.groundItems.join("  ")}`);
  if (dump.bubbles.length) console.log(`气泡  ${dump.bubbles.join("  ")}`);
  if (Object.keys(changed).length) console.log(`旗标变化  ${Brief(changed)}`);
  for (const [k, v] of Object.entries(live)) console.log(`${k.padEnd(10)}${typeof v === "object" ? Brief(v) : v}`);
  if (o.cues) {
    const rows = [...heard.entries()].sort((a, b) => b[1].n - a[1].n);
    console.log(`声音  这一段响了 ${rows.length} 种、共 ${rows.reduce((s, r) => s + r[1].n, 0)} 声：`);
    for (const [name, h] of rows) {
      const g = h.gain.length
        ? `  音量 ${Math.min(...h.gain).toFixed(2)}~${Math.max(...h.gain).toFixed(2)}` : "";
      console.log(`  ${name.padEnd(12)}${String(h.n).padStart(3)} 声${g}`);
    }
  }
  if (trace.length) { console.log("轨迹："); trace.forEach((t) => console.log("  " + t)); }
}

// ---------------------------------------------------------------------------
// shot：实拍。把每次都要重写的那段引导代码固化下来——历史上这一段反复踩三个坑：
//   ① ServeRoot 的 rootDir 必须 path.resolve（正斜杠字符串 → 里面 path.join
//      出反斜杠 → startsWith 判 false → 整站 403）；
//   ② 页面 load 完 window.TunnelLight 有了但 tl.state 还是 null，得先 StartGame；
//   ③ 要拍活姿势必须**真按键**——StepFrames 之后那几百毫秒里页面自己的 rAF
//      还在跑无输入帧，FlashPose 的 0.2s 姿势早过期，截出来全是站姿。
//
// 一条命令可以拍**好几拍**，共用同一个浏览器和本地服务器（起浏览器 5 秒、
// 拍一张不到 1 秒，13 拍分开拍是 78 秒，连着拍 ~20 秒）。跨章也不用重开页面：
// JumpToBeat 本来就吃章号。
//
//   shot c1_forage c1_cellar c2_digout
//   shot "c2_digout@x=42.3,level=under,digStarted=0" "c2_crawl@x=44,level=under"
//
// 每一拍后面可以用 @ 挂自己的参数，逗号分隔。**认识的键是参数，不认识的一律
// 当旗标**（x/level/hold/dur/pre/actor/cine/out 之外的都是旗标），省得再记一套语法。
// 命令行上的 --x/--flag 这些是所有拍共用的默认值，@ 里写的盖过它。
// ---------------------------------------------------------------------------
// step 也在表里：CmdShot 里读的是 jo.step，漏登记的话 --step / @step= 会被
// 当成旗标吃掉，链式节拍永远停在第 0 步（用法里写着、实际从来没生效）
const SHOT_KEYS = new Set(["x", "level", "hold", "dur", "phases", "pre", "actor", "cine", "out", "clip", "ui", "step",
  // line/at：钉到"第几句台词的第几秒"；zoom：截图之后再裁一张近景（认不认得出
  // 那件东西，只能靠近看）。三个都是 2026-08-12 睡姿那次白跑十几轮换来的
  "line", "at", "zoom"]);

// "c2_digout@x=44,level=under,digStarted=1" → { id, opts:{x,level}, flags:{digStarted:true} }
function ParseShotSpec(spec, base) {
  const at = spec.indexOf("@");
  const id = at < 0 ? spec : spec.slice(0, at);
  const opts = { ...base.opts };
  const flags = { ...base.flags };
  if (at >= 0) {
    for (const kv of spec.slice(at + 1).split(",")) {
      const t = kv.trim();
      if (!t) continue;
      const i = t.indexOf("=");
      const k = i < 0 ? t : t.slice(0, i);
      const v = i < 0 ? "1" : t.slice(i + 1);
      if (SHOT_KEYS.has(k)) opts[k] = v;
      else Object.assign(flags, ParseFlags(`${k}=${v}`));
    }
  }
  return { id, opts, flags };
}

async function CmdShot(o) {
  const specs = o._.flatMap((s) => String(s).split(",").filter(Boolean).length && !s.includes("@")
    ? String(s).split(/[，,]/).filter(Boolean) : [s]);
  if (!specs.length) {
    console.log("用法：shot <beatId>[@x=41,level=under,line=9,at=2.6,zoom=sister,旗标=0] [更多 beatId...] [--x N] [--step N] [--flag k=v] [--hold d] [--dur 4] [--phases 6] [--probe]");
    return;
  }
  const base = {
    opts: Object.fromEntries(Object.entries(o).filter(([k]) => SHOT_KEYS.has(k))),
    flags: ParseFlags(o.flag),
  };
  const jobs = [];
  for (const spec of specs) {
    const job = ParseShotSpec(spec, base);
    const found = await FindBeat(job.id);
    if (!found) { console.log(`没有叫「${job.id}」的节拍，跳过。`); continue; }
    job.ci = found.ci; job.bi = found.bi;
    jobs.push(job);
  }
  if (!jobs.length) return;

  const { LaunchBrowser } = await import("../PrairieFire1937/Script_BrowserTestKit.mjs");
  const { ServeRoot } = await import("./Script_DevServer.mjs");
  const outDir = path.join(DIR, "_shots");
  fs.mkdirSync(outDir, { recursive: true });

  const server = await ServeRoot(ROOT, 0);          // ← rootDir 已经是 resolve 过的绝对路径
  const port = server.address().port;
  const browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: Number(o.w || 1600), height: Number(o.h || 900) } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  const files = [];
  try {
    await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/index.html?chapter=${jobs[0].ci}`,
      { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });
    await page.evaluate((c) => window.TunnelLight.StartGame(c), jobs[0].ci);
    await page.waitForFunction(() => !!window.TunnelLight.state, { timeout: 60000 });

    for (const job of jobs) {
      const jo = job.opts;
      const phases = Math.max(1, Number(jo.phases || 1));
      // 给了 line/at 就已经钉死了时刻，别再往前推 dur（推了 at 就不准）
      const dur = jo.dur !== undefined ? Number(jo.dur) : (jo.line !== undefined ? 0 : 0.6);
      const tag = String(jo.out || job.id);
      // --pre 用的是 state 那套输入小语言，在**开拍之前**无头跑完：
      // 「先按 E 把绳头拿起来，再按住 d 边走边拍」这种前置操作没它没法表达
      const pre = String(jo.pre || "").split(/[,;]/).filter(Boolean).map((raw) => {
        const [tok, mul] = raw.trim().split("*");
        const inp = InputOf(tok);
        if (!inp) throw new Error(`看不懂的 --pre token：${tok}`);
        return [inp, Math.max(1, Number(mul || 1))];
      });
      await page.evaluate(({ c, b, x, level, actor, keepCine, stepIndex, pre: steps, flags, line, at, hold }) => {
        const tl = window.TunnelLight;
        tl.Freeze(false);                          // 上一拍可能冻着（钉格那条路），先解开
        tl.JumpToBeat(c, b);                       // 吃章号，跨章不用重开页面
        tl.StepFrames(1, {});
        if (!keepCine) for (let i = 0; i < 900 && tl.state.microCine; i += 1) tl.StepFrames(1, { advance: true });
        // 旗标覆盖放在跳幕与微过场之后：beat 的 onStart 已经跑完，不会再盖掉。
        // 改完再走两帧，场景构建会自己比对出"要重建"（剖面几何、光照都吃旗标）
        if (flags && Object.keys(flags).length) Object.assign(tl.state.flags, flags);
        // --step N：链式节拍直接落到第 N 步（同 state 的那条，先空跑一帧再改）
        if (stepIndex !== undefined) { tl.state.beat.stepIndex = stepIndex; tl.StepFrames(1, {}); }
        // 同 state：给了 x 没给 level 就是地表，并清掉过场走位
        if (x !== undefined) {
          tl.state.player.x = x;
          tl.state.player.level = level || "surface";
          tl.state.player.cineWalk = null;
        } else if (level) tl.state.player.level = level;
        if (actor) { const a = tl.state.actors.find((z) => z.id === actor); if (a?.track) a.track.t = 0; }
        tl.StepFrames(2, {});
        for (const [inp, n] of steps) tl.StepFrames(n, inp);
        // @line=9,at=2.6：钉到"第 9 句台词的第 2.6 秒"。别再拿 --dur 猜——
        // dur 是从整拍开头算的，改一句台词的时长后面全错位；而且推完之后要等
        // 渲染追上（镜头缓动/立面淡出/光照换挡），那半秒里游戏又往前走了
        if (line !== undefined) {
          tl.SeekLine(line, at || 0);
          // 钉到格就**当场冻帧**：下面还要等圆形黑幕拉开（真墙钟几百毫秒），
          // 那会儿页面自己的 rAF 还在推游戏钟——半秒长的一格（序章刺刀那一帧）
          // 等到拍的时候早就翻过去了。冻帧只停游戏钟，黑幕照旧会拉开
          if (!hold) tl.Freeze(true);
        }
      }, { c: job.ci, b: job.bi, x: jo.x === undefined ? undefined : Number(jo.x), level: jo.level || null,
        actor: jo.actor || null, keepCine: jo.cine === "keep",
        stepIndex: jo.step === undefined ? undefined : Number(jo.step), pre, flags: job.flags,
        line: jo.line === undefined ? undefined : Number(jo.line), at: Number(jo.at || 0), hold: !!jo.hold });

      // 等转场的圆形黑幕拉开再拍——死等固定秒数会拍到一个圆洞（等待时间随
      // 机器快慢变，猜不准）。iris 是 Script_Main 挂出来的调试钩子
      await page.waitForFunction(() => (window.TunnelLight.iris ?? 1) > 0.995, { timeout: 8000 })
        .catch(() => errors.push(`${job.id}: 黑幕没拉开（iris 超时）`));
      // --ui bag：点开包袱（收藏品面板）再拍；bag+<id> 顺带选中那件出注解卡
      const uiWant = jo.ui || o.ui;
      if (uiWant && String(uiWant).startsWith("bag")) {
        const sel = String(uiWant).includes("+") ? String(uiWant).split("+")[1] : null;
        await page.evaluate((want) => {
          document.getElementById("btnBag")?.click();
          if (want) {
            const all = [...document.querySelectorAll("#bagStrip li")];
            const hit = all.find((li) => li.title !== "？？？" && li.title) || all[0];
            hit?.click();
          }
        }, sel);
        await page.waitForTimeout(450);
      }

      // --eval "<js>"：在**这一拍已经摆好的页面里**跑一段 JS 并把结果打出来。
      // 截图只能告诉你"看着不对"，问不出"是哪张网格摆歪了"——而这类问题过去
      // 全靠现写一次性探针脚本。页面里能拿到 TunnelLight.{state,world,...}，
      // 表达式或函数体都行（`world.debugLayers().layers.play.children.length`）。
      // 页面渲染只在浏览器窗口真的合成时才跑，所以只有这条实拍路子问得到渲染层。
      // **返回 Promise 也认**（2026-08-13 加）：查资源的活天生是异步的
      //（fetch 一个 mp3 再 decodeAudioData 才知道它是不是一段静音）。
      // 原来这儿把结果直接塞进 { ok }，Playwright 只 await 最外层那个 Promise，
      // 嵌在对象里的那个照原样序列化——打出来是一个空的 `{}`，看着像"没结果"。
      if (o.eval) {
        const r = await page.evaluate(async (src) => {
          const tl = window.TunnelLight;
          // eslint-disable-next-line no-new-func
          const fn = new Function("tl", "state", "world", `return (${src})`);
          try { return { ok: await fn(tl, tl.state, tl.world) }; }
          catch (e) {
            try {
              // eslint-disable-next-line no-new-func
              return { ok: await new Function("tl", "state", "world", src)(tl, tl.state, tl.world) };
            } catch (e2) { return { err: String(e2) }; }
          }
        }, String(o.eval));
        console.log(`  eval[${job.id}] ${JSON.stringify(r.err ?? r.ok, null, 1)}`);
      }

      const held = jo.hold ? String(jo.hold).split("") : [];
      for (const k of held) await page.keyboard.down(k);
      // **冻帧再拍**（没按着键的拍才冻）：游戏钟停住、渲染照跑。镜头缓动、
      // 立面淡出、光照换挡都得真渲染几帧才追得上，不冻帧的话等它追上的那半秒
      // 里游戏又往前走了——截出来的不是你要的那一格
      if (!held.length) await page.evaluate(() => window.TunnelLight.Freeze(true));
      const clip = jo.clip ? (() => { const [x, y, w, h] = String(jo.clip).split(",").map(Number); return { x, y, width: w, height: h }; })() : undefined;
      for (let i = 0; i < phases; i += 1) {
        // **--dur 量的是游戏钟，不是墙钟。** 无头合成器一忙 rAF 掉到十几帧、
        // dt 每帧又有钳制，按墙钟等 dur 秒实际只走了三分之一的戏——
        // c2_endure 四张相位全拍在第 0 句上就是这么来的。没按键的拍，相位间
        // 直接用 StepFrames 把游戏时间推够数（眨眼到位，长过场也不用干等）；
        // 真按着键的拍必须让 rAF 真跑（StepFrames 喂的是空输入，会把按住的键
        // 冲掉），就盯着 state.time 等游戏钟走满，墙钟慢多少都不怕
        const slice = dur / phases;
        if (held.length) {
          await page.evaluate(async (want) => {
            const tl = window.TunnelLight;
            const t0 = tl.state.time;
            const cap = Date.now() + want * 6000 + 4000;
            await new Promise((res) => {
              const poll = () => ((tl.state.time - t0 >= want) || Date.now() > cap ? res() : setTimeout(poll, 60));
              poll();
            });
          }, slice);
        } else if (slice > 0.01) {
          await page.evaluate((n) => window.TunnelLight.StepFrames(n, {}), Math.max(1, Math.round(slice * 30)));
          await page.waitForTimeout(420);   // 等镜头缓动与下一次真合成追上推完的状态
        }
        // **渲染侧也得推同样多帧**：镜头缓动、立面淡出、昼夜换挡（2.6 秒）、
        // 板缝光柱的亮度吸附都只在 rAF 里前进，而无头浏览器没有合成器、rAF
        // 几乎不跑（实测按住键推 12 秒，游戏钟只走了 0.58 秒）。光靠上面那
        // 420ms 的干等追不上，拍到的会是"过渡刚开始"那一格——序章那间该黑的
        // 窖因此一直拍成亮的。至少推够一次换挡（LIGHT_FADE 2.6s）
        await page.evaluate((n) => window.TunnelLight.Settle?.(n), Math.max(90, Math.round(dur * 30)));
        const file = path.join(outDir, phases > 1 ? `cli_${tag}_${i}.png` : `cli_${tag}.png`);
        await page.screenshot({ path: file, clip });
        // @zoom=sister / @zoom=player / @zoom=31.15[:0.6]：顺手再裁一张近景。
        // "认不认得出这是件能抓的东西"只能靠近看，而靠猜裁剪框是纯浪费
        if (jo.zoom) {
          const rect = await page.evaluate((want) => {
            const tl = window.TunnelLight;
            let wx = Number(want.split(":")[0]);
            let wy = Number(want.split(":")[1]);
            if (!Number.isFinite(wx)) {
              const a2 = want === "player" ? tl.state.player : tl.state.actors.find((z) => z.id === want);
              if (!a2) return null;
              wx = a2.x;
              if (!Number.isFinite(wy)) wy = (a2.level === "under" ? -3.6 : 0) + 0.6;
            }
            if (!Number.isFinite(wy)) wy = 0.6;
            const p2 = tl.ScreenXY(wx, wy);
            return p2 && { x: p2.x, y: p2.y };
          }, String(jo.zoom));
          if (rect) {
            const W = 520, H = 300;
            const zf = path.join(outDir, phases > 1 ? `cli_${tag}_${i}_zoom.png` : `cli_${tag}_zoom.png`);
            await page.screenshot({ path: zf,
              clip: { x: Math.max(0, Math.min(1600 - W, rect.x - W / 2)),
                y: Math.max(0, Math.min(900 - H, rect.y - H * 0.55)), width: W, height: H } });
            files.push(zf);
            console.log(`  ${path.basename(zf)}  近景 @屏幕(${Math.round(rect.x)},${Math.round(rect.y)})`);
          } else console.log(`  zoom：找不到「${jo.zoom}」`);
        }
        const s = await page.evaluate((wantProbe) => {
          const st = window.TunnelLight.state;
          const out = { x: +st.player.x.toFixed(2), pose: st.player.pose, prompt: st.prompt, step: st.beat?.stepIndex, line: st.beat?.lineIndex,
            lineT: st.beat?.lineT === undefined ? undefined : +st.beat.lineT.toFixed(1), micro: !!st.microCine };
          if (wantProbe) {
            // 只报两件**有明确对错**的（好不好看得自己看图，这里不掺和）：
            // 深度带用错了没有、人的手脚有没有悬空/陷地
            out.depth = window.TunnelLight.world.DepthViolations?.() || [];
            out.limbs = window.TunnelLight.world.PlayerLimbTips?.() || null;
          }
          return out;
        }, !!o.probe);
        files.push(file);
        console.log(`  ${path.basename(file)}  x=${s.x} pose=${s.pose} step=${s.step}${s.line !== undefined ? ` line=${s.line} lineT=${s.lineT}` : ""}${s.micro ? " micro!" : ""} prompt=${JSON.stringify(s.prompt)}`);
        if (o.probe) {
          console.log(`      深度告警 ${s.depth.length ? s.depth.join(" / ") : "无"}`);
          if (s.limbs) console.log(`      手脚离地 ${Object.entries(s.limbs).map(([k, v]) => `${k}=${v}`).join(" ")}`);
        }
      }
      for (const k of held) await page.keyboard.up(k);
      await page.evaluate(() => window.TunnelLight.Freeze(false));
    }
    console.log(`\n${files.length} 张 → TunnelLight1943/_shots/`);
  } finally {
    await browser.close();
    server.close();
  }
  if (errors.length) { console.error("页面异常：", errors.slice(0, 4).join(" | ")); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// menu：拍菜单类界面（标题 / 操作说明 / 设置 / 确认框 / 调试 / 暂停）。
//
// `shot` 是拍**戏**的，它一上来就 StartGame，看不到标题页；而菜单是玩家看到的
// 第一屏，改完只能靠眼睛验（"两层菜单"这种毛病，测试是绿的、图上一看就知道）。
// 各态怎么摆好，比"临时写个 playwright 脚本"稳：存档态要先写 localStorage 再刷新，
// 确认框要有存档才弹得出来——这几步每次都要重推一遍，固化在这儿。
// ---------------------------------------------------------------------------
const MENU_PAGES = {
  // key: [说明, 到这一态要做什么（在页面里跑）]
  title: ["标题页（没有存档）", null],
  continue: ["标题页（有存档）", "save"],
  confirm: ["新游戏覆盖确认框", "save"],
  controls: ["操作说明", null],
  settings: ["标题页上的设置面板", null],
  pause: ["游戏里的暂停（设置面板）", null],
  debug: ["调试面板（选关就在这儿）", null],
  anim: ["动画工作台（--anim 名字 选中哪条，--at 秒 钉到第几秒，--kind sister@0.60 换人，--ghosts 叠影，--flip 翻朝向）", null],
  art: ["人物美术样式（--who sister 选人，--anim loco:run 右栏骨架跑哪条）", null],
};
async function CmdMenu(o) {
  const want = (o._.length ? o._ : Object.keys(MENU_PAGES)).filter((k) => {
    if (MENU_PAGES[k]) return true;
    console.log(`没有叫「${k}」的界面。有：${Object.keys(MENU_PAGES).join(" / ")}`);
    return false;
  });
  if (!want.length) return;
  const { LaunchBrowser } = await import("../PrairieFire1937/Script_BrowserTestKit.mjs");
  const { ServeRoot } = await import("./Script_DevServer.mjs");
  const outDir = path.join(DIR, "_shots");
  fs.mkdirSync(outDir, { recursive: true });
  const server = await ServeRoot(ROOT, 0);
  const port = server.address().port;
  const browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: Number(o.w || 1600), height: Number(o.h || 900) } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  // 存档态：先把一份档写进 localStorage 再刷新——BuildTitle 是在 load 时跑的
  const SEED = { v: 1, chapter: 0, beat: 12, beatId: "c1_return", flags: {}, at: 0 };
  try {
    await page.goto(`http://127.0.0.1:${port}/TunnelLight1943/index.html`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });
    for (const key of want) {
      const [label, prep] = MENU_PAGES[key];
      await page.evaluate(() => localStorage.removeItem("tunnelLight1943.save.v1"));
      if (prep === "save") await page.evaluate((seed) => localStorage.setItem("tunnelLight1943.save.v1", JSON.stringify(seed)), SEED);
      await page.reload({ waitUntil: "load", timeout: 60000 });
      await page.waitForFunction(() => window.TunnelLight !== undefined, { timeout: 60000 });
      if (key === "confirm") await page.click("#startButton");
      if (key === "controls") await page.click("#btnControls");
      if (key === "settings") await page.click("#btnTitleSettings");
      if (key === "debug") await page.evaluate(() => window.TunnelLight.ToggleDebug(true));
      if (key === "art") {
        await page.evaluate(async ({ who, anim }) => {
          const tl = window.TunnelLight, ab = tl.ArtBrowser;
          ab.Open(true);
          if (who) ab.Pick(who);
          for (let i = 0; i < 200 && !ab.Ready(); i += 1) await new Promise((r) => setTimeout(r, 50));
          if (anim) await ab.Anim(anim);
          tl.Tick(12, 1 / 30);            // 无头下 rAF 几乎不走，骨架要靠 Tick 推几帧才摆到位
        }, { who: o.who ? String(o.who) : null, anim: o.anim ? String(o.anim) : null });
      }
      if (key === "anim") {
        // 工作台自己 fetch 源码建索引，等它 Ready 再选；无头下 rAF 几乎不走，
        // 帧要靠 Tick 推，钉到 --at 那一秒再拍
        await page.evaluate(async (want) => {
          const lab = window.TunnelLight.AnimLab;
          await lab.Open(want || undefined);
        }, o.anim ? String(o.anim) : null);
        await page.waitForFunction(() => window.TunnelLight.AnimLab.Ready() && !!window.TunnelLight.AnimLab.Current(), { timeout: 30000 });
        await page.evaluate(({ at, kind, ghosts, flip }) => {
          const tl = window.TunnelLight, lab = tl.AnimLab;
          if (kind) lab.SetKind(kind);
          lab.SetOptions({ ghosts: !!ghosts, ...(flip ? { heading: -1 } : {}) });
          tl.Tick(2, 1 / 30);
          if (at !== null) lab.Seek(at); else lab.Play(false);
          tl.Tick(2, 1 / 30);
        }, { at: o.at !== undefined ? Number(o.at) : null, kind: o.kind ? String(o.kind) : null, ghosts: !!o.ghosts, flip: !!o.flip });
      }
      if (key === "pause") {
        await page.evaluate(() => window.TunnelLight.JumpToBeat(0, 12));
        await page.waitForFunction(() => (window.TunnelLight.iris ?? 1) > 0.995, { timeout: 8000 }).catch(() => {});
        await page.click("#btnSettings");
      }
      await page.waitForTimeout(220);
      const suffix = (key === "anim" && o.anim) ? `_${String(o.anim).replace(/[^A-Za-z0-9_]/g, "")}`
        : (key === "art" && o.who) ? `_${String(o.who).replace(/[^A-Za-z0-9_]/g, "")}` : "";
      const file = path.join(outDir, `menu_${key}${suffix}.png`);
      await page.screenshot({ path: file });
      console.log(`  ${path.basename(file)}  ${label}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (errors.length) { console.error("页面异常：", errors.slice(0, 4).join(" | ")); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
// doctor：开工前一条命令说清"我在哪、有没有踩别人、戳对不对"。
// 端口撞车在日志里出现过 10 次（并行会话各起一个 dev server 抢 8148）。
// ---------------------------------------------------------------------------
function Sh(cmd, args, cwd = ROOT) {
  try { return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}

async function CmdDoctor() {
  console.log(`仓库  ${ROOT}`);
  console.log(`分支  ${Sh("git", ["rev-parse", "--abbrev-ref", "HEAD"])}`);
  const ahead = Sh("git", ["rev-list", "--left-right", "--count", "HEAD...origin/master"]);
  console.log(`与 origin/master  ${ahead || "?"}（左=本地独有 右=上游独有；右边不为 0 先 merge）`);
  const dirty = Sh("git", ["status", "--short"]).split("\n").filter(Boolean);
  console.log(`未提交  ${dirty.length ? dirty.length + " 个文件：" + dirty.slice(0, 6).map((s) => s.slice(3)).join(" ") : "干净"}`);

  const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
  const stamp = /\?v=(\d+)/.exec(html)?.[1];
  const stamps = [...new Set([...html.matchAll(/\?v=(\d+)/g)].map((m) => m[1]))];
  console.log(`缓存戳  v=${stamp}${stamps.length > 1 ? "  ⚠ 同一份 index.html 里有多个戳：" + stamps.join("/") : ""}`);

  // 端口：并行会话抢 dev server 是真出过的事故
  const net = Sh("netstat", ["-ano"]) || "";
  for (const p of [8148, 8143, 5173]) {
    const busy = net.split("\n").some((l) => new RegExp(`:${p}\\s`).test(l) && /LISTENING/.test(l));
    if (busy) console.log(`端口 ${p}  已被占用（多半是别的会话的 dev server；shot 子命令自己起随机端口，不受影响）`);
  }
  console.log(`\n跑测试   npm run test:tunnelLight1943`);
  console.log(`看场景   npm run scene:tunnelLight1943`);
  console.log(`问状态   node TunnelLight1943/Script_Cli.mjs state <beatId>`);
}

// ---------------------------------------------------------------------------
const HELP = `《地道里的光》命令行工作台

  where <片段>            这东西在哪：节拍/函数/画笔/道具/姿势/规范 → 文件:行
  beats [c1|1]            列出全部节拍（章 · 序号 · id · kind）
  beat <beatId>           某一拍的全部：步骤/区域/需要什么/旗标/台词/源码位置
  state <beatId> [选项]   无头跑到那一拍，喂真输入，把状态打出来
      --x 35.6 --level under --input "e,d*90" --frames 30 --trace --json
      --flag digStarted=0,tunnelDug=1   手拨游戏里的是/否开关（见下）
      --step N   链式节拍直接落到第 N 步
      输入 token：d右 a左 s下梯 w上梯 e按一下 E按住 c蹲 . 空转 adv推过场；token*N 重复
  shot <beatId ...> [选项] 实拍（真浏览器、真键盘），存进 _shots/
      **一条命令可以拍好几拍**，共用一个浏览器（跨章也不用重开页面）：
        shot c1_well c2_crawl c8_wall
      每一拍可以用 @ 挂自己的参数，逗号分隔；**不认识的键一律当开关**：
        shot "c2_digout@x=42.3,level=under,tunnelDug=0" "c2_digout@x=43,level=under,tunnelDug=1,out=通了"
      --x N --step N --pre "e" --hold d --dur 4 --phases 6 --actor father --clip x,y,w,h --out 名
      --step N         链式节拍直接落到第 N 步（看某一步长什么样；不是可达性验证）
      --flag k=v,k=v   所有拍共用的开关默认值（@ 里写的盖过它）
      --ui bag         拍之前点开包袱面板（bag+x 顺带选中第一件出注解卡）
      --probe          截图同时报两件有明确对错的事：深度带用错没有、手脚离地多少
      --pre 走 state 那套输入语言（开拍前的前置操作）；--hold 是拍摄期间真按住的键
      （姿势是 0.2s 的闪现，不真按键就只能截到站姿）；--actor 把某人动画相位清零
      转场的圆形黑幕会等它拉开再拍（轮询 TunnelLight.iris），不用自己调等待时间
  menu [页 ...]           拍菜单类界面 → _shots/menu_*.png（--w --h 换画框）
      title 标题页 / continue 有存档的标题页 / confirm 覆盖确认 / controls 操作说明
      settings 标题页上的设置 / pause 游戏里的暂停 / debug 调试面板（选关）
      anim 动画工作台（--anim scoopChild 选中哪条，--at 0.55 钉到第几秒，--kind sister@0.60 --ghosts --flip）
      art 人物美术样式（--who sister 选人，--anim loco:run 右栏那具骨架跑哪条）
      不给页名就全拍一遍。菜单是玩家的第一屏，改完必须看图——测试绿着也可能很难看
  anims [片段]            骨架里全部动作的清单：轨道 / 姿势 / 步态 → 名字·时长·行号·谁在用
  anim <名字>             一条动作的全部：说明 / 关键帧表 / 驱动 / 用在哪几拍 / 一行引用
      （网页里播：设置 → 调试 · 动画工作台，或 index.html?anim=<名字>；同一份索引）
  doctor                  分支/上游/未提交/缓存戳/端口

要问游戏状态先跑这个，别再现写一次性探针脚本。`;

const TABLE = { where: CmdWhere, beats: CmdBeats, beat: CmdBeat, state: CmdState, shot: CmdShot, menu: CmdMenu, anims: CmdAnims, anim: CmdAnim, doctor: CmdDoctor };
const fn = TABLE[cmd];
if (!fn) { console.log(HELP); process.exit(cmd ? 1 : 0); }
await fn(Opts(rest));
