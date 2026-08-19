// TaierzhuangMuseum 冒烟测试 —— 纯 Node，退出码即成败。
// 校验：数据完整性 / 时间线顺序 / 引用闭环 / index.html 容器 id 齐全 / 脚本语法。
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  STATS, TLDR, TIER, TIMELINE_PHASES, TIMELINE, FORCES, PEOPLE,
  WEAPON_CATEGORIES, WEAPONS, WEAPON_PAIRS, BALANCE, DARES, DARE_LOADOUT,
  DARE_NOTES, TACTICS, CASUALTY_TABLE, QUOTES, MYTHS, GLOSSARY, READING,
  TOWN_FACTS, MEMOIR_INTRO, MEMOIR_EXCERPTS, READING_PATH, PEOPLE_LATER,
  TENGXIAN_BATTLE, TENGXIAN_MARKERS,
} from "./Data_Museum.mjs";

const root = dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (cond, msg) => {
  if (cond) { console.log(`  ok  ${msg}`); }
  else { failures += 1; console.error(`FAIL  ${msg}`); }
};

console.log("[1] 数据完整性");
check(Array.isArray(STATS) && STATS.length === 6, "STATS 6 项");
check(STATS.every((s) => typeof s.value === "number"), "STATS value 为数字");
check(Array.isArray(TLDR) && TLDR.length === 6, "TLDR 6 张卡");
check(Object.keys(TIER).length === 3, "TIER 三档");
check(Array.isArray(TIMELINE_PHASES) && TIMELINE_PHASES.length === 5, "TIMELINE_PHASES 5 阶段");

console.log("[2] 时间线");
check(TIMELINE.length === 23, `TIMELINE 23 节点（实际 ${TIMELINE.length}）`);
check(TIMELINE.filter((t) => t.key).length === 4, "关键时刻 4 处（滕县 / 突入 / 最后五分钟 / 光复）");
{
  const ids = new Set(TIMELINE.map((t) => t.id));
  check(ids.size === TIMELINE.length, "时间线 id 唯一");
  const phaseIds = new Set(TIMELINE_PHASES.map((p) => p.id));
  check(TIMELINE.every((t) => phaseIds.has(t.phase)), "时间线 phase 合法");
  check(TIMELINE.every((t) => TIER[t.tier]), "时间线 tier 合法");
  check(TIMELINE.every((t) => t.title && t.body.length > 0), "时间线标题/正文非空");
  const sorted = TIMELINE.every((t, i) => i === 0 || TIMELINE[i - 1].dateSort <= t.dateSort);
  check(sorted, "时间线按 dateSort 有序");
  const used = new Set(TIMELINE.map((t) => t.phase));
  check([...phaseIds].every((p) => used.has(p)), "五个阶段都有事件覆盖");
}

console.log("[3] 双方阵容");
{
  const ids = new Set();
  const walk = (node) => {
    if (!node.id || !node.name) return false;
    if (ids.has(node.id)) return false;
    ids.add(node.id);
    return (node.children || []).every(walk);
  };
  check(FORCES.cn.roots.every(walk) && FORCES.jp.roots.every(walk), "组织树 id 唯一且名称非空");
  check(FORCES.cn.roots.length === 1 && FORCES.jp.roots.length === 2, "根节点结构（中方 1 / 日方 2）");
  const stars = (rootN) => {
    let n = 0;
    const w = (x) => { if (x.star) n += 1; (x.children || []).forEach(w); };
    (rootN || []).forEach(w);
    return n;
  };
  check(stars(FORCES.cn.roots) >= 3 && stars(FORCES.jp.roots) >= 2, "核心单位标 ★");
}

console.log("[4] 人物志");
{
  const ids = new Set(PEOPLE.map((p) => p.id));
  check(ids.size === PEOPLE.length, "人物 id 唯一");
  check(PEOPLE.every((p) => p.side === "cn" || p.side === "jp"), "人物 side 合法");
  check(PEOPLE.filter((p) => p.side === "cn").length === 14, "中方 14 人");
  check(PEOPLE.filter((p) => p.side === "jp").length === 6, "日方 6 人");
  check(PEOPLE.every((p) => p.story.length > 0), "人物故事非空");
  check(PEOPLE.every((p) => !p.quote || TIER[p.quote.tier]), "人物语录 tier 合法");
  const laterIds = Object.keys(PEOPLE_LATER);
  check(laterIds.length >= 12, `人物「后来」≥ 12 条（实际 ${laterIds.length}）`);
  const personIds = new Set(PEOPLE.map((p) => p.id));
  check(laterIds.every((id) => personIds.has(id)), "「后来」键全部对应人物 id");
}

