// 《地道里的光》 —— 动画工作台（调试用，全屏）。
//
// 干什么：把骨架里的每一条轨道 / 每一个姿势 / 每一种步态**按名字**列出来，选中就在
// 自己的一块画布上循环播放：能拖时间轴、逐帧走、换人（柱子/妹妹/娘/爹/日军…）、
// 翻朝向、叠关键帧影子、画手脚轨迹、量手脚离地；右栏把这条动画的一切都摊开——
// 源码在哪一行、时长、循环不循环、几帧、每帧的关节值与注释、由什么驱动、
// 用在哪几拍、谁在用。一颗「复制引用」把这些压成一行贴进对话。
//
// 为什么有：动画退回一直靠"描述画面 / 贴截图"——「抱起妹妹的动画太蠢了」得先猜是
// scoopChild 还是 scoopReach 还是 childArms，再实拍逐帧核对（每次十几轮）。有了名字，
// 一句「scoopChild 第 3→4 帧太快」就说清了。
//
// 怎么做：**不碰世界**。自己一台 WebGLRenderer 画在 #animCanvas 上，一具 CreateRig
// 出来的骨架，直接喂 PoseRig 合成状态（World.UpdateOne 喂什么这里就喂什么，相位的
// 走法照抄）。所以它看到的就是游戏里那具骨架、那一套插值——不是另一套复刻。
// 索引（名字/行号/说明/用法）来自 Script_AnimIndex 现扫源码（fetch 同目录的 .mjs），
// 轨道的 dur/loop/keys 以运行时 TRACKS 为准。
import * as THREE from "three";
import { CreateRig, PoseRig, TRACKS, LimbTips, WalkCadence, GaitOf, RigContact } from "./Script_Rig.mjs";
import {
  ScanAnimIndex, LOCOMOTION, KIND_PRESETS, KIND_LABEL, RIG_FIELDS, RIG_FIELD_LABEL,
  FormatRef, DominantKind,
} from "./Script_AnimIndex.mjs";

// 相位的走法：World.UpdateOne 的那几个常数，一个数都不许改（改了预览就不是游戏）。
// 走路的步频与走↔跑由 Rig.WalkCadence / GaitOf 给（2026-08-18 起按自然步频，不按位移数步）
const BREATH_RATE = 1.4;      // s.idleT += dt*1.4
const IDLE_RATE = 2.2;        // 原地动作 phase += dt*2.2
const CLIMB_RATE = 4.5;       // 爬梯 phase += 竖向位移*4.5
const LIE_LEN = 0.90, LIE_RISE = 0.15;  // 同 World：躺姿整具转 90° 后的挪与垫
const FRAME = 1 / 30;
const PROGRESS_CYCLE = 4.0;   // 进度姿势 0→1→0 往复一趟的演示时长
const TRAIL_SAMPLES = 96;
const MAX_GHOSTS = 24;
const DEG = 180 / Math.PI;

const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
const ZOOMS = [{ v: 1.5, l: "特写 1.5m" }, { v: 2.1, l: "近 2.1m" }, { v: 2.6, l: "全身 2.6m" }, { v: 3.6, l: "退一档 3.6m" }];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const Esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const Fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v)) ? "–" : (+v).toFixed(d);

// ═══════════════════════════════════════════════════════════════════════════
// 工作台与人物美术样式浏览器共用的那一层：时间模型（一条动画怎么随时间走）、
// 从索引搭清单、取索引（一次 fetch 两处用）、把骨架摆到位。**这里的常数与走法
// 照抄 World.UpdateOne**——两块预览看到的必须是游戏里那条动画，不是另一套。
// ═══════════════════════════════════════════════════════════════════════════

// cycle = 时间轴一圈多长；env = { scale 体型, params { speed, strain, moving } }
export function EntryCycle(e, env) {
  const scale = env?.scale || 1, params = env?.params || {};
  if (e.type === "track") return e.dur;
  if (e.type === "pose") return e.progress ? PROGRESS_CYCLE : 2 * Math.PI / BREATH_RATE;
  const L = e.loco;
  const sp = params.speed ?? L.speed ?? 1;
  if (L.cycle === "walk") return 2 / WalkCadence(sp, scale);          // 一圈 = 两步
  if (L.cycle === "climb") return 2 * Math.PI / (sp * CLIMB_RATE);
  if (L.cycle === "idle") return 2 * Math.PI / IDLE_RATE;
  return 2 * Math.PI / BREATH_RATE;
}
// 时间可以无界增长的（循环轨道、呼吸、步态、往复的进度）；单次轨道不是
export const IsCyclic = (e) => !(e.type === "track" && !e.loop);
// 进度姿势 0→1→0 往复：一趟 PROGRESS_CYCLE
export const ProgressAt = (tt) => { const u = ((tt % PROGRESS_CYCLE) + PROGRESS_CYCLE) % PROGRESS_CYCLE / (PROGRESS_CYCLE / 2); return u <= 1 ? u : 2 - u; };

// 喂给 PoseRig 的合成状态——字段名与 World.UpdateOne 那一处逐字相同
export function EntryState(e, tt, env) {
  const scale = env?.scale || 1, params = env?.params || {};
  if (e.type === "track") return { track: e.name, trackT: tt, phase: 0, breath: tt * BREATH_RATE, moving: false };
  if (e.type === "pose") {
    const s = { pose: e.name, breath: tt * BREATH_RATE, phase: tt * IDLE_RATE, moving: !!params.moving, poseStrain: params.strain || 0 };
    if (e.progress) s.poseK = ProgressAt(tt);
    if (e.lie) s.ground = 0;                       // 躺着的：World 也不贴地（整具转 90°）
    return s;
  }
  const L = e.loco;
  const s = { ...L.state, breath: tt * BREATH_RATE };
  const sp = params.speed ?? L.speed ?? 1;
  if (L.cycle === "walk") {
    s.gait = GaitOf(sp, scale);
    s.phase = tt * WalkCadence(sp, scale) * Math.PI;   // 一步 = π
  } else if (L.cycle === "climb") s.phase = tt * sp * CLIMB_RATE;
  else s.phase = tt * IDLE_RATE;
  return s;
}

// 把一具骨架摆到位：体型、朝向、躺姿整具转 90°（同 World.UpdateOne）
export function PlaceRigGroup(group, s, { scale = 1, heading = 1, lieSet = null } = {}) {
  const lie = (s.pose && lieSet && lieSet.includes(s.pose)) ? (heading >= 0 ? 1 : -1) : 0;
  group.rotation.z = lie * Math.PI / 2;
  group.position.set(lie * LIE_LEN * 0.5 * scale, lie ? LIE_RISE * scale : 0, 0);
  group.scale.set((heading >= 0 ? 1 : -1) * scale, scale, 1);
}

// 同游戏：一具骨架的骨头共用一个绘制序号，先后由各自的局部 z（都是 0）→
// 创建顺序决定——这就是 CreateRig 里挂载顺序的意义
export function SetRigOrder(group, order, opacity = 1) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    o.renderOrder = order;
    if (o.material) { o.material.opacity = opacity; o.material.transparent = true; }
  });
}

