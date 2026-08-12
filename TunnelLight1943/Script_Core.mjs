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
// 善意的谎言=那句「快了」；地洞里的眼睛=黑洞口回望那一镜；
// 半袋烟的工夫=换岗的空当，学会看的那一课；最后一盏灯=熄灯后攥在手里的那盏；
// 东口的铃=改造的回报；没套的骡车=推理的破绽本身。
// （一二章 2026-08-11 按 Notion「剧本新生」重写；三章起仍是旧线，待逐章翻新）
export const CHAPTERS = [
  { id: "c1", num: "第一章", title: "善意的谎言", year: "1942 · 华北敌后 · 梁家村", scene: "village", light: "day" },
  { id: "c2", num: "第二章", title: "地洞里的眼睛", year: "1942 · 谷雨后 · 梁家村", scene: "village", light: "day" },
  { id: "c3", num: "第三章", title: "半袋烟的工夫", year: "1943 · 据点外的庄稼地", scene: "fields", light: "night" },
  { id: "c4", num: "第四章", title: "最后一盏灯", year: "1943 · 沙河庄地道", scene: "tunnelVillage", light: "tunnel" },
  { id: "c5", num: "第五章", title: "东口的铃", year: "1943 · 夏 · 沙河庄地道", scene: "tunnelVillage", light: "tunnel" },
  { id: "c6", num: "第六章", title: "没套的骡车", year: "1943 · 押送前夜", scene: "fields", light: "night" },
  { id: "c7", num: "第七章", title: "地道里的光", year: "1943 · 据点地道", scene: "tunnelFort", light: "dark" },
  { id: "c8", num: "第八章", title: "第二道刻痕", year: "一个月后 · 梁家村", scene: "village", light: "dawn" },
];

// 对外开放到第几章为止（其余的还在做，标题页进不去，第一章打完直接收尾）。
// 这是**发行口径**，不是玩法规则：八章的脚本、跳幕、自动通关测试仍然整份都在，
// 门槛只由外壳（Script_Main）把守——把这个数改成 CHAPTERS.length 就全开了。
export const PLAYABLE_CHAPTERS = 2;

// 征夫告示的逐字转录：阅读层右栏的权威版本——铅字排出来给玩家读，
// 不指望生成图上的毛笔小字（关卡设计文档明令「右侧文字是权威版本」）。
// 不配柱子朗读旁白：他识不识字是人物设定，不该由一块 UI 替他决定。
//
// **左图与右文故意不同形**：左边那张实物是 1942 年该有的样子——繁体、竖排、
// 自右向左（横排左起是 1955-56 年以后的事；简化字方案是 1956 年）。右边这份
// 是给今天玩家看的**转录**，照现代正字法排，不是摹本。博物馆的做法就是这样。
// 实物由 Script_TypesetNotice.py 排版生成（生图模型排不了繁体竖排，只出白纸）。
export const ZHENGFU_NOTICE = {
  title: "征　夫　告　示",
  lines: [
    "奉上级命令，修筑东路炮楼并开挖封锁沟。各保甲依册派夫，不得短少。",
    "一、凡十六岁以上、五十岁以下壮丁，由各甲按册点派。本班限三月十二日卯时，在村东口听候点名。",
    "二、每名自带铁锹或镐头一件、绳索一条、铺盖一卷、干粮七日。",
    "三、服役七日，由下一班换替；未奉令不得擅自离工。",
    "四、牲口、大车及木石草料，另照各甲所派数交齐。",
    "五、无故不到、迟到、逃役、顶替或藏匿者，连保追究；扣粮封门，并拿送究办。",
    "各户即刻知照，毋违。",
  ],
  date: "中华民国三十一年三月初十",
  signs: ["本区公所", "梁家村保公所"],
};

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
function InZone(px, level, zone) {
  const zoneLevel = zone.level || "surface";
  return level === zoneLevel && Math.abs(px - zone.x) <= zone.w / 2;
}

function SceneOf(state) { return SCENES[CHAPTERS[state.chapterIndex].scene]; }

// ---------------------------------------------------------------------------
// 屋里 / 屋外（可进入的屋子只有柱子家一处，规则却是全作的）
//
// 2.5D 横版里，玩家走的那条线是**村街**，屋子立在街后面。走进屋子那一段路
// 就把立面淡出——这是勇敢的心的里外切换，走路时没毛病；可它只看 x，于是
// **推着独轮车也能"进屋"**：从西边推过来，等于推着一车木料穿过自家后墙，
// 从堂屋里碾过去（用户 2026-08-09：「我推车为什么能推到家里去？这明明应该
// 走外面的小路的」）。
//
// 规矩：**车进不了屋**。手边有车（推着走）或车就停在屋前那段街上时，人走的
// 是屋外那条道——立面合着，人和车从屋子前面过去。空着手才是进屋。
// 配套的深度在 Data_DepthSpec：推着的车走 pushCart 带（压在立面之前），
// 否则立面会把整辆车吃掉，"从屋前过"就成了"车凭空消失"。
// ---------------------------------------------------------------------------
export const CART_REACH = 2.6;   // 手边有车 = 推着它（翻越判定用的是同一个数）

// ---------------------------------------------------------------------------
// 镜头会不会自己动：**总开关，默认关**
// ---------------------------------------------------------------------------
// 2026-08-10 用户定：「目前我看不需要这个自动摇动镜头的功能，把这个开关/功能
// 默认关闭吧」。所以窖口探头（走到地窖口镜头自动下沉、把脚底下那间窖带进画框）
// 整个停用——镜头**只跟着人走**，不自己找东西看。
//
// 机制照旧留在代码里（Core 算 cellarPeek、Main 的 BaseShot 用它压低 y、
// state.steadyCam 那套让位判据都在），要回来只需把这一行改成 true。
// 代价说在前头：关掉之后，站在窖口按 S 之前是看不见那间窖的——
// 地表机位的下边沿只到 −1.7m，窖底在 −3.6m。真要让玩家"下去之前先看见"，
// 下次换别的路子（一拍固定机位的插入镜、或者过场里交代），别再默认开自动摇镜。
export const CAM_CELLAR_PEEK = false;

export function PushingCart(state) {
  return !!state.cart && Math.abs(state.player.x - state.cart.x) < CART_REACH;
}

// 屋子占的那一段街。判定与画面共用一份边界——分开写迟早对不上
// （西头留 0.4 是山墙的厚度，东头多给 0.2 是门洞外那半步）
export function HouseSpan(prop) {
  return { x0: prop.x - prop.w / 2 + 0.4, x1: prop.x + prop.w / 2 + 0.2 };
}

// 立面该不该淡出（渲染层与冒烟测试同一个判据）
export function IndoorOpen(state, x0, x1) {
  const p = state.player;
  if (p.level !== "surface" || !(p.x > x0 && p.x < x1)) return false;
  if (state.cart && (PushingCart(state) || (state.cart.x > x0 && state.cart.x < x1))) return false;
  return true;
}

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
// —— 门的分量（2026-08-09 用户退回「一点重量感也没有」，从跟手运动学改成真动力学）——
// 门有角速度、有惯性；重力永远在把它往外拉，手给的是一个**有上限的**对抗力。
// 于是：撒手是越坠越快的，不是匀速滑走；接住一扇正在坠的门，它还会带着你的手
// 沉半拍才停；把它从磕框的位置推回正位，是在跟它的分量较劲，快不起来。
const DOOR_G = 1.15;         // 重力角加速度尺度（rad/s²）
const DOOR_BIAS = 0.32;      // 轴歪出来的常量分量：立得再正它也不肯自己站住
const DOOR_HAND = 2.6;       // 手最大能给的角加速度（攥在门下沿、力臂最长时）
const DOOR_SPRING = 26;      // 手的"弹簧"刚度：门追手位，但隔着自己的分量追
const DOOR_DAMP = 7.5;       // 攥住时的阻尼——接坠门时吃掉动量的就是它
const DOOR_KICK = 0.55;      // 爹每礅一下轴，震劲顺门框传上来，门往外弹的角速度
const DOOR_SEAT_N = 4;       // 礅几下轴才咬进臼窝（进度按下数走，不按秒表走）
const DOOR_KEY = 0.42;       // 键盘后备：按住 E 把门扶正的角速度
// 这一拍必须推特写：默认跟随景别 12.6m 宽，一扇 0.83m 的门在手机上才 55 像素，
// 又是"要按住它、还要稳住"的活——按不着也稳不住（刨子那次就是这么被退回的）
// 这一拍的主体是**门脚下那根轴和它要礅进去的臼窝**，不是整扇门：机位钉在
// 膝盖那么高（0.72m）而不是胸口——1.15m 那一版把轴正好压在屏幕底部那条提示条
// 底下，玩家一整拍都没看见自己在修什么（用户 2026-08-10）
const DOOR_CAM = { y: 0.72, hw: 2.45 };

const CLIMB_DOWN = 1.5;
const CLIMB_UP = 2.0;
const LADDER_RUNG = 0.34;    // 横档间距：每挪过一档响一声，声音跟着人走

// 层数当帧就翻（碰撞/视线/玩法一律按目的层算，不留半层的中间态），
// 渲染高度另走 p.lift 从原来那层缓过去。两件事分开，玩法才不会出现"半层人"。
// 窖口上有盖板：一块抹了泥灰做旧的旧门板（正是 c1_plane 刨出来的那块）。
// 上下地道不是"人从地面沉下去"，是**掀开盖板 → 爬 → 把盖板拉回来盖上**。
// 三段共用一个计时器（`p.climbT`）：
//   掀盖 LID_OPEN → 爬 travelDur → 盖回 LID_SHUT
// 分三段而不是三个状态机，是因为「落地归零」那套断言盯的是 lift 的单调性——
// 掀盖那段 lift 停在起点、盖回那段停在终点，只降不升仍然成立。
const LID_OPEN = 0.45;       // 掀开：土封的边先崩开，板子立起来
const LID_SHUT = 0.50;       // 盖回：从底下伸手够着拉，比掀开慢一点

