// 白盒编辑器「布设微调」（docs/Data_EditorBlockout.md §4.4）：纯逻辑，零 three、零 DOM。
//
// 用户在全关总图里点「编辑布设」，把地标、体块、当前关键帧的人 / 要点 / 下一步目标、各关键帧的玩家站位
// 拖到想要的地方，再在图上插几个带文字的说明标记，最后一键导出成一段文字贴给 agent。
// **不存盘**：改动只活在这一页里（关掉页面就没了），也不动 3D 场景；agent 读了导出的文字去改配置 / 生成器。
//
// 这里只管：一份改动记录（LayoutEditSession：挪了谁、从哪到哪、标记、撤销 / 重做），
// 以及记录 → 导出对象（BuildLayoutEditExport）→ 文字（FormatLayoutEdit，末行「数据：」是 JSON）→ 解析回来（ParseLayoutEdit）。
//
// 坐标口径同配置：x 向东为正、z 向南为正（米）；yawDeg 0 = 朝北、+90 = 朝西；体块 / 地标的 ry 是弧度（同场景文件）。

export const LAYOUT_EDIT_SCHEMA = "tengxian-blockout-layout-edit/1";
export const LAYOUT_EDIT_DATA_PREFIX = "数据：";
export const LAYOUT_EDIT_UNDO_LIMIT = 200;
/** 挪动量取整到这个米数（拖的时候挪动量按它吸附，坐标本身不吸附；导出两位小数）。 */
export const LAYOUT_EDIT_STEP_M = 0.1;
/** 标记附近列出来的东西：多远以内、最多几个。 */
export const LAYOUT_EDIT_NEAR = Object.freeze({ radiusM: 15, max: 4 });
/** 「已采纳」判定：数据里的位置离改到的位置这么近就当 agent 已经改好了，这条从记录里拿掉。 */
export const LAYOUT_EDIT_APPLIED_M = 0.06;

/**
 * 能挪的东西。file：改哪份文件（scene = Blockout/<Level>.scene.json，config = Blockout/<Level>.json，layout = 游戏布局表）；
 * perKeyframe：同一个 id 在不同关键帧里是不同的记录（人、要点、下一步目标）。
 * rot：朝向字段（yawDeg 度 / ry 弧度 / 没有）。
 */
export const LAYOUT_EDIT_KINDS = Object.freeze({
  landmark: Object.freeze({ label: "地标", file: "scene", perKeyframe: false, rot: "ry" }),
  block: Object.freeze({ label: "体块", file: "scene", perKeyframe: false, rot: "ry" }),
  unit: Object.freeze({ label: "人", file: "config", perKeyframe: true, rot: "yawDeg" }),
  poi: Object.freeze({ label: "要点", file: "config", perKeyframe: true, rot: null }),
  next: Object.freeze({ label: "下一步目标", file: "config", perKeyframe: true, rot: null }),
  station: Object.freeze({ label: "玩家站位", file: "config", perKeyframe: true, rot: "yawDeg" }),
});

const SIDE_TEXT = Object.freeze({ nra: "友", ija: "敌", civ: "百姓" });
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

const Num = (v) => typeof v === "number" && Number.isFinite(v);
function RoundTo(v, digits) { const k = 10 ** digits; return Math.round(v * k) / k; }
function Fixed(v, digits) { return Num(v) ? v.toFixed(digits) : "?"; }
function WrapDeg(deg) { let d = ((deg + 180) % 360 + 360) % 360 - 180; if (d === -180) d = 180; return d; }
function Clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function RadToDeg(r) { return r * 180 / Math.PI; }

/** 一条记录的键：kind | 关键帧 id（只对 perKeyframe 的）| id。 */
export function LayoutEditKey(ref) {
  const kind = LAYOUT_EDIT_KINDS[ref?.kind];
  if (!kind) throw new Error(`LayoutEditKey：不认识的 kind ${ref?.kind}`);
  return `${ref.kind}|${kind.perKeyframe ? String(ref.keyframeId ?? "") : ""}|${String(ref.id ?? "")}`;
}

/** 取整到 LAYOUT_EDIT_STEP_M（挪动量、新标记的落点用）。 */
export function SnapM(v, step = LAYOUT_EDIT_STEP_M) { return RoundTo(Math.round(v / step) * step, 3); }

