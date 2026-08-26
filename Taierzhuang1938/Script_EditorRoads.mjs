// 道路样条编辑器：把全城的铁路/道路/大街按「中心线控制点」列出来，
// 现场预览、拖点、加减点、调宽，再导出誊回各自的数据文件。
//
// ## 它编辑的是谁的数
// 路的数据故意没有集中成一张新表（那会造出第二份真相）：
//   · 城内街       Data_Tengxian.STREETS（axis/at/from/to —— 测试锁死格式）
//   · 东关巷路     Data_Tengxian.EAST_SUBURB.mapLanes
//   · 西关/北关大街 Data_Tengxian.WEST_SUBURB.westStreet / NORTH_SUBURB.street
//   · 津浦铁路     Data_Tengxian.WEST_SUBURB.railway 与 OUTFIELD_SCENES[*].railway
//   · 城外大车路   Script_TengxianOutfield.OUTFIELD_SCENES[*].roads.points
// 本面板把它们统一读成 [[x,z],...] 的控制点做预览编辑；导出的 JSON 里
// 每条路都带着 source，说明这串点该誊回哪个文件的哪个字段。
// **轴对齐的数据（STREETS 等）誊回去时仍要保持轴对齐**（两点、同轴）——
// 面板会在导出里对不再轴对齐的条目标警告，由人决定是改数据格式还是拉直。
//
// ## 预览 = 真几何
// 「重建预览」调的就是游戏里铺路那份 Script_RoadSpline（同一份代码、同一个
// groundAt），不是示意线 —— 面板里看到贴地的样子就是进游戏的样子。
// 预览网格抬高 0.02 m 盖在现路上，避免和已生成的路面 z-fight。
//
// ## 面板里的改动不落盘
// 与采样点编辑器同一条纪律：改动存 localStorage，刷新不丢；基线在源码里，
// 改完必须「导出」誊回数据文件。

import * as THREE from "three";
import {
  Panel, Section, ButtonRow, Chips, Slider, ListBox, Facts, Note, TextArea, Toggle,
} from "./Script_EditorUi.mjs";
import { PHASES } from "./Data_Battle.mjs";
import {
  STREETS, EAST_SUBURB, WEST_SUBURB, NORTH_SUBURB,
} from "./Data_Tengxian.mjs";
import { OutfieldSpec } from "./Script_TengxianOutfield.mjs";
import { MakeRoadPath } from "./Script_RoadPath.mjs";
import { BuildRoadRibbon, BuildRailBed, MakeCrownProfile } from "./Script_RoadSpline.mjs";

const STORE_KEY = "tz1938.roadRoutes.v1";

const KIND_COLOR = { street: 0xd9b45a, road: 0xc9a06a, railway: 0x8fa3b8 };

