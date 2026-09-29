// 环境床素材来源表 —— 「这一层空气是谁在哪儿录的」。
//
// ## 为什么整层推倒重做
// 旧的环境床是**棕噪过一个慢慢晃的低通**当风，加一个每 0.4 秒掷骰子撒远处枪声的
// 调度器；夜里的虫是 4.3 kHz 正弦被 27 Hz 方波门断出来的，黎明的鸟是振荡器扫频。
// 三条毛病，每一条都致命：
//   1. **噪声不是风**。风是一团有结构的湍流，低通扫得再慢也只是「开着的嘶声」；
//      玩家听到的是底噪，不是户外。
//   2. **战场没有底**。真实的围城是一层**一直在响的远方**：几公里外的炮口连成
//      一片闷雷，间杂人声。旧版只有稀疏的单发枪声撒在静音上 —— 每一发都突兀，
//      合起来还是安静的。氛围不对的根子在这儿。
//   3. **合成的虫和鸟是电子音**。而且三月的鲁南根本没有虫叫（滕县战役是
//      1938 年 3 月 14—17 日，华北平原刚开春，夜里零上下），旧版那片蟋蟀
//      连季节都不对。
//
// 现在：**每一层都是实录**。风、火、远处的战斗、夜、黎明各是一条真的录音，
// 在引擎里分层叠着放（见 Script_Audio 的 AMBIENCE_PRESETS）。
//
// ## 循环样本这件事，是上一版记错了帐
// 旧注释写着「**不许贴循环样本**：三十秒的战场循环听两遍就露馅」。露馅的不是
// 「用了循环」，是「每一圈都从同一个地方开始」。这一版**根本没有循环点**：
// 每一层床同时挂两条播放头，各自从素材里的**随机位置**起播，放十来秒就等功率
// 交叉淡到下一个随机位置去（见 Script_Audio 的 AmbLayer）。一条 23 秒的素材
// 因此永远不会以同样的方式接第二次，也不必把首尾烘成无缝 ——
// 顺带绕开了 MP3 的编码器补零（那玩意儿会让任何「无缝 loop」在接缝处咔一下）。
//
// ## 选材的三条标准
//   1. **季节与纬度对得上**。要的是华北平原早春：叶子还没长出来、干、冷、旷。
//      所以宁可用「冬末的开阔地」也不要「春天的树林」——
//      鸟一多、树叶一响，滕县立刻变成度假村。
//   2. **人声不能听出是哪国话**。Coll Anderson 那几条战斗人群是英语录的；
//      只取**非语义**的段落（持续交火的嘈杂、远处的呻吟、人群骚动），再低通
//      到 1.1 kHz 以下、推到混响里 —— 到这个距离上剩下的只有情绪，没有词。
//      听得出词的一律不用。
//   3. **一次性音要真的是一次性音**。狗吠、乌鸦、掷弹筒远处那一声，都从**单独
//      录的素材**里切，不从别的环境录音里抠 —— 抠出来必带原录音的底噪，
//      叠到我们自己的床上就是两层空气打架。
//
// 字段：
//   beds[]  —— 床。durS 成品长度、atS 素材里的起点（不给就自动挑**最平稳**的一段：
//              电平方差最小、没有独一份的大动静、也不是一段静音）、
//              hp/lp 高低通（把一条近景录音推到远处，或砍掉不该有的低频）、
//              rms 目标响度（dBFS —— 床之间按响度对齐，不按峰值：
//              峰值对齐的话，一条有炸响的素材会把整层压得听不见）。
//   cuts[]  —— 一次性音，切法与 Script_SfxBake 同构（tail/gain/variants/decay/atS）。

export const AMB_LICENSES = {
  sonniss: {
    name: "Sonniss GDC Game Audio Bundle",
    terms: "免版税，可用于商业与非商业项目（本表仍逐条记录厂商）",
    via: "https://archive.org/details/sonniss.com-gdc-game-audio-bundles",
  },
  generated: {
    name: "Taierzhuang1938 procedural synthesis",
    terms: "本仓库原创确定性程序合成，无第三方素材或外部许可限制",
    via: "local://Taierzhuang1938/Script_AmbBake.mjs",
  },
  volcengine: {
    name: "Volcengine SeedAudio 1.0",
    terms: "由本项目账户经火山引擎 API 生成；使用受该服务条款约束",
    via: "https://openspeech.bytedance.com/api/v3/tts/create",
  },
  mixed: {
    name: "Mixed: Volcengine SeedAudio 1.0 stems + Sonniss GDC single shots already shipped in this repository",
    terms: "战场远景床候选（bedVariants）：SeedAudio 生成的底（受火山引擎条款约束）叠上仓库里已有的 Sonniss 实录远枪 / 远炮单发（免版税）；"
      + "每条候选的 sources 逐项写明用了哪些单发、各自的许可。",
    via: "Script_SeedAudioBattleBedBake.mjs",
  },
};

