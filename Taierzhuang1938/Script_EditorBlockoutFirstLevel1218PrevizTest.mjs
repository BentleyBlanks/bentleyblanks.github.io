// ===========================================================================
// Script_EditorBlockoutFirstLevel1218PrevizTest.mjs —— FirstLevel1218（11–18，2026-11-02 第四版：北沙河村与铁路桥）预演数据的纯 node 自检
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218PrevizTest.mjs           → 查 Blockout/FirstLevel1218.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel1218PrevizTest.mjs --fresh   → 查生成器当场生成的那份（并核对两次生成逐字相同）
//
// 查（照 0610 的 PrevizTest，加了这片场地专有的几条）：运行时包的 ValidateBlockoutPreviz（关键帧 / 单位 / 台词 id / 字段）；
// 每个片段在那具骨架上烘过（有 castId 的按 Data_FirstLevelSpeakingCast 的骨架，没有 castId 的士兵只许五具骨架都有的通用片段；
// 程序化身体的百姓一个片段都不许——只有关键帧里写了 body:"rig" 的那几帧例外）；同一段里台词不互相压；演员走位点在场地范围内、身子不进实心块
// （按那一刻的信号算随信号体块，路线按 0.5 m 取样）；没人走进沙河中间那股水（按 RiverFrame 的河道坐标判：离中线 offsetD ± halfW；蹚水的老乡 Wader* 例外；
// 铁路桥桥面是 standOn 走道，站得上去）；走位要求的速度不离谱；说话的人那一刻看得见（没藏起来，而且在镜头里）；机位与眼睛不在实心块里、不在水里；
// 说话姿态（§14.4，空手的百姓不管）；
// 剧本要求的（契约 2026-11-02 第三节）：33 帧一帧一段；11–12 落炮 / 爬上车板那句 / 「看」那一下 / 沟口七句 / 黑子不走妮儿牵过板桥 / 钢盔冒头 / 南街口望官道桥 /
// 军医、女娃探头、水壶；13 步兵 + 两挺机枪压沟沿 + 掷弹筒、有人往沟口跑、官道桥「轰」（GuandaoBridgeBlown 先关后开）、信号弹 t 0.5–1.2 s；
// 14 六架两拨（第一趟顺战壕、第二趟顺街、沟口炸弹）、14-2 不等人喊先跑 + 弹坑（DugoutBombed 先关后开）、14-3 车翻（CartOverturned 先关后开）、
// 揪被角（妮儿 carryRole front + PvBlanketDragR）、松手 slowmo（窗口里没台词）+ dragSolo、老耿接角拖进洞；15–17 台词按序、片段、F 与信；
// 18 命令六句 → 冬瓜那句回声 → 要得、席子、桥面上的人脚下是枕木顶、老乡在河床蹚水、担架往南走进黑地、回头看南边、机枪先哑顺子才喊、班长最后一个（点头不说话）、
// 「点！」后 BridgeBlown、断孔上没人、对岸鬼子都在北岸、黑场 + 日期字幕「1938年3月14日 夜」、眼睛看过县城的灯、then stay；全篇不用删掉的台词与旧地名；镜头轨每一秒都能采样。
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HeightGridSampler, LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { CharacterClipModelId } from "./Script_CharacterSelection.mjs";
import { BlockStandSampler, PrevizSignalsAt, NormalizeBlockoutPreviz, SamplePrevizCamera, SamplePrevizActor, SamplePrevizAircraft, PrevizStrafeImpacts, PREVIZ_DEFAULTS } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { BLOCKOUT_PREVIZ_CLIP_LIBRARIES } from "./Data_BlockoutPrevizClips.mjs";
import {
  L1218_RIVER as RV, L1218_RAIL_BRIDGE as RB, L1218_RAIL as RL, L1218_HEIGHTS as HT, L1218_AID as A, L1218_PLACES as PL, L1218_SIGNALS as SIG,
  L1218_TRENCH as TR, L1218_BANK as BK, L1218_ROADS as RD, RiverFrame,
} from "./Data_EditorBlockoutFirstLevel1218Space.mjs";
import { ReadBlockoutSceneDocSync } from "./Script_SceneNode.mjs";

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
/** 在水里：沙河中间那股水（河道坐标：离中线 offsetD ± halfW，顺着弯；河床上的沙地不算；铁路桥桥面是 standOn 走道，站在上头不算）。 */
function InRiver(p, stand) {
  const f = RiverFrame(p.x, p.z);
  if (!f || Math.abs(f.d - RV.stream.offsetD) >= RV.stream.halfW) return false;
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
  const scene = ReadBlockoutSceneDocSync("FirstLevel1218");
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

/** 剧本要求的设计口径（只查 FirstLevel1218 第四版，契约 2026-11-02 第三节「故事」）。 */
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
  /** 眼睛在 from…to 之间有没有朝某个方向（yaw ± tol）看过。 */
  const LookedYaw = (id, yaw, from, to, tol = 30) => { for (let t = from; t <= to; t += 0.25) { const shot = ShotAt(id, t); if (shot && Math.abs(WrapDeg(shot.yawDeg - yaw)) <= tol) return true; } return false; };
  const StateAt = (id, who, t) => { const s = Seq(id), a = s.actors.find(x => x.id === who); const base = a?.spawn || Unit(id, who); return a ? SamplePrevizActor(a, t, base) : null; };
  const SegD = (st, p) => { const dx = st.to.x - st.from.x, dz = st.to.z - st.from.z, l2 = dx * dx + dz * dz; const k = Math.max(0, Math.min(1, ((p.x - st.from.x) * dx + (p.z - st.from.z) * dz) / l2)); return Math.hypot(p.x - st.from.x - dx * k, p.z - st.from.z - dz * k); };
  const Strafes = s => (s.aircraft || []).flatMap(p => p.strafe || []);
  const HOLE = A.holes[0].mouth;
  const OnDeck = p => Math.abs(p.x - RL.x) < RB.walkW / 2 && p.z > RB.northZ + 1 && p.z < RB.southZ - 1;
  const SPAN = (RB.southZ - RB.northZ) / RB.spans;
  const TrenchZ = x => { const L = x < 100 ? TR.west : TR.east; for (let i = 1; i < L.length; i++) { const a = L[i - 1], b = L[i]; if (x >= a.x && x <= b.x) return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x); } return L[L.length - 1].z; };
  const NearTrench = (p, tol = 5) => Math.abs(p.z - TrenchZ(p.x)) <= tol && p.x > 36 && p.x < 216;
  const allText = JSON.stringify(doc);

  // 33 帧一帧一段；播完 then next、最后一段 stay；全篇没有旧戏的词、不用删掉的台词
  for (const id of IDS) if (!Seq(id)) errors.push(`缺 ${id} 这一段`);
  for (const s of doc.sequences) if (s.keyframe !== "18-8" && s.then !== "next") errors.push(`${s.keyframe}：播完要 then: next`);
  if (Seq("18-8")?.then !== "stay") errors.push("18-8：最后一段 then 要是 stay");
  for (const bad of ["棉袄", "单褂子", "冻得发抖", "短褂", "临城", "犟种", "浮桥", "渡口", "石板桥", "河汊子", "接收院", "豁子", "填沟",
    "老汉", "钻洞", "北门", "火把", "门洞", "舀水", "九四式", "tankette", "Tankette", "后头没得人了", "排到", "医官", "你嗯往哪儿走", "有地方歇脚", "送到了就回来", "村西口", "田间小路"]) if (allText.includes(bad)) errors.push(`预演里还有旧戏的词「${bad}」`);
  for (const id of ["SquadOrders", "FollowCart", "FerryCall", "AcrossTheCreek", "NierScream", "GullyBottom", "GateQueue", "Gone.", "GetUp", "BridgeOrders", "HoldTheBridge", "LastOnes", "CrossNow",
    "DitchSentry", "BackSoon", "OldMan", "AidArrive", "GoSeeDonggua", "InTheHole", "XiangDoorQueue", "Threshold", "NoMore", "WhatHappened", "Orders727", "HoldOn.", "KeepMoving", "NorthGate", "ComeOver.02"]) if (allText.includes(`"${id}`)) errors.push(`预演里还在用删掉的台词 ${id}`);
  // 程序化身体的百姓一个片段都不许（关键帧 body rig 的那几帧除外）
  for (const s of doc.sequences) for (const a of s.actors) { const u = a.spawn || Unit(s.keyframe, a.id); if (IsCiv(u) && u.body !== "rig" && a.keys.some(k => typeof k.clip === "string")) errors.push(`${s.keyframe}：${a.id} 是程序化身体，不许放片段`); }

  // 11-1：身后一发炮落在胡同里 + 震屏；庄子里落炮冒黑烟；车停村南口；妮儿坐上车尾；往南看
  { const s = Seq("11-1");
    if (!Has(s, "explosion", e => Dist(e, PL.laneShell) < 2) || !Has(s, "shake")) errors.push("11-1：身后那发炮要落在胡同里（explosion + 震屏）");
    if (s.events.filter(e => e.type === "smoke" && e.kind === "SmokeBlack" && e.z < 545).length < 3) errors.push("11-1：庄子里要一排排落炮、冒黑烟");
    if (!Keys(s, "Nier").some(k => k.ride?.on === "GengCart")) errors.push("11-1：妮儿要坐上车尾沿（ride）");
    if (!Cap(s, /车停在村南口/) || !Cap(s, /往南看/)) errors.push("11-1：车停村南口、往南看要有说明字"); }
  // 11-2：顺子爬上车板那句（HoldOnDonggua）在班长那句之前；班长挥手；车动、全班跟车往南跑
  { const s = Seq("11-2"); InOrder(s, ["HoldOnDonggua.01", "RetreatOrder.01"]); NeedClip("11-2", "Luo", "PvStandWaveOnL", "往北沙河撤");
    if (Line(s, "HoldOnDonggua.01")?.actor) errors.push("11-2：「冬瓜，撑到」是顺子（玩家）说的");
    if (!Cap(s, /爬上车板/) || !Cap(s, /冬瓜没应/)) errors.push("11-2：爬上车板、冬瓜没应要有说明字");
    const hold = Line(s, "HoldOnDonggua.01"), near = ShotAt("11-2", hold.t + 0.3);
    if (!near || Dist(near.position, Unit("11-2", "GengCart")) > 2.0) errors.push("11-2：说「冬瓜，撑到」时眼睛要在车板上（离车 ≤ 2 m）");
    const c0 = Unit("11-2", "GengCart"), last = PosKeys(s, "GengCart").at(-1);
    if (!last || Dist(last, c0) < 10) errors.push("11-2：车要往南走（≥ 10 m）");
    if (!Keys(s, "Luo").some(k => k.x !== undefined && k.move === "run")) errors.push("11-2：全班要跟车往南跑"); }
  // 12-1：打偏的那发落在麦地；到了没得 / 快了；钱、舅舅的信（刘文财抬眼看一下）；任务字
  { const s = Seq("12-1"); InOrder(s, ["AlmostThere.01", "AlmostThere.02", "UnclesLetter.01", "UnclesLetter.02", "UnclesLetter.03"]);
    if (!Has(s, "explosion", e => Dist(e, PL.fieldShell) < 2)) errors.push("12-1：一发炮要打偏落在路边麦地");
    const letter = Line(s, "UnclesLetter.03"), glance = Keys(s, "LiuWencai").find(k => k.faceTo === "player");
    if (!glance || !letter || glance.t < letter.t || glance.t > LineEnd(s, "UnclesLetter.03") + 1) errors.push("12-1：说到舅舅的信时刘文财要抬眼看顺子一下");
    if (!Cap(s, /土泼一车/) || !Cap(s, /按了按胸口/) || !Cap(s, /任务字：跟车进北沙河村/)) errors.push("12-1：土泼一车、按胸口、任务字要有说明字"); }
  // 12-2：「轰」老耿家冒烟、眼睛像按了「看」一样转过去；LookBack
  { const s = Seq("12-2");
    const boom = s.events.find(e => e.type === "explosion" && Dist(e, PL.gengSmoke) < 3);
    if (!boom || !Has(s, "smoke", e => e.kind === "SmokeBlack" && Dist(e, PL.gengSmoke) < 3)) errors.push("12-2：老耿家要「轰」一声冒黑烟");
    if (!Cap(s, /「看」/)) errors.push("12-2：「看」的按键要有说明字");
    if (boom && !Looked("12-2", PL.gengSmoke, boom.t, boom.t + 4, 8)) errors.push("12-2：「轰」之后眼睛要像按了「看」一样转去看老耿家");
    InOrder(s, ["LookBack.01", "LookBack.02"]); }
  // 12-3：沟口七句按序；哨兵端枪、连长指；有人应声去喊工兵；顺子抢上一步；班长看刘文财
  { const s = Seq("12-3"); InOrder(s, ["DitchGate.01", "DitchGate.02", "DitchGate.03", "DitchGate.04", "DitchGate.05", "DitchGate.06", "DitchGate.07"]);
    NeedClip("12-3", "Sentry", "PvStandHaltL", "端枪喝问"); NeedClip("12-3", "Captain", "PvStandPointL", "指人、指村西南头");
    if (Line(s, "DitchGate.06")?.actor) errors.push("12-3：「班长，我送冬瓜过去！」是顺子（玩家）说的");
    const order = Line(s, "DitchGate.04"), runner = s.actors.find(a => a.spawn && PosKeys(s, a.id).some(k => k.move === "run" && k.t > (order?.t ?? 1e9)));
    if (!runner) errors.push("12-3：「去，喊工兵把官道桥炸了」之后要有人应声跑开");
    const ask = Line(s, "DitchGate.06"), p0 = KF("12-3").player, stepShot = ask && ShotAt("12-3", ask.t + 0.3);
    if (!stepShot || Dist(stepShot.position, p0) < 0.4) errors.push("12-3：顺子抢上一步（说那句时眼睛比关键帧站位往前 ≥ 0.4 m）");
    const tell = Line(s, "DitchGate.07");
    if (!Keys(s, "Luo").some(k => k.faceTo === "LiuWencai" && tell && k.t < tell.t)) errors.push("12-3：班长答之前要看一眼刘文财");
    if (!Cap(s, /板桥/) || !Cap(s, /添树枝/) || !Cap(s, /抢上一步/)) errors.push("12-3：沟、板桥、添树枝、抢上一步要有说明字"); }
  // 12-4：妮儿先挂回车尾、再溜下去捧脸、牵黑子过板桥；老耿「驾」；钢盔冒头、二营机枪一响缩回去；没有「送到了就回来」
  { const s = Seq("12-4"), keys = Keys(s, "Nier");
    if (!(keys[0]?.t === 0 && keys[0].ride?.on === "GengCart")) errors.push("12-4：妮儿开场要挂回车尾（预演键 ride）");
    const off = keys.find(k => k.ride === null);
    if (!off || off.x === undefined || off.move !== "cut") errors.push("12-4：妮儿要溜下车（ride: null + 切到车尾外）");
    const last = PosKeys(s, "Nier").at(-1), heizi = PosKeys(s, "Heizi").at(-1);
    if (!last || last.z < PL.plankSouth.z || !heizi || heizi.z < PL.plankSouth.z) errors.push("12-4：妮儿要牵着黑子过了板桥");
    Need(s, ["BalkingMule.01"]);
    if (s.lines.length !== 1) errors.push("12-4：这一段只有老耿抽驴那一句（没有「送到了就回来」）");
    if (!Cap(s, /捧/)) errors.push("12-4：捧脸要有说明字");
    const show = Keys(s, "Helmet1").find(k => k.visible === true), hide = Keys(s, "Helmet1").filter(k => k.visible === false);
    if (!show || !hide.some(k => k.t > show.t)) errors.push("12-4：钢盔要冒出来再缩回去（visible）");
    if (!s.events.some(e => e.type === "muzzle" && e.actor === "Mg727" && show && e.t > show.t)) errors.push("12-4：钢盔冒头后二营的机枪要响"); }
  // 12-5：不说话；扛门板的兵往沟口跑；标语、枕木垛、教堂门口有人往里进
  { const s = Seq("12-5");
    if (s.lines.length) errors.push("12-5：穿村不说话");
    for (const id of ["Board1", "Board2", "Branch3"]) { const last = PosKeys(s, id).at(-1); if (!last || last.z > 660 || !PosKeys(s, id).some(k => k.move === "run")) errors.push(`12-5：${id} 要扛着东西往沟口跑（跑到 z < 660）`); }
    if (!["ElderCarrier", "ChurchIn2"].every(id => PosKeys(s, id).length)) errors.push("12-5：教堂门口要有人往里进");
    if (!Cap(s, /标语/) || !Cap(s, /枕木/) || !Cap(s, /教堂门口/)) errors.push("12-5：标语、枕木垛、教堂门口要有说明字"); }
  // 12-6：眼睛看过官道桥、桥上有人跑；RiverIsTown 按序；车往西拐
  { const s = Seq("12-6"); InOrder(s, ["RiverIsTown.01", "RiverIsTown.02"]);
    if (!Looked("12-6", PL.guandaoBridgeMid, 0, LineEnd(s, "RiverIsTown.02") + 0.5, 10)) errors.push("12-6：眼睛要顺官道往东南看过官道桥");
    if (!["BridgeRunner1", "BridgeRunner2", "BridgeRunner3", "BridgeRunner4"].every(id => PosKeys(s, id).some(k => k.move === "run"))) errors.push("12-6：桥上几个兵要抱着东西往桥上跑");
    if (!Cap(s, /官道桥/) || !Cap(s, /往西拐/)) errors.push("12-6：官道桥、车往西拐要有说明字"); }
  // 12-7：军医蹲下塞纱布勒绷带（CareMedicPress、冬瓜 CareLieWrithe）；AidDoctor → AidWater 按序；女娃探头、妮儿看女娃；水壶；任务字回沟口
  { const s = Seq("12-7"); InOrder(s, ["AidDoctor.01", "AidDoctor.02", "AidDoctor.03", "AidDoctor.04", "AidDoctor.05", "AidWater.01", "AidWater.02", "AidWater.03", "AidWater.04", "AidWater.05", "AidWater.06"]);
    NeedClip("12-7", "Doctor", "CareMedicPress", "蹲下塞纱布、勒绷带"); NeedClip("12-7", "Donggua", "CareLieWrithe", "疼得一挺");
    const g = Keys(s, "Girl"); if (!(g[0]?.visible === false && g.some(k => k.visible === true))) errors.push("12-7：隔壁洞口的女娃要探出头（visible false → true）");
    if (!Keys(s, "Nier").some(k => k.faceTo === "Girl")) errors.push("12-7：妮儿要看着女娃");
    if (!Cap(s, /纱布/) || !Cap(s, /水壶拧开/) || !Cap(s, /搁在东墙根/) || !Cap(s, /任务字：回沟口/)) errors.push("12-7：塞纱布、水壶拧开又拧上、搁墙根、任务字回沟口要有说明字");
    const end = ShotAt("12-7", s.durationS - 0.2);
    if (!end || Dist(end.position, PL.aidGateOut) > 6) errors.push("12-7：末尾顺子要被拽到院门外"); }
  // 13-1：没有装甲车；两挺机枪各扫 ≥ 1 梭、弹着点在沟沿（东段战壕北沿的堆土）；掷弹筒小爆炸 ≥ 2 落在战壕附近；玩家开枪
  { const s = Seq("13-1");
    if (KF("13-1").units.some(u => u.kind === "tank") || s.actors.some(a => a.spawn?.kind === "tank")) errors.push("13-1：第四版没有装甲车");
    for (const id of ["IjaMg1", "IjaMg2"]) if (!s.events.some(e => e.type === "muzzle" && e.actor === id && e.count >= 8)) errors.push(`13-1：${id} 要扫几梭（muzzle count ≥ 8）`);
    const puffs = s.events.filter(e => e.type === "explosion" && e.radius <= 1 && NearTrench(e, 3));
    if (puffs.length < 8) errors.push("13-1：弹着点要扫在我们这边的沟沿上（战壕北沿 ±3 m，≥ 8 个）");
    const grenades = s.events.filter(e => e.type === "explosion" && e.kind === "grenade" && e.radius > 1 && e.radius <= 2.5 && NearTrench(e, 5));
    if (grenades.length < 2 || !Has(s, "sfx", e => e.name === "mortarPop")) errors.push("13-1：掷弹筒要「嘭」着追着战壕找人（≥ 2 个小爆炸落在战壕附近）");
    if (s.events.filter(e => e.type === "muzzle" && e.actor === "player").length < 3) errors.push("13-1：玩家要开几枪");
    if (!Cap(s, /步兵/) || !Cap(s, /掷弹筒/) || !Cap(s, /真打/)) errors.push("13-1：步兵、掷弹筒、玩家真打要有说明字"); }
  // 13-2：有人倒、有人过板桥、爬；官道桥爆炸 + 长烟、GuandaoBridgeBlown 先关后开；BridgeGone 三句按序；眼睛看过烟柱
  { const s = Seq("13-2");
    const downs = ["Runner1", "Runner2", "Runner3", "Runner4", "Runner5", "Runner6"].filter(id => Keys(s, id).some(k => k.state === "down"));
    if (downs.length < 2) errors.push("13-2：要有人倒在半路（≥ 2）");
    const crossed = ["Runner1", "Runner2", "Runner6", "Crawler"].filter(id => PosKeys(s, id).some(k => k.z > PL.plankSouth.z));
    if (crossed.length < 3) errors.push("13-2：要有人扑上板桥爬过来（≥ 3 个过了板桥）");
    if (!Keys(s, "Crawler").some(k => k.move === "crawl" && Math.abs(k.x - PL.plankMid.x) < 2)) errors.push("13-2：要有人在板桥上爬");
    const boom = s.events.find(e => e.type === "explosion" && Dist(e, PL.guandaoBridgeMid) < 8);
    const off = SignalEv("13-2", "GuandaoBridgeBlown", false), on = SignalEv("13-2", "GuandaoBridgeBlown", true);
    if (!boom || !Has(s, "smoke", e => Dist(e, PL.guandaoBridgeMid) < 8 && e.dur >= 20)) errors.push("13-2：官道桥那里要「轰」一声 + 一柱长烟（smoke dur ≥ 20）");
    if (!off || off.t > 0.01 || !on || !boom || on.t < boom.t) errors.push("13-2：GuandaoBridgeBlown 开场关、爆炸时开");
    InOrder(s, ["BridgeGone.01", "BridgeGone.02", "BridgeGone.03"]);
    const gone = Line(s, "BridgeGone.01");
    if (gone && boom && gone.t < boom.t) errors.push("13-2：「官道桥炸了！」要在「轰」之后");
    if (gone && !Looked("13-2", PL.guandaoBridgeMid, gone.t, LineEnd(s, "BridgeGone.02") + 0.5, 10)) errors.push("13-2：「官道桥炸了」之后顺子的眼睛要正对那股烟柱");
    if (Line(s, "BridgeGone.02")?.actor) errors.push("13-2：「……桥。」是顺子（玩家）说的");
    if (!Cap(s, /土烟/) || !Cap(s, /扭头看/)) errors.push("13-2：土烟、扭头看要有说明字"); }
  // 13-3：信号弹 t 0.5–1.2；几秒后才喊；Z 卧倒说明字
  { const s = Seq("13-3");
    const flare = s.events.find(e => e.type === "flare" && e.preset === "SignalRed" && Math.hypot(e.atX - PL.flareAt.x, e.atZ - PL.flareAt.z) < 3);
    if (!flare) errors.push("13-3：信号弹要用正式弹道特效（flare SignalRed）");
    else if (flare.t < 0.5 || flare.t > 1.2) errors.push(`13-3：信号弹要在 t 0.5–1.2 s（FlareEffectsBrowserTest 查 0.8 s），现在 ${flare.t}`);
    const warn = Line(s, "PlanesWarning.01");
    if (!warn || !flare || warn.t < flare.t + 3) errors.push("13-3：信号弹打上天几秒后才喊「飞机！趴倒！」");
    NeedClip("13-3", "S727_E1", "PvStandPointL", "指着天喊");
    if (!Cap(s, /Z 卧倒/)) errors.push("13-3：卧倒的按键时刻要有说明字"); }
  // 飞机：13-3 第一拨 ≥ 3；14-1 六架两拨；14-2…14-6 ≥ 3 架；航点 ≥ 3、drone、扫射低空；各段扫射段数；有镜头看飞机；不手放飞机音效
  for (const id of ["13-3", "14-1", "14-2", "14-3", "14-4", "14-5", "14-6"]) {
    const s = Seq(id), planes = s.aircraft || [];
    const wantPlanes = id === "14-1" ? 6 : 3;
    if (planes.length < wantPlanes || planes.some(p => p.model !== "MitsubishiKi30")) errors.push(`${id}：要有 ${id === "14-1" ? "六架（两拨）" : "至少三架"}九七式轻爆（aircraft[]），现在 ${planes.length}`);
    if (id === "14-1" && !(["Ki30A1", "Ki30A2", "Ki30A3", "Ki30B1", "Ki30B2", "Ki30B3"].every(pid => planes.some(p => p.id === pid)))) errors.push("14-1：六架要分两拨 A1–A3 / B1–B3");
    for (const p of planes) { if ((p.path || []).length < 3) errors.push(`${id}：${p.id} 的航点太少`); if (p.sound?.drone === false) errors.push(`${id}：${p.id} 的引擎声要跟着飞机走`); }
    const strafes = Strafes(s);
    const want = { "14-1": 2, "14-2": 1, "14-3": 1, "14-5": 1 }[id] || 0;
    if (strafes.length < want) errors.push(`${id}：扫射段要 ≥ ${want} 段，现在 ${strafes.length}`);
    if (want === 0 && strafes.length) errors.push(`${id}：这一拍不扫射`);
    if (!s.camera.some(c => c.look?.aircraft || c.lookTo?.aircraft)) errors.push(`${id}：要有一条镜头看着飞机`);
    if (s.events.some(e => e.type === "sfx" && /^(planeDrone|planeDive|strafe)/.test(e.name))) errors.push(`${id}：飞机有轨了，别再手放 planeDrone / planeDive / strafe 音效`);
    for (const st of strafes) for (const p of planes.filter(q => (q.strafe || []).includes(st))) {
      const pose = SamplePrevizAircraft(p, st.t0, { groundAt: ground });
      if (!pose.visible || pose.y - ground(pose.x, pose.z) > 60) errors.push(`${id}：${p.id} 扫射时要在低空（t ${st.t0}：高 ${R(pose.y)}）`);
    }
  }
  // 14-1：第一趟顺着战壕扫、第二趟顺着街扫；沟口扔小炸弹；二营的兵倒两个；添树枝的被掀翻、杂木着火、房顶着火
  { const s = Seq("14-1"), st = Strafes(s);
    if (!st.some(x => NearTrench(x.from, 6) && NearTrench(x.to, 6) && Math.abs(x.to.x - x.from.x) > 80)) errors.push("14-1：第一趟要顺着村北沿的战壕扫");
    if (!st.some(x => SegD(x, { x: 140, z: 730 }) < 4 && SegD(x, { x: 114, z: 690 }) < 4)) errors.push("14-1：第二趟要掉头顺着村里的主街扫");
    if (s.events.filter(e => e.type === "explosion" && e.kind === "shell" && Dist(e, PL.plankMid) < 30).length < 2) errors.push("14-1：沟口要扔小炸弹");
    for (const id of ["S727_W2", "S727_E2"]) if (!Keys(s, id).some(k => k.state === "down")) errors.push(`14-1：${id} 要挨了倒下`);
    if (!s.actors.some(a => a.spawn && a.keys.some(k => k.state === "down"))) errors.push("14-1：添树枝的要被掀翻（临时加的人倒下）");
    if (s.events.filter(e => e.type === "smoke" && e.kind === "SmokeBlack" && e.z > 655).length < 2) errors.push("14-1：第二拨往院子里扔炸弹，几处房顶着火（村里 SmokeBlack ≥ 2）");
    if (!Cap(s, /两拨/) || !Cap(s, /杂木着火/) || !Cap(s, /房顶着火/)) errors.push("14-1：两拨、杂木着火、房顶着火要有说明字"); }
  // 14-2：顺子不等人喊先跑；FollowHim.01 冲刘文财；DugoutBombed 先关后开、炸弹落在挨炸的洞；眼睛看过弹坑；跑到救护所门前；街上说明字
  { const s = Seq("14-2"); Need(s, ["FollowHim.01"]);
    const follow = Line(s, "FollowHim.01"), first = ShotAt("14-2", 1.0), start = KF("14-1").player;
    if (!follow || !Keys(s, "Luo").some(k => k.faceTo === "LiuWencai" && k.t <= follow.t)) errors.push("14-2：「文财！跟到他！」是冲刘文财喊的（班长要先朝向他）");
    if (!first || Dist(first.position, start) < 0.8) errors.push("14-2：顺子不等人喊就跑（1 s 时眼睛已离开战壕站位）");
    const off = SignalEv("14-2", "DugoutBombed", false), on = SignalEv("14-2", "DugoutBombed", true);
    const bomb = s.events.find(e => e.type === "explosion" && e.kind === "shell" && Dist(e, PL.bombedHole) < 3);
    if (!off || off.t > 0.01 || !on || !bomb || on.t < bomb.t) errors.push("14-2：院里的洞挨炸：DugoutBombed 开场关、炸弹落在 bombedHole 时开");
    if (bomb && !Looked("14-2", PL.bombedHole, bomb.t - 0.5, bomb.t + 4, 14)) errors.push("14-2：炸弹落下前后眼睛要看过那个坑");
    const end = ShotAt("14-2", s.durationS - 0.2);
    if (!end || Dist(end.position, PL.aidGateOut) > 9) errors.push("14-2：顺子要跑到救护所门前");
    if (!PosKeys(s, "StreetWoman").length) errors.push("14-2：女人拖着孩子往墙根爬要有走位");
    if (!Cap(s, /不等人喊/) || !Cap(s, /街上躺着人/) || !Cap(s, /炸成一个坑/)) errors.push("14-2：不等人喊、街上躺着人、炸成一个坑要有说明字"); }
  // 14-3：立着的车（Spawn）被扫到就藏掉、CartOverturned 先关后开、黑子倒；刘文财朝天打；停了一步
  { const s = Seq("14-3");
    const st = Strafes(s)[0], off = SignalEv("14-3", "CartOverturned", false), on = SignalEv("14-3", "CartOverturned", true);
    if (!st || SegD(st, PL.heizi) > 3) errors.push("14-3：扫射要扫到院门口的黑子");
    if (!off || off.t > 0.01 || !on || !st || !(on.t >= st.t0 && on.t <= st.t1 + 0.5)) errors.push("14-3：车要在那一串弹着扫过去时翻（CartOverturned 开场关、扫到时开）");
    if (!Keys(s, "Heizi").some(k => k.state === "alive") || !Keys(s, "Heizi").some(k => k.state === "down" && on && k.t >= on.t - 0.5)) errors.push("14-3：黑子开场立着（state alive），挨了一梭倒下");
    const cart = s.actors.find(a => a.spawn?.kind === "cart");
    if (!cart || !cart.keys.some(k => k.visible === false && on && Math.abs(k.t - on.t) < 0.5)) errors.push("14-3：开场要 Spawn 一辆立着的车，翻车那一刻藏掉");
    if (s.events.filter(e => e.type === "muzzle" && e.actor === "LiuWencai").length < 3) errors.push("14-3：刘文财在院门口朝天上打");
    if (!Cap(s, /停了一步/) || !Cap(s, /蹬/) || !Cap(s, /墙根露天/)) errors.push("14-3：停了一步、黑子蹬腿、冬瓜一个人在墙根要有说明字"); }
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
  // 15-1：老耿跪着按毛巾；HoleTalk 五句按序；「抵个锤子」那句眼睛看冬瓜；红天
  { const s = Seq("15-1"); NeedClip("15-1", "Geng", "CareMedicPress", "跪着把毛巾按回伤口");
    InOrder(s, ["HoleTalk.01", "HoleTalk.02", "HoleTalk.03", "HoleTalk.04", "HoleTalk.05"]);
    const retort = Line(s, "HoleTalk.04");
    if (retort?.actor) errors.push("15-1：「抵个锤子」是顺子（玩家）说的");
    if (retort && !Looked("15-1", Unit("15-1", "BlanketDonggua"), retort.t, LineEnd(s, "HoleTalk.04"), 14)) errors.push("15-1：「抵个锤子」那句眼睛要看着冬瓜");
    if (!Cap(s, /红天/)) errors.push("15-1：洞顶漏下一条红天要有说明字"); }
  // 15-2：没对白；抬出洞到厢房门口；天一点点黑
  { const s = Seq("15-2");
    if (s.lines.length) errors.push("15-2：这一段没有对白");
    const last = PosKeys(s, "BlanketDonggua").at(-1);
    if (!last || Dist(last, Unit("15-3", "BlanketDonggua")) > 0.5) errors.push("15-2：被子要抬到厢房门口（15-3 的位置）");
    if (!Cap(s, /天一点点黑/)) errors.push("15-2：天一点点黑要有说明字"); }
  // 15-3：DoorPush 四句 → ShellCasings 五句按序；守门的推人、画驴、掂弹壳、把脸转开
  { const s = Seq("15-3"); InOrder(s, ["DoorPush.01", "DoorPush.02", "DoorPush.03", "DoorPush.04", "ShellCasings.01", "ShellCasings.02", "ShellCasings.03", "ShellCasings.04", "ShellCasings.05"]);
    NeedClip("15-3", "Nier", "PvKneelDig", "蹲着画驴"); NeedClip("15-3", "LiuWencai", "PvCrouchCountFingers", "掂弹壳算账"); NeedClip("15-3", "DoorGuard", "PvStandHaltL", "把人往外推");
    if (Line(s, "DoorPush.02")?.actor) errors.push("15-3：「兄弟，让一哈」是顺子（玩家）说的");
    const beg = Line(s, "DoorPush.02"), p0 = KF("15-3").player, shot = beg && ShotAt("15-3", beg.t + 0.3);
    if (!shot || Dist(shot.position, p0) < 0.8) errors.push("15-3：顺子要起身去挤门（说那句时眼睛离开门槛边的站位 ≥ 0.8 m）");
    if (!Cap(s, /挤门/) || !Cap(s, /塞回被子/) || !Cap(s, /画驴/) || !Cap(s, /把脸转开/)) errors.push("15-3：挤门、把手塞回被子、画驴、老耿把脸转开要有说明字"); }
  // 16-1：DoorSill 三句；门槛；抬进厢房靠墙的空地；慢慢放
  { const s = Seq("16-1"); InOrder(s, ["DoorSill.01", "DoorSill.02", "DoorSill.03"]);
    if (Line(s, "DoorSill.03")?.actor) errors.push("16-1：「……有门槛。抬高点。」是顺子（玩家）说的");
    const last = PosKeys(s, "BlanketDonggua").at(-1);
    if (!last || Dist(last, A.dongguaInside) > 0.5) errors.push("16-1：被子要抬进厢房靠墙的空地");
    if (!Cap(s, /门槛/) || !Cap(s, /慢慢放/)) errors.push("16-1：门槛、慢慢放要有说明字"); }
  // 17-1：Passed 三句；老耿用单被盖脸；妮儿看两个大人
  { const s = Seq("17-1"); InOrder(s, ["Passed.01", "Passed.02", "Passed.03"]); NeedClip("17-1", "Geng", "PvKneelPullBlanket", "单被盖脸");
    if (!Keys(s, "Nier").some(k => k.faceTo === "Geng") || !Keys(s, "Nier").some(k => k.faceTo === "LiuWencai")) errors.push("17-1：妮儿要看看这个大人、又看看那个");
    if (!Cap(s, /盖住了他的脸/)) errors.push("17-1：单被盖脸要有说明字"); }
  // 17-2：只亮一个 F、摸出信、塞进钱袋；退到门槛坐下的机位；院门外二营的兵跑过（走位）
  { const s = Seq("17-2");
    if (s.lines.length) errors.push("17-2：这一段没有台词");
    if (!Cap(s, /只亮一个 F/) || !Cap(s, /汗湿了的信/) || !Cap(s, /塞进自己的钱袋/) || !Cap(s, /门槛上坐下/)) errors.push("17-2：F、信、钱袋、门槛上坐下要有说明字");
    let seated = false;
    for (let t = 0; t <= s.durationS; t += 0.5) { const shot = ShotAt("17-2", t); if (shot && Dist(shot.position, PL.thresholdSeat) < 1.0) { seated = true; break; } }
    if (!seated) errors.push("17-2：要有退到门槛上坐下的机位（眼睛在 thresholdSeat 1 m 内）");
    for (const id of ["Passing1", "Passing2", "Passing3"]) { const last = PosKeys(s, id).at(-1), u = Unit("17-2", id); if (!last || last.z - u.z < 8) errors.push(`17-2：${id} 要从院门外跑过（往南 ≥ 8 m）`); }
    if (!Cap(s, /一拨拨跑过/)) errors.push("17-2：院门外二营的兵一拨拨跑过要有说明字"); }
  // 17-3：StandUp 五句按序；LuoKneelCheck；幺娃挪开眼
  { const s = Seq("17-3"); InOrder(s, ["StandUp.01", "StandUp.02", "StandUp.03", "StandUp.04", "StandUp.05"]); NeedClip("17-3", "Luo", "LuoKneelCheck", "掀开被角看了看");
    if (!Cap(s, /把眼睛挪开/) || !Cap(s, /钱袋塞回怀里/)) errors.push("17-3：幺娃挪开眼、钱袋塞回怀里要有说明字"); }
  // 18-1：Orders3rdBn 六句 → DongguaEcho.01（不写说话人；压低发闷字段 + 说明字）→ Yaode.01 按序；担架抬出去、军医跟最后一副
  { const s = Seq("18-1"); InOrder(s, ["Orders3rdBn.01", "Orders3rdBn.02", "Orders3rdBn.03", "Orders3rdBn.04", "Orders3rdBn.05", "Orders3rdBn.06", "DongguaEcho.01", "Yaode.01"]);
    const echo = Line(s, "DongguaEcho.01");
    if (echo && echo.actor && echo.actor !== "player") errors.push("18-1：冬瓜那句是耳朵里响起的（冬瓜不在场，不写说话人或写 player）");
    if (echo && !(echo.volume < 1)) errors.push("18-1：冬瓜那句要压低（台词条目写 volume < 1）");
    if (!Cap(s, /耳朵里响起/) || !Cap(s, /按了按胸口/)) errors.push("18-1：耳朵里响起、按胸口要有说明字");
    for (const id of ["AidLitter1", "AidLitter2", "AidLitter3", "Doctor"]) { const last = PosKeys(s, id).at(-1); if (!last || last.x < A.box.maxX) errors.push(`18-1：${id} 要从院门出去`); }
    const l3 = PosKeys(s, "AidLitter3").find(k => k.t > 0), doc3 = PosKeys(s, "Doctor").find(k => k.t > 0);
    if (!(doc3?.t > l3?.t)) errors.push("18-1：军医跟着最后一副走");
    if (!Cap(s, /盖着脸/)) errors.push("18-1：屋里只剩盖着脸的要有说明字"); }
  // 18-2：LetsGo.01 → GoNow.01；GirlHoleCovered 先关后开；女人摇头、缩回去；妮儿看席子
  { const s = Seq("18-2"); InOrder(s, ["LetsGo.01", "GoNow.01"]);
    const off = SignalEv("18-2", "GirlHoleCovered", false), on = SignalEv("18-2", "GirlHoleCovered", true), say = Line(s, "GoNow.01");
    if (!off || off.t > 0.01 || !on || !say || on.t < say.t) errors.push("18-2：洞口开场没盖、喊完以后女人才把席子拉上（GirlHoleCovered 先关后开）");
    if (!Keys(s, "GirlMother").some(k => k.visible === false)) errors.push("18-2：女人要缩回洞里");
    if (!Keys(s, "Nier").some(k => k.faceTo && Dist(k.faceTo, PL.girlHole) < 1)) errors.push("18-2：妮儿要看着那张席子");
    if (!Cap(s, /摇摇头/) || !Cap(s, /停了一下/)) errors.push("18-2：摇头、顺子停了一下要有说明字"); }
  // 18-3：桥面上的人脚下是枕木顶；老乡在河床里蹚水；工兵在北头两墩附近；ChargesSet 不动；路上几个定镜的说明字
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
      const inBed = PosKeys(s, id).some(k => ground(k.x, k.z) <= HT.riverBedY + 0.3);
      if (!inBed) errors.push(`18-3：${id} 要在河床里蹚水`);
    }
    for (const [id, pier] of [["Sapper1", 0], ["Sapper2", 1]]) { const p = Unit("18-3", id), pz = RB.northZ + SPAN * (pier + 1); if (!p || Math.abs(p.z - pz) > 3 || Math.abs(p.x - RL.x) > 4) errors.push(`18-3：${id} 要在北头第 ${pier + 1} 座桥墩附近`); }
    let deckShots = 0;
    for (let t = 0; t <= s.durationS; t += 0.5) { const shot = ShotAt("18-3", t); if (shot && OnDeck(shot.position) && shot.position.y > HT.sleeperTopY + 1.0) deckShots++; }
    if (deckShots < 4) errors.push(`18-3：顺子要跟着担架走上桥面（眼睛在桥面上的采样只有 ${deckShots} 个）`);
    if (!Cap(s, /枕木/) || !Cap(s, /蹚水/) || !Cap(s, /光路基/) || !Cap(s, /李子行/) || !Cap(s, /席子/) || !Cap(s, /太阳落到铁路那头/) || !Cap(s, /绑炸药/)) errors.push("18-3：枕木桥面、蹚水、光路基、李子行、席子、太阳、绑炸药要有说明字"); }
  // 18-4：担架往南走进黑地；顺子回头看南边 + WhoCares.01；机枪扫、弹着在土坎顶上；班长他们在土坎后；NotYet 四句按序；任务字
  { const s = Seq("18-4");
    for (const id of ["AidLitter1", "AidLitter2", "Geng", "Nier", "Doctor"]) { const last = PosKeys(s, id).at(-1); if (!last || last.z < PL.leveePlayer.z + 20) errors.push(`18-4：${id} 要往南走进黑地（z > 河堤 + 20）`); }
    const who = Line(s, "WhoCares.01");
    if (!who) errors.push("18-4：要有 WhoCares.01"); else {
      if (who.actor) errors.push("18-4：「……哪个管得到。」是顺子（玩家）说的");
      if (!LookedYaw("18-4", 180, who.t - 3, LineEnd(s, "WhoCares.01") + 0.5, 30)) errors.push("18-4：说那句前后顺子要回头看南边那条路（yaw 180 ± 30）");
    }
    if (!s.events.some(e => e.type === "muzzle" && e.actor === "IjaMg18" && e.count >= 8)) errors.push("18-4：田里那挺机枪要扫");
    if (s.events.filter(e => e.type === "explosion" && e.radius <= 1 && Math.abs(e.z - BK.z) < 1.5 && e.x >= BK.fromX - 1 && e.x <= BK.toX + 1).length < 6) errors.push("18-4：弹着点要压在土坎顶上");
    const burst = s.events.find(e => e.type === "muzzle" && e.actor === "IjaMg18");
    if (who && burst && burst.t < LineEnd(s, "WhoCares.01")) errors.push("18-4：北边枪响要在「哪个管得到」之后");
    for (const id of ["Luo", "Yaowa", "HeYoutian"]) { const last = PosKeys(s, id).at(-1), u = Unit("18-4", id); if (!last || Dist(last, u) > 0.5) errors.push(`18-4：${id} 要缩在土坎后头（关键帧位置）`); }
    InOrder(s, ["WhoCares.01", "NotYet.01", "NotYet.02", "NotYet.03", "NotYet.04"]);
    if (!Cap(s, /土坎/) || !Cap(s, /走进黑地/) || !Cap(s, /任务字：压住那挺机枪/) || !Cap(s, /把脸从南边转回来/)) errors.push("18-4：土坎、走进黑地、任务字、把脸转回来要有说明字"); }
  // 18-5：玩家压机枪 → 机枪哑 → 顺子喊「快过来」 → 班长他们跑过桥面，班长最后一个 → 点一下头，不说话（没有 ComeOver.02）
  { const s = Seq("18-5");
    const mgDown = Keys(s, "IjaMg18").find(k => k.state === "down"), come = Line(s, "ComeOver.01");
    if (!mgDown || !come || come.t < mgDown.t) errors.push("18-5：机枪哑了顺子才站起来喊「快过来」");
    if (come?.actor) errors.push("18-5：「快过来！快过来！」是顺子（玩家）喊的");
    if (s.lines.length !== 1) errors.push("18-5：这一段只有「快过来」一句（班长点头不说话）");
    const arrive = id => PosKeys(s, id).filter(k => k.z > RB.southZ).map(k => k.t)[0];
    const luoT = arrive("Luo");
    if (luoT === undefined) errors.push("18-5：班长要跑过桥到南岸");
    for (const id of ["Yaowa", "HeYoutian", "Squad1", "Squad2"]) { const t = arrive(id); if (t === undefined) errors.push(`18-5：${id} 要跑过桥到南岸`); else if (luoT !== undefined && t > luoT) errors.push(`18-5：班长要最后一个过桥（${id} 比他晚）`); }
    const crossesDeck = id => PosKeys(s, id).some(k => (k.path || []).some(p => Math.abs(p.x - RL.x) < 0.5));
    if (!["Luo", "Yaowa", "HeYoutian"].every(crossesDeck)) errors.push("18-5：班长他们要走铁路桥桥面（路线过桥面中线）");
    const nod = s.events.find(e => e.type === "caption" && /点一下头/.test(e.text) && /不说话/.test(e.text));
    if (!nod || luoT === undefined || Math.abs(nod.t - luoT) > 2.0) errors.push("18-5：班长扑到河堤后冲军官点一下头、不说话（说明字对上他到南岸那一刻）"); }
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
  // 18-7：鬼子都在北岸（z < 北坎顶）、北岸路基上开枪；村子方向远枪声或说明字；SecondBattalion 按序；往南走
  { const s = Seq("18-7"); InOrder(s, ["SecondBattalion.01", "SecondBattalion.02"]);
    if (s.events.filter(e => e.type === "muzzle" && /^BankIja/.test(e.actor || "")).length < 6) errors.push("18-7：北岸路基上要有鬼子枪口火（若干）");
    for (const a of s.actors) { const u = a.spawn || Unit("18-7", a.id); if (u?.side !== "ija") continue; for (const k of PosKeys(s, a.id)) if (k.z >= RB.northZ) errors.push(`18-7：${a.id} 过不来（要留在北岸 z < ${RB.northZ}）`); }
    for (const u of KF("18-7").units) if (u.side === "ija" && u.z >= RB.northZ) errors.push(`18-7：关键帧里 ${u.id} 要在北岸`);
    if (!Has(s, "sfx", e => /rifleShot|mgBurst/.test(e.name) && e.x > 50 && e.z < 760) && !Cap(s, /村那头枪声/)) errors.push("18-7：东北边北沙河村那头要有枪声（远处音效或说明字）");
    if (!Cap(s, /二营/)) errors.push("18-7：二营还在打要有说明字");
    const last = PosKeys(s, "Luo").at(-1);
    if (!last || last.z < PL.leveePlayer.z + 12) errors.push("18-7：末尾要往南走"); }
  // 18-8：开头黑场 ≥ 3 s + 日期字幕恰好「1938年3月14日 夜」；NightRoad 三句按序；眼睛看过县城的灯；队伍沿南岸路往南走 ≥ 15 m；末尾黑场；then stay
  { const s = Seq("18-8");
    const black = s.events.filter(e => e.type === "black").sort((a, b) => a.t - b.t);
    if (!black.length || black[0].t > 0.01 || black[0].dur < 3) errors.push("18-8：开头要先黑几秒");
    if (!Has(s, "caption", e => e.text === "1938年3月14日 夜" && e.t < 3)) errors.push("18-8：黑场上要有日期字幕「1938年3月14日 夜」");
    if (allText.includes("滕县北门")) errors.push("18-8：字幕里不要「滕县北门」");
    if (black.length < 2 || black[black.length - 1].t < s.durationS - 10) errors.push("18-8：末尾要黑场收尾");
    InOrder(s, ["NightRoad.01", "NightRoad.02", "NightRoad.03"]);
    if (Line(s, "NightRoad.03")?.actor) errors.push("18-8：「……进了城再说。」是顺子（玩家）说的");
    if (!Looked("18-8", PL.cityLights, black[0]?.dur ?? 6, s.durationS, 12)) errors.push("18-8：眼睛要看过县城的灯");
    for (const id of ["Luo", "Geng", "Nier", "HeYoutian"]) { const ks = PosKeys(s, id); if (ks.length < 2 || Dist(ks[0], ks[ks.length - 1]) < 15 || ks[ks.length - 1].z <= ks[0].z) errors.push(`18-8：${id} 要顺南岸路往南走 ≥ 15 m`); }
    const road = RD.southRoad.line, nearRoad = p => { let best = Infinity; for (let i = 1; i < road.length; i++) { const a = road[i - 1], b = road[i]; const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz; const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)); best = Math.min(best, Math.hypot(p.x - a.x - dx * k, p.z - a.z - dz * k)); } return best; };
    for (const id of ["Luo", "Geng"]) for (const k of PosKeys(s, id)) if (nearRoad(k) > 6) errors.push(`18-8：${id} 的走位要在南岸路上（离中线 ${R(nearRoad(k))} m）`);
    if (!Cap(s, /几点灯/) || !Cap(s, /第一关结束/) || !Cap(s, /攥着钱袋和信/)) errors.push("18-8：几点灯、第一关结束、攥着钱袋和信要有说明字"); }
  for (const s of doc.sequences) if (s.events.some(e => e.type === "signal" && e.name === "ChargesSet")) errors.push(`${s.keyframe}：ChargesSet 18-3 起本来就开，预演里别动它`);
  // 写死点的机位（from / to 与 look 都是点）：起幅、落幅都不能悬在看的那个点正上方（< 0.5 m）或往下看超过 60°（10-23 用户；同 PrevizPlanTest「没有朝正下方的镜头」）
  for (const s of doc.sequences) for (const c of s.camera) {
    if (c.eye) continue;
    for (const [tag, at, look] of [["起幅", c.from, c.look], ["落幅", c.to || c.from, c.lookTo || c.look]]) {
      if (!at || !look || look.actor || look.aircraft || at.actor || at.aircraft) continue;
      const d = Math.hypot(at.x - look.x, at.z - look.z), dh = (look.h ?? PREVIZ_DEFAULTS.pointH) - (at.h ?? PREVIZ_DEFAULTS.pointH);
      const pitch = Math.atan2(dh, d) * 180 / Math.PI;
      if (d < 0.5 || pitch < -60) errors.push(`${s.keyframe} 镜头@${c.t} ${tag}：离看的点 ${R(d)} m、往下 ${R(-pitch)}°（落幅离看点要 ≥ 0.5 m、俯角 ≤ 60°）`);
    }
  }
  // 镜头轨：每一刻都能采样
  for (const n of norm.sequences) {
    for (let t = 0; t <= n.durationS; t += 1.0) {
      try {
        const shot = ShotAt(n.keyframe, t);
        if (!shot || !Number.isFinite(shot.position?.x) || !Number.isFinite(shot.yawDeg)) throw new Error("采样结果不是有限数字");
      } catch (e) { errors.push(`${n.keyframe}：镜头在 ${t} s 采样出错：${e.message}`); break; }
    }
  }
  void layout; void SIG; void PrevizStrafeImpacts;
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