function Pose(src, rot) {
  const out = { x: RoundTo(src.x, 3), z: RoundTo(src.z, 3) };
  if (rot === "yawDeg" && Num(src.yawDeg)) out.yawDeg = RoundTo(WrapDeg(src.yawDeg), 2);
  if (rot === "ry" && Num(src.ry)) out.ry = RoundTo(src.ry, 4);
  return out;
}

function SamePose(a, b, tol = 1e-6) {
  if (!a || !b) return false;
  if (Math.abs(a.x - b.x) > tol || Math.abs(a.z - b.z) > tol) return false;
  if (Num(a.yawDeg) || Num(b.yawDeg)) { if (Math.abs(WrapDeg((a.yawDeg || 0) - (b.yawDeg || 0))) > 1e-3) return false; }
  if (Num(a.ry) || Num(b.ry)) { if (Math.abs((a.ry || 0) - (b.ry || 0)) > 1e-5) return false; }
  return true;
}

/**
 * 一关的改动记录。
 *   moves：键（LayoutEditKey）→ { kind, id, keyframeId, name, path, meta, from, to }
 *     from = 数据里原来的位置（第一次挪时记下，之后不变）；to = 现在挪到的地方。to 回到 from = 这条删掉。
 *   markers：[{ n, x, z, radiusM, text }]（n 从 1 起，删了不重排号，导出时按顺序）
 * 每次「一步」（一次拖动、一次输入、加 / 删标记）进撤销栈；拖动中途用 Live*，松手 Commit。
 */
export class LayoutEditSession {
  constructor(levelKey = "") {
    this.levelKey = String(levelKey || "");
    this.moves = new Map();
    this.markers = [];
    this.nextMarkerN = 1;
    this.undo = [];
    this.redo = [];
    this.pending = null;     // 拖动中：开始前的状态
    this.revision = 0;       // 每改一次 +1（界面据此刷新）
  }

  get moveCount() { return this.moves.size; }
  get markerCount() { return this.markers.length; }
  get empty() { return !this.moves.size && !this.markers.length; }
  get canUndo() { return this.undo.length > 0; }
  get canRedo() { return this.redo.length > 0; }

  State() {
    return { moves: [...this.moves.entries()].map(([k, v]) => [k, Clone(v)]), markers: Clone(this.markers), nextMarkerN: this.nextMarkerN };
  }
  Restore(state) {
    this.moves = new Map(state.moves.map(([k, v]) => [k, Clone(v)]));
    this.markers = Clone(state.markers);
    this.nextMarkerN = state.nextMarkerN;
    this.revision++;
  }

  /** 开始一步（拖动开始）。已经开着就不重开。 */
  Begin() { if (!this.pending) this.pending = this.State(); }
  /** 结束这一步：有变化就进撤销栈。→ 有没有变化。 */
  Commit() {
    const before = this.pending;
    this.pending = null;
    if (!before) return false;
    const after = this.State();
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.undo.push(before);
    if (this.undo.length > LAYOUT_EDIT_UNDO_LIMIT) this.undo.shift();
    this.redo = [];
    return true;
  }
  /** 放弃这一步（Esc 中断拖动）：回到开始前。 */
  Cancel() { if (this.pending) { this.Restore(this.pending); this.pending = null; } }
  /** 一步做完（不是拖动的那些操作）。 */
  Step(fn) { this.Begin(); try { fn(); } finally { this.Commit(); } }

  Undo() {
    if (this.pending) this.Cancel();
    const prev = this.undo.pop();
    if (!prev) return false;
    this.redo.push(this.State());
    this.Restore(prev);
    return true;
  }
  Redo() {
    if (this.pending) this.Cancel();
    const next = this.redo.pop();
    if (!next) return false;
    this.undo.push(this.State());
    this.Restore(next);
    return true;
  }

  /** ref 现在在哪（挪过 → to，否则 ref 自己的位置）。 */
  Resolve(ref) {
    const m = this.moves.get(LayoutEditKey(ref));
    return m ? { ...m.to } : Pose(ref, LAYOUT_EDIT_KINDS[ref.kind]?.rot);
  }
  Moved(ref) { return this.moves.has(LayoutEditKey(ref)); }
  MoveOf(ref) { const m = this.moves.get(LayoutEditKey(ref)); return m ? Clone(m) : null; }

