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
// 第五版（2026-10-21）：07-4 全程第一人称（每条镜头是眼睛或凹路里眼高的跟拍）、飞机过头顶那段是 eye.free 且位置不动、蹲姿、≥ 8 s，排长「飞机！」
// 在扑倒前、班长「起来！走！」在飞机过顶后跑之前、末段眼高 1.62 直起腰、东北道上的鬼子（x ≥ 274 那一截）在默认视线里出现过、「趴倒！」在末尾；
// 飞机「镜头里看得见」按默认视线算（eye 也算）；07-1 / 07-2 回头看刘文财（其余镜头还是看妮儿）；08-1 主街上倒两个、从两道后门出来的三个都活着、
// 巷子那个滚到顺子身边 ≤ 2 m、后门那两个在沟东半截、老耿两句；08-2 新台词顺序、老耿朝东指时默认视线转向东边看见道上的鬼子、说后门时回到窗口；
// 08-5 末尾眼睛在巷子里（夹道 x 79…81 或东西那截）、离巷子口 ≥ 8 m、没有「再喊一遍」、有「交还操作」、班长「压到起！哪个龟儿停了」、机枪打大车；
// 09-1 从夹道拐弯前起、先过东西那截（开头两条不按「响了才挪」）。
// 第四版（2026-10-22，Notion 定稿 + 第六版空间）：08 四帧（08-4 妮儿跑·班长定计：顺子追进巷子交还操作、能转头不能走；班长四人到大车后头；墙角一个鬼子横过街口往东跑）；
// 09 七帧拉着手走唯一的那条路（眼睛全是蹲姿眼高、妮儿不跑）：门口瞥见、西配房窗后看院子（爬出窖 / 被捅 / 被拖 / 老太太 / 呜咽捂嘴）、大缸后探头「ん？」+ 哨 + 了结 + CellarBlast、
// 狗洞 / 拔门闩（SideGateOpen）、南墙根看堂屋门里的后背、灶屋里倒地（咬手腕不放慢）+ 北屋来的两个；10 六帧：背后打六个 + MgSilenced、机枪拖到石碾 + 试探 + 喊方位、
// 轻机枪 / 掷弹筒 / 砸门（NorthYardGatesBroken 10-3）/ 幺娃接机枪、后送队拐进胡同 + 抱腿、吹哨全退 → 炮（BarrageHit）→ 撤、炮里撤（LaneWallCollapse → 柴垛翻墙 → 大槐树 → 村南口，then stay）。
// 第九版（2026-10-24，Notion 07–10 新稿）：07-4 末冒烟都在主街以东、东头有枪声和听不清的日本话（ijaShoutFar）、有一条定镜落幅里东北角那伙鬼子 ≤ 120 m 在画面内；
// 08-1 说「东头……」的村民起点 x ≥ 130、跑在路沟北边、扑进沟后离坡道 ≤ 4 m、东北角那一梭子（NeCornerIja）落点都在沟北沿以北、班长记住后门；08-2「东边是……」之前镜头朝东；
// 08-3 末伤兵中枪；08-3 / 08-4 没有人走到大车边；08-4 新台词顺序（定计 → 让他一个人走 → 闭嘴 → 妮儿 → 不要命了嗦 → 跑了一个）、班长三人钻路沟后门进 EM1、Escort2 趴上坡道、
// 妮儿交还操作以后才溜出沟；09-1 顺子先到死胡同尽头、妮儿后到拽衣角（VilClingHem）；班长那一路全程不开枪、不上主街、09-1 末经过 EM1 / EM2 豁口；10-1 坡道上四个一起冲。
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HeightGridSampler, LayoutFromSceneDoc } from "./Script_EditorBlockoutLevels.mjs";
import { FIRST_LEVEL_SPEAKING_CAST } from "./Data_FirstLevelSpeakingCast.mjs";
import { CharacterClipModelId } from "./Data_CharacterSelection.mjs";
import { BlockStandSampler, PrevizSignalsAt, NormalizeBlockoutPreviz, SamplePrevizCamera, SamplePrevizAircraft, PREVIZ_SLOWMO } from "./Script_EditorBlockoutPrevizPlan.mjs";
import { BLOCKOUT_PREVIZ_CLIP_LIBRARIES } from "./Data_BlockoutPrevizClips.mjs";
import { LanePointAtZ, L0610_ALLEY_WINDOWS as AW } from "./Data_EditorBlockoutFirstLevel0610Space.mjs";
import { BACK_WINDOW } from "./Script_EditorBlockoutFirstLevel0610Keyframes.mjs";
import { ReadBlockoutSceneDocSync } from "./Script_SceneNode.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const Load = f => JSON.parse(readFileSync(join(HERE, f), "utf8"));
const R = v => Math.round(v * 100) / 100;

