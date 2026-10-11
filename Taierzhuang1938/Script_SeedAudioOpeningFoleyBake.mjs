// 第一关 01–02 开场重构（2026-10-11）的八条拟音：火山引擎 SeedAudio 1.0 的 take → 可部署的一次性音。
// 契约：docs/Data_OpeningRedraft20261011Contract.md §6（cue 名冻结）。另外四条（whistleShort / clothRip /
// boltRattle / bayonetFixClick）在 Sonniss 镜像里找得到实录，由 Script_SfxBake 按 Data_SfxSources 切。
//
//   node Taierzhuang1938/Script_SeedAudioOpeningFoleyBake.mjs                 # 用已选定的 take 重烘（不调接口）
//   node Taierzhuang1938/Script_SeedAudioOpeningFoleyBake.mjs --generate      # 只补缺的候选 take（--jobs=2 并发）
//   node Taierzhuang1938/Script_SeedAudioOpeningFoleyBake.mjs --report        # 量全部候选 take（时长 / 峰值 / 有声段电平）
//   node Taierzhuang1938/Script_SeedAudioOpeningFoleyBake.mjs --only=cheekCut # 只烘一条 cue
//   node Taierzhuang1938/Script_SeedAudioOpeningFoleyBake.mjs --force         # 重新生成全部候选（会换掉已选定的音！）
//
// 密钥只从 VOLCENGINE_API_KEY 读，不打印、不落盘。候选 take 与提示词旁注落 Audio/Sfx/_raw/SeedAudioOpeningFoley/
//（.gitignore 挡着，不进仓库）；只有成品 mp3 与清单条目进仓库。
//
// ## 为什么这八条走生成，不走 Sonniss
// 2015—2026 九届 GDC 包 + Game Audio Monthly（约 7900 条 mp3）按名字检索、下载候选量过：
//   · 刺刀扎尸 / 拧刀 / 刀尖划脸：有的只是 Gorification、Soundopolis 那几条「西式利刃 + 血浆」设计音，
//     起音尖、>2 kHz 占 39—67 %，不闷不湿；白刃三音（bayonetHit）2026-08-26 就是因为「兵器不对、
//     借来的音站不住」把这一类 Sonniss 素材下架的（Data_SfxSources 白刃那一节）。同一条理由。
//   · 踩背 / 碾手 / 枪扔回泥里 / 枪栓落进土里：镜像里**泥地**拟音几乎没有（RYK 的泥地脚步、Bluezone 的
//     兽人泥脚步都是设计过的、>2 kHz 一半以上；斧头落地那条是硬地面、2—8 kHz 占 80 % 的金属响）。
//   · 手榴弹磕钢盔：没有钢盔素材；最接近的「锉刀敲轮胎撬棍」谱心 3.7 kHz、一串长振铃，是敲铁件不是磕盔。
// 生成音照白刃 / 断肢两轮的经验写提示词：**描述拟音师真会做的事**（扎带皮生猪肉、踩湿沙袋），
// 说人体部位时模型会往惨叫血浆上塌；再补三句硬约束：点名频段、给时长、给包络。
//
// ## 电平
// 与 Script_SfxBake 的 `alignDbfs: -25` 同一口径：有声段 RMS（20 ms 帧、门限取最响帧的 10 %）对齐 −25 dBFS，
// 采样峰值 ≤ −3 dBFS（给 mp3 编码对瞬态的过冲留余量）。扎刀那几条因此与 bayonetHit（−25.5）同档，
// 机械 / 金属那几条与 grenadePin（−25.4）同档。相对响度（划脸要轻、枪栓落地要远）交给 Script_Audio 的
// SAMPLE_MIX，不在烘焙里压 —— 一条素材一个口径，混音只在一张表里改。
// 一律 highpass 38 Hz：听不见的次低频会把归一化电平整个偷走（memory: audio-level-measure-peak-not-rms）。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SFX_LICENSES } from "./Data_SfxSources.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(here, "Audio/Sfx");
const rawDir = path.join(outputDir, "_raw/SeedAudioOpeningFoley");
const manifestPath = path.join(outputDir, "Data_SfxManifest.json");
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const model = "seed-audio-1.0";
const args = process.argv.slice(2);
const Flag = (name) => args.includes(`--${name}`);
const Opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const SR = 44100;
const TARGET_ACTIVE_DBFS = -25;
const PEAK_CEIL_DBFS = -3;
const BITRATE = "72k";
const DATE = "2026-10-11";