  /**
   * 把 ref 挪到 to（{x, z, yawDeg?, ry?}；缺的字段沿用现在的）。不进撤销栈（外面包 Begin / Commit 或 Step）。
   * ref：{ kind, id, keyframeId?, name?, path?, meta?, x, z, yawDeg?, ry? }（x / z / 朝向 = 数据里原来的值）。
   */
  Set(ref, to) {
    const kind = LAYOUT_EDIT_KINDS[ref?.kind];
    if (!kind || !Num(ref.x) || !Num(ref.z)) return false;
    const key = LayoutEditKey(ref);
    const existing = this.moves.get(key);
    const from = existing ? existing.from : Pose(ref, kind.rot);
    const cur = existing ? existing.to : from;
    const next = { ...cur };
    if (Num(to?.x)) next.x = RoundTo(to.x, 3);
    if (Num(to?.z)) next.z = RoundTo(to.z, 3);
    if (kind.rot === "yawDeg" && Num(to?.yawDeg)) next.yawDeg = RoundTo(WrapDeg(to.yawDeg), 2);
    if (kind.rot === "ry" && Num(to?.ry)) next.ry = RoundTo(to.ry, 4);
    if (SamePose(next, from)) { if (existing) { this.moves.delete(key); this.revision++; } return true; }
    this.moves.set(key, {
      kind: ref.kind, id: String(ref.id), keyframeId: kind.perKeyframe ? String(ref.keyframeId ?? "") : null,
      name: ref.name || existing?.name || "", path: ref.path || existing?.path || "", meta: Clone(ref.meta ?? existing?.meta ?? null),
      from, to: next,
    });
    this.revision++;
    return true;
  }

  /**
   * 整组平移：每个 ref 都按 (dx, dz) 从「拖动开始时的位置」挪。starts：与 refs 同序的起点（Resolve 的结果）。
   * 吸附的是挪动量（整 0.1 m），不是坐标：没往 x 方向挪的东西 x 一位不变。
   */
  Translate(refs, starts, dx, dz) {
    const sx = SnapM(dx), sz = SnapM(dz);
    refs.forEach((ref, i) => {
      const s = starts[i];
      if (s) this.Set(ref, { x: s.x + sx, z: s.z + sz });
    });
  }

  /** 还原一条（回到数据里的位置）。 */
  Reset(ref) {
    const key = LayoutEditKey(ref);
    if (!this.moves.has(key)) return false;
    this.moves.delete(key);
    this.revision++;
    return true;
  }
  /** 全部清掉（挪动和标记）。 */
  Clear() {
    if (this.empty) return false;
    this.moves.clear();
    this.markers = [];
    this.nextMarkerN = 1;
    this.revision++;
    return true;
  }

  AddMarker({ x, z, radiusM = 0, text = "" }) {
    if (!Num(x) || !Num(z)) return null;
    const marker = { n: this.nextMarkerN++, x: SnapM(x), z: SnapM(z), radiusM: Num(radiusM) && radiusM > 0 ? RoundTo(radiusM, 1) : 0, text: String(text || "") };
    this.markers.push(marker);
    this.revision++;
    return { ...marker };
  }
  Marker(n) { const m = this.markers.find(q => q.n === n); return m ? { ...m } : null; }
  UpdateMarker(n, patch = {}) {
    const m = this.markers.find(q => q.n === n);
    if (!m) return false;
    if (Num(patch.x)) m.x = RoundTo(patch.x, 3);
    if (Num(patch.z)) m.z = RoundTo(patch.z, 3);
    if (Num(patch.radiusM)) m.radiusM = patch.radiusM > 0 ? RoundTo(patch.radiusM, 1) : 0;
    if (typeof patch.text === "string") m.text = patch.text;
    this.revision++;
    return true;
  }
  RemoveMarker(n) {
    const i = this.markers.findIndex(q => q.n === n);
    if (i < 0) return false;
    this.markers.splice(i, 1);
    this.revision++;
    return true;
  }

