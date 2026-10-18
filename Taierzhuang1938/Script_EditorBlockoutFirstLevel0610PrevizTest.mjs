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
// 剧本要求的事件（六个信号按拍开、掷弹筒越落越近、09 的「响了才走」节奏、07 边走边说、07-4 非第一人称短过场、08 手榴弹与喊人的可见段、10 东街 25–70 m）都在。第二版 2026-10-19 按 25 帧重写。
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

/** 剧本要求的设计口径（只查 FirstLevel0610；第二版 2026-10-19 的 25 帧）。 */
function DesignChecks(doc, norm, config, layout, errors) {
  if (doc.level !== "FirstLevel0610") return;
  const Seq = id => doc.sequences.find(s => s.keyframe === id);
  const NSeq = id => norm.sequences.find(s => s.keyframe === id);
  const Keys = (seq, id) => seq?.actors.find(a => a.id === id)?.keys || [];
  const PosKeys = (seq, id) => Keys(seq, id).filter(k => k.x !== undefined);
  const Has = (seq, type, f = () => true) => !!seq && seq.events.some(e => e.type === type && f(e));
  const HasLine = (seq, id) => !!seq && seq.lines.some(l => l.line === id);
  const LineT = (seq, id) => seq?.lines.find(l => l.line === id)?.t;
  const SignalOn = (id, name) => Has(Seq(id), "signal", e => e.name === name && e.on === true);
  const Unit = (kfId, id) => config.keyframes.find(k => k.id === kfId)?.units.find(u => u.id === id);
  const Near = (a, b, m) => !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) <= m;
  const ROLLER = { x: 113.2, z: 465.7 }, SHRINE = { x: 192, z: 466.4 }, CART = { x: 100.8, z: 446 }, POCKET_GATE = { x: 108, z: 452 };
  const Moves = seq => (seq?.camera || []).filter(c => c.from && c.to);
  const Bursts = seq => (seq?.events || []).filter(e => e.type === "muzzle" && e.actor === "MgGunner").map(e => e.t);
  const Order = (seq, ids) => { for (let i = 1; i < ids.length; i++) { const a = LineT(seq, ids[i - 1]), b = LineT(seq, ids[i]); if (a === undefined || b === undefined || b < a) return false; } return true; };
  // 六个信号按拍开
  if (!SignalOn("06-3", "CartDeparted")) errors.push("06-3：老耿赶车走要打开 CartDeparted");
  if (!SignalOn("09-4", "CellarBlast")) errors.push("09-4：窖里闷响要打开 CellarBlast");
  if (!SignalOn("09-5", "SideGateOpen")) errors.push("09-5：门闩拉开要打开 SideGateOpen");
  if (!SignalOn("10-1", "MgSilenced")) errors.push("10-1：打掉机枪组要打开 MgSilenced");
  if (!SignalOn("10-4", "NorthYardGatesBroken")) errors.push("10-4：北边三道门砸倒要打开 NorthYardGatesBroken");
  if (!SignalOn("10-6", "BackDoorOpen")) errors.push("10-6：挪开水缸、拔门要打开 BackDoorOpen");
  // 06：何有田喊、老耿走到妮儿身边拍肩膀、传令兵跑来报信、老耿的车第一个走、班长「都跟斗走」
  {
    const s1 = Seq("06-1");
    if (!HasLine(s1, "GullyEmptyAsk.01") || !HasLine(s1, "GullyEmptyAnswer.01")) errors.push("06-1：顺子问冬瓜、何有田答都要有");
    const s = Seq("06-2");
    if (!HasLine(s, "CartAndNier.01")) errors.push("06-2：要有何有田喊「女娃子，让一哈」");
    const nier = Unit("06-2", "Nier");
    if (!PosKeys(s, "Geng").some(k => Near(k, nier, 1.5))) errors.push("06-2：老耿要走到沟沿上妮儿身边拍她肩膀");
    if (!PosKeys(s, "Nier").some(k => k.move === "walk")) errors.push("06-2：妮儿要挪开");
    const s3 = Seq("06-3");
    const run = PosKeys(s3, "Runner").find(k => k.move === "run");
    if (!run || !HasLine(s3, "RunnerSouth.01")) errors.push("06-3：传令兵要从凹路跑来报信");
    if (!HasLine(s3, "RunnerSouth.02")) errors.push("06-3：班长要喊「都跟斗走」");
    const cart = PosKeys(s3, "GengCart").filter(k => k.t > 0), squad = PosKeys(s3, "Luo").filter(k => k.t > 0);
    if (!cart.length || !squad.length || cart[0].t > squad[0].t) errors.push("06-3：老耿的车要第一个走，班长他们在后头跟");
  }
  // 07-1 / 07-2：边走边说——眼睛（from/to 机位）停停走走地往前，一直看着车尾的妮儿；车、妮儿、幺娃都在走；台词按关键帧挂
  for (const [id, lines] of [["07-1", ["RoadMutters.01", "RoadMutters.02", "RoadMutters.03", "CopperCoins.01", "CopperCoins.05", "CopperCoins.10"]], ["07-2", ["CopperCoins.11", "CopperCoins.12", "CopperCoins.13"]]]) {
    const s = Seq(id);
    for (const l of lines) if (!HasLine(s, l)) errors.push(`${id}：要有台词 ${l}`);
    const moves = Moves(s);
    if (moves.length < 3) errors.push(`${id}：眼睛要分几段走（from/to 机位 ≥ 3 段），现在 ${moves.length}`);
    if (!s.camera.every(c => c.look?.actor === "Nier")) errors.push(`${id}：边走边说的镜头要一直看着车尾的妮儿（look 演员锚 Nier）`);
    for (const who of ["GengCart", "Nier", "Yaowa", "Luo"]) if (!PosKeys(s, who).some(k => k.move === "walk")) errors.push(`${id}：${who} 要跟着往前走`);
    // 车在眼睛前头 5–7 m：每段走动结束时车的位置键与机位 to 的距离
    for (const c of moves) {
      const cart = PosKeys(s, "GengCart").find(k => Math.abs(k.t - (c.t + c.dur)) < 0.05);
      if (!cart) continue;
      const d = Math.hypot(cart.x - c.to.x, cart.z - c.to.z);
      if (d < 4.5 || d > 8.5) errors.push(`${id}：${c.t} s 那段走完车离眼睛 ${R(d)} m（要 5–7 m 左右）`);
    }
  }
  {
    const s = Seq("07-2");
    const sis = LineT(s, "CopperCoins.11");
    const cam = sis === undefined ? null : [...s.camera].filter(c => c.t <= sis + 0.01).at(-1);
    if (!cam || cam.look?.actor !== "Nier" || cam.to) errors.push("07-2：说「我妹今年十二」时眼睛要站着、正对车尾的妮儿");
    const e12 = s.lines.find(l => l.line === "CopperCoins.12"), t13 = LineT(s, "CopperCoins.13");
    if (!e12 || t13 === undefined || t13 < e12.t + 12.55 + 3.0) errors.push("07-2：「我没听到」要在上一句说完 3 s 以后才说（过了好一会儿）");
  }
  // 07-3：掀被角有说明字；冬瓜、卫生兵、排长、班长的话都在；班长回头吼完起身往前
  {
    const s = Seq("07-3");
    if (!Has(s, "caption", e => /掀/.test(e.text))) errors.push("07-3：掀被角的按键时刻要有说明字");
    for (const l of ["StretcherDonggua.01", "StretcherDonggua.02", "StretcherDonggua.03", "BankLookoutOfficer.01", "BankLookoutLuo.01"]) if (!HasLine(s, l)) errors.push(`07-3：要有台词 ${l}`);
    if (!Order(s, ["StretcherDonggua.01", "StretcherDonggua.02", "StretcherDonggua.03", "BankLookoutOfficer.01", "BankLookoutLuo.01"])) errors.push("07-3：台词顺序要是 顺子 → 卫生兵 → 冬瓜 → 排长 → 班长");
    if (!PosKeys(s, "Luo").some(k => k.move === "walk" && k.z > 312.5)) errors.push("07-3：班长吼完要从坎上下来往前走");
  }
  // 07-4：短过场——前 18 s 全是机位（非第一人称）、三段机位；人往坎底缩（小队 prone 键）、妮儿最后一个；跑（run 键）；村子冒烟；最后切回眼睛趴在路沟沿
  {
    const s = Seq("07-4");
    const cams = s.camera.filter(c => !c.eye);
    if (cams.length < 3) errors.push("07-4：短过场要有三个镜头（非第一人称机位）");
    if (s.camera.some(c => c.eye && c.t < 18)) errors.push("07-4：前 18 s 不能有第一人称眼睛");
    const last = [...s.camera].sort((a, b) => a.t - b.t).at(-1);
    if (!last?.eye || last.eye.stance !== "prone" || Math.abs(last.eye.z - 384.3) > 1) errors.push("07-4：最后要切回第一人称，趴在村口路沟沿上");
    const proneT = ["Luo", "Yaowa", "Squad1", "Walker01", "Walker16"].map(id => Keys(s, id).find(k => k.stance === "prone")?.t);
    if (proneT.some(t => t === undefined)) errors.push("07-4：小队和后送队都要趴下（stance prone 键）");
    const nierLook = Keys(s, "Nier").find(k => k.yawDeg === 0)?.t;
    if (nierLook === undefined || proneT.some(t => t !== undefined && t > nierLook)) errors.push("07-4：妮儿要在别人都趴下之后才抬头（百姓趴不下，用抬头朝北顶）");
    if (!Has(s, "caption", e => /飞机/.test(e.text))) errors.push("07-4：飞机没有模型，要有说明字");
    if (!PosKeys(s, "Luo").some(k => k.move === "run") || !PosKeys(s, "GengCart").some(k => k.move === "walk")) errors.push("07-4：全班要顺凹路往前跑、车跟在后头");
    if (s.events.filter(e => e.type === "smoke" && e.kind === "SmokeBlack").length < 2) errors.push("07-4：望见耿家庄要有几处房顶冒烟（SmokeBlack ≥ 2）");
  }
  // 08-1：村民跑、倒两个、一个滚进沟；村民的话；老耿「那是……俺家」
  {
    const s = Seq("08-1");
    const down = ["Villager2", "Villager3"].filter(id => Keys(s, id).some(k => k.state === "down"));
    if (down.length !== 2 || !Has(s, "muzzle", e => e.actor === "MgGunner")) errors.push("08-1：窗口机枪要打倒两个跑出来的村民");
    if (!PosKeys(s, "Villager1").some(k => k.move === "run")) errors.push("08-1：一个村民要滚进路沟");
    if (!HasLine(s, "VillageMouth.01") || !HasLine(s, "GengHome.01")) errors.push("08-1：村民「东头……过来的」和老耿「那是……俺家」都要有");
  }
  // 08-2：问路那段对白按顺序；最后班长下令
  {
    const s = Seq("08-2");
    const ids = ["NoWayAround.01", "NoWayAround.02", "NoWayAround.03", "DecideShunzi.01", "DecideMedic.01", "DecideLuo.01"];
    for (const l of ids) if (!HasLine(s, l)) errors.push(`08-2：要有台词 ${l}`);
    if (!Order(s, ids)) errors.push("08-2：对白顺序要是 班长问 → 老耿 → 排长 → 顺子 → 卫生兵 → 班长下令");
    if (!Has(s, "caption", e => /狗洞/.test(e.text))) errors.push("08-2：要有说明字：墙根有个狗洞，老耿没想起来");
  }
  // 08-3：玩家打；班长四人分几段摸到大车后；窗口机枪打沟沿也打班长；过道里甩手榴弹（throw 键）炸在车边、一个兵倒；两句台词
  {
    const s = Seq("08-3");
    if (!Has(s, "muzzle", e => e.actor === "player")) errors.push("08-3：玩家要朝窗口打");
    const luo = PosKeys(s, "Luo").filter(k => k.move === "run");
    if (luo.length < 3 || !luo.some(k => k.z < 400) || !Near(luo.at(-1), Unit("08-3", "Luo"), 0.5)) errors.push("08-3：班长要分 ≥3 段从街口摸到大车后头");
    if (!PosKeys(s, "HeYoutian").some(k => k.move === "run") || !PosKeys(s, "Escort1").some(k => k.move === "run")) errors.push("08-3：何有田和后送队的兵要跟着班长往前摸");
    if (Bursts(s).length < 4) errors.push("08-3：窗口机枪要一直打（≥ 4 梭）");
    if (!HasLine(s, "PressWindow.01") || !HasLine(s, "PressWindow.02")) errors.push("08-3：「压到起」「卡到了」都要有");
    const toss = Keys(s, "GateIja1").find(k => k.throw);
    const boom = s.events.find(e => e.type === "explosion" && Near(e, CART, 4.5) && e.radius > 1);
    if (!toss || !boom || boom.t < toss.t + 2.15) errors.push("08-3：大门过道里要甩出一颗手榴弹（throw 键）炸在大车边");
    const fall = Keys(s, "Escort2").find(k => k.state === "down");
    if (!fall || !boom || fall.t < boom.t) errors.push("08-3：手榴弹炸了以后一个兵要倒");
    if (!Has(s, "caption", e => /停火/.test(e.text))) errors.push("08-3：要有说明字教玩家：一停火机枪就掉头打班长");
  }
  // 08-4：喊人的鬼子先贴西墙往街里跑几步（大车西边、沟沿看得见）再拐去东街；幺娃、刘文财两句
  {
    const s = Seq("08-4");
    const run = PosKeys(s, "GateIja2").filter(k => k.move === "run");
    if (!run.some(k => k.x < 99.4 && k.z > 448 && k.z < 462)) errors.push("08-4：喊人的鬼子要先贴西墙往街里跑几步（大车西边那几步从沟沿看得见）");
    if (!run.some(k => k.x > 125)) errors.push("08-4：他最后要拐去东街");
    if (!HasLine(s, "RunnerEast.01") || !HasLine(s, "RunnerEast.02")) errors.push("08-4：幺娃「跑了一个」、刘文财「喊人去了」都要有");
  }
  // 08-5：伤兵中枪；妮儿顺沟底往西跑进巷子口、子弹追脚后跟；老耿爬出去被拽回；四句台词按顺序；最后眼睛冲向巷子口
  {
    const s = Seq("08-5");
    if (!Keys(s, "Walker04").some(k => k.state === "down")) errors.push("08-5：妮儿身边的伤兵要中枪倒下");
    const nier = PosKeys(s, "Nier").filter(k => k.move === "run");
    if (!nier.length || nier.at(-1).x > 81) errors.push("08-5：妮儿要顺路沟往西跑进巷子");
    const dep = nier.length ? Math.min(...PosKeys(s, "Nier").filter(k => k.t > 0).map(k => k.t)) : 0;
    if (s.events.filter(e => e.type === "explosion" && e.radius <= 1 && e.t > dep && e.x < 100).length < 3) errors.push("08-5：子弹要追着她的脚后跟打在土里（≥ 3 小土点）");
    const geng = PosKeys(s, "Geng").filter(k => k.t > 0 && k.move !== "cut");
    if (geng.length < 2 || !geng.some(k => k.z > 383)) errors.push("08-5：老耿要爬出沟去追、再被拽回来");
    const ids = ["NierRuns.01", "NierRuns.02", "NierRuns.03", "NierRuns.04"];
    for (const l of ids) if (!HasLine(s, l)) errors.push(`08-5：要有台词 ${l}`);
    if (!Order(s, ids)) errors.push("08-5：台词顺序要是 妮儿！→ 不要命了嗦 → 老总！俺妮儿 → 往哪跑");
    const dash = Moves(s).filter(c => c.to.x < 90);
    if (!dash.length || LineT(s, "NierRuns.04") === undefined || dash[0].t > LineT(s, "NierRuns.04")) errors.push("08-5：顺子要先往巷子口冲，刘文财才在后头吼");
  }
  // 09-1：妮儿跑在前头进邻院小门；响了才走、停了贴墙：每段挪动都紧跟一梭机枪；听见窖口的吼
  {
    const s = Seq("09-1");
    const nier = PosKeys(s, "Nier").filter(k => k.move === "run");
    if (!nier.length || !Near(nier.at(-1), Unit("09-1", "Nier"), 0.6)) errors.push("09-1：妮儿要跑在前头拐进邻院敞着的小门");
    const bursts = Bursts(s), moves = Moves(s);
    if (moves.length < 3 || !bursts.length) errors.push("09-1：要有 ≥3 段贴墙挪动和窗口的机枪声");
    for (const m of moves) if (!bursts.some(b => m.t - b >= 0 && m.t - b < 2.5)) errors.push(`09-1：${m.t} s 的挪动前 2.5 s 内没有机枪响（要响了才走）`);
    if (!HasLine(s, "CellarShout.01")) errors.push("09-1：巷子里要听见窖口的鬼子吼「出来」");
  }
  // 09-2：妮儿钻狗洞（墙那一下硬切）、缩到柴垛后；顺子从缝里找她
  {
    const s = Seq("09-2");
    const through = PosKeys(s, "Nier").find(k => k.move === "cut" && k.t > 0 && k.x > 81.5);
    const hide = PosKeys(s, "Nier").at(-1);
    if (!through || !Near(hide, Unit("09-3", "Nier"), 1.0)) errors.push("09-2：妮儿要钻过狗洞（硬切）、缩到柴垛后头");
    if (!Has(s, "caption", e => /狗洞/.test(e.text)) || !Moves(s).length) errors.push("09-2：要有狗洞的说明字，顺子要贴墙挪到墙缝外");
  }
  // 09-3 / 09-4：镜头一直是眼睛（没有第三人称机位看进院子）、眼睛在缝后、演的东西在缝的扇面里
  const solidsAll = SolidsFor(layout, []);
  const wallX = 81.5;
  // [关键帧, 缝的 z, [[演员, 要看得见的键的最晚 t]]]：之后他们走出扇面（回屋、挪到尸体边）不算
  // 妮儿在 09-4 开头缩在柴垛后（缝里本来就看不见），挪到门边（t ≥ 20）才要看得见
  for (const [id, slitZ, targets] of [["09-3", 496.5, [["CellarMan", 12]]], ["09-4", 499.575, [["CellarIja2", 12], ["Bundle", 99], ["Nier", 99, 20]]]]) {
    const s = Seq(id), n = NSeq(id);
    const eyes = s.camera.filter(c => c.eye);
    if (!eyes.length) { errors.push(`${id}：要用顺子的眼睛看`); continue; }
    for (const c of s.camera) if (c.from && c.from.x !== undefined && c.from.x > wallX) errors.push(`${id}：机位 @${c.t} 跑到墙那边去了（不给特写）`);
    for (const c of eyes) {
      if (!(c.eye.x < wallX && c.eye.x > wallX - 1.2 && Math.abs(c.eye.z - slitZ) < 0.6)) errors.push(`${id}：眼睛 @${c.t} 不在缝后头（(${c.eye.x}, ${c.eye.z})，缝在 (${wallX}, ${slitZ})）`);
      const hits = LineHits(solidsAll, c.eye, { x: 90.5, z: 499.5 }, { eyeY: 1.5 });
      if (hits.length) errors.push(`${id}：眼睛 @${c.t} 从缝里看不到窖口，被 ${hits.join("、")} 挡住`);
    }
    for (const [actorId, tMax, tMin = 0] of targets) {
      const entry = s.actors.find(a => a.id === actorId);
      const keys = (entry?.keys || []).filter(k => k.x !== undefined && k.t <= tMax && k.t >= tMin && (k.move !== "cut" || k.t === 0));
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
    if (!Keys(s, "CellarMan").some(k => k.state === "down")) errors.push("09-3：汉子刚爬出来就要被捅倒");
    if (!HasLine(s, "LeaderCallsMen.01")) errors.push("09-3：前屋的分队长要吼着调人");
    const s4 = Seq("09-4");
    if (!Keys(s4, "Bundle").some(k => k.visible === true)) errors.push("09-4：襁褓占位要在挑起来甩到窖沿时露面");
    if (!Keys(s4, "CellarGranny").some(k => k.state === "down")) errors.push("09-4：老太太要炸在窖里");
    if (!PosKeys(s4, "CellarIja3").some(k => k.x > 105)) errors.push("09-4：拖人的鬼子要把媳妇拖进偏屋");
    if (!PosKeys(s4, "CellarIja1").some(k => k.x > 94 && k.z < 492)) errors.push("09-4：拎手榴弹的扔完要跑去前屋");
    if (!PosKeys(s4, "Nier").some(k => k.move === "walk" && k.x < 83)) errors.push("09-4：妮儿要从柴垛后头挪到门边");
  }
  // 09-5：门开（SideGateOpen）、撒尿的看守、妮儿呜咽、捂嘴说明字；演「按到了」：看守进偏屋、不说「嗯？」；「没按到」只有一句说明字
  {
    const s = Seq("09-5");
    if (!HasLine(s, "NierWhimperFirst.01")) errors.push("09-5：妮儿要呜咽");
    if (!Has(s, "caption", e => /捂住她的嘴/.test(e.text))) errors.push("09-5：捂嘴的按键时刻要有说明字");
    if (!Has(s, "caption", e => /撒尿/.test(e.text))) errors.push("09-5：撒尿的看守要有说明字");
    if (HasLine(s, "PisserGrunt.01") || HasLine(s, "PisserGrunt.02")) errors.push("09-5：演的是「按到了」那支，看守不该「嗯？」");
    if (!Has(s, "caption", e => /没按到/.test(e.text))) errors.push("09-5：「没按到」那支要在说明字里写一句");
    const go = PosKeys(s, "CellarIja2").filter(k => k.move === "walk");
    const whimper = LineT(s, "NierWhimperFirst.01");
    if (!go.length || go.at(-1).x < 107 || whimper === undefined || go[0].t < whimper) errors.push("09-5：看守要在呜咽之后系好裤子往偏屋去");
  }
  // 09-6：攥衣角、「屁股对到老子」、蹲在 (86,497) 看前屋南门、石磨老汉说明字、第二次呜咽 + 捂嘴、响了才挪
  {
    const s = Seq("09-6");
    if (!Has(s, "caption", e => /衣角/.test(e.text))) errors.push("09-6：妮儿攥衣角往后坠要有说明字");
    if (!HasLine(s, "ButtToMe.01")) errors.push("09-6：要有「屁股对到老子」");
    const sight = s.camera.find(c => c.eye && Near(c.eye, { x: 86, z: 497 }, 0.4) && c.eye.stance === "crouch");
    if (!sight) errors.push("09-6：要蹲在 (86,497) 透过前屋南门看机枪组的后背");
    if (!Has(s, "caption", e => /石磨/.test(e.text))) errors.push("09-6：石磨上绑着的老汉要有说明字");
    if (!HasLine(s, "NierWhimperAgain.01") || !Has(s, "caption", e => /捂嘴/.test(e.text))) errors.push("09-6：第二次呜咽与捂嘴说明字");
    const bursts = Bursts(s), moves = Moves(s).filter(c => c.t > 4);
    if (moves.length < 3) errors.push("09-6：贴西墙往前屋摸要分 ≥3 段");
    for (const m of moves) if (!bursts.some(b => m.t - b >= 0 && m.t - b < 2.5)) errors.push(`09-6：${m.t} s 的挪动前 2.5 s 内没有机枪响（要响了才走）`);
    if (!PosKeys(s, "Nier").some(k => k.move === "walk" && k.z < 490)) errors.push("09-6：妮儿要跟着挪到灶屋跟前");
  }
  // 09-7：罐子掉地、扑倒、压刺刀、咬手腕、拔大刀
  {
    const s6 = Seq("09-7");
    if (!Has(s6, "caption", e => /罐/.test(e.text))) errors.push("09-7：罐子掉地要有说明字");
    const lunge = s6.lines.find(l => l.line === "KitchenLunge.01"), bite = s6.lines.find(l => l.line === "KitchenBitten.01");
    if (!lunge || !bite || bite.t < lunge.t + 4) errors.push("09-7：先扑出来吼，压一会儿刺刀，再被咬惨叫");
    if (!s6.camera.some(c => c.eye?.stance === "prone" && c.eye.pitchDeg > 20)) errors.push("09-7：要有倒地仰视的镜头");
    if (!Has(s6, "caption", e => /大刀/.test(e.text))) errors.push("09-7：拔大刀砍的玩家操作时刻要有说明字");
    if (!Keys(s6, "KitchenIja").some(k => k.state === "down")) errors.push("09-7：鬼子要倒");
  }
  // 10-1：从背后打掉机枪组和过道里的人；班长「机枪哑了！冲！」从大车后冲上来；剩一个往东街跑
  {
    const s = Seq("10-1");
    if (!Has(s, "muzzle", e => e.actor === "player")) errors.push("10-1：玩家要从背后开打");
    for (const id of ["MgGunner", "MgLoader", "Leader", "GateIja1"]) if (!Keys(s, id).some(k => k.state === "down")) errors.push(`10-1：${id} 要倒`);
    if (!HasLine(s, "MgSilenced.01")) errors.push("10-1：班长要吼「机枪哑了！冲！」");
    const luo = PosKeys(s, "Luo").filter(k => k.move === "run");
    if (!luo.length || !luo.some(k => k.z > 450)) errors.push("10-1：班长要从大车后头冲上来");
    if (!PosKeys(s, "Rifle2").some(k => k.move === "run" && k.x > 110)) errors.push("10-1：剩下的一个要从大门往东街跑");
  }
  // 10-2：调过来；先头五六个顺东街冲（run 键）、倒 2–3 个、落点在石碾 25–70 m；剩下缩到土地庙后；喊人的那个在庙后
  {
    const s = Seq("10-2");
    for (const l of ["TurnEast.01", "EastEndCharge.01", "EastEndOfficer.01"]) if (!HasLine(s, l)) errors.push(`10-2：要有台词 ${l}`);
    const east = ["EastIja1", "EastIja2", "EastIja3", "EastIja4", "EastIja5", "GateIja2", "EastIja6"];
    const charging = east.filter(id => PosKeys(s, id).some(k => k.move === "run"));
    if (charging.length < 5) errors.push("10-2：先头五六个要顺着东街往前跳");
    const downs = east.filter(id => Keys(s, id).some(k => k.state === "down"));
    if (downs.length < 2 || downs.length > 3) errors.push(`10-2：要倒两三个，现在 ${downs.length}`);
    for (const id of downs) { const p = PosKeys(s, id).at(-1); const d = p ? Math.hypot(p.x - ROLLER.x, p.z - ROLLER.z) : 0; if (d < 25 || d > 70) errors.push(`10-2：${id} 倒在离石碾 ${R(d)} m 处（要 25–70 m）`); }
    for (const id of ["EastIja4", "EastIja5", "GateIja2"]) if (!Near(PosKeys(s, id).at(-1), SHRINE, 6)) errors.push(`10-2：${id} 最后要缩到土地庙后头`);
    if (!Has(s, "muzzle", e => e.actor === "player" && e.count >= 4)) errors.push("10-2：玩家要用机枪扫（muzzle count ≥ 4）");
  }
  // 10-3：掷弹筒「嘭」（麦秸垛后冒烟）、至少三发、越落越近；军官交代；弹斗说明字
  {
    const s = Seq("10-3");
    if (!HasLine(s, "EastEndOfficer.02")) errors.push("10-3：军官要交代掷弹筒");
    const impacts = s.events.filter(e => e.type === "sfx" && e.name === "mortarImpact").sort((a, b) => a.t - b.t);
    if (impacts.length < 3) errors.push("10-3：掷弹筒至少落三发");
    for (let i = 1; i < impacts.length; i++) if (Math.hypot(impacts[i].x - ROLLER.x, impacts[i].z - ROLLER.z) >= Math.hypot(impacts[i - 1].x - ROLLER.x, impacts[i - 1].z - ROLLER.z)) errors.push("10-3：掷弹筒落点要越来越近");
    if (impacts.length && Math.hypot(impacts[0].x - ROLLER.x, impacts[0].z - ROLLER.z) < 10) errors.push("10-3：第一发要落在十几米外");
    if (!Has(s, "sfx", e => e.name === "mortarPop")) errors.push("10-3：掷弹筒要有「嘭」");
    if (!Has(s, "smoke", e => Math.hypot(e.x - 164.2, e.z - 456.6) < 3)) errors.push("10-3：麦秸垛后头要冒烟（从石碾看不见垛子，只看得见烟）");
    if (!Has(s, "caption", e => /弹斗/.test(e.text))) errors.push("10-3：弹斗见底要有说明字");
  }
  // 10-4：砸门声往西挪、门倒（信号）、北边那伙人穿院子链钻到北角院门外；班长叫文财、幺娃堵；两人到北角口
  {
    const s = Seq("10-4");
    for (const l of ["EastEndOfficer.03", "HoldEastStreet.01"]) if (!HasLine(s, l)) errors.push(`10-4：要有台词 ${l}`);
    const bash = s.events.filter(e => e.type === "sfx" && e.name === "bodyFall").sort((a, b) => a.t - b.t);
    if (bash.length < 3) errors.push("10-4：砸门声至少三处（用重物落地声顶）");
    for (let i = 1; i < bash.length; i++) if (bash[i].x > bash[i - 1].x + 0.01) errors.push("10-4：砸门声要一个院子一个院子往西挪");
    const on = s.events.find(e => e.type === "signal" && e.name === "NorthYardGatesBroken" && e.on)?.t;
    const n1 = PosKeys(s, "NorthIja1").filter(k => k.move === "run");
    if (on === undefined || !n1.length || n1[0].t < on || !Near(n1.at(-1), Unit("10-4", "NorthIja1"), 0.6)) errors.push("10-4：门倒了以后最前头的鬼子要钻到北角院门外");
    for (const id of ["LiuWencai", "Yaowa"]) if (!Near(PosKeys(s, id).at(-1), Unit("10-4", id), 0.6)) errors.push(`10-4：${id} 要蹲到北角口上堵`);
  }
  // 10-5：南边翻墙、何有田去守后门；后送队进院（担架到过道 / 后院）；妮儿抱老耿的腿；老耿看一眼
  {
    const s = Seq("10-5");
    for (const l of ["EastEndOfficer.04", "HoldEastStreet.02"]) if (!HasLine(s, l)) errors.push(`10-5：要有台词 ${l}`);
    if (!Near(PosKeys(s, "HeYoutian").at(-1), Unit("10-5", "HeYoutian"), 0.6)) errors.push("10-5：何有田要去守后门");
    if (!Near(PosKeys(s, "SouthIja1").at(-1), { x: 126, z: 490 }, 1.5)) errors.push("10-5：南边要有人翻南院墙");
    if (!PosKeys(s, "LitterDonggua").some(k => k.z > 478) || !PosKeys(s, "Litter01").some(k => k.z > 470)) errors.push("10-5：担架要从大门过道抬进院子");
    const geng = Unit("10-5", "Geng");
    if (!PosKeys(s, "Nier").some(k => k.move === "run" && Near(k, geng, 1.5))) errors.push("10-5：妮儿要扑过去抱住老耿的腿");
    if (!Has(s, "caption", e => /看了一眼/.test(e.text))) errors.push("10-5：老耿看一眼地上的人要有说明字");
  }
  // 10-6：挪缸开门、担架抬出后门、幺娃接过机枪（weapon Type11）、then stay
  {
    const s4 = Seq("10-6");
    if (!HasLine(s4, "HoldEastStreet.03")) errors.push("10-6：班长要喊「幺娃，接到！」");
    if (!Keys(s4, "Yaowa").some(k => k.weapon === "Type11")) errors.push("10-6：幺娃要接过机枪（weapon Type11）");
    if (!PosKeys(s4, "LitterDonggua").some(k => k.z > 506)) errors.push("10-6：担架要抬出后门");
    if (!Has(s4, "caption", e => /接 11/.test(e.text))) errors.push("10-6：末尾要有「接 11」的说明字");
    if (s4.then !== "stay") errors.push("10-6：最后一段 then 要是 stay");
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
