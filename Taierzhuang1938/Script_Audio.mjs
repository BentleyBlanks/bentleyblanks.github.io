// 《台儿庄：血战滕县》音频引擎 —— **合成打底 + 实录采样盖在上面**。
//
// 底层是 58 个 WebAudio 节点图配方（RECIPES），一个外部文件都不用；
// 上层是实录素材（Audio/Sfx/，免版税包与 PD/CC0 素材，见 Data_SfxSources.mjs），
// 由 LoadSfxPack 在解锁之后**逐条盖掉同名配方**，盖不上去就照旧用合成的。
//
// 为什么当初一路合成到底：整个项目的底线是「不加载任何外部资源」，而且枪声
// 一旦是采样，二十几个人同时开枪会立刻听出来是同一个 wav 在复读。
// 为什么最后还是换了：**枪声的瞬态是炸开的空气，不是包络** —— 噪声过带通再
// 削顶，出来永远是「啪」不是「炸」。复读的问题在采样层用多变体 + 逐发 ±3%
// 变调解掉（同一条思路：随机来自播放时，不是来自素材）。
//
// 信号链（顺序错一处味道就不对）：
//   源(osc/noise) → 声部 gain → [空气/遮挡低通] →┬→ [遮挡干声衰减] → PannerNode(HRTF) ┐
//                                               │                    └→ [远声组 farGain] ┤
//                                               └→ 混响 send → Convolver(按**声源所在区**选 IR) → 回声总线 ┤
//                                                          sfx/music/amb 三条总线 ┤
//        → duck gain → master gain → 母线慢压缩 → 耳鸣低通 → 末端快限幅 → 软削顶 → 输出
//
// 六条踩过的坑，写在前面（前三条是老的，后三条是 2026-09-08 这一轮的）：
//   1) **混响必须在 Panner 之前分出去**。把 wet 也 HRTF 化的话，远处一枪的
//      尾巴会跟着头一起转，听起来像枪在你耳朵边上绕圈 —— 真实的混响是弥散的。
//   2) **exponentialRampToValueAtTime 不能收到 0**，WebAudio 会直接抛异常并
//      把那一路静音。所有包络的地板统一 1e-4。
//   3) **Panner 用 HRTF 很贵**。近处才值得，远处的零星枪声改用 StereoPanner，
//      同屏 24 人时这一条决定了音频线程会不会爆。
//   4) **遮挡不能把湿声一起压掉**。隔着一堵墙听见的那一枪，直达声几乎没了，
//      听得见的**主要就是混响**。干声压 −12 dB、湿声只压 −4 dB，这个差额就是
//      「墙那边有人在打」和「没有人在打」的全部区别。
//   5) **传播延迟一开，22 ms 去重窗就得按「到耳朵的时刻」算**，不能再按调用时刻。
//      旧代码是 `delay === 0` 才去重，于是延迟一上，同一帧的齐射全部原样叠进来。
//   6) **预算不够时不许直接丢新的**。丢新的等于「越打越安静，而且丢的是刚发生的事」。
//      正确做法是从活着的声部里偷一条更轻更远的（voice stealing），见 StealVoices。
//
// 分区混响 / 遮挡 / 传播延迟这三层要宿主注册探针才生效（见 SetProbes）；
// 一条都不注册时行为与 2026-08-20 那一轮完全一致。契约与实测数字在
// docs/Data_AudioEngine.md。
//
// 决定论：**不许 Math.random**。所有随机走 Mulberry32，种子 = 音效名哈希 ^ 播放序号，
// 这样同一场回放里第 N 次开枪永远是同一条枪声，逐轮截图/录音比对才有意义。

import { Mulberry32, HashString, Clamp, Clamp01 } from "./Script_Noise.mjs";
import { VOICE_BASE, VOICE_LINES } from "./Data_Voice.mjs";
import { FIRST_LEVEL_MUSIC_CUES, FIRST_LEVEL_MUSIC_MIX } from "./Data_FirstLevelMissionMusic.mjs";
import { GUN_AUDIBILITY } from "./Data_Tuning_Audio.mjs";
import { CARRIAGE_SOUND } from "./Data_FirstLevelCarriageSound.mjs";
import { AUDIO_MIX_DEFAULTS } from "./Data_Tuning_Audio.mjs";

// 包络地板。低于这个值当作静音（见文件头坑 2）。
const FLOOR = 1e-4;
// 多普勒用的声速（m/s）与变调夹。飞机 100 m/s 迎面按物理是 +42%，一听就是合成器；
// 夹到 ±18% 左右：能听出「压过来 / 掠过去」的一升一降，又不至于像拧收音机。
const SPEED_OF_SOUND = 340;
const DOPPLER_RATE_MIN = 0.84;
const DOPPLER_RATE_MAX = 1.18;
// 会飞的引擎声从四五百米外就该听见（那是「远处有飞机」这一拍的全部），比通场那条还远一档。
const PLANE_DRONE_CULL_M = 2600;

// 同时存活的 WebAudio 节点上限。超了就丢掉新的低优先级声音 ——
// 宁可少响一枪，也不能让音频线程卡出爆音（爆音比缺一枪难听得多）。
const NODE_BUDGET = 120;

// 同名音效在这个时间窗内重复触发就合并成一次。
// 一排人同一帧齐射时，二十条一模一样的 rifleNra 叠在一起只会得到削顶的噪声，
// 而且瞬间吃掉全部节点预算。
//
// **窗口比的是「到耳朵的时刻」，不是「调用的时刻」**（见文件头坑 5）。
const DEDUPE_S = 0.022;

// ===========================================================================
// 空间三件套：遮挡 / 分区混响 / 传播延迟
//
// 这三层都要宿主注册探针（SetProbes）才生效。探针一条都不注册时每一处都退回
// 老行为：occ 恒为 0（乘 1，不插节点）、混响 send 仍按 this.space 走全局那一档、
// 延迟恒为 0。**回归为零是硬要求** —— 音频的失败是静默的，
// 一层没接上去只会听着「怪」，不会报错。
// ===========================================================================

/**
 * 近到这个距离以内不查遮挡。
 * 贴身的声音要么在你手上（拉栓、脚步），要么和你在同一格里 ——
 * 而射线在 4 m 内基本只会打到你自己的碰撞体，查出来的是噪声不是信息。
 */
const OCCLUSION_MIN_M = 4;
/**
 * 每帧最多几次射线。射线是**宿主的物理查询**，不是免费的：
 * 一帧里二十个兵齐射就是二十次 battlefield.Raycast。
 * 8 次是「场上同时在响的、真需要判遮挡的声源」的实际量级（其余走缓存）。
 */
const OCCLUSION_RAYS_PER_FRAME = 8;
/** 引擎里没有 Frame() 钩子，「一帧」只能拿 ctx.currentTime 按 60 fps 分窗。 */
const OCCLUSION_FRAME_S = 1 / 60;
/**
 * 遮挡结果的缓存寿命与空间格边长。
 * 同一堵墙后面的一排兵落在同一格里，共用一次射线 —— 这是射线数能压到 8 次/帧
 * 的真正原因，帧预算本身只是保险丝。
 */
const OCCLUSION_CACHE_S = 0.25;
const OCCLUSION_CELL_M = 4;
/** 缓存条目上限，超了整张丢。战场跑一分钟能摸到上千格，留着只是在漏内存。 */
const OCCLUSION_CACHE_MAX = 512;
/** 听者走出这么远就把缓存全丢：拐过一个墙角，旧结论条条都是错的。 */
const OCCLUSION_LISTENER_MOVE_M = 2.5;
/** 完全挡死时的低通截止（Hz）。砖墙对 2 kHz 以上几乎全吃，剩下的是闷声。 */
const OCCLUSION_LP_HZ = 800;
/** 完全挡死时干声掉多少 dB。 */
const OCCLUSION_DRY_DB = -12;
/** 湿声掉得少得多 —— 隔着墙听见的主要就是混响（见文件头坑 4）。 */
const OCCLUSION_WET_DB = -4;
/** 会飞的源多久重查一次遮挡（MoveVoice）。与缓存寿命同一档。 */
const OCCLUSION_REFRESH_S = 0.25;
/**
 * 听者与声源分处室内/室外时额外叠的一档遮挡。
 *
 * 射线探针只回答「中间有没有实体挡着」，回答不了「你在屋里」这件事：
 * 门开着的时候射线是通的，但屋里听外面的枪仍然是闷的（墙、屋顶、门框全在吸声）。
 * 0.35 折算成 −4.2 dB 干声 + 低通压到 4.5 kHz，是「听得清但明显在屋外」的量。
 */
const ZONE_BOUNDARY_OCC = 0.35;

/** 四档空间。名字同时是 zone 探针的返回值域与 this.reverbs 的键。 */
const REVERB_SPACES = ["interior", "courtyard", "street", "open"];
/**
 * 各档混响的回声总线增益。
 * 室内给得最高：小房间里混响占比本来就大（墙近、吸声面积小）。
 * street / open 两条**保持 2026-08-20 的原值**，不借这一轮顺手改平衡。
 */
const REVERB_RETURN = { interior: 0.9, courtyard: 0.86, street: 0.85, open: 0.7 };
/** 听者所在区的缓存寿命。zone 探针比射线便宜，但每条声音查一次仍然是白花。 */
const ZONE_CACHE_S = 0.2;

/**
 * 传播延迟总开关：闪光先到、声音后到。
 *
 * 战地系列的做法，也是**唯一**能让玩家从听觉上估出距离的线索 ——
 * 音量与音色只能告诉他「远」，延迟能告诉他「三百米」。
 * 关掉它整条链退回原状（所有声音在调用那一帧就起播）。
 */
const PROPAGATION_DELAY = true;
/** 这么近以内不延迟：30 m = 88 ms，比一帧多不了多少，听感上只是「不跟手」。 */
const PROPAGATION_MIN_M = 30;
/** 延迟上限。400 m（CULL_DEFAULT_M）折 1.18 s，留一点余量兜住 soundField 那档。 */
const PROPAGATION_MAX_S = 1.4;
/** 除了枪与炸，还有哪些 cue 走延迟。 */
const PROPAGATION_CUES = new Set([
  "shellImpact", "shellIncoming", "launcherPop", "amb.cannonFar",
]);
/** 枪类 cue 里 FAR_CUE / SAMPLE_BURST 覆盖不到的那几条。 */
const GUN_EXTRA_CUES = new Set([
  "rifleNra", "rifleIja", "zb26", "type11", "type92",
  "strafeNear", "strafeFar", "strafeDirt",
]);

/**
 * 触发 duck 的 cue 表 —— **从合成配方里搬出来的**。
 *
 * 原来 `A.Duck(...)` 写在 explosionNear / shellImpact 两条**合成配方**体内。
 * 采样一盖上去（正常路径），那两条配方就再也不会被执行 ——
 * 于是**整局一次 duck 都没有**：爆炸炸在脸上，音乐和环境床照样满音量顶着。
 * 这类 bug 没有任何机器能发现：声音全在响，控制台干净。
 *
 * 现在改成按 cue 类别在 Play 里统一触发，而且**按听者距离缩放**：
 * 两百米外的一颗手榴弹不该把配乐压下去。range 是「压到零」的距离。
 * 表里留了 explosionMid 一行 —— 那条 cue 还没有（素材侧在补），
 * 先备着比事后想起来强（多一个没人播的键不花钱，少一个就是又一次静默回归）。
 */
const DUCK_ON = {
  explosionNear: { seconds: 1.1, amount: 0.55, range: 45 },
  explosionMid: { seconds: 0.9, amount: 0.45, range: 80 },
  explosionFar: { seconds: 0.8, amount: 0.30, range: 140 },
  shellImpact: { seconds: 0.8, amount: 0.45, range: 55 },
  launcherPop: { seconds: 0.5, amount: 0.25, range: 30 },
  strafeNear: { seconds: 0.7, amount: 0.35, range: 40 },
};
/** 缩放之后低于这个量就不触发：压 3% 谁也听不出来，只是白改一次总线增益。 */
const DUCK_MIN_AMOUNT = 0.06;

/**
 * 触发耳鸣的 cue 与时长。同样从配方里搬出来。
 *
 * 顺带修掉一个反过来的错：`explosionFar`（远炸）的合成配方里写着 `A.Deafen(0.3)` ——
 * **几百米外的一记闷响把玩家的耳朵震了**。耳鸣是「炸在脸上」的独有反馈，
 * 所以现在一律要过 DEAFEN_M 这道距离闸。
 */
const DEAFEN_ON = { explosionNear: 0.42, explosionMid: 0.3, shellImpact: 0.3 };
/** 炸到这么近才耳鸣。12 m 是手榴弹的杀伤半径量级：再远只是很响，不是被震。 */
const DEAFEN_M = 12;
/**
 * 耳鸣的起音期（秒）：这段时间里总线仍是全带宽的。
 * 一发炮弹的爆裂全在头 0.1 s 里，耳鸣该发生在它**之后**（见 Deafen）。
 */
const DEAFEN_ATTACK_HOLD_S = 0.13;

/**
 * 玩家开枪压环境（HDR-lite）。
 *
 * 真枪在耳边响的那 0.2 秒里，人耳的镫骨肌反射会把外界整体压掉十几分贝 ——
 * 游戏里对应的做法是把**环境床与远处那一组**快压慢放：压得快（枪响的瞬间），
 * 放得慢（听感上是「耳朵缓过来」，而不是「音量旋钮弹回去」）。
 *
 * 只压环境与远声组，**不压近处的音效**：把身边的脚步和喊话一起压掉，
 * 听感会变成「开一枪世界静音一下」，那是另一种穿帮。
 */
const FIRE_DUCK_AMOUNT = 0.5;      // 环境床：剩 0.50 = −6.02 dB
const FIRE_DUCK_ATTACK_S = 0.04;   // 压：40 ms，跟得上枪口那一下
const FIRE_DUCK_HOLD_S = 0.06;
const FIRE_DUCK_RELEASE_S = 0.30;  // 放：300 ms，慢到听不出是个自动过程
/**
 * 【2026-09-09】**远声组单独一档，而且比环境床松一半**：剩 0.71 = −3.01 dB。
 *
 * 用户原话「打起来整个战场安安静静的」有一半是这条造成的：远声组装的是
 * 「远处那一片仗」（> FAR_GROUP_M 的全部位置音 + 新的远枪扇区层），而玩家
 * 一秒能扣三四次扳机 —— 每一枪压 −6 dB、放 300 ms，连着打的时候那一层
 * **一直被摁在 −6 dB 上**，也就是「越打越静”。
 *
 * 镫骨肌反射本身是对的，改的是两件事：
 *   · 幅度收到 −3 dB（环境床那条 −6 dB 不动 —— 它是底噪，压狠了只有好处）；
 *   · 栓动步枪**单发不压远声组**（见 FIRE_DUCK_SUSTAIN_S）。
 */
const FIRE_DUCK_FAR_AMOUNT = 0.29;   // 剩 0.71 = −3.01 dB
/**
 * 「连续开火」的判据：上一枪在这么久以内就算连着打。
 *
 * 自动武器（weaponClass "mg"）无条件算连续；栓动步枪要真的在连着打
 * （0.9 s ≈ 中正式拉一次栓再打出去的最快节奏）才压远声组。
 * 单发不压是有意的：一发之后玩家要听的正是**别人的回应**，而那些回应
 * 十有八九在四十五米外 —— 压掉它等于把「打回来了」这条信息删掉。
 */
const FIRE_DUCK_SUSTAIN_S = 0.9;
/** 超过这个距离的位置音统一走远声组（farGain），玩家开枪时整组一起让路。 */
const FAR_GROUP_M = 45;

/**
 * 战场密度（2026-09-09）：远处那一层随「打得有多凶」涨落。
 *
 * 用户原话：「打起来整个战场安安静静的」。取证下来是三件事叠在一起 ——
 * 第一关两档预设（firstLevelFront / firstLevelSouth）的 `events` 是**空的**、
 * `layers` 只有一条 windPlain 0.3；GUN_CULL_M 剔掉的枪只记进 `drops.distance`
 * 就没了；远声组被玩家自己的枪一直摁着（见 FIRE_DUCK_FAR_AMOUNT）。
 *
 * 这一组常量只回答「拿到一个 0..1 的强度之后，床与撒播该怎么变」——
 * **强度本身怎么算是接线层的账**（`Script_AudioWiring.BattleIntensity`，
 * 数在 `Data_Tuning_Audio.BATTLE_DENSITY`）：那要读 AI 状态，引擎不认识 AI。
 *
 * 两条 floor 都**不是 0**：用户要的是「远处一直有枪炮声」，
 * 强度 0 时留的是「远处零星」，不是死寂。
 */
const BATTLE_BED_FLOOR = 0.34;     // 强度 0 时床还剩三分之一（−9.4 dB）
const BATTLE_BED_GAMMA = 0.7;      // < 1：中段涨得快一点，0.3 的强度就听得出来
const BATTLE_BED_RAMP_S = 1.4;     // 床的增益斜坡 ≥ 1 s：别一枪一跳
const BATTLE_EVENT_RATE_FLOOR = 0.35;
const BATTLE_EVENT_VOL_FLOOR = 0.62;
const BATTLE_EVENT_GAMMA = 0.8;

/** 强度 → 战斗床的增益倍率。 */
function BattleBedScale(x) {
  return BATTLE_BED_FLOOR + (1 - BATTLE_BED_FLOOR) * Math.pow(Clamp01(x), BATTLE_BED_GAMMA);
}
/** 强度 → 战斗类环境事件的频次倍率。 */
function BattleEventRate(x) {
  return BATTLE_EVENT_RATE_FLOOR + (1 - BATTLE_EVENT_RATE_FLOOR) * Math.pow(Clamp01(x), BATTLE_EVENT_GAMMA);
}
/** 强度 → 战斗类环境事件的音量倍率（比频次浅：远处零星那一档也要听得见）。 */
function BattleEventVolume(x) {
  return BATTLE_EVENT_VOL_FLOOR + (1 - BATTLE_EVENT_VOL_FLOOR) * Math.pow(Clamp01(x), BATTLE_EVENT_GAMMA);
}

/**
 * Voice stealing：预算不够时腾位置而不是丢新的。
 * 20 ms 淡出 —— 硬掐会「咔」一声，而 20 ms 已经短到听不出是被掐掉的。
 */
const STEAL_FADE_S = 0.02;
/** 一次 Play 最多偷几条。偷到第四条还不够说明预算本身设错了，不该在这儿死磕。 */
const STEAL_MAX_PER_PLAY = 3;

/**
 * 两级动态：母线慢压缩（+ 补偿增益）+ 末端峰值限幅。
 *
 * 原来只有一只 −8 dB / 12:1 / release 0.22 s 的压缩器兼做两件事，于是
 * **密集爆炸会抽泵**（docs/Data_AudioAssets.md 手榴弹雨那一节）：
 * 一记爆炸把整条母线摁下去，0.22 s 之内全场枪声跟着一起变小再浮回来。
 * 拆成两级：慢的那只只做「整体响度的地板」（比值 1.6、起控 150 ms、放 1 s，
 * 慢到听不出它在动），峰值交给末端那只（比值 20、起控 4 ms）。
 *
 * **数值是量出来的，不是照着直觉配的。** 在 OfflineAudioContext 里摆 20 记
 * explosionNear（4.0 增益、0.15 s 间隔，干信号峰值 2.00 = +6.0 dBFS），
 * 叠一条 6 kHz 的稳态探针，用 Goertzel 逐 20 ms 窗把探针幅度量出来 ——
 * 压缩器施加的是宽带增益，所以探针幅度**就是**这一刻链上的增益，
 * 它的 max−min 就是抽泵深度（量宽带 RMS 不行：WaveShaper 的 2x 过采样有群延迟，
 * 逐窗相比会算出 ±5 dB 的假抖动）。
 *
 *   单级（旧）  抽泵深度 10.08 dB，平均压 −3.06 dB，输出峰值 0.932
 *   两级（新）  抽泵深度  8.91 dB，平均压 −1.95 dB，输出峰值 0.941
 *
 * 两条要写下来的弯路：
 *   · **一开始配的 −14 / 3:1 / 0.35 更糟**：深度 11.47 dB，比旧的还多 1.4 dB。
 *     慢压缩的门槛压太低、比值太大，它自己就成了第二只在抽泵的压缩器。
 *     慢压缩要「几乎不动」才叫慢压缩。
 *   · **补偿增益必须显式给**。慢压缩把静态响度吃掉了 1.9 dB（Chrome 的
 *     DynamicsCompressor 自带一份随参数变的隐式 makeup，参数一改它就跟着变），
 *     不补的话表现是「整个游戏变小声了」。补齐之后静态增益与旧链持平
 *     （+3.28 dB vs +3.23 dB），代价是抽泵优势从 2.98 dB 缩到 1.17 dB ——
 *     这笔账认了：谁也不会为了少一点抽泵接受整局低 2 dB。
 */
const BUS_COMP = { threshold: -18, knee: 20, ratio: 1.6, attack: 0.15, release: 1.0 };
const BUS_MAKEUP = 1.25;   // +1.94 dB，补回慢压缩吃掉的静态响度
const PEAK_LIMITER = { threshold: -1, knee: 12, ratio: 20, attack: 0.004, release: 0.4 };

/**
 * 枪尾按区（第一人称分层）。近/远本体之外再追一条**尾巴**：
 * 同一把枪在屋里、院里、街上、旷野上，区别几乎全在尾巴上
 * （本体那 5 ms 的瞬态在哪儿都差不多）。
 * courtyard 与 street 共用一条 —— 院墙与街墙是同一种反射面，
 * 分四套素材只会让素材量翻倍而听不出差别。
 */
const GUN_TAIL_ZONE = { interior: "Interior", courtyard: "Street", street: "Street", open: "Open" };
const GUN_TAIL_CLASS = { rifle: "Rifle", mg: "Mg" };
/** 尾巴相对本体的电平。它是垫在本体后面的一层，站到本体前面就成了另一把枪。 */
const GUN_TAIL_GAIN = 0.55;

/** dB → 线性增益。 */
function DbGain(db) { return Math.pow(10, db / 20); }

/** 遮挡度 → 低通截止。occ = 0 时是 20 kHz（等于不存在），occ = 1 时是 OCCLUSION_LP_HZ。 */
function OcclusionCut(occ) {
  if (!(occ > 0)) return 20000;
  return 20000 * Math.pow(OCCLUSION_LP_HZ / 20000, Clamp01(occ));
}

/** Panner inverse curve; use the actual source reference distance for voice stealing. */
function DryFalloff(distance, refDistance = 3.5) {
  return refDistance / (refDistance + 0.9 * Math.max(0, distance - refDistance));
}

/**
 * PannerNode 的**最小距离**：比这更近的声源沿自己的方向推出去（见 Play 里的注释）。
 * 不改电平（inverse 在 refDistance 以内恒 1），改的是 HRTF 的极端方位着色。
 */
const PANNER_MIN_M = 1.0;
function ClampNearField(position, listener, distance) {
  if (!(distance < PANNER_MIN_M)) return position;
  const dx = position.x - listener.x, dy = position.y - listener.y, dz = position.z - listener.z;
  const d = Math.hypot(dx, dy, dz);
  // 正好压在听者头上时没有方向可推，往前推一米（前方是这一档唯一不会误导的方位）。
  if (!(d > 1e-4)) return { x: listener.x, y: listener.y, z: listener.z - PANNER_MIN_M };
  const k = PANNER_MIN_M / d;
  return { x: listener.x + dx * k, y: listener.y + dy * k, z: listener.z + dz * k };
}

// ---------------------------------------------------------------------------
// 噪声缓冲：白/粉/棕。按「种类 + 时长档」缓存，一次生成反复用。
// 变化靠播放时的随机 offset，而不是每次重新生成（生成 4 秒 48k 的噪声要 8ms，
// 开一枪卡 8ms 就是掉帧）。
// ---------------------------------------------------------------------------
function FillWhite(data, rng) {
  for (let i = 0; i < data.length; i += 1) data[i] = rng() * 2 - 1;
}

// Paul Kellet 的粉噪近似。粉噪比白噪更像「空气 / 远处的轰鸣」，
// 白噪听着永远像电视雪花。
function FillPink(data, rng) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i += 1) {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    data[i] = out * 0.11;
  }
}

// 棕噪（-6 dB/oct）：风、远处炮火的底噪都靠它，粉噪还是太亮。
function FillBrown(data, rng) {
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const w = rng() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    data[i] = last * 3.2;
  }
}

// ---------------------------------------------------------------------------
// 卷积混响的脉冲响应，现场算。**四档**，按声源所在的区选（见 AudioEngine.SourceZone）。
//
// interior（屋里）：0.5 s。反射极密（墙就在两三米外）、高频掉得极快 ——
//   土墙、泥顶、席子、麦秸，鲁南的民房几乎没有硬反射面。
//   「屋里那一枪」的辨识度全在**衰减快 + 闷**这两件事上，不在时长。
// courtyard（院子）：0.7 s。四面墙但头顶开着，所以比屋里长、比街上干，
//   而且没有街巷那种平行墙的颤动回声。
// street（街巷）：0.95 s，早期反射密集且极短 —— 两侧墙相距几米，40 ms 内就糊成一片。
// open（开阔地/运河边）：2.6 s，早期反射稀疏但拖得长，能听出「一枪在旷野里散开」。
//
// 这四条 IR 是「近枪声 vs 远枪声」之外，第二个让人分辨得出场景的线索。
// street / open 两档的参数与采样值**与 2026-08-20 那一版逐样本相同**
// （damp === 1 时那只一阶低通是恒等的，随机流的消耗顺序也没动）——
// 加两档不许顺手改掉已经调好的两档。
// ---------------------------------------------------------------------------
const IMPULSE_KINDS = {
  //                   秒    稀疏度  衰减   高频阻尼(1 = 不阻尼)  早期反射(秒)
  interior: { seconds: 0.50, density: 1.0, decay: 11.0, damp: 0.30,
    taps: [0.003, 0.006, 0.009, 0.013, 0.017, 0.022], tapLevel: 0.95, tapFall: 0.13 },
  courtyard: { seconds: 0.70, density: 1.0, decay: 9.0, damp: 0.55,
    taps: [0.008, 0.014, 0.021, 0.029, 0.038, 0.048], tapLevel: 0.9, tapFall: 0.12 },
  street: { seconds: 0.95, density: 1.0, decay: 7.5, damp: 1,
    taps: [0.006, 0.011, 0.017, 0.023, 0.031, 0.038], tapLevel: 0.85, tapFall: 0.11 },
  open: { seconds: 2.60, density: 0.22, decay: 2.2, damp: 1, taps: null },
};

function BuildImpulse(ctx, kind, seed) {
  const sr = ctx.sampleRate;
  const cfg = IMPULSE_KINDS[kind] || IMPULSE_KINDS.street;
  const isOpen = kind === "open";
  const len = Math.floor(sr * cfg.seconds);
  const buffer = ctx.createBuffer(2, len, sr);
  const density = cfg.density;
  const decay = cfg.decay;
  // 一阶低通的系数。damp === 1 时 y = x，逐样本恒等 —— street / open 因此没动。
  const damp = Clamp(cfg.damp, 0.02, 1);

  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    // 左右两声道用不同随机流，不然混响是「单声道贴在正中」，空间感全没了。
    const chRng = Mulberry32((seed ^ (ch * 0x9e3779b1)) >>> 0);
    let lp = 0;
    for (let i = 0; i < len; i += 1) {
      const t = i / len;
      if (density < 1 && chRng() > density) { data[i] = 0; continue; }
      const env = Math.pow(1 - t, 1.6) * Math.exp(-decay * t);
      // 高频阻尼在包络**之前**：吸声吃的是反射本身，不是整条尾巴的音量。
      const raw = chRng() * 2 - 1;
      lp = lp + damp * (raw - lp);
      data[i] = (damp === 1 ? raw : lp) * env;
    }
    // 早期反射：几个离散的强反射钉在几毫秒到几十毫秒上。
    // 没有这几下的话，卷积出来只是一团糊的 reverb，不像「墙就在旁边」。
    if (cfg.taps) {
      const taps = cfg.taps;
      for (let k = 0; k < taps.length; k += 1) {
        const idx = Math.floor(taps[k] * sr) + Math.floor(chRng() * 40);
        if (idx < len) data[idx] += (chRng() * 2 - 1) * (cfg.tapLevel - k * cfg.tapFall);
      }
    } else if (isOpen) {
      // 开阔地：一下很晚的「拍岸」回声（远处房子/河堤），给尾巴一个落点。
      const idx = Math.floor(0.34 * sr);
      if (idx < len) data[idx] += (chRng() * 2 - 1) * 0.5;
    }
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// 波形整形曲线：给枪口爆音做软削顶。
// 纯噪声包络出来的「啪」是干净的，但真实枪声的瞬态是过载的 —— 削顶才有「炸」感。
// ---------------------------------------------------------------------------
/**
 * 母线软削顶曲线。
 *
 * **不能拿 BuildShaperCurve 当限幅器用** —— 它是 tanh(x*k)/tanh(k)，在小信号处
 * 斜率是 5 倍，接上母线整场音量直接失控（实拍时所有音效峰值一起跳到 1.0 以上，
 * 比不接还糟）。限幅要的是「阈值以下原样通过、阈值以上才弯」：
 *   |x| <= knee            y = x
 *   |x| >  knee            y = knee + (1-knee) * tanh((|x|-knee)/(1-knee))
 * **曲线表的定义域必须正好是 -1..1**：WaveShaper 是把输入的 -1..1 摊到整张表上的，
 * 表里存 -3..3 的话就等于把中间那段拉开三倍 —— 实拍时所有音效反而一起冲破 1.0，
 * 「限幅器」当场变成了三倍增益的失真器。超过 ±1 的输入由 WaveShaper 自己钳到
 * 端点值，也就是这里的天花板 0.93，所以永远削不出方波。
 */
function BuildSoftClipCurve(knee = 0.7) {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee));
    curve[i] = x < 0 ? -y : y;
  }
  return curve;
}

function BuildShaperCurve(amount) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount * 40 + 1;
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return curve;
}

// ---------------------------------------------------------------------------
// 周期波形（PeriodicWave）。
// 为什么不用加法合成的一堆 OscillatorNode：冲锋号一次要吹八九个音，每个音四五个
// 泛音就是四十个节点，直接吃掉三分之一预算。PeriodicWave 把整条泛音列塞进
// **一个** 振荡器，音色一样，节点数除以五。
// ---------------------------------------------------------------------------
function HarmonicWave(ctx, amps) {
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  for (let i = 0; i < amps.length; i += 1) imag[i + 1] = amps[i];
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// 铜管：泛音列在 3—8 次上有明显的「铜」共振峰（brass formant）。
// 不做这个包，出来的就是方波军号 —— 廉价合成器味，正是要避开的东西。
const BRASS_PARTIALS = [1.0, 0.62, 0.48, 0.42, 0.46, 0.40, 0.30, 0.22, 0.15, 0.10, 0.06, 0.04];
// 弓弦/胡琴：奇偶都有但衰减快，靠共振峰做音色，波形本身别太亮。
const STRING_PARTIALS = [1.0, 0.55, 0.36, 0.20, 0.14, 0.09, 0.06, 0.03];
// 低音提琴：几乎只有低次泛音，高次留给滤波器去决定。
const BASS_PARTIALS = [1.0, 0.42, 0.22, 0.11, 0.06, 0.03];

// ---------------------------------------------------------------------------
// 包络工具
// ---------------------------------------------------------------------------
/** 冲击型包络：极快起音 + 指数衰减。枪声/撞击全靠它。 */
function Hit(param, t, peak, attack, decay) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(peak, FLOOR * 2), t + attack);
  param.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
}

/** 有保持段的包络：哨子、号、乐音用。 */
function Swell(param, t, peak, attack, hold, release) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(peak, FLOOR * 2), t + attack);
  param.setValueAtTime(Math.max(peak, FLOOR * 2), t + attack + hold);
  param.exponentialRampToValueAtTime(FLOOR, t + attack + hold + release);
}

/** 频率下滑（指数，听感才是线性的）。 */
function Glide(param, t, from, to, seconds) {
  param.setValueAtTime(Math.max(from, 1), t);
  param.exponentialRampToValueAtTime(Math.max(to, 1), t + seconds);
}

// ===========================================================================
// Voice：一次发声的节点作用域。
// 所有节点都必须经它的工厂方法创建，这样才有统一的计数与回收 —— 手工 new 出来的
// 节点没人 disconnect，几分钟就泄漏满了（Chrome 不会替你收还在 connect 的节点）。
// ===========================================================================
class Voice {
  constructor(engine, startTime, pitch, rng, offset = 0, maxDuration = Infinity) {
    this.engine = engine;
    this.ctx = engine.ctx;
    this.t = startTime;
    this.pitch = pitch;
    this.rng = rng;
    // Timeline seek 只对采样源有“从中间开始”的语义。合成配方照常从头构造，
    // 外部人声配方在 Start() 时显式消费这份偏移。
    this.offset = Math.max(0, Number(offset) || 0);
    this.maxDuration = maxDuration > 0 ? maxDuration : Infinity;
    this.duration = 0;
    this.nodes = [];
    this.life = 0.6;          // 秒；配方可以往上抬
    this.out = null;          // 由 Play 建好后塞进来
    this.wetGain = null;      // 混响 send，配方可调
    this.wetScale = 1;        // 距离对混响占比的加成，Play 在配方跑完后乘上去
    // --- 以下由 Play 填，voice stealing 与取证要读（见 StealVoices）---------
    this.name = "";
    this.priority = false;
    this.startAt = startTime;   // 排定的**到耳朵的时刻**（含传播延迟）
    this.propagation = 0;       // 其中有多少是传播延迟
    this.distance = 0;          // 起播时到听者的距离
    this.effectiveGain = 1;     // volume × 混音表 × 干声距离系数 —— 偷谁按它排
    this.baseGain = undefined;  // 上面那份还没乘距离系数的，MoveVoice 用
    this.airOcc = undefined;    // 遮挡给的低通上限（MoveVoice 重查后写）
    this.wetOcc = undefined;    // 遮挡给的湿声系数
    this.occ = 0;               // 起播时的遮挡度
    this.occGain = null;        // 遮挡的干声衰减节点（occ > 0 时才建）
    this.occAt = -1;            // 上一次重查遮挡的时刻（MoveVoice 用）
    this.reverbZone = null;     // 送去了哪一档混响
    this.reverbNode = null;
    this.reclaimed = false;     // 被偷了：预算已经在偷的那一刻还回去了，FreeVoice 不许再还一次
  }

  /** 登记节点，纳入预算与回收。 */
  Own(node) {
    this.nodes.push(node);
    this.engine.liveNodes += 1;
    return node;
  }

  /** 声明这个 voice 要活多久（用于回收计时）。 */
  Live(seconds) {
    if (seconds > this.life) this.life = seconds;
    return seconds;
  }

  /** 应用音高倍率。所有写死的 Hz 都要过这里。 */
  F(hz) { return hz * this.pitch; }

  /** 随机区间（确定性）。 */
  R(lo, hi) { return lo + (hi - lo) * this.rng(); }

  Gain(value = 1) {
    const n = this.ctx.createGain();
    n.gain.value = value;
    return this.Own(n);
  }

  Filter(type, freq, q = 1) {
    const n = this.ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = freq;
    n.Q.value = q;
    return this.Own(n);
  }

  Osc(type, freq) {
    const n = this.ctx.createOscillator();
    if (typeof type === "string") n.type = type; else n.setPeriodicWave(type);
    n.frequency.value = freq;
    return this.Own(n);
  }

  Delay(seconds) {
    const n = this.ctx.createDelay(Math.max(0.05, seconds * 2));
    n.delayTime.value = seconds;
    return this.Own(n);
  }

  Shaper(amount) {
    const n = this.ctx.createWaveShaper();
    n.curve = this.engine.ShaperCurve(amount);
    n.oversample = "2x";
    return this.Own(n);
  }

  /** 噪声源。offset 用确定性随机取，同一段缓冲反复用也不会听出复读。 */
  Noise(kind, seconds) {
    const buffer = this.engine.NoiseBuffer(kind);
    const n = this.ctx.createBufferSource();
    n.buffer = buffer;
    const maxOffset = Math.max(0, buffer.duration - seconds - 0.01);
    n.__offset = maxOffset * this.rng();
    n.__dur = seconds;
    return this.Own(n);
  }

  /** 启动一个源节点（Osc / BufferSource），并把 voice 寿命推到它之后。 */
  Start(node, at, duration, offset = node.__offset || 0) {
    const t = at ?? this.t;
    if (node.buffer) node.start(t, offset, duration ?? node.__dur ?? Math.max(0.01, node.buffer.duration - offset));
    else node.start(t);
    const stop = t + (duration ?? node.__dur ?? 1);
    if (node.stop) node.stop(stop + 0.02);
    this.Live(stop - this.t + 0.05);
    return node;
  }
}

// ===========================================================================
// 冲锋号的动机。**合成版与采样版共用同一张谱**：
// 换成实录军号之后，音色是美军军乐队的，调子仍然必须是中方的这一条 ——
// 直接播一段美军 Charge 号，听着就是另一支军队在冲锋。
// 泛音列 3、4、5、6 次 = sol、do、mi、sol；军号没有活塞，只有这四个音能吹。
// 三连音一层层往上冲、落在长音上 —— 冲锋号的骨架是「催」，不是旋律。
// ===========================================================================
const BUGLE_G4 = 392.0, BUGLE_C5 = 523.25, BUGLE_E5 = 659.25, BUGLE_G5 = 783.99;
const BUGLE_CHARGE = [
  [0.00, BUGLE_G4, 0.10], [0.12, BUGLE_C5, 0.10], [0.24, BUGLE_E5, 0.10], [0.36, BUGLE_G5, 0.30],
  [0.70, BUGLE_E5, 0.09], [0.81, BUGLE_G5, 0.09], [0.92, BUGLE_E5, 0.09], [1.03, BUGLE_C5, 0.24],
  [1.32, BUGLE_G4, 0.09], [1.43, BUGLE_C5, 0.09], [1.54, BUGLE_E5, 0.09], [1.65, BUGLE_G5, 0.62],
];

// ===========================================================================
// 声音配方
// 每个配方签名 (A: AudioEngine, v: Voice)，把节点接到 v.out。
// ===========================================================================

/**
 * 枪声通用骨架 —— 近距离。三段式，缺一段都会退化成「啪」一下的塑料音：
 *   1) 爆音瞬态：宽带噪声过削顶 + 一记低频冲击（火药气体推出来的那一下）
 *   2) 机械声  ：枪机/枪管的金属共振，比爆音晚 15—25ms
 *   3) 环境尾  ：低电平噪声 + 大量混响 send，尾巴的长短就是「这是巷子还是旷野」
 */