// 从索引搭清单：轨道（运行时 TRACKS 是真相，索引补行号/说明/用法）/ 姿势 / 步态
export function BuildAnimEntries(idx) {
  const out = [];
  for (const [name, def] of Object.entries(TRACKS)) {
    const sc = idx?.tracks?.[name] || {};
    const keys = def.keys.map((k, i) => ({ t: k.t, values: k, note: sc.keys?.[i]?.note || "", line: sc.keys?.[i]?.line || null }));
    const joints = RIG_FIELDS.filter((f) => def.keys.some((k) => k[f] !== undefined));
    out.push({
      id: "track:" + name, type: "track", name, label: name, dur: def.dur, loop: !!def.loop, keys, joints,
      line: sc.line || null, comment: sc.comment || "", usages: sc.usages || [], notes: sc.notes || [], warnings: sc.warnings || [],
      kindGuess: DominantKind(sc.usages),
    });
  }
  // 索引里有、运行时没有的轨道（不该发生——扫描器与 Rig 不同步时报出来）
  for (const name of Object.keys(idx?.tracks || {})) if (!TRACKS[name]) out.push({ id: "track:" + name, type: "track", name, label: name, dur: idx.tracks[name].dur ?? 0, loop: !!idx.tracks[name].loop, keys: [], joints: [], line: idx.tracks[name].line, comment: idx.tracks[name].comment, usages: idx.tracks[name].usages || [], notes: [], warnings: ["源码里有、运行时 TRACKS 里没有——索引与 Rig 不同步"], missing: true });
  for (const [name, p] of Object.entries(idx?.poses || {})) {
    out.push({
      id: "pose:" + name, type: "pose", name, label: name, ...p,
      usages: p.usages || [], notes: p.notes || [], warnings: p.warnings || [], kindGuess: DominantKind(p.usages),
    });
  }
  for (const L of (idx?.locomotion || LOCOMOTION)) {
    out.push({ id: "loco:" + L.id, type: "loco", name: L.id, label: L.label, loco: L, cond: L.cond, line: L.line || null, comment: L.comment || "", inputs: L.inputs || [], usages: [], notes: L.note ? [L.note] : [], warnings: L.warnings || [] });
  }
  return out;
}

// 索引：现扫源码（fetch 同目录的 .mjs / .js）。**一次 fetch，工作台与美术浏览器共用**
let indexPromise = null;
export function EnsureAnimIndex() {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const files = ["Script_Rig.mjs", "Script_World.js", "Script_Core.mjs", "Data_ScriptC1.mjs", "Data_ScriptC2.mjs", "Data_ScriptC3.mjs",
      "Data_ScriptC4.mjs", "Data_ScriptC5.mjs", "Data_ScriptC6.mjs", "Data_ScriptC7.mjs", "Data_ScriptC8.mjs"];
    const texts = {};
    await Promise.all(files.map(async (f) => {
      try {
        const r = await fetch(new URL("./" + f, import.meta.url), { cache: "no-cache" });
        texts[f] = r.ok ? await r.text() : null;
      } catch { texts[f] = null; }
    }));
    let idx = null;
    try { idx = ScanAnimIndex((f) => texts[f] ?? null); } catch (err) { console.warn("动画索引扫描失败，只列运行时能拿到的", err); }
    if (!idx || !texts["Script_Rig.mjs"]) {
      // 离线兜底：姿势名从 PoseRig 的源码文本里抠（Function.prototype.toString 保留注释与分支）
      const src = PoseRig.toString();
      const poses = {};
      for (const m of src.matchAll(/s\.pose === "([A-Za-z0-9]+)"/g)) poses[m[1]] ||= { name: m[1], line: null, comment: "", inputs: [], usages: [], notes: ["离线兜底：源码没取到，行号/说明/用法缺"], warnings: [] };
      idx = { tracks: {}, poses, locomotion: LOCOMOTION, sets: { LIE_POSES: ["sleep"], CALM_BREATH: [], NO_HIP: [], POSE_PROGRESS: [] }, usages: {}, counts: { tracks: Object.keys(TRACKS).length, poses: Object.keys(poses).length, locomotion: LOCOMOTION.length }, offline: true };
    }
    const entries = BuildAnimEntries(idx);
    return { index: idx, entries, byId: new Map(entries.map((e) => [e.id, e])) };
  })();
  return indexPromise;
}
// 某种人用得上的动作：步态全给（谁都会走）；轨道/姿势按剧本里谁在用挑
export function EntriesForKind(entries, kind) {
  const mine = entries.filter((e) => e.type !== "loco" && e.kindGuess === kind);
  return {
    loco: entries.filter((e) => e.type === "loco"),
    tracks: mine.filter((e) => e.type === "track"),
    poses: mine.filter((e) => e.type === "pose"),
  };
}

/**
 * 小舞台：一块画布、一具骨架、一条动画循环播——给人物美术样式浏览器（和别的
 * 想"看一眼这个人动起来"的地方）用。渲染器懒建；背景透明，底色归宿主。
 *   SetKind(kind, scale) / SetEntry(entry) / SetHeading(±1) / Playing(v?) / Step(dt) / Resize()
 */
export function CreateRigStage({ canvas, viewH: fixedViewH = null, groundAt = 0.16, lieSet = null } = {}) {
  let renderer = null, scene = null, camera = null;
  let cssW = 1, cssH = 1, dpr = 1;
  const rigs = new Map();
  let live = null, kind = null, scale = 1, heading = 1;
  let entry = null, t = 0, playing = true;
  const params = { speed: null, strain: 0, moving: false };
  const env = () => ({ scale, params });
  // 画框按人的个头给（整身要大）：1.72m 的骨架 × 体型，头顶上留一拃、脚下留 groundAt；
  // 传了 viewH 就钉死不跟人变
  const ViewH = () => fixedViewH || Math.max(1.2, 1.72 * scale * 1.32 + 0.12);

  function Ensure() {
    if (renderer) return true;
    if (!canvas) return false;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -20, 20);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    if (typeof ResizeObserver === "function") new ResizeObserver(Resize).observe(canvas);
    Resize(true);
    return true;
  }
  function Resize(force) {
    if (!renderer) return;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(2, r.width), h = Math.max(2, r.height);
    if (!force && Math.abs(w - cssW) < 0.5 && Math.abs(h - cssH) < 0.5) return;
    cssW = w; cssH = h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    Frame();
  }
  function Frame() {
    if (!camera) return;
    const viewH = ViewH();
    const aspect = cssW / cssH;
    camera.top = viewH * (1 - groundAt); camera.bottom = -viewH * groundAt;
    camera.left = -viewH * aspect / 2; camera.right = viewH * aspect / 2;
    camera.updateProjectionMatrix();
  }
  function Use(k) {
    if (live && live.kind === k) return;
    if (live) scene.remove(live.rig.group);
    let r = rigs.get(k);
    if (!r) { const rig = CreateRig(k); SetRigOrder(rig.group, 10); r = { kind: k, rig }; rigs.set(k, r); }
    live = r;
    scene.add(live.rig.group);
    // 冲掉上一条动画的残留：常态站姿打底
    PoseRig(live.rig, { phase: 0, breath: 0 }, 1);
  }
  function Apply(blendDt) {
    if (!live || !entry) return;
    const s = EntryState(entry, t, env());
    PoseRig(live.rig, s, blendDt);
    PlaceRigGroup(live.rig.group, s, { scale, heading, lieSet });
  }
  return {
    SetKind(k, sc) {
      kind = k; if (sc) scale = sc;
      if (Ensure()) { Use(k); Frame(); if (entry) Apply(1); }
    },
    SetEntry(e, opts = {}) {
      entry = e; t = 0; playing = opts.playing ?? true;
      params.speed = opts.speed ?? null; params.strain = 0; params.moving = false;
      if (Ensure() && kind) { Use(kind); PoseRig(live.rig, { phase: 0, breath: 0 }, 1); Apply(1); }
    },
    SetHeading(h) { heading = h >= 0 ? 1 : -1; if (live && entry) Apply(1); },
    Flip() { heading = -heading; if (live && entry) Apply(1); return heading; },
    Playing(v) { if (v !== undefined) playing = !!v; return playing; },
    Time() { return t; },
    Cycle() { return entry ? EntryCycle(entry, env()) : 0; },
    Step(dt) {
      if (!Ensure() || !entry || !live) return;
      if (playing) {
        const cycle = EntryCycle(entry, env());
        t += dt;
        if (!IsCyclic(entry) && t >= cycle) t = t % cycle;   // 单次轨道播完再来一遍
        Apply(Math.max(1e-4, dt));
      }
      Resize();
      renderer.render(scene, camera);
    },
    Resize: () => Resize(true),
    Current: () => ({ kind, scale, heading, entry: entry && entry.id, t, playing }),
    LimbTips: () => (live ? LimbTips(live.rig) : null),
  };
}