console.log("[5] 武器");
{
  const ids = new Set(WEAPONS.map((w) => w.id));
  check(ids.size === WEAPONS.length, "武器 id 唯一");
  const catIds = new Set(WEAPON_CATEGORIES.map((c) => c.id));
  check(WEAPONS.every((w) => catIds.has(w.category)), "武器类别合法");
  check(WEAPONS.every((w) => w.side === "cn" || w.side === "jp"), "武器 side 合法");
  check(WEAPONS.filter((w) => w.side === "cn").length >= 12, "中方武器 ≥ 12");
  check(WEAPONS.filter((w) => w.side === "jp").length >= 10, "日方武器 ≥ 10");
  check(WEAPONS.filter((w) => w.category === "gap").length === 3, "缺口卡 3 张");
  check(WEAPONS.every((w) => w.name && w.notes.length > 0), "武器名称/说明非空");
  check(WEAPON_PAIRS.length === 8, "对比配对 8 类");
  const missing = [];
  for (const pair of WEAPON_PAIRS) {
    for (const id of [...pair.cn, ...pair.jp]) if (!ids.has(id)) missing.push(id);
  }
  check(missing.length === 0, `配对引用全部存在${missing.length ? `（缺失: ${missing.join(",")}）` : ""}`);
  check(BALANCE.length === 8 && BALANCE.every((b) => b.cn >= 0 && b.cn <= 10 && b.jp >= 0 && b.jp <= 10), "火力天平 8 项且取值 0—10");
}

console.log("[6] 敢死队 / 战术 / 代价 / 语录 / 纠偏 / 词典 / 阅读");
check(DARES.length === 5, "敢死队 5 批");
check(DARES.every((d) => TIER[d.tier] && d.leader && d.count && d.result), "敢死队字段完整");
check(DARE_LOADOUT.length === 5, "敢死队装备清单 5 项");
check(DARE_NOTES.length === 3, "敢死队注记 3 条");
check(TACTICS.length === 6, "战术 6 张牌");
check(TACTICS.every((t) => t.body.length > 0), "战术正文非空");
check(CASUALTY_TABLE.jp.rows.length >= 5, "日军伤亡表 ≥ 5 行");
check(CASUALTY_TABLE.cn.rows.length >= 5, "中方伤亡表 ≥ 5 行");
check(CASUALTY_TABLE.loot.rows.length === 2, "缴获对照表 2 行");
check(QUOTES.length === 8 && QUOTES.every((q) => TIER[q.tier]), "语录 8 条且 tier 合法");
check(MYTHS.length === 12 && MYTHS.every((m) => TIER[m.tier]), "纠偏 12 条且 tier 合法");
check(GLOBAL_GLOSSARY_CHECK(GLOSSARY), "词典非空且字段完整");
check(READING.length >= 6 && READING.every((r) => r.title && r.url), "延伸阅读 ≥ 6 条");
check(TOWN_FACTS.length === 7, "城档案 7 条");

function GLOBAL_GLOSSARY_CHECK(g) {
  return Array.isArray(g) && g.length > 0 && g.every((x) => x.term && x.def);
}

console.log("[6b] 回忆录选摘");
check(MEMOIR_INTRO.book.includes("李宗仁") && MEMOIR_INTRO.rules.length === 3, "回忆录简介与 3 条阅读守则");
check(MEMOIR_EXCERPTS.length === 10, `回忆录选摘 10 段（实际 ${MEMOIR_EXCERPTS.length}）`);
{
  const ids = new Set(MEMOIR_EXCERPTS.map((m) => m.id));
  check(ids.size === MEMOIR_EXCERPTS.length, "选摘 id 唯一");
  check(MEMOIR_EXCERPTS.every((m) => m.quote.length >= 60), "选摘引文 ≥ 60 字");
  check(MEMOIR_EXCERPTS.every((m) => m.part && m.title && m.note), "选摘字段完整");
  check(MEMOIR_EXCERPTS.every((m) => m.link && m.link.href.startsWith("#")), "选摘对照链接为页内锚点");
  const keyPhrases = ["好得很", "捐弃个人前嫌", "孤军深入", "全师殉城", "请君入瓮", "每一住宅皆系一堡垒", "逡巡不进", "最后五分钟", "杀无赦", "空前的胜利"];
  const all = MEMOIR_EXCERPTS.map((m) => m.quote).join("");
  check(keyPhrases.every((p) => all.includes(p)), "十段关键原文短语逐字在案");
}

console.log("[6c] 滕县详解");
check(TENGXIAN_BATTLE.days.length === 6, `滕县逐日 6 天（实际 ${TENGXIAN_BATTLE.days.length}）`);
check(TENGXIAN_BATTLE.days.every((d) => TIER[d.tier] && d.title && d.body.length > 0), "滕县逐日字段完整且 tier 合法");
check(TENGXIAN_BATTLE.days[0].date === "3.13" && TENGXIAN_BATTLE.days[5].date === "3.18", "滕县起止为 3.13—3.18");
check(Object.keys(TENGXIAN_MARKERS).length >= 9, `滕县地图标记 ≥ 9 个（实际 ${Object.keys(TENGXIAN_MARKERS).length}）`);
check(Object.values(TENGXIAN_MARKERS).every((m) => m.label && m.body && (m.side === "cn" || m.side === "jp")), "滕县标记字段完整");
check(TENGXIAN_BATTLE.summary.includes("三天"), "滕县摘要点明「三天」的意义");