function GunNear(A, v, p) {
  const t = v.t;
  const out = v.out;

  // --- 1) 低频冲击 ---------------------------------------------------------
  const thump = v.Osc("sine", v.F(p.thumpHi));
  Glide(thump.frequency, t, v.F(p.thumpHi), v.F(p.thumpLo), p.thumpDur);
  const thumpGain = v.Gain(FLOOR);
  Hit(thumpGain.gain, t, p.thumpLevel, 0.001, p.thumpDur);
  thump.connect(thumpGain).connect(out);
  v.Start(thump, t, p.thumpDur + 0.03);

  // --- 1b) 爆音（削顶的宽带噪声）------------------------------------------
  const blastSrc = v.Noise("white", 0.16);
  const blastBand = v.Filter("bandpass", v.F(p.blastFreq), p.blastQ);
  const shaper = v.Shaper(p.drive);
  const blastGain = v.Gain(FLOOR);
  Hit(blastGain.gain, t, p.blastLevel, 0.0008, p.blastDecay);
  // 爆音的频心在头 20ms 内往下掉（气体膨胀），固定频心听着像打火机。
  blastBand.frequency.setValueAtTime(v.F(p.blastFreq * 1.7), t);
  blastBand.frequency.exponentialRampToValueAtTime(v.F(p.blastFreq * 0.7), t + 0.03);
  blastSrc.connect(blastBand).connect(shaper).connect(blastGain).connect(out);
  v.Start(blastSrc, t, 0.16);

  // --- 2) 机械共振 ---------------------------------------------------------
  const mechSrc = v.Noise("white", 0.07);
  const mechBand = v.Filter("bandpass", v.F(p.mechFreq * v.R(0.94, 1.07)), 9);
  const mechGain = v.Gain(FLOOR);
  Hit(mechGain.gain, t + 0.018, p.mechLevel, 0.002, 0.055);
  mechSrc.connect(mechBand).connect(mechGain).connect(out);
  v.Start(mechSrc, t + 0.018, 0.07);

  // --- 3) 环境尾 -----------------------------------------------------------
  // 拥挤时（同屏一排人在打）砍掉这一层：混响 send 还在，尾巴不会真的消失，
  // 只是少一条噪声垫。让第八条枪响不出来，比让它响得完整重要得多。
  if (A.liveNodes > A.nodeBudget * 0.55) {
    v.wetGain.gain.value = p.wet * 1.25;   // 少了噪声垫，用混响补回来一点
    v.Live(0.5);
    return;
  }
  const tailSrc = v.Noise("pink", p.tailDur);
  const tailLp = v.Filter("lowpass", v.F(1600), 0.7);
  Glide(tailLp.frequency, t, v.F(1600), v.F(280), p.tailDur * 0.8);
  const tailGain = v.Gain(FLOOR);
  Hit(tailGain.gain, t + 0.01, p.tailLevel, 0.008, p.tailDur);
  tailSrc.connect(tailLp).connect(tailGain).connect(out);
  v.Start(tailSrc, t + 0.01, p.tailDur);

  v.wetGain.gain.value = p.wet;
  v.Live(p.tailDur + 0.4);
}

/**
 * 枪声 —— 远距离。**不是把近枪声调小**，是另一种声音：
 * 空气把低频以外的东西吃掉（几百米上高频衰减是低频的十几倍），
 * 剩下的是一记扁的「啪」，紧跟一下墙面反射回来的「嗒」，然后是很长的尾。
 * 玩家判断「这枪打的是不是我」全靠这个差别。
 */
function GunFar(A, v, p) {
  const t = v.t;
  const out = v.out;

  const crackSrc = v.Noise("white", 0.09);
  const band = v.Filter("bandpass", v.F(p.farFreq), 1.1);
  const hp = v.Filter("highpass", v.F(240), 0.7);
  const crackGain = v.Gain(FLOOR);
  Hit(crackGain.gain, t, 0.55, 0.001, 0.035);
  crackSrc.connect(band).connect(hp).connect(crackGain).connect(out);
  v.Start(crackSrc, t, 0.09);

  // 反射回来的「嗒」：延迟 55—120ms，比头音闷。
  // 这一下是「远」的关键线索 —— 只有远处的枪，直达声和反射声才分得开。
  const slapDelay = v.Delay(v.R(0.055, 0.12));
  const slapLp = v.Filter("lowpass", v.F(900), 0.6);
  const slapGain = v.Gain(0.45);
  crackGain.connect(slapDelay).connect(slapLp).connect(slapGain).connect(out);

  const tailSrc = v.Noise("brown", 1.5);
  const tailLp = v.Filter("lowpass", v.F(700), 0.5);
  const tailGain = v.Gain(FLOOR);
  Hit(tailGain.gain, t + 0.02, 0.16, 0.03, 1.4);
  tailSrc.connect(tailLp).connect(tailGain).connect(out);
  v.Start(tailSrc, t + 0.02, 1.5);

  v.wetGain.gain.value = 0.85;   // 远枪声几乎全是混响
  v.Live(2.0);
}

/** 金属机件的「咔哒」：一记极短的带通共振。栓、保险、扳机都用它。 */
function MetalClick(v, at, freq, level, decay = 0.045, q = 14) {
  const src = v.Noise("white", 0.05);
  const band = v.Filter("bandpass", v.F(freq), q);
  const g = v.Gain(FLOOR);
  Hit(g.gain, at, level, 0.001, decay);
  src.connect(band).connect(g).connect(v.out);
  v.Start(src, at, 0.05);
}

/** 金属摩擦：带通噪声 + 频心缓升，像钢件在钢件里蹭过去。 */
function MetalScrape(v, at, dur, fromHz, toHz, level) {
  const src = v.Noise("white", dur);
  const band = v.Filter("bandpass", v.F(fromHz), 3.2);
  Glide(band.frequency, at, v.F(fromHz), v.F(toHz), dur);
  const g = v.Gain(FLOOR);
  Swell(g.gain, at, level, 0.01, dur * 0.55, dur * 0.4);
  src.connect(band).connect(g).connect(v.out);
  v.Start(src, at, dur);
}

/** 闷响低频冲击。爆炸、脚步、倒地共用。 */
function Thud(v, at, hiHz, loHz, dur, level, lp = 260) {
  const osc = v.Osc("sine", v.F(hiHz));
  Glide(osc.frequency, at, v.F(hiHz), v.F(loHz), dur);
  const filter = v.Filter("lowpass", v.F(lp), 0.9);
  const g = v.Gain(FLOOR);
  Hit(g.gain, at, level, 0.002, dur);
  osc.connect(filter).connect(g).connect(v.out);
  v.Start(osc, at, dur + 0.05);
}

/**
 * 一串极短的颗粒（碎屑撒落、桥夹里互相磕碰的弹壳、抛壳）。
 *
 * **一条噪声链打 N 个包络钉，不是 N 条链**。早先每颗粒各建 noise+band+gain，
 * 一次爆炸光碎屑就 27 个节点，占掉四分之一预算；合成一条之后是 3 个。
 * 听感没有损失 —— 这些颗粒本来就不需要各自独立的音色。
 */
function Ticks(v, at, count, spread, freqLo, freqHi, level, decay = 0.025, q = 7) {
  const dur = spread + decay + 0.06;
  const src = v.Noise("white", dur);
  const band = v.Filter("bandpass", v.F(freqHi), q);
  const g = v.Gain(FLOOR);
  src.connect(band).connect(g).connect(v.out);
  for (let i = 0; i < count; i += 1) {
    // 时间点必须严格递增：自动化事件是按时间排的，往回插会把前一段的衰减硬截断
    // （听上去就是一记「咔」）。所以用「均分槽 + 槽内抖动」而不是纯随机再排序。
    const t = at + spread * (i + v.rng() * 0.85) / count;
    band.frequency.setValueAtTime(v.F(v.R(freqLo, freqHi)), t);
    Hit(g.gain, t, level * v.R(0.5, 1), 0.001, decay);
  }
  v.Start(src, at, dur);
  return dur;
}

/** 碎屑撒落 —— Ticks 的语义别名，读配方时更直观。 */
function Grains(v, at, count, spread, freqLo, freqHi, level) {
  return Ticks(v, at, count, spread, freqLo, freqHi, level, 0.022, 6);
}

/**
 * 连发。**整条点射共用一套发声链**，只在包络上打 N 个钉子 ——
 * 一挺机枪物理上就是一个声源，逐发各建一套 GunNear 的话，一梭子四发实测吃掉
 * 64 个节点（半个预算）。合成之后不到 15 个，而且听感更连贯：
 * 环境尾本来就该是连续的一条，不是四条尾巴叠在一起。
 */
function GunAuto(A, v, p, shots, interval) {
  const t0 = v.t;
  const span = interval * (shots - 1);
  const srcDur = span + 0.25;

  // 爆音层
  const blast = v.Noise("white", srcDur);
  const band = v.Filter("bandpass", v.F(p.blastFreq), p.blastQ);
  const shaper = v.Shaper(p.drive);
  const blastGain = v.Gain(FLOOR);
  blast.connect(band).connect(shaper).connect(blastGain).connect(v.out);

  // 低频冲击层
  const thump = v.Osc("sine", v.F(p.thumpHi));
  const thumpGain = v.Gain(FLOOR);
  thump.connect(thumpGain).connect(v.out);

  // 机械层：抛壳、供弹机构。自动武器的「哒哒」有一半是这一层给的。
  const mech = v.Noise("white", srcDur);
  const mechBand = v.Filter("bandpass", v.F(p.mechFreq), 8);
  const mechGain = v.Gain(FLOOR);
  mech.connect(mechBand).connect(mechGain).connect(v.out);

  for (let i = 0; i < shots; i += 1) {
    const at = t0 + i * interval;
    // 逐发的微小抖动：机枪连发每一发的膛压其实不一样，全等的话像鼓机。
    Hit(blastGain.gain, at, p.blastLevel * v.R(0.88, 1.06), 0.0008, p.blastDecay);
    band.frequency.setValueAtTime(v.F(p.blastFreq * v.R(1.5, 1.8)), at);
    band.frequency.exponentialRampToValueAtTime(v.F(p.blastFreq * 0.72), at + Math.min(0.03, interval * 0.4));
    Glide(thump.frequency, at, v.F(p.thumpHi * v.R(0.96, 1.04)), v.F(p.thumpLo), p.thumpDur);
    Hit(thumpGain.gain, at, p.thumpLevel, 0.001, p.thumpDur);
    Hit(mechGain.gain, at + p.mechDelay, p.mechLevel * v.R(0.75, 1.1), 0.002, 0.05);
  }
  v.Start(blast, t0, srcDur);
  v.Start(mech, t0, srcDur);
  v.Start(thump, t0, srcDur);

  // 环境尾：整条点射一条，跟着停火一起收。
  const tail = v.Noise("pink", span + p.tailDur + 0.1);
  const tailLp = v.Filter("lowpass", v.F(1500), 0.7);
  Glide(tailLp.frequency, t0, v.F(1500), v.F(300), span + p.tailDur * 0.8);
  const tailGain = v.Gain(FLOOR);
  Swell(tailGain.gain, t0 + 0.01, p.tailLevel, 0.02, span, p.tailDur);
  tail.connect(tailLp).connect(tailGain).connect(v.out);
  v.Start(tail, t0 + 0.01, span + p.tailDur + 0.1);

  v.wetGain.gain.value = p.wet;
  v.Live(span + p.tailDur + 0.45);
}

