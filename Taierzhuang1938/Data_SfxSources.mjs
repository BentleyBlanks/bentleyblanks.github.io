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

  // =========================================================================
  // 任务流程重制 · 音效缺口批 A2（2026-08-28）
  //
  // 下面这些组全部带 `pending: true`：素材已经烘好、响度也按 −25 dBFS 对齐过了，
  // 但 `Script_Audio.RECIPES` 里还没有同名的合成配方 —— `LoadSfxPack` 对没有同名
  // 配方的 cue 是**直接抛错**的（「没有同名配方，盖不上去」），放进 manifest.cues
  // 会让每次开机多出十几条 sfxErrors，并把 AudioTest 的三条计数断言一起顶红。
  // 所以它们落在 `manifest.pendingCues`：文件在仓库里、清单里有账、运行时看不见。
  // **集成批补完配方后，把这些组的 `pending: true` 删掉重烘即可**（顺带 bump
  // Script_AudioTest 的 RECIPE_COUNT，并给 SAMPLE_MIX / SAMPLE_WET / NODE_COST 加行）。
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
    pending: true,
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
];

export default SFX_SOURCES;
