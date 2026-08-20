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
};

const ARCHIVE = "https://archive.org/download/";

/** 把 (item, path) 拼成 archive.org 的直链。 */
export function ArchiveUrl(item, filePath) {
  return ARCHIVE + item + "/" + filePath.split("/").map(encodeURIComponent).join("/");
}

export const AMB_SOURCES = [
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
