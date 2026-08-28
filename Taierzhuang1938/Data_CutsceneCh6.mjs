// Data_CutsceneCh6.mjs — 终章｜最后一封 的三场过场。规格：docs/Data_MissionRemake.md §7 与 §10.1。
//
// **纯数据，不许 import three。** 被 Data_TengxianScript.mjs 汇总进 CUTSCENES，
// Script_Cutscene.mjs 是唯一消费者；字段说明见 Data_TengxianScript.mjs「过场」一节
// 与 docs/Data_CutsceneRedo.md（§1 引擎契约）。
//
// ─────────────────────────────────────────────────────────────────────────────
// 三场与时长（§7「过场动画（固定镜头合计 ≤35 秒）」）
//
//   CS_Ch6_LastWire  最后电报确认   12.2 s   参谋复诵 → 王铭章追问 →「那就发」
//   CS_Ch6_Xiguan    西关殉国       11.0 s   侧面机枪 → 中弹 → 前移数步 → 地面视角 → 黑出
//   CS_Ch6_Epilogue  尾声           11.8 s   黑屏 → 极简地图＋三行字幕 → 电流声变车轮声
//                                   ------
//                                   35.0 s
//
// ★ 策划案自身的算术是矛盾的：§7 的小节标题写「固定镜头合计 ≤35 秒」，正文三条却写
//   「约 12 秒 / 约 20 秒 / 约 8 秒」＝ 40 秒。**本批取 ≤35 秒这条硬上限**，把差额
//   按「哪一段被文字量卡死」分摊：
//     · 尾声压不下去 —— 三行字幕逐字用策划案，最长那行 27 字，按字数规则（每字 0.22 s
//       ＋1.2 s）至少要 7.14 s 才读得完，再加「《滕县保卫战》完」的 2.96 s 与黑屏引子，
//       11.8 s 已经是**下限**，不是设计余量；
//     · 最后电报确认同理 —— 复诵那句 15 字要 4.5 s，四句台词的字数下限加起来 11.4 s；
//     · 于是只能压西关殉国。压它的代价最小，因为 §7 对这一段的要求本来就是
//       「不用慢动作、不虚构遗言、不长特写、不骤停音效」—— 短促本身就是这一段的写法。
//   要恢复「20 秒的殉国」，就得把 35 秒的上限抬到 40 秒；那是策划案要拍板的事，不是本批。
//
// ─────────────────────────────────────────────────────────────────────────────
// ★ 这两场目前**播不出来**（登记在 Data_MissionCh6.mjs 的 ENGINE_REQUEST 第 6 条）
//
//   Script_Main 只在关卡边界播 phase.cutsceneIn / phase.cutsceneOut，关内没有触发口。
//   CS_Ch6_Epilogue 挂在 CHAPTER.cutsceneOut 上，正片里会播；
//   CS_Ch6_LastWire 与 CS_Ch6_Xiguan 要等 beat 级 `{ type:"cutscene", id }`。
//   在那之前这两段戏在 Data_MissionCh6.beats 里有完整的第一人称版本（标了
//   dupOfCutscene），玩家不会漏掉「决以死拼」与地面视角四要素；接上以后把那几条 beats
//   删掉，改成 cutscene beat。预览入口：`?preview=CS_Ch6_LastWire` / `?preview=CS_Ch6_Xiguan`。
//
// ─────────────────────────────────────────────────────────────────────────────
// ★ 从旧过场继承了什么（允许抄改，**不许编辑那两个旧文件**）
//
//   继承自 Data_CutsceneLastWire（CS_LastWire，37.8 s）：
//     · 整间土坯屋的做法 —— 一个 inside:true 的大盒子当屋子（相机任何一镜都看不见屋外）、
//       另铺一块 plane 当地面、三根房梁、北墙窗纸与地图纸、东墙木门、条凳与电池箱；
//     · 八仙桌 + 四条腿 + 电台木壳/面板/刻度盘/两粒旋钮 + 电键（木底座 + 黄铜杆）+ 电文纸；
//     · 「电台读得出是电台」那几条踩坑经验：旋钮必须有、电键底座不能黑上加黑、
//       纯色盒子 roughness 要拉满否则灯光反成白灯箱；
//     · 电键声拿 grenadePin 顶（引擎没有专用电键音）；
//     · 史源口径：短句「决心死拼，以报国家」是**主流记载**、长版未见原件影印、
//       「铣」＝韵目代日十六日、用字各版本不一（死拼／死拚）、forbiddenLines 里的
//       「本日已无友军枪声」。
//   改了什么：
//     · **时辰从夜改到午后**（§7 把最后电报放在十七日午后）：油灯主光换成北墙窗纸的天光
//       ＋梁下一盏马灯补光，火苗 flicker 只留在马灯上；
//     · **人换了**：赵渭滨与报务员换成通信参谋（canmou）与画外的小秦；玩家就是小秦，
//       所以**全场没有小秦这个演员** —— 三镜都是他站在桌南的视点（等于第一人称锁定机位），
//       这样既不违反「玩家亲手发报不切三人称」，也不用给玩家自己一张脸；
//     · **戏改了**：旧版是「怎么写→就一句→没有了，发→敲键→砸电台」；新版是
//       「参谋复诵→师长追问电台还能不能发→还能发→那就发」，砸电台不在这一场
//       （通信组销毁器材挪进关内的 cipherDisposal）；
//     · 长版电文的小字压成一行（旧版三行小字要 5.8 s，这一场没有那个预算），
//       余下的版本差异全部进 skipCard。
//
//   继承自 Data_CutsceneWangMingzhang（CS_WangMingzhang，47.6 s）：
//     · **红线与它的理由**：按阵亡演，不许改回举枪自尽；画面上不许出现任何一帧枪口
//       对着自己；王铭章 weapon:null；不给日兵的脸；兵对官「师长」不许「师座」；
//     · 中弹→跪倒（kneel）→第二梭子→dead:true 从当前胯高起倒的那一套姿态时序；
//     · 卫士「架人」用 reach + melee（引擎做不了双人接触，手到位、身体贴近取其意）；
//     · 街口瓦砾要两块错开叠、rx 给到 ±0.12 以上，否则平板 GroundRubble 读成铺路石板；
//     · 并列史源的 epilogueCard（殉国地点两说、时间三说、史源层累与家属否认）。
//   改了什么：
//     · **地点从城中心十字街口挪到西关电灯厂附近**（§7 指定）。旧版把戏放在十字街口，
//       是取 1938 电讯与墓志的「城内督战」说；本章取的是另一说 ——「缒城后奔车站，
//       刚到西关电灯厂附近被西城门楼上的日兵发现遭扫射」。两说仍在 epilogueCard 里并列，
//       只是这一版**演的是西关那一说**；
//     · **不给机枪一个演员**。旧版镜 2 是望远镜反打，月台上摆了机枪手剪影；§7 要的是
//       「侧面机枪突然开火」—— 突然的意思是**没人看见它**。这一版全程不切到机枪，
//       只有弹着、震感与 type92 的声音，机位始终朝西背着城墙。少一个演员，也少一次
//       「日兵的脸」的风险；
//     · **主视点换人**：旧版是第三人称拍王铭章；这一版三镜都是小秦的眼睛（他是玩家），
//       所以他自己不出演员，第二轮把他打倒之后镜头直接落到 0.31 m 的地面视角；
//     · **删掉全部王铭章台词**。旧版给了他四句（「我看得见」「不要管我……守住城」等）；
//       §7 明写「不虚构遗言」，所以这一场他一个字都不说，连中弹的闷哼都不给 ——
//       一声闷哼也是遗言的替身。全场只剩参谋的一句「师长——！」与画外的呼叫；
//     · **不用慢动作、不长特写、不骤停音效**：三镜 3.4 / 2.4 / 5.2 s，最长的一镜是
//       地面视角，尘土与远处的呼叫照常在响，末尾 4.2 s 黑出。
//
// ─────────────────────────────────────────────────────────────────────────────
// ★ 坐标与地面（西关那一场是 standalone:false，直接用 Data_Tengxian 的世界坐标）
//
//   电灯厂 WEST_SUBURB.powerPlant = (-410, 69)，w40 d28，烟囱 22 m；厂墙半宽/半深
//   22.5 / 16.5 → 院墙 x∈[-432.5,-387.5]、z∈[52.5,85.5]，厂门开在北面 (-412, 52.5)。
//   西关南铺院四块（Data_WestSuburbBlocks）占 z∈[7,38]，电灯厂地块从 z=44 起 ——
//   **中间 z∈[38,44] 是一条东西向的巷子**，往东一直通到护城河外岸的空地。
//   这一场就发生在巷口与厂门之间那块空场（z≈41—46, x≈-401—-405）：
//     · 通信组沿巷子往西走，到厂门口左转（朝南）——**转过去的那一瞬，左肋正对巷口**；
//     · 机枪在东边城墙上，沿 z≈41 那条巷子的轴线打过来 —— 一百米，无遮挡；
//     · 「电灯厂在西城楼直瞄射程内」是主流记载（Data_Tengxian.PRESUMED.powerPlantSize
//       与 Script_Landmark_PowerPlant 头注），空间关系不是编的。
//   地面高度：西关整条带被 Script_TengxianCity.OUTER_PADS 与 WEST_SUBURB_BLOCKS 的垫地
//   找平到 **y = 0**（实算 x∈[-416,-340], z∈[40,50] 全区 pad=1.00），演员 pos 的 y 直接给 0，
//   不是濠外原野的 −1.2。改机位前先复算这一条。
//
// ★ lookPitch 的符号（最后一电那场连栽三轮，抄在这里）：**正 = 抬头，负 = 低头**。
//   低头看电文纸／看地上的人一律给负值。写成正的就是全场抬下巴，背影镜里等于给脸。
// ─────────────────────────────────────────────────────────────────────────────

