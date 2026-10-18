// ===========================================================================
// Script_EditorBlockoutFirstLevel0610PrevizTest.mjs —— FirstLevel0610 预演数据的纯 node 自检
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610PrevizTest.mjs           → 查 Blockout/FirstLevel0610.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610PrevizTest.mjs --fresh   → 查生成器当场生成的那份（并核对两次生成逐字相同）
//
// 查（照 0105 的 PrevizTest，加了场地专有的几条）：运行时包的 ValidateBlockoutPreviz（关键帧 / 单位 / 台词 id / 字段）；
// 每个片段在那具骨架上烘过（有 castId 的按 Data_FirstLevelSpeakingCast 的骨架，没有 castId 的士兵只许五具骨架都有的通用片段，
// 百姓 / 军官是程序化身体、一个片段都不许）；同一段里台词不互相压；演员走位点在场地范围内、不落在沟壁 / 坎上、
// 身子不进实心块（按那一刻的信号算随信号体块，路线按 0.5 m 取样）；走位要求的速度不离谱；说话的人在那一刻是可见的；
// 机位点不在实心块里；门缝 / 墙缝那几段的眼睛真能从缝里看到演的东西（2D 视线不被 ≥1 m 高的块挡）；
// 剧本要求的事件（信号按拍开、掷弹筒越落越近、09 的「响了才走」节奏）都在。
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HeightGridSampler, LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { CharacterClipModelId } from "./Data_CharacterSelection.mjs";
import { BlockStandSampler, PrevizSignalsAt, NormalizeBlockoutPreviz, SamplePrevizCamera } from "./Script_EditorBlockoutPrevizPlan.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const Load = f => JSON.parse(readFileSync(join(HERE, f), "utf8"));
const R = v => Math.round(v * 100) / 100;

const MODEL_ID = { nra: { 1: "TengxianNra02", 4: "TengxianNra05", 5: "TengxianNra06" }, ija: { 0: "TengxianIja01", 1: "TengxianIja02", 2: "TengxianIja03", 5: "TengxianIja06" } };
const SPEED = { walk: 1.4, run: 3.5, crawl: 0.5, drag: 0.9 };
const PEOPLE = new Set(["soldier", "officer", "civilian", "child", undefined]);

function ClipTable() {
  const lib = Load("Animation/OpeningStoryboards/Data_OpeningStoryboardsAnimation.json");
  const byModel = new Map(lib.models.map(m => [m.id, new Set(m.clipIds)]));
  const sets = [...byModel.values()];
  const common = new Set([...sets[0]].filter(c => sets.every(s => s.has(c))));
  return { byModel, common };
}

function ClipSetFor(unit, table) {
  if (unit?.side === "civ" || unit?.kind === "civilian" || unit?.kind === "child" || unit?.kind === "officer") return { name: "程序化身体（没有动作库）", clips: new Set() };
  const castId = unit?.castId;
  const spec = castId && FIRST_LEVEL_SPEAKING_CAST[castId];
  if (!spec) return { name: "随机骨架（只许通用片段）", clips: table.common };
  const modelId = CharacterClipModelId(MODEL_ID[spec.actorKind]?.[spec.modelVariant]);
  return { name: modelId, clips: table.byModel.get(modelId) || new Set() };
}

// ---------------------------------------------------------------------------
// 场地：实心块、随信号体块、站立面