const COMMON = "用于写实二战第一人称战争游戏的一条独立拟音音效，单声道近距离干录，前后是安静的。"
  + "无音乐，无人声，无惨叫，无旁白，无战场背景声，无回声或混响尾巴。只有一次动作，不重复。";

/**
 * 每条 cue 的候选提示词（一条提示词一个 take）。顺序就是 take 编号，**只许往后加**：
 * 已选定的 take 文件名带着编号，插在中间会让 PICKS 指错人。
 */
const CUES = {
  grenadeKnock: {
    label: "九一式引信帽磕钢盔",
    credit: "日兵把九一式手榴弹的引信帽往钢盔上一磕（一记短促金属「当」）",
    prompts: [
      "一个拳头大小的铸铁小圆筒，用它顶端的黄铜帽在一顶旧钢盔的盔顶上用力磕一下：短促的一记金属「当」，钢盔薄钢壳带一点点「嗡」的共鸣，0.3 秒内收住。中高频为主，干脆，不要低沉轰响，不要连敲。",
      "拟音：一个厚壁小铁罐的硬边在一顶倒扣着的钢盔顶上狠狠磕一下，「当」的一声短促金属撞击，钢壳轻轻一颤就停，约 0.3 秒。中频和高频为主，不要叮叮当当连响，不要低频轰鸣。",
      "一截粗铁管的端头在一顶二战钢盔的盔顶敲一下：一记沉实而清脆的金属磕击「铛」，带很短的钢壳余振，整体不到半秒。只有一下，不要铃声那样长的振铃，不要低频。",
      "金属手雷的铜质引信帽磕在钢头盔上发出的一声短促「当」：硬金属对薄钢板，脆而结实，有一点点空腔共鸣，0.2 到 0.4 秒内消失。只有这一下撞击。",
    ],
  },
  bayonetStabBody: {
    label: "刺刀扎进躯体",
    credit: "刺刀扎进躯体（闷、湿；三变体）",
    prompts: [
      "一把细长的刺刀全力扎进一个趴在泥地上不动的人的后背：先是戳破厚棉布军装的一下，紧接着湿闷的入肉声，刀扎进去就停住。声音闷、湿、沉，不清脆，没有金属碰撞，没有骨头断裂的大声脆响。整体约 0.5 秒。",
      "拟音：一把窄长的钢刺刀猛地捅进一大块裹着厚棉布的带皮湿生猪肉里，噗的一声闷而湿的刺入，布被戳破的短促一下紧贴着肉被挤开的黏响，捅到底就停。约 0.5 秒，中低频为主，不要金属声，不要骨裂。",
      "刺刀刺进躯体再拔出来：一记沉闷湿润的刺入「噗」，紧跟一下短促的湿黏拔出声，整个动作干脆，约 0.7 秒。闷，不尖，不要金属碰撞，不要骨头脆响，不要滴血流水声。",
      "拟音师把一根削尖的硬木棍全力扎进一大块湿透的生牛肉里：闷、湿、有分量的一记刺入，肉被撑开的黏腻声，扎进去就停。约 0.4 秒。中低频为主，不要高频嘶声，不要金属声。",
      "一把长刺刀从上往下扎进一个倒在泥里的人的身体：隔着厚军装，闷闷的一记湿响，带一点布被戳穿的撕裂，力道很重，刀停在里面。约 0.5 秒。不要清脆，不要骨裂，不要金属。",
      "刺刀捅进湿沙袋一样沉的身体里：「噗嗤」一声闷湿的刺入，前头一丝布料戳破的嘶，后面是肉被挤开的湿黏，约 0.5 秒，然后安静。不要金属碰撞声，不要尖锐高频。",
    ],
  },
  bayonetTwist: {
    label: "拧刀",
    credit: "刺刀在躯体里拧转（短而湿）",
    prompts: [
      "刺刀扎在一大块湿生肉里，握着刀柄用力拧转半圈：短促的湿黏挤压声，夹一点肉被搅动的「咕叽」，约 0.4 秒。没有金属碰撞，没有刺入的冲击声，不要尖锐高频。",
      "拟音：一把插在带皮生猪肉里的窄刃刀被用力扭了一下：湿润的、黏腻的一声短促绞动「咕吱」，肉和皮被拧紧又松开，约 0.3 秒。闷，湿，中低频，不要金属声。",
      "刀子在一块湿透的生肉里转动一下的声音：低沉湿滑的挤压与吸吮声，很短，约 0.4 秒，一下就停。不要刺入、不要拔出、不要金属撞击、不要骨头声。",
      "拟音师把一根木棍插进一大团湿面团和生肉里使劲拧一圈：湿黏的「咕叽」绞动声，短而闷，约 0.4 秒。只有拧的这一下。",
    ],
  },
  stompMud: {
    label: "军靴踩背 / 踩进泥里",
    credit: "军靴一脚踩在泥里的人背上（沉闷带湿泥）",
    prompts: [
      "一只穿厚皮军靴的脚从上往下用力一脚踩在泥地里的一个湿麻袋上（麻袋里装着湿沙）：沉闷厚重的一记「噗」，带湿泥被挤开的黏响，没有弹跳，没有清脆声。约 0.4 秒。",
      "拟音：穿钉底皮靴的脚狠狠踩在一块趴在烂泥里的厚棉被上，闷重的一脚，棉被下面的泥水被挤出来的湿响，约 0.4 秒，一下就停。中低频为主，不要脚步串，不要高频。",
      "一个士兵抬脚重重踩下去，皮靴踏进湿软的泥地，「噗嗤」一声厚实闷响，泥被压得往外冒，约 0.35 秒。只有这一脚，不要第二步，不要硬地面的响声。",
      "皮靴猛踩在泥里一个软而有分量的东西上：一记沉、钝、湿的踩踏，带一点布料被压紧的闷声和泥浆的咕叽，约 0.4 秒，不要回声，不要清脆。",
    ],
  },
  boltToss: {
    label: "枪栓甩出落进沟外土里",
    credit: "步枪枪栓被甩出去，落在几米外的松土里（远、轻）",
    prompts: [
      "一根拇指粗、一拃长的铁制枪栓被扔出去，落在几米外松软潮湿的泥土上：很轻的一记闷「噗嗒」，夹一点点金属轻磕，远远的、轻轻的。约 0.3 秒。不要弹跳很多下。",
      "拟音：一小截沉甸甸的铁件从空中落进五六米外的湿土堆里，一声很轻、很闷的「扑」，带一点点金属的「嗒」，听起来离得有点远。约 0.3 秒，只有一下。",
      "一个小铁零件掉进远处软泥里的声音：轻、短、闷，「噗」的一下陷进泥里，几乎不弹，有极轻的金属感，约 0.25 秒。不要硬地面的清脆叮当声。",
      "把一个金属枪机零件扔到沟外的泥土上：一记轻微的落地闷响，带一点土粒溅开的沙沙，金属只轻轻一磕，整体很轻、偏远，约 0.3 秒。",
    ],
  },
  rifleTossMud: {
    label: "步枪扔回泥里",
    credit: "老式木托步枪被扔在泥里（木与金属一声）",
    prompts: [
      "一支老式木托步枪（木头枪托加铁枪管，约四公斤）被人随手扔在一米外的泥地里：木头与铁件同时砸进湿泥，一记闷重的「噗通」，夹着铁件磕碰的一下短促金属声和泥水溅开的黏响。约 0.5 秒，不弹跳。",
      "拟音：把一根一米多长、一头木头一头铁管的沉重长杆横着扔进烂泥里，「啪噗」一声，木头拍进湿泥的闷响加上铁管轻轻一磕的金属声，约 0.5 秒，落下就不动。",
      "一支步枪被扔到泥泞的沟底：木枪托先着地的沉闷一记，铁质枪机和背带环跟着「咔啦」轻响一下，泥浆被砸开，约 0.6 秒。不要硬地面，不要长时间滚动。",
      "老步枪摔进湿泥里的声音：沉、钝、湿，木头与金属混在一起的一记「噗嗒」，金属那部分很短很轻，约 0.5 秒，然后安静。",
    ],
  },
  cheekCut: {
    label: "刀尖划开脸颊",
    credit: "刀尖贴脸往下压划开（很轻的一声，不是砍）",
    prompts: [
      "一把锋利刀尖贴着一块绷紧的湿猪皮缓慢往下压着划开一道：很轻、很近的一声细微的「嘶——」，皮被割开的细小撕裂声带一点湿黏，约 0.5 秒。音量很小，不是砍，不是刺，没有冲击声，没有金属碰撞。",
      "拟音：用剃刀的刀尖在一块带皮的湿生猪肉表面慢慢划下一道口子，极轻的细碎割裂声，像撕开一层湿薄膜，约 0.6 秒，非常贴近麦克风、非常小声。没有砍击，没有刀刃碰撞。",
      "锋利的刀尖压进湿润的皮肤往下拉开的声音：一声细、轻、湿的「嗤」，持续约半秒，很克制，几乎听不见的那种近距离细节。不要冲击，不要金属声，不要喘息。",
      "极近距离的拟音：小刀尖慢慢划开一张绷紧的湿羊皮纸，轻微的细长撕裂「嘶」，带一点点湿黏，约 0.5 秒。只有这一下，声音很小。",
      "刀尖贴着湿的生肉皮慢慢往下划：轻、细、短的一道划开声，像指甲刮破一层湿薄皮，约 0.4 秒，没有任何敲击或砍的感觉。",
      // 第二轮（06—09）：上面五条把「很轻 / 几乎听不见」写进去，模型就真给了空白（峰值 −26…−36 dBFS，
      // 能量全在 40 Hz 以下的漂移或 10 kHz 的嘶声）。轻重交给混音，这里只要一条录得清楚的近距离割开声。
      "近距离拟音，录音电平正常：一把锋利的小刀刀尖压在一块绷紧的湿猪皮上，慢慢往下划开一道几厘米长的口子。清楚的、细长的湿割裂声「嗤——」，皮被一点点割开的细碎撕裂，约 0.6 秒。不是砍，不是刺，没有冲击，没有金属碰撞。",
      "近距离拟音，录音清晰：手术刀刀尖压着一块湿的生鸡皮往下拉开一道口子，细、湿、连续的割开声，像撕开一层湿薄膜，约 0.5 秒，中高频为主，结尾干脆。",
      "近距离拟音：刀尖用力压进一张绷紧的湿牛皮纸往下划开一道，清楚的细长撕裂「嘶啦」，带一点湿黏，约 0.5 秒。只有这一道，声音清楚、不要嘶嘶底噪。",
      "近距离拟音：锋利的刀尖贴着一块带皮的生猪肉表面，用力往下划出一道口子，皮被割开的细微「嗤」声加一点湿润的黏响，约 0.5 秒，录得清楚，不是砍击。",
    ],
  },
  bootGrind: {
    label: "鞋跟碾手背 / 碾泥",
    credit: "军靴鞋跟在手背与泥上碾（约 0.6 秒）",
    prompts: [
      "穿厚皮军靴的鞋跟踩在湿泥里的一块软东西上，用力左右碾了两下：湿泥被挤压的黏腻「咕叽」声夹着鞋底皮革与砂粒摩擦的沙沙声，约 0.6 秒，持续的碾压，不是一下踩踏。",
      "拟音：一只钉底皮靴的后跟压在泥地里一只皮手套上来回拧碾，皮革被压紧挤扭的吱扭声、泥沙被碾开的沙沙声，约 0.6 秒，力道沉重缓慢。不要脚步，不要踩踏冲击。",
      "鞋跟在湿泥上用力碾转半圈的声音：低沉的湿泥挤压加上细碎砂砾摩擦，中间夹一点点细小的「咯」声，约 0.6 秒，持续、缓慢、带力量。不要清脆，不要回声。",
      "皮靴后跟踩住泥里的东西使劲拧：湿黏的研磨声，泥水从鞋底挤出来的咕叽，砂粒在皮革下沙沙作响，约 0.6 秒，一个连续的碾动，不是两下。",
    ],
  },
};

