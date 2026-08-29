// 完整场景编辑器：一次巡看完整滕县与四门外，并可切到出川军列车厢静态场景。
//
// 这是只读的场景总览与取证工具，不承担「章节切片 + 摆件文档」那套关卡编辑语义：
// 原 Script_EditorScene.mjs 不 import 本模块，本模块也不读写它的 worldEditDocument。
// 县城几何、Spline、随机种子与环境参数全部读现有运行时/数据源，不维护第二份真相。
// 车厢只挂 props 静态布景，不播放 shots、不加载演员，也不显示对白/字幕/时间轴。

import * as THREE from "three";
import {
  Panel, Section, ButtonRow, Chips, ListBox, Facts, Note, TextArea, Toggle,
  CameraProjectionControls,
} from "./Script_EditorUi.mjs";
import { MakeRoadPath } from "./Script_RoadPath.mjs";
import { CollectSceneSplineRoutes } from "./Script_EditorSplines.mjs";
import { SKY_PRESETS } from "./Script_Sky.mjs";
import { CS_Chuchuan } from "./Data_CutsceneChuchuan.mjs";

const CARRIAGE_ID = "CS_Chuchuan";
const KIND_COLOR = {
  street: 0xffc95f, road: 0xe6a56b, railway: 0x9fc8ff, wall: 0xd0b394,
};

export const FULL_SCENE_CAMERA_PRESETS = Object.freeze({
  county: Object.freeze({
    label: "完整县城", position: [100, 1120, 1260], look: [100, 0, 120], fov: 48, far: 3600,
  }),
  city: Object.freeze({
    label: "城内", position: [0, 520, 470], look: [0, 0, 0], fov: 48, far: 2600,
  }),
  east: Object.freeze({
    label: "东门外", position: [900, 260, 30], look: [455, 0, -65], fov: 52, far: 2800,
  }),
  west: Object.freeze({
    label: "西门外", position: [-760, 245, 120], look: [-400, 0, 0], fov: 52, far: 2800,
  }),
  south: Object.freeze({
    label: "南门外", position: [180, 330, 1120], look: [0, 0, 520], fov: 50, far: 3200,
  }),
  north: Object.freeze({
    label: "北门外", position: [110, 300, -790], look: [-90, 0, -430], fov: 50, far: 3000,
  }),
});

const CARRIAGE_ORIGIN = CS_Chuchuan.setOrigin || [0, 0, 0];
const CarriagePoint = ([x, y, z]) => Object.freeze([
  CARRIAGE_ORIGIN[0] + x, CARRIAGE_ORIGIN[1] + y, CARRIAGE_ORIGIN[2] + z,
]);

/** 纯场景巡看机位；与 shots 镜头表完全分离。 */
export const CARRIAGE_SCENE_CAMERA_PRESETS = Object.freeze({
  overview: Object.freeze({
    label: "车厢整体", position: CarriagePoint([15, 8, 20]), look: CarriagePoint([0, 1.8, 0]), fov: 54, far: 4200,
  }),
  interior: Object.freeze({
    label: "车厢内部", position: CarriagePoint([0, 1.72, 6.8]), look: CarriagePoint([0, 1.45, -4.5]), fov: 58, far: 4200,
  }),
  platform: Object.freeze({
    label: "月台一侧", position: CarriagePoint([13, 4.5, 18]), look: CarriagePoint([0, 1.7, 4]), fov: 52, far: 4200,
  }),
  roof: Object.freeze({
    label: "车顶俯看", position: CarriagePoint([11, 14, 14]), look: CarriagePoint([0, 1.5, 0]), fov: 48, far: 4200,
  }),
  landscape: Object.freeze({
    label: "窗外环境", position: CarriagePoint([24, 12, 34]), look: CarriagePoint([0, 1.5, 0]), fov: 56, far: 4200,
  }),
});

const ENV_LABELS = Object.freeze({
  editorClear: "编辑器清晰日", dusk: "黄昏", smokyDay: "硝烟白昼", chuchuanDay: "车厢白昼", overcast: "阴天",
  burningStreet: "燃烧街巷", night: "夜间", dawn: "拂晓",
});

/** 场景切换只改旁路 query，不把当前章节/沙盒参数带进另一片。 */
export function FullSceneUrl(href, target) {
  const url = new URL(href);
  for (const key of ["range", "melee", "jiehe", "shot", "manual"]) url.searchParams.delete(key);
  url.searchParams.set("editor", "fullScene");
  url.searchParams.set("menu", "0");
  url.searchParams.set("phase", "fullscene");
  url.searchParams.delete("preview");
  url.searchParams.delete("autoplay");
  if (target === "carriage") {
    url.searchParams.set("fullSceneView", "carriage");
  } else {
    url.searchParams.delete("fullSceneView");
  }
  return url.toString();
}

