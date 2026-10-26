// ===========================================================================
// Script_EditorBlockoutFirstLevel1218PrevizTest.mjs —— FirstLevel1218（11–18，2026-10-26 第三版：北沙河村与铁路桥）预演数据的纯 node 自检
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218PrevizTest.mjs           → 查 Blockout/FirstLevel1218.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218PrevizTest.mjs --fresh   → 查生成器当场生成的那份（并核对两次生成逐字相同）
//
// 查（照 0610 的 PrevizTest，加了这片场地专有的几条）：运行时包的 ValidateBlockoutPreviz（关键帧 / 单位 / 台词 id / 字段）；
// 每个片段在那具骨架上烘过（有 castId 的按 Data_FirstLevelSpeakingCast 的骨架，没有 castId 的士兵只许五具骨架都有的通用片段；
// 程序化身体的百姓一个片段都不许——只有关键帧里写了 body:"rig" 的那几帧例外）；同一段里台词不互相压；演员走位点在场地范围内、身子不进实心块
// （按那一刻的信号算随信号体块，路线按 0.5 m 取样）；没人走进沙河中间那股水（蹚水的老乡 Wader* 例外；铁路桥桥面是 standOn 走道，站得上去）；
// 走位要求的速度不离谱；说话的人那一刻看得见（没藏起来，而且在镜头里）；机位与眼睛不在实心块里、不在水里；说话姿态（§14.4，空手的百姓不管）；
// 剧本要求的（契约 2026-10-26）：33 帧一帧一段；11–12 落炮 / 「看」那一下 / 沟口喝问 / 黑子不走妮儿牵过板桥 / 钢盔冒头 / 一家人钻洞 / 女娃探头；
// 13 两辆九四式开到沟沿外、车上机枪扫沟沿、有人往沟口跑、信号弹；14 飞机（顺战壕扫 + 小炸弹 + 掉头扫街）、黑子挨一梭车翻（CartOverturned）、
// 揪被角（妮儿 carryRole front + PvBlanketDragR）、松手 slowmo（窗口里没台词）+ dragSolo、老耿接角拖进洞；15–17 台词按序、片段；
// 18 担架和兵踩着枕木走桥面（脚下是枕木顶）、老乡在河床蹚水、机枪先哑顺子才喊、班长最后一个过桥、「点！」后 BridgeBlown、断孔上没人、
// 黑场 + 日期字幕、then stay；全篇不用删掉的台词与旧地名；镜头轨每一秒都能采样。
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HeightGridSampler, LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { CharacterClipModelId } from "./Data_CharacterSelection.mjs";
import { BlockStandSampler, PrevizSignalsAt, NormalizeBlockoutPreviz, SamplePrevizCamera, SamplePrevizActor, SamplePrevizAircraft, PrevizStrafeImpacts } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { BLOCKOUT_PREVIZ_CLIP_LIBRARIES } from "./Data_BlockoutPrevizClips.mjs";
import { L1218_RIVER as RV, L1218_RAIL_BRIDGE as RB, L1218_RAIL as RL, L1218_HEIGHTS as HT, L1218_AID as A, L1218_PLACES as PL, L1218_SIGNALS as SIG, RiverAtX } from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const Load = f => JSON.parse(readFileSync(join(HERE, f), "utf8"));
const R = v => Math.round(v * 100) / 100;

const MODEL_ID = { nra: { 1: "TengxianNra02", 4: "TengxianNra05", 5: "TengxianNra06" }, ija: { 0: "TengxianIja01", 1: "TengxianIja02", 2: "TengxianIja03", 5: "TengxianIja06" } };
const SPEED = { walk: 1.4, run: 3.5, crawl: 0.5, drag: 0.9 };
const PEOPLE = new Set(["soldier", "officer", "civilian", "child", undefined]);
const IDS = ["11-1", "11-2", "12-1", "12-2", "12-3", "12-4", "12-5", "12-6", "12-7", "13-1", "13-2", "13-3", "14-1", "14-2", "14-3", "14-4", "14-5", "14-6",
  "15-1", "15-2", "15-3", "16-1", "17-1", "17-2", "17-3", "18-1", "18-2", "18-3", "18-4", "18-5", "18-6", "18-7", "18-8"];
