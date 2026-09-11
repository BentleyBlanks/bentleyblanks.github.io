// EarSpa3D 音频素材表 —— 火山引擎 SeedAudio 1.0 的每一条提示词、时长目标与授权。
//
// 这个项目的「解压感」有 70% 在耳朵里，所以音频分三层，各自的取法不同：
//
//   1. **BGM 四条**（`BGM_SOURCES`）：舒缓、无词、低动态、长时间不烦。
//      它们的循环接缝**不靠素材本身**，而是运行时用 WebAudio 双缓冲交叉淡化接的
//      （见 Script_Audio.js 的 LoopVoice）—— AI 生成的音乐不可能首尾天然对齐，
//      与其反复重生成碰运气，不如在播放器里把接缝抹掉，这样换素材也不用重调。
//
//   2. **单次音效**（`SFX_SOURCES`）：一次性事件，采样直接播。
//      提示词写法沿用 Taierzhuang1938/Script_SeedAudioCombatBake.mjs 的规范：
//      先说清「独立单次音效 / 只有一次事件 / 开头立即发生 / 结尾自然衰减至安静」，
//      再排除重复、音乐、人声、底噪——这几句不放进去，模型就会给你一段循环或一段氛围。
//      采耳额外加两条硬要求：**近距离干录**、**没有混响尾巴**。
//      耳道里的声音是干而近的，任何房间混响都会立刻把「在耳朵里」变成「在房间里」。
//
//   3. **连续接触声**（`CONTACT_KINDS`）：**不入库、不采样**，运行时现场合成。
//      刮耳屎的声音必须随手指速度连续变化；采样循环起来一定像机关枪。
//      这里只记录运行时合成器的参数范围与设计意图，不产生 API 调用。
//
// 密钥只从 VOLCENGINE_API_KEY 环境变量读，绝不进任何文件。

// ── 生成与转码参数（Script_SeedAudioBake.mjs 读这一份）──

export const AUDIO_CONFIG = {
  model: "seed-audio-1.0",
  apiUrl: "https://openspeech.bytedance.com/api/v3/tts/create",
  // 本机没有 ffmpeg，也不装：API 侧的 mp3 直接落盘，时长用纯 JS 解析 MPEG 帧头算，
  // 裁剪/淡入淡出/循环接缝一律放到浏览器运行时用 WebAudio 做。
  format: "mp3",
  sampleRate: 48000,
  bitrate: "192k",           // 只写进 manifest 作元数据；API 侧码率由服务决定
  bitsPerSample: 16,
  channels: 1,               // 采耳音效全部单声道：运行时自己摆位，素材左右分开反而绑死
  pitchRate: 0,
  speechRate: 0,
  loudnessRate: 0,
  timeoutMs: 420_000,        // 生成一次几十秒到几分钟，超时给足
  bgmSeconds: [45, 75],      // BGM 时长目标区间（秒）：够长才听不出循环
  sfxSecondsCap: 4.0,        // 单次音效超过这个时长就有点不对劲了（QC 只警告不阻断）
};

// 授权：结构对齐 Taierzhuang1938/Data_SfxSources.mjs 的 SFX_LICENSES
export const AUDIO_LICENSES = {
  volcengine: {
    name: "Volcengine SeedAudio 1.0",
    terms: "由本项目账户经火山引擎 API 生成；使用受该服务条款约束",
    via: "https://openspeech.bytedance.com/api/v3/tts/create",
  },
  local: {
    name: "EarSpa3D procedural synthesis",
    terms: "本仓库原创确定性程序合成（Script_Audio.js 的 contact 合成器与无资产兜底），无第三方素材或外部许可限制",
    via: "local://EarSpa3D/Script_Audio.js",
  },
};

// ── 提示词公共前缀 ──
//
// 为什么这么长：SeedAudio 对「不要什么」的敏感度不低于「要什么」。少写一句
// 「不要背景底噪」，回来的一段就带房间噪声，而耳道音效一有底噪就废了。