  /**
   * 数据重读之后（agent 改了 JSON / 重跑了生成器）：`current(move)` 给出这条记录对应的东西现在在数据里的位置（找不到 → null）。
   * 现在的位置已经等于改到的位置 → 当作已采纳，拿掉；数据里的位置变了但还没到 → 把 from 更新成新的数据位置。
   * → 拿掉了几条。不进撤销栈（撤销栈里旧的 from 也不追了：撤销只回到「改动记录」的旧样子）。
   */
  Reconcile(current) {
    let applied = 0;
    for (const [key, m] of [...this.moves.entries()]) {
      const now = current(m);
      if (!now || !Num(now.x) || !Num(now.z)) continue;
      const rot = LAYOUT_EDIT_KINDS[m.kind].rot;
      const pose = Pose(now, rot);
      const near = Math.hypot(pose.x - m.to.x, pose.z - m.to.z) <= LAYOUT_EDIT_APPLIED_M
        && (rot !== "yawDeg" || !Num(m.to.yawDeg) || Math.abs(WrapDeg((pose.yawDeg || 0) - m.to.yawDeg)) < 0.6)
        && (rot !== "ry" || !Num(m.to.ry) || Math.abs((pose.ry || 0) - m.to.ry) < 0.01);
      if (near) { this.moves.delete(key); applied++; continue; }
      if (!SamePose(pose, m.from)) m.from = pose;
    }
    if (applied) this.revision++;
    return applied;
  }
}

// ---------------------------------------------------------------------------
// 导出

function DirText(dx, dz) {
  const parts = [];
  if (Math.abs(dx) >= 0.005) parts.push(`往${dx > 0 ? "东" : "西"} ${Math.abs(dx).toFixed(2).replace(/\.?0+$/, "")} m`);
  if (Math.abs(dz) >= 0.005) parts.push(`往${dz > 0 ? "南" : "北"} ${Math.abs(dz).toFixed(2).replace(/\.?0+$/, "")} m`);
  return parts.join("、") || "位置没变";
}

/** 方位（从 a 看 b）：八方位 + 距离。 */
function BearingWord(dx, dz) {
  const ang = Math.atan2(dx, -dz) * 180 / Math.PI;   // 0 = 北，顺时针
  const names = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return names[((Math.round(ang / 45) % 8) + 8) % 8];
}

/**
 * 记录 → 导出对象（只有数字和字符串）。
 * @param {LayoutEditSession} session
 * @param {object} ctx
 *   level { key, label, configPath, scenePath? }   keyframe { id, index }（当前，给 agent 定位用）
 *   near(marker) → [{ kind, id, name, x, z }]：标记附近的东西候选（不用自己筛距离，这里按 LAYOUT_EDIT_NEAR 筛）
 *   view { cx, cz, spanM } | null    url
 */
