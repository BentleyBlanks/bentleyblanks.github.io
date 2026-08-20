// 音乐来源表 —— 五段曲子的提示词、选段规则与配平。
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
  name: "MiniMax music-3.0（本机 MiniMax Hub 网关生成）",
  terms: "生成内容，随项目使用",
  via: "http://127.0.0.1:8001/api/generate/music",
};

export const MUSIC_SOURCES = [
  {
    id: "Menu",
    cue: "menu",
    // 进城之前。要的是「一间空屋子」，不是主题曲。
    mood: "sparse", durS: 46, rms: -26, fadeS: 2.5,
    prompt: "One low bowed string drone, held continuously and unchanging, with a single breathy bamboo flute entering rarely for one long note and then stopping. Almost nothing happens for a whole minute at a time. No plucked strings, no rhythm, no repeated notes, no drums, no percussion, no synthesizer, no vocals. Cold, empty, north China winter 1938.",
  },
  {
    id: "Siege",
    cue: "siege",
    // 白天守城时垫在枪炮底下的一层。**必须最平稳** —— 底下这一层一旦有起伏，
    // 玩家会以为是战况在变。
    mood: "steady", durS: 40, rms: -30, fadeS: 3.0,
    prompt: "Very slow and heavy. Dark sustained low strings, almost motionless, with a single large Chinese war drum struck once every several bars and left to decay. Oppressive, grim, no melody, no groove, no fast notes, no fills. Chinese traditional instruments only. No synthesizer, no brass, no vocals, no electric instruments.",
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
    // 反攻与白刃。这一条是五段里唯一**要有律动**的（实测节拍相关 0.26），
    // 所以按 steady 挑：要的是骨架最稳的那一段，不是最安静的。
    mood: "steady", durS: 38, rms: -24, fadeS: 2.0,
    prompt: "One large Chinese bass war drum, struck slowly and heavily, and nothing else. Deep, dry, spaced-out hits with long silence between them, gradually getting faster and closer together. No melody, no plucked strings, no guqin, no pipa, no cymbals, no gongs, no synthesizer, no vocals. 1938 Chinese army before a broadsword charge.",
  },
  {
    id: "Aftermath",
    cue: "aftermath",
    // 结局。全场唯一一处允许「像配乐」的地方 —— 仗已经打完了。
    mood: "sparse", durS: 50, rms: -25, fadeS: 3.5,
    prompt: "Solo erhu playing a slow funeral lament, alone, with one very quiet low string drone underneath. North China 1938. Free rhythm, long sustained notes, wide silences, unresolved ending. No drums, no percussion, no piano, no synthesizer, no orchestra, no vocals.",
  },
];