// ---------------------------------------------------------------------------
// 战场远景床的无人声候选（2026-09-29）
//
// 用户原话：「当前默认游戏的环境音里有太多奇奇怪怪的人声，参考 COD 这类的操作给我重新生成几条给我选择」。
// 审计与结论见 docs/Data_AudioAssets.md「战场远景床：无人声候选（2026-09-29）」。
//
// 现行 `battleFar` 是 Coll Anderson 的英语战斗人群录音（低通到 1.1 kHz），
// 听感就是「一群听不清在喊什么的人」。COD（WaW / WWII）的远方战场只有仗、没有人群：
// 炮群闷雷、连绵的枪声和它们在地形上的回声。下面五条候选照这个口径做，**全程没有人声**。
//
// 做法（Script_SeedAudioBattleBedBake.mjs）：
//   1. SeedAudio 生成「底」（stems）：持续型的炮群、枪声纹理。SeedAudio 做持续型难、做枪炮本体「实而不炸」，
//      所以底只负责连绵与空间；
//   2. 把仓库里已有的实录远枪 / 远炮单发（Sonniss，来源见 sfx 与 amb 清单）按固定种子随机撒进去补「炸」；
//   3. 每条成品按 RMS 对齐到现行 battleFar 的成品响度（AMB_BED_TARGET），再过一遍人声筛查
//      （Script_AmbBedVoiceScreen.py：Silero VAD + Whisper 转写 + 基频连续段）。
//
// 候选不进 manifest.beds（否则开机会把五条都下载）；它们在清单的 `bedVariants` 里，
// 只有被选中的那一条才会被 Script_Audio 装载（Script_AmbBedVariant.mjs 决定装哪一条）。
// 选定后改 Data_Tuning_Audio.BATTLE_BED_VARIANT 一个数即可，也可以用 ?ambBed=A|B|C|D|E|none 现场试听。
// ---------------------------------------------------------------------------

/** 现行 battleFar 成品实测：RMS −27.43 dBFS、峰 −7.4 dBFS（2026-09-29 ffmpeg astats）。候选按同一个 RMS 对齐。 */
export const AMB_BED_TARGET = Object.freeze({ rmsDb: -27.4, rmsTolDb: 0.4, peakCeilingDb: -2.5, bitrate: "80k" });

/**
 * SeedAudio 生成的底。每条提示词都先写「全程没有任何人声」再描述拟音师会做的事：
 * 频段、密度、距离感、回声；结尾再把禁止项列一遍（人声、喊叫、口哨、惨叫、音乐、动物、发动机、飞机）。
 * 同一条提示词多次请求结果不同（没有固定种子），take 编号 = 第几次抽；采用哪一次写在 AMB_BED_VARIANTS 的 stems[].take。
 */