/** 出厂路线表：把散在各处的道路数据统一读成控制点。 */
function FactoryRoutes(levelId) {
  const routes = [];
  for (const s of STREETS) {
    routes.push({
      key: `city:${s.id}`, id: s.id, label: s.label || s.id, kind: "street",
      source: "Data_Tengxian.STREETS（axis/at/from/to，轴对齐，测试锁死）",
      width: s.width, crown: 0.11, skirt: 0.12,
      points: s.axis === "x"
        ? [[s.from, s.at], [s.to, s.at]] : [[s.at, s.from], [s.at, s.to]],
      axisLocked: true,
    });
  }
  for (const lane of EAST_SUBURB.mapLanes || []) {
    const horizontal = lane.w >= lane.d;
    routes.push({
      key: `eastLane:${lane.id}`, id: lane.id, label: lane.label || lane.id, kind: "street",
      source: "Data_Tengxian.EAST_SUBURB.mapLanes（x/z/w/d 矩形）",
      width: horizontal ? lane.d : lane.w, crown: 0.075, skirt: 0.25,
      points: horizontal
        ? [[lane.x - lane.w / 2, lane.z], [lane.x + lane.w / 2, lane.z]]
        : [[lane.x, lane.z - lane.d / 2], [lane.x, lane.z + lane.d / 2]],
      axisLocked: true,
    });
  }
  const ws = WEST_SUBURB.westStreet;
  if (ws) {
    routes.push({
      key: "west:street", id: "WestStreet", label: ws.label || "西关大街", kind: "street",
      source: "Data_Tengxian.WEST_SUBURB.westStreet（z/fromX/toX/width）",
      width: ws.width, crown: 0.22, skirt: 0.65,
      points: [[ws.fromX, ws.z], [ws.toX, ws.z]], axisLocked: true,
    });
  }
  const ns = NORTH_SUBURB.street;
  if (ns) {
    routes.push({
      key: "north:street", id: "NorthStreet", label: ns.label || "北关大街", kind: "street",
      source: "Data_Tengxian.NORTH_SUBURB.street（x/fromZ/toZ/width）",
      width: ns.width, crown: 0.22, skirt: 0.65,
      points: [[ns.x, ns.fromZ], [ns.x, ns.toZ]], axisLocked: true,
    });
  }
  const wr = WEST_SUBURB.railway;
  if (wr) {
    routes.push({
      key: "west:railway", id: "JinpuRailWest", label: "津浦铁路（城西段）", kind: "railway",
      source: "Data_Tengxian.WEST_SUBURB.railway（x/fromZ/toZ）",
      width: 6.8, lift: 0.46,
      points: [[wr.x, wr.fromZ], [wr.x, wr.toZ]], axisLocked: true,
    });
  }
  const spec = levelId ? OutfieldSpec(levelId) : null;
  if (spec) {
    (spec.roads || []).forEach((road, i) => {
      routes.push({
        key: `outfield:${spec.id}:road${i}`, id: `${spec.id}Road${i}`,
        label: `${spec.id} 大车路 ${i + 1}`, kind: "road",
        source: `Script_TengxianOutfield.OUTFIELD_SCENES.${spec.id}.roads[${i}].points`,
        width: road.width, crown: 0.045, skirt: 0.6,
        points: road.points.map((p) => [p[0], p[1]]), axisLocked: false,
      });
    });
    const rw = spec.railway;
    if (rw) {
      routes.push({
        key: `outfield:${spec.id}:railway`, id: `${spec.id}Rail`,
        label: `${spec.id} 津浦路路基`, kind: "railway",
        source: `Script_TengxianOutfield.OUTFIELD_SCENES.${spec.id}.railway（x/fromZ/toZ）`,
        width: 6.8, lift: 1.35,
        points: [[rw.x, rw.fromZ], [rw.x, rw.toZ]], axisLocked: true,
      });
    }
  }
  return routes;
}

export class RoadEditor {
  static id = "roads";
  static label = "道路样条";
  static hint = "铁路/道路/大街的样条中心线：预览、拖点、调宽、导出（数据仍在各源文件）";

  constructor(host) {
    this.host = host;
    this.cameraMode = "fly";
    this.panel = null;
    this.overrides = {};          // key → { width, points }
    this.kindFilter = "全部";
    this.mode = "select";
    this.selectedKey = null;
    this.selectedPoint = -1;
    this.showAll = true;
    this.showPreview = true;
    this.dirty = false;
    this.group = null;
    this.markers = [];
    this.raycaster = new THREE.Raycaster();
    this.Restore();
    this.routes = this.Collect();
    this.selectedKey = this.routes[0]?.key || null;
  }

  get levelId() {
    const phase = this.host.game.state.builtPhase;
    return PHASES[phase]?.id || null;
  }

