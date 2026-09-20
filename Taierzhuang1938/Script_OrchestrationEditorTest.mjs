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
const LAYOUT_KEY = "tengxian1938_orchestration_layout_FirstLevel";
const FILTER_KEY = "tengxian1938_orchestration_filter_FirstLevel";
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
  // 图标登记表是另一包的东西，工作台按「有就用、没有就画圆点」处理；
  // 它不在树上时浏览器会打一条 404，那不是工作台的错。
  if (/OrchestrationIcons|Icon_Orch_/.test(url) || /OrchestrationIcons/.test(message.text())) return;
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
  // 上一轮如果红在半路，草稿会留在 localStorage / IndexedDB 里，
  // 下一轮的「退化成一条」「缓存 1 张图」就全对不上。开跑前先清干净。
  await page.evaluate(async ({ key, layoutKey, filterKey }) => {
    // 三栏宽度与时间轴的折叠状态也记在 localStorage 里：上一轮要是把时间轴收起来了，
    // 这一轮 waitForSelector 会等一个 display:none 的标记等到超时。
    // 分类抽屉的开合与页签同理（上一轮停在「布设表」的话分类树根本不在 DOM 上）。
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(layoutKey);
      localStorage.removeItem(filterKey);
    } catch (error) { /* 隐私模式 */ }
    await Promise.race([
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase("tengxian1938_orchestration");
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
        request.onblocked = () => resolve(false);
      }),
      new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
    ]);
  }, { key: STORAGE_KEY, layoutKey: LAYOUT_KEY, filterKey: FILTER_KEY });

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
  Check("流程栏列出 28 个步骤（27 步 + Complete）", await popup.locator("[data-flow-step]").count() === 28);
  Check("每个阶段都有「从这里试玩」", await popup.locator("[data-jump]").count() === 18);
  Check("图层开关 14 个（含画布左下角那块图例）", await popup.locator("[data-layer]").count() === 14,
    `实际 ${await popup.locator("[data-layer]").count()}`);
  Check("工具 7 把", await popup.locator("[data-tool]").count() === 7);

  // 骨架：两条可拖的分栏线 + 可收起的时间轴。宽度与折叠状态都记在 localStorage，
  // 所以这里收完要放回去 —— 留着收起的话下一轮开窗看不到时间轴。
  const skeleton = await page.evaluate(() => {
    const doc = window.Taierzhuang.editor.overlays.get("orchestration").win.document;
    const tl = doc.querySelector('[data-orch="timeline"]');
    const toggle = doc.querySelector('[data-timeline="toggle"]');
    const before = tl.dataset.collapsed;
    toggle.click();
    const collapsed = tl.dataset.collapsed;
    toggle.click();
    const cols = doc.getElementById("cols");
    return {
      before, collapsed, after: tl.dataset.collapsed,
      splitters: doc.querySelectorAll('[data-orch="split-left"], [data-orch="split-right"]').length,
      left: cols.style.getPropertyValue("--left"), right: cols.style.getPropertyValue("--right"),
    };
  });
  Check("三栏之间有两条可拖的分栏线，宽度写在 --left/--right 上",
    skeleton.splitters === 2 && /px$/.test(skeleton.left) && /px$/.test(skeleton.right),
    `${skeleton.left} / ${skeleton.right}`);
  Check("时间轴能收起也能放回来",
    skeleton.before === "0" && skeleton.collapsed === "1" && skeleton.after === "0",
    `${skeleton.before} → ${skeleton.collapsed} → ${skeleton.after}`);

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
  Check("当前步的要求事实与 flow.Has 逐条一致", live.wrong.length === 0 && live.factCount === 6, live.wrong.join(" "));
  Check("当前步的事实只画 ✓ 或 …", live.glyphs.every((glyph) => glyph === "✓" || glyph === "…"), live.glyphs.join(""));
  Check("推帧后关卡时钟在走", live.after.time > live.before.time, `${live.before.time} → ${live.after.time}`);
  Check("实时玩家点跟着玩家走", Math.abs(live.after.x - live.playerX) < 0.01 && live.after.x !== live.before.x,
    `面板 ${live.after.x} / 玩家 ${live.playerX}`);
  Check("跟随实时把地图拨到第 12 阶段", live.mapPhase === 12 && live.phaseNumber === 12);

  const shape = await page.evaluate(() => {
    const tool = window.Taierzhuang.editor.overlays.get("orchestration");
    const doc = tool.win.document;
    const Phase = (n) => doc.querySelector(`[data-flow-phase="${n}"]`);
    return {
      now: Phase(12).dataset.phaseState, nowOpen: Phase(12).dataset.open,
      done: Phase(3).dataset.phaseState, todo: Phase(15).dataset.phaseState,
      waitTags: doc.querySelectorAll('[data-orch="live-status"] .tag.wait').length,
      remaining: tool.live?.remaining?.length ?? -1,
    };
  });
  Check("左栏把当前阶段标成「正在这里」并自动展开，走过的标「已走过」",
    shape.now === "now" && shape.nowOpen === "1" && shape.done === "done" && shape.todo === "todo",
    `12=${shape.now}/${shape.nowOpen} 3=${shape.done} 15=${shape.todo}`);
  Check("顶栏把「正在等」拆成一枚一枚小标签（不是一行斜杠）",
    shape.waitTags === shape.remaining && shape.waitTags > 0,
    `${shape.waitTags} 枚 / 实际在等 ${shape.remaining} 件`);

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
  Check("第 12 阶段 transfer 组活跃、transferAlley 还没出现",
    lookup.states.transfer === "active" && lookup.states.transferAlley === "pending",
    `transfer=${lookup.states.transfer} transferAlley=${lookup.states.transferAlley}`);
  Check("选中成员联动到地图", lookup.mapSelection?.id === "TransferGunner");
  // 「怎么出现」要说人话：内部字段名不许出现在句子里，
  // 编号（transfer / Transfer）只当尾巴上的等宽小字。
  Check("右栏反查出所属组 / 生成步骤 / 出现方式（第 n 处威胁，不写 kind=…）",
    lookup.owner.includes("transfer") && lookup.owner.includes("Transfer")
    && !lookup.owner.includes("kind="),
    lookup.owner.slice(0, 120));
  Check("右栏折叠了原始数据 JSON", lookup.json.includes("\"encounter\": \"transfer\""), lookup.json.slice(0, 80));

  // -------------------------------------------------------------------------
  // 4b) 点地图上的组把手 / 威胁标签，走的是同一条反查
  // -------------------------------------------------------------------------
  const fromMap = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("orchestration");
    const doc = tool.win.document;
    const map = tool.map;
    tool.SetTool("select");
    tool.SetPhase(12, { fit: true });
    const rect = map.canvas.getBoundingClientRect();
    const Click = (px, py) => {
      for (const type of ["mousedown", "mouseup"]) {
        map.canvas.dispatchEvent(new tool.win.MouseEvent(type, {
          clientX: rect.left + px, clientY: rect.top + py, button: 0, bubbles: true, cancelable: true,
        }));
      }
    };
    const Read = () => ({
      sel: tool.selection,
      title: doc.querySelector('[data-detail="title"]').textContent,
      owner: doc.querySelector('[data-detail="owner"]').textContent,
    });
    const group = map.HandlePoint("encounter", "transfer");
    if (group) Click(group.x, group.y);
    const encounter = Read();
    const threat = map.HandlePoint("threat", "transferAlley");
    if (threat) Click(threat.x, threat.y);
    const threatRead = Read();
    return { group, threat, encounter, threatRead, handles: map.handles.length };
  });
  Check("点地图组把手 → 选中整组并反查出出现方式",
    fromMap.encounter.sel?.kind === "encounter" && fromMap.encounter.sel?.id === "transfer"
    && fromMap.encounter.title.includes("遭遇组") && fromMap.encounter.owner.includes("第 1 处威胁")
    && fromMap.encounter.owner.includes("loadingThreatResolved"),
    `${fromMap.encounter.title} ｜ ${fromMap.encounter.owner.slice(0, 80)}`);
  Check("点地图上的威胁标签 → 选中那一处并写出放行条件",
    fromMap.threatRead.sel?.kind === "threat" && fromMap.threatRead.sel?.id === "transferAlley"
    && /loadingThreatResolved 之后/.test(fromMap.threatRead.owner)
    && /alleyThreatResolved/.test(fromMap.threatRead.owner),
    `${fromMap.threatRead.title} ｜ ${fromMap.threatRead.owner.slice(0, 80)}`);

  // -------------------------------------------------------------------------
  // 4c) 跟随实时不抢视野：手动缩放过就只换阶段、不重新框景
  // -------------------------------------------------------------------------
  const follow = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("orchestration");
    const doc = tool.win.document;
    const map = tool.map;
    const View = () => ({ scale: map.view.scale, cx: map.view.cx, cz: map.view.cz });
    const Same = (a, b) => a.scale === b.scale && a.cx === b.cx && a.cz === b.cz;
    tool.SetFollowLive(true);
    tool.SetPhase(12, { fit: true });
    const auto = map.viewTouched;

    // 用户自己滚一格
    const rect = map.canvas.getBoundingClientRect();
    map.canvas.dispatchEvent(new tool.win.WheelEvent("wheel", {
      clientX: rect.left + 200, clientY: rect.top + 150, deltaY: -240, bubbles: true, cancelable: true,
    }));
    const touched = map.viewTouched;
    const manualBefore = View();
    // 假装上一帧还停在第 11 阶段，让 PollRuntime 走「跟随实时换阶段」那一支。
    tool.phaseNumber = 11;
    tool.PollRuntime();
    const manualAfter = View();
    const manualPhase = tool.phaseNumber;

    // 两颗「适配」按钮把标记复位成自动
    doc.querySelector('[data-map="fit-phase"]').click();
    const afterFitPhase = map.viewTouched;
    map.canvas.dispatchEvent(new tool.win.WheelEvent("wheel", {
      clientX: rect.left + 200, clientY: rect.top + 150, deltaY: -240, bubbles: true, cancelable: true,
    }));
    const touchedAgain = map.viewTouched;
    doc.querySelector('[data-map="fit-all"]').click();
    const afterFitAll = map.viewTouched;

    // 视野是自动的：再换一次阶段就该重新框景
    const autoBefore = View();
    tool.phaseNumber = 11;
    tool.PollRuntime();
    const autoAfter = View();
    return {
      auto, touched, manualBefore, manualAfter, manualPhase,
      afterFitPhase, touchedAgain, afterFitAll,
      autoBefore, autoAfter, autoPhase: tool.phaseNumber,
      manualKept: Same(manualBefore, manualAfter), autoRefit: !Same(autoBefore, autoAfter),
    };
  });
  Check("适配之后视野是「自动」，手动滚轮之后是「手动」",
    follow.auto === false && follow.touched === true);
  Check("手动缩放过：跟随实时只换阶段，不碰 scale/offset",
    follow.manualKept && follow.manualPhase === 12,
    `scale ${follow.manualBefore.scale.toFixed(3)} → ${follow.manualAfter.scale.toFixed(3)}，阶段 ${follow.manualPhase}`);
  Check("「适配本阶段」「适配整关」把视野交回自动",
    follow.afterFitPhase === false && follow.touchedAgain === true && follow.afterFitAll === false,
    `fitPhase=${follow.afterFitPhase} wheel=${follow.touchedAgain} fitAll=${follow.afterFitAll}`);
  Check("视野是自动时，跟随实时换阶段会重新框景",
    follow.autoRefit && follow.autoPhase === 12,
    `scale ${follow.autoBefore.scale.toFixed(3)} → ${follow.autoAfter.scale.toFixed(3)}`);

  // -------------------------------------------------------------------------
  // 4d) 标注工具：就地输入框，不用 prompt
  // -------------------------------------------------------------------------
  const label = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("orchestration");
    const doc = tool.win.document;
    const canvas = tool.ui.canvas;
    const rect = canvas.getBoundingClientRect();
    const prompts = [];
    const realPrompt = tool.win.prompt;
    tool.win.prompt = (...args) => { prompts.push(args); return null; };
    const Click = (px, py) => canvas.dispatchEvent(new tool.win.MouseEvent("mousedown", {
      clientX: rect.left + px, clientY: rect.top + py, button: 0, bubbles: true, cancelable: true,
    }));
    const Input = () => doc.querySelector('[data-orch="label-input"]');
    const Key = (node, key) => node.dispatchEvent(new tool.win.KeyboardEvent("keydown", {
      key, bubbles: true, cancelable: true,
    }));
    const Last = () => tool.draft.shapes[tool.draft.shapes.length - 1] || null;

    tool.ClearDraft();
    tool.SetTool("label");
    Click(180, 120);
    const opened = Input();
    const box = opened ? { left: opened.style.left, top: opened.style.top, tag: opened.tagName } : null;
    tool.SetLabelText("这堵墙挡视线");
    Key(opened, "Enter");
    const afterEnter = { shapes: tool.draft.shapes.length, last: Last(), gone: !Input() };

    Click(220, 150);                       // 空文本：不生成 shape
    Key(Input(), "Enter");
    const afterEmpty = { shapes: tool.draft.shapes.length, gone: !Input() };

    Click(240, 170);                       // Esc 取消
    const esc = Input();
    esc.value = "不要这条";
    Key(esc, "Escape");
    const afterEsc = { shapes: tool.draft.shapes.length, gone: !Input() };

    Click(260, 190);                       // 失焦提交非空文本
    const blur = Input();
    blur.value = "失焦也算数";
    blur.dispatchEvent(new tool.win.FocusEvent("blur"));
    const afterBlur = { shapes: tool.draft.shapes.length, last: Last(), gone: !Input() };

    tool.win.prompt = realPrompt;
    tool.SetTool("select");
    tool.ClearDraft();
    tool.Select({ kind: "member", id: "TransferGunner" });
    return { opened: !!opened, box, afterEnter, afterEmpty, afterEsc, afterBlur, prompts: prompts.length };
  });
  Check("标注工具点下去就地长出输入框（定位在点击处，不弹 prompt）",
    label.opened && label.box.tag === "INPUT" && label.box.left === "180px"
    && Math.abs(parseFloat(label.box.top) - 109) <= 2 && label.prompts === 0,
    JSON.stringify(label.box));
  Check("回车落笔：文字进草图，输入框收走",
    label.afterEnter.shapes === 1 && label.afterEnter.gone
    && label.afterEnter.last?.type === "label" && label.afterEnter.last?.text === "这堵墙挡视线",
    JSON.stringify(label.afterEnter.last));
  Check("空文本不生成 shape", label.afterEmpty.shapes === 1 && label.afterEmpty.gone);
  Check("Esc 取消，不留形状也不留输入框", label.afterEsc.shapes === 1 && label.afterEsc.gone);
  Check("失焦提交非空文本",
    label.afterBlur.shapes === 2 && label.afterBlur.gone && label.afterBlur.last?.text === "失焦也算数",
    JSON.stringify(label.afterBlur.last));

  // -------------------------------------------------------------------------
  // 4e) 分类查看：抽屉、预设、分类树、「只看」
  //
  // 用户的原话是「我希望能分类的看到敌军布设的位置」。这一段守的是「面板上写的数
  // 就是图上画的数」：点「只看」之后 tool.filter 里的成员集合与分类树那一行的计数
  // 必须一致 —— 面板说 4 人、图上画 12 个的话，用户是照着一张假名册提意见。
  // -------------------------------------------------------------------------
  const filterPanel = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("orchestration");
    const doc = tool.win.document;
    tool.SetPhase(12);
    tool.ApplyPreset("all");
    const opened = tool.OpenFilterDrawer(true);
    const Rows = (kind) => [...doc.querySelectorAll(`[data-filter-row^="${kind}:"]`)];
    const groups = Rows("encounter");
    const Row = (key) => doc.querySelector(`[data-filter-row="${key}"]`);
    const Counts = (key) => {
      const node = Row(key);
      return node ? { count: Number(node.dataset.filterCount), visible: Number(node.dataset.filterVisible) } : null;
    };
    return {
      opened,
      drawer: doc.querySelectorAll('[data-orch="filter-drawer"]').length,
      presets: doc.querySelectorAll('[data-orch="filter-presets"] [data-filter-preset]').length,
      tree: doc.querySelectorAll('[data-orch="filter-tree"]').length,
      tabs: doc.querySelectorAll("[data-filter-tab]").length,
      groups: groups.length,
      // 分类树「按组」的顺序：先按出现阶段、再按名字（写表的顺序不是关卡里发生的顺序）。
      groupOrder: groups.map((node) => node.dataset.filterRow.slice("encounter:".length)),
      groupPhases: tool.filterSummary.enemies.groups.map((row) => row.phaseNumber),
      firstGroup: groups[0]?.querySelector(".fName").textContent || "",
      categories: Rows("category").map((node) => node.querySelector(".fName").textContent),
      states: Rows("state").length,
      route: {
        name: Row("route:cartRide")?.querySelector(".fName").textContent || "",
        code: Row("route:cartRide")?.querySelector(".fSub code")?.textContent || "",
        title: Row("route:cartRide")?.title || "",
        english: Rows("route").filter((node) => /^[A-Za-z]+$/.test(node.querySelector(".fName").textContent)).length,
      },
      transfer: {
        name: Row("encounter:transfer")?.querySelector(".fName").textContent || "",
        sub: Row("encounter:transfer")?.querySelector(".fSub")?.textContent || "",
        counts: Counts("encounter:transfer"),
      },
      // 界面上不许出现内部叫法（转运区那两组叫「第 n 处威胁」，不叫「拍」）
      jargon: [...doc.querySelectorAll('[data-orch="filter-tree"] .fName')]
        .map((node) => node.textContent).filter((text) => /kind=|拍|beat|dormant/i.test(text)),
    };
  });
  Check("工具条上的「分类」打得开抽屉，预设与分类树都在",
    filterPanel.opened && filterPanel.drawer === 1 && filterPanel.tree === 1
    && filterPanel.presets === 6 && filterPanel.tabs === 2,
    `抽屉 ${filterPanel.drawer} / 预设 ${filterPanel.presets} / 页签 ${filterPanel.tabs}`);
  Check("分类树列出六个类别", filterPanel.categories.length === 6
    && filterPanel.categories.includes("敌军") && filterPanel.categories.includes("触发区"),
    filterPanel.categories.join(" "));
  Check("敌军按组列出 13 组", filterPanel.groups === 13, `实际 ${filterPanel.groups}`);
  Check("按组的顺序是先按出现阶段、再按名字",
    filterPanel.groupPhases.every((phase, i) => i === 0 || filterPanel.groupPhases[i - 1] <= phase)
    && filterPanel.groupPhases[0] === 1 && filterPanel.groupOrder[0] === "bunkerAssault",
    `${filterPanel.firstGroup}（第 ${filterPanel.groupPhases[0]} 阶段）… ${filterPanel.groupPhases.join(",")}`);
  Check("路线行写中文名，编号只当小字",
    filterPanel.route.name === "老周那辆车走的路" && filterPanel.route.code === "cartRide"
    && filterPanel.route.title.includes("老周那辆车走的路") && filterPanel.route.english === 0,
    `${filterPanel.route.name} / ${filterPanel.route.code} / ${filterPanel.route.title}`);
  Check("组名是人话、后面跟着编号与本阶段状态",
    filterPanel.transfer.name === "转运区第 1 处威胁" && /transfer/.test(filterPanel.transfer.sub)
    && /活跃/.test(filterPanel.transfer.sub),
    `${filterPanel.transfer.name} ｜ ${filterPanel.transfer.sub}`);
  Check("分类树里没有内部叫法", filterPanel.jargon.length === 0, filterPanel.jargon.join(" / "));

  const solo = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const tool = T.editor.overlays.get("orchestration");
    const doc = tool.win.document;
    doc.querySelector('[data-filter-solo="encounter:transfer"]').click();
    const Sets = () => ({
      members: tool.filter.members ? [...tool.filter.members] : null,
      encounters: tool.filter.encounters ? [...tool.filter.encounters] : null,
      friendlies: tool.filter.friendlies ? tool.filter.friendlies.size : null,
      zones: tool.filter.zones ? tool.filter.zones.size : null,
    });
    const after = Sets();
    const row = doc.querySelector('[data-filter-row="encounter:transfer"]');
    const other = doc.querySelector('[data-filter-row="encounter:transferAlley"]');
    const mapFilter = tool.map.filter ? { members: tool.map.filter.members?.size ?? null } : null;
    doc.querySelector('[data-filter-solo="encounter:transfer"]').click();     // 再点一次取消
    const cleared = tool.filter.members === null;
    return {
      after, mapFilter, cleared,
      solo: row?.dataset.solo, badge: row?.querySelector(".fNum").textContent,
      otherBadge: other?.querySelector(".fNum").textContent,
      counts: { count: Number(row.dataset.filterCount), visible: Number(row.dataset.filterVisible) },
      otherCounts: { count: Number(other.dataset.filterCount), visible: Number(other.dataset.filterVisible) },
    };
  });
  Check("点「只看」某一组：集合里只剩它那 4 个人",
    solo.after.members?.length === 4 && solo.after.encounters?.length === 1
    && solo.after.encounters[0] === "transfer",
    JSON.stringify(solo.after.members));
  Check("「只看」时别的类别是空集（不是不管）",
    solo.after.friendlies === 0 && solo.after.zones === 0,
    `友军 ${solo.after.friendlies} / 触发区 ${solo.after.zones}`);
  Check("面板计数与集合一致（这一行 4/4、别的组 0）",
    solo.counts.visible === 4 && solo.counts.count === 4
    && solo.otherCounts.visible === 0 && solo.otherCounts.count === 3
    && solo.badge === "4" && solo.otherBadge === "0/3",
    `${solo.badge} / ${solo.otherBadge}`);
  Check("同一份集合递给了俯视图", solo.mapFilter?.members === 4, JSON.stringify(solo.mapFilter));
  Check("再点一次「只看」就回到全画", solo.cleared);

  const presets = await page.evaluate(() => {
    const tool = window.Taierzhuang.editor.overlays.get("orchestration");
    const doc = tool.win.document;
    const Read = () => ({
      members: tool.filter.members === null ? "全部" : tool.filter.members.size,
      friendlies: tool.filter.friendlies === null ? "全部" : tool.filter.friendlies.size,
      zones: tool.filter.zones === null ? "全部" : tool.filter.zones.size,
      routes: tool.filter.routes === null ? "全部" : tool.filter.routes.size,
    });
    doc.querySelector('[data-filter-preset="enemies"]').click();
    const enemies = Read();
    const on = doc.querySelector('[data-filter-preset="enemies"]').classList.contains("on");
    doc.querySelector('[data-filter-preset="friendlies"]').click();
    const friendlies = Read();
    doc.querySelector('[data-filter-preset="new"]').click();
    const fresh = { ...Read(), groups: tool.filter.encounters ? [...tool.filter.encounters] : null };
    // 按本阶段状态筛：只留「活跃」的人
    tool.ApplyPreset("all");
    tool.SetFilterState({ states: new Set(["active"]) });
    const active = {
      members: tool.filter.members.size,
      expected: tool.map.phaseLayout.encounters.filter((one) => one.state === "active")
        .reduce((sum, one) => sum + one.members.length, 0),
    };
    tool.ApplyPreset("all");
    return { enemies, on, friendlies, fresh, active };
  });
  Check("预设「只看敌军」：敌人全留，友军集合是空集",
    presets.enemies.members === "全部" && presets.enemies.friendlies === 0
    && presets.enemies.zones === 0 && presets.enemies.routes === 0 && presets.on,
    JSON.stringify(presets.enemies));
  Check("预设「只看友军」反过来",
    presets.friendlies.friendlies === "全部" && presets.friendlies.members === 0,
    JSON.stringify(presets.friendlies));
  Check("预设「只看本阶段新出现的」只留出现阶段 = 当前阶段的组",
    presets.fresh.groups?.length === 2 && presets.fresh.groups.every((id) => id.startsWith("transfer")),
    JSON.stringify(presets.fresh.groups));
  Check("按本阶段状态筛人，人数与 PhaseLayout 一致",
    presets.active.members === presets.active.expected && presets.active.members > 0,
    `${presets.active.members} / ${presets.active.expected}`);

  // 悬停只描亮，不改画面上有什么：早先那版是临时「只看这一类」，扫一遍列表
  // 整张图闪十几次。现在指到单个对象的描一圈、指不到的什么都不动。
  const hover = await page.evaluate(() => {
    const tool = window.Taierzhuang.editor.overlays.get("orchestration");
    const doc = tool.win.document;
    const Enter = (key) => doc.querySelector(`[data-filter-row="${key}"]`)
      .dispatchEvent(new tool.win.MouseEvent("mouseenter", { bubbles: false }));
    const Leave = (key) => doc.querySelector(`[data-filter-row="${key}"]`)
      .dispatchEvent(new tool.win.MouseEvent("mouseleave", { bubbles: false }));
    const Filter = () => (tool.map.filter?.members ? tool.map.filter.members.size : "全部");
    tool.ApplyPreset("all");
    tool.Select({ kind: "member", id: "TransferGunner" });
    const before = Filter();
    Enter("state:active");
    const onState = { filter: Filter(), hover: tool.map.hover, sel: tool.map.selection?.id };
    Leave("state:active");
    Enter("encounter:transfer");
    const onGroup = { filter: Filter(), hover: tool.map.hover?.id, sel: tool.map.selection?.id };
    Leave("encounter:transfer");
    const after = { filter: Filter(), hover: tool.map.hover, sel: tool.map.selection?.id };
    return { before, onState, onGroup, after };
  });
  Check("悬停「按状态」那种行：图上什么都不动（不再临时只画一类）",
    hover.before === "全部" && hover.onState.filter === "全部" && hover.onState.hover === null
    && hover.onState.sel === "TransferGunner",
    JSON.stringify(hover.onState));
  Check("悬停某一组：描亮那一组，画面上有什么不变",
    hover.onGroup.filter === "全部" && hover.onGroup.hover === "transfer" && hover.onGroup.sel === "transfer",
    JSON.stringify(hover.onGroup));
  Check("指针挪开，描亮还给真正选中的那个",
    hover.after.filter === "全部" && hover.after.hover === null && hover.after.sel === "TransferGunner",
    JSON.stringify(hover.after));

  const toggle = await page.evaluate(() => {
    const tool = window.Taierzhuang.editor.overlays.get("orchestration");
    const doc = tool.win.document;
    const button = doc.querySelector('[data-orch="filter-button"]');
    const drawer = doc.querySelector('[data-orch="filter-drawer"]');
    const width = drawer.style.getPropertyValue("--fw");
    button.click();
    const closed = drawer.dataset.open;
    button.click();
    const reopened = drawer.dataset.open;
    doc.querySelector('[data-orch="filter-close"]').click();
    const byClose = drawer.dataset.open;
    button.click();
    return { width, closed, reopened, byClose, open: drawer.dataset.open, on: button.classList.contains("on") };
  });
  Check("分类按钮再点一次就收起（「收起」按钮也行）",
    toggle.closed === "0" && toggle.reopened === "1" && toggle.byClose === "0"
    && toggle.open === "1" && toggle.on,
    `${toggle.closed} → ${toggle.reopened} → ${toggle.byClose} → ${toggle.open}`);
  Check("分类树默认宽 220 px", toggle.width === "220px", toggle.width);

  // -------------------------------------------------------------------------
  // 4f) 敌军布设表：行数跟着筛选、点一行选中那个人、复制 CSV
  // -------------------------------------------------------------------------
  const table = await page.evaluate(() => {
    const tool = window.Taierzhuang.editor.overlays.get("orchestration");
    const doc = tool.win.document;
    tool.SetFilterTab("table");
    const Rows = () => [...doc.querySelectorAll('[data-orch="enemy-table"] [data-table-row]')];
    const all = Rows().length;
    const head = [...doc.querySelectorAll('[data-orch="enemy-table"] th')].map((node) => node.textContent.trim());
    const groupRows = doc.querySelectorAll('[data-orch="enemy-table"] [data-table-group]').length;
    // 按组排时第一条分组线是最早出场的那组；「实时」列在没有活人时写本阶段状态。
    const firstGroup = doc.querySelector('[data-orch="enemy-table"] [data-table-group]')?.textContent || "";
    const rowPhases = Rows().map((node) => node.querySelector("td:nth-child(3)").textContent.trim());
    const deadCell = Rows().find((node) => node.dataset.tableGroupOf === "front")
      ?.querySelector(".liveCell").textContent || "";
    tool.SoloTarget("encounter", "transfer");
    const filtered = Rows().map((node) => node.dataset.tableRow);
    const gunner = doc.querySelector('[data-table-row="TransferGunner"]');
    const cells = [...gunner.querySelectorAll("td")].map((node) => node.textContent.trim());
    gunner.click();
    const picked = { sel: tool.selection, sel2: tool.map.selection, marked: gunner.classList.contains("sel") };
    const csv = tool.EnemyCsv();
    // 折叠：收起这一组之后它的人就不列了
    tool.ToggleTableGroup("transfer");
    const collapsed = Rows().length;
    tool.ToggleTableGroup("transfer");
    const reopened = Rows().length;
    // 排序：按「本阶段」排，第一行是活跃的
    tool.ApplyPreset("all");
    tool.SortEnemyTable("state");
    const sortedFirst = doc.querySelector('[data-orch="enemy-table"] [data-table-row] td:nth-child(4)')?.textContent;
    const headAfterSort = [...doc.querySelectorAll('[data-orch="enemy-table"] th')]
      .map((node) => node.textContent.trim());
    tool.SortEnemyTable("group");
    tool.SetFilterTab("tree");
    return {
      all, head, headAfterSort, groupRows, filtered, cells, picked, firstGroup, rowPhases, deadCell,
      csvHead: csv.split("\n")[0], csvLines: csv.split("\n").length,
      collapsed, reopened, sortedFirst,
    };
  });
  Check("布设表列出当前编排全部敌人（74 人、九列表头）",
    table.all === 74 && table.head.length === 9 && table.groupRows === 13,
    `${table.all} 行 / 表头 ${table.head.join(" ")}`);
  Check("按组排时第一列表头是「图标」（组名写在分组线上），换别的排法就变回「组」",
    table.head[0] === "图标 ▲" && table.headAfterSort[0] === "组",
    `${table.head[0]} → ${table.headAfterSort[0]}`);
  Check("按组排的分组线从最早出场的那组开始",
    table.firstGroup.includes("掩蔽部门外行刑的日军") && table.rowPhases[0] === "第 1 阶段",
    `${table.firstGroup.trim()} ｜ ${table.rowPhases[0]}`);
  Check("这一局里没有这个人时，「实时」列写他这一阶段的状态（不是一整列破折号）",
    table.deadCell === "已清除", `front 组的实时列写「${table.deadCell}」`);
  Check("表跟着筛选联动：只看 transfer 时只剩那 4 行",
    table.filtered.length === 4 && table.filtered.includes("TransferGunner"),
    table.filtered.join(" "));
  Check("行里写着组 / 编号 / 出现 / 本阶段 / 武器 / 特点 / 出生点 / 路线点",
    table.cells[1] === "TransferGunner" && table.cells[2] === "第 12 阶段" && table.cells[3] === "活跃"
    && table.cells[4] === "机枪" && table.cells[5].includes("钉在原地") && table.cells[6] === "113, 80",
    table.cells.join(" ｜ "));
  Check("点一行 = 选中那个人（右栏与地图一起跟过去）",
    table.picked.sel?.kind === "member" && table.picked.sel?.id === "TransferGunner"
    && table.picked.sel2?.id === "TransferGunner" && table.picked.marked,
    JSON.stringify(table.picked.sel));
  Check("按组能收起也能摊开", table.collapsed === 0 && table.reopened === 4,
    `收起后 ${table.collapsed} 行、摊开后 ${table.reopened} 行`);
  Check("点表头按那一列排（按本阶段排时活跃的在最前）", table.sortedFirst === "活跃", String(table.sortedFirst));
  Check("「复制 CSV」首行是中文表头",
    table.csvHead === "组,编号,出现,本阶段,武器,特点,出生点,路线点,实时" && table.csvLines === 5,
    `${table.csvHead}（${table.csvLines - 1} 行数据）`);

  // 抽屉收起来再往下走：底下那几段要量整张俯视图（批注截图的体积也是按它算的）。
  const closed = await page.evaluate(() => {
    const tool = window.Taierzhuang.editor.overlays.get("orchestration");
    tool.ApplyPreset("all");
    const open = tool.OpenFilterDrawer(false);
    tool.Select({ kind: "member", id: "TransferGunner" });
    return { open, filter: tool.filter.members === null };
  });
  Check("抽屉能收起来，收起后筛选回到全画", closed.open === false && closed.filter);

  // -------------------------------------------------------------------------
  // 5) 新建批注：草图 + 候选位 + 建议，无端点时退化为 localStorage + IndexedDB
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
  Check("没端点也照写图片引用 <id>.png（图在 IndexedDB 里等补传）",
    note.note?.image === `${note.saved.id}.png`, String(note.note?.image));
  Check("保存后草稿清空", note.draftCleared);

  // 图进 IndexedDB、不进 localStorage：一张 PNG dataURL 就能把 5 MB 的配额顶爆，
  // 而 localStorage 里躺着的是**批注正文**，那才是绝对不能丢的东西。
  const idb = await page.evaluate(async ({ id, key }) => {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("tengxian1938_orchestration", 1);
      request.onupgradeneeded = () => {
        const opened = request.result;
        if (!opened.objectStoreNames.contains("images")) opened.createObjectStore("images");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    if (!db) return { opened: false };
    const value = await new Promise((resolve) => {
      const tx = db.transaction("images", "readonly");
      const get = tx.objectStore("images").get(id);
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => resolve(null);
    });
    db.close();
    let raw = "";
    try { raw = localStorage.getItem(key) || ""; } catch (error) { raw = ""; }
    return {
      opened: true,
      head: typeof value === "string" ? value.slice(0, 22) : "",
      bytes: typeof value === "string" ? value.length : 0,
      localHasImageData: raw.includes("data:image/png"),
      localBytes: raw.length,
    };
  }, { id: note.saved.id, key: STORAGE_KEY });
  Check("图片进了 IndexedDB（键 = 批注 id，值是 PNG dataURL）",
    idb.opened && idb.head === "data:image/png;base64," && idb.bytes > 10000,
    `${(idb.bytes / 1024).toFixed(0)} KB`);
  Check("localStorage 里只有批注正文，没有图片数据",
    idb.localHasImageData === false, `本地草稿 ${idb.localBytes} 字节`);

  const thumb = await page.evaluate(async (id) => {
    const tool = window.Taierzhuang.editor.overlays.get("orchestration");
    await tool.LoadNotes();
    tool.SetNoteFilter("open");
    const doc = tool.win.document;
    const img = doc.querySelector(`[data-note="${id}"] [data-note-thumb]`);
    return {
      has: !!img,
      head: img ? String(img.src).slice(0, 22) : "",
      download: !!doc.querySelector(`[data-note="${id}"] [data-note-action="image"]`),
      cached: tool.localImages.size,
      notes: tool.notes.length,
    };
  }, note.saved.id);
  Check("重新加载后批注卡片带缩略图（图从 IndexedDB 取回）",
    thumb.has && thumb.head === "data:image/png;base64," && thumb.cached === 1,
    `${thumb.notes} 条批注，缓存 ${thumb.cached} 张`);
  Check("卡片上有「下载本图」把这张另存出去", thumb.download);

  // 攒在 IndexedDB 里的图，下一次**写得了盘**的保存要顺手补传上去 —— 否则草稿里
  // 的 `image: <id>.png` 永远指着一个不存在的文件。这里用一个假端点把那一次
  // POST 拦下来看：图在不在 body 里、传完删没删。
  const resent = await page.evaluate(async (id) => {
    const tool = window.Taierzhuang.editor.overlays.get("orchestration");
    const real = window.fetch;
    const posts = [];
    const Json = (data) => new Response(JSON.stringify(data), {
      status: 200, headers: { "content-type": "application/json" },
    });
    window.fetch = async (url, init) => {
      const href = String(url);
      if (href.includes("/__notes/status")) return Json({ writable: true, root: "(假端点)" });
      if (href.includes("/__notes/save")) {
        const body = JSON.parse(init.body);
        const images = Object.keys(body.images || {});
        posts.push({ notes: body.notes.length, images, bytes: init.body.length });
        return Json({ ok: true, file: "Taierzhuang1938/Notes/FirstLevel/notes.json", count: body.notes.length, images });
      }
      return real(url, init);
    };
    let result = null;
    try { result = await tool.MarkVerified(id); } finally { window.fetch = real; }
    const left = await new Promise((resolve) => {
      const request = indexedDB.open("tengxian1938_orchestration", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("images")) db.createObjectStore("images");
      };
      request.onsuccess = () => {
        const db = request.result;
        const keys = db.transaction("images", "readonly").objectStore("images").getAllKeys();
        keys.onsuccess = () => { resolve(keys.result.map(String)); db.close(); };
        keys.onerror = () => { resolve(null); db.close(); };
      };
      request.onerror = () => resolve(null);
    });
    return {
      result, posts, left, cached: tool.localImages.size, localIds: tool.localIds.size,
      status: tool.win.document.querySelector('[data-notes="status"]').textContent,
    };
  }, note.saved.id);
  Check("下次写得了盘时，IndexedDB 里攒的图随那次 POST 一起补传",
    resent.result?.mode === "endpoint" && resent.posts.length === 1
    && resent.posts[0].images.includes(`${note.saved.id}.png`) && resent.posts[0].notes === 1,
    `${resent.posts.length} 次 POST，图 ${JSON.stringify(resent.posts[0]?.images)}，body ${(resent.posts[0]?.bytes / 1024).toFixed(0)} KB`);
  Check("补传成功后从 IndexedDB 删掉，本地草稿标记也收了",
    Array.isArray(resent.left) && resent.left.length === 0 && resent.cached === 0 && resent.localIds === 0,
    `剩 ${JSON.stringify(resent.left)}｜${resent.status.slice(0, 60)}`);
  Check("交接文本含这条批注的 id 与目标",
    note.handoff.includes(note.saved.id) && note.handoff.includes("TransferGunner"),
    note.handoff.slice(0, 80));

  // -------------------------------------------------------------------------
  // 6) 时间轴：设计行不许给条件编秒数，实际行有真的时刻
  // -------------------------------------------------------------------------
  const timeline = await page.evaluate(() => {
    const doc = window.Taierzhuang.editor.overlays.get("orchestration").win.document;
    const Read = (selector) => [...doc.querySelectorAll(selector)].map((node) => ({
      at: node.dataset.markerAt ?? null, text: node.textContent, tip: node.dataset.tip || "",
    }));
    return {
      condition: Read('[data-timeline="design"] .tlMark[data-marker-kind="condition"]'),
      threat: Read('[data-timeline="design"] .tlMark[data-marker-kind="threat"]'),
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
  Check("condition 标记的悬停提示明说「没有固定秒数」",
    timeline.condition.every((mark) => mark.tip.includes("没有固定秒数")),
    timeline.condition[0]?.tip.slice(0, 80) || "（没有标记）");
  // 2026.09.19 起转运区是两处威胁、按前一处解除放行，没有秒数窗口了；带秒数的只剩 timed。
  Check("设计行的定时标了秒数，威胁不写秒数",
    timeline.threat.length === 2 && timeline.threat.every((mark) => mark.at === null && !mark.tip.includes("undefined"))
    && timeline.timed.length > 0 && timeline.timed.every((mark) => mark.at !== null),
    `threat ${timeline.threat.length} / timed ${timeline.timed.length}`);
  Check("实际行画出了实际进入的步骤与满足的事实",
    timeline.stageEntry.length > 0 && timeline.stageEntry.every((mark) => mark.at !== null)
    && timeline.actualFact.length > 0,
    `stageEntry ${timeline.stageEntry.length} / fact ${timeline.actualFact.length}`);
  Check("图例分清设计与实际", timeline.legend.includes("设计") && timeline.legend.includes("实际"));

  await popup.screenshot({ path: path.join(shotDir, "Workbench.png"), fullPage: true });

  // 出图：分类抽屉开着（只看转运区第 1 波攻击）与整张敌军布设表。
  await popup.setViewportSize({ width: 1380, height: 900 });
  await page.evaluate(() => {
    const tool = window.Taierzhuang.editor.overlays.get("orchestration");
    tool.SetPhase(12, { fit: true });
    tool.OpenFilterDrawer(true);
    tool.SetFilterTab("tree");
    tool.SoloTarget("encounter", "transfer");
    tool.Select({ kind: "encounter", id: "transfer" });
  });
  await popup.screenshot({ path: path.join(shotDir, "Workbench_filter_1380.png"), fullPage: true });

  await popup.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => {
    const tool = window.Taierzhuang.editor.overlays.get("orchestration");
    tool.ApplyPreset("all");
    tool.SetFilterTab("table");
    tool.ApplyFilterWidth(760);
    window.Taierzhuang.editor.UpdateOverlays(0.3);
  });
  await popup.screenshot({ path: path.join(shotDir, "Workbench_table_1920.png"), fullPage: true });
  await page.evaluate(() => {
    const tool = window.Taierzhuang.editor.overlays.get("orchestration");
    tool.SetFilterTab("tree");
    tool.OpenFilterDrawer(false);
  });

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

  // 收尾：本轮的草稿与图都清掉。留着的话下一轮的「退化成一条」「缓存 1 张」全对不上。
  const cleaned = await page.evaluate(async ({ key, filterKey }) => {
    try { localStorage.removeItem(key); localStorage.removeItem(filterKey); } catch (error) { /* 隐私模式 */ }
    const dropped = await Promise.race([
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase("tengxian1938_orchestration");
        request.onsuccess = () => resolve("deleted");
        request.onerror = () => resolve("error");
        request.onblocked = () => resolve("blocked");
      }),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 5000)),
    ]);
    let left = null;
    try { left = localStorage.getItem(key); } catch (error) { left = null; }
    return { dropped, left };
  }, { key: STORAGE_KEY, filterKey: FILTER_KEY });
  Check("收尾清掉 IndexedDB 与 localStorage", cleaned.dropped === "deleted" && cleaned.left === null,
    `indexedDB=${cleaned.dropped}，localStorage=${cleaned.left === null ? "空" : "还有东西"}`);

  Check("没有页面错误", errors.length === 0, errors.join(" | "));
  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 项通过，截图在 ${shotDir}`
    + "（Workbench.png / Workbench_filter_1380.png / Workbench_table_1920.png）");
  assert.equal(failed.length, 0, failed.map((entry) => `${entry.name}${entry.detail ? `（${entry.detail}）` : ""}`).join("\n"));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
