// 《地下长城 · 冀中1942》 —— 装配与主循环（表现层，AGENTS.md §五/§六）。
//
// 职责：
//   · 优先接入引擎真模块（Script_State / Script_Actions / Script_Turn / Script_Visibility，
//     接口名以 AGENTS.md 为准：CreateGame / LegalActions / PerformAction / EndTurn / DeriveView）；
//     URL 带 ?fixture=1 或引擎缺席时降级为夹具渲染模式（只渲染不可玩，页面显著标注）。
//   · 输入映射（键位仅引用 Data_Keymap）：左选右令、Alt+点击跨层、二次确认仅限降低
//     入口隐蔽的操作（engine 在 action 上标 confirm/exposeRisk 即触发）。
//   · 敌阶段播报器：引擎先算完，仅播 visible=true 事件（toast/日志/播报三处零泄漏）。
//   · 存档 localStorage: tunnelfront1942_v1；调试口 window.TunnelFront。
//
// 纪律：表现层不自己算规则——玩家可见性一律来自 DeriveView(state)；夹具模式例外
// （全可见调试渲染，含演示用可达/路径，均标注 fixture-only）。模块顶层零 DOM 副作用。

import { CreateRenderer } from "./Script_Renderer.mjs";
import { CreateUi } from "./Script_Ui.mjs";
import { theme } from "./Data_Theme.mjs";
import { keymap, KeyMatches, MouseMatches } from "./Data_Keymap.mjs";
import { HexKey, ParseHexKey, HexNeighborKeys, HexLine, HexDistanceKeys } from "./Script_Hex.mjs";

const saveStorageKey = "tunnelfront1942_v1";

/** 关卡目标兜底文案（正式来源是引擎 DeriveView / 关卡简报；此处仅缺席时垫底）。 */
const objectiveFallback = Object.freeze({
  L1: "护粮：终局存粮 ≥8，战斗单位 ≥1",
  L2: "合围：撑至 T16，存活村 ≥2，粮 ≥10，伤员 ≥3 批",
});

const terrainNames = Object.freeze({
  village: "村庄", field: "农田（青纱帐）", woods: "树林", grave: "坟地", river: "河沟", open: "开阔地",
});
const stanceNames = Object.freeze({ normal: "常态", hidden: "隐蔽", ambush: "伏击", stunned: "受制" });

// ---------------------------------------------------------------------------
// 引擎装载（缺席即夹具）
// ---------------------------------------------------------------------------

