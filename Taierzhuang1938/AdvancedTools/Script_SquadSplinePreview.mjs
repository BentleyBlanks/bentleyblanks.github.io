// 小队行进 PCG 样条独立预览编辑器（AdvancedTools/Tool_SquadSplinePreview.html）。
// 复用场景编辑器 Data_SceneAssets.SCENE_LIST 与 Script_SceneInherit.FetchResolvedScene，
// 支持双视口多指触控 / 触控板手势、可视化 Profile 阵型图与实时头颈胸视线分离检视，不侵入游戏运行时。

import * as THREE from "three";
import { SCENE_CATEGORIES, SCENE_LIST } from "../Data_SceneAssets.mjs";
import { SceneDir, SceneFileName } from "../Script_SceneDoc.mjs";
import { FetchResolvedScene } from "../Script_SceneInherit.mjs";
import { PrepareSceneTerrain, GridSampler } from "../Script_SceneTrenches.mjs";
import {
  SQUAD_SPLINE_SCHEMA,
  SQUAD_SPLINE_PROFILES,
  SQUAD_SPLINE_PROFILE_ORDER,
  SQUAD_SPLINE_DEMO_SCENARIOS,
} from "../Data_Tuning_SquadSpline.mjs";
import { BuildSceneCorridorEnv } from "../Script_SquadSpline.mjs";
import { CompileSquadScene, ResolveSquadSplineTuning } from "../Script_SquadSplinePcg.mjs";
import { ApplyEditorLiteCameraProfile } from "../Script_CameraProfile.mjs";
import { CreateGameEnvironmentLighting } from "../Script_EnvironmentProfile.mjs";

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const Clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const SIDE_COLORS = {
  friend: { fill: "#2e7b94", stroke: "#d9f3fc", hex: 0x3b7d94, helmet: 0x4b5b64, label: "友军" },
  enemy: { fill: "#b64231", stroke: "#ffe0da", hex: 0x8f6b47, helmet: 0x5c573c, label: "日军" },
  civilian: { fill: "#7d689e", stroke: "#f0e8ff", hex: 0x736685, helmet: 0x504954, label: "老乡" },
};

const GAZE_COLORS = {
  stimulus: { stroke: "#ff5b4a", fill: "rgba(255, 91, 74, 0.30)", hex: 0xff5b4a, short: "声源" },
  poi: { stroke: "#f2c864", fill: "rgba(242, 200, 100, 0.26)", hex: 0xf2c864, short: "拐角" },
  leaderCheck: { stroke: "#6fd3e8", fill: "rgba(111, 211, 232, 0.25)", hex: 0x6fd3e8, short: "回看" },
  social: { stroke: "#6fd3e8", fill: "rgba(111, 211, 232, 0.22)", hex: 0x6fd3e8, short: "同伴" },
  scan: { stroke: "#9ae09a", fill: "rgba(154, 224, 154, 0.20)", hex: 0x9ae09a, short: "扫视" },
  route: { stroke: "rgba(220, 220, 205, 0.35)", fill: "rgba(220, 220, 205, 0.08)", hex: 0xc8c7b8, short: "前方" },
};

const PHASE_SHORT = {
  startDelay: "待发",
  move: "行进",
  brake: "收步",
  pause: "微停",
  rest: "喘息",
  stalkPause: "蹲停",
  ease: "缓步",
  arrived: "到达",
};

const SPEED_STEPS = [0.25, 0.5, 1.0, 1.5, 2.0];

