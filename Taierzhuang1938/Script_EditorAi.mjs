// 敌军 AI 编辑器（叠加层）。设计口径见 docs/Data_EnemyAi.md §14。
//
// 为什么是叠加层而不是互斥编辑器：这个工具要看的东西**只在打仗时存在** ——
// 谁选了哪个掩体、谁探头、谁拿到攻击令牌、班组把侧翼任务派给了谁。
// 一旦按互斥编辑器那条路走（接管相机 + 暂停玩法），面板上永远是冻住的一帧，
// 而滑杆改完也看不到「下一次 Think 是不是真的读到了」。所以：不接管相机、
// 不暂停玩法、不碰指针锁、`keepOnClose = true`（与 Debug Rendering / Profiler 同组）。
//
// 六个分节（Chips 切页，DOM 常驻所以外部能直接查到六个 [data-page]）：
//   概览 / 行为图 / 单兵 / 世界叠加 / 调参 / 试验场
//
// 三条硬约束：
//   1. **世界里的线段与点不进 scene 图。** 进了 scene 的东西会被预通道当几何写法线、
//      被线框着色模式的覆盖材质换掉、被 SSAO 当遮挡物（见 Script_Post 里 debugOverlays
//      那段账）。所以走 `post.AddDebugOverlay`；没有后处理管线时才退回 scene.add。
//   2. **每帧只写属性，不建对象。** BufferGeometry 预分配 + setDrawRange，
//      每帧重填的是同一块 Float32Array。开着这个面板不许把帧预算吃掉。
//   3. **退出要还干净。** three 对象摘下来并 dispose、头顶标签恢复到进入前的状态。
//
// 面板文字是开发者诊断，不走 Script_Text.T()（编辑器不在 GATED_MODULES 里）。

import * as THREE from "three";
import {
  Panel, Section, ButtonRow, Toggle, Slider, Chips, ListBox, Facts, Note, TextArea, El,
} from "./Script_EditorUi.mjs";
import { BRAIN_GRAPH } from "./Data_AiBrainGraph.mjs";
import { STATE, AiDirector } from "./Script_Ai.mjs";
import * as ProbeScene from "./Script_AiProbeScene.mjs";
import * as TuningAi from "./Data_Tuning_Ai.mjs";
import * as TuningPerception from "./Data_Tuning_AiPerception.mjs";
import * as TuningCover from "./Data_Tuning_AiCover.mjs";
import * as TuningShooting from "./Data_Tuning_AiShooting.mjs";
import * as TuningTactics from "./Data_Tuning_AiTactics.mjs";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 面板 DOM 刷新（4 Hz）。再快也读不出来，只会白白重排。 */
const PANEL_HZ = 4;
/** 行为图刷新（2 Hz）。它要重算每个节点的人数与高亮，比读数贵。 */
const GRAPH_HZ = 2;
/** 附近掩体点的空间查询节流（秒）。`Nearby` 会 slice 出一个新数组，别每帧问。 */
const COVER_QUERY_S = 0.5;
/** 画多远以内的掩体点。60 m 之外那些点在屏幕上只有一两个像素，看不出颜色。 */
const COVER_DRAW_M = 60;
/** 一帧最多画多少个掩体点（性能预算，docs/Data_EnemyAi.md §14）。 */
const COVER_DRAW_MAX = 400;
/** 单兵列表最多列几个人。 */
const SOLDIER_LIST_MAX = 40;
/** 状态时间带的窗口（秒）。 */
const BAND_SECONDS = 30;
/** 行为图里「最近走过的边」的记忆时长（秒）。 */
const RECENT_EDGE_S = 6;

/** 叠加线在补完曝光之后的峰值亮度。别调到 1：ACES 会把满值的彩色拉成白。 */
const OVERLAY_PEAK = 0.75;

const SVG_NS = "http://www.w3.org/2000/svg";

/** 状态配色。时间带与行为图共用一份 —— 两处不同色会让人以为是两回事。 */
const STATE_COLORS = {
  idle: "#7b8288", advance: "#9dc0e4", cover: "#7fd6b0", fire: "#e2a34a",
  suppressed: "#d6604a", reload: "#c8a2d8", dead: "#3d4145", charge: "#f0605a",
  vault: "#8fb0c0", cover_engage: "#6fd08c", suppress: "#d8b25a",
  bound: "#7fb2e6", flank: "#e08fd0", investigate: "#a8c07a", retreat: "#b06a6a",
  grenade: "#e6d060",
};
const STATE_FALLBACK_COLOR = "#8a9098";

/** 世界叠加的线色（RGB 0—1，直接写进 color 属性）。 */
const RGB = {
  selected: [1.0, 1.0, 1.0],
  cone: [0.42, 0.72, 1.0],
  sightOk: [0.36, 0.94, 0.52],
  sightBlocked: [1.0, 0.36, 0.28],
  lkp: [1.0, 0.78, 0.28],
  hide: [0.30, 0.86, 0.70],
  fire: [1.0, 0.62, 0.24],
  normal: [0.72, 0.72, 0.78],
  task: [0.92, 0.52, 0.86],
  squad: [0.55, 0.60, 0.70],
  coverValidated: [0.36, 0.92, 0.48],
  coverSelected: [0.96, 0.84, 0.32],
  coverClaimed: [0.36, 0.62, 1.0],
  coverIdle: [0.52, 0.54, 0.56],
};

/**
 * 五张调参表。`only` 给了就只列这几个导出（`Data_Tuning_Ai` 里还有 LOD、
 * 受击踉跄那些跟敌军 AI 行为无关的表，不该混进这个面板）。
 * `file` 是保存端点认的仓库相对路径（docs/Data_EnemyAi.md §14.3）。
 */
const TUNING_TABLES = [
  { id: "brain", label: "大脑", file: "Taierzhuang1938/Data_Tuning_Ai.mjs", module: TuningAi, only: ["BRAIN", "ENGAGE", "SQUAD", "WATCH"] },
  { id: "perception", label: "感知", file: "Taierzhuang1938/Data_Tuning_AiPerception.mjs", module: TuningPerception, only: null },
  { id: "cover", label: "掩体", file: "Taierzhuang1938/Data_Tuning_AiCover.mjs", module: TuningCover, only: null },
  { id: "shooting", label: "射击", file: "Taierzhuang1938/Data_Tuning_AiShooting.mjs", module: TuningShooting, only: null },
  { id: "tactics", label: "战术", file: "Taierzhuang1938/Data_Tuning_AiTactics.mjs", module: TuningTactics, only: null },
];

const PAGES = [
  { id: "overview", label: "概览" },
  { id: "graph", label: "行为图" },
  { id: "soldier", label: "单兵" },
  { id: "world", label: "世界" },
  { id: "tuning", label: "调参" },
  { id: "probe", label: "试验场" },
];

/** 世界叠加的图层开关。id 就是 `layers` 里的键。 */
const WORLD_LAYERS = [
  { id: "cone", label: "视锥", title: "选中者的水平视锥：半角按警戒级别 × 姿态缩放，半径取当前 SightRange(站立)" },
  { id: "sight", label: "通视线", title: "选中者眼位 → 目标眼位；通=绿，挡=红" },
  { id: "lkp", label: "LKP", title: "最后目击位置的十字标" },
  { id: "cover", label: "掩体位", title: "选中者掩体的隐蔽位 / 射击位 / 掩体法线" },
  { id: "task", label: "任务点", title: "班组派下来的 task.point" },
  { id: "squad", label: "班组连线", title: "每个人连到本班重心" },
  { id: "covers", label: "附近掩体点", title: "相机 60 m 内的掩体点：验证过=绿 / 选上未验证=黄 / 被占=蓝 / 无=灰" },
];

// ---------------------------------------------------------------------------
// 调参表的枚举
// ---------------------------------------------------------------------------

/**
 * 一个数值叶子。`owner[key]` 就是运行时真正被读的那个位置 ——
 * 面板改的是它，不是一份副本（表在本机不冻结，见 docs/Data_EnemyAi.md §14.4）。
 *
 * @typedef {{path:string, table:string, file:string, group:string, key:string,
 *            owner:object, kind:"number"|"boolean", fileValue:number|boolean,
 *            min:number, max:number, step:number, control:object|null}} TuningEntry
 */

/** 滑杆的量程：0—4×文件值；文件值为 0 时 0—1；负数取对称的 4 倍。 */
function RangeFor(value) {
  if (value === 0) return [0, 1];
  if (value < 0) return [4 * value, -4 * value];
  return [0, 4 * value];
}

/** 滑杆步长：整数量给 1，其余按量程取一个整十分之一的档位。 */
function StepFor(min, max, value) {
  const span = max - min;
  if (!(span > 0)) return 0.01;
  if (Number.isInteger(value) && span >= 8) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(span / 200)));
  return magnitude > 0 ? magnitude : 0.01;
}

