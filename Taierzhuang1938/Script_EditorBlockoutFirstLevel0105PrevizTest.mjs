// ===========================================================================
// Script_EditorBlockoutFirstLevel0105PrevizTest.mjs —— FirstLevel0105 预演数据的纯 node 自检
//
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105PrevizTest.mjs           → 查 Blockout/FirstLevel0105.previz.json
//   node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105PrevizTest.mjs --fresh   → 查生成器当场生成的那份（并核对两次生成逐字相同）
//
// 查：运行时包的 ValidateBlockoutPreviz（关键帧 / 单位 / 台词 id / 字段）；每个片段在那具骨架上烘过
// （有 castId 的按 Data_FirstLevelSpeakingCast 的骨架，没有 castId 的只许五具骨架都有的通用片段）；
// 同一段里台词不互相压；演员走位点在场地范围内、不落在沟壁斜坡上；走位要求的速度不离谱；
// 说话的人在那一刻是可见的。
// 10-18 第三轮：05-3 顺子替身用投弹片段（throw）甩那捆手榴弹、落点后才炸；冬瓜在被子上不播片段、不转身；
// 04-3…05-4 在桥底下（板桥脚印内、沟底比桥面低 1 m 以上）的人任何时刻都是蹲 / 趴（关键帧布设 + 预演每 0.1 s + 关键帧之间的过渡）。
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { CharacterClipModelId } from "./Data_CharacterSelection.mjs";
import { SamplePrevizActor, NormalizeBlockoutPreviz, PREVIZ_THROW } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { L0105_BRIDGE } from "./Data_EditorBlockoutFirstLevel0105Space.mjs";
import { BLOCKOUT_PREVIZ_CLIP_LIBRARIES, PREVIZ_LYING_CLIPS } from "./Data_BlockoutPrevizClips.mjs";
import { ReadBlockoutSceneDocSync } from "./Script_SceneNode.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const Load = f => JSON.parse(readFileSync(join(HERE, f), "utf8"));
const R = v => Math.round(v * 100) / 100;

const MODEL_ID = { nra: { 1: "TengxianNra02", 4: "TengxianNra05", 5: "TengxianNra06" }, ija: { 0: "TengxianIja01", 1: "TengxianIja02", 2: "TengxianIja03", 5: "TengxianIja06" } };
const SPEED = { walk: 1.4, run: 3.5, crawl: 0.5, drag: 0.9 };

function ClipTable() {
  const lib = Load("Animation/OpeningStoryboards/Data_OpeningStoryboardsAnimation.json");
  const byModel = new Map(lib.models.map(m => [m.id, new Set(m.clipIds)]));
  const durations = new Map(Object.entries(lib.clips).map(([k, c]) => [c.name || k, c.duration]));
  const metaTable = new Map(Object.entries(lib.clips));
  const sets = [...byModel.values()];
  const common = new Set([...sets[0]].filter(c => sets.every(s => s.has(c))));
  // 预演额外加载的库（Data_BlockoutPrevizClips）：只烘了 TengxianNra02，但五具骨架骨名一致、哪具身体都能播 → 算通用片段。
  // 库还没烘出来（清单不在盘上）就跳过。
  for (const extra of BLOCKOUT_PREVIZ_CLIP_LIBRARIES) {
    const file = join(HERE, extra.base, extra.manifest);
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    for (const [name, meta] of Object.entries(manifest.clips || {})) {
      for (const set of [...sets, common]) set.add(name);
      if (!durations.has(name)) durations.set(name, meta.duration);
      if (!metaTable.has(name)) metaTable.set(name, meta);
    }
  }
  return { byModel, common, durations, meta: metaTable };
}