const Pascal = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const TakeFile = (cue, i) => `${Pascal(cue)}_take${String(i + 1).padStart(2, "0")}.mp3`;

/**
 * 选定的 take 与切点（候选量完、看过频谱图之后定，理由写在每一行上面）。
 * 每条：take 文件、从 atS 起切 durS 秒、高通 hp（默认 38）、淡入 / 淡出秒数。
 * 一个 cue 有几行就出几个变体（AudioSfx_<Cue>_01…），运行时按 SAMPLE_CYCLE 顺序轮播、原速播放。
 */
// 2026-10-11 第一轮 35 条 + 划脸第二轮 4 条，逐条量「包络峰两边退到 6 % 的那一段」的五段能量占比、谱心，
// 再看波形与对数频谱图定的（量法：<40 / 40—120 / 120—400 / 400—2k / 2k—8k / >8k Hz，lt500 = 500 Hz 以下占比）。
const PICKS = {
  // take03：一记干脆的「铛」，400—2k 占 91 %、谱心 1.3 kHz，后面是盔壳一条渐弱的中频余振 —— 磕在钢盔上就是这样。
  // 落选：01 是两下（0.16 / 0.33 s）、谱心 1.8 kHz 偏亮；02 起音软、像敲木头；04 是一记 2.5 kHz 的细「嗒」接很长的高频振铃（敲铁片）。
  grenadeKnock: [{ take: "GrenadeKnock_take03.mp3", atS: 0.125, durS: 0.45, fadeOutS: 0.15 }],
  // 三变体，三种「闷」：
  //   02 —— 先一下布被戳穿的轻嘶，0.25 s 后一记 40—120 Hz 占 50 %、lt500 71 % 的闷「噗」（最闷，乙扎尸用）；
  //   03 —— 一整团湿的「噗嗤」，lt500 30 %、2—8k 42 %（最湿最响，丁扎冬瓜那两刀）；
  //   06 —— 起头稍亮、中间一记低频顿挫、lt500 51 %（介于两者之间）。
  // 落选：01 / 05 开头就是一整片宽带噪声（像撕布，没有「扎进去」的顿挫）；04 是一段越来越响的嘶，像抽刀不像扎。
  bayonetStabBody: [
    { take: "BayonetStabBody_take02.mp3", atS: 0.58, durS: 0.62, fadeOutS: 0.12 },
    { take: "BayonetStabBody_take03.mp3", atS: 0.16, durS: 0.60, fadeOutS: 0.15 },
    { take: "BayonetStabBody_take06.mp3", atS: 0.20, durS: 0.50, fadeOutS: 0.12 },
  ],
  // take04 第一下：120—400 Hz 占 60 %、lt500 80 %，一记低沉的湿「咕叽」，0.5 s 收（后面 1.1 s 那第二下不要）。
  // 落选：01 与扎刀听不出区别；02 能量全在 2 kHz 以上（是嘶不是湿）；03 只有 0.19 s、太薄。
  bayonetTwist: [{ take: "BayonetTwist_take04.mp3", atS: 0.14, durS: 0.48, fadeOutS: 0.10 }],
  // 两变体：02 的第一脚（lt500 81 %，一记厚实的「噗」，后面 0.6 s 那一下湿响不要）；04（lt500 64 %、带一条湿泥拖尾）。
  // 落选：01 有声段只有 −36 dB、糊；03 是一记 400—2k 的硬脚步，踩在硬地上的样子。
  stompMud: [
    { take: "StompMud_take02.mp3", atS: 0.11, durS: 0.40, fadeOutS: 0.10 },
    { take: "StompMud_take04.mp3", atS: 0.045, durS: 0.42, fadeOutS: 0.12 },
  ],
  // take01：一记 0.07 s 的软「噗」，400—2k 占 69 %、谱心 0.9 kHz —— 小铁件陷进松土，几乎不弹。远近交给 position。
  // 落选：02 是空白（峰值 −42 dB）；03 是一记 2.2 kHz 的金属「嗒」落在硬地上；04 太弱（−32 dB）。
  boltToss: [{ take: "BoltToss_take01.mp3", atS: 0.03, durS: 0.22, fadeOutS: 0.06 }],
  // take03：先一记木托拍进泥里的闷响（lt500 59 %），0.27 s 后铁件跟着一磕 —— 「木与金属一声」两层都在。
  // 落选：01 只有一下、没有铁；02 起音像整块木板拍地、后面 1.4 s 才来一下金属；04 是一记 4 kHz 的亮「啪」（硬地）。
  rifleTossMud: [{ take: "RifleTossMud_take03.mp3", atS: 0.11, durS: 0.62, fadeOutS: 0.12 }],
  // take08（第二轮）：一道越压越响的细长「嗤——」，0.35 s 里从无到有、最响处干脆收住 —— 刀尖压着往下划开，
  // 不是砍。谱心 7.2 kHz（细、薄，没有冲击）。头上 0.08 s 淡入让它从贴脸的那一点浮出来。
  // 落选：第一轮 01—05 全是空白（见 CUES.cheekCut 的旁注）；06 / 07 是一串零碎的纸张窸窣；
  // 09 是一记短促的「嘶啦」，400—2k 占 38 %，听着像撕纸。
  cheekCut: [{ take: "CheekCut_take08.mp3", atS: 0.25, durS: 0.47, fadeInS: 0.08, fadeOutS: 0.03 }],
  // take02：0.56 s 一段连续的低沉碾压（120—400 Hz 占 50 %、lt500 57 %），中间夹几下砂粒的细碎，末尾一下轻「咯」。
  // 落选：01 是两次分开的碾（中间断了 0.13 s）、偏亮；03 / 04 长 1.4—1.9 s、大半是 2 kHz 以上的刮擦。
  bootGrind: [{ take: "BootGrind_take02.mp3", atS: 0.02, durS: 0.58, fadeInS: 0.02, fadeOutS: 0.06 }],
};

