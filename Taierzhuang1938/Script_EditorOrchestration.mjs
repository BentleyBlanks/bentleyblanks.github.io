// ===========================================================================
// Script_EditorOrchestration.mjs —— 关卡编排工作台（叠加层，独立窗口）
//
// 口径：docs/Data_MissionOrchestration.md。这是「看编排 → 现场标注 → 交给 agent」
// 那条闭环的用户这一头。四块：
//   左 流程    18 个公开阶段 → 27 个内部步骤；每步的目标、要求事实（人话 + 实时勾）、
//              对白、最短时长、本步生成的遭遇组、指引路线。
//   中 俯视图  P3b 的 OrchestrationMap（canvas 2D，零 three）＋ 图层 / 工具 / 阶段条。
//   右 详情    选中对象的反查（属于哪组、哪步生成、何时激活、被谁引用）＋ 批注。
//   底 时间轴  设计行与实际行分开画：**设计里由玩家行为触发的事情不许标秒数**。
//
// 三条纪律：
//   1. 只显示**游戏实际使用的数据**。模型来自 BuildOrchestrationModel()，每一条都能
//      指回源表；这里不另写一套展示用的流程图。
//   2. 独立窗口、不接管相机、不暂停玩法（keepOnClose）—— 边打边看正是主用例。
//   3. DOM 常驻、只写属性：面板 4 Hz 刷新，地图只在 live 真的变了或选中变了时重画。
//
// 没有运行时（不在第一关、还没点「进城」）也要能看全部设计编排 —— 用户的原话是
// 「不用先通关」。那时每个阶段给一颗「从这里试玩」按钮（Debug.FirstLevelJump）。
// ===========================================================================

import { BuildOrchestrationModel, ApplyRuntimeState, DescribeFact, FindOwner } from "./Script_MissionOrchestration.mjs";
import { OrchestrationMap } from "./Script_EditorOrchestrationMap.mjs";
import {
  NewNoteId, ValidateNote, SnapshotTarget, NoteDrift, HandoffMarkdown,
  PROPOSAL_KINDS, NotesPathFor,
} from "./Script_MissionNotes.mjs";

const LEVEL = "FirstLevel";
const REFRESH_SECONDS = 0.25;
const STORAGE_KEY = `tengxian1938_orchestration_notes_${LEVEL}`;
const NOTES_URL = `./Notes/${LEVEL}/notes.json`;
const STATUS_URL = "/__notes/status";
const SAVE_URL = "/__notes/save";

// 13 层，与 OrchestrationMap.SetLayers 的键一一对应。
const LAYERS = [
  ["terrain", "地表"], ["blocks", "体块"], ["trenches", "壕沟"], ["roads", "道路"],
  ["anchors", "锚点"], ["routes", "路线"], ["zones", "触发区"], ["friendlies", "友军"],
  ["encounters", "敌军"], ["tactics", "战术线"], ["live", "实机"], ["notes", "批注"],
  ["labels", "名字"],
];
const TOOLS = [
  ["select", "选择"], ["pan", "平移"], ["circle", "圈选"], ["arrow", "箭头"],
  ["path", "折线"], ["label", "标注"], ["move", "候选位"],
];
const PROPOSAL_TEXT = {
  move: "挪位置", delay: "改延迟", retime: "改时间窗", reroute: "改路线", remove: "删掉", other: "其它",
};
const KIND_TEXT = {
  phase: "阶段", step: "步骤", fact: "事实", encounter: "遭遇组", member: "敌人", beat: "节拍",
  route: "路线", zone: "触发区", anchor: "锚点", friendly: "友军", point: "地图点", time: "时间点",
  note: "批注",
};
const STATE_TEXT = {
  pending: "未出现", spawned: "已生成", standby: "待命", dormant: "休眠", active: "活跃", cleared: "已清除",
};
const SPAWN_TEXT = {
  step: "进入步骤时生成", fact: "事实满足时生成", beat: "按转运拍生成", opening: "由开场脚本生成",
};
const TIMELINE_GLYPH = {
  entry: "▸", condition: "◇", timed: "◆", beat: "■", delay: "·", wake: "✶",
  stageEntry: "▸", fact: "●",
};
const TIMELINE_TEXT = {
  entry: "进入", condition: "条件", timed: "定时", beat: "拍", delay: "延迟", wake: "苏醒",
  stageEntry: "实际进入", fact: "实际满足",
};

const POPUP_CSS = `
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; display: flex; flex-direction: column; overflow: hidden;
    background: var(--ui-surface, #191b1d); color: var(--ui-text, #dedbd3);
    font: 12px/1.55 var(--ui-font, sans-serif); }
  header { flex: 0 0 auto; padding: 8px 12px 7px; background: var(--ui-black, #101112);
    border-bottom: 1px solid var(--ui-line, #393b3c); display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 15px; color: var(--ui-bright, #fff); }
  .muted { color: var(--ui-muted, #a9a8a3); }
  .warn { color: #e6a95c; }
  .ok { color: #8fca7a; }
  button, select, input, textarea { font: inherit; color: var(--ui-text, #dedbd3);
    background: var(--ui-surface, #191b1d); border: 1px solid var(--ui-line, #393b3c); }
  button { padding: 2px 8px; cursor: pointer; }
  button:hover { border-color: var(--ui-gold, #ceb17a); }
  button.on { color: var(--ui-black, #101112); background: var(--ui-gold, #ceb17a); border-color: var(--ui-gold, #ceb17a); }
  input, select, textarea { padding: 2px 5px; width: 100%; }
  label.chk { display: inline-flex; align-items: center; gap: 3px; cursor: pointer; margin-right: 6px; }
  label.chk > input { width: auto; }
  #cols { flex: 1 1 auto; display: grid; grid-template-columns: 322px minmax(0, 1fr) 348px; min-height: 0; }
  .col { min-height: 0; overflow: auto; padding: 8px 10px; border-right: 1px solid var(--ui-line, #393b3c); }
  .col.map { overflow: hidden; display: flex; flex-direction: column; padding: 6px; gap: 5px; }
  .col.detail { border-right: 0; }
  h2 { margin: 0 0 6px; font-size: 11px; letter-spacing: .1em; color: var(--ui-gold, #ceb17a); }
  .phase { border: 1px solid var(--ui-line, #393b3c); margin-bottom: 6px; }
  .phaseHead { display: flex; align-items: center; gap: 6px; padding: 3px 6px;
    background: rgba(255,255,255,.03); cursor: pointer; }
  .phaseHead > b { font-weight: 600; color: var(--ui-bright, #fff); }
  .phase.now > .phaseHead { background: rgba(206,177,122,.18); }
  .step { padding: 4px 6px 6px; border-top: 1px dashed var(--ui-line, #393b3c); cursor: pointer; }
  .step.now { background: rgba(206,177,122,.12); }
  .step.sel { outline: 1px solid var(--ui-gold, #ceb17a); outline-offset: -1px; }
  .stepId { color: var(--ui-bright, #fff); }
  .fact { display: grid; grid-template-columns: 16px 1fr; gap: 3px; padding: 1px 0 1px 4px; cursor: pointer; }
  .fact > i { font-style: normal; text-align: center; }
  .fact[data-fact-state="ok"] > i { color: #8fca7a; }
  .fact[data-fact-state="wait"] > i { color: var(--ui-gold, #ceb17a); }
  .fact[data-fact-state="future"] > i, .fact[data-fact-state="none"] > i { color: var(--ui-muted, #a9a8a3); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
  .chip { border: 1px solid var(--ui-line, #393b3c); padding: 0 5px; cursor: pointer; }
  .chip:hover { border-color: var(--ui-gold, #ceb17a); }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  #canvasWrap { flex: 1 1 auto; min-height: 0; position: relative; }
  canvas { display: block; width: 100%; height: 100%; background: #181a19; }
  /* 标注工具的就地输入框：长在点下去的那个位置上，不弹 prompt（prompt 会把
     整个页面卡住，还没法在无头测试里输字）。 */
  .labelInput { position: absolute; width: 176px; z-index: 6;
    background: var(--ui-black, #101112); border-color: var(--ui-gold, #ceb17a); }
  img.thumb { display: block; max-width: 100%; max-height: 118px; margin-top: 4px;
    border: 1px solid var(--ui-line, #393b3c); }
  .note { border: 1px solid var(--ui-line, #393b3c); padding: 4px 6px; margin-bottom: 5px; }
  .note.drift { border-color: #b8743c; }
  .note > .h { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
  .note code { font-family: Consolas, monospace; color: var(--ui-muted, #a9a8a3); }
  pre { margin: 4px 0 0; max-height: 220px; overflow: auto; font: 11px/1.4 Consolas, monospace;
    background: rgba(0,0,0,.25); padding: 5px; white-space: pre-wrap; word-break: break-all; }
  .row { display: grid; grid-template-columns: 74px 1fr; gap: 3px 8px; padding: 1px 0; }
  .row > span { color: var(--ui-muted, #a9a8a3); }
  #tl { flex: 0 0 auto; height: 188px; overflow: auto; padding: 5px 8px;
    border-top: 1px solid var(--ui-line, #393b3c); background: var(--ui-black, #101112); }
  .tlRow { display: flex; min-width: 1120px; align-items: flex-start; }
  .tlRow + .tlRow { margin-top: 4px; }
  .tlLabel { flex: 0 0 62px; color: var(--ui-muted, #a9a8a3); }
  .tlLane { border-left: 1px solid var(--ui-line, #393b3c); padding: 0 3px 3px; min-width: 52px; }
  /* 第 12 阶段光「战术延迟」就有二十多枚标记：不封顶的话它会把下面的实际行顶出视野，
     而「设计 vs 实际」两行并排看正是这条时间轴存在的理由。 */
  .tlLane > [data-marks] { max-height: 54px; overflow-y: auto; line-height: 1.15; }
  .tlLane > .h { color: var(--ui-muted, #a9a8a3); font-size: 10px; white-space: nowrap; overflow: hidden; }
  .tlLane.now { background: rgba(206,177,122,.12); }
  .tlMark { display: inline-block; padding: 0 1px; cursor: pointer; }
  [data-timeline="design"] .tlMark { color: #7fc7d8; }
  [data-timeline="design"] .tlMark[data-marker-kind="condition"] { color: #d8b06a; }
  [data-timeline="actual"] .tlMark { color: #78d78f; }
  .tlMark:hover { background: rgba(255,255,255,.14); }
  .legend { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
  .legend > span > i { font-style: normal; }
`;

