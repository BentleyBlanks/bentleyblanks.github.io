// Script_TextGather.mjs — 内容文本的翻译清单导出（纯 Node CLI，毫秒级，不进浏览器模块图）。
//
// ── 它是干什么的 ────────────────────────────────────────────────────────────
// 章节台词、过场分镜、史料卡、口令是**考据过的原稿**，本体留在各 Data_Mission* /
// Data_Cutscene* / Data_History / Data_Voice 里不搬家（docs/Data_TextAndTuning.md §3）。
// 多语言走「按 id 覆盖」：语言表里写 `content.<id>`，运行时 `Localize(id, 原稿)` 命中就换。
// 这个脚本把全部内容文本按**同一套 id** 导出成一份清单，翻译人员只看清单，
// 不需要打开任何 .mjs。
//
// **id 只写在 Script_TextIds.mjs 一处**，运行时（Script_Story / Script_Cutscene）与这里
// 共用它。两边各写一份 id 生成，第一次改口径就会分叉，而分叉的表现是「译文静默不生效」：
// 画面上是原文，控制台干净，没有任何报错。
//
// ── 用法 ────────────────────────────────────────────────────────────────────
//   node Taierzhuang1938/Script_TextGather.mjs              导出到 Taierzhuang1938/_shots/
//   node Taierzhuang1938/Script_TextGather.mjs --check      只自检（id 全局唯一、无空文本），不写文件
//   node Taierzhuang1938/Script_TextGather.mjs --out=<目录>  换个输出目录
//
// 产物两份，内容相同、给的人不同：
//   _shots/TextGather.json   `{ id, text, who, source, tier, hooked, voice, sameAs }[]`，给工具吃
//   _shots/TextGather.md     按来源分节的表格，给人看
// （`_shots/` 已 gitignore —— 清单是导出物不是源，源永远是那些 Data_ 文件。）
//
// ── 翻译回来之后怎么落地（§5）──────────────────────────────────────────────
//   1. 新建 `Data_Locale_<id>.mjs`，导出 `LOCALE = { id, name, strings }`；
//   2. 把清单里每一行译文写成 `"content.<清单里的 id>": "译文"`，放进 strings；
//      基准语言（zh-CN）**不登记** content.* —— 原稿就是基准，所以只加不改；
//   3. 在 Script_Text.mjs 里 RegisterLocale，并登记进 index.html 的 import map；
//   4. `node Taierzhuang1938/Script_TextTest.mjs` —— 多出基准没有的键、占位符集合
//      与基准不一致，都会当场红。
//
// ── hooked: false 是什么意思 ────────────────────────────────────────────────
// 清单里有一部分行现在**还没有运行时钩子**：id 已经按 §3 的口径定下来了，但显示它们
// 的代码（Script_Main 的史料卡、Script_Menu 的菜单史实行与鸣谢、Script_Hud 的简报与
// 目标行、Script_Audio 的口令字幕、Data_Weapons 的武器名）不在本包里，还没套 Localize。
// 它们照样导出 —— 翻译可以先做，接钩子是另一件事，接完这一列就变 true。
// **不导出**它们等于让翻译分两轮，那才是更糟的选择。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  LEVELS, CUTSCENES, CUTSCENE_ORDER, CAST, MENU, CREDITS, CHAPTERS,
} from "./Data_TengxianScript.mjs";
import { HISTORY_NOTES, BATTLE_TIMELINE, EPILOGUE_LINES } from "./Data_History.mjs";
import { VOICE_LINES } from "./Data_Voice.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { MISSION_STAGES,FIRST_LEVEL_MISSION_PHASE } from "./Data_FirstLevelMission.mjs";
import { FIRST_LEVEL_STAGES } from "./Data_FirstLevelMissionStages.mjs";
import { MISSION_DIALOGUE,MISSION_VOICE_CAST } from "./Data_FirstLevelMissionDialogue.mjs";
import { FirstLevelStageTextId,FirstLevelVoiceTextId,FirstLevelCastTextId } from "./Script_TextIds.mjs";
import {
  BeatTextId, BeatSubId, LevelObjectiveId, LevelObjectiveStepId, LevelBriefId, LevelFieldId, CastNameId,
  ShotTextId, CutsceneTitleId, CardTitleId, CardTextId, TallyRowId, TallyClosingId, NoteTextId,
  HistoryCardId, TimelineId, EpilogueLineId, VoiceLineId, MenuLineId, CreditsLineId, WeaponNameId,
} from "./Script_TextIds.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const outArg = args.find((a) => a.startsWith("--out="));
const OUT_DIR = outArg ? path.resolve(outArg.slice(6)) : path.join(here, "_shots");

// ---------------------------------------------------------------------------
// 收集
// ---------------------------------------------------------------------------

