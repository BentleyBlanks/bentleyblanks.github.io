// ===========================================================================
// Script_EditorBlockoutFirstLevel1218PrevizTest.mjs —— FirstLevel1218 预演数据的纯 node 自检
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218PrevizTest.mjs           → 查 Blockout/FirstLevel1218.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218PrevizTest.mjs --fresh   → 查生成器当场生成的那份（并核对两次生成逐字相同）
//
// 查（照 0610 的 PrevizTest，加了这片场地专有的几条）：运行时包的 ValidateBlockoutPreviz（关键帧 / 单位 / 台词 id / 字段）；
// 每个片段在那具骨架上烘过（有 castId 的按 Data_FirstLevelSpeakingCast 的骨架，没有 castId 的士兵只许五具骨架都有的通用片段，
// 百姓 / 军官是程序化身体、一个片段都不许）；同一段里台词不互相压；演员走位点在场地范围内、身子不进实心块（按那一刻的信号算随信号体块，
// 路线按 0.5 m 取样）；没人走进北沙河（浮桥桥面是 ≤1 m 的块顶，站得上去，不算河里）；走位要求的速度不离谱；
// 说话的人那一刻看得见（没藏起来，而且在镜头里：离镜头 ≤ 3 m，或在水平视场 + 20° 以内）；机位与眼睛不在实心块里、不在河里；
// 剧本要求的：三个信号按拍开（13-1 中 CartOverturned、18-3 末 BridgeBlown；ChargesSet 18-1 起本来就开，预演里不再动它）、
// 14-2 杠子脱手后眼睛真看得到老耿与冬瓜、15-2 眼睛一直在沟里（眼高低于两岸）、18-3 眼睛过桥时高度跟着桥面、18-2 掷弹筒越落越近、
// 机枪先哑最后一拨才跑、18-5 开头黑场 + 日期字幕、最后一段 then 是 stay；镜头轨每一秒都能采样。
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HeightGridSampler, LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { CharacterClipModelId } from "./Data_CharacterSelection.mjs";
import { BlockStandSampler, PrevizSignalsAt, NormalizeBlockoutPreviz, SamplePrevizCamera, PREVIZ_EYE_HEIGHT } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { L1218_RIVER as RV, L1218_BRIDGE as BR, L1218_HEIGHTS as HT } from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

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
// 场地：实心块、随信号体块、站立面、河

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
/** 在北沙河的水里（浮桥桥面上不算：stand 给的是桥面高）。 */
function InRiver(p, stand) {
  if (p.z <= RV.waterMinZ || p.z >= RV.waterMaxZ) return false;
  return stand(p.x, p.z) < HT.waterY + 0.05;
}
/** 关键帧的信号 + 预演事件改过的信号（Map name → on）→ 这一刻打开的信号名。 */
function SignalsWith(base, overrides) {
  const set = new Set(base || []);
  for (const [name, on] of overrides || []) { if (on) set.add(name); else set.delete(name); }
  return [...set];
}
function Samples(points, stepM = 0.5) {
  const out = [{ x: points[0].x, z: points[0].z }];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / stepM));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  }
  return out;
}
const WrapDeg = d => { let v = ((d + 180) % 360 + 360) % 360 - 180; if (v === -180) v = 180; return v; };
const YawTo = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z)) * 180 / Math.PI;

/**
 * 演员在 t 时的大致位置（按预演键：取 t 之前最后一个带位置的键；在两个位置键之间按直线插值），没有键就是布设 / spawn。
 * 够核「说话的人在不在镜头里」用，不是运行时的精确采样。
 */
