// 音效素材来源表 —— 每一条音效「是谁在哪一年录的、切自素材的哪一段」。
//
// ## 为什么换成实录素材
// 到 2026-08-19 为止这 32 个音全是 WebAudio 现场合成的（Script_Audio 的 RECIPES）。
// 合成那套的长处是零加载、零 404、完全确定性，但它有一条过不去的坎：
// **枪声的瞬态是炸开的空气，不是包络**。噪声过带通再削顶，出来永远是「啪」，
// 不是「炸」；二十条枪听着像二十个合成器，不像二十支枪。
// 所以现在改成：**实录采样盖在合成之上**，合成那套一行没删，采样载不到就退回去。
//
// ## 素材从哪来（两家，都允许免费使用）
//   1. **Sonniss GDC Game Audio Bundle**（2015—2026 年历届，archive.org 镜像）
//      —— 每年 GDC 由各音效厂商捐出的免版税包，许可是「可用于商业与非商业项目，
//      免版税」。本表仍然逐条记下厂商名，因为**这是选材的依据**：
//      Pole Position 录的是真枪实弹（K98k 就是 7.92×57 毛瑟，与中正式同弹同枪机），
//      换成别家的「设计音」就不是这个味道了。
//   2. **Wikimedia Commons** 的军号（美军军乐队，PD）与哨子（CC0）。
//      军号只取**单个音**，冲锋号的调子仍由引擎按中方动机排（见 Script_Audio 的
//      bugleCharge）—— 直接用美军的 Charge 号谱是另一支军队的号。
//
// ## 选材的三条硬标准（不是随便搜个 gunshot 就完）
//   1. **口径与枪机对得上**。中正式＝毛瑟 7.92×57 → K98k；三八式 6.5×50 声音更尖 →
//      拿 .30-06 的 M1903A3 升调顶上；九二式重机 7.7mm 慢速 → M1919A4（同为
//      弹链供弹的中型机枪）；捷克式 → BAR（同为弹匣供弹的自动步枪/轻机）。
//   2. **单发，不是连发**。连发素材只切**最后一发**（尾巴干净，前面几发的尾巴
//      不会糊进来），射速由引擎按史实排（捷克式 500 rpm、九二式 200 rpm）——
//      直接用一段连发录音的话，射速就被素材钉死了，「啄木鸟」的身份证就没了。
//   3. **远近是两条真的录音**，不是近射加个低通。50 m 外那一枪的尾巴是环境给的，
//      滤波器造不出来。
//
// 切割字段：whole 整段用（素材本身就是一次性音）；prefer 挑法（loud/sustain）；
//   pick:"last" 取末发；variants 切几个变体；append 把变体接到已有 cue 后面；
//   rate 重采样倍率（>1 升调变短，模拟小口径）；hp/lp 高低通；notch 陷波（挖掉素材自带的啸叫）；
//   decay 衰减时长硬筛（挡掉 0.05 秒的咔哒声冒充落地声）；tone 顺便量基频；
//   exactAtS 按波形秒数直接落刀（自动挑法挑不准时，看过 --report 再钉死一个位置）。
//   2026-08-28 新增：fadeInS/fadeOutS 覆盖默认淡入淡出；alignDbfs 烘完量成品把有声段
//   RMS 对齐到该值（口径同 Script_AudioNormalize 的「一次性音」组）；loop 只写进清单当
//   元数据；组上的 pending 表示「Script_Audio 还没有同名配方」，产物落 manifest.pendingCues。
export const SFX_LICENSES = {
  sonniss: {
    name: "Sonniss GDC Game Audio Bundle",
    terms: "免版税，可用于商业与非商业项目（本表仍逐条记录厂商）",
    via: "https://archive.org/details/sonniss.com-gdc-game-audio-bundles",
  },
  commons: {
    name: "Wikimedia Commons",
    terms: "军号为美国政府作品（Public Domain）；哨子为 CC0",
    via: "https://commons.wikimedia.org/",
  },
  generated: {
    name: "Taierzhuang1938 procedural synthesis",
    terms: "本仓库原创确定性程序合成，无第三方素材或外部许可限制",
    via: "local://Taierzhuang1938/Script_SfxBake.mjs",
  },
  volcengine: {
    name: "Volcengine SeedAudio 1.0",
    terms: "由本项目账户经火山引擎 API 生成；使用受该服务条款约束",
    via: "https://openspeech.bytedance.com/api/v3/tts/create",
  },
  // 【与本表其余四家不同：这一类不是免版税的】
  // 2026-09-08 按「枪声只用三八大盖与汉阳造真枪实录」的要求引入。上面三条选材硬标准
  // 第 1 条（口径与枪机对得上）在这两条上是**直接成立**的 —— 不再是 K98k 顶中正式、
  // M1903A3 升调顶三八式的折算，录的就是这两支枪本身。代价是许可：
  // 版权归原视频上传者，本项目没有授权。所以：
  //   · 素材只落 `Audio/Sfx/_raw/`（已 gitignore），不进仓库；
  //   · 成品 mp3 会进仓库并随构建发布 —— **这是发布前必须解决的一笔债**，
  //     要么取得上传者授权，要么换回免版税素材（配方切点可直接平移复用）。
  // 记在这里而不是含糊标成 sonniss，是为了让这笔债在代码里查得到。
  refvideo: {
    name: "参考视频实录（B 站）",
    terms: "**非免版税**：版权归原视频上传者，本项目未获授权。仅供原型阶段手感对齐；"
      + "对外发布前必须替换或取得授权。",
    via: "BV1cG411m7Vz（三八大盖有盖版实弹射击）· BV1GMojB3EFP（汉阳造 88 式步枪）",
  },
};

/**
 * 枪声 / 爆炸 / 弹道三类成品的码率（2026-09-08 起）。其余仍走 `Script_SfxBake` 的默认 72k。
 * 为什么只抬这三类：它们的辨识度全在**瞬态与低频**上，而 72 kbps 恰好在这两处最弱
 * （逐条理由写在 `Script_SfxBake.mjs` 头注）。组或 cut 上写 `bitrate` 生效。
 */
export const BITRATE_TRANSIENT = "112k";

const ARCHIVE = "https://archive.org/download/";

/** 把 (item, path) 拼成 archive.org 的直链。 */
export function ArchiveUrl(item, filePath) {
  return ARCHIVE + item + "/" + filePath.split("/").map(encodeURIComponent).join("/");
}

/**
 * 素材组。一段素材可以切出好几个音（同一次下载）。
 * cuts[].cue 必须与 Script_Audio 的 RECIPES 同名 —— 同名才盖得上去。
 */