/**
 * root：#animPanel（骨架在 index.html，这里只往里填）。
 * 返回 { Open(name?), Close(), Toggle(), IsOpen(), Step(dt), Key(e,k), Select(name), Current(), Ready() }
 */
export function CreateAnimLab({ root }) {
  const $ = (id) => root.querySelector("#" + id);
  const ui = {
    search: $("animSearch"), status: $("animStatus"), close: $("animClose"),
    list: $("animList"), view: $("animView"), canvas: $("animCanvas"), overlay: $("animOverlay"),
    transport: $("animTransport"), info: $("animInfo"), viewTag: $("animViewTag"),
  };

  // ── 状态 ────────────────────────────────────────────────────────────────
  let opened = false, ready = false, loading = null;
  let index = null;             // ScanAnimIndex 的结果（可能是离线兜底）
  let entries = [];             // 清单：{ id, type, name, label, … }
  let byId = new Map();
  let cur = null;               // 选中的条目
  let t = 0;                    // 动画时间（秒；循环类的可以无界增长）
  let playing = true;
  let speed = 1;
  let loopPreview = true;       // 单次轨道播完再来一遍
  let exact = false;            // true = 不做游戏里的混合，逐帧精确
  let heading = 1;
  let preset = KIND_PRESETS[0];
  let autoKind = true;
  let showGhosts = false, showTrails = true, showMeasure = true;
  let viewH = 2.6, panX = 0, panY = 0;
  const params = { strain: 0, moving: false, speed: null };   // 选中条目的可调输入
  let pendingSelect = null;

  // ── 渲染器（懒建：没打开过就不占一个 WebGL 上下文）──────────────────────
  let renderer = null, scene = null, camera = null;
  let cssW = 1, cssH = 1, dpr = 1;
  const rigCache = new Map();   // kind → { rig, ghosts: [], probe }
  let live = null;              // 当前那具：{ kind, rig, ghosts, probe }
  let trails = null;            // 采好的轨迹 { tips: {name: [{x,y}]}, cycle }
  let ghostKeys = [];           // 叠影各自钉在哪个时间上

  function EnsureRenderer() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;   // 与 World 同一档，颜色才一致
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -20, 20);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    if (typeof ResizeObserver === "function") new ResizeObserver(Resize).observe(ui.view);
    Resize();
  }
  function Resize() {
    if (!renderer) return;
    const r = ui.view.getBoundingClientRect();
    const w = Math.max(2, r.width), h = Math.max(2, r.height);
    if (Math.abs(w - cssW) < 0.5 && Math.abs(h - cssH) < 0.5) return;
    cssW = w; cssH = h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    ui.overlay.width = Math.round(w * dpr);
    ui.overlay.height = Math.round(h * dpr);
  }
  // 地平线钉在画框下沿往上 18%，人站在画面中央那根线上
  function ApplyCamera() {
    const aspect = cssW / cssH;
    const top = viewH * 0.82 + panY, bottom = -viewH * 0.18 + panY;
    const hw = viewH * aspect / 2;
    camera.left = -hw + panX; camera.right = hw + panX;
    camera.top = top; camera.bottom = bottom;
    camera.updateProjectionMatrix();
  }
  const ToScreen = (x, y) => ({
    x: (x - camera.left) / (camera.right - camera.left) * cssW,
    y: (camera.top - y) / (camera.top - camera.bottom) * cssH,
  });

  // ── 骨架 ────────────────────────────────────────────────────────────────
  function RigSet(kind) {
    let r = rigCache.get(kind);
    if (!r) {
      const rig = CreateRig(kind);
      SetOrder(rig.group, 10);
      const probe = CreateRig(kind);
      r = { kind, rig, ghosts: [], probe };
      rigCache.set(kind, r);
    }
    return r;
  }
  const SetOrder = SetRigOrder;
  function UseKind(kind) {
    if (live && live.kind === kind) return;
    if (live) { scene.remove(live.rig.group); for (const g of live.ghosts) scene.remove(g.group); }
    live = RigSet(kind);
    scene.add(live.rig.group);
    for (const g of live.ghosts) scene.add(g.group);
    trails = null;
    RebuildGhosts();
  }
  const PlaceRig = (group, s) => PlaceRigGroup(group, s, { scale: preset.scale, heading, lieSet: index?.sets?.LIE_POSES || null });

  // ── 时间模型：这条动画怎么随时间走（共用那一层，见文件顶上）──────────────
  const Env = () => ({ scale: preset.scale, params });
  const CycleOf = (e) => EntryCycle(e, Env());
  const StateFor = (e, tt) => EntryState(e, tt, Env());
  // 摆姿势。blendDt=1 ＝ 一步到位（拖时间轴/采样用）；播放时给真 dt 才是游戏里
  // 那个 dt*26 / 1−e^(−14dt) 的混合手感——"顺不顺"有一半在混合上
  function Pose(rig, s, blendDt) { PoseRig(rig, s, blendDt); }

  // ── 叠影 / 轨迹 ──────────────────────────────────────────────────────────
  function GhostTimes(e) {
    if (e.type === "track") return e.keys.map((k) => ({ t: k.t, label: `#${e.keys.indexOf(k) + 1} t=${Fmt(k.t)}` }));
    if (e.type === "pose" && e.progress) return [{ t: 0, label: "k=0" }, { t: PROGRESS_CYCLE / 4, label: "k=0.5" }, { t: PROGRESS_CYCLE / 2, label: "k=1" }];
    return [];
  }
  function RebuildGhosts() {
    if (!live || !scene) return;
    for (const g of live.ghosts) scene.remove(g.group);
    ghostKeys = showGhosts && cur ? GhostTimes(cur).slice(0, MAX_GHOSTS) : [];
    while (live.ghosts.length < ghostKeys.length) {
      const g = CreateRig(live.kind);
      SetOrder(g.group, 0, 0.16);
      live.ghosts.push(g);
    }
    ghostKeys.forEach((gk, i) => {
      const g = live.ghosts[i];
      const s = StateFor(cur, gk.t);
      Pose(g, s, 1); Pose(g, s, 1);
      PlaceRig(g.group, s);
      scene.add(g.group);
    });
  }
  function BuildTrails() {
    if (!live || !cur) { trails = null; return; }
    const cycle = CycleOf(cur);
    const probe = live.probe;
    const tips = { handF: [], handB: [], footF: [], footB: [], head: [] };
    // 从上一格接着采（同游戏：连续的时间），起手先把上一条动画的残留冲掉
    Pose(probe, StateFor(cur, 0), 1);
    for (let i = 0; i <= TRAIL_SAMPLES; i += 1) {
      const tt = cycle * i / TRAIL_SAMPLES;
      const s = StateFor(cur, tt);
      Pose(probe, s, 1);
      PlaceRig(probe.group, s);
      probe.group.updateMatrixWorld(true);
      const lt = LimbTips(probe);
      for (const k of Object.keys(tips)) tips[k].push({ x: lt[k].x, y: lt[k].y });
    }
    trails = { tips, cycle };
  }

  // ── 清单 ────────────────────────────────────────────────────────────────
  function Haystack(e) {
    const bits = [e.name, e.label, e.type, e.comment || "", (e.usages || []).map((u) => `${u.beat || ""} ${u.fn || ""} ${u.subject || ""} ${u.kindGuess ? KIND_LABEL[u.kindGuess] : ""}`).join(" "),
      e.kindGuess ? KIND_LABEL[e.kindGuess] || e.kindGuess : "", e.type === "loco" ? "步态 状态" : e.type === "track" ? "轨道 关键帧" : "姿势 pose"];
    return bits.join(" ").toLowerCase();
  }
  function RenderList() {
    const groups = [["track", "轨道 · 关键帧动画"], ["pose", "姿势 · pose"], ["loco", "步态 · 状态分支"]];
    ui.list.innerHTML = "";
    for (const [type, title] of groups) {
      const items = entries.filter((e) => e.type === type);
      const h = document.createElement("h5");
      h.innerHTML = `${Esc(title)} <small>${items.length}</small>`;
      ui.list.appendChild(h);
      const ul = document.createElement("ul");
      ul.dataset.type = type;
      for (const e of items) {
        const li = document.createElement("li");
        li.dataset.id = e.id;
        const meta = e.type === "track" ? `${Fmt(e.dur)}s · ${e.loop ? "循环" : "单次"} · ${e.keys.length} 帧`
          : e.type === "pose" ? (e.progress ? "进度驱动" : e.calmBreath ? "静态 · 呼吸" : "静态")
            : `分支 ${e.loco.cond}`;
        const who = e.kindGuess ? KIND_LABEL[e.kindGuess] || e.kindGuess : "";
        const unused = e.type !== "loco" && !(e.usages || []).some((u) => u.kind !== "check" && u.kind !== "ref");
        li.innerHTML = `<button type="button"><em>${Esc(e.label)}</em><small>${Esc(meta)}${who ? " · " + Esc(who) : ""}${unused ? " · <s>无引用</s>" : ""}</small></button>`;
        li.querySelector("button").addEventListener("click", () => Select(e.id));
        ul.appendChild(li);
      }
      ui.list.appendChild(ul);
    }
    ApplyFilter();
    MarkSelected();
  }
  function ApplyFilter() {
    const q = (ui.search.value || "").trim().toLowerCase();
    const toks = q.split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const li of ui.list.querySelectorAll("li")) {
      const e = byId.get(li.dataset.id);
      const ok = !toks.length || toks.every((tk) => Haystack(e).includes(tk));
      li.hidden = !ok;
      if (ok) shown += 1;
    }
    for (const h of ui.list.querySelectorAll("h5")) {
      const ul = h.nextElementSibling;
      const n = ul ? [...ul.children].filter((li) => !li.hidden).length : 0;
      h.querySelector("small").textContent = String(n);
      h.hidden = n === 0;
    }
    ui.status.textContent = q ? `${shown} / ${entries.length}` : `${index?.counts?.tracks ?? Object.keys(TRACKS).length} 轨道 · ${index?.counts?.poses ?? 0} 姿势 · ${LOCOMOTION.length} 步态`;
  }
  function MarkSelected() {
    for (const li of ui.list.querySelectorAll("li")) li.classList.toggle("current", !!cur && li.dataset.id === cur.id);
    const el = cur && ui.list.querySelector(`li[data-id="${CSS.escape(cur.id)}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }
  function VisibleEntries() {
    return [...ui.list.querySelectorAll("li")].filter((li) => !li.hidden).map((li) => byId.get(li.dataset.id));
  }

  // ── 选中一条 ────────────────────────────────────────────────────────────
  function Select(idOrName) {
    let e = byId.get(idOrName);
    if (!e) e = entries.find((x) => x.name === idOrName || x.label === idOrName) || null;
    if (!e) return false;
    cur = e;
    t = 0;
    playing = true;
    params.strain = 0; params.moving = false; params.speed = null;
    if (autoKind) {
      const kg = e.kindGuess || (e.type === "loco" ? "player" : null);
      if (kg) preset = KIND_PRESETS.find((p) => p.kind === kg) || preset;
    }
    if (renderer) {
      UseKind(preset.kind);
      // 冲掉上一条动画的残留：常态站姿打底，再钉到 t=0
      Pose(live.rig, { phase: 0, breath: 0 }, 1);
      Pose(live.rig, StateFor(cur, 0), 1);
      RebuildGhosts();
      BuildTrails();
    }
    RenderTransport();
    RenderInfo();
    MarkSelected();
    return true;
  }
  function SelectNeighbor(dir) {
    const list = VisibleEntries();
    if (!list.length) return;
    const at = cur ? list.findIndex((e) => e.id === cur.id) : -1;
    const next = list[(at + dir + list.length) % list.length];
    Select(next.id);
  }

  // ── 传送带（播放控制）─────────────────────────────────────────────────
  const tp = {};   // 传送带上的元素
  function RenderTransport() {
    if (!ui.transport.dataset.built) {
      ui.transport.dataset.built = "1";
      ui.transport.innerHTML = `
        <div class="tRow">
          <button type="button" data-act="start" title="回到起点（Home）">⇤</button>
          <button type="button" data-act="back" title="退一帧 1/30s（←，Shift 退 10 帧）">◁</button>
          <button type="button" data-act="play" class="play" title="播放 / 暂停（空格）">▶</button>
          <button type="button" data-act="fwd" title="进一帧 1/30s（→，Shift 进 10 帧）">▷</button>
          <button type="button" data-act="end" title="到终点（End）">⇥</button>
          <div class="timeline">
            <input type="range" id="animTime" min="0" max="1" step="0.001" value="0">
            <div class="ticks" id="animTicks"></div>
          </div>
          <span class="readout" id="animReadout"></span>
        </div>
        <div class="tRow opts">
          <label title="单次轨道播到头再从头来；循环的本来就一直转">循环预览 <input type="checkbox" id="animLoop" checked></label>
          <label>速度 <select id="animSpeed">${SPEEDS.map((s) => `<option value="${s}"${s === 1 ? " selected" : ""}>${s}×</option>`).join("")}</select></label>
          <label>人 <select id="animKind">${KIND_PRESETS.map((p) => `<option value="${p.key}">${Esc(p.label)}</option>`).join("")}</select></label>
          <label title="选中一条动画时，按剧本里谁在用它自动换人"><input type="checkbox" id="animAutoKind" checked> 跟着用法换人</label>
          <button type="button" data-act="flip" title="翻朝向（H）">朝向 ⇄</button>
          <label>景 <select id="animZoom">${ZOOMS.map((z) => `<option value="${z.v}"${z.v === viewH ? " selected" : ""}>${z.l}</option>`).join("")}</select></label>
          <button type="button" data-act="center" title="居中（拖画面可平移，滚轮缩放）">居中</button>
          <label title="每个关键帧摆一具半透明的影子（G）"><input type="checkbox" id="animGhosts"> 关键帧叠影</label>
          <label title="手/脚/头这一圈走过的路"><input type="checkbox" id="animTrails" checked> 轨迹</label>
          <label title="手脚离地多少米（同 world.PlayerLimbTips）"><input type="checkbox" id="animMeasure" checked> 量具</label>
          <label title="关掉游戏里那层姿态混合（dt×26 / 1−e^−14dt），逐帧精确到关键帧插值本身"><input type="checkbox" id="animExact"> 逐帧精确</label>
          <span id="animParams"></span>
        </div>`;
      for (const id of ["animTime", "animTicks", "animReadout", "animLoop", "animSpeed", "animKind", "animAutoKind", "animZoom", "animGhosts", "animTrails", "animMeasure", "animExact", "animParams"]) tp[id] = ui.transport.querySelector("#" + id);
      ui.transport.querySelector('[data-act="start"]').addEventListener("click", () => SeekTo(0));
      ui.transport.querySelector('[data-act="end"]').addEventListener("click", () => SeekTo(cur ? CycleOf(cur) - 1e-4 : 0));
      ui.transport.querySelector('[data-act="back"]').addEventListener("click", (e) => Nudge(-(e.shiftKey ? 10 : 1)));
      ui.transport.querySelector('[data-act="fwd"]').addEventListener("click", (e) => Nudge(e.shiftKey ? 10 : 1));
      ui.transport.querySelector('[data-act="play"]').addEventListener("click", () => TogglePlay());
      ui.transport.querySelector('[data-act="flip"]').addEventListener("click", () => Flip());
      ui.transport.querySelector('[data-act="center"]').addEventListener("click", () => { panX = 0; panY = 0; });
      tp.animTime.addEventListener("input", () => { SeekTo(parseFloat(tp.animTime.value)); });
      tp.animTime.addEventListener("pointerdown", () => { playing = false; SyncPlayButton(); });
      tp.animLoop.addEventListener("change", () => { loopPreview = tp.animLoop.checked; });
      tp.animSpeed.addEventListener("change", () => { speed = parseFloat(tp.animSpeed.value) || 1; });
      tp.animKind.addEventListener("change", () => { const p = KIND_PRESETS.find((x) => x.key === tp.animKind.value); if (p) SetPreset(p); });
      tp.animAutoKind.addEventListener("change", () => { autoKind = tp.animAutoKind.checked; });
      tp.animZoom.addEventListener("change", () => { viewH = parseFloat(tp.animZoom.value) || 2.6; });
      tp.animGhosts.addEventListener("change", () => { showGhosts = tp.animGhosts.checked; RebuildGhosts(); });
      tp.animTrails.addEventListener("change", () => { showTrails = tp.animTrails.checked; });
      tp.animMeasure.addEventListener("change", () => { showMeasure = tp.animMeasure.checked; });
      tp.animExact.addEventListener("change", () => { exact = tp.animExact.checked; });
    }
    tp.animKind.value = preset.key;
    tp.animAutoKind.checked = autoKind;
    tp.animGhosts.checked = showGhosts;
    tp.animTrails.checked = showTrails;
    tp.animMeasure.checked = showMeasure;
    tp.animExact.checked = exact;
    tp.animLoop.checked = loopPreview;
    RenderTicks();
    RenderParams();
    SyncPlayButton();
  }
  function SetPreset(p) {
    preset = p;
    tp.animKind.value = p.key;
    if (renderer) { UseKind(p.kind); if (cur) { Pose(live.rig, StateFor(cur, t), 1); BuildTrails(); RebuildGhosts(); } }
    RenderInfoLiveHeader();
  }
  function Flip() {
    heading = -heading;
    if (live && cur) { PlaceRig(live.rig.group, StateFor(cur, t)); BuildTrails(); RebuildGhosts(); }
    RenderInfoLiveHeader();
  }
  function SyncPlayButton() {
    const b = ui.transport.querySelector('[data-act="play"]');
    if (b) { b.textContent = playing ? "❚❚" : "▶"; b.classList.toggle("on", playing); }
  }
  function TogglePlay(force) {
    playing = force === undefined ? !playing : !!force;
    // 单次轨道停在末尾时按播放＝从头来
    if (playing && cur && !IsCyclic(cur) && t >= CycleOf(cur) - 1e-4) t = 0;
    SyncPlayButton();
  }
  function SeekTo(v) {
    if (!cur) return;
    const cycle = CycleOf(cur);
    t = IsCyclic(cur) ? Math.max(0, v) : Math.max(0, Math.min(cycle, v));
    playing = false;
    SyncPlayButton();
    ApplyCurrentPose(1);
  }
  function Nudge(frames) {
    if (!cur) return;
    const cycle = CycleOf(cur);
    let v = t + frames * FRAME;
    if (IsCyclic(cur)) v = ((v % cycle) + cycle) % cycle; else v = Math.max(0, Math.min(cycle, v));
    SeekTo(v);
  }
  // 时间轴上的刻度：关键帧的位置（进度姿势是 0/½/1）
  function RenderTicks() {
    if (!tp.animTicks || !cur) return;
    const cycle = CycleOf(cur);
    tp.animTicks.innerHTML = "";
    const marks = cur.type === "track" ? cur.keys.map((k, i) => ({ t: k.t, title: `#${i + 1} t=${Fmt(k.t)}${k.note ? " " + k.note : ""}` }))
      : (cur.type === "pose" && cur.progress) ? [{ t: 0, title: "k=0" }, { t: PROGRESS_CYCLE / 2, title: "k=1" }, { t: PROGRESS_CYCLE, title: "k=0" }]
        : [];
    for (const m of marks) {
      const i = document.createElement("i");
      i.style.left = `${clamp01(m.t / cycle) * 100}%`;
      i.title = m.title;
      i.addEventListener("click", () => SeekTo(Math.min(m.t, cycle - 1e-4)));
      tp.animTicks.appendChild(i);
    }
    tp.animTime.max = String(cycle);
  }
  // 选中条目专属的旋钮：吃力度 / 在走 / 速度
  function RenderParams() {
    if (!tp.animParams || !cur) return;
    const bits = [];
    if (cur.type === "pose" && cur.inputs?.some((i) => i.key === "poseStrain")) bits.push(`<label>吃力 <input type="range" id="animStrain" min="0" max="1" step="0.01" value="${params.strain}"> <output id="animStrainOut">${Fmt(params.strain)}</output></label>`);
    if (cur.type === "pose" && cur.inputs?.some((i) => i.key === "moving")) bits.push(`<label><input type="checkbox" id="animMoving"${params.moving ? " checked" : ""}> 在被拖/在走（s.moving）</label>`);
    if (cur.type === "loco" && cur.loco.speed) bits.push(`<label>速度 <input type="range" id="animSpeedMs" min="0.4" max="3.6" step="0.05" value="${params.speed ?? cur.loco.speed}"> <output id="animSpeedOut"></output></label>`);
    tp.animParams.innerHTML = bits.join(" ");
    const strain = tp.animParams.querySelector("#animStrain");
    if (strain) strain.addEventListener("input", () => { params.strain = parseFloat(strain.value); tp.animParams.querySelector("#animStrainOut").textContent = Fmt(params.strain); BuildTrails(); });
    const mv = tp.animParams.querySelector("#animMoving");
    if (mv) mv.addEventListener("change", () => { params.moving = mv.checked; BuildTrails(); });
    const sp = tp.animParams.querySelector("#animSpeedMs");
    if (sp) {
      const out = tp.animParams.querySelector("#animSpeedOut");
      const show = () => { const v = params.speed ?? cur.loco.speed; const g = cur.loco.cycle === "walk" ? ` gait ${Fmt(GaitOf(v, preset.scale))} · ${Fmt(WalkCadence(v, preset.scale), 1)} 步/秒` : ""; out.textContent = `${Fmt(v)} m/s${g} · 一圈 ${Fmt(CycleOf(cur))}s`; };
      sp.addEventListener("input", () => { params.speed = parseFloat(sp.value); show(); RenderTicks(); BuildTrails(); });
      show();
    }
  }

  // ── 右栏：这条动画的一切 ────────────────────────────────────────────────
  const inf = {};
  function RenderInfo() {
    if (!cur) { ui.info.innerHTML = ""; return; }
    const e = cur;
    const typeName = e.type === "track" ? "轨道" : e.type === "pose" ? "姿势" : "步态";
    const src = e.line ? `Script_Rig.mjs:${e.line}` : "（索引没扫到行号）";
    const facts = [];
    facts.push(["源码", `<code>${Esc(src)}</code>`]);
    if (e.type === "track") {
      facts.push(["时长", `<b>${Fmt(e.dur)} s</b>（${Math.round(e.dur / FRAME)} 帧 @30fps）`]);
      facts.push(["循环", e.loop ? "是（trackT 无界，按 dur 取模；跨末帧也用 Hermite 接）" : "否（单次；FlashTrack 的 until 到点收回常态）"]);
      facts.push(["关键帧", `<b>${e.keys.length}</b> 帧 · 间隔 ${e.keys.slice(1).map((k, i) => Fmt(k.t - e.keys[i].t)).join(" / ")} s`]);
      facts.push(["关节", e.joints.length === RIG_FIELDS.length ? "全部 14 个字段" : `${e.joints.length}/14：${e.joints.map((j) => `<i class="chip">${j}</i>`).join("")}`]);
      facts.push(["插值", "分段三次 Hermite（Catmull-Rom 切线 + Fritsch–Carlson 夹住不过冲）；折返点上速度归零"]);
    } else if (e.type === "pose") {
      facts.push(["类型", e.progress ? `<b>进度驱动</b> · 来源 ${Esc(e.progressSource || "poseK")}` : e.calmBreath ? "静态 · <b>有呼吸</b>（CALM_BREATH）" + (e.noHip ? " · 不动胯（NO_HIP）" : "") : "静态"]);
      if (e.inputs?.length) facts.push(["输入", e.inputs.map((i) => `<i class="chip" title="${Esc(i.label)}">${Esc(i.key)}</i>`).join("")]);
      if (e.usesIK) facts.push(["反解", "AimFrontHand：前手两骨反解到挂点（工作台里没有挂点，走的是各姿势自己的后备）"]);
      if (e.customBlend) facts.push(["混合", "自己调 ApplyPose（硬动作给足混合，不吃默认的 1−e^−14dt）"]);
      if (e.lie) facts.push(["躺姿", "LIE_POSES：整具骨架转 90°（World 挪半个身长、垫半个身厚），Rig 只写站着蜷成什么样"]);
      facts.push(["源码行数", `${e.lines} 行`]);
    } else {
      facts.push(["分支", `<code>${Esc(e.loco.cond)}</code>`]);
      facts.push(["相位", e.loco.cycle === "walk" ? "步频按 Rig.WalkCadence：速度÷体型 → 步/秒（快走 2、冲刺封顶 3.5，小孩 ÷√体型），一步 = π；走多远与迈几步脱钩" : e.loco.cycle === "climb" ? "爬梯：phase += 竖向位移×4.5" : e.loco.cycle === "idle" ? "原地：phase += dt×2.2" : "只有呼吸：idleT += dt×1.4"]);
      if (e.inputs?.length) facts.push(["输入", e.inputs.map((i) => `<i class="chip" title="${Esc(i.label)}">${Esc(i.key)}</i>`).join("")]);
    }
    const who = e.kindGuess ? `${KIND_LABEL[e.kindGuess] || e.kindGuess}` : (e.type === "loco" ? "任何人" : "（剧本里没引用）");
    facts.push(["谁在用", Esc(who)]);

    const usages = (e.usages || []);
    const real = usages.filter((u) => u.kind !== "check" && u.kind !== "ref");
    const checks = usages.length - real.length;
    const usageHtml = real.length ? `<ul class="usages">${real.map((u) => `<li><code>${Esc(u.file)}:${u.line}</code> <b>${Esc(u.beat || u.fn || "")}</b> <i>${Esc(u.kind)}</i>${u.subject ? ` <span class="who">${Esc(u.subject)}${u.kindGuess ? "＝" + Esc(KIND_LABEL[u.kindGuess] || u.kindGuess) : ""}</span>` : ""}<small>${Esc(u.text)}</small></li>`).join("")}</ul>`
      : `<p class="muted">${e.type === "loco" ? "步态由状态字段触发（走路/蹲/爬…），不按名字引用。" : "剧本、执行器、World 里都没人挂这个名字——可能是旧稿遗留。"}</p>`;
    const notes = [...(e.warnings || []).map((w) => `<li class="warn">${Esc(w)}</li>`), ...(e.notes || []).map((n) => `<li>${Esc(n)}</li>`)];

    let keysHtml = "";
    if (e.type === "track" && e.keys.length) {
      const cols = e.joints;
      keysHtml = `<h4>关键帧 <small>点一行跳过去；黄底 = 当前这一段</small></h4>
        <div class="tableWrap"><table id="animKeys"><thead><tr><th>#</th><th>t</th>${cols.map((c) => `<th title="${Esc(RIG_FIELD_LABEL[c])}">${c}</th>`).join("")}<th>备注</th></tr></thead><tbody>${e.keys.map((k, i) => `<tr data-i="${i}"><td>${i + 1}</td><td>${Fmt(k.t)}</td>${cols.map((c) => `<td>${k.values[c] === undefined ? "<s>·</s>" : Esc(String(k.values[c]))}</td>`).join("")}<td class="note">${Esc(k.note)}</td></tr>`).join("")}</tbody></table></div>`;
    }

    ui.info.innerHTML = `
      <div class="infoHead">
        <span class="badge ${e.type}">${typeName}</span>
        <h3>${Esc(e.label)}</h3>
        <button type="button" id="animCopyRef" title="一行引用：类型 名字 · 文件:行 · 时长 · 帧数 · 用于哪几拍——直接贴进对话">复制引用</button>
        <button type="button" id="animCopyName" title="只复制名字">复制名字</button>
      </div>
      <p class="refLine" id="animRefLine">${Esc(FormatRef(e))}</p>
      <dl class="facts">${facts.map(([k, v]) => `<dt>${Esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>
      ${notes.length ? `<ul class="notes">${notes.join("")}</ul>` : ""}
      ${e.comment ? `<h4>源码里的说明</h4><pre class="comment">${Esc(e.comment)}</pre>` : `<p class="muted">源码上方没有说明注释。</p>`}
      ${keysHtml}
      <h4>用在哪 <small>${real.length} 处${checks ? `（另有 ${checks} 处只是判断）` : ""}</small></h4>
      ${usageHtml}
      <h4>此刻 <small>关节值（度；胯米）与手脚离地</small></h4>
      <pre class="live" id="animLive"></pre>
      <p class="hint">空格 播放/暂停 · ←→ 逐帧（Shift ×10）· ↑↓ 上下一条 · H 翻朝向 · G 叠影 · Home/End · Esc 关闭 · 拖画面平移、滚轮缩放</p>`;
    inf.live = ui.info.querySelector("#animLive");
    inf.keys = ui.info.querySelector("#animKeys");
    ui.info.querySelector("#animCopyRef").addEventListener("click", () => Copy(FormatRef(e), "已复制引用"));
    ui.info.querySelector("#animCopyName").addEventListener("click", () => Copy(e.name, "已复制名字"));
    if (inf.keys) for (const tr of inf.keys.querySelectorAll("tbody tr")) tr.addEventListener("click", () => SeekTo(Math.min(e.keys[+tr.dataset.i].t, CycleOf(e) - 1e-4)));
    ui.info.scrollTop = 0;
    RenderInfoLiveHeader();
  }
  function RenderInfoLiveHeader() {
    if (!ui.viewTag) return;
    ui.viewTag.textContent = cur ? `${cur.label} · ${preset.label} · 朝${heading >= 0 ? "右(+x)" : "左(−x)"}` : "";
  }
  async function Copy(text, toast) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* 剪贴板不可用就算了，引用行本身在面板上可选可抄 */ }
      ta.remove();
    }
    ui.status.textContent = `${toast}：${text.length > 48 ? text.slice(0, 48) + "…" : text}`;
    setTimeout(() => ApplyFilter(), 2400);
  }

  // ── 每帧 ────────────────────────────────────────────────────────────────
  function ApplyCurrentPose(blendDt) {
    if (!live || !cur) return;
    const s = StateFor(cur, t);
    Pose(live.rig, s, blendDt);
    PlaceRig(live.rig.group, s);
  }
  function Step(dt) {
    if (!opened || !renderer) return;
    if (cur && playing) {
      const cycle = CycleOf(cur);
      t += dt * speed;
      if (!IsCyclic(cur) && t >= cycle) {
        if (loopPreview) t = t % cycle;
        else { t = cycle - 1e-4; playing = false; SyncPlayButton(); }
      }
      ApplyCurrentPose(exact ? 1 : Math.max(1e-4, dt * speed));
    }
    ApplyCamera();
    renderer.render(scene, camera);
    DrawOverlay();
    SyncReadouts();
  }
  function SyncReadouts() {
    if (!cur || !tp.animTime) return;
    const cycle = CycleOf(cur);
    const td = IsCyclic(cur) ? ((t % cycle) + cycle) % cycle : t;
    if (playing) tp.animTime.value = String(td);
    const frame = Math.round(td / FRAME), frames = Math.round(cycle / FRAME);
    let extra = "";
    if (cur.type === "track") {
      let i = 0;
      while (i < cur.keys.length - 1 && cur.keys[i + 1].t <= td) i += 1;
      extra = cur.keys.length > 1 ? ` · 第 ${i + 1}→${Math.min(cur.keys.length, i + 2)} 帧` : "";
      if (inf.keys) for (const tr of inf.keys.querySelectorAll("tbody tr")) tr.classList.toggle("cur", +tr.dataset.i === i || +tr.dataset.i === i + 1);
    } else if (cur.type === "pose" && cur.progress) extra = ` · k=${Fmt(ProgressAt(t))}`;
    else if (cur.type === "loco") extra = ` · 相位 ${Fmt(((StateFor(cur, t).phase || 0) % (2 * Math.PI)) / (2 * Math.PI) * 360, 0)}°`;
    tp.animReadout.textContent = `${Fmt(td, 3)} / ${Fmt(cycle, 3)} s · 帧 ${frame}/${frames}${extra}${IsCyclic(cur) && playing ? ` · 已播 ${Fmt(t, 1)}s` : ""}`;
    if (inf.live && live) {
      const p = live.rig.pose || {};
      const lt = LimbTips(live.rig);
      const ang = RIG_FIELDS.map((f) => `${f.padEnd(6)} ${(f === "hipY" || f === "hipX" ? Fmt(p[f], 3) + "m" : Fmt((p[f] || 0) * DEG, 1) + "°").padStart(9)}`);
      const rows = [];
      for (let i = 0; i < ang.length; i += 2) rows.push(ang[i] + "   " + (ang[i + 1] || ""));
      const g = (v) => (v >= 0 ? "+" : "") + Fmt(v, 3);
      rows.push("");
      const ct = ContactWorld();
      rows.push(`手 前${g(lt.handF.y)} 后${g(lt.handB.y)}   头顶 ${g(lt.head.y)}m`);
      if (ct) {
        rows.push(`鞋底 前${g(ct.soleF)} 后${g(ct.soleB)}   膝头 前${g(ct.kneeF)} 后${g(ct.kneeB)}`);
        rows.push(`最低点 ${g(ct.lowest)}${ct.groundW < 1 ? `（贴地权重 ${Fmt(ct.groundW)}${ct.groundW === 0 ? "：离地状态，胯高信手填的 hipY" : ""}）` : "＝钉在地平线上"}${ct.airY ? ` 腾空 +${Fmt(ct.airY * preset.scale, 3)}` : ""}`);
      }
      rows.push(`（正＝悬空 负＝陷地；鞋底/膝头里最低那个该 = 0，除非真离地）`);
      inf.live.textContent = rows.join("\n");
    }
  }
  const TIP_STYLE = { handF: ["#f0c060", "前手"], handB: ["#9a7a3a", "后手"], footF: ["#7fd08a", "前鞋底"], footB: ["#4a8a52", "后鞋底"], kneeF: ["#7fc8e8", "前膝"], kneeB: ["#3f7a92", "后膝"], head: ["#e8e8e8", "头顶"] };
  // 鞋底/膝头离地（世界米）：RigContact 给的是骨架局部、未缩放的数，乘体型；躺着的不算
  function ContactWorld() {
    if (!live) return null;
    const c = RigContact(live.rig);
    if (!c) return null;
    const bs = preset.scale;
    return { soleF: c.soleF * bs, soleB: c.soleB * bs, kneeF: c.kneeF * bs, kneeB: c.kneeB * bs, lowest: c.lowest * bs, groundW: c.groundW, airY: c.airY * bs, shift: c.shift * bs, rootY: c.rootY * bs, phiF: c.phiF, phiB: c.phiB };
  }
  function DrawOverlay() {
    const c = ui.overlay.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cssW, cssH);
    c.font = "11px ui-monospace, Consolas, monospace";
    c.textBaseline = "middle";
    // 字压在人身上要读得出：先描一圈暗边再填
    const label = (txt, x, y) => {
      c.lineWidth = 3; c.strokeStyle = "rgba(8,11,15,0.85)"; c.lineJoin = "round";
      c.strokeText(txt, x, y); c.fillText(txt, x, y);
    };
    // 网格：每 0.25m 一道，0.5m 标数；地平线亮一档；胯线（x=0）一根竖的
    const step = 0.25;
    const y0 = Math.floor(camera.bottom / step) * step, y1 = camera.top;
    for (let y = y0; y <= y1 + 1e-6; y += step) {
      const major = Math.abs(y / 0.5 - Math.round(y / 0.5)) < 1e-6;
      const p = ToScreen(0, y);
      c.strokeStyle = Math.abs(y) < 1e-6 ? "rgba(214,190,140,0.55)" : major ? "rgba(150,180,210,0.16)" : "rgba(150,180,210,0.07)";
      c.lineWidth = Math.abs(y) < 1e-6 ? 1.5 : 1;
      c.beginPath(); c.moveTo(0, p.y); c.lineTo(cssW, p.y); c.stroke();
      if (major) { c.fillStyle = "rgba(150,180,210,0.5)"; c.fillText(`${y.toFixed(1)}m`, 6, p.y - 7); }
    }
    const x0 = Math.floor(camera.left / step) * step;
    for (let x = x0; x <= camera.right + 1e-6; x += step) {
      const major = Math.abs(x / 0.5 - Math.round(x / 0.5)) < 1e-6;
      const p = ToScreen(x, 0);
      c.strokeStyle = Math.abs(x) < 1e-6 ? "rgba(150,180,210,0.28)" : major ? "rgba(150,180,210,0.10)" : "rgba(150,180,210,0.045)";
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(p.x, 0); c.lineTo(p.x, cssH); c.stroke();
    }
    if (!live || !cur) return;
    // 轨迹：一圈里手脚头走过的路
    if (showTrails && trails) {
      const cycle = trails.cycle;
      const td = IsCyclic(cur) ? ((t % cycle) + cycle) % cycle : t;
      const at = Math.round(clamp01(td / cycle) * TRAIL_SAMPLES);
      for (const [k, pts] of Object.entries(trails.tips)) {
        const [col] = TIP_STYLE[k];
        c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = 1.2;
        c.beginPath();
        pts.forEach((pt, i) => { const q = ToScreen(pt.x, pt.y); if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); });
        c.stroke();
        c.globalAlpha = 1;
        const cp = ToScreen(pts[at].x, pts[at].y);
        c.fillStyle = col; c.beginPath(); c.arc(cp.x, cp.y, 2.4, 0, Math.PI * 2); c.fill();
      }
    }
    // 量具：手脚离地
    if (showMeasure) {
      const lt = LimbTips(live.rig);
      const ct = ContactWorld();
      const placed = [];
      for (const [k, [col, name]] of Object.entries(TIP_STYLE)) {
        let v = lt[k]; if (!v) continue;
        // 脚：量鞋底最低点，不量踝（踝本来就在鞋底上头一拃）；膝：量膝头球
        if (ct && (k === "footF" || k === "footB")) v = { x: v.x, y: ct[k === "footF" ? "soleF" : "soleB"] };
        if (ct && (k === "kneeF" || k === "kneeB")) v = { x: v.x, y: ct[k] };
        const p = ToScreen(v.x, v.y);
        c.strokeStyle = col; c.lineWidth = 1.5;
        c.beginPath(); c.arc(p.x, p.y, 4, 0, Math.PI * 2); c.stroke();
        // 标签往右挪，叠在一处的错开
        let ly = p.y;
        while (placed.some((q) => Math.abs(q - ly) < 12)) ly += 12;
        placed.push(ly);
        c.fillStyle = col;
        label(`${name} ${v.y >= 0 ? "+" : ""}${v.y.toFixed(3)}`, p.x + 8, ly);
      }
      // 胯
      const root = live.rig.joints.root;
      root.updateWorldMatrix(true, false);
      const rp = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
      const rs = ToScreen(rp.x, rp.y);
      c.strokeStyle = "rgba(240,192,96,0.8)"; c.lineWidth = 1; c.strokeRect(rs.x - 3, rs.y - 3, 6, 6);
      c.fillStyle = "rgba(240,192,96,0.9)"; label(`胯 ${rp.y.toFixed(3)}`, rs.x + 8, rs.y - 12);
    }
    // 叠影的标签
    if (showGhosts && ghostKeys.length) {
      c.fillStyle = "rgba(160,190,220,0.75)";
      label(`叠影：${ghostKeys.map((g) => g.label).join("  ")}`, 8, cssH - 12);
    }
  }

  // ── 画面上的手势：拖平移、滚轮缩放 ─────────────────────────────────────
  let drag = null;
  ui.view.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, px: panX, py: panY }; try { ui.view.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ } });
  ui.view.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const mpp = (camera ? (camera.top - camera.bottom) : viewH) / Math.max(1, cssH);
    panX = drag.px - (e.clientX - drag.x) * mpp;
    panY = drag.py + (e.clientY - drag.y) * mpp;
  });
  ui.view.addEventListener("pointerup", () => { drag = null; });
  ui.view.addEventListener("pointercancel", () => { drag = null; });
  ui.view.addEventListener("wheel", (e) => { e.preventDefault(); viewH = Math.max(0.6, Math.min(8, viewH * (e.deltaY > 0 ? 1.1 : 1 / 1.1))); }, { passive: false });

  // ── 索引：现扫源码（fetch 同目录的 .mjs / .js）─────────────────────────
  async function LoadIndex() {
    ui.status.textContent = "扫描源码…";
    const got = await EnsureAnimIndex();
    index = got.index;
    entries = got.entries;
    byId = got.byId;
    ready = true;
    RenderList();
    if (index.offline) ui.status.textContent = "离线：源码没取到，只有运行时能拿到的信息";
  }

  // ── 开关 ────────────────────────────────────────────────────────────────
  async function Open(name) {
    opened = true;
    root.hidden = false;
    document.body.classList.add("animLabOpen");
    EnsureRenderer();
    Resize();
    if (!ready) {
      if (!loading) loading = LoadIndex().catch((err) => { console.warn(err); ready = true; });
      await loading;
    }
    if (!opened) return;   // 加载途中被关了
    const want = name || pendingSelect || (cur && cur.id) || (entries[0] && entries[0].id);
    pendingSelect = null;
    if (want && !(cur && (cur.id === want || cur.name === want) && renderer)) Select(want);
    else if (cur && !live) Select(cur.id);
    Resize();
  }
  function Close() {
    opened = false;
    root.hidden = true;
    document.body.classList.remove("animLabOpen");
  }
  function Key(e, k) {
    if (!opened) return false;
    const inField = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA");
    if (k === "escape") {
      if (inField && e.target === ui.search && ui.search.value) { ui.search.value = ""; ApplyFilter(); ui.search.blur(); return true; }
      if (inField) { e.target.blur(); return true; }
      Close(); return true;
    }
    if (inField) {
      if (e.target === ui.search && k === "enter") { const v = VisibleEntries(); if (v.length) Select(v[0].id); ui.search.blur(); return true; }
      if (e.target === ui.search && (k === "arrowdown" || k === "arrowup")) { SelectNeighbor(k === "arrowdown" ? 1 : -1); e.preventDefault(); return true; }
      return true;   // 输入框里的键归输入框，不给游戏
    }
    if (k === " ") { TogglePlay(); e.preventDefault(); return true; }
    if (k === "arrowleft") { Nudge(-(e.shiftKey ? 10 : 1)); e.preventDefault(); return true; }
    if (k === "arrowright") { Nudge(e.shiftKey ? 10 : 1); e.preventDefault(); return true; }
    if (k === "arrowup") { SelectNeighbor(-1); e.preventDefault(); return true; }
    if (k === "arrowdown") { SelectNeighbor(1); e.preventDefault(); return true; }
    if (k === "home") { SeekTo(0); e.preventDefault(); return true; }
    if (k === "end") { if (cur) SeekTo(CycleOf(cur) - 1e-4); e.preventDefault(); return true; }
    if (k === "h") { Flip(); return true; }
    if (k === "g") { showGhosts = !showGhosts; if (tp.animGhosts) tp.animGhosts.checked = showGhosts; RebuildGhosts(); return true; }
    if (k === "/") { ui.search.focus(); e.preventDefault(); return true; }
    return true;   // 面板开着，其余键一律不给游戏
  }

  ui.close.addEventListener("click", Close);
  ui.search.addEventListener("input", ApplyFilter);
  // 面板上的滚轮别传给页面（body 是 touch-action:none / overflow hidden，滚到底会弹）
  root.addEventListener("wheel", (e) => { if (!ui.view.contains(e.target)) e.stopPropagation(); }, { passive: true });

  return {
    Open, Close, Toggle: () => (opened ? Close() : Open()), IsOpen: () => opened,
    Step, Key, Select: (name) => (ready ? Select(name) : (pendingSelect = name, false)),
    Ready: () => ready, Current: () => cur && { id: cur.id, type: cur.type, name: cur.name, t, playing, kind: preset.kind, scale: preset.scale, heading },
    Entries: () => entries.map((e) => ({ id: e.id, type: e.type, name: e.name })),
    Index: () => index,
    // 给测试/实拍：把时间钉到某处并同步画面
    Seek: (v) => SeekTo(v), Play: (v) => TogglePlay(v), Cycle: () => (cur ? CycleOf(cur) : 0),
    SetKind: (key) => { const p = KIND_PRESETS.find((x) => x.key === key || x.kind === key); if (p) SetPreset(p); return !!p; },
    // 开关几样显示（实拍用）：{ ghosts, trails, measure, exact, heading, zoom }
    SetOptions: (o = {}) => {
      if (o.ghosts !== undefined) { showGhosts = !!o.ghosts; if (tp.animGhosts) tp.animGhosts.checked = showGhosts; RebuildGhosts(); }
      if (o.trails !== undefined) { showTrails = !!o.trails; if (tp.animTrails) tp.animTrails.checked = showTrails; }
      if (o.measure !== undefined) { showMeasure = !!o.measure; if (tp.animMeasure) tp.animMeasure.checked = showMeasure; }
      if (o.exact !== undefined) { exact = !!o.exact; if (tp.animExact) tp.animExact.checked = exact; }
      if (o.heading !== undefined && Math.sign(o.heading) !== heading) Flip();
      if (o.zoom !== undefined) { viewH = Number(o.zoom) || viewH; if (tp.animZoom) tp.animZoom.value = String(viewH); }
    },
    LimbTips: () => { if (!live) return null; const lt = LimbTips(live.rig); const o = {}; for (const k of Object.keys(lt)) o[k] = { x: +lt[k].x.toFixed(3), y: +lt[k].y.toFixed(3) }; return o; },
    // 鞋底/膝头离地（世界米，负 = 陷地）+ 贴地权重：审计"脚有没有钉在地上"用这个
    Contact: () => { const c = ContactWorld(); if (!c) return null; const o = {}; for (const k of Object.keys(c)) o[k] = +(+c[k]).toFixed(3); return o; },
    Ref: () => (cur ? FormatRef(cur) : ""),
  };
}