console.log("[7] index.html 容器与引用");
{
  const html = readFileSync(join(root, "index.html"), "utf8");
  const requiredIds = [
    "readProgress", "navLinks", "statGrid", "tldrGrid", "factList",
    "forceCnTitle", "forceCnSub", "forceCnNote", "forceCnTree",
    "forceJpTitle", "forceJpSub", "forceJpNote", "forceJpTree",
    "peopleFilters", "peopleGrid",
    "wpnToolbar", "wpnNote", "wpnGrid",
    "wpnModal", "wpnModalClose", "wpnModalTitle", "wpnModalNick", "wpnModalFull", "wpnModalSpec", "wpnModalNotes",
    "comparePicks", "compareGrid", "balanceRows",
    "phaseLegend", "tlList", "tlPlay", "tlReset",
    "mapTabs", "mapStage", "tengxianHead", "tengxianInfo", "tengxianDays", "tengxianAftermath",
    "dareGrid", "dareLoadout", "dareNotes",
    "tacticGrid", "casTables", "quoteGrid", "memoirIntro", "memoirList",
    "mythGrid", "glossary", "readingList",
  ];
  const missingIds = requiredIds.filter((id) => !html.includes(`id="${id}"`));
  check(missingIds.length === 0, `容器 id 全部存在${missingIds.length ? `（缺失: ${missingIds.join(",")}）` : ""}`);
  const navBlock = html.match(/navLinks[\s\S]*?<\/nav>/);
  check(Boolean(navBlock), "导航块存在");
  const navHrefs = navBlock ? [...navBlock[0].matchAll(/href="#([^"]+)"/g)].map((m) => m[1]) : [];
  check(navHrefs.includes("memoir") && navHrefs.includes("tengxian"), "导航含回忆录选摘与滕县详解");
  const missingSections = navHrefs.filter((id) => !html.includes(`id="${id}"`));
  check(missingSections.length === 0, `导航锚点全部有对应 section${missingSections.length ? `（缺失: ${missingSections.join(",")}）` : ""}`);
  const svgMarkers = new Set([...html.matchAll(/data-marker="([^"]+)"/g)].map((m) => m[1]));
  const missingMarkers = Object.keys(TENGXIAN_MARKERS).filter((id) => !svgMarkers.has(id));
  check(missingMarkers.length === 0, `滕县地图标记全部落在 SVG 上${missingMarkers.length ? `（缺失: ${missingMarkers.join(",")}）` : ""}`);
  const orphanMarkers = [...svgMarkers].filter((id) => !TENGXIAN_MARKERS[id]);
  check(orphanMarkers.length === 0, `SVG 标记全部有对应数据${orphanMarkers.length ? `（孤儿: ${orphanMarkers.join(",")}）` : ""}`);
  const mapPhases = (html.match(/class="mapPhase"/g) || []).length;
  check(mapPhases === 3, `态势图 3 个阶段组（实际 ${mapPhases}）`);
  const mapTabs = (html.match(/class="mapTab(?:\s+on)?"/g) || []).length;
  check(mapTabs === 3, `态势图 3 个切换按钮（实际 ${mapTabs}）`);
  check(html.includes('src="Script_Main.mjs?v=4"'), "引用 Script_Main.mjs?v=4");
  check(html.includes('href="Style_Main.css?v=4"'), "引用 Style_Main.css?v=4");
  check(html.includes('id="readingPath"'), "讲解路线容器存在");
  check(READING_PATH.length === 6 && READING_PATH.every((s) => s.href.startsWith("#")), "讲解路线 6 步且为页内锚点");
  const rpAnchors = READING_PATH.map((s) => s.href.slice(1));
  const missingRp = rpAnchors.filter((id) => !html.includes(`id="${id}"`));
  check(missingRp.length === 0, `讲解路线锚点全部存在${missingRp.length ? `（缺失: ${missingRp.join(",")}）` : ""}`);
  check(READING.some((r) => r.url.includes("bilibili.com/video/BV1Czk3BCE9t")), "延伸阅读含讲解视频链接");
  const anchors = MEMOIR_EXCERPTS.map((m) => m.link.href.slice(1));
  const missingAnchors = anchors.filter((id) => !html.includes(`id="${id}"`));
  check(missingAnchors.length === 0, `选摘对照锚点全部存在${missingAnchors.length ? `（缺失: ${missingAnchors.join(",")}）` : ""}`);
}

console.log("[8] 脚本语法（node --check）");
for (const f of ["Script_Main.mjs", "Data_Museum.mjs"]) {
  const path = join(root, f);
  check(existsSync(path), `${f} 存在`);
  const res = spawnSync(process.execPath, ["--check", path], { stdio: "inherit" });
  check(res.status === 0, `${f} 语法通过`);
}

console.log("");
if (failures > 0) {
  console.error(`SMOKE FAIL: ${failures} 项未通过`);
  process.exit(1);
}
console.log("SMOKE PASS: 全部校验通过");