const RECIPES = {
  // --- 步枪 ---------------------------------------------------------------
  // 中正式/汉阳造：7.92×57，弹头重、装药多，爆音低沉，胸口能感觉到那一下。
  rifleNra(A, v) {
    GunNear(A, v, {
      thumpHi: 128, thumpLo: 52, thumpDur: 0.11, thumpLevel: 0.85,
      blastFreq: 1500, blastQ: 0.55, blastLevel: 0.95, blastDecay: 0.075, drive: 0.55,
      mechFreq: 3600, mechLevel: 0.10,
      tailDur: 0.9, tailLevel: 0.10, wet: 0.42,
    });
  },
  rifleNraFar(A, v) { GunFar(A, v, { farFreq: 820 }); },

  // 三八式：6.5×50 是小口径长弹，膛压高而药量小 —— 中方老兵记它「又尖又脆」，
  // 所以频心整体上抬，低频冲击砍掉一半，衰减更快。这条是敌我辨识的听觉线索。
  rifleIja(A, v) {
    GunNear(A, v, {
      thumpHi: 165, thumpLo: 78, thumpDur: 0.065, thumpLevel: 0.44,
      blastFreq: 2700, blastQ: 0.75, blastLevel: 0.92, blastDecay: 0.045, drive: 0.68,
      mechFreq: 5200, mechLevel: 0.14,
      tailDur: 0.68, tailLevel: 0.075, wet: 0.38,
    });
  },
  rifleIjaFar(A, v) { GunFar(A, v, { farFreq: 1250 }); },

  // --- 自动火器 -----------------------------------------------------------
  // 捷克式 ZB26：500 rpm = 0.12 s 一发。上方弹匣，抛壳口在下 —— 每发后面挂一记
  // 弹壳落地的叮，是这挺枪最好认的细节。
  zb26(A, v) {
    const shots = Clamp(v.burst ?? 3, 1, 12);
    GunAuto(A, v, {
      thumpHi: 120, thumpLo: 54, thumpDur: 0.07, thumpLevel: 0.6,
      blastFreq: 1700, blastQ: 0.6, blastLevel: 0.8, blastDecay: 0.05, drive: 0.6,
      mechFreq: 3900, mechLevel: 0.16, mechDelay: 0.022,
      tailDur: 0.55, tailLevel: 0.07, wet: 0.35,
    }, shots, 60 / 500);
    // 抛壳口在下方，弹壳一颗颗掉在砖地上 —— 捷克式最好认的细节。
    if (shots > 1) Ticks(v, v.t + 0.16, shots, shots * 0.12, 3800, 6400, 0.055, 0.045, 9);
  },

  // 十一年式：同样 500 rpm，但漏斗供弹机构松散，机械噪声比捷克式重得多。
  type11(A, v) {
    const shots = Clamp(v.burst ?? 4, 1, 12);
    GunAuto(A, v, {
      thumpHi: 150, thumpLo: 74, thumpDur: 0.05, thumpLevel: 0.34,
      blastFreq: 2900, blastQ: 0.8, blastLevel: 0.72, blastDecay: 0.035, drive: 0.66,
      // 漏斗供弹的压弹板一路拍打，机械噪声比捷克式重得多，delay 也更靠前。
      mechFreq: 5600, mechLevel: 0.22, mechDelay: 0.012,
      tailDur: 0.45, tailLevel: 0.055, wet: 0.32,
    }, shots, 60 / 500);
  },

  // 九二式重机枪：**实际射速约 200 发/分 = 0.30 s 一发**。
  // 这个慢节奏是它的身份证，中方回忆里就叫它「啄木鸟」。做快了就成了 MG42，
  // 整场战斗的听感年代都会错。7.7 mm 弹加上 55 kg 的枪架，每发还要带一记
  // 三脚架的金属余振。
  type92(A, v) {
    const shots = Clamp(v.burst ?? 4, 1, 14);
    const interval = 60 / 200;            // 200 发/分 = 0.30 s，「啄木鸟」的间隔
    GunAuto(A, v, {
      thumpHi: 140, thumpLo: 60, thumpDur: 0.1, thumpLevel: 0.8,
      blastFreq: 2100, blastQ: 0.6, blastLevel: 0.9, blastDecay: 0.06, drive: 0.7,
      mechFreq: 4400, mechLevel: 0.24, mechDelay: 0.03,
      tailDur: 0.75, tailLevel: 0.09, wet: 0.4,
    }, shots, interval);
    // 55 kg 的三脚架被每一发顶得嗡一下。这条金属余振是「重机枪」和「轻机枪」
    // 在听感上真正的分界 —— 只靠射速慢的话，会被当成有人在慢慢点射。
    const ring = v.Osc("triangle", v.F(470));
    const ringGain = v.Gain(FLOOR);
    ring.connect(ringGain).connect(v.out);
    for (let i = 0; i < shots; i += 1) {
      const at = v.t + i * interval;
      ring.frequency.setValueAtTime(v.F(v.R(430, 520)), at);
      Hit(ringGain.gain, at + 0.012, 0.05, 0.003, Math.min(0.2, interval * 0.7));
    }
    v.Start(ring, v.t, (shots - 1) * interval + 0.25);
  },

  // --- 操作音 -------------------------------------------------------------
  // 拉栓：抬柄的一记轻响 → 拉到底的金属摩擦 → 推回闭锁的「咔哒」。
  // 三段之间的间隔就是 boltTimeS 里那 1.05 秒的手感来源。
  bolt(A, v) {
    MetalClick(v, v.t, 2900, 0.16, 0.03);
    MetalScrape(v, v.t + 0.03, 0.15, 1400, 2600, 0.13);
    MetalClick(v, v.t + 0.22, 3400, 0.2, 0.05, 16);
    MetalScrape(v, v.t + 0.26, 0.13, 2400, 1300, 0.10);
    MetalClick(v, v.t + 0.42, 2200, 0.26, 0.06, 11);   // 闭锁
    v.wetGain.gain.value = 0.14;
    v.Live(0.6);
  },

  // 桥夹压弹：黄铜弹壳互相磕碰，五发一串的碎响 + 拇指压下去的一记闷。
  stripperLoad(A, v) {
    MetalClick(v, v.t, 2400, 0.13, 0.05, 9);
    Ticks(v, v.t + 0.06, 5, 0.17, 3200, 5400, 0.07, 0.028, 8);   // 五发弹壳互相磕碰
    MetalScrape(v, v.t + 0.22, 0.11, 2000, 3200, 0.09);
    Thud(v, v.t + 0.3, 190, 120, 0.08, 0.13, 500);
    MetalClick(v, v.t + 0.36, 1800, 0.14, 0.05, 12);
    v.wetGain.gain.value = 0.12;
    v.Live(0.55);
  },

  // 弹匣入位：一记闷的到位 + 卡笋的脆响 + 弹簧余音。
  magIn(A, v) {
    MetalScrape(v, v.t, 0.08, 1200, 1900, 0.1);
    Thud(v, v.t + 0.06, 240, 140, 0.09, 0.22, 600);
    MetalClick(v, v.t + 0.115, 2600, 0.26, 0.05, 15);
    const spring = v.Osc("triangle", v.F(1750));
    Glide(spring.frequency, v.t + 0.12, v.F(1750), v.F(1300), 0.12);
    const sg = v.Gain(FLOOR);
    Hit(sg.gain, v.t + 0.12, 0.045, 0.002, 0.12);
    spring.connect(sg).connect(v.out);
    v.Start(spring, v.t + 0.12, 0.14);
    v.wetGain.gain.value = 0.12;
    v.Live(0.4);
  },

  /**
   * 抛壳落地：一记落地 + 越来越密越来越轻的几下弹跳。
   *
   * 这条 cue 是 2026-08-20 补的。在此之前，栓动步枪每打一发，0.62 秒后播的是
   * `shellImpact` —— 「野外迫击炮爆炸实录」，2.8 秒长。**每一发都跟一记迫击炮**，
   * 这是「打起来就一片不知道哪儿来的拖尾」里最响、也最容易听出来的一条。
   *
   * 弹壳是**很轻的一样东西**（一个空黄铜壳二十克），所以电平压得极低：
   * 它是玩法反馈的边料，不是事件。
   */
  shellDrop(A, v) {
    // 第一记落地最重，后面几下按 0.62 递减、间隔也越缩越短（弹跳的物理）。
    let at = v.t, level = 0.20, gap = 0.085;
    for (let i = 0; i < 5; i += 1) {
      MetalClick(v, at, v.R(2400, 4200), level, 0.035 + v.rng() * 0.02, 11);
      at += gap * (0.7 + v.rng() * 0.6);
      level *= 0.62;
      gap *= 0.78;
    }
    // 最后在地上滚两下：一小串更碎的颗粒。
    Ticks(v, at, 4, 0.16, 3200, 5600, 0.045, 0.018, 9);
    v.wetGain.gain.value = 0.1;
    v.Live(0.8);
  },

  // 拉弦（木柄手榴弹是拉火不是拔销，但沿用契约名）：细金属的一声「叮」+ 火帽的嘶。
  grenadePin(A, v) {
    MetalClick(v, v.t, 3900, 0.2, 0.07, 20);
    MetalClick(v, v.t + 0.05, 5200, 0.12, 0.05, 22);
    const hiss = v.Noise("white", 0.12);
    const hp = v.Filter("highpass", v.F(5200), 0.8);
    const g = v.Gain(FLOOR);
    Hit(g.gain, v.t + 0.07, 0.06, 0.01, 0.1);
    hiss.connect(hp).connect(g).connect(v.out);
    v.Start(hiss, v.t + 0.07, 0.12);
    v.wetGain.gain.value = 0.1;
    v.Live(0.3);
  },

  // 投掷：袖子/棉衣带起的风声，中间夹一记木柄离手的轻响。
  grenadeThrow(A, v) {
    const src = v.Noise("pink", 0.36);
    const band = v.Filter("bandpass", v.F(600), 1.1);
    band.frequency.setValueAtTime(v.F(420), v.t);
    band.frequency.exponentialRampToValueAtTime(v.F(1500), v.t + 0.16);
    band.frequency.exponentialRampToValueAtTime(v.F(500), v.t + 0.34);
    const g = v.Gain(FLOOR);
    Swell(g.gain, v.t, 0.3, 0.09, 0.06, 0.18);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, v.t, 0.36);
    MetalClick(v, v.t + 0.15, 900, 0.08, 0.04, 5);
    v.wetGain.gain.value = 0.15;
    v.Live(0.45);
  },

  // --- 爆炸 ---------------------------------------------------------------
  // 近炸四层：次声冲击（20—60 Hz，胸口那一下）+ 宽带爆音 + 碎片撒落 + 长尾。
  // 层数少一层都会变成「网页游戏的爆炸」。
  explosionNear(A, v) {
    const t = v.t;
    // 1) 次声：58 → 22 Hz。低于 30 Hz 小喇叭放不出来，但耳机上就是「压」的来源。
    const sub = v.Osc("sine", v.F(58));
    Glide(sub.frequency, t, v.F(58), v.F(22), 0.55);
    const subGain = v.Gain(FLOOR);
    Hit(subGain.gain, t, 1.0, 0.006, 0.65);
    sub.connect(subGain).connect(v.out);
    v.Start(sub, t, 0.75);

    // 2) 爆音主体：削顶的宽带噪声，频心快速下滑（火球膨胀）。
    const body = v.Noise("white", 0.9);
    const lp = v.Filter("lowpass", v.F(4200), 0.7);
    Glide(lp.frequency, t, v.F(4200), v.F(420), 0.5);
    const drive = v.Shaper(0.75);
    const bodyGain = v.Gain(FLOOR);
    Hit(bodyGain.gain, t, 0.9, 0.003, 0.55);
    body.connect(lp).connect(drive).connect(bodyGain).connect(v.out);
    v.Start(body, t, 0.9);

    // 3) 碎片：砖屑瓦片在 0.15—1.0 s 之间稀稀拉拉落回地面。
    Grains(v, t + 0.12, 9, 0.85, 2600, 7000, 0.075);

    // 4) 长尾：轰鸣从街两头返回来。
    const tail = v.Noise("brown", 1.8);
    const tailLp = v.Filter("lowpass", v.F(600), 0.5);
    Glide(tailLp.frequency, t, v.F(600), v.F(150), 1.6);
    const tailGain = v.Gain(FLOOR);
    Hit(tailGain.gain, t + 0.05, 0.3, 0.05, 1.7);
    tail.connect(tailLp).connect(tailGain).connect(v.out);
    v.Start(tail, t + 0.05, 1.8);

    v.wetGain.gain.value = 0.7;
    v.Live(2.4);
    // 耳鸣与 duck **不在这里触发**（2026-09-08 搬走了）。
    // 原来是 `A.Deafen(0.42); A.Duck(1.1, 0.55);` 写在这条配方体内 ——
    // 采样一盖上去这条配方就再也不会被执行，于是正常路径下整局零 duck、零耳鸣。
    // 现在由 Play 按 DUCK_ON / DEAFEN_ON 统一触发，而且按听者距离缩放
    // （二百米外的一颗手榴弹不该把配乐压下去，也不该震聋玩家）。
  },

  // 远炸：只剩低频。高频在几百米上被空气吃干净了，听到的是闷的一记 + 很长的滚。
  explosionFar(A, v) {
    const t = v.t;
    const sub = v.Osc("sine", v.F(46));
    Glide(sub.frequency, t, v.F(46), v.F(20), 0.9);
    const sg = v.Gain(FLOOR);
    Hit(sg.gain, t, 0.5, 0.02, 1.0);
    sub.connect(sg).connect(v.out);
    v.Start(sub, t, 1.1);

    const body = v.Noise("brown", 1.6);
    const lp = v.Filter("lowpass", v.F(380), 0.6);
    Glide(lp.frequency, t, v.F(380), v.F(120), 1.4);
    const bg = v.Gain(FLOOR);
    Hit(bg.gain, t, 0.42, 0.03, 1.5);
    body.connect(lp).connect(bg).connect(v.out);
    v.Start(body, t, 1.6);

    v.wetGain.gain.value = 0.9;
    v.Live(2.2);
  },

  // 炮弹啸声：由远及近的下滑 + 音量渐强。
  // 掷弹筒的 warnLeadS 是 1.5 秒，玩家就靠这一声半决定往哪儿滚。
  shellIncoming(A, v) {
    const t = v.t;
    const dur = 1.7;
    const osc = v.Osc("triangle", v.F(1700));
    Glide(osc.frequency, t, v.F(1700), v.F(320), dur);
    // 第二条稍微失谐，出「呜——」的拍频；单条振荡器太干净，像防空警报。
    const osc2 = v.Osc("sine", v.F(1700 * 1.012));
    Glide(osc2.frequency, t, v.F(1700 * 1.012), v.F(320 * 1.03), dur);
    const g = v.Gain(FLOOR);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    const band = v.Filter("bandpass", v.F(1200), 1.4);
    Glide(band.frequency, t, v.F(1800), v.F(400), dur);
    osc.connect(band); osc2.connect(band);
    band.connect(g).connect(v.out);
    v.Start(osc, t, dur); v.Start(osc2, t, dur);

    // 破空的风噪，跟着一起近。
    const air = v.Noise("pink", dur);
    const ab = v.Filter("bandpass", v.F(2200), 0.9);
    Glide(ab.frequency, t, v.F(2600), v.F(700), dur);
    const ag = v.Gain(FLOOR);
    ag.gain.setValueAtTime(FLOOR, t);
    ag.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.9);
    ag.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
    air.connect(ab).connect(ag).connect(v.out);
    v.Start(air, t, dur);

    v.wetGain.gain.value = 0.5;
    v.Live(dur + 0.3);
  },

  // 落点：比 explosionNear 更「土」—— 泥土吸收高频，多一层被掀起来的土块。
  shellImpact(A, v) {
    const t = v.t;
    Thud(v, t, 90, 30, 0.5, 1.0, 180);
    const body = v.Noise("white", 0.7);
    const lp = v.Filter("lowpass", v.F(2200), 0.7);
    Glide(lp.frequency, t, v.F(2200), v.F(260), 0.4);
    const drive = v.Shaper(0.6);
    const bg = v.Gain(FLOOR);
    Hit(bg.gain, t, 0.75, 0.004, 0.45);
    body.connect(lp).connect(drive).connect(bg).connect(v.out);
    v.Start(body, t, 0.7);
    Grains(v, t + 0.18, 7, 0.7, 900, 3200, 0.09);
    const tail = v.Noise("brown", 1.4);
    const tg = v.Gain(FLOOR);
    Hit(tg.gain, t + 0.04, 0.24, 0.04, 1.3);
    const tlp = v.Filter("lowpass", v.F(400), 0.5);
    tail.connect(tlp).connect(tg).connect(v.out);
    v.Start(tail, t + 0.04, 1.4);
    v.wetGain.gain.value = 0.65;
    v.Live(1.9);
    // 同上：搬去 Play 了。这一条原来还写着 `A.Deafen(0.3)` ——
    // **几百米外的一记闷响把玩家的耳朵震了**，方向是反的。
    // explosionFar 现在根本不在 DEAFEN_ON 表里：远炸只压一点音乐（DUCK_ON，
    // 而且随距离缩到零），不碰耳朵。
  },

  // 掷弹筒发射：**闷响**，不是炮声。50 mm 短筒、装药少，出膛就是「咚」的一下，
  // 高频几乎没有 —— 这也是为什么被打的人往往先听见啸声、没听见发射。
  launcherPop(A, v) {
    const t = v.t;
    Thud(v, t, 170, 62, 0.22, 0.75, 420);
    const body = v.Noise("white", 0.16);
    const lp = v.Filter("lowpass", v.F(900), 0.8);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.4, 0.002, 0.14);
    body.connect(lp).connect(g).connect(v.out);
    v.Start(body, t, 0.16);
    v.wetGain.gain.value = 0.45;
    v.Live(0.7);
  },

  // --- 白刃 ---------------------------------------------------------------
  // 大刀挥空：带通频心先升后落，是刀身过耳的多普勒。
  dadaoSwing(A, v) {
    const t = v.t, dur = 0.34;
    const src = v.Noise("pink", dur);
    const band = v.Filter("bandpass", v.F(500), 2.2);
    band.frequency.setValueAtTime(v.F(430), t);
    band.frequency.exponentialRampToValueAtTime(v.F(1900), t + dur * 0.55);
    band.frequency.exponentialRampToValueAtTime(v.F(620), t + dur);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.34, 0.12, 0.04, 0.16);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, dur);
    v.wetGain.gain.value = 0.2;
    v.Live(0.45);
  },

  // 大刀劈中：厚背刀是砍不是刺，主体是钝的一记，刀身余振被肉体压住，很短。
  dadaoHit(A, v) {
    const t = v.t;
    Thud(v, t, 140, 55, 0.16, 0.7, 320);
    const wet = v.Noise("white", 0.12);
    const lp = v.Filter("lowpass", v.F(1100), 0.9);
    const wg = v.Gain(FLOOR);
    Hit(wg.gain, t, 0.4, 0.002, 0.1);
    wet.connect(lp).connect(wg).connect(v.out);
    v.Start(wet, t, 0.12);
    const ring = v.Osc("triangle", v.F(1650));
    const rg = v.Gain(FLOOR);
    Hit(rg.gain, t + 0.004, 0.07, 0.002, 0.22);
    ring.connect(rg).connect(v.out);
    v.Start(ring, t + 0.004, 0.25);
    v.wetGain.gain.value = 0.28;
    v.Live(0.5);
  },

  // 刺刀相交：钢对钢，两个高 Q 共振峰互相打拍子。
  bayonetHit(A, v) {
    const t = v.t;
    const freqs = [v.R(2200, 2600), v.R(3400, 3900), v.R(5100, 5800)];
    for (let i = 0; i < freqs.length; i += 1) {
      const osc = v.Osc("triangle", v.F(freqs[i]));
      const g = v.Gain(FLOOR);
      Hit(g.gain, t, 0.28 / (i + 1), 0.001, 0.38 - i * 0.09);
      osc.connect(g).connect(v.out);
      v.Start(osc, t, 0.4);
    }
    MetalClick(v, t, 4200, 0.3, 0.03, 18);
    Thud(v, t, 220, 130, 0.08, 0.2, 500);
    v.wetGain.gain.value = 0.4;
    v.Live(0.6);
  },

  // --- 断肢 ---------------------------------------------------------------
  // 卸掉一段肢体的那一瞬间。**与 impactFlesh 的差别是「多一层骨」**：
  // 入肉是一记湿闷，断肢是「撕开 + 断骨」两件事叠在 0.2 秒里。听不出这两层的话，
  // 画面上一条胳膊飞出去、耳朵里却只有一发普通子弹 —— 两件事对不上。
  goreSever(A, v) {
    const t = v.t;
    Thud(v, t, 170, 62, 0.16, 0.62, 240);
    // 湿裂：宽带噪声过带通，频心边响边塌 —— 撕开的那一下是高频先走。
    const rip = v.Noise("white", 0.22);
    const band = v.Filter("bandpass", v.F(900), 0.8);
    Glide(band.frequency, t, v.F(1500), v.F(420), 0.2);
    const rg = v.Gain(FLOOR);
    Swell(rg.gain, t, 0.42, 0.006, 0.05, 0.16);
    rip.connect(band).connect(rg).connect(v.out);
    v.Start(rip, t, 0.22);
    // 骨断：一记很短的脆响，频心压在 2 kHz 上下、Q 给低 ——
    // 骨头不是钢，用 bayonetHit 那种高 Q 共振会立刻听成"砍在铁上"。
    MetalClick(v, t + 0.045, v.R(1700, 2300), 0.3, 0.035, 6);
    Grains(v, t + 0.09, 3, 0.12, 600, 1600, 0.1);
    v.wetGain.gain.value = 0.1;    // 与 impactFlesh 同一条：打在人身上是「不响」的
    v.Live(0.45);
  },

  // 那一段落地。比 bodyFall 短得多也轻得多 —— 落的是一条胳膊，不是一个人：
  // 一记湿闷、不弹跳，尾巴上一点点滑蹭。它是「肢块落在哪」的唯一线索
  //（与 grenadeBounce 同一条理由：飞出去的东西要听得见落点）。
  goreLimbLand(A, v) {
    const t = v.t;
    Thud(v, t, 120, 52, 0.13, 0.5, 200);
    const wet = v.Noise("pink", 0.14);
    const lp = v.Filter("lowpass", v.F(700), 1.1);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.3, 0.002, 0.1);
    wet.connect(lp).connect(g).connect(v.out);
    v.Start(wet, t, 0.14);
    Grains(v, t + 0.06, 2, 0.1, 400, 1100, 0.07);
    v.wetGain.gain.value = 0.14;
    v.Live(0.34);
  },

  // --- 弹着 ---------------------------------------------------------------
  // 砖：脆裂 + 砖粉。台儿庄的墙大多是青砖，打上去会掉一小片。
  impactBrick(A, v) {
    const t = v.t;
    const src = v.Noise("white", 0.1);
    const band = v.Filter("bandpass", v.F(v.R(1500, 2100)), 1.6);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.65, 0.001, 0.07);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, 0.1);
    Thud(v, t, 300, 170, 0.06, 0.22, 700);
    Grains(v, t + 0.03, 4, 0.22, 3000, 6500, 0.05);
    v.wetGain.gain.value = 0.32;
    v.Live(0.5);
  },

  // 土：钝、闷，几乎没有高频。也是沙袋的声音。
  impactDirt(A, v) {
    const t = v.t;
    Thud(v, t, 190, 90, 0.11, 0.5, 240);
    const src = v.Noise("brown", 0.14);
    const lp = v.Filter("lowpass", v.F(700), 0.8);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.34, 0.002, 0.12);
    src.connect(lp).connect(g).connect(v.out);
    v.Start(src, t, 0.14);
    v.wetGain.gain.value = 0.18;
    v.Live(0.35);
  },

  // 木：空腔共鸣。门板、梁、家具 —— 巷战里挡在前面的多半是这些。
  impactWood(A, v) {
    const t = v.t;
    const modes = [v.R(320, 400), v.R(720, 880), v.R(1350, 1600)];
    for (let i = 0; i < modes.length; i += 1) {
      const osc = v.Osc("triangle", v.F(modes[i]));
      const g = v.Gain(FLOOR);
      Hit(g.gain, t, 0.32 / (i + 1), 0.001, 0.17 - i * 0.04);
      osc.connect(g).connect(v.out);
      v.Start(osc, t, 0.2);
    }
    const src = v.Noise("white", 0.06);
    const band = v.Filter("bandpass", v.F(1800), 1.2);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.3, 0.001, 0.045);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, 0.06);
    v.wetGain.gain.value = 0.25;
    v.Live(0.4);
  },

  // 金属：钢板一记 + **跳弹的「啾——」**。
  // 跳弹是变形的弹头翻着走产生的哨音，所以频率一路下滑还带颤 —— 频率不滑
  // 就成了电子音效，颤音不加就像口哨。这一声是战场音效里最有辨识度的东西之一。
  impactMetal(A, v) {
    const t = v.t;
    const clang = v.Osc("triangle", v.F(v.R(1700, 2300)));
    const cg = v.Gain(FLOOR);
    Hit(cg.gain, t, 0.35, 0.001, 0.14);
    clang.connect(cg).connect(v.out);
    v.Start(clang, t, 0.16);
    MetalClick(v, t, 5200, 0.22, 0.03, 16);

    const whineDur = v.R(0.55, 0.95);
    const whine = v.Osc("sawtooth", v.F(2800));
    Glide(whine.frequency, t + 0.012, v.F(v.R(2400, 3200)), v.F(v.R(700, 1000)), whineDur);
    // 颤：弹头翻滚造成的调制。7—12 Hz，深度几十个音分。
    const lfo = v.Osc("sine", v.R(7, 12));
    const lfoGain = v.Gain(v.R(45, 90));
    lfo.connect(lfoGain).connect(whine.detune);
    v.Start(lfo, t, whineDur + 0.05);
    const band = v.Filter("bandpass", v.F(2200), 7);
    Glide(band.frequency, t + 0.012, v.F(2600), v.F(850), whineDur);
    const wg = v.Gain(FLOOR);
    Hit(wg.gain, t + 0.012, 0.2, 0.006, whineDur);
    whine.connect(band).connect(wg).connect(v.out);
    v.Start(whine, t + 0.012, whineDur);

    v.wetGain.gain.value = 0.5;
    v.Live(whineDur + 0.5);
  },

  // 命中人体：湿、闷、没有回响。棉军装还会吃掉一部分高频。
  impactFlesh(A, v) {
    const t = v.t;
    Thud(v, t, 160, 70, 0.1, 0.55, 200);
    const src = v.Noise("white", 0.09);
    const lp = v.Filter("lowpass", v.F(850), 1.4);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.32, 0.001, 0.07);
    src.connect(lp).connect(g).connect(v.out);
    v.Start(src, t, 0.09);
    v.wetGain.gain.value = 0.08;   // 打在人身上是「不响」的，别给混响
    v.Live(0.3);
  },

  /**
   * 命中确认。**非空间化**：Play 时不给 position，它不在战场上，它在开枪的人耳朵里。
   *
   * 为什么必须单开一条通道，而不是把 impactFlesh 调响：
   * impactFlesh 走 PannerNode 的 inverse 衰减（refDistance 3.5、rolloff 0.9），
   * 八十米上只剩出厂音量的 4.8% —— 在几十条枪的底噪里等于没有。而本作没有准星、
   * 不显示弹药数、不打歼敌数，「这一枪打没打中」在四十米以外原来没有任何通道能回答。
   * 那一层实录的 impactFlesh 照旧留在世界里（它是打给旁边的人听的），这一记是回执。
   *
   * 音色刻意不做成「叮」：一记极短的干敲击，频心压在 1.2 kHz 上下 ——
   * 步枪声的能量峰在 400—800 Hz，错开一个八度才在枪响之后的 40 ms 里听得清。
   * 完全不给混响：有尾巴就会被听成"场景里的某个东西响了"。
   */
  hitConfirm(A, v) {
    const t = v.t;
    Thud(v, t, 330, 190, 0.045, 0.30, 900);
    const src = v.Noise("white", 0.04);
    const band = v.Filter("bandpass", v.F(1250), 2.2);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.20, 0.001, 0.035);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, 0.04);
    v.wetGain.gain.value = 0;      // 干到底
    v.Live(0.16);
  },

  // 击杀确认：同一记敲击，外加 95 ms 后一记更低更软的收尾。
  // **靠节奏区分，不靠响度区分** —— 两个只差音量的提示音，在战场底噪里等于同一个。
  // 第二下压到 170→95 Hz，与第一下差了两个八度，闭着眼睛也分得出是一下还是两下。
  killConfirm(A, v) {
    const t = v.t;
    Thud(v, t, 330, 190, 0.045, 0.30, 900);
    const src = v.Noise("white", 0.04);
    const band = v.Filter("bandpass", v.F(1250), 2.2);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.20, 0.001, 0.035);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, 0.04);
    Thud(v, t + 0.095, 175, 95, 0.14, 0.36, 420);
    v.wetGain.gain.value = 0;
    v.Live(0.34);
  },

  // --- 人体动作 -----------------------------------------------------------
  // 土路脚步：一记闷的落地 + 一点扬尘的沙沙。
  footstepDirt(A, v) {
    const t = v.t;
    Thud(v, t, v.R(95, 125), 55, 0.07, 0.3, 260);
    const src = v.Noise("pink", 0.1);
    const band = v.Filter("bandpass", v.F(v.R(750, 1050)), 1.1);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t + 0.005, 0.12, 0.004, 0.08);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t + 0.005, 0.1);
    v.wetGain.gain.value = 0.14;
    v.Live(0.28);
  },

  // 瓦砾脚步：同样一记落地，外加碎砖被踩得滑动 —— 满城废墟里全程都是这个声音。
  footstepRubble(A, v) {
    const t = v.t;
    Thud(v, t, v.R(100, 130), 58, 0.06, 0.26, 300);
    Grains(v, t, 5, 0.13, 1800, 5200, 0.075);
    const slide = v.Noise("white", 0.14);
    const band = v.Filter("bandpass", v.F(2400), 2.0);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t + 0.01, 0.09, 0.008, 0.12);
    slide.connect(band).connect(g).connect(v.out);
    v.Start(slide, t + 0.01, 0.14);
    v.wetGain.gain.value = 0.2;
    v.Live(0.35);
  },

  // === 序章车厢专用音（采样包载入后由同名 cue 覆盖；无包时仍可发声） ===
  trainBrake(A, v) {
    const t = v.t;
    MetalScrape(v, t, 0.9, 760, 220, 0.18);
    Thud(v, t + 0.03, 180, 72, 0.34, 0.32, 220);
    v.wetGain.gain.value = 0.18;
    v.Live(1.15);
  },
  // 序章蒸汽机车入站汽笛。SeedAudio 采样包存在时会覆盖；此处只保证离线回退可听。
  trainWhistle(A, v) {
    const t = v.t, dur = 2.8;
    const osc = v.Osc("sine", v.F(430));
    const wobble = v.Osc("sine", 4.1);
    const wobbleGain = v.Gain(19);
    wobble.connect(wobbleGain).connect(osc.detune);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.34, 0.10, dur * 0.76, 0.42);
    osc.connect(g).connect(v.out);
    v.Start(wobble, t, dur + 0.12);
    v.Start(osc, t, dur + 0.12);
    const steam = v.Noise("pink", dur);
    const band = v.Filter("bandpass", v.F(1450), 0.75);
    const air = v.Gain(FLOOR);
    Swell(air.gain, t, 0.07, 0.08, dur * 0.7, 0.34);
    steam.connect(band).connect(air).connect(v.out);
    v.Start(steam, t, dur);
    v.wetGain.gain.value = 0.32;
    v.Live(3.25);
  },
  carriageRattle(A, v) {
    const t = v.t;
    Grains(v, t, 6, 0.1, 1200, 4600, 0.07);
    MetalClick(v, t + 0.22, 1800, 0.12, 0.06, 9);
    v.wetGain.gain.value = 0.08;
    v.Live(0.48);
  },
  stretcherWood(A, v) {
    Thud(v, v.t, 155, 68, 0.14, 0.42, 190);
    MetalClick(v, v.t + 0.16, 850, 0.12, 0.1, 8);
    v.wetGain.gain.value = 0.12;
    v.Live(0.52);
  },
  coughLow(A, v) {
    const t = v.t;
    const src = v.Noise("pink", 0.42);
    const band = v.Filter("bandpass", v.F(310), 1.1);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.22, 0.04, 0.16, 0.19);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, 0.42);
    v.wetGain.gain.value = 0.16;
    v.Live(0.56);
  },
  gearRustle(A, v) {
    const src = v.Noise("pink", 0.34);
    const band = v.Filter("bandpass", v.F(2100), 1.2);
    const g = v.Gain(FLOOR);
    Swell(g.gain, v.t, 0.14, 0.015, 0.16, 0.16);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, v.t, 0.34);
    v.wetGain.gain.value = 0.1;
    v.Live(0.48);
  },
  carriageDoorSlide(A, v) {
    MetalScrape(v, v.t, 0.8, 500, 1700, 0.22);
    MetalClick(v, v.t + 0.86, 1250, 0.2, 0.07, 10);
    v.wetGain.gain.value = 0.2;
    v.Live(1.18);
  },
  stepBallast(A, v) {
    Thud(v, v.t, 96, 42, 0.12, 0.58, 200);
    Grains(v, v.t + 0.02, 4, 0.1, 1700, 4500, 0.06);
    v.wetGain.gain.value = 0.12;
    v.Live(0.34);
  },

  // 倒地：不是一下，是三下 —— 膝、髋、头/肩，间隔越来越短、力度越来越小。
  // 只做一记闷响的话，永远像麻袋掉地上。
  bodyFall(A, v) {
    const t = v.t;
    Thud(v, t, 130, 60, 0.12, 0.45, 220);
    Thud(v, t + 0.085, 105, 48, 0.14, 0.55, 190);
    Thud(v, t + 0.19, 90, 42, 0.16, 0.3, 170);
    // 棉军装/装具的窸窣。
    const cloth = v.Noise("pink", 0.3);
    const band = v.Filter("bandpass", v.F(1600), 0.9);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.1, 0.02, 0.08, 0.18);
    cloth.connect(band).connect(g).connect(v.out);
    v.Start(cloth, t, 0.3);
    MetalClick(v, t + 0.2, v.R(2200, 3400), 0.06, 0.05, 10);   // 枪磕在地上
    v.wetGain.gain.value = 0.22;
    v.Live(0.6);
  },

  // 中弹的闷哼：锯齿基频过两个共振峰当元音，加一层气声。
  // 不做共振峰的话就是纯电子音；这两个 band 才让它像人发出来的。
  hurt(A, v) {
    const t = v.t;
    const f0 = v.F(v.R(112, 138));
    const src = v.Osc(A.Wave("string"), f0);
    Glide(src.frequency, t, f0, f0 * 0.78, 0.26);
    const f1 = v.Filter("bandpass", 640, 5.5);
    const f2 = v.Filter("bandpass", 1180, 7);
    const g1 = v.Gain(0.6), g2 = v.Gain(0.35);
    const bus = v.Gain(FLOOR);
    Swell(bus.gain, t, 0.32, 0.02, 0.08, 0.2);
    src.connect(f1).connect(g1).connect(bus);
    src.connect(f2).connect(g2).connect(bus);
    bus.connect(v.out);
    v.Start(src, t, 0.32);

    const breath = v.Noise("pink", 0.3);
    const bh = v.Filter("bandpass", v.F(2000), 1.0);
    const bg = v.Gain(FLOOR);
    Swell(bg.gain, t, 0.08, 0.03, 0.06, 0.18);
    breath.connect(bh).connect(bg).connect(v.out);
    v.Start(breath, t, 0.3);
    v.wetGain.gain.value = 0.18;
    v.Live(0.5);
  },

  // 濒死心跳：lub-dub 两下，第二下更闷更近。
  // 频率压到 30—60 Hz 是刻意的 —— 这一段要让人「感觉到」而不是「听到」。
  heartbeat(A, v) {
    const t = v.t;
    Thud(v, t, 62, 30, 0.16, 0.85, 110);
    Thud(v, t + 0.27, 54, 26, 0.2, 0.6, 95);
    v.wetGain.gain.value = 0.0;    // 心跳在颅内，不该有房间的混响
    v.Live(0.65);
  },

  // --- 信号 ---------------------------------------------------------------
  // 冲锋号。军号没有活塞，**只能吹泛音列上的音**（3、4、5、6 次泛音 = 中音 sol、
  // 高音 do、mi、sol），所以这条动机只用这四个音 —— 这是形制决定的，
  // 随便写个旋律就不是号声了。音色走铜管泛音包，不是方波。
  bugleCharge(A, v) {
    A.BugleLine(v, BUGLE_CHARGE, 0.3);
    v.wetGain.gain.value = 0.55;   // 号是在街上吹的，尾巴要能撞上墙再回来
    v.Live(2.6);
  },

  // 哨子：主音 + 「豆」造成的快速颤振。没有那个 18 Hz 的颤就是纯音测试信号。
  whistle(A, v) {
    const t = v.t, dur = 0.5;
    const osc = v.Osc("sine", v.F(2350));
    const warble = v.Osc("sine", 18);
    const warbleGain = v.Gain(110);
    warble.connect(warbleGain).connect(osc.detune);
    v.Start(warble, t, dur + 0.1);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.3, 0.02, dur * 0.75, 0.07);
    osc.connect(g).connect(v.out);
    v.Start(osc, t, dur + 0.1);
    // 吹哨的气声，让它有「人在吹」的质感。
    const air = v.Noise("white", dur);
    const band = v.Filter("bandpass", v.F(3200), 3);
    const ag = v.Gain(FLOOR);
    Swell(ag.gain, t, 0.05, 0.02, dur * 0.7, 0.06);
    air.connect(band).connect(ag).connect(v.out);
    v.Start(air, t, dur);
    v.wetGain.gain.value = 0.45;
    v.Live(0.75);
  },

  // =========================================================================
  // 任务流程重制 · 音效缺口批 A2 的十五条兜底配方（2026-08-29 接线）
  //
  // **这十五条的主料是实录**（素材、切法与选材理由见 Data_SfxSources.mjs 末尾那批，
  // 逐条的验收数字在 docs/Data_AudioAssets.md「重制新增音效」）。这里写的是
  // `LoadSfxPack` 盖不上去时的回落 —— 与上面那 43 条同一条契约：
  // 采样 404 / 离线 / file:// 协议下仍然发得出声，**没有音效的战场也仍然是能打的战场**。
  //
  // 所以这一批刻意写得薄：三到五个节点、不追求像，只保证「这一刻有东西响了」，
  // 而且**响的是对的那一类东西**（惨叫是浊音不是噪声、电键是干脆的一记不是嗡、
  // 扫射是一梭子不是一发）。想听它们本来的样子请让采样包载进来。
  // 唯一一处不薄的是 strafeNear：航空机枪的身份是「一梭子」，只给一发就不成立了。
  // =========================================================================

  // --- 实录人声的兜底（三条都是非语言嗓音）---------------------------------
  // 走 hurt 那条路子：锯齿基频过两个共振峰当元音 —— 少了共振峰就是纯电子音，
  // 而这三条最要紧的正是「听得出是个人」。
  execScream(A, v) {
    const t = v.t, dur = 0.5;
    const f0 = v.F(v.R(240, 285));           // 成年男性痛叫（素材实测 361→256 / 230→134）
    const src = v.Osc(A.Wave("string"), f0);
    Glide(src.frequency, t, f0, f0 * 0.62, dur);   // 喊出去就往下掉
    const f1 = v.Filter("bandpass", 780, 5.0);
    const f2 = v.Filter("bandpass", 1420, 6.5);
    const g1 = v.Gain(0.62), g2 = v.Gain(0.4);
    const bus = v.Gain(FLOOR);
    // **掐尾**：起来一声、断掉，不给它把整声喊完（素材那两条也是 0.14—0.16 s 收干净的）。
    Swell(bus.gain, t, 0.5, 0.03, dur * 0.42, dur * 0.4);
    src.connect(f1).connect(g1).connect(bus);
    src.connect(f2).connect(g2).connect(bus);
    bus.connect(v.out);
    v.Start(src, t, dur + 0.05);
    v.wetGain.gain.value = 0.5;              // 隔着墙听见的，混响多给一点
    v.Live(0.7);
  },

  // 大出血伤员的持续低声痛呼：**闷的、压着的**，不是惨叫。
  // 低通 900 顶替素材那条「捂着嘴」的天然闷感；中间一次换气靠两段包络。
  painMoan(A, v) {
    const t = v.t;
    const f0 = v.F(v.R(105, 130));
    const src = v.Osc(A.Wave("string"), f0);
    Glide(src.frequency, t, f0, f0 * 0.86, 2.4);
    const band = v.Filter("bandpass", 520, 3.6);
    const lp = v.Filter("lowpass", v.F(900), 0.8);
    const bus = v.Gain(FLOOR);
    Swell(bus.gain, t, 0.3, 0.14, 0.75, 0.35);          // 第一口
    Swell(bus.gain, t + 1.32, 0.24, 0.16, 0.6, 0.45);   // 换气之后第二口
    src.connect(band).connect(lp).connect(bus).connect(v.out);
    v.Start(src, t, 2.55);
    v.wetGain.gain.value = 0.3;
    v.Live(2.7);
  },

  // 罗班长腹部中弹那一声：闷哼，短，一次发声就完。与满场随机的 hurt 分开。
  hitGrunt(A, v) {
    const t = v.t, dur = 0.4;
    const f0 = v.F(v.R(275, 305));
    const src = v.Osc(A.Wave("string"), f0);
    Glide(src.frequency, t, f0, f0 * 0.72, dur);
    const band = v.Filter("bandpass", 640, 5.5);
    const lp = v.Filter("lowpass", v.F(1300), 0.9);     // 压住的，不是喊出来的
    const bus = v.Gain(FLOOR);
    Hit(bus.gain, t, 0.42, 0.012, dur);
    src.connect(band).connect(lp).connect(bus).connect(v.out);
    v.Start(src, t, dur + 0.05);
    v.wetGain.gain.value = 0.12;             // 就在你旁边，不该有房间
    v.Live(0.5);
  },

  // --- 照明弹（第四关）：发射 → 点燃 → 燃烧 → 熄灭 ------------------------
  // 发射的那一下是**闷的推力**（迫击炮式发射筒），不是枪口爆音；
  // 后面那条上升的噪声尾巴是「它还在往上走」，切短了这条 cue 就没意义了。
  flareLaunch(A, v) {
    const t = v.t;
    Thud(v, t, 210, 78, 0.26, 0.62, 480);
    const rise = v.Noise("pink", 2.5);
    const band = v.Filter("bandpass", v.F(700), 1.3);
    Glide(band.frequency, t + 0.05, v.F(700), v.F(2100), 2.2);   // 越升越尖 = 越飞越远
    const g = v.Gain(FLOOR);
    Swell(g.gain, t + 0.05, 0.16, 0.18, 1.1, 1.1);
    rise.connect(band).connect(g).connect(v.out);
    v.Start(rise, t + 0.05, 2.5);
    v.wetGain.gain.value = 0.4;
    v.Live(2.7);
  },

  // 顶空点燃：一记「噗」的冲头接刚烧起来的嘶声。
  flareIgnite(A, v) {
    const t = v.t;
    const puff = v.Noise("white", 1.15);
    const band = v.Filter("bandpass", v.F(1600), 0.9);
    Glide(band.frequency, t, v.F(2600), v.F(1200), 0.9);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.5, 0.006, 1.05);
    puff.connect(band).connect(g).connect(v.out);
    v.Start(puff, t, 1.15);
    Grains(v, t + 0.02, 4, 0.25, 2200, 5200, 0.09);   // 药柱起火时溅出来的几点
    v.wetGain.gain.value = 0.5;              // 在头顶两百米上，全是反射
    v.Live(1.35);
  },

  // 滞空燃烧：稳定的嘶声 + 一点慢飘。**采样版是可循环的 6 秒**，
  // 合成这条只保证「有东西在头顶烧着」——接线侧照旧按需要反复触发。
  flareBurn(A, v) {
    const t = v.t, dur = 3.0;
    const fire = v.Noise("pink", dur);
    const band = v.Filter("bandpass", v.F(1250), 0.8);
    // 3.7 Hz 的慢飘：照明弹吊在伞下是**晃着**烧的，频心钉死就成了电吹风。
    const drift = v.Osc("sine", 3.7);
    const driftGain = v.Gain(v.F(260));
    drift.connect(driftGain).connect(band.frequency);
    v.Start(drift, t, dur);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.2, 0.25, dur - 0.85, 0.6);
    fire.connect(band).connect(g).connect(v.out);
    v.Start(fire, t, dur);
    v.wetGain.gain.value = 0.45;
    v.Live(dur + 0.2);
  },

  // 熄灭：两秒多的自然衰减。**素材里是真的烧完了**，合成这条只能用曲线冒充，
  // 所以衰减写得慢而不平 —— 一路直着掉下去听着像有人把音量拧了。
  flareOut(A, v) {
    const t = v.t;
    const fire = v.Noise("pink", 2.6);
    const lp = v.Filter("lowpass", v.F(2400), 0.7);
    Glide(lp.frequency, t, v.F(2400), v.F(420), 2.3);   // 先失高频再失能量
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.18, 0.05, 0.55, 1.9);
    fire.connect(lp).connect(g).connect(v.out);
    v.Start(fire, t, 2.6);
    v.wetGain.gain.value = 0.45;
    v.Live(2.8);
  },

  // --- 发报（终章）---------------------------------------------------------
  // 电键的「嗒」：一九三〇年代的电键是黄铜杆＋弹簧＋触点 —— 干、短、
  // 带一点点金属余韵，**按下与抬起是两下**（隔 60 ms，抬起那下轻得多）。
  telegraphKey(A, v) {
    MetalClick(v, v.t, v.R(2600, 3100), 0.3, 0.028, 15);
    MetalClick(v, v.t + 0.062, v.R(1900, 2300), 0.12, 0.022, 13);
    v.wetGain.gain.value = 0.06;             // 手底下那点东西，不该有房间
    v.Live(0.2);
  },

  // 发报机的电流底噪：工频 50 Hz 与它的谐波。
  // **不加谐波就是一条正弦测试音**；一九三〇年代的电台也不会有八千赫以上的东西。
  telegraphHum(A, v) {
    const t = v.t, dur = 3.0;
    const hum = v.Osc("sine", v.F(50));
    const harm = v.Osc("sawtooth", v.F(150));
    const lp = v.Filter("lowpass", v.F(1400), 0.7);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.14, 0.2, dur - 0.55, 0.35);
    const hg = v.Gain(0.28);
    hum.connect(g);
    harm.connect(hg).connect(lp).connect(g);
    g.connect(v.out);
    v.Start(hum, t, dur);
    v.Start(harm, t, dur);
    v.wetGain.gain.value = 0.05;             // 在机器里，不在屋子里
    v.Live(dur + 0.2);
  },

  // --- 日机攻击（第一关）---------------------------------------------------
  // 俯冲通场：双发活塞机的引擎啸声。**多普勒必须是一条完整的抛物线** ——
  // 音高与音量一起先涨后落，两者错开就成了「有人在拧收音机」。
  // 采样那条的多普勒是录出来的，这条是算的，差别就在这里。
  planeDive(A, v) {
    const t = v.t, dur = 5.0;
    const base = v.F(118);
    const engine = v.Osc("sawtooth", base);
    // 螺旋桨两片桨叶的拍频：单条振荡器太干净，像电锯。
    const engine2 = v.Osc("sawtooth", base * 1.013);
    // 先升调（迎面来）再降调（掠过去）—— 峰值落在通场那一刻。
    Glide(engine.frequency, t, base * 0.86, base * 1.24, dur * 0.55);
    Glide(engine.frequency, t + dur * 0.55, base * 1.24, base * 0.8, dur * 0.45);
    Glide(engine2.frequency, t, base * 0.87, base * 1.26, dur * 0.55);
    Glide(engine2.frequency, t + dur * 0.55, base * 1.26, base * 0.81, dur * 0.45);
    const lp = v.Filter("lowpass", v.F(2600), 0.9);
    Glide(lp.frequency, t, v.F(1100), v.F(3800), dur * 0.55);
    Glide(lp.frequency, t + dur * 0.55, v.F(3800), v.F(900), dur * 0.45);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.32, dur * 0.5, 0.15, dur * 0.4);
    engine.connect(lp); engine2.connect(lp);
    lp.connect(g).connect(v.out);
    v.Start(engine, t, dur); v.Start(engine2, t, dur);
    v.wetGain.gain.value = 0.5;
    v.Live(dur + 0.2);
  },

  // 引擎持续声（**会飞的源**）：给 MoveVoice 逐帧搬位置、按径向速度变调的那一条。
  // 与 planeDive 分工：drone 从四五百米外一直响到离场，「由远及近、掠过、转弯」在耳朵里的
  // 全部来源就是它的方位、响度与音高一起变；压到头顶那一下再叠 planeDive（录好多普勒的通场）。
  // 没有时长：一直响到 StopVoice；SetDoppler 是它对 MoveVoice 的唯一承诺。
  planeDrone(A, v) {
    const t = v.t;
    const base = v.F(92);
    const o1 = v.Osc("sawtooth", base);
    const o2 = v.Osc("sawtooth", base * 1.011);       // 双发 / 双桨的拍频，单条太干净像电锯
    const o3 = v.Osc("triangle", base * 0.5);         // 低八度垫底，远处只剩这一层
    const lp = v.Filter("lowpass", v.F(1500), 0.8);
    const beat = v.Gain(0.75);
    const lfo = v.Osc("sine", 21);                    // 螺旋桨拍频调幅
    const lfoGain = v.Gain(0.22);
    lfo.connect(lfoGain).connect(beat.gain);
    const g = v.Gain(FLOOR);
    g.gain.setTargetAtTime(0.5, t, 0.5);              // 起音慢一点，别"啪"地出现在天上
    o1.connect(lp); o2.connect(lp); o3.connect(lp);
    lp.connect(beat).connect(g).connect(v.out);
    for (const o of [o1, o2, o3, lfo]) o.start(t);
    v.wetGain.gain.value = 0.35;
    v.Live(3600);
    v.loop = true;
    v.SetDoppler = (rate) => {
      const cents = 1200 * Math.log2(Math.max(0.5, rate));
      const at = A.ctx.currentTime;
      for (const o of [o1, o2, o3]) o.detune.setTargetAtTime(cents, at, 0.12);
    };
  },

  // 空对地扫射（近）：航空机枪 ~900 rpm。**这条必须是一梭子**，
  // 不是一发 —— 一发就成了地面上有人在点射，扫射的身份全在射速上。
  // 逐发排会被节点预算吃掉一半，所以走 GunAuto（整条点射共用一套发声链）。
  strafeNear(A, v) {
    const shots = Clamp(v.burst ?? 6, 1, 14);
    GunAuto(A, v, {
      thumpHi: 132, thumpLo: 58, thumpDur: 0.05, thumpLevel: 0.5,
      blastFreq: 2200, blastQ: 0.7, blastLevel: 0.82, blastDecay: 0.03, drive: 0.66,
      // 架在枪架上的机枪：每发后面那记金属余振是「这枪不在人手里」的唯一线索。
      mechFreq: 4600, mechLevel: 0.26, mechDelay: 0.014,
      tailDur: 0.5, tailLevel: 0.07, wet: 0.35,
    }, shots, 60 / 900);
  },

  // 空对地扫射（远，300 m）：**不是把近的调小** —— 瞬态被空气吃掉只剩尖头加长尾。
  // 一梭子在这个距离上糊成一串「哒哒哒」的头，尾巴才是远场的全部价值。
  strafeFar(A, v) {
    const t = v.t;
    const shots = Clamp(v.burst ?? 6, 1, 14);
    const interval = 60 / 900;
    const src = v.Noise("white", shots * interval + 0.2);
    const band = v.Filter("bandpass", v.F(760), 1.2);
    const hp = v.Filter("highpass", v.F(200), 0.7);
    const g = v.Gain(FLOOR);
    src.connect(band).connect(hp).connect(g).connect(v.out);
    for (let i = 0; i < shots; i += 1) Hit(g.gain, t + i * interval, 0.4 * v.R(0.85, 1.05), 0.002, 0.04);
    v.Start(src, t, shots * interval + 0.2);
    const tail = v.Noise("brown", 1.9);
    const tailLp = v.Filter("lowpass", v.F(600), 0.5);
    const tailGain = v.Gain(FLOOR);
    Swell(tailGain.gain, t + 0.02, 0.13, 0.1, shots * interval, 1.4);
    tail.connect(tailLp).connect(tailGain).connect(v.out);
    v.Start(tail, t + 0.02, 1.9);
    v.wetGain.gain.value = 0.55;             // 远场几乎全是尾巴
    v.Live(2.2);
  },

  // 弹着扫过土路的那一串：三十几记等间距的锐利音爆，中间没有断口。
  // 与 impactDirt 的差别是**成串**：一发是「打偏了」，一串是「弹线正在追你」。
  strafeDirt(A, v) {
    const t = v.t, span = 2.6;
    Ticks(v, t, 18, span, 900, 3400, 0.2, 0.035, 5);      // 打进夯土的闷头
    Ticks(v, t + 0.03, 14, span, 2600, 6800, 0.11, 0.02, 8);  // 溅起来的碎石
    Thud(v, t + span * 0.42, 150, 70, 0.16, 0.28, 320);   // 中途一记打在硬地上
    v.wetGain.gain.value = 0.25;
    v.Live(span + 0.4);
  },

  // --- 重机枪（第五关）-----------------------------------------------------
  // 过热：九二式是**气冷**的，过热时不是水汽嘶嘶，是散热片与枪管热胀冷缩的
  // 一记记金属轻响。所以是「咔」加一条很短的金属余韵，不是嘶声。
  mgOverheat(A, v) {
    const t = v.t;
    MetalClick(v, t, v.R(3200, 4200), 0.24, 0.03, 16);
    const ring = v.Osc("triangle", v.F(v.R(1500, 2100)));
    const rg = v.Gain(FLOOR);
    Hit(rg.gain, t + 0.004, 0.07, 0.002, 0.2);
    ring.connect(rg).connect(v.out);
    v.Start(ring, t + 0.004, 0.24);
    v.wetGain.gain.value = 0.1;
    v.Live(0.35);
  },

  // 卡壳之后那一下拉柄。**不能照抄 bolt** —— 那是一支步枪的旋转后拉枪机；
  // 重机枪的拉柄是一大块钢被整个拽回来，重得多、慢得多、行程长得多。
  mgCharge(A, v) {
    const t = v.t;
    MetalClick(v, t, 1700, 0.28, 0.05, 9);               // 手抓上去的那一下
    MetalScrape(v, t + 0.04, 0.34, 900, 1800, 0.22);     // 一大块钢被拽回来
    Thud(v, t + 0.30, 165, 72, 0.12, 0.4, 380);          // 到底那一记闷响
    MetalClick(v, t + 0.34, 2100, 0.24, 0.07, 11);
    v.wetGain.gain.value = 0.1;
    v.Live(0.85);
  },

  // =========================================================================
  // 接线批 INT4（2026-09-08）：合成**回落**配方。
  //
  // 这一批的实录素材正由素材侧从 Sonniss 实录里切；名字是先定死的契约
  // （见 docs/Data_AudioWiring.md 的 cue 表）。素材落地之前这些配方就是实际发声的
  // 那一层，所以要求是**能听见、听得出是什么**，不要求好听 ——
  // 接线红不红不能取决于素材到没到。
  // =========================================================================

  // --- 弹道 ---------------------------------------------------------------
  // 超音速弹头掠过耳边：那是**弹头自己的锥形激波**，不是枪声。
  // 它极短（几毫秒）、极亮（能量在 2—8 kHz）、**没有尾巴**——尾巴属于枪口，
  // 而枪口在几十米外，晚得多才到。把这一条做长做闷就成了「远处有人开枪」。
  bulletCrack(A, v) {
    const t = v.t;
    const src = v.Noise("white", 0.05);
    const hp = v.Filter("highpass", v.F(1400), 0.7);
    const band = v.Filter("bandpass", v.F(v.R(3200, 5200)), 1.4);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.85, 0.0006, 0.016);
    src.connect(hp).connect(band).connect(g).connect(v.out);
    v.Start(src, t, 0.05);
    // 激波后面那一点点低频「顶」——胸口感觉到的那一下。
    Thud(v, t + 0.004, 260, 120, 0.05, 0.16, 700);
    v.wetGain.gain.value = 0.1;      // 贴着耳朵过去的东西不该有房间
    v.Live(0.16);
  },

  // 擦着头皮过去那一档：激波之后跟着的是弹头搅动空气的湍流，
  // 频心从高往低扫（弹头正在离开），一米半以外就听不出来了。
  bulletWhizz(A, v) {
    const t = v.t, dur = 0.2;
    const src = v.Noise("pink", dur + 0.05);
    const band = v.Filter("bandpass", v.F(2600), 4.5);
    Glide(band.frequency, t, v.F(3400), v.F(900), dur);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.3, 0.012, dur * 0.35, dur * 0.6);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, dur + 0.05);
    v.wetGain.gain.value = 0.12;
    v.Live(0.34);
  },

  // 跳弹：削飞出去的弹头**在转**，所以是一条带颤的下滑哨音，不是「叮」。
  // 电影里那条经典的「piu」就是这个 —— 它之所以站得住，是因为真的存在。
  ricochet(A, v) {
    const t = v.t, dur = v.R(0.32, 0.5);
    const osc = v.Osc("sawtooth", v.F(2600));
    Glide(osc.frequency, t, v.F(v.R(2400, 3400)), v.F(v.R(600, 900)), dur);
    // 转速带来的调幅（弹头翻滚，声音一颤一颤的）。
    const wobble = v.Osc("sine", v.R(28, 46));
    const wobbleGain = v.Gain(0.35);
    const band = v.Filter("bandpass", v.F(2000), 3.0);
    const g = v.Gain(FLOOR);
    wobble.connect(wobbleGain).connect(g.gain);
    Hit(g.gain, t, 0.34, 0.002, dur);
    osc.connect(band).connect(g).connect(v.out);
    v.Start(wobble, t, dur);
    v.Start(osc, t, dur + 0.05);
    v.wetGain.gain.value = 0.4;      // 跳弹的尾巴是在巷子里荡出来的
    v.Live(dur + 0.3);
  },

  // 打在石头/条石上：比青砖硬、比铁闷。碎屑更少更细。
  impactStone(A, v) {
    const t = v.t;
    Thud(v, t, 210, 110, 0.05, 0.3, 620);
    const src = v.Noise("white", 0.1);
    const band = v.Filter("bandpass", v.F(v.R(2600, 4200)), 2.2);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t, 0.3, 0.001, 0.06);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, 0.1);
    Grains(v, t + 0.02, 4, 0.12, 3000, 7000, 0.09);
    v.wetGain.gain.value = 0.3;
    v.Live(0.34);
  },

  // --- 脚步（四种地面）-----------------------------------------------------
  // 木地板/木桥：落地那一下之后是**板子自己的共振**，这条共振就是「空的」的听感来源。
  footstepWood(A, v) {
    const t = v.t;
    Thud(v, t, v.R(130, 170), 78, 0.06, 0.26, 520);
    const ring = v.Osc("triangle", v.F(v.R(190, 260)));
    const rg = v.Gain(FLOOR);
    Hit(rg.gain, t + 0.006, 0.09, 0.003, 0.16);
    ring.connect(rg).connect(v.out);
    v.Start(ring, t + 0.006, 0.2);
    v.wetGain.gain.value = 0.16;
    v.Live(0.3);
  },

  // 青石板/砖地：硬、亮、短，鞋钉带一记高频。
  footstepStone(A, v) {
    const t = v.t;
    Thud(v, t, v.R(150, 190), 90, 0.045, 0.24, 700);
    const src = v.Noise("white", 0.07);
    const band = v.Filter("bandpass", v.F(v.R(3200, 5000)), 3.0);
    const g = v.Gain(FLOOR);
    Hit(g.gain, t + 0.002, 0.13, 0.001, 0.045);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t + 0.002, 0.07);
    v.wetGain.gain.value = 0.24;     // 石板街两侧有墙，这一记是有回声的
    v.Live(0.26);
  },

  // 草地/田埂：几乎没有低频冲击，全是干草被压下去的沙沙。
  footstepGrass(A, v) {
    const t = v.t;
    Thud(v, t, 100, 62, 0.05, 0.12, 220);
    const src = v.Noise("pink", 0.14);
    const band = v.Filter("bandpass", v.F(v.R(1800, 2800)), 1.0);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.13, 0.008, 0.05, 0.08);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, 0.14);
    v.wetGain.gain.value = 0.08;
    v.Live(0.3);
  },

  // 泥地/水田：**吸**。落地闷得几乎没有瞬态，抬脚才是这条音的主角
  // （黏着的那一下「啵」），所以两段之间要留 90 ms。
  footstepMud(A, v) {
    const t = v.t;
    Thud(v, t, 95, 52, 0.09, 0.28, 190);
    const suck = v.Noise("brown", 0.16);
    const lp = v.Filter("lowpass", v.F(900), 1.4);
    Glide(lp.frequency, t + 0.09, v.F(500), v.F(1300), 0.1);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t + 0.09, 0.16, 0.02, 0.03, 0.09);
    suck.connect(lp).connect(g).connect(v.out);
    v.Start(suck, t + 0.09, 0.16);
    v.wetGain.gain.value = 0.06;
    v.Live(0.36);
  },

  // --- 身体 foley ---------------------------------------------------------
  // 布料摩擦：起身、趴下、翻墙。带通噪声两段（收紧 → 放开），中间不留空。
  clothMove(A, v) {
    const t = v.t;
    const src = v.Noise("pink", 0.34);
    const band = v.Filter("bandpass", v.F(1500), 0.9);
    Glide(band.frequency, t, v.F(v.R(1100, 1500)), v.F(v.R(2200, 2900)), 0.26);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.17, 0.03, 0.12, 0.16);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, 0.34);
    v.wetGain.gain.value = 0.05;     // 就在自己身上
    v.Live(0.42);
  },

  // 装具晃动：水壶、弹带、饭盒互相磕。**是一串不规则的碰撞**，不是一条噪声。
  gearRattle(A, v) {
    const t = v.t;
    Ticks(v, t, 5, 0.26, 900, 2600, 0.16, 0.05, 5);
    const cloth = v.Noise("pink", 0.3);
    const band = v.Filter("bandpass", v.F(1300), 0.8);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.07, 0.03, 0.14, 0.12);
    cloth.connect(band).connect(g).connect(v.out);
    v.Start(cloth, t, 0.3);
    v.wetGain.gain.value = 0.05;
    v.Live(0.42);
  },

  // 粗喘：一吸一呼两段，吸短促、呼长而闷。频心比人声低（这是气流不是声带），
  // 所以不做任何共振峰 —— 加了就成了「有人在你耳边哼」。
  breathHeavy(A, v) {
    const t = v.t;
    const src = v.Noise("pink", 2.4);
    const band = v.Filter("bandpass", v.F(620), 1.2);
    const g = v.Gain(FLOOR);
    src.connect(band).connect(g).connect(v.out);
    v.Start(src, t, 2.4);
    // 两个完整的呼吸周期，每周期 1.15 s：吸 0.28 s、呼 0.42 s、停 0.45 s。
    for (let i = 0; i < 2; i += 1) {
      const at = t + i * 1.15;
      band.frequency.setValueAtTime(v.F(900), at);
      Swell(g.gain, at, 0.22, 0.09, 0.06, 0.13);
      band.frequency.setValueAtTime(v.F(480), at + 0.34);
      Swell(g.gain, at + 0.34, 0.3, 0.05, 0.14, 0.23);
    }
    v.wetGain.gain.value = 0;        // 自己的肺，没有房间
    v.Live(2.5);
  },

  // 玩家落地。**不是 bodyFall**（那是一个人倒下：装具散开、四肢先后落地）——
  // 这条是两只脚同时着地 + 一身装备被顿了一下，短得多。
  bodyLand(A, v) {
    const t = v.t;
    Thud(v, t, 130, 58, 0.12, 0.42, 240);
    Ticks(v, t + 0.02, 3, 0.09, 700, 2200, 0.12, 0.04, 5);
    const cloth = v.Noise("pink", 0.2);
    const band = v.Filter("bandpass", v.F(1200), 0.9);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t + 0.01, 0.1, 0.02, 0.05, 0.11);
    cloth.connect(band).connect(g).connect(v.out);
    v.Start(cloth, t + 0.01, 0.2);
    v.wetGain.gain.value = 0.12;
    v.Live(0.38);
  },

  // --- 手榴弹落地与滚动 ----------------------------------------------------
  // 木柄弹弹在砖地上：木柄先着地（一记干脆的木响），弹体跟着「当」一下。
  grenadeBounce(A, v) {
    const t = v.t;
    const wood = v.Osc("triangle", v.F(v.R(320, 430)));
    Glide(wood.frequency, t, v.F(400), v.F(200), 0.07);
    const wg = v.Gain(FLOOR);
    Hit(wg.gain, t, 0.3, 0.001, 0.07);
    wood.connect(wg).connect(v.out);
    v.Start(wood, t, 0.1);
    MetalClick(v, t + 0.012, v.R(1500, 2200), 0.16, 0.04, 10);
    v.wetGain.gain.value = 0.3;      // 巷子里那一记回声正是「它落在哪」的线索
    v.Live(0.26);
  },

  // 滚：木柄在砖地上翻着走，是一串越来越慢的短促摩擦。
  grenadeRoll(A, v) {
    const t = v.t;
    Ticks(v, t, 7, 0.55, 500, 1600, 0.1, 0.035, 6);
    const scrape = v.Noise("pink", 0.6);
    const band = v.Filter("bandpass", v.F(1100), 1.6);
    Glide(band.frequency, t, v.F(1400), v.F(700), 0.55);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.07, 0.04, 0.25, 0.28);
    scrape.connect(band).connect(g).connect(v.out);
    v.Start(scrape, t, 0.6);
    v.wetGain.gain.value = 0.28;
    v.Live(0.72);
  },

  // --- 爆炸中距与落屑 ------------------------------------------------------
  // 40—120 m：**这条街那头**。既没有近炸那层碎砖，也不是城外那记闷响 ——
  // 冲击还在（低频推得动胸口），高频已经被空气吃掉一半，尾巴带方位。
  explosionMid(A, v) {
    const t = v.t;
    Thud(v, t, 120, 34, 0.5, 0.62, 260);
    const body = v.Noise("brown", 0.9);
    const lp = v.Filter("lowpass", v.F(1600), 0.8);
    Glide(lp.frequency, t, v.F(1600), v.F(320), 0.7);
    const bg = v.Gain(FLOOR);
    Hit(bg.gain, t, 0.42, 0.004, 0.7);
    body.connect(lp).connect(bg).connect(v.out);
    v.Start(body, t, 0.9);
    // 尾巴：城里一次爆炸的回声要在墙之间来回滚一秒多。
    const tail = v.Noise("brown", 1.4);
    const tailLp = v.Filter("lowpass", v.F(600), 0.6);
    const tg = v.Gain(FLOOR);
    Hit(tg.gain, t + 0.06, 0.14, 0.05, 1.1);
    tail.connect(tailLp).connect(tg).connect(v.out);
    v.Start(tail, t + 0.06, 1.35);
    v.wetGain.gain.value = 0.55;
    v.Live(1.55);
  },

  // 落屑：爆炸之后半秒到一秒，砖屑瓦片才落回地面。一串颗粒 + 一点点土。
  debrisFall(A, v) {
    const t = v.t;
    Grains(v, t, 9, 0.7, 900, 4200, 0.17);
    const dust = v.Noise("pink", 0.5);
    const band = v.Filter("bandpass", v.F(700), 1.1);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t + 0.05, 0.08, 0.05, 0.2, 0.22);
    dust.connect(band).connect(g).connect(v.out);
    v.Start(dust, t + 0.05, 0.5);
    v.wetGain.gain.value = 0.2;
    v.Live(0.95);
  },

  // --- 火焰点声源 ---------------------------------------------------------
  // 烧着的房子。**不是一条噪声**：火的听感由两层给 —— 一层持续的低频呼呼
  // （空气被抽进火里），一层随机的爆裂（木头炸开）。缺后者就是电吹风。
  fireSpot(A, v) {
    const t = v.t, dur = 2.2;
    const roar = v.Noise("brown", dur);
    const band = v.Filter("bandpass", v.F(320), 0.8);
    // 1.7 Hz 的慢飘：火是**呼吸**的，频心钉死立刻露馅（与 flareBurn 同一条理由）。
    const drift = v.Osc("sine", 1.7);
    const driftGain = v.Gain(v.F(120));
    drift.connect(driftGain).connect(band.frequency);
    v.Start(drift, t, dur);
    const g = v.Gain(FLOOR);
    Swell(g.gain, t, 0.26, 0.35, dur - 1.1, 0.7);
    roar.connect(band).connect(g).connect(v.out);
    v.Start(roar, t, dur);
    // 木头炸开：整段撒 12 记，各自不同频率。
    Ticks(v, t + 0.2, 10, dur - 0.6, 1200, 4800, 0.1, 0.04, 8);
    v.wetGain.gain.value = 0.3;
    v.Live(dur + 0.2);
  },

  // --- 机枪远场（三条）----------------------------------------------------
  // 与 rifleNraFar / rifleIjaFar 同一条道理：远处那一梭子不是把近处的调小，
  // 而是只剩低频的「咚咚咚」加一条长尾。射速仍按史实排（GunAuto 的 interval）。
  // **不走 GunAuto**：那条链有一层「机械层」（抛壳、供弹机构），两百米外根本
  // 听不见供弹机构 —— 那是贴着枪才有的东西。少这一层同时省下三个节点，
  // 而远场这三条与近场是**同时在响**的（交叉淡入带），预算上必须便宜。
  zb26Far(A, v) {
    GunFarAuto(v, { blastFreq: 380, blastLevel: 0.3, blastDecay: 0.09,
      thumpHi: 130, thumpLo: 56, thumpLevel: 0.24,
      tailDur: 0.6, tailLevel: 0.16, wet: 0.75 }, Clamp(v.burst ?? 3, 1, 8), 60 / 500);
  },
  type11Far(A, v) {
    GunFarAuto(v, { blastFreq: 420, blastLevel: 0.28, blastDecay: 0.085,
      thumpHi: 140, thumpLo: 60, thumpLevel: 0.22,
      tailDur: 0.6, tailLevel: 0.15, wet: 0.75 }, Clamp(v.burst ?? 4, 1, 8), 60 / 500);
  },
  type92Far(A, v) {
    GunFarAuto(v, { blastFreq: 330, blastLevel: 0.34, blastDecay: 0.11,
      thumpHi: 115, thumpLo: 48, thumpLevel: 0.28,
      tailDur: 0.8, tailLevel: 0.18, wet: 0.8 }, Clamp(v.burst ?? 3, 1, 8), 60 / 200);
  },

  // --- 枪尾（按空间档 × 枪种，六条）---------------------------------------
  // 这一层是**枪声之后那条尾巴**，与枪本身分开播：同一支枪在院子里、街上、
  // 屋里、开阔地留下的尾巴完全不同，而尾巴才是玩家读「我在什么地方打枪」的依据。
  // 分开的另一半理由是节点账：尾巴可以被预算闸单独丢掉，枪声不能。
  //
  // 早期反射一律**两记封顶**，屋里与街巷的差别写在**延迟与强度**上，不写在条数上：
  //   街巷 —— 两侧墙相距几米，反射在 15—25 ms 上，比直达声轻一半；
  //   屋里 —— 墙就在一米开外，反射挤在 5—12 ms 上，强度几乎与直达声相当。
  // 原来屋内那两条各建五条支路（20 个节点），实测把 Script_AudioTest 的
  // 「逐条播一遍」压过节点预算 —— 而多出来的三记反射在 8 ms 的间隔上根本分辨不出，
  // 花的是预算，买的是零。
  gunTailOpenRifle(A, v) { GunTail(v, { hz: 620, dur: 1.2, level: 0.16, wet: 0.8, taps: 0 }); },
  gunTailOpenMg(A, v) { GunTail(v, { hz: 460, dur: 1.4, level: 0.2, wet: 0.85, taps: 0 }); },
  gunTailStreetRifle(A, v) {
    GunTail(v, { hz: 900, dur: 0.7, level: 0.2, wet: 0.5, taps: 2, tapGap: 0.011, tapLevel: 0.4 });
  },
  gunTailStreetMg(A, v) {
    GunTail(v, { hz: 700, dur: 0.85, level: 0.24, wet: 0.55, taps: 2, tapGap: 0.011, tapLevel: 0.44 });
  },
  gunTailInteriorRifle(A, v) {
    GunTail(v, { hz: 1400, dur: 0.45, level: 0.26, wet: 0.32, taps: 2, tapGap: 0.0045, tapLevel: 0.72 });
  },
  gunTailInteriorMg(A, v) {
    GunTail(v, { hz: 1100, dur: 0.5, level: 0.3, wet: 0.36, taps: 2, tapGap: 0.0045, tapLevel: 0.78 });
  },
};

