// ===========================================================================
// Script_EditorBlockoutFirstLevel1218PrevizTest.mjs —— FirstLevel1218（11–18，2026-10-23 第二版）预演数据的纯 node 自检
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218PrevizTest.mjs           → 查 Blockout/FirstLevel1218.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218PrevizTest.mjs --fresh   → 查生成器当场生成的那份（并核对两次生成逐字相同）
//
// 查（照 0610 的 PrevizTest，加了这片场地专有的几条）：运行时包的 ValidateBlockoutPreviz（关键帧 / 单位 / 台词 id / 字段）；
// 每个片段在那具骨架上烘过（有 castId 的按 Data_FirstLevelSpeakingCast 的骨架，没有 castId 的士兵只许五具骨架都有的通用片段；
// 程序化身体的百姓一个片段都不许——只有关键帧里写了 body:"rig" 的那几帧例外）；同一段里台词不互相压；演员走位点在场地范围内、身子不进实心块
// （按那一刻的信号算随信号体块，路线按 0.5 m 取样）；没人走进北沙河（浮桥桥面是 ≤1 m 的块顶，站得上去，不算河里）；走位要求的速度不离谱；
// 说话的人那一刻看得见（没藏起来，而且在镜头里）；机位与眼睛不在实心块里、不在河里；说话姿态（§14.4，空手的百姓不管）；
// 剧本要求的（契约 10-23）：23 帧一帧一段；11–12 落炮 / 「看」那一下 / 钢盔冒头 / 渡口喊话；13 机枪扫人堆（弹着点一串串、百姓倒下趴下）、
// 信号弹、两架飞机扫射段穿过浮桥头和人堆、扫到车那一刻 CartOverturned、冬瓜摔到单被上；14-1 揪被角（妮儿 carryRole front + PvBlanketDragR）、
// 14-2 slowmo（窗口里没台词）、被子键 dragSolo 之后只剩妮儿攥着、弹着点从冬瓜身上扫过、14-3 老耿接另一角 / 刘文财捞妮儿 / 手榴弹炸豁子 BreachBlasted；
// 15A 跪着按毛巾、四句按序；15B 没对白、路短；15C 画驴、没有「冻得发抖」；17 单被盖脸、全篇没有「棉袄」；18 那几条照旧（掷弹筒越落越近、
// 机枪先哑最后一拨才跑、过桥眼睛跟着桥面、炸桥、马灯、黑场 + 日期字幕、then stay、删「单褂子」）；镜头轨每一秒都能采样。
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HeightGridSampler, LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { CharacterClipModelId } from "./Data_CharacterSelection.mjs";
import { BlockStandSampler, PrevizSignalsAt, NormalizeBlockoutPreviz, SamplePrevizCamera, SamplePrevizActor, SamplePrevizAircraft, PrevizStrafeImpacts } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { BLOCKOUT_PREVIZ_CLIP_LIBRARIES } from "./Data_BlockoutPrevizClips.mjs";
import { L1218_RIVER as RV, L1218_BRIDGE as BR, L1218_HEIGHTS as HT, L1218_YARD as Y, L1218_PLACES as PL, L1218_BREACH as BCH, L1218_FERRY as FY } from "./Data_EditorBlockoutFirstLevel1218Space.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const Load = f => JSON.parse(readFileSync(join(HERE, f), "utf8"));
const R = v => Math.round(v * 100) / 100;