  Collect() {
    const routes = FactoryRoutes(this.levelId);
    for (const route of routes) {
      const o = this.overrides[route.key];
      if (!o) continue;
      if (o.width) route.width = o.width;
      if (Array.isArray(o.points) && o.points.length >= 2) route.points = o.points;
      route.edited = true;
    }
    return routes;
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  Enter(root) {
    this.host.flycam.Open();
    this.host.SetViewmodelVisible(false);
    this.group = new THREE.Group();
    this.group.name = "RoadEditorOverlay";
    this.host.scene.add(this.group);
    this.panel = Panel({
      title: "道路样条编辑器",
      sub: "WASD+QE 飞 · 右键拖转头 · 左键按当前模式作用于路线",
      variant: "work wide",
      onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.FillList();
    if (this.selectedKey) this.Select(this.selectedKey, { fly: false });
    this.BuildOverlay();
    return this;
  }

  Exit() {
    this.Save();
    this.ClearOverlay(true);
    this.host.flycam.Close();
    this.host.SetViewmodelVisible(true);
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  Update(dt) {
    this.host.flycam.Update(dt);
    if (this.host.viewmodel?.root?.visible) this.host.SetViewmodelVisible(false);
    this.RefreshFacts();
  }

  // -------------------------------------------------------------------------
  // 界面
  // -------------------------------------------------------------------------

  BuildUi(body) {
    const list = Section(body, "路线");
    this.kindChips = Chips(list, ["全部",
      { value: "street", label: "大街" },
      { value: "road", label: "土路" },
      { value: "railway", label: "铁路" },
    ], this.kindFilter, (value) => { this.kindFilter = value; this.FillList(); });
    this.list = ListBox(list, { height: 180, onPick: (key) => this.Select(key) });
    Toggle(list, "叠加显示全部路线", this.showAll, (on) => {
      this.showAll = on; this.BuildOverlay();
    });
    Toggle(list, "显示路面预览（真几何）", this.showPreview, (on) => {
      this.showPreview = on; this.BuildOverlay();
    });
    Note(list, "城外大车路/铁路按当前关卡切片列出；切片外的路线看不到也编不了。");

    const edit = Section(body, "编辑");
    this.modeChips = Chips(edit, [
      { value: "select", label: "选点" },
      { value: "move", label: "移动" },
      { value: "insert", label: "插入" },
      { value: "delete", label: "删除" },
    ], this.mode, (value) => { this.mode = value; });
    this.widthSlider = Slider(edit, {
      label: "路宽", min: 1.5, max: 14, step: 0.1, value: 6,
      format: (v) => `${v.toFixed(1)} m`,
      onInput: (v) => this.PatchSelected((r) => { r.width = +v.toFixed(1); }),
    });
    ButtonRow(edit, [
      { label: "飞到该路线", onClick: () => this.FlyToSelected() },
      { label: "还原所选", onClick: () => this.RevertSelected() },
      { label: "全部还原出厂", onClick: () => this.RevertAll(), cls: "danger" },
    ]);
    Note(edit, "「选点」点控制点标记选中；「移动」把选中点挪到点击的地面；"
      + "「插入」在选中点之后加一个点；「删除」点掉一个控制点（至少留两个）。"
      + "轴对齐来源（城内街等）拖弯后导出会带警告 —— 那些数据格式只有直线。");

    const evidence = Section(body, "取证");
    this.facts = Facts(evidence);
    this.status = Note(evidence, "", true);

    const io = Section(body, "导出 / 导入");
    this.io = TextArea(io, {
      rows: 6, placeholder: "导出的 JSON 会出现在这里（含每条路该誊回的 source）",
    });
    ButtonRow(io, [
      { label: "导出改动 JSON", onClick: () => this.Export() },
      { label: "导入", onClick: () => this.Import() },
    ]);
    Note(io, "面板里的改动只存在浏览器里。**基线在源码里** —— 改完把 JSON 里的"
      + "点位誊回各自的数据文件（source 字段写明了去处），否则下次建城还是旧路。", true);
  }

  get selected() { return this.routes.find((r) => r.key === this.selectedKey) || null; }

  Visible() {
    return this.kindFilter === "全部"
      ? this.routes : this.routes.filter((r) => r.kind === this.kindFilter);
  }

  FillList() {
    if (!this.list) return;
    this.list.Fill(this.Visible().map((route) => ({
      id: route.key,
      name: `${route.edited ? "✎ " : ""}${route.label}`,
      tail: { street: "街", road: "路", railway: "铁" }[route.kind] || "",
      title: `${route.key}\n${route.source}`,
    })));
    this.list.Select(this.selectedKey);
  }

  Select(key, { fly = true } = {}) {
    const route = this.routes.find((r) => r.key === key);
    if (!route) return;
    this.selectedKey = key;
    this.selectedPoint = -1;
    this.list.Select(key);
    if (this.widthSlider) this.widthSlider.Set(route.width);
    if (fly) this.FlyToSelected();
    this.BuildOverlay();
  }

  FlyToSelected() {
    const route = this.selected;
    if (!route) return;
    const path = MakeRoadPath(route.points);
    const mid = path.At(path.length / 2);
    const y = this.GroundAt(mid.x, mid.z);
    this.host.camera.position.set(mid.x, y + 42, mid.z + 34);
    this.host.flycam.yaw = Math.PI;
    this.host.flycam.pitch = -0.85;
    this.host.camera.rotation.set(-0.85, Math.PI, 0, "YXZ");
  }

  // -------------------------------------------------------------------------
  // 地面与拾取
  // -------------------------------------------------------------------------

  GroundAt(x, z) {
    const field = this.host.game.battlefield;
    const y = field && field.GroundHeight ? field.GroundHeight(x, z) : null;
    return Number.isFinite(y) ? y : 0;
  }

  /** 相机射线打到解析地形上（步进 + 二分；没有网格 raycast，地形是解析式的）。 */
  GroundHit(event) {
    const rect = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.host.camera);
    const { origin, direction } = this.raycaster.ray;
    let prevT = 0;
    let prevAbove = origin.y - this.GroundAt(origin.x, origin.z);
    if (prevAbove <= 0) return null;
    for (let t = 4; t < 2200; t += 4) {
      const x = origin.x + direction.x * t;
      const y = origin.y + direction.y * t;
      const z = origin.z + direction.z * t;
      const above = y - this.GroundAt(x, z);
      if (above <= 0) {
        // 二分细化
        let lo = prevT, hi = t;
        for (let i = 0; i < 18; i += 1) {
          const m = (lo + hi) / 2;
          const mx = origin.x + direction.x * m;
          const my = origin.y + direction.y * m;
          const mz = origin.z + direction.z * m;
          if (my - this.GroundAt(mx, mz) > 0) lo = m; else hi = m;
        }
        const ft = (lo + hi) / 2;
        return { x: origin.x + direction.x * ft, z: origin.z + direction.z * ft };
      }
      prevT = t;
      prevAbove = above;
    }
    return null;
  }

  OnClick(event, button) {
    if (button !== 0) return;
    const route = this.selected;
    if (!route) return;
    if (this.mode === "select" || this.mode === "delete") {
      const rect = this.host.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.host.camera);
      const hits = this.raycaster.intersectObjects(this.markers, false);
      if (!hits.length) { this.host.SetHint("没点到控制点标记"); return; }
      const index = hits[0].object.userData.pointIndex;
      if (this.mode === "select") {
        this.selectedPoint = index;
        this.BuildOverlay();
      } else {
        if (route.points.length <= 2) { this.host.SetHint("至少要留两个控制点"); return; }
        this.PatchSelected((r) => { r.points.splice(index, 1); });
        this.selectedPoint = -1;
      }
      return;
    }
    const hit = this.GroundHit(event);
    if (!hit) { this.host.SetHint("射线没打到地面"); return; }
    const point = [+hit.x.toFixed(1), +hit.z.toFixed(1)];
    if (this.mode === "move") {
      if (this.selectedPoint < 0) { this.host.SetHint("先用「选点」选一个控制点"); return; }
      this.PatchSelected((r) => { r.points[this.selectedPoint] = point; });
    } else if (this.mode === "insert") {
      const at = this.selectedPoint >= 0 ? this.selectedPoint + 1 : route.points.length;
      this.PatchSelected((r) => { r.points.splice(at, 0, point); });
      this.selectedPoint = at;
    }
  }

  PatchSelected(mutate) {
    const route = this.selected;
    if (!route) return;
    mutate(route);
    route.edited = true;
    this.overrides[route.key] = {
      width: route.width, points: route.points.map((p) => [p[0], p[1]]),
    };
    this.dirty = true;
    this.Save();
    this.FillList();
    this.BuildOverlay();
  }

  // -------------------------------------------------------------------------
  // 叠加显示
  // -------------------------------------------------------------------------

  ClearOverlay(remove = false) {
    if (!this.group) return;
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
    this.markers = [];
    if (remove) {
      this.host.scene.remove(this.group);
      this.group = null;
    }
  }

  BuildOverlay() {
    if (!this.group) return;
    this.ClearOverlay();
    const shown = this.showAll ? this.routes : (this.selected ? [this.selected] : []);
    for (const route of shown) {
      const path = MakeRoadPath(route.points);
      const pts = [];
      const n = Math.max(8, Math.round(path.length / 3));
      for (let i = 0; i <= n; i += 1) {
        const p = path.At((path.length * i) / n);
        pts.push(new THREE.Vector3(p.x, this.GroundAt(p.x, p.z) + 0.5, p.z));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: KIND_COLOR[route.kind] || 0xffffff,
          transparent: true,
          opacity: route.key === this.selectedKey ? 1.0 : 0.45,
        }));
      line.renderOrder = 900;
      this.group.add(line);
    }
    const route = this.selected;
    if (!route) return;
    // 控制点标记
    route.points.forEach((p, i) => {
      const y = this.GroundAt(p[0], p[1]);
      const selectedNow = i === this.selectedPoint;
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.4, 1.4),
        new THREE.MeshBasicMaterial({ color: selectedNow ? 0xff5040 : 0xffd070 }));
      marker.position.set(p[0], y + 0.9, p[1]);
      marker.userData.pointIndex = i;
      marker.renderOrder = 901;
      this.group.add(marker);
      this.markers.push(marker);
    });
    // 真几何预览
    if (this.showPreview) {
      const geoms = [];
      const collector = {
        Add: (material, geometry) => geoms.push(geometry),
        Solid: () => {}, SetSector: () => {},
      };
      const path = MakeRoadPath(route.points);
      const groundAt = (x, z) => this.GroundAt(x, z) + 0.02;
      try {
        if (route.kind === "railway") {
          const crown = MakeCrownProfile(path, {
            groundAt, step: 4, smooth: route.lift < 1 ? 4 : 0, lift: route.lift ?? 1.35,
          });
          BuildRailBed(collector, {
            path, groundAt, crownAt: crown.At, topHalf: 3.4,
            step: 4, chunkLen: 1e9, seed: `preview:${route.key}`,
          });
        } else {
          BuildRoadRibbon(collector, {
            path, width: route.width, groundAt,
            crown: route.crown ?? 0.05, skirtDrop: route.skirt ?? 0.5,
            step: 4, chunkLen: 1e9, seed: `preview:${route.key}`,
          });
        }
      } catch (error) {
        console.warn("[RoadEditor] 预览生成失败：", error);
      }
      const material = new THREE.MeshStandardMaterial({
        color: KIND_COLOR[route.kind] || 0xd8c49a, roughness: 1.0,
        transparent: true, opacity: 0.85,
      });
      for (const geometry of geoms) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 899;
        this.group.add(mesh);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 还原 / 存取
  // -------------------------------------------------------------------------

  RevertSelected() {
    const route = this.selected;
    if (!route) return;
    delete this.overrides[route.key];
    this.dirty = true;
    this.Save();
    this.routes = this.Collect();
    this.FillList();
    this.Select(route.key, { fly: false });
    this.host.SetHint(`已还原 ${route.label}`);
  }

  RevertAll() {
    this.overrides = {};
    this.dirty = false;
    try { window.localStorage.removeItem(STORE_KEY); } catch (error) { /* 无痕模式 */ }
    this.routes = this.Collect();
    this.selectedPoint = -1;
    this.FillList();
    this.BuildOverlay();
    this.host.SetHint("已还原全部路线");
  }

  Save() {
    if (!this.dirty) return;
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(this.overrides));
    } catch (error) { /* 无痕模式：存不下就算了 */ }
  }

  Restore() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && typeof data === "object") {
        this.overrides = data;
        this.dirty = true;
      }
    } catch (error) { /* 存坏了就用出厂表 */ }
  }

  IsAxisAligned(points) {
    if (points.length !== 2) return false;
    return Math.abs(points[0][0] - points[1][0]) < 0.01
      || Math.abs(points[0][1] - points[1][1]) < 0.01;
  }

  Export() {
    const edited = this.routes.filter((r) => this.overrides[r.key]);
    if (!edited.length) {
      this.io.value = "（没有改动 —— 面板里改过的路线才会出现在导出里）";
      return;
    }
    this.io.value = JSON.stringify(edited.map((r) => ({
      key: r.key, id: r.id, source: r.source, width: r.width, points: r.points,
      ...(r.axisLocked && !this.IsAxisAligned(r.points)
        ? { warning: "源数据是轴对齐格式，这串点已不再是轴对齐两点 —— 誊回前要么拉直、要么改数据格式" }
        : {}),
    })), null, 1);
    this.io.select();
    this.host.SetHint(`已导出 ${edited.length} 条改动`);
  }

  Import() {
    let list = null;
    try {
      list = JSON.parse(this.io.value);
    } catch (error) {
      this.host.SetHint("解析不了：这里只吃导出的那种 JSON 数组");
      return;
    }
    if (!Array.isArray(list) || !list.length) { this.host.SetHint("空表，没有导入"); return; }
    let count = 0;
    for (const item of list) {
      if (!item.key || !Array.isArray(item.points) || item.points.length < 2) continue;
      this.overrides[item.key] = { width: item.width, points: item.points };
      count += 1;
    }
    this.dirty = true;
    this.Save();
    this.routes = this.Collect();
    this.FillList();
    this.BuildOverlay();
    this.host.SetHint(`已导入 ${count} 条路线改动`);
  }

  // -------------------------------------------------------------------------
  // 读数
  // -------------------------------------------------------------------------

  RefreshFacts() {
    if (!this.facts) return;
    const camera = this.host.camera;
    this.facts.Set("相机 X / Z",
      `${camera.position.x.toFixed(1)} / ${camera.position.z.toFixed(1)}`);
    const ground = this.GroundAt(camera.position.x, camera.position.z);
    this.facts.Set("地高", `${ground.toFixed(2)} m`);
    const route = this.selected;
    if (route) {
      const path = MakeRoadPath(route.points);
      this.facts.Set("路线", `${route.label} · ${route.width.toFixed(1)} m 宽`);
      this.facts.Set("长度 / 控制点", `${path.length.toFixed(0)} m / ${route.points.length} 点`);
      this.facts.Set("选中点", this.selectedPoint >= 0
        ? `#${this.selectedPoint} (${route.points[this.selectedPoint][0]}, ${route.points[this.selectedPoint][1]})`
        : "无");
    }
    const messages = [];
    if (this.dirty) messages.push("有未导出的改动 —— 基线在源码里，记得誊回去");
    const sel = this.selected;
    if (sel && sel.axisLocked && !this.IsAxisAligned(sel.points)) {
      messages.push("这条路的源数据是轴对齐格式，弯过的点位誊不回去（导出里有警告）");
    }
    this.status.textContent = messages.join(" · ");
    this.status.classList.toggle("warn", messages.length > 0);
  }
}

export default RoadEditor;
