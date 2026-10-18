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
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { CharacterClipModelId } from "./Data_CharacterSelection.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const Load = f => JSON.parse(readFileSync(join(HERE, f), "utf8"));
const R = v => Math.round(v * 100) / 100;

const MODEL_ID = { nra: { 1: "TengxianNra02", 4: "TengxianNra05", 5: "TengxianNra06" }, ija: { 0: "TengxianIja01", 1: "TengxianIja02", 2: "TengxianIja03", 5: "TengxianIja06" } };
const SPEED = { walk: 1.4, run: 3.5, crawl: 0.5, drag: 0.9 };

function ClipTable() {
  const lib = Load("Animation/OpeningStoryboards/Data_OpeningStoryboardsAnimation.json");
  const byModel = new Map(lib.models.map(m => [m.id, new Set(m.clipIds)]));
  const durations = new Map(Object.entries(lib.clips).map(([k, c]) => [c.name || k, c.duration]));
  const sets = [...byModel.values()];
  const common = new Set([...sets[0]].filter(c => sets.every(s => s.has(c))));
  return { byModel, common, durations };
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
  const scene = Load("Blockout/FirstLevel0105.scene.json");
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
  DesignChecks(doc, config, errors);
  return { errors, warnings, rows };
}

/** 10-18 返工的设计口径（只查 FirstLevel0105）：南沿迂回、两人并排拖单被、板桥。 */
function DesignChecks(doc, config, errors) {
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
    const tk = Keys(s, "Tank").filter(k => k.x !== undefined);
    if (!tk.some(k => Math.hypot(k.x - 35, k.z - 116) < 0.5)) errors.push("05-2：战车要经过板桥中间");
  }
  if (!Seq("05-3").events.some(e => e.type === "signal" && e.name === "TankDisabled" && e.on)) errors.push("05-3：甩手榴弹后要打开 TankDisabled");
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