// 屋子：x ∈ [-3, 3]，z ∈ [-2.5, 2.5]，高 3.2。北墙 z=-2.5（窗、地图），东墙 x=3（门）。
// 八仙桌桌面 y=0.83，中心 (0.0, -1.0)；电台与马灯在桌西北角，电键在桌南缘 ——
// 电键是玩家（小秦）等一下要用的那一具，这一场没人碰它。
const TABLE = { x: 0.0, z: -1.0, top: 0.83 };

// 西关那一场的三个锚点（世界坐标）。改一个就要三处一起改，所以提出来。
const WANG_DOWN = [-403.15, 0, 42.72];    // 王铭章中弹跪倒处（巷口正对的那一点）
const MG_LANE_Z = 40.6;                   // 机枪弹道所在的巷子轴线 z（巷子 z∈[38,44]）

// ===========================================================================
// 一 · 最后电报确认（约 12 秒 → 12.2 s）
// ===========================================================================
export const CS_Ch6_LastWire = {
  id: "CS_Ch6_LastWire",
  title: "最后电报确认",
  seconds: 12.2,
  // 真正的挂点是关内的 event:WireConfirm（见 Data_MissionCh6.EVENTS 与 ENGINE_REQUEST 6）。
  // trigger 写 afterLevel 是为了出图脚本能建对脚下那一关的场（Script_CutsceneShot 只认
  // beforeLevel/afterLevel 两种写法）；本场是 standalone，脚下是哪一片其实不影响画面。
  trigger: "afterLevel:CH6_Zuihou",
  hookAt: "event:WireSent 之前，四问问完的那一拍（Data_MissionCh6.EVENTS）",
  sky: "burningStreet",
  fadeIn: 0.5,
  standalone: true,
  // 独立布景：离城心 ≥1800 m（切比雪夫距离），1700 m 内铺着真地形会和自己的地面打架。
  // 各场错开：CS_LastWire 在 [-2400,2400]、CS_Ch4 在 [-2800,2800]、本场 [2800,2800]。
  setOrigin: [2800, 0, 2800],
  why: "全章的转轴。玩家（小秦）站在桌南，亲耳听见参谋把最后一封电报逐字复诵一遍，"
    + "再听见师长确认「那就发」。这一句听清楚了，下一段亲手敲电键才有分量。",
  presumed: [
    { id: "ch6HqRoom", value: "城内临时师部作战室为一间正房：八仙桌、一部电台、一具电键、北墙一张地图",
      note: "师部迁入城内后的具体位置与陈设无载，布景为推定（与 CS_LastWire 的 lastWireRoom 同源，时辰改午后）" },
    { id: "ch6WireHour", value: "最后一电的发出时刻无载，本章取十七日午后",
      note: "长版落款「叩铣」＝十六日，与十七日殉国不矛盾（电报可先发）；具体时刻与屋内光线为推定" },
    { id: "ch6WireRecite", value: "参谋逐字复诵电文为演出安排",
      note: "复诵这一动作本身无载，是为了让玩家听清电文而设的桥段；电文文本按主流记载" },
  ],
  props: [
    // ── 屋子本体：一个大盒子翻成 BackSide，六面砖；地面另铺一块 plane ──
    // 墙用砖不用 Adobe：Adobe 一张 1.6 m，在 3 m 高的屋里裂纹大得像鹅卵石（CS_LastWire 的教训）。
    { kind: "box", size: [6.0, 3.2, 5.0], pos: [0, 1.6, 0], mat: "BrickWall", tint: 0x9c9283, roughness: 0.96, inside: true, name: "屋子" },
    { kind: "plane", size: [6.0, 5.0], pos: [0, 0.012, 0], mat: "Ground", name: "屋内地面" },
    { kind: "box", size: [0.18, 0.20, 5.0], pos: [-1.8, 2.98, 0], mat: "WoodBeam", name: "房梁西" },
    { kind: "box", size: [0.18, 0.20, 5.0], pos: [0.2, 2.98, 0], mat: "WoodBeam", name: "房梁中" },
    { kind: "box", size: [0.18, 0.20, 5.0], pos: [2.2, 2.98, 0], mat: "WoodBeam", name: "房梁东" },
    // 北墙的窗纸。午后：外面是烧着的街，天光透过纸进来 —— 这一场的**主光**挂在它身上
    //（旧版是夜、主光是桌上的油灯；换到白天就得换光源，不然屋里还是一盏灯的夜景）。
    { kind: "box", size: [0.90, 0.80, 0.03], pos: [-1.7, 1.65, -2.47], color: 0x8c8168, emissive: 0x3a2f1c,
      light: { color: 0xffe2b4, intensity: 5.2, distance: 11.0, offsetY: 0.05 }, name: "窗纸" },
    // 地图纸：摆进光圈的亮区，roughness 拉满（纯色盒子默认 0.5 的高光会把它反成白灯箱）。
    { kind: "box", size: [1.20, 0.90, 0.02], pos: [0.45, 1.70, -2.48], color: 0x5c5646, roughness: 1.0, name: "地图" },
    { kind: "box", size: [0.05, 2.05, 0.95], pos: [2.96, 1.03, 0.9], mat: "WoodDoor", name: "木门" },
    // ── 八仙桌 ──
    { kind: "box", size: [1.10, 0.05, 1.10], pos: [TABLE.x, TABLE.top - 0.025, TABLE.z], color: 0x4a3a28, roughness: 0.9, name: "八仙桌" },
    { kind: "box", size: [0.08, 0.805, 0.08], pos: [TABLE.x - 0.50, 0.4025, TABLE.z - 0.50], color: 0x3d3122, name: "桌腿1" },
    { kind: "box", size: [0.08, 0.805, 0.08], pos: [TABLE.x + 0.50, 0.4025, TABLE.z - 0.50], color: 0x3d3122, name: "桌腿2" },
    { kind: "box", size: [0.08, 0.805, 0.08], pos: [TABLE.x - 0.50, 0.4025, TABLE.z + 0.50], color: 0x3d3122, name: "桌腿3" },
    { kind: "box", size: [0.08, 0.805, 0.08], pos: [TABLE.x + 0.50, 0.4025, TABLE.z + 0.50], color: 0x3d3122, name: "桌腿4" },
    // ── 电台：木壳 + 黑面板 + 刻度盘 + 两粒旋钮（没有旋钮它从任何机位看都只是个木盒）──
    { kind: "box", size: [0.46, 0.28, 0.30], pos: [-0.35, TABLE.top + 0.14, -1.30], color: 0x7a6242, roughness: 0.95, name: "电台木壳" },
    { kind: "box", size: [0.40, 0.20, 0.02], pos: [-0.35, TABLE.top + 0.15, -1.14], color: 0x3a3531, name: "电台面板" },
    { kind: "box", size: [0.05, 0.05, 0.015], pos: [-0.43, TABLE.top + 0.19, -1.128], color: 0x8a6a30, emissive: 0x6a4a18, name: "刻度盘" },
    { kind: "cyl", size: [0.024, 0.02], pos: [-0.27, TABLE.top + 0.11, -1.12], rx: 1.5708, color: 0x9a9080, roughness: 0.6, name: "旋钮1" },
    { kind: "cyl", size: [0.024, 0.02], pos: [-0.17, TABLE.top + 0.11, -1.12], rx: 1.5708, color: 0x9a9080, roughness: 0.6, name: "旋钮2" },
    // ── 电键：桌南缘，玩家等一下要用的就是它。底座别黑上加黑，铜杆给一点高光 ──
    { kind: "box", size: [0.10, 0.025, 0.07], pos: [0.42, TABLE.top + 0.0125, -0.55], color: 0x54432e, roughness: 0.8, name: "电键" },
    { kind: "box", size: [0.02, 0.02, 0.07], pos: [0.42, TABLE.top + 0.035, -0.53], color: 0xa08a50, roughness: 0.45, name: "电键杆" },
    // ── 参谋手里那张电文纸 + 桌上摊着的报码纸 ──
    { kind: "box", size: [0.22, 0.008, 0.30], pos: [-0.42, TABLE.top + 0.004, -0.80], color: 0xa89e8a, name: "电文纸" },
    { kind: "box", size: [0.26, 0.006, 0.20], pos: [0.10, TABLE.top + 0.004, -0.62], ry: 0.18, color: 0x9e948a, name: "报码纸" },
    // 梁下一盏马灯：午后屋里仍然暗，天光进不到桌面这一侧。flicker 留在它身上。
    { kind: "cyl", size: [0.06, 0.20], pos: [0.9, 2.45, -0.6], color: 0x3a3430, emissive: 0x8a6a38,
      light: { color: 0xffc890, intensity: 5.0, distance: 10.0, offsetY: -0.04, flicker: 0.10 }, name: "马灯" },
    { kind: "box", size: [1.20, 0.06, 0.26], pos: [-2.2, 0.45, 1.6], mat: "WoodStock", name: "条凳面" },
    { kind: "box", size: [0.06, 0.42, 0.26], pos: [-2.72, 0.21, 1.6], mat: "WoodStock", name: "条凳腿1" },
    { kind: "box", size: [0.06, 0.42, 0.26], pos: [-1.68, 0.21, 1.6], mat: "WoodStock", name: "条凳腿2" },
    { kind: "box", size: [0.55, 0.38, 0.40], pos: [2.4, 0.19, -2.1], mat: "WoodStock", name: "电池箱" },
  ],
  cast: [
    // 通信参谋：桌西侧，双手执电文纸（reach 0.32），低头念。
    // ry -0.73 让他身子朝着桌西北角的电台 —— 对桌南的机位是**侧影**，不是正脸。
    // ★ 每一帧把所有数值字段写全：SampleTrack 对缺省字段按 0 插值，
    //   少写一个 reach 就是 0.6 s 里两只手自己放下来。
    { id: "canmou", kind: "nraOfficer", weapon: null, seed: "ch6Canmou", track: [
      { t: 0.0, pos: [-1.15, 0, -0.40], ry: -0.73, state: { moveSpeed: 0, crouch: 0.10, reach: 0.32, melee: 0, lookPitch: -0.55, lookYaw: 0 } },
      { t: 4.6, pos: [-1.15, 0, -0.40], ry: -0.73, state: { moveSpeed: 0, crouch: 0.10, reach: 0.32, melee: 0, lookPitch: -0.55, lookYaw: 0 } },
      // 念完，纸放低一点、头抬起来一点 —— 师长要问话了
      { t: 5.2, pos: [-1.15, 0, -0.40], ry: -0.73, state: { moveSpeed: 0, crouch: 0.06, reach: 0.20, melee: 0, lookPitch: -0.30, lookYaw: -0.22 } },
      { t: 8.2, pos: [-1.15, 0, -0.40], ry: -0.73, state: { moveSpeed: 0, crouch: 0.06, reach: 0.20, melee: 0, lookPitch: -0.30, lookYaw: -0.22 } },
      // 「还能发。」说完低回纸上
      { t: 8.9, pos: [-1.15, 0, -0.40], ry: -0.73, state: { moveSpeed: 0, crouch: 0.10, reach: 0.30, melee: 0, lookPitch: -0.48, lookYaw: 0 } },
      { t: 12.2, pos: [-1.15, 0, -0.40], ry: -0.73, state: { moveSpeed: 0, crouch: 0.10, reach: 0.30, melee: 0, lookPitch: -0.48, lookYaw: 0 } },
    ] },
    // 王铭章：桌东侧，面朝西北（电台那一头）。ry 1.394 让他对桌南的机位是**侧后影**。
    // 全场不转身、不面对镜头；weapon:null（红线：画面上不许出现任何一帧枪口对着自己）。
    { id: "wangmingzhang", kind: "nraOfficer", weapon: null, seed: "ch6Wang", track: [
      { t: 0.0, pos: [1.05, 0, -1.05], ry: 1.394, state: { moveSpeed: 0, crouch: 0, reach: 0, melee: 0, lookPitch: -0.12, lookYaw: 0 } },
      { t: 4.9, pos: [1.05, 0, -1.05], ry: 1.394, state: { moveSpeed: 0, crouch: 0, reach: 0, melee: 0, lookPitch: -0.12, lookYaw: 0 } },
      // 「电台还能发不？」—— 抬头看电台那一头
      { t: 5.4, pos: [1.05, 0, -1.05], ry: 1.394, state: { moveSpeed: 0, crouch: 0, reach: 0, melee: 0, lookPitch: 0.02, lookYaw: 0 } },
      { t: 8.6, pos: [1.05, 0, -1.05], ry: 1.394, state: { moveSpeed: 0, crouch: 0, reach: 0, melee: 0, lookPitch: 0.02, lookYaw: 0 } },
      // 「那就发。」—— 说完低下头，看的是桌上的电键，不是人
      { t: 9.4, pos: [1.05, 0, -1.05], ry: 1.394, state: { moveSpeed: 0, crouch: 0, reach: 0, melee: 0, lookPitch: -0.22, lookYaw: 0 } },
      { t: 12.2, pos: [1.05, 0, -1.05], ry: 1.394, state: { moveSpeed: 0, crouch: 0, reach: 0, melee: 0, lookPitch: -0.22, lookYaw: 0 } },
    ] },
  ],
  shots: [
    {
      n: 1, seconds: 4.9, focalMm: 40,
      note: "小秦的视点（站在桌南 1.6 m 眼高，全场三镜同一个立足点 —— 玩家自己不出演员）："
        + "看向桌西侧的参谋与他手里的电文纸。参谋侧影、低头逐字念。窗纸的天光从画面左后来，"
        + "桌上是电台与摊着的报码纸。这一镜要的就是「听清楚」，不做运动、不切近景",
      camera: { from: [0.55, 1.62, 0.80], look: [-1.12, 1.10, -0.44], shake: 0.05 },
      sfx: [
        { at: 0.35, name: "explosionFar", volume: 0.26 },
        { at: 3.10, name: "explosionFar", volume: 0.20 },
      ],
      // 电文按策划案逐字：「决以死拼，以报国家，以报知遇。」（15 字 → 至少 4.5 s）
      // tier 主流 —— 短句是主流记载，原件未见公布，不上「信史」。
      lines: [{ at: 0.20, seconds: 4.60, who: "canmou", tier: "主流", text: "决以死拼，以报国家，以报知遇。" }],
      // §1.8 之后字幕层抬高一档，台词与小字同屏不再压字。版本差异的其余部分进 skipCard。
      subs: [{ at: 0.20, seconds: 4.40, tier: "主流", small: true, text: "「铣」为韵目代日，即十六日。" }],
    },
    {
      n: 2, seconds: 2.9, focalMm: 40,
      note: "同一立足点转向桌东侧的王铭章：看到的是他的右后肩与侧影（他面朝西北的电台），"
        + "不给正脸。他抬头问电台还能不能发 —— 问的是机器，不是人",
      camera: { from: [0.55, 1.62, 0.80], look: [1.02, 1.28, -1.02], shake: 0.05 },
      lines: [{ at: 0.05, seconds: 2.80, who: "wangmingzhang", tier: "虚构", text: "电台还能发不？" }],
    },
    {
      n: 3, seconds: 4.4, focalMm: 35,
      note: "退开半步的两人中景（还是小秦的视点）：画左是执纸的参谋，画右是王铭章的侧背，"
        + "当中是桌上的电台与电键。参谋答「还能发。」，师长说「那就发。」，然后低头看电键 ——"
        + "下一秒要按那把电键的人就是拿着这个视点的玩家",
      camera: { from: [0.60, 1.60, 0.95], look: [-0.05, 0.98, -1.05], shake: 0.06 },
      sfx: [
        { at: 1.20, name: "explosionFar", volume: 0.24 },
        { at: 3.60, name: "grenadePin", volume: 0.10 },
        { at: 3.78, name: "grenadePin", volume: 0.10 },
      ],
      lines: [
        { at: 0.10, seconds: 2.10, who: "canmou", tier: "虚构", text: "还能发。" },
        { at: 2.30, seconds: 2.10, who: "wangmingzhang", tier: "虚构", text: "那就发。" },
      ],
    },
  ],
  skipCard: {
    title: "最后电报确认",
    lines: [
      { tier: "主流", text: "王铭章自滕县发出最后一电，核心为「决心死拼，以报国家」（亦作「决以死拚以报国家」）。" },
      { tier: "主流", text: "长版另作：「职忆委座成仁之训，及开封面谕嘉慰之词，决心死拼，以报国家，以报知遇。职王铭章叩铣。」「铣」为电报韵目代日，即十六日 —— 韵目日期是十六日，与十七日殉国不矛盾（电报可先发）。" },
      { tier: "主流", text: "电文原件未见公布，短句与长版都靠转引，用字各版本不一致（死拼／死拚）。" },
      { tier: "主流", text: "另有记载称，发完此电后下令砸毁电台。本章把销毁器材放在通信组转移那一段，不放在这一镜。" },
    ],
  },
  // 近年文章引述的「本日已无友军枪声」一句未见出处，属流传待考，**本作不采用**。
  forbiddenLines: ["本日已无友军枪声", "师座", "同志们"],
};