export function BuildLayoutEditExport(session, ctx = {}) {
  const moves = [...session.moves.values()].map((m) => {
    const kind = LAYOUT_EDIT_KINDS[m.kind];
    const out = {
      kind: m.kind, id: m.id, name: m.name || "", file: kind.file,
      ...(kind.perKeyframe ? { keyframe: m.keyframeId } : {}),
      path: m.path || "",
      from: RoundPose(m.from), to: RoundPose(m.to),
      dx: RoundTo(m.to.x - m.from.x, 2), dz: RoundTo(m.to.z - m.from.z, 2),
    };
    if (kind.rot === "yawDeg" && Num(m.to.yawDeg) && Num(m.from.yawDeg) && Math.abs(WrapDeg(m.to.yawDeg - m.from.yawDeg)) > 0.05) out.dYawDeg = RoundTo(WrapDeg(m.to.yawDeg - m.from.yawDeg), 1);
    if (kind.rot === "ry" && Num(m.to.ry) && Num(m.from.ry) && Math.abs(m.to.ry - m.from.ry) > 1e-4) out.dRyDeg = RoundTo(RadToDeg(m.to.ry - m.from.ry), 1);
    if (m.meta) out.meta = Clone(m.meta);
    return out;
  });
  // 排序：场景（地标、体块）在前，配置按关键帧、再按种类
  const kindOrder = Object.keys(LAYOUT_EDIT_KINDS);
  moves.sort((a, b) => (a.file === b.file ? 0 : a.file === "scene" ? -1 : 1)
    || String(a.keyframe ?? "").localeCompare(String(b.keyframe ?? ""), "en", { numeric: true })
    || kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind)
    || a.id.localeCompare(b.id, "en", { numeric: true }));
  const markers = session.markers.map((m, i) => {
    const cands = typeof ctx.near === "function" ? (ctx.near(m) || []) : [];
    const near = cands.filter(c => c && Num(c.x) && Num(c.z))
      .map(c => ({ kind: c.kind, id: String(c.id ?? ""), name: c.name || "", distM: RoundTo(Math.hypot(c.x - m.x, c.z - m.z), 1), dir: BearingWord(c.x - m.x, c.z - m.z) }))
      .filter(c => c.distM <= Math.max(LAYOUT_EDIT_NEAR.radiusM, (m.radiusM || 0) + 3))
      .sort((a, b) => a.distM - b.distM)
      .slice(0, LAYOUT_EDIT_NEAR.max);
    return { n: i + 1, x: RoundTo(m.x, 2), z: RoundTo(m.z, 2), ...(m.radiusM > 0 ? { radiusM: m.radiusM } : {}), text: m.text || "", near };
  });
  return {
    schema: LAYOUT_EDIT_SCHEMA,
    level: ctx.level?.key || session.levelKey, levelLabel: ctx.level?.label || "",
    configPath: ctx.level?.configPath || "", scenePath: ctx.level?.scenePath || "",
    keyframe: ctx.keyframe ? { id: String(ctx.keyframe.id), index: ctx.keyframe.index } : null,
    moves, markers,
    view: ctx.view && Num(ctx.view.cx) ? { cx: RoundTo(ctx.view.cx, 1), cz: RoundTo(ctx.view.cz, 1), spanM: RoundTo(ctx.view.spanM || 0, 0) } : null,
    url: ctx.url || "",
  };
}

function RoundPose(p) {
  const out = { x: RoundTo(p.x, 2), z: RoundTo(p.z, 2) };
  if (Num(p.yawDeg)) out.yawDeg = RoundTo(p.yawDeg, 1);
  if (Num(p.ry)) out.ry = RoundTo(p.ry, 4);
  return out;
}

function WhoText(m) {
  const label = LAYOUT_EDIT_KINDS[m.kind]?.label || m.kind;
  const side = m.meta?.side ? SIDE_TEXT[m.meta.side] || m.meta.side : "";
  const name = m.name && m.name !== m.id ? `「${m.name}」` : "";
  if (m.kind === "unit") return `${side ? side + "方" : ""}${label}${name} ${m.id}`;
  if (m.kind === "station") return `关键帧 ${m.keyframe} 的玩家站位${name}`;
  if (m.kind === "next") return `关键帧 ${m.keyframe} 的下一步目标${name}`;
  return `${label}${name} ${m.id}`;
}

function RotText(m) {
  if (Num(m.dYawDeg)) return `；朝向 ${Fixed(m.from.yawDeg, 1)}° → ${Fixed(m.to.yawDeg, 1)}°`;
  if (Num(m.dRyDeg)) return `；转了 ${m.dRyDeg > 0 ? "+" : ""}${m.dRyDeg.toFixed(1)}°（ry ${Fixed(m.from.ry, 3)} → ${Fixed(m.to.ry, 3)}）`;
  return "";
}