/** 对外暴露的音效名清单，给冒烟测试与关卡编辑器用。 */
export const SOUND_NAMES = Object.keys(RECIPES);

/**
 * 枪尾（接线批 INT4 的六条 gunTail* 共用）。
 *
 * 一条按空间档变形的衰减噪声：开阔地是稀疏而长的散开，街巷是几记离散的早期反射
 * 之后很快糊掉，屋里几乎只剩那几记反射本身（墙太近，时间差不到 10 ms）。
 * 早期反射用 taps 条延迟支路做 —— 卷积混响给不了这个：那一层是**弥散**的，
 * 而「墙就在旁边」恰恰要的是听得出个数的几下。
 *
 * 定义写在 RECIPES 之后：函数声明会提升，配方运行时它一定已经存在，
 * 而放在这里能把这一批的改动全部收在文件尾部（与并行改引擎的那一批不打架）。
 */
function GunTail(v, { hz, dur, level, wet, taps, tapGap = 0.0075, tapLevel = 0.42 }) {
  const t = v.t;
  const src = v.Noise("brown", dur);
  const lp = v.Filter("lowpass", v.F(hz), 0.7);
  Glide(lp.frequency, t, v.F(hz), v.F(Math.max(160, hz * 0.35)), dur * 0.8);
  const g = v.Gain(FLOOR);
  Hit(g.gain, t, level, 0.02, dur);
  src.connect(lp).connect(g).connect(v.out);
  v.Start(src, t, dur);
  // 早期反射：6—38 ms 上几记离散的强反射（与 BuildImpulse 的 street IR 同一组延迟）。
  // **全部支路共用一条低通**：反射比直达声闷是因为多走了一趟墙面，
  // 而那趟墙面对每一记反射是一样的 —— 每条支路各挂一条滤波器听感上分辨不出，
  // 只是白花节点（屋内那两条因此从 20 个降到 16 个，实测预算峰值差得出来）。
  if (taps > 0) {
    const tapLp = v.Filter("lowpass", v.F(hz * 0.8), 0.6);
    tapLp.connect(v.out);
    for (let i = 0; i < taps; i += 1) {
      const delay = v.Delay(0.005 + i * tapGap + v.rng() * 0.003);
      const tapGain = v.Gain(tapLevel / (i + 1));
      g.connect(delay).connect(tapGain).connect(tapLp);
    }
  }
  v.wetGain.gain.value = wet;
  v.Live(dur + 0.25);
}

/**
 * 机枪的**远场**连发（zb26Far / type11Far / type92Far）。
 *
 * 与 GunAuto 的差别只有一处，但那一处是有理由的：**没有机械层**。
 * 抛壳与供弹机构是贴着枪才听得见的东西，两百米外只剩下爆音、低频冲击与尾巴。
 * 少这一层同时把节点从 14 降到 10 —— 远场与近场在 45—130 m 的交叉带里是
 * **同时在响**的，两条链一起进预算，所以远场这一条必须便宜。
 */
function GunFarAuto(v, p, shots, interval) {
  const t0 = v.t;
  const span = interval * (shots - 1);
  const srcDur = span + 0.25;

  const blast = v.Noise("white", srcDur);
  const band = v.Filter("bandpass", v.F(p.blastFreq), 1.0);
  const blastGain = v.Gain(FLOOR);
  blast.connect(band).connect(blastGain).connect(v.out);

  const thump = v.Osc("sine", v.F(p.thumpHi));
  const thumpGain = v.Gain(FLOOR);
  thump.connect(thumpGain).connect(v.out);

  for (let i = 0; i < shots; i += 1) {
    const at = t0 + i * interval;
    Hit(blastGain.gain, at, p.blastLevel * v.R(0.88, 1.06), 0.001, p.blastDecay);
    Glide(thump.frequency, at, v.F(p.thumpHi * v.R(0.96, 1.04)), v.F(p.thumpLo), 0.11);
    Hit(thumpGain.gain, at, p.thumpLevel, 0.002, 0.11);
  }
  v.Start(blast, t0, srcDur);
  v.Start(thump, t0, srcDur);

  const tail = v.Noise("brown", span + p.tailDur + 0.1);
  const tailLp = v.Filter("lowpass", v.F(620), 0.6);
  const tailGain = v.Gain(FLOOR);
  Swell(tailGain.gain, t0 + 0.02, p.tailLevel, 0.03, span, p.tailDur);
  tail.connect(tailLp).connect(tailGain).connect(v.out);
  v.Start(tail, t0 + 0.02, span + p.tailDur + 0.1);

  v.wetGain.gain.value = p.wet;
  v.Live(span + p.tailDur + 0.35);
}

// 连发武器的默认点射长度。游戏逻辑若逐发驱动，传 { burst: 1 } 即可。
const BURST_DEFAULT = { zb26: 3, type11: 4, type92: 3 };

// 低优先级音效：节点预算紧张时先丢它们（丢一记脚步没人发现，丢一发爆炸就穿帮）。
// 低优先级的门槛按 NODE_BUDGET * LOW_PRIORITY_HEADROOM 算，给要紧的声音留位置。
// 【2026-08-20】rifleNraFar / rifleIjaFar 从这张表里**拿掉**了。
// 它们原来只是环境床上的幽灵枪声（可丢），现在是 PlayGunshot 里「一百米外那一枪」
// 的**主声**——把主声列进「预算紧张先丢」，等于交火最激烈的时候远处全体静音。
const LOW_PRIORITY = new Set([
  "footstepDirt", "footstepRubble", "impactDirt", "impactBrick",
  "impactWood", "shellDrop",
  // --- 接线批 INT4（2026-09-08）-------------------------------------------
  // 新接的四类脚步与全部身体 / 装具 foley 同一档：丢一记没人发现。
  // **bulletCrack / bulletWhizz / ricochet 故意不列进来** —— 弹啸是「有人在打我」
  // 的唯一线索，把它列进「预算紧张先丢」，等于交火最激烈时玩家反而听不出被瞄着；
  // 它的节流由 Data_Tuning_Audio.NEAR_MISS 那三个数管（同帧 2 条 / 100 ms 3 条），
  // 那是**限速**，不是「有位置才响」。
  "footstepWood", "footstepStone", "footstepGrass", "footstepMud",
  "clothMove", "gearRattle", "debrisFall",
  // 枪尾同理：它是枪声后面那一层，丢了只损失空间感，不损失「有人开枪」这件事。
  "gunTailOpenRifle", "gunTailOpenMg", "gunTailStreetRifle", "gunTailStreetMg",
  "gunTailInteriorRifle", "gunTailInteriorMg",
]);
const LOW_PRIORITY_HEADROOM = 0.62;

/**
 * 近射 → 远射的配方映射。**两段不同的录音**，不是同一段做滤波。
 *
 * DICE 明确说过滤波做不出距离感：远处那一枪之所以是「咚——」而不是「啪」，
 * 是因为声音在空气和地形里滚过几百米之后**波形本身变了**（直达声的瞬态被吃掉、
 * 地面反射与回声接在后面拖成一条尾巴），低通只能把高频削掉，削不出那条尾巴。
 * 我们原来正是滤波路线（Play() 里那条 airHz = 18000/(1+d×0.09)）——
 * 实测把 30 个日兵摆到 15/120/300 m 三档跑 900 帧，63 次开枪里 Far 出现 **0 次**，
 * 最远 120 m 处播的仍是近场 rifleNra。资产早就做完了，线一直没接。
 *
 * 素材（Data_SfxSources.mjs）：
 *   rifleNraFar = FLYSOUND 莫辛纳甘 50 m 外实录
 *   rifleIjaFar = Watson Wu「来弹视角」实录（弹头掠过在前、枪声后到）
 * 捷克式/十一年式/九二式没有对应的远场实录，就**不做**这层 —— 拿步枪的远场去配
 * 机枪只会把两种枪的辨识度一起毁掉，宁可少一层。
 */
const FAR_CUE = { rifleNra: "rifleNraFar", rifleIja: "rifleIjaFar" };
/** FAR_CUE 的值集合 —— 远场那两条自己也是枪，culling 与配平都要认得它们。 */
const FAR_CUE_TARGET = new Set(Object.values(FAR_CUE));

// 交叉淡入区间。近场素材是 1 m 近距录音、远场素材录于 50 m 外，
// 所以纯近场只留到 45 m，45—130 m 两层同时在（等功率），130 m 外只剩远场。
const GUN_NEAR_M = 45;
const GUN_FAR_M = 130;

/**
 * **这么远以外的枪不再逐发播**（2026-08-20）。
 *
 * 那么远的一枪直达声只剩 −32 dB，方位也早被 equalpower 抹平了 —— 它对玩家唯一的
 * 作用就是往混响里再倒一勺。默认环境不再拿带人声的战斗人群床填这个空白：
 * 远处的战况由可辨位置的实际交火、低频远炮与场景风声交代，
 * 不是四十个各自为战的点声源。
 *
 * 160 m 这个数不是拍的：远场素材录于 50 m 外、近远交叉在 130 m 上收尾，
 * 再往外**没有任何一层还在变化**，只是同一条尾巴越来越轻。
 * 留 30 m 余量给「刚退出交叉带那一段」，到 160 m 交给床。
 *
 * **诚实地说：现有七关它几乎一次都不触发** —— AI 的交火距离由武器射程管着，
 * 场上真在对射的基本都在 130 m 以内，两三百米外那几个兵根本没在开枪
 * （`drops.distance` 里记到的那些几乎全是 VOICE_CULL_M 掐掉的喊话）。
 * 所以这一条是**闸**，不是这一轮听感变化的功臣；
 * 它保的是「哪一关的视野一旦拉开，也不会再糊回去」。
 */
const GUN_CULL_M = 160;

/**
 * 超过这个距离的位置音按低优先级算（预算紧张时先丢它们）。
 * 45 m 正好是近场素材的作用边界：再远就已经在往远场那段录音上过渡了。
 */
const FAR_LOW_PRIORITY_M = 45;

/** 人喊一嗓子传得到的距离。四百米外那句「卧倒」不是听不清，是根本不存在。 */
const VOICE_CULL_M = 90;

/**
 * 兜底：再远的位置音一概不播。
 *
 * 炮、爆炸、军号本来就传得远，所以这个数给得很松（panner 的 maxDistance 是 600）。
 * 它防的是另一类事：某一声离玩家三四百米，于是它以 −40 dB 的干声进来，
 * 唯一听得见的成分是那条不带方位的混响尾巴。**听不见的东西不该占混响。**
 */
const CULL_DEFAULT_M = 400;

/**
 * 这一声是不是**人在说话**（喊话口令 + 章节台词，两者都是 `voice.<key>`）。
 *
 * 【2026-09-09】单开一个判据，因为语音在三处要**走另一条规矩**（见各处引用）：
 *   1. 不进远声组 —— 远声组是给「远处那一片战斗」让路用的，玩家一开枪整组压
 *      −6 dB。把台词扔进去的结果是「班长在五十米外喊话，我一开枪他就没声了」。
 *   2. 不许被 voice stealing 偷 —— 台词是长音、电平低，正好是偷声部算法眼里
 *      最该丢的那一条；而漏听一句台词是玩家会报的 bug，漏一记远处的脚步不是。
 *   3. 遮挡封顶（OCCLUSION_MAX_VOICE）—— 隔着一堵墙的喊话本来就该听得见，
 *      那正是「喊」的意义。
 * 这三条都不是配平，是**可懂度**：语音要么听得清，要么等于没有。
 */
function IsVoiceCue(name) { return typeof name === "string" && name.startsWith("voice."); }

/**
 * 语音的遮挡上限。1.0 折 −12 dB + 800 Hz，那时一句「顺哥！机枪停了！」
 * 只剩下一团闷响；0.5 折 −6 dB + 4.0 kHz —— 明显在墙那头，但每个字都还在。
 */
const OCCLUSION_MAX_VOICE = 0.5;

/**
 * 爆炸类 cue，以及它们的遮挡上限。
 *
 * 【2026-09-09 为什么爆炸要单开一条】用户第三次报「炮弹还是没有声音」，这次
 * 量出来了：军列旁边 11 m 落一发 75 炮，主线输出峰值 −23.6 dB —— 比同一场里
 * 一句台词（−11.2 dB）**低 12 dB**，与玩家自己那一枪（−21.1 dB）同档。
 * 一发落在十一米外的炮弹在物理上比说话响一百多分贝；游戏里它比说话小，
 * 那就不是「压得狠」，那是**这件事没有发生**。
 *
 * 三处叠出来的：
 *   1. Panner 的 refDistance 3.5 m —— 按「一个枪口」配的。爆炸不是点声源：
 *      火球本身就有好几米，近场比一支枪大一个数量级。改由调用侧交
 *      `sourceSizeM`（接线层给的就是爆炸半径）。11 m 上 −9.4 → −3.6 dB。
 *   2. 遮挡 —— 木板车厢让探针给了 0.45，折 −5.4 dB 加一道低通。低频**绕得过**
 *      一层木板，冲击波更是直接穿过去；封到 0.25。
 *   3. 耳鸣（Deafen）30 ms 内把总线低通压到 520 Hz —— 把**触发它的那一声自己**
 *      的高频吃掉了。现在留一段起音期（见 Deafen 的 holdS）。
 */
function IsBlastCue(name) {
  return name === "explosionNear" || name === "explosionMid" || name === "shellImpact";
}
const OCCLUSION_MAX_BLAST = 0.25;

/**
 * 喊话的嘴离脚底多高。与 `Data_Companions.COMPANION_TUNING.mouthY`（1.52）同值 ——
 * 剧情台词走那一条，战场口令走这一条，同一个人的两句话不能站在两个高度上。
 */
const BARK_MOUTH_Y = 1.52;

/** 这一声还值不值得播（按名字分档，见上面三个常数）。 */
function CullDistance(name) {
  // 两条飞机声都按机身在几百米外起播（drone 在进入段第一帧、planeDive 在开火前 3.5 s），按默认距离剔除就一条都不响。
  if (name === "planeDrone" || name === "planeDive") return PLANE_DRONE_CULL_M;
  if (FAR_CUE[name] || SAMPLE_BURST[name] || FAR_CUE_TARGET.has(name)) return GUN_CULL_M;
  if (name.startsWith("voice.")) return VOICE_CULL_M;
  return CULL_DEFAULT_M;
}

/**
 * 这一声算不算「枪」。
 * 写成函数而不是一张集合：FAR_CUE / SAMPLE_BURST 两张表随武器接线增长，
 * 抄一份出来必然会漂（新加一把机枪，尾巴与环境闪避就悄悄不认它了）。
 */
function IsGunCue(name) {
  if (FAR_CUE[name] || FAR_CUE_TARGET.has(name) || SAMPLE_BURST[name]) return true;
  return GUN_EXTRA_CUES.has(name);
}

/**
 * 这一声走不走传播延迟。
 * 枪、炸、炮、扫射走；脚步、拉栓、喊话、环境床不走 ——
 * 前者玩家看得见「发生的那一刻」（枪口焰、爆闪），延迟才有意义；
 * 后者只会变成「音画不同步」。
 * `gunTail*` 必须跟着走，不然尾巴会赶在本体之前到（那是彻底的穿帮）。
 */
function IsPropagated(name) {
  if (IsGunCue(name) || PROPAGATION_CUES.has(name)) return true;
  return name.startsWith("explosion") || name.startsWith("strafe") || name.startsWith("gunTail");
}

/** 按区与武器类挑尾巴 cue。素材没做的那几条由 Play 静默跳过（RECIPES 里查不到就返回 null）。 */
function GunTailCue(zone, weaponClass) {
  return `gunTail${GUN_TAIL_ZONE[zone] || "Street"}${GUN_TAIL_CLASS[weaponClass] || "Rifle"}`;
}

/**
 * 混响 send 的距离衰减。**这是「一打起来就糊成一片」的根子。**
 *
 * 混响 send 分在 Panner **之前**（那是对的，湿信号不该吃方位衰减），
 * 但它原来完全不吃**距离**衰减，反而还随距离往上加：`1 + d*0.03`，
 * 加到 1.0 封顶。于是一百六十米外那一枪：
 *   干声 3.5/(3.5+0.9×156.5) = 0.024，湿 0.42×2.6→钳到 1.0 —— **湿是干的 20 倍**。
 * 实测七关逐关站在玩家耳朵里听十五秒，整场的湿/干能量比在 **4.2—19.8 倍**之间
 * （最糟的是「三·反击」那一关的夜战：开阔地的 IR 拖 2.6 s，中位交火距离 112 m）：
 * 玩家听到的几乎全是卷积混响，
 * 而混响是立体声、不带方位、拖 0.95 s（街）到 2.6 s（开阔地）的尾巴。
 * 「不知道从哪儿来的、带拖尾的、糊在一起的音效」——**那就是它，一层不差**。
 *
 * 正确的模型不是「混响不衰减」。房间里混响场确实近似均匀，但那说的是
 * **同一个房间里**；一支枪在四百米外的野地上响，你这儿的混响场里当然也只剩
 * 那一点点能量。所以湿也按距离掉，只是掉得比直达声慢：
 *   干 ∝ 1/(1+d)，湿 ∝ 1/√(1+d) —— dB 上正好一半。
 * 湿/干比因此仍然随距离**上升**（远处更「空」的听感保住了），
 * 但绝对电平跟着走：一百六十米外的尾巴比原来轻 16 dB。
 */
function WetFalloff(distance) {
  // 与 panner 的 inverse 曲线同一条（refDistance 3.5 / rolloff 0.9），取平方根。
  const dry = 3.5 / (3.5 + 0.9 * Math.max(0, distance - 3.5));
  return Math.sqrt(dry);
}

/**
 * 每个配方的节点开销（实测值，见 scratchpad 的 Measure 脚本）。
 * 拿它做**发声前**的准入判断，比「先播了再看超没超」准得多 ——
 * 后者一旦超标只能眼看着，WebAudio 没有「撤销一个已排程的音」这回事。
 * 配方改了要重新量；宁可写大不写小。
 */
const NODE_COST = {
  zb26: 19, bolt: 19, stripperLoad: 19, shellImpact: 19, bodyFall: 19,
  type92: 18, explosionNear: 18,
  rifleNra: 16, rifleIja: 16, type11: 16, bayonetHit: 16, magIn: 15,
  rifleNraFar: 14, rifleIjaFar: 14, impactMetal: 14,
  grenadePin: 13, impactBrick: 13, impactWood: 13, footstepRubble: 13, hurt: 13,
  dadaoHit: 12, shellIncoming: 11, whistle: 11,
  // 断肢两条：照各自建了几个节点数出来再留一格（sever = 闷响 3 + 湿裂 3 + 骨断 3
  // + 碎屑 3；land 少一层骨）。
  goreSever: 14, goreLimbLand: 11,
  shellDrop: 22,
  grenadeThrow: 10, launcherPop: 10, impactDirt: 10, impactFlesh: 10,
  footstepDirt: 10, heartbeat: 10,
  explosionFar: 9, dadaoSwing: 7, bugleCharge: 7,
  // 命中/击杀回执：一条 Thud（4 节点）+ 一条带通噪声（4 节点），击杀多一条 Thud。
  // 写实一点点是故意的 —— 这两条**绝不许被预算闸门丢掉**（见 Play 的 priority）。
  hitConfirm: 9, killConfirm: 13,
  // 缺口批 A2 的十五条兜底配方（2026-08-29）。数是照各自建了几个节点数出来的、
  // 再往上留一格 —— 这张表管的是**合成回落**那条路；采样盖上去之后 LoadSfxPack
  // 会把它们统一改成 2（连发的改 8），见 LoadSfxPack 头注第 3 条。
  // 不写这几行的话默认取 19：一记照明弹燃烧就吃掉六分之一预算，而它是要一直烧着的。
  strafeNear: 16, mgCharge: 15, strafeDirt: 12, strafeFar: 10,
  execScream: 9, flareLaunch: 9, flareIgnite: 9,
  flareBurn: 8, telegraphKey: 8, telegraphHum: 8, mgOverheat: 8,
  painMoan: 7, hitGrunt: 7, planeDive: 7, flareOut: 6,
  // 会飞的引擎持续声：三个振荡器 + 拍频 LFO + 滤波 + 两个 gain，整条航线只有一条。
  planeDrone: 9,
  // --- 接线批 INT4（2026-09-08）：照各自建了几个节点数出来，再往上留两格 -----
  // 这一档里 **bulletCrack 是要紧的那一条**：它按每一发结算，一梭子机枪能在
  // 100 ms 内请求三条（限速见 Data_Tuning_Audio.NEAR_MISS）。写小了会让弹啸挤掉枪声。
  bulletCrack: 9, bulletWhizz: 5, ricochet: 7, impactStone: 11,
  footstepWood: 7, footstepStone: 8, footstepGrass: 8, footstepMud: 8,
  clothMove: 5, gearRattle: 8, breathHeavy: 5, bodyLand: 11,
  grenadeBounce: 7, grenadeRoll: 8,
  explosionMid: 11, debrisFall: 8,
  // 一直烧着的东西：同时最多四条（FIRE_SPOT.maxVoices），四条就是 40 个节点，
  // 已经是三分之一预算 —— 这也是那个 4 的由来。
  fireSpot: 10,
  // 远场三条走 GunFarAuto（没有机械层），比近场的 GunAuto 少四个节点。
  zb26Far: 10, type11Far: 10, type92Far: 10,
  // 枪尾：开阔地只有一条衰减噪声；街巷与屋内各两记早期反射（共用一条低通），
  // 差别在延迟与强度不在条数 —— 见 GunTail 的注释，那也是这一批全部压到 ≤ 11 的原因：
  // 逐条播一遍（Script_AudioTest）时，一条 20 节点的音会在预算最紧的时刻被丢掉。
  gunTailOpenRifle: 5, gunTailOpenMg: 5,
  gunTailStreetRifle: 10, gunTailStreetMg: 10,
  gunTailInteriorRifle: 10, gunTailInteriorMg: 10,
};
const DEFAULT_COST = 19;

/**
 * 混音表：每个音效的最终配平系数。
 *
 * 数值不是拍脑袋来的 —— 是把每个音效在 OfflineAudioContext 里实拍一遍、量出
 * 峰值之后配的（见 scratchpad/Offline.mjs）。配方里的那些 level 管的是「这一层
 * 在这个声音内部占多少」，混音表管的是「这个声音在整场里站多高」，两件事分开，
 * 改音色的时候才不会顺手把平衡也改掉。
 *
 * 两条实拍才发现的问题，就靠这张表修的：
 *   · 连发的多层叠加冲到 1.16（削顶）—— 单发不会，因为没有连续的尾巴垫着。
 *   · 拉栓 / 拉弦 / 挥刀实拍只有 0.05，比枪声低 20 dB 多。这几个是**玩法反馈**
 *     （换没换弹、刀挥空没有），听不见等于没有。
 */
const MIX_GAIN = {
  zb26: 0.71, type11: 0.70, type92: 0.67,
  bolt: 3.9, grenadePin: 3.9, hurt: 3.6, dadaoSwing: 3.0,
  rifleNraFar: 2.2, rifleIjaFar: 2.2,
  impactMetal: 1.75, grenadeThrow: 1.5, impactBrick: 1.5,
  bayonetHit: 1.4, explosionNear: 1.25,
  bodyFall: 0.65,   // 实拍能量比步枪声还高，一个人倒下不该比开枪响
  shellDrop: 1.0,   // 空壳二十克，配方里的 level 已经压到 0.2，这儿不再动
  // 回执不空间化，整条链上没有距离衰减也没有空气低通，配平只能靠这里。
  // 0.55 是"枪响完那 40 ms 的空当里听得见、但绝不盖过枪声"的量。
  hitConfirm: 0.55, killConfirm: 0.62,
  // --- 接线批 INT4（2026-09-08）的合成回落配平 -----------------------------
  // 只对**合成那一层**有效：采样盖上去之后 LoadSfxPack 会把 MIX_GAIN[cue] 重写成
  // SAMPLE_MIX[cue] ?? 1（见 LoadSfxPack）。素材落地时那张表要一起补，
  // 不补的话新 cue 会以 1.0 出场，比脚步响四倍。
  //
  // 弹啸要**站得很高**：它是「有人在打我」这件事的唯一线索，
  // 而它只有十几毫秒 —— 与枪声同一个响度它仍然会被盖过去。
  bulletCrack: 1.35, bulletWhizz: 1.1, ricochet: 1.2,
  impactStone: 1.5,
  // 脚步与身体 foley 一律压到脚步那一档：每秒响一两下的东西不能与枪声同量级。
  footstepWood: 1.0, footstepStone: 1.0, footstepGrass: 1.1, footstepMud: 1.0,
  clothMove: 1.6, gearRattle: 1.6, breathHeavy: 1.4, bodyLand: 0.8,
  // 手榴弹落在脚边那两声是**玩法反馈**（还有几秒、往哪儿躲），要听得见。
  grenadeBounce: 2.2, grenadeRoll: 2.0,
  explosionMid: 1.0, debrisFall: 1.3,
  // 一直在响的东西按 flareBurn 那一档（比脚步略高），不按事件配平。
  fireSpot: 0.9,
  zb26Far: 2.0, type11Far: 2.0, type92Far: 2.0,
  // 枪尾是**贴在枪声后面的一层**，不是独立的声音：站高了就成了两枪。
  gunTailOpenRifle: 0.9, gunTailOpenMg: 0.9,
  gunTailStreetRifle: 0.9, gunTailStreetMg: 0.9,
  gunTailInteriorRifle: 0.9, gunTailInteriorMg: 0.9,
};

// ===========================================================================
// 实录采样层
//
// 2026-08-19 起，上面那批合成配方**全部被实录采样盖住**（素材来源与切割
// 参数见 Data_SfxSources.mjs / Script_SfxBake.mjs）。合成那套一行没删，理由：
//   · 采样是 fetch 来的，会 404、会被离线、会在没网的本地文件协议下失败；
//     盖不上去就自动退回合成，**没有音效的战场也仍然是能打的战场**。
//   · 出图模式（?shot=1）根本不建 AudioContext，那条路上采样从来不参与。
//
// 为什么不是「直接把 wav 塞进去播」：
//   1. **连发的射速不能由素材决定**。素材是三连发的录音，射速就被钉死在录音里了；
//      九二式「啄木鸟」200 rpm 的身份证会当场作废。所以采样只切**单发**，
//      射速仍由这张表按史实排（与合成版同一组数字）。
//   2. **同一个样本连播二十次会听出复读**。所以逐发 ±3% 变调 + 多变体随机挑，
//      与合成版靠随机种子取噪声偏移是同一个道理。
//   3. **混音表要重配**。合成版的 MIX_GAIN 是拿合成峰值配的；采样在烘焙时统一
//      归一化过，峰值都在 0.85—0.97，直接用的话一记脚步和一发炮弹一样响。
// ===========================================================================
export const SFX_BASE = "Audio/Sfx/";
export const AMB_BASE = "Audio/Amb/";
export const MUSIC_BASE = "Audio/Music/";
// 7 → 8：缺口批 A2 的十五个 cue 从 pendingCues 搬进 cues（2026-08-29）。
// 清单本身换了内容，戳不动的话浏览器会拿着旧清单去要新文件（或者反过来）。
// 9 → 10：九条爆炸/弹着成品换了素材并加了 38 Hz 高通（2026-09-09）。
// 10 → 11：近中远爆炸与贴耳音爆/呼啸共 16 条换为 SeedAudio 1.0 成品。
// **文件名一个没变**，所以不抬这个戳的话，玩家听到的永远是缓存里的旧爆炸。
// 12 → 13：断肢两音（goreSever / goreLimbLand，各两变体）进清单（2026-09-11）。
// 这一次是**加条目**：戳不动的话浏览器拿着缓存里的旧清单，新素材永远载不上，
// 而 LoadSfxPack 盖不上去是静默的 —— 表现只是「断肢还是合成音」。
// （同一天 Codex 那边把戳改成了日期式，合并后取带两件事的同一个新戳。）
export const SFX_PACK_VERSION = "20260911planeexplosion";
export const AMB_PACK_VERSION = "20260912trainonly";
export const MUSIC_PACK_VERSION = "5";

// ---- 采样取数：并发闸 + 重试 ----------------------------------------------
//
// 三个包是**一解锁就同时开拉**的：一百多条人声 + 56 条音效 + 10 条环境床 + 9 段音乐，
// 一百三十来个请求一口气全甩出去。这在本地预览下不总是安全的 —— 同一台机器上
// 往往还有别的 agent 在跑重活，突发里被掐掉几条连接是常事。而这里每一条失败都是
// **静默**的：吞掉、计数、退回合成，表现只是「怎么听着还是那套合成音」。
//
// 两道保险：
//   · 并发闸 8 条 —— 把突发摊平。本地盘上总时长基本不变（瓶颈从来不是并发度）。
//   · 失败重试两次 —— 一次抖动不该让**整包**退回合成：清单读不到就是全包皆输。
//
// 还有一条同样要紧：把**解析后的绝对 URL** 写进错误里。载不到时最该知道的是
// 「它到底去要了哪个地址」——多 agent 并行时最常见的原因就是浏览器指在了别人
// 那棵树上，而那种错光看「70 条读不到」是永远查不出来的。
const AUDIO_FETCH_LIMIT = 8;
// 整包最多自动拉几轮（每轮内部每个文件还各自重试 2 次）。
const PACK_ATTEMPTS = 2;
let audioFetchLive = 0;
const audioFetchWaiting = [];

function AudioFetchAcquire() {
  if (audioFetchLive < AUDIO_FETCH_LIMIT) { audioFetchLive += 1; return Promise.resolve(); }
  return new Promise((resolve) => audioFetchWaiting.push(resolve));
}

function AudioFetchRelease() {
  const next = audioFetchWaiting.shift();
  if (next) next();                 // 名额直接交棒，不回落计数，否则会超发
  else audioFetchLive -= 1;
}

/** 把相对路径解析成绝对 URL，只用来写错误信息。 */
export function AudioAssetUrl(url) {
  try {
    const here = (typeof location !== "undefined" && location.href) ? location.href : "http://127.0.0.1/";
    return new URL(url, here).href;
  } catch { return url; }
}

/**
 * 开机预取下来、还没人要的那些字节（url → ArrayBuffer）。
 *
 * 【2026-09-09 为什么要有这张表】解码需要 AudioContext，而 AudioContext 要等
 * 用户手势 —— 但**下载不需要**。原来三个包整整齐齐排在 Unlock 之后，于是玩家
 * 按下「进城」的那一刻才开始拉 4.3 MB（Amb 2.0 + Sfx 2.3）。线上实测：点下去
 * 到第一声环境床 **10.4 s**，而第一关开场是车厢，`trainInterior` 的 fallbackWind
 * 是 0 —— 这十秒是**全静音**，玩家报的「安安静静了 10 s 才开始有声音」就是它。
 *
 * 开机本来就要几十秒（大部分时间网络是闲的：烘图、建物理、装骨架都是 CPU），
 * 把这两包的下载挪进那段时间里。解码仍然在 Unlock 之后，一行语义都没变。
 *
 * 取走就删：`decodeAudioData` 会**吞掉**（detach）传进去的 ArrayBuffer，
 * 同一份不能给两个人。
 */
const PREFETCHED_AUDIO = new Map();

/**
 * 取一份音频资产（ArrayBuffer），带并发闸与重试。
 * 失败时抛出的异常里带绝对 URL —— 上层一律把它原样计进 *Errors。
 */
export async function FetchAudioAsset(url, retries = 2) {
  const prefetched = PREFETCHED_AUDIO.get(url);
  if (prefetched) { PREFETCHED_AUDIO.delete(url); return prefetched; }
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await AudioFetchAcquire();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.arrayBuffer();
    } catch (err) {
      last = err;
    } finally {
      AudioFetchRelease();
    }
    // 退避 40 / 160 ms：突发掐连接那种失败重来一次就够，等太久会把开局拖长。
    if (attempt < retries) {
      const wait = 40 * (attempt + 1) * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw new Error(`${(last && last.message) || "取不到"} @ ${AudioAssetUrl(url)}`);
}

/** 同上，但拿的是 JSON 清单。 */
export async function FetchAudioJson(url, retries = 2) {
  const buf = await FetchAudioAsset(url, retries);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buf)));
}

