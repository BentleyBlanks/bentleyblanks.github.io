// 采样点编辑器：把 Data_SamplePoints 那张表摆到面板上，逐点预览、微调、增删、导出。
//
// ## 为什么要有它
// 采样点是「隔一段时间再拍一次同一批机位」的基线（见 Data_SamplePoints 顶部）。
// 基线的价值全在**机位准不准**：埋进墙里的一张、对着屋顶背面的一张，
// 拍多少轮都是废图。而机位准不准只有站到那儿看一眼才知道 ——
// 这个面板就是那一眼，同时是把「看着调好」的位姿原样存回表里的唯一出口。
//
// ## 与出图脚本共用一份口径
// Script_SamplePointShot 出图时不另算机位：它开的就是这个编辑器，
// 逐点调 ApplyPointById()。所以**面板里看到的就是将来那张图**，
// 不存在「编辑器里好好的、出图出来是另一个角度」这种事。
//
// ## 面板里的改动不落盘
// 改完必须「导出」再誊回 Data_SamplePoints.mjs。会话内的改动存在 localStorage，
// 刷新不丢，但那不是基线 —— 基线在源码里。面板上用黄字写着这一条。

import {
  Panel, Section, Row, ButtonRow, Chips, Slider, ListBox, Facts, Note, TextArea, Toggle,
} from "./Script_EditorUi.mjs";
import { SAMPLE_POINTS, SAMPLE_GROUPS } from "./Data_SamplePoints.mjs";
import {
  ResolvePoint, OrderedPoints, ValidatePoints, SerializePoints, YawTo, InPhaseBounds, GroupLabel,
  PhaseFor, OVERVIEW_KEY,
} from "./Script_SamplePoints.mjs";

const STORE_KEY = "tz1938.samplePoints.v1";

/** 深拷贝一份出厂表：面板改的是副本，源码那份永远是干净的。 */
function FactoryList() {
  return SAMPLE_POINTS.map((point) => ({ ...point, aim: point.aim ? [...point.aim] : undefined }));
}

export class SamplePointEditor {
  static id = "samplePoints";
  static label = "采样点";
  static hint = "县城固定机位：逐点预览、微调、增删、导出（出图脚本用的就是这张表）";