/** 一条清单行。同一个 id 只许出现一次；重复且文本不同 = 口径出了问题，--check 会红。 */
const rows = [];
const seen = new Map();
// 同一句原稿在两处出现是常态：过场字幕与它的配音稿、章节 beat 与关卡目标链的同一条。
// 它们**各有各的 id**（字幕可以润色，录音必须逐字对上），所以不合并；但清单里要互相
// 指得到，翻译才不会把同一句翻出两种说法。
const byText = new Map();
const problems = [];

/**
 * 登记一行。
 * @param {object} row { id, text, who, source, tier, hooked, voice }
 */
function Add(row) {
  const text = row.text == null ? "" : String(row.text);
  // 空串是**正常**的：`beat.sub` 没写、`row.note` 没写都会走到这里，跳过即可。
  if (!text) return;
  const entry = {
    id: row.id,
    text,
    who: row.who || null,
    source: row.source,
    tier: row.tier || null,
    hooked: row.hooked !== false,
    voice: row.voice || null,
    sameAs: null,
  };
  const previous = seen.get(entry.id);
  if (previous) {
    if (previous.text !== entry.text) {
      problems.push(`id 重复且文本不同：${entry.id}\n      ${previous.source}: ${previous.text}\n      ${entry.source}: ${entry.text}`);
    }
    return;
  }
  const twin = byText.get(entry.text);
  if (twin) entry.sameAs = twin; else byText.set(entry.text, entry.id);
  seen.set(entry.id, entry);
  rows.push(entry);
}

// --- 说话人名册 -------------------------------------------------------------
for(const stage of MISSION_STAGES)Add({id:FirstLevelStageTextId(stage.id),text:stage.objective,source:'Data_FirstLevelMission'});
for(const stage of FIRST_LEVEL_STAGES)Add({id:`firstLevel.phase.${stage.id}`,text:stage.title,source:'Data_FirstLevelMissionStages'});
for(const cue of MISSION_DIALOGUE)cue.lines.forEach((line,index)=>Add({id:FirstLevelVoiceTextId(cue.id,index),text:line.text,who:line.who,voice:cue.file,source:'Data_FirstLevelMissionDialogue'}));
for(const [id,person] of Object.entries(MISSION_VOICE_CAST))Add({id:FirstLevelCastTextId(id),text:person[0],who:id,source:'Data_FirstLevelMissionDialogue'});
for(const field of ['label','date','place'])Add({id:LevelFieldId(FIRST_LEVEL_MISSION_PHASE.id,field),text:FIRST_LEVEL_MISSION_PHASE[field],source:'Data_FirstLevelMission'});
FIRST_LEVEL_MISSION_PHASE.brief.forEach((text,index)=>Add({id:LevelBriefId(FIRST_LEVEL_MISSION_PHASE.id,index),text,source:'Data_FirstLevelMission'}));
// CAST 在 Data_TengxianScript 载入时已经把各过场自带的 people 并进来了，所以这一遍是全的。
for (const [id, person] of Object.entries(CAST)) {
  Add({ id: CastNameId(id), text: person.short || person.name, source: "CAST", who: id });
}

// --- 章节：beats / 目标 / 简报 ----------------------------------------------
// 章节文件名与 LEVELS 同序（Data_TengxianScript 的 CHAPTER_IDS 断言钉住了这一点）。
const chapterFileOf = (levelId) => {
  const index = CHAPTERS.findIndex((c) => c.id === levelId);
  return index >= 0 ? `Data_MissionCh${index}` : "Data_TengxianScript";
};

for (const level of LEVELS) {
  const source = `${chapterFileOf(level.id)} · ${level.id}`;
  (level.beats || []).forEach((beat, index) => {
    // cutscene 型 beat 只带一个过场 id，没有台词。
    if (beat.type === "cutscene") return;
    const id = BeatTextId(level.id, beat, index);
    Add({ id, text: beat.text, who: beat.who, source, tier: beat.tier, voice: beat.voice || null });
    Add({ id: BeatSubId(id), text: beat.sub, who: beat.who, source, tier: beat.tier });
  });
  // objectives[0] 就是 level.objective（同一个 id，见 Script_TextIds）：先登记它，
  // 它是**已接钩子**的那一条；其余目标行还等着 HUD 侧接。
  Add({ id: LevelObjectiveId(level.id), text: level.objective, source });
  (level.objectives || []).forEach((text, i) => {
    Add({ id: LevelObjectiveStepId(level.id, i), text, source });
  });
  (level.brief || []).forEach((text, i) => {
    Add({ id: LevelBriefId(level.id, i), text, source });
  });
  // 选章 / 简报卡 / 暂停菜单显示的三个标量字段（Script_Menu.PhaseText 与 Script_Hud.ShowBrief 已接钩子）。
  for (const field of ["label", "date", "place"]) {
    Add({ id: LevelFieldId(level.id, field), text: level[field], source });
  }
}

