// 《地道里的光》 —— 核心逻辑层（横版 2.5D，参考《勇敢的心：世界大战》）。
// 剧本来源：Notion《地道里的光》剧本大纲 + 关卡设计（八章结构）。
// 设计三原则：每关一个小人物目标；用行动而非台词表现成长；目标是保护群众、保存力量，而不是消灭敌人。
// 空间语法：x 为横向米数，level 为 surface（地表 y=0）/ under（地道 y=-3.6）。
// 地道场景是「剖面视角」：地表与地下同屏，烟、探杆、转移全部在一维横轴上展开。

// 场景布局是数据不是代码：坐标/尺寸/旗标门在 Data_Scenes.json，贴图与深度带在
// Data_PropArt.json，加载与校验在 Data_Scenes.mjs（配错在加载时就抛）。
import { SCENES } from "./Data_Scenes.mjs";
import { VaultLiftFor, VAULT_MAX_TOP } from "./Data_DepthSpec.mjs";

export const GAME_VERSION = "0.3.0";

export const SURFACE_Y = 0;
export const UNDER_Y = -3.6;

export { SCENES };

// ---------------------------------------------------------------------------
// 交互提示的写法（勇敢的心式）
// ---------------------------------------------------------------------------
// 提示 = 一枚按钮徽章 + 一个短动词。**文案里不写键名**——手机上没有键盘，
// 「按 E」三个字在那儿就是句废话；键位写成前缀 `E · ` / `按住 E · `，
// 由 HUD 按当前输入设备翻成键帽或触屏图标（见 Script_Main.PromptChip）。
// 动词要短：一眼扫过去就懂，别写成一句话——为什么、怎么做，交给画面和手记条。
// 长按的百分比也别写进文案，promptFill 会画成徽章外圈那道进度环。
const PROMPT_ACTS = { E: "interact", F: "throw", C: "crouch", W: "up", S: "down" };

// 把 `按住 E · 接绳` 拆成 { act:"interact", hold:true, text:"接绳" }。
// 认不出前缀的当成没有按键的状态行（"跟上娘""手里拿着桶"），HUD 走另一条样式。
export function SplitPrompt(raw) {
  if (!raw) return null;
  const m = /^(按住\s*)?([EFCWS])\s*·\s*([\s\S]+)$/.exec(raw);
  if (!m) return { act: null, hold: false, text: raw };
  return { act: PROMPT_ACTS[m[2]], hold: !!m[1], text: m[3] };
}

// ---------------------------------------------------------------------------
// 章节元数据
// ---------------------------------------------------------------------------
// 章名取各章自己最硬的那个意象，不用"失去/陷阱/反击"这类空话：
// 灯停住了=娘的结局那一镜；半袋烟的工夫=换岗的空当，学会看的那一课；
// 最后一盏灯=熄灯后攥在手里的那盏；东口的铃=改造的回报；
// 没套的骡车=推理的破绽本身；第二道刻痕与第一章首尾成对。
export const CHAPTERS = [
  { id: "c1", num: "第一章", title: "门框上的刻痕", year: "1942 · 华北敌后 · 梁家村", scene: "village", light: "day" },
  { id: "c2", num: "第二章", title: "灯停住了", year: "1943 · 春 · 梁家村", scene: "village", light: "night" },
  { id: "c3", num: "第三章", title: "半袋烟的工夫", year: "1943 · 据点外的庄稼地", scene: "fields", light: "night" },
  { id: "c4", num: "第四章", title: "最后一盏灯", year: "1943 · 沙河庄地道", scene: "tunnelVillage", light: "tunnel" },
  { id: "c5", num: "第五章", title: "东口的铃", year: "1943 · 夏 · 沙河庄地道", scene: "tunnelVillage", light: "tunnel" },
  { id: "c6", num: "第六章", title: "没套的骡车", year: "1943 · 押送前夜", scene: "fields", light: "night" },
  { id: "c7", num: "第七章", title: "地道里的光", year: "1943 · 据点地道", scene: "tunnelFort", light: "dark" },
  { id: "c8", num: "第八章", title: "第二道刻痕", year: "一个月后 · 梁家村", scene: "village", light: "dawn" },
];

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
function InZone(px, level, zone) {
  const zoneLevel = zone.level || "surface";
  return level === zoneLevel && Math.abs(px - zone.x) <= zone.w / 2;
}

function SceneOf(state) { return SCENES[CHAPTERS[state.chapterIndex].scene]; }

// ---------------------------------------------------------------------------
// 剧本：八个章节的 beat 序列（叙事文本沿用三轮迭代验证过的版本）
// cam hint 语法（勇敢的心式）：只允许 横移/升降/推拉，镜头切换=硬切+慢推
//   {kind:"follow"} 跟随 | {kind:"wide", x} 全景 | {kind:"shot", x, y, dist, pan?} 固定构图
// ---------------------------------------------------------------------------
const V = SCENES.village.zones;
const F = SCENES.fields.zones;
const TV = SCENES.tunnelVillage.zones;
const TF = SCENES.tunnelFort.zones;

function FindActor(state, id) { return state.actors.find((a) => a.id === id); }

// 配音行 id：按"说话人 + 文本"取哈希。抽词脚本（Script_VoiceExtract）与
// 运行时查表都走这一个函数——两边各写一份迟早会对不上，音频就整批哑掉。
// 用文本而不是行序做键，改动剧本顺序不会让已烘的音频失效，重复的句子也
// 自然共用同一个文件。
// 地道净高：一段一段不一样。冀中地道干线净高多在 1.2–1.5 米，
// **猫腰是常态**；卡口、新掏的段更矮，得半蹲甚至爬过去；能直起腰的只有
// 藏人洞和洞室。四档姿态由这一个函数说了算——玩法（速度、姿势）、
// 美术（洞腔画多高）、光照（空气腔多高）都从这儿取，免得三边各说各的。
export const POSTURE_HEAD = { stand: 2.05, stoop: 1.45, squat: 1.05, crawl: 0.72 };
export const POSTURE_SPEED = { stand: 1.0, stoop: 0.72, squat: 0.5, crawl: 0.34 };

export function TunnelPosture(scene, x) {
  // 藏人洞与洞室：唯一直得起腰的地方
  for (const pr of scene.props) {
    if (pr.kind !== "chamber" && pr.kind !== "pocket") continue;
    if (Math.abs(x - pr.x) < (pr.w || 5.6) / 2 - 0.6) return "stand";
  }
  // 剧情指定的窄段（卡口 / 连夜掏出来的那几十步）：得爬
  for (const t of scene.tight || []) {
    if (x >= t.x0 && x <= t.x1) return t.mode || "crawl";
  }
  // 其余：猫腰打底，隔一段一处半蹲的矮腰。按位置取值，稳定可预期
  const n = Math.sin(x * 0.17) * 0.6 + Math.sin(x * 0.052 + 1.7) * 0.4;
  return n > 0.30 ? "squat" : "stoop";
}

export function VoiceLineId(who, text) {
  const src = (who || "") + "|" + text;
  let h = 2166136261;
  for (let i = 0; i < src.length; i += 1) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
}

// 配音时长表：开了声音之后，一行字幕至少得停到旁白念完，否则每句都被
// 切在半截。剧本里手写的 d 仍然是下限——它定的是"这一拍该有多长"，
// 配音只负责把太短的那些撑开。静音时这张表是空的，节奏回到原样。
let VOICE_DUR = null;
export function SetVoiceDurations(map) { VOICE_DUR = map; }

// 旁白还在念的时候不许切下一行。
//
// 原先只靠 Script_VoiceEncode 算出来的时长去撑 d，但那有两个漏洞：清单是
// 异步 fetch 来的，开场头一两行往往在它到达之前就已经开始跑了；而 141 条
// 里有 111 条配音比剧本写的 d 长，最多的超 5 秒。于是"话没说完就切镜"。
// 直接问播放器有没有念完，这两个洞一起堵上。
let VOICE_BUSY = null;
export function SetVoiceGate(fn) { VOICE_BUSY = fn; }
// 万一 promise 卡住（文件 404、解码失败），最多多等这么久就往下走
const VOICE_WAIT_CAP = 14;
function LineHeld(line, t) {
  const d = LineDuration(line);
  if (t < d) return true;
  if (t > d + VOICE_WAIT_CAP) return false;
  return !!(VOICE_BUSY && VOICE_BUSY());
}
function LineDuration(line) {
  if (!VOICE_DUR) return line.d;
  const text = line.say || line.stage;
  if (!text) return line.d;
  const v = VOICE_DUR.get(VoiceLineId(line.say ? (line.who || "") : "", text));
  return v ? Math.max(line.d, v + 0.35) : line.d;
}

// ---------------------------------------------------------------------------
// 谜题动词层（v0.3 关卡重做）：单格物品栏 / 投掷 / 狗 / 灯光 / 声响引敌
// 《勇敢的心》的关卡语法：每个障碍缺一样东西，东西在别处；石子落地出声；
// 狗认吃不认人；灯有周期。动词凑齐了，关卡才有"想一下"的时刻。
// ---------------------------------------------------------------------------
const THROW_MIN = 3.0, THROW_MAX = 10.5, THROW_FLAT = 7.5;
// 翻越：撑上顶沿 → 收腿荡过去 → 落地缓冲。比一步慢，慢到看得清是"手脚并用"，
// 又不至于打断走路的节奏。手里拎着东西得先把东西撂上顶沿，所以更慢一档。
const VAULT_DUR = 0.62;      // 齐胯高的墙一撑就过，拖长了就成了慢动作
const VAULT_DUR_BIG = 1.05;

// 翻越的抬升曲线：人真的离地，不是换个姿势平移过去。
// 峰值取障碍高度的七成左右——胯骨压过顶沿的那一下，脚正好在顶沿上方。
// 扛着东西那一档在顶上多待一会儿（撂下、跨过、再拎起），所以是带平台的弧。
// 横移的节奏：迈上去 → 绕着撑手转（几乎原地）→ 荡下去落地。
// 三段的比例决定了"撑"看不看得出来——中段挪得越少，手按在墙头这件事越明显。
function VaultTravel(k) {
  if (k < 0.34) return 0.40 * Math.pow(k / 0.34, 1.5);          // 迈上去、手够住顶沿
  if (k < 0.66) return 0.40 + 0.18 * ((k - 0.34) / 0.32);       // 绕着撑手转，人几乎不前进
  const u = (k - 0.66) / 0.34;
  return 0.58 + 0.42 * (u * (2 - u));                           // 腿过了顶沿，荡下去
}

// 抬升曲线（返回**绝对米数**，不再是障碍高度的倍数）。
//
// 这里被退回过两次，症结每次都一样：**对称的正弦弧＝抛物线＝跳跃**。
// 起跳、到顶、落下三段等时等距，读出来就是"蹦过去"，跟撑手翻越没关系。
// 撑手翻越的高度曲线是一条**带平台的梯形**：
//   ① 手按上顶沿、身子被撑起来（快，0.3 秒不到）
//   ② **停在顶沿高度**——这一段是全动作的题眼：手是支点，胯骑在墙头上，
//      腿从顶上扫过去。高度几乎不变，所以看得出他是"撑着"不是"飞着"
//   ③ 手一松，人比升起来时更快地落下去（重力不讲道理），落地屈膝卸力
// 另外峰值按 VaultLiftFor(top) 算绝对值（顶沿 + 余量 − 站立胯高），
// 不按顶沿的百分比：百分比会让矮障碍抬过头、高障碍抬不够，两头都不像。
function VaultArc(k, big, top) {
  const u = Math.max(0, Math.min(1, k));
  const peak = VaultLiftFor(top);
  // 扛着东西那一档：先把东西撂上顶沿，所以在顶上多骑一会儿
  const rise = big ? 0.30 : 0.30;
  const fall = big ? 0.72 : 0.64;
  if (u < rise) {
    // 撑起来：起手最猛（蹬地那一下），到顶沿收住
    const t = u / rise;
    return peak * Math.sin(t * (Math.PI / 2));
  }
  if (u < fall) return peak;                          // 骑在顶沿上，腿扫过去
  const t = (u - fall) / (1 - fall);
  return peak * (1 - t * t);                          // 松手，加速落下
}

// pickedT：拿起的时刻。E 既是拾取也是放下，没有这 0.35s 的窗口，
// 拾取那一下顺手就把东西又扔回地上了
function GiveItem(state, item) { state.player.item = { ...item, pickedT: state.time }; }
function CanFreeDrop(state) {
  const it = state.player.item;
  return !!it && state.time - (it.pickedT || 0) > 0.35;
}

// ---------------------------------------------------------------------------
// 落地道具：手里的东西随时可以放下（勇敢的心式）；放下的东西留在世界里，
// 头顶挂一枚图形气泡当提示，走近再按 E 拾回 / 交换。
// ---------------------------------------------------------------------------
const GROUND_PICK_R = 1.5;    // 拾取半径
const GROUND_HINT_R = 5.0;    // 悬浮提示可见半径
const KNOT_TURNS = 1.25;      // 接绳打结要绕的圈数（一圈多一点）

// 辘轳转盘：鼠标绕轴心转圈驱动（顺时针放绳、逆时针摇起）。
// HUB_Y = 摇把轴心离地高度（对齐 DrawWell 井架横杆的中线）；
// TURNS_* = 空放/满摇各要转多少弧度才走完一井绳——满桶沉，同样一圈绳上得更少
export const WINCH_HUB_Y = 1.43;
const WINCH_TURNS_DOWN = Math.PI * 2 * 1.6;
const WINCH_TURNS_UP = Math.PI * 2 * 2.6;

// 落点整形：不许落进掩体的足迹（掩体带 z 专职挡人，桶放进草垛=凭空消失，
// 2026-08-06 的水桶事故就是这么来的），也不许出行走范围/压在翻越物里。
function DropSpot(state, x, level) {
  const scene = SceneOf(state);
  const range = scene.walk[level];
  let best = x;
  if (range) best = Math.max(range[0] + 0.4, Math.min(range[1] - 0.4, best));
  const blockers = [];
  if (level === "surface") {
    for (const c of scene.covers || []) blockers.push([c.x - (c.w || 2) / 2 - 0.5, c.x + (c.w || 2) / 2 + 0.5]);
    for (const v of scene.vaults || []) {
      if (v.flag && !state.flags[v.flag]) continue;
      blockers.push([v.x - (v.w || 1) / 2 - 0.5, v.x + (v.w || 1) / 2 + 0.5]);
    }
  }
  // 最多推两次：从重叠区挪到较近的边沿（掩体挨着掩体时再推一步）
  for (let pass = 0; pass < 2; pass += 1) {
    const hit = blockers.find(([a, b]) => best > a && best < b);
    if (!hit) break;
    best = (best - hit[0] < hit[1] - best) ? hit[0] : hit[1];
    if (range) best = Math.max(range[0] + 0.4, Math.min(range[1] - 0.4, best));
  }
  return Math.round(best * 10) / 10;
}

function AddGroundItem(state, item, x, level) {
  const g = {
    ...item,
    uid: "g" + (state.groundSeq = (state.groundSeq || 0) + 1),
    x: DropSpot(state, x, level),
    level,
  };
  state.groundItems.push(g);
  return g;
}

function NearestGroundItem(state, r = GROUND_PICK_R) {
  const p = state.player;
  const lvl = p.level || "surface";
  let best = null, bestD = r;
  for (const g of state.groundItems) {
    if (g.level !== lvl) continue;
    const d = Math.abs(g.x - p.x);
    if (d < bestD) { bestD = d; best = g; }
  }
  return best;
}

function RemoveGroundItem(state, g) {
  const i = state.groundItems.indexOf(g);
  if (i >= 0) state.groundItems.splice(i, 1);
}

// 每帧跑在节拍执行器之后：节拍自己的提示优先（!state.prompt 兜底），
// 所以链步骤要用 E 的地方永远不会被「放下」抢按键。
function StepGroundItems(state, def, input) {
  const p = state.player;
  // 悬浮提示：附近的落地道具头顶挂它自己的小样气泡（无文字三层配方）
  const lvl = p.level || "surface";
  for (const g of state.groundItems) {
    if (g.level !== lvl || Math.abs(g.x - p.x) > GROUND_HINT_R) continue;
    state.bubbles.push({ x: g.x, y: (lvl === "under" ? UNDER_Y : SURFACE_Y) + 1.15, icon: "item:" + g.label });
  }
  if (state.prompt || state.microCine || def?.kind === "cinematic") return;
  if (p.climbT > 0 || p.vaultT > 0 || p.cineWalk) return;

  const near = NearestGroundItem(state);
  if (near && !p.item) {
    state.prompt = `E · 拾起${near.label}`;
    if (input.interact) {
      RemoveGroundItem(state, near);
      GiveItem(state, near);
      FlashPose(state, "bow", 0.5);
      Cue(state, "pickup");
    }
    return;
  }
  if (near && p.item) {
    state.prompt = `E · 放下${p.item.label}，换${near.label}`;
    if (input.interact) {
      const cur = p.item;
      RemoveGroundItem(state, near);
      GiveItem(state, near);
      AddGroundItem(state, cur, near.x, lvl);
      FlashPose(state, "bow", 0.5);
      Cue(state, "pickup");
    }
    return;
  }
  if (p.item) {
    // 中间那条提示留给节拍用，「放下」挂在物品栏角标上（SyncHud 渲染），
    // 不抢画面——但按键路径在这里
    state.canDrop = true;
    if (input.interact && CanFreeDrop(state)) {
      AddGroundItem(state, p.item, p.x, lvl);
      p.item = null;
      FlashPose(state, "bow", 0.5);
      Cue(state, "drop");
    }
  }
}

// 一次性音效由这里排队，Script_Soundtrack 每帧取走去点名。
// Core 不认识合成器，只说"发生了什么"。
function Cue(state, name, opts) {
  if (state.cues) state.cues.push(opts ? { name, ...opts } : { name });
}

// 规范：每个玩法动词都要有对应的角色动画。瞬时动作（拾、投）打一个
// 带时限的姿势，持续动作（摇辘轳、划线）每帧续期——到时自动收回常态。
function FlashPose(state, name, dur = 0.5) {
  state.player.pose = name;
  state.player.poseT = dur;
}

// ---------------------------------------------------------------------------
// 投掷。飞行是真弹道（重力积分），不是两点插值——瞄准才有意义。
//
// 拟物路径（StepSlingAim）：攥住手里那颗石子（按下那一帧手要落在石子上），
// 往后下方拽开——拽多远劲多大，出手方向是拽开方向的反向；弧线预览由**同一套
// 物理**模拟出来，预览即所得。松手出手，拽得太少算把石子收回手心。
// 蓄力姿势（throwWind）由拉弓量直接驱动：拽多远身子拧多紧。
//
// 键盘后备（StartThrow，F）：站位就是瞄准——面朝方向 3~10.5m 内有本步目标
// 就照着它解一条正好穿过的弧；否则落在 7.5m 外，白出一声响。
// ---------------------------------------------------------------------------
const THROW_G = 12.5;        // 石子的重力。略沉于真实——弧线利落，不拖泥带水
const SLING_MAX = 1.6;       // 拽满的长度（米）
const SLING_K = 7.4;         // 拽开 1m ≈ 7.4m/s 出手速；拽满约 12m/s，射程 ≈ THROW_MAX
const SLING_HAND_Y = 1.12;   // 攥石子的手离地高

function LaunchStone(state, x0, y0, vx, vy, target) {
  state.thrown = { x: x0, y: y0, vx, vy, target: target || null, hit: false };
  state.player.item = null;
  state.sling = null;
  FlashPose(state, "throwArm", 0.45);
  Cue(state, "whoosh");
}

function StartThrow(state, st) {
  const p = state.player;
  let tx = p.x + p.heading * THROW_FLAT;
  let ty = 0.15;
  let hit = false;
  if (st?.target) {
    const dx = (st.target.x - p.x) * p.heading;
    if (dx >= THROW_MIN && dx <= THROW_MAX) { tx = st.target.x; ty = st.target.y ?? 1.6; hit = true; }
  }
  // 解一条 T 秒后正好路过 (tx,ty) 的弧：vy 里补上重力欠的那一截
  const y0 = 1.25;
  const T = 0.42 + Math.abs(tx - p.x) * 0.05;
  LaunchStone(state, p.x + p.heading * 0.3, y0,
    (tx - p.x) / T, (ty - y0) / T + 0.5 * THROW_G * T, hit ? st.target : null);
}

// 每帧的拟物瞄准。返回"正攥着"——攥着时按键路径让位。
// st 只为出手时把命中目标带上；链外自由投掷传 null。
function StepSlingAim(state, input, st) {
  if (state.slingTicked) return !!state.sling;   // 链内已代管，链外别再步进一遍
  state.slingTicked = true;
  const p = state.player;
  const gy = SURFACE_Y;   // 拟物投掷只在地表玩法里出现
  const hx = p.x + p.heading * 0.24;
  const pw = input.pointerWorld;
  if (!state.sling && state.ptrPressed && pw
    && Math.hypot(pw.x - hx, pw.y - (gy + SLING_HAND_Y)) < 0.7) {
    state.sling = { power: 0, vx: 0, vy: 0 };
  }
  const sl = state.sling;
  if (!sl) return false;
  if (input.pointerHeld && pw) {
    // 拽开的向量（手→指尖），出手是它的反向；拽过头按拽满算
    let dx = pw.x - hx, dy = pw.y - (gy + SLING_HAND_Y);
    const len = Math.hypot(dx, dy);
    if (len > SLING_MAX) { dx *= SLING_MAX / len; dy *= SLING_MAX / len; }
    sl.power = Math.min(1, Math.hypot(dx, dy) / SLING_MAX);
    sl.vx = -dx * SLING_K;
    sl.vy = -dy * SLING_K;
    // 预览弧 = 同一套物理跑出来的点列；灰/亮只说"够不够劲"，打不打得中看你瞄
    const pts = [];
    let x = hx, y = SLING_HAND_Y, vx = sl.vx, vy = sl.vy;
    for (let i = 0; i < 26 && y > 0.08; i += 1) {
      pts.push([x, y]);
      vy -= THROW_G * 0.055;
      x += vx * 0.055;
      y += vy * 0.055;
    }
    state.throwAim = { pts, ok: sl.power > 0.22 };
    // 蓄力：拽多远，身子拧多紧；往哪边拽，人反着转身瞄
    if (Math.abs(sl.vx) > 0.4) p.heading = sl.vx >= 0 ? 1 : -1;
    p.pose = "throwWind";
    p.poseK = sl.power;
    p.poseT = 0.25;
    state.gesture = { kind: "dragDown" };
    return true;
  }
  // 松手：够劲出手，不够收回手心
  state.sling = null;
  if (sl.power > 0.22) LaunchStone(state, hx, 1.25, sl.vx, sl.vy, st?.target || null);
  else { p.pose = null; p.poseK = undefined; }
  return false;
}

function StepThrown(state, dt) {
  const th = state.thrown;
  if (!th) return null;
  // 小步长积分：命中判定贴着弧线走，不会一帧跨过目标
  const n = 3;
  for (let i = 0; i < n; i += 1) {
    const h = dt / n;
    th.x += th.vx * h;
    th.vy -= THROW_G * h;
    th.y += th.vy * h;
    if (th.target
      && Math.hypot(th.x - th.target.x, th.y - (th.target.y ?? 1.6)) <= (th.target.r ?? 1.2) * 0.55) {
      th.hit = true;
      break;
    }
    if (th.y <= 0.12 && th.vy < 0) break;
  }
  if (!th.hit && !(th.y <= 0.12 && th.vy < 0)) return null;
  state.thrown = null;
  // 石子落地出声：附近的敌人会过来看——这一声玩家也必须听见，
  // 否则「声音会引人」这条规则永远只是文字说明
  Cue(state, "stoneLand");
  MakeNoise(state, th.x, "surface");
  return th;
}

function MakeNoise(state, x, level) {
  state.noiseAt = { x, t: 0.6 };
  for (const a of state.actors) {
    if (!IsEnemy(a) || !a.visible || (a.level || "surface") !== level) continue;
    if (Math.abs(a.x - x) > 15) continue;
    // face：**朝着响动看**。只写"走到响动跟前"是不够的——石子落在他脚边一米
    // 的时候他几乎不用挪窝，脸就还冲着原来那一头，那颗石子等于白扔。
    // 引开一盏灯，靠的是他把脸转过去。
    a.investigate = {
      x: x + (a.x < x ? -1.2 : 1.2),
      until: state.time + 5.5,
      face: Math.sign(x - a.x) || (a.heading || 1),
    };
  }
}

// 拴着的狗：不咬人，会叫。叫声把巡逻招过来——不是立刻失败，是招来麻烦。
// 喂了就不叫了（认吃不认人）。
const DOG_SPOTS = {
  c2: [{ x: 138, flag: "dogFed" }],
  c5: [{ x: 22, flag: "dogFed2" }],
};

function StepDogs(state, dt) {
  state.dogBark = null;
  const dogs = DOG_SPOTS[CHAPTERS[state.chapterIndex].id];
  if (!dogs) return;
  const p = state.player;
  for (const d of dogs) {
    if (state.flags[d.flag]) continue;
    if (p.level !== "surface" || Math.abs(p.x - d.x) >= 5.5) continue;
    state.dogBark = { x: d.x };
    if (!state.beat.dogToastShown) {
      state.beat.dogToastShown = true;
      state.toast = { text: "狗叫起来了——这动静会把人招来。", t: 3.5 };
    }
    state.beat.dogNoiseT = (state.beat.dogNoiseT || 0) + dt;
    if (state.beat.dogNoiseT > 1.1) { state.beat.dogNoiseT = 0; MakeNoise(state, d.x, "surface"); }
  }
}

// 周期型灯光（探照灯 / 马灯的光池）：危险有周期，读懂周期就是解谜。
// def.light = { zone:[x0,x1], cycle, lit, offFlag?, src? } —— cycle=lit 即常亮
function StepLightHazard(state, def, dt) {
  const L = def?.light;
  if (!L || (L.offFlag && state.flags[L.offFlag])) { state.searchlight = null; return; }
  const phase = state.beat.t % L.cycle;
  const lit = phase < L.lit;
  state.searchlight = { x0: L.zone[0], x1: L.zone[1], lit, phase, cycle: L.cycle, litDur: L.lit, src: L.src || null };
  if (!lit) return;
  const p = state.player;
  if (p.level !== "surface" || p.hidden) return;
  if (p.x < L.zone[0] || p.x > L.zone[1]) return;
  // 掩体挡光：有光源坐标就按方向判（背着灯的那一面才是影子），没有就不问方向
  if (CoverHides(SceneOf(state), L.src ? L.src.x : null, p.x, p.crouch)) return;
  if (state.cart && def.kind === "cartRide" && Math.abs(p.x - state.cart.x) <= (def.safeR ?? 2.6)) return; // 车影里
  state.detection.level = Math.min(1, state.detection.level + dt * 1.35);
  state.detection.spotter = "light";
}

// ---------------------------------------------------------------------------
// 拟物做功（全作交互标准，规则见 CLAUDE.md「拟物交互」）
//
// 挖、按、顶、拴这类"对物体做功"的长交互**不走进度条**：玩家的手真的动一下，
// 功才涨一分。三种笔画（stroke）：
//   down   = 往下拽（铲土/按棉被/盖门板/灌水）
//   up     = 往上顶（撑木/撬地沿）
//   circle = 绕工作点转圈（拴绳/缠引信）——同辘轳/打结，指针得真的绕着圈走
// 键盘照旧是完整后备：按住 E 以 0.85 倍速自动做功（自动通关驱动器只按键盘）。
// 每攒满一"下"，物体答一声话（cue + 姿势）——做功要听得见、看得着。
// ---------------------------------------------------------------------------
const STROKE_LEN = 0.30;      // 一下拽/顶的行程（归一化拖动量，≈1/3 屏高）
function StrokeWork(state, mem, input, dt, opts) {
  const hold = opts.hold;
  const kind = opts.stroke || "down";
  const strokesN = Math.max(2, Math.round(hold / 0.7));   // 这活总共几下
  let gain = 0;

  if (kind === "circle") {
    const turns = Math.min(3, Math.max(1, hold * 0.9));   // 总共绕几圈
    const cx = opts.at?.x ?? state.player.x;
    const cy = (opts.at?.baseY ?? SURFACE_Y) + (opts.at?.y ?? 1.25);
    const pw = input.pointerWorld;
    if (input.pointerHeld && pw) {
      const dx = pw.x - cx, dy = pw.y - cy;
      const r = Math.hypot(dx, dy);
      if (r > 0.1 && r < 1.7) {
        const a = Math.atan2(dy, dx);
        if (mem.prevA != null) {
          let d = a - mem.prevA;
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          if (Math.abs(d) < 1.0) gain = Math.abs(d) / (Math.PI * 2 * turns) * hold;
        }
        mem.prevA = a;
      } else mem.prevA = null;
    } else mem.prevA = null;
    state.gesture = { kind: "circle" };
  } else {
    // 竖向笔画：只认对的方向（铲子不往上抡，撑木不往下砸）
    const dir = kind === "up" ? -1 : 1;
    const pull = input.pullHeld ? Math.max(0, (input.pull || 0) * dir) : 0;
    gain = pull / (STROKE_LEN * strokesN) * hold;
    state.gesture = { kind: kind === "up" ? "pullUp" : "dragDown" };
  }

  // 键盘后备走同一个账本：手感稍慢，但一样能干完
  if (input.interactHeld) gain += dt * 0.85;

  // 攒满一"下"：物体答话。键盘与手势共用节拍，Cue 不会重复也不会漏
  if (gain > 0) {
    mem.acc = (mem.acc || 0) + gain;
    const quantum = hold / strokesN;
    if (mem.acc >= quantum) {
      mem.acc -= quantum;
      Cue(state, opts.cue || "dig", { gain: 0.7, rate: 0.92 + Math.random() * 0.16 });
      FlashPose(state, opts.pose || (kind === "circle" ? "mark" : kind === "up" ? "push" : "bow"), 0.3);
    }
  }
  return gain;
}