async function LoadEngine() {
  try {
    const [stateMod, actionsMod, turnMod, visMod] = await Promise.all([
      import("./Script_State.mjs"),
      import("./Script_Actions.mjs"),
      import("./Script_Turn.mjs"),
      import("./Script_Visibility.mjs"),
    ]);
    const engine = {
      CreateGame: stateMod.CreateGame,
      GetBriefing: stateMod.GetBriefing ?? null,     // 可选：开局简报（含目标文案）
      LegalActions: actionsMod.LegalActions,
      PerformAction: actionsMod.PerformAction,
      EndTurn: turnMod.EndTurn,
      DeriveView: visMod.DeriveView,
    };
    for (const name of ["CreateGame", "LegalActions", "PerformAction", "EndTurn", "DeriveView"]) {
      if (typeof engine[name] !== "function") return null;
    }
    // 呈现层报表（存粮分账 / 勋记说明 / 电报措辞 / 动作不可用原因）——与 CLI 同一份实现。
    // 可选依赖：装载失败只是少了这些说明，不拖垮整页。
    try {
      const reportMod = await import("./Script_AsciiMap.mjs");
      engine.GrainReport = reportMod.GrainReport ?? null;
      engine.MedalReport = reportMod.MedalReport ?? null;
      engine.TelegraphText = reportMod.TelegraphText ?? null;
      engine.ActionHints = reportMod.ActionHints ?? null;
      engine.ObjectiveLine = reportMod.ObjectiveLine ?? null;
    } catch {
      engine.GrainReport = null; engine.MedalReport = null;
      engine.TelegraphText = null; engine.ActionHints = null; engine.ObjectiveLine = null;
    }
    return engine;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// StartGame
// ---------------------------------------------------------------------------

export async function StartGame({ canvas, uiRoot, OnProgress = () => {} } = {}) {
  const params = new URLSearchParams(window.location.search);
  const wantFixture = params.get("fixture") === "1";
  const levelParam = params.get("level");
  const seedParam = params.get("seed");

  OnProgress(0.1, "正在装配战场……");
  const engine = wantFixture ? null : await LoadEngine();
  const mode = engine ? "engine" : "fixture";

  // ---------------- 初始状态 ----------------
  let state = null;
  if (engine) {
    if (!levelParam && !seedParam) {
      try {
        const saved = JSON.parse(localStorage.getItem(saveStorageKey) ?? "null");
        if (saved?.state?.meta) state = saved.state;
      } catch { state = null; }
    }
    if (!state) {
      // 引擎签名：CreateGame(levelId, seed)（Script_State 实际接口）；容忍对象参数/包装返回的变体
      state = engine.CreateGame(levelParam ?? "L1", Number(seedParam ?? 3));
      if (state?.state?.meta) state = state.state;
      if (!state?.meta) {
        state = engine.CreateGame({ level: levelParam ?? "L1", seed: Number(seedParam ?? 3) });
        if (state?.state?.meta) state = state.state;
      }
      if (!state?.meta) throw new Error("CreateGame 未返回合法 state");
    }
  } else {
    const fixtureMod = await import("./Data_FixtureState.mjs");
    state = fixtureMod.fixtureState;
  }
  OnProgress(0.35, mode === "engine" ? "引擎已接入" : "夹具模式：引擎缺席，仅渲染");

  // ---------------- 表现层实例 ----------------
  const renderer = CreateRenderer({ canvas });
  const session = {
    mode, engine, state,
    view: null,                 // DeriveView 输出（engine 模式）
    vm: null,
    revision: 0,
    selectedUnitId: null,
    selectedHexKey: null,
    targetMode: null,           // null | "dig"
    targetChoices: new Map(),   // hexKey -> action
    pendingConfirm: null,       // { action, hexKey, expiresAt }
    peek: false,
    busy: false,                // 敌阶段播报中
    endTurnArmed: false,
    playbackFast: false,
    playbackSkip: false,
    hintFlags: { intent: false, expose: false },
    panKeys: { up: false, down: false, left: false, right: false },
    lastToastAt: 0,
    objective: null,
    seenTelegraphs: new Set(),
  };
  if (engine?.GetBriefing) {
    try {
      const briefing = engine.GetBriefing(state);
      session.objective = briefing?.objective ?? briefing?.goal ?? briefing?.objectiveText ?? null;
    } catch { session.objective = null; }
  }

  const ui = CreateUi({
    uiRoot,
    callbacks: {
      OnEndTurnRequest: () => RequestEndTurn(false),
      OnEndTurnConfirm: () => ConfirmEndTurn(),
      OnTodoJump: (todo) => JumpTodo(todo),
      OnJumpHex: (hexKey, layer) => { renderer.FocusHex(hexKey, 300); renderer.PulseHex(hexKey, layer); },
      OnRestart: () => Restart(),
      OnClearSave: () => { ClearSave(); ui.Toast("存档已清除，刷新后生效", { kind: "warn" }); },
    },
  });
  ui.SetFixtureBadge(mode === "fixture");

  // =========================================================================
  // 视图模型归一化（渲染/UI 只吃 vm；engine 数据经 DeriveView，夹具全可见）
  // =========================================================================

  function DeriveViewSafe() {
    if (!session.engine) return null;
    try { return session.engine.DeriveView(session.state); } catch (error) {
      console.warn("DeriveView 失败，按空视图处理", error);
      return null;
    }
  }

  function BuildVm() {
    const st = session.state;
    const view = session.view;
    const hexes = view?.hexes ?? st.map?.hexes ?? {};
    const villages = view?.villages ?? st.map?.villages ?? {};
    const tunnels = view?.tunnels ?? st.tunnels ?? {};
    let units;
    let ghosts;
    let intents;
    if (session.mode === "fixture") {
      // 夹具例外：全可见调试渲染
      units = Object.values(st.units ?? {});
      ghosts = [];
      intents = (st.enemy?.columns ?? []).map((column) => {
        const lead = st.units?.[column.unitIds?.[0]];
        if (!lead) return null;
        const path = (column.route ?? []).slice(column.routeIndex ?? 0, (column.routeIndex ?? 0) + 2);
        return { pos: lead.pos, path, question: false };
      }).filter(Boolean);
    } else {
      // 引擎模式：一切可见性以 DeriveView 为准（allies + visibleEnemies；缺席则保守为空——宁少勿泄）。
      // 未识破特务由引擎直接以 type:"civilian" 示人（含名字），表现层不做二次判断。
      const allies = (view?.allies ?? []).map((unit) => ({ ...unit, side: "ally" }));
      const foes = (view?.visibleEnemies ?? []).map((unit) => ({
        ...unit, side: "enemy", layer: unit.layer ?? "surface",
        stance: unit.stance ?? "normal", acted: false, hp: unit.hp,
      }));
      units = [...allies, ...foes];
      ghosts = (view?.ghosts ?? []).map((ghost) => ({ pos: ghost.pos, type: ghost.type }));
      intents = (view?.intentArrows ?? view?.intents ?? []).map((arrow) => ({
        pos: arrow.at ?? arrow.pos ?? arrow.hexes?.[0],
        path: arrow.hexes ?? arrow.path ?? [],
        question: arrow.mark === "?" || arrow.question === true,
      })).filter((arrow) => arrow.pos);
    }
    session.revision += 1;
    session.vm = {
      revision: session.revision,
      hexes, villages, tunnels,
      units: units.filter((unit) => (unit.hp ?? 1) > 0),
      ghosts, intents,
    };
    return session.vm;
  }

  // =========================================================================
  // 信息面板内容（数字只进面板，不上格）
  // =========================================================================

  function UnitInfo(unit) {
    if (!unit) return null;
    const style = theme.units[unit.type] ?? {};
    const isAlly = unit.side === "ally";
    const lines = [
      { label: "生命", value: unit.hp ?? "——" },            // 未识破特务 hp 不明
    ];
    if (unit.mp !== undefined) lines.push({ label: "行动力", value: unit.mp });
    lines.push({ label: "位置", value: `${unit.pos}（${unit.layer === "under" ? "地下" : "地面"}）` });
    if (unit.stance) lines.push({ label: "状态", value: stanceNames[unit.stance] ?? unit.stance });
    if ((unit.breath ?? 0) > 0) lines.push({ label: "憋闷", value: unit.breath });
    if (unit.acted) lines.push({ label: "本回合", value: "已行动" });
    return {
      tag: isAlly ? "我方" : (unit.type === "civilian" ? "身份不明" : "敌军"),
      tagKind: isAlly ? "ally" : "enemy",
      title: unit.name ?? style.name ?? unit.type,
      lines,
    };
  }

  function HexInfo(hexKey, layer) {
    const vm = session.vm;
    const hex = vm.hexes[hexKey];
    if (!hex) return null;
    const lines = [];
    const notes = [];
    let title = terrainNames[hex.terrain] ?? hex.terrain;
    const village = vm.villages?.[hex.villageId];
    if (village) {
      title = `${village.name}（${title}）`;
      lines.push({ label: "人口", value: `${village.pop} / ${village.popStart} 批` });
      lines.push({ label: "明存粮", value: village.grainOpen });
      lines.push({ label: "组织度", value: village.organize });
      if (village.hasHq) notes.push("区队部所在");
      if (village.burnedHexes > 0) lines.push({ label: "被焚房屋", value: village.burnedHexes });
    }
    if (hex.road) notes.push(hex.roadBroken ? "道路（已破毁）" : "道路");
    if (hex.bridge) notes.push("桥");
    if ((hex.traces ?? 0) > 0) lines.push({ label: "挖掘痕迹", value: `${hex.traces} / 6` });
    if (hex.searched) notes.push("敌已搜过此格");
    if (hex.attackSite) notes.push("曾发生袭击");
    const entrance = vm.tunnels?.entrances?.[hexKey];
    if (entrance) {
      const threshold = Math.max(1, (entrance.conceal ?? 2) * 3);
      lines.push({ label: "入口暴露", value: `${entrance.expose} / ${threshold}${entrance.known ? "（已暴露）" : ""}` });
      if (entrance.sealed) notes.push("入口已封闭");
    }
    const vent = vm.tunnels?.vents?.[hexKey];
    if (vent) lines.push({ label: "通风口暴露", value: `${vent.expose} / 6${vent.smoked ? "（被烟熏）" : ""}` });
    const cell = vm.tunnels?.cells?.[hexKey];
    if (cell && (layer === "under" || entrance || session.peek)) {
      const facility = theme.under.facilities[cell.facility];
      if (facility) notes.push(`地下设施：${facility.name}`);
      if ((cell.grain ?? 0) > 0) lines.push({ label: "洞藏粮", value: cell.grain });
      if ((cell.civs ?? 0) > 0) lines.push({ label: "藏蔽群众", value: `${cell.civs} 批` });
      if ((cell.smoke ?? 0) > 0) lines.push({ label: "烟", value: `余 ${cell.smoke} 回合` });
    }
    for (const dig of Object.values(vm.tunnels?.digs ?? {})) {
      if (dig.at === hexKey || dig.edge?.includes(hexKey)) {
        lines.push({ label: "工地", value: `${dig.progress} / ${dig.need}` });
      }
    }
    return { tag: layer === "under" ? "地下" : "地表", tagKind: "plain", title, subtitle: `格 ${hexKey}`, lines, notes };
  }

  // =========================================================================
  // 刷新管线
  // =========================================================================

  /** 存粮分账：优先用引擎侧共享报表（与 CLI 同源），缺席时按可见状态兜底汇总。 */
  function GrainDetail() {
    const st = session.state;
    if (session.engine?.GrainReport) {
      try {
        const report = session.engine.GrainReport(st);
        return {
          grainOpen: report.open, grainHidden: report.hidden,
          grainRows: report.villages.filter((v) => v.grainOpen > 0)
            .map((v) => ({ name: v.name, hexKeys: v.hexKeys, grain: v.grainOpen })),
          cellRows: report.cells,
        };
      } catch { /* 落到兜底 */ }
    }
    const villages = Object.entries(st.map?.villages ?? {});
    const grainOpen = villages.reduce((sum, [, village]) => sum + (village.grainOpen ?? 0), 0);
    const cells = Object.entries(st.tunnels?.cells ?? {}).filter(([, cell]) => (cell.grain ?? 0) > 0);
    return {
      grainOpen,
      grainHidden: cells.reduce((sum, [, cell]) => sum + cell.grain, 0),
      grainRows: villages.filter(([, v]) => (v.grainOpen ?? 0) > 0)
        .map(([, v]) => ({ name: v.name, hexKeys: v.hexKeys ?? [], grain: v.grainOpen })),
      cellRows: cells.map(([key, cell]) => ({ key, grain: cell.grain, cap: 8 })),
    };
  }

  /** 关键地点：区队部与各村坐标（L2 即败条件绑定区队部，必须常显）。 */
  function LandmarkRows() {
    const villages = Object.values(session.state.map?.villages ?? {});
    return villages.map((village) => ({
      label: `${village.name}${village.hasHq ? "【区队部】" : ""}`,
      hexKeys: village.hexKeys ?? [],
    }));
  }

  /** 目标文案：关卡数据驱动（数值改了自动跟着改），并写明区队部格号。 */
  function ObjectiveText() {
    const st = session.state;
    if (session.engine?.ObjectiveLine) {
      try {
        const line = session.engine.ObjectiveLine(st);
        if (line) return line;
      } catch { /* 落到兜底 */ }
    }
    const base = session.objective ?? objectiveFallback[st.meta?.level] ?? "见简报";
    const hq = Object.values(st.map?.villages ?? {}).find((village) => village.hasHq);
    if (!hq) return base;
    return `${base}｜区队部：${hq.name} ${(hq.hexKeys ?? []).join(" ")}`;
  }

  function RefreshHud() {
    const st = session.state;
    const view = session.view;
    const grain = GrainDetail();
    const wave = view?.wave ?? st.wave ?? {};
    ui.SetTopBar({
      turn: view?.turn ?? st.meta?.turn,
      hardEndTurn: wave.hardEndTurn,
      phase: session.busy ? "enemy" : (view?.phase ?? st.meta?.phase),
      objective: ObjectiveText(),
      waveStatus: wave.status,
      sweepTurn: wave.sweepTurn,
      pool: wave.pool,
      smokeCharges: wave.smokeCharges,
    });
    ui.SetResources({ ammo: st.resources?.ammo ?? 0, ammoMax: 12, ...grain });
    ui.SetLandmarks(LandmarkRows());
    ui.SetLedger(st.ledger);
    if (session.mode === "fixture") ui.SetEndTurn("fixture");
    else if (session.busy) ui.SetEndTurn("busy");
    else {
      const todos = BuildTodos();
      ui.SetEndTurn(todos.length ? "hold" : "ready", { todoCount: todos.length });
    }
  }

  function RefreshSelection() {
    const vm = session.vm;
    if (session.selectedUnitId) {
      const unit = vm.units.find((candidate) => candidate.id === session.selectedUnitId);
      if (!unit) { session.selectedUnitId = null; renderer.SetSelection(null); ui.SetSelected(null); }
      else {
        renderer.SetSelection({ unitId: unit.id, hexKey: unit.pos, layer: unit.layer });
        ui.SetSelected(UnitInfo(unit));
        RefreshReachable(unit);
        return;
      }
    }
    if (session.selectedHexKey) {
      renderer.SetSelection({ hexKey: session.selectedHexKey, layer: renderer.GetLayer() });
      ui.SetSelected(HexInfo(session.selectedHexKey, renderer.GetLayer()));
    } else {
      renderer.SetSelection(null);
      ui.SetSelected(null);
    }
    renderer.SetReachable([], renderer.GetLayer());
    renderer.SetPath(null);
  }

  /** 可达/目标高亮：engine 用 LegalActions；夹具用邻格演示（fixture-only 展示）。 */
  function RefreshReachable(unit) {
    if (session.targetMode === "dig") {
      renderer.SetReachable([...session.targetChoices.keys()], unit.layer);
      return;
    }
    if (unit.side !== "ally" || unit.acted) { renderer.SetReachable([], unit.layer); return; }
    if (session.engine) {
      const moves = LegalActionsSafe(unit.id).filter((action) => action.type === "Move" && action.path?.length);
      renderer.SetReachable(moves.map((action) => action.path[action.path.length - 1]), unit.layer);
    } else {
      // fixture-only：演示可达渲染——同层邻格（地下限已挖通格），不是规则结果
      const neighbors = HexNeighborKeys(unit.pos).filter((key) => unit.layer === "under"
        ? Boolean(session.vm.tunnels?.cells?.[key])
        : Boolean(session.vm.hexes[key]) && session.vm.hexes[key].terrain !== "river");
      renderer.SetReachable(neighbors, unit.layer);
    }
  }

  function RefreshAll() {
    session.view = DeriveViewSafe();
    const vm = BuildVm();
    renderer.SetView(vm);
    RefreshHud();
    RefreshSelection();
    if (vm.intents.length && !session.hintFlags.intent) {
      session.hintFlags.intent = true;
      ui.MaybeHint("intent");
    }
    const anyExpose = Object.values(vm.tunnels?.entrances ?? {}).some((entry) => (entry.expose ?? 0) > 0);
    if (anyExpose && !session.hintFlags.expose) {
      session.hintFlags.expose = true;
      ui.MaybeHint("expose");
    }
    // 电报预告（DeriveView.telegraphs）：每条只 toast 一次；入境预告加注「未必看得见」，
    // 免得次回合敌军阶段一条相关事件都没有时，玩家以为电报是假的。
    for (const telegraph of session.view?.telegraphs ?? []) {
      if (!telegraph?.text || session.seenTelegraphs.has(telegraph.text)) continue;
      session.seenTelegraphs.add(telegraph.text);
      const text = session.engine?.TelegraphText ? session.engine.TelegraphText(telegraph) : telegraph.text;
      ui.Toast(text, { kind: "telegraph", ms: 4200 });
      ui.AppendLog({ turn: session.state.meta?.turn, kind: "telegraph", text, hex: telegraph.hex ?? undefined, visible: true });
    }
  }

  // =========================================================================
  // 引擎交互
  // =========================================================================

  function LegalActionsSafe(unitId) {
    if (!session.engine) return [];
    try { return session.engine.LegalActions(session.state, unitId) ?? []; } catch { return []; }
  }

  /** 「为什么这条不能做」的真实原因（与 CLI 同一份实现），至多取两条免得刷屏。 */
  function ActionHintsSafe(unitId) {
    if (!unitId || !session.engine?.ActionHints) return [];
    try { return (session.engine.ActionHints(session.state, unitId, LegalActionsSafe(unitId)) ?? []).slice(0, 2); }
    catch { return []; }
  }

  function Perform(action) {
    if (!session.engine || session.busy) return false;
    let outcome;
    try { outcome = session.engine.PerformAction(session.state, action); } catch (error) {
      console.warn("PerformAction 异常", error);
      return false;
    }
    if (!outcome || outcome.illegal) {
      // 说真实原因，不说笼统话：先摆引擎给的理由，再补一条按当前状态推断的成因。
      const reason = outcome?.illegal || "此令不可执行";
      ui.Toast(reason, { kind: "warn", ms: 2600 });
      ui.AppendLog({ turn: session.state.meta?.turn, kind: "warn", text: `不可执行：${reason}`, visible: true });
      for (const hint of ActionHintsSafe(action.unit)) {
        ui.Toast(hint, { kind: "warn", ms: 4200 });
        ui.AppendLog({ turn: session.state.meta?.turn, kind: "warn", text: hint, visible: true });
      }
      return false;
    }
    session.state = outcome.state ?? session.state;
    for (const event of (outcome.events ?? []).filter((entry) => entry.visible !== false)) {
      ui.AppendLog(event);
      if (event.text) ui.Toast(event.text, { kind: event.kind === "loss" ? "danger" : "info", ms: 2400 });
    }
    SaveGame();
    RefreshAll();
    return true;
  }

  function SaveGame() {
    if (session.mode !== "engine") return;
    try { localStorage.setItem(saveStorageKey, JSON.stringify({ savedAt: Date.now(), state: session.state })); }
    catch { /* 存储不可用 */ }
  }

  function ClearSave() {
    try { localStorage.removeItem(saveStorageKey); } catch { /* 忽略 */ }
  }

  function Restart() {
    ClearSave();
    window.location.reload();
  }

  // ---------------- 待办护栏（正源 DeriveView.guardrails；缺席用展示级兜底） ----------------
  function BuildTodos() {
    const rails = session.view?.guardrails ?? session.view?.todos;
    if (rails) {
      return rails.map((todo) => {
        const unitId = todo.unitId ?? todo.unit;
        const unit = unitId ? session.vm?.units.find((candidate) => candidate.id === unitId) : null;
        const site = todo.siteId ? session.state.tunnels?.digs?.[todo.siteId] : null;
        return {
          text: todo.text ?? String(todo),
          hex: todo.hex ?? unit?.pos ?? site?.at,
          layer: todo.layer ?? unit?.layer ?? (site ? "under" : "surface"),
          unitId,
        };
      });
    }
    const todos = [];
    for (const unit of session.vm?.units ?? []) {
      if (unit.side !== "ally") continue;
      if (!unit.acted && (unit.mp ?? 0) > 0) {
        todos.push({ text: `${theme.units[unit.type]?.name ?? unit.type} 尚未行动（${unit.pos}）`, hex: unit.pos, layer: unit.layer, unitId: unit.id });
      }
      if ((unit.breath ?? 0) >= 2) {
        todos.push({ text: `${theme.units[unit.type]?.name ?? unit.type} 憋闷 ${unit.breath}，将被迫出洞`, hex: unit.pos, layer: unit.layer, unitId: unit.id });
      }
    }
    for (const [key, entrance] of Object.entries(session.vm?.tunnels?.entrances ?? {})) {
      const threshold = Math.max(1, (entrance.conceal ?? 2) * 3);
      if (!entrance.known && !entrance.sealed && entrance.expose >= threshold - 2) {
        todos.push({ text: `入口 ${key} 暴露 ${entrance.expose}/${threshold}，将被搜出`, hex: key, layer: "surface" });
      }
    }
    return todos;
  }

  function JumpTodo(todo) {
    if (todo.unitId) SelectUnit(todo.unitId);
    if (todo.hex) { renderer.FocusHex(todo.hex, 300); renderer.PulseHex(todo.hex, todo.layer ?? "surface"); }
  }

  // ---------------- 结束回合两段式 + 敌阶段播报 ----------------
  function RequestEndTurn(force) {
    if (session.busy) return;
    if (session.mode === "fixture") { FixtureToast(); return; }
    if (session.state.meta?.phase === "over") return;
    const todos = BuildTodos();
    if (!force && todos.length && !session.endTurnArmed) {
      session.endTurnArmed = true;
      ui.ShowTodos(todos);
      return;
    }
    ConfirmEndTurn();
  }

  function ConfirmEndTurn() {
    if (session.busy || session.mode !== "engine") return;
    session.endTurnArmed = false;
    ui.HideTodos();
    RunEnemyPhase();
  }

  async function RunEnemyPhase() {
    session.busy = true;
    session.playbackFast = false;
    session.playbackSkip = false;
    CancelTargetMode();
    session.pendingConfirm = null;
    ui.SetEndTurn("busy");
    let outcome;
    try { outcome = session.engine.EndTurn(session.state); } catch (error) {
      console.warn("EndTurn 异常", error);
      session.busy = false;
      RefreshHud();
      return;
    }
    session.state = outcome?.state ?? session.state;
    SaveGame();
    const events = (outcome?.events ?? []).filter((event) => event.visible !== false);   // 零泄漏
    for (const event of events) {
      ui.AppendLog(event);
      if (session.playbackSkip) {
        if (event.kind === "loss") ui.Toast(event.text ?? "有伤亡", { kind: "danger", ms: 2600 });
        continue;
      }
      if (event.hex) {
        renderer.FocusHex(event.hex, 300);
        renderer.PulseHex(event.hex, event.layer ?? "surface");
      }
      if (event.text) {
        ui.Toast(event.text, { kind: event.kind === "loss" ? "danger" : (event.kind === "telegraph" ? "telegraph" : "info"), ms: 1600 });
      }
      if (event.kind === "withdraw") ui.Banner(event.text ?? "敌军开始收队");
      await Sleep(session.playbackFast ? 250 : 900);       // §六.5：900ms/条，Space 快进 250ms
    }
    session.busy = false;
    ui.MaybeHint("objective");
    RefreshAll();
    if (session.state.result) ShowResult();
  }

  function Sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  /** 终局：三枚勋记逐条列出名称、条件与「为什么中/为什么没中」（以前只有一串 ●○）。 */
  function ShowResult() {
    const result = session.state.result;
    const medals = result.medals ?? session.state.medals ?? [];
    let medalItems = null;
    if (session.engine?.MedalReport) {
      try {
        medalItems = session.engine.MedalReport(session.state)
          .map((row) => ({ earned: row.earned, name: row.name, text: row.text, note: row.note }));
      } catch { medalItems = null; }
    }
    if (!medalItems) {
      const medalNames = session.view?.medalNames ?? result.medalNames ?? [];
      medalItems = medals.map((earned, index) => ({
        earned: Boolean(earned),
        name: medalNames[index] ?? `勋记 ${index + 1}`,
        text: "",
        note: result.medalNotes?.[index] ?? "",
      }));
    }
    ui.ShowResult({ grade: result.grade, reasons: result.reasons, medalItems }, session.state.ledger);
  }

  function FixtureToast() {
    const now = performance.now();
    if (now - session.lastToastAt < 1500) return;
    session.lastToastAt = now;
    ui.Toast("夹具模式：只读渲染，不可下令", { kind: "warn", ms: 1800 });
  }

  // =========================================================================
  // 选取与下令
  // =========================================================================

  function SelectUnit(unitId) {
    const unit = session.vm.units.find((candidate) => candidate.id === unitId);
    if (!unit) return;
    session.selectedUnitId = unitId;
    session.selectedHexKey = null;
    CancelTargetMode();
    if (renderer.GetLayer() !== unit.layer) renderer.SetLayer(unit.layer);   // 选中即随层（§六.1）
    RefreshSelection();
    if (unit.side === "ally") ui.MaybeHint("move");
  }

  function SelectHex(hexKey) {
    session.selectedUnitId = null;
    session.selectedHexKey = hexKey;
    CancelTargetMode();
    RefreshSelection();
  }

  function Deselect() {
    session.selectedUnitId = null;
    session.selectedHexKey = null;
    CancelTargetMode();
    RefreshSelection();
  }

  function CancelTargetMode() {
    session.targetMode = null;
    session.targetChoices.clear();
  }

  function NextUnit() {
    const allies = session.vm.units.filter((unit) => unit.side === "ally" && !unit.acted && (unit.hp ?? 0) > 0);
    if (!allies.length) { ui.Toast("所有单位均已行动", { kind: "info", ms: 1500 }); return; }
    const currentIndex = allies.findIndex((unit) => unit.id === session.selectedUnitId);
    const next = allies[(currentIndex + 1) % allies.length];
    SelectUnit(next.id);
    renderer.FocusHex(next.pos, 250);
  }

  /** 右键下令（engine）：Move / UseEntrance；降低入口隐蔽的操作需二次确认（全游戏唯一）。 */
  function IssueOrder(pick) {
    const unit = session.vm.units.find((candidate) => candidate.id === session.selectedUnitId);
    if (!unit || unit.side !== "ally") return;
    if (session.peek) { ui.Toast("窥视中：松开 Space 后再下令", { kind: "warn", ms: 1600 }); return; }
    if (session.mode === "fixture") { FixtureToast(); return; }
    if (session.targetMode === "dig") {
      const digAction = session.targetChoices.get(pick.hexKey);
      if (digAction) { CancelTargetMode(); Perform(digAction); }
      else ui.Toast("不是可挖目标", { kind: "warn", ms: 1500 });
      return;
    }
    const actions = LegalActionsSafe(unit.id);
    let action = null;
    if (pick.hexKey === unit.pos) {
      action = actions.find((candidate) => candidate.type === "UseEntrance");
    } else {
      action = actions.find((candidate) => candidate.type === "Move"
        && candidate.path?.[candidate.path.length - 1] === pick.hexKey);
      if (!action && pick.kind === "unit") {
        action = actions.find((candidate) => candidate.type === "Attack" && candidate.target === pick.unitId);
      }
    }
    if (!action) { ui.Toast("此处无可执行的命令", { kind: "warn", ms: 1500 }); return; }
    // 二次确认：仅限引擎标记「降低入口隐蔽」的操作（confirm / exposeRisk）
    const needsConfirm = action.confirm === true || action.exposeRisk === true;
    if (needsConfirm) {
      const pending = session.pendingConfirm;
      const same = pending && JSON.stringify(pending.action) === JSON.stringify(action);
      if (!same || performance.now() > pending.expiresAt) {
        session.pendingConfirm = { action, expiresAt: performance.now() + 4000 };
        ui.Toast("该操作会降低入口隐蔽：再次右键确认", { kind: "warn", ms: 2600 });
        return;
      }
      session.pendingConfirm = null;
    }
    Perform(action);
  }

  function EnterDigMode() {
    const unit = session.vm.units.find((candidate) => candidate.id === session.selectedUnitId);
    if (!unit || unit.side !== "ally") return;
    if (session.mode === "fixture") { FixtureToast(); return; }
    const digActions = LegalActionsSafe(unit.id)
      .filter((action) => ["Dig", "DigEntrance", "DigFacility", "DigDoor"].includes(action.type));
    if (!digActions.length) { ui.Toast("此处无可挖掘目标", { kind: "warn", ms: 1600 }); return; }
    session.targetMode = "dig";
    session.targetChoices.clear();
    for (const action of digActions) {
      const key = action.target ?? action.at ?? action.cell ?? unit.pos;
      if (!session.targetChoices.has(key)) session.targetChoices.set(key, action);
    }
    ui.MaybeHint("tunnelCost");
    ui.Toast("选择挖掘目标（右键下达，Esc 取消）", { kind: "info", ms: 2200 });
    RefreshSelection();
  }

  function DoStanceAction(type) {
    const unit = session.vm.units.find((candidate) => candidate.id === session.selectedUnitId);
    if (!unit || unit.side !== "ally") return;
    if (session.mode === "fixture") { FixtureToast(); return; }
    const action = LegalActionsSafe(unit.id).find((candidate) => candidate.type === type);
    if (!action) { ui.Toast("当前不可执行该动作", { kind: "warn", ms: 1500 }); return; }
    Perform(action);
  }

  // ---------------- 悬停与路径预览 ----------------
  let hoverRaf = 0;
  function HandleHover(event) {
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const pick = renderer.PickAt(event.clientX, event.clientY, {});
      if (!pick) { renderer.SetHover(null); ui.SetHover(null); renderer.SetPath(null); return; }
      renderer.SetHover(pick.hexKey, pick.layer);
      ui.SetHover(pick.kind === "unit"
        ? UnitInfo(session.vm.units.find((unit) => unit.id === pick.unitId))
        : HexInfo(pick.hexKey, pick.layer));
      PreviewPath(pick);
    });
  }

  function PreviewPath(pick) {
    const unit = session.vm.units.find((candidate) => candidate.id === session.selectedUnitId);
    if (!unit || unit.side !== "ally" || unit.acted || session.targetMode || pick.hexKey === unit.pos) {
      renderer.SetPath(null);
      return;
    }
    if (session.engine) {
      const action = LegalActionsSafe(unit.id).find((candidate) => candidate.type === "Move"
        && candidate.path?.[candidate.path.length - 1] === pick.hexKey);
      if (action) {
        renderer.SetPath({
          path: [unit.pos, ...action.path],
          layer: unit.layer,
          riskFrom: action.riskFrom ?? ((action.confirm || action.exposeRisk) ? 0 : [unit.pos, ...action.path].length),
        });
        return;
      }
      renderer.SetPath(null);
    } else if (HexDistanceKeys(unit.pos, pick.hexKey) <= 2 && pick.layer === unit.layer) {
      // fixture-only：直线演示路径（非规则寻路）
      const line = HexLine(ParseHexKey(unit.pos), ParseHexKey(pick.hexKey)).map((axial) => HexKey(axial.q, axial.r));
      renderer.SetPath({ path: line, layer: unit.layer, riskFrom: line.length - 2 });
    } else {
      renderer.SetPath(null);
    }
  }

  // =========================================================================
  // 输入
  // =========================================================================

  const pointerState = { downX: 0, downY: 0, downButton: -1, dragging: false, midPan: false };

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  canvas.addEventListener("pointerdown", (event) => {
    pointerState.downX = event.clientX;
    pointerState.downY = event.clientY;
    pointerState.downButton = event.button;
    pointerState.dragging = false;
    if (MouseMatches(keymap.panMouse, event)) {
      pointerState.midPan = true;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (pointerState.midPan) {
      renderer.PanByPixels(event.movementX, event.movementY);
      return;
    }
    if (Math.hypot(event.clientX - pointerState.downX, event.clientY - pointerState.downY) > 6) {
      pointerState.dragging = true;
    }
    HandleHover(event);
  });

  canvas.addEventListener("pointerup", (event) => {
    if (pointerState.midPan && event.button === keymap.panMouse.button) {
      pointerState.midPan = false;
      canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (pointerState.dragging) return;
    const crossLayer = MouseMatches(keymap.crossLayerPick, event);
    const pickLayer = crossLayer ? (renderer.GetLayer() === "surface" ? "under" : "surface") : undefined;
    const pick = renderer.PickAt(event.clientX, event.clientY, { layer: pickLayer });
    if (!pick) return;
    if (event.button === keymap.select.button) {           // 左键：选中（单位＞地格，当前层优先）
      if (pick.kind === "unit") SelectUnit(pick.unitId);
      else SelectHex(pick.hexKey);
    } else if (event.button === keymap.order.button) {     // 右键：下令
      IssueOrder(pick);
    }
  });

  canvas.addEventListener("pointerleave", () => { renderer.SetHover(null); ui.SetHover(null); renderer.SetPath(null); });

  let wheelCooldown = 0;
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const now = performance.now();
    if (now < wheelCooldown) return;
    wheelCooldown = now + 140;
    renderer.ZoomStep(event.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (KeyMatches(keymap.peek, event)) {
      event.preventDefault();
      if (session.busy) { session.playbackFast = true; return; }           // Space=播报快进
      if (!event.repeat && !session.peek) { session.peek = true; renderer.SetPeek(true); }
      return;
    }
    if (event.repeat) return;
    if (KeyMatches(keymap.endTurnForce, event)) { event.preventDefault(); RequestEndTurn(true); return; }
    if (KeyMatches(keymap.endTurn, event)) {
      event.preventDefault();
      if (ui.TodosVisible()) ConfirmEndTurn(); else RequestEndTurn(false);
      return;
    }
    if (KeyMatches(keymap.cancel, event)) { HandleEscape(); return; }
    if (KeyMatches(keymap.layerToggle, event)) {
      renderer.SetLayer(renderer.GetLayer() === "surface" ? "under" : "surface");
      ui.MaybeHint("tunnelCost");
      RefreshSelection();
      return;
    }
    if (KeyMatches(keymap.nextUnit, event)) { event.preventDefault(); NextUnit(); return; }
    if (KeyMatches(keymap.logDrawer, event)) { ui.ToggleLog(); return; }
    if (KeyMatches(keymap.dig, event)) { EnterDigMode(); return; }
    if (KeyMatches(keymap.ambush, event)) { DoStanceAction("Ambush"); return; }
    if (KeyMatches(keymap.feint, event)) { DoStanceAction("Feint"); return; }
    if (KeyMatches(keymap.hide, event)) { DoStanceAction("Hide"); return; }
    if (KeyMatches(keymap.panUp, event)) session.panKeys.up = true;
    if (KeyMatches(keymap.panDown, event)) session.panKeys.down = true;
    if (KeyMatches(keymap.panLeft, event)) session.panKeys.left = true;
    if (KeyMatches(keymap.panRight, event)) session.panKeys.right = true;
  });

  window.addEventListener("keyup", (event) => {
    if (KeyMatches(keymap.peek, event)) {
      session.playbackFast = false;
      if (session.peek) { session.peek = false; renderer.SetPeek(false); }
    }
    if (KeyMatches(keymap.panUp, event)) session.panKeys.up = false;
    if (KeyMatches(keymap.panDown, event)) session.panKeys.down = false;
    if (KeyMatches(keymap.panLeft, event)) session.panKeys.left = false;
    if (KeyMatches(keymap.panRight, event)) session.panKeys.right = false;
  });

  /** Esc 栈（§六.4）：弹层 → 目标模式 → 取消选中 → 菜单，3 次必达空闲。 */
  function HandleEscape() {
    if (session.busy) { session.playbackSkip = true; return; }             // 播报跳过
    if (ui.ResultVisible()) { ui.HideResult(); return; }
    if (ui.TodosVisible()) { ui.HideTodos(); session.endTurnArmed = false; return; }
    if (ui.MenuVisible()) { ui.HideMenu(); return; }
    if (session.pendingConfirm) { session.pendingConfirm = null; ui.Toast("已取消", { kind: "info", ms: 1200 }); return; }
    if (session.targetMode) { CancelTargetMode(); RefreshSelection(); return; }
    if (session.selectedUnitId || session.selectedHexKey) { Deselect(); return; }
    ui.ShowMenu();
  }

  window.addEventListener("resize", () => renderer.Resize());

  // =========================================================================
  // 启动
  // =========================================================================

  OnProgress(0.6, "正在铺设双层战场……");
  session.view = DeriveViewSafe();
  const vm = BuildVm();
  renderer.SetMap(vm);
  renderer.SetView(vm);
  RefreshHud();

  // 首格聚焦：区队部或首个我方单位
  const firstAlly = vm.units.find((unit) => unit.side === "ally");
  if (firstAlly) renderer.FocusHex(firstAlly.pos, 1);

  // 主循环
  let lastTime = performance.now();
  function Loop(now) {
    const dt = Math.min(50, now - lastTime);
    lastTime = now;
    const pan = session.panKeys;
    if (pan.up || pan.down || pan.left || pan.right) {
      const speed = 0.011 * dt;
      renderer.PanBy((pan.right ? speed : 0) - (pan.left ? speed : 0), (pan.down ? speed : 0) - (pan.up ? speed : 0));
    }
    renderer.Frame(dt);
    requestAnimationFrame(Loop);
  }
  requestAnimationFrame(Loop);

  ui.MaybeHint("layers");
  if (session.mode === "fixture") {
    ui.Toast("夹具模式：引擎未接入，仅渲染开发夹具", { kind: "warn", ms: 4200 });
  }
  ui.AppendLog({ turn: session.state.meta?.turn, kind: "info", text: mode === "engine" ? "战场装配完毕" : "夹具战场装配完毕", visible: true });
  for (const entry of (session.state.log ?? []).filter((item) => item.visible !== false)) ui.AppendLog(entry);

  OnProgress(1, "就绪");

  // ---------------- 调试接口 ----------------
  window.TunnelFront = {
    version: 1,
    mode: session.mode,
    GetState: () => session.state,
    GetView: () => session.view,
    GetVm: () => session.vm,
    renderer, ui,
    Select: (unitId) => SelectUnit(unitId),
    SelectHex: (hexKey) => SelectHex(hexKey),
    SetLayer: (layer) => { renderer.SetLayer(layer); RefreshSelection(); },
    GetLayer: () => renderer.GetLayer(),
    Peek: (on) => { session.peek = Boolean(on); renderer.SetPeek(on); },
    EndTurn: () => RequestEndTurn(true),
    Perform: (action) => Perform(action),
    FocusHex: (hexKey) => renderer.FocusHex(hexKey, 300),
    Refresh: () => RefreshAll(),
    ClearSave, ClearHints: () => ui.ClearHints(),
    Stats: () => renderer.Stats(),
  };

  return window.TunnelFront;
}