const MODEL_ID = { nra: { 1: "TengxianNra02", 4: "TengxianNra05", 5: "TengxianNra06" }, ija: { 0: "TengxianIja01", 1: "TengxianIja02", 2: "TengxianIja03", 5: "TengxianIja06" } };
const SPEED = { walk: 1.4, run: 3.5, crawl: 0.5, drag: 0.9 };
const PEOPLE = new Set(["soldier", "officer", "civilian", "child", undefined]);
const IDS = ["11-1", "11-2", "12-1", "12-2", "12-3", "13-1", "13-2", "13-3", "14-1", "14-2", "14-3", "15-1", "15-2", "15-3", "16-1", "17-1", "17-2", "17-3", "18-1", "18-2", "18-3", "18-4", "18-5"];
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
/** 在水里：北沙河（浮桥桥面上不算）或河汊子沟底（石板桥桥面上不算）。 */
function InRiver(p, stand) {
  if (p.z > RV.waterMinZ && p.z < RV.waterMaxZ) return stand(p.x, p.z) < HT.waterY + 0.05;
  if (Math.abs(p.x - 34.5) < 4 && p.z >= 556 && p.z <= RV.waterMinZ) return stand(p.x, p.z) < -1.0;
  return false;
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
  return { x: prev.x + (next.x - prev.x) * u, z: prev.z + (next.z - prev.z) * u };
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

/** 剧本要求的设计口径（只查 FirstLevel1218 第二版）。 */
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
  const Need = (seq, ids) => { for (const id of ids) if (!Line(seq, id)) errors.push(`${seq.keyframe}：要有 ${id}`); };
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
  const MG = { x: BCH.mgPost.x, z: BCH.mgPost.z }, TROUGH = PL.troughAt, FERRY_HEAD = FY.head;
  const allText = JSON.stringify(doc);

  // 23 帧一帧一段；播完 then next、最后一段 stay；全篇没有旧戏的词
  for (const id of IDS) if (!Seq(id)) errors.push(`缺 ${id} 这一段`);
  for (const s of doc.sequences) if (s.keyframe !== "18-5" && s.then !== "next") errors.push(`${s.keyframe}：播完要 then: next`);
  if (Seq("18-5")?.then !== "stay") errors.push("18-5：最后一段 then 要是 stay");
  for (const bad of ["棉袄", "单褂子", "冻得发抖", "短褂", "临城", "犟种", "排水沟", "顺着沟走", "担架前头着地"]) if (allText.includes(bad)) errors.push(`预演里还有旧戏的词「${bad}」`);
  // 程序化身体的百姓一个片段都不许（关键帧 body rig 的那几帧除外）
  for (const s of doc.sequences) for (const a of s.actors) { const u = a.spawn || Unit(s.keyframe, a.id); if (IsCiv(u) && u.body !== "rig" && a.keys.some(k => typeof k.clip === "string")) errors.push(`${s.keyframe}：${a.id} 是程序化身体，不许放片段`); }

  // 11-1：身后一发炮落在胡同里 + 震屏；庄子里落炮冒黑烟；班长那句 + 挥手；往西看
  { const s = Seq("11-1");
    if (!Has(s, "explosion", e => Dist(e, PL.laneShell) < 2) || !Has(s, "shake")) errors.push("11-1：身后那发炮要落在胡同里（explosion + 震屏）");
    if (s.events.filter(e => e.type === "smoke" && e.kind === "SmokeBlack" && e.x > 80 && e.z < 545).length < 3) errors.push("11-1：庄子里要一排排落炮、冒黑烟");
    Need(s, ["SquadOrders.01"]); NeedClip("11-1", "Luo", "PvStandWaveOnL", "喊守桥");
    if (!Cap(s, /往西看/)) errors.push("11-1：往西看小路 / 石板桥 / 渡口要有说明字");
    if (!Keys(s, "Luo").some(k => k.x !== undefined && k.move === "run")) errors.push("11-1：班长要带人往西跑"); }
  // 11-2：我跟车 / 文财你也去；任务字
  { const s = Seq("11-2"); Need(s, ["FollowCart.01", "FollowCart.02"]); NeedClip("11-2", "Luo", "PvStandPointL", "指刘文财");
    if (!Cap(s, /任务字/)) errors.push("11-2：要有任务字「跟车到渡口」说明字");
    if (!Keys(s, "GengCart").some(k => k.x !== undefined && k.x < Unit("11-2", "GengCart").x - 3)) errors.push("11-2：车要往西走"); }
  // 12-1：打偏的那发落在麦地；冬瓜 / 顺子
  { const s = Seq("12-1"); Need(s, ["AlmostThere.01", "AlmostThere.02"]);
    if (!Has(s, "explosion", e => Dist(e, PL.fieldShell) < 2)) errors.push("12-1：一发炮要打偏落在小路南边麦地");
    if (!Cap(s, /土泼一车/)) errors.push("12-1：土泼一车要有说明字"); }
  // 12-2：妮儿先挂回车尾、再溜下去跑到驴头前牵它上桥；老耿「驾」；黑子不走
  { const s = Seq("12-2"), keys = Keys(s, "Nier");
    if (!(keys[0]?.t === 0 && keys[0].ride?.on === "GengCart")) errors.push("12-2：妮儿开场要挂回车尾（预演键 ride）");
    const off = keys.find(k => k.ride === null);
    if (!off || off.x === undefined || off.move !== "cut") errors.push("12-2：妮儿要溜下车（ride: null + 切到车尾外）");
    const last = PosKeys(s, "Nier").at(-1);
    if (!last || last.x > 36) errors.push("12-2：妮儿最后要牵着黑子走上桥面（x < 36）");
    Need(s, ["BalkingMule.01"]);
    if (!Cap(s, /捧/)) errors.push("12-2：捧脸要有说明字");
    if (!Keys(s, "Heizi").some(k => k.x !== undefined && k.x < Unit("12-2", "Heizi").x - 3)) errors.push("12-2：黑子要跟妮儿上桥"); }
  // 12-3：炮停、「轰」老耿家冒烟、「看」那一下眼睛转过去；钢盔冒头 / 缩回；班长他们开火；渡口的兵喊
  { const s = Seq("12-3");
    const boom = s.events.find(e => e.type === "explosion" && Dist(e, PL.gengSmoke) < 3);
    if (!boom || !Has(s, "smoke", e => e.kind === "SmokeBlack" && Dist(e, PL.gengSmoke) < 3)) errors.push("12-3：老耿家要「轰」一声冒黑烟");
    if (!Cap(s, /「看」/)) errors.push("12-3：「看」的按键要有说明字");
    if (boom && !Looked("12-3", PL.gengSmoke, boom.t, boom.t + 4, 8)) errors.push("12-3：「轰」之后眼睛要像按了「看」一样转去看老耿家");
    Need(s, ["LookBack.01", "LookBack.02", "FerryCall.01"]);
    const show = Keys(s, "Helmet1").find(k => k.visible === true), hide = Keys(s, "Helmet1").filter(k => k.visible === false);
    if (!show || !hide.some(k => k.t > show.t)) errors.push("12-3：钢盔要冒出来再缩回去（visible）");
    if (!s.events.some(e => e.type === "muzzle" && e.actor === "Luo" && show && e.t > show.t)) errors.push("12-3：钢盔冒头后班长他们要开火");
    NeedClip("12-3", "FerrySoldier", "PvStandHaltL", "土台子上喊话");
    if (!Cap(s, /往浮桥上挤/)) errors.push("12-3：渡口人流要有说明字"); }
  // 13-1：机枪 muzzle + 弹着点一串串扫过人堆；百姓倒下 / 趴下；刘文财那句；玩家真打说明字；副射手接着打
  { const s = Seq("13-1");
    const bursts = s.events.filter(e => e.type === "muzzle" && (e.actor === "BreachMg" || e.actor === "BreachLoader") && e.count >= 8);
    if (bursts.length < 3) errors.push("13-1：豁子上的机枪要打几梭（muzzle count ≥ 8）");
    const puffs = s.events.filter(e => e.type === "explosion" && e.radius <= 1);
    const crowd = KF("13-1").units.filter(u => u.group === "crowd");
    if (puffs.filter(p => crowd.some(u => Dist(p, u) < 3)).length < 10) errors.push("13-1：弹着点要一串串扫过人堆（小半径 explosion ≥ 10 个落在人堆 3 m 内）");
    const downs = s.actors.filter(a => crowd.some(u => u.id === a.id && u.side === "civ") && a.keys.some(k => k.state === "down"));
    const prones = s.actors.filter(a => crowd.some(u => u.id === a.id) && a.keys.some(k => k.stance === "prone" && k.t > 1));
    if (downs.length < 3) errors.push("13-1：人堆炸开要有百姓倒下（state down ≥ 3）");
    if (prones.length < 4) errors.push("13-1：要有人往堤下趴（stance prone ≥ 4）");
    Need(s, ["AcrossTheCreek.01"]);
    if (!Cap(s, /真打/)) errors.push("13-1：玩家真打要有说明字");
    if (s.events.filter(e => e.type === "muzzle" && e.actor === "player").length < 3) errors.push("13-1：玩家要开几枪");
    if (!Keys(s, "BreachMg").some(k => k.state === "down") || !Keys(s, "BreachLoader").some(k => k.x !== undefined && k.move === "crawl")) errors.push("13-1：机枪手倒了副射手要爬上来接着打"); }
  // 13-2：信号弹；两架飞机扫射段穿过浮桥头和人堆；桥上有人倒下藏掉；扫到车那一刻 CartOverturned、冬瓜摔到单被上；「飞机！趴倒！」
  { const s = Seq("13-2"), planes = s.aircraft || [], strafes = planes.flatMap(p => p.strafe || []);
    if (!Has(s, "flare", e => e.preset === "SignalRed" && Math.hypot(e.atX-PL.flareAt.x,e.atZ-PL.flareAt.z)<3)) errors.push("13-2：信号弹必须使用正式弹道特效到达渡口上空");
    if (!strafes.length) errors.push("13-2：要有扫射段");
    for (const st of strafes) {
      const SegD = p => { const dx = st.to.x - st.from.x, dz = st.to.z - st.from.z, l2 = dx * dx + dz * dz; const k = Math.max(0, Math.min(1, ((p.x - st.from.x) * dx + (p.z - st.from.z) * dz) / l2)); return Math.hypot(p.x - st.from.x - dx * k, p.z - st.from.z - dz * k); };
      if (SegD(FERRY_HEAD) > 8) errors.push(`13-2：扫射段要穿过浮桥头（离 ${R(SegD(FERRY_HEAD))} m）`);
      const crowd = KF("13-2").units.filter(u => u.group === "crowd");
      if (crowd.filter(u => SegD(u) < 4).length < 3) errors.push("13-2：扫射段要穿过人堆");
      if (SegD(Unit("13-2", "Heizi")) > 3) errors.push("13-2：扫射段要扫到驴车 / 黑子");
      for (const p of planes.filter(q => (q.strafe || []).includes(st))) {
        const pose = SamplePrevizAircraft(p, st.t0, { groundAt: ground });
        if (!pose.visible || pose.z < st.from.z - 4 || pose.y - ground(pose.x, pose.z) > 60) errors.push(`13-2：${p.id} 扫射时要在弹着后头（南边）的低空（t ${st.t0}：z ${R(pose.z)}、高 ${R(pose.y)}）`);
      }
    }
    const cart = SignalEv("13-2", "CartOverturned", true), st0 = strafes[0];
    if (!cart || !st0 || !(cart.t >= st0.t0 && cart.t <= st0.t1 + 0.5)) errors.push("13-2：车要在那一串弹着扫过去时翻（CartOverturned）");
    if (!Keys(s, "GengCart").some(k => k.visible === false)) errors.push("13-2：车翻了以后立着的车要藏掉");
    if (!Keys(s, "Heizi").some(k => k.state === "down")) errors.push("13-2：黑子要被扫倒");
    const bl = s.actors.find(a => a.id === "BlanketDonggua");
    if (!bl?.spawn || !bl.keys.some(k => k.visible === true) || !Keys(s, "Donggua").some(k => k.ride === null && k.x !== undefined)) errors.push("13-2：翻车那一刻冬瓜要下车摔到单被上（BlanketDonggua spawn 出现 + Donggua ride null）");
    const walkers = s.actors.filter(a => a.spawn && /^BridgeWalk/.test(a.id));
    if (walkers.length < 2 || !walkers.every(a => a.keys.some(k => k.state === "down") && a.keys.some(k => k.visible === false))) errors.push("13-2：桥上的人要倒下、掉进河里（藏掉）");
    if (!Cap(s, /掉进河里/)) errors.push("13-2：掉进河里要有说明字");
    Need(s, ["PlanesWarning.01"]);
    if (!Cap(s, /Z 卧倒/)) errors.push("13-2：卧倒的按键时刻要有说明字"); }
  // 13-3：飞机往西兜（两架、不开枪）；妮儿呜咽；朝飞机开枪说明字
  { const s = Seq("13-3"); Need(s, ["NierScream.01"]);
    if (!Cap(s, /往西兜/)) errors.push("13-3：飞机往西兜要有说明字");
    if (!Cap(s, /朝飞机开枪/)) errors.push("13-3：可以朝飞机开枪要有说明字"); }
  // 飞机：13-2 / 13-3 / 14-1 / 14-2 / 14-3 各两架九七式轻爆；只有 13-2、14-2 扫射；13-2…14-2 各有一条镜头锚在飞机上；不手放飞机音效
  for (const id of ["13-2", "13-3", "14-1", "14-2", "14-3"]) {
    const s = Seq(id), planes = s.aircraft || [];
    if (planes.length !== 2 || planes.some(p => p.model !== "MitsubishiKi30")) errors.push(`${id}：要有两架九七式轻爆（aircraft[]），现在 ${planes.length}`);
    for (const p of planes) { if ((p.path || []).length < 3) errors.push(`${id}：${p.id} 的航点太少`); if (p.sound?.drone === false) errors.push(`${id}：${p.id} 的引擎声要跟着飞机走`); }
    const strafes = planes.flatMap(p => p.strafe || []);
    if (id === "13-2" || id === "14-2") { if (!strafes.length) errors.push(`${id}：要有扫射段（strafe）`); }
    else if (strafes.length) errors.push(`${id}：这一拍飞机不开枪`);
    if (id !== "14-3" && !s.camera.some(c => c.look?.aircraft || c.lookTo?.aircraft)) errors.push(`${id}：要有一条镜头看着飞机`);
    if (s.events.some(e => e.type === "sfx" && /^(planeDrone|planeDive|strafe)/.test(e.name))) errors.push(`${id}：飞机有轨了，别再手放 planeDrone / planeDive / strafe 音效`);
  }
  // 14-1：老耿那句 + 任务字；妮儿揪住另一角（carryRole front + PvBlanketDragR）；被子往低洼拖
  { const s = Seq("14-1"); Need(s, ["BringHim.01"]);
    if (!Cap(s, /任务字/)) errors.push("14-1：要有任务字说明字");
    if (!Cap(s, /揪单被一个角/)) errors.push("14-1：玩家揪被角要有说明字");
    const grab = Keys(s, "Nier").find(k => k.carryRole === "front");
    if (!grab || !Keys(s, "Nier").some(k => k.clip === "PvBlanketDragR" || k.clip === "PvBlanketDragL")) errors.push("14-1：妮儿要揪住另一个角（carryRole front + PvBlanketDrag）");
    const first = PosKeys(s, "BlanketDonggua")[0], last = PosKeys(s, "BlanketDonggua").at(-1);
    if (!first || !last || Dist(last, TROUGH) >= Dist(Unit("14-1", "BlanketDonggua"), TROUGH) - 3) errors.push("14-1：被子要往河堤底下拖（离低洼近了 ≥ 3 m）");
    if (Keys(s, "BlanketDonggua").some(k => k.dragSolo === true)) errors.push("14-1：两人都攥着，被子不该 dragSolo"); }
  // 14-2：慢动作窗口；窗口里没台词；被角脱手说明字 + 被子 dragSolo；之后只剩妮儿攥着；弹着点从冬瓜身上扫过；妮儿脸朝顺子；刘文财看见
  { const s = Seq("14-2"), slow = s.slowmo || [];
    if (s.lines.length) errors.push("14-2：这一段没有台词");
    if (slow.length !== 1) errors.push(`14-2：要有一个慢动作窗口（slowmo），现在 ${slow.length}`);
    else {
      const w = slow[0], drop = s.events.find(e => e.type === "caption" && /被角从手里脱出去/.test(e.text));
      if (!(w.rate <= 0.5 && w.dur >= 1.0 && w.dur <= 3.0)) errors.push(`14-2：慢动作要放慢到五成以下、1–3 s（现在 ×${w.rate}、${w.dur} s）`);
      if (!drop) errors.push("14-2：被角脱手要有说明字");
      else if (!(drop.t >= w.t && drop.t < w.t + w.dur)) errors.push("14-2：慢动作要盖住松手那一下");
      const solo = Keys(s, "BlanketDonggua").find(k => k.dragSolo === true);
      if (!solo) errors.push("14-2：松手后被子要写 dragSolo: true（玩家那角不攥）");
      else {
        if (!(solo.t >= w.t && solo.t < w.t + w.dur)) errors.push("14-2：dragSolo 要在慢动作窗口里（松手那一刻）");
        if (drop && solo.t < drop.t - 0.1) errors.push("14-2：dragSolo 不该早于松手的说明字");
        for (const t of [solo.t + 0.5, solo.t + 3, s.durationS - 0.5]) {
          const holders = s.actors.filter(a => StateAt("14-2", a.id, t)?.carryRole === "front").map(a => a.id);
          if (holders.join() !== "Nier") errors.push(`14-2：${t} s 攥着被角的应当只有妮儿（现在：${holders.join("、") || "没人"}）`);
          if (StateAt("14-2", "BlanketDonggua", t)?.dragSolo !== true) errors.push(`14-2：${t} s 被子要还是 dragSolo`);
        }
        const before = s.actors.filter(a => StateAt("14-2", a.id, Math.max(0, solo.t - 0.5))?.carryRole === "front").map(a => a.id);
        if (!before.includes("Nier")) errors.push("14-2：松手前妮儿就在攥着");
        if (StateAt("14-2", "BlanketDonggua", Math.max(0, solo.t - 0.5))?.dragSolo === true) errors.push("14-2：松手前被子不该 dragSolo");
      }
      const strafes = (s.aircraft || []).flatMap(p => p.strafe || []), bl = Unit("14-2", "BlanketDonggua");
      const SegD = (st, p) => { const dx = st.to.x - st.from.x, dz = st.to.z - st.from.z, l2 = dx * dx + dz * dz; const k = Math.max(0, Math.min(1, ((p.x - st.from.x) * dx + (p.z - st.from.z) * dz) / l2)); return Math.hypot(p.x - st.from.x - dx * k, p.z - st.from.z - dz * k); };
      if (!strafes.some(st => SegD(st, bl) < 1.5 && st.t0 >= w.t - 0.5 && st.t0 < w.t + w.dur)) errors.push("14-2：弹着点要在慢动作里从冬瓜身上扫过（strafe 离被子 < 1.5 m）");
      const lowCam = c => (c.eye?.stance === "prone") || (c.to && c.to.h !== undefined && c.to.h <= 0.6) || (c.from && c.from.h !== undefined && c.from.h <= 0.6 && !c.to);
      if (!s.camera.some(c => lowCam(c) && drop && c.t >= drop.t - 0.1 && c.t <= drop.t + 1.5)) errors.push("14-2：松手后眼睛要砸到趴（prone 眼睛或 ≤ 0.6 m 的机位）");
      if (!Keys(s, "Nier").some(k => k.faceTo === "player" && drop && k.t > drop.t)) errors.push("14-2：妮儿要脸朝顺子");
      if (!Keys(s, "LiuWencai").some(k => k.faceTo === "player")) errors.push("14-2：刘文财要脸冲这边");
      if (!Cap(s, /洇开一片血/)) errors.push("14-2：被子上洇血要有说明字");
      if (!Cap(s, /自己手边空了/)) errors.push("14-2：抬眼手边空了要有说明字");
      if (!Keys(s, "Donggua").some(k => k.clip === "CareLieWrithe")) errors.push("14-2：冬瓜挨枪要一抽（CareLieWrithe）");
    } }
  // 14-3：老耿接另一角（骨骼身体 PvBlanketDrag）、被子 dragSolo 回 false；刘文财捞妮儿（妮儿松开）；拖进低洼；飞机往东；手榴弹炸豁子 BreachBlasted
  { const s = Seq("14-3");
    if (!Keys(s, "Geng").some(k => k.carryRole === "front") || !Keys(s, "Geng").some(k => /^PvBlanketDrag/.test(k.clip || ""))) errors.push("14-3：老耿要揪住另一角");
    const solo = Keys(s, "BlanketDonggua").find(k => k.dragSolo === false), gengGrab = Keys(s, "Geng").find(k => k.carryRole === "front");
    if (!solo || !gengGrab || Math.abs(solo.t - gengGrab.t) > 1.0) errors.push("14-3：老耿攥住那一刻被子要写回 dragSolo: false（顺子那角又攥着了）");
    const nierOff = Keys(s, "Nier").find(k => k.carryRole === null);
    if (!nierOff || !Keys(s, "LiuWencai").some(k => k.x !== undefined && k.move === "run")) errors.push("14-3：刘文财要冲出去把妮儿捞回来（妮儿松开被角）");
    const last = PosKeys(s, "BlanketDonggua").at(-1);
    if (!last || Dist(last, Unit("14-3", "BlanketDonggua")) > 1.0) errors.push("14-3：被子要拖到低洼里（关键帧位置）");
    if (!Cap(s, /往东飞走/)) errors.push("14-3：飞机往东飞走要有说明字");
    if (!Keys(s, "Luo").some(k => k.throw)) errors.push("14-3：班长要甩手榴弹（throw）");
    const blast = SignalEv("14-3", "BreachBlasted", true);
    if (!blast || !Has(s, "explosion", e => Dist(e, MG) < 2 && Math.abs(e.t - blast.t) < 0.5)) errors.push("14-3：豁子要炸（explosion + BreachBlasted）");
    if (!Keys(s, "BreachLoader").some(k => k.state === "down")) errors.push("14-3：机枪要哑（副射手倒）");
    if (!Cap(s, /机枪哑了/)) errors.push("14-3：机枪哑了要有说明字"); }
  // 15-1：老耿跪着按毛巾；冬瓜攥袖子 clipRelease；四句按序；刘文财接过被角
  { const s = Seq("15-1"); NeedClip("15-1", "Geng", "CareMedicPress", "跪着把毛巾按回伤口"); NeedClip("15-1", "Donggua", "PvLieGrabSleeve", "伸手攥袖子");
    const order = ["GullyBottom.01", "GullyBottom.02", "GullyBottom.03", "GullyBottom.04"].map(id => Line(s, id)?.t);
    if (order.some(t => t === undefined) || order.some((t, i) => i && t <= order[i - 1])) errors.push("15-1：GullyBottom 四句要按序");
    const grab = Keys(s, "Donggua").find(k => k.clip === "PvLieGrabSleeve"), end = Line(s, "GullyBottom.03") ? Line(s, "GullyBottom.03").t + voiceLines.get("GullyBottom.03").durationS : undefined;
    if (grab && (!(grab.clipRelease > 0.8) || grab.clipHold !== true || end === undefined || Math.abs(grab.t + grab.clipRelease - end) > 0.6)) errors.push("15-1：攥袖子要在「抵了」说完那一刻放开（clipRelease）、停末帧（clipHold）");
    if (!Keys(s, "LiuWencai").some(k => k.carryRole === "front")) errors.push("15-1：刘文财要接过被角");
    if (!Cap(s, /红天/)) errors.push("15-1：头顶一条红天要有说明字"); }
  // 15-2：没有对白；从低洼拖到接收院门口那段；刘文财攥着；天一点点黑；回头看一眼刘文财
  { const s = Seq("15-2");
    if (s.lines.length) errors.push("15-2：这一段没有台词");
    const first = PosKeys(s, "BlanketDonggua")[0], last = PosKeys(s, "BlanketDonggua").at(-1);
    if (!first || Dist(first, TROUGH) > 1.5) errors.push("15-2：被子要从低洼出发");
    if (!last || Dist(last, Unit("15-2", "BlanketDonggua")) > 1.0) errors.push("15-2：被子要拖到关键帧位置（接收院门口那边）");
    if (!Keys(s, "LiuWencai").some(k => k.carryRole === "front")) errors.push("15-2：刘文财要攥着一角");
    if (!Cap(s, /一点点黑/)) errors.push("15-2：天一点点黑要有说明字");
    if (!s.camera.some(c => c.look?.actor === "LiuWencai" || c.lookTo?.actor === "LiuWencai")) errors.push("15-2：途中要回头看一眼刘文财"); }
  // 15-3：画驴（骨骼身体 PvKneelDig）；刘文财蹲；老耿看驴再把脸转开；六句
  { const s = Seq("15-3"); Need(s, ["GateQueue.01", "GateQueue.02", "GateQueue.03", "GateQueue.04", "GateQueue.05", "GateQueue.06"]);
    NeedClip("15-3", "Nier", "PvKneelDig", "蹲着画驴"); NeedClip("15-3", "LiuWencai", "PvCrouchCountFingers", "算驴腿的账"); NeedClip("15-3", "GateGuard", "PvStandHaltL", "把人往外推");
    if (!Cap(s, /弹壳/)) errors.push("15-3：画驴摆弹壳要有说明字");
    if (Keys(s, "Geng").filter(k => k.faceTo !== undefined).length < 2) errors.push("15-3：老耿要先看着地上的驴、再把脸转开");
    if (Keys(s, "Geng").some(k => k.clip)) errors.push("15-3：老耿是程序化身体，不靠墙坐（删「冻得发抖」）"); }
  // 16-1：过门槛一低一抬 + 震屏；放被子的说明字；刘文财抬后头
  { const s = Seq("16-1"); Need(s, ["Threshold.01", "Threshold.02", "Threshold.03"]);
    const dip = s.camera.filter(c => c.from && c.to && c.from.h !== undefined && c.to.h !== undefined && Math.abs(c.to.h - c.from.h) > 0.2 && c.shake);
    if (dip.length < 2) errors.push("16-1：过门槛要有一低一抬两段带震屏的镜头");
    if (!Cap(s, /按住键/)) errors.push("16-1：放被子的按键时刻要有说明字");
    if (!Keys(s, "LiuWencai").some(k => k.carryRole === "rear")) errors.push("16-1：刘文财要在被尾");
    NeedClip("16-1", "Doctor", "PvStandPointL", "指厢房"); }
  // 17：军医蹲、「没了」再吼门口、走回院里；老耿用单被盖脸（PvKneelPullBlanket）；17-2 按 F、没台词；17-3 班长蹲下掀被角、幺娃挪眼睛
  { const s = Seq("17-1");
    if (!Keys(s, "Doctor").some(k => k.stance === "crouch")) errors.push("17-1：军医要蹲在被子边");
    const gone = Line(s, "Gone.01"), shout = Line(s, "Gone.02");
    if (!gone || !shout || shout.t < gone.t) errors.push("17-1：先「没了」再冲门口吼");
    if (!Keys(s, "Doctor").some(k => k.x !== undefined && k.t > (shout?.t ?? 0) && k.z < Y.xiang.box.minZ - 2)) errors.push("17-1：军医吼完要走回院里");
    NeedClip("17-1", "Geng", "PvKneelPullBlanket", "用单被盖脸");
    if (!Cap(s, /单被盖住了他的脸/)) errors.push("17-1：老耿用冬瓜自己那床单被盖脸要有说明字");
    if (Keys(s, "Nier").filter(k => k.faceTo !== undefined).length < 2) errors.push("17-1：妮儿要看看这个大人、又看看那个");
    const s2 = Seq("17-2");
    if (s2.lines.length) errors.push("17-2：这一段没有台词");
    if (!Cap(s2, /按 F/)) errors.push("17-2：数铜板的按键时刻要有说明字");
    if (s2.durationS < 20 || s2.durationS > 30) errors.push(`17-2：要 20–30 s（现在 ${s2.durationS}）`);
    if (!s2.actors.some(a => a.spawn?.kind === "litter")) errors.push("17-2：院子里要有人抬进抬出");
    const s3 = Seq("17-3");
    if (!Keys(s3, "Luo").some(k => k.stance === "crouch")) errors.push("17-3：班长要在被子边蹲下");
    if (!Cap(s3, /掀开被角/)) errors.push("17-3：掀被角要有说明字");
    const order = ["GetUp.01", "GetUp.02", "GetUp.03", "GetUp.04", "GetUp.05"].map(id => Line(s3, id)?.t);
    if (order.some(t => t === undefined) || order.some((t, i) => i && t <= order[i - 1])) errors.push("17-3：GetUp 五句要按序");
    if (!Keys(s3, "Yaowa").some(k => k.faceTo !== undefined && k.t > (order[2] ?? 0))) errors.push("17-3：幺娃看见铜板要把眼睛挪开");
    if (!Keys(s3, "Luo").some(k => k.x !== undefined && k.move !== "cut" && k.t > 0)) errors.push("17-3：班长要从院门走进来"); }
  // 18-1：铁路桥在东边远处炸（远、高、黑烟）；桥头的兵扭头看；全班进散兵坑
  { const s = Seq("18-1");
    const blast = s.events.find(e => e.type === "explosion" && e.x > 100);
    if (!blast || !(blast.h >= 4 && blast.h <= 6) || !(blast.radius >= 6)) errors.push("18-1：远处铁路桥要炸（东边，h 4–6、radius 大一点）");
    if (!Has(s, "smoke", e => e.kind === "SmokeBlack" && e.x > 100)) errors.push("18-1：铁路桥那里要有黑烟");
    if (!Has(s, "sfx", e => e.name === "shellBlast" || e.name === "artilleryFar")) errors.push("18-1：铁路桥炸要有声音");
    for (const id of ["BridgeOfficer", "Luo", "FerrySoldier"]) if (!Keys(s, id).some(k => k.faceTo && k.faceTo.x !== undefined && k.faceTo.x > 100)) errors.push(`18-1：${id} 要扭头看铁路桥`);
    const slots = KF("18-2").units;
    for (const id of ["Luo", "Yaowa", "HeYoutian", "LiuWencai", "FerrySoldier"]) { const to = slots.find(u => u.id === id); if (!Keys(s, id).some(k => k.x !== undefined && Math.hypot(k.x - to.x, k.z - to.z) < 0.6)) errors.push(`18-1：${id} 要走进散兵坑`); }
    Need(s, ["BridgeOrders.01", "BridgeOrders.02", "BridgeOrders.07"]); }
  // 18-2：掷弹筒越落越近；机枪先哑、幺娃才挥手、最后一拨才跑；「打掉那挺机枪」说明字；老耿牵着妮儿在桥上往南；接收院担架抬出来
  { const s = Seq("18-2"), p = KF("18-2").player;
    const impacts = s.events.filter(e => e.type === "sfx" && e.name === "mortarImpact").sort((a, b) => a.t - b.t);
    if (impacts.length < 3) errors.push("18-2：掷弹筒至少落三发");
    for (let i = 1; i < impacts.length; i++) if (Dist(impacts[i], p) >= Dist(impacts[i - 1], p)) errors.push("18-2：掷弹筒落点要越来越近");
    if (!s.events.some(e => e.type === "sfx" && e.name === "mortarPop")) errors.push("18-2：掷弹筒要有「嘭」");
    const mgDown = Keys(s, "IjaMg").find(k => k.state === "down");
    const wave = Line(s, "LastOnes.01"), lastRun = Keys(s, "LastGroup1").find(k => k.x !== undefined && k.move === "run");
    const lastLine = Line(s, "LastOnes.02");
    if (!mgDown) errors.push("18-2：机枪组要被打掉");
    if (!wave || !mgDown || wave.t < mgDown.t) errors.push("18-2：机枪哑了幺娃才站起来挥手");
    if (!lastRun || !wave || lastRun.t < wave.t) errors.push("18-2：幺娃挥了手最后一拨才跑");
    if (!lastLine || !lastRun || lastLine.t > lastRun.t) errors.push("18-2：「后头没得人了」要在领头的跑过散兵坑边时喊（跑到之前）");
    if (!Cap(s, /打掉那挺机枪/)) errors.push("18-2：打机枪的玩家操作时刻要有说明字");
    if (!Has(s, "muzzle", e => e.actor === "IjaMg")) errors.push("18-2：鬼子机枪要有枪口火");
    Need(s, ["HoldTheBridge.01", "HoldTheBridge.02", "HoldTheBridge.03", "HoldTheBridge.04", "HoldTheBridge.05"]);
    if (!Keys(s, "Geng").some(k => k.x !== undefined && k.z > 700)) errors.push("18-2：老耿要牵着妮儿在桥面上往南走");
    const ready = Line(s, "HoldTheBridge.01"), now = Line(s, "HoldTheBridge.02");
    if (ready && now && now.t < ready.t) errors.push("18-2：先「准备点火」再「炸！不等了」");
    NeedClip("18-2", "Yaowa", "PvStandBeckonL", "挥手快过来"); NeedClip("18-2", "Straggler1", "VilNraCarryOnBack", "背着伤员");
    for (const id of ["YardLitter1", "YardLitter2", "YardLitter3"]) { const last = PosKeys(s, id).at(-1); if (!last || last.z < BR.southFootZ) errors.push(`18-2：${id} 要抬过桥到南岸`); }
    const l3 = PosKeys(s, "YardLitter3"), doc3 = PosKeys(s, "Doctor");
    const inYard = k => k.x < Y.box.maxX - 1 && k.z > Y.box.minZ && k.z < Y.box.maxZ;
    if (!l3[0] || l3[0].t !== 0 || !inYard(l3[0]) || !doc3[0] || doc3[0].t !== 0 || !inYard(doc3[0])) errors.push("18-2：最后一副担架和军医开场要在院门里侧");
    const outGate = k => k.path?.some(q => Math.abs(q.z - Y.gate.z) < 1.5 && Math.abs(q.x - Y.box.maxX) < 2.5);
    if (!l3.some(outGate) || !doc3.some(outGate)) errors.push("18-2：担架与军医要从院门走出去（路线过院门）");
    if (!(doc3.find(k => k.t > 0)?.t > l3.find(k => k.t > 0)?.t)) errors.push("18-2：军医要跟在最后一副担架后头出门");
    if (!(doc3.at(-1)?.z >= BR.southFootZ)) errors.push("18-2：军医要跟着过桥到南岸");
    let seen = 0;
    for (let t = 9; t <= 15; t += 0.25) { const shot = ShotAt("18-2", t); if (shot && Math.abs(WrapDeg(YawTo(shot.position, PL.yardGate) - shot.yawDeg)) < 12) seen += 0.25; }
    if (seen < 2.0) errors.push(`18-2：镜头要在院门方向看两三秒担架抬出来（现在 ${R(seen)} s）`);
    if (!Cap(s, /抬出来/) || !Cap(s, /军医/)) errors.push("18-2：院里担架抬出来、军医跟着出门要有说明字");
    if (!Cap(s, /土坎/)) errors.push("18-2：最后一拨被压在土坎后要有说明字"); }
  // 18-3：全班 run 过桥；眼睛过桥时高度跟着桥面；班长倒退着撤、最后上南岸；「点！」；炸桥：爆炸 + 水柱 + 震屏 + BridgeBlown
  { const s = Seq("18-3");
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
      if (y < HT.deckTopY + 1.3 || y > HT.deckTopY + 1.8) errors.push(`18-3：${t} s 眼睛高 ${R(y)} 没跟着桥面`);
    }
    if (onDeck.length < 20) errors.push(`18-3：眼睛在桥面上的采样只有 ${onDeck.length} 个（要沿桥中线跑过去）`);
    for (const id of ["Yaowa", "HeYoutian", "LiuWencai", "Squad1", "FerryGuard1"]) if (!Keys(s, id).some(k => k.x !== undefined && k.move === "run" && k.z > 700)) errors.push(`18-3：${id} 要跑过桥到南岸`);
    const luoRuns = Keys(s, "Luo").filter(k => k.x !== undefined && k.move === "run");
    if (luoRuns.length < 4 || !luoRuns.every(k => k.yawDeg === 0 && k.aim)) errors.push("18-3：班长要倒退着一截一截边打边撤（到点朝北举枪）");
    const point = Line(s, "CrossNow.02"), luoSouth = luoRuns.find(k => k.z >= BR.southFootZ);
    if (!point || !luoSouth || point.t < luoSouth.t) errors.push("18-3：班长踏上南岸军官才喊「点！」");
    if (!Cap(s, /引线/)) errors.push("18-3：引线烧过桥板要有说明字");
    const blown = SignalEv("18-3", "BridgeBlown", true);
    if (!blown) errors.push("18-3：炸桥要打开 BridgeBlown");
    else if (blown.t < s.durationS - 12) errors.push(`18-3：BridgeBlown 要在段落末尾打开（现在 ${blown.t} s，段长 ${s.durationS}）`);
    const blasts = s.events.filter(e => e.type === "explosion" && e.z < BR.northFootZ + 16 && e.z > BR.northFootZ - 2 && Math.abs(e.x - BR.x) < 2);
    if (blasts.length < 3) errors.push("18-3：北头几条船那里要有几团爆炸");
    if (!Has(s, "smoke", e => (e.kind === "SmokeWhite" || e.kind === "SmokeDust") && Math.abs(e.z - 652) < 8)) errors.push("18-3：炸桥要有水柱（SmokeWhite / SmokeDust 顶）");
    if (!Has(s, "shake", e => e.strength >= 0.6)) errors.push("18-3：炸桥要震屏");
    if (blown && point && blown.t < point.t) errors.push("18-3：「点！」之后才炸");
    NeedClip("18-3", "Luo", "PvStandWaveOnL", "撤！过桥！"); }
  for (const s of doc.sequences) if (s.events.some(e => e.type === "signal" && e.name === "ChargesSet")) errors.push(`${s.keyframe}：ChargesSet 18-1 起本来就开，预演里别动它`);
  // 18-4：北岸堤上鬼子枪口火、断桥着火往下游漂、马灯那一眼、班长「走！」
  { const s = Seq("18-4");
    if (s.events.filter(e => e.type === "muzzle" && /^LeveeIja/.test(e.actor)).length < 6) errors.push("18-4：北岸堤上要有鬼子枪口火（若干）");
    if (!Has(s, "smoke", e => e.kind === "SmokeBlack" && e.z > 640 && e.x < BR.x - 5)) errors.push("18-4：断桥要在下游（西）着火（SmokeBlack 在 debris）");
    if (!Cap(s, /马灯/)) errors.push("18-4：马灯还亮着要有说明字");
    let seen = 0;
    for (let t = 0; t <= s.durationS; t += 0.25) { const shot = ShotAt("18-4", t); if (shot && Math.abs(WrapDeg(YawTo(shot.position, Y.gateLamp) - shot.yawDeg)) < 4) seen += 0.25; }
    if (seen < 1.0) errors.push(`18-4：镜头要在院门灯桩方向停一两秒（现在 ${R(seen)} s）`);
    Need(s, ["KeepMoving.01"]); }
  // 18-5：先黑场 + 日期字幕，淡入往北门走，最后进门洞、黑场收尾
  { const s = Seq("18-5");
    const black = s.events.filter(e => e.type === "black").sort((a, b) => a.t - b.t);
    if (!black.length || black[0].t > 0.01 || black[0].dur < 3) errors.push("18-5：开头要先黑几秒");
    if (!Has(s, "caption", e => /1938年3月1[45]日 夜｜滕县北门/.test(e.text) && e.t < 3)) errors.push("18-5：黑场上要有日期字幕「1938年3月14日 夜｜滕县北门」");
    if (black.length < 2 || black[black.length - 1].t < s.durationS - 10) errors.push("18-5：末尾要黑场收尾");
    Need(s, ["NorthGate.01", "NorthGate.02", "NorthGate.03"]);
    const endShot = ShotAt("18-5", s.durationS - 0.5);
    if (!endShot || endShot.position.z < 862) errors.push("18-5：最后眼睛要进门洞看城里往南的街");
    NeedClip("18-5", "Guide", "PvStandBeckonL", "跟我来"); }
  // 大段的镜头轨：每一刻都能采样
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