const Round = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : "—");

/** 阶段泳道宽度按**步数**给，不按秒 —— 条件类的事情本来就没有秒数可以量。 */
function LaneWeight(phase) { return Math.max(1, (phase.steps || []).length); }

export class OrchestrationEditor {
  static id = "orchestration";
  static label = "关卡编排";
  static hint = "工作台：流程 / 俯视图 / 时间轴 / 批注→交给 agent；独立窗口，玩法照跑";
  static keepOnClose = true;

  constructor(host) {
    this.host = host;
    this.win = null;
    this.doc = null;
    this.ui = null;
    this.map = null;
    this.model = null;
    this.live = null;
    this.liveSignature = "";
    this.runtime = null;
    this.selection = null;
    this.phaseNumber = 1;
    this.followLive = true;
    this.elapsed = REFRESH_SECONDS;      // 开窗立刻刷一次，不等第一个 0.25 秒
    this.canvasSize = "";
    this.fittedOnce = false;
    this.notes = [];
    this.localIds = new Set();
    this.localImages = new Map();        // noteId → PNG dataURL（存在 IndexedDB 里的那几张）
    this.noteFilter = "open";
    this.lastImage = null;
    this.labelPending = null;            // 标注工具正开着的那个输入框
    this.draft = { text: "", proposal: "", timeKind: "", timeValue: "", shapes: [], candidate: null };
    this.statusText = "";
    this.OnPageHide = () => this.host.CloseOrchestration();
    this.OnResize = () => this.SyncCanvasSize(true);
  }

  // =========================================================================
  // 生命周期
  // =========================================================================
  Enter() {
    this.win = window.open("", "tzOrchestration", "popup,width=1380,height=900,menubar=no,toolbar=no,location=no");
    if (!this.win) throw new Error("关卡编排独立窗口被浏览器拦截，请允许弹窗后再打开");
    try {
      this.model = BuildOrchestrationModel();
      this.BuildDom();
      this.phaseNumber = this.model.phases[0]?.number ?? 1;
      this.map = new OrchestrationMap(this.ui.canvas, { model: this.model });
      this.map.onSelect((sel) => this.Select(sel, { fromMap: true }));
      this.map.onSketch((shape) => this.AddShape(shape));
      this.map.onMove((event) => this.SetCandidate(event?.to, event?.target));
      this.map.onLabel((at) => this.BeginLabel(at));
      this.SetPhase(this.phaseNumber);
      this.SetTool("select");
      this.RefreshForm();
      window.addEventListener("pagehide", this.OnPageHide);
      this.win.addEventListener("resize", this.OnResize);
      this.LoadNotes();
      this.Refresh();
      return this;
    } catch (error) {
      this.Exit();
      throw error;
    }
  }

  Update(dt) {
    if (!this.win || this.win.closed) { this.host.CloseOrchestration(); return; }
    this.elapsed += dt;
    if (this.elapsed < REFRESH_SECONDS) return;
    this.elapsed %= REFRESH_SECONDS;
    this.SyncCanvasSize(false);
    this.PollRuntime();
    this.Refresh();
  }

  Exit() {
    this.CancelLabel();
    window.removeEventListener("pagehide", this.OnPageHide);
    if (this.win && !this.win.closed) {
      try { this.win.removeEventListener("resize", this.OnResize); } catch (error) { /* 窗口已经没了 */ }
    }
    try { this.map?.Dispose(); } catch (error) { console.warn("[Orchestration] 俯视图关闭出错：", error); }
    this.map = null;
    this.elapsed = 0;
    if (this.win && !this.win.closed) this.win.close();
    this.win = null;
    this.doc = null;
    this.ui = null;
    this.live = null;
    this.runtime = null;
  }

  // =========================================================================
  // 运行时
  // =========================================================================
  /**
   * 每 tick 重新取 `host.game.missionRuntime`：换关会换一个对象，
   * 存一份引用的话下一关看到的是上一关的尸体。
   */
  PollRuntime() {
    let runtime = null;
    try { runtime = this.host.game?.missionRuntime ?? null; } catch (error) { runtime = null; }
    this.runtime = runtime;
    if (!runtime) {
      if (this.live) { this.live = null; this.liveSignature = ""; this.map?.SetLive(null); }
      return;
    }
    let live = null;
    try {
      const state = runtime.State();
      const player = this.host.game?.player?.position || null;
      live = ApplyRuntimeState(this.model, {
        ...state,
        player: player ? { x: player.x, z: player.z, yaw: this.host.game?.player?.yaw ?? null } : null,
        guideRoute: runtime.guideRoute || null,
        spawned: runtime.spawned ? [...runtime.spawned] : null,
        transferBeats: runtime.transferBeats ?? null,
      });
    } catch (error) {
      live = null;
    }
    this.live = live;
    if (!live) { this.map?.SetLive(null); return; }
    // 跟随实时换阶段时**只在视野还是「自动」的时候**重新框景：不框的话视野停在
    // 上一阶段那片地，面板说「阶段 12」而图上是车站；可要是用户刚自己放大到某个
    // 院子盯着看，一换阶段就把他的镜头夺走，那比不跟随更气人。
    // 手动标记由 map.viewTouched 记，两颗「适配」按钮把它复位。
    if (this.followLive && Number.isFinite(live.phaseNumber) && live.phaseNumber !== this.phaseNumber) {
      this.SetPhase(live.phaseNumber, { fit: !this.map?.viewTouched });
    }
    const signature = LiveSignature(live);
    if (signature === this.liveSignature) return;
    this.liveSignature = signature;
    this.map?.SetLive(live);
  }

  // =========================================================================
  // DOM（一次建齐，之后只写属性）
  // =========================================================================
  BuildDom() {
    const doc = this.win.document;
    doc.open();
    doc.write("<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'>"
      + "<meta name='viewport' content='width=device-width, initial-scale=1'>"
      + "<title>关卡编排 · 台儿庄：血战滕县</title></head><body></body></html>");
    doc.close();
    this.doc = doc;
    const theme = document.querySelector("link[data-interface-theme]");
    if (theme) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = theme.href;
      doc.head.appendChild(link);
    }
    const style = doc.createElement("style");
    style.textContent = POPUP_CSS;
    doc.head.appendChild(style);

    const El = (tag, parent, text = "", cls = "") => {
      const node = doc.createElement(tag);
      if (text) node.textContent = text;
      if (cls) node.className = cls;
      if (parent) parent.appendChild(node);
      return node;
    };
    const Button = (parent, text, onClick, data = {}) => {
      const node = El("button", parent, text);
      node.type = "button";
      for (const [key, value] of Object.entries(data)) node.dataset[key] = value;
      node.addEventListener("click", onClick);
      return node;
    };
    this.El = El;

    const header = El("header", doc.body);
    header.dataset.orch = "header";
    El("h1", header, "关卡编排 · 第一关《往南的路》");
    const liveStatus = El("div", header, "", "muted");
    liveStatus.dataset.orch = "live-status";
    const version = El("div", header, `模型 ${this.model.version}`, "muted");
    version.dataset.orch = "version";

    const cols = El("div", doc.body);
    cols.id = "cols";
    const flow = El("div", cols, "", "col flow");
    flow.dataset.orch = "flow";
    const map = El("div", cols, "", "col map");
    map.dataset.orch = "map";
    const detail = El("div", cols, "", "col detail");
    detail.dataset.orch = "detail";
    const timeline = El("div", doc.body);
    timeline.id = "tl";
    timeline.dataset.orch = "timeline";