/** 蹚水过河的老乡（18-3）：本来就该走在河床和水里。 */
const IsWader = id => /^Wader/.test(id || "");
const Dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function ClipTable() {
  const lib = Load("Animation/OpeningStoryboards/Data_OpeningStoryboardsAnimation.json");
  const byModel = new Map(lib.models.map(m => [m.id, new Set(m.clipIds)]));
  const metaTable = new Map(Object.entries(lib.clips));
  const sets = [...byModel.values()];
  const common = new Set([...sets[0]].filter(c => sets.every(s => s.has(c))));
  for (const extra of BLOCKOUT_PREVIZ_CLIP_LIBRARIES) {
    const file = join(HERE, extra.base, extra.manifest);
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    for (const [name, meta] of Object.entries(manifest.clips || {})) {
      for (const set of [...sets, common]) set.add(name);
      if (!metaTable.has(name)) metaTable.set(name, meta);
    }
  }
  return { byModel, common, meta: metaTable };
}
const IsCiv = u => u?.side === "civ" || u?.kind === "civilian" || u?.kind === "child";
function ClipSetFor(unit, table) {
  if (IsCiv(unit) && unit?.body !== "rig") return { name: "程序化身体（没有动作库）", clips: new Set() };
  if (IsCiv(unit) || unit?.kind === "officer") return { name: "骨骼占位身体（只许通用片段）", clips: table.common };
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
/** 在水里：沙河中间那股水（河床上的沙地不算；铁路桥桥面是 standOn 走道，站在上头不算）。 */
function InRiver(p, stand) {
  const r = RiverAtX(p.x);
  if (Math.abs(p.z - r.streamZ) >= RV.stream.halfW) return false;
  return stand(p.x, p.z) < HT.streamTopY + 0.05;
}
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

function RideAt(entry, base, t) {
  let r = base?.ride ?? null;
  for (const k of entry?.keys || []) { if (k.t > t + 1e-6) break; if (k.ride !== undefined) r = k.ride; }
  return r && r.on ? r : null;
}
function YawAt(entry, base, t) {
  let yaw = base?.yawDeg ?? 0;
  for (const k of entry?.keys || []) { if (k.t > t + 1e-6) break; if (k.yawDeg !== undefined) yaw = k.yawDeg; }
  return yaw;
}
/** 演员在 t 时的大致位置（按预演键直线插值；挂在车上的按车那一刻的位置 ∘ 本地偏移）。 */
function ActorAt(entry, base, t, ctx = null) {
  const ride = ctx ? RideAt(entry, base, t) : null;
  if (ride) {
    const cEntry = ctx.seq.actors.find(a => a.id === ride.on), cBase = ctx.units.get(ride.on) || cEntry?.spawn;
    if (cBase) {
      const c = ActorAt(cEntry, cBase, t, null), r = YawAt(cEntry, cBase, t) * Math.PI / 180, lx = ride.x || 0, lz = ride.z || 0;
      return { x: c.x + lx * Math.cos(r) + lz * Math.sin(r), z: c.z - lx * Math.sin(r) + lz * Math.cos(r) };
    }
  }
  const keys = (entry?.keys || []).filter(k => k.x !== undefined);
  let prev = { x: base.x, z: base.z, t: 0 }, next = null;
  for (const k of keys) { if (k.t <= t + 1e-6) prev = k; else { next = k; break; } }
  if (!next || next.move === "cut" || next.t <= prev.t) return { x: prev.x, z: prev.z };
  const u = Math.max(0, Math.min(1, (t - prev.t) / (next.t - prev.t)));
  // 带 path 的那一段按折线弧长插值（运行时同样沿途经点走）
  const pts = [prev, ...(next.path || []), next];
  let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  let d = u * total;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (d <= l || i === pts.length - 1) { const k = l > 1e-9 ? Math.min(1, d / l) : 1; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * k }; }
    d -= l;
  }
  return { x: next.x, z: next.z };
}
function VisibleAt(entry, spawn, t) {
  const visKeys = (entry?.keys || []).filter(k => k.visible !== undefined && k.t <= t + 0.01);
  return visKeys.length ? visKeys[visKeys.length - 1].visible : (spawn?.visible ?? true);
}
function CameraResolver(kf, seq, stand, tRef = { t: 0 }) {
  const at = id => (id === "player" ? { unit: kf.player, entry: null } : { unit: (kf.units || []).find(u => u.id === id) || seq.actors.find(a => a.id === id)?.spawn || null, entry: seq.actors.find(a => a.id === id) });
  return anchor => {
    if (!anchor) return null;
    if (anchor.aircraft) {
      const entry = (seq.aircraft || []).find(p => p.id === anchor.aircraft);
      if (!entry) return null;
      const pose = SamplePrevizAircraft(entry, tRef.t, { groundAt: stand });
      const [dx, dy, dz] = anchor.offset || [0, 0, 0];
      return { x: pose.x + dx, y: pose.y + dy, z: pose.z + dz };
    }
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
      if (base && Math.hypot(p.x - base.x, p.z - base.z) < 0.02) slopeWarn = false;
      if (!InBounds(p)) { errors.push(`${kat} 出了场地：(${p.x}, ${p.z})`); return; }
      if (slopeWarn && Slope(p.x, p.z) > 0.45) warnings.push(`${kat} 落在斜坡 / 沟壁上（0.35 m 内高差 ${R(Slope(p.x, p.z))} m）：(${p.x}, ${p.z})`);
      const { solids, stand } = SolidsAt(t);
      if (river && InRiver(p, stand)) errors.push(`${kat} 在河里：(${p.x}, ${p.z})`);
      if (body) {
        const hit = BodyHit(solids, stand, p.x, p.z);
        if (hit) errors.push(`${kat} 身子进了实心块 ${hit.id}：(${p.x}, ${p.z})`);
      }
    };
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
          PointCheck(kat, k, { t: k.t, body: isPerson && k.visible !== false, base, river: k.visible !== false && !IsWader(a.id) });
          const pts = [prev, ...(k.path || []), k];
          if (k.move !== "cut" && k.visible !== false) {
            const { solids, stand } = SolidsAt(k.t);
            for (const p of Samples(pts).slice(1, -1)) {
              if (isPerson) {
                const hit = BodyHit(solids, stand, p.x, p.z, { tallM: 1.6 });
                if (hit) { errors.push(`${kat} 的走位穿过 ${hit.id}（(${R(p.x)}, ${R(p.z)})）`); break; }
              }
              if (!IsWader(a.id) && InRiver(p, stand)) { errors.push(`${kat} 的走位进了河里（(${R(p.x)}, ${R(p.z)})）`); break; }
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
      if (a.spawn) PointCheck(`${at} ${a.id} spawn`, a.spawn, { body: isPerson && a.keys[0]?.visible !== false, river: a.keys[0]?.visible !== false && !IsWader(a.id) });
    }
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
        const p = ActorAt(a, base, tRef.t, { seq, units });
        const d = Math.hypot(p.x - shot.position.x, p.z - shot.position.z);
        const off = Math.abs(WrapDeg(YawTo(shot.position, p) - shot.yawDeg));
        const half = (shot.fov ?? 60) * 0.5 + 20;
        if (d > 3.0 && off > half) errors.push(`${at}：${l.line} 的说话人 ${l.actor} 不在镜头里（离 ${R(d)} m，偏 ${R(off)}°，视场半宽 ${R(half)}°）`);
      }
    }
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
  TalkPostureChecks(doc, config, table, errors);
  DesignChecks(doc, norm, config, layout, ground, StandFor, lines, errors);
  return { errors, warnings, rows };
}

/**
 * 说话姿态（§14.4，照 0105 / 0610 的 TalkPostureChecks）：每句有说话人的台词开始那一刻，说话人要么在播片段，要么倒在地上、在投弹，
 * 要么前后 1.5 s 内自己开过枪；跑着喊、手上没据枪的也算。端着枪（aim）又没在开枪 → 错；没播片段干站 / 干蹲着拿枪 → 错。
 * 空手的百姓（side civ，程序化身体放不了片段）不受这条管——这条是管枪的。
 */
export const TALK_FIRE_WINDOW_S = 1.5;
function TalkPostureChecks(doc, config, table, errors) {
  const clipDuration = clip => { const m = table.meta.get(clip); return !m || m.loop === true ? null : m.duration ?? null; };
  for (const seq of doc.sequences) {
    const kf = config.keyframes.find(k => k.id === seq.keyframe);
    if (!kf) continue;
    const units = new Map((kf.units || []).map(u => [u.id, u]));
    for (const l of seq.lines) {
      const id = l.actor;
      if (!id) continue;
      const a = seq.actors.find(x => x.id === id);
      const base = a?.spawn || units.get(id);
      if (!base) continue;
      if (IsCiv(base) || base.weapon === null) continue;
      const st = a ? SamplePrevizActor(a, l.t, base, { clipDuration }) : { stance: base.stance, aim: !!base.aim, state: base.state, visible: true };
      if (st.visible === false) continue;
      const fired = seq.events.some(e => e.type === "muzzle" && e.actor === id && Math.abs(e.t - l.t) <= TALK_FIRE_WINDOW_S + 1e-6);
      if (st.state === "down" || st.clip || st.throw || fired) continue;
      if (st.moving && !st.aim) continue;
      errors.push(`${seq.keyframe}：${l.line}（${id}@${l.t}）${st.aim ? "端着枪说话、前后 1.5 s 没开枪" : "说话时没播片段（手里拿着枪干站 / 干蹲着）"}`);
    }
  }
}