/**
 * 递归枚举一张表的数值叶子。
 *
 * **同一个对象只列一次，而且归它自己那个导出名**。这两件事都得说清楚：
 *
 *   · 去重：`Data_Tuning_AiPerception` 既导出 `FOV` 又导出把它装进去的聚合根
 *     `PERCEPTION`（`PERCEPTION.fov === FOV`）。不去重的话每个键出现两次，
 *     两根滑杆改同一个地方 —— 拖了一根另一根不动，看起来像坏了。
 *   · 归属：光按「谁先走到算谁的」去重是不够的。`Data_Tuning_AiCover` 里
 *     `COVER.weights === COVER_WEIGHTS`，按字母序 `COVER` 先走到，于是那十四个
 *     打分权重会被叫成 `COVER.weights.*` —— 而行为图的 `keys` 与保存端点认的是
 *     `COVER_WEIGHTS.*`，点边就跳不过去了。所以：**凡是自己有导出名的对象，
 *     聚合根一律不往里走**，等它自己那一轮来列。
 */
function CollectLeaves(root, rootName, table, file, out, seen, exported) {
  const stack = [{ node: root, path: rootName, group: rootName }];
  while (stack.length) {
    const item = stack.pop();
    const node = item.node;
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    // 正着遍历，叶子按**源文件里的顺序**进面板 —— 设计师是照着源码找滑杆的。
    // 子对象先攒起来再倒着压栈，弹出来才仍是原顺序（栈是后进先出）。
    const children = [];
    for (const key of Object.keys(node)) {
      const value = node[key];
      const path = `${item.path}.${key}`;
      if (typeof value === "number") {
        if (!Number.isFinite(value)) continue;
        const [min, max] = RangeFor(value);
        out.push({
          path, table, file, group: item.group, key, owner: node,
          kind: "number", fileValue: value, min, max, step: StepFor(min, max, value), control: null,
        });
      } else if (typeof value === "boolean") {
        out.push({
          path, table, file, group: item.group, key, owner: node,
          kind: "boolean", fileValue: value, min: 0, max: 1, step: 1, control: null,
        });
      } else if (value && typeof value === "object") {
        if (exported.has(value)) continue;    // 它自己有导出名，等它那一轮
        children.push({ node: value, path, group: item.group });
      }
    }
    for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
  }
}

/** 把五张表枚举成一份可编辑模型。 */
function BuildTuningModel() {
  const tables = [];
  const byPath = new Map();
  let frozen = false;
  for (const spec of TUNING_TABLES) {
    const entries = [];
    // 去重的作用域是**整张表**，不是单个导出：`Data_Tuning_AiPerception` 里的
    // `PERCEPTION` 就是把 `FOV` / `AWARENESS` 那几个装起来的聚合根，两边是同一个对象。
    // 每个导出各带一份 seen 的话，同一个键会出现两次（一次 `FOV.omniRadiusM`、
    // 一次 `PERCEPTION.fov.omniRadiusM`），拖一根另一根不动 —— 看起来就像坏了。
    const seen = new Set();
    const names = Object.keys(spec.module).sort().filter((name) => !spec.only || spec.only.includes(name));
    // 先认一遍「哪些对象自己有导出名」，聚合根就不会把它们抢过去（见 CollectLeaves）。
    const exported = new Map();
    for (const name of names) {
      const value = spec.module[name];
      if (value && typeof value === "object") exported.set(value, name);
    }
    for (const name of names) {
      const value = spec.module[name];
      if (!value || typeof value !== "object") continue;
      if (Object.isFrozen(value)) frozen = true;
      CollectLeaves(value, name, spec.id, spec.file, entries, seen, exported);
    }
    for (const entry of entries) byPath.set(entry.path, entry);
    tables.push({ ...spec, entries });
  }
  return { tables, byPath, frozen };
}

// ---------------------------------------------------------------------------
// 世界叠加的几何
// ---------------------------------------------------------------------------

/**
 * 一条 LineSegments + 一个 Points，全部预分配。
 *
 * 容量按最坏情况估：400 个掩体点各带一条法线（800 顶点）+ 视锥 40 + 班组连线
 * 2×140 + 零碎标记 100，四千个顶点绰绰有余。写满了会翻倍重分配（那一帧多一次
 * 分配，之后再也不会），不会静默截断。
 */
class AiOverlayGeometry {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = "AiEditorOverlay";
    this.lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95,
      depthTest: false, depthWrite: false, toneMapped: false, fog: false,
    });
    this.lineMaterial.name = "AiEditorLines";
    this.pointMaterial = new THREE.PointsMaterial({
      vertexColors: true, size: 7, sizeAttenuation: false, transparent: true, opacity: 0.95,
      depthTest: false, depthWrite: false, toneMapped: false, fog: false,
    });
    this.pointMaterial.name = "AiEditorPoints";

    this.lines = this._MakeLayer(4096, THREE.LineSegments, this.lineMaterial);
    this.points = this._MakeLayer(1024, THREE.Points, this.pointMaterial);
    this.root.add(this.lines.object, this.points.object);

    // 调试叠加层是画进 hdr 靶的，颜色之后还要过曝光与 ACES。夜战 3.6 会把这些线
    // 冲成白，白天 0.5 会压成灰 —— 先按 1/曝光预补，屏幕上永远是同一个亮度。
    // 与 Script_EditorDebugRendering 的碰撞体线框同一条账，多一个 PEAK：
    // **整补到 1.0 会被 ACES 拉成白色**，实测视锥的天蓝在亮天底下变成一条白线，
    // 「绿=通视 / 红=被挡」这类靠颜色说话的层全部作废。压到 0.75 峰值就保住了色相。
    this.root.userData.PrepareDebugOverlay = ({ exposure }) => {
      const gain = OVERLAY_PEAK / THREE.MathUtils.clamp(exposure || 1, 0.05, 20);
      this.lineMaterial.color.setScalar(gain);
      this.pointMaterial.color.setScalar(gain);
    };
  }

  _MakeLayer(capacity, Ctor, material) {
    const geometry = new THREE.BufferGeometry();
    const layer = { geometry, object: null, positions: null, colors: null, capacity: 0, count: 0 };
    this._Allocate(layer, capacity);
    layer.object = new Ctor(geometry, material);
    layer.object.frustumCulled = false;      // 一根几何盖全城，算包围球没有意义
    layer.object.matrixAutoUpdate = false;
    layer.object.renderOrder = 999;          // 排在所有几何之后：这是叠加层，不参与遮挡
    return layer;
  }

  _Allocate(layer, capacity) {
    if (layer.capacity) layer.geometry.dispose();
    layer.capacity = capacity;
    layer.positions = new Float32Array(capacity * 3);
    layer.colors = new Float32Array(capacity * 3);
    layer.geometry.setAttribute("position",
      new THREE.BufferAttribute(layer.positions, 3).setUsage(THREE.DynamicDrawUsage));
    layer.geometry.setAttribute("color",
      new THREE.BufferAttribute(layer.colors, 3).setUsage(THREE.DynamicDrawUsage));
  }

  _Grow(layer, need) {
    const positions = layer.positions;
    const colors = layer.colors;
    this._Allocate(layer, Math.max(layer.capacity * 2, need));
    layer.positions.set(positions);
    layer.colors.set(colors);
  }

  Begin() { this.lines.count = 0; this.points.count = 0; }

  /** 一段线。坐标是世界坐标（根节点不带变换）。 */
  Segment(ax, ay, az, bx, by, bz, rgb) {
    const layer = this.lines;
    if (layer.count + 2 > layer.capacity) this._Grow(layer, layer.count + 2);
    const p = layer.positions;
    const c = layer.colors;
    let i = layer.count * 3;
    p[i] = ax; p[i + 1] = ay; p[i + 2] = az;
    c[i] = rgb[0]; c[i + 1] = rgb[1]; c[i + 2] = rgb[2];
    i += 3;
    p[i] = bx; p[i + 1] = by; p[i + 2] = bz;
    c[i] = rgb[0]; c[i + 1] = rgb[1]; c[i + 2] = rgb[2];
    layer.count += 2;
  }

  Point(x, y, z, rgb) {
    const layer = this.points;
    if (layer.count + 1 > layer.capacity) this._Grow(layer, layer.count + 1);
    const i = layer.count * 3;
    layer.positions[i] = x; layer.positions[i + 1] = y; layer.positions[i + 2] = z;
    layer.colors[i] = rgb[0]; layer.colors[i + 1] = rgb[1]; layer.colors[i + 2] = rgb[2];
    layer.count += 1;
  }

  /** 一个三轴小十字（LKP、任务点这类「一个点位」的标记）。 */
  Cross(x, y, z, size, rgb) {
    this.Segment(x - size, y, z, x + size, y, z, rgb);
    this.Segment(x, y - size, z, x, y + size, z, rgb);
    this.Segment(x, y, z - size, x, y, z + size, rgb);
  }

  End() {
    for (const layer of [this.lines, this.points]) {
      const position = layer.geometry.getAttribute("position");
      const color = layer.geometry.getAttribute("color");
      position.needsUpdate = true;
      color.needsUpdate = true;
      // 只上传写过的那一段；没写就把 drawRange 归零，而不是留着上一帧的旧线。
      position.clearUpdateRanges();
      color.clearUpdateRanges();
      if (layer.count > 0) {
        position.addUpdateRange(0, layer.count * 3);
        color.addUpdateRange(0, layer.count * 3);
      }
      layer.geometry.setDrawRange(0, layer.count);
    }
  }

  Dispose() {
    this.lines.geometry.dispose();
    this.points.geometry.dispose();
    this.lineMaterial.dispose();
    this.pointMaterial.dispose();
    this.root.clear();
  }
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function Svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const key of Object.keys(attrs)) el.setAttribute(key, String(attrs[key]));
  return el;
}