    this.ui = { liveStatus, flow, map, detail, timeline };
    this.BuildFlow(El, Button, flow);
    this.BuildMapColumn(El, Button, map);
    this.BuildDetail(El, Button, detail);
    this.BuildTimeline(El, timeline);
  }

  // ------------------------------------------------------------------ 流程
  BuildFlow(El, Button, root) {
    El("h2", root, "流程 · 18 阶段 / 27 步骤");
    this.ui.phases = new Map();
    this.ui.steps = new Map();
    this.ui.facts = [];
    for (const phase of this.model.phases) {
      const box = El("div", root, "", "phase");
      box.dataset.flowPhase = String(phase.number);
      const head = El("div", box, "", "phaseHead");
      El("b", head, String(phase.number).padStart(2, "0"));
      El("span", head, `${phase.id} · ${phase.title}`);
      head.addEventListener("click", () => this.Select({ kind: "phase", id: phase.id }));
      const jump = Button(head, "从这里试玩", (event) => {
        event.stopPropagation();
        this.Jump(phase.number);
      }, { jump: String(phase.number) });
      jump.title = `Debug.FirstLevelJump(${phase.number})：从第 ${phase.number} 阶段开打`;
      for (const stepId of phase.steps) {
        const step = this.model.steps.find((entry) => entry.id === stepId);
        if (!step) continue;
        const node = El("div", box, "", "step");
        node.dataset.flowStep = step.id;
        node.addEventListener("click", () => this.Select({ kind: "step", id: step.id }));
        El("div", node, step.id, "stepId");
        El("div", node, step.objective || "（无目标文本）");
        const meta = [];
        if (step.cue) meta.push(`对白 ${step.cue}`);
        if (step.minimumSeconds) meta.push(`最短 ${step.minimumSeconds} s`);
        if (step.guidance?.route) meta.push(`指引路线 ${step.guidance.route}`);
        if (meta.length) El("div", node, meta.join(" · "), "muted");
        for (const factId of step.requirements) {
          const row = El("div", node, "", "fact");
          row.dataset.fact = factId;
          row.dataset.factState = "none";
          El("i", row, "·");
          El("span", row, `${factId} —— ${DescribeFact(this.model, factId)}`);
          row.addEventListener("click", (event) => {
            event.stopPropagation();
            this.Select({ kind: "fact", id: factId });
          });
          this.ui.facts.push({ row, factId, step });
        }
        if (step.spawns.length || step.guidance?.route) {
          const chips = El("div", node, "", "chips");
          for (const encounterId of step.spawns) {
            const chip = El("span", chips, `组 ${encounterId}`, "chip");
            chip.dataset.flowEncounter = encounterId;
            chip.addEventListener("click", (event) => {
              event.stopPropagation();
              this.Select({ kind: "encounter", id: encounterId });
            });
          }
          if (step.guidance?.route) {
            const chip = El("span", chips, `路线 ${step.guidance.route}`, "chip");
            chip.dataset.flowRoute = step.guidance.route;
            chip.addEventListener("click", (event) => {
              event.stopPropagation();
              this.Select({ kind: "route", id: step.guidance.route });
            });
          }
        }
        this.ui.steps.set(step.id, node);
      }
      this.ui.phases.set(phase.number, box);
    }
    // 27 个内部步骤里有一个（Complete）不属于任何公开阶段 —— 它是「关卡结束」。
    // 不画的话树上就只有 26 条，用户会以为自己看漏了一步。
    const orphans = this.model.steps.filter((step) => !this.ui.steps.has(step.id));
    if (orphans.length) {
      const box = El("div", root, "", "phase");
      box.dataset.flowOrphan = "1";
      const head = El("div", box, "", "phaseHead");
      El("b", head, "——");
      El("span", head, "不属于任何公开阶段");
      for (const step of orphans) {
        const node = El("div", box, "", "step");
        node.dataset.flowStep = step.id;
        node.addEventListener("click", () => this.Select({ kind: "step", id: step.id }));
        El("div", node, step.id, "stepId");
        El("div", node, step.objective || "（无目标文本）");
        this.ui.steps.set(step.id, node);
      }
      this.ui.phases.set(0, box);
    }
  }

  // ---------------------------------------------------------------- 俯视图
  BuildMapColumn(El, Button, root) {
    const tools = El("div", root, "", "bar");
    tools.dataset.orch = "tools";
    El("span", tools, "工具", "muted");
    this.ui.tools = new Map();
    for (const [id, label] of TOOLS) {
      const button = Button(tools, label, () => this.SetTool(id), { tool: id });
      this.ui.tools.set(id, button);
    }

    const layers = El("div", root, "", "bar");
    layers.dataset.orch = "layers";
    El("span", layers, "图层", "muted");
    this.ui.layers = new Map();
    for (const [id, label] of LAYERS) {
      const wrap = El("label", layers, "", "chk");
      const box = this.doc.createElement("input");
      box.type = "checkbox";
      box.checked = true;
      box.dataset.layer = id;
      box.addEventListener("change", () => this.SetLayer(id, box.checked));
      wrap.appendChild(box);
      El("span", wrap, label);
      this.ui.layers.set(id, box);
    }

    const stage = El("div", root, "", "bar");
    stage.dataset.orch = "stagebar";
    Button(stage, "◀ 上一阶段", () => this.SetPhase(this.phaseNumber - 1, { fit: true }), { map: "prev" });
    const slider = this.doc.createElement("input");
    slider.type = "range";
    slider.min = "1";
    slider.max = String(this.model.phases.length);
    slider.step = "1";
    slider.value = "1";
    slider.dataset.map = "phase";
    slider.style.width = "180px";
    slider.addEventListener("input", () => this.SetPhase(Number(slider.value), { fit: true }));
    stage.appendChild(slider);
    Button(stage, "下一阶段 ▶", () => this.SetPhase(this.phaseNumber + 1, { fit: true }), { map: "next" });
    const label = El("span", stage, "", "muted");
    label.dataset.map = "phase-label";
    Button(stage, "适配整关", () => this.map?.FitBounds(), { map: "fit-all" });
    Button(stage, "适配本阶段", () => this.map?.FitPhase(this.phaseNumber), { map: "fit-phase" });
    const follow = El("label", stage, "", "chk");
    const followBox = this.doc.createElement("input");
    followBox.type = "checkbox";
    followBox.checked = true;
    followBox.dataset.map = "follow";
    followBox.addEventListener("change", () => this.SetFollowLive(followBox.checked));
    follow.appendChild(followBox);
    El("span", follow, "跟随实时");
    this.ui.phaseSlider = slider;
    this.ui.phaseLabel = label;
    this.ui.followBox = followBox;

    const wrap = El("div", root);
    wrap.id = "canvasWrap";
    const canvas = this.doc.createElement("canvas");
    canvas.dataset.orch = "canvas";
    wrap.appendChild(canvas);
    this.ui.canvas = canvas;
    this.ui.canvasWrap = wrap;
  }

  // ---------------------------------------------------------- 详情 / 批注
  BuildDetail(El, Button, root) {
    El("h2", root, "详情 / 批注");
    const title = El("div", root, "（没有选中对象）");
    title.dataset.detail = "title";
    const owner = El("div", root, "");
    owner.dataset.detail = "owner";
    const jsonBox = El("details", root);
    jsonBox.dataset.detail = "json-box";
    El("summary", jsonBox, "原始数据 JSON");
    const json = El("pre", jsonBox, "—");
    json.dataset.detail = "json";

    El("h2", root, "本对象相关批注");
    const related = El("div", root, "（暂无）");
    related.dataset.detail = "notes";

    El("h2", root, "新建批注");
    const form = El("div", root);
    form.dataset.detail = "form";
    const text = this.doc.createElement("textarea");
    text.rows = 3;
    text.placeholder = "这组敌人出现得太早。";
    text.dataset.noteField = "text";
    text.addEventListener("input", () => { this.draft.text = text.value; });
    form.appendChild(text);

    const kindRow = El("div", form, "", "row");
    El("span", kindRow, "建议类型");
    const proposal = this.doc.createElement("select");
    proposal.dataset.noteField = "proposal";
    for (const [value, label] of [["", "（不写具体建议）"], ...PROPOSAL_KINDS.map((k) => [k, `${k} · ${PROPOSAL_TEXT[k] || k}`])]) {
      const option = this.doc.createElement("option");
      option.value = value;
      option.textContent = label;
      proposal.appendChild(option);
    }
    proposal.addEventListener("change", () => { this.draft.proposal = proposal.value; });
    kindRow.appendChild(proposal);

    const timeRow = El("div", form, "", "row");
    El("span", timeRow, "时间点");
    const timeWrap = El("div", timeRow, "", "bar");
    const timeKind = this.doc.createElement("select");
    timeKind.dataset.noteField = "timeKind";
    for (const [value, label] of [["", "不限时刻"], ["stageRelative", "阶段内第 N 秒"], ["fact", "某事实满足时"]]) {
      const option = this.doc.createElement("option");
      option.value = value;
      option.textContent = label;
      timeKind.appendChild(option);
    }
    timeKind.style.width = "auto";
    timeKind.addEventListener("change", () => { this.draft.timeKind = timeKind.value; this.RefreshForm(); });
    timeWrap.appendChild(timeKind);
    const timeValue = this.doc.createElement("input");
    timeValue.dataset.noteField = "timeValue";
    timeValue.placeholder = "秒数或事实 id";
    timeValue.style.width = "130px";
    timeValue.addEventListener("input", () => { this.draft.timeValue = timeValue.value; });
    timeWrap.appendChild(timeValue);

    const sketchRow = El("div", form, "", "row");
    El("span", sketchRow, "草图");
    const sketch = El("div", sketchRow, "（用中间的圈选 / 箭头 / 折线 / 标注工具画）", "muted");
    sketch.dataset.noteField = "sketch";
    const candidateRow = El("div", form, "", "row");
    El("span", candidateRow, "候选位");
    const candidate = El("div", candidateRow, "（用「候选位」工具把选中的敌人拖到想要的位置）", "muted");
    candidate.dataset.noteField = "candidate";

    const actions = El("div", form, "", "bar");
    Button(actions, "保存草稿", () => { this.SaveDraft(); }, { noteAction: "save" });
    Button(actions, "复制交接文本", () => this.CopyHandoff(), { noteAction: "handoff" });
    Button(actions, "下载 JSON", () => this.DownloadJson(), { noteAction: "download" });
    Button(actions, "复制 JSON", () => this.CopyJson(), { noteAction: "copy" });
    Button(actions, "下载本图", () => this.DownloadImage(), { noteAction: "image" });
    Button(actions, "清空草稿", () => this.ClearDraft(), { noteAction: "clear" });
    const status = El("div", form, "", "muted");
    status.dataset.notes = "status";

    El("h2", root, "全部批注");
    const filter = El("div", root, "", "bar");
    filter.dataset.notes = "filter";
    this.ui.filters = new Map();
    for (const [value, label] of [["open", "待处理"], ["resolved", "已处理"], ["dismissed", "不处理"], ["all", "全部"]]) {
      const button = Button(filter, label, () => this.SetNoteFilter(value), { notesFilter: value });
      this.ui.filters.set(value, button);
    }
    Button(filter, "重新加载", () => this.LoadNotes(), { notesAction: "reload" });
    const list = El("div", root, "（暂无）");
    list.dataset.notes = "list";

    Object.assign(this.ui, {
      title, owner, json, related, text, proposal, timeKind, timeValue, sketch, candidate, status, list,
    });
  }

  // -------------------------------------------------------------- 时间轴
  BuildTimeline(El, root) {
    const legend = El("div", root, "", "legend");
    legend.dataset.timeline = "legend";
    const designKey = El("span", legend);
    El("i", designKey, "◇ ◆ ■ ▸", "").style.color = "#7fc7d8";
    El("span", designKey, " 设计（condition 只画条件、不标秒数）");
    const actualKey = El("span", legend);
    El("i", actualKey, "▸ ●").style.color = "#78d78f";
    El("span", actualKey, " 实际试玩（关卡时钟）");

    this.ui.lanes = { design: new Map(), actual: new Map() };
    for (const kind of ["design", "actual"]) {
      const row = El("div", root, "", "tlRow");
      row.dataset.timeline = kind;
      El("div", row, kind === "design" ? "设计" : "实际", "tlLabel");
      for (const phase of this.model.phases) {
        const lane = El("div", row, "", "tlLane");
        lane.dataset.lane = String(phase.number);
        lane.style.flex = `${LaneWeight(phase)} 1 0`;
        El("div", lane, `${phase.number} ${phase.id}`, "h");
        const marks = El("div", lane);
        marks.dataset.marks = kind;
        this.ui.lanes[kind].set(phase.number, { lane, marks });
      }
    }
    // 设计行只画一次：它不随运行时变。
    for (const entry of this.model.timeline) {
      const slot = this.ui.lanes.design.get(entry.phaseNumber);
      if (!slot) continue;
      this.AddMarker(slot.marks, entry.kind, MarkerTitle(entry), MarkerSel(entry), MarkerSeconds(entry));
    }
    this.ui.actualCount = -1;
  }

  AddMarker(parent, kind, title, sel, seconds) {
    const node = this.doc.createElement("span");
    node.className = "tlMark";
    node.dataset.markerKind = kind;
    node.textContent = TIMELINE_GLYPH[kind] || "·";
    // 秒数只写在**有秒数的那几类**上。condition 是玩家行为触发的，不许假装它有时刻。
    if (Number.isFinite(seconds)) node.dataset.markerAt = String(seconds);
    node.title = title;
    if (sel) {
      node.dataset.selKind = sel.kind;
      if (sel.id) node.dataset.selId = sel.id;
      node.addEventListener("click", () => this.Select(sel));
    }
    parent.appendChild(node);
    return node;
  }

  RefreshActualTimeline() {
    if (!this.ui?.lanes) return;
    const entries = this.live?.actualTimeline || [];
    if (entries.length === this.ui.actualCount) return;
    this.ui.actualCount = entries.length;
    for (const slot of this.ui.lanes.actual.values()) slot.marks.textContent = "";
    for (const entry of entries) {
      const slot = this.ui.lanes.actual.get(entry.phaseNumber);
      if (!slot) continue;
      const sel = entry.kind === "stageEntry" ? { kind: "step", id: entry.id } : { kind: "fact", id: entry.id };
      this.AddMarker(slot.marks, entry.kind, `${TIMELINE_TEXT[entry.kind]} ${entry.id} · 关卡时钟 ${Round(entry.atS)} s`
        + `（本步第 ${Round(entry.stageAtS)} s）`, sel, Math.round(entry.atS * 10) / 10);
    }
  }

  // =========================================================================
  // 对外方法
  // =========================================================================
  /** 选中一个对象：联动地图高亮、右栏反查、流程栏高亮。 */
  Select(sel, { fromMap = false } = {}) {
    this.selection = sel || null;
    if (!fromMap) this.map?.SetSelection(this.selection);
    if (sel && sel.kind === "phase") {
      const phase = this.model.phases.find((entry) => entry.id === sel.id || entry.number === Number(sel.id));
      if (phase) this.SetPhase(phase.number, { fit: true });
    }
    if (sel && sel.kind === "step") {
      const step = this.model.steps.find((entry) => entry.id === sel.id);
      if (step && Number.isFinite(step.phaseNumber)) this.SetPhase(step.phaseNumber, { fit: true });
    }
    this.RefreshDetail();
    this.RefreshFlowSelection();
    return this.selection;
  }

  SetPhase(n, { fit = false } = {}) {
    const max = this.model.phases.length;
    const number = Math.min(max, Math.max(1, Number.isFinite(n) ? Math.round(n) : 1));
    this.phaseNumber = number;
    if (this.map) {
      this.map.SetPhase(number);
      if (fit) this.map.FitPhase(number);
    }
    if (this.ui?.phaseSlider) this.ui.phaseSlider.value = String(number);
    if (this.ui?.phaseLabel) {
      const phase = this.model.phases.find((entry) => entry.number === number);
      this.ui.phaseLabel.textContent = phase ? `第 ${number} / ${max} 阶段 · ${phase.title}` : `第 ${number} 阶段`;
    }
    this.RefreshLanes();
    return number;
  }

  SetTool(tool) {
    this.CancelLabel();
    this.map?.SetTool(tool);
    for (const [id, button] of this.ui?.tools || []) button.classList.toggle("on", id === tool);
    return tool;
  }

  /**
   * 标注工具落点 → 在点下去的地方长一个输入框。
   * 不用 `prompt`：它会把整个窗口冻住（弹窗里尤其难看），而且无头测试根本没法给它输字。
   * 回车落笔、Esc 取消、失焦提交非空文本；空文本不产生形状。
   */
  BeginLabel(at) {
    this.CancelLabel();
    if (!this.ui || !at || !Number.isFinite(at.x)) return null;
    const input = this.doc.createElement("input");
    input.type = "text";
    input.className = "labelInput";
    input.dataset.orch = "label-input";
    input.placeholder = "写一句话，回车落笔";
    input.style.left = `${Math.max(0, Math.round(at.px || 0))}px`;
    input.style.top = `${Math.max(0, Math.round((at.py || 0) - 11))}px`;
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();          // 别让 Esc 顺手把编辑器面板也关了
      if (event.key === "Enter") { event.preventDefault(); this.CommitLabel(); }
      else if (event.key === "Escape") { event.preventDefault(); this.CancelLabel(); }
    });
    input.addEventListener("blur", () => { if (this.labelPending) this.CommitLabel({ silent: true }); });
    this.ui.canvasWrap.appendChild(input);
    this.labelPending = { x: at.x, z: at.z, input };
    try { input.focus(); } catch (error) { /* 窗口没聚焦时 focus 会抛，不影响输入 */ }
    return input;
  }

  /** 给测试与宿主代码用：往正开着的标注输入框里填字。 */
  SetLabelText(text) {
    if (!this.labelPending) return null;
    this.labelPending.input.value = String(text ?? "");
    return this.labelPending.input.value;
  }

  CommitLabel({ silent = false } = {}) {
    const pending = this.labelPending;
    if (!pending) return null;
    this.labelPending = null;
    const text = String(pending.input.value || "").trim();
    pending.input.remove();
    // 空文字不生成形状 —— 图上一枚没有字的标注就是一个谜，还会跟着批注传给 agent。
    if (!text) {
      if (!silent) this.SetStatus("标注没写字，这一笔不算数", true);
      return null;
    }
    return this.AddShape({ type: "label", x: pending.x, z: pending.z, text });
  }

  CancelLabel() {
    const pending = this.labelPending;
    if (!pending) return null;
    this.labelPending = null;
    try { pending.input.remove(); } catch (error) { /* 窗口已经关了 */ }
    return null;
  }

  SetLayer(id, on) {
    this.map?.SetLayers({ [id]: !!on });
    const box = this.ui?.layers?.get(id);
    if (box && box.checked !== !!on) box.checked = !!on;
  }

  SetFollowLive(on) {
    this.followLive = !!on;
    if (this.ui?.followBox && this.ui.followBox.checked !== this.followLive) this.ui.followBox.checked = this.followLive;
    if (this.followLive && Number.isFinite(this.live?.phaseNumber)) this.SetPhase(this.live.phaseNumber);
  }

  /** 地图工具画出来的一笔（也供测试直接塞形状）。 */
  AddShape(shape) {
    if (!shape || !shape.type) return null;
    const next = { ...shape };
    if (next.type === "label" && !next.text) next.text = (this.draft.text || "标注").slice(0, 12);
    this.draft.shapes.push(next);
    this.map?.SetSketch(this.DraftShapes());
    this.RefreshForm();
    return next;
  }

  RemoveShape(index) {
    this.draft.shapes.splice(index, 1);
    this.map?.SetSketch(this.DraftShapes());
    this.RefreshForm();
  }

  /** move 工具拖出来的候选位：不改模型，只作为 proposal.to 与一枚 ghost。 */
  SetCandidate(point, target = null) {
    if (!point || !Number.isFinite(point.x)) { this.draft.candidate = null; }
    else {
      this.draft.candidate = { x: point.x, z: point.z, memberId: target?.id || this.selection?.id || null };
      if (!this.draft.proposal) { this.draft.proposal = "move"; if (this.ui) this.ui.proposal.value = "move"; }
      if (target && target.kind && target.id) this.Select({ kind: target.kind, id: target.id, x: target.x, z: target.z });
    }
    this.map?.SetSketch(this.DraftShapes());
    this.RefreshForm();
    return this.draft.candidate;
  }

  SetNoteText(text) {
    this.draft.text = String(text ?? "");
    if (this.ui) this.ui.text.value = this.draft.text;
    return this.draft.text;
  }

  SetProposalKind(kind) {
    this.draft.proposal = PROPOSAL_KINDS.includes(kind) ? kind : "";
    if (this.ui) this.ui.proposal.value = this.draft.proposal;
    return this.draft.proposal;
  }

  SetNoteTime(kind, value) {
    this.draft.timeKind = kind || "";
    this.draft.timeValue = value === undefined || value === null ? "" : String(value);
    if (this.ui) { this.ui.timeKind.value = this.draft.timeKind; this.ui.timeValue.value = this.draft.timeValue; }
    this.RefreshForm();
  }

  SetNoteFilter(value) {
    this.noteFilter = value;
    this.RefreshNotes();
  }

  ClearDraft() {
    this.draft = { text: "", proposal: "", timeKind: "", timeValue: "", shapes: [], candidate: null };
    if (this.ui) {
      this.ui.text.value = "";
      this.ui.proposal.value = "";
      this.ui.timeKind.value = "";
      this.ui.timeValue.value = "";
    }
    this.map?.SetSketch([]);
    this.RefreshForm();
  }

  async Jump(number) {
    const Debug = window.Taierzhuang?.Debug;
    if (!Debug?.FirstLevelJump) { this.SetStatus("这个页面没有 Debug.FirstLevelJump（不是第一关的构建）", true); return null; }
    try {
      const result = await Debug.FirstLevelJump(number);
      this.SetStatus(`已跳到第 ${number} 阶段`, false);
      return result;
    } catch (error) {
      this.SetStatus(`跳阶段失败：${error?.message || error}`, true);
      return null;
    }
  }

  // =========================================================================
  // 批注
  // =========================================================================
  DraftShapes() {
    const shapes = this.draft.shapes.slice();
    if (this.draft.candidate) {
      shapes.push({ type: "ghost", x: this.draft.candidate.x, z: this.draft.candidate.z, memberId: this.draft.candidate.memberId || undefined });
    }
    return shapes;
  }

  /** 当前选中翻成一条批注的 target；没选中就落在当前阶段上。 */
  DraftTarget() {
    const sel = this.selection;
    const phase = this.model.phases.find((entry) => entry.number === this.phaseNumber);
    if (!sel || sel.kind === "note") return { kind: "phase", id: phase?.id ?? String(this.phaseNumber) };
    const target = { kind: sel.kind, id: sel.id };
    if (Number.isFinite(sel.x) && Number.isFinite(sel.z)) { target.x = sel.x; target.z = sel.z; }
    if (sel.kind === "point" && !Number.isFinite(target.x)) return { kind: "phase", id: phase?.id ?? String(this.phaseNumber) };
    return target;
  }

  DraftStep() {
    const sel = this.selection;
    if (sel?.kind === "step") return sel.id;
    const owner = sel?.id ? FindOwner(this.model, sel.id) : null;
    if (owner?.step) return owner.step;
    if (this.live?.stepId && this.live.phaseNumber === this.phaseNumber) return this.live.stepId;
    const phase = this.model.phases.find((entry) => entry.number === this.phaseNumber);
    return phase?.steps?.[0] ?? null;
  }

  DraftTime() {
    const kind = this.draft.timeKind;
    if (kind === "stageRelative") {
      const seconds = Number(this.draft.timeValue);
      return Number.isFinite(seconds) ? { kind: "stageRelative", seconds } : null;
    }
    if (kind === "fact") {
      const fact = String(this.draft.timeValue || "").trim();
      return fact ? { kind: "fact", fact } : null;
    }
    return null;
  }

  DraftProposal() {
    const kind = this.draft.proposal;
    if (!kind) return null;
    const proposal = { kind };
    if (this.draft.candidate) proposal.to = { x: this.draft.candidate.x, z: this.draft.candidate.z };
    const path = this.draft.shapes.find((shape) => shape.type === "path");
    if (path && Array.isArray(path.points)) proposal.points = path.points.map((point) => ({ x: point.x, z: point.z }));
    if (kind === "delay" || kind === "retime") {
      const seconds = Number(this.draft.timeValue);
      if (Number.isFinite(seconds)) proposal.seconds = seconds;
    }
    return proposal;
  }

  /** 「保存草稿」：先拍快照、再出图、再问端点，最后才落盘或退化。 */
  async SaveDraft() {
    const text = String(this.draft.text || "").trim();
    if (!text) { this.SetStatus("批注要先写一句话：说清楚哪里不对。", true); return { ok: false, reason: "empty" }; }
    const target = this.DraftTarget();
    const now = new Date();
    const id = NewNoteId(now);
    const image = this.SnapshotImage();
    const note = {
      id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: "open",
      level: LEVEL,
      missionVersion: this.model.version,
      target,
      phaseNumber: this.phaseNumber,
      step: this.DraftStep(),
      time: this.DraftTime(),
      text,
      original: SnapshotTarget(this.model, target),
      proposal: this.DraftProposal(),
      sketch: { shapes: this.DraftShapes() },
      image: image ? `${id}.png` : null,
      resolution: null,
    };
    const check = ValidateNote(note);
    if (!check.ok) {
      this.SetStatus(`批注不合规：${check.errors.join("；")}`, true);
      return { ok: false, reason: "invalid", errors: check.errors };
    }
    this.notes = [...this.notes, note];
    this.lastImage = image ? { id, name: `${id}.png`, data: image, stored: false } : null;
    // 图先进 IndexedDB，再谈上传：不管这次写不写得了盘，路径只有一条 ——
    // 「攒在本地 → 有端点时随那次 POST 补传 → 传完删掉」。
    if (image) {
      const stored = await PutImage(window, id, image);
      this.lastImage.stored = !!stored;
      if (stored) this.localImages.set(id, image);
    }
    const result = await this.Persist(id);
    this.ClearDraft();
    this.RefreshNotes();
    this.RefreshDetail();
    return { ok: true, id, ...result };
  }

  SnapshotImage() {
    try {
      const data = this.map?.ToPng({ scale: 1 }) || "";
      // 1.5 MB 是保存端点的硬闸；超了就不带图，别让整条批注一起被拒。
      if (!IsPngData(data) || Oversize(data)) return null;
      return data;
    } catch (error) { return null; }
  }

  /**
   * 落盘：可写就 POST 全量批注 + **IndexedDB 里还没上传的那些图**（一次 POST 的图
   * 总量封在 7 MB 以内，端点的 body 上限是 8 MB；超了就分几次 POST）。
   * 每批传成功就把那几张从 IndexedDB 删掉 —— 留着只会一直往上顶配额。
   * 写不了就退化成 localStorage 草稿（图仍留在 IndexedDB），并把原因写在面板上。
   */
  async Persist(pendingId) {
    let status = null;
    try {
      const response = await fetch(STATUS_URL, { cache: "no-store" });
      if (!response.ok) return this.Degrade(pendingId, `${STATUS_URL} ${response.status}`);
      status = await response.json();
    } catch (error) {
      return this.Degrade(pendingId, `${STATUS_URL} 取不到（${error?.message || error}）`);
    }
    if (!status || !status.writable) return this.Degrade(pendingId, `${STATUS_URL} 报 writable=false`);
    const batches = BatchImages(await this.PendingImages());
    let count = this.notes.length;
    let file = NotesPathFor(LEVEL);
    let uploaded = 0;
    for (const batch of batches) {
      const images = {};
      for (const one of batch) images[one.name] = one.data;
      try {
        const response = await fetch(SAVE_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ level: LEVEL, notes: this.notes, images }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) {
          return this.Degrade(pendingId, `${SAVE_URL} ${response.status}${data?.error ? ` ${data.error}` : ""}`);
        }
        count = data.count;
        file = data.file || file;
        uploaded += data.images?.length || 0;
        await DeleteImages(window, batch.map((one) => one.id));
        for (const one of batch) this.localImages.delete(one.id);
      } catch (error) {
        return this.Degrade(pendingId, `${SAVE_URL} 出错（${error?.message || error}）`);
      }
    }
    this.localIds.clear();
    this.ClearLocal();
    this.SetStatus(`已写进 ${file}：${count} 条批注`
      + `${uploaded ? `，${uploaded} 张图（含补传）` : ""}`, false);
    return { mode: "endpoint", file, count, images: uploaded, batches: batches.length };
  }

  /** 还没上传的图：IndexedDB 里凡是仍被某条批注引用着的，都排进这次的队。 */
  async PendingImages() {
    const wanted = new Set(this.notes.filter((note) => note.image).map((note) => note.id));
    const queue = [];
    const seen = new Set();
    for (const row of await AllImages(window)) {
      if (!wanted.has(row.id) || seen.has(row.id) || !IsPngData(row.data) || Oversize(row.data)) continue;
      seen.add(row.id);
      queue.push({ id: row.id, name: `${row.id}.png`, data: row.data });
    }
    // IndexedDB 写不进去（隐私模式）时内存里还有一份，别让这张图跟着掉。
    const last = this.lastImage;
    if (last?.id && wanted.has(last.id) && !seen.has(last.id) && IsPngData(last.data) && !Oversize(last.data)) {
      queue.push({ id: last.id, name: last.name, data: last.data });
    }
    return queue;
  }

  /**
   * 端点不在（线上 Pages、或没开本地预览服）时的退路：
   * 批注进 localStorage，**图进 IndexedDB**（几 MB 的 dataURL 一张就能把
   * localStorage 的配额顶爆），`image` 字段照写 `<id>.png`，下次能写盘时随那一次
   * POST 一起补传。只有 IndexedDB 也用不了时才把 `image` 抹成 null ——
   * 指着一个哪儿都不存在的 PNG 比没有图更糟。
   */
  Degrade(pendingId, reason) {
    if (pendingId) this.localIds.add(pendingId);
    const lost = this.lastImage && this.lastImage.id === pendingId && !this.lastImage.stored;
    if (lost) for (const note of this.notes) if (note.id === pendingId) note.image = null;
    let stored = false;
    try {
      const local = this.notes.filter((note) => this.localIds.has(note.id));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ level: LEVEL, savedAt: new Date().toISOString(), notes: local }));
      stored = true;
    } catch (error) { stored = false; }
    const kept = this.localImages.size;
    this.SetStatus(`保存失败：${reason} · ${stored
      ? `已存进本地草稿 localStorage["${STORAGE_KEY}"]（${this.localIds.size} 条），用「下载 JSON / 复制 JSON」交给 agent`
      : "localStorage 也写不了，请立刻用「复制 JSON」把草稿拷走"}`
      + `${kept ? ` · ${kept} 张图存在 IndexedDB（${IMAGE_DB}/${IMAGE_STORE}），下次能写盘时自动补传` : ""}`
      + `${lost ? " · 图片没地方放（IndexedDB 用不了），可用「下载本图」另存" : ""}`, true);
    return { mode: "local", stored, reason, images: kept };
  }

  ClearLocal() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (error) { /* 隐私模式下读写都会抛 */ }
  }

  /** 加载：仓库里的 notes.json 打底，再合并 localStorage 里还没上传的草稿。 */
  async LoadNotes() {
    let fromFile = [];
    let fileError = "";
    try {
      const response = await fetch(`${NOTES_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) fromFile = data;
        else fileError = "notes.json 不是数组";
      } else if (response.status !== 404) fileError = `notes.json ${response.status}`;
    } catch (error) { fileError = `notes.json 取不到（${error?.message || error}）`; }

    let local = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.notes)) local = parsed.notes;
    } catch (error) { local = []; }

    const byId = new Map();
    for (const note of fromFile) if (note && note.id) byId.set(note.id, note);
    this.localIds = new Set();
    for (const note of local) {
      if (!note || !note.id || byId.has(note.id)) continue;   // 文件里已经有了 = 早就传上去了
      byId.set(note.id, note);
      this.localIds.add(note.id);
    }
    this.notes = [...byId.values()];
    // 本地草稿的图在 IndexedDB 里（退化时存的那几张）：取回来给卡片当缩略图，
    // 也让「下载本图」能把它另存出去。
    this.localImages = new Map();
    const ids = new Set(this.notes.map((note) => note.id));
    for (const row of await AllImages(window)) {
      if (ids.has(row.id) && IsPngData(row.data)) this.localImages.set(row.id, row.data);
    }
    if (fileError) this.SetStatus(`${fileError} · 只显示本地草稿（${this.localIds.size} 条）`, true);
    else if (this.localIds.size) this.SetStatus(`${this.notes.length} 条批注，其中 ${this.localIds.size} 条还只在本地草稿里`, true);
    else this.SetStatus(`${this.notes.length} 条批注（${NotesPathFor(LEVEL)}）`, false);
    this.map?.SetNotes(this.notes);
    this.RefreshNotes();
    this.RefreshDetail();
    return this.notes;
  }

  OpenNotes() { return this.notes.filter((note) => note.status === "open"); }

  HandoffText() { return HandoffMarkdown(this.OpenNotes(), this.model); }

  CopyHandoff() { return this.CopyText(this.HandoffText(), "交接文本"); }

  CopyJson() { return this.CopyText(JSON.stringify(this.notes, null, 2), "批注 JSON"); }

  CopyText(text, what) {
    const clipboard = this.win?.navigator?.clipboard;
    const Fallback = () => {
      // 剪贴板写不了（没有 https / 没有用户手势）时把文本摆出来让人自己拷，别静默失败。
      const area = this.doc.createElement("textarea");
      area.value = text;
      area.dataset.notes = "clipboard";
      area.rows = 8;
      area.style.width = "100%";
      this.ui.status.after(area);
      area.select?.();
      this.SetStatus(`${what}复制不了（剪贴板被拒），已摆在下面的文本框里`, true);
    };
    if (!clipboard?.writeText) { Fallback(); return text; }
    clipboard.writeText(text).then(() => this.SetStatus(`${what}已复制（${text.length} 字）`, false), Fallback);
    return text;
  }

  DownloadJson() { return this.Download(`notes_${LEVEL}.json`, new Blob([JSON.stringify(this.notes, null, 2)], { type: "application/json" })); }

  DownloadImage() {
    if (!this.lastImage) {
      const data = this.SnapshotImage();
      if (!data) { this.SetStatus("这张俯视图出不了 PNG", true); return null; }
      this.lastImage = { id: null, name: `orchestration_${LEVEL}.png`, data, stored: false };
    }
    return this.DownloadPng(this.lastImage.name, this.lastImage.data);
  }

  /** 某一条批注自己那张图（存在 IndexedDB 里的本地草稿图）。 */
  DownloadNoteImage(id) {
    const data = this.localImages.get(id);
    if (!data) { this.SetStatus(`批注 ${id} 本地没有图（它的图已经在仓库里了）`, true); return null; }
    return this.DownloadPng(`${id}.png`, data);
  }

  DownloadPng(name, dataUrl) {
    try {
      const binary = atob(String(dataUrl).slice("data:image/png;base64,".length));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return this.Download(name, new Blob([bytes], { type: "image/png" }));
    } catch (error) {
      this.SetStatus(`图片转不出来：${error?.message || error}`, true);
      return null;
    }
  }

  Download(name, blob) {
    try {
      const url = this.win.URL.createObjectURL(blob);
      const link = this.doc.createElement("a");
      link.href = url;
      link.download = name;
      this.doc.body.appendChild(link);
      link.click();
      link.remove();
      this.win.setTimeout(() => this.win.URL.revokeObjectURL(url), 10000);
      this.SetStatus(`已下载 ${name}`, false);
      return name;
    } catch (error) {
      this.SetStatus(`下载失败：${error?.message || error}`, true);
      return null;
    }
  }

  /** 「标记已核对」：agent 改完之后用户确认过了。写 verified，不动 status。 */
  async MarkVerified(id) {
    const note = this.notes.find((entry) => entry.id === id);
    if (!note) return null;
    note.verified = true;
    note.updatedAt = new Date().toISOString();
    const result = await this.Persist(id);
    this.RefreshNotes();
    return { ...result, id };
  }

  /** 「定位」：回选这条批注的目标并把地图跳到它那一阶段。 */
  LocateNote(id) {
    const note = this.notes.find((entry) => entry.id === id);
    if (!note) return null;
    if (Number.isFinite(note.phaseNumber)) this.SetPhase(note.phaseNumber);
    const target = note.target || {};
    this.Select({ kind: target.kind, id: target.id, x: target.x, z: target.z });
    const point = Number.isFinite(target.x) ? { x: target.x, z: target.z } : this.map?.SelPoint?.(this.selection);
    if (point) this.map?.ZoomTo(point, 60);
    return note;
  }

  // =========================================================================
  // 刷新（只写属性）
  // =========================================================================
  SyncCanvasSize(force) {
    const canvas = this.ui?.canvas;
    if (!canvas || !this.map) return;
    const size = `${canvas.clientWidth}x${canvas.clientHeight}`;
    if (!force && size === this.canvasSize) return;
    this.canvasSize = size;
    this.map.Resize();
    // 弹窗刚写完 DOM 那一刻布局还没定，构造时的 FitBounds 是按 300×150 算的。
    // 等真实尺寸出来再框一次本阶段，否则开窗看到的是一张糊在角落的缩略图。
    if (!this.fittedOnce && canvas.clientWidth > 80) {
      this.fittedOnce = true;
      this.map.FitPhase(this.phaseNumber);
    }
  }

  Refresh() {
    if (!this.ui) return;
    this.RefreshHeader();
    this.RefreshFlowState();
    this.RefreshActualTimeline();
    this.RefreshLanes();
  }

  RefreshHeader() {
    const live = this.live;
    let text;
    if (!live) {
      text = "未加载第一关 · 仅显示设计编排（用各阶段的「从这里试玩」进去）";
    } else {
      const phase = this.model.phases.find((entry) => entry.number === live.phaseNumber);
      const waiting = live.remaining?.length ? live.remaining.join(" / ") : "（无，等最短时长或推进中）";
      text = `阶段 ${live.phaseNumber} ${phase ? phase.title : ""} · 步骤 ${live.stepId}`
        + ` · 关卡时钟 ${Round(live.time)} s · 本步 ${Round(live.stageTime)} s · 正在等：${waiting}`;
    }
    if (this.ui.liveStatus.textContent !== text) this.ui.liveStatus.textContent = text;
    this.ui.liveStatus.dataset.hasRuntime = live ? "1" : "0";
  }

  RefreshFlowState() {
    const live = this.live;
    const currentStep = live?.stepId || null;
    const currentIndex = currentStep ? this.model.steps.findIndex((step) => step.id === currentStep) : -1;
    for (const [id, node] of this.ui.steps) node.classList.toggle("now", id === currentStep);
    for (const [number, node] of this.ui.phases) node.classList.toggle("now", number === live?.phaseNumber);
    for (const entry of this.ui.facts) {
      let state = "none";
      let glyph = "·";
      if (live) {
        if (live.facts.has(entry.factId)) { state = "ok"; glyph = "✓"; }
        else if (entry.step.index === currentIndex) { state = "wait"; glyph = "…"; }
        else if (entry.step.index < currentIndex) { state = "past"; glyph = "·"; }
        else { state = "future"; glyph = "—"; }
      }
      if (entry.row.dataset.factState !== state) entry.row.dataset.factState = state;
      const mark = entry.row.firstChild;
      if (mark && mark.textContent !== glyph) mark.textContent = glyph;
      if (state === "future") entry.row.title = "未到该步";
      else entry.row.title = state === "ok" ? "已满足" : state === "wait" ? "正在等" : "";
    }
  }

  RefreshFlowSelection() {
    if (!this.ui) return;
    const sel = this.selection;
    for (const [id, node] of this.ui.steps) node.classList.toggle("sel", sel?.kind === "step" && sel.id === id);
  }

  RefreshLanes() {
    if (!this.ui?.lanes) return;
    for (const kind of ["design", "actual"]) {
      for (const [number, slot] of this.ui.lanes[kind]) slot.lane.classList.toggle("now", number === this.phaseNumber);
    }
  }

  RefreshForm() {
    if (!this.ui) return;
    const shapes = this.draft.shapes;
    this.ui.sketch.textContent = "";
    if (!shapes.length) {
      this.ui.sketch.textContent = "（用中间的圈选 / 箭头 / 折线 / 标注工具画）";
    } else {
      shapes.forEach((shape, index) => {
        const chip = this.El("span", this.ui.sketch, `${ShapeText(shape)} ✕`, "chip");
        chip.dataset.shapeIndex = String(index);
        chip.addEventListener("click", () => this.RemoveShape(index));
      });
    }
    this.ui.candidate.textContent = this.draft.candidate
      ? `${this.draft.candidate.memberId || "候选位"} → (${Round(this.draft.candidate.x)}, ${Round(this.draft.candidate.z)})`
      : "（用「候选位」工具把选中的敌人拖到想要的位置）";
    this.ui.timeValue.disabled = !this.draft.timeKind;
    this.ui.timeValue.placeholder = this.draft.timeKind === "fact" ? "事实 id" : "秒数";
  }

  SetStatus(text, warn) {
    this.statusText = text;
    if (!this.ui) return;
    this.ui.status.textContent = text;
    this.ui.status.className = warn ? "warn" : "ok";
  }

  RefreshDetail() {
    if (!this.ui) return;
    const sel = this.selection;
    if (!sel) {
      this.ui.title.textContent = "（没有选中对象）";
      this.ui.owner.textContent = "在俯视图上点一个敌人 / 锚点 / 触发区 / 路线，或在左边点阶段、步骤、事实、组。";
      this.ui.json.textContent = "—";
      this.ui.related.textContent = "（暂无）";
      return;
    }
    this.ui.title.textContent = `${KIND_TEXT[sel.kind] || sel.kind}：${sel.id ?? `(${Round(sel.x)}, ${Round(sel.z)})`}`;
    this.ui.owner.textContent = "";
    for (const line of this.DescribeSelection(sel)) this.El("div", this.ui.owner, line);
    const snapshot = SnapshotTarget(this.model, { kind: sel.kind, id: sel.id, x: sel.x, z: sel.z });
    this.ui.json.textContent = JSON.stringify(snapshot, null, 2);
    this.RefreshRelatedNotes(sel);
  }

  /** 反查：属于哪组、哪步生成、何时/何条件激活、路线点、引用它的事实。 */
  DescribeSelection(sel) {
    const model = this.model;
    const lines = [];
    const owner = sel.id ? FindOwner(model, sel.id) : null;
    if (sel.kind === "member" || sel.kind === "encounter") {
      const encounter = owner?.encounter;
      const member = owner?.member;
      if (encounter) {
        lines.push(`所属遭遇组：${encounter.id}（起始阶段 ${encounter.phaseNumber ?? "—"}${encounter.deferred ? " · 本阶段内延后" : ""}）`);
        const spawn = encounter.spawn || {};
        const where = [];
        if (spawn.step) where.push(`步骤 ${spawn.step}`);
        if (spawn.fact) where.push(`事实 ${spawn.fact}`);
        if (spawn.beat) where.push(`转运拍 ${spawn.beat}`);
        lines.push(`出现方式：${SPAWN_TEXT[spawn.kind] || spawn.kind || "—"}（kind=${spawn.kind || "—"}）`
          + ` · ${where.join(" · ") || "—"}`);
        if (encounter.standbyUntil) lines.push(`待命到：事实 ${encounter.standbyUntil} 满足（${DescribeFact(model, encounter.standbyUntil)}）`);
        if (encounter.dormant) {
          const wake = encounter.wake || {};
          lines.push(`生成即休眠，醒来条件：${wake.kind === "playerWithinM"
            ? `玩家进 ${wake.radiusM} m（步骤 ${wake.step}）`
            : wake.fact ? `事实 ${wake.fact}` : "—"}`);
        }
        if (encounter.release) lines.push(`放行：${encounter.release.kind}`);
        if (encounter.note) lines.push(`备注：${encounter.note}`);
        const state = this.map?.phaseLayout?.encounters?.find((entry) => entry.id === encounter.id)?.state;
        if (state) lines.push(`第 ${this.phaseNumber} 阶段状态：${STATE_TEXT[state] || state}`);
      }
      if (member) {
        lines.push(`出生点 (${Round(member.x)}, ${Round(member.z)}) · 武器 ${member.weapon}`
          + `${member.hold ? " · 钉在原地" : ""}${member.bayonet ? " · 刺刀" : ""}${member.reserve ? " · 预备队" : ""}`);
        if (member.tactic) {
          lines.push(`移动路线：${member.tactic.points.length} 个点，延迟 ${member.tactic.delay} s`
            + `${member.tactic.near ? `，且玩家要先进 (${Round(member.tactic.near.x)}, ${Round(member.tactic.near.z)}) 的 ${member.tactic.nearM} m` : ""}`);
        } else lines.push("移动路线：无（原地）");
        if (member.assaultLane) lines.push(`跃进线：${member.assaultLane.length} 个点`);
        if (Number.isFinite(member.clearedAtPhase)) lines.push(`跳关口径：第 ${member.clearedAtPhase} 阶段起算已清除`);
        const enemy = this.live?.enemies?.find((entry) => entry.id === member.id);
        if (enemy) lines.push(`实机：${enemy.alive ? "活着" : "已阵亡"}${enemy.dormant ? " · 休眠" : ""} 位于 (${Round(enemy.x)}, ${Round(enemy.z)})`);
      }
    } else if (sel.kind === "fact") {
      const fact = model.facts[sel.id];
      lines.push(`判法：${DescribeFact(model, sel.id)}`);
      if (fact) {
        lines.push(`判法类别 ${fact.kind} · 所属步骤 ${fact.step ?? "—"}（第 ${fact.phaseNumber ?? "—"} 阶段）`);
        if (fact.source) lines.push(`运行时入口：${fact.source}`);
        if (fact.requires?.length) lines.push(`先决事实：${fact.requires.join(" / ")}`);
      }
      const users = model.steps.filter((step) => step.requirements.includes(sel.id)).map((step) => step.id);
      lines.push(`被这些步骤当作过关条件：${users.join(" / ") || "（没有，属编排触发）"}`);
      if (this.live) lines.push(`实机：${this.live.facts.has(sel.id) ? "已满足" : "还没满足"}`);
    } else if (sel.kind === "step") {
      const step = model.steps.find((entry) => entry.id === sel.id);
      if (step) {
        lines.push(`第 ${step.phaseNumber} 阶段的第 ${step.index + 1} 个内部步骤`);
        lines.push(`目标：${step.objective}`);
        if (step.cue) lines.push(`对白：${step.cue}`);
        if (step.minimumSeconds) lines.push(`最短时长：${step.minimumSeconds} s`);
        lines.push(`过关条件：${step.requirements.join(" / ") || "（无）"}`);
        lines.push(`本步生成：${step.spawns.join(" / ") || "（无）"}`);
        if (step.guidance) lines.push(`指引：${step.guidance.label}${step.guidance.route ? ` · 路线 ${step.guidance.route}` : ""}`);
      }
    } else if (sel.kind === "phase") {
      const phase = model.phases.find((entry) => entry.id === sel.id || entry.number === Number(sel.id));
      if (phase) {
        lines.push(`第 ${phase.number} 公开阶段 · ${phase.title}`);
        lines.push(`内部步骤：${phase.steps.join(" / ")}`);
        lines.push(`跳关出生点 (${Round(phase.spawn?.x)}, ${Round(phase.spawn?.z)})`);
      }
    } else if (sel.kind === "route") {
      const points = model.routes[sel.id] || [];
      lines.push(`路线 ${sel.id}：${points.length} 个点`);
      if (points.length) lines.push(`起点 (${Round(points[0].x)}, ${Round(points[0].z)}) → 终点 (${Round(points[points.length - 1].x)}, ${Round(points[points.length - 1].z)})`);
      const users = model.steps.filter((step) => step.guidance?.route === sel.id).map((step) => step.id);
      lines.push(`用它做指引的步骤：${users.join(" / ") || "（无）"}`);
    } else if (sel.kind === "zone") {
      const zone = model.zones.find((entry) => entry.id === sel.id);
      if (zone) {
        lines.push(`区域类别 ${zone.kind}${zone.fact ? ` · 事实 ${zone.fact}` : ""}${zone.step ? ` · 步骤 ${zone.step}` : ""}`);
        if (Number.isFinite(zone.radiusM)) lines.push(`圆心 (${Round(zone.x)}, ${Round(zone.z)}) 半径 ${zone.radiusM} m`);
        else lines.push(`矩形 X ${Round(zone.minX)}..${Round(zone.maxX)} · Z ${Round(zone.minZ)}..${Round(zone.maxZ)}`);
        if (zone.fact && model.facts[zone.fact]) lines.push(`判法：${DescribeFact(model, zone.fact)}`);
      }
    } else if (sel.kind === "anchor") {
      const anchor = model.anchors[sel.id];
      if (anchor) lines.push(`锚点 ${sel.id} (${Round(anchor.x)}, ${Round(anchor.z)})`);
      const users = Object.values(model.facts).filter((fact) => fact.anchor === sel.id).map((fact) => fact.id);
      lines.push(`引用它的事实：${users.join(" / ") || "（无）"}`);
    } else if (sel.kind === "friendly") {
      const friendly = model.friendlies.find((entry) => entry.id === sel.id);
      if (friendly) lines.push(`友军点 ${friendly.kind} (${Round(friendly.x)}, ${Round(friendly.z)})`
        + `${friendly.step ? ` · 步骤 ${friendly.step}` : ""}`);
    } else if (sel.kind === "beat") {
      const beat = model.beats.find((entry) => entry.id === sel.id);
      if (beat) lines.push(`转运拍 ${beat.id}：装车 ${beat.loaded} 之后，窗口 ${beat.earliestS}–${beat.latestS} s，间隔 ${beat.restS} s`);
    } else if (sel.kind === "point") {
      lines.push(`地图上一点 (${Round(sel.x)}, ${Round(sel.z)})`);
    }
    if (owner?.facts?.length) lines.push(`相关事实：${owner.facts.join(" / ")}`);
    if (!lines.length) lines.push("（这个对象在模型里没有更多信息）");
    return lines;
  }

  RefreshRelatedNotes(sel) {
    const related = this.notes.filter((note) => note.target?.kind === sel.kind && note.target?.id === sel.id);
    this.ui.related.textContent = "";
    if (!related.length) { this.ui.related.textContent = "（暂无）"; return; }
    for (const note of related) this.ui.related.appendChild(this.NoteNode(note));
  }

  RefreshNotes() {
    if (!this.ui) return;
    const list = this.noteFilter === "all" ? this.notes : this.notes.filter((note) => note.status === this.noteFilter);
    for (const [value, button] of this.ui.filters) button.classList.toggle("on", value === this.noteFilter);
    this.ui.list.textContent = "";
    if (!list.length) { this.ui.list.textContent = "（暂无）"; return; }
    for (const note of list) this.ui.list.appendChild(this.NoteNode(note));
    this.map?.SetNotes(this.notes);
  }

  NoteNode(note) {
    const El = this.El;
    const box = this.doc.createElement("div");
    box.className = "note";
    box.dataset.note = note.id;
    box.dataset.noteStatus = note.status;
    const head = El("div", box, "", "h");
    El("code", head, note.id);
    El("span", head, `${KIND_TEXT[note.target?.kind] || note.target?.kind || "?"} ${note.target?.id ?? ""}`);
    El("span", head, `第 ${note.phaseNumber ?? "—"} 阶段${note.step ? ` · ${note.step}` : ""}`, "muted");
    if (this.localIds.has(note.id)) El("span", head, "本地草稿", "warn");
    if (note.verified) El("span", head, "已核对", "ok");
    El("div", box, note.text);
    if (note.proposal) El("div", box, `建议：${note.proposal.kind}`
      + `${note.proposal.to ? ` → (${Round(note.proposal.to.x)}, ${Round(note.proposal.to.z)})` : ""}`
      + `${Number.isFinite(note.proposal.seconds) ? ` ${note.proposal.seconds} s` : ""}`, "muted");
    if (note.sketch?.shapes?.length) El("div", box, `草图：${note.sketch.shapes.map(ShapeText).join("、")}`, "muted");
    const localImage = this.localImages.get(note.id) || null;
    if (note.image) {
      El("div", box, `图片：Notes/${note.level}/${note.image}`
        + `${localImage ? "（还在本地 IndexedDB，等下次能写盘时补传）" : ""}`, "muted");
      // 缩略图：本地草稿的图直接用 IndexedDB 里的 dataURL；已经进仓库的那张走
      // 绝对 URL —— 弹窗的文档是 about:blank，相对路径在这儿解不出来。
      const src = localImage || RepoImageUrl(note.level, note.image);
      if (src) {
        const img = this.doc.createElement("img");
        img.className = "thumb";
        img.dataset.noteThumb = note.id;
        img.alt = note.image;
        img.src = src;
        box.appendChild(img);
      }
    }
    if (note.resolution) El("div", box, `已处理：${note.resolution.summary}`
      + `${note.resolution.commit ? `（${note.resolution.commit}）` : ""}`, "ok");
    // 「原设置已变化」：拿现在的模型再拍一张快照逐字段对，新旧值并排列出来。
    let drift = null;
    try { drift = NoteDrift(note, this.model); } catch (error) { drift = null; }
    if (drift?.changed) {
      box.classList.add("drift");
      box.dataset.noteDrift = String(drift.diff.length);
      El("div", box, `⚠ 原设置已变化（${drift.diff.length} 处）`, "warn");
      const pre = El("pre", box, drift.diff.slice(0, 8)
        .map((row) => `${row.path || "(整体)"}: ${JSON.stringify(row.from)} → ${JSON.stringify(row.to)}`).join("\n"));
      pre.dataset.noteDriftDetail = note.id;
    }
    const bar = El("div", box, "", "bar");
    const locate = El("button", bar, "定位");
    locate.type = "button";
    locate.dataset.noteAction = "locate";
    locate.addEventListener("click", () => this.LocateNote(note.id));
    const verify = El("button", bar, note.verified ? "已核对" : "标记已核对");
    verify.type = "button";
    verify.dataset.noteAction = "verify";
    verify.addEventListener("click", () => this.MarkVerified(note.id));
    if (localImage) {
      const download = El("button", bar, "下载本图");
      download.type = "button";
      download.dataset.noteAction = "image";
      download.title = `另存 ${note.id}.png（这张还只在本地 IndexedDB 里）`;
      download.addEventListener("click", () => this.DownloadNoteImage(note.id));
    }
    return box;
  }
}

// ---------------------------------------------------------------------------
// 离线草稿的图片仓：IndexedDB（键 = 批注 id，值 = PNG dataURL）
//
// 为什么不进 localStorage：一张 1400×900 的 PNG dataURL 就是好几百 KB，
// localStorage 整个域也就 5 MB —— 存两三张就把**批注正文**一起挤掉了，
// 而批注正文才是绝对不能丢的东西。
// 全部读写都吞异常返回 null/[]：隐私模式下 indexedDB.open 直接抛。
// ---------------------------------------------------------------------------
const IMAGE_DB = "tengxian1938_orchestration";
const IMAGE_STORE = "images";
const IMAGE_BYTES_MAX = 1.5 * 1024 * 1024;        // 单张上限，与保存端点一致
const POST_BYTES_MAX = 7 * 1024 * 1024;           // 一次 POST 的图总量（端点 body 上限 8 MB）

function IsPngData(data) { return typeof data === "string" && data.startsWith("data:image/png;base64,"); }
function Oversize(data) { return !data || data.length * 0.75 > IMAGE_BYTES_MAX; }

function OpenImageDb(win) {
  return new Promise((resolve) => {
    let request = null;
    try { request = win?.indexedDB?.open(IMAGE_DB, 1); } catch (error) { request = null; }
    if (!request) { resolve(null); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/** 开一次事务，`work(store)` 里发请求，事务 complete 之后才 resolve。 */
function RunImageDb(win, mode, work) {
  return OpenImageDb(win).then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      let tx = null;
      try { tx = db.transaction(IMAGE_STORE, mode); } catch (error) { db.close(); resolve(null); return; }
      let out = null;
      try { out = work(tx.objectStore(IMAGE_STORE)); } catch (error) { out = null; }
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = () => { db.close(); resolve(null); };
      tx.onabort = () => { db.close(); resolve(null); };
    });
  }).catch(() => null);
}

function PutImage(win, id, dataUrl) {
  if (!id || !IsPngData(dataUrl)) return Promise.resolve(false);
  return RunImageDb(win, "readwrite", (store) => { store.put(dataUrl, id); return true; }).then((ok) => !!ok);
}

function DeleteImages(win, ids) {
  if (!ids?.length) return Promise.resolve(true);
  return RunImageDb(win, "readwrite", (store) => { for (const id of ids) store.delete(id); return true; })
    .then((ok) => !!ok);
}

function AllImages(win) {
  const box = { keys: [], values: [] };
  return RunImageDb(win, "readonly", (store) => {
    const keys = store.getAllKeys();
    const values = store.getAll();
    keys.onsuccess = () => { box.keys = keys.result || []; };
    values.onsuccess = () => { box.values = values.result || []; };
    return box;
  }).then((ok) => (ok
    ? box.keys.map((id, i) => ({ id: String(id), data: box.values[i] })).filter((row) => typeof row.data === "string")
    : []));
}

/** 按「一次 POST 的图总量」切批；一张图都没有也要发一次（notes.json 得落盘）。 */
function BatchImages(queue) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const one of queue) {
    if (current.length && size + one.data.length > POST_BYTES_MAX) { batches.push(current); current = []; size = 0; }
    current.push(one);
    size += one.data.length;
  }
  if (current.length) batches.push(current);
  if (!batches.length) batches.push([]);
  return batches;
}

/** 仓库里那张图的绝对地址：弹窗文档是 about:blank，相对路径在那儿解不出来。 */
function RepoImageUrl(level, name) {
  try { return new URL(`./Notes/${level}/${name}`, window.location.href).href; } catch (error) { return null; }
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
function ShapeText(shape) {
  if (!shape) return "?";
  if (shape.type === "circle") return `圈 r${Round(shape.r)}`;
  if (shape.type === "arrow") return "箭头";
  if (shape.type === "path") return `折线 ${shape.points?.length ?? 0} 点`;
  if (shape.type === "label") return `标注「${shape.text || ""}」`;
  if (shape.type === "ghost") return `候选位 ${shape.memberId || ""}`.trim();
  return shape.type;
}

function MarkerSeconds(entry) {
  // **只有真的有秒数的那几类才带秒数。** condition / entry / wake 由玩家行为触发，
  // 给它们编一个秒数就是把「设计的预定安排」和「实际发生」混成一锅。
  if (entry.kind === "timed") return Number.isFinite(entry.atS) ? entry.atS : entry.minimumSeconds;
  if (entry.kind === "delay") return entry.atS;
  if (entry.kind === "beat") return entry.earliestS;
  return undefined;
}

function MarkerTitle(entry) {
  const head = `${TIMELINE_TEXT[entry.kind] || entry.kind}｜${entry.step || "—"}`;
  if (entry.kind === "beat") return `${head}｜窗口 ${entry.earliestS}–${entry.latestS} s｜${entry.label}`;
  const seconds = MarkerSeconds(entry);
  return `${head}${Number.isFinite(seconds) ? `｜${seconds} s` : "｜无秒数（由玩家行为触发）"}｜${entry.label}`;
}

function MarkerSel(entry) {
  if (entry.factId) return { kind: "fact", id: entry.factId };
  if (entry.memberId) return { kind: "member", id: entry.memberId };
  if (entry.encounterId) return { kind: "encounter", id: entry.encounterId };
  if (entry.step) return { kind: "step", id: entry.step };
  return null;
}

/** live 变没变的廉价指纹：步骤、时钟（0.5 s 粒度）、玩家格点、敌人生死与位置。 */
function LiveSignature(live) {
  let hash = live.enemies.length;
  for (const enemy of live.enemies) {
    hash = (hash * 31 + (enemy.x | 0) * 7 + (enemy.z | 0) * 13 + (enemy.alive ? 1 : 0) + (enemy.dormant ? 2 : 0)) % 1000000007;
  }
  const player = live.player ? `${Math.round(live.player.x * 2)},${Math.round(live.player.z * 2)}` : "-";
  return `${live.stepId}|${Math.round((live.time || 0) * 2)}|${player}|${live.facts.size}|${hash}`;
}

export default OrchestrationEditor;