function Penetration(b, x, z, r) {
  const c = Math.cos(b.ry || 0), s = Math.sin(b.ry || 0);
  const dx = x - b.x, dz = z - b.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ex = Math.abs(lx) - b.w / 2, ez = Math.abs(lz) - b.d / 2;
  if (ex <= 0 && ez <= 0) return r + Math.min(-ex, -ez);
  return r - Math.hypot(Math.max(ex, 0), Math.max(ez, 0));
}
function SolidsFor(layout, signals) {
  const on = new Set(signals);
  const out = layout.blocks.filter(b => b.solid !== false && !b.blockoutWater);
  for (const g of layout.gates || []) {
    const absent = (g.signal && on.has(g.signal)) || (g.appearSignal && !on.has(g.appearSignal));
    if (!absent && g.solid !== false) out.push(g);
  }
  return out;
}
/** 身子（半径 r）有没有进了比地面高 tallM 以上的块；返回撞到的块。 */
function BodyHit(solids, ground, x, z, { r = 0.3, tol = 0.08, fromM = 0.5, toM = 1.4, tallM = 0.9 } = {}) {
  let g = null;
  for (const b of solids) {
    if (b.h <= tallM) continue;
    const pen = Penetration(b, x, z, r);
    if (pen <= tol) continue;
    if (g === null) g = ground(x, z);
    const top = b.y + b.h / 2, bottom = b.y - b.h / 2;
    if (top < g + fromM || bottom > g + toM) continue;
    return b;
  }
  return null;
}
/** 2D 视线：a → b 这一段有没有穿过 ≥ tallM 高的实心块（块顶要高过视线高度 eyeY）。 */
function LineHits(solids, a, b, { eyeY = 1.6, tallM = 1.0 } = {}) {
  const hits = [];
  for (const blk of solids) {
    if (blk.h < tallM) continue;
    if (blk.y + blk.h / 2 < eyeY) continue;
    const c = Math.cos(blk.ry || 0), s = Math.sin(blk.ry || 0);
    const L = p => { const dx = p.x - blk.x, dz = p.z - blk.z; return { x: dx * c - dz * s, z: dx * s + dz * c }; };
    const p0 = L(a), p1 = L(b);
    // slab 法：局部坐标下的轴对齐盒
    let t0 = 0, t1 = 1, ok = true;
    for (const [v0, v1, half] of [[p0.x, p1.x, blk.w / 2], [p0.z, p1.z, blk.d / 2]]) {
      const d = v1 - v0;
      if (Math.abs(d) < 1e-9) { if (Math.abs(v0) > half) { ok = false; break; } continue; }
      let ta = (-half - v0) / d, tb = (half - v0) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) { ok = false; break; }
    }
    if (ok) hits.push(blk.id);
  }
  return hits;
}
/** 关键帧的信号 + 预演事件改过的信号（Map name → on）→ 这一刻打开的信号名。 */
function SignalsWith(base, overrides) {
  const set = new Set(base || []);
  for (const [name, on] of overrides || []) { if (on) set.add(name); else set.delete(name); }
  return [...set];
}
/** 镜头锚点 → {x,y,z}：点按地面 + h，演员锚按单位布设（或 spawn）脚下 + offset，"player" 按关键帧机位。 */
function CameraResolver(kf, seq, ground) {
  const at = id => (id === "player" ? kf.player : (kf.units || []).find(u => u.id === id) || seq.actors.find(a => a.id === id)?.spawn || null);
  return anchor => {
    if (!anchor) return null;
    if (anchor.actor) {
      const u = at(anchor.actor);
      if (!u) return null;
      const [dx, dy, dz] = anchor.offset || [0, 0, 0];
      return { x: u.x + dx, y: ground(u.x, u.z) + dy, z: u.z + dz, yawDeg: u.yawDeg ?? 0, pitchDeg: u.pitchDeg ?? 0 };
    }
    return { x: anchor.x, y: ground(anchor.x, anchor.z) + (anchor.h ?? 1.6), z: anchor.z };
  };
}
function Samples(points, stepM = 0.5) {
  const out = [{ x: points[0].x, z: points[0].z }];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / stepM));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  }
  return out;
}

