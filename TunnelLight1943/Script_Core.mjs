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

// 上下梯子。井有 3.6 米深（SURFACE_Y→UNDER_Y），按人爬梯子的真速度给时长：
// 下去顺着重力快些，上来是费力气的活。**这段时间里人是在梯子上的**，
// 高度由 p.lift 插值（见 MovePlayer 里的爬梯分支），不是换个层数就完事。
// 扶稳门扇（第一场"修门"）。下门轴跳出臼窝，整扇吊在上轴上自己往外坠；
// 玩家的手真的按在门板上，把它顶回门框正位，爹才使得上劲礅轴。
// 数值都按一扇 1.83m 高、0.83m 宽的木门给。
const DOOR_H = 1.50;         // 门扇高（米）＝ 手能按到的那一片有多长（对齐门框净空）
const DOOR_SAG = 0.26;       // 撒手之后它歪到哪儿（弧度，约 15°，下沿外坠 0.47m）
// 容差按"门下沿允许晃多少"定：±0.10 弧度 ≈ 下沿 ±18cm。
// 别定得比操作还细——上一版 0.055 配一个凭空的换算臂，等于要玩家按像素对准。
const DOOR_TOL = 0.10;
const DOOR_GRAB_R = 0.62;    // 手落在门板上的判定半宽（半扇门 + 一点富余）
const DOOR_SPEED = 1.05;     // 门跟手走的角速度上限（弧度/秒）——一扇木门，甩不动
const DOOR_FALL = 0.62;      // 撒手之后往外坠的角速度
const DOOR_KEY = 0.42;       // 键盘后备：按住 E 把门扶正的角速度
// 这一拍必须推特写：默认跟随景别 12.6m 宽，一扇 0.83m 的门在手机上才 55 像素，
// 又是"要按住它、还要稳住"的活——按不着也稳不住（刨子那次就是这么被退回的）
const DOOR_CAM = { y: 1.15, hw: 2.6 };

const CLIMB_DOWN = 1.5;
const CLIMB_UP = 2.0;
const LADDER_RUNG = 0.34;    // 横档间距：每挪过一档响一声，声音跟着人走

// 层数当帧就翻（碰撞/视线/玩法一律按目的层算，不留半层的中间态），
// 渲染高度另走 p.lift 从原来那层缓过去。两件事分开，玩法才不会出现"半层人"。
function StartClimb(state, toLevel, dur) {
  const p = state.player;
  const fromY = p.level === "under" ? UNDER_Y : SURFACE_Y;
  const destY = toLevel === "under" ? UNDER_Y : SURFACE_Y;
  p.level = toLevel;
  p.climbT = dur;
  p.climbDur = dur;
  p.climbFrom = fromY;
  p.lift = fromY - destY;
  p.rung = 0;
  p.moving = false;
  p.crouch = false;           // 梯子上不猫腰：进地道那一下的弓背等落地再说
  p.pose = null;              // 手上的活到梯子这儿一律让位给爬的姿势
  Cue(state, "ladder", { gain: 0.5 });
}

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
// ---------------------------------------------------------------------------
// 接绳（把断了的井绳和找来的麻绳接上）
//
// 这一拍改过一次，原因值得写死在这儿：**绕圈是缠辘轳轴的动作，不是接绳的动作**
//（用户 2026-08-08：「链接麻绳为什么也是转圈圈？不太合理」）。真接两根绳是
// 把一头**穿过**另一头挽出的圈，再顺着绳往外一拉，结自己收死——一个连贯动作，
// 中间没有"绕"。
//
// 于是玩法＝攥住麻绳头，顺着绳自己能走的那条路拖：
//   起手(左下) → 贴到圈边 → **从圈眼里穿过去** → 另一侧钻出来 → 一路往外拉勒紧
// 路线坐标是相对断头挂点 (cx, cy) 的米数（x 右、y 上）。
// **判定与作画共用这一份**，World 里绝不许另抄一套（同石笔/刨子那条规矩）。
const KNOT_PATH = [
  [-0.66, -0.30],   // 麻绳头起手：垂在断头左下
  [-0.42, -0.16],
  [-0.19, -0.03],   // 贴到圈边
  [0.00, 0.06],     // 圈眼正中：穿过去
  [0.18, -0.02],    // 从另一侧钻出来
  [0.33, -0.20],
  [0.52, -0.42],    // 往外拉，结开始收
  [0.74, -0.63],    // 拉到底：勒死
];
// 整套结的尺寸系数。井架横杆上的辘轳（WINCH_HUB_Y 1.43）与井口台沿之间
// 只有半米出头的空当，结得塞进这个空当里——大了就骑在辘轳上，两团木色
// 叠在一起谁也看不清
const KNOT_SCALE = 0.78;
export const KNOT_EYE = { x: 0, y: 0.06 * KNOT_SCALE, r: 0.15 * KNOT_SCALE };   // 断头挽出的那个圈（作画用；导出是为了 World 不另抄一份）
// 弧长参数化：拖动按**路径上的最近点**驱动，不是按位移量累加——
// 位移量拖哪儿都涨，那就又变成一根看不见的 slider 了
const KNOT_ARC = (() => {
  const seg = [];
  let total = 0;
  for (let i = 0; i < KNOT_PATH.length - 1; i += 1) {
    const d = Math.hypot(KNOT_PATH[i + 1][0] - KNOT_PATH[i][0], KNOT_PATH[i + 1][1] - KNOT_PATH[i][1]);
    seg.push(d);
    total += d;
  }
  const acc = [0];
  for (let i = 0; i < seg.length; i += 1) acc.push(acc[i] + seg[i]);
  return { seg, acc, total };
})();
// 绳头钻出圈眼那一刻的弧长比例：过了它才算"穿好了"，之后拉的都是在收紧
export const KNOT_THREAD_U = KNOT_ARC.acc[4] / KNOT_ARC.total;
const KNOT_GRAB_R = 0.22;     // 攥住绳头的判定半径（特写下约 60px，手指够得着）
const KNOT_SLIP_R = 0.30;     // 手飘离绳子走向这么远就脱手
const KNOT_SPEED = 1.05;      // 绳有分量：一秒最多走全程的这么多，甩不快

/** 路径上 u(0..1) 处的点，相对断头挂点的米数 */
export function KnotPointAt(u) {
  const s = Math.max(0, Math.min(1, u)) * KNOT_ARC.total;
  for (let i = 0; i < KNOT_ARC.seg.length; i += 1) {
    if (s <= KNOT_ARC.acc[i + 1] || i === KNOT_ARC.seg.length - 1) {
      const t = KNOT_ARC.seg[i] > 1e-6 ? (s - KNOT_ARC.acc[i]) / KNOT_ARC.seg[i] : 0;
      const a = KNOT_PATH[i], bb = KNOT_PATH[i + 1];
      return [(a[0] + (bb[0] - a[0]) * t) * KNOT_SCALE, (a[1] + (bb[1] - a[1]) * t) * KNOT_SCALE];
    }
  }
  const last = KNOT_PATH[KNOT_PATH.length - 1];
  return [last[0] * KNOT_SCALE, last[1] * KNOT_SCALE];
}

/** 指尖落点投到路径上：{ u, dist }。dist = 垂直偏离，用来判脱手 */
function KnotProject(xM, yM) {
  const x = xM / KNOT_SCALE, y = yM / KNOT_SCALE;
  let best = { u: 0, dist: Infinity };
  for (let i = 0; i < KNOT_ARC.seg.length; i += 1) {
    const a = KNOT_PATH[i], bb = KNOT_PATH[i + 1];
    const vx = bb[0] - a[0], vy = bb[1] - a[1];
    const len2 = vx * vx + vy * vy;
    const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / len2)) : 0;
    const px = a[0] + vx * t, py = a[1] + vy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best.dist) best = { u: (KNOT_ARC.acc[i] + KNOT_ARC.seg[i] * t) / KNOT_ARC.total, dist: d * KNOT_SCALE };
  }
  return best;
}

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
// 拉绳定向的那根麻绳（c1_ropeline）：一根真的绳，不是两点之间一根棍。
//
// 这一拍的玩法是"量出两家之间有多远"。玩家记住"统共四五步"靠的不是那句台词，
// 是手上这根绳一路的分量：从小周脚边的盘上一庹一庹放出来、松的那截拖在土上
// 沙沙响、人一停它晃两下、最后几步猛地离地绷成一条直线，再往前一寸也走不动。
// **绳拉直之前必须一直有物理**——不然量距就只是走过去按个键。
//
// 解算是最朴素的 verlet 质点链（存位置与上一帧位置，约束靠松弛迭代）：
//   ① 放绳量 pay 每帧朝「当前跨度 + 一庹富余」收敛，封顶在绳全长 ROPE_LEN。
//      **全部手感都从这一条来**：绳不是凭空变长的，是从盘上放出来的，放完就
//      没了。放绳还有速度上限——猛跑会先绷一下、拽你一把，绳才跟上来。
//   ② 质点吃重力；贴到地面那截有摩擦，会被土蹭住（没有这一条，松绳像丝绸
//      一样滑，拖不出"绳躺在地上被人拖着走"的样子）。
//   ③ 松弛把节间距拉回 pay/(N−1)，两头钉死。跨度超过 pay 时**让步的是人不是绳**
//      ——麻绳不会伸长，会把人拽住。
//
// 另一头在谁手上由世界状态**每帧推**，不靠步骤记账：手里 → 撂在地上 → 钉在
// 七叔家墙根，三种情况各自钉一个点。玩家有权随时撂下手里的东西，绳得跟着认。
// ---------------------------------------------------------------------------
const ROPE_N = 30;              // 质点数：18 米绳节间约 0.6 米，垂下来才有绳样
const ROPE_LEN = 18.6;          // 绳全长（米）。梁家后墙 35.1 → 七叔家墙根，
                                // 走到头正好只剩一点余量：绷直那一下就在门口发生
const ROPE_G = 12;              // 重力：比真值大一点，麻绳垂得利落，不飘
const ROPE_DAMP = 0.982;        // 空气阻尼（verlet 的速度保留系数）
const ROPE_FRIC = 0.55;         // 贴地那截的摩擦：拖在土上会被蹭住
// 约束松弛遍数。高斯-赛德尔一遍只把信息传一个节点，30 个质点要想让"绷直"从
// 手上一路传回锚点，遍数不能小气——给 8 遍的那一版，绳明明拉到头了却还整条
// 赖在地上（span 已等于 pay，几何上必须是直线，是解算没跟上）。**遍与遍之间
// 换方向扫**，一来一回把两头的约束都推到底，收敛快一个数量级。
const ROPE_RELAX = 24;
// 张力承重：真绳绷紧时垂度 ≈ 自重×跨度²/(8×张力)，张力一上来重量就被绳自己
// 吃住了。质点链里没有张力这个量，只好用绷紧度反推——不补这一项，绳明明
// 拉到了头（span 等于 pay）却还整条趴在土里：18.6 米的跨度只要多出 27 厘米，
// 中间就垂下去一米多，而松弛解算的残余正好是这个量级。指数取大是为了让它
// **只在最后那一段**起作用，前面拖地的分量一点不减。
const ROPE_TENSION_P = 24;
const ROPE_SLACK = 1.25;        // 松着走时小周手上留的富余（米）——约一庹
// 富余的收窄速度：绳快放完时，松的那截自己一点点被抻走。
// 分母是量出来的——要的是"最后两米绳离地、绷成一条线"，早了绳一路飘着不落地
// （拖地的沙沙劲就没了），晚了绷直只发生在最后一帧，玩家眼里就是"啪"地一跳。
const ROPE_TIGHTEN = 25;
const ROPE_PAY_OUT = 6.5;       // 放绳速度上限（米/秒）：跑得比它快就会先绷一下
const ROPE_PAY_IN = 1.5;        // 收绳速度：往回走时松的那截收得慢，先堆在地上
const ROPE_TAUT = 0.985;        // 跨度/放绳量过了它就算绷直
const ROPE_HAND = { fwd: 0.28, y: 0.94 };   // 绳头攥在手里的位置（相对玩家）
const ROPE_RECOIL = 0.55;       // 脱手回弹：绳缩回小周手里要这么久
const ROPE_ITEM = "ropeEnd";

// 绳头攥在手里时的世界坐标。**取身位，不取骨架手心**——这一条踩过坑：
// 手心听起来更准，但它是姿势的产物，而姿势又被绳拽出来（ropeHaul 把胳膊
// 收到身后半米）。拿它当绳的终点，就成了"绳→姿势→手心→绳"的闭环：人会
// 在离七叔家还有两米多的地方被自己的胳膊卡死，而且 Node 里没有骨架，
// 单测和实机还两个结果。物理只认身位；绳梢接到真拳头上是**画面**的活
// （见 Script_World 里 inHand 那一段）。
function RopeHandAt(state) {
  const p = state.player;
  return {
    x: p.x + (p.heading || 1) * ROPE_HAND.fwd,
    y: SURFACE_Y + ROPE_HAND.y - (p.crouch ? 0.28 : 0),
  };
}

/** 质点沿两端连线铺开——省得第一帧从一个点炸开 */
function RopeInitPts(rope, ex, ey) {
  rope.pts = [];
  for (let i = 0; i < ROPE_N; i += 1) {
    const t = i / (ROPE_N - 1);
    const x = rope.x0 + (ex - rope.x0) * t;
    const y = rope.y0 + (ey - rope.y0) * t;
    rope.pts.push({ x, y, px: x, py: y });
  }
  rope.pay = Math.max(0.5, Math.hypot(ex - rope.x0, ey - rope.y0));
}

// 绳头脱手：一头钉在小周手上的绳，跟着人钻不进地道。硬画的话它会从地面穿进
// 地道剖面里——这套 2.5D 最不能出的错。现实里也一样：人往下一出溜，绳头就
// 从手里出去了，另一头的人把绳收回去。所以链退回"抓住绳头"那一步，重来一遍。
function RopeSlipAway(state, def, rope) {
  const hand = RopeHandAt(state);
  rope.recoil = 0;
  rope.recoilFrom = { x: hand.x, y: SURFACE_Y + 0.25 };
  state.player.item = null;
  state.toast = { text: "绳头脱了手——小周把绳收了回去。上去重拽一遍。", t: 4.5 };
  Cue(state, "drop", { gain: 0.7 });
  Cue(state, "whoosh", { gain: 0.35, rate: 1.4 });
  const i = def?.steps?.findIndex((s) => s.type === "pickup" && s.item?.id === ROPE_ITEM);
  if (i !== undefined && i >= 0 && state.beat) state.beat.stepIndex = i;
}