/** 连发武器的射速（秒/发），与合成版 GunAuto 用的是同一组史实数字。 */
const SAMPLE_BURST = {
  zb26: 60 / 500,      // 捷克式 500 rpm
  type11: 60 / 500,    // 十一年式 500 rpm
  type92: 60 / 200,    // 九二式 200 rpm ——「啄木鸟」的间隔
  // --- 接线批 INT4（2026-09-08）：三挺机枪的远场 --------------------------
  // **射速与近场是同一组数**（同一挺枪，只是听的位置换了）。
  // 登记在这儿还有一件副作用是要的：CullDistance 会因此把这三条按枪声那一档
  // （GUN_CULL_M 160 m）剔除，而不是按默认的 400 m —— 它们本来就是远场那一层，
  // 再往外没有任何东西还在变化。
  zb26Far: 60 / 500,
  type11Far: 60 / 500,
  type92Far: 60 / 200,
};

/**
 * 采样版混音表：素材已归一化，这张表定的是「这个声音在战场上站多高」。
 * 与合成版的 MIX_GAIN 是两套数，不能混用。
 * 几条不直观的：
 *   · 操作音（拉栓/压弹/弹匣）录得极干净但很轻，要往上提 —— 它们是**玩法反馈**，
 *     听不见等于没有。
 *   · 脚步压到 0.3 以下：它每秒响一两下，与枪声同一个量级的话整场只剩脚步声。
 *   · 远射两条压到 0.45 上下：环境床按概率一直在撒，撒得太响玩家就分不出
 *     「远处在打」和「打到我头上了」。
 */
const SAMPLE_MIX = {
  explosionNear: 1.0, shellImpact: 0.95, launcherPop: 0.72,
  rifleNra: 0.88, rifleIja: 0.86, type92: 0.8, zb26: 0.76, type11: 0.72,
  explosionFar: 0.5, rifleNraFar: 0.42, rifleIjaFar: 0.46, shellIncoming: 0.62,
  bolt: 0.95, stripperLoad: 1.0, magIn: 1.0, grenadePin: 0.7, grenadeThrow: 0.5,
  dadaoSwing: 0.5, dadaoHit: 0.78, bayonetHit: 0.8,
  // 断肢两条：sever 与 dadaoHit 同一档（同样是「一段身体被切下来」这件事，
  // 而且十有八九与那一发枪声同时响，站低了就被枪盖掉）；落地那一记按 bodyFall
  // 再压一点 —— 掉的是一条胳膊不是一个人。
  goreSever: 0.78, goreLimbLand: 0.45,
  impactBrick: 0.55, impactDirt: 0.45, impactWood: 0.5, impactMetal: 0.55, impactFlesh: 0.72,
  footstepDirt: 0.26, footstepRubble: 0.28, bodyFall: 0.55, hurt: 0.8, heartbeat: 0.75,
  // 弹壳与脚步同一档：每开一枪响一次的东西，与枪声同量级的话整场只剩叮叮当当。
  shellDrop: 0.3,
  bugleCharge: 0.7, whistle: 0.6,
  // --- 缺口批 A2（2026-08-29 接线）---------------------------------------
  // 三条人声：hitGrunt 与 hurt 同一档（都是「有人中弹了」这件事），
  // execScream 压低是**策划要求**（第三关处决段隔着墙、低概率、低音量 ——
  // 那一声的作用是让玩家明白里面在干什么，不是展览）；
  // painMoan 更低：它是持续响着的背景，与枪声同量级的话整场只剩这个人在哼。
  hitGrunt: 0.8, execScream: 0.55, painMoan: 0.5,
  // 照明弹一个循环四条。燃烧那条**滞空好几十秒**，所以压到全表最低的一档
  // （比脚步略高）—— 一直在响的东西不能按「一次事件」配平；
  // 发射与点燃是事件，可以站高一点。
  flareLaunch: 0.7, flareIgnite: 0.6, flareOut: 0.45, flareBurn: 0.35,
  // 电键是**玩法反馈**（这一下敲进去没有），与拉栓同一条理由，要听得见；
  // 电流底噪同样是一直在响的床，压到 0.3。
  telegraphKey: 0.7, telegraphHum: 0.3,
  // 日机：planeDive 全表第二响 —— 它压到头顶来这件事必须盖过场上的枪声，
  // 那正是第一关那一拍的全部内容。近扫射与 type92 同档，远扫射与远射两条同档。
  planeDive: 0.9, strafeNear: 0.85, strafeDirt: 0.6, strafeFar: 0.5,
  // 重机枪两件都是玩法反馈：卡壳清没清、还能不能打。拉柄与 bolt 同一档。
  mgCharge: 0.95, mgOverheat: 0.7,
  // --- 对标 3A 素材补缺批（2026-09-08 接线）-------------------------------
  // 【2026-09-09】弹啸从 0.9 / 0.7 压到 0.55 / 0.42。
  // 原来的理由是「弹啸是压制反馈，必须盖过远处的枪，所以与本体枪声同档」——
  // 那条理由在实拍面前站不住：弹啸走的是**近失点**（离听者 0.5—2 m，
  // panner 的 inverse 在 refDistance 3.5 m 以内一律不衰减），本体枪声走的是
  // 三十米开外，同一个混音档在耳朵里差 17 dB。实拍峰值 0.338 对
  // **玩家自己那一枪的 0.214** —— 耳边一发擦过去比自己扣扳机还响 4 dB，那是「难听」。
  // 现在两条都压到本体枪声（rifleNra 0.88 / rifleIja 0.86）以下，
  // 远近之分交给接线层的近场律与本体上限（Data_Tuning_Audio.NEAR_MISS）。
  bulletCrack: 0.55, bulletWhizz: 0.42, ricochet: 0.5, impactStone: 0.55,
  // 四种材质脚步与 dirt/rubble 同一档：木板与石板本来就比土路响一点，草与泥更闷。
  footstepWood: 0.3, footstepStone: 0.3, footstepGrass: 0.22, footstepMud: 0.26,
  // 身体 foley 全是「贴着自己」的小动作，比脚步略低；喘息一直在响，按床配平。
  clothMove: 0.22, gearRattle: 0.2, breathHeavy: 0.3, bodyLand: 0.5,
  grenadeBounce: 0.45, grenadeRoll: 0.35,
  // 中距爆炸夹在近（1.0）与远（0.5）之间；落屑是爆炸之后的余音，不能抢爆炸本身。
  explosionMid: 0.72, debrisFall: 0.4,
  // 火堆循环与照明弹燃烧同一条理由（一直在响）。
  fireSpot: 0.35,
  // 机枪远场与步枪远场两条同档。
  zb26Far: 0.4, type11Far: 0.4, type92Far: 0.44,
  // 枪尾在 PlayGunshot 里已按 0.55 追加，这里只做素材间的齐平。
  gunTailOpenRifle: 0.6, gunTailStreetRifle: 0.6, gunTailInteriorRifle: 0.6,
  gunTailOpenMg: 0.6, gunTailStreetMg: 0.6, gunTailInteriorMg: 0.6,
};

/** 混响 send。远的、开阔的给多，贴身的小动作几乎不给。 */
const SAMPLE_WET = {
  rifleNra: 0.42, rifleIja: 0.38, rifleNraFar: 0.55, rifleIjaFar: 0.55,
  zb26: 0.36, type11: 0.32, type92: 0.42,
  explosionNear: 0.45, explosionFar: 0.55, shellImpact: 0.45, shellIncoming: 0.3,
  launcherPop: 0.35, bugleCharge: 0.55, whistle: 0.45,
  bolt: 0.08, stripperLoad: 0.08, magIn: 0.08,
  footstepDirt: 0.12, footstepRubble: 0.12, shellDrop: 0.12,
  // --- 缺口批 A2（2026-08-29 接线）---------------------------------------
  // 照明弹三条给得多：它们**在两百米的头顶上**，听到的几乎全是反射；
  // 处决那声隔着一堵墙与一个院子，同理。反过来，电键与拉柄就在你手底下，
  // 给了混响就变成「隔壁屋里有人在敲」——贴身的小动作一律近乎全干。
  execScream: 0.5, painMoan: 0.3, hitGrunt: 0.12,
  flareIgnite: 0.5, flareBurn: 0.45, flareOut: 0.45, flareLaunch: 0.4,
  telegraphKey: 0.06, telegraphHum: 0.05,
  // 远近是两条真的录音，湿度也要分开：300 m 外那一梭子的价值全在尾巴上。
  planeDive: 0.5, strafeFar: 0.55, strafeNear: 0.35, strafeDirt: 0.25,
  mgOverheat: 0.1, mgCharge: 0.1,
  // --- 接线批 INT4（2026-09-08）-------------------------------------------
  // 三条铁律照旧：**贴身的动作几乎全干**（给了混响就成了「隔壁有人在动」），
  // **远处的东西几乎全湿**，**一直在响的东西介于两者之间**。
  // 弹啸最极端：它从你耳朵边上过去，给 0.1 已经偏多 —— 只是完全干听着像在耳机里。
  bulletCrack: 0.1, bulletWhizz: 0.12,
  // 跳弹反过来：削飞出去的弹头是往巷子深处走的，尾巴正是「它飞哪儿去了」。
  ricochet: 0.4, impactStone: 0.3,
  footstepWood: 0.14, footstepStone: 0.24, footstepGrass: 0.08, footstepMud: 0.06,
  clothMove: 0.05, gearRattle: 0.05, bodyLand: 0.12,
  breathHeavy: 0,                    // 自己的肺没有房间
  grenadeBounce: 0.3, grenadeRoll: 0.28,
  explosionMid: 0.55, debrisFall: 0.2,
  fireSpot: 0.3,
  zb26Far: 0.55, type11Far: 0.55, type92Far: 0.6,
  // 枪尾本身就是「房间的回答」：再往卷积混响里送一份等于房间套房间。
  // 开阔地那两条例外 —— 那里没有早期反射可做，尾巴只能由混响给。
  gunTailOpenRifle: 0.8, gunTailOpenMg: 0.85,
  gunTailStreetRifle: 0.5, gunTailStreetMg: 0.55,
  gunTailInteriorRifle: 0.32, gunTailInteriorMg: 0.36,
};

/**
 * 环境一次性音的混响 send。整体比音效那张表更湿 —— 这些东西**全都在远处**，
 * 而远处的声音里混响占比就是更高（直达声按距离衰减，混响场基本不衰减）。
 * 落屑与吱呀是例外：那两样就在你旁边的废墟上。
 */
const AMB_WET = {
  "amb.cannonFar": 0.6, "amb.whizz": 0.3, "amb.crow": 0.5, "amb.dogFar": 0.55,
  "amb.rooster": 0.55, "amb.creak": 0.22, "amb.debris": 0.2,
  "amb.planeFar": 0.5, "amb.moanFar": 0.6,
};

/**
 * 环境一次性音的**空气低通**（Hz）。
 *
 * 位置音的这一层由 Play 按距离自己算（18000/(1+0.09d)），但环境一次性音没有
 * position —— 它们「在很远的地方」这件事没有任何东西可以表达，于是原来一律
 * 带着全套高频从立体声里蹦出来：一记远处的枪听着像有人在你身后开枪，
 * 而它同时又不带任何方位（只有一个随机 pan）。**「不知道从哪儿来的音效」
 * 有一半是这么来的。**
 *
 * 数值就照位置音那条公式反推：两百米上是 950 Hz，三百米上是 640 Hz。
 * 三条例外：弹啸（`amb.whizz`）本来就是从你耳边过去的，落屑与吱呀就在旁边的
 * 废墟上 —— 这三条**不滤**，它们「近」正是它们吓人的原因。
 */
const AMB_AIR = {   // → Play 的 airCut
  rifleNraFar: 1200, rifleIjaFar: 1200, zb26: 1100, type92: 1000, type11: 1100,
  "amb.cannonFar": 800, "amb.planeFar": 1800, "amb.moanFar": 1400,
  "amb.crow": 2600, "amb.dogFar": 2200, "amb.rooster": 2200,
  // 缺口批 A2 里**只有这两条会以「没有 position 的远处」身份出现**（其余十三条
  // 都由接线侧带着 position 播，空气低通由 Play 按距离自己算）：
  //   · strafeFar 录于 300 m 外，比远射两条（1200）还远一档 → 1100；
  //   · planeDive 是从远处压到头顶来的通场，比 amb.planeFar（1800，一直在远处盘旋）
  //     亮一档 —— 它「近」正是这一拍吓人的原因，滤狠了就成了另一架飞机。
  // 撒进 AMBIENCE_PRESETS.events 的那一刻这两行才起作用；先备着，
  // 免得接线侧只加了事件、忘了这一层，于是远处那一梭子带着全套高频蹦出来。
  strafeFar: 1100, planeDive: 2200,
  // --- 接线批 INT4（2026-09-08）：三挺机枪的远场 --------------------------
  // 与近场那三行（zb26 1100 / type92 1000 / type11 1100）差一档：
  // 远场素材录于更远处，本来就该更闷。同样只在**没有 position** 地撒进环境床时
  // 才起作用；接线侧带着位置播时空气低通由 Play 按距离自己算。
  zb26Far: 950, type11Far: 950, type92Far: 850,
};

/**
 * 原样播放的 cue：**按顺序轮**着出，且**不做逐发变调**。
 *
 * 默认那套（随机挑变体 + ±3% 变调）是给「每秒都在响、且没人挑过」的音准备的 ——
 * 脚步、弹着、连发枪声，靠随机与失谐把复读感盖过去。白刃这三条不是那种音：
 * 变体是**人工一条条试听选定**的，要的就是它们本来的样子。变调会把选中的音色
 * 拧走（±3% 对 0.2 秒的破风声是听得出来的），随机挑则会「连出两次同一条」，
 * 恰恰是选三条想避免的事。
 *
 * 2026-08-29 加进来的 `telegraphKey`（电键单点，三变体）是同一类东西，理由却不同：
 * 它的三条是**从同一条素材里钉死三个位置**切出来的（Data_SfxSources 的 TelegraphKey
 * 注写了为什么不走自动挑法），而**发报是连着敲的** —— 随机挑三条里的一条，
 * 敲二十下必然连出两次同一条，那一刻听感就从「有人在发报」塌成「打字机在响」。
 * 逐发变调同样不行：0.2 秒的金属敲击 ±3% 是听得出来的，而这三条的音色差别
 * 本来就只有一点点，变调会把它糊成「同一下敲得不太准」。
 *
 * 【2026-09-09】`bulletCrack` / `bulletWhizz` 加进来，理由与电键同一条：
 * 激波那一下有声段只有十几毫秒，±3% 的 `playbackRate` 直接把音高与瞬态一起拧走，
 * 连着来两条听感是「同一记敲得不太准」而不是「两发子弹」；而随机挑四条里的一条，
 * 一梭子下来必然连出两次同一条 —— 那恰恰是切四条想避开的事。轮播两样都不占。
 */
const SAMPLE_CYCLE = new Set(["dadaoSwing", "dadaoHit", "bayonetHit", "telegraphKey",
  "bulletCrack", "bulletWhizz",
  // 断肢两条与白刃同理由：变体是一条条量过挑出来的（`Script_SeedAudioGoreBake`
  // 的头注记了每条的取舍），要的就是它们本来的样子；而近炸一次卸两三段时
  // 随机挑两条里的一条必然连出两次同一条。
  "goreSever", "goreLimbLand"]);

/**
 * 把一组 AudioBuffer 包成配方。
 * 走 RECIPES 而不是另开一条播放路径 —— 去重、预算闸、Panner、空气低通、
 * 混响 send、距离湿度加成这一整套原封不动地免费复用（与人声采样同一个理由）。
 */
function SampleRecipe(buffers, name) {
  const interval = SAMPLE_BURST[name] || 0;
  const wet = SAMPLE_WET[name];
  const cycle = SAMPLE_CYCLE.has(name);
  let turn = 0;                      // 轮播游标；重载音效包时随配方一起重建
  return (A, v) => {
    const shots = interval ? Clamp(v.burst ?? 1, 1, 14) : 1;
    for (let i = 0; i < shots; i += 1) {
      let buf;
      if (cycle) {
        buf = buffers[turn];
        turn = (turn + 1) % buffers.length;
      } else {
        buf = buffers.length === 1
          ? buffers[0]
          : buffers[Math.min(buffers.length - 1, Math.floor(v.rng() * buffers.length))];
      }
      const src = v.Own(A.ctx.createBufferSource());
      src.buffer = buf;
      // 逐发 ±3%：连打二十发不会听出是同一个 wav 在复读。轮播的那几条不掺。
      const rate = cycle ? v.pitch : v.pitch * (0.97 + v.rng() * 0.06);
      src.playbackRate.value = rate;
      src.connect(v.out);
      if (name === "planeDrone") {
        // A moving engine must keep sounding beyond the recording and retain Doppler.
        // The director owns StopVoice; the editor separately limits its audition.
        src.loop = true;
        src.start(v.t);
        v.loop = true;
        v.Live(3600);
        v.SetDoppler = doppler => src.playbackRate.setTargetAtTime(rate * doppler, A.ctx.currentTime, 0.12);
      } else {
        v.Start(src, v.t + i * interval, buf.duration / Math.max(0.1, rate));
      }
    }
    if (wet !== undefined && v.wetGain) v.wetGain.gain.value = wet;
  };
}

/**
 * 冲锋号：一个实录长音 + playbackRate 排出中方的动机。
 * toneHz 是烘焙时量出来的基频（Last Post 里那个持续音，实测 495.5 Hz）——
 * 量错了整段就跑调，所以烘焙侧要求自相关置信度 > 0.5 才写进清单。
 */
function BugleSampleRecipe(buffer, toneHz) {
  return (A, v) => {
    for (const [dt, hz, dur] of BUGLE_CHARGE) {
      const src = v.Own(A.ctx.createBufferSource());
      src.buffer = buffer;
      const rate = (hz / toneHz) * v.pitch;
      src.playbackRate.value = rate;
      const g = v.Gain(FLOOR);
      src.connect(g).connect(v.out);
      const at = v.t + dt;
      // 包络整个装进这个音的时长里（与合成版 BugleLine 同一条约束）
      Swell(g.gain, at, 0.9, dur * 0.2, dur * 0.48, dur * 0.32);
      v.Start(src, at, Math.min(dur + 0.14, buffer.duration / Math.max(0.1, rate)));
    }
    if (v.wetGain) v.wetGain.gain.value = SAMPLE_WET.bugleCharge;
    v.Live(2.6);
  };
}

// ===========================================================================
// 环境床与音乐的编排表
// ===========================================================================
// 环境事件调度的节拍：0.4 秒掷一次骰子，一分钟 150 次。
const AMB_TICK_MS = 400;
const AMB_TICKS_PER_MIN = 60000 / AMB_TICK_MS;

/**
 * 环境床编排表。**按天空预设取名**（Script_Sky 的 SKY_PRESETS），
 * 关卡切场时直接把 phase.sky 递进来就行 —— 上一版在 Script_Main 里写
 * `night ? "night" : dawn ? "dawn" : "battle"`，于是「烟尘白天」和「烧着的街」
 * 共用同一档环境，第三关整条街在烧却听不见火。
 *
 * 一档 = 若干条实录床（layers）+ 撒在上面的一次性音（events）。
 *   layers[].bed   Data_AmbManifest.json 里的床名
 *   layers[].gain  这一层的音量（**层间的配平就是全部的调音**：
 *                  同样几条素材，火 0.8 与火 0.3 是两个不同的战场）
 *   layers[].seg   一条播放头放多久再换到下一个随机位置（秒，默认 11）
 *   layers[].battle  这一层随**战场强度**涨落（BattleBedScale：强度 0 时剩 0.34，
 *                  1.4 s 斜坡，见 SetBattleIntensity）。不带这个标的层是固定电平。
 *   events[].perMin 一分钟平均响几次
 *   events[].battle  这一条撒播随强度涨落（频次 ×BattleEventRate、
 *                  音量 ×BattleEventVolume）。**强度 0 时不是零**，是「远处零星」。
 *
 * **`explosionFar` 不许撒进 events**（试过，撤了）：它在 `DUCK_ON` 表里
 * （0.8 s / 0.30 / range 140），而环境事件是**非空间化**的 —— `Reactions` 里
 * 那行 `spatial ? Clamp01(1 - distance/range) : 1` 会按**满量**触发，
 * 于是一分钟几次「配乐和环境床整体掉三成再浮回来」。远处的炮由
 * `shellingFar` 床（连绵闷雷）+ `amb.cannonFar` 事件（单记炮响，不在 DUCK_ON 里）
 * 两条表达，听感是一样的，代价是零。
 *   events[].volume  一次多响 —— **枪声那几条 2026-08-20 整体压了 7 dB 并减了次数**。
 *                    它们代表的是「比 GUN_CULL_M（160 m）还远的那些枪」，
 *                    所以绝对电平必须**低于**一发真的一百六十米外的枪
 *                    （实测干声 0.021）。旧值 0.22 折算下来比那还高 12 dB ——
 *                    也就是说：撒出来的假枪声比场上真在打的还响，而且不带方位。
 *                    这是玩家说的「不知道从哪儿冒出来一堆音效」里的另一半。
 *
 * 层数控制在 4 条以内：每条床同时挂两条播放头（source+gain），
 * 4 条就是 16 个常驻节点，占掉 NODE_BUDGET 的 13% —— 再多就要从枪声里抢了。
 */
export const AMBIENCE_PRESETS = {
  firstLevelCarriage: {
    space:"interior",fallbackWind:.06,fallbackCut:180,
    layers:[{bed:CARRIAGE_SOUND.trainBed,gain:CARRIAGE_SOUND.trainGain,seg:12},
      {bed:CARRIAGE_SOUND.crowdBed,gain:CARRIAGE_SOUND.crowdGain,seg:16}],
    events:[{name:"carriageRattle",perMin:9,volume:.3},
      {name:"gearRustle",perMin:5,volume:.24},{name:"clothMove",perMin:4,volume:.2}],
  },
  silence: { space: "street", layers: [], events: [], fallbackWind: 0 },

  // 【2026-09-09】第一关两档补齐 —— **这是「打起来整个战场安安静静的」的头号原因**。
  // 改之前两档都是 `layers: [windPlain 0.3]` + `events: []`：整场仗除了眼前
  // 一百六十米以内那几个兵，一点远处的东西都没有。城北的仗（津浦线正面）在
  // 玩家听得见的范围之外，可它一直在打。
  //
  // South 段（潜行接近津浦路南段）的基线比 Front 低一档：那一段玩家在绕，
  // 场上没有己方在还击，远处那一片应该更薄。
  firstLevelFront: {
    space: "open", fallbackWind: 0.045, fallbackCut: 480,
    layers: [
      { bed: "windPlain", gain: 0.30, seg: 13 },
      { bed: "battleFar", gain: 0.26, seg: 11, battle: true },
      { bed: "shellingFar", gain: 0.22, seg: 9, battle: true },
    ],
    events: [
      { name: "amb.cannonFar", perMin: 3.2, volume: 0.55, battle: true },
      { name: "rifleNraFar", perMin: 5.5, volume: 0.10, battle: true },
      { name: "rifleIjaFar", perMin: 5.0, volume: 0.10, battle: true },
      { name: "zb26Far", perMin: 2.0, volume: 0.08, burst: 5, battle: true },
      { name: "type92Far", perMin: 1.6, volume: 0.08, burst: 4, battle: true },
      { name: "amb.crow", perMin: 0.7, volume: 0.3 },
    ],
  },
  firstLevelSouth: {
    space: "open", fallbackWind: 0.04, fallbackCut: 480,
    layers: [
      { bed: "windPlain", gain: 0.30, seg: 13 },
      { bed: "battleFar", gain: 0.17, seg: 11, battle: true },
      { bed: "shellingFar", gain: 0.16, seg: 9, battle: true },
    ],
    events: [
      { name: "amb.cannonFar", perMin: 2.2, volume: 0.48, battle: true },
      { name: "rifleNraFar", perMin: 3.0, volume: 0.09, battle: true },
      { name: "rifleIjaFar", perMin: 3.0, volume: 0.09, battle: true },
      { name: "type92Far", perMin: 1.0, volume: 0.07, burst: 4, battle: true },
      { name: "amb.dogFar", perMin: 0.8, volume: 0.26 },
    ],
  },

  // 序章｜出川：车厢静止，窗外布景由过场时间轴移动。制动不是第二套环境系统，
  // 而是同一床上的明确事件 cue；新版 102 秒序章在 0:40—0:56 触发 trainBrake 一次。
  trainInterior: {
    // 【2026-09-09】fallbackWind 原来是 0，events 是空的 —— 于是这一档在实录床
    // 到位之前是**字面意义上的全静音**（线上实测：点「进城」到第一声 10.4 s，
    // 用户报的「安安静静了 10 s」）。两条一起改：
    //   · 下载提前到开机（AudioEngine.PrefetchPacks），治的是根；
    //   · 兜底给一层很闷的低频（轮轨的滚动就是低频），治的是「万一还是没到」。
    // 180 Hz 而不是别档的 4—500 Hz：闷罐车厢里听见的是脚底下的滚动，不是风。
    space: "street", fallbackWind: 0.06, fallbackCut: 180,
    layers: [{ bed: "trainInterior", gain: 0.82, seg: 12 }],
    // 车里坐着四十个新兵：咳嗽、装具磕碰、车体咯吱。**没有一条是战斗声** ——
    // 外面那条前线由 Data_FirstLevelMissionBattleSound 的 Train 档按世界坐标撒，
    // 那样它才有方位、才会随军列往北开而变响。
    events: [
      { name: "carriageRattle", perMin: 5.0, volume: 0.22 },
      { name: "coughLow", perMin: 2.2, volume: 0.26 },
      { name: "gearRustle", perMin: 3.0, volume: 0.24 },
      { name: "clothMove", perMin: 2.4, volume: 0.18 },
    ],
    transition: { brake: { cue: "trainBrake", atS: 50, endS: 68, mode: "oneShot" } },
  },

  // 2026-08-29 无人声环境基线：默认环境绝不播放 battleFar / crowdFar / amb.moanFar。
  // 这三条仍保留在素材包，方便日后做明确、单独审核的剧情场景；不能再悄悄垫在全场。
  // 各床整体压低，让玩家的定位枪声、脚步和剧情台词始终优先。
  //
  // 【2026-09-09 修订】用户实听报「打起来整个战场安安静静的」，明确要求
  // **远处一直有枪炮声、打得越激烈越响**。于是这条决定改成两条：
  //   · `battleFar`（远处交火人群床）**回来了**，但只作为 `battle: true` 的层 ——
  //     它的电平由战场强度驱动（强度 0 时 ×0.34，也就是比 08-29 那次否决的
  //     那一版还轻一档），而且从此**不再是「垫在全场的一层」**：不打仗的时候
  //     它自己会退下去。08-29 否决的是「拿人群床当默认底噪」，那一条仍然成立。
  //   · `crowdFar` 与 `amb.moanFar` **仍然不放**。那两条是纯人声（骚动与呻吟），
  //     没有交火掩着，低通再狠也是「听不清在说什么的一群人」——
  //     08-29 人工试听否决的正是这个听感，这一轮不翻案。

  // 序 · 上墙（L0，smokyDay）：站在北寨墙上，墙北是护城河与开阔地。
  // 开阔冷风是默认底；远炮只留很轻的一层，战线压力交给场上的真实交火。
  smokyDay: {
    space: "open", fallbackWind: 0.075, fallbackCut: 520,
    layers: [
      { bed: "windPlain", gain: 0.42, seg: 13 },
      { bed: "shellingFar", gain: 0.20, seg: 9, battle: true },
      { bed: "battleFar", gain: 0.24, seg: 11, battle: true },
    ],
    events: [
      // 【2026-09-09】`amb.whizz`（perMin 5.0 / volume 0.5）从这一档撤掉：
      // 逐弹弹啸已经按每一发结算（Script_AudioWiring.BulletPass），两套同时撒的结果是
      // **一条有位置、一条没有**在同一秒里响 —— 后者非空间化、随机 pan、不吃空气低通，
      // 实拍峰值 0.209，几乎等于玩家自己那一枪（0.214），而它「从哪儿来」是随机数。
      // 那正是用户说的「凭空一记难听的呼啸」。cue、配方、混音、AMB_WET 全部留着，
      // 哪天做一段「远处在打、但没打到我」的过场再撒。
      { name: "amb.cannonFar", perMin: 3.0, volume: 0.55, battle: true },
      { name: "rifleNraFar", perMin: 5.0, volume: 0.10, battle: true },
      { name: "rifleIjaFar", perMin: 4.0, volume: 0.10, battle: true },
      // 【2026-09-09】`type92` → `type92Far`：撒进环境床的那一梭子代表的是
      // GUN_CULL_M 以外的机枪，本来就该走远场那条录音（AMB_AIR 也是按远场钉的
      // 850 Hz，近场那条是 1000）。近场 cue 撒在远处是上一版留下的错配。
      { name: "type92Far", perMin: 1.5, volume: 0.08, burst: 4, battle: true },
      { name: "amb.crow", perMin: 0.8, volume: 0.3 },
      { name: "amb.planeFar", perMin: 0.5, volume: 0.4 },
    ],
  },

  // 一 · 破口（L1）与 五 · 天亮（L5）都是 dawn。天光刚起，城外的鸡还在打鸣 ——
  // 这一声是整套环境里唯一的「日子还在过」，别调响，远远的就够。
  dawn: {
    space: "open", fallbackWind: 0.05, fallbackCut: 480,
    layers: [
      { bed: "dawnField", gain: 0.30, seg: 15 },
      { bed: "windPlain", gain: 0.32, seg: 12 },
      { bed: "fireFar", gain: 0.13, seg: 7 },
      { bed: "battleFar", gain: 0.20, seg: 11, battle: true },
    ],
    events: [
      { name: "amb.rooster", perMin: 0.7, volume: 0.34 },
      { name: "amb.crow", perMin: 1.2, volume: 0.3 },
      { name: "rifleNraFar", perMin: 3.0, volume: 0.09, battle: true },
      { name: "rifleIjaFar", perMin: 2.5, volume: 0.09, battle: true },
      { name: "amb.cannonFar", perMin: 1.2, volume: 0.4, battle: true },
      { name: "amb.dogFar", perMin: 0.8, volume: 0.26 },
    ],
  },

  // 二 · 巷战（L2，burningStreet）：整条街在烧。近火是这一档的主角，
  // 风退到街巷里（windStreet 带着零碎的吱呀），远处的仗反而被火盖掉一半。
  burningStreet: {
    space: "street", fallbackWind: 0.06, fallbackCut: 400,
    layers: [
      { bed: "fireNear", gain: 0.36, seg: 7 },
      { bed: "windStreet", gain: 0.34, seg: 11 },
      { bed: "fireFar", gain: 0.16, seg: 6 },
      { bed: "battleFar", gain: 0.22, seg: 11, battle: true },
    ],
    events: [
      { name: "amb.debris", perMin: 4.0, volume: 0.4 },
      { name: "amb.creak", perMin: 3.0, volume: 0.34 },
      // 【2026-09-09】`amb.whizz`（perMin 4.0 / volume 0.45）从这一档撤掉：
      // 逐弹弹啸已经按每一发结算（Script_AudioWiring.BulletPass），两套同时撒的结果是
      // **一条有位置、一条没有**在同一秒里响 —— 后者非空间化、随机 pan、不吃空气低通，
      // 实拍峰值 0.209，几乎等于玩家自己那一枪（0.214），而它「从哪儿来」是随机数。
      // 那正是用户说的「凭空一记难听的呼啸」。cue、配方、混音、AMB_WET 全部留着，
      // 哪天做一段「远处在打、但没打到我」的过场再撒。
      { name: "rifleIjaFar", perMin: 4.0, volume: 0.10, battle: true },
      { name: "rifleNraFar", perMin: 3.5, volume: 0.10, battle: true },
      // `zb26` → `zb26Far`：同 smokyDay 那条，撒在远处的机枪该走远场录音。
      { name: "zb26Far", perMin: 1.5, volume: 0.08, burst: 5, battle: true },
      { name: "amb.cannonFar", perMin: 1.5, volume: 0.42, battle: true },
    ],
  },

  // 三 · 白毛巾（L3）与 四 · 最后五分钟（L4）都是 night。
  // **夜里最要紧的是「静」**：冷风为底，远炮和余火只保留到刚够感知。
  // 狗和木料吱呀撒得极稀；不再用随机呻吟制造气氛。
  night: {
    space: "open", fallbackWind: 0.045, fallbackCut: 340,
    layers: [
      { bed: "windNight", gain: 0.34, seg: 17 },
      { bed: "shellingFar", gain: 0.12, seg: 9, battle: true },
      { bed: "fireFar", gain: 0.08, seg: 7 },
      // 夜里那条战斗床压得最低（0.14）：这一档的主角仍然是「静」，
      // 打起来的时候它才浮出来 —— 而那一刻场上本来就吵。
      { bed: "battleFar", gain: 0.14, seg: 11, battle: true },
    ],
    events: [
      { name: "amb.dogFar", perMin: 1.5, volume: 0.3 },
      { name: "amb.creak", perMin: 1.6, volume: 0.28 },
      { name: "rifleIjaFar", perMin: 2.0, volume: 0.09, battle: true },
      { name: "rifleNraFar", perMin: 1.6, volume: 0.09, battle: true },
      { name: "amb.cannonFar", perMin: 0.8, volume: 0.34, battle: true },
    ],
  },

  // 黄昏与阴天：Script_Sky 里有这两档，关卡表暂时没人用，
  // 但环境表不许有洞 —— 一旦某关改成 dusk 却没有对应环境，游戏是**静音**的，
  // 而静音这种失败在冒烟测试里看不出来。
  dusk: {
    space: "open", fallbackWind: 0.055, fallbackCut: 440,
    layers: [
      { bed: "windPlain", gain: 0.34, seg: 13 },
      { bed: "fireFar", gain: 0.15, seg: 7 },
      { bed: "battleFar", gain: 0.20, seg: 11, battle: true },
    ],
    events: [
      { name: "amb.crow", perMin: 1.5, volume: 0.32 },
      { name: "rifleNraFar", perMin: 3.0, volume: 0.09, battle: true },
      { name: "rifleIjaFar", perMin: 2.4, volume: 0.09, battle: true },
      { name: "amb.cannonFar", perMin: 1.0, volume: 0.36, battle: true },
      { name: "amb.dogFar", perMin: 0.7, volume: 0.24 },
    ],
  },
  overcast: {
    space: "street", fallbackWind: 0.06, fallbackCut: 460,
    layers: [
      { bed: "windStreet", gain: 0.34, seg: 12 },
      { bed: "shellingFar", gain: 0.16, seg: 9, battle: true },
      { bed: "battleFar", gain: 0.22, seg: 11, battle: true },
    ],
    events: [
      // 【2026-09-09】`amb.whizz`（perMin 3.0 / volume 0.45）从这一档撤掉：
      // 逐弹弹啸已经按每一发结算（Script_AudioWiring.BulletPass），两套同时撒的结果是
      // **一条有位置、一条没有**在同一秒里响 —— 后者非空间化、随机 pan、不吃空气低通，
      // 实拍峰值 0.209，几乎等于玩家自己那一枪（0.214），而它「从哪儿来」是随机数。
      // 那正是用户说的「凭空一记难听的呼啸」。cue、配方、混音、AMB_WET 全部留着，
      // 哪天做一段「远处在打、但没打到我」的过场再撒。
      { name: "rifleNraFar", perMin: 4.0, volume: 0.10, battle: true },
      { name: "rifleIjaFar", perMin: 3.5, volume: 0.10, battle: true },
      { name: "amb.debris", perMin: 2.0, volume: 0.34 },
      { name: "amb.cannonFar", perMin: 1.5, volume: 0.4, battle: true },
    ],
  },
};

/**
 * 音乐。**九段生成 / CC0 下载曲**，一段一个 cue，提示词、来源与选段规则见
 * Data_MusicSources.mjs，成品在 Audio/Music/，由 Script_MusicBake.mjs 或
 * Script_SeedAudioMusicBake.mjs 烘。
 *
 * 上一版这里是四条 WebAudio 配方（低音提琴式持续音 + 简化铜管 + 独奏弦 + 军鼓），
 * 音高按 D 小调五声骨架排。整套删掉了，**没有留合成兜底**：
 * 一个振荡器过低通，包络写得再细也是电子管风琴，那正是「氛围完全不对」的来源。
 * 载不到就没有音乐 —— **没有音乐的战场仍然是能打的战场，走调的配乐不是**。
 *
 * 原则没变（上一版这句是对的，只是执行不到位）：
 * 这场仗的声音本体是枪炮，音乐只负责在缝隙里给一个情绪的落点。
 * 所以 level 全部压得很低，而且大部分时间根本不放。
 */
// `label` 只有一个消费者：编辑器音频面板的试听按钮（Script_EditorAudio）。
// 编辑器不本地化（docs/Data_TextAndTuning.md §2「什么不走文本表」），所以这九条
// 逐行登记 @text-ok，而不是搬进 Data_Text_*。**玩家在任何界面上都看不到它们。**
export const MUSIC_CUES = {
  ...FIRST_LEVEL_MUSIC_CUES,
  // 进城之前：一间空屋子。
  menu: { level: 0.55, label: "菜单" },              // @text-ok 编辑器音频面板的试听标签
  // 白天守城时垫在枪炮底下的一层，几乎察觉不到 —— 察觉到了就说明太响。
  siege: { level: 0.3, label: "守城" },              // @text-ok 编辑器音频面板的试听标签
  // 夜里潜行与等待。
  tension: { level: 0.38, label: "夜" },             // @text-ok 编辑器音频面板的试听标签
  // 反攻与白刃，五段里唯一有律动的。
  charge: { level: 0.6, label: "反攻" },             // @text-ok 编辑器音频面板的试听标签
  // 结局。全场唯一允许「像配乐」的地方 —— 仗已经打完了。
  aftermath: { level: 0.62, label: "战后" },         // @text-ok 编辑器音频面板的试听标签
  // 界河开阔地：宽而沉，不给第一次接敌加英雄色彩。
  fieldLament: { level: 0.34, label: "界河" },       // @text-ok 编辑器音频面板的试听标签
  // 城墙炮击：只留下持续推进的压力，必须沉在炮声下面。
  wallPressure: { level: 0.24, label: "城墙" },      // @text-ok 编辑器音频面板的试听标签
  // 十字街封锁：近距离、持续收紧。
  streetDistress: { level: 0.32, label: "十字街" },  // @text-ok 编辑器音频面板的试听标签
  // 北门突围：无武器、无反攻，只剩离城。
  exodus: { level: 0.48, label: "突围" },            // @text-ok 编辑器音频面板的试听标签
};

