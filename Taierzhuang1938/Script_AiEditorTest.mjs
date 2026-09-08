// Script_AiEditorTest.mjs —— 敌军 AI 编辑器（Script_EditorAi）的浏览器闸门。
// 验收口径：docs/Data_EnemyAi.md §14.5。跑法：node Taierzhuang1938/Script_AiEditorTest.mjs
//
// 这一层守的不是「面板长得对不对」，而是四件会在很远的地方才发作的事：
//   1. 世界叠加**进得去也出得来** —— three 对象摘干净、几何 dispose、头顶标签还原；
//   2. 滑杆改的是**运行时真正被读的那张表**，不是一份副本（下一次 Think 就吃到）；
//   3. 没有保存端点时「保存到源码」**退化为复制**，而不是静默失败或抛错；
//   4. 打开这个叠加层**不暂停玩法、不接管相机** —— 它就是拿来边打边看的。
//
// 入口 ?shot=1：编辑器 DOM 在出图模式下是 display:none，但 API 全在，
// three 叠加物照画 —— 这个测试就是这么跑的。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

// ---------------------------------------------------------------------------
// 行为图的 oracle：STATE 有几个值，从 Script_Ai.mjs 的源码里数，不问被测代码。
// ---------------------------------------------------------------------------
const aiSource = fs.readFileSync(path.join(projectDir, "Script_Ai.mjs"), "utf8");
const stateBlock = aiSource.match(/\nconst STATE = \{([\s\S]*?)\n\};/);
if (!stateBlock) throw new Error("在 Script_Ai.mjs 里找不到 STATE 字面量");
const stateBody = stateBlock[1]
  .replace(/\/\*[\s\S]*?\*\//g, "")     // 块注释里也有大写词，先去掉
  .replace(/\/\/[^\n]*/g, "");
const STATE_COUNT = [...stateBody.matchAll(/([A-Z][A-Z_]*)\s*:\s*"/g)].length;

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR ${String(e).slice(0, 240)}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  // 「保存到源码」那一条**故意**去问一个不存在的端点：ServeRoot 没有 /__tuning，
  // 浏览器照例把 404 打进 console。这正是本测试要验的退化路径，不是脚本错误。
  if (/__tuning/.test(url) || /__tuning/.test(m.text())) return;
  errors.push(`CONSOLE ${m.text().slice(0, 200)} @ ${url}`);
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}
function Info(name, detail) {
  console.log(`note ${name}${detail ? "  — " + detail : ""}`);
}

try {
  console.log(`Script_Ai.STATE 有 ${STATE_COUNT} 个值`);
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=1&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready && window.Taierzhuang?.editor,
    null, { timeout: 300000 });

  // 与 Script_AiBehaviorTest 同一条开局：把阶段钟拨到完整首遇，再触发一次补兵拍。
  await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.state.phaseTime = 31;
    T.state.spawnAccumulator = 3.1;
    T.StepFrames(1, 1 / 60, false);
  });
  await page.evaluate(() => window.Taierzhuang.StepFrames(180, 1 / 60, false));

  // -------------------------------------------------------------------------
  // 1) 打开：六个分节在，玩法照跑
  // -------------------------------------------------------------------------
  const opened = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const before = T.state.elapsed;
    const ok = T.Debug.OpenEditor("ai");
    T.StepFrames(10, 1 / 60, false);
    const tool = T.editor.overlays.get("ai");
    return {
      ok,
      registered: !!tool,
      pages: document.querySelectorAll(".edPanel.ai [data-page]").length,
      pageIds: [...document.querySelectorAll(".edPanel.ai [data-page]")].map((el) => el.dataset.page),
      activeId: T.editor.ActiveId,
      capturing: T.editor.Capturing,
      advanced: T.state.elapsed - before,
      panelHidden: document.getElementById("edRoot").classList.contains("off"),
    };
  });
  Check("Debug.OpenEditor(\"ai\") 打开叠加层", opened.ok && opened.registered);
  Check("六个分节都在", opened.pages === 6, `[${opened.pageIds.join(", ")}]`);
  Check("叠加层不接管相机、不暂停玩法", !opened.activeId && !opened.capturing && opened.advanced > 0,
    `active=${opened.activeId} capturing=${opened.capturing} elapsed+${opened.advanced.toFixed(3)}`);
  Check("出图模式下 DOM 藏着但 API 照常", opened.panelHidden && opened.registered);

  // -------------------------------------------------------------------------
  // 2) 选中一个兵：世界叠加真的画出东西，取证口对得上
  // -------------------------------------------------------------------------
  const picked = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("ai");
    const soldier = T.ai.soldiers.find((s) => s.alive && s.side === "ija") || T.ai.soldiers.find((s) => s.alive);
    if (!soldier) return { none: true };
    // 取证口按 id 出一个人的完整快照 —— 面板读的就是它。
    const snapshot = T.Debug.Ai.State(soldier.id);
    tool.selectedId = soldier.id;
    tool.Refresh(true);
    T.StepFrames(4, 1 / 60, true);
    return {
      id: soldier.id,
      snapshotId: snapshot?.id ?? null,
      hasStateLog: Array.isArray(snapshot?.stateLog),
      logLength: snapshot?.stateLog?.length ?? 0,
      attached: tool.OverlayAttached(),
      host: tool.overlayHost,
      lineVertices: tool.overlay.lines.count,
      pointVertices: tool.overlay.points.count,
      lineDrawRange: tool.overlay.lines.geometry.drawRange.count,
      overlayMs: tool.overlayMs,
      inScene: !!tool.overlay.root.parent,
    };
  });
  Check("场上有活人可选", !picked.none, `id=${picked.id}`);
  Check("Debug.Ai.State(id) 带出状态切换环", picked.hasStateLog,
    `${picked.logLength} 条`);
  Check("叠加根节点挂上了", picked.attached, `挂在 ${picked.host}`);
  Check("选中后画出了线段", picked.lineVertices > 0 && picked.lineDrawRange === picked.lineVertices,
    `${picked.lineVertices / 2} 段 / ${picked.pointVertices} 点`);
  Check("叠加层每帧开销在预算内（≤0.3 ms）", picked.overlayMs <= 0.3,
    `${picked.overlayMs.toFixed(3)} ms`);

  // 「射线/秒」是两次采样的差。它一度恒为 0：采样挂在 Refresh 上，而切页/选人
  // 那些随手来的强制刷新会把窗口一直重置。这一条守的是「随便怎么刷都还读得出数」。
  const rays = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("ai");
    for (let i = 0; i < 5; i += 1) {
      T.StepFrames(45, 1 / 60, false);
      tool.SetPage("overview");     // 每一轮都强制刷一次，故意干扰采样窗
      tool.Refresh(true);
    }
    return { perSecond: tool.raySample.perSecond, text: tool.ui.overviewFacts.root.textContent };
  });
  Check("射线/秒 读得出数（强制刷新不打断采样窗）", rays.perSecond > 0,
    `${rays.perSecond.toFixed(1)} 条/秒`);

  // -------------------------------------------------------------------------
  // 3) 调参：改了表里的数真的变了，下一次 Think 读到，重置能还原
  // -------------------------------------------------------------------------
  const tuning = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("ai");
    const PATH = "COVER_CYCLE.peekMinS";
    const entry = tool.tuning.byPath.get(PATH);
    if (!entry) return { missing: true, keys: tool.tuning.byPath.size };
    const fileValue = entry.fileValue;
    const applied = tool.SetTuningByPath(PATH, 2.5);
    const nowInTable = entry.owner.peekMinS;

    // 「下一次 Think 读到」怎么量：直接驱动 UpdateCoverCycle 走一次 hide → peek，
    // 探头时长就是 peekMinS + rnd × (peekMaxS − peekMinS)。把 rnd 钉成 0，
    // 剩下的那个数必须**正好**是刚拖出来的值 —— 表被缓存过就对不上。
    const s = T.ai.soldiers.find((x) => x.alive);
    const oldRnd = s.rnd;
    const oldCover = s.cover;
    const oldPhase = s.coverPhase;
    s.rnd = () => 0;
    const at = { x: s.position.x, z: s.position.z };
    s.cover = {
      id: 0, x: at.x, z: at.z, height: 1.6, nx: 0, nz: 0, hasNormal: false,
      hidePos: { x: at.x, z: at.z }, firePos: { x: at.x, z: at.z },
      fireStance: 1, hideStance: 1, validated: true, side: "over", blockedCrouched: false,
    };
    s.coverPhase = "hide";
    s.coverPhaseUntil = T.ai.time - 1;
    T.ai.UpdateCoverCycle(s, null);
    const dwell = s.coverPhaseUntil - T.ai.time;
    const phase = s.coverPhase;
    s.rnd = oldRnd;
    s.cover = oldCover;
    s.coverPhase = oldPhase;

    const snippet = tool.CopySnippet();
    const textarea = tool.ui.snippet.value;
    const changedCount = tool.ChangedEntries().length;
    const reset = tool.ResetTuning();
    return {
      keys: tool.tuning.byPath.size,
      frozen: tool.tuning.frozen,
      applied, fileValue, nowInTable, dwell, phase,
      snippetHasKey: snippet.includes(PATH) && snippet.includes("2.5"),
      textareaHasKey: textarea.includes(PATH),
      changedCount, reset,
      afterReset: entry.owner.peekMinS,
    };
  });
  Check("五张表枚举出了数值叶子", !tuning.missing && tuning.keys > 200, `${tuning.keys} 个键`);
  Check("本机表不冻结（?aiedit / localhost）", tuning.frozen === false);
  Check("拖滑杆改的是表对象本身", tuning.applied && tuning.nowInTable === 2.5,
    `文件值 ${tuning.fileValue} → ${tuning.nowInTable}`);
  Check("下一次 UpdateCoverCycle 读到新值", tuning.phase === "peek" && Math.abs(tuning.dwell - 2.5) < 1e-6,
    `phase=${tuning.phase} 探头时长=${tuning.dwell}`);
  Check("复制 mjs 片段含改过的键", tuning.snippetHasKey && tuning.textareaHasKey);
  Check("重置到文件值能还原", tuning.reset === tuning.changedCount && tuning.afterReset === tuning.fileValue,
    `还原 ${tuning.reset} 个 → ${tuning.afterReset}`);

  // -------------------------------------------------------------------------
  // 4) 保存：测试的 ServeRoot 没有 /__tuning 端点 → 退化为复制并说明原因
  // -------------------------------------------------------------------------
  const save = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("ai");
    tool.SetTuningByPath("COVER_CYCLE.peekMinS", 1.9);
    const result = await tool.SaveToSource();
    const note = tool.ui.tuningStatus.textContent;
    const snippet = tool.ui.snippet.value;
    tool.ResetTuning();
    return { result, note, snippetHasKey: snippet.includes("COVER_CYCLE.peekMinS") };
  });
  Check("没有保存端点时退化为复制", save.result?.degraded === true && save.snippetHasKey,
    save.note);
  Check("退化时把原因写在面板上", /退化|没有保存端点|不可写/.test(save.note || ""), save.note);

  // -------------------------------------------------------------------------
  // 5) 行为图
  // -------------------------------------------------------------------------
  const graph = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("ai");
    tool.SetPage("graph");
    tool.RefreshGraph();
    // 契约缝：行为图的每个 keys 都该在「调参」里点得到一根滑杆。点不到的说明
    // 那个键落在本面板收录的表之外 —— 报出来，别让「点边没反应」当无声失败。
    const keys = new Set();
    for (const edge of tool.graphEdges) for (const key of edge.keys) keys.add(key);
    const unresolved = [...keys].filter((key) => !tool.tuning.byPath.has(key));
    // 随便挑一个能解析的键，验「点边 → 跳到滑杆并闪一下」这条路真的通。
    const sample = [...keys].find((key) => tool.tuning.byPath.has(key)) || null;
    const jumped = sample ? tool.JumpToKey(sample) : false;
    const flashed = sample
      ? !!tool.tuning.byPath.get(sample).control.root.classList.contains("edAiFlash") : false;
    const jumpedTable = tool.tuningTable;
    tool.SetPage("graph");
    return {
      nodes: tool.graphNodes.size,
      edges: tool.graphEdges.length,
      note: tool.ui.graphNote.textContent,
      svgChildren: tool.ui.graphSvg.childElementCount,
      keyCount: keys.size, unresolved, sample, jumped, flashed, jumpedTable,
    };
  });
  if (graph.nodes === 0) {
    // Data_AiBrainGraph 还是脚手架桩（内容由并行的另一位交付）。
    // 这一轮能守的只有「对空数据健壮」：不抛错、给出未就绪提示、一个元素都不画。
    Check("行为图对空数据健壮：不画节点并给出未就绪提示",
      graph.svgChildren === 0 && /未就绪/.test(graph.note || ""), graph.note);
    Info("PENDING 行为图节点数 == STATE 值数",
      `BRAIN_GRAPH.states 仍为空；填上内容后这一条自动变成硬断言（期望 ${STATE_COUNT} 个节点）`);
  } else {
    Check("行为图节点数 == STATE 值数", graph.nodes === STATE_COUNT,
      `${graph.nodes} / ${STATE_COUNT}，${graph.edges} 条边`);
    Check("点边跳到调参里那根滑杆并闪一下", graph.jumped && graph.flashed,
      `${graph.sample} → ${graph.jumpedTable} 表`);
    // 面板只收敌军 AI 行为那几张表，行为图按「Think 真的读了什么」抄，
    // 两边不完全重合是已知的（见报告）。这一条只把差集钉住，别让它悄悄变大。
    Check("行为图的表键最多只有 SIGHT_BY_STANCE 落在面板之外",
      graph.unresolved.every((key) => key.startsWith("SIGHT_BY_STANCE")),
      `${graph.keyCount} 个键，面板外 ${graph.unresolved.length} 个：${graph.unresolved.join(", ") || "无"}`);
  }

  // -------------------------------------------------------------------------
  // 6) 试验场：桩返回空值时要明说「未就绪」，不许装作成功
  // -------------------------------------------------------------------------
  const probe = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("ai");
    tool.SetPage("probe");
    const rosterBefore = T.ai.soldiers.length;
    const squad = tool.SpawnProbe();
    const note = tool.probeNote;
    const rosterAfter = T.ai.soldiers.length;
    const immortal = tool.MakeImmortal();
    const immortalNote = tool.probeNote;
    const playerHealth = T.player.health;
    const memory = tool.ResetMemory();
    const memoryNote = tool.probeNote;
    const cleared = tool.ClearProbe();
    const rosterRestored = T.ai.soldiers.length;
    return {
      spawned: squad ? squad.length : 0, note,
      rosterBefore, rosterAfter, rosterRestored,
      immortal, immortalNote, playerHealth, memory, memoryNote,
      cleared, clearNote: tool.probeNote,
    };
  });
  if (probe.spawned > 0) {
    Check("试验场撒出了一个班并清场", probe.spawned >= 3 && probe.rosterAfter === probe.spawned,
      `${probe.spawned} 人，场上 ${probe.rosterBefore} → ${probe.rosterAfter}`);
    Check("玩家无敌", probe.immortal && probe.playerHealth >= 1e6, probe.immortalNote);
    Check("清场还原把花名册放回去", probe.cleared && probe.rosterRestored >= probe.rosterBefore,
      `${probe.rosterAfter} → ${probe.rosterRestored}（原 ${probe.rosterBefore}）`);
  } else {
    Check("试验场未就绪时明确提示", /未就绪/.test(probe.note || ""), probe.note);
    Info("PENDING 试验场一键布场", "Script_AiProbeScene 仍是桩（并行任务）");
  }
  Check("重置本局 AI 记忆可用", probe.memory === true, probe.memoryNote);

  // -------------------------------------------------------------------------
  // 7) 退出：three 对象摘干净、几何 dispose、头顶标签还原
  // -------------------------------------------------------------------------
  const closed = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("ai");
    // 头顶标签：进来前是关的，面板里打开，退出必须还成关的。
    T.Debug.Ai.Overlay(true);
    const headBefore = T.Debug.Ai.Overlay();

    const root = tool.overlay.root;
    const geometries = [tool.overlay.lines.geometry, tool.overlay.points.geometry];
    let disposed = 0;
    for (const geometry of geometries) geometry.addEventListener("dispose", () => { disposed += 1; });

    T.StepFrames(4, 1 / 60, true);
    const geoOpen = T.renderer.info.memory.geometries;

    T.editor.CloseOverlay("ai");
    T.StepFrames(4, 1 / 60, true);
    const geoClosed = T.renderer.info.memory.geometries;

    return {
      headBefore, headAfter: T.Debug.Ai.Overlay(),
      stillRegistered: T.editor.overlays.has("ai"),
      inPostOverlays: !!T.post?.debugOverlays?.has?.(root),
      inScene: !!root.parent,
      childCount: root.children.length,
      disposed, geoOpen, geoClosed,
      labelBox: document.getElementById("aiDebugOverlay")
        ? [...document.getElementById("aiDebugOverlay").children].filter((el) => el.style.display !== "none").length
        : 0,
    };
  });
  Check("关掉后叠加层从套件里摘掉", !closed.stillRegistered);
  Check("three 对象从渲染路径上全部移除",
    !closed.inPostOverlays && !closed.inScene && closed.childCount === 0);
  Check("两块 BufferGeometry 都 dispose 了", closed.disposed === 2, `${closed.disposed}/2`);
  Check("renderer.info.memory.geometries 不涨", closed.geoClosed <= closed.geoOpen,
    `${closed.geoOpen} → ${closed.geoClosed}`);
  Check("头顶标签还原到进入前的状态", closed.headBefore === true && closed.headAfter === false
    && closed.labelBox === 0);

  // -------------------------------------------------------------------------
  // 8) 再开一次：不留瞎状态（叠加层要能反复开关）
  // -------------------------------------------------------------------------
  const reopened = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.Debug.OpenEditor("ai");
    T.StepFrames(6, 1 / 60, true);
    const tool = T.editor.overlays.get("ai");
    const ok = !!tool && tool.OverlayAttached();
    T.editor.Close({ all: true });
    return { ok, gone: !T.editor.overlays.has("ai") };
  });
  Check("反复开关不留瞎状态", reopened.ok && reopened.gone);

  Check("没有脚本错误", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 条通过`);
if (failed.length) {
  for (const r of failed) console.log(`  FAIL ${r.name}${r.detail ? "  — " + r.detail : ""}`);
  process.exitCode = 1;
}
