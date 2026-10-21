// ===========================================================================
// Script_EditorBlockoutFirstLevel0610PrevizTest.mjs —— FirstLevel0610 预演数据的纯 node 自检
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610PrevizTest.mjs           → 查 Blockout/FirstLevel0610.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0610PrevizTest.mjs --fresh   → 查生成器当场生成的那份（并核对两次生成逐字相同）
//
// 查（照 0105 的 PrevizTest，加了场地专有的几条）：运行时包的 ValidateBlockoutPreviz（关键帧 / 单位 / 台词 id / 字段）；
// 每个片段在那具骨架上烘过（有 castId 的按 Data_FirstLevelSpeakingCast 的骨架，没有 castId 的士兵只许五具骨架都有的通用片段，
// 百姓 / 小孩 / 军官 2026-10-19 起是骨骼占位身体、只许通用片段，只有 body:"procedural" 的百姓一个片段都不许）；同一段里台词不互相压；演员走位点在场地范围内、不落在沟壁 / 坎上、
// 身子不进实心块（按那一刻的信号算随信号体块，路线按 0.5 m 取样）；走位要求的速度不离谱；说话的人在那一刻是可见的；
// 机位点不在实心块里；门缝 / 墙缝那几段的眼睛真能从缝里看到演的东西（2D 视线不被 ≥1 m 高的块挡）；
// 剧本要求的事件（六个信号按拍开、掷弹筒越落越近、09 的「响了才走」节奏、07 边走边说、07-4 非第一人称短过场、08 手榴弹与喊人的可见段、10 东街 25–70 m）都在。第二版 2026-10-19 按 25 帧重写。
// 第三版（2026-10-19，白盒预演补齐）再查：07-4 有飞机由北往南飞过凹路（10-21 起：三架 Ki-30 高飞去炸县城、不俯冲不开枪、一架斜翅膀）、引擎声跟着走、镜头 ① 里看得见它，人群 VilDuckProne 错峰扑倒、
// 妮儿最后一个；用到的 Vil 片段都在 PrevizVillage 清单里；成对动作（清单 stages）两人的相对站位、朝向、起播时差与清单一致
//（StageChecks：拿刺刀捅 / 被捅、倒退拖 / 被拖、压刺刀 / 咬手腕、伸手 / 拽回、背 / 被背、抱腿、攥衣角）；09-7 有慢动作窗口（约 1.5 s、0.3 倍、带渐变），
// 咬中那一刻在窗口里、窗口里没台词；钻狗洞 / 翻墙 / 砸门 / 挪缸 / 拔门闩 / 磕钢盔扔手榴弹 / 挑襁褓的片段与它们带出的信号 / 事件对得上时刻。
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HeightGridSampler, LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { CharacterClipModelId } from "./Data_CharacterSelection.mjs";
import { BlockStandSampler, PrevizSignalsAt, NormalizeBlockoutPreviz, SamplePrevizCamera, SamplePrevizAircraft, PREVIZ_SLOWMO } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { BLOCKOUT_PREVIZ_CLIP_LIBRARIES } from "./Data_BlockoutPrevizClips.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const Load = f => JSON.parse(readFileSync(join(HERE, f), "utf8"));
const R = v => Math.round(v * 100) / 100;

const MODEL_ID = { nra: { 1: "TengxianNra02", 4: "TengxianNra05", 5: "TengxianNra06" }, ija: { 0: "TengxianIja01", 1: "TengxianIja02", 2: "TengxianIja03", 5: "TengxianIja06" } };
const SPEED = { walk: 1.4, run: 3.5, crawl: 0.5, drag: 0.9 };
const PEOPLE = new Set(["soldier", "officer", "civilian", "child", undefined]);
/** 小孩身体的缩放（Script_EditorBlockoutPuppets BLOCKOUT_PUPPETS.childScale）。 */
const CHILD_SCALE = 0.62;
/** 地瓜窖坑心（Data_EditorBlockoutFirstLevel0610Space L0610_GENG.cellar）；网格里坑口沿在坑心外 1.0 m。 */
const CELLAR = { x: 90.5, z: 499.5 };
/** 妮儿 07 坐车尾的 ride（关键帧生成器 NIER_RIDE：车尾沿 z +1.2、根离地 0.467 = 1.025 − 0.9 × 0.62、背对车头）。 */
const NIER_RIDE = { on: "GengCart", x: 0, z: 1.2, y: 0.467, yawDeg: 180 };
/** 四条新音效文件（Audio/BlockoutPreviz）的时长与响点，ffprobe 实测 10-20。 */
const SFX_FILE = { babyCry: 3.53, cellarSob: 4.0, gateSmash: 2.33, gateSmashFirstHit: 0.07, jarShatter: 1.53 };

function ClipTable() {
  const lib = Load("Animation/OpeningStoryboards/Data_OpeningStoryboardsAnimation.json");
  const byModel = new Map(lib.models.map(m => [m.id, new Set(m.clipIds)]));
  const sets = [...byModel.values()];
  const common = new Set([...sets[0]].filter(c => sets.every(s => s.has(c))));
  // 预演额外加载的库（Data_BlockoutPrevizClips）：只烘了 TengxianNra02，但五具骨架骨名一致、哪具身体都能播 → 算通用片段。
  // 库还没烘出来（清单不在盘上）就跳过。
  let village = null;
  for (const extra of BLOCKOUT_PREVIZ_CLIP_LIBRARIES) {
    const file = join(HERE, extra.base, extra.manifest);
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    if (extra.name === "PrevizVillage") village = manifest;
    for (const name of Object.keys(manifest.clips || {})) for (const set of [...sets, common]) set.add(name);
  }
  return { byModel, common, village };
}