const MODEL_ID = { nra: { 1: "TengxianNra02", 4: "TengxianNra05", 5: "TengxianNra06" }, ija: { 0: "TengxianIja01", 1: "TengxianIja02", 2: "TengxianIja03", 5: "TengxianIja06" } };
const SPEED = { walk: 1.4, run: 3.5, crawl: 0.5, drag: 0.9 };
const PEOPLE = new Set(["soldier", "officer", "civilian", "child", undefined]);
/** 小孩身体的缩放（Script_EditorBlockoutPuppets BLOCKOUT_PUPPETS.childScale）。 */
const CHILD_SCALE = 0.62;
/** 地瓜窖坑心（第六版：街坊家 L0610_JIEFANG.cellar (73.5,460.5)）；网格里坑口沿在坑心外 1.0 m。 */
const CELLAR = { x: 73.5, z: 460.5 };
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
  const scene = ReadBlockoutSceneDocSync("FirstLevel0610");
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
  table.lines = lines;
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
  if (pairs < 7) errors.push(`成对动作只核到 ${pairs} 对（要 ≥ 7：捅 / 拖 / 咬 / 拽 / 背 ×2 / 抱腿；第四版剧本删了攥衣角）`);
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
  const ROLLER = { x: 113.2, z: 465.7 }, SHRINE = { x: 171, z: 466.4 }, CART = { x: 102.2, z: 446 }, POCKET_GATE = { x: 106.5, z: 458 };
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
  /** 点 p {x,y,z} 在镜头 shot 的视场 0.75 倍以内。 */
  const InView = (shot, p) => {
    const yaw = shot.yawDeg * Math.PI / 180, pitch = shot.pitchDeg * Math.PI / 180;
    const f = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
    const dx = p.x - shot.position.x, dy = p.y - shot.position.y, dz = p.z - shot.position.z, len = Math.hypot(dx, dy, dz);
    const ang = Math.acos(Math.max(-1, Math.min(1, (f.x * dx + f.y * dy + f.z * dz) / len))) * 180 / Math.PI;
    return ang <= (shot.fov || 60) * 0.75;
  };
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
  // 七个信号按拍开（第四版 10-22）
  if (!SignalOn("06-3", "CartDeparted")) errors.push("06-3：老耿赶车走要打开 CartDeparted");
  if (!SignalOn("09-4", "CellarBlast")) errors.push("09-4：窖里闷响要打开 CellarBlast");
  if (!SignalOn("09-5", "SideGateOpen")) errors.push("09-5：门闩拉开要打开 SideGateOpen");
  if (!SignalOn("10-1", "MgSilenced")) errors.push("10-1：打掉机枪组要打开 MgSilenced");
  if (!SignalOn("09-7", "EastGateBurst")) errors.push("09-7：班长撞开路口东北角那道院门要打开 EastGateBurst（10-24 两路）");
  if (!SignalOn("10-3", "NorthYardGatesBroken")) errors.push("10-3：北边两道门砸倒要打开 NorthYardGatesBroken");
  if (!SignalOn("10-5", "BarrageHit")) errors.push("10-5：第一排炮落下要打开 BarrageHit");
  if (!SignalOn("10-6", "LaneWallCollapse")) errors.push("10-6：炮砸塌院墙要打开 LaneWallCollapse");
  // 四条新音效（10-20）：别名在 §14.3；位置、时刻在各拍里再核
  const Sfx = (seq, name) => (seq?.events || []).filter(e => e.type === "sfx" && e.name === name).sort((a, b) => a.t - b.t);
  // 第十版（10-30）：09-7 没有罐子了（扑倒挪到北屋、灶屋那个悄悄一刀），jarShatter 不再要求；09-2 隔壁院踹门也用 gateSmash
  for (const [id, name] of [["09-2", "cellarSob"], ["09-3", "cellarSob"], ["09-4", "babyCry"], ["09-2", "gateSmash"], ["10-3", "gateSmash"]]) if (!Sfx(Seq(id), name).length) errors.push(`${id}：要用新音效 ${name}`);
  for (const e of Sfx(Seq("09-2"), "cellarSob")) if (!Near(e, CELLAR, 0.3)) errors.push(`09-2：窖里的哭声要从窖口放（(${e.x}, ${e.z})）`);
  if (Sfx(Seq("09-2"), "cellarSob").length < 2) errors.push("09-2：窖里的哭声放两遍（文件 4 s，人在窖里的那一阵都得听见）");
  if (Has(Seq("10-3"), "sfx", e => e.name === "bodyFall")) errors.push("10-3：有了新音效，别再拿重物落地顶砸门");
  if (Has(Seq("09-7"), "sfx", e => e.name === "jarShatter") || Seq("09-7")?.lines.some(l => /^Kitchen(Lunge|Bitten|Check)|^DoorPeek/.test(l.line))) errors.push("09-7：第十版没有罐子、灶屋扑倒和「どうした」了");
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
    // 10-21：一直看着车尾的妮儿，只在停顿里回头瞅一眼后头两步的刘文财（他听见了「路费」那段）
    if (!s.camera.every(c => c.look?.actor === "Nier" || c.look?.actor === "LiuWencai")) errors.push(`${id}：边走边说的镜头要一直看着车尾的妮儿（look 演员锚 Nier），只许回头看刘文财`);
    const glances = s.camera.filter(c => c.look?.actor === "LiuWencai");
    if (!glances.length || glances.some(c => c.to)) errors.push(`${id}：要有一条站着回头看刘文财的镜头（look 演员锚 LiuWencai、不走）`);
    if (s.camera.filter(c => c.look?.actor === "Nier").length < s.camera.length * 0.7) errors.push(`${id}：大半镜头还是要看着妮儿`);
    for (const g of glances) {
      const liu = PosAt(id, s, "LiuWencai", g.t), eye = g.from;
      if (!liu || !eye || liu.z > eye.z - 1.2 || liu.z < eye.z - 4.0) errors.push(`${id}：回头时刘文财要在眼睛后头两步（1.2–4 m），实际 ${liu && eye ? R(eye.z - liu.z) : "?"} m`);
    }
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
    const d12 = table.lines?.get("CopperCoins.12")?.durationS ?? 12.55;
    if (!e12 || t13 === undefined || t13 < e12.t + d12 + 3.0) errors.push("07-2：「老子一个字都没听到」要在上一句说完 3 s 以后才说（过了好一会儿）");
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
  // 07-4（10-21 用户：全程第一人称，不切第三人称机位）：每条镜头要么是眼睛、要么是眼高（0.3–1.7 m）的跟拍且机位在凹路里 / 村口路沟边；
  // 飞机过头顶那一段是能转头不能走的 eye.free、位置钉死、蹲姿、≥ 8 s；排长「飞机！贴到坎！」在第一个人扑倒之前；班长「起来！走！」在飞机过顶之后、
  // 跑之前；末段眼高 1.62 直起腰（凹路里蹲着看不见麦地那头）；东北道上的鬼子在默认视线里出现过；到村口「趴倒！」；最后眼睛趴在路沟沿。
  // 三架 Ki-30 由北往南、不开枪、引擎声跟着走、默认视线里看得见它（按 eye 的默认视线算）；人往坎底缩（VilDuckProne 错峰）、妮儿最后一个；村子冒烟。
  {
    const s = Seq("07-4"), n = NSeq("07-4");
    const laneMid = z => LanePointAtZ(z, 0);
    for (const c of s.camera) {
      if (c.eye) continue;
      const pts = [c.from, c.to].filter(p => p && p.x !== undefined);
      if (!pts.length) { errors.push(`07-4：镜头 @${c.t} 挂在演员 / 飞机上，不是第一人称`); continue; }
      for (const p of pts) {
        const h = p.h ?? 1.6;
        if (h < 0.3 || h > 1.7) errors.push(`07-4：镜头 @${c.t} 机位高 ${h} m，不是眼高的跟拍`);
        const inLane = p.z < 377 ? Math.hypot(p.x - laneMid(p.z).x, p.z - laneMid(p.z).z) <= 2.2 : Math.abs(p.z - 380) < 6;
        if (!inLane) errors.push(`07-4：镜头 @${c.t} 机位 (${p.x}, ${p.z}) 不在凹路里（坎上 / 路边往回看的第三人称机位不要）`);
      }
    }
    const freeEyes = s.camera.filter(c => c.eye?.free === true);
    const freeSpan = freeEyes.length ? Math.max(...freeEyes.map(c => c.t + c.dur)) - Math.min(...freeEyes.map(c => c.t)) : 0;
    if (!freeEyes.length || freeSpan < 8) errors.push(`07-4：飞机过头顶那一段要是能转头不能走的眼睛（eye.free）、至少 8 s，现在 ${R(freeSpan)} s`);
    if (freeEyes.some(c => c.eye.stance !== "crouch" || c.eye.x === undefined)) errors.push("07-4：free 眼睛要钉死位置、半蹲（stance crouch）");
    if (freeEyes.some(c => Math.hypot(c.eye.x - freeEyes[0].eye.x, c.eye.z - freeEyes[0].eye.z) > 0.05)) errors.push("07-4：free 眼睛整段位置不动");
    const pl74 = kf07.player;
    if (freeEyes.length && Math.hypot(freeEyes[0].eye.x - pl74.x, freeEyes[0].eye.z - pl74.z) > 0.3) errors.push("07-4：free 眼睛要在关键帧玩家的位置（东坎根）");
    for (let i = 1; i < freeEyes.length; i++) if (freeEyes[i].t > freeEyes[i - 1].t + freeEyes[i - 1].dur + 0.01) errors.push(`07-4：free 眼睛之间不能有空档（${freeEyes[i - 1].t} → ${freeEyes[i].t}）`);
    const last = [...s.camera].sort((a, b) => a.t - b.t).at(-1);
    if (!last?.eye || last.eye.stance !== "prone" || Math.abs(last.eye.z - 384.3) > 1) errors.push("07-4：最后要切回第一人称，趴在村口路沟沿上");
    const stand = s.camera.filter(c => !c.eye && c.from?.h >= 1.55 && c.from.z < 377);
    if (!stand.length || !stand.some(c => c.to && c.to.z > 365)) errors.push("07-4：凹路末段要直起腰（眼高 ≥ 1.55 的跟拍跑到凹路尽头）才看得见麦地那头的庄子和东北道");
    for (const l of ["PlaneDuck.01", "LuoDriveOn.01", "LuoDriveOn.02"]) if (!HasLine(s, l)) errors.push(`07-4：要有台词 ${l}`);
    if (!Has(s, "caption", e => /交还|接 08/.test(e.text))) errors.push("07-4：末尾要有「接 08」的说明字");
    if (ClipKey(s, "Luo", "PvStandHaltL") === undefined || LineT(s, "LuoDriveOn.02") === undefined || Math.abs(ClipKey(s, "Luo", "PvStandHaltL").t - LineT(s, "LuoDriveOn.02")) > 1.0) errors.push("07-4：班长喊「趴倒！」时要回头压手（PvStandHaltL）");
    const duckers = ["Luo", "Yaowa", "Squad1", "Officer", "Medic", "Walker01", "Walker16", "Helper02", "Geng", "Nier"];
    const duckT = Object.fromEntries(duckers.map(id => [id, Keys(s, id).find(k => k.clip === "VilDuckProne")?.t]));
    for (const id of duckers) if (duckT[id] === undefined) errors.push(`07-4：${id} 要扑倒（VilDuckProne 键）`);
    const nierDuck = duckT.Nier;
    if (nierDuck !== undefined && duckers.some(id => id !== "Nier" && duckT[id] !== undefined && duckT[id] >= nierDuck)) errors.push("07-4：妮儿要最后一个趴下（她听不见，看见别人趴了才趴）");
    const spread = Object.values(duckT).filter(t => t !== undefined);
    if (spread.length && Math.max(...spread) - Math.min(...spread) < 2.0) errors.push("07-4：扑倒要错峰（最早到最晚 ≥ 2 s）");
    // 排长先喊「飞机！贴到坎！」再有人扑倒；飞机过顶之后班长才「起来！走！」，喊完才跑；跑到村口才「趴倒！」
    const warn = LineT(s, "PlaneDuck.01"), up = LineT(s, "LuoDriveOn.01"), downCall = LineT(s, "LuoDriveOn.02");
    if (warn === undefined || spread.length && warn > Math.min(...spread)) errors.push("07-4：排长「飞机！贴到坎！」要在第一个人扑倒之前");
    const runKeys = PosKeys(s, "Luo").filter(k => k.move === "run" && k.t > (nierDuck ?? 0));
    if (up === undefined || nierDuck === undefined || up < nierDuck + 3.0 || !runKeys.length || Math.min(...runKeys.map(k => k.t)) < up) errors.push("07-4：班长「起来！走！」要在妮儿趴下 3 s 以后、全班起跑之前");
    if (downCall === undefined || !last || downCall > last.t || downCall < (up ?? 0) + 8) errors.push("07-4：「趴倒！」要在跑到村口路沟、趴下之前");
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
        // 默认视线里看得见它（第一人称也算：没人碰鼠标时就是默认视线）：镜头朝向与「机位 → 机身」的夹角在视场的 0.75 倍以内
        const shot = SamplePrevizCamera(n.camera, t, CameraResolver(kf07, n, ground, t));
        if (shot && InView(shot, p)) inView07 = true;
      }
      if (!seen) errors.push("07-4：飞机要在妮儿趴下之前就过了头顶");
      if (!inView07) errors.push("07-4：默认视线里要看得见飞机（某一刻机身在视场里）");
      if (!s.camera.some(c => c.look?.aircraft === plane.id || c.lookTo?.aircraft === plane.id || c.eye?.look?.aircraft === plane.id || c.eye?.toLook?.aircraft === plane.id)) errors.push("07-4：要有一条镜头看着飞机（look / lookTo 用飞机锚）");
      // 第九版（10-24）：东北角那伙鬼子（RoadIja1…4，离了大路在麦地里）——末段直起腰以后有一条定镜（不运镜、≥ 1.2 s）的落幅里他们在画面内、≤ 120 m
      let groupSeen = null;
      for (const c of s.camera) {
        if (c.eye || c.to || c.dur < 1.2) continue;
        const t = c.t + c.dur - 0.05;
        const shot = SamplePrevizCamera(n.camera, t, CameraResolver(kf07, n, ground, t));
        if (!shot || shot.position.y - ground(shot.position.x, shot.position.z) < 1.5) continue;   // 蹲在凹路里看不见，只算直起腰以后
        for (const id of ["RoadIja1", "RoadIja2", "RoadIja3", "RoadIja4"]) {
          const p = PosAt("07-4", s, id, t);
          const d = p ? Math.hypot(p.x - shot.position.x, p.z - shot.position.z) : Infinity;
          if (p && d <= 120 && (shot.fov || 60) >= 50 && InView(shot, { x: p.x, y: ground(p.x, p.z) + 1.0, z: p.z })) groupSeen = { t: c.t, id, d: R(d) };
        }
      }
      if (!groupSeen) errors.push("07-4：直起腰以后要有一条定镜（≥ 1.2 s、不运镜、fov ≥ 50）朝东北角看，落幅里那伙鬼子 ≤ 120 m 且在画面内");
      for (const id of ["RoadIja1", "RoadIja2", "RoadIja3", "RoadIja4"]) { const p = PosKeys(s, id).at(-1); const d = p ? Math.hypot(p.x - 100, p.z - 378) : 0; if (!p || d > 125 || p.x < 110) errors.push(`07-4：${id} 整段都要留在庄子东北边的麦地里（离凹路尽头 ≤ 125 m、主街以东），最后在 (${p?.x}, ${p?.z})`); }
    }
    if (Has(s, "sfx", e => e.name === "tankTracks")) errors.push("07-4：飞机有模型和引擎声了，不要再拿履带声顶");
    if (!PosKeys(s, "Luo").some(k => k.move === "run") || !PosKeys(s, "GengCart").some(k => k.move === "walk")) errors.push("07-4：全班要顺凹路往前跑、车跟在后头");
    const smokes = s.events.filter(e => e.type === "smoke" && e.kind === "SmokeBlack");
    if (smokes.length < 2) errors.push("07-4：望见耿家庄要有几处房顶冒烟（SmokeBlack ≥ 2）");
    for (const e of smokes) if (e.x <= 110) errors.push(`07-4：冒烟的都在庄子东头（主街以东 x > 110），实际 (${e.x}, ${e.z})`);
    // 枪声和听不清的日本话都从东头来（ijaShoutFar 是现成的日语录音远远放）
    const shouts = s.events.filter(e => e.type === "sfx" && e.name === "ijaShoutFar");
    if (!shouts.length || shouts.some(e => e.x <= 110)) errors.push("07-4：东头要传来听不清的日本话（ijaShoutFar，x > 110）");
    const eastGuns = s.events.filter(e => e.type === "sfx" && /rifleShot|rifleVolley|mgBurst/.test(e.name) && e.x > 110);
    if (eastGuns.length < 2) errors.push("07-4：枪声要从东头一阵一阵传来（x > 110 的枪声 ≥ 2）");
  }
  // ===================== 第四版（2026-10-22）08–10 =====================
  const LOOP = { x: 100, z: 470 }, ALLEY = { x: 80, z: 384 }, SIDE_OUT = { x: 90.7, z: 484.6 }, CLIMB_FROM = { x: 112.7, z: 501.3 }, CLIMB_TO = { x: 115.3, z: 501.3 }, EXIT = { x: 117, z: 545 };
  const Eyes = seq => (seq?.camera || []).filter(c => c.eye);
  const LastCam = seq => [...(seq?.camera || [])].sort((a, b) => a.t + a.dur - (b.t + b.dur)).at(-1);
  const EndPoint = c => c?.to || c?.from || c?.eye;
  for (const id of ["08-1", "08-2", "08-3", "08-4", "09-1", "09-2", "09-3", "09-4", "09-5", "09-6", "09-7", "10-1", "10-2", "10-3", "10-4", "10-5", "10-6"]) {
    const s = Seq(id);
    if (!s) errors.push(`${id}：缺预演段`);
    for (const e of s?.events || []) if (e.type === "caption" && /窗口|北窗/.test(e.text)) errors.push(`${id}：字幕里「窗口」一律改「枪眼」：${e.text}`);
  }
  // 08-1：主街上倒两个（从东边院门冲出来的）、从两道门出来的三个都活着：巷子那个滚进沟西头到顺子身边 ≤ 2 m、后门那两个在沟东半截；村民的话；老耿只有一句
  {
    const s = Seq("08-1");
    const down = ["Villager2", "Villager3"].filter(id => Keys(s, id).some(k => k.state === "down"));
    if (down.length !== 2 || !Has(s, "muzzle", e => e.actor === "MgGunner")) errors.push("08-1：枪眼里的机枪要打倒两个冲上主街的村民");
    for (const id of ["Villager2", "Villager3"]) { const p = PosKeys(s, id).filter(k => k.move === "run").at(-1); if (!p || p.x < 97 || p.x > 103 || p.z < 405 || p.z > 436) errors.push(`08-1：${id} 要倒在主街上（x 97…103、z 405…436），实际 (${p?.x}, ${p?.z})`); }
    for (const id of ["Villager1", "Villager4", "Villager5"]) if (Keys(s, id).some(k => k.state === "down")) errors.push(`08-1：${id} 走岔路，要活着`);
    for (const id of ["Villager1", "Villager2", "Villager3", "Villager4", "Villager5"]) if (!ClipKey(s, id, "VilPanicRun")) errors.push(`08-1：${id} 要弓着身子慌跑（VilPanicRun）`);
    // 第九版（10-24）：Villager1 从东头来——起点 x ≥ 130、跑在路沟北边（x ≤ 125 的来路点都在沟北沿以北）、扑进沟东半截后离坡道 ≤ 4 m；东北角那一梭子落点都在沟北沿以北
    const v1 = PosKeys(s, "Villager1").filter(k => k.move === "run");
    const v1Start = Unit("08-1", "Villager1")?.path?.[0];
    if (!v1Start || v1Start.x < 130) errors.push(`08-1：说「东头……」的村民起点要在主街以东 x ≥ 130，实际 (${v1Start?.x}, ${v1Start?.z})`);
    const v1Route = v1.flatMap(k => [...(k.path || []), k]);
    const divePt = v1Route.find(p => p.z > 378.5 && p.x <= 125);
    const diveIdx = divePt ? v1Route.indexOf(divePt) : v1Route.length;
    if (v1Route.slice(0, diveIdx).some(p => p.x <= 125 && p.z > 378.5)) errors.push("08-1：Villager1 扑进沟之前要一直跑在路沟北边（北沿以北）");
    const RAMP = { minX: 97, maxX: 103, minZ: 380, maxZ: 385 };
    const DistToBox = (p, b) => Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minZ - p.z, 0, p.z - b.maxZ));
    if (!v1.length || v1.at(-1).x < 104 || DistToBox(v1.at(-1), RAMP) > 4.0) errors.push(`08-1：东头跑来的村民要扑进路沟东半截、爬到坡道边（离坡道 ≤ 4 m），实际 (${v1.at(-1)?.x}, ${v1.at(-1)?.z})`);
    if (v1Route.some(p => p.x > 96 && p.x < 104 && p.z > 386)) errors.push("08-1：Villager1 不上主街");
    const neBurst = s.events.find(e => e.type === "muzzle" && e.actor === "NeCornerIja");
    if (!neBurst) errors.push("08-1：东北角墙后要冒出一个鬼子打一梭子（NeCornerIja 的 muzzle）");
    else {
      const puffs = s.events.filter(e => e.type === "explosion" && e.radius <= 1 && e.t >= neBurst.t && e.t <= neBurst.t + 2.0);
      if (puffs.length < 3) errors.push("08-1：那一梭子要在村民脚后跟溅起一串土（≥ 3 小土点）");
      for (const p of puffs) if (p.x <= 125 && p.z > 378.0) errors.push(`08-1：东北角那一梭子的落点都要在沟北沿以北，实际 (${p.x}, ${p.z})`);
      if (v1.length && neBurst.t > v1.at(-1).t) errors.push("08-1：那一梭子要在他扑进沟之前打");
      const hide = Keys(s, "NeCornerIja").find(k => k.visible === false && k.t > neBurst.t);
      if (!hide) errors.push("08-1：东北角那人露一下就要缩回去（visible false）");
    }
    if (!Keys(s, "Villager1").some(k => k.clip === "PvCrouchPointL")) errors.push("08-1：村民说「东头……」时要往东指（PvCrouchPointL）");
    for (const id of ["Villager4", "Villager5"]) {
      const p = PosKeys(s, id).filter(k => k.move === "run").at(-1);
      if (!p || p.x < 104 || Math.abs(p.z - 380) > 1.5) errors.push(`08-1：${id} 要从后门下到沟东半截（x ≥ 104、沟底），实际 (${p?.x}, ${p?.z})`);
    }
    if (!Has(s, "caption", e => /后门/.test(e.text) && /记住/.test(e.text))) errors.push("08-1：班长看了那道后门一眼（记住了）要有说明字");
    for (const l of ["VillageMouth.01", "GengHome.01"]) if (!HasLine(s, l)) errors.push(`08-1：要有台词 ${l}`);
    if (!Order(s, ["VillageMouth.01", "GengHome.01"])) errors.push("08-1：村民的话 → 那是俺家");
    if (s.lines.some(l => /GengHome\.02/.test(l.line))) errors.push("08-1：「窖里还藏着街坊哩」删了");
  }
  // 08-2（10-22 重写）：班长先朝东「东边是狗日的来的路，走不得」（默认视线转向东边看见道上的鬼子）→ 问西边 → 老耿河汊子 → 卫生兵蹚水 → 老耿「东墙外头那条小胡同」（眼睛回到枪眼）→
  // 排长等天黑 → 顺子 → 卫生兵 → 班长下令
  {
    const s = Seq("08-2"), n = NSeq("08-2"), kf = config.keyframes.find(k => k.id === "08-2");
    const ids = ["NoWayAsk.01", "NoWayAsk.02", "NoWayGeng.01", "NoWayMedic.01", "NoWayGeng.02", "NoWayOfficer.01", "DecideShunzi.01", "DecideMedic.01", "DecideLuo.01"];
    for (const l of ids) if (!HasLine(s, l)) errors.push(`08-2：要有台词 ${l}`);
    if (!Order(s, ids)) errors.push("08-2：对白顺序要是 班长东边走不得 → 问西边 → 老耿河汊子 → 卫生兵 → 老耿小胡同 → 排长 → 顺子 → 卫生兵 → 班长下令");
    if (!Has(s, "caption", e => /狗洞/.test(e.text))) errors.push("08-2：要有说明字：墙根有个狗洞，老耿没想起来");
    const east = LineT(s, "NoWayAsk.01"), south = LineT(s, "NoWayGeng.02");
    const ground = layout.terrainSampler;
    if (east !== undefined) {
      // 第九版（10-24）：「东边是……」之前镜头先朝东（看到东北角刚才开枪的墙角再落回来）：那句之前 2.5 s 里有一刻默认视线朝东 ±40°
      let eastward = false;
      for (let t = Math.max(0, east - 2.5); t <= east + 0.01; t += 0.1) {
        const shot = SamplePrevizCamera(n.camera, t, CameraResolver(kf, n, ground, t));
        if (shot && Math.abs(WrapDeg(shot.yawDeg + 90)) <= 40) eastward = true;
      }
      if (!eastward) errors.push("08-2：班长说「东边是狗日的来的路」之前镜头要先朝东看一眼（东北角刚才开枪的墙角）");
      if (!Has(s, "caption", e => /墙角/.test(e.text) && e.t < east)) errors.push("08-2：朝东看那一眼要有说明字（刚才开枪的墙角）");
    }
    if (south !== undefined) {
      const pointing = Keys(s, "Geng").filter(k => k.clip === "PvStandPointL" && k.t <= south + 0.3 && k.t >= south - 1.0).at(-1);
      if (!pointing) errors.push("08-2：说「俺家东墙外头那条小胡同」时老耿要指着主街尽头（PvStandPointL）");
      const shot = SamplePrevizCamera(n.camera, south + 1.0, CameraResolver(kf, n, ground, south + 1.0));
      if (!shot || Math.abs(WrapDeg(shot.yawDeg - 180)) > 12) errors.push(`08-2：说小胡同时视线要回到主街尽头的枪眼（朝南），实际 yaw ${shot ? R(shot.yawDeg) : "?"}`);
    }
    for (const id of ["RoadIja5", "RoadIja6", "RoadIja7"]) { const p = PosKeys(s, id).at(-1); if (!p || p.x < 274) errors.push(`08-2：${id} 要留在从街口看得见的那一截（x ≥ 274）`); }
  }
  // 08-3（第十版 10-30）：玩家打；枪眼一梭打沟沿；班长四人蹲在坡道脚下不动；Squad3 冒头久了被打死（我们死的第一个人）→ 机枪扫进沟：担架员 Bearer01、妮儿身边的伤兵 Walker04 倒 →
  // 沟里「又打着一个！」→ 墙角一个鬼子横过街口往东跑、幺娃「跑了一个」→ 班长「喊人去了……端了枪眼」
  {
    const s = Seq("08-3");
    if (!Has(s, "muzzle", e => e.actor === "player")) errors.push("08-3：玩家要朝枪眼打");
    if (Bursts(s).length < 4) errors.push("08-3：枪眼里的机枪要一直打（≥ 4 梭）");
    const ids = ["DitchHit.01", "RunnerEast.01", "LuoBeforeHelp.01"];
    for (const l of ids) if (!HasLine(s, l)) errors.push(`08-3：要有台词 ${l}`);
    if (!Order(s, ids)) errors.push("08-3：台词顺序要是 又打着一个 → 跑了一个 → 喊人去了");
    if (s.lines.some(l => !ids.includes(l.line))) errors.push(`08-3：这一拍只有那三句（现在 ${s.lines.map(l => l.line).join("、")}）`);
    for (const id of ["Luo", "HeYoutian", "Escort1", "Escort2"]) for (const k of PosKeys(s, id)) if (k.z > 386) errors.push(`08-3：${id} 蹲在街口等着，不往前摸（@${k.t} 到了 z ${k.z}）`);
    if (!Has(s, "caption", e => /等着/.test(e.text))) errors.push("08-3：要有说明字：班长四人蹲在坡道脚下等着");
    if (!Has(s, "caption", e => /停火/.test(e.text))) errors.push("08-3：要有说明字教玩家：一停火机枪就去找别的目标");
    // Squad3 死在坡道上他的射击位：先 ShotCollapse 再 down，位置不离射击位；之后坡道上不再有他的枪
    const sq3Slot = Unit("08-3", "Squad3");
    const sq3Hit = ClipKey(s, "Squad3", "ShotCollapse"), sq3Down = Keys(s, "Squad3").find(k => k.state === "down");
    if (!sq3Hit || !sq3Down || sq3Down.t < sq3Hit.t) errors.push("08-3：Squad3 要被枪眼一梭打死（ShotCollapse → down）");
    else {
      const p = PosAt("08-3", s, "Squad3", sq3Down.t);
      if (!Near(p, sq3Slot, 0.6) || !Bursts(s).some(b => b <= sq3Hit.t && b > sq3Hit.t - 1.5)) errors.push("08-3：Squad3 要栽在他的射击位上，倒下前 1.5 s 内有一梭机枪");
      if (Has(s, "muzzle", e => e.actor === "Squad3" && e.t > sq3Hit.t)) errors.push("08-3：Squad3 死了以后不再开枪");
      if (!Has(s, "caption", e => /第一个人/.test(e.text) && Math.abs(e.t - sq3Hit.t) < 3)) errors.push("08-3：「我们死的第一个人」要有说明字");
    }
    // 拍末机枪扫进沟：担架员 Bearer01、妮儿身边的伤兵 Walker04 中枪倒下（都在 Squad3 之后），妮儿缩在沟底不动；沟里有人喊「又打着一个」
    const b1 = Keys(s, "Bearer01").find(k => k.state === "down"), w4 = Keys(s, "Walker04").find(k => k.state === "down");
    if (!b1 || !w4 || !sq3Down || b1.t < sq3Down.t || w4.t < sq3Down.t) errors.push("08-3：Squad3 死了以后机枪扫进沟，担架员 Bearer01 和伤兵 Walker04 要中枪倒下");
    if (b1 && !Near(PosAt("08-3", s, "Bearer01", b1.t), Unit("08-3", "Bearer01"), 0.6)) errors.push("08-3：担架员要倒在杠子边（关键帧 Bearer01 的位置）");
    if (w4 && !Near(PosAt("08-3", s, "Walker04", w4.t), Unit("08-3", "Walker04"), 0.6)) errors.push("08-3：伤兵要倒在妮儿身边（关键帧 Walker04 的位置）");
    if (!Has(s, "caption", e => /伤兵中枪/.test(e.text)) || !ClipKey(s, "Nier", "VilCowerWhimper")) errors.push("08-3：伤兵中枪、妮儿缩在沟底不动了要有说明字和片段（VilCowerWhimper）");
    const shout = LineT(s, "DitchHit.01");
    if (shout === undefined || !b1 || !w4 || shout < Math.max(b1.t, w4.t) - 1.0) errors.push("08-3：「又打着一个！」要在沟里两个倒下之后喊");
    // 跑了一个（第十版挪到 08-3）：先横过主街的口子（幺娃看得见那几步）再拐去东街；幺娃看见才喊；班长那句在最后
    const run = PosKeys(s, "CornerIja2").filter(k => k.move === "run");
    if (!run.some(k => k.x < 103 && k.z > 458 && k.z < 470)) errors.push("08-3：喊人的鬼子要横过主街的口子（那几步幺娃看得见）");
    if (!run.some(k => k.x > 125)) errors.push("08-3：他最后要拐去东街");
    const seen = LineT(s, "RunnerEast.01");
    if (seen === undefined || !run.some(k => k.x < 103 && k.t <= seen + 0.5)) errors.push("08-3：幺娃看见他横过街口才喊「跑了一个」");
    if (seen !== undefined && shout !== undefined && seen < shout) errors.push("08-3：跑了一个在「又打着一个」之后");
    if (!Keys(s, "CornerIja2").some(k => k.visible === false)) errors.push("08-3：跑去喊人的拐进东街以后要隐藏");
    const help = LineT(s, "LuoBeforeHelp.01");
    if (help === undefined || seen === undefined || help < seen) errors.push("08-3：班长「喊人去了」要在幺娃喊过之后");
    if (!ClipKey(s, "Luo", "PvCrouchTalkRifle")) errors.push("08-3：班长说那句时蹲着（PvCrouchTalkRifle）");
  }
  // 第九版（10-24）：08-3 / 08-4 没有人走到大车边（班长不上主街）
  for (const id of ["08-3", "08-4"]) for (const a of Seq(id)?.actors || []) for (const k of PosKeys(Seq(id), a.id)) if (Near(k, CART, 3.0)) errors.push(`${id}：${a.id} @${k.t} 走到大车边了 (${k.x}, ${k.z})——这一版没有人上主街`);
  // 08-4（第十版 10-30）：班长瞄一眼后门、招手叫拢，一口气定计（枪眼只朝前打……哪个都不准放枪）→ 转向坡道「幺娃，打一阵歇一阵」→ 刘文财「……晓得」→
  // 班长、何有田、Escort1 爬上南沿钻路沟后门进 EM1（最后在 09-1 的站位）、Escort2 趴上坡道补顺子的射击位 → 顺子和刘文财顺沟南沿爬进巷子 → 交还操作（eye.free）→
  // 身后妮儿趁乱溜出沟跟进巷子（老耿喊、被幺娃拽回；只听得见）→ 坡道上两个换窝；没有人走到大车边（上面统一查）；「跑了一个」挪到 08-3 了
  {
    const s = Seq("08-4");
    for (const id of ["Walker04", "Bearer01", "Squad3"]) if (Keys(s, id).some(k => k.state === "down" && k.t > 0.5) || !Keys(s, id).some(k => k.state === "down" && k.t <= 0.5)) errors.push(`08-4：${id} 在 08-3 就死了，这一段开场就倒着（不再演一遍）`);
    const ids = ["LuoSplitsUp.01", "LuoToRamp.01", "LiuKnows.01", "NierRuns.01", "NierRuns.02"];
    for (const l of ids) if (!HasLine(s, l)) errors.push(`08-4：要有台词 ${l}`);
    if (!Order(s, ids)) errors.push("08-4：台词顺序要是 定计 → 幺娃打一阵歇一阵 → 晓得 → 妮儿！ → 不要命了嗦");
    for (const l of ["NierRuns.03", "LiuWhereTo.01", "LuoSendsShunzi.02", "LuoHoldsMouth.01", "PinnedAtCart.01", "PinnedAtCart.02", "LiuMutters.01", "LuoShutUp.01", "RunnerEast.01"]) if (s.lines.some(x => x.line === l)) errors.push(`08-4：${l} 删了 / 挪走了，不该再排`);
    const plan = LineT(s, "LuoSplitsUp.01");
    if (!Has(s, "caption", e => /后门/.test(e.text) && e.t <= (plan ?? 0))) errors.push("08-4：定计之前班长要瞄一眼那道后门（说明字）");
    if (!ClipKey(s, "Luo", "PvStandBeckonL") || ClipKey(s, "Luo", "PvStandBeckonL").t > (plan ?? 0)) errors.push("08-4：定计前班长要招手把人叫拢（PvStandBeckonL）");
    if (ClipKeys(s, "Luo", "PvCrouchPointL").length < 3) errors.push("08-4：定计说到谁指谁（PvCrouchPointL ≥ 3：有田、文财、顺儿）");
    const knows = LineT(s, "LiuKnows.01");
    if (knows !== undefined && !Keys(s, "LiuWencai").some(k => k.faceTo === "player" && k.t <= knows + 0.1 && k.t >= knows - 1.5)) errors.push("08-4：刘文财说「晓得」前要看顺子一眼（faceTo player）");
    const dash = Moves(s).filter(c => c.to && c.to.x < 90);
    if (!dash.length || knows === undefined || dash[0].t < knows) errors.push("08-4：刘文财应了「晓得」顺子才走");
    if (plan === undefined || !dash.length || dash[0].t < plan) errors.push("08-4：班长定计以后顺子才走");
    // 刘文财跟顺子走巷子：定计后从射击位下来，顺沟南沿往西，最后蹲在关键帧 08-4 的位置（巷子口里、顺子身后）；不再趴着压枪眼
    {
      const liu = PosKeys(s, "LiuWencai").filter(k => knows !== undefined && k.t > knows);
      if (!liu.length || !Near(liu.at(-1), Unit("08-4", "LiuWencai"), 0.6) || liu.at(-1).stance !== "crouch") errors.push(`08-4：刘文财要跟顺子爬进巷子，最后蹲在关键帧的位置 (${liu.at(-1)?.x}, ${liu.at(-1)?.z})`);
      if (!liu.some(k => [...(k.path || []), k].some(p => p.z > 379 && p.z < 382 && p.x < 92))) errors.push("08-4：刘文财的来路要顺沟南沿往西（经过 x < 92、沟底）");
      if (Has(s, "muzzle", e => e.actor === "LiuWencai" && e.t > (knows ?? 0))) errors.push("08-4：刘文财应了「晓得」以后不再压枪眼");
      if (!Has(s, "caption", e => /刘文财/.test(e.text) && /巷子|身后/.test(e.text))) errors.push("08-4：说明字要讲清楚刘文财跟顺子走巷子");
    }
    if (!Has(s, "caption", e => /交还操作/.test(e.text))) errors.push("08-4：进巷子十来米要有「交还操作」");
    const free = Eyes(s).filter(c => c.eye.free);
    if (!free.length || free.some(c => Math.abs(c.eye.x - 80) > 0.6 || c.eye.z < 386 || c.eye.z > 392) || Math.max(...free.map(c => c.dur)) < 12) errors.push("08-4：交还操作以后眼睛钉在巷子里（x≈80、z 386…392）、能转头不能走（eye.free）、留够身后那段戏的时间（≥ 12 s）");
    const freeT = free.length ? Math.min(...free.map(c => c.t)) : Infinity;
    // 班长那一路：定计之后三个人钻路沟后门进 EM1（最后在 09-1 的站位、来路经过后门 (110,385) 两边）
    for (const id of ["Luo", "HeYoutian", "Escort1"]) {
      const after = PosKeys(s, id).filter(k => plan !== undefined && k.t > plan);
      if (!after.length || !Near(after.at(-1), Unit("09-1", id), 0.6)) errors.push(`08-4：定计之后 ${id} 要钻进路沟后门进 EM1（最后在 09-1 的站位）`);
      if (!after.some(k => [...(k.path || []), k].some(p => Math.abs(p.x - 110) < 0.6 && p.z > 383 && p.z < 387))) errors.push(`08-4：${id} 进院子的来路要经过路沟后门 (110,385)`);
      if (Keys(s, id).some(k => k.state === "down")) errors.push(`08-4：${id} 要活着`);
    }
    if (!Has(s, "caption", e => /后门/.test(e.text) && /钻/.test(e.text))) errors.push("08-4：班长三人钻后门要有说明字");
    // Escort2 爬上坡道补顺子的射击位（先到 08-4 关键帧的窝；段末换一次窝到 09-1 的窝），一直趴着
    const e2keys = PosKeys(s, "Escort2").filter(k => plan !== undefined && k.t > plan);
    if (!e2keys.some(k => Near(k, Unit("08-4", "Escort2"), 0.6) && k.stance === "prone")) errors.push("08-4：Escort2 要爬上坡道补顺子空出来的射击位（趴着）");
    if (!e2keys.length || !Near(e2keys.at(-1), Unit("09-1", "Escort2"), 0.6) || e2keys.at(-1).stance !== "prone") errors.push("08-4：段末 Escort2 要在 09-1 的射击位上（趴着）");
    // 妮儿：交还操作以后才溜出沟，顺沟底往西跑进巷子口（最后在 08-4 关键帧的位置，顺子身后）；老耿喊、爬出沟被幺娃拽回；都只听得见
    const nier = PosKeys(s, "Nier").filter(k => k.move === "run");
    if (!nier.length || !Near(nier.at(-1), Unit("08-4", "Nier"), 0.8)) errors.push("08-4：妮儿要顺路沟往西跑到巷子口里（08-4 关键帧的位置）");
    const dep = nier.length ? Math.min(...PosKeys(s, "Nier").filter(k => k.t > 0).map(k => k.t)) : 0;
    if (nier.length && dep < freeT) errors.push("08-4：妮儿要等顺子进了巷子（交还操作以后）才趁乱溜出沟");
    if (!nier.length || Keys(s, "Nier").find(k => k.clip === "VilPanicRun")?.t > dep + 0.01) errors.push("08-4：妮儿跑的时候要是慌跑（VilPanicRun 从出发起）");
    const reach = ClipKey(s, "Geng", "VilReachPinned"), yank = ClipKey(s, "Yaowa", "VilNraYankBack");
    if (!reach || !yank) errors.push("08-4：老耿伸手喊（VilReachPinned）、幺娃揪腰带拽回（VilNraYankBack）都要有（成对站位由 StageChecks 核）");
    const g1 = LineT(s, "NierRuns.01");
    if (g1 === undefined || g1 < freeT) errors.push("08-4：老耿喊「妮儿！」要在顺子交还操作之后（身后只听得见）");
    if (!Has(s, "caption", e => /只听得见|看不见/.test(e.text))) errors.push("08-4：说明字要讲清楚身后的事只听得见");
    // 坡道上换窝：定计之后有人爬到旁边的射击位（趴着）；坡道上只剩幺娃和 Escort2（Squad3 死了、刘文财走了）
    if (plan === undefined || !["Yaowa", "Escort2"].some(id => PosKeys(s, id).some(k => k.t > plan && k.move === "run" && k.stance === "prone"))) errors.push("08-4：定计之后坡道上要有人打一枪换个窝（趴着爬到旁边的射击位）");
    if (s.actors.some(a => a.id === "CornerIja2")) errors.push("08-4：喊人的那个 08-3 就跑了，这一段不再演");
    if (!Has(s, "caption", e => /只剩两个|只剩幺娃/.test(e.text))) errors.push("08-4：说明字要讲清楚坡道上只剩两个");
  }
  // 09：拉着手走唯一那条路——每段眼睛都是蹲姿眼高、妮儿走着（不跑）、09-1 抓住她
  for (const id of ["09-1", "09-2", "09-3", "09-4", "09-5", "09-6"]) {
    const s = Seq(id);
    for (const c of s.camera) {
      if (c.eye && c.eye.stance !== "crouch") errors.push(`${id}：09 潜行是蹲着挪，眼睛 @${c.t} 是 ${c.eye.stance}`);
      if (!c.eye && c.from && (c.from.h ?? 1.6) > 1.2) errors.push(`${id}：09 的跟拍要蹲姿眼高（≤ 1.2），镜头 @${c.t} 是 ${c.from.h}`);
    }
    for (const k of PosKeys(s, "Nier")) if (k.move === "run" && id !== "09-5" && id !== "09-7") errors.push(`${id}：妮儿拉着手蹲着走，不跑（@${k.t}）`);
  }
  // 两路（10-24；第九版从后门进）：班长那一路（Luo / HeYoutian / Escort1）09 全程不开枪（没有他们的 muzzle）、09-1…09-6 每段末在下一帧的站位、全程不在主街上；
  // 09-2 经过 EM1 / EM2 之间那道墙的豁口（来路或站位有点在豁口 1 m 内）；
  // 09-4 翻墙：何有田压着嗓子一句 → 班长在柴垛北边起跳点面朝南播 VilIjaClimbWall（人梯：那一刻何有田在他 1.2 m 内）→ 播完（3.4 s）切到墙那边 → 另两个跟着翻；
  // 坡道上四个（含 Escort2）每段换一次窝（≥ 1 个 run 键、趴着）；每段坡道上有人冒头一枪
  {
    const CLIMB_FROM_E = { x: 104.75, z: 432.95 }, CLIMB_TO_E = { x: 104.75, z: 436.4 }, BREACH = { x: 104.75, z: 410 };
    const seqIds = ["09-1", "09-2", "09-3", "09-4", "09-5", "09-6", "09-7"];
    const OnMainStreet = p => p.x >= 97 && p.x <= 103 && p.z >= 385 && p.z <= 458;
    const throughBreach = new Set();   // 09-1 摸到豁口跟前排队、09-2 一个一个钻过去：两段里经过豁口就算
    for (const id of seqIds) {
      const s = Seq(id);
      for (const who of ["Luo", "HeYoutian", "Escort1"]) {
        const burstT = id === "09-7" ? SignalT(s, "EastGateBurst") : undefined;
        if (Has(s, "muzzle", e => e.actor === who && (burstT === undefined || e.t < burstT))) errors.push(`${id}：班长那一路的 ${who} 不开枪（撞开门之前没有他的 muzzle）`);
        // 第十版（10-30）：09-7 他们在段里就动手冲进 pocket（Escort1 死在门口），所以 09-6 末留在 EM3 南门后头（09-6 的站位），不往 09-7 的站位走
        if (id !== "09-7" && id !== "09-6") { const next = seqIds[seqIds.indexOf(id) + 1]; const last = PosKeys(s, who).at(-1) || Unit(id, who); if (!Near(last, Unit(next, who), 0.6)) errors.push(`${id}：${who} 这段末要到 ${next} 的站位，实际 (${last?.x}, ${last?.z})`); }
        if (id === "09-6") { const last = PosKeys(s, who).at(-1) || Unit(id, who); if (!Near(last, Unit("09-6", who), 0.6)) errors.push(`09-6：${who} 这段末还留在 EM3 南门后头（09-6 的站位），实际 (${last?.x}, ${last?.z})`); }
        for (const k of PosKeys(s, who)) if ([...(k.path || []), k].some(OnMainStreet)) errors.push(`${id}：${who} 走到主街上了（@${k.t}）——班长那一路不上主街`);
        if (id === "09-1" || id === "09-2") {
          let prev = Unit(id, who);
          for (const k of PosKeys(s, who)) { if (k.move !== "cut" && Samples([prev, ...(k.path || []), k], 0.25).some(p => Near(p, BREACH, 1.2))) throughBreach.add(who); prev = k; }
          if (id === "09-2" && !throughBreach.has(who)) errors.push(`09-1 / 09-2：${who} 要从 EM1 / EM2 之间那道墙的豁口 (${BREACH.x},${BREACH.z}) 钻过去`);
        }
      }
      // 第十版：坡道上只剩幺娃和 Escort2（Squad3 08-3 死了、刘文财跟顺子走巷子）
      if (id !== "09-7" && !["Yaowa", "Escort2"].some(who => PosKeys(s, who).some(k => k.move === "run" && k.stance === "prone"))) errors.push(`${id}：坡道上两个要换一次窝（打一枪，趴着爬到旁边的射击位）`);
      if (!Has(s, "muzzle", e => ["Yaowa", "Escort2"].includes(e.actor))) errors.push(`${id}：坡道上要有人冒头打一枪（吸火）`);
      if (Has(s, "muzzle", e => ["Squad3", "LiuWencai"].includes(e.actor) && (id !== "09-7" || e.actor === "Squad3"))) errors.push(`${id}：Squad3 死了、刘文财在顺子身边，坡道上没有他们的枪`);
      if (Has(s, "muzzle", e => e.actor === "Escort2") && PosKeys(s, "Escort2").some(k => Near(k, CART, 3))) errors.push(`${id}：Escort2 不在大车后头了`);
      for (const who of ["Squad3", "Bearer01", "Walker04"]) if (Keys(s, who).some(k => k.state && k.state !== "down") || PosKeys(s, who).some(k => k.move !== "cut" && k.t > 0.5)) errors.push(`${id}：${who} 08-3 就死了，不该再动`);
      // 刘文财跟顺子走巷子：每段末离顺子的眼睛 ≤ 6 m、蹲着（09-7 站着打）
      // 09-5 他在狗洞那头（本家院北边）、09-6 在灶屋门外盯堂屋，离眼睛远一点；09-4 补刺刀那一下站起来、09-7 站着打，其余蹲着
      { const far = id === "09-5" || id === "09-6" ? 12 : 6.5; const last = PosKeys(s, "LiuWencai").at(-1) || Unit(id, "LiuWencai"), eye = EndPoint(LastCam(s)); if (!eye || !Near(last, eye, far)) errors.push(`${id}：段末刘文财要在顺子身边（≤ ${far} m），实际 (${last?.x}, ${last?.z}) vs 眼睛 (${eye?.x}, ${eye?.z})`); if (id !== "09-7" && id !== "09-4" && PosKeys(s, "LiuWencai").some(k => k.stance && k.stance !== "crouch" && k.stance !== "prone")) errors.push(`${id}：刘文财潜行要蹲着`); }
    }
    const s4 = Seq("09-4");
    const whisper = LineT(s4, "LadderWhisper.01"), climbs = ["Luo", "Escort1", "HeYoutian"].map(who => ({ who, k: ClipKey(s4, who, "VilIjaClimbWall") }));
    if (whisper === undefined) errors.push("09-4：翻墙前何有田要压着嗓子说「班长，踩到老子肩膀上来」");
    for (const { who, k } of climbs) {
      if (!k) { errors.push(`09-4：${who} 要翻墙（VilIjaClimbWall）`); continue; }
      const p = PosAt("09-4", s4, who, k.t);
      if (!p || !Near(p, CLIMB_FROM_E, 0.3) || p.yawDeg !== 180) errors.push(`09-4：${who} 翻墙的根要在柴垛北边的起跳点 (${CLIMB_FROM_E.x},${CLIMB_FROM_E.z})、面朝南，实际 (${p?.x}, ${p?.z}, ${p?.yawDeg})`);
      const over = PosKeys(s4, who).find(x => x.move === "cut" && x.t > k.t && x.z > 435.5);
      if (!over || over.t < k.t + 3.3) errors.push(`09-4：${who} 翻过墙那一下要等片段播完（3.4 s）再切到墙那边`);
      if (whisper !== undefined && k.t < whisper) errors.push(`09-4：${who} 要在何有田那句之后才翻`);
    }
    const luoClimb = climbs[0].k;
    if (luoClimb) {
      const he = PosAt("09-4", s4, "HeYoutian", luoClimb.t);
      if (!he || !Near(he, CLIMB_FROM_E, 1.2)) errors.push("09-4：班长翻的时候何有田要在起跳点 1.2 m 内当垫脚（人梯：两人同时在墙根）");
      if (climbs[1].k && climbs[1].k.t < luoClimb.t + 3.3) errors.push("09-4：班长翻过去了下一个才翻");
      if (!Near(PosKeys(s4, "Luo").find(x => x.move === "cut" && x.t > luoClimb.t) || {}, CLIMB_TO_E, 0.3)) errors.push("09-4：班长翻过去要落在柴垛对面的落点");
    }
    if (!Has(s4, "caption", e => /人梯|肩膀/.test(e.text))) errors.push("09-4：人梯要有说明字");
    for (const id of ["09-5", "09-6"]) if (!Has(Seq(id), "caption", e => /班长三人/.test(e.text))) errors.push(`${id}：要有「班长三人这时在……」的说明字`);
  }
  // 09-1（第九版 10-24）：顺子一个人直着拐进往西那条死胡同，走到瓦砾跟前（眼睛先到）；妮儿从后头追上来拽他衣角（VilClingHem）、摇头、攥住他的手往回拽往南带
  {
    const s = Seq("09-1"), kf = config.keyframes.find(k => k.id === "09-1");
    const END = kf.player;
    const eyeEnd = [...s.camera].filter(c => (c.to && Near(c.to, END, 0.5)) || (c.eye && Near(c.eye, END, 0.5))).sort((a, b) => a.t - b.t)[0];
    const tEye = eyeEnd ? (eyeEnd.to ? eyeEnd.t + eyeEnd.dur : eyeEnd.t) : undefined;
    if (tEye === undefined) errors.push("09-1：顺子的眼睛要走到死胡同尽头（09-1 关键帧的玩家位置）");
    const nierThere = PosKeys(s, "Nier").find(k => k.x < 71.5 && Math.abs(k.z - 400) < 1.0);
    if (!nierThere || tEye === undefined || nierThere.t <= tEye) errors.push("09-1：顺子先到死胡同尽头，妮儿后到");
    if (!Has(s, "caption", e => /堵死|塌/.test(e.text))) errors.push("09-1：走到头被瓦砾堵死要有说明字");
    const cling = ClipKey(s, "Nier", "VilClingHem");
    if (!cling || tEye === undefined || cling.t < tEye) errors.push("09-1：妮儿追上来要拽他衣角（VilClingHem，成对站位由 StageChecks 核）");
    if (!Has(s, "caption", e => /衣角/.test(e.text))) errors.push("09-1：拽衣角要有说明字");
    if (!Has(s, "caption", e => /自己追上来|追上来的/.test(e.text))) errors.push("09-1：说明字要讲清楚她是自己追上来的");
    if (!Keys(s, "Nier").some(k => k.clip === "PvStandShakeHead")) errors.push("09-1：她朝他摇头（PvStandShakeHead）");
    if (!Has(s, "caption", e => /抓住她的手/.test(e.text)) || !Has(s, "caption", e => /枪背到背上|手上没枪/.test(e.text))) errors.push("09-1：说明字要有「抓住她的手」「手上没枪 / 枪背到背上」");
    if (!Keys(s, "Nier").some(k => k.faceTo === "player")) errors.push("09-1：妮儿回头看见是顺子");
    if (!Has(s, "caption", e => /往回拽|往南带/.test(e.text))) errors.push("09-1：她攥住他的手往回拽、往南带要有说明字");
    const last = LastCam(s), end = EndPoint(last);
    if (!end || end.z < 401.5 || Math.abs(end.x - 71) > 1.0) errors.push(`09-1：最后眼睛要拐到往南那截巷子里，实际 (${end?.x}, ${end?.z})`);
    // 第十版：刘文财跟在后头；拽衣角之后「跟到个女娃子走？」→「她屋就在那头」
    if (!HasLine(s, "LiuGirlLeads.01") || !HasLine(s, "ShunziHerHome.01") || !Order(s, ["LiuGirlLeads.01", "ShunziHerHome.01"])) errors.push("09-1：刘文财「跟到个女娃子走？」→ 顺子「她屋就在那头」");
    if (cling && LineT(s, "LiuGirlLeads.01") !== undefined && LineT(s, "LiuGirlLeads.01") < cling.t + 1.0) errors.push("09-1：刘文财那句要在妮儿拽衣角之后");
    if (!ClipKey(s, "LiuWencai", "PvCrouchTalkRifle")) errors.push("09-1：刘文财说话时蹲着（PvCrouchTalkRifle）");
  }
  // 09-2（第十一版 10-31）夹道：两处后窗底下蹲着过（≈ 30 s）：后窗 A 前刘文财先蹲下回头压手（PvCrouchPointL）、眼睛蹲在窗下站点看窗洞、屋里那个的头晃（站 / 蹲切换）、
  // 三人蹲着从窗下挪过去；路上切镜；隔墙听见窖口吼 / 哭；后窗 B 前刘文财又压手，窗里那个踹门（gateSmash 在 WY4）、吼（NextDoorShout）、开一枪（muzzle）；眼睛钉在关键帧站点
  {
    const s = Seq("09-2");
    const kf = config.keyframes.find(k => k.id === "09-2");
    const WIN_A = { x: AW.A.x, z: AW.A.z }, WIN_B = { x: AW.B.x, z: AW.B.z }, EYE_A = AW.A.stand, EYE_B = kf.player;
    if (s.durationS < 25 || s.durationS > 35) errors.push(`09-2：目标 25–35 s，现在 ${s.durationS} s`);
    if (Moves(s).length < 3) errors.push("09-2：窗下和隔墙听那几段要挪眼睛（from/to 机位 ≥ 3）");
    const eyes = Eyes(s);
    if (eyes.length < 5) errors.push("09-2：路上要用切镜跳过去（定镜 ≥ 5）");
    for (const c of eyes) if (c.eye.stance !== "crouch") errors.push(`09-2：窗下 / 路上眼睛都蹲着，@${c.t} 是 ${c.eye.stance}`);
    const atA = eyes.find(c => Near(c.eye, EYE_A, 0.4)), atB = eyes.filter(c => Near(c.eye, EYE_B, 0.4));
    if (!atA || atA.dur < 2.0) errors.push("09-2：后窗 A 底下的站点要有一条 ≥ 2 s 的定镜（蹲着看窗洞）");
    if (!atB.length) errors.push("09-2：后窗 B 底下（关键帧站点）要有定镜");
    const LookAt = (c, p) => c.eye.look ? Near(c.eye.look, p, 0.6) : Math.abs(((Math.atan2(-(p.x - c.eye.x), -(p.z - c.eye.z)) * 180 / Math.PI) - c.eye.yawDeg + 540) % 360 - 180) < 20;
    if (atA && !LookAt(atA, WIN_A)) errors.push("09-2：后窗 A 底下那条定镜要看着窗洞");
    if (atB.length && !atB.some(c => LookAt(c, WIN_B))) errors.push("09-2：后窗 B 底下的定镜要看着窗洞");
    // 刘文财在两处窗前先蹲下、回头压手（PvCrouchPointL、面朝顺子），都在眼睛到窗下之前 / 同时
    const liuSignals = Keys(s, "LiuWencai").filter(k => k.clip === "PvCrouchPointL");
    if (liuSignals.length < 2) errors.push("09-2：刘文财要在两处窗前各压一次手（PvCrouchPointL ≥ 2）");
    if (atA && liuSignals.length && liuSignals[0].t > atA.t + 0.5) errors.push("09-2：后窗 A：刘文财先压手，眼睛才停到窗下");
    if (atB.length && liuSignals.length >= 2 && liuSignals[1].t > atB[0].t + 0.5) errors.push("09-2：后窗 B：刘文财先压手，眼睛才停到窗下");
    if (PosKeys(s, "LiuWencai").some(k => k.stance && k.stance !== "crouch")) errors.push("09-2：刘文财全程蹲着");
    // 后窗 A 屋里那个（NextDoorIja2）在翻箱子：眼睛看窗洞那会儿他在屋里，有站 / 蹲切换（头在窗洞里晃）
    const InHouse = (p, h) => p && p.x > h.minX && p.x < h.maxX && p.z > h.minZ && p.z < h.maxZ;
    if (atA) {
      if (!InHouse(PosAt("09-2", s, "NextDoorIja2", atA.t + 0.5), AW.A.house)) errors.push("09-2：眼睛看后窗 A 时屋里要有那个翻箱子的（NextDoorIja2 在 WM1 西厢房里）");
      const bob = Keys(s, "NextDoorIja2").filter(k => k.t >= 0 && k.t <= atA.t + atA.dur && k.stance);
      if (!bob.some(k => k.stance === "stand") || !bob.some(k => k.stance === "crouch")) errors.push("09-2：翻箱子的那个要站起来又蹲下（头在窗洞里晃）");
    }
    // 10-31 协调人：眼睛停在窗前那几秒，屋里那个要正站着、离窗那面墙的里墙面约 1 m（蹲着的眼从窗洞里看得见头和肩）
    const StandingAt = (id, c, at) => Keys(s, id).some(k => k.stance === "stand" && k.t >= c.t - 0.6 && k.t <= c.t + c.dur - 0.8 && Near(PosAt("09-2", s, id, k.t + 0.1), at, 0.3));
    if (atA && !StandingAt("NextDoorIja2", atA, AW.A.inside)) errors.push(`09-2：眼睛停在后窗 A 前时翻箱子的那个要在 (${AW.A.inside.x},${AW.A.inside.z}) 站起来`);
    if (atB.length && !StandingAt("NextDoorIja1", atB[0], AW.B.inside)) errors.push(`09-2：眼睛停在后窗 B 前时屋里那个要在窗下墙根 (${AW.B.inside.x},${AW.B.inside.z}) 站起来`);
    if (!Has(s, "caption", e => /窗/.test(e.text) && /蹲/.test(e.text))) errors.push("09-2：说明字要讲「窗里有鬼子，蹲着过」");
    if (!Has(s, "caption", e => /压手/.test(e.text))) errors.push("09-2：刘文财回头压手要有说明字");
    // 隔墙听见：窖口的鬼子吼「出来」、地底下哭两遍（从窖口放），眼睛在窄夹道里（x≈63、z 435…450）
    if (!HasLine(s, "CellarShout.01") || !HasLine(s, "CellarShout.02")) errors.push("09-2：窄夹道里要隔墙听见窖口的鬼子吼「出来」");
    if (Sfx(s, "cellarSob").length < 2 || Sfx(s, "cellarSob").some(e => !Near(e, CELLAR, 0.3))) errors.push("09-2：地底下的哭声从窖口放两遍");
    const shout = LineT(s, "CellarShout.01");
    const eyeAtShout = eyes.filter(c => c.t <= (shout ?? 0) + 0.01).at(-1);
    if (!eyeAtShout || Math.abs(eyeAtShout.eye.x - 63) > 1.0 || eyeAtShout.eye.z < 435 || eyeAtShout.eye.z > 450) errors.push(`09-2：鬼子吼「出来」时眼睛在窄夹道里（隔墙听），实际 (${eyeAtShout?.eye?.x}, ${eyeAtShout?.eye?.z})`);
    if (!Has(s, "caption", e => /隔着墙|隔墙/.test(e.text))) errors.push("09-2：隔墙听见要有说明字");
    // 后窗 B：隔壁院（WY4，x 40…62、z 445…467.5）那个踹门（gateSmash 在 WY4 里 + VilIjaGateSmash）、吼（NextDoorShout.01，人在 B 屋里）、开一枪（muzzle，人在 B 屋里）；吼在窖口那句之后
    const WY4 = { minX: 40, maxX: 62.3, minZ: 445, maxZ: 467.5 };
    const InWY4 = p => p && p.x >= WY4.minX && p.x <= WY4.maxX && p.z >= WY4.minZ && p.z <= WY4.maxZ;
    const smash = Sfx(s, "gateSmash").find(e => InWY4(e)), nd = LineT(s, "NextDoorShout.01"), ndShot = s.events.find(e => e.type === "muzzle" && /^NextDoorIja/.test(e.actor));
    if (!smash || !ClipKey(s, "NextDoorIja1", "VilIjaGateSmash")) errors.push("09-2：后窗 B 屋里要有踹门（gateSmash 在隔壁院 WY4 里 + VilIjaGateSmash）");
    if (nd === undefined || !InHouse(PosAt("09-2", s, "NextDoorIja1", nd), AW.B.house)) errors.push("09-2：后窗 B 屋里要有人吼（NextDoorShout.01，人在 WY4 东厢房里）");
    if (!ndShot || !InHouse(PosAt("09-2", s, ndShot.actor, ndShot.t), AW.B.house)) errors.push("09-2：后窗 B 屋里要响一枪（NextDoorIja 的 muzzle，人在 WY4 东厢房里）");
    if (nd !== undefined && (shout === undefined || nd < shout)) errors.push("09-2：先隔墙听见窖口的鬼子吼，再到后窗 B 听见隔壁");
    if (nd !== undefined) { const e = eyes.filter(c => c.t <= nd + 0.01).at(-1); if (!e || !Near(e.eye, EYE_B, 0.4)) errors.push("09-2：隔壁那个吼的时候眼睛在后窗 B 底下的关键帧站点上"); }
    if (ndShot && ndShot.t < (nd ?? 0)) errors.push("09-2：先踹门吼，再开枪");
    if (!Has(s, "caption", e => /隔壁/.test(e.text))) errors.push("09-2：隔壁院的事要有说明字");
    if (!Has(s, "caption", e => /豁口/.test(e.text))) errors.push("09-2：末尾要点出窗下就是豁口（接 09-3）");
    if (Has(s, "caption", e => /不在门口停|缩回墙根|半掩/.test(e.text))) errors.push("09-2：不再有门口瞥见 / 缩回墙根那一拍的说明字");
    // 远处枪声的节奏照旧：坡道上一打一回、机枪一梭一梭
    if (!Has(s, "sfx", e => e.name === "mgBurstFar") || s.events.filter(e => e.type === "sfx" && e.name === "rifleShot").length < 3) errors.push("09-2：远处枪声的节奏要留着（坡道一打一回、机枪一梭一梭）");
  }
  // 09-3：眼睛在西配房里窗后（x < 67.75）看院子；汉子爬出 → 被捅（成对）；媳妇被拖（成对）；老太太爬出；妮儿呜咽 + 捂嘴说明字；没按到那句
  {
    const s = Seq("09-3");
    // 第十版：眼睛一进窗后就不再挪（没有大缸、没有探头那一拍）：到窗后以后所有镜头都是窗后的眼睛，窗后待 ≥ 20 s
    const AT_WINDOW = p => p && p.x < 67.75 && p.x >= 66.6 && Math.abs(p.z - 452) <= 1.0;
    const arrive = [...s.camera].filter(c => c.to && AT_WINDOW(c.to)).sort((a, b) => a.t - b.t)[0];
    const after = arrive ? s.camera.filter(c => c.t > arrive.t + arrive.dur - 0.01) : [];
    if (!arrive) errors.push("09-3：眼睛要走到西配房里窗后（x 66.6…67.75、z≈452）");
    else if (!after.length || after.some(c => !c.eye || !AT_WINDOW(c.eye)) || s.durationS - (arrive.t + arrive.dur) < 20) errors.push("09-3：到了窗后眼睛就不再挪：之后的镜头全是窗后的眼睛，待 ≥ 20 s");
    if (!Has(s, "caption", e => /豁口/.test(e.text))) errors.push("09-3：从西北角豁口钻进去要有说明字");
    // 刘文财蹲在豁口里边：隔壁那两个扛着东西从窄夹道（x≈63）小跑过去，他指墙「隔壁还有」（压着嗓子）
    const ndRun = ["NextDoorIja1", "NextDoorIja2"].map(id => PosKeys(s, id).filter(k => k.move === "run" && Math.abs(k.x - 63) < 1.2 && k.z > 440 && k.z < 469));
    if (ndRun.some(r => r.length < 2)) errors.push("09-3：隔壁那两个要背着东西从 L4 拐进窄夹道（x≈63）往北跑过豁口外、停在北边那院门口（每人 ≥ 2 个 run 键）");
    for (const id of ["NextDoorIja1", "NextDoorIja2"]) { const r = PosKeys(s, id).filter(k => k.move === "run"); if (r.length >= 2 && !(r[0].z > r.at(-1).z && r.at(-1).z < 446 && r.at(-1).z > 440)) errors.push(`09-3：${id} 要往北跑、停在 WA1 院门口（z 440…446），实际到 (${r.at(-1)?.x}, ${r.at(-1)?.z})`); }
    if (!ClipKey(s, "NextDoorIja1", "VilIjaGateSmash") || !Sfx(s, "gateSmash").some(e => Math.abs(e.x - 63.5) < 1.5 && Math.abs(e.z - 441.5) < 1.5)) errors.push("09-3：到了北边那院（WA1）门口要踹门（VilIjaGateSmash + gateSmash 在 WA1 院门）");
    const nextDoor = LineT(s, "LiuNextDoor.01");
    if (nextDoor === undefined) errors.push("09-3：刘文财要说「隔壁还有」");
    else {
      const liu = PosAt("09-3", s, "LiuWencai", nextDoor);
      if (!liu || liu.x > 66.0 || liu.z < 449.5 || liu.z > 453) errors.push(`09-3：说「隔壁还有」时刘文财要蹲在豁口里边（x ≤ 66、z 449.5…453），实际 (${liu?.x}, ${liu?.z})`);
      if (!ClipKey(s, "LiuWencai", "PvCrouchPointL")) errors.push("09-3：刘文财冲顺子指那面墙（PvCrouchPointL）");
      if (!["NextDoorIja1", "NextDoorIja2"].some(id => PosKeys(s, id).some(k => k.t > 0 && k.t <= nextDoor + 0.5))) errors.push("09-3：隔壁那两个先跑起来，刘文财才说「隔壁还有」");
    }
    if (s.lines.some(l => l.line === "DoorPeek.01") || Has(s, "caption", e => /大缸/.test(e.text) && !/没有|不/.test(e.text))) errors.push("09-3：第十版删掉了探头 / 大缸那一拍");
    if (!Has(s, "caption", e => /拦不住|手占着/.test(e.text))) errors.push("09-3：说明字要讲清楚手占着、拦不住院里的事");
    if (!Has(s, "caption", e => /松手/.test(e.text)) || s.lines.filter(l => l.line === "NierWhimperFirst.01").length < 2 && !Sfx(s, "cellarSob").some(e => e.t > (LineT(s, "NierWhimperFirst.01") ?? Infinity) + 3)) errors.push("09-3：松手她哭出声（再放一次呜咽）、院里一个鬼子扭头看一眼、再捂紧");
    const climb = ClipKey(s, "CellarMan", "VilHandsUpClimbOut"), stabbed = ClipKey(s, "CellarMan", "VilStabbedFall"), thrust = ClipKey(s, "CellarIja2", "VilIjaBayonetThrust");
    if (!climb) errors.push("09-3：汉子要举着手从窖里爬出来（VilHandsUpClimbOut）");
    if (!stabbed || !thrust) errors.push("09-3：汉子刚爬出来就要被刺刀捅倒（VilIjaBayonetThrust + VilStabbedFall，成对站位由 StageChecks 核）");
    const climbS = table.village?.clips?.VilHandsUpClimbOut?.duration ?? 5.0;
    if (climb && stabbed && stabbed.t < climb.t + climbS) errors.push(`09-3：要爬完站直举着手（片段 ${climbS} s）才捅`);
    if (stabbed && !stabbed.clipHold) errors.push("09-3：VilStabbedFall 末帧是尸体，要 clipHold 停住");
    const st = table.village?.stages?.cellarPit;
    const climbers = [["CellarMan", climb], ["CellarWife", ClipKey(s, "CellarWife", "VilHandsUpClimbOut")], ["CellarGranny", ClipKey(s, "CellarGranny", "VilHandsUpClimbOut")]];
    for (const [id, k] of climbers) {
      if (!k) { errors.push(`09-3：${id} 也要举着手爬出来`); continue; }
      const p = PosAt("09-3", s, id, k.t), yaw = Keys(s, id).filter(x => Number.isFinite(x.yawDeg) && x.t <= k.t + 0.01).at(-1)?.yawDeg;
      const d = p ? Math.max(Math.abs(p.x - CELLAR.x), Math.abs(p.z - CELLAR.z)) : NaN;
      if (!(d >= 1.0 + (st?.wallBehindM ?? 0.1) - 0.02 && d <= 1.25)) errors.push(`09-3：${id} 爬出窖的根要在坑口沿外 0.1 m（离坑心 1.1 m 上下），实际 ${R(d)} m（(${p?.x}, ${p?.z})）`);
      if (!Number.isFinite(yaw)) errors.push(`09-3：${id} 的根要写明朝向（yawDeg，背对窖口）`);
      else {
        const away = Math.atan2(-(p.x - CELLAR.x), -(p.z - CELLAR.z)) * 180 / Math.PI;
        if (Math.abs(WrapDeg(yaw - away)) > 25) errors.push(`09-3：${id} 要背对窖口（朝 ${R(away)}°），实际 ${yaw}°`);
      }
    }
    if (climb && stabbed) {
      const p0 = PosAt("09-3", s, "CellarMan", climb.t), p1 = PosAt("09-3", s, "CellarMan", stabbed.t);
      const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z), want = Math.abs(st?.end?.z ?? 0.38);
      if (Math.abs(moved - want) > 0.08) errors.push(`09-3：汉子爬完要切到清单 root.end（根前 ${want} m）再被捅，实际挪了 ${R(moved)} m`);
    }
    if (!ClipKey(s, "CellarIja3", "VilIjaDragByArm") || !ClipKey(s, "CellarWife", "VilDraggedByArm")) errors.push("09-3：拖媳妇要用 VilIjaDragByArm + VilDraggedByArm（成对站位由 StageChecks 核）");
    if (!PosKeys(s, "CellarIja3").some(k => k.move === "drag") || !PosKeys(s, "CellarWife").some(k => k.move === "drag")) errors.push("09-3：拖的两人都要倒退着走（move drag）");
    if (!PosKeys(s, "CellarWife").some(k => k.z < 449)) errors.push("09-3：媳妇要被拖进北屋");
    if (!Has(s, "caption", e => /石磨/.test(e.text))) errors.push("09-3：石磨上绑着的老汉要有说明字");
    if (!HasLine(s, "NierWhimperFirst.01")) errors.push("09-3：妮儿要呜咽");
    if (!Has(s, "caption", e => /捂住她的嘴/.test(e.text))) errors.push("09-3：捂嘴的按键时刻要有说明字");
    if (!Has(s, "caption", e => /没按到/.test(e.text))) errors.push("09-3：「没按到不判失败」要在说明字里写一句");
    const w = LineT(s, "NierWhimperFirst.01");
    if (w !== undefined && !Bursts(s).some(b => b > w && b < w + 9)) errors.push("09-3：呜咽那几秒外头要响一梭机枪盖过去");
    if (!ClipKey(s, "Nier", "VilCowerWhimper")) errors.push("09-3：妮儿呜咽前要蹲着捂嘴发抖（VilCowerWhimper）");
    if (Sfx(s, "cellarSob").length < 1) errors.push("09-3：窖里的哭声");
  }
  // 09-4（第十版 10-30）哨子·一刀：街上枪声密了 + 哨（ijaShoutFar 顶哨声）→ CellarHurry → 挑襁褓 / 婴儿哭断 → 老太太爬窖 + 磕钢盔扔手榴弹 + 闷响（CellarBlast）→
  // 五个（CellarIja1/2/3 + NextDoorIja1/2）出院门去 pocket → CellarIja4 钻进门房前翻东西 → 刘文财先猫过去、顺子跟上 → 一刀砍偏（stab + GatehouseHowl）→ 扭打 → 刘文财补刺刀 → 倒
  {
    const s4 = Seq("09-4");
    const GATEHOUSE = Unit("09-4", "CellarIja4");
    if (s4.lines.some(l => l.line === "DoorPeek.01") || Has(s4, "caption", e => /大缸/.test(e.text) && !/没有|不/.test(e.text))) errors.push("09-4：第十版删掉了探头 / 大缸那一拍");
    const whistle = [...Sfx(s4, "ijaShoutFar"), ...Sfx(s4, "whistle")].sort((a, b) => a.t - b.t)[0];
    const hurry = LineT(s4, "CellarHurry.01");
    if (!whistle || !Near(whistle, { x: 108.5, z: 462 }, 6)) errors.push("09-4：路口要吹哨（哨声用 ijaShoutFar 顶，放在丁字路口）");
    if (hurry === undefined || !whistle || hurry < whistle.t) errors.push("09-4：街上枪声密了、吹哨，搜窖的头儿才吼「快了结、去路口」");
    if (whistle && !Has(s4, "muzzle", e => ["Yaowa", "Escort2"].includes(e.actor) && e.t <= whistle.t + 1.0)) errors.push("09-4：哨子之前街上枪声要先密起来（坡道上照班长说的打紧了）");
    if (!Has(s4, "caption", e => /哨/.test(e.text))) errors.push("09-4：丁字路口吹哨要有说明字");
    // 五个离开：到 pocket（最后在 09-5 的站位）；门房剩一个
    const blast4 = SignalT(s4, "CellarBlast");
    for (const id of ["CellarIja1", "CellarIja2", "CellarIja3", "NextDoorIja1", "NextDoorIja2"]) {
      const run = PosKeys(s4, id).filter(k => k.move === "run");
      if (!run.length || blast4 === undefined || run[0].t < blast4 || !Near(run.at(-1), Unit("09-5", id), 0.8)) errors.push(`09-4：${id} 要在窖里闷响之后出院门往路口跑、最后蹲在墙角（09-5 的站位），实际 (${run.at(-1)?.x}, ${run.at(-1)?.z})`);
    }
    const gh = PosKeys(s4, "CellarIja4").find(k => Near(k, GATEHOUSE, 0.6));
    const leave = Math.max(...["CellarIja1", "CellarIja2", "CellarIja3"].map(id => PosKeys(s4, id).find(k => blast4 !== undefined && k.t > blast4)?.t ?? Infinity));   // 三个起身出发的时刻
    if (!gh || gh.t < leave) errors.push("09-4：三个走了以后，CellarIja4 才钻进院门边的门房前翻东西（关键帧的位置）");
    if (!Has(s4, "caption", e => /门房/.test(e.text))) errors.push("09-4：门房要有说明字");
    // 一刀：刘文财先猫过去（他的 run / walk 键早于眼睛离窗）、顺子跟上（眼睛到关键帧玩家位置）；stab + GatehouseHowl + 扭身扑人；刘文财 VilIjaBayonetThrust 补刺刀之后才倒
    const kfP = config.keyframes.find(k => k.id === "09-4").player;
    const eyeGo = [...s4.camera].filter(c => c.to && Near(c.to, kfP, 0.6)).sort((a, b) => a.t - b.t)[0];
    const liuGo = PosKeys(s4, "LiuWencai").find(k => k.t > (gh?.t ?? 0));   // 他起身出发那个键
    if (!eyeGo) errors.push("09-4：顺子的眼睛要从窗后到门房跟前（关键帧 09-4 的玩家位置）");
    if (!liuGo || !eyeGo || liuGo.t > eyeGo.t) errors.push("09-4：刘文财先猫腰过去，顺子才跟上");
    if (!Has(s4, "caption", e => /刺刀/.test(e.text) && /先/.test(e.text))) errors.push("09-4：刘文财抽刺刀、先猫过去要有说明字");
    const stabs = Sfx(s4, "stab").filter(e => Near(e, GATEHOUSE, 1.5)).sort((a, b) => a.t - b.t);
    const howl = LineT(s4, "GatehouseHowl.01"), thrust = ClipKey(s4, "LiuWencai", "VilIjaBayonetThrust"), fall = Keys(s4, "CellarIja4").find(k => k.state === "down");
    if (stabs.length < 2) errors.push("09-4：门房那儿要两刀（顺子砍一刀、刘文财补一刺刀：stab ≥ 2）");
    if (howl === undefined || !stabs.length || howl < stabs[0].t || howl > stabs[0].t + 1.0) errors.push("09-4：顺子砍偏了鬼子才嚎（GatehouseHowl 紧跟第一刀）");
    if (!ClipKey(s4, "CellarIja4", "VilIjaShoulderCharge") || (howl !== undefined && ClipKey(s4, "CellarIja4", "VilIjaShoulderCharge").t < howl)) errors.push("09-4：嚎了以后他扭过身扑人（VilIjaShoulderCharge）");
    if (!thrust || howl === undefined || thrust.t < howl) errors.push("09-4：刘文财扑上来补刺刀（VilIjaBayonetThrust）要在鬼子扭身之后");
    if (!fall || !thrust || fall.t < thrust.t) errors.push("09-4：补了刺刀 CellarIja4 才倒（down）");
    if (!Has(s4, "caption", e => /不干净|砍偏/.test(e.text)) || !Has(s4, "caption", e => /手抖|手在抖/.test(e.text))) errors.push("09-4：「这一刀不干净」「顺子手抖」要有说明字");
    if (!Has(s4, "caption", e => /开枪/.test(e.text) && /重来/.test(e.text))) errors.push("09-4：硬打支线（玩家若开枪……从进西配房前重来）写进说明字");
    if (!PosKeys(s4, "Nier").some(k => k.x > 68.5 && k.x < 70.5 && Math.abs(k.z - 455.6) < 1.2)) errors.push("09-4：妮儿留在西配房门外的墙根");
    if (eyeGo && !Has(s4, "caption", e => /松开妮儿/.test(e.text) && e.t <= eyeGo.t + 0.5)) errors.push("09-4：顺子松开妮儿跟上要有说明字");
    const bundleOn = Keys(s4, "Bundle").find(k => k.visible === true), fling = ClipKey(s4, "CellarIja2", "VilIjaBayonetLiftFling");
    if (!bundleOn) errors.push("09-4：襁褓占位要在挑起来甩到窖沿时露面");
    if (!fling) errors.push("09-4：挑襁褓要用 VilIjaBayonetLiftFling");
    else if (bundleOn && (bundleOn.t < fling.t + 1.4 || bundleOn.t > fling.t + 1.8)) errors.push("09-4：襁褓要在甩出去那一下（片段 1.5 s）露面");
    const cry = s4.events.find(e => e.type === "sfx" && e.name === "babyCry");
    if (!cry) errors.push("09-4：孩子要在哭（babyCry）");
    else if (fling) {
      const stabAt = fling.t + 0.5, end = cry.t + SFX_FILE.babyCry;
      if (Math.abs(end - stabAt) > 0.15) errors.push(`09-4：婴儿哭要在刺刀扎下去那一刻（${R(stabAt)} s）断，文件放完是 ${R(end)} s`);
      const granny = PosAt("09-4", s4, "CellarGranny", cry.t);
      if (!Near(cry, granny, 1.0)) errors.push("09-4：婴儿哭要从老太太怀里（她身边 1 m 内）放");
    }
    if (!Keys(s4, "CellarGranny").some(k => k.state === "down")) errors.push("09-4：老太太要炸在窖里");
    if (!ClipKey(s4, "CellarGranny", "VilKneelCrawlToPit")) errors.push("09-4：老太太要跪着往窖里爬（VilKneelCrawlToPit）");
    const lob = ClipKey(s4, "CellarIja1", "VilIjaHelmetGrenadeLob"), blast = s4.events.find(e => e.type === "explosion" && Near(e, CELLAR, 1.0));
    if (!lob || !blast) errors.push("09-4：要有磕钢盔扔手榴弹（VilIjaHelmetGrenadeLob）和窖里的爆炸");
    else if (blast.t < lob.t + 1.7 || blast.t > lob.t + 2.4) errors.push("09-4：手榴弹 1.2 s 脱手飞进窖里，闷响要在片段 1.7–2.4 s");
    if (SignalT(s4, "CellarBlast") === undefined) errors.push("09-4：窖里闷响要打开 CellarBlast");
    if (!ClipKey(s4, "Nier", "VilCowerWhimper")) errors.push("09-4：妮儿缩在墙根发抖（VilCowerWhimper）");
  }
  // 09-5：穿院子（窖口僵住）、夹道、本家院；狗洞（根在墙西面外 0.25、面朝东，播完切到墙那边）；拔门闩（门板里侧 0.28）→ SideGateOpen 1.3–2.0 s；眼睛等在便门外
  {
    const s = Seq("09-5");
    if (Moves(s).length < 8) errors.push("09-5：从街坊家到本家院要分几段走（from/to 机位 ≥ 8）");
    if (!Has(s, "caption", e => /僵住/.test(e.text))) errors.push("09-5：妮儿在窖口僵住要有说明字");
    const crawl = ClipKey(s, "Nier", "VilCrawlHole");
    if (!crawl) errors.push("09-5：妮儿要趴下钻狗洞（VilCrawlHole）");
    else {
      const p = PosAt("09-5", s, "Nier", crawl.t);
      if (!p || Math.abs(p.x - 91.5) > 0.12 || Math.abs(p.z - 473) > 0.3) errors.push(`09-5：钻洞的根要在狗洞西口（x≈91.5, z≈473），实际 (${p?.x}, ${p?.z})`);
      const through = PosKeys(s, "Nier").find(k => k.move === "cut" && k.t > crawl.t && k.x > 92.2);
      if (!through || through.t < crawl.t + 2.9) errors.push("09-5：爬过去的那一下要等片段播完（3 s）再切到墙那边");
    }
    const unbolt = ClipKey(s, "Nier", "VilUnboltDoor"), opened = SignalT(s, "SideGateOpen");
    if (!unbolt) errors.push("09-5：妮儿要拔门闩（VilUnboltDoor）");
    else {
      if (opened === undefined || opened < unbolt.t + 1.3 || opened > unbolt.t + 2.0) errors.push("09-5：门开的信号要落在拔门闩片段的 1.3–2.0 s");
      const p = PosAt("09-5", s, "Nier", unbolt.t);
      if (!p || p.x < 92.4 || p.x > 92.7 || Math.abs(p.z - 484.6) > 0.4) errors.push(`09-5：拔门闩的人要站在门板里侧 0.28 m（x≈92.53、z≈484.6），实际 (${p?.x}, ${p?.z})`);
    }
    const last = LastCam(s), end = EndPoint(last);
    if (!end || !Near(end, SIDE_OUT, 0.6)) errors.push(`09-5：最后眼睛在便门外（本家院这边），实际 (${end?.x}, ${end?.z})`);
    if (!Has(s, "caption", e => /狗洞/.test(e.text))) errors.push("09-5：狗洞要有说明字");
    // 第十版：刘文财先趴下钻（VilCrawlHole、prone），肩膀卡住退出来（之后有 crouch 键）；妮儿推开他自己钻（她的 VilCrawlHole 在他之后）
    const liuCrawl = ClipKey(s, "LiuWencai", "VilCrawlHole");
    if (!liuCrawl || liuCrawl.stance !== "prone") errors.push("09-5：刘文财要先趴下钻狗洞（VilCrawlHole、prone）");
    else {
      const p = PosAt("09-5", s, "LiuWencai", liuCrawl.t);
      if (!p || p.x > 92 || Math.abs(p.z - 473) > 0.6) errors.push(`09-5：刘文财钻洞的根要在狗洞西口（x < 92、z≈473），实际 (${p?.x}, ${p?.z})`);
      if (!Keys(s, "LiuWencai").some(k => k.t > liuCrawl.t && k.stance === "crouch")) errors.push("09-5：刘文财卡住要退出来（之后有 crouch 键）");
      if (PosKeys(s, "LiuWencai").some(k => k.t > liuCrawl.t && k.x > 92)) errors.push("09-5：刘文财钻不过去，不能到墙那边");
      if (!crawl || crawl.t < liuCrawl.t + 1.0) errors.push("09-5：妮儿推开他自己钻（她的 VilCrawlHole 在他之后）");
      if (!Has(s, "caption", e => /卡住/.test(e.text))) errors.push("09-5：肩膀卡住退出来要有说明字");
    }
    if (!Has(s, "caption", e => /脚步/.test(e.text) && /贴墙/.test(e.text))) errors.push("09-5：拔门闩时墙外有人跑过、三人贴墙不动要有说明字");
    if (Sfx(s, "ijaShoutFar").length < 2) errors.push("09-5：东头哨子声和喊声一阵比一阵近（ijaShoutFar ≥ 2）");
  }
  // 09-6：进便门往院里看，顺着南墙根挪到看得见堂屋门里的后背；「屁股对到老子」；贴西墙往灶屋门口摸：响了才挪
  {
    const s = Seq("09-6");
    if (!HasLine(s, "ButtToMe.01")) errors.push("09-6：要有「屁股对到老子」");
    const kf = config.keyframes.find(k => k.id === "09-6");
    const butt = LineT(s, "ButtToMe.01");
    const eye = butt === undefined ? null : Eyes(s).filter(c => c.t <= butt + 0.01).at(-1);
    if (!eye || !Near(eye.eye, kf.player, 0.4)) errors.push("09-6：说「屁股对到老子」时眼睛要在关键帧那个看得进堂屋门的点上");
    if (!Has(s, "caption", e => /后背/.test(e.text))) errors.push("09-6：堂屋门里是机枪组的后背要有说明字");
    const bursts = Bursts(s), moves = Moves(s).filter(c => c.t > (butt ?? 8));
    if (moves.length < 3) errors.push("09-6：贴西墙往灶屋摸要分 ≥3 段");
    for (const m of moves) if (!bursts.some(b => m.t - b >= 0 && m.t - b < 2.5)) errors.push(`09-6：${m.t} s 的挪动前 2.5 s 内没有机枪响（要响了才走）`);
    if (PosKeys(s, "Nier").filter(k => k.t > (butt ?? 8)).length < 3) errors.push("09-6：妮儿要跟着一段一段挪到灶屋跟前");
    if (!Has(s, "caption", e => /灶屋门口/.test(e.text))) errors.push("09-6：得先过灶屋门口要有说明字");
    // 第十版：灶屋那个背对门蹲在灶台边，顺子摸到背后一刀悄悄解决（stab + ShotCollapse → down）；没有扑倒、没有罐子；刘文财在灶屋门外盯着堂屋
    const kStab = Sfx(s, "stab").find(e => Near(e, Unit("09-6", "KitchenIja"), 1.0)), kDown = Keys(s, "KitchenIja").find(k => k.state === "down");
    if (!kStab || !kDown || kDown.t < kStab.t || kDown.t > kStab.t + 2.5) errors.push("09-6：灶屋那个要被从背后一刀解决（stab 在他身边、紧接着 down）");
    if (kStab && !Eyes(s).some(c => c.t <= kStab.t + 0.01 && c.t + c.dur >= kStab.t - 0.01 && c.eye.x <= 96.2 && Math.abs(c.eye.z - 478.5) < 1.5)) errors.push("09-6：一刀那一下眼睛要在灶屋里他背后");
    if (!ClipKey(s, "KitchenIja", "VilCrouchHold") || Keys(s, "KitchenIja").some(k => /Charge|Pin/.test(k.clip || ""))) errors.push("09-6：他背对门蹲着（VilCrouchHold），不扑人");
    if (s.lines.some(l => /^Beiwu|^Kitchen/.test(l.line)) || Has(s, "sfx", e => e.name === "jarShatter")) errors.push("09-6：这一支是悄悄解决：没有扑出来的吼、没有罐子");
    if (!Has(s, "caption", e => /悄悄/.test(e.text)) || !Has(s, "caption", e => /被发现/.test(e.text))) errors.push("09-6：说明字要写「悄悄解决」和被发现那一支");
    if (!Has(s, "caption", e => /刘文财/.test(e.text) && /堂屋/.test(e.text))) errors.push("09-6：刘文财在灶屋门外盯着堂屋要有说明字");
    if (Has(s, "muzzle", e => e.actor === "player" || e.actor === "LiuWencai")) errors.push("09-6：摸到屁股后头之前哪个都不准放枪");
  }
  // 09-7（第十版 10-30，约一分半一口气）：贴堂屋门两边从背后开打，机枪手、压弹的先倒 → 分队长「后头！」甩手榴弹进院子（院墙塌、满院土）→ 屋里一间间打 →
  // Rifle2 从烟里扑出来撞翻顺子（北屋西间仰视）、压刺刀、妮儿从门外摸进来咬手腕（不放慢）、惨叫、拔刀砍倒；同一时刻墙外：班长那一路两颗手榴弹（pocket，第一声晚于院里第一枪）、
  // 鬼子喊、撞门（EastGateBurst 在前两声之后）、换大刀「杀」、砍倒拖人的；墙角那个临死甩一颗落在门口，Escort1 死；何有田挨一刺刀；剩下三个往东街跑；分队长带两个翻窗
  {
    const s6 = Seq("09-7");
    const BEIWU = { minX: 95, maxX: 105, minZ: 470, maxZ: 475 };
    const InBeiwu = p => p && p.x >= BEIWU.minX && p.x <= BEIWU.maxX && p.z >= BEIWU.minZ && p.z <= BEIWU.maxZ;
    const firstShot = Math.min(...s6.events.filter(e => e.type === "muzzle" && (e.actor === "player" || e.actor === "LiuWencai")).map(e => e.t), Infinity);
    if (!Number.isFinite(firstShot)) errors.push("09-7：顺子要从背后开打（player 的 muzzle）");
    const downT = id => Keys(s6, id).find(k => k.state === "down")?.t;
    const mg = [downT("MgGunner"), downT("MgLoader")], rest = [downT("MgThird"), downT("Rifle1")];
    if (mg.some(t => t === undefined) || rest.some(t => t === undefined)) errors.push("09-7：北屋里机枪组三个、西间那个（Rifle1）全要倒");
    else if (!(Math.max(...mg) < Math.min(...rest)) || Math.min(...mg) < firstShot) errors.push("09-7：先撂倒机枪手和压弹的（在第一枪之后、其余人之前）");
    if (!Bursts(s6).some(b => b >= firstShot - 3 && b <= Math.min(...mg.filter(Number.isFinite), Infinity))) errors.push("09-7：开打那两三秒机枪还在往街上扫");
    if (!Has(s6, "caption", e => /先倒|机枪手/.test(e.text))) errors.push("09-7：先打机枪组要有说明字");
    // 分队长「后头！」+ 手榴弹进院子：throw 键、院里（z 475…486）爆炸 r ≥ 1.5、大土烟、说明字「满院土」
    const behind = LineT(s6, "LeaderBehind.01");
    const leaderThrow = Keys(s6, "Leader").filter(k => k.throw);
    const yardBlast = s6.events.filter(e => e.type === "explosion" && e.radius >= 1.5 && e.x > 95 && e.x < 108 && e.z > 475 && e.z < 486).sort((a, b) => a.t - b.t);
    if (behind === undefined || behind < firstShot) errors.push("09-7：挨了枪分队长才吼「后头！」");
    if (!leaderThrow.length || behind === undefined || leaderThrow[0].t < behind) errors.push("09-7：分队长吼完往院里甩手榴弹（throw 键）");
    if (!yardBlast.length || !leaderThrow.length || yardBlast[0].t < leaderThrow[0].t + 1.5) errors.push("09-7：手榴弹要炸在院子里（explosion r ≥ 1.5、z 475…486）");
    if (!yardBlast.length || !Has(s6, "smoke", e => e.kind === "SmokeDust" && Math.abs(e.t - yardBlast[0].t) < 1.0 && Near(e, yardBlast[0], 3))) errors.push("09-7：院里的爆炸要冒一大团土（SmokeDust）");
    if (!Has(s6, "caption", e => /满院/.test(e.text) && /土/.test(e.text))) errors.push("09-7：「院墙塌一截、满院土」要有说明字");
    if (!Has(s6, "caption", e => /一间间/.test(e.text))) errors.push("09-7：「屋里一间间打」要有说明字");
    // 扑倒、压刺刀、咬手腕、惨叫、拔刀：全在北屋西间（扑出来的是西间那个 Rifle1）
    const lunge = s6.lines.find(l => l.line === "BeiwuLunge.01"), bite = s6.lines.find(l => l.line === "BeiwuBitten.01");
    if (!lunge || !bite || bite.t < lunge.t + 4) errors.push("09-7：先扑出来吼，压一会儿刺刀，再被咬惨叫");
    const charge = ClipKey(s6, "Rifle1", "VilIjaShoulderCharge");
    if (!charge || !lunge || Math.abs(charge.t - lunge.t) > 0.6) errors.push("09-7：Rifle1 从烟里扑出来撞人（VilIjaShoulderCharge 和吼同时）");
    else { const p = PosAt("09-7", s6, "Rifle1", charge.t); if (!InBeiwu(p)) errors.push(`09-7：扑倒要在北屋里，实际 (${p?.x}, ${p?.z})`); }
    const down = Eyes(s6).filter(c => c.eye.stance === "prone" && c.eye.pitchDeg > 20);
    if (!down.length || down.some(c => !InBeiwu(c.eye))) errors.push("09-7：要有北屋西间里倒地仰视的镜头（prone、pitch > 20、眼睛在北屋里）");
    if (down.length && lunge && down[0].t < lunge.t) errors.push("09-7：被撞翻了才切到仰视");
    const pins = ClipKeys(s6, "Rifle1", "VilIjaPinBayonet"), biteKey = ClipKey(s6, "Nier", "VilBiteWrist");
    if (pins.length < 2 || !pins.at(-1).clipHold) errors.push("09-7：压刺刀要重起几遍、最后一遍 clipHold（被咬甩手后仰）");
    if (pins.length && pins.at(-1).clipRelease !== 2) errors.push("09-7：最后一遍压刺刀要 clipRelease 2");
    if (!biteKey) errors.push("09-7：妮儿要咬手腕（VilBiteWrist，成对站位由 StageChecks 核）");
    else if (!InBeiwu(PosAt("09-7", s6, "Nier", biteKey.t))) errors.push("09-7：咬手腕要在北屋里（妮儿从门外摸进来）");
    if (biteKey && pins.length && Math.abs(biteKey.t - (pins.at(-1).t + 1.5)) > 0.1) errors.push("09-7：咬手腕要比最后一遍压刺刀晚 1.5 s 起播");
    if ((s6.slowmo || []).length) errors.push("09-7：咬手腕按正常速度放，不放慢（10-22 用户）");
    if (biteKey && bite && bite.t < biteKey.t + 0.5) errors.push("09-7：咬中了（0.5 s）才惨叫");
    if (!Has(s6, "caption", e => /拔刀/.test(e.text))) errors.push("09-7：拔刀砍的玩家操作时刻要有说明字");
    if (!Has(s6, "caption", e => /连按/.test(e.text))) errors.push("09-7：连按往外推要有说明字");
    const r2down = downT("Rifle1");
    if (r2down === undefined || !bite || r2down < bite.t) errors.push("09-7：惨叫之后 Rifle1 才被砍倒");
    if (!ClipKey(s6, "Nier", "VilCowerWhimper")) errors.push("09-7：砍完妮儿要蹲在炕沿下发抖（VilCowerWhimper）");
    if (!Has(s6, "caption", e => /刘文财/.test(e.text) && /顾不上/.test(e.text))) errors.push("09-7：刘文财在另一间顾不上要有说明字");
    // 墙外（同一时刻）：两颗手榴弹落 pocket（第一声晚于院里第一枪）、鬼子喊、撞门在前两声之后、大刀、杀、砍倒拖人的；墙角那个临死甩一颗落门口 → Escort1 死；何有田挨刺刀；三个跑
    {
      const POCKET = { x: 106.6, z: 460.5 };
      const blasts = s6.events.filter(e => e.type === "explosion" && e.radius >= 1.5 && Near(e, POCKET, 3.2)).sort((a, b) => a.t - b.t);
      if (blasts.length < 2) errors.push(`09-7：东边墙外要至少两声手榴弹爆炸（pocket 里），现在 ${blasts.length}`);
      else {
        if (blasts[0].t < firstShot) errors.push(`09-7：墙角第一声爆炸（${blasts[0].t}）要在院里第一枪（${R(firstShot)}）之后：北屋这头一响班长才动手`);
        if (blasts[0].t > firstShot + 15) errors.push("09-7：墙角那边要在院里开打 15 s 内跟上（同一时刻）");
        for (const b of blasts) if (!Has(s6, "sfx", e => e.name === "grenadeBlast" && Math.abs(e.t - b.t) < 0.05 && Near(e, b, 0.1))) errors.push(`09-7：爆炸 @${b.t} 要有 grenadeBlast 音效放在落点`);
      }
      const throws = ["Luo", "HeYoutian", "Escort1"].flatMap(id => Keys(s6, id).filter(k => k.throw).map(k => ({ id, k })));
      if (throws.length !== 2) errors.push(`09-7：班长那一路要甩两颗手榴弹（throw 键），现在 ${throws.length}`);
      for (const { id, k } of throws) { if (!Near(k.throw, POCKET, 3.2)) errors.push(`09-7：${id} 的手榴弹要落在 pocket 里`); const p = PosAt("09-7", s6, id, k.t); if (!p || p.z > 458) errors.push(`09-7：${id} 甩手榴弹时要在门后头（院里）`); }
      if (!HasLine(s6, "PocketGrenade.01")) errors.push("09-7：墙角的鬼子看见手榴弹要喊一声");
      const burstT = SignalT(s6, "EastGateBurst");
      if (burstT === undefined || blasts.length < 2 || burstT < blasts[1].t + 0.8) errors.push("09-7：前两声炸了以后才撞开门（EastGateBurst 在第二声爆炸之后）");
      if (burstT !== undefined && !Has(s6, "sfx", e => e.name === "gateSmash" && Math.abs(e.t - burstT) < 0.1 && Near(e, POCKET_GATE, 0.3))) errors.push("09-7：撞门要有 gateSmash 放在门上");
      const dadao = Keys(s6, "Luo").find(k => k.weapon === "Dadao");
      if (!dadao || burstT === undefined || dadao.t > burstT + 0.1) errors.push("09-7：撞门前班长要换大刀（weapon Dadao）");
      const kill = LineT(s6, "LuoKillShout.01");
      if (kill === undefined || burstT === undefined || kill < burstT) errors.push("09-7：撞开门才吼「杀——！」");
      const InPocket = p => p && p.x >= 103.25 && p.x <= 110 && p.z >= 458 && p.z <= 463.6;
      for (const id of ["Luo", "HeYoutian"]) { const last = PosKeys(s6, id).at(-1) || Unit("09-7", id); if (!last || !InPocket(last)) errors.push(`09-7：${id} 最后要在 pocket 里，实际 (${last?.x}, ${last?.z})`); }
      for (const id of ["CornerIja1", "NextDoorIja1", "CellarIja3"]) if (!Keys(s6, id).some(k => k.state === "down")) errors.push(`09-7：墙角的 ${id} 要倒（手榴弹两个、砍倒一个）`);
      if (!Keys(s6, "CellarIja3").some(k => k.state === "down" && burstT !== undefined && k.t > burstT) || !ClipKey(s6, "Luo", "LuoDadaoChopRear")) errors.push("09-7：撞开门以后班长要抡刀砍倒拖人的那个（LuoDadaoChopRear）");
      // Escort1：墙角那个临死甩出一颗（CornerIja1 的 throw）落在门口，他扑倒、死了
      const dying = Keys(s6, "CornerIja1").find(k => k.throw), e1 = downT("Escort1"), e1Hit = ClipKey(s6, "Escort1", "ShotCollapse");
      if (!dying || burstT === undefined || dying.t < burstT) errors.push("09-7：撞开门以后墙角那个挨了手榴弹的鬼子临死甩出一颗（CornerIja1 的 throw）");
      const doorBlast = dying && s6.events.find(e => e.type === "explosion" && e.radius >= 1.5 && e.t > dying.t && Near(e, Unit("10-1", "Escort1"), 1.5));
      if (!doorBlast) errors.push("09-7：那一颗要落在门口 Escort1 倒的地方炸");
      if (e1 === undefined || !e1Hit || !doorBlast || e1Hit.t < doorBlast.t - 0.2 || e1 < e1Hit.t) errors.push("09-7：Escort1 要被那一颗炸倒（ShotCollapse → down）");
      if (e1 !== undefined && !Near(PosAt("09-7", s6, "Escort1", e1), Unit("10-1", "Escort1"), 0.6)) errors.push("09-7：Escort1 要死在门口（10-1 关键帧的位置）");
      if (!Has(s6, "caption", e => /扑倒/.test(e.text) && /死/.test(e.text))) errors.push("09-7：后送队的兵扑倒在门口死了要有说明字");
      if (!ClipKey(s6, "CellarIja2", "VilIjaBayonetThrust") || !Has(s6, "caption", e => /何有田/.test(e.text) && /刺刀|一刀/.test(e.text))) errors.push("09-7：何有田胳膊挨一刺刀（挑襁褓那个 VilIjaBayonetThrust + 说明字）");
      if (Keys(s6, "HeYoutian").some(k => k.state === "down")) errors.push("09-7：何有田只是挨了一刀，不死");
      for (const id of ["CellarIja1", "CellarIja2", "NextDoorIja2"]) if (!PosKeys(s6, id).some(k => k.move === "run" && k.x > 108.5)) errors.push(`09-7：${id} 要往东街跑`);
      for (const id of ["Leader", "Rifle3"]) {
        // 第十一版（10-31 协调人）：不用爬墙片段（库里没有对得上 0.9 窗台的）——在窗里蹲下、蹲着从窗洞挪到窗外（人一直在窗洞高度里）、那 0.7 s 镜头切开看别处、再站起来跑
        if (ClipKey(s6, id, "VilIjaClimbWall")) errors.push(`09-7：${id} 别用 VilIjaClimbWall 翻 0.9 m 的窗台（人会挂到窗洞上方的墙面上）`);
        const c = Keys(s6, id).find(k => k.stance === "crouch" && k.t > 30);
        const at = c && PosAt("09-7", s6, id, c.t);
        if (!c || !at || !InBeiwu(at) || Math.abs(at.x - BACK_WINDOW.x) > 0.5 || at.z - BACK_WINDOW.z > 1.6) errors.push(`09-7：${id} 要在东间后窗 (${BACK_WINDOW.x},${BACK_WINDOW.z}) 里头跟前蹲下，实际 (${at?.x}, ${at?.z})`);
        const out = c && PosKeys(s6, id).find(k => k.t > c.t && k.z < BACK_WINDOW.z && k.stance === "crouch");
        if (!out || Math.abs(out.x - BACK_WINDOW.x) > 0.5 || BACK_WINDOW.z - out.z > 1.0 || out.t - c.t > 1.5) errors.push(`09-7：${id} 要蹲着从窗洞挪到窗外正对面（x ±0.5、墙外 ≤ 1 m、蹲下后 ≤ 1.5 s），实际 (${out?.x}, ${out?.z}) @${out?.t}`);
        if (out) {
          const mid = out.t - 0.35, cam = [...s6.camera].filter(k => k.t <= mid + 0.01).sort((p, q) => p.t - q.t).at(-1);
          if (!cam || !cam.eye || !cam.eye.look?.actor) errors.push(`09-7：${id} 过窗台那一下（@${mid.toFixed(2)}）镜头要切开看人（眼睛 look 是演员锚），实际 ${JSON.stringify(cam?.eye?.look ?? cam?.eye?.yawDeg)}`);
          if (!Keys(s6, id).some(k => k.t > out.t && k.t < out.t + 0.6 && k.stance === "stand")) errors.push(`09-7：${id} 出了窗要站起来跑`);
        }
        if (!PosKeys(s6, id).some(k => k.t > (out?.t ?? Infinity) && k.z < 470 && k.move === "run")) errors.push(`09-7：${id} 出窗以后要在墙外往东街跑`);
        if (Keys(s6, id).some(k => k.state === "down")) errors.push(`09-7：${id} 跑了，不死`);
      }
      if (blasts.length) { const eye = [...s6.camera].filter(c => c.t <= blasts[0].t + 0.01).at(-1); const p = eye?.eye || eye?.to || eye?.from; if (!p || InPocket(p) || p.x < 95 || p.x > 105 || p.z < 470 || p.z > 486) errors.push("09-7：墙角爆炸那一刻眼睛要还在北屋 / 老耿家院里（听得见、看不见）"); }
      if (!Has(s6, "caption", e => /听得见|看不见/.test(e.text))) errors.push("09-7：要有说明字：隔着墙听得见、看不见");
    }
    if (!Has(s6, "caption", e => /机枪哑了/.test(e.text))) errors.push("09-7：拍末「机枪哑了」要有说明字");
  }
  // 10-1（第十版 10-30）会合：枪眼已哑（09-7 打完），班长在 pocket 里冲坡道吼，坡道上剩下的幺娃、Escort2 冲上来；眼睛从东间枪眼看 pocket：班长看一眼门口倒着的 Escort1，不说话；两路会合
  {
    const s = Seq("10-1");
    if (Has(s, "muzzle", e => e.actor === "player") || ["MgGunner", "MgLoader", "MgThird", "Rifle1", "KitchenIja"].some(id => Keys(s, id).some(k => k.state && k.state !== "down"))) errors.push("10-1：北屋在 09-7 已经打完了，这一段开场他们都倒着、顺子不再开枪");
    if (!HasLine(s, "MgSilenced.01")) errors.push("10-1：班长要吼「机枪哑了！冲！」");
    if (Keys(s, "Escort1").some(k => k.state && k.state !== "down") || PosKeys(s, "Escort1").some(k => k.move !== "cut")) errors.push("10-1：Escort1 死在门口，不再动");
    if (!Has(s, "caption", e => /看一眼/.test(e.text) && /不说话/.test(e.text))) errors.push("10-1：班长看一眼门口倒着的那个兵、不说话要有说明字");
    if (!Has(s, "caption", e => /倒着/.test(e.text) && /门口/.test(e.text))) errors.push("10-1：眼睛看 pocket 时门口倒着的那个兵要有说明字");
    const silenced = SignalT(s, "MgSilenced"), charge = LineT(s, "MgSilenced.01");
    if (silenced === undefined || charge === undefined || charge < silenced) errors.push("10-1：机枪先哑（信号）班长才喊冲");
    // 两路（10-24）：班长这时在路口墙角（pocket）里、刚砍完（手里是大刀），冲坡道上吼；坡道三个和大车后头的 Escort2 顺主街冲上来；两路会合的说明字
    const luoAt = charge === undefined ? null : PosAt("10-1", s, "Luo", charge);
    if (!luoAt || luoAt.x < 103.5 || luoAt.x > 110.3 || luoAt.z < 457.8 || luoAt.z > 463.5) errors.push(`10-1：班长喊「机枪哑了」时要在路口墙角（pocket）里，实际 (${luoAt?.x}, ${luoAt?.z})`);
    const dadao1 = Keys(s, "Luo").filter(k => k.weapon !== undefined).sort((a, b) => a.t - b.t);
    if (!dadao1.length || dadao1[0].weapon !== "Dadao") errors.push("10-1：开场班长手里是大刀（刚砍完）");
    if (!Keys(s, "Luo").some(k => k.weapon === "HanYang")) errors.push("10-1：班长后来要把大刀插回去、端起枪（weapon HanYang）");
    if (ClipKey(s, "Luo", "VilNraWaveCharge")) errors.push("10-1：班长不再从大车后头挥手冲（他在墙角里）");
    // 第十版：坡道上只剩幺娃和 Escort2（Squad3 死了、刘文财在北屋里）；两个开场都趴在射击位上、班长喊了才冲
    for (const id of ["Yaowa", "Escort2"]) {
      const run = PosKeys(s, id).find(k => k.move === "run"); if (!run || charge === undefined || run.t < charge) errors.push(`10-1：班长喊了冲 ${id} 才顺主街冲上来`);
      const k0 = PosKeys(s, id)[0]; if (!k0 || k0.t > 0.01 || k0.z > 386 || k0.stance !== "prone") errors.push(`10-1：${id} 开场要趴在坡道的射击位上`);
    }
    if (s.actors.some(a => a.id === "Squad3" && a.keys.some(k => k.move && k.move !== "cut"))) errors.push("10-1：Squad3 死在坡道上，不再冲");
    if (PosKeys(s, "LiuWencai").some(k => k.z < 400)) errors.push("10-1：刘文财在北屋里，不在坡道上");
    if (Has(s, "caption", e => /大车后头那个/.test(e.text) && !/没有/.test(e.text))) errors.push("10-1：没有「大车后头那个兵」了");
    if (!Has(s, "caption", e => /会合/.test(e.text))) errors.push("10-1：两路怎么会合要有说明字");
    // 眼睛要到东间枪眼（或堂屋门口）看 pocket：有一条镜头落在北屋东半（x ≥ 101）
    if (!s.camera.some(c => (c.eye && c.eye.x >= 101 && c.eye.z < 475) || (c.to && c.to.x >= 101 && c.to.z < 475))) errors.push("10-1：眼睛要到东间枪眼看墙角里的班长（两路会合）");
    if (ClipKey(s, "HeYoutian", "PvLegHitKneelClutch") === undefined && !Has(s, "caption", e => /何有田/.test(e.text) && /胳膊|刺刀/.test(e.text))) errors.push("10-1：何有田胳膊挨了刺刀要看得出来（捂着 / 说明字）");
  }
  // 10-2（第十版）：调过来；缴来的机枪拖到石碾后（镜头从北屋一路到石碾）；一换弹斗他们就跳一个门洞；试探：ProbeOrders、LuoCallouts；倒两个在 25–50 m；跑掉的六个里 Rifle4 倒；担架开始过胡同
  {
    const s = Seq("10-2");
    for (const l of ["TurnEast.01", "ProbeOrders.01", "ProbeOrders.02", "LuoCallouts.01", "LuoCallouts.02"]) if (!HasLine(s, l)) errors.push(`10-2：要有台词 ${l}`);
    if (!Order(s, ["TurnEast.01", "ProbeOrders.01", "LuoCallouts.02", "ProbeOrders.02", "LuoCallouts.01"])) errors.push("10-2：顺序：调过来 → 跑到下一个门洞 → 右边墙豁子 → 趴下 → 左手第二道门");
    const downs = ["EastIja1", "EastIja2"].filter(id => Keys(s, id).some(k => k.state === "down"));
    if (downs.length !== 2) errors.push("10-2：冲到半道的要倒两个");
    for (const id of downs) { const p = PosKeys(s, id).at(-1); const d = p ? Math.hypot(p.x - ROLLER.x, p.z - ROLLER.z) : 0; if (d < 25 || d > 50) errors.push(`10-2：${id} 倒在离石碾 ${R(d)} m 处（要 25–50 m）`); }
    if (!Keys(s, "Rifle3").some(k => k.state === "down")) errors.push("10-2：往东跑的五个里跑在最后的（Rifle3）要被扫倒");
    for (const id of ["Leader", "CellarIja1", "CellarIja2", "NextDoorIja2"]) if (Keys(s, id).some(k => k.state === "down") || !Near(PosKeys(s, id).at(-1), Unit("10-2", id), 0.8)) errors.push(`10-2：${id} 要活着跑进街北第一个院（10-2 的站位）`);
    // 换弹斗节奏：说明字 + 玩家停火 ≥ 3 s 的窗口里鬼子跳门洞（ProbeOrders.01）
    const reload = s.events.find(e => e.type === "caption" && /换弹斗/.test(e.text));
    if (!reload) errors.push("10-2：一换弹斗（压六个桥夹，好几秒）要有说明字");
    else {
      const shots = s.events.filter(e => e.type === "muzzle" && e.actor === "player").map(e => e.t).sort((a, b) => a - b);
      const gap = shots.some((t, i) => i > 0 && t - shots[i - 1] >= 3.0 && shots[i - 1] <= reload.t + 2 && t >= reload.t);
      if (!gap) errors.push("10-2：换弹斗那几秒玩家要停火 ≥ 3 s");
      const probe1 = LineT(s, "ProbeOrders.01");
      if (probe1 === undefined || probe1 < reload.t - 0.5 || probe1 > reload.t + 8) errors.push("10-2：一换弹斗他们就跳一个门洞（ProbeOrders.01 在换弹斗说明字之后几秒内）");
    }
    // 担架计数说明字从 10-2 起（1 / 12 …）、后送队说明字
    const counts = s.events.filter(e => e.type === "caption" && /担架过去了 \d+ \/ 12/.test(e.text)).map(e => Number(e.text.match(/(\d+) \/ 12/)[1]));
    if (!counts.length || counts[0] !== 1 || counts.some((n, i) => i > 0 && n !== counts[i - 1] + 1)) errors.push(`10-2：担架计数说明字要从 1 / 12 起一个一个递增，现在 ${counts.join(",")}`);
    if (!Has(s, "caption", e => /陆续/.test(e.text))) errors.push("10-2：东头大路上还有人陆续来要有说明字");
    for (const id of ["FarIja1", "FarIja2", "FarIja3"]) { const p = PosKeys(s, id).at(-1); if (!p || p.x < 215) errors.push(`10-2：${id} 在东街东头慢慢往西挪、留在东头（x ≥ 215）`); }
    for (const id of ["EastIja3", "EastIja4", "EastIja5"]) if (!Near(PosKeys(s, id).at(-1), Unit("10-2", id), 0.6)) errors.push(`10-2：${id} 要扑进场院口`);
    if (!Has(s, "muzzle", e => e.actor === "player" && e.count >= 4)) errors.push("10-2：玩家要用机枪扫（muzzle count ≥ 4）");
    if (!Has(s, "muzzle", e => e.actor === "EastIja10") || !Has(s, "muzzle", e => e.actor === "EastIja12")) errors.push("10-2：街南后墙的豁子、第一道弯的枪眼里要打冷枪");
    const prone = Eyes(s).find(c => c.eye.stance === "prone");
    if (!prone || !Near(prone.eye, config.keyframes.find(k => k.id === "10-2").player, 0.4)) errors.push("10-2：要趴到石碾后头朝东");
    if (Moves(s).filter(c => c.t < (prone?.t ?? 0)).length < 4) errors.push("10-2：机枪从北屋拖到石碾要一路跑过去（≥ 4 段跟拍）");
    if (!Has(s, "caption", e => /弹斗/.test(e.text))) errors.push("10-2：弹斗 / 子弹只有这些要有说明字");
  }
  // 10-3（第十版）：轻机枪压过来；军官三句；掷弹筒 ≥3 发越落越近、一发落在胡同口打死一个抬担架的（Bearer02）；一组冲路口空地被扫倒（ChargeIja1…3）；
  // 砸门往西 + 信号；班长「左手院子堵到」；顺子把机枪掉头对准石碾西北角那道院门（眼睛转向 POCKET_GATE + 说明字）；担架计数接着数；「幺娃接到」挪到 10-4
  {
    const s = Seq("10-3");
    for (const l of ["EastEndOfficer.01", "EastEndOfficer.02", "EastEndOfficer.03", "HoldEastStreet.01"]) if (!HasLine(s, l)) errors.push(`10-3：要有台词 ${l}`);
    if (!Order(s, ["EastEndOfficer.01", "EastEndOfficer.02", "EastEndOfficer.03", "HoldEastStreet.01"])) errors.push("10-3：顺序：退到庙后 → 掷弹筒 → 砸北边 → 左手院子堵到");
    if (HasLine(s, "HoldEastStreet.02") || Keys(s, "Yaowa").some(k => k.weapon === "Type11")) errors.push("10-3：「幺娃，接到！」挪到 10-4 了，这一段顺子还在机枪上");
    if (!Has(s, "muzzle", e => e.actor === "EastMg1")) errors.push("10-3：土地庙后的轻机枪要打");
    const impacts = s.events.filter(e => e.type === "sfx" && e.name === "mortarImpact").sort((a, b) => a.t - b.t);
    if (impacts.length < 3) errors.push("10-3：掷弹筒至少落三发");
    const dRoller = e => Math.hypot(e.x - ROLLER.x, e.z - ROLLER.z);
    if (impacts.length >= 3 && !(dRoller(impacts.at(-1)) < dRoller(impacts[0]) && dRoller(impacts.at(-1)) < 6)) errors.push("10-3：掷弹筒越落越近，最后一发落到石碾跟前（< 6 m）");
    if (impacts.length && dRoller(impacts[0]) < 10) errors.push("10-3：第一发要落在十几米外");
    // 一发落在胡同口（离 Bearer02 ≤ 3 m）打死一个抬担架的：ShotCollapse → down 在关键帧 Bearer02 的位置
    const b2 = Keys(s, "Bearer02").find(k => k.state === "down"), b2Hit = ClipKey(s, "Bearer02", "ShotCollapse");
    const laneHit = impacts.find(e => Near(e, Unit("10-3", "Bearer02"), 3.0));
    if (!laneHit || !b2 || !b2Hit || b2Hit.t < laneHit.t - 0.2 || b2.t < b2Hit.t) errors.push("10-3：掷弹筒一发落在胡同口（Bearer02 身边 3 m 内），他 ShotCollapse → down");
    if (b2 && !Near(PosAt("10-3", s, "Bearer02", b2.t), Unit("10-3", "Bearer02"), 0.6)) errors.push("10-3：抬担架的要倒在胡同口（关键帧 Bearer02 的位置）");
    if (!Has(s, "caption", e => /胡同口/.test(e.text) && /抬担架/.test(e.text))) errors.push("10-3：掷弹筒打死抬担架的要有说明字");
    // 一组冲路口空地被机枪扫倒：三个先在东街上活着往西跑，玩家一梭（count ≥ 4）后 ShotCollapse → down 在关键帧位置
    for (const id of ["ChargeIja1", "ChargeIja2", "ChargeIja3"]) {
      const hit = ClipKey(s, id, "ShotCollapse"), dn = Keys(s, id).find(k => k.state === "down");
      const run = PosKeys(s, id).filter(k => k.move === "run");
      if (!run.length || !hit || !dn || dn.t < hit.t) errors.push(`10-3：${id} 要冲路口空地（run）、被机枪扫倒（ShotCollapse → down）`);
      else { if (!Near(PosAt("10-3", s, id, dn.t), Unit("10-3", id), 0.8)) errors.push(`10-3：${id} 要倒在关键帧的位置（东街口）`); if (!Has(s, "muzzle", e => e.actor === "player" && e.count >= 4 && e.t <= hit.t && e.t >= hit.t - 3)) errors.push(`10-3：${id} 倒之前 3 s 内玩家要扫一梭（count ≥ 4）`); }
    }
    if (!Has(s, "caption", e => /扫倒/.test(e.text) && /三个|一组/.test(e.text))) errors.push("10-3：一组被扫倒要有说明字");
    if (!Has(s, "sfx", e => e.name === "mortarPop") || !Has(s, "smoke", e => Math.hypot(e.x - 164.2, e.z - 456.6) < 3)) errors.push("10-3：掷弹筒要有「嘭」和麦秸垛后冒的烟");
    // 两路（10-24）：北角院门（pocket 北门）09-7 已被班长撞开，院子链上只剩两道门要砸：场院西隔墙 → 北侧第一个院西墙，往西挪；
    // 第二道（北侧第一个院西墙 x 118.25）那一踹 = NorthYardGatesBroken；最前头那个穿院子到敞着的北角院门外
    const YARD1_DOOR = { x: 118.25, z: 455 };
    const bash = s.events.filter(e => e.type === "sfx" && e.name === "gateSmash").sort((a, b) => a.t - b.t);
    if (bash.length < 2) errors.push("10-3：砸门声至少两处（gateSmash：场院的门、北侧第一个院的门）");
    for (let i = 1; i < bash.length; i++) if (bash[i].x > bash[i - 1].x + 0.01) errors.push("10-3：砸门声要一个院子一个院子往西挪");
    if (bash.some(b => Near(b, POCKET_GATE, 1.5))) errors.push("10-3：北角院门是班长撞开的、敞着，不再砸它");
    const smashes = ["NorthIja1", "NorthIja2", "NorthIja3", "NorthIja4"].flatMap(id => ClipKeys(s, id, "VilIjaGateSmash").map(k => ({ id, k, p: PosAt("10-3", s, id, k.t) }))).sort((a, b) => a.k.t - b.k.t);
    if (smashes.length < 2) errors.push(`10-3：两道门都要有人枪托砸门（VilIjaGateSmash），现在 ${smashes.length}`);
    for (const sm of smashes) { const h = sm.k.t + 0.45 - SFX_FILE.gateSmashFirstHit; if (!bash.some(b => Math.abs(b.t - h) < 0.06 && Near(b, sm.p, 1.2))) errors.push(`10-3：${sm.id} 砸门那一下要有 gateSmash 落在门上`); }
    const on = SignalT(s, "NorthYardGatesBroken");
    const yard1 = smashes.find(sm => sm.id === "NorthIja3");
    if (!yard1 || on === undefined || Math.abs(on - (yard1.k.t + 1.6)) > 0.3) errors.push("10-3：北侧第一个院的西门要在那一踹（片段 1.6 s）倒下（信号）");
    if (!yard1 || Math.abs(yard1.p.z - YARD1_DOOR.z) > 0.3 || yard1.p.x < YARD1_DOOR.x + 0.5 || yard1.p.x > YARD1_DOOR.x + 0.95 || yard1.p.yawDeg !== 90) errors.push("10-3：砸北侧第一个院西门的要站在门板东边 0.55 m（院里）、面朝西");
    if (!Has(s, "caption", e => /敞着/.test(e.text))) errors.push("10-3：说明字要讲清楚北角院门是班长撞开的、敞着");
    // 门倒了以后北边的穿院子链钻到位（最后在 10-3 的站位；NorthIja1 到北角院门外探头、被一梭子扫回去再出来，最后还在门外）
    for (const id of ["NorthIja1", "NorthIja3", "NorthIja4"]) { const run = PosKeys(s, id).filter(k => k.move === "run"); const last = PosKeys(s, id).at(-1) || Unit("10-3", id); if (on === undefined || !run.length || run[0].t < on || !Near(last, Unit("10-3", id), 0.6)) errors.push(`10-3：门倒了以后 ${id} 要穿院子链钻到位（最后在 10-3 的站位），实际 (${last?.x}, ${last?.z})`); }
    for (const id of ["LiuWencai", "Squad1"]) if (!Near(PosKeys(s, id).at(-1) || Unit("10-3", id), Unit("10-3", id), 0.6)) errors.push(`10-3：${id} 要蹲到北角口上堵`);
    // 机枪掉头对准石碾西北角那道院门：「左手院子堵到」之后有说明字，眼睛（趴姿）转向 POCKET_GATE（±20°）并在那儿守着；门洞一冒头玩家一梭扫进门洞
    const turnCap = s.events.find(e => e.type === "caption" && /掉头/.test(e.text) && /院门/.test(e.text));
    const hold = LineT(s, "HoldEastStreet.01");
    if (!turnCap || hold === undefined || turnCap.t < hold) errors.push("10-3：「左手院子堵到」之后顺子把机枪掉头对准那道院门（说明字）");
    else {
      const kfP = config.keyframes.find(k => k.id === "10-3").player;
      const wantYaw = Math.atan2(-(POCKET_GATE.x - kfP.x), -(POCKET_GATE.z - kfP.z)) * 180 / Math.PI;
      const turned = Eyes(s).filter(c => c.t >= turnCap.t - 2 && c.eye.stance === "prone" && Near(c.eye, kfP, 0.4) && [c.eye.yawDeg, c.eye.toYawDeg].some(y => Number.isFinite(y) && Math.abs(WrapDeg(y - wantYaw)) <= 20));
      if (!turned.length) errors.push(`10-3：机枪掉头那一下眼睛（趴姿、石碾后）要转向北角院门（yaw ≈ ${R(wantYaw)}°）`);
      const lastEye = Eyes(s).at(-1);
      if (!lastEye || !Number.isFinite(lastEye.eye.yawDeg) || Math.abs(WrapDeg(lastEye.eye.yawDeg - wantYaw)) > 20) errors.push("10-3：段末眼睛还守着那道院门");
      if (!Has(s, "muzzle", e => e.actor === "player" && e.count >= 6 && e.t > turnCap.t) || !Has(s, "caption", e => /门洞/.test(e.text) && /缩回去/.test(e.text) && e.t > turnCap.t)) errors.push("10-3：门洞里一冒头玩家一梭扫进门洞、他缩回去（muzzle count ≥ 6 + 说明字）");
    }
    const counts3 = s.events.filter(e => e.type === "caption" && /担架过去了 \d+ \/ 12/.test(e.text)).map(e => Number(e.text.match(/(\d+) \/ 12/)[1]));
    if (!counts3.length || counts3.some((n, i) => i > 0 && n !== counts3[i - 1] + 1) || counts3[0] !== (Seq("10-2").events.filter(e => e.type === "caption" && /担架过去了 \d+ \/ 12/.test(e.text)).length + 1)) errors.push(`10-3：担架计数接着 10-2 往下数，现在 ${counts3.join(",")}`);
    if (!Has(s, "caption", e => /弹斗/.test(e.text))) errors.push("10-3：弹斗还剩几发要有说明字");
    if (!Keys(s, "Escort2").some(k => k.state === "down") === false) errors.push("10-3：Escort2 这一段还活着（10-4 才中枪）");
  }
  // 10-4（第十版）：后送队贴着石碾背后拐进窄胡同（担架跑 ≥ 10 副）、担架计数数到 12 / 12；背着的一对；老耿的车进胡同；妮儿抱腿（VilHugLegs clipHold）；老耿看一眼；
  // 顺子旁边的 Escort2 脖子中枪倒在石碾上；排长胳膊中枪（PvLegHitKneelClutch）；弹斗快空「幺娃，接到！」→ 幺娃接过机枪（Type11）趴到石碾后
  {
    const s = Seq("10-4");
    const counts4 = s.events.filter(e => e.type === "caption" && /担架过去了 \d+ \/ 12/.test(e.text)).map(e => Number(e.text.match(/(\d+) \/ 12/)[1]));
    if (!counts4.length || counts4.at(-1) !== 12 || counts4.some((n, i) => i > 0 && n !== counts4[i - 1] + 1)) errors.push(`10-4：担架计数要一个一个数到 12 / 12，现在 ${counts4.join(",")}`);
    const e2Hit = ClipKey(s, "Escort2", "ShotCollapse"), e2Down = Keys(s, "Escort2").find(k => k.state === "down");
    if (!e2Hit || !e2Down || e2Down.t < e2Hit.t) errors.push("10-4：顺子旁边的 Escort2 要脖子中枪倒下（ShotCollapse → down）");
    else {
      if (!Near(PosAt("10-4", s, "Escort2", e2Down.t), Unit("10-4", "Escort2"), 0.8) || !Near(PosAt("10-4", s, "Escort2", e2Down.t), ROLLER, 2.5)) errors.push("10-4：Escort2 要倒在石碾上（关键帧的位置）");
      if (!Has(s, "muzzle", e => /^EastIja/.test(e.actor) && e.t <= e2Hit.t && e.t >= e2Hit.t - 2.0)) errors.push("10-4：Escort2 中枪前 2 s 内东街要有冷枪");
      if (!Has(s, "sfx", e => e.name === "bodyFall" && Near(e, Unit("10-4", "Escort2"), 1.0))) errors.push("10-4：Escort2 倒地要有 bodyFall");
      if (!Has(s, "caption", e => /脖子中枪/.test(e.text))) errors.push("10-4：脖子中枪要有说明字");
    }
    const offHit = ClipKey(s, "Officer", "PvLegHitKneelClutch");
    if (!offHit || Keys(s, "Officer").some(k => k.state === "down") || !Has(s, "caption", e => /排长/.test(e.text) && /中枪/.test(e.text))) errors.push("10-4：排长胳膊中枪（PvLegHitKneelClutch 顶 + 说明字），不死");
    const take = LineT(s, "HoldEastStreet.02");
    const mg = Keys(s, "Yaowa").find(k => k.weapon === "Type11");
    if (take === undefined || !mg || mg.t < take) errors.push("10-4：「幺娃，接到！」之后幺娃才接过机枪（weapon Type11）");
    if (!Near(PosKeys(s, "Yaowa").at(-1), ROLLER, 3.0) || PosKeys(s, "Yaowa").at(-1)?.stance !== "prone") errors.push("10-4：幺娃最后趴在石碾后");
    if (e2Down && take !== undefined && take < e2Down.t) errors.push("10-4：Escort2 倒了以后弹斗才快空、幺娃才接枪");
    const lastEye = EndPoint(LastCam(s));
    if (!lastEye || lastEye.stance !== "stand" || !Near(lastEye, ROLLER, 4.5) || lastEye.x > ROLLER.x) errors.push("10-4：段末顺子退到石碾南边站着（10-5 从那儿被掀翻）");
    if (!Has(s, "caption", e => /弹斗/.test(e.text))) errors.push("10-4：弹斗快空要有说明字");
    const litters = config.keyframes.find(k => k.id === "10-4").units.filter(u => u.kind === "litter");
    const ran = litters.filter(u => PosKeys(s, u.id).some(k => k.move === "run" && Near(k, u, 0.6)));   // 跑到关键帧的位置（前头几副之后还继续进胡同）
    if (ran.length < 10) errors.push(`10-4：担架要一副一副跑到位（≥ 10），现在 ${ran.length}`);
    if (!ClipKey(s, "Helper01", "VilNraCarryOnBack") || !ClipKey(s, "Walker01", "VilRideOnBack")) errors.push("10-4：后送队里要有一对背着走的（Helper01 + Walker01）");
    const hug = ClipKey(s, "Nier", "VilHugLegs");
    if (!hug || !hug.clipHold) errors.push("10-4：抱腿要用 VilHugLegs 且 clipHold（站位由 StageChecks 核）");
    if (!Has(s, "caption", e => /看了一眼/.test(e.text))) errors.push("10-4：老耿看一眼地上的人、看一眼顺子要有说明字");
    if (!PosKeys(s, "GengCart").some(k => Math.abs(k.x - 109) < 0.5 && k.z > 474)) errors.push("10-4：驴车要进胡同");
    if (!PosKeys(s, "Geng").some(k => k.t > (hug?.t ?? 0) && k.z > 488)) errors.push("10-4：老耿抱完腿要拽着驴往胡同里走");
    if (!Has(s, "caption", e => /挤一点/.test(e.text))) errors.push("10-4：驴车在窄胡同里挤一点能过要有说明字");
  }
  // 10-5（第十版 10-30）挨炮：吹哨全退（EastEndOfficer.04）、枪口火全停、静 ≥ 2 s → 第一发落在石碾边：镜头被抛（位移 ≥ 2 m）、shake / flash / tinnitus / black、枪脱手 →
  // 班长凑到跟前（耳鸣里）「顺儿！……还能动不？起来！撤——走胡同！」拽起来 → 「枪就在脚边：按 F 弯腰捡回来」→ 第二、三发（BarrageHit、草顶着火）→ 幺娃卸枪栓扔水缸、何有田卡手榴弹、刘文财架着排长进胡同；没有「炮！进屋！」
  {
    const s = Seq("10-5");
    for (const l of ["EastEndOfficer.04", "LuoPullsUp.01", "HeGrenadeGate.01"]) if (!HasLine(s, l)) errors.push(`10-5：要有台词 ${l}`);
    if (!Order(s, ["EastEndOfficer.04", "LuoPullsUp.01", "HeGrenadeGate.01"])) errors.push("10-5：顺序：全体后退 → 顺儿还能动不 → 滚！表挡事！");
    if (s.lines.some(l => /^LuoShellsIn/.test(l.line)) || Has(s, "caption", e => /炮！进屋/.test(e.text))) errors.push("10-5：「炮！进屋！」「撤！走胡同！跟斗老子！」第十版删了");
    const back = LineT(s, "EastEndOfficer.04"), backDur = table.lines?.get("EastEndOfficer.04")?.durationS ?? 2.8;
    const first = [...Sfx(s, "artilleryNear"), ...Sfx(s, "shellBlast")].sort((a, b) => a.t - b.t)[0];
    if (!first) errors.push("10-5：要有炮落下来（artilleryNear / shellBlast）");
    else {
      if (back === undefined || first.t < back + backDur + 2.0) errors.push("10-5：鬼子吹哨全退之后要静两三秒第一发炮才落");
      // 静：吹哨那句说完到第一发之间 ≥ 2 s 没有枪声（muzzle、rifleShot / mgBurst / rifleVolley）和爆炸
      const noisy = s.events.filter(e => e.t > back + backDur - 0.01 && e.t < first.t - 0.01 && (e.type === "muzzle" || e.type === "explosion" || (e.type === "sfx" && /rifle|mgBurst|grenade|artillery|shell|mortar/.test(e.name))));
      const quietFrom = noisy.length ? Math.max(...noisy.map(e => e.t)) : back + backDur;
      if (first.t - quietFrom < 2.0) errors.push(`10-5：第一发之前要静 ≥ 2 s（最后一声响在 ${R(quietFrom)}，炮落在 ${first.t}）`);
      if (!Has(s, "caption", e => /静/.test(e.text) && e.t < first.t)) errors.push("10-5：「静了。两三秒」要有说明字");
      if (!Near(first, ROLLER, 4.0)) errors.push(`10-5：第一发要落在石碾边（≤ 4 m），实际 (${first.x}, ${first.z})`);
      // 镜头被抛：第一发那一刻起 1 s 内有一条 from→to 位移 ≥ 2 m、落点贴地（h ≤ 0.6），接着趴姿仰视；shake / flash / tinnitus / black 都有
      const toss = s.camera.find(c => c.from && c.to && c.t >= first.t - 0.05 && c.t <= first.t + 1.0 && Math.hypot(c.to.x - c.from.x, c.to.z - c.from.z) >= 2.0);
      if (!toss) errors.push("10-5：炮落了镜头要被抛开（from→to 位移 ≥ 2 m）");
      else {
        if ((toss.to.h ?? 1.6) > 0.6 || toss.dur > 1.0) errors.push("10-5：抛出去那一下要快（≤ 1 s）、落地（h ≤ 0.6）");
        const after = Eyes(s).find(c => c.t >= toss.t + toss.dur - 0.05 && c.t <= toss.t + toss.dur + 0.5);
        if (!after || after.eye.stance !== "prone" || !Near(after.eye, toss.to, 0.3) || !((after.eye.pitchDeg ?? 0) > 20 || after.eye.look)) errors.push("10-5：抛完接趴姿仰视（prone、pitch > 20 或看着班长）");
        if (!Near(toss.to, config.keyframes.find(k => k.id === "10-5").player, 0.6)) errors.push("10-5：掀到的地方 = 关键帧 10-5 玩家的位置");
      }
      if (!Has(s, "shake", e => Math.abs(e.t - first.t) < 0.3 && e.strength >= 0.8)) errors.push("10-5：第一发要狠狠震屏（shake ≥ 0.8）");
      if (!Has(s, "flash", e => Math.abs(e.t - first.t) < 0.3)) errors.push("10-5：第一发要闪白（flash）");
      const tin = Sfx(s, "tinnitus")[0];
      if (!tin || Math.abs(tin.t - first.t) > 0.5) errors.push("10-5：第一发落下就耳鸣（tinnitus）");
      if (s.events.filter(e => e.type === "black" && e.t > first.t && e.t < first.t + 6).length < 2) errors.push("10-5：黑一阵白一阵（black ≥ 2 次）");
      if (!Has(s, "caption", e => /枪脱手|掉在脚边/.test(e.text) && e.t > first.t)) errors.push("10-5：枪脱手要有说明字");
      // 班长凑到跟前，在耳鸣里喊；喊完拽起来（镜头 crouch → stand）；捡枪说明字
      const pull = LineT(s, "LuoPullsUp.01");
      if (pull === undefined || !tin || pull < tin.t || pull > tin.t + 4.0) errors.push("10-5：班长那句要在耳鸣里（tinnitus 之后 4 s 内）");
      if (pull !== undefined) {
        const luo = PosAt("10-5", s, "Luo", pull), pl = toss?.to;
        if (!luo || !pl || !Near(luo, pl, 2.0)) errors.push("10-5：班长要凑到顺子跟前（≤ 2 m）");
        if (!Eyes(s).some(c => c.t <= pull + 0.1 && c.t + c.dur >= pull && c.eye.stance === "prone" && (c.eye.look?.actor === "Luo" || c.eye.toLook?.actor === "Luo"))) errors.push("10-5：喊的时候眼睛趴着仰看班长（look 演员锚 Luo）");
        if (!Eyes(s).some(c => c.t > pull && c.eye.stance === "stand")) errors.push("10-5：喊完一把拽起来（眼睛回到站姿）");
        if (!Has(s, "caption", e => /拽起/.test(e.text))) errors.push("10-5：一把拽起来要有说明字");
      }
      const pick = s.events.find(e => e.type === "caption" && /按 F/.test(e.text) && /捡/.test(e.text));
      if (!pick || pull === undefined || pick.t < pull) errors.push("10-5：「枪就在脚边：按 F 弯腰捡回来」要在班长那句之后");
      // 第二、三发：BarrageHit 在第一发之后、北屋塌一角、草顶着火（SmokeBlack）
      const hit = SignalT(s, "BarrageHit");
      if (hit === undefined || hit <= first.t) errors.push("10-5：BarrageHit 在第一发之后（第二、三发）切");
      if ([...Sfx(s, "artilleryNear"), ...Sfx(s, "shellBlast")].length < 4) errors.push("10-5：这一排炮至少四发（artilleryNear + shellBlast）");
      if (!Has(s, "smoke", e => e.kind === "SmokeBlack" && e.t >= (hit ?? Infinity) - 0.5)) errors.push("10-5：草顶着火要冒黑烟（SmokeBlack）");
      if (!Has(s, "caption", e => /塌/.test(e.text) && /着了火|着火/.test(e.text))) errors.push("10-5：北屋塌一角、草顶着火要有说明字");
    }
    if (!Has(s, "caption", e => /枪栓/.test(e.text)) || !Has(s, "sfx", e => Near(e, { x: 97.4, z: 481.6 }, 0.6))) errors.push("10-5：幺娃把枪栓扔进水缸（说明字 + 缸边一声）");
    if (!Near(PosKeys(s, "Yaowa").at(-1), { x: 97.4, z: 481.6 }, 1.5)) errors.push("10-5：幺娃最后在水缸边");
    const he = LineT(s, "HeGrenadeGate.01"), heAt = he === undefined ? null : PosAt("10-5", s, "HeYoutian", he);
    if (!heAt || !Near(heAt, { x: 108, z: 483.5 }, 1.4)) errors.push("10-5：何有田喊「滚！表挡事！」时要蹲在院门框边");
    // 排长挨了弹片，刘文财架着他进胡同（成对片段）；Squad1 / Squad2 跟进；都从路口直接进胡同口（不再绕院子）
    if (!ClipKey(s, "LiuWencai", "PvSupportWalkR") && !ClipKey(s, "LiuWencai", "PvSupportWalkL") || !ClipKey(s, "Officer", "PvSupportedHop")) errors.push("10-5：刘文财架着挨了弹片的排长（PvSupportWalk + PvSupportedHop）");
    if (!Has(s, "caption", e => /排长/.test(e.text) && /弹片/.test(e.text))) errors.push("10-5：排长挨了弹片要有说明字");
    for (const id of ["LiuWencai", "Officer", "Squad1", "Squad2"]) { const k = PosKeys(s, id).at(-1); if (!k || Math.abs(k.x - 109) > 1.0 || k.z < 471) errors.push(`10-5：${id} 最后要在窄胡同里（x≈109、z > 471），实际 (${k?.x}, ${k?.z})`); }
    for (const id of ["EastIja3", "EastIja6", "EastMg1"]) { const k = PosKeys(s, id).at(-1); if (!k || k.x < 182) errors.push(`10-5：${id} 要退到第一道弯那头`); }
    if (!Has(s, "caption", e => /吹哨/.test(e.text))) errors.push("10-5：东街那头吹哨要有说明字");
    if (!Has(s, "caption", e => /枪口火/.test(e.text) && /停/.test(e.text))) errors.push("10-5：门洞里枪口火全停要有说明字");
    for (const id of ["Escort2", "Bearer02"]) if (Keys(s, id).some(k => k.state && k.state !== "down") || PosKeys(s, id).some(k => k.move && k.move !== "cut")) errors.push(`10-5：${id} 死了，不动`);
  }
  // 10-6：全程跑；班长六句按序；炮 ≥ 6 发追着人；塌墙（LaneWallCollapse）在「过不去！翻墙！」之前；柴垛翻墙（VilIjaClimbWall 在柴垛西边面朝东、播完切到墙那边）；
  // 挨弹片的被两人架着跑；玩家眼睛在柴垛跟前抬头；最后在村南口；大槐树；then stay
  {
    const s = Seq("10-6");
    const ids = ["LuoRunCalls.01", "LuoRunCalls.02", "LuoRunCalls.03", "LuoRunCalls.04", "LuoRunCalls.05", "LuoRunCalls.06"];
    for (const l of ids) if (!HasLine(s, l)) errors.push(`10-6：要有台词 ${l}`);
    if (!Order(s, ids)) errors.push("10-6：班长六句按序：趴倒 → 起来跑 → 莫停 → 这边 → 翻墙 → 大槐树");
    if (Sfx(s, "shellBlast").length < 6) errors.push(`10-6：炮要一排比一排近追着人跑（shellBlast ≥ 6），现在 ${Sfx(s, "shellBlast").length}`);
    const collapse = SignalT(s, "LaneWallCollapse"), wall = LineT(s, "LuoRunCalls.05");
    if (collapse === undefined || wall === undefined || wall < collapse) errors.push("10-6：院墙先塌（LaneWallCollapse）班长才喊「过不去！翻墙！」");
    const climb = ClipKey(s, "Luo", "VilIjaClimbWall");
    if (!climb) errors.push("10-6：班长翻墙要用 VilIjaClimbWall");
    else {
      const p = PosAt("10-6", s, "Luo", climb.t);
      if (!p || !Near(p, CLIMB_FROM, 0.3) || p.yawDeg !== -90) errors.push(`10-6：翻墙的根要在柴垛西边 (${CLIMB_FROM.x},${CLIMB_FROM.z})、面朝东（−90），实际 (${p?.x}, ${p?.z}, ${p?.yawDeg})`);
      const over = PosKeys(s, "Luo").find(k => k.move === "cut" && k.t > climb.t && Near(k, CLIMB_TO, 0.3));
      if (!over || over.t < climb.t + 3.3) errors.push("10-6：翻过墙那一下要等片段播完（3.4 s）切到墙那边");
      if (wall !== undefined && climb.t < wall) errors.push("10-6：喊了「翻墙」才爬");
    }
    // 第十版：被架着的是排长（幺娃、刘文财一边一个）；Squad3 / Escort1 / Escort2 都死了，这一段没有他们
    const sup = [ClipKey(s, "Yaowa", "PvSupportWalkR") || ClipKey(s, "Yaowa", "PvSupportWalkL"), ClipKey(s, "LiuWencai", "PvSupportWalkL") || ClipKey(s, "LiuWencai", "PvSupportWalkR")];
    if (sup.some(k => !k) || !ClipKey(s, "Officer", "PvSupportedHop") || (sup[0].clip === sup[1].clip)) errors.push("10-6：幺娃和刘文财一边一个架着挨了弹片的排长跑（PvSupportWalkL + PvSupportWalkR + PvSupportedHop）");
    for (const id of ["Squad3", "Escort1", "Escort2"]) if (s.actors.some(a => a.id === id && a.keys.some(k => (k.move && k.move !== "cut") || k.clip))) errors.push(`10-6：${id} 死了，不在这一段里动`);
    if (!Has(s, "caption", e => /排长/.test(e.text) && /架/.test(e.text))) errors.push("10-6：架着排长要有说明字");
    // 出村南口：抬担架的死了好几个（说明字）；班长「顺儿、文财，你两个帮到车！」在最后一句（大槐树之后）、眼睛已到村南口
    if (!HasLine(s, "LuoHelpCart.01") || !Order(s, ["LuoRunCalls.06", "LuoHelpCart.01"])) errors.push("10-6：出村南口班长「顺儿、文财，你两个帮到车！」要在「大槐树」之后");
    { const t = LineT(s, "LuoHelpCart.01"); const eye = t === undefined ? null : [...s.camera].filter(c => c.t <= t + 0.01).at(-1); const p = eye && (eye.eye || eye.to); if (!p || !Near(p, EXIT, 3.0)) errors.push("10-6：说「帮到车」时眼睛要在村南口"); if (t !== undefined && !Has(s, "caption", e => /帮到车/.test(e.text) && Math.abs(e.t - t) < 1.5)) errors.push("10-6：「帮到车」要有说明字（接 11）"); }
    if (!Has(s, "caption", e => /抬担架的死了/.test(e.text) || /比抬的人多/.test(e.text))) errors.push("10-6：出村后「抬担架的死了好几个，担架上的人比抬的人多」要有说明字");
    if (!Eyes(s).some(c => c.eye.stance === "crouch" && Near(c.eye, CLIMB_FROM, 0.3) && c.eye.pitchDeg > 8)) errors.push("10-6：玩家要在柴垛跟前蹲着抬头看墙头（关键帧 10-6 的姿势）");
    for (const c of s.camera) if (!c.eye && c.from && (c.from.h ?? 1.6) > 1.7) errors.push(`10-6：全程第一人称跑（镜头 @${c.t} 机位高 ${c.from.h}）`);
    const last = LastCam(s), end = EndPoint(last);
    if (!end || !Near(end, EXIT, 1.5)) errors.push(`10-6：最后眼睛在村南口，实际 (${end?.x}, ${end?.z})`);
    if (!Has(s, "caption", e => /大槐树/.test(e.text))) errors.push("10-6：大槐树要有说明字");
    if (!Has(s, "caption", e => /卧倒/.test(e.text))) errors.push("10-6：「炮！趴倒！」要有卧倒提示的说明字（趴不趴由玩家）");
    if (!PosKeys(s, "Luo").some(k => k.z > 530)) errors.push("10-6：班长要跑到村口");
    for (const id of ["LiuWencai", "Squad1", "Yaowa", "HeYoutian", "Officer", "Squad2"]) if (!PosKeys(s, id).some(k => k.x > 114.5 && k.z > 502 && k.z < 519)) errors.push(`10-6：${id} 要翻进旁边院子绕过塌墙`);
    if (s.then !== "stay") errors.push("10-6：最后一段 then 要是 stay");
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