export const AMB_BED_STEMS = Object.freeze([
  {
    id: "ThunderRoll",
    prompt: "生成一条约四十秒的连续写实远方炮击环境录音，纯战场音效，全程没有任何人声、喊叫、说话、口哨、呻吟、音乐。"
      + "1938年华北平原，听者站在开阔的旷野上，炮群在四到八公里外的地平线以远持续射击：一记记低沉的炮口闷雷从远处滚来，间隔不均匀，"
      + "有时两三记成串，有时隔好几秒才一记，每一记先是一下很闷的鼓动，再拖着一两秒从地面传来的隆隆余响，慢慢消散。"
      + "偶尔有一记更远的沉闷爆炸使地面轻轻一颤。频段集中在四十到四百赫兹，高频几乎被距离吃光，整体宽阔、厚重、柔和，不刺耳；"
      + "全程距离、方位和整体响度保持稳定，不靠近、不加速，没有近处的爆炸或啸叫。"
      + "绝对没有人声、喊叫、说话、口哨、笑声、广播、音乐、旋律、鼓点、乐器、动物叫声、车辆引擎和飞机，只有远方炮火的闷雷和旷野里很轻的空气底噪。",
  },
  {
    id: "RifleCrackle",
    prompt: "生成一条约四十秒的连续写实战场环境录音，只有枪声，全程没有任何人声、喊叫、说话、口哨、惨叫、音乐。"
      + "听者站在开阔地里，交战的战线在三四百米到一公里以外：老式栓动步枪的单发脆响此起彼伏，夹杂机枪三五发的短点射和几次长一些的点射，"
      + "连绵不断的噼噼啪啪，密度时疏时密，从不完全停下。每一声枪响之后都能听到田野、土坡和远处村庄墙面反射出来的短促回声尾巴，"
      + "约半秒到一秒半，枪声之间的空隙里是这些回声叠出来的沙沙的余响。距离感是中远距离，枪声干脆但不刺耳，没有近处的枪响，没有爆炸，没有炮声。"
      + "绝对没有人声、喊叫、说话、口哨、惨叫、笑声、广播、音乐、鼓点、乐器、动物叫声、车辆引擎和飞机，只有远处交火的枪声与它们的回声。",
  },
  {
    id: "BarrageShells",
    prompt: "生成一条约四十秒的连续写实炮击环境录音，压迫感强，全程没有任何人声、喊叫、说话、口哨、呻吟、音乐。"
      + "1938年，听者伏在开阔地里，火炮在两三公里外持续密集轰击：炮口的闷响一记紧接一记，中间夹着炮弹落地的沉重爆炸，"
      + "隔着距离只剩低频的重击与地面的震动，大爆炸之后有一段回荡的隆隆声；节奏不规则，偶有一轮齐射连着五六记，也有短暂缓一两秒又接上，几乎没有真正的安静。"
      + "低频厚重，高频柔和被距离削掉，整体像一堵持续推过来的声墙，但方位和距离全程保持稳定，没有炮弹划过头顶的尖啸，没有近处爆炸。"
      + "绝对没有人声、喊叫、说话、口哨、笑声、广播、音乐、旋律、鼓点、乐器、动物叫声、车辆引擎和飞机，只有远方炮击的闷响、爆炸和大地的隆隆。",
  },
  {
    id: "MgLongBursts",
    prompt: "生成一条约四十秒的连续写实机枪射击环境录音，全程没有任何人声、喊叫、说话、口哨、惨叫、音乐。"
      + "听者在开阔地里，一挺老式重机枪在五六百米外一次次长点射，每次连射十几发到三四十发，节奏快而有金属质感，点射之间隔两三秒到七八秒不等；"
      + "远处另有一挺轻机枪在更远的方向不时回应几发短点射。每一次连射之后，空旷的田野和远处房屋反射出一层短短的回声。"
      + "距离是中远距离，机枪声干燥、硬、不刺耳，没有近处枪响，没有爆炸和炮声。"
      + "绝对没有人声、喊叫、说话、口哨、惨叫、笑声、广播、音乐、鼓点、乐器、动物叫声、车辆引擎和飞机，只有远处机枪长点射与它们的回声。",
  },
  {
    id: "ColdFront",
    prompt: "生成一条约四十秒的连续写实环境录音，冷、空、克制，全程没有任何人声、喊叫、说话、口哨、音乐。"
      + "冬末清晨的华北平原，风很轻地掠过空旷的地面，几公里外的战线只剩下稀疏、模糊的动静：偶尔一记很远的炮声，像地平线下的一下闷震，"
      + "偶尔几声小到几乎听不清的枪响，更多时候是几秒到十几秒的近乎寂静，只有极轻的空气与远处低频的余韵。"
      + "声音全程柔和、空旷、遥远，动静稀疏、不连续，不制造紧张的节奏，没有近处的声音，没有爆炸的正面冲击。"
      + "绝对没有人声、喊叫、说话、口哨、笑声、广播、音乐、旋律、鼓点、乐器、动物叫声、车辆引擎和飞机，只有很轻的风、远方零星的炮声枪声和它们的余音。",
  },
  {
    id: "AlleyEcho",
    prompt: "生成一条约四十秒的连续写实枪声环境录音，只有枪声与回声，全程没有任何人声、喊叫、说话、口哨、惨叫、音乐。"
      + "听者站在村镇边缘的土路上，战斗发生在几百米外的村子里：步枪单发和短点射从砖墙、土墙、院落之间传出来，撞在密集的墙面上拍打出一层层短促的回声，"
      + "先是清晰的一二百毫秒的拍打回声，再接一段较长的散射尾巴，偶尔有瓦片或碎砖掉落的细碎声响，偶尔一声闷闷的手榴弹爆炸从院墙后传出。"
      + "枪声时疏时密，大部分是中远距离，干脆而带着墙面的硬回声。没有近处枪响，没有炮声。"
      + "绝对没有人声、喊叫、说话、口哨、惨叫、笑声、广播、音乐、鼓点、乐器、动物叫声、车辆引擎和飞机，只有村子里传出的枪声、爆炸和墙面的回声。",
  },
]);

// 撒进床里的实录单发（都是仓库里已经在用的成品，不新增素材；来源逐条写清）。
const SHOT = Object.freeze({
  cannonFar: Object.freeze({ cue: "ambCannonFar", license: "sonniss", credit: "Pole Position Production · 远处的火炮 · Sonniss GDC 2017",
    files: ["Audio/Amb/AudioAmb_AmbCannonFar_01.mp3", "Audio/Amb/AudioAmb_AmbCannonFar_02.mp3", "Audio/Amb/AudioAmb_AmbCannonFar_03.mp3"] }),
  rifleNraFar: Object.freeze({ cue: "rifleNraFar", license: "sonniss", credit: "FLYSOUND · 莫辛纳甘 50 m 外 · Sonniss GDC 2020",
    files: ["Audio/Sfx/AudioSfx_RifleNraFar_01.mp3", "Audio/Sfx/AudioSfx_RifleNraFar_02.mp3", "Audio/Sfx/AudioSfx_RifleNraFar_03.mp3"] }),
  rifleIjaFar: Object.freeze({ cue: "rifleIjaFar", license: "volcengine", credit: "Volcengine SeedAudio 1.0 · rifleIjaFar · 2026-09-11",
    files: ["Audio/Sfx/AudioSfx_SeedAudioRifleIjaFar_01.mp3"] }),
  zb26Far: Object.freeze({ cue: "zb26Far", license: "sonniss", credit: "Pole Position Production · L7A2 GPMG 7.62×51（50 m 后方机位）· Sonniss GDC 2016",
    files: ["Audio/Sfx/AudioSfx_Zb26Far_01.mp3", "Audio/Sfx/AudioSfx_Zb26Far_02.mp3"] }),
  type92Far: Object.freeze({ cue: "type92Far", license: "sonniss", credit: "Pole Position Production · M1919A4 .30cal（枪架，300 m 正前）· Sonniss GDC 2016",
    files: ["Audio/Sfx/AudioSfx_Type92Far_01.mp3", "Audio/Sfx/AudioSfx_Type92Far_02.mp3"] }),
});