async function Generate(cue, i, rawFile) {
  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) throw new Error("缺少 VOLCENGINE_API_KEY；密钥只能通过环境变量提供，禁止写进仓库。");
  const prompt = COMMON + CUES[cue].prompts[i];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("https://openspeech.bytedance.com/api/v3/tts/create", {
        method: "POST", signal: AbortSignal.timeout(360000),
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
        body: JSON.stringify({ model, text_prompt: prompt,
          audio_config: { format: "mp3", sample_rate: 48000, pitch_rate: 0, speech_rate: 0, loudness_rate: 0 }, watermark: {} }),
      });
      // 不打印响应体与头：可能带敏感信息。
      if (!response.ok) throw new Error(`SeedAudio HTTP ${response.status}`);
      const payload = await response.json();
      if (typeof payload.audio !== "string") throw new Error("SeedAudio 没有返回 audio");
      const bytes = Buffer.from(payload.audio, "base64");
      if (bytes.length < 2048) throw new Error("SeedAudio 返回的 take 过小");
      fs.writeFileSync(rawFile, bytes);
      fs.writeFileSync(rawFile + ".json", JSON.stringify({ model, cue, take: i + 1, prompt, generatedAt: new Date().toISOString() }, null, 2));
      console.log(`generated ${path.basename(rawFile)}: ${bytes.length} bytes`);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      console.warn(`${path.basename(rawFile)}: ${error.message}，重试`);
    }
  }
}