  constructor(host) {
    this.host = host;
    this.cameraMode = "fly";
    this.panel = null;
    this.points = FactoryList();
    this.selectedId = this.points[0]?.id || null;
    this.groupFilter = "全部";
    this.followPhase = true;
    this.dirty = false;
    this.Restore();
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  Enter(root) {
    this.host.flycam.Open();
    this.host.SetViewmodelVisible(false);
    this.panel = Panel({
      title: "采样点编辑器",
      sub: "WASD+QE 飞 · 左键拖转头",
      variant: "work wide",
      onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.FillList();
    if (this.selectedId) this.Select(this.selectedId, { move: false });
    return this;
  }

  Exit() {
    this.Save();
    this.host.flycam.Close();
    this.host.SetViewmodelVisible(true);
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  Update(dt) {
    this.host.flycam.Update(dt);
    // 换关装配的一环会把视图模型重新点亮（见 SceneEditor 里同一条账）
    if (this.host.viewmodel?.root?.visible) this.host.SetViewmodelVisible(false);
    this.RefreshFacts();
  }

  // -------------------------------------------------------------------------
  // 界面
  // -------------------------------------------------------------------------

  BuildUi(body) {
    // --- 点位表 ---
    const list = Section(body, "点位");
    this.groupChips = Chips(list,
      ["全部", ...SAMPLE_GROUPS.map((g) => ({ value: g.id, label: g.label }))],
      this.groupFilter, (value) => { this.groupFilter = value; this.FillList(); });
    this.list = ListBox(list, { height: 220, onPick: (id) => this.Select(id) });
    this.phaseToggle = Toggle(list, "跟随点位切关卡", this.followPhase, (on) => {
      this.followPhase = on;
      if (on) this.EnsurePhase();
    });
    Note(list, "仅显示当前切片内的点位。");

    // --- 位姿 ---
    const pose = Section(body, "位姿");
    this.heightMode = Chips(pose, [
      { value: "ground", label: "离地高度" }, { value: "absolute", label: "绝对高度" },
    ], "ground", (value) => this.SetHeightMode(value));
    this.heightSlider = Slider(pose, {
      label: "高度", min: 0.4, max: 60, step: 0.1, value: 1.7,
      format: (v) => `${v.toFixed(1)} m`,
      onInput: (v) => this.PatchSelected((p) => {
        if (p.y != null) p.y = v; else p.h = v;
      }, { move: true }),
    });
    this.pitchSlider = Slider(pose, {
      label: "俯仰", min: -1.2, max: 1.2, step: 0.01, value: 0,
      format: (v) => `${(v * 57.2958).toFixed(0)}°`,
      onInput: (v) => this.PatchSelected((p) => { p.pitch = v; }, { move: true }),
    });
    this.yawSlider = Slider(pose, {
      label: "朝向", min: -3.14, max: 3.14, step: 0.01, value: 0,
      format: (v) => `${(v * 57.2958).toFixed(0)}°`,
      onInput: (v) => this.PatchSelected((p) => { p.yaw = v; delete p.aim; }, { move: true }),
    });
    this.fovSlider = Slider(pose, {
      label: "FOV", min: 25, max: 100, step: 1, value: 55,
      format: (v) => `${v.toFixed(0)}°`,
      onInput: (v) => this.PatchSelected((p) => { p.fov = v; }, { move: true }),
    });
    this.farSlider = Slider(pose, {
      label: "远裁剪面", min: 200, max: 2500, step: 20, value: 620,
      format: (v) => `${v.toFixed(0)} m`,
      onInput: (v) => this.PatchSelected((p) => { p.far = v; }, { move: true }),
    });
    ButtonRow(pose, [
      { label: "回到该点", onClick: () => this.Select(this.selectedId) },
      { label: "取当前相机", onClick: () => this.CaptureFromCamera() },
      { label: "对准目标", onClick: () => this.AimAtTarget() },
    ]);

    // --- 增删 ---
    const edit = Section(body, "增删");
    ButtonRow(edit, [
      { label: "新增（当前相机）", onClick: () => this.AddAtCamera() },
      { label: "复制所选", onClick: () => this.DuplicateSelected() },
      { label: "删除所选", onClick: () => this.DeleteSelected(), cls: "danger" },
    ]);
    ButtonRow(edit, [
      { label: "还原所选", onClick: () => this.RevertSelected() },
      { label: "全部还原出厂", onClick: () => this.RevertAll(), cls: "danger" },
    ]);
    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.placeholder = "点位中文名";
    for (const type of ["keydown", "keyup", "keypress"]) {
      this.nameInput.addEventListener(type, (e) => e.stopPropagation());
    }
    this.nameInput.addEventListener("change", () => {
      this.PatchSelected((p) => { p.label = this.nameInput.value.trim() || p.id; });
      this.FillList();
    });
    Row(edit, "名称", this.nameInput);
    this.noteInput = document.createElement("input");
    this.noteInput.type = "text";
    this.noteInput.placeholder = "为什么要拍这一张";
    for (const type of ["keydown", "keyup", "keypress"]) {
      this.noteInput.addEventListener(type, (e) => e.stopPropagation());
    }
    this.noteInput.addEventListener("change", () => {
      this.PatchSelected((p) => { p.note = this.noteInput.value.trim(); });
    });
    Row(edit, "说明", this.noteInput);

    // --- 取证 ---
    const evidence = Section(body, "取证");
    this.facts = Facts(evidence, ["当前切片", "点位总数"]);
    this.status = Note(evidence, "", true);

    // --- 导出 ---
    const io = Section(body, "导出 / 导入");
    this.io = TextArea(io, { rows: 6, placeholder: "导出的 JSON 会出现在这里；也可以粘一份进来再点「导入」" });
    ButtonRow(io, [
      { label: "导出 JSON", onClick: () => this.Export("json") },
      { label: "导出 mjs 片段", onClick: () => this.Export("mjs") },
      { label: "导入", onClick: () => this.Import() },
    ]);
    Note(io, "导出后保存到源码才会永久生效。");
  }

  // -------------------------------------------------------------------------
  // 表与选择
  // -------------------------------------------------------------------------

  get selected() { return this.points.find((p) => p.id === this.selectedId) || null; }

  Visible() {
    const ordered = OrderedPoints(this.points);
    return this.groupFilter === "全部"
      ? ordered : ordered.filter((p) => p.group === this.groupFilter);
  }

  FillList() {
    if (!this.list) return;
    const problems = new Set();
    for (const message of ValidatePoints(this.points)) {
      const id = message.split("：")[0];
      problems.add(id);
    }
    this.list.Fill(this.Visible().map((point) => ({
      id: point.id,
      name: `${problems.has(point.id) ? "⚠ " : ""}${point.label}`,
      tail: `${point.phase}`,
      title: `${point.id} · ${PhaseFor(point.phase)?.label || ""}\n${point.note || ""}`,
    })));
    this.list.Select(this.selectedId);
  }

  Select(id, { move = true } = {}) {
    const point = this.points.find((p) => p.id === id);
    if (!point) return null;
    this.selectedId = id;
    this.list.Select(id);
    const resolved = ResolvePoint(point);
    if (this.nameInput) this.nameInput.value = resolved.label;
    if (this.noteInput) this.noteInput.value = resolved.note;
    if (this.heightMode) this.heightMode.Set(resolved.y != null ? "absolute" : "ground");
    if (this.heightSlider) this.heightSlider.Set(resolved.y != null ? resolved.y : resolved.h);
    if (this.pitchSlider) this.pitchSlider.Set(resolved.pitch);
    if (this.yawSlider) this.yawSlider.Set(resolved.yaw);
    if (this.fovSlider) this.fovSlider.Set(resolved.fov ?? 55);
    if (this.farSlider) this.farSlider.Set(resolved.far ?? this.host.camera.far);
    if (move) {
      if (this.followPhase) this.EnsurePhase();
      this.ApplyPose(resolved);
    }
    return resolved;
  }

  /**
   * 现在建的是哪一片，按**点位表的 phase 口径**说（序号，或者 `"overview"`）。
   * 装配层的 `game.PHASES` 就是当场那张 PHASE_TABLE：`?phase=overview` 下它只有一条。
   */
  BuiltPhaseKey() {
    const built = this.host.game.state.builtPhase ?? 0;
    const here = this.host.game.PHASES?.[built];
    return here && here.id === "Overview" ? OVERVIEW_KEY : built;
  }

  /** 点位不在当前切片里就换切片。换关要十几秒，所以只在真的不一样时动。 */
  EnsurePhase() {
    const point = this.selected;
    if (!point) return false;
    const phase = point.phase ?? OVERVIEW_KEY;
    if (this.BuiltPhaseKey() === phase) return false;
    // 全城俯瞰不是 PHASE_TABLE 里的一关（`?phase=overview` 是**整表替换**），
    // 当场跳不过去 —— 只能重载页面。这里什么都不做，由 RefreshFacts 把话说清楚。
    if (typeof phase !== "number") return false;
    this.host.game.JumpToLevel(phase);
    return true;
  }

  // -------------------------------------------------------------------------
  // 相机
  // -------------------------------------------------------------------------

  GroundAt(x, z) {
    const field = this.host.game.battlefield;
    const y = field && field.GroundHeight ? field.GroundHeight(x, z) : null;
    return Number.isFinite(y) ? y : 0;
  }

  /**
   * 没写 fov / far 的点位要退回**这一关的出厂值**，不能沿用上一个点位改过的那份。
   * 不这么做的话「拍完俯瞰（far 1800）再拍街景」和「单拍街景」出来的雾不一样 ——
   * 一批图里混进一个顺序依赖，整批就不可比了。
   */
  BaseFov() { return this.host.game.graphics?.fov ?? 55; }
  BaseFar(phase) { return PhaseFor(phase)?.cameraFar ?? 620; }

  /**
   * 把一份解析过的位姿装到相机上。**出图脚本走的也是这一条**。
   * @returns 真正落到相机上的那几个数（出图清单里要记下来）
   */
  ApplyPose(resolved) {
    const camera = this.host.camera;
    const ground = resolved.y != null ? null : this.GroundAt(resolved.x, resolved.z);
    const y = resolved.y != null ? resolved.y : ground + resolved.h;
    camera.position.set(resolved.x, y, resolved.z);
    this.host.flycam.yaw = resolved.yaw;
    this.host.flycam.pitch = resolved.pitch;
    camera.rotation.set(resolved.pitch, resolved.yaw, 0, "YXZ");
    camera.fov = resolved.fov != null ? resolved.fov : this.BaseFov();
    camera.far = resolved.far != null ? resolved.far : this.BaseFar(resolved.phase);
    camera.updateProjectionMatrix();
    return {
      id: resolved.id, x: resolved.x, y, z: resolved.z,
      yaw: resolved.yaw, pitch: resolved.pitch,
      fov: camera.fov, far: camera.far, ground,
      phase: resolved.phase, sky: resolved.sky || null,
    };
  }

  /** 出图脚本的唯一入口：换切片（如果需要）→ 装位姿 → 把实际参数交回去。 */
  ApplyPointById(id) {
    const point = this.points.find((p) => p.id === id);
    if (!point) return null;
    this.selectedId = id;
    if (this.list) this.list.Select(id);
    const resolved = ResolvePoint(point);
    return this.ApplyPose(resolved);
  }

  /** 出图脚本读表用（拿的是面板里这一份，含未导出的改动）。 */
  Points() { return OrderedPoints(this.points); }

  CaptureFromCamera() {
    const point = this.selected;
    if (!point) return;
    const camera = this.host.camera;
    const x = +camera.position.x.toFixed(2);
    const z = +camera.position.z.toFixed(2);
    const absolute = point.y != null;
    this.PatchSelected((p) => {
      p.x = x; p.z = z;
      if (absolute) p.y = +camera.position.y.toFixed(2);
      else p.h = +(camera.position.y - this.GroundAt(x, z)).toFixed(2);
      p.yaw = +this.host.flycam.yaw.toFixed(4);
      p.pitch = +this.host.flycam.pitch.toFixed(4);
      delete p.aim;
    }, { move: false });
    this.Select(this.selectedId, { move: false });
    this.host.SetHint("已把当前机位写回所选点位（记得导出）");
  }

  /** 有 aim 的点位：站着不动，只把朝向重新对回目标。 */
  AimAtTarget() {
    const point = this.selected;
    if (!point) return;
    if (!point.aim) {
      this.host.SetHint("这个点位没有写 aim（看向哪里），只能手调朝向");
      return;
    }
    this.PatchSelected((p) => { delete p.yaw; }, { move: true });
  }

  PatchSelected(mutate, { move = false } = {}) {
    const point = this.selected;
    if (!point) return;
    mutate(point);
    this.dirty = true;
    this.Save();
    if (move) this.ApplyPose(ResolvePoint(point));
  }

  SetHeightMode(mode) {
    const point = this.selected;
    if (!point) return;
    const resolved = ResolvePoint(point);
    if (mode === "absolute") {
      const ground = this.GroundAt(resolved.x, resolved.z);
      point.y = +(resolved.y != null ? resolved.y : ground + resolved.h).toFixed(2);
      delete point.h;
    } else {
      const ground = this.GroundAt(resolved.x, resolved.z);
      point.h = +((resolved.y != null ? resolved.y : ground + resolved.h) - ground).toFixed(2);
      delete point.y;
    }
    this.dirty = true;
    this.Save();
    this.Select(this.selectedId, { move: false });
  }

  // -------------------------------------------------------------------------
  // 增删
  // -------------------------------------------------------------------------

  UniqueId(base) {
    let id = base.replace(/[^A-Za-z0-9_]/g, "") || "Point";
    if (!/^[A-Za-z]/.test(id)) id = `P${id}`;
    let candidate = id;
    let n = 2;
    while (this.points.some((p) => p.id === candidate)) { candidate = `${id}${n}`; n += 1; }
    return candidate;
  }

  AddAtCamera() {
    const camera = this.host.camera;
    const x = +camera.position.x.toFixed(2);
    const z = +camera.position.z.toFixed(2);
    const group = this.groupFilter === "全部" ? "Landmark" : this.groupFilter;
    const id = this.UniqueId(`${group}_New`);
    const phase = this.BuiltPhaseKey();
    this.points.push({
      id, label: id, group, phase, x, z,
      h: +(camera.position.y - this.GroundAt(x, z)).toFixed(2),
      yaw: +this.host.flycam.yaw.toFixed(4),
      pitch: +this.host.flycam.pitch.toFixed(4),
      note: "",
    });
    this.dirty = true;
    this.Save();
    this.FillList();
    this.Select(id, { move: false });
    this.host.SetHint(`新增点位 ${id}（记得改名并导出）`);
  }

  DuplicateSelected() {
    const point = this.selected;
    if (!point) return;
    const id = this.UniqueId(`${point.id}_2`);
    const copy = { ...point, id, label: `${point.label || point.id}（副本）` };
    if (point.aim) copy.aim = [...point.aim];
    this.points.splice(this.points.indexOf(point) + 1, 0, copy);
    this.dirty = true;
    this.Save();
    this.FillList();
    this.Select(id, { move: false });
  }

  DeleteSelected() {
    const point = this.selected;
    if (!point) return;
    const index = this.points.indexOf(point);
    this.points.splice(index, 1);
    this.dirty = true;
    this.Save();
    this.selectedId = this.points[Math.min(index, this.points.length - 1)]?.id || null;
    this.FillList();
    if (this.selectedId) this.Select(this.selectedId, { move: false });
  }

  RevertSelected() {
    const point = this.selected;
    if (!point) return;
    const factory = SAMPLE_POINTS.find((p) => p.id === point.id);
    if (!factory) { this.host.SetHint("这是新增的点位，出厂表里没有它"); return; }
    this.points[this.points.indexOf(point)] = {
      ...factory, aim: factory.aim ? [...factory.aim] : undefined,
    };
    this.Save();
    this.FillList();
    this.Select(point.id);
  }

  RevertAll() {
    this.points = FactoryList();
    this.dirty = false;
    try { window.localStorage.removeItem(STORE_KEY); } catch (error) { /* 无痕模式 */ }
    this.selectedId = this.points[0]?.id || null;
    this.FillList();
    if (this.selectedId) this.Select(this.selectedId);
    this.host.SetHint("已还原出厂点位表");
  }

  // -------------------------------------------------------------------------
  // 存取
  // -------------------------------------------------------------------------

  Save() {
    if (!this.dirty) return;
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(this.points));
    } catch (error) { /* 无痕模式：存不下就算了，不该因此炸掉编辑器 */ }
  }

  Restore() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length) {
        this.points = list;
        this.dirty = true;
        this.selectedId = list[0].id;
      }
    } catch (error) { /* 存坏了就用出厂表 */ }
  }

  Export(kind) {
    const ordered = OrderedPoints(this.points);
    this.io.value = kind === "mjs"
      ? SerializePoints(this.points)
      : JSON.stringify(ordered.map((p) => ({
        id: p.id, label: p.label, group: p.group, phase: p.phase,
        x: p.x, z: p.z, ...(p.y != null ? { y: p.y } : { h: p.h }),
        ...(p.aim ? { aim: p.aim } : { yaw: +p.yaw.toFixed(4) }),
        pitch: p.pitch, ...(p.fov ? { fov: p.fov } : {}), ...(p.far ? { far: p.far } : {}),
        ...(p.sky ? { sky: p.sky } : {}), note: p.note,
      })), null, 1);
    this.io.select();
    this.host.SetHint(`已导出 ${ordered.length} 个点位到下面的文本框`);
  }

  Import() {
    let list = null;
    try {
      list = JSON.parse(this.io.value);
    } catch (error) {
      this.host.SetHint("解析不了：这里只吃 JSON 数组");
      return;
    }
    if (!Array.isArray(list) || !list.length) { this.host.SetHint("空表，没有导入"); return; }
    this.points = list;
    this.dirty = true;
    this.Save();
    this.selectedId = list[0].id;
    this.FillList();
    this.Select(this.selectedId);
    this.host.SetHint(`已导入 ${list.length} 个点位`);
  }

  // -------------------------------------------------------------------------
  // 读数
  // -------------------------------------------------------------------------

  RefreshFacts() {
    if (!this.facts) return;
    const camera = this.host.camera;
    const point = this.selected;
    const resolved = point ? ResolvePoint(point) : null;
    this.facts.Set("相机 X / Z", `${camera.position.x.toFixed(1)} / ${camera.position.z.toFixed(1)}`);
    this.facts.Set("相机 Y", `${camera.position.y.toFixed(2)} m`);
    const ground = this.GroundAt(camera.position.x, camera.position.z);
    this.facts.Set("地高 / 离地", `${ground.toFixed(2)} / ${(camera.position.y - ground).toFixed(2)} m`);
    this.facts.Set("朝向 / 俯仰",
      `${(this.host.flycam.yaw * 57.2958).toFixed(0)}° / ${(this.host.flycam.pitch * 57.2958).toFixed(0)}°`);
    this.facts.Set("FOV / 远面", `${camera.fov.toFixed(0)}° / ${camera.far.toFixed(0)} m`);
    const built = this.BuiltPhaseKey();
    this.facts.Set("当前切片", `${built} ${PhaseFor(built)?.label || ""}`);
    this.facts.Set("点位总数", `${this.points.length}${this.dirty ? " · 已改动" : ""}`);
    if (!resolved) { this.status.textContent = "没有选中点位"; return; }
    const messages = [];
    if (built !== resolved.phase) {
      messages.push(resolved.phase === OVERVIEW_KEY
        ? "请用 ?phase=overview 打开总览。"
        : `请切换到${PhaseFor(resolved.phase)?.label || resolved.phase}。`);
    }
    if (!InPhaseBounds(resolved)) messages.push("点位超出当前切片");
    if (this.dirty) messages.push("改动待导出");
    this.status.textContent = messages.join(" · ");
    this.status.classList.toggle("warn", messages.length > 0);
  }
}

export default SamplePointEditor;