// --- 过场：字幕 / 台词 / 地图标注 / 标题 / 卡片 / 结算 -----------------------
function GatherCard(cutId, field, card, source) {
  if (!card) return;
  Add({ id: CardTitleId(cutId, field), text: card.title, source });
  (card.lines || []).forEach((line, i) => {
    const id = CardTextId(cutId, field, i);
    Add({ id, text: line.text, who: line.who, source, tier: line.tier });
    if (typeof line.small === "string") Add({ id: NoteTextId(id), text: line.small, source, tier: line.tier });
  });
}

for (const cutId of CUTSCENE_ORDER) {
  const cut = CUTSCENES[cutId];
  if (!cut) continue;
  const source = `CUTSCENES · ${cutId}`;
  Add({ id: CutsceneTitleId(cutId), text: cut.title, source });
  for (const shot of cut.shots || []) {
    (shot.subs || []).forEach((sub, i) => {
      const id = ShotTextId(cutId, shot.n, "sub", i);
      Add({ id, text: sub.text, source, tier: sub.tier, voice: sub.voiceCue ?? sub.voice ?? null });
      if (typeof sub.small === "string") Add({ id: NoteTextId(id), text: sub.small, source, tier: sub.tier });
    });
    (shot.lines || []).forEach((line, i) => {
      Add({ id: ShotTextId(cutId, shot.n, "line", i), text: line.text, who: line.who,
        source, tier: line.tier, voice: line.voiceCue ?? line.voice ?? null });
    });
    (shot.mapCard?.markers || []).forEach((marker, i) => {
      Add({ id: ShotTextId(cutId, shot.n, "map", i), text: marker?.label, source });
    });
  }
  GatherCard(cutId, "skipCard", cut.skipCard, source);
  GatherCard(cutId, "epilogueCard", cut.epilogueCard, source);
  if (cut.tally) {
    (cut.tally.rows || []).forEach((row, i) => {
      Add({ id: TallyRowId(cutId, i, "label"), text: row.label, source, tier: row.tier });
      Add({ id: TallyRowId(cutId, i, "value"), text: row.value, source, tier: row.tier });
      Add({ id: TallyRowId(cutId, i, "note"), text: row.note, source, tier: row.tier });
    });
    (cut.tally.closing || []).forEach((line, i) => {
      const id = TallyClosingId(cutId, i);
      Add({ id, text: line.text, source, tier: line.tier });
      if (typeof line.small === "string") Add({ id: NoteTextId(id), text: line.small, source, tier: line.tier });
    });
  }
}

// --- 语音行（战场口令 + 章节台词）------------------------------------------
// 这一支是**给重新配音用的稿**，不是字幕：同一句话在过场里另有一个字幕 id
//（清单里两行的 `voice` 列互相指得到）。字幕可以润色，录音必须逐字对得上，
// 所以两条各自成行，不合并。
for (const line of VOICE_LINES) {
  Add({ id: VoiceLineId(line.key), text: line.text, who: line.who || line.role || null,
    source: line.kind === "story" ? `Data_Voice · ch${line.chapter}` : `Data_Voice · ${line.kind}`,
    hooked: false, voice: line.key });
}

// --- 史料 -------------------------------------------------------------------
for (const [cardId, note] of Object.entries(HISTORY_NOTES)) {
  const source = "Data_History · HISTORY_NOTES";
  Add({ id: HistoryCardId(cardId, "title"), text: note.title, source, tier: note.tier, hooked: false });
  Add({ id: HistoryCardId(cardId, "body"), text: note.body, source, tier: note.tier, hooked: false });
  Add({ id: HistoryCardId(cardId, "source"), text: note.source, source, tier: note.tier, hooked: false });
}
BATTLE_TIMELINE.forEach((entry, i) => {
  const source = "Data_History · BATTLE_TIMELINE";
  Add({ id: TimelineId(i, "date"), text: entry.date, source, tier: entry.tier, hooked: false });
  Add({ id: TimelineId(i, "text"), text: entry.text, source, tier: entry.tier, hooked: false });
});
EPILOGUE_LINES.forEach((text, i) => {
  Add({ id: EpilogueLineId(i), text, source: "Data_History · EPILOGUE_LINES", hooked: false });
});

// --- 菜单史实行与鸣谢 -------------------------------------------------------
(MENU.lines || []).forEach((text, i) => {
  Add({ id: MenuLineId(i), text, source: "Data_TengxianScript · MENU.lines", hooked: false });
});
CREDITS.forEach((text, i) => {
  Add({ id: CreditsLineId(i), text, source: "Data_TengxianScript · CREDITS", hooked: false });
});