function Decode(file, filter, sr = SR) {
  const raw = execFileSync(ffmpeg, ["-v", "error", "-i", file, ...(filter ? ["-af", filter] : []),
    "-ac", "1", "-ar", String(sr), "-f", "f32le", "-"], { maxBuffer: 256 * 1024 * 1024 });
  return new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}

/** 有声段 RMS（20 ms 帧 ≥ 最响帧 10 %）、采样峰值、真峰值（4× 过采样）。口径同 Script_SfxBake.MeasureMp3。 */
function Levels(file) {
  const pcm = Decode(file);
  const hop = Math.round(SR * 0.02);
  let peak = 0;
  const frames = [];
  for (let s = 0; s < pcm.length; s += hop) {
    let sum = 0;
    const e = Math.min(pcm.length, s + hop);
    for (let i = s; i < e; i += 1) { peak = Math.max(peak, Math.abs(pcm[i])); sum += pcm[i] * pcm[i]; }
    frames.push(Math.sqrt(sum / Math.max(1, e - s)));
  }
  const loud = Math.max(...frames);
  const active = frames.filter((v) => v >= loud * 0.1);
  const rms = Math.sqrt(active.reduce((a, v) => a + v * v, 0) / Math.max(1, active.length));
  let truePeak = 0;
  for (const v of Decode(file, null, SR * 4)) truePeak = Math.max(truePeak, Math.abs(v));
  const Db = (v) => 20 * Math.log10(Math.max(1e-12, v));
  return { seconds: pcm.length / SR, peakDbfs: Db(peak), truePeakDbfs: Db(truePeak), activeRmsDbfs: Db(rms) };
}

