// 昼夜关键帧时间轴（docs/Data_Environment.md §8.4）：白盒编辑器底部，环境面板「⏱」打开。
//
// 左边按组件列参数，右边是同一根 24 小时时间轴：数值画曲线、颜色画渐变条、枚举画分段，关键帧是菱形。
// 拖时间轴上的任意空处 = 拨时间（场景跟着变）。点一行选中它，那一行展开成大的曲线编辑：
//   拖菱形左右挪时刻（数值参数还能上下拖改值）· 双击空处在那一刻插一帧 · Delete 删选中的帧；
//   选中帧时时间指针跳到那一帧，右侧面板里改值就是改这一帧（同 tag 的联动帧一起改）。
// 「复制此刻整列 / 粘贴为关键帧」：把这一刻全部变化参数的值抄到另一个时刻（例如把 22:00 的夜复制到 04:00）。
// 只认 DOM 与 canvas；改动全走控制器的 EditPreset（进撤销栈）。

import { ENV_COMPONENTS } from "./Data_EnvComponents.mjs";
import { ENV_RUNTIME } from "./Data_Tuning_Environment.mjs";
import {
  CloneValue, EvalParamValue, HexToRgb01, IsTrack, LinearToSrgb, MoveKey, RemoveKey, SetKeyAt, SetKeyValue, WrapHour,
} from "./Script_EnvTrack.mjs";
import { El, IconButton, FormatHour, GuardPanelEvents } from "./Script_EditorEnvironmentViews.mjs";

const LANE_H = 22;
const LANE_OPEN_H = 120;
const SAMPLES = 96;

function CssColor(param, value) {
  if (param.kind === "color") return value;
  if (param.kind === "rgb") {
    const max = Math.max(1e-6, ...value);
    const n = value.map((v) => Math.min(1, Math.max(0, v) / Math.max(1, max)));
    return `rgb(${n.map((v) => Math.round(LinearToSrgb(v) * 255)).join(",")})`;
  }
  return "#888";
}