/** 主检查：→ { errors, warnings, rows }（rows：每段一行摘要）。 */
export async function CheckPreviz(doc, { config, voice }) {
  const errors = [], warnings = [], rows = [];
  let validate = null;
  try { validate = (await import("./Script_EditorBlockoutPrevizPlan.mjs")).ValidateBlockoutPreviz; } catch { warnings.push("运行时包的 ValidateBlockoutPreviz 还没有，只做本地检查"); }
  if (validate) {
    const v = validate(doc, { config, voice });
    errors.push(...v.errors.map(e => `[校验器] ${e}`));
    warnings.push(...v.warnings.map(w => `[校验器] ${w}`));
  }
  const table = ClipTable();
  const lines = new Map();
  for (const sc of voice.scenes) for (const l of sc.lines) lines.set(l.id, l);
  const scene = Load("Blockout/FirstLevel0610.scene.json");
  const layout = LayoutFromSceneDoc(scene);
  const ground = HeightGridSampler(scene.terrain);
  const B = scene.bounds;
  const Slope = (x, z) => {
    const h = [ground(x, z), ground(x + 0.35, z), ground(x - 0.35, z), ground(x, z + 0.35), ground(x, z - 0.35)];
    return Math.max(...h) - Math.min(...h);
  };
  const InBounds = p => p.x >= B.minX && p.x <= B.maxX && p.z >= B.minZ && p.z <= B.maxZ;
  const norm = NormalizeBlockoutPreviz(doc);
  for (const seq of doc.sequences) {
    const kf = config.keyframes.find(k => k.id === seq.keyframe);
    const at = `预演 ${seq.keyframe}`;
    if (!kf) { errors.push(`${at}：关键帧不存在`); continue; }
    const nseq = norm.sequences.find(s => s.keyframe === seq.keyframe);
    const units = new Map((kf.units || []).map(u => [u.id, u]));
    const clipsUsed = new Set();
    const SignalsAt = t => SignalsWith(kf.signals, PrevizSignalsAt(nseq, t));
    const SolidsAt = t => { const sig = SignalsAt(t); return { solids: SolidsFor(layout, sig), stand: BlockStandSampler(layout.blocks, layout.gates || [], layout.terrainSampler, n => sig.includes(n)) }; };
    const PointCheck = (kat, p, { t = 0, body = true, slopeWarn = true, base = null } = {}) => {
      if (base && Math.hypot(p.x - base.x, p.z - base.z) < 0.02) slopeWarn = false;   // 关键帧自己摆的位置：坎上 / 窖里的人不再报斜坡
      if (!InBounds(p)) { errors.push(`${kat} 出了场地：(${p.x}, ${p.z})`); return; }
      if (slopeWarn && Slope(p.x, p.z) > 0.45) warnings.push(`${kat} 落在斜坡 / 沟壁上（0.35 m 内高差 ${R(Slope(p.x, p.z))} m）：(${p.x}, ${p.z})`);
      if (body) {
        const { solids, stand } = SolidsAt(t);
        const hit = BodyHit(solids, stand, p.x, p.z);
        if (hit) errors.push(`${kat} 身子进了实心块 ${hit.id}：(${p.x}, ${p.z})`);
      }
    };
    // 演员
    for (const a of seq.actors) {
      const base = a.spawn || units.get(a.id);
      if (!base) { errors.push(`${at}：${a.id} 不在关键帧里也没写 spawn`); continue; }
      const isPerson = PEOPLE.has(base.kind);
      const set = ClipSetFor(base, table);
      let prev = { x: base.x, z: base.z, t: 0 }, lastT = -1;
      for (const k of a.keys) {
        const kat = `${at} ${a.id}@${k.t}`;
        if (k.t < lastT) errors.push(`${kat}：键的 t 没按顺序`);
        lastT = k.t;
        if (k.t > seq.durationS + 0.01) warnings.push(`${kat}：键在段落结束（${seq.durationS} s）之后`);
        if (typeof k.clip === "string") {
          clipsUsed.add(k.clip);
          if (!set.clips.has(k.clip)) errors.push(`${kat}：片段 ${k.clip} 不在 ${a.id} 的骨架（${set.name}）上`);
        }
        if (k.x !== undefined) {
          PointCheck(kat, k, { t: k.t, body: isPerson && k.visible !== false, base });
          const pts = [prev, ...(k.path || []), k];
          if (isPerson && k.move !== "cut" && k.visible !== false) {
            for (const p of Samples(pts).slice(1, -1)) {
              const { solids, stand } = SolidsAt(k.t);
              const hit = BodyHit(solids, stand, p.x, p.z, { tallM: 1.6 });
              if (hit) { errors.push(`${kat} 的走位穿过 ${hit.id}（(${R(p.x)}, ${R(p.z)})）`); break; }
            }
          }
          let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
          const move = k.move || "walk";
          const window = k.t - prev.t;
          if (move !== "cut" && len > 0.05 && k.t > 0) {
            const need = window > 0 ? len / window : Infinity;
            const natural = SPEED[move] || 1.4;
            if (need > Math.max(natural * 2.2, natural + 1.5)) warnings.push(`${kat}：${R(len)} m 要在 ${R(window)} s 里走完（${R(need)} m/s，${move} 自然速度 ${natural}）`);
          }
          prev = { x: k.x, z: k.z, t: k.t };
        }
      }
      if (a.spawn) PointCheck(`${at} ${a.id} spawn`, a.spawn, { body: isPerson && a.keys[0]?.visible !== false });
    }
    // 台词不互相压；说话的人可见
    const sorted = [...seq.lines].sort((p, q) => p.t - q.t);
    for (let i = 0; i < sorted.length; i++) {
      const l = sorted[i], v = lines.get(l.line);
      if (!v) { errors.push(`${at}：台词 ${l.line} 不在清单里`); continue; }
      const end = l.t + v.durationS;
      if (end > seq.durationS + 0.01) warnings.push(`${at}：台词 ${l.line} 在段落结束后才说完（${R(end)} > ${seq.durationS}）`);
      const nx = sorted[i + 1];
      if (nx && nx.t < end - 0.001) errors.push(`${at}：台词 ${l.line}（到 ${R(end)} s）被 ${nx.line}（${nx.t} s）压住`);
      if (l.actor) {
        const a = seq.actors.find(x => x.id === l.actor);
        const visKeys = (a?.keys || []).filter(k => k.visible !== undefined && k.t <= l.t + 0.01);
        const vis = visKeys.length ? visKeys[visKeys.length - 1].visible : (a?.spawn?.visible ?? true);
        if (vis === false) errors.push(`${at}：${l.line} 的说话人 ${l.actor} 这时候是隐藏的`);
      }
    }
    // 镜头点：在场地里、不在实心块里（眼睛也查）
    for (const c of seq.camera) {
      for (const key of ["from", "to"]) if (c[key] && c[key].x !== undefined) {
        const p = c[key];
        if (!InBounds(p)) errors.push(`${at} 镜头@${c.t}.${key} 出了场地`);
        else {
          const { solids, stand } = SolidsAt(c.t + (key === "to" ? c.dur : 0));
          const hit = BodyHit(solids, stand, p.x, p.z, { r: 0.12, tol: 0.0, fromM: 0.2, toM: (p.h ?? 1.6) + 0.1, tallM: 0.3 });
          if (hit) errors.push(`${at} 镜头@${c.t}.${key} 在实心块 ${hit.id} 里：(${p.x}, ${p.z})`);
        }
      }
      if (c.eye && c.eye.x !== undefined) {
        const p = c.eye;
        if (!InBounds(p)) errors.push(`${at} 眼睛@${c.t} 出了场地`);
        else {
          const { solids, stand } = SolidsAt(c.t);
          const hit = BodyHit(solids, stand, p.x, p.z, { r: 0.12, tol: 0.0, fromM: 0.2, toM: 1.7, tallM: 0.3 });
          if (hit) errors.push(`${at} 眼睛@${c.t} 在实心块 ${hit.id} 里：(${p.x}, ${p.z})`);
        }
      }
      if (c.t + c.dur > seq.durationS + 0.01) warnings.push(`${at} 镜头@${c.t} 在段落结束后才结束`);
    }
    for (const e of seq.events) if (e.t > seq.durationS + 0.01) warnings.push(`${at} 事件 ${e.type}@${e.t} 在段落结束之后`);
    rows.push(`${seq.keyframe} · ${seq.durationS} s · 镜头 ${seq.camera.length} · 台词 ${seq.lines.length} · 片段 ${[...clipsUsed].sort().join("、") || "（无）"}`);
  }
  if (doc.sequences.length !== config.keyframes.length) errors.push(`预演 ${doc.sequences.length} 段，关键帧 ${config.keyframes.length} 个`);
  DesignChecks(doc, norm, config, layout, errors);
  return { errors, warnings, rows };
}