function ActorAt(entry, base, t) {
  const keys = (entry?.keys || []).filter(k => k.x !== undefined);
  let prev = { x: base.x, z: base.z, t: 0 }, next = null;
  for (const k of keys) { if (k.t <= t + 1e-6) prev = k; else { next = k; break; } }
  if (!next || next.move === "cut" || next.t <= prev.t) return { x: prev.x, z: prev.z };
  const u = Math.max(0, Math.min(1, (t - prev.t) / (next.t - prev.t)));
  return { x: prev.x + (next.x - prev.x) * u, z: prev.z + (next.z - prev.z) * u };
}
function VisibleAt(entry, spawn, t) {
  const visKeys = (entry?.keys || []).filter(k => k.visible !== undefined && k.t <= t + 0.01);
  return visKeys.length ? visKeys[visKeys.length - 1].visible : (spawn?.visible ?? true);
}
/** 镜头锚点 → {x,y,z}：点按站立面 + h，演员锚按演员那一刻的位置 + offset，"player" 按关键帧机位。 */
function CameraResolver(kf, seq, stand, tRef = { t: 0 }) {
  const at = id => (id === "player" ? { unit: kf.player, entry: null } : { unit: (kf.units || []).find(u => u.id === id) || seq.actors.find(a => a.id === id)?.spawn || null, entry: seq.actors.find(a => a.id === id) });
  return anchor => {
    if (!anchor) return null;
    if (anchor.actor) {
      const { unit, entry } = at(anchor.actor);
      if (!unit) return null;
      const p = anchor.actor === "player" ? unit : ActorAt(entry, unit, tRef.t);
      const [dx, dy, dz] = anchor.offset || [0, 0, 0];
      return { x: p.x + dx, y: stand(p.x, p.z) + dy, z: p.z + dz, yawDeg: unit.yawDeg ?? 0, pitchDeg: unit.pitchDeg ?? 0 };
    }
    return { x: anchor.x, y: stand(anchor.x, anchor.z) + (anchor.h ?? 1.6), z: anchor.z };
  };
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
  const scene = Load("Blockout/FirstLevel1218.scene.json");
  const layout = LayoutFromSceneDoc(scene);
  const ground = HeightGridSampler(scene.terrain);
  const B = scene.bounds;
  const Slope = (x, z) => {
    const h = [ground(x, z), ground(x + 0.35, z), ground(x - 0.35, z), ground(x, z + 0.35), ground(x, z - 0.35)];
    return Math.max(...h) - Math.min(...h);
  };
  const InBounds = p => p.x >= B.minX && p.x <= B.maxX && p.z >= B.minZ && p.z <= B.maxZ;
  const norm = NormalizeBlockoutPreviz(doc);
  const StandFor = sig => BlockStandSampler(layout.blocks, layout.gates || [], layout.terrainSampler, n => sig.includes(n));
  for (const seq of doc.sequences) {
    const kf = config.keyframes.find(k => k.id === seq.keyframe);
    const at = `预演 ${seq.keyframe}`;
    if (!kf) { errors.push(`${at}：关键帧不存在`); continue; }
    const nseq = norm.sequences.find(s => s.keyframe === seq.keyframe);
    const units = new Map((kf.units || []).map(u => [u.id, u]));
    const clipsUsed = new Set();
    const SignalsAt = t => SignalsWith(kf.signals, PrevizSignalsAt(nseq, t));
    const SolidsAt = t => { const sig = SignalsAt(t); return { solids: SolidsFor(layout, sig), stand: StandFor(sig) }; };
    const PointCheck = (kat, p, { t = 0, body = true, slopeWarn = true, base = null, river = true } = {}) => {
      if (base && Math.hypot(p.x - base.x, p.z - base.z) < 0.02) slopeWarn = false;   // 关键帧自己摆的位置不再报斜坡
      if (!InBounds(p)) { errors.push(`${kat} 出了场地：(${p.x}, ${p.z})`); return; }
      if (slopeWarn && Slope(p.x, p.z) > 0.45) warnings.push(`${kat} 落在斜坡 / 沟壁上（0.35 m 内高差 ${R(Slope(p.x, p.z))} m）：(${p.x}, ${p.z})`);
      const { solids, stand } = SolidsAt(t);
      if (river && InRiver(p, stand)) errors.push(`${kat} 在河里：(${p.x}, ${p.z})`);
      if (body) {
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
          PointCheck(kat, k, { t: k.t, body: isPerson && k.visible !== false, base, river: k.visible !== false });
          const pts = [prev, ...(k.path || []), k];
          if (k.move !== "cut" && k.visible !== false) {
            const { solids, stand } = SolidsAt(k.t);
            for (const p of Samples(pts).slice(1, -1)) {
              if (isPerson) {
                const hit = BodyHit(solids, stand, p.x, p.z, { tallM: 1.6 });
                if (hit) { errors.push(`${kat} 的走位穿过 ${hit.id}（(${R(p.x)}, ${R(p.z)})）`); break; }
              }
              if (InRiver(p, stand)) { errors.push(`${kat} 的走位进了河里（(${R(p.x)}, ${R(p.z)})）`); break; }
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
      if (a.spawn) PointCheck(`${at} ${a.id} spawn`, a.spawn, { body: isPerson && a.keys[0]?.visible !== false, river: a.keys[0]?.visible !== false });
    }
    // 台词不互相压；说话的人看得见（没藏起来、在镜头里）
    const sorted = [...seq.lines].sort((p, q) => p.t - q.t);
    for (let i = 0; i < sorted.length; i++) {
      const l = sorted[i], v = lines.get(l.line);
      if (!v) { errors.push(`${at}：台词 ${l.line} 不在清单里`); continue; }
      const end = l.t + v.durationS;
      if (end > seq.durationS + 0.01) warnings.push(`${at}：台词 ${l.line} 在段落结束后才说完（${R(end)} > ${seq.durationS}）`);
      const nx = sorted[i + 1];
      if (nx && nx.t < end - 0.001) errors.push(`${at}：台词 ${l.line}（到 ${R(end)} s）被 ${nx.line}（${nx.t} s）压住`);
      if (l.actor && l.actor !== "player") {
        const a = seq.actors.find(x => x.id === l.actor);
        const base = a?.spawn || units.get(l.actor);
        if (!base) continue;
        if (VisibleAt(a, a?.spawn, l.t) === false) { errors.push(`${at}：${l.line} 的说话人 ${l.actor} 这时候是隐藏的`); continue; }
        const tRef = { t: l.t + 0.3 };
        const sig = SignalsAt(tRef.t);
        const shot = SamplePrevizCamera(nseq.camera, tRef.t, CameraResolver(kf, nseq, StandFor(sig), tRef));
        if (!shot) { errors.push(`${at}：${l.line} 说话时没有镜头`); continue; }
        const p = ActorAt(a, base, tRef.t);
        const d = Math.hypot(p.x - shot.position.x, p.z - shot.position.z);
        const off = Math.abs(WrapDeg(YawTo(shot.position, p) - shot.yawDeg));
        const half = (shot.fov ?? 60) * 0.5 + 20;
        if (d > 3.0 && off > half) errors.push(`${at}：${l.line} 的说话人 ${l.actor} 不在镜头里（离 ${R(d)} m，偏 ${R(off)}°，视场半宽 ${R(half)}°）`);
      }
    }
    // 镜头点：在场地里、不在实心块里、不在河里（眼睛也查）
    for (const c of seq.camera) {
      for (const key of ["from", "to"]) if (c[key] && c[key].x !== undefined) {
        const p = c[key];
        if (!InBounds(p)) errors.push(`${at} 镜头@${c.t}.${key} 出了场地`);
        else {
          const { solids, stand } = SolidsAt(c.t + (key === "to" ? c.dur : 0));
          const hit = BodyHit(solids, stand, p.x, p.z, { r: 0.12, tol: 0.0, fromM: 0.2, toM: (p.h ?? 1.6) + 0.1, tallM: 0.3 });
          if (hit) errors.push(`${at} 镜头@${c.t}.${key} 在实心块 ${hit.id} 里：(${p.x}, ${p.z})`);
          if (InRiver(p, stand)) errors.push(`${at} 镜头@${c.t}.${key} 在河里：(${p.x}, ${p.z})`);
        }
      }
      if (c.eye && c.eye.x !== undefined) {
        const p = c.eye;
        if (!InBounds(p)) errors.push(`${at} 眼睛@${c.t} 出了场地`);
        else {
          const { solids, stand } = SolidsAt(c.t);
          const hit = BodyHit(solids, stand, p.x, p.z, { r: 0.12, tol: 0.0, fromM: 0.2, toM: 1.7, tallM: 0.3 });
          if (hit) errors.push(`${at} 眼睛@${c.t} 在实心块 ${hit.id} 里：(${p.x}, ${p.z})`);
          if (InRiver(p, stand)) errors.push(`${at} 眼睛@${c.t} 在河里：(${p.x}, ${p.z})`);
        }
      }
      if (c.t + c.dur > seq.durationS + 0.01) warnings.push(`${at} 镜头@${c.t} 在段落结束后才结束`);
    }
    for (const e of seq.events) if (e.t > seq.durationS + 0.01) warnings.push(`${at} 事件 ${e.type}@${e.t} 在段落结束之后`);
    rows.push(`${seq.keyframe} · ${seq.durationS} s · 镜头 ${seq.camera.length} · 台词 ${seq.lines.length} · 片段 ${[...clipsUsed].sort().join("、") || "（无）"}`);
  }
  if (doc.sequences.length !== config.keyframes.length) errors.push(`预演 ${doc.sequences.length} 段，关键帧 ${config.keyframes.length} 个`);
  DesignChecks(doc, norm, config, layout, ground, StandFor, errors);
  return { errors, warnings, rows };
}

/** 剧本要求的设计口径（只查 FirstLevel1218）。 */
function DesignChecks(doc, norm, config, layout, ground, StandFor, errors) {
  if (doc.level !== "FirstLevel1218") return;
  const Seq = id => doc.sequences.find(s => s.keyframe === id);
  const NSeq = id => norm.sequences.find(s => s.keyframe === id);
  const KF = id => config.keyframes.find(k => k.id === id);
  const Keys = (seq, id) => seq?.actors.find(a => a.id === id)?.keys || [];
  const Has = (seq, type, f = () => true) => seq.events.some(e => e.type === type && f(e));
  const SignalEv = (id, name, on) => Seq(id).events.find(e => e.type === "signal" && e.name === name && e.on === on);
  const Line = (seq, id) => seq.lines.find(l => l.line === id);
  /** 镜头在 t 时的采样（站立面按那一刻的信号）。 */
  const ShotAt = (id, t) => {
    const n = NSeq(id), kf = KF(id);
    const sig = SignalsWith(kf.signals, PrevizSignalsAt(n, t));
    const tRef = { t };
    return SamplePrevizCamera(n.camera, t, CameraResolver(kf, n, StandFor(sig), tRef));
  };
  // 信号按拍开
  {
    const cart = SignalEv("13-1", "CartOverturned", true);
    if (!cart) errors.push("13-1：车被扫翻那一下要打开 CartOverturned");
    else if (cart.t < 3 || cart.t > Seq("13-1").durationS - 2) errors.push(`13-1：CartOverturned 要在段落中间打开（现在 ${cart.t} s）`);
    const blown = SignalEv("18-3", "BridgeBlown", true);
    if (!blown) errors.push("18-3：炸桥要打开 BridgeBlown");
    else if (blown.t < Seq("18-3").durationS - 12) errors.push(`18-3：BridgeBlown 要在段落末尾打开（现在 ${blown.t} s，段长 ${Seq("18-3").durationS}）`);
    for (const s of doc.sequences) if (s.events.some(e => e.type === "signal" && e.name === "ChargesSet")) errors.push(`${s.keyframe}：ChargesSet 18-1 起本来就开，预演里别动它`);
    if (!Has(Seq("13-1"), "caption", e => /Z 卧倒/.test(e.text))) errors.push("13-1：卧倒的按键时刻要有说明字");
    if (!Keys(Seq("13-1"), "GengCart").some(k => k.visible === false)) errors.push("13-1：车翻了以后立着的车要藏掉");
    if (!Keys(Seq("13-1"), "Heizi").some(k => k.state === "down")) errors.push("13-1：黑子要被扫倒");
    if (!Keys(Seq("13-1"), "LiuWencai").some(k => k.x !== undefined && k.move === "run")) errors.push("13-1：刘文财要从沟里跳出去");
    if (!Line(Seq("13-1"), "AirRaidWarning.01")) errors.push("13-1：要有「飞机！飞机！趴倒！」");
  }
  // 12-2：短褂那一下有说明字 + 震屏，有顺子替身，侧拍车尾
  {
    const s = Seq("12-2");
    if (!Has(s, "caption", e => /扯/.test(e.text)) || !Has(s, "shake")) errors.push("12-2：背后被扯一下要有说明字 + 震屏");
    if (!s.actors.some(a => a.id === "ShunziDouble" && a.spawn)) errors.push("12-2：短过场要有顺子替身");
    if (!s.camera.some(c => c.from && c.from.x !== undefined)) errors.push("12-2：短过场要用 from/to 侧拍");
    if (!Has(s, "caption", e => /棉袄/.test(e.text))) errors.push("12-2：老耿脱棉袄要有说明字");
  }
  // 12-3：妮儿从车尾走到驴头前；planeDrone 在东边
  {
    const s = Seq("12-3");
    const nier = Keys(s, "Nier").find(k => k.x !== undefined && k.move !== "cut");
    const head = KF("12-3").units.find(u => u.id === "Nier");
    if (!nier || Math.hypot(nier.x - head.x, nier.z - head.z) > 0.5) errors.push("12-3：妮儿要从车尾走到驴头前");
    const drone = s.events.filter(e => e.type === "sfx" && e.name === "planeDrone");
    if (!drone.length || drone.some(e => e.x < 60)) errors.push("12-3：末尾的 planeDrone 要在东边响起");
  }
  // 14-2：眼睛砸到趴 + 杠子脱手说明字；之后依次看到杠子、担架、冬瓜、老耿；最后抬担架进沟
  {
    const s = Seq("14-2"), n = NSeq("14-2"), kf = KF("14-2");
    const drop = s.events.find(e => e.type === "caption" && /杠子从手里脱出去/.test(e.text));
    if (!drop) { errors.push("14-2：杠子脱手要有说明字"); }
    else {
      if (!s.camera.some(c => c.eye?.stance === "prone" && c.t >= drop.t - 0.6 && c.t <= drop.t + 1.5)) errors.push("14-2：杠子脱手时眼睛要砸到趴");
      const gengEntry = s.actors.find(a => a.id === "Geng"), dongEntry = s.actors.find(a => a.id === "Donggua");
      const gengBase = kf.units.find(u => u.id === "Geng"), dongBase = kf.units.find(u => u.id === "Donggua");
      const Seen = (name, entry, base, from, to) => {
        for (let t = from; t <= to; t += 0.25) {
          const shot = ShotAt("14-2", t);
          if (!shot) continue;
          const p = ActorAt(entry, base, t);
          const off = Math.abs(WrapDeg(YawTo(shot.position, p) - shot.yawDeg));
          if (off <= 12) return true;
        }
        errors.push(`14-2：杠子脱手后（${from}…${to} s）眼睛没有正眼看到${name}`);
        return false;
      };
      const eyeUp = s.camera.find(c => c.from && c.from.h !== undefined && c.from.h < 0.5 && c.t > drop.t + 5);
      const until = eyeUp ? eyeUp.t : s.durationS;
      Seen("冬瓜", dongEntry, dongBase, drop.t + 1, until);
      Seen("老耿", gengEntry, gengBase, drop.t + 1, until);
      if (!Keys(s, "Geng").some(k => k.carryRole === null)) errors.push("14-2：老耿要先举着后杠、后来才松手");
      if (!Keys(s, "Geng").some(k => k.stance === "prone")) errors.push("14-2：老耿要扑到冬瓜身上（stance prone；百姓做不到就看说明字）");
      if (!Has(s, "caption", e => /扑上去/.test(e.text))) errors.push("14-2：老耿扑上去要有说明字");
      if (!Has(s, "caption", e => /弹孔/.test(e.text))) errors.push("14-2：弹孔离担架一步远要有说明字");
      const ptsNear = s.events.filter(e => e.type === "explosion" && (e.radius ?? 1) <= 1 && Math.hypot(e.x - dongBase.x, e.z - dongBase.z) < 4);
      if (ptsNear.length < 3) errors.push("14-2：担架 / 冬瓜旁边要有一串小土（弹孔）");
      if (!Has(s, "caption", e => /飞机过去了/.test(e.text))) errors.push("14-2：末尾要有「飞机过去了……抬进沟里」说明字");
    }
  }
  // 15-2：眼睛一直在沟里（眼高低于两岸），到沟出口才开阔
  {
    const s = Seq("15-2");
    let inDitch = 0;
    for (let t = 1; t <= s.durationS; t += 0.5) {
      const shot = ShotAt("15-2", t);
      if (!shot) continue;
      const { x, z } = shot.position;
      const g = ground(x, z);
      if (g > -1.3 || z > 633) continue;   // 沟口斜坡、穿过河堤口子以后的出口段不算（那里两岸本来就低）
      inDitch++;
      const banks = Math.max(ground(x, z - 3), ground(x, z + 3), ground(x - 3, z), ground(x + 3, z));
      if (shot.position.y >= banks - 0.05) errors.push(`15-2：${t} s 眼睛高 ${R(shot.position.y)} 没有低于两岸（${R(banks)}）`);
    }
    if (inDitch < 40) errors.push(`15-2：眼睛在沟底的采样只有 ${inDitch} 个（要沿沟走一整段）`);
    if (s.lines.length) errors.push("15-2：这一段没有台词");
    if (!s.camera.some(c => c.look?.actor === "LiuWencai" || c.lookTo?.actor === "LiuWencai")) errors.push("15-2：途中要回头看一眼刘文财");
    if (!Has(s, "caption", e => /浮桥/.test(e.text))) errors.push("15-2：沟到头要看到浮桥（说明字）");
  }
  // 15-3：画驴说明字、刘文财蹲、老耿转开脸、「下一副！」
  {
    const s = Seq("15-3");
    if (!Has(s, "caption", e => /画/.test(e.text) && /弹壳/.test(e.text) || /弹壳/.test(e.text))) errors.push("15-3：妮儿画驴摆弹壳要有说明字");
    if (!Keys(s, "LiuWencai").some(k => k.stance === "crouch")) errors.push("15-3：刘文财要蹲下来看");
    if (!Keys(s, "Geng").some(k => k.faceTo !== undefined || k.yawDeg !== undefined)) errors.push("15-3：老耿要把脸转开（转身）");
    if (!Line(s, "GateQueue.06")) errors.push("15-3：门里要喊「下一副！」");
  }
  // 16-1：过门槛眼睛一低一抬 + 轻微震屏；放担架的说明字
  {
    const s = Seq("16-1");
    const dip = s.camera.filter(c => c.from && c.to && c.from.h !== undefined && c.to.h !== undefined && Math.abs(c.to.h - c.from.h) > 0.2 && c.shake);
    if (dip.length < 2) errors.push("16-1：过门槛要有一低一抬两段带震屏的镜头");
    if (!Has(s, "caption", e => /按住键/.test(e.text))) errors.push("16-1：放担架的按键时刻要有说明字");
    if (!Keys(s, "LiuWencai").some(k => k.carryRole === "rear")) errors.push("16-1：刘文财要抬后头");
  }
  // 17：军医蹲、说「没了」、吼门口、走回院里；棉袄盖脸说明字；17-2 按 F 说明字、没台词；17-3 班长蹲下掀棉袄、幺娃挪眼睛
  {
    const s = Seq("17-1");
    if (!Keys(s, "Doctor").some(k => k.stance === "crouch")) errors.push("17-1：军医要蹲在担架边");
    const gone = Line(s, "Gone.01"), shout = Line(s, "Gone.02");
    if (!gone || !shout || shout.t < gone.t) errors.push("17-1：先「没了」再冲门口吼");
    if (!Keys(s, "Doctor").some(k => k.x !== undefined && k.t > (shout?.t ?? 0) && k.z < 620)) errors.push("17-1：军医吼完要走回院里");
    if (!Has(s, "caption", e => /棉袄/.test(e.text) && /脸/.test(e.text))) errors.push("17-1：老耿拉棉袄盖脸要有说明字");
    if (!Keys(s, "Nier").filter(k => k.faceTo !== undefined).length >= 2) errors.push("17-1：妮儿要看看这个大人、又看看那个");
    const s2 = Seq("17-2");
    if (s2.lines.length) errors.push("17-2：这一段没有台词");
    if (!Has(s2, "caption", e => /按 F/.test(e.text))) errors.push("17-2：数铜板的按键时刻要有说明字");
    if (s2.durationS < 20 || s2.durationS > 30) errors.push(`17-2：要 20–30 s（现在 ${s2.durationS}）`);
    if (!s2.actors.some(a => a.spawn?.kind === "litter")) errors.push("17-2：院子里要有人抬进抬出");
    const s3 = Seq("17-3");
    if (!Keys(s3, "Luo").some(k => k.stance === "crouch")) errors.push("17-3：班长要在担架边蹲下");
    if (!Has(s3, "caption", e => /掀开棉袄/.test(e.text))) errors.push("17-3：掀棉袄一角要有说明字");
    const order = ["GetUp.01", "GetUp.02", "GetUp.03", "GetUp.04", "GetUp.05"].map(id => Line(s3, id)?.t);
    if (order.some(t => t === undefined) || order.some((t, i) => i && t <= order[i - 1])) errors.push("17-3：GetUp 五句要按序");
    if (!Keys(s3, "Yaowa").some(k => k.faceTo !== undefined && k.t > (order[2] ?? 0))) errors.push("17-3：幺娃看见铜板要把眼睛挪开");
    if (!Keys(s3, "Luo").some(k => k.x !== undefined && k.move !== "cut" && k.t > 0)) errors.push("17-3：班长要从院门走进来");
  }
  // 18-1：铁路桥炸（远、高、黑烟）；桥头的兵扭头看；全班进散兵坑
  {
    const s = Seq("18-1");
    const blast = s.events.find(e => e.type === "explosion" && e.x < -230);
    if (!blast || !(blast.h >= 4 && blast.h <= 6) || !(blast.radius >= 6)) errors.push("18-1：远处铁路桥要炸（h 4–6、radius 大一点）");
    if (!Has(s, "smoke", e => e.kind === "SmokeBlack" && e.x < -230)) errors.push("18-1：铁路桥那里要有黑烟");
    if (!Has(s, "sfx", e => e.name === "shellBlast" || e.name === "artilleryFar")) errors.push("18-1：铁路桥炸要有声音");
    for (const id of ["BridgeOfficer", "Luo", "BridgeGuard1"]) if (!Keys(s, id).some(k => k.faceTo && k.faceTo.x !== undefined && k.faceTo.x < -230)) errors.push(`18-1：${id} 要扭头看铁路桥`);
    const slots = KF("18-2").units;
    for (const id of ["Luo", "Yaowa", "HeYoutian", "LiuWencai"]) {
      const to = slots.find(u => u.id === id);
      if (!Keys(s, id).some(k => k.x !== undefined && Math.hypot(k.x - to.x, k.z - to.z) < 0.6)) errors.push(`18-1：${id} 要走进散兵坑`);
    }
  }
  // 18-2：掷弹筒越落越近；机枪先哑、幺娃才挥手、最后一拨才跑；「打掉那挺机枪」说明字；老耿牵着妮儿在桥上往南
  {
    const s = Seq("18-2"), p = KF("18-2").player;
    const impacts = s.events.filter(e => e.type === "sfx" && e.name === "mortarImpact").sort((a, b) => a.t - b.t);
    if (impacts.length < 3) errors.push("18-2：掷弹筒至少落三发");
    for (let i = 1; i < impacts.length; i++) if (Math.hypot(impacts[i].x - p.x, impacts[i].z - p.z) >= Math.hypot(impacts[i - 1].x - p.x, impacts[i - 1].z - p.z)) errors.push("18-2：掷弹筒落点要越来越近");
    if (!s.events.some(e => e.type === "sfx" && e.name === "mortarPop")) errors.push("18-2：掷弹筒要有「嘭」");
    const mgDown = Keys(s, "IjaMg").find(k => k.state === "down");
    const wave = Line(s, "LastOnes.01"), lastRun = Keys(s, "LastGroup1").find(k => k.x !== undefined && k.move === "run");
    const lastLine = Line(s, "LastOnes.02");
    if (!mgDown) errors.push("18-2：机枪组要被打掉");
    if (!wave || !mgDown || wave.t < mgDown.t) errors.push("18-2：机枪哑了幺娃才站起来挥手");
    if (!lastRun || !wave || lastRun.t < wave.t) errors.push("18-2：幺娃挥了手最后一拨才跑");
    if (!lastLine || !lastRun || lastLine.t > lastRun.t) errors.push("18-2：「后头没得人了」要在领头的跑过顺子身边时喊（跑到之前）");
    if (!Has(s, "caption", e => /打掉那挺机枪/.test(e.text))) errors.push("18-2：打机枪的玩家操作时刻要有说明字");
    if (!Has(s, "muzzle", e => e.actor === "IjaMg")) errors.push("18-2：鬼子机枪要有枪口火");
    for (const id of ["HoldTheBridge.01", "HoldTheBridge.02", "HoldTheBridge.05"]) if (!Line(s, id)) errors.push(`18-2：要有 ${id}`);
    if (!Keys(s, "Geng").some(k => k.x !== undefined && k.z > 700)) errors.push("18-2：老耿要牵着妮儿在桥面上往南走");
    const ready = Line(s, "HoldTheBridge.01"), now = Line(s, "HoldTheBridge.02");
    if (ready && now && now.t < ready.t) errors.push("18-2：先「准备点火」再「炸！不等了」");
  }
  // 18-3：全班 run 过桥；眼睛过桥时高度跟着桥面；班长最后上南岸；「点！」；炸桥：爆炸 + 水柱 + 震屏 + BridgeBlown
  {
    const s = Seq("18-3");
    const onDeck = [];
    for (let t = 0; t <= s.durationS; t += 0.5) {
      const shot = ShotAt("18-3", t);
      if (!shot) continue;
      const { x, z, y } = shot.position;
      if (z < BR.northFootZ + 1 || z > BR.southFootZ - 1 || Math.abs(x - BR.x) > BR.deckW / 2) continue;
      onDeck.push(t);
      const sig = SignalsWith(KF("18-3").signals, PrevizSignalsAt(NSeq("18-3"), t));
      const stand = StandFor(sig)(x, z);
      if (stand < HT.deckTopY - 0.05) errors.push(`18-3：${t} s 眼睛脚下是 ${R(stand)}，不是桥面（${HT.deckTopY}）`);
      if (y < HT.deckTopY + 1.3 || y > HT.deckTopY + 1.8) errors.push(`18-3：${t} s 眼睛高 ${R(y)} 没跟着桥面（桥面 ${HT.deckTopY} + 站高）`);
    }
    if (onDeck.length < 20) errors.push(`18-3：眼睛在桥面上的采样只有 ${onDeck.length} 个（要沿桥中线跑过去）`);
    for (const id of ["Yaowa", "HeYoutian", "LiuWencai", "Squad1", "BridgeGuard1"]) if (!Keys(s, id).some(k => k.x !== undefined && k.move === "run" && k.z > 700)) errors.push(`18-3：${id} 要跑过桥到南岸`);
    const luoRuns = Keys(s, "Luo").filter(k => k.x !== undefined && k.move === "run");
    if (luoRuns.length < 4 || !luoRuns.every(k => k.yawDeg === 0 && k.aim)) errors.push("18-3：班长要倒退着一截一截边打边撤（到点朝北举枪）");
    const point = Line(s, "CrossNow.02"), luoSouth = luoRuns.find(k => k.z >= BR.southFootZ);
    if (!point || !luoSouth || point.t < luoSouth.t) errors.push("18-3：班长踏上南岸军官才喊「点！」");
    if (!Has(s, "caption", e => /引线/.test(e.text))) errors.push("18-3：引线烧过桥板要有说明字");
    const blown = SignalEv("18-3", "BridgeBlown", true);
    const blasts = s.events.filter(e => e.type === "explosion" && e.z < BR.northFootZ + 16 && e.z > BR.northFootZ - 2 && Math.abs(e.x - BR.x) < 2);
    if (blasts.length < 3) errors.push("18-3：北头几条船那里要有几团爆炸");
    if (!Has(s, "smoke", e => (e.kind === "SmokeWhite" || e.kind === "SmokeDust") && Math.abs(e.z - 652) < 8)) errors.push("18-3：炸桥要有水柱（SmokeWhite / SmokeDust 顶）");
    if (!Has(s, "shake", e => e.strength >= 0.6)) errors.push("18-3：炸桥要震屏");
    if (blown && point && blown.t < point.t) errors.push("18-3：「点！」之后才炸");
  }
  // 18-4：北岸堤上鬼子枪口火、断桥着火、马灯那一眼、班长「走！」
  {
    const s = Seq("18-4");
    if (s.events.filter(e => e.type === "muzzle" && /^LeveeIja/.test(e.actor)).length < 6) errors.push("18-4：北岸堤上要有鬼子枪口火（若干）");
    if (!Has(s, "smoke", e => e.kind === "SmokeBlack" && e.z > 640 && e.x < -155)) errors.push("18-4：断桥要在下游着火（SmokeBlack 在 debris）");
    if (!Has(s, "caption", e => /马灯/.test(e.text))) errors.push("18-4：马灯还亮着要有说明字");
    const lamp = { x: -163.6, z: 618.6 };
    let seen = 0;
    for (let t = 0; t <= s.durationS; t += 0.25) {
      const shot = ShotAt("18-4", t);
      if (shot && Math.abs(WrapDeg(YawTo(shot.position, lamp) - shot.yawDeg)) < 4) seen += 0.25;
    }
    if (seen < 1.0) errors.push(`18-4：镜头要在院门灯桩方向停一两秒（现在 ${R(seen)} s）`);
    if (!Line(s, "KeepMoving.01")) errors.push("18-4：班长要吼「走！」");
  }
  // 18-5：先黑场 + 日期字幕，淡入往北门走，最后进门洞、黑场收尾、then stay
  {
    const s = Seq("18-5");
    const black = s.events.filter(e => e.type === "black").sort((a, b) => a.t - b.t);
    if (!black.length || black[0].t > 0.01 || black[0].dur < 3) errors.push("18-5：开头要先黑几秒");
    if (!Has(s, "caption", e => /1938年3月1[45]日 夜｜滕县北门/.test(e.text) && e.t < 3)) errors.push("18-5：黑场上要有日期字幕「1938年3月14日 夜｜滕县北门」");
    if (black.length < 2 || black[black.length - 1].t < s.durationS - 10) errors.push("18-5：末尾要黑场收尾");
    for (const id of ["NorthGate.01", "NorthGate.02", "NorthGate.03"]) if (!Line(s, id)) errors.push(`18-5：要有 ${id}`);
    if (s.then !== "stay") errors.push("18-5：最后一段 then 要是 stay");
    const last = s.camera[s.camera.length - 1];
    const endShot = ShotAt("18-5", s.durationS - 0.5);
    if (!endShot || endShot.position.z < 862) errors.push("18-5：最后眼睛要进门洞看城里往南的街");
    void last;
  }
  for (const s of doc.sequences) if (s.keyframe !== "18-5" && s.then !== "next") errors.push(`${s.keyframe}：播完要 then: next`);
  // 大段的镜头轨：每一刻都能采样（没有空档让 SamplePrevizCamera 报错）
  for (const n of norm.sequences) {
    for (let t = 0; t <= n.durationS; t += 1.0) {
      try {
        const shot = ShotAt(n.keyframe, t);
        if (!shot || !Number.isFinite(shot.position?.x) || !Number.isFinite(shot.yawDeg)) throw new Error("采样结果不是有限数字");
      } catch (e) { errors.push(`${n.keyframe}：镜头在 ${t} s 采样出错：${e.message}`); break; }
    }
  }
  void layout;
}

async function Main(argv) {
  const config = Load("Blockout/FirstLevel1218.json"), voice = Load("Blockout/FirstLevel1218.voice.json");
  let doc;
  if (argv.includes("--fresh")) {
    const { BuildPreviz } = await import("./Script_EditorBlockoutFirstLevel1218Previz.mjs");
    doc = BuildPreviz({ config, voice });
    const again = JSON.stringify(BuildPreviz({ config, voice }));
    if (again !== JSON.stringify(doc)) { console.log("错误：两次生成不一样"); process.exitCode = 1; }
    else console.log("两次生成逐字相同");
  } else {
    const file = join(HERE, "Blockout/FirstLevel1218.previz.json");
    if (!existsSync(file)) { console.log("还没有 Blockout/FirstLevel1218.previz.json（先跑生成器 --force）"); process.exitCode = 1; return; }
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
