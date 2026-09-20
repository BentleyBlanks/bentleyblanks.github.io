// ===========================================================================
// Script_MissionNotes.mjs —— 关卡编排工作台的「批注草稿」层（纯模块，零 three）
//
// 这一层只管三件事，Node 与浏览器共用同一份：
//   ① 一条批注长什么样（schema + ValidateNote），
//   ② 写批注的那一刻把**目标当时的真实数据**拍下来（SnapshotTarget），
//   ③ 过些天关卡改过了，还能对得回来（NoteDrift）、讲得清楚（HandoffMarkdown）。
//
// 为什么要拍快照：批注是「这组敌人出现得太早」，而「早」是相对**当时那份编排**说的。
// 不存下当时的 spawn / 坐标 / 事实门，等 agent 改完关卡回头看，这句话就无从校对 ——
// 到底是意见被采纳了，还是这一版根本已经不是同一组敌人了，分不出来。
// 所以每条批注都带 `original`，`NoteDrift` 拿现在的模型再拍一张，逐字段对。
//
// 批注文件 `Taierzhuang1938/Notes/<Level>/notes.json` **进仓库**：换一棵 worktree
// 的 agent 也要拿得到，所以它不能躺在 localStorage 里。图片同目录 `<noteId>.png`。
//
// 模型（`model`）是 P1 的 `BuildOrchestrationModel()` 出来的那一份（契约 §5）。
// 本模块只读它、不 import 它 —— 没有模型时（比如线上、或者模型还没建好）
// ValidateNote / HandoffMarkdown 照样能跑，只是少了阶段标题那类装饰。
// ===========================================================================

/** 批注文件的白名单：保存端点与 CLI 共用这一条，`..` 被正则本身排除了。 */
export const NOTES_FILE_RE = /^Taierzhuang1938\/Notes\/[A-Za-z0-9]+\/notes\.json$/;
/** 批注图片名：必须是 `<noteId>.png`，别的一律不收。 */
export const NOTE_IMAGE_RE = /^n_[0-9]{8}_[0-9]{6}_[a-z0-9]{4}\.png$/;
/** 批注 id 本身。 */
export const NOTE_ID_RE = /^n_[0-9]{8}_[0-9]{6}_[a-z0-9]{4}$/;
/** 关卡名（同时是目录名）：只允许字母数字，这是路径安全的第一道闸。 */
export const LEVEL_RE = /^[A-Za-z0-9]+$/;

export const NOTE_STATUSES = Object.freeze(["open", "resolved", "dismissed"]);
export const TARGET_KINDS = Object.freeze([
  "phase", "step", "fact", "encounter", "member", "threat", "beat",
  "route", "zone", "anchor", "friendly", "point", "time",
]);
export const PROPOSAL_KINDS = Object.freeze(["move", "delay", "retime", "reroute", "remove", "other"]);
export const SHAPE_KINDS = Object.freeze(["circle", "arrow", "path", "label", "ghost"]);
export const TIME_KINDS = Object.freeze(["stageRelative", "fact", "actual"]);

/** 有 id 才认得出目标的那几类（point / time 靠坐标与秒数自证）。 */
const KINDS_NEED_ID = Object.freeze(["phase", "step", "fact", "encounter", "member", "threat", "beat", "route", "zone", "anchor", "friendly"]);

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

// --------------------------------------------------------------- 小工具

function Pad(value, width = 2) { return String(value).padStart(width, "0"); }

function Kind(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function IsPlainObject(value) { return Kind(value) === "object"; }

function Finite(value) { return typeof value === "number" && Number.isFinite(value); }

/** 深拷贝（只走 JSON 能表达的那几种；函数与 undefined 直接丢掉，正合适）。 */
function Clone(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(Clone);
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "function" || child === undefined) continue;
    out[key] = Clone(child);
  }
  return out;
}

/** 只留 {x,z}：路线点、候选位都按这个形状存，免得把整段运行时对象拍进快照。 */
function Point(value) {
  if (!value || typeof value !== "object") return null;
  if (!Finite(value.x) || !Finite(value.z)) return null;
  return { x: value.x, z: value.z };
}

