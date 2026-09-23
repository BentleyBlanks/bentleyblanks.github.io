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

import {
  BuildOrchestrationModel, ApplyRuntimeState, DescribeFact, FindOwner, PhaseLayout,
} from "./Script_MissionOrchestration.mjs";
import { OrchestrationMap } from "./Script_EditorOrchestrationMap.mjs";
import {
  NewNoteId, ValidateNote, SnapshotTarget, NoteDrift, HandoffMarkdown,
  PROPOSAL_KINDS, NotesPathFor, TARGET_KIND_LABELS,
} from "./Script_MissionNotes.mjs";
import {
  DefaultFilterState, NormalizeFilterState, ApplyPreset as PresetState, ToggleFilterItem, SoloFilterItem,
  BuildOrchestrationFilter, FilterSummary, EnemyTableRows, EnemyTableCsv, SortEnemyRows, RowVisible,
  RouteNamesFor, PRESETS, ENEMY_TABLE_COLUMNS, EncounterLabel, RouteLabel,
  STATE_LABELS, FRIENDLY_LABELS, ZONE_LABELS, BAYONET_KEY,
} from "./Script_MissionOrchestrationFilter.mjs";
import { COMPANION_CAST } from "./Data_Companions.mjs";
import { T } from "./Script_Text.mjs";

const LEVEL = "FirstLevel";
const REFRESH_SECONDS = 0.25;
const STORAGE_KEY = `tengxian1938_orchestration_notes_${LEVEL}`;
const LAYOUT_KEY = `tengxian1938_orchestration_layout_${LEVEL}`;
const FILTER_KEY = `tengxian1938_orchestration_filter_${LEVEL}`;
// 图标登记表是 V1 那一包的东西，**可能还不在树上**：用字符串拼出来动态 import，
// 加载不到就退回彩色圆点。写成字面量的话模块图闸门会顺着它去读一个可能不存在的文件。
const ICON_MODULE = "Data_OrchestrationIcons.mjs";
const NOTES_URL = `./Notes/${LEVEL}/notes.json`;
const STATUS_URL = "/__notes/status";
const SAVE_URL = "/__notes/save";

// 14 层，与 OrchestrationMap.SetLayers 的键一一对应。
// 「图例」是画布左下角那块不透明的说明牌，会盖住地图，所以它必须有一个开关。
const LAYERS = [
  ["terrain", "地表"], ["blocks", "体块"], ["trenches", "壕沟"], ["roads", "道路"],
  ["anchors", "锚点"], ["routes", "路线"], ["zones", "触发区"], ["friendlies", "友军"],
  ["encounters", "敌军"], ["tactics", "战术线"], ["live", "实机"], ["notes", "批注"],
  ["labels", "名字"], ["legend", "图例"],
];
const TOOLS = [
  ["select", "选择"], ["pan", "平移"], ["circle", "圈选"], ["arrow", "箭头"],
  ["path", "折线"], ["label", "标注"], ["move", "候选位"],
];
// 工具的小图标：16×16 描边路径，跟着文字的颜色走（currentColor）。
// 纯字符当图标在这套窄体拉丁字里认不出来，画七条线反而最省事。
const TOOL_ICONS = {
  select: ["M3.5 2 L12.5 8.6 L8.2 9.3 L10.4 13.6 L8.6 14.4 L6.4 10.1 L3.5 12.9 Z"],
  pan: ["M8 1.6 L10.2 4.6 H5.8 Z", "M8 14.4 L5.8 11.4 H10.2 Z", "M1.6 8 L4.6 5.8 V10.2 Z", "M14.4 8 L11.4 10.2 V5.8 Z"],
  circle: ["M14 8 A6 6 0 1 1 2 8 A6 6 0 0 1 14 8 Z"],
  arrow: ["M2.6 13.4 L13 3", "M8.2 3 H13 V7.8"],
  path: ["M2 12.4 L6 6.4 L9.6 9.8 L14 3.4"],
  label: ["M2.6 4 V2.6 H13.4 V4", "M8 2.6 V13.4", "M5.6 13.4 H10.4"],
  move: ["M8 1.6 V4.8", "M8 11.2 V14.4", "M1.6 8 H4.8", "M11.2 8 H14.4", "M10.4 8 A2.4 2.4 0 1 1 5.6 8 A2.4 2.4 0 0 1 10.4 8 Z"],
};
const TOOL_HINT = {
  select: "点图上的东西看它是谁",
  pan: "按住拖动画面（右键随时可以拖）",
  circle: "圈出一片地方",
  arrow: "画一支箭头指方向",
  path: "画一条折线（可以当作建议的新路线）",
  label: "在图上写一句话",
  move: "把选中的敌人拖到你想要的位置（只是建议，不改关卡）",
};
// 「只看底图」留着的那几层：地形、房子、路、壕沟 —— 底图没有这些就认不出地方了。
const BASE_LAYERS = new Set(["terrain", "blocks", "roads", "trenches"]);
const SVG_NS = "http://www.w3.org/2000/svg";
const NOTE_STATUS_TEXT = { open: "待处理", resolved: "已处理", dismissed: "已忽略" };
const NOTE_FILTER_TEXT = { ...NOTE_STATUS_TEXT, all: "全部" };
const PROPOSAL_TEXT = {
  move: "挪位置", delay: "改延迟", retime: "改时间窗", reroute: "改路线", remove: "删掉", other: "其它",
};
// 类别的中文名走批注层那一份（TARGET_KIND_LABELS）：交接文本与这块面板必须叫同一个名字。
// 「批注」与「草图」不是批注目标，只在界面上出现，所以在这儿补。
const KIND_TEXT = { ...TARGET_KIND_LABELS, note: "批注", sketch: "草图" };
// 状态 / 友军 / 触发区这三张词表与分类面板共用一份（Script_MissionOrchestrationFilter）：
// 抄第二遍的下场是同一个状态在详情卡里叫「活跃」、在分类树里叫「在打」。
const STATE_TEXT = STATE_LABELS;
const SPAWN_TEXT = {
  step: "进入步骤时生成", fact: "事实满足时生成", threat: "按转运区威胁事实出现", opening: "由开场脚本生成",
};
const RELEASE_TEXT = { tacticNear: "玩家走到路线上的放行点附近才动" };
const ZONE_TEXT = ZONE_LABELS;
const FRIENDLY_TEXT = FRIENDLY_LABELS;
// 没有图标时行首那颗圆点的颜色（图标登记表在树上时优先用 PNG）。
const DOT_COLORS = {
  enemies: "#d6604a", friendlies: "#6fa8d6", zones: "#dfbd68", routes: "#7fd79a",
  anchors: "#a3aaa4", notes: "#c58fd0",
  pending: "rgba(214,217,209,.35)", spawned: "#b4553f", standby: "#c08a4a",
  dormant: "#7a6f8f", active: "#e0553c", cleared: "rgba(163,170,164,.45)",
  hold: "#d6a04a", mobile: "#d6604a",
};
// 分类树的四个小节（敌军底下）：默认摊开「按组」与「按状态」，另两节收着。
const FILTER_SECTIONS = [
  ["groups", "按组"], ["states", "按本阶段状态"], ["weapons", "按武器"], ["behaviors", "按行为"],
];
const CATEGORY_ICONS = {
  enemies: "Rifleman", friendlies: "FriendlySquad", zones: "Zone",
  routes: "Route", anchors: "Anchor", notes: "Note",
};
const WEAPON_ICONS = { Type11: "MachineGunner", Type38: "Rifleman", [BAYONET_KEY]: "Bayonet" };
const TIMELINE_GLYPH = {
  entry: "▸", condition: "◇", timed: "◆", threat: "■", delay: "·", wake: "✶",
  // 实际行的 ● 是「已经发生了」，正在等的那几件事用空心的 ○ —— 满足之后它自己
  // 就会变成实际行里那枚实心 ●，两个符号是同一件事的前后两态。
  stageEntry: "▸", fact: "●", waiting: "○",
};
const TIMELINE_TEXT = {
  entry: "进入", condition: "条件", timed: "定时", threat: "威胁", delay: "延迟", wake: "苏醒",
  stageEntry: "实际进入", fact: "实际满足", waiting: "正在等",
};

