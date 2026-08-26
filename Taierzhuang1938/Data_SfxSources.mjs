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
//   decay 衰减时长硬筛（挡掉 0.05 秒的咔哒声冒充落地声）；tone 顺便量基频。
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
};

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
    id: "ExplosionUrban",
    item: "sonniss-gdc-2023-game-audio-bundle-normalized",
    path: "BluezoneCorp - Detonation - Explosion/Bluezone_BC0277_explosion_urban_004_02.mp3",
    credit: "Bluezone Corporation · 城区爆炸 · Sonniss GDC 2023",
    license: "sonniss",
    // 城区版而不是旷野版：这场仗打在滕县城里，冲击之后应该有墙面反射与碎砖。
    cuts: [{ cue: "explosionNear", tail: 2.4, gain: 0.97, whole: true }],
  },
  {
    id: "ExplosionFar",
    item: "sonniss-gdc-2017-game-audio-bundle-normalized",
    path: "Gamemaster Audio -  Explosion Sound Pack/explosion_far_distant_02.mp3",
    credit: "Gamemaster Audio · 远处爆炸 · Sonniss GDC 2017",
    license: "sonniss",
    cuts: [{ cue: "explosionFar", tail: 2.6, gain: 0.7, whole: true, lp: 2200 }],
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
    id: "MortarExplosion",
    item: "sonniss-gdc-2015-game-audio-bundle-normalized",
    path: "Coll Anderson - Guns/EFX EXT Mortar Explosion 08.mp3",
    credit: "Coll Anderson · 野外迫击炮爆炸实录 · Sonniss GDC 2015",
    license: "sonniss",
    cuts: [{ cue: "shellImpact", tail: 2.8, gain: 0.95, whole: true }],
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
];

export default SFX_SOURCES;