function Points(list) {
  if (!Array.isArray(list)) return null;
  return list.map(Point).filter((point) => point !== null);
}

/** 拍快照时统一的「有就写、没有就不写」：undefined 不进 JSON，省得对 diff 添乱。 */
function Put(out, key, value) {
  if (value !== undefined) out[key] = value;
  return out;
}

// ------------------------------------------------------------------- id

/**
 * 新批注 id：`n_YYYYMMDD_HHMMSS_xxxx`。
 * 时间戳是给人看的（文件名排序即时间序），真正的时刻在 createdAt 的 ISO 串里；
 * 后四位随机是为了同一秒里点两下「保存」不会撞名（图片也按 id 命名）。
 */
export function NewNoteId(now = new Date()) {
  const stamp = `${now.getFullYear()}${Pad(now.getMonth() + 1)}${Pad(now.getDate())}`
    + `_${Pad(now.getHours())}${Pad(now.getMinutes())}${Pad(now.getSeconds())}`;
  let tail = "";
  for (let i = 0; i < 4; i += 1) tail += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return `n_${stamp}_${tail}`;
}

/** 关卡名 → 批注文件的仓库相对路径（保存端点与 CLI 共用，白名单只此一处）。 */
export function NotesPathFor(level) {
  return `Taierzhuang1938/Notes/${level}/notes.json`;
}

// -------------------------------------------------------------- 校验

function CheckTarget(target, errors) {
  if (!IsPlainObject(target)) { errors.push("target 要是对象"); return; }
  if (!TARGET_KINDS.includes(target.kind)) {
    errors.push(`target.kind 不认识：${JSON.stringify(target.kind)}`);
    return;
  }
  if (KINDS_NEED_ID.includes(target.kind)) {
    const ok = typeof target.id === "string" ? target.id.length > 0 : Finite(target.id);
    if (!ok) errors.push(`target.kind=${target.kind} 要带 id`);
  }
  if (target.kind === "point" && !Point(target)) errors.push("target.kind=point 要带有限的 x/z");
  if (target.kind === "time" && !Finite(target.seconds) && !Finite(target.atS)) {
    errors.push("target.kind=time 要带 seconds 或 atS");
  }
  if (target.x !== undefined && !Finite(target.x)) errors.push("target.x 不是有限数");
  if (target.z !== undefined && !Finite(target.z)) errors.push("target.z 不是有限数");
}

function CheckTime(time, errors) {
  if (time === null || time === undefined) return;
  if (!IsPlainObject(time)) { errors.push("time 要是 null 或对象"); return; }
  if (!TIME_KINDS.includes(time.kind)) { errors.push(`time.kind 不认识：${JSON.stringify(time.kind)}`); return; }
  if (time.kind === "stageRelative" && !Finite(time.seconds)) errors.push("time.kind=stageRelative 要带 seconds");
  if (time.kind === "fact" && typeof time.fact !== "string") errors.push("time.kind=fact 要带 fact");
  if (time.kind === "actual" && !Finite(time.atS)) errors.push("time.kind=actual 要带 atS");
}

function CheckProposal(proposal, errors) {
  if (proposal === null || proposal === undefined) return;
  if (!IsPlainObject(proposal)) { errors.push("proposal 要是 null 或对象"); return; }
  if (!PROPOSAL_KINDS.includes(proposal.kind)) {
    errors.push(`proposal.kind 不认识：${JSON.stringify(proposal.kind)}`);
  }
  if (proposal.to !== undefined && !Point(proposal.to)) errors.push("proposal.to 要是 {x,z}");
  if (proposal.points !== undefined) {
    if (!Array.isArray(proposal.points) || proposal.points.some((point) => !Point(point))) {
      errors.push("proposal.points 要是 [{x,z}]");
    }
  }
  for (const key of ["seconds", "earliestS", "latestS"]) {
    if (proposal[key] !== undefined && !Finite(proposal[key])) errors.push(`proposal.${key} 不是有限数`);
  }
}