const COMMON_SFX = "用于一款采耳 ASMR 解压游戏的独立单次音效，单声道。只有一次事件，开头立即发生，"
  + "结尾自然衰减至绝对安静。极近距离的拟音录音，干声，不带任何房间混响与回声尾巴。"
  + "不要重复、不要循环、不要音乐、不要人声或言语、不要背景底噪与环境声。";

const COMMON_BGM = "用于一款采耳 ASMR 解压游戏的背景音乐，纯器乐，无人声。"
  + "舒缓、温暖、安静、极低动态，长时间循环聆听不疲劳，不要鼓点、不要高潮、不要戏剧性转折。"
  + "配器轻薄通透，低频收敛不轰头，整体像雨夜店里的一盏暖灯。";

// ── BGM 四条 ──
// 与 Script_Scene.js 的 setMood 四档一一对应（rainNight / teaRoom / morning / sleepy）。

export const BGM_SOURCES = [
  {
    id: "rainNight",
    cue: "rainNight",
    file: "AudioBgm_RainNight.mp3",
    name: "雨夜",
    seconds: 64,
    loopSafe: true,
    prompt: `${COMMON_BGM}画面是雨夜里一间安静的采耳小店：窗外细雨，室内暖黄的纸灯，竹帘，远处隐约的雨声。`
      + "以温暖的钢琴单音与柔和的弦乐垫为主，稀疏、留白多，音量起伏极小，像背景里的呼吸。",
  },
  {
    id: "teaRoom",
    cue: "teaRoom",
    file: "AudioBgm_TeaRoom.mp3",
    name: "茶室",
    seconds: 62,
    loopSafe: true,
    prompt: `${COMMON_BGM}画面是午后的一间茶室：木头、棉麻、淡淡的茶香，阳光落在桌面上。`
      + "以木琴、拨弦与轻柔的钟琴为主，节奏缓慢松散，音色干燥温暖，偶尔一个清亮的泛音点缀。",
  },
  {
    id: "morning",
    cue: "morning",
    file: "AudioBgm_Morning.mp3",
    name: "清晨",
    seconds: 58,
    loopSafe: true,
    prompt: `${COMMON_BGM}画面是清亮通透的早晨：刚开的窗，微凉的风，光线是薄薄的白。`
      + "以清脆的钟琴、玻璃琴与轻快而不催促的钢琴为主，明亮干净，中高频通透，没有低频压力。",
  },
  {
    id: "sleepy",
    cue: "sleepy",
    file: "AudioBgm_Sleepy.mp3",
    name: "困倦",
    seconds: 72,
    loopSafe: true,
    prompt: `${COMMON_BGM}画面是将睡未睡的深夜：呼吸慢下来，一切都在融化。`
      + "以缓慢的长音垫、微弱的和声、若有若无的低频脉动为主，几乎没有旋律，接近纯音墙，音量极低极稳。",
  },
];

// ── 单次音效 ──
//
// `variants` 是同一件事的几种说法，每条生成一个独立 take：
// 刮一下、再刮一下，如果每次都放同一个文件，玩家三次就能听出是复读机。
//
// 本轮成本控制：每条 cue 只生成 1 个 take，合计 4 BGM + 16 cue = 20 次调用。
// 「不像复读机」这一轮靠运行时兜：playSfx 每次把 rate 在 ±4% 内抖动、增益 ±1.5 dB 抖动，
// 并按 cue 设最小重触发间隔（见 Script_Audio.js）。要补真实变体时，往任意一条的
// `variants` 里加句子即可——文件名会自动变成 `..._01.mp3` / `..._02.mp3`，
// 清单与运行时都跟着走，不用改别的地方。