/** 导出对象 → 贴给 agent 的文字。最后一行「数据：」是整份 JSON（一行）。 */
export function FormatLayoutEdit(exp) {
  const lines = ["【滕县白盒编辑器 · 布设调整】"];
  lines.push(`关卡：${exp.levelLabel || exp.level}（${exp.level}）`);
  const files = [exp.configPath ? `配置 ${exp.configPath}` : "", exp.scenePath ? `场景 ${exp.scenePath}` : ""].filter(Boolean);
  if (files.length) lines.push(`文件：${files.join("；")}`);
  if (exp.keyframe) lines.push(`导出时停在关键帧：${exp.keyframe.id}`);
  lines.push(`在全关总图上挪了 ${exp.moves.length} 处、加了 ${exp.markers.length} 个说明标记（都只在编辑器里看，没存盘；按下面改到文件里）。`);

  if (exp.moves.length) {
    lines.push("", "挪动：");
    // 同一次整组拖的体块 / 地标（同一个挪动量）合成一行，数据里仍逐条列
    const groups = [];
    for (const m of exp.moves) {
      const g = groups.find(q => q.file === "scene" && m.file === "scene" && q.kind === m.kind && q.dx === m.dx && q.dz === m.dz && !q.rot && !RotText(m));
      if (g && m.kind === "block") { g.items.push(m); continue; }
      groups.push({ file: m.file, kind: m.kind, dx: m.dx, dz: m.dz, rot: !!RotText(m), items: [m] });
    }
    let i = 0;
    for (const g of groups) {
      i++;
      if (g.items.length > 1) {
        const ids = g.items.map(m => m.id);
        const shown = ids.length > 8 ? `${ids.slice(0, 8).join("、")} 等 ${ids.length} 块` : ids.join("、");
        lines.push(`${i}. 体块 ${shown} 一起${DirText(g.dx, g.dz)}（场景 blocks / gates 里按 id 找；各自的新坐标见数据行）`);
        continue;
      }
      const m = g.items[0];
      const where = m.file === "config" ? `配置 ${m.path || `keyframes[id=${m.keyframe}]`}` : m.file === "scene" ? `场景 ${m.path || `${m.kind === "landmark" ? "landmarks" : "blocks"}[id=${m.id}]`}` : m.path;
      lines.push(`${i}. ${WhoText(m)}（${where}）：(${Fixed(m.from.x, 2)}, ${Fixed(m.from.z, 2)}) → (${Fixed(m.to.x, 2)}, ${Fixed(m.to.z, 2)})，${DirText(m.dx, m.dz)}${RotText(m)}`);
    }
  }
  if (exp.markers.length) {
    lines.push("", "说明标记：");
    for (const m of exp.markers) {
      const tag = CIRCLED[m.n - 1] || `(${m.n})`;
      const area = m.radiusM ? `，半径 ${m.radiusM} m 这一片` : "";
      const near = m.near.length ? `　附近：${m.near.map(c => `${c.name || c.id}${c.name && c.id && c.name !== c.id ? `（${c.id}）` : ""} 在${c.dir} ${c.distM} m`).join("；")}` : "";
      lines.push(`${tag} x ${Fixed(m.x, 1)}  z ${Fixed(m.z, 1)}${area}：${m.text ? `「${m.text}」` : "（没写字）"}${near}`);
    }
  }
  lines.push("");
  lines.push("怎么改：关键帧里的人 / 要点 / 下一步 / 玩家站位直接改配置 JSON（编辑器 2 s 内同步）；"
    + "地标、体块在场景文件里：第一关新剧本（01–05 / 06–10 / 11–18）共用 Taierzhuang1938/Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json，"
    + "以它为准、直接改（体块 = objects[i]：pos [x, y, z]，y 为 null 是落地，yawDeg 是角度；地标 = markers[i]；路径见上面每一条，格式见 docs/Data_Scene.md）；"
    + "第二关草稿场景是生成器烘的，改生成器常量再重跑 `node Taierzhuang1938/Script_EditorBlockoutCli.mjs scene SecondLevel --force`；第一关旧版（FirstLevel）的体块是游戏布局表，按 id 找源头。"
    + "改好后编辑器会自动认出「已经挪到位」的条目并从记录里拿掉。");
  lines.push("口径：x 向东为正、z 向南为正（米）；yawDeg 0 = 朝北、+90 = 朝西；ry 弧度（同场景文件）。格式见 Taierzhuang1938/docs/Data_EditorBlockout.md §4.4");
  lines.push(`${LAYOUT_EDIT_DATA_PREFIX}${JSON.stringify(exp)}`);
  return lines.join("\n");
}

/** 贴回来的文字 → 导出对象（找「数据：」那一行）；找不到或坏了 → null。 */
export function ParseLayoutEdit(text) {
  if (typeof text !== "string") return null;
  const line = text.split(/\r?\n/).reverse().find(l => l.startsWith(LAYOUT_EDIT_DATA_PREFIX));
  if (!line) return null;
  try {
    const exp = JSON.parse(line.slice(LAYOUT_EDIT_DATA_PREFIX.length));
    return exp && exp.schema === LAYOUT_EDIT_SCHEMA ? exp : null;
  } catch {
    return null;
  }
}
