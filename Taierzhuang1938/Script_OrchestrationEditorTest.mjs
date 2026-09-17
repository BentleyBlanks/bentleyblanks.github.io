// ===========================================================================
// Script_OrchestrationEditorTest.mjs —— 关卡编排工作台（Script_EditorOrchestration）的浏览器闸门
//
// 跑法：node Taierzhuang1938/Script_OrchestrationEditorTest.mjs
// 口径：docs/Data_MissionOrchestration.md。
//
// 这一层守的不是「面板长得好不好看」，而是五件会在很远的地方才发作的事：
//   1. 面板上的勾**是运行时真值**：要求事实的 ✓/… 与 `runtime.flow.Has` 逐条对；
//      自己另算一套「大概满足了吧」的话，用户对着一张假进度表提意见，白提。
//   2. 设计与实际分得开：设计行的 condition 标记**没有秒数**（它由玩家行为触发），
//      实际行的时刻只来自 flow.log。混成一行就等于把「预定安排」当成「真的发生过」。
//   3. 反查指得回源表：选中一个敌人要说得出他属于哪组、哪步生成、按什么出现。
//   4. 没有保存端点时**退化而不是静默失败**：草稿进 localStorage，面板把原因写在脸上。
//   5. 关窗、Dispose 之后不留东西：overlays 空、入口开关复位、弹窗真的关了。
//
// 入口 ?shot=1：编辑器 DOM 在出图模式下是 display:none，但 API 全在，弹窗照开 ——
// 这个测试就是这么跑的（与 Script_AiEditorTest 同一条路）。
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const STORAGE_KEY = "tengxian1938_orchestration_notes_FirstLevel";
const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const shotDir = path.join(projectDir, "_shots", "Orchestration");
await fs.mkdir(shotDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  // 「保存草稿」**故意**去问一个不存在的端点：ServeRoot 没有 /__notes，
  // 浏览器照例把 404 打进 console。这正是本测试要验的退化路径，不是脚本错误。
  if (/__notes/.test(url) || /__notes/.test(message.text())) return;
  errors.push(`CONSOLE ${message.text().slice(0, 200)} @ ${url}`);
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  — " + detail : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/`
    + "?whitebox=p012&missionStage=12&shot=1&quality=low&scale=small&audio=0",
  { waitUntil: "load", timeout: 180000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready && window.Taierzhuang?.editor,
    null, { timeout: 300000 });
  // 上一轮如果红在半路，草稿会留在 localStorage 里，下一轮的「退化成一条」就对不上。
  await page.evaluate((key) => { try { localStorage.removeItem(key); } catch (error) { /* 隐私模式 */ } }, STORAGE_KEY);

  // -------------------------------------------------------------------------
  // 1) 入口：26 个按钮，工作台在「调试」组里
  // -------------------------------------------------------------------------
  Check("入口面板共 26 个按钮", await page.locator(".edPanel.launcher [data-editor]").count() === 26,
    `实际 ${await page.locator(".edPanel.launcher [data-editor]").count()}`);
  const group = await page.locator(".edPanel.launcher .edSection")
    .filter({ has: page.locator('[data-editor="orchestration"]') }).locator(":scope > .h").textContent();
  Check("关卡编排入口在「调试」组", group === "调试", `实际「${group}」`);

  // -------------------------------------------------------------------------
  // 2) 打开：独立弹窗，三栏与时间轴都在
  // -------------------------------------------------------------------------
  const popupEvent = page.waitForEvent("popup");
  const opened = await page.evaluate(() => window.Taierzhuang.Debug.OpenEditor("orchestration"));
  Check("Debug.OpenEditor 开得起来", opened);
  const popup = await popupEvent;
  await popup.waitForSelector('[data-timeline="design"] .tlMark');

  for (const [selector, label] of [
    ['[data-orch="flow"]', "流程栏"], ['[data-orch="map"]', "俯视图栏"], ['[data-orch="detail"]', "详情栏"],
    ['[data-orch="timeline"]', "时间轴"], ['[data-orch="canvas"]', "画布"], ['[data-orch="live-status"]', "实时状态行"],
    ['[data-notes="status"]', "批注状态行"], ['[data-notes="list"]', "批注列表"],
  ]) {
    Check(`${label} 在弹窗里`, await popup.locator(selector).count() === 1);
  }
  Check("流程栏列出 18 个阶段", await popup.locator("[data-flow-phase]").count() === 18);
  Check("流程栏列出 27 个步骤", await popup.locator("[data-flow-step]").count() === 27);
  Check("每个阶段都有「从这里试玩」", await popup.locator("[data-jump]").count() === 18);
  Check("图层开关 13 个", await popup.locator("[data-layer]").count() === 13);
  Check("工具 7 把", await popup.locator("[data-tool]").count() === 7);

  // -------------------------------------------------------------------------
  // 3) 面板上的数就是运行时的数
  // -------------------------------------------------------------------------
  const live = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("orchestration");
    const runtime = T.editor.host.game.missionRuntime;
    T.editor.UpdateOverlays(0.3);
    const doc = tool.win.document;
    const rows = [...doc.querySelectorAll('[data-flow-step="Transfer"] [data-fact]')];
    const wrong = rows.filter((row) => row.dataset.factState !== (runtime.flow.Has(row.dataset.fact) ? "ok" : "wait"))
      .map((row) => `${row.dataset.fact}=${row.dataset.factState}`);
    const glyphs = [...new Set(rows.map((row) => row.firstChild.textContent))];
    const before = { time: tool.live?.time ?? null, x: tool.live?.player?.x ?? null };
    T.StepFrames(120, 1 / 60, false);
    T.player.position.x += 4;
    T.editor.UpdateOverlays(0.3);
    return {
      stepId: tool.live?.stepId ?? null,
      runtimeStep: runtime.flow.stage.id,
      phaseNumber: tool.live?.phaseNumber ?? null,
      status: doc.querySelector('[data-orch="live-status"]').textContent,
      wrong, glyphs,
      factCount: rows.length,
      before,
      after: { time: tool.live?.time ?? null, x: tool.live?.player?.x ?? null },
      playerX: T.player.position.x,
      // 跟随实时开着：地图阶段应该已经被拨到运行时那一阶段。
      mapPhase: tool.phaseNumber,
    };
  });
  Check("流程当前步 = 运行时当前步（Transfer）",
    live.stepId === "Transfer" && live.stepId === live.runtimeStep, `面板 ${live.stepId} / 运行时 ${live.runtimeStep}`);
  Check("实时状态行写出阶段与时钟", /阶段 12/.test(live.status) && /关卡时钟/.test(live.status), live.status.slice(0, 80));
  Check("当前步的要求事实与 flow.Has 逐条一致", live.wrong.length === 0 && live.factCount === 5, live.wrong.join(" "));
  Check("当前步的事实只画 ✓ 或 …", live.glyphs.every((glyph) => glyph === "✓" || glyph === "…"), live.glyphs.join(""));
  Check("推帧后关卡时钟在走", live.after.time > live.before.time, `${live.before.time} → ${live.after.time}`);
  Check("实时玩家点跟着玩家走", Math.abs(live.after.x - live.playerX) < 0.01 && live.after.x !== live.before.x,
    `面板 ${live.after.x} / 玩家 ${live.playerX}`);
  Check("跟随实时把地图拨到第 12 阶段", live.mapPhase === 12 && live.phaseNumber === 12);

  // -------------------------------------------------------------------------
  // 4) 阶段布局与反查
  // -------------------------------------------------------------------------
  const lookup = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("orchestration");
    tool.SetPhase(12);
    const states = Object.fromEntries(tool.map.phaseLayout.encounters.map((entry) => [entry.id, entry.state]));
    tool.Select({ kind: "member", id: "TransferGunner" });
    const doc = tool.win.document;
    return {
      states,
      title: doc.querySelector('[data-detail="title"]').textContent,
      owner: doc.querySelector('[data-detail="owner"]').textContent,
      json: doc.querySelector('[data-detail="json"]').textContent,
      selection: tool.selection,
      mapSelection: tool.map.selection,
    };
  });
  Check("第 12 阶段 transfer 组活跃、transferFlank 还没出现",
    lookup.states.transfer === "active" && lookup.states.transferFlank === "pending",
    `transfer=${lookup.states.transfer} transferFlank=${lookup.states.transferFlank}`);
  Check("选中成员联动到地图", lookup.mapSelection?.id === "TransferGunner");
  Check("右栏反查出所属组 / 生成步骤 / 出现方式",
    lookup.owner.includes("transfer") && lookup.owner.includes("Transfer") && lookup.owner.includes("beat"),
    lookup.owner.slice(0, 120));
  Check("右栏折叠了原始数据 JSON", lookup.json.includes("\"encounter\": \"transfer\""), lookup.json.slice(0, 80));

  // -------------------------------------------------------------------------
  // 5) 新建批注：草图 + 候选位 + 建议，无端点时退化为 localStorage
  // -------------------------------------------------------------------------
  const note = await page.evaluate(async (key) => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("orchestration");
    tool.SetNoteText("这组敌人出现得太早，转运刚开始就压到装车位上了。");
    tool.AddShape({ type: "circle", x: 113, z: 80, r: 12 });
    tool.SetCandidate({ x: 126, z: 74 }, { kind: "member", id: "TransferGunner" });
    tool.SetProposalKind("move");
    const saved = await tool.SaveDraft();
    const doc = tool.win.document;
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(key) || "null"); } catch (error) { stored = null; }
    const first = tool.notes[0] || null;
    return {
      saved,
      status: doc.querySelector('[data-notes="status"]').textContent,
      listed: doc.querySelectorAll('[data-notes="list"] [data-note]').length,
      localTag: doc.querySelector('[data-notes="list"] [data-note] .warn')?.textContent || "",
      stored: stored && Array.isArray(stored.notes) ? stored.notes.map((one) => one.id) : null,
      note: first,
      handoff: tool.HandoffText(),
      draftCleared: tool.draft.shapes.length === 0 && tool.draft.text === "" && tool.draft.candidate === null,
    };
  }, STORAGE_KEY);
  Check("保存草稿成功并退化到本地", note.saved?.ok && note.saved.mode === "local", JSON.stringify(note.saved));
  Check("面板写明退化原因（/__notes/status 404）",
    note.status.includes("/__notes/status 404") && note.status.includes("localStorage"), note.status.slice(0, 140));
  Check("localStorage 里存下了这条草稿", Array.isArray(note.stored) && note.stored.length === 1
    && note.stored[0] === note.saved.id, JSON.stringify(note.stored));
  Check("批注列表列出它并标「本地草稿」", note.listed === 1 && note.localTag === "本地草稿", note.localTag);
  Check("批注拍下了目标当时的真实数据",
    note.note?.original?.kind === "member" && note.note.original.encounter === "transfer"
    && Number.isFinite(note.note.original.x), JSON.stringify(note.note?.original)?.slice(0, 120));
  Check("草图带上了圈与候选位 ghost",
    note.note?.sketch?.shapes?.length === 2
    && note.note.sketch.shapes.some((shape) => shape.type === "circle")
    && note.note.sketch.shapes.some((shape) => shape.type === "ghost"),
    JSON.stringify(note.note?.sketch));
  Check("建议记成 move 并带候选位",
    note.note?.proposal?.kind === "move" && note.note.proposal.to?.x === 126 && note.note.proposal.to?.z === 74,
    JSON.stringify(note.note?.proposal));
  Check("没端点时不写图片引用", note.note?.image === null);
  Check("保存后草稿清空", note.draftCleared);
  Check("交接文本含这条批注的 id 与目标",
    note.handoff.includes(note.saved.id) && note.handoff.includes("TransferGunner"),
    note.handoff.slice(0, 80));

  // -------------------------------------------------------------------------
  // 6) 时间轴：设计行不许给条件编秒数，实际行有真的时刻
  // -------------------------------------------------------------------------
  const timeline = await page.evaluate(() => {
    const doc = window.Taierzhuang.editor.overlays.get("orchestration").win.document;
    const Read = (selector) => [...doc.querySelectorAll(selector)].map((node) => ({
      at: node.dataset.markerAt ?? null, text: node.textContent, title: node.title,
    }));
    return {
      condition: Read('[data-timeline="design"] .tlMark[data-marker-kind="condition"]'),
      beat: Read('[data-timeline="design"] .tlMark[data-marker-kind="beat"]'),
      timed: Read('[data-timeline="design"] .tlMark[data-marker-kind="timed"]'),
      stageEntry: Read('[data-timeline="actual"] .tlMark[data-marker-kind="stageEntry"]'),
      actualFact: Read('[data-timeline="actual"] .tlMark[data-marker-kind="fact"]'),
      lanes: doc.querySelectorAll('[data-timeline="design"] [data-lane]').length,
      legend: doc.querySelector('[data-timeline="legend"]')?.textContent || "",
    };
  });
  Check("设计行 18 条泳道", timeline.lanes === 18);
  Check("设计行的 condition 标记没有秒数",
    timeline.condition.length >= 50 && timeline.condition.every((mark) => mark.at === null && !/\d/.test(mark.text)),
    `${timeline.condition.length} 个`);
  Check("设计行的拍与定时标了秒数",
    timeline.beat.length === 4 && timeline.beat.every((mark) => mark.at !== null)
    && timeline.timed.length > 0 && timeline.timed.every((mark) => mark.at !== null),
    `beat ${timeline.beat.length} / timed ${timeline.timed.length}`);
  Check("实际行画出了实际进入的步骤与满足的事实",
    timeline.stageEntry.length > 0 && timeline.stageEntry.every((mark) => mark.at !== null)
    && timeline.actualFact.length > 0,
    `stageEntry ${timeline.stageEntry.length} / fact ${timeline.actualFact.length}`);
  Check("图例分清设计与实际", timeline.legend.includes("设计") && timeline.legend.includes("实际"));

  await popup.screenshot({ path: path.join(shotDir, "Workbench.png"), fullPage: true });

  // -------------------------------------------------------------------------
  // 7) 关窗、拦截与销毁
  // -------------------------------------------------------------------------
  await popup.close();
  await page.waitForFunction(() => {
    const T = window.Taierzhuang;
    T.editor.UpdateOverlays(0.3);
    return !T.editor.overlays.has("orchestration");
  }, null, { timeout: 30000 });
  Check("关掉弹窗后 overlays 里没了并复位开关",
    await page.evaluate(() => !window.Taierzhuang.editor.overlays.has("orchestration")
      && !window.Taierzhuang.editor.entries.get("orchestration").classList.contains("on")));

  const blocked = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const open = window.open;
    const error = console.error;
    window.open = () => null;
    console.error = () => {};
    try {
      T.editor.Toggle("orchestration");
      return !T.editor.overlays.has("orchestration")
        && !T.editor.entries.get("orchestration").classList.contains("on");
    } finally { window.open = open; console.error = error; }
  });
  Check("浏览器拦截弹窗时开关不残留", blocked);

  const disposed = await page.evaluate((key) => {
    const T = window.Taierzhuang;
    T.editor.Toggle("orchestration");
    const tool = T.editor.overlays.get("orchestration");
    const win = tool.win;
    T.editor.Dispose();
    try { localStorage.removeItem(key); } catch (error) { /* 隐私模式 */ }
    return win.closed && T.editor.overlays.size === 0;
  }, STORAGE_KEY);
  Check("销毁套件关闭工作台窗口", disposed);

  Check("没有页面错误", errors.length === 0, errors.join(" | "));
  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 项通过，截图 ${path.join(shotDir, "Workbench.png")}`);
  assert.equal(failed.length, 0, failed.map((entry) => `${entry.name}${entry.detail ? `（${entry.detail}）` : ""}`).join("\n"));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