// --- 武器名 -----------------------------------------------------------------
for (const weapon of Object.values(WEAPONS)) {
  Add({ id: WeaponNameId(weapon.id), text: weapon.name, source: "Data_Weapons", hooked: false });
}

// ---------------------------------------------------------------------------
// 自检
// ---------------------------------------------------------------------------

// id 必须是 ASCII：译文表里它是 `content.<id>` 键，Script_TextTest 的键名正则不收汉字，
// 收了也没用 —— 那种键在别的语言表里没人打得出来。
const ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_\-.]*$/;
for (const row of rows) {
  if (!ID_RE.test(row.id)) problems.push(`id 不是合法的 ASCII 键：${row.id}（来源 ${row.source}）`);
  if (!row.text.trim()) problems.push(`空文本：${row.id}（来源 ${row.source}）`);
}

// ---------------------------------------------------------------------------
// 统计与产物
// ---------------------------------------------------------------------------

const bySource = new Map();
for (const row of rows) bySource.set(row.source, (bySource.get(row.source) || 0) + 1);
const hooked = rows.filter((r) => r.hooked).length;

function Markdown() {
  const lines = [];
  lines.push("# 《台儿庄：血战滕县》内容文本清单");
  lines.push("");
  lines.push(`由 \`node Taierzhuang1938/Script_TextGather.mjs\` 导出，共 **${rows.length}** 条。`);
  lines.push("");
  lines.push("翻译时**只改「译文」一列**：把每一行写成语言表里的 `content.<id>: 译文`，");
  lines.push("回填步骤见 Script_TextGather.mjs 头注与 docs/Data_TextAndTuning.md §5。");
  lines.push("");
  lines.push("- `id` 是稳定键，别改；原稿改了 id 不变，译文自动跟着那一行走。");
  lines.push("- `tier` 是史料可信度（信史 / 主流记载 / 流传待考 / 推演 / 虚构 / 游戏），");
  lines.push("  信史与主流记载的行**不许意译**：它们是有出处的引述。");
  lines.push("- `voice` 有值 = 这一句录过音。字幕可以润色，配音稿必须与录音逐字一致；");
  lines.push("  `voice.<key>` 那一节就是配音稿，改它等于要重录。");
  lines.push("- `接线` 为 ✗ 的行 id 已经定了，但显示它的代码还没套 `Localize` ——");
  lines.push("  先翻不亏，接完钩子译文就生效。");
  lines.push("- `同文` 指向清单里第一条原稿完全相同的行（字幕 ↔ 配音稿、目标行 ↔ 章节 beat）。");
  lines.push("  两条各自要一份译文，但**说法必须一致**。");
  lines.push("");
  lines.push("| 来源 | 条数 |");
  lines.push("| --- | ---: |");
  for (const [source, count] of [...bySource].sort()) lines.push(`| ${source} | ${count} |`);
  lines.push("");
  const Escape = (text) => String(text).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const Code = (text) => "`" + text + "`";
  for (const [source] of [...bySource].sort()) {
    lines.push(`## ${source}`);
    lines.push("");
    lines.push("| id | 说话人 | tier | voice | 接线 | 同文 | 原稿 | 译文 |");
    lines.push("| --- | --- | --- | --- | :-: | --- | --- | --- |");
    for (const row of rows.filter((r) => r.source === source)) {
      lines.push(`| \`${row.id}\` | ${row.who || ""} | ${row.tier || ""} | ${row.voice || ""} `
        + `| ${row.hooked ? "✓" : "✗"} | ${row.sameAs ? Code(row.sameAs) : ""} | ${Escape(row.text)} | |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

const twins = rows.filter((r) => r.sameAs).length;
console.log(`TextGather：${rows.length} 条内容文本 / ${bySource.size} 个来源`
  + `（已接 Localize 钩子 ${hooked} 条；${twins} 条与别处同文，见清单「同文」列）`);
for (const [source, count] of [...bySource].sort()) console.log(`  ${String(count).padStart(5)}  ${source}`);

if (problems.length) {
  console.log("");
  for (const problem of problems) console.log(`  ✗ ${problem}`);
  console.log(`\nTextGather：${problems.length} 处问题`);
  process.exit(1);
}

if (!CHECK) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, "TextGather.json");
  const mdPath = path.join(OUT_DIR, "TextGather.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, `${Markdown()}\n`, "utf8");
  console.log(`\n写出：${jsonPath}\n      ${mdPath}`);
} else {
  console.log("\nTextGather --check：id 全局唯一、无空文本、全是合法 ASCII 键。");
}
