// Script_HistoryLedgerAudit.mjs — 史实与创作对照的仓库侧体检（纯 Node，不进浏览器模块图）。
//
// 资料馆条目 HistoryAndCreation（Data_HistoryCodex.mjs）与 Notion「史实与创作对照表」要跟着
// 剧本、空间和带史料含义的资产一起改（AGENTS.md 跨系统契约第16条）。这个脚本只管仓库这一半：
// 上次核对以来哪些文件动了、新加了哪些玩家看得见的字、资产契约里写了哪些史料边界，
// 以及条目本身的结构和出处有没有出错。Notion 那一半由 skill 用 Notion 工具读写。
//
// 用法（从仓库根）：
//   node Taierzhuang1938/Script_HistoryLedgerAudit.mjs                 报告（默认从同步记号里的 repoCommit 起看）
//   node Taierzhuang1938/Script_HistoryLedgerAudit.mjs --since=<提交>   指定起点
//   node Taierzhuang1938/Script_HistoryLedgerAudit.mjs --check         闸门：条目结构、出处引用、否决链接、文学作品
//   node Taierzhuang1938/Script_HistoryLedgerAudit.mjs --mark-reviewed [--commit=<提交>] [--notion=<页面id>=<ISO时间> ...]
//                                                                       核对完写回同步记号（repoCommit 默认取 HEAD；
//                                                                       本地已有没推的提交时传 --commit=origin/master）
// 同步记号：Data_HistoryLedgerSync.json；配套 skill：.claude/skills/tengxian-fact-fiction-sync/SKILL.md
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const syncPath = path.join(here, "Data_HistoryLedgerSync.json");
const args = process.argv.slice(2);
const Arg = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const Git = (...cmd) => execFileSync("git", ["-C", repo, ...cmd], { encoding: "utf8", maxBuffer: 1 << 28 });
const CJK = /[㐀-鿿]/u;

const { HISTORY_CODEX_ENTRIES, HISTORY_CODEX_MARKS } = await import(pathToFileURL(path.join(here, "Data_HistoryCodex.mjs")).href);
const sync = JSON.parse(fs.readFileSync(syncPath, "utf8"));
const ledger = HISTORY_CODEX_ENTRIES.find(entry => entry.category === "creation");

// Paths are relative to Taierzhuang1938/. Order matters: the first matching group wins.
const GROUPS = [
  { id: "ledger", label: "资料馆与史料表本身", test: p => /^Data_(HistoryCodex|History|HistoryLedgerSync)\.(mjs|json)$/.test(p) },
  { id: "story", label: "台词、任务、过场（玩家看得见的字）", text: true, test: p => /^Data_(MissionCh\d+|FirstLevelMission(Dialogue|Stages)?|Cutscene\w+|Voice|TengxianScript|Levels|Menu|Weapons)\.mjs$/.test(p) },
  { id: "space", label: "白盒与空间（剧本里的地点、走位、预演字幕）", text: true, test: p => /^Blockout\/.+\.json$/.test(p) || /^Data_EditorBlockout\w*\.mjs$/.test(p) },
  { id: "assets", label: "带史料边界的资产契约", test: p => /^Model\/.+\/Data_\w+\.json$/.test(p) || /^Data_CharacterSelection\.mjs$/.test(p) },
  { id: "presumed", label: "复原说明里的推定值（数字和尺寸归这里，不进对照表）", test: p => /^Data_Tengxian\.mjs$/.test(p) },
  { id: "docs", label: "设计文档", test: p => /^docs\/.+\.md$/.test(p) },
];