/**
 * 一条环境床。**它没有循环点。**
 *
 * 做法是老录音棚那一手：同一条素材挂两条播放头，各自从**随机位置**起播，
 * 一条放到一半时另一条淡进来，两条等功率交叉，然后前一条淡出停掉。
 * 于是听到的是一条永远接得上、却永远不重复的空气。
 *
 * 为什么不烘一个无缝 loop 再 loop=true：
 *   1. **MP3 有编码器补零**。解出来首尾各多十几毫秒静音，接缝处必咔一下，
 *      而且不同浏览器补的量还不一样，没法在烘焙期抵消。
 *   2. 无缝也挡不住「记住」。风的某一记呼啸每 23 秒回来一次，
 *      玩家两三分钟内一定会认出来 —— 露馅的从来不是接缝，是重复本身。
 *
 * 代价是常驻 4 个节点（两条播放头各 source+gain）。为此每条床都不开 panner：
 * 素材本身就是立体声，宽度已经在里面了。
 */
class LoopLayer {
  constructor(engine, buffer, cfg) {
    this.engine = engine;
    this.bed = cfg.bed;
    this.buffer = buffer;
    this.level = cfg.gain ?? 0.6;
    this.busName = cfg.bus || "ambience";
    // random=false 是音乐用的：曲子必须从头放，随机起播点对音乐是灾难。
    this.random = cfg.random !== false;
    // 一条播放头放多久。素材短的时候按比例缩 —— 不缩的话随机起播点会被挤没，
    // 每次都从头附近开始，等于又变回了循环。
    this.seg = this.random ? Math.min(cfg.seg ?? 11, buffer.duration * 0.55) : (cfg.seg ?? buffer.duration * 0.8);
    this.xf = cfg.fade ?? Math.min(3.0, this.seg * 0.4);
    this.heads = new Set();
    this.timer = 0;
    this.stopped = false;
    this.rng = Mulberry32(HashString("loop:" + (cfg.bed || "?")));
    this.nextAt = 0;
    /**
     * 这一层随战场强度涨落吗（AMBIENCE_PRESETS 的 `layers[].battle`）。
     * 涨落写在**组增益**上，不写进播放头的包络 —— 播放头那条包络是等功率交叉，
     * 外面改一次整条交叉就塌了（听感是每 11 秒陷一下，比循环还明显）。
     */
    this.battle = !!cfg.battle;
    this.group = null;
    this.levelScale = 1;
  }

  Start() {
    const ctx = this.engine.ctx;
    if (!ctx) return;
    // 组增益：一层一个常驻节点，所有播放头都接它。SetLevel 只动这一个。
    this.group = ctx.createGain();
    this.group.gain.value = Math.max(FLOOR, this.levelScale);
    this.group.connect(this.engine.Bus(this.busName));
    this.engine.liveNodes += 1;
    this.nextAt = ctx.currentTime + 0.05;
    this.Spawn(true);
  }

  /**
   * 运行时改这一层的电平（战场强度）。**斜坡 ≥ 1 s**：床是一直在响的东西，
   * 一枪一跳听感是「有人在推推子」，而不是「仗打得更凶了」。
   */
  SetLevel(scale, rampS = 1.0) {
    this.levelScale = Math.max(0, scale);
    const ctx = this.engine.ctx;
    if (!this.group || !ctx) return;
    const g = this.group.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(FLOOR, g.value), t);
    g.linearRampToValueAtTime(Math.max(FLOOR, this.levelScale), t + Math.max(0.05, rampS));
  }

  /** 起一条新播放头，并把下一条排进日程。 */
  Spawn(first) {
    const engine = this.engine;
    const ctx = engine.ctx;
    if (this.stopped || !ctx) return;
    const at = Math.max(ctx.currentTime + 0.02, this.nextAt);
    // 素材里随机取一个起点，保证放得完 seg + 淡出。
    const room = Math.max(0, this.buffer.duration - (this.seg + this.xf + 0.1));
    const offset = this.random ? this.rng() * room : 0;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    const g = ctx.createGain();
    // 每条播放头的音量再抖一点：床于是有很慢的起伏，像风一阵一阵的。
    // 每条播放头的音量再抖一点：床于是有很慢的起伏，像风一阵一阵的。
    // 音乐不抖 —— 一段曲子每循环一次响度变一点，听起来像有人在推推子。
    const level = this.random ? this.level * (0.82 + this.rng() * 0.36) : this.level;
    const fadeIn = first ? Math.min(2.5, this.xf) : this.xf;
    g.gain.setValueAtTime(FLOOR, at);
    // 等功率交叉在这里用「先快后慢」的两段近似：直接线性交叉会在中点掉 3 dB，
    // 一条一直在响的床上，每 11 秒陷一下比循环还明显。
    g.gain.setTargetAtTime(level, at, fadeIn * 0.32);
    const outAt = at + this.seg;
    g.gain.setValueAtTime(level, outAt);
    g.gain.setTargetAtTime(FLOOR, outAt, this.xf * 0.32);
    // 接组增益而不是直接接总线：战场强度只动组增益那一个节点。
    src.connect(g).connect(this.group || engine.Bus(this.busName));
    src.start(at, offset, this.seg + this.xf + 0.05);
    const head = { src, g };
    this.heads.add(head);
    engine.liveNodes += 2;
    // 回收点按**绝对时间**算：at 可能比现在晚（第一条留了 50 ms 余量），
    // 按 seg 直接算相对毫秒会早回收，把还在响的那一段掐掉。
    head.timer = engine.Later((at + this.seg + this.xf + 0.2 - ctx.currentTime) * 1000, () => this.Kill(head));

    // 下一条在这一条开始淡出的时刻起播 —— 两条重叠 xf 秒。
    this.nextAt = outAt;
    const wait = Math.max(60, (this.nextAt - ctx.currentTime) * 1000 - 120);
    this.timer = engine.Later(wait, () => this.Spawn(false));
  }

  Kill(head) {
    if (!this.heads.delete(head)) return;
    try { head.src.stop(); } catch (err) { /* 已经停了 */ }
    try { head.src.disconnect(); head.g.disconnect(); } catch (err) { /* ok */ }
    this.engine.liveNodes = Math.max(0, this.engine.liveNodes - 2);
  }

  /** 停。fade > 0 时先淡出再回收（切音乐用；环境切场时是硬停，反正紧接着就换了一层）。 */
  Stop(fade = 0) {
    this.stopped = true;
    if (this.timer) { clearTimeout(this.timer); this.engine.timers.delete(this.timer); this.timer = 0; }
    const ctx = this.engine.ctx;
    for (const head of Array.from(this.heads)) {
      if (head.timer) { clearTimeout(head.timer); this.engine.timers.delete(head.timer); }
      if (fade > 0 && ctx) {
        head.timer = 0;
        head.g.gain.cancelScheduledValues(ctx.currentTime);
        head.g.gain.setValueAtTime(Math.max(FLOOR, head.g.gain.value), ctx.currentTime);
        head.g.gain.setTargetAtTime(FLOOR, ctx.currentTime, fade * 0.32);
        this.engine.Later(fade * 1000 + 120, () => this.Kill(head));
      } else {
        this.Kill(head);
      }
    }
    // 组增益跟着走。淡出那一路要等播放头都回收完再拆，否则最后那 fade 秒没有出口。
    const DropGroup = () => {
      if (!this.group) return;
      try { this.group.disconnect(); } catch (err) { /* ok */ }
      this.group = null;
      this.engine.liveNodes = Math.max(0, this.engine.liveNodes - 1);
    };
    if (fade > 0 && ctx) this.engine.Later(fade * 1000 + 200, DropGroup);
    else DropGroup();
  }
}

// ===========================================================================
// AudioEngine
// ===========================================================================
export class AudioEngine {
  constructor({ enabled = true } = {}) {
    this.enabled = enabled;
    this.ctx = null;
    this.liveNodes = 0;
    this.playCounter = 0;
    this.space = "street";
    this.masterVolume = 1;
    // 玩家的音量设置。ctx 还没建的时候也能设，BuildGraph 会照着这份摆节点。
    this.mix = { ...AUDIO_MIX_DEFAULTS };
    this.voiceMute = false;
    // 「暂停时静音背景」。默认开 —— 暂停了背景还在打枪是个 bug，不是特性。
    this.pauseSilence = true;
    this.paused = false;
    this.pausedState = null;
    this.lastPlayAt = new Map();
    /**
     * 每个 cue 被**请求**了多少次（不是"响了多少次"）。
     * 记的是请求而不是发声，因为冒烟脚本要断言的是「打中了有没有去要那一声回执」；
     * WebAudio 起没起来、预算够不够，是另外两件事，混在一个数里就查不出是哪一件坏了。
     */
    this.playRequests = new Map();
    /**
     * 三道闸各自吃掉了多少次请求。
     * 与 playRequests 分开记：一条音「没响」有三种完全不同的原因，
     * 混在一个数里就查不出该去调哪一个 —— 2026-08-20 这一轮就是靠它分清
     * 「远处的枪是被距离闸掐掉的还是被 22 ms 去重窗吃掉的」。
     */
    /**
     * budget 那一格拆成了两个数（2026-09-08 上 voice stealing 之后）：
     *   stolen  —— 腾出了位置（偷了一条更轻更远的），新声照播；
     *   starved —— 实在偷不到，只好丢掉。
     * 混在一个数里查不出该调什么：前者说明预算刚好卡在边上（正常），
     * 后者说明场上全是不该丢的声音（要么预算太小，要么谁在滥用 priority）。
     * `budget` 留成 starved 的别名，老取证脚本与编辑器面板还在读它。
     */
    this.drops = {
      dedupe: 0, distance: 0, stolen: 0, starved: 0,
      get budget() { return this.starved; },
    };
    /**
     * 计数器（不是「失败」，是「做了多少次」）。取证与预算调参用。
     * occlusionQueries 是宿主最关心的一条：它等于每秒真正打出去的射线数。
     */
    // 爆炸类 cue 的耳鸣由 Play 按 DEAFEN_ON / DEAFEN_M 自动触发（见 Reactions）。
    // 这个标志告诉宿主接线层（Script_AudioWiring.Blast）别再手动 Deafen 一次 ——
    // 两条各自都对，合在一起就是同一记爆炸把耳鸣自动化写两遍。
    this.blastAutoDeafen = true;
    // 同理：玩家自己的枪（priority + 枪类 cue）由 Play 自动 DuckAmbience，
    // 接线层的 GunDuck 看到这个标志就不再压第二次（实测双压是 2 次调用叠在 40 ms 里）。
    this.gunAutoDuck = true;
    this.stats = {
      occlusionQueries: 0, occlusionCached: 0, occlusionSkipped: 0,
      zoneQueries: 0, propagationDelays: 0,
      ducks: 0, deafens: 0, ambienceDucks: 0, priorityOverBudget: 0,
      // 战场密度（2026-09-09）：接线层每帧写进来的 0..1，以及它驱动的两件事。
      // 取证靠它 —— 「远处怎么不响」有三种原因（强度没涨、床没接上、事件被闸掉），
      // 混在一起看不出是哪一件。
      battleIntensity: 0, battleBedScale: BattleBedScale(0), battleEvents: 0,
    };
    /**
     * 战场强度 0..1。**引擎不自己算它**（算它要读 AI 状态，那是接线层的账）——
     * 由 `Script_AudioWiring.Update` 每帧 `SetBattleIntensity()` 写进来。
     * 没人写就恒 0，此时床与撒播都停在各自的 floor 上（「远处零星」，不是死寂）。
     */
    this.battleIntensity = 0;
    this.battleBedApplied = -1;      // 上一次真的写进组增益的那个倍率（去抖用）
    /**
     * 每一枪的观察者（接线层装）。**包括被 GUN_CULL_M 剔掉的那些** ——
     * 「打得有多凶」不该因为那一枪太远听不见就不算数，而被剔掉的那批正是
     * 远枪扇区层的全部原料（见 AudioWiring.NoteGunshot）。
     */
    this.gunObserver = null;
    /** 玩家上一枪的时刻（ctx 时钟）。「连着打没有」靠它判，见 FIRE_DUCK_SUSTAIN_S。 */
    this.lastSelfShotAt = -99;
    /**
     * 宿主探针。两条都不注册时整条空间链退回 2026-08-20 的行为（见 SetProbes）。
     */
    this.probes = { occlusion: null, zone: null };
    this.occCache = new Map();          // 空间格 → { at, value }
    this.occCacheAt = { x: 0, y: 0, z: 0 };  // 建这张缓存时听者在哪儿
    this.occFrameAt = -1;               // 当前射线预算窗口的起点
    this.occFrameRays = 0;
    this.listenerZone = null;           // 听者所在区（缓存）
    this.listenerZoneAt = -1;
    /**
     * 还在响的 voice。**与 pendingVoices 是两件事**：pendingVoices 管回收，
     * activeVoices 管「预算不够时能偷谁」—— 被偷的那条会立刻退出 activeVoices，
     * 但它还要在 pendingVoices 里待够 20 ms 淡出时间。
     */
    this.activeVoices = new Set();
    /**
     * 节点预算。实例字段而不是直接用常量：编辑器要能现场调它看阈值，
     * 测试要能把它压到个位数才量得出 voice stealing（把预算撑满 120 个节点
     * 需要在浏览器里排几十条真声音，那种测法是抛硬币）。
     */
    this.nodeBudget = NODE_BUDGET;
    // --- 外部人声采样（战场口令）。加载失败不影响任何其他功能 ---
    this.voiceBank = new Map();      // key -> {key, text, kind, file, duration}
    this.voicesReady = false;
    this.voiceErrors = [];
    // 剧情语音**单槽**：同一时刻只许有一条对白在响（见 PlayStoryVoice）。
    this.storyVoice = null;          // 正在响的那条的 Voice 句柄
    this.storyVoiceKey = null;       // 它的 key（取证与编辑器用）
    // --- 实录音效采样。盖不上去就用合成的那套，同样不影响任何其他功能 ---
    this.sampleCues = new Set();     // 已经被采样盖住的配方名
    this.sfxErrors = [];
    this.sfxReady = false;
    this.sfxManifest = null;
    this.lastBarkAt = -99;
    this.lastBarkKindAt = new Map();
    this.lastBarkPickKey = null;      // 上一次 Bark 实际挑中的 key（取证用）
    this.barkCounter = 0;      // 名字 → 上次触发时间（去重用）
    this.noiseCache = new Map();
    this.shaperCache = new Map();
    this.waveCache = new Map();
    this.timers = new Set();          // 所有 setTimeout 句柄，Dispose 要清干净
    this.pendingVoices = new Set();   // 还没到回收点的 voice，Dispose 要顺手拆掉
    this.lastError = null;            // 最近一次配方异常，给调试用（正常一直是 null）
    this.errorCount = 0;
    this.ambienceNodes = [];
    // --- 实录环境床。载不到就退回一层合成的风，同样不影响任何其他功能 ---
    this.ambBuffers = new Map();     // 床名 -> AudioBuffer
    this.ambLayers = [];             // 当前这一档正在放的床
    this.ambienceLayerLevels = new Map();
    this.ambErrors = [];
    this.ambReady = false;
    this.ambManifest = null;
    // --- 实录（生成）音乐。没有合成兜底：载不到就是没有音乐 ---
    this.musicBuffers = new Map();   // cue -> AudioBuffer
    this.musicPending = new Map();
    this.musicLevelScale = 1;
    this.musicLayer = null;          // 当前在放的那一段
    this.musicErrors = [];
    this.musicReady = false;
    this.ambiencePreset = "silence";
    this.musicCue = null;
    this.disposed = false;
    // 听者位姿的缓存：Play 里要按距离算低通与 HRTF 开关，每次读 camera 太贵。
    this.listenerPos = { x: 0, y: 1.6, z: 0 };
    // 环境/音乐调度各自一条随机流，互不干扰 —— 共用一条的话，改了音乐就会
    // 连带改掉环境事件的时序，逐轮比对全废。
    this.ambienceRng = Mulberry32(HashString("ambience@taierzhuang"));
    this.musicRng = Mulberry32(HashString("music@taierzhuang"));

    if (!enabled) return;
    this.CreateContext();
  }

  // --- 生命周期 -----------------------------------------------------------

  /**
   * 建 AudioContext。
   * 无音频环境（Node、被策略禁用、老 Safari 没手势）下必须安全失败：
   * 这个类的所有方法都得能在 ctx === null 时空转，不能抛。
   */
  CreateContext() {
    if (this.ctx || this.disposed) return;
    try {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor({ latencyHint: "interactive" });
    } catch (err) {
      this.ctx = null;
      return;
    }
    this.BuildGraph();
  }

  BuildGraph() {
    const ctx = this.ctx;
    // 限幅在最后一环。同屏二十几条枪叠起来必然过 0 dBFS，不限幅就是削顶爆音。
    // 母线末端的软削顶。压缩器的 3 ms 起控时间拦不住枪声那种微秒级瞬态 ——
    // 实拍时连发能冲到 1.16，直接在声卡上削出爆音。tanh 曲线把超出的部分弯回来，
    // 代价是一点谐波失真，而那点失真叠在枪声上根本听不出来。
    this.softClip = ctx.createWaveShaper();
    this.softClip.curve = BuildSoftClipCurve(0.7);
    this.softClip.oversample = "2x";
    this.softClip.connect(ctx.destination);

    // 末端快限幅：只削瞬态那几毫秒（见 PEAK_LIMITER）。
    // 它**不管整体响度** —— 那是母线慢压缩的事，两件事分开才不抽泵。
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = PEAK_LIMITER.threshold;
    this.limiter.knee.value = PEAK_LIMITER.knee;
    this.limiter.ratio.value = PEAK_LIMITER.ratio;
    this.limiter.attack.value = PEAK_LIMITER.attack;
    this.limiter.release.value = PEAK_LIMITER.release;
    this.limiter.connect(this.softClip);

    // 耳鸣段落用的低通：平时开到 20 kHz 等于不存在，爆炸时压到几百 Hz。
    // 放在 master 之后、限幅之前，这样连混响尾巴一起闷掉，才像鼓膜被震了。
    this.outGain = ctx.createGain();
    this.outGain.connect(this.limiter);
    this.deafFilter = ctx.createBiquadFilter();
    this.deafFilter.type = "lowpass";
    this.deafFilter.frequency.value = 20000;
    this.deafFilter.Q.value = 0.7;
    this.deafFilter.connect(this.outGain);

    // 母线慢压缩：整体响度的地板。比值小、起控慢、释放慢 —— 听不出它在动，
    // 但一记爆炸不会再把整条母线摁下去 0.22 s（那就是「抽泵」）。
    // 它在耳鸣低通**之前**：耳鸣是听感效果，不该参与动态控制。
    this.busComp = ctx.createDynamicsCompressor();
    this.busComp.threshold.value = BUS_COMP.threshold;
    this.busComp.knee.value = BUS_COMP.knee;
    this.busComp.ratio.value = BUS_COMP.ratio;
    this.busComp.attack.value = BUS_COMP.attack;
    this.busComp.release.value = BUS_COMP.release;
    // 补偿增益接在两级**之间**：这样静态响度补回来了，而天花板仍然由末端那只守着。
    // 接在末端之后的话，补回来的 1.9 dB 会直接顶进软削顶，换成失真。
    this.busMakeup = ctx.createGain();
    this.busMakeup.gain.value = BUS_MAKEUP;
    this.concussionFilter=ctx.createBiquadFilter();
    this.concussionFilter.type="lowpass";this.concussionFilter.frequency.value=20000;this.concussionFilter.Q.value=.7;
    this.busComp.connect(this.busMakeup).connect(this.concussionFilter).connect(this.deafFilter);

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.busComp);

    // 三条声部总线。duck 只压音乐与环境，音效不压 —— 台词/爆炸时把枪声也压掉
    // 会让人以为战斗停了。
    //
    // 每条总线后面再挂一个 *User 节点，专门给玩家的音量滑杆用。
    // **不许让滑杆直接写 xxxBus.gain** —— 那几个是系统自己的配平：
    // musicBus 会被 Music() 按 cue 的 level 重写，duck 会把 duckGain 压下去再放回来。
    // 滑杆写在同一个参数上，下一次换 cue 就把玩家的设置抹掉了。
    this.sfxBus = ctx.createGain();
    this.sfxUser = ctx.createGain();
    this.sfxUser.gain.value = this.mix.sfx;
    this.sfxBus.connect(this.sfxUser).connect(this.masterGain);
    // 远声组：超过 FAR_GROUP_M 的位置音统一从这儿进 sfx 总线。
    // 有了这一组，玩家开枪时才能只压「远处那一片」而不动身边的脚步与喊话
    // （见 DuckAmbience）。混响回声**不接这里** —— 尾巴让路会听出「空间在闪」。
    this.farGain = ctx.createGain();
    this.farGain.connect(this.sfxBus);
    this.duckGain = ctx.createGain();
    this.storyDuck = ctx.createGain();
    this.duckGain.connect(this.storyDuck).connect(this.masterGain);
    this.musicBus = ctx.createGain();
    // 常数。每段曲子的配平在 MUSIC_CUES[cue].level 上，由 LoopLayer 施加 ——
    // 上一版是 Music() 去 ramp 这条总线，于是「切 cue」和「调音量」用的是同一个旋钮。
    this.musicBus.gain.value = 1;
    this.musicUser = ctx.createGain();
    this.musicUser.gain.value = this.mix.music;
    this.musicBus.connect(this.musicUser).connect(this.duckGain);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0.8;
    // 玩家开枪时压环境用的独立旋钮（见 DuckAmbience）。
    // **不许写 ambienceBus 或 ambienceUser**：前者是系统配平、后者是玩家推子，
    // 快压慢放写在它们身上，一次开枪就把两者之一改掉了（与 duckGain 同一条理由）。
    this.ambienceDuck = ctx.createGain();
    this.ambienceUser = ctx.createGain();
    this.ambienceUser.gain.value = this.mix.ambience;
    this.ambienceBus.connect(this.ambienceDuck).connect(this.ambienceUser).connect(this.duckGain);