function StateColor(state) { return STATE_COLORS[state] || STATE_FALLBACK_COLOR; }

/** yaw=0 面朝 -Z；前向量 (-sin yaw, 0, -cos yaw)。整个项目只有这一条朝向契约。 */
function ForwardX(yaw) { return -Math.sin(yaw); }
function ForwardZ(yaw) { return -Math.cos(yaw); }

/** 姿态眼高。与 `AiDirector.StanceEye` 同一条口径，缺人物时的兜底。 */
function EyeHeight(soldier) {
  try { return AiDirector.StanceEye(soldier.stance, soldier); } catch { return 1.5; }
}

/** `Script_Ai.STATE` 一共几个值。行为图的完整性以它为准（闸门也数这个数）。 */
const STATE_COUNT = Object.keys(STATE).length;

// ---------------------------------------------------------------------------
// 面板
// ---------------------------------------------------------------------------

export class AiEditor {
  static id = "ai";
  static label = "敌军 AI";
  static hint = "叠加层：行为图 / 单兵黑板 / 世界视锥与掩体 / 调参热改 / 试验场；玩法照跑";
  /**
   * 关设置面板（回去打仗）**不收它**，与 Debug Rendering / Profiler 同一条规矩：
   * 这个面板看的就是战斗中的 AI，关面板正是主用例。停它：面板里再点一次
   * 「敌军 AI」、叉掉浮窗，或按「全部关掉」。
   */
  static keepOnClose = true;

  constructor(host) {
    this.host = host;
    this.cameraMode = "none";          // 不接管相机
    this.panel = null;
    this.page = "overview";
    this.pageBoxes = new Map();

    this.panelTimer = 0;
    this.graphTimer = 0;
    this.coverTimer = 0;

    this.selectedId = null;
    this.followNearest = false;

    this.overlay = null;
    this.overlayHost = "none";         // "post" | "scene" | "none"
    this.layers = { cone: true, sight: true, lkp: true, cover: true, task: true, squad: false, covers: true };
    this.headLabelsBefore = null;

    this.tuning = BuildTuningModel();
    this.tuningTable = TUNING_TABLES[0].id;
    this.saveState = "unknown";        // "unknown" | "writable" | "readonly"

    this.nearbyCovers = [];
    this.nearbyY = new Float64Array(COVER_DRAW_MAX);
    this.probeRestore = null;
    this.probeSquad = null;
    this.probeNote = "";

    this.raySample = { time: -1, rays: 0, perSecond: 0 };
    this.overlayMs = 0;
    this.graphSignature = "";
    this._camera = new THREE.Vector3();
  }

  // ------------------------------------------------------------------ 生命周期

  Enter(root) {
    // 整段包 try：`ToggleOverlay` 在 Enter 抛错时只把自己从 overlays 里删掉，
    // **不会替你调 Exit** —— 半路挂掉的话那两块几何就永远留在 post 的调试层里了。
    try {
      this.panel = Panel({
        title: "敌军 AI", sub: "叠加层 · 玩法照跑",
        variant: "work ai", onClose: () => this.host.CloseAi?.(),
      });
      root.appendChild(this.panel.root);
      this.BuildUi(this.panel.body);

      this.overlay = new AiOverlayGeometry();
      // 世界线段不进 scene 图：进了就会被预通道、线框覆盖材质与 SSAO 各改一遍
      // （见 Script_Post 的 debugOverlays）。没有后处理管线的场合才退回 scene。
      if (this.host.post?.AddDebugOverlay) {
        this.host.post.AddDebugOverlay(this.overlay.root);
        this.overlayHost = "post";
      } else if (this.host.scene) {
        this.host.scene.add(this.overlay.root);
        this.overlayHost = "scene";
      }

      // 头顶标签是 Script_Main 的全局开关，进来前是什么样，出去就还成什么样。
      const debugAi = globalThis.Taierzhuang?.Debug?.Ai;
      this.headLabelsBefore = typeof debugAi?.Overlay === "function" ? !!debugAi.Overlay() : null;

      this.Refresh(true);
      return this;
    } catch (error) {
      this.Exit();
      throw error;
    }
  }

  Exit() {
    if (this.overlay) {
      if (this.overlayHost === "post") this.host.post?.RemoveDebugOverlay?.(this.overlay.root);
      else if (this.overlayHost === "scene") this.overlay.root.removeFromParent();
      this.overlay.Dispose();
      this.overlay = null;
    }
    this.overlayHost = "none";

    // 头顶标签还回进入前的状态（面板没了，标签也不许留在正片上）。
    const debugAi = globalThis.Taierzhuang?.Debug?.Ai;
    if (this.headLabelsBefore !== null && typeof debugAi?.Overlay === "function") {
      debugAi.Overlay(this.headLabelsBefore);
    }
    this.headLabelsBefore = null;

    this.panel?.root.remove();
    this.panel = null;
    this.pageBoxes.clear();
    this.nearbyCovers = [];
    // 试验场的还原留给用户显式点「清场还原」：关掉面板不该把撒出来的班一起收走
    // （用户常常是「开面板撒兵 → 关面板打一场」）。这里只断开引用。
    this.probeRestore = null;
    this.ui = null;
  }

  /**
   * 叠加根节点现在挂着没有。**闸门读它**：post 的调试叠加层是一个 Set 不是场景图，
   * 查 `root.parent` 只会永远拿到 null，看起来像「根本没挂上」。
   */
  OverlayAttached() {
    if (!this.overlay) return false;
    if (this.overlayHost === "post") return !!this.host.post?.debugOverlays?.has?.(this.overlay.root);
    if (this.overlayHost === "scene") return !!this.overlay.root.parent;
    return false;
  }

  Update(dt) {
    const step = Number.isFinite(dt) ? dt : 0;
    this.panelTimer += step;
    this.graphTimer += step;
    this.coverTimer += step;

    this.SampleRays();

    // 世界叠加每帧都要跟着相机与人走，但整段包在一个计时里：预算是 0.3 ms。
    const t0 = performance.now();
    this.UpdateOverlay(step);
    this.overlayMs = performance.now() - t0;

    if (this.panelTimer >= 1 / PANEL_HZ) {
      this.panelTimer = 0;
      this.Refresh(false);
    }
    if (this.graphTimer >= 1 / GRAPH_HZ) {
      this.graphTimer = 0;
      this.RefreshGraph();
    }
  }

  // ------------------------------------------------------------------ 取数

  get ai() { return this.host.game?.ai ?? null; }

  /** 当前选中的兵（活着才算）。 */
  Selected() {
    const ai = this.ai;
    if (!ai || this.selectedId === null) return null;
    const s = ai.soldiers.find((x) => x.id === this.selectedId);
    return s && s.alive ? s : null;
  }

  CameraPosition() {
    const camera = this.host.camera;
    if (!camera) return null;
    return camera.getWorldPosition(this._camera);
  }

  /** 场上活人，按到相机的距离排序（前 SOLDIER_LIST_MAX 个）。 */
  ListSoldiers() {
    const ai = this.ai;
    if (!ai) return [];
    const at = this.CameraPosition();
    const list = [];
    for (const s of ai.soldiers) {
      if (!s.alive) continue;
      const d = at ? Math.hypot(s.position.x - at.x, s.position.z - at.z) : 0;
      list.push({ soldier: s, dist: d });
    }
    list.sort((a, b) => a.dist - b.dist);
    return list.slice(0, SOLDIER_LIST_MAX);
  }

  // ------------------------------------------------------------------ UI 骨架

  BuildUi(body) {
    this.ui = {};
    this.pageChips = Chips(body, PAGES.map((p) => ({ value: p.id, label: p.label })),
      this.page, (id) => this.SetPage(id));
    this.pageChips.root.classList.add("edAiPages");

    for (const page of PAGES) {
      const box = El("div", "edAiPage");
      box.dataset.page = page.id;
      body.appendChild(box);
      this.pageBoxes.set(page.id, box);
    }
    this.BuildOverview(this.pageBoxes.get("overview"));
    this.BuildGraph(this.pageBoxes.get("graph"));
    this.BuildSoldier(this.pageBoxes.get("soldier"));
    this.BuildWorld(this.pageBoxes.get("world"));
    this.BuildTuning(this.pageBoxes.get("tuning"));
    this.BuildProbe(this.pageBoxes.get("probe"));
    this.SetPage(this.page);
  }

  SetPage(id) {
    if (!this.pageBoxes.has(id)) return;
    this.page = id;
    for (const [key, box] of this.pageBoxes) box.classList.toggle("on", key === id);
    this.pageChips?.Set(id);
    if (id === "graph") this.RefreshGraph();
    this.Refresh(true);
  }

  // ------------------------------------------------------------------ 1 概览