// 每个内置演示场景的拓扑示意图 SVG（用图形直接传达场景特点）
const SCENARIO_META = {
  l1_trench_retreat: {
    short: "战壕",
    svg: `<svg viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M2 3h11l-3 8h6" opacity=".45"/><path d="M4 5.5 7 4.2 10 6 12 8.5 14 10" stroke-dasharray="1.8 1.5"/><circle cx="5" cy="4.8" r="1.1" fill="currentColor" stroke="none"/><circle cx="9.2" cy="5.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="13" cy="9.5" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  },
  l1_enemy_flank_open: {
    short: "野外",
    svg: `<svg viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 10.5C6 4.5 12 4.5 16 10.5" opacity=".4"/><circle cx="9" cy="4.2" r="1.3" fill="currentColor" stroke="none"/><circle cx="5" cy="7.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="13" cy="7.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="3" cy="10.8" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="10.8" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  },
  crossing_squads_demo: {
    short: "交叉",
    svg: `<svg viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2.5 11.5 15.5 2.5"/><path d="M2.5 2.5 15.5 11.5" stroke-dasharray="2.4 2" opacity=".75"/><circle cx="9" cy="7" r="2.2" fill="#0b0c0a" stroke="currentColor" stroke-width="1.1"/></svg>`,
  },
  morph_open_to_choke: {
    short: "收口",
    svg: `<svg viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M2 2.5 10 5.4h6M2 11.5 10 8.6h6" opacity=".5"/><circle cx="4.2" cy="5.2" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.8" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="9.2" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="14" cy="7" r="1.2" fill="currentColor" stroke="none"/></svg>`,
  },
  scene_default: {
    short: "自由",
    svg: `<svg viewBox="0 0 18 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M2.5 10.5C5.5 3 12.5 11 15.5 3.5"/><circle cx="2.5" cy="10.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="7" r="1.5" fill="#edca83" stroke="none"/><circle cx="15.5" cy="3.5" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  },
};

// 8 种 Profile 的阵型示意图 SVG（一眼看懂阵型结构与节奏，不依赖大段文字）
const PROFILE_DIAGRAMS = {
  trench_march_cautious: `<svg class="sp-profileSvg" viewBox="0 0 76 28" fill="none" stroke="currentColor">
    <path d="M4 6h68M4 22h68" stroke-opacity=".32" stroke-width="1.1" stroke-dasharray="3 2"/>
    <path d="M12 18 24 10 38 18 52 10 64 15" stroke-opacity=".42" stroke-width="1"/>
    <circle cx="12" cy="18" r="2.3" fill="currentColor" stroke="none" opacity=".7"/>
    <circle cx="24" cy="10" r="2.3" fill="currentColor" stroke="none" opacity=".82"/>
    <circle cx="38" cy="18" r="2.3" fill="currentColor" stroke="none" opacity=".85"/>
    <circle cx="52" cy="10" r="2.3" fill="currentColor" stroke="none" opacity=".92"/>
    <circle cx="64" cy="15" r="2.8" fill="currentColor" stroke="none"/>
    <path d="M64 15l7-4M52 10l6-4M38 18l5 4" stroke-width="1.1" stroke-linecap="round" opacity=".72"/>
  </svg>`,
  tactical_flank_open: `<svg class="sp-profileSvg" viewBox="0 0 76 28" fill="none" stroke="currentColor">
    <path d="M14 23 56 14 14 5" stroke-opacity=".28" stroke-width="1" stroke-dasharray="2 2"/>
    <circle cx="14" cy="6" r="2.1" fill="currentColor" stroke="none" opacity=".72"/>
    <circle cx="16" cy="22" r="2.1" fill="currentColor" stroke="none" opacity=".72"/>
    <circle cx="31" cy="9" r="2.2" fill="currentColor" stroke="none" opacity=".84"/>
    <circle cx="33" cy="19" r="2.2" fill="currentColor" stroke="none" opacity=".84"/>
    <rect x="44" y="10" width="12" height="8" rx="4" stroke-opacity=".55" stroke-width="1"/>
    <circle cx="48" cy="14" r="2.2" fill="currentColor" stroke="none"/>
    <circle cx="53" cy="14" r="1.8" fill="currentColor" stroke="none" opacity=".82"/>
    <circle cx="65" cy="14" r="2.7" fill="currentColor" stroke="none"/>
  </svg>`,
  tactical_assault_bounds: `<svg class="sp-profileSvg" viewBox="0 0 76 28" fill="none" stroke="currentColor">
    <path d="M12 20c8-5 15-5 22 0M36 9c8-4 15-4 22 1" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>
    <path d="m32 18 3 2-3.5 1.2M56 8l3 2-3.5 1.2" stroke-opacity=".65" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="20" r="2.2" fill="currentColor" stroke="none" opacity=".75"/>
    <circle cx="24" cy="15" r="2.2" fill="currentColor" stroke="none" opacity=".85"/>
    <circle cx="38" cy="19" r="2.4" fill="currentColor" stroke="none" opacity=".55"/>
    <circle cx="38" cy="19" r="4.2" stroke-opacity=".55" stroke-dasharray="2 1.5"/>
    <circle cx="54" cy="12" r="2.4" fill="currentColor" stroke="none" opacity=".9"/>
    <circle cx="65" cy="8" r="2.7" fill="currentColor" stroke="none"/>
  </svg>`,
  guided_run_combat: `<svg class="sp-profileSvg" viewBox="0 0 76 28" fill="none" stroke="currentColor">
    <path d="M10 15c16-4 32 4 54-1" stroke-opacity=".35" stroke-width="1.1" stroke-dasharray="3 2"/>
    <circle cx="14" cy="12" r="2.1" fill="currentColor" stroke="none" opacity=".68"/>
    <circle cx="20" cy="18" r="2.1" fill="currentColor" stroke="none" opacity=".75"/>
    <circle cx="30" cy="11" r="2.2" fill="currentColor" stroke="none" opacity=".82"/>
    <circle cx="36" cy="17" r="2.2" fill="currentColor" stroke="none" opacity=".86"/>
    <circle cx="46" cy="14" r="2.3" fill="currentColor" stroke="none" opacity=".92"/>
    <circle cx="64" cy="14" r="3.2" fill="currentColor" stroke="none"/>
    <circle cx="64" cy="14" r="5.5" stroke-opacity=".55" stroke-width="1"/>
  </svg>`,
  road_march_relaxed: `<svg class="sp-profileSvg" viewBox="0 0 76 28" fill="none" stroke="currentColor">
    <path d="M4 5h68M4 23h68" stroke-opacity=".22" stroke-width="1"/>
    <path d="M14 11l6 5M34 17l7-5M54 11l7 4" stroke-opacity=".45" stroke-width="1" stroke-dasharray="2 1.5"/>
    <circle cx="14" cy="11" r="2.2" fill="currentColor" stroke="none" opacity=".76"/>
    <circle cx="20" cy="16" r="2.2" fill="currentColor" stroke="none" opacity=".76"/>
    <circle cx="34" cy="17" r="2.2" fill="currentColor" stroke="none" opacity=".85"/>
    <circle cx="41" cy="12" r="2.2" fill="currentColor" stroke="none" opacity=".85"/>
    <circle cx="54" cy="11" r="2.3" fill="currentColor" stroke="none" opacity=".92"/>
    <circle cx="61" cy="15" r="2.5" fill="currentColor" stroke="none"/>
  </svg>`,
  urgent_retreat: `<svg class="sp-profileSvg" viewBox="0 0 76 28" fill="none" stroke="currentColor">
    <path d="M8 10h9M6 18h10M24 8h8M22 19h9" stroke-opacity=".48" stroke-width="1.3" stroke-linecap="round"/>
    <circle cx="22" cy="10" r="2.2" fill="currentColor" stroke="none" opacity=".75"/>
    <circle cx="20" cy="18" r="2.2" fill="currentColor" stroke="none" opacity=".75"/>
    <circle cx="36" cy="11" r="2.3" fill="currentColor" stroke="none" opacity=".86"/>
    <circle cx="38" cy="18" r="2.3" fill="currentColor" stroke="none" opacity=".86"/>
    <circle cx="52" cy="12" r="2.5" fill="currentColor" stroke="none" opacity=".94"/>
    <path d="m61 9 6 5-6 5" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
  stealth_infiltrate: `<svg class="sp-profileSvg" viewBox="0 0 76 28" fill="none" stroke="currentColor">
    <path d="M8 18C22 12 36 18 52 13c6-2 11-1 16 1" stroke-opacity=".45" stroke-width="1.1" stroke-dasharray="2 2"/>
    <circle cx="14" cy="16.5" r="2" fill="currentColor" stroke="none" opacity=".68"/>
    <circle cx="29" cy="15.2" r="2.1" fill="currentColor" stroke="none" opacity=".8"/>
    <circle cx="45" cy="14.6" r="2.2" fill="currentColor" stroke="none" opacity=".9"/>
    <circle cx="62" cy="13.5" r="2.5" fill="currentColor" stroke="none"/>
    <path d="M62 13.5l8-6M62 13.5l8 5" stroke-opacity=".55" stroke-width="1" stroke-linecap="round"/>
  </svg>`,
  civilian_convoy: `<svg class="sp-profileSvg" viewBox="0 0 76 28" fill="none" stroke="currentColor">
    <rect x="30" y="10" width="16" height="8" rx="2" stroke-width="1.3" fill="currentColor" fill-opacity=".18"/>
    <circle cx="16" cy="13" r="2.1" fill="currentColor" stroke="none" opacity=".72"/>
    <circle cx="23" cy="17" r="2" fill="currentColor" stroke="none" opacity=".76"/>
    <circle cx="33" cy="6.2" r="1.9" fill="currentColor" stroke="none" opacity=".85"/>
    <circle cx="43" cy="21.8" r="1.9" fill="currentColor" stroke="none" opacity=".85"/>
    <circle cx="53" cy="12" r="2.2" fill="currentColor" stroke="none" opacity=".92"/>
    <circle cx="61" cy="15.5" r="2.4" fill="currentColor" stroke="none"/>
  </svg>`,
};

const PARAM_GROUPS = [
  {
    id: "corridor",
    title: "走廊形态",
    open: true,
    items: [
      { key: "maxSpreadM", label: "受限走廊展开 (m)", min: 0.4, max: 5.0, step: 0.1 },
      { key: "openSpreadM", label: "野外散兵展开 (m)", min: 1.0, max: 11.0, step: 0.2 },
      { key: "openFieldThresholdM", label: "开阔判定宽度 (m)", min: 2.2, max: 7.0, step: 0.2 },
      { key: "cornerCutStrength", label: "弯道切内弯", min: 0, max: 1.0, step: 0.05 },
      { key: "wanderAmpM", label: "横向有机漫游 (m)", min: 0, max: 1.2, step: 0.04 },
      { key: "intraClusterGapM", label: "同簇纵距 (m)", min: 0.5, max: 3.0, step: 0.05 },
      { key: "interClusterGapM", label: "簇间空隙 (m)", min: 1.0, max: 5.5, step: 0.1 },
      { key: "obstacleClearanceM", label: "掩体避让净空 (m)", min: 0.2, max: 1.4, step: 0.05 },
      { key: "concealmentClamp", label: "起始遮挡收束", type: "bool" },
    ],
  },
  {
    id: "gait",
    title: "步态避让",
    open: true,
    items: [
      { key: "speedMps", label: "基准速度 (m/s)", min: 0.6, max: 5.0, step: 0.05 },
      { key: "speedVariation", label: "个体步频差异", min: 0, max: 0.25, step: 0.01 },
      { key: "paceWobble", label: "步速呼吸起伏", min: 0, max: 0.18, step: 0.01 },
      { key: "startDelayWaveS", label: "多米诺起步波 (s)", min: 0, max: 0.45, step: 0.02 },
      { key: "restFraction", label: "同时停步上限", min: 0.05, max: 0.50, step: 0.02 },
      { key: "runMinS", label: "最短连行 (s)", min: 1.2, max: 8.0, step: 0.2 },
      { key: "pauseMaxS", label: "最长停步 (s)", min: 0.4, max: 3.2, step: 0.1 },
      { key: "minGapM", label: "前车最小跟距 (m)", min: 0.7, max: 3.2, step: 0.05 },
      { key: "crossSquadAvoidM", label: "跨队礼让间距 (m)", min: 0.8, max: 3.0, step: 0.1 },
    ],
  },
  {
    id: "gaze",
    title: "行进视线",
    open: true,
    items: [
      { key: "alertness", label: "警戒活跃度", min: 0.1, max: 1.0, step: 0.05 },
      { key: "scanIntervalMinS", label: "最短扫视冷却 (s)", min: 0.8, max: 7.0, step: 0.2 },
      { key: "maxGazeYawDeg", label: "最大转头角 (°)", min: 15, max: 85, step: 2 },
      { key: "fixationMaxS", label: "凝视停留 (s)", min: 0.3, max: 2.4, step: 0.1 },
      { key: "poiWeight", label: "拐角 / 沟沿权重", min: 0, max: 1.0, step: 0.05 },
      { key: "socialWeight", label: "同伴社交权重", min: 0, max: 1.0, step: 0.05 },
      { key: "rimPitchDeg", label: "沟沿仰角 (°)", min: 0, max: 24, step: 1 },
      { key: "lookBackSlowdown", label: "回头联动减速", min: 0, max: 0.35, step: 0.02 },
    ],
  },
];

function SyncRangeFill(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const val = Number(input.value) || 0;
  const pct = max > min ? Clamp(((val - min) / (max - min)) * 100, 0, 100) : 0;
  input.style.setProperty("--pct", `${pct.toFixed(1)}%`);
}

function BuildDefaultMembers(side, count, profileId) {
  const namesFriend = ["罗班长", "何有田", "刘文财", "幺娃"];
  const list = [];
  for (let i = 0; i < count; i += 1) {
    if (side === "enemy" && profileId === "tactical_flank_open" && count >= 2 && i < 2) {
      list.push({
        id: `m${i + 1}`,
        name: i === 0 ? "机枪主射手" : "机枪副射手",
        role: i === 0 ? "mgGunner" : "mgAssistant",
        socialGroup: "mg",
      });
      continue;
    }
    const role = i === 0 ? "leader" : (side === "friend" && i < 3 ? "core" : "rifleman");
    const name = side === "friend"
      ? (namesFriend[i] || `川军 ${i - 2}`)
      : side === "enemy"
        ? (i === 0 ? "日军尖兵" : `日军 ${i + 1}`)
        : (i === 0 ? "老耿" : `老乡 ${i + 1}`);
    list.push({ id: `m${i + 1}`, name, role, ...(side === "friend" && i < 3 ? { socialGroup: "cmd" } : {}) });
  }
  return list;
}

function ResizeMembers(existing, side, targetCount, profileId) {
  const out = existing.slice(0, targetCount).map((m) => ({ ...m }));
  if (out.length < targetCount) {
    const generated = BuildDefaultMembers(side, targetCount, profileId);
    for (let i = out.length; i < targetCount; i += 1) out.push(generated[i]);
  }
  return out;
}

class SquadSplinePreviewApp {
  constructor() {
    this.sceneCache = new Map();
    this.sceneId = "FirstLevelEncounter";
    this.sceneCatFilter = "all";
    this.loadedScene = null;
    this.env = null;

    this.scenarioId = SQUAD_SPLINE_DEMO_SCENARIOS[0].id;
    this.durationS = 36;
    this.squads = [];
    this.activeSquadIdx = 0;
    this.stimuli = [];
    this.compiled = null;

    this.time = 0;
    this.playing = true;
    this.loop = true;
    this.playSpeedIdx = 2; // 1.0x
    this.playSpeed = SPEED_STEPS[this.playSpeedIdx];
    this.layout = "split";
    this.navTool = "select"; // "select" | "hand" | "ping"
    this.inspectorOpen = true;
    this.activeTab = "presets";
    this.layers = { corridor: true, streamlines: true, clusters: true, gaze: true, pois: true, baseline: true, legend: false };
    this.selectedActorId = null;

    // 2D 视图与多指手势状态（对齐 Encounter Designer 触控契约）
    this.view2d = { cx: 38, cz: 78, scale: 13.5, baseScale: 13.5 };
    this.drag2d = null;
    this.touch2d = { points: new Map(), gesture: null, consumed: false, lastTap: { time: 0, x: 0, y: 0 } };

    // 3D 视口与多指手势状态
    this.three = null;
    this.camMode = "overview";
    this.cam3d = { target: new THREE.Vector3(38, 0, 78), yaw: 0.65, pitch: 0.56, dist: 24 };
    this.drag3d = null;
    this.touch3d = { points: new Map(), gesture: null, consumed: false };
    this.puppets3d = new Map();
    this.ghosts3d = new Map();
    this.selectRing3d = null;
    this.stimulusRings3d = [];
    this.raycaster = new THREE.Raycaster();

    this.ready = false;
    this.lastRaf = 0;
  }

  async Init() {
    this.BuildScenePicker();
    this.BuildScenarioBar();
    this.BuildProfileCards();
    this.BuildParamSliders();
    this.Init3D();
    this.BindUi();
    await this.LoadScenario(this.scenarioId);
    this.ready = true;
    this.lastRaf = performance.now();
    requestAnimationFrame((now) => this.Tick(now));
  }

  // ------------------------------------------------------------------ 分类场景选择器（复用 SceneEditor 数据）

  BuildScenePicker() {
    const catTabs = $("sceneCatTabs");
    catTabs.innerHTML = "";
    const cats = [{ id: "all", label: "全部" }, ...SCENE_CATEGORIES];
    for (const cat of cats) {
      const count = cat.id === "all" ? SCENE_LIST.length : SCENE_LIST.filter((s) => s.category === cat.id).length;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sp-sceneCatTab";
      btn.setAttribute("role", "tab");
      btn.dataset.cat = cat.id;
      btn.setAttribute("aria-selected", String(cat.id === this.sceneCatFilter));
      btn.innerHTML = `<span>${cat.label}</span><small>${count}</small>`;
      btn.addEventListener("click", () => {
        this.sceneCatFilter = cat.id;
        for (const b of catTabs.querySelectorAll(".sp-sceneCatTab")) {
          b.setAttribute("aria-selected", String(b.dataset.cat === cat.id));
        }
        this.RenderSceneList();
      });
      catTabs.appendChild(btn);
    }
    $("sceneFilter").addEventListener("input", () => this.RenderSceneList());
    this.RenderSceneList();
    this.SyncSceneSummary();
  }

  RenderSceneList() {
    const host = $("sceneList");
    const q = ($("sceneFilter").value || "").trim().toLowerCase();
    host.innerHTML = "";
    let shown = 0;
    for (const cat of SCENE_CATEGORIES) {
      if (this.sceneCatFilter !== "all" && this.sceneCatFilter !== cat.id) continue;
      const items = SCENE_LIST.filter((s) => {
        if (s.category !== cat.id) return false;
        if (!q) return true;
        return `${s.title} ${s.id} ${s.note || ""}`.toLowerCase().includes(q);
      });
      if (!items.length) continue;
      shown += items.length;
      const grp = document.createElement("div");
      grp.className = "sp-sceneGroup";
      const head = document.createElement("div");
      head.className = "sp-sceneGroupHead";
      head.innerHTML = `<span class="sp-catBadge" data-cat="${cat.id}">${cat.short || cat.label}</span><span>${cat.label}</span>`;
      grp.appendChild(head);
      for (const item of items) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `sp-sceneOption${item.id === this.sceneId ? " active" : ""}`;
        const inheritHtml = item.inherits ? `<span class="sp-inheritChip">继承</span>` : "";
        btn.innerHTML = `<span class="sp-sceneOptionName">${item.title}</span>${inheritHtml}<span class="sp-sceneOptionId">${item.id}</span>`;
        btn.addEventListener("click", () => {
          $("scenePicker").open = false;
          this.SwitchSceneOnly(item.id).catch((err) => this.ShowError(err.message));
        });
        grp.appendChild(btn);
      }
      host.appendChild(grp);
    }
    if (!shown) host.innerHTML = `<div class="sp-sceneEmpty">无匹配场景</div>`;
  }

  SyncSceneSummary() {
    const item = SCENE_LIST.find((s) => s.id === this.sceneId);
    const cat = SCENE_CATEGORIES.find((c) => c.id === item?.category);
    const badge = $("sceneCatBadge");
    badge.dataset.cat = item?.category || "encounter";
    badge.textContent = cat?.short || cat?.label || "场景";
    $("scenePickerTitle").textContent = item ? item.title : this.sceneId;
    this.RenderSceneList();
  }

  BuildScenarioBar() {
    const bar = $("scenarioBar");
    bar.innerHTML = "";
    const list = [
      ...SQUAD_SPLINE_DEMO_SCENARIOS.map((s) => ({ id: s.id, title: s.label })),
      { id: "scene_default", title: "当前场景自由编辑样条" },
    ];
    for (const item of list) {
      const meta = SCENARIO_META[item.id] || SCENARIO_META.scene_default;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sp-scenarioBtn";
      btn.dataset.scenario = item.id;
      btn.title = item.title;
      btn.setAttribute("aria-pressed", String(item.id === this.scenarioId));
      btn.innerHTML = `${meta.svg}<span>${meta.short}</span>`;
      btn.addEventListener("click", () => {
        this.LoadScenario(item.id).catch((err) => this.ShowError(err.message));
      });
      bar.appendChild(btn);
    }
  }

  SyncScenarioBar() {
    for (const btn of $("scenarioBar").querySelectorAll(".sp-scenarioBtn")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.scenario === this.scenarioId));
    }
  }

  // ------------------------------------------------------------------ 场景加载

  async EnsureSceneLoaded(sceneId) {
    if (this.sceneCache.has(sceneId)) {
      this.loadedScene = this.sceneCache.get(sceneId);
      this.env = this.loadedScene.env;
      this.sceneId = sceneId;
      this.SyncSceneSummary();
      return this.loadedScene;
    }
    this.ShowError("");
    const url = `../${SceneDir(sceneId)}/${SceneFileName(sceneId)}`;
    const fetched = await FetchResolvedScene(url, { includeHeightBytes: false });
    const prepared = PrepareSceneTerrain(fetched.doc, fetched.heights, fetched.datumBytes);
    const heightAt = GridSampler(fetched.doc.terrain, prepared.heights);
    const env = BuildSceneCorridorEnv(fetched.doc, { heightAt });
    const entry = { id: sceneId, doc: fetched.doc, heights: prepared.heights, heightAt, env };
    this.sceneCache.set(sceneId, entry);
    this.loadedScene = entry;
    this.env = env;
    this.sceneId = sceneId;
    this.SyncSceneSummary();
    return entry;
  }

  async LoadScenario(scenarioId) {
    this.scenarioId = scenarioId;
    this.SyncScenarioBar();
    const preset = SQUAD_SPLINE_DEMO_SCENARIOS.find((s) => s.id === scenarioId);
    if (preset) {
      await this.EnsureSceneLoaded(preset.sceneId);
      this.durationS = preset.durationS;
      this.squads = preset.squads.map((sq) => ({
        id: sq.id,
        label: sq.label,
        side: sq.side,
        profile: sq.profile,
        seed: sq.seed,
        startTimeS: sq.startTimeS || 0,
        route: sq.route.map((p) => [...p]),
        members: sq.members.map((m) => ({ ...m })),
        overrides: {},
        speakerEvents: (sq.speakerEvents || []).map((e) => ({ ...e })),
      }));
      this.activeSquadIdx = 0;
      this.stimuli = [];
      this.selectedActorId = null;
      this.view2d = { cx: preset.viewCenter[0], cz: preset.viewCenter[1], scale: preset.viewScale, baseScale: preset.viewScale };
    } else {
      await this.EnsureSceneLoaded(this.sceneId);
      const sp = this.loadedScene.doc.spawn || { x: 0, z: 0 };
      const sx = Number(sp.x) || 0, sz = Number(sp.z) || 0;
      this.durationS = 28;
      this.squads = [{
        id: "CustomSquad1",
        label: "自由样条队",
        side: "friend",
        profile: "guided_run_combat",
        seed: `${this.sceneId}_demo`,
        startTimeS: 0,
        route: [[sx - 22, sz - 8], [sx - 6, sz - 4], [sx + 8, sz + 4], [sx + 24, sz + 14]],
        members: BuildDefaultMembers("friend", 8, "guided_run_combat"),
        overrides: {},
        speakerEvents: [],
      }];
      this.activeSquadIdx = 0;
      this.stimuli = [];
      this.selectedActorId = null;
      this.view2d = { cx: sx, cz: sz, scale: 11, baseScale: 11 };
    }
    this.time = 0;
    $("timeRange").max = String(this.durationS);
    this.SyncZoomHud();
    this.RebuildAll({ rebuild3dScene: true, resetCamera3d: true });
  }

  async SwitchSceneOnly(sceneId) {
    await this.EnsureSceneLoaded(sceneId);
    const matching = SQUAD_SPLINE_DEMO_SCENARIOS.find((s) => s.id === this.scenarioId && s.sceneId === sceneId);
    if (!matching && sceneId !== "FirstLevelEncounter" && sceneId !== "FirstLevelMerged") {
      await this.LoadScenario("scene_default");
      return;
    }
    this.RebuildAll({ rebuild3dScene: true, resetCamera3d: false });
  }

  // ------------------------------------------------------------------ 编译与 UI 同步

  ActiveSquad() {
    return this.squads[Clamp(this.activeSquadIdx, 0, Math.max(0, this.squads.length - 1))] || null;
  }

  RebuildAll({ rebuild3dScene = false, resetCamera3d = false } = {}) {
    if (!this.squads.length) return;
    this.compiled = CompileSquadScene({
      env: this.env,
      durationS: this.durationS,
      stepS: 0.15,
      stimuli: this.stimuli,
      squads: this.squads,
    });
    this.SyncInspector();
    this.SyncTelemetry();
    this.SyncStimulusMarkers();
    if (rebuild3dScene) this.Rebuild3DEnvironment(resetCamera3d);
    this.Rebuild3DCurvesAndPuppets();
    this.RenderFrame();
  }

  BuildProfileCards() {
    const grid = $("profileGrid");
    grid.innerHTML = "";
    for (const id of SQUAD_SPLINE_PROFILE_ORDER) {
      const p = SQUAD_SPLINE_PROFILES[id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sp-profileCard";
      btn.setAttribute("role", "radio");
      btn.dataset.profile = id;
      btn.title = p.summary;
      btn.innerHTML = `${PROFILE_DIAGRAMS[id] || ""}<strong>${p.short}</strong>`;
      btn.addEventListener("click", () => {
        const sq = this.ActiveSquad();
        if (!sq) return;
        sq.profile = id;
        sq.overrides = {};
        this.RebuildAll();
      });
      grid.appendChild(btn);
    }
  }

  BuildParamSliders() {
    const host = $("paramGroups");
    host.innerHTML = "";
    this.sliderControls = new Map();
    for (const grp of PARAM_GROUPS) {
      const det = document.createElement("details");
      det.className = "sp-group";
      if (grp.open) det.open = true;
      const sum = document.createElement("summary");
      sum.textContent = grp.title;
      det.appendChild(sum);
      const wrap = document.createElement("div");
      wrap.className = "sp-sliders";
      for (const item of grp.items) {
        if (item.type === "bool") {
          const row = document.createElement("label");
          row.className = "sp-checkRow";
          const span = document.createElement("span");
          span.textContent = item.label;
          const input = document.createElement("input");
          input.type = "checkbox";
          input.className = "sp-switch";
          input.addEventListener("change", () => {
            const sq = this.ActiveSquad();
            if (!sq) return;
            sq.overrides[item.key] = input.checked;
            this.RebuildAll();
          });
          row.append(span, input);
          wrap.appendChild(row);
          this.sliderControls.set(item.key, { type: "bool", input });
        } else {
          const row = document.createElement("label");
          row.className = "sp-sliderRow";
          const head = document.createElement("div");
          head.className = "sp-sliderHead";
          const span = document.createElement("span");
          span.textContent = item.label;
          const val = document.createElement("strong");
          head.append(span, val);
          const input = document.createElement("input");
          input.type = "range";
          input.className = "sp-range";
          input.min = String(item.min);
          input.max = String(item.max);
          input.step = String(item.step);
          input.addEventListener("input", () => {
            const sq = this.ActiveSquad();
            if (!sq) return;
            const num = Number(input.value);
            sq.overrides[item.key] = num;
            SyncRangeFill(input);
            val.textContent = item.step < 0.1 ? num.toFixed(2) : item.step < 1 ? num.toFixed(1) : String(Math.round(num));
            this.RebuildAll();
          });
          row.append(head, input);
          wrap.appendChild(row);
          this.sliderControls.set(item.key, { type: "range", input, val, step: item.step });
        }
      }
      det.appendChild(wrap);
      host.appendChild(det);
    }
  }

  SyncInspector() {
    const tabs = $("squadTabs");
    tabs.innerHTML = "";
    this.squads.forEach((sq, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sp-squadTab";
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(idx === this.activeSquadIdx));
      const color = (SIDE_COLORS[sq.side] || SIDE_COLORS.friend).fill;
      btn.innerHTML = `<i class="dot" style="background:${color}"></i><span>${sq.label}</span><small>${sq.members.length}</small>`;
      btn.addEventListener("click", () => {
        this.activeSquadIdx = idx;
        this.SyncInspector();
        this.RenderFrame();
      });
      tabs.appendChild(btn);
    });
    $("removeSquadBtn").disabled = this.squads.length <= 1;

    const sq = this.ActiveSquad();
    if (!sq) return;
    $("pane2dMeta").textContent = `${sq.label} · ${sq.route.length} 点`;

    for (const card of $("profileGrid").querySelectorAll(".sp-profileCard")) {
      card.setAttribute("aria-checked", String(card.dataset.profile === sq.profile));
    }
    const profileDef = SQUAD_SPLINE_PROFILES[sq.profile] || SQUAD_SPLINE_PROFILES.trench_march_cautious;
    $("activeProfileBadge").textContent = profileDef.short;

    const hasOverrides = Object.keys(sq.overrides || {}).length > 0;
    $("overrideDot").hidden = !hasOverrides;
    $("resetProfileBtn").disabled = !hasOverrides;

    for (const b of document.querySelectorAll("[data-side]")) {
      b.setAttribute("aria-checked", String(b.dataset.side === sq.side));
    }
    const countRange = $("countRange");
    countRange.value = String(sq.members.length);
    SyncRangeFill(countRange);
    $("countVal").textContent = String(sq.members.length);
    $("seedInput").value = sq.seed;

    const tuning = ResolveSquadSplineTuning(sq.profile, sq.overrides);
    for (const [key, ctrl] of this.sliderControls) {
      if (ctrl.type === "bool") {
        ctrl.input.checked = !!tuning[key];
      } else {
        const v = Number(tuning[key]) || 0;
        ctrl.input.value = String(v);
        SyncRangeFill(ctrl.input);
        ctrl.val.textContent = ctrl.step < 0.1 ? v.toFixed(2) : ctrl.step < 1 ? v.toFixed(1) : String(Math.round(v));
      }
    }
  }

  SyncTelemetry() {
    const t = this.compiled?.telemetry;
    if (!t) return;
    const stdCls = t.lateralStdM >= 0.25 ? "good" : "warn";
    const stdPct = Clamp((t.lateralStdM / 1.8) * 100, 4, 100);

    const indep = Clamp(1 - t.avgSpeedCorr, 0, 1);
    const corrCls = t.avgSpeedCorr <= 0.45 ? "good" : t.avgSpeedCorr <= 0.72 ? "warn" : "bad";
    const indepPct = Clamp(indep * 100, 4, 100);

    const sepCls = t.minPairDistM >= 0.75 ? "good" : "bad";
    const sepPct = Clamp((t.minPairDistM / 1.6) * 100, 4, 100);
    const sepTick = (0.75 / 1.6) * 100;

    const gazeCls = t.gazeActiveRatio >= 0.12 ? "good" : "warn";
    const gazePct = Clamp(t.gazeActiveRatio * 100, 4, 100);

    $("telemetryGrid").innerHTML = `
      <div class="sp-metric" title="横向展开标准差 σd（原版直线为 0.00 m）">
        <div class="sp-metricTop"><span class="k">横向展开</span><span class="v ${stdCls}">${t.lateralStdM.toFixed(2)}m</span></div>
        <div class="sp-gauge"><div class="sp-gaugeFill ${stdCls}" style="width:${stdPct.toFixed(0)}%"></div><span class="sp-gaugeTick" style="left:14%"></span></div>
      </div>
      <div class="sp-metric" title="队员步速独立度 1−r（r = ${t.avgSpeedCorr.toFixed(2)}，原版齐步 r ≈ 1.00）">
        <div class="sp-metricTop"><span class="k">步态独立</span><span class="v ${corrCls}">${Math.round(indep * 100)}%</span></div>
        <div class="sp-gauge"><div class="sp-gaugeFill ${corrCls}" style="width:${indepPct.toFixed(0)}%"></div><span class="sp-gaugeTick" style="left:55%"></span></div>
      </div>
      <div class="sp-metric" title="全程最小人际间距（零叠压底线 ≥ 0.75 m${t.crossSquadAvoidEvents ? `，跨队礼让 ${t.crossSquadAvoidEvents} 次` : ""}）">
        <div class="sp-metricTop"><span class="k">最小间距</span><span class="v ${sepCls}">${t.minPairDistM.toFixed(2)}m</span></div>
        <div class="sp-gauge"><div class="sp-gaugeFill ${sepCls}" style="width:${sepPct.toFixed(0)}%"></div><span class="sp-gaugeTick" style="left:${sepTick.toFixed(0)}%"></span></div>
      </div>
      <div class="sp-metric" title="行进中左顾右盼活跃占比（张望 ${t.totalGlances} 次 · 错峰微停 ${t.totalPauses} 次）">
        <div class="sp-metricTop"><span class="k">张望活跃</span><span class="v ${gazeCls}">${Math.round(t.gazeActiveRatio * 100)}%</span></div>
        <div class="sp-gauge"><div class="sp-gaugeFill ${gazeCls}" style="width:${gazePct.toFixed(0)}%"></div><span class="sp-gaugeTick" style="left:12%"></span></div>
      </div>
    `;
  }

  SyncActorDial(frame) {
    const activeSq = this.ActiveSquad();
    const pinned = this.selectedActorId ? frame.actors.find((a) => a.id === this.selectedActorId) : null;
    const actor = pinned
      || frame.actors.find((a) => activeSq && a.squadId === activeSq.id && a.role === "leader")
      || frame.actors[0];
    if (!actor) return;

    const sideCol = (SIDE_COLORS[actor.side] || SIDE_COLORS.friend).fill;
    const gazeCol = GAZE_COLORS[actor.gazeKind] || GAZE_COLORS.route;

    // 顶视表盘：上方 (-Y) 为身体前向，左转为负角（在画面左侧）
    const Vec = (relYaw, len) => [32 - Math.sin(relYaw) * len, 32 - Math.cos(relYaw) * len];
    const [cx, cy] = Vec(actor.chestYaw, 17);
    const totalHead = actor.chestYaw + actor.neckYaw + actor.headYaw;
    const [hx, hy] = Vec(totalHead, 22);
    const [l1x, l1y] = Vec(totalHead + 0.34, 24);
    const [l2x, l2y] = Vec(totalHead - 0.34, 24);

    $("dialChestLine").setAttribute("x2", cx.toFixed(1));
    $("dialChestLine").setAttribute("y2", cy.toFixed(1));
    $("dialChestLine").setAttribute("stroke", sideCol);

    $("dialHeadLine").setAttribute("x2", hx.toFixed(1));
    $("dialHeadLine").setAttribute("y2", hy.toFixed(1));
    $("dialHeadLine").setAttribute("stroke", gazeCol.stroke);

    $("dialGazeCone").setAttribute("d", `M32 32 L${l1x.toFixed(1)} ${l1y.toFixed(1)} A24 24 0 0 1 ${l2x.toFixed(1)} ${l2y.toFixed(1)} Z`);
    $("dialGazeCone").setAttribute("fill", gazeCol.fill);

    $("actorName").textContent = actor.name;
    $("actorPhase").textContent = PHASE_SHORT[actor.phase] || actor.phase;
    const gazeEl = $("actorGaze");
    gazeEl.textContent = gazeCol.short;
    gazeEl.dataset.kind = actor.gazeKind;
    $("unpinActorBtn").hidden = !pinned;

    const headDeg = Math.round((actor.headYaw + actor.neckYaw) / DEG);
    const chestDeg = Math.round(actor.chestYaw / DEG);
    const pitchDeg = Math.round(actor.gazePitch / DEG);
    $("actorNums").innerHTML = `
      <span><b>${actor.speed.toFixed(1)}</b> m/s</span>
      <span>头 <b>${headDeg >= 0 ? "+" : ""}${headDeg}°</b></span>
      <span>枪 <b>${chestDeg >= 0 ? "+" : ""}${chestDeg}°</b></span>
      ${pitchDeg ? `<span>仰 <b>${pitchDeg > 0 ? "+" : ""}${pitchDeg}°</b></span>` : ""}
    `;
  }

  SyncStimulusMarkers() {
    const box = $("stimulusMarkers");
    box.innerHTML = "";
    for (const st of this.stimuli) {
      const dot = document.createElement("span");
      dot.className = "sp-markerDot";
      dot.style.left = `${Clamp((st.time / Math.max(0.1, this.durationS)) * 100, 0, 100)}%`;
      box.appendChild(dot);
    }
    const clearBtn = $("clearStimuliBtn");
    clearBtn.hidden = this.stimuli.length === 0;
    $("stimCount").textContent = String(this.stimuli.length);
  }

  SyncZoomHud() {
    const pct = Math.round((this.view2d.scale / Math.max(1, this.view2d.baseScale || 13.5)) * 100);
    $("zoomPct2d").textContent = `${Clamp(pct, 15, 600)}%`;
  }

  // ------------------------------------------------------------------ 导航工具与通用交互

  SetNavTool(tool) {
    this.navTool = tool;
    for (const btn of document.querySelectorAll("[data-nav-tool]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.navTool === tool));
    }
    $("canvas2d").dataset.navTool = tool;
    $("canvas3d").dataset.navTool = tool;
  }

  ActivatePane(which) {
    $("pane2d").classList.toggle("active", which === "2d");
    $("pane3d").classList.toggle("active", which === "3d");
  }

  ClearAllGestures() {
    const c2 = $("canvas2d"), c3 = $("canvas3d");
    this.drag2d = null;
    this.drag3d = null;
    for (const pid of this.touch2d.points.keys()) {
      if (c2.hasPointerCapture?.(pid)) c2.releasePointerCapture(pid);
    }
    for (const pid of this.touch3d.points.keys()) {
      if (c3.hasPointerCapture?.(pid)) c3.releasePointerCapture(pid);
    }
    this.touch2d.points.clear();
    this.touch2d.gesture = null;
    this.touch2d.consumed = false;
    this.touch3d.points.clear();
    this.touch3d.gesture = null;
    this.touch3d.consumed = false;
    delete c2.dataset.navigationAction;
    delete c3.dataset.navigationAction;
    $("compass3d").classList.remove("dragging");
  }

  BindUi() {
    this.SetNavTool("select");

    // 点击空白处收起顶部弹层
    document.addEventListener("pointerdown", (e) => {
      const sp = $("scenePicker");
      if (sp.open && !sp.contains(e.target)) sp.open = false;
      const lm = $("layersMenu");
      if (lm.open && !lm.contains(e.target)) lm.open = false;
    });

    for (const btn of document.querySelectorAll("[data-nav-tool]")) {
      btn.addEventListener("click", () => this.SetNavTool(btn.dataset.navTool));
    }

    for (const btn of document.querySelectorAll("[data-layout]")) {
      btn.addEventListener("click", () => {
        this.layout = btn.dataset.layout;
        $("workspace").dataset.layout = this.layout;
        for (const b of document.querySelectorAll("[data-layout]")) b.setAttribute("aria-pressed", String(b === btn));
        this.ResizeCanvases();
        this.RenderFrame();
      });
    }

    // 图层复选框与快捷原版对照按钮双向同步
    const syncBaselineButtons = () => {
      $("quickBaselineBtn").setAttribute("aria-pressed", String(this.layers.baseline));
      const chk = document.querySelector('input[data-layer="baseline"]');
      if (chk) chk.checked = this.layers.baseline;
    };
    for (const chk of document.querySelectorAll("input[data-layer]")) {
      chk.addEventListener("change", () => {
        const key = chk.dataset.layer;
        this.layers[key] = chk.checked;
        if (key === "legend") $("legend2d").hidden = !chk.checked;
        if (key === "baseline") syncBaselineButtons();
        this.RenderFrame();
      });
    }
    $("quickBaselineBtn").addEventListener("click", () => {
      this.layers.baseline = !this.layers.baseline;
      syncBaselineButtons();
      this.RenderFrame();
    });

    // 右侧面板折叠与拖拽调宽
    $("toggleInspectorBtn").addEventListener("click", () => {
      this.inspectorOpen = !this.inspectorOpen;
      $("workspace").dataset.inspector = this.inspectorOpen ? "open" : "collapsed";
      $("toggleInspectorBtn").setAttribute("aria-expanded", String(this.inspectorOpen));
      this.ResizeCanvases();
      this.RenderFrame();
    });
    this.BindInspectorResize();

    // Inspector 双页签
    for (const tab of document.querySelectorAll("[data-tab]")) {
      tab.addEventListener("click", () => {
        this.activeTab = tab.dataset.tab;
        for (const t of document.querySelectorAll("[data-tab]")) t.setAttribute("aria-selected", String(t === tab));
        $("tabPresets").hidden = this.activeTab !== "presets";
        $("tabParams").hidden = this.activeTab !== "params";
      });
    }

    // 3D 相机模式
    for (const btn of document.querySelectorAll("[data-cam]")) {
      btn.addEventListener("click", () => {
        this.SetCamMode(btn.dataset.cam);
        if (this.camMode === "overview") this.Fit3DOverview();
        this.RenderFrame();
      });
    }

    $("clearStimuliBtn").addEventListener("click", () => {
      this.stimuli = [];
      this.RebuildAll();
    });
    $("fit2dBtn").addEventListener("click", () => this.Fit2D());
    $("fit3dBtn").addEventListener("click", () => {
      this.SetCamMode("overview");
      this.Fit3DOverview();
      this.Render3D();
    });
    $("zoomIn2d").addEventListener("click", () => this.Zoom2DBy(1.22));
    $("zoomOut2d").addEventListener("click", () => this.Zoom2DBy(1 / 1.22));
    $("unpinActorBtn").addEventListener("click", () => {
      this.selectedActorId = null;
      this.RenderFrame();
    });

    // 小队管理
    $("addSquadBtn").addEventListener("click", () => {
      const base = this.ActiveSquad();
      const mid = base ? base.route[Math.floor(base.route.length / 2)] : [this.view2d.cx, this.view2d.cz];
      const idx = this.squads.length + 1;
      const side = idx % 2 === 0 ? "civilian" : "friend";
      const profile = side === "civilian" ? "civilian_convoy" : "road_march_relaxed";
      this.squads.push({
        id: `CrossSquad_${idx}`,
        label: `交叉队 ${idx}`,
        side,
        profile,
        seed: `Cross_${idx}_${Math.floor(Math.random() * 999)}`,
        startTimeS: 0,
        route: [[mid[0] - 18, mid[1] - 16], [mid[0] - 3, mid[1] - 3], [mid[0] + 5, mid[1] + 5], [mid[0] + 18, mid[1] + 16]],
        members: BuildDefaultMembers(side, 5, profile),
        overrides: {},
        speakerEvents: [],
      });
      this.activeSquadIdx = this.squads.length - 1;
      this.RebuildAll({ rebuild3dScene: true });
    });

    $("removeSquadBtn").addEventListener("click", () => {
      if (this.squads.length <= 1) return;
      this.squads.splice(this.activeSquadIdx, 1);
      this.activeSquadIdx = Math.max(0, this.activeSquadIdx - 1);
      this.RebuildAll({ rebuild3dScene: true });
    });

    $("resetProfileBtn").addEventListener("click", () => {
      const sq = this.ActiveSquad();
      if (!sq) return;
      sq.overrides = {};
      this.RebuildAll();
    });

    for (const btn of document.querySelectorAll("[data-side]")) {
      btn.addEventListener("click", () => {
        const sq = this.ActiveSquad();
        if (!sq || sq.side === btn.dataset.side) return;
        sq.side = btn.dataset.side;
        sq.members = BuildDefaultMembers(sq.side, sq.members.length, sq.profile);
        this.RebuildAll();
      });
    }

    $("countRange").addEventListener("input", (e) => {
      const sq = this.ActiveSquad();
      if (!sq) return;
      const n = Clamp(Number(e.target.value) || 2, 2, 24);
      SyncRangeFill(e.target);
      $("countVal").textContent = String(n);
      sq.members = ResizeMembers(sq.members, sq.side, n, sq.profile);
      this.RebuildAll();
    });

    $("seedInput").addEventListener("change", (e) => {
      const sq = this.ActiveSquad();
      if (!sq) return;
      sq.seed = e.target.value.trim() || "seed_1";
      this.RebuildAll();
    });

    $("rollSeedBtn").addEventListener("click", () => {
      const sq = this.ActiveSquad();
      if (!sq) return;
      sq.seed = `${sq.profile.slice(0, 6)}_${Math.floor(1000 + Math.random() * 9000)}`;
      this.RebuildAll();
    });

    // 播放时间轴
    $("playBtn").addEventListener("click", () => this.SetPlaying(!this.playing));
    $("restartBtn").addEventListener("click", () => { this.time = 0; this.SetPlaying(true); this.RenderFrame(); });
    $("stepBackBtn").addEventListener("click", () => { this.SetPlaying(false); this.time = Clamp(this.time - 0.2, 0, this.durationS); this.RenderFrame(); });
    $("stepFwdBtn").addEventListener("click", () => { this.SetPlaying(false); this.time = Clamp(this.time + 0.2, 0, this.durationS); this.RenderFrame(); });
    $("speedBtn").addEventListener("click", () => {
      this.playSpeedIdx = (this.playSpeedIdx + 1) % SPEED_STEPS.length;
      this.playSpeed = SPEED_STEPS[this.playSpeedIdx];
      $("speedBtn").textContent = `${this.playSpeed.toFixed(this.playSpeed % 1 ? 2 : 1).replace(/\.00$/, ".0")}×`;
    });
    $("loopBtn").addEventListener("click", () => {
      this.loop = !this.loop;
      $("loopBtn").setAttribute("aria-pressed", String(this.loop));
    });
    $("timeRange").addEventListener("input", (e) => {
      this.time = Clamp(Number(e.target.value) || 0, 0, this.durationS);
      SyncRangeFill(e.target);
      this.RenderFrame();
    });

    // JSON 复制与导出（图标短闪确认）
    const flashBtn = (btn) => {
      btn.dataset.flash = "ok";
      clearTimeout(btn._flashTimer);
      btn._flashTimer = setTimeout(() => { delete btn.dataset.flash; }, 1100);
    };
    $("copyJsonBtn").addEventListener("click", async () => {
      const text = JSON.stringify(this.ExportSpec(), null, 2);
      try {
        await navigator.clipboard.writeText(text);
        flashBtn($("copyJsonBtn"));
      } catch {
        this.ShowError("浏览器拦截剪贴板，请使用右侧导出按钮下载 JSON。");
      }
    });
    $("exportJsonBtn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(this.ExportSpec(), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `SquadSpline_${this.sceneId}_${this.scenarioId}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      flashBtn($("exportJsonBtn"));
    });

    // 快捷键与窗口失焦保护
    window.addEventListener("keydown", (e) => {
      if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.code === "Space") { e.preventDefault(); this.SetPlaying(!this.playing); }
      else if (e.key === "f" || e.key === "F") { this.Fit2D(); this.SetCamMode("overview"); this.Fit3DOverview(); this.RenderFrame(); }
      else if (e.key === "q" || e.key === "Q") this.SetNavTool("hand");
      else if (e.key === "w" || e.key === "W") this.SetNavTool("select");
      else if (e.key === "e" || e.key === "E") this.SetNavTool("ping");
      else if (e.key === "Escape") {
        $("scenePicker").open = false;
        $("layersMenu").open = false;
        this.ClearAllGestures();
        if (this.navTool === "ping") this.SetNavTool("select");
      }
    });
    window.addEventListener("blur", () => this.ClearAllGestures());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.ClearAllGestures(); });
    window.addEventListener("resize", () => { this.ResizeCanvases(); this.RenderFrame(); });

    this.Bind2DCanvas();
    this.Bind3DCanvas();
    this.BindCompass3D();
    this.ResizeCanvases();
  }

  BindInspectorResize() {
    const handle = $("inspectorResize");
    const ws = $("workspace");
    let drag = null;
    const setW = (px) => {
      const w = Clamp(Math.round(px), 272, 460);
      ws.style.setProperty("--sp-inspector-w", `${w}px`);
      this.ResizeCanvases();
      this.RenderFrame();
    };
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = $("inspector").getBoundingClientRect();
      drag = { pointerId: e.pointerId, x: e.clientX, w: rect.width };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      setW(drag.w + (drag.x - e.clientX));
    });
    const end = () => { drag = null; };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    handle.addEventListener("keydown", (e) => {
      const cur = $("inspector").getBoundingClientRect().width || 336;
      if (e.key === "ArrowLeft") { e.preventDefault(); setW(cur + 18); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setW(cur - 18); }
      else if (e.key === "Home") { e.preventDefault(); setW(336); }
    });
  }

  SetCamMode(mode) {
    this.camMode = mode;
    for (const b of document.querySelectorAll("[data-cam]")) {
      b.setAttribute("aria-pressed", String(b.dataset.cam === mode));
    }
  }

  SetPlaying(on) {
    this.playing = !!on;
    $("playBtn").setAttribute("aria-pressed", String(this.playing));
    $("playIcon").hidden = this.playing;
    $("pauseIcon").hidden = !this.playing;
  }

  ExportSpec() {
    return {
      schema: SQUAD_SPLINE_SCHEMA,
      sceneId: this.sceneId,
      scenarioId: this.scenarioId,
      durationS: this.durationS,
      squads: this.squads.map((sq) => ({
        id: sq.id,
        label: sq.label,
        side: sq.side,
        profile: sq.profile,
        seed: sq.seed,
        startTimeS: sq.startTimeS,
        route: sq.route,
        members: sq.members,
        resolvedTuning: ResolveSquadSplineTuning(sq.profile, sq.overrides),
      })),
    };
  }

  // ------------------------------------------------------------------ 2D 画布（多指捏合/平移 + 触控板 + 样条编辑）

  WorldToScreen2D(x, z) {
    const c = $("canvas2d");
    const w = c.clientWidth || 640, h = c.clientHeight || 480;
    return [(x - this.view2d.cx) * this.view2d.scale + w * 0.5, (z - this.view2d.cz) * this.view2d.scale + h * 0.5];
  }

  ScreenToWorld2D(sx, sy) {
    const c = $("canvas2d");
    const w = c.clientWidth || 640, h = c.clientHeight || 480;
    return [(sx - w * 0.5) / this.view2d.scale + this.view2d.cx, (sy - h * 0.5) / this.view2d.scale + this.view2d.cz];
  }

  Zoom2DAt(factor, sx, sy) {
    const before = this.ScreenToWorld2D(sx, sy);
    this.view2d.scale = Clamp(this.view2d.scale * factor, 2.2, 55);
    const after = this.ScreenToWorld2D(sx, sy);
    this.view2d.cx += before[0] - after[0];
    this.view2d.cz += before[1] - after[1];
    this.SyncZoomHud();
    this.Render2D();
  }

  Zoom2DBy(factor) {
    const c = $("canvas2d");
    this.Zoom2DAt(factor, (c.clientWidth || 640) * 0.5, (c.clientHeight || 480) * 0.5);
  }

  Fit2D() {
    const pts = this.squads.flatMap((sq) => sq.route);
    if (!pts.length) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const c = $("canvas2d");
    const w = c.clientWidth || 640, h = c.clientHeight || 480;
    const spanX = Math.max(18, maxX - minX + 18);
    const spanZ = Math.max(18, maxZ - minZ + 18);
    this.view2d.cx = (minX + maxX) * 0.5;
    this.view2d.cz = (minZ + maxZ) * 0.5;
    this.view2d.scale = Clamp(Math.min(w / spanX, h / spanZ) * 0.88, 2.5, 42);
    this.view2d.baseScale = this.view2d.scale;
    this.SyncZoomHud();
    this.Render2D();
  }

  InsertRoutePointAt(wx, wz) {
    const sq = this.ActiveSquad();
    if (!sq) return;
    let bestIdx = sq.route.length, bestDist = Infinity;
    for (let i = 1; i < sq.route.length; i += 1) {
      const a = sq.route[i - 1], b = sq.route[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = Clamp(((wx - a[0]) * dx + (wz - a[1]) * dz) / l2, 0, 1);
      const d = Math.hypot(wx - (a[0] + dx * t), wz - (a[1] + dz * t));
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    sq.route.splice(bestIdx, 0, [Number(wx.toFixed(2)), Number(wz.toFixed(2))]);
    this.RebuildAll({ rebuild3dScene: true });
  }

  DropStimulusAt(wx, wz) {
    const id = `stim_${Date.now()}_${this.stimuli.length}`;
    this.stimuli.push({
      id,
      x: wx,
      z: wz,
      y: this.env ? this.env.heightAt(wx, wz) + 1.0 : 1.0,
      time: this.time,
      durationS: 3.0,
      radiusM: 50,
      label: "声响刺激",
    });
    this.RebuildAll();
  }

  Bind2DCanvas() {
    const canvas = $("canvas2d");
    const Pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top, r.width, r.height];
    };
    const HitControlPoint = (sx, sy, radius = 11) => {
      for (let sIdx = 0; sIdx < this.squads.length; sIdx += 1) {
        const route = this.squads[sIdx].route;
        for (let pIdx = 0; pIdx < route.length; pIdx += 1) {
          const [px, py] = this.WorldToScreen2D(route[pIdx][0], route[pIdx][1]);
          if (Math.hypot(sx - px, sy - py) <= radius) return { sIdx, pIdx };
        }
      }
      return null;
    };
    const HitActor = (sx, sy, radius = 12) => {
      if (!this.compiled) return null;
      const frame = this.compiled.Sample(this.time);
      for (const a of frame.actors) {
        const [px, py] = this.WorldToScreen2D(a.x, a.z);
        if (Math.hypot(sx - px, sy - py) <= radius) return a;
      }
      return null;
    };

    const MeasureTouch2D = (ids) => {
      const [a, b] = ids.map((id) => this.touch2d.points.get(id));
      const rect = canvas.getBoundingClientRect();
      return {
        x: (a.x + b.x) * 0.5 - rect.left,
        y: (a.y + b.y) * 0.5 - rect.top,
        width: rect.width,
        height: rect.height,
        distance: Math.max(8, Math.hypot(b.x - a.x, b.y - a.y)),
      };
    };

    const StartTouch2D = (ids) => {
      this.drag2d = null;
      const m = MeasureTouch2D(ids);
      this.touch2d.gesture = {
        ids,
        measure: m,
        scale: this.view2d.scale,
        anchor: this.ScreenToWorld2D(m.x, m.y),
        width: m.width,
        height: m.height,
      };
      this.touch2d.consumed = true;
      canvas.dataset.navigationAction = "touch";
    };

    canvas.addEventListener("pointerdown", (e) => {
      this.ActivatePane("2d");
      const [sx, sy] = Pos(e);

      // ---- 触控多指分支（与 Encounter Designer 同契约）----
      if (e.pointerType === "touch") {
        e.preventDefault();
        this.touch2d.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvas.setPointerCapture(e.pointerId);
        if (this.touch2d.gesture) return;
        const ids = [...this.touch2d.points.keys()].slice(0, 2);
        if (ids.length === 2) {
          StartTouch2D(ids);
          return;
        }
        if (this.touch2d.consumed) return;
        if (this.navTool === "ping") {
          const [wx, wz] = this.ScreenToWorld2D(sx, sy);
          this.DropStimulusAt(wx, wz);
          this.touch2d.consumed = true;
          return;
        }
        if (this.navTool === "hand") {
          this.drag2d = { kind: "pan", pointerId: e.pointerId, sx, sy, cx: this.view2d.cx, cz: this.view2d.cz, moved: false };
          canvas.dataset.navigationAction = "planPan";
          return;
        }
        const cp = HitControlPoint(sx, sy, 18);
        if (cp) {
          this.activeSquadIdx = cp.sIdx;
          this.SyncInspector();
          this.drag2d = { kind: "point", pointerId: e.pointerId, sIdx: cp.sIdx, pIdx: cp.pIdx, moved: false };
          canvas.dataset.navigationAction = "point";
          return;
        }
        this.drag2d = { kind: "touchPanOrTap", pointerId: e.pointerId, sx, sy, cx: this.view2d.cx, cz: this.view2d.cz, moved: false };
        return;
      }

      // ---- 鼠标分支 ----
      if (e.button === 2) {
        // 右键：点在控制点上留给 contextmenu 删除，否则直接拖拽平移
        const cp = HitControlPoint(sx, sy, 11);
        if (!cp) {
          e.preventDefault();
          this.drag2d = { kind: "pan", pointerId: e.pointerId, sx, sy, cx: this.view2d.cx, cz: this.view2d.cz, moved: false };
          canvas.dataset.navigationAction = "planPan";
          canvas.setPointerCapture(e.pointerId);
        }
        return;
      }
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        e.preventDefault();
        this.drag2d = { kind: "pan", pointerId: e.pointerId, sx, sy, cx: this.view2d.cx, cz: this.view2d.cz, moved: false };
        canvas.dataset.navigationAction = "planPan";
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 0) return;

      if (this.navTool === "ping" || e.shiftKey) {
        const [wx, wz] = this.ScreenToWorld2D(sx, sy);
        this.DropStimulusAt(wx, wz);
        if (this.navTool === "ping" && !e.shiftKey) this.SetNavTool("select");
        return;
      }
      if (this.navTool === "hand") {
        this.drag2d = { kind: "pan", pointerId: e.pointerId, sx, sy, cx: this.view2d.cx, cz: this.view2d.cz, moved: false };
        canvas.dataset.navigationAction = "planPan";
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      const cp = HitControlPoint(sx, sy, 11);
      if (cp) {
        this.activeSquadIdx = cp.sIdx;
        this.SyncInspector();
        this.drag2d = { kind: "point", pointerId: e.pointerId, sIdx: cp.sIdx, pIdx: cp.pIdx, moved: false };
        canvas.dataset.navigationAction = "point";
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      const actor = HitActor(sx, sy, 12);
      if (actor) {
        this.selectedActorId = actor.id;
        const sqIdx = this.squads.findIndex((s) => s.id === actor.squadId);
        if (sqIdx >= 0) { this.activeSquadIdx = sqIdx; this.SyncInspector(); }
        this.RenderFrame();
        return;
      }
      this.drag2d = { kind: "pan", pointerId: e.pointerId, sx, sy, cx: this.view2d.cx, cz: this.view2d.cz, moved: false };
      canvas.dataset.navigationAction = "planPan";
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" && this.touch2d.points.has(e.pointerId)) {
        const pt = this.touch2d.points.get(e.pointerId);
        pt.x = e.clientX; pt.y = e.clientY;
        if (this.touch2d.consumed) {
          e.preventDefault();
          const g = this.touch2d.gesture;
          if (!g || !g.ids.includes(e.pointerId)) return;
          const m = MeasureTouch2D(g.ids);
          if (m.width !== g.width || m.height !== g.height) { this.ClearAllGestures(); return; }
          const ratio = m.distance / g.measure.distance;
          this.view2d.scale = Clamp(g.scale * ratio, 2.2, 55);
          this.view2d.cx = g.anchor[0] - (m.x - m.width * 0.5) / this.view2d.scale;
          this.view2d.cz = g.anchor[1] - (m.y - m.height * 0.5) / this.view2d.scale;
          this.SyncZoomHud();
          this.Render2D();
          return;
        }
      }

      if (!this.drag2d || this.drag2d.pointerId !== e.pointerId) return;
      const [sx, sy] = Pos(e);
      if (Math.hypot(sx - this.drag2d.sx, sy - this.drag2d.sy) > 4) this.drag2d.moved = true;
      if (this.drag2d.kind === "pan" || (this.drag2d.kind === "touchPanOrTap" && this.drag2d.moved)) {
        canvas.dataset.navigationAction = "planPan";
        this.view2d.cx = this.drag2d.cx - (sx - this.drag2d.sx) / this.view2d.scale;
        this.view2d.cz = this.drag2d.cz - (sy - this.drag2d.sy) / this.view2d.scale;
        this.Render2D();
      } else if (this.drag2d.kind === "point") {
        const [wx, wz] = this.ScreenToWorld2D(sx, sy);
        this.squads[this.drag2d.sIdx].route[this.drag2d.pIdx] = [Number(wx.toFixed(2)), Number(wz.toFixed(2))];
        this.RebuildAll();
      }
    });

    const Finish2D = (e, cancelled = false) => {
      if (e.pointerType === "touch" && this.touch2d.points.has(e.pointerId)) {
        const wasConsumed = this.touch2d.consumed;
        this.touch2d.points.delete(e.pointerId);
        if (this.touch2d.gesture?.ids.includes(e.pointerId)) {
          this.touch2d.gesture = null;
          delete canvas.dataset.navigationAction;
          const remaining = [...this.touch2d.points.keys()].slice(0, 2);
          if (!cancelled && remaining.length === 2) StartTouch2D(remaining);
        }
        if (!this.touch2d.points.size) {
          this.touch2d.consumed = false;
          this.touch2d.gesture = null;
        }
        if (wasConsumed) {
          this.drag2d = null;
          return;
        }
      }
      if (!this.drag2d || this.drag2d.pointerId !== e.pointerId) return;
      const done = this.drag2d;
      this.drag2d = null;
      delete canvas.dataset.navigationAction;
      if (cancelled) return;

      if (done.kind === "point") {
        this.Rebuild3DEnvironment(false);
      } else if (done.kind === "touchPanOrTap" && !done.moved) {
        const [sx, sy] = Pos(e);
        const actor = HitActor(sx, sy, 18);
        if (actor) {
          this.selectedActorId = actor.id;
          const sqIdx = this.squads.findIndex((s) => s.id === actor.squadId);
          if (sqIdx >= 0) { this.activeSquadIdx = sqIdx; this.SyncInspector(); }
          this.RenderFrame();
        } else {
          const now = performance.now();
          const lt = this.touch2d.lastTap;
          if (now - lt.time < 320 && Math.hypot(sx - lt.x, sy - lt.y) < 28) {
            const [wx, wz] = this.ScreenToWorld2D(sx, sy);
            this.InsertRoutePointAt(wx, wz);
            this.touch2d.lastTap = { time: 0, x: 0, y: 0 };
          } else {
            this.touch2d.lastTap = { time: now, x: sx, y: sy };
          }
        }
      }
    };

    canvas.addEventListener("pointerup", (e) => Finish2D(e, false));
    canvas.addEventListener("pointercancel", (e) => Finish2D(e, true));
    canvas.addEventListener("lostpointercapture", (e) => {
      if (this.touch2d.points.has(e.pointerId)) this.ClearAllGestures();
    });

    canvas.addEventListener("dblclick", (e) => {
      if (this.navTool !== "select") return;
      const [sx, sy] = Pos(e);
      const [wx, wz] = this.ScreenToWorld2D(sx, sy);
      this.InsertRoutePointAt(wx, wz);
    });

    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const [sx, sy] = Pos(e);
      const cp = HitControlPoint(sx, sy, 11);
      if (cp && this.squads[cp.sIdx].route.length > 2) {
        this.squads[cp.sIdx].route.splice(cp.pIdx, 1);
        this.RebuildAll({ rebuild3dScene: true });
      }
    });

    // 滚轮 + 触控板双指捏合 / 双向平滑平移
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.ActivatePane("2d");
      const [sx, sy] = Pos(e);
      if (e.ctrlKey) {
        // 触控板捏合（Chrome/Edge/macOS 统一带 ctrlKey）
        const factor = Math.exp(-Clamp(e.deltaY, -120, 120) * 0.009);
        this.Zoom2DAt(factor, sx, sy);
        return;
      }
      if (Math.abs(e.deltaX) > 0.5 || e.shiftKey) {
        // 触控板横斜向双指拖移或 Shift+滚轮平移
        const dx = e.shiftKey && Math.abs(e.deltaX) < 0.5 ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && Math.abs(e.deltaX) < 0.5 ? 0 : e.deltaY;
        this.view2d.cx += dx / this.view2d.scale;
        this.view2d.cz += dy / this.view2d.scale;
        this.Render2D();
        return;
      }
      const factor = Math.exp(-Clamp(e.deltaY, -240, 240) * 0.0014);
      this.Zoom2DAt(factor, sx, sy);
    }, { passive: false });
  }

  Render2D() {
    if (this.layout === "3d") return;
    const canvas = $("canvas2d");
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 640, h = canvas.clientHeight || 480;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 战术地图底色（温润田野羊皮纸调，与 Encounter Designer 一致）
    ctx.fillStyle = "#cdd1b6";
    ctx.fillRect(0, 0, w, h);

    const scale = this.view2d.scale;
    const ToS = (x, z) => [(x - this.view2d.cx) * scale + w * 0.5, (z - this.view2d.cz) * scale + h * 0.5];
    const minWX = this.view2d.cx - (w * 0.55) / scale;
    const maxWX = this.view2d.cx + (w * 0.55) / scale;
    const minWZ = this.view2d.cz - (h * 0.55) / scale;
    const maxWZ = this.view2d.cz + (h * 0.55) / scale;

    // 淡地形方格网
    const gridStep = scale > 10 ? 5 : 10;
    ctx.strokeStyle = "rgba(68, 73, 56, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = Math.floor(minWX / gridStep) * gridStep; gx <= maxWX; gx += gridStep) {
      const [sx] = ToS(gx, 0);
      ctx.moveTo(sx, 0); ctx.lineTo(sx, h);
    }
    for (let gz = Math.floor(minWZ / gridStep) * gridStep; gz <= maxWZ; gz += gridStep) {
      const [, sy] = ToS(0, gz);
      ctx.moveTo(0, sy); ctx.lineTo(w, sy);
    }
    ctx.stroke();

    // 真实场景底图（道路/战壕/掩体/建筑/空气墙/地标）
    if (this.env) {
      const DrawRibbon = (pts, widthM, color) => {
        if (pts.length < 2) return;
        ctx.save();
        ctx.beginPath();
        pts.forEach(([x, z], i) => {
          const [sx, sy] = ToS(x, z);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        });
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, widthM * scale);
        ctx.stroke();
        ctx.restore();
      };

      for (const rd of this.env.roads) DrawRibbon(rd.points, rd.width, "#e2d6b6");
      for (const tr of this.env.trenches) DrawRibbon(tr.points, tr.width + 2.1, "#a79c7b");
      for (const tr of this.env.trenches) DrawRibbon(tr.points, tr.width, "#efe3c2");

      for (const box of this.env.obstacles) {
        if (box.x + box.radius < minWX || box.x - box.radius > maxWX || box.z + box.radius < minWZ || box.z - box.radius > maxWZ) continue;
        const [sx, sy] = ToS(box.x, box.z);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(-box.ry);
        const bw = box.hx * 2 * scale, bd = box.hz * 2 * scale;
        if (box.isCover) {
          ctx.fillStyle = "#85ac83";
          ctx.strokeStyle = "#244633";
          ctx.lineWidth = 1.4;
          ctx.fillRect(-bw * 0.5, -bd * 0.5, bw, bd);
          ctx.strokeRect(-bw * 0.5, -bd * 0.5, bw, bd);
          ctx.rotate(box.ry);
          ctx.beginPath();
          ctx.moveTo(-3.6, -3.6); ctx.lineTo(3.6, -3.6); ctx.lineTo(3.6, 0);
          ctx.quadraticCurveTo(3.6, 3.2, 0, 5); ctx.quadraticCurveTo(-3.6, 3.2, -3.6, 0); ctx.closePath();
          ctx.fillStyle = "#244633"; ctx.fill();
          ctx.strokeStyle = "#fff4cf"; ctx.lineWidth = 1; ctx.stroke();
        } else {
          ctx.fillStyle = "#beb7a3";
          ctx.strokeStyle = "#6e6858";
          ctx.lineWidth = 1;
          ctx.fillRect(-bw * 0.5, -bd * 0.5, bw, bd);
          ctx.strokeRect(-bw * 0.5, -bd * 0.5, bw, bd);
        }
        ctx.restore();
      }

      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "rgba(196, 36, 43, 0.48)";
      ctx.lineWidth = 1.4;
      for (const aw of this.env.airWalls) {
        ctx.beginPath();
        aw.points.forEach(([x, z], i) => {
          const [sx, sy] = ToS(x, z);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
      ctx.restore();

      ctx.font = "10.5px 'Microsoft YaHei UI', sans-serif";
      ctx.fillStyle = "rgba(62, 58, 44, 0.58)";
      for (const mk of this.env.landmarks) {
        if (mk.x < minWX || mk.x > maxWX || mk.z < minWZ || mk.z > maxWZ) continue;
        const [sx, sy] = ToS(mk.x, mk.z);
        ctx.fillText(mk.name, sx + 5, sy + 3);
      }
    }

    if (!this.compiled) return;
    const frame = this.compiled.Sample(this.time);

    // 1) PCG 走廊净宽 + 中心样条 + POI + 控制点
    this.compiled.squads.forEach((sq, sIdx) => {
      const isSelected = sIdx === this.activeSquadIdx;
      const sideCol = SIDE_COLORS[sq.side] || SIDE_COLORS.friend;
      const cor = sq.corridor;

      if (this.layers.corridor && cor.stations.length >= 2) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < cor.stations.length; i += 1) {
          const st = cor.stations[i];
          const [sx, sy] = ToS(st.x + st.rx * st.dMin, st.z + st.rz * st.dMin);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        for (let i = cor.stations.length - 1; i >= 0; i -= 1) {
          const st = cor.stations[i];
          const [sx, sy] = ToS(st.x + st.rx * st.dMax, st.z + st.rz * st.dMax);
          ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fillStyle = isSelected ? "rgba(237, 202, 131, 0.24)" : "rgba(110, 136, 122, 0.14)";
        ctx.fill();
        ctx.strokeStyle = isSelected ? "rgba(168, 120, 30, 0.72)" : "rgba(90, 96, 80, 0.38)";
        ctx.lineWidth = isSelected ? 1.4 : 1;
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      cor.stations.forEach((st, i) => {
        const [sx, sy] = ToS(st.x, st.z);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.strokeStyle = isSelected ? "#9c6d17" : sideCol.fill;
      ctx.lineWidth = isSelected ? 1.8 : 1.2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();

      if (this.layers.pois) {
        for (const poi of cor.pois) {
          const [sx, sy] = ToS(poi.x, poi.z);
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = poi.kind === "blindCorner" ? "#e59a1a" : poi.kind === "trenchRim" ? "#5a9a6e" : "#8098b8";
          ctx.strokeStyle = "#222018";
          ctx.lineWidth = 1;
          ctx.fillRect(-3, -3, 6, 6);
          ctx.strokeRect(-3, -3, 6, 6);
          ctx.restore();
        }
      }

      if (this.layers.baseline) {
        ctx.save();
        ctx.beginPath();
        sq.route.forEach(([x, z], i) => {
          const [sx, sy] = ToS(x, z);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        });
        ctx.strokeStyle = "rgba(45, 45, 40, 0.30)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.restore();
      }

      sq.route.forEach(([x, z], pIdx) => {
        const [sx, sy] = ToS(x, z);
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy, isSelected ? 6 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "#edca83" : "#dad4bf";
        ctx.strokeStyle = "#191b16";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        if (isSelected) {
          ctx.fillStyle = "#191b16";
          ctx.font = "bold 9px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(pIdx + 1), sx, sy + 0.5);
        }
        ctx.restore();
      });
    });

    // 2) 个体有机流线
    if (this.layers.streamlines) {
      for (const line of this.compiled.streamlines) {
        const col = (SIDE_COLORS[line.side] || SIDE_COLORS.friend).fill;
        ctx.save();
        ctx.beginPath();
        line.points.forEach(([x, z], i) => {
          const [sx, sy] = ToS(x, z);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        });
        ctx.strokeStyle = col;
        ctx.globalAlpha = line.role === "leader" ? 0.50 : 0.24;
        ctx.lineWidth = line.role === "leader" ? 1.7 : 1.0;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3) 社交微簇连线
    if (this.layers.clusters) {
      const byCluster = new Map();
      for (const a of frame.actors) {
        const key = `${a.squadId}:${a.clusterId}`;
        if (!byCluster.has(key)) byCluster.set(key, []);
        byCluster.get(key).push(a);
      }
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(42, 54, 46, 0.42)";
      ctx.lineWidth = 1.15;
      for (const group of byCluster.values()) {
        if (group.length < 2) continue;
        ctx.beginPath();
        group.forEach((a, i) => {
          const [sx, sy] = ToS(a.x, a.z);
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4) 声响刺激脉冲圈
    for (const st of this.stimuli) {
      const age = this.time - st.time;
      if (age < 0 || age > st.durationS) continue;
      const [sx, sy] = ToS(st.x, st.z);
      const r = (1.5 + age * 8.5) * scale;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, Math.min(r, 180), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 78, 60, ${Clamp(1 - age / st.durationS, 0, 1)})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ff5b4a";
      ctx.fill();
      ctx.restore();
    }

    // 5) 原版折线机器人鬼影
    if (this.layers.baseline) {
      for (const a of frame.actors) {
        const [gx, gy] = ToS(a.baseX, a.baseZ);
        ctx.save();
        ctx.beginPath();
        ctx.arc(gx, gy, 5.0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(38, 40, 36, 0.18)";
        ctx.fill();
        ctx.setLineDash([2.4, 2]);
        ctx.strokeStyle = "rgba(35, 35, 32, 0.68)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
    }

    // 6) PCG 人物与视线扇面（标签按优先级做防重叠避让，拒绝重叠成条）
    const labelCandidates = [];
    for (const a of frame.actors) {
      const [sx, sy] = ToS(a.x, a.z);
      const col = SIDE_COLORS[a.side] || SIDE_COLORS.friend;
      const gazeCol = GAZE_COLORS[a.gazeKind] || GAZE_COLORS.route;
      const isPicked = a.id === this.selectedActorId;

      if (this.layers.gaze) {
        const lookYaw = a.yaw + a.gazeYaw;
        const fx = -Math.sin(lookYaw), fz = -Math.cos(lookYaw);
        const angScreen = Math.atan2(fz, fx);
        const coneLen = a.gazeKind === "route" ? 16 : 28;
        const coneHalf = a.gazeKind === "route" ? 0.19 : 0.29;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.arc(sx, sy, coneLen, angScreen - coneHalf, angScreen + coneHalf);
        ctx.closePath();
        ctx.fillStyle = gazeCol.fill;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + fx * coneLen, sy + fz * coneLen);
        ctx.strokeStyle = gazeCol.stroke;
        ctx.lineWidth = a.gazeKind === "route" ? 1.0 : 1.75;
        ctx.stroke();
        if (a.gazeTarget && a.gazeKind !== "route") {
          const [tx, ty] = ToS(a.gazeTarget[0], a.gazeTarget[1]);
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.strokeStyle = gazeCol.stroke;
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = 1.0;
          ctx.stroke();
        }
        ctx.restore();
      }

      const bfx = -Math.sin(a.yaw), bfz = -Math.cos(a.yaw);
      const radius = a.role === "leader" ? 7.0 : (a.role === "mgGunner" ? 6.4 : 5.6);
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fillStyle = col.fill;
      ctx.fill();
      ctx.lineWidth = isPicked ? 2.6 : (a.role === "leader" ? 2.1 : 1.35);
      ctx.strokeStyle = isPicked ? "#ffe2a8" : (a.role === "leader" ? "#f4d27d" : "#161814");
      ctx.stroke();

      if (["pause", "rest", "stalkPause", "brake"].includes(a.phase)) {
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 3.0, 0, Math.PI * 2);
        ctx.strokeStyle = a.phase === "stalkPause" ? "#f2c864" : "#f5f4eb";
        ctx.lineWidth = 1.3;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(sx + bfx * (radius - 1), sy + bfz * (radius - 1));
      ctx.lineTo(sx + bfx * (radius + 4.2), sy + bfz * (radius + 4.2));
      ctx.strokeStyle = "#161814";
      ctx.lineWidth = 1.9;
      ctx.stroke();
      ctx.restore();

      const prio = isPicked ? 3 : a.role === "leader" ? 2 : a.role === "mgGunner" ? 1 : (scale >= 14 ? 0 : -1);
      if (prio >= 0) labelCandidates.push({ a, sx, sy, prio, isPicked });
    }

    // 屏幕空间防重叠绘制姓名标签
    labelCandidates.sort((u, v) => v.prio - u.prio);
    const placed = [];
    for (const item of labelCandidates) {
      const { a, sx, sy, isPicked } = item;
      ctx.font = `${a.role === "leader" || isPicked ? "600 " : ""}10.5px 'Microsoft YaHei UI', sans-serif`;
      const tw = ctx.measureText(a.name).width + 8;
      const th = 15;
      const lx = sx + 9, ly = sy - 16;
      const overlaps = placed.some((b) => !(lx + tw + 2 < b.x || lx > b.x + b.w + 2 || ly + th + 2 < b.y || ly > b.y + b.h + 2));
      if (overlaps && !isPicked) continue;
      placed.push({ x: lx, y: ly, w: tw, h: th });
      ctx.save();
      ctx.fillStyle = isPicked ? "rgba(26, 24, 16, 0.92)" : "rgba(248, 245, 234, 0.88)";
      ctx.strokeStyle = isPicked ? "#edca83" : "rgba(50, 48, 38, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(lx, ly, tw, th, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = isPicked ? "#ffe3ab" : (a.side === "enemy" ? "#8b271a" : a.side === "civilian" ? "#4e3c6b" : "#174b5c");
      ctx.fillText(a.name, lx + 4, ly + 11);
      ctx.restore();
    }

    this.SyncActorDial(frame);
  }

  // ------------------------------------------------------------------ 3D Three.js 实时关节视口 + 多指手势

  Init3D() {
    const canvas = $("canvas3d");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    ApplyEditorLiteCameraProfile(renderer);
    renderer.setClearColor(0xb2c0c4, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xb2c0c4, 65, 235);
    const camera = new THREE.PerspectiveCamera(46, 1.33, 0.2, 600);

    CreateGameEnvironmentLighting(renderer, scene, { skyMode: "none", shadow: false, sunDistance: 100 });

    const envGroup = new THREE.Group();
    const splineGroup = new THREE.Group();
    const actorsGroup = new THREE.Group();
    scene.add(envGroup, splineGroup, actorsGroup);

    const selectRing = new THREE.Mesh(
      new THREE.RingGeometry(0.46, 0.58, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf4d27d, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
    );
    selectRing.visible = false;
    scene.add(selectRing);
    this.selectRing3d = selectRing;

    this.three = { renderer, scene, camera, envGroup, splineGroup, actorsGroup };
  }

  Pick3DActor(clientX, clientY) {
    if (!this.three || !this.puppets3d.size) return null;
    const canvas = $("canvas3d");
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.three.camera);
    const hits = this.raycaster.intersectObjects(this.three.actorsGroup.children, true);
    for (const h of hits) {
      let obj = h.object;
      while (obj && !obj.userData?.actorId) obj = obj.parent;
      if (obj?.userData?.actorId) return obj.userData.actorId;
    }
    return null;
  }

  GroundPan3D(dx, dy, baseTarget, yaw, dist) {
    const panScale = dist * 0.0018;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    return baseTarget.clone().addScaledVector(right, -dx * panScale).addScaledVector(fwd, dy * panScale);
  }

  Bind3DCanvas() {
    const canvas = $("canvas3d");

    const MeasureTouch3D = (ids) => {
      const [a, b] = ids.map((id) => this.touch3d.points.get(id));
      const rect = canvas.getBoundingClientRect();
      return {
        x: (a.x + b.x) * 0.5 - rect.left,
        y: (a.y + b.y) * 0.5 - rect.top,
        width: rect.width,
        height: rect.height,
        distance: Math.max(8, Math.hypot(b.x - a.x, b.y - a.y)),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    };

    const StartTouch3D = (ids) => {
      this.drag3d = null;
      if (this.camMode !== "overview") this.SetCamMode("overview");
      const m = MeasureTouch3D(ids);
      this.touch3d.gesture = {
        ids,
        measure: m,
        angle: m.angle,
        rotation: 0,
        yaw: this.cam3d.yaw,
        pitch: this.cam3d.pitch,
        dist: this.cam3d.dist,
        target: this.cam3d.target.clone(),
      };
      this.touch3d.consumed = true;
      canvas.dataset.navigationAction = "touch";
    };

    canvas.addEventListener("pointerdown", (e) => {
      this.ActivatePane("3d");

      // ---- 3D 多指触控（双指捏合拉远近 + 双指地面平移 + 双指拧转偏航）----
      if (e.pointerType === "touch") {
        e.preventDefault();
        this.touch3d.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvas.setPointerCapture(e.pointerId);
        if (this.touch3d.gesture) return;
        const ids = [...this.touch3d.points.keys()].slice(0, 2);
        if (ids.length === 2) {
          StartTouch3D(ids);
          return;
        }
        if (this.touch3d.consumed) return;
        const action = this.navTool === "hand" ? "pan" : "orbit";
        this.drag3d = {
          action,
          pointerId: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          yaw: this.cam3d.yaw,
          pitch: this.cam3d.pitch,
          dist: this.cam3d.dist,
          target: this.cam3d.target.clone(),
          moved: false,
        };
        canvas.dataset.navigationAction = action;
        return;
      }

      // ---- 3D 鼠标 ----
      e.preventDefault();
      let action = "orbit";
      if (e.altKey && e.button === 2) action = "dolly";
      else if (e.altKey && e.button === 0) action = "orbit";
      else if (e.button === 1 || e.button === 2 || (e.button === 0 && this.navTool === "hand")) action = "pan";
      else if (e.button !== 0) return;

      this.drag3d = {
        action,
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        yaw: this.cam3d.yaw,
        pitch: this.cam3d.pitch,
        dist: this.cam3d.dist,
        target: this.cam3d.target.clone(),
        moved: false,
      };
      canvas.dataset.navigationAction = action;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" && this.touch3d.points.has(e.pointerId)) {
        const pt = this.touch3d.points.get(e.pointerId);
        pt.x = e.clientX; pt.y = e.clientY;
        if (this.touch3d.consumed) {
          e.preventDefault();
          const g = this.touch3d.gesture;
          if (!g || !g.ids.includes(e.pointerId)) return;
          const m = MeasureTouch3D(g.ids);
          if (m.width !== g.measure.width || m.height !== g.measure.height) { this.ClearAllGestures(); return; }
          const ratio = m.distance / g.measure.distance;
          g.rotation += Math.atan2(Math.sin(m.angle - g.angle), Math.cos(m.angle - g.angle));
          g.angle = m.angle;
          this.cam3d.yaw = g.yaw - g.rotation;
          this.cam3d.pitch = g.pitch;
          this.cam3d.dist = Clamp(g.dist / ratio, 3.8, 160);
          const dx = m.x - g.measure.x;
          const dy = m.y - g.measure.y;
          this.cam3d.target.copy(this.GroundPan3D(dx, dy, g.target, this.cam3d.yaw, this.cam3d.dist));
          this.Render3D();
          return;
        }
      }

      if (!this.drag3d || this.drag3d.pointerId !== e.pointerId) return;
      const dx = e.clientX - this.drag3d.x;
      const dy = e.clientY - this.drag3d.y;
      if (Math.hypot(dx, dy) > 4) this.drag3d.moved = true;

      if (this.drag3d.action === "orbit") {
        this.cam3d.yaw = this.drag3d.yaw - dx * 0.0062;
        this.cam3d.pitch = Clamp(this.drag3d.pitch + dy * 0.0062, 0.14, 1.46);
      } else if (this.drag3d.action === "pan") {
        if (this.camMode !== "overview") this.SetCamMode("overview");
        this.cam3d.target.copy(this.GroundPan3D(dx, dy, this.drag3d.target, this.cam3d.yaw, this.cam3d.dist));
      } else if (this.drag3d.action === "dolly") {
        this.cam3d.dist = Clamp(this.drag3d.dist * Math.exp((dx + dy) * 0.006), 3.8, 160);
      }
      this.Render3D();
    });

    const Finish3D = (e, cancelled = false) => {
      if (e.pointerType === "touch" && this.touch3d.points.has(e.pointerId)) {
        const wasConsumed = this.touch3d.consumed;
        this.touch3d.points.delete(e.pointerId);
        if (this.touch3d.gesture?.ids.includes(e.pointerId)) {
          this.touch3d.gesture = null;
          delete canvas.dataset.navigationAction;
          const remaining = [...this.touch3d.points.keys()].slice(0, 2);
          if (!cancelled && remaining.length === 2) StartTouch3D(remaining);
        }
        if (!this.touch3d.points.size) {
          this.touch3d.consumed = false;
          this.touch3d.gesture = null;
        }
        if (wasConsumed) {
          this.drag3d = null;
          return;
        }
      }
      if (!this.drag3d || this.drag3d.pointerId !== e.pointerId) return;
      const done = this.drag3d;
      this.drag3d = null;
      delete canvas.dataset.navigationAction;
      if (!cancelled && !done.moved && done.action === "orbit") {
        const pickedId = this.Pick3DActor(e.clientX, e.clientY);
        if (pickedId) {
          this.selectedActorId = pickedId;
          const frame = this.compiled?.Sample(this.time);
          const actor = frame?.actors.find((a) => a.id === pickedId);
          if (actor) {
            const sqIdx = this.squads.findIndex((s) => s.id === actor.squadId);
            if (sqIdx >= 0) { this.activeSquadIdx = sqIdx; this.SyncInspector(); }
          }
          this.RenderFrame();
        }
      }
    };

    canvas.addEventListener("pointerup", (e) => Finish3D(e, false));
    canvas.addEventListener("pointercancel", (e) => Finish3D(e, true));
    canvas.addEventListener("lostpointercapture", (e) => {
      if (this.touch3d.points.has(e.pointerId)) this.ClearAllGestures();
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.ActivatePane("3d");
      if (e.ctrlKey) {
        this.cam3d.dist = Clamp(this.cam3d.dist * Math.exp(Clamp(e.deltaY, -120, 120) * 0.008), 3.8, 160);
        this.Render3D();
        return;
      }
      if (Math.abs(e.deltaX) > 0.5 || e.shiftKey) {
        if (this.camMode !== "overview") this.SetCamMode("overview");
        const dx = e.shiftKey && Math.abs(e.deltaX) < 0.5 ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && Math.abs(e.deltaX) < 0.5 ? 0 : e.deltaY;
        this.cam3d.target.copy(this.GroundPan3D(-dx * 0.75, -dy * 0.75, this.cam3d.target, this.cam3d.yaw, this.cam3d.dist));
        this.Render3D();
        return;
      }
      this.cam3d.dist = Clamp(this.cam3d.dist * Math.exp(Clamp(e.deltaY, -240, 240) * 0.0012), 3.8, 160);
      this.Render3D();
    }, { passive: false });
  }

  BindCompass3D() {
    const el = $("compass3d");
    let drag = null;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType !== "touch") return;
      e.preventDefault();
      e.stopPropagation();
      drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, yaw: this.cam3d.yaw, pitch: this.cam3d.pitch, moved: false };
      el.classList.add("dragging");
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      this.cam3d.yaw = drag.yaw - dx * 0.012;
      this.cam3d.pitch = Clamp(drag.pitch + dy * 0.008, 0.14, 1.46);
      this.Render3D();
    });
    const finish = (accept) => {
      const done = drag;
      drag = null;
      el.classList.remove("dragging");
      if (accept && done && !done.moved) {
        this.cam3d.yaw = 0;
        this.cam3d.pitch = 0.56;
        this.Render3D();
      }
    };
    el.addEventListener("pointerup", () => finish(true));
    el.addEventListener("pointercancel", () => finish(false));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.cam3d.yaw = 0; this.cam3d.pitch = 0.56; this.Render3D(); }
    });
  }

  ClearGroup(grp) {
    while (grp.children.length) {
      const child = grp.children.pop();
      child.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
    }
  }

  ComputeActiveBounds() {
    const pts = this.squads.flatMap((sq) => sq.route);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!Number.isFinite(minX)) return { minX: -25, maxX: 25, minZ: -25, maxZ: 25 };
    return { minX: minX - 22, maxX: maxX + 22, minZ: minZ - 22, maxZ: maxZ + 22 };
  }

  Fit3DOverview() {
    const activeSq = this.ActiveSquad();
    const route = activeSq?.route?.length ? activeSq.route : this.squads.flatMap((sq) => sq.route);
    if (!route.length) {
      this.cam3d.target.set(0, 1, 0);
      this.cam3d.dist = 24;
      this.cam3d.pitch = 0.54;
      this.cam3d.yaw = 0.48;
      return;
    }
    // 对准主小队前半段真实路径点重心（避免 L 形拐弯的包围盒中心落到空地），开屏即可看到队列与转头视线锥
    const headCount = Math.max(2, Math.min(route.length, Math.ceil(route.length * 0.45)));
    let sx = 0, sz = 0;
    for (let i = 0; i < headCount; i += 1) {
      sx += route[i][0];
      sz += route[i][1];
    }
    const cx = sx / headCount;
    const cz = sz / headCount;
    const cy = this.env ? this.env.heightAt(cx, cz) : 0;
    const segSpan = Math.hypot(route[headCount - 1][0] - route[0][0], route[headCount - 1][1] - route[0][1]);
    this.cam3d.target.set(cx, cy + 1.0, cz);
    this.cam3d.dist = Clamp(Math.max(15, segSpan * 0.92), 14, 34);
    this.cam3d.pitch = 0.52;
    this.cam3d.yaw = 0.42;
  }

  Rebuild3DEnvironment(resetCam = false) {
    if (!this.three || !this.env) return;
    this.ClearGroup(this.three.envGroup);
    const b = this.ComputeActiveBounds();
    const spanX = Math.max(10, b.maxX - b.minX);
    const spanZ = Math.max(10, b.maxZ - b.minZ);
    const segX = Clamp(Math.round(spanX / 0.9), 28, 150);
    const segZ = Clamp(Math.round(spanZ / 0.9), 28, 150);

    const geo = new THREE.PlaneGeometry(spanX, spanZ, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cx = (b.minX + b.maxX) * 0.5, cz = (b.minZ + b.maxZ) * 0.5;
    let minY = Infinity, maxY = -Infinity;
    const ys = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i += 1) {
      const wx = pos.getX(i) + cx;
      const wz = pos.getZ(i) + cz;
      const wy = this.env.heightAt(wx, wz);
      pos.setXYZ(i, wx, wy, wz);
      ys[i] = wy;
      if (wy < minY) minY = wy;
      if (wy > maxY) maxY = wy;
    }
    const spanY = Math.max(0.5, maxY - minY);
    const cLow = new THREE.Color(0x837758);
    const cMid = new THREE.Color(0xa09d78);
    const cHi = new THREE.Color(0xb8b28e);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const u = Clamp((ys[i] - minY) / spanY, 0, 1);
      tmp.copy(u < 0.5 ? cLow : cMid).lerp(u < 0.5 ? cMid : cHi, u < 0.5 ? u * 2 : (u - 0.5) * 2);
      const wx = pos.getX(i), wz = pos.getZ(i);
      const lineX = Math.abs(wx - Math.round(wx * 0.2) * 5) < 0.14;
      const lineZ = Math.abs(wz - Math.round(wz * 0.2) * 5) < 0.14;
      const shade = (lineX || lineZ) ? 0.93 : 1.0;
      colors[i * 3] = tmp.r * shade;
      colors[i * 3 + 1] = tmp.g * shade;
      colors[i * 3 + 2] = tmp.b * shade;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.three.envGroup.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));

    const matCover = new THREE.MeshLambertMaterial({ color: 0x628f64 });
    const matSolid = new THREE.MeshLambertMaterial({ color: 0xb6b09c });
    const matTrunk = new THREE.MeshLambertMaterial({ color: 0x665742 });
    const matCanopy = new THREE.MeshLambertMaterial({ color: 0x717f57, transparent: true, opacity: 0.74 });
    for (const box of this.env.obstacles) {
      if (box.x + box.radius < b.minX || box.x - box.radius > b.maxX || box.z + box.radius < b.minZ || box.z - box.radius > b.maxZ) continue;
      const gy = this.env.heightAt(box.x, box.z);
      if (box.isTree) {
        const trunkH = Math.min(box.h * 0.65, 5.2);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, trunkH, 6), matTrunk.clone());
        trunk.position.set(box.x, gy + trunkH * 0.5, box.z);
        const crownR = Clamp(box.h * 0.22, 0.9, 2.2);
        const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(crownR, 0), matCanopy.clone());
        crown.position.set(box.x, gy + trunkH + crownR * 0.55, box.z);
        this.three.envGroup.add(trunk, crown);
        continue;
      }
      const m = new THREE.Mesh(new THREE.BoxGeometry(box.hx * 2, box.h, box.hz * 2), box.isCover ? matCover.clone() : matSolid.clone());
      m.position.set(box.x, gy + box.h * 0.5, box.z);
      m.rotation.y = box.ry;
      this.three.envGroup.add(m);
    }

    if (resetCam) this.Fit3DOverview();
  }

  CreateArticulatedPuppet(actor) {
    const col = SIDE_COLORS[actor.side] || SIDE_COLORS.friend;
    const root = new THREE.Group();
    root.userData.actorId = actor.id;

    // 脚底接地柔影，大幅提升 3D 空间贴地感
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 14).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x161812, transparent: true, opacity: 0.34, depthWrite: false }),
    );
    shadow.position.y = 0.03;
    root.add(shadow);

    const matBody = new THREE.MeshLambertMaterial({ color: col.hex });
    const matDark = new THREE.MeshLambertMaterial({ color: 0x2f312b });
    const matHelmet = new THREE.MeshLambertMaterial({ color: actor.role === "leader" ? 0xc7a24a : col.helmet });
    const matSkin = new THREE.MeshLambertMaterial({ color: 0xdab492 });
    const matRifle = new THREE.MeshLambertMaterial({ color: 0x4b3826 });

    const pelvis = new THREE.Group();
    pelvis.position.y = 0.88;
    root.add(pelvis);

    const legGeo = new THREE.BoxGeometry(0.14, 0.78, 0.16);
    legGeo.translate(0, -0.39, 0);
    const legL = new THREE.Mesh(legGeo, matDark);
    legL.position.set(-0.11, 0, 0);
    const legR = new THREE.Mesh(legGeo.clone(), matDark);
    legR.position.set(0.11, 0, 0);
    pelvis.add(legL, legR);

    const chest = new THREE.Group();
    chest.position.y = 0.12;
    pelvis.add(chest);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.22), matBody);
    torso.position.y = 0.24;
    chest.add(torso);

    const rifle = new THREE.Group();
    rifle.position.set(0.06, 0.22, -0.18);
    rifle.rotation.set(0.18, 0.65, -0.22);
    rifle.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, actor.role === "mgGunner" ? 0.94 : 0.78), matRifle));
    chest.add(rifle);

    const neck = new THREE.Group();
    neck.position.y = 0.54;
    chest.add(neck);
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.10, 8), matSkin);
    neckMesh.position.y = 0.05;
    neck.add(neckMesh);

    const head = new THREE.Group();
    head.position.y = 0.11;
    neck.add(head);
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 8), matSkin);
    cranium.position.y = 0.09;
    head.add(cranium);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.142, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), matHelmet);
    helmet.position.y = 0.11;
    head.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.09), matHelmet);
    visor.position.set(0, 0.12, -0.13);
    head.add(visor);

    const coneGeo = new THREE.ConeGeometry(0.62, 2.4, 12, 1, true);
    coneGeo.rotateX(Math.PI / 2);
    coneGeo.translate(0, 0, -1.2);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0x9ae09a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    const gazeCone = new THREE.Mesh(coneGeo, coneMat);
    gazeCone.position.set(0, 0.10, -0.12);
    head.add(gazeCone);

    return { root, pelvis, legL, legR, chest, neck, head, gazeCone, coneMat, stridePhase: (actor.name.charCodeAt(0) % 7) * 0.9 };
  }

  Rebuild3DCurvesAndPuppets() {
    if (!this.three || !this.compiled) return;
    this.ClearGroup(this.three.splineGroup);
    this.ClearGroup(this.three.actorsGroup);
    this.puppets3d.clear();
    this.ghosts3d.clear();
    this.stimulusRings3d = [];

    for (const sq of this.compiled.squads) {
      const sts = sq.corridor.stations;
      if (sts.length >= 2) {
        const verts = [], indices = [];
        for (let i = 0; i < sts.length; i += 1) {
          const st = sts[i];
          const lx = st.x + st.rx * st.dMin, lz = st.z + st.rz * st.dMin;
          const rx = st.x + st.rx * st.dMax, rz = st.z + st.rz * st.dMax;
          verts.push(lx, this.env.heightAt(lx, lz) + 0.07, lz);
          verts.push(rx, this.env.heightAt(rx, rz) + 0.07, rz);
          if (i < sts.length - 1) {
            const b = i * 2;
            indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
        g.setIndex(indices);
        this.three.splineGroup.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({
          color: 0xedca83, transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false,
        })));
        const linePts = sts.map((st) => new THREE.Vector3(st.x, st.y + 0.14, st.z));
        this.three.splineGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: 0xf2c864 })));
      }
    }

    const frame0 = this.compiled.Sample(0);
    const ghostGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.55, 8);
    ghostGeo.translate(0, 0.78, 0);
    for (const a of frame0.actors) {
      const puppet = this.CreateArticulatedPuppet(a);
      this.three.actorsGroup.add(puppet.root);
      this.puppets3d.set(a.id, puppet);

      const ghost = new THREE.Mesh(ghostGeo.clone(), new THREE.MeshBasicMaterial({
        color: 0x333530, wireframe: true, transparent: true, opacity: 0.44,
      }));
      this.three.actorsGroup.add(ghost);
      this.ghosts3d.set(a.id, ghost);
    }

    for (const st of this.stimuli) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.95, 24).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xff5b4a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
      );
      ring.position.set(st.x, this.env.heightAt(st.x, st.z) + 0.16, st.z);
      this.three.splineGroup.add(ring);
      this.stimulusRings3d.push({ st, ring });
    }
  }

  Render3D() {
    if (!this.three || this.layout === "2d" || !this.compiled) return;
    const { renderer, scene, camera } = this.three;
    const canvas = $("canvas3d");
    const w = canvas.clientWidth || 640, h = canvas.clientHeight || 480;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }

    const frame = this.compiled.Sample(this.time);
    let pickedActor = null;
    for (const a of frame.actors) {
      if (a.id === this.selectedActorId) pickedActor = a;
      const p = this.puppets3d.get(a.id);
      if (p) {
        p.root.position.set(a.x, a.y, a.z);
        p.root.rotation.y = a.yaw;
        const crouch = a.phase === "stalkPause" ? 0.24 : 0;
        p.pelvis.position.y = 0.88 - crouch + Math.abs(Math.sin(this.time * (a.speed * 2.8 + 1.0) + p.stridePhase)) * (a.speed > 0.15 ? 0.045 : 0.008);
        const swing = a.speed > 0.12 ? Math.sin(this.time * Math.max(3.2, a.speed * 3.1) + p.stridePhase) * Clamp(a.speed * 0.24, 0.12, 0.68) : 0;
        p.legL.rotation.x = swing;
        p.legR.rotation.x = -swing;

        p.chest.rotation.y = a.chestYaw;
        p.chest.rotation.x = a.phase === "stalkPause" ? -0.22 : (a.speed > 2.6 ? -0.10 : 0);
        p.neck.rotation.y = a.neckYaw;
        p.head.rotation.y = a.headYaw;
        p.head.rotation.x = a.gazePitch;

        p.gazeCone.visible = this.layers.gaze;
        const gc = GAZE_COLORS[a.gazeKind] || GAZE_COLORS.route;
        p.coneMat.color.setHex(gc.hex);
        p.coneMat.opacity = a.gazeKind === "route" ? 0.10 : 0.36;
        const coneScale = a.gazeKind === "route" ? 0.62 : 1.16;
        p.gazeCone.scale.set(coneScale, coneScale, coneScale);
      }

      const g = this.ghosts3d.get(a.id);
      if (g) {
        g.visible = this.layers.baseline;
        g.position.set(a.baseX, this.env ? this.env.heightAt(a.baseX, a.baseZ) : 0, a.baseZ);
      }
    }

    if (this.selectRing3d) {
      this.selectRing3d.visible = !!pickedActor;
      if (pickedActor) this.selectRing3d.position.set(pickedActor.x, pickedActor.y + 0.09, pickedActor.z);
    }

    for (const item of this.stimulusRings3d) {
      const age = this.time - item.st.time;
      const on = age >= 0 && age <= item.st.durationS;
      item.ring.visible = on;
      if (on) {
        const s = 1 + age * 6.5;
        item.ring.scale.set(s, 1, s);
        item.ring.material.opacity = Clamp(1 - age / item.st.durationS, 0, 1) * 0.85;
      }
    }

    if (this.camMode === "follow" || this.camMode === "closeup") {
      const activeSq = this.ActiveSquad();
      const targetActor = pickedActor
        || frame.actors.find((a) => activeSq && a.squadId === activeSq.id && a.role === "leader")
        || frame.actors[0];
      if (targetActor) {
        this.cam3d.target.lerp(new THREE.Vector3(targetActor.x, targetActor.y + 1.35, targetActor.z), 0.14);
        if (this.camMode === "closeup") {
          this.cam3d.dist += (5.8 - this.cam3d.dist) * 0.12;
          this.cam3d.pitch += (0.28 - this.cam3d.pitch) * 0.12;
        } else {
          this.cam3d.dist += (15.5 - this.cam3d.dist) * 0.08;
        }
      }
    }

    const rHoriz = Math.cos(this.cam3d.pitch) * this.cam3d.dist;
    const camY = Math.sin(this.cam3d.pitch) * this.cam3d.dist;
    camera.position.set(
      this.cam3d.target.x + Math.sin(this.cam3d.yaw) * rHoriz,
      this.cam3d.target.y + camY,
      this.cam3d.target.z + Math.cos(this.cam3d.yaw) * rHoriz,
    );
    camera.lookAt(this.cam3d.target);
    $("compassRing").setAttribute("transform", `rotate(${(this.cam3d.yaw / DEG).toFixed(1)} 28 28)`);
    renderer.render(scene, camera);

    if (this.layout === "3d") this.SyncActorDial(frame);
  }

  ResizeCanvases() {
    this.Render2D();
    this.Render3D();
  }

  RenderFrame() {
    const tr = $("timeRange");
    tr.value = String(this.time);
    SyncRangeFill(tr);
    $("timeReadout").textContent = `${this.time.toFixed(2)} / ${this.durationS.toFixed(1)}s`;
    this.Render2D();
    this.Render3D();
  }

  Tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastRaf) / 1000));
    this.lastRaf = now;
    if (this.playing && this.compiled) {
      this.time += dt * this.playSpeed;
      if (this.time >= this.durationS) {
        if (this.loop) this.time = 0;
        else { this.time = this.durationS; this.SetPlaying(false); }
      }
      this.RenderFrame();
    }
    requestAnimationFrame((t) => this.Tick(t));
  }

  ShowError(msg) {
    const el = $("errorBanner");
    el.hidden = !msg;
    el.textContent = msg || "";
  }
}