/**
 * 五条候选的混音配方。字段：
 *   stems[]   {id, take, hp, lp, gainDb, fromS, rotateS, swap}  底：哪条提示词的第几次抽、滤波与增益；
 *             rotateS = 把这一份在时间上循环移位（0.35 s 等功率交叉接缝），swap = 左右对调 ——
 *             同一条底叠两份就是两条互不同步的炮群
 *   scatter[] {id, ...SHOT.x, perMin, peakOverBedDb, jitterDb, hp, lp, pan, pitch, echo, tailS, minGapS}
 *             实录单发的撒播：指数间隔、固定种子；峰值 = 底的 RMS + peakOverBedDb；echo = aecho 的回声尾巴
 *   finalHp / finalLp  整条最后的高低通
 */
export const AMB_BED_VARIANTS = [
  {
    key: "A", file: "AudioAmb_BattleFarDistantThunder.mp3", label: "远方炮群闷雷", durS: 40,
    style: "炮群在地平线以外一记接一记地滚闷雷，间隔不匀；只在缝里落几声很远的枪。最稳的底：低频为主，不抢枪声、脚步和台词。",
    credit: "Volcengine SeedAudio 1.0（ThunderRoll 炮群闷雷，两份错开叠）+ Sonniss 远炮 / 远枪单发",
    stems: [
      { id: "ThunderRoll", take: 1, hp: 28, lp: 700 },
      { id: "ThunderRoll", take: 1, hp: 28, lp: 520, gainDb: -5, rotateS: 2.4, swap: true },
    ],
    scatter: [
      { id: "Cannon", ...SHOT.cannonFar, perMin: 4, peakOverBedDb: 16, jitterDb: 3, hp: 40, lp: 650, pan: [-0.85, 0.85], pitch: [0.94, 1, 1.06], tailS: 3.4, minGapS: 2.5 },
      { id: "RifleNra", ...SHOT.rifleNraFar, perMin: 4, peakOverBedDb: 4, jitterDb: 4, hp: 200, lp: 3000, pan: [-0.9, 0.9], pitch: [0.96, 1, 1.04],
        echo: { delaysMs: [380, 820], decays: [0.3, 0.16], padS: 1.6, lp: 2200 }, tailS: 1.8, minGapS: 3 },
      { id: "RifleIja", ...SHOT.rifleIjaFar, perMin: 3, peakOverBedDb: 3, jitterDb: 4, hp: 200, lp: 3000, pan: [-0.9, 0.9], pitch: [0.95, 1.05],
        echo: { delaysMs: [420, 900], decays: [0.28, 0.14], padS: 1.6, lp: 2200 }, tailS: 1.8, minGapS: 3 },
    ],
    finalLp: 2600,
  },
  {
    key: "B", file: "AudioAmb_BattleFarRifleCrackle.mp3", label: "步机枪交火纹理", durS: 40, poisson: true,
    style: "中远距离的步枪与机枪交火：连绵的噼啪、时疏时密，每一声都拖着田野与土坡的回声尾巴。像 COD 里隔着一片地打的那条战线。",
    credit: "Volcengine SeedAudio 1.0（RifleCrackle 交火纹理，两次抽错开叠）+ Sonniss / SeedAudio 远枪与机枪单发",
    // 两次抽的 RifleCrackle 左右对调、错开 3.1 s 叠：SeedAudio 的枪声是一记一记隔着两秒的，两份叠起来才「连绵」。
    stems: [
      { id: "RifleCrackle", take: 1, hp: 60, lp: 6500, gainDb: -3 },
      { id: "RifleCrackle", take: 2, hp: 60, lp: 6500, gainDb: 0, rotateS: 3.1, swap: true },
    ],
    scatter: [
      { id: "RifleNra", ...SHOT.rifleNraFar, perMin: 20, peakOverBedDb: 6, jitterDb: 4, hp: 180, lp: 3600, pan: [-0.9, 0.9], pitch: [0.95, 1, 1.05],
        echo: { delaysMs: [190, 430, 820], decays: [0.34, 0.22, 0.12], padS: 1.6, lp: 2600 }, tailS: 1.8, minGapS: 0.35 },
      { id: "RifleIja", ...SHOT.rifleIjaFar, perMin: 14, peakOverBedDb: 5, jitterDb: 4, hp: 180, lp: 3600, pan: [-0.9, 0.9], pitch: [0.95, 1.05],
        echo: { delaysMs: [210, 470, 900], decays: [0.32, 0.2, 0.1], padS: 1.6, lp: 2600 }, tailS: 1.8, minGapS: 0.35 },
      { id: "Zb26", ...SHOT.zb26Far, perMin: 5, poisson: false, peakOverBedDb: 7, jitterDb: 3, hp: 150, lp: 3200, pan: [-0.7, 0.7], pitch: [0.97, 1.03],
        echo: { delaysMs: [240, 520, 900], decays: [0.3, 0.18, 0.1], padS: 1.6, lp: 2400 }, tailS: 1.8, minGapS: 1 },
      { id: "Type92", ...SHOT.type92Far, perMin: 4, poisson: false, peakOverBedDb: 7, jitterDb: 3, hp: 150, lp: 3200, pan: [-0.7, 0.7], pitch: [0.97, 1.03],
        echo: { delaysMs: [260, 560, 950], decays: [0.3, 0.18, 0.1], padS: 1.6, lp: 2400 }, tailS: 1.8, minGapS: 1.5 },
    ],
    finalLp: 7000,
  },
  {
    key: "C", file: "AudioAmb_BattleFarHeavyBarrage.mp3", label: "密集弹幕", durS: 40,
    style: "炮击一记紧接一记、地面在震，机枪不时来一串长点射：压迫感最强，几乎没有安静的缝。",
    credit: "Volcengine SeedAudio 1.0（BarrageShells 炮击 + MgLongBursts 机枪长点射）+ Sonniss 远炮 / 远枪单发",
    stems: [
      { id: "BarrageShells", take: 1, hp: 35, lp: 2000, gainDb: -2 },
      { id: "MgLongBursts", take: 1, hp: 140, lp: 2400, gainDb: -13 },
    ],
    scatter: [
      { id: "Cannon", ...SHOT.cannonFar, perMin: 9, peakOverBedDb: 14, jitterDb: 3, hp: 40, lp: 900, pan: [-0.85, 0.85], pitch: [0.92, 1, 1.08], tailS: 3.4, minGapS: 1.2 },
      { id: "RifleNra", ...SHOT.rifleNraFar, perMin: 7, peakOverBedDb: 3, jitterDb: 4, hp: 200, lp: 3200, pan: [-0.9, 0.9], pitch: [0.96, 1, 1.04],
        echo: { delaysMs: [300, 700], decays: [0.28, 0.14], padS: 1.5, lp: 2400 }, tailS: 1.8, minGapS: 1 },
    ],
    finalLp: 3200,
  },
  {
    key: "D", file: "AudioAmb_BattleFarColdFrontline.mp3", label: "克制的冷战线", durS: 40,
    style: "风里几公里外的战线：稀疏、冷、空，大半时间只有地平线下的低频余韵，偶尔一记远炮、几声几乎听不清的枪。",
    credit: "Volcengine SeedAudio 1.0（ColdFront 冷空远景）+ Sonniss 远炮 / 远枪单发",
    // ColdFront 原片是 −57 dBFS 的低频空气底噪加几处几乎听不见的远响。按 RMS 对齐时若把整条噪声抬 30 dB，
    // 出来是一片恒定的嘶声（第一版就是这样：每半秒 RMS 都在 −29 dBFS，「稀疏」全没了）。
    // 现在：底留一层很轻的冷空气（+8 dB 后仍比单发低约 20 dB；80 Hz 以下与 2.2 kHz 以上砍掉），撒播的单发按写死的参照 refRmsDb 摆，
    // 抬 RMS 时是单发被抬起来、缝里仍然是空的。
    refRmsDb: -30,
    stems: [{ id: "ColdFront", take: 1, hp: 80, lp: 2200, gainDb: 13 }],
    scatter: [
      { id: "Cannon", ...SHOT.cannonFar, perMin: 3, peakOverBedDb: 9, jitterDb: 3, hp: 50, lp: 380, pan: [-0.8, 0.8], pitch: [0.94, 1, 1.06], tailS: 3.4, minGapS: 5 },
      { id: "RifleNra", ...SHOT.rifleNraFar, perMin: 4, peakOverBedDb: 3, jitterDb: 4, hp: 220, lp: 1700, pan: [-0.9, 0.9], pitch: [0.96, 1, 1.04],
        echo: { delaysMs: [520, 1100], decays: [0.26, 0.14], padS: 2.2, lp: 1400 }, tailS: 2.4, minGapS: 4 },
    ],
    finalLp: 2600,
  },
  {
    key: "E", file: "AudioAmb_BattleFarVillageEcho.mp3", label: "村镇巷战回声", durS: 40, poisson: true,
    style: "仗在村子里打：步枪与短点射撞在砖墙、土墙之间，一层一层拍回来，回声一层叠一层。",
    credit: "Volcengine SeedAudio 1.0（AlleyEcho 巷战回声，两次抽错开叠）+ Sonniss / SeedAudio 远枪单发",
    stems: [
      { id: "AlleyEcho", take: 1, hp: 75, lp: 6500, gainDb: 3 },
      { id: "AlleyEcho", take: 2, hp: 75, lp: 6500, gainDb: -1.5, rotateS: 4.3, swap: true },
    ],
    scatter: [
      { id: "RifleNra", ...SHOT.rifleNraFar, perMin: 9, peakOverBedDb: 4, jitterDb: 4, hp: 200, lp: 4200, pan: [-0.9, 0.9], pitch: [0.96, 1, 1.04],
        echo: { delaysMs: [70, 150, 250, 400], decays: [0.5, 0.38, 0.26, 0.16], padS: 1.4, lp: 4600 }, tailS: 1.6, minGapS: 0.5 },
      { id: "RifleIja", ...SHOT.rifleIjaFar, perMin: 7, peakOverBedDb: 4, jitterDb: 4, hp: 200, lp: 4200, pan: [-0.9, 0.9], pitch: [0.95, 1.05],
        echo: { delaysMs: [80, 165, 270, 420], decays: [0.48, 0.36, 0.24, 0.15], padS: 1.4, lp: 4600 }, tailS: 1.6, minGapS: 0.5 },
      { id: "Type92", ...SHOT.type92Far, perMin: 2, peakOverBedDb: 6, jitterDb: 3, hp: 180, lp: 3800, pan: [-0.7, 0.7], pitch: [0.97, 1.03],
        echo: { delaysMs: [90, 190, 310, 470], decays: [0.5, 0.36, 0.24, 0.14], padS: 1.6, lp: 4200 }, tailS: 1.8, minGapS: 2 },
    ],
    finalLp: 6500,
  },
];