/** 剧本要求的设计口径（只查 FirstLevel0610）。 */
function DesignChecks(doc, norm, config, layout, errors) {
  if (doc.level !== "FirstLevel0610") return;
  const Seq = id => doc.sequences.find(s => s.keyframe === id);
  const NSeq = id => norm.sequences.find(s => s.keyframe === id);
  const Keys = (seq, id) => seq?.actors.find(a => a.id === id)?.keys || [];
  const Has = (seq, type, f = () => true) => seq.events.some(e => e.type === type && f(e));
  const SignalOn = (id, name) => Has(Seq(id), "signal", e => e.name === name && e.on === true);
  // 信号按拍开
  if (!SignalOn("06-3", "CartDeparted")) errors.push("06-3：老耿赶车走要打开 CartDeparted");
  if (!SignalOn("09-3", "CellarBlast")) errors.push("09-3：窖里闷响要打开 CellarBlast");
  if (!SignalOn("09-4", "SideGateOpen")) errors.push("09-4：门闩拉开要打开 SideGateOpen");
  if (!SignalOn("10-1", "MgSilenced")) errors.push("10-1：打掉机枪组要打开 MgSilenced");
  if (!SignalOn("10-4", "BackDoorOpen")) errors.push("10-4：挪开水缸、拔门要打开 BackDoorOpen");
  // 06：何有田喊、老耿拍肩膀（老耿爬到坎顶妮儿身边）、传令兵跑来、老耿第一个赶车走
  {
    const s = Seq("06-2");
    if (!s.lines.some(l => l.line === "CartAndNier.01")) errors.push("06-2：要有何有田喊「女娃子，让一哈」");
    const nier = config.keyframes.find(k => k.id === "06-2").units.find(u => u.id === "Nier");
    if (!Keys(s, "Geng").some(k => k.x !== undefined && Math.hypot(k.x - nier.x, k.z - nier.z) < 1.5)) errors.push("06-2：老耿要走到坎顶妮儿身边拍她肩膀");
    const s3 = Seq("06-3");
    const run = Keys(s3, "Runner").find(k => k.x !== undefined && k.move === "run");
    if (!run || !s3.lines.some(l => l.line === "RunnerSouth.01")) errors.push("06-3：传令兵要从凹路跑来报信");
    // 出发时刻 = 第一个 t > 0 的位置键（Go 在出发时刻补的同位置 cut 键）
    const cart = Keys(s3, "GengCart").filter(k => k.x !== undefined && k.t > 0);
    const squad = Keys(s3, "Luo").filter(k => k.x !== undefined && k.t > 0);
    if (!cart.length || !squad.length || cart[0].t > squad[0].t) errors.push("06-3：老耿的车要第一个走，班长他们在后头跟");
  }
  // 07：掀被角有说明字；边走边说：顺子替身在 CopperCoins 大段里一直在走
  if (!Has(Seq("07-2"), "caption", e => /掀/.test(e.text))) errors.push("07-2：掀被角的按键时刻要有说明字");
  {
    const s = Seq("07-3");
    const walk = Keys(s, "Shunzi").filter(k => k.x !== undefined && k.move === "walk");
    const first = s.lines.find(l => l.line === "CopperCoins.01"), last = s.lines.find(l => l.line === "CopperCoins.12");
    if (!walk.length || !first || !last) errors.push("07-3：顺子替身要边走边说");
    else {
      const walked = walk.at(-1).t;
      if (walked < last.t - 16) errors.push(`07-3：对话说到 ${last.t} s，人 ${walked} s 就走完站住了（要一直走）`);
      if (!Keys(s, "Yaowa").some(k => k.x !== undefined && k.move === "walk")) errors.push("07-3：幺娃要并排走");
    }
  }
  // 08：村民跑、被打倒、一个滚进凹路；老耿「那是……俺家」；老耿蹲下比划；妮儿钻进巷子；幺娃拽住
  {
    const s = Seq("08-1");
    const down = ["Villager2", "Villager3"].filter(id => Keys(s, id).some(k => k.state === "down"));
    if (down.length !== 2 || !Has(s, "muzzle", e => e.actor === "MgGunner")) errors.push("08-1：窗口机枪要打倒两个跑出来的村民");
    if (!Keys(s, "Villager1").some(k => k.x !== undefined && k.move === "run")) errors.push("08-1：一个村民要滚进凹路");
    if (!Seq("08-2").lines.some(l => l.line === "NoWayAround.01")) errors.push("08-2：老耿要说「那是……俺家」");
    const s3 = Seq("08-3");
    if (!Keys(s3, "Geng").some(k => k.stance === "crouch")) errors.push("08-3：老耿要蹲下来给妮儿比划");
    if (!Has(s3, "caption", e => /手在抖/.test(e.text))) errors.push("08-3：比划的手在抖要有说明字");
    const nierRun = Keys(s3, "Nier").find(k => k.x !== undefined && k.move === "run");
    if (!nierRun || nierRun.x > 90) errors.push("08-3：妮儿要跑进巷子口");
    if (!s3.lines.some(l => l.line === "DogHole.05") || !s3.lines.some(l => l.line === "DogHole.06")) errors.push("08-3：幺娃拽顺子、顺子甩开要有台词");
  }
  // 09-1：响了才走、停了贴墙：每段挪动都紧跟一梭机枪
  {
    const s = Seq("09-1");
    const bursts = s.events.filter(e => e.type === "muzzle" && e.actor === "MgGunner").map(e => e.t);
    const moves = s.camera.filter(c => c.from && c.to);
    if (moves.length < 3 || !bursts.length) errors.push("09-1：要有 ≥3 段贴墙挪动和窗口的机枪声");
    for (const m of moves) if (!bursts.some(b => m.t - b >= 0 && m.t - b < 2.5)) errors.push(`09-1：${m.t} s 的挪动前 2.5 s 内没有机枪响（要响了才走）`);
    if (!s.lines.some(l => l.line === "CellarShout.01")) errors.push("09-1：巷子里要听见窖口的鬼子吼「出来」");
  }
  // 09-2 / 09-3：镜头一直是眼睛（没有第三人称机位看进院子）、眼睛在缝后、演的东西在缝的扇面里
  const solidsAll = SolidsFor(layout, []);
  const wallX = 81.5;
  // [关键帧, 缝的 z, [[演员, 要看得见的键的最晚 t]]]：之后他们走出扇面（回屋、挪到尸体边）不算
  for (const [id, slitZ, targets] of [["09-2", 496.5, [["CellarMan", 12]]], ["09-3", 499.575, [["CellarIja2", 12], ["Bundle", 99], ["Nier", 99]]]]) {
    const s = Seq(id), n = NSeq(id);
    const eyes = s.camera.filter(c => c.eye);
    if (!eyes.length) { errors.push(`${id}：要用顺子的眼睛看`); continue; }
    for (const c of s.camera) if (c.from && c.from.x !== undefined && c.from.x > wallX) errors.push(`${id}：机位 @${c.t} 跑到墙那边去了（不给特写）`);
    for (const c of eyes) {
      if (!(c.eye.x < wallX && c.eye.x > wallX - 1.2 && Math.abs(c.eye.z - slitZ) < 0.6)) errors.push(`${id}：眼睛 @${c.t} 不在缝后头（(${c.eye.x}, ${c.eye.z})，缝在 (${wallX}, ${slitZ})）`);
      // 缝的扇面里能看到窖口
      const hits = LineHits(solidsAll, c.eye, { x: 90.5, z: 499.5 }, { eyeY: 1.5 });
      if (hits.length) errors.push(`${id}：眼睛 @${c.t} 从缝里看不到窖口，被 ${hits.join("、")} 挡住`);
    }
    // 演员动作点：在那一刻的眼睛到这个点的视线不被块挡
    for (const [actorId, tMax] of targets) {
      const entry = s.actors.find(a => a.id === actorId);
      const keys = (entry?.keys || []).filter(k => k.x !== undefined && k.t <= tMax && (k.move !== "cut" || k.t === 0));
      if (entry?.spawn && !keys.length) keys.push({ t: 0, x: entry.spawn.x, z: entry.spawn.z });
      if (!keys.length) errors.push(`${id}：${actorId} 没有位置键，查不了缝里看得见`);
      for (const k of keys) {
        const eye = eyes.filter(c => c.t <= k.t + 0.01).at(-1) || eyes[0];
        const sig = SignalsWith(config.keyframes.find(kk => kk.id === id).signals, PrevizSignalsAt(n, k.t));
        const hits = LineHits(SolidsFor(layout, sig), eye.eye, k, { eyeY: 1.5 });
        if (hits.length) errors.push(`${id}：${actorId}@${k.t} 的位置 (${k.x}, ${k.z}) 在缝里看不见（被 ${hits.join("、")} 挡住）`);
      }
    }
  }
  {
    const s = Seq("09-3");
    if (!Keys(s, "Bundle").some(k => k.visible === true)) errors.push("09-3：襁褓占位要在挑起来甩到窖沿时露面");
    if (!Keys(s, "CellarGranny").some(k => k.state === "down")) errors.push("09-3：老太太要炸在窖里");
    if (!Keys(s, "CellarIja3").some(k => k.x !== undefined && k.x > 105)) errors.push("09-3：拖人的鬼子要把媳妇拖进偏屋");
    if (!Keys(s, "Nier").some(k => k.x !== undefined && k.move === "walk")) errors.push("09-3：妮儿要贴着墙根往门这边挪");
  }
  // 09-4：撒尿的鬼子、妮儿呜咽、捂嘴说明字；09-5 第二次呜咽；09-6 罐子掉地、扑倒、咬手腕、拔大刀
  {
    const s = Seq("09-4");
    if (!s.lines.some(l => l.line === "NierWhimperFirst.01")) errors.push("09-4：妮儿要呜咽");
    if (!Has(s, "caption", e => /捂住她的嘴/.test(e.text))) errors.push("09-4：捂嘴的按键时刻要有说明字");
    if (!s.lines.some(l => l.line === "PisserGrunt.01")) errors.push("09-4：撒尿的鬼子要「嗯？」");
    const s5 = Seq("09-5");
    if (!s5.lines.some(l => l.line === "NierWhimperAgain.01") || !Has(s5, "caption", e => /捂嘴/.test(e.text))) errors.push("09-5：第二次呜咽与捂嘴说明字");
    const s6 = Seq("09-6");
    if (!Has(s6, "caption", e => /罐/.test(e.text))) errors.push("09-6：罐子掉地要有说明字");
    const lunge = s6.lines.find(l => l.line === "KitchenLunge.01"), bite = s6.lines.find(l => l.line === "KitchenBitten.01");
    if (!lunge || !bite || bite.t < lunge.t + 4) errors.push("09-6：先扑出来吼，压一会儿刺刀，再被咬惨叫");
    if (!s6.camera.some(c => c.eye?.stance === "prone" && c.eye.pitchDeg > 20)) errors.push("09-6：要有倒地仰视的镜头");
    if (!Has(s6, "caption", e => /大刀/.test(e.text))) errors.push("09-6：拔大刀砍的玩家操作时刻要有说明字");
    if (!Keys(s6, "KitchenIja").some(k => k.state === "down")) errors.push("09-6：鬼子要倒");
  }
  // 10：从背后打掉机枪组；班长吼「调过来」；掷弹筒越落越近；何有田接机枪；后送队进院；老耿看一眼；挪水缸开门
  {
    const s = Seq("10-1");
    if (!Has(s, "muzzle", e => e.actor === "player") || !Keys(s, "MgGunner").some(k => k.state === "down")) errors.push("10-1：玩家要从背后打掉机枪组");
    const s2 = Seq("10-2");
    if (!s2.lines.some(l => l.line === "TurnEast.01")) errors.push("10-2：班长要吼「调过来！朝东打！」");
    const impacts = s2.events.filter(e => e.type === "sfx" && e.name === "mortarImpact").sort((a, b) => a.t - b.t);
    if (impacts.length < 3) errors.push("10-2：掷弹筒至少落三发");
    for (let i = 1; i < impacts.length; i++) if (Math.hypot(impacts[i].x - 113.2, impacts[i].z - 465.7) >= Math.hypot(impacts[i - 1].x - 113.2, impacts[i - 1].z - 465.7)) errors.push("10-2：掷弹筒落点要越来越近");
    if (!s2.events.some(e => e.type === "sfx" && e.name === "mortarPop")) errors.push("10-2：掷弹筒要有「嘭」");
    if (!Keys(s2, "EastIja7").some(k => k.x !== undefined && k.x < 225)) errors.push("10-2：东头的鬼子要从东头过来");
    const s3 = Seq("10-3");
    if (!Keys(s3, "HeYoutian").some(k => k.weapon === "Type11")) errors.push("10-3：何有田要接过机枪（weapon Type11）");
    if (!Keys(s3, "Litter12").some(k => k.x !== undefined && k.z > 478)) errors.push("10-3：后送队的担架要进后院");
    if (!Has(s3, "caption", e => /看了一眼/.test(e.text))) errors.push("10-3：老耿看一眼地上的人要有说明字");
    const s4 = Seq("10-4");
    if (!Keys(s4, "LitterDonggua").some(k => k.x !== undefined && k.z > 506)) errors.push("10-4：担架要抬出后门");
    if (s4.then !== "stay") errors.push("10-4：最后一段 then 要是 stay");
  }
  // 大段的镜头轨：每一刻都能采样（没有空档让 SamplePrevizCamera 报错）
  const ground = layout.terrainSampler;
  for (const n of norm.sequences) {
    const kf = config.keyframes.find(k => k.id === n.keyframe);
    const resolve = CameraResolver(kf, n, ground);
    for (let t = 0; t <= n.durationS; t += 1.0) {
      try {
        const shot = SamplePrevizCamera(n.camera, t, resolve);
        if (!shot || !Number.isFinite(shot.position?.x) || !Number.isFinite(shot.yawDeg)) throw new Error("采样结果不是有限数字");
      } catch (e) { errors.push(`${n.keyframe}：镜头在 ${t} s 采样出错：${e.message}`); break; }
    }
  }
}