function Luma(param, value) {
  if (param.kind === "color") { const c = HexToRgb01(value) || [0, 0, 0]; return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  if (param.kind === "rgb") return 0.2126 * value[0] + 0.7152 * value[1] + 0.0722 * value[2];
  return value;
}

export class EnvTimelinePanel {
  constructor(editor) {
    this.editor = editor;
    this.open = false;
    this.rows = [];
    this.selectedKey = null;   // { type, key, index }
    this.drag = null;
    this.column = null;
    this.api = this.BuildApi();
  }

  get presetId() { return this.editor.SelectedPresetId(); }
  get preset() { return this.editor.PresetDoc(this.presetId); }
  get hour() { return this.editor.hour; }
  get selected() { return this.editor.ui.timelineParam || null; }

  Mount(parent) {
    const root = this.root = El("div", "envTimeline");
    root.hidden = true;
    GuardPanelEvents(root, (e) => this.OnKey(e));
    const head = El("div", "envTlHead");
    this.elTitle = El("span", "envTlTitle", "昼夜时间轴");
    this.elPreset = El("span", "envTlPreset");
    this.elClock = El("span", "envTlClock");
    this.onlyAnimated = El("input", "envCheck");
    this.onlyAnimated.type = "checkbox";
    this.onlyAnimated.checked = true;
    this.onlyAnimated.addEventListener("change", () => this.Changed({ structure: true }));
    const onlyLabel = El("label", "envTlOnly");
    onlyLabel.append(this.onlyAnimated, El("span", "", "只看有关键帧的"));
    this.elHint = El("span", "envTlHint");
    // 选中那一行的插值方式（缓入缓出 / 线性 / 保持前一帧）
    this.interp = El("select", "envSelect envTlInterp");
    for (const [value, label] of [["smooth", "缓入缓出"], ["linear", "线性"], ["step", "保持"]]) {
      const o = El("option", "", label); o.value = value; this.interp.appendChild(o);
    }
    this.interp.title = "选中这一行关键帧之间怎么插";
    this.interp.addEventListener("change", () => this.SetInterp(this.interp.value));
    head.append(this.elTitle, this.elPreset, this.elClock, onlyLabel, this.interp,
      IconButton("⇩", "复制此刻整列（这份预设里所有关键帧参数在时间指针处的值）", () => this.CopyColumn()),
      IconButton("⇧", "把复制的整列粘贴成时间指针处的关键帧", () => this.PasteColumn()),
      this.elHint,
      IconButton("×", "关闭时间轴", () => this.Close(), "envClose"));
    const body = this.body = El("div", "envTlBody");
    this.labels = El("div", "envTlLabels");
    this.lanes = El("div", "envTlLanes");
    this.ruler = El("div", "envTlRuler");
    for (let h = 0; h <= 24; h += 1) {
      const tick = El("span", `envTlTick${h % 3 === 0 ? " major" : ""}`);
      tick.style.left = `${h / 24 * 100}%`;
      if (h % 3 === 0 && h < 24) tick.appendChild(El("b", "", `${h}`));
      this.ruler.appendChild(tick);
    }
    this.looks = El("div", "envTlLooks");
    this.ruler.appendChild(this.looks);
    this.playhead = El("div", "envTlPlayhead");
    this.laneList = El("div", "envTlLaneList");
    this.lanes.append(this.ruler, this.laneList, this.playhead);
    this.labels.appendChild(El("div", "envTlLabelHead", "组件 / 参数"));
    this.labelList = El("div", "envTlLabelList");
    this.labels.appendChild(this.labelList);
    body.append(this.labels, this.lanes);
    // 左右两栏一起滚
    this.lanes.addEventListener("scroll", () => { this.labels.scrollTop = this.lanes.scrollTop; this.SyncCursor(); });
    this.labels.addEventListener("scroll", () => { this.lanes.scrollTop = this.labels.scrollTop; });
    this.lanes.addEventListener("pointerdown", (e) => this.OnPointerDown(e));
    this.lanes.addEventListener("dblclick", (e) => this.OnDoubleClick(e));
    window.addEventListener("pointermove", (e) => this.OnPointerMove(e));
    window.addEventListener("pointerup", (e) => this.OnPointerUp(e));
    root.append(head, body);
    parent.appendChild(root);
  }

  Open({ presetId = null, type = null, key = null } = {}) {
    if (presetId) this.editor.ui.preset = presetId;
    if (type && key) this.editor.ui.timelineParam = `${type}.${key}`;
    this.editor.ui.timeline = true;
    this.editor.SaveUi();
    this.open = true;
    this.root.hidden = false;
    this.editor.editor.ui.root.classList.add("envTimelineOpen");
    this.editor.btnTimeline?.classList.add("on");
    this.Changed({ structure: true });
    if (type && key) requestAnimationFrame(() => this.rows.find((r) => r.id === `${type}.${key}`)?.lane.scrollIntoView({ block: "nearest" }));
    return this.State();
  }

  Close({ remember = false } = {}) {
    if (!remember) { this.editor.ui.timeline = false; this.editor.SaveUi(); }
    this.open = false;
    if (this.root) this.root.hidden = true;
    this.editor.editor.ui.root.classList.remove("envTimelineOpen");
    this.editor.btnTimeline?.classList.remove("on");
    return this.State();
  }

  Toggle() { return this.open ? this.Close() : this.Open(); }

  /** 预设或时间变了。structure：行要重建（换预设、加删组件、固定值 / 关键帧切换）。 */
  Changed({ structure = false } = {}) {
    if (!this.open) return;
    const sig = this.Signature();
    if (structure || sig !== this.sig) { this.sig = sig; this.BuildRows(); }
    this.Draw();
  }

  Signature() {
    const preset = this.preset;
    if (!preset) return "";
    const parts = [this.presetId, this.onlyAnimated.checked, this.selected];
    for (const decl of ENV_COMPONENTS) {
      const comp = preset.components?.[decl.type];
      if (!comp) continue;
      parts.push(decl.type, ...decl.params.map((p) => (IsTrack(comp.params?.[p.key]) ? `${p.key}*` : p.key)));
    }
    return parts.join("|");
  }

  BuildRows() {
    this.labelList.textContent = "";
    this.laneList.textContent = "";
    this.rows = [];
    const preset = this.preset;
    this.elPreset.textContent = preset ? `· ${preset.id}` : "· 没有预设";
    this.looks.textContent = "";
    for (const look of preset?.looks || []) {
      const mark = El("span", "envTlLook", look.label);
      mark.style.left = `${look.hour / 24 * 100}%`;
      this.looks.appendChild(mark);
    }
    if (!preset) return;
    for (const decl of ENV_COMPONENTS) {
      const comp = preset.components?.[decl.type];
      if (!comp) continue;
      const params = decl.params.filter((p) => p.animatable !== false && (!this.onlyAnimated.checked || IsTrack(comp.params?.[p.key])));
      if (!params.length) continue;
      const groupLabel = El("div", "envTlGroup", `${decl.icon} ${decl.label}`);
      const groupLane = El("div", "envTlGroupLane");
      this.labelList.appendChild(groupLabel);
      this.laneList.appendChild(groupLane);
      for (const param of params) {
        const id = `${decl.type}.${param.key}`;
        const open = this.selected === id;
        const label = El("div", `envTlLabel${open ? " selected" : ""}`, param.label);
        label.style.height = `${open ? LANE_OPEN_H : LANE_H}px`;
        label.title = id;
        label.addEventListener("click", () => this.Select(decl.type, param.key));
        const lane = El("div", `envTlLane${open ? " open" : ""}`);
        lane.style.height = `${open ? LANE_OPEN_H : LANE_H}px`;
        const canvas = El("canvas", "envTlCanvas");
        lane.appendChild(canvas);
        lane.dataset.id = id;
        this.labelList.appendChild(label);
        this.laneList.appendChild(lane);
        this.rows.push({ id, decl, param, label, lane, canvas, open });
      }
    }
    if (!this.rows.length) this.laneList.appendChild(El("div", "envEmpty", this.onlyAnimated.checked ? "这份预设还没有随时间变化的参数：在组件卡片上把参数切成「关键帧」，或取消「只看有关键帧的」" : "这份预设没有组件"));
  }

  Select(type, key) {
    const id = `${type}.${key}`;
    this.editor.ui.timelineParam = this.selected === id ? null : id;
    this.editor.SaveUi();
    this.selectedKey = null;
    this.Changed({ structure: true });
  }

  Raw(row) { return this.preset?.components?.[row.decl.type]?.params?.[row.param.key]; }

  /** 这一行的纵向范围：关键帧值的范围（加点余量），没有就用声明的 min / max。 */
  Range(row, raw) {
    const p = row.param;
    if (p.kind !== "number" && p.kind !== "angle") return [0, 1];
    let lo = p.min ?? 0, hi = p.max ?? 1;
    if (IsTrack(raw)) {
      const vs = raw.keys.map((k) => k.v);
      const a = Math.min(...vs), b = Math.max(...vs);
      const pad = Math.max((b - a) * 0.15, (hi - lo) * 0.02, 1e-6);
      lo = Math.max(p.min ?? -Infinity, a - pad); hi = Math.min(p.max ?? Infinity, b + pad);
      if (!(hi > lo)) { lo = a - 1; hi = b + 1; }
    }
    return [lo, hi];
  }

  Draw() {
    if (!this.open) return;
    this.SyncCursor();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const row of this.rows) {
      const { canvas, lane, param } = row;
      const w = Math.max(10, lane.clientWidth), h = Math.max(10, lane.clientHeight);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
      const g = canvas.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const raw = this.Raw(row);
      const track = IsTrack(raw);
      const pad = row.open ? 10 : 4;
      if (param.kind === "color" || param.kind === "rgb") {
        const top = row.open ? h * 0.3 : 3, height = row.open ? h * 0.4 : h - 6;
        for (let i = 0; i < SAMPLES; i += 1) {
          const v = EvalParamValue(param, raw, (i + 0.5) / SAMPLES * 24);
          g.fillStyle = CssColor(param, v);
          g.fillRect(Math.floor(i / SAMPLES * w), top, Math.ceil(w / SAMPLES) + 1, height);
        }
        if (row.open) {
          // 亮度曲线（rgb 是 HDR，看颜色看不出强弱）
          const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => Luma(param, EvalParamValue(param, raw, i / SAMPLES * 24)));
          const max = Math.max(1e-6, ...samples);
          g.strokeStyle = "#e6cb91aa"; g.lineWidth = 1; g.beginPath();
          samples.forEach((v, i) => { const x = i / SAMPLES * w, y = h - pad - (v / max) * (h - pad * 2); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
          g.stroke();
        }
      } else if (param.kind === "enum" || param.kind === "bool") {
        let last = null, start = 0;
        const label = (v) => param.options?.find((o) => o.value === v)?.label ?? String(v);
        for (let i = 0; i <= SAMPLES; i += 1) {
          const v = i < SAMPLES ? EvalParamValue(param, raw, (i + 0.5) / SAMPLES * 24) : Symbol("end");
          if (v !== last) {
            if (last !== null) {
              const x0 = start / SAMPLES * w, x1 = i / SAMPLES * w;
              g.fillStyle = "#c1bdab22"; g.fillRect(x0 + 1, 3, x1 - x0 - 2, h - 6);
              g.fillStyle = "#deddd2"; g.font = "11px sans-serif"; g.textBaseline = "middle";
              g.fillText(label(last), x0 + 5, h / 2, Math.max(0, x1 - x0 - 8));
            }
            last = v; start = i;
          }
        }
      } else {
        const [lo, hi] = this.Range(row, raw);
        const Y = (v) => h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2);
        if (row.open) {
          g.fillStyle = "#989b8b"; g.font = "10px monospace"; g.textBaseline = "top";
          g.fillText(String(+hi.toPrecision(4)), 4, 2);
          g.textBaseline = "bottom";
          g.fillText(String(+lo.toPrecision(4)), 4, h - 2);
        }
        g.strokeStyle = track ? "#edca83" : "#aaa99b88"; g.lineWidth = row.open ? 1.6 : 1.2; g.beginPath();
        let prev = null;
        for (let i = 0; i <= SAMPLES; i += 1) {
          const v = EvalParamValue(param, raw, i / SAMPLES * 24);
          const x = i / SAMPLES * w, y = Y(v);
          // 角度过 0 / 360 那一下不画竖线（值是连续的，只是回绕）
          if (i && !(param.kind === "angle" && Math.abs(v - prev) > 180)) g.lineTo(x, y); else g.moveTo(x, y);
          prev = v;
        }
        g.stroke();
      }
      if (track) {
        raw.keys.forEach((k, index) => {
          const x = k.h / 24 * w;
          const y = (param.kind === "number" || param.kind === "angle") ? (() => { const [lo, hi] = this.Range(row, raw); return h - pad - ((k.v - lo) / (hi - lo)) * (h - pad * 2); })() : h / 2;
          const sel = this.selectedKey && this.selectedKey.id === row.id && this.selectedKey.index === index;
          const r = row.open ? 5.5 : 4;
          g.save(); g.translate(x, y); g.rotate(Math.PI / 4);
          g.fillStyle = sel ? "#ffe0a1" : (k.tag ? "#e6cb91" : "#deddd2");
          g.strokeStyle = "#11120e"; g.lineWidth = 1.2;
          g.fillRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4); g.strokeRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4);
          g.restore();
        });
      } else if (!row.open) {
        g.fillStyle = "#989b8b"; g.font = "10px sans-serif"; g.textBaseline = "middle"; g.fillText("固定", 4, h / 2);
      }
    }
  }

  SetInterp(interp) {
    const row = this.rows.find((r) => r.id === this.selected);
    if (!row || !IsTrack(this.Raw(row))) return false;
    const ok = this.editor.EditPreset(this.presetId, `${row.id} 插值改成 ${interp}`, (doc) => {
      const raw = doc.components[row.decl.type].params[row.param.key];
      if (IsTrack(raw)) raw.interp = interp;
    });
    this.Draw();
    return ok;
  }

  SyncCursor() {
    if (!this.open) return;
    const row = this.rows.find((r) => r.id === this.selected);
    const raw = row ? this.Raw(row) : null;
    this.interp.disabled = !IsTrack(raw);
    if (IsTrack(raw) && document.activeElement !== this.interp) this.interp.value = raw.interp || "smooth";
    // 指针按时间轴那一栏的实际宽度摆（右边留了滚动条的空），竖着跟着滚动走
    this.playhead.style.left = `${this.hour / 24 * this.laneList.clientWidth}px`;
    this.playhead.style.top = `${this.lanes.scrollTop}px`;
    this.playhead.style.height = `${this.lanes.clientHeight}px`;
    this.elClock.textContent = FormatHour(this.hour);
    this.elHint.textContent = this.selectedKey ? `选中 ${this.selectedKey.id} @ ${FormatHour(this.KeyOf(this.selectedKey)?.h ?? 0)} · 在右侧面板改值 · Delete 删帧` : (this.selected ? "拖菱形挪帧 · 双击插帧" : "点一行展开 · 拖时间轴拨时间");
  }

  KeyOf(sel) {
    const row = this.rows.find((r) => r.id === sel?.id);
    const raw = row ? this.Raw(row) : null;
    return IsTrack(raw) ? raw.keys[sel.index] : null;
  }

  // --- 鼠标 -------------------------------------------------------------------

  HourAt(e) {
    const r = this.laneList.getBoundingClientRect();
    return WrapHour(Math.max(0, Math.min(23.999, (e.clientX - r.left) / Math.max(1, r.width) * 24)));
  }

  HitKey(e) {
    const lane = e.target.closest?.(".envTlLane");
    const row = lane ? this.rows.find((r) => r.lane === lane) : null;
    if (!row) return null;
    const raw = this.Raw(row);
    if (!IsTrack(raw)) return { row, index: -1 };
    const rect = lane.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const pad = row.open ? 10 : 4;
    let best = -1, bestD = 9;
    raw.keys.forEach((k, i) => {
      const kx = k.h / 24 * rect.width;
      let ky = rect.height / 2;
      if (row.param.kind === "number" || row.param.kind === "angle") { const [lo, hi] = this.Range(row, raw); ky = rect.height - pad - ((k.v - lo) / (hi - lo)) * (rect.height - pad * 2); }
      const d = Math.hypot(kx - x, row.open ? ky - y : 0);
      if (d < bestD) { bestD = d; best = i; }
    });
    return { row, index: best, rect, pad };
  }

  OnPointerDown(e) {
    if (e.button !== 0) return;
    const hit = this.HitKey(e);
    if (hit && hit.index >= 0) {
      const key = this.Raw(hit.row).keys[hit.index];
      this.selectedKey = { id: hit.row.id, index: hit.index };
      this.editor.system.SetHour(key.h);
      this.editor.SyncTime();
      this.editor.SyncViews();
      this.drag = { kind: "key", row: hit.row, index: hit.index, startX: e.clientX, startY: e.clientY, moved: false, rect: hit.rect, pad: hit.pad };
      e.preventDefault();
      this.Draw();
      return;
    }
    this.selectedKey = null;
    this.drag = { kind: "scrub" };
    this.editor.system.SetHour(this.HourAt(e));
    this.editor.SyncTime();
    this.Draw();
  }

  OnPointerMove(e) {
    if (!this.drag) return;
    if (this.drag.kind === "scrub") { this.editor.system.SetHour(this.HourAt(e)); this.editor.SyncTime(); this.SyncCursor(); return; }
    const d = this.drag;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 3) return;
    d.moved = true;
    const row = d.row, param = row.param;
    const hour = Math.round(this.HourAt(e) * 12) / 12;   // 5 分钟一格
    this.editor.EditPreset(this.presetId, `挪 ${row.id} 的帧`, (doc) => {
      const comp = doc.components[row.decl.type];
      let track = comp.params[param.key];
      if (!IsTrack(track)) return;
      track = MoveKey(track, d.index, hour);
      if (row.open && (param.kind === "number" || param.kind === "angle") && e.shiftKey === false) {
        const [lo, hi] = this.Range(row, comp.params[param.key]);
        const y = e.clientY - d.rect.top;
        let v = lo + (1 - (y - d.pad) / Math.max(1, d.rect.height - d.pad * 2)) * (hi - lo);
        if (param.min !== undefined) v = Math.max(param.min, v);
        if (param.max !== undefined) v = Math.min(param.max, v);
        const step = param.step || 0.01;
        track = SetKeyValue(track, d.index, Math.round(v / step) * step);
      }
      comp.params[param.key] = track;
    }, { merge: `tlkey:${row.id}:${d.index}` });
    const key = this.KeyOf({ id: row.id, index: d.index });
    if (key) { this.editor.system.SetHour(key.h); this.editor.SyncTime(); }
    this.Draw();
  }

  OnPointerUp() { this.drag = null; }

  OnDoubleClick(e) {
    const hit = this.HitKey(e);
    if (!hit || hit.index >= 0) return;
    const row = hit.row, param = row.param;
    const hour = Math.round(this.HourAt(e) * 12) / 12;
    this.editor.EditPreset(this.presetId, `在 ${FormatHour(hour)} 给 ${row.id} 插帧`, (doc) => {
      const comp = doc.components[row.decl.type];
      const raw = comp.params[param.key];
      if (!IsTrack(raw)) return;
      comp.params[param.key] = SetKeyAt(raw, hour, EvalParamValue(param, raw, hour), { snapH: 0 }).track;
    });
    this.editor.system.SetHour(hour);
    this.editor.SyncTime();
    this.Changed();
  }

  OnKey(e) {
    if ((e.code === "Delete" || e.code === "Backspace") && this.selectedKey) {
      e.preventDefault();
      const sel = this.selectedKey;
      const row = this.rows.find((r) => r.id === sel.id);
      if (!row) return true;
      this.editor.EditPreset(this.presetId, `删 ${row.id} 的帧`, (doc) => {
        const comp = doc.components[row.decl.type];
        if (IsTrack(comp.params[row.param.key])) comp.params[row.param.key] = RemoveKey(comp.params[row.param.key], sel.index);
      });
      this.selectedKey = null;
      this.Changed();
      return true;
    }
    return this.editor.OnKey(e);
  }

  // --- 整列 -------------------------------------------------------------------

  CopyColumn() {
    const preset = this.preset;
    if (!preset) return null;
    const values = {};
    for (const decl of ENV_COMPONENTS) {
      const comp = preset.components?.[decl.type];
      if (!comp) continue;
      for (const param of decl.params) if (IsTrack(comp.params?.[param.key])) values[`${decl.type}.${param.key}`] = CloneValue(EvalParamValue(param, comp.params[param.key], this.hour));
    }
    this.column = { hour: this.hour, values };
    this.editor.Flash(`已复制 ${FormatHour(this.hour)} 的整列（${Object.keys(values).length} 个参数）`);
    return this.column;
  }

  PasteColumn() {
    if (!this.column) { this.editor.Flash("还没复制整列", true); return false; }
    const hour = this.hour;
    const ok = this.editor.EditPreset(this.presetId, `整列粘贴到 ${FormatHour(hour)}`, (doc) => {
      for (const [id, value] of Object.entries(this.column.values)) {
        const [type, key] = id.split(".");
        const comp = doc.components[type];
        if (!comp || !IsTrack(comp.params?.[key])) continue;
        comp.params[key] = SetKeyAt(comp.params[key], hour, value, { snapH: ENV_RUNTIME.keySnapH }).track;
      }
    });
    this.Changed();
    return ok;
  }

  State() {
    return { open: this.open, preset: this.presetId, selected: this.selected, selectedKey: this.selectedKey ? { ...this.selectedKey } : null, rows: this.rows.map((r) => r.id), column: this.column ? { hour: this.column.hour, count: Object.keys(this.column.values).length } : null };
  }

  BuildApi() {
    return {
      Open: (opts) => this.Open(opts || {}),
      Close: () => this.Close(),
      State: () => this.State(),
      Select: (type, key) => { this.Select(type, key); return this.State(); },
      CopyColumn: () => this.CopyColumn(),
      PasteColumn: () => this.PasteColumn(),
      OnlyAnimated: (on) => { this.onlyAnimated.checked = !!on; this.Changed({ structure: true }); return this.State(); },
      SetInterp: (interp) => this.SetInterp(interp),
    };
  }

  Dispose() { this.root?.remove(); }
}