function CheckSketch(sketch, errors) {
  if (sketch === null || sketch === undefined) return;
  if (!IsPlainObject(sketch)) { errors.push("sketch 要是对象"); return; }
  if (!Array.isArray(sketch.shapes)) { errors.push("sketch.shapes 要是数组"); return; }
  sketch.shapes.forEach((shape, index) => {
    const at = `sketch.shapes[${index}]`;
    if (!IsPlainObject(shape)) { errors.push(`${at} 要是对象`); return; }
    if (!SHAPE_KINDS.includes(shape.type)) { errors.push(`${at}.type 不认识：${JSON.stringify(shape.type)}`); return; }
    if (shape.type === "circle" && (!Point(shape) || !Finite(shape.r))) errors.push(`${at} 要带 x/z/r`);
    if (shape.type === "arrow" && (!Point(shape.from) || !Point(shape.to))) errors.push(`${at} 要带 from/to`);
    if (shape.type === "path" && (!Array.isArray(shape.points) || shape.points.some((p) => !Point(p)))) {
      errors.push(`${at}.points 要是 [{x,z}]`);
    }
    if (shape.type === "label" && (!Point(shape) || typeof shape.text !== "string")) errors.push(`${at} 要带 x/z/text`);
    if (shape.type === "ghost" && !Point(shape)) errors.push(`${at} 要带 x/z`);
  });
}

function CheckResolution(resolution, errors) {
  if (resolution === null || resolution === undefined) return;
  if (!IsPlainObject(resolution)) { errors.push("resolution 要是 null 或对象"); return; }
  if (typeof resolution.summary !== "string" || resolution.summary.trim() === "") {
    errors.push("resolution.summary 要是非空字符串");
  }
  if (typeof resolution.at !== "string" || Number.isNaN(Date.parse(resolution.at))) {
    errors.push("resolution.at 要是 ISO 时间串");
  }
  if (resolution.commit !== undefined && typeof resolution.commit !== "string") errors.push("resolution.commit 要是字符串");
}

/**
 * 一条批注合不合法。**保存端点在写盘前逐条跑这个**，所以它的宽严就是盘上文件的宽严：
 * 宁可在这里报错，也别让一条半截批注进仓库 —— 那会让工作台下次加载整个列表都炸。
 * 返回 `{ ok, errors:[人话] }`，不抛。
 */
export function ValidateNote(note) {
  const errors = [];
  if (!IsPlainObject(note)) return { ok: false, errors: ["批注要是对象"] };

  if (!NOTE_ID_RE.test(note.id)) errors.push(`id 不合规（要 n_YYYYMMDD_HHMMSS_xxxx）：${JSON.stringify(note.id)}`);
  for (const key of ["createdAt", "updatedAt"]) {
    if (typeof note[key] !== "string" || Number.isNaN(Date.parse(note[key]))) errors.push(`${key} 要是 ISO 时间串`);
  }
  if (!NOTE_STATUSES.includes(note.status)) errors.push(`status 不认识：${JSON.stringify(note.status)}`);
  if (typeof note.level !== "string" || !LEVEL_RE.test(note.level)) errors.push("level 要是字母数字（同时是目录名）");
  if (note.missionVersion === undefined || note.missionVersion === null
    || (typeof note.missionVersion !== "string" && !Finite(note.missionVersion))) {
    errors.push("missionVersion 要有（来自 model.version）");
  }
  if (typeof note.text !== "string" || note.text.trim() === "") errors.push("text 要是非空字符串");
  if (note.phaseNumber !== undefined && note.phaseNumber !== null && !Finite(note.phaseNumber)) {
    errors.push("phaseNumber 要是数字或 null");
  }
  if (note.step !== undefined && note.step !== null && typeof note.step !== "string") errors.push("step 要是字符串或 null");
  if (!IsPlainObject(note.original)) errors.push("original 要是对象（SnapshotTarget 的结果）");
  if (note.image !== undefined && note.image !== null) {
    if (typeof note.image !== "string" || !NOTE_IMAGE_RE.test(note.image)) errors.push("image 要是 <noteId>.png");
    else if (NOTE_ID_RE.test(note.id) && note.image !== `${note.id}.png`) errors.push("image 的名字要和 id 对得上");
  }
  if (note.verified !== undefined && note.verified !== null && typeof note.verified !== "boolean") {
    errors.push("verified 要是布尔");
  }

  CheckTarget(note.target, errors);
  CheckTime(note.time, errors);
  CheckProposal(note.proposal, errors);
  CheckSketch(note.sketch, errors);
  CheckResolution(note.resolution, errors);

  return { ok: errors.length === 0, errors };
}