function Check() {
  const fails = [], oks = [];
  const Fail = message => fails.push(message);
  if (sync.schema !== "tengxian-history-ledger-sync-v1") Fail(`同步记号 schema 不对：${sync.schema}`);
  if (!sync.repoCommit || !sync.reviewedAt) Fail("同步记号缺 repoCommit 或 reviewedAt");
  if (!ledger) { Fail("Data_HistoryCodex.mjs 里没有 category 为 creation 的条目"); return { fails, oks }; }
  const ids = ledger.marks.map(mark => mark.id);
  if (JSON.stringify(ids) !== JSON.stringify(HISTORY_CODEX_MARKS)) Fail(`标注顺序与 HISTORY_CODEX_MARKS 不一致：${ids.join(",")}`);
  const used = new Set(), titles = new Set();
  for (const mark of ledger.marks) {
    if (!mark.title || !mark.text) Fail(`标注 ${mark.id} 缺标题或说明`);
    if (!mark.items?.length) Fail(`标注 ${mark.id} 一条都没有`);
    for (const item of mark.items || []) {
      if (!item.title || !item.text) Fail(`${mark.id} 里有条目缺标题或正文`);
      if (titles.has(item.title)) Fail(`条目标题重复：${item.title}`);
      titles.add(item.title);
      for (const ref of item.refs || []) {
        const source = ledger.sources[ref];
        if (!source) { Fail(`「${item.title}」引用了不存在的出处 ${ref}`); continue; }
        used.add(ref);
        if (sync.literatureSources.some(lit => lit.url === source.url) && mark.id !== "invented") Fail(`「${item.title}」把文学作品当出处挂在「${mark.title}」下：${source.url}`);
      }
      if (mark.id === "recorded" && !item.refs?.length) Fail(`「${item.title}」标了有记载，却没有出处`);
      if (mark.id === "similar" && !item.refs?.length) Fail(`「${item.title}」标了有类似记载，却没附那条记载`);
    }
  }
  const urls = new Map();
  ledger.sources.forEach((source, i) => {
    if (!used.has(i)) Fail(`出处 ${i}「${source.title}」没有条目引用`);
    if (!source.note) Fail(`出处 ${i}「${source.title}」缺说明（写清它是百科、回忆、报道、档案还是小说）`);
    if (urls.has(source.url)) Fail(`出处链接重复：${source.url}`);
    urls.set(source.url, i);
    const rejected = sync.rejectedSources.find(bad => bad.url === source.url);
    if (rejected) Fail(`出处 ${i} 是核对时否决过的链接：${source.url}（${rejected.reason}）`);
  });
  if (!fails.length) oks.push(`${ledger.marks.map(mark => `${mark.title} ${mark.items.length}`).join(" / ")}；出处 ${ledger.sources.length} 条全部被引用，无否决链接`);
  return { fails, oks };
}

function ChangedFiles(since) {
  const out = Git("log", "--format=@@%h %ad %s", "--date=format:%m-%d %H:%M", "--name-only", `${since}..HEAD`, "--", "Taierzhuang1938");
  const files = new Map(); let commit = "";
  for (const line of out.split("\n")) {
    if (line.startsWith("@@")) { commit = line.slice(2); continue; }
    if (!line.trim()) continue;
    const rel = line.replace(/^Taierzhuang1938\//, "");
    if (!files.has(rel)) files.set(rel, []);
    files.get(rel).push(commit);
  }
  return files;
}

function AddedText(since, rel, limit = 25) {
  let diff = "";
  try { diff = Git("diff", "-U0", `${since}..HEAD`, "--", `Taierzhuang1938/${rel}`); } catch { return []; }
  const lines = new Set();
  for (const line of diff.split("\n")) {
    if (!line.startsWith("+") || line.startsWith("+++") || !CJK.test(line)) continue;
    for (const piece of line.match(/["“「]([^"”」]*[㐀-鿿][^"”」]*)["”」]/gu) || [line.slice(1).trim()]) lines.add(piece.replace(/^["“「]|["”」]$/gu, "").trim().slice(0, 160));
  }
  return [...lines].slice(0, limit);
}

function AssetBoundaries() {
  const rows = [], known = new Set(ledger?.sources.map(source => source.url));
  const Walk = dir => {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, name.name);
      if (name.isDirectory()) Walk(full);
      else if (/^Data_\w+\.json$/.test(name.name)) {
        let data; try { data = JSON.parse(fs.readFileSync(full, "utf8")); } catch { continue; }
        if (!data.historicalReferences && !data.reconstructionScope) continue;
        rows.push({ file: path.relative(here, full).replaceAll("\\", "/"), title: data.title || data.id, scope: data.reconstructionScope,
          refs: (data.historicalReferences || []).map(ref => ({ ...ref, inLedger: known.has(ref.url) })) });
      }
    }
  };
  Walk(path.join(here, "Model"));
  return rows;
}