  BuildOverview(box) {
    const summary = Section(box, "全场");
    this.ui.overviewFacts = Facts(summary, [
      "存活", "掩体总数", "选上掩体", "验证过", "隐蔽中", "占用", "攻击令牌",
      "射线/秒", "压制:瞄准", "探头次数", "感知采样",
    ]);
    this.ui.stateBars = this.MakeBars(Section(box, "状态"));
    this.ui.taskBars = this.MakeBars(Section(box, "任务"));
    this.ui.alertBars = this.MakeBars(Section(box, "警戒"));
  }

  /** 一组横条。只改宽度与文字，不重建 DOM —— 重建会让直方图每次刷新都闪一下。 */
  MakeBars(parent) {
    const root = El("div", "edAiBars");
    parent.appendChild(root);
    const rows = new Map();
    return {
      root,
      Set(counts, total) {
        const keys = Object.keys(counts).sort();
        for (const key of keys) {
          let row = rows.get(key);
          if (!row) {
            const el = El("div", "r");
            const name = El("span", "n", key);
            const track = El("span", "t");
            const fill = El("i");
            track.appendChild(fill);
            const num = El("span", "v num");
            el.appendChild(name); el.appendChild(track); el.appendChild(num);
            root.appendChild(el);
            row = { el, fill, num };
            rows.set(key, row);
          }
          row.el.style.display = "";
          const n = counts[key] || 0;
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          row.fill.style.width = `${pct}%`;
          row.fill.style.background = StateColor(key);
          const text = String(n);
          if (row.num.textContent !== text) row.num.textContent = text;
        }
        for (const [key, row] of rows) if (!(key in counts)) row.el.style.display = "none";
      },
    };
  }

  RefreshOverview(state) {
    const facts = this.ui.overviewFacts;
    if (!facts) return;
    if (!state) { facts.Set("存活", "—"); return; }
    const covers = state.covers || {};
    const tactics = state.tactics || {};
    const stats = state.stats || {};
    facts.Set("存活", state.alive);
    facts.Set("掩体总数", covers.covers ?? "—");
    facts.Set("选上掩体", state.inCover);
    facts.Set("验证过", state.validatedCover, state.validatedCover > 0 ? "good" : "warn");
    facts.Set("隐蔽中", state.hiding);
    facts.Set("占用", covers.claims ?? "—");
    facts.Set("攻击令牌", tactics.tokens ? tactics.tokens.length : 0);
    const rays = this.raySample.perSecond;
    facts.Set("射线/秒", rays >= 10 ? rays.toFixed(0) : rays.toFixed(1));
    const suppressed = stats.suppressShots || 0;
    const aimed = stats.aimedShots || 0;
    facts.Set("压制:瞄准", aimed > 0 ? `${suppressed}:${aimed} (${(suppressed / aimed).toFixed(2)})`
      : `${suppressed}:0`);
    facts.Set("探头次数", stats.peeks || 0);
    facts.Set("感知采样", state.perception?.senses ?? "—");
    this.ui.stateBars.Set(state.states || {}, state.alive || 1);
    this.ui.taskBars.Set(state.tasks || {}, state.alive || 1);
    this.ui.alertBars.Set(state.alerts || {}, state.alive || 1);
  }

  /**
   * 射线/秒按两次采样的差算 —— 两个计数器都是**累计**的，直接显示没有意义。
   *
   * 从 `Update` 每帧调、自己按 0.5 s 开窗，**不挂在 `Refresh` 上**：面板还有
   * 「切页」「选人」这类随手来的强制刷新，挂在 Refresh 上的话它们会一直把窗口
   * 重置，读数永远停在 0 —— 实拍出过这个（面板显示 0.0，实测每秒五十到一百二）。
   * 直接读导演身上的计数器而不是 `DebugState()`，这样每帧调也不产生垃圾。
   */
  SampleRays() {
    const ai = this.ai;
    if (!ai) return;
    const now = ai.time;
    const rays = (ai.shooting?.rayCount || 0) + (ai.covers?.rays || 0);
    const sample = this.raySample;
    if (sample.time < 0 || now < sample.time) { sample.time = now; sample.rays = rays; return; }
    const dt = now - sample.time;
    if (dt < 0.5) return;
    sample.perSecond = (rays - sample.rays) / dt;
    sample.time = now;
    sample.rays = rays;
  }

  // ------------------------------------------------------------------ 2 行为图

  BuildGraph(box) {
    this.ui.graphNote = Note(box, "");
    const wrap = El("div", "edAiGraph");
    this.ui.graphSvg = Svg("svg", { viewBox: "0 0 420 300", preserveAspectRatio: "xMidYMid meet" });
    wrap.appendChild(this.ui.graphSvg);
    box.appendChild(wrap);
    Note(box, "节点=状态（数字是当前人数），边=转移；点边跳到「调参」里它读的那个键。");
    this.ui.graphLegend = Facts(Section(box, "选中的兵"), ["当前节点", "最近转移"]);
    this.graphNodes = new Map();
    this.graphEdges = [];
  }

  /**
   * 按 `BRAIN_GRAPH` 建 SVG。**对空数据健壮**：契约里的内容由 `Data_AiBrainGraph.mjs`
   * 提供，它还是脚手架桩的时候这里只给一句提示，一个元素都不画。
   */
  RebuildGraph() {
    const svg = this.ui.graphSvg;
    if (!svg) return;
    svg.setAttribute("viewBox", "0 0 420 320");
    const states = Array.isArray(BRAIN_GRAPH?.states) ? BRAIN_GRAPH.states : [];
    const edges = Array.isArray(BRAIN_GRAPH?.edges) ? BRAIN_GRAPH.edges : [];
    const signature = `${states.length}/${edges.length}/${states.map((s) => s.id).join(",")}`;
    if (signature === this.graphSignature) return;
    this.graphSignature = signature;
    svg.replaceChildren();
    this.graphNodes.clear();
    this.graphEdges = [];

    if (!states.length) {
      this.ui.graphNote.textContent
        = `行为图未就绪：Data_AiBrainGraph.BRAIN_GRAPH.states 是空的（Script_Ai.STATE 有 ${STATE_COUNT} 个状态）。`;
      this.ui.graphNote.classList.add("warn");
      return;
    }
    this.ui.graphNote.textContent = `${states.length} / ${STATE_COUNT} 个状态 · ${edges.length} 条转移`;
    this.ui.graphNote.classList.remove("warn");

    const W = 420;
    const H = 320;
    const boxW = 70;
    const boxH = 26;
    const spanX = W - boxW - 24;
    const spanY = H - boxH - 32;
    // 横向按**列的名次**摆，不按 x 的原值。
    //
    // 原值摆的下场实测过：`BRAIN_GRAPH` 的五列在 0.08/0.30/0.54/0.78/0.92，最后两列
    // 只差 0.14 —— 换算成像素是 47 px，而节点盒有 70 px 宽，于是「翻越」压在
    // 「掩体对射」上。名次法把不同的 x 拉成等距列，作者想表达的**先后**一个不差，
    // 而列间距永远够放下一个盒子。纵向仍按原值：同一列里 y 的疏密本身就是信息。
    const columnKeys = [...new Set(states
      .filter((node) => Number.isFinite(node.x))
      .map((node) => Math.round(node.x * 1000)))].sort((a, b) => a - b);
    // 没有布局提示的图（另一份数据、或将来加的节点漏填）自动排成几列，
    // 列数取 √n —— 图不至于压成一条线。
    const autoColumns = Math.max(1, Math.ceil(Math.sqrt(states.length)));
    const autoRows = Math.ceil(states.length / autoColumns);
    const Spread = (index, count) => (count > 1 ? index / (count - 1) : 0.5);
    const positions = new Map();
    states.forEach((node, index) => {
      const hasHint = Number.isFinite(node.x) && Number.isFinite(node.y);
      const cx = hasHint
        ? 12 + boxW / 2 + Spread(columnKeys.indexOf(Math.round(node.x * 1000)), columnKeys.length) * spanX
        : 12 + boxW / 2 + Spread(index % autoColumns, autoColumns) * spanX;
      const cy = hasHint
        ? 16 + boxH / 2 + node.y * spanY
        : 16 + boxH / 2 + Spread(Math.floor(index / autoColumns), autoRows) * spanY;
      positions.set(node.id, { x: cx, y: cy });
    });

    // 边先画，节点盖在上面。
    const edgeGroup = Svg("g", { class: "edges" });
    svg.appendChild(edgeGroup);
    for (const edge of edges) {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) continue;      // 两端都得存在；缺一端由 AiBrainGraphTest 去红
      const line = Svg("path", { class: "e", d: `M ${from.x} ${from.y} L ${to.x} ${to.y}` });
      const title = Svg("title");
      const keys = Array.isArray(edge.keys) ? edge.keys : [];
      title.textContent = `${edge.from} → ${edge.to}\n${edge.when || ""}${keys.length ? `\n${keys.join("  ")}` : ""}`;
      line.appendChild(title);
      // 单独一条透明粗线当点击热区：1 px 的线点不中。
      const hit = Svg("path", { class: "hit", d: `M ${from.x} ${from.y} L ${to.x} ${to.y}` });
      if (keys.length) {
        hit.addEventListener("click", () => this.JumpToKey(keys[0]));
        hit.style.cursor = "pointer";
      }
      edgeGroup.appendChild(line);
      edgeGroup.appendChild(hit);
      this.graphEdges.push({ from: edge.from, to: edge.to, line, keys });
    }

