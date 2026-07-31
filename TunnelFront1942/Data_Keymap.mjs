// 《地下长城 · 冀中1942》 —— 键位唯一常量源（AGENTS.md §六.8）。
// 全部键盘/鼠标绑定只允许从这里引用；Script_Main 的输入映射与 UI 的键位表共用本表。
// 纯常量模块：无 DOM 依赖。code 用 KeyboardEvent.code（布局无关）。

export const keymap = Object.freeze({
  // ---- 视图 ----
  layerToggle: Object.freeze({ code: "KeyQ", label: "Q", group: "视图", desc: "切换地上／地下（200ms 补间）" }),
  peek: Object.freeze({ code: "Space", label: "Space（按住）", group: "视图", hold: true,
                        desc: "透视窥视另一层（只读，禁下令）；敌阶段播报时=快进" }),
  zoomWheel: Object.freeze({ wheel: true, label: "滚轮", group: "视图", desc: "缩放（3 档；触控板小增量会累加）" }),
  panUp: Object.freeze({ code: "KeyW", label: "W", group: "视图", desc: "平移（上）" }),
  panLeft: Object.freeze({ code: "KeyA", label: "A", group: "视图", desc: "平移（左）" }),
  panDown: Object.freeze({ code: "KeyS", label: "S", group: "视图", desc: "平移（下）" }),
  panRight: Object.freeze({ code: "KeyD", label: "D", group: "视图", desc: "平移（右）" }),
  panMouse: Object.freeze({ button: 1, label: "拖拽", group: "视图",
                            desc: "平移（左／中／右键按住拖动皆可；触屏单指拖动）" }),

  // ---- 选取与下令 ----
  select: Object.freeze({ button: 0, label: "左键", group: "操作",
                          desc: "单击选中（单位＞地物＞地形，当前层优先）；同格多个单位反复点即循环；按住拖动＝平移" }),
  order: Object.freeze({ button: 2, label: "右键", group: "操作",
                         desc: "单击移动／下令（降低入口隐蔽的操作需二次右键确认）；按住拖动＝平移" }),
  hoverPreview: Object.freeze({ hover: true, label: "悬停", group: "操作",
                                desc: "选中单位后停在可达格上＝实时路径预览（管线＋方向箭头＋落点环＋「几步·余几 MP」）" }),
  crossLayerPick: Object.freeze({ button: 0, alt: true, label: "Alt+点击", group: "操作", desc: "强制选取另一层" }),
  nextUnit: Object.freeze({ code: "Tab", label: "Tab", group: "操作", desc: "下一个未行动单位（自动落层跳转）" }),
  cancel: Object.freeze({ code: "Escape", label: "Esc", group: "操作",
                          desc: "逐级返回：目标模式→取消选中→菜单（3 次必达空闲）" }),

  // ---- 单位动作 ----
  dig: Object.freeze({ code: "KeyB", label: "B", group: "动作", desc: "挖掘（选目标格）" }),
  ambush: Object.freeze({ code: "KeyV", label: "V", group: "动作", desc: "伏击" }),
  feint: Object.freeze({ code: "KeyF", label: "F", group: "动作", desc: "佯动" }),
  hide: Object.freeze({ code: "KeyG", label: "G", group: "动作", desc: "隐蔽" }),
  hideGrain: Object.freeze({ code: "KeyH", label: "H", group: "动作", desc: "藏粮（站在村格，把明存粮转进脚下已连通的储粮洞）" }),
  moveCivs: Object.freeze({ code: "KeyM", label: "M", group: "动作", desc: "转移群众（选目标：送进邻接地道口的藏人室，或挪到地面安全格）" }),
  guideCivs: Object.freeze({ code: "KeyP", label: "P", group: "动作", desc: "带路（选目标：带着同格群众一起在地道里走）" }),
  disguise: Object.freeze({ code: "KeyI", label: "I", group: "动作", desc: "伪装入口（灶台/水井/炕洞/牲口槽）" }),
  organize: Object.freeze({ code: "KeyO", label: "O", group: "动作", desc: "组织（升本村组织度，占主动作）" }),
  coverTraces: Object.freeze({ code: "KeyC", label: "C", group: "动作", desc: "掩土（本格痕迹与暴露豆各 -2，每人每役限 3 次）" }),
  breakRoad: Object.freeze({ code: "KeyK", label: "K", group: "动作", desc: "破路（刨毁脚下大车路/南土路/石桥）" }),
  collapse: Object.freeze({ code: "KeyX", label: "X", group: "动作", desc: "自毁封口（塌毁脚下地道口，断敌利用；需二次确认）" }),
  toggleDoor: Object.freeze({ code: "KeyT", label: "T", group: "动作", desc: "开关隔断门（免费，不占主动作，每门每回合 1 次）" }),
  rest: Object.freeze({ code: "KeyN", label: "N", group: "动作", desc: "休整（明确不做别的，结束这一手）" }),

  // ---- 回合与信息 ----
  endTurn: Object.freeze({ code: "Enter", label: "Enter", group: "回合", desc: "结束回合（两段式护栏）" }),
  endTurnForce: Object.freeze({ code: "Enter", shift: true, label: "Shift+Enter", group: "回合", desc: "跳过护栏直接结束" }),
  logDrawer: Object.freeze({ code: "KeyL", label: "L", group: "信息", desc: "事件日志抽屉（格号可点击跳转）" }),
});

/** 键盘事件是否命中某绑定（含修饰键判定；绑定未声明 shift 时对 shift 不敏感）。 */
export function KeyMatches(binding, event) {
  if (!binding || !binding.code) return false;
  if (event.code !== binding.code) return false;
  if (binding.shift !== undefined && event.shiftKey !== binding.shift) return false;
  if (binding.alt !== undefined && event.altKey !== binding.alt) return false;
  if (binding.ctrl !== undefined && event.ctrlKey !== binding.ctrl) return false;
  return true;
}

/** 鼠标事件是否命中某绑定（button + alt 修饰）。 */
export function MouseMatches(binding, event) {
  if (!binding || binding.button === undefined) return false;
  if (event.button !== binding.button) return false;
  if (binding.alt !== undefined && event.altKey !== binding.alt) return false;
  return true;
}

/** 键位一览（按 group 分组，供 Esc 菜单 / 引导展示）。 */
export function KeymapGroups() {
  const groups = new Map();
  for (const [id, binding] of Object.entries(keymap)) {
    const list = groups.get(binding.group) ?? [];
    list.push({ id, label: binding.label, desc: binding.desc });
    groups.set(binding.group, list);
  }
  return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
}
