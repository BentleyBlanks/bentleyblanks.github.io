// 音乐来源表 —— 生成曲与下载曲的来源、选段规则与配平。
//
// ## 为什么不再合成
// 上一版的音乐是四条 WebAudio 配方：一条低音提琴式的持续音、一个「简化铜管」、
// 一件独奏弦乐、一套进行曲鼓点，音高由 D 小调五声骨架排出来。
// 思路没问题，出来的东西不行 —— **一个振荡器过低通，无论怎么写包络都是电子管风琴**。
// 铜管的「亮」是起音时冲上去再回落，这个能仿；铜管真正的身份在吹嘴的噪声、
// 管壁的共振、每一次起音都不一样的那点不稳，这些不是包络能给的。
// 与 32 条音效换成实录是同一个理由，只是音乐这边没有免版税的中国民乐实录可用
// （Sonniss 那十几个包里一件中国乐器都没有），所以走生成。
//
// ## 生成用的是本机 MiniMax Hub 的网关
// `POST http://127.0.0.1:8001/api/generate/music`，backend `minimax_music`，
// `is_instrumental: "instrumental"`。**网关跟着那个 Electron 应用活**，
// 平时没在跑，`--gen` 之前先把 MiniMax Hub 开起来。
// 一次生成 80—420 秒，20 credits。生成物落 Audio/Music/_raw/（已 gitignore）。
//
// ## 提示词踩到的坑：它不听「不要节奏」
//   · 「free rhythm, long silences between phrases」这类要求基本无效，
//     模型总会给一条有律动的骨架。**否定式提示只有对「乐器」有效，对「结构」无效。**
//   · 想要稀疏，别写「sparse」，写**乐器编制**：「一条持续低音 + 一支笛子偶尔
//     进来一个长音，别的什么都没有」比「extremely sparse」管用得多
//     （menu 这一条重生成一次就是为了这个，第二版的静默占比高得多）。
//   · 「solo erhu，长弓，无拨弦」两次都没做到 —— 回来的都是**弹拨**音色。
//     这是这套音乐目前最大的一处「说了没照做」，记在这儿，别再花钱重试同一句。
//
// ## 选段
// 生成出来的是一整首有起承转合的曲子，游戏里要的是一段**可以一直循环下去**的。
// 所以每条按 mood 自动挑窗口：
//   · sparse —— 挑「峰值比中位高得多、起音最少」的一段（独奏、留白多）
//   · steady —— 挑「电平最平稳」的一段（要垫在底下、不能有起伏的）
// 挑完在引擎里由 LoopLayer 首尾交叉淡地循环（与环境床同一套播放器）。

export const MUSIC_LICENSE = {
  name: "逐曲授权（见 cues[].source）",
  terms: "生成曲随项目使用；Kevin MacLeod 曲目为 CC BY 4.0；CC0 曲目按来源页授权",
  via: "Data_MusicSources.mjs",
};

export const MUSIC_SOURCES = [
  {
    id: "Menu",
    cue: "menu",
    // B03：用户试听收藏。正式包直接复用评审时听到的同一份 90 秒成品，避免重新选段走样。
    durS: 90, reviewedFile: "BgmReview/Audio/Bgm/AudioBgm_CandidateTheDescent.mp3",
    source: {
      title: "The Descent", author: "Kevin MacLeod", license: "CC BY 4.0",
      page: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/The%20Descent.mp3",
    },
  },
  {
    id: "Siege",
    cue: "siege",
    // B05：用户试听收藏，用在围城与持续承压阶段。
    durS: 90, reviewedFile: "BgmReview/Audio/Bgm/AudioBgm_CandidateGraveBlow.mp3",
    source: {
      title: "Grave Blow", author: "Kevin MacLeod", license: "CC BY 4.0",
      page: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Grave%20Blow.mp3",
    },
  },
  {
    id: "Night",
    cue: "tension",
    // 夜里两关。素材有 420 秒，留白最多的一段就在里面，让选段自己去找。
    mood: "sparse", durS: 52, rms: -29, fadeS: 3.0,
    prompt: "Extremely quiet and sparse. A single plucked Chinese string instrument (guqin) sounding one note at a time with very long decay and wide silence between notes. Cold, tense, waiting in the dark. No drums, no percussion, no bass line, no chords, no pad, no synthesizer, no vocals.",
  },
  {
    id: "Charge",
    cue: "charge",
    // B12：用户试听收藏，只用于反攻与白刃的短时高潮。
    durS: 90, reviewedFile: "BgmReview/Audio/Bgm/AudioBgm_CandidateVolatileReaction.mp3",
    source: {
      title: "Volatile Reaction", author: "Kevin MacLeod", license: "CC BY 4.0",
      page: "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Volatile%20Reaction.mp3",
    },
  },
  {
    id: "Aftermath",
    cue: "aftermath",
    // 结局。全场唯一一处允许「像配乐」的地方 —— 仗已经打完了。
    mood: "sparse", durS: 50, rms: -25, fadeS: 3.5,
    prompt: "Solo erhu playing a slow funeral lament, alone, with one very quiet low string drone underneath. North China 1938. Free rhythm, long sustained notes, wide silences, unresolved ending. No drums, no percussion, no piano, no synthesizer, no orchestra, no vocals.",
  },
  {
    id: "FieldLament",
    cue: "fieldLament",
    // 界河是开阔地上的第一场败退。这里要宽、慢、压着走，不能像胜利进行曲。
    mood: "steady", durS: 48, rms: -30, fadeS: 3.0, rawExt: "mp3",
    downloadUrl: "https://opengameart.org/sites/default/files/Lament%20of%20the%20War%20-%20MP3%20Preview_0.mp3",
    source: {
      title: "Laments of the War", author: "Cethiel", license: "CC0 1.0",
      page: "https://opengameart.org/content/laments-of-the-war",
    },
  },
  {
    id: "WallPressure",
    cue: "wallPressure",
    // 城墙关的炮兵优势。截最平稳的一段，再压到枪炮声下面，只留推进压力。
    mood: "steady", durS: 44, rms: -32, fadeS: 3.0, rawExt: "ogg",
    downloadUrl: "https://opengameart.org/sites/default/files/war%20theme%20ver%202_0.ogg",
    source: {
      title: "War Theme (version 2)", author: "Spring Spring", license: "CC0 1.0",
      page: "https://opengameart.org/content/war-theme",
    },
  },
  {
    id: "StreetDistress",
    cue: "streetDistress",
    // 十字街：不是冲锋，是四面火力封住之后持续收紧的焦灼。
    mood: "steady", durS: 46, rms: -30, fadeS: 3.0, rawExt: "wav",
    downloadUrl: "https://opengameart.org/sites/default/files/aflicao.wav",
    source: {
      title: "tension and distress", author: "allen yatsura", license: "CC0 1.0",
      page: "https://opengameart.org/content/tension-and-distress",
    },
  },
  {
    id: "Exodus",
    cue: "exodus",
    // 北门已经没有弹药，也没有胜利目标；音乐只留下废墟与离城感。
    // 自动稀疏评分会偏爱 91 秒处那段「一次大峰值 + 长静音」；42 秒处更连贯。
    mood: "sparse", durS: 52, rms: -27, fadeS: 3.5, rawExt: "mp3", atS: 42,
    downloadUrl: "https://opengameart.org/sites/default/files/Village%20Ruins%20-%20isaiah658_0.mp3",
    source: {
      title: "Village Ruins", author: "isaiah658", license: "CC0 1.0",
      page: "https://opengameart.org/content/village-ruins",
    },
  },
];