export const SFX_SOURCES = [
  {
    id: "chunkLand", cue: "chunkLand", name: "完整琥珀块落入小瓷盘",
    seconds: 0.7, category: "reward", material: "dry", contactKind: "scrape",
    variants: ["一整块轻软的琥珀糖落入小瓷盘，温润轻巧的一声嗒。"],
    prompt: `${COMMON_SFX}一小块轻软的琥珀糖从很低的高度落入手心大小的小瓷盘，只有一次轻巧温润的嗒声，带一点柔软的触感，立即收住。声音近、细腻、舒服，短而有满足感。不要尖锐玻璃声、不要金属撞击、不要碎裂、不要连续散落颗粒声。总长度约零点七秒。`,
  },
  // ── 刮擦类 ──
  {
    id: "scrapeSoft",
    cue: "scrapeSoft",
    name: "竹勺轻刮干性耵聍",
    seconds: 0.9,
    category: "contact",
    material: "dry",
    contactKind: "scrape",
    variants: [
      "一根细竹签的尖端轻轻刮过耳道里一小片干燥松脆的耳垢，沙沙的细碎摩擦，力度很轻。",
    ],
    prompt: `${COMMON_SFX}一根细竹签的尖端轻轻刮过耳道里一小片干燥松脆的耳垢，沙沙的细碎摩擦，力度很轻，`
      + "颗粒感细密均匀，声音很近很小；不要尖锐刮擦、不要塑料声、不要敲击、不要沙锤、不要摩擦纸张、不要远处录音与混响。",
  },
  {
    id: "scrapeGritty",
    cue: "scrapeGritty",
    name: "砂质粗刮",
    seconds: 1.0,
    category: "contact",
    material: "dry",
    contactKind: "scrape",
    variants: [
      "工具的尖端用力刮过一片粗糙的砂质耳垢，声音更响更粗。",
    ],
    prompt: `${COMMON_SFX}工具的尖端用力刮过一片粗糙、砂质、带细颗粒的干燥耳垢，声音更响更粗，`
      + "像细砂纸轻轻蹭过干燥的表面，颗粒之间有细微的阻力起伏；不要尖锐金属刮擦、不要电钻、不要爆音、不要碰撞声与混响。",
  },
  {
    id: "scoopLift",
    cue: "scoopLift",
    name: "整块耵聍被挑起",
    seconds: 0.7,
    category: "reward",
    material: "dry",
    contactKind: "scrape",
    variants: [
      "一小块耳垢被完整挑起，末端轻轻脱离，发出极短的一记「啵」。",
    ],
    prompt: `${COMMON_SFX}一小块耳垢被工具的尖端完整挑起、与耳道壁轻轻分离，发出一记极短、不响亮、带一点点黏性的充气般「啵」声，`
      + "只有一次，约零点二秒，随即安静。不要爆破音、不要水滴声、不要拔塞子的巨响、不要人声、不要混响。",
  },
  {
    id: "stretchWax",
    cue: "stretchWax",
    name: "湿性耵聍拉丝",
    seconds: 1.1,
    category: "contact",
    material: "wet",
    contactKind: "scrape",
    variants: [
      "黏稠的耳垢被慢慢拉长成丝，黏滞的拉伸声逐渐升高。",
    ],
    prompt: `${COMMON_SFX}一小团黏稠的湿性耳垢被慢慢拉长成细丝，黏滞的拉伸声随着拉长逐渐升高、略带气泡感，最后断开。`
      + "近距离、湿而黏的质感，音量不大；不要撕裂布料、不要拉胶带、不要橡皮筋弹响、不要爆音与混响。",
  },
  {
    id: "snapWax",
    cue: "snapWax",
    name: "拉丝断开",
    seconds: 0.4,
    category: "reward",
    material: "wet",
    contactKind: "scrape",
    variants: [
      "细丝终于断开，一声非常短、非常小的黏性脆响。",
    ],
    prompt: `${COMMON_SFX}一根黏稠的细丝绷到极限后突然断开，一记非常短、非常小、略带黏性的轻脆响声，`
      + "只有一个事件，约零点一五秒后彻底安静。不要鞭子声、不要木头折断、不要爆裂音、不要音乐与人声。",
  },
  {
    id: "crumbFall",
    cue: "crumbFall",
    name: "碎屑掉落",
    seconds: 1.2,
    category: "contact",
    material: "dry",
    contactKind: "scrape",
    variants: [
      "几粒小碎屑落在耳道口附近，细碎的沙沙声由密到疏。",
    ],
    prompt: `${COMMON_SFX}几粒干燥的耳垢碎屑先后落在很近的表面上，细碎的沙沙声由密到疏、由响到轻，`
      + "颗粒小而轻，最后只剩零星两三粒。不要雨声、不要沙锤、不要流水、不要大面积砂砾倾倒、不要混响。",
  },

  // ── 瘙痒 / 扫拂类 ──
  {
    id: "tickleFeather",
    cue: "tickleFeather",
    name: "鹅毛扫过",
    seconds: 1.4,
    category: "tickle",
    material: "feather",
    contactKind: "tickle",
    variants: [
      "一根柔软的鹅毛在耳道里极轻地扫过，几乎只剩空气的细响。",
    ],
    prompt: `${COMMON_SFX}一根柔软的鹅毛尖端在耳道里极轻微地扫过皮肤，声音几乎只剩下空气般的细响与绒毛拂过的绵密摩擦，`
      + "非常安静、非常轻，有一点痒。不要风声呼啸、不要刷子刷衣服、不要鸟叫、不要人声、不要混响。",
  },
  {
    id: "tickleHair",
    cue: "tickleHair",
    name: "马尾极细的痒",
    seconds: 1.2,
    category: "tickle",
    material: "horsehair",
    contactKind: "tickle",
    variants: [
      "一束极细的马尾毛伸进耳道轻轻转动，尖细、发麻的高频细响。",
    ],
    prompt: `${COMMON_SFX}一束极细的马尾毛在耳道里极轻地转动划过皮肤，尖细、发麻、略带金属丝感的高频细响，`
      + "音量很小。不要电流声、不要蚊子嗡鸣、不要笛声、不要尖锐啸叫、不要人声与混响。",
  },
  {
    id: "vibrateHum",
    cue: "vibrateHum",
    name: "音叉嗡鸣",
    seconds: 3.4,
    category: "stimulate",
    material: "steel",
    contactKind: "vibrate",
    variants: [
      "音叉被轻轻敲响后贴近耳廓，纯正的嗡鸣逐渐衰减。",
    ],
    prompt: `${COMMON_SFX}一支音叉被轻轻敲响后立即贴近耳廓，发出稳定、纯净、几乎没有谐波的嗡鸣，`
      + "音高大致在标准音 A4 的四百四十赫兹附近，起振短促柔和，随后在两三秒里均匀地自然衰减至安静。"
      + "不要颤动走音、不要铃铛、不要电子蜂鸣、不要合唱歌声、不要长混响。",
  },

  // ── 液体类 ──
  {
    id: "waterPour",
    cue: "waterPour",
    name: "冲洗水流",
    seconds: 3.0,
    category: "care",
    material: "water",
    contactKind: "water",
    variants: [
      "一股温热的细水流缓慢流进耳道，随后逐渐变小停住。",
    ],
    prompt: `${COMMON_SFX}一股温热、很细的水流缓慢地流进耳道，持续约两秒后在末尾逐渐变细并停止，`
      + "水声柔和、带少量细碎气泡、低频收敛；不要瀑布、不要水龙头大开、不要泼水、不要浴缸、不要浴室混响。",
  },
  {
    id: "dropLiquid",
    cue: "dropLiquid",
    name: "滴耳液一滴",
    seconds: 0.6,
    category: "care",
    material: "water",
    contactKind: "water",
    variants: [
      "一滴药液落进耳道，短促圆润的一记滴水声。",
    ],
    prompt: `${COMMON_SFX}一滴药液从很近的高度落进耳道里，一记短促、圆润、略显低沉的滴水声，`
      + "只响一次，约零点二秒。不要水管滴水回声、不要水池混响、不要连续多滴、不要人声。",
  },

  // ── 机械 / 器具类 ──
  {
    id: "vacuumSuck",
    cue: "vacuumSuck",
    name: "吸引器吸气",
    seconds: 2.4,
    category: "care",
    material: "steel",
    contactKind: "water",
    variants: [
      "细吸引管靠近耵聍，慢慢吸气，末尾轻轻收住。",
    ],
    prompt: `${COMMON_SFX}一根细吸引管在耳道里慢慢吸气，气流声平稳持续约两秒，末尾忽然收住，`
      + "声音干净、带轻微的管腔共鸣与细小颗粒被吸走的沙沙细节；不要吸尘器轰鸣、不要马达、不要风箱、不要人声与混响。",
  },
  {
    id: "metalTick",
    cue: "metalTick",
    name: "不锈钢工具轻碰",
    seconds: 0.5,
    category: "contact",
    material: "steel",
    contactKind: "wipe",
    variants: [
      "两根不锈钢细杆轻轻碰了一下，一声干净清脆的短响。",
    ],
    prompt: `${COMMON_SFX}两根不锈钢细杆轻轻碰了一下，一记极短、干净、明亮的不锈钢「叮」声，`
      + "约零点一五秒，几乎没有余韵。不要锤子敲击、不要金属撞击巨响、不要铃铛、不要长混响、不要音乐。",
  },
  {
    id: "blink",
    cue: "blink",
    name: "工具入耳的空气声",
    seconds: 0.6,
    category: "calm",
    material: "air",
    contactKind: "wipe",
    variants: [
      "工具缓缓探入耳道，挤开空气的一声极轻的响动。",
    ],
    prompt: `${COMMON_SFX}一根细细的工具缓缓探入耳道，空气被轻轻挤开，一声极轻、很短、由远及近的低频气声，`
      + "音量很小。不要呼吸声、不要喷气、不要风声、不要吹气、不要人声与混响。",
  },
  {
    id: "relaxSigh",
    cue: "relaxSigh",
    name: "客人舒服的叹气",
    seconds: 1.8,
    category: "calm",
    material: "voice",
    contactKind: null,
    variants: [
      "客人舒服极了的、软软的一声叹气，气息为主，音量很小。",
    ],
    // 这一条第一次以「像 XX 的一声」的拟声写法提交时被服务端以 HTTP 400 拒了，
    // 改成纯描述「只是呼出的一口气、不含任何语言内容」之后就过了。记在这里：
    // 带引号的口语拟声容易被判成人声台词。
    prompt: `${COMMON_SFX}一声很轻、很软、以气流为主的满足的呼气声，听上去是一个人被伺候得很放松、`
      + "把胸腔里那口气慢慢吐出来的声音，音量很小，持续约一秒半后自然收住；"
      + "全程只是呼出的一口气，不含任何语言内容，也听不出任何词句。不要说话、不要唱歌、不要笑出声、不要夸张的呻吟。",
  },
  {
    id: "shiver",
    cue: "shiver",
    name: "一阵酥麻的轻颤",
    seconds: 1.6,
    category: "tickle",
    material: "air",
    contactKind: "vibrate",
    variants: [
      "一阵酥麻从耳朵一路传到后颈，极轻的颤动音色缓慢消散。",
    ],
    prompt: `${COMMON_SFX}一阵酥麻从耳朵向后颈扩散的那一瞬间，用一种极轻、柔和、发麻的颤动音色表现：`
      + "很短的起振，随后在约一秒半里像涟漪一样消散。不要恐怖颤音、不要弦乐惊悚、不要电流噪声、不要人声。",
  },
  {
    id: "sparkle",
    cue: "sparkle",
    name: "掏干净的奖励音",
    seconds: 2.0,
    category: "reward",
    material: "glass",
    contactKind: null,
    variants: [
      "耳道被掏得干干净净，一串清新、干净、向上的小小铃音。",
    ],
    prompt: `${COMMON_SFX}耳道被掏得干干净净的一瞬间，一串清新、干净、明亮、略微向上的小小铃声，`
      + "两三个音，音色通透不刺耳，尾巴很短，两秒内自然消失。不要欢庆大合唱、不要管弦乐、不要电子游戏音效的俗套琶音、不要人声。",
  },

  // ── UI 类 ──
  {
    id: "uiTap",
    cue: "uiTap",
    name: "UI 轻点",
    seconds: 0.3,
    category: "ui",
    material: "wood",
    contactKind: null,
    variants: [
      "一声圆润温和的界面点按提示音，很短很轻。",
    ],
    prompt: `${COMMON_SFX}一声圆润、温和、短促的界面点按提示音，像轻轻敲了一下干燥的木块，`
      + "音量很小、没有余韵，零点一五秒内结束。不要机械键盘、不要鼠标点击、不要电子哔声、不要清脆铃声。",
  },
  {
    id: "uiConfirm",
    cue: "uiConfirm",
    name: "成就达成",
    seconds: 1.4,
    category: "ui",
    material: "glass",
    contactKind: null,
    variants: [
      "一个小成就达成，温暖柔和的两三个音向上收尾。",
    ],
    prompt: `${COMMON_SFX}一个小成就达成时的提示音，两三个温暖柔和的音由低向高轻轻扬起、随即收住，`
      + "音色像木质琴与玻璃铃的混合，通透不刺耳，音量适中，约一秒。不要宏大交响、不要电子游戏升级音效的俗套琶音、不要人声欢呼。",
  },
];