const ARCHIVE = "https://archive.org/download/";

/** 把 (item, path) 拼成 archive.org 的直链。 */
export function ArchiveUrl(item, filePath) {
  return ARCHIVE + item + "/" + filePath.split("/").map(encodeURIComponent).join("/");
}

export const AMB_SOURCES = [
  {
    id:"CarriageCrowdSeedAudio",seedAudio:true,
    credit:"Volcengine SeedAudio 1.0 · 满员军列持续闲谈",license:"volcengine",
    beds:[{cue:"carriageCrowd",durS:40,rms:-27,lp:3800}],
    retainedCues:["carriageRearCheer"],
  },
  // 序章车厢床：由 Script_SeedAudioTrainBake.mjs 直连 SeedAudio 1.0 生成。
  // AmbBake 重烘其它床时只登记这一条，不得用旧的程序合成器覆写。
  {
    id: "TrainInteriorSeedAudio",
    seedAudio: true,
    credit: "Volcengine SeedAudio 1.0 · 序章蒸汽列车车厢轮轨环境",
    license: "volcengine",
    beds: [{ cue: "trainInterior", durS: 30, rms: -25, lp: 9000 }],
  },
  // === 空间层：这地方本身的声音 ===========================================
  {
    id: "MeadowPlain",
    item: "sonniss-gdc-2024-game-audio-bundle-normalized",
    path: "Systematic Sound - General Ambience Series - Rural Countryside 01/AMBRurl_Meadow Open Plane Windy Deep Rumble_SYSO_SYSO011-1.mp3",
    credit: "Systematic Sound · 开阔平原 · 风与深处的低鸣 · Sonniss GDC 2024",
    license: "sonniss",
    // 城墙上与城外那一档的底。录的是空旷平地上的风，本身带一层很低的远方轰鸣 ——
    // 这条低频正是「地平线外还有别的动静」的来源，别用高通砍掉。
    beds: [{ cue: "windPlain", durS: 23, rms: -30, lp: 11000 }],
  },
  {
    id: "CityStreetWind",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "Articulated Sounds - Nature in the City/WEATHER WIND City Street, Wind in Trees, Strong, Foliage Rustle, Gust Wash, Subtle Creaks & Noises, Montreal, Canada, LOOP.mp3",
    credit: "Articulated Sounds · 街道强风、枝叶摩擦与吱呀 · Sonniss GDC 2020",
    license: "sonniss",
    // 巷战那一档的底：风灌进两排房子之间，带着零碎的吱呀。素材本身就是给循环用的。
    beds: [{ cue: "windStreet", durS: 19, rms: -31, hp: 60, lp: 9000 }],
  },
  {
    id: "NightWoodland",
    item: "sonniss-gdc-2024-game-audio-bundle-normalized",
    path: "Systematic Sound - General Ambience Series - Nightscapes 01/AMBForst_Nighttime-Woodlands Windy Trees Rustling Quiet_SYSO_SYSO009.mp3",
    credit: "Systematic Sound · 夜间林地，风与枝叶，安静 · Sonniss GDC 2024",
    license: "sonniss",
    // 夜。**特意挑了一条没有虫叫的**：三月的鲁南夜里还结霜，蟋蟀要到五月。
    // 上一版那片合成蟋蟀是整套环境里最出戏的一处。
    beds: [{ cue: "windNight", durS: 31, rms: -33, lp: 7500 }],
  },
  {
    id: "CountrysideDawn",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Fox Audio Post-Production - Countryside – Nature & Field/Amb_Countryside_Day_Rooster_Birds.mp3",
    credit: "Fox Audio Post-Production · 乡野白天，公鸡与鸟 · Sonniss GDC 2018",
    license: "sonniss",
    // 黎明那一档。挑的是「乡下的白天」而不是「森林的黎明合唱」——
    // 后者是一片密林在唱歌，这里要的是麦地边上零星几声，远得像另一个世界。
    beds: [{ cue: "dawnField", durS: 29, rms: -34, hp: 90, lp: 8000 }],
  },

  // === 战场层：一直在响的远方 =============================================
  {
    id: "BattleSteady",
    item: "sonniss-gdc-2015-game-audio-bundle-normalized",
    path: "Coll Anderson - Battle Crowd/EFX EXT GROUP Battle Steady Fighting 03 A.mp3",
    credit: "Coll Anderson · 持续交火中的人群 · Sonniss GDC 2015",
    license: "sonniss",
    // **整套环境里最要紧的一条**。围城里最恒定的声音不是风，是几百米外
    // 一直没停的仗。低通到 1.1 kHz 再压低 12 dB，听感就从「旁边在打」
    // 退成「那边一直在打」——语言在这个带宽上已经不成词了（选材标准 2）。
    beds: [{ cue: "battleFar", durS: 23, rms: -36, hp: 110, lp: 1100 }],
  },
  {
    id: "UnrestMurmur",
    item: "sonniss-gdc-2015-game-audio-bundle-normalized",
    path: "Coll Anderson - Battle Crowd/EFX EXT GROUP Unrest Murmur 01 A .mp3",
    credit: "Coll Anderson · 人群骚动的低语 · Sonniss GDC 2015",
    license: "sonniss",
    // 城里还有人。白天那一档垫一层极轻的人声骚动，空城与围城的差别就在这一层。
    beds: [{ cue: "crowdFar", durS: 19, rms: -40, hp: 130, lp: 900 }],
  },
  {
    id: "CannonDistant",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Pole Position - The Warfare Library/warfare_t1b_cannon_firing_forest_distant_MKH8060_2.mp3",
    credit: "Pole Position Production · 远处的火炮 · Sonniss GDC 2017",
    license: "sonniss",
    // 既做床也做单发。**床是叠出来的**：这条素材本身是一响一停（自动选段
    // 打出来方差 31 dB，整条最平稳的一段也还是「一记炮 + 一段空」），
    // 直接切一段当床就是「每 17 秒放一次同一记炮」。连绵的闷雷得自己混：
    // 26 记真炮响随机错开时间叠起来，尾巴互相搭上，再低通到 420 Hz。
    // 单发则从同一条素材里切出有头有尾的一记，交给事件调度器随机撒。
    beds: [{ cue: "shellingFar", durS: 17, rms: -34, lp: 420, stack: { count: 26, tailS: 3.0, pool: 10, minGain: 0.3 } }],
    cuts: [{ cue: "ambCannonFar", tail: 3.4, gain: 0.8, variants: 3, soft: true, decay: [0.5, 3.2] }],
  },

  // === 火 =================================================================
  {
    id: "BurningHouseNear",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Pole Position - The Burning House Library/Burning_House_t2_Fire_high_intensity_with_sizzling_and_some_debris_RE50_1.mp3",
    credit: "Pole Position Production · 房屋大火（近，含爆裂与落屑）· Sonniss GDC 2018",
    license: "sonniss",
    // 一整栋房子在烧，不是营火。第三关整条街都着着，这一层要压得住。
    beds: [{ cue: "fireNear", durS: 13, rms: -28, hp: 55 }],
  },
  {
    id: "BurningHouseFar",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Pole Position - The Burning House Library/Burning_House_t4_Fire_low_intensity_with_crackling_MKH8060.mp3",
    credit: "Pole Position Production · 房屋大火（弱，噼啪）· Sonniss GDC 2018",
    license: "sonniss",
    // 远处还在烧的那些。与近火分成两条素材，两处火才不会同一秒一起爆一下。
    beds: [{ cue: "fireFar", durS: 11, rms: -37, hp: 200, lp: 5200 }],
  },

  // === 一次性音：撒在床上的那些 ===========================================
  {
    id: "MgWhizz",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Pole Position - The Warfare Library/warfare_t3_mg_whizzes_ricochets_bullet_cracks_M10.mp3",
    credit: "Pole Position Production · 弹丸掠过、跳弹与音爆 · Sonniss GDC 2017",
    license: "sonniss",
    // 流弹掠过头顶。这是「战线离你只有一条街」最直接的证据，
    // 比再加十条远处枪声都管用。
    // 衰减下限给到 4 ms：超音速弹丸的音爆**本来就是几毫秒**，
    // 按别的音效那套 0.05 s 起筛会把真正的弹啸全筛掉，只剩跳弹的嗡鸣。
    // tail 只留 0.32 s：素材是机枪朝镜头打，留长了会把整梭子都切进来
    // （实测 0.9 s 的版本里数得出 14 个冲头），四个变体听起来一模一样。
    cuts: [{ cue: "ambWhizz", tail: 0.32, gain: 0.72, variants: 4, decay: [0.004, 0.7] }],
  },
  {
    id: "WinterRaven",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Articulated Sounds - Winter Forest Ambience/WINTER Forest windy whistling blizzard snow with raven bird croaking, North Laurentian Woods, Canada_LOOP.LR.mp3",
    credit: "Articulated Sounds · 冬季林地，风与渡鸦 · Sonniss GDC 2018",
    license: "sonniss",
    // 乌鸦。华北的战场画面里它是标配，也是唯一一种叶子掉光了还在叫的鸟。
    cuts: [{ cue: "ambCrow", tail: 1.1, gain: 0.7, variants: 3, decay: [0.1, 1.0] }],
  },
  {
    id: "BarkingDog",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "Pole Position - Barking Dog/Dog_German_Shepherd_t15_Int_Bark_Slow_Distant_RSM191.mp3",
    credit: "Pole Position Production · 犬吠（慢，远）· Sonniss GDC 2019",
    license: "sonniss",
    // 单独录的狗，不是从某条村庄环境里抠的（选材标准 3）。
    cuts: [{ cue: "ambDogFar", tail: 1.3, gain: 0.62, variants: 3, decay: [0.1, 1.2] }],
  },
  {
    id: "RoosterCall",
    item: "sonniss-gdc-2024-game-audio-bundle-normalized",
    path: "Mechanical Wave - Farm Animals/BIRDFowl_Rooster Call-12_MWSFX_FA.mp3",
    credit: "Mechanical Wave · 公鸡打鸣 · Sonniss GDC 2024",
    license: "sonniss",
    // 天亮那一关。城破的那个早上鸡照打鸣 —— 这一声比任何台词都说得清。
    // 走 whole：公鸡那一嗓子是「喔——喔喔——喔」好几个音节，
    // 用起音检测切只会切到第一节。
    cuts: [{ cue: "ambRooster", tail: 2.4, gain: 0.6, variants: 1, whole: true }],
  },
  {
    id: "TreeCreaks",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Discover Oregon - Wind and Storms/Creaks and Snaps 2017.03.20 - Gentle Tree Creaks.mp3",
    credit: "Discover Oregon · 风中木料吱呀与断裂 · Sonniss GDC 2018",
    license: "sonniss",
    // 烧塌一半的木梁在风里响。城里那一档专用。
    cuts: [{ cue: "ambCreak", tail: 1.8, gain: 0.55, variants: 3, soft: true, decay: [0.3, 1.7] }],
  },
  {
    id: "DebrisSettle",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "Coll Anderson - The Battle Crowd Collection Add on/EFX SD FS In Debris With Glass On Wood 06 C.mp3",
    credit: "Coll Anderson · 碎砖与玻璃在木头上滑落 · Sonniss GDC 2019",
    license: "sonniss",
    // 炸过之后墙自己还在掉渣。这条让废墟是「刚塌的」而不是「一直是废墟」。
    cuts: [{ cue: "ambDebris", tail: 1.2, gain: 0.6, variants: 3, decay: [0.1, 1.0] }],
  },
  {
    id: "BlenheimFlyby",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "Pole Position - Bristol Blenheim Mk 1 1934/blenheim_mk_i_t3_ext_distant_medium_fly_bys_end_of_runway_ORTF_MKH8040.mp3",
    credit: "Pole Position Production · 布里斯托尔「布伦海姆」1934（远处通场）· Sonniss GDC 2019",
    license: "sonniss",
    // 年代对得上的双发活塞轰炸机（1934 年首飞，与九六陆攻同代）。
    // 滕县上空日机整日盘旋是信史；这一声不用近，远远地过一趟就够压人。
    // peakBy 放宽到 0.7：通场声本来就是**慢慢涨上来**的，
    // 按别的音效那条「冲头必须在前 30%」筛会一个候选都不剩。
    cuts: [{ cue: "ambPlaneFar", tail: 4.5, gain: 0.5, variants: 2, soft: true, peakBy: 0.7, decay: [1.2, 4.5] }],
  },
  {
    id: "AgonyMoans",
    item: "sonniss-gdc-2015-game-audio-bundle-normalized",
    path: "Coll Anderson - Battle Crowd/EFX EXT GROUP Battle End Agony Moans 02 A.mp3",
    credit: "Coll Anderson · 战斗结束后的呻吟 · Sonniss GDC 2015",
    license: "sonniss",
    // 夜里那两关用，撒得极稀（每分钟不到一次）且压得很低。
    // 非语义段落，低通到 900 Hz —— 到这个距离上只剩下人的声音，没有语言。
    cuts: [{ cue: "ambMoanFar", tail: 2.6, gain: 0.42, variants: 2, soft: true, lp: 900, decay: [0.5, 2.5] }],
  },
];