function ClipSetFor(unit, table) {
  const castId = unit?.castId;
  const spec = castId && FIRST_LEVEL_SPEAKING_CAST[castId];
  if (!spec) return { name: "随机骨架（只许通用片段）", clips: table.common };
  const modelId = CharacterClipModelId(MODEL_ID[spec.actorKind]?.[spec.modelVariant]);
  return { name: modelId, clips: table.byModel.get(modelId) || new Set() };
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
  const scene = ReadBlockoutSceneDocSync("FirstLevel0105");
  const ground = HeightGridSampler(scene.terrain);
  const B = scene.bounds;
  const Slope = (x, z) => {
    const h = [ground(x, z), ground(x + 0.35, z), ground(x - 0.35, z), ground(x, z + 0.35), ground(x, z - 0.35)];
    return Math.max(...h) - Math.min(...h);
  };
  const PointCheck = (at, p) => {
    if (!(p.x >= B.minX && p.x <= B.maxX && p.z >= B.minZ && p.z <= B.maxZ)) errors.push(`${at} 出了场地：(${p.x}, ${p.z})`);
    else if (Slope(p.x, p.z) > 0.45) warnings.push(`${at} 落在斜坡 / 沟壁上（0.35 m 内高差 ${R(Slope(p.x, p.z))} m）：(${p.x}, ${p.z})`);
  };
  for (const seq of doc.sequences) {
    const kf = config.keyframes.find(k => k.id === seq.keyframe);
    const at = `预演 ${seq.keyframe}`;
    if (!kf) { errors.push(`${at}：关键帧不存在`); continue; }
    const units = new Map((kf.units || []).map(u => [u.id, u]));
    const clipsUsed = new Set();
    // 演员
    for (const a of seq.actors) {
      const base = a.spawn || units.get(a.id);
      if (!base) { errors.push(`${at}：${a.id} 不在关键帧里也没写 spawn`); continue; }
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
          PointCheck(kat, k);
          for (const p of k.path || []) PointCheck(`${kat} 途经点`, p);
          const pts = [prev, ...(k.path || []), k];
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
      if (a.spawn) PointCheck(`${at} ${a.id} spawn`, a.spawn);
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
    // 镜头点
    for (const c of seq.camera) {
      for (const key of ["from", "to"]) if (c[key] && c[key].x !== undefined) { const p = c[key]; if (!(p.x >= B.minX && p.x <= B.maxX && p.z >= B.minZ && p.z <= B.maxZ)) errors.push(`${at} 镜头@${c.t}.${key} 出了场地`); }
      if (c.t + c.dur > seq.durationS + 0.01) warnings.push(`${at} 镜头@${c.t} 在段落结束后才结束`);
    }
    for (const e of seq.events) if (e.t > seq.durationS + 0.01) warnings.push(`${at} 事件 ${e.type}@${e.t} 在段落结束之后`);
    rows.push(`${seq.keyframe} · ${seq.durationS} s · 镜头 ${seq.camera.length} · 台词 ${seq.lines.length} · 片段 ${[...clipsUsed].sort().join("、") || "（无）"}`);
  }
  if (doc.sequences.length !== config.keyframes.length) errors.push(`预演 ${doc.sequences.length} 段，关键帧 ${config.keyframes.length} 个`);
  TalkPostureChecks(doc, config, table, errors);
  await RestBeatChecks(doc, config, errors);
  await DesignChecks(doc, config, errors);
  return { errors, warnings, rows };
}

/**
 * 说话姿态（2026-10-19，用户：「我看到一个讲话还拿着枪的很出戏」）：每句有说话人的台词开始那一刻，说话人要么在播片段
 * （说话 / 手势 / 坐着 / 跪着 / 审问这类，见 Data_BlockoutPrevizClips 与 docs/Data_EditorBlockout.md §14.4），要么倒在地上、
 * 在扔手榴弹，要么前后 1.5 s 内自己开过枪（打仗当下端着枪喊）；跑着喊、手上没据枪的也算。端着枪（aim）又没在开枪 → 错。
 * 片段过了时长的算法同运行时：循环片段一直放，不循环的过了时长没写 clipHold 就清掉。
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
      const st = a ? SamplePrevizActor(a, l.t, base, { clipDuration }) : { stance: base.stance, aim: !!base.aim, state: base.state, visible: true };
      if (st.visible === false) continue;
      const fired = seq.events.some(e => e.type === "muzzle" && e.actor === id && Math.abs(e.t - l.t) <= TALK_FIRE_WINDOW_S + 1e-6);
      if (st.state === "down" || st.clip || st.throw || fired) continue;
      if (st.moving && !st.aim) continue;
      errors.push(`${seq.keyframe}：${l.line}（${id}@${l.t}）${st.aim ? "端着枪说话、前后 1.5 s 没开枪" : "说话时没播片段（手里拿着枪干站 / 干蹲着）"}`);
    }
  }
}

/**
 * 不打仗的拍子（2026-10-19 第二轮，生成器 PREVIZ_REST_BEATS：01 防炮洞、02末集结处、03-1）：任何人在任何时刻都不许据枪（aim），
 * 也不许蹲着干待着不播片段（会落到原生的端枪戒备）。坡顶守着的兵、日军除外（RestExempt）。两个片段之间不到 0.6 s 的空档
 * （淡入淡出本身约 0.3 s，原生姿态露不出来）不算。
 */
async function RestBeatChecks(doc, config, errors) {
  const gen = await import("./Script_EditorBlockoutFirstLevel0105Previz.mjs");
  const norm = NormalizeBlockoutPreviz(doc);
  for (const seq of norm.sequences) {
    if (!gen.PREVIZ_REST_BEATS[seq.keyframe]) continue;
    const kf = config.keyframes.find(k => k.id === seq.keyframe);
    const units = new Map((kf.units || []).map(u => [u.id, u]));
    const raw = doc.sequences.find(s => s.keyframe === seq.keyframe);
    const ids = new Set([...units.keys(), ...seq.actors.map(a => a.id)]);
    for (const id of ids) {
      const a = seq.actors.find(x => x.id === id), base = a?.spawn || units.get(id);
      if (!base || (base.kind && base.kind !== "soldier") || gen.RestExempt(id, base)) continue;
      const aimKey = raw.actors.find(x => x.id === id)?.keys.find(k => k.aim === true);
      if ((!a && base.aim) || aimKey) errors.push(`${seq.keyframe}：${id} 在不打仗的拍子里据枪（aim）${aimKey ? `@${aimKey.t}` : "（关键帧布设）"}`);
      let from = null;
      for (let t = 0; t <= seq.durationS + 1e-6; t += 0.1) {
        const st = a ? SamplePrevizActor(a, t, base, { clipDuration: gen.PrevizClipDuration }) : { stance: base.stance || "stand", state: base.state, visible: true };
        const idle = base.state !== "down" && gen.IdleCrouching(st);
        if (idle && from === null) from = t;
        if ((!idle || t + 0.1 > seq.durationS + 1e-6) && from !== null) {
          if (t - from >= 0.6 || t + 0.1 > seq.durationS + 1e-6 && idle) { errors.push(`${seq.keyframe}：${id} @${R(from)}–${R(t)} s 蹲着干待着（没播片段，会端着枪戒备）`); }
          from = null;
        }
      }
    }
  }
}

/** 10-18 返工的设计口径（只查 FirstLevel0105）：南沿迂回、两人并排拖单被、板桥；2026-10-24 三辆轻装甲车。 */
async function DesignChecks(doc, config, errors) {
  if (doc.level !== "FirstLevel0105") return;
  const Seq = id => doc.sequences.find(s => s.keyframe === id);
  const Keys = (seq, id) => seq?.actors.find(a => a.id === id)?.keys || [];
  // 02-2：台阶那头先打、停火半秒，「打！」从南沿上来；班长从南沿跳进沟里
  {
    const s = Seq("02-2");
    const fire = s.lines.find(l => l.line === "Counter.01")?.t;
    const steps = s.events.filter(e => e.type === "muzzle" && ["HeYoutian", "Squad1"].includes(e.actor)).map(e => e.t);
    if (!steps.length || fire === undefined) errors.push("02-2：要先有台阶那头（何有田 / 弟兄）的枪口火光，再有「打！」");
    else if (fire - Math.max(...steps.filter(t => t < fire)) < 0.5) errors.push("02-2：「打！」之前台阶那头要停火至少半秒");
    const luoXZ = Keys(s, "Luo").filter(k => k.x !== undefined);
    const branchZ = x => 67.1 + (64.5 - 67.1) * (x - 21.9) / (63 - 21.9);
    if (!luoXZ.some(k => k.z - branchZ(k.x) > 3.5) || !luoXZ.some(k => Math.abs(k.z - branchZ(k.x)) < 1.6)) errors.push("02-2：班长要先在南沿上、再跳进沟里");
  }
  // 02-3…02-7：何有田揪被角（carryRole front）往前拖，被子跟着走；02-4…02-6 每段有「后头！」和玩家回身开枪
  for (const id of ["02-4", "02-5", "02-6", "02-7"]) {
    const s = Seq(id);
    if (!Keys(s, "HeYoutian").some(k => k.carryRole === "front")) errors.push(`${id}：何有田要揪着被角（carryRole front）`);
    if (!Keys(s, "Blanket").some(k => k.x !== undefined && k.move === "walk")) errors.push(`${id}：被子要在身后跟着往前滑`);
    if (!Keys(s, "Luo").some(k => k.move === "drag")) errors.push(`${id}：班长要倒退着断后`);
    if (id !== "02-7" && !s.events.some(e => e.type === "muzzle" && e.actor === "player")) errors.push(`${id}：玩家要松手回身开枪`);
  }
  // 05-2：战车压上板桥，震、土从板缝往下漏、说明字
  {
    const s = Seq("05-2");
    const has = (type, f = () => true) => s.events.some(e => e.type === type && f(e));
    if (!has("shake") || !has("sfx", e => e.name === "dirtFall") || !has("smoke", e => e.kind === "SmokeDust") || !has("caption")) errors.push("05-2：车压上板桥要有震屏、dirtFall、落土烟和说明字");
    const tk = Keys(s, "TankA").filter(k => k.x !== undefined);
    if (!tk.some(k => Math.hypot(k.x - 35, k.z - 116) < 0.5)) errors.push("05-2：A 车要经过板桥中间");
  }
  // 2026-10-24 第六版：三辆九四式轻装甲车（没有炮）
  {
    const s34 = Seq("03-4");
    for (const id of ["TankA", "TankB", "TankC"]) {
      const keys = Keys(s34, id);
      const shown = keys.find(k => k.visible === true), last = [...keys].reverse().find(k => k.x !== undefined);
      if (!shown || !last) { errors.push(`03-4：${id} 要在东边麦田里冒出来`); continue; }
      if (!(last.x >= 240 && last.x <= 310 && last.z >= -200 && last.z <= -100)) errors.push(`03-4：${id} 冒出来的地方不在东边麦田 (${last.x}, ${last.z})`);
    }
    if (s34.events.some(e => e.type === "sfx" && e.name === "tankGun") || s34.events.some(e => e.type === "explosion" && e.kind === "tank")) errors.push("03-4：轻装甲车没有炮，不该有炮声 / 炮弹爆炸");
    if (!s34.events.some(e => e.type === "signal" && e.name === "PitShelled" && e.on)) errors.push("03-4：要打开 PitShelled");
    const shelled = s34.events.find(e => e.type === "signal" && e.name === "PitShelled" && e.on);
    if (shelled && !s34.events.some(e => e.type === "explosion" && e.kind === "launcher" && Math.abs(e.t - shelled.t) < 0.3 && Math.hypot(e.x - 0.3, e.z + 10.6) < 1)) errors.push("03-4：胸墙那一截要是掷弹筒弹打塌的（launcher 爆炸在坑沿）");
    if (!s34.events.some(e => e.type === "muzzle" && e.x !== undefined && e.x > 240)) errors.push("03-4：轻装甲车的机枪要扫坑沿（东边田里的枪口火）");
    for (const seq of doc.sequences) if (seq.actors.some(a => a.id === "Tank")) errors.push(`${seq.keyframe}：还有旧的 Tank 演员`);
    // 05：A 过桥、B 全程不过沟（x ≥ 36）、C 在田里趴窝、两个乘员下车；徒步步兵不上桥
    const { L0105_TANKETTES: TK } = await import("./Data_EditorBlockoutFirstLevel0105Space.mjs");
    for (const id of ["05-1", "05-2", "05-3", "05-4"]) {
      const s = Seq(id);
      for (const k of Keys(s, "TankB")) if (k.x !== undefined && k.x < 36) errors.push(`${id}：B 车过了交通沟 (${k.x}, ${k.z})`);
      for (const k of Keys(s, "TankC")) if (k.x !== undefined && Math.hypot(k.x - TK.cStall.x, k.z - TK.cStall.z) > 40) errors.push(`${id}：C 车跑远了 (${k.x}, ${k.z})`);
      for (const k of [...Keys(s, "TankInf1"), ...Keys(s, "TankInf2"), ...Keys(s, "TankInf3")]) if (k.x !== undefined && Math.hypot(k.x - 35, k.z - 116) < 150) errors.push(`${id}：徒步步兵跑到桥边来了`);
    }
    const s51 = Seq("05-1");
    if (!Keys(s51, "TankC").some(k => k.x !== undefined && Math.hypot(k.x - TK.cStall.x, k.z - TK.cStall.z) < 0.5)) errors.push("05-1：C 车要在田里抛锚停住");
    if (!["TankCrewC1", "TankCrewC2"].every(id => Keys(s51, id).some(k => k.visible === true))) errors.push("05-1：C 车的两个乘员要钻出来");
    if (!Keys(Seq("05-2"), "TankB").some(k => k.x !== undefined && Math.hypot(k.x - TK.bStop.x, k.z - TK.bStop.z) < 0.5)) errors.push("05-2：B 车要停在沟东沿");
    if (!Seq("05-2").events.some(e => e.type === "muzzle" && e.x !== undefined && Math.hypot(e.x - TK.bStop.x, e.z - TK.bStop.z) < 2)) errors.push("05-2：B 车停在沟沿上要打机枪");
    if (!Keys(Seq("05-3"), "TankA").some(k => k.x !== undefined && Math.hypot(k.x - 28.7, k.z - 120.1) < 0.5)) errors.push("05-3：A 车要瘫在桥头");
    // 掷弹筒的烟从旧交通沟外的地面上冒（不在沟底）
    const { L0105_PLACES: PL } = await import("./Data_EditorBlockoutFirstLevel0105Space.mjs");
    for (const id of ["03-2", "03-3", "03-4"]) for (const e of Seq(id).events) if (e.type === "smoke" && e.kind === "SmokeWhite" && Math.hypot(e.x - PL.mortarSmoke.x, e.z - PL.mortarSmoke.z) > 0.5) errors.push(`${id}：掷弹筒的烟不在 mortarSmoke 上 (${e.x}, ${e.z})`);
  }
  if (!Seq("05-3").events.some(e => e.type === "signal" && e.name === "TankDisabled" && e.on)) errors.push("05-3：甩手榴弹后要打开 TankDisabled");
  // 10-18 第三轮：05-3 顺子替身播投弹片段（不再拿 PointBlockade 顶），弹落地后才炸、炸在落点
  {
    const s = Seq("05-3"), keys = Keys(s, "Shunzi");
    const th = keys.find(k => k.throw);
    if (!th) errors.push("05-3：顺子替身要用 throw（投弹片段）甩那捆手榴弹");
    else {
      const land = th.t + PREVIZ_THROW.releaseS + (th.throw.flightS ?? 0);
      if (!s.events.some(e => e.type === "explosion" && Math.abs(e.t - land) <= 0.25 && Math.hypot(e.x - th.throw.x, e.z - th.throw.z) < 0.5)) errors.push(`05-3：落点 (${th.throw.x}, ${th.throw.z}) 在 ${R(land)} s 要有爆炸`);
    }
    if (keys.some(k => k.clip === "PointBlockade")) errors.push("05-3：顺子替身不再用 PointBlockade 顶投弹");
  }
  // 冬瓜在被子上（02-3 被子铺开起到 02末）：不播片段、不转身、一直倒着
  for (const id of ["02-3", "02-4", "02-5", "02-6", "02-7", "02E-1", "02E-2"]) {
    const s = Seq(id);
    const shown = id === "02-3" ? (Keys(s, "Blanket").find(k => k.visible === true)?.t ?? 0) : 0;
    for (const k of Keys(s, "Donggua")) {
      if (k.t < shown) continue;
      // 2026-10-19：躺姿片段（PREVIZ_LYING_CLIPS，运行时照样按头的方向摆顺）放开
      if (typeof k.clip === "string" && !PREVIZ_LYING_CLIPS.includes(k.clip)) errors.push(`${id}：冬瓜在被子上 @${k.t} 不能播片段（${k.clip}：坐起来、身子出了被子；只许躺姿片段）`);
      if (k.faceTo !== undefined) errors.push(`${id}：冬瓜在被子上 @${k.t} 不能转身（faceTo）`);
      if (k.state === "alive" || k.stance) errors.push(`${id}：冬瓜在被子上 @${k.t} 不能起身`);
    }
  }
  // 桥底下的人一律蹲 / 趴：板桥脚印（顺路 spanM + 1 m 横木，横路 deckW + 0.3 m）内、脚下比桥面低 1 m 以上 = 在桥底下
  {
    const B = L0105_BRIDGE, r = B.yawDeg * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r);
    const scene = ReadBlockoutSceneDocSync("FirstLevel0105"), ground = HeightGridSampler(scene.terrain);
    const deckTop = Math.max(...scene.blocks.filter(b => /^BridgeDoorBoard_/.test(b.id)).map(b => b.y + b.h / 2));
    const Under = (x, z) => {
      const dx = x - B.x, dz = z - B.z, along = dx * fx + dz * fz, across = dx * fz - dz * fx;
      return Math.abs(along) <= (B.spanM + 1) / 2 && Math.abs(across) <= (B.deckW + 0.3) / 2 && deckTop - ground(x, z) > 1.0;
    };
    // 关键帧之间的过渡（PlanTransition：走动时姿态 = 目标是站就站着走，否则蹲着走）：从桥底下过的不许站着走
    for (const [fromId, toId] of [["04-2", "04-3"], ["04-3", "05-1"], ["05-1", "05-2"], ["05-2", "05-3"], ["05-3", "05-4"]]) {
      const from = config.keyframes.find(k => k.id === fromId), to = config.keyframes.find(k => k.id === toId);
      for (const u of to.units) {
        const prev = from.units.find(v => v.id === u.id);
        if (!prev || u.kind === "tank" || u.state === "down" || (u.stance || "stand") !== "stand") continue;
        const route = [prev, ...(u.path || []), u];
        let hit = null;
        for (let i = 1; i < route.length && !hit; i++) {
          const a = route[i - 1], b = route[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.2);
          for (let k = 0; k <= n && !hit; k++) { const x = a.x + (b.x - a.x) * k / Math.max(1, n), z = a.z + (b.z - a.z) * k / Math.max(1, n); if (Under(x, z)) hit = { x: R(x), z: R(z) }; }
        }
        if (hit) errors.push(`${fromId}→${toId}：${u.id} 过渡里站着从桥底下走过（${hit.x}, ${hit.z}）`);
      }
    }
    const norm = NormalizeBlockoutPreviz(doc);
    for (const id of ["04-3", "05-1", "05-2", "05-3", "05-4"]) {
      const kf = config.keyframes.find(k => k.id === id);
      for (const u of kf.units) if (u.kind !== "tank" && u.state !== "down" && Under(u.x, u.z) && (u.stance || "stand") === "stand") errors.push(`${id}：${u.id} 在桥底下站着（关键帧布设）`);
      const s = norm.sequences.find(q => q.keyframe === id);
      for (const a of s.actors) {
        const base = a.spawn || kf.units.find(u => u.id === a.id);
        if (!base || base.kind === "tank") continue;
        let bad = null;
        for (let t = 0; t <= s.durationS + 1e-6 && !bad; t += 0.1) {
          const st = SamplePrevizActor(a, t, base);
          if (st.visible && st.state !== "down" && st.stance === "stand" && Under(st.x, st.z)) bad = t;
        }
        if (bad !== null) errors.push(`${id}：${a.id} @${R(bad)} s 在桥底下站着（桥下横木底离沟底只有 1.76 m，要蹲 / 趴）`);
      }
    }
  }
  void config;
}

async function Main(argv) {
  const config = Load("Blockout/FirstLevel0105.json"), voice = Load("Blockout/FirstLevel0105.voice.json");
  let doc;
  if (argv.includes("--fresh")) {
    const { BuildPreviz } = await import("./Script_EditorBlockoutFirstLevel0105Previz.mjs");
    doc = BuildPreviz({ config, voice });
    const again = JSON.stringify(BuildPreviz({ config, voice }));
    if (again !== JSON.stringify(doc)) { console.log("错误：两次生成不一样"); process.exitCode = 1; }
  } else {
    const file = join(HERE, "Blockout/FirstLevel0105.previz.json");
    if (!existsSync(file)) { console.log("还没有 Blockout/FirstLevel0105.previz.json（先跑生成器 --force）"); process.exitCode = 1; return; }
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