export const SFX_SOURCES = [
  // 2026-09-09：用户要求重新 SeedAudio 生成全部近中远爆炸及贴耳弹道音。
  // 2026-09-10：爆炸改为用户认可的 Punch / Heavy 两条及中远距离派生版。
  // 全量 SfxBake 只登记这些成品，禁止旧素材配方重新覆盖。
  {
    id: "ExplosionNearSeedAudio",
    seedAudio: true,
    bake: "Script_SeedAudioExplosionBake.mjs",
    credit: "Volcengine SeedAudio 1.0 · approved Punch / Heavy · Near · 2026-09-10",
    license: "volcengine",
    bitrate: "192k",
    cuts: [{ cue: "explosionNear", files: ["AudioSfx_ExplosionNear_01.mp3","AudioSfx_ExplosionNear_02.mp3"], durS: 2.444 }],
  },
  {
    id: "ExplosionMidSeedAudio",
    seedAudio: true,
    bake: "Script_SeedAudioExplosionBake.mjs",
    credit: "Volcengine SeedAudio 1.0 · approved Punch / Heavy · Mid · 2026-09-10",
    license: "volcengine",
    bitrate: "192k",
    cuts: [{ cue: "explosionMid", files: ["AudioSfx_ExplosionMid_01.mp3","AudioSfx_ExplosionMid_02.mp3"], durS: 2.444 }],
  },
  {
    id: "ExplosionFarSeedAudio",
    seedAudio: true,
    bake: "Script_SeedAudioExplosionBake.mjs",
    credit: "Volcengine SeedAudio 1.0 · approved Punch / Heavy · Far · 2026-09-10",
    license: "volcengine",
    bitrate: "192k",
    cuts: [{ cue: "explosionFar", files: ["AudioSfx_ExplosionFar_01.mp3","AudioSfx_ExplosionFar_02.mp3"], durS: 2.444 }],
  },
  {
    id: "BulletCrackSeedAudio",
    seedAudio: true,
    bake: "Script_SeedAudioCombatBake.mjs",
    credit: "Volcengine SeedAudio 1.0 · bulletCrack · 2026-09-09",
    license: "volcengine",
    bitrate: BITRATE_TRANSIENT,
    cuts: [{ cue: "bulletCrack", files: ["AudioSfx_BulletCrack_01.mp3","AudioSfx_BulletCrack_02.mp3","AudioSfx_BulletCrack_03.mp3","AudioSfx_BulletCrack_04.mp3"], durS: 0.32 }],
  },
  {
    id: "BulletWhizzSeedAudio",
    seedAudio: true,
    bake: "Script_SeedAudioCombatBake.mjs",
    credit: "Volcengine SeedAudio 1.0 · bulletWhizz · 2026-09-09",
    license: "volcengine",
    bitrate: BITRATE_TRANSIENT,
    cuts: [{ cue: "bulletWhizz", files: ["AudioSfx_BulletWhizz_01.mp3","AudioSfx_BulletWhizz_02.mp3","AudioSfx_BulletWhizz_03.mp3","AudioSfx_BulletWhizz_04.mp3"], durS: 0.65 }],
  },
  // 序章专用音：按 cue 独立生成，确保缺少外部素材时仍能稳定回退。
  {
    id: "PrologueTrainGenerated",
    generated: "prologueTrain",
    credit: "Taierzhuang1938 procedural synthesis · 序章车厢专用音",
    license: "generated",
    cuts: [
      { cue: "trainBrake", durS: 1.8 },
      { cue: "carriageRattle", durS: 0.8 },
      { cue: "stretcherWood", durS: 0.9 },
      { cue: "coughLow", durS: 0.8 },
      { cue: "gearRustle", durS: 0.7 },
      { cue: "carriageDoorSlide", durS: 1.5 },
      { cue: "stepBallast", durS: 0.65 },
    ],
  },
  // 非语音 SeedAudio take 不许混进本地合成器；由 Script_SeedAudioTrainBake.mjs 单独生成。
  // SfxBake 重烘其它素材时仍登记这一条，避免把已经验收的汽笛从 manifest 漏掉。
  {
    id: "PrologueTrainSeedAudio",
    seedAudio: true,
    bake: "Script_SeedAudioTrainBake.mjs",
    credit: "Volcengine SeedAudio 1.0 · 序章蒸汽机车入站汽笛",
    license: "volcengine",
    cuts: [{ cue: "trainWhistle", file: "AudioSfx_TrainWhistle_01.mp3", durS: 4.055 }],
  },
  // === 步枪 ===============================================================
  {
    id: "MauserMedium",
    item: "game-audio-monthly",
    path: "Sonniss.com - Game Audio Monthly - #3/WatsonWu - Rifles & Pistols Of The World Wars/Rifle_Mauser_8mm_Medium_10.mp3",
    credit: "Watson Wu · 毛瑟 8 mm 中距离实录 · Sonniss Game Audio Monthly #3",
    license: "sonniss",
    // 用户在 G01 试听中选定。中正式与毛瑟同属 7.92 mm 体系，保留这一枪完整的中距离尾音。
    cuts: [{ cue: "rifleNra", tail: 1.3, gain: 0.94, whole: true }],
  },
  {
    id: "NagantFarMixed",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "FLYSOUND - Mosin Nagant/NAGANT mixed long distance shot.mp3",
    credit: "FLYSOUND · 莫辛纳甘长距离混录 · Sonniss GDC 2020",
    license: "sonniss",
    // 用户在 G04 试听中选定；远场尾音来自真实环境，不用近射低通伪造。
    cuts: [{ cue: "rifleNraFar", tail: 1.8, gain: 0.8, whole: true }],
  },
  {
    id: "GarandClose",
    item: "game-audio-monthly",
    path: "Sonniss.com - Game Audio Monthly - #3/WatsonWu - Rifles & Pistols Of The World Wars/Rifle_M1Garand_30-06_Close_01.mp3",
    credit: "Watson Wu · M1 Garand .30-06 近射 · Sonniss Game Audio Monthly #3",
    license: "sonniss",
    // 三八式是 6.5×50：小口径长弹，膛压高药量小，中方老兵记它「又尖又脆」。
    // 升调 10% 把 .30-06 的频心抬上去，同时整声变短 —— 与中方那一支必须听得出区别。
    // 用户在 G05 试听中选定；升调 10% 只承担三八式 6.5 mm 的音色适配。
    cuts: [{ cue: "rifleIja", tail: 1.15, gain: 0.92, rate: 1.10, whole: true }],
  },
  {
    id: "BarFar300",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - M1918 Browning Automatic Rifle .30cal/M1918_Browning_Automatic_Rifle_.30cal_300m_in_front_Double_shots_x_1.mp3",
    credit: "Pole Position Production · BAR .30cal 300 m 正面 · Sonniss GDC 2016",
    license: "sonniss",
    // 用户在 G07 试听中选定；只取双发录音的末发，避免上一发的尾巴烘进循环。
    cuts: [{ cue: "rifleIjaFar", tail: 1.5, gain: 0.78, rate: 1.08, exactAtS: 0.58 }],
  },

  // === 自动火器（只切单发，射速交给引擎按史实排）==========================
  {
    id: "GPMG",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - L7A2 GPMG 7.62x51mm/L7A2_GPMG_7.62x51mm_belt_fed_1m_in_front_RE20_clean_Single_shots_tracer_x_2.mp3",
    credit: "Pole Position Production · L7A2 GPMG 7.62×51 单发 · Sonniss GDC 2016",
    license: "sonniss",
    // 捷克式 ZB-26 是弹匣供弹的全威力弹轻机，与 7.62 通用机枪同一类声音。
    // **这条素材本身就是单发**（"Single_shots"），不用从连发里抠 ——
    // 先前拿 BAR 的双发录音抠末发，抠出来的其实是第一发的尾巴压着第二发，
    // 实拍 zcr 只有 152（全是低频轰声），听着像闷炮不像机枪。
    cuts: [{ cue: "zb26", tail: 0.9, gain: 0.9, minGap: 0.1, decay: [0.08, 1.2] }],
  },
  {
    id: "BarClose",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - M1918 Browning Automatic Rifle .30cal/M1918_Browning_Automatic_Rifle_.30cal_0.1m_to_right_Double_shots_x_1.mp3",
    credit: "Pole Position Production · BAR .30cal 近场 · Sonniss GDC 2016",
    license: "sonniss",
    // 用户在 G09 试听中选定。只切末发、升调 12%；500 rpm 仍由引擎按史实排。
    cuts: [{ cue: "type11", tail: 0.78, gain: 0.86, rate: 1.12, exactAtS: 0.67 }],
  },
  {
    id: "M1919A4Far200",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - M1919A4 Browning Machine Gun .30cal/M1919A4_Browning_Machine_Gun_.30cal_200m_left_behind_blanks_Triple_shots_x_1.mp3",
    credit: "Pole Position Production · M1919A4 .30cal 200 m 侧后 · Sonniss GDC 2016",
    license: "sonniss",
    // 用户在 G11 试听中选定。只切三连发末发，200 rpm 的「啄木鸟」间隔仍由引擎排。
    cuts: [{ cue: "type92", tail: 1.2, gain: 0.92, rate: 1.03, exactAtS: 0.25 }],
  },

  // === 操作音 =============================================================
  {
    id: "BoltCycle",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "Pole Position - Springfield 1903A3 bolt-action rifle/M1903A3, Handling, Cycling Bolt, MKH416.mp3",
    credit: "Pole Position Production · M1903A3 拉栓 · Sonniss GDC 2020",
    license: "sonniss",
    // 抬-拉-推-闭是一个连续动作，不能按起音点切碎 —— whole 保留整段。
    cuts: [{ cue: "bolt", tail: 1.25, gain: 0.95, whole: true, hp: 180 }],
  },
  {
    id: "K98kHandling",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "Pole Position - Mauser Karabiner 98 kurz K98k bolt-action rifle/K98k, Handling, Various, t2, 1m, Right, MKH8060.mp3",
    credit: "Pole Position Production · K98k 操作音 · Sonniss GDC 2020",
    license: "sonniss",
    // 桥夹压弹：五发一夹从上方压进固定弹仓。素材里是一串操作，挑衰减最长的那一段。
    cuts: [{ cue: "stripperLoad", tail: 1.1, gain: 0.92, atS: 2.00 }],
  },
  {
    id: "MagInsert",
    item: "sonniss-gdc-2024-game-audio-bundle-normalized",
    path: "Dramatic Cat - SVD Dragunov/GUNMech_SVD Dragunov 7.62×54R SOURCE Magazine Insert Slow_DRCA_DRAG_CO-100K.mp3",
    credit: "Dramatic Cat · 步枪弹匣入位 · Sonniss GDC 2024",
    license: "sonniss",
    cuts: [{ cue: "magIn", tail: 0.65, gain: 0.9, atS: 7.32 }],
  },
  {
    id: "ShellDrop",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "SculpTunes – Cartridges & Casings Shell/9 mm x 21  - Casings Shell & Cartdridges - Roll on Concrete Floor - Outdoor.mp3",
    credit: "SculpTunes · 弹壳落在水泥地上（户外）· Sonniss GDC 2020",
    license: "sonniss",
    // 抛壳落地。**这条 cue 以前不存在**，而游戏里每开一枪都在播 `shellImpact` ——
    // 那是「野外迫击炮爆炸实录」，2.8 秒。一发一记迫击炮，正是「打起来就一片
    // 不知道哪来的拖尾」里最响的一条。
    //
    // 选材：要的是**户外硬地**（滕县的街是砖石与夯土，不是室内地砖），
    // 所以宁可拿 9 mm 手枪壳的户外录音降调，也不用 7.62 步枪壳的「室内地砖」那条 ——
    // 后者的房间残响是烘死在素材里的，我们自己还要过一层卷积混响，叠起来就是两个房间。
    // rate 0.86：降调 14% 把壳「压重」—— 7.92×57 的黄铜壳比 9 mm 重三倍多。
    // 不加 decay 硬筛：弹壳落地本来就是一串「当…啷啷」的短冲头（实测候选 16 处
    // 衰减全在 0.01—0.04 s），筛了等于全筛掉；那串滚动尾巴由 tail 0.85 s 带出来。
    // notch 9056 Hz：这一库的录音里烘着一记电子啸叫（实测 9056 Hz，素材里 −72 dB，
    // 但归一化会把它抬到 −55 上下）。每开一枪响一次的稳态纯音，耳朵一定会拎出来。
    cuts: [{ cue: "shellDrop", tail: 0.85, gain: 0.85, variants: 3, rate: 0.86, notch: 9056 }],
  },

  // === 爆炸 ===============================================================
  {
    id: "MatchStrike",
    item: "game-audio-monthly",
    path: "Sonniss.com - Game Audio Monthly - #4/TS Sound - Fire, Sizzles, and Ignites...Oh my!/SAFETY_MATCHES_STRIKE_03.mp3",
    credit: "TS Sound · 火柴摩擦点燃 · Sonniss Game Audio Monthly #4",
    license: "sonniss",
    // 木柄手榴弹的引信是**摩擦发火**：拧开底盖、扯拉火绳，那一下就是划火柴。
    // 拿金属咔哒声当「拉弦」是美式卵形弹的保险销，弹型都不对。
    cuts: [{ cue: "grenadePin", tail: 0.6, gain: 0.9, decay: [0.05, 0.7] }],
  },
  {
    id: "SwingLow",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "David Dumais Audio - Weapon Sounds - Weapon Swings/MeleeSwingsPack_96khz_Stereo_LowSwings31.mp3",
    credit: "David Dumais Audio · 重挥破风 · Sonniss GDC 2020",
    license: "sonniss",
    cuts: [{ cue: "grenadeThrow", tail: 0.55, gain: 0.85, whole: true }],
  },
  {
    id: "ShellTrajectory",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "Bluezone - Tank - Explosion Sound Effects/Bluezone_BC0271_shell_trajectory_004.mp3",
    credit: "Bluezone Corporation · 炮弹飞行啸声 · Sonniss GDC 2020",
    license: "sonniss",
    // 玩家唯一的躲避窗口：听到它到炸有 1.5 秒。所以这一条要**留够长**，
    // 切短了等于把躲避窗口砍掉。fromEnd：啸声是越来越近，要的是最后那一段。
    cuts: [{ cue: "shellIncoming", tail: 2.0, gain: 0.85, whole: true, fromEnd: true }],
  },
  {
    id: "HowitzerImpactRubble",
    item: "game-audio-monthly",
    path: "Sonniss.com - Game Audio Monthy - #1/Bluezone - Artillery Designed Howitzer and Explosion Sound Effects/Bluezone-BC0200-howitzer-falling-rubble-explosion-impact-016.mp3",
    credit: "Bluezone Corporation · 榜弹炮弹着与碎砖 · Sonniss Game Audio Monthly #1",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 【2026-09-09 换掉了 Coll Anderson 那条】旧素材起音要 2.4 s、>2 kHz 占 21 %、
    // 谱心 2503 Hz —— 那是一记「哗」，不是炮弹落地。这条是弹着 + 天上掉下来的砖屑，
    // 名字与声音总算对得上了。
    // **这条 cue 目前没有任何玩法代码在播**（落点那一声走 `explosionNear/Mid/Far`），
    // 它只活在编辑器的音频表里；配方、DUCK_ON、DEAFEN_ON 都还留着，接线时直接用。
    cuts: [{ cue: "shellImpact", tail: 2.8, gain: 0.95, whole: true, hp: 38, alignDbfs: -25 }],
  },
  {
    id: "LauncherPop",
    item: "sonniss-gdc-2023-game-audio-bundle-normalized",
    path: "BluezoneCorp - Detonation - Explosion/Bluezone_BC0277_weapon_smoke_grenade_launcher_003.mp3",
    credit: "Bluezone Corporation · 榴弹发射 · Sonniss GDC 2023",
    license: "sonniss",
    // 掷弹筒（膝盖迫击炮）：「咚」的一记闷响，接着 3.2 秒飞行 —— 只要发射那一下。
    cuts: [{ cue: "launcherPop", tail: 0.9, gain: 0.9, atS: 0.01 }],
  },

  // === 白刃 ===============================================================
  // 三条全部换成火山引擎 SeedAudio 的 take（2026-08-26 人工试听选定），原来的
  // Sonniss 顶包（David Dumais 的大型冷兵器挥空 / Justsoundeffects 的双手斧入肉 /
  // PMSFX 的利刃刺入）已下架 —— 顶包的问题不在录得好不好，在**兵器不对**：
  // 斧子入肉比大刀钝、西式利刃刺入比三八式刺刀细，白刃是这场仗的招牌动作，
  // 借来的音站不住。挥空那条尤其顶不住，试听两轮都被打回来。
  //
  // 成品由 Script_SeedAudioMeleeBake.mjs 单独烘（take 是人工选的，不能靠重掷复现，
  // 所以缺 take 时它宁可报错也不覆盖成品）。这里仍然登记，避免全量 SfxBake 把
  // 这三个 cue 从 manifest 漏掉 —— 与序章汽笛同一个理由。
  {
    id: "MeleeSeedAudio",
    seedAudio: true,
    bake: "Script_SeedAudioMeleeBake.mjs",
    credit: "Volcengine SeedAudio 1.0 · 白刃三音",
    license: "volcengine",
    cuts: [
      // 挥空给三个变体：白刃是连续动作，一个样本反复响两下就露馅。
      // 三条性格不同（木质厚实 / 长嘶 / 刃嘶明亮），随机轮着出。
      {
        cue: "dadaoSwing", durS: 0.55,
        files: ["AudioSfx_DadaoSwing_01.mp3", "AudioSfx_DadaoSwing_02.mp3", "AudioSfx_DadaoSwing_03.mp3"],
        credit: "Volcengine SeedAudio 1.0 · 大刀挥空（三变体：木质厚实 / 长嘶 / 刃嘶明亮）",
      },
      { cue: "dadaoHit", durS: 0.669, file: "AudioSfx_DadaoHit_01.mp3",
        credit: "Volcengine SeedAudio 1.0 · 大刀砍入人体" },
      { cue: "bayonetHit", durS: 1.369, file: "AudioSfx_BayonetHit_01.mp3",
        credit: "Volcengine SeedAudio 1.0 · 刺刀刺入拔出" },
    ],
  },

  // === 命中 ===============================================================
  {
    id: "ImpactBrick",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Gamemaster Audio -  Bullet Impact Sounds/bullet_impact_concrete_brick_01.mp3",
    credit: "Gamemaster Audio · 弹着砖石 · Sonniss GDC 2017",
    license: "sonniss",
    cuts: [{ cue: "impactBrick", tail: 0.5, gain: 0.88, whole: true }],
  },
  {
    id: "ImpactBrickExtra",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "PMSFX - Shattering Bricks/PM_SB_SOURCE_16 Impact brick rock dirt gravel single hit.mp3",
    credit: "PMSFX · 青砖碎裂 · Sonniss GDC 2020",
    license: "sonniss",
    // 城里最常听到的一种跳弹 —— 一个样本反复响会露馅，这是它的第二、第三个变体。
    cuts: [{ cue: "impactBrick", tail: 0.5, gain: 0.85, variants: 2, append: true, decay: [0.04, 0.7] }],
  },
  {
    id: "ImpactDirt",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "PMSFX - Bullet Bys &Impacts/PM_BBI_Bullet_Impact_Dirt_3.mp3",
    credit: "PMSFX · 弹着夯土 · Sonniss GDC 2020",
    license: "sonniss",
    cuts: [{ cue: "impactDirt", tail: 0.42, gain: 0.82, whole: true }],
  },
  {
    id: "ImpactWood",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Double Trouble Audio - Wood Impacts and Debris/Impacts Soft - Short, Crack.mp3",
    credit: "Double Trouble Audio · 木料受击开裂 · Sonniss GDC 2017",
    license: "sonniss",
    cuts: [{ cue: "impactWood", tail: 0.45, gain: 0.85, whole: true }],
  },
  {
    id: "ImpactWoodExtra",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Double Trouble Audio - Wood Impacts and Debris/Impacts Hard - Short Wobbly Tail 01.mp3",
    credit: "Double Trouble Audio · 木料受击（硬）· Sonniss GDC 2017",
    license: "sonniss",
    cuts: [{ cue: "impactWood", tail: 0.5, gain: 0.85, whole: true, append: true }],
  },
  {
    id: "ImpactMetal",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Gamemaster Audio -  Bullet Impact Sounds/bullet_impact_metal_heavy_08.mp3",
    credit: "Gamemaster Audio · 弹着厚金属 · Sonniss GDC 2017",
    license: "sonniss",
    cuts: [{ cue: "impactMetal", tail: 0.75, gain: 0.88, whole: true }],
  },
  {
    id: "ImpactFlesh",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "PMSFX - Bullet Bys &Impacts/PM_BBI_Bullet_Impact_Hit_Body_Flesh_25.mp3",
    credit: "PMSFX · 弹着人体 · Sonniss GDC 2020",
    license: "sonniss",
    // 这一声决定玩家知不知道自己命中了 —— 全表最不能含糊的一条。
    cuts: [{ cue: "impactFlesh", tail: 0.5, gain: 0.95, whole: true }],
  },

  // === 身体 ===============================================================
  {
    id: "StepDirt19",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "PMSFX - STEPS Dirt & Gravel/PM_SDNG_Single_Step_Footstep_19.mp3",
    credit: "PMSFX · 土路单步 · Sonniss GDC 2019",
    license: "sonniss",
    cuts: [{ cue: "footstepDirt", tail: 0.4, gain: 0.6, whole: true }],
  },
  {
    id: "StepDirt46",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "PMSFX - STEPS Dirt & Gravel/PM_SDNG_Single_Step_Footstep_46.mp3",
    credit: "PMSFX · 土路单步 · Sonniss GDC 2019",
    license: "sonniss",
    // 脚步每秒响一两下，**一个固定样本循环起来就是机关枪**。多变体是硬要求。
    cuts: [{ cue: "footstepDirt", tail: 0.4, gain: 0.6, whole: true, append: true }],
  },
  {
    id: "StepGravel",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "Studio 23 - Ultimate Footstep Collection/S23_SFX_Footsteps_Gravel_Loafers_Loops_Walk_Normal.mp3",
    credit: "Studio 23 · 碎石路行走 · Sonniss GDC 2019",
    license: "sonniss",
    // 城破之后的主要地面是瓦砾。这段是连续行走，按起音点切出四步。
    cuts: [{ cue: "footstepRubble", tail: 0.4, gain: 0.62, variants: 4, minGap: 0.28, decay: [0.03, 0.5] }],
  },
  {
    id: "BodyfallDirt",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "Red Libraries - Bodyfall/RL_bodyfall_Dirt_M4_Close_Stereo_Hard_Impact_10.mp3",
    credit: "Red Libraries · 人体倒地（土地面）· Sonniss GDC 2019",
    license: "sonniss",
    cuts: [{ cue: "bodyFall", tail: 1.1, gain: 0.8, whole: true }],
  },
  {
    id: "PainGrunt",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "Articulated Sounds - Fight Vocalizations/EMOTE Joshua, Man, Pain Hurt Grunt Big 03.mp3",
    credit: "Articulated Sounds · 男性痛呼 · Sonniss GDC 2019",
    license: "sonniss",
    // 非语言的闷哼，与四川话口令库是两回事（那套是喊话，这条是挨枪的一声）。
    cuts: [{ cue: "hurt", tail: 0.85, gain: 0.85, whole: true }],
  },
  {
    id: "SoldierGrunt",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "344 Audio - British Soldier Voices/Grunts 16.mp3",
    credit: "344 Audio · 士兵闷哼 · Sonniss GDC 2020",
    license: "sonniss",
    cuts: [{ cue: "hurt", tail: 0.8, gain: 0.85, whole: true, append: true }],
  },
  {
    id: "Heartbeat",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Airborne Sound - Human/Heartbeat,Sound Design,Pulse,Throb,Steady,Accelerate,Panic,Fear.mp3",
    credit: "Airborne Sound · 心跳 · Sonniss GDC 2018",
    license: "sonniss",
    // 只取一下（引擎按伤势自己排节奏），所以要**一整跳**：咚-哒两声都在里面。
    cuts: [{ cue: "heartbeat", tail: 0.7, gain: 0.9, prefer: "loud", lp: 900, decay: [0.08, 0.9] }],
  },

  // === 信号 ===============================================================
  {
    id: "Bugle",
    url: "https://upload.wikimedia.org/wikipedia/commons/7/77/Last_Post_bugle_call.ogg",
    credit: "Sgt. Codie Lynn Williams, U.S. Marine Corps · 军号（PD）· Wikimedia Commons",
    license: "commons",
    // **只取单个音**，冲锋号的调子仍由引擎按中方动机排 —— 直接搬美军的号谱
    // 就成了另一支军队在吹。tone:true 会顺便量出这个音的基频写进清单，
    // 引擎照它算 playbackRate 才吹得准调。
    // 选《Last Post》而不是《Assembly》：Assembly 是 0.35 秒一个的短音，
    // 切出来必带下一个音的头，量基频会量到两个音的混合（实测 398 与 497 Hz 各一半，
    // 一个 G 号的 G4 加 B4）。Last Post 慢而长，能切到一个干净的持续音。
    cuts: [{ cue: "bugleTone", tail: 1.0, gain: 0.9, prefer: "sustain", tone: true, decay: [0.5, 3.0] }],
  },
  {
    id: "Whistle",
    url: "https://upload.wikimedia.org/wikipedia/commons/7/7d/218318_splicesound_referee-whistle-blow-gymnasium.wav",
    credit: "SpliceSound · 哨子（CC0）· Wikimedia Commons",
    license: "commons",
    cuts: [{ cue: "whistle", tail: 0.9, gain: 0.85, prefer: "loud", decay: [0.15, 1.2] }],
  },

  // =========================================================================
  // 任务流程重制 · 音效缺口批 A2（2026-08-28 烘焙 / 2026-08-29 接线）
  //
  // 这些组一开始全带 `pending: true`：素材已经烘好、响度也按 −25 dBFS 对齐过了，
  // 但 `Script_Audio.RECIPES` 里还没有同名的合成配方 —— `LoadSfxPack` 对没有同名
  // 配方的 cue 是**直接抛错**的（「没有同名配方，盖不上去」），放进 manifest.cues
  // 会让每次开机多出十几条 sfxErrors，并把 AudioTest 的三条计数断言一起顶红。
  // 于是它们先落在 `manifest.pendingCues`：文件在仓库里、清单里有账、运行时看不见。
  //
  // **2026-08-29 集成批 INT3a 已经接完线**：`Script_Audio.RECIPES` 补了十五条同名
  // 兜底配方、`SAMPLE_MIX` / `SAMPLE_WET` / `AMB_AIR` / `NODE_COST` 各自加了行、
  // `SFX_PACK_VERSION` 从 7 bump 到 8、`Script_AudioTest.RECIPE_COUNT` 从 41 改成 56，
  // 这里的 `pending` 随之删光，照组名重烘之后产物从 pendingCues 搬进了 cues。
  //
  // **重烘一律照组名点名**（`node Script_SfxBake.mjs ExecScreamShout ExecScreamCry …`）。
  // 不带组名的全量会把清单从零重建，而 `Audio/Sfx/_raw/` 是 gitignore 的 ——
  // 谁的本地没有原始长片，谁的 cue 就被从清单里抹掉。共用同一个 cue 的组
  //（ExecScreamShout + ExecScreamCry）必须一起烘。
  //
  // 规格出处：docs/Data_MissionRemake.md §2/§4/§5/§6/§7 与七个 Data_MissionChX 头注的
  // ENGINE_REQUEST。逐条的验收数字在 docs/Data_AudioAssets.md「重制新增音效」一节。
  // =========================================================================

  // --- 实录人声（明令不许走 TTS）-------------------------------------------
  // 三条都是**非语言的嗓音**。SeedAudio 做不像（hurt_scream 那条的教训在
  // docs/Data_AudioAssets.md「交付档」节），所以从免版税实录库里取真人录音。
  // 选材两条底线：① 必须是成年男性；② 宁可短、闷、克制，也不要「猎奇的一声啊——」，
  // 第三关处决段是隔着墙听到的，那一声的作用是让玩家明白里面在干什么，不是展览。
  {
    id: "ExecScreamShout",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "SoundBits -  Screams & Shouts 2 - Humans/Male_Shout-of-Pain_132.mp3",
    credit: "SoundBits · 男性痛叫 · Sonniss GDC 2016",
    license: "sonniss",
    // 第三关阶段 7 的短促惨叫（隔墙、低概率、低音量）。原素材 0.95 s：起音在 0.05 s，
    // 之后是一条越来越松的尾巴。**只留 0.62 s 并用 0.16 s 收干净** —— 策划案要的是
    // 「掐尾」：一声起来、断掉，不给它把整声喊完。基频 361→256 Hz（成年男性）。
    cuts: [{ cue: "execScream", exactAtS: 0.02, tail: 0.62, gain: 0.92,
      fadeOutS: 0.16, alignDbfs: -25 }],
  },
  {
    id: "ExecScreamCry",
    item: "game-audio-monthly",
    path: "Sonniss.com - Game Audio Monthy - #2/SoundBits - Screams & Shouts/Screams&Shouts_human_male_011.mp3",
    credit: "SoundBits · 男性短叫 · Sonniss Game Audio Monthly #2",
    license: "sonniss",
    // 第二个变体。**一条惨叫绝不能只有一个样本** —— 处决段会响好几次，
    // 同一份 wav 连出两次就从「里面在杀人」变成「音效在循环」。
    // 这条基频更低（230 Hz），性格与上一条分得开：那条是喊出来的，这条是被打断的。
    // 同厂同库（SoundBits Screams & Shouts），音色对得上。
    cuts: [{ cue: "execScream", exactAtS: 0.00, tail: 0.55, gain: 0.92,
      fadeOutS: 0.14, append: true, alignDbfs: -25 }],
  },
  {
    id: "PainMoanMuffled",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Airborne Sound - Human/Scream,Male,Mid Thirties,Mouth Covered,Gasps,Fast,Shriek,Panic.mp3",
    credit: "Airborne Sound · 三十多岁男性，捂着嘴的痛呼与喘 · Sonniss GDC 2018",
    license: "sonniss",
    // 第三/四关大出血伤员的**持续低声痛呼**。选这条素材的理由是「捂着嘴」：
    // 整条录音是一个男人被捂住嘴发出的声音 —— 天然是闷的、压着的，
    // 正是「疼得受不了但喊不出来」的质地，不需要再靠低通去伪造。
    // 3.36—5.96 s 那一段实测基频 106—165 Hz（全条最低的一段，其余多在 370 Hz 上），
    // 连续两秒半没有断口，中间有一次换气 —— 这是全库唯一一段**真的低而持续**的男声痛呼。
    // 首尾都给长一点的淡入淡出（0.05 / 0.30 s）：它不是冲击音，硬起硬收会像剪坏的。
    cuts: [{ cue: "painMoan", exactAtS: 3.36, tail: 2.60, gain: 0.9,
      fadeInS: 0.05, fadeOutS: 0.30, alignDbfs: -25 }],
  },
  {
    id: "HitGruntStifled",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Bottle Rocket Fx - Scream/Grunt_Pain_Male_BB_10_SCREAM LIBRARY_BRFX-004.mp3",
    credit: "Bottle Rocket Fx · 男性痛哼 · Sonniss GDC 2016",
    license: "sonniss",
    // 第四关罗班长腹部中弹那一声：**闷哼，不是惨叫**（Data_MissionCh4 头注第 8 条原话
    // 「压住的、不是惨叫」）。原素材 0.46 s，起音后 0.3 s 就没了 —— 短是对的。
    // rate 0.82：原声基频约 350 Hz，压到 290 Hz 才对得上罗班长的音色口径
    // （三十五到四十、沙哑粗嗓男中低音，见 docs/Data_AudioAssets.md 音色表）。
    // 与已有的 `hurt`（Articulated 的 Joshua ／ 344 Audio 的士兵闷哼）是**不同库**：
    // 这一声是点名给一个角色的，不能和满场随机的中弹哼混成一个音。
    cuts: [{ cue: "hitGrunt", exactAtS: 0.02, tail: 0.42, gain: 0.9,
      rate: 0.82, fadeOutS: 0.10, alignDbfs: -25 }],
  },

  // --- 照明弹（第四关）-----------------------------------------------------
  // 一个完整循环四条：发射 → 顶空点燃 → 持续燃烧（可循环）→ 熄灭。
  // 后三条同源同一次录音（TS Sound 那条 61 秒的「信号弹点燃」），所以点燃、燃烧、
  // 熄灭听着是**同一支照明弹的三个阶段**，不是三样东西拼起来的。
  {
    id: "FlareLaunch",
    item: "sonniss-gdc-2023-game-audio-bundle-normalized",
    path: "InspectorJ - Essentials 03 Fireworks/FRWKComr_InsJ_Fireworks_Launch_Close_01-03.mp3",
    credit: "InspectorJ · 焰火近距离发射 · Sonniss GDC 2023",
    license: "sonniss",
    // 发射的「咚」＋升空的呼啸。拿焰火的发射筒而不是枪械音：照明弹是从迫击炮式的
    // 发射筒／信号枪打上去的，那一下是**闷的推力**，不是枪口爆音。
    // 整条 3.44 s，能量在 0.02—0.5 s 涨到顶再拖一条上升的噪声尾巴 ——
    // 留 2.6 s 就是为了那条尾巴：玩家要听得出「它还在往上走」。
    cuts: [{ cue: "flareLaunch", exactAtS: 0.00, tail: 2.60, gain: 0.92,
      fadeOutS: 0.35, alignDbfs: -25 }],
  },
  {
    id: "FlareBurn",
    item: "game-audio-monthly",
    path: "Sonniss.com - Game Audio Monthly - #4/TS Sound - Fire, Sizzles, and Ignites...Oh my!/FLARE_IGNITE_WITH_WATER_SIZZLES_01.mp3",
    credit: "TS Sound · 信号弹点燃与持续燃烧 · Sonniss Game Audio Monthly #4",
    license: "sonniss",
    // **这是一条真的照明弹录音**（不是「火焰音效」顶包），一条 61 秒的素材里
    // 点燃、稳定燃烧、结束都在：
    //   · flareIgnite —— 0.30 s 处那记点燃冲头「噗」，留 1.2 s 带出刚烧起来的嘶声；
    //   · flareBurn   —— 26.0 s 起 6 秒，全条最平稳的一段（燃烧已经稳定），loop；
    //                    两头各 20 ms 淡入淡出，**长淡入淡出在循环接缝上就是每圈一个坑**；
    //   · flareOut    —— **素材末尾是真的烧完了**：实测 58.5 s 起从 −33 dB 一路掉到
    //                    60.6 s 的 −61 dB，两秒多的自然衰减。所以熄灭不用造，
    //                    直接取最后 2.9 s（起手 57.8 s 还有 0.7 s 稳定燃烧再开始沉下去）。
    //                    ——「熄灭衰减」这类音只要有真的，就别用淡出曲线冒充。
    cuts: [
      { cue: "flareIgnite", exactAtS: 0.30, tail: 1.20, gain: 0.92, fadeOutS: 0.25, alignDbfs: -25 },
      { cue: "flareBurn", exactAtS: 26.0, tail: 6.00, gain: 0.85, loop: true,
        fadeInS: 0.02, fadeOutS: 0.02, alignDbfs: -25 },
      { cue: "flareOut", exactAtS: 57.80, tail: 2.90, gain: 0.85, fadeInS: 0.03, fadeOutS: 0.15, alignDbfs: -25 },
    ],
  },

  // --- 发报（终章）---------------------------------------------------------
  // Data_MissionCh6 头注「音效缺口三条」的前两条。第三条（火车车轮声）**不重做**：
  // 尾声要的「电流声渐变序章火车车轮声」里那个车轮声，指的就是序章那一条 ——
  // 复用 `Audio/Amb/AudioAmb_TrainInterior.mp3`（30 s 立体声床，含轮轨咔嗒），
  // 首尾呼应的前提是它**得是同一个声音**，另录一条反而把这处收束拆散了。
  {
    id: "TelegraphKey",
    item: "sonniss-gdc-2026-game-audio-bundle-normalized",
    path: "344 Audio - Antique Small Metals/METLMvmt_  Tinkering Antique Lock_344 Audio_Antique Small Metals.mp3",
    credit: "344 Audio · 古董黄铜锁具摆弄 · Sonniss GDC 2026",
    license: "sonniss",
    // 电键的「嗒」。库里没有电键实录，退而求其次要的是**同一种东西**：
    // 一九三〇年代的电键是黄铜杆＋弹簧＋触点，声音是干、短、带一点点金属余韵的一记
    // ——「古董小金属件」这条录的就是黄铜锁具在手里摆弄，同材质同尺寸同录音棚。
    // 三个变体从同一条素材里挑三下不同的：发报是**连着敲**的，
    // 一个样本敲二十下就成了打字机。这三条也因此不能靠随机挑（会连出两次同一条），
    // 接线时请照白刃三音的做法进 SAMPLE_CYCLE 顺序轮播，且不做逐发变调。
    //
    // **位置是钉死的，不走自动挑法。** 这条素材里的敲击最密处只隔 60 ms，
    // 自动挑法给的 0.28 s 窗口一口气吃进三下 —— 按一次键响三声，比没有音效更糟。
    // 逐条听（看）过之后钉了三个位置，都只留 17 ms 的引头 ——
    // 按键音的前面多五十毫秒空白，手感上就是「按下去慢半拍」。
    cuts: [
      { cue: "telegraphKey", exactAtS: 0.145, tail: 0.21, gain: 0.9, fadeOutS: 0.06, alignDbfs: -25 },
      { cue: "telegraphKey", exactAtS: 1.285, tail: 0.25, gain: 0.9, fadeOutS: 0.06, append: true, alignDbfs: -25 },
      { cue: "telegraphKey", exactAtS: 2.425, tail: 0.23, gain: 0.9, fadeOutS: 0.06, append: true, alignDbfs: -25 },
    ],
  },
  {
    id: "TelegraphHum",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "RedSonic - Hums Light Machines/electric_hum_buzz_01.mp3",
    credit: "RedSonic · 电器低鸣与嗡声 · Sonniss GDC 2017",
    license: "sonniss",
    // 发报机的电流底噪（尾声开头那一段「电流声」）。取 2.0 s 起的 6 秒 ——
    // 整条 11.7 s 的电平方差极小（工频谐波稳定成条），是「最无聊的一段」，
    // 这正是选床的判据（见 docs/Data_AudioAssets.md 环境床那一节）。
    // lp 7000：一九三〇年代的电台不会有八千赫以上的东西，砍掉才不像现代电源适配器。
    cuts: [{ cue: "telegraphHum", exactAtS: 2.00, tail: 6.00, gain: 0.85, loop: true,
      lp: 7000, fadeInS: 0.03, fadeOutS: 0.03, alignDbfs: -25 }],
  },

  // --- 日机攻击（第一关）---------------------------------------------------
  // Data_MissionCh1 头注 ENGINE_REQUEST 第 4 条：两轮航线，第二轮转向人群。
  // 三样东西分开录、分开切：**飞机的引擎**、**飞机的机枪**、**弹着扫过地面**。
  {
    id: "PlaneDive",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "Pole Position - Bristol Blenheim Mk 1 1934/blenheim_mk_i_t3_ext_distant_medium_fly_bys_end_of_runway_ORTF_MKH8040.mp3",
    credit: "Pole Position Production · 布里斯托尔「布伦海姆」1934（通场）· Sonniss GDC 2019",
    license: "sonniss",
    // 俯冲通场的引擎啸声。**与 `amb.planeFar` 同一条素材、同一架飞机**（1934 年首飞的
    // 双发活塞机，与九六陆攻同代）—— 远处盘旋那一声和压到头顶这一声必须是同一架，
    // 换素材就成了两架飞机。这里取的是整条 235 s 里第三次、也是最近的一次通场：
    // 156.5 s 起 7 秒，实测 −36 dB 涨到 160.0 s 的 −9 dB 再落回 −34 dB，
    // **多普勒是录出来的，不是变调做的** —— 这也是不用合成器的唯一理由。
    cuts: [{ cue: "planeDive", exactAtS: 156.50, tail: 7.00, gain: 0.95,
      fadeInS: 0.15, fadeOutS: 0.45, alignDbfs: -25 }],
  },
  {
    id: "StrafeNear",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - M1919A4 Browning Machine Gun .30cal on turret/M1919A4_Browning_Machine_Gun_.30cal_on_turret_1m_left_blanks_Triple_shots_x_2.mp3",
    credit: "Pole Position Production · M1919A4 .30cal（炮塔架，1 m 左侧）· Sonniss GDC 2016",
    license: "sonniss",
    // 空对地扫射的**近**版本。选材同 `type92` 的理由再走一遍，且更硬：
    // 这条录的是**架在炮塔上**的 M1919A4 —— 机载机枪就是这么装的，
    // 每发后面那记枪架金属余振是「这枪不在人手里」的唯一线索。
    // 素材里两组三连发（0.05 s 与 4.35 s），取第二组：它后面的尾巴没有别的动作压着。
    //
    // **这条破了「只切单发、射速由引擎排」那条规矩，是故意的**：航空机枪 ~900 rpm，
    // 一次扫射两秒钟就是三十发，逐发排会被 NODE_BUDGET 那道闸吃掉一半（还是随机的一半）。
    // 所以给的是一段**现成的三连发**，接线时按需要连着触发即可。
    cuts: [{ cue: "strafeNear", exactAtS: 4.33, tail: 1.50, gain: 0.95, fadeOutS: 0.20, alignDbfs: -25 }],
  },
  {
    id: "StrafeFar",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - M1919A4 Browning Machine Gun .30cal on turret/M1919A4_Browning_Machine_Gun_.30cal_on_turret_300m_in_front_blanks_Triple_shots_x_2.mp3",
    credit: "Pole Position Production · M1919A4 .30cal（炮塔架，300 m 正前）· Sonniss GDC 2016",
    license: "sonniss",
    // 同一挺枪、同一次射击、300 m 外的另一支麦。**远近是两条真的录音**（选材硬标准第 3 条）：
    // 远处那一梭子的尾巴是野地给的，近射加低通造不出来。
    // 同样取第二组三连发，尾巴留到 2.2 s —— 远场的价值全在尾巴上。
    cuts: [{ cue: "strafeFar", exactAtS: 4.32, tail: 2.20, gain: 0.85, fadeOutS: 0.35, alignDbfs: -25 }],
  },
  {
    id: "StrafeDirt",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Pole Position - The Warfare Library/warfare_t3_mg_whizzes_ricochets_bullet_cracks_M10.mp3",
    credit: "Pole Position Production · 机枪弹丸掠过、跳弹与音爆 · Sonniss GDC 2017",
    license: "sonniss",
    // 弹着扫过土路的那一串「噼啪」。与 `amb.whizz` 同一条素材（那条切的是**单发**掠过），
    // 这里要的是**一串**：119.72 s 起近三秒，实测全段稳在 −26 dB 上没有断口 ——
    // 一梭子打过来的连续音爆与跳弹，正好铺在第二轮扫射弹线追人群的那几秒上。
    cuts: [{ cue: "strafeDirt", exactAtS: 119.72, tail: 2.90, gain: 0.9,
      fadeInS: 0.02, fadeOutS: 0.30, alignDbfs: -25 }],
  },

  // --- 重机枪（第五关）-----------------------------------------------------
  // 三件里**连发已经有了**：`type92`（M1919A4 单发）＋ SAMPLE_BURST 的 200 rpm，
  // 「啄木鸟」那条身份证不动。缺的是过热与卡壳这两件，补在这里。
  {
    id: "MgOverheat",
    item: "sonniss-gdc-2015-game-audio-bundle-normalized",
    path: "Eiravaein Works - Ilmarinen/Ilmarinen,blacksmith,forge,lighthammer,anvil,hotiron,rattle,taphammer,belts,gears,ambiance.mp3",
    credit: "Eiravaein Works · 铁匠铺：轻锤敲热铁 · Sonniss GDC 2015",
    license: "sonniss",
    // 过热的「咔哒」。九二式是**气冷**的（不是马克沁那种水冷），过热时的声音不是
    // 水汽嘶嘶，是散热片与枪管热胀冷缩的一记记金属轻响 —— 所以取的是铁匠铺里
    // 轻锤敲在**热铁**上的点击（同一种物件、同一种温度状态）。
    // 素材 10.8 s 里十几下独立的敲击，挑两下当变体：接线时按热度提高触发频率，
    // 一个样本连着响就成了节拍器。
    cuts: [{ cue: "mgOverheat", tail: 0.35, gain: 0.85, variants: 2,
      minGap: 0.35, decay: [0.05, 0.6], fadeOutS: 0.10, alignDbfs: -25 }],
  },
  {
    id: "MgCharge",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - Various Gun Foley & Handling/SAIGA-12_12g_solid_slug_foley_close_up_RSM191_R_cocking.mp3",
    credit: "Pole Position Production · 重型枪机拉柄（近距离）· Sonniss GDC 2016",
    license: "sonniss",
    // 卡壳之后那一下拉栓。**不能用已有的 `bolt`**：那是 M1903A3 的旋转后拉枪机，
    // 一支步枪的动作；重机枪的拉柄是一大块钢被整个拽回来再放回去，重得多。
    // 这条素材是 12 号霰弹枪的枪机拉柄近录，十四下干净独立的动作，正是需要的那个重量。
    // 素材里「拉」（峰值 0.52）与「放回」（峰值 0.27）是**隔着 1.4 s** 的两下 ——
    // 两下一起切进来就是中间一个 0.5 s 的洞，玩家按完键要等一秒半才听完，像卡住了。
    // 所以只取「拉」那一下（18.47 s，全条最干净的一记，后面有 0.8 s 干净衰减），
    // 需要两段式的话由接线侧触发两次。
    cuts: [{ cue: "mgCharge", exactAtS: 18.47, tail: 0.90, gain: 0.9,
      fadeOutS: 0.15, alignDbfs: -25 }],
  },

  // =========================================================================
  // 对标 3A 素材补缺批（2026-09-08）
  //
  // 本批只走 Sonniss 实录（archive.org 镜像），**一条生成音都没有** —— 找不到的
  // 记进 docs/Data_AudioAssets.md 的「Sonniss 缺口清单」，不拿模型顶。
  //
  // ## 镜像的形状决定了怎么选材
  // archive.org 上的 Sonniss 镜像是**每家厂商每个库只放三四个文件**的抽样。
  // 「同厂商同枪的另一个 take」这条最优解因此**大半时候不成立** —— 一个库里
  // 常常只剩一条枪声。于是本批按两级来：
  //   1. **同一条长片里的另一发**。这是本批最大的收获：Pole Position 的
  //      `K98k, Firing`（40 s / 10 发）、`M1903A3, Firing`（20 s / 5 发）、
  //      FLYSOUND 的 `NAGANT 50m distant`（56 s / 10 发）都是**几十秒的连续实录**，
  //      同一支枪、同一支麦、同一天，切出来的变体之间只差真实的发发抖动 ——
  //      这正是「多变体」想要的那种差别，比任何变调都真。
  //   2. **按频谱挑**（谱心 / >4 kHz 占比 / 降 20 dB 时长，做法同 explosionNear
  //      那三条）。拿现有成品当靶子量一遍镜像，选夹住靶子的。
  //
  // ## 远近一律是两条真的录音
  // 新增的三条机枪远场（zb26Far / type11Far / type92Far）与已有的近场是
  // **同一次射击的另一支麦**：L7A2 的 1 m 与 50 m、BAR 的 0.1 m 与 300 m、
  // M1919A4 枪架的 1 m 与 300 m。选材硬标准第 3 条在这里是字面成立的。
  //
  // ## 枪尾按「声源在哪个空间」选，不按枪选
  // gunTail* 六条要的是**空间的回声**，不是枪。所以取 Pole Position 的
  // Indoor / Outdoor Gun Acoustics 两个库 —— 那两个库存在的理由就是这个：
  // 同一支枪在开阔地 / 建筑之间 / 长走廊里各录一遍。切法是**从起音后 48 ms 落刀**，
  // 把枪口爆音让给 body 层，只留后面的空间。口径因此不是这几条的判据
  //（走廊的混响不会因为换一支枪而变成另一条走廊），但仍尽量取全威力弹的那几支。
  //
  // 本批新增的 cue 烘焙时带过 `pending: true`（`Script_Audio.RECIPES` 里当时还没有同名配方，
  // 直接进 `manifest.cues` 会让 `LoadSfxPack` 每次开机抛一堆 sfxErrors）。
  // 2026-09-08 接线批（Script_AudioWiring 的 26 条合成回落配方）落地后 pending 已删光，
  // 产物从 `manifest.pendingCues` 搬进了 `cues`；切法确定性，mp3 逐字节不变，只动了清单。
  // 给已有 cue 补变体的组从来不带 pending —— 它们 append 进现成的 cue。
  // =========================================================================

  // --- 步枪：中正式（7.92×57 毛瑟）-----------------------------------------
  {
    id: "RifleNraK98kTakes",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "Pole Position - Mauser Karabiner 98 kurz K98k bolt-action rifle/K98k, Firing, t2, MKH416.mp3",
    credit: "Pole Position Production · K98k 7.92×57 连续实录（同一支枪的另外三发）· Sonniss GDC 2020",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // **中正式就是毛瑟标准型的中国版**，K98k 与它同弹同枪机 —— 选材硬标准第 1 条
    // 在这一条上是字面成立的，不需要任何折算。这条素材 39.5 s 里有十发独立射击
    //（间隔 3—5 s，中间是拉栓），实测谱心 3900—4070 Hz、>4 kHz 占 34—38 %，
    // 与现有 `_01`（Watson Wu 毛瑟 8 mm 中距离，谱心 3573 Hz / 33.0 %）同一档。
    // 三个变体之间只差**真实的发发抖动**，不是同一份 wav 变调。
    cuts: [{ cue: "rifleNra", tail: 1.30, gain: 0.94, variants: 3, minGap: 0.8,
      append: true, alignDbfs: -25 }],
  },
  // --- 步枪：三八式（6.5×50，用 .30-06 的 M1903A3 升调顶）---------------------
  {
    id: "RifleIjaSpringfieldTakes",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "Pole Position - Springfield 1903A3 bolt-action rifle/M1903A3, Firing, t2, 1m, Right, Above, MKH8060.mp3",
    credit: "Pole Position Production · 斯普林菲尔德 M1903A3 .30-06 连续实录 · Sonniss GDC 2020",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 沿用 docs 里定过的那条折算：三八式 6.5×50「又尖又脆」→ .30-06 升调 10 %。
    // **比现有 `_01`（M1 Garand）更对的一点是枪机**：M1903A3 与三八式一样是旋转
    // 后拉枪机，Garand 是半自动 —— 每发后面那记自动机复进声本来就不该有。
    // 20 s 里五发，间隔 3.5—4.4 s。
    cuts: [{ cue: "rifleIja", tail: 1.05, gain: 0.92, rate: 1.10, variants: 3, minGap: 0.8,
      append: true, alignDbfs: -25 }],
  },
  // --- 轻机：捷克式 ZB-26（弹匣供弹的全威力弹轻机）---------------------------
  {
    id: "Zb26L86Lsw",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - Enfield L86 LSW 5.56mm/Enfield_L86_LSW_5.56mm_1m_right_MKH8040_2_clean_Triple_shots_x_1.mp3",
    credit: "Pole Position Production · Enfield L86 LSW（弹匣供弹轻机，1 m）· Sonniss GDC 2016",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // **这是一条妥协，写清楚为什么。** 现用的 L7A2 GPMG 那条素材整整 7.5 s 里
    // 只有**一发**（前 4 s 是数字静音），镜像里没有第二发可切；而全库再没有第二条
    // 7.92 级别的弹匣供弹轻机近录。
    // 于是按「机构对得上」选：L86 LSW 与 ZB-26 一样是**弹匣供弹、两脚架、班用轻机**，
    // 同一家厂商、同样的 1 m clean 录法，差的是口径（5.56 对 7.92）。
    // rate 0.94 把它往下压一档 —— 不敢压更多：实测原声谱心 5023 Hz、zcr 6500，
    // 与现有 `_01`（5907 Hz / 6728）已经很近，再降就跑到 4600 以下、听着不像同一挺枪了。
    // 只取三发里的**末发**（0.656 s）：前两发的尾巴都压着下一发。
    cuts: [{ cue: "zb26", exactAtS: 0.656, tail: 0.90, gain: 0.90, rate: 0.94,
      append: true, alignDbfs: -25 }],
  },
  // --- 轻机：十一年式（用 BAR 顶）-------------------------------------------
  {
    id: "Type11BarSecondShot",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - M1918 Browning Automatic Rifle .30cal/M1918_Browning_Automatic_Rifle_.30cal_0.1m_to_right_Double_shots_x_1.mp3",
    credit: "Pole Position Production · BAR .30cal 近场（同一次双发的第二发）· Sonniss GDC 2016",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 与 `_01` 同一条素材、同一次双发，但落刀在**第二发自己的起音**（0.501 s）上，
    // 而 `_01` 落在 0.658 s —— 那是双发的共同尾巴。所以这两条不是同一份波形变调，
    // 一条有冲头一条没有，轮播时听得出是两下不同的枪。
    cuts: [{ cue: "type11", exactAtS: 0.501, tail: 0.78, gain: 0.86, rate: 1.12,
      append: true, alignDbfs: -25 }],
  },
  // --- 重机：九二式（M1919A4）------------------------------------------------
  {
    id: "Type92M1919Near5m",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - M1919A4 Browning Machine Gun .30cal/M1919A4_Browning_Machine_Gun_.30cal_5m_behind_ORTF_blanks_Triple_shots_x_1.mp3",
    credit: "Pole Position Production · M1919A4 .30cal（5 m 侧后）· Sonniss GDC 2016",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 同一挺枪、同一批录音的另一支麦（5 m）。只取三连发的**末发**（0.251 s）。
    cuts: [{ cue: "type92", exactAtS: 0.251, tail: 1.10, gain: 0.92, rate: 1.03,
      append: true, alignDbfs: -25 }],
  },
  {
    id: "Type92M1919Turret1m",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - M1919A4 Browning Machine Gun .30cal on turret/M1919A4_Browning_Machine_Gun_.30cal_on_turret_1m_left_blanks_Triple_shots_x_2.mp3",
    credit: "Pole Position Production · M1919A4 .30cal（枪架，1 m 左）· Sonniss GDC 2016",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // **架在枪架上那版**，正是 docs 说的「重机与轻机在听感上真正的分界」——
    // 每发后面那记金属余振。素材里两组三连发，取第二组的末发（4.605 s）：
    // 它后面 3.4 s 没有别的动作压着，尾巴最干净。
    cuts: [{ cue: "type92", exactAtS: 4.605, tail: 1.10, gain: 0.92, rate: 1.03,
      append: true, alignDbfs: -25 }],
  },

  // --- 远场步枪 -------------------------------------------------------------
  {
    id: "RifleNraFarNagant50m",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "FLYSOUND - Mosin Nagant/NAGANT 50m distant front left shots.mp3",
    credit: "FLYSOUND · 莫辛纳甘 50 m 外（同一次拍摄的连续十发）· Sonniss GDC 2020",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 与 `_01`（同厂同枪的 mixed long distance）是**同一批素材**，这条是 50 m 机位、
    // 56 s 里十发。实测谱心 4610—4910 Hz，`_01` 是 4100 —— 同一档。
    // 远场的价值全在尾巴上，所以 tail 给到 1.8 s。
    cuts: [{ cue: "rifleNraFar", tail: 1.80, gain: 0.80, variants: 2, minGap: 1.0,
      append: true, alignDbfs: -25 }],
  },
  {
    id: "RifleIjaFarBuildings",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Pole Position - The Outdoor Gun Acoustics Library/AK5_valley_field_forest_50m_behind_gun_off_axis_behind_buildings_M10.mp3",
    credit: "Pole Position Production · 50 m 外、经建筑反射的步枪射击 · Sonniss GDC 2018",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // **按频谱选的，不是按枪名选的**（做法同 explosionNear 的第 2/3 变体）：
    // 拿现有 `_01`（BAR 300 m，谱心 2623 Hz / >4 kHz 22.7 %）当靶子把镜像量了一遍，
    // 这条 71 s 素材中段那几发实测 2651 / 2679 Hz、21.8—22.4 %，是全表最近的。
    // 它录的正是「五十米外一支步枪、声音从几栋房子之间绕回来」——
    // 滕县城里听见的每一发日军步枪都是这个形状，滤波器造不出来。
    // atS 20 把落点钉在中段那一串一致的射击上，避开首尾三发明显更响的（峰值差一倍）。
    cuts: [{ cue: "rifleIjaFar", tail: 1.50, gain: 0.78, rate: 1.08, variants: 2,
      atS: 20.0, minGap: 1.0, append: true, alignDbfs: -25 }],
  },

  // --- 新增：机枪远场（与近场是同一次射击的另一支麦）-------------------------
  {
    id: "Zb26Far",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - L7A2 GPMG 7.62x51mm/L7A2_GPMG_7.62x51mm_belt_fed_50m_behind_Schoeps_B_clean_Single_shots_tracer_x_2.mp3",
    credit: "Pole Position Production · L7A2 GPMG 7.62×51 单发（50 m 后方机位）· Sonniss GDC 2016",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // `zb26` 用的是同一次射击的 **1 m** 机位，这条是 **50 m** 机位 —— 选材硬标准第 3 条
    // 「远近是两条真的录音」在这里是字面成立的。素材里两发（0.10 s 与 4.12 s），
    // minGap 2.0 保证一发只取一次（后面那几个候选是同一发的反射）。
    cuts: [{ cue: "zb26Far", tail: 1.50, gain: 0.80, variants: 2, minGap: 2.0,
      alignDbfs: -25 }],
  },
  {
    id: "Type11Far",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - M1918 Browning Automatic Rifle .30cal/M1918_Browning_Automatic_Rifle_.30cal_300m_in_front_Double_shots_x_1.mp3",
    credit: "Pole Position Production · BAR .30cal 300 m 正面 · Sonniss GDC 2016",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // `type11` 是这挺枪的 0.1 m 机位，这条是 300 m 机位，同一次双发。
    // **已知的重复**：`rifleIjaFar_01` 也切自这条素材的末发（rate 1.08）。
    // 镜像里没有第二条 300 m 的全威力自动武器实录 —— 这一条记在缺口清单里，
    // 别当没看见（三百米外一支步枪和一挺轻机本来也难分，真正的区别由引擎排的射速给）。
    cuts: [{ cue: "type11Far", exactAtS: 0.578, tail: 1.40, gain: 0.78, rate: 1.12,
      alignDbfs: -25 }],
  },
  {
    id: "Type92Far",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Pole Position Production - M1919A4 Browning Machine Gun .30cal on turret/M1919A4_Browning_Machine_Gun_.30cal_on_turret_300m_in_front_blanks_Triple_shots_x_2.mp3",
    credit: "Pole Position Production · M1919A4 .30cal（枪架，300 m 正前）· Sonniss GDC 2016",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 与 `type92` 的枪架近场是同一挺枪、同样的架法，300 m 机位。
    // 两组三连发各取末发（0.271 s / 4.590 s），间隔钉死避开前两发的叠音。
    cuts: [
      { cue: "type92Far", exactAtS: 0.271, tail: 1.60, gain: 0.80, rate: 1.03, alignDbfs: -25 },
      { cue: "type92Far", exactAtS: 4.590, tail: 1.60, gain: 0.80, rate: 1.03, append: true, alignDbfs: -25 },
    ],
  },

  // --- 新增：枪尾（第一人称枪声分层用）---------------------------------------
  // 六条按**声源所在的空间**分，不按枪分。切法统一：`exactAtS` 落在起音后 60 ms
  //（CutOne 再往回让 12 ms，实际是起音后 48 ms），把枪口爆音整个让给 body 层，
  // 留下的就是这个空间的回声。fadeInS 30 ms 把落刀处磨平 —— 硬起就是第二记冲头。
  {
    id: "GunTailOpenRifle",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Pole Position - The Outdoor Gun Acoustics Library/AK47_big_open_area_2m_above_behind_gun_RSM191_M.mp3",
    credit: "Pole Position Production · 开阔地步枪射击的空间尾音 · Sonniss GDC 2018",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 「大开阔地」= 城外的野地与河滩。这种地方没有近处反射面，尾巴是一层
    // 迅速摊开、几乎不回来的空气声（实测降 20 dB 只要 0.02—0.14 s）。
    cuts: [
      { cue: "gunTailOpenRifle", exactAtS: 5.613, tail: 0.90, gain: 0.80,
        fadeInS: 0.03, fadeOutS: 0.25, alignDbfs: -25 },
      { cue: "gunTailOpenRifle", exactAtS: 9.602, tail: 0.90, gain: 0.80,
        fadeInS: 0.03, fadeOutS: 0.25, append: true, alignDbfs: -25 },
    ],
  },
  {
    id: "GunTailStreetRifle",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Pole Position - The Outdoor Gun Acoustics Library/AK5_valley_field_forest_50m_behind_gun_off_axis_behind_buildings_M10.mp3",
    credit: "Pole Position Production · 建筑之间的步枪射击尾音 · Sonniss GDC 2018",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 「街」在这个镜像里唯一能对上的实录就是这条：麦克风在建筑背后，
    // 收到的是**从房子上弹回来的那一层**。不是城市峡谷，但反射面的性质对得上，
    // 而合成一层假的街道混响正是本项目 2026-08-20 那一轮定论要避免的东西。
    cuts: [
      { cue: "gunTailStreetRifle", exactAtS: 27.612, tail: 1.20, gain: 0.80,
        fadeInS: 0.03, fadeOutS: 0.35, alignDbfs: -25 },
      { cue: "gunTailStreetRifle", exactAtS: 34.012, tail: 1.20, gain: 0.80,
        fadeInS: 0.03, fadeOutS: 0.35, append: true, alignDbfs: -25 },
    ],
  },
  {
    id: "GunTailInteriorRifle",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Pole Position - The Indoor Gun Acoustics Library/AK4_long_corridor_single_shots_blanks_behind_gun_in_corner_M10.mp3",
    credit: "Pole Position Production · 长走廊里的步枪单发尾音（AK4 7.62 全威力弹）· Sonniss GDC 2018",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 全批里最合身的一条：AK4 是 7.62 全威力弹（口径这一档也对上了），
    // 79 s 里十发独立单发，每发降 20 dB 要 0.20—0.33 s —— 那就是屋里开枪的样子。
    cuts: [
      { cue: "gunTailInteriorRifle", exactAtS: 15.575, tail: 1.20, gain: 0.82,
        fadeInS: 0.03, fadeOutS: 0.30, alignDbfs: -25 },
      { cue: "gunTailInteriorRifle", exactAtS: 31.506, tail: 1.20, gain: 0.82,
        fadeInS: 0.03, fadeOutS: 0.30, append: true, alignDbfs: -25 },
    ],
  },
  {
    id: "GunTailOpenMg",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Pole Position - The Warfare Library/warfare_t2_mg_firing_close_projectile_tail_large_field_Telinga_w_MKH8020_or_MKH8060.mp3",
    credit: "Pole Position Production · 大野地里机枪射击的弹道与尾音 · Sonniss GDC 2017",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 素材名里就写着 `projectile_tail_large_field` —— 这个库存在的理由就是这一层。
    //
    // **落刀位置必须在一梭子的最后一发之后。** 第一版按「起音后 60 ms」落在 0.075 s，
    // 贴图一看是八记连发排在一秒里 —— 这挺枪从 0 打到 5.0 s 就没停过（约 460 rpm、
    // 每 130 ms 一发），起音后 60 ms 还在下一发之前。那不是尾音，那是连发。
    // 现在钉在两梭子各自的**末发之后**：第一梭最后一发在 5.032 s（之后静到 12.69 s），
    // 第二梭最后一发在 17.273 s（之后静到 23.57 s）。
    cuts: [
      { cue: "gunTailOpenMg", exactAtS: 5.100, tail: 1.10, gain: 0.82,
        fadeInS: 0.03, fadeOutS: 0.35, alignDbfs: -25 },
      { cue: "gunTailOpenMg", exactAtS: 17.340, tail: 1.10, gain: 0.82,
        fadeInS: 0.03, fadeOutS: 0.35, append: true, alignDbfs: -25 },
    ],
  },
  {
    id: "GunTailInteriorMg",
    item: "sonniss-gdc-2016-game-audio-bundle-normalized",
    path: "Audiobeast - The London Warehouse Firearms Library/Audiobeast_Medium_Warehouse_Browning_M2_.50_Machine_Gun_03m_RSM191_MS_Raw_002_Burst_x2.mp3",
    credit: "Audiobeast · 中型仓库里的重机枪连发尾音（The London Warehouse Firearms Library）· Sonniss GDC 2016",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 这个库整库都是「同一批枪在同一座仓库里打」，要的正是那座仓库。
    // 两组点射（19.57 s 与 23.13 s）各取一条尾，实测降 20 dB 分别要 0.76 s 与 0.89 s ——
    // 屋里架一挺重机枪就是这么久才安静下来。口径（.50）比九二式大一档，
    // 但这一层只承担空间，枪本身由 `type92` 出。
    cuts: [
      { cue: "gunTailInteriorMg", exactAtS: 19.629, tail: 1.60, gain: 0.82,
        fadeInS: 0.03, fadeOutS: 0.40, alignDbfs: -25 },
      { cue: "gunTailInteriorMg", exactAtS: 23.187, tail: 1.60, gain: 0.82,
        fadeInS: 0.03, fadeOutS: 0.40, append: true, alignDbfs: -25 },
    ],
  },
  // `gunTailStreetMg` 没有做 —— 见 docs 的缺口清单：镜像里唯一带 "Urban_Exterior"
  // 的枪声是 SoundMorph 一条 3.8 s 的 9 mm 冲锋枪点射（还是设计库），
  // 拿它当重机枪的街道尾音是错的材料，宁可空着。

  // --- 跳弹；贴耳音爆与呼啸使用下方 SeedAudio 成品登记 -----------------------
  {
    id: "Ricochet",
    item: "sonniss-gdc-2024-game-audio-bundle-normalized",
    path: "Justsoundeffects - Steampunk Gadgets/MECHMisc_Ricochet Hits 01_JSE_SG.mp3",
    credit: "Justsoundeffects · 跳弹撞击与金属余韵 · Sonniss GDC 2024",
    license: "sonniss",
    bitrate: BITRATE_TRANSIENT,
    // 库名是「蒸汽朋克小机件」，但这个文件是**素材录音**（SOURCE 那一类）：
    // 九记金属被打中之后的余韵，谱心 6300—7500 Hz、zcr 5000—10000、
    // 衰减 0.10—0.50 s —— 跳弹「嘤——」那条尾巴的谱形就长这样，全镜像里没有更像的。
    // 每一记后面 0.25 s 左右都跟着第二下，tail 0.65 把这一对一起带上：
    // 真实的跳弹本来就是一记撞击加一串乱窜的余音，切成孤零零一下反而假。
    //
    // **位置改过一次**：`_02` 原来钉在 2.476 s，贴图上是前 40 % 全空、真正那一下
    // 到第 45 % 才出来（起音 451 ms）—— 触发之后半秒才响，玩法上等于没有反馈。
    // 现在四条都钉在**那一串里最响的那一下**上（峰值 0.066 / 0.085 / 0.223 / 0.088）。
    cuts: [
      { cue: "ricochet", exactAtS: 0.010, tail: 0.65, gain: 0.88, fadeOutS: 0.22, alignDbfs: -25 },
      { cue: "ricochet", exactAtS: 2.735, tail: 0.65, gain: 0.88, fadeOutS: 0.22, append: true, alignDbfs: -25 },
      { cue: "ricochet", exactAtS: 4.830, tail: 0.65, gain: 0.88, fadeOutS: 0.22, append: true, alignDbfs: -25 },
      { cue: "ricochet", exactAtS: 7.195, tail: 0.65, gain: 0.88, fadeOutS: 0.22, append: true, alignDbfs: -25 },
    ],
  },

  // --- 脚步：按材质分 --------------------------------------------------------
  // 每种四条。**脚步每秒响一两下，一个固定样本循环起来就是机关枪** —— 这条旧规矩
  // 在这里是硬要求，所以每一种都从一段连续行走的实录里切四步，而不是找四个厂商。
  {
    id: "FootstepDirtLoop",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "PMSFX - STEPS Dirt & Gravel/PM_SDNG_Stereo_Walk_Seamless_Loop_1.mp3",
    credit: "PMSFX · 土路连续行走 · Sonniss GDC 2019",
    license: "sonniss",
    // 把 `footstepDirt` 从两条补到四条。与已有那两条同厂同库（PMSFX STEPS Dirt & Gravel），
    // 只是这条是连续行走的长片，能切出更多不重样的落脚。
    cuts: [{ cue: "footstepDirt", tail: 0.40, gain: 0.60, variants: 2, minGap: 0.45,
      decay: [0.02, 0.35], append: true, alignDbfs: -25 }],
  },
  {
    id: "FootstepWood",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "The Sound Pack Tree - Footstep Loops/1879 - Footsteps - Wooden Stairs - Down - 80 fpm - Loop.mp3",
    credit: "The Sound Pack Tree · 木楼梯下行（80 步/分）· Sonniss GDC 2018",
    license: "sonniss",
    // 城里的木板：民房的门板地、望楼的梯子、拆下来铺战壕的檩条。
    // 30 s 里四十步，间隔 0.75 s，实测谱心 690—1250 Hz —— 木头的闷是它的身份证
    //（对照：砖石那条 2200—3300，泥水那条 4900—7900）。
    cuts: [{ cue: "footstepWood", tail: 0.40, gain: 0.62, variants: 4, minGap: 0.6,
      decay: [0.03, 0.4], alignDbfs: -25 }],
  },
  {
    id: "FootstepStone",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Tovusound - Edward – Foleyart Collection Add-On Extended Footsteps/015_Foley_Footsteps_Asphalt_Boot_Walk_Fast_Run_Jog_Close.mp3",
    credit: "Tovusound · 军靴走硬地（近距离）· Sonniss GDC 2017",
    license: "sonniss",
    // 砖石与石板路。选它是因为**穿的是靴子**：全镜像里硬地面的连续行走多半是
    // 运动鞋或皮鞋，只有这条是靴。滕县城里的兵穿的是布鞋草鞋，但靴子的「硬底压在
    // 硬面上」比运动鞋的橡胶闷响近得多。22 s 里十七步。
    // **tail 从 0.40 收到 0.30**：素材后半段是快走与小跑，步距压到 0.36 s，
    // 0.40 s 的窗口会把**下一步的头**切进来（贴图上看得很清楚，`_01` 就是这么翻的）。
    cuts: [{ cue: "footstepStone", tail: 0.30, gain: 0.60, variants: 4, minGap: 0.5,
      decay: [0.01, 0.35], fadeOutS: 0.08, alignDbfs: -25 }],
  },
  {
    id: "FootstepGrass",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Tovusound - Edward – Foleyart Collection Add-On Extended Footsteps/169_Foley_Footsteps_Grass_Sneaker_Walk_Fast_Run_Jog_Close.mp3",
    credit: "Tovusound · 草地行走（近距离）· Sonniss GDC 2017",
    license: "sonniss",
    // 麦田与河滩草。与砖石那条同厂同一套录法（同一个拟音师、同一支麦、同一间棚），
    // 换材质不换录音风格 —— 玩家在两种地面之间走过去时，变的应该只是地面。
    // PMSFX 的 STEPS Dry Grass 库也在镜像里，但只有三个文件、每个一步，凑不满四条。
    // tail 0.34：与砖石那条同一个理由，素材后段步距压到 0.38 s。
    cuts: [{ cue: "footstepGrass", tail: 0.34, gain: 0.62, variants: 4, minGap: 0.5,
      decay: [0.05, 0.5], fadeOutS: 0.10, alignDbfs: -25 }],
  },
  {
    id: "FootstepMud",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "Wav Junction Sound Effects - Footsteps/0014_Footsteps_water_puddle_single_splashes.mp3",
    credit: "Wav Junction · 踩进水洼的单步溅水 · Sonniss GDC 2020",
    license: "sonniss",
    // 泥地与浅水。素材名里的 `single_splashes` 是关键：26 s 里十六**下独立的**踩水，
    // 不是连着趟水走 —— 连着走的那种切开每一步都带着上一步的水声。
    cuts: [{ cue: "footstepMud", tail: 0.38, gain: 0.62, variants: 4, minGap: 0.6,
      decay: [0.01, 0.4], fadeOutS: 0.10, alignDbfs: -25 }],
  },

  // --- 身体 foley -----------------------------------------------------------
  {
    id: "ClothMove",
    item: "game-audio-monthly",
    path: "Sonniss.com - Game Audio Monthly - #5/The Soundcatcher -  Cloth Foley /PANTS_JEANS_MOVEMENT_HANDLING_OFF_ON_1.mp3",
    credit: "The Soundcatcher · 厚棉布衣物摩擦 · Sonniss Game Audio Monthly #5",
    license: "sonniss",
    // 姿态变化与翻越时的衣物摩擦。取牛仔布而不是尼龙夹克：一九三八年的棉军装、
    // 绑腿、粗布褂子都是**厚而干的织物**，尼龙那条一开口就是化纤的「唰」。
    // 位置钉死不走自动挑法 —— 衣物摩擦是连续的，没有起音点可挑（实测 20 s 里
    // 自动挑法只认出五处，还都挑在拉链上）。
    cuts: [
      { cue: "clothMove", exactAtS: 1.077, tail: 0.50, gain: 0.70, fadeInS: 0.02, fadeOutS: 0.14, alignDbfs: -25 },
      { cue: "clothMove", exactAtS: 9.617, tail: 0.50, gain: 0.70, fadeInS: 0.02, fadeOutS: 0.14, append: true, alignDbfs: -25 },
      { cue: "clothMove", exactAtS: 15.951, tail: 0.50, gain: 0.70, fadeInS: 0.02, fadeOutS: 0.14, append: true, alignDbfs: -25 },
    ],
  },
  {
    id: "GearRattle",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Joshua Reinhardt - Ultimate Cloth and Prop Collection/PR ARMY GEAR ROOM_WALK_C414.mp3",
    credit: "Joshua Reinhardt · 全套军用装具行走时的晃动 · Sonniss GDC 2017",
    license: "sonniss",
    // 冲刺时的装具晃动。素材录的就是**背着整套军用装具走路**：水壶、弹袋、
    // 刺刀鞘、皮带扣一起响，而不是单件金属碰撞 —— 后者听着像有人在摇钥匙。
    cuts: [
      { cue: "gearRattle", exactAtS: 1.188, tail: 0.60, gain: 0.72, fadeInS: 0.02, fadeOutS: 0.16, alignDbfs: -25 },
      { cue: "gearRattle", exactAtS: 2.265, tail: 0.60, gain: 0.72, fadeInS: 0.02, fadeOutS: 0.16, append: true, alignDbfs: -25 },
      { cue: "gearRattle", exactAtS: 4.721, tail: 0.60, gain: 0.72, fadeInS: 0.02, fadeOutS: 0.16, append: true, alignDbfs: -25 },
    ],
  },
  {
    id: "BreathHeavy",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Gamemaster Audio - Punch and Combat Sounds/voice_male_breathing_mask_loop_run_02.mp3",
    credit: "Gamemaster Audio · 男性奔跑时的粗喘（可循环）· Sonniss GDC 2018",
    license: "sonniss",
    // **只有一条**。镜像里成年男性的持续喘息实录就这一个文件（另一条 Funky Rustic
    // 的是女声，Eiravaein 的 ASMR 呼吸录得太轻、抬到 −25 dBFS 会把底噪一起抬起来）。
    // 3.04 s 里四次呼吸（约 0.6 s 一次），首尾各 30 ms 淡入淡出接得上循环。
    // 文件名里的 mask 是录法标注不是面具音色：实测谱心 3200 Hz、无稳态共振峰，
    // 没有防毒面具那种管腔嗡声。**第二条变体是缺口，记在 docs 里。**
    cuts: [{ cue: "breathHeavy", exactAtS: 0.02, tail: 3.00, gain: 0.85, loop: true,
      fadeInS: 0.03, fadeOutS: 0.03, alignDbfs: -25 }],
  },
  {
    id: "BodyLand",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Tovusound - Edward – Foleyart Collection Add-On Extended Footsteps/289_Foley_Footsteps_Rocks_Sneaker_Jump_Land_On_Two_Feet_Close.mp3",
    credit: "Tovusound · 双脚落地（碎石地面，近距离）· Sonniss GDC 2017",
    license: "sonniss",
    // 翻墙跳下来那一下。**双脚同时落地**，不是两步 —— 素材名点明了这件事，
    // 而这正是它与脚步的区别：一记，重，没有第二下。9.7 s 里八次，
    // 每次前面 1 s 干净（实测 quiet 0.000）。
    cuts: [
      { cue: "bodyLand", exactAtS: 2.040, tail: 0.70, gain: 0.80, fadeOutS: 0.22, alignDbfs: -25 },
      { cue: "bodyLand", exactAtS: 5.061, tail: 0.70, gain: 0.80, fadeOutS: 0.22, append: true, alignDbfs: -25 },
    ],
  },

  // --- 手榴弹落地 -----------------------------------------------------------
  // 三条各出自一次不同的金属件落硬地实录。为什么不用同一条素材切三刀：
  // 弹跳是**一整串**（落、弹、再弹、停），一条素材里只有一整串，切开就散了。
  //
  // **淘汰过两条，理由写在这儿别再走回头路。** 第一版用的是 Airborne 的钢筋落水泥地
  // 与 Sounds Great 的金属管落地：两条的贴图上都是**整条横着的谐波梯**（钢筋 5426 Hz、
  // 管子 2929 Hz，比邻域高 33 / 31 dB），听感是「一根钢筋在响」「一根管子在响」——
  // 细长中空的东西会唱，手榴弹是个几百克的实心疙瘩，落地只该「咚」一下带一串跳。
  // 判据就用这个：**谐波梯超过邻域 22 dB 的一律不要**。
  {
    id: "GrenadeBounceCarMetal",
    item: "sonniss-gdc-2015-game-audio-bundle-normalized",
    path: "Coll Anderson - Car Destruction/EFX EXT Metal Impact Drop 01 A.mp3",
    credit: "Coll Anderson · 金属件落地弹跳（户外实录）· Sonniss GDC 2015",
    license: "sonniss",
    // 一整串真的弹跳：实测 0.005 / 0.321 / 0.722 / 1.118 s 四下，峰值 0.29→0.06
    // 逐次衰减 —— 落、弹、再弹、停。户外录的，没有房间残响要跟我们自己那层打架。
    cuts: [{ cue: "grenadeBounce", exactAtS: 0.005, tail: 1.30, gain: 0.80,
      fadeOutS: 0.30, alignDbfs: -25 }],
  },
  {
    id: "GrenadeBounceWeightPlate",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Christophe Davaille – The Gym - Sounds Of Bodybuilding/TG_Weight Metal Plate 10kg_Dropped_01.mp3",
    credit: "Christophe Davaille · 十公斤铸铁片落地 · Sonniss GDC 2018",
    license: "sonniss",
    // 第二个变体：**落地就死**的那一种（实测降 20 dB 只要 0.05 s、谱心 1376 Hz、
    // >4 kHz 占 10 %）。一块实心铸铁砸在硬地上不会唱 —— 这正是上面淘汰钢筋和管子
    // 之后要找的那个质地。取 14.30 s 那一下（全条最响，前面 2.8 s 干净）。
    cuts: [{ cue: "grenadeBounce", exactAtS: 14.302, tail: 0.55, gain: 0.80,
      fadeOutS: 0.18, append: true, alignDbfs: -25 }],
  },
  {
    id: "GrenadeBounceCan",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "Sound Ex Machina - Rolling Objects/Aluminum can rolling and bouncing on concrete.mp3",
    credit: "Sound Ex Machina · 金属罐在水泥地上弹跳 · Sonniss GDC 2019",
    license: "sonniss",
    // 第三个变体：更轻、更脆的一串。取 0.727 s 那一段（连着三下，前后都干净）。
    cuts: [{ cue: "grenadeBounce", exactAtS: 0.727, tail: 0.60, gain: 0.78,
      fadeOutS: 0.18, append: true, alignDbfs: -25 }],
  },
  {
    id: "GrenadeRoll",
    item: "sonniss-gdc-2019-game-audio-bundle-normalized",
    path: "Sound Ex Machina - Rolling Objects/Metallic ball rolling on concrete 02.mp3",
    credit: "Sound Ex Machina · 金属球在水泥地上滚动 · Sonniss GDC 2019",
    license: "sonniss",
    // 滚动。取 0.551 s 起 1.8 s —— 那一段是纯滚动（实测降 20 dB 要 1.20 s，
    // 中间没有撞击冲头），玩家听到它的意思是「那颗弹还在往我这边来」。
    cuts: [{ cue: "grenadeRoll", exactAtS: 0.551, tail: 1.80, gain: 0.75,
      fadeInS: 0.03, fadeOutS: 0.30, alignDbfs: -25 }],
  },

  // --- 炸后碎屑；近中远爆炸使用下方 SeedAudio 成品登记 -----------------------
  {
    id: "DebrisFallStone",
    item: "game-audio-monthly",
    path: "Sonniss.com - Game Audio Monthy - #2/Bluezone-Bomb-Blast-Explosion-and-Debris-Sound-Elements/Bluezone-BC0197-falling-stone-debris-032.mp3",
    credit: "Bluezone Corporation · 爆炸后落下的碎石 · Sonniss Game Audio Monthly #2",
    license: "sonniss",
    // 爆完之后天上掉下来的东西。这个库整库都是「炸完之后」，三条一石一铁一混合，
    // 接线时按落点材质挑（带 position 播，空气低通由引擎按距离算）。
    cuts: [{ cue: "debrisFall", tail: 2.20, gain: 0.78, whole: true, fadeOutS: 0.4, alignDbfs: -25 }],
  },
  {
    id: "DebrisFallMetal",
    item: "game-audio-monthly",
    path: "Sonniss.com - Game Audio Monthy - #2/Bluezone-Bomb-Blast-Explosion-and-Debris-Sound-Elements/Bluezone-BC0197-falling-metal-debris-018.mp3",
    credit: "Bluezone Corporation · 爆炸后落下的金属碎片 · Sonniss Game Audio Monthly #2",
    license: "sonniss",
    cuts: [{ cue: "debrisFall", tail: 2.20, gain: 0.78, whole: true, fadeOutS: 0.4,
      append: true, alignDbfs: -25 }],
  },
  {
    id: "DebrisFallRubble",
    item: "game-audio-monthly",
    path: "Sonniss.com - Game Audio Monthy - #2/Bluezone-Bomb-Blast-Explosion-and-Debris-Sound-Elements/Bluezone-BC0197-mixed-falling-rubble-explosion-impact-007.mp3",
    credit: "Bluezone Corporation · 爆炸后混合瓦砾落地 · Sonniss Game Audio Monthly #2",
    license: "sonniss",
    cuts: [{ cue: "debrisFall", tail: 2.40, gain: 0.78, whole: true, fadeOutS: 0.5,
      append: true, alignDbfs: -25 }],
  },

  // --- 火 -------------------------------------------------------------------
  {
    id: "FireSpot",
    item: "sonniss-gdc-2018-game-audio-bundle-normalized",
    path: "Pole Position - The Burning House Library/Burning_House_t4_Fire_low_intensity_with_crackling_MKH8060.mp3",
    credit: "Pole Position Production · 房屋燃烧（低强度、带噼啪）· Sonniss GDC 2018",
    license: "sonniss",
    // 近处的火堆。选「烧房子」而不是「篝火」：这一关烧的是民房的檩条门板，
    // 篝火那条素材里有柴堆塌陷和松枝爆裂，是野营的声音不是城里的。
    // 取哪一段按 docs 的老规矩 ——「找最无聊的一段」：全条 93.8 s 按 0.1 s 一格量
    // 十秒滑窗，46.5 s 起那一窗电平方差 1.66 dB（全条最小），十秒里没有一次塌陷。
    // 两头各 20 ms 淡入淡出：循环用的床两头都不能长，长了每圈一个坑。
    cuts: [{ cue: "fireSpot", exactAtS: 46.50, tail: 10.00, gain: 0.85, loop: true,
      fadeInS: 0.02, fadeOutS: 0.02, alignDbfs: -25 }],
  },

  // --- 弹着：石头 -----------------------------------------------------------
  // 城墙、石板与门礅。与已有的 `impactBrick`（青砖碎裂）分开：砖是会碎的，
  // 石头是会崩一小片然后余下一记闷响。
  {
    id: "ImpactStoneBullet",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "Olivier Girardot - Hand Guns Sound Effects Pack/Bullet rock Impact 4.mp3",
    credit: "Olivier Girardot · 子弹打在石头上 · Sonniss GDC 2020",
    license: "sonniss",
    // 全批唯一一条名字里同时有「子弹」和「石头」的实录，第一变体理所当然是它。
    cuts: [{ cue: "impactStone", exactAtS: 0.005, tail: 0.45, gain: 0.86,
      fadeOutS: 0.15, alignDbfs: -25 }],
  },
  {
    id: "ImpactStoneRocky53",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "PMSFX - Rocky Impacts/PM_RI_Source_53 Rocks Impact Hit Single Stone.mp3",
    credit: "PMSFX · 单块石头受击 · Sonniss GDC 2020",
    license: "sonniss",
    // 素材里 0.251 s 处还有第二下，tail 只留 0.24 s 把它挡在外面 ——
    // 弹着是一记，不是两记。
    cuts: [{ cue: "impactStone", exactAtS: 0.005, tail: 0.24, gain: 0.86,
      fadeOutS: 0.09, append: true, alignDbfs: -25 }],
  },
  {
    id: "ImpactStoneRocky92",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "PMSFX - Rocky Impacts/PM_RI_Source_92 Rocks Impact Hit Single Stone.mp3",
    credit: "PMSFX · 单块石头受击（更闷）· Sonniss GDC 2020",
    license: "sonniss",
    // 第三条，谱心 2279 Hz —— 与前两条（2410 / 3016）拉开一档，三条一亮一中一闷。
    cuts: [{ cue: "impactStone", exactAtS: 0.005, tail: 0.42, gain: 0.86,
      fadeOutS: 0.14, append: true, alignDbfs: -25 }],
  },

  // --- 机械音补变体 ---------------------------------------------------------
  {
    id: "BoltCycleM38",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "Pole Position - Mosin-Nagant M38 bolt-action rifle/M38, Handling, Various, t2, 1m, Above, Right, MKH8060.mp3",
    credit: "Pole Position Production · 莫辛纳甘 M38 拉栓 · Sonniss GDC 2020",
    license: "sonniss",
    // `bolt` 的第二个变体。与 `_01`（M1903A3）一样是旋转后拉枪机、同一家厂商的
    // handling 录法。素材里每次拉栓是**间隔 0.25 s 的一对**（开、闭），
    // 12.90 s 那一对前后各有 3 s 干净 —— 一整个循环切在一条里才是「拉了一下栓」。
    cuts: [{ cue: "bolt", exactAtS: 12.90, tail: 0.85, gain: 0.95, hp: 180,
      append: true, alignDbfs: -25 }],
  },
  {
    id: "StripperLoadK98kSecond",
    item: "sonniss-gdc-2020-game-audio-bundle-normalized",
    path: "Pole Position - Mauser Karabiner 98 kurz K98k bolt-action rifle/K98k, Handling, Various, t2, 1m, Right, MKH8060.mp3",
    credit: "Pole Position Production · K98k 操作音（同一条素材的另一个动作）· Sonniss GDC 2020",
    license: "sonniss",
    // `stripperLoad` 的第二个变体：**同一支枪、同一次录音的另一个动作**，
    // 这是本批最理想的那种变体来源。`_01` 落在 2.00 s，这条落在 4.95 s
    //（实测峰值 0.073、前面 0.5 s 干净）。压弹每关要响几十次，独苗一定露馅。
    cuts: [{ cue: "stripperLoad", exactAtS: 4.95, tail: 1.10, gain: 0.92,
      append: true, alignDbfs: -25 }],
  },

  // --- 真枪实录：汉阳造 / 三八大盖（2026-09-08）------------------------------
  // 许可见 SFX_LICENSES.refvideo —— **这两组不是免版税的**，成品发布前要还账。
  //
  // 两条都不走 archive.org：素材是从参考视频里剪出来的本地 wav，靠 `local` 字段
  // 指到 `_raw/` 下的固定文件名（`Script_SfxBake` 对 local 组不下载、缺文件就报出处）。
  // 选段与切点是量出来的，不是听感挑的：
  //   · 两条视频整片先过一遍包络＋频谱，**汉阳造那条全程铺 BGM**，只有原片
  //     1:13—1:42 这 28 s 音乐停了是实拍原声，五发单发间隔 4.4—6.0 s（拉栓的节奏）；
  //   · 三八大盖取原片 0:59—1:04。
  {
    id: "RifleNraHanyangzaoLive",
    local: "RifleNraHanyangzaoLive.wav",
    source: "B 站 BV1GMojB3EFP 原片 1:13—1:42（音乐停的那段）→ 48 kHz PCM",
    credit: "汉阳造 88 式步枪实弹射击 · 参考视频实录",
    license: "refvideo",
    bitrate: BITRATE_TRANSIENT,
    // **汉阳造就是 Gew 88 的中国版**，这条是它本身，不需要任何折算 —— 现有 `_01`—`_04`
    // 是 K98k 顶的。实测五发谱心 1493—1630 Hz、>4 kHz 占 2.2—3.0 %：高频占比与在用的
    // K98k 变体（2.0—2.4 %）同档，谱心高一档，两边轮播不会听成两支枪。
    // 起音到峰值只有 0.5—3 ms，起音前底噪 0.0000—0.0002（原片这一段几乎没有环境声），
    // 所以落刀统一取实测起音点前 4 ms，冲头一点不切。
    // 只取五发里的三发：现有 cue 已有四个变体，再加满五个会让这一条素材压过其他来源。
    cuts: [
      { cue: "rifleNra", exactAtS: 8.046, tail: 1.30, gain: 0.94, append: true, alignDbfs: -25 },
      { cue: "rifleNra", exactAtS: 18.012, tail: 1.30, gain: 0.94, append: true, alignDbfs: -25 },
      { cue: "rifleNra", exactAtS: 23.449, tail: 1.30, gain: 0.94, append: true, alignDbfs: -25 },
    ],
  },
  {
    id: "RifleIjaType38Live",
    local: "RifleIjaType38Live.wav",
    source: "B 站 BV1cG411m7Vz 原片 0:59—1:04 → 44.1 kHz PCM",
    credit: "三八式步枪（三八大盖，有盖版）实弹射击 · 参考视频实录",
    license: "refvideo",
    bitrate: BITRATE_TRANSIENT,
    // 三八式本身，替掉 `.30-06 升调 10 %` 那条折算。一条素材出两个 cue，因为
    // 这 5 s 里两样都在。**分辨用的是低频占比，不是谱心**——谱心在这里会骗人：
    // 削顶会造出大量高次谐波，把谱心和 >4 kHz 占比一起抬上去，看着就像金属声。
    // 低频不会：枪口爆音是炸开的空气，必然压着一大块 <500 Hz，机械撞击没有。
    //   · 0.25—0.95 s：<500 Hz 占 65.9 %、>4 kHz 占 6.8 %，零削顶采样 —— 枪声，
    //     与在用的 rifleIja 变体（谱心 536—634 Hz / >4 kHz 1.1—1.8 %）同档；
    //   · 2.60—3.30 s：<500 Hz 只占 4.1 %、>4 kHz 占 74.2 %，且全段只有 1 个采样
    //     触满刻度（所以那 74 % 是真内容，不是削顶伪影）—— **枪机动作**，进 bolt。
    // 枪机那条落刀取 2.795 而不是最响的那一记（2.906）：频谱图上 2.81—3.11 s 是
    // 一整串撞击（开栓、抽壳、抛壳、推弹、闭锁），从最响处下刀会把开栓切掉，
    // 听着就成了「半个动作」。tail 0.85 正好盖到序列末尾。
    // 不如汉阳造那组干净的地方如实记下：原片这一段底噪高一档（起音前 0.011 / 0.027，
    // 汉阳造是 0.0000），且 AAC 把 14.7 kHz 以上切光了。要换素材先换这一组。
    // 同段另外两记（1.98 s / 2.29 s）不取：间隔 0.31 s，栓动枪不可能，是回声或邻位串音。
    cuts: [
      { cue: "rifleIja", exactAtS: 0.326, tail: 1.05, gain: 0.92, append: true, alignDbfs: -25 },
      { cue: "bolt", exactAtS: 2.795, tail: 0.85, gain: 0.95, hp: 180, append: true, alignDbfs: -25 },
    ],
  },
];

export default SFX_SOURCES;