// 与 Style_Interface.css / Style_Editor.css 同一套语言：黑标题栏、冷灰底、旧金选中、
// 读数等宽。弹窗比游戏内面板宽松一档 —— 这是个桌面工具，不是贴在画面边上的抽屉。
// 字号只有四档（18 标题 / 15 栏标题 / 13 正文 / 12 次要 + 等宽读数），间距走 8 的倍数。
const POPUP_CSS = `
  :root {
    color-scheme: dark;
    --ok: #8fca7a; --bad: #d6604a;
    --design: #86c9dc; --actual: #7fd79a;
    --edge: rgba(214, 217, 209, .16);
    --edge-soft: rgba(214, 217, 209, .09);
    --fill: rgba(214, 217, 209, .05);
    --sunk: rgba(0, 0, 0, .22);
    --gold-soft: rgba(223, 189, 104, .14);
    --gold-line: rgba(223, 189, 104, .5);
  }
  * { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: rgba(214,217,209,.22) transparent; }
  html, body { height: 100%; }
  body { margin: 0; display: flex; flex-direction: column; overflow: hidden;
    background: var(--ui-surface, #101314); color: var(--ui-text, #d6d9d1);
    font: 13px/1.6 var(--ui-font, sans-serif); -webkit-font-smoothing: antialiased; }
  :focus-visible { outline: 1px solid var(--ui-gold, #dfbd68); outline-offset: 2px; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(214,217,209,.18); border: 2px solid transparent; background-clip: padding-box; }
  ::-webkit-scrollbar-thumb:hover { background: rgba(223,189,104,.45); background-clip: padding-box; }
  .mono { font-family: var(--ui-mono, Consolas, monospace); font-variant-numeric: tabular-nums; }
  .muted { color: var(--ui-muted, #a3aaa4); }
  .warn { color: var(--ui-gold, #dfbd68); }
  .ok { color: var(--ok); }
  .bad { color: var(--bad); }

  /* --- 标题栏 ------------------------------------------------------------ */
  header { flex: 0 0 auto; display: flex; align-items: center; gap: 16px;
    padding: 10px 16px; background: var(--ui-black, #030404);
    border-bottom: 1px solid var(--ui-line, #c4c6bb33); }
  h1 { margin: 0; font: 700 18px/1.3 var(--ui-font, sans-serif); letter-spacing: .04em; color: var(--ui-bright, #eeefec); }
  header .hTitle { display: flex; align-items: baseline; gap: 8px; flex: 0 0 auto; }
  header .hLevel { font-size: 13px; color: var(--ui-muted, #a3aaa4); }
  [data-orch="live-status"] { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  [data-orch="version"] { flex: 0 0 auto; font-size: 11px; color: rgba(163,170,164,.7); }
  .tag { display: inline-flex; align-items: baseline; gap: 6px; padding: 3px 8px; font-size: 12px;
    white-space: nowrap; border: 1px solid var(--edge); background: var(--fill); color: var(--ui-text, #d6d9d1); }
  .tag > b { font-weight: 600; color: var(--ui-bright, #eeefec); }
  .tag > code, .tag .num { font: 12px var(--ui-mono, Consolas, monospace); font-variant-numeric: tabular-nums; }
  .tag.lead { border: 0; background: none; padding: 3px 0; color: var(--ui-muted, #a3aaa4); }
  .tag.now { border-color: var(--gold-line); background: var(--gold-soft); color: var(--ui-gold, #dfbd68); }
  .tag.now > b { color: var(--ui-gold, #dfbd68); }
  .tag.wait { border-color: rgba(223,189,104,.3); color: var(--ui-gold, #dfbd68); cursor: pointer;
    max-width: 196px; overflow: hidden; text-overflow: ellipsis; display: inline-block; }
  .tag.wait:hover { background: var(--gold-soft); }
  .tag.idle { color: var(--ui-muted, #a3aaa4); border-style: dashed; }

  /* --- 三栏 -------------------------------------------------------------- */
  #cols { flex: 1 1 auto; min-height: 0; display: grid;
    grid-template-columns: var(--left, 344px) 5px minmax(360px, 1fr) 5px var(--right, 380px); }
  .col { min-height: 0; overflow: auto; }
  .col.map { overflow: visible; display: flex; flex-direction: column; padding: 8px; gap: 8px; position: relative; }
  .gutter { cursor: col-resize; background: var(--ui-black, #030404);
    border-left: 1px solid var(--ui-line, #c4c6bb33); border-right: 1px solid var(--ui-line, #c4c6bb33); }
  .gutter:hover, .gutter.drag { background: var(--gold-soft); }
  .colHead { position: sticky; top: 0; z-index: 3; display: flex; align-items: baseline; gap: 8px;
    padding: 12px 16px 8px; background: var(--ui-surface, #101314); border-bottom: 1px solid var(--ui-line, #c4c6bb33); }
  .colHead h2 { margin: 0; font: 700 15px/1.4 var(--ui-font, sans-serif); letter-spacing: .06em; color: var(--ui-bright, #eeefec); }
  .colHead .sub { font-size: 12px; color: var(--ui-muted, #a3aaa4); }
  .colHead .right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .sect { margin: 16px 16px 8px; font: 700 12px/1.4 var(--ui-font, sans-serif); letter-spacing: .08em;
    color: var(--ui-gold, #dfbd68); border-bottom: 1px solid var(--edge); padding-bottom: 6px; }
  .empty { margin: 8px 16px; padding: 10px 12px; font-size: 12px; line-height: 1.7;
    color: var(--ui-muted, #a3aaa4); border: 1px dashed var(--edge); background: rgba(0,0,0,.14); }

  /* --- 左栏：阶段分组 + 步骤卡 ------------------------------------------- */
  .phase { margin: 8px 16px; border: 1px solid var(--edge); background: rgba(0,0,0,.14); }
  .phaseHead { display: grid; grid-template-columns: 12px 22px minmax(0,1fr) auto auto; align-items: center;
    gap: 8px; width: 100%; padding: 8px; text-align: left; font: inherit; color: inherit;
    background: transparent; border: 0; border-bottom: 1px solid transparent; cursor: pointer; }
  .phaseHead:hover { background: var(--fill); }
  .phase[data-open="1"] > .phaseHead { border-bottom-color: var(--edge-soft); }
  .phase[data-open="0"] .phaseBody { display: none; }
  .phaseHead .tw { font-size: 10px; color: var(--ui-muted, #a3aaa4); transition: transform .12s linear; }
  .phase[data-open="0"] .tw { transform: rotate(-90deg); }
  .phaseNum { font: 600 12px var(--ui-mono, Consolas, monospace); color: var(--ui-muted, #a3aaa4); }
  .phaseName { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pState { font-size: 11px; padding: 1px 6px; white-space: nowrap;
    border: 1px solid var(--edge); color: var(--ui-muted, #a3aaa4); }
  .pState:empty { display: none; border: 0; padding: 0; }
  .phase[data-phase-state="done"] .phaseName { color: var(--ui-muted, #a3aaa4); }
  .phase[data-phase-state="done"] .pState { color: var(--ok); border-color: rgba(143,202,122,.35); }
  .phase[data-phase-state="now"] { border-color: var(--gold-line); }
  .phase[data-phase-state="now"] > .phaseHead { background: var(--gold-soft); }
  .phase[data-phase-state="now"] .phaseName, .phase[data-phase-state="now"] .phaseNum,
  .phase[data-phase-state="now"] .pState { color: var(--ui-gold, #dfbd68); }
  .phase[data-phase-state="now"] .pState { border-color: var(--gold-line); }
  button.mini { padding: 2px 8px; font: 11px/1.5 var(--ui-font, sans-serif); cursor: pointer;
    background: transparent; border: 1px solid var(--edge-soft); color: var(--ui-muted, #a3aaa4); }
  button.mini:hover { color: var(--ui-gold, #dfbd68); border-color: var(--gold-line); }
  .phaseBody { padding: 8px 8px 0; }
  .step { margin-bottom: 8px; padding: 8px; cursor: pointer;
    border: 1px solid var(--edge-soft); background: var(--sunk); }
  .step:hover { border-color: var(--edge); }
  .step.now { border-color: var(--gold-line); background: rgba(223,189,104,.07); }
  .step.sel { box-shadow: inset 3px 0 0 var(--ui-gold, #dfbd68); }
  /* 目标句子与步骤编号各占一格：挤在同一行里，编号会被句子夹在中间，读成一句话。 */
  .stepTop { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; align-items: baseline; }
  .stepObj { font-size: 13px; color: var(--ui-bright, #eeefec); }
  /* 编号加个框：不加框它会被读成目标句子的一部分（「掩护 Transfer 车辆分批出发」）。 */
  .stepId { padding: 0 5px; border: 1px solid var(--edge-soft); white-space: nowrap;
    font: 11px/1.5 var(--ui-mono, Consolas, monospace); color: rgba(163,170,164,.75); }
  .facts { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
  .fact { display: grid; grid-template-columns: 16px minmax(0,1fr); gap: 8px; align-items: start; cursor: pointer; }
  .fact:hover .factText { color: var(--ui-bright, #eeefec); }
  .fact > i { font-style: normal; width: 16px; height: 16px; border-radius: 50%; text-align: center;
    font-size: 10px; line-height: 14px; border: 1px solid var(--edge); color: var(--ui-muted, #a3aaa4); }
  .fact[data-fact-state="ok"] > i { color: var(--ok); border-color: rgba(143,202,122,.55); background: rgba(143,202,122,.12); }
  .fact[data-fact-state="wait"] > i { color: var(--ui-gold, #dfbd68); border-color: var(--gold-line); background: var(--gold-soft); }
  .fact[data-fact-state="past"] > i { color: rgba(143,202,122,.55); border-color: var(--edge-soft); }
  .fact[data-fact-state="future"] > i, .fact[data-fact-state="none"] > i { border-style: dashed; }
  .factText { font-size: 12px; color: var(--ui-text, #d6d9d1); }
  .factId { font: 11px var(--ui-mono, Consolas, monospace); color: rgba(163,170,164,.6); margin-left: 6px; }
  .stepMeta { margin-top: 6px; font-size: 12px; color: var(--ui-muted, #a3aaa4); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .chip { display: inline-flex; align-items: baseline; gap: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;
    border: 1px solid var(--edge); background: var(--fill); color: var(--ui-text, #d6d9d1); }
  .chip:hover { border-color: var(--gold-line); color: var(--ui-gold, #dfbd68); }
  .chip > code { font: 11px var(--ui-mono, Consolas, monospace); color: rgba(163,170,164,.8); }
  .chip:hover > code { color: inherit; }

  /* --- 中栏：工具条与阶段步进器 ------------------------------------------ */
  .bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .bar .spacer { flex: 1 1 auto; }
  .bar .sep { width: 1px; align-self: stretch; background: var(--edge); }
  .barLabel { font-size: 12px; color: var(--ui-muted, #a3aaa4); }
  .tchip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; font: 12px/1.4 var(--ui-font, sans-serif);
    cursor: pointer; background: rgba(0,0,0,.28); border: 1px solid var(--edge); color: var(--ui-text, #d6d9d1); }
  .tchip:hover { border-color: rgba(214,217,209,.4); color: var(--ui-bright, #eeefec); }
  .tchip.on { color: var(--ui-gold, #dfbd68); border-color: var(--ui-gold, #dfbd68);
    background: var(--ui-selection, rgba(223,189,104,.14)); }
  .tchip svg { flex: 0 0 auto; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: square; stroke-linejoin: miter; }
  .drop { position: relative; }
  .dropPanel { position: absolute; top: calc(100% + 6px); right: 0; z-index: 9; width: 300px; padding: 8px;
    display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px;
    background: var(--ui-panel, rgba(13,16,17,.98)); border: 1px solid var(--ui-line, #c4c6bb33);
    box-shadow: 0 10px 28px rgba(0,0,0,.65); }
  .dropPanel[hidden] { display: none; }
  .dropPanel .all { grid-column: 1 / -1; display: flex; gap: 8px; margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--edge-soft); }
  .lchip { position: relative; display: flex; align-items: center; gap: 8px; padding: 4px 6px; cursor: pointer;
    font-size: 12px; color: var(--ui-muted, #a3aaa4); border: 1px solid transparent; }
  .lchip:hover { background: var(--fill); }
  .lchip input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
  /* 勾选方块叫 .tick 不叫 .box：右栏的「草图 / 候选位」那两块空槽已经占了 .box，
     撞名的下场是这里每个勾都被撑成 30 px 高的金条。 */
  .lchip .tick { flex: 0 0 auto; width: 12px; height: 12px; border: 1px solid var(--edge); }
  .lchip.on { color: var(--ui-text, #d6d9d1); }
  .lchip.on .tick { background: var(--ui-gold, #dfbd68); border-color: var(--ui-gold, #dfbd68); }
  .lchip:has(input:focus-visible) { border-color: var(--ui-gold, #dfbd68); }
  .stepper { display: flex; align-items: center; gap: 8px; }
  .stepper .who { font-size: 13px; color: var(--ui-bright, #eeefec); white-space: nowrap; }
  .stepper .who .num { font: 600 13px var(--ui-mono, Consolas, monospace); font-variant-numeric: tabular-nums; }
  .track { position: relative; flex: 1 1 auto; min-width: 72px; height: 16px; cursor: pointer; }
  .track::before { content: ""; position: absolute; left: 0; right: 0; top: 7px; height: 2px; background: rgba(214,217,209,.16); }
  .track > i { position: absolute; left: 0; top: 7px; height: 2px; background: rgba(223,189,104,.55); }
  .track > b { position: absolute; top: 2px; width: 3px; height: 12px; background: var(--ui-gold, #dfbd68); }
  button.icon { width: 30px; height: 28px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
  /* --- 中栏左侧：分类抽屉（按类型看地图上的东西）------------------------- */
  .mapBody { flex: 1 1 auto; min-height: 0; display: flex; }
  .mapBody > .gutter { flex: 0 0 5px; }
  .mapBody > .gutter[hidden] { display: none; }
  [data-orch="filter-drawer"] { flex: 0 0 auto; width: var(--fw, 240px); min-height: 0;
    display: flex; flex-direction: column; border: 1px solid var(--edge); background: rgba(0,0,0,.28); }
  [data-orch="filter-drawer"][data-open="0"] { display: none; }
  .fHead { display: flex; align-items: center; gap: 6px; padding: 6px; border-bottom: 1px solid var(--edge-soft); }
  .fHead .spacer { flex: 1 1 auto; }
  .fTabs { display: inline-flex; border: 1px solid var(--edge); }
  .fTabs > button { border: 0; border-right: 1px solid var(--edge); background: transparent;
    color: var(--ui-muted, #a3aaa4); padding: 3px 9px; }
  .fTabs > button:last-child { border-right: 0; }
  .fTabs > button.on { color: var(--ui-gold, #dfbd68); background: var(--ui-selection, rgba(223,189,104,.14)); }
  .fPresets { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px; border-bottom: 1px solid var(--edge-soft); }
  .fPresets > button { padding: 3px 8px; font-size: 11px; }
  .fPresets > button.on { color: var(--ui-gold, #dfbd68); border-color: var(--gold-line); background: var(--gold-soft); }
  .fBody { flex: 1 1 auto; min-height: 0; overflow: auto; }
  [data-orch="filter-drawer"][data-tab="tree"] [data-orch="enemy-table"],
  [data-orch="filter-drawer"][data-tab="table"] [data-orch="filter-tree"] { display: none; }
  /* 小节标题贴顶：二十一组摊开之后，滚到一半得还看得见自己在看哪一节。 */
  .fSect { position: sticky; top: 0; z-index: 1;
    display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 8px; text-align: left;
    font: 700 11px/1.5 var(--ui-font, sans-serif); letter-spacing: .06em; color: var(--ui-gold, #dfbd68);
    background: #14181a; border: 0; border-top: 1px solid var(--edge-soft);
    box-shadow: inset 0 0 0 100px rgba(223,189,104,.06); cursor: pointer; }
  .fSect:hover { box-shadow: inset 0 0 0 100px rgba(223,189,104,.14); }
  .fSect .tw { font-size: 9px; color: var(--ui-muted, #a3aaa4); }
  .fSect .fNum { margin-left: auto; }
  .fRow { display: grid; grid-template-columns: 18px 16px minmax(0,1fr) auto auto; align-items: center;
    gap: 6px; padding: 3px 8px; }
  .fRow:hover { background: var(--fill); }
  .fRow[data-on="0"] .fName { color: rgba(163,170,164,.45); text-decoration: line-through; }
  .fRow[data-solo="1"] { background: var(--gold-soft); box-shadow: inset 2px 0 0 var(--ui-gold, #dfbd68); }
  .fRow.cat { padding: 5px 8px; border-top: 1px solid var(--edge); }
  .fRow.cat .fName { font-weight: 700; font-size: 13px; color: var(--ui-bright, #eeefec); }
  .fRow .who { min-width: 0; display: flex; flex-direction: column; }
  .fName { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fSub { font-size: 10px; color: rgba(163,170,164,.7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fSub code { font: 10px var(--ui-mono, Consolas, monospace); }
  .fNum { font: 11px var(--ui-mono, Consolas, monospace); font-variant-numeric: tabular-nums;
    color: var(--ui-muted, #a3aaa4); white-space: nowrap; }
  .fRow[data-dim="1"] .fNum { color: rgba(163,170,164,.4); }
  button.fEye { width: 18px; height: 18px; padding: 0; display: inline-flex; align-items: center;
    justify-content: center; font-size: 10px; line-height: 1; background: transparent;
    border: 1px solid var(--edge); color: rgba(163,170,164,.5); }
  .fRow[data-on="1"] button.fEye { color: var(--ui-gold, #dfbd68); border-color: var(--gold-line); background: var(--gold-soft); }
  button.fSolo { padding: 1px 6px; font-size: 10px; background: transparent;
    border: 1px solid var(--edge-soft); color: var(--ui-muted, #a3aaa4); }
  button.fSolo:hover { color: var(--ui-gold, #dfbd68); border-color: var(--gold-line); }
  .fRow[data-solo="1"] button.fSolo { color: var(--ui-gold, #dfbd68); border-color: var(--gold-line); background: var(--gold-soft); }
  .fIcon { width: 16px; height: 16px; object-fit: contain; opacity: .85; }
  .fDot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; justify-self: center; }
  .fEmpty { padding: 8px; font-size: 11px; color: rgba(163,170,164,.7); }
  .fBar { display: flex; align-items: center; gap: 6px; padding: 6px; font-size: 11px;
    color: var(--ui-muted, #a3aaa4); border-bottom: 1px solid var(--edge-soft); }
  .fBar .spacer { flex: 1 1 auto; }
  table.enemies { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.enemies th { position: sticky; top: 0; z-index: 2; padding: 4px 6px; text-align: left; white-space: nowrap;
    cursor: pointer; background: var(--ui-black, #030404); color: var(--ui-muted, #a3aaa4);
    border-bottom: 1px solid var(--edge); }
  table.enemies th:hover { color: var(--ui-text, #d6d9d1); }
  table.enemies th.sorted { color: var(--ui-gold, #dfbd68); }
  table.enemies td { max-width: 190px; padding: 3px 6px; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; border-bottom: 1px solid var(--edge-soft); }
  table.enemies td.num { font: 11px var(--ui-mono, Consolas, monospace); font-variant-numeric: tabular-nums; }
  table.enemies td.who { display: flex; align-items: center; gap: 6px; }
  table.enemies tr.grp > td { cursor: pointer; background: var(--fill); color: var(--ui-gold, #dfbd68); }
  table.enemies tr[data-table-row] { cursor: pointer; }
  table.enemies tr[data-table-row]:hover > td { background: rgba(223,189,104,.08); }
  table.enemies tr[data-table-row].sel > td { background: var(--gold-soft); color: var(--ui-bright, #eeefec); }
  table.enemies tr[data-table-row][data-alive="0"] .liveCell { color: var(--bad); }
  table.enemies tr[data-table-row][data-alive="1"] .liveCell { color: var(--ok); }

  #canvasWrap { flex: 1 1 auto; min-width: 0; min-height: 0; position: relative; border: 1px solid var(--edge); }
  canvas { display: block; width: 100%; height: 100%; background: #181a19; }
  /* 标注工具的就地输入框：长在点下去的那个位置上，不弹 prompt（prompt 会把
     整个页面卡住，还没法在无头测试里输字）。 */
  .labelInput { position: absolute; width: 200px; z-index: 9; padding: 3px 8px; font-size: 12px;
    background: var(--ui-black, #030404); border: 1px solid var(--ui-gold, #dfbd68); color: var(--ui-text, #d6d9d1); }

  /* --- 通用控件 ---------------------------------------------------------- */
  button { font: 12px/1.5 var(--ui-font, sans-serif); color: var(--ui-text, #d6d9d1);
    background: #151919; border: 1px solid var(--edge); border-radius: 0; padding: 5px 10px; cursor: pointer; }
  button:hover { background: var(--ui-selection, rgba(223,189,104,.12)); color: var(--ui-gold, #dfbd68); }
  button.primary { font-weight: 700; color: #17140c; background: var(--ui-gold, #dfbd68); border-color: var(--ui-gold, #dfbd68); }
  button.primary:hover { color: #17140c; background: #ecd390; }
  button.ghost { background: transparent; color: var(--ui-muted, #a3aaa4); }
  button.ghost:hover { color: var(--ui-gold, #dfbd68); }
  button[disabled] { opacity: .45; cursor: default; }
  input, textarea, select { width: 100%; font: 13px/1.6 var(--ui-font, sans-serif); color: var(--ui-text, #d6d9d1);
    background-color: rgba(0,0,0,.45); border: 1px solid var(--edge); border-radius: 0; padding: 6px 8px; }
  input:focus, textarea:focus, select:focus { outline: none; border-color: var(--ui-gold, #dfbd68); }
  input:disabled { color: rgba(163,170,164,.45); background-color: rgba(0,0,0,.25); }
  textarea { resize: vertical; min-height: 68px; }
  select { appearance: none; -webkit-appearance: none; padding-right: 26px; cursor: pointer;
    background-image: linear-gradient(45deg, transparent 50%, var(--ui-muted, #a3aaa4) 50%),
      linear-gradient(135deg, var(--ui-muted, #a3aaa4) 50%, transparent 50%);
    background-position: calc(100% - 15px) 14px, calc(100% - 10px) 14px;
    background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
  select option { background: var(--ui-surface, #101314); }
  .seg { display: inline-flex; border: 1px solid var(--edge); }
  .seg > button { border: 0; border-right: 1px solid var(--edge); background: transparent;
    color: var(--ui-muted, #a3aaa4); padding: 5px 10px; }
  .seg > button:last-child { border-right: 0; }
  .seg > button:hover { background: var(--fill); color: var(--ui-text, #d6d9d1); }
  .seg > button.on { color: var(--ui-gold, #dfbd68); background: var(--ui-selection, rgba(223,189,104,.14)); }

  /* --- 右栏：详情卡 / 批注卡 / 表单 -------------------------------------- */
  .card { margin: 8px 16px; border: 1px solid var(--edge); background: var(--sunk); }
  .cardHead { display: flex; align-items: center; gap: 8px; padding: 8px;
    background: var(--fill); border-bottom: 1px solid var(--edge-soft); }
  .cardHead b { font-size: 14px; color: var(--ui-bright, #eeefec); word-break: break-all; }
  .cardHead code { margin-left: 6px; font: 11px var(--ui-mono, Consolas, monospace); color: rgba(163,170,164,.75); }
  .kindTag { flex: 0 0 auto; font-size: 11px; padding: 1px 6px; color: var(--ui-gold, #dfbd68); border: 1px solid var(--gold-line); }
  .cardBody { padding: 8px; }
  .cardBody:empty { display: none; }
  .kv { display: grid; grid-template-columns: 76px minmax(0,1fr); gap: 8px; padding: 3px 0; font-size: 12px; }
  .kv > .k { color: var(--ui-muted, #a3aaa4); }
  .kv > .v { color: var(--ui-text, #d6d9d1); word-break: break-word; }
  .kv > .v code { font: 11px var(--ui-mono, Consolas, monospace); color: rgba(163,170,164,.8); margin-left: 6px; }
  .kv > .v .num { font-family: var(--ui-mono, Consolas, monospace); font-variant-numeric: tabular-nums; }
  details.fold { margin: 8px; }
  details.fold > summary { cursor: pointer; list-style-position: inside; padding: 4px 8px; font-size: 12px;
    color: var(--ui-muted, #a3aaa4); border: 1px solid var(--edge-soft); background: var(--fill); }
  details.fold > summary:hover { color: var(--ui-text, #d6d9d1); }
  details.fold[open] > summary { color: var(--ui-gold, #dfbd68); border-color: rgba(223,189,104,.38); }
  pre { margin: 8px 0 0; max-height: 220px; overflow: auto; font: 11px/1.5 var(--ui-mono, Consolas, monospace);
    background: rgba(0,0,0,.35); border: 1px solid var(--edge-soft); padding: 8px; white-space: pre-wrap; word-break: break-all; }
  .note { margin: 0 16px 8px; padding: 8px; border: 1px solid var(--edge); background: var(--sunk); }
  .note .h { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .note .h .who { font-size: 12px; color: var(--ui-text, #d6d9d1); }
  .note .txt { margin: 6px 0; font-size: 13px; color: var(--ui-bright, #eeefec); }
  .note .line { font-size: 12px; color: var(--ui-muted, #a3aaa4); }
  .note code { font: 11px var(--ui-mono, Consolas, monospace); color: rgba(163,170,164,.7); }
  .note .bar { margin-top: 8px; }
  .noteId { margin-top: 6px; word-break: break-all;
    font: 11px var(--ui-mono, Consolas, monospace); color: rgba(163,170,164,.5); }
  .st { font-size: 11px; padding: 1px 6px; white-space: nowrap; border: 1px solid var(--edge); color: var(--ui-muted, #a3aaa4); }
  .st.open { color: var(--ui-gold, #dfbd68); border-color: var(--gold-line); background: var(--gold-soft); }
  .st.resolved { color: var(--ok); border-color: rgba(143,202,122,.4); }
  .st.dismissed { color: var(--ui-muted, #a3aaa4); border-style: dashed; }
  .alert { margin-top: 8px; padding: 6px 8px; font-size: 12px;
    border: 1px solid rgba(214,96,74,.55); border-left-width: 3px; background: rgba(214,96,74,.1); color: #e8a893; }
  .alert .ah { font-weight: 700; }
  .alert .d { display: grid; grid-template-columns: minmax(0,1fr) auto auto auto; gap: 2px 6px;
    margin-top: 4px; font: 11px var(--ui-mono, Consolas, monospace); color: var(--ui-text, #d6d9d1); }
  .alert .d > .p { color: rgba(163,170,164,.85); overflow: hidden; text-overflow: ellipsis; }
  .alert .d > .from { color: rgba(163,170,164,.85); text-decoration: line-through; }
  .alert .d > .to { color: var(--ui-bright, #eeefec); }
  .note.drift { border-color: rgba(214,96,74,.45); }
  img.thumb { display: block; width: 100%; max-height: 132px; object-fit: cover; object-position: center top;
    margin-top: 8px; border: 1px solid var(--edge); }
  /* 右栏两个页签：「详情」看选中的东西，「批注」看攒了哪些意见。
     写批注的表单搬到了浮在图上的对话框里 —— 它要跟着图走，不该占住右栏。 */
  .dTabs { display: inline-flex; border: 1px solid var(--edge); margin-left: auto; }
  .dTabs > button { border: 0; border-right: 1px solid var(--edge); background: transparent;
    color: var(--ui-muted, #a3aaa4); padding: 4px 12px; }
  .dTabs > button:last-child { border-right: 0; }
  .dTabs > button[data-on="1"] { color: var(--ui-gold, #dfbd68); background: var(--ui-selection, rgba(223,189,104,.14)); }
  [data-detail-panel][data-on="0"] { display: none; }
  [data-notes="hint"] { margin: 8px 16px; padding: 6px 8px; font-size: 12px; word-break: break-word;
    border-left: 3px solid var(--edge); background: rgba(0,0,0,.25); color: var(--ui-muted, #a3aaa4); }
  [data-notes="hint"]:empty { display: none; }

  /* --- 批注对话框（浮在俯视图右下角，标题栏可拖）-------------------------- */
  [data-orch="note-dialog"] { position: absolute; right: 16px; bottom: 16px; z-index: 12; width: 352px;
    max-height: calc(100% - 32px); display: flex; flex-direction: column;
    background: var(--ui-panel, rgba(13,16,17,.98)); border: 1px solid var(--gold-line);
    box-shadow: 0 12px 32px rgba(0,0,0,.7); }
  [data-orch="note-dialog"][data-open="0"] { display: none; }
  .ndHead { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: move;
    background: var(--ui-black, #030404); border-bottom: 1px solid var(--edge); }
  .ndHead h3 { margin: 0; font: 700 13px/1.5 var(--ui-font, sans-serif); letter-spacing: .06em;
    color: var(--ui-gold, #dfbd68); }
  .ndHead .spacer { flex: 1 1 auto; }
  .ndBody { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px; }
  .ndBody .field { margin-bottom: 8px; }
  .ndBody textarea { min-height: 56px; }
  .ndRow { display: grid; grid-template-columns: minmax(0,1.4fr) minmax(0,1fr); gap: 8px; }
  .mentions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: 4px; }
  .mentions .chip.on { color: var(--ui-gold, #dfbd68); border-color: var(--gold-line); background: var(--gold-soft); }
  .mentions button { padding: 2px 8px; font-size: 11px; }
  .mentions button.armed { color: var(--ui-gold, #dfbd68); border-color: var(--ui-gold, #dfbd68);
    background: var(--ui-selection, rgba(223,189,104,.14)); }

  .form { padding: 0 16px 16px; }
  .field { margin-bottom: 8px; }
  .field > label { display: block; margin-bottom: 4px; font-size: 12px; color: var(--ui-muted, #a3aaa4); }
  .field .hint { font-size: 11px; color: rgba(163,170,164,.7); }
  .field .row2 { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); gap: 8px; }
  .box { min-height: 30px; padding: 5px 8px; font-size: 12px; color: var(--ui-muted, #a3aaa4);
    border: 1px dashed var(--edge); background: rgba(0,0,0,.2); }
  .box.filled { border-style: solid; color: var(--ui-text, #d6d9d1); }
  .statusBar { margin-top: 8px; padding: 6px 8px; font-size: 12px; word-break: break-word;
    border-left: 3px solid var(--edge); background: rgba(0,0,0,.25); color: var(--ui-muted, #a3aaa4); }
  .statusBar:empty { display: none; }
  .statusBar.ok { border-left-color: var(--ok); color: var(--ok); }
  .statusBar.warn { border-left-color: var(--ui-gold, #dfbd68); color: var(--ui-gold, #dfbd68); }

  /* --- 时间轴 ------------------------------------------------------------ */
  #tl { flex: 0 0 auto; display: flex; flex-direction: column;
    background: var(--ui-black, #030404); border-top: 1px solid var(--ui-line, #c4c6bb33); }
  #tl[data-collapsed="1"] .tlBody { display: none; }
  .tlHead { display: flex; align-items: center; gap: 12px; padding: 6px 16px; }
  .tlHead h2 { margin: 0; font: 700 13px/1.5 var(--ui-font, sans-serif); letter-spacing: .06em; color: var(--ui-bright, #eeefec); }
  .tlHead .sub { font-size: 12px; color: var(--ui-muted, #a3aaa4); }
  .legend { margin-left: auto; display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--ui-muted, #a3aaa4); }
  .legend i { font-style: normal; margin-right: 5px; }
  .legend .d { color: var(--design); }
  .legend .c { color: var(--ui-gold, #dfbd68); }
  .legend .a { color: var(--actual); }
  /* 184 而不是 168：「实际」那行的名字底下多了三条读数，168 时最后一行会被切掉半个字。 */
  .tlBody { display: flex; height: 184px; min-height: 0; }
  /* 152 而不是 92：关卡时钟 / 这一步用时 / 当前步骤三条读数从顶栏搬到了「实际」
     这一行的名字底下，92 px 装不下，会溢出到泳道外面。 */
  .tlNames { flex: 0 0 152px; display: flex; flex-direction: column; border-right: 1px solid var(--ui-line, #c4c6bb33); }
  .tlNames > .sp { flex: 0 0 22px; }
  .tlNames > .n { flex: 1 1 0; min-height: 0; overflow: hidden;
    display: flex; flex-direction: column; justify-content: center; gap: 2px;
    padding: 0 8px; font-size: 12px; line-height: 1.35; }
  .tlNames > .n .muted { line-height: 1.5; }
  .tlNames > .n.design { color: var(--design); }
  .tlNames > .n.actual { color: var(--actual); }
  .tlScroll { flex: 1 1 auto; overflow-x: auto; overflow-y: hidden; }
  .tlGrid { display: flex; flex-direction: column; height: 100%; min-width: 1180px; }
  .tlHeadRow { display: flex; flex: 0 0 22px; }
  .tlRow { display: flex; flex: 1 1 0; min-height: 0; }
  .tlCell { border-left: 1px solid var(--edge-soft); padding: 3px 4px 0; font-size: 11px;
    color: var(--ui-muted, #a3aaa4); white-space: nowrap; overflow: hidden; cursor: pointer; }
  .tlCell .num { font-family: var(--ui-mono, Consolas, monospace); }
  .tlCell:hover { color: var(--ui-text, #d6d9d1); }
  .tlLane { border-left: 1px solid var(--edge-soft); padding: 2px 3px; overflow-y: auto; line-height: 1.3; }
  .tlCell.now, .tlLane.now { background: rgba(223,189,104,.1); }
  .tlCell.now { color: var(--ui-gold, #dfbd68); }
  .tlMark { display: inline-block; padding: 0 2px; cursor: pointer; font-size: 12px; }
  [data-timeline="design"] .tlMark { color: var(--design); }
  [data-timeline="design"] .tlMark[data-marker-kind="condition"] { color: var(--ui-gold, #dfbd68); }
  [data-timeline="actual"] .tlMark { color: var(--actual); }
  /* 正在等的那几件事画成空心的：它还没发生，不能和实际行那些实心 ● 混成一样。 */
  [data-timeline="actual"] .tlMark[data-marker-kind="waiting"] { color: var(--ui-gold, #dfbd68); }
  .tlMark:hover { background: rgba(255,255,255,.16); color: var(--ui-bright, #eeefec); }
  .tlEmpty { padding: 4px 8px; font-size: 11px; color: rgba(163,170,164,.7); }
  .tip { position: fixed; z-index: 40; max-width: 320px; padding: 6px 8px; font-size: 12px; line-height: 1.6;
    pointer-events: none; background: var(--ui-black, #030404); border: 1px solid var(--gold-line); color: var(--ui-text, #d6d9d1);
    box-shadow: 0 6px 18px rgba(0,0,0,.6); }
  .tip[hidden] { display: none; }
  .tip b { color: var(--ui-gold, #dfbd68); }
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
    // 一条批注的草稿。`state` 是「哪个阶段 · 哪个状态」那个下拉框选中的东西
    // （`{kind:"phase"|"step"|"fact", id}`），它决定这条批注的阶段 / 步骤 / 事实时刻；
    // `mentions` 是 @ 出来的那几个对象 —— 与 target 分开，一条意见常常要指到好几个东西。
    this.draft = NewDraft();
    this.statusText = "";
    this.noteDrag = null;                // 正在拖批注对话框的标题栏
    this.headerSignature = "";
    this.waitSignature = "";             // 时间轴上「正在等」那几枚标记的指纹
    this.shownPhase = 0;                 // 左栏自动展开/滚动过的那一阶段
    this.layout = ReadLayout();          // 三栏宽度与时间轴折叠状态（记在 localStorage）
    this.drag = null;                    // 正在拖的那条分栏线
    // --- 分类查看（V2）----------------------------------------------------
    this.filterState = DefaultFilterState();
    this.filter = null;                  // 折出来的那几个集合（null = 全画），测试读它
    this.filterSummary = null;           // 分类树用的那份数据
    this.filterLayout = ReadFilterLayout();   // 抽屉开合、两个页签各自的宽度、小节折叠
    this.filterSignature = "";           // 树只在真的变了才重建
    this.tableSignature = "";
    this.hoverSel = null;                // 鼠标划过某一行时临时描亮的那个对象
    this.tableSort = { column: "group", ascending: true };
    this.tableCollapsed = new Set();     // 布设表里收起来的组
    this.tableRows = [];
    this.tableLiveCells = new Map();
    this.icons = null;                   // 图标登记表（V1 的 Data_OrchestrationIcons），没有就画圆点
    this.iconsTried = false;
    this.phaseLayoutCache = null;
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
      // Ctrl（Mac 上 Meta）+ 点 = 「提及这个东西」，选中**不变**。俯视图那一侧实现，
      // 还没接上时这里就是个空操作：面板照开，只是少一条快捷路。
      this.map.onMention?.((sel) => this.AddMention(sel));
      this.SetPhase(this.phaseNumber);
      this.OpenPhase(this.phaseNumber);        // 开窗先摊开第一阶段，别让左栏是一排关着的抽屉
      this.SetTool("select");
      this.ApplyFilter({ rebuild: true });
      this.LoadIcons();
      this.SetNoteState(this.DefaultNoteState());
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
    // 顶栏与时间轴上那几枚「正在等」都是「指纹没变就不重画」的：
    // 不清掉，同一个实例再开一次窗会得到一条空的状态行与一排空泳道。
    this.headerSignature = "";
    this.waitSignature = "";
    this.noteDrag = null;
    this.shownPhase = 0;
    this.filterSignature = "";
    this.tableSignature = "";
    this.tableLiveCells = new Map();
    this.phaseLayoutCache = null;
    this.hoverSel = null;
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
        squad: SquadState(runtime),
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
    const Button = (parent, text, onClick, data = {}, cls = "") => {
      const node = El("button", parent, text, cls);
      node.type = "button";
      for (const [key, value] of Object.entries(data)) node.dataset[key] = value;
      node.addEventListener("click", onClick);
      return node;
    };
    this.El = El;
    this.Button = Button;

    const header = El("header", doc.body);
    header.dataset.orch = "header";
    const title = El("div", header, "", "hTitle");
    El("h1", title, "关卡编排");
    El("span", title, "第一关《往南的路》", "hLevel");
    const liveStatus = El("div", header);
    liveStatus.dataset.orch = "live-status";
    const version = El("div", header, `模型 ${this.model.version}`);
    version.dataset.orch = "version";
    version.title = "这份界面读的就是游戏在跑的那份编排数据，版本号来自模型本身";

    const cols = El("div", doc.body);
    cols.id = "cols";
    const flow = El("div", cols, "", "col flow");
    flow.dataset.orch = "flow";
    const leftGrip = El("div", cols, "", "gutter");
    leftGrip.dataset.orch = "split-left";
    const map = El("div", cols, "", "col map");
    map.dataset.orch = "map";
    const rightGrip = El("div", cols, "", "gutter");
    rightGrip.dataset.orch = "split-right";
    const detail = El("div", cols, "", "col detail");
    detail.dataset.orch = "detail";
    const timeline = El("div", doc.body);
    timeline.id = "tl";
    timeline.dataset.orch = "timeline";
    const tip = El("div", doc.body, "", "tip");
    tip.dataset.orch = "tip";
    tip.hidden = true;

    this.ui = { cols, liveStatus, flow, map, detail, timeline, tip };
    this.BuildFlow(El, Button, flow);
    this.BuildMapColumn(El, Button, map);
    this.BuildDetail(El, Button, detail);
    this.BuildTimeline(El, Button, timeline);
    this.BindSplitters(leftGrip, rightGrip);
    this.BindKeys();
    this.SetDetailTab(this.layout.detailTab);
    this.ApplyLayout();
  }

  /**
   * 窗口级键盘：Esc 收起批注对话框（草稿不清），Delete / Backspace 删掉选中的那一笔草图。
   * **只在焦点不在输入控件上时**才接管 —— 在 textarea 里按 Backspace 当然是删字，
   * 顺手把用户画的圈删掉是这类快捷键最经典的事故。
   */
  BindKeys() {
    this.doc.addEventListener("keydown", (event) => {
      if (Typing(event.target)) return;
      if (event.key === "Escape") {
        if (this.ui?.noteDialog?.dataset.open !== "1") return;
        event.preventDefault();
        this.OpenNoteDialog(false);
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (this.selection?.kind !== "sketch") return;
      event.preventDefault();
      this.RemoveShape(this.selection.index);
    });
  }

  // ------------------------------------------------------------- 分栏与提示
  /** 三栏宽度可拖；拖完记进 localStorage，下次开窗还是这个宽度。 */
  BindSplitters(leftGrip, rightGrip) {
    const doc = this.doc;
    const Start = (side) => (event) => {
      event.preventDefault();
      this.drag = { side, x: event.clientX, left: this.layout.left, right: this.layout.right };
      (side === "left" ? leftGrip : rightGrip).classList.add("drag");
      doc.body.style.cursor = "col-resize";
    };
    leftGrip.addEventListener("mousedown", Start("left"));
    rightGrip.addEventListener("mousedown", Start("right"));
    doc.addEventListener("mousemove", (event) => {
      if (!this.drag) return;
      const delta = event.clientX - this.drag.x;
      // 分类抽屉那条把手也走这套（它在中栏里边，拖的是抽屉自己的宽度）。
      if (this.drag.side === "filter") { this.ApplyFilterWidth(this.drag.width + delta); return; }
      if (this.drag.side === "left") this.layout.left = this.drag.left + delta;
      else this.layout.right = this.drag.right - delta;
      this.ApplyLayout();
    });
    doc.addEventListener("mouseup", () => {
      if (!this.drag) return;
      const side = this.drag.side;
      this.drag = null;
      leftGrip.classList.remove("drag");
      rightGrip.classList.remove("drag");
      this.ui?.filterGrip?.classList.remove("drag");
      doc.body.style.cursor = "";
      if (side === "filter") WriteFilterLayout(this.filterLayout);
      else WriteLayout(this.layout);
      this.SyncCanvasSize(true);
    });
  }

  ApplyLayout() {
    const width = this.win?.innerWidth || 1380;
    // 中间那栏至少 360 —— 俯视图缩到比它还窄就没法看了。
    const left = Math.round(Math.min(Math.max(this.layout.left, 260), Math.max(280, width - 360 - 300)));
    const right = Math.round(Math.min(Math.max(this.layout.right, 280), Math.max(300, width - 360 - left)));
    this.layout.left = left;
    this.layout.right = right;
    this.ui.cols.style.setProperty("--left", `${left}px`);
    this.ui.cols.style.setProperty("--right", `${right}px`);
  }

  /** 时间轴标记的悬停提示：自己画一个，native title 要等一秒才出、还压不住样式。 */
  ShowTip(node, html) {
    const tip = this.ui?.tip;
    if (!tip || !html) return;
    tip.textContent = "";
    for (const line of html) {
      const row = this.El("div", tip, "");
      if (line.k) this.El("b", row, `${line.k} `);
      this.El("span", row, line.v);
    }
    tip.hidden = false;
    const box = node.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    const x = Math.max(8, Math.min(box.left, (this.win.innerWidth || 1380) - size.width - 8));
    const y = box.top - size.height - 6;
    tip.style.left = `${Math.round(x)}px`;
    tip.style.top = `${Math.round(y < 8 ? box.bottom + 6 : y)}px`;
  }

  HideTip() { if (this.ui?.tip) this.ui.tip.hidden = true; }

  // ------------------------------------------------------------------ 流程
  BuildFlow(El, Button, root) {
    const head = El("div", root, "", "colHead");
    El("h2", head, "流程");
    El("span", head, `${this.model.phases.length} 个阶段 · ${this.model.steps.length} 个步骤`, "sub");
    const hint = El("div", root, "", "empty");
    hint.dataset.orch = "flow-hint";

    this.ui.phases = new Map();
    this.ui.steps = new Map();
    this.ui.facts = [];
    this.ui.flowHint = hint;
    for (const phase of this.model.phases) {
      const box = El("div", root, "", "phase");
      box.dataset.flowPhase = String(phase.number);
      box.dataset.open = "0";
      box.dataset.phaseState = "";
      const bar = El("div", box, "", "phaseHead");
      bar.setAttribute("role", "button");
      bar.tabIndex = 0;
      El("span", bar, "▾", "tw");
      El("span", bar, String(phase.number).padStart(2, "0"), "phaseNum");
      const name = El("span", bar, phase.title, "phaseName");
      name.title = `${phase.title}（第 ${phase.number} 阶段，内部编号 ${phase.id}）`;
      El("span", bar, "", "pState");
      const Toggle = () => {
        const open = box.dataset.open !== "1";
        box.dataset.open = open ? "1" : "0";
        if (open) this.Select({ kind: "phase", id: phase.id });
      };
      bar.addEventListener("click", Toggle);
      bar.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        Toggle();
      });
      const jump = Button(bar, "从这里试玩", (event) => {
        event.stopPropagation();
        this.Jump(phase.number);
      }, { jump: String(phase.number) }, "mini");
      jump.title = `直接从第 ${phase.number} 阶段开打（Debug.FirstLevelJump(${phase.number})）`;
      const body = El("div", box, "", "phaseBody");
      for (const stepId of phase.steps) {
        const step = this.model.steps.find((entry) => entry.id === stepId);
        if (step) this.BuildStepCard(El, body, step);
      }
      this.ui.phases.set(phase.number, box);
    }
    // 27 个内部步骤里有一个（Complete）不属于任何公开阶段 —— 它是「关卡结束」。
    // 不画的话树上就只有 26 条，用户会以为自己看漏了一步。
    const orphans = this.model.steps.filter((step) => !this.ui.steps.has(step.id));
    if (orphans.length) {
      const box = El("div", root, "", "phase");
      box.dataset.flowOrphan = "1";
      box.dataset.open = "1";
      const bar = El("div", box, "", "phaseHead");
      El("span", bar, "", "tw");
      El("span", bar, "——", "phaseNum");
      El("span", bar, "关卡结束（不属于任何阶段）", "phaseName");
      const body = El("div", box, "", "phaseBody");
      for (const step of orphans) this.BuildStepCard(El, body, step, { brief: true });
      this.ui.phases.set(0, box);
    }
  }

  /** 一张步骤小卡：目标一句在最上，要求事实逐行带状态，对白与最短时长在下面。 */
  BuildStepCard(El, parent, step, { brief = false } = {}) {
    const node = El("div", parent, "", "step");
    node.dataset.flowStep = step.id;
    node.addEventListener("click", () => this.Select({ kind: "step", id: step.id }));
    const top = El("div", node, "", "stepTop");
    El("span", top, step.objective || "（这一步没有写目标）", "stepObj");
    const id = El("code", top, step.id, "stepId");
    id.title = `内部步骤编号 ${step.id}`;
    if (brief) { this.ui.steps.set(step.id, node); return node; }

    if (step.requirements.length) {
      const facts = El("div", node, "", "facts");
      for (const factId of step.requirements) {
        const row = El("div", facts, "", "fact");
        row.dataset.fact = factId;
        row.dataset.factState = "none";
        El("i", row, "·");
        const text = El("span", row, "", "factText");
        El("span", text, DescribeFact(this.model, factId));
        El("span", text, factId, "factId");
        row.addEventListener("click", (event) => {
          event.stopPropagation();
          this.Select({ kind: "fact", id: factId });
        });
        this.ui.facts.push({ row, factId, step });
      }
    } else {
      El("div", node, "这一步没有过关条件（走完就过）", "stepMeta");
    }
    const meta = [];
    if (step.cue) meta.push(`对白 ${step.cue}`);
    if (step.minimumSeconds) meta.push(`至少停留 ${step.minimumSeconds} 秒`);
    if (meta.length) El("div", node, meta.join(" · "), "stepMeta");
    if (step.spawns.length || step.guidance?.route) {
      const chips = El("div", node, "", "chips");
      for (const encounterId of step.spawns) {
        const chip = El("span", chips, "放出敌军 ", "chip");
        El("code", chip, encounterId);
        chip.dataset.flowEncounter = encounterId;
        chip.title = `这一步会把 ${encounterId} 这一组敌人放进场`;
        chip.addEventListener("click", (event) => {
          event.stopPropagation();
          this.Select({ kind: "encounter", id: encounterId });
        });
      }
      if (step.guidance?.route) {
        const chip = El("span", chips, "指引路线 ", "chip");
        El("code", chip, step.guidance.route);
        chip.dataset.flowRoute = step.guidance.route;
        chip.title = step.guidance.label || "这一步给玩家的指引";
        chip.addEventListener("click", (event) => {
          event.stopPropagation();
          this.Select({ kind: "route", id: step.guidance.route });
        });
      }
    }
    this.ui.steps.set(step.id, node);
    return node;
  }

  // ---------------------------------------------------------------- 俯视图
  BuildMapColumn(El, Button, root) {
    const tools = El("div", root, "", "bar");
    tools.dataset.orch = "tools";
    this.ui.tools = new Map();
    for (const [id, label] of TOOLS) {
      const button = Button(tools, "", () => this.SetTool(id), { tool: id }, "tchip");
      button.appendChild(ToolIcon(this.doc, id));
      El("span", button, label);
      button.title = TOOL_HINT[id] || label;
      this.ui.tools.set(id, button);
    }
    El("div", tools, "", "spacer");

    // 「分类」开的是贴在图左边的抽屉：按类型（尤其是敌军）分开看。
    const filterButton = Button(tools, "", () => this.OpenFilterDrawer(), { orch: "filter-button" }, "tchip");
    El("span", filterButton, "分类");
    const filterCount = El("span", filterButton, "", "mono muted");
    filterButton.title = "按类型看：敌军可以按组 / 本阶段状态 / 武器 / 行为分开看，也能只看某一组；"
      + "还有一张敌军布设表。再点一次收起这块面板。";
    this.ui.filterButton = filterButton;
    this.ui.filterCount = filterCount;

    // 图层收进一个下拉面板：十三个开关摊在工具条上要占掉两行，那两行是从俯视图身上抠的。
    const drop = El("div", tools, "", "drop");
    const layerButton = Button(drop, "", () => this.ToggleLayers(), { orch: "layers-button" }, "tchip");
    El("span", layerButton, "图层");
    const layerCount = El("span", layerButton, "", "mono muted");
    const layers = El("div", drop, "", "dropPanel");
    layers.dataset.orch = "layers";
    layers.hidden = true;
    this.ui.layers = new Map();
    this.ui.layerChips = new Map();
    for (const [id, label] of LAYERS) {
      const wrap = El("label", layers, "", "lchip on");
      const box = this.doc.createElement("input");
      box.type = "checkbox";
      box.checked = true;
      box.dataset.layer = id;
      box.addEventListener("change", () => this.SetLayer(id, box.checked));
      wrap.appendChild(box);
      El("span", wrap, "", "tick");
      El("span", wrap, label);
      this.ui.layers.set(id, box);
      this.ui.layerChips.set(id, wrap);
    }
    const all = El("div", layers, "", "all");
    Button(all, "全开", () => this.SetAllLayers(true), { orch: "layers-all" }, "ghost");
    Button(all, "只看底图", () => this.SetAllLayers(false), { orch: "layers-none" }, "ghost");
    this.ui.layerPanel = layers;
    this.ui.layerCount = layerCount;
    layerCount.textContent = `${LAYERS.length}/${LAYERS.length}`;

    // 「写批注」开的是浮在图右下角的那个对话框。图上一动手它也会自己开。
    // 放在工具条**末尾**（图层之后）：窄栏下工具条本来就折成两行，排在最后只占第二行的空位，
    // 不会把「分类 / 图层」挤下去，也不会让阶段条再折一行。
    const noteButton = Button(tools, "", () => this.OpenNoteDialog(), { orch: "note-button" }, "tchip");
    El("span", noteButton, "写批注");
    noteButton.title = "打开写批注的对话框（再点一次收起）。在图上画一笔、拖候选位或 Ctrl 点一个对象，它也会自己打开。";
    this.ui.noteButton = noteButton;

    const stage = El("div", root, "", "bar stepper");
    stage.dataset.orch = "stagebar";
    Button(stage, "◀", () => this.SetPhase(this.phaseNumber - 1, { fit: true }), { map: "prev" }, "icon")
      .title = "上一阶段";
    const label = El("span", stage, "", "who");
    label.dataset.map = "phase-label";
    Button(stage, "▶", () => this.SetPhase(this.phaseNumber + 1, { fit: true }), { map: "next" }, "icon")
      .title = "下一阶段";
    // 进度条就是阶段条：点哪儿跳哪儿，左右方向键走一格。原生 range 在这套界面里太出戏。
    const track = El("div", stage, "", "track");
    track.dataset.map = "phase";
    track.tabIndex = 0;
    track.setAttribute("role", "slider");
    track.setAttribute("aria-label", "阶段");
    track.setAttribute("aria-valuemin", "1");
    track.setAttribute("aria-valuemax", String(this.model.phases.length));
    const fill = El("i", track);
    const knob = El("b", track);
    const Seek = (event) => {
      const box = track.getBoundingClientRect();
      if (box.width <= 0) return;
      const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
      this.SetPhase(1 + Math.round(ratio * (this.model.phases.length - 1)), { fit: true });
    };
    track.addEventListener("mousedown", Seek);
    track.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") { event.preventDefault(); this.SetPhase(this.phaseNumber - 1, { fit: true }); }
      else if (event.key === "ArrowRight") { event.preventDefault(); this.SetPhase(this.phaseNumber + 1, { fit: true }); }
    });
    El("div", stage, "", "sep");
    const followButton = Button(stage, "", () => this.SetFollowLive(!this.followLive), { map: "follow-chip" }, "tchip on");
    const followBox = this.doc.createElement("input");
    followBox.type = "checkbox";
    followBox.checked = true;
    followBox.dataset.map = "follow";
    followBox.hidden = true;
    followButton.appendChild(followBox);
    El("span", followButton, "跟随实时");
    followButton.title = "玩家走到哪一阶段，这张图就跟到哪一阶段";
    Button(stage, "适配整关", () => this.map?.FitBounds(), { map: "fit-all" }, "tchip")
      .title = "把整张关卡装进画面";
    Button(stage, "适配本阶段", () => this.map?.FitPhase(this.phaseNumber), { map: "fit-phase" }, "tchip")
      .title = "只框住当前阶段那一片";
    this.ui.phaseLabel = label;
    this.ui.phaseFill = fill;
    this.ui.phaseKnob = knob;
    this.ui.phaseTrack = track;
    this.ui.followBox = followBox;
    this.ui.followButton = followButton;

    // 抽屉和画布并排：抽屉是「看哪些」，画布是「长什么样」，两边同时在眼前才好挑。
    const body = El("div", root, "", "mapBody");
    this.ui.mapBody = body;
    this.BuildFilterDrawer(El, Button, body);
    const wrap = El("div", body);
    wrap.id = "canvasWrap";
    const canvas = this.doc.createElement("canvas");
    canvas.dataset.orch = "canvas";
    wrap.appendChild(canvas);
    this.ui.canvas = canvas;
    this.ui.canvasWrap = wrap;
    // 点画布就把图层面板收起来 —— 它浮在图上面，忘了关会挡住右上角那一片。
    wrap.addEventListener("mousedown", () => this.ToggleLayers(false));
    // 批注对话框浮在这一栏上（不是右栏里的一块）：写批注是对着图说话。
    this.BuildNoteDialog(El, Button, root);
  }

  ToggleLayers(force) {
    const panel = this.ui?.layerPanel;
    if (!panel) return false;
    const open = force === undefined ? panel.hidden : !!force;
    panel.hidden = !open;
    this.ui.layerCount.parentElement.classList.toggle("on", open);
    return open;
  }

  SetAllLayers(on) {
    for (const [id] of this.ui?.layers || []) this.SetLayer(id, on ? true : BASE_LAYERS.has(id));
  }

  // ------------------------------------------------------- 分类查看（抽屉）
  /**
   * 贴在俯视图左边的抽屉，两个页签：
   *   分类   —— 六个类别各一行；敌军底下再按组 / 本阶段状态 / 武器 / 行为分四小节，
   *            每一项一行：开关 + 名字 + 本阶段人数 + 「只看」。
   *   布设表 —— 全部敌人一张表，可排序、按组折叠、跟着筛选联动、能复制 CSV。
   * 「图层」管的是**画不画这一类**，这里管的是**这一类里看哪几个** —— 两件事。
   */
  BuildFilterDrawer(El, Button, parent) {
    const drawer = El("aside", parent);
    drawer.dataset.orch = "filter-drawer";
    drawer.dataset.open = this.filterLayout.open ? "1" : "0";
    drawer.dataset.tab = this.filterLayout.tab === "table" ? "table" : "tree";
    drawer.addEventListener("mouseleave", () => this.ClearHoverPreview());

    const head = El("div", drawer, "", "fHead");
    const tabs = El("div", head, "", "fTabs");
    tabs.dataset.orch = "filter-tabs";
    this.ui.filterTabs = new Map();
    for (const [id, label] of [["tree", "分类"], ["table", "布设表"]]) {
      const button = Button(tabs, label, () => this.SetFilterTab(id), { filterTab: id });
      this.ui.filterTabs.set(id, button);
    }
    El("div", head, "", "spacer");
    Button(head, "收起", () => this.OpenFilterDrawer(false), { orch: "filter-close" }, "ghost")
      .title = "收起这块面板（工具条上的「分类」再打开）";

    const presets = El("div", drawer, "", "fPresets");
    presets.dataset.orch = "filter-presets";
    this.ui.filterPresets = new Map();
    for (const preset of PRESETS) {
      const button = Button(presets, preset.label, () => this.ApplyPreset(preset.id), { filterPreset: preset.id });
      button.title = preset.hint;
      this.ui.filterPresets.set(preset.id, button);
    }

    const body = El("div", drawer, "", "fBody");
    const tree = El("div", body);
    tree.dataset.orch = "filter-tree";
    const table = El("div", body);
    table.dataset.orch = "enemy-table";
    this.ui.filterDrawer = drawer;
    this.ui.filterBody = body;
    this.ui.filterTree = tree;
    this.ui.enemyTable = table;

    const grip = El("div", parent, "", "gutter");
    grip.dataset.orch = "filter-grip";
    grip.title = "拖这里改这块面板的宽度";
    grip.hidden = !this.filterLayout.open;
    grip.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.drag = { side: "filter", x: event.clientX, width: this.FilterWidth() };
      grip.classList.add("drag");
      this.doc.body.style.cursor = "col-resize";
    });
    this.ui.filterGrip = grip;
    this.ApplyFilterWidth();
  }

  /** 当前页签下抽屉多宽（分类树窄、布设表宽 —— 九列塞进 240 px 是看不了的）。 */
  FilterWidth() {
    return this.filterLayout.tab === "table" ? this.filterLayout.tableWidth : this.filterLayout.width;
  }

  ApplyFilterWidth(width) {
    if (!this.ui?.filterDrawer) return 0;
    const room = Math.max(320, (this.ui.mapBody?.clientWidth || 640) - 240);
    const next = Math.round(Math.min(Math.max(Number.isFinite(width) ? width : this.FilterWidth(), 180), room));
    if (this.filterLayout.tab === "table") this.filterLayout.tableWidth = next;
    else this.filterLayout.width = next;
    this.ui.filterDrawer.style.setProperty("--fw", `${next}px`);
    return next;
  }

  /** 开合抽屉。不给参数就是切换。 */
  OpenFilterDrawer(force) {
    const drawer = this.ui?.filterDrawer;
    if (!drawer) return false;
    const open = force === undefined ? drawer.dataset.open !== "1" : !!force;
    drawer.dataset.open = open ? "1" : "0";
    this.filterLayout.open = open;
    if (this.ui.filterGrip) this.ui.filterGrip.hidden = !open;
    this.ui.filterButton?.classList.toggle("on", open);
    WriteFilterLayout(this.filterLayout);
    if (open) this.RefreshFilterPanel({ rebuild: true });
    else this.ClearHoverPreview();
    this.SyncCanvasSize(true);
    return open;
  }

  SetFilterTab(tab) {
    const next = tab === "table" ? "table" : "tree";
    this.filterLayout.tab = next;
    if (this.ui?.filterDrawer) this.ui.filterDrawer.dataset.tab = next;
    // 换页签从头看起：上一页滚到哪儿，这一页不该接着那个位置。
    if (this.ui?.filterBody) this.ui.filterBody.scrollTop = 0;
    for (const [id, button] of this.ui?.filterTabs || []) button.classList.toggle("on", id === next);
    this.ApplyFilterWidth();
    WriteFilterLayout(this.filterLayout);
    this.RefreshFilterPanel({ rebuild: true });
    this.SyncCanvasSize(true);
    return next;
  }

  /** 这一阶段的布局（敌人状态就在里面）。同一阶段只算一次。 */
  PhaseLayoutNow() {
    if (this.phaseLayoutCache?.number === this.phaseNumber) return this.phaseLayoutCache.layout;
    let layout = null;
    try { layout = PhaseLayout(this.model, this.phaseNumber); } catch (error) { layout = null; }
    this.phaseLayoutCache = { number: this.phaseNumber, layout };
    return layout;
  }

  /** 改筛选状态（patch 会并进现在这份）。测试与宿主代码都走它。 */
  SetFilterState(patch) {
    this.filterState = NormalizeFilterState({ ...this.filterState, ...(patch || {}) });
    if (patch && !("preset" in patch)) this.filterState.preset = "custom";
    this.ApplyFilter({ rebuild: true });
    return this.filterState;
  }

  /** 预设：全部 / 只看敌军 / 只看友军 / 只看触发区 / 只看路线 / 只看本阶段新出现的。 */
  ApplyPreset(name) {
    this.filterState = PresetState(this.filterState, name);
    this.ApplyFilter({ rebuild: true });
    return this.filterState.preset;
  }

  /** 「只看」某一行：再点一次取消。 */
  SoloTarget(kind, id) {
    this.filterState = SoloFilterItem(this.filterState, kind, id);
    this.ApplyFilter({ rebuild: true });
    // 树重建过了，把这一行滚回看得见的地方 —— 二十一组里点了第十九组，
    // 刷新完屏幕停在第一组的话，人会以为没点上。
    const row = this.filterState.solo
      ? this.ui?.filterTree?.querySelector(`[data-filter-row="${kind}:${id}"]`) : null;
    if (row) { try { row.scrollIntoView({ block: "nearest" }); } catch (error) { /* 老浏览器 */ } }
    return this.filterState.solo;
  }

  /** 眼睛开关：这一行画还是不画。 */
  ToggleFilterRow(kind, id) {
    this.filterState = ToggleFilterItem(this.filterState, kind, id, this.RowIdsFor(kind));
    this.ApplyFilter({ rebuild: true });
    return this.filterState;
  }

  /** 某一类里现在有哪些行（关掉一个 = 全集减它，得先知道全集）。 */
  RowIdsFor(kind) {
    const layout = this.PhaseLayoutNow();
    const summary = this.filterSummary;
    switch (kind) {
      case "encounter": return (layout?.encounters || []).map((entry) => entry.id);
      case "state": return (summary?.enemies?.states || []).map((row) => row.id);
      case "weapon": return (summary?.enemies?.weapons || []).map((row) => row.id);
      case "behavior": return (summary?.enemies?.behaviors || []).map((row) => row.id);
      case "friendlyKind": return (summary?.friendlies || []).map((row) => row.id);
      case "zoneKind": return (summary?.zones || []).map((row) => row.id);
      case "route": return RouteNamesFor(this.model, layout);
      default: return [];
    }
  }

  /** 算一遍集合 → 交给俯视图 → 刷面板。阶段变了、状态变了都走这里。 */
  ApplyFilter({ rebuild = false } = {}) {
    const layout = this.PhaseLayoutNow();
    this.filter = BuildOrchestrationFilter(this.model, layout, this.filterState);
    this.filterSummary = FilterSummary(this.model, layout, this.filterState, { notes: this.notes.length });
    this.hoverSel = null;
    // V1 的地图还没接上 SetFilter 时这里就是个空操作：面板照样能看，图上全画。
    this.map?.SetFilter?.(this.filter);
    this.RefreshFilterPanel({ rebuild });
    return this.filter;
  }

  // -------------------------------------------------------- 分类树与布设表
  RefreshFilterPanel({ rebuild = false } = {}) {
    if (!this.ui?.filterDrawer) return;
    const summary = this.filterSummary;
    if (this.ui.filterCount && summary) {
      const text = `${summary.enemies.visible}/${summary.enemies.count}`;
      if (this.ui.filterCount.textContent !== text) this.ui.filterCount.textContent = text;
    }
    this.ui.filterButton?.classList.toggle("on", this.ui.filterDrawer.dataset.open === "1");
    for (const [id, button] of this.ui.filterPresets || []) {
      button.classList.toggle("on", id === this.filterState.preset);
    }
    for (const [id, button] of this.ui.filterTabs || []) button.classList.toggle("on", id === this.filterLayout.tab);
    if (this.ui.filterDrawer.dataset.open !== "1") return;
    const signature = `${this.phaseNumber}|${FilterStateSignature(this.filterState)}|${this.notes.length}|${this.icons ? 1 : 0}`;
    if (rebuild || signature !== this.filterSignature) {
      this.filterSignature = signature;
      if (this.filterLayout.tab === "tree") this.RefreshFilterTree();
      this.tableSignature = "";
    }
    if (this.filterLayout.tab === "table") this.RefreshEnemyTable();
  }

  RefreshFilterTree() {
    const El = this.El;
    const root = this.ui.filterTree;
    const summary = this.filterSummary;
    // 树要重建，正被划过的那一行马上就不存在了 —— 先把描亮还回去，
    // 否则它的 mouseleave 永远不会来，图上那一圈就钉死在那儿。
    this.ClearHoverPreview();
    root.textContent = "";
    if (!summary) { El("div", root, "这一阶段没有可分类的东西", "fEmpty"); return; }
    const Row = (parent, row, { cls = "", icon = null, color = null, sub = "" } = {}) => {
      const node = El("div", parent, "", `fRow ${cls}`.trim());
      node.dataset.filterRow = row.key;
      node.dataset.on = row.on === false ? "0" : "1";
      node.dataset.solo = row.soloed ? "1" : "0";
      node.dataset.filterCount = String(row.count ?? 0);
      node.dataset.filterVisible = String(row.visible ?? 0);
      node.dataset.dim = row.visible ? "0" : "1";
      const eye = this.Button(node, row.on === false ? "○" : "●",
        (event) => { event.stopPropagation(); this.ToggleFilterRow(row.kind, row.id); },
        { filterToggle: row.key }, "fEye");
      eye.title = row.on === false ? "现在不画它，点一下画回来" : "画着，点一下收起来";
      this.IconNode(node, icon, color);
      const who = El("div", node, "", "who");
      El("span", who, row.label, "fName");
      // 名字说人话，表里的编号只当尾巴上的等宽小字 —— 没有补充说明也要留着编号，
      // 不然「侧翼路」在源表里叫什么就没处对了。
      if (sub || row.code) {
        const line = El("span", who, "", "fSub");
        if (row.code) El("code", line, row.code);
        if (sub) El("span", line, row.code ? ` · ${sub}` : sub);
      }
      El("span", node, row.visible === row.count ? String(row.count) : `${row.visible}/${row.count}`, "fNum")
        .title = `这一阶段一共 ${row.count}，现在画出来 ${row.visible}`;
      const solo = this.Button(node, row.soloed ? "取消" : "只看",
        (event) => { event.stopPropagation(); this.SoloTarget(row.kind, row.id); },
        { filterSolo: row.key }, "fSolo");
      solo.title = row.soloed ? "回到刚才那种看法" : "图上只留这一项，别的都收起来";
      node.title = row.hint || `${row.label}：这一阶段 ${row.count}，现在画 ${row.visible}`;
      node.addEventListener("mouseenter", () => this.HoverRow(row.kind, row.id));
      node.addEventListener("mouseleave", () => this.ClearHoverPreview());
      return node;
    };
    const Section = (parent, id, label, rows, decorate) => {
      const open = this.filterLayout.sections[id] !== false;
      const head = this.Button(parent, "", () => this.ToggleFilterSection(id), { filterSection: id }, "fSect");
      El("span", head, open ? "▾" : "▸", "tw");
      El("span", head, label);
      El("span", head, `${rows.length}`, "fNum");
      if (!open) return;
      if (!rows.length) { El("div", parent, "这一阶段这一类是空的", "fEmpty"); return; }
      for (const row of rows) Row(parent, row, decorate(row));
    };

    for (const category of summary.categories) {
      Row(root, category, { cls: "cat", icon: CATEGORY_ICONS[category.id], color: DOT_COLORS[category.id] });
      if (category.id === "enemies") {
        for (const [id, label] of FILTER_SECTIONS) {
          const rows = id === "groups" ? summary.enemies.groups : summary.enemies[id];
          Section(root, id, label, rows, (row) => {
            if (id === "groups") {
              return {
                icon: this.GroupIcon(row.id), color: DOT_COLORS[row.state] || DOT_COLORS.enemies,
                sub: `${row.stateText}${row.isNew ? " · 本阶段新出现" : ""}`,
              };
            }
            if (id === "states") return { icon: this.icons?.StateBadge?.(row.id) || "Rifleman", color: DOT_COLORS[row.id] };
            if (id === "weapons") return { icon: WEAPON_ICONS[row.id] || "Rifleman", color: DOT_COLORS.enemies };
            return { icon: row.id === "hold" ? "Hold" : "Rifleman", color: DOT_COLORS[row.id] };
          });
        }
      } else if (category.id === "friendlies") {
        for (const row of summary.friendlies) {
          Row(root, row, { icon: this.icons?.IconForFriendly?.(row.id), color: DOT_COLORS.friendlies, sub: "" });
        }
      } else if (category.id === "zones") {
        for (const row of summary.zones) {
          Row(root, row, { icon: this.icons?.IconForZone?.({ kind: row.id }), color: DOT_COLORS.zones });
        }
      } else if (category.id === "routes") {
        for (const row of summary.routes) Row(root, row, { icon: "Route", color: DOT_COLORS.routes });
      }
    }
  }

  ToggleFilterSection(id) {
    this.filterLayout.sections[id] = this.filterLayout.sections[id] === false;
    WriteFilterLayout(this.filterLayout);
    this.RefreshFilterTree();
    return this.filterLayout.sections[id];
  }

  /** 一组用哪张图标：拿组里第一个能代表它的人（机枪手优先）。 */
  GroupIcon(encounterId) {
    if (!this.icons?.IconForMember) return null;
    const layout = this.PhaseLayoutNow();
    const encounter = (layout?.encounters || []).find((entry) => entry.id === encounterId);
    const members = encounter?.members || [];
    const lead = members.find((member) => member.weapon === "Type11") || members[0];
    return lead ? this.icons.IconForMember(lead, encounter.state, encounterId) : null;
  }

  /** 行首那个小图标：有登记表就用 PNG，没有就画一颗彩色圆点。 */
  IconNode(parent, name, color) {
    const file = this.icons?.IconFile && name ? this.icons.IconFile(name) : "";
    if (file) {
      const img = this.doc.createElement("img");
      img.className = "fIcon";
      img.alt = "";
      img.dataset.icon = name;
      img.src = AssetUrl(file);
      parent.appendChild(img);
      return img;
    }
    const dot = this.El("i", parent, "", "fDot");
    dot.style.background = color || "rgba(214,217,209,.5)";
    return dot;
  }

  /**
   * 悬停 = 描亮，**不改画面上有什么**。
   * 能指到单个对象的（某一组、某一条路线、表里的某个人）就在图上给它描一圈
   * （`SetHover` 报给地图，`SetSelection` 画那一圈；指针不在画布上时地图不画 tooltip）；
   * 指不到单个对象的（按状态 / 武器 / 行为 / 整个类别）就**什么都不动** ——
   * 早先那版是临时「只画这一类」，扫一遍列表整张图闪十几次，比没有还难看。
   * 指针离开时把描亮还给真正选中的那个对象。
   */
  HoverRow(kind, id) {
    if (!this.map) return null;
    if (kind !== "encounter" && kind !== "route" && kind !== "member") { this.ClearHoverPreview(); return null; }
    const sel = { kind, id };
    this.hoverSel = sel;
    this.map.SetHover(sel);
    this.map.SetSelection(sel);
    return sel;
  }

  ClearHoverPreview() {
    if (this.hoverSel) {
      this.hoverSel = null;
      this.map?.SetSelection(this.selection);     // 描亮还给真正选中的那个
    }
    this.map?.SetHover(null);
  }

  /** 布设表当前该列出哪些行（跟着筛选走：图上看不见的，表里也不列）。 */
  EnemyRows() {
    const rows = EnemyTableRows(this.model, this.PhaseLayoutNow(), this.live);
    this.tableRows = rows;
    return SortEnemyRows(rows.filter((row) => RowVisible(this.filter, row)),
      this.tableSort.column, this.tableSort.ascending);
  }

  EnemyCsv() { return EnemyTableCsv(this.EnemyRows()); }

  CopyEnemyCsv() { return this.CopyText(this.EnemyCsv(), "敌军布设表"); }

  SortEnemyTable(column) {
    if (this.tableSort.column === column) this.tableSort.ascending = !this.tableSort.ascending;
    else this.tableSort = { column, ascending: true };
    this.tableSignature = "";
    this.RefreshEnemyTable();
    return this.tableSort;
  }

  ToggleTableGroup(encounterId) {
    if (this.tableCollapsed.has(encounterId)) this.tableCollapsed.delete(encounterId);
    else this.tableCollapsed.add(encounterId);
    this.tableSignature = "";
    this.RefreshEnemyTable();
    return !this.tableCollapsed.has(encounterId);
  }

  RefreshEnemyTable() {
    if (!this.ui?.enemyTable) return;
    const El = this.El;
    const rows = this.EnemyRows();
    const grouped = this.tableSort.column === "group";
    const signature = `${this.phaseNumber}|${rows.length}|${this.tableSort.column}|${this.tableSort.ascending}`
      + `|${[...this.tableCollapsed].sort().join(",")}|${this.icons ? 1 : 0}|${this.selection?.id || ""}`;
    if (signature === this.tableSignature) { this.RefreshTableLive(rows); return; }
    this.tableSignature = signature;
    const root = this.ui.enemyTable;
    this.ClearHoverPreview();            // 同上：行要重建，描亮先还回去
    root.textContent = "";
    this.tableLiveCells = new Map();

    const bar = El("div", root, "", "fBar");
    El("span", bar, `${rows.length} / ${this.tableRows.length} 人`).title = "按当前筛选列出来的人数 / 这一阶段全部";
    El("div", bar, "", "spacer");
    this.Button(bar, "复制 CSV", () => this.CopyEnemyCsv(), { tableAction: "csv" }, "ghost")
      .title = "把这张表按现在的筛选与排序拷成 CSV（首行是表头）";
    if (!rows.length) {
      El("div", root, "按现在的筛选，这一阶段一个敌人都没剩。换个预设或把开关打开。", "fEmpty");
      return;
    }

    const table = this.doc.createElement("table");
    table.className = "enemies";
    table.dataset.table = "enemies";
    const head = El("thead", table);
    const headRow = El("tr", head);
    for (const column of ENEMY_TABLE_COLUMNS) {
      // 按组排时组名写在分组线上，行里那一格只剩图标 —— 表头跟着改叫「图标」，
      // 免得一列图标顶着「组」字。换成别的排法时它又变回「组」，那时行里是有组名的。
      const cell = El("th", headRow, grouped && column.id === "group" ? "图标" : column.label);
      cell.dataset.tableSort = column.id;
      if (this.tableSort.column === column.id) {
        cell.classList.add("sorted");
        El("span", cell, this.tableSort.ascending ? " ▲" : " ▼");
      }
      cell.title = `${column.hint}（点表头按这一列排）`;
      cell.addEventListener("click", () => this.SortEnemyTable(column.id));
    }
    const body = El("tbody", table);
    let lastGroup = null;
    for (const row of rows) {
      if (grouped && row.encounterId !== lastGroup) {
        lastGroup = row.encounterId;
        const collapsed = this.tableCollapsed.has(row.encounterId);
        const groupRow = El("tr", body, "", "grp");
        groupRow.dataset.tableGroup = row.encounterId;
        const cell = El("td", groupRow);
        cell.colSpan = ENEMY_TABLE_COLUMNS.length;
        El("span", cell, collapsed ? "▸ " : "▾ ");
        El("span", cell, `${row.group}　`);
        El("span", cell, `${rows.filter((one) => one.encounterId === row.encounterId).length} 人 · ${row.stateText}`, "muted");
        groupRow.title = "点一下收起 / 摊开这一组";
        groupRow.addEventListener("click", () => this.ToggleTableGroup(row.encounterId));
      }
      if (grouped && this.tableCollapsed.has(row.encounterId)) continue;
      const node = El("tr", body);
      node.dataset.tableRow = row.member;
      node.dataset.tableGroupOf = row.encounterId;
      if (row.live) node.dataset.alive = row.live.alive ? "1" : "0";
      if (this.selection?.kind === "member" && this.selection.id === row.member) node.classList.add("sel");
      const who = El("td", node, "", "who");
      this.IconNode(who, this.icons?.IconForMember?.(row, row.state, row.encounterId),
        DOT_COLORS[row.state] || DOT_COLORS.enemies);
      // 按组排时组名已经写在上面那条分组线里了，每一行再抄一遍只是占宽度。
      if (!grouped) El("span", who, row.group);
      El("td", node, row.member, "mono");
      El("td", node, row.startText);
      El("td", node, row.stateText);
      El("td", node, row.weaponText);
      El("td", node, row.traitText).title = row.traitText;
      El("td", node, row.spawnText, "num");
      El("td", node, row.routeText);
      // 这一局里没有这个人（组还没出现、或已经算被清掉了）时，「实时」写的是
      // 他这一阶段的状态 —— 一整列破折号看着像面板坏了。
      const live = El("td", node, LiveCellText(row), `num liveCell${row.live ? "" : " muted"}`);
      this.tableLiveCells.set(row.member, live);
      node.title = `${row.group} · ${row.member}：点一下选中他并把图移过去`;
      node.addEventListener("click", () => this.PickEnemyRow(row.member));
      node.addEventListener("mouseenter", () => this.HoverRow("member", row.member));
      node.addEventListener("mouseleave", () => this.ClearHoverPreview());
    }
    root.appendChild(table);
  }

  /** 表里那些「实时」格子每 0.25 s 更新，但整张表不重建（117 行重画太贵）。 */
  RefreshTableLive(rows) {
    if (!this.tableLiveCells.size) return;
    for (const row of rows || this.EnemyRows()) {
      const cell = this.tableLiveCells.get(row.member);
      if (!cell) continue;
      const text = LiveCellText(row);
      if (cell.textContent !== text) cell.textContent = text;
      cell.classList.toggle("muted", !row.live);
      const node = cell.parentElement;
      if (node && row.live) node.dataset.alive = row.live.alive ? "1" : "0";
    }
  }

  /**
   * 图标登记表是另一包的东西，可能还不在树上：登记进 import map 了才去取，
   * 取不到就一直用彩色圆点 —— 这块面板不该因为少几张 PNG 就打不开。
   */
  async LoadIcons() {
    if (this.iconsTried) return this.icons;
    this.iconsTried = true;
    if (!IconModuleAvailable()) return null;
    try {
      // **路径必须是字面量。** 写成 `./${ICON_MODULE}` 的话 esbuild 会把它当成
      // 「同目录下的任意模块」，把整个 Taierzhuang1938/ 目录（含三百多个 *Test.mjs
      // 与 node-only 脚本）全拖进 Pages 那一包 —— 2026-09-20 实跑 Script_BrowserBundleTest：
      // 2549 条 Could not resolve "node:fs" 之类，整包根本打不出来。
      // 取不取得到仍由上面的 IconModuleAvailable() 说了算，行为一字不变。
      const mod = await import("./Data_OrchestrationIcons.mjs");
      if (typeof mod?.IconForMember !== "function" || typeof mod?.IconFile !== "function") return null;
      this.icons = mod;
    } catch (error) {
      this.icons = null;
      return null;
    }
    if (this.ui) this.RefreshFilterPanel({ rebuild: true });
    return this.icons;
  }

  /** 表里点一行 = 选中那个人并把图挪过去。 */
  PickEnemyRow(memberId) {
    const row = this.tableRows.find((one) => one.member === memberId);
    this.Select({ kind: "member", id: memberId });
    if (row) this.map?.ZoomTo({ x: row.x, z: row.z }, 60);
    for (const node of this.ui.enemyTable.querySelectorAll("[data-table-row]")) {
      node.classList.toggle("sel", node.dataset.tableRow === memberId);
    }
    return row || null;
  }

  // ---------------------------------------------------------- 详情 / 批注
  /**
   * 右栏两个页签：
   *   详情 —— 选中对象的反查 + **这个对象上的**批注；
   *   批注 —— 全部批注（按状态分段）+ 导出。
   * 写批注的表单不在这里：它搬进了浮在俯视图上的对话框（BuildNoteDialog）——
   * 用户是对着图说话的，表单钉在右栏就意味着眼睛要在两栏之间来回跳。
   */
  BuildDetail(El, Button, root) {
    const head = El("div", root, "", "colHead");
    El("h2", head, "详情");
    El("span", head, "选中什么，这里就说它是谁", "sub");
    const tabs = El("div", head, "", "dTabs");
    tabs.dataset.orch = "detail-tabs";
    this.ui.detailTabs = new Map();
    for (const [id, label] of [["detail", "详情"], ["notes", "批注"]]) {
      const button = Button(tabs, label, () => this.SetDetailTab(id), { detailTab: id });
      button.dataset.on = "0";
      this.ui.detailTabs.set(id, button);
    }

    const detailPanel = El("div", root);
    detailPanel.dataset.detailPanel = "detail";
    const notesPanel = El("div", root);
    notesPanel.dataset.detailPanel = "notes";
    this.ui.detailPanels = new Map([["detail", detailPanel], ["notes", notesPanel]]);
    this.BuildDetailCard(El, Button, detailPanel);
    this.BuildNotesTab(El, Button, notesPanel);
  }

  BuildDetailCard(El, Button, root) {
    const card = El("div", root, "", "card");
    const cardHead = El("div", card, "", "cardHead");
    const title = El("div", cardHead, "还没有选中东西");
    title.dataset.detail = "title";
    const owner = El("div", card, "", "cardBody");
    owner.dataset.detail = "owner";
    const jsonBox = El("details", card, "", "fold");
    jsonBox.dataset.detail = "json-box";
    El("summary", jsonBox, "原始数据（给 agent 看的 JSON）");
    const json = El("pre", jsonBox, "—");
    json.dataset.detail = "json";

    El("div", root, "这个对象上的批注", "sect");
    const related = El("div", root);
    related.dataset.detail = "notes";
    Object.assign(this.ui, { title, owner, json, related });
  }

  /** 页签二：全部批注 + 一行弱化的导出。写批注的表单不在这儿（见 BuildNoteDialog）。 */
  BuildNotesTab(El, Button, root) {
    El("div", root, "全部批注", "sect");
    const filterBar = El("div", root, "", "bar");
    filterBar.style.margin = "8px 16px";
    const filter = El("div", filterBar, "", "seg");
    filter.dataset.notes = "filter";
    this.ui.filters = new Map();
    for (const [value, label] of [["open", "待处理"], ["resolved", "已处理"], ["dismissed", "已忽略"], ["all", "全部"]]) {
      const button = Button(filter, label, () => this.SetNoteFilter(value), { notesFilter: value });
      this.ui.filters.set(value, button);
    }
    El("div", filterBar, "", "spacer").style.flex = "1 1 auto";
    Button(filterBar, "重新加载", () => this.LoadNotes(), { notesAction: "reload" }, "ghost");
    // 保存 / 加载的结果写在对话框的状态条上，可对话框常常是关着的 ——
    // 「重新加载」按完什么都不动会让人以为按钮坏了，所以这儿镜一份同样的话。
    const hint = El("div", root);
    hint.dataset.notes = "hint";
    const list = El("div", root);
    list.dataset.notes = "list";

    const more = El("div", root, "", "bar");
    more.style.margin = "8px 16px 16px";
    Button(more, "复制交接文本", () => this.CopyHandoff(), { noteAction: "handoff" }, "ghost")
      .title = "把待处理的批注整理成一段文字，贴给 agent 就能开工";
    Button(more, "下载 JSON", () => this.DownloadJson(), { noteAction: "download" }, "ghost");
    Button(more, "复制 JSON", () => this.CopyJson(), { noteAction: "copy" }, "ghost");
    const imageButton = Button(more, "下载本图", () => this.DownloadImage(), { noteAction: "image" }, "ghost");
    imageButton.title = "导出完整底图，并叠加当前勾选的图层、筛选结果和标记信息";
    Object.assign(this.ui, { list, notesHint: hint });
  }

  /**
   * 批注对话框：浮在俯视图右下角、标题栏可拖、有 ✕。
   *
   * 为什么是对话框不是右栏的一块：写批注这件事是**对着图说话**的 —— 圈一笔、
   * 拖个候选位、Ctrl 点两个人，然后写一句。这些动作全在图上，表单就该贴着图。
   * 用户在图上一动手（画一笔 / 拖候选位 / 提及一个对象），它自己会打开。
   */
  BuildNoteDialog(El, Button, parent) {
    const box = El("div", parent);
    box.dataset.orch = "note-dialog";
    box.dataset.open = "0";

    const head = El("div", box, "", "ndHead");
    El("h3", head, "写一条批注");
    El("div", head, "", "spacer");
    Button(head, "✕", () => this.OpenNoteDialog(false), { noteAction: "close" }, "ghost")
      .title = "收起（草稿不丢）";
    this.BindNoteDrag(box, head);

    const body = El("div", box, "", "ndBody");

    // ① 哪个阶段 · 哪个状态：一个下拉框把 18 个阶段 / 28 个步骤 / 要求事实摊平。
    //    选它只换「在看哪一阶段」，**不动 selection** —— 否则刚在图上点中的那个
    //    敌人会被这一下换掉，而用户想说的正是他。
    const stateField = El("div", body, "", "field");
    El("label", stateField, "哪个阶段 · 哪个状态");
    const state = this.doc.createElement("select");
    state.dataset.noteField = "state";
    state.title = "这条批注挂在哪一阶段的哪一步（或哪一件要等的事）上";
    // 下拉框里到底有哪几项，记一份：时间轴上点得到的事实不一定是某一步的过关条件，
    // 那时 SetNoteState 要退到它所属的那一步，否则 select 会静静地把 value 吞成空串。
    this.noteStateOptions = new Set();
    const Option = (value, label) => {
      this.noteStateOptions.add(value);
      return NoteStateOption(this.doc, value, label);
    };
    for (const phase of this.model.phases) {
      const group = this.doc.createElement("optgroup");
      group.label = `第 ${phase.number} 阶段 · ${phase.title}`;
      group.appendChild(Option(`phase:${phase.id}`, "阶段开始"));
      for (const stepId of phase.steps) {
        const step = this.model.steps.find((entry) => entry.id === stepId);
        if (!step) continue;
        group.appendChild(Option(`step:${step.id}`, `　步骤 · ${step.objective || step.id}`));
        for (const factId of step.requirements || []) {
          group.appendChild(Option(`fact:${factId}`, `　　等：${DescribeFact(this.model, factId)}`));
        }
      }
      state.appendChild(group);
    }
    state.addEventListener("change", () => this.SetNoteState(state.value, { pin: true }));
    stateField.appendChild(state);

    // ② 哪里不对 + @ 提及
    const textField = El("div", body, "", "field");
    El("label", textField, "哪里不对（必填）");
    const text = this.doc.createElement("textarea");
    text.rows = 3;
    text.placeholder = "例：这组敌人出现得太早，转运刚开始就压到装车位上了。";
    text.dataset.noteField = "text";
    text.addEventListener("input", () => { this.draft.text = text.value; });
    textField.appendChild(text);
    const mentionRow = El("div", textField, "", "mentions");
    const mentions = El("div", mentionRow, "", "mentions");
    mentions.dataset.noteField = "mentions";
    const arm = Button(mentionRow, "@ 点图选", () => this.ArmMention(!this.map?.mentionArmed),
      { noteAction: "mention-arm" }, "ghost");
    arm.title = "点一下，然后在图上点你想提到的那个东西";
    this.ui.mentionButton = arm;
    El("div", textField, "按住 Ctrl 点图上的东西也行", "hint");

    // ③ 建议类型 + 秒数
    const kindField = El("div", body, "", "field");
    El("label", kindField, "你的建议");
    const row = El("div", kindField, "", "ndRow");
    const proposal = this.doc.createElement("select");
    proposal.dataset.noteField = "proposal";
    for (const [value, label] of [["", "只提意见，不写具体建议"],
      ...PROPOSAL_KINDS.map((k) => [k, PROPOSAL_TEXT[k] || k])]) {
      const option = this.doc.createElement("option");
      option.value = value;
      option.textContent = label;
      proposal.appendChild(option);
    }
    proposal.addEventListener("change", () => { this.draft.proposal = proposal.value; });
    row.appendChild(proposal);
    const timeValue = this.doc.createElement("input");
    timeValue.type = "text";
    timeValue.dataset.noteField = "timeValue";
    timeValue.placeholder = "相对本步 n 秒";
    timeValue.title = "这条意见说的是进入这一步之后第几秒；上面选了某件要等的事就不必填";
    timeValue.addEventListener("input", () => { this.draft.timeValue = timeValue.value; });
    row.appendChild(timeValue);

    // ④ 画在图上的东西 + 候选位
    const sketchField = El("div", body, "", "field");
    El("label", sketchField, "画在图上的东西");
    const sketch = El("div", sketchField, "", "box");
    sketch.dataset.noteField = "sketch";
    const candidate = El("div", sketchField, "", "box");
    candidate.dataset.noteField = "candidate";
    candidate.style.marginTop = "8px";

    // ⑤ 保存 / 清空 + 状态条（**不弹窗**：弹窗会把整个工作台冻住）
    const actions = El("div", body, "", "bar");
    Button(actions, "保存草稿", () => { this.SaveDraft(); }, { noteAction: "save" }, "primary");
    Button(actions, "清空", () => this.ClearDraft(), { noteAction: "clear" }, "ghost");
    const status = El("div", body, "", "statusBar");
    status.dataset.notes = "status";

    this.ui.noteDialog = box;
    Object.assign(this.ui, { text, proposal, timeValue, sketch, candidate, status, noteState: state, mentions });
  }

  /** 标题栏拖动：拖过一次就改用 left/top 定位（原来是钉在右下角的）。 */
  BindNoteDrag(box, head) {
    head.addEventListener("mousedown", (event) => {
      if (event.target.closest("button")) return;
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      const host = box.offsetParent || this.ui.map;
      const base = host.getBoundingClientRect();
      this.noteDrag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, base };
    });
    this.doc.addEventListener("mousemove", (event) => {
      const drag = this.noteDrag;
      if (!drag) return;
      const width = box.offsetWidth;
      const height = box.offsetHeight;
      const left = Math.min(Math.max(0, event.clientX - drag.dx - drag.base.left), Math.max(0, drag.base.width - width));
      const top = Math.min(Math.max(0, event.clientY - drag.dy - drag.base.top), Math.max(0, drag.base.height - height));
      box.style.left = `${Math.round(left)}px`;
      box.style.top = `${Math.round(top)}px`;
      box.style.right = "auto";
      box.style.bottom = "auto";
    });
    this.doc.addEventListener("mouseup", () => { this.noteDrag = null; });
  }

  // -------------------------------------------------------------- 时间轴
  BuildTimeline(El, Button, root) {
    root.dataset.collapsed = this.layout.timeline ? "0" : "1";
    const head = El("div", root, "", "tlHead");
    El("h2", head, "时间轴");
    El("span", head, "上面一行是设计的安排，下面一行是这次真的发生的事", "sub");
    const legend = El("div", head, "", "legend");
    legend.dataset.timeline = "legend";
    for (const [cls, glyph, label] of [
      ["d", "◆ ■ ▸", "设计里排好时间的"],
      ["c", "◇", "设计里等玩家触发的（没有秒数）"],
      ["a", "● ▸", "实际试玩（关卡时钟）"],
    ]) {
      const key = El("span", legend, "", cls);
      El("i", key, glyph);
      El("span", key, label);
    }
    const toggle = Button(head, this.layout.timeline ? "收起" : "展开", () => this.ToggleTimeline(),
      { timeline: "toggle" }, "ghost");
    this.ui.timelineToggle = toggle;

    const body = El("div", root, "", "tlBody");
    const names = El("div", body, "", "tlNames");
    El("div", names, "", "sp");
    El("div", names, "设计", "n design");
    const actualName = El("div", names, "", "n actual");
    El("span", actualName, "实际");
    // 关卡时钟 / 这一步用时 / 当前步骤三条读数都写在这一个节点上：它们本来就是
    // 时间轴的信息，顶栏不必再排一串小标签。每 tick 只改这一处文本。
    const actualHint = El("span", actualName, "", "muted mono");
    actualHint.style.fontSize = "11px";
    this.ui.actualHint = actualHint;

    const scroll = El("div", body, "", "tlScroll");
    const grid = El("div", scroll, "", "tlGrid");
    const headRow = El("div", grid, "", "tlHeadRow");
    this.ui.laneHeads = new Map();
    for (const phase of this.model.phases) {
      const cell = El("div", headRow, "", "tlCell");
      cell.style.flex = `${LaneWeight(phase)} 1 0`;
      El("span", cell, String(phase.number), "num");
      El("span", cell, ` ${phase.title}`);
      cell.title = `第 ${phase.number} 阶段 · ${phase.title}`;
      cell.addEventListener("click", () => this.Select({ kind: "phase", id: phase.id }));
      this.ui.laneHeads.set(phase.number, cell);
    }
    this.ui.lanes = { design: new Map(), actual: new Map() };
    for (const kind of ["design", "actual"]) {
      const row = El("div", grid, "", "tlRow");
      row.dataset.timeline = kind;
      for (const phase of this.model.phases) {
        const lane = El("div", row, "", "tlLane");
        lane.dataset.lane = String(phase.number);
        lane.style.flex = `${LaneWeight(phase)} 1 0`;
        const marks = El("div", lane);
        marks.dataset.marks = kind;
        // 实际行末尾还留一格给「正在等」的那几件事：它们还没发生，不能混进上面
        // 那串已经发生过的标记里，但它们属于**实际**这一行 —— 说的是这一局。
        const waits = kind === "actual" ? El("div", lane) : null;
        if (waits) waits.dataset.marks = "waiting";
        this.ui.lanes[kind].set(phase.number, { lane, marks, waits });
      }
    }
    // 设计行只画一次：它不随运行时变。
    for (const entry of this.model.timeline) {
      const slot = this.ui.lanes.design.get(entry.phaseNumber);
      if (!slot) continue;
      this.AddMarker(slot.marks, entry.kind, this.MarkerTip(entry), MarkerSel(entry), MarkerSeconds(entry));
    }
    this.ui.actualCount = -1;
  }

  ToggleTimeline(force) {
    const open = force === undefined ? this.ui.timeline.dataset.collapsed === "1" : !!force;
    this.ui.timeline.dataset.collapsed = open ? "0" : "1";
    this.ui.timelineToggle.textContent = open ? "收起" : "展开";
    this.layout.timeline = open;
    WriteLayout(this.layout);
    this.SyncCanvasSize(true);
    return open;
  }

  AddMarker(parent, kind, tip, sel, seconds) {
    const node = this.doc.createElement("span");
    node.className = "tlMark";
    node.dataset.markerKind = kind;
    node.textContent = TIMELINE_GLYPH[kind] || "·";
    // 秒数只写在**有秒数的那几类**上。condition 是玩家行为触发的，不许假装它有时刻。
    if (Number.isFinite(seconds)) node.dataset.markerAt = String(seconds);
    node.dataset.tip = tip.map((line) => `${line.k ? `${line.k} ` : ""}${line.v}`).join(" · ");
    node.addEventListener("mouseenter", () => this.ShowTip(node, tip));
    node.addEventListener("mouseleave", () => this.HideTip());
    if (sel) {
      node.dataset.selKind = sel.kind;
      if (sel.id) node.dataset.selId = sel.id;
      node.addEventListener("click", () => { this.HideTip(); this.Select(sel); });
    }
    parent.appendChild(node);
    return node;
  }

  /** 悬停提示：阶段、步骤、这件事的人话，最后才是秒数（没有秒数就明说为什么）。 */
  MarkerTip(entry) {
    const phase = this.model.phases.find((one) => one.number === entry.phaseNumber);
    const seconds = MarkerSeconds(entry);
    const lines = [
      { k: "", v: TIMELINE_TEXT[entry.kind] || entry.kind },
      { k: "阶段", v: phase ? `${phase.number} ${phase.title}` : String(entry.phaseNumber ?? "—") },
      { k: "步骤", v: entry.step || "—" },
    ];
    const human = entry.factId ? DescribeFact(this.model, entry.factId) : entry.label;
    if (human) lines.push({ k: "说的是", v: human });
    if (entry.kind === "threat") lines.push({ k: "时刻", v: entry.after
      ? `等事实 ${entry.after} 后出现；解除后记 ${entry.factId}`
      : `进入 ${entry.step} 即出现；解除后记 ${entry.factId}` });
    else if (Number.isFinite(seconds)) lines.push({ k: "时刻", v: `第 ${seconds} 秒` });
    else lines.push({ k: "时刻", v: "没有固定秒数，等玩家做到才发生" });
    return lines;
  }

  RefreshActualTimeline() {
    if (!this.ui?.lanes) return;
    const live = this.live;
    const entries = live?.actualTimeline || [];
    // 顶栏原来那一串小标签（步骤 / 关卡时钟 / 这一步用时）搬到了这儿 ——
    // 它们本来就是时间轴的信息，摆在实际行的名字底下正好挨着那一行的标记。
    const hint = live
      ? `关卡时钟 ${Round(live.time)} 秒 · 这一步 ${Round(live.stageTime)} 秒 · 步骤 ${live.stepId || "—"}`
      : "还没有人在跑这一关";
    if (this.ui.actualHint.textContent !== hint) this.ui.actualHint.textContent = hint;
    this.RefreshWaitingMarks();
    if (entries.length === this.ui.actualCount) return;
    this.ui.actualCount = entries.length;
    for (const slot of this.ui.lanes.actual.values()) slot.marks.textContent = "";
    for (const entry of entries) {
      const slot = this.ui.lanes.actual.get(entry.phaseNumber);
      if (!slot) continue;
      const sel = entry.kind === "stageEntry" ? { kind: "step", id: entry.id } : { kind: "fact", id: entry.id };
      const phase = this.model.phases.find((one) => one.number === entry.phaseNumber);
      const tip = [
        { k: "", v: TIMELINE_TEXT[entry.kind] || entry.kind },
        { k: "阶段", v: phase ? `${phase.number} ${phase.title}` : String(entry.phaseNumber ?? "—") },
        { k: "步骤", v: entry.kind === "stageEntry" ? entry.id : (this.model.facts[entry.id]?.step || "—") },
      ];
      if (entry.kind === "fact") tip.push({ k: "说的是", v: DescribeFact(this.model, entry.id) });
      tip.push({ k: "时刻", v: `关卡时钟第 ${Round(entry.atS)} 秒（本步第 ${Round(entry.stageAtS)} 秒）` });
      this.AddMarker(slot.marks, entry.kind, tip, sel, Math.round(entry.atS * 10) / 10);
    }
  }

  /**
   * 当前阶段实际泳道末尾的「正在等」：每件还没满足的事一枚空心标记，
   * **不带 `data-marker-at`** —— 它要等玩家做到才发生，没有秒数可标。
   * 事实一旦满足，它就从 `live.remaining` 里掉出去、同时作为实心 ● 出现在
   * 上面那串实际标记里，两边是同一件事的前后两态。指纹没变就不重建。
   */
  RefreshWaitingMarks() {
    const live = this.live;
    const waiting = live?.remaining || [];
    const signature = `${live?.phaseNumber ?? "-"}|${waiting.join(",")}`;
    if (signature === this.waitSignature) return;
    this.waitSignature = signature;
    for (const slot of this.ui.lanes.actual.values()) {
      if (slot.waits && slot.waits.firstChild) slot.waits.textContent = "";
    }
    const slot = this.ui.lanes.actual.get(live?.phaseNumber);
    if (!slot?.waits) return;
    const phase = this.model.phases.find((one) => one.number === live.phaseNumber);
    for (const factId of waiting) {
      const human = DescribeFact(this.model, factId);
      const tip = [
        { k: "", v: `正在等：${human}` },
        { k: "阶段", v: phase ? `${phase.number} ${phase.title}` : String(live.phaseNumber ?? "—") },
        { k: "步骤", v: this.model.facts[factId]?.step || live.stepId || "—" },
        { k: "时刻", v: "没有固定秒数，等玩家做到才发生" },
      ];
      this.AddMarker(slot.waits, "waiting", tip, { kind: "fact", id: factId }, undefined);
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
      if (step && Number.isFinite(step.phaseNumber)) {
        this.SetPhase(step.phaseNumber, { fit: true });
        this.OpenPhase(step.phaseNumber);
      }
      const node = this.ui?.steps?.get(sel.id);
      // 从图上或时间轴上选中的步骤要在左栏露出来，否则「选中了」只体现在右栏。
      if (node) { try { node.scrollIntoView({ block: "nearest" }); } catch (error) { /* 老浏览器 */ } }
    }
    // 在左栏 / 时间轴 / 图上选中阶段、步骤、事实 = 也就选定了「批注挂在哪儿」，
    // 对话框那个下拉框跟过去。反过来不成立：改下拉框不许动 selection。
    if (sel && (sel.kind === "phase" || sel.kind === "step" || sel.kind === "fact")) {
      this.SetNoteState(`${sel.kind}:${sel.id}`, { navigate: false, pin: true });
    }
    this.RefreshDetail();
    this.RefreshFlowSelection();
    return this.selection;
  }

  SetPhase(n, { fit = false } = {}) {
    const max = this.model.phases.length;
    const number = Math.min(max, Math.max(1, Number.isFinite(n) ? Math.round(n) : 1));
    const changed = number !== this.phaseNumber;
    this.phaseNumber = number;
    if (this.map) {
      this.map.SetPhase(number);
      if (fit) this.map.FitPhase(number);
    }
    const phase = this.model.phases.find((entry) => entry.number === number);
    if (this.ui?.phaseLabel) {
      this.ui.phaseLabel.textContent = "";
      this.El("span", this.ui.phaseLabel, `第 ${number} / ${max} 阶段`, "num");
      this.El("span", this.ui.phaseLabel, phase ? ` · ${phase.title}` : "");
      const ratio = max > 1 ? (number - 1) / (max - 1) : 1;
      this.ui.phaseFill.style.width = `${(ratio * 100).toFixed(1)}%`;
      this.ui.phaseKnob.style.left = `calc(${(ratio * 100).toFixed(1)}% - 1px)`;
      this.ui.phaseTrack.setAttribute("aria-valuenow", String(number));
      this.ui.phaseTrack.setAttribute("aria-valuetext", phase ? `第 ${number} 阶段 ${phase.title}` : `第 ${number} 阶段`);
    }
    if (changed) this.OpenPhase(number, { scroll: true });
    this.SyncNoteStateToPhase(number);
    // 换阶段 = 每一组的状态都可能变，分类树上的人数跟着重算。
    if (this.ui?.filterDrawer) this.ApplyFilter({ rebuild: changed });
    this.RefreshLanes();
    return number;
  }

  /**
   * 翻到别的阶段时，批注对话框那个下拉框跟过去（落在这一阶段的第一步；跟着实时
   * 而且实时正在这一阶段时落在实时那一步）。已经落在这一阶段里就不动 ——
   * 用户在这一阶段里挑好了某一步，不该因为跟随实时抖一下就被拨回第一步。
   */
  SyncNoteStateToPhase(number) {
    if (!this.ui?.noteState) return;
    if (this.draft.statePinned) return;          // 亲手定过的不动，清空 / 保存之后才恢复跟随
    if (this.draft.state?.phaseNumber === number) return;
    const live = this.live;
    if (this.followLive && live?.phaseNumber === number && live.stepId
      && this.noteStateOptions?.has(`step:${live.stepId}`)) {
      this.SetNoteState(`step:${live.stepId}`, { navigate: false });
      return;
    }
    const phase = this.model.phases.find((entry) => entry.number === number);
    const first = phase?.steps?.[0];
    this.SetNoteState(first ? `step:${first}` : `phase:${phase?.id ?? ""}`, { navigate: false });
  }

  /** 左栏把某一阶段展开并滚到看得见的地方（当前阶段换了、或用户点了别处都会走这里）。 */
  OpenPhase(number, { scroll = false } = {}) {
    const box = this.ui?.phases?.get(number);
    if (!box) return null;
    box.dataset.open = "1";
    if (scroll) {
      try { box.scrollIntoView({ block: "nearest" }); } catch (error) { /* 老浏览器没有参数版 */ }
    }
    return box;
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
    this.ui?.layerChips?.get(id)?.classList.toggle("on", !!on);
    if (this.ui?.layerCount) {
      let count = 0;
      for (const [, one] of this.ui.layers) if (one.checked) count += 1;
      this.ui.layerCount.textContent = `${count}/${this.ui.layers.size}`;
    }
  }

  SetFollowLive(on) {
    this.followLive = !!on;
    if (this.ui?.followBox && this.ui.followBox.checked !== this.followLive) this.ui.followBox.checked = this.followLive;
    this.ui?.followButton?.classList.toggle("on", this.followLive);
    if (this.followLive && Number.isFinite(this.live?.phaseNumber)) this.SetPhase(this.live.phaseNumber);
  }

  /** 地图工具画出来的一笔（也供测试直接塞形状）。画了一笔 = 有话要说，对话框自己开。 */
  AddShape(shape) {
    if (!shape || !shape.type) return null;
    const next = { ...shape };
    if (next.type === "label" && !next.text) next.text = (this.draft.text || "标注").slice(0, 12);
    this.draft.shapes.push(next);
    this.map?.SetSketch(this.DraftShapes());
    this.OpenNoteDialog(true);
    this.RefreshForm();
    return next;
  }

  /**
   * 删掉第 index 笔。`DraftShapes()` 把候选位 ghost 放在**最后**，所以
   * `index >= shapes.length` 说的就是它 —— 那一枚要走 `SetCandidate(null)`，
   * 不然候选位加上去就再也去不掉（用户实测里点名的那条）。
   */
  RemoveShape(index) {
    const at = Number(index);
    if (!Number.isFinite(at) || at < 0) return null;
    if (this.selection?.kind === "sketch") this.Select(null);
    if (at >= this.draft.shapes.length) { this.SetCandidate(null); return null; }
    const removed = this.draft.shapes.splice(at, 1)[0] || null;
    this.map?.SetSketch(this.DraftShapes());
    this.RefreshForm();
    return removed;
  }

  /** move 工具拖出来的候选位：不改模型，只作为 proposal.to 与一枚 ghost。 */
  SetCandidate(point, target = null) {
    if (!point || !Number.isFinite(point.x)) { this.draft.candidate = null; }
    else {
      this.draft.candidate = { x: point.x, z: point.z, memberId: target?.id || this.selection?.id || null };
      if (!this.draft.proposal) { this.draft.proposal = "move"; if (this.ui) this.ui.proposal.value = "move"; }
      if (target && target.kind && target.id) this.Select({ kind: target.kind, id: target.id, x: target.x, z: target.z });
      this.OpenNoteDialog(true);
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

  /** 「相对本步 n 秒」。空着就是不限时刻；选了某件要等的事时它不起作用。 */
  SetNoteTime(seconds) {
    this.draft.timeValue = seconds === undefined || seconds === null ? "" : String(seconds);
    if (this.ui) this.ui.timeValue.value = this.draft.timeValue;
    this.RefreshForm();
    return this.draft.timeValue;
  }

  SetNoteFilter(value) {
    this.noteFilter = value;
    this.RefreshNotes();
  }

  /** 清空这条意见。**「哪个阶段 · 哪个状态」留着** —— 清的是话，不是你翻到的地方。 */
  ClearDraft() {
    const state = this.draft.state;
    this.draft = NewDraft();
    this.draft.state = state;
    // 钉住的那一项随草稿一起解开：要是它指着别的阶段（刚给第 1 阶段提完意见、图还在第 12 阶段），
    // 这里就对回正在看的这一阶段；同一阶段里挑的那一步照旧留着。
    this.SyncNoteStateToPhase(this.phaseNumber);
    if (this.ui) {
      this.ui.text.value = "";
      this.ui.proposal.value = "";
      this.ui.timeValue.value = "";
    }
    this.map?.SetSketch([]);
    this.ArmMention(false);
    this.RefreshForm();
  }

  // ---------------------------------------------------------- 批注对话框
  /** 开合批注对话框。不给参数就是切换；`true` 是「本来就该让他看见」（图上动了手）。 */
  OpenNoteDialog(force) {
    const box = this.ui?.noteDialog;
    if (!box) return false;
    const open = force === undefined ? box.dataset.open !== "1" : !!force;
    if (open === (box.dataset.open === "1")) return open;
    box.dataset.open = open ? "1" : "0";
    this.ui.noteButton?.classList.toggle("on", open);
    if (!open) this.ArmMention(false);
    else this.RefreshForm();
    return open;
  }

  /** 下拉框默认落在哪儿：跟着实时时是实时正在跑的那一步，否则是在看那一阶段的第一步。 */
  DefaultNoteState() {
    if (this.followLive && this.live?.stepId && this.model.steps.some((step) => step.id === this.live.stepId)) {
      return `step:${this.live.stepId}`;
    }
    const phase = this.model.phases.find((entry) => entry.number === this.phaseNumber) || this.model.phases[0];
    const first = phase?.steps?.[0];
    return first ? `step:${first}` : `phase:${phase?.id ?? ""}`;
  }

  /**
   * 选「哪个阶段 · 哪个状态」。它决定这条批注的阶段 / 步骤 /（选了事实时）时刻。
   * **只 SetPhase + OpenPhase，不改 selection** —— 用户刚在图上点中的那个敌人
   * 正是他要说的那个，下拉框一换就把他丢掉是最气人的一种「帮忙」。
   */
  SetNoteState(value, { navigate = true, pin = false } = {}) {
    const resolved = this.ResolveNoteState(value);
    if (!resolved) return this.draft.state;
    this.draft.state = resolved;
    // 用户亲手在下拉框 / 左栏 / 时间轴上定过的，跟随实时换阶段时**不再自动挪**：
    // 否则在第 12 阶段打着、想给第 1 阶段的某件事提意见，下一拍就被拨回第 12 阶段。
    if (pin) this.draft.statePinned = true;
    const key = `${resolved.kind}:${resolved.id}`;
    if (this.ui?.noteState && this.ui.noteState.value !== key) this.ui.noteState.value = key;
    if (navigate && Number.isFinite(resolved.phaseNumber)) {
      this.SetPhase(resolved.phaseNumber);
      this.OpenPhase(resolved.phaseNumber);
    }
    this.RefreshForm();
    return resolved;
  }

  /**
   * `"step:Transfer"` → `{kind, id, phaseNumber, step}`。
   * 下拉框里没有这一项时（时间轴上点得到的事实不一定是某一步的过关条件）
   * **退到它所属的那一步**：面板上显示的和 draft 里记的必须是同一样东西。
   */
  ResolveNoteState(value) {
    const raw = String(value ?? "");
    const cut = raw.indexOf(":");
    const kind = cut > 0 ? raw.slice(0, cut) : "";
    const id = cut > 0 ? raw.slice(cut + 1) : "";
    const Has = (key) => !this.ui?.noteState || this.noteStateOptions?.has(key);
    if (kind === "fact") {
      const fact = this.model.facts[id];
      if (fact && Has(`fact:${id}`)) {
        return { kind: "fact", id, phaseNumber: fact.phaseNumber ?? this.phaseNumber, step: fact.step ?? null };
      }
      if (fact?.step) return this.ResolveNoteState(`step:${fact.step}`);
      return null;
    }
    if (kind === "step") {
      const step = this.model.steps.find((entry) => entry.id === id);
      if (!step) return null;
      if (Has(`step:${id}`)) {
        return { kind: "step", id, phaseNumber: step.phaseNumber ?? this.phaseNumber, step: id };
      }
      const owner = this.model.phases.find((entry) => entry.number === step.phaseNumber);
      return owner ? this.ResolveNoteState(`phase:${owner.id}`) : null;
    }
    if (kind === "phase") {
      const phase = this.model.phases.find((entry) => entry.id === id || entry.number === Number(id));
      if (!phase) return null;
      return { kind: "phase", id: phase.id, phaseNumber: phase.number, step: phase.steps?.[0] ?? null };
    }
    return null;
  }

  /**
   * 加一枚 @ 提及。阶段 / 步骤 / 事实不算提及 —— 它们是「挂在哪儿」，改下拉框就行。
   * 已经提过的不重复加；加完在 textarea 光标处插一个「@名字 」，让正文读得通。
   */
  AddMention(sel) {
    if (!sel || !sel.kind) return null;
    if (sel.kind === "phase" || sel.kind === "step" || sel.kind === "fact") {
      this.OpenNoteDialog(true);
      this.SetNoteState(`${sel.kind}:${sel.id}`, { navigate: false, pin: true });
      return null;
    }
    if (sel.kind === "note" || sel.kind === "sketch") return null;
    const id = sel.id === undefined ? null : sel.id;
    const hasPoint = Number.isFinite(sel.x) && Number.isFinite(sel.z);
    if (id === null && !hasPoint) return null;
    const mention = { kind: sel.kind, id, label: this.MentionLabel(sel.kind, id) };
    if (hasPoint) { mention.x = sel.x; mention.z = sel.z; }
    this.OpenNoteDialog(true);
    const key = MentionKey(mention);
    if (this.draft.mentions.some((one) => MentionKey(one) === key)) { this.RefreshForm(); return null; }
    this.draft.mentions.push(mention);
    this.InsertMentionText(mention.label);
    this.ArmMention(false);
    this.RefreshForm();
    return mention;
  }

  RemoveMention(kind, id) {
    const key = MentionKey({ kind, id: id === undefined ? null : id });
    const at = this.draft.mentions.findIndex((one) => MentionKey(one) === key);
    if (at < 0) return null;
    const removed = this.draft.mentions.splice(at, 1)[0];
    this.RefreshForm();
    return removed;
  }

  /** 「@ 点图选」：武装一次，下一次普通点击等同 Ctrl+点。俯视图那边命中后自动解除。 */
  ArmMention(on) {
    const want = !!on;
    if (want) this.OpenNoteDialog(true);
    this.map?.ArmMention?.(want);
    this.ui?.mentionButton?.classList.toggle("armed", want && !!this.map?.mentionArmed);
    return want;
  }

  /** 提及芯片上写的名字：组名 / 路线名说人话，别的按详情卡那一套称呼。 */
  MentionLabel(kind, id) {
    if (id === null || id === undefined) return KIND_TEXT[kind] || kind;
    if (kind === "encounter") return EncounterLabel(this.model, id);
    if (kind === "route") return RouteLabel(id);
    return this.TargetName(kind, id);
  }

  /** 在 textarea 光标处插入「@名字 」，并把 draft.text 同步过去。 */
  InsertMentionText(label) {
    const node = this.ui?.text;
    const insert = `@${label} `;
    if (!node) { this.draft.text = `${this.draft.text}${insert}`; return this.draft.text; }
    const value = node.value;
    const at = Number.isFinite(node.selectionStart) ? node.selectionStart : value.length;
    node.value = `${value.slice(0, at)}${insert}${value.slice(at)}`;
    this.draft.text = node.value;
    try { node.setSelectionRange(at + insert.length, at + insert.length); } catch (error) { /* 没聚焦 */ }
    return this.draft.text;
  }

  /** 右栏两个页签：详情 / 批注。记进 layout，下次开窗还停在这一页。 */
  SetDetailTab(tab) {
    const next = tab === "notes" ? "notes" : "detail";
    this.layout.detailTab = next;
    for (const [id, panel] of this.ui?.detailPanels || []) panel.dataset.on = id === next ? "1" : "0";
    for (const [id, button] of this.ui?.detailTabs || []) button.dataset.on = id === next ? "1" : "0";
    WriteLayout(this.layout);
    return next;
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

  /**
   * 这条批注说的是**哪个东西**。三级优先：
   *   ① 现在选中的那个（图上点的、左栏点的）；
   *   ② 没选中就用第一枚 @ 提及 —— 用户 Ctrl 点它的时候就是在指它；
   *   ③ 都没有才落到下拉框选的那一项（步骤 / 事实 / 阶段）。
   * 原来是「没选中一律落在阶段上」，于是所有「没点着东西但选了某一步」的意见
   * 全都挂在阶段上，agent 拿到手还得自己猜是哪一步。
   */
  DraftTarget() {
    const sel = this.selection;
    if (sel && sel.kind !== "note" && sel.kind !== "sketch") {
      const target = { kind: sel.kind, id: sel.id };
      if (Number.isFinite(sel.x) && Number.isFinite(sel.z)) { target.x = sel.x; target.z = sel.z; }
      if (sel.kind !== "point" || Number.isFinite(target.x)) return target;
    }
    const first = this.draft.mentions[0];
    if (first) {
      const target = { kind: first.kind };
      if (first.id !== null && first.id !== undefined) target.id = first.id;
      if (Number.isFinite(first.x) && Number.isFinite(first.z)) { target.x = first.x; target.z = first.z; }
      return target;
    }
    const state = this.draft.state || this.ResolveNoteState(this.DefaultNoteState());
    const phase = this.model.phases.find((entry) => entry.number === this.phaseNumber);
    if (!state) return { kind: "phase", id: phase?.id ?? String(this.phaseNumber) };
    return { kind: state.kind, id: state.id };
  }

  /** 挂在哪一步：下拉框说了算（选阶段时就是那一阶段的第一步）。 */
  DraftStep() {
    const state = this.draft.state;
    if (state?.step) return state.step;
    const phase = this.model.phases.find((entry) => entry.number === this.DraftPhaseNumber());
    return phase?.steps?.[0] ?? null;
  }

  DraftPhaseNumber() {
    const state = this.draft.state;
    return Number.isFinite(state?.phaseNumber) ? state.phaseNumber : this.phaseNumber;
  }

  /**
   * 指的是哪个时候。优先级：下拉框选了某件要等的事 → 那件事满足时；
   * 否则填了秒数 → 进入这一步之后第 n 秒；都没有 → 不限时刻。
   * 原来那个「时刻类型」下拉框没了：选了事实还要再选一次「某件事发生时」，
   * 是同一件事问两遍。
   */
  DraftTime() {
    if (this.draft.state?.kind === "fact") return { kind: "fact", fact: this.draft.state.id };
    const raw = String(this.draft.timeValue ?? "").trim();
    if (!raw) return null;
    const seconds = Number(raw);
    return Number.isFinite(seconds) ? { kind: "stageRelative", seconds } : null;
  }

  /** @ 提及连同各自「当时的真实数据」：agent 顺着它能查到被提到的那几个东西。 */
  DraftMentions() {
    return this.draft.mentions.map((mention) => {
      const out = { kind: mention.kind };
      if (mention.id !== null && mention.id !== undefined) out.id = mention.id;
      if (mention.label) out.label = mention.label;
      if (Number.isFinite(mention.x) && Number.isFinite(mention.z)) { out.x = mention.x; out.z = mention.z; }
      out.original = SnapshotTarget(this.model, out);
      return out;
    });
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
    const mentions = this.DraftMentions();
    const note = {
      id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      status: "open",
      level: LEVEL,
      missionVersion: this.model.version,
      target,
      phaseNumber: this.DraftPhaseNumber(),
      step: this.DraftStep(),
      time: this.DraftTime(),
      text,
      original: SnapshotTarget(this.model, target),
      proposal: this.DraftProposal(),
      sketch: { shapes: this.DraftShapes() },
      image: image ? `${id}.png` : null,
      resolution: null,
    };
    // 没提及就整个字段不写：旧批注本来就没有它，空数组只会让 notes.json 的 diff 多一行。
    if (mentions.length) note.mentions = mentions;
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
    if (this.ui?.filterDrawer) this.ApplyFilter();       // 「批注」那一行的条数跟着变
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
    // 批注快照属于某一条批注，还是用户当时正在看的局部；不能复用 `lastImage`。
    // 下载动作每次都按完整底图重新合成，这样刚切换的图层、筛选和新画的标记也在图里。
    let data = "";
    try {
      data = this.map?.ToFullPng?.({ pixelsPerMeter: 2 }) || "";
    } finally {
      // 离屏合成会临时重算图标尺寸、刻度与标签缓存；重画一次把交互画布的派生状态还原。
      this.map?.Redraw?.();
    }
    if (!IsPngData(data)) { this.SetStatus("完整俯视图出不了 PNG", true); return null; }
    const phase = String(this.phaseNumber || 1).padStart(2, "0");
    return this.DownloadPng(`orchestration_${LEVEL}_phase${phase}_full.png`, data);
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
    // 窗口变窄时先把分类抽屉夹回去，别让它把俯视图挤没。
    if (force && this.ui.filterDrawer?.dataset.open === "1") this.ApplyFilterWidth();
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
    this.RefreshFilterPanel();
    // 「@ 点图选」是一次性武装，命中后由俯视图那边自己解除 —— 这里跟着它的状态走，
    // 不自己记一份，否则按钮亮着而地图早就不等了。
    const armed = !!this.map?.mentionArmed;
    if (this.ui.mentionButton && this.ui.mentionButton.classList.contains("armed") !== armed) {
      this.ui.mentionButton.classList.toggle("armed", armed);
    }
  }

  /**
   * 顶栏只留**一枚**状态：跑没跑、跑到哪一阶段。
   *
   * 步骤、关卡时钟、这一步用时、正在等的那几件事都是**时间轴里的信息** ——
   * 顶栏再排一串小标签就是同一份数据在屏幕上出现两次，而两处迟早会对不上。
   * 它们现在住在时间轴：读数在「实际」行的名字底下，正在等的事是那一行末尾的空心标记。
   */
  RefreshHeader() {
    const live = this.live;
    const signature = live ? `1|${live.phaseNumber}` : "0";
    if (signature === this.headerSignature) return;
    this.headerSignature = signature;
    const El = this.El;
    const box = this.ui.liveStatus;
    box.textContent = "";
    box.dataset.hasRuntime = live ? "1" : "0";
    if (!live) { El("span", box, "还没有人在跑第一关", "tag idle"); return; }
    const phase = this.model.phases.find((entry) => entry.number === live.phaseNumber);
    const tag = El("span", box, "", "tag now");
    El("b", tag, "实时");
    El("span", tag, `第 ${live.phaseNumber} 阶段${phase ? ` · ${phase.title}` : ""}`);
    tag.title = "关卡时钟、这一步用时、正在等的事都在底下的时间轴上";
  }

  RefreshFlowState() {
    const live = this.live;
    const currentStep = live?.stepId || null;
    const currentIndex = currentStep ? this.model.steps.findIndex((step) => step.id === currentStep) : -1;
    for (const [id, node] of this.ui.steps) node.classList.toggle("now", id === currentStep);
    for (const [number, box] of this.ui.phases) {
      if (!number) continue;                       // 末尾那组「关卡结束」没有阶段状态
      const state = live && Number.isFinite(live.phaseNumber)
        ? (number === live.phaseNumber ? "now" : number < live.phaseNumber ? "done" : "todo") : "";
      if (box.dataset.phaseState === state) continue;
      box.dataset.phaseState = state;
      const label = box.querySelector(".pState");
      if (label) label.textContent = state === "now" ? "正在这里" : state === "done" ? "已走过" : "";
    }
    // 当前阶段自己展开、自己滚到看得见 —— 十八组全收起来时，找「我现在在哪」不该靠手滚。
    if (live && Number.isFinite(live.phaseNumber) && live.phaseNumber !== this.shownPhase) {
      this.shownPhase = live.phaseNumber;
      this.OpenPhase(live.phaseNumber, { scroll: true });
    }
    const hint = live ? "" : "还没有人在跑第一关。这里显示的是设计好的编排 —— 点阶段、步骤、事实都能看；"
      + "想看实时的，按某个阶段的「从这里试玩」。";
    if (this.ui.flowHint.textContent !== hint) this.ui.flowHint.textContent = hint;
    this.ui.flowHint.style.display = hint ? "" : "none";
    for (const entry of this.ui.facts) {
      let state = "none";
      let glyph = "·";
      let title = "还没开始跑，看不出满没满足";
      if (live) {
        if (live.facts.has(entry.factId)) { state = "ok"; glyph = "✓"; title = "已经做到了"; }
        else if (entry.step.index === currentIndex) { state = "wait"; glyph = "…"; title = "正在等这件事"; }
        else if (entry.step.index < currentIndex) { state = "past"; glyph = "·"; title = "这一步已经走过了"; }
        else { state = "future"; glyph = "—"; title = "还没走到这一步"; }
      }
      if (entry.row.dataset.factState !== state) entry.row.dataset.factState = state;
      const mark = entry.row.firstChild;
      if (mark && mark.textContent !== glyph) mark.textContent = glyph;
      if (entry.row.title !== title) entry.row.title = title;
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
    for (const [number, cell] of this.ui.laneHeads || []) cell.classList.toggle("now", number === this.phaseNumber);
  }

  RefreshForm() {
    if (!this.ui?.sketch) return;
    const El = this.El;
    const shapes = this.draft.shapes;
    this.ui.sketch.textContent = "";
    this.ui.sketch.classList.toggle("filled", shapes.length > 0);
    if (!shapes.length) {
      this.ui.sketch.textContent = "还没画。用工具条上的圈选 / 箭头 / 折线 / 标注在图上画。";
    } else {
      const chips = El("div", this.ui.sketch, "", "chips");
      chips.style.marginTop = "0";
      shapes.forEach((shape, index) => {
        const chip = El("span", chips, `${ShapeText(shape)} ✕`, "chip");
        chip.dataset.shapeIndex = String(index);
        chip.title = "点一下删掉这一笔（在图上选中它按 Delete 也行）";
        chip.addEventListener("click", () => this.RemoveShape(index));
      });
    }
    // 候选位也要有 ✕：它是 DraftShapes 的最后一枚，加上去之后本来没处删。
    const candidate = this.draft.candidate;
    this.ui.candidate.textContent = "";
    this.ui.candidate.classList.toggle("filled", !!candidate);
    if (!candidate) {
      this.ui.candidate.textContent = "还没定建议挪到哪儿。用「候选位」工具把选中的敌人拖过去。";
    } else {
      const chips = El("div", this.ui.candidate, "", "chips");
      chips.style.marginTop = "0";
      const chip = El("span", chips,
        `${candidate.memberId || "选中的东西"} 挪到 (${Round(candidate.x)}, ${Round(candidate.z)}) ✕`, "chip");
      chip.dataset.noteAction = "candidate-clear";
      chip.title = "点一下取消这个候选位";
      chip.addEventListener("click", () => this.SetCandidate(null));
    }
    this.RefreshMentions();
    if (this.ui.noteState && this.draft.state) {
      const key = `${this.draft.state.kind}:${this.draft.state.id}`;
      if (this.ui.noteState.value !== key) this.ui.noteState.value = key;
    }
  }

  /** @ 提及那一行：每枚「类别 · 名字 ✕」，加一颗「@ 点图选」。 */
  RefreshMentions() {
    const box = this.ui?.mentions;
    if (!box) return;
    const El = this.El;
    box.textContent = "";
    if (!this.draft.mentions.length) {
      El("span", box, "还没 @ 谁", "muted").style.fontSize = "11px";
    }
    for (const mention of this.draft.mentions) {
      const chip = El("span", box, "", "chip on");
      chip.dataset.noteMention = MentionKey(mention);
      El("span", chip, `${KIND_TEXT[mention.kind] || mention.kind} · ${mention.label || mention.id} ✕`);
      chip.title = `${KIND_TEXT[mention.kind] || mention.kind} ${mention.id ?? ""}：点一下去掉这一枚`;
      chip.addEventListener("click", () => this.RemoveMention(mention.kind, mention.id));
    }
    this.ui.mentionButton?.classList.toggle("armed", !!this.map?.mentionArmed);
  }

  SetStatus(text, warn) {
    this.statusText = text;
    if (!this.ui?.status) return;
    this.ui.status.textContent = text;
    this.ui.status.className = `statusBar ${warn ? "warn" : "ok"}`;
    // 对话框常常是关着的：同一句话在「批注」页签上也留一份，否则「重新加载」
    // 按下去什么都不动，看着像按钮坏了。
    if (this.ui.notesHint) this.ui.notesHint.textContent = text;
  }

  RefreshDetail() {
    if (!this.ui) return;
    const El = this.El;
    const sel = this.selection;
    this.ui.title.textContent = "";
    if (!sel) {
      El("span", this.ui.title, "还没有选中东西");
      this.ui.owner.textContent = "";
      El("div", this.ui.owner, "在中间的图上点一个敌人、锚点、触发区或路线；"
        + "也可以在左边点阶段、步骤、要求的那件事，或者点时间轴上的标记。", "muted");
      this.ui.json.textContent = "—";
      this.ui.related.textContent = "";
      El("div", this.ui.related, "选中一个对象，这里会列出它身上的批注。", "empty");
      return;
    }
    El("span", this.ui.title, KIND_TEXT[sel.kind] || sel.kind, "kindTag");
    El("b", this.ui.title, sel.kind === "sketch"
      ? ShapeText(this.DraftShapes()[sel.index] ?? null)
      : (sel.id === undefined || sel.id === null
        ? `(${Round(sel.x)}, ${Round(sel.z)})` : this.TargetName(sel.kind, sel.id)));
    if (sel.kind === "threat" && this.ThreatOrder(sel.id) > 0) El("code", this.ui.title, sel.id);
    this.ui.owner.textContent = "";
    for (const row of this.DescribeSelection(sel)) {
      const line = El("div", this.ui.owner, "", "kv");
      El("span", line, row.k, "k");
      const value = El("span", line, "", "v");
      El("span", value, row.v);
      if (row.code) El("code", value, row.code);
    }
    // 草图不是编排里的东西，拍它的快照只会得到一句 missing；这里直接给那一笔本身。
    const snapshot = sel.kind === "sketch"
      ? (this.DraftShapes()[sel.index] ?? { kind: "sketch", index: sel.index, missing: true })
      : SnapshotTarget(this.model, { kind: sel.kind, id: sel.id, x: sel.x, z: sel.z });
    this.ui.json.textContent = JSON.stringify(snapshot, null, 2);
    this.RefreshRelatedNotes(sel);
  }

  /** 转运区两处威胁按事实表顺序编号。 */
  ThreatOrder(threatId) { return this.model.transferThreats.findIndex((one) => one.id === threatId) + 1; }

  /** 界面上这个对象该怎么称呼（转运威胁按事实表顺序编号，其余使用自身编号）。 */
  TargetName(kind, id) {
    if (kind === "threat") {
      const order = this.ThreatOrder(id);
      if (order > 0) return `第 ${order} 处威胁`;
    }
    return String(id ?? "");
  }

  /** 「转运区第 2 处威胁，loadingThreatResolved 之后出现；解除后记 alleyThreatResolved」。 */
  ThreatSentence(threatId) {
    const order = this.ThreatOrder(threatId);
    const threat = order > 0 ? this.model.transferThreats[order - 1] : null;
    if (!threat) return SPAWN_TEXT.threat;
    const when = threat.after ? `${threat.after} 之后出现` : `进入 ${threat.step} 即出现`;
    return `转运区第 ${order} 处威胁，${when}；解除后记 ${threat.resolved}`;
  }

  /**
   * 反查：属于哪组、哪步生成、何时/何条件激活、路线点、引用它的事实。
   * 一律「左边是问题、右边是人话」，表里的编号只当尾巴上的等宽小字。
   */
  DescribeSelection(sel) {
    const model = this.model;
    const rows = [];
    const owner = sel.id ? FindOwner(model, sel.id) : null;
    const Add = (k, v, code) => { if (v || code) rows.push({ k, v: v === undefined || v === null ? "" : String(v), code }); };
    const At = (point) => `(${Round(point?.x)}, ${Round(point?.z)})`;
    if (sel.kind === "member" || sel.kind === "encounter") {
      const encounter = owner?.encounter;
      const member = owner?.member;
      const layout = this.map?.phaseLayout || this.PhaseLayoutNow();
      const phaseState = encounter
        ? layout?.encounters?.find((entry) => entry.id === encounter.id)?.state : null;
      if (encounter) {
        Add("属于哪组", `第 ${encounter.phaseNumber ?? "—"} 阶段出场的一组`
          + `${encounter.deferred ? "（这一阶段里要晚一点才放）" : ""}`, encounter.id);
        const spawn = encounter.spawn || {};
        const threat = model.transferThreats.find((entry) => entry.id === encounter.id);
        if (threat) {
          Add("怎么出现", this.ThreatSentence(threat.id), threat.id);
        } else {
          const where = [];
          if (spawn.step) where.push(`进入步骤 ${spawn.step} 时`);
          if (spawn.fact) where.push(`等「${DescribeFact(model, spawn.fact)}」之后`);
          Add("怎么出现", `${SPAWN_TEXT[spawn.kind] || spawn.kind || "—"}`
            + `${where.length ? `：${where.join("，")}` : ""}`, spawn.step || spawn.fact || undefined);
        }
        if (encounter.standbyUntil) {
          Add("出场后先待命", `等「${DescribeFact(model, encounter.standbyUntil)}」之后才动`, encounter.standbyUntil);
        }
        if (encounter.dormant) {
          const wake = encounter.wake || {};
          Add("放下时是睡的", wake.kind === "playerWithinM"
            ? `玩家走到 ${wake.radiusM} 米内才醒（步骤 ${wake.step}）`
            : wake.fact ? `等「${DescribeFact(model, wake.fact)}」才醒` : "醒来条件没写");
        }
        if (encounter.release) Add("放行方式", RELEASE_TEXT[encounter.release.kind] || "见原始数据", encounter.release.kind);
        if (encounter.note) Add("备注", encounter.note);
        if (phaseState) Add(`第 ${this.phaseNumber} 阶段`, STATE_TEXT[phaseState] || phaseState);
      }
      if (member) {
        Add("出生点", At(member));
        const marks = [];
        if (member.hold) marks.push("钉在原地不追");
        if (member.bayonet) marks.push("带刺刀");
        if (member.reserve) marks.push("预备队");
        if (Number.isFinite(member.releaseDelayS) && member.releaseDelayS > 0) marks.push(`出场后等 ${member.releaseDelayS} 秒`);
        Add("武器", member.weapon);
        if (marks.length) Add("特点", marks.join(" · "));
        if (member.tactic) {
          Add("会怎么动", `沿 ${member.tactic.points.length} 个路点走，放行后再等 ${member.tactic.delay} 秒`
            + `${member.tactic.near ? `；而且玩家要先走到 ${At(member.tactic.near)} 的 ${member.tactic.nearM} 米内` : ""}`);
        } else Add("会怎么动", "不动，守在原地");
        if (member.assaultLane) Add("跃进线", `${member.assaultLane.length} 个点（前沿那条交替跃进的线）`);
        if (Number.isFinite(member.clearedAtPhase)) Add("跳关口径", `从第 ${member.clearedAtPhase} 阶段起算他已经被打掉`);
        // 「现在」永远有一行。这一局里有这个人就写他的死活与位置（击毙之后布设表、
        // 图上的灰角标与这里说的必须是同一件事）；没有他就写这一阶段的设计状态 ——
        // 空着会让人以为面板没接上运行时。
        const enemy = this.live?.enemies?.find((entry) => entry.id === member.id);
        if (enemy) {
          Add("现在", enemy.alive
            ? `活着 · ${At(enemy)}${enemy.dormant ? "（还睡着）" : ""}`
            : "已击毙");
        } else if (this.live) {
          Add("现在", `这一局里没有他 · 第 ${this.phaseNumber} 阶段是「${STATE_TEXT[phaseState] || phaseState || "未出现"}」`);
        } else {
          Add("现在", `还没有人在跑这一关 · 第 ${this.phaseNumber} 阶段是「${STATE_TEXT[phaseState] || phaseState || "未出现"}」`);
        }
      }
    } else if (sel.kind === "fact") {
      const fact = model.facts[sel.id];
      Add("怎么算做到", DescribeFact(model, sel.id));
      if (fact) {
        Add("属于", `步骤 ${fact.step ?? "—"}（第 ${fact.phaseNumber ?? "—"} 阶段）`, `kind=${fact.kind}`);
        if (fact.source) Add("代码里在哪", "运行时的这个方法记的", fact.source);
        if (fact.requires?.length) {
          Add("得先做到", fact.requires.map((one) => DescribeFact(model, one)).join("；"), fact.requires.join(" / "));
        }
      }
      const users = model.steps.filter((step) => step.requirements.includes(sel.id)).map((step) => step.id);
      Add("谁在等它", users.length ? `${users.length} 个步骤把它当过关条件` : "没有步骤等它 —— 它只负责触发编排",
        users.join(" / ") || undefined);
      if (this.live) Add("现在", this.live.facts.has(sel.id) ? "已经做到了" : "还没做到");
    } else if (sel.kind === "step") {
      const step = model.steps.find((entry) => entry.id === sel.id);
      if (step) {
        Add("在哪一段", `第 ${step.phaseNumber} 阶段的第 ${step.index + 1} 步`);
        Add("目标", step.objective);
        if (step.cue) Add("对白", "这一步会播一段", step.cue);
        if (step.minimumSeconds) Add("最短时长", `至少停留 ${step.minimumSeconds} 秒`);
        Add("过关条件", step.requirements.length ? `${step.requirements.length} 件事都做到才走下一步` : "没有条件，走完就过",
          step.requirements.join(" / ") || undefined);
        Add("会放出敌军", step.spawns.length ? `${step.spawns.length} 组` : "这一步不放人",
          step.spawns.join(" / ") || undefined);
        if (step.guidance) Add("指引", step.guidance.label, step.guidance.route || undefined);
      }
    } else if (sel.kind === "phase") {
      const phase = model.phases.find((entry) => entry.id === sel.id || entry.number === Number(sel.id));
      if (phase) {
        Add("阶段", `第 ${phase.number} 个 · ${phase.title}`, phase.id);
        Add("包含步骤", `${phase.steps.length} 个`, phase.steps.join(" / "));
        Add("从这里试玩时", `玩家出生在 ${At(phase.spawn)}`);
      }
    } else if (sel.kind === "route") {
      const points = model.routes[sel.id] || [];
      Add("路线", `${points.length} 个点`, sel.id);
      if (points.length) Add("从哪到哪", `${At(points[0])} → ${At(points[points.length - 1])}`);
      const users = model.steps.filter((step) => step.guidance?.route === sel.id).map((step) => step.id);
      Add("谁拿它做指引", users.length ? `${users.length} 个步骤` : "没有步骤拿它做指引", users.join(" / ") || undefined);
    } else if (sel.kind === "zone") {
      const zone = model.zones.find((entry) => entry.id === sel.id);
      if (zone) {
        Add("这是什么", ZONE_TEXT[zone.kind] || zone.kind, zone.kind);
        if (Number.isFinite(zone.radiusM)) Add("范围", `以 ${At(zone)} 为心、半径 ${zone.radiusM} 米的圆`);
        else Add("范围", `东西 ${Round(zone.minX)} 到 ${Round(zone.maxX)}、南北 ${Round(zone.minZ)} 到 ${Round(zone.maxZ)} 的方块`);
        if (zone.step) Add("属于步骤", zone.step);
        if (zone.fact && model.facts[zone.fact]) Add("它判的是", DescribeFact(model, zone.fact), zone.fact);
      }
    } else if (sel.kind === "anchor") {
      const anchor = model.anchors[sel.id];
      if (anchor) Add("位置", At(anchor), sel.id);
      const users = Object.values(model.facts).filter((fact) => fact.anchor === sel.id).map((fact) => fact.id);
      Add("谁以它为准", users.length ? `${users.length} 件事拿它量距离` : "暂时没有事情用到它", users.join(" / ") || undefined);
    } else if (sel.kind === "friendly") {
      const friendly = model.friendlies.find((entry) => entry.id === sel.id);
      if (friendly) {
        Add("这是什么", FRIENDLY_TEXT[friendly.kind] || "自己人的位置", friendly.kind);
        Add("位置", At(friendly));
        if (friendly.step) Add("属于步骤", friendly.step);
      }
      // 班里那几个人只存在于这一局（编排表里没有他们）：认不出来就按实时的说。
      const mate = this.live?.squad?.find((entry) => entry.id === sel.id);
      if (mate) {
        Add("这是什么", "班里的人（这一局实时的）", sel.id);
        Add("现在", mate.alive ? `活着 · ${At(mate)}` : "已经牺牲了");
      }
    } else if (sel.kind === "sketch") {
      const shape = this.DraftShapes()[sel.index] || null;
      if (!shape) Add("说明", "这一笔已经删掉了");
      else {
        Add("这是什么", SHAPE_KIND_TEXT[shape.type] || shape.type);
        if (shape.type === "circle") Add("范围", `以 ${At(shape)} 为心、半径 ${Round(shape.r)} 米的圈`);
        else if (shape.type === "arrow") Add("从哪到哪", `${At(shape.from)} → ${At(shape.to)}`);
        else if (shape.type === "path") Add("折线", `${shape.points?.length ?? 0} 个点，从 ${At(shape.points?.[0])} 起`);
        else if (shape.type === "label") Add("写的是", shape.text || "（空）");
        else if (shape.type === "ghost") Add("位置", `建议把 ${shape.memberId || "选中的东西"} 挪到 ${At(shape)}`);
        Add("怎么删掉", "按 Delete，或点对话框里那枚芯片的 ✕");
      }
    } else if (sel.kind === "threat") {
      const index = model.transferThreats.findIndex((entry) => entry.id === sel.id);
      const threat = index >= 0 ? model.transferThreats[index] : null;
      if (threat) {
        Add("这是什么", `转运区的第 ${index + 1} 处威胁（一共 ${model.transferThreats.length} 处）`, threat.id);
        Add("怎么出现", threat.after ? `${threat.after} 之后出现` : `进入 ${threat.step} 即出现`, threat.after || threat.step);
        Add("解除后记", "解除这处威胁后记录事实", threat.resolved);
        if (threat.hint) Add("地图位置", "由这个锚点标出", threat.hint);
      }
    } else if (sel.kind === "point") {
      Add("位置", `地图上的一点 ${At(sel)}`);
    }
    if (owner?.facts?.length) {
      Add("牵连到的事情", `${owner.facts.length} 件`, owner.facts.join(" / "));
    }
    if (!rows.length) Add("说明", "这个对象在编排数据里没有更多内容了");
    return rows;
  }

  RefreshRelatedNotes(sel) {
    const related = this.notes.filter((note) => note.target?.kind === sel.kind && note.target?.id === sel.id);
    this.ui.related.textContent = "";
    if (!related.length) {
      this.El("div", this.ui.related, "这个对象上还没有批注。下面写一条，就挂在它身上。", "empty");
      return;
    }
    for (const note of related) this.ui.related.appendChild(this.NoteNode(note));
  }

  RefreshNotes() {
    if (!this.ui) return;
    const list = this.noteFilter === "all" ? this.notes : this.notes.filter((note) => note.status === this.noteFilter);
    for (const [value, button] of this.ui.filters) button.classList.toggle("on", value === this.noteFilter);
    this.ui.list.textContent = "";
    if (!list.length) {
      this.El("div", this.ui.list, this.notes.length
        ? `${this.notes.length} 条批注里没有「${NOTE_FILTER_TEXT[this.noteFilter] || this.noteFilter}」的。换个筛选看看。`
        : "还没有批注。在图上选中一个东西，上面写一句话，点「保存草稿」。", "empty");
      return;
    }
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
    El("span", head, NOTE_STATUS_TEXT[note.status] || note.status, `st ${note.status}`);
    El("span", head, `${KIND_TEXT[note.target?.kind] || note.target?.kind || "?"} `
      + this.TargetName(note.target?.kind, note.target?.id), "who");
    El("span", head, `第 ${note.phaseNumber ?? "—"} 阶段`, "muted");
    if (note.step) El("code", head, note.step);
    if (this.localIds.has(note.id)) {
      El("span", head, "本地草稿", "warn").title = "还没写进仓库，只存在这台机器上";
    }
    if (note.verified) El("span", head, "已核对", "ok");
    El("div", box, note.text, "txt");
    if (note.time) {
      El("div", box, `指的时候：${note.time.kind === "stageRelative" ? `阶段内第 ${note.time.seconds} 秒`
        : note.time.kind === "fact" ? `「${DescribeFact(this.model, note.time.fact)}」的时候`
          : `关卡时钟第 ${Round(note.time.atS)} 秒`}`, "line");
    }
    if (note.proposal) {
      El("div", box, `建议：${PROPOSAL_TEXT[note.proposal.kind] || note.proposal.kind}`
        + `${note.proposal.to ? ` 到 (${Round(note.proposal.to.x)}, ${Round(note.proposal.to.z)})` : ""}`
        + `${Number.isFinite(note.proposal.seconds) ? ` ${note.proposal.seconds} 秒` : ""}`
        + `${note.proposal.points?.length ? `，换成一条 ${note.proposal.points.length} 点的新路线` : ""}`, "line");
    }
    if (note.sketch?.shapes?.length) El("div", box, `画了：${note.sketch.shapes.map(ShapeText).join("、")}`, "line");
    const localImage = this.localImages.get(note.id) || null;
    if (note.image) {
      El("div", box, localImage ? "图还在这台机器上，下次能写盘时自动补传" : `图：Notes/${note.level}/${note.image}`, "line");
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
      + `${note.resolution.commit ? `（${note.resolution.commit}）` : ""}`, "line ok");
    // 「原设置已变化」：拿现在的模型再拍一张快照逐字段对，新旧值并排列出来。
    let drift = null;
    try { drift = NoteDrift(note, this.model); } catch (error) { drift = null; }
    if (drift?.changed) {
      box.classList.add("drift");
      box.dataset.noteDrift = String(drift.diff.length);
      const alert = El("div", box, "", "alert");
      El("div", alert, `写这条批注时记下的设置已经变了（${drift.diff.length} 处）`, "ah");
      const table = El("div", alert, "", "d");
      table.dataset.noteDriftDetail = note.id;
      for (const row of drift.diff.slice(0, 6)) {
        El("span", table, row.path || "整体", "p");
        El("span", table, JSON.stringify(row.from), "from");
        El("span", table, "→", "muted");
        El("span", table, JSON.stringify(row.to), "to");
      }
      if (drift.diff.length > 6) El("div", alert, `还有 ${drift.diff.length - 6} 处，见原始数据`, "muted");
    }
    const bar = El("div", box, "", "bar");
    const locate = El("button", bar, "在图上找到它");
    locate.type = "button";
    locate.dataset.noteAction = "locate";
    locate.addEventListener("click", () => this.LocateNote(note.id));
    const verify = El("button", bar, note.verified ? "已核对" : "标记已核对");
    verify.type = "button";
    verify.dataset.noteAction = "verify";
    verify.title = "agent 改完之后，自己看过了就点它";
    verify.addEventListener("click", () => this.MarkVerified(note.id));
    if (localImage) {
      const download = El("button", bar, "下载这张图", "ghost");
      download.type = "button";
      download.dataset.noteAction = "image";
      download.title = "把这条批注的那张俯视图另存出去（它还只在本机）";
      download.addEventListener("click", () => this.DownloadNoteImage(note.id));
    }
    // 编号单独一行：跟按钮挤在一行会被推出卡片右边缘截掉，而它正是交接时对账的钥匙。
    El("div", box, note.id, "noteId").title = "这条批注的编号，交接文本里按它对账";
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
/** 工具条上的小图标：描边 SVG，颜色跟着按钮走。 */
function ToolIcon(doc, id) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  for (const d of TOOL_ICONS[id] || []) {
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** 三栏宽度与时间轴的折叠状态：记在主窗口的 localStorage 里，下次开窗照旧。 */
function ReadLayout() {
  const fallback = { left: 344, right: 380, timeline: true, detailTab: "detail" };
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved) return fallback;
    return {
      left: Number.isFinite(saved.left) ? saved.left : fallback.left,
      right: Number.isFinite(saved.right) ? saved.right : fallback.right,
      timeline: saved.timeline !== false,
      detailTab: saved.detailTab === "notes" ? "notes" : "detail",
    };
  } catch (error) { return fallback; }
}

function WriteLayout(layout) {
  try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (error) { /* 隐私模式 */ }
}

/** 分类抽屉的开合、两个页签各自的宽度、四个小节的折叠：也记在 localStorage。 */
function ReadFilterLayout() {
  const fallback = {
    // 220 是分类树够用的最窄一档：再宽就从俯视图身上抠了（1380 的窗口里中栏只有 640 上下）。
    open: true, tab: "tree", width: 220, tableWidth: 620,
    sections: { groups: true, states: true, weapons: false, behaviors: false },
  };
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (!saved) return fallback;
    return {
      open: saved.open !== false,
      tab: saved.tab === "table" ? "table" : "tree",
      width: Number.isFinite(saved.width) ? saved.width : fallback.width,
      tableWidth: Number.isFinite(saved.tableWidth) ? saved.tableWidth : fallback.tableWidth,
      sections: { ...fallback.sections, ...(saved.sections || {}) },
    };
  } catch (error) { return fallback; }
}

function WriteFilterLayout(layout) {
  try { window.localStorage.setItem(FILTER_KEY, JSON.stringify(layout)); } catch (error) { /* 隐私模式 */ }
}

/** 筛选状态变没变的廉价指纹（集合要排序，不然同一份状态每次算出不同的串）。 */
function FilterStateSignature(state) {
  const parts = [state.preset, state.onlyNewThisPhase ? "new" : "-",
    state.solo ? `${state.solo.kind}:${state.solo.id}` : "-"];
  for (const key of ["categories"]) {
    parts.push(Object.entries(state[key]).filter(([, on]) => !on).map(([id]) => id).sort().join("+") || "all");
  }
  for (const key of ["encounters", "states", "weapons", "behaviors", "friendlyKinds", "zoneKinds", "routes"]) {
    parts.push(state[key] ? [...state[key]].sort().join("+") : "*");
  }
  return parts.join("|");
}

/**
 * 图标登记表在不在：只看主窗口的 import map 有没有登记它。
 * 直接 import 试一把也行，但取不到时浏览器会把一条 404 打进控制台，
 * 而「控制台没有红字」是别的闸门在守的东西。
 */
function IconModuleAvailable() {
  try {
    const node = document.querySelector('script[type="importmap"]');
    return !!node && node.textContent.includes(ICON_MODULE);
  } catch (error) { return false; }
}

/** 图标文件的绝对地址：弹窗文档是 about:blank，相对路径在那儿解不出来。 */
function AssetUrl(file) {
  try { return new URL(String(file).replace(/^\.\//, ""), window.location.href).href; } catch (error) { return ""; }
}

/** 布设表「实时」那一格：这一局里有这个人就写活着/阵亡与位置，没有就写他这一阶段的状态。 */
function LiveCellText(row) {
  return row.liveText || row.stateText || "—";
}

/** 一笔草图在界面上叫什么（工具条上那七把里的名字，别另起一套）。 */
const SHAPE_KIND_TEXT = {
  circle: "圈选", arrow: "箭头", path: "折线", label: "标注", ghost: "候选位",
};

function ShapeText(shape) {
  if (!shape) return "（这一笔没了）";
  if (shape.type === "circle") return `圈选 半径 ${Round(shape.r)} 米`;
  if (shape.type === "arrow") return "箭头";
  if (shape.type === "path") return `折线 ${shape.points?.length ?? 0} 点`;
  if (shape.type === "label") return `标注「${shape.text || ""}」`;
  if (shape.type === "ghost") return `候选位 ${shape.memberId || ""}`.trim();
  return SHAPE_KIND_TEXT[shape.type] || shape.type;
}

/** 一条空草稿。`state` 由 SetNoteState 填，不在这儿猜（那时还不知道在看哪一阶段）。 */
function NewDraft() {
  return { text: "", proposal: "", timeValue: "", shapes: [], candidate: null, mentions: [], state: null, statePinned: false };
}

/** @ 提及的去重键：有编号按编号，地图上一点按坐标。 */
function MentionKey(mention) {
  if (!mention) return "";
  if (mention.id === null || mention.id === undefined) {
    return `${mention.kind}:${Round(mention.x)},${Round(mention.z)}`;
  }
  return `${mention.kind}:${mention.id}`;
}

/** 焦点在不在输入控件上 —— Delete / Esc 那两条快捷键只在「不在打字」时才接管。 */
function Typing(node) {
  const tag = node && node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!node?.isContentEditable;
}

function NoteStateOption(doc, value, label) {
  const option = doc.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

/**
 * 班里那几个人的实时位置。`runtime.squad` 是 `companion.Handle(castId)` 拿到的
 * **演员句柄**数组（开场之前是空的 / undefined），这里折成模型层认得的形状。
 * 名字走文本表（`Data_Companions` 的 labelKey）—— 查不到就退回 castId，
 * 少一条译文不该让图上那个人没名字。
 */
function SquadState(runtime) {
  const list = Array.isArray(runtime?.squad) ? runtime.squad : [];
  const out = [];
  for (const actor of list) {
    const castId = actor?.castId || actor?.id || null;
    const at = actor?.position;
    if (!castId || !at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) continue;
    out.push({
      id: castId,
      label: CompanionLabel(castId) || String(castId),
      x: at.x, z: at.z,
      alive: !!actor.alive,
      yaw: Number.isFinite(actor.yaw) ? actor.yaw : null,
    });
  }
  return out;
}

function CompanionLabel(castId) {
  const key = COMPANION_CAST[castId]?.labelKey;
  if (!key) return "";
  const text = T(key);
  return text && text !== key ? text : "";
}

function MarkerSeconds(entry) {
  // **只有真的有秒数的那几类才带秒数。** condition / entry / wake 由玩家行为触发，
  // 给它们编一个秒数就是把「设计的预定安排」和「实际发生」混成一锅。
  if (entry.kind === "timed") return Number.isFinite(entry.atS) ? entry.atS : entry.minimumSeconds;
  if (entry.kind === "delay") return entry.atS;
  return undefined;
}

function MarkerSel(entry) {
  if (entry.kind === "threat" && entry.encounterId) return { kind: "threat", id: entry.encounterId };
  if (entry.factId) return { kind: "fact", id: entry.factId };
  if (entry.memberId) return { kind: "member", id: entry.memberId };
  if (entry.encounterId) return { kind: "encounter", id: entry.encounterId };
  if (entry.step) return { kind: "step", id: entry.step };
  return null;
}

/**
 * live 变没变的廉价指纹：步骤、时钟（0.5 s 粒度）、玩家格点**与朝向**、
 * 敌人生死与位置、班里那几个人的位置与生死。
 *
 * 朝向必须进指纹：玩家原地转身时位置一格没动、时钟走得也不够半秒，图上那枚
 * 箭头就会钉在旧方向上不动 —— 用户实测里第一条说的就是这个。量化到约 2°
 * （`yaw * 30` 四舍五入，一格约 1.9°）：再细就是每帧重画，再粗就看得出跳。
 */
function LiveSignature(live) {
  let hash = live.enemies.length;
  for (const enemy of live.enemies) {
    hash = (hash * 31 + (enemy.x | 0) * 7 + (enemy.z | 0) * 13 + (enemy.alive ? 1 : 0) + (enemy.dormant ? 2 : 0)) % 1000000007;
  }
  const player = live.player
    ? `${Math.round(live.player.x * 2)},${Math.round(live.player.z * 2)},${Math.round((live.player.yaw || 0) * 30)}`
    : "-";
  let squad = (live.squad || []).length;
  for (const mate of live.squad || []) {
    squad = (squad * 31 + Math.round(mate.x * 2) * 7 + Math.round(mate.z * 2) * 13
      + (mate.alive ? 1 : 0) + Math.round((mate.yaw || 0) * 30) * 3) % 1000000007;
  }
  return `${live.stepId}|${Math.round((live.time || 0) * 2)}|${player}|${live.facts.size}|${hash}|${squad}`;
}

export default OrchestrationEditor;