// ===========================================================================
// 二 · 西关殉国（约 20 秒 → 压到 11.0 s，理由见文件头）
// ===========================================================================
export const CS_Ch6_Xiguan = {
  id: "CS_Ch6_Xiguan",
  title: "西关殉国",
  seconds: 11.0,
  trigger: "afterLevel:CH6_Zuihou",
  hookAt: "event:FlankMg（进 C6_PowerPlant 之后，Data_MissionCh6.EVENTS）",
  // sky 不给：沿用 CH6 的 burningStreet（过场自己再套一遍会重烘天空，开头闪一块黑盘）。
  standalone: false,
  setOrigin: [0, 0, 0],
  why: "不是英雄谢幕，是一支部队在离城门一百米的地方失去指挥的那十一秒。"
    + "玩家一直在自己的眼睛里：走着、被打倒、脸贴在地上看见剩下的人还在做该做的事。",

  // =======================================================================
  // ★★★ 红线（照抄 CS_WangMingzhang，理由不许简化）★★★
  //
  //   按阵亡演，不许改回举枪自尽。自尽说**不是电影编的** —— 它恰恰是 1938 年
  //   3 月 21 日中央社电讯的最早版本，1986 年《血战台儿庄》承袭的正是这个口径。
  //   所以「自尽说是后人杜撰」这个理由是**错的**，不许拿它当依据。
  //   本作取中弹一说，依据是史源层累里更晚、但更硬的三层：1938 年 11 月墓志已把
  //   「自戕」改口为「负伤仍指挥杀敌，身中数弹」；1983 年起张宣武回忆记为缒城后
  //   城外中弹；2009 年起家属公开否认自杀说。
  //
  //   **画面上不许出现任何一帧枪口对着自己。** 王铭章 weapon:null。
  //   机枪**不给演员**：全场机位朝西背着城墙，只有弹着、震感与 type92 的声音 ——
  //   §7 要的是「侧面机枪突然开火」，突然的意思就是没人看见它。顺带也就不存在
  //   「日兵的脸」这个风险。
  //   称谓：兵对官「师长」，不许「师座」。**不给王铭章任何一句台词，也不给闷哼**
  //   —— §7 明写不虚构遗言，一声闷哼也是遗言的替身。
  // =======================================================================

  // 镜界（累计秒）：
  //   镜1 0–3.4    巷子往西走 → 到厂门口左转朝南 → 0.95 s 机枪从东边巷口打过来，
  //                王铭章与身边的人中弹；参谋喊「师长——！」
  //   镜2 3.4–5.8  小秦往前走两步（相机推进 1.7 m、压低）→ 第二轮扫过来 → 镜头落地
  //   镜3 5.8–11.0 地面视角（0.31 m）：随从跪在师长身侧拽他、文书把文件箱压在身子底下、
  //                画外远处还在呼叫师部；4.2 s 起黑出
  props: [
    // 巷口这一带的瓦砾：三月十七日全天炮击，关厢一样是塌下来的砖石。
    // 每堆两块错开叠着、rx 给到 ±0.12 以上 —— 水平的 GroundRubble 平板远看是铺路石板。
    { kind: "box", size: [2.4, 0.28, 1.7], pos: [-400.6, 0.10, 45.4], ry: 0.22, rx: 0.13, mat: "GroundRubble", name: "瓦砾南底" },
    { kind: "box", size: [1.3, 0.40, 0.95], pos: [-400.9, 0.29, 45.2], ry: -0.48, rx: 0.24, mat: "BrickWallSooty", name: "瓦砾南顶" },
    { kind: "box", size: [1.9, 0.26, 1.4], pos: [-405.8, 0.08, 40.7], ry: -0.36, rx: -0.12, mat: "GroundRubble", name: "瓦砾北底" },
    { kind: "box", size: [0.7, 0.26, 0.55], pos: [-405.6, 0.28, 40.6], ry: 0.62, rx: 0.20, mat: "BrickWallSooty", name: "瓦砾北顶" },
    // 电灯厂的一根倒下的线杆（厂区本来就有一列输电杆，朝城门方向拉线）
    { kind: "box", size: [0.16, 0.16, 4.4], pos: [-406.9, 0.09, 44.6], ry: 1.02, rx: 0.05, mat: "WoodBeam", name: "倒线杆" },
    // 文书护着的那只文件箱 —— 地面视角四要素之二，必须是画面里认得出的一件东西
    { kind: "box", size: [0.52, 0.32, 0.34], pos: [-402.62, 0.16, 44.02], ry: 0.24, mat: "WoodStock", name: "文件箱" },
    // 掉在地上的报码纸：地面视角里离镜头最近的一件小东西，也是「电报已经发出去了」的物证
    { kind: "box", size: [0.20, 0.005, 0.28], pos: [-401.95, 0.012, 43.02], ry: -0.55, color: 0xa89e8a, roughness: 1.0, name: "报码纸" },
  ],

  cast: [
    // 王铭章。nraOfficer：武装带 + 枪套 + 皮鞋，**不背枪**（weapon:null）。
    // Actor 正面是局部 -Z；ry = atan2(-dx,-dz) 面朝 (dx,dz)。1.5708 = 朝 -X（西，沿巷子）。
    // 到厂门口转朝南（+z）走 —— **转过去的那一瞬左肋正对东边的巷口**，机枪就是这时候响的。
    { id: "wangmingzhang", kind: "nraOfficer", weapon: null, seed: "ch6WangXg", track: [
      { t: 0.0, pos: [-402.30, 0, 42.55], ry: 1.5708, state: { moveSpeed: 0.22, crouch: 0, kneel: 0, hurt: 0, dying: 0, lookPitch: 0, lookYaw: 0 } },
      // 0.51 m / 0.55 s = 0.93 m/s ≈ moveSpeed 0.22 × 4.2 ✓
      { t: 0.55, pos: [-402.81, 0, 42.55], ry: 1.5708, state: { moveSpeed: 0.22, crouch: 0, kneel: 0, hurt: 0, dying: 0, lookPitch: 0, lookYaw: 0 } },
      // 左转朝厂门（南）：0.38 m / 0.40 s = 0.95 m/s ✓
      { t: 0.95, pos: [-403.15, 0, 42.72], ry: 2.20, state: { moveSpeed: 0, crouch: 0, kneel: 0, hurt: 1.0, dying: 0, lookPitch: 0, lookYaw: 0 } },
      // 中弹踉跄 → 双膝跪倒（kneel 是 §1.7 的新姿态：胯落到大腿长、小腿平铺贴地，
      // 真跪不是深蹲）。脚下不再移动 —— moveSpeed 0 的帧位置必须一致，否则 lint 报「被拖着走」。
      { t: 1.45, pos: WANG_DOWN, ry: 2.20, state: { moveSpeed: 0, crouch: 0, kneel: 0.50, hurt: 0.70, dying: 0, lookPitch: -0.10, lookYaw: 0 } },
      { t: 2.10, pos: WANG_DOWN, ry: 2.20, state: { moveSpeed: 0, crouch: 0, kneel: 0.95, hurt: 0.35, dying: 0, lookPitch: -0.28, lookYaw: 0 } },
      { t: 4.35, pos: WANG_DOWN, ry: 2.20, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, hurt: 0.15, dying: 0, lookPitch: -0.34, lookYaw: 0 } },
      // 第二轮（镜 2 内 0.95 s = 全局 4.35）
      { t: 4.55, pos: WANG_DOWN, ry: 2.20, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, hurt: 0.80, dying: 0, lookPitch: -0.30, lookYaw: 0 } },
      // dead:true 从**当前胯高**起倒（§1.7）：跪着的人直接从跪姿往前扑，不会先弹起来。
      // dead 之后的帧照样把 kneel 写满 —— 缺省成 0 就是「死前 0.2 s 先站起来」。
      { t: 4.85, pos: WANG_DOWN, ry: 2.20, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, hurt: 0, dying: 1.0, lookPitch: -0.30, lookYaw: 0, dead: true } },
      { t: 11.0, pos: WANG_DOWN, ry: 2.20, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, hurt: 0, dying: 1.0, lookPitch: -0.30, lookYaw: 0, dead: true } },
    ] },

    // 通信参谋：走在师长右后。第一轮之后扑过去，第二轮把他也打倒（趴着，没死）。
    // 全场唯一一句台词「师长——！」。
    { id: "canmou", kind: "nraOfficer", weapon: null, seed: "ch6CanmouXg", track: [
      { t: 0.0, pos: [-401.60, 0, 41.60], ry: 1.5708, state: { moveSpeed: 0.22, crouch: 0, kneel: 0, prone: 0, reach: 0, melee: 0, hurt: 0, dying: 0, lookPitch: 0, lookYaw: 0 } },
      // 0.88 m / 0.95 s = 0.93 m/s ✓
      { t: 0.95, pos: [-402.48, 0, 41.60], ry: 1.5708, state: { moveSpeed: 0.22, crouch: 0, kneel: 0, prone: 0, reach: 0, melee: 0, hurt: 0, dying: 0, lookPitch: 0, lookYaw: 0 } },
      // ★ 「停下」必须**边减速边还在走**：lint 拿上一帧的 moveSpeed 反推该走多远，
      //   上一帧 moveSpeed>0 而这一帧位置不动就是「原地踏步」。所以收脚那 0.2 s 里
      //   仍然按 0.92 m/s 往前挪 0.18 m，moveSpeed 在这一帧才归零（CS_WangMingzhang 的做法）。
      { t: 1.15, pos: [-402.66, 0, 41.60], ry: 1.5708, state: { moveSpeed: 0, crouch: 0.25, kneel: 0, prone: 0, reach: 0, melee: 0, hurt: 0, dying: 0, lookPitch: -0.15, lookYaw: 0 } },
      // 转向倒下的师长（(-403.15,42.72) 对他是西偏南）：ry = atan2(0.67, -1.12) ≈ 2.60。
      // 0.78 m / 0.85 s = 0.92 m/s ≈ moveSpeed 0.24 × 4.2 ✓
      { t: 1.35, pos: [-402.66, 0, 41.60], ry: 2.60, state: { moveSpeed: 0.24, crouch: 0.25, kneel: 0, prone: 0, reach: 0, melee: 0, hurt: 0, dying: 0, lookPitch: -0.15, lookYaw: 0 } },
      { t: 2.20, pos: [-403.00, 0, 42.30], ry: 2.60, state: { moveSpeed: 0, crouch: 0.75, kneel: 0, prone: 0, reach: 0.60, melee: 0.25, hurt: 0, dying: 0, lookPitch: -0.80, lookYaw: 0 } },
      { t: 4.35, pos: [-403.00, 0, 42.30], ry: 2.60, state: { moveSpeed: 0, crouch: 0.75, kneel: 0, prone: 0, reach: 0.60, melee: 0.25, hurt: 0, dying: 0, lookPitch: -0.80, lookYaw: 0 } },
      // 第二轮：他也挂了彩，趴下去（不给 dead：这一场只有师长是确定阵亡的那一个）
      { t: 4.55, pos: [-403.00, 0, 42.30], ry: 2.60, state: { moveSpeed: 0, crouch: 0.45, kneel: 0, prone: 0.40, reach: 0.40, melee: 0, hurt: 1.0, dying: 0.2, lookPitch: -0.70, lookYaw: 0 } },
      { t: 5.10, pos: [-403.00, 0, 42.30], ry: 2.60, state: { moveSpeed: 0, crouch: 0, kneel: 0, prone: 1.0, reach: 0.30, melee: 0, hurt: 0.4, dying: 0.7, lookPitch: -0.95, lookYaw: 0 } },
      { t: 11.0, pos: [-403.00, 0, 42.30], ry: 2.60, state: { moveSpeed: 0, crouch: 0, kneel: 0, prone: 1.0, reach: 0.30, melee: 0, hurt: 0.4, dying: 0.7, lookPitch: -0.95, lookYaw: 0 } },
    ] },

    // 随从：地面视角四要素之一 —— **拖师长的那个人**。
    // 「架人/拖人」用 §1.7 的 reach（空手双手往前下方伸）+ melee（叠上去当一下一下地拽）；
    // 真正的双人接触引擎还做不了，手到位、身体贴近取其意（CS_WangMingzhang 的做法）。
    // 他没有被打倒 —— 有人还在做该做的事，是这一段要留给玩家的东西。
    { id: "suicong", kind: "nra", weapon: null, seed: "ch6Suicong", track: [
      { t: 0.0, pos: [-401.90, 0, 43.40], ry: 1.5708, state: { moveSpeed: 0.22, crouch: 0, kneel: 0, reach: 0, melee: 0, dying: 0, lookPitch: 0, lookYaw: 0 } },
      // 0.92 m / 1.0 s = 0.92 m/s ✓
      { t: 1.00, pos: [-402.82, 0, 43.40], ry: 1.5708, state: { moveSpeed: 0.22, crouch: 0, kneel: 0, reach: 0, melee: 0, dying: 0, lookPitch: 0, lookYaw: 0 } },
      // 收脚那 0.15 s 仍按 0.92 m/s 往前挪 0.14 m（见 canmou 轨道上的★），再起步扑过去：
      // 0.73 m / 0.60 s = 1.22 m/s ≈ moveSpeed 0.34 × 4.2（容差内）
      { t: 1.15, pos: [-402.96, 0, 43.40], ry: 2.35, state: { moveSpeed: 0.34, crouch: 0.10, kneel: 0, reach: 0, melee: 0, dying: 0, lookPitch: -0.20, lookYaw: 0 } },
      { t: 1.75, pos: [-403.60, 0, 43.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0.70, kneel: 0, reach: 0.20, melee: 0, dying: 0, lookPitch: -0.55, lookYaw: 0 } },
      // 跪到师长身侧，双手搭上去往后拽
      { t: 2.05, pos: [-403.60, 0, 43.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, reach: 0.85, melee: 0.30, dying: 0, lookPitch: -0.95, lookYaw: 0 } },
      { t: 3.00, pos: [-403.60, 0, 43.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, reach: 0.95, melee: 0.70, dying: 0, lookPitch: -0.90, lookYaw: 0 } },
      { t: 3.60, pos: [-403.60, 0, 43.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, reach: 0.85, melee: 0.30, dying: 0, lookPitch: -0.95, lookYaw: 0 } },
      { t: 4.20, pos: [-403.60, 0, 43.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, reach: 0.95, melee: 0.70, dying: 0, lookPitch: -0.90, lookYaw: 0 } },
      // 第二轮扫过来：头压到最低，手没松
      { t: 4.55, pos: [-403.60, 0, 43.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, reach: 0.85, melee: 0.20, dying: 0, lookPitch: -1.05, lookYaw: 0 } },
      { t: 6.60, pos: [-403.60, 0, 43.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, reach: 0.90, melee: 0.35, dying: 0, lookPitch: -1.00, lookYaw: 0 } },
      { t: 7.60, pos: [-403.60, 0, 43.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, reach: 0.98, melee: 0.75, dying: 0, lookPitch: -0.92, lookYaw: 0 } },
      { t: 8.60, pos: [-403.60, 0, 43.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, reach: 0.88, melee: 0.35, dying: 0, lookPitch: -1.00, lookYaw: 0 } },
      { t: 9.60, pos: [-403.60, 0, 43.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, reach: 0.98, melee: 0.72, dying: 0, lookPitch: -0.92, lookYaw: 0 } },
      { t: 11.0, pos: [-403.60, 0, 43.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, reach: 0.90, melee: 0.40, dying: 0, lookPitch: -0.98, lookYaw: 0 } },
    ] },

    // 文书：地面视角四要素之二 —— **把文件箱压在自己身子底下的那个人**。
    // 通信组带出来的东西比人重要，这是他们这一路一直在做的事，不用一句台词解释。
    { id: "wenshu", kind: "nra", weapon: null, seed: "ch6Wenshu", track: [
      { t: 0.0, pos: [-401.20, 0, 43.95], ry: 1.5708, state: { moveSpeed: 0.22, crouch: 0, prone: 0, reach: 0.35, melee: 0, dying: 0, lookPitch: -0.10, lookYaw: 0 } },
      // 0.88 m / 0.95 s = 0.93 m/s ✓
      { t: 0.95, pos: [-402.08, 0, 43.95], ry: 1.5708, state: { moveSpeed: 0.22, crouch: 0, prone: 0, reach: 0.35, melee: 0, dying: 0, lookPitch: -0.10, lookYaw: 0 } },
      // 收脚那 0.10 s 仍按 0.92 m/s 挪 0.09 m（见 canmou 轨道上的★），再抢两步扑倒：
      // 0.43 m / 0.30 s = 1.43 m/s ≈ moveSpeed 0.41 × 4.2（容差内）
      { t: 1.05, pos: [-402.17, 0, 43.95], ry: 1.90, state: { moveSpeed: 0.41, crouch: 0.30, prone: 0, reach: 0.35, melee: 0, dying: 0, lookPitch: -0.35, lookYaw: 0 } },
      { t: 1.35, pos: [-402.60, 0, 43.95], ry: 1.90, state: { moveSpeed: 0, crouch: 0.80, prone: 0.20, reach: 0.45, melee: 0, dying: 0, lookPitch: -0.70, lookYaw: 0 } },
      { t: 1.75, pos: [-402.60, 0, 43.95], ry: 1.90, state: { moveSpeed: 0, crouch: 0, prone: 1.0, reach: 0.55, melee: 0, dying: 0, lookPitch: -0.95, lookYaw: 0 } },
      { t: 11.0, pos: [-402.60, 0, 43.95], ry: 1.90, state: { moveSpeed: 0, crouch: 0, prone: 1.0, reach: 0.55, melee: 0, dying: 0, lookPitch: -0.95, lookYaw: 0 } },
    ] },
  ],

  shots: [
    {
      n: 1, seconds: 3.4, focalMm: 35,
      note: "小秦的视点（1.62 m 眼高，跟在通信组后面）：巷子往西，前头是师长与参谋、随从、"
        + "抱着文件箱的文书；再往前是电灯厂的厂墙与二十二米的烟囱。走了不到一秒，"
        + "机枪从**身后东边的巷口**沿巷子轴线打过来 —— 镜头始终朝西，全场不切到机枪。"
        + "弹着落在他们脚下与厂墙上，师长与身边的人中弹",
      camera: { from: [-399.60, 1.62, 42.50], look: [-403.40, 1.25, 43.10], shake: 0.12 },
      // 弹着：沿巷子轴线（z≈40.6）扫过来，落点由东往西推。y 压在 0.2—0.35 的地面高度。
      flash: [
        { at: 0.95, pos: [-401.10, 0.28, 41.30], seconds: 0.08, size: 0.45 },
        { at: 1.00, pos: [-402.20, 0.26, 41.80], seconds: 0.08, size: 0.40 },
        { at: 1.05, pos: [-403.00, 0.30, 42.30], seconds: 0.08, size: 0.42 },
        { at: 1.10, pos: [-404.40, 0.24, 42.90], seconds: 0.08, size: 0.36 },
        { at: 1.55, pos: [-405.60, 0.26, 41.10], seconds: 0.08, size: 0.40 },
        { at: 1.60, pos: [-406.80, 0.30, 41.60], seconds: 0.08, size: 0.36 },
      ],
      shakeAt: [{ at: 0.95, seconds: 0.45, amount: 0.40 }, { at: 1.55, seconds: 0.30, amount: 0.22 }],
      sfx: [
        { at: 0.15, name: "footstepDirt", volume: 0.34 },
        { at: 0.62, name: "footstepDirt", volume: 0.34 },
        { at: 0.95, name: "type92", volume: 0.72 },
        { at: 1.02, name: "impactFlesh", volume: 0.50 },
        { at: 1.08, name: "impactDirt", volume: 0.46 },
        { at: 1.16, name: "impactBrick", volume: 0.44 },
        { at: 1.55, name: "type92", volume: 0.60 },
        { at: 1.70, name: "impactDirt", volume: 0.40 },
        { at: 2.05, name: "bodyFall", volume: 0.40 },
      ],
      // 5 字 → 至少 2.3 s。这句会跨进镜 2 的头 0.25 s（台词槽不随换镜清掉），镜 2 没有台词。
      lines: [{ at: 1.35, seconds: 2.30, who: "canmou", tier: "虚构", text: "师长——！" }],
    },
    {
      n: 2, seconds: 2.4, focalMm: 40,
      note: "小秦往前走两步（相机 2.4 s 推进 1.7 m ≈ 0.71 m/s，边走边压低）：跪倒的师长、"
        + "扑过去的随从、趴在文件箱上的文书都在前方两三米。走到一半第二轮扫过来 —— "
        + "他也中了。**不做慢动作、不做主观模糊**，就是走着走着画面到了地上",
      camera: {
        from: [-399.90, 1.60, 42.70], to: [-401.60, 1.06, 43.00],
        look: [-403.60, 1.05, 43.10], lookTo: [-403.80, 0.72, 43.20],
        ease: "easeOut", shake: 0.22,
      },
      flash: [
        { at: 0.95, pos: [-402.40, 0.28, 41.90], seconds: 0.08, size: 0.44 },
        { at: 1.00, pos: [-403.30, 0.26, 42.40], seconds: 0.08, size: 0.40 },
        { at: 1.06, pos: [-404.60, 0.30, 43.00], seconds: 0.08, size: 0.38 },
      ],
      shakeAt: [{ at: 0.95, seconds: 0.55, amount: 0.55 }],
      sfx: [
        { at: 0.20, name: "footstepDirt", volume: 0.32 },
        { at: 0.66, name: "footstepDirt", volume: 0.32 },
        { at: 0.95, name: "type92", volume: 0.75 },
        { at: 1.04, name: "impactFlesh", volume: 0.55 },
        { at: 1.12, name: "impactDirt", volume: 0.48 },
        { at: 1.26, name: "impactDirt", volume: 0.42 },
        { at: 1.90, name: "bodyFall", volume: 0.52 },
      ],
    },
    {
      n: 3, seconds: 5.2, focalMm: 24,
      note: "地面视角（0.31 m，机位就是小秦的脸贴在地上的位置，24 mm 拿得下侧边的人）。"
        + "四要素同框：① 随从跪在师长身侧、双手搭在他身上一下一下往后拽；"
        + "② 画右近处文书趴在文件箱上；③ 画外远处还有人在呼叫师部；"
        + "④ 镜头最近处地上那张报码纸 —— 电报已经发出去了。"
        + "机位一动不动，尘土落下来，末尾黑出。不给特写、不停音效",
      camera: { from: [-401.30, 0.31, 43.30], look: [-403.45, 0.50, 43.30], shake: 0.06 },
      sfx: [
        { at: 0.20, name: "explosionFar", volume: 0.30 },
        { at: 1.10, name: "type92", volume: 0.22 },
        { at: 2.60, name: "impactDirt", volume: 0.20 },
        { at: 3.40, name: "rifleNraFar", volume: 0.26 },
        { at: 4.30, name: "explosionFar", volume: 0.24 },
      ],
      // 8 字 → 至少 2.96 s。线的那一头不晓得师部已经没有了。
      lines: [{ at: 0.90, seconds: 3.00, who: "yuanhu", off: true, tier: "虚构", text: "师部！师部回话！" }],
      blackOutAt: 4.20,
    },
  ],

  // 黑场装不下并列史源 —— 走「补出卡片」，与跳过卡同一套 UI。
  // 史实信息不许因为镜头时长不够而丢失（这一场只有 11 秒，更要靠它）。
  epilogueCard: {
    title: "西关殉国",
    lines: [
      { tier: "信史", text: "第一二二师师长王铭章，殉国。" },
      { tier: "主流", text: "殉国地点两说：城中心十字街口 ／ 西关电灯厂附近。本章演的是西关这一说 —— 缒城后奔车站，刚到电灯厂附近被西城门楼上的日兵发现遭扫射。" },
      { tier: "主流", text: "时间三说：三月十七日下午三时 ／ 五时 ／ 黄昏。" },
      { tier: "主流", text: "一九三八年三月二十一日中央社电讯记为城内中弹后自戕；同年十一月墓志改记为「负伤仍指挥杀敌，身中数弹」；一九八三年起张宣武回忆记为缒城后于城外中弹。其后人于二〇〇九年公开否认自杀说。本作采中弹一说。" },
      { tier: "信史", text: "一九三八年四月六日国民政府褒扬令：苦守要区，逾三昼夜。" },
      { tier: "主流", small: true, text: "同时殉国：赵渭滨（第 122 师参谋长）、邹绍孟（第 124 师参谋长）、罗甲辛、谢大墉、范承谟；王麟（第 740 团团长，十七日东关方向阵亡）。" },
    ],
  },
  skipCardFrom: "epilogueCard",
  presumed: [
    { id: "ch6XiguanSpot", value: "殉国点取电灯厂厂门外的空场 (-403, 43)，机枪沿 z≈40.6 那条巷子从东面城墙打来",
      note: "「电灯厂附近」是主流记载，**具体落点、巷口位置与机枪位全部是本实现推定**；"
        + "「电灯厂在西城楼直瞄射程内」为主流记载，空间关系不是编的，坐标是编的" },
    { id: "ch6XiguanParty", value: "随行者取通信参谋、随从、抱文件箱的文书各一名",
      note: "王铭章身边随行者的具体人数与身份无载；三人为演出推定，均为虚构人物，"
        + "不对应赵渭滨、邹绍孟、罗甲辛等有名有姓的同时殉国者" },
  ],
  people: {
    // 这一场唯一开口的两个无名者。张宣武回忆里卫士李士昆等两人受伤幸存 ——
    // 这里不给名字，也不把一句虚构台词挂到真人头上。
    suicong: { name: "", short: "随从", real: false, note: "虚构，无名。CS_Ch6_Xiguan 里跪在师长身侧往后拽他的那一个" },
    wenshu: { name: "", short: "文书", real: false, note: "虚构，无名。通信组里抱文件箱的那一个，中弹后仍把箱子压在身子底下" },
    yuanhu: { name: "", short: "画外", real: false, note: "虚构，无名。地面视角里远处还在呼叫师部的声音 —— 线的那一头不晓得师部已经没有了" },
  },
  // 只约束 lines（角色口中的台词）。史源卡片（epilogueCard）可以、也必须引述
  // 「自戕／自杀说」那一层史源 —— 所以这里不写「自戕」「自尽」，免得把补卡打成硬错。
  forbiddenLines: ["举枪自尽", "师座", "同志们"],
};