// ------------------------------------------------------- 模型里找目标

function FindPhase(model, id) {
  const phases = model && Array.isArray(model.phases) ? model.phases : [];
  return phases.find((phase) => phase.id === id || phase.number === Number(id)) || null;
}

function FindStep(model, id) {
  const steps = model && Array.isArray(model.steps) ? model.steps : [];
  return steps.find((step) => step.id === id) || null;
}

function FindEncounter(model, id) {
  const list = model && Array.isArray(model.encounters) ? model.encounters : [];
  return list.find((encounter) => encounter.id === id) || null;
}

function FindMember(model, id) {
  const list = model && Array.isArray(model.encounters) ? model.encounters : [];
  for (const encounter of list) {
    const member = (encounter.members || []).find((one) => one.id === id);
    if (member) return { encounter, member };
  }
  return null;
}

/** 遭遇组的「何时出现 / 何时激活」那一撮：成员快照也要带上它（批注常是在说这个）。 */
function Activation(encounter) {
  const out = {};
  Put(out, "spawn", encounter.spawn === undefined ? undefined : Clone(encounter.spawn));
  Put(out, "standbyUntil", encounter.standbyUntil);
  Put(out, "dormant", encounter.dormant);
  Put(out, "wake", encounter.wake === undefined ? undefined : Clone(encounter.wake));
  Put(out, "deferred", encounter.deferred);
  return out;
}

/**
 * 把「目标当时的真实数据」拍下来。写批注的那一刻调一次，存进 note.original。
 * 找不到目标时返回 `{ kind, id, missing:true }` —— 这本身就是一种漂移
 *（那组敌人被删了），NoteDrift 会把它报出来，而不是静悄悄当作没变。
 */