function ClipSetFor(unit, table) {
  // 2026-10-19 运行时补齐：百姓 / 小孩默认换成 NRA02 骨架的占位身体（§5.6），军官本来就是骨骼身体 —— 都能播五具骨架共有的通用片段；
  // 只有明确写 body:"procedural" 的百姓还是旧的程序化身体，一个片段都不许。
  if ((unit?.side === "civ" || unit?.kind === "civilian" || unit?.kind === "child") && unit?.body === "procedural") return { name: "程序化身体（没有动作库）", clips: new Set() };
  if (unit?.side === "civ" || unit?.kind === "civilian" || unit?.kind === "child" || unit?.kind === "officer") return { name: "骨骼占位身体（只许通用片段）", clips: table.common };
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
/**
 * 镜头锚点 → {x,y,z}：点按地面 + h，演员锚按单位布设（或 spawn）脚下 + offset，"player" 按关键帧机位，
 * 飞机锚（{ aircraft }，2026-10-19）按 SamplePrevizAircraft 在 t 秒的机身位置 + offset（所以按 t 造一个 resolver）。
 */
function CameraResolver(kf, seq, ground, t = 0) {
  const at = id => (id === "player" ? kf.player : (kf.units || []).find(u => u.id === id) || seq.actors.find(a => a.id === id)?.spawn || null);
  return anchor => {
    if (!anchor) return null;
    if (anchor.actor) {
      const u = at(anchor.actor);
      if (!u) return null;
      const [dx, dy, dz] = anchor.offset || [0, 0, 0];
      return { x: u.x + dx, y: ground(u.x, u.z) + dy, z: u.z + dz, yawDeg: u.yawDeg ?? 0, pitchDeg: u.pitchDeg ?? 0 };
    }
    if (anchor.aircraft) {
      const entry = (seq.aircraft || []).find(p => p.id === anchor.aircraft);
      if (!entry) return null;
      const pose = SamplePrevizAircraft(entry, t, { groundAt: ground });
      const [dx, dy, dz] = anchor.offset || [0, 0, 0];
      return { x: pose.x + dx, y: pose.y + dy, z: pose.z + dz };
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
      if (Math.abs(p.x - CELLAR.x) <= 1.3 && Math.abs(p.z - CELLAR.z) <= 1.3) slopeWarn = false;   // 窖沿：爬出窖的根按清单站在坑口沿外 0.1 m，0.35 m 内就是坑壁
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
          // Vil 开头的只认 PrevizVillage 清单（清单没烘出来就报错：这一版的预演全靠它）
          if (/^Vil/.test(k.clip) && !table.village?.clips?.[k.clip]) errors.push(`${kat}：片段 ${k.clip} 不在 PrevizVillage 清单里`);
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
  DesignChecks(doc, norm, config, layout, errors, table);
  if (table.village) StageChecks(doc, norm, config, layout, table.village, errors);
  else errors.push("PrevizVillage 清单不在盘上（Animation/PrevizVillage/Data_PrevizVillageAnimation.json）：成对动作查不了");
  return { errors, warnings, rows };
}

// ---------------------------------------------------------------------------
// 成对动作（PrevizVillage 清单 stages）：两人的相对站位、朝向、起播时差

const DEG = Math.PI / 180;
const WrapDeg = d => { let x = ((d + 180) % 360 + 360) % 360 - 180; return x <= -180 ? x + 360 : x; };
/** p 往朝向 yaw 的前方 f 米、右边 r 米（yaw：0 北，+90 西）。 */
function Fwd(p, yaw, f, r = 0) { const a = yaw * DEG; return { x: p.x - Math.sin(a) * f + Math.cos(a) * r, z: p.z - Math.cos(a) * f - Math.sin(a) * r }; }
/**
 * 演员在 t 秒的站位与朝向（只看预演文件里的键：最后一个 t ≤ T 的位置键、最后一个写了 yawDeg 的键）。
 * 成对动作的键之前都要写明 yawDeg（faceTo 要查运行时的转身插值，这里不认）。
 */
function PoseAt(seq, kf, id, T) {
  const entry = seq.actors.find(a => a.id === id);
  const base = entry?.spawn || (kf.units || []).find(u => u.id === id);
  if (!base) return null;
  let pos = { x: base.x, z: base.z }, yaw = Number.isFinite(base.yawDeg) ? base.yawDeg : null, yawFrom = "布设";
  for (const k of entry?.keys || []) {
    if (k.t > T + 0.011) break;
    if (k.x !== undefined) pos = { x: k.x, z: k.z };
    if (Number.isFinite(k.yawDeg)) { yaw = k.yawDeg; yawFrom = `键@${k.t}`; } else if (k.faceTo !== undefined) { yaw = null; yawFrom = `键@${k.t} 的 faceTo`; }
  }
  return { ...pos, yawDeg: yaw, yawFrom, scale: base.kind === "child" ? CHILD_SCALE : 1 };
}
function StageChecks(doc, norm, config, layout, village, errors) {
  if (doc.level !== "FirstLevel0610") return;
  const ground = layout.terrainSampler;
  // 片段 → { stage, role, a（清单里的相对站位）, anchor（这个 stage 的锚点角色）}
  const byClip = new Map();
  for (const [stage, st] of Object.entries(village.stages || {})) for (const [role, a] of Object.entries(st.actors || {})) if (a.clip) byClip.set(a.clip, { stage, role, a, anchor: st.anchor, st });
  const stageOf = (stage) => village.stages[stage];
  let pairs = 0;
  for (const seq of doc.sequences) {
    const kf = config.keyframes.find(k => k.id === seq.keyframe);
    const at = `预演 ${seq.keyframe}`;
    const keysOf = id => (seq.actors.find(a => a.id === id)?.keys || []);
    const Compare = (what, anchorId, tA, partnerId, tP, aSpec, pSpec, keyScale = 1) => {
      const A = PoseAt(seq, kf, anchorId, tA), P = PoseAt(seq, kf, partnerId, tP);
      if (!A || !P) { errors.push(`${at}：${what} 查不到 ${!A ? anchorId : partnerId} 的站位`); return; }
      if (A.yawDeg === null) { errors.push(`${at}：${what} 锚点 ${anchorId} 在 ${tA} s 的朝向没写 yawDeg（${A.yawFrom}）`); return; }
      if (P.yawDeg === null) { errors.push(`${at}：${what} 对手 ${partnerId} 在 ${tP} s 的朝向没写 yawDeg（${P.yawFrom}）`); return; }
      // 清单坐标：锚点本地 +x 右、−z 前；yawDeg + = 左转。两个人都可能不是锚点（锚点 x/z 一般是 0）
      const rel = { x: (pSpec.x || 0) - (aSpec.x || 0), z: (pSpec.z || 0) - (aSpec.z || 0) };
      const want = Fwd(A, A.yawDeg, -rel.z * keyScale, rel.x * keyScale);
      const wantYaw = WrapDeg(A.yawDeg + ((pSpec.yawDeg || 0) - (aSpec.yawDeg || 0)));
      const d = Math.hypot(P.x - want.x, P.z - want.z), dy = Math.abs(WrapDeg(P.yawDeg - wantYaw));
      if (d > 0.12) errors.push(`${at}：${what} —— ${partnerId} 该在 (${R(want.x)}, ${R(want.z)})，实际 (${R(P.x)}, ${R(P.z)})，差 ${R(d)} m`);
      if (dy > 4) errors.push(`${at}：${what} —— ${partnerId} 朝向该是 ${R(wantYaw)}°，实际 ${R(P.yawDeg)}°`);
      pairs++;
    };
    for (const a of seq.actors) {
      for (const k of a.keys) {
        if (typeof k.clip !== "string" || !byClip.has(k.clip)) continue;
        const me = byClip.get(k.clip);
        const st = me.st;
        for (const [role, spec] of Object.entries(st.actors)) {
          if (role === me.role) continue;
          const what = `成对动作 ${me.stage}（${a.id} ${k.clip} @${k.t}）`;
          if (spec.clip) {
            // 对手也播片段：按清单 offsetS 找他的那个键（从非锚点这边查一次就够：锚点循环重起时只有最后一遍配对）
            if (me.role === st.anchor && Object.values(st.actors).some(o => o !== spec && o.clip && o !== me.a)) { /* 由对手那边查 */ }
            if (me.role === st.anchor) continue;
            const dt = (me.a.offsetS || 0) - (spec.offsetS || 0);          // 对手起播时刻 = 我的 − dt
            const partner = seq.actors.find(b => b.keys.some(p => p.clip === spec.clip && Math.abs(p.t - (k.t - dt)) <= 0.1));
            if (!partner) { errors.push(`${at}：${what} 少了对手 ${role}（${spec.clip}，该在 ${R(k.t - dt)} s 起播）`); continue; }
            const pk = partner.keys.find(p => p.clip === spec.clip && Math.abs(p.t - (k.t - dt)) <= 0.1);
            // 锚点是对手：以他为锚
            if (role === st.anchor) Compare(what, partner.id, pk.t, a.id, k.t, spec, me.a);
            else Compare(what, a.id, k.t, partner.id, pk.t, me.a, spec);
          } else if (role === "front") {
            // 攥衣角：前面的人是顺子（眼睛）—— 她的根要在镜头位置后方 |z|（小孩身体按 0.62 缩）
            const n = norm.sequences.find(s => s.keyframe === seq.keyframe);
            const shot = SamplePrevizCamera(n.camera, k.t + 0.05, CameraResolver(kf, n, ground, k.t + 0.05));
            const P = PoseAt(seq, kf, a.id, k.t);
            const want = Math.abs(spec.z || 0) * P.scale;
            const d = shot ? Math.hypot(P.x - shot.position.x, P.z - shot.position.z) : NaN;
            if (!(Math.abs(d - want) <= 0.12)) errors.push(`${at}：${what} —— 她的根离镜头（顺子）该是 ${R(want)} m，实际 ${R(d)} m`);
            pairs++;
          } else {
            // 对手不播片段（抱腿的老耿）：按角色名找单位
            const partnerId = (kf.units || []).map(u => u.id).find(id => id.toLowerCase() === role.toLowerCase());
            if (!partnerId) { errors.push(`${at}：${what} 找不到对手 ${role} 对应的单位`); continue; }
            Compare(what, a.id, k.t, partnerId, k.t, me.a, spec);
          }
        }
      }
    }
    void keysOf; void stageOf;
  }
  if (pairs < 8) errors.push(`成对动作只核到 ${pairs} 对（要 ≥ 8：捅 / 拖 / 咬 / 拽 / 背 ×2 / 抱腿 / 攥衣角）`);
}

/** 剧本要求的设计口径（只查 FirstLevel0610；第二版 2026-10-19 的 25 帧）。 */
function DesignChecks(doc, norm, config, layout, errors, table = { village: null }) {
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
  const ClipKey = (seq, id, clip) => Keys(seq, id).find(k => k.clip === clip);
  const ClipKeys = (seq, id, clip) => Keys(seq, id).filter(k => k.clip === clip);
  /** 某人在 T 秒的站位（最后一个 t ≤ T 的位置键，没有就是布设）。 */
  const PosAt = (kfId, seq, id, T) => { let p = Unit(kfId, id) || seq?.actors.find(a => a.id === id)?.spawn; for (const k of PosKeys(seq, id)) if (k.t <= T + 0.011) p = k; return p; };
  const SignalT = (seq, name) => seq?.events.find(e => e.type === "signal" && e.name === name && e.on === true)?.t;
  const kf07 = config.keyframes.find(k => k.id === "07-4");
  let inView07 = false;
  /** 07 妮儿坐车尾：关键帧 ride 挂在车尾沿、预演第一个键 VilSitEdge、挂着期间不写位置键（校验会报「位置键不管用」）。 */
  const RideChecks = (id, s) => {
    const u = Unit(id, "Nier");
    if (JSON.stringify(u?.ride) !== JSON.stringify(NIER_RIDE)) errors.push(`${id}：关键帧里妮儿要挂在车尾沿上（ride ${JSON.stringify(NIER_RIDE)}），实际 ${JSON.stringify(u?.ride)}`);
    if (Keys(s, "Nier")[0]?.clip !== "VilSitEdge") errors.push(`${id}：妮儿开场要坐在车尾（第一个键 VilSitEdge）`);
    let riding = true;
    for (const k of Keys(s, "Nier")) {
      if (k.ride !== undefined) riding = k.ride !== null;
      else if (riding && k.x !== undefined) errors.push(`${id}：妮儿 @${k.t} 挂在车上还写了位置键（不管用，要下车先写 ride: null）`);
    }
    return riding;
  };
  // 六个信号按拍开
  if (!SignalOn("06-3", "CartDeparted")) errors.push("06-3：老耿赶车走要打开 CartDeparted");
  if (!SignalOn("09-4", "CellarBlast")) errors.push("09-4：窖里闷响要打开 CellarBlast");
  if (!SignalOn("09-5", "SideGateOpen")) errors.push("09-5：门闩拉开要打开 SideGateOpen");
  if (!SignalOn("10-1", "MgSilenced")) errors.push("10-1：打掉机枪组要打开 MgSilenced");
  if (!SignalOn("10-4", "NorthYardGatesBroken")) errors.push("10-4：北边三道门砸倒要打开 NorthYardGatesBroken");
  if (!SignalOn("10-6", "BackVatMoved")) errors.push("10-6：缸推到位要打开 BackVatMoved");
  if (!SignalOn("10-6", "BackDoorOpen")) errors.push("10-6：门板拉开要打开 BackDoorOpen");
  // 四条新音效（10-20）：别名在 §14.3；位置、时刻在各拍里再核
  const Sfx = (seq, name) => (seq?.events || []).filter(e => e.type === "sfx" && e.name === name).sort((a, b) => a.t - b.t);
  for (const [id, name] of [["09-1", "cellarSob"], ["09-3", "cellarSob"], ["09-4", "babyCry"], ["09-7", "jarShatter"], ["10-4", "gateSmash"]]) if (!Sfx(Seq(id), name).length) errors.push(`${id}：要用新音效 ${name}`);
  for (const id of ["09-1", "09-3"]) for (const e of Sfx(Seq(id), "cellarSob")) if (!Near(e, CELLAR, 0.3)) errors.push(`${id}：窖里的哭声要从窖口放（(${e.x}, ${e.z})）`);
  if (Sfx(Seq("09-1"), "cellarSob").length < 2 || Sfx(Seq("09-3"), "cellarSob").length < 2) errors.push("09-1 / 09-3：窖里的哭声各放两遍（文件 4 s，人在窖里的那一阵都得听见）");
  for (const id of ["09-7", "10-4"]) if (Has(Seq(id), "sfx", e => e.name === "dirtFall" && id === "09-7" || e.name === "bodyFall" && id === "10-4")) errors.push(`${id}：有了新音效，别再拿 ${id === "09-7" ? "碎屑声顶罐子" : "重物落地顶砸门"}`);
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
    for (const who of ["GengCart", "Yaowa", "Luo"]) if (!PosKeys(s, who).some(k => k.move === "walk")) errors.push(`${id}：${who} 要跟着往前走`);
    // 妮儿坐在车尾（VilSitEdge）：10-20 起挂在车尾沿上（关键帧 ride），车动她跟着走 —— 预演里只给片段，一个位置键都不许（挂着时位置键不管用）
    RideChecks(id, s);
    // 背伤员的一对（stage carryOnBack）在队里
    if (!Keys(s, "Helper03").some(k => k.clip === "VilNraCarryOnBack") || !Keys(s, "Walker08").some(k => k.clip === "VilRideOnBack")) errors.push(`${id}：后送队里要有一对背着走的（Helper03 VilNraCarryOnBack + Walker08 VilRideOnBack）`);
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
    if (RideChecks("07-3", s) !== true) errors.push("07-3：妮儿整段都坐在车尾（不下车）");
  }
  // 07-4：短过场——前 18 s 全是机位（非第一人称）、三段机位；一架 Ki-30 由北往南贴麦地飞过凹路、不开枪、引擎声跟着走、镜头 ① 看得见它；
  // 人往坎底缩（VilDuckProne 错峰）、妮儿最后一个；跑（run 键）；村子冒烟；最后切回眼睛趴在路沟沿
  {
    const s = Seq("07-4"), n = NSeq("07-4");
    const cams = s.camera.filter(c => !c.eye);
    if (cams.length < 3) errors.push("07-4：短过场要有三个镜头（非第一人称机位）");
    if (s.camera.some(c => c.eye && c.t < 18)) errors.push("07-4：前 18 s 不能有第一人称眼睛");
    const last = [...s.camera].sort((a, b) => a.t - b.t).at(-1);
    if (!last?.eye || last.eye.stance !== "prone" || Math.abs(last.eye.z - 384.3) > 1) errors.push("07-4：最后要切回第一人称，趴在村口路沟沿上");
    const duckers = ["Luo", "Yaowa", "Squad1", "Officer", "Medic", "Walker01", "Walker16", "Helper02", "Geng", "Nier"];
    const duckT = Object.fromEntries(duckers.map(id => [id, Keys(s, id).find(k => k.clip === "VilDuckProne")?.t]));
    for (const id of duckers) if (duckT[id] === undefined) errors.push(`07-4：${id} 要扑倒（VilDuckProne 键）`);
    const nierDuck = duckT.Nier;
    if (nierDuck !== undefined && duckers.some(id => id !== "Nier" && duckT[id] !== undefined && duckT[id] >= nierDuck)) errors.push("07-4：妮儿要最后一个趴下（她听不见，看见别人趴了才趴）");
    const spread = Object.values(duckT).filter(t => t !== undefined);
    if (spread.length && Math.max(...spread) - Math.min(...spread) < 2.0) errors.push("07-4：扑倒要错峰（最早到最晚 ≥ 2 s）");
    // 妮儿坐在车尾（ride）跟着车挪；扑倒前先下车：ride: null + 切到车尾外半步、朝北站着，再 VilDuckProne 在车边扑；下车在车停稳之后、扑倒之前
    if (RideChecks("07-4", s) !== false) errors.push("07-4：妮儿扑倒前要下车（ride: null），之后不再上车");
    const off = Keys(s, "Nier").find(k => k.ride === null);
    const cartStop = Math.max(0, ...PosKeys(s, "GengCart").filter(k => k.move !== "cut" && k.t <= (nierDuck ?? Infinity)).map(k => k.t));   // 扑倒前车最后一次停稳
    if (!off) errors.push("07-4：妮儿要有下车的键（ride: null）");
    else {
      if (off.x === undefined || off.move !== "cut" || off.stance !== "stand") errors.push("07-4：下车那个键要同时把她切到地上（x / z、move cut）、站着");
      if (nierDuck === undefined || off.t >= nierDuck || off.t < nierDuck - 1.0) errors.push(`07-4：下车（${off.t} s）要在扑倒（${nierDuck} s）前 1 s 以内`);
      if (off.t < cartStop) errors.push(`07-4：车停稳（${cartStop} s）了她才下车（${off.t} s）`);
      const cart = PosKeys(s, "GengCart").at(-1) && PosAt("07-4", s, "GengCart", off.t);
      if (cart && !(Math.abs(off.x - cart.x) < 0.3 && cart.z - off.z > 1.3 && cart.z - off.z < 2.2)) errors.push(`07-4：下车要落在车尾外半步（车中心北 1.3–2.2 m），实际 dz ${R(cart.z - off.z)} dx ${R(Math.abs(off.x - cart.x))}`);
    }
    // 飞机（2026-10-21 用户改）：几架轰炸机高高地往南去炸县城，路过看见了这里的人；不俯冲、不开枪。
    // 13 那两架低空扫射的是它们炸完回去、再一次出动来的（12–18 的 13-1）。
    const planes = s.aircraft || [];
    if (planes.length < 3) errors.push(`07-4：要有不止一架飞机（排成队往南去，≥ 3 架），现在 ${planes.length}`);
    if (planes.some(p => p.model !== "MitsubishiKi30")) errors.push("07-4：飞机要是九七式轻爆 MitsubishiKi30（和 13 扫射的同一种，炸完回去再出动的就是它们）");
    const plane = planes[0];
    if (plane) {
      const ground = layout.terrainSampler;
      let seen = false;
      for (const p of planes) {
        const path = p.path || [];
        if (path.length < 2 || path[0].z > 200 || path.at(-1).z < 550) errors.push(`07-4：${p.id} 要由北（z < 200）往南（z > 550）飞过`);
        if ((p.strafe || []).length) errors.push(`07-4：${p.id} 不开枪（不许写 strafe）`);
        if (p.sound?.diveT !== undefined) errors.push(`07-4：${p.id} 不俯冲（不许写 sound.diveT）`);
        if (p.sound?.drone === false) errors.push(`07-4：${p.id} 的引擎声要跟着飞机走（sound.drone 不许关）`);
        // 高飞：整条航线离地 ≥ 250 m（不是冲着这里来的）
        let minH = Infinity;
        for (let t = path[0]?.t ?? 0; path.length && t <= path.at(-1).t; t += 0.1) {
          const q = SamplePrevizAircraft(p, t, { groundAt: ground });
          if (q.visible) minH = Math.min(minH, q.y - ground(q.x, q.z));
        }
        if (!(minH >= 250)) errors.push(`07-4：${p.id} 要高飞（离地 ≥ 250 m），最低 ${R(minH)} m`);
      }
      // 至少有一架转弯时斜了斜翅膀（看见了凹路里的人）
      if (!planes.some(p => { for (let t = p.path[0].t; t <= p.path.at(-1).t; t += 0.1) if (Math.abs(SamplePrevizAircraft(p, t).bank) > 0.25) return true; return false; })) errors.push("07-4：要有一架在头顶上斜一斜翅膀（航线拐个小弯，坡度 > 0.25 rad）");
      const path = plane.path || [];
      for (let t = path[0].t; t <= path.at(-1).t; t += 0.1) {
        const p = SamplePrevizAircraft(plane, t, { groundAt: ground });
        if (!p.visible) continue;
        if (nierDuck !== undefined && t < nierDuck && p.z > 330 && p.z < 345) seen = seen || true;   // 领机过顶在妮儿趴下之前
        // 镜头里看得见它：镜头朝向与「机位 → 机身」的夹角在视场的 0.75 倍以内
        const shot = SamplePrevizCamera(n.camera, t, CameraResolver(kf07, n, ground, t));
        if (shot && !shot.eye) {
          const yaw = shot.yawDeg * Math.PI / 180, pitch = shot.pitchDeg * Math.PI / 180;
          const f = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
          const dx = p.x - shot.position.x, dy = p.y - shot.position.y, dz = p.z - shot.position.z, len = Math.hypot(dx, dy, dz);
          const ang = Math.acos(Math.max(-1, Math.min(1, (f.x * dx + f.y * dy + f.z * dz) / len))) * 180 / Math.PI;
          if (ang <= (shot.fov || 60) * 0.75) inView07 = true;
        }
      }
      if (!seen) errors.push("07-4：飞机要在妮儿趴下之前就过了头顶");
      if (!inView07) errors.push("07-4：镜头里要看得见飞机（某一刻机身在机位的视场里）");
      if (!s.camera.some(c => c.look?.aircraft === plane.id || c.lookTo?.aircraft === plane.id)) errors.push("07-4：要有一条镜头看着飞机（look / lookTo 用飞机锚）");
    }
    if (Has(s, "sfx", e => e.name === "tankTracks")) errors.push("07-4：飞机有模型和引擎声了，不要再拿履带声顶");
    if (!PosKeys(s, "Luo").some(k => k.move === "run") || !PosKeys(s, "GengCart").some(k => k.move === "walk")) errors.push("07-4：全班要顺凹路往前跑、车跟在后头");
    if (s.events.filter(e => e.type === "smoke" && e.kind === "SmokeBlack").length < 2) errors.push("07-4：望见耿家庄要有几处房顶冒烟（SmokeBlack ≥ 2）");
  }
  // 08-1：村民跑、倒两个、一个滚进沟；村民的话；老耿「那是……俺家」
  {
    const s = Seq("08-1");
    const down = ["Villager2", "Villager3"].filter(id => Keys(s, id).some(k => k.state === "down"));
    if (down.length !== 2 || !Has(s, "muzzle", e => e.actor === "MgGunner")) errors.push("08-1：窗口机枪要打倒两个跑出来的村民");
    if (!PosKeys(s, "Villager1").some(k => k.move === "run")) errors.push("08-1：一个村民要滚进路沟");
    for (const id of ["Villager1", "Villager2", "Villager3", "Villager4", "Villager5"]) if (!ClipKey(s, id, "VilPanicRun")) errors.push(`08-1：${id} 要弓着身子慌跑（VilPanicRun）`);
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
    if (!nier.length || Keys(s, "Nier").find(k => k.clip === "VilPanicRun")?.t > dep + 0.01) errors.push("08-5：妮儿跑的时候要是慌跑（VilPanicRun 从出发起）");
    const reach = ClipKey(s, "Geng", "VilReachPinned"), yank = ClipKey(s, "Yaowa", "VilNraYankBack");
    if (!reach || !yank) errors.push("08-5：老耿伸手喊（VilReachPinned）、幺娃揪腰带拽回（VilNraYankBack）都要有（成对站位由 StageChecks 核）");
    if (reach && !PosKeys(s, "Geng").some(k => k.move === "cut" && k.t > reach.t && k.t < reach.t + 2.6)) errors.push("08-5：老耿被拽回去播完要落到清单 root.end（cut 键）");
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
    if (!through || !Near(hide, Unit("09-3", "Nier"), 1.0)) errors.push("09-2：妮儿要钻过狗洞（爬完切到墙东边）、缩到柴垛后头");
    // 钻狗洞的片段：根在墙西面外 0.25 m 左右、面朝东（−90），播完（3 s）才切到墙那边
    const crawl = ClipKey(s, "Nier", "VilCrawlHole");
    if (!crawl) errors.push("09-2：妮儿要趴下钻狗洞（VilCrawlHole）");
    else {
      const p = PosAt("09-2", s, "Nier", crawl.t);
      if (!p || Math.abs(p.x - 81.0) > 0.12 || Math.abs(p.z - 488) > 0.3) errors.push(`09-2：钻洞的根要在狗洞西口（x≈81.0, z≈488），实际 (${p?.x}, ${p?.z})`);
      if (!through || through.t < crawl.t + 2.9) errors.push("09-2：爬过去的那一下要等片段播完（3 s）再切");
    }
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
    const climb = ClipKey(s, "CellarMan", "VilHandsUpClimbOut"), stabbed = ClipKey(s, "CellarMan", "VilStabbedFall"), thrust = ClipKey(s, "CellarIja2", "VilIjaBayonetThrust");
    if (!climb) errors.push("09-3：汉子要举着手从窖里爬出来（VilHandsUpClimbOut）");
    if (!stabbed || !thrust) errors.push("09-3：汉子刚爬出来就要被刺刀捅倒（VilIjaBayonetThrust + VilStabbedFall，成对站位由 StageChecks 核）");
    const climbS = table.village?.clips?.VilHandsUpClimbOut?.duration ?? 5.0;
    if (climb && stabbed && stabbed.t < climb.t + climbS) errors.push(`09-3：要爬完站直举着手（片段 ${climbS} s）才捅`);
    if (stabbed && !stabbed.clipHold) errors.push("09-3：VilStabbedFall 末帧是尸体，要 clipHold 停住");
    // 爬出窖的根（V2 清单 stage cellarPit：坑口沿外 0.10 m、背对窖口；网格里坑口沿在坑心外 1.0 m → 根离坑心 1.1 m）：三个人起步时都在窖沿外、骨盆（根后 0.55）在坑里
    const st = table.village?.stages?.cellarPit;
    const climbers = [["CellarMan", climb], ["CellarWife", ClipKey(s, "CellarWife", "VilHandsUpClimbOut")], ["CellarGranny", ClipKey(s, "CellarGranny", "VilHandsUpClimbOut")]];
    for (const [id, k] of climbers) {
      if (!k) { errors.push(`09-3：${id} 也要举着手爬出来`); continue; }
      const p = PosAt("09-3", s, id, k.t), yaw = Keys(s, id).filter(x => Number.isFinite(x.yawDeg) && x.t <= k.t + 0.01).at(-1)?.yawDeg;
      const d = p ? Math.max(Math.abs(p.x - CELLAR.x), Math.abs(p.z - CELLAR.z)) : NaN;   // 到坑心的「方格」距离：坑口沿是坑心外 1.0 m 的正方形
      if (!(d >= 1.0 + (st?.wallBehindM ?? 0.1) - 0.02 && d <= 1.25)) errors.push(`09-3：${id} 爬出窖的根要在坑口沿外 0.1 m（离坑心 1.1 m 上下），实际 ${R(d)} m（(${p?.x}, ${p?.z})）`);
      if (!Number.isFinite(yaw)) errors.push(`09-3：${id} 的根要写明朝向（yawDeg，背对窖口）`);
      else {
        const away = Math.atan2(-(p.x - CELLAR.x), -(p.z - CELLAR.z)) * 180 / Math.PI;   // 从坑心指向根的方向（0 北、+90 西）
        if (Math.abs(WrapDeg(yaw - away)) > 25) errors.push(`09-3：${id} 要背对窖口（朝 ${R(away)}°），实际 ${yaw}°`);
        const pelvis = Fwd(p, yaw, -(st?.startPelvis?.z ?? 0.55));
        if (Math.max(Math.abs(pelvis.x - CELLAR.x), Math.abs(pelvis.z - CELLAR.z)) > 0.8) errors.push(`09-3：${id} 起步时骨盆（根后 0.55 m）要在坑里，实际离坑心 ${R(Math.max(Math.abs(pelvis.x - CELLAR.x), Math.abs(pelvis.z - CELLAR.z)))} m`);
      }
    }
    // 三个人一个爬完另一个才上（同一个口子）；汉子爬完切到 root.end（根前 0.38）再被捅
    const order = climbers.map(([, k]) => k?.t).filter(t => t !== undefined).sort((a, b) => a - b);
    for (let i = 1; i < order.length; i++) if (order[i] - order[i - 1] < climbS - 1.5) errors.push(`09-3：两个人爬出窖至少隔 ${R(climbS - 1.5)} s（${order[i - 1]} → ${order[i]}）`);
    if (climb && stabbed) {
      const p0 = PosAt("09-3", s, "CellarMan", climb.t), p1 = PosAt("09-3", s, "CellarMan", stabbed.t);
      const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z), want = Math.abs(st?.end?.z ?? 0.38);
      if (Math.abs(moved - want) > 0.08) errors.push(`09-3：汉子爬完要切到清单 root.end（根前 ${want} m）再被捅，实际挪了 ${R(moved)} m`);
    }
    if (!HasLine(s, "LeaderCallsMen.01")) errors.push("09-3：前屋的分队长要吼着调人");
    if (!ClipKey(s, "Leader", "VilIjaShoutPoint")) errors.push("09-3：分队长调人要指着吼（VilIjaShoutPoint）");
    const s4 = Seq("09-4");
    const bundleOn = Keys(s4, "Bundle").find(k => k.visible === true), fling = ClipKey(s4, "CellarIja2", "VilIjaBayonetLiftFling");
    if (!bundleOn) errors.push("09-4：襁褓占位要在挑起来甩到窖沿时露面");
    if (!fling) errors.push("09-4：挑襁褓要用 VilIjaBayonetLiftFling");
    else if (bundleOn && (bundleOn.t < fling.t + 1.4 || bundleOn.t > fling.t + 1.8)) errors.push("09-4：襁褓要在甩出去那一下（片段 1.5 s）露面");
    // 婴儿哭（babyCry 3.53 s）：扯襁褓前就在哭，一刺刀下去（片段 0.5 s）就断 —— 文件尾对齐扎下去那一刻（±0.15 s），从老太太怀里放
    const cry = s4.events.find(e => e.type === "sfx" && e.name === "babyCry");
    if (!cry) errors.push("09-4：孩子要在哭（babyCry）");
    else if (fling) {
      const stabAt = fling.t + 0.5, end = cry.t + SFX_FILE.babyCry;
      if (Math.abs(end - stabAt) > 0.15) errors.push(`09-4：婴儿哭要在刺刀扎下去那一刻（${R(stabAt)} s）断，文件放完是 ${R(end)} s`);
      if (cry.t > fling.t - 1.0) errors.push("09-4：扯襁褓前孩子就得在哭（哭声至少比挑起来早 1 s 起）");
      const granny = PosAt("09-4", s4, "CellarGranny", cry.t);
      if (!Near(cry, granny, 1.0)) errors.push("09-4：婴儿哭要从老太太怀里（她身边 1 m 内）放");
    }
    if (!Keys(s4, "CellarGranny").some(k => k.state === "down")) errors.push("09-4：老太太要炸在窖里");
    if (!ClipKey(s4, "CellarGranny", "VilKneelCrawlToPit")) errors.push("09-4：老太太要跪着往窖里爬（VilKneelCrawlToPit）");
    const lob = ClipKey(s4, "CellarIja1", "VilIjaHelmetGrenadeLob"), blast = s4.events.find(e => e.type === "explosion" && Near(e, { x: 90.5, z: 499.5 }, 1.0));
    if (!lob || !blast) errors.push("09-4：要有磕钢盔扔手榴弹（VilIjaHelmetGrenadeLob）和窖里的爆炸");
    else if (blast.t < lob.t + 1.7 || blast.t > lob.t + 2.4) errors.push("09-4：手榴弹 1.2 s 脱手飞进窖里，闷响要在片段 1.7–2.4 s");
    if (!ClipKey(s4, "CellarIja3", "VilIjaDragByArm") || !ClipKey(s4, "CellarWife", "VilDraggedByArm")) errors.push("09-4：拖媳妇要用 VilIjaDragByArm + VilDraggedByArm（成对站位由 StageChecks 核）");
    if (!PosKeys(s4, "CellarIja3").some(k => k.move === "drag") || !PosKeys(s4, "CellarWife").some(k => k.move === "drag")) errors.push("09-4：拖的两人都要倒退着走（move drag）");
    if (!PosKeys(s4, "CellarIja3").some(k => k.x > 105)) errors.push("09-4：拖人的鬼子要把媳妇拖进偏屋");
    if (!PosKeys(s4, "CellarIja1").some(k => k.x > 94 && k.z < 492)) errors.push("09-4：拎手榴弹的扔完要跑去前屋");
    if (!PosKeys(s4, "Nier").some(k => k.move === "walk" && k.x < 83)) errors.push("09-4：妮儿要从柴垛后头挪到门边");
    if (!ClipKey(s4, "Nier", "VilCowerWhimper")) errors.push("09-4：妮儿挪到门边要蹲着捂嘴发抖（VilCowerWhimper）");
    if (!ClipKey(s4, "CellarIja2", "VilIjaPissStand")) errors.push("09-4：留下的看守走到尸体边就该开始撒尿（VilIjaPissStand）");
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
    // 拔门闩（VilUnboltDoor：拉开 1.3 s、推门 1.7 s）→ 门开的信号在 1.3–2.0 s 之间；拔之前她蹲着、拔完回头
    const unbolt = ClipKey(s, "Nier", "VilUnboltDoor"), opened = SignalT(s, "SideGateOpen");
    if (!unbolt) errors.push("09-5：妮儿要拔门闩（VilUnboltDoor）");
    else {
      if (opened === undefined || opened < unbolt.t + 1.3 || opened > unbolt.t + 2.0) errors.push("09-5：门开的信号要落在拔门闩片段的 1.3–2.0 s");
      const p = PosAt("09-5", s, "Nier", unbolt.t);
      if (!p || p.x < 81.9 || p.x > 82.15 || Math.abs(p.z - 500) > 0.6) errors.push(`09-5：拔门闩的人要站在门板里侧 0.28 m（x≈82.03），实际 (${p?.x}, ${p?.z})`);
    }
    // 撒尿的看守：停住段每 1.9 s 重起一遍，最后一遍 clipHold 走出口（系裤子、半转头），出口放完（3 s）才动身
    const piss = ClipKeys(s, "CellarIja2", "VilIjaPissStand");
    if (piss.length < 4) errors.push(`09-5：撒尿的停住段要重起几遍（VilIjaPissStand 键 ≥ 4，现在 ${piss.length}）`);
    const lastPiss = piss.at(-1);
    if (!lastPiss?.clipHold || (go.length && go[0].t < lastPiss.t + 2.9)) errors.push("09-5：最后一遍撒尿要 clipHold 走出口，系好裤子（3 s）才往偏屋走");
    if (lastPiss && lastPiss.clipRelease !== 2) errors.push("09-5：最后一遍撒尿要 clipRelease 2（停住段 2 s 处放开，接着放系裤子回头的出口）");
    for (let i = 1; i < piss.length; i++) if (piss[i].t - piss[i - 1].t > 2.05) errors.push(`09-5：撒尿片段 ${piss[i - 1].t} → ${piss[i].t} s 之间会露出出口（间隔 > 2 s）`);
    const cower = ClipKey(s, "Nier", "VilCowerWhimper");
    if (!cower || whimper === undefined || cower.t > whimper) errors.push("09-5：妮儿呜咽前要蹲着捂嘴发抖（VilCowerWhimper）");
  }
  // 09-6：攥衣角、「屁股对到老子」、蹲在 (86,497) 看前屋南门、石磨老汉说明字、第二次呜咽 + 捂嘴、响了才挪
  {
    const s = Seq("09-6");
    if (!Has(s, "caption", e => /衣角/.test(e.text))) errors.push("09-6：妮儿攥衣角往后坠要有说明字");
    if (Keys(s, "Nier")[0]?.clip !== "VilClingHem") errors.push("09-6：开场妮儿就攥着衣角（第一个键 VilClingHem）");
    if (!HasLine(s, "ButtToMe.01")) errors.push("09-6：要有「屁股对到老子」");
    const sight = s.camera.find(c => c.eye && Near(c.eye, { x: 86, z: 497 }, 0.4) && c.eye.stance === "crouch");
    if (!sight) errors.push("09-6：要蹲在 (86,497) 透过前屋南门看机枪组的后背");
    if (!Has(s, "caption", e => /石磨/.test(e.text))) errors.push("09-6：石磨上绑着的老汉要有说明字");
    if (!HasLine(s, "NierWhimperAgain.01") || !Has(s, "caption", e => /捂嘴/.test(e.text))) errors.push("09-6：第二次呜咽与捂嘴说明字");
    const bursts = Bursts(s), moves = Moves(s).filter(c => c.t > 4);
    if (moves.length < 3) errors.push("09-6：贴西墙往前屋摸要分 ≥3 段");
    for (const m of moves) if (!bursts.some(b => m.t - b >= 0 && m.t - b < 2.5)) errors.push(`09-6：${m.t} s 的挪动前 2.5 s 内没有机枪响（要响了才走）`);
    if (!PosKeys(s, "Nier").some(k => k.move === "walk" && k.z < 490)) errors.push("09-6：妮儿要跟着挪到灶屋跟前");
    if (ClipKeys(s, "Nier", "VilClingHem").length < 2) errors.push("09-6：妮儿要攥着衣角往后坠（VilClingHem；第二次呜咽完再攥上），站位由 StageChecks 核");
    if (!ClipKey(s, "Nier", "VilCowerWhimper")) errors.push("09-6：第二次呜咽要蹲着捂嘴发抖（VilCowerWhimper）");
  }
  // 09-7：罐子掉地、肩撞扑倒、压刺刀、咬手腕（慢动作）、拔大刀
  {
    const s6 = Seq("09-7");
    if (!Has(s6, "caption", e => /罐/.test(e.text))) errors.push("09-7：罐子掉地要有说明字");
    const lunge = s6.lines.find(l => l.line === "KitchenLunge.01"), bite = s6.lines.find(l => l.line === "KitchenBitten.01");
    if (!lunge || !bite || bite.t < lunge.t + 4) errors.push("09-7：先扑出来吼，压一会儿刺刀，再被咬惨叫");
    // 罐子掉地：jarShatter 在「罐子掉地」的说明字那一刻、从妮儿脚下放；鬼子听见才扑出来
    const jar = s6.events.find(e => e.type === "sfx" && e.name === "jarShatter"), jarCap = s6.events.find(e => e.type === "caption" && /罐/.test(e.text));
    if (!jar) errors.push("09-7：罐子掉地要用 jarShatter");
    else {
      if (!jarCap || Math.abs(jar.t - jarCap.t) > 0.3) errors.push("09-7：罐子摔碎的声音要和「罐子掉地」的说明字同时");
      if (!Near(jar, PosAt("09-7", s6, "Nier", jar.t), 0.6)) errors.push("09-7：罐子摔碎要在妮儿脚下");
      if (lunge && lunge.t < jar.t) errors.push("09-7：鬼子要听见罐子响才扑出来");
    }
    if (!s6.camera.some(c => c.eye?.stance === "prone" && c.eye.pitchDeg > 20)) errors.push("09-7：要有倒地仰视的镜头");
    if (!Has(s6, "caption", e => /大刀/.test(e.text))) errors.push("09-7：拔大刀砍的玩家操作时刻要有说明字");
    if (!Keys(s6, "KitchenIja").some(k => k.state === "down")) errors.push("09-7：鬼子要倒");
    // 扑出来：肩撞（VilIjaShoulderCharge，根往前 1.2 m）在灶屋门里起播；之后切到压刺刀的位置
    const charge = ClipKey(s6, "KitchenIja", "VilIjaShoulderCharge");
    if (!charge) errors.push("09-7：鬼子要从门里肩膀往前撞出来（VilIjaShoulderCharge）");
    else { const p = PosAt("09-7", s6, "KitchenIja", charge.t); if (!p || p.x > 89.75 || Math.abs(p.z - 483.5) > 0.5) errors.push(`09-7：肩撞要从灶屋门里（x ≤ 89.75、z≈483.5）起，实际 (${p?.x}, ${p?.z})`); }
    // 压刺刀（VilIjaPinBayonet 停住段重起 ≥ 2 遍，最后一遍 clipHold 走被咬的出口）与咬手腕（VilBiteWrist，晚 1.5 s 起、0.5 s 咬中）
    const pins = ClipKeys(s6, "KitchenIja", "VilIjaPinBayonet"), biteKey = ClipKey(s6, "Nier", "VilBiteWrist");
    if (pins.length < 2 || !pins.at(-1).clipHold) errors.push("09-7：压刺刀要重起几遍、最后一遍 clipHold（被咬甩手后仰）");
    if (pins.length && pins.at(-1).clipRelease !== 2) errors.push("09-7：最后一遍压刺刀要 clipRelease 2（2 s 被咬时放开停住段，放甩手后仰的出口）");
    if (!biteKey) errors.push("09-7：妮儿要咬手腕（VilBiteWrist，成对站位由 StageChecks 核）");
    const biteAt = biteKey ? biteKey.t + 0.5 : undefined;
    if (biteKey && pins.length && Math.abs(biteKey.t - (pins.at(-1).t + 1.5)) > 0.1) errors.push("09-7：咬手腕要比最后一遍压刺刀晚 1.5 s 起播（她 0.5 s 咬中 = 他 2.0 s 停住段结束）");
    // 慢动作：约 1.5 s、0.3 倍、带渐变，咬中那一刻在窗口里，窗口里没台词；惨叫在窗口之后
    const slow = s6.slowmo || [];
    if (slow.length !== 1) errors.push(`09-7：要有一个慢动作窗口（slowmo），现在 ${slow.length}`);
    const w = slow[0];
    if (w) {
      if (Math.abs(w.dur - 1.5) > 0.2) errors.push(`09-7：慢动作约 1.5 s，现在 ${w.dur}`);
      if (Math.abs(w.rate - 0.3) > 0.05) errors.push(`09-7：慢动作 0.3 倍，现在 ${w.rate}`);
      if (!(w.fade > 0) || w.fade > w.dur / 2) errors.push("09-7：慢动作进出要带渐变（0 < fade ≤ dur/2）");
      if (biteAt !== undefined && !(biteAt >= w.t + (w.fade ?? PREVIZ_SLOWMO.fadeDefaultS) - 0.01 && biteAt <= w.t + w.dur - (w.fade ?? 0))) errors.push(`09-7：咬中那一刻（${R(biteAt)} s）要在慢动作的平台段里（${w.t}–${R(w.t + w.dur)}，渐变各 ${w.fade}）`);
      for (const l of s6.lines) if (l.t >= w.t && l.t < w.t + w.dur) errors.push(`09-7：慢动作里不排台词（${l.line} @${l.t}）`);
      if (bite && bite.t < w.t + w.dur) errors.push("09-7：惨叫要等慢动作过了再响");
    }
    if (!ClipKey(s6, "Nier", "VilCowerWhimper")) errors.push("09-7：砍完妮儿要蹲在地上发抖（VilCowerWhimper）");
  }
  // 10-1：从背后打掉机枪组和过道里的人；班长「机枪哑了！冲！」从大车后冲上来；剩一个往东街跑
  {
    const s = Seq("10-1");
    if (!Has(s, "muzzle", e => e.actor === "player")) errors.push("10-1：玩家要从背后开打");
    for (const id of ["MgGunner", "MgLoader", "Leader", "GateIja1"]) if (!Keys(s, id).some(k => k.state === "down")) errors.push(`10-1：${id} 要倒`);
    if (!HasLine(s, "MgSilenced.01")) errors.push("10-1：班长要吼「机枪哑了！冲！」");
    const luo = PosKeys(s, "Luo").filter(k => k.move === "run");
    if (!luo.length || !luo.some(k => k.z > 450)) errors.push("10-1：班长要从大车后头冲上来");
    const wave = ClipKey(s, "Luo", "VilNraWaveCharge"), charge = LineT(s, "MgSilenced.01");
    if (!wave || charge === undefined || wave.t < charge - 0.1 || wave.t > charge + 1.5) errors.push("10-1：班长喊「冲！」时要跳起来一挥手往前冲（VilNraWaveCharge 跟着台词起）");
    if (wave && !PosKeys(s, "Luo").some(k => k.move === "cut" && Math.abs(k.t - (wave.t + 1.6)) < 0.05)) errors.push("10-1：挥手冲播完（1.6 s）要把班长挪到清单 root.end 再接着跑");
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
    const bash = s.events.filter(e => e.type === "sfx" && e.name === "gateSmash").sort((a, b) => a.t - b.t);
    if (bash.length < 3) errors.push("10-4：砸门声至少三处（gateSmash：枪托两下 + 一脚踹）");
    for (let i = 1; i < bash.length; i++) if (bash[i].x > bash[i - 1].x + 0.01) errors.push("10-4：砸门声要一个院子一个院子往西挪");
    // 砸门的片段（VilIjaGateSmash：砸 0.45 / 0.95 s、踹 1.6 s）：三道门各一个人，从东往西；最后北角院门那一踹门就倒（信号）；
    // 砸门声文件（2.33 s）里第一下在 0.07 s，要对齐片段第一下砸（0.45 s）→ 文件从片段起播 + 0.38 s 放，一道门一遍
    const smashes = ["NorthIja1", "NorthIja2", "NorthIja3", "NorthIja4"].flatMap(id => ClipKeys(s, id, "VilIjaGateSmash").map(k => ({ id, k, p: PosAt("10-4", s, id, k.t) }))).sort((a, b) => a.k.t - b.k.t);
    if (smashes.length < 3) errors.push(`10-4：三道门都要有人枪托砸门（VilIjaGateSmash），现在 ${smashes.length}`);
    for (let i = 1; i < smashes.length; i++) if (smashes[i].p.x > smashes[i - 1].p.x) errors.push("10-4：砸门要一个院子一个院子往西");
    for (const sm of smashes) { const h = sm.k.t + 0.45 - SFX_FILE.gateSmashFirstHit; if (!bash.some(b => Math.abs(b.t - h) < 0.06 && Near(b, sm.p, 1.2))) errors.push(`10-4：${sm.id} 砸门那一下（片段 0.45 s = 文件 ${R(h)} s 起）要有 gateSmash 落在门上`); }
    if (bash.length !== smashes.length) errors.push(`10-4：一道门一遍砸门声（${bash.length} 声 / ${smashes.length} 道门）`);
    const on = SignalT(s, "NorthYardGatesBroken");
    const pocket = smashes.find(sm => sm.id === "NorthIja1");
    if (!pocket || Math.abs(pocket.p.x - POCKET_GATE.x) > 0.3 || pocket.p.z > POCKET_GATE.z - 0.5 || pocket.p.z < POCKET_GATE.z - 0.95 || pocket.p.yawDeg !== 180) errors.push("10-4：砸北角院门的要站在门板北边 0.55 m（院里）、面朝南");
    if (!pocket || on === undefined || Math.abs(on - (pocket.k.t + 1.6)) > 0.3) errors.push("10-4：北角院门要在那一踹（片段 1.6 s）倒下（信号）");
    for (const id of ["NorthIja3", "NorthIja4"]) { const run = PosKeys(s, id).filter(k => k.move === "run"); if (on === undefined || !run.length || run[0].t < on || !Near(run.at(-1), Unit("10-4", id), 0.6)) errors.push(`10-4：门倒了以后 ${id} 要穿院子链钻到位`); }
    if (!PosKeys(s, "NorthIja1").some(k => k.t > (on ?? 0) && Near(k, Unit("10-4", "NorthIja1"), 0.6))) errors.push("10-4：砸北角院门的那个门倒了要蹲到院门外端枪");
    for (const id of ["LiuWencai", "Yaowa"]) if (!Near(PosKeys(s, id).at(-1), Unit("10-4", id), 0.6)) errors.push(`10-4：${id} 要蹲到北角口上堵`);
  }
  // 10-5：南边翻墙、何有田去守后门；后送队进院（担架到过道 / 后院）；妮儿抱老耿的腿；老耿看一眼
  {
    const s = Seq("10-5");
    for (const l of ["EastEndOfficer.04", "HoldEastStreet.02"]) if (!HasLine(s, l)) errors.push(`10-5：要有台词 ${l}`);
    if (!Near(PosKeys(s, "HeYoutian").at(-1), Unit("10-5", "HeYoutian"), 0.6)) errors.push("10-5：何有田要去守后门");
    if (!Near(PosKeys(s, "SouthIja1").at(-1), { x: 126, z: 490 }, 1.5)) errors.push("10-5：南边要有人翻南院墙");
    // 翻墙（VilIjaClimbWall：墙面在根前 0.35 m，落在根前 1.05 m）：根在南墙（z 490、厚 0.3）北边 0.5 m、面朝南，播完（3.4 s）切到墙南边
    const climb = ClipKey(s, "SouthIja1", "VilIjaClimbWall");
    if (!climb) errors.push("10-5：翻墙要用 VilIjaClimbWall");
    else {
      const p = PosAt("10-5", s, "SouthIja1", climb.t);
      if (!p || Math.abs(p.x - 126) > 0.3 || Math.abs(p.z - 489.5) > 0.08 || p.yawDeg !== 180) errors.push(`10-5：翻墙的根要在南墙北边 0.5 m（z≈489.5）、面朝南，实际 (${p?.x}, ${p?.z}, ${p?.yawDeg})`);
      const over = PosKeys(s, "SouthIja1").find(k => k.move === "cut" && k.t > climb.t && k.z > 490.3);
      if (!over || over.t < climb.t + 3.3) errors.push("10-5：翻过墙那一下要等片段播完（3.4 s）切到墙南边");
    }
    if (!PosKeys(s, "LitterDonggua").some(k => k.z > 478) || !PosKeys(s, "Litter01").some(k => k.z > 470)) errors.push("10-5：担架要从大门过道抬进院子");
    const geng = Unit("10-5", "Geng");
    if (!PosKeys(s, "Nier").some(k => k.move === "run" && Near(k, geng, 1.5))) errors.push("10-5：妮儿要扑过去抱住老耿的腿");
    const hug = ClipKey(s, "Nier", "VilHugLegs");
    if (!hug || !hug.clipHold) errors.push("10-5：抱腿要用 VilHugLegs 且 clipHold（抽泣着抱着不放；站位由 StageChecks 核）");
    if (!ClipKey(s, "Helper01", "VilNraCarryOnBack") || !ClipKey(s, "Walker01", "VilRideOnBack")) errors.push("10-5：后送队进院要有一对背着走的（Helper01 + Walker01）");
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
    // 挪缸开门（VilPushVat V2，清单 stage vatDoor）：老耿站在缸西边 1.05 m（根 (96.95, 504)）面朝东，缸推到位 2.8 s（信号 BackVatMoved），
    // 拔门闩 5.55 s、扒住门板 5.75 s、松手 6.3 s、门板到 90° 6.6 s：门开的信号 BackDoorOpen 落在 5.75–6.6 s（拉门的过程里）；播完切到 root.end
    const push = ClipKey(s4, "Geng", "VilPushVat"), vatMoved = SignalT(s4, "BackVatMoved"), opened = SignalT(s4, "BackDoorOpen");
    const vd = table.village?.stages?.vatDoor, ev = Object.fromEntries((table.village?.clips?.VilPushVat?.events || []).map(e => [e.kind, e.t]));
    if (!push) errors.push("10-6：挪缸开门要用 VilPushVat");
    else {
      const p = PosAt("10-6", s4, "Geng", push.t);
      const want = { x: 98 + (vd?.vatStart?.z ?? -1.05), z: 504 };
      if (!p || Math.abs(p.x - want.x) > 0.05 || Math.abs(p.z - want.z) > 0.05 || p.yawDeg !== -90) errors.push(`10-6：挪缸的根要在缸西边 1.05 m（(${R(want.x)}, ${want.z})）、面朝东（−90），实际 (${p?.x}, ${p?.z}, ${p?.yawDeg})`);
      if (vatMoved === undefined || Math.abs(vatMoved - (push.t + (ev.vatMoved ?? 2.8))) > 0.1) errors.push(`10-6：缸挪开的信号要在片段 vatMoved（${ev.vatMoved ?? 2.8} s）那一刻切，实际 ${vatMoved === undefined ? "没有" : R(vatMoved - push.t)}`);
      if (opened === undefined || opened < push.t + (ev.doorGrab ?? 5.75) - 0.01 || opened > push.t + (ev.doorOpen ?? 6.6) + 0.01) errors.push(`10-6：门开的信号要落在拉门那一段（片段 ${ev.doorGrab ?? 5.75}–${ev.doorOpen ?? 6.6} s），实际 ${opened === undefined ? "没有" : R(opened - push.t)}`);
      if (vatMoved !== undefined && opened !== undefined && opened - vatMoved < 2.5) errors.push("10-6：缸先挪开、门后开，中间隔着走到门前拔门闩那几秒");
      const dur = table.village?.clips?.VilPushVat?.duration ?? 6.8;
      const cut = PosKeys(s4, "Geng").find(k => k.move === "cut" && Math.abs(k.t - (push.t + dur)) < 0.05);
      if (!cut) errors.push(`10-6：VilPushVat 播完（${dur} s）要把老耿切到清单 root.end`);
      else {
        const want2 = Fwd(p, p.yawDeg, -(vd?.end?.z ?? -0.9), vd?.end?.x ?? 0.55);
        if (Math.hypot(cut.x - want2.x, cut.z - want2.z) > 0.08 || Math.abs(WrapDeg((cut.yawDeg ?? 0) - WrapDeg(p.yawDeg + (vd?.end?.yawDeg ?? -90)))) > 4) errors.push(`10-6：root.end 该在 (${R(want2.x)}, ${R(want2.z)}) 朝 ${R(WrapDeg(p.yawDeg + (vd?.end?.yawDeg ?? -90)))}°，实际 (${cut.x}, ${cut.z}) 朝 ${cut.yawDeg}°`);
      }
      // 妮儿、顺子的眼睛都不在缸的推道上（z 503.6…504.4、x 97.6…100.1）
      const nier = PosAt("10-6", s4, "Nier", push.t);
      if (nier && nier.x > 97.4 && nier.x < 100.3 && Math.abs(nier.z - 504) < 0.7) errors.push("10-6：妮儿别蹲在缸的推道上");
    }
  }
  // 大段的镜头轨：每一刻都能采样（没有空档让 SamplePrevizCamera 报错；飞机锚按那一秒的机身位置）
  const ground = layout.terrainSampler;
  for (const n of norm.sequences) {
    const kf = config.keyframes.find(k => k.id === n.keyframe);
    for (let t = 0; t <= n.durationS; t += 1.0) {
      try {
        const shot = SamplePrevizCamera(n.camera, t, CameraResolver(kf, n, ground, t));
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