/** 剧本要求的设计口径（只查 FirstLevel1218 第三版，契约 2026-10-26「一、故事」）。 */
function DesignChecks(doc, norm, config, layout, ground, StandFor, voiceLines, errors) {
  if (doc.level !== "FirstLevel1218") return;
  const Seq = id => doc.sequences.find(s => s.keyframe === id);
  const NSeq = id => norm.sequences.find(s => s.keyframe === id);
  const KF = id => config.keyframes.find(k => k.id === id);
  const Unit = (kfId, uid) => KF(kfId)?.units.find(u => u.id === uid);
  const Keys = (seq, id) => seq?.actors.find(a => a.id === id)?.keys || [];
  const PosKeys = (seq, id) => Keys(seq, id).filter(k => k.x !== undefined);
  const Has = (seq, type, f = () => true) => seq.events.some(e => e.type === type && f(e));
  const Cap = (seq, re) => Has(seq, "caption", e => re.test(e.text));
  const SignalEv = (id, name, on) => Seq(id).events.find(e => e.type === "signal" && e.name === name && e.on === on);
  const Line = (seq, id) => seq.lines.find(l => l.line === id);
  const LineEnd = (seq, id) => { const l = Line(seq, id); return l ? l.t + voiceLines.get(id).durationS : undefined; };
  const Need = (seq, ids) => { for (const id of ids) if (!Line(seq, id)) errors.push(`${seq.keyframe}：要有 ${id}`); };
  const InOrder = (seq, ids) => { const ts = ids.map(id => Line(seq, id)?.t); if (ts.some(t => t === undefined) || ts.some((t, i) => i && t <= ts[i - 1])) errors.push(`${seq.keyframe}：${ids.join(" / ")} 要都有、按序`); };
  const NeedClip = (id, who, clip, note) => { if (!Keys(Seq(id), who).some(k => k.clip === clip)) errors.push(`${id}：${who} 要放 ${clip}（${note}）`); };
  const ShotAt = (id, t) => {
    const n = NSeq(id), kf = KF(id);
    const sig = SignalsWith(kf.signals, PrevizSignalsAt(n, t));
    const tRef = { t };
    return SamplePrevizCamera(n.camera, t, CameraResolver(kf, n, StandFor(sig), tRef));
  };
  /** 眼睛在 from…to 之间有没有正眼（≤ tol°）看过某个点。 */
  const Looked = (id, p, from, to, tol = 12) => { for (let t = from; t <= to; t += 0.25) { const shot = ShotAt(id, t); if (shot && Math.abs(WrapDeg(YawTo(shot.position, p) - shot.yawDeg)) <= tol) return true; } return false; };
  const StateAt = (id, who, t) => { const s = Seq(id), a = s.actors.find(x => x.id === who); const base = a?.spawn || Unit(id, who); return a ? SamplePrevizActor(a, t, base) : null; };
  const SegD = (st, p) => { const dx = st.to.x - st.from.x, dz = st.to.z - st.from.z, l2 = dx * dx + dz * dz; const k = Math.max(0, Math.min(1, ((p.x - st.from.x) * dx + (p.z - st.from.z) * dz) / l2)); return Math.hypot(p.x - st.from.x - dx * k, p.z - st.from.z - dz * k); };
  const Strafes = s => (s.aircraft || []).flatMap(p => p.strafe || []);
  const HOLE = A.holes[0].mouth;
  const OnDeck = p => Math.abs(p.x - RL.x) < RB.walkW / 2 && p.z > RB.northZ + 1 && p.z < RB.southZ - 1;
  const SPAN = (RB.southZ - RB.northZ) / RB.spans;
  const allText = JSON.stringify(doc);

  // 33 帧一帧一段；播完 then next、最后一段 stay；全篇没有旧戏的词
  for (const id of IDS) if (!Seq(id)) errors.push(`缺 ${id} 这一段`);
  for (const s of doc.sequences) if (s.keyframe !== "18-8" && s.then !== "next") errors.push(`${s.keyframe}：播完要 then: next`);
  if (Seq("18-8")?.then !== "stay") errors.push("18-8：最后一段 then 要是 stay");
  for (const bad of ["棉袄", "单褂子", "冻得发抖", "短褂", "临城", "犟种", "浮桥", "渡口", "石板桥", "河汊子", "接收院", "豁子", "填沟", "跟斗走"]) if (allText.includes(bad)) errors.push(`预演里还有旧戏的词「${bad}」`);
  for (const id of ["SquadOrders", "FollowCart", "FerryCall", "AcrossTheCreek", "NierScream", "GullyBottom", "GateQueue", "Gone.", "GetUp", "BridgeOrders", "HoldTheBridge", "LastOnes", "CrossNow", "NorthGate.03"]) if (allText.includes(`"${id}`)) errors.push(`预演里还在用删掉的台词 ${id}`);
  // 程序化身体的百姓一个片段都不许（关键帧 body rig 的那几帧除外）
  for (const s of doc.sequences) for (const a of s.actors) { const u = a.spawn || Unit(s.keyframe, a.id); if (IsCiv(u) && u.body !== "rig" && a.keys.some(k => typeof k.clip === "string")) errors.push(`${s.keyframe}：${a.id} 是程序化身体，不许放片段`); }

  // 11-1：身后一发炮落在胡同里 + 震屏；庄子里落炮冒黑烟；妮儿坐上车尾；往南看
  { const s = Seq("11-1");
    if (!Has(s, "explosion", e => Dist(e, PL.laneShell) < 2) || !Has(s, "shake")) errors.push("11-1：身后那发炮要落在胡同里（explosion + 震屏）");
    if (s.events.filter(e => e.type === "smoke" && e.kind === "SmokeBlack" && e.z < 545).length < 3) errors.push("11-1：庄子里要一排排落炮、冒黑烟");
    if (!Keys(s, "Nier").some(k => k.ride?.on === "GengCart")) errors.push("11-1：妮儿要坐上车尾沿（ride）");
    if (!Cap(s, /往南看/)) errors.push("11-1：往南看土路 / 官道 / 北沙河村要有说明字"); }
  // 11-2：班长那句 + 挥手；车动、全班跟车往南跑
  { const s = Seq("11-2"); Need(s, ["RetreatOrder.01"]); NeedClip("11-2", "Luo", "PvStandWaveOnL", "往北沙河撤");
    const c0 = Unit("11-2", "GengCart"), last = PosKeys(s, "GengCart").at(-1);
    if (!last || Dist(last, c0) < 10) errors.push("11-2：车要往南走（≥ 10 m）");
    if (!Keys(s, "Luo").some(k => k.x !== undefined && k.move === "run")) errors.push("11-2：全班要跟车往南跑"); }
  // 12-1：打偏的那发落在麦地；冬瓜 / 顺子；任务字
  { const s = Seq("12-1"); InOrder(s, ["AlmostThere.01", "AlmostThere.02"]);
    if (!Has(s, "explosion", e => Dist(e, PL.fieldShell) < 2)) errors.push("12-1：一发炮要打偏落在路边麦地");
    if (!Cap(s, /土泼一车/) || !Cap(s, /任务字：跟车进北沙河村/)) errors.push("12-1：土泼一车、任务字要有说明字"); }
  // 12-2：「轰」老耿家冒烟、眼睛像按了「看」一样转过去；LookBack
  { const s = Seq("12-2");
    const boom = s.events.find(e => e.type === "explosion" && Dist(e, PL.gengSmoke) < 3);
    if (!boom || !Has(s, "smoke", e => e.kind === "SmokeBlack" && Dist(e, PL.gengSmoke) < 3)) errors.push("12-2：老耿家要「轰」一声冒黑烟");
    if (!Cap(s, /「看」/)) errors.push("12-2：「看」的按键要有说明字");
    if (boom && !Looked("12-2", PL.gengSmoke, boom.t, boom.t + 4, 8)) errors.push("12-2：「轰」之后眼睛要像按了「看」一样转去看老耿家");
    InOrder(s, ["LookBack.01", "LookBack.02"]); }
  // 12-3：沟口：哨兵喝问、班长答、连长交代
  { const s = Seq("12-3"); InOrder(s, ["DitchSentry.01", "DitchSentry.02", "DitchSentry.03"]);
    NeedClip("12-3", "Sentry", "PvStandHaltL", "端枪喝问"); NeedClip("12-3", "Captain", "PvStandPointL", "指村西头");
    if (!Cap(s, /板桥/) || !Cap(s, /添树枝/)) errors.push("12-3：沟、板桥、添树枝要有说明字"); }
  // 12-4：妮儿先挂回车尾、再溜下去牵黑子过板桥；老耿「驾」；钢盔冒头、七二七团机枪一响缩回去；送到了就回来
  { const s = Seq("12-4"), keys = Keys(s, "Nier");
    if (!(keys[0]?.t === 0 && keys[0].ride?.on === "GengCart")) errors.push("12-4：妮儿开场要挂回车尾（预演键 ride）");
    const off = keys.find(k => k.ride === null);
    if (!off || off.x === undefined || off.move !== "cut") errors.push("12-4：妮儿要溜下车（ride: null + 切到车尾外）");
    const last = PosKeys(s, "Nier").at(-1), heizi = PosKeys(s, "Heizi").at(-1);
    if (!last || last.z < PL.plankSouth.z || !heizi || heizi.z < PL.plankSouth.z) errors.push("12-4：妮儿要牵着黑子过了板桥");
    InOrder(s, ["BalkingMule.01", "BackSoon.01"]);
    if (!Cap(s, /捧/)) errors.push("12-4：捧脸要有说明字");
    const show = Keys(s, "Helmet1").find(k => k.visible === true), hide = Keys(s, "Helmet1").filter(k => k.visible === false);
    if (!show || !hide.some(k => k.t > show.t)) errors.push("12-4：钢盔要冒出来再缩回去（visible）");
    if (!s.events.some(e => e.type === "muzzle" && e.actor === "Mg727" && show && e.t > show.t)) errors.push("12-4：钢盔冒头后七二七团的机枪要响"); }
  // 12-5：标语；一家人钻洞、席子盖洞口（FamilyHidden）；老汉
  { const s = Seq("12-5"); InOrder(s, ["OldMan.01", "OldMan.02"]);
    if (!SignalEv("12-5", "FamilyHidden", true)) errors.push("12-5：最后一个拿席子盖住洞口（FamilyHidden）");
    if (!["Fam1", "Fam2", "Fam3"].every(id => Keys(s, id).some(k => k.visible === false))) errors.push("12-5：一家人要钻进洞里（藏掉）");
    if (!Cap(s, /标语/)) errors.push("12-5：大字标语要有说明字"); }
  // 12-6：枕木垛、教堂门口往里进；车往西拐
  { const s = Seq("12-6");
    if (!["ChurchIn1", "ChurchIn2", "ChurchIn3"].every(id => PosKeys(s, id).length)) errors.push("12-6：教堂门口要有人往里进");
    if (!Cap(s, /枕木/) || !Cap(s, /教堂门口/) || !Cap(s, /往西拐/)) errors.push("12-6：枕木垛、教堂、车往西拐要有说明字"); }
  // 12-7：医官、女娃探头、冬瓜 / 顺子、任务字回沟口
  { const s = Seq("12-7"); InOrder(s, ["AidArrive.01", "AidArrive.02", "AidArrive.03"]);
    const g = Keys(s, "Girl"); if (!(g[0]?.visible === false && g.some(k => k.visible === true))) errors.push("12-7：隔壁洞口的女娃要探出头（visible false → true）");
    if (!Keys(s, "Nier").some(k => k.faceTo === "Girl")) errors.push("12-7：妮儿要看着女娃");
    if (!Cap(s, /任务字：回沟口/)) errors.push("12-7：任务字回沟口要有说明字"); }
  // 13-1：两辆九四式开到沟沿外停下（走到关键帧位置）；车上机枪扫我们这边的沟沿；玩家打步兵
  { const s = Seq("13-1");
    for (const id of ["Tankette1", "Tankette2"]) { const u = Unit("13-1", id), last = PosKeys(s, id).at(-1); if (!last || Dist(last, u) > 0.5 || PosKeys(s, id).length < 2) errors.push(`13-1：${id} 要顺官道开到沟沿外（关键帧位置）`); }
    const bursts = s.events.filter(e => e.type === "muzzle" && /^Tankette/.test(e.actor || "") && e.count >= 8);
    if (bursts.length < 2) errors.push("13-1：车上的机枪要扫几梭（muzzle count ≥ 8）");
    const puffs = s.events.filter(e => e.type === "explosion" && e.radius <= 1 && e.z > 638 && e.z < 644);
    if (puffs.length < 8) errors.push("13-1：弹着点要扫在我们这边的沟沿上");
    if (s.events.filter(e => e.type === "muzzle" && e.actor === "player").length < 3) errors.push("13-1：玩家要开几枪");
    if (!Cap(s, /过不去/) || !Cap(s, /真打/)) errors.push("13-1：车过不去、玩家真打要有说明字"); }
  // 13-2：有人往沟口跑：有的倒、有的爬过板桥
  { const s = Seq("13-2");
    const downs = ["Runner1", "Runner2", "Runner3", "Runner4", "Runner5", "Runner6"].filter(id => Keys(s, id).some(k => k.state === "down"));
    if (downs.length < 2) errors.push("13-2：要有人倒在半路（≥ 2）");
    const crossed = ["Runner1", "Runner2", "Runner6", "Crawler"].filter(id => PosKeys(s, id).some(k => k.z > PL.plankSouth.z));
    if (crossed.length < 3) errors.push("13-2：要有人扑上板桥爬过来（≥ 3 个过了板桥）");
    if (!Keys(s, "Crawler").some(k => k.move === "crawl" && Math.abs(k.x - PL.plankMid.x) < 2)) errors.push("13-2：要有人在板桥上爬");
    if (!s.actors.filter(a => a.spawn?.side === "ija").every(a => a.keys.some(k => k.state === "down")) || !s.actors.some(a => a.spawn?.side === "ija")) errors.push("13-2：冲板桥的步兵要被打回去");
    if (!Cap(s, /一时谁也过不去/)) errors.push("13-2：一时谁也过不去要有说明字"); }
  // 13-3：信号弹；飞机！趴倒！
  { const s = Seq("13-3");
    if (!Has(s, "flare", e => e.preset === "SignalRed" && Math.hypot(e.atX - PL.flareAt.x, e.atZ - PL.flareAt.z) < 3)) errors.push("13-3：信号弹要用正式弹道特效（flare SignalRed）");
    const flare = s.events.find(e => e.type === "flare"), warn = Line(s, "PlanesWarning.01");
    if (!warn || !flare || warn.t < flare.t + 3) errors.push("13-3：信号弹打上天几秒后才喊「飞机！趴倒！」");
    NeedClip("13-3", "S727_E1", "PvStandPointL", "指着天喊");
    if (!Cap(s, /Z 卧倒/)) errors.push("13-3：卧倒的按键时刻要有说明字"); }
  // 飞机：13-3 / 14-1…14-6 各两架；扫射只在 14-1（两趟）、14-2、14-5；不手放飞机音效
  for (const id of ["13-3", "14-1", "14-2", "14-3", "14-4", "14-5", "14-6"]) {
    const s = Seq(id), planes = s.aircraft || [];
    if (planes.length !== 2 || planes.some(p => p.model !== "MitsubishiKi30")) errors.push(`${id}：要有两架九七式轻爆（aircraft[]），现在 ${planes.length}`);
    for (const p of planes) { if ((p.path || []).length < 3) errors.push(`${id}：${p.id} 的航点太少`); if (p.sound?.drone === false) errors.push(`${id}：${p.id} 的引擎声要跟着飞机走`); }
    const strafes = Strafes(s);
    const want = { "14-1": 2, "14-2": 1, "14-5": 1 }[id] || 0;
    if (strafes.length !== want) errors.push(`${id}：扫射段要 ${want} 段，现在 ${strafes.length}`);
    if (!["14-3"].includes(id) && !s.camera.some(c => c.look?.aircraft || c.lookTo?.aircraft)) errors.push(`${id}：要有一条镜头看着飞机`);
    if (s.events.some(e => e.type === "sfx" && /^(planeDrone|planeDive|strafe)/.test(e.name))) errors.push(`${id}：飞机有轨了，别再手放 planeDrone / planeDive / strafe 音效`);
    for (const st of strafes) for (const p of planes.filter(q => (q.strafe || []).includes(st))) {
      const pose = SamplePrevizAircraft(p, st.t0, { groundAt: ground });
      if (!pose.visible || pose.y - ground(pose.x, pose.z) > 60) errors.push(`${id}：${p.id} 扫射时要在低空（t ${st.t0}：高 ${R(pose.y)}）`);
    }
  }
  // 14-1：顺着战壕扫、沟口扔小炸弹；七二七团的兵倒两个
  { const s = Seq("14-1"), st = Strafes(s);
    if (!st.some(x => Math.abs(x.from.z - 642.5) < 2 && Math.abs(x.to.z - 642.5) < 2 && Math.abs(x.to.x - x.from.x) > 80)) errors.push("14-1：第一趟要顺着村北沿的战壕扫");
    if (!st.some(x => SegD(x, { x: 150, z: 690.6 }) < 4)) errors.push("14-1：第二趟要掉头顺着村里的主街扫");
    if (s.events.filter(e => e.type === "explosion" && e.kind === "shell" && Dist(e, PL.plankMid) < 30).length < 2) errors.push("14-1：沟口要扔小炸弹");
    for (const id of ["S727_W2", "S727_E2"]) if (!Keys(s, id).some(k => k.state === "down")) errors.push(`14-1：${id} 要挨了倒下`); }
  // 14-2：顺儿！去看冬瓜！跑到救护所门前；飞机顺西头的街扫，黑子挨一梭、车翻（CartOverturned）
  { const s = Seq("14-2"); Need(s, ["GoSeeDonggua.01"]); NeedClip("14-2", "Luo", "PvCrouchTalkRifle", "推顺子");
    const st = Strafes(s)[0], cart = SignalEv("14-2", "CartOverturned", true);
    if (!st || SegD(st, Unit("14-2", "Heizi")) > 3) errors.push("14-2：扫射要扫到院门口的黑子");
    if (!cart || !st || !(cart.t >= st.t0 && cart.t <= st.t1 + 0.5)) errors.push("14-2：车要在那一串弹着扫过去时翻（CartOverturned）");
    if (!Keys(s, "Heizi").some(k => k.state === "down")) errors.push("14-2：黑子要被扫倒");
    if (!Keys(s, "GengCart").some(k => k.visible === false)) errors.push("14-2：车翻了以后立着的车要藏掉");
    const end = ShotAt("14-2", s.durationS - 0.2);
    if (!end || Dist(end.position, PL.aidGateOut) > 9) errors.push("14-2：顺子要跑到救护所门前"); }
  // 14-3：黑子蹬腿；刘文财朝天打
  { const s = Seq("14-3");
    if (s.events.filter(e => e.type === "muzzle" && e.actor === "LiuWencai").length < 3) errors.push("14-3：刘文财在院门口朝天上打");
    if (!Cap(s, /蹬/) || !Cap(s, /墙根露天/)) errors.push("14-3：黑子蹬腿、冬瓜一个人在墙根要有说明字"); }
  // 14-4：老耿那句 + 任务字；妮儿揪住另一角；往洞口拖
  { const s = Seq("14-4"); Need(s, ["BringHim.01"]);
    if (!Cap(s, /任务字：把冬瓜拖进洞里/) || !Cap(s, /揪单被一个角/)) errors.push("14-4：任务字、揪被角要有说明字");
    if (!Keys(s, "Nier").some(k => k.carryRole === "front") || !Keys(s, "Nier").some(k => /^PvBlanketDrag/.test(k.clip || ""))) errors.push("14-4：妮儿要揪住另一个角（carryRole front + PvBlanketDrag）");
    const last = PosKeys(s, "BlanketDonggua").at(-1);
    if (!last || Dist(last, HOLE) >= Dist(Unit("14-4", "BlanketDonggua"), HOLE) - 1) errors.push("14-4：被子要往洞口拖");
    if (Keys(s, "BlanketDonggua").some(k => k.dragSolo === true)) errors.push("14-4：两人都攥着，被子不该 dragSolo"); }
  // 14-5：慢动作窗口；窗口里没台词；dragSolo；只剩妮儿攥着；弹着点扫过冬瓜；妮儿脸朝顺子；刘文财看见
  { const s = Seq("14-5"), slow = s.slowmo || [];
    if (s.lines.length) errors.push("14-5：这一段没有台词");
    if (slow.length !== 1) errors.push(`14-5：要有一个慢动作窗口（slowmo），现在 ${slow.length}`);
    else {
      const w = slow[0], drop = s.events.find(e => e.type === "caption" && /被角从手里脱出去/.test(e.text));
      if (!(w.rate <= 0.5 && w.dur >= 1.0 && w.dur <= 3.0)) errors.push(`14-5：慢动作要放慢到五成以下、1–3 s（现在 ×${w.rate}、${w.dur} s）`);
      if (!drop) errors.push("14-5：被角脱手要有说明字");
      else if (!(drop.t >= w.t && drop.t < w.t + w.dur)) errors.push("14-5：慢动作要盖住松手那一下");
      const solo = Keys(s, "BlanketDonggua").find(k => k.dragSolo === true);
      if (!solo) errors.push("14-5：松手后被子要写 dragSolo: true（玩家那角不攥）");
      else {
        if (!(solo.t >= w.t && solo.t < w.t + w.dur)) errors.push("14-5：dragSolo 要在慢动作窗口里（松手那一刻）");
        for (const t of [solo.t + 0.5, solo.t + 3, s.durationS - 0.5]) {
          const holders = s.actors.filter(a => StateAt("14-5", a.id, t)?.carryRole === "front").map(a => a.id);
          if (holders.join() !== "Nier") errors.push(`14-5：${t} s 攥着被角的应当只有妮儿（现在：${holders.join("、") || "没人"}）`);
          if (StateAt("14-5", "BlanketDonggua", t)?.dragSolo !== true) errors.push(`14-5：${t} s 被子要还是 dragSolo`);
        }
        if (StateAt("14-5", "BlanketDonggua", Math.max(0, solo.t - 0.5))?.dragSolo === true) errors.push("14-5：松手前被子不该 dragSolo");
        // 关键帧 14-5 的被子单位本身写着 dragSolo: true（松手后的样子）：预演开场要先写回 false，不然运行时松手前就只剩一角
        const firstSolo = Keys(s, "BlanketDonggua").find(k => k.dragSolo !== undefined);
        if (Unit("14-5", "BlanketDonggua")?.dragSolo === true && !(firstSolo && firstSolo.t === 0 && firstSolo.dragSolo === false)) errors.push("14-5：关键帧单位是 dragSolo，开场要先写 dragSolo: false（两角都攥着）");
      }
      const bl = Unit("14-5", "BlanketDonggua");
      if (!Strafes(s).some(st => SegD(st, bl) < 1.5 && st.t0 >= w.t - 0.5 && st.t0 < w.t + w.dur)) errors.push("14-5：弹着点要在慢动作里从冬瓜身上扫过（strafe 离被子 < 1.5 m）");
      const lowCam = c => (c.eye?.stance === "prone") || (c.from && c.from.h !== undefined && c.from.h <= 0.6 && !c.to);
      if (!s.camera.some(c => lowCam(c) && drop && c.t >= drop.t - 0.1 && c.t <= drop.t + 1.5)) errors.push("14-5：松手后眼睛要砸到趴（prone 眼睛或 ≤ 0.6 m 的机位）");
      if (!Keys(s, "Nier").some(k => k.faceTo === "player" && drop && k.t > drop.t)) errors.push("14-5：妮儿要脸朝顺子");
      if (!Keys(s, "LiuWencai").some(k => k.faceTo === "player")) errors.push("14-5：刘文财要脸冲这边");
      if (!Cap(s, /洇开一片血/) || !Cap(s, /自己手边空了/)) errors.push("14-5：洇血、手边空了要有说明字");
      if (!Keys(s, "Donggua").some(k => k.clip === "CareLieWrithe")) errors.push("14-5：冬瓜挨枪要一抽（CareLieWrithe）");
    } }
  // 14-6：老耿接另一角、dragSolo 回 false；刘文财捞走妮儿；拖进洞里；飞机往东
  { const s = Seq("14-6");
    if (!Keys(s, "Geng").some(k => k.carryRole === "front") || !Keys(s, "Geng").some(k => /^PvBlanketDrag/.test(k.clip || ""))) errors.push("14-6：老耿要揪住另一角");
    const solo = Keys(s, "BlanketDonggua").find(k => k.dragSolo === false), grab = Keys(s, "Geng").find(k => k.carryRole === "front");
    if (!solo || !grab || Math.abs(solo.t - grab.t) > 1.0) errors.push("14-6：老耿攥住那一刻被子要写回 dragSolo: false");
    if (!Keys(s, "Nier").some(k => k.carryRole === null) || !Keys(s, "LiuWencai").some(k => k.x !== undefined && k.move === "run")) errors.push("14-6：刘文财要冲过来把妮儿捞走（妮儿松开被角）");
    const last = PosKeys(s, "BlanketDonggua").at(-1);
    if (!last || Dist(last, Unit("14-6", "BlanketDonggua")) > 1.0) errors.push("14-6：被子要拖到洞口（关键帧位置）");
    if (!Cap(s, /往东飞走/)) errors.push("14-6：飞机往东飞走要有说明字"); }
  // 15-1：老耿跪着按毛巾；冬瓜攥袖子 clipRelease；四句按序
  { const s = Seq("15-1"); NeedClip("15-1", "Geng", "CareMedicPress", "跪着把毛巾按回伤口"); NeedClip("15-1", "Donggua", "PvLieGrabSleeve", "伸手攥袖子");
    InOrder(s, ["InTheHole.01", "InTheHole.02", "InTheHole.03", "InTheHole.04"]);
    const grab = Keys(s, "Donggua").find(k => k.clip === "PvLieGrabSleeve"), end = LineEnd(s, "InTheHole.03");
    if (!grab || end === undefined || Math.abs(grab.t + grab.clipRelease - end) > 0.3) errors.push("15-1：冬瓜说完「抵了」才松开袖子（clipRelease 对上第三句末尾）");
    if (!Cap(s, /红天/)) errors.push("15-1：洞顶漏下一条红天要有说明字"); }
  // 15-2：没对白；抬出洞到厢房门口
  { const s = Seq("15-2");
    if (s.lines.length) errors.push("15-2：这一段没有对白");
    const last = PosKeys(s, "BlanketDonggua").at(-1);
    if (!last || Dist(last, Unit("15-3", "BlanketDonggua")) > 0.5) errors.push("15-2：被子要抬到厢房门口（15-3 的位置）");
    if (!Cap(s, /天一点点黑/)) errors.push("15-2：天一点点黑要有说明字"); }
  // 15-3：守门的兵、画驴、算账、犟、下一副
  { const s = Seq("15-3"); InOrder(s, ["XiangDoorQueue.01", "XiangDoorQueue.02", "XiangDoorQueue.03", "XiangDoorQueue.04", "XiangDoorQueue.05"]);
    NeedClip("15-3", "Nier", "PvKneelDig", "蹲着画驴"); NeedClip("15-3", "LiuWencai", "PvCrouchCountFingers", "算驴腿的账"); NeedClip("15-3", "DoorGuard", "PvStandHaltL", "把人往外推");
    if (!Cap(s, /把脸转开/) || !Cap(s, /画驴/)) errors.push("15-3：画驴、老耿把脸转开要有说明字"); }
  // 16-1：过门槛
  { const s = Seq("16-1"); InOrder(s, ["Threshold.01", "Threshold.02", "Threshold.03"]);
    const last = PosKeys(s, "BlanketDonggua").at(-1);
    if (!last || Dist(last, A.dongguaInside) > 0.5) errors.push("16-1：被子要抬进厢房靠墙的空地");
    if (!Cap(s, /门槛/) || !Cap(s, /慢慢放/)) errors.push("16-1：门槛、慢慢放要有说明字"); }
  // 17-1：没了；老耿用单被盖脸
  { const s = Seq("17-1"); InOrder(s, ["NoMore.01", "NoMore.02", "NoMore.03"]); NeedClip("17-1", "Geng", "PvKneelPullBlanket", "单被盖脸");
    if (!Cap(s, /单被盖住/)) errors.push("17-1：单被盖脸要有说明字"); }
  // 17-2：铜板 F；院里抬进抬出、马灯
  { const s = Seq("17-2");
    if (!s.actors.some(a => a.spawn?.kind === "litter")) errors.push("17-2：院子里要有人抬进抬出");
    if (!Cap(s, /F/) || !Cap(s, /马灯/)) errors.push("17-2：按 F、点马灯要有说明字"); }
  // 17-3：班长进院、掀被角、四句
  { const s = Seq("17-3"); InOrder(s, ["WhatHappened.01", "WhatHappened.02", "WhatHappened.03", "WhatHappened.04"]); NeedClip("17-3", "Luo", "LuoKneelCheck", "掀开被角看一眼");
    if (!Cap(s, /铜板/)) errors.push("17-3：幺娃看见铜板要有说明字"); }
  // 18-1：命令五句；担架抬出去、医官跟最后一副
  { const s = Seq("18-1"); InOrder(s, ["Orders727.01", "Orders727.02", "Orders727.03", "Orders727.04", "Orders727.05"]);
    for (const id of ["AidLitter1", "AidLitter2", "AidLitter3", "Doctor"]) { const last = PosKeys(s, id).at(-1); if (!last || last.x < A.box.maxX) errors.push(`18-1：${id} 要从院门出去`); }
    const l3 = PosKeys(s, "AidLitter3").find(k => k.t > 0), doc3 = PosKeys(s, "Doctor").find(k => k.t > 0);
    if (!(doc3?.t > l3?.t)) errors.push("18-1：医官跟着最后一副走");
    if (!Cap(s, /盖着脸/)) errors.push("18-1：屋里只剩盖着脸的要有说明字"); }
  // 18-2：老耿冲洞口喊；女人摇头、拉席子盖洞口（GirlHoleCovered 先关后开）
  { const s = Seq("18-2"); Need(s, ["GoNow.01"]);
    const off = SignalEv("18-2", "GirlHoleCovered", false), on = SignalEv("18-2", "GirlHoleCovered", true), say = Line(s, "GoNow.01");
    if (!off || off.t > 0.01 || !on || !say || on.t < say.t) errors.push("18-2：洞口开场没盖、喊完以后女人才把席子拉上（GirlHoleCovered 先关后开）");
    if (!Keys(s, "GirlMother").some(k => k.visible === false)) errors.push("18-2：女人要缩回洞里");
    if (!Cap(s, /摇摇头/)) errors.push("18-2：摇头要有说明字"); }
  // 18-3：担架、兵、老耿妮儿踩着枕木走桥面（脚下是枕木顶）；老乡在河床里蹚水
  { const s = Seq("18-3"), n = NSeq("18-3"), kf = KF("18-3");
    const crossers = [];
    for (const a of s.actors) {
      const base = a.spawn || Unit("18-3", a.id); if (!base) continue;
      let on = 0, bad = null;
      for (let t = 0; t <= s.durationS; t += 0.5) {
        const p = ActorAt(a, base, t);
        if (!OnDeck(p)) continue;
        on++;
        const stand = StandFor(SignalsWith(kf.signals, PrevizSignalsAt(n, t)))(p.x, p.z);
        if (stand < HT.sleeperTopY - 0.1) bad = `${a.id}@${t} 脚下 ${R(stand)}`;
      }
      if (on >= 4) crossers.push(a.id);
      if (bad) errors.push(`18-3：走桥面的人脚下要是枕木顶（${HT.sleeperTopY}）：${bad}`);
    }
    for (const id of ["AidLitter2", "AidLitter3", "Geng", "Nier"]) if (!crossers.includes(id)) errors.push(`18-3：${id} 要走在铁路桥桥面上（现在走桥面的：${crossers.join("、") || "没有"}）`);
    for (const id of ["Wader1", "Wader2", "Wader3"]) {
      const last = PosKeys(s, id).at(-1);
      if (!last || ground(last.x, last.z) > HT.riverBedY + 0.3) errors.push(`18-3：${id} 要在河床里蹚水`);
    }
    let deckShots = 0;
    for (let t = 0; t <= s.durationS; t += 0.5) { const shot = ShotAt("18-3", t); if (shot && OnDeck(shot.position) && shot.position.y > HT.sleeperTopY + 1.0) deckShots++; }
    if (deckShots < 4) errors.push(`18-3：顺子要跟着担架走上桥面（眼睛在桥面上的采样只有 ${deckShots} 个）`);
    if (!Cap(s, /枕木/) || !Cap(s, /蹚水/) || !Cap(s, /光路基/)) errors.push("18-3：枕木桥面、蹚水、光路基要有说明字"); }
  // 18-4：工兵绑炸药；机枪压住土坎后的班长他们；四句
  { const s = Seq("18-4"); InOrder(s, ["HoldOn.01", "HoldOn.02", "HoldOn.03", "HoldOn.04"]); NeedClip("18-4", "Sapper1", "PvKneelDig", "桥墩上绑炸药");
    if (!s.events.some(e => e.type === "muzzle" && e.actor === "IjaMg18" && e.count >= 8)) errors.push("18-4：田里那挺机枪要扫");
    if (s.events.filter(e => e.type === "explosion" && e.radius <= 1 && Math.abs(e.z - 729.3) < 2).length < 6) errors.push("18-4：弹着点要压在土坎上");
    for (const id of ["Luo", "Yaowa", "HeYoutian"]) { const last = PosKeys(s, id).at(-1), u = Unit("18-4", id); if (!last || Dist(last, u) > 0.5) errors.push(`18-4：${id} 要跳回土坎后头（关键帧位置）`); }
    if (!Cap(s, /土坎/)) errors.push("18-4：压在土坎后头要有说明字"); }
  // 18-5：玩家压机枪 → 机枪哑 → 顺子喊「快过来」 → 班长他们跑过桥面，班长最后一个 → 「后头没得人了」
  { const s = Seq("18-5");
    const mgDown = Keys(s, "IjaMg18").find(k => k.state === "down"), come = Line(s, "ComeOver.01"), last = Line(s, "ComeOver.02");
    if (!mgDown || !come || come.t < mgDown.t) errors.push("18-5：机枪哑了顺子才站起来喊「快过来」");
    if (come?.actor) errors.push("18-5：「快过来！快过来！」是顺子（玩家）喊的");
    const arrive = id => PosKeys(s, id).filter(k => k.z > RB.southZ).map(k => k.t)[0];
    const luoT = arrive("Luo");
    if (luoT === undefined) errors.push("18-5：班长要跑过桥到南岸");
    for (const id of ["Yaowa", "HeYoutian", "Squad1", "Squad2"]) { const t = arrive(id); if (t === undefined) errors.push(`18-5：${id} 要跑过桥到南岸`); else if (luoT !== undefined && t > luoT) errors.push(`18-5：班长要最后一个过桥（${id} 比他晚）`); }
    const crossesDeck = id => PosKeys(s, id).some(k => (k.path || []).some(p => Math.abs(p.x - RL.x) < 0.5));
    if (!["Luo", "Yaowa", "HeYoutian"].every(crossesDeck)) errors.push("18-5：班长他们要走铁路桥桥面（路线过桥面中线）");
    if (!last || luoT === undefined || last.t < luoT - 1.0) errors.push("18-5：班长踏上南岸才喊「后头没得人了」"); }
  // 18-6：「点！」之后北头两孔炸断（BridgeBlown 先关后开）；炸断以后没人站在断孔上
  { const s = Seq("18-6"); Need(s, ["LightIt.01"]);
    const off = SignalEv("18-6", "BridgeBlown", false), on = SignalEv("18-6", "BridgeBlown", true), say = Line(s, "LightIt.01");
    if (!off || off.t > 0.01 || !on || !say || on.t < say.t) errors.push("18-6：「点！」之后才炸（BridgeBlown 开场关、炸时开）");
    const blasts = s.events.filter(e => e.type === "explosion" && Math.abs(e.x - RL.x) < 2 && e.z > RB.northZ && e.z < RB.northZ + SPAN * 2 + 1);
    if (blasts.length < 3) errors.push("18-6：北头两孔那里要有几团爆炸");
    if (!Has(s, "shake", e => e.strength >= 0.6)) errors.push("18-6：炸桥要震屏");
    if (!Cap(s, /两孔钢梁/)) errors.push("18-6：钢梁砸进河床要有说明字"); }
  for (const id of ["18-6", "18-7", "18-8"]) {
    const s = Seq(id), n = NSeq(id), kf = KF(id);
    for (const a of s.actors) {
      const base = a.spawn || Unit(id, a.id); if (!base) continue;
      for (let t = 0; t <= s.durationS; t += 0.5) {
        if (!SignalsWith(kf.signals, PrevizSignalsAt(n, t)).includes("BridgeBlown")) continue;
        const p = ActorAt(a, base, t);
        if (Math.abs(p.x - RL.x) < RB.walkW / 2 && p.z > RB.northZ && p.z < RB.northZ + SPAN * 2) { errors.push(`${id}：桥炸断以后 ${a.id} 还站在断孔上（${t} s）`); break; }
      }
    }
  }
  // 18-7：北岸路基上鬼子开枪、村里亮灯、班长「走！」
  { const s = Seq("18-7"); Need(s, ["KeepMoving.01"]);
    if (s.events.filter(e => e.type === "muzzle" && /^BankIja/.test(e.actor || "")).length < 6) errors.push("18-7：北岸路基上要有鬼子枪口火（若干）");
    if (!Cap(s, /亮着灯/)) errors.push("18-7：村里亮灯要有说明字"); }
  // 18-8：先黑场 + 日期字幕；幺娃 / 老耿；舀水；进门洞、黑场收尾
  { const s = Seq("18-8");
    const black = s.events.filter(e => e.type === "black").sort((a, b) => a.t - b.t);
    if (!black.length || black[0].t > 0.01 || black[0].dur < 3) errors.push("18-8：开头要先黑几秒");
    if (!Has(s, "caption", e => e.text === "1938年3月14日 夜｜滕县北门" && e.t < 3)) errors.push("18-8：黑场上要有日期字幕「1938年3月14日 夜｜滕县北门」");
    if (black.length < 2 || black[black.length - 1].t < s.durationS - 10) errors.push("18-8：末尾要黑场收尾");
    InOrder(s, ["NorthGate.01", "NorthGate.02"]);
    if (!Cap(s, /舀/)) errors.push("18-8：有人给进城的人舀水要有说明字");
    const endShot = ShotAt("18-8", s.durationS - 0.5);
    if (!endShot || endShot.position.z < PL.northGate.z) errors.push("18-8：最后眼睛要进门洞"); }
  for (const s of doc.sequences) if (s.events.some(e => e.type === "signal" && e.name === "ChargesSet")) errors.push(`${s.keyframe}：ChargesSet 18-4 起本来就开，预演里别动它`);
  // 镜头轨：每一刻都能采样
  for (const n of norm.sequences) {
    for (let t = 0; t <= n.durationS; t += 1.0) {
      try {
        const shot = ShotAt(n.keyframe, t);
        if (!shot || !Number.isFinite(shot.position?.x) || !Number.isFinite(shot.yawDeg)) throw new Error("采样结果不是有限数字");
      } catch (e) { errors.push(`${n.keyframe}：镜头在 ${t} s 采样出错：${e.message}`); break; }
    }
  }
  void layout; void SIG;
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