function Filter(pick) {
  const fadeOut = pick.fadeOutS ?? 0.03;
  return `highpass=f=${pick.hp ?? 38},atrim=start=${pick.atS}:duration=${pick.durS},asetpts=PTS-STARTPTS,`
    + `afade=t=in:d=${pick.fadeInS ?? 0.004},afade=t=out:st=${(pick.durS - fadeOut).toFixed(3)}:d=${fadeOut}`;
}

function BakeOne(pick, outFile) {
  const rawFile = path.join(rawDir, pick.take);
  if (!fs.existsSync(rawFile)) {
    throw new Error(`缺少选定的 take ${pick.take}（Audio/Sfx/_raw/SeedAudioOpeningFoley/）。`
      + "这是人工选定的音，重掷不可复现：从归档取回，或 --force 重新生成并重新选。");
  }
  const staged = path.join(rawDir, "Staged", path.basename(outFile));
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  let gain = 0, measured = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    execFileSync(ffmpeg, ["-y", "-v", "error", "-i", rawFile, "-af", `${Filter(pick)},volume=${gain.toFixed(2)}dB`,
      "-ac", "1", "-ar", String(SR), "-b:a", BITRATE, staged]);
    measured = Levels(staged);
    if (Math.abs(measured.activeRmsDbfs - TARGET_ACTIVE_DBFS) <= 0.3 && measured.peakDbfs <= PEAK_CEIL_DBFS) break;
    // 短音的有声段门限（最响帧的 10 %）会随 mp3 重编跳一两帧，全量补偿会来回摆；第三次起只补一半。
    const step = Math.min(TARGET_ACTIVE_DBFS - measured.activeRmsDbfs, PEAK_CEIL_DBFS - 0.1 - measured.peakDbfs);
    gain += attempt >= 2 ? step / 2 : step;
  }
  // 门限与 Script_AudioNormalize 的「一次性音」组一致（−25 ± 0.5 dBFS），过不了就不落成品。
  if (measured.peakDbfs > PEAK_CEIL_DBFS || Math.abs(measured.activeRmsDbfs - TARGET_ACTIVE_DBFS) > 0.5) {
    throw new Error(`${path.basename(outFile)}：电平闸没过（有声段 ${measured.activeRmsDbfs.toFixed(2)}，峰值 ${measured.peakDbfs.toFixed(2)}）`);
  }
  fs.copyFileSync(staged, outFile);
  return measured;
}