export function SnapshotTarget(model, target) {
  if (!IsPlainObject(target)) return { kind: "unknown", missing: true };
  const kind = target.kind;
  const id = target.id;
  const Missing = () => Put({ kind, missing: true }, "id", id);

  if (kind === "point" || kind === "time") return { ...Clone(target) };

  if (kind === "member") {
    const hit = FindMember(model, id);
    if (!hit) return Missing();
    const { encounter, member } = hit;
    const out = { kind: "member", id: member.id, x: member.x, z: member.z };
    Put(out, "weapon", member.weapon);
    Put(out, "hold", member.hold);
    Put(out, "bayonet", member.bayonet);
    Put(out, "team", member.team);
    out.tactic = member.tactic
      ? Put(Put(Put({ delay: member.tactic.delay }, "near", Clone(member.tactic.near)),
        "nearM", member.tactic.nearM), "points", Points(member.tactic.points) || [])
      : null;
    // 跃进线动辄十几个点，批注只关心「从哪儿起跳、第一步奔哪儿」——存前两点就够对账了。
    out.assaultLane = Array.isArray(member.assaultLane) ? (Points(member.assaultLane) || []).slice(0, 2) : null;
    out.encounter = encounter.id;
    Put(out, "phaseNumber", encounter.phaseNumber);
    out.activation = Activation(encounter);
    return out;
  }

  if (kind === "encounter") {
    const encounter = FindEncounter(model, id);
    if (!encounter) return Missing();
    const out = { kind: "encounter", id: encounter.id };
    Put(out, "phaseNumber", encounter.phaseNumber);
    out.activation = Activation(encounter);
    out.members = (encounter.members || []).map((member) => ({ id: member.id, x: member.x, z: member.z }));
    return out;
  }

  if (kind === "step") {
    const step = FindStep(model, id);
    if (!step) return Missing();
    const out = { kind: "step", id: step.id };
    Put(out, "phaseNumber", step.phaseNumber);
    Put(out, "objective", step.objective);
    Put(out, "cue", step.cue);
    Put(out, "minimumSeconds", step.minimumSeconds);
    out.requirements = Array.isArray(step.requirements) ? [...step.requirements] : [];
    out.spawns = Array.isArray(step.spawns) ? [...step.spawns] : [];
    out.guidance = step.guidance ? Clone(step.guidance) : null;
    Put(out, "target", step.target ? Point(step.target) : undefined);
    return out;
  }

  if (kind === "phase") {
    const phase = FindPhase(model, id);
    if (!phase) return Missing();
    const out = { kind: "phase", id: phase.id };
    Put(out, "number", phase.number);
    Put(out, "title", phase.title);
    out.steps = Array.isArray(phase.steps) ? [...phase.steps] : [];
    out.spawn = phase.spawn ? Point(phase.spawn) : null;
    return out;
  }

  if (kind === "fact") {
    const gate = model && model.facts ? model.facts[id] : null;
    if (!gate) return Missing();
    // 事实门自己那个 kind（proximity/voice/interaction…）也会撞上快照的 kind，改名 gateKind。
    const { kind: gateKind, ...rest } = Clone(gate);
    return { kind: "fact", gateKind, ...rest, id };
  }

  if (kind === "beat") {
    const beats = model && Array.isArray(model.beats) ? model.beats : [];
    const beat = beats.find((one) => one.id === id);
    if (!beat) return Missing();
    const { kind: beatKind, ...rest } = Clone(beat);
    return Put({ kind: "beat", ...rest, id }, "beatKind", beatKind);
  }

  if (kind === "threat") {
    const threats = model && Array.isArray(model.transferThreats) ? model.transferThreats : [];
    const threat = threats.find((one) => one.id === id);
    if (!threat) return Missing();
    return { kind: "threat", ...Clone(threat), id };
  }

  if (kind === "route") {
    const points = model && model.routes ? model.routes[id] : null;
    if (!points) return Missing();
    return { kind: "route", id, points: Points(points) || [] };
  }

  if (kind === "zone") {
    const zones = model && Array.isArray(model.zones) ? model.zones : [];
    const zone = zones.find((one) => one.id === id);
    if (!zone) return Missing();
    // zone 自己那个 kind（gate/interior/crawl/threatArea）会撞上快照的 kind，改名 shape。
    const { kind: shape, ...rest } = Clone(zone);
    return { kind: "zone", shape, ...rest, id };
  }

  if (kind === "anchor") {
    const anchor = model && model.anchors ? model.anchors[id] : null;
    if (!anchor) return Missing();
    return { kind: "anchor", id, x: anchor.x, z: anchor.z };
  }

  if (kind === "friendly") {
    const list = model && Array.isArray(model.friendlies) ? model.friendlies : [];
    const friendly = list.find((one) => one.id === id);
    if (!friendly) return Missing();
    const { kind: friendlyKind, ...rest } = Clone(friendly);
    return { kind: "friendly", friendlyKind, ...rest, id, x: friendly.x, z: friendly.z };
  }

  return Missing();
}

// ------------------------------------------------------------- 漂移

function Diff(from, to, at, out) {
  if (from === to) return;
  const a = Kind(from);
  const b = Kind(to);
  if (a !== b) { out.push({ path: at, from: Clone(from), to: Clone(to) }); return; }
  if (a === "array") {
    const length = Math.max(from.length, to.length);
    for (let i = 0; i < length; i += 1) Diff(from[i], to[i], at ? `${at}.${i}` : String(i), out);
    return;
  }
  if (a === "object") {
    const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])];
    for (const key of keys) Diff(from[key], to[key], at ? `${at}.${key}` : key, out);
    return;
  }
  if (a === "number" && Number.isNaN(from) && Number.isNaN(to)) return;
  out.push({ path: at, from, to });
}