const app = new SquadSplinePreviewApp();
window.SquadSplinePreview = {
  get ready() { return app.ready; },
  get sceneId() { return app.sceneId; },
  get scenarioId() { return app.scenarioId; },
  get navTool() { return app.navTool; },
  get view2d() { return { cx: app.view2d.cx, cz: app.view2d.cz, scale: app.view2d.scale }; },
  get cam3d() { return { target: [app.cam3d.target.x, app.cam3d.target.y, app.cam3d.target.z], yaw: app.cam3d.yaw, pitch: app.cam3d.pitch, dist: app.cam3d.dist }; },
  get telemetry() { return app.compiled?.telemetry || null; },
  get squads() { return app.squads; },
  SetTime(t) { app.SetPlaying(false); app.time = Clamp(Number(t) || 0, 0, app.durationS); app.RenderFrame(); },
  SetProfile(id) { const sq = app.ActiveSquad(); if (sq) { sq.profile = id; sq.overrides = {}; app.RebuildAll(); } },
  SetNavTool(t) { app.SetNavTool(t); },
  LoadScenario(id) { return app.LoadScenario(id); },
  SwitchScene(id) { return app.SwitchSceneOnly(id); },
  DropStimulus(x, z) { app.DropStimulusAt(x, z); },
  SampleAt(t) { return app.compiled?.Sample(t) || null; },
};

app.Init().catch((err) => {
  console.error("[SquadSplinePreview]", err);
  app.ShowError(`工具初始化失败：${err.message || err}`);
});