async function Main(argv) {
  const config = Load("Blockout/FirstLevel0610.json"), voice = Load("Blockout/FirstLevel0610.voice.json");
  let doc;
  if (argv.includes("--fresh")) {
    const { BuildPreviz } = await import("./Script_EditorBlockoutFirstLevel0610Previz.mjs");
    doc = BuildPreviz({ config, voice });
    const again = JSON.stringify(BuildPreviz({ config, voice }));
    if (again !== JSON.stringify(doc)) { console.log("错误：两次生成不一样"); process.exitCode = 1; }
  } else {
    const file = join(HERE, "Blockout/FirstLevel0610.previz.json");
    if (!existsSync(file)) { console.log("还没有 Blockout/FirstLevel0610.previz.json（先跑生成器 --force）"); process.exitCode = 1; return; }
    doc = JSON.parse(readFileSync(file, "utf8"));
  }
  const r = await CheckPreviz(doc, { config, voice });
  for (const row of r.rows) console.log(row);
  for (const w of r.warnings) console.log("警告：" + w);
  for (const e of r.errors) console.log("错误：" + e);
  console.log(r.errors.length ? `不通过：${r.errors.length} 个错误` : `通过（警告 ${r.warnings.length}）`);
  if (r.errors.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) Main(process.argv.slice(2));