/**
 * 「改完能对应回来」：拿当前模型再拍一张，和批注里存的 original 逐字段对。
 * diff 的 path 直指变了的那个字段（`x`、`activation.spawn.step`、`members.2.z`…），
 * 工作台据此在列表里标「已变化」并把新旧值并排显示。
 */
export function NoteDrift(note, model) {
  const target = note && note.target ? note.target : null;
  const current = SnapshotTarget(model, target);
  const diff = [];
  Diff(note && note.original ? note.original : null, current, "", diff);
  return { changed: diff.length > 0, current, diff };
}

// ------------------------------------------------------- 交给 agent

function FormatPoint(point) {
  const p = Point(point);
  return p ? `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})` : "—";
}

function DescribeTarget(note) {
  const target = note.target || {};
  if (target.kind === "point") return `地图上一点 ${FormatPoint(target)}`;
  if (target.kind === "time") {
    const seconds = Finite(target.seconds) ? target.seconds : target.atS;
    return `时间点 ${seconds} s`;
  }
  return `${target.kind} \`${target.id}\``;
}

function DescribeTime(note) {
  const time = note.time;
  if (!time) return "不限时刻";
  if (time.kind === "stageRelative") return `阶段内第 ${time.seconds} 秒（设计时间）`;
  if (time.kind === "fact") return `事实 \`${time.fact}\` 满足时`;
  if (time.kind === "actual") return `实际试玩第 ${time.atS} 秒`;
  return "不限时刻";
}

function DescribeProposal(note) {
  const proposal = note.proposal;
  if (!proposal) return "（没写具体建议，按意见判断）";
  const bits = [proposal.kind];
  if (proposal.to) bits.push(`→ ${FormatPoint(proposal.to)}`);
  if (Array.isArray(proposal.points) && proposal.points.length) {
    bits.push(`路线 ${proposal.points.map(FormatPoint).join(" → ")}`);
  }
  if (Finite(proposal.seconds)) bits.push(`${proposal.seconds} s`);
  if (Finite(proposal.earliestS) || Finite(proposal.latestS)) {
    bits.push(`窗口 ${proposal.earliestS ?? "—"}–${proposal.latestS ?? "—"} s`);
  }
  if (proposal.note) bits.push(String(proposal.note));
  return bits.join(" ");
}

function DescribeSketch(note) {
  const shapes = note.sketch && Array.isArray(note.sketch.shapes) ? note.sketch.shapes : [];
  if (!shapes.length) return "无";
  const counts = new Map();
  for (const shape of shapes) counts.set(shape.type, (counts.get(shape.type) || 0) + 1);
  return [...counts].map(([type, count]) => `${type}×${count}`).join("、");
}

/** 原设置压成一行行 `key: value`：让 agent 不必去读 JSON 块就能对上号。 */
function OriginalLines(original) {
  const rows = [];
  const Walk = (value, at) => {
    if (value === null || typeof value !== "object") { rows.push(`${at} = ${JSON.stringify(value)}`); return; }
    if (Array.isArray(value)) {
      if (value.length === 0 || value.every((item) => item === null || typeof item !== "object")) {
        rows.push(`${at} = ${JSON.stringify(value)}`);
        return;
      }
      value.forEach((item, index) => Walk(item, `${at}.${index}`));
      return;
    }
    for (const [key, child] of Object.entries(value)) Walk(child, at ? `${at}.${key}` : key);
  };
  Walk(original || {}, "");
  return rows;
}

/**
 * 给 agent 的交接文本：按阶段分组，每条含目标 / 原设置 / 建议 / 草图 / 图片路径，
 * 末尾一个 ```json 机器可读块（照抄这几条批注本身，agent 可以直接解析）。
 * model 可以是 null（线上或模型还没建）：那就少了阶段标题与漂移提示，正文照出。
 */