    for (const node of states) {
      const at = positions.get(node.id);
      const group = Svg("g", { class: "n", transform: `translate(${at.x - boxW / 2} ${at.y - boxH / 2})` });
      const rect = Svg("rect", { width: boxW, height: boxH, rx: 0 });
      rect.style.stroke = StateColor(node.id);
      const label = Svg("text", { x: boxW / 2, y: 11, class: "l" });
      label.textContent = node.label || node.id;
      const count = Svg("text", { x: boxW / 2, y: 21, class: "c" });
      count.textContent = "0";
      const title = Svg("title");
      title.textContent = `${node.id}${node.desc ? `\n${node.desc}` : ""}`;
      group.appendChild(rect); group.appendChild(label); group.appendChild(count); group.appendChild(title);
      svg.appendChild(group);
      this.graphNodes.set(node.id, { group, rect, count });
    }
  }

  RefreshGraph() {
    if (!this.ui?.graphSvg) return;
    this.RebuildGraph();
    if (!this.graphNodes.size) return;
    const ai = this.ai;
    const state = ai?.DebugState() ?? null;
    const counts = state?.states || {};
    for (const [id, node] of this.graphNodes) {
      const n = counts[id] || 0;
      const text = String(n);
      if (node.count.textContent !== text) node.count.textContent = text;
      node.group.classList.toggle("hot", n > 0);
    }
    const soldier = this.Selected();
    for (const [id, node] of this.graphNodes) node.group.classList.toggle("sel", !!soldier && soldier.state === id);

    // 最近走过的边：按选中兵的状态切换记录点亮，超过 RECENT_EDGE_S 就熄。
    const recent = new Set();
    let lastText = "—";
    if (soldier && ai) {
      const log = AiDirector.ReadStateLog(soldier);
      for (let i = log.length - 1; i >= 0; i -= 1) {
        if (ai.time - log[i].t > RECENT_EDGE_S) break;
        recent.add(`${log[i].from}>${log[i].to}`);
      }
      const last = log[log.length - 1];
      if (last) lastText = `${last.from} → ${last.to} (${(ai.time - last.t).toFixed(1)}s)`;
    }
    for (const edge of this.graphEdges) {
      edge.line.classList.toggle("hot", recent.has(`${edge.from}>${edge.to}`));
    }
    this.ui.graphLegend.Set("当前节点", soldier ? soldier.state : "—");
    this.ui.graphLegend.Set("最近转移", lastText);
  }

  /** 从行为图的边跳到「调参」里那根滑杆并闪一下。 */
  JumpToKey(path) {
    const entry = this.tuning.byPath.get(path);
    this.SetPage("tuning");
    if (!entry) {
      // 面板故意只收敌军 AI 行为那几张表（`TUNING_TABLES` 的 only），行为图却按
      // 「Think 真的读了什么」抄，所以会有几个键落在面板之外。把它在哪儿说出来，
      // 比丢一句「找不到」有用。
      const owner = BRAIN_GRAPH?.keyOwners?.[path.split(".")[0]];
      this.SetTuningStatus(owner
        ? `${path} 不在本面板收录的表里，它在 ${owner}.mjs —— 直接改源码。`
        : `行为图里的键在五张表里找不到：${path}`, true);
      return false;
    }
    this.SetTuningTable(entry.table);
    const row = entry.control?.root;
    if (!row) return false;
    row.scrollIntoView({ block: "center" });
    row.classList.remove("edAiFlash");
    // 强制回流让动画能重放：不读一次 offsetWidth 的话连点两次只闪第一次。
    void row.offsetWidth;
    row.classList.add("edAiFlash");
    return true;
  }

  // ------------------------------------------------------------------ 3 单兵

  BuildSoldier(box) {
    const pick = Section(box, "选人");
    this.ui.soldierList = ListBox(pick, { height: 156, onPick: (id) => { this.selectedId = id; this.Refresh(true); } });
    const buttons = El("div", "edBtns");
    this.ui.followToggle = Toggle(buttons, "跟随最近的敌人", this.followNearest, (on) => {
      this.followNearest = on;
      this.Refresh(true);
    });
    pick.appendChild(buttons);

    this.ui.soldierFacts = Facts(Section(box, "黑板"));
    const band = Section(box, `状态时间带 · 最近 ${BAND_SECONDS} s`);
    this.ui.band = El("div", "edAiBand");
    band.appendChild(this.ui.band);
    this.ui.bandNote = Note(band, "");
  }

  RefreshSoldierList(list) {
    const box = this.ui.soldierList;
    if (!box) return;
    const items = list.map(({ soldier, dist }) => ({
      id: soldier.id,
      name: `${soldier.side}#${soldier.id} ${soldier.tacticalRole} ${soldier.state}`,
      tail: `${dist.toFixed(0)}m`,
      title: `班 ${soldier.squadId || "—"} · 警戒 ${soldier.alert || "unaware"}`,
    }));
    const signature = items.map((i) => `${i.id}:${i.name}:${i.tail}`).join("|");
    if (signature === this._listSignature) return;
    this._listSignature = signature;
    // Fill 会重建整棵列表 DOM，滚动位置得自己存回去。
    const scroll = box.root.scrollTop;
    box.Fill(items);
    box.root.scrollTop = scroll;
    if (this.selectedId !== null) box.Select(this.selectedId);
  }

  RefreshSoldier(list) {
    const ai = this.ai;
    if (this.followNearest && list.length) {
      // 「最近的敌人」= 离玩家最近的日军。列表按相机排序，这里按玩家重挑一次。
      const player = this.host.game?.player;
      let best = null;
      let bestD = Infinity;
      for (const s of ai ? ai.soldiers : []) {
        if (!s.alive || s.side !== "ija") continue;
        const d = player ? Math.hypot(s.position.x - player.position.x, s.position.z - player.position.z) : 0;
        if (d < bestD) { bestD = d; best = s; }
      }
      if (best && best.id !== this.selectedId) {
        this.selectedId = best.id;
        this.ui.soldierList?.Select(best.id);
      }
    }
    const facts = this.ui.soldierFacts;
    if (!facts) return;
    const soldier = this.Selected();
    // 占位与真读数是两套键：不清一遍的话「没有选中活人」那一行会一直挂在
    // 真快照上面（Facts 只加不减），看起来像「选中的人不存在」。
    if (!soldier || !ai) {
      if (this._factsMode !== "empty") { facts.Clear(); this._factsMode = "empty"; }
      facts.Set("状态", "没有选中活人");
      this.RefreshBand(null);
      return;
    }
    if (this._factsMode !== "soldier") { facts.Clear(); this._factsMode = "soldier"; }
    const snap = ai.DebugSoldier(soldier);
    for (const key of Object.keys(snap)) {
      if (key === "stateLog") continue;         // 时间带自己画，别把 32 条 JSON 铺进读数板
      const value = snap[key];
      const text = value === null || value === undefined ? "—"
        : (typeof value === "object" ? JSON.stringify(value) : String(value));
      const tone = key === "state" ? "good" : (key === "suppression" && value > 0.5 ? "bad" : "");
      facts.Set(key, text, tone);
    }
    this.RefreshBand(snap.stateLog);
  }

  /** 30 s 状态时间带：每次状态切换一格，宽度按持续时长。 */
  RefreshBand(log) {
    const band = this.ui.band;
    if (!band) return;
    const ai = this.ai;
    if (!log || !log.length || !ai) {
      band.replaceChildren();
      this.ui.bandNote.textContent = "还没有状态切换记录。";
      return;
    }
    const now = ai.time;
    const start = now - BAND_SECONDS;
    const spans = [];
    for (let i = 0; i < log.length; i += 1) {
      const from = log[i].t;
      const to = i + 1 < log.length ? log[i + 1].t : now;
      if (to <= start) continue;
      spans.push({ state: log[i].to, from: Math.max(from, start), to });
    }
    // 记录之前那一段是「不知道」：环最多 32 条，之前发生过什么这里没有依据。
    if (spans.length && spans[0].from > start + 0.05) {
      spans.unshift({ state: null, from: start, to: spans[0].from });
    }
    band.replaceChildren();
    for (const span of spans) {
      const el = El("i");
      el.style.left = `${((span.from - start) / BAND_SECONDS) * 100}%`;
      el.style.width = `${Math.max(0.4, ((span.to - span.from) / BAND_SECONDS) * 100)}%`;
      el.style.background = span.state ? StateColor(span.state) : "rgba(214,217,209,0.10)";
      el.title = span.state
        ? `${span.state}  ${(span.to - span.from).toFixed(1)}s`
        : `记录之前（环只留 ${AiDirector.STATE_LOG_SIZE} 条）`;
      band.appendChild(el);
    }
    this.ui.bandNote.textContent = `${log.length} 次切换 · 最后一次 ${(now - log[log.length - 1].t).toFixed(1)} s 前`;
  }

  // ------------------------------------------------------------------ 4 世界叠加

  BuildWorld(box) {
    const switches = Section(box, "图层");
    const row = El("div", "edBtns");
    for (const layer of WORLD_LAYERS) {
      const toggle = Toggle(row, layer.label, this.layers[layer.id], (on) => { this.layers[layer.id] = on; });
      toggle.root.title = layer.title;
      toggle.root.dataset.layer = layer.id;
    }
    switches.appendChild(row);
    const extra = El("div", "edBtns");
    const debugAi = globalThis.Taierzhuang?.Debug?.Ai;
    this.ui.headToggle = Toggle(extra, "头顶标签",
      typeof debugAi?.Overlay === "function" ? !!debugAi.Overlay() : false,
      (on) => { globalThis.Taierzhuang?.Debug?.Ai?.Overlay?.(on); });
    this.ui.headToggle.root.title = "复用 ?aidebug=1 那套 DOM 标签（state/task、alert/exp/sup、cover）";
    switches.appendChild(extra);

    const legend = El("div", "edLegend");
    for (const item of [
      { label: "验证过", hex: "#5ceb7a" }, { label: "选上未验证", hex: "#f5d652" },
      { label: "被占", hex: "#5c9eff" }, { label: "无", hex: "#858a8f" },
    ]) {
      const span = El("span");
      const swatch = El("i", "edSwatch");
      swatch.style.background = item.hex;
      span.appendChild(swatch);
      span.appendChild(document.createTextNode(item.label));
      legend.appendChild(span);
    }
    Section(box, "掩体点颜色").appendChild(legend);

    this.ui.worldFacts = Facts(Section(box, "开销"), ["线段", "点", "附近掩体", "本帧 ms", "挂在"]);
    Note(box, `掩体点只画相机 ${COVER_DRAW_M} m 内、最多 ${COVER_DRAW_MAX} 个；查询每 ${COVER_QUERY_S} s 一次。`);
  }

  /** 每帧重填世界叠加的顶点。**只写属性，不建对象。** */
  UpdateOverlay(dt) {
    const overlay = this.overlay;
    const ai = this.ai;
    if (!overlay) return;
    overlay.Begin();
    if (!ai) { overlay.End(); return; }

    const camera = this.CameraPosition();
    const soldier = this.Selected();

    if (soldier) {
      const eyeY = soldier.position.y + EyeHeight(soldier);
      // 选中者本人先立一根标杆。没有它，一百二十米的视锥画出来是漫天弧线，
      // 「人在哪儿」反而找不到 —— 实拍第一版就是这个样子。
      overlay.Segment(soldier.position.x, soldier.position.y, soldier.position.z,
        soldier.position.x, eyeY + 0.5, soldier.position.z, RGB.selected);
      overlay.Point(soldier.position.x, eyeY + 0.5, soldier.position.z, RGB.selected);
      if (this.layers.cone) this.DrawViewCone(soldier, eyeY);
      if (this.layers.sight && soldier.target?.position) {
        const target = soldier.target.position;
        overlay.Segment(soldier.position.x, eyeY, soldier.position.z,
          target.x, target.y + 1.2, target.z,
          soldier.targetVisible ? RGB.sightOk : RGB.sightBlocked);
      }
      if (this.layers.lkp && soldier.lkp) {
        overlay.Cross(soldier.lkp.x, soldier.lkp.y + 0.6, soldier.lkp.z, 0.6, RGB.lkp);
        overlay.Point(soldier.lkp.x, soldier.lkp.y + 0.6, soldier.lkp.z, RGB.lkp);
      }
      if (this.layers.cover && soldier.cover) this.DrawCoverPose(soldier);
      if (this.layers.task && soldier.task?.point) {
        const p = soldier.task.point;
        const y = soldier.position.y;
        overlay.Cross(p.x, y + 0.9, p.z, 0.7, RGB.task);
        overlay.Segment(p.x, y, p.z, p.x, y + 1.8, p.z, RGB.task);
      }
    }

    if (this.layers.squad) this.DrawSquadLinks(ai, camera);
    if (this.layers.covers && camera) this.DrawNearbyCovers(ai, camera);

    overlay.End();
  }

  /** 水平视锥：半角按警戒级别 × 姿态缩放，半径取当前 SightRange(站立目标)。 */
  DrawViewCone(soldier, eyeY) {
    const overlay = this.overlay;
    const ai = this.ai;
    const fov = TuningPerception.FOV;
    const alert = soldier.alert || "unaware";
    const baseDeg = fov.halfAngleDeg[alert] ?? fov.halfAngleDeg.unaware;
    const scale = fov.stanceScale[soldier.stance | 0] ?? fov.stanceScale[0];
    const half = (baseDeg * scale) * Math.PI / 180;
    const radius = ai.SightRange(0);
    const yaw = soldier.lookYaw || soldier.yaw;
    const x = soldier.position.x;
    const z = soldier.position.z;
    const SEGMENTS = 16;
    // 两道弧：远弧就是 SightRange（他到底能看多远），近弧 15 m 让「这个扇形张多开」
    // 在贴身距离上也读得出来 —— 只有远弧的话，一百二十米外那条线跟地平线分不开。
    for (const [distance, edges] of [[radius, true], [Math.min(15, radius), false]]) {
      let px = 0;
      let pz = 0;
      for (let i = 0; i <= SEGMENTS; i += 1) {
        const a = yaw - half + (2 * half * i) / SEGMENTS;
        const ax = x + ForwardX(a) * distance;
        const az = z + ForwardZ(a) * distance;
        if (edges && (i === 0 || i === SEGMENTS)) overlay.Segment(x, eyeY, z, ax, eyeY, az, RGB.cone);
        if (i > 0) overlay.Segment(px, eyeY, pz, ax, eyeY, az, RGB.cone);
        px = ax; pz = az;
      }
    }
    // 全向感知半径（贴脸就是看得见，与朝向无关）：脚下画一圈小的。
    const omni = fov.omniRadiusM;
    let ox = x + omni;
    let oz = z;
    for (let i = 1; i <= 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const nx = x + Math.cos(a) * omni;
      const nz = z + Math.sin(a) * omni;
      overlay.Segment(ox, soldier.position.y + 0.05, oz, nx, soldier.position.y + 0.05, nz, RGB.cone);
      ox = nx; oz = nz;
    }
  }

  /** 选中者的掩体：隐蔽位、射击位、两者的连线、掩体法线。 */
  DrawCoverPose(soldier) {
    const overlay = this.overlay;
    const cover = soldier.cover;
    const y = soldier.position.y;
    if (cover.hidePos) {
      overlay.Segment(cover.hidePos.x, y, cover.hidePos.z, cover.hidePos.x, y + 1.5, cover.hidePos.z, RGB.hide);
      overlay.Point(cover.hidePos.x, y + 1.5, cover.hidePos.z, RGB.hide);
    }
    if (cover.firePos) {
      overlay.Segment(cover.firePos.x, y, cover.firePos.z, cover.firePos.x, y + 1.5, cover.firePos.z, RGB.fire);
      overlay.Point(cover.firePos.x, y + 1.5, cover.firePos.z, RGB.fire);
    }
    if (cover.hidePos && cover.firePos) {
      overlay.Segment(cover.hidePos.x, y + 1.5, cover.hidePos.z, cover.firePos.x, y + 1.5, cover.firePos.z, RGB.normal);
    }
    // 掩体点本体与它的法线（法线指向「这堵墙挡着的那一面」的外侧）。
    const height = Number.isFinite(cover.height) ? cover.height : 1.0;
    overlay.Segment(cover.x, y, cover.z, cover.x, y + height, cover.z, RGB.normal);
    if (cover.nx || cover.nz) {
      overlay.Segment(cover.x, y + height, cover.z,
        cover.x + cover.nx * 1.2, y + height, cover.z + cover.nz * 1.2, RGB.normal);
    }
    // 人 → 隐蔽位：一眼看出「他到位了没有」。
    if (cover.hidePos) {
      overlay.Segment(soldier.position.x, y + 0.2, soldier.position.z,
        cover.hidePos.x, y + 0.2, cover.hidePos.z, RGB.hide);
    }
  }

  /** 班组连线：每人连到本班重心。看队形有没有散、侧翼手是不是真的走出去了。 */
  DrawSquadLinks(ai, camera) {
    const centers = new Map();
    for (const s of ai.soldiers) {
      if (!s.alive || !s.squadId) continue;
      if (camera && Math.hypot(s.position.x - camera.x, s.position.z - camera.z) > 90) continue;
      let center = centers.get(s.squadId);
      if (!center) { center = { x: 0, z: 0, y: 0, n: 0, members: [] }; centers.set(s.squadId, center); }
      center.x += s.position.x; center.z += s.position.z; center.y += s.position.y;
      center.n += 1;
      center.members.push(s);
    }
    for (const center of centers.values()) {
      const cx = center.x / center.n;
      const cz = center.z / center.n;
      const cy = center.y / center.n + 1.6;
      for (const s of center.members) {
        this.overlay.Segment(s.position.x, s.position.y + 1.6, s.position.z, cx, cy, cz, RGB.squad);
      }
    }
  }

  /** 相机附近的掩体点，按「验证过 / 选上未验证 / 被占 / 无」上色。 */
  DrawNearbyCovers(ai, camera) {
    const registry = ai.covers;
    if (!registry) return;
    // 空间查询与地表采样一起限流：`Nearby` 会 slice 出新数组，`GroundHeight` 是
    // 每点一次的采样 —— 400 个点每帧问一遍就是这个面板自己把帧吃掉。
    if (this.coverTimer >= COVER_QUERY_S || !this.nearbyCovers.length) {
      this.coverTimer = 0;
      const found = registry.Nearby(camera.x, camera.z, COVER_DRAW_M) || [];
      this.nearbyCovers = found.length > COVER_DRAW_MAX ? found.slice(0, COVER_DRAW_MAX) : found;
      // 掩体点只有 (x, z, height)：height 是「墙有多高」，不是世界 Y。
      // 画在哪一层要问地表，否则整片点会浮在原点高度上。
      const battlefield = this.host.game?.battlefield;
      for (let i = 0; i < this.nearbyCovers.length; i += 1) {
        const cover = this.nearbyCovers[i];
        let ground = 0;
        try { ground = battlefield?.GroundHeight?.(cover.x, cover.z) ?? 0; } catch { ground = 0; }
        this.nearbyY[i] = (Number.isFinite(ground) ? ground : 0) + Math.min(cover.height || 0.8, 2.2);
      }
    }
    // 哪些点是「有人选上了」：注册表只记占用，验证结果在人身上的 cover 候选里。
    const chosen = this._chosen || (this._chosen = new Map());
    chosen.clear();
    for (const s of ai.soldiers) {
      if (!s.alive || !s.cover) continue;
      chosen.set(s.cover.id, !!s.cover.validated);
    }
    for (let i = 0; i < this.nearbyCovers.length; i += 1) {
      const cover = this.nearbyCovers[i];
      let rgb = RGB.coverIdle;
      if (chosen.has(cover.id)) rgb = chosen.get(cover.id) ? RGB.coverValidated : RGB.coverSelected;
      else if (registry.OccupantOf(cover.id) !== null) rgb = RGB.coverClaimed;
      const top = this.nearbyY[i];
      this.overlay.Point(cover.x, top, cover.z, rgb);
      if (cover.hasNormal) {
        this.overlay.Segment(cover.x, top, cover.z,
          cover.x + cover.nx * 0.6, top, cover.z + cover.nz * 0.6, rgb);
      }
    }
  }

  RefreshWorld() {
    const facts = this.ui.worldFacts;
    if (!facts || !this.overlay) return;
    facts.Set("线段", this.overlay.lines.count / 2);
    facts.Set("点", this.overlay.points.count);
    facts.Set("附近掩体", this.nearbyCovers.length);
    facts.Set("本帧 ms", this.overlayMs.toFixed(3), this.overlayMs > 0.3 ? "bad" : "good");
    facts.Set("挂在", this.overlayHost === "post" ? "post 调试层" : this.overlayHost);
    this.ui.headToggle?.Set(!!globalThis.Taierzhuang?.Debug?.Ai?.Overlay?.());
  }

  // ------------------------------------------------------------------ 5 调参

  BuildTuning(box) {
    this.ui.tuningStatus = Note(box, "");
    if (this.tuning.frozen) {
      Note(box, "只读：线上或未开 ?aiedit=1。表被 Object.freeze 冻住，滑杆已禁用。", true);
    }
    this.ui.tableChips = Chips(box, TUNING_TABLES.map((t) => ({ value: t.id, label: t.label })),
      this.tuningTable, (id) => this.SetTuningTable(id));
    this.ui.tableChips.root.classList.add("edAiTables");

    ButtonRow(box, [
      { label: "重置到文件值", onClick: () => this.ResetTuning() },
      { label: "复制 mjs 片段", onClick: () => this.CopySnippet() },
      { label: "保存到源码", onClick: () => this.SaveToSource() },
    ]);
    this.ui.snippet = TextArea(box, { rows: 4, placeholder: "改过的键会出现在这里（同时尝试写进剪贴板）" });

    this.ui.tableBoxes = new Map();
    for (const table of this.tuning.tables) {
      const tableBox = El("div", "edAiTable");
      tableBox.dataset.table = table.id;
      box.appendChild(tableBox);
      this.ui.tableBoxes.set(table.id, tableBox);

      let group = null;
      let groupName = "";
      for (const entry of table.entries) {
        if (entry.group !== groupName) {
          groupName = entry.group;
          group = Section(tableBox, groupName);
        }
        this.MakeTuningControl(group, entry);
      }
      if (!table.entries.length) Note(tableBox, "这张表里没有可调的数值叶子。");
    }
    this.SetTuningTable(this.tuningTable);
  }

  /** 一个叶子的控件：数值给滑杆，布尔给开关。改动**直接写回表对象**。 */
  MakeTuningControl(parent, entry) {
    const label = entry.path.slice(entry.group.length + 1) || entry.key;
    if (entry.kind === "boolean") {
      const row = El("div", "edRow");
      row.appendChild(El("div", "l", label));
      const cell = El("div", "c");
      row.appendChild(cell);
      parent.appendChild(row);
      const toggle = Toggle(cell, entry.fileValue ? "开" : "关", entry.fileValue,
        (on) => { this.ApplyTuning(entry, on); toggle.root.textContent = on ? "开" : "关"; });
      toggle.root.disabled = this.tuning.frozen;
      toggle.root.title = entry.path;
      entry.control = { root: row, Set: (v) => { toggle.Set(!!v); toggle.root.textContent = v ? "开" : "关"; } };
      return;
    }
    const digits = entry.step >= 1 ? 0 : Math.min(6, Math.max(2, -Math.floor(Math.log10(entry.step))));
    const slider = Slider(parent, {
      label, min: entry.min, max: entry.max, step: entry.step, value: entry.fileValue,
      format: (v) => v.toFixed(digits),
      onInput: (v) => this.ApplyTuning(entry, v),
    });
    slider.root.title = `${entry.path}（文件值 ${entry.fileValue}）`;
    slider.root.dataset.path = entry.path;
    const input = slider.root.querySelector("input");
    if (input && this.tuning.frozen) input.disabled = true;
    entry.control = slider;
  }

  /** 把值写进表对象。表在本机不冻结，四个模块都在调用时读表，所以下一次 Think 就生效。 */
  ApplyTuning(entry, value) {
    if (this.tuning.frozen) return false;
    entry.owner[entry.key] = entry.kind === "boolean" ? !!value : Number(value);
    this.SetTuningStatus(`${entry.path} = ${entry.owner[entry.key]}`, false);
    return true;
  }

  /** 外部（测试 / 行为图跳转）改一个键。走的是与拖滑杆完全相同的那条路。 */
  SetTuningByPath(path, value) {
    const entry = this.tuning.byPath.get(path);
    if (!entry) return false;
    if (!this.ApplyTuning(entry, value)) return false;
    entry.control?.Set(entry.owner[entry.key]);
    return true;
  }

  /** 与文件值不同的那些键。 */
  ChangedEntries() {
    const out = [];
    for (const table of this.tuning.tables) {
      for (const entry of table.entries) {
        if (entry.owner[entry.key] !== entry.fileValue) out.push(entry);
      }
    }
    return out;
  }

  ResetTuning() {
    let n = 0;
    for (const entry of this.ChangedEntries()) {
      entry.owner[entry.key] = entry.fileValue;
      entry.control?.Set(entry.fileValue);
      n += 1;
    }
    this.SetTuningStatus(n ? `已还原 ${n} 个键到文件值。` : "没有改过的键。", false);
    return n;
  }

  SetTuningTable(id) {
    if (!this.ui?.tableBoxes?.has(id)) return;
    this.tuningTable = id;
    for (const [key, box] of this.ui.tableBoxes) box.classList.toggle("on", key === id);
    this.ui.tableChips?.Set(id);
  }

  SetTuningStatus(text, warn) {
    const note = this.ui?.tuningStatus;
    if (!note) return;
    note.textContent = text || "";
    note.classList.toggle("warn", !!warn);
  }

  /** 「路径: 值」清单 + 一段可直接贴回源码对照的 JSON。 */
  Snippet() {
    const changed = this.ChangedEntries();
    if (!changed.length) return "（没有改过的键）";
    const byFile = new Map();
    for (const entry of changed) {
      if (!byFile.has(entry.file)) byFile.set(entry.file, []);
      byFile.get(entry.file).push(entry);
    }
    const lines = ["// 敌军 AI 调参改动（Script_EditorAi）"];
    const json = {};
    for (const [file, entries] of byFile) {
      lines.push(file);
      json[file] = [];
      for (const entry of entries) {
        const value = entry.owner[entry.key];
        lines.push(`  ${entry.path}: ${value}   // 文件值 ${entry.fileValue}`);
        json[file].push({ path: entry.path, value });
      }
    }
    lines.push("");
    lines.push(JSON.stringify(json));
    return lines.join("\n");
  }

  CopySnippet() {
    const text = this.Snippet();
    if (this.ui?.snippet) {
      this.ui.snippet.value = text;
      this.ui.snippet.select?.();
    }
    // 剪贴板在无头浏览器与非安全上下文里会拒绝；文本框里那份才是保底的那一份。
    navigator.clipboard?.writeText?.(text).catch(() => {});
    this.SetTuningStatus(`片段已生成（${this.ChangedEntries().length} 个键），也在下面的文本框里。`, false);
    return text;
  }

  /**
   * 存回源码。契约见 docs/Data_EnemyAi.md §14.3：
   *   GET  /__tuning/status → { writable }
   *   POST /__tuning/save   { file, changes:[{path, value}] } → { ok, applied, missing }
   * 端点只在本地预览服务器上有；404 / 失败一律退化为「复制片段」，并把原因写在面板上。
   */
  async SaveToSource() {
    const changed = this.ChangedEntries();
    if (!changed.length) { this.SetTuningStatus("没有改过的键，不用保存。", false); return { ok: false, reason: "empty" }; }
    let writable = false;
    let reason = "";
    try {
      const response = await fetch(new URL("/__tuning/status", location.origin), { cache: "no-store" });
      if (response.ok) {
        const status = await response.json();
        writable = !!status?.writable;
        if (!writable) reason = "服务器说不可写";
      } else {
        reason = `没有保存端点（HTTP ${response.status}）`;
      }
    } catch (error) {
      reason = `保存端点问不到（${error?.message || error}）`;
    }
    if (!writable) {
      this.saveState = "readonly";
      this.CopySnippet();
      this.SetTuningStatus(`${reason || "不可写"}：已退化为「复制 mjs 片段」，手工贴回源码。`, true);
      return { ok: false, reason: reason || "readonly", degraded: true };
    }
    this.saveState = "writable";

    const byFile = new Map();
    for (const entry of changed) {
      if (!byFile.has(entry.file)) byFile.set(entry.file, []);
      byFile.get(entry.file).push({ path: entry.path, value: entry.owner[entry.key] });
    }
    let applied = 0;
    const missing = [];
    for (const [file, changes] of byFile) {
      try {
        const response = await fetch(new URL("/__tuning/save", location.origin), {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ file, changes }),
        });
        const result = response.ok ? await response.json() : null;
        if (!result?.ok) { missing.push(`${file}（HTTP ${response.status}）`); continue; }
        applied += result.applied || 0;
        for (const path of result.missing || []) missing.push(`${file}:${path}`);
      } catch (error) {
        missing.push(`${file}（${error?.message || error}）`);
      }
    }
    // 保存成功的键从此就是新的「文件值」，否则「重置」会把刚存下去的数又拨回去。
    if (applied > 0 && !missing.length) {
      for (const entry of changed) entry.fileValue = entry.owner[entry.key];
    }
    this.SetTuningStatus(`已写回 ${applied} 个键${missing.length ? `；${missing.length} 个没落地：${missing.join(", ")}` : "。"}`,
      missing.length > 0);
    return { ok: true, applied, missing };
  }

  // ------------------------------------------------------------------ 6 试验场

  BuildProbe(box) {
    Note(box, "固定试验场：找一堵墙，对面撒一个班，玩家无敌。改完数值在同一个场景里反复看。");
    ButtonRow(box, [
      { label: "撒一个班（对面有墙）", onClick: () => this.SpawnProbe() },
      { label: "玩家无敌", onClick: () => this.MakeImmortal() },
      { label: "清场还原", onClick: () => this.ClearProbe() },
      { label: "重置本局 AI 记忆", onClick: () => this.ResetMemory() },
    ]);
    this.ui.probeNote = Note(box, "", true);
    this.ui.probeFacts = Facts(Section(box, "现场"), ["试验场", "撒出", "玩家血量", "全场存活"]);
  }

  /**
   * 一键开场。走 `Script_AiProbeScene.SetupArena`（找墙 → 对面撒班 → 清场 → 摆玩家 → 无敌），
   * 它没实现时退回四步分调 —— 试验场是并行交付的，编辑器不该因为它还是桩就抛错。
   * 拿不到场地一律**明说「未就绪」**，不装作成功了。
   */
  SpawnProbe() {
    const T = globalThis.Taierzhuang;
    const player = this.host.game?.player;
    if (!T || !player) { this.SetProbeNote("拿不到 window.Taierzhuang / 玩家，试验场用不了。"); return null; }
    let site = null;
    let squad = [];
    let restore = null;
    try {
      // cx/cz 必须给：`SetupArena` 把它们直接转交 `PickSite`，不给就是
      // `Nearby(undefined, undefined, 110)` —— 一个候选都挑不到，看起来像「这一关没有墙」。
      const search = { cx: player.position.x, cz: player.position.z };
      if (typeof ProbeScene.SetupArena === "function") {
        const arena = ProbeScene.SetupArena(T, search) || {};
        site = arena.site || null;
        squad = arena.squad || [];
        restore = arena.Restore || null;
      } else {
        site = ProbeScene.PickSite(T, player.position.x, player.position.z);
        if (site) {
          squad = ProbeScene.SpawnProbeSquad(T, site, {}) || [];
          restore = ProbeScene.IsolateSquad(T, squad);
          ProbeScene.PlacePlayer(T, site.playerAt || site.open || site, site.playerStance ?? "stand", site.playerYaw ?? site.yaw ?? 0);
          ProbeScene.Immortal(T);
        }
      }
    } catch (error) {
      this.SetProbeNote(`试验场抛错：${error?.message || error}`);
      return null;
    }
    if (!site) { this.SetProbeNote("试验场未就绪：找不到合格的墙（PickSite 返回 null）。"); return null; }
    if (!squad.length) { this.SetProbeNote("试验场未就绪：一个人都没撒出来。"); return null; }
    this.probeRestore = typeof restore === "function" ? restore : null;
    this.probeSquad = squad;
    this.SetProbeNote(`已撒 ${squad.length} 人 · 交战距离 ${Number(site.rangeM || 0).toFixed(0)} m`);
    if (squad[0]) { this.selectedId = squad[0].id; this.Refresh(true); }
    return squad;
  }

  /** 玩家 + 全场 AI 顶血。**不按「值有没有变」判成败** —— 撒班那一步已经顶过一次了。 */
  MakeImmortal() {
    const T = globalThis.Taierzhuang;
    if (!T) { this.SetProbeNote("拿不到 window.Taierzhuang。"); return false; }
    try { ProbeScene.Immortal(T); } catch (error) {
      this.SetProbeNote(`Immortal 抛错：${error?.message || error}`);
      return false;
    }
    const after = this.host.game?.player?.health;
    const ok = Number.isFinite(after) && after >= 1e6;
    this.SetProbeNote(ok ? `玩家血量 ${after}，全场 AI 一并顶血。`
      : `试验场未就绪：Immortal 没把玩家血量顶上去（现在 ${after}）。`);
    return ok;
  }

  ClearProbe() {
    if (!this.probeRestore) { this.SetProbeNote("没有可还原的试验场。"); return false; }
    try { this.probeRestore(); } catch (error) {
      this.SetProbeNote(`还原抛错：${error?.message || error}`);
      return false;
    }
    this.probeRestore = null;
    this.probeSquad = null;
    this.SetProbeNote("已还原。");
    return true;
  }

  /** 清掉这一局的敌情：每个人的感知记忆 + 班组黑板与令牌。**改运行时状态**。 */
  ResetMemory() {
    const ai = this.ai;
    if (!ai) { this.SetProbeNote("场上没有 AI 导演。"); return false; }
    let n = 0;
    for (const s of ai.soldiers) {
      if (!s.alive) continue;
      try { ai.perception.ForgetAll(s); n += 1; } catch { /* 记忆版本对不上就跳过 */ }
    }
    try { ai.tactics.Reset(); } catch { /* 黑板没建起来就算了 */ }
    this.SetProbeNote(`已清 ${n} 人的敌情记忆与全部班组黑板 / 令牌。`);
    return true;
  }

  SetProbeNote(text) {
    this.probeNote = text;
    if (this.ui?.probeNote) this.ui.probeNote.textContent = text;
  }

  RefreshProbe(state) {
    const facts = this.ui.probeFacts;
    if (!facts) return;
    facts.Set("试验场", this.probeRestore ? "已布置" : "未布置");
    facts.Set("撒出", this.probeSquad ? this.probeSquad.length : 0);
    facts.Set("玩家血量", this.host.game?.player?.health ?? "—");
    facts.Set("全场存活", state ? state.alive : "—");
  }

  // ------------------------------------------------------------------ 刷新

  Refresh(force) {
    if (!this.panel) return;
    const ai = this.ai;
    const state = ai ? ai.DebugState() : null;
    if (force || this.page === "overview") this.RefreshOverview(state);
    if (force || this.page === "soldier") {
      const list = this.ListSoldiers();
      this.RefreshSoldierList(list);
      this.RefreshSoldier(list);
    }
    if (force || this.page === "world") this.RefreshWorld();
    if (force || this.page === "probe") this.RefreshProbe(state);
    this.panel.SetSub(state ? `叠加层 · 存活 ${state.alive}` : "叠加层 · 等待战场");
  }
}

export default AiEditor;