function StartClimb(state, toLevel, dur, shaftId) {
  const p = state.player;
  const fromY = p.level === "under" ? UNDER_Y : SURFACE_Y;
  const destY = toLevel === "under" ? UNDER_Y : SURFACE_Y;
  p.level = toLevel;
  p.travelDur = dur;
  p.climbDur = LID_OPEN + dur + LID_SHUT;
  p.climbT = p.climbDur;
  p.climbFrom = fromY;
  p.lift = fromY - destY;
  p.rung = 0;
  p.moving = false;
  p.crouch = false;           // 梯子上不猫腰：进地道那一下的弓背等落地再说
  p.pose = null;              // 手上的活到梯子这儿一律让位给爬的姿势
  // 从这一帧起镜头交给 lift（BaseShot 读它一档档跟着人下去）：窖口探头当场让位，
  // 不然这一帧两个来源叠着压，画面会先多沉一下再弹回来
  state.cellarPeek = 0;
  // 盖板归渲染层读：id 说是哪个窖口，open 是 0..1 的掀开量
  state.lid = { id: shaftId || null, open: 0 };
  Cue(state, "dig", { gain: 0.34 });        // 土封的边崩开，先是一下刮土
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
// 接绳（把断了的井绳和找来的麻绳接上）——打的是**单编结**（水手结）
//
// 这一拍被退回过三次，三条理由都写死在这儿：
// ① **绕圈是缠辘轳轴的动作，不是接绳的动作**（2026-08-08）。
// ② **在世界里做，谁也看不出那是在打结**（2026-08-10）——1.5m 半宽的井口特写
//    下整个结才 0.23m，八分之一个画宽。所以搬上了铺满画框的活卡。
// ③ **穿一下、再拽三下，那压根不是个结**（2026-08-10 用户：「井里绳子打结的
//    打结玩法一点都不符合直觉 哪有打结是这样的」）。说得对：绳头从一个圈里
//    穿过去再拽，一拉就出来了，什么也没打上。老版还把"勒紧"拆成倒手拽三把
//    ——现实里勒紧是**一把连着拽到底**，倒手三次是游戏味儿，不是绳的味儿。
//
// 现在打的是真结。两根粗细不一样的绳要接，庄稼人打的就是**单编结**
// （sheet bend／水手结）：粗绳折个弯，细绳从弯里穿上来、绕过两股的背面、
// 再从自己那一股底下掖出去，最后一把勒死。粗细不同也咬得住，正是这儿的情形
// （井绳粗、找来的麻绳细）。全过程是**一条连贯的路**，手不用倒，
// 五个关口都是"这一下手往哪儿走"，没有一处是抽象的量：
//
//   ①口   从下面塞进弯口          ②上   从两股中间钻出来
//   ③背   绕到两股背后（左边）     ④底   从底下兜回右边
//   ⑤掖   从自己那一股底下掖出来   → 一把勒到底
//
// 顺带一条真事儿：单编结打完，**两个绳头得在同一侧**——不在同侧那是"左手
// 单编结"，吃劲就松。所以麻绳从右下角进画，掖完绳头也甩在右上，和井绳
// 那个断头一边儿。
//
// 坐标一律用「卡宽」单位：x ∈ 0..1，y ∈ 0..1/aspect（＝卡高）。指针落点
// (pointerCard.u, .v) 换算成这套坐标是 { x: u, y: v / aspect }。
// **判定与作画共用这一份**，Art 里绝不许另抄一套。
export const KNOT_CARD = {
  aspect: 16 / 9,
  // 井绳：折回来的那个弯（U 的闭口端在左，开口朝右），两股往右岔开
  bend: { x: 0.215, y: 0.290, r: 0.074 },
  legUp: [{ x: 0.215, y: 0.216 }, { x: 0.44, y: 0.172 }, { x: 0.66, y: 0.112 }, { x: 0.80, y: -0.08 }],
  legLow: [{ x: 0.215, y: 0.364 }, { x: 0.44, y: 0.392 }, { x: 0.645, y: 0.402 }],
  anchor: { x: 1.06, y: 0.505 },          // 麻绳从画框右下角进画的那一点
  start: { x: 0.82, y: 0.440 },           // 麻绳头的起手位置
  // 五个关口，**必须按顺序过**：跳着走不算数（那就不是这个结了）。
  // 关键的是三、四两道：**绕的是那两股，不是那个弯**。绕着弯的闭口兜一圈，
  // 绳圈会顺着弯滑到开口那头脱出去——那不叫结，叫套着。绕住两股再掖住自己，
  // 一吃劲两股就把麻绳咬死，这才是单编结管用的地方
  gates: [
    { id: "mouth", x: 0.335, y: 0.294, r: 0.086, hint: "从下面塞进弯口" },
    { id: "up", x: 0.302, y: 0.120, r: 0.080, hint: "从两股中间钻上来" },
    { id: "over", x: 0.585, y: 0.130, r: 0.084, hint: "贴着上股往右挪" },
    { id: "back", x: 0.560, y: 0.470, r: 0.090, hint: "绕到两股背后兜下来" },
    { id: "tuck", x: 0.175, y: 0.212, r: 0.080, hint: "从自己那股底下掖出去" },
  ],
  grabR: 0.088,                           // 攥得住绳头的判定半径
  slipR: 0.170,                           // 手飘离绳头这么远就脱手
  speed: 0.95,                            // 绳有分量：一秒最多跟着手走这么多卡宽
  cinchSpeed: 0.13,                       // 勒紧那一把慢得多——**结在咬**，绳一寸一寸地走
  // 绳就这么长（绳头离锚点最远到这儿）。**这个数要留得住勒紧那一把的行程**：
  // 从最后一道关口沿 cinch 方向还得走得完 cinchLen，不然绳头会先被绳长卡住，
  // 剩下那点进度全靠贴着圆弧蹭——实测过一次，一把变成了四秒半的磨。
  reach: 1.18,
  // 勒紧往左上拽：麻绳的另一头在右下角，**两头一拽**结才咬死
  cinchTo: { x: 0.060, y: 0.118 },
  cinchLen: 0.17,                         // 一把要拽走这么多卡宽，结才勒死
  cinchBack: 0.34,                        // 撒手就往回泄（半截的结自己会松）
};

const KnotD = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 勒紧的单位方向（结心 → cinchTo）。判定与作画共用 */
export function KnotCinchDir() {
  const L = KNOT_CARD;
  const dx = L.cinchTo.x - L.bend.x, dy = L.cinchTo.y - L.bend.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

/** 走到第 i 关时绳头该在哪儿（作画的折线、驱动器的落点共用） */
export function KnotWaypoint(i) {
  const L = KNOT_CARD;
  const g = L.gates[Math.max(0, Math.min(L.gates.length - 1, i))];
  return { x: g.x, y: g.y };
}

// ---------------------------------------------------------------------------
// 辘轳转盘：鼠标绕摇把轴心转圈驱动（顺时针放绳、逆时针摇起）。
//
// **轴心高度按"够得着"倒推，不按"井架好看"倒推**（2026-08-10）。量过才知道
// 老版有多离谱：柱子头顶才 1.13m、肩高约 0.98m、一条胳膊伸直 0.46m，而轴心
// 定在 1.43m——比他头顶还高 30 厘米，摇把画的那个圈他一辈子也够不着。屏幕上
// 就是"人站在旁边空划拉、辘轳自己在转"，这正是"角色动作太蠢"的根。
// 这四个数是**一起**解出来的，三条约束夹在中间（实拍逐条撞出来的）：
//   ① 够得着：肩到轴心的距离 + 柄长 ≤ 臂长 0.392 + 姿势里那一档身位 0.06；
//   ② **摇把画的那个圈不许扫过他的脸**：圈的最左沿要让开脑袋（半宽 0.09）。
//      漏了这一条就会出现"举手过眉去够、整条胳膊横在自己脸前"——实拍裁下来
//      是"一只手捂着脸"，比够不着还难看；
//   ③ 轴心不许再低：井台沿 0.73 + 辘轳鼓半径 0.14 = 0.87，再低鼓就压在井口上
//      放不出绳。
// 解：站位 −0.76、轴心 0.9375、摇把在**靠人这一侧的端面** −0.44、柄长 0.12。
// 圈的最左沿 −0.56，脑袋右缘约 −0.63，让开 7 厘米；摇把最远那一点离肩 0.41m。
// World 那边把前手 IK 到握手上（手是真的攥着摇把在抡），并且把摇把**排在人
// 之前**——排在人之后的话，他一伸手就把摇把整个盖住了，画面上又变成空划拉。
// SmokeTest 的 TestWinchIsACrankNotALever ⑦ 逐点量这一圈。
// 改这几个数就要同步 `Art.DrawWell` 的 HUB（井架横杆高度）与摇把的画法。
export const WINCH_HUB_Y = 0.9375;     // ＝ DrawWell 的 groundY−45px（48 像素/米）
export const WINCH_CRANK_DX = -0.44;   // 摇把轴销相对井心的偏移（−21px，西端面＝摇的人这一侧）
export const WINCH_CRANK_R = 0.12;     // 柄长：握手绕轴心画的那个圈的半径（5.8px）
export const WINCH_STAND_DX = -0.76;   // 摇辘轳的站位（相对井心）
export const WINCH_REST_A = -0.6;      // 摇把的歇息角：静止时斜垂着，别跟横杆混成一根木头
// 一井绳要摇多少圈。2026-08-10 用户退回过一次：老版 1.6/2.6 圈、键盘全速
// 4.5 秒就拎着水走了——「太短了 一点仪式感也没有 ... 3x 差不多」。
// 加长**不是**只把这两个数乘三（同一个转盘拧更多圈只是变闷），是加道数；
// 这两个数跟着往上抬一档，四道手加起来才有分量。时长有单测钉着
//（Script_SmokeTest 的 TestWinchIsLongEnough）。
const WINCH_TURNS_DOWN = Math.PI * 2 * 3.2;
const WINCH_TURNS_UP = Math.PI * 2 * 4.6;
// ── 四道手里那两道不摇转盘的 ──
const WINCH_DUNKS = 3;            // 墩几下桶才肯扣过去吃水
const WINCH_DUNK_PULL = 0.16;     // 一墩要往下拽多少米才算数（拽得慢只是蹭水面）
const WINCH_ROPE_R = 0.16;        // 攥井绳的走廊半宽：手飘出这条线就脱手
const WINCH_STAM_DUNK = 0.07;     // 一墩额外掉的手劲
const WINCH_KNOCKS = [0.34, 0.68];// 桶磕井壁的深度：井口一黑就到底，深浅靠这两声
const WINCH_DUNK_DX = -0.42;      // 墩桶的站位：胳膊半米长，得往前挪一步才够得着绳（实拍量的：−0.52 时手还差 11 厘米）
const WINCH_BUCKET_TOP = 0.66;    // 桶提到顶时的高度（＝World 画桶那条线，别另抄）
export const WINCH_LAND_X = 0.62; // 拽到井沿要横着拉多远（World 画桶也读它）
// ── 井底那扇小窗 ──
// 主相机看不到井口以下（画面底下压着一条近景地面带，见 CLAUDE.md），可
// **小窗是第二台相机**——它架进井筒里，就在那条地面带**后面**，井底那点事
// 于是有地方演了：桶一路沉下去、口朝上浮在水面、一墩一墩扣过去吃水、
// 再滴着水升上来。它同时是这一拍的提示：不用一句话，玩家看见浮着的空桶
// 就知道为什么得墩（用户 2026-08-10 出的主意）。
// 这几个 y 只有小窗看得见，所以尽管按"一口井该有多深"给。
export const WELL_MOUTH_Y = 0.73;    // 井口沿（＝Art.DrawWell 的 CURB 35px）
export const WELL_WATER_Y = -1.55;   // 井里的水面
export const WELL_BOTTOM_Y = -1.95;  // 井筒剖面画到多深为止
const WELL_PIP_HW = 0.60;            // 小窗的取景半宽：桶占大半个窗，看得清它在翻
const WINCH_LAND_R = 0.42;        // 按下那一帧手要落在桶多近才攥得住
const WINCH_LAND_KEY = 0.55;      // 键盘后备把桶拉过来的速度
const WINCH_HASTE = 0.42;         // 赶时间的那口井（c5 头顶上有伪军）按这个系数缩
// ── 体力 ──
// 一桶水吊在辘轳上，撑住它是要使劲的。2026-08-10 用户：「放下水桶这个过程
// 角色一点力好像都不需要用，还可以坚持着不放下去」。三种状态三本账：
// **顺着重量放绳**几乎不费力（顺势而为）、**硬撑着不让它下去**最费手劲、
// **满桶往上摇**最费力气；**撒开手**回得快，但辘轳会倒转，喘这口气是拿深度换的。
const WINCH_STAM_HOLD = 0.34;   // 攥着摇把硬撑（桶吊在半空不动）每秒掉
const WINCH_STAM_HAUL = 0.52;   // 满桶往上摇每秒掉
const WINCH_STAM_PAY = 0.05;    // 顺着重量放绳每秒掉
const WINCH_STAM_REST = 0.62;   // 撒开手歇着每秒回
const WINCH_STAM_SLIDE = 0.30;  // 撑不住、任它往下溜的时候每秒回（比撒手慢）
const WINCH_TIRED = 0.34;       // 低于这条线就开始"没劲"
const WINCH_TIRED_K = 0.22;     // 力气见底时还剩几成（不是零——不许把人卡死）
const WINCH_GRIP_BACK = 0.22;   // 缓过这么多力气才重新扶得住
const WINCH_UP_KEY = 0.28;      // 满体力时键盘摇起的速度（深度/秒）
const WINCH_DOWN_KEY = 0.34;    // 键盘放绳的速度
const WINCH_SLIP_UP = 0.16;     // 满桶脱手：辘轳倒转，桶往下坠
const WINCH_SLIP_DOWN = 0.13;   // 空桶撑不住：一顿一顿自己往下溜
const WINCH_GRACE = 0.5;        // 棘齿宽限：换个手不至于当场坠下去


// ---------------------------------------------------------------------------
// 地道的"还没挖通"（2026-08-10 用户退回："地洞从一开始就是通的七叔家，
// 那还挖个几把？"）。
//
// 老版把 walk.under 当成一条从头通到尾的走廊：剖面在开局就整条掏空，
// 玩家第一次下窖就能一路走到七叔家——第七场"挖通道"因此是**假的**，
// 送土、支木板、七叔从那头扒开最后一层土，全都在演一件已经完成的事。
//
// 现在地下按**段**存在，段由旗标推进（数据写在 Data_Scenes 的 underDig）：
//   ① 开局：只有自家地窖，东壁到此为止（wall）
//   ② digStarted（第七场开工）：掌子面推进到离对面还差最后一层土（face）
//   ③ tunnelDug（第九场两头通了）：整条连成一条
// 七叔家那头的窖（far）一直画着——看得见目标，才知道自己在挖什么。
export function UnderSegments(scene, flags) {
  const r = scene?.walk?.under;
  if (!r) return [];
  const g = scene.underDig;
  if (!g || (g.doneFlag && flags?.[g.doneFlag])) return [[r[0], r[1]]];
  const east = (g.startFlag && flags?.[g.startFlag]) ? g.face : g.wall;
  const segs = [[r[0], east]];
  if (g.far) segs.push([g.far[0], g.far[1] ?? r[1]]);
  return segs;
}

/** 某个 x 所在的那一段地下走行范围（不在任何段里就退回最近的一段） */
export function UnderWalkRange(scene, flags, x) {
  const segs = UnderSegments(scene, flags);
  if (!segs.length) return scene?.walk?.under;
  for (const s of segs) if (x >= s[0] - 0.5 && x <= s[1] + 0.5) return s;
  let best = segs[0], bd = Infinity;
  for (const s of segs) {
    const d = Math.min(Math.abs(x - s[0]), Math.abs(x - s[1]));
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// 落点整形：不许落进掩体的足迹（掩体带 z 专职挡人，桶放进草垛=凭空消失，
// 2026-08-06 的水桶事故就是这么来的），也不许出行走范围/压在翻越物里。
function DropSpot(state, x, level) {
  const scene = SceneOf(state);
  const range = level === "under" ? UnderWalkRange(scene, state.flags, x) : scene.walk[level];
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
function FlashPose(state, name, dur = 0.5, k = null) {
  state.player.pose = name;
  state.player.poseT = dur;
  // 由玩家的操作直接驱动的姿势（拽弓、刨料、把桶横拽上井沿）把行程一并递进来，
  // 骨架照着它插值——不传就沿用上一帧的，循环类姿势本来也不看这个
  if (k !== null) state.player.poseK = k;
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
// 绳的**另外那两头也必须长在人身上**（2026-08-10 用户报的「虚空绳头」）。
// 老版把它们写成两个硬编码的点：锚点 (35.1, 离地 1.02m)、钉死点 (52.9, 同高)。
// 可小周站在 35.8、手还垂着，那一米高的点上什么也没有——绳就从空气里长出来；
// 更糟的是地上那盘绳画在这一点的**正下方**，绳的第一个质点离盘子一米远，
// 玩家看见的是"一坨绳盘 + 一根从虚空里伸出来的绳"，两样谁也不挨谁。
// 现在两头都按**身位**从演员身上取（取身位不取骨架手心，理由同 RopeHandAt；
// 接到真拳头上是画面的活）。偏移量取的正是老版那两个数：小周朝东站在 35.8，
// 盘子在他脚后 0.7m＝35.1；七叔转身朝西站在 53.2，手在 52.92——绳全长
// ROPE_LEN 与"走到七叔家墙根正好绷直"这套调好的手感因此一分没动。
const ROPE_COIL_BACK = 0.7;   // 绳盘躺在放绳那人的脚后（他朝着放绳的方向站）
const ROPE_COIL_Y = 0.08;     // 盘在地上：绳是从盘里出来的，不是从半空
// 放到最后这么多米，绳盘就被他**拎起来**：盘子空了，这一头自然该在手里。
// 不做这一档的话，绳全放出去之后盘子一消失，绳的这一头就只是躺在他脚后的
// 土上——又是一个不接在任何东西上的绳头（只是没那么显眼）。
const ROPE_COIL_LIFT = 1.2;
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

/**
 * 绳的一头长在某个演员身上：`coil` = 他脚后那盘绳（贴地），`hand` = 他手里。
 * 演员不在场（跳幕结算、被抓走）就返回 null，让调用处退回步骤给的初值。
 */
function RopeEndOnActor(state, id, mode, lift = 0) {
  if (!id) return null;
  const a = FindActor(state, id);
  if (!a || a.visible === false) return null;
  const face = a.heading || 1;
  const hand = { x: a.x + face * ROPE_HAND.fwd, y: SURFACE_Y + ROPE_HAND.y };
  if (mode !== "coil") return hand;
  // lift：0＝还盘在脚边，1＝最后那截被他拎在手里。中间是插值，抬起来的过程
  // 是连续的（一档一档跳会看见绳头"弹"上去）
  const coil = { x: a.x - face * ROPE_COIL_BACK, y: SURFACE_Y + ROPE_COIL_Y };
  return { x: coil.x + (hand.x - coil.x) * lift, y: coil.y + (hand.y - coil.y) * lift };
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
  // 两头跟着人走：放绳那人脚后的绳盘、接绳那人手里的那一头。人不在场就退回
  // 步骤里给的初值（跳幕结算时演员可能还没摆上台）
  // coilLift：盘子快空了就把最后那截拎到手里（渲染层照它决定盘子还画不画）
  rope.coilLift = Math.max(0, Math.min(1,
    ((rope.pay || 0) - (rope.L - ROPE_COIL_LIFT)) / ROPE_COIL_LIFT));
  const coil = RopeEndOnActor(state, rope.anchorId, "coil", rope.coilLift);
  if (coil) { rope.x0 = coil.x; rope.y0 = coil.y; }
  if (rope.x1 !== undefined) {
    const staked = RopeEndOnActor(state, rope.stakeId, "hand");
    if (staked) { rope.x1 = staked.x; rope.y1 = staked.y; }
  }

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
// **只有一条路**：攥住手里那颗石子（按下那一帧手要落在石子上），往后下方拽开。
// 拽的**方向**定角度，拽的**长短**定劲，出手速度是拽开向量的反向。弧线预览由
// 同一套物理跑出来，预览即所得——看着那条弧穿进树冠里再松手。拽得太少算把
// 石子收回手心。蓄力姿势（throwWind）由拉弓量直接驱动：拽多远身子拧多紧。
//
// 这儿曾经还挂着一条键盘后备（StartThrow / F）：只要站位落在 3~10.5m 里，
// 就照着靶心**解**一条必中的弧。那等于角度不用调、劲不用调，按一下就赢——
// 玩法整个是假的，前面那套拽弓的物理白写了。已整条删除，连 HUD 上那颗 F 键
// 和触屏的投掷键一起撤掉：留着一个按了没反应的键比没有更糟。
// 投掷是**指尖上的活**，按 CLAUDE.md 第 5 条不给按键后备；删后备就必须同时
// 给驱动器一条真输入的路——那条路是 SlingSolve（见 GetBeatTarget 的 slingAt）。
// ---------------------------------------------------------------------------
const THROW_G = 12.5;         // 石子的重力。略沉于真实——弧线利落，不拖泥带水
const SLING_MAX = 1.6;        // 拽满的长度（米）
const SLING_K = 7.4;          // 拽开 1m ≈ 7.4m/s 出手速；拽满约 11.8m/s
// 攥石子那只手在哪儿：**优先用渲染层回填的真挂点**（state.handAt，由 HandPoint
// 从骨架上取，姿势一换它就跟着走）。拿 p.x + 朝向×0.24 估一个固定高度是不行的——
// 垂着手拎石子的时候手在 0.48m，蓄上力抬到 1.0m，差出大半米，玩家会在空气里按。
// 下面这个常量只是无渲染时（单测/驱动器/首帧）的兜底。0.62 是实测值：第一章的
// 柱子按 0.80 身量，垂手拎石子的手在 0.47m，带出蓄力架势后升到 0.6m 上下。
// 想当然写 1.1（"手在胸口"）的话，判定圈会整整浮在石子上方半米。
const SLING_HAND_Y = 0.62;
function HandOf(state) {
  const p = state.player;
  const h = state.handAt;
  if (h && Number.isFinite(h.x) && Math.abs(h.x - p.x) < 1.2) return { x: h.x, y: h.y };
  return { x: p.x + p.heading * 0.24, y: SURFACE_Y + SLING_HAND_Y };
}
// 攥住的判定半径。手机上地表景别半宽 6.3m ≈ 31px/米，0.85m 就是 53px 直径——
// 刚过拇指的最小可点尺寸。判定圈小于这个数，玩法就只剩"点不着"
const SLING_GRAB_R = 0.85;
const SLING_MIN = 0.22;       // 拽这么点不算使劲，石子收回手心
// 驱动器/单测要用到的常数（自动通关得**真的**拽一次）——别在别处复制字面量
export const SLING = { K: SLING_K, MAX: SLING_MAX, HAND_Y: SLING_HAND_Y, G: THROW_G, GRAB_R: SLING_GRAB_R };

// 打中 (tx,ty) 最省劲的那条弧——仰角 45°+φ/2，速度刚好够到，也就是这一步的
// 「标准答案」。自动通关照它反推出该往哪个方向拽多远，单测拿它当"这一步真解得开"
// 的证据。拽满也够不着就返回 null（意思是：得走近些，站位仍然有分量）。
export function SlingSolve(x0, y0, tx, ty) {
  const d = tx - x0, h = ty - y0;
  const r = Math.hypot(d, h);
  const v2 = THROW_G * (h + r);
  if (!(v2 > 0)) return null;
  const v = Math.sqrt(v2);
  if (v > SLING_K * SLING_MAX) return null;
  const a = Math.atan2(h, Math.abs(d)) * 0.5 + Math.PI / 4;
  return {
    vx: (d >= 0 ? 1 : -1) * v * Math.cos(a),
    vy: v * Math.sin(a),
    power: v / (SLING_K * SLING_MAX),
  };
}

// 手里攥着能扔的东西，就把架势摆出来：胳膊向后带一点，石子端在手里。
// 「他随时能扔」这件事得由画面说——判定圈钉在这只手上（HandOf 取的是渲染层
// 回填的真挂点），玩家看见石子在哪儿，就知道该按哪儿。
// 一次性姿势（捡起来那一下的 bow）先演完，不抢。
function ReadyToSling(state) {
  const p = state.player;
  if (p.pose && p.pose !== "throwWind") return;
  p.pose = "throwWind";
  p.poseK = 0.12;
  p.poseT = 0.2;
}

function LaunchStone(state, x0, y0, vx, vy, target) {
  state.thrown = { x: x0, y: y0, vx, vy, target: target || null, hit: false };
  state.player.item = null;
  state.sling = null;
  FlashPose(state, "throwArm", 0.45);
  Cue(state, "whoosh");
}

// 每帧的拟物瞄准。返回"正攥着"。
// st 只为出手时把命中目标带上；链外自由投掷传 null。
function StepSlingAim(state, input, st) {
  if (state.slingTicked) return !!state.sling;   // 链内已代管，链外别再步进一遍
  state.slingTicked = true;
  const p = state.player;
  const gy = SURFACE_Y;   // 拟物投掷只在地表玩法里出现
  const pw = input.pointerWorld;
  const hand = HandOf(state);
  if (!state.sling && state.ptrPressed && pw
    && Math.hypot(pw.x - hand.x, pw.y - hand.y) < SLING_GRAB_R) {
    // 攥住那一刻手在哪儿，整趟拽就以它为原点。拽到一半身子转过去、姿势抬起来，
    // 原点都不动——不然预览的弧和真出手的弧差半米，看着中了却打空
    state.sling = { power: 0, vx: 0, vy: 0, hx: hand.x, hy: hand.y };
  }
  const sl = state.sling;
  if (!sl) return false;
  if (input.pointerHeld && pw) {
    // 拽开的向量（手→指尖），出手是它的反向；拽过头按拽满算
    let dx = pw.x - sl.hx, dy = pw.y - sl.hy;
    const len = Math.hypot(dx, dy);
    if (len > SLING_MAX) { dx *= SLING_MAX / len; dy *= SLING_MAX / len; }
    sl.power = Math.min(1, Math.hypot(dx, dy) / SLING_MAX);
    sl.vx = -dx * SLING_K;
    sl.vy = -dy * SLING_K;
    // 预览弧 = 同一套物理跑出来的点列；灰/亮只说"够不够劲"，打不打得中看你瞄
    const pts = [];
    let x = sl.hx, y = sl.hy, vx = sl.vx, vy = sl.vy;
    for (let i = 0; i < 26 && y > gy + 0.08; i += 1) {
      pts.push([x, y]);
      vy -= THROW_G * 0.055;
      x += vx * 0.055;
      y += vy * 0.055;
    }
    state.throwAim = { pts, ok: sl.power > SLING_MIN };
    // 蓄力：拽多远，身子拧多紧；往哪边拽，人反着转身瞄
    if (Math.abs(sl.vx) > 0.4) p.heading = sl.vx >= 0 ? 1 : -1;
    p.pose = "throwWind";
    p.poseK = sl.power;
    p.poseT = 0.25;
    return true;
  }
  // 松手：够劲出手，不够收回手心
  state.sling = null;
  if (sl.power > SLING_MIN) LaunchStone(state, sl.hx, sl.hy, sl.vx, sl.vy, st?.target || null);
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
  // c2（地洞里的眼睛）没有狗：王家的狗窝在上一次扫荡后就空了（emptyKennel）
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
  } else {
    // 竖向笔画：只认对的方向（铲子不往上抡，撑木不往下砸）
    const dir = kind === "up" ? -1 : 1;
    const pull = input.pullHeld ? Math.max(0, (input.pull || 0) * dir) : 0;
    gain = pull / (STROKE_LEN * strokesN) * hold;
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
      // 差在哪一头就说哪一头。只说一句"擦着边飞过去了"等于没说——玩家不知道
      // 下一次该拽狠点还是把手压低，那这一步就成了乱试。归因清楚才叫可练
      const what = st.targetLabel || "靶子";
      const over = (th.x - st.target.x) * (Math.sign(st.target.x - p.x) || 1);
      state.toast = {
        text: over < -0.6 ? `石子没够着${what}，半路就落了地。手往后拽得再满些。`
          : over > 0.6 ? `石子从${what}上头飞过去了。别拽那么足，手压低一点。`
            : `石子擦着${what}底下过去了。弧再吊高些。`,
        t: 3.2,
      };
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
        // 动词姿势（规范：每个玩法动词必须配角色动画，不许「人站着不动、
        // 字幕替他做」）。步骤上写 pose，进度就直接驱动它——倒土那三下以前
        // 是按一下 E 就完事，人杵在原地空手，土也不知道去哪儿了。
        // 姿势里的进度一律走 poseU（World 的 PoseProgress 按姿势名挑字段；
        // **别用 poseK 串**，0 会把后面的分支全吃掉，见 CLAUDE.md）。
        // **动手之后**才摆姿势、才转身——跟支顶木同一条规矩。一进判定区就把人
        // 钉成倒土的架势，等于把只是路过（要去下一个点、或还没想好倒哪儿）的玩家
        // 一把揪住；自动通关更直接卡死：驱动器还在往区中心走，人已经不能动了。
        if (st.pose && b.holdP > 0) {
          p.pose = st.pose;
          p.poseU = Math.min(1, b.holdP / st.hold);
          p.heading = st.zone.x >= p.x ? 1 : -1;
        }
        const g = StrokeWork(state, b.strokeMem || (b.strokeMem = {}), input, dt, {
          // pose 也交给 StrokeWork：每攒满一"下"它要闪一次姿势，缺省闪的是 bow，
          // 会把上面按进度摆好的 pourBasket 一巴掌打回弯腰拾东西
          hold: st.hold, stroke: st.stroke, cue: st.cue, pose: st.pose,
          at: { x: st.zone.x, y: st.gestureY, baseY: (st.zone.level === "under" || lvl === "under") ? UNDER_Y : SURFACE_Y },
        });
        if (g > 0) {
          b.holdP += g;
          if (b.holdP >= st.hold) {
            b.strokeMem = null;
            if (st.pose) { p.pose = null; p.poseU = undefined; }
            ApplyUse(state, st); finish();
          }
        } else if (!input.interactHeld) {
          b.holdP = Math.max(0, b.holdP - dt * 1.2);
          if (st.pose && b.holdP <= 0) { p.pose = null; p.poseU = undefined; }
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
      if (b.lean === undefined) { b.lean = DOOR_SAG; b.vel = 0; b.work = 0; b.knockT = 0; b.creakAcc = 0; }
      const near = InZone(p.x, lvl, st.zone);
      if (!near) {
        state.prompt = "";
        p.pose = null; p.poseU = undefined;
        state.doorLeaf = { x: dx, hingeY: st.hingeY ?? 1.54, lean: b.lean, work: b.work, loose: true };
        return;
      }

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

      // ── 动力学：重力永远在往外(+)拉；手是一个有上限的对抗力 ──
      const prevLean = b.lean;
      const gravity = DOOR_G * (DOOR_BIAS + Math.sin(Math.max(0, b.lean)));
      const keyOnly = input.interactHeld && !b.grabbed;
      if (keyOnly) {
        // 键盘后备（费力气的活，CLAUDE.md 第 5 条；自动通关也走这条）：
        // 匀速把门怼回正位，同时吃掉动量——省了手感，省不了时间
        b.vel *= Math.exp(-6 * dt);
        b.lean -= Math.sign(b.lean) * Math.min(Math.abs(b.lean), DOOR_KEY * dt);
      } else {
        let acc = gravity;
        if (b.grabbed) {
          // 力臂：攥得越靠下沿越省劲，攥在轴根上顶不动它
          const armK = Math.max(0.2, Math.min(1, (b.arm || 0.9) / DOOR_H));
          const maxPush = DOOR_HAND * (0.30 + 0.70 * armK);
          const want = (b.refLean || 0) + (pw.x - b.refX) / (b.arm || 0.9);
          const drive = DOOR_SPRING * (want - b.lean) - DOOR_DAMP * b.vel;
          // 往回顶(−)吃手劲上限；顺着坠的方向(+)手不会帮门加速往外甩
          acc += Math.max(-maxPush, Math.min(maxPush * 0.5, drive));
        }
        b.vel = Math.max(-2.2, Math.min(2.2, b.vel + acc * dt));
        b.lean += b.vel * dt;
      }

      // 磕框：坠到底、或被甩回内侧撞上门框——多重的门就磕多响
      if (b.lean >= DOOR_SAG) {
        const hard = b.vel > 0.3;
        if (b.vel > 0.08) Cue(state, "tenon", { gain: Math.min(1, 0.45 + b.vel * 0.55), rate: 0.9 });
        if (hard) {
          state.vaultDust = { x: dx + Math.sin(DOOR_SAG) * DOOR_H, t: 0 };
          // 磕狠了，刚礅进去的轴又震松一分——坠回去是有代价的
          b.work = Math.max(0, b.work - 1 / DOOR_SEAT_N);
        }
        b.lean = DOOR_SAG;
        b.vel = Math.min(0, -b.vel * 0.18);      // 木门磕木框：闷，几乎不弹
      } else if (b.lean <= -0.12) {
        if (b.vel < -0.08) Cue(state, "tenon", { gain: Math.min(1, 0.45 - b.vel * 0.5), rate: 1.1 });
        b.lean = -0.12;
        b.vel = Math.max(0, -b.vel * 0.18);
      }

      // 吱呀：门轴在臼窝里拧。按转过的角度一粒一粒出——转得快就叫得密、叫得尖
      b.creakAcc += Math.abs(b.lean - prevLean);
      if (b.creakAcc > 0.045 && Math.abs(b.vel) > 0.06) {
        b.creakAcc = 0;
        const sp = Math.min(1, Math.abs(b.vel) / 1.2);
        Cue(state, "doorCreak", { gain: 0.5 + sp * 0.5, rate: 0.85 + sp * 0.5 });
      }

      // ── 礅轴按"下"走，不按秒表走：稳住 → 爹抡锤 →"咚"，震劲顺框传上来，
      // 门往外一弹，你得再把它稳回来。四下，轴才咬进臼窝。这一下一下的
      // 来回，就是"这扇门需要人扶"的全部理由。──
      const steady = Math.abs(b.lean) < DOOR_TOL;
      const father = FindActor(state, "father");
      if (steady) {
        b.knockT += dt;
        if (b.knockT >= 0.85) {
          b.knockT = 0;
          b.work = Math.min(1, b.work + 1 / DOOR_SEAT_N);
          Cue(state, "tenon", { gain: 0.85 });
          // 每一记都在门枕石那儿扬起一小撮土：这一下砸在哪儿，画面自己说
          state.vaultDust = { x: dx, t: 0.28 };
          if (b.work < 1) {
            if (keyOnly) b.lean = Math.min(DOOR_SAG, b.lean + 0.07);   // 键盘路：弹一格，按住 E 会自己怼回来
            else b.vel += DOOR_KICK * (0.85 + Math.random() * 0.3);    // 指针路：真震劲，靠手接住
          }
        }
      } else {
        b.knockT = Math.max(0, b.knockT - dt * 1.5);   // 门歪出去，爹收着锤等你
      }
      state.promptFill = b.work;
      state.prompt = st.prompt || "扶住门扇 · 别让它往外坠";
      state.closeUp = { x: dx, y: SURFACE_Y + DOOR_CAM.y, hw: DOOR_CAM.hw };
      // 爹礅轴：一条**轨道**，相位直接由 knockT 喂（见 Rig 的 malletTap）。
      // 不能再拿两个静态姿势来回切——kneel(跪) 与 swing(站着抡枪托) 差 44 厘米胯高，
      // 每 0.85 秒他就弹起来蹲回去一次，脚在地上滑（用户 2026-08-10 报的）。
      // 位置也钉死：他跪在轴西边一臂之内，手正按在那根轴上，全程不许挪。
      if (father) {
        father.pose = null;
        father.cineTarget = null;
        father.x = dx - 0.50;
        father.heading = 1;
        father.track = { name: "malletTap", t: b.knockT };
      }
      // 玩家不能站着不动"意念扶门"（拟物规则 8：每个玩法动词配角色动画）：
      // 攥住/按住 E 就顶上去，吃劲多深姿势就压多深
      const bracing = b.grabbed || input.interactHeld;
      const strain = Math.min(1, Math.max(0, 0.3 + (b.lean / DOOR_SAG) * 0.45 + Math.abs(b.vel) * 0.5));
      p.pose = bracing ? "braceDoor" : null;
      p.poseU = bracing ? strain : undefined;
      if (bracing) p.heading = dx >= p.x ? 1 : -1;
      state.doorLeaf = {
        x: dx, hingeY: st.hingeY ?? 1.54, lean: b.lean, work: b.work, loose: true,
        grabbed: !!b.grabbed, steady, reaching: held && !b.grabbed,
        strain: b.grabbed ? strain : 0,          // 渲染层拿它抖那一丝——判定的 lean 不掺演出
      };
      if (b.work >= 1) {
        // 礅完了：槌子收住，人还蹲在那儿——轨道停在最后一格（砸下那一帧）
        // 会读成"永远举着"，所以显式换成收工的蹲姿
        if (father) { father.track = null; father.pose = "bow"; }
        p.pose = null; p.poseU = undefined;
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
      // 只有这一条路：攥住手里那颗石子往后拽开（预览弧即弹道）。
      // 没有按键后备——按一下就必中的那版等于没有玩法，见投掷段顶上的说明
      if (StepSlingAim(state, input, st)) return;
      // 攥着的时候不画任何"站对位置就中"的辅助线：站位不是瞄准，拽出来的弧才是。
      // 手里攥着还没按上去，就只告诉他手在哪儿、往哪儿拽
      state.prompt = st.prompt || "攥住手里的石子 · 往后下方拽开，松手出手";
      ReadyToSling(state);
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
      // 走开了就把顶木的姿势收回去（脚本设的 pose 没有 poseT，不会自己到期——
      // 不收的话人会一路跪着爬出地道）
      if (!z || (st.needs && p.item?.id !== st.needs)) {
        if (p.pose === "braceUp") { p.pose = null; p.poseU = undefined; }
        if (b.holdP) b.holdP = Math.max(0, b.holdP - dt * 1.2);
      }
      if (!z) return;
      if (st.needs && p.item?.id !== st.needs) {
        state.prompt = st.missPrompt || `这儿缺${st.needsLabel || "木板"}`;
        return;
      }
      // 支顶木是**往上顶**：跪在爬行段里，两只手把板一寸一寸推到洞顶。
      // 老版是按一下 E + 0.6 秒的 push 姿势闪，画面上"扛起来"和"撑起来"
      // 一样什么都没有（用户 2026-08-10：「我在画面上完全看不到」）。
      // 现在走全作通用的笔画做功（stroke:"up"，与撑木/顶棉被同一套账本），
      // 手往上抹一下顶进去一分，松手泄掉——姿势由进度驱动（braceUp 的 poseK）。
      // 换了一处支撑位就重新起算（顶了一半挪窝，不该把力气带过去）
      if (b.braceAt !== z.x) { b.braceAt = z.x; b.holdP = 0; b.strokeMem = null; }
      if (b.holdP === undefined) b.holdP = 0;
      const need = st.hold || 1.0;
      p.pose = "braceUp";
      p.poseU = Math.min(1, b.holdP / need);
      // 顶木要顶在**松土那一段**上，人就得跪在那儿——手上使着劲还能一边往前爬，
      // 板子就顶到别处去了。跟辘轳挂桶同一条规矩：**动手之后**才把人钉在工位上
      //（一上来就钉会把只是路过、要去支另一头的玩家一把揪住）
      if (b.holdP > 0) {
        const side = p.x <= z.x ? -1 : 1;
        p.x = z.x + side * 0.45;
        p.heading = -side;
      } else {
        p.heading = z.x >= p.x ? 1 : -1;
      }
      // 这是指尖够不着、抡不开膀子的活，机位得推进来才看得见板顶到了哪儿。
      // 画框以**人和支撑位的中点**为心（只对着支撑位的话人会挂在画框边上）
      // 画框以人为主、支撑位为辅（六四开）：只对着中点的话，人被挤到画框边上，
      // 而这一拍要看的正是他把板举上去这件事
      state.closeUp = { x: p.x * 0.62 + z.x * 0.38, y: UNDER_Y + 0.40, hw: 1.9 };
      state.prompt = z.ok ? (st.prompt || "把木板顶上去 · 往上使劲")
        : (st.wrongPrompt || st.prompt || "把木板顶上去 · 往上使劲");
      state.promptFill = b.holdP / need;
      const g = StrokeWork(state, b.strokeMem || (b.strokeMem = {}), input, dt, {
        hold: need, stroke: "up", at: { x: z.x, y: 0.55, baseY: UNDER_Y },
      });
      if (g > 0) {
        b.holdP += g;
        // 每顶实一截"咯"一声：木头咬进土里，不是一路无声推到头
        if (Math.floor(b.holdP / need * 4) > Math.floor((b.holdP - g) / need * 4)) {
          Cue(state, "tenon", { gain: 0.55 + (b.holdP / need) * 0.45 });
        }
        if (b.holdP >= need) {
          b.strokeMem = null; b.holdP = 0;
          p.pose = null; p.poseU = undefined;
          if (z.ok) {
            p.item = null;
            if (z.flag) state.flags[z.flag] = true;
            Cue(state, "tenon", { gain: 1.0 });
            state.vaultDust = { x: z.x, t: 0, level: "under" };   // 顶实那一下，洞顶簌簌掉一层土
            finish();
          } else {
            // 支在硬土上：爹当场把板取下来还给你（东西不丢，只是白费一趟力气）
            st.wrong?.(state);
            state.toast = { text: st.wrongNote || "硬土不用糟践木头。", t: 3.5 };
          }
        }
      } else if (!input.interactHeld) {
        b.holdP = Math.max(0, b.holdP - dt * 1.2);
      }
      return;
    }
    case "winch": {
      // 辘轳打水：**四道手**，不是"放下去、摇上来"两下就完事。
      //   一道 放绳    顺时针摇转盘，桶顺着井筒往下沉，中途磕两回井壁
      //   二道 墩桶    空木桶口朝上浮在水面，不墩不吃水——攥住井绳一下一下往下墩
      //   三道 摇上来  满桶沉，同样一圈绳上得少；脱手辘轳呼噜噜倒转
      //   四道 拽到井沿 桶悬在井口正当中够不着，得攥住桶帮横拽到台沿上
      // 老版只有一、三两道、拢共四圈半、键盘全速 4.5 秒就完（2026-08-10 用户
      // 退回：「打水放水桶这个玩法也太短了 一点仪式感也没有 稍微长一点嘛
      // 是现在的 3x 差不多了」）。加长不是把同一个转盘拧更多圈——那只是变闷；
      // 是**加道数**，而且四道手四个不重样的动作，一根进度条也没有。
      //
      // **手上还得有分量**：桶一挂上，它的重量就一直吊在摇把上，于是有一条体力。
      //   · 顺着重量放绳 → 几乎不费劲（顺势而为）；
      //   · 想让它停在半空、撑住不放 → 最费手劲，撑光了手一软，桶自己**一顿
      //     一顿往下溜**（用户点名要的那个设计）；
      //   · 满桶往上摇 → 最费力气，力气见底就摇不快了；撒开手能喘一口，
      //     但辘轳会倒转，这口气是拿深度换的。
      //
      // 键盘 S/W 是完整后备（这是**费力气**的活，不是指尖功夫，按 CLAUDE.md
      // 第 5 条可以留；自动通关驱动器也走这条）。墩桶那一道的后备是**一下一下
      // 敲 S**——墩是"一下"，不是"一直"，按住不放不算。
      const w = b.winch || (b.winch = {
        phase: "lower", depth: 0, tip: 0, dunks: 0, swing: 0, sway: 0, swayV: 0,
        filled: false, hooked: !st.needs, slipT: 0, prevA: null, crankA: 0,
        stam: 1, giveOut: false, tiredShown: false, slipShown: false, creakT: 0,
        knocks: 0, jolt: 0, hand: null, stroke: 0, wasHeld: false, keyEdge: false,
        hold: false, dripT: 0, dunkTired: false,
      });
      // 赶时间的那口井（c5 头顶上有伪军在转）：同样四道手，每一道都短
      const S = st.haste ? WINCH_HASTE : 1;
      // 走开井台就把井底那扇小窗带走（不然它会一直挂在角上）
      if (!InZone(p.x, lvl, st.zone)) {
        if (state.pip?.kind === "wellBottom") state.pip = null;
        return;
      }
      state.winchLock = true;   // 井口的竖推交给辘轳，不再当爬梯（c5 井台正压在竖井口上）
      const cx = st.zone.x;
      const crankX = cx + WINCH_CRANK_DX;
      const hubY = SURFACE_Y + WINCH_HUB_Y;
      // 站位随这一道手走：摇转盘站 −0.76（摇把在那儿），**墩桶得往前挪一步**
      // ——绳吊在井心，胳膊统共半米长，站在 0.76 米开外根本够不着那根绳，
      // 姿势画得再对，画面上也是"对着井台比划"
      const standX = cx + (w.phase === "dunk" ? WINCH_DUNK_DX : WINCH_STAND_DX);
      const PublishView = (extra) => {
        const ga = w.crankA + WINCH_REST_A;
        state.winchView = {
          x: cx, crankX, hubY: WINCH_HUB_Y,
          depth: w.depth, filled: w.filled, hooked: w.hooked, crankA: w.crankA,
          // 握手此刻的世界坐标：World 拿它把前手 IK 上去，也拿它抖那一丝
          gripX: crankX + Math.cos(ga) * WINCH_CRANK_R,
          gripY: hubY + Math.sin(ga) * WINCH_CRANK_R,
          stam: w.stam, tired: w.stam < WINCH_TIRED, giveOut: !!w.giveOut,
          // 四道手要画的那几样：桶扣过去多少、横拽了多少、在绳上悠多少、抖多凶
          phase: w.phase, tip: w.tip, swing: w.swing, sway: w.sway, jolt: w.jolt,
          // 井筒里那只桶的真实高度（只有小窗那台相机看得见它）
          deepY: WELL_MOUTH_Y - w.depth * (WELL_MOUTH_Y - (WELL_WATER_Y + 0.13)),
          ...extra,
        };
      };
      if (!w.hooked) {
        if (p.item?.id === st.needs) {
          state.prompt = st.hookPrompt || "E · 挂上辘轳";
          if (input.interact) {
            w.hooked = true; p.item = null; FlashPose(state, "bow", 0.4);
            // 人站到摇把够得着的地方——站在井正中，桶就挂在他脑袋上，摇把也被挡死
            p.x = standX;
            p.heading = 1;
          }
        } else {
          state.prompt = st.missPrompt || `得有${st.needsLabel || "桶"}才打得上水`;
        }
        PublishView({ engaged: false });
        return;
      }
      // 站定了就钉在该站的地方：这一拍人不走路（同刨料）。走开半米手就够不着
      // 摇把，画面立刻退回"人在旁边空划拉"——那正是这一拍被退回的样子。
      if (Math.abs(p.x - standX) > 0.02) {
        p.x += Math.sign(standX - p.x) * Math.min(Math.abs(standX - p.x), 1.8 * dt);
      }
      p.heading = 1;
      // 特写：桶一挂上辘轳，镜头就推到井口——摇转盘这套手上功夫不在大全景里做。
      // 景别按"看得见他使劲"倒推：2.2m 半宽下柱子占了小半个画高
      state.closeUp = { x: cx - 0.25, y: SURFACE_Y + 0.66, hw: st.closeHw ?? 2.2 };
      const climb = input.climb || 0;
      // 辘轳的木轴一圈一圈地叫：手在摇才响，摇得快叫得密
      const Creak = (rate) => {
        w.creakT = (w.creakT ?? 0) + dt;
        if (w.creakT > rate) { w.creakT = 0; Cue(state, "crank", { gain: 0.8 }); }
      };
      // 指针绕圈：以**摇把轴销**为圆心累计本帧转角（真实位置驱动——手得真的
      // 绕着摇把画圈）。spin>0=逆时针（数学向），<0=顺时针。
      let spin = 0;
      if (input.pointerHeld && input.pointerWorld) {
        const dx = input.pointerWorld.x - crankX;
        const dy = input.pointerWorld.y - hubY;
        const r = Math.hypot(dx, dy);
        if (r > 0.06 && r < 1.4) {
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
      // 力气见底了就"撑不住"，缓回一点才重新扶得稳（带回滞，免得一帧一抖）
      if (w.stam <= 0) w.giveOut = true;
      else if (w.giveOut && w.stam >= WINCH_GRIP_BACK) w.giveOut = false;
      // 力气剩几成就使得出几成劲（不是零——留一档慢速，任谁都摇得完）
      const power = WINCH_TIRED_K + (1 - WINCH_TIRED_K) * Math.min(1, w.stam / WINCH_TIRED);
      const depthWas = w.depth;
      let stamDelta = 0;
      // 绳上挂着的东西不会僵着：磕一下井壁、墩一下桶，绳和桶都得抖一抖
      w.jolt = Math.max(0, (w.jolt || 0) - dt * 2.6);
      // 桶在绳上左右悠（单摆）：拽到井沿那一道得靠它才读得出「够不着」
      w.swayV += (-w.sway * 9.0) * dt;
      w.swayV *= Math.pow(0.22, dt);
      w.sway += w.swayV * dt;

      // ── 一道：放绳下去 ──────────────────────────────────────────────
      if (w.phase === "lower") {
        const gd = Math.max(0, -spin);   // 屏幕上顺时针=放绳
        const paying = climb > 0.05 || gd > 0;
        if (paying) {
          // 顺着桶的重量往下放：省力，绳走得快
          w.depth = Math.min(1, w.depth
            + (climb > 0.05 ? dt * WINCH_DOWN_KEY / S : 0)
            + gd / (WINCH_TURNS_DOWN * S));
          stamDelta = -WINCH_STAM_PAY * dt;
          Creak(0.62);
        } else if (w.giveOut) {
          // 撑不住了：手劲不够，桶自己缓缓往下溜。这不是失败——桶本来就该
          // 下去，只是**不是你放的**。缓回一点力气就又能扶住一下，
          // 于是"一顿一顿地溜"，那正是没力气的样子。
          w.depth = Math.min(1, w.depth + dt * WINCH_SLIP_DOWN);
          stamDelta = WINCH_STAM_SLIDE * dt;
          Creak(0.34);
          if (!w.tiredShown) {
            w.tiredShown = true;
            state.toast = { text: "胳膊撑不住了——辘轳吱吱地自己往下溜。", t: 3.2 };
          }
        } else {
          // 手攥着摇把把桶吊在半空：什么也没发生，力气却在一直掉
          stamDelta = -WINCH_STAM_HOLD * dt;
        }
        // 磕井壁：井口一黑就到底，下面那一截看不见——井有多深，是**磕出来**的
        //（两声一声比一声闷、一声比一声远，见 Audio 的 bucketKnock）
        while (w.knocks < WINCH_KNOCKS.length && w.depth >= WINCH_KNOCKS[w.knocks]) {
          w.knocks += 1;
          w.jolt = 1;
          w.swayV += 1.6;
          Cue(state, "bucketKnock", { gain: 0.8, rate: 1.1 - w.knocks * 0.16 });
        }
        state.prompt = "S · 放绳下去";
        state.promptFill = w.depth;
        if (w.depth >= 1) {
          w.phase = "dunk";
          w.prevA = null;
          w.swayV += 1.1;
          w.tiredShown = false;
          Cue(state, "bucketBob", { gain: 0.9 });
          state.toast = { text: "桶碰着水了——可空桶是浮着的。攥住井绳，往下墩。", t: 3.6 };
        }

      // ── 二道：墩桶 ────────────────────────────────────────────────
      } else if (w.phase === "dunk") {
        // 空木桶口朝上浮在水面，不墩就永远打不着水——这是真事儿，也是这一场
        // 唯一一个不靠转盘的动作。攥的是**井绳本身**：按下那一帧手得真落在
        // 绳上，之后按指尖的世界坐标走，一把够猛才算一墩。
        const nDunk = Math.max(1, Math.round(WINCH_DUNKS * S));
        const Dunk = () => {
          if (w.giveOut) {
            // 手上没劲了，拽不动它——喘一口再来
            if (!w.dunkTired) {
              w.dunkTired = true;
              state.toast = { text: "手上没劲，绳拽不沉——松开歇一口。", t: 3.0 };
            }
            return;
          }
          w.dunks += 1;
          w.tip = Math.min(1, w.dunks / nDunk);
          w.jolt = 1;
          w.swayV += 2.2;
          w.stam = Math.max(0, w.stam - WINCH_STAM_DUNK);
          Cue(state, "bucketDunk", { gain: 0.85, rate: 0.94 + w.tip * 0.16 });
        };
        const ropeTop = SURFACE_Y + WINCH_HUB_Y;
        let onRope = false;
        if (input.pointerHeld && input.pointerWorld) {
          const q = input.pointerWorld;
          // 绳是一条**窄**的竖线，攥住它就得把手落在它上头。这道窄走廊同时
          // 把「绕圈」挡在门外：绕摇把画的那个圈根本不在这条线上，
          // 上一道手的手法糊弄不了这一道（CLAUDE.md：别让相邻两道手同一个动词）
          const inLine = Math.abs(q.x - cx) < WINCH_ROPE_R;
          const inReach = q.y > SURFACE_Y + 0.45 && q.y < ropeTop + 0.35;
          if (w.hand === null) {
            if (!w.wasHeld && inLine && inReach) { w.hand = { x: q.x, y: q.y }; w.stroke = 0; }
          } else if (!inLine) {
            w.hand = null; w.stroke = 0;         // 手飘出绳外 = 脱手（同接绳）
          } else {
            onRope = true;
            const dy = w.hand.y - q.y;           // 往下拖 = dy>0
            const dxa = Math.abs(q.x - w.hand.x);
            // **必须是往下的一把**：手划得横，那是在绕圈（缠辘轳轴的动作），
            // 不是墩桶。动作要对得上被做的那件事
            if (dxa > Math.abs(dy) * 0.7) w.stroke = 0;
            else if (dy > 0) w.stroke += dy;
            else if (dy < -0.03) w.stroke = 0;   // 手往回抬，这一墩重新算
            w.hand = { x: q.x, y: q.y };
            // 姿势**由这一把拽了多远直接驱动**（同拉弓、同刨料）
            p.pose = "dunkRope";
            p.poseK = Math.min(1, w.stroke / WINCH_DUNK_PULL);
            p.poseT = undefined;
            p.poseU = undefined;
            p.poseStrain = 0;
            if (w.stroke >= WINCH_DUNK_PULL) { w.stroke = 0; Dunk(); }
          }
        } else { w.hand = null; w.stroke = 0; }
        w.wasHeld = !!input.pointerHeld;
        // 键盘后备：一下一下地敲 S。**按住不放不算**——墩是"一下"，不是"一直"
        if (climb > 0.05 && !w.keyEdge) {
          w.keyEdge = true;
          p.pose = "dunkRope"; p.poseK = 1; p.poseT = 0.3; p.poseU = undefined; p.poseStrain = 0;
          Dunk();
        }
        if (climb <= 0.05) w.keyEdge = false;
        // 攥着绳较劲费手劲，撒开手回得快
        stamDelta = onRope ? -WINCH_STAM_HOLD * dt : WINCH_STAM_REST * dt;
        state.prompt = "攥住井绳，往下墩";
        state.promptFill = w.tip;
        if (w.tip >= 1) {
          w.phase = "raise";
          w.filled = true;
          w.giveOut = false;
          w.slipT = WINCH_GRACE;
          w.prevA = null;
          w.tiredShown = false;
          Cue(state, "waterSplash", { gain: 0.9 });
          state.toast = { text: "桶一扣，咕咚一声吃满了水——沉得手腕一坠。", t: 2.8 };
          st.onFilled?.(state);   // 咕咚声传出去：后果小窗等钩子在这儿挂
        }

      // ── 三道：摇上来 ──────────────────────────────────────────────
      } else if (w.phase === "raise") {
        const gu = Math.max(0, spin);    // 逆时针=往上摇
        if (climb < -0.05 || gu > 0) {
          // 满桶沉：同样一圈，绳上得更少；力气不济，上得更慢
          w.depth = Math.max(0, w.depth - power * (
            (climb < -0.05 ? dt * WINCH_UP_KEY / S : 0)
            + gu / (WINCH_TURNS_UP * S)));
          w.slipT = WINCH_GRACE;
          stamDelta = -WINCH_STAM_HAUL * dt;
          Creak(0.5);
          // 满桶一路往上滴水：这一道摇得久，声音得跟着走
          w.dripT = (w.dripT ?? 0) + dt;
          if (w.dripT > 0.85) { w.dripT = 0; Cue(state, "waterDrip", { gain: 0.5 }); }
          if (w.stam < WINCH_TIRED && !w.tiredShown) {
            w.tiredShown = true;
            state.toast = { text: "胳膊酸了，摇不快——松开手喘一口，桶会往下坠一点。", t: 3.6 };
          }
        } else {
          // 松手：辘轳倒转。留半秒棘齿宽限，换手不至于立刻坠；
          // 撒开手的这一会儿力气回得最快——这就是那口气
          w.slipT = Math.max(0, w.slipT - dt);
          stamDelta = WINCH_STAM_REST * dt;
          if (w.slipT <= 0 && w.depth < 1) {
            w.depth = Math.min(1, w.depth + dt * WINCH_SLIP_UP);
            if (w.depth >= 1 && !w.slipShown) {
              w.slipShown = true;
              state.toast = { text: "手一松，辘轳呼噜噜倒转——桶又坐回了水里。", t: 3 };
            }
          }
        }
        state.prompt = "W · 摇上来";
        state.promptFill = 1 - w.depth;
        if (w.depth <= 0) {
          w.phase = "land";
          w.prevA = null;
          w.swayV += 1.4;
          Cue(state, "crank", { gain: 0.6 });
          state.toast = { text: "桶提到井口了。它悬在正当中——横着拽过来，搁到台沿上。", t: 3.6 };
        }

      // ── 四道：拽到井沿 ────────────────────────────────────────────
      } else {
        // 桶吊在井口正当中，人在西边够不着——得探身攥住桶帮把它横拽过来。
        // 满桶有分量：跟手走但有速度上限；撒手它自己荡回井口正中。
        const bx = cx - w.swing * WINCH_LAND_X + w.sway * 0.14;
        const by = SURFACE_Y + WINCH_BUCKET_TOP;
        let held = false;
        if (input.pointerHeld && input.pointerWorld) {
          const q = input.pointerWorld;
          // 按下那一帧手得落在桶上（探身够得着，所以这个半径比指尖活儿大一档）
          if (!w.wasHeld) w.hold = Math.hypot(q.x - bx, q.y - by) < WINCH_LAND_R;
          if (w.hold) {
            held = true;
            const want = Math.max(0, Math.min(1, (cx - q.x) / WINCH_LAND_X));
            // 有分量：跟手走但有速度上限，甩再快也只能一寸寸挪
            w.swing += Math.max(-2.4 * dt, Math.min(0.8 * dt, want - w.swing));
            w.sway += (-w.sway) * Math.min(1, dt * 6);
            p.pose = "haulIn";
            p.poseK = w.swing;
            p.poseT = undefined;
            p.poseU = undefined;
            p.poseStrain = 0;
          }
        } else { w.hold = false; }
        w.wasHeld = !!input.pointerHeld;
        // 键盘后备：接着按 W 把它拉过来
        if (climb < -0.05) {
          held = true;
          w.swing = Math.min(1, w.swing + dt * WINCH_LAND_KEY / S);
          p.pose = "haulIn"; p.poseK = w.swing; p.poseT = undefined; p.poseU = undefined; p.poseStrain = 0;
        }
        if (!held) w.swing = Math.max(0, w.swing - dt * 0.9);
        // **这一道不吃体力**：横着把桶带过来是一下轻活，不是吊着它对抗重力。
        // 而且它接在最费力气的三道手后头——再拿手劲卡一道，力气见底的玩家
        // 会被卡死在最后一步（撑不住→桶荡回井心→更没劲，是个死循环）。
        // 它是这一场的收势，得让人喘上来
        stamDelta = WINCH_STAM_REST * 0.5 * dt;
        state.prompt = "把桶拽到井沿上";
        state.promptFill = w.swing;
        if (w.swing >= 0.995) {
          Cue(state, "drop", { gain: 0.8 });
          Cue(state, "waterSplash", { gain: 0.35 });
          if (st.gives) GiveItem(state, st.gives);
          if (st.transform) state.player.item = { ...st.transform };
          state.winchView = null;
          state.stamina = null;
          if (state.pip?.kind === "wellBottom") state.pip = null;
          p.pose = null; p.poseU = undefined; p.poseK = undefined; p.poseStrain = undefined;
          finish();
          return;
        }
      }
      // 井底小窗：桶一沉过井口沿就开，一直开到它重新露头为止。
      // 取景跟着桶走，快到水面就停在水面上——那一格里演的正是玩家看不见、
      // 却正在做的那件事（也是"为什么要墩"唯一的说明）
      const deepY = WELL_MOUTH_Y - w.depth * (WELL_MOUTH_Y - (WELL_WATER_Y + 0.13));
      if (w.depth > 0.06 && w.phase !== "land") {
        PinPip(state, {
          at: { x: cx, y: Math.max(deepY, WELL_WATER_Y + WELL_PIP_HW * 0.42) },
          hw: WELL_PIP_HW, kind: "wellBottom",
        });
      } else if (state.pip?.kind === "wellBottom") state.pip = null;
      w.stam = Math.max(0, Math.min(1, w.stam + stamDelta));
      // 体力条：这是**读数**不是做功进度（做功仍然只认手上的绕圈/按键）。
      // 用户点名要的那一条：「加一个体力条/体力倒计时条」。
      state.stamina = {
        v: w.stam,
        low: w.stam < WINCH_TIRED,
        out: !!w.giveOut,
        label: "手劲",
      };
      // 摇把的角度直接从绳的行程反推：键盘、鼠标、倒转三条路自然同源——
      // 桶自己往下坠时，摇把就在屏幕上呼噜噜倒着抡
      w.crankA -= (w.depth - depthWas) * WINCH_TURNS_DOWN;
      // 动词动画：转转盘那两道手**手就攥在摇把上**（相位直接取摇把角度，不是
      // 一条自转的定速循环；World 按 winchView.gripX/Y 把前手 IK 到握手上）。
      // 墩桶与拽桶不是绕圈，各有各的姿势——那两道在上头自己设，这儿别覆盖回去。
      if (w.phase === "lower" || w.phase === "raise") {
        const TAU = Math.PI * 2;
        p.pose = "crank";
        p.poseU = (((w.crankA + WINCH_REST_A) % TAU) + TAU) % TAU / TAU;
        p.poseT = undefined;
        p.poseStrain = Math.min(1, Math.max(0, 1 - w.stam / 0.62) * (w.filled ? 1 : 0.75)
          + (w.giveOut ? 0.3 : 0));
      }
      PublishView({ engaged: w.prevA !== null || !!w.hand || w.hold });
      return;
    }
    // 接绳：**长在一张铺满画框的活卡上**（state.knotCard → Art.DrawKnotCard）。
    // 两段动作——把麻绳头掖进井绳挽出的圈眼里穿过去，再一把一把把结勒死。
    // 上一版是在世界里顺着一条曲线拖那个巴掌大的结，被退回：「谁看得出来这是
    // 打结」。版面与判据全在 KNOT_CARD，那儿写了为什么。
    case "knot": {
      if (!InZone(p.x, lvl, st.zone)) return;
      const L = KNOT_CARD;
      const k0 = b.knotState;
      if (!k0 && st.needs && p.item?.id !== st.needs) {
        state.prompt = st.missPrompt || `这儿缺${st.needsLabel || "样东西"}`;
        return;
      }
      const kn = k0 || (b.knotState = {
        tip: { ...L.start }, grab: false, gate: 0, cinch: 0, slipT: 0, wrongT: 0,
      });
      const cx = st.zone.x;
      const standX = cx - 0.74;
      // 站定就钉在断头跟前：这一拍人不走路（同刨料/划线——画面已经整个交给
      // 那张卡了，A/D 还能把人走开的话，回来时卡还在、人却在半条街外）
      if (!k0) { p.x = standX; p.heading = 1; }
      else if (Math.abs(p.x - standX) > 0.02) {
        p.x += Math.sign(standX - p.x) * Math.min(Math.abs(standX - p.x), 1.8 * dt);
      }
      p.heading = 1;
      // 攥住第一下，麻绳就离手了（接下来它长在井架上，不在物品栏里）
      if ((kn.grab || kn.gate > 0) && st.needs && p.item?.id === st.needs) p.item = null;

      const pc = input.pointerCard;
      const held = !!input.pointerHeld && !!pc;
      const hand = held ? { x: pc.u, y: pc.v / L.aspect } : null;
      kn.slipT = Math.max(0, kn.slipT - dt);
      kn.wrongT = Math.max(0, kn.wrongT - dt);

      // ① 按下那一帧手必须落在**绳头**上才攥得住，卡上别处拖一律无效
      if (held && state.ptrPressed && !kn.grab && KnotD(hand, kn.tip) < L.grabR) {
        kn.grab = true;
        Cue(state, "pickup", { gain: 0.3 });
      }
      if (!held) kn.grab = false;
      kn.reaching = held && !kn.grab;

      let moved = { x: 0, y: 0 };
      if (kn.grab) {
        if (KnotD(hand, kn.tip) > L.slipR) {
          // ③ 手甩得比绳快太多＝脱手。绳缩回去一截，手上一空
          const back = KnotCinchDir();
          kn.grab = false;
          kn.slipT = 0.6;
          kn.tip.x -= back.x * 0.05; kn.tip.y -= back.y * 0.05;
          Cue(state, "drop", { gain: 0.45 });
        } else {
          // ② 绳有分量：跟着手走，但一秒最多走这么多，甩再快也只能一寸寸挪
          const dx = hand.x - kn.tip.x, dy = hand.y - kn.tip.y;
          const d = Math.hypot(dx, dy);
          if (d > 1e-6) {
            // 勒紧那一把**吃劲**：绳走得比挽结时慢得多，而且越勒越紧越难拽。
            // 这一档是这一下手感的全部——一把抻到底得费一秒半的劲，
            // 不是"顺手一划就完"（老版倒手拽三把是拿次数凑分量，那是游戏味儿）
            const tight = kn.gate >= L.gates.length
              ? L.cinchSpeed * (1 - 0.5 * kn.cinch) : L.speed;
            const stepD = Math.min(d, tight * dt);
            let nx = kn.tip.x + (dx / d) * stepD;
            let ny = kn.tip.y + (dy / d) * stepD;
            // 绳就这么长：离进画那一点太远就拽不动了
            const ax = nx - L.anchor.x, ay = ny - L.anchor.y;
            const ad = Math.hypot(ax, ay);
            if (ad > L.reach) { nx = L.anchor.x + (ax / ad) * L.reach; ny = L.anchor.y + (ay / ad) * L.reach; }
            moved = { x: nx - kn.tip.x, y: ny - kn.tip.y };
            kn.tip.x = nx; kn.tip.y = ny;
          }
        }
      }

      if (kn.gate < L.gates.length) {
        // ── 打结：一条连贯的路，五个关口按顺序过 ──
        // **只认下一个关口**。跳着走一律不算——跳过"绕到背后"直接去掖，
        // 那打出来的不是单编结，是绳头虚搭在弯里，一拽就出来。
        const g = L.gates[kn.gate];
        if (KnotD(kn.tip, g) < g.r) {
          kn.gate += 1;
          Cue(state, "crank", { gain: 0.34 + kn.gate * 0.06, rate: 1.15 + kn.gate * 0.08 });
          if (kn.gate === L.gates.length) {
            Cue(state, "pickup", { gain: 0.7 });
            state.toast = { text: "结挽上了——攥住绳头，一把勒到底。", t: 3.4 };
          }
        } else if (kn.grab && kn.gate + 1 < L.gates.length) {
          // 跑到后面那些关口上去了：绳头蹭一下、卡上闪一下"这道还没过"
          for (let i = kn.gate + 1; i < L.gates.length; i += 1) {
            if (KnotD(kn.tip, L.gates[i]) < L.gates[i].r * 0.8) { kn.wrongT = 0.5; break; }
          }
        }
      } else {
        // ── 勒紧：**一把拽到底**，不倒手 ──
        // 老版是"倒手拽三把"，那是游戏味儿。现实里勒一个单编结就是攥住绳头
        // 一把抻到底，手上能觉出结在咬紧。撒手它自己往回泄——半截的结会松。
        const u = KnotCinchDir();
        const adv = moved.x * u.x + moved.y * u.y;
        const before = kn.cinch;
        kn.cinch = Math.max(0, Math.min(1, kn.cinch
          + (kn.grab ? adv / L.cinchLen : -L.cinchBack * dt / L.cinchLen * 0.5)));
        // 每咬紧一档响一声：绳吃劲的吱嘎越来越紧
        if (Math.floor(kn.cinch * 4) > Math.floor(before * 4)) {
          Cue(state, "ladder", { gain: 0.5 + kn.cinch * 0.4, rate: 0.85 + kn.cinch * 0.35 });
        }
      }

      // **没有长按后备**（用户明令："为什么还支持长按交互按钮的模式？干掉"）。
      // 接绳是指尖上的活：手不落在绳头上、不顺着那条路把结挽出来，就一点进展
      // 都没有。也**没有 HUD 手势图标与按键提示**——招呼玩家的是卡上那根绳头
      // 自己（没上手时它朝下一道关口蹭两下，蹭的方向就是该拖的方向）。
      state.prompt = null;
      state.knotCard = {
        tip: { x: kn.tip.x, y: kn.tip.y },
        gate: kn.gate,
        phase: kn.gate < L.gates.length ? "tie" : "cinch",
        grab: !!kn.grab, reaching: !!kn.reaching,
        cinch: kn.cinch,
        slip: kn.slipT > 0, wrong: kn.wrongT > 0,
      };
      // 动词动画（铁律：不许「人站着不动、字幕替他做」）。这张卡铺满画框的
      // 时候看不见他，但卡收走的那一帧看得见——姿势由勒紧的力道驱动
      p.pose = "knotPull";
      p.poseU = kn.gate < L.gates.length ? 0.10 + 0.04 * kn.gate : 0.35 + 0.65 * kn.cinch;
      p.poseT = undefined;

      if (kn.cinch >= 1) {
        Cue(state, "ladder", { gain: 0.9 });   // 麻绳勒紧时木架受力的吱嘎
        state.knotCard = null;
        p.pose = null; p.poseU = undefined;
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

// 小窗的第二种用法：**盯住一个死点位**（不跟人），而且由玩法每帧立、每帧撤。
// 起因是打水（2026-08-10 用户："地表场景看不到地平线以下 但是你可以用边上的
// 特殊照片模式去渲染呀 / 顺便也作为一个提示不是蛮好的"）——主相机确实看不到
// 井口以下（画面底下永远压着一条近景地面带），但**小窗是第二台相机**，它可以
// 架进井筒里、架在那条地面带的后面，于是井底那点事就有地方演了。
// 而且它顺带把「墩桶」教会了：玩家看见空桶口朝上浮着，就明白为什么要墩。
function PinPip(state, spec) {
  state.pip = { t: null, ...spec };
  state.flags.pipShown = true;
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
  // 第一章 · 善意的谎言（2026-08-11 按 Notion「剧本新生」重写整章）
  // 扫荡后的第三天清晨。村子安安静静，阳光照常升起，但灶台是冷的、水缸见了底、
  // 院里的鸡没了。一条昼夜：清晨空镜→给妹妹找吃的（翻烧塌的牲口棚，路上看见
  // 弹孔与踩碎的纺车，什么都没说）→分食（"他说他不饿"）→陪妹妹在门框画正字
  // （对话选择）→打水（修井绳/投石震榆钱/辘轳四道手，沿用 c1_well 这条链）→
  // 入夜→下窖整理爹娘遗物（带血的衣服，埋进窖底，全程无台词）→爬上来，
  // 妹妹站在窖口："哥，你是不是去找爹了？"——她什么都知道。
  // 全章无敌人、无失败；「维持日常」的徒劳与温柔是唯一的题眼。
  // 玩法承接（剧本新生§1）：搜寻（翻找笔画）、对话选择（正字）、挖掘（埋衣）、
  // 菜窖=初始安全区第一次出现。
  // 序章 1-8 镜连同配音、短片全部保留（都是扫荡之前的家史，仍然成立）；
  // 9-11 镜换文案（同一批短片）：扫荡、爹娘没回来、只剩兄妹俩。
  // =========================================================================
  c1: [
    {
      // 序章：11 镜、总长 120 秒；每镜一段静音短片。
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
        // 9-11 镜：新剧本的转折。短片沿用（劳役/押人、少年当家、地窖口），
        // 文案换成扫荡与失怙——爹娘的结局不明说，只说"没有回来"
        { stage: "开春，据点又一次进村扫荡。粮食、牲口、人——他们要什么，就拿什么。那一回，爹和娘没有回来。", d: 18, cam: { kind: "insertVideo", clip: "Pro_09", card: "pro6" } },
        { stage: "柱子十五岁。从那天起，烧火、找粮、照看妹妹，都是他一个人的事了。", d: 8, cam: { kind: "insertVideo", clip: "Pro_10", card: "pro12" } },
        { stage: "妹妹六岁。她只知道爹娘出了远门。屋底下的旧菜窖还在——如今，那是兄妹俩最后能躲的地方。", d: 10, cam: { kind: "insertVideo", clip: "Pro_11", card: "pro7" } },
      ],
    },
    {
      // 开场：扫荡后的第三天清晨。四个空镜把"安静"说完——空街、冷灶、
      // 见底的水缸、塌了半边的牲口棚；最后落回屋里睡着的妹妹。
      // 全程没有一个活人上镜（villageAlarm 清空背景乡亲）：安静本身就是伤。
      kind: "cinematic", id: "c1_open", timeOfDay: "dawn",
      lines: [
        { stage: "扫荡过后的第三天。梁家村。", d: 3.4,
          cam: { kind: "shot", x: 56, y: 1.75, dist: 7.0, pan: 5 } },
        { stage: "村子安安静静。太阳照常升起来，家家的烟囱都没冒烟。", d: 4.6,
          cam: { kind: "shot", x: 82, y: 2.2, dist: 7.6, pan: 3 } },
        { stage: "灶台是冷的。锅底那点水，是昨儿剩下的。", d: 3.8,
          cam: { kind: "insert", x: 27.6, y: 0.95, dist: 2.8 },
          on: (state) => { state.beat.indoorScene = true; } },
        { stage: "院里的水缸见了底。瓢探下去，刮着缸底响。", d: 3.8,
          cam: { kind: "insert", x: 43.4, y: 0.95, dist: 3.0 },
          on: (state) => { Cue(state, "bucketKnock", { gain: 0.4, rate: 0.8 }); } },
        { stage: "牲口棚塌了半边。院里的鸡，一只也没剩下。", d: 3.8,
          cam: { kind: "shot", x: 10.4, y: 1.1, dist: 4.6 } },
        { stage: "屋里，妹妹还睡着。", d: 3.0,
          cam: { kind: "shot", x: 31.4, y: 1.05, dist: 3.8 },
          on: (state) => {
            state.beat.indoorScene = true;
            // 说睡着就得真躺着：铺盖（beddingMat, 31.15）上侧躺蜷着。
            // leanIn 是站姿——上一版她站在屋当间"伸懒腰"，字幕当场穿帮
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = 31.15; sis.heading = -1; sis.pose = "sleep"; }
            state.player.x = 33.2;
            state.player.heading = -1;
          } },
        { stage: "缸底最后小半瓢水下了锅。得给她找点吃的。", d: 4.0,
          cam: { kind: "shot", x: 32.6, y: 1.25, dist: 4.6 },
          on: (state) => { Cue(state, "waterSplash", { gain: 0.35 }); } },
      ],
    },
    {
      // 第一场（玩法）：给妹妹找吃的。往西头翻烧塌的自家牲口棚——路上经过
      // 踩碎的纺车、墙上的弹孔，各给一个无言的注视（新剧本明令：看到，
      // 但你什么都没说——所以是镜头看，不是字幕说）。
      // 挖到的是娘埋下的瓦罐：红薯干拿油布扎着口。搜寻教学在这条链上。
      kind: "chain", id: "c1_forage", timeOfDay: "day",
      objective: "给妹妹找吃的", hint: "西头牲口棚烧塌了——翻翻看，兴许有埋下的东西",
      onStart: (state) => {
        // 妹妹还在铺盖上睡（立面合着自然看不见她）
        const sis = FindActor(state, "sister");
        if (sis) { sis.pose = "sleep"; sis.x = 31.15; sis.heading = -1; }
      },
      steps: [
        // 路过纺车：无言的注视（镜头停两秒四，一个字也不说）
        { type: "goto", zone: { x: 26.4, w: 1.8 },
          effect: (state) => {
            // 人停在纺车东边一步半，镜头看的是他脚边那堆——人不压在道具上
            StartMicroCine(state, [
              { stage: "", d: 2.6, cam: { kind: "insert", x: 25.0, y: 0.72, dist: 2.7 } },
            ]);
          } },
        // 路过贴告示的墙：弹孔。同样无言
        { type: "goto", zone: { x: 22.8, w: 2.2 },
          effect: (state) => {
            StartMicroCine(state, [
              { stage: "", d: 2.6, cam: { kind: "insert", x: 23.1, y: 1.35, dist: 2.9 } },
            ]);
          } },
        { type: "goto", zone: { x: 12.6, w: 2.6 } },
        { type: "use", zone: { x: 11.2, w: 2.4 }, hold: 1.2, stroke: "down", gestureY: 0.7,
          prompt: "E · 翻开苫草",
          note: "苫草底下只有烧过的木头茬。",
          effect: (state) => { Cue(state, "flutter", { gain: 0.5 }); } },
        { type: "use", zone: { x: 9.8, w: 2.2 }, hold: 1.2, stroke: "down", gestureY: 0.6,
          prompt: "E · 挪开门板",
          note: "板子底下是半截食槽，落满了灰。",
          effect: (state) => { Cue(state, "drop", { gain: 0.6, rate: 0.9 }); } },
        { type: "use", zone: { x: 8.6, w: 2.2 }, hold: 1.8, stroke: "down", gestureY: 0.55,
          prompt: "E · 刨开烧土",
          note: "土里埋着一个瓦罐——罐口拿油布扎着，扎得严严实实。",
          effect: (state) => { state.flags.jarDug = true; Cue(state, "dig", { gain: 0.8 }); } },
        { type: "pickup", x: 8.6, item: { id: "driedYams", label: "红薯干" }, prompt: "E · 掏出红薯干",
          effect: (state) => {
            StartMicroCine(state, [
              { stage: "小半罐红薯干。这样扎口的手法，是娘的。", d: 3.6,
                cam: { kind: "insert", x: 8.6, y: 0.75, dist: 2.2 } },
            ]);
          } },
        { type: "goto", zone: { x: 33.6, w: 2.6 } },
      ],
    },
    {
      // 第二场：分食。大的那半掰给妹妹；"他说他不饿"——本章第一个善意的谎。
      kind: "cinematic", id: "c1_meal", timeOfDay: "day",
      lines: [
        { stage: "", d: 2.6, cam: { kind: "shot", x: 33.8, y: 1.3, dist: 4.8 },
          on: (state) => {
            state.beat.indoorScene = true;
            const sis = FindActor(state, "sister");
            if (sis) { sis.pose = null; sis.cineTarget = { x: 34.4 }; sis.cineSpeed = 2.0; sis.heading = 1; }
            state.player.cineWalk = { x: 35.2, speed: 1.6 };
          } },
        { who: "妹妹", say: "哥，你上哪去了？", d: 2.6,
          cam: { kind: "shot", x: 34.6, y: 1.15, dist: 3.8 },
          on: (state) => { state.player.cineWalk = null; state.player.x = 35.2; state.player.heading = -1; } },
        { stage: "柱子把红薯干泡进温水里。泡软了，大的那半掰给她。", d: 4.4,
          cam: { kind: "insert", x: 34.9, y: 0.95, dist: 3.1 },
          on: (state) => {
            state.player.item = null;
            const sis = FindActor(state, "sister");
            // 食物得在画面里：她手上捧着那把红薯干（视觉审查退回过一版空手吃戏）
            if (sis) { sis.cineTarget = null; sis.x = 34.4; sis.pose = "kneel"; sis.carry = "红薯干"; }
            FlashPose(state, "kneel", 2.8);
            Cue(state, "waterSplash", { gain: 0.3 });
          } },
        { who: "妹妹", say: "哥你也吃。", d: 2.2,
          cam: { kind: "shot", x: 34.8, y: 1.0, dist: 3.4 },
          on: (state) => {
            // 递碗要两个人同框：她站起来把碗举向哥（碗在手挂点上，站姿才举
            // 得到胸口）。过肩机位里柱子只剩画框边一条剪影，复审读成
            // "对着空画框递碗"——改双人镜
            const sis = FindActor(state, "sister");
            if (sis) { sis.pose = null; sis.heading = 1; }
            state.player.heading = -1;
          } },
        { stage: "他说他不饿。", d: 3.0,
          cam: { kind: "shot", x: 34.7, y: 1.2, dist: 4.2 } },
        { stage: "妹妹吃完，舔了舔手指头。然后她拽着柱子的袖子，走到门框跟前。", d: 4.2,
          cam: { kind: "shot", x: 34.2, y: 1.25, dist: 4.6 },
          on: (state) => {
            const sis = FindActor(state, "sister");
            if (sis) { sis.pose = null; sis.carry = null; sis.cineTarget = { x: 33.4 }; sis.cineSpeed = 1.6; }
            state.player.cineWalk = { x: 34.1, speed: 1.4 };
          } },
      ],
    },
    {
      // 第三场（玩法）：陪妹妹画正字。她从爹娘走那天起一天画一道，今天这道
      // 她让哥来添——石笔交互沿用划线活卡（题眼从"刻痕"换成"正字"，
      // 门框还是那道门框）。markY 压到 0.98：这是孩子够得着的高度。
      kind: "scribe", id: "c1_tally", timeOfDay: "day",
      // 卡面变奏：量身那张卡上的人影在这儿没有由头（没人靠框站着），去掉；
      // 前两天画的两道要在卡上看得见——今天这一道不是画在白板上
      cardStyle: { silhouette: false, tallyDone: 2 },
      zone: V.doorframe, speed: 0.5, markY: 0.98,
      markX0: 33.60, markX1: 33.75,
      cam: { kind: "shot", x: 34.3, y: 1.15, dist: 3.8 },
      objective: "陪妹妹在门框上画正字", hint: "攥住石笔，顺着她比的地方，把今天这一道添上",
      note: "石笔蹭过木头。第三道。",
      onStart: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) { sis.cineTarget = null; sis.x = 33.3; sis.heading = 1; sis.pose = "pointLow"; }
        state.player.cineWalk = null;
        state.player.x = 34.1;
        state.player.heading = -1;
      },
      onDone: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) sis.pose = null;
        state.flags.tallied = true;
      },
    },
    {
      // 第四场（玩法·对话选择）：她问出那句话。哪个答案都是护着她的谎——
      // 一个软一点，一个绕一点，最后都落回「快了」（新剧本明令：对话由玩家选择触发）。
      kind: "choice", id: "c1_ask", timeOfDay: "day", flagKey: "tallyAnswer",
      prompt: "妹妹数着道道，仰起脸：哥，爹娘今天回来吗？",
      options: [
        { key: "soon", label: "快了。", detail: "等道道画满一个正字，他们就回来了。" },
        { key: "faraway", label: "路远。", detail: "回来要走好些天。他们紧赶着呢。" },
      ],
      objective: "回答妹妹",
    },
    {
      kind: "cinematic", id: "c1_answered", timeOfDay: "day",
      dynamicLines: (state) => {
        const tail = [
          { stage: "她把石笔在手心里攥了攥，放回门槛下的砖缝里——明儿还画。", d: 3.8,
            cam: { kind: "insert", x: 33.8, y: 0.6, dist: 2.5 },
            on: (s) => {
              const sis = FindActor(s, "sister");
              if (sis) { sis.pose = "kneel"; }
            } },
          { stage: "日头爬高了。缸里那点水，撑不到晌午。", d: 3.4,
            cam: { kind: "shot", x: 40, y: 1.4, dist: 6 },
            on: (s) => {
              const sis = FindActor(s, "sister");
              if (sis) sis.pose = null;
            } },
        ];
        return state.flags.tallyAnswer === "faraway"
          ? [
            { who: "妹妹", say: "多远？比赶集还远吗？", d: 2.8,
              cam: { kind: "shot", x: 33.9, y: 1.1, dist: 3.6 } },
            { who: "柱子", say: "……快了。", d: 2.6,
              cam: { kind: "ots", subject: "player", other: "sister", dist: 3.0 } },
            ...tail,
          ]
          : [
            { who: "妹妹", say: "那我明儿接着画。", d: 2.8,
              cam: { kind: "shot", x: 33.9, y: 1.1, dist: 3.6 } },
            { stage: "柱子没接话。", d: 2.4,
              cam: { kind: "shot", x: 34.4, y: 1.2, dist: 4.0 } },
            ...tail,
          ];
      },
    },
    {
      // 第五场（玩法）：井台。水缸见底是清晨就交代过的账——修井绳（接绳活卡）、
      // 投石震榆钱（妹妹的口粮）、辘轳四道手，整条链沿用 c1_well 的骨架；
      // id 也沿用（工作台命令、测试、拍摄配方都认它）。变的只是人：
      // 台词里没有娘了——"娘说掺上榆钱"从叮嘱变成了转述，一个字没改。
      kind: "chain", id: "c1_well", timeOfDay: "day",
      objective: "缸里没水了——去井台打一桶回来", hint: "水桶在缸边上；妹妹先跑去了榆树底下",
      onStart: (state) => {
        // 妹妹撒腿先跑去榆树底下：她惦记那树榆钱不是一天了。
        // 不挂 following——投石那一步她得站在自己的位置上接戏
        const sis = FindActor(state, "sister");
        if (sis) {
          sis.following = false; sis.pose = null; sis.heading = 1;
          sis.x = 35.0; sis.cineTarget = { x: 55.4 }; sis.cineSpeed = 2.4;
        }
      },
      tick: (state) => {
        // 文案钉死「妹妹先跑去了榆树底下」——打榆钱、捡榆钱那两步（5、6）她必须
        // 真在树下。跳幕/--step 直落不会重放 talk 的 effect，这里兜底（榆树 56.3）。
        // **只管这两步**：之后她跟着回家，再抓回树下就跟 following 打架了
        if (state.beat.stepIndex >= 5 && state.beat.stepIndex <= 6) {
          const sis = FindActor(state, "sister");
          // 还在半路的 cineTarget 也一并收掉直接落位——跳拍/--step 直落时她
          // 才起步两秒，等她走到树下截图早拍完了（复审第三轮抓的正是这个）
          if (sis && !sis.following && Math.abs(sis.x - 57.5) > 4) {
            sis.cineTarget = null; sis.x = 57.5; sis.heading = -1;
          }
        }
      },
      steps: [
        { type: "pickup", x: 43.0, item: { id: "bucket", label: "空水桶", big: true }, prompt: "E · 拎起空桶" },
        // 由头三拍（CLAUDE.md 5.5 条）：先看见毛病（够不着）→ 再看见一个人
        // 干不成（蹦了半天）→ 最后才是请求（你打，我捡）
        { type: "talk", actor: "sister", prompt: "E · 问妹妹",
          lines: [
            { stage: "", d: 2.6, cam: { kind: "shot", x: 56.0, y: 1.9, dist: 6.2 },
              on: (state) => {
                const sis = FindActor(state, "sister");
                if (sis) { sis.cineTarget = null; sis.x = 55.4; sis.track = { name: "reachJump", t: 0, ambient: true }; }
              } },
            { stage: "", d: 2.2, cam: { kind: "insert", x: 55.8, y: 1.30, dist: 3.0 } },
            { who: "妹妹", say: "哥——够不着。我蹦了半天了。", d: 2.8,
              cam: { kind: "shot", x: 55.9, y: 1.6, dist: 5.5 },
              on: (state) => {
                const sis = FindActor(state, "sister");
                if (sis) sis.track = null;
              } },
            // 这句一个字没改。说的人不在了，话还在当家。
            { who: "妹妹", say: "娘说掺上榆钱，缸里那点糜子能多顶十天。", d: 3.2,
              cam: { kind: "ots", subject: "sister", other: "player", dist: 3.4 } },
            { who: "妹妹", say: "你打得着。你打，我捡。", d: 2.6,
              cam: { kind: "shot", x: 57.5, y: 1.5, dist: 6 },
              on: (state) => {
                const sis = FindActor(state, "sister");
                if (sis) { sis.track = null; sis.cineTarget = { x: 59.6 }; sis.cineSpeed = 2.2; }
              } },
          ],
          // 跳幕结算只跑 effect 不跑 talk 台词的 on()：妹妹的站位在这儿兜底
          //（正常游玩时她已在树下两步内，这一下是空操作，不会瞬移）
          effect: (state) => {
            const sis = FindActor(state, "sister");
            if (sis && Math.abs(sis.x - 57.5) > 4) { sis.x = 57.5; sis.heading = -1; sis.track = null; }
          } },
        { type: "use", zone: V.well, needs: "bucket", consume: false, prompt: "E · 搁桶查井绳",
          note: "井绳磨秃了一段。桶底那截麻绳正好使。",
          effect: (state) => {
            AddGroundItem(state, state.player.item, 60.2, "surface");
            state.player.item = null;
            state.flags.bucketAt = 60.2;
          } },
        { type: "use", zone: V.well, prompt: "E · 把磨损处折回",
          effect: (state) => { Cue(state, "crank", { gain: 0.7 }); } },
        { type: "knot", zone: V.well, knotY: 1.18,
          note: "麻绳缠紧，两头一拽——又能吃上劲了。",
          effect: (state) => { state.flags.wellRopeFixed = true; } },
        { type: "throwHit", pickupX: 61.2, target: { x: 56.3, y: 2.05, r: 1.0 },
          targetLabel: "榆钱枝",
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
            if (sis) { sis.track = null; sis.carry = "包袱布"; sis.following = true; sis.cineTarget = null; }
          } },
        { type: "goto", zone: { x: 42.8, w: 2.6 },
          effect: (state) => {
            state.player.item = null;
            state.flags.vatFilled = true;
            Cue(state, "waterSplash", { gain: 0.8 });
            const sis = FindActor(state, "sister");
            if (sis) { sis.following = false; sis.cineTarget = { x: 34.4 }; sis.cineSpeed = 1.6; }
            StartMicroCine(state, [
              { stage: "", d: 2.4, cam: { kind: "insert", x: 43.4, y: 1.0, dist: 2.8 } },
              { who: "妹妹", say: "缸里能照见人影喽。", d: 2.6,
                cam: { kind: "shot", x: 43, y: 1.2, dist: 4.4 } },
            ]);
          } },
      ],
    },
    {
      // 第六场：黄昏与晚饭。榆钱掺碎糜子熬的稀粥——今天这一天，维持下来了。
      kind: "cinematic", id: "c1_dusk", timeOfDay: "dusk",
      lines: [
        { stage: "黄昏把村子的影子拉得很长。这一天，就这么维持了下来。", d: 4.2,
          cam: { kind: "shot", x: 46, y: 1.8, dist: 7.5, pan: -3 } },
        { stage: "晚饭是榆钱掺碎糜子熬的稀粥。妹妹喝了两碗。", d: 3.8,
          cam: { kind: "shot", x: 33.6, y: 1.2, dist: 4.6 },
          on: (state) => {
            state.beat.indoorScene = true;
            // 坐就得坐在凳子上：旧木凳在 32.0（Data_Scenes），人钉在凳上——
            // 上一版她坐在 32.6 的空气里，凳子空在旁边（视觉审查退回）
            const sis = FindActor(state, "sister");
            if (sis) { sis.cineTarget = null; sis.x = 32.0; sis.heading = 1; sis.pose = "sitStool"; sis.carry = null; }
            state.player.cineWalk = null;
            state.player.x = 33.4;
            state.player.heading = -1;
          } },
        { who: "妹妹", say: "哥，正字画满了，是不是就……", d: 3.2,
          cam: { kind: "insert", x: 32.0, y: 1.05, dist: 2.8 } },
        { stage: "话没说完，她自己先打了个哈欠。", d: 2.8,
          cam: { kind: "shot", x: 32.8, y: 1.15, dist: 4.0 } },
        { stage: "柱子把她放平在铺盖上，跪在旁边，看她睡熟了。", d: 4.0,
          cam: { kind: "shot", x: 31.4, y: 0.95, dist: 3.6, trans: "dip" },
          on: (state) => {
            // 字幕说什么画面就有什么：她平躺在铺盖上（睡姿），他跪在铺盖
            // **西头**——站过去 32 那边正压着旧木凳，跪姿会读成"坐在凳上"
            //（复审第三轮抓的）。被角画不出来（被子盖不到演员身上），文案不提
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = 31.15; sis.heading = -1; sis.pose = "sleep"; }
            state.player.x = 30.5;
            state.player.heading = 1;
            FlashPose(state, "kneel", 3.8);
            // 收幕的光圈套在兄妹身上（不给的话圆心落在空墙上，人整个出画）
            state.irisFocus = { x: 31.0, y: 0.5 };
          } },
      ],
    },
    {
      // 第七场（玩法）：夜里下窖，整理爹娘的遗物。全程没有一句台词、一条手记
      // ——新剧本明令。特写只给一个：草苫底下那件带血的衣服。然后刨坑、
      // 放下去、填上土。埋的动作与本作所有挖掘同一套笔画。
      kind: "chain", id: "c1_cellar", timeOfDay: "night",
      objective: "下到窖里，把爹娘的东西归置了", hint: "东西还照三天前那样，摊着",
      onStart: (state) => {
        // 妹妹在铺盖上睡着（黄昏那拍哄睡的延续；换拍的 ClearPoses 会把睡姿
        // 抹掉，收幕光圈里她就站起来了——夜里他下窖，她得一直睡着）
        const sis = FindActor(state, "sister");
        if (sis) { sis.x = 31.15; sis.heading = -1; sis.pose = "sleep"; }
      },
      steps: [
        { type: "goto", zone: { x: 30.5, w: 3.2, level: "under" } },
        { type: "use", zone: { x: 33.9, w: 2.2, level: "under" }, hold: 1.4, stroke: "down", gestureY: 0.9,
          prompt: "E · 归置家什",
          effect: (state) => { Cue(state, "drop", { gain: 0.45, rate: 0.9 }); } },
        { type: "use", zone: { x: 27.8, w: 2.2, level: "under" }, hold: 1.4, stroke: "down", gestureY: 0.8,
          prompt: "E · 摆正笸箩",
          effect: (state) => { Cue(state, "pickup", { gain: 0.4 }); } },
        { type: "goto", zone: { x: 27.9, w: 1.6, level: "under" },
          effect: (state) => {
            // 唯一的特写：草苫底下的那件衣服。镜头看三秒，谁也不说话。
            // 人停在角落东边一步、跪下来——脚不能踩在那件衣裳上
            FlashPose(state, "kneel", 3.4);
            StartMicroCine(state, [
              { stage: "", d: 3.2, cam: { kind: "insert", x: 27.0, y: UNDER_Y + 0.55, dist: 2.2 } },
            ]);
          } },
        { type: "use", zone: { x: 27.1, w: 2.0, level: "under" }, hold: 2.4, stroke: "down", gestureY: 0.5,
          prompt: "把窖底的土刨开",
          effect: (state) => { state.flags.pitDug = true; Cue(state, "dig", { gain: 0.7 }); } },
        // 放进坑里是跪着放的（视觉审查：埋衣全程只有弯腰站姿，"跪"只闪过一下）
        { type: "pickup", x: 27.0, level: "under", item: { id: "bloodClothes", label: "那件衣裳", big: true },
          prompt: "E · 抱起来" },
        { type: "use", zone: { x: 27.1, w: 2.0, level: "under" }, needs: "bloodClothes",
          prompt: "E · 放下去", pose: "kneel",
          effect: (state) => { FlashPose(state, "kneel", 2.2); Cue(state, "drop", { gain: 0.35, rate: 0.7 }); } },
        { type: "use", zone: { x: 27.1, w: 2.0, level: "under" }, hold: 2.2, stroke: "down", gestureY: 0.5,
          prompt: "把土填回去 · 拍实",
          effect: (state) => {
            state.flags.clothesBuried = true;
            Cue(state, "dig", { gain: 0.6 });
            Cue(state, "drop", { gain: 0.5, rate: 0.7, delay: 1.0 });
          } },
        { type: "goto", zone: { x: 29.4, w: 2.4 } },
      ],
    },
    {
      // 章末：他从窖里爬上来，妹妹站在窖口。她什么都知道。
      kind: "cinematic", id: "c1_knows", timeOfDay: "night", indoorScene: true,
      lines: [
        { stage: "", d: 2.4, cam: { kind: "shot", x: 29.6, y: 1.15, dist: 3.8 },
          on: (state) => {
            const sis = FindActor(state, "sister");
            if (sis) { sis.visible = true; sis.x = 28.2; sis.heading = 1; sis.pose = null; }
            state.player.x = 29.8;
            state.player.heading = -1;
          } },
        { stage: "妹妹站在窖口边上，揉着眼睛。不知站了多久。", d: 3.6,
          cam: { kind: "shot", x: 29.0, y: 1.1, dist: 3.6 } },
        { who: "妹妹", say: "哥。", d: 1.8,
          cam: { kind: "insert", x: 28.2, y: 1.0, dist: 2.6 } },
        { who: "妹妹", say: "你是不是……去找爹了？", d: 3.4,
          cam: { kind: "ots", subject: "sister", other: "player", dist: 3.0 } },
        { stage: "柱子没答上来。", d: 2.8,
          cam: { kind: "close", on: "player", dist: 3.2 } },
        { stage: "他忽然明白——她什么都知道。", d: 3.2,
          cam: { kind: "shot", x: 29.0, y: 1.15, dist: 3.4 } },
        { stage: "「快了」，是兄妹两个一起说的谎。", d: 3.8, cam: { kind: "dark" } },
      ],
    },
  ],

  // =========================================================================
  // 第二章 · 地洞里的眼睛（2026-08-11 按 Notion「剧本新生」重写整章）
  // 梳篦扫荡再次进村：带着妹妹和受伤的邻居躲进菜窖。黑暗里捂住妹妹的嘴，
  // 听头顶的脚步与哭喊（恐惧走声音，不走画面）→伤员咳嗽的两难（冒险上去
  // 舀水 / 让他咬布忍着——第一个道德困境，选哪边都不会导致暴露：窖口是
  // 梳篦扫荡自己翻出来的，护送对象与伤员永不成为失败原因）→敌人发现窖口
  // →墙角松土下挖出祖辈的旧防兵洞→窄道爬出脱险→七叔那句「光躲不行。
  // 得想办法打。」→回望黑洞口：不是坟墓，是起点。
  // 玩法承接（剧本新生§2）：声音侦测潜行（舀水支线）、时间敏感的选择、
  // 发现隐藏路径（地道系统的概念从这儿开启——underDig 的两面旗在本章落）。
  // =========================================================================
  c2: [
    {
      kind: "cinematic", id: "c2_open", timeOfDay: "day", noDetect: true,
      lines: [
        // 正字特写照旧刻痕那一镜的配方（c1_measure ①）：贴着左立柱、
        // 打门洞里看——立面在画框外，柱面上的道道占满画
        { stage: "谷雨过了。门框上的正字，添到了第十三道。", d: 3.6,
          cam: { kind: "insert", x: 33.62, y: 0.76, dist: 0.95 },
          on: (state) => { state.beat.indoorScene = true; state.doorLeaf = null; } },
        { stage: "这天晌午，村东头的乌鸦轰的一声全飞起来了。", d: 3.2,
          cam: { kind: "shot", x: 120, y: 2.2, dist: 9 },
          on: (state) => {
            Cue(state, "flutter", { gain: 0.9 });
            Cue(state, "flutter", { gain: 0.7, delay: 0.7 });
          } },
        { stage: "鬼子又进村了。这一回是梳篦式的——一条街一条街，一户不落。", d: 5.0,
          cam: { kind: "shot", x: 130, y: 1.8, dist: 10, pan: -8 },
          on: (state) => {
            SpawnRaidSoldiers(state);
            // 点户的伪保长又打头来了——梳篦扫荡照册子篦，名册还在他手上
            state.actors.push(
              MakeActor("baozhang", "puppet", RaidStartX("traitor") + 1.4,
                { label: "伪保长", decor: true, carry: "名册", heading: -1 }),
            );
            Cue(state, "motorPutt", { gain: 0.55 });
            // 整支队伍压进东街：从村东口一路往西碾。真参与判定的两个兵
            // 收了巡逻，先跟着队伍走——判定到舀水支线才开考
            for (const a of state.actors) {
              if (!(IsEnemy(a) || a.id === "officer")) continue;
              a.patrol = null;
              a.x -= 46;
              a.heading = -1;
              if (a.pinTo) continue;
              a.cineTarget = { x: a.x - 20 };
              a.cineSpeed = RAID_SPEED;
            }
          } },
        { stage: "跑不赢了。街上已经过不去人。", d: 3.0,
          cam: { kind: "shot", x: 62, y: 1.6, dist: 8 },
          on: (state) => {
            // 七叔扶着田大爷，刘嫂在后头，往柱子家赶——东头过不去，
            // 全村人都知道梁家有窖
            const P = (id, x, tx, sp) => {
              const a = FindActor(state, id);
              if (a) { a.visible = true; a.x = x; a.heading = -1; a.cineTarget = { x: tx }; a.cineSpeed = sp; }
            };
            P("qishu", 54, 40.5, 2.2);
            P("tianYe", 55.2, 41.8, 1.35);
            P("liusao", 56.4, 43.0, 1.8);
            Cue(state, "knock", { gain: 0.7, delay: 1.2 });
          } },
        { who: "七叔", say: "柱子！开窖口！", d: 2.8,
          cam: { kind: "shot", x: 42, y: 1.4, dist: 6 },
          on: (state) => {
            state.player.cineWalk = { x: 36.4, speed: 2.6 };
            const sis = FindActor(state, "sister");
            if (sis) { sis.cineTarget = { x: 35.2 }; sis.cineSpeed = 2.6; }
          } },
      ],
    },
    {
      // 第一场（玩法）：带大家下窖。掀盖板→乡亲们下去→自己带妹妹下去→
      // 从里头把盖板拉严。没有倒计时：紧迫感全在东头越来越近的动静里。
      kind: "chain", id: "c2_shelter", timeOfDay: "day", indoorScene: true, noDetect: true,
      objective: "带大家下窖", hint: "先掀盖板；人都下去了，再从里头拉严",
      onStart: (state) => {
        state.player.cineWalk = null;
        const sis = FindActor(state, "sister");
        if (sis) { sis.cineTarget = null; sis.x = 35.2; sis.following = true; }
        // 篦子往西头压过去了：两个真判定的兵也跟着去村西——
        // 不清走的话他们停在院门口罚站，一家人当着兵的面掀盖板下窖
        for (const [id, px] of [["raid1", 14], ["raid2", 8]]) {
          const a = FindActor(state, id);
          if (a) { a.cineTarget = null; a.x = Math.min(a.x, 24); a.patrol = [4, px + 8]; a.speed = 1.1; a.heading = -1; }
        }
      },
      tick: (state) => {
        const b = state.beat;
        b.poundT = (b.poundT || 0) + 1 / 60;
        if (b.poundT > 6) { b.poundT = 0; Cue(state, "knock", { gain: 0.8 }); }
      },
      steps: [
        { type: "use", zone: { x: 29, w: 2.9 }, prompt: "E · 掀开盖板",
          effect: (state) => {
            Cue(state, "doorCreak", { gain: 0.8 });
            StartMicroCine(state, [
              { stage: "", d: 2.4, cam: { kind: "shot", x: 30.2, y: 1.2, dist: 4.6, trans: "dip" },
                on: (s) => {
                  // 黑场里下人：七叔先下，转身接田大爷；刘嫂殿后
                  const D = (id, x, h) => {
                    const a = FindActor(s, id);
                    if (a) { a.cineTarget = null; a.level = "under"; a.x = x; a.heading = h; }
                  };
                  D("qishu", 32.0, -1); D("tianYe", 30.8, 1);
                  const ls = FindActor(s, "liusao");
                  if (ls) { ls.cineTarget = { x: 29.6 }; ls.cineSpeed = 2.2; }
                } },
              { stage: "", d: 2.0, cam: { kind: "shot", x: 30.2, y: 1.15, dist: 4.2, trans: "dip" },
                on: (s) => {
                  const ls = FindActor(s, "liusao");
                  if (ls) { ls.cineTarget = null; ls.level = "under"; ls.x = 33.0; ls.heading = -1; }
                } },
            ]);
          } },
        { type: "goto", zone: { x: 30.4, w: 2.8, level: "under" } },
        { type: "use", zone: { x: 29, w: 2.9, level: "under" }, hold: 1.3, stroke: "up", gestureY: 1.5,
          prompt: "把盖板拉严 · 往上够",
          note: "盖板合严了。窖里只剩下喘气声。",
          effect: (state) => { state.flags.lidShut = true; Cue(state, "tenon", { gain: 0.8 }); } },
      ],
    },
    {
      // 第二场（玩法）：捂住妹妹的嘴。sustain 长按——量的是时间本身，
      // 长按在这儿是诚实的（CLAUDE.md 拟物交互第 2 条）。
      // 恐惧全部走声音：脚步、踹门、翻缸、远处的哭喊，一段一段从头顶碾过去。
      kind: "hold", id: "c2_hush", timeOfDay: "day", noDetect: true,
      zone: { x: 31.6, w: 3.4, level: "under" }, holdTime: 10, sustain: true,
      holdPose: "shelter",
      holdPrompt: "按住 E · 捂住妹妹的嘴",
      objective: "头顶有动静——捂住，别出声", hint: "手别松。妹妹比你还怕",
      note: "脚步声从头顶过去了。又回来。又过去。",
      onEnter: (state) => {
        // 窖里人的站位：挤在搁板下那一小片（场景数据留的就是这块空），
        // 全靠横向错位分人——**地下不许用 rank**：退一档深度会把人整个
        // 推到近侧剖面那刀土后面，画面上人间蒸发（实拍验过：田大爷和
        // 刘嫂就是这么没的）。
        // level/visible 在这儿兜底：下窖的走位演在 shelter 的微过场里，
        // 跳幕结算不重放台词 on()——不兜底，跳过来窖里就只有柱子一个人
        const S = (id, x, h, pose) => {
          const a = FindActor(state, id);
          if (a) {
            a.x = x; a.heading = h; a.pose = pose; a.rank = 0;
            a.cineTarget = null; a.level = "under"; a.visible = true;
          }
        };
        S("tianYe", 29.6, 1, "kneel");
        S("liusao", 30.4, 1, "kneel");
        S("qishu", 33.2, -1, "bow");
        const sis = FindActor(state, "sister");
        if (sis) {
          sis.following = false; sis.x = 31.15; sis.heading = 1; sis.pose = "leanIn";
          sis.level = "under"; sis.visible = true;
        }
        state.player.x = 31.6;
        state.player.heading = -1;
        // 头顶的搜查队：剖面招牌构图——上面在翻，下面在屏息。
        // 巡逻带收窄到窖口正上方那一片：默认那套带子太长，搜到两端时
        // 画框顶上那条地面里一个兵都没有，「头顶有动静」只剩音效
        SpawnSurfaceSearch(state, 31);
        const W = (id, x, p0, p1, sp) => {
          const a = FindActor(state, id);
          if (a) { a.x = x; a.patrol = [p0, p1]; a.speed = sp; }
        };
        W("srch1", 33, 27.5, 36, 0.9);
        W("srch2", 26, 24, 32.5, 1.15);
        W("srch3", 38, 33, 43, 1.0);
      },
      tick: (state, dt) => {
        const b = state.beat;
        b.hushT = (b.hushT || 0) + 1 / 60;
        // 捂着的那只手要一直落在妹妹身上：shelter 的搂臂顺着朝向伸，
        // 玩家从东边走进判定区时朝向还朝西——按住 E 的每一帧都把脸转向她
        if (state.player.pose === "shelter") {
          const sis = FindActor(state, "sister");
          if (sis) state.player.heading = sis.x <= state.player.x ? -1 : 1;
        }
        // 声音脚本：一段一段压过去（不循环，照 holdProgress 走到哪响到哪）
        const CUES = [
          [1.0, "step", 0.7, 1.0], [2.1, "step", 0.8, 0.95],
          [3.0, "knock", 1.1, 0.85], [4.1, "drop", 1.0, 0.8],
          [5.2, "sobBreath", 0.45, 1.0], [6.3, "step", 0.75, 0.9],
          [7.4, "knock", 0.9, 0.75], [8.6, "step", 0.6, 1.05],
        ];
        b.hushFired = b.hushFired || new Set();
        for (let i = 0; i < CUES.length; i += 1) {
          const [t, name, gain, rate] = CUES[i];
          if (b.hushT >= t && !b.hushFired.has(i)) {
            b.hushFired.add(i);
            Cue(state, name, { gain, rate });
          }
        }
        // 心跳：按住的时间越长，心跳越沉
        b.heartT = (b.heartT || 0) + dt;
        const beatEvery = 1.15 - 0.35 * (b.holdProgress / 10);
        if (b.heartT > beatEvery) {
          b.heartT = 0;
          Cue(state, "heartbeat", { gain: 0.32 + 0.2 * (b.holdProgress / 10) });
        }
      },
      onDone: (state) => {
        // 「脚步声过去了」得是真的：头顶那拨翻找的走人（往东出画）。
        // 不清场的话，舀水那一趟一冒头就撞在他们脚边——而且他们还站在
        // 自家盖板上，怎么掀（c2_found 那拨是折回来的新篦子）
        for (const id of ["srch1", "srch2", "srch3"]) {
          const a = FindActor(state, id);
          if (a) { a.patrol = null; a.cineTarget = { x: 120 }; a.cineSpeed = 1.8; a.cineVanish = true; a.heading = 1; }
        }
      },
    },
    {
      // 过场：伤员的咳压不住了。抉择的由头先演出来，再让玩家拿主意。
      kind: "cinematic", id: "c2_worse", timeOfDay: "day", noDetect: true,
      lines: [
        { stage: "田大爷胸口拉风箱似的响。他把咳压在嗓子眼里，压一下，抖一下。", d: 4.4,
          cam: { kind: "insert", x: 30.4, y: UNDER_Y + 0.75, dist: 2.6 },
          on: (state) => {
            // 换拍时 ClearPoses 把捂嘴那拍的姿势全抹了——整窖人重新钉一遍，
            // 不然除了田大爷全员站军姿。压咳要演出来：从跪坐弓下去
            const P = (id, pose, h) => {
              const a = FindActor(state, id);
              if (a) { a.pose = pose; if (h) a.heading = h; }
            };
            P("tianYe", "bow", 1);
            P("qishu", "bow", -1);
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = 31.15; sis.heading = 1; sis.pose = "leanIn"; }
            state.player.heading = -1;
            Cue(state, "sobBreath", { gain: 0.5, rate: 1.5 });
            Cue(state, "sobBreath", { gain: 0.4, rate: 1.4, delay: 1.6 });
          } },
        { stage: "刘嫂把水葫芦倒过来。空的。", d: 3.0,
          cam: { kind: "insert", x: 30.9, y: UNDER_Y + 0.75, dist: 2.6 },
          on: (state) => {
            // 说到谁谁就得在画里：刘嫂挪到田大爷跟前，**手里得真有那只水葫芦**
            //（视觉审查退回过：说倒葫芦、演的是空手搀扶）。倒过来的动作
            // 由弓身+葫芦一起读——她俯身把葫芦口冲下比给大家看
            const ls = FindActor(state, "liusao");
            if (ls) { ls.x = 31.2; ls.heading = -1; ls.pose = "bow"; ls.carry = "水葫芦"; }
          } },
        { stage: "头顶的脚步还没走利索。可这咳，也压不了几响了。", d: 3.8,
          cam: { kind: "shot", x: 31.5, y: UNDER_Y + 1.3, dist: 5 },
          on: (state) => {
            // 收葫芦；全景里柱子与七叔别站成一对复制人——七叔转身望向窖口
            const ls = FindActor(state, "liusao");
            if (ls) { ls.carry = null; ls.pose = "kneel"; }
            const q = FindActor(state, "qishu");
            if (q) { q.pose = null; q.heading = -1; q.x = 32.8; }
            state.player.heading = 1;   // 柱子看着田大爷那头，与七叔一朝东一朝西
          } },
      ],
    },
    {
      // 第三场（玩法·抉择）：第一个道德困境。时间敏感的是处境不是倒计时——
      // 两边都是真代价：上去，是拿自己冒险；忍着，是拿别人的罪受换安稳。
      // 选哪边都不会导致暴露（窖口是梳篦扫荡自己翻出来的）：
      // 护送对象与伤员永不成为失败原因，这是全作铁律。
      kind: "choice", id: "c2_cough", timeOfDay: "day", flagKey: "coughChoice", noDetect: true,
      prompt: "水早见了底。是冒险上去舀水，还是让他咬着布忍？",
      options: [
        { key: "water", label: "上去舀水", detail: "扫荡队还在街上。贴着墙根到院里水缸，舀半瓢就回来。" },
        { key: "endure", label: "让他忍着", detail: "把布巾递过去让他咬住。眼下，一步都不能出这个窖。" },
      ],
      objective: "拿主意",
    },
    {
      // 抉择分支 A（玩法）：上去舀水。声音侦测潜行的第一课：蹲着走是静的，
      // 直着腰跑是响的；被灯照住不是死——缩回窖里，等脚步走远重来。
      kind: "chain", id: "c2_fetch", timeOfDay: "day",
      when: (state) => state.flags.coughChoice === "water",
      debugForce: (state) => { state.flags.coughChoice = "water"; },
      objective: "上去舀半瓢水，就回来", hint: "蹲着走。灯扫过来就贴住柴堆",
      resetHint: "灯扫着院子了。柱子缩回窖里，等脚步走远。",
      onDone: (state) => {
        // 瓢喝完收走（姿势由换拍的 ClearPoses 统一收）
        const ty = FindActor(state, "tianYe");
        if (ty) ty.carry = null;
      },
      onStart: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) { sis.following = false; sis.pose = "leanIn"; }
        // 考场开张：一个兵在街东头来回，隔几步就停下回头扫——他的脸朝哪儿
        // 就是这条链的题面（回头那两秒多，就是过院子的窗口）。
        // 巡逻带东端顶在井台，西端离水缸七八米：读得出节奏就有得走，
        // 头铁直走的也能撞上他背身的那一程（可完成性铁律）
        const r2 = FindActor(state, "raid2");
        if (r2) {
          // 西端 48：舀水那一下他在画框里踱着（离缸 4.6m）——危险要看得见，
          // 只写在提示文案里等于没有（视觉审查退回过"空院舀水"）
          r2.cineTarget = null; r2.x = 54; r2.patrol = [48, 61]; r2.speed = 0.95;
          r2.scanEvery = 4.0; r2.scanHold = 2.4;
        }
        const r1 = FindActor(state, "raid1");
        if (r1) { r1.cineTarget = null; r1.x = 78; r1.patrol = [66, 92]; r1.speed = 1.2; }
      },
      steps: [
        { type: "use", zone: { x: 29, w: 2.9, level: "under" }, prompt: "E · 探听动静",
          note: "近处没脚步。就一趟——舀了就回。",
          effect: (state) => { Cue(state, "doorCreak", { gain: 0.5 }); } },
        { type: "goto", zone: { x: 30.2, w: 2.6 } },
        { type: "use", zone: { x: 43.4, w: 2.9 }, prompt: "E · 舀水",
          effect: (state) => {
            GiveItem(state, { id: "ladleWater", label: "半瓢水" });
            Cue(state, "waterSplash", { gain: 0.5 });
          } },
        { type: "goto", zone: { x: 30.4, w: 2.8, level: "under" } },
        { type: "use", zone: { x: 30.6, w: 2.9, level: "under" }, needs: "ladleWater", prompt: "E · 递过去",
          effect: (state) => {
            // 递过去＝瓢真的换手：柱子俯身递（闪姿盖满第一行），田大爷跪着
            // 捧瓢就嘴（clothMouth 的手在嘴边，瓢跟着手——"一口一口顺下去"）。
            // **姿势必须写在 effect 里**：微过场的行不执行 on()（引擎语义，
            // 上一版挂在行上等于没写，四个人站着干念字幕）
            const ty = FindActor(state, "tianYe");
            if (ty) { ty.carry = "半瓢水"; ty.pose = "clothMouth"; ty.heading = 1; }
            state.player.x = Math.min(state.player.x, 30.5);
            state.player.heading = -1;
            FlashPose(state, "bow", 3.2);
            StartMicroCine(state, [
              { stage: "水一口一口顺下去。咳，压住了。", d: 3.0,
                cam: { kind: "insert", x: 30.3, y: UNDER_Y + 0.75, dist: 2.6 } },
              { stage: "田大爷抬起眼皮看了看他，没说话。", d: 2.8,
                cam: { kind: "insert", x: 30.4, y: UNDER_Y + 0.85, dist: 2.4 } },
            ]);
          } },
        // 垫一步再收束：递水若是最后一步，AdvanceBeat 的 ClearPoses 会在
        // effect 摆完姿势的同一帧把它抹掉——微过场里四个人站着干念字幕
        //（实拍两轮都栽在这儿）。人本来就站在区里，微过场一完这步自动过
        { type: "goto", zone: { x: 30.4, w: 2.9, level: "under" } },
      ],
    },
    {
      // 抉择分支 B（过场）：让他忍着。没有解法的那一边也要给分量——
      // 咬布、憋咳、谁也不看谁。
      kind: "cinematic", id: "c2_endure", timeOfDay: "day", noDetect: true,
      when: (state) => state.flags.coughChoice !== "water",
      debugForce: (state) => { state.flags.coughChoice = "endure"; },
      lines: [
        { stage: "柱子把布巾叠成三折，递了过去。", d: 3.0,
          cam: { kind: "insert", x: 30.6, y: UNDER_Y + 0.8, dist: 2.6 },
          on: (state) => {
            // 布巾要真的在手上，人站到一臂之内（穿模与空手递被视觉审查退回过）
            state.player.item = { id: "cloth", label: "花布巾" };
            state.player.cineWalk = { x: 30.6, speed: 1.2 };
            // 妹妹让开刘嫂那条身位：叠在她正后方只露一条粉边，构图上等于没有
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = 31.7; sis.heading = -1; sis.pose = "leanIn"; }
          } },
        { stage: "田大爷咬住。咳声闷在布里，一声，一声。", d: 4.0,
          cam: { kind: "insert", x: 30.0, y: UNDER_Y + 0.85, dist: 2.4 },
          on: (state) => {
            state.player.cineWalk = null;
            state.player.x = 30.6;
            state.player.heading = -1;
            state.player.item = null;
            // 「咬住」要发生在画面里：clothMouth 把布巾举到嘴上（布走 carry 的
            // 手挂点，手到嘴边布就到嘴边）。老版 bow+布在垂着的手里，
            // 布离嘴一条小臂远——视觉审查退回过
            const ty = FindActor(state, "tianYe");
            if (ty) { ty.carry = "花布巾"; ty.pose = "clothMouth"; ty.heading = 1; }
            Cue(state, "sobBreath", { gain: 0.4, rate: 1.5 });
            Cue(state, "sobBreath", { gain: 0.35, rate: 1.45, delay: 1.4 });
            Cue(state, "sobBreath", { gain: 0.3, rate: 1.5, delay: 2.7 });
          } },
        { stage: "妹妹把脸埋进柱子怀里。谁也没看谁。", d: 3.6,
          cam: { kind: "shot", x: 30.9, y: UNDER_Y + 1.05, dist: 3.2 },
          on: (state) => {
            // 埋进怀里＝一对姿势：她贴上来 leanIn，他蹲下去 shelter 兜住——
            // 老版她抱着刘嫂的腿、柱子空手站在一米外，字幕画面各说各的
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = state.player.x + 0.32; sis.heading = -1; sis.pose = "leanIn"; }
            state.player.heading = 1;
            FlashPose(state, "shelter", 3.4);
          } },
      ],
    },
    {
      // 第四场：敌人发现窖口。千钧一发——柱子退到窖底最里头，
      // 脚跟碾着的那块土是松的。
      kind: "cinematic", id: "c2_found", timeOfDay: "day", noDetect: true,
      lines: [
        { stage: "头顶的脚步，忽然停在了屋当间。", d: 3.0,
          cam: { kind: "shot", x: 30, y: UNDER_Y + 1.2, dist: 5.5 },
          on: (state) => {
            // 折回来的一拨篦子：重新生成（上一拨在捂嘴那拍走干净了；
            // 同 id 的旧壳先清掉，FindActor 只认第一个）
            state.actors = state.actors.filter((a) => !a.id.startsWith("srch"));
            SpawnSurfaceSearch(state, 30);
            const S = (id, x) => {
              const a = FindActor(state, id);
              if (a) { a.patrol = null; a.cineTarget = { x }; a.cineSpeed = 1.6; }
            };
            S("srch1", 30.5); S("srch2", 28); S("srch3", 33);
            Cue(state, "step", { gain: 0.8 });
          } },
        { stage: "枪托笃、笃地砸着地。砸到窖口那一下——声音是空的。", d: 3.8,
          cam: { kind: "insert", x: 29, y: UNDER_Y + 2.1, dist: 3.4 },
          on: (state) => {
            Cue(state, "knock", { gain: 1.2, rate: 0.8 });
            Cue(state, "knock", { gain: 1.3, rate: 0.7, delay: 1.0 });
          } },
        { stage: "上面静了静。跟着，有什么顺着盖板缝别了进来——盖板让它撬得翘起一条缝。", d: 4.6,
          cam: { kind: "insert", x: 29, y: UNDER_Y + 2.2, dist: 3.6 },
          on: (state) => {
            // 撬要看得见：盖板真的翘开一条缝（state.lid 常立着，World 按它转角）。
            // open 走 smoothstep，0.3 折出来约 13°——一条明晃晃的缝，天光漏进来。
            // **机位得抬到画框上沿过地平线**：盖板躺在地面那条线上，
            // 低机位（+1.5）的画框顶只到 −0.75，说破天玩家也看不见板
            //（复审第三轮抓的正是"盖板整个在画框外"）
            state.lid = { id: "cellarHatch", open: 0.3 };
            Cue(state, "tenon", { gain: 0.7, rate: 0.8 });
            Cue(state, "dig", { gain: 0.4, rate: 1.3, delay: 1.2 });
          } },
        { who: "七叔", say: "……要开了。", d: 2.2,
          cam: { kind: "insert", x: 33.4, y: UNDER_Y + 0.95, dist: 2.3 } },
        { stage: "柱子退到窖底最里头。脚跟碾着的那块土——是松的。", d: 3.8,
          cam: { kind: "insert", x: 42.3, y: UNDER_Y + 0.45, dist: 2.4 },
          on: (state) => {
            state.player.cineWalk = { x: 42.2, speed: 2.4 };
            Cue(state, "knock", { gain: 1.0, rate: 0.75, delay: 1.6 });
          } },
      ],
    },
    {
      // 第五场（玩法）：挖。两轮笔画把 underDig 的两面旗都落了——
      // 松土塌出一个黑口子，是早年祖先挖的旧防兵洞。
      // 头顶的砸声一轮紧过一轮（只是声音，没有倒计时，也没有失败）。
      kind: "chain", id: "c2_digout", timeOfDay: "day", noDetect: true,
      objective: "墙角的土是松的——挖！", hint: "一下接一下，别停",
      onStart: (state) => {
        state.player.cineWalk = null;
        // 站 41.7：没挖开之前近侧剖面的洞腔在 42.6 的墙前就开始收口，
        // 42.2 那一步人已经埋进收口的土里（实拍：整个人只剩一条黑边）。
        // 挖第一下之后 digStarted 把腔体往前放开，人再往前跟就看得见了
        state.player.x = 41.7;
        // 大家往窖底聚拢，让开挖土的人（level/visible 兜底同 c2_hush——
        // 跳幕结算不重放微过场的走位）
        const S = (id, x, h) => {
          const a = FindActor(state, id);
          if (a) {
            a.x = x; a.heading = h; a.pose = null; a.rank = 0;
            a.level = "under"; a.visible = true; a.cineTarget = null;
          }
        };
        S("qishu", 40.6, 1);
        S("liusao", 39.2, 1);
        S("tianYe", 38.0, 1);
        const sis = FindActor(state, "sister");
        if (sis) { sis.pose = null; sis.x = 39.9; sis.heading = 1; sis.level = "under"; sis.visible = true; }
      },
      tick: (state) => {
        const b = state.beat;
        b.poundT = (b.poundT || 0) + 1 / 60;
        if (b.poundT > 3.6) {
          b.poundT = 0;
          Cue(state, "knock", { gain: 1.1, rate: 0.72 });
        }
      },
      steps: [
        // 判定区中心退到 41.8：区就是人站的地方，站在剖面收口里挖＝画面上没人在挖
        { type: "use", zone: { x: 41.8, w: 2.2, level: "under" }, hold: 2.4, stroke: "down", gestureY: 0.6,
          prompt: "刨开松土",
          note: "土往里塌了一块——后头是空的！",
          effect: (state) => { state.flags.digStarted = true; Cue(state, "dig", { gain: 0.9 }); } },
        { type: "use", zone: { x: 43.4, w: 2.6, level: "under" }, hold: 2.2, stroke: "down", gestureY: 0.6,
          prompt: "把口子掏大",
          note: "黑黢黢一个洞口，里头的风是凉的。",
          effect: (state) => {
            state.flags.tunnelDug = true;
            Cue(state, "dig", { gain: 0.9 });
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = { x: 41.6 }; q.cineSpeed = 2.0; }
            StartMicroCine(state, [
              { who: "七叔", say: "这洞……通到我家柴房底下去！是老辈人打的防兵洞！", d: 4.4,
                cam: { kind: "shot", x: 42.6, y: UNDER_Y + 1.1, dist: 3.8 } },
              { who: "七叔", say: "钻！小的先走！", d: 2.2,
                cam: { kind: "insert", x: 42.0, y: UNDER_Y + 0.95, dist: 2.4 } },
            ]);
          } },
      ],
    },
    {
      // 第六场（玩法）：顺着窄道爬出去。净高只够爬（tight 段接管姿态），
      // 妹妹镜像跟着；乡亲们在后头。身后是盖板碎裂的响声——只有声音。
      kind: "escort", id: "c2_crawl", timeOfDay: "day", noDetect: true,
      follower: "sister", dest: { x: 51.8, w: 2.8, level: "under" },
      objective: "带妹妹顺着窄道爬出去", hint: "洞矮，得爬；她跟得上你",
      onEnter: (state) => {
        // 跟着爬的一串人（跳幕兜底：层级/可见/位置一起钉）。
        // **不挂 following**：三个跟随者都朝玩家身后同一个位置挤，窄洞里
        // 当场叠成一摞人。改成各给一个慢速爬行目标——终点、速度都错开，
        // 队伍拉成一串；他们比玩家慢，落在身后正好（身后就是被砸开的窖口）
        const back = [1.4, 2.5, 3.6];
        const dest = [50.8, 49.4, 48.0];
        const pace = [0.55, 0.5, 0.45];
        ["qishu", "liusao", "tianYe"].forEach((id, i) => {
          const a = FindActor(state, id);
          if (a) {
            a.following = false; a.slow = true; a.level = "under"; a.visible = true;
            a.pose = null; a.rank = 0;
            if (Math.abs(a.x - state.player.x) > 6) a.x = state.player.x - back[i];
            a.cineTarget = { x: dest[i] }; a.cineSpeed = pace[i]; a.heading = 1;
          }
        });
        const sis = FindActor(state, "sister");
        if (sis) {
          sis.level = "under"; sis.visible = true; sis.pose = null;
          if (Math.abs(sis.x - state.player.x) > 6) sis.x = state.player.x - 0.9;
        }
      },
      tick: (state) => {
        const b = state.beat;
        b.crashT = (b.crashT || 0) + 1 / 60;
        if (b.crashT > 5 && !b.crashed) {
          b.crashed = true;
          // 身后：盖板被砸开了。脚步灌进窖里——声音在先，谁要是回头看，
          // 老窖口那块板也真是四敞大开的
          state.lid = { id: "cellarHatch", open: 1 };
          Cue(state, "drop", { gain: 1.3, rate: 0.6 });
          Cue(state, "step", { gain: 0.8, delay: 0.9 });
          Cue(state, "step", { gain: 0.7, rate: 0.9, delay: 1.5 });
        }
      },
      onDone: (state) => {
        for (const id of ["qishu", "liusao", "tianYe"]) {
          const a = FindActor(state, id);
          if (a) { a.following = false; a.cineTarget = null; }
        }
      },
    },
    {
      // 第七场：爬出来。喘匀了气，七叔说出全章那句话。
      kind: "cinematic", id: "c2_out", timeOfDay: "day", noDetect: true,
      lines: [
        { stage: "", d: 2.6, cam: { kind: "shot", x: 53, y: 1.25, dist: 5, trans: "dip" },
          on: (state) => {
            // 黑场里换层：从七叔家柴房的旧窖口上来，人摊在柴垛背后
            state.player.level = "surface";
            state.player.x = 50.6;
            state.player.heading = -1;
            state.player.crouch = false;   // 地道里是爬出来的，上了地就站直——蹲姿留在洞里
            // 姿势要错开：田大爷瘫坐（跪）、刘嫂扶着膝盖喘（弓）、七叔站着——
            // 三个人一模一样折成 90° 就是三份复制粘贴。
            // 站位让开窖口盖板的倒伏带：盖板从 52.6 的铰链往西掀倒，掀开时
            // 板身盖住 51.1~52.6——人站进去就像扛着两块木头（实拍退回过）。
            // 兄妹刘嫂在洞口西边，七叔田大爷在东边，敞着的黑洞口空在当中
            const U = (id, x, h, pose) => {
              const a = FindActor(state, id);
              if (a) { a.following = false; a.level = "surface"; a.x = x; a.heading = h; a.pose = pose || null; a.cineTarget = null; }
            };
            U("qishu", 53.8, -1);
            U("tianYe", 55.0, -1, "kneel");
            U("liusao", 49.4, 1, "bow");
            const sis = FindActor(state, "sister");
            if (sis) { sis.following = false; sis.level = "surface"; sis.x = 50.1; sis.heading = 1; sis.pose = "leanIn"; }
            // 街上的动静"堵在村西头"——那两个巡逻兵就真得在村西头。
            // 舀水支线把 raid2 拴在 50~64（正是这一镜的画框），不挪走的话
            // 一家人喘气的背后就站着一个来回踱步的日本兵
            for (const rid of ["raid1", "raid2"]) {
              const r = FindActor(state, rid);
              if (r) { r.cineTarget = null; r.x = Math.min(r.x, 18); r.patrol = [4, 20]; r.speed = 1.0; r.heading = -1; }
            }
            // 爬出来的那个窖口敞着（章末"回望黑洞口"全指着它）；
            // state.lid 只在爬梯时短暂立起，这里长立到章末
            state.lid = { id: "qishuHatch", open: 1 };
            Cue(state, "flutter", { gain: 0.5 });
          } },
        { stage: "从七叔家柴房的旧窖口爬上来，天光晃得人睁不开眼。", d: 3.6,
          cam: { kind: "shot", x: 52.8, y: 1.2, dist: 5.5 } },
        { stage: "街上的动静，还堵在村西头。谁也没说话，先喘。", d: 3.4,
          cam: { kind: "shot", x: 53.2, y: 1.25, dist: 6 },
          on: (state) => {
            Cue(state, "motorPutt", { gain: 0.25 });
            Cue(state, "knock", { gain: 0.3, delay: 1.4 });
          } },
        { stage: "田大爷靠着柴垛，咳出了声——这回，不用捂了。", d: 3.6,
          cam: { kind: "insert", x: 55.0, y: 0.9, dist: 2.8 },
          on: (state) => {
            Cue(state, "sobBreath", { gain: 0.5, rate: 1.4 });
          } },
        { stage: "", d: 2.4, cam: { kind: "shot", x: 53.0, y: 1.3, dist: 4.4 },
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) q.heading = -1;
          } },
        { who: "七叔", say: "光躲不行。得想办法打。", d: 4.0,
          cam: { kind: "insert", x: 53.8, y: 1.35, dist: 2.6 } },
      ],
    },
    {
      // 章末：回望那个黑洞口。章名在这儿落——地洞里的眼睛。
      kind: "cinematic", id: "c2_end", timeOfDay: "day", noDetect: true,
      lines: [
        { stage: "柱子回过头。", d: 2.2,
          cam: { kind: "shot", x: 52.6, y: 1.2, dist: 4 },
          on: (state) => {
            state.player.heading = 1;   // 从 50.6 回头看东边 52.6 的洞口
            // 上一拍摆的姿势在换拍时被 ClearPoses 清掉了，这一镜还是同一口气——
            // 谁也没起身，按原样再钉一遍
            const P = (id, pose, h) => {
              const a = FindActor(state, id);
              if (a) { a.pose = pose; if (h) a.heading = h; }
            };
            P("tianYe", "kneel", -1);
            P("liusao", "bow", 1);
            P("sister", "leanIn", 1);
          } },
        { stage: "柴房底下，那个黑黢黢的洞口，像一只睁开的眼睛。", d: 3.8,
          cam: { kind: "insert", x: 52.6, y: 0.62, dist: 2.3 } },
        { stage: "他头一回觉得，那底下不是个坟墓。", d: 3.2, cam: { kind: "dark" } },
        { stage: "是个起点。", d: 3.0, cam: { kind: "dark" } },
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
        // 头顶上有伪军在转：**同样四道手，但每一道都短**（haste）。这一口井的
        // 戏在"什么时候敢露头"，不在打水本身；照 c1 的分量摇，等于逼玩家在
        // 巡逻的眼皮底下站两分钟
        { type: "winch", zone: TV.wellTop, needs: "bucket2", needsLabel: "空桶", haste: true,
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
// 一档（`rank: n` → World 按 RankDz(n) 整体后移人/影子/枪）。透视会把后排那个
// 画小一圈、脚在画面上抬高一点——读出来就是肩并肩。原先六个兵一个个前后跟着，
// 那是行军纵队不是队列。
//
// 伪军这十个**故意不排整齐**：三三两两、间距不匀、几个溜到后排去。
// 队形松散是伪军，队形咬得死的是日军——两支队伍的分别不靠文字说，靠走法说。
//
// 参与潜行判定的仍只有 raid1/raid2——二十几个人一起判视线这段就没法玩了，
// 其余全部 decor：他们负责让「鬼子进村」这四个字在画面上是真的。
const RAID_SPEED = 2.1;       // 全队基准速度

// 一排站几个人（2026-08-09 用户退回："他们一般2-3人一排 而不是和现在这样
// 一人一排直接线性的移动"）。**一排里的人挤在半个身位内，排与排之间空一大截**——
// 十个兵等距排成一条直线，读出来就是一条长蛇，不是队伍。
// 日军：三排，每排三人，咬得死；伪军：三三两两几堆，堆内也是并排的。
const RAID_JP_ROWS = [3, 3, 3];
const ROW_STAGGER = 0.55;     // 同一排里，越靠后的人越往队尾错半个身位
const ROW_GAP = 2.5;          // 排与排之间（比排内的错位大四五倍才读得出"排"）
// 伪军十个：gap 小＝跟前一个挤在同一堆，rank 是他在这一堆里的第几排。
// 堆的大小刻意不匀（2/3/1/2/2），间距也不匀——松散是他们的人物设定
const PUPPET_FILE = [
  { gap: 3.0, rank: 0 }, { gap: 0.52, rank: 1 },
  { gap: 2.2, rank: 0 }, { gap: 0.58, rank: 1 }, { gap: 0.5, rank: 2 },
  { gap: 2.7, rank: 0 },
  { gap: 1.9, rank: 1 }, { gap: 0.5, rank: 0 },
  { gap: 2.3, rank: 0 }, { gap: 0.62, rank: 1 },
];
const RAID_PUPPETS = PUPPET_FILE.length;   // 打头的伪军
/** 队形的三个数（冒烟测试照这张表验，别在测试里另抄一份） */
export const RAID_FORMATION = { rows: RAID_JP_ROWS, stagger: ROW_STAGGER, rowGap: ROW_GAP };

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
  PUPPET_FILE.forEach((e, i) => {
    out.push({
      id: "c1pup" + i, gap: e.gap, rank: e.rank,
      // 松散：走走停停的微差。但**同一堆里的人不给微差**（gap 小的那些），
      // 否则并排的两个走上十几秒就被拉成一前一后，正是要改掉的毛病
      sp: e.gap > 1 ? RAID_SPEED + ((i % 3) - 1) * 0.05 : undefined,
    });
  });
  out.push({ id: "traitor", gap: 1.9 });         // 带路递名单的翻译官走在伪军队尾
  out.push({ id: "motoLead", gap: 2.0 });        // 挎斗摩托压着伪军的后脚跟
  // 军官不再徒步——他坐在挎斗里（太君坐斗、兵开车，见 SpawnRaidSoldiers），
  // 所以队序里没有他：斗里的人跟着 motoLead 的 gap 走
  // 日军：一排三个，三排。**一排里错开半个身位**——原来后排只错开 0.22m，
  // 在三十多米开外的车队机位上跟前排完全重合，十个兵看着就是一人一排的长蛇
  //（2026-08-09 用户退回的正是这个）。半个身位错开 + 后排画小一圈，
  // 三个人才读成"一排三个"；排与排之间空 2.5m，"排"的边界才立得住。
  // 队头那排离摩托 3.4m——军官下了徒步队列之后把他原先占的那一档补给车距
  RAID_JP_ROWS.forEach((n, r) => {
    for (let c = 0; c < n; c += 1) {
      out.push({
        id: `c1jp${r}x${c}`,
        gap: c === 0 ? (r === 0 ? 3.4 : ROW_GAP) : ROW_STAGGER,
        rank: c,
      });
    }
  });
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
    // 所以 SpawnRaidSoldiers 开头那道 IsEnemy 过滤扫不掉他，得点名清。
    // **进村时他坐在挎斗里**（2026-08-10 用户定：太君坐斗、兵开车——电视剧里
    // 那个经典构图，史实里军官下乡也确实这么代步）。交头接耳那一镜之后
    // 才下车徒步（c1_roster 里解 pinTo）
    MakeActor("officer", "officer", RaidStartX("motoLead") + 0.5, {
      label: "日军军官", decor: true, heading: -1, carry: "军刀",
      pose: "sitSide", lift: 0.22, pinTo: { id: "motoLead", dx: 0.5 },
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
    // 挎斗摩托：驾驶的兵。斗里坐的不再是普通兵——是上面那位军官
    MakeActor("motoLead", "soldier", RaidStartX("motoLead"), { label: "摩托驾驶", decor: true, mount: "motorcycle", pose: "rideMoto", lift: 0.32, heading: -1, carry: "" }),
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
  // 从队序表里取，不再另抄一份名单——两处各写一套，改了队形就会漏人
  return RAID_ORDER
    .filter((e) => e.id.startsWith("c1pup") || e.id.startsWith("c1jp"))
    .map((e) => e.id);
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
    knotCard: null,        // 接绳（见 case "knot"：铺满画框的活卡）
    stamina: null,         // 手劲读数（辘轳吊着桶时才有）
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
    wind: null,      // 一阵看得见的风：{t,dur,x,dir}，渲染层画尘土流线与草屑
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
      bucketAt: null, raidStarted: false, villageAlarm: false,
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
  // 收藏品：跨章持久（Main 从 localStorage 灌进来；无头测试里就是空集）
  state.relicsGot = state.relicsGot instanceof Set ? state.relicsGot : new Set();
  state.relicCard = null;
  state.knotCard = null;
  state.stamina = null;
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
  state.cellarPeek = 0;
  state.steadyCam = false;
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
    state.flags.marked = false;      // 旧版身高刻痕：新剧本第一章不再划它（c8 自己补）
    state.flags.wellRopeBroken = false;
    state.flags.ropeTaken = true;    // 老玩法的木料堆绳头永远不再露出来
    state.flags.bucketAt = null;
    state.flags.waterFilled = false;
    // 新剧本第一章的旗标（找吃的/正字/井台/埋衣）
    state.flags.jarDug = false;
    state.flags.tallied = false;
    state.flags.tallyAnswer = null;
    state.flags.wellRopeFixed = false;
    state.flags.elmDown = false;
    state.flags.vatFilled = false;
    state.flags.pitDug = false;
    state.flags.clothesBuried = false;
  }
  if (index <= 1) {
    // 一二章共用村庄：扫荡过后的常态（安静的街、没了的鸡）在这儿立旗；
    // 防兵洞的两面旗也在这儿归零——第二章才挖开它
    state.flags.villageAlarm = true;    // 扫荡后第三天：街上没有人（背景乡亲不出）
    state.flags.raidStarted = true;     // 邻家的芦花鸡也没了（跟着这面旗藏）
    state.flags.henFlew = true;         // 棚里食槽上的母鸡：扫荡那天就没了
    state.flags.tallyBase = true;       // 门框上已有的正字道道
    state.flags.digStarted = false;
    state.flags.tunnelDug = false;
  }
  if (index === 1) {
    state.flags.tallied = true;         // 第二章开场：正字已经添到十几道
    state.flags.tallyMany = true;
    state.flags.clothesBuried = true;   // 第一章夜里埋下的，永远埋在那儿
    state.flags.vatFilled = true;       // 第一章打满的那缸水——舀水支线舀的就是它
    state.flags.lidShut = false;
    state.flags.coughChoice = null;
  }
  if (index <= 4) { state.flags.quiltPlugged = false; state.flags.trapBuilt = false; }
  if (index === 4) { state.flags.dogFed2 = false; state.flags.bellBuilt = false; }

  if (ch.id === "c1") {
    // 扫荡后的第三天清晨：整章只有兄妹两个人。街上没有别人——
    // 安静本身就是伤（新剧本明令：村子很安静，阳光照常升起）。
    state.player.x = 33.2;
    state.actors.push(
      MakeActor("sister", "sister", 31.2, { label: "妹妹", heading: 1 }),
    );
  } else if (ch.id === "c2") {
    // 梳篦扫荡那天晌午。妹妹跟在身边；七叔、刘嫂、田大爷按场次亮相
    //（先建出来藏着——SettleBeat 结算跳幕要能找到人）
    state.player.x = 36.5;
    state.actors.push(
      MakeActor("sister", "sister", 35.6, { label: "妹妹", following: true }),
      MakeActor("qishu", "villager", 54, { label: "七叔", visible: false }),
      MakeActor("liusao", "family", 56.4, { label: "刘嫂", visible: false }),
      MakeActor("tianYe", "villager", 55.2, { label: "田大爷", visible: false, slow: true }),
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
  // 分支节拍：when 不成立的拍整个跳过——不进、不结算、不触发 onDone。
  // 第二章的抉择分支（舀水/忍着）走的就是这条：两支只演被选中的那一支。
  // DebugJump 的沿途结算也吃这条（它靠 AdvanceBeat→EnterBeat 前进）。
  if (def.when && !def.when(state)) {
    state.beatIndex += 1;
    if (state.beatIndex >= CurrentScript(state).length) EndChapter(state);
    else EnterBeat(state);
    return;
  }
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
  // 抉择落进哪面旗由节拍自己声明（flagKey）；不声明的沿用 route（第六章那条）。
  state.flags[def.flagKey || "route"] = key;
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
    if (w.tx === undefined) { w.tx = w.x1; if (w.haul) a.carry = null; }
    const d = w.tx - a.x;
    if (Math.abs(d) < 0.15) {
      w.dwell = (w.dwell ?? (1.4 + Math.random() * 1.8)) - dt;
      if (w.dwell <= 0) {
        w.tx = w.tx === w.x1 ? w.x0 : w.x1;
        w.dwell = undefined;
        // haul：这一趟是运东西的（挖土的把筐递出来，运土的端到窖口）。
        // 空手回去、装满出来——两头都端着筐的话，这人就是在遛筐
        if (w.haul) a.carry = w.tx === w.x0 ? w.haul : null;
      }
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
  // 过场里那扇门自己动：idleSway=还挂得好好的、在风里虚掩着悠；gust=一阵风把它
  // 推出去、下轴蹦出臼窝、磕在框上（与玩法同一套重力积分，不是另编一条曲线）；
  // swing=脱了窝之后的余晃；tryLift=爹一个人往上托、托不住又坠回去。
  // 玩法段的门由 holdDoor 每帧重写 doorLeaf，不走这儿。
  if (state.doorLeaf && (state.doorLeaf.swing || state.doorLeaf.tryLift || state.doorLeaf.gust || state.doorLeaf.idleSway)) {
    const d = state.doorLeaf;
    d.t = (d.t || 0) + dt;
    if (d.idleSway) {
      // 门轴还在窝里：只有风搡它的那一丝，悠着，不磕
      d.lean = 0.02 + Math.sin(d.t * 1.7) * 0.012;
    } else if (d.gust) {
      // 风给头一把劲（0.7 秒），之后重力接手——和玩法里撒手同一副身板
      d.v = d.v ?? 0;
      const wind = d.t < 0.7 ? 1.7 : 0;
      d.v += (wind + DOOR_G * (DOOR_BIAS + Math.sin(Math.max(0, d.lean)))) * dt;
      d.lean += d.v * dt;
      if (d.lean >= DOOR_SAG) {
        d.lean = DOOR_SAG;
        Cue(state, "tenon", { gain: Math.min(1, 0.5 + d.v * 0.55), rate: 0.9 });
        if (!d.bounces) state.vaultDust = { x: d.x + Math.sin(DOOR_SAG) * DOOR_H, t: 0 };
        d.bounces = (d.bounces || 0) + 1;
        d.v = -d.v * 0.2;
        if (d.bounces >= 2) { d.gust = false; d.swing = true; d.t = 0; }
      }
    } else if (d.swing) {
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
  // 后果小窗到时收起；onEnd 给"看完这一眼之后"的收尾用（娘接着锄地）。
  // **t 为 null = 不自动收**：那种小窗由玩法自己每帧立、每帧撤（打水时那扇
  // 「井底」就是——它不是看一眼的后果，是这一拍一直得看着的东西）
  if (state.pip && state.pip.t != null && (state.pip.t -= dt) <= 0) {
    const done = state.pip;
    state.pip = null;
    done.onEnd?.(state);
  }
  // 小活物的一次性动画：麻雀炸窝、母鸡扑棱、田鼠蹿走——各自跑完就清
  for (const key of ["sparrowBurst", "henFlee", "mouseFlee", "vaultDust", "elmRain"]) {
    const fx = state[key];
    if (fx && (fx.t += dt) > 2.2) state[key] = null;
  }
  // 一阵看得见的风（开场吹倒门那一镜等）：时长自带，吹完就散。
  // 摆在这一段是有讲究的——它要在**过场里**也走表（下面 cinematic 分支会早退）
  if (state.wind && (state.wind.t += dt) > state.wind.dur) state.wind = null;

  if (state.phase === "chapterCard" || state.phase === "chapterEnd") {
    state.cardTimer += dt;
    if (input.advance && state.cardTimer > 0.8) ConfirmChapterCard(state);
    return;
  }

  const def = CurrentBeatDef(state);
  if (!def) return;
  state.beat.t += dt;
  state.prompt = null;

  // 征夫告示的阅读层开着：世界冻结（独轮车的装载、朝向、位置分毫不动），
  // 只听关闭——E / 点按 / 阅读层上的关闭钮（Main 直接清这个旗标）。
  // 可反复看，不计收集、无奖励、无获得音效（关卡设计文档明令）
  if (state.noticeOpen) {
    state.prompt = null;
    state.caption = null;
    if (input.interact || input.tap) state.noticeOpen = false;
    return;
  }
  // 包袱开着同样冻结世界（Main 开合并清这个旗标；E/点按也能合上）
  if (state.bagOpen) {
    state.prompt = null;
    if (input.interact || input.tap) state.bagOpen = false;
    return;
  }

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
  state.knotCard = null;  // 同 winchView：接绳那张活卡由 beat 每帧重立
  state.stamina = null;   // 手劲读数同理：吊着桶的那一帧自己立
  state.closeUp = null;   // 玩法特写（辘轳/打结）同理：活着的那一帧自己立
  state.canDrop = false;

  // 节拍声明的引导气泡（图形气泡=「我缺什么」，无文字引导三层配方之一）
  def.bubbles?.(state);
  // 节拍的每帧回调（走位到点接活计这类小状态机）
  def.tick?.(state, dt);

  // 链外的通用投掷：手里有能扔的就能扔（软性窗口靠它——石子落地出声引开人）。
  // 链内的投掷仍由 StepChain 自己管（要判命中）。
  // 这里同样只有拽弓一条路：F 键在潜行段能扔、在榆钱那步不能扔，是最坏的一种
  // 不一致——玩家学会的东西过一场就失效。要删就整个游戏一起删
  if (def.kind !== "chain") {
    StepThrown(state, dt);
    if (state.player.item?.throwable && !state.thrown) {
      const aiming = StepSlingAim(state, input, null);   // 拽着瞄：落点自己定
      if (!aiming) ReadyToSling(state);
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
  // 收藏品（老物件）：勇敢的心式的隐藏历史小物（scene.relics，数据在 Data_Scenes）。
  // 前身是院墙角那枚孤零零的顶针（用户 2026-08-10 退回：「铜顶针是什么鬼」）——
  // 现在每件都是查过史料的实物，收进包袱给一段注解；顶针并进了「军鞋底」那件。
  // 不抢任务提示（!state.prompt）、潜行中不出；收走就从场上消失（World 切 visible）。
  {
    const relics = SCENES[CHAPTERS[state.chapterIndex].scene].relics;
    if (relics && !state.prompt && !state.microCine && !state.stealthActive) {
      for (const r of relics) {
        if (state.relicsGot.has(r.id)) continue;
        if ((r.level || "surface") !== state.player.level) continue;
        if (Math.abs(state.player.x - r.x) > 1.1) continue;
        state.prompt = "E · 收进包袱";
        if (input.interact) {
          state.relicsGot.add(r.id);
          // 包袱条（Main）看这张卡：滑入、亮格、存档
          state.relicCard = { id: r.id, name: r.name, note: r.note, seq: (state.relicSeq = (state.relicSeq || 0) + 1) };
          Cue(state, "pickup");
          state.toast = { text: `收进包袱——${r.name}`, t: 3.5 };
        }
        break;
      }
    }
  }
  // 征夫告示（noticeWall）：一臂之内出「查看」，按 E 进左图右文的阅读层。
  // 不抢镜、不自动弹窗、路过可以不停；推着车也能看——阅读层开着时世界是冻的
  // （StepGame 顶部直接 return），关上后车的装载朝向位置原样。
  // 与 lookables 的区别：可反复看（不记 lookSeen），打开的是阅读层不是一句手记
  {
    const ch = CHAPTERS[state.chapterIndex];
    const wallN = SCENES[ch.scene]?.props?.find((pr) => pr.id === "noticeWall");
    const daylight = !["night", "dark", "tunnel"].includes(ch.light || "day");
    if (wallN && daylight && !state.stealthActive && !state.prompt && !state.microCine
      && state.player.level === "surface" && Math.abs(state.player.x - wallN.x) <= 1.2) {
      state.prompt = "E · 查看告示";
      if (input.interact) state.noticeOpen = true;
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
      state.cellarPeek = 0;
      state.steadyCam = true;   // 被按住不许动的时候，镜头也别自己晃
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
    const travel = p.travelDur || Math.max(0.1, p.climbDur - LID_OPEN - LID_SHUT);
    const gone2 = p.climbDur - p.climbT;                       // 已经走了多久 0 → climbDur
    // 三段：掀盖（人还在口上）→ 爬（lift 走完全程）→ 盖回（人已到位，伸手拉回来）
    let travelK;                                               // 0 → 1
    let lidOpen;                                               // 0 → 1 → 0
    if (gone2 < LID_OPEN) {
      travelK = 0;
      lidOpen = gone2 / LID_OPEN;
    } else if (gone2 < LID_OPEN + travel) {
      travelK = (gone2 - LID_OPEN) / travel;
      lidOpen = 1;
    } else {
      travelK = 1;
      lidOpen = Math.max(0, 1 - (gone2 - LID_OPEN - travel) / LID_SHUT);
      // 板子落回洞口那一下闷响（只发一次）
      if (!p.lidShut && lidOpen <= 0.02) { p.lidShut = true; Cue(state, "drop", { gain: 0.55 }); }
    }
    const e = 1 - travelK * travelK * (3 - 2 * travelK);        // 1 → 0，起步收势各缓一点
    p.lift = (p.climbFrom - destY) * e;
    if (state.lid) state.lid.open = lidOpen;
    // 一档一档地响：按真正挪过的距离发，不是定时循环——快慢都对得上
    const gone = Math.abs(p.climbFrom - destY) * (1 - e);
    const rung = Math.floor(gone / LADDER_RUNG);
    if (rung !== p.rung) { p.rung = rung; Cue(state, "ladder", { gain: 0.42 }); }
    if (p.climbT <= 0) { p.lift = 0; p.climbDur = 0; p.lidShut = false; state.lid = null; }
    p.moving = false;
    state.climbHint = "";
    state.vaultHint = "";
    state.cellarPeek = 0;    // 爬梯自己带镜头（BaseShot 读 lift），别再叠探头
    state.steadyCam = false;
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
  const pushingCart = PushingCart(state);
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
  //
  // 顺带算一个 0..1 的**探头量**（cellarPeek）：人在地表越靠近井口，镜头就
  // 越往下沉一档，把脚底下那个窖的剖面带进画框（Main 的 BaseShot 用它）。
  // **默认整个停用**——见文件顶部的 CAM_CELLAR_PEEK（2026-08-10 用户定：
  // 不要自动摇镜头）。下面这段留着，把开关拨回 true 就能整套回来。
  state.climbHint = "";
  let peek = 0;
  for (const shaft of scene.shafts) {
    if (shaft.builtFlag && !state.flags[shaft.builtFlag]) continue;
    const d = Math.abs(p.x - shaft.x);
    if (d <= 1.4) {
      if (p.level === "under" && scene.walk.surface) state.climbHint = "W · 上梯子";
      else if (p.level === "surface" && scene.walk.under) state.climbHint = "S · 下地道";
    }
    // 探头的范围比提示宽一截（4.2m）：镜头得**先**沉下去，玩家才是"走过来
    // 看见脚底下有东西"，而不是"站定了画面才动"
    if (CAM_CELLAR_PEEK && p.level === "surface" && scene.walk.under) {
      const k = 1 - Math.min(1, Math.max(0, (d - 1.0) / 3.2));
      peek = Math.max(peek, k * k * (3 - 2 * k));   // 缓入缓出，别一步跳下去
    }
  }
  // —— 镜头自作主张的总开关 ——
  // `state.steadyCam` 为真的那一帧，镜头**只跟人走**，任何自动的升降/探头一律
  // 让位。以后再加"镜头自己动"的花样（探头、抬头看炮楼、震镜），都挂到这一个
  // 判据上，别各写各的——不然每加一样就要把所有玩法重新试一遍。
  // 三个来源：
  //   ① **推着车**：车是横着走的一条线，镜头一沉，车头和前面的路一起出画
  //      （用户 2026-08-10：「推车推到地道口镜头会自动下摇，应该屏蔽」）；
  //   ② 被盯上：往下扎会把摸过来的那盏灯挤出画框（潜行规范第 2 条）；
  //   ③ 节拍自己声明 `steadyCam: true`——要钉住构图的新玩法用这一个开关。
  const camDef = CurrentBeatDef(state);
  state.steadyCam = PushingCart(state)
    || (state.detection?.level || 0) > 0.15
    || !!(camDef?.steadyCam || state.beat?.steadyCam);
  // 爬梯那一段自己会带着镜头走（BaseShot 读 lift），也别再叠一层
  state.cellarPeek = (p.climbT > 0 || state.steadyCam) ? 0 : peek;

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
        p.x = shaft.x; StartClimb(state, "surface", CLIMB_UP, shaft.id);
      } else if (input.climb > 0 && p.level === "surface" && scene.walk.under) {
        p.x = shaft.x; StartClimb(state, "under", CLIMB_DOWN, shaft.id);
      }
      break;
    }
  }

  // 行走范围（没挖通的地道段挡路 / 塌方未清开时挡路）
  const range = p.level === "under" ? UnderWalkRange(scene, state.flags, p.x) : scene.walk[p.level];
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
    // 保持类的 hold 也得有人样：捂嘴那拍按住就该搂着（holdPose 由节拍声明）——
    // 人杵着不动、字幕替他捂，正是姿势规范点名要治的病
    if (g > 0 && def.holdPose) FlashPose(state, def.holdPose, 0.35);
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
    style: def.cardStyle || null,          // 卡面变奏（正字那拍：无人影、带已画的道道）
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
        // reach = 判定区半宽：驱动器得走进区里才按得响（写死的容差会卡在窄区外边）
        case "use": return { action: st.hold ? "holdAt" : "interactAt", x: st.zone.x,
          level: st.zone.level || "surface", reach: st.zone.w / 2 };
        // 扶门是"费力气"的活，留了按住 E 的后备（CLAUDE.md 第 5 条），驱动器走它
        case "holdDoor": return { action: "holdAt", x: st.zone.x, level: st.zone.level || "surface" };
        // 接绳没有长按后备（用户明令删掉），驱动器只能**真的在卡上把结挽出来**——
        // 所以把卡的版面整个交出去：五个关口的落点 + 勒紧的方向。自动通关照着
        // 走一遍单编结（塞进弯口 → 钻出来 → 绕背后 → 兜底下 → 掖自己底下 → 勒死）。
        // 删后备就必须同时给驱动器一条真输入的路，漏了这一步会当场卡死。
        case "knot": {
          const L = KNOT_CARD;
          return {
            action: "knotAt", x: st.zone.x, level: st.zone.level || "surface",
            card: true, aspect: L.aspect,
            start: { ...L.start },                                  // 没上手时按这儿
            gates: L.gates.map((g) => ({ x: g.x, y: g.y })),        // 按顺序过的五道关口
            pull: KnotCinchDir(),                                   // 勒紧：往这个方向一把拽到底
            reachStep: Math.min(L.slipR, L.grabR + 0.02),           // 一帧最多把手挪这么远（免得脱手）
          };
        }
        case "throwHit": {
          if (!p.item) return { action: "interactAt", x: st.pickupX, level: "surface" };
          // 投石的按键后备已按明令删掉，驱动器只能**真的把石子拽开再松手**：
          // 按住手里那颗石子 → 把手拖到 SlingSolve 反推出来的那个点 → 松手。
          // 拽多远由驱动器拿玩家当帧的位置现算（站位有几厘米偏差都会带偏弧线），
          // 所以这里只交出站位、朝向和靶心。删后备就得给驱动器一条真输入的路，
          // 漏了这一步自动通关会当场卡死——和接绳那一步同一个道理。
          const side = st.pickupX >= st.target.x ? 1 : -1;
          // 4.6m：最省劲的那条弧只要拽七成多，离拽满还留着余量
          return {
            action: "slingAt", x: st.target.x + side * 4.6, level: "surface", face: -side,
            aim: { x: st.target.x, y: st.target.y ?? 1.6 },
          };
        }
        case "talk": {
          const a = FindActor(state, st.actor);
          return a ? { action: "interactAt", x: a.x, level: a.level || "surface" } : null;
        }
        case "push": return { action: "pushAt", x: state.cart ? state.cart.x : st.from, dir: st.dir };
        case "goto": return { action: "walk", x: st.zone.x, level: st.zone.level || "surface" };
        case "brace": {
          // 支顶木改成了往上顶的笔画做功（顶木＝费力气的活，按住 E 是合法后备，
          // CLAUDE.md 第 5 条），所以驱动器从"按一下"改成"按住"——
          // 忘了改这一处，自动通关会站在支撑位前面按一辈子 E
          const z = (st.zones || []).find((zz) => zz.ok && !state.flags[zz.flag]);
          return z ? { action: "holdAt", x: z.x, level: st.level || "under" } : null;
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

// ---------------------------------------------------------------------------
// 边缘 HUD 的牌面：「接下来这一步要干的那件事」
//
// 勇敢的心的画框边提示不是一个方向键，是一枚带图的牌：方向由箭头说，**要去
// 干嘛由图说**，两件事各说各的一句。所以每一种活儿、每一个要找的人都得长得
// 不一样——找人画那个人（衣色＋侧脸，本作认人本来就靠这两样），捡东西画那件
// 东西的小样，上手的活画手势。
//
// 推导跟着 GetBeatTarget 那张表走：目标是谁/是什么，这一步就画谁/画什么。
// 剧本可以在节拍或链上的某一步写 `hintIcon` 覆盖——剧本比推导更清楚玩家这会儿
// 在干嘛（写字符串就是只给种类，写对象可以连 who/item 一起给）。
//
// 种类（渲染层 Art.DrawEdgeHud 逐个有画法，别在这儿新造词而不去画）：
//   person 找人/带人 | item 捡东西/送东西 | hand 上手使劲 | listen 贴着听
//   crouch 蹲着看 | walk 走过去 | dig 挖 | timber 撑木 | door 扶门 | knot 打结
//   winch 摇辘轳 | cart 推车 | throw 投石 | map 钉图 | scribe 划线 | lamp 灯
// ---------------------------------------------------------------------------
const HINT_ICON_KINDS = new Set([
  "person", "item", "hand", "listen", "crouch", "walk", "dig", "timber",
  "door", "knot", "winch", "cart", "throw", "map", "scribe", "lamp",
]);

function NormHintIcon(v) {
  const icon = typeof v === "string" ? { kind: v } : v;
  return icon && HINT_ICON_KINDS.has(icon.kind) ? icon : null;
}

// 链上某件东西的名字：`needs` 给的是 id，牌面要画的是那件东西本身
function ChainItemLabel(def, itemId) {
  for (const st of def.steps || []) if (st.item?.id === itemId) return st.item.label;
  return null;
}

export function BeatHintIcon(state) {
  const def = CurrentBeatDef(state);
  if (!def) return null;
  const p = state.player;
  const Person = (id) => {
    const a = FindActor(state, id);
    return a ? { kind: "person", who: a.kind || "villager", id } : { kind: "walk" };
  };
  const Item = (label) => (label ? { kind: "item", item: label } : { kind: "hand" });
  const Held = () => Item(p.item?.label || p.carry);
  // 使劲的手：往哪儿使由笔画方向说（铲土往下、顶撑木往上）
  const Hand = (stroke) => ({ kind: "hand", gesture: stroke === "up" || stroke === "down" ? stroke : null });
  if (def.hintIcon) return NormHintIcon(def.hintIcon);
  switch (def.kind) {
    case "goto": case "gotoSeq": case "linger": case "coverRun": case "cartRide":
      return { kind: "walk" };
    case "collect": {
      if (p.carry || p.item) return Held();
      const it = state.beat.itemStates?.find((x) => !x.carried && !x.delivered);
      return Item(it?.label);
    }
    case "escort": {
      const f = FindActor(state, def.follower);
      // 还没招呼上：画她本人（"去找妹妹"）；已经跟上了：画路（"带她过去"）
      return f && !f.following && f.visible ? Person(def.follower) : { kind: "walk" };
    }
    case "leadFollow": return Person(def.leader);
    case "lead": {
      const loose = state.actors.find((a) => a.group === def.group && a.visible && !a.following);
      return loose ? Person(loose.id) : { kind: "walk" };
    }
    case "observe": return { kind: "crouch" };
    // 听是"憋住别动"那一类，跟使劲的手不是一回事
    case "hold": return def.sustain ? { kind: "listen" } : Hand(def.stroke);
    case "doomedHold": return Hand(null);
    case "mapBoard": return { kind: "map" };
    case "scribe": return { kind: "scribe" };
    case "plane": return Item("刨子");
    case "douseLamps": {
      // 最后一盏在顺子手里：那一步是去找人，不是去吹灯
      const lit = (state.lamps || []).filter((l) => l.lit);
      return lit.length <= 1 ? Person("shunzi") : { kind: "lamp" };
    }
    case "actSeq": {
      const st = def.steps[state.beat.stepIndex || 0];
      if (!st) return null;
      if (st.hintIcon) return NormHintIcon(st.hintIcon);
      return st.walk ? { kind: "walk" } : Hand(st.stroke);
    }
    case "buildSpots": {
      const i = state.beat.spotDone.findIndex((d) => !d);
      if (i < 0) return null;
      const spot = def.spots[i];
      if (spot.pickup && !state.beat.pickedUp?.[i]) return Item(spot.pickup.label || spot.pickup);
      return Hand(def.stroke);
    }
    case "digSeq": {
      const key = ["collapse1", "collapse2"][state.beat.digIndex];
      if (!key) return null;
      if (def.shore && !state.collapses[key].shored) {
        // 撑木还没扛来就先画那根木头（去取它），扛在肩上了就画"顶上去"
        return p.item?.id === "beam" ? { kind: "timber" } : Item("撑木");
      }
      return { kind: "dig" };
    }
    case "chain": {
      const st = def.steps[state.beat.stepIndex || 0];
      if (!st) return null;
      if (st.hintIcon) return NormHintIcon(st.hintIcon);
      switch (st.type) {
        case "pickup": case "pickupGround": return Item(st.item?.label);
        case "drop": return Held();
        case "use": return st.needs
          ? Item(p.item?.id === st.needs ? p.item.label : ChainItemLabel(def, st.needs))
          : Hand(st.stroke);
        case "holdDoor": return { kind: "door" };
        case "knot": return { kind: "knot" };
        case "winch": return { kind: "winch" };
        case "brace": return { kind: "timber" };
        case "push": return { kind: "cart" };
        case "goto": return { kind: "walk" };
        case "talk": return Person(st.actor);
        // 手里没石子先去捡（画石子本身），攥上了再画"投"
        case "throwHit": return p.item ? { kind: "throw" } : Item("石子");
        default: return { kind: "walk" };
      }
    }
    // 救人的那几拍：还有人没招呼到就画那个人，都跟上了就画路。
    // 挑人的条件必须跟 GetBeatTarget 一模一样，否则牌上是甲、路却通往乙
    case "floodRescue": {
      const loose = state.actors.find((a) => a.kind === "villager" && a.visible && !a.evacuated && !a.following);
      return loose ? Person(loose.id) : { kind: "walk" };
    }
    case "smokeEscape": {
      const loose = state.actors.find((a) => a.kind === "villager" && a.visible && !a.evacuated
        && !a.scripted && !(def.lossScript && a.id === "shunzi") && !a.following);
      return loose ? Person(loose.id) : { kind: "walk" };
    }
    case "rescueLoop": {
      if (state.actors.some((a) => a.pocket && a.visible && !a.evacuated && a.following)) return { kind: "walk" };
      const loose = state.actors.find((a) => a.pocket && a.visible && !a.evacuated && !a.following);
      return loose ? Person(loose.id) : { kind: "walk" };
    }
    default: return { kind: "walk" };
  }
}

// 画框边缘的指路标（勇敢的心式）：目标出了画框、又离玩家真的远时，路标
// 不该跟着目标一起消失在框外——它滑到画框边缘，变成一枚**带图的牌**：箭头
// 指出框外，牌面画着接下来要干的那件事（见 BeatHintIcon）。
// 目标在另一层的，先指向能用的爬梯口（横轴上路总要先经过它），
// 并带上「下去/上来」的竖向记号；已经站在梯口的不指（上下怎么走交给爬梯提示）。
// 纯函数：镜头在哪、画多宽由渲染层喂进来，这里只管"该不该指、指哪边、画什么"。
export function EdgeHint(state, camX, viewW) {
  if (state.phase !== "playing" || state.microCine) return null;
  // 特写/活卡里没有"远方"：手上的活正做到一半，别拿路标打岔
  if (state.closeUp || state.scribeCard || state.planeCard || state.knotCard) return null;
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
  // 牌面推不出来的时候退回一枚"走过去"——宁可少说一句，不许空着一张牌
  return { side: tx < camX ? -1 : 1, climb, icon: BeatHintIcon(state) || { kind: "walk" } };
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
    case "choice": {
      // 跳幕结算取第一个选项当默认——所以每个 choice 的 options[0]
      // 都该是"跳过去也走得通"的那一支（第二章把「舀水」排在头一个）
      const flagKey = def.flagKey || "route";
      state.flags[flagKey] = def.options?.[0]?.key || (flagKey === "route" ? "tunnel" : null);
      state.beat.choiceMade = state.flags[flagKey];
      break;
    }
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
  // 跳幕目标是一条 when 分支时，抢在进拍前把它逼活（debugForce）——
  // 否则 EnterBeat 会按当前旗标把目标拍整拍跳过，落点漂到下一拍
  //（第二章舀水/忍着两支就是这么用的：跳「忍着」得先把抉择改成忍着）
  if (state.beatIndex === target) script[target]?.debugForce?.(state);
  while (state.beatIndex < target && guard < 400) {
    guard += 1;
    const def = CurrentBeatDef(state);
    if (!def) break;
    SettleBeat(state, def);
    if (state.beatIndex + 1 === target) script[target]?.debugForce?.(state);
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
  state.knotCard = null;
  state.closeUp = null;
  state.canDrop = false;
  state.bubbleFlash = null;
  state.spotFlash = null;
  state.pip = null;
  state.detection = { level: 0, spotter: null };
  // 结算过程里可能留下没走完的走位指令，别让它们接管玩家刚接手的这一幕。
  // **姿势不在此列**：沿途每次 AdvanceBeat 自带 ClearPoses，结算残留早被清过；
  // 走到这儿还挂着的姿势全是**落地这一拍自己的 onEnter/onStart 摆的**（捂嘴那拍
  // 的 kneel/leanIn 就是），再洗一遍等于把真人进拍能看到的排布洗掉——
  // 截图与实战从此对不上（2026-08-11 实拍排查出来的）
  for (const a of state.actors) { a.cineTarget = null; a.cineSpeed = undefined; }
  state.player.cineWalk = null;
  return CurrentBeatDef(state)?.id || null;
}

/** 全部收藏品（按场景数据的顺序展平，带 scene 字段）——包袱条按它排格子 */
export function AllRelics() {
  const out = [];
  for (const [key, sc] of Object.entries(SCENES)) {
    for (const r of sc.relics || []) out.push({ ...r, scene: key });
  }
  return out;
}