export function HandoffMarkdown(notes, model = null, options = {}) {
  const onlyOpen = options.onlyOpen !== false;
  const list = (Array.isArray(notes) ? notes : []).filter((note) => !onlyOpen || note.status === "open");
  const level = list[0]?.level || (model && model.levelId) || "FirstLevel";
  const version = (model && model.version) || list[0]?.missionVersion || "未知";
  const lines = [];
  lines.push(`# 关卡编排批注交接 · ${level}`);
  lines.push("");
  lines.push(`共 ${list.length} 条${onlyOpen ? "待处理" : ""}批注 · 模型版本 ${version}`
    + ` · 批注文件 \`${NotesPathFor(level)}\``);
  lines.push("");
  if (!list.length) {
    lines.push("（没有批注。）");
    lines.push("");
  }

  const groups = new Map();
  for (const note of list) {
    const key = Finite(note.phaseNumber) ? note.phaseNumber : Number.POSITIVE_INFINITY;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(note);
  }
  for (const key of [...groups.keys()].sort((a, b) => a - b)) {
    const phase = model && Number.isFinite(key) ? FindPhase(model, key) : null;
    const title = Number.isFinite(key)
      ? `阶段 ${key}${phase && phase.title ? ` · ${phase.title}` : ""}`
      : "未指定阶段";
    lines.push(`## ${title}`);
    lines.push("");
    for (const note of groups.get(key)) {
      lines.push(`### ${note.id} —— ${DescribeTarget(note)}`);
      lines.push("");
      lines.push(`- 目标：${DescribeTarget(note)}`
        + `${note.step ? `（步骤 \`${note.step}\`）` : ""} · ${DescribeTime(note)}`);
      lines.push(`- 意见：${note.text}`);
      lines.push(`- 建议：${DescribeProposal(note)}`);
      lines.push("- 原设置：");
      for (const row of OriginalLines(note.original)) lines.push(`  - ${row}`);
      lines.push(`- 草图：${DescribeSketch(note)}`);
      lines.push(`- 图片：${note.image ? `\`Taierzhuang1938/Notes/${note.level}/${note.image}\`` : "无"}`);
      if (model) {
        const drift = NoteDrift(note, model);
        if (drift.changed) {
          lines.push(`- ⚠ 已变化（${drift.diff.length} 处）：`
            + drift.diff.slice(0, 6).map((row) => `\`${row.path || "(整体)"}\` ${JSON.stringify(row.from)} → ${JSON.stringify(row.to)}`).join("；"));
        }
      }
      if (note.resolution) lines.push(`- 已处理：${note.resolution.summary}${note.resolution.commit ? `（${note.resolution.commit}）` : ""}`);
      lines.push("");
    }
  }

  lines.push("## 机器可读");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(list, null, 2));
  lines.push("```");
  lines.push("");
  lines.push(`改完用 \`node Taierzhuang1938/Script_MissionNotesCli.mjs resolve <id> --summary "…" --commit <sha>\` 标掉。`);
  lines.push("");
  return lines.join("\n");
}

// --------------------------------------------------------------- 结案

/**
 * agent 改完之后把一条批注标掉。**不改入参**，返回新的一条 ——
 * 工作台那边是把整个数组 map 过去再保存，原地改会让 undo 失效。
 */
export function ResolveNote(note, resolution = {}) {
  const at = typeof resolution.at === "string" ? resolution.at : new Date().toISOString();
  const status = resolution.status === "dismissed" ? "dismissed" : "resolved";
  const next = { ...Clone(note), status, updatedAt: at };
  next.resolution = { at, by: typeof resolution.by === "string" ? resolution.by : "agent",
    summary: String(resolution.summary ?? "").trim() };
  if (resolution.commit) next.resolution.commit = String(resolution.commit);
  if (resolution.applied !== undefined && resolution.applied !== null) next.resolution.applied = Clone(resolution.applied);
  return next;
}

/** 「这条不用改了」：与 ResolveNote 同一条路，只是 status 落在 dismissed。 */
export function DismissNote(note, reason = "不再需要") {
  return ResolveNote(note, { status: "dismissed", summary: reason });
}