    // 四档空间的卷积混响，常驻。回声统一并到 sfx 总线。
    // 常驻代价：四只 Convolver + 四个 gain。IR 是现场算的（约 12 ms/条，只在建图时一次）。
    this.reverbs = {};
    this.reverbReturns = [];
    for (const kind of REVERB_SPACES) {
      const conv = ctx.createConvolver();
      conv.buffer = BuildImpulse(ctx, kind, HashString(`ir:${kind}`));
      const ret = ctx.createGain();
      ret.gain.value = REVERB_RETURN[kind] ?? 0.85;
      conv.connect(ret).connect(this.sfxBus);
      this.reverbs[kind] = conv;
      this.reverbReturns.push(ret);   // 留着引用，不然 Dispose 断不掉它
    }
  }

  /**
   * 注册宿主探针。**这是引擎与宿主之间唯一的空间接口**，名字与语义都是契约的一部分
   * （改名字等于把宿主那边的接线悄悄拆掉，而拆掉之后一切照跑、只是听着不对）。
   *
   * @param {object}   probes
   * @param {function} probes.occlusion (from, to) → 0..1
   *        0 = 通透、1 = 完全挡死。from / to 都是 {x,y,z} 世界坐标（米）。
   *        **允许返回 undefined**，意思是「这一次不知道」（射线预算用光、物理世界
   *        还没建好、查询抛了）—— 引擎会沿用上一次的缓存值，而不是当成通透。
   *        实现侧要自己保证便宜：引擎每帧最多问 OCCLUSION_RAYS_PER_FRAME 次，
   *        但同一格里的声源共用一次结果，所以真实频率还要低一档。
   * @param {function} probes.zone (position) → "interior" | "courtyard" | "street" | "open"
   *        返回值不在这四个里就按当前全局档（this.space）处理，不报错。
   *        这条探针同时被用来判听者自己在哪儿（每 ZONE_CACHE_S 问一次）。
   *
   * 传 null / 不传 = 注销。两条都没注册时行为与 2026-08-20 那一版完全一致。
   */
  SetProbes({ occlusion = undefined, zone = undefined } = {}) {
    if (occlusion !== undefined) this.probes.occlusion = typeof occlusion === "function" ? occlusion : null;
    if (zone !== undefined) this.probes.zone = typeof zone === "function" ? zone : null;
    // 换探针必须把缓存清了：留着的是上一套世界的结论。
    this.occCache.clear();
    this.listenerZone = null;
    this.listenerZoneAt = -1;
    return this.probes;
  }

  /**
   * 战场强度（0..1）。接线层每帧写一次；引擎拿它驱动两件事：
   * `battle: true` 的床的组增益，以及 `battle: true` 的撒播的频次与音量。
   *
   * **强度怎么算不在这一层**：那要数「最近六秒有多少枪、多少人在交火、
   * 刚才炸了没有」，全是 AI 与玩法的账（`Script_AudioWiring.BattleIntensity`）。
   * 引擎只认识一个数。
   *
   * 去抖：倍率变化不到 0.01 就不写自动化 —— 每帧写一条 1.4 s 的斜坡是几千条
   * 自动化事件，而听感上一点差别都没有。
   */
  SetBattleIntensity(value) {
    const x = Clamp01(Number.isFinite(value) ? value : 0);
    this.battleIntensity = x;
    this.stats.battleIntensity = x;
    const scale = BattleBedScale(x);
    this.stats.battleBedScale = scale;
    if (Math.abs(scale - this.battleBedApplied) >= 0.01) {
      this.battleBedApplied = scale;
      for (const layer of this.ambLayers) {
        if (layer.battle) layer.SetLevel(scale, BATTLE_BED_RAMP_S);
      }
    }
    return x;
  }

  /**
   * 装一个「每一枪都报一次」的观察者（接线层用它算强度、并把被剔掉的那些
   * 按方位汇总成远处的交火层）。签名：
   *
   * ```js
   * audio.SetGunObserver((cue, distance, position, culled) => {});
   * ```
   *
   * 在 `PlayGunshot` 的**距离闸之前**调用 —— 被 `GUN_CULL_M` 剔掉的那一批
   * 正是这一层最想要的原料。观察者抛异常就地注销（记进 lastError）：
   * 一个取证钩子不许把枪声整条掐掉。
   */
  SetGunObserver(fn) {
    this.gunObserver = typeof fn === "function" ? fn : null;
    return this.gunObserver;
  }

  /** 首次用户手势后调用。有些浏览器只有在手势里 new AudioContext 才能出声。 */
  Unlock() {
    if (!this.enabled || this.disposed) return;
    if (!this.ctx) this.CreateContext();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") {
      const p = this.ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
    // 解锁前设过的环境/音乐是「挂起」状态，这里补跑一次。
    if (this.ambiencePreset && this.ambiencePreset !== "silence") this.Ambience(this.ambiencePreset);
    if (this.musicCue) this.Music(this.musicCue);
    // 三个包在这儿载入而不是在构造里：解锁之前根本没有 AudioContext，
    // decodeAudioData 无处可去。放在手势之后也顺带避免了"页面一开就拉 300 KB"。
    this.LoadPacks();
  }

  /**
   * 开机时把音效包与环境包的字节先下下来（见 PREFETCHED_AUDIO 的抬头）。
   *
   * 只预取这两包：环境床决定「有没有底噪」，音效决定「第一脚、第一枪响不响」。
   * Music and story voices have their own demand loading; the first-level director
   * requests its carriage cue after audio unlock, never all seven recordings here.
   *
   * 失败一律吞掉：Unlock 之后的 LoadPacks 会照常自己再拉一次（那时这张表是空的，
   * 走的就是原来的老路）。
   */
  async PrefetchPacks() {
    if (!this.enabled || this.disposed || this.prefetching) return 0;
    this.prefetching = true;
    let ok = 0;
    const Take = async (url) => {
      try {
        const bytes = await FetchAudioAsset(url, 1);
        PREFETCHED_AUDIO.set(url, bytes);
        ok += 1;
        return bytes;
      } catch { return null; }
    };
    const Pack = async (base, manifestFile, version, Files) => {
      // 清单只解不吞：TextDecoder 读一遍不会 detach，所以它照样留在表里给 Load*Pack 用。
      const bytes = await Take(`${base}${manifestFile}?v=${version}`);
      if (!bytes) return;
      let manifest = null;
      try { manifest = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))); } catch { return; }
      await Promise.all(Files(manifest).map((file) => Take(`${base}${file}?v=${version}`)));
    };
    const ManifestFiles = (groups) => groups.flatMap((group) => Object.values(group || {})
      .flatMap((entry) => entry.files || (entry.file ? [entry.file] : [])));
    await Promise.all([
      Pack(SFX_BASE, "Data_SfxManifest.json", SFX_PACK_VERSION, (m) => ManifestFiles([m.cues])),
      Pack(AMB_BASE, "Data_AmbManifest.json", AMB_PACK_VERSION, (m) => ManifestFiles([m.beds, m.cues])),
    ]);
    this.prefetchedCount = ok;
    return ok;
  }

  /**
   * 拉三个实录包。四份并行，各自失败各自算 —— 没有配音的战场仍然是能打的战场。
   * 拆出来单开一个方法是为了 ReloadPacks 能重跑同一段：载不到的时候，
   * 「再试一次」比「重开一局」便宜得多。
   */
  LoadPacks() {
    if (!this.ctx || this.disposed) return;
    // 失败之后允许**再自动试一次**（下一次手势时），到 PACK_ATTEMPTS 为止。
    // 不设上限的话，服真的挂了会变成"每点一下就重拉一百三十个请求"；
    // 一次都不再试的话，开局那一下网络抖动就永久把整局摁在合成音上。
    this.packAttempts = this.packAttempts || { voice: 0, sfx: 0, amb: 0, music: 0 };
    const a = this.packAttempts;
    if (!this.voicesReady && !this.voiceLoading && a.voice < PACK_ATTEMPTS) {
      this.voiceLoading = true;
      a.voice += 1;
      this.LoadVoices(VOICE_BASE, VOICE_LINES).catch(() => {}).then(() => { this.voiceLoading = false; });
    }
    // 实录音效同理：解锁之后才有 ctx 可以 decode。约 350 KB，与人声并行拉。
    if (!this.sfxReady && !this.sfxLoading && a.sfx < PACK_ATTEMPTS) {
      this.sfxLoading = true;
      a.sfx += 1;
      this.LoadSfxPack(SFX_BASE).catch(() => {}).then(() => { this.sfxLoading = false; });
    }
    // 环境床约 1.2 MB，是三个包里最大的一份，但**必须和别的并行拉**：
    // 串在音效后面的话，开局头十几秒是一片死寂，那正是玩家第一次听这个游戏的时候。
    if (!this.ambReady && !this.ambLoading && a.amb < PACK_ATTEMPTS) {
      this.ambLoading = true;
      a.amb += 1;
      this.LoadAmbPack(AMB_BASE).then((n) => {
        // 载完时如果已经在某一档环境里了，就地重开一次 —— 否则这一关自始至终
        // 都在用合成兜底的那层风，玩家听不到刚下载完的那 1.2 MB。
        if (n > 0 && this.ambiencePreset && this.ambiencePreset !== "silence") this.Ambience(this.ambiencePreset);
      }).catch(() => {}).then(() => { this.ambLoading = false; });
    }
    // 音乐 1.8 MB，最后拉。同样要在载完后补一次 —— 否则「进城前」那段
    // 永远赶不上开机那一刻。
    if (!this.musicReady && !this.musicLoading && a.music < PACK_ATTEMPTS) {
      this.musicLoading = true;
      a.music += 1;
      this.LoadMusicPack(MUSIC_BASE).then((n) => {
        if (n > 0 && this.musicCue) this.Music(this.musicCue);
      }).catch(() => {}).then(() => { this.musicLoading = false; });
    }
  }

  /**
   * 清掉上一轮的报错重拉一遍（编辑器「引擎」栏那个按钮）。
   * 载不到的第一嫌疑是「浏览器指在了别的树上 / 预览服被别的 agent 顶掉了」，
   * 那种情况换个服再点一下就好，不必重开一局。
   */
  ReloadPacks() {
    this.packAttempts = { voice: 0, sfx: 0, amb: 0, music: 0 };
    this.voiceErrors = [];
    this.sfxErrors = [];
    this.ambErrors = [];
    this.musicErrors = [];
    this.LoadPacks();
    if (MUSIC_CUES[this.musicCue]?.onDemand) this.Music(this.musicCue);
  }

  get Ready() {
    return !!this.ctx && this.ctx.state === "running" && !this.disposed;
  }

  Dispose() {
    this.disposed = true;
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    // 清定时器把「到点回收」也一起清了，所以还在飞的 voice 必须在这儿手动拆 ——
    // 不拆的话它们一直挂在总线上，close() 之后引用还在，GC 收不掉整张图。
    for (const v of Array.from(this.pendingVoices)) this.FreeVoice(v);
    this.pendingVoices.clear();
    this.activeVoices.clear();
    this.occCache.clear();
    this.StopAmbience();
    this.StopMusic();
    if (!this.ctx) return;
    // 必须先把常驻节点断开，否则 close() 之后引用还挂着，GC 收不掉。
    try {
      for (const key of Object.keys(this.reverbs || {})) this.reverbs[key].disconnect();
      for (const ret of this.reverbReturns || []) ret.disconnect();
      this.sfxBus.disconnect();
      this.sfxUser.disconnect();
      this.farGain.disconnect();
      this.musicBus.disconnect();
      this.musicUser.disconnect();
      this.ambienceBus.disconnect();
      this.ambienceDuck.disconnect();
      this.ambienceUser.disconnect();
      this.duckGain.disconnect();
      this.storyDuck.disconnect();
      this.masterGain.disconnect();
      this.busComp.disconnect();
      this.busMakeup.disconnect();
      this.deafFilter.disconnect();
      this.concussionFilter.disconnect();
      this.outGain.disconnect();
      this.limiter.disconnect();
      this.softClip.disconnect();
    } catch (err) { /* 已经断开就算了 */ }
    const ctx = this.ctx;
    this.ctx = null;
    try {
      const p = ctx.close();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (err) { /* 某些实现重复 close 会抛 */ }
  }

  // --- 缓存 ---------------------------------------------------------------

  /** 4 秒的噪声缓冲，按种类缓存一份。所有变化靠播放 offset。 */
  NoiseBuffer(kind) {
    let buf = this.noiseCache.get(kind);
    if (buf) return buf;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 4);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rng = Mulberry32(HashString(`noise:${kind}`));
    if (kind === "pink") FillPink(data, rng);
    else if (kind === "brown") FillBrown(data, rng);
    else FillWhite(data, rng);
    this.noiseCache.set(kind, buf);
    return buf;
  }

  ShaperCurve(amount) {
    const key = Math.round(amount * 20);
    let c = this.shaperCache.get(key);
    if (!c) { c = BuildShaperCurve(key / 20); this.shaperCache.set(key, c); }
    return c;
  }

  Wave(kind) {
    let w = this.waveCache.get(kind);
    if (w) return w;
    const table = kind === "brass" ? BRASS_PARTIALS : kind === "bass" ? BASS_PARTIALS : STRING_PARTIALS;
    w = HarmonicWave(this.ctx, table);
    this.waveCache.set(kind, w);
    return w;
  }

  // --- 听者 ---------------------------------------------------------------

  /**
   * 每帧同步听者位姿。
   * 用 matrixWorld 直接取基向量，不走 getWorldDirection —— 那个会分配临时 Vector3，
   * 每帧一次不多，但这是 60 fps 下的热路径，能不分配就不分配。
   */
  /**
   * 载入外部人声采样（战场口令）。
   *
   * 在这之前整个引擎是**纯合成**的，一个外部音源都没有 —— 这是它最大的长处
   * （零加载、零 404、完全确定性），也是它做不了人嗓的原因：喊话不是能算出来的。
   *
   * 接入方式刻意选了「注册成配方」而不是另开一条播放路径：
   * 采样一旦进了 RECIPES，去重、预算闸、Panner、空气低通、混响 send、距离湿度加成
   * 这一整套就**原封不动地免费复用**了。另开一条路的话，这些全要再写一遍，
   * 而且必然会漂（远处的喊声混响不对、预算不计入、齐喊时不去重）。
   *
   * 失败一律吞掉并计数，绝不抛：**没有配音的战场仍然是能打的战场**，
   * 但静默失败要留痕迹（this.voiceErrors），不然没人会发现口令没响。
   *
   * @param {string} base    目录前缀，例如 "Audio/"
   * @param {Array}  entries Data_Voice.VOICE_LINES
   * @returns {Promise<number>} 真正解码成功的条数
   */
  async LoadVoices(base, entries) {
    if (!this.ctx || this.disposed || !Array.isArray(entries)) return 0;
    this.voiceErrors = [];
    let ok = 0;
    await Promise.all(entries.map(async (e) => {
      try {
        if (!e.file) throw new Error("没有文件名");
        // 声库资产覆写同名 MP3 时也必须换 URL，否则玩家只会听到浏览器缓存里的旧 take。
        // **剧情台词不重试**：章节内容批会先把台词写进表、过几天才烘音频，
        // 中间这段时间每条未烘焙的行都会 404。默认 2 次重试 = 一条缺失台词发三个请求，
        // 几十条就是开机时几百个白等的请求（「加载卡在夯地」那一类症状的做法）。
        const bytes = await FetchAudioAsset(`${base}${e.file}?v=${e.version || '20260828chapterstory'}`,
          e.kind === "story" ? 0 : 2);
        const buf = await this.ctx.decodeAudioData(bytes);
        const name = "voice." + e.key;
        RECIPES[name] = (A, v) => {
          const src = v.Own(A.ctx.createBufferSource());
          src.buffer = buf;
          // 变调用 playbackRate：喊话的音高与语速一起变，正是"另一个人"的听感。
          // 只有 6 个标准普通话音色，靠 ±4% 的变调把一个班喊出不同的人来。
          src.playbackRate.value = v.pitch;
          src.connect(v.out);
          const offset = Math.min(Math.max(0, v.offset || 0), Math.max(0, buf.duration - 0.01));
          const duration = Math.max(0.01, Math.min(buf.duration - offset, v.maxDuration) / Math.max(0.1, v.pitch));
          v.duration = duration;
          v.Start(src, v.t, duration, offset);
        };
        MIX_GAIN[name] = e.gain ?? 1;
        NODE_COST[name] = 2;
        this.voiceBank.set(e.key, { ...e, duration: buf.duration });
        ok += 1;
      } catch (err) {
        this.voiceErrors.push({ file: e.file, message: err && err.message });
      }
    }));
    this.voicesReady = ok > 0;
    return ok;
  }

  /**
   * 载入实录音效包，**逐条盖掉同名的合成配方**。
   *
   * 清单由 Script_SfxBake.mjs 生成（Audio/Sfx/Data_SfxManifest.json），
   * 一个 cue 可以有好几个变体文件（脚步、砖屑这类每秒都在响的必须多变体）。
   *
   * 三条刻意的设计：
   *   1. **逐 cue 失败**。一条载不到只丢那一条，其余照盖 —— 半套采样 + 半套合成
   *      仍然是完整的一场仗；整包 all-or-nothing 才是真的会静音。
   *   2. **盖不上去不留痕迹是不行的**。失败计入 sfxErrors，编辑器那一栏会显示，
   *      不然「怎么听着还是合成的」这种问题没人查得出来。
   *   3. **NODE_COST 要跟着改**。采样版一发只有 1—2 个节点（合成版十几个），
   *      不改的话预算闸会按合成版的开销白白丢掉大量声音。
   *
   * @returns {Promise<number>} 成功盖住的 cue 数
   */
  async LoadSfxPack(base = SFX_BASE) {
    if (!this.ctx || this.disposed) return 0;
    this.sfxErrors = [];
    let manifest = null;
    try {
      manifest = await FetchAudioJson(base + "Data_SfxManifest.json?v=" + SFX_PACK_VERSION);
    } catch (err) {
      this.sfxErrors.push({ file: "Data_SfxManifest.json", message: err && err.message });
      return 0;
    }
    this.sfxManifest = manifest;
    const entries = Object.entries(manifest.cues || {});
    let ok = 0;
    await Promise.all(entries.map(async ([cue, entry]) => {
      const files = entry.files || (entry.file ? [entry.file] : []);
      try {
        const buffers = await Promise.all(files.map(async (file) => {
          return this.ctx.decodeAudioData(await FetchAudioAsset(base + file + "?v=" + SFX_PACK_VERSION));
        }));
        if (!buffers.length) throw new Error("清单里没有文件");
        if (cue === "bugleTone") {
          // 军号是**一个音**，不是一条音效：拿它排 BUGLE_CHARGE 的动机去盖 bugleCharge。
          RECIPES.bugleCharge = BugleSampleRecipe(buffers[0], entry.toneHz || 495.5);
          MIX_GAIN.bugleCharge = SAMPLE_MIX.bugleCharge ?? 1;
          NODE_COST.bugleCharge = BUGLE_CHARGE.length * 2 + 2;
          this.sampleCues.add("bugleCharge");
        } else {
          if (!RECIPES[cue]) throw new Error("没有同名配方，盖不上去");
          RECIPES[cue] = SampleRecipe(buffers, cue);
          MIX_GAIN[cue] = SAMPLE_MIX[cue] ?? 1;
          NODE_COST[cue] = SAMPLE_BURST[cue] ? 8 : 2;
          this.sampleCues.add(cue);
        }
        ok += 1;
      } catch (err) {
        this.sfxErrors.push({ file: files[0] || cue, message: err && err.message });
      }
    }));
    this.sfxReady = ok > 0;
    return ok;
  }

  /**
   * 载入实录环境包（Audio/Amb/Data_AmbManifest.json，由 Script_AmbBake.mjs 生成）。
   *
   * 两类东西：
   *   · beds —— 长段的空气，解成 AudioBuffer 存着，由 AmbLayer 拿去放。
   *   · cues —— 一次性音（狗、乌鸦、弹啸、落屑…），**注册成新的配方**，
   *     名字统一带 `amb.` 前缀。这一步刻意与 LoadVoices 走同一条路子：
   *     进了 RECIPES，去重、预算闸、声像、混响 send 这一整套就原封不动地复用了。
   *
   * 与音效包的一处不同：这些 cue **没有同名的合成配方可盖**，载不到就是没有。
   * 这是故意的 —— 一只合成的乌鸦比没有乌鸦更糟。
   *
   * 失败一律吞掉并计数（this.ambErrors），绝不抛。
   *
   * @returns {Promise<number>} 载进来的床 + 一次性音总数
   */
  async LoadAmbPack(base = AMB_BASE) {
    if (!this.ctx || this.disposed) return 0;
    this.ambErrors = [];
    let manifest = null;
    try {
      manifest = await FetchAudioJson(base + "Data_AmbManifest.json?v=" + AMB_PACK_VERSION);
    } catch (err) {
      this.ambErrors.push({ file: "Data_AmbManifest.json", message: err && err.message });
      return 0;
    }
    this.ambManifest = manifest;
    let ok = 0;

    const beds = Object.entries(manifest.beds || {});
    await Promise.all(beds.map(async ([bed, entry]) => {
      try {
        const bytes = await FetchAudioAsset(base + entry.file + "?v=" + AMB_PACK_VERSION);
        const buf = await this.ctx.decodeAudioData(bytes);
        this.ambBuffers.set(bed, buf);
        ok += 1;
      } catch (err) {
        this.ambErrors.push({ file: entry.file || bed, message: err && err.message });
      }
    }));

    const cues = Object.entries(manifest.cues || {});
    await Promise.all(cues.map(async ([cue, entry]) => {
      const files = entry.files || (entry.file ? [entry.file] : []);
      try {
        const buffers = await Promise.all(files.map(async (file) => {
          return this.ctx.decodeAudioData(await FetchAudioAsset(base + file + "?v=" + AMB_PACK_VERSION));
        }));
        if (!buffers.length) throw new Error("清单里没有文件");
        const name = "amb." + cue.replace(/^amb/, "").replace(/^./, (c) => c.toLowerCase());
        SAMPLE_WET[name] = AMB_WET[name] ?? 0.45;      // SampleRecipe 建的时候要读到
        RECIPES[name] = SampleRecipe(buffers, name);
        MIX_GAIN[name] = 1;
        NODE_COST[name] = 2;
        this.sampleCues.add(name);
        ok += 1;
      } catch (err) {
        this.ambErrors.push({ file: files[0] || cue, message: err && err.message });
      }
    }));

    this.ambReady = this.ambBuffers.size > 0;
    return ok;
  }

  /**
   * 载入音乐包（Audio/Music/Data_MusicManifest.json，由 Script_MusicBake.mjs 生成）。
   *
   * 九段合起来约 3.5 MB，是三个包里最大的一份，所以**最后拉**：
   * 音效与人声关系到「打得响不响」，音乐晚十秒才进来没人会在意。
   * 与音效包的两处不同：没有同名合成配方可盖（合成音乐整套删了），
   * 而且不进 RECIPES —— 音乐是一条常驻的循环，不是一次性音。
   *
   * @returns {Promise<number>} 解码成功的段数
   */
  async LoadMusicPack(base = MUSIC_BASE) {
    if (!this.ctx || this.disposed) return 0;
    this.musicErrors = [];
    let manifest = null;
    try {
      manifest = await FetchAudioJson(base + "Data_MusicManifest.json?v=" + MUSIC_PACK_VERSION);
    } catch (err) {
      this.musicErrors.push({ file: "Data_MusicManifest.json", message: err && err.message });
      return 0;
    }
    let ok = 0;
    await Promise.all(Object.entries(manifest.cues || {}).map(async ([cue, entry]) => {
      try {
        const bytes = await FetchAudioAsset(base + entry.file + "?v=" + MUSIC_PACK_VERSION);
        this.musicBuffers.set(cue, await this.ctx.decodeAudioData(bytes));
        ok += 1;
      } catch (err) {
        this.musicErrors.push({ file: entry.file || cue, message: err && err.message });
      }
    }));
    this.musicReady = this.musicBuffers.size > 0;
    return ok;
  }

  /** Load one long-form cue, deduplicated. Completion never chooses what should play. */
  async LoadMusicCue(cue) {
    if (!this.ctx || this.disposed) return null;
    if (this.musicBuffers.has(cue)) return this.musicBuffers.get(cue);
    if (this.musicPending.has(cue)) return this.musicPending.get(cue);
    const spec = MUSIC_CUES[cue];
    if (!spec?.onDemand || !spec.file) return null;
    const context = this.ctx;
    const pending = (async () => {
      try {
        const bytes = await FetchAudioAsset(`${MUSIC_BASE}${spec.file}?v=${spec.version}`);
        const buffer = await context.decodeAudioData(bytes);
        if (this.disposed || this.ctx !== context) return null;
        this.musicBuffers.set(cue, buffer);
        // Old and next cues may overlap while fading. Retain only three long recordings.
        const cached = [...this.musicBuffers.keys()].filter(key => MUSIC_CUES[key]?.onDemand);
        while (cached.length > FIRST_LEVEL_MUSIC_MIX.cacheLimit) {
          const index = cached.findIndex(key => key !== this.musicCue && key !== cue);
          if (index < 0) break;
          this.musicBuffers.delete(cached.splice(index, 1)[0]);
        }
        this.musicErrors = this.musicErrors.filter(error => error.file !== spec.file);
        return buffer;
      } catch (error) {
        this.musicErrors.push({ file: spec.file, message: error.message });
        return null;
      } finally { this.musicPending.delete(cue); }
    })();
    this.musicPending.set(cue, pending);
    return pending;
  }

  /**
   * 喊一句。按 kind 从声库里挑，自带节流。
   *
   * 节流不是性能考虑，是**听感**考虑：一条街上五十个人，不加闸门就会出现
   * 二十个人同时喊"卧倒"的滑稽场面。两层闸：
   *   · 全局 0.55 s —— 任何时刻场上最多一句人声压着另一句的尾巴
   *   · 同类 4.5 s  —— 同一句话不会连着来第二遍
   * 玩家自己那句（priority）不受全局闸限制，但仍受同类闸限制。
   */
  Bark(kind, { position = null, volume = 1, priority = false, seed = 0, key = null,
    side = "nra" } = {}) {
    // 章节可压低自主闲聊；具名脚本对白走 PlayStoryVoice，优先战术提示不受此闸影响。
    if (!priority && this.allowAutonomousBark?.() === false) return null;
    if (!this.ctx || this.disposed || !this.voicesReady || this.voiceMute) return null;
    // 太远的那一嗓子直接不算数 —— **要在两道节流闸之前判**：
    // 否则四百米外一个兵张个嘴就把 0.55 s 的全局闸占掉了，
    // 而他那句本来就播不出来（Play 里的距离闸会把它丢掉）。
    if (position) {
      const dx = position.x - this.listenerPos.x;
      const dy = position.y - this.listenerPos.y;
      const dz = position.z - this.listenerPos.z;
      if (dx * dx + dy * dy + dz * dz > VOICE_CULL_M * VOICE_CULL_M) { this.drops.distance += 1; return null; }
    }
    const now = this.ctx.currentTime;
    if (!priority && now - this.lastBarkAt < 0.55) return null;
    // 同类闸的键带上阵营：中国兵刚喊过「鬼子摸拢来了」，不该把日本兵的
    // 「てきだ！」一起闸掉 —— 那是两个人在对喊，不是同一句复读。
    const kindKey = side + ":" + kind;
    if (now - (this.lastBarkKindAt.get(kindKey) || -99) < 4.5) return null;

    const pool = [];
    for (const e of this.voiceBank.values()) {
      // 阵营先过滤。声库里中日两套并存，挑错阵营就是日本兵喊中文（或反过来），
      // 那比没有配音更糟。未标 side 的一律按中方处理（旧条目的兼容默认）。
      if ((e.side || "nra") !== side) continue;
      // 指定了 key 就只认那一句（下命令要喊对应的那句，不能"从 rally 里随便挑一句"）
      if (key) { if (e.key === key) pool.push(e); continue; }
      // event 句**有前提条件**，不许被同类随机抽中 —— 只能由知道前提的调用方用 key 点名。
      // 滕县攻城日军无战车（34 辆九四式全配属给打临城的第 63 联队，见 docs/Data_TengxianCity.md），
      // 一个兵随机喊出「战车！战车碾拢来了！」就是穿帮；同理，手里还有子弹的兵不该喊
      // 「手榴弹！莫得了！」，全班有枪时不该被喊「莫得枪的，跟到走」。
      // 这道闸比在每个关卡里挨个屏蔽可靠：漏配的默认行为是**不喊**，而不是乱喊。
      if (e.event) continue;
      // 章节剧情台词同理，而且更狠：每一条只属于一个人、只在剧本的某一拍成立。
      // 被随机抽中就是「顺子在别人的关里自言自语」。它们只能由 beat.voice 点名
      //（走 PlayStoryVoice），这里连 kind 都不让它匹配上。
      if (e.kind === "story") continue;
      if (e.kind === kind) pool.push(e);
    }
    if (!pool.length) return null;
    // 确定性挑选：种子给调用方（通常是士兵 id），同一个人倾向于喊同样的话，
    // 但不同的人不一样 —— 这比纯随机更像一个班。
    const rng = Mulberry32((HashString(kind) ^ Math.imul(seed + this.barkCounter, 2654435761)) >>> 0);
    this.barkCounter += 1;
    const pick = pool[Math.floor(rng() * pool.length) % pool.length];
    // ±4% 变调：把 6 个音色摊成一个班。种子固定 => 同一个兵的嗓子是稳定的。
    const pitch = 0.96 + Mulberry32((seed * 2654435761) >>> 0)() * 0.08;

    this.lastBarkAt = now;
    this.lastBarkKindAt.set(kindKey, now);
    this.lastBarkPickKey = pick.key;
    // 【2026-09-09】抬到嘴的高度再定位。调用方（Script_Ai）给的一律是 `s.position`，
    // 也就是**脚底**：近处听感是「趴在地上说话」，而且遮挡与分区那两条探针都从这个
    // 点出发去问，贴地的点会被判成「头顶有屋顶」（实测开阔地 30%）与「被挡住」。
    // 剧情台词那一路早就抬了（Script_Companion.Locate → COMPANION_TUNING.mouthY = 1.52），
    // 喊话这一路一直没抬 —— 同一个人的两句话走两套坐标，这里补齐。
    const at = position ? { x: position.x, y: position.y + BARK_MOUTH_Y, z: position.z } : null;
    return this.Play("voice." + pick.key, { position: at, volume, pitch, priority });
  }

  /**
   * 播一条**章节剧情台词**（`beat.voice` 点名的那条）。
   *
   * 刻意不走 Bark，三个理由，每一个都足以单独否掉 Bark：
   *   1. **节流闸会静默吃掉对白**。Bark 的 0.55 s 全局闸与 4.5 s 同类闸是给
   *      「一条街上五十个人别同时喊卧倒」用的；用在剧本台词上，结果是
   *      玩家随机漏听半场戏，而且日志上什么都看不出来。
   *   2. **±4% 变调会毁掉角色**。Bark 拿变调把 6 个音色摊成一个班；
   *      剧情台词是某个具体的人的嗓子（顺子/罗班长/幺娃），调一动就不是他了。
   *   3. **阵营过滤会挡住日方台词**。Bark 按 side 挑池子，而剧本里日军军曹
   *      开口时调用方并不知道要把 side 也传对。
   *
   * 单槽：**新的顶掉旧的**。选顶掉而不是排队，是因为剧本的下一拍已经在演了 ——
   * 排队会让台词落在错误的画面上（人已经跑进院子，声音还在门外那句）。
   * 排队的那一半交给 Script_Story：voiced beat 会按音频时长把下一条压住，
   * 所以「顶掉」在正常节奏下根本不会发生，它只是最后一道保险。
   *
   * 距离：位置只用来做空间化，**不许用来丢句子**。超出人声剔除半径就退化成
   * 非空间化播放（剧情台词听不见 = 剧情丢了；一句「顺哥！机枪停了！」
   * 本来就是从街那头喊过来的）。
   *
   * @returns {{key:string,duration:number,voice:object}|null} null = 没有这条音频，
   *   由调用方降级成纯字幕（这是常态，不是错误：台词先写、音频后烘）。
   */
  PlayStoryVoice(key, { position = null, volume = 1, offset = 0, maxDuration = Infinity, environmentGain = 1 } = {}) {
    if (!this.ctx || this.disposed || this.voiceMute) return null;
    const entry = key ? this.voiceBank.get(key) : null;
    if (!entry) return null;
    let at = position;
    if (at) {
      const dx = at.x - this.listenerPos.x;
      const dy = at.y - this.listenerPos.y;
      const dz = at.z - this.listenerPos.z;
      if (dx * dx + dy * dy + dz * dz > VOICE_CULL_M * VOICE_CULL_M) at = null;
    }
    this.StopStoryVoice();
    const voice = this.Play("voice." + key, { position: at, volume, offset, maxDuration, pitch: 1, priority: true });
    if (!voice) return null;
    this.storyDuck.gain.setTargetAtTime(Clamp01(environmentGain),this.ctx.currentTime,.06);
    this.storyVoice = voice;
    this.storyVoiceKey = key;
    return { key, duration: entry.duration || entry.dur || 0, voice };
  }

  /** 掐掉正在响的剧情台词（换关、切过场、被下一条顶掉时）。 */
  StopStoryVoice() {
    if(this.ctx)this.storyDuck?.gain.setTargetAtTime(1,this.ctx.currentTime,.25);
    if (!this.storyVoice) return false;
    const stopped = this.StopVoice(this.storyVoice);
    this.storyVoice = null;
    this.storyVoiceKey = null;
    return stopped;
  }

  /**
   * 把 WebAudio 的听者贴到相机上。**每帧都要调**（Script_Main 的 RenderScene 里）。
   *
   * 不调的后果比"方位不准"严重得多，因为整条空间化链路都挂在听者位置上：
   *   · panner 的距离衰减 —— 听者停在原点、玩家在 1470 m 外时，直达声被压到
   *     千分之六，实测比该有的电平低三十分贝，等于**battle 的干声整体消失**；
   *   · 而混响 send 是在 Panner **之前**分出去的、根本不吃距离衰减，
   *     于是剩下的全是混响尾巴 —— 全场几十发枪的尾巴糊成一片，
   *     这就是"刚进游戏一片密密麻麻的音效"的成因；
   *   · HRTF 只在 25 m 内开，距离恒为一千多米时永远走 equalpower，声像全在正中；
   *   · 空气低通 18000/(1+0.09d) 被钳在 700 Hz 的地板上，所有枪声都是闷的。
   * 城里几关更隐蔽：世界原点正好是十字街口，听着"有声音"，
   * 但全城的枪都按你站在街心算，走到哪儿都一样响。
   */
  SetListener(camera) {
    if (!this.ctx || !camera || !camera.matrixWorld) return;
    const e = camera.matrixWorld.elements;
    const px = e[12], py = e[13], pz = e[14];
    // three 的相机看向自身 -Z，所以 forward 是第三列取反。
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    this.listenerPos.x = px; this.listenerPos.y = py; this.listenerPos.z = pz;

    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      // setTargetAtTime 而不是 setValueAtTime：玩家快速转身时硬跳会「咔」一下。
      const tau = 0.012;
      L.positionX.setTargetAtTime(px, t, tau);
      L.positionY.setTargetAtTime(py, t, tau);
      L.positionZ.setTargetAtTime(pz, t, tau);
      L.forwardX.setTargetAtTime(fx, t, tau);
      L.forwardY.setTargetAtTime(fy, t, tau);
      L.forwardZ.setTargetAtTime(fz, t, tau);
      L.upX.setTargetAtTime(ux, t, tau);
      L.upY.setTargetAtTime(uy, t, tau);
      L.upZ.setTargetAtTime(uz, t, tau);
    } else if (L.setPosition) {
      // 老 Safari 只有这套废弃 API。
      L.setPosition(px, py, pz);
      L.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  // --- 播放 ---------------------------------------------------------------

  /**
   * 播放一个音效。
   * @param {string} name        RECIPES 里的名字
   * @param {object} opts
   *        position {x,y,z}     世界坐标，给 PannerNode；null = 非空间化（UI/第一人称）
   *        pan      -1..1       非空间化时的立体声位置（环境床用，比 HRTF 便宜得多）
   *        airCut   Hz          非空间化时的空气低通上限（环境一次性音用，见 AMB_AIR）
   *        volume   增益倍率
   *        pitch    频率倍率（同一把枪逐发做 ±3% 抖动，二十条枪才不像一条）
   *        delay    延后多少秒开始（**传播延迟另算，会叠在这个数上**）
   *        burst    连发武器的点射发数
   *        firstPerson  这是玩家自己耳朵边上的那一声：不走 HRTF、不加传播延迟
   *        occlusion    0..1，显式指定遮挡度；不给就问探针
   */
  /**
   * 开一枪：按距离在**两段不同录音**之间等功率交叉淡入（见 FAR_CUE 的注释），
   * 再按**声源所在的区**追一条尾巴。
   *
   * 为什么等功率（cos/sin）而不是线性（t / 1−t）：交叉带中点上线性淡入的两路
   * 各 0.5，功率和是 0.5²+0.5² = 0.5 —— 走到 87 m 会**塌下去 3 dB**，
   * 听感是「远处那一枪走到半路声音先小了一下再回来」。cos/sin 的平方和恒为 1。
   *
   * 没有远场素材的枪（zb26/type11/type92）原样落回 Play()，行为不变。
   *
   * **尾巴这一层**（2026-09-08）：本体那 5 ms 的瞬态在哪儿都差不多，
   * 同一把枪在屋里 / 院里 / 街上 / 旷野的区别几乎全在尾巴上。卷积混响给的是
   * 「空间的一般响应」，尾巴给的是「这把枪在这个空间里的那一条录音」——
   * 两者不重复：前者弥散、后者带瞬态包络。素材还没做的那几条由 Play 静默跳过。
   *
   * 声速延迟不在这里加，在 Play 里按 cue 类别统一加（见 PROPAGATION_DELAY）——
   * 尾巴与本体因此**必然同时到**（同一个 distance 算出同一个延迟）。
   *
   * @param {object} opts 除 Play 的全部选项外：
   *        firstPerson  玩家自己那一枪（不走 HRTF、不延迟）
   *        weaponClass  "rifle" | "mg"，只影响挑哪条尾巴
   */
  PlayGunshot(name, opts = {}) {
    if (!opts.position) return this.Play(name, opts);
    const dx = opts.position.x - this.listenerPos.x;
    const dy = opts.position.y - this.listenerPos.y;
    const dz = opts.position.z - this.listenerPos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const culled = d > CullDistance(name);
    // 战场密度的观察者：**闸之前**报，被剔掉的那一批照报（见 SetGunObserver）。
    // 那一批原来只进 `drops.distance` 就没了 —— 一百六十米外的整条战线在
    // 玩家耳朵里于是完全不存在，那正是「打起来整个战场安安静静的」的一半。
    if (this.gunObserver) {
      try { this.gunObserver(name, d, opts.position, culled); }
      catch (err) {
        // 取证钩子不许把枪声掐掉，但也不许静默地一直抛：就地注销 + 留痕。
        this.gunObserver = null;
        this.lastError = { name: "gunObserver", message: err && err.message, at: d };
        this.errorCount += 1;
      }
    }
    // 太远的一枪不逐发播，交给环境床（见 GUN_CULL_M）。
    // 闸在这儿而不是在 AI 那边：AI 只知道"我开了一枪"，"听不听得见"是听者的事。
    if (culled) {
      this.playRequests.set(name, (this.playRequests.get(name) || 0) + 1);
      this.drops.distance += 1;
      return null;
    }
    const { weaponClass = "rifle", firstPerson = false } = opts;
    const base = opts.volume ?? 1;
    const far = FAR_CUE[name];
    let voice = null;
    if (!far) {
      voice = this.Play(name, opts);
    } else {
      const t = Clamp((d - GUN_NEAR_M) / (GUN_FAR_M - GUN_NEAR_M), 0, 1);
      const nearGain = Math.cos(t * Math.PI * 0.5);
      const farGain = Math.sin(t * Math.PI * 0.5);
      // 0.02 的门槛是省节点：低于这个增益的那一路在混音里听不见，
      // 但仍然要占满一条链的预算（rifleNra 一条 16 个节点）。
      if (nearGain > 0.02) voice = this.Play(name, { ...opts, volume: base * nearGain });
      if (farGain > 0.02) {
        const v = this.Play(far, { ...opts, volume: base * farGain });
        voice = voice || v;
      }
    }
    // 尾巴：按声源所在区挑。cue 不存在就一声不响地跳过（素材侧在补）。
    const tail = GunTailCue(this.SourceZone(opts.position), weaponClass);
    if (RECIPES[tail]) {
      this.Play(tail, {
        ...opts, volume: base * GUN_TAIL_GAIN, weaponClass: undefined,
        // 尾巴不是玩法反馈，不许拿 priority 去挤别人的位置 ——
        // 唯一的例外是玩家自己那一枪：本体过了闸尾巴没过，听感是「哑火」。
        priority: firstPerson ? true : false,
      });
    }
    return voice;
  }

  /** 某个 cue 被请求过多少次。取证专用（见 this.playRequests 的抬头）。 */
  RequestedCount(name) { return this.playRequests.get(name) || 0; }

  /**
   * 某条 cue 以 `volume = 1` 在这个距离上的**干声有效电平**（混音表 × 距离衰减）。
   *
   * 与 `Play` 里那个 `effectiveGain` 是同一条式子，只是不真的发声 ——
   * 接线层要在**决定音量之前**知道「这一声按现在的配平会有多响」。
   * 混音表在采样盖上去之后会被 `LoadSfxPack` 重写，所以这里必须读运行时的
   * `MIX_GAIN`，不能读 `SAMPLE_MIX`（那张表只是采样路径的来源）。
   */
  LevelAt(name, distance = 0) {
    return (MIX_GAIN[name] ?? 1) * DryFalloff(Math.max(0, distance), IsGunCue(name) ? GUN_AUDIBILITY.refDistanceM : 3.5);
  }

  /**
   * 一枪的**本体**电平：近/远两层等功率交叉之后的那一份（与 `PlayGunshot` 同一条式子）。
   *
   * 为什么不能直接 `LevelAt(name, d)`：一百三十米外那一枪播的其实是
   * `rifleIjaFar`（混音 0.46），近场那条早就淡出了 —— 拿近场的 0.86 去算，
   * 「弹啸不许比本体还响」这条上限会一路虚高一倍。
   * 尾巴（`gunTail*`）不算进来：它是垫在本体后面的一层，不是本体。
   */
  GunReportLevelAt(name, distance = 0) {
    const d = Math.max(0, distance);
    const far = FAR_CUE[name];
    const fall = DryFalloff(d, IsGunCue(name) ? GUN_AUDIBILITY.refDistanceM : 3.5);
    if (!far) return (MIX_GAIN[name] ?? 1) * fall;
    const t = Clamp((d - GUN_NEAR_M) / (GUN_FAR_M - GUN_NEAR_M), 0, 1);
    const nearGain = Math.cos(t * Math.PI * 0.5) * (MIX_GAIN[name] ?? 1);
    const farGain = Math.sin(t * Math.PI * 0.5) * (MIX_GAIN[far] ?? 1);
    // 两层是**不相关**的两段录音，功率相加而不是幅度相加。
    return Math.sqrt(nearGain * nearGain + farGain * farGain) * fall;
  }

  // --- 空间探针 -----------------------------------------------------------

  /**
   * 问一次遮挡：听者 → 声源之间挡了多少（0 通透、1 挡死）。
   *
   * 三层节流，缺一层都撑不住四十个兵同时开火：
   *   1. **空间格缓存**（OCCLUSION_CELL_M / OCCLUSION_CACHE_S）——
   *      同一堵墙后面的一排兵共用一次射线。这一层才是真正省下来的部分。
   *   2. **每帧射线预算**（OCCLUSION_RAYS_PER_FRAME）—— 保险丝。用光了就沿用
   *      过期的旧值；**一次都没查过的按通透**（宁可漏掉一次遮挡，
   *      也不能把没查过的声音默认闷掉 —— 那会在探针刚注册的那一帧把全场压死）。
   *   3. 听者走远了整张丢：拐过一个墙角，缓存里的结论条条都是错的。
   *
   * 探针返回 undefined = 「这一次不知道」，沿用旧值而不是当作通透。
   */
  Occlusion(position, distance) {
    const probe = this.probes.occlusion;
    if (!probe || !position || !this.ctx) return 0;
    if (distance <= OCCLUSION_MIN_M) return 0;
    const now = this.ctx.currentTime;
    const L = this.listenerPos;
    const moved = Math.hypot(L.x - this.occCacheAt.x, L.y - this.occCacheAt.y, L.z - this.occCacheAt.z);
    if (moved > OCCLUSION_LISTENER_MOVE_M || this.occCache.size > OCCLUSION_CACHE_MAX) {
      this.occCache.clear();
      this.occCacheAt = { x: L.x, y: L.y, z: L.z };
    }
    const key = `${Math.round(position.x / OCCLUSION_CELL_M)},`
      + `${Math.round(position.y / OCCLUSION_CELL_M)},`
      + `${Math.round(position.z / OCCLUSION_CELL_M)}`;
    const hit = this.occCache.get(key);
    if (hit !== undefined && now - hit.at < OCCLUSION_CACHE_S) {
      this.stats.occlusionCached += 1;
      return hit.value;
    }
    if (now - this.occFrameAt >= OCCLUSION_FRAME_S) { this.occFrameAt = now; this.occFrameRays = 0; }
    if (this.occFrameRays >= OCCLUSION_RAYS_PER_FRAME) {
      this.stats.occlusionSkipped += 1;
      return hit ? hit.value : 0;
    }
    this.occFrameRays += 1;
    this.stats.occlusionQueries += 1;
    let value = hit ? hit.value : 0;
    try {
      const raw = probe({ x: L.x, y: L.y, z: L.z }, position);
      if (raw !== undefined && raw !== null && Number.isFinite(Number(raw))) value = Clamp01(Number(raw));
    } catch (err) {
      // 探针抛了不该让这一声静音（与配方异常同一条原则），但要留痕迹。
      this.lastError = { name: "probe:occlusion", message: err && err.message, at: now };
      this.errorCount += 1;
    }
    this.occCache.set(key, { at: now, value });
    return value;
  }

  /**
   * 声源在哪一档空间里。探针没注册 / 返回值不认识时退回全局那一档（this.space），
   * 也就是 2026-08-20 那一版的行为。
   */
  SourceZone(position) {
    const probe = this.probes.zone;
    if (!probe || !position) return this.space;
    try {
      const z = probe(position);
      this.stats.zoneQueries += 1;
      if (REVERB_SPACES.includes(z)) return z;
    } catch (err) {
      this.lastError = { name: "probe:zone", message: err && err.message, at: this.ctx ? this.ctx.currentTime : 0 };
      this.errorCount += 1;
    }
    return this.space;
  }

  /** 听者自己在哪一档。缓存 ZONE_CACHE_S —— 玩家一秒最多跑三米，问不着那么勤。 */
  ListenerZone() {
    const probe = this.probes.zone;
    if (!probe || !this.ctx) return null;
    const now = this.ctx.currentTime;
    if (this.listenerZone !== null && now - this.listenerZoneAt < ZONE_CACHE_S) return this.listenerZone;
    this.listenerZoneAt = now;
    this.listenerZone = this.SourceZone(this.listenerPos);
    return this.listenerZone;
  }

  /**
   * 听者与声源是不是隔着一道「室内 / 室外」的界。
   *
   * 需求原文只说「听者在室内、声源在室外」，这里做成**对称**的：
   * 站在街上听屋里那一枪，中间同样隔着一堵墙加一个门框，闷的程度是一样的。
   * 只做单向的话，进屋和出屋会听出一次不该有的突变。
   */
  ZoneBoundary(sourceZone) {
    const lz = this.ListenerZone();
    if (!lz) return false;
    return (lz === "interior") !== (sourceZone === "interior");
  }

  /**
   * 声速延迟：这一声该晚多久到（秒）。
   * 340 m/s —— 三百米外那一枪晚 0.88 s 到，八十米外晚 0.24 s。
   * 玩家看得见枪口焰或爆闪的那些 cue 才走这条（见 IsPropagated）：
   * 脚步、拉栓、喊话延后到达只会变成音画不同步。
   */
  PropagationDelay(name, distance) {
    if (!PROPAGATION_DELAY) return 0;
    if (!(distance > PROPAGATION_MIN_M)) return 0;
    if (!IsPropagated(name)) return 0;
    this.stats.propagationDelays += 1;
    return Math.min(distance / SPEED_OF_SOUND, PROPAGATION_MAX_S);
  }

  /**
   * 预算不够时腾位置：从活着的声部里挑「有效电平最低、且比新声远」的一条，
   * 20 ms 淡出后释放，把它的节点算回预算。
   *
   * 三条硬规矩：
   *   · **priority 的永远不被偷**（玩家自己的枪、命中回执）；
   *   · 只偷**比新声远**的：偷了比新声还近的那一条，玩家听到的是眼前的声音消失，
   *     那比缺一声远处的枪难受得多；
   *   · 只偷**比新声轻**的：不然就成了「新来的一律插队」，
   *     一记贴脸爆炸会被一记远处的脚步顶掉。
   *
   * 预算在偷的那一刻就还回去（reclaimed），不等 20 ms 淡完 ——
   * 不这么做的话，新声在闸门那儿仍然是超的，等于白偷。代价是那 20 ms 里
   * 实际节点数比账面多几个，可以接受（那正是淡出的时长）。
   *
   * @returns {boolean} 腾够了没有
   */
  StealVoices(need, effectiveGain, distance) {
    if (!(need > 0)) return true;
    let freed = 0;
    for (let round = 0; round < STEAL_MAX_PER_PLAY && freed < need; round += 1) {
      let victim = null;
      for (const v of this.activeVoices) {
        if (v.priority || v.stopping || v.reclaimed || !v.nodes || !v.nodes.length) continue;
        // 人说话不许被偷（见 IsVoiceCue 第 2 条）。台词是长音、电平低、离得远，
        // 三条排序判据全都指向它 —— 不排除的话，越是打得凶的时候越听不到口令，
        // 而那正是最需要口令的时刻。
        if (IsVoiceCue(v.name)) continue;
        if (!(v.effectiveGain < effectiveGain)) continue;
        if (!(v.distance > distance)) continue;
        if (!victim || v.effectiveGain < victim.effectiveGain) victim = v;
      }
      if (!victim) break;
      freed += victim.nodes.length;
      victim.reclaimed = true;
      this.liveNodes = Math.max(0, this.liveNodes - victim.nodes.length);
      this.activeVoices.delete(victim);
      this.drops.stolen += 1;
      this.StopVoice(victim, STEAL_FADE_S);
    }
    return freed >= need;
  }

  Play(name, { position = null, volume = 1, pitch = 1, delay = 0, offset = 0, maxDuration = Infinity, pan = 0, burst = null, priority = false,
    bus = "sfx", airCut = 0, soundField = false, firstPerson = false, occlusion = null,
    weaponClass = null, sourceSizeM = 0 } = {}) {
    // priority：玩家自己的枪永远要响。实测 59 个兵在打时 liveNodes 峰值 118/120，
    // AI 枪声丢 40.4%，**玩家自己的枪也丢了 8.3%** —— 因为玩家和 59 个兵共用
    // "rifleNra" 这一个去重 key，22 ms 窗口内谁先谁得。
    // 开出一枪完全没有声音是最伤沉浸感的一类 bug：玩家会以为自己没打出去。
    this.playRequests.set(name, (this.playRequests.get(name) || 0) + 1);
    if (!this.ctx || this.disposed) return null;
    const recipe = RECIPES[name];
    if (!recipe) return null;

    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 距离：决定 HRTF 开不开、空气低通压多狠、混响给多少、**延迟多久到**、
    // **预算紧张时先偷谁**。必须算在所有闸门之前 —— 见下面 FAR_LOW_PRIORITY_M 那段。
    let distance = 0;
    if (position) {
      const dx = position.x - this.listenerPos.x;
      const dy = position.y - this.listenerPos.y;
      const dz = position.z - this.listenerPos.z;
      distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // 距离闸：听不见的东西不该占混响（见 CullDistance）。
    // 枪声那一档在 PlayGunshot 里就闸掉了（它要在分成近/远两路之前决定），
    // 这里管的是喊话、弹着、脚步，以及任何绕开 PlayGunshot 直接进来的枪声。
    if (position && distance > (soundField ? 1000 : CullDistance(name))) { this.drops.distance += 1; return null; }

    // 传播延迟：闪光先到、声音后到（见 PROPAGATION_DELAY）。
    //
    // 【2026-09-09】**`priority` 不再免延迟**，只有 `firstPerson` 免。
    // `priority` 说的是「这一声不许被去重窗和预算闸吃掉」，与「它多久到耳朵」
    // 完全是两件事，把两件事绑在一个标上带来两个真 bug：
    //   · `AudioWiring.Blast` 走 priority，于是 160 m 外的炮弹**闪光与声音同时到**
    //     （docs/Data_AudioEngine.md §2.5 末尾记过这条，一直没改）；
    //   · 弹啸（priority）与它自己那一枪的本体（非 priority）之间的先后关系
    //     只是「碰巧对了」——一旦哪天本体也标上 priority 就整条塌掉。
    // 玩家自己那一枪照旧跟手：它带 `firstPerson`（Script_Main 的 playerGunOpts）。
    // 命中/击杀回执不带 position，distance 恒 0，本来就走不到这一条。
    const propagation = firstPerson ? 0 : this.PropagationDelay(name, distance);
    const startDelay = Math.max(0, delay) + propagation;
    const startAt = now + startDelay;

    // 同帧齐射去重（见文件头 DEDUPE_S 的注释）。
    //
    // 【2026-08-20】priority 这个参数**上面那段注释写了，函数体里一次都没读**：
    // 去重与预算两道闸都对它视而不见，所以「玩家自己的枪永远要响」从来没有成立过，
    // 那 8.3% 的丢枪声一直还在。补上是因为命中/击杀回执正好走同一条路 ——
    // 回执要在几十条枪同时打的那一刻响，而那恰恰是两道闸最容易关上的时刻，
    // 一条被丢掉四成的确认音等于没有确认音。
    //
    // 【2026-09-08】窗口改成比**到耳朵的时刻**（见文件头坑 5）。旧写法是
    // `now - last < DEDUPE_S && delay === 0`，也就是「只有不带延迟的才去重」——
    // 传播延迟一上，一排人齐射全都带着延迟，去重当场整个失效，
    // 二十条一模一样的 rifleNra 会原样叠在同一毫秒上（那正是它要防的事）。
    if (!priority) {
      const last = this.lastPlayAt.get(name);
      if (last !== undefined && Math.abs(startAt - last) < DEDUPE_S) { this.drops.dedupe += 1; return null; }
    }
    this.lastPlayAt.set(name, startAt);

    // 有效电平：这一声在玩家耳朵里到底有多响。voice stealing 按它排序。
    const mix = MIX_GAIN[name] ?? 1;
    const refDistance = soundField ? 64 : Math.max(3.5, sourceSizeM || 0,
      IsGunCue(name) ? GUN_AUDIBILITY.refDistanceM : 0);
    const effectiveGain = volume * mix * (position && !firstPerson ? DryFalloff(distance, refDistance) : 1);

    // 预算闸门：按实测开销**发声前**判断。
    // 连发的开销与点射长度无关（整条点射共用一套链，见 GunAuto），所以查表就够。
    // priority 的那一档给 15% 超额：够放一条枪声或一条回执。
    //
    // 【2026-08-20】闸门原来只看名字，不看距离，于是**先到先得**：
    // 实测东关站在玩家耳朵里听二十秒，367 次枪声请求丢掉 172 次（47%），
    // 丢的是随机的那 47% —— 一百米外的和眼前的一样看运气。
    // 现在超过 FAR_LOW_PRIORITY_M 的位置音一律按低优先级算，先丢远的。
    //
    // 【2026-09-08】超了不再直接丢新的：先试着从活着的声部里**偷**一条更轻更远的
    // （见 StealVoices）。「丢新的」这条策略在听感上是反的 —— 玩家注意的永远是
    // 刚发生的那件事，而被丢掉的恰恰就是它。
    const cost = NODE_COST[name] ?? DEFAULT_COST;
    const far = position && distance > FAR_LOW_PRIORITY_M;
    const budget = this.nodeBudget;
    const ceiling = priority ? budget * 1.15
      : (far || LOW_PRIORITY.has(name)) ? budget * LOW_PRIORITY_HEADROOM : budget;
    if (this.liveNodes + cost > ceiling) {
      const need = this.liveNodes + cost - ceiling;
      if (!this.StealVoices(need, effectiveGain, position ? distance : 0)) {
        // 偷不到。priority 的照播 —— **玩家的枪 100% 出声是硬指标**：
        // 它一秒最多几条，几个节点的超支只存在几百毫秒，而少响一枪是玩家会报的 bug。
        if (!priority) { this.drops.starved += 1; return null; }
        this.stats.priorityOverBudget += 1;
      }
    }

    const t = startAt + 0.005;   // 留 5 ms 调度余量，免得首音被吃
    // 种子 = 名字哈希 ^ 播放序号：确定性，但同一个音效每次不一样。
    const rng = Mulberry32((HashString(name) ^ Math.imul(this.playCounter += 1, 2654435761)) >>> 0);
    const v = new Voice(this, t, pitch, rng, offset, maxDuration);
    v.burst = burst ?? BURST_DEFAULT[name] ?? null;
    v.name = name;
    v.priority = !!priority;
    v.startAt = startAt;
    v.propagation = propagation;
    v.effectiveGain = effectiveGain;
    v.baseGain = volume * mix;      // 距离系数还没乘进去的那一份，MoveVoice 按新距离重算
    v.distance = distance;

    // 源 gain（干声起点）。混音表在这儿乘进去，配方里不必关心整体平衡。
    const src = v.Gain(volume * mix);
    v.out = src;

    // 混响 send 在 Panner **之前**分出去（文件头坑 1）。
    // 干湿比是两层：配方定「这个声音本身有多少尾巴」，距离定「离得远尾巴占比更高」。
    // 早先是让距离直接写 wet.gain，结果被配方后写的值覆盖掉了 —— 远处的枪和
    // 眼前的枪混响一样多，「远」就完全听不出来。改成事后乘一个 wetScale。
    //
    // 【2026-09-08】送去哪一档由**声源所在的区**决定，不再是全局一档。
    // 为什么按声源不按听者：混响是声源那个空间的响应 —— 你站在街上听见屋里一枪，
    // 听到的是那间屋子的短促闷响透过墙传出来，不是街巷的 0.95 s 尾巴。
    // zone 探针没注册时退回 this.space，与旧行为逐条相同。
    const zone = this.SourceZone(position);
    const conv = this.reverbs[zone] || this.reverbs[this.space] || this.reverbs.street;
    v.reverbZone = zone;
    v.reverbNode = conv;
    const wet = v.Gain(0.25);
    v.wetGain = wet;
    wet.connect(conv);

    if (position) {
      // 遮挡：一次射线（有缓存与每帧预算，见 Occlusion）。
      // 室内/室外的分界再叠一档 —— 射线回答不了「你在屋里」这件事（门开着射线就是通的）。
      let occ = occlusion !== null ? Clamp01(occlusion) : this.Occlusion(position, distance);
      if (this.ZoneBoundary(zone)) occ = Clamp01(occ + ZONE_BOUNDARY_OCC);
      // 人说话封顶（见 IsVoiceCue 第 3 条）。放在 ZoneBoundary **之后**：
      // 那一档加的 0.35 本来就常常是探针把开阔地判成室内加出来的
      //（实测贴地采样点 30% 被判成 interior，见 Data_Tuning_Audio.PROBE），
      // 在它之前封顶等于封了个寂寞。
      if (IsVoiceCue(name)) occ = Math.min(occ, OCCLUSION_MAX_VOICE);
      // 爆炸封顶（见 IsBlastCue）：一层木板挡不住冲击波，低频照样绕得过来。
      if (IsBlastCue(name)) occ = Math.min(occ, OCCLUSION_MAX_BLAST);
      v.occ = occ;
      v.occAt = now;
      // 空气吸收：距离越远高频掉得越快。20 m 上还有 8 kHz，200 m 上只剩 1 kHz 出头。
      // 遮挡的低通并到同一只滤波器上（取更狠的那个）：墙与空气吃的是同一段高频，
      // 串两只滤波器只是多一个节点。
      const airHz = Math.min(airCut || 20000,
        Clamp(18000 / (1 + distance * 0.09), 700, 20000), OcclusionCut(occ));
      const air = v.Filter("lowpass", airHz, 0.7);
      src.connect(air);
      // 混响 send 接在空气低通**之后**（坑 1 说的是不能接在 Panner 之后，
      // 与这一条不冲突）：声音传两百米，高频是在路上被吃掉的，不是到了耳朵才吃 ——
      // 接在前面的话，远处一枪的尾巴带着全套高频，听着像有人在你旁边的砖房里开枪。
      air.connect(wet);
      const panner = v.Own(ctx.createPanner());
      // HRTF 很贵，25 m 以外听不出方位差别，改用 equalpower（文件头坑 3）。
      // 第一人称那一枪也不走 HRTF：枪就在你脸前面，HRTF 只会把它推到某一侧去。
      panner.panningModel = (!firstPerson && distance < 25) ? "HRTF" : "equalpower";
      panner.distanceModel = "inverse";
      // A distant battle sector is an extended field, not a one-metre muzzle.
      // 爆炸同理，只是尺度小两档：火球本身就有好几米，近场不是一个枪口
      //（sourceSizeM 由调用侧给，接线层交的就是爆炸半径，见 IsBlastCue 的抬头）。
      panner.refDistance = refDistance;
      panner.maxDistance = soundField ? 1000 : 600;
      panner.rolloffFactor = 0.9;
      // 【2026-09-09】**极近场钳位**（PANNER_MIN_M）：贴到听者身上的声源沿自己的
      // 方向推到 1 m 外再交给 panner。方位不变，距离衰减也不变
      //（inverse 在 refDistance 3.5 m 以内本来就是恒 1 —— 顺带记下来：
      // 「<1 m 的 inverse 会爆增益」这条**不成立**，Chrome 按规范把距离夹到
      // refDistance，实测 0.3 m 与 1.0 m 的 effectiveGain 同为 0.765）。
      // 要钳的是 **HRTF 的行为**：同一条 bulletCrack 摆在 1.0 m 时左右耳差 6.0 dB，
      // 摆到 0.3 m 就变成 8.6 dB，而且仰角越极端谱上的梳状缺口越深 ——
      // 十几毫秒的瞬态过一遍那种 HRIR 就是「空、发梳、忽左忽右」。3A 的做法一样：
      // panner 给一个最小距离，近到贴脸的东西交给非空间化那条路（firstPerson）。
      const pp = ClampNearField(position, this.listenerPos, distance);
      if (panner.positionX) {
        panner.positionX.value = pp.x;
        panner.positionY.value = pp.y;
        panner.positionZ.value = pp.z;
      } else if (panner.setPosition) {
        panner.setPosition(pp.x, pp.y, pp.z);
      }
      // 遮挡的干声衰减单独一个节点 —— **不能折进 src**：src 同时喂着湿声那一路，
      // 而湿声只掉 −4 dB（文件头坑 4）。occ 为 0 时不建这个节点，
      // 探针没注册的场合因此一个节点都不多花（回归为零）。
      if (occ > 0) {
        const dry = v.Gain(DbGain(OCCLUSION_DRY_DB * occ));
        v.occGain = dry;
        air.connect(dry).connect(panner);
      } else {
        air.connect(panner);
      }
      // 远声组：远处那一片单独走一条总线，玩家开枪时整组让路（见 DuckAmbience）。
      // **语音不进这一组**（见 IsVoiceCue 第 1 条）：五十米外那句喊话是给玩家的
      // 信息，不是背景里的远处战斗，压掉它就等于把命令删了。
      // farGrouped 是**取证字段**：WebAudio 读不出一个节点接到哪儿去了，
      // 而「这句喊话有没有被扔进远声组」正是 Script_AudioWiringTest 要断言的事。
      v.farGrouped = bus === "sfx" && distance > FAR_GROUP_M && !IsVoiceCue(name);
      panner.connect(v.farGrouped ? this.farGain : this.Bus(bus));
      // MoveVoice 要搬的就是这几样：方位、空气低通、混响占比、遮挡。
      v.panner = panner;
      v.air = air;
      // 混响也要跟着距离掉，只是掉得比直达声慢一半（dB 上正好一半）。
      // 见 WetFalloff —— 这一行原来是 `1 + distance*0.03`，**方向是反的**。
      v.wetScale = WetFalloff(distance) * DbGain(OCCLUSION_WET_DB * occ);
    } else {
      // 非空间化：UI、第一人称、以及环境一次性音。
      // airCut 是给环境用的 —— 那些东西「在远处」这件事没有 position 可以表达，
      // 只能显式给一个上限频率。不给就是不滤（玩家自己的枪、回执、拉栓都在耳边）。
      let node = src;
      if (airCut) { const lp = v.Filter("lowpass", Clamp(airCut, 200, 20000), 0.7); node.connect(lp); node = lp; }
      node.connect(wet);
      if (pan !== 0 && ctx.createStereoPanner) {
        const sp = v.Own(ctx.createStereoPanner());
        sp.pan.value = Clamp(pan, -1, 1);
        node.connect(sp).connect(this.Bus(bus));
      } else {
        node.connect(this.Bus(bus));
      }
    }

    try {
      recipe(this, v);
    } catch (err) {
      // 配方里一个参数越界不该让整局静音，吞掉就是了。但**必须留下痕迹**：
      // 静默失败的音效是最难查的 bug —— 听不见的东西没人会去看调用栈。
      this.lastError = { name, message: err && err.message, at: now };
      this.errorCount += 1;
      this.FreeVoice(v);
      return null;
    }
    v.wetBase = wet.gain.value;                    // 配方给的干湿比；MoveVoice 按新距离重乘
    wet.gain.value = Clamp01(wet.gain.value * v.wetScale);
    this.activeVoices.add(v);
    this.ReleaseVoice(v, v.life);
    // Duck / 耳鸣 / 环境闪避统一在这儿触发（配方里不再各自触发，见 DUCK_ON 的抬头）。
    // 放在最后：这三样都会去动别的总线，而这条 voice 得先建成功才算「这一声真响了」。
    this.Reactions(name, distance, !!position, priority || firstPerson, weaponClass);
    return v;
  }

  /**
   * 一声响过之后，别的层要跟着做什么：压音乐环境（Duck）、耳鸣（Deafen）、
   * 玩家开枪压环境与远声组（DuckAmbience）。
   *
   * **为什么不写在配方里**（原来就写在 explosionNear / shellImpact 两条合成配方体内）：
   * 采样一盖上去那两条配方就再也不会被执行，于是整局一次 duck 都没有 ——
   * 而这件事没有任何机器发现得了（声音全在响、控制台干净、冒烟全绿）。
   * 触发条件属于「这一声是什么、离多远」，那是 Play 知道的事，不是配方知道的事。
   */
  Reactions(name, distance, spatial, selfShot, weaponClass = null) {
    const duck = DUCK_ON[name];
    if (duck) {
      // 按听者距离缩放：两百米外的一颗手榴弹不该把配乐压下去。
      // 非空间化的（玩家自己脚边那颗）按满量算。
      const near = spatial ? Clamp01(1 - distance / duck.range) : 1;
      const amount = duck.amount * near;
      if (amount >= DUCK_MIN_AMOUNT) { this.Duck(duck.seconds, amount); this.stats.ducks += 1; }
    }
    const deaf = DEAFEN_ON[name];
    // 耳鸣要过距离闸：几百米外的一记闷响不该震聋玩家（旧的 explosionFar 配方里正是这么写的）。
    if (deaf && (!spatial || distance < DEAFEN_M)) { this.Deafen(deaf); this.stats.deafens += 1; }
    // 玩家自己开的那一枪：环境床与远声组快压慢放（HDR-lite）。
    //
    // 【2026-09-09】远声组这一半**收敛了**：只有自动武器或真的在连着打时才压，
    // 而且只压 −3 dB（FIRE_DUCK_FAR_AMOUNT）。栓动步枪单发不动远声组 ——
    // 打一枪之后玩家要听的正是四十五米外的回应，压掉它就是「越打越静」。
    if (selfShot && IsGunCue(name)) {
      const now = this.ctx ? this.ctx.currentTime : 0;
      const sustained = weaponClass === "mg"
        || (this.lastSelfShotAt !== undefined && now - this.lastSelfShotAt < FIRE_DUCK_SUSTAIN_S);
      this.lastSelfShotAt = now;
      this.DuckAmbience(FIRE_DUCK_HOLD_S, FIRE_DUCK_AMOUNT,
        sustained ? FIRE_DUCK_FAR_AMOUNT : 0);
    }
  }

  /**
   * 移动一条位置音（飞机引擎这类**会飞的源**）。Play 时的方位 / 空气低通 / 混响占比都是按
   * 起始位置一次性算的，这里按新位置重算；velocity（m/s）给了就按径向速度做多普勒 ——
   * 只对声明了 SetDoppler 的配方生效（合成引擎），实录通场那条录着自己的多普勒，不再叠一层。
   * 听者速度不算：玩家跑 3 m/s 对 340 m/s 的声速是 1%，听不出来。
   */
  MoveVoice(voice, position, { velocity = null } = {}) {
    if (!voice || !voice.panner || !position || !this.ctx || this.disposed) return false;
    const t = this.ctx.currentTime, tau = 0.04;
    const dx = position.x - this.listenerPos.x;
    const dy = position.y - this.listenerPos.y;
    const dz = position.z - this.listenerPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const p = voice.panner;
    // 与 Play 同一道极近场钳位：跟位的源飞到听者身上时不许把 HRTF 逼到极端方位。
    const pp = ClampNearField(position, this.listenerPos, distance);
    if (p.positionX) {
      p.positionX.setTargetAtTime(pp.x, t, tau);
      p.positionY.setTargetAtTime(pp.y, t, tau);
      p.positionZ.setTargetAtTime(pp.z, t, tau);
    } else if (p.setPosition) {
      p.setPosition(pp.x, pp.y, pp.z);
    }
    // 遮挡每 OCCLUSION_REFRESH_S 重查一次。**不能每帧查**：会飞的源是持续声，
    // 每帧一条射线 × 整条航线 = 上千次；而飞机从遮到不遮本来也就是零点几秒的事。
    if (voice.occGain || this.probes.occlusion) {
      if (t - (voice.occAt ?? -1) >= OCCLUSION_REFRESH_S) {
        voice.occAt = t;
        let occ = this.Occlusion(position, distance);
        if (this.ZoneBoundary(voice.reverbZone || this.space)) occ = Clamp01(occ + ZONE_BOUNDARY_OCC);
        if (IsVoiceCue(voice.name)) occ = Math.min(occ, OCCLUSION_MAX_VOICE);   // 与 Play 同一道封顶
        voice.occ = occ;
        // occGain 是起播那一刻按 occ > 0 才建的。起播时通透、飞到墙后面去的那种
        // 只能靠低通与湿声表达 —— 中途插节点要断开重接一条正在响的链，
        // 那一下会「咔」，比少 12 dB 难听得多。
        if (voice.occGain) voice.occGain.gain.setTargetAtTime(DbGain(OCCLUSION_DRY_DB * occ), t, tau);
        if (voice.air) voice.airOcc = OcclusionCut(occ);
        voice.wetOcc = DbGain(OCCLUSION_WET_DB * occ);
      }
    }
    if (voice.air) {
      const airHz = Math.min(Clamp(18000 / (1 + distance * 0.09), 700, 20000), voice.airOcc ?? 20000);
      voice.air.frequency.setTargetAtTime(airHz, t, tau);
    }
    if (voice.wetGain && voice.wetBase !== undefined) {
      voice.wetGain.gain.setTargetAtTime(Clamp01(voice.wetBase * WetFalloff(distance) * (voice.wetOcc ?? 1)), t, tau);
    }
    voice.distance = distance;
    // 有效电平跟着距离走 —— 不更新的话，一架飞远了的飞机在 stealing 那儿
    // 永远还挂着起飞时的电平，成了偷不掉的常驻声部。
    if (voice.baseGain !== undefined) voice.effectiveGain = voice.baseGain * DryFalloff(distance, voice.panner?.refDistance ?? 3.5);
    if (velocity && typeof voice.SetDoppler === "function" && distance > 1e-3) {
      // 朝听者为正：f' = f * c / (c - v_radial)
      const radial = -(velocity.x * dx + velocity.y * dy + velocity.z * dz) / distance;
      const rate = Clamp(SPEED_OF_SOUND / Math.max(60, SPEED_OF_SOUND - radial), DOPPLER_RATE_MIN, DOPPLER_RATE_MAX);
      voice.SetDoppler(rate);
      voice.doppler = rate;
    }
    return true;
  }

  /**
   * 掐掉一条正在响的 voice。Timeline 拖动前用它避免旧对白叠在目标时间的对白上；
   * 会飞的引擎离场时用它收尾。fadeS > 0 先把干声拉到零再停，免得留一道「咔」。
   */
  StopVoice(voice, fadeS = 0) {
    if (!voice || !Array.isArray(voice.nodes)) return false;
    if (fadeS > 0 && voice.out && voice.out.gain && this.ctx && !voice.stopping) {
      voice.stopping = true;
      const t = this.ctx.currentTime;
      voice.out.gain.cancelScheduledValues(t);
      voice.out.gain.setTargetAtTime(0, t, fadeS / 4);
      this.Later(fadeS * 1000, () => this.StopVoice(voice, 0));
      return true;
    }
    for (const node of voice.nodes) {
      try { if (typeof node.stop === "function") node.stop(); } catch (error) { /* 已经自然结束 */ }
    }
    this.FreeVoice(voice);
    return true;
  }

  /** 到点断开所有节点并归还预算。**唯一的防泄漏出口**。 */
  ReleaseVoice(v, seconds) {
    this.pendingVoices.add(v);
    const ms = Math.max(0, seconds * 1000) + 220;
    const id = setTimeout(() => {
      this.timers.delete(id);
      this.FreeVoice(v);
    }, ms);
    this.timers.add(id);
  }

  FreeVoice(v) {
    this.pendingVoices.delete(v);
    if(v===this.storyVoice){this.storyVoice=null;this.storyVoiceKey=null;this.storyDuck?.gain.setTargetAtTime(1,this.ctx.currentTime,.25);}
    this.activeVoices.delete(v);
    for (let i = 0; i < v.nodes.length; i += 1) {
      try { v.nodes[i].disconnect(); } catch (err) { /* 已断开 */ }
    }
    // 被偷过的那条，预算在偷的那一刻就还回去了（见 StealVoices）——
    // 这儿再还一次就是凭空多出一堆预算，几分钟之后 liveNodes 会掉成 0
    // 而节点还都在响（「预算怎么用不完」那一类症状）。
    if (!v.reclaimed) this.liveNodes = Math.max(0, this.liveNodes - v.nodes.length);
    v.nodes.length = 0;
  }

  /** 延后执行，句柄统一登记，Dispose 时一次清掉。 */
  Later(ms, fn) {
    const id = setTimeout(() => { this.timers.delete(id); if (!this.disposed) fn(); }, ms);
    this.timers.add(id);
    return id;
  }

  // --- 总线控制 -----------------------------------------------------------

  SetMasterVolume(value) {
    this.masterVolume = Clamp01(value);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // 20 ms 斜坡：直接赋值会在正在响的声音上留一道「咔」。
    this.masterGain.gain.setTargetAtTime(this.masterVolume, t, 0.02);
  }

  /**
   * 玩家的分路音量。kind: "sfx" | "music" | "ambience"。
   * 写的是各自的 *User 节点，与系统自己的配平（cue level、duck）互不干扰。
   */
  /** 分路总线。Play 的 bus 选项用它 —— 环境音走 ambienceBus，玩家那条「环境」推子才管得着。 */
  Bus(kind) {
    if (kind === "ambience") return this.ambienceBus;
    if (kind === "music") return this.musicBus;
    return this.sfxBus;
  }

  SetBusVolume(kind, value) {
    const v = Clamp01(value);
    if (!(kind in this.mix)) return;
    this.mix[kind] = v;
    const node = { sfx: this.sfxUser, music: this.musicUser, ambience: this.ambienceUser }[kind];
    if (!node || !this.ctx) return;
    node.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /** 把背景层（环境床 + 音乐）就地停掉。暂停与「退出音效编辑器时游戏还停着」都走它。 */
  StopBackground() {
    this.StopAmbience();
    this.StopMusic();
  }

  /**
   * 暂停 / 恢复**背景层**。
   *
   * 为什么非得有这一条：暂停玩法（Frame() 提前返回）**一点也拦不住声音**。
   * 环境床是一张自己在跑的 WebAudio 节点图 + 一个 400 ms 的 setTimeout 调度器，
   * 每一轮按概率撒远处的枪炮；音乐同理。玩法停了它们照响 ——
   * 表现就是「我暂停了，背景里的枪声还在」。
   *
   * 这里只停背景层，**不 suspend 整个 AudioContext**：音效编辑器要在暂停时试听，
   * 过场编辑器要听得见过场自己的音效。已经在飞的一次性音（最长两秒的尾巴）
   * 让它自己响完，硬掐会「咔」一声。
   */
  SetPaused(on) {
    const next = !!on && this.pauseSilence !== false;
    if (next === this.paused) return this.paused;
    this.paused = next;
    if (next) {
      this.pausedState = { ambience: this.ambiencePreset, music: this.musicCue };
      this.StopBackground();
    } else {
      const saved = this.pausedState || {};
      this.pausedState = null;
      if (saved.ambience && saved.ambience !== "silence") this.Ambience(saved.ambience);
      if (saved.music) this.Music(saved.music);
    }
    return this.paused;
  }

  /**
   * 玩家开枪时把**环境床与远声组**快压慢放（HDR-lite，见 FIRE_DUCK_* 那组常量）。
   *
   * 与 Duck 的分工：Duck 压的是音乐与环境（为台词和爆炸让路，一秒量级）；
   * 这一条压的是环境与「远处那一片」（为玩家自己那一枪让路，几百毫秒量级），
   * 而且**不动近处的音效** —— 把身边的脚步和喊话一起压掉，
   * 听感会变成「开一枪世界静音一下」。
   *
   * 写在独立的 ambienceDuck / farGain 上，不写 ambienceBus / ambienceUser：
   * 前者是系统配平、后者是玩家推子，一次开枪就把两者之一改掉了。
   *
   * 【2026-09-09】两条总线**各自一个幅度**。原来共用一个 amount，于是玩家
   * 每扣一次扳机就把「远处那一片仗」整组压 −6 dB、300 ms 才放回来 ——
   * 连着打的时候它一直被摁在下面。用户原话「打起来整个战场安安静静的」
   * 有一半是这条造成的（另一半是第一关那两档预设的 events 是空的）。
   * `farAmount = 0` 就完全不动远声组（栓动步枪单发走这条）。
   *
   * @param {number} seconds 压住不放的时长（起落各另算：40 ms 压、300 ms 放）
   * @param {number} amount  环境床压掉的比例；0.5 = 剩一半 = −6.02 dB
   * @param {number} farAmount 远声组压掉的比例；不给就沿用 amount（老调用点的行为）
   */
  DuckAmbience(seconds = FIRE_DUCK_HOLD_S, amount = FIRE_DUCK_AMOUNT, farAmount = null) {
    if (!this.ctx || !this.ambienceDuck || !this.farGain) return;
    const t = this.ctx.currentTime;
    const hold = Math.max(0, seconds);
    const far = farAmount === null ? amount : farAmount;
    const targets = [[this.ambienceDuck.gain, amount]];
    // farAmount 恰好 0 = 这一枪不许碰远声组。**不是「压 0 再放回来」** ——
    // 那样也会 cancelScheduledValues 掉上一枪还没放完的斜坡，等于把它硬拽回 1，
    // 连发时听感是远处那一层在抖。
    if (far > 0) targets.push([this.farGain.gain, far]);
    for (const [g, a] of targets) {
      const level = Clamp01(1 - a);
      g.cancelScheduledValues(t);
      // 从**当前**值接上去，不是从 1 —— 连发时每一发都会重进这里，
      // 从 1 起跳的话每一发都先把音量弹回去再压下来，那是颤音不是闪避。
      g.setValueAtTime(Clamp(g.value, FLOOR, 1), t);
      g.linearRampToValueAtTime(Math.max(level, FLOOR), t + FIRE_DUCK_ATTACK_S);
      g.setValueAtTime(Math.max(level, FLOOR), t + FIRE_DUCK_ATTACK_S + hold);
      g.linearRampToValueAtTime(1, t + FIRE_DUCK_ATTACK_S + hold + FIRE_DUCK_RELEASE_S);
    }
    this.stats.ambienceDucks += 1;
  }

  /** 台词/爆炸时压低音乐与环境。amount = 压掉的比例（0.6 就是只剩四成）。 */
  Duck(seconds = 1.0, amount = 0.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.duckGain.gain;
    const level = Clamp01(1 - amount);
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, FLOOR), t);
    g.linearRampToValueAtTime(Math.max(level, FLOOR), t + 0.06);   // 快压
    g.setValueAtTime(Math.max(level, FLOOR), t + Math.max(0.1, seconds));
    g.linearRampToValueAtTime(1, t + Math.max(0.1, seconds) + 0.55); // 慢放（快放会「呼」一下）
  }

  /**
   * 爆炸后的耳鸣/闷响。
   * 两件事同时发生：主总线低通掉到几百 Hz（外界一下子变闷），
   * 同时脑子里留一条 4 kHz 的正弦慢慢衰减。缺任何一半都不像被震过。
   * 正弦接在耳鸣低通**之后**，不然它自己也会被压掉。
   *
   * 【2026-09-08】现在由 Play 按 DEAFEN_ON + DEAFEN_M 自动触发（爆炸类且炸得够近）。
   * 这个方法**保留**成手动 API：编辑器要能单独试听，过场也可能要在没有爆炸的
   * 地方来一下（比如被埋在土里那一拍）。
   */
  SetConcussion(amount,lowHz=650){
    if(!this.ctx||this.disposed)return;
    this.concussionFilter.frequency.setValueAtTime(20000*Math.pow(Math.max(200,lowHz)/20000,Clamp01(amount)),this.ctx.currentTime);
  }

  Deafen(seconds = 0.4, holdS = DEAFEN_ATTACK_HOLD_S) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = this.deafFilter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(f.value, 200), t);
    // 【2026-09-09】起音期：原来 30 ms 就压到 520 Hz，于是**触发这次耳鸣的那一声
    // 自己**的高频先被吃掉了 —— 爆炸听着像隔壁的闷响，而耳鸣是「之后」的事。
    // 先原样放过起音的那 0.13 s（一发炮弹的爆裂全在这一段里），再关门。
    f.setValueAtTime(Math.max(f.value, 200), t + holdS);
    f.exponentialRampToValueAtTime(520, t + holdS + 0.05);
    f.setValueAtTime(520, t + holdS + seconds);
    f.exponentialRampToValueAtTime(20000, t + holdS + seconds + 0.9);

    if (this.liveNodes + 4 > this.nodeBudget) return;   // 预算紧就只做闷响
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 4000;
    const g = ctx.createGain();
    const total = holdS + seconds + 1.4;
    // 脑子里那声也等起音期过去再进来：它 0.055 的电平（−25 dB）本来就在
    // 爆炸的量级上，压在爆裂那一瞬间等于给自己加了一层遮罩。
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.setValueAtTime(FLOOR, t + holdS);
    g.gain.linearRampToValueAtTime(0.055, t + holdS + 0.02);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + total);
    // 接在耳鸣低通**之后** —— 接在前面的话它自己也被压掉，就没有「脑子里那声」了。
    osc.connect(g).connect(this.outGain);
    osc.start(t);
    osc.stop(t + total + 0.05);
    this.liveNodes += 2;
    // 借 voice 的账本回收：这样 Dispose 里的 pendingVoices 也能把它拆掉，
    // 否则爆炸声正响着退出关卡，这两个节点就永远挂在总线上了。
    this.ReleaseVoice({ nodes: [osc, g] }, total);
  }

  // --- 环境床 -------------------------------------------------------------

  /**
   * 切环境。一档环境 = 若干条**实录床**叠在一起 + 一个撒一次性音的调度器。
   *
   * 床的播放方式见 LoopLayer：两条播放头各自从素材的随机位置起播、互相交叉淡，
   * 所以**没有循环点**，同一条 23 秒的素材永远不会以同样的方式接第二次。
   *
   * 采样载不到时退回一条合成的风（Fallback）—— 有底噪总比死寂强，
   * 但**不再合成虫和鸟**：那两样一听就是振荡器，而且三月的鲁南本来也没有虫。
   */
  Ambience(preset) {
    // 名字打错时退到 silence，但**要吭一声**：环境的失败是静默的，
    // 一关从头到尾没有环境音，冒烟测试照样全绿。
    if (preset && !AMBIENCE_PRESETS[preset]) console.warn("没有这一档环境：", preset);
    const name = AMBIENCE_PRESETS[preset] ? preset : "silence";
    if(name!==this.ambiencePreset)this.ambienceLayerLevels.clear();
    this.ambiencePreset = name;
    if (!this.ctx) return;
    this.StopAmbience();
    const cfg = AMBIENCE_PRESETS[name];
    this.space = cfg.space || "street";
    if (name === "silence") return;

    // 换档时强度那一层要重新落到当前值上（新起的床不该从 1.0 起跳）。
    this.battleBedApplied = BattleBedScale(this.battleIntensity);
    for (const layer of cfg.layers || []) {
      const buffer = this.ambBuffers.get(layer.bed);
      if (!buffer) continue;                       // 这一层没载到就少一层，其余照放
      const inst = new LoopLayer(this, buffer, layer);
      // 强度要在 Start **之前**写进去：组增益的初值就是它，
      // 否则新起的战斗床会先满音量响一下再被斜坡拉回去。
      if (inst.battle) inst.levelScale = this.battleBedApplied;
      if(this.ambienceLayerLevels.has(layer.bed))inst.levelScale=this.ambienceLayerLevels.get(layer.bed);
      inst.Start();
      this.ambLayers.push(inst);
    }
    // 一条床都没有（整包没载到 / 还在下载）时才合成兜底。
    if (!this.ambLayers.length) this.AmbienceFallback(cfg);

    this.ScheduleAmbienceEvent();
  }

  /**
   * 采样没到位时的垫底：一层棕噪过缓慢移动的低通。
   * 它**不是**上一版那个「环境床」——上一版拿它当主角，所以整场仗听着像开着的嘶声。
   * 现在它只在实录载不到的那几秒里顶一下。
   */
  AmbienceFallback(cfg) {
    const wind = cfg.fallbackWind ?? 0.05;
    if (!(wind > 0)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const own = (n) => { this.ambienceNodes.push(n); this.liveNodes += 1; return n; };
    const src = own(ctx.createBufferSource());
    src.buffer = this.NoiseBuffer("brown");
    src.loop = true;
    const lp = own(ctx.createBiquadFilter());
    lp.type = "lowpass";
    lp.frequency.value = cfg.fallbackCut ?? 420;
    lp.Q.value = 0.6;
    const lfo = own(ctx.createOscillator());
    lfo.type = "sine";
    lfo.frequency.value = 0.07;
    const lfoGain = own(ctx.createGain());
    lfoGain.gain.value = (cfg.fallbackCut ?? 420) * 0.45;
    lfo.connect(lfoGain).connect(lp.frequency);
    const g = own(ctx.createGain());
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(wind, t + 1.8);
    src.connect(lp).connect(g).connect(this.ambienceBus);
    src.start(t);
    lfo.start(t);
  }

  /**
   * 环境事件调度：每 0.4 秒掷一次骰子。间隔的不规则性就是「零星」的来源。
   * 表里写的是 perMin（一分钟平均几次）—— 比写 0.4 秒里的概率好读得多，
   * 「远处的狗一分钟叫 1.5 次」是能想象的，「chance: 0.01」不是。
   */
  ScheduleAmbienceEvent() {
    const cfg = AMBIENCE_PRESETS[this.ambiencePreset];
    if (!cfg || !this.ctx) return;
    this.ambienceTimer = this.Later(AMB_TICK_MS, () => {
      const c = AMBIENCE_PRESETS[this.ambiencePreset];
      if (!c) return;
      // 战斗类撒播随强度涨落。**两条曲线不同**：频次涨得比音量快
      // （打起来是「更密」，不是「更响」——更响那件事由床与真实交火自己完成）。
      const rateScale = BattleEventRate(this.battleIntensity);
      const volScale = BattleEventVolume(this.battleIntensity);
      for (const ev of c.events || []) {
        const perMin = (ev.perMin || 0) * (ev.battle ? rateScale : 1);
        if (this.ambienceRng() >= perMin / AMB_TICKS_PER_MIN) continue;
        if (ev.battle) this.stats.battleEvents += 1;
        this.Play(ev.name, {
          volume: ev.volume * (ev.battle ? volScale : 1) * (0.7 + this.ambienceRng() * 0.6),
          // 远处的声音在立体声里撒开，别都堆在正中。
          pan: this.ambienceRng() * 2 - 1,
          pitch: (ev.pitch ?? 1) * (0.94 + this.ambienceRng() * 0.12),
          airCut: ev.airCut ?? AMB_AIR[ev.name] ?? 0,
          delay: this.ambienceRng() * 0.35,
          burst: ev.burst ?? undefined,
          bus: "ambience",
        });
      }
      this.ScheduleAmbienceEvent();
    });
  }

  SetAmbienceLayerLevel(bed, scale, rampS=1) {
    const level=Math.max(0,Number.isFinite(scale)?scale:1);
    this.ambienceLayerLevels.set(bed,level);
    for(const layer of this.ambLayers)if(layer.bed===bed)layer.SetLevel(level,rampS);
  }

  StopAmbience() {
    if (this.ambienceTimer) { clearTimeout(this.ambienceTimer); this.timers.delete(this.ambienceTimer); this.ambienceTimer = 0; }
    for (const layer of this.ambLayers) layer.Stop();
    this.ambLayers.length = 0;
    for (const n of this.ambienceNodes) {
      try { if (n.stop) n.stop(); } catch (err) { /* 没 start 过 */ }
      try { n.disconnect(); } catch (err) { /* ok */ }
    }
    this.liveNodes = Math.max(0, this.liveNodes - this.ambienceNodes.length);
    this.ambienceNodes.length = 0;
  }
  // --- 音乐 ---------------------------------------------------------------

  /**
   * 切音乐 cue。null = 停。
   *
   * 播放走 LoopLayer（与环境床同一个播放器），只是 random 关掉 ——
   * 曲子必须从头放，随机起播点对音乐是灾难。首尾各留 3.2 秒交叉淡，
   * 循环点因此听不出来。
   *
   * cue 之间是**交叉**而不是硬切：旧的淡出 1.6 秒，新的立刻淡入。
   * 硬切在战斗里特别刺耳 —— 玩家会以为是自己把什么按坏了。
   */
  Music(cue, { fadeOut = 1.6, levelScale } = {}) {
    const name = MUSIC_CUES[cue] ? cue : null;
    if (cue && !MUSIC_CUES[cue]) console.warn("没有这一段音乐：", cue);
    const unchanged = this.musicCue === name;
    levelScale ??= unchanged ? this.musicLevelScale : 1;
    this.musicCue = name;
    this.musicLevelScale = levelScale;
    if (this.paused && this.pausedState) this.pausedState.music = name;
    if (!this.ctx) return;
    if (unchanged && this.musicLayer) { this.SetMusicLevel(levelScale); return; }
    this.StopMusic(fadeOut);
    if (!name || this.paused || this.disposed) return;
    const buf = this.musicBuffers.get(name);
    if (!buf) {
      if (MUSIC_CUES[name].onDemand) this.LoadMusicCue(name).then(buffer => {
        if (buffer && !this.disposed && !this.paused && this.musicCue === name) this.Music(name);
      });
      return;
    }
    const fade = Math.min(MUSIC_CUES[name].loopFadeS ?? 3.2, buf.duration * 0.2);
    this.musicLayer = new LoopLayer(this, buf, {
      bed: "music:" + name, gain: MUSIC_CUES[name].level, bus: "music",
      random: false, seg: buf.duration - fade, fade,
    });
    this.musicLayer.levelScale = this.musicLevelScale;
    this.musicLayer.Start();
  }

  SetMusicLevel(scale, rampS = 1) {
    this.musicLevelScale = Math.max(0, scale);
    this.musicLayer?.SetLevel(this.musicLevelScale, rampS);
  }

  /** 停音乐。fade > 0 时淡出，别硬掐。 */
  StopMusic(fade = 0) {
    if (!this.musicLayer) return;
    this.musicLayer.Stop(fade);
    this.musicLayer = null;
  }

  /**
   * 整条号声。**军号是单声部乐器，所以整条只用一个振荡器**，音高、亮度、包络
   * 全部排在同一组自动化事件上 —— 逐音各建一套是 40 个节点，这样是 3 个。
   * 号嘴的特征在两处：起音亮度的过冲（那一下「破」），以及起音时几个音分的
   * 不稳（吹号的人不是节拍器）。少了这两样就是萨克斯风或者合成器方波。
   */
  BugleLine(v, notes, level) {
    const t0 = v.t;
    const osc = v.Osc(this.Wave("brass"), v.F(notes[0][1]));
    const lp = v.Filter("lowpass", v.F(notes[0][1] * 2), 1.2);
    const g = v.Gain(FLOOR);
    osc.connect(lp).connect(g).connect(v.out);
    let end = 0;
    for (let i = 0; i < notes.length; i += 1) {
      const dt = notes[i][0], hz = v.F(notes[i][1]), dur = notes[i][2];
      const at = t0 + dt;
      osc.frequency.setValueAtTime(hz, at);
      lp.frequency.setValueAtTime(hz * 1.6, at);
      lp.frequency.linearRampToValueAtTime(hz * 9, at + Math.min(0.045, dur * 0.4));
      lp.frequency.exponentialRampToValueAtTime(hz * 4, at + dur);
      osc.detune.setValueAtTime(v.R(-12, 12), at);
      osc.detune.linearRampToValueAtTime(0, at + Math.min(0.09, dur * 0.7));
      // 包络必须整个装进这个音的时长里：越界的话下一个音的 setValueAtTime 会
      // 从中间截断上一条斜坡，出来是一串「咔」。
      Swell(g.gain, at, level, dur * 0.22, dur * 0.45, dur * 0.32);
      end = Math.max(end, dt + dur);
    }
    v.Start(osc, t0, end + 0.12);
  }
}

export default AudioEngine;