// 链式谜题：有序的一串步骤——拾取 / 使用 / 投中 / 交谈 / 推。
// 单格物品栏：步骤自己管理手里那格；失败重置不清链、不清物品。
function StepChain(state, def, input, dt) {
  const b = state.beat;
  if (b.stepIndex === undefined) { b.stepIndex = 0; b.holdP = 0; def.onStart?.(state); }
  const st = def.steps[b.stepIndex];
  if (!st) { AdvanceBeat(state); return; }
  const p = state.player;
  const lvl = p.level || "surface";

  // 这一步在等某件东西，而它正躺在地上（玩家半路撂下的、或上一步放下的）：
  // 给它挂一枚气泡。手里能随时放下，就一定会有人撂下东西再走开——不标出来的话，
  // 玩家站在原地按 E 没反应，只会以为游戏坏了（无文字引导三层配方之一）。
  {
    const wantId = st.needs || st.itemId || st.item?.id;
    if (wantId && p.item?.id !== wantId) {
      const g = state.groundItems.find((it) => it.id === wantId);
      if (g) {
        state.bubbles.push({
          x: g.x, y: (g.level === "under" ? UNDER_Y : SURFACE_Y) + 1.15, icon: "item:" + g.label,
        });
      }
    }
  }

  // 很久没动静：链卡在同一步超过 after 秒 → 后果小窗惦记一眼（负数=冷却期）
  if (def.pipIdle) {
    b.pipIdleT = (b.pipIdleT || 0) + dt;
    if (b.pipIdleT >= def.pipIdle.after) {
      b.pipIdleT = -(def.pipIdle.cooldown ?? 30);
      def.pipIdle.on?.(state);
    }
  }

  const finish = () => {
    if (st.note) state.toast = { text: st.note, t: 4.5 };
    if (st.noteAdd) state.flags.notesSeen.push(st.noteAdd);   // 口信也是情报，入账供第六章推理
    st.effect?.(state);
    b.stepIndex += 1;
    b.holdP = 0;
    b.pipIdleT = 0;                // 链动了一步，"没动静"从头计
    if (b.stepIndex >= def.steps.length) AdvanceBeat(state);
  };

  // 石子在空中：等它落地，砸中了才算过
  const th = StepThrown(state, dt);
  if (th) {
    if (st.type === "throwHit" && th.hit) { finish(); return; }
    if (st.type === "throwHit") {
      // 投空不白投：miss 回调让失败自己变成演示（惊飞麻雀=石子落地会出声）
      st.miss?.(state, th.x);
      state.toast = { text: st.missNote || "石子擦着边飞过去了。再捡一颗。", t: 3 };
    }
  }

  switch (st.type) {
    case "pickup": {
      const near = Math.abs(p.x - st.x) < 1.7 && lvl === (st.level || "surface");
      if (!near) return;
      if (p.item) {
        // 单格物品栏 + 自由放下：占着手就地放下，不再只是一句拒绝
        state.prompt = `一次只能拿一样——E · 先放下${p.item.label}`;
        if (input.interact && CanFreeDrop(state)) {
          AddGroundItem(state, p.item, p.x, lvl);
          p.item = null;
          FlashPose(state, "bow", 0.5);
          Cue(state, "drop");
        }
        return;
      }
      state.prompt = st.prompt || `E · 拿起${st.item.label}`;
      if (input.interact) { GiveItem(state, st.item); FlashPose(state, "bow", 0.5); Cue(state, "pickup"); finish(); }
      return;
    }
    // 放下换手：单格物品栏的另一半——「翻堆要双手」的地方，得先把手里的搁下。
    // 落成一件真的落地道具（走 DropSpot 避开掩体带），折回来还能捡
    case "drop": {
      // 这一步要的是「手腾出来了」，不是「必须从手里放在这块地上」。
      // 玩家有权在任何地方把东西撂下（自由放下），要是这里非等着他攥着走过来，
      // 半路撂下桶的人就把链卡死在这一步——而且一点提示都没有：
      // 后面那截绳头捡不起来、按 E 毫无反应，玩家只会以为游戏坏了。
      // 东西已经躺在地上（哪儿都算），这一步就算过；位置照实记，
      // 「折回取桶」自然就走回那儿。
      {
        const onGround = state.groundItems.find((g) => g.id === st.itemId);
        if (onGround) {
          state.flags[st.storeIn] = onGround.x;
          // 撂得远的话，给它挂一枚气泡：玩家得看得见自己把桶扔哪儿了
          state.bubbles.push({
            x: onGround.x,
            y: (onGround.level === "under" ? UNDER_Y : SURFACE_Y) + 1.15,
            icon: "item:" + onGround.label,
          });
          finish();
          return;
        }
      }
      if (!InZone(p.x, lvl, st.zone)) return;
      if (p.item?.id !== st.itemId) return;
      state.prompt = st.prompt || `E · 放下${p.item.label}`;
      if (input.interact) {
        const g = AddGroundItem(state, p.item, p.x, lvl);
        state.flags[st.storeIn] = g.x;
        state.player.item = null;
        FlashPose(state, "bow", 0.5);
        Cue(state, "drop");
        finish();
      }
      return;
    }
    // 折回取：把放下的东西捡回来。玩家提前用自由拾取拿回了也算数
    case "pickupGround": {
      if (p.item?.id === st.item.id) { state.flags[st.flagX] = null; finish(); return; }
      const g = state.groundItems.find((it) => it.id === st.item.id);
      const gx = g ? g.x : state.flags[st.flagX];
      if (typeof gx !== "number" || Math.abs(p.x - gx) > 1.7) return;
      if (p.item) {
        state.prompt = `一次只能拿一样——E · 先放下${p.item.label}`;
        if (input.interact && CanFreeDrop(state)) {
          AddGroundItem(state, p.item, p.x, lvl);
          p.item = null;
          FlashPose(state, "bow", 0.5);
          Cue(state, "drop");
        }
        return;
      }
      state.prompt = st.prompt || `E · 拿回${st.item.label}`;
      if (input.interact) {
        if (g) RemoveGroundItem(state, g);
        GiveItem(state, st.item);
        state.flags[st.flagX] = null;
        FlashPose(state, "bow", 0.5);
        Cue(state, "pickup");
        finish();
      }
      return;
    }
    case "use": {
      if (!InZone(p.x, lvl, st.zone)) return;
      if (st.needs && p.item?.id !== st.needs) {
        state.prompt = st.missPrompt || `这儿缺${st.needsLabel || "样东西"}`;
        return;
      }
      if (st.hold) {
        // 长做功走拟物笔画（st.stroke: down/up/circle，缺省 down）——
        // 铲一下涨一分，站着按住 E 是键盘后备。松手功慢慢泄掉
        if (b.holdP === undefined) b.holdP = 0;   // 调试跳幕可能绕过链的初始化
        state.prompt = st.prompt;          // 百分比不进文案，promptFill 画成进度环
        state.promptFill = b.holdP / st.hold;
        const g = StrokeWork(state, b.strokeMem || (b.strokeMem = {}), input, dt, {
          hold: st.hold, stroke: st.stroke,
          at: { x: st.zone.x, y: st.gestureY, baseY: (st.zone.level === "under" || lvl === "under") ? UNDER_Y : SURFACE_Y },
        });
        if (g > 0) {
          b.holdP += g;
          if (b.holdP >= st.hold) { b.strokeMem = null; ApplyUse(state, st); finish(); }
        } else if (!input.interactHeld) {
          b.holdP = Math.max(0, b.holdP - dt * 1.2);
        }
      } else {
        state.prompt = st.prompt;
        if (input.interact) { ApplyUse(state, st); finish(); }
      }
      return;
    }
    case "throwHit": {
      if (state.thrown) return;
      const nearPile = Math.abs(p.x - st.pickupX) < 1.7 && lvl === "surface";
      if (!p.item) {
        if (nearPile) {
          state.prompt = "E · 捡石子";
          if (input.interact) { GiveItem(state, { id: "stone", label: "石子", throwable: true }); FlashPose(state, "bow", 0.45); }
        }
        return;
      }
      if (p.item.id !== "stone") return;
      // 拟物路径：攥住石子往后拽开瞄准（预览弧即弹道）。攥着时按键路径让位
      if (StepSlingAim(state, input, st)) return;
      // 键盘后备的弧线预览：站位不够是灰虚线，走进射程变实线——归因清楚
      const dxAim = (st.target.x - p.x) * p.heading;
      state.throwAim = {
        x0: p.x + p.heading * 0.4, y0: 1.35,
        x1: st.target.x, y1: st.target.y ?? 1.6,
        ok: dxAim >= THROW_MIN && dxAim <= THROW_MAX,
      };
      state.prompt = st.prompt || "F · 投";
      if (input.throw || (input.interact && !nearPile)) StartThrow(state, st);
      return;
    }
    case "talk": {
      const a = FindActor(state, st.actor);
      if (!a || !a.visible || Math.abs(a.x - p.x) > 2.4 || (a.level || "surface") !== lvl) return;
      state.prompt = st.prompt || `E · 跟${a.label || "他"}说话`;
      if (input.interact) {
        if (st.lines) StartMicroCine(state, st.lines);
        finish();
      }
      return;
    }
    case "push": {
      if (!state.cart) state.cart = { x: st.from, kind: st.obj || "cart", roll: 0 };
      const cart = state.cart;
      if (Math.abs(p.x - cart.x) > 2.6) return;
      state.prompt = st.prompt || "按住 E · 推车";
      state.promptFill = Math.abs(cart.x - st.from) / st.dist;
      // 手扶在车把上是**站位决定的，不是按键决定的**：走到车跟前就搭上手，
      // 松开 E 只是不再使劲，手不会撒把。上一版只在 interactHeld 里打姿势，
      // 于是一停手人就飘回站姿、两只手在空中慢慢晃——车还在，人却放开了。
      FlashPose(state, "push", 0.2);
      p.heading = st.dir;
      if (input.interactHeld) {
        const step = st.dir * 0.85 * dt;
        cart.x += step;
        // **有向**位移：往左推，轮子就得往左滚（逆时针）。存绝对值的话
        // 车往哪边走轮子都朝一个方向转，倒着推就穿帮了
        cart.roll = (cart.roll || 0) + step;
        p.x = cart.x - st.dir * 1.58;   // 站近一点，手正好搭在车把上
        if ((cart.x - st.from) * st.dir >= st.dist) finish();
      }
      return;
    }
    case "goto": {
      if (InZone(p.x, lvl, st.zone)) finish();
      return;
    }
    case "winch": {
      // 辘轳打水：真的摇转盘——按住鼠标绕辘轳轴心转圈，顺时针放绳把桶送下去，
      // 逆时针一把一把摇上来。满桶沉，脱手辘轳会倒转，桶又坐回水里。
      // 键盘 S/W 仍是完整后备（自动通关驱动器也走这条）。
      const w = b.winch || (b.winch = { depth: 0, filled: false, hooked: !st.needs, slipT: 0, prevA: null, crankA: 0 });
      if (!InZone(p.x, lvl, st.zone)) return;
      state.winchLock = true;   // 井口的竖推交给辘轳，不再当爬梯（c5 井台正压在竖井口上）
      if (!w.hooked) {
        if (p.item?.id === st.needs) {
          state.prompt = st.hookPrompt || "E · 挂上辘轳";
          if (input.interact) {
            w.hooked = true; p.item = null; FlashPose(state, "bow", 0.4);
            // 人站到井口西侧摇——站在井正中，桶就挂在他脑袋上，摇把也被挡死
            p.x = st.zone.x - 0.9;
            p.heading = 1;
          }
        } else {
          state.prompt = st.missPrompt || `得有${st.needsLabel || "桶"}才打得上水`;
        }
        state.winchView = { x: st.zone.x, depth: w.depth, filled: w.filled, hooked: w.hooked, crankA: w.crankA };
        return;
      }
      // 摇着的时候不许再站回井心把画面挡上（往西走出 zone 就自然退出交互）
      if (p.x > st.zone.x - 0.72) { p.x = st.zone.x - 0.72; p.heading = 1; }
      // 特写：桶一挂上辘轳，镜头就推到井口——摇转盘这套手上功夫不在大全景里做，
      // 玩家看的是辘轳、绳和井口，不是整条街。离开井台（InZone 失败）自动拉回。
      state.closeUp = { x: st.zone.x, y: WINCH_HUB_Y - 0.35, hw: st.closeHw ?? 3.0 };
      const climb = input.climb || 0;
      // 辘轳的木轴一圈一圈地叫：手在摇才响，摇得快叫得密
      const Creak = (rate) => {
        w.creakT = (w.creakT ?? 0) + dt;
        if (w.creakT > rate) { w.creakT = 0; Cue(state, "crank", { gain: 0.8 }); }
      };
      // 指针绕圈：以辘轳轴心为圆心累计本帧转角（真实位置驱动——手得真的
      // 绕着转盘画圈，同打结）。spin>0=逆时针（数学向），<0=顺时针。
      let spin = 0;
      if (input.pointerHeld && input.pointerWorld) {
        const dx = input.pointerWorld.x - st.zone.x;
        const dy = input.pointerWorld.y - (SURFACE_Y + WINCH_HUB_Y);
        const r = Math.hypot(dx, dy);
        if (r > 0.1 && r < 1.9) {
          const a = Math.atan2(dy, dx);
          if (w.prevA !== null) {
            let d = a - w.prevA;
            if (d > Math.PI) d -= Math.PI * 2;
            if (d < -Math.PI) d += Math.PI * 2;
            if (Math.abs(d) < 1.0) spin = d;
          }
          w.prevA = a;
        } else w.prevA = null;
      } else w.prevA = null;
      const depthWas = w.depth;
      if (!w.filled) {
        const gd = Math.max(0, -spin);   // 屏幕上顺时针=放绳
        if (climb > 0.05 || gd > 0) {
          w.depth = Math.min(1, w.depth
            + (climb > 0.05 ? dt * 0.62 : 0)
            + gd / WINCH_TURNS_DOWN);
          FlashPose(state, "crank", 0.25);
          Creak(0.62);
        }
        state.prompt = "S · 放绳下去";
        state.gesture = { kind: "crankDown" };
        state.promptFill = w.depth;
        if (w.depth >= 1) {
          w.filled = true;
          Cue(state, "waterSplash", { gain: 0.8 });
          state.toast = { text: "桶触到水面，咕咚一声灌满了。", t: 2.6 };
          Cue(state, "waterSplash");
          st.onFilled?.(state);   // 咕咚声传出去：后果小窗等钩子在这儿挂
        }
      } else {
        const gu = Math.max(0, spin);    // 逆时针=往上摇
        if (climb < -0.05 || gu > 0) {
          w.depth = Math.max(0, w.depth
            - (climb < -0.05 ? dt * 0.34 : 0)
            - gu / WINCH_TURNS_UP);      // 满桶沉：同样一圈，绳上得更少
          w.slipT = 0.3;
          FlashPose(state, "crank", 0.25);
          Creak(0.5);
        } else {
          // 松手：辘轳倒转。留 0.3s 的棘齿宽限，换手不至于立刻坠
          w.slipT = Math.max(0, w.slipT - dt);
          if (w.slipT <= 0 && w.depth < 1) {
            w.depth = Math.min(1, w.depth + dt * 0.45);
            if (w.depth >= 1 && !w.slipShown) {
              w.slipShown = true;
              state.toast = { text: "手一松，辘轳呼噜噜倒转——桶又坐回了水里。", t: 3 };
            }
          }
        }
        state.prompt = "W · 摇上来";
        state.gesture = { kind: "crankUp" };
        state.promptFill = 1 - w.depth;
        if (w.depth <= 0) {
          if (st.gives) GiveItem(state, st.gives);
          if (st.transform) state.player.item = { ...st.transform };
          state.winchView = null;
          finish();
          return;
        }
      }
      // 摇把的角度直接从绳的行程反推：键盘、鼠标、倒转三条路自然同步——
      // 桶自己往下坠时，摇把就在屏幕上呼噜噜倒着抡
      w.crankA -= (w.depth - depthWas) * WINCH_TURNS_DOWN;
      state.winchView = {
        x: st.zone.x, depth: w.depth, filled: w.filled, hooked: true,
        crankA: w.crankA, engaged: w.prevA !== null,
      };
      return;
    }
    // 接绳打结：拿着麻绳站到断头前，鼠标沿引导圈把绳缠上去（一圈多一点），
    // 缠满再往下一拽勒紧。键盘后备：按住 E 缠 / 收。这是「接上井绳」从一条
    // 进度条变成一双手的地方。
    case "knot": {
      if (!InZone(p.x, lvl, st.zone)) return;
      const k = b.knotState;
      if (!k && st.needs && p.item?.id !== st.needs) {
        state.prompt = st.missPrompt || `这儿缺${st.needsLabel || "样东西"}`;
        return;
      }
      const kn = k || (b.knotState = { t: 0, cinch: 0, prevA: null });
      const cx = st.zone.x;
      // 同辘轳：人站在断头正前方会把结挡住——钉到井口西侧，手够着断头打结
      if (!k) { p.x = cx - 0.9; p.heading = 1; }
      else if (p.x > cx - 0.72) { p.x = cx - 0.72; p.heading = 1; }
      const cyRel = st.knotY ?? 1.5;   // 断头挂在井架上的高度
      // 特写：打结是指尖上的活，镜头推到断头跟前——引导圈、缠上去的绳、
      // 收紧的结都要看得清；离开井台自动拉回
      state.closeUp = { x: cx, y: cyRel - 0.25, hw: st.closeHw ?? 2.6 };
      // 指针绕圈：真实位置驱动——手得真的在断头附近画圈。
      // **方向是有意义的**：绳只能顺着一个方向往上缠（世界角度递增＝画面上
      // 逆时针，与 World 里绳圈的画法同一个方向）。反着转就是在往下解，
      // 圈会一圈圈退回来。老版取 Math.abs(d) 两头都算涨，于是转哪边都能过——
      // 那就不是"缠绳"，是"在这儿画圈满一定角度"。
      const pw = input.pointerWorld;
      if (input.pointerHeld && pw) {
        const dx = pw.x - cx, dy = pw.y - (SURFACE_Y + cyRel);
        const r = Math.hypot(dx, dy);
        if (r > 0.12 && r < 1.5) {
          const a = Math.atan2(dy, dx);
          if (kn.prevA !== null) {
            let d = a - kn.prevA;
            if (d > Math.PI) d -= Math.PI * 2;
            if (d < -Math.PI) d += Math.PI * 2;
            if (Math.abs(d) < 1.0) {
              const turn = d / (Math.PI * 2 * KNOT_TURNS);
              if (kn.t < 1) {
                // 缠：正向涨；反向退（解开的手感，退得比缠快一点点）
                kn.t = Math.max(0, Math.min(1, kn.t + (turn > 0 ? turn : turn * 1.25)));
                if (turn > 0) FlashPose(state, "mark", 0.25);
              } else if (turn < 0) {
                // 已经缠满了还往回转＝把结解开，退回缠绳这一步
                kn.t = Math.max(0, 1 + turn * 1.25);
                kn.cinch = 0;
              }
            }
          }
          kn.prevA = a;
        }
      } else kn.prevA = null;
      // 缠上第一把，绳就离手挂在井架上了
      if (kn.t > 0.03 && p.item?.id === st.needs) { p.item = null; FlashPose(state, "mark", 0.4); }
      // **没有长按后备**（用户明令："为什么还支持长按交互按钮的模式？干掉"）。
      // 打结是指尖上的活：手不落在绳头上、不真的绕圈，就一点进展都没有。
      // 也**没有 HUD 手势图标**——招呼玩家上手的是绳头自己（它在断头上晃），
      // 转对了绳圈一圈圈缠上去、转反了退回来，物体自己把方向教了。
      if (kn.t >= 1) {
        if (!kn.wound) { kn.wound = true; Cue(state, "pickup", { gain: 0.7 }); }
        // 缠满了改竖拽勒紧（同样只认手上的动作，没有长按）
        const pull2 = input.pullHeld ? Math.max(0, input.pull || 0) : 0;
        if (pull2 > 0) { kn.cinch = Math.min(1, kn.cinch + Math.min(pull2 * 2.2, dt * 4)); FlashPose(state, "crank", 0.25); }
      } else kn.wound = false;
      // 还没上手时绳头自己晃两下——这是唯一的"招呼"，代替原来那个 HUD 图标
      state.knot = {
        x: cx, y: cyRel, t: kn.t, cinch: kn.cinch, turns: KNOT_TURNS,
        idle: kn.prevA === null && kn.t < 0.02 ? state.time : 0,
      };
      if (kn.cinch >= 1) {
        Cue(state, "ladder", { gain: 0.75 });   // 麻绳勒紧时木架受力的吱嘎
        state.knot = null;
        finish();
      }
      return;
    }
    default: return;
  }
}

function ApplyUse(state, st) {
  if (st.needs && st.consume !== false) state.player.item = null;
  if (st.transform) state.player.item = { ...st.transform };
  if (st.gives) GiveItem(state, st.gives);
}

// 跟车掩护：车把式赶着车走，人落远了他就吁住牲口等；灯扫过来时，
// 贴着车走才在影子里（危险判定在 StepLightHazard）
function StepCartRide(state, def, input, dt) {
  if (!state.cart) state.cart = { x: def.from };
  const cart = state.cart;
  const p = state.player;
  if (Math.abs(p.x - cart.x) < 6.5) cart.x = Math.min(def.to, cart.x + def.speed * dt);
  const driver = FindActor(state, def.driver);
  if (driver) { driver.x = cart.x + 1.7; driver.heading = 1; driver.level = "surface"; }
  if (cart.x >= def.to - 0.4 && Math.abs(p.x - cart.x) < 5.5) {
    if (def.note) state.toast = { text: def.note, t: 5 };
    AdvanceBeat(state);
  }
}

// 刨料：木匠的第一课，也是这一章唯一一次"手上真有活"的教学。
//
// 上一版是「站在工作台边按 E 敲三下木楔」——镜头在十几米外，木楔只有几个
// 像素，按键落下去画面上什么都没发生，玩家手上没有任何分量。刨不一样：
// 它是**长推**的活。一推到底，一条刨花打着卷落下来，木头亮一分；推到半道
// 松了手，刨刃啃住木头，出来的是一小截碎屑，那一趟就白费了大半。
// 「推得稳不稳」这件事，用不着一个字去说。
//
// **这一拍和划线一样，长在一张铺满画框的手绘特写卡里**（state.planeCard →
// Art 的 DrawPlaneCard）。
//
// 中间走过一版"直接在世界里攥那把刨子"，退回来了。退回的理由是量出来的：
// 世界里的刨子 0.34m，2.05m 的特写下在 844×390 的手机上只有 **90×45 像素**——
// 一块木头色的小方块，压在木头色的台面上、人身子前头。用真触摸事件测过，
// 机制是通的（偏 20px 也抓得住、三趟推得完），但玩家**认不出那是能抓的东西**，
// 推到头更不知道要拖回来。能不能过测试和能不能上手，是两回事。
// 结论与石笔同源（CLAUDE.md 拟物交互第 4 条）：手指按不着/认不出的东西，
// 推镜头治不好，得换成铺满画框的活卡——卡上那把刨子占三分之一个画宽。
//
// 三条规矩照旧（和石笔同源）：
//   ① 按下去那一帧，手得落在卡上那把刨子上（PLANE_CARD.grabR 之内），
//      别处拖一律不动它；
//   ② 刨子有分量——跟手走但有速度上限，顺纹吃木沉、空拖回来轻；
//   ③ 手飘离横楔该在的高度就脱手，这一趟停在半道（刨刃啃住，刨花短一截）。
//
// 曾经这里有一条 HUD 拖动轨道（dragTrack）代替刨子受拖——那就是一根 slider，
// 用户明令禁止，已整根拆掉：轨道元素、CSS、输入通路都不在了，别加回来。
// "推到头要拖回来"也不靠字：卡上那把刨子会抬离料面、鼻子翘起来。
//
// 键盘后备照旧：光按住 E 就往前推（回程自动往回带），自动通关测试全靠它。
// 顺纹（+x）才吃木头，回程只是把刨子拖回来——木匠不会倒着刨。

// 刨料特写卡的版面：Core（判定）与 Art（作画）共用这一套归一化坐标。
export const PLANE_CARD = {
  aspect: 16 / 9,
  u0: 0.27, u1: 0.75,     // 刨子中心的行程（两头都留出刨身，不许顶出画框）
  v: 0.62,                // 料的上表面（刨底走的那条线）——压在下三分之一，
                          // 上面留给刨子和那只手，画面才不是"一条大灰带"
  gripDU: -0.03, gripDV: -0.085,   // 横楔（手攥的地方）相对刨底的偏移
  grabR: 0.15,            // 攥得住的判定半径（按卡宽）——两手抱的大家伙，给得宽
  slipV: 0.26,            // 手飘离横楔这么远就脱手（按卡高）
  // 吃木/空拖的速度上限（卡宽/秒）。刨子要有分量，但**一次舒服的划动得能走完
  // 一趟**——上限压太低，玩家一趟得分两次拖，中间那一下松手还要吃"顿住"的罚，
  // 手感就成了"它不听话"。0.55 下走完 0.48 的行程约 0.9 秒，正是一刨的时长。
  cut: 0.55,
  back: 1.0,
};

function StepPlane(state, def, input, dt) {
  const b = state.beat;
  const father = FindActor(state, "father");
  const bx = def.zone.x;
  const span = def.span ?? 0.62;
  const workX = bx - 0.55;                 // 干活的站位（台子近端）
  const need = def.passes ?? 3;

  if (b.u === undefined) {
    b.u = 0; b.passes = 0; b.stalls = 0; b.idleT = 0; b.armed = true;
    b.pile = 0; b.everMoved = false; b.grainD = 0;
    b.demoT = def.demoTime ?? 3.0; b.demoU = 0; b.demoCurl = false;
    // 撂下锯：教刨料这一拍，爹手上不能还占着拉锯的活。他先站到工位上示范
    if (father) {
      father.track = null; father.carry = null;
      father.x = workX; father.heading = 1; father.cineTarget = null;
    }
    // 看爹示范的站位：往里收一点，不然在 4.1m 的画框里他半个人挂在边上
    state.player.x = workX - 0.92;
    state.player.heading = 1;
  }

  const Publish = (u, active) => {
    state.planing = {
      x: bx, y: def.boardY ?? 0.60, span,
      u, active,
      smooth: Math.min(1, b.passes / need),      // 木头被刨亮了多少
      pile: b.pile,                              // 地上那堆刨花
      returning: !b.armed,                       // 自动通关驱动器看这个掉头
      gripped: !!b.grabbed,                      // 手正攥着刨柄
      reaching: !!b.reaching,                    // 按下了却没抓着刨子 → 光催一下
      invite: active && !b.grabbed,              // 等着被攥住：刨子透光呼吸
    };
    // 这一拍的全部画面与全部 UI 就是这张卡：铺满画框的料、刨子、两只手
    state.planeCard = active ? {
      head: u,
      smooth: Math.min(1, b.passes / need),
      pile: b.pile,
      armed: b.armed,                            // false = 推到头了，得拖回来
      gripped: !!b.grabbed,
      reaching: !!b.reaching,
      speed: dt > 0 ? Math.abs(u - (b.prevPub ?? u)) / dt : 0,
    } : null;
    b.prevPub = u;
  };

  // ── 爹的示范：一趟到底，一条长刨花。没有字幕，看就是了 ──
  if (b.demoT > 0) {
    b.demoT -= dt;
    const k = Math.min(1, Math.max(0, (def.demoTime ?? 3.0) - b.demoT - 0.5) / 1.9);
    b.demoU = k;
    if (father) { father.pose = "planePush"; father.poseU = k; }
    // 推的过程里持续出刨花声（每推过 8cm 一粒），到头甩出一条长刨花
    b.grainD += Math.max(0, k - (b.prevDemoU ?? 0)) * span;
    b.prevDemoU = k;
    if (b.grainD > 0.08) { b.grainD = 0; Cue(state, "planeCut", { gain: 0.55 }); }
    if (k >= 1 && !b.demoCurl) {
      b.demoCurl = true;
      b.pile += 1;
      state.planeCurl = { x: bx + span / 2, y: (def.boardY ?? 0.60) + 0.16, len: 1, t: 0 };
      Cue(state, "planeCurl");
    }
    if (b.demoT <= 0) {
      // 让开工位，站到台子另一头看着
      if (father) { father.pose = null; father.poseU = undefined; father.x = bx + 1.05; father.heading = -1; }
      b.demoU = 0;
      b.stepUp = true;          // 爹一让开，柱子自己上前接手
    }
    Publish(b.demoU, false);
    return;
  }

  // ── 上前接手 ──
  // 这一步必须由游戏自己走完。上一版让玩家自己走到工位，而工位判定只有
  // ±0.85m、又没有任何提示——示范一完人站在 0.92m 外，屏幕上什么都不出，
  // 玩家只能干瞪眼。教学关不该把"该站哪"变成一道谜题。
  if (b.stepUp) {
    const d = workX - state.player.x;
    if (Math.abs(d) < 0.05) { state.player.x = workX; b.stepUp = false; }
    else state.player.x += Math.sign(d) * Math.min(Math.abs(d), 1.7 * dt);
    state.player.heading = 1;
    Publish(b.u, false);
    return;
  }

  // 站定了就钉在台前：这一拍人不走路。A/D 在这儿没有意义——
  // 上一版按住 D 能一路走开，把刨料变成了"散步"。
  state.player.x = workX;
  state.player.heading = 1;

  // ── 攥住刨子（在卡上）──
  const L = PLANE_CARD;
  const uSpan = L.u1 - L.u0;
  const gripU = L.u0 + b.u * uSpan + L.gripDU;   // 横楔此刻在卡上的位置
  const gripV = L.v + L.gripDV;
  const pc = input.pointerCard;
  const held = !!input.pointerHeld && !!pc;
  if (held && !b.wasHeld) {
    // v 是按卡高归一的，折成卡宽的尺度才能量一个圆
    b.grabbed = Math.hypot(pc.u - gripU, (pc.v - gripV) / L.aspect) < L.grabR;
    // 记住攥住那一刻的手位与推程：之后手挪多少、刨子跟多少（相对量），
    // 刨子不"跳"到指尖底下
    if (b.grabbed) { b.refU = pc.u; b.refHead = b.u; Cue(state, "pickup", { gain: 0.25 }); }
  }
  if (!held) b.grabbed = false;
  b.wasHeld = held;
  b.reaching = held && !b.grabbed;
  // 脱手：手飘离横楔该在的高度太远。刨刃啃在半道的代价由下面的 stalls 逻辑收
  if (b.grabbed && Math.abs(pc.v - gripV) > L.slipV) b.grabbed = false;

  // ── 推刨 ──
  // 拖多少走多少，但吃着木头有上限——手甩得再快，刨子也只能一寸一寸啃过去。
  let dv = 0;
  if (b.grabbed) {
    const target = Math.max(0, Math.min(1, (b.refHead || 0) + (pc.u - b.refU) / uSpan));
    const want = target - b.u;
    // 顺纹吃木最沉；空拖（回程、或半道往回带）轻些
    const cap = ((want > 0 && b.armed) ? L.cut : L.back) * dt / uSpan;
    dv = Math.max(-cap, Math.min(cap, want));
  }
  // 键盘后备（自动通关测试也走这条）：光按住 E，方向由这一趟的状态给——
  // 还没推到头就往前推，推到头了就往回带。不掺 A/D，不和走路抢键。
  const keyDir = b.armed ? 1 : -1;
  if (!b.grabbed && input.interactHeld) dv += keyDir * dt * (def.keySpeed ?? 0.55);

  const prevU = b.u;
  b.u = Math.max(0, Math.min(1, b.u + dv));
  const forward = b.u - prevU;
  if (Math.abs(forward) > 0.0005) b.everMoved = true;

  if (forward > 0 && b.armed) {
    // 吃木头：每推过 8cm 出一粒刨花声，手上一直有东西在响
    b.idleT = 0;
    b.grainD += forward * span;
    if (b.grainD > 0.08) { b.grainD = 0; Cue(state, "planeCut", { gain: 0.5 + Math.random() * 0.2 }); }
  } else if (b.armed && b.u > 0.06 && b.u < 0.94) {
    // 停在半道：刨刃啃住木头。停一次扣一档，不是失败，是"这一趟不齐"
    // 宽限放到 0.45 秒：换个手、指头挪一下不该算"顿住"，真停下来才算
    b.idleT += dt;
    if (b.idleT > 0.45) { b.idleT = -1e9; b.stalls += 1; Cue(state, "planeStall", { gain: 0.8 }); }
  }
  if (forward > 0.0005 && b.idleT < 0) b.idleT = 0;   // 又推起来了，重新开始计停顿

  // 一趟推到头：刨花的长短就是这一趟的成绩
  if (b.armed && b.u >= 0.995) {
    const quality = b.stalls === 0 ? 1 : b.stalls === 1 ? 0.6 : 0.35;
    b.passes += quality;
    b.pile += 1;
    state.flags.planedOnce = true;
    state.planeCurl = { x: bx + span / 2, y: (def.boardY ?? 0.60) + 0.16, len: quality, t: 0 };
    Cue(state, "planeCurl", { gain: 0.6 + quality * 0.5, rate: 0.9 + quality * 0.25 });
    // 头一趟到头时把"回程"说一次：这是木匠的第一课，教一句是应该的。
    // 之后就不再说了——卡上那把刨子会抬起来、鼻子翘着，画面自己在说。
    if (b.passes <= 1 && b.passes < need) {
      state.toast = { text: "一整条刨花打着卷落下来。抬起刨子拖回来，再走一趟。", t: 3.4 };
    } else if (b.stalls === 0 && b.passes < need) {
      state.toast = { text: "一整条刨花打着卷落下来。", t: 2.2 };
    } else if (b.stalls > 0) {
      state.toast = { text: "中间顿了一下——出来的是碎屑。一推到底才齐。", t: 3 };
    }
    b.stalls = 0;
    b.armed = false;                     // 得把刨子拖回来才能再推一趟
  }
  if (!b.armed && b.u <= 0.05) b.armed = true;

  // 动词动画：姿势由推程直接驱动——玩家的手推多远，柱子的身子就送多远。
  // 这是"交互感"的根：不是播一段动画给他看，是他自己在带着这具身子干活。
  state.player.pose = "planePush";
  state.player.poseU = b.u;
  state.player.poseT = undefined;
  // 这一拍没有 HUD 轨道：玩家攥的是画面里那把刨子，进度就是木头上被刨亮的
  // 那一片、和地上那堆刨花本身。把它降级成一根 slider 是不行的（用户退回过两次）。
  // 引导也由那把刨子自己给（透光呼吸、攥住就压实），不占中间那条提示。
  state.prompt = null;
  Publish(b.u, true);

  if (b.passes >= need) {
    state.planing = null;
    state.planeCard = null;
    state.player.pose = null;
    state.player.poseU = undefined;
    if (father) { father.pose = null; father.poseU = undefined; }
    if (def.doneFlag) state.flags[def.doneFlag] = true;   // 数据声明的完工旗（门扇雏形靠它现身）
    if (def.note) state.toast = { text: def.note, t: 4.5 };
    AdvanceBeat(state);
  }
}

// ---------------------------------------------------------------------------
// 后果小窗（勇敢的心式画中画）：玩家的操作在画面外起了作用，就在角落里开一扇
// 照片小窗给他看一眼——桶灌满的咕咚声传到菜畦，娘直起腰；水摇上来了，娘往门口走。
// 渲染层照 who 的位置架第二台相机（Script_World.RenderPip），这里只管开与关。
// ---------------------------------------------------------------------------
function ShowPip(state, spec) {
  state.pip = { hw: 3.5, t: 3.2, ...spec };
  state.flags.pipShown = true;   // 冒烟测试盯这面旗：小窗机制断了不会有别的测试变红
}

// 干活的人（无文字引导的一部分：家里没人站着围观）。
// 爹在工作台前拉锯，娘在菜畦锄地——谁被叫去做别的事，谁再放下手里的活。
const V_PATCH_X = 16.8;   // 菜畦（veggieWest prop）里娘锄地的站位
function FatherSaw(state) {
  const father = FindActor(state, "father");
  if (!father) return;
  father.x = V.workbench.x + 0.72;   // 站近一点：锯口才落在案上那块料里
  father.heading = -1;              // 面朝工作台锯
  father.cineTarget = null;
  father.track = { name: "sawing", t: 0, ambient: true };
  father.carry = "锯";
}
function MotherHoe(state) {
  const mother = FindActor(state, "mother");
  if (!mother) return;
  mother.cineTarget = null;
  mother.x = V_PATCH_X;
  mother.heading = -1;              // 面朝菜畦
  mother.track = { name: "hoeing", t: 0, ambient: true };
  mother.carry = "锄头";
}