function MarkReviewed() {
  sync.reviewedAt = new Date().toISOString();
  // Record the base the review read, not a commit that is about to be amended or rebased.
  sync.repoCommit = Git("rev-parse", Arg("commit") || "HEAD").trim();
  for (const pair of args.filter(a => a.startsWith("--notion="))) {
    const [id, time] = pair.slice(9).split("=");
    const page = sync.notionPages.find(p => p.id === id.replaceAll("-", ""));
    if (!page) throw new Error(`同步记号里没有这个 Notion 页面：${id}（新页面先手动登记 title 和 role）`);
    page.lastEdited = new Date(time).toISOString();
  }
  fs.writeFileSync(syncPath, `${JSON.stringify(sync, null, 2)}\n`);
  console.log(`已写回同步记号：repoCommit ${sync.repoCommit.slice(0, 8)}，reviewedAt ${sync.reviewedAt}`);
}

if (args.includes("--mark-reviewed")) MarkReviewed();
else if (args.includes("--check")) {
  const { fails, oks } = Check();
  for (const ok of oks) console.log(`  ✓ ${ok}`);
  for (const fail of fails) console.log(`  ✗ ${fail}`);
  console.log(`HistoryLedgerCheck：${fails.length} 失败`);
  process.exit(fails.length ? 1 : 0);
} else {
  const since = Arg("since") || sync.repoCommit;
  console.log(`# 史实与创作体检\n\n起点 ${since}（同步记号 reviewedAt ${sync.reviewedAt}）→ HEAD ${Git("rev-parse", "--short", "HEAD").trim()}\n`);
  const files = ChangedFiles(since);
  if (!files.size) console.log("仓库这边从起点到现在没有改动。Notion 的改动这里看不见，下面那张页面表照样要逐页比编辑时间。\n");
  for (const group of GROUPS) {
    const hits = [...files].filter(([rel]) => group.test(rel));
    if (!hits.length) continue;
    console.log(`## ${group.label}（${hits.length} 个文件）`);
    for (const [rel, commits] of hits) {
      console.log(`- ${rel}  ← ${commits[0]}${commits.length > 1 ? ` 等 ${commits.length} 次提交` : ""}`);
      if (group.text) for (const line of AddedText(since, rel)) console.log(`    + ${line}`);
    }
    console.log("");
  }
  console.log("## 资产契约里的史料边界");
  for (const row of AssetBoundaries()) {
    console.log(`- ${row.file}（${row.title}）`);
    if (row.scope) console.log(`    设计口径：${row.scope}`);
    for (const ref of row.refs) console.log(`    ${ref.inLedger ? "已在资料馆" : "资料馆未用"} ${ref.url} —— ${ref.basis || ""}`);
  }
  console.log("\n## 资料馆现有条目");
  for (const mark of ledger?.marks || []) console.log(`- ${mark.title}：${mark.items.map(item => `${item.title}${item.refs?.length ? `[${item.refs.join(",")}]` : ""}`).join("、")}`);
  console.log("\n## 上次核对时的 Notion 页面（拿 notion-fetch 的 page_last_edited_at 比，变了的整页重读）");
  for (const page of sync.notionPages) console.log(`- ${page.title}  ${page.id}  ${page.role}  ${page.lastEdited}`);
  const { fails } = Check();
  console.log(fails.length ? `\n条目闸门有 ${fails.length} 处不过：\n${fails.map(f => `- ${f}`).join("\n")}` : "\n条目闸门：通过");
}