// ===========================================================================
// 三 · 尾声（约 8 秒 → 11.8 s，字数下限顶上去的，理由见文件头）
// ===========================================================================
export const CS_Ch6_Epilogue = {
  id: "CS_Ch6_Epilogue",
  title: "尾声",
  seconds: 11.8,
  trigger: "afterLevel:CH6_Zuihou",
  sky: "burningStreet",
  standalone: true,
  // 独立布景：离城心 ≥1800 m（切比雪夫距离）。只有一块黑盒子与一张纸，摆哪里都行。
  setOrigin: [2800, 0, -2800],
  why: "黑屏数秒 → 极简地图＋三行字幕 → 发报机电流声渐变序章火车车轮声 →「《滕县保卫战》完」。"
    + "**不出现「胜利」，不放凯旋乐** —— 声音上唯一的动作是把开场那列军列的车轮声还回来。",
  presumed: [
    { id: "ch6EpilogueMap", value: "尾声地图为鲁南极简示意：微山湖、津浦铁路、大运河、三条支流",
      note: "底图 Texture/Tex_PaperEndingMap.png **一个字都没有**，滕县／临城／台儿庄三处节点与"
        + "日军南进箭头由 DOM 层按归一化坐标叠加（见 Texture/PaperProps_README.md）；"
        + "下面 mapCard.markers 的坐标是本实现推定，出图后按画面调" },
  ],
  people: {},
  props: [
    // 一个 inside 的黑盒子：相机在里面，四周永远是黑的，不会露出布景外的虚空。
    { kind: "box", size: [10.0, 6.0, 8.0], pos: [0, 3.0, 0], color: 0x07070a, roughness: 1.0, inside: true, name: "黑盒" },
    // 地图卡：3:2 的一块纸（底图 1536×1024 也是 3:2）。
    // ★ ENGINE_REQUEST 5：props 现在没有 `texture:` 字段。接上之前它退化成一块纸色卡 ——
    //   三行字幕照读，只是没有地形。emissive 让它自己亮，省一盏灯，也不会被 flicker 扫到。
    {
      kind: "box", size: [3.0, 2.0, 0.02], pos: [0, 1.60, -2.0],
      color: 0x6a6455, emissive: 0xbdb298, roughness: 1.0,
      texture: "Texture/Tex_PaperEndingMap.png",
      name: "尾声地图",
    },
    // 一盏补光，摆在相机背后（相机在 z=+0.6 朝 -z 看，这一盏在 z=+1.4，进不了画面）。
    { kind: "cyl", size: [0.015, 0.015], pos: [0, 1.65, 1.40], color: 0x000000,
      light: { color: 0xfff0d8, intensity: 9.0, distance: 9.0, offsetY: 0 }, name: "尾声补光" },
  ],
  cast: [],
  shots: [
    {
      n: 1, seconds: 1.2, focalMm: 35, black: true,
      note: "黑屏。电流声还在响 —— 上一镜的地面视角刚黑出，声音不断",
      camera: { from: [0, 1.6, 0.6], look: [0, 1.6, -2.0] },
      // ★ ENGINE_REQUEST 7：没有「发报机电流底噪」这个音效。电键的「嗒」拿 grenadePin 顶
      //（CS_LastWire 也是这么顶的），电流声这一档只能等新音效。
      sfx: [
        { at: 0.10, name: "grenadePin", volume: 0.09 },
        { at: 0.32, name: "grenadePin", volume: 0.07 },
      ],
    },
    {
      n: 2, seconds: 7.4, focalMm: 35,
      note: "极简地图（正面平拍一张纸，画面里只有它）。三行字幕同屏，字数最长那行 27 字，"
        + "按每字 0.22 s ＋1.2 s 至少要 7.14 s —— 这一镜的 7.4 s 是被它顶出来的，不是设计余量。"
        + "地图上**只**标：滕县、临城、台儿庄、日军南进方向、台儿庄附近增加的中国军队标识；"
        + "**不出现「胜利」，不放凯旋乐**",
      camera: { from: [0, 1.60, 0.60], look: [0, 1.60, -2.0] },
      // ★ ENGINE_REQUEST 5：DOM 层按这张表把标注叠在底图上。
      //   u/v 是底图归一化坐标（左上角为 0,0）；底图是横向的鲁南示意，津浦路纵贯南北。
      mapCard: {
        texture: "Texture/Tex_PaperEndingMap.png",
        markers: [
          { id: "tengxian", label: "滕县", kind: "city", at: [0.52, 0.30], emphasis: true },
          { id: "lincheng", label: "临城", kind: "city", at: [0.50, 0.46] },
          { id: "taierzhuang", label: "台儿庄", kind: "city", at: [0.70, 0.74] },
          { id: "ijaPush", label: "日军南进", kind: "arrow", from: [0.53, 0.17], to: [0.56, 0.60] },
          { id: "nraAssembly", label: "中国军队", kind: "unit", at: [0.75, 0.69] },
        ],
        note: "五处标注，一处不多。地名只三个，箭头只一条，部队标识只一处 —— 「极简」是硬要求",
      },
      // 声音在这一镜里换轨：电流声退掉，序章那列军列的车轮声顶上来。
      // ★ ENGINE_REQUEST 7：没有交叉淡入的接口，这里只能靠 carriageRattle 三下逐级抬音量。
      sfx: [
        { at: 2.20, name: "carriageRattle", volume: 0.16 },
        { at: 4.10, name: "carriageRattle", volume: 0.26 },
        { at: 5.90, name: "carriageRattle", volume: 0.36 },
      ],
      subs: [
        { at: 0.20, seconds: 7.15, tier: "主流", text: "1938年3月17日，王铭章在滕县殉国。" },
        { at: 0.20, seconds: 7.15, tier: "主流", text: "守城部队主力建制瓦解，残余官兵仍在城内继续抵抗。" },
        { at: 0.20, seconds: 7.15, tier: "主流", text: "日军南进受到迟滞，台儿庄方向获得继续集结和布防的时间。" },
      ],
    },
    {
      n: 3, seconds: 3.2, focalMm: 35, black: true, titleCard: true,
      note: "黑场，居中一行。车轮声还在走 —— 序章开头那列军列的声音，最后还给它",
      camera: { from: [0, 1.6, 0.6], look: [0, 1.6, -2.0] },
      sfx: [
        { at: 0.10, name: "carriageRattle", volume: 0.40 },
        { at: 1.60, name: "carriageRattle", volume: 0.34 },
      ],
      subs: [{ at: 0.20, seconds: 3.00, tier: "主流", title: true, text: "《滕县保卫战》完" }],
    },
  ],
  skipCard: {
    title: "尾声",
    lines: [
      { tier: "主流", text: "1938年3月17日，王铭章在滕县殉国。" },
      { tier: "主流", text: "守城部队主力建制瓦解，残余官兵仍在城内继续抵抗。" },
      { tier: "主流", text: "日军南进受到迟滞，台儿庄方向获得继续集结和布防的时间。" },
      { tier: "信史", text: "三月十八日临城陷，二十日韩庄、峄县失守；中方第 31 师（池峰城）三月二十二日进入台儿庄地区布防。" },
      { tier: "主流", small: true, text: "「滕县之守成就台儿庄之捷」出自《李宗仁回忆录》（战后二十余年的追述），档案研究另有反面意见，两说并列。" },
    ],
  },
  forbiddenLines: ["胜利", "大捷", "同志们"],
};

/** 本章过场（按播放顺序）。Data_TengxianScript 汇总时照这个数组展开。 */
export const CH6_CUTSCENES = [CS_Ch6_LastWire, CS_Ch6_Xiguan, CS_Ch6_Epilogue];

export default CH6_CUTSCENES;