export const SCRIPTS = {
  c1: [
    {
      // 序章 v2（2026-08-06 砍半重排）：一分钟从卢沟桥收拢到一道门框。
      // v1 的十四行摊得太开——宏观战史占了五行，人的苦难只有一行半，
      // 「为什么被逼到地底下」反而没说透。现在 8+1 行三段式：
      //   1 行战争压境 → 3 行苦难与被逼入土（新增第 3 行专写扫荡过后的活不下去）
      //   → 1 行地道成网（题眼，全文最长一行保住）→ 3 行落到梁家村和柱子。
      // 第 8 行粮的铰链仍保留（c1_father 审问问的正是粮）。
      // 每行一段过场短片（Video/Pro_NN.mp4），手绘插卡兜底。
      kind: "cinematic", id: "c1_prologue", prologue: true,
      lines: [
        { stage: "民国二十六年，卢沟桥一声枪响。不出一年，华北尽落敌手。", d: 4.6, cam: { kind: "insertVideo", clip: "Pro_01", card: "pro1" } },
        { stage: "扫荡一年比一年狠。抢粮，烧屋，抓人。", d: 5.0, cam: { kind: "insertVideo", clip: "Pro_02", card: "pro6" } },
        { stage: "粮被抢空，屋烧成断墙。活下来的人，连哭都不敢出声。", d: 5.5, cam: { kind: "insertVideo", clip: "Pro_03", card: "pro13" } },
        { stage: "无山可靠，无林可藏。庄稼人被逼到头，把命藏进了脚下的土。", d: 6.0, cam: { kind: "insertVideo", clip: "Pro_04", card: "pro7" } },
        { stage: "先是一家的地窖，后来是两家相通的洞。再后来，村连着村——庄稼地底下，长出了另一个华北。", d: 6.4, cam: { kind: "insertVideo", clip: "Pro_05", card: "pro8" } },
        { stage: "故事，发生在冀中的梁家村。村东头，住着个姓梁的木匠。", d: 5.0, cam: { kind: "insertVideo", clip: "Pro_06", card: "pro11" } },
        { stage: "他有个儿子叫柱子——房梁的梁，柱子的柱，起的是盼头。", d: 5.6, cam: { kind: "insertVideo", clip: "Pro_07", card: "pro12" } },
        { stage: "这年春上，粮比什么都金贵——谁家囤里，都在数着过。", d: 5.2, cam: { kind: "insertVideo", clip: "Pro_08", card: "pro13" } },
        { stage: "这天早上，梁木匠把儿子叫到了门框跟前。", d: 4.0, cam: { kind: "wide", x: 42 } },
      ],
    },
    {
      // 开场先给村子，再给这一家：三个空镜把「他们住在什么样的世道里」说完
      //（据点在八里外压着、粮刚交完、碾上碾的是糠），第四镜才切进院子。
      // 没有这三镜，扫荡就是从天上掉下来的——玩家的原话是「完全没有前情提要」。
      kind: "cinematic", id: "c1_open",
      lines: [
        // 村街的全景是活的：李婶撒鸡食，担水的乡亲在井台和家门之间来回
        { stage: "1942年，华北敌后。梁家村。", d: 3.4, cam: { kind: "wide", x: 60 } },
        // 旁白说的是画面外的东西（据点在八里外）：镜头只给村东的土路——
        // 威胁不露脸，露脸的是「村里人抬眼就躲不开它」这件事
        { stage: "村东八里是鬼子的据点。炮楼比村里最高的树还高，天晴的日子，从村口就望得见。", d: 5.2, cam: { kind: "wide", x: 150, pan: 5 } },
        { stage: "开春刚交完据点摊派的粮。囤里的米、瓮底的盐，家家都得掰着指头过。", d: 5.0, cam: { kind: "shot", x: 118.6, y: 1.4, dist: 6.5 } },
        { stage: "村东头的木匠家，一大早就有响动。", d: 3.2, cam: { kind: "wide", x: 42 },
          on: (state) => {
            // 开场这场戏原来全靠字幕：爹站着不动、柱子站着不动。现在让他们演——
            // 爹手上有刨子（放下才有"放下"可看），柱子正往外跑（叫得住才有"叫住"）
            const father = FindActor(state, "father");
            if (father) { father.carry = "刨子"; father.x = 41; father.heading = -1; }
            state.player.x = 44;
            state.player.cineWalk = { x: 49, speed: 2.6 };
          } },
        // 旁白铁律：画面内的动作不实况解说。这一拍是纯走位表演——
        // 爹放下刨子、往外跑的儿子收步回身，大动作在这个镜距下自己会说话
        { stage: "", d: 3.2, cam: { kind: "shot", x: 43, y: 1.8, dist: 11 },
          on: (state) => {
            const father = FindActor(state, "father");
            // 放下刨子：手里空出来，同时工作台上多一件东西
            if (father) { father.carry = null; father.heading = 1; }
            // 被叫住：跑出去的脚步收住，转身走回门框
            state.player.cineWalk = { x: 39.4, speed: 1.7 };
          } },
        { stage: "爹朝门框那边扬了扬下巴。", d: 2.8, cam: { kind: "shot", x: 38, y: 1.8, dist: 9 },
          on: (state) => {
            state.player.cineWalk = null;
            const father = FindActor(state, "father");
            if (father) { father.cineTarget = { x: 35.6 }; father.cineSpeed = 1.4; father.heading = -1; }
          } },
      ],
    },
    {
      // 门框上的刻痕是全篇的题眼，一头一尾却都由脚本代劳。这是第一次：
      // 他是被量的那个人，所以玩家要做的就是走过去、自己靠上去、站直。
      kind: "actSeq", id: "c1_doorframe",
      objective: "爹在门框那儿等着", hint: "走到门框边",
      steps: [
        { x: V.doorframe.x, r: 1.4, prompt: "E · 靠上门框",
          on: (state) => { state.player.heading = 1; } },
      ],
    },
    {
      // 镜头推到门框上：这一下要看得见木头的纹、孩子的头顶、和那支石笔。
      // 全景里划线只是一个像素在动，凑近了才是"爹在给我量身高"。
      // 线划在**左边那根立柱的木头上**（世界 33.60→33.75，正是 DrawDoorframe
      // 画永久刻痕的那 15 公分），不是横跨门洞的空气。镜头也跟着收到那根柱子上：
      // 一道 15 公分的短线要看得见，机位就得凑到跟前。
      kind: "scribe", id: "c1_carve", zone: V.doorframe, speed: 0.5, markY: 1.28,
      markX0: 33.60, markX1: 33.75,
      cam: { kind: "shot", x: 34.0, y: 1.34, dist: 1.9 },
      objective: "爹比着你的头顶，在门框上划一道", hint: "攥住那支石笔，贴着木头拉过去",
      note: "墨斗线弹在木头上，留下一道浅浅的印。",
      onStart: (state) => {
        // 爹得真的走过来伸手够门框，不能站在院子那头让字幕替他划
        const father = FindActor(state, "father");
        if (father) { father.x = V.doorframe.x + 1.1; father.heading = -1; father.pose = "mark"; }
        state.player.x = V.doorframe.x - 0.35;
        state.player.heading = 1;
      },
      onDone: (state) => {
        const father = FindActor(state, "father");
        if (father) father.pose = null;
        // 这道刻痕从现在起长在门框上（在此之前门框是空的——不能让玩家
        // 攥着笔去划一条已经画好的线）
        state.flags.marked = true;
      },
    },
    {
      kind: "cinematic", id: "c1_mark",
      lines: [
        { stage: "爹用凿子把那道印刻深了一点。", d: 4.0, cam: { kind: "insertCard", card: "carve" } },
        { who: "爹", say: "再过几年，这个家就靠你了。", d: 3.6, cam: { kind: "ots", subject: "father", other: "player", dist: 3.4 } },
        // 旁白铁律：「仰着头不太懂」改哑剧——歪头 + 头顶冒「？」，画面自己说
        { stage: "", d: 2.6, cam: { kind: "ots", subject: "player", other: "father", dist: 3.2 },
          on: (state) => {
            state.player.pose = "puzzled";
            // 气泡要陪满整行（收尾采样在 d-0.15），下一行的 on() 里由姿势归位带走
            state.bubbleFlash = { who: "player", icon: "q", t: 3.0 };
          } },
        // 木料不是闲活：王家用半袋高粱换爹打一张榆木门。封锁沟里外，
        // 钱换不来东西——这年头，手艺就是一家人的口粮
        { stage: "他惦记着场院边那两根榆木料——王家订的门，讲好了用半袋高粱换。", d: 4.6, cam: { kind: "shot", x: 40, y: 1.8, dist: 12 },
          on: (state) => {
            // 心思已经在村东头了：眼睛先往那边去
            state.player.pose = null;
            state.player.heading = 1;
            const father = FindActor(state, "father");
            if (father) { father.heading = -1; }
          } },
      ],
    },
    {
      // 独轮车运木料：一件家务同时教「扛放」与「推」（C3 推陷车/跟车的前置）。
      // 这趟差事的前因后果一件都不省（用户退回过：「为什么搬？解决什么问题？
      // 送给谁？」）：料是**王家订门自家备的**（主家备料、木匠出工，半袋高粱
      // 换手艺——c1_mark 的旁白先把这笔账说了），王家的大车只能送到场院，
      // 窄巷这一段得靠自家独轮车倒短——爹开拍亲口派活，一句话把三个问号说完。
      // 刨完料，工作台边会立起那扇半成的门扇（doorLeafWip）——料的去处看得见。
      kind: "chain", id: "c1_barrow",
      objective: "把王家送来的门料拉回来", hint: "大车只到场院——料在草垛边，独轮车停在自家院墙外",
      bubbles: (state) => {
        // 爹缺木料：图形气泡挂在他头上，直到两根都上了车
        if ((state.flags.barrowPlanks || 0) < 2) state.bubbles.push({ who: "father", icon: "plank" });
      },
      onStart: (state) => {
        // 柱子跑腿，家里人不站着围观：爹在工作台前拉锯（他等的就是这批料），
        // 娘挎着锄头往屋西头的菜畦去——走着去，不凭空出现
        FatherSaw(state);
        const mother = FindActor(state, "mother");
        if (mother) {
          mother.carry = "锄头";
          mother.cineTarget = { x: V_PATCH_X };
          mother.cineSpeed = 1.45;
        }
        // 妹妹这会儿才从家门里蹽出来，一路往村东头跑——娘那句喊话把
        // 「妹妹在哪」钉死在老槐树底下。没有这一嗓子，c1_cloth 让玩家去找她
        // 就是没头没脑的（用户原话：一开始我也不知道妹妹就在那么远的地方）。
        // 顺路她会从取料的玩家身边跑过——「碰巧看见妹妹往东去了」
        const sister = FindActor(state, "sister");
        if (sister) {
          sister.x = 33.2;
          sister.heading = 1;
          sister.cineTarget = { x: V.sisterTree.x + 1 };
          sister.cineSpeed = 3.3;
        }
        StartMicroCine(state, [
          { who: "爹", say: "王家把门料送到场院了，大车进不了这条窄巷。去，推车拉回来。", d: 3.6,
            cam: { kind: "shot", x: 41, y: 1.6, dist: 7 } },
          // 镜头切到场院口：妹妹正好从画面里跑过去——娘在画外喊。
          //（别用 wide——那是全村大全景，人在里头只有蚂蚁大）
          { who: "娘", say: "哎——慢着点儿跑！就在老槐树底下玩，不许往村东口去！", d: 3.6,
            cam: { kind: "shot", x: 52, y: 1.7, dist: 7 } },
        ]);
      },
      tick: (state) => {
        // 娘走到菜畦就开始锄地（走位到点没有回调，这里每帧看一眼）
        const mother = FindActor(state, "mother");
        if (mother && !mother.cineTarget && !mother.track
          && Math.abs(mother.x - V_PATCH_X) < 1.2) MotherHoe(state);
      },
      steps: [
        // 木料别搁在草垛（52±1.6）里：捡的东西必须看得见（目标同屏原则的底线）
        { type: "pickup", x: 54.4, item: { id: "plankA", label: "木料", big: true }, prompt: "E · 扛起木料" },
        { type: "use", zone: { x: 50.5, w: 2.6 }, needs: "plankA", prompt: "E · 放上车",
          effect: (state) => { state.flags.barrowPlanks = 1; Cue(state, "drop"); } },
        { type: "pickup", x: 56.4, item: { id: "plankB", label: "木料", big: true },
          prompt: "E · 扛起木料",
          effect: (state) => {
            // 嗜头：母鸡扑棱着飞下去。也是「动静会惊动活物」的第一次暗示
            state.flags.henFlew = true;
            state.henFlee = { x: 56.4, t: 0 };
            Cue(state, "henSquawk");
          } },
        { type: "use", zone: { x: 50.5, w: 2.6 }, needs: "plankB", prompt: "E · 放上车",
          effect: (state) => { state.flags.barrowPlanks = 2; Cue(state, "drop"); } },
        { type: "push", from: 50.5, dist: 9.2, dir: -1, obj: "barrow",
          prompt: "按住 E · 推车",
          note: "木料到了。爹拍了拍车帮，转身拿家伙。",
          effect: (state) => { state.flags.barrowHome = true; state.cart = null; } },
      ],
    },
    {
      // 帮爹把料刨平（教「长推」）。镜头推到台面上——刨花、木纹、两双手，
      // 这一拍要看得见木头。爹先一趟示范，然后让开工位。
      // 这块刨平的料就是他接下来要合的榫；也是扫荡时他慌忙塞进柴堆的那把刨子
      // 唯一一次真正在玩家手里用过——藏的是刚才教会你的那件东西。
      kind: "plane", id: "c1_tenon", zone: V.workbench, doneFlag: "tenonDone",
      // boardY = 料的**上沿**。台面在 0.54m（DrawBench 的板厚），料厚 0.17m，
      // 所以上沿落在 0.71——低了就陷进台子里，高了就浮在半空
      passes: 3, span: 0.62, boardY: 0.71, demoTime: 3.0,
      // 景别按"木头是主角"定：4.1m 画宽、2.3m 画高——柱子占画高六成，
      // 刨子在屏幕上有七十来个像素，刨花落下来看得清是一条卷。
      // （老版这一拍根本没写 cam，用的是 12.6m 的跟随景别，木楔只有几个像素。）
      cam: { kind: "shot", x: 40.35, y: 0.88, dist: 2.05 },
      objective: "帮爹把这块料刨平", hint: "顺着木纹一推到底，中间别停",
      // 完工旗立起工作台边那扇半成的门扇（doorLeafWip）：料从场院拉回来、
      // 在台上刨平、合进门扇——一条线走完，去处全在画面里
      note: "料平了。爹抹了一遍，点了下头，把它合进靠墙那扇门样里——王家的门，起了个头。",
    },
    {
      // 教「链＋单格换手」：两跳半——挂桶才知绳断；翻堆要双手，得先放下桶；
      // 接好绳还得折回来取桶。「大件占手、放下换手」在无压力下成为肌肉记忆
      //（C4 限时链的根在这里）。
      kind: "chain", id: "c1_water",
      objective: "帮娘打一桶水回来", hint: "水缸见了底。水桶在屋里",
      bubbles: (state) => {
        // 井台缺绳：断绳气泡挂在井上，直到接好
        if (state.flags.wellRopeBroken) state.bubbles.push({ x: V.well.x, y: 2.6, icon: "rope" });
      },
      onStart: (state) => {
        // 合完榫，各回各的活：爹接着拉锯，娘已经在菜畦里了
        FatherSaw(state);
        if (!state.flags.waterFilled) MotherHoe(state);
        // 差事得有人派：娘在菜畦那头直起腰喊一嗓子，不是目标文本凭空掉下来。
        // 全章她只这一句台词——够了，一家人过日子不靠念台词
        const mother = FindActor(state, "mother");
        if (mother) { mother.track = null; mother.heading = 1; }
        StartMicroCine(state, [
          { who: "娘", say: "柱子——缸见底了，给娘拎桶水来！", d: 3.2, cam: { kind: "shot", x: V_PATCH_X + 2, y: 1.6, dist: 8 } },
        ]);
      },
      // 喊完那嗓子接着锄地：micro-cine 一收人不能一直杵在菜畦里
      //（pip 开着时不抢——望井台那一眼有自己的归位逻辑）
      tick: (state) => {
        if (state.microCine || state.pip || state.flags.waterFilled) return;
        const mother = FindActor(state, "mother");
        if (mother && !mother.track && !mother.cineTarget
          && Math.abs(mother.x - V_PATCH_X) < 1.2) MotherHoe(state);
      },
      // 打水这一路磕磕绊绊（绳断、翻堆、接绳），玩家一旦停在半道太久，
      // 后果小窗开一眼菜畦：娘直起腰朝井台望——不打断，只惦记
      pipIdle: {
        after: 22, cooldown: 40,
        on: (state) => {
          if (state.flags.waterFilled) return;
          const mother = FindActor(state, "mother");
          if (mother) { mother.track = null; mother.heading = 1; }
          ShowPip(state, {
            who: "mother", t: 3.0,
            onEnd: (s) => {
              // 望完接着干活——水还没打上来，地不能撂着
              if (!s.flags.waterFilled) MotherHoe(s);
            },
          });
        },
      },
      steps: [
        { type: "pickup", x: 31, item: { id: "bucket", label: "空水桶" }, prompt: "E · 拎起桶" },
        { type: "use", zone: V.well, needs: "bucket", consume: false, prompt: "E · 挂上井绳",
          // 绳断了不是巧合是世道：伪军挨家收过麻，好绳都交上去了，
          // 井上挂的本就是截旧的。艰苦不用喊，一根接不上的绳就够了
          note: "井绳断了半截。好麻绳去年就让伪军挨家收走了——得再寻一根。",
          effect: (state) => { state.flags.wellRopeBroken = true; } },
        { type: "drop", zone: V.woodpile, itemId: "bucket", storeIn: "bucketAt",
          prompt: "E · 放下桶腾手" },
        { type: "pickup", x: 70, item: { id: "rope", label: "麻绳" },
          prompt: "E · 抽出绳头",
          effect: (state) => {
            // 嗜头：翻堆惊出一只田鼠，贴着地皮蹿没影了
            state.mouseFlee = { x: 70, t: 0 };
            state.flags.ropeTaken = true;
          } },
        // 接绳从一条按住不放的进度条改成了真的打结：绕圈缠绳、下拽勒紧
        { type: "knot", zone: V.well, needs: "rope", needsLabel: "麻绳",
          note: "麻绳接上了。辘轳又能转了。",
          effect: (state) => { state.flags.wellRopeBroken = false; } },
        { type: "pickupGround", flagX: "bucketAt", item: { id: "bucket", label: "空水桶" },
          prompt: "E · 拎回桶" },
        { type: "winch", zone: V.well, needs: "bucket",
          gives: { id: "fullBucket", label: "一桶水", big: true },
          note: "水打上来了。桶沿一路往下滴。",
          // 桶触水灌满的咕咚声传到菜畦：娘直起腰、朝井台望——后果小窗给玩家看这一眼
          onFilled: (state) => {
            state.flags.waterFilled = true;
            const mother = FindActor(state, "mother");
            if (mother) { mother.track = null; mother.heading = 1; }
            ShowPip(state, { who: "mother", t: 3.0 });
          },
          effect: (state) => {
            // 娘出来接：满桶回家那一屏路的尽头是人，不是水缸。
            // 锄头搁在畦沿上，人往门口去——小窗再开一眼，玩家知道她动身了
            const mother = FindActor(state, "mother");
            if (mother) {
              mother.track = null;
              mother.carry = null;
              mother.cineTarget = { x: 36.4 };
              mother.cineSpeed = 2.0;
            }
            ShowPip(state, { who: "mother", t: 3.4 });
          } },
        { type: "use", zone: { x: 35.8, w: 2.6 }, needs: "fullBucket", prompt: "E · 交给娘",
          note: "娘接过桶，颠了颠分量，朝他笑了笑。",
          effect: (state) => {
            // 接过桶就进屋倒进水缸——水有去处，人有下一件事
            const mother = FindActor(state, "mother");
            if (mother) { mother.carry = "桶"; mother.cineTarget = { x: 32.4 }; mother.cineSpeed = 1.2; }
            Cue(state, "drop");
          } },
      ],
    },
    {
      // 教「投掷」＋「声音」的前一半：无压力的一投。妹妹在树下仰头跳着够——
      // 她的视线就是引导线；投空的石子惊飞一群麻雀，失败本身成为
      // 「石子落地会出声」的无压力演示（C2 声东击西的前置认知）。
      // 去的路上再翻一道田埂（翻越 30 秒内复用、换语境）。
      // （历史检查：不是风筝——1942 年敌后农村的孩子头上是花布巾。）
      kind: "chain", id: "c1_cloth",
      objective: "去老槐树下找妹妹回家吃饭", hint: "娘直起腰，朝老槐树的方向望了望",
      onStart: (state) => {
        // 妹妹仰头跳着够：动态显著性就是引导，不用文字
        const sister = FindActor(state, "sister");
        if (sister) {
          // 跳幕/极速通关时她可能还在半道上（c1_barrow 才把她从家门放出去跑）：
          // 这一拍开场她必须已经在老槐树底下，不然玩家按提示跑过去扑个空
          if (Math.abs(sister.x - (V.sisterTree.x + 1)) > 2) {
            sister.x = V.sisterTree.x + 1;
            sister.cineTarget = null;
          }
          sister.track = { name: "reachJump", t: 0 };
          sister.heading = 1;
        }
      },
      steps: [
        { type: "talk", actor: "sister", prompt: "E · 问妹妹",
          lines: [
            { who: "妹妹", say: "哥——风把俺的头巾刮到树上去了！", d: 3.2, cam: { kind: "shot", x: 126, y: 2.6, dist: 6.5 } },
            { stage: "那块洗得发白的花布巾挂在树杈上，风一过就扑棱一下。", d: 3.6, cam: { kind: "insert", x: 126.45, y: 2.43, dist: 3.2 } },
            // 她待在树下的原因，也是青黄不接写在孩子身上的样子：
            // 惦记的不是玩，是能吃的槐花
            { who: "妹妹", say: "娘说槐花开了就蒸槐花饭。俺来瞅瞅开了没有……", d: 4.2, cam: { kind: "shot", x: 126, y: 2.6, dist: 6.5 } },
          ] },
        // 靶心 = 花布巾实际挂着的那一点（Data_Scenes 的 cloth.x + Data_PropArt 的
        // cloth.yOffset）。这三处必须一起改——它们曾经一起指着树顶上方两米的空气
        { type: "throwHit", pickupX: 119, target: { x: 126.45, y: 2.43, r: 1.5 },
          prompt: "F · 投",
          missNote: "石子落了空——扑棱棱惊起一片麻雀。",
          miss: (state, land) => {
            // 投空不白投：麻雀炸窝，「石子落地会出声」这件事画面自己演了
            state.sparrowBurst = { x: land, t: 0 };
            Cue(state, "flutter");
          },
          note: "布巾打着旋儿飘下来了。",
          effect: (state) => {
            state.flags.clothDown = true;
            // 哥砸下来了，妹妹得乐：拍手蹦 + 亲口夸一句——玩家的成功要有人接着
            const sister = FindActor(state, "sister");
            if (sister) { sister.track = { name: "cheerHop", t: 0 }; sister.heading = -1; }
            StartMicroCine(state, [
              { who: "妹妹", say: "下来喽下来喽——还是俺哥中！", d: 2.6,
                cam: { kind: "shot", x: 126.4, y: 1.7, dist: 5.5 } },
            ]);
          } },
        { type: "pickup", x: 129, item: { id: "cloth", label: "花布巾" }, prompt: "E · 拾起头巾" },
        { type: "use", zone: { x: 124, w: 4 }, needs: "cloth", prompt: "E · 系上头巾",
          note: "妹妹把头巾系好，肯跟着回家了。",
          // 头巾到手，欢呼收住——跟着回家的路上不能一路蹦
          effect: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) sister.track = null;
          } },
      ],
    },
    {
      kind: "escort", id: "c1_sisterHome", follower: "sister", dest: V.homeYard,
      objective: "带妹妹回家", hint: "妹妹会跟着你走",
      // 扫荡不从天上掉下来：走到半路，报信的民兵先一步跑过——街上的人
      // 各自进屋，门一关，村子在两句话之间空了。这是警讯链的第一环
      //（民兵报信 → 村里锣响 → 村口喊声），也是"平常日子"翻面的那一瞬
      tick: (state) => {
        const b = state.beat;
        const sister = FindActor(state, "sister");
        if (b.warned || !sister?.following || state.player.x > 98) return;
        b.warned = true;
        const runner = MakeActor("runner", "militia", state.player.x + 13, { label: "报信的民兵" });
        runner.cineTarget = { x: 16 };
        runner.cineSpeed = 4.6;
        runner.cineVanish = true;
        runner.heading = -1;
        state.actors.push(runner);
        // 街坊收工进屋：撒鸡食的、扫院的、担水的各回各家，走着进门再消失
        //（c1_raid 第一行的兜底收人对他们不再有活可干）
        for (const id of ["auntFeed", "oldSweep", "carrier", "grindAunt"]) {
          const a = FindActor(state, id);
          if (!a || a.visible === false) continue;
          a.track = null;
          a.wander = null;
          a.carry = null;
          a.cineTarget = { x: a.x < 90 ? 62.5 : (a.x > 135 ? 148.5 : 92.5) };
          a.cineSpeed = 3.1;
          a.cineVanish = true;
        }
        StartMicroCine(state, [
          { who: "民兵", say: "鬼子出据点了，朝这边来——都家去，关门！", d: 3.6, cam: { kind: "shot", x: state.player.x + 6, y: 1.7, dist: 10 } },
          { stage: "街上转眼就空了。连狗都没了声。", d: 3.2, cam: { kind: "wide", x: 84 } },
        ]);
      },
      // J-cut：锣声先于切镜半拍响起——教学收尾的最后两秒，声音已经变了天
      onDone: (state) => { Cue(state, "gong"); },
    },
    {
      kind: "cinematic", id: "c1_raid",
      lines: [
        // 惊变时刻旁白闭嘴、同期声接管：村口是画外真人的喊声，不是叙事者的转述
        // 喊声这一镜给村口的**中景**（不是 52m 画宽的大远景——那种景别下
        // 一个人只有十几像素，"一支队伍"看着就是几粒沙子，玩家的原话是
        // "还是没看到鬼子的队伍"）。dist 13 ≈ 20m 画宽，正好装下车队头尾
        { who: "村口喊声", say: "鬼子进村了——", d: 3.4, far: true, cam: { kind: "shot", x: 166, y: 1.9, dist: 13, pan: -6 },
          on: (state) => {
            // 喊声一起，街上还没进屋的乡亲直接收掉（正常流程里报信民兵那一环
            // 已经让他们走着进过门了，这里是调试跳幕的兜底）；raidStarted 旗标同时把鸡藏了
            for (const vid of ["auntFeed", "oldSweep", "carrier", "grindAunt", "runner"]) {
              const v = FindActor(state, vid);
              if (v) { v.visible = false; v.track = null; v.wander = null; v.cineTarget = null; }
            }
            // 和第二章一个规矩：说到谁，谁就得在画面里。原先兵是过场演完才生成的，
            // 于是"鬼子进村了"这一句对着的是一个空村口
            SpawnRaidSoldiers(state);
            const r1 = FindActor(state, "raid1");
            const r2 = FindActor(state, "raid2");
            // 从村口往里走：镜头横摇跟着他们推进
            if (r1) { r1.x = 152; r1.heading = -1; r1.cineTarget = { x: 132 }; r1.cineSpeed = 2.0; }
            if (r2) { r2.x = 160; r2.heading = -1; r2.cineTarget = { x: 143 }; r2.cineSpeed = 1.8; }
            // 带路的翻译官走在兵后头——第二章夜里挑灯笼带路的就是他。
            // 脸要在第一章就露过，"又来了"三个字在第二章才有分量
            const tr = FindActor(state, "traitor");
            if (tr) { tr.x = 168; tr.heading = -1; tr.cineTarget = { x: 150 }; tr.cineSpeed = 1.7; }
            // 车队与纵队压进村：自行车稍快、摩托压着队走、徒步兵紧跟——
            // 速度差压小，整支队伍才装得进车队镜的一个画框
            const bike = FindActor(state, "bikeScout");
            if (bike) { bike.cineTarget = { x: 116 }; bike.cineSpeed = 2.6; }
            const moto = FindActor(state, "motoLead");
            if (moto) { moto.cineTarget = { x: 126 }; moto.cineSpeed = 2.3; }
            for (let i = 0; i < RAID_COLUMN; i += 1) {
              const c = FindActor(state, "c1col" + i);
              if (c) { c.cineTarget = { x: 138 + i * 1.9 }; c.cineSpeed = 1.9; }
            }
            Cue(state, "bikeBell");
            Cue(state, "motorPutt");
            // 镜头此刻在村东口，院子不在画框里——趁这三秒把娘和妹妹走位到位：
            // 护送收束时妹妹可能还落在半路，娘还站在门口。硬切回院子之前必须站定
            const p = state.player;
            const sister = FindActor(state, "sister");
            const mother = FindActor(state, "mother");
            if (sister) { sister.following = false; sister.cineTarget = { x: p.x + 1.6 }; sister.cineSpeed = 3.4; }
            if (mother) { mother.carry = null; mother.cineTarget = { x: p.x + 2.6 }; mother.cineSpeed = 3.4; }
          } },
        // 车队从画框里压过去的一镜：无字幕——车铃、引擎和皮靴自己说。
        // 这一镜是用户拿景区实拍立的：日军进村不可能只有两个人。
        // 构图卡在自行车、摩托、纵队头都在框内的那一段街上
        { stage: "", d: 4.2, cam: { kind: "shot", x: 150, y: 1.7, dist: 12, pan: -7 },
          on: (state) => { Cue(state, "motorPutt"); Cue(state, "bikeBell", { delay: 1.4 }); } },
        // 藏家伙不是慌乱中的怪动作，是学来的规矩：上一回扫荡就有工匠
        // 连人带家伙被掳走。这句旁白说的是画面外的旧事，也是爹结局的伏笔
        { stage: "家伙什儿得藏。上回扫荡，西头的铁匠连人带铁砧，都让抓去了据点。", d: 4.4, cam: { kind: "shot", x: 41, y: 1.8, dist: 10 } },
        { stage: "爹把刨子塞进柴堆，转身走向院门。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.8, dist: 10 },
          on: (state) => {
            // 塞柴堆得手里先有刨子：撂下锯，从工作台上抄起刨子，走向院门边的柴堆
            const father = FindActor(state, "father");
            if (father) { father.track = null; father.carry = "刨子"; father.cineTarget = { x: 44.5 }; father.cineSpeed = 2.6; }
          } },
        // 无声走位：娘把妹妹往柱子那边一推，自己转身朝院门——一个动作同时完成
        // 「交托」与「娘为何留在院里」。没有字幕，两秒的表演
        { stage: "", d: 2.2, cam: { kind: "shot", x: 39, y: 1.6, dist: 8 },
          on: (state) => {
            const p = state.player;
            const mother = FindActor(state, "mother");
            const sister = FindActor(state, "sister");
            // 推得着才叫推：娘就在妹妹身后半步（line0 已走位到位），弯腰一送
            if (sister) { sister.cineTarget = { x: p.x + 0.6 }; sister.cineSpeed = 2.4; sister.heading = -1; }
            if (mother) { mother.cineTarget = null; mother.heading = -1; mother.pose = "bow"; }
          } },
        { who: "爹", say: "带妹妹进地窖。别出声。", d: 3.0, cam: { kind: "ots", subject: "father", other: "player", dist: 3.6 },
          on: (state) => {
            // 刨子塞进了柴堆（手空了）；他站定回头叮嘱，柱子跑近两步——
            // 隔着半个院子打正反打，画面里根本凑不齐两个人
            const father = FindActor(state, "father");
            if (father) { father.carry = null; father.cineTarget = null; }
            if (father) state.player.cineWalk = { x: father.x - 2.2, speed: 2.6 };
            // 娘转身朝院门口去——她留在院里的原因，走位已经交代了。
            // 目标点要压过推妹妹时的落位（sister.x+1.0 最东 ≈46.1），不然一步就"到了"
            const mother = FindActor(state, "mother");
            if (mother) { mother.pose = null; mother.cineTarget = { x: 47.6 }; mother.cineSpeed = 1.7; }
          } },
      ],
      onDone: (state) => {
        // 考场布防。两条铁律定死了它的形状：
        //   ① 撤退方向必须是空的——地窖口在 27，柱子站在 42，这 15m 是活路，
        //      不能有人站在上面。兵全在东边（院门外的街上），朝东背着院子。
        //   ② 重置点不能落在任何人的视线里，否则一复位又被看见，就是死循环。
        // 兵在街上朝外，你从他们背后往西溜进自家屋——「背对路线站定」就是这个意思。
        state.flags.raidStarted = true;
        const r1 = FindActor(state, "raid1");
        const r2 = FindActor(state, "raid2");
        // 巡街的：来回走，走到西头（49）才够得着院子东半边
        if (r1) { r1.cineTarget = null; r1.x = 57; r1.heading = 1; r1.patrol = [49, 57]; r1.speed = 1.05; }
        // 站定的那个：搁在院门外，脸朝街——他就是石子那道软窗口的对象
        if (r2) { r2.cineTarget = null; r2.x = 51; r2.heading = 1; r2.patrol = null; }
        // 翻译官在街东头站着对名单（decor，不参与视线判定）
        const tr = FindActor(state, "traitor");
        if (tr) { tr.cineTarget = null; tr.x = 55.5; tr.heading = 1; }
        // 大队伍在东街散开挨家搜（全 decor）：车靠边停、兵三三两两踹门。
        // 全部撂在 x≥112——考场（撤退线 42→27、街上 49-57）一个不多占
        const bike = FindActor(state, "bikeScout");
        if (bike) { bike.cineTarget = null; bike.x = 114; bike.heading = -1; }
        const moto = FindActor(state, "motoLead");
        if (moto) { moto.cineTarget = null; moto.x = 124; moto.heading = -1; }
        for (let i = 0; i < RAID_COLUMN; i += 1) {
          const c = FindActor(state, "c1col" + i);
          if (!c) continue;
          c.cineTarget = null;
          c.x = 132 + i * 3.4;
          c.heading = i % 2 ? 1 : -1;
          // 两个来回走动的，街上才不是一排木桩
          if (i === 1) { c.patrol = [130, 140]; c.speed = 1.0; }
          if (i === 4) { c.patrol = [144, 154]; c.speed = 0.9; }
        }
        state.stealthActive = true;
      },
    },
    {
      kind: "escort", id: "c1_hide", follower: "sister", dest: V.cellar, stealth: true,
      objective: "带妹妹躲进地窖", hint: "地窖口在屋里西头，贴着影子走",
      resetHint: "被巡逻的鬼子看见了。再试一次——柱子还只是个孩子，跑不过刺刀。",
      // 这是教学关的考场，考的是「用过」不是「用熟」：白昼 15m 的视距会把整条
      // 撤退路线扣死，这一幕收到六成多。收的是同一个数——渲染层画的光带、
      // 判定用的视距都走 VisionScale，画出来的和判出来的永远是一条线。
      visionScale: 0.62,
      // 出发前可扒墙缝看一眼街上的刺刀（E 观察，预教第三章的「看」）——
      // 两个无字幕的插入镜头替代文字威胁说明。位置在院墙上，兵在墙外街上
      peek: {
        x: 45.6, prompt: "E · 看一眼",
        lines: [
          { stage: "", d: 2.6, cam: { kind: "insert", x: 51, y: 1.3, dist: 5 } },
          { stage: "", d: 2.2, cam: { kind: "insert", x: 55, y: 1.3, dist: 4.2 } },
        ],
      },
      // 这儿**没有**石子堆。曾经放过一个"朝街上扔一颗把兵引远"的软性窗口，
      // 但这一幕的视距已经收到六成多（visionScale 0.62），撤退路线上根本没有
      // 需要解决的压力——TestStealthEscapable 断言的就是"笨玩家一路直走 4 秒
      // 走到底、一次都不会被抓"。给一个没有问题要解决的工具，玩家只会来回
      // 试它、然后发现它什么也不干。石子会响这件事在 c1_cloth 已经教过
      //（投空惊飞麻雀），真正用它解决问题留给第二章的声东击西。
    },
    {
      kind: "cinematic", id: "c1_father",
      lines: [
        { stage: "地窖板的缝里，能看见院子。", d: 3.0, cam: { kind: "shot", x: 36.6, y: 0.9, dist: 8, slit: true },
          on: (state) => {
            // 整场审问的站位比原来东移了 3.6m。原先爹跪在 41.6-3.6=38——
            // 那正是撞塌的柴垛（fallenWood）的坐标，而柴垛走 obstacle 带、
            // 比演员近，于是**整场戏被一堆柴挡得严严实实**（实测截图为证）。
            // 演出与路障不许同坐标：路障归撤退路线，演出挪到它东边的空地上。
            const father = FindActor(state, "father");
            // cineTarget 必须清：上一段过场让他往院门走，走没走到都可能悬着。
            // 不清的话这场戏他会一边"跪"一边往 47 滑——传送演员前先掐断走位
            if (father) { father.x = 41.6; father.heading = 1; father.cineTarget = null; }
            // 妹妹这会儿跟柱子一起蹲在地窖里（护送刚把她带下来）。不显式钉住的话，
            // 调试跳幕落点会把她留在院子的地面上——正好站进柴垛里被吞掉
            const sis = FindActor(state, "sister");
            if (sis) {
              sis.following = false;
              sis.level = state.player.level;
              sis.x = state.player.x + 0.34;
              sis.heading = -1;
              sis.cineTarget = null;
            }
            const r1 = FindActor(state, "raid1");
            const r2 = FindActor(state, "raid2");
            if (r1) { r1.patrol = null; r1.cineTarget = { x: 39.6 }; r1.cineSpeed = 3; }
            if (r2) { r2.patrol = null; r2.cineTarget = { x: 44.1 }; r2.cineSpeed = 3; }
            // 翻译官跟进院，站在兵后面半步——问话的日语就是从他那边递进来的
            const tr = FindActor(state, "traitor");
            if (tr) { tr.cineTarget = { x: 45.2 }; tr.cineSpeed = 2.6; }
          } },
        { stage: "爹被两个兵按着跪在地上。", d: 3.4, cam: { kind: "shot", x: 41.6, y: 0.9, dist: 7, slit: true },
          on: (state) => {
            // 跪不是一张定格：他在挣，兵在按。两条循环轨道错开半拍咬在一起
            const father = FindActor(state, "father");
            if (father) { father.track = { name: "pressedStruggle", t: 0 }; father.heading = 1; }
            const r1 = FindActor(state, "raid1");
            // 手要按在肩上：0.55m，再远就是按空气
            if (r1) { r1.x = 41.05; r1.heading = 1; r1.cineTarget = null; r1.track = { name: "pressHold", t: 0 }; }
            const r2 = FindActor(state, "raid2");
            if (r2) { r2.x = 42.9; r2.heading = -1; r2.cineTarget = null; }
            // 娘被推跪在一边——不能让她站在画面正中看戏
            const mother = FindActor(state, "mother");
            // 39.6 是挑出来的：爹（41.6）西边两米、柴垛（38）东边一米六——
            // 两头都不压。往西一点就跪进柴垛里了
            if (mother) { mother.x = 39.6; mother.heading = 1; mother.pose = "kneel"; }
          } },
        // 审问是日语原声、不加字幕：板缝后的孩子听不懂，玩家也不必懂
        //（《勇敢的心》咕噜拟声的历史化等价物）。旁白只补画面给不了的那一句。
        { who: "日军", say: "言え！八路の食糧はどこに隠した！", noSub: true, d: 3.0,
          cam: { kind: "shot", x: 41.6, y: 0.9, dist: 7, slit: true } },
        // 日语孩子听不懂——把话递成中文的是院里那个翻译官（他就站在兵后头）。
        // 汉奸在第一章有了声音，第二章夜里认出他才有锚点；旁白也少解说一行
        { who: "翻译官", say: "太君问你——八路的粮食，藏到哪儿去了！", d: 3.6,
          cam: { kind: "shot", x: 43.6, y: 0.9, dist: 6, slit: true } },
        { stage: "爹摇头。枪托砸下来。他又摇头。", d: 4.4, cam: { kind: "insert", x: 41.6, y: 1.0, dist: 3.2, slit: true },
          on: (state) => {
            // 抡的轨道在 0.95s 到达落点；挨砸的轨道用 -0.95 的起点等在那儿，
            // 两个人在同一帧接上——这就是照参考视频 K 的那一下
            const r2 = FindActor(state, "raid2");
            if (r2) r2.track = { name: "buttStrike", t: 0 };
            const father = FindActor(state, "father");
            if (father) father.track = { name: "struckFall", t: -0.95 };
            const r1 = FindActor(state, "raid1");
            if (r1) r1.track = null;      // 按人的松开手，退半步
            if (r1) { r1.cineTarget = { x: 40.0 }; r1.cineSpeed = 1.2; }
          } },
        // 抓他的理由压在拒绝之后：摇头先立住骨气，名单再落下来，
        // 「问粮原来只是过场」的凉意才出来。呼应 c1_raid 的铁匠旧事，
        // 也给第七章据点里找到爹埋因
        { stage: "问不出粮，他们也不空手走。据点在修炮楼——名单上早写着：梁家村，木匠。", d: 5.0, cam: { kind: "shot", x: 41.6, y: 0.9, dist: 7, slit: true } },
        // 「妹妹想哭」由憋泣的呼吸声演（压低、闷），旁白只说画面外那半句
        { stage: "柱子把她的脸按进自己肩膀。", d: 3.8, cam: { kind: "close", on: "player", dist: 3.4 },
          on: (state) => {
            Cue(state, "sobBreath");
            state.player.pose = "shelter";
            state.player.heading = 1;
            const sister = FindActor(state, "sister");
            if (sister) {
              sister.pose = "leanIn";
              // **她得跟他在同一层**。护送收束时她的 level 还留在地面，
              // 于是这一拍柱子一个人在地窖里搂空气、妹妹站在头顶的院子里
              //（特写只框柱子，看上去就是他抱着一团空气发呆）
              sister.level = state.player.level;
              sister.x = state.player.x + 0.34;
              sister.heading = -1;
              sister.visible = true;
              sister.crouch = false;
              sister.track = null;
            }
          } },
        { stage: "爹被拖出院门的时候，回头看了一眼门框。", d: 4.2, cam: { kind: "shot", x: 45.6, y: 1.2, dist: 11, pan: 1.5 },
          on: (state) => {
            const father = FindActor(state, "father");
            // 脸还朝着门框那边：cineKeepHeading 不让行走方向把头扳回去
            if (father) { father.pose = "hauled"; father.heading = -1; father.cineKeepHeading = true; }
            const r2 = FindActor(state, "raid2");
            if (r2) r2.pose = null;
            // "架着走"得真的架着：两个兵一左一右贴在肩上，同速同向，
            // 全程钳成一个三人组。原先三个人隔着几米各走各的，谁也没在拖谁
            const r1 = FindActor(state, "raid1");
            if (father && r1) { r1.x = father.x - 0.72; }
            if (father && r2) { r2.x = father.x + 0.72; }
            // 翻译官走在押人队伍前头——带路进村的是他，领人出村的也是他
            const tr = FindActor(state, "traitor");
            if (tr) { tr.x = 47.1; tr.heading = 1; }
            for (const id of ["father", "raid1", "raid2", "traitor"]) {
              const a = FindActor(state, id);
              if (a) { a.cineTarget = { x: 62 }; a.cineSpeed = 1.5; a.cineVanish = true; }
            }
            // 整支队伍收队出村：摩托先响、纵队跟上——爹是被押进那支队伍里
            // 带走的，不是被两个人拎走的。引擎声由远及无
            Cue(state, "motorPutt", { gain: 0.7 });
            for (const a of state.actors) {
              // 翻译官走押人那一小队（上面已排）；挎斗里的兵钉在车上跟车走
              if (!a.decor || a.pinTo || a.id === "traitor") continue;
              a.patrol = null;
              a.cineTarget = { x: 196 };
              a.cineSpeed = a.mount === "motorcycle" ? 2.8 : (a.mount === "bicycle" ? 3.2 : 1.6);
              a.cineVanish = true;
              a.heading = 1;
            }
          } },
        { stage: "那道刚刻下的线，还露着新茬。", d: 3.4, cam: { kind: "shot", x: 34, y: 1.5, dist: 5.5 },
          // iris 收在情感物件上：圆心对准门框刻痕收拢落黑
          on: (state) => { state.irisFocus = { x: 34.05, y: 1.30 }; } },
      ],
    },
  ],

  c2: [
    {
      kind: "cinematic", id: "c2_open",
      lines: [
        { stage: "1943年。爹没有回来。", d: 3.0, cam: { kind: "wide", x: 37 } },
        { stage: "柱子十六岁了，学会了爹的手艺，也学会了听见狗叫就先看村口。", d: 4.2, cam: { kind: "shot", x: 40, y: 1.8, dist: 10 } },
        { stage: "这天夜里，狗叫得不一样。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.8, dist: 10 } },
        // 说到谁，谁就得在画面里：巡逻队在这一行进场，不是等过场演完
        // 队伍从村东口进来，镜头往西横移跟着走：一条村道上排开十几个人和几盏灯，
        // "又来了"这三个字才有分量
        { stage: "鬼子又来了。这回他们拿着名单，挨家找帮过八路的人。", d: 5.0,
          cam: { kind: "wide", x: 154, y: 3.4, hw: 30, pan: -18 },
          on: (state) => { SpawnNightSweep(state); } },
        // 与第一章接上：抓走爹那天带路的就是这张脸。仇不是抽象的"敌人"，
        // 是一个认得出来的人——第二章的夜才和柱子有私仇
        { stage: "前头挑灯笼带路的，是据点的翻译官——去年领着兵抓走爹的，就是他。", d: 5.0, cam: { kind: "shot", x: 120, y: 1.6, dist: 9 },
          on: (state) => {
            const s1 = FindActor(state, "sweep1");
            if (s1) { s1.x = 124; s1.heading = -1; }
          } },
      ],
    },
    {
      // 潜行开打之前，规则必须先演一遍给玩家看：娘按着你蹲下、第一盏灯
      // 从草垛沿上扫过去、没事——这一遍是安全的。没有这一拍，玩家走到
      // 半路被灯照满就只会觉得"什么意思？"，不会觉得自己学会了什么。
      kind: "cinematic", id: "c2_teach",
      lines: [
        { stage: "娘把两个孩子拉到草垛后头，按着蹲下。", d: 3.2, cam: { kind: "shot", x: 52, y: 1.3, dist: 7 },
          on: (state) => {
            // 上一镜在据点方向（x≈120），这一镜硬切回草垛——切镜时把人预摆到
            // 画框边上再走进来。原先从 38 起步走 14 米，三秒根本到不了，
            // 于是"拉到草垛后头"的柱子一直站在画框外
            const mother = FindActor(state, "mother");
            if (mother) { mother.x = 46; mother.cineTarget = { x: 50.5 }; mother.cineSpeed = 2.2; }
            state.player.x = 47;
            state.player.cineWalk = { x: 52.5, speed: 2.4 };
            const sister = FindActor(state, "sister");
            if (sister) { sister.x = 53.5; sister.heading = -1; }
          } },
        { stage: "一盏灯笼从东边巡了过来。", d: 4.2, cam: { kind: "shot", x: 59, y: 1.4, dist: 10 },
          on: (state) => {
            state.player.cineWalk = null;
            state.player.crouch = true;
            const sister = FindActor(state, "sister");
            if (sister) sister.pose = "leanIn";
            // 按着孩子蹲下的娘不能自己站得笔直：弯腰压着两个孩子，贴在跟前
            const mother = FindActor(state, "mother");
            if (mother) { mother.pose = "bow"; mother.cineTarget = null; mother.x = 51.4; mother.heading = 1; }
            // 开场过场把这个兵留在了 x≈124（挑灯带路那一镜）——不先把他挪到
            // 画框右沿外一步，"巡了过来"就是一句空话：灯根本进不了画面。
            // 说到谁，谁就得在画面里。走得慢：教学不赶时间，灯压过来的
            // 每一步都是给玩家看的。
            const s1 = FindActor(state, "sweep1");
            if (s1) {
              s1.x = 71;
              s1.heading = -1;
              s1.lantern = true;
              s1.cineTarget = { x: 58.5 };
              s1.cineSpeed = 1.6;
            }
          } },
        // 这两行不切走：镜头停在草垛上，看着灯一寸一寸压过来——教学的正片是这一镜
        // 说话的人必须在画框里：娘蹲在 51.4，dist 8 的半宽约 3.8m，框住 50.2~57.8
        { who: "娘", say: "灯扫过来，就躲到草垛背光的那一头去。别在亮地里站着。", d: 4.6, cam: { kind: "shot", x: 54, y: 1.3, dist: 8 } },
        { stage: "灯影在草垛根下一寸一寸挪过来。谁也没出声。", d: 4.2, cam: { kind: "shot", x: 56.5, y: 1.1, dist: 6.5 } },
        // 规则的第二半：灯从哪边来，影子就在哪一头——所以背面**会易手**。
        // 娘领着两个孩子从草垛东侧绕到西侧，一步都不解释；这一绕就是教学本身。
        // 镜头压到 51.5：三个人的落点（50.2 / 49.4 / 48.6）都得留在画框里，
        // 否则"娘揽着两个孩子挪到西边"演给谁看
        { stage: "灯绕到了草垛东头。娘揽着两个孩子，贴着垛根挪到了西边。", d: 4.6, cam: { kind: "shot", x: 51.5, y: 1.2, dist: 7.5 },
          on: (state) => {
            const s1 = FindActor(state, "sweep1");
            if (s1) { s1.cineTarget = { x: 55.5 }; s1.cineSpeed = 1.4; }
            const mother = FindActor(state, "mother");
            if (mother) { mother.pose = "bow"; mother.cineTarget = { x: 50.2 }; mother.cineSpeed = 1.5; }
            state.player.cineWalk = { x: 49.4, speed: 1.6 };
            const sister = FindActor(state, "sister");
            if (sister) { sister.pose = null; sister.cineTarget = { x: 48.6 }; sister.cineSpeed = 1.6; }
          } },
        { stage: "灯光从草垛沿上掠过去，顿了顿，又移开了。", d: 4.4, cam: { kind: "shot", x: 51.5, y: 1.2, dist: 7.5 },
          on: (state) => {
            state.player.cineWalk = null;
            const s1 = FindActor(state, "sweep1");
            if (s1) { s1.cineTarget = { x: 74 }; s1.cineSpeed = 1.8; }
          } },
        { who: "娘", say: "记住：灯在哪边，你就在草垛的另一边。灯一走，赶紧挪下一垛。", d: 4.8, cam: { kind: "ots", subject: "mother", other: "player", dist: 3.4 } },
      ],
      onDone: (state) => {
        state.player.crouch = false;
        const sister = FindActor(state, "sister");
        if (sister) { sister.pose = null; sister.cineTarget = null; }
        const mother = FindActor(state, "mother");
        if (mother) { mother.pose = null; mother.cineTarget = null; }
        const s1 = FindActor(state, "sweep1");
        if (s1) s1.cineTarget = null;   // 交还常规巡逻
      },
    },
    {
      // 一段掩体接一段掩体地往东挪。娘在前头找掩体、自己蹲下——她不再替你
      // 判断"什么时候能动"（那是老版唯一的玩法，也是"一点策略也没有"的根）。
      // 你自己要做的三件事：站到掩体背光的那一面、读巡逻回头扫的节奏、
      // 在过不去的长空地上拿石子换一个窗口或者等板车的影子。
      kind: "coverRun", id: "c2_mother", leader: "mother", follower: "sister",
      to: 116, lead: 5.0,
      // 走过一处掩体存一次点（失败退回这儿，不是退回整段开头）
      checkpoints: [52, 60, 68, 78, 88, 107],
      // 板车从村西的黑地里驶出来，一路往东拐进老槐树那边的院子。**单向**：
      // 走到 84 跟前第一趟才发车，正好从画框左外进来
      convoy: { armAt: 78, spawn: 66, exit: 124, speed: 2.6, gap: 7, r: 2.6 },
      cartDriver: "hauler",
      // 路边的石子堆：捡一颗扔出去，落地那一声能把最近的灯引开——自己造窗口
      stonePile: { x: 73.5 },
      // 挨家挨户搜过来的那一队。慢（0.55 m/s，人走路的八分之一），但不停：
      // 没有它，最优解永远是蹲着不动等灯走远
      pressure: { id: "searcher", leash: 10 },
      objective: "带着妹妹跟上娘，往村东挪",
      hint: "灯在哪边，就藏到掩体的另一边；矮的柴堆水瓮得蹲下",
      resetHint: "灯把人照满了。退回上一处掩体，看准灯回头的空当再动。",
      // 卡了十几秒才出的一句状态行（不含键名）。说的是规则不是操作：
      // 石子得落在灯的背后他才会转身（所以要蹲着摸近），长空地那段等板车
      stuckHint: "石子要落在灯的背后，他才会转过去",
      onEnter: (state) => {
        // 夜里被叫起来出夫的乡亲，一车草料往东送。对搜村的人来说他是自己人的
        // 差役，谁也不拦——所以那片车影是安全的
        if (!FindActor(state, "hauler")) {
          state.actors.push(MakeActor("hauler", "villager", 74, { label: "出夫的乡亲", visible: false }));
        }
        // 搜家的：一手灯一手枪托砸门，从村西往东推
        if (!FindActor(state, "searcher")) {
          state.actors.push(MakeActor("searcher", "soldier", 38, {
            lantern: true, heading: 1, advance: 0.55, searchHold: 2.2,
          }));
        }
        // 布防分两段，一段一道题：
        //  · sweep1 在掩体密的那一半（52~88）来回走、还会停下回头扫——
        //    考的是"绕到掩体背面去"，草垛断墙够多，走错一步有得救；
        //  · sweep2 是**堵在巷口的哨兵**，脸朝西钉在 88→107 那段长空地的
        //    另一头，而那一段一处掩体也没有。他每隔几秒回一次头（脸朝东），
        //    那就是窗口。考的是"拿什么换这个窗口"：数他回头的节奏冲过去，
        //    或者干脆等板车，跟着车影一路走过去。
        const s1 = FindActor(state, "sweep1");
        if (s1) { s1.x = 74; s1.patrol = [54, 88]; s1.speed = 1.5; s1.scanEvery = 5.0; s1.scanHold = 2.2; }
        const s2 = FindActor(state, "sweep2");
        if (s2) {
          // 钉住不动：来回踱步会让他的脸也来回转，窗口就成了白送的。
          // 他的脸只由"回头扫"这一件事翻——那是玩家要读的唯一一个节奏。
          // postX/postHeading：被石子引开之后他会走回岗位、重新朝西
          s2.x = 101; s2.patrol = null; s2.heading = -1; s2.speed = 1.3;
          s2.postX = 101; s2.postHeading = -1;
          s2.scanEvery = 6.0; s2.scanHold = 3.4;
        }
      },
      onReset: (state) => {
        // 铁律：重置点不能落在任何人的视线里。退回掩体的同时，搜家的那一队
        // 也退回存点时的位置（snapshot 已经搬了他），压力线跟着一起重算
        state.beat.furthestX = state.beat.snapshot.player.x;
      },
      onDone: (state) => {
        state.cart = null;
        state.cartCoverR = undefined;
        const h = FindActor(state, "hauler");
        if (h) h.visible = false;
        state.actors = state.actors.filter((a) => a.id !== "searcher");
        // 哨兵解除岗位，否则下一幕娘把巡逻引去村西时他会被 postX 拽回巷口
        const s2 = FindActor(state, "sweep2");
        if (s2) { s2.postX = undefined; s2.postHeading = undefined; }
      },
    },
    {
      kind: "cinematic", id: "c2_decoy",
      lines: [
        { stage: "前面巷口站着人。走不过去了。", d: 3.0, cam: { kind: "shot", x: 136, y: 1.4, dist: 9 },
          on: (state) => {
            // 巷口那个人得真站在巷口：他此刻可能巡到 150 开外，三秒走不进画。
            // 切镜时把他放到画框右沿内，一步步逼近堵死路口
            const s3 = FindActor(state, "sweep3");
            if (s3) { s3.x = 143; s3.heading = -1; s3.cineTarget = { x: 138 }; s3.cineSpeed = 1.6; }
          } },
        { stage: "娘把妹妹的手放进柱子手里，又把两个孩子往石碾后面按了按。", d: 4.4, cam: { kind: "insert", x: 118, y: 1.0, dist: 2.8 },
          on: (state) => {
            // 特写只有 ±2.8m：手递手的三个人必须真的凑在石碾跟前
            const mother = FindActor(state, "mother");
            if (mother) { mother.x = 118; mother.heading = 1; }
            state.player.x = 116.9;
            state.player.heading = 1;
            const sister = FindActor(state, "sister");
            if (sister) { sister.x = 118.7; sister.heading = -1; }
          } },
        { stage: "她没说话。只朝村东口努了努嘴。", d: 3.4, cam: { kind: "ots", subject: "mother", other: "player", dist: 3.4 } },
        { stage: "然后她站起来，朝反方向走去，故意踢翻了一只水瓮。", d: 4.2, cam: { kind: "shot", x: 112, y: 1.6, dist: 11, pan: -4 },
          on: (state) => {
            const mother = FindActor(state, "mother");
            if (mother) { mother.cineTarget = { x: 84 }; mother.cineSpeed = 2.3; }
          } },
        { stage: "灯笼、喊声、脚步，全都追着那声响去了。", d: 3.8, cam: { kind: "shot", x: 92, y: 1.8, dist: 15, pan: -3 },
          on: (state) => {
            // 追声响的两盏灯从画框东沿外一步赶进来——巡逻此刻散在哪儿都有可能，
            // 不显式摆位，这句话就对着空街说
            const s1 = FindActor(state, "sweep1");
            if (s1) { s1.x = 100; s1.cineTarget = { x: 78 }; s1.cineSpeed = 2.6; }
            const s2 = FindActor(state, "sweep2");
            if (s2) { s2.x = 109; s2.cineTarget = { x: 80 }; s2.cineSpeed = 2.6; }
          } },
        // 娘的结局不在台词里：镜头不动，只看几盏灯往一处汇、重叠、停住
        { stage: "", d: 4.4, cam: { kind: "shot", x: 76, y: 1.5, dist: 11, trans: "dip" },
          on: (state) => {
            // 这一镜带黑场闪断（dip）：黑场里把追灯的三个人重新排到汇拢的起点，
            // speed 取 2.4——正好在下一行"灯停住了"之前全部走到、站定
            const mother = FindActor(state, "mother");
            if (mother) { mother.x = 84; mother.cineTarget = { x: 66 }; mother.cineSpeed = 2.6; }
            for (const [id, sx, tx] of [["sweep1", 84, 70], ["sweep2", 87, 74], ["sweep3", 88, 78]]) {
              const s = FindActor(state, id);
              if (s) { s.visible = true; s.lantern = true; s.x = sx; s.cineTarget = { x: tx }; s.cineSpeed = 2.6; }
            }
          } },
        { stage: "灯停住了。", d: 3.0, cam: { kind: "shot", x: 72, y: 1.5, dist: 8 },
          on: (state) => {
            const mother = FindActor(state, "mother");
            if (mother) { mother.visible = false; mother.cineTarget = null; }
          } },
      ],
      onDone: (state) => { MotherDecoyDone(state); },
    },
    {
      kind: "escort", id: "c2_escape1", follower: "sister", dest: V.treeShade, stealth: true,
      objective: "带妹妹往村东口去", hint: "沿着草垛和断墙的影子走",
      resetHint: "妹妹跑不快。等巡逻走远了再动。",
    },
    {
      // C1 的窝头喂的是妹妹，这回喂的是狗：同一个村子，两种夜晚。
      // 狗叫不是立刻失败——它把巡逻招过来，麻烦是滚起来的。
      kind: "chain", id: "c2_dog",
      objective: "王家的狗拴在路边——不能让它叫", hint: "狗认吃不认人。石碾上晾着几个窝头",
      resetHint: "灯笼追着狗叫围过来了。退回槐树影里，等他们散开。",
      steps: [
        { type: "pickup", x: 118, item: { id: "bun", label: "窝头" }, prompt: "E · 拿个窝头" },
        { type: "use", zone: V.dogYard, needs: "bun", prompt: "E · 丢过去",
          note: "狗埋下头去啃。尾巴摇了摇，没再出声。",
          effect: (state) => { state.flags.dogFed = true; } },
      ],
    },
    {
      // C1 打的是树杈上的布巾，这回打的是灯：同一个动词，第二次用在命上。
      kind: "chain", id: "c2_lantern",
      objective: "巷口的马灯照住了必经的路", hint: "草垛边有石子堆。灯挂得高，够不着",
      light: { zone: [156, 164], cycle: 1, lit: 1, offFlag: "lanternOut", src: { x: 160, y: 2.4 } },
      resetHint: "灯光里晃过人影，巡逻的喝了一声。退回草垛后面，重新想辙。",
      steps: [
        { type: "throwHit", pickupX: 152, target: { x: 160, y: 2.3, r: 2 },
          prompt: "F · 把马灯打灭",
          missNote: "石子磕在墙上，弹进了黑影里。再捡一颗。",
          note: "灯罩一声脆响，火苗灭了。影子一直接到了村东口。",
          effect: (state) => { state.flags.lanternOut = true; } },
      ],
    },
    {
      kind: "escort", id: "c2_escape2", follower: "sister", dest: V.eastExit, stealth: true,
      objective: "带妹妹去村东口", hint: "灯灭了，影子是连着的",
      resetHint: "妹妹跑不快。等巡逻走远了再动。",
      midToast: { zone: { x: 165, w: 6 }, text: "路过的院里在拖人。柱子把妹妹的脸按在自己胸口，贴着墙根走了过去。" },
    },
    {
      kind: "cinematic", id: "c2_taken",
      lines: [
        { stage: "村东口就在眼前。", d: 2.6, cam: { kind: "shot", x: 166, y: 1.5, dist: 9 } },
        { stage: "两盏马灯突然从路两边亮起来。", d: 3.0, cam: { kind: "shot", x: 172, y: 1.5, dist: 10 },
          on: (state) => {
            state.actors.push(
              MakeActor("ambush1", "puppet", 178, { lantern: true, heading: -1 }),
              MakeActor("ambush2", "soldier", 167, { lantern: true, heading: 1 }),
            );
          } },
        { stage: "是等在这里的。", d: 2.6, cam: { kind: "shot", x: 172, y: 1.3, dist: 7 } },
      ],
    },
    {
      // 关卡设计写的是"带妹妹逃离失败——柱子第一次真正面对：自己保护不了家人"。
      // 这件事不能用过场演给玩家看，得让他自己按着不放、然后眼看着按不住。
      // 进度条永远到不了头：越用力掉得越快，这是设计，不是数值没调好。
      kind: "doomedHold", id: "c2_grip", duration: 4.6, cap: 0.72,
      objective: "别松手", hint: "手别抬起来",
      prompt: "按住 E · 别松手",
      pull: { actor: "sister", from: 174.2, to: 179 },
      onStart: (state) => {
        state.player.x = 173;
        state.player.heading = 1;
        const sister = FindActor(state, "sister");
        // 手拉着手才有"被拽走"可言——她原先站在几米开外，进度条就成了个抽象数字
        if (sister) { sister.x = 174.2; sister.following = false; sister.heading = -1; }
      },
      onFail: (state) => {
        const sister = FindActor(state, "sister");
        if (sister) { sister.following = false; sister.cineTarget = { x: 179 }; sister.cineSpeed = 2.4; }
        const a1 = FindActor(state, "ambush1");
        if (a1) { a1.cineTarget = { x: 184 }; a1.cineSpeed = 2.0; a1.cineVanish = true; }
      },
    },
    {
      kind: "cinematic", id: "c2_taken2",
      lines: [
        { stage: "妹妹的手从柱子手里被拽走。", d: 3.2, cam: { kind: "insertCard", card: "hands" } },
        { stage: "他扑上去。", d: 2.2, cam: { kind: "close", on: "player", dist: 3.6 },
          on: (state) => {
            state.player.pose = "lunge";
            state.player.cineWalk = { x: state.player.x + 1.4, speed: 2.2 };
          } },
        { stage: "枪托砸在背上。", d: 2.6, cam: { kind: "close", on: "player", dist: 3.0 },
          on: (state) => {
            state.player.cineWalk = null;
            state.player.pose = "struck";
            const a2 = FindActor(state, "ambush2");
            if (a2) { a2.pose = "swing"; a2.x = state.player.x + 1.3; a2.heading = -1; }
          } },
        { stage: "邻居七叔从沟里死死抱住他，捂着他的嘴，把他拖进高粱地。", d: 4.4, cam: { kind: "shot", x: 168, y: 1.0, dist: 8 },
          on: (state) => {
            state.player.pose = "dragged";
            // 七叔得在画面里：从沟里出来，抱住他往西拖
            state.actors.push(MakeActor("qishu", "villager", state.player.x - 0.7,
              { label: "七叔", heading: 1, pose: "lunge" }));
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = { x: state.player.x - 9 }; q.cineSpeed = 1.6; }
            state.player.cineWalk = { x: state.player.x - 8.4, speed: 1.5 };
            const sister = FindActor(state, "sister");
            if (sister) sister.visible = false;
            const a2 = FindActor(state, "ambush2");
            if (a2) { a2.pose = null; a2.cineTarget = { x: 184 }; a2.cineVanish = true; }
          } },
        { stage: "", d: 1.8, cam: { kind: "shot", x: 160, y: 1.0, dist: 10, trans: "dip" },
          on: (state) => {
            state.player.pose = null;
            const q = FindActor(state, "qishu");
            if (q) { q.visible = false; q.cineTarget = null; }
          } },
        { stage: "那天夜里，娘没有回来。", d: 3.4, cam: { kind: "dark" } },
        { stage: "柱子在高粱地里蹲到天亮。他只剩一个念头了。", d: 4.0, cam: { kind: "dark" } },
        { stage: "救回妹妹。", d: 3.0, cam: { kind: "dark" } },
      ],
    },
  ],

  c3: [
    {
      kind: "cinematic", id: "c3_open",
      lines: [
        { stage: "乡亲们说，被抓的人关进了河东的据点。", d: 3.4, cam: { kind: "wide", x: 100 } },
        { stage: "柱子沿着运输队的车辙，摸到了据点外的庄稼地。", d: 3.8, cam: { kind: "wide", x: 150, pan: 6 } },
        { stage: "他不敢靠近。他先学会了看。", d: 3.2, cam: { kind: "shot", x: 20, y: 1.4, dist: 8 } },
      ],
      onDone: (state) => {
        SpawnFortPatrols(state, false);
        // 地里的乡亲：不是任务点，是要搭把手的人。帮了忙，话才敢说出口
        state.actors.push(
          MakeActor("aunt", "villager", F.auntSpot.x, { label: "拾柴的大娘" }),
          MakeActor("cartman", "villager", 107, { label: "赶车乡亲" }),
        );
      },
    },
    {
      kind: "observe", id: "c3_watch", spots: [F.obsWest, F.obsSouth, F.obsEast], watchTime: 5,
      objective: "在三处遮蔽点观察据点（每处停留一会儿）",
      hint: "蹲在遮蔽点里别动，柱子会把看到的记在心里",
      resetHint: "巡逻队走近了。柱子退回庄稼地，等风声过去。",
      notes: [
        "岗楼上两个人，换岗时背对南门，半袋烟的工夫。",
        "巡逻队沿墙根来回走，走到头会停下来抽袋烟。",
        "牢房在东边。白天押着人往围墙上搬土袋，天黑后送过一次饭。押送用的骡车拴在门里。",
      ],
      // 每看完一处，切到他正望着的那样东西上。第三章的功课是"学会看"，
      // 那就得让画面替他看，不是让字幕替他记。
      watchCine: [
        [{ stage: "岗楼上那两个人换班的时候，背是朝着南门的。", d: 3.6, cam: { kind: "insert", x: 184, y: 5.4, dist: 5.5 } },
         { stage: "从背过身到重新站定，大约半袋烟的工夫。", d: 3.2, cam: { kind: "insert", x: 184, y: 5.4, dist: 4.6 } }],
        [{ stage: "巡逻队沿着墙根来回走。走到头，会停下来抽袋烟。", d: 3.8, cam: { kind: "insert", x: 176, y: 1.4, dist: 6.5 } }],
        [{ stage: "牢房在东边。白天押着人往围墙上搬土袋。", d: 3.6, cam: { kind: "insert", x: 192, y: 1.6, dist: 6 } },
         { stage: "门里拴着一辆骡车。车辕上空着。", d: 3.6, cam: { kind: "insert", x: 190, y: 1.0, dist: 3.4 } }],
      ],
    },
    {
      // 帮了忙，话才敢说：柴刀换来的那句口信，是第六章推理的半边
      kind: "chain", id: "c3_aunt",
      objective: "拾柴的大娘朝这边招了招手", hint: "乡亲们敢说话，但只敢小声说",
      resetHint: "巡逻队走近了。柱子退回庄稼地，等风声过去。",
      steps: [
        { type: "talk", actor: "aunt", prompt: "E · 搭话",
          lines: [
            { who: "大娘", say: "孩子，帮我找找柴刀——手一抖，掉进田埂那头了。", d: 3.8, cam: { kind: "ots", subject: "aunt", other: "player", dist: 3.4 } },
          ] },
        { type: "pickup", x: 134, item: { id: "sickle", label: "柴刀" }, prompt: "E · 摸出柴刀" },
        { type: "use", zone: F.auntSpot, needs: "sickle", prompt: "E · 还给大娘",
          noteAdd: "拾柴的大娘：『过几天要往县里押人。孩子，你一个人不行。』",
          note: "大娘攥住他的手腕，压低了声：『过几天要往县里押人。孩子，你一个人不行。』" },
      ],
    },
    {
      // 教「推」。推出来的不是路——是一片会走路的影子
      kind: "chain", id: "c3_cart",
      objective: "赶车乡亲的驴车陷住了", hint: "车帮上还搭着半车干草",
      resetHint: "巡逻队回头了。退进庄稼地，等他们走远。",
      steps: [
        { type: "talk", actor: "cartman", prompt: "E · 上前搭话",
          lines: [
            { who: "赶车乡亲", say: "给据点支差送草——车陷在这儿了。搭把手；躲着点巡逻的。", d: 4.2, cam: { kind: "ots", subject: "cartman", other: "player", dist: 3.4 } },
          ],
          noteAdd: "赶车的乡亲：『里头新关了十几个，有女娃。别靠南门，狗鼻子灵。』" },
        { type: "push", from: 106, dir: 1, dist: 4, prompt: "按住 E · 推车",
          note: "车轮从辙里蹦出来了。乡亲把缰绳一抖。" },
      ],
    },
    {
      // 《勇敢的心》式移动掩体段：车影是探照灯下唯一的影子
      kind: "cartRide", id: "c3_ride", from: 110, to: 144, speed: 1.35, safeR: 2.8, driver: "cartman",
      light: { zone: [120, 142], cycle: 7.5, lit: 2.4, src: { x: 184, y: 6 } },
      objective: "贴着草车走——灯扫过来时，车影是唯一的影子",
      hint: "别掉队。掉出车影又赶上灯，就全完了",
      resetHint: "灯从车帮上扫过去——差一点。乡亲把车又吁回了辙口。",
      note: "到草垛这儿，乡亲一抬下巴：前头的路，你自己贴着黑走。",
      onReset: (state) => { if (state.cart) state.cart.x = 110; },
      onDone: (state) => {
        // 车把式赶着车进据点交差去了
        const cm = FindActor(state, "cartman");
        if (cm) { cm.cineTarget = { x: 174 }; cm.cineSpeed = 1.5; cm.cineVanish = true; }
      },
    },
    {
      kind: "goto", id: "c3_closer", zone: F.gate, stealth: true,
      objective: "趁灯的间隙摸近南门，看清牢房方向", hint: "蹲在田埂下，读准探照灯的节奏再动",
      light: { zone: [146, 170], cycle: 8, lit: 2.6, src: { x: 184, y: 6 } },
      resetHint: "岗楼上的灯扫了过来。退回田埂下，重新数灯的节奏。",
      interruptAt: 0.8,
    },
    {
      kind: "cinematic", id: "c3_rescue",
      lines: [
        { stage: "身后突然伸过来一只手，把柱子整个按进田埂下面。", d: 3.6, cam: { kind: "close", on: "player", dist: 3.8 } },
        { stage: "巡逻队的脚步声从头顶的田埂上过去了。", d: 3.6, cam: { kind: "shot", x: 158, y: 1.2, dist: 9 } },
        { stage: "沟里蹲着几个背枪的庄稼人。领头的把他上下打量了一遍。", d: 4.0, cam: { kind: "shot", x: 9, y: 1.2, dist: 9 },
          on: (state) => {
            state.player.x = 11;
            const gao = MakeActor("gao", "militia", 7, { label: "高传宝", heading: 1 });
            state.actors.push(gao, MakeActor("mil1", "militia", 4, { heading: 1 }));
          } },
        { who: "高传宝", say: "梁家村的柱子？", d: 2.8, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
        { stage: "柱子没敢答话。", d: 2.4, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
        { who: "高传宝", say: "你爹以前帮过乡亲。", d: 3.0, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
        { stage: "夜里，一个满身泥的交通员摸进沟来，鞋底磨穿了。", d: 4.0, cam: { kind: "shot", x: 12, y: 1.2, dist: 8 },
          on: (state) => {
            state.actors.push(MakeActor("runner", "villager", 20, {
              label: "交通员", cineTarget: { x: 13 }, cineSpeed: 2.6, heading: -1,
            }));
          } },
        { stage: "他的鞋底磨穿了。", d: 3.0, cam: { kind: "insertCard", card: "sole" } },
        { who: "交通员", say: "据点里又抓了几个人。柱子的妹妹，也在里面。", d: 4.2, cam: { kind: "ots", subject: "runner", other: "gao", dist: 3.6 } },
        { who: "高传宝", say: "先把人救出来。不能让乡亲们再被带走。", d: 4.0, cam: { kind: "ots", subject: "gao", other: "runner", dist: 3.6 } },
        { stage: "鬼子放出风来，要往县里押人，日子没说定。", d: 4.6, cam: { kind: "shot", x: 170, y: 2.2, dist: 16 } },
      ],
    },
  ],

  c4: [
    {
      kind: "cinematic", id: "c4_open",
      lines: [
        { stage: "沙河庄的地道，是乡亲们一锹一锹挖出来的。", d: 3.6, cam: { kind: "wide", x: 90, y: -1.2 },
          on: (state) => { SpawnTunnelVillagers(state); } },
        // 说"藏得住人"，洞里就得有人：把乡亲摆在这一镜的画框里
        { stage: "它不通向据点。它通向的是：藏得住人，转移得走，活得下去。", d: 4.4, cam: { kind: "wide", x: 90, y: -1.2, pan: -6 },
          on: (state) => {
            const spread = [58, 61, 84, 87, 112];
            state.actors.filter((a) => a.kind === "villager").forEach((a, i) => {
              a.x = spread[i % spread.length];
              a.heading = i % 2 ? -1 : 1;
            });
          } },
        { who: "高传宝", say: "想救人，先学会怎么把人藏好。", d: 3.4, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.6 } },
      ],
    },
    {
      kind: "lead", id: "c4_hideA", group: "elders", dest: TV.chamberA,
      objective: "把两位老人带到藏人洞·甲", hint: "走到老人身边招呼一声，他们会跟着你",
    },
    {
      kind: "lead", id: "c4_hideB", group: "family", dest: TV.chamberB,
      objective: "把大嫂和孩子带到藏人洞·乙", hint: "孩子走得慢，别落下他们",
    },
    {
      // C1 的链搬进地道：猫腰＋扛大件双重降速，第一次体会地道里搬东西的分量
      kind: "chain", id: "c4_shore",
      objective: "西口的顶木松了", hint: "光用手是按不住的——藏人洞乙备着撑木",
      steps: [
        { type: "pickup", x: 61, level: "under", item: { id: "prop", label: "撑木", big: true }, prompt: "E · 扛起撑木" },
        { type: "use", zone: TV.entW, needs: "prop", hold: 2.2, stroke: "up", gestureY: 1.7, prompt: "按住 E · 顶上撑木",
          note: "木头咬住了。他松开手，顶木没有再响。" },
      ],
    },
    {
      kind: "hold", id: "c4_listen", zone: TV.entE, holdTime: 4, sustain: true, holdPrompt: "按住 E · 听",
      objective: "贴在东口下面，听听上面的动静", hint: "贴住不动，柱子会把听到的记在心里",
      note: "探杆一下一下地戳。脚步散开，又聚拢。",
    },
    {
      kind: "cinematic", id: "c4_smokeStart",
      lines: [
        { stage: "头顶传来闷响。泥土簌簌往下掉。", d: 3.2, cam: { kind: "shot", x: 148, y: UNDER_Y + 1.4, dist: 8 },
          on: (state) => { SpawnSurfaceSearch(state, 148); } },
        { stage: "有人用本地口音在上面喊：地道口就在磨盘这一片，扒！", d: 3.8, cam: { kind: "shot", x: 148, y: 1.0, dist: 10 } },
        { who: "民兵", say: "鬼子发现东口了！", d: 2.6, cam: { kind: "shot", x: 146, y: UNDER_Y + 1.4, dist: 8 } },
        // 剖面招牌构图：地表在翻找，地下在屏息，同框
        { stage: "一股呛人的烟，顺着东口灌了进来。", d: 3.4, cam: { kind: "shot", x: 142, y: -1.2, dist: 12 } },
      ],
      onDone: (state) => { StartSmoke(state); },
    },
    {
      // 大纲原文：「村民立刻熄灭油灯」——地道里最要紧的一件事，也是标题本身
      kind: "douseLamps", id: "c4_douse",
      smokeFloor: 133,   // 熄灯期间烟被顶木和弯道拖着，最多压到东数第二盏灯外
      lamps: [148, 132, 116, 96, 74],
      objective: "把地道里的灯一盏盏吹灭",
      hint: "一盏一盏吹灭。留最后一盏在自己手里",
      note: "最后一盏灯攥在柱子手里。地道一下子只剩这一点光。",
    },
    {
      // 第一次限时物品链：烟一直在推进。历史正解——冀中地道用湿被褥堵烟。
      // 干被子堵不住，这一步「浸湿」就是链上多出来的那个心眼
      kind: "chain", id: "c4_quilt",
      smokeFloor: 127.5,   // 卡口窄，烟在这儿灌得慢——玩家要堵的位置不能先被吞掉
      objective: "烟还在往里灌——把它堵在东段卡口外", hint: "藏人洞里备着棉被和水瓮。干被子堵不住烟",
      steps: [
        { type: "pickup", x: 110, level: "under", item: { id: "quilt", label: "棉被", big: true }, prompt: "E · 抱起棉被" },
        { type: "use", zone: { x: 116, w: 3, level: "under" }, needs: "quilt", hold: 1.2, stroke: "down", prompt: "按住 E · 浸湿棉被",
          transform: { id: "wetQuilt", label: "湿棉被", big: true },
          note: "棉被吃透了水，沉得坠手。" },
        { type: "use", zone: TV.plugSpot, needs: "wetQuilt", hold: 1.6, stroke: "down", prompt: "按住 E · 堵住卡口",
          note: "烟撞在湿棉被上，打着旋儿退了回去。呛人的味道淡下来了。",
          effect: (state) => { state.flags.quiltPlugged = true; if (state.smoke) state.smoke.speed = 0.05; } },
      ],
    },
    {
      kind: "smokeEscape", id: "c4_smoke", dest: TV.entW, lossScript: true,
      objective: "赶在烟前头，把人从西口转移出去",
      hint: "烟往西灌，先带东边的人。招呼一群人跟上，到西口他们会自己爬出去",
      resetHint: "烟呛倒了人。民兵把大家拖回洞室，重新来。",
      onEnter: (state) => {
        // 鬼子加了风箱：被子挡得住一时，挡不住一夜
        if (state.smoke) state.smoke.speed = 0.42;
        state.toast = { text: "上面拉来了风箱。烟从被子边上一丝丝挤进来——得走了。", t: 4.5 };
      },
    },
    {
      kind: "cinematic", id: "c4_floodStart",
      lines: [
        { stage: "第二天，鬼子又拉来了水泵。", d: 3.2, cam: { kind: "shot", x: 144, y: 0.6, dist: 11 },
          on: (state) => { SpawnSurfaceSearch(state, 146); } },
        { stage: "浑浊的泥水顺着东口灌下来，先淹的是最低的那一段。", d: 4.2, cam: { kind: "wide", x: 120, y: -1.2, hw: 20, pan: -8 },
          on: (state) => { StartFlood(state); } },
      ],
    },
    {
      kind: "floodRescue", id: "c4_flood", dest: TV.entW,
      objective: "水在涨——把还困在里面的人捞出西口",
      hint: "水从东边漫过来，低处先没。招呼人跟上",
      resetHint: "水太深了，人被冲散。民兵把大家托回高处，再来一次。",
    },
    {
      kind: "cinematic", id: "c4_loss",
      lines: [
        { stage: "西口外，乡亲们趴在田里咳嗽。人数了两遍。", d: 3.8, cam: { kind: "shot", x: 30, y: 0.8, dist: 12 } },
        { stage: "顺子没出来。拴柱大爷也没有。", d: 4.2, cam: { kind: "shot", x: 34, y: 0.6, dist: 8 } },
        { stage: "柱子站在出口，看着被抬出来的乡亲，一句话也说不出。", d: 4.2, cam: { kind: "shot", x: 34, y: 0.6, dist: 9 } },
        { who: "高传宝", say: "准备下一次行动。", d: 3.0, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
        { stage: "柱子背起工具，跟着队伍再次下了地道。", d: 3.6, cam: { kind: "wide", x: 90, y: -1.2 } },
      ],
    },
  ],

  c5: [
    {
      kind: "cinematic", id: "c5_open",
      lines: [
        { stage: "东口封死了。第二天起，全村轮班下洞。", d: 3.6, cam: { kind: "wide", x: 90, y: -1.2 } },
        { stage: "高传宝在门板上画了三个记号：翻口，新暗口，预警铃。", d: 4.0, cam: { kind: "shot", x: 40, y: UNDER_Y + 1.4, dist: 8 } },
        { stage: "柱子的墨斗和刨子，成了地道里的家伙什。", d: 3.6, cam: { kind: "shot", x: 40, y: UNDER_Y + 1.4, dist: 6.5 } },
        // 双层潜行的题面：改造缺的东西全在地表，地表有人。
        // 剖面视角的独门好处在这一章兑现——从地下看地上，一清二楚
        { stage: "白天，两个伪军就在村里翻翻捡捡地转。头顶的脚步，地道里听得一清二楚。", d: 4.4, cam: { kind: "wide", x: 90, y: -1.2, pan: 5 },
          on: (state) => { SpawnC5Snoops(state); } },
        { who: "高传宝", say: "缺什么，上去拿。什么时候上去，你们自己看。", d: 3.8, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.6 } },
      ],
    },
    {
      // 翻口是真实冀中地道的三防正解：把这一段挖成 U 形的弯，弯里存住水，
      // 就是一道水封，烟和水都过不去。人猫着腰从水里钻过去。
      kind: "chain", id: "c5_trap",
      objective: "改造一：挖翻口，灌上水", hint: "挖成下沉的弯，弯里存住水。水在地表的井里",
      resetHint: "上面的伪军看见了人影。柱子缩回洞里，等他转过身去。",
      steps: [
        // 挖翻口的位置，就是大爷和顺子没出来的位置。先把烟袋拾起来，再动土——
        // 两章之间的账，用一个弯腰接上，不用字幕
        { type: "use", zone: TV.trapSpot, prompt: "E · 拾起烟袋",
          note: "拴柱大爷的烟袋躺在土里，锅底烧穿了一个洞。柱子把它揣进怀里，抄起了锹。" },
        { type: "use", zone: TV.trapSpot, hold: 3, stroke: "down", prompt: "按住 E · 挖翻口",
          note: "弯挖出来了。可干弯挡不住烟——得灌上水。" },
        { type: "pickup", x: 30, level: "under", item: { id: "bucket2", label: "空桶" }, prompt: "E · 拎起空桶" },
        { type: "winch", zone: TV.wellTop, needs: "bucket2", needsLabel: "空桶",
          transform: { id: "fullBucket2", label: "满桶水", big: true },
          note: "桶沉了。上面还有人在转——挑好下去的时候。" },
        { type: "use", zone: TV.trapSpot, needs: "fullBucket2", hold: 1, stroke: "down", prompt: "按住 E · 灌水",
          note: "水面在弯底晃了晃，定住了。翻口成了。",
          effect: (state) => { state.flags.trapBuilt = true; } },
      ],
    },
    {
      // 门板＋狗：C2 的回call。这条道要真的「暗」，先得让狗闭嘴
      kind: "chain", id: "c5_hidden",
      objective: "改造二：新暗口", hint: "新口开在西头第三家的猪圈底下。口上得盖块门板",
      resetHint: "差点撞上翻查的伪军。退回地道，重新等空当。",
      steps: [
        { type: "use", zone: TV.hiddenSpot, hold: 3, stroke: "down", prompt: "按住 E · 掏暗口",
          note: "口子掏通了，就差个盖。挖出来的土，天不亮就得摊进麦地。" },
        { type: "pickup", x: 62, level: "under", item: { id: "bun2", label: "窝头" }, prompt: "E · 拿个窝头" },
        { type: "use", zone: TV.dogPen, needs: "bun2", prompt: "E · 丢给狗",
          note: "猪圈的狗埋头去啃。它不叫，这条道才算真的暗。",
          effect: (state) => { state.flags.dogFed2 = true; } },
        { type: "pickup", x: 26, item: { id: "plank", label: "门板", big: true }, prompt: "E · 卸下门板" },
        { type: "use", zone: TV.hiddenSpot, needs: "plank", hold: 1.2, stroke: "down", prompt: "按住 E · 盖上门板",
          note: "口子盖严了。上头是猪食槽，谁也不会去翻。",
          effect: (state) => { state.flags.hiddenBuilt = true; } },
      ],
    },
    {
      kind: "chain", id: "c5_bell",
      objective: "改造三：预警铃", hint: "铃铛挂在磨盘边的骡套上，麻绳在藏人洞乙",
      resetHint: "东头的伪军回过头来。柱子缩回了洞里。",
      steps: [
        { type: "pickup", x: 56, level: "under", item: { id: "rope2", label: "麻绳" }, prompt: "E · 取下麻绳" },
        { type: "use", zone: TV.bellSpot, needs: "rope2", hold: 1, stroke: "circle", gestureY: 1.6, prompt: "按住 E · 拴上梁",
          note: "绳头从东口的顶木上垂下来，就差铃了。" },
        { type: "pickup", x: 148, item: { id: "bell", label: "铃铛" }, prompt: "E · 摘下铃铛" },
        { type: "use", zone: TV.bellSpot, needs: "bell", hold: 1, stroke: "circle", gestureY: 1.6, prompt: "按住 E · 拴好铃",
          note: "指头一拨，铃舌轻轻一响。东口一动，全村先知道。",
          effect: (state) => { state.flags.bellBuilt = true; } },
      ],
    },
    {
      kind: "cinematic", id: "c5_alarm",
      lines: [
        { stage: "没过几天，鬼子又来了。还是老一套：堵口，灌烟。", d: 3.8, cam: { kind: "shot", x: 144, y: -0.6, dist: 13 },
          on: (state) => { SpawnSurfaceSearch(state, 146); } },
      ],
      onDone: (state) => { StartDrillSmoke(state); },
    },
    {
      kind: "smokeEscape", id: "c5_drill", dest: TV.behindTrap,
      objective: "铃响了——赶在烟到翻口之前，把人带到弯后面",
      hint: "把人带到翻口后面去。别走西口，鬼子早就盯上它了",
      resetHint: "烟追上了人。再来——这一回，地道听你们的。",
    },
    {
      kind: "cinematic", id: "c5_test",
      lines: [
        { stage: "烟堵在弯里，一夜没退。地面上，什么也看不出来。", d: 4.0, cam: { kind: "shot", x: 112, y: 0.4, dist: 11 } },
        { stage: "鬼子在村里翻到天黑，一个人也没找到。", d: 3.8, cam: { kind: "wide", x: 90 } },
        { stage: "撤下来的时候，一个年轻民兵被塌下的土石压住了腿。", d: 4.2, cam: { kind: "shot", x: 70, y: UNDER_Y + 1.4, dist: 7 },
          on: (state) => {
            // 这场戏原来一个人都没有——柱子和民兵全靠字幕存在。说到谁，谁就得在画面里
            if (!FindActor(state, "pinned")) {
              state.actors.push(MakeActor("pinned", "militia", 70, {
                level: "under", heading: -1, label: "年轻民兵",
              }));
            }
            state.player.level = "under";
            state.player.x = 72.4;
            state.player.heading = -1;
          } },
        { stage: "鬼子的探杆就在头顶上戳。谁也不敢出声。", d: 3.8, cam: { kind: "shot", x: 70, y: -1.0, dist: 9 } },
      ],
    },
    {
      // 大纲写的是"柱子第一次看见，这条通往妹妹的路，也有人在用命守着"。
      // 那句话不能由旁白说——得让玩家自己去刨那堆土，刨到时间用完为止。
      // 清不完不是手慢：探杆一次比一次密，你每次都得停手。
      kind: "doomedHold", id: "c5_pinned", duration: 11, cap: 0.8,
      probe: { from: 5.2, to: 2.6 },
      failToast: "土太深了。他的腿还在下面。",
      onStart: (state) => {
        state.player.level = "under";
        state.player.x = 72.2;
        state.player.heading = -1;
        const pinned = FindActor(state, "pinned");
        if (pinned) { pinned.x = 70.4; pinned.heading = 1; }
      },
      objective: "把压住他腿的土清开",
      hint: "一下一下清土。探杆到头顶上的时候必须停手",
      prompt: "按住 E · 清土",
      onFail: (state) => {
        const pinned = FindActor(state, "pinned");
        if (pinned) pinned.heading = 1;
      },
    },
    {
      kind: "cinematic", id: "c5_gun",
      lines: [
        { stage: "那只手从土里伸出来，把柱子推开了。", d: 3.6, cam: { kind: "insert", x: 70.6, y: UNDER_Y + 0.9, dist: 2.4 } },
        { stage: "他把手里的枪递出去，朝洞外摆了摆手。", d: 4.2, cam: { kind: "shot", x: 70, y: UNDER_Y + 1.3, dist: 5.5 } },
        { who: "年轻民兵", say: "带乡亲们走。", d: 3.0, cam: { kind: "ots", subject: "pinned", other: "player", dist: 3.4 } },
        // 柱子的反应镜头：这场戏此前完全没有他，看完像是别人的事
        { stage: "", d: 2.6, cam: { kind: "ots", subject: "player", other: "pinned", dist: 3.2 } },
        { d: 2.4, cam: { kind: "dark" } },
      ],
    },
  ],

  c6: [
    {
      kind: "cinematic", id: "c6_open",
      lines: [
        { stage: "押送定在后天。据点里外都加了岗。", d: 3.4, cam: { kind: "wide", x: 170 } },
        { stage: "高传宝的法子是两头一起动：地面上打出动静把人引开，地下从地道把乡亲接走。", d: 4.8, cam: { kind: "wide", x: 90, pan: -6 } },
        { stage: "高传宝把柱子叫住，让他先去看清楚。", d: 3.2, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
      ],
      onDone: (state) => { SpawnFortPatrols(state, true); },
    },
    {
      kind: "observe", id: "c6_scout", spots: [F.obsWest, F.obsEast], watchTime: 4,
      objective: "记下加岗后的巡逻路数（两处观察点）",
      hint: "换岗的空当很短，看准了再记",
      resetHint: "差一点被发现。柱子把心跳按下去，重新贴回土里。",
      notes: [
        "南门加了双岗，但换岗还是背对庄稼地。",
        "牢房外多了一个游动哨。门里那辆骡车还拴在原处，车辕上一直空着。",
      ],
      watchCine: [
        [{ stage: "南门加了双岗。换岗的时候，背还是朝着庄稼地。", d: 3.8, cam: { kind: "insert", x: 172, y: 2.2, dist: 5.5 } }],
        [{ stage: "牢房外多了一个游动哨，绕到北墙要一袋烟的工夫。", d: 3.8, cam: { kind: "insert", x: 192, y: 1.6, dist: 6 } },
         // 押送的日子一推再推，车却始终没套——第六章的推理就架在这两条上
         { stage: "那辆骡车还拴在原处。车辕上一直空着。", d: 3.8, cam: { kind: "insert", x: 190, y: 1.0, dist: 3.2 } }],
      ],
    },
    {
      // 原来这里是个走过去就过的 goto。可"这是个套"这个结论，此前是旁白直接
      // 说给玩家听的——玩家自己一次都没推出来过。材料其实早就在手里：第三章
      // 观察和问乡亲收集的 note 都存在 flags.notesSeen 里，只是弹了个 toast 就没了。
      // 现在把它们一条条钉上门板，让两条对不上的线自己现形。
      // 漏看观察点的玩家凑不齐这两条，也就推不出来——侦查这才有代价。
      kind: "mapBoard", id: "c6_report", zone: F.campTable,
      objective: "回歇脚点，把看到的钉在门板上",
      hint: "柱子用木匠画线的手，把据点画在了门板上。一条条钉上去",
      // 这两条互相矛盾：日子一天天往后推，车却从来没套过
      contradiction: ["骡车", "押人"],
      deduction: "要往县里押人的话传了一遍又一遍，可拴在门里的那辆骡车，一直没套。",
    },
    {
      // 推出来与没推出来，是两场不同的戏。玩家漏了观察点就凑不齐那两条，
      // 只能听高传宝把答案说出来——那一刻的失落，正是"侦查有代价"该有的样子。
      kind: "cinematic", id: "c6_brief", dynamicLines: (state) => (
        state.flags.deduced
          ? [
            { who: "高传宝", say: "你说说看。", d: 2.6, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
            { stage: "柱子指了指门板上钉在一起的那两条。", d: 3.4, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
            { stage: "屋里安静了一会儿。", d: 2.8, cam: { kind: "shot", x: 8, y: 1.2, dist: 6.5 } },
            { who: "高传宝", say: "套是套。人，也是真的人。", d: 3.4, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
          ]
          : [
            { who: "高传宝", say: "你说说看。", d: 2.6, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
            { stage: "柱子说不上来。", d: 2.6, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
            { stage: "高传宝在门板上把日子和那辆骡车圈到了一起。", d: 4.0, cam: { kind: "insert", x: 8, y: 1.3, dist: 2.6 } },
            { who: "高传宝", say: "他们要的不是这十几个乡亲。是来救乡亲的人。", d: 4.2, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
            { who: "高传宝", say: "套是套。人，也是真的人。", d: 3.4, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
          ]
      ),
    },
    {
      // 历史梗：一挂鞭炮在铁桶里炸，一里外听着就是机枪。
      // 单格物品栏的教学在这儿反着用一次——两样东西，得跑两趟
      kind: "chain", id: "c6_prep",
      objective: "给佯动组备家伙：铁桶里的鞭炮", hint: "鞭炮和铁桶都在歇脚点，村北土坎上会合",
      steps: [
        { type: "pickup", x: 16, item: { id: "firecracker", label: "一挂鞭炮" }, prompt: "E · 拿上鞭炮" },
        { type: "use", zone: F.northBank, needs: "firecracker", prompt: "E · 搁下鞭炮" },
        { type: "pickup", x: 26, item: { id: "tin", label: "铁皮桶", big: true }, prompt: "E · 扛起铁桶" },
        { type: "use", zone: F.northBank, needs: "tin", prompt: "E · 架好桶" },
        { type: "use", zone: F.northBank, hold: 2, stroke: "circle", gestureY: 0.8, prompt: "按住 E · 装引信",
          note: "鞭炮盘进桶底，引信探出来。夜里一点，就是一挺『机枪』。" },
      ],
    },
    {
      // 大纲写的是"地面制造声势 + 地下进人"同时发生，不是二选一。
      // 所以选的不是打法，是柱子站在哪一边。
      kind: "choice", id: "c6_plan",
      prompt: "两路都得有人。高传宝看着柱子：你跟哪一路？",
      options: [
        { key: "ground", label: "跟地面佯动组", detail: "在村北打枪、点火、把巡逻往外扯——动静大，撤下来的路全在明处。" },
        { key: "tunnel", label: "跟地下接应组", detail: "在地道里掏最后一段、接人、往回带——慢，土层不稳，但乡亲们能从地下走。" },
      ],
      objective: "定下自己跟哪一路",
    },
    {
      kind: "cinematic", id: "c6_eve",
      lines: [
        { stage: "行动前夜。油灯把门板图照得发黄。", d: 3.6, cam: { kind: "shot", x: 7, y: 1.2, dist: 6.5 } },
        { stage: "柱子站在图前，指着据点的方向。", d: 3.2, cam: { kind: "shot", x: 8, y: 1.2, dist: 5.5 } },
        { who: "柱子", say: "我去。", d: 2.4, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
        { stage: "高传宝看了他一眼。没有劝。", d: 3.0, cam: { kind: "shot", x: 6.5, y: 1.2, dist: 4.8 } },
        { who: "高传宝", say: "跟紧队伍。", d: 2.6, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
      ],
    },
  ],

  c7: [
    {
      kind: "cinematic", id: "c7_open", dynamicLines: (state) => (
        state.flags.route === "ground"
          ? [
            { stage: "二更天，村北先响了枪。柱子在那头。", d: 3.4, cam: { kind: "dark" } },
            { stage: "据点岗楼上的灯全甩向北面。巡逻队跑步出了南门。", d: 3.8, cam: { kind: "wide", x: 150, y: 1.5 } },
            { stage: "枪声把人引出去多远，地底下就多出多少工夫。", d: 3.8, cam: { kind: "wide", x: 150, y: 1.5, pan: -4 } },
            { stage: "打完那一阵，他才从北边退回来下的地道。接应组已经走在前头了。", d: 4.6, cam: { kind: "wide", x: 60, y: -1.4, hw: 18, pan: -5 },
              on: (state) => { SpawnRescueSquad(state); } },
          ]
          : [
            { stage: "区上武工队来了两个班。佯动组已经摸到村北去了——这边不动，人从地下走。", d: 4.4, cam: { kind: "dark" } },
            { stage: "二更天，地道里一盏灯也没点。", d: 3.2, cam: { kind: "dark" } },
            { stage: "队伍在黑暗里贴着墙根移动，谁也不说话。", d: 3.6, cam: { kind: "wide", x: 40, y: -1.4, hw: 18 },
              on: (state) => { SpawnRescueSquad(state); } },
            { stage: "这条道原本只到墙外的地里。最后那十几步，是这三天连夜掏出来的。", d: 4.6, cam: { kind: "wide", x: 90, y: -1.4, hw: 18, pan: 6 } },
            { stage: "柱子数着步子。掏到牢房地沿，还有两处虚土要清。", d: 4.0, cam: { kind: "wide", x: 120, y: -1.4, hw: 16 } },
          ]
      ),
      onDone: (state) => { SetupFortTunnel(state); },
    },
    {
      kind: "digSeq", id: "c7_dig", spots: [TF.collapse1, TF.collapse2], holdTime: 3.5,
      shore: { collapse1: { beamX: 44 }, collapse2: { beamX: 92 } },
      objective: "支起顶木，掏开虚土，把最后十几步挖通", hint: "顶木在旁洞里。头顶有动静时停一停",
      quakeInterval: 9,
    },
    {
      kind: "goto", id: "c7_reach", zone: TF.cellHatch, objective: "摸到牢房地沿",
    },
    {
      // 木匠的手艺最后一次替爹用上：地沿的木板是从上面钉死的
      kind: "hold", id: "c7_pry", zone: TF.cellHatch, holdTime: 3, stroke: "up", gestureY: 1.9, holdPrompt: "按住 E · 撬",
      objective: "地沿的木板从上面钉死了", hint: "爹的凿子，他一直带在身上",
      note: "凿刃咬进钉缝，一下，一下。木板松了。",
    },
    {
      kind: "cinematic", id: "c7_sister",
      lines: [
        { stage: "地沿的木板被顶开一条缝。霉味和哭声一起漏下来。", d: 4.0, cam: { kind: "shot", x: 162, y: UNDER_Y + 1.8, dist: 7 } },
        { stage: "民兵一个个往下接人。柱子在人堆里看见了妹妹。", d: 4.0, cam: { kind: "shot", x: 160, y: UNDER_Y + 1.4, dist: 8 },
          on: (state) => {
            for (let i = 0; i < 3; i += 1) {
              state.actors.push(MakeActor(`freed${i}`, "villager", 160 - i * 1.2, {
                level: "under", scripted: true, cineTarget: { x: 14 }, cineSpeed: 1.7 + i * 0.25, cineVanish: true,
              }));
            }
          } },
        { stage: "妹妹瘦得脱了相。她抓住柱子的袖子。", d: 3.6, cam: { kind: "insert", x: 161, y: UNDER_Y + 1.0, dist: 2.2 },
          on: (state) => { AttachSister(state); } },
        // 正反打：问 → 不答 → 明白
        { who: "妹妹", say: "哥，娘呢？", d: 3.0, cam: { kind: "ots", subject: "sister", other: "player", dist: 3.2 } },
        { stage: "柱子没有说话。", d: 3.0, cam: { kind: "ots", subject: "player", other: "sister", dist: 3.2 } },
        { stage: "妹妹看着哥哥的眼睛，慢慢松开了手，又慢慢把额头抵在他肩上。", d: 5.0, cam: { kind: "ots", subject: "sister", other: "player", dist: 3.0 },
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.pose = "leanIn"; sister.x = state.player.x + 0.42; sister.heading = -1; }
            state.player.pose = "shelter";
          } },
        { stage: "她明白了。", d: 2.8, cam: { kind: "close", on: "sister", dist: 3.4 } },
      ],
      onDone: (state) => { AttachSister(state); },
    },
    {
      kind: "escort", id: "c7_out", follower: "sister", dest: TF.fieldEnt,
      objective: "带妹妹沿地道撤到地里入口", hint: "路已经打通了，往西走",
    },
    {
      kind: "cinematic", id: "c7_turn",
      lines: [
        { stage: "入口上面就是庄稼地，就是活路。", d: 3.2, cam: { kind: "shot", x: 14, y: -0.6, dist: 8 },
          on: (state) => {
            // 交灯这场戏的人得在画面里：高传宝、报信民兵、接妹妹的大娘
            state.actors.push(
              MakeActor("gao", "militia", 17, { level: "under", label: "高传宝", heading: -1 }),
              MakeActor("aunt2", "villager", 11, { level: "under", label: "大娘", heading: 1 }),
              MakeActor("msg", "militia", 30, {
                level: "under", cineTarget: { x: 20 }, cineSpeed: 3.4, heading: -1,
              }),
            );
          } },
        { stage: "一个民兵跌跌撞撞从地道里追出来。", d: 3.2, cam: { kind: "shot", x: 22, y: UNDER_Y + 1.4, dist: 8 } },
        { who: "民兵", say: "还有人没出来！东边旁洞里，还有几个乡亲！", d: 4.0, cam: { kind: "ots", subject: "msg", other: "player", dist: 3.6 } },
        { stage: "头顶上，搜查的脚步声越来越密。", d: 3.4, cam: { kind: "shot", x: 16, y: -0.4, dist: 9 } },
      ],
    },
    {
      // 全篇的顶点，原来是十行过场：松手、接灯、转身，都由脚本替他做了。
      // 那两句"妹妹就在眼前……可旁洞里那几个人也在等"更是把两难替玩家想完了。
      // 现在两句删掉，操作交还回去——出口就在头顶、完全通着、没有任何东西拦你，
      // 妹妹还牵在手里。要回去，得他自己先松开手。
      kind: "actSeq", id: "c7_turn2",
      objective: "该走了",
      hint: "妹妹还牵着你的手。上面就是庄稼地",
      steps: [
        {
          x: 12.6, level: "under", prompt: "E · 松开手",
          toast: "柱子把妹妹的手放进大娘手里。",
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.following = false; sister.cineTarget = { x: 11.4 }; sister.cineSpeed = 1.2; }
            const gao = FindActor(state, "gao");
            if (gao) { gao.cineTarget = { x: 15.4 }; gao.cineSpeed = 1.0; }
          },
        },
        {
          x: 15.4, level: "under", prompt: "E · 接过灯",
          on: (state) => { state.player.lamp = true; },
        },
        { x: 22, level: "under", walk: true },
      ],
      onDone: (state) => { StartRescueLoop(state); },
    },
    {
      kind: "rescueLoop", id: "c7_rescue",
      objective: "把旁洞里的乡亲全部带出去（3 处）",
      hint: "灯照多远，路就有多远。招呼乡亲跟上，送到地里入口再回去",
      resetHint: "土又塌了一截。民兵把人拉了回来，重新探路。",
    },
    {
      kind: "cinematic", id: "c7_done",
      lines: [
        { stage: "最后一个乡亲被推出洞口的时候，东边天已经泛白。", d: 4.2, cam: { kind: "shot", x: 14, y: 0.5, dist: 10 },
          on: (state) => {
            // 上到地表收尾：这几个镜头拍的是田埂上的天亮
            state.player.level = "surface";
            state.player.x = 13;
            state.player.cineWalk = { x: 16, speed: 0.9 };
            for (let i = 0; i < 4; i += 1) {
              state.actors.push(MakeActor(`dawn${i}`, "villager", 8 + i * 2.4, { heading: 1 }));
            }
            state.player.lamp = true;
          } },
        { stage: "人数了三遍。一个不少。", d: 3.4, cam: { kind: "shot", x: 12, y: 1.0, dist: 8 } },
        { stage: "柱子坐在田埂上，灯芯已经烧到了头。", d: 3.8, cam: { kind: "insert", x: 16.4, y: 1.0, dist: 2.2 } },
        { stage: "他把灯吹灭了。", d: 2.6, cam: { kind: "close", on: "player", dist: 3.4 },
          on: (state) => { state.player.lamp = false; } },
        { stage: "天亮了。", d: 4.6, cam: { kind: "wide", x: 40, y: 2.6, pan: 8 },
          on: (state) => { state.lightOverride = "dawn"; } },
      ],
    },
  ],

  c8: [
    {
      kind: "cinematic", id: "c8_open",
      lines: [
        { stage: "一个月后。", d: 2.6, cam: { kind: "dark" } },
        { stage: "沙河庄的地道重新修整。被发现的口子封死了，新口挖在另一片庄稼地旁。", d: 4.6, cam: { kind: "wide", x: 90 } },
        { stage: "乡亲们把废弃的旧口填平。那块地方，正是当年柱子第一次找到妹妹的地方。", d: 4.8, cam: { kind: "wide", x: 130, pan: 5 } },
        { stage: "柱子带着妹妹，回了一趟梁家村。", d: 3.4, cam: { kind: "wide", x: 100, pan: -8 } },
      ],
      onDone: (state) => { SetupRuinedVillage(state); },
    },
    {
      kind: "escort", id: "c8_walk", follower: "sister", dest: V.homeYard, slow: true,
      objective: "和妹妹一起，走回家看看",
    },
    {
      kind: "cinematic", id: "c8_wall",
      lines: [
        { stage: "院子烧毁了。只剩一堵残墙。", d: 3.6, cam: { kind: "shot", x: 37, y: 1.6, dist: 11 } },
        { stage: "门框还在。", d: 3.0, cam: { kind: "shot", x: 34, y: 1.5, dist: 6.5 } },
        { stage: "妹妹走过去，伸手摸了一下爹刻的那道线。", d: 4.0, cam: { kind: "shot", x: 34, y: 1.5, dist: 6.5 },
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.following = false; sister.cineTarget = { x: 33.2 }; sister.cineSpeed = 1.1; }
          } },
        { stage: "她的手停了一会儿。", d: 3.2, cam: { kind: "shot", x: 34, y: 1.5, dist: 6.5 } },
      ],
    },
    {
      // 第一章他被爹按在门框上量；这一回轮到他量妹妹。
      // 两道线差多少，画面自己会说——不要旁白替观众念出来。
      kind: "actSeq", id: "c8_measure",
      objective: "门框还在", hint: "妹妹站在门框边上",
      steps: [
        { x: V.doorframe.x, r: 1.6, prompt: "E · 让她靠上",
          toast: "妹妹后背贴上门框，站直了。",
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.x = V.doorframe.x - 0.5; sister.heading = 1; sister.cineTarget = null; }
            state.player.heading = -1;
          } },
      ],
    },
    {
      // 第一章是爹的手，这一回是他自己的手——同一个动作，同一个景别。
      // 两道线之间隔着的东西，画面自己会说。
      kind: "scribe", id: "c8_carve", zone: V.doorframe, speed: 0.42, markY: 1.08, selfMark: true,
      markX0: 33.60, markX1: 33.75,
      cam: { kind: "shot", x: 34.0, y: 1.16, dist: 1.9 },
      objective: "在旧刻痕旁，刻下一道新的线", hint: "攥住石笔，贴着木头拉过去",
      note: "刻完，柱子用拇指抹平了木屑。",
      onDone: (state) => { state.flags.carved = true; },
    },
    {
      kind: "actSeq", id: "c8_stool",
      objective: "爹留下的旧木凳", hint: "凳腿松了",
      steps: [
        { x: 32, r: 1.8, prompt: "E · 敲紧凳腿",
          toast: "手艺是爹的，手是他自己的。" },
      ],
    },
    {
      kind: "cinematic", id: "c8_call",
      lines: [
        { stage: "院外传来民兵喊他的声音。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.6, dist: 10 } },
        { who: "民兵", say: "柱子，地道那边还缺人。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.6, dist: 10 } },
        { stage: "柱子放下工具，回头看了一眼妹妹。", d: 3.6, cam: { kind: "shot", x: 34, y: 1.4, dist: 7 } },
        { stage: "妹妹抱着爹留下的旧木凳，点了点头。", d: 3.8, cam: { kind: "shot", x: 32, y: 1.2, dist: 5 } },
      ],
    },
    {
      kind: "goto", id: "c8_leave", zone: V.courtGate, objective: "走到院门口去，民兵在村东头等",
    },
    {
      kind: "cinematic", id: "c8_end",
      lines: [
        { stage: "柱子走出院子。", d: 3.0, cam: { kind: "shot", x: 44, y: 1.6, dist: 9 },
          on: (state) => {
            // 柱子朝村东走远——镜头留在门框上
            state.player.cineWalk = { x: 70, speed: 1.6 };
          } },
        { stage: "门框上的两道刻痕，留在了身后。", d: 6.2, cam: { kind: "shot", x: 34, y: 1.4, dist: 6.5, pan: -0.5 } },
      ],
    },
  ],
};

// 序章过场短片的片单，顺序就是播放顺序——渲染层拿它做"下一段提前拉"。
// 从脚本里读而不是另抄一份：改了哪一行的 clip，这里自动跟着变。
export const PROLOGUE_CLIPS = SCRIPTS.c1
  .find((b) => b.id === "c1_prologue")
  .lines.map((l) => l.cam?.clip)
  .filter(Boolean);

// ---------------------------------------------------------------------------
// 角色与事件生成
// ---------------------------------------------------------------------------
function MakeActor(id, kind, x, extra = {}) {
  return { id, kind, x, level: "surface", heading: 1, visible: true, ...extra };
}

// 白天进村的不是两个兵，是一支队伍（用户拿景区实拍立的规矩）：
// 伪军骑自行车在前头探路，挎斗摩托压在中间，后面一列扛枪的徒步兵。
// 参与潜行判定的仍只有 raid1/raid2——十几个人一起判视线这段就没法玩了，
// 其余全部 decor：他们负责让「鬼子进村」这四个字在画面上是真的。
const RAID_COLUMN = 6;
function SpawnRaidSoldiers(state) {
  state.actors = state.actors.filter((a) => !IsEnemy(a));
  state.actors.push(
    MakeActor("raid1", "soldier", 120, { patrol: [58, 120], speed: 1.5 }),
    MakeActor("raid2", "soldier", 88, { patrol: [50, 90], speed: 1.35 }),
    // 据点的翻译官：带路的、递名单的。decor——他不参与潜行判定（两个兵
    // 已经把考场撑满了），但他得在场：第二章挑灯笼带路的、审问时递话的，
    // 都是这一个人。汉奸不是符号，是个有脸的邻人，才可恨
    MakeActor("traitor", "puppet", 168, { label: "翻译官", decor: true }),
    // 骑车的伪军：车是他自己的，腿上的活也是他自己的（蹬踏跟着位移走）。
    // carry:"" 压掉兵默认的手持步枪——骑车的手在车把上，枪是背着的
    // lift = 座高 − 站立胯高(≈0.60m)。给多了人就浮在车上面，给少了像蹲在车边
    MakeActor("bikeScout", "puppet", 166, { label: "骑车的伪军", decor: true, mount: "bicycle", pose: "rideBike", lift: 0.17, heading: -1, carry: "" }),
    // 挎斗摩托：驾驶的兵 + 挎斗里的兵（钉在车侧，跟着车走）
    MakeActor("motoLead", "soldier", 170, { label: "摩托驾驶", decor: true, mount: "motorcycle", pose: "rideMoto", lift: 0.32, heading: -1, carry: "" }),
    MakeActor("motoSide", "soldier", 170.5, { label: "挎斗里的兵", decor: true, pose: "sitSide", lift: 0.22, heading: -1, carry: "", pinTo: { id: "motoLead", dx: 0.5 } }),
  );
  // 徒步纵队：紧跟在车后（车在村道上也就比步行快半拍），间距刻意不匀——
  // 队列走长路会散。整支队伍要能装进车队镜的一个画框里
  for (let i = 0; i < RAID_COLUMN; i += 1) {
    state.actors.push(MakeActor("c1col" + i, "soldier", 173.5 + i * 1.8 + (i % 2) * 0.5, {
      decor: true, heading: -1,
    }));
  }
  state.stealthActive = true;
}

// 1943 年春的一次夜间"清剿"，来的是据点一个小队加上伪军：进村就分头堵路、
// 挨家踹门，前后能拉开大半个村子。原先只放三个人，"鬼子又来了"这句话在画面上
// 就落不到实处——一条村道上站着一个人，那不叫扫荡。
//
// 但真参与潜行判定的仍然只有 sweep1/2/3（十几个人一起看着，这段没法玩）。
// 其余标 decor：他们组成队形、举着灯、在院门口翻找，只负责让这一夜看着像那一夜。
function SpawnNightSweep(state) {
  state.actors = state.actors.filter((a) => !IsEnemy(a));
  state.actors.push(
    // 带路的翻译官挑着灯笼在前，两个兵在后
    MakeActor("sweep1", "puppet", 74, { patrol: [70, 108], speed: 1.5, lantern: true, lanternKind: "lantern" }),
    MakeActor("sweep2", "soldier", 100, { patrol: [92, 138], speed: 1.4, lantern: true }),
    MakeActor("sweep3", "soldier", 150, { patrol: [144, 158], speed: 1.15, lantern: true }),
  );
  // 进村的纵队：从村东口一路排下来，走走停停。间距故意不匀——
  // 队列走进村子会散，散开的样子比整齐的样子更像真的
  const column = [
    { x: 180, kind: "soldier", speed: 1.05, lantern: true },
    { x: 174, kind: "soldier", speed: 1.15 },
    { x: 169, kind: "puppet", speed: 1.3 },
    { x: 162, kind: "soldier", speed: 1.1 },
    { x: 156, kind: "soldier", speed: 1.35, lantern: true },
    { x: 147, kind: "puppet", speed: 0.9 },
    { x: 140, kind: "soldier", speed: 1.2 },
    { x: 132, kind: "soldier", speed: 1.4, lantern: true },
    { x: 124, kind: "soldier", speed: 1.05 },
    { x: 116, kind: "puppet", speed: 1.25 },
    { x: 106, kind: "soldier", speed: 1.15 },
    { x: 96, kind: "soldier", speed: 0.95, lantern: true },
  ];
  column.forEach((c, i) => {
    state.actors.push(MakeActor(`col${i}`, c.kind, c.x, {
      patrol: [c.x - 6.5, c.x + 6.5], speed: c.speed, heading: -1, decor: true,
      lantern: !!c.lantern, lanternKind: c.kind === "puppet" ? "lantern" : "hurricane",
    }));
  });
  state.stealthActive = true;
  const mother = FindActor(state, "mother");
  if (mother) { mother.x = 40; mother.visible = true; }
}

function MotherDecoyDone(state) {
  const mother = FindActor(state, "mother");
  if (mother) mother.visible = false;
  // 巡逻被引向村西：先走过去（cineTarget 落在新巡逻带内），到位后再交回 patrol，避免瞬移
  const s1 = FindActor(state, "sweep1");
  if (s1) { s1.patrol = [24, 62]; s1.cineTarget = { x: 60 }; s1.cineSpeed = 2.4; }
  const s2 = FindActor(state, "sweep2");
  if (s2) { s2.patrol = [56, 88]; s2.speed = 1.3; s2.cineTarget = { x: 86 }; s2.cineSpeed = 2.2; }
  const s3 = FindActor(state, "sweep3");
  if (s3) { s3.cineTarget = null; }
  // 娘踢翻水瓮那一声之后，整队都朝村西压过去：村东这一线松开，柱子才走得了。
  // 玩家往东走的一路上回头能看见——十几盏灯全挤在娘去的那个方向。
  state.actors = state.actors.filter((a) => !a.decor || a.x < 150);
  for (const a of state.actors) {
    if (!a.decor) continue;
    const nx = 56 + ((a.x * 7) % 24);
    a.x = nx;
    a.patrol = [nx - 5, nx + 5];
    a.heading = -1;
  }
}

function SpawnFortPatrols(state, reinforced) {
  state.actors = state.actors.filter((a) => !IsEnemy(a));
  state.actors.push(
    MakeActor("fortA", "soldier", 158, { patrol: [150, 174], speed: 1.4 }),
    MakeActor("gate1", "soldier", 170, { patrol: [168, 173], speed: 0.5 }),
  );
  if (reinforced) {
    state.actors.push(
      // 牢房外新添的游动哨：伪军（在围墙后侧走动，白盒里画在墙外一段）
      MakeActor("fortB", "puppet", 176, { patrol: [174, 186], speed: 1.1, lantern: true }),
      MakeActor("gate2", "soldier", 166, { patrol: [164, 170], speed: 0.55 }),
    );
  }
  state.stealthActive = true;
}

// 第五章白天的两个伪军：改造要的东西全在地表，他们就是「什么时候上去」的题面。
// 路线从剖面里一眼可见——读他们的脚程，就是读题。
function SpawnC5Snoops(state) {
  state.actors = state.actors.filter((a) => !IsEnemy(a));
  state.actors.push(
    MakeActor("snoopW", "puppet", 40, { patrol: [16, 62], speed: 0.95 }),
    MakeActor("snoopE", "puppet", 130, { patrol: [98, 158], speed: 1.05 }),
  );
  state.stealthActive = true;
}

// 地表搜查队：剖面视角里"头顶在翻找、脚下在屏息"的同框构图（纯演出，不参与潜行判定）
function SpawnSurfaceSearch(state, centerX) {
  state.actors.push(
    MakeActor("srch1", "puppet", centerX + 6, { patrol: [centerX - 6, centerX + 12], speed: 1.1, lantern: true }),
    MakeActor("srch2", "soldier", centerX - 4, { patrol: [centerX - 14, centerX + 4], speed: 1.25 }),
    MakeActor("srch3", "soldier", centerX + 16, { patrol: [centerX + 10, centerX + 24], speed: 1.0 }),
  );
}

function SpawnTunnelVillagers(state) {
  state.actors = state.actors.filter((a) => a.kind !== "villager");
  state.actors.push(
    MakeActor("elder1", "villager", 143, { level: "under", label: "拴柱大爷", group: "elders", slow: true }),
    MakeActor("elder2", "villager", 145, { level: "under", label: "六婶", group: "elders", slow: true }),
    MakeActor("aunt", "villager", 138, { level: "under", label: "大嫂", group: "family" }),
    MakeActor("kid", "villager", 139.5, { level: "under", label: "小石头", group: "family", slow: true }),
    MakeActor("shunzi", "villager", 116, { level: "under", label: "顺子", group: "none" }),
  );
}

function StartSmoke(state) {
  // 烟从东口（x=148）向西推进。压得慢：这一章要留出熄灯＋湿棉被两段链的工夫，
  // 真正的加速在 c4_smoke 的 onEnter（风箱到了）
  state.smoke = { frontX: 150, speed: 0.32, trapAt: null, trapHeld: false, active: true, sourceX: 148 };
  for (const a of state.actors) {
    if (a.kind !== "villager") continue;
    if (a.group === "elders") a.x = TV.chamberA.x + (a.id === "elder1" ? -1 : 1);
    if (a.group === "family") a.x = TV.chamberB.x + (a.id === "kid" ? 1.2 : 0);
    if (a.id === "shunzi") a.visible = false; // 顺子回身去背人——在失去脚本里出场
    a.following = false; a.evacuated = false; a.scripted = false;
  }
}

function StartDrillSmoke(state) {
  // 验收战：预警铃先响；烟推到翻口就过不来；西口被堵死，新暗口是活路
  state.actors = state.actors.filter((a) => a.kind !== "villager");
  // 三个人都在翻口以东——翻口挡得住烟，可他们还在烟这一侧。
  // 这一场的紧张就在这段路上：得赶在烟推到翻口之前，把人都带到弯的后面去。
  // （挖翻口那一下的回报也在这儿：过了弯就是安全的，不必一路跑到新暗口。）
  state.actors.push(
    MakeActor("d_elder", "villager", TV.trapSpot.x + 14, { level: "under", label: "六婶", slow: true }),
    MakeActor("d_aunt", "villager", TV.trapSpot.x + 8, { level: "under", label: "大嫂" }),
    MakeActor("d_kid", "villager", TV.trapSpot.x + 9.2, { level: "under", label: "小石头", slow: true }),
  );
  state.smoke = { frontX: 150, speed: 0.9, trapAt: SCENES.tunnelVillage.zones.trapSpot.x, trapHeld: false, active: true, sourceX: 148 };
  state.flags.hiddenBuilt = true;
  state.flags.entWBlocked = true;
  state.player.x = 148;
  state.player.level = "under";
  const gao = FindActor(state, "gao");
  if (gao) { gao.cineTarget = { x: 20 }; gao.cineSpeed = 2.4; }
  state.toast = { text: "东口的铃响成一串。人已经在往洞里下了。", t: 4 };
}

// 第七章的队伍：柱子不是一个人下的地道，画面里要看得见"跟紧队伍"
function SpawnRescueSquad(state) {
  if (FindActor(state, "squad0")) return;
  const base = state.player.x;
  // 跟地面佯动组的人是打完仗才退回来的，接应组早走在前头——手边就少两个人。
  // 这是那个选择在玩法上唯一的、也是够用的差别：地面把敌人引开了（塌方间隔更长、
  // 探杆更稀），代价是救人时没人搭手，一趟只能带一个。
  const n = state.flags.route === "ground" ? 2 : 4;
  for (let i = 0; i < n; i += 1) {
    state.actors.push(MakeActor(`squad${i}`, "militia", base + 4 + i * 3.2, {
      level: "under", heading: 1, squad: true,
    }));
  }
}

function SetupFortTunnel(state) {
  state.collapses = {
    collapse1: { cleared: false, progress: 0, shored: false },
    collapse2: { cleared: false, progress: 0, shored: false },
  };
  state.actors = state.actors.filter((a) => a.kind !== "villager" && !IsEnemy(a));
  state.player.x = 16;
  state.player.level = "under";
}

function AttachSister(state) {
  let sister = FindActor(state, "sister");
  if (!sister) {
    sister = MakeActor("sister", "sister", 0, { label: "妹妹" });
    state.actors.push(sister);
  }
  sister.visible = true;
  sister.level = state.player.level;
  sister.x = state.player.x + 1;
  sister.following = true;
}

function StartRescueLoop(state) {
  const sister = FindActor(state, "sister");
  if (sister) { sister.visible = false; sister.following = false; }
  state.player.lamp = true;
  state.actors.push(
    MakeActor("trapA1", "villager", TF.pocketA.x, { level: "under", label: "被困乡亲", pocket: "pocketA" }),
    MakeActor("trapA2", "villager", TF.pocketA.x + 1, { level: "under", label: "被困乡亲", pocket: "pocketA" }),
    MakeActor("trapB1", "villager", TF.pocketB.x, { level: "under", label: "受伤的老人", pocket: "pocketB", slow: true }),
    MakeActor("trapB2", "villager", TF.pocketB.x - 1, { level: "under", label: "搀扶的民兵", pocket: "pocketB" }),
    MakeActor("trapC1", "villager", TF.pocketC.x, { level: "under", label: "抱孩子的大嫂", pocket: "pocketC", slow: true }),
  );
  state.rescue = { delivered: new Set(), dialogueShown: new Set(), quakeT: 0 };
  if (state.flags.route === "ground") {
    state.toast = { text: "村北的枪声停了。敌人正在回防——头顶的动静密了起来。", t: 5 };
  }
}

function SetupRuinedVillage(state) {
  state.flags.ruined = true;
  state.player.x = 105;
  state.player.level = "surface";
  let sister = FindActor(state, "sister");
  if (!sister) { sister = MakeActor("sister", "sister", 107, { label: "妹妹" }); state.actors.push(sister); }
  sister.visible = true; sister.following = true; sister.level = "surface";
  sister.x = state.player.x + 1.5;
  state.actors = state.actors.filter((a) => !IsEnemy(a) && a.kind !== "villager");
}

// ---------------------------------------------------------------------------
// 状态机
// ---------------------------------------------------------------------------
export function CreateGame(chapterIndex = 0) {
  const state = {
    version: GAME_VERSION,
    phase: "chapterCard",
    chapterIndex,
    beatIndex: 0,
    time: 0,
    cardTimer: 0,
    player: { x: 0, level: "surface", heading: 1, crouch: false, carry: null, item: null, lamp: false, hidden: false, climbT: 0, vaultT: 0, vaultK: 0, lift: 0, cineWalk: null },
    actors: [],
    cart: null,
    // 自由放下的落地道具：{uid, id, label, big?, throwable?, x, level}
    groundItems: [],
    groundSeq: 0,
    knot: null,      // 接绳打结的进行时（渲染层照着画引导圈与绳）
    gesture: null,   // 当前节拍期望的手势提示（HUD 的动效小图标）
    thrown: null,
    noiseAt: null,
    searchlight: null,
    dogBark: null,
    cues: [],
    bubbles: [],
    bubbleFlash: null,
    throwAim: null,
    sparrowBurst: null,
    henFlee: null,
    mouseFlee: null,
    planing: null,
    planeCurl: null,
    scribe: null,
    // 铺满画框、每帧重画的手绘活卡：做功的那两拍都长在卡上
    scribeCard: null,      // 划线（见 StepScribe）
    planeCard: null,       // 刨料（见 StepPlane）
    spotFlash: null,
    irisFocus: null,
    pip: null,
    stealthActive: false,
    detection: { level: 0, spotter: null },
    pressHold: null,      // 娘按住你的那一下（见 MovePlayer）
    smoke: null,
    collapses: null,
    rescue: null,
    beat: null,
    microCine: null,
    lamps: null,
    lightOverride: null,
    flood: null,
    floodDepth: 0,
    flags: {
      route: null, resets: 0, ruined: false, marked: false, carved: false,
      hiddenBuilt: false, trapBuilt: false, entWBlocked: false, deduced: false, notesSeen: [],
      clothDown: false, dogFed: false, dogFed2: false, lanternOut: false, quiltPlugged: false, bellBuilt: false,
      barrowPlanks: 0, barrowHome: false, henFlew: false, wellRopeBroken: false, ropeTaken: false,
      bucketAt: null, raidStarted: false, thimbleFound: false,
    },
    caption: null,
    camHint: { kind: "follow" },
    fade: 0,
    toast: null,
    prompt: null,
    done: false,
  };
  StartChapter(state, chapterIndex);
  return state;
}

// 一次性戏剧姿势用完就得收：不清的话，被架走的爹会一路架着走完全场
// 换幕时把过场留下的姿势/轨道抹掉，免得它们渗进下一拍。
// **但干活的循环不算过场**：爹在工作台前拉锯、娘在菜畦锄地是这一章的底噪，
// 它们打 ambient 标记，换幕不清。以前一并清掉，于是"把水交给娘"那一下
// 链走完、AdvanceBeat 一调 ClearPoses，爹的锯和娘的锄同时定格——
// 两个大活人从此站在院子里一动不动。要停活的地方（扫荡时爹去抄刨子）
// 本来就显式写了 track = null，不靠这里代劳。
function ClearPoses(state) {
  state.player.pose = null;
  if (!state.player.track?.ambient) state.player.track = null;
  state.pressHold = null;          // 按住是一次性状态，绝不能跨幕带过去
  state.player.forcedCrouch = false;
  for (const a of state.actors) {
    a.pose = null;
    if (!a.track?.ambient) a.track = null;
  }
}

export function StartChapter(state, index) {
  const ch = CHAPTERS[index];
  state.chapterIndex = index;
  state.beatIndex = 0;
  state.phase = "chapterCard";
  state.cardTimer = 0;
  state.actors = [];
  state.stealthActive = false;
  state.detection = { level: 0, spotter: null };
  state.pressHold = null;
  state.smoke = null;
  state.collapses = null;
  state.rescue = null;
  state.microCine = null;
  state.lamps = null;
  state.lightOverride = null;
  state.flood = null;
  state.floodDepth = 0;
  state.caption = null;
  state.prompt = null;
  state.player.carry = null;
  state.player.item = null;
  state.player.lamp = false;
  state.player.crouch = false;
  state.player.climbT = 0;
  state.player.cineWalk = null;
  state.player.level = "surface";
  state.cart = null;
  state.groundItems = [];
  state.knot = null;
  state.gesture = null;
  state.closeUp = null;
  state.thrown = null;
  state.noiseAt = null;
  state.searchlight = null;
  state.dogBark = null;
  if (index !== 7) state.flags.ruined = false;
  if (index < 4) { state.flags.hiddenBuilt = false; state.flags.entWBlocked = false; }
  state.player.vaultT = 0;
  state.player.vaultK = 0;
  state.player.lift = 0;
  state.player.vaultBig = false;
  state.vaultDust = null;
  state.vaultHint = "";
  state.cues = [];
  state.bubbles = [];
  state.bubbleFlash = null;
  state.throwAim = null;
  state.sling = null;
  state.sparrowBurst = null;
  state.henFlee = null;
  state.mouseFlee = null;
  state.planing = null;
  state.planeCurl = null;
  state.scribe = null;
  state.scribeCard = null;
  state.planeCard = null;
  state.spotFlash = null;
  state.irisFocus = null;
  state.pip = null;
  // 从章节菜单单独进某一章时，本章谜题的旗标要归零
  if (index === 0) {
    state.flags.marked = false;   // 门框重新变回空的，那道线等玩家自己划
    state.flags.clothDown = false;
    state.flags.barrowPlanks = 0;
    state.flags.barrowHome = false;
    state.flags.henFlew = false;
    state.flags.wellRopeBroken = false;
    state.flags.ropeTaken = false;
    state.flags.bucketAt = null;
    state.flags.raidStarted = false;
    state.flags.waterFilled = false;
    state.flags.planedOnce = false;
    state.flags.tenonDone = false;
    state.flags.clothDown = false;   // 重玩第一章：布巾重新挂回树上
  }
  if (index === 1) { state.flags.dogFed = false; state.flags.lanternOut = false; }
  if (index <= 4) { state.flags.quiltPlugged = false; state.flags.trapBuilt = false; }
  if (index === 4) { state.flags.dogFed2 = false; state.flags.bellBuilt = false; }

  if (ch.id === "c1") {
    state.player.x = 38;
    state.actors.push(
      MakeActor("father", "father", 41, { label: "爹" }),
      MakeActor("mother", "family", 36, { label: "娘" }),
      MakeActor("sister", "sister", V.sisterTree.x + 1, { label: "妹妹" }),
      // 街上还有别人家的日子在过：李婶在鸡窝前撒食，东头的老汉扫院。
      // 人人手上有活的规矩不只管自家人——一条整街只有一家四口才是真的说不过去。
      // 鬼子进村的喊声一起就都收进屋（c1_raid 第一行），鸡跟着 raidStarted 旗标藏
      MakeActor("auntFeed", "villager", 65.8, { label: "李婶", heading: -1, track: { name: "scatterFeed", t: 0, ambient: true } }),
      MakeActor("oldSweep", "villager", 145.5, { label: "扫院的老汉", heading: 1, carry: "扫帚", track: { name: "sweeping", t: 0, ambient: true } }),
      // 再添两个有营生的：担水的在井台和家门之间来回（wander），
      // 碾糠的大娘守着石碾——开场第三空镜（交完粮、碾上碾的是糠）拍的就是她，
      // 她也是老槐树下妹妹身边的大人（孩子不是孤零零撂在村东头）。
      // 警讯一到（c1_sisterHome 的报信民兵）都随街清空
      MakeActor("carrier", "villager", 60.5, { label: "担水的乡亲", carry: "桶", wander: { x0: 58.8, x1: 63.5, speed: 0.85 } }),
      MakeActor("grindAunt", "villager", 119.3, { label: "碾糠的大娘", pose: "push", heading: -1 }),
    );
  } else if (ch.id === "c2") {
    state.player.x = 38;
    state.actors.push(
      MakeActor("mother", "family", 40, { label: "娘", visible: false }),
      MakeActor("sister", "sister", 36.5, { label: "妹妹", following: true }),
    );
  } else if (ch.id === "c3") {
    state.player.x = 10;
  } else if (ch.id === "c4") {
    state.player.x = 148;
    state.player.level = "under";
    state.actors.push(MakeActor("gao", "militia", 144, { level: "under", label: "高传宝" }));
  } else if (ch.id === "c5") {
    state.player.x = 40;
    state.player.level = "under";
    state.actors.push(MakeActor("gao", "militia", 44, { level: "under", label: "高传宝" }));
    state.flags.entWBlocked = false;
  } else if (ch.id === "c6") {
    state.player.x = 8;
    state.actors.push(MakeActor("gao", "militia", 6, { label: "高传宝" }));
  } else if (ch.id === "c7") {
    state.player.x = 16;
    state.player.level = "under";
  } else if (ch.id === "c8") {
    SetupRuinedVillage(state);
  }
  EnterBeat(state);
}

function CurrentScript(state) { return SCRIPTS[CHAPTERS[state.chapterIndex].id]; }
export function CurrentBeatDef(state) { return CurrentScript(state)[state.beatIndex] || null; }

function EnterBeat(state) {
  const def = CurrentBeatDef(state);
  if (!def) { EndChapter(state); return; }
  state.beat = {
    t: 0, lineIndex: 0, lineT: 0, lineFired: -1,
    itemStates: def.kind === "collect" ? def.items.map((p) => ({ x: p.x, carried: false, delivered: false })) : null,
    visited: new Set(),
    holdProgress: 0,
    spotIndex: 0,
    spotProgress: def.kind === "buildSpots" ? def.spots.map(() => 0) : null,
    spotDone: def.kind === "buildSpots" ? def.spots.map(() => false) : null,
    digIndex: 0,
    quakeT: 0, quakeActive: false, quakeWarn: false,
    graceT: 0, failN: 0,
    lossStage: 0, lossT: 0,
    snapshot: SnapshotPositions(state),
    choiceMade: null,
  };
  if (def.kind === "cinematic") {
    state.caption = null;
    state.beatLines = def.dynamicLines ? def.dynamicLines(state) : def.lines;
  }
  def.onEnter?.(state);
}

function SnapshotPositions(state) {
  return {
    player: { x: state.player.x, level: state.player.level },
    actors: state.actors.map((a) => ({ id: a.id, x: a.x, level: a.level, following: !!a.following })),
  };
}

function RestoreSnapshot(state) {
  const snap = state.beat.snapshot;
  state.player.x = snap.player.x;
  state.player.level = snap.player.level;
  for (const s of snap.actors) {
    const a = FindActor(state, s.id);
    if (a) { a.x = s.x; a.level = s.level; a.following = s.following; }
  }
  state.detection.level = 0;
}

function AdvanceBeat(state) {
  ClearPoses(state);
  const def = CurrentBeatDef(state);
  def?.onDone?.(state);
  state.beatIndex += 1;
  state.caption = null;
  state.prompt = null;
  state.planing = null;
  state.scribe = null;
  state.scribeCard = null;
  state.planeCard = null;
  state.throwAim = null;
  state.sling = null;
  if (state.beatIndex >= CurrentScript(state).length) EndChapter(state);
  else EnterBeat(state);
}

// 跳过序章：整段一次性结算掉（序章的行没有走位副作用，直接翻页即可）。
// 只对 c1_prologue 生效——正片的过场不给整段跳，逐行点按仍是唯一的快进。
export function SkipPrologue(state) {
  const def = CurrentBeatDef(state);
  if (!def || def.id !== "c1_prologue") return false;
  AdvanceBeat(state);
  return true;
}

function EndChapter(state) {
  if (state.chapterIndex >= CHAPTERS.length - 1) {
    state.phase = "gameEnd";
    state.done = true;
  } else {
    state.phase = "chapterEnd";
    state.cardTimer = 0;
  }
}

export function AdvanceCinematic(state) {
  const def = CurrentBeatDef(state);
  if (!def) return;
  if (def.kind === "cinematic") {
    state.beat.lineIndex += 1;
    state.beat.lineT = 0;
    if (state.beat.lineIndex >= state.beatLines.length) AdvanceBeat(state);
  }
}

export function MakeChoice(state, key) {
  const def = CurrentBeatDef(state);
  if (def?.kind !== "choice") return;
  state.flags.route = key;
  state.beat.choiceMade = key;
  AdvanceBeat(state);
}

export function ConfirmChapterCard(state) {
  if (state.phase === "chapterCard") state.phase = "playing";
  else if (state.phase === "chapterEnd") StartChapter(state, state.chapterIndex + 1);
}

// ---------------------------------------------------------------------------
// 过场走位与微过场
// ---------------------------------------------------------------------------
function StepCineActors(state, dt) {
  // 关键帧轨道的时钟。t 允许从负数起步：负的那一段是"等待"，
  // 用来把两个演员的轨道对齐到同一个落点（枪托砸到的那一帧）。
  if (state.player.track) state.player.track.t += dt;
  for (const a of state.actors) if (a.track) a.track.t += dt;
  // 钉在别人身上的演员（挎斗里的兵钉在摩托上）：先让被钉的走完，再贴上去。
  // dx 以「车头朝 -x」为基准；车往 +x 走时贴图整张镜像，偏移也跟着翻——
  // 挎斗永远在车尾那一侧，不会翻个头就把兵甩到车头前面去
  for (const a of state.actors) {
    if (!a.pinTo) continue;
    const host = FindActor(state, a.pinTo.id);
    if (!host) continue;
    a.x = host.x + a.pinTo.dx * (host.heading >= 0 ? -1 : 1);
    a.heading = host.heading;
    a.visible = host.visible;
  }
  // 乡亲的日常走动（担水的、串门的）：一小段路来回，到头歇一口气再折返——
  // 不打磕巴地来回是钟摆，不是人。放在这里而不是玩法循环里，
  // 是因为过场里的村子也得活着（开场那几个空镜靠的就是他们）。
  for (const a of state.actors) {
    const w = a.wander;
    if (!w || a.visible === false || a.cineTarget) continue;
    if (w.tx === undefined) w.tx = w.x1;
    const d = w.tx - a.x;
    if (Math.abs(d) < 0.15) {
      w.dwell = (w.dwell ?? (1.4 + Math.random() * 1.8)) - dt;
      if (w.dwell <= 0) { w.tx = w.tx === w.x1 ? w.x0 : w.x1; w.dwell = undefined; }
      continue;
    }
    a.x += Math.sign(d) * (w.speed || 1) * dt;
    a.heading = Math.sign(d);
  }
  for (const a of state.actors) {
    if (!a.cineTarget) continue;
    const d = Math.abs(a.x - a.cineTarget.x);
    if (d < 0.4) {
      if (a.cineVanish) a.visible = false;
      a.cineTarget = null;
      continue;
    }
    const speed = a.cineSpeed || 1.6;
    const dir = Math.sign(a.cineTarget.x - a.x);
    // cineKeepHeading：被拖走还回头望的人，脸不许被行走方向扳回去
    if (!a.cineKeepHeading) a.heading = dir;
    a.x += dir * Math.min(speed * dt, d);
  }
  // 玩家的过场走位（第八章结尾：走出画面）
  if (state.player.cineWalk) {
    const w = state.player.cineWalk;
    const d = Math.abs(state.player.x - w.x);
    if (d < 0.4) state.player.cineWalk = null;
    else {
      const dir = Math.sign(w.x - state.player.x);
      state.player.heading = dir;
      state.player.x += dir * Math.min(w.speed * dt, d);
    }
  }
}

export function StartMicroCine(state, lines) {
  state.microCine = { lines, i: 0, t: 0 };
}

function StepMicroCine(state, input, dt) {
  const mc = state.microCine;
  const line = mc.lines[mc.i];
  if (!line) { state.microCine = null; state.caption = null; return; }
  state.caption = line;
  state.camHint = line.cam || { kind: "close" };
  mc.t += dt;
  if (input.advance || !LineHeld(line, mc.t)) {
    mc.i += 1;
    mc.t = 0;
    if (mc.i >= mc.lines.length) { state.microCine = null; state.caption = null; }
  }
}

function StepCinematic(state, input, dt) {
  const lines = state.beatLines;
  const line = lines[state.beat.lineIndex];
  if (!line) { AdvanceBeat(state); return; }
  if (state.beat.lineFired !== state.beat.lineIndex) {
    state.beat.lineFired = state.beat.lineIndex;
    line.on?.(state);
  }
  state.caption = line;
  state.camHint = line.cam || { kind: "follow" };
  state.camLineT = state.beat.lineT;
  state.camLineD = LineDuration(line);
  // 正反打不能越轴：主体必须看着被越过的那个肩膀
  if (state.camHint.kind === "ots") {
    const subj = FindActor(state, state.camHint.subject)
      || (state.camHint.subject === "player" ? state.player : null);
    const other = FindActor(state, state.camHint.other)
      || (state.camHint.other === "player" ? state.player : null);
    if (subj && other) {
      subj.heading = other.x >= subj.x ? 1 : -1;
      other.heading = -subj.heading;
    }
  }
  StepCineActors(state, dt);
  state.beat.lineT += dt;
  if (input.advance || !LineHeld(line, state.beat.lineT)) {
    state.beat.lineIndex += 1;
    state.beat.lineT = 0;
    if (state.beat.lineIndex >= lines.length) AdvanceBeat(state);
  }
}

// ---------------------------------------------------------------------------
// 主步进
// input: {moveX(-1..1), climb(-1上/+1下…实际 W=-1 上), crouch, interact, interactHeld, advance}
// ---------------------------------------------------------------------------
export function StepGame(state, input, dt) {
  state.promptFill = 0;
  if (state.phase === "gameEnd") return;
  state.time += dt;
  // 指尖按下的那一帧（拟物投掷"攥住"只认这一帧——手必须落在石子上才攥得住）
  state.ptrPressed = !!input.pointerHeld && !state.ptrWasHeld;
  state.ptrWasHeld = !!input.pointerHeld;
  state.slingTicked = false;   // 拟物投掷每帧只步进一次（链内代管则链外让位）
  if (state.toast && (state.toast.t -= dt) <= 0) state.toast = null;
  // 动词姿势到时收回（过场里由脚本设的 pose 没有 poseT，不受影响）
  if (state.player.poseT !== undefined && (state.player.poseT -= dt) <= 0) {
    state.player.pose = null;
    state.player.poseT = undefined;
  }
  // 引导气泡逐帧重算（节拍的 bubbles 回调往里推）；一次性气泡走计时
  state.bubbles = [];
  state.throwAim = null;   // 预览弧逐帧重立；sling 本体是跨帧状态，只在幕/章切换清
  if (state.bubbleFlash && (state.bubbleFlash.t -= dt) <= 0) state.bubbleFlash = null;
  if (state.spotFlash && (state.spotFlash.t -= dt) <= 0) state.spotFlash = null;
  // 飘落的刨花：渲染层拿它跑一段自由落体，落到地上就并进那堆里
  if (state.planeCurl && (state.planeCurl.t += dt) > 1.8) state.planeCurl = null;
  // 后果小窗到时收起；onEnd 给"看完这一眼之后"的收尾用（娘接着锄地）
  if (state.pip && (state.pip.t -= dt) <= 0) {
    const done = state.pip;
    state.pip = null;
    done.onEnd?.(state);
  }
  // 小活物的一次性动画：麻雀炸窝、母鸡扑棱、田鼠蹿走——各自跑完就清
  for (const key of ["sparrowBurst", "henFlee", "mouseFlee", "vaultDust"]) {
    const fx = state[key];
    if (fx && (fx.t += dt) > 2.2) state[key] = null;
  }

  if (state.phase === "chapterCard" || state.phase === "chapterEnd") {
    state.cardTimer += dt;
    if (input.advance && state.cardTimer > 0.8) ConfirmChapterCard(state);
    return;
  }

  const def = CurrentBeatDef(state);
  if (!def) return;
  state.beat.t += dt;
  state.prompt = null;

  if (state.microCine) { StepMicroCine(state, input, dt); StepCineActors(state, dt); return; }
  if (def.kind === "cinematic") { StepCinematic(state, input, dt); return; }
  if (def.kind === "choice") { state.caption = null; return; }

  // 有的节拍给烟锋设了下限（第四章熄灯/堵卡口那两段）：烟在卡口外打转，
  // 不会把玩家要去的位置先吞掉——手慢不该变成死局。放在 MovePlayer 之前，
  // 因为渲染层的流体解算会在两帧之间把 frontX 往低改。
  if (def.smokeFloor !== undefined && state.smoke?.active && state.smoke.frontX < def.smokeFloor) {
    state.smoke.frontX = def.smokeFloor;
  }
  MovePlayer(state, input, dt);
  StepFollowers(state, dt);
  StepSoldiers(state, dt);
  StepCineActors(state, dt);
  if (state.smoke?.active) StepSmoke(state, dt);
  StepDogs(state, dt);
  StepLightHazard(state, def, dt);
  if (state.noiseAt && (state.noiseAt.t -= dt) <= 0) state.noiseAt = null;

  // 辘轳锁在这里清、在 beat 执行器里立——MovePlayer 在前面用的是上一帧的值，
  // 这一帧的时序正好让"井口竖推当摇辘轳"不与"竖推当爬梯"打架
  state.winchLock = false;
  state.winchView = null;
  state.knot = null;      // 同 winchView：打结进行时由 beat 每帧重立
  state.gesture = null;   // 手势提示同理
  state.closeUp = null;   // 玩法特写（辘轳/打结）同理：活着的那一帧自己立
  state.canDrop = false;

  // 节拍声明的引导气泡（图形气泡=「我缺什么」，无文字引导三层配方之一）
  def.bubbles?.(state);
  // 节拍的每帧回调（走位到点接活计这类小状态机）
  def.tick?.(state, dt);

  // 链外的通用投掷：手里有能扔的就能扔（软性窗口靠它——石子落地出声引开人）。
  // 链内的投掷仍由 StepChain 自己管（要判命中）
  if (def.kind !== "chain") {
    StepThrown(state, dt);
    if (state.player.item?.throwable && !state.thrown) {
      const aiming = StepSlingAim(state, input, null);   // 拽着瞄：落点自己定
      if (!aiming && input.throw) StartThrow(state, null);
    }
  }
  // 路边的石子堆（潜行段的软性窗口）：捡一颗在手，第一次靠近给个一次性提示
  if (def.stonePile && !state.player.item && state.player.level === "surface"
    && Math.abs(state.player.x - def.stonePile.x) < 1.6) {
    if (!state.beat.stoneHinted) {
      state.beat.stoneHinted = true;
      state.bubbleFlash = { x: def.stonePile.x, y: 1.9, icon: "stone", t: 3.2 };
    }
    if (!state.prompt) {
      state.prompt = "E · 捡石子";
      if (input.interact) { GiveItem(state, { id: "stone", label: "石子", throwable: true }); FlashPose(state, "bow", 0.45); Cue(state, "pickup"); }
    }
  }
  // 扒墙缝看一眼（可选观察，预教第三章的「看」）：无字幕的插入镜头
  if (def.peek && !state.beat.peeked && !state.microCine
    && Math.abs(state.player.x - def.peek.x) < 1.5 && state.player.level === "surface") {
    if (!state.prompt) {
      state.prompt = def.peek.prompt;
      if (input.interact) { state.beat.peeked = true; StartMicroCine(state, def.peek.lines); }
    }
  }
  // 可选探索：院墙角那枚顶针（历史小卡的雏形——训练「离开主路径看一眼」）
  if (CHAPTERS[state.chapterIndex].id === "c1" && !state.flags.thimbleFound
    && !state.prompt && !state.player.item && state.player.level === "surface"
    && Math.abs(state.player.x - 48.8) < 1.2) {
    state.prompt = "E · 看看";
    if (input.interact) {
      state.flags.thimbleFound = true;
      Cue(state, "pickup");
      state.toast = { text: "一枚铜顶针。娘纳鞋底时顶针眼用的，不知什么时候滚到了墙根。", t: 5 };
    }
  }
  // 邻居家的细节（scene.lookables）：白天路过看一眼，出一条手记。
  // 村子不是布景——每一眼都是别人家正在过的日子。每章每处一次；
  // 夜里/潜行中不出（那时候没人有闲心看鸡窝）
  {
    const ch = CHAPTERS[state.chapterIndex];
    const lookables = SCENES[ch.scene].lookables;
    const daylight = !["night", "dark", "tunnel"].includes(ch.light || "day");
    if (lookables && daylight && !state.stealthActive && !state.prompt
      && !state.microCine && state.player.level === "surface") {
      for (const spot of lookables) {
        if (state.lookSeen?.[spot.id]) continue;
        if (Math.abs(state.player.x - spot.x) > (spot.w || 1.4)) continue;
        state.prompt = "E · 看一眼";
        if (input.interact) {
          (state.lookSeen ??= {})[spot.id] = true;
          state.toast = { text: spot.note, t: 5 };
        }
        break;
      }
    }
  }

  switch (def.kind) {
    case "goto": StepGoto(state, def, input); break;
    case "gotoSeq": StepGotoSeq(state, def, input); break;
    case "collect": StepCollect(state, def, input); break;
    case "escort": StepEscort(state, def, input); break;
    case "leadFollow": StepLeadFollow(state, def, dt); break;
    case "coverRun": StepCoverRun(state, def, input, dt); break;
    case "lead": StepLead(state, def, input); break;
    case "observe": StepObserve(state, def, dt); break;
    case "hold": StepHold(state, def, input, dt); break;
    case "doomedHold": StepDoomedHold(state, def, input, dt); break;
    case "mapBoard": StepMapBoard(state, def, input); break;
    case "actSeq": StepActSeq(state, def, input); break;
    case "scribe": StepScribe(state, def, input, dt); break;
    case "buildSpots": StepBuildSpots(state, def, input, dt); break;
    case "digSeq": StepDigSeq(state, def, input, dt); break;
    case "douseLamps": StepDouseLamps(state, def, input); break;
    case "floodRescue": StepFloodRescue(state, def, input); break;
    case "smokeEscape": StepSmokeEscape(state, def, input); break;
    case "rescueLoop": StepRescueLoop(state, def, input, dt); break;
    case "chain": StepChain(state, def, input, dt); break;
    case "cartRide": StepCartRide(state, def, input, dt); break;
    case "plane": StepPlane(state, def, input, dt); break;
    default: break;
  }

  // 落地道具（自由放下/拾回/交换 + 悬浮提示）：跑在节拍之后，节拍的提示优先
  StepGroundItems(state, def, input);

  if (state.stealthActive && !def.noDetect) StepDetection(state, def, dt);
}

// ---------------------------------------------------------------------------
// 移动 / 爬梯 / 躲藏
// ---------------------------------------------------------------------------
function MovePlayer(state, input, dt) {
  const def = CurrentBeatDef(state);
  const scene = SceneOf(state);
  const env = CHAPTERS[state.chapterIndex].scene;
  const p = state.player;

  // 娘按住你。以前屏幕下方写着"娘按住你"，画面上谁也没按住谁，玩家随时能走开——
  // 用户的第一句话就是「哪里按住了？」。现在它是真的：她的手落在你肩上（pose
  // "press"），你被按成蹲姿、这一下走不动，也真的因此没被照见。
  // 这层保险有冷却，而且娘去引开搜村的人之后就没有了——关卡的情感在机制上兑现。
  if (state.pressHold) {
    state.pressHold.t -= dt;
    if (state.pressHold.t <= 0) {
      state.pressHold = null;
      if (p.pose === "pressed") p.pose = null;
    } else {
      p.crouch = true;
      p.forcedCrouch = true;
      p.posture = "squat";
      p.pose = "pressed";       // 膝盖是被压弯的，不是自己蹲的（与娘的 press 成对）
      p.hidden = true;
      p.moving = false;
      state.vaultHint = "";
      state.climbHint = "";
      return;
    }
  }

  if (p.climbT > 0) { p.climbT -= dt; return; } // 爬梯中锁操作
  // 翻越进行中：撑上顶沿 → 收腿荡过去 → 落地缓冲，全程锁操作。
  // 横向用 smoothstep（起手几乎不动，手在撑；过顶沿最快；落地收住），
  // 纵向走 VaultArc —— 人是真的抬离地面的，渲染层读 p.lift。
  if (p.vaultT > 0) {
    p.vaultT -= dt;
    const dur = p.vaultDur || VAULT_DUR;
    const k = Math.max(0, Math.min(1, 1 - Math.max(0, p.vaultT) / dur));
    p.vaultK = k;
    // 横移不是匀速滑过去的：撑手一按住，人就绕着那只手转，这半程几乎不前进；
    // 腿甩过顶沿之后才荡下去。上一版用对称的 smoothstep，人在墙上方匀速平移，
    // 于是"撑"这件事根本看不出来——那是最像悬浮的一段。
    p.x = p.vaultFrom + (p.vaultTo - p.vaultFrom) * VaultTravel(k);
    p.lift = VaultArc(k, p.vaultBig, p.vaultTop);
    p.pose = p.vaultBig ? "clamber" : "vault";
    // 垛顶上藏不住人：翻越是要露头的，这也是把它放进扫荡段的意义
    p.hidden = false;
    // 脚先落地，最后那一小段是屈膝卸力——落地声和尘土跟着脚走，不跟着动作结束走
    if (!p.vaultLanded && k >= 0.80) {
      p.vaultLanded = true;
      Cue(state, "vaultLand");
      state.vaultDust = { x: p.x, t: 0 };
    }
    if (p.vaultT <= 0) {
      p.pose = null; p.vaultT = 0; p.vaultK = 0; p.lift = 0; p.vaultBig = false;
    }
    return;
  }

  // 地道里的姿态由所在段的净高决定：猫腰是常态，半蹲是局部，
  // 直立（藏人洞）和爬行（卡口/新掏段）是少数。见 TunnelPosture。
  const inTunnel = (env === "tunnelVillage" || env === "tunnelFort") && p.level === "under";
  const posture = inTunnel ? TunnelPosture(scene, p.x) : (input.crouch ? "squat" : "stand");
  p.posture = posture;
  p.forcedCrouch = inTunnel && posture !== "stand";
  p.crouch = posture === "squat" || posture === "crawl" || (!inTunnel && !!input.crouch);
  let speed = 4.2 * (POSTURE_SPEED[posture] ?? 1);
  // 背着大爷：一个大活人在背上，快不起来
  if (state.beat?.carryElder) speed = Math.min(speed, 1.8);
  if (def?.slow) speed = 1.8;
  if (p.carry) speed = 3.0;
  if (p.item?.big) speed = Math.min(speed, 2.6);   // 扛大件（门板/顶木/满桶水）再慢一档

  // 攥着石笔的时候脚是不动的：键盘那条路按住 E 再左右推，推的是笔不是腿。
  // 不锁住的话，玩家一边划一边走出这个 2.9m 的特写镜头，划两下就得走回来。
  const holdingChalk = def?.kind === "scribe"
    && (input.interactHeld || input.interact)
    && Math.abs(p.x - def.zone.x) < (def.zone.w || 3) / 2 + 1.2;

  const prevX = p.x;
  // 迈开腿了没有——探测速率要用它（在灯里快走比蹲着不动显眼得多）
  p.moving = Math.abs(input.moveX) > 0.05 && !holdingChalk;
  if (p.moving) {
    p.x += Math.sign(input.moveX) * speed * dt;
    p.heading = Math.sign(input.moveX);
  }

  // 可翻越物：**挡路**。走到跟前顶住，头顶出一枚「翻过去」的徽章，
  // 按下互动键才翻——自动翻越是上一版的做法，玩家的原话是"居然是自动翻越"：
  // 一个会打断走路的动作必须由玩家自己按下去，否则那就不是他的动作。
  // 过场走位（cineWalk / microCine）与推着车走不参与。
  state.vaultHint = "";
  const pushingCart = !!state.cart && Math.abs(p.x - state.cart.x) < 2.6;
  if (p.level === "surface" && !state.microCine && !p.cineWalk && !pushingCart) {
    for (const v of scene.vaults || []) {
      if (v.flag && !state.flags[v.flag]) continue;
      const stop = (v.w || 1) / 2 + 0.2;                   // 顶住的位置：贴着近侧那一面
      const d = p.x - v.x;
      if (Math.abs(d) > stop + 0.55) continue;             // 还没走到跟前
      // 站在哪一侧：贴住之后 d 就不会再是 0，起步那一帧用上一帧的位置兜底
      const side = Math.sign(d) || Math.sign(prevX - v.x) || -(p.heading || 1);
      if (Math.abs(d) < stop) p.x = v.x + side * stop;     // 挡住，过不去
      // 提示只在**朝着它**的时候出。刚翻下来背对着它的那一秒也在范围内，
      // 那会儿再出一次提示，按键玩家会当场原路翻回去——来回弹个没完
      if (p.heading !== -side) break;
      state.vaultHint = "E · 翻过去";
      if (input.interact) {
        input.interact = false;                            // 吃掉这一下，别再被节拍拿去用
        const dir = -side;                                 // 往障碍的另一侧翻
        const big = !!(p.item?.big || p.carry);
        p.vaultDur = big ? VAULT_DUR_BIG : VAULT_DUR;
        p.vaultFrom = p.x;                                 // 从脚下起手，不往回弹
        p.vaultTo = v.x + dir * ((v.w || 1) / 2 + 0.52);
        p.vaultTop = v.top ?? 1.2;
        p.vaultBig = big;
        p.vaultT = p.vaultDur;
        p.vaultK = 0;
        p.vaultLanded = false;
        p.heading = dir;
        state.vaultHint = "";
        Cue(state, big ? "vaultHeavy" : "vault");
      }
      break;
    }
  }

  // 站在竖井口要给提示。原先这里一个字都没有，玩家根本不知道脚下能上能下——
  // 单独存一个字段，免得跟节拍自己的 prompt 抢。
  state.climbHint = "";
  for (const shaft of scene.shafts) {
    if (Math.abs(p.x - shaft.x) > 1.4) continue;
    if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
    if (p.level === "under" && scene.walk.surface) state.climbHint = "W · 上梯子";
    else if (p.level === "surface" && scene.walk.under) state.climbHint = "S · 下地道";
    break;
  }

  // 爬梯口：W 上 / S 下（辘轳接管竖推时不当爬梯——c5 井台正压在竖井口上）
  if (Math.abs(input.climb || 0) > 0.05 && !state.winchLock) {
    for (const shaft of scene.shafts) {
      if (Math.abs(p.x - shaft.x) > 1.4) continue;
      if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
      if (input.climb < 0 && p.level === "under") {
        if (state.flags.entWBlocked && shaft.id === "entW") {
          state.toast = { text: "西口上面有动静——不能走这儿！", t: 2.5 };
          break;
        }
        // 据点地道没有做地表：真让他爬上去会掉进一个空场景，提示全消失
        if (!scene.walk.surface) break;
        p.level = "surface"; p.climbT = 0.55; p.x = shaft.x;
      } else if (input.climb > 0 && p.level === "surface" && scene.walk.under) {
        p.level = "under"; p.climbT = 0.55; p.x = shaft.x;
      }
      break;
    }
  }

  // 行走范围（塌方未清开时挡路）
  const range = scene.walk[p.level];
  if (range) p.x = Math.max(range[0], Math.min(range[1], p.x));
  if (state.collapses && p.level === "under") {
    for (const key of Object.keys(state.collapses)) {
      const c = state.collapses[key];
      if (c.cleared) continue;
      const cx = TF[key].x;
      if (Math.abs(p.x - cx) < 1.2) p.x = cx + Math.sign(p.x - cx || -1) * 1.2;
    }
  }

  // 吸进烟里：呛咳、迈不动步
  if (state.smoke?.active && p.level === "under" && SmokeCovers(state, p.x)) {
    if (!state.beat.chokeT || state.time - state.beat.chokeT > 3) {
      state.beat.chokeT = state.time;
      state.toast = { text: "烟呛得睁不开眼。柱子弓着腰往回退。", t: 2.6 };
    }
    p.x -= Math.sign(input.moveX || 1) * speed * dt * 0.35;
  }

  // 躲藏：p.hidden 是"任何方向都看不见"的强隐身。
  // **静态掩体不再走这条**——它按方向判（见 CoverHides / SoldierSeesPlayer）：
  // 藏是"站到掩体背光的那一面"，兵绕过来你就得绕过去，这才是这一段的玩法。
  p.hidden = false;
  // 移动掩体：贴着板车走，车影就是一段会自己往前挪的墙
  if (state.cart && p.level === "surface"
    && Math.abs(p.x - state.cart.x) < (state.cartCoverR ?? 2.8)) p.hidden = true;
  // 娘把你按下去的那一下：她的身子替你挡住这一段光
  if (state.pressHold) p.hidden = true;
}

function StepFollowers(state, dt) {
  const p = state.player;
  const scene = SceneOf(state);
  for (const a of state.actors) {
    // 不跟着走的人一律落回地面：不清这一下，刚好在垛顶上停止跟随的人会一直悬着
    if (!a.following || !a.visible) { if (a.lift) a.lift = 0; continue; }
    a.level = p.level;
    const targetX = p.x - p.heading * 1.3;
    const d = Math.abs(a.x - targetX);
    if (d > 0.25) {
      const speed = Math.min((a.slow ? 2.6 : 3.8), d * 3);
      const dir = Math.sign(targetX - a.x);
      a.x += dir * speed * dt;
      a.heading = dir;
    }
    // 妹妹铁律的可见一半：镜像玩家的姿态（你蹲她蹲），过翻越物她也翻。
    // 她本就不参与任何暴露判定（探测只看玩家）——失败源只能是柱子本人
    a.crouch = p.crouch;
    // 她翻的是同一垛柴：抬升按到障碍中心的距离连续算——不用给她单独排一套
    // 计时器，跟着走就自然是一条弧（走到一半停下来，她就骑在顶沿上等你）
    let lift = 0, phase = 0.5;
    for (const v of scene.vaults || []) {
      if (v.flag && !state.flags[v.flag]) continue;
      const span = (v.w || 1) / 2 + 0.5;
      const d = Math.abs(a.x - v.x);
      if (d > span) continue;
      // 跟主角同一条规范（VaultLiftFor），只是她按"离墙多远"连续算而不是排时间轴。
      // 妹妹比柱子矮一头多，胯更低，所以同一堵墙她要多抬一点
      const up = (VaultLiftFor(v.top) + 0.12) * Math.sin((1 - d / span) * (Math.PI / 2));
      if (up <= lift) continue;
      lift = up;
      // 动作进度顺着她的行进方向算：还没过中线是撑上去，过了是落下来
      phase = Math.max(0, Math.min(1, 0.5 + ((a.x - v.x) * (a.heading || 1)) / (2 * span)));
    }
    a.lift = lift;
    a.vaultK = phase;
    if (lift > 0.02) { a.pose = "vault"; a.crouch = false; }
    else if (a.pose === "vault") a.pose = null;
  }
}

// 停下来回头照一照。
//
// 有了掩体正反面，"藏"才有得算；但如果灯的方向永远不变，算一次就一劳永逸了。
// 所以巡逻走着走着会停下、把灯举起来顿一下（**预兆**），再转身往回扫一段，
// 扫完转回去接着走。背面会易手，你得跟着绕——这就是这一段真正的动作。
// 危险必须先看得见再生效：那 0.9 秒的举灯就是给玩家看的。
const SCAN_TELL = 0.9;

function StepScan(state, a, dt) {
  if (!a.scanEvery) return false;
  a.scanT = (a.scanT || 0) + dt;
  const phase = a.scanPhase || "walk";
  if (phase === "walk") {
    if (a.scanT < a.scanEvery) return false;
    a.scanPhase = "tell"; a.scanT = 0; a.scanLift = 0;
    Cue(state, "lampOn");
    return true;
  }
  if (phase === "tell") {
    a.scanLift = Math.min(1, a.scanT / SCAN_TELL);
    if (a.scanT >= SCAN_TELL) { a.scanPhase = "back"; a.scanT = 0; a.heading = -(a.heading || 1); }
    return true;
  }
  a.scanLift = 1;
  if (a.scanT >= (a.scanHold ?? 2.0)) {
    a.scanPhase = "walk"; a.scanT = 0; a.scanLift = 0;
    a.heading = -(a.heading || 1);
  }
  return true;
}

function StepSoldiers(state, dt) {
  for (const a of state.actors) {
    if (!IsEnemy(a) || !a.visible || a.cineTarget) continue;
    // 听见动静就过去看：压过巡逻，但不压过过场走位
    if (a.investigate) {
      if (state.time > a.investigate.until) { a.investigate = null; }
      else {
        const d = a.investigate.x - a.x;
        if (Math.abs(d) > 0.5) {
          a.x += Math.sign(d) * (a.speed || 1.2) * 1.5 * dt;
          a.heading = Math.sign(d);
        } else {
          a.heading = a.investigate.face || a.heading;   // 到跟前了就朝着响动那一头看
        }
        continue;
      }
    }
    // 堵路口的哨兵：被石子引开之后要回到自己的岗位、回到原来的朝向。
    // 不收这一下，一颗石子就能把他永久挪走，那道门就再也不是门了
    if (a.postX !== undefined) {
      const d = a.postX - a.x;
      if (Math.abs(d) > 0.2) {
        a.x += Math.sign(d) * (a.speed || 1.2) * dt;
        a.heading = Math.sign(d);
        continue;
      }
      a.x = a.postX;
      if (!a.scanPhase || a.scanPhase === "walk") a.heading = a.postHeading || -1;
    }
    if (StepScan(state, a, dt)) continue;
    // 挨家挨户搜过来的那种：不巡逻，只朝一个方向推，走到掩体就停下翻一翻。
    // 它是压力，不是追兵——推进速度只有人走路的八分之一
    if (a.advance) {
      a.heading = Math.sign(a.advance);
      if ((a.searchPause || 0) > 0) { a.searchPause -= dt; continue; }
      const before = a.x;
      a.x += a.advance * dt;
      for (const c of (SceneOf(state).covers || [])) {
        if ((before - c.x) * (a.x - c.x) <= 0) { a.searchPause = a.searchHold ?? 1.8; break; }
      }
      continue;
    }
    if (!a.patrol) continue;
    if (a.patrolDir === undefined) a.patrolDir = 1;
    a.x += a.patrolDir * a.speed * dt;
    if (a.x >= a.patrol[1]) { a.x = a.patrol[1]; a.patrolDir = -1; }
    if (a.x <= a.patrol[0]) { a.x = a.patrol[0]; a.patrolDir = 1; }
    a.heading = a.patrolDir;
  }
}

function IsEnemy(a) { return a.kind === "soldier" || a.kind === "puppet"; }

export const VISION_RANGE = 15;

// 夜里提着灯笼，人眼只够得着灯照亮的那一截——视距打七折。
// 渲染层画视线光带也用这一个数，画出来的和判出来的必须是同一条线：
// 三个调用点（探测判定、娘的"能不能冲"、渲染层的光带）都从这里取值，
// 所以节拍级的收缩（def.visionScale）也自动在画面上兑现。
export function VisionScale(state) {
  const L = CHAPTERS[state.chapterIndex].light;
  const night = (L === "night" || L === "dark") ? 0.72 : 1;
  return night * (CurrentBeatDef(state)?.visionScale ?? 1);
}

// 掩体判定的"跟前"余量：站在掩体足迹外这么多米以内都算贴着它
export const COVER_PAD = 0.9;
// 钻得进去的掩体没有正反面：人是在沟里、庄稼地里、灌木丛里，不是在它"后面"
const INSIDE_COVERS = new Set(["ditch", "crops", "bush"]);

/**
 * 藏 = 站到掩体**背光的那一面**，不是站进掩体的范围里。
 *
 * 一维横版里"掩体有正反面"是最自然、也最有得算的一条规则：草垛挡的是从它另一侧
 * 照过来的光；兵绕到西边，你就得挪到东边去。老写法是"进了掩体范围就隐身"——找到
 * 掩体之后这一段就再没有可做的事，用户的原话是「一点策略也没有」。
 *
 * threatX = null 表示不问方向（没有明确光源的场合）。高掩体（草垛/齐胸断墙）
 * 站着就挡得住，矮的（柴堆/水瓮）必须蹲下去——这条没变。
 */
export function CoverHides(scene, threatX, x, crouch) {
  for (const c of scene.covers || []) {
    if (Math.abs(x - c.x) >= c.w / 2 + COVER_PAD) continue;
    if (!c.tall && !crouch) continue;
    if (threatX === null || INSIDE_COVERS.has(c.kind)) return true;
    const side = x - c.x;
    // 贴着垛根站（两边都不露）也算；否则必须与光源分处掩体两侧
    if (Math.abs(side) < 0.45 || side * (threatX - c.x) <= 0) return true;
  }
  return false;
}

/** 离 x 最近、且此刻正照着这一带的那个敌人的位置（没有就是 null） */
export function NearestThreatX(state, x, span = 18) {
  let best = null, bestD = Infinity;
  for (const a of state.actors) {
    if (!IsEnemy(a) || !a.visible || a.decor) continue;
    const d = Math.abs(a.x - x);
    if (d > span || d >= bestD) continue;
    bestD = d; best = a.x;
  }
  return best;
}

export function SoldierSeesPlayer(scene, soldier, player, rangeScale = 1) {
  if (player.hidden) return false;
  if ((soldier.level || "surface") !== player.level) return false;
  const dx = player.x - soldier.x;
  if (Math.sign(dx) !== Math.sign(soldier.heading || 1)) return Math.abs(dx) < 1.2;
  const range = (player.crouch ? VISION_RANGE * 0.65 : VISION_RANGE) * rangeScale;
  if (Math.abs(dx) > range) return false;
  // 高遮蔽物挡视线（房屋、高墙）
  for (const pr of scene.props) {
    if ((pr.kind === "house" || pr.kind === "fortWall") && pr.h >= 1.6) {
      const lo = Math.min(soldier.x, player.x), hi = Math.max(soldier.x, player.x);
      if (pr.x - (pr.w || 2) / 2 > lo && pr.x + (pr.w || 2) / 2 < hi) return false;
    }
  }
  // 掩体：只挡背着他的那一面
  if (CoverHides(scene, soldier.x, player.x, player.crouch)) return false;
  return true;
}

function StepDetection(state, def, dt) {
  const scene = SceneOf(state);
  // 刚被退回来的那一秒半不判定。没有这道闸，只要重置点落进任何一个人的视线，
  // 玩家就会在原地被反复抓住——那不是难，是永远也跑不掉。
  // （布防本身要保证重置点是安全的；这道闸是兜底，防的是以后再改坏。）
  if (state.beat.graceT > 0) {
    state.beat.graceT -= dt;
    state.detection.level = 0;
    return;
  }
  let seen = false;
  for (const a of state.actors) {
    // decor 的兵只组队形、不看人：十几个人一起判视线，这段就没法玩了
    if (!IsEnemy(a) || !a.visible || a.decor) continue;
    if (SoldierSeesPlayer(scene, a, state.player, VisionScale(state))) { seen = true; state.detection.spotter = a.id; break; }
  }
  // 被照到不是立刻完蛋：涨满要一两秒，来得及缩回影子里；缩回去消得更快——
  // "差点被看见"该是心跳，不是重开。
  // 但**动得越猛越显眼**：在灯里直着腰快走，一秒半就被喊住；猫着腰不动，
  // 三秒才涨满。没有这一档，最优解永远是「按住方向键一路跑过去」——
  // 蹲下就成了没用的键，掩体也就成了摆设。
  const p = state.player;
  const gain = 0.45 * (p.crouch ? 0.7 : 1) * (p.moving ? 1.5 : 1);
  if (seen) state.detection.level = Math.min(1, state.detection.level + dt * gain);
  else state.detection.level = Math.max(0, state.detection.level - dt * 0.8);
  if (state.detection.level >= 1) {
    state.flags.resets += 1;
    // 失败文案分级：首败无文字，只给视觉复盘（谁看见的，头顶亮一记「！」）；
    // 第二次起才出整句提示——玩家先自己读一遍失败，读不出来再给答案
    state.beat.failN = (state.beat.failN || 0) + 1;
    state.beat.graceT = 1.5;
    const spotterId = state.detection.spotter;
    RestoreSnapshot(state);
    def.onReset?.(state);
    const who = state.actors.find((a) => a.id === spotterId);
    if (who) state.spotFlash = { x: who.x, y: 2.3, t: 2.2 };
    state.toast = state.beat.failN >= 2
      ? { text: def.resetHint || "被发现了。退回来，重新等机会。", t: 4 }
      : null;
  }
}

// ---------------------------------------------------------------------------
// beat 执行器
// ---------------------------------------------------------------------------
function ZoneReached(state, zone) { return InZone(state.player.x, state.player.level, zone); }

function StepGoto(state, def, input) {
  if (def.interruptAt) {
    const start = state.beat.snapshot.player;
    const total = Math.abs(start.x - def.zone.x);
    const left = Math.abs(state.player.x - def.zone.x);
    if (total > 0 && left / total <= 1 - def.interruptAt) { AdvanceBeat(state); return; }
  }
  if (ZoneReached(state, def.zone)) AdvanceBeat(state);
}

function StepGotoSeq(state, def, input) {
  const i = state.beat.spotIndex;
  const spot = def.spots[i];
  if (!spot) { AdvanceBeat(state); return; }
  if (ZoneReached(state, spot)) {
    if (def.notes?.[i]) {
      state.toast = { text: def.notes[i], t: 5 };
      // 乡亲的口信也是情报。原来只弹个 toast 不入账，于是第六章门板上
      // 永远凑不齐互相矛盾的那两条，"自己推出来"那一支从来没上过场。
      state.flags.notesSeen.push(def.notes[i]);
    }
    state.beat.spotIndex += 1;
    if (state.beat.spotIndex >= def.spots.length) AdvanceBeat(state);
  }
}

function StepCollect(state, def, input) {
  const p = state.player;
  const items = state.beat.itemStates;
  if (p.carry === null) {
    for (const it of items) {
      if (it.carried || it.delivered) continue;
      if (Math.abs(p.x - it.x) < 1.6 && p.level === "surface") {
        state.prompt = `E · 扛${def.carryLabel}`;
        if (input.interact) { it.carried = true; p.carry = def.carryLabel; }
        break;
      }
    }
  } else if (ZoneReached(state, def.deliver)) {
    state.prompt = `E · 放下${def.carryLabel}`;
    if (input.interact) {
      const it = items.find((x) => x.carried && !x.delivered);
      if (it) { it.delivered = true; it.carried = false; }
      p.carry = null;
    }
  }
  if (items.every((x) => x.delivered)) AdvanceBeat(state);
}

function StepEscort(state, def, input) {
  if (def.midToast && !state.beat.visited.has("midToast")
    && Math.abs(state.player.x - def.midToast.zone.x) <= def.midToast.zone.w / 2) {
    state.beat.visited.add("midToast");
    state.toast = { text: def.midToast.text, t: 5 };
  }
  const f = FindActor(state, def.follower);
  if (f && !f.following && f.visible) {
    if (Math.abs(state.player.x - f.x) < 2.2 && f.level === state.player.level) {
      state.prompt = "E · 拉住她的手";
      if (input.interact) f.following = true;
    }
  }
  if (f?.following && ZoneReached(state, def.zone || def.dest)) {
    if (Math.abs(f.x - state.player.x) < 4) AdvanceBeat(state);
  }
}

// 某个位置此刻有没有被灯照着。判定用的是探测逻辑同一条视线（连掩体正反面
// 一起算），所以娘的判断、玩家看到的光池、抓人用的那条线永远是同一个东西。
function LitAt(state, x, crouch = false) {
  const scene = SceneOf(state);
  const probe = { x, level: "surface", hidden: false, crouch };
  for (const a of state.actors) {
    if (!IsEnemy(a) || !a.visible || a.decor) continue;
    if (SoldierSeesPlayer(scene, a, probe, VisionScale(state))) return true;
  }
  return false;
}

// 离 x 最近的那处掩体的**背光面**站位（矮掩体连"得蹲下"一起给出来）。
// 娘和玩家用的是同一套规则——她也得躲，这是用户第二条意见的正面回答。
function SafeSpot(state, x, span = 16) {
  const scene = SceneOf(state);
  let best = null, bestD = Infinity;
  for (const c of scene.covers || []) {
    const d = Math.abs(x - c.x);
    if (d > span || d >= bestD) continue;
    const threatX = NearestThreatX(state, c.x);
    const side = threatX === null ? -1 : (Math.sign(c.x - threatX) || 1);
    bestD = d;
    best = { x: c.x + side * (c.w / 2 + 0.4), crouch: !c.tall, cover: c };
  }
  return best;
}

const PRESS_DUR = 0.95;    // 被按住的那一下有多长
const PRESS_CD = 7.5;      // 她不能一路替你躲：两次之间的冷却

// 板车：从村西的黑地里驶出来，一路往东，拐进东头的院子。**单向**。
// 老版让它在两点之间来回横推，等于让玩家站在原地等一辆来回开的公交车
//（用户原话：「就不能马车从远处开过来 直接从左侧出现吗」）。现在它总是从
// 画框左外进来、从右外出去；错过一趟就得另想办法或者等下一趟——这是选择，
// 不是罚站。
function StepConvoy(state, def, dt) {
  const cv = def.convoy;
  if (!cv) return;
  const b = state.beat;
  const driver = def.cartDriver ? FindActor(state, def.cartDriver) : null;
  if (!state.cart) {
    // armAt：玩家走到那段长空地跟前，第一趟车才从远处驶来（不是一开局就在跑）
    if (cv.armAt !== undefined && !b.convoyArmed) {
      if (state.player.x < cv.armAt) { if (driver) driver.visible = false; return; }
      b.convoyArmed = true;
      b.convoyT = 0;
    }
    b.convoyT = (b.convoyT ?? 0) - dt;
    if (driver) driver.visible = false;
    if (b.convoyT <= 0) {
      state.cart = { x: cv.spawn };
      state.cartCoverR = cv.r ?? 2.6;
      b.convoyTrips = (b.convoyTrips || 0) + 1;
    }
    return;
  }
  state.cart.x += (cv.speed ?? 2.4) * dt;
  // 推车的乡亲在车后面顶着走，不是在前面拉
  if (driver) {
    driver.visible = true;
    driver.x = state.cart.x - 2.0;
    driver.heading = 1;
    driver.pose = "push";
    driver.moving = true;
  }
  if (state.cart.x > cv.exit) {
    state.cart = null;
    state.cartCoverR = undefined;
    b.convoyT = cv.gap ?? 7;
    if (driver) { driver.visible = false; driver.pose = null; }
  }
}

// 娘也得躲。她原来站在 covers[] 的坐标上一动不动，被灯照满了也不眨眼——
// 用户的原话是「娘自己不用遮蔽？」。现在她跟玩家一套规则：贴掩体、站背面、
// 矮掩体就蹲下去；灯一走开，她再往东挪一段，永远只领先你几米。
// 她**不再决定你什么时候能动**——那是老版唯一的"玩法"，也是"一点策略也没有"
// 的根。她只是先走一步做给你看。
function StepCompanion(state, def, m, dt) {
  const p = state.player;
  const b = state.beat;
  b.pressCd = Math.max(0, b.pressCd - dt);

  // ① 娘按住你。你在亮地里直着腰站着——她**丢下自己的掩体扑回来**，
  // 一把把你按在垛根底下。这才是"按住"：她的手真的落在你肩上，你的操作
  // 也真的被拿走那一下，而且确实因此没被照见。（老版这句话只是屏幕下方
  // 的一行字，画面上谁也没按住谁——用户的第一句话就是「哪里按住了？」。）
  // 她替你挡的这一下有冷却，而且等她去引开搜村的人，这层保险就没了。
  if (state.pressHold) { m.pose = "press"; m.crouch = true; m.moving = false; return; }
  const inTrouble = !p.crouch && p.level === "surface"
    && (LitAt(state, p.x, false) || state.detection.level > 0.1);
  const gap = p.x - m.x;
  if (b.pressCd <= 0 && inTrouble && Math.abs(gap) < 7.5) {
    // 追到手够得着为止。**别去追"玩家身后 0.62m"那个点**：两个人一交错，
    // 那个点就跳到另一边，她会左右横跳永远够不着（第一版就是这么写坏的）
    if (Math.abs(gap) > 0.60) {
      m.x += Math.sign(gap) * Math.min(6.0 * dt, Math.abs(gap) - 0.5);
      m.heading = Math.sign(gap);
      m.moving = true; m.crouch = false; m.pose = null;
      return;
    }
    state.pressHold = { t: PRESS_DUR, who: m.id };
    b.pressCd = PRESS_CD;
    b.pressN = (b.pressN || 0) + 1;
    m.pose = "press"; m.crouch = true; m.moving = false;
    m.heading = Math.sign(gap) || 1;         // 脸朝着被按的那个孩子
    Cue(state, "sobBreath");
    return;
  }

  // ② 平时：在你前头几米找掩体、自己蹲下——她也得躲
  const behind = gap > 2.0;                  // 你冲到她前头去了：她得赶上来
  const goalX = behind ? p.x - 1.2 : Math.min(def.to, p.x + (def.lead ?? 5));
  const lit = LitAt(state, m.x, m.crouch);
  const spot = lit ? SafeSpot(state, m.x, 12) : null;
  let target = goalX;
  m.crouch = false;
  if (spot) {
    target = spot.x;
    // 到位了就蹲下/贴住；还在路上就先跑到位
    if (Math.abs(m.x - spot.x) < 0.6) { m.crouch = !!spot.crouch; m.x = spot.x; }
  } else if (!behind && LitAt(state, goalX, false)) {
    target = m.x;      // 前面那段正亮着：她不往枪口上撞，就地等
  }
  const d = target - m.x;
  if (Math.abs(d) > 0.25) {
    const speed = spot ? 3.6 : (behind ? 4.4 : 2.3);
    m.x += Math.sign(d) * Math.min(speed * dt, Math.abs(d));
    m.heading = Math.sign(d);
    m.moving = true;
  } else {
    m.moving = false;
    if (!m.crouch) m.heading = 1;
  }
  m.pose = m.pose === "press" && state.pressHold ? "press" : null;
}

// ---------------------------------------------------------------------------
// 掩体推进（第二章的躲避段，2026-08-07 重做）
//
// 老版：娘看准空当就冲，你跟上；屏幕下方写着"娘按住你——等这一段的光挪开"，
// 而画面上谁也没按住谁。玩家全程只按一个方向键。
//
// 这一版把三件事交回玩家手里：
//   ① **藏在哪一面**——掩体有正反，兵绕过来你就得绕过去（CoverHides）；
//   ② **什么时候动**——巡逻会举灯、停步、回头扫，节奏看得见（StepScan）；
//   ③ **拿什么换窗口**——扔石子把人引开 / 等板车的影子 / 硬等；而西边搜家的
//      队伍在一路往东推，硬等是有代价的。
// 娘变成同伴：自己找掩体、自己蹲下，只在你贴着她又还站着的时候真的把你按下去。
// ---------------------------------------------------------------------------
function StepCoverRun(state, def, input, dt) {
  const b = state.beat;
  const p = state.player;
  const m = def.leader ? FindActor(state, def.leader) : null;

  if (b.checkIndex === undefined) {
    b.checkIndex = 0;
    b.furthestX = p.x;
    b.pressCd = 0;
    b.stuckT = 0;
    if (m) m.x = Math.max(m.x, p.x + 2.5);
  }

  StepConvoy(state, def, dt);

  // 搜家的队伍：慢，但不停。它永远落在玩家走过的最远处之后 leash 米——
  // 是压力，不是前后夹击（重置点必须是安全的，那是拿事故换来的铁律）。
  b.furthestX = Math.max(b.furthestX, p.x);
  if (def.pressure) {
    const s = FindActor(state, def.pressure.id);
    if (s) s.x = Math.min(s.x, b.furthestX - (def.pressure.leash ?? 9));
  }

  // 走过一处掩体就存一次点：失败退回这儿，不是退回整段开头
  const checks = def.checkpoints || [];
  while (b.checkIndex < checks.length && p.x > checks[b.checkIndex] + 1.2) {
    b.checkIndex += 1;
    b.snapshot = SnapshotPositions(state);
  }

  if (m) StepCompanion(state, def, m, dt);

  if (p.x >= def.to - 1.2) { AdvanceBeat(state); return; }

  // 状态行只在真的卡住时才出（没有键名、不替玩家做判断）。
  // 光带、举起来的灯、娘的动作已经把该说的都说了。
  if (Math.abs(p.x - b.hintX0) < 1.5) b.stuckT += dt; else { b.stuckT = 0; b.hintX0 = p.x; }
  if (b.stuckT > 14) state.prompt = def.stuckHint || null;
}

function StepLeadFollow(state, def, dt) {
  const leader = FindActor(state, def.leader);
  if (!leader) { AdvanceBeat(state); return; }
  const wps = def.waypoints;
  if (state.beat.spotIndex >= wps.length) { AdvanceBeat(state); return; }
  const wp = wps[state.beat.spotIndex];
  const near = Math.abs(leader.x - state.player.x) < 7;
  if (near) {
    const d = Math.abs(leader.x - wp.x);
    if (d < 1.2) {
      state.beat.spotIndex += 1;
      // 每过一个路口存一次点：走了大半段被灯照满，退回来的是最近的路口，
      // 不是整段开头——失败的代价是"这一步"，不是"这一路"
      state.beat.snapshot = SnapshotPositions(state);
      if (state.beat.spotIndex >= wps.length) { AdvanceBeat(state); return; }
    } else {
      const dir = Math.sign(wp.x - leader.x);
      leader.x += dir * 2.4 * dt;
      leader.heading = dir;
    }
  }
}

function StepLead(state, def, input) {
  const group = state.actors.filter((a) => a.group === def.group && a.visible);
  const anyLoose = group.some((a) => !a.following && !a.evacuated);
  if (anyLoose) {
    const near = group.find((a) => !a.following && Math.abs(a.x - state.player.x) < 2.4 && a.level === state.player.level);
    if (near) {
      state.prompt = "E · 招呼他们跟上";
      if (input.interact) for (const a of group) a.following = true;
    }
  }
  if (group.length && group.every((a) => a.following)) {
    const allNear = group.every((a) => InZone(a.x, a.level, def.dest));
    if (ZoneReached(state, def.dest) && allNear) {
      for (const a of group) { a.following = false; a.settled = true; }
      AdvanceBeat(state);
    }
  }
}

function StepObserve(state, def, dt) {
  const i = state.beat.spotIndex;
  const spot = def.spots[i];
  if (!spot) { AdvanceBeat(state); return; }
  if (ZoneReached(state, spot) && state.player.crouch) {
    state.beat.holdProgress += dt;
    state.prompt = "观察中…";
    state.promptFill = Math.min(1, state.beat.holdProgress / def.watchTime);
    if (state.beat.holdProgress >= def.watchTime) {
      if (def.notes?.[i]) state.flags.notesSeen.push(def.notes[i]);
      state.beat.holdProgress = 0;
      state.beat.spotIndex += 1;
      const done = state.beat.spotIndex >= def.spots.length;
      // "学会看"这件事得让玩家看见。原来是蹲够五秒弹一条 toast 把结论念出来，
      // 现在切一个插入镜头到他正望着的那个东西上——note 仍旧入账供第六章推理用。
      if (def.watchCine?.[i]) StartMicroCine(state, def.watchCine[i]);
      else if (def.notes?.[i]) state.toast = { text: "柱子记下：" + def.notes[i], t: 5.5 };
      if (done) AdvanceBeat(state);
    }
  } else if (ZoneReached(state, spot)) {
    state.prompt = "C · 蹲下";
  } else {
    state.beat.holdProgress = 0;
  }
}

function StepHold(state, def, input, dt) {
  if (!ZoneReached(state, def.zone)) return;
  state.prompt = def.holdPrompt || `按住 E · ${def.objective}`;
  state.promptFill = state.beat.holdProgress / def.holdTime;
  // sustain=保持一个状态（贴着听、按住不动）——量的是时间本身，长按是诚实的。
  // 其余都是对物体做功：走拟物笔画（def.stroke，c7 撬地沿是往上扳）
  let g;
  if (def.sustain) {
    g = input.interactHeld ? dt : 0;
  } else {
    g = StrokeWork(state, state.beat.strokeMem || (state.beat.strokeMem = {}), input, dt, {
      hold: def.holdTime, stroke: def.stroke,
      at: { x: def.zone.x, y: def.gestureY, baseY: def.zone.level === "under" ? UNDER_Y : SURFACE_Y },
    });
  }
  if (g > 0) {
    state.beat.holdProgress += g;
    if (state.beat.holdProgress >= def.holdTime) {
      if (def.note) state.toast = { text: def.note, t: 4.5 };
      AdvanceBeat(state);
    }
  } else if (state.beat.holdProgress > 0 && !input.interactHeld) {
    state.beat.holdProgress = Math.max(0, state.beat.holdProgress - dt * 2);
  }
}

function StepBuildSpots(state, def, input, dt) {
  for (let i = 0; i < def.spots.length; i += 1) {
    const s = def.spots[i];
    if (state.beat.spotDone[i]) continue;
    if (ZoneReached(state, s.zone)) {
      // 有的工位上先躺着一样东西。挖翻口的位置就是大爷和顺子没出来的位置——
      // 先把烟袋拾起来，再动土。两章之间的账，用一个弯腰接上，不用字幕
      if (s.pickup && !state.beat.pickedUp?.[i]) {
        state.prompt = `E · ${s.pickup.prompt}`;
        if (input.interact) {
          if (!state.beat.pickedUp) state.beat.pickedUp = {};
          state.beat.pickedUp[i] = true;
          state.toast = { text: s.pickup.toast, t: 5 };
        }
        break;
      }
      state.prompt = `按住 E · ${s.label}`;
      state.promptFill = state.beat.spotProgress[i] / s.holdTime;
      if (input.interactHeld) {
        state.beat.spotProgress[i] += dt;
        if (state.beat.spotProgress[i] >= s.holdTime) {
          state.beat.spotDone[i] = true;
          state.toast = { text: s.note, t: 4.5 };
          if (s.zone === TV.hiddenSpot) state.flags.hiddenBuilt = true;
          if (s.zone === TV.trapSpot) state.flags.trapBuilt = true;
        }
      }
      break;
    }
  }
  if (state.beat.spotDone.every(Boolean)) AdvanceBeat(state);
}

function StepDigSeq(state, def, input, dt) {
  state.beat.quakeT += dt;
  const cycle = def.quakeInterval + (state.flags.route === "ground" ? 4 : 0);
  const phase = state.beat.quakeT % cycle;
  state.beat.quakeWarn = phase > cycle - 3.0;
  state.beat.quakeActive = phase > cycle - 2.5;

  const keys = ["collapse1", "collapse2"];
  const key = keys[state.beat.digIndex];
  if (!key) { AdvanceBeat(state); return; }
  const c = state.collapses[key];
  const zone = TF[key];

  // 连夜掏的段全是虚土：不先支根顶木，挖一下塌一下。
  // 顶木在旁洞里——扛着它爬过低段，是这条路收的过路钱。
  if (def.shore && !c.shored) {
    const sp = def.shore[key];
    const p = state.player;
    if (p.item?.id === "beam") {
      if (ZoneReached(state, zone)) {
        state.prompt = "E · 支上顶木";
        if (input.interact) {
          c.shored = true;
          p.item = null;
          state.toast = { text: "顶木咬住了虚土。可以动手了。", t: 3.5 };
        }
      }
      return;
    }
    if (Math.abs(p.x - sp.beamX) < 1.9 && p.level === "under") {
      state.prompt = "E · 扛起顶木";
      if (input.interact) GiveItem(state, { id: "beam", label: "顶木", big: true });
    } else if (ZoneReached(state, zone)) {
      state.prompt = "虚土会塌——得先从旁洞扛根顶木来支上";
    }
    return;
  }

  if (ZoneReached(state, zone)) {
    if (state.beat.quakeActive) {
      state.prompt = "！头顶有动静——停下，别出声";
      state.gesture = null;
      c.progress = Math.max(0, c.progress - dt * 0.3);
    } else {
      // 清土是一铲一铲挖出来的：往下拽一下=挖一铲（键盘按住 E 是后备）
      state.prompt = "按住 E · 清土";
      state.promptFill = c.progress / def.holdTime;
      const g = StrokeWork(state, state.beat.strokeMem || (state.beat.strokeMem = {}), input, dt, {
        hold: def.holdTime, stroke: "down",
        at: { x: zone.x, baseY: UNDER_Y },
      });
      if (g > 0) {
        c.progress += g;
        if (c.progress >= def.holdTime) {
          c.cleared = true;
          state.beat.strokeMem = null;
          state.toast = { text: "土清开了。前面的路通了。", t: 3 };
          state.beat.digIndex += 1;
          if (state.beat.digIndex >= keys.length) AdvanceBeat(state);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 烟（一维推进）：front 从东向西移动，x > frontX 的区域已被烟占据
// ---------------------------------------------------------------------------
function StepSmoke(state, dt) {
  const s = state.smoke;
  // 翻口是水封，不是缓冲：烟推到弯前就到头了。第四章没有翻口，所以人没救回来；
  // 第五章挖了，所以这一次守得住——这一章的改造在这里兑现。
  if (s.trapAt !== null && s.frontX <= s.trapAt) {
    s.frontX = s.trapAt;
    if (!s.trapHeld) {
      s.trapHeld = true;
      state.toast = { text: "烟撞在翻口的水面上，翻了几下，没能过来。", t: 4.5 };
    }
    return;
  }
  s.frontX -= s.speed * dt;
}

export function SmokeCovers(state, x) {
  return !!state.smoke?.active && x >= state.smoke.frontX;
}

// 熄灯：一盏盏吹灭，最后一盏留在自己手里
function StepDouseLamps(state, def, input) {
  if (!state.lamps) {
    state.lamps = def.lamps.map((x) => ({ x, lit: true }));
    state.toast = { text: "铃响了。头顶的脚步就在磨盘那一片。", t: 3.5 };
  }
  // 被烟吞掉的灯，烟自己会把它压灭——玩家手慢了不该因为够不着灯而卡死
  for (const l of state.lamps) {
    if (l.lit && SmokeCovers(state, l.x)) {
      l.lit = false;
      if (!state.beat.smokeDoused) {
        state.beat.smokeDoused = true;
        state.toast = { text: "烟漫过来，把东头那盏灯压灭了。", t: 3 };
      }
    }
  }
  const remaining = state.lamps.filter((l) => l.lit);
  if (remaining.length <= 1) {
    // 最后一盏在顺子手里。他把灯递给柱子——这是顺子在这个游戏里唯一一次
    // 和玩家交手；下一拍他回身进烟里，玩家手里提着的就是他给的灯。
    const shunzi = FindActor(state, "shunzi");
    const lampX = remaining[0]?.x ?? state.player.x;
    if (shunzi && !state.beat.lampHanded) {
      shunzi.visible = true;
      // 走位指令只下一次。每帧重设的话：他一到位指令被清、又立刻被设回去，
      // "已到位"永远不成立，递灯的提示一辈子出不来
      if (!state.beat.shunziSent) {
        state.beat.shunziSent = true;
        if (Math.abs(shunzi.x - lampX) > 0.9) { shunzi.cineTarget = { x: lampX + 0.7 }; shunzi.cineSpeed = 2.6; }
      }
      if (Math.abs(state.player.x - shunzi.x) < 1.7) {
        state.prompt = "E · 接过灯";
        if (input.interact) {
          state.beat.lampHanded = true;
          for (const l of state.lamps) l.lit = false;
          state.player.lamp = true;
          state.toast = { text: "顺子把灯柄塞进柱子手里：『你提着。你认路。』", t: 4.5 };
          AdvanceBeat(state);
        }
      }
      return;
    }
    for (const l of state.lamps) l.lit = false;
    state.player.lamp = true;
    if (def.note) state.toast = { text: def.note, t: 4.5 };
    AdvanceBeat(state);
    return;
  }
  const near = remaining.find((l) => Math.abs(l.x - state.player.x) < 1.8);
  if (near) {
    state.prompt = "E · 吹灭灯";
    if (input.interact) near.lit = false;
  }
}

function StartFlood(state) {
  state.smoke = null;
  state.flood = { active: true, sourceX: 148, t: 0 };
  const n = SCENES.tunnelVillage.zones;
  state.actors = state.actors.filter((a) => a.kind !== "villager");
  state.actors.push(
    MakeActor("fl1", "villager", n.chamberA.x, { level: "under", label: "困住的乡亲" }),
    MakeActor("fl2", "villager", n.chamberA.x + 2, { level: "under", label: "困住的乡亲", slow: true }),
    MakeActor("fl3", "villager", n.chamberB.x + 3, { level: "under", label: "抱孩子的大嫂", slow: true }),
  );
  state.player.x = 96;
  state.player.level = "under";
  state.player.lamp = true;
}

// 灌水：水深由流体解算回灌，站在深水里会被冲散
function StepFloodRescue(state, def, input) {
  const dest = def.dest || TV.entW;
  const villagers = state.actors.filter((a) => a.kind === "villager" && a.visible && !a.evacuated);
  const loose = villagers.find((a) => !a.following && Math.abs(a.x - state.player.x) < 2.8);
  if (loose) {
    state.prompt = "E · 招呼他们跟上";
    if (input.interact) {
      for (const a of villagers) {
        if (!a.following && Math.abs(a.x - state.player.x) < 3.6) a.following = true;
      }
    }
  }
  for (const a of villagers) {
    if (InZone(a.x, a.level, dest)) { a.evacuated = true; a.following = false; a.visible = false; }
  }
  // 水深超过腰就站不住（深度由渲染层的解算回灌）
  const depth = state.floodDepth || 0;
  if (depth > 1.15) {
    state.flags.resets += 1;
    RestoreSnapshot(state);
    for (const v of state.actors.filter((x) => x.kind === "villager")) {
      v.following = false; v.evacuated = false; v.visible = true;
    }
    if (state.flood) state.flood.t = 0;
    state.toast = { text: def.resetHint, t: 4 };
    return;
  }
  if (villagers.length === 0) AdvanceBeat(state);
}

function StepSmokeEscape(state, def, input) {
  const dest = def.dest || TV.entW;

  // 第四章的注定失去：拴柱大爷半路腿软。
  // 这里原来是纯脚本：大爷必死，玩家只能看——可前一分钟游戏才教过他
  // "烟碰到人=失手重来"，两套规则打架，失去读起来像自己手慢。
  // 现在把选择交到玩家手上：可以背起大爷，但背着他走不快、也腾不出手
  // 招呼别人——试过一次就会明白"救一个还是带三个"不是旁白说的，是手感。
  if (def.lossScript) {
    const elder1 = FindActor(state, "elder1");
    const shunzi = FindActor(state, "shunzi");
    if (!state.beat.lossStage && elder1?.following && elder1.x < 92) {
      state.beat.lossStage = 1;
      state.beat.lossT = state.beat.t;
      elder1.following = false;
      elder1.scripted = true;
      elder1.pose = "kneel";           // 坐在道口，就地
      state.toast = { text: "拴柱大爷腿一软，坐在了道口。", t: 4 };
    }
    // 坐着等：玩家可以背他
    if (state.beat.lossStage === 1 && elder1 && !state.beat.carryElder) {
      if (Math.abs(state.player.x - elder1.x) < 1.7) {
        state.prompt = "E · 背起大爷";
        if (input.interact) {
          state.beat.carryElder = true;
          elder1.pose = null;
          elder1.following = true;
          elder1.scripted = false;
          // 背上一个人，手就腾不出来了：跟着的其他人只能原地等
          for (const a of state.actors) {
            if (a.kind === "villager" && a.id !== "elder1") a.following = false;
          }
          state.toast = { text: "大爷伏在柱子背上，轻得吓人。", t: 3.5 };
        }
      }
      // 玩家往前走远了，或耗得太久：顺子回身去背——原来的时序从这儿接上
      const waited = state.beat.t - state.beat.lossT;
      if (state.player.x < elder1.x - 8 || waited > 12) {
        state.beat.lossStage = 1.5;
        elder1.cineTarget = { x: 112 };   // 退回藏人洞·甲；烟约 45s 追到，吞没时序才成立
        elder1.cineSpeed = 0.9;
        elder1.pose = null;
        if (shunzi) {
          shunzi.visible = true;
          shunzi.scripted = true;
          shunzi.x = Math.max(60, state.player.x - 6);
          shunzi.cineTarget = { x: 112 };
          shunzi.cineSpeed = 3.2;
        }
        state.toast = { text: "顺子从后面追了上去：『你们先走！』", t: 5 };
      }
    }
    if (state.beat.lossStage === 1.5) {
      // 烟追上他们时才隐去——两个人影消失在烟里
      const gone = [elder1, shunzi].every((a) => !a || !a.visible || SmokeCovers(state, a.x));
      if (gone || state.beat.t - state.beat.lossT > 50) {
        state.beat.lossStage = 2;
        if (elder1) { elder1.visible = false; elder1.cineTarget = null; }
        if (shunzi) { shunzi.visible = false; shunzi.cineTarget = null; }
      }
    }
  }

  const villagers = state.actors.filter((a) => a.kind === "villager" && a.visible && !a.evacuated && !a.scripted);
  // 大爷坐下之后就不再是"招呼跟上"的对象（他有自己的 E·背起提示）；
  // 坐下之前照常招呼——他得先跟上、走到半路，腿才会软
  const elderDown = (id) => id === "elder1" && state.beat.lossStage;
  const loose = villagers.find((a) => !a.following && !elderDown(a.id) && Math.abs(a.x - state.player.x) < 2.6);
  if (loose && !state.prompt) {
    if (state.beat.carryElder) {
      state.prompt = "背着大爷，腾不出手招呼人";
    } else {
      state.prompt = "E · 招呼他们跟上";
      if (input.interact) {
        for (const a of villagers) {
          if (!a.following && !elderDown(a.id) && Math.abs(a.x - state.player.x) < 3.4) a.following = true;
        }
      }
    }
  }
  // 到出口的人爬出去
  for (const a of villagers) {
    if (InZone(a.x, a.level, dest)) { a.evacuated = true; a.following = false; a.visible = false; }
  }
  // 烟追上未撤离的人 → 重置
  for (const a of villagers) {
    if (SmokeCovers(state, a.x)) {
      state.flags.resets += 1;
      state.smoke.frontX = 150;
      state.smoke.trapHeld = false;
      const carried = state.beat.carryElder;
      RestoreSnapshot(state);
      state.beat.lossStage = 0;
      state.beat.carryElder = false;
      for (const v of state.actors.filter((x) => x.kind === "villager")) {
        v.following = false; v.evacuated = false; v.scripted = false; v.cineTarget = null; v.pose = null;
        v.visible = v.id !== "shunzi" || !def.lossScript;
      }
      state.toast = {
        text: carried
          ? "背上大爷，就顾不上还能走的人。大爷推开了他的手——先把能走的带出去。"
          : def.resetHint,
        t: 5,
      };
      return;
    }
  }
  const remaining = state.actors.filter((a) => a.kind === "villager" && !a.scripted
    && !(def.lossScript && a.id === "shunzi") && !a.evacuated);
  if (remaining.length === 0) AdvanceBeat(state);
}

// 划线：玩家攥着的是一支真的石笔，不是一根进度条。
//
// **这一拍长在一张铺满画框的手绘特写卡里**（`state.scribeCard` → Art 的
// DrawScribeCard）。原因是量出来的：世界里那支笔只有 9 厘米，就算镜头推到
// 1.9 米的特写，它在 1400px 宽的屏幕上也只有十来个像素——玩家根本按不着，
// 于是只能去拖旁边那条 QTE 轨道，"攥住一支笔"就退化成了拖 slider。
// 插入卡这个景别（爹的手攥着家伙什、木头的纹、正在长出来的那道印，各占半个
// 画框）本来就是这一下该有的画面，把交互直接放进去：手指按住画面里那支笔，
// 拖着它蹭过木头。**这一拍不许有任何 HUD 轨道**（见下面的 dragTrack 断言）。
//
// 三条规矩让它成为"一支笔"而不是一个滑块：
//   ① **得先攥住它**——按下去那一下，手必须落在画面里那支笔上（SCRIBE_CARD.grabR
//      之内）。在画面别处一拖，笔不动。这是"控制一支笔"与"拖一根 slider"
//      最根本的区别。攥住的那一点还会被记下来（grabOff），笔不会"跳"到指尖。
//   ② **笔有摩擦**——笔尖跟着手走，但每秒最多蹭 SCRIBE_CARD.speed 那么多画宽。
//      手甩得再快，笔也只能一寸一寸蹭过去，那点滞后就是石笔压在木头上的手感。
//   ③ **会脱手**——手抬得太高或垂得太低（离刻线超过 slipV），笔就从手里滑掉，
//      印子当场断在那儿。想划直，手就得贴着木头走。
//
// 印子（drawn）只在笔尖真正压着木头蹭过的地方累积，往回蹭不会擦掉——
// 这才是石笔留下的痕，不是一个可增可减的进度值。
//
// 叙事上是爹在划——所以爹必须真的走过来、伸手够到门框（pose="mark"）；
// 玩家手里控制的是那支石笔。让玩家亲手把这道线拉出来，比看一张插画卡重。

// 特写卡的版面：Core（判定）与 Art（作画）共用这一套归一化坐标。
// u 沿卡宽、v 沿卡高，卡的长宽比固定 16:9（World 按画框铺满，两边溢出裁掉）。
export const SCRIBE_CARD = {
  aspect: 16 / 9,
  u0: 0.505, u1: 0.855,   // 笔尖行程：木头正面那 15 公分，占三分之一个画宽
  v: 0.455,               // 刻线高度
  // 攥握点（拳心）相对笔尖的偏移。手从左上压下来——笔杆要是横在刻线那一头，
  // 拳头就把刚划出来的印子全盖住了（Art 的 DrawScribeCard 里写着为什么）。
  gripDU: -0.114, gripDV: -0.189,
  grabR: 0.105,           // 攥得住的判定半径（按卡宽；圆形，v 折算成同尺度）
  slipV: 0.19,            // 手飘离**该在的握把高度**这么远，笔脱手（按卡高）
  speed: 0.26,            // 笔尖最快蹭多快（卡宽/秒）
};
export const SCRIBE_BINS = 56;   // 印子分这么多格记深浅（见 b.press）

function StepScribe(state, def, input, dt) {
  const b = state.beat;
  if (b.drawn === undefined) {
    b.drawn = 0;
    b.head = 0;
    // 印子的深浅一格一格记下来：手慢压得实、手快是虚的。记住而不是每帧照
    // 当前手速重画整条线——已经划下的那一段不该再变，那才是"痕"。
    b.press = new Array(SCRIBE_BINS).fill(0);
    def.onStart?.(state);
  }
  const inZone = Math.abs(state.player.x - def.zone.x) < (def.zone.w || 3) / 2 + 1.2;
  if (!inZone) {
    state.prompt = "";
    state.scribe = null;
    state.scribeCard = null;
    b.grabbed = false;
    return;
  }

  const y = def.markY ?? 1.25;
  const x0 = def.markX0 ?? (def.zone.x - 0.52);
  const x1 = def.markX1 ?? (def.zone.x + 0.52);
  const span = x1 - x0;

  const L = SCRIBE_CARD;
  const uSpan = L.u1 - L.u0;
  const tipU = L.u0 + b.head * uSpan;

  // 手落在卡上的位置（World.ScreenToCard 换算好的归一化坐标）
  const pc = input.pointerCard;
  const held = !!input.pointerHeld && !!pc;
  // ① 攥住：只认按下去那一帧，且手得落在画面里那支笔上
  if (held && !b.wasHeld) {
    const gu = tipU + L.gripDU, gv = L.v + L.gripDV;
    // v 是按卡高归一的，要折成卡宽的尺度才能量一个圆
    const d = Math.hypot(pc.u - gu, (pc.v - gv) / L.aspect);
    b.grabbed = d < L.grabR;
    // 攥住的是笔身上的哪一点就记住哪一点：笔不会"跳"到指尖底下
    if (b.grabbed) { b.grabOff = pc.u - tipU; Cue(state, "pickup", { gain: 0.3 }); }
  }
  if (!held) b.grabbed = false;
  b.wasHeld = held;
  // ③ 脱手：手飘离该在的握把高度太远（手要贴着木头走，线才划得直）
  if (b.grabbed && Math.abs(pc.v - (L.v + L.gripDV)) > L.slipV) b.grabbed = false;

  const prevHead = b.head;
  let onWood = false;
  if (b.grabbed) {
    // ② 笔跟着手走，但一帧只挪得动 speed×dt
    const wantU = pc.u - (b.grabOff || 0);
    const target = Math.max(0, Math.min(1, (wantU - L.u0) / uSpan));
    const step = (L.speed * dt) / uSpan;
    b.head += Math.max(-step, Math.min(step, target - b.head));
    onWood = true;
  }
  // 键盘后备（自动通关测试也走这条）：按住 E 往一边推
  const keyHeld = input.interactHeld || input.interact;
  if (!b.grabbed && keyHeld && Math.abs(input.moveX) > 0.05) {
    b.head += Math.sign(input.moveX) * dt * (def.speed || 0.5);
    onWood = true;
  }
  b.head = Math.max(0, Math.min(1, b.head));
  const prevDrawn = b.drawn;
  b.drawn = Math.max(b.drawn, b.head);
  b.everMoved = b.everMoved || b.head > 0.02;
  // 新蹭出来的那几格，按当下的手速定深浅（慢=1，快≈0.45）——记一次就不再改
  if (b.drawn > prevDrawn) {
    const uSpeed = dt > 0 ? (b.head - prevHead) / dt : 0;
    const press = 1 - Math.min(0.55, Math.abs(uSpeed) * 0.55);
    for (let i = Math.floor(prevDrawn * SCRIBE_BINS); i < Math.ceil(b.drawn * SCRIBE_BINS); i += 1) {
      if (i >= 0 && i < SCRIBE_BINS && !b.press[i]) b.press[i] = press;
    }
  }

  // 沙沙声：只在笔真的蹭动时响，一粒一粒按蹭过的距离出（不是定时循环），
  // 于是手快声音就密、手停声音就断——听觉跟着手走
  const moved = Math.abs(b.head - prevHead) * span;
  const speed = dt > 0 ? moved / dt : 0;
  b.scratchAcc = (b.scratchAcc || 0) + (onWood ? moved : 0);
  if (b.scratchAcc > 0.04) {
    b.scratchAcc = 0;
    Cue(state, "scribe", { gain: 0.55 + Math.min(0.45, speed) });
  }
  // 脱手是有代价的一下：断在哪儿看得见，还得给一声
  if (!b.grabbed && b.wasGrabbed && held) Cue(state, "drop", { gain: 0.28 });
  b.wasGrabbed = b.grabbed;

  // 第八章他自己刻：抬臂比着框（第一章是爹在划，玩家是被量的那个）
  if (def.selfMark) FlashPose(state, "mark", 0.3);
  state.prompt = null;   // 引导由那支笔自己给（会晃、会脱手），不占中间那条提示
  // 世界里那一份是替补：卡永远铺满画框盖着它，只有卡没画出来时才露脸
  state.scribe = {
    x: def.zone.x, y, x0, x1,
    t: b.drawn, head: b.head,
    gripped: onWood,                       // 笔尖压在木头上
    reaching: held && !b.grabbed,          // 手按下了却没抓着笔 → 笔晃一下招呼
    idle: !b.everMoved,
    speed,
  };
  // 这一拍的全部画面与全部 UI 就是这张卡：铺满画框的手、笔、木头。
  state.scribeCard = {
    head: b.head, drawn: b.drawn, press: b.press,
    gripped: onWood && b.grabbed,          // 真攥在手里压着木头
    keying: onWood && !b.grabbed,          // 键盘后备在推
    reaching: held && !b.grabbed,          // 手按下了却没抓着笔
    idle: !b.everMoved,
    speed: dt > 0 ? Math.abs(b.head - prevHead) / dt : 0,   // 卡宽/秒的量纲
    selfMark: !!def.selfMark,              // 第八章是他自己的手
    oldMark: !!state.flags.marked,         // 门框上那道旧刻痕已经在了
  };
  if (b.drawn >= 1) {
    if (def.note) state.toast = { text: def.note, t: 4.5 };
    state.scribe = null;
    state.scribeCard = null;
    AdvanceBeat(state);   // onDone 由它统一调，这里再调一次就成了两遍
  }
}

// 按顺序做完几个动作。用来把"该由玩家亲手做"的事从过场里拿回来——
// 第七章顶点处松开妹妹的手、接过灯，这两下由脚本代劳和由玩家按下去，
// 是完全不同的两件事。
function StepActSeq(state, def, input) {
  const b = state.beat;
  if (b.stepIndex === undefined) b.stepIndex = 0;
  const st = def.steps[b.stepIndex];
  if (!st) { AdvanceBeat(state); return; }
  const near = Math.abs(state.player.x - st.x) < (st.r || 1.6)
    && (state.player.level || "surface") === (st.level || "surface");
  if (!near) { state.prompt = ""; return; }
  if (st.walk) { st.on?.(state); b.stepIndex += 1; return; }
  state.prompt = st.prompt;
  if (input.interact) {
    st.on?.(state);
    if (st.toast) state.toast = { text: st.toast, t: 4.5 };
    b.stepIndex += 1;
  }
}

// 情报板：把收集到的 note 一条条钉上去。凑齐互相矛盾的两条之后，
// 才允许玩家把记号钉在它们中间——那一下就是"他自己看出来了"。
function StepMapBoard(state, def, input) {
  const b = state.beat;
  if (!b.pinned) { b.pinned = 0; b.deduced = false; }
  const notes = state.flags.notesSeen;
  const inZone = Math.abs(state.player.x - def.zone.x) < 1.6
    && (state.player.level || "surface") === (def.zone.level || "surface");
  if (!inZone) { state.prompt = ""; return; }

  if (b.pinned < notes.length) {
    state.prompt = `E · 钉上一条（${b.pinned}/${notes.length}）`;
    if (input.interact) {
      // 停留久一点：这是玩家唯一能读到这条情报内容的地方
      state.toast = { text: notes[b.pinned], t: 7 };
      b.pinned += 1;
    }
    return;
  }
  // 两条对不上的都在板上了，才给推理这一下
  const hasBoth = def.contradiction.every((k) => notes.some((n) => n.includes(k)));
  if (hasBoth && !b.deduced) {
    // 明说是哪两条：玩家读到的是几条一闪而过的 toast，不点名等于让他猜
    state.prompt = "E · 钉在一起";
    if (input.interact) {
      b.deduced = true;
      state.flags.deduced = true;
      state.toast = { text: def.deduction, t: 6 };
    }
    return;
  }
  state.prompt = "E · 交给高传宝";
  if (input.interact) AdvanceBeat(state);
}

// 注定失败的按住：进度只涨到 cap 就再也上不去，时间一到必然松脱。
// 手感上要让玩家真的在"使劲"——按住时涨，但涨到接近上限就开始往回掉，
// 松手掉得更快。玩家不会怀疑自己没按对，只会知道抓不住。
function StepDoomedHold(state, def, input, dt) {
  const b = state.beat;
  if (b.grip === undefined) {
    b.grip = 0; b.t = 0; b.drag = 0;
    state.toast = null;          // 上一拍的提示别赖在这一场上
    def.onStart?.(state);
  }
  b.t += dt;
  // 头顶的探杆：周期一次比一次密，逼你一次次停手。土清不完的真正原因是
  // 时间不在你这边，不是你手慢
  if (def.probe) {
    const k = Math.min(1, b.t / def.duration);
    const cycle = def.probe.from + (def.probe.to - def.probe.from) * k;
    b.quakeActive = (b.t % cycle) > cycle - 1.15;
  }
  const pressing = input.interactHeld || input.interact;
  const held = pressing && !b.quakeActive;
  if (b.quakeActive) {
    // 探杆下来还硬刨，声音会把人招来——不停手是要付代价的，
    // 否则"必须停手"就成了一句空话，玩家迟早会发现按着不放毫无区别
    if (pressing) {
      b.grip = Math.max(0, b.grip - 1.4 * dt);
      state.detection.level = Math.min(1, state.detection.level + 0.5 * dt);
    }
    b.grip = Math.max(0, b.grip - 0.5 * dt);
  } else if (held) {
    // 越接近上限，往回掉的分量越重
    const strain = Math.max(0, b.grip - def.cap * 0.55) * 1.35;
    b.grip = Math.min(def.cap, b.grip + (0.55 - strain) * dt);
  } else {
    b.grip = Math.max(0, b.grip - 0.75 * dt);
  }
  // 不给百分比：一个封了顶、永远到不了 100 的进度条，只会让玩家以为是自己手慢。
  // 用力到什么程度由画面说——妹妹被拽开的距离、土面刨下去又塌回来。
  state.prompt = b.quakeActive ? "…探杆就在头顶。停手，别出声" : def.prompt;
  state.promptFill = b.quakeActive ? 0 : b.grip / def.cap;

  // 让进度条不只是个数字：抓得越牢，她被拖走得越慢——但一直在走。
  // 手里那点距离就是进度条本身。
  if (def.pull) {
    const a = FindActor(state, def.pull.actor);
    if (a) {
      b.drag = Math.min(1, b.drag + (1 - b.grip * 0.75) * dt / def.duration);
      a.x = def.pull.from + (def.pull.to - def.pull.from) * b.drag;
      a.heading = def.pull.to >= def.pull.from ? 1 : -1;
    }
  }
  if (b.t >= def.duration) {
    def.onFail?.(state);
    state.toast = { text: def.failToast || "抓不住。", t: 3.5 };
    AdvanceBeat(state);
  }
}

function StepRescueLoop(state, def, input, dt) {
  const trapped = state.actors.filter((a) => a.pocket && a.visible && !a.evacuated);
  // 手边有几个人，一趟就能带几个
  const leadCap = state.flags.route === "ground" ? 1 : 3;

  // 探杆：预兆→落定→宽限
  // 代价只留一项：手边人少、一趟只能带一个（见 SpawnRescueSquad）。
  // 探杆周期不再跟着变——三项一起惩罚，选地面就纯粹是受罪。
  const cycle = 9.5;
  state.rescue.quakeT += dt;
  const phase = state.rescue.quakeT % cycle;
  state.beat.quakeWarn = phase > cycle - 2.9;
  state.beat.quakeActive = phase > cycle - 2.2;
  const graceOver = phase > cycle - 1.8;
  if (state.beat.quakeWarn && !state.beat.quakeActive) {
    state.prompt = "…头顶的土簌簌往下掉";
  }
  if (state.beat.quakeActive) {
    state.prompt = "！探杆就在头顶——站住，别出声";
    if (Math.abs(input.moveX) > 0.1 && graceOver) {
      const followers = trapped.filter((a) => a.following);
      if (followers.length) {
        for (const a of followers) {
          a.following = false;
          a.cineTarget = { x: TF[a.pocket].x };
          a.cineSpeed = 2.8;
        }
        state.toast = { text: "头顶的探杆停住了。乡亲们吓得缩回了旁洞。", t: 4 };
        state.rescue.quakeT = 0;
      }
    }
  }

  if (!state.rescue.dialogueShown.has("pocketB")) {
    const nearB = trapped.some((a) => a.pocket === "pocketB" && Math.abs(a.x - state.player.x) < 3);
    if (nearB) {
      state.rescue.dialogueShown.add("pocketB");
      StartMicroCine(state, [
        // 特意沿用第三章高传宝认出他时的景别（3.4 / 3.2）：同一个构图出现两次——
        // 头一回他是被认出来的孩子，这一回他是被指望的那个人
        { stage: "扶着民兵的老人抬起头，借着灯光认出了他。", d: 3.2, cam: { kind: "shot", x: 92, y: UNDER_Y + 1.3, dist: 5 } },
        { who: "老人", say: "梁家的柱子？你妹妹呢？", d: 3.0, cam: { kind: "ots", subject: "trapB1", other: "player", dist: 3.4 } },
        { who: "柱子", say: "送出去了。", d: 2.6, cam: { kind: "ots", subject: "player", other: "trapB1", dist: 3.2 } },
        { stage: "老人松了一口气。", d: 2.4, cam: { kind: "ots", subject: "trapB1", other: "player", dist: 3.4 } },
      ]);
      return;
    }
  }
  const followingNow = trapped.filter((a) => a.following).length;
  const room = leadCap - followingNow;
  const loose = trapped.find((a) => !a.following && !a.cineTarget && Math.abs(a.x - state.player.x) < 2.6);
  if (loose) {
    if (!state.beat.quakeActive && !state.beat.quakeWarn) {
      state.prompt = room > 0 ? "E · 带他们走" : "手上顾不过来了——先把这个送出去";
    }
    if (input.interact && room > 0) {
      let left = room;
      for (const a of trapped) {
        if (left <= 0) break;
        if (!a.following && Math.abs(a.x - state.player.x) < 3.4) {
          a.following = true; a.cineTarget = null; left -= 1;
        }
      }
    }
  }
  for (const a of trapped) {
    if (a.following && InZone(a.x, a.level, TF.fieldEnt)) {
      a.evacuated = true; a.following = false; a.visible = false;
      state.rescue.delivered.add(a.id);
    }
  }
  const left = state.actors.filter((a) => a.pocket && !a.evacuated);
  if (left.length === 0) AdvanceBeat(state);
}

// ---------------------------------------------------------------------------
// HUD / 测试辅助
// ---------------------------------------------------------------------------
export function GetObjective(state) {
  if (state.phase !== "playing") return null;
  return CurrentBeatDef(state)?.objective || null;
}

export function GetHint(state) {
  if (state.phase !== "playing") return null;
  return CurrentBeatDef(state)?.hint || null;
}

export function GetBeatTarget(state) {
  const def = CurrentBeatDef(state);
  if (!def) return null;
  const p = state.player;
  const withLevel = (zone, action = "walk") => ({ action, x: zone.x, level: zone.level || "surface" });
  switch (def.kind) {
    case "cinematic": return { action: "advance" };
    case "choice": return { action: "choice" };
    case "goto": return withLevel(def.zone);
    case "gotoSeq": {
      const s = def.spots[state.beat.spotIndex];
      return s ? withLevel(s) : null;
    }
    case "collect": {
      if (p.carry) return { action: "interactAt", x: def.deliver.x, level: def.deliver.level || "surface" };
      const it = state.beat.itemStates.find((x) => !x.carried && !x.delivered);
      return it ? { action: "interactAt", x: it.x, level: "surface" }
        : { action: "interactAt", x: def.deliver.x, level: def.deliver.level || "surface" };
    }
    case "escort": {
      const f = FindActor(state, def.follower);
      if (f && !f.following && f.visible) return { action: "interactAt", x: f.x, level: f.level };
      const dest = def.zone || def.dest;
      return withLevel(dest);
    }
    case "leadFollow": {
      const leader = FindActor(state, def.leader);
      return leader ? { action: "walk", x: leader.x, level: leader.level } : null;
    }
    // 娘不再是节拍器：终点是村东那头，一路往东走就是了（掩体、石子、板车
    // 都是玩家的选择，驱动器只验"走得到"）
    case "coverRun": return { action: "walk", x: def.to, level: "surface" };
    case "lead": {
      const group = state.actors.filter((a) => a.group === def.group && a.visible);
      const looseA = group.find((a) => !a.following);
      if (looseA) return { action: "interactAt", x: looseA.x, level: looseA.level };
      return withLevel(def.dest);
    }
    case "observe": {
      const s = def.spots[state.beat.spotIndex];
      return s ? { action: "crouchAt", x: s.x, level: s.level || "surface" } : null;
    }
    case "hold": return { action: "holdAt", x: def.zone.x, level: def.zone.level || "surface" };
    // 自动通关只要一直按住就行——反正按住也留不住她
    case "doomedHold": return { action: "holdAt", x: state.player.x, level: state.player.level };
    case "mapBoard": return { action: "interactAt", x: def.zone.x, level: def.zone.level || "surface" };
    // 自动通关：按住 E 同时往前推就行
    case "scribe": return { action: "scribeAt", x: def.zone.x, level: "surface" };
    case "actSeq": {
      const st = def.steps[state.beat.stepIndex || 0];
      if (!st) return null;
      return { action: st.walk ? "walk" : "interactAt", x: st.x, level: st.level || "surface" };
    }
    case "buildSpots": {
      const i = state.beat.spotDone.findIndex((d) => !d);
      // 工位上有没捡的东西：先按一下 E 拾起来，再按住施工
      if (i >= 0 && def.spots[i].pickup && !state.beat.pickedUp?.[i]) {
        return { action: "interactAt", x: def.spots[i].zone.x, level: def.spots[i].zone.level || "under" };
      }
      if (i < 0) return null;
      const z = def.spots[i].zone;
      return { action: "holdAt", x: z.x, level: z.level || "surface" };
    }
    case "digSeq": {
      const keys = ["collapse1", "collapse2"];
      const key = keys[state.beat.digIndex];
      if (!key) return null;
      const c = state.collapses[key];
      if (def.shore && !c.shored) {
        if (p.item?.id === "beam") return { action: "interactAt", x: TF[key].x, level: "under" };
        return { action: "interactAt", x: def.shore[key].beamX, level: "under" };
      }
      return { action: "holdAt", x: TF[key].x, level: "under", pauseOnQuake: true };
    }
    case "plane": {
      // 自动通关：站到工位上，按住 E 一趟一趟地推（到头了掉头拖回来）
      return {
        action: "planeAt", x: def.zone.x - 0.55, level: "surface",
        back: !!state.planing?.returning,
      };
    }
    case "chain": {
      const st = def.steps[state.beat.stepIndex || 0];
      if (!st) return null;
      switch (st.type) {
        case "pickup": return { action: "interactAt", x: st.x, level: st.level || "surface" };
        case "drop": return { action: "interactAt", x: st.zone.x, level: st.zone.level || "surface" };
        case "pickupGround": {
          if (p.item?.id === st.item.id) return null;   // 已在手里，这一步自己会步进
          const g = state.groundItems.find((it) => it.id === st.item.id);
          const gx = g ? g.x : state.flags[st.flagX];
          return typeof gx === "number" ? { action: "interactAt", x: gx, level: "surface" } : null;
        }
        case "use": return { action: st.hold ? "holdAt" : "interactAt", x: st.zone.x, level: st.zone.level || "surface" };
        // 打结：按住 E 的键盘后备路径就能缠满 + 勒紧
        // 打结没有长按后备（用户明令删掉），驱动器只能真的绕圈——
        // 所以给它一个专门的动作，把圆心与半径一并交出去
        case "knot": return {
          action: "knotAt", x: st.zone.x, level: st.zone.level || "surface",
          cx: st.zone.x, cy: SURFACE_Y + (st.knotY ?? 1.5), r: 0.45,
        };
        case "throwHit":
          if (!p.item) return { action: "interactAt", x: st.pickupX, level: "surface" };
          return { action: "throwAt", x: st.target.x - 6, level: "surface", face: 1 };
        case "talk": {
          const a = FindActor(state, st.actor);
          return a ? { action: "interactAt", x: a.x, level: a.level || "surface" } : null;
        }
        case "push": return { action: "pushAt", x: state.cart ? state.cart.x : st.from, dir: st.dir };
        case "goto": return { action: "walk", x: st.zone.x, level: st.zone.level || "surface" };
        case "winch": {
          const w = state.beat.winch;
          if (w && !w.hooked) return { action: "interactAt", x: st.zone.x, level: st.zone.level || "surface" };
          return { action: "winchAt", x: st.zone.x, level: st.zone.level || "surface" };
        }
        default: return null;
      }
    }
    case "cartRide":
      return { action: "walk", x: state.cart ? state.cart.x : def.from, level: "surface" };
    case "floodRescue": {
      const pool = state.actors.filter((a) => a.kind === "villager" && a.visible && !a.evacuated);
      const loose = pool.find((a) => !a.following);
      if (loose) return { action: "interactAt", x: loose.x, level: "under" };
      if (pool.length) return { action: "walk", x: (def.dest || TV.entW).x, level: "under" };
      return null;
    }
    case "douseLamps": {
      const lit = (state.lamps || []).filter((l) => l.lit);
      if (lit.length <= 1) {
        // 最后一盏在顺子手里：走到他跟前接过来
        const shunzi = FindActor(state, "shunzi");
        if (shunzi && shunzi.visible) return { action: "interactAt", x: shunzi.x, level: "under" };
        return null;
      }
      return { action: "interactAt", x: lit[0].x, level: "under" };
    }
    case "smokeEscape": {
      const dest = def.dest || TV.entW;
      const pool = state.actors.filter((a) => a.kind === "villager" && a.visible && !a.evacuated && !a.scripted
        && !(def.lossScript && a.id === "shunzi"));
      const loose = pool.find((a) => !a.following);
      if (loose) return { action: "interactAt", x: loose.x, level: "under" };
      if (pool.some((a) => a.following)) return { action: "walk", x: dest.x, level: "under" };
      return null;
    }
    case "rescueLoop": {
      const anyFollowing = state.actors.some((a) => a.pocket && a.visible && !a.evacuated && a.following);
      if (anyFollowing) return { action: "walk", x: TF.fieldEnt.x, level: "under" };
      const loose = state.actors.find((a) => a.pocket && a.visible && !a.evacuated && !a.following);
      if (loose) return { action: "interactAt", x: loose.x, level: "under" };
      return null;
    }
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// 调试跳转：直接落到任意一章的任意一幕
//
// 前序各幕不真跑，只把它们「结算」掉：过场逐行触发 on()（人该进场就进场），
// 走位一次落位，玩法段按 kind 补上它真正改过的那几个 flag。做不到与正常
// 流程逐帧一致，但目标幕开场时该在的人、该建好的工事、该选过的分支都在。
// ---------------------------------------------------------------------------
function BeatLabel(def) {
  if (def.objective) return def.objective;
  if (def.kind === "cinematic") {
    const first = (def.lines || []).find((l) => l.stage || l.say);
    if (first) return first.stage || `${first.who || ""}：${first.say}`;
    return "过场";
  }
  if (def.kind === "choice") return def.prompt || "抉择";
  return def.prompt || def.id;
}

/** 某一章的分幕清单（调试面板用） */
export function ChapterBeatList(chapterIndex) {
  const ch = CHAPTERS[chapterIndex];
  if (!ch) return [];
  return (SCRIPTS[ch.id] || []).map((def, index) => ({
    index, id: def.id, kind: def.kind, label: BeatLabel(def),
  }));
}

// 这一幕结束时玩家应该站在哪儿。跳幕时不把他挪过去的话，下一幕会用上一幕的
// 起点开场——最难看的一种是"目的地就在脚下"，escort 刚进就自动完成。
function SettleDest(def) {
  switch (def.kind) {
    case "goto": case "hold": case "mapBoard": case "scribe": case "plane": return def.zone;
    case "escort": case "lead": case "smokeEscape": case "floodRescue": return def.dest;
    case "leadFollow": return def.waypoints?.[def.waypoints.length - 1];
    case "coverRun": return def.to === undefined ? null : { x: def.to, w: 5 };
    case "gotoSeq": case "observe": return def.spots?.[def.spots.length - 1];
    case "buildSpots": return def.spots?.[def.spots.length - 1]?.zone;
    case "digSeq": return def.spots?.[def.spots.length - 1];
    case "actSeq": {
      const s = def.steps?.[def.steps.length - 1];
      return s ? { x: s.x, level: s.level } : null;
    }
    case "chain": {
      // 链的落点是最后一步动手的地方
      const s = def.steps?.[def.steps.length - 1];
      if (!s) return null;
      if (s.zone) return s.zone;
      if (s.x !== undefined) return { x: s.x, level: s.level };
      if (s.target) return { x: s.target.x, level: "surface" };
      return null;
    }
    case "cartRide": return { x: def.to, level: "surface" };
    default: return null;
  }
}

function SettleBeat(state, def) {
  const dest = SettleDest(def);
  if (dest && dest.x !== undefined) {
    state.player.x = dest.x;
    if (dest.level) state.player.level = dest.level;
  }
  switch (def.kind) {
    case "cinematic": {
      const lines = state.beatLines || def.lines || [];
      for (let i = Math.max(0, state.beat.lineIndex); i < lines.length; i += 1) lines[i].on?.(state);
      // 让 cineTarget 一次走到位（大步长空转，而不是把人瞬移过去——
      // cineVanish 这类到点才触发的效果还得照常发生）
      for (let i = 0; i < 300; i += 1) StepCineActors(state, 0.25);
      break;
    }
    case "buildSpots":
      for (const s of def.spots) {
        if (s.zone === TV.hiddenSpot) state.flags.hiddenBuilt = true;
        if (s.zone === TV.trapSpot) state.flags.trapBuilt = true;
      }
      break;
    case "choice":
      state.flags.route = def.options?.[0]?.key || "tunnel";
      state.beat.choiceMade = state.flags.route;
      break;
    case "observe":
    case "gotoSeq":
      for (const n of def.notes || []) if (n) state.flags.notesSeen.push(n);
      break;
    case "mapBoard":
      state.flags.deduced = true;
      break;
    // 跳过刨料：完工旗照落——门扇雏形（doorLeafWip）靠它现身
    case "plane":
      state.flags.planedOnce = true;
      if (def.doneFlag) state.flags[def.doneFlag] = true;
      break;
    // 跳过一条链，就等于这条链上每一步都做过了：旗标要落、口信要入账
    // （第六章的推理要用），手里那格清空——东西都已经用出去了。
    case "chain":
      for (const st of def.steps || []) {
        if (st.noteAdd) state.flags.notesSeen.push(st.noteAdd);
        st.effect?.(state);
      }
      // drop/pickupGround 这对步骤在结算里相互抵消：东西最后不在地上
      for (const st of def.steps || []) if (st.type === "drop") state.flags[st.storeIn] = null;
      // 链上经手的东西结算后也不该躺在地上（半路自由放下的一并收走）
      {
        const ids = new Set();
        for (const st of def.steps || []) {
          if (st.itemId) ids.add(st.itemId);
          if (st.item?.id) ids.add(st.item.id);
          if (st.needs) ids.add(st.needs);
        }
        state.groundItems = state.groundItems.filter((g) => !ids.has(g.id));
      }
      state.player.item = null;
      break;
    case "cartRide":
      state.cart = { x: def.to };
      break;
    default:
      break;
  }
}

/**
 * 跳到 chapterIndex 章的 beatIndex 幕，直接进入 playing（不放章节卡）。
 * 返回落地的 beat id。
 */
export function DebugJump(state, chapterIndex, beatIndex = 0) {
  const ci = Math.max(0, Math.min(chapterIndex, CHAPTERS.length - 1));
  // 先把前面各章整章结算一遍。情报、旗标、抉择是跨章累积的——第六章门板上
  // 要对上的那两条，一条来自第三章问乡亲，一条来自第六章观察；只结算本章的话
  // 跳过去永远凑不齐，"自己推出来"那一支在调试里根本走不到。
  for (let c = 0; c < ci; c += 1) {
    StartChapter(state, c);
    state.phase = "playing";
    const past = SCRIPTS[CHAPTERS[c].id];
    let g = 0;
    while (state.beatIndex < past.length && g < 400) {
      g += 1;
      const def = CurrentBeatDef(state);
      if (!def) break;
      SettleBeat(state, def);
      AdvanceBeat(state);
    }
  }
  StartChapter(state, ci);
  state.phase = "playing";
  const script = CurrentScript(state);
  const target = Math.max(0, Math.min(beatIndex, script.length - 1));
  let guard = 0;
  while (state.beatIndex < target && guard < 400) {
    guard += 1;
    const def = CurrentBeatDef(state);
    if (!def) break;
    SettleBeat(state, def);
    AdvanceBeat(state);
  }
  state.caption = null;
  state.toast = null;
  state.microCine = null;   // 结算里 effect 起的小过场别漏进跳到的这一幕
  state.prompt = null;
  state.promptFill = null;
  state.scribe = null;
  state.scribeCard = null;
  state.planeCard = null;
  state.knot = null;
  state.gesture = null;
  state.closeUp = null;
  state.canDrop = false;
  state.bubbleFlash = null;
  state.spotFlash = null;
  state.pip = null;
  state.detection = { level: 0, spotter: null };
  // 结算过程里可能留下没走完的走位指令与一次性姿势，别让它们接管玩家刚接手的这一幕
  for (const a of state.actors) { a.cineTarget = null; a.cineSpeed = undefined; }
  state.player.cineWalk = null;
  ClearPoses(state);
  return CurrentBeatDef(state)?.id || null;
}