function AddNestedSeeds(value, path, rows, seen) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => AddNestedSeeds(entry, `${path}[${index}]`, rows, seen));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (key === "seed" && (typeof entry === "string" || Number.isFinite(entry))) {
      rows.push({ id: next, value: entry, source: next, purpose: "车厢静态场景确定性生成" });
    } else AddNestedSeeds(entry, next, rows, seen);
  }
}

/** 面板与测试共用的随机种子清单。 */
export function CollectFullSceneSeeds({ sceneMode = "county", battlefield = null, routes = null } = {}) {
  const rows = [];
  if (sceneMode === "carriage") {
    // 静态场景只生成 props；演员与 shots 的 seed 不在这张账里，避免把序章演出
    // 误报成场景内容。重复的两侧远景种子仍会在下方按 id/value 去重。
    AddNestedSeeds(CS_Chuchuan.props, `${CARRIAGE_ID}.props`, rows, new Set());
  } else {
    const master = battlefield?.city?.seed ?? 19380317;
    rows.push(
      { id: "county.master", value: master, source: "TengxianField → TengxianCity", purpose: "县城总生成种子" },
      { id: "county.outfield", value: master ^ 0x4A49, source: "TengxianField", purpose: "城外平原派生种子" },
      { id: "county.terrain", value: 4211, source: "TengxianCity.OuterHeight", purpose: "城外解析地形 Fbm" },
    );
    for (const route of routes || CollectSceneSplineRoutes(null)) {
      const seed = route.wall?.seed ?? route.seed;
      if (seed == null) continue;
      rows.push({
        id: `spline.${route.key}`, value: seed, source: route.source,
        purpose: `${route.label} ${route.kind === "wall" ? "拼墙" : "铺设"}`,
      });
    }
  }
  const unique = new Map();
  for (const row of rows) unique.set(`${row.id}:${String(row.value)}`, row);
  return [...unique.values()];
}

export function FullSceneEnvironment(name) {
  const preset = SKY_PRESETS[name];
  return preset ? { name, label: ENV_LABELS[name] || name, ...preset } : null;
}

function Json(value) { return JSON.stringify(value, null, 2); }

/** JSON 默认折叠；只有用户主动展开或点“查看 JSON”才占面板高度。 */
function CollapsedJson(parent, label, options) {
  const details = document.createElement("details");
  details.className = "edJsonFold";
  const summary = document.createElement("summary");
  summary.textContent = label;
  details.appendChild(summary);
  const area = TextArea(details, options);
  parent.appendChild(details);
  area.details = details;
  return area;
}

function RevealJson(area, value) {
  if (!area) return;
  area.value = Json(value);
  if (area.details) area.details.open = true;
}

export class FullSceneEditor {
  static id = "fullScene";
  static label = "完整场景预览";
  static hint = "完整县城与四门外 / 出川军列车厢静态场景切换，随机种子、Spline 与环境参数只读取证";

  constructor(host) {
    this.host = host;
    this.sceneMode = host.game.sceneMode || "county";
    this.cameraMode = "fly";
    this.routes = CollectSceneSplineRoutes(null);
    this.kindFilter = "全部";
    this.showAllSplines = true;
    this.selectedRouteKey = this.routes[0]?.key || null;
    this.overlay = null;
    this.panel = null;
    this.carriageSet = null;
    this.environmentState = null;
    this.seedRows = [];
    this.selectedSeedId = null;
  }

  get selectedRoute() {
    return this.routes.find((route) => route.key === this.selectedRouteKey) || null;
  }