/** 每帧解一次绳。state.ropeLine 由节拍立起来，渲染层照着 pts 画 */
function StepRopeLine(state, def, dt) {
  const rope = state.ropeLine;
  if (!rope) return;
  const p = state.player;
  const h = Math.min(dt, 1 / 30);          // 掉帧时别让 g·dt² 把绳炸上天
  rope.L = rope.L ?? ROPE_LEN;

  // ── 另一头钉在哪儿 ──
  let end = null, held = false;
  if (rope.recoil !== undefined) {
    // 回弹：绳头往锚点缩，缩完剩一盘绳躺在小周脚边
    rope.recoil += dt;
    const k = Math.min(1, rope.recoil / ROPE_RECOIL);
    const e = 1 - (1 - k) * (1 - k);
    end = {
      x: rope.recoilFrom.x + (rope.x0 - rope.recoilFrom.x) * e,
      y: rope.recoilFrom.y + (rope.y0 - rope.recoilFrom.y) * e,
    };
    if (k >= 1) { rope.recoil = undefined; rope.recoilFrom = null; }
  } else if (rope.x1 !== undefined) {
    end = { x: rope.x1, y: rope.y1 };      // 钉在七叔家墙根了
  } else {
    const g = state.groundItems.find((it) => it.id === ROPE_ITEM);
    if (g) end = { x: g.x, y: SURFACE_Y + 0.10 };          // 玩家撂地上了
    else if (p.item?.id === ROPE_ITEM) {
      if ((p.level || "surface") !== "surface") { RopeSlipAway(state, def, rope); return; }
      end = RopeHandAt(state);
      held = true;
    } else end = { x: rope.x0, y: rope.y0 };               // 谁都没拿：盘在原处
  }

  if (!rope.pts) RopeInitPts(rope, end.x, end.y);

  // ── 放绳量：绳是从盘上放出来的，放完就没了 ──
  const Anchor = (pt) => Math.hypot(pt.x - rope.x0, pt.y - rope.y0);
  let span = Anchor(end);
  rope.inHand = held;      // 渲染层据此把绳梢接到真拳头上
  // 盘上还剩多少绳。剩得越少，小周越把绳拎紧——富余按剩量的平方收窄，
  // 于是"一路拖在土上 → 最后两米离地 → 到墙根绷成一条线"是自己走出来的
  const left = Math.max(0, rope.L - span);
  const slack = Math.min(ROPE_SLACK, left * left / ROPE_TIGHTEN);
  // 钉死两头之后绳是被抻紧的，不再留富余——留了就在两家之间挂出个弯月亮
  const want = rope.recoil !== undefined ? 0.6
    : rope.x1 !== undefined ? span * 1.004
      : Math.min(rope.L, span + slack);
  const rate = want > rope.pay ? ROPE_PAY_OUT : (rope.recoil !== undefined ? 14 : ROPE_PAY_IN);
  rope.pay += Math.max(-rate * h, Math.min(rate * h, want - rope.pay));
  rope.pay = Math.min(rope.L, rope.pay);

  // 跨度超过放出去的量：麻绳不会伸长，会把人拽住。这是"量到头了"唯一诚实的
  // 表达——不弹字幕、不锁输入，就是走不动了，绳在肩上拽着
  if (held && span > rope.pay) {
    const over = span - rope.pay;
    const dir = Math.sign(end.x - rope.x0) || 1;
    p.x -= dir * over;
    end = RopeHandAt(state);
    span = Anchor(end);
    // 顶得越使劲身子拧得越紧：这一帧被绳吃掉多少步，就换算成多少劲
    FlashPose(state, "ropeHaul", 0.22);
    p.poseK = Math.min(1, over / Math.max(1e-4, 2.6 * h));
    if (!rope.creakT || state.time - rope.creakT > 0.9) {
      rope.creakT = state.time;
      Cue(state, "ladder", { gain: 0.5, rate: 1.25 });
    }
  }
  rope.pay = Math.max(span, rope.pay);
  rope.taut = rope.pay > 1e-3 ? Math.min(1, span / rope.pay) : 0;
  rope.straight = rope.taut >= ROPE_TAUT;

  // ── verlet ──
  const pts = rope.pts;
  const groundY = SURFACE_Y + 0.035;
  const gEff = ROPE_G * (1 - Math.pow(rope.taut, ROPE_TENSION_P));   // 绷紧的绳自己吃住重量
  for (let i = 1; i < ROPE_N - 1; i += 1) {
    const q = pts[i];
    let vx = (q.x - q.px) * ROPE_DAMP;
    let vy = (q.y - q.py) * ROPE_DAMP;
    if (q.y <= groundY + 0.02) vx *= 1 - ROPE_FRIC;   // 躺在土上的那截被蹭住
    q.px = q.x; q.py = q.y;
    q.x += vx;
    q.y += vy - gEff * h * h;
  }
  pts[0].x = rope.x0; pts[0].y = rope.y0;
  pts[ROPE_N - 1].x = end.x; pts[ROPE_N - 1].y = end.y;
  const rest = rope.pay / (ROPE_N - 1);
  for (let k = 0; k < ROPE_RELAX; k += 1) {
    const back = k % 2 === 1;                        // 一来一回：两头的约束都推得到底
    for (let j = 0; j < ROPE_N - 1; j += 1) {
      const i = back ? ROPE_N - 2 - j : j;
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const wa = i === 0 ? 0 : 1;
      const wb = i + 1 === ROPE_N - 1 ? 0 : 1;
      if (!wa && !wb) continue;
      const f = (d - rest) / d / (wa + wb);
      if (wa) { a.x += dx * f; a.y += dy * f; }
      if (wb) { b.x -= dx * f; b.y -= dy * f; }
    }
    for (let i = 1; i < ROPE_N - 1; i += 1) if (pts[i].y < groundY) pts[i].y = groundY;
  }

  // 拖在土上的沙沙声：贴地的节点越多、人走得越快，蹭得越响
  let onDirt = 0;
  for (let i = 1; i < ROPE_N - 1; i += 1) if (pts[i].y <= groundY + 0.05) onDirt += 1;
  rope.dragging = onDirt;
  const walked = Math.abs(p.x - (rope.lastX ?? p.x)) / Math.max(1e-4, dt);
  rope.lastX = p.x;
  if (held && onDirt > 3 && walked > 0.6) {
    rope.scrubT = (rope.scrubT || 0) + dt;
    if (rope.scrubT > 0.34) {
      rope.scrubT = 0;
      Cue(state, "dig", { gain: 0.16, rate: 1.7 });
    }
  }
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
    // 扶稳门扇：**手真的按在那扇门上**，把它顶在门框正位，别让它往外坠。
    //
    // 下门轴从臼窝里跳出来了，整扇吊在上轴上、自己往外坠。爹蹲着两只手都在
    // 礅那根轴，腾不出手扶门——所以这一下非得有第二双手不可。这就是这个玩法
    // 存在的理由，也是开场那几镜要先演给玩家看的东西。
    //
    // 四条规矩（与全作拟物标准同源，见 CLAUDE.md）：
    //   ① 得先按住门扇本身——手落在门板上才算攥住，画面别处拖一律不动；
    //   ② 门有分量：跟手走但有速度上限（DOOR_SPEED），甩不动；
    //   ③ 松手它就往外坠回去（DOOR_FALL），进度当场停住往回泄；
    //   ④ 只有稳在正位（|lean| < DOOR_TOL）爹才使得上劲，work 才涨；歪出去
    //      门磕在框上"咚"一声——不是失败，是"这一下没稳住"。
    // 键盘后备：这活儿是**费力气**不是指尖功夫，所以按住 E 慢慢把门扶正是合法的
    //（CLAUDE.md 第 5 条的判据），自动通关也走这条。
    case "holdDoor": {
      const dx = st.hingeX ?? st.zone.x;                       // 上门轴的 x（门框净空左沿）
      const hingeY = SURFACE_Y + (st.hingeY ?? 1.54);          // 门楣下沿
      if (b.lean === undefined) { b.lean = DOOR_SAG; b.work = 0; }
      const near = InZone(p.x, lvl, st.zone);
      if (!near) { state.prompt = ""; state.doorLeaf = { x: dx, hingeY: st.hingeY ?? 1.54, lean: b.lean, work: b.work, loose: true }; return; }

      const pw = input.pointerWorld;
      const held = !!input.pointerHeld && !!pw;
      // 门扇此刻占的那一片（从上轴挂下来，随倾角摆过去）
      // 门扇从上轴挂下来，随倾角整扇摆过去：手按在门板上的哪一格都算攥住
      const down = Math.max(0, Math.min(1.05, (hingeY - (pw ? pw.y : 0)) / DOOR_H));
      const leafX = dx + Math.sin(b.lean) * down * DOOR_H;
      const onLeaf = !!pw && pw.y < hingeY + 0.25 && pw.y > SURFACE_Y - 0.2
        && Math.abs(pw.x - leafX) < DOOR_GRAB_R;
      if (held && !b.wasHeld) {
        b.grabbed = !!onLeaf;
        if (b.grabbed) {
          b.refX = pw.x; b.refLean = b.lean;
          // 攥在门板的哪一格就按哪一格算力臂：门跟着手走，不是跟着一个换算系数走
          b.arm = Math.max(0.55, down * DOOR_H);
          Cue(state, "pickup", { gain: 0.3 });
        }
      }
      if (!held) b.grabbed = false;
      b.wasHeld = held;

      const prevLean = b.lean;
      if (b.grabbed) {
        const want = (b.refLean || 0) + (pw.x - b.refX) / (b.arm || 0.9);
        const cap = DOOR_SPEED * dt;
        b.lean += Math.max(-cap, Math.min(cap, want - b.lean));
      } else if (input.interactHeld) {
        b.lean -= Math.sign(b.lean) * Math.min(Math.abs(b.lean), DOOR_KEY * dt);   // 键盘后备
      } else {
        b.lean += Math.min(DOOR_FALL * dt, DOOR_SAG - b.lean);                     // 松手就往外坠
      }
      b.lean = Math.max(-0.12, Math.min(DOOR_SAG, b.lean));

      // 磕框：往外坠到底、或者被甩回内侧撞上门框，都"咚"一声
      const atStop = b.lean >= DOOR_SAG - 1e-4 || b.lean <= -0.12 + 1e-4;
      if (atStop && !b.knocked && Math.abs(b.lean - prevLean) > 1e-4) {
        b.knocked = true; Cue(state, "tenon", { gain: 0.8 });
      } else if (!atStop) b.knocked = false;

      const steady = Math.abs(b.lean) < DOOR_TOL;
      if (steady) b.work = Math.min(1, b.work + dt / (st.seat ?? 1.6));
      else b.work = Math.max(0, b.work - dt * 0.55);
      state.promptFill = b.work;
      state.prompt = st.prompt || "扶住门扇 · 别让它往外坠";
      state.closeUp = { x: dx, y: SURFACE_Y + DOOR_CAM.y, hw: DOOR_CAM.hw };
      // 爹在礅轴：稳住他才使得上劲
      // 爹的手上要看得出在使劲：稳住了他就抡下去礅轴（swing），
      // 门一歪他只能撑着等（kneel）。"dig" 不是 Rig 里的姿势名，写了等于没写。
      const father = FindActor(state, "father");
      if (father) father.pose = steady ? "swing" : "kneel";
      state.doorLeaf = {
        x: dx, hingeY: st.hingeY ?? 1.54, lean: b.lean, work: b.work, loose: true,
        grabbed: !!b.grabbed, steady, reaching: held && !b.grabbed,
      };
      if (b.work >= 1) {
        if (father) father.pose = "kneel";
        state.doorLeaf = { x: dx, hingeY: st.hingeY ?? 1.54, lean: 0, work: 1, loose: false };
        Cue(state, "tenon", { gain: 0.9 });
        if (st.note) state.toast = { text: st.note, t: 3.4 };
        ApplyUse(state, st);
        finish();
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
      // 键盘后备自动面向靶子：投掷这一步教的是瞄准与时机，不是原地转身
      //（驱动器也靠这条——转身和走位在阈值边上会来回震荡）
      const faceAim = Math.sign(st.target.x - p.x) || 1;
      if (p.heading !== faceAim && Math.abs(st.target.x - p.x) > 1.6) p.heading = faceAim;
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
      // 车往哪边走：独轮车是有正反的东西，渲染层照这个把整张贴图掉个头
      //（车把永远在推车人这一侧）。同一辆车两趟方向不同，所以每帧都写
      cart.dir = st.dir;
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
    // 支木板：几处候选位都出提示，但木料有限——支在硬土上爹会取下来。
    // 「松土要撑、硬土别糟践木头」不是弹窗教的，是支错一次学会的
    case "brace": {
      const usable = (z) => z.ok && !state.flags[z.flag];
      // 取最近的候选位（1.35m 内——驱动器停步的距离），支过的跳过。
      // 松土位优先于硬土位：人站在两处之间时，手会伸向真正要撑的那段；
      // 只有确实站在硬土跟前（松土够不着）才支错——那一下是教学，不是陷阱
      let z = null;
      if (lvl === (st.level || "under")) {
        let best = 1.35;
        for (const zz of st.zones || []) {
          if (!usable(zz)) continue;
          const d = Math.abs(p.x - zz.x);
          if (d < best) { best = d; z = zz; }
        }
        if (!z) {
          for (const zz of st.zones || []) {
            if (zz.ok) continue;
            const d = Math.abs(p.x - zz.x);
            if (d < best) { best = d; z = zz; }
          }
        }
      }
      if (!z) return;
      if (st.needs && p.item?.id !== st.needs) {
        state.prompt = st.missPrompt || `这儿缺${st.needsLabel || "木板"}`;
        return;
      }
      state.prompt = z.ok ? (st.prompt || "E · 把木板支上") : (st.wrongPrompt || st.prompt || "E · 把木板支上");
      if (input.interact) {
        if (z.ok) {
          p.item = null;
          if (z.flag) state.flags[z.flag] = true;
          FlashPose(state, "push", 0.6);
          Cue(state, "tenon");
          finish();
        } else {
          st.wrong?.(state);
          state.toast = { text: st.wrongNote || "硬土不用糟践木头。", t: 3.5 };
        }
      }
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
    // 接绳：攥住麻绳头，顺着绳自己能走的那条路拖过去——贴到圈边、**从圈眼里
    // 穿过去**、另一侧钻出来、再一路往外拉，结自己收死。一个连贯动作。
    // （老版是绕圈缠一圈多，被退回：绕圈是缠辘轳轴的动作，不是接绳的动作。）
    case "knot": {
      if (!InZone(p.x, lvl, st.zone)) return;
      const k = b.knotState;
      if (!k && st.needs && p.item?.id !== st.needs) {
        state.prompt = st.missPrompt || `这儿缺${st.needsLabel || "样东西"}`;
        return;
      }
      const kn = k || (b.knotState = { u: 0, grab: false, threaded: false });
      const cx = st.zone.x;
      // 同辘轳：人站在断头正前方会把结挡住——钉到井口西侧，手够着断头打结
      if (!k) { p.x = cx - 0.9; p.heading = 1; }
      else if (p.x > cx - 0.72) { p.x = cx - 0.72; p.heading = 1; }
      const cyRel = st.knotY ?? 1.5;   // 断头挂在井架上的高度
      const cy = SURFACE_Y + cyRel;
      // 特写：结只有巴掌大。景别照"手指按得着"倒推——1.5m 半宽在手机上
      // 也有 280px/米，绳头那个点 30 来像素、攥住的判定 60 像素
      state.closeUp = { x: cx + 0.04, y: cyRel - 0.14, hw: st.closeHw ?? 1.5 };

      const tip = KnotPointAt(kn.u);
      const pw = input.pointerWorld;
      if (input.pointerHeld && pw) {
        // ① 按下那一帧手必须落在**绳头**上才攥得住，在别处拖一律无效
        if (!kn.grab && state.ptrPressed
          && Math.hypot(pw.x - (cx + tip[0]), pw.y - (cy + tip[1])) < KNOT_GRAB_R) {
          kn.grab = true;
        }
        if (kn.grab) {
          const pr = KnotProject(pw.x - cx, pw.y - cy);
          if (pr.dist > KNOT_SLIP_R) {
            // ③ 手飘离绳子的走向＝脱手，绳头缩回去一截（进度当场断）
            kn.grab = false;
            kn.u = Math.max(0, kn.u - 0.14);
            Cue(state, "drop", { gain: 0.5 });
          } else {
            // ② 绳有分量：跟着手走，但一秒最多走这么多，甩再快也只能一寸寸挪。
            //    往回拖＝把绳头退出来（方向是有意义的，和缠/解同一个道理）
            const d = pr.u - kn.u;
            const stepU = Math.sign(d) * Math.min(Math.abs(d), KNOT_SPEED * dt);
            if (Math.abs(stepU) > 1e-5) {
              kn.u = Math.max(0, Math.min(1, kn.u + stepU));
              if (stepU > 0) FlashPose(state, "mark", 0.25);
            }
          }
        }
      } else kn.grab = false;

      // 攥住第一下，麻绳就离手了（接下来它长在井架上，不在物品栏里）
      if (kn.u > 0.03 && p.item?.id === st.needs) { p.item = null; FlashPose(state, "mark", 0.4); }
      // 穿出圈眼那一下要有回响：绳头从圈里钻出来，结算是搭上了
      if (!kn.threaded && kn.u >= KNOT_THREAD_U) {
        kn.threaded = true;
        Cue(state, "pickup", { gain: 0.7 });
      } else if (kn.threaded && kn.u < KNOT_THREAD_U - 0.02) {
        kn.threaded = false;   // 又给拖回去了：结散开
      }
      // **没有长按后备**（用户明令："为什么还支持长按交互按钮的模式？干掉"）。
      // 接绳是指尖上的活：手不落在绳头上、不顺着绳拖，就一点进展都没有。
      // 也**没有 HUD 手势图标**——招呼玩家的是绳头自己（没上手时它顺着路
      // 往前蹭两下，蹭的方向就是该拖的方向）。
      state.knot = {
        x: cx, y: cyRel, u: kn.u, threadU: KNOT_THREAD_U,
        grab: kn.grab, idle: !kn.grab && kn.u < 0.02 ? state.time : 0,
      };
      // 拉到底：留一点余量再判死。绳头是**渐近**地贴到路径终点的
      //（每帧只补上剩余距离的一部分），死等 u === 1 会永远差最后一丝，
      //   结永远勒不上——只有把终点吃掉才收得了尾
      if (kn.u >= 0.995) {
        kn.u = 1;
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
    // onStart 与 chain/scribe 同一条规矩：第一帧先走开场排布（c1_plane 的
    // 过渡台词、c1_repair 的大婶跪位都挂在这上头——漏了它们就是死代码）
    def.onStart?.(state);
    b.u = 0; b.passes = 0; b.stalls = 0; b.idleT = 0; b.armed = true;
    b.pile = 0; b.everMoved = false; b.grainD = 0;
    b.demoT = def.demoTime ?? 3.0; b.demoU = 0; b.demoCurl = false;
    b.slipDone = false; b.needRest = false; b.restT = 0;
    // 撂下锯：教刨料这一拍，爹手上不能还占着拉锯的活。他先站到工位上示范。
    // 受伤版（injured，第十二场）没有示范——爹已经被押走了
    if (father && !def.injured) {
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
      rest: !!b.needRest,                        // 受伤版：这口气没喘完，得把手松开
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

  // 受伤的手（第十二场）：第一下必然推歪——腹部还疼、手在抖。
  // 玩家必须**松开**，让他停顿喘息 0.8 秒，再重新握稳才能继续。
  // 不需要旁白，手感变化本身就是人物经历（关卡设计文档原话）
  if (def.injured) {
    if (b.needRest) {
      if (!held && !input.interactHeld) {
        b.restT += dt;
        if (b.restT >= 0.8) { b.needRest = false; state.toast = { text: "他重新握稳了刨子。", t: 2.2 }; }
      } else {
        b.restT = 0;
      }
      dv = Math.min(0, dv);   // 歇过来之前推不进，往回带可以
    } else if (!b.slipDone && b.armed && b.u + dv > 0.32) {
      b.slipDone = true; b.needRest = true; b.restT = 0;
      dv = -0.10;
      Cue(state, "planeStall", { gain: 0.9 });
      state.toast = { text: "手一抖，只刨下一截断屑——先松开，让他喘口气。", t: 3.4 };
    }
  }

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
const V_PATCH_X = 13.4;   // 菜畦（veggieWest prop）里娘锄地的站位（菜畦已西移给磨盘/独轮车让位）
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
  // =========================================================================
  // 第一章 · 门框上的刻痕（2026-08-08 按新剧本整章重写）
  // 十二场连成一条 30 分钟的昼夜：修门→量身→邻村的教训→拉绳定向→独轮车运木
  // →刨盖板→修井绳/投石震榆钱→娘处理水→军民挖通道→试走→保甲点户→藏种子粮
  // →搜家抓人→余波→带伤修盖板。
  // 全章：无攻击键、无任务结算、无传统死亡失败、群众伤亡不与玩家操作挂钩、
  // 不把历史暴行做成能按键阻止的 QTE。旧版的花布巾/量身QTE/藏孩子潜行/
  // 门框收尾全部废弃（Notion 关卡设计文档 2026-08-08 为唯一基准）。
  // =========================================================================
  c1: [
    {
      // 序章最终旁白：11 镜、总长 120 秒；每镜一段静音短片。
      kind: "cinematic", id: "c1_prologue", prologue: true, timeOfDay: "dawn",
      lines: [
        { stage: "九一八事变后，日本占领东北，又不断把侵略推进华北。", d: 7, cam: { kind: "insertVideo", clip: "Pro_01", card: "pro2" } },
        { stage: "1937年7月，日军在卢沟桥挑起战事，随后进攻北平、天津，全面侵华战争爆发。", d: 8, cam: { kind: "insertVideo", clip: "Pro_02", card: "pro1" } },
        { stage: "此后一年，华北多数县城和铁路沿线相继沦陷，部分正规军向南、向西转进。", d: 8, cam: { kind: "insertVideo", clip: "Pro_03", card: "pro3" } },
        { stage: "在许多失去常驻守军的乡村，八路军深入敌后，发动群众，坚持抗战。", d: 7, cam: { kind: "insertVideo", clip: "Pro_04", card: "pro4" } },
        { stage: "梁家村就在这样的敌占区。村外有据点、卡口和封锁沟；日伪强征粮食、摊派民夫，扫荡时还直接进村抢粮。", d: 13, cam: { kind: "insertVideo", clip: "Pro_05", card: "pro5" } },
        { stage: "柱子家四口，靠三四亩薄田、换工和农闲杂活过日子。家里没有牲口和车，耕牛、农具都得向邻里借。", d: 13, cam: { kind: "insertVideo", clip: "Pro_06", card: "pro9" } },
        { stage: "乡亲叫柱子爹“梁木匠”，可地里的活才是他的本分。农闲时，他背着锯刨给人换犁把、修门轴，收几把粮。", d: 14, cam: { kind: "insertVideo", clip: "Pro_07", card: "pro11" } },
        { stage: "娘把已经不能穿的旧褂拆开，挑尚结实的布补裤膝和袖肘。能下锅的粮已经见底，留种的小布包却单独封在瓦罐里，谁也不能动。", d: 14, cam: { kind: "insertVideo", clip: "Pro_08", card: "pro13" } },
        { stage: "因为会木工，柱子爹被点名抓走，关在据点工地。白天扛料锯木，干慢了挨打，夜里也不准回村。第七天，他走不了路，被两名乡亲架回家。", d: 18, cam: { kind: "insertVideo", clip: "Pro_09", card: "pro6" } },
        { stage: "柱子十五岁。爹的手还握不住锄头，他得分担农活、照看妹妹，也得保住最后一点粮。", d: 8, cam: { kind: "insertVideo", clip: "Pro_10", card: "pro12" } },
        { stage: "日伪按册点户，也进屋搜粮；少一个人就可能被盘问。可梁家的旧地窖只有一个口。", d: 10, cam: { kind: "insertVideo", clip: "Pro_11", card: "pro7" } },
      ],
    },
    {
      // 三个空镜把世道说完（据点压着、粮刚交完、碾上是糠），第四镜落回院里：
      // 爹坐在小凳上修门。他三天前才从炮楼劳役工地被换下来——手上的伤不用台词，
      // 由娘那句话带出来（史实口径：劳役是成批扣在工地上连干数日）
      kind: "cinematic", id: "c1_open", timeOfDay: "dawn",
      lines: [
        { stage: "1942年，华北敌后。梁家村。", d: 3.4,
          cam: { kind: "shot", x: 56, y: 1.75, dist: 7.0, pan: 5 } },
        { stage: "村东八里是鬼子的据点。炮楼比村里最高的树还高，天晴的日子，从村口就望得见。", d: 5.2,
          cam: { kind: "shot", x: 152, y: 2.5, dist: 7.6, pan: 3 } },
        { stage: "开春刚交完据点摊派的粮。囤里的米、瓮底的盐，家家都得掰着指头过。", d: 5.0, cam: { kind: "shot", x: 118.6, y: 1.4, dist: 6.5 } },
        { stage: "", d: 3.0, cam: { kind: "shot", x: 35, y: 1.5, dist: 7 },
          on: (state) => {
            // 爹蹲在门边摆弄那扇门；柱子在院里，正给灶间抱完柴出来
            const father = FindActor(state, "father");
            if (father) { father.x = 33.2; father.heading = 1; father.pose = "kneel"; }
            const mother = FindActor(state, "mother");
            if (mother) { mother.x = 30.8; mother.heading = -1; }
            state.player.cineWalk = { x: 35.4, speed: 1.6 };
          } },
        { who: "娘", say: "回来才三天，手还没合口呢。", d: 3.4, cam: { kind: "shot", x: 32.5, y: 1.5, dist: 6 } },
        // 「门为什么要修」得**演出来**，不能只靠爹那一句台词——玩家上一版
        // 就是没看懂为什么要扶门，觉得那个互动是凭空冒出来的。
        // 三镜：门自己在晃（下轴脱了窝）→ 爹一个人扶不住（它又坠回去）→
        // 他抬头看柱子。到这儿"要第二双手"这件事已经立住了，玩法接得上。
        { stage: "", d: 3.2, cam: { kind: "shot", x: 34.2, y: 1.35, dist: 2.6 },
          on: (state) => {
            // 推到门跟前：下轴跳出臼窝，整扇吊在上轴上晃
            state.doorLeaf = { x: 33.75, hingeY: 1.54, lean: DOOR_SAG, loose: true, swing: true };
            Cue(state, "tenon", { gain: 0.6 });
          } },
        { stage: "门轴从臼窝里跳了出来。风一过，那扇门就磕在框上。", d: 4.0,
          cam: { kind: "shot", x: 34.2, y: 1.35, dist: 2.8 } },
        { stage: "", d: 3.6, cam: { kind: "shot", x: 33.8, y: 1.4, dist: 3.4 },
          on: (state) => {
            // 爹伸手把门托回正位——托到一半，手上没劲，门又坠回去
            const father = FindActor(state, "father");
            if (father) { father.x = 33.5; father.heading = 1; father.pose = "push"; }
            state.doorLeaf = { x: 33.75, hingeY: 1.54, lean: DOOR_SAG, loose: true, swing: false, tryLift: true };
          } },
        { who: "爹", say: "再晃两夜，门就合不上了。", d: 3.4, cam: { kind: "shot", x: 33.5, y: 1.3, dist: 5.5 },
          on: (state) => {
            const father = FindActor(state, "father");
            if (father) father.pose = "kneel";
            state.doorLeaf = { x: 33.75, hingeY: 1.54, lean: DOOR_SAG, loose: true, swing: true };
          } },
        { who: "爹", say: "过来搭把手——你扶住，我把轴礅回去。", d: 3.6,
          cam: { kind: "ots", subject: "father", other: "player", dist: 3.6 } },
      ],
    },
    {
      // 第一场（玩法）：修门。扶门→递楔→顶住——用一件家务教基础操作。
      // 量身不是小游戏：门修好了，爹一抬眼才看见刻痕落到了眼睛下面（下一拍）
      kind: "chain", id: "c1_door", timeOfDay: "dawn",
      objective: "帮爹把门扶正", hint: "先扶稳门扇",
      onStart: (state) => {
        const father = FindActor(state, "father");
        if (father) { father.x = 33.2; father.heading = 1; father.pose = "kneel"; }
      },
      steps: [
        { type: "goto", zone: { x: 34.2, w: 2.2 } },
        // 扶门不是按一下就完事：门自己往外坠，得攥着它顶住，爹才礅得进那根轴
        { type: "holdDoor", zone: { x: 34.2, w: 2.6 }, hingeX: 33.75, hingeY: 1.54, seat: 1.7,
          prompt: "扶住门扇 · 别让它往外坠",
          note: "轴头咬进臼窝里了。爹松开手，门自己站住了。",
          effect: (state) => { state.flags.doorSeated = true; } },
        { type: "pickup", x: 31.9, item: { id: "wedge", label: "木楔" }, prompt: "E · 拿起木楔" },
        { type: "use", zone: { x: 34.2, w: 2.4 }, needs: "wedge", prompt: "E · 递过木楔",
          effect: (state) => { Cue(state, "tenon"); } },
        // 顶住门框：往上使的是持续的力（做功走笔画，键盘按住 E 是后备）
        { type: "use", zone: { x: 34.2, w: 3.2 }, hold: 1.3, stroke: "up", gestureY: 1.5,
          prompt: "顶住门框 · 往上使劲",
          note: "门不晃了。爹低头收拾家伙，一抬眼——去年的刻痕落到了柱子眼睛下面。",
          effect: (state) => { state.flags.doorFixed = true; Cue(state, "tenon"); } },
      ],
    },
    {
      // 量身。台词沿新剧本第一场（"这个家就靠你了"仍旧不要），但**划线本身是
      // 玩家的手**（2026-08-09 用户明令保留上一版的石笔交互，不许退成三四秒的
      // 过场动画）：门框上的刻痕是全篇的题眼，一头一尾都得亲手划。
      kind: "cinematic", id: "c1_measure", timeOfDay: "dawn",
      lines: [
        { who: "爹", say: "别动。", d: 2.2, cam: { kind: "ots", subject: "father", other: "player", dist: 3.4 },
          on: (state) => {
            const father = FindActor(state, "father");
            if (father) { father.pose = "mark"; father.x = 35.1; father.heading = -1; }
            state.player.x = 34.0;
            state.player.heading = 1;
          } },
      ],
    },
    {
      // 镜头推到左立柱上（世界 33.60→33.75，正是 DrawDoorframe 画永久刻痕的
      // 那 15 公分）：全景里划线只是一个像素在动，凑近了才是"爹在给我量身高"。
      kind: "scribe", id: "c1_carve", timeOfDay: "dawn",
      zone: V.doorframe, speed: 0.5, markY: 1.28,
      markX0: 33.60, markX1: 33.75,
      cam: { kind: "shot", x: 34.0, y: 1.34, dist: 1.9 },
      objective: "爹比着你的头顶，在门框上划一道", hint: "攥住那支石笔，贴着木头拉过去",
      note: "石笔蹭过木头，留下一道浅浅的印。",
      onStart: (state) => {
        // 爹得真的按着他站直（过场被跳掉时这里兜底），不能站在院子那头
        const father = FindActor(state, "father");
        if (father) { father.x = 35.1; father.heading = -1; father.pose = "mark"; }
        state.player.x = 34.0;
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
      kind: "cinematic", id: "c1_measured", timeOfDay: "dawn",
      lines: [
        { stage: "爹用凿子把那道印刻深了一点。", d: 3.4, cam: { kind: "insertCard", card: "carve" } },
        { who: "妹妹", say: "哥长了多少？", d: 2.8, cam: { kind: "shot", x: 33.8, y: 1.4, dist: 5.5 },
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.cineTarget = { x: 33.2 }; sister.cineSpeed = 2.8; }
          } },
        { who: "娘", say: "难怪裤腿又短了。", d: 3.0, cam: { kind: "shot", x: 32.8, y: 1.4, dist: 6 } },
        // 门外的脚步声把下一场带进来（画外音，旁白可说）
        { stage: "门外有脚步声，不止一个人。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.6, dist: 8 },
          on: (state) => { Cue(state, "knock"); } },
      ],
    },
    {
      // 第二场：西庄的日伪搜村队堵死单口地窖。七叔带区里的交通员小周、
      // 和从西庄逃出来的老田进院。
      // 地道战的口径（史实统一）：邻村百姓用代价换来教训，区里同志总结传播，
      // 本村人自己动手——不写成谁的凭空发明
      kind: "cinematic", id: "c1_visitors", timeOfDay: "day",
      lines: [
        { stage: "七叔领着两个人进了院——区里的交通员小周，还有从西庄逃出来的老田。", d: 4.6,
          cam: { kind: "shot", x: 46, y: 1.7, dist: 8.5 },
          on: (state) => {
            const P = (id, x, tx, sp) => {
              const a = FindActor(state, id);
              if (a) { a.visible = true; a.x = x; a.heading = -1; a.cineTarget = { x: tx }; a.cineSpeed = sp; }
            };
            P("qishu", 54, 44.6, 2.2);
            P("xiaozhou", 56, 43.4, 2.15);
            P("laotian", 58, 45.8, 1.9);
            const father = FindActor(state, "father");
            if (father) { father.cineTarget = { x: 41.6 }; father.cineSpeed = 1.8; father.heading = 1; }
            const mother = FindActor(state, "mother");
            if (mother) mother.heading = 1;
          } },
        { who: "七叔", say: "老田，西庄出什么事了？", d: 2.6,
          cam: { kind: "shot", x: 44, y: 1.5, dist: 6.5 } },
        { who: "老田", say: "鬼子和伪军到西庄扫荡，搜出了乡亲们藏身的地窖，又拿土堵死了唯一的窖口。乡亲们全困在里头，出不来。", d: 8.4,
          cam: { kind: "shot", x: 44.5, y: 1.5, dist: 6.5 } },
        { who: "七叔", say: "咱村这些地窖，也都是一个口。", d: 3.4,
          cam: { kind: "shot", x: 44, y: 1.5, dist: 6.5 },
          on: (state) => { const q = FindActor(state, "qishu"); if (q) q.heading = -1; } },
        { who: "小周", say: "区里正让各村改：别一上来挖大洞，先把挨得近的两户通起来。一个口堵住了，还能从另一家出去。", d: 6.2,
          cam: { kind: "shot", x: 43.5, y: 1.5, dist: 6.5 } },
        { who: "爹", say: "我家后窖，和七叔家的土窖，只隔着后墙。", d: 4.0,
          cam: { kind: "shot", x: 42.5, y: 1.5, dist: 6 } },
        { stage: "", d: 2.6, cam: { kind: "shot", x: 38.5, y: 1.5, dist: 7 },
          on: (state) => {
            for (const id of ["qishu", "xiaozhou", "father"]) {
              const a = FindActor(state, id);
              if (a) { a.cineTarget = { x: 37.4 }; a.cineSpeed = 2.0; a.heading = -1; }
            }
          } },
        // 跟着下窖，不切场：镜头直接落到地下（人在剖面里）
        { stage: "", d: 2.8, cam: { kind: "shot", x: 39.5, y: -2.3, dist: 6.5 },
          on: (state) => {
            const D = (id, x) => {
              const a = FindActor(state, id);
              if (a) { a.level = "under"; a.x = x; a.cineTarget = null; a.heading = 1; }
            };
            D("father", 37.6); D("xiaozhou", 39.2); D("qishu", 40.6);
          } },
        { who: "爹", say: "这边土硬，不用处处架木头。洞口和中间那段松土压住就行——不然一碰就塌。", d: 5.4,
          cam: { kind: "shot", x: 40.5, y: -2.3, dist: 6.5 } },
      ],
    },
    {
      // 第三场（玩法）：拉绳定向。不是考测绘——玩家亲手建立"两家只隔四五步"
      // 的空间认识，之后钻通道时出口不再像凭空出现
      kind: "chain", id: "c1_ropeline", timeOfDay: "day",
      objective: "帮小周把方向量出来", hint: "抓住绳头，沿地面拽到七叔家墙根",
      onStart: (state) => {
        // 客人的事谈完了，娘扛起锄头去西头菜畦——她的日子不围着玩家的差事转
        const mother = FindActor(state, "mother");
        if (mother) { mother.carry = "锄头"; mother.cineTarget = { x: V_PATCH_X }; mother.cineSpeed = 1.15; mother.heading = -1; }
        const xz = FindActor(state, "xiaozhou");
        if (xz) { xz.level = "surface"; xz.x = 35.8; xz.heading = 1; xz.cineTarget = null; }
        const q = FindActor(state, "qishu");
        if (q) { q.level = "surface"; q.x = 46; q.cineTarget = { x: 53.2 }; q.cineSpeed = 2.0; q.heading = 1; }
        const lt = FindActor(state, "laotian");
        if (lt) { lt.cineTarget = { x: 49.6 }; lt.cineSpeed = 1.4; }
        StartMicroCine(state, [
          { who: "小周", say: "先在地上把方向量出来。绳头帮我拽到七叔家墙根去。", d: 4.2,
            cam: { kind: "shot", x: 37, y: 1.5, dist: 6 } },
        ]);
      },
      steps: [
        // 绳按物理跑（StepRopeLine）：从小周脚边的盘上放出来，松的拖在土上，
        // 走到七叔家墙根正好放到头——绷直那一下是绳自己演的，不是台词说的
        { type: "pickup", x: 35.6, item: { id: "ropeEnd", label: "绳头" }, prompt: "E · 抓住绳头",
          effect: (state) => { state.ropeLine = { x0: 35.1, y0: SURFACE_Y + 1.02, L: ROPE_LEN }; } },
        { type: "use", zone: { x: 53.2, w: 2.6 }, needs: "ropeEnd", prompt: "E · 交给七叔",
          note: "绳在两家之间绷直了——统共四五步远。",
          effect: (state) => {
            // 交出去＝这头钉死在七叔家墙根；绳还在解，只是两端都不动了
            state.ropeLine = { ...(state.ropeLine || {}), x0: 35.1, y0: SURFACE_Y + 1.02, x1: 52.9, y1: SURFACE_Y + 1.02, L: ROPE_LEN };
            state.flags.ropeStaked = true;
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = null; q.heading = -1; }
          } },
        { type: "goto", zone: { x: 38.5, w: 6, level: "under" },
          effect: (state) => {
            state.ropeLine = null;
            StartMicroCine(state, [
              { who: "小周", say: "方向就冲这儿——挖过去，就是七叔家的窖。", d: 3.8,
                cam: { kind: "shot", x: 42.5, y: -2.3, dist: 5.5 } },
              { who: "爹", say: "洞里窄，家什也短。你去把木料弄来——牲口棚里还有两块旧门板。", d: 5.2,
                cam: { kind: "shot", x: 40, y: -2.3, dist: 6 } },
            ]);
          } },
      ],
    },
    {
      // 第四场（玩法）：村里的独轮木车。晃开陷住的车轮→推到牲口棚→装旧门板和
      // 枣木杠→沿原路推回。路上不表现几公里外的哨兵——敌占的压力全在痕迹里：
      // 贴告示的墙、空车辕、被牵走牲口的棚
      kind: "chain", id: "c1_barrow", timeOfDay: "day",
      objective: "把牲口棚的旧木料拉回来", hint: "独轮车停在西头磨盘旁",
      onStart: (state) => {
        // 窖里的活不停：爹和小周轮换着掏土（人人手上有活）
        const D = (id, x) => {
          const a = FindActor(state, id);
          if (a) { a.level = "under"; a.x = x; a.cineTarget = null; a.heading = 1; a.carry = "锄头"; a.track = { name: "hoeing", t: 0, ambient: true }; }
        };
        D("father", 42.4); D("xiaozhou", 40.8);
        const q = FindActor(state, "qishu");
        if (q) { q.level = "surface"; q.x = 37.8; q.heading = -1; q.cineTarget = null; }
        // 娘在西头菜畦锄地（推车正好从她跟前过）——没人傻站着看玩家干活
        MotherHoe(state);
      },
      steps: [
        { type: "goto", zone: { x: 19.4, w: 3.6 } },
        { type: "use", zone: { x: 19.8, w: 3.2 }, hold: 1.2, stroke: "down", gestureY: 1.05,
          prompt: "晃车把 · 一下一下压",
          note: "车轮从干泥里松了出来。",
          effect: (state) => { Cue(state, "crank"); } },
        { type: "push", from: 19.8, dist: 9.6, dir: -1, obj: "barrow", prompt: "按住 E · 推车" },
        { type: "pickup", x: 8.2, item: { id: "plankA", label: "旧门板", big: true }, prompt: "E · 扛起门板" },
        { type: "use", zone: { x: 10.2, w: 2.6 }, needs: "plankA", prompt: "E · 放上车",
          effect: (state) => { state.flags.barrowPlanks = 1; Cue(state, "drop"); } },
        { type: "pickup", x: 8.9, item: { id: "plankB", label: "旧门板", big: true }, prompt: "E · 扛起门板" },
        { type: "use", zone: { x: 10.2, w: 2.6 }, needs: "plankB", prompt: "E · 放上车",
          effect: (state) => { state.flags.barrowPlanks = 2; Cue(state, "drop"); } },
        { type: "pickup", x: 10.9, item: { id: "zaoPole", label: "枣木杠", big: true }, prompt: "E · 扛起枣木杠",
          effect: (state) => {
            // 蹲在食槽上的母鸡被惊飞：动静会惊动活物（后续章节的暗示）
            state.flags.henFlew = true;
            state.henFlee = { x: 11.3, t: 0 };
            Cue(state, "henSquawk");
          } },
        { type: "use", zone: { x: 10.2, w: 2.6 }, needs: "zaoPole", prompt: "E · 放上车",
          note: "都装上了。抬起车把，往家走。",
          effect: (state) => { state.flags.barrowPlanks = 3; Cue(state, "drop"); } },
        { type: "push", from: 10.2, dist: 30.8, dir: 1, obj: "barrow", prompt: "按住 E · 推车回家",
          note: "木料到了。枣木杠先递下窖去，一块旧门板留在了工作台上。",
          effect: (state) => {
            state.flags.barrowHome = true;
            state.cart = null;
            const q = FindActor(state, "qishu");
            if (q) { q.x = 37.6; q.heading = -1; }
          } },
      ],
    },
    {
      // 第五场（玩法）：学着刨一块旧木板。爹因为虎口裂伤只能示范一趟就交手——
      // StepPlane 的示范段演的就是这一幕。同一套手感在第十二场以受伤版重现
      kind: "plane", id: "c1_plane", timeOfDay: "day",
      zone: V.workbench, passes: 3, doneFlag: "coverPlaned",
      cam: { kind: "shot", x: 40.5, y: 0.95, dist: 2.9 },
      objective: "把旧门板刨成窖口的盖板", hint: "顺着木纹一推到底，中间别停",
      note: "盖板能嵌进洞口了——边上还差一道缝，得拿泥抿上。",
      onStart: (state) => {
        const father = FindActor(state, "father");
        if (father) { father.level = "surface"; father.track = null; father.carry = null; father.cineTarget = null; }
        // 娘从菜畦回来了，在窖口边扫院——推车、刨料这一路，家里没人闲站着
        const mother = FindActor(state, "mother");
        if (mother) { mother.x = 37.2; mother.heading = -1; mother.cineTarget = null; mother.carry = "扫帚"; mother.track = { name: "sweeping", t: 0, ambient: true }; }
        StartMicroCine(state, [
          // 过渡：拉回来的料不是全下窖——这一块为什么留在上头、为什么要刨，
          // 爹先说明白，玩家才不是"拿起板子就挫"（2026-08-09 用户）
          { who: "爹", say: "这块门板不下窖——窖口得有个盖。板面糟了，先刨平，才嵌得严实。", d: 5.4,
            cam: { kind: "shot", x: 40.5, y: 1.3, dist: 5.5 } },
          { who: "爹", say: "你来。一次别吃太深，刨薄点。", d: 3.2,
            cam: { kind: "shot", x: 40.5, y: 1.3, dist: 5.5 } },
        ]);
      },
      onDone: (state) => {
        GiveItem(state, { id: "bucket", label: "空水桶", big: true });
        const mother = FindActor(state, "mother");
        if (mother) { mother.track = null; mother.carry = null; mother.cineTarget = { x: 38.8 }; mother.cineSpeed = 1.8; }
        StartMicroCine(state, [
          { who: "娘", say: "干灰盖不住，得和点泥。井绳昨天又磨开了——顺道打桶水回来。", d: 5.4,
            cam: { kind: "shot", x: 39, y: 1.5, dist: 6 } },
          { stage: "娘把水桶递了过来，桶底盘着那截备用麻绳。", d: 3.2,
            cam: { kind: "shot", x: 39, y: 1.4, dist: 5.5 } },
        ]);
        // 爹回窖里接着干活
        const father = FindActor(state, "father");
        if (father) { father.level = "under"; father.x = 42.6; father.heading = 1; father.carry = "锄头"; father.track = { name: "hoeing", t: 0, ambient: true }; }
      },
    },
    {
      // 第六场（玩法）：井边的榆钱。修井绳（折回→缠上→拽紧）＋投石震榆钱＋打水。
      // 妹妹只捡低处的，不望风、不会失败；刘嫂和襁褓婴儿在这儿露一面——
      // 只占两三秒，为第十场建立辨识（新剧本明令）
      kind: "chain", id: "c1_well", timeOfDay: "day",
      objective: "去井台打水——妹妹在榆树底下", hint: "井在七叔家东边",
      onStart: (state) => {
        // 等水的工夫娘也没闲着：在窖口边刨松干土备泥（她说的"和点泥"）
        const mother = FindActor(state, "mother");
        if (mother) { mother.x = 37.4; mother.heading = 1; mother.cineTarget = null; mother.carry = "锄头"; mother.track = { name: "hoeing", t: 0, ambient: true }; }
        const sis = FindActor(state, "sister");
        if (sis) { sis.x = 55.4; sis.heading = 1; sis.cineTarget = null; sis.track = { name: "reachJump", t: 0, ambient: true }; }
        const ls = FindActor(state, "liusao");
        if (ls) { ls.visible = true; ls.x = 62.8; ls.heading = -1; }
        const le = FindActor(state, "liuElder");
        if (le) { le.visible = true; le.x = 60.6; le.heading = -1; }
      },
      steps: [
        { type: "talk", actor: "sister", prompt: "E · 问妹妹",
          lines: [
            { who: "妹妹", say: "哥——上头的榆钱够不着。", d: 3.0, cam: { kind: "shot", x: 56, y: 1.6, dist: 5.5 } },
            // 刘嫂与襁褓：两三秒，不交互不解释——第十场认的就是这个襁褓
            { stage: "", d: 2.4, cam: { kind: "insert", x: 62.8, y: 1.35, dist: 4.4 } },
            { stage: "", d: 2.2, cam: { kind: "shot", x: 57.5, y: 1.5, dist: 6 },
              on: (state) => {
                const sis = FindActor(state, "sister");
                if (sis) { sis.track = null; sis.cineTarget = { x: 59.6 }; sis.cineSpeed = 2.2; }
              } },
          ] },
        { type: "use", zone: V.well, needs: "bucket", consume: false, prompt: "E · 搁桶查井绳",
          note: "井绳磨秃了一段。桶底那截麻绳正好使。",
          effect: (state) => {
            // 桶先搁在井台东边：修绳、投石都得腾出两只手（单格物品栏）
            AddGroundItem(state, state.player.item, 60.2, "surface");
            state.player.item = null;
            state.flags.bucketAt = 60.2;
          } },
        { type: "use", zone: V.well, prompt: "E · 把磨损处折回",
          effect: (state) => { Cue(state, "crank", { gain: 0.7 }); } },
        { type: "knot", zone: V.well, knotY: 1.18,
          note: "麻绳缠紧，两头一拽——又能吃上劲了。",
          effect: (state) => { state.flags.wellRopeFixed = true; } },
        { type: "throwHit", pickupX: 61.2, target: { x: 56.3, y: 2.2, r: 1.25 },
          prompt: "F · 投",
          missNote: "石子擦着枝子飞过去了。妹妹指了指最高那根细枝。",
          miss: (state, land) => {
            state.sparrowBurst = { x: land, t: 0 };
            Cue(state, "flutter");
          },
          note: "榆钱簌簌落下来，铺了布上一层。",
          effect: (state) => {
            state.flags.elmDown = true;
            state.elmRain = { x: 56.3, t: 0 };
            const sis = FindActor(state, "sister");
            if (sis) {
              sis.cineTarget = { x: 56.2 };
              sis.cineSpeed = 2.4;
              sis.heading = -1;
              sis.track = { name: "cheerHop", t: 0 };
            }
            StartMicroCine(state, [
              { who: "妹妹", say: "都落布上喽！够蒸一锅榆钱饭了。", d: 3.0,
                cam: { kind: "shot", x: 56.5, y: 1.5, dist: 5.5 } },
            ]);
          } },
        { type: "pickupGround", flagX: "bucketAt", item: { id: "bucket", label: "空水桶", big: true },
          prompt: "E · 拎回桶" },
        { type: "winch", zone: V.well, needs: "bucket",
          gives: { id: "fullBucket", label: "一桶水", big: true },
          note: "水打上来了。桶沿一路往下滴。",
          onFilled: (state) => { state.flags.waterFilled = true; },
          effect: (state) => {
            const sis = FindActor(state, "sister");
            if (sis) { sis.track = null; sis.carry = "包袱"; sis.following = true; sis.cineTarget = null; }
          } },
        { type: "goto", zone: { x: 38.5, w: 3 },
          effect: (state) => {
            const sis = FindActor(state, "sister");
            if (sis) { sis.following = false; sis.cineTarget = { x: 34 }; sis.cineSpeed = 1.6; }
          } },
      ],
    },
    {
      // 第七场：娘怎样处理水和洞口。全程没有一个字——接桶、倒缸沉淀、和泥、
      // 抹盖板，同场动作自己说（新剧本明令：不用旁白、字幕或画中画）。
      // 镜头只收紧两三拍就把控制还给玩家，娘在背景里继续
      kind: "cinematic", id: "c1_motherwater", timeOfDay: "day",
      lines: [
        { stage: "", d: 2.4, cam: { kind: "shot", x: 38, y: 1.5, dist: 5.4 },
          on: (state) => {
            const mother = FindActor(state, "mother");
            if (mother) { mother.x = 38.6; mother.heading = -1; mother.carry = "桶"; mother.track = null; mother.cineTarget = null; }
            state.player.item = null;
          } },
        { stage: "", d: 3.0, cam: { kind: "shot", x: 42.5, y: 1.3, dist: 5 },
          on: (state) => {
            const mother = FindActor(state, "mother");
            if (mother) { mother.cineTarget = { x: 42.8 }; mother.cineSpeed = 1.4; }
            Cue(state, "waterSplash", { gain: 0.6 });
          } },
        { stage: "", d: 3.2, cam: { kind: "insert", x: 37, y: 1.0, dist: 3.8 },
          on: (state) => {
            const mother = FindActor(state, "mother");
            if (mother) { mother.carry = null; mother.cineTarget = { x: 37.7 }; mother.cineSpeed = 1.4; }
            Cue(state, "drop", { gain: 0.6 });
          } },
      ],
    },
    {
      // 第八场（玩法）：大人挖，孩子做小活。玩家的三件事：送土筐、把新土分散
      // 到猪圈/菜畦/柴堆、把仅有的两块旧木板支到真正的松土上。
      // 支错了不塌方不死人——爹取下来，一句话讲明白（历史与引导规范）
      kind: "chain", id: "c1_dig", timeOfDay: "dawn",
      objective: "把挖出的土送出去", hint: "新土不能露在明处——猪圈、菜畦、柴堆底下",
      onStart: (state) => {
        const mother = FindActor(state, "mother");
        if (mother) { mother.pose = "kneel"; mother.x = 37.7; mother.heading = -1; mother.cineTarget = null; }
        // 妹妹的小活：往摊开的新土上撒碎草（scatterFeed 的动作正合适）
        const sis = FindActor(state, "sister");
        if (sis) { sis.x = 44.2; sis.heading = 1; sis.cineTarget = null; sis.track = { name: "scatterFeed", t: 0, ambient: true }; }
        const q = FindActor(state, "qishu");
        if (q) { q.x = 37.9; q.heading = -1; q.cineTarget = null; }
        // 官道的岗是成年民兵的（妹妹不望风）
        const st = FindActor(state, "sentry");
        if (st) { st.visible = true; st.x = 88; st.wander = { x0: 78, x1: 96, speed: 0.8 }; }
        const D = (id, x) => {
          const a = FindActor(state, id);
          if (a) { a.visible = true; a.level = "under"; a.x = x; a.heading = 1; a.carry = "锄头"; a.track = { name: "hoeing", t: 0, ambient: true }; }
        };
        D("diggerA", 41.6); D("diggerB", 44.0);
      },
      steps: [
        { type: "pickup", x: 37.6, item: { id: "dirtA", label: "土筐", big: true }, prompt: "E · 接过土筐" },
        { type: "use", zone: { x: 44.9, w: 2.6 }, needs: "dirtA", prompt: "E · 把土倒进猪圈",
          effect: (state) => { Cue(state, "drop"); } },
        { type: "pickup", x: 37.6, item: { id: "dirtB", label: "土筐", big: true }, prompt: "E · 接过土筐" },
        { type: "use", zone: { x: 13.6, w: 2.8 }, needs: "dirtB", prompt: "E · 把土撒进菜畦",
          effect: (state) => { Cue(state, "drop"); } },
        { type: "pickup", x: 37.6, item: { id: "dirtC", label: "土筐", big: true }, prompt: "E · 接过土筐" },
        { type: "use", zone: { x: 46.8, w: 2.6 }, needs: "dirtC", prompt: "E · 把土压进柴堆",
          note: "新土都散净了。",
          effect: (state) => {
            // 成年民兵从沟沿绕回来，当面低声报告——不用来历不明的暗号
            const st = FindActor(state, "sentry");
            if (st) { st.wander = null; st.cineTarget = { x: 50 }; st.cineSpeed = 2.6; st.heading = -1; }
            StartMicroCine(state, [
              { who: "民兵", say: "官道上暂时没动静。", d: 3.0, cam: { kind: "shot", x: 48, y: 1.5, dist: 7 },
                on: (state2) => {
                  const s2 = FindActor(state2, "sentry");
                  if (s2) { s2.cineTarget = { x: 88 }; s2.cineSpeed = 2.2; s2.heading = 1; }
                } },
            ]);
          } },
        { type: "pickup", x: 39.2, level: "under", item: { id: "plankOldA", label: "旧门板", big: true },
          prompt: "E · 扛起旧门板" },
        { type: "brace", level: "under", needs: "plankOldA",
          zones: [{ x: 43.0, ok: true, flag: "bracedA" }, { x: 44.5, ok: false }, { x: 45.3, ok: true, flag: "bracedB" }],
          prompt: "E · 把木板支上",
          wrongNote: "爹把板子取了下来：这段是硬土，不用糟践木头。" },
        { type: "pickup", x: 39.2, level: "under", item: { id: "plankOldB", label: "旧门板", big: true },
          prompt: "E · 扛起旧门板" },
        { type: "brace", level: "under", needs: "plankOldB",
          zones: [{ x: 43.0, ok: true, flag: "bracedA" }, { x: 44.5, ok: false }, { x: 45.3, ok: true, flag: "bracedB" }],
          prompt: "E · 把木板支上",
          note: "洞口和松土段都撑住了。",
          wrongNote: "爹把板子取了下来：这段是硬土，不用糟践木头。" },
      ],
    },
    {
      // 第九场：两头通了。没有敲墙暗号也没有庆祝——七叔从那头扒开最后一层土
      kind: "cinematic", id: "c1_break", timeOfDay: "night",
      lines: [
        { stage: "入了夜，油灯换过两回。", d: 3.2, cam: { kind: "shot", x: 44, y: -2.3, dist: 6.5 },
          on: (state) => {
            // 夜里街上没人了
            for (const id of ["auntFeed", "oldSweep", "carrier", "grindAunt", "liusao", "liuElder", "sentry"]) {
              const a = FindActor(state, id);
              if (a) { a.visible = false; a.track = null; a.wander = null; a.cineTarget = null; }
            }
            const q = FindActor(state, "qishu");
            if (q) { q.visible = true; q.level = "under"; q.x = 47.9; q.heading = -1; q.carry = "锄头"; q.track = { name: "hoeing", t: 0, ambient: true }; }
            const D = (id, x) => {
              const a = FindActor(state, id);
              if (a) { a.level = "under"; a.x = x; a.heading = 1; }
            };
            D("father", 44.9); D("xiaozhou", 43.4);
          } },
        { stage: "", d: 2.6, cam: { kind: "insert", x: 46.4, y: -2.5, dist: 3.8 },
          on: (state) => {
            state.flags.tunnelDug = true;
            Cue(state, "dig", { gain: 0.9 });
            const q = FindActor(state, "qishu");
            if (q) q.track = null;
          } },
        { who: "七叔", say: "能过。先试一遍。", d: 3.0, cam: { kind: "shot", x: 47, y: -2.4, dist: 5.5 },
          on: (state) => {
            const sis = FindActor(state, "sister");
            if (sis) { sis.visible = true; sis.level = "surface"; sis.x = 38.4; sis.heading = -1; sis.track = null; sis.cineTarget = null; }
          } },
      ],
    },
    {
      // 试走·去：安全状态下把路线学会（下窄洞、过支撑段、从那头出去）。
      // 妹妹镜像玩家姿态、不参与任何判定——这次预演让第十一场不用再教
      kind: "escort", id: "c1_testGo", timeOfDay: "night",
      follower: "sister", dest: { x: 50.2, w: 3, level: "under" },
      objective: "带妹妹把通道走一遍", hint: "从自家窖口下去，猫腰跟着走",
    },
    {
      kind: "escort", id: "c1_testBack", timeOfDay: "night",
      follower: "sister", dest: { x: 38.5, w: 3.4, level: "under" },
      objective: "再从那头走回来", hint: "原路返回",
    },
    {
      // 夜里的安排：不撤村，各家按自己的藏法办；枪和名册连夜转移出去。
      // 最后一篮新土的拍击声，混进村外压低的脚步——天色转成黎明前的灰蓝
      kind: "cinematic", id: "c1_nightset", timeOfDay: "night",
      lines: [
        { who: "小周", say: "先做到这一步。往后再慢慢加固。", d: 3.6, cam: { kind: "shot", x: 39.5, y: -2.3, dist: 6 },
          on: (state) => {
            const sis = FindActor(state, "sister");
            if (sis) { sis.following = false; sis.level = "surface"; sis.x = 34; sis.cineTarget = null; }
            const xz = FindActor(state, "xiaozhou");
            if (xz) { xz.x = 41.5; xz.heading = -1; xz.track = null; xz.carry = null; }
          } },
        { who: "小周", say: "乡亲们还照常在家。真有人来搜，各家按自己的藏法办——别一窝蜂往街上跑。带枪的把枪和纸藏开；人少，不能在村里硬顶。", d: 7.0,
          cam: { kind: "shot", x: 41, y: 1.5, dist: 7 },
          on: (state) => {
            const U = (id, x) => {
              const a = FindActor(state, id);
              if (a) { a.level = "surface"; a.x = x; a.cineTarget = null; a.track = null; a.carry = null; a.heading = 1; }
            };
            U("father", 39.4); U("xiaozhou", 41.8); U("qishu", 43.4); U("laotian", 45);
            state.player.level = "surface";
            state.player.x = 38.2;
          } },
        { stage: "七叔把民兵的枪和名册，连夜转移了出去。", d: 3.8, cam: { kind: "shot", x: 48, y: 1.6, dist: 8 },
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) { q.carry = "步枪"; q.cineTarget = { x: 176 }; q.cineSpeed = 2.4; q.cineVanish = true; q.heading = 1; }
            const xz = FindActor(state, "xiaozhou");
            if (xz) { xz.cineTarget = { x: 176 }; xz.cineSpeed = 2.3; xz.cineVanish = true; xz.heading = 1; }
            const lt = FindActor(state, "laotian");
            if (lt) { lt.cineTarget = { x: 176 }; lt.cineSpeed = 2.0; lt.cineVanish = true; lt.heading = 1; }
          } },
        { stage: "最后一篮新土摊到了猪圈边。拍土的闷响里，混进了别的声音。", d: 4.6,
          cam: { kind: "shot", x: 44, y: 1.5, dist: 6.5 },
          on: (state) => {
            const father = FindActor(state, "father");
            if (father) { father.carry = "土筐"; father.cineTarget = { x: 44.7 }; father.cineSpeed = 1.5; }
            Cue(state, "dig", { gain: 0.7 });
            Cue(state, "step", { gain: 0.5, delay: 1.6 });
            Cue(state, "step", { gain: 0.7, delay: 2.4 });
          } },
      ],
    },
    {
      // 第十场：保甲册上的人。点户声由远及近——玩家自然明白敌人握着人数，
      // 不需要弹窗解释为什么不能藏起两个孩子。
      // 刘家的暴行是连续剧情演出：镜头留在院门外的街上（不给特写、不慢放、
      // 不做 QTE、不成为任何玩法或奖励），士兵行凶后继续翻找——
      // 起因不是刘家做错了什么，而是日军抢不到粮时蓄意以杀害婴儿逼供恐吓
      kind: "cinematic", id: "c1_roster", timeOfDay: "dawn",
      lines: [
        { who: "伪保长", say: "赵家，三口。", far: true, d: 3.6,
          cam: { kind: "shot", x: 84, y: 1.8, dist: 10, pan: -5 },
          on: (state) => {
            state.flags.raidStarted = true;
            state.flags.villageAlarm = true;
            SpawnRaidSoldiers(state);
            // 整支队伍已进了东街：按队序整体前移，再往刘家开进
            for (const a of state.actors) {
              if (!(IsEnemy(a) || a.id === "officer")) continue;
              a.patrol = null;
              a.x -= 66;
              a.heading = -1;
              // 挎斗里的兵钉在车上（pinTo 每帧跟车）：给他自己的走位反而会拆下来
              if (a.pinTo) continue;
              a.cineTarget = { x: a.x - 15 };
              a.cineSpeed = RAID_SPEED;
            }
            // 点户的一小队走在队伍前头：伪保长夹着册、伪军头目跟着
            state.actors.push(
              MakeActor("baozhang", "puppet", 70, { label: "伪保长", decor: true, carry: "名册", heading: -1, cineTarget: { x: 61.4 }, cineSpeed: 2.2 }),
              MakeActor("puppetChief", "puppet", 72, { label: "伪军头目", decor: true, heading: -1, cineTarget: { x: 63 }, cineSpeed: 2.2 }),
            );
            const off = FindActor(state, "officer");
            if (off) { off.x = 68.5; off.cineTarget = { x: 59.9 }; off.cineSpeed = 2.2; }
            const tr = FindActor(state, "traitor");
            if (tr) { tr.x = 70.8; tr.cineTarget = { x: 62 }; tr.cineSpeed = 2.2; }
            // 两个进院搜刘家的兵
            const r1 = FindActor(state, "raid1");
            if (r1) { r1.x = 69; r1.cineTarget = { x: 62.6 }; r1.cineSpeed = 2.3; }
            const r2 = FindActor(state, "raid2");
            if (r2) { r2.x = 71; r2.cineTarget = { x: 64.6 }; r2.cineSpeed = 2.3; }
            // 刘家人在自家院里应付清查
            const ls = FindActor(state, "liusao");
            if (ls) { ls.visible = true; ls.x = 63.4; ls.heading = 1; ls.carry = "襁褓"; }
            const le = FindActor(state, "liuElder");
            if (le) { le.visible = true; le.x = 65.4; le.heading = 1; le.carry = null; }
            // 梁家四口都在院里
            const father = FindActor(state, "father");
            if (father) { father.cineTarget = null; father.carry = null; father.x = 39.6; father.heading = 1; }
            const mother = FindActor(state, "mother");
            if (mother) { mother.pose = null; mother.x = 38.4; mother.heading = 1; }
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = 37; sis.heading = 1; sis.cineTarget = null; }
            state.player.x = 37.8;
            Cue(state, "motorPutt", { gain: 0.5 });
          } },
        { stage: "撞门声、喝骂声，一户比一户近。", d: 3.0,
          cam: { kind: "shot", x: 72, y: 1.7, dist: 9, pan: -4 },
          on: (state) => { Cue(state, "knock"); Cue(state, "knock", { delay: 1.3, gain: 1.2 }); } },
        { who: "伪保长", say: "刘家，四口。", d: 3.0,
          cam: { kind: "shot", x: 60.5, y: 1.6, dist: 8 },
          on: (state) => { Cue(state, "knock", { gain: 1.3 }); } },
        { who: "翻译官", say: "粮食藏哪了？是不是给八路了？", d: 3.8,
          cam: { kind: "shot", x: 62, y: 1.4, dist: 7.5 },
          on: (state) => {
            // 踹翻的粮缸里只有糠皮和干菜
            Cue(state, "drop", { gain: 1.2 });
            const r2 = FindActor(state, "raid2");
            if (r2) { r2.cineTarget = null; r2.heading = 1; }
            const r1 = FindActor(state, "raid1");
            if (r1) { r1.cineTarget = null; r1.heading = 1; }
          } },
        { who: "刘嫂", say: "上回都交走了……孩子还没奶吃，真没有了。", d: 4.4,
          cam: { kind: "shot", x: 62.5, y: 1.4, dist: 7.5 } },
        { stage: "", d: 2.2, cam: { kind: "shot", x: 61.5, y: 1.4, dist: 8 },
          on: (state) => {
            const le = FindActor(state, "liuElder");
            if (le) le.track = { name: "struckFall", t: -0.95 };
            const r1 = FindActor(state, "raid1");
            if (r1) r1.track = { name: "buttStrike", t: 0 };
          } },
        { stage: "", d: 2.4, cam: { kind: "shot", x: 61.5, y: 1.4, dist: 8 },
          on: (state) => {
            // 从刘嫂怀里强行夺走襁褓；刘嫂扑过去
            const ls = FindActor(state, "liusao");
            const r2 = FindActor(state, "raid2");
            if (ls) { ls.carry = null; ls.track = { name: "pressedStruggle", t: 0 }; }
            if (r2) { r2.carry = "襁褓"; r2.heading = -1; }
            Cue(state, "sobBreath", { gain: 0.8 });
          } },
        { stage: "", d: 2.8, cam: { kind: "shot", x: 60.5, y: 1.5, dist: 8 },
          on: (state) => {
            const ls = FindActor(state, "liusao");
            if (ls) ls.track = { name: "struckFall", t: -0.6 };
            const r2 = FindActor(state, "raid2");
            if (r2) r2.track = { name: "buttStrike", t: 0 };
          } },
        { stage: "刘家院里的哭喊，半条街都听得见。", d: 3.6,
          cam: { kind: "shot", x: 58, y: 1.5, dist: 8 },
          on: (state) => {
            const r2 = FindActor(state, "raid2");
            if (r2) { r2.carry = "步枪"; r2.track = null; r2.heading = 1; }
            const r1 = FindActor(state, "raid1");
            if (r1) { r1.track = null; r1.heading = 1; }
            Cue(state, "sobBreath", { gain: 0.9 });
          } },
        { who: "伪保长", say: "下一户——梁木匠家，四口。", d: 3.4,
          cam: { kind: "shot", x: 56, y: 1.4, dist: 7.5 },
          on: (state) => {
            for (const [id, tx] of [["baozhang", 48.4], ["puppetChief", 47.2], ["officer", 46.2], ["traitor", 49.4], ["raid1", 50.6], ["raid2", 52]]) {
              const a = FindActor(state, id);
              if (a) { a.track = null; a.cineTarget = { x: tx }; a.cineSpeed = 1.5; a.heading = -1; }
            }
          } },
      ],
    },
    {
      // 第十一场（玩法·全章唯一的高压段）：藏种子粮。没有倒计时——紧迫感全部
      // 来自越来越近的点户声和撞门声。也没有剧情失败：慢了娘会催一声，
      // 柱子最终都来得及回来站进四口里。婴儿之死、妹妹挨打、爹被抓，
      // 绝不成为玩家操作不佳的惩罚（关卡设计文档明令）
      kind: "chain", id: "c1_grain", timeOfDay: "dawn",
      objective: "把种子粮送进七叔家窖，放下就回来", hint: "册上是四口——他们进门前，一个都不能少",
      onStart: (state) => {
        GiveItem(state, { id: "grainBag", label: "粮袋", big: true });
        StartMicroCine(state, [
          { who: "娘", say: "拿着。送到七叔家窖里，放下就回来——册上是四口，他们进门的时候，咱家一个都不能少。", d: 6.4,
            cam: { kind: "shot", x: 37.8, y: 1.4, dist: 5.5 } },
        ]);
      },
      tick: (state) => {
        // 点户的动静一阵阵压过来（画外，无倒计时）
        const b = state.beat;
        b.poundT = (b.poundT || 0) + 1 / 60;
        if (b.poundT > 7) { b.poundT = 0; Cue(state, "knock", { gain: 1.0 }); }
      },
      pipIdle: {
        after: 22, cooldown: 26,
        on: (state) => {
          ShowPip(state, { who: "mother", t: 3.0 });
          state.toast = { text: "娘在洞口压着嗓子催：快——回来！", t: 3 };
        },
      },
      steps: [
        { type: "goto", zone: { x: 38.5, w: 5, level: "under" } },
        { type: "use", zone: { x: 47.6, w: 2.4, level: "under" }, needs: "grainBag",
          prompt: "E · 塞进藏口",
          effect: (state) => { state.flags.grainHidden = true; Cue(state, "drop"); } },
        { type: "use", zone: { x: 47.6, w: 2.4, level: "under" }, prompt: "E · 拉回覆土板",
          note: "藏口盖严了。",
          effect: (state) => { state.flags.nookClosed = true; Cue(state, "tenon"); } },
        { type: "goto", zone: { x: 38.2, w: 3.4 } },
      ],
    },
    {
      // 梁家搜查：门被踹开就收回控制——不给玩家留一个只能被空气墙挡回来的
      // 假自由。无力感来自事件本身，不来自按住一个"忍耐键"（文档明令，无 QTE）
      kind: "cinematic", id: "c1_search", timeOfDay: "dawn",
      lines: [
        { stage: "", d: 2.0, cam: { kind: "shot", x: 40, y: 1.5, dist: 7 },
          on: (state) => {
            Cue(state, "knock", { gain: 1.4 });
            state.player.cineWalk = { x: 38.6, speed: 2.6 };
            const father = FindActor(state, "father");
            if (father) { father.x = 39.8; father.heading = 1; }
            const mother = FindActor(state, "mother");
            if (mother) { mother.x = 38; mother.heading = 1; }
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = 37.2; sis.heading = 1; sis.cineTarget = null; }
            for (const [id, tx] of [["raid1", 43.4], ["raid2", 41.6], ["baozhang", 46.4], ["puppetChief", 45.2], ["officer", 44.4]]) {
              const a = FindActor(state, id);
              if (a) { a.cineTarget = { x: tx }; a.cineSpeed = 2.6; a.heading = -1; }
            }
          } },
        { who: "伪保长", say: "梁木匠——两口大人，两个孩子。", d: 3.8,
          cam: { kind: "shot", x: 42, y: 1.4, dist: 7 } },
        { stage: "", d: 2.8, cam: { kind: "shot", x: 39.5, y: 1.4, dist: 6.5 },
          on: (state) => {
            // 翻水瓢、踢被褥、跳进旧地窖翻找
            Cue(state, "drop", { gain: 1.1 });
            const r2 = FindActor(state, "raid2");
            if (r2) { r2.cineTarget = null; r2.level = "under"; r2.x = 38.8; r2.heading = 1; }
          } },
        // 侧口的覆土板：黑黢黢一块，什么也看不出来——种子粮就在它后面
        { stage: "", d: 2.6, cam: { kind: "insert", x: 47.6, y: -2.4, dist: 3.8 } },
        { stage: "", d: 2.2, cam: { kind: "shot", x: 39.5, y: 1.4, dist: 6.5 },
          on: (state) => {
            const r2 = FindActor(state, "raid2");
            if (r2) { r2.level = "surface"; r2.x = 40.4; r2.heading = -1; }
            // 夺走妹妹的包袱：榆钱洒了一地
            const sis = FindActor(state, "sister");
            if (sis) sis.carry = null;
            state.elmRain = { x: 37.4, t: 0.6 };
            Cue(state, "flutter", { gain: 0.7 });
          } },
        { stage: "", d: 2.2, cam: { kind: "shot", x: 38.5, y: 1.3, dist: 6.5 },
          on: (state) => {
            const r2 = FindActor(state, "raid2");
            if (r2) r2.track = { name: "buttStrike", t: 0 };
            const sis = FindActor(state, "sister");
            if (sis) sis.track = { name: "struckFall", t: -0.95 };
            Cue(state, "sobBreath", { gain: 0.7 });
          } },
        { stage: "", d: 2.2, cam: { kind: "shot", x: 39, y: 1.3, dist: 6.5 },
          on: (state) => {
            // 柱子猛地上前一步；爹一把攥住他的胳膊
            state.player.cineWalk = { x: state.player.x + 0.7, speed: 3.0 };
            const father = FindActor(state, "father");
            if (father) { father.cineTarget = { x: 39.4 }; father.cineSpeed = 2.6; }
          } },
        { stage: "", d: 2.6, cam: { kind: "shot", x: 39.5, y: 1.3, dist: 6.5 },
          on: (state) => {
            const r1 = FindActor(state, "raid1");
            if (r1) { r1.cineTarget = null; r1.x = 41.2; r1.heading = -1; r1.track = { name: "buttStrike", t: 0 }; }
            const father = FindActor(state, "father");
            if (father) { father.cineTarget = null; father.track = { name: "struckFall", t: -0.95 }; }
            state.player.pose = "kneel";
            const mother = FindActor(state, "mother");
            if (mother) { mother.cineTarget = { x: 37.4 }; mother.cineSpeed = 2.8; mother.pose = "shelter"; }
            Cue(state, "sobBreath", { gain: 0.8 });
          } },
        { who: "伪军头目", say: "太君，这个木匠在炮楼工地干过，会做木活。", d: 4.4,
          cam: { kind: "shot", x: 43.5, y: 1.4, dist: 7 } },
        { who: "日军军曹", say: "木头——做什么？", d: 2.8,
          cam: { kind: "shot", x: 42, y: 1.3, dist: 6.5 },
          on: (state) => {
            const off = FindActor(state, "officer");
            if (off) { off.cineTarget = { x: 41.8 }; off.cineSpeed = 1.2; }
            const father = FindActor(state, "father");
            if (father) { father.track = null; father.pose = "kneel"; father.heading = 1; }
          } },
        { who: "爹", say: "修门。", d: 2.2, cam: { kind: "shot", x: 40.5, y: 1.2, dist: 6 } },
        { who: "日军军曹", say: "给八路，做什么？", d: 2.8, cam: { kind: "shot", x: 41.5, y: 1.3, dist: 6.5 } },
        { who: "爹", say: "没做。", d: 2.2, cam: { kind: "shot", x: 40.5, y: 1.2, dist: 6 } },
        { stage: "他们不需要证据。", d: 2.8, cam: { kind: "shot", x: 41, y: 1.4, dist: 7 },
          on: (state) => {
            state.flags.fatherTaken = true;
            const father = FindActor(state, "father");
            if (father) { father.pose = "hauled"; }
            // 附近另外几名壮劳力也被押了出来——抓的不止木匠一个
            ["taken0", "taken1", "taken2"].forEach((id, i) => {
              const a = FindActor(state, id);
              if (a) { a.visible = true; a.x = 52 + i * 2.1; a.heading = 1; a.pose = "hauled"; a.cineTarget = null; }
            });
          } },
        { who: "妹妹", say: "爹——！", d: 2.6, cam: { kind: "shot", x: 44, y: 1.3, dist: 7 },
          on: (state) => {
            const sis = FindActor(state, "sister");
            if (sis) { sis.track = null; sis.cineTarget = { x: 45.4 }; sis.cineSpeed = 3.2; }
          } },
        { stage: "", d: 2.2, cam: { kind: "shot", x: 44, y: 1.3, dist: 7 },
          on: (state) => {
            // 一名伪军用枪身把她推回门里
            const pc = FindActor(state, "puppetChief");
            if (pc) { pc.cineTarget = { x: 45.8 }; pc.cineSpeed = 2.8; }
            const sis = FindActor(state, "sister");
            if (sis) { sis.cineTarget = { x: 42.4 }; sis.cineSpeed = 2.6; }
            const mother = FindActor(state, "mother");
            if (mother) { mother.pose = null; mother.cineTarget = { x: 42 }; mother.cineSpeed = 2.4; }
          } },
        { stage: "爹被绳子和别人串在一起，只来得及回头看了一眼。", d: 4.2,
          cam: { kind: "shot", x: 50, y: 1.3, dist: 9, pan: 4 },
          on: (state) => {
            const father = FindActor(state, "father");
            if (father) { father.heading = -1; father.cineKeepHeading = true; }
            for (const id of ["father", "raid1", "raid2", "officer", "baozhang", "puppetChief", "traitor", "taken0", "taken1", "taken2"]) {
              const a = FindActor(state, id);
              if (a) { a.cineTarget = { x: 196 }; a.cineSpeed = 1.5; a.cineVanish = true; if (id !== "father") a.heading = 1; }
            }
            // 大队伍收队出村
            Cue(state, "motorPutt", { gain: 0.7 });
            for (const a of state.actors) {
              if (!a.decor || a.pinTo) continue;
              a.patrol = null;
              a.cineTarget = { x: 196 };
              a.cineSpeed = a.mount ? 1.85 : 1.55;
              a.cineVanish = true;
              a.heading = 1;
            }
          } },
        { stage: "", d: 3.0, cam: { kind: "shot", x: 39, y: 1.4, dist: 6.5 },
          on: (state) => { state.player.pose = null; } },
      ],
    },
    {
      // 第十二场前半：人被带走以后。20~40 秒没有目标——走向院门、妹妹、
      // 或爹倒下的地方，各有反应；什么都不做，七叔也会回来。悲痛有地方站
      kind: "linger", id: "c1_after", timeOfDay: "day",
      mainAt: { x: 47, r: 2.2 }, after: 26,
      touches: [
        { id: "sis", x: 37.2, r: 1.8,
          on: (state) => {
            FlashPose(state, "kneel", 1.6);
            StartMicroCine(state, [
              { who: "妹妹", say: "娘……爹去哪了？", d: 3.0, cam: { kind: "shot", x: 37.2, y: 1.3, dist: 5.5 } },
              { who: "娘", say: "他们抓你爹……去干活了。", d: 3.4, cam: { kind: "shot", x: 37.2, y: 1.3, dist: 5.5 } },
              { who: "妹妹", say: "他什么时候回来？", d: 2.8, cam: { kind: "shot", x: 37.2, y: 1.3, dist: 5.5 } },
              { stage: "娘没能答上来，只把她搂得更紧。", d: 3.2, cam: { kind: "shot", x: 37.2, y: 1.3, dist: 5.5 } },
            ]);
          } },
        { id: "spot", x: 40.6, r: 1.4,
          on: (state) => { FlashPose(state, "kneel", 1.4); } },
      ],
      main: (state) => {
        const q = FindActor(state, "qishu");
        if (q) { q.visible = true; q.level = "surface"; q.x = 58; q.heading = -1; q.carry = null; q.cineTarget = { x: 48.8 }; q.cineSpeed = 3.2; }
        StartMicroCine(state, [
          { stage: "", d: 2.0, cam: { kind: "shot", x: 48, y: 1.5, dist: 7 },
            on: (state2) => { state2.player.cineWalk = { x: 48.8, speed: 2.6 }; } },
          { who: "七叔", say: "站住。你现在追上去，就是再让他们抓一个。", d: 4.2,
            cam: { kind: "ots", subject: "qishu", other: "player", dist: 4.0 },
            on: (state2) => { state2.player.cineWalk = null; } },
          { who: "柱子", say: "那我爹怎么办？", d: 2.8,
            cam: { kind: "ots", subject: "player", other: "qishu", dist: 3.8 } },
          { who: "七叔", say: "我去打听他们把人押到哪个炮楼，区里也会想办法。你先留下——看着你娘和妹妹。", d: 5.8,
            cam: { kind: "ots", subject: "qishu", other: "player", dist: 4.0 } },
          { stage: "", d: 2.2, cam: { kind: "shot", x: 47, y: 1.3, dist: 6 },
            on: (state2) => {
              const s2 = FindActor(state2, "sister");
              if (s2) { s2.cineTarget = { x: 46.6 }; s2.cineSpeed = 2.4; }
            } },
          { who: "妹妹", say: "七叔……我爹会回来吗？", d: 3.2, cam: { kind: "shot", x: 47, y: 1.3, dist: 5.5 },
            on: (state2) => { const q2 = FindActor(state2, "qishu"); if (q2) q2.pose = "kneel"; } },
          { who: "七叔", say: "会。你爹一定会回来的。", d: 3.6, cam: { kind: "shot", x: 47.5, y: 1.2, dist: 5 } },
          // 这是护孩子的安慰，不是对结果的保证：他顿了顿才起身
          { stage: "", d: 2.4, cam: { kind: "shot", x: 48, y: 1.4, dist: 6 },
            on: (state2) => {
              const q2 = FindActor(state2, "qishu");
              if (q2) { q2.pose = null; q2.cineTarget = { x: 54 }; q2.cineSpeed = 1.4; q2.heading = 1; }
            } },
          { stage: "刘家院里的哭声，还没有停。", d: 3.2, cam: { kind: "shot", x: 52, y: 1.5, dist: 7.5 },
            on: (state2) => { Cue(state2, "sobBreath", { gain: 0.5 }); } },
          { stage: "", d: 2.6, cam: { kind: "shot", x: 38.5, y: 1.3, dist: 6 },
            on: (state2) => {
              const s2 = FindActor(state2, "sister");
              if (s2) { s2.cineTarget = { x: 36.6 }; s2.cineSpeed = 2.0; }
              const m2 = FindActor(state2, "mother");
              if (m2) { m2.x = 36.2; m2.heading = 1; }
              const q2 = FindActor(state2, "qishu");
              if (q2) { q2.cineTarget = { x: 37.8 }; q2.cineSpeed = 2.2; q2.heading = -1; }
            } },
          { who: "七叔", say: "他们兴许还会杀个回马枪。这口翘着——下一回，一眼就能看出来。", d: 4.8,
            cam: { kind: "insert", x: 37, y: 0.9, dist: 3.8 } },
          { who: "娘", say: "把口盖好。粮还在下面，孩子也还在。", d: 4.4,
            cam: { kind: "shot", x: 37.5, y: 1.3, dist: 5.5 } },
        ]);
      },
    },
    {
      // 第十二场后半：带伤修盖板。第一下必然推歪——松开，喘口气，再握稳。
      // 同一套刨木手感，开头是学手艺，结尾是活下去。没有完成音效，没有奖励
      kind: "plane", id: "c1_repair", timeOfDay: "day",
      zone: { x: 37, w: 3 }, passes: 3, demoTime: 0, injured: true, keySpeed: 0.45,
      boardY: 0.42, doneFlag: "coverFixed",
      cam: { kind: "shot", x: 37, y: 0.8, dist: 2.9 },
      objective: "把踩翘的盖板修平", hint: "按住刨子慢慢来；手抖了就先松开",
      onStart: (state) => {
        const mother = FindActor(state, "mother");
        if (mother) { mother.x = 39; mother.heading = -1; mother.pose = "kneel"; mother.cineTarget = null; }
        // 邻居抱着妹妹坐在门边（她脸上还留着掌印）
        const aunt = FindActor(state, "auntFeed");
        if (aunt) { aunt.visible = true; aunt.x = 33.4; aunt.heading = 1; aunt.track = null; aunt.wander = null; aunt.carry = null; aunt.pose = "kneel"; }
        const sis = FindActor(state, "sister");
        if (sis) { sis.cineTarget = null; sis.x = 33; sis.heading = 1; sis.pose = "leanIn"; }
        const q = FindActor(state, "qishu");
        if (q) { q.cineTarget = { x: 56 }; q.cineSpeed = 1.8; q.heading = 1; q.cineVanish = true; }
      },
      tick: (state) => {
        // 娘在旁边和泥，几次抹到一半停下来，听见动静就抬头望院门
        const b = state.beat;
        b.lookT = (b.lookT || 0) + 1 / 60;
        const mother = FindActor(state, "mother");
        if (mother && b.lookT > 4.2) { b.lookT = 0; mother.heading = mother.heading > 0 ? -1 : 1; }
      },
    },
    {
      kind: "cinematic", id: "c1_end", timeOfDay: "day",
      lines: [
        { stage: "", d: 2.8, cam: { kind: "shot", x: 37, y: 1.1, dist: 5 },
          on: (state) => {
            // 木盖合拢。柱子把刨子拿在手里，没有放下
            GiveItem(state, { id: "plane", label: "刨子" });
            const mother = FindActor(state, "mother");
            if (mother) { mother.pose = null; mother.heading = 1; }
          } },
        { stage: "", d: 3.8, cam: { kind: "shot", x: 52, y: 1.7, dist: 10, pan: 5 } },
        { stage: "土路上已经没有人了，只剩被许多脚踩乱的浮土。", d: 4.6,
          cam: { kind: "shot", x: 58, y: 1.8, dist: 10, pan: 3 } },
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
          cam: { kind: "wide", x: 154, y: 3.4, hw: 11, pan: -18 },
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
        { stage: "浑浊的泥水顺着东口灌下来，先淹的是最低的那一段。", d: 4.2, cam: { kind: "wide", x: 120, y: -1.2, hw: 10.5, pan: -8 },
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
            { stage: "打完那一阵，他才从北边退回来下的地道。接应组已经走在前头了。", d: 4.6, cam: { kind: "wide", x: 60, y: -1.4, hw: 10, pan: -5 },
              on: (state) => { SpawnRescueSquad(state); } },
          ]
          : [
            { stage: "区上武工队来了两个班。佯动组已经摸到村北去了——这边不动，人从地下走。", d: 4.4, cam: { kind: "dark" } },
            { stage: "二更天，地道里一盏灯也没点。", d: 3.2, cam: { kind: "dark" } },
            { stage: "队伍在黑暗里贴着墙根移动，谁也不说话。", d: 3.6, cam: { kind: "wide", x: 40, y: -1.4, hw: 10 },
              on: (state) => { SpawnRescueSquad(state); } },
            { stage: "这条道原本只到墙外的地里。最后那十几步，是这三天连夜掏出来的。", d: 4.6, cam: { kind: "wide", x: 90, y: -1.4, hw: 10, pan: 6 } },
            { stage: "柱子数着步子。掏到牢房地沿，还有两处虚土要清。", d: 4.0, cam: { kind: "wide", x: 120, y: -1.4, hw: 9.5 } },
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

// 白天进村的不是两个兵，是一支队伍（用户拿景区实拍立的规矩）。
// 队形（2026-08-08 用户定，从队头往队尾数）：
//   骑车的伪军探路 → **十个伪军打头** → 挎斗摩托紧贴着他们的后脚跟
//   → **日军五对，两人并排**殿后
// 「谁走在前头」这件事本身就是史实：扫荡的脏活累活（开道、踹门、喊话）
// 派给伪军，日军押在后面。所以画面上先来的一定是本乡本土的那张脸。
//
// **横版里"两人并排"只能靠深度演**：一对人同一个 x，一个在行走线上、一个退后
// 1.2m（`rank: 1` → World 按 ACTOR_RANK_DZ 整体后移人/影子/枪）。透视会把后排那个
// 画小一圈、脚在画面上抬高一点——读出来就是肩并肩。原先六个兵一个个前后跟着，
// 那是行军纵队不是队列。
//
// 伪军这十个**故意不排整齐**：三三两两、间距不匀、几个溜到后排去。
// 队形松散是伪军，队形咬得死的是日军——两支队伍的分别不靠文字说，靠走法说。
//
// 参与潜行判定的仍只有 raid1/raid2——二十几个人一起判视线这段就没法玩了，
// 其余全部 decor：他们负责让「鬼子进村」这四个字在画面上是真的。
const RAID_PUPPETS = 10;      // 打头的伪军
const RAID_JP_PAIRS = 5;      // 日军：五对，每对两人并排
const RAID_SPEED = 2.1;       // 全队基准速度
// 伪军里溜到后排去的那几个（松散的队形靠它，不是靠随机数）
const PUPPET_BACK_RANK = new Set([2, 3, 6, 9]);

// 进村行军的**队序**（从队头/最深处往村口数，gap = 与前一个的米数）。
// 这张表是唯一的真相：入场起手位、行进目标、搜村时的停车位都从它推，
// 别在三处各写一套。
//
// 硬规矩一（用户 2026-08-08 退回过）：**徒步的大部队永远不许超过自行车和摩托**。
// 更老的版本把 raid1/raid2 起手放在 152/160、车却在 166/170——两个步兵从第一帧
// 起就走在车前头，整支队伍读出来是"步兵开路、车在后面追"。队序写死在这里，
// 而且全队走一样远、速度差压到 0.1 以内：差一大，走上二十秒谁都能把谁套圈。
//
// 硬规矩二（用户 2026-08-08）：**打头的是十个伪军**，摩托紧贴在他们后脚跟，
// 日军两人并排殿后，摩托与日军之间只留 3.2m（原来 12m，用户："有点远了"）。
// 谁走在前头这件事本身就是史实：开道踹门的脏活派给伪军，日军押在后面。
// 并排的一对**必须同速**（sp 不给微差）——差 0.05 m/s 走十二秒就是 0.6m，
// 一对人当场被拉成一前一后，正是要改掉的那个毛病。
function BuildRaidOrder() {
  const out = [{ id: "bikeScout", gap: 0 }];     // 骑车的伪军探路，队头
  for (let i = 0; i < RAID_PUPPETS; i += 1) {
    out.push({
      id: "c1pup" + i, gap: i === 0 ? 3.0 : 1.3,
      rank: PUPPET_BACK_RANK.has(i) ? 1 : 0,
      sp: RAID_SPEED + ((i % 3) - 1) * 0.05,     // 松散：走走停停的微差
    });
  }
  out.push({ id: "traitor", gap: 1.9 });         // 带路递名单的翻译官走在伪军队尾
  out.push({ id: "motoLead", gap: 2.0 });        // 挎斗摩托压着伪军的后脚跟
  out.push({ id: "officer", gap: 3.2 });         // 军官走在日军队列的头里
  for (let i = 0; i < RAID_JP_PAIRS; i += 1) {
    out.push({ id: "c1jpF" + i, gap: i === 0 ? 1.6 : 2.0 });
    // 后排那个只错开一掌：并排的两个人在侧视里几乎重叠，露出去的是后面那个的
    // 头、肩和枪管（真正把"并排"演出来的是 rank，见 ACTOR_RANK_DZ）
    out.push({ id: "c1jpB" + i, gap: 0.22, rank: 1 });
  }
  // 进院子的那两个（下一幕的考官）压在队尾。**别把他们塞进摩托和日军中间**：
  // 那样摩托到日军队列头就隔了 9m，正是用户嫌远的那一段。他们俩反正在
  // onDone 里会被摆到院门外的街上，在队里站哪儿只影响这一镜的构图
  out.push({ id: "raid1", gap: 2.4 });
  out.push({ id: "raid2", gap: 2.4 });
  return out;
}
const RAID_ORDER = BuildRaidOrder();
const RAID_LEAD_X = 148;            // 队头（自行车）入场时的位置（已进了村东口）
const RAID_START_X = (() => {
  const m = new Map();
  let x = RAID_LEAD_X;
  for (const e of RAID_ORDER) { x += e.gap; m.set(e.id, x); }
  return m;
})();
/** 队序里每个人的入场 x（队头最靠西/最深入村） */
function RaidStartX(id) { return RAID_START_X.get(id) ?? RAID_LEAD_X; }

function SpawnRaidSoldiers(state) {
  // 军官（kind "officer"）与被抓的乡亲（kind "villager"）都不是 IsEnemy，
  // 光按敌我过滤会在重复生成时叠出两份，得连 id 一起清
  state.actors = state.actors.filter((a) => !IsEnemy(a)
    && a.id !== "officer" && !a.id.startsWith("taken"));
  state.actors.push(
    MakeActor("raid1", "soldier", 120, { patrol: [58, 120], speed: 1.5 }),
    MakeActor("raid2", "soldier", 88, { patrol: [50, 90], speed: 1.35 }),
    // 带队的军官：单独一种外观 kind（将校呢深一档 + 大檐帽 + 连鞘军刀），
    // 三样加起来在 6m 的审问近景下一眼分得出他不是普通兵。
    // 他不参与潜行判定——考场只准两个兵；kind 不是 soldier/puppet，
    // 所以 SpawnRaidSoldiers 开头那道 IsEnemy 过滤扫不掉他，得点名清
    MakeActor("officer", "officer", RaidStartX("officer"), {
      label: "日军军官", decor: true, heading: -1, carry: "军刀",
    }),
    // 据点的翻译官：带路的、递名单的。decor——他不参与潜行判定（两个兵
    // 已经把考场撑满了），但他得在场：第二章挑灯笼带路的、审问时递话的，
    // 都是这一个人。汉奸不是符号，是个有脸的邻人，才可恨。
    // 他走在伪军队尾、摩托前头——名单在他手上，两头都得照应
    MakeActor("traitor", "puppet", RaidStartX("traitor"), { label: "翻译官", decor: true, heading: -1 }),
    // 骑车的伪军：车是他自己的，腿上的活也是他自己的（蹬踏跟着位移走）。
    // carry:"" 压掉兵默认的手持步枪——骑车的手在车把上，枪是背着的
    // lift = 座高 − 站立胯高(≈0.60m)。给多了人就浮在车上面，给少了像蹲在车边
    MakeActor("bikeScout", "puppet", RaidStartX("bikeScout"), { label: "骑车的伪军", decor: true, mount: "bicycle", pose: "rideBike", lift: 0.17, heading: -1, carry: "" }),
    // 挎斗摩托：驾驶的兵 + 挎斗里的兵（钉在车侧，跟着车走）
    MakeActor("motoLead", "soldier", RaidStartX("motoLead"), { label: "摩托驾驶", decor: true, mount: "motorcycle", pose: "rideMoto", lift: 0.32, heading: -1, carry: "" }),
    MakeActor("motoSide", "soldier", RaidStartX("motoLead") + 0.5, { label: "挎斗里的兵", decor: true, pose: "sitSide", lift: 0.22, heading: -1, carry: "", pinTo: { id: "motoLead", dx: 0.5 } }),
  );
  // 徒步的两段（位置与排别全从队序表来）：
  //   打头的十个伪军——松散，几个溜到后排去；
  //   殿后的日军五对——两人并排，队形咬得死。
  // 两支队伍的分别不靠文字说，靠走法说
  for (const e of RAID_ORDER) {
    if (!e.id.startsWith("c1pup") && !e.id.startsWith("c1jp")) continue;
    state.actors.push(MakeActor(e.id, e.id.startsWith("c1pup") ? "puppet" : "soldier",
      RaidStartX(e.id), { decor: true, heading: -1, rank: e.rank || 0 }));
  }
  // 被叫出来的邻居。抓走的不止木匠一个——这一条是"扫荡"两个字的分量所在：
  // 名单上写的是手艺人（爹是木匠、西头的铁匠上回就被掳走了），顺手还要壮劳力。
  // 全 decor、全撂在东街（x≥110），一个不进考场
  const TAKEN = [
    { id: "taken0", label: "赵家的老三", x: 121.5 },
    { id: "taken1", label: "碾房的王二", x: 124.6 },
    { id: "taken2", label: "李婶家的男人", x: 127.4 },
  ];
  for (const t of TAKEN) {
    state.actors.push(MakeActor(t.id, "villager", t.x, {
      label: t.label, decor: true, heading: 1, pose: "kneel", visible: false,
    }));
  }
  state.stealthActive = true;
}

/** 队列里每个 decor 兵的 id，从队头数到队尾（进村行军 / 散开搜村共用一份名单） */
function RaidColumnIds() {
  const out = [];
  for (let i = 0; i < RAID_PUPPETS; i += 1) out.push("c1pup" + i);
  for (let i = 0; i < RAID_JP_PAIRS; i += 1) out.push("c1jpF" + i, "c1jpB" + i);
  return out;
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
    elmRain: null,
    planing: null,
    planeCurl: null,
    scribe: null,
    // 铺满画框、每帧重画的手绘活卡：做功的那两拍都长在卡上
    scribeCard: null,      // 划线（见 StepScribe）
    planeCard: null,       // 刨料（见 StepPlane）
    doorLeaf: null,        // 那扇会晃的家门（过场里演、玩法里扶）
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
      bucketAt: null, raidStarted: false, villageAlarm: false, thimbleFound: false,
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
  state.elmRain = null;
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
    state.flags.marked = false;   // 门框重新变回空的：这道浅痕是爹量身时补的
    state.flags.barrowPlanks = 0;
    state.flags.barrowHome = false;
    state.flags.henFlew = false;
    state.flags.wellRopeBroken = false;
    state.flags.ropeTaken = true;    // 老玩法的木料堆绳头永远不再露出来
    state.flags.bucketAt = null;
    state.flags.raidStarted = false;
    state.flags.villageAlarm = false;   // 重玩本章：背景乡亲回到地里接着干活
    state.flags.waterFilled = false;
    state.flags.planedOnce = false;
    // 新版第一章的旗标（修门/定向/刨盖板/修井绳/榆钱/挖通道/藏粮/余波修复）
    state.flags.doorFixed = false;
    state.flags.doorSeated = false;
    state.flags.ropeStaked = false;
    state.ropeLine = null;             // 重玩本章：那根定向绳连同它的质点全部作废
    state.flags.coverPlaned = false;
    state.flags.wellRopeFixed = false;
    state.flags.elmDown = false;
    state.flags.bracedA = false;
    state.flags.bracedB = false;
    state.flags.tunnelDug = false;
    state.flags.grainHidden = false;
    state.flags.nookClosed = false;
    state.flags.fatherTaken = false;
    state.flags.coverFixed = false;
  }
  if (index === 1) { state.flags.dogFed = false; state.flags.lanternOut = false; }
  if (index <= 4) { state.flags.quiltPlugged = false; state.flags.trapBuilt = false; }
  if (index === 4) { state.flags.dogFed2 = false; state.flags.bellBuilt = false; }

  if (ch.id === "c1") {
    state.player.x = 37.5;
    state.actors.push(
      // 天刚亮：爹坐在门边修那扇晃了半个月的门，娘和妹妹都在院里——
      // 新剧本第一场是一家四口的清晨，不是空院子
      MakeActor("father", "father", 33.2, { label: "爹", heading: 1 }),
      MakeActor("mother", "family", 30.8, { label: "娘" }),
      MakeActor("sister", "sister", 31.8, { label: "妹妹" }),
      // 新剧本的人物（按场次亮相，先建出来藏着——SettleBeat 结算跳幕要能找到人）
      MakeActor("qishu", "villager", 176, { label: "七叔", visible: false }),
      MakeActor("xiaozhou", "militia", 176, { label: "小周", visible: false }),
      MakeActor("laotian", "villager", 176, { label: "老田", visible: false }),
      MakeActor("liusao", "villager", 62.8, { label: "刘嫂", carry: "襁褓", visible: false }),
      MakeActor("liuElder", "villager", 60.6, { label: "刘家老人", visible: false, carry: "桶" }),
      MakeActor("sentry", "militia", 90, { label: "放哨的民兵", visible: false }),
      MakeActor("diggerA", "villager", 40.5, { label: "帮工的乡亲", level: "under", visible: false }),
      MakeActor("diggerB", "villager", 42.5, { label: "帮工的乡亲", level: "under", visible: false }),
      // 街上还有别人家的日子在过：李婶在鸡窝前撒食，东头的老汉扫院。
      // 人人手上有活的规矩不只管自家人——一条整街只有一家四口才是真的说不过去。
      // 保甲清查一开始就都收进屋（c1_roster 立 villageAlarm），鸡跟着 raidStarted 旗标藏
      MakeActor("auntFeed", "villager", 65.8, { label: "李婶", heading: -1, track: { name: "scatterFeed", t: 0, ambient: true } }),
      MakeActor("oldSweep", "villager", 145.5, { label: "扫院的老汉", heading: 1, carry: "扫帚", track: { name: "sweeping", t: 0, ambient: true } }),
      // 再添两个有营生的：担水的在井台和家门之间来回（wander），
      // 碾糠的大娘守着石碾——开场第三空镜（交完粮、碾上碾的是糠）拍的就是她，
      // 她也是老槐树下妹妹身边的大人（孩子不是孤零零撂在村东头）。
      // 夜里（c1_break）与清查（c1_roster）都会把街清空
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
  // 新剧本第一章是"连续一昼夜"：光照档写在 beat 的 timeOfDay 上，进拍即生效
  //（不能叫 light——那个名字归周期灯光 hazard 的配置）。
  // 没写的 beat 沿用上一拍的档——调试跳幕沿途重放 EnterBeat，自然结算到位
  if (def.timeOfDay) state.lightOverride = def.timeOfDay;
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
  state.doorLeaf = null;
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
  // 过场里那扇门自己动：swing=风一过就磕框，tryLift=爹一个人往上托、托不住又坠回去。
  // 玩法段的门由 holdDoor 每帧重写 doorLeaf，不走这儿。
  if (state.doorLeaf && (state.doorLeaf.swing || state.doorLeaf.tryLift)) {
    const d = state.doorLeaf;
    d.t = (d.t || 0) + dt;
    if (d.swing) {
      // 越晃越小的摆，到底磕一下
      const a = Math.exp(-d.t * 0.5) * 0.055;
      const prev = d.lean;
      d.lean = DOOR_SAG - Math.abs(Math.sin(d.t * 2.6)) * a * 2;
      if (prev !== undefined && d.lean >= DOOR_SAG - 1e-3 && prev < DOOR_SAG - 1e-3) {
        Cue(state, "tenon", { gain: 0.45 });
      }
    } else {
      // 托起来（0→0.9 秒）→ 手上没劲，坠回去（0.9→1.8 秒），循环
      const k = (d.t % 1.9) / 1.9;
      const lift = k < 0.47 ? (k / 0.47) : Math.max(0, 1 - (k - 0.47) / 0.42);
      const e = lift * lift * (3 - 2 * lift);
      d.lean = DOOR_SAG * (1 - e * 0.82);
      if (k > 0.9 && !d.thud) { d.thud = true; Cue(state, "tenon", { gain: 0.7 }); }
      if (k < 0.1) d.thud = false;
    }
  }
  // 后果小窗到时收起；onEnd 给"看完这一眼之后"的收尾用（娘接着锄地）
  if (state.pip && (state.pip.t -= dt) <= 0) {
    const done = state.pip;
    state.pip = null;
    done.onEnd?.(state);
  }
  // 小活物的一次性动画：麻雀炸窝、母鸡扑棱、田鼠蹿走——各自跑完就清
  for (const key of ["sparrowBurst", "henFlee", "mouseFlee", "vaultDust", "elmRain"]) {
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
  // 绳解在走位之后：绳拽人这一下要盖住这一帧刚走出去的那一步
  StepRopeLine(state, def, dt);
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
    case "linger": StepLinger(state, def, input, dt); break;
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

  // 上下梯子：**人真的在梯子上挪**，不是换个层数。
  //
  // 上一版是 `p.level = "under"; p.climbT = 0.55`——层数当帧就翻了，渲染层照
  // `level` 取地平线，人当场瞬移到井底，然后在井底原地摆 0.55 秒爬梯姿势。
  // 玩家看见的就是"瞬移 + 没有攀爬动作"。
  //
  // 现在：层数照旧当帧翻（碰撞/视线/玩法都按目的层算，不留中间态），但渲染的
  // 高度由 p.lift 从原来那层缓到目的层——World 的 UpdateOne 本来就画 ground+lift
  // （翻越用的是同一条路）。3.6 米的井，下去 1.5 秒、上来 2.0 秒（上梯子费劲），
  // 每挪过一档横档响一声，手上才有"在爬"的实感。
  if (p.climbT > 0) {
    p.climbT = Math.max(0, p.climbT - dt);
    const destY = p.level === "under" ? UNDER_Y : SURFACE_Y;
    const k = p.climbDur > 0 ? p.climbT / p.climbDur : 0;      // 1 → 0
    const e = k * k * (3 - 2 * k);                             // 起步收势各缓一点
    p.lift = (p.climbFrom - destY) * e;
    // 一档一档地响：按真正挪过的距离发，不是定时循环——快慢都对得上
    const gone = Math.abs(p.climbFrom - destY) * (1 - e);
    const rung = Math.floor(gone / LADDER_RUNG);
    if (rung !== p.rung) { p.rung = rung; Cue(state, "ladder", { gain: 0.42 }); }
    if (p.climbT <= 0) { p.lift = 0; p.climbDur = 0; }
    p.moving = false;
    state.climbHint = "";
    state.vaultHint = "";
    return;                                                    // 爬梯中锁操作
  }
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
  const inTunnel = p.level === "under"
    && (env === "tunnelVillage" || env === "tunnelFort"
      || (env === "village" && !!scene.tight?.length));
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
        p.x = shaft.x; StartClimb(state, "surface", CLIMB_UP);
      } else if (input.climb > 0 && p.level === "surface" && scene.walk.under) {
        p.x = shaft.x; StartClimb(state, "under", CLIMB_DOWN);
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
    // 玩家在梯子上的时候，跟着走的人也得在梯子上——层数是跟着翻的，
    // 高度不跟就成了"你一格一格爬，妹妹在井底等你"。她慢半拍（落后一档多），
    // 一前一后下同一架梯子；等你落地她也就到了。
    if (p.climbT > 0) {
      const destY = p.level === "under" ? UNDER_Y : SURFACE_Y;
      const span = p.climbFrom - destY;                     // 下井为正，上井为负
      a.x = p.x;
      a.heading = p.heading;
      a.climbing = true;
      a.crouch = false;
      // 夹在两头之间：不许爬出井口，也不许穿到井底以下
      const lag = Math.sign(span) * 0.55;
      a.lift = span > 0 ? Math.min(span, p.lift + lag) : Math.max(span, p.lift + lag);
      continue;
    }
    a.climbing = false;
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
// 余波：日军离开后不立刻派活。玩家可以走向院门/妹妹/爹倒下的地方，
// 每处有一小段反应；走到院门（或等足时间）触发主线（七叔回村拦人），
// 主线的微过场演完这一拍才结束。没有目标文本，也不会软锁。
function StepLinger(state, def, input, dt) {
  const b = state.beat;
  if (b.lingerT === undefined) { b.lingerT = 0; b.touched = {}; b.mainFired = false; }
  b.lingerT += dt;
  if (b.mainFired) {
    if (!state.microCine) AdvanceBeat(state);
    return;
  }
  for (const t of def.touches || []) {
    if (b.touched[t.id]) continue;
    if (Math.abs(state.player.x - t.x) > (t.r || 1.6)) continue;
    b.touched[t.id] = true;
    t.on?.(state);
  }
  const gate = def.mainAt && Math.abs(state.player.x - def.mainAt.x) <= (def.mainAt.r || 2)
    && (state.player.level || "surface") === "surface";
  if ((gate || b.lingerT >= (def.after ?? 30)) && !state.microCine) {
    b.mainFired = true;
    def.main?.(state);
  }
}

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
        // 扶门是"费力气"的活，留了按住 E 的后备（CLAUDE.md 第 5 条），驱动器走它
        case "holdDoor": return { action: "holdAt", x: st.zone.x, level: st.zone.level || "surface" };
        // 接绳没有长按后备（用户明令删掉），驱动器只能**真的顺着绳拖**——
        // 所以把绳子的那条路（世界坐标）整条交出去，自动通关照着走一遍。
        // 删后备就必须同时给驱动器一条真输入的路，漏了这一步会当场卡死。
        case "knot": {
          const kx = st.zone.x, ky = SURFACE_Y + (st.knotY ?? 1.5);
          const path = [];
          for (let i = 0; i <= 24; i += 1) {
            const q = KnotPointAt(i / 24);
            path.push([kx + q[0], ky + q[1]]);
          }
          return {
            action: "knotAt", x: st.zone.x, level: st.zone.level || "surface",
            cx: kx, cy: ky, path,
          };
        }
        case "throwHit": {
          if (!p.item) return { action: "interactAt", x: st.pickupX, level: "surface" };
          // 站位选在捡石子那一侧：从东边捡来就站东边朝西投（免得驱动器
          // 绕到目标另一头，半路还得掉头）
          const side = st.pickupX >= st.target.x ? 1 : -1;
          return { action: "throwAt", x: st.target.x + side * 6, level: "surface", face: -side };
        }
        case "talk": {
          const a = FindActor(state, st.actor);
          return a ? { action: "interactAt", x: a.x, level: a.level || "surface" } : null;
        }
        case "push": return { action: "pushAt", x: state.cart ? state.cart.x : st.from, dir: st.dir };
        case "goto": return { action: "walk", x: st.zone.x, level: st.zone.level || "surface" };
        case "brace": {
          const z = (st.zones || []).find((zz) => zz.ok && !state.flags[zz.flag]);
          return z ? { action: "interactAt", x: z.x, level: st.level || "under" } : null;
        }
        case "winch": {
          const w = state.beat.winch;
          if (w && !w.hooked) return { action: "interactAt", x: st.zone.x, level: st.zone.level || "surface" };
          return { action: "winchAt", x: st.zone.x, level: st.zone.level || "surface" };
        }
        default: return null;
      }
    }
    case "linger": {
      if (state.beat.mainFired) return { action: "advance" };
      return def.mainAt ? { action: "walk", x: def.mainAt.x, level: "surface" } : { action: "advance" };
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

// 画框边缘的指路标（勇敢的心式）：目标出了画框、又离玩家真的远时，路标
// 不该跟着目标一起消失在框外——它滑到画框边缘、掉个头指向框外，「下一步
// 在这边」。目标在另一层的，先指向能用的爬梯口（横轴上路总要先经过它），
// 并带上「下去/上来」的竖向记号；已经站在梯口的不指（上下怎么走交给爬梯提示）。
// 纯函数：镜头在哪、画多宽由渲染层喂进来，这里只管"该不该指、指哪边"。
export function EdgeHint(state, camX, viewW) {
  if (state.phase !== "playing" || state.microCine) return null;
  // 特写/活卡里没有"远方"：手上的活正做到一半，别拿路标打岔
  if (state.closeUp || state.scribeCard || state.planeCard) return null;
  const def = CurrentBeatDef(state);
  if (!def || def.kind === "cinematic") return null;
  const tg = GetBeatTarget(state);
  if (!tg || typeof tg.x !== "number") return null;
  const p = state.player;
  let tx = tg.x;
  let climb = null;
  if ((tg.level || "surface") !== p.level) {
    const scene = SceneOf(state);
    const shafts = (scene.shafts || []).filter((s) =>
      (!s.builtFlag || state.flags[s.builtFlag]) && !(state.flags.entWBlocked && s.id === "entW"));
    let best = null, bd = Infinity;
    for (const s of shafts) {
      const d = Math.abs(p.x - s.x);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return null;
    if (Math.abs(p.x - best.x) < 2.5) return null;
    tx = best.x;
    climb = (tg.level || "surface") === "under" ? "down" : "up";
  }
  const offscreen = Math.abs(tx - camX) > viewW / 2 - 1.2;
  const far = Math.abs(tx - p.x) > 4.5;
  if (!offscreen || !far) return null;
  return { side: tx < camX ? -1 : 1, climb };
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
    case "linger": return def.mainAt ? { x: def.mainAt.x, level: "surface" } : null;
    default: return null;
  }
}

function SettleBeat(state, def) {
  const dest = SettleDest(def);
  if (dest && dest.x !== undefined) {
    state.player.x = dest.x;
    // zone 的层语义：没写 level 就是地表（InZone 同一条规矩）。
    // 以前"没写就不动"——上一拍在地下结算过，之后每一拍都赖在地下不上来
    state.player.level = dest.level || "surface";
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
    case "linger":
      def.settle?.(state);
      break;
    case "chain":
      for (const st of def.steps || []) {
        if (st.noteAdd) state.flags.notesSeen.push(st.noteAdd);
        if (st.type === "brace") for (const z of st.zones || []) { if (z.ok && z.flag) state.flags[z.flag] = true; }
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