async function Pool(tasks, jobs) {
  let next = 0;
  const errors = [];
  async function Worker() {
    while (next < tasks.length) {
      const task = tasks[next++];
      try { await task(); } catch (error) { errors.push(error.message); console.error(error.message); }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, Worker));
  if (errors.length) throw new Error(`${errors.length} 条候选没生成出来`);
}

async function Main() {
  fs.mkdirSync(rawDir, { recursive: true });
  const only = Opt("only", "").split(",").filter(Boolean);
  const cues = Object.keys(CUES).filter((cue) => !only.length || only.includes(cue));
  const unknown = only.filter((cue) => !CUES[cue]);
  if (unknown.length) throw new Error(`没有这条 cue：${unknown.join(" ")}`);

  if (Flag("generate") || Flag("force")) {
    const jobs = Math.min(2, Number(Opt("jobs", "2")) || 2);   // 火山引擎并发 ≤ 2
    const tasks = [];
    for (const cue of cues) {
      CUES[cue].prompts.forEach((_, i) => {
        const rawFile = path.join(rawDir, TakeFile(cue, i));
        if (Flag("force") || !fs.existsSync(rawFile)) tasks.push(() => Generate(cue, i, rawFile));
      });
    }
    console.log(`生成 ${tasks.length} 条候选（并发 ${jobs}）`);
    await Pool(tasks, jobs);
    return;
  }

  if (Flag("report")) {
    for (const cue of cues) {
      CUES[cue].prompts.forEach((_, i) => {
        const rawFile = path.join(rawDir, TakeFile(cue, i));
        if (!fs.existsSync(rawFile)) { console.log(`${TakeFile(cue, i)}  （没生成）`); return; }
        const m = Levels(rawFile);
        console.log(`${TakeFile(cue, i).padEnd(28)} ${m.seconds.toFixed(2)} s  峰值 ${m.peakDbfs.toFixed(1)}`
          + `  真峰值 ${m.truePeakDbfs.toFixed(1)}  有声段 ${m.activeRmsDbfs.toFixed(1)} dBFS`);
      });
    }
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.licenses.volcengine = SFX_LICENSES.volcengine;
  const qc = {};
  for (const cue of cues) {
    const picks = PICKS[cue];
    if (!picks || !picks.length) throw new Error(`${cue} 还没有选定 take（PICKS）`);
    const files = [];
    const rows = [];
    picks.forEach((pick, i) => {
      const file = `AudioSfx_${Pascal(cue)}_${String(i + 1).padStart(2, "0")}.mp3`;
      const m = BakeOne(pick, path.join(outputDir, file));
      files.push(file);
      rows.push({ file, take: pick.take, ...m });
      console.log(`baked ${file.padEnd(32)} ← ${pick.take} @${pick.atS}+${pick.durS}  ${m.seconds.toFixed(3)} s`
        + `  有声段 ${m.activeRmsDbfs.toFixed(2)}  峰值 ${m.peakDbfs.toFixed(2)}  真峰值 ${m.truePeakDbfs.toFixed(2)} dBFS`);
    });
    manifest.cues[cue] = {
      files,
      // 多变体记最长那条（清单里的 seconds 只是元数据，与 goreSever / neckDeath 同写法）
      seconds: Number(Math.max(...rows.map((r) => r.seconds)).toFixed(3)),
      credit: `Volcengine SeedAudio 1.0 · ${CUES[cue].credit}（${picks.map((p) => p.take).join(", ")}） · ${DATE}`,
      license: "volcengine",
    };
    qc[cue] = rows;
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(path.join(rawDir, "Data_Qc.json"), JSON.stringify(qc, null, 2) + "\n");
}

Main().catch((error) => { console.error(error.message); process.exitCode = 1; });