  Enter(root) {
    this.environmentState = this.host.game.GetEnvironmentState?.() || null;
    this.host.flycam.Open();
    this.host.SetViewmodelVisible(false);
    if (this.sceneMode === "county") {
      this.overlay = new THREE.Group();
      this.overlay.name = "FullSceneSplineOverlay";
      this.host.scene.add(this.overlay);
    } else {
      this.carriageSet = this.host.cutscene?.MountStaticSet?.(CARRIAGE_ID, {
        at: 0, includeActors: false,
      }) || null;
    }
    this.panel = Panel({
      title: "完整场景编辑器",
      sub: this.sceneMode === "carriage"
        ? "出川军列车厢 · 静态场景自由巡看"
        : "完整县城 · WASD+QE 飞行 · 拖动转头",
      variant: "work wide",
      onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    if (this.sceneMode === "county") {
      this.ApplyCamera("county");
      this.FillSplineList();
      this.SelectRoute(this.selectedRouteKey, false);
    } else this.ApplyCamera("overview");
    this.RefreshSeeds();
    const initialEnvironment = this.sceneMode === "carriage" ? "chuchuanDay"
      : (this.host.game.GetEnvironmentState?.().name || "editorClear");
    this.SelectEnvironment(initialEnvironment, this.sceneMode === "carriage");
    return this;
  }

  Exit() {
    if (this.overlay) {
      this.ClearOverlay();
      this.host.scene.remove(this.overlay);
      this.overlay = null;
    }
    if (this.carriageSet) {
      this.host.cutscene?.UnmountStaticSet?.();
      this.carriageSet = null;
    }
    this.host.flycam.Close();
    this.host.SetViewmodelVisible(true);
    if (this.environmentState) this.host.game.RestoreEnvironmentState?.(this.environmentState);
    this.panel?.root.remove();
    this.panel = null;
  }

  BuildUi(body) {
    const scene = Section(body, "场景");
    ButtonRow(scene, [
      { label: this.sceneMode === "county" ? "● 完整县城" : "完整县城", onClick: () => this.SwitchScene("county") },
      { label: this.sceneMode === "carriage" ? "● 奇观 · 出川车厢" : "奇观 · 出川车厢", onClick: () => this.SwitchScene("carriage") },
    ]);
    Note(scene, this.sceneMode === "county"
      ? "当前一次生成城内与东西南北门外；这是独立完整切片，不改变章节关卡编辑器。"
      : "当前只挂载车厢、月台与窗外环境的静态布景；没有演员、对白、字幕、音频或镜头时间轴。", true);

    if (this.sceneMode !== "carriage") this.BuildCountyUi(body);
    else this.BuildCarriageUi(body);
    this.BuildEnvironmentUi(body);
    this.BuildSeedUi(body);
  }

  BuildCountyUi(body) {
    const cameras = Section(body, "完整巡场机位");
    Chips(cameras, Object.entries(FULL_SCENE_CAMERA_PRESETS).map(([value, spec]) => ({
      value, label: spec.label,
    })), "county", (id) => this.ApplyCamera(id));
    CameraProjectionControls(cameras, this.host.camera, { farMax: 5000 });
    Note(cameras, "飞行：WASD；Q/E 降升；Shift 加速；Ctrl 慢速；滚轮调飞行速度。", false);

    const spline = Section(body, "Spline 完整预览（只读）");
    Chips(spline, ["全部", "street", "road", "railway", "wall"], "全部", (kind) => {
      this.kindFilter = kind;
      this.FillSplineList();
      this.BuildSplineOverlay();
    });
    Toggle(spline, "显示筛选结果全部中心线", this.showAllSplines, (on) => {
      this.showAllSplines = on;
      this.BuildSplineOverlay();
    });
    this.splineList = ListBox(spline, { height: 190, onPick: (key) => this.SelectRoute(key, true) });
    this.splineFacts = Facts(spline);
    ButtonRow(spline, [
      { label: "当前路线 JSON", onClick: () => RevealJson(this.splineJson, this.RouteEvidence(this.selectedRoute)) },
      { label: "全部路线 JSON", onClick: () => RevealJson(this.splineJson, this.routes.map((r) => this.RouteEvidence(r))) },
    ]);
    this.splineJson = CollapsedJson(spline, "JSON（默认折叠）", {
      rows: 7, placeholder: "路线控制点、长度、宽高、种子与来源",
    });
  }

  BuildCarriageUi(body) {
    const cameras = Section(body, "车厢场景巡看机位");
    Chips(cameras, Object.entries(CARRIAGE_SCENE_CAMERA_PRESETS).map(([value, spec]) => ({
      value, label: spec.label,
    })), "overview", (id) => this.ApplyCamera(id));
    CameraProjectionControls(cameras, this.host.camera, { farMax: 5000 });
    Note(cameras, "自由巡看：WASD；Q/E 降升；Shift 加速；Ctrl 慢速；滚轮调速度。", false);
    this.carriageFacts = Facts(cameras);
    this.carriageFacts.Set("预览模式", "纯静态场景");
    this.carriageFacts.Set("布景构件", this.carriageSet?.props ?? 0);
    this.carriageFacts.Set("演员 / 时间轴", "未加载 / 未启动");
    this.carriageFacts.Set("场景源", "Data_CutsceneChuchuan.props");
    this.carriageFacts.Set("天空 / 远裁剪", `${CS_Chuchuan.sky} / ${CS_Chuchuan.cameraFar} m`);
  }

  BuildEnvironmentUi(body) {
    const environment = Section(body, "环境系统 / 氛围预设");
    this.environmentChips = Chips(environment, Object.keys(SKY_PRESETS).map((name) => ({
      value: name, label: ENV_LABELS[name] || name,
    })), "smokyDay", (name) => this.SelectEnvironment(name, true));
    this.environmentFacts = Facts(environment);
    this.environmentJson = CollapsedJson(environment, "环境 JSON（默认折叠）", {
      rows: 9, placeholder: "完整天空、灯光、雾与后期参数",
    });
    ButtonRow(environment, [
      { label: "恢复进入时环境", onClick: () => {
        this.host.game.RestoreEnvironmentState?.(this.environmentState);
        const name = this.host.game.GetEnvironmentState?.().name || this.environmentState?.name;
        if (name) this.SelectEnvironment(name, false);
      } },
    ]);
  }

  BuildSeedUi(body) {
    const seeds = Section(body, "确定性随机种子");
    this.seedList = ListBox(seeds, { height: 180, onPick: (id) => this.SelectSeed(id) });
    this.seedFacts = Facts(seeds);
    ButtonRow(seeds, [
      { label: "完整种子清单 JSON", onClick: () => RevealJson(this.seedJson, this.seedRows) },
    ]);
    this.seedJson = CollapsedJson(seeds, "种子 JSON（默认折叠）", {
      rows: 7, placeholder: "种子值、来源与用途",
    });
  }

  SwitchScene(target) {
    if (target === this.sceneMode) return;
    window.location.assign(FullSceneUrl(window.location.href, target));
  }

  ApplyCamera(id) {
    const table = this.sceneMode === "carriage"
      ? CARRIAGE_SCENE_CAMERA_PRESETS : FULL_SCENE_CAMERA_PRESETS;
    const spec = table[id];
    if (!spec) return false;
    const camera = this.host.camera;
    camera.position.fromArray(spec.position);
    camera.fov = spec.fov;
    camera.far = spec.far;
    camera.updateProjectionMatrix();
    camera.lookAt(new THREE.Vector3().fromArray(spec.look));
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    this.host.flycam.yaw = e.y;
    this.host.flycam.pitch = e.x;
    return true;
  }

  VisibleRoutes() {
    return this.kindFilter === "全部"
      ? this.routes : this.routes.filter((route) => route.kind === this.kindFilter);
  }

  FillSplineList() {
    if (!this.splineList) return;
    const visible = this.VisibleRoutes();
    this.splineList.Fill(visible.map((route) => ({
      id: route.key, name: route.label, tail: route.kind, title: `${route.source}\nseed=${route.wall?.seed ?? route.seed ?? "—"}`,
    })));
    if (!visible.some((route) => route.key === this.selectedRouteKey)) {
      this.selectedRouteKey = visible[0]?.key || null;
    }
    this.splineList.Select(this.selectedRouteKey);
  }

  RouteEvidence(route) {
    if (!route) return null;
    const points = route.closed ? [...route.points, route.points[0]] : route.points;
    const path = MakeRoadPath(points, route.kind === "wall" ? { subdivisions: 1 } : {});
    return {
      key: route.key, id: route.id, label: route.label, kind: route.kind,
      source: route.source, seed: route.wall?.seed ?? route.seed ?? null,
      lengthMeters: +path.length.toFixed(2), width: route.width ?? null,
      height: route.height ?? null, topWidth: route.topWidth ?? null,
      baseWidth: route.baseWidth ?? null, closed: !!route.closed,
      axisLocked: !!route.axisLocked, points: route.points,
      wall: route.wall || null,
    };
  }

  SelectRoute(key, fly = false) {
    if (!this.routes.some((route) => route.key === key)) return;
    this.selectedRouteKey = key;
    this.splineList?.Select(key);
    const evidence = this.RouteEvidence(this.selectedRoute);
    this.splineFacts?.Clear();
    this.splineFacts?.Set("路线 / 类型", `${evidence.label} · ${evidence.kind}`);
    this.splineFacts?.Set("长度 / 控制点", `${evidence.lengthMeters.toFixed(1)} m / ${evidence.points.length}`);
    this.splineFacts?.Set("宽 / 高", `${evidence.width ?? "—"} / ${evidence.height ?? "—"} m`);
    this.splineFacts?.Set("随机种子", evidence.seed ?? "—");
    this.splineFacts?.Set("来源", evidence.source);
    if (this.splineJson) this.splineJson.value = Json(evidence);
    if (fly) this.FlyToRoute(this.selectedRoute);
    this.BuildSplineOverlay();
  }

  FlyToRoute(route) {
    if (!route) return;
    const evidence = this.RouteEvidence(route);
    const points = route.closed ? [...route.points, route.points[0]] : route.points;
    const path = MakeRoadPath(points, route.kind === "wall" ? { subdivisions: 1 } : {});
    const mid = path.At(path.length / 2);
    const y = this.GroundAt(mid.x, mid.z);
    const span = Math.max(45, Math.min(240, evidence.lengthMeters * 0.55));
    const camera = this.host.camera;
    camera.position.set(mid.x, y + span * 0.75, mid.z + span);
    camera.lookAt(mid.x, y, mid.z);
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    this.host.flycam.yaw = e.y;
    this.host.flycam.pitch = e.x;
  }

  GroundAt(x, z) {
    const y = this.host.game.battlefield?.GroundHeight?.(x, z);
    return Number.isFinite(y) ? y : 0;
  }

  ClearOverlay() {
    if (!this.overlay) return;
    for (const child of [...this.overlay.children]) {
      this.overlay.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
  }

  BuildSplineOverlay() {
    if (!this.overlay) return;
    this.ClearOverlay();
    const shown = this.showAllSplines ? this.VisibleRoutes() : (this.selectedRoute ? [this.selectedRoute] : []);
    for (const route of shown) {
      const sourcePoints = route.closed ? [...route.points, route.points[0]] : route.points;
      const path = MakeRoadPath(sourcePoints, route.kind === "wall" ? { subdivisions: 1 } : {});
      const count = Math.max(8, Math.ceil(path.length / 4));
      const points = [];
      for (let i = 0; i <= count; i += 1) {
        const p = path.At((path.length * i) / count);
        points.push(new THREE.Vector3(p.x, this.GroundAt(p.x, p.z) + 0.65, p.z));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: KIND_COLOR[route.kind] || 0xffffff, transparent: true,
          opacity: route.key === this.selectedRouteKey ? 1 : 0.48,
        }),
      );
      line.renderOrder = 920;
      this.overlay.add(line);
    }
    for (const point of this.selectedRoute?.points || []) {
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.6, 1.6),
        new THREE.MeshBasicMaterial({ color: 0xff6b45 }),
      );
      marker.position.set(point[0], this.GroundAt(point[0], point[1]) + 1.0, point[1]);
      marker.renderOrder = 921;
      this.overlay.add(marker);
    }
  }

  SelectEnvironment(name, apply) {
    const data = FullSceneEnvironment(name);
    if (!data) return false;
    if (apply && !this.host.game.ApplyEnvironment?.(name)) return false;
    this.environmentChips?.Set(name);
    this.environmentFacts?.Clear();
    this.environmentFacts?.Set("预设", `${data.label} · ${name}`);
    this.environmentFacts?.Set("太阳", `${data.sunElevation}° / ${data.sunAzimuth}°`);
    this.environmentFacts?.Set("直射 / 半球 / 环境", `${data.lightIntensity ?? "—"} / ${data.hemiIntensity ?? "—"} / ${data.envIntensity ?? "—"}`);
    this.environmentFacts?.Set("曝光 / Bloom / 体积光", `${data.exposure} / ${data.bloom} / ${data.godStrength}`);
    this.environmentFacts?.Set("雾密度 / 上限", `${data.fog?.density ?? "—"} / ${data.fog?.max ?? "—"}`);
    if (this.environmentJson) this.environmentJson.value = Json(data);
    return true;
  }

  RefreshSeeds() {
    this.seedRows = CollectFullSceneSeeds({
      sceneMode: this.sceneMode, battlefield: this.host.game.battlefield, routes: this.routes,
    });
    this.selectedSeedId = this.seedRows[0]?.id || null;
    this.seedList?.Fill(this.seedRows.map((row) => ({
      id: row.id, name: row.id, tail: String(row.value), title: `${row.source}\n${row.purpose}`,
    })));
    this.seedList?.Select(this.selectedSeedId);
    this.SelectSeed(this.selectedSeedId);
    if (this.seedJson) this.seedJson.value = Json(this.seedRows);
  }

  SelectSeed(id) {
    const row = this.seedRows.find((entry) => entry.id === id);
    if (!row) return;
    this.selectedSeedId = id;
    this.seedList?.Select(id);
    this.seedFacts?.Clear();
    this.seedFacts?.Set("值", row.value);
    this.seedFacts?.Set("用途", row.purpose);
    this.seedFacts?.Set("来源", row.source);
  }

  Update(dt) {
    this.host.flycam.Update(dt);
    if (this.host.viewmodel?.root?.visible) this.host.SetViewmodelVisible(false);
  }
}

export default FullSceneEditor;