// ── 连续接触声：运行时现场合成，不占 API 调用 ──
//
// 这一段是给 lead 和 UI 看的「契约说明」：Script_Audio.contact.begin(kind) 认这些 kind，
// 每种材质对应一条独立的合成链。参数化的理由写在设计里，不在这里重复。

export const CONTACT_KINDS = [
  { kind: "scrape", material: "dry",   label: "干性刮擦", chain: "棕噪声→带通（中心频率随速度上移）→波形整形过载（砂感）→增益（随压力）；叠加随机短促颗粒脉冲，脉冲密度随速度上升" },
  { kind: "gritty", material: "dry",   label: "砂质粗刮", chain: "同 scrape，但带通 Q 更低、过载更深、颗粒脉冲更密更响，roughness01 抬高时额外加一层 2–4 kHz 的粗砂噪声" },
  { kind: "sweep",  material: "feather", label: "鹅毛扫拂", chain: "白噪声→6 kHz 高通→极低 Q 带通→8–12 Hz 缓慢振幅起伏；低频几乎清零（highshelf 反相压低）" },
  { kind: "tickle", material: "horsehair", label: "马尾细痒", chain: "白噪声→9 kHz 高通→一个 6–7 kHz 窄带 peaking（金属丝感）→极轻颤音；只在 rough 高时出现" },
  { kind: "vibrate", material: "steel", label: "音叉嗡鸣", chain: "正弦 440 Hz + 三角波 880 Hz 双音→5.5 Hz 颤音→长衰减包络；另叠一条 442 Hz 造成 2 Hz 拍频（「活」的感觉）" },
  { kind: "wipe",  material: "cotton", label: "棉签擦拭", chain: "粉噪声→带通 900–1800 Hz（随速度上移）→轻度过载→中频摩擦噪声；无颗粒脉冲" },
  { kind: "water", material: "water",  label: "冲洗水流", chain: "棕噪声→带通 400–2500 Hz 随速度上移→叠加随机气泡脉冲（正弦短促、频率随机 300–1200 Hz、带滑音）" },
];

// 运行时把 cue → 素材文件 / 变体数 的映射摊平到一处，供 Script_Audio 与清单共用。
export const SFX_TAKES = SFX_SOURCES.map((source) => ({
  cue: source.cue,
  files: Array.from({ length: source.variants.length }, (_, index) =>
    source.variants.length === 1
      ? `AudioSfx_${source.cue[0].toUpperCase()}${source.cue.slice(1)}.mp3`
      : `AudioSfx_${source.cue[0].toUpperCase()}${source.cue.slice(1)}_${String(index + 1).padStart(2, "0")}.mp3`),
  seconds: source.seconds,
}));

export const BGM_TAKES = BGM_SOURCES.map((source) => ({
  cue: source.cue,
  files: [source.file],
  seconds: source.seconds,
}));

export default { AUDIO_CONFIG, AUDIO_LICENSES, BGM_SOURCES, SFX_SOURCES, CONTACT_KINDS };
