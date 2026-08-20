// 《滕县 1938》过场分镜 —— 王铭章殉国（CS_WangMingzhang）。
//
// **纯数据，不许 import three**。被 Data_TengxianScript.mjs 汇总进 CUTSCENES，
// Script_Cutscene.mjs 是唯一消费者；字段说明见 Data_TengxianScript.mjs「过场」一节
// 与 docs/Data_CutsceneRedo.md。
//
// 本场专属的人物表条目写在 people（并进 CAST），本场新引入的推定值写在 presumed
// （并进 PRESUMED_STAGING）—— 五场各自一个文件，是为了能并行改而不互相踩。
//
// 2026-08-20 重做（docs/Data_CutsceneRedo.md §2.4）：旧版八个互不连贯的碎镜
// （街心背影／反打／墙根脚／缒城／土路／准星／空路／黑场）没人看得懂发生了什么，
// 按《血战台儿庄》那一段的节拍重排成一段连贯的戏：
//   城里街口指挥 → 西门楼机枪扫来 → 他喊弟兄们到街口 → 往前走两步中弹 →
//   卫士要背他走、他不肯 → 第二梭子 → 卫士扑上去 → 尘落下来 → 黑场与史源卡。
// 整场都在十字街口西口（L5 的城里实景），不再跳到城墙角和西关土路。
//
// 2026-08-20 返修轮（复审意见逐条）：
//   · 镜 2 反打 135→85 mm 装下整座门楼，月台上摆一个机枪手剪影 + 焰片加大加密；
//   · 镜 5 机位挪到他后侧方、头转向身后的卫士，脸背向镜头；
//   · 镜 4／镜 6 里门楼在画外的焰片删掉（死数据）。
//
// 2026-08-20 第三轮（§1.7 引擎新能力落回数据 + 上一轮 pass 7 的 minor 清单）：
//   · 镜 1 举望远镜改用 state.binoculars（不再只靠 lookPitch 抬头装样子）；
//   · 镜 4/5 跪倒改用 state.kneel（双膝真跪地，不再 crouch+dying 凑深蹲）；
//   · 镜 6 换回 dead:true —— Ragdoll 现在从**当前胯高**起算，跪着的人不会先弹起来；
//   · 卫士甲「架人」改用 reach（双手前伸）+ melee（一下一下拽）；
//   · viewmodel 过场已隐藏：把 look 点推到 45 m 外的 Far() 绕法全部撤掉，look 直接给被摄物；
//   · 镜 2 每发加 shakeAt 震感、焰片 size 放回 1.0—1.6（贴片有径向渐变+HDR 增益了）、
//     枪口焰 y 13.15→12.95 让焰片下半衬在石栏灰砖上而不是全衬天；
//   · 镜 1 加「三月十七日 午后」小字幕 + 街心 44 m 处一只土袋路障盖掉门洞正中的 T 形黑影，
//     并加两簇街面弹着火星（镜 2 的 85 mm 仰角里看不见街面，弹着放在镜 1 里交代）；
//   · 镜 8 加一行「第一二二师师长王铭章殉国」——40 秒里名字得出现在屏幕上；
//   · 镜 3 卫士丙转向西南（脸背向机位，7.8 s 的 3/4 正脸没了）；
//   · 瓦砾北二换 BrickWallSooty 加歪叠一小块、两块底座 rx 加大 —— 不再读成木箱/石板。

/** 镜 2 反打里机枪的射击时刻（镜内秒）。焰片、音效、机枪手的 firing 边沿三处共用这一张表。 */
const MG_BURSTS = [0.4, 0.6, 0.8, 1.0, 1.7, 1.9, 2.1, 2.9, 3.1, 3.3];
// y=12.95：焰片下半衬在月台内沿石栏（顶 12.9）的灰砖上，不再整片衬在亮天里读不出来。
const MG_MUZZLE = [-299.5, 12.95, 0.5];

export const CS_WangMingzhang = {
  id: "CS_WangMingzhang",
  title: "王铭章殉国",
  seconds: 47.6,
  trigger: "afterLevel:L5_Shizijie",
  // sky 不给：沿用 L5 的 burningStreet（过场自己再套一遍会重烘天空，开头闪一块黑盘）。
  // 发生在滕县城里，坐标直接就是 Data_Tengxian 的世界坐标。
  standalone: false,
  setOrigin: [0, 0, 0],
  why: "一个人在街口指挥，机枪从西门楼扫过来，他倒下，弟兄们要背他走，他不肯，再中弹，没了 —— 不是英雄谢幕，是一支部队失去指挥的那一分钟。",

  // =======================================================================
  // ★★★ 红线：按阵亡演，不许改回举枪自尽。★★★
  //
  // 理由要说对，免得以后有人「纠正」回去：
  //
  //   自尽说**不是电影编的**。它恰恰是 1938 年 3 月 21 日中央社电讯的最早版本
  //   （王铭章在城中心十字街指挥中弹、其后自戕），1986 年电影《血战台儿庄》
  //   演城头举枪自戕，承袭的正是这个 1938 年的官方口径。
  //   所以「自尽说是后人杜撰」这个理由是**错的**，不许拿它当依据。
  //
  //   本作取中弹一说，依据是史源层累里更晚、但更硬的三层：
  //     · 1938 年 11 月《王铭章墓志》已把「自戕」改口为「负伤仍指挥杀敌，身中数弹」；
  //     · 1983 年起张宣武（时任 727 团团长、滕县城防司令）回忆记为缒城后城外中弹；
  //     · 2009 年起家属（遗孀叶亚华、三子王道纲等）**公开否认自杀说**，
  //       称血衣拿回时腹部有七个枪眼。
  //   另有姜克实（冈山大学）指出日军打扫战场未发现王铭章尸体，可反证其未死在城内。
  //
  //   一句话：**两说并列时取「家属公开否认 + 1938 年 11 月墓志改口」的那一说。**
  //   不是因为自尽说必假，而是因为写成中弹阵亡在史料上风险最低，
  //   且不与任何一层史源正面冲突。
  //
  //   地点：本作把戏放在**城中心十字街口**（1938 电讯与墓志的「城内督战」说），
  //   「西关电灯厂附近壕沟」那一说在结尾字幕与补卡里并列，不取舍。
  //   旧版演的「缒城 → 西关土路」是张宣武一说的动线，姜克实认为「缒城」细节
  //   是为圆城外说所作的创作性还原 —— 这一版干脆不演它，只在卡片里写。
  //
  //   **画面上不许出现任何一帧枪口对着自己。** 王铭章 weapon:null，手里是望远镜
  //   （state.binoculars 双手举到眼前 + lookPitch 抬头，不给枪）。
  //   机枪只给西门楼上 80 m 外 0.6 m 高的剪影与枪口焰，不给日兵的脸。
  //   称谓：兵对官「师长」，不许「师座」。
  // =======================================================================

  // 镜界（累计秒）：
  //   镜1 0–6       街口：王铭章举望远镜（binoculars）看西门楼，卫士蹲瓦砾后；副官画外喊西门楼丢了
  //   镜2 6–10      反打（望远镜里的景）：机位跳到离西门楼 80 m 处 85 mm 看门楼，月台上机枪手剪影与枪口焰；王铭章「我看得见。」
  //   镜3 10–17.8   越肩看街口：他转身朝弟兄们喊「城还在我们手里」
  //   镜4 17.8–22.8 侧拍：他转回西边往前走两步，一梭子扫来，中弹跪倒（kneel）；卫士扑过来
  //   镜5 22.8–33.6 近景（后侧方）：卫士俯身伸手架他（reach+melee）要背他走，他不肯
  //   镜6 33.6–37.1 第二梭子，dead:true 从跪姿往前扑倒（Ragdoll 从当前胯高起算），卫士扑到他身边跪伏
  //   镜7 37.1–40.6 机位完全不动：尘落下来，只剩卫士伏在他身边
  //   镜8 40.6–47.6 黑场，名字一行 + 两行并列史源字幕
  //
  // 空间：十字街口 (0,0) 30×30 m，西门里街沿 z=0 向西、宽 9 m，西城门楼在 x=-305。
  // 王铭章站在街口西沿 (-13, 0, 0.6)，正好在西门楼→十字街口那条通视走廊里
  //（Data_Tengxian.SIGHT_CORRIDOR 半宽 4.5）—— 机枪能扫到他，这就是这一场的空间前提。
  // 卫士蹲在走廊边上的瓦砾后面。

  // viewmodel 过场已隐藏（§1.7）：look 直接给被摄物，近平面按距离自动收 0.03—1.2 m。

  props: [
    // 街口的瓦砾堆：三月十七日全天炮击，城里到处是塌下来的砖石。每堆两块错开叠着，
    // 免得像一只木箱。尺寸位置推定。
    // rx 都给到 ±0.12 以上：水平的 GroundRubble 平板远看是「铺路石板」，歪了才像塌下来的。
    { kind: "box", size: [2.8, 0.30, 2.0], pos: [-11.2, 0.10, 3.3], ry: 0.25, rx: 0.12, mat: "GroundRubble", name: "瓦砾南底" },
    { kind: "box", size: [1.5, 0.42, 1.1], pos: [-11.5, 0.30, 3.1], ry: -0.5, rx: 0.22, mat: "BrickWallSooty", name: "瓦砾南顶" },
    { kind: "box", size: [1.8, 0.26, 1.3], pos: [-9.4, 0.08, 5.2], ry: -0.4, rx: -0.08, mat: "GroundRubble", name: "瓦砾南二" },
    { kind: "box", size: [2.6, 0.32, 1.9], pos: [-13.5, 0.10, -2.3], ry: -0.2, rx: -0.12, mat: "GroundRubble", name: "瓦砾北底" },
    { kind: "box", size: [1.3, 0.44, 1.0], pos: [-13.8, 0.30, -2.5], ry: 0.6, rx: 0.25, mat: "BrickWallSooty", name: "瓦砾北顶" },
    // 干净的 GroundRubble 单块在镜 4 里读成一只木箱 —— 换烟熏砖、歪着放、上面再叠一小块。
    { kind: "box", size: [1.6, 0.28, 1.2], pos: [-11.6, 0.08, -5.3], ry: 0.9, rx: 0.3, mat: "BrickWallSooty", name: "瓦砾北二" },
    { kind: "box", size: [0.6, 0.25, 0.5], pos: [-11.5, 0.30, -5.2], ry: -0.4, rx: 0.18, mat: "BrickWallSooty", name: "瓦砾北二顶" },
    // 烧塌的屋架：两根檩条倒在街口两侧的地上（别架在堆上 —— 架高了在镜 3/4 里是一根横穿画面的黑杠）。
    { kind: "box", size: [0.18, 0.18, 3.6], pos: [-9.6, 0.30, 6.4], ry: 1.15, rx: 0.12, mat: "WoodBeam", name: "檩条南" },
    { kind: "box", size: [3.0, 0.16, 0.16], pos: [-13.4, 0.08, -4.6], ry: 0.35, mat: "WoodBeam", name: "檩条北" },
    // 街口西沿两只半塌的土袋工事（守军在十字街口收拢时垒的，位置推定）。
    { kind: "box", size: [1.2, 0.45, 0.6], pos: [-15.8, 0.22, 5.2], ry: 0.1, mat: "Sandbag", name: "土袋南" },
    { kind: "box", size: [1.1, 0.42, 0.6], pos: [-15.6, 0.21, -5.0], ry: -0.15, mat: "Sandbag", name: "土袋北" },
    // 倒在街心的一杆步枪（阵亡者留下的）。
    { kind: "box", size: [1.1, 0.05, 0.06], pos: [-9.6, 0.03, 1.9], ry: 0.9, mat: "WoodStock", name: "遗枪" },
    // 街心 44 m 处一道齐胸高的土袋街垒：盖住门洞正中那个 T 形黑影（全街尽头最黑的
    // 一点，视线会被它吸走），门楼仍露在上方。高度必须 > 机位 1.65 m —— 顶低于机位
    // 视平线的东西永远盖不住地平线以上的物件（第一版 0.9 m 就白摆了）。
    // 机枪弹道在 x=-50 处高 2.65 m（门楼 12.95 → 街口胸高的连线），2.2 m 的街垒不挡弹道。
    { kind: "box", size: [3.2, 2.2, 0.9], pos: [-50, 1.1, 0.8], ry: 0.08, mat: "Sandbag", name: "街心街垒" },
  ],

  cast: [
    // 王铭章。nraOfficer：武装带 + 枪套 + 皮鞋，**不背枪**（weapon:null）。
    // 手里是望远镜：state.binoculars 双手举到眼前 + lookPitch 抬头看西门楼，不给枪。
    // Actor 正面是局部 -Z：ry=+π/2 面朝 -X（西，朝西门楼）。
    // 转身一律走**短弧**，所以 ry 会越过 ±π：3.853 ≡ -2.43（朝东南），之后回西写
    // 1.5708 —— 3.853→1.5708 经过 π（朝南）是 131° 的短弧；写成 -2.43→1.5708 就会
    // 绕北面转 229°。线性插值不会自己找短弧，数值得人挑。
    //
    // ★ 每一帧的 state 把所有数值字段写全：SampleTrack 对缺省字段按 0 插值，
    //   少写一个 crouch 就是 0.15 s 里整个人被拉直（上一轮镜 6 的「尸体先站起来」）。
    { id: "wang", kind: "nraOfficer", weapon: null, seed: "wangMz", track: [
      // 镜 1–2：站在街口西沿，双手举着望远镜看西门楼（门楼在 13 m 高、290 m 外，仰角不大）。
      { t: 0.0, pos: [-13.0, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0, binoculars: 1.0, lookPitch: 0.12 } },
      { t: 9.4, pos: [-13.0, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0, binoculars: 1.0, lookPitch: 0.12 } },
      // 放下望远镜，低下头来。
      { t: 10.0, pos: [-13.0, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0, binoculars: 0.0, lookPitch: 0.0 } },
      // 镜 3：经南面转身朝东南（街口里蹲着的散兵在那边），对弟兄们喊。
      { t: 11.2, pos: [-13.0, 0, 0.6], ry: 3.853, state: { moveSpeed: 0, lookYaw: 0.0 } },
      { t: 13.5, pos: [-13.0, 0, 0.6], ry: 3.853, state: { moveSpeed: 0, lookYaw: 0.35 } },
      { t: 16.0, pos: [-13.0, 0, 0.6], ry: 3.853, state: { moveSpeed: 0, lookYaw: -0.4 } },
      { t: 17.4, pos: [-13.0, 0, 0.6], ry: 3.853, state: { moveSpeed: 0, lookYaw: 0.0 } },
      // 镜 4：经南面转回西边，往前走两步。0.2×4.2=0.84 m/s，2 s 走 1.7 m。
      { t: 18.6, pos: [-13.0, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.0 } },
      { t: 19.1, pos: [-13.0, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.2 } },
      { t: 21.1, pos: [-14.7, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.2 } },
      // 一梭子扫来（镜 4 内 3.3 s = 全局 21.1）：中弹踉跄（hurt 拉满）→ 双膝跪倒（kneel，
      // §1.7 新姿态：胯落到大腿长、小腿平铺贴地，真跪不是深蹲）。脚下不再移动。
      { t: 21.25, pos: [-14.82, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.0, hurt: 1.0, kneel: 0.0, lookPitch: 0.0 } },
      { t: 21.7, pos: [-14.75, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.0, hurt: 0.7, kneel: 0.55, lookPitch: -0.05 } },
      { t: 22.4, pos: [-14.7, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.0, hurt: 0.3, kneel: 0.9, lookPitch: -0.15 } },
      { t: 23.0, pos: [-14.7, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.0, hurt: 0.1, kneel: 1.0, lookPitch: -0.3, lookYaw: 0.0 } },
      // 镜 5：跪在地上低着头，卫士甲从背后俯身架着他。说话时头转向身后（北侧）的卫士甲 ——
      // 负的 lookYaw 是朝他右手边（北）转，脸正好背向东南侧的机位。
      { t: 25.6, pos: [-14.7, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.0, hurt: 0.1, kneel: 1.0, lookPitch: -0.35, lookYaw: 0.0 } },
      { t: 27.6, pos: [-14.7, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.0, hurt: 0.1, kneel: 1.0, lookPitch: -0.35, lookYaw: -0.9 } },
      { t: 34.4, pos: [-14.7, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.0, hurt: 0.1, kneel: 1.0, lookPitch: -0.35, lookYaw: -0.6 } },
      // 镜 6：第二梭子（镜内 0.85 s = 全局 34.45）：hurt 一顶，然后 dead:true ——
      // Ragdoll 现在从**当前胯高**起算（§1.7），跪着的人直接从跪姿往前扑倒，不会先弹起来。
      // dead 之后的帧照样把 kneel 写满：34.6→34.9 之间数值仍在插值，kneel 缺省成 0
      // 就是「死前 0.3 s 先站起来」。
      { t: 34.6, pos: [-14.7, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.0, hurt: 0.7, kneel: 1.0, lookPitch: -0.3, lookYaw: -0.2 } },
      { t: 34.9, pos: [-14.7, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.0, hurt: 0.0, kneel: 1.0, lookPitch: -0.3, lookYaw: 0.0, dead: true, dying: 1.0 } },
      { t: 40.6, pos: [-14.7, 0, 0.6], ry: 1.5708, state: { moveSpeed: 0.0, hurt: 0.0, kneel: 1.0, lookPitch: -0.3, lookYaw: 0.0, dead: true, dying: 1.0 } },
    ] },

    // 卫士甲：空着手的那个（史实：三分之一以上无步枪），后面要背师长走的就是他。
    // 蹲在北侧瓦砾后，面朝西。
    // 「架人」用 §1.7 的 reach（空手双手往前下方伸）+ melee（叠上去当一下一下地拽）；
    // 真正的双人接触（手搭在对方身上）引擎还做不了，reach 的手到位、身体贴近取其意。
    { id: "g1", kind: "nra", weapon: null, seed: "guardA", track: [
      { t: 0.0, pos: [-11.7, 0, -1.6], ry: 1.5708, state: { moveSpeed: 0, crouch: 0.9 } },
      { t: 21.3, pos: [-11.7, 0, -1.6], ry: 1.5708, state: { moveSpeed: 0, crouch: 0.9 } },
      // 镜 4：师长中弹，他扑过去。3.04 m / 1.0 s = 3.04 m/s = moveSpeed 0.72。
      { t: 21.5, pos: [-11.7, 0, -1.6], ry: 2.2, state: { moveSpeed: 0.72, crouch: 0.2 } },
      // 停在师长背后（东偏北 0.56 m），面朝西南正对他的背 —— 机位在东南，他的上身从师长右肩后探出来。
      { t: 22.5, pos: [-14.2, 0, 0.35], ry: 2.05, state: { moveSpeed: 0.0, crouch: 0.6, reach: 0.0, melee: 0.0, lookPitch: 0.0 } },
      // 俯身伸手架住他（reach 双手往前下方伸到他肩背，melee 让手一下一下用劲）。
      { t: 22.9, pos: [-14.2, 0, 0.35], ry: 2.05, state: { moveSpeed: 0, crouch: 0.7, reach: 0.85, melee: 0.3, lookPitch: -0.9 } },
      { t: 26.6, pos: [-14.2, 0, 0.35], ry: 2.05, state: { moveSpeed: 0, crouch: 0.7, reach: 0.85, melee: 0.3, lookPitch: -0.9 } },
      // 「师长，我背你走！」—— 直起一点身、手上加劲要把他拽起来，拽不动又俯下去。
      { t: 27.2, pos: [-14.2, 0, 0.35], ry: 2.05, state: { moveSpeed: 0, crouch: 0.45, reach: 0.95, melee: 0.7, lookPitch: -0.8 } },
      { t: 28.4, pos: [-14.2, 0, 0.35], ry: 2.05, state: { moveSpeed: 0, crouch: 0.55, reach: 0.9, melee: 0.55, lookPitch: -0.85 } },
      { t: 29.4, pos: [-14.2, 0, 0.35], ry: 2.05, state: { moveSpeed: 0, crouch: 0.7, reach: 0.85, melee: 0.3, lookPitch: -0.9 } },
      { t: 34.4, pos: [-14.2, 0, 0.35], ry: 2.05, state: { moveSpeed: 0, crouch: 0.7, reach: 0.85, melee: 0.3, lookPitch: -0.9 } },
      // 镜 6：第二梭子，他往师长身上扑过去伏下（挪 0.45 m / 0.5 s = 0.9 m/s），
      // 跪（kneel）在他身侧、面朝南、双手还伸在他背上俯下去。
      // 两个人都趴平会互相穿模（两具身体都贴在 y=0），所以他是跪伏在师长身侧 ——「伏在他身上」取其意。
      { t: 34.7, pos: [-14.2, 0, 0.35], ry: 2.05, state: { moveSpeed: 0.21, crouch: 0.7, kneel: 0.0, reach: 0.85, melee: 0.0, dying: 0.0, lookPitch: -0.9 } },
      { t: 35.2, pos: [-14.55, 0, 0.0], ry: 2.9, state: { moveSpeed: 0.0, crouch: 0.0, kneel: 1.0, reach: 0.8, melee: 0.0, dying: 0.4, lookPitch: -1.0 } },
      { t: 40.6, pos: [-14.55, 0, 0.0], ry: 2.9, state: { moveSpeed: 0, crouch: 0.0, kneel: 1.0, reach: 0.8, melee: 0.0, dying: 0.4, lookPitch: -1.0 } },
    ] },

    // 卫士乙：背汉阳造，蹲在东北侧瓦砾后。
    { id: "g2", kind: "nra", weapon: "HanYang", seed: "guardB", track: [
      { t: 0.0, pos: [-9.8, 0, -4.6], ry: 1.5708, state: { moveSpeed: 0, crouch: 0.9, aim: 0.3 } },
      { t: 21.5, pos: [-9.8, 0, -4.6], ry: 1.5708, state: { moveSpeed: 0, crouch: 0.9, aim: 0.3 } },
      // 也冲过去，绕过北侧瓦砾堆，蹲到师长西北侧（在他身前挡着）。
      // 5.5 m / 1.5 s = 3.67 m/s = 0.87；再 2.9 m / 0.8 s = 3.6 m/s = 0.86。
      { t: 21.6, pos: [-9.8, 0, -4.6], ry: 1.75, state: { moveSpeed: 0.87, crouch: 0.2 } },
      { t: 23.1, pos: [-15.2, 0, -3.7], ry: 2.8, state: { moveSpeed: 0.86, crouch: 0.2 } },
      { t: 23.9, pos: [-16.2, 0, -1.0], ry: 2.8, state: { moveSpeed: 0.0, crouch: 0.6 } },
      // 蹲在师长身前朝西据枪 —— 拿自己挡在他和西门楼之间。
      { t: 24.2, pos: [-16.2, 0, -1.0], ry: 1.5708, state: { moveSpeed: 0, crouch: 0.9, aim: 0.6 } },
      { t: 34.4, pos: [-16.2, 0, -1.0], ry: 1.5708, state: { moveSpeed: 0, crouch: 0.9, aim: 0.6 } },
      // 第二梭子：趴下。
      { t: 34.8, pos: [-16.2, 0, -1.0], ry: 1.5708, state: { moveSpeed: 0, crouch: 0.3, prone: 0.6 } },
      { t: 35.1, pos: [-16.2, 0, -1.0], ry: 1.5708, state: { moveSpeed: 0, crouch: 0.0, prone: 1.0 } },
      { t: 40.6, pos: [-16.2, 0, -1.0], ry: 1.5708, state: { moveSpeed: 0, crouch: 0.0, prone: 1.0 } },
    ] },

    // 卫士丙：蹲在南侧瓦砾后据枪，全程没挪窝 —— 最后一镜里只剩他还趴着。
    // 镜 3（10–17.8）机位在他西北 6.4 m：ry 转到 2.3（面朝西南据枪守街口），
    // 脸背向机位 —— 不然他的 3/4 正脸（光板）要在画面左下挂满 7.8 s。
    { id: "g3", kind: "nra", weapon: "HanYang", seed: "guardC", track: [
      { t: 0.0, pos: [-9.5, 0, 2.6], ry: 1.5, state: { moveSpeed: 0, crouch: 0.9, aim: 0.5 } },
      { t: 10.0, pos: [-9.5, 0, 2.6], ry: 1.5, state: { moveSpeed: 0, crouch: 0.9, aim: 0.5 } },
      { t: 10.7, pos: [-9.5, 0, 2.6], ry: 2.3, state: { moveSpeed: 0, crouch: 0.9, aim: 0.5 } },
      { t: 17.8, pos: [-9.5, 0, 2.6], ry: 2.3, state: { moveSpeed: 0, crouch: 0.9, aim: 0.5 } },
      { t: 18.5, pos: [-9.5, 0, 2.6], ry: 1.5, state: { moveSpeed: 0, crouch: 0.9, aim: 0.5 } },
      { t: 34.5, pos: [-9.5, 0, 2.6], ry: 1.5, state: { moveSpeed: 0, crouch: 0.9, aim: 0.5 } },
      { t: 35.0, pos: [-9.5, 0, 2.6], ry: 1.5, state: { moveSpeed: 0, crouch: 0.2, prone: 1.0 } },
      { t: 40.6, pos: [-9.5, 0, 2.6], ry: 1.5, state: { moveSpeed: 0, crouch: 0.2, prone: 1.0 } },
    ] },

    // 街口东南角收拢的散兵（镜 3 越肩看到的「弟兄们」）。人数与位置推定。
    { id: "s1", kind: "nra", weapon: "HanYang", seed: "strag1", track: [
      { t: 0.0, pos: [-6.0, 0, 8.5], ry: 1.2, state: { moveSpeed: 0, crouch: 0.85 } },
      { t: 12.5, pos: [-6.0, 0, 8.5], ry: 1.2, state: { moveSpeed: 0, crouch: 0.85 } },
      // 听见喊话，站起来一点。
      { t: 14.0, pos: [-6.0, 0, 8.5], ry: 0.9, state: { moveSpeed: 0, crouch: 0.45 } },
      { t: 40.6, pos: [-6.0, 0, 8.5], ry: 0.9, state: { moveSpeed: 0, crouch: 0.45 } },
    ] },
    { id: "s2", kind: "nra", weapon: null, seed: "strag2", track: [
      { t: 0.0, pos: [-1.0, 0, 11.5], ry: 1.3, state: { moveSpeed: 0, crouch: 0.9 } },
      { t: 13.0, pos: [-1.0, 0, 11.5], ry: 1.3, state: { moveSpeed: 0, crouch: 0.9 } },
      { t: 14.5, pos: [-1.0, 0, 11.5], ry: 1.0, state: { moveSpeed: 0, crouch: 0.5 } },
      { t: 40.6, pos: [-1.0, 0, 11.5], ry: 1.0, state: { moveSpeed: 0, crouch: 0.5 } },
    ] },
    { id: "s3", kind: "nra", weapon: "ZhongZheng", seed: "strag3", track: [
      { t: 0.0, pos: [2.0, 0, 12.0], ry: 1.1, state: { moveSpeed: 0, crouch: 0.9 } },
      { t: 40.6, pos: [2.0, 0, 12.0], ry: 1.1, state: { moveSpeed: 0, crouch: 0.9 } },
    ] },
    { id: "s4", kind: "nra", weapon: "HanYang", seed: "strag4", track: [
      { t: 0.0, pos: [-3.5, 0, 13.0], ry: 1.2, state: { moveSpeed: 0, prone: 1.0 } },
      { t: 40.6, pos: [-3.5, 0, 13.0], ry: 1.2, state: { moveSpeed: 0, prone: 1.0 } },
    ] },

    // 西门楼月台上的机枪手（镜 2 反打里 80 m 外的一个剪影，0.6 m 高，脸不可读 ——
    // 不违反「不给日兵的脸」）。月台面 y = 墙顶 11.5 + 月台 0.45 = 11.95，
    // 位置在楼身（x≥-301.4）与内沿石栏（x=-299.64）之间。面朝 +X（东，街口方向）。
    // crouch 0.3：头肩正好露在石栏（顶 12.9）之上、槛墙（12.29–13.44，深色砖）之前 —— 再高就衬在天上看不见，再低就整个埋在栏杆后。
    // firing 的 true/false 边沿与 MG_BURSTS 对齐，让他的枪有后坐。镜 2 之后藏起来。
    { id: "mg1", kind: "ija", weapon: "Type11", seed: "mgA", track: [
      { t: 0.0, pos: [-300.4, 11.95, 0.5], ry: -1.5708, state: { moveSpeed: 0, crouch: 0.3, aim: 1.0, firing: false } },
      ...MG_BURSTS.flatMap((at) => [
        { t: 6 + at, pos: [-300.4, 11.95, 0.5], ry: -1.5708, state: { moveSpeed: 0, crouch: 0.3, aim: 1.0, firing: true } },
        { t: 6 + at + 0.08, pos: [-300.4, 11.95, 0.5], ry: -1.5708, state: { moveSpeed: 0, crouch: 0.3, aim: 1.0, firing: false } },
      ]),
      { t: 10.0, pos: [-300.4, 11.95, 0.5], ry: -1.5708, state: { moveSpeed: 0, crouch: 0.3, aim: 1.0, firing: false } },
      { t: 10.05, pos: [-300.4, 11.95, 0.5], ry: -1.5708, state: { hidden: true } },
    ] },
  ],

  shots: [
    {
      n: 1, seconds: 6.0, focalMm: 35,
      note: "街口全景，机位在街口里、齐眼高 1.65 m 望西：王铭章背对镜头站在街口西沿举望远镜看西门楼，两个卫士蹲在两侧瓦砾后，西门里街一直通到雾里的西门楼。西门方向重机枪的声音，弹着火星打在街心。副官画外喊",
      // 机位离十字街口中心的常驻烟柱 6 m 而且背对它 —— 烟柱在画外。
      // look 的 z 偏 1.4 + 街心 44 m 处的土袋街垒：门洞正中那个 T 形黑影不再吸走视线。
      camera: { from: [-6.0, 1.65, 1.3], look: [-80.0, 0.2, 1.4], shake: 0.12 },
      // 「机枪扫到街口」要看得见：两串弹着火星落在街心（镜 2 的 85 mm 仰角里看不见
      // 街面，弹着只能在这一镜交代），与 type92 的枪声对齐。
      flash: [
        { at: 2.30, pos: [-32.0, 0.35, 1.6], seconds: 0.08, size: 0.45 },
        { at: 2.38, pos: [-28.5, 0.30, 0.6], seconds: 0.08, size: 0.4 },
        { at: 2.46, pos: [-25.0, 0.28, 1.9], seconds: 0.08, size: 0.35 },
        // 第二串放到街北侧（z 负）：z 0.2 那一版从这个机位看正叠在王铭章的胳膊上，
        // 读成「他在镜 1 就中弹了」。
        { at: 4.50, pos: [-27.0, 0.30, -2.2], seconds: 0.08, size: 0.45 },
        { at: 4.58, pos: [-24.5, 0.28, -1.2], seconds: 0.08, size: 0.4 },
      ],
      shakeAt: [{ at: 2.3, seconds: 0.3, amount: 0.18 }, { at: 4.5, seconds: 0.3, amount: 0.18 }],
      sfx: [{ at: 0.3, name: "type92", volume: 0.30 }, { at: 2.2, name: "type92", volume: 0.28 },
            { at: 2.6, name: "impactBrick", volume: 0.3 }, { at: 4.4, name: "type92", volume: 0.30 }],
      // 不放「三月十七日」的小字幕：字幕与台词共用画面底部同一格，6 s 里装不下两条
      // （试过一版，两条text叠在一起糊成一团）。日期与名字都放镜 8 的黑场卡。
      lines: [{ at: 0.9, seconds: 4.9, who: "adjutant", off: true, tier: "虚构", text: "师长！西门楼丢了，机枪扫到街口了！" }],
    },
    {
      n: 2, seconds: 4.0, focalMm: 85,
      note: "反打（望远镜里的景）：机位跳到西门里街西段、离门楼 80 m、齐眼高，85 mm 看整座西城门楼：月台石栏后一个机枪手的剪影，枪口焰一发一发打过来。不给日兵的脸",
      // 原先从王铭章肩前 286 m 外拍，加性焰贴片在那个距离上只是一块淡方片，根本读不出「机枪」；
      // 改成望远镜视角 —— 机位跳到 80 m 外（look 点离机位 81 m，近平面照样抬到 1.2）。
      // 135 mm 在 80 m 处纵向只有 14 m 视野，门楼顶层被裁掉；85 mm 纵向约 23 m，整座楼连天空装得下。
      camera: { from: [-219.0, 2.0, 1.0], look: [-299.2, 13.4, 0.5], shake: 0.15 },
      // 焰贴片现在有径向渐变贴图 + HDR 增益（§1.7）：size 放回 1.0—1.6 也不露方块。
      // 每发两张叠亮心（池子共四张，叠两张 + 后续弹着不超池）。
      // 位置 = 机枪手枪口：月台内沿石栏（x=-299.64，栏顶 12.9），y 12.95 让焰片
      // 下半衬在石栏灰砖上 —— 全衬在亮天里就读不出来（上一轮复审抓到的）。
      flash: MG_BURSTS.flatMap((at) => [
        { at, pos: MG_MUZZLE, seconds: 0.12, size: 1.5 },
        { at, pos: MG_MUZZLE, seconds: 0.12, size: 1.0 },
      ]),
      // 每一发都给一下震感 —— 画面上要有东西「打过来」，不能全靠音效撑。
      shakeAt: MG_BURSTS.map((at) => ({ at, seconds: 0.15, amount: 0.25 })),
      sfx: [
        { at: 0.4, name: "type92", volume: 0.55 },
        { at: 0.9, name: "impactBrick", volume: 0.5 },
        { at: 1.05, name: "impactBrick", volume: 0.45 },
        { at: 1.7, name: "type92", volume: 0.5 },
        { at: 2.2, name: "impactBrick", volume: 0.4 },
        { at: 2.9, name: "type92", volume: 0.5 },
        { at: 3.4, name: "impactBrick", volume: 0.45 },
      ],
      lines: [{ at: 1.3, seconds: 2.4, who: "wang", tier: "虚构", text: "我看得见。" }],
    },
    {
      n: 3, seconds: 7.8, focalMm: 50,
      note: "越肩：机位在王铭章左后肩外 2.7 m，他转身朝东南，画面右边是他的肩背，正前是街口东南角蹲着的散兵与院墙。他喊话。不给脸",
      // look 直接给被摄物（散兵堆中间）；十字街口中心的烟柱在左画外。
      camera: { from: [-14.0, 1.7, -1.95], look: [-3.5, 0.9, 10.0], shake: 0.10 },
      sfx: [{ at: 0.6, name: "type92", volume: 0.22 }, { at: 3.8, name: "explosionFar", volume: 0.3 }],
      // 两句各 12 字（标点算字）：按字数规则最少 3.84 s，已经是下限，秒数不再砍。
      lines: [
        { at: 0.1, seconds: 3.9, who: "wang", tier: "虚构", text: "弟兄们！城还在我们手里。" },
        { at: 4.0, seconds: 3.8, who: "wang", tier: "虚构", text: "能站起来的，都到街口来！" },
      ],
    },
    {
      n: 4, seconds: 5.0, focalMm: 35,
      note: "侧拍，机位在他南侧 4.6 m、齐腰高，锚在他身上跟着走：他转回西边往前走两步，一梭子扫来，中弹踉跄、跪倒。卫士甲、乙从北侧瓦砾后扑过来",
      // 机位落在他西边 0.4 m：再往东南侧的瓦砾堆就压进右下角了。
      // look 给他的胸口、往西偏 1.2 m 留出他要走进去的空间（不再推到 40 m 外绕 viewmodel）。
      camera: { fromActor: "wang", from: [-0.4, 1.0, 4.4], lookActor: "wang", look: [-1.2, 0.8, 0.0], shake: 0.18 },
      // 镜内 3.3 s = 全局 21.1：那一梭子。门楼在本镜画外 50° 以上，不摆焰片（摆了也看不见）。
      sfx: [
        { at: 0.9, name: "footstepDirt", volume: 0.35 }, { at: 1.7, name: "footstepDirt", volume: 0.35 },
        { at: 2.5, name: "footstepDirt", volume: 0.35 },
        { at: 3.3, name: "type92", volume: 0.65 },
        { at: 3.42, name: "impactFlesh", volume: 0.5 }, { at: 3.55, name: "impactDirt", volume: 0.45 },
        { at: 3.7, name: "impactDirt", volume: 0.4 },
        { at: 4.6, name: "bodyFall", volume: 0.35 },
      ],
      shakeAt: [{ at: 3.3, seconds: 0.5, amount: 0.45 }],
      // 这句会跨进镜 5 的头 0.7 s（台词槽不随换镜清掉），镜 5 第一句从 0.6 s 起。
      lines: [{ at: 3.4, seconds: 2.3, who: "g1", tier: "虚构", text: "师长——！" }],
    },
    {
      n: 5, seconds: 10.8, focalMm: 50,
      note: "近景，机位在他东南后侧方 3.8 m、齐胸高：看见的是他的背与右侧身，他跪在地上朝西低着头、头转向身后的卫士甲；卫士甲在他身后俯身伸手架着他，卫士乙蹲在他身前（西）朝西据枪挡着。他不肯走",
      // 机位从正侧（南）挪到后侧方（东南）：三个人都不给正脸。look 给跪姿的胸口（y≈0.6）。
      camera: { fromActor: "wang", from: [2.0, 1.05, 3.2], lookActor: "wang", look: [-0.3, 0.6, -0.2], shake: 0.14 },
      sfx: [{ at: 1.8, name: "type92", volume: 0.25 }, { at: 2.3, name: "impactBrick", volume: 0.3 },
            { at: 6.2, name: "type92", volume: 0.25 }, { at: 8.7, name: "explosionFar", volume: 0.28 }],
      // 三句的秒数都已在字数规则下限（10/8/12 字 → 3.4/2.96/3.84 s），只把句间空档收紧。
      lines: [
        { at: 0.6, seconds: 3.4, who: "wang", tier: "虚构", text: "不要管我……守住城。" },
        { at: 4.0, seconds: 3.0, who: "g1", tier: "虚构", text: "师长，我背你走！" },
        { at: 7.0, seconds: 3.8, who: "wang", tier: "虚构", text: "走不了了。弟兄们，守住。" },
      ],
    },
    {
      n: 6, seconds: 3.5, focalMm: 35,
      note: "退开一点，机位在他东南 4.6 m、1.4 m 高：第二梭子扫来，他从跪姿往前扑倒（dead 布娃娃，从当前胯高起倒），卫士甲扑到他身侧跪伏，卫士乙、丙趴下",
      // look 给他倒下后身体的位置（贴地 y 0.3、略偏他倒向的西侧）。
      camera: { fromActor: "wang", from: [2.8, 1.4, 3.6], lookActor: "wang", look: [-0.5, 0.3, 0.0], shake: 0.12 },
      // 门楼在本镜画外，不摆焰片。
      sfx: [
        { at: 0.85, name: "type92", volume: 0.7 },
        { at: 0.95, name: "impactFlesh", volume: 0.55 },
        { at: 1.05, name: "impactDirt", volume: 0.5 }, { at: 1.2, name: "impactDirt", volume: 0.45 },
        { at: 1.35, name: "bodyFall", volume: 0.5 },
        { at: 1.7, name: "bodyFall", volume: 0.35 },
      ],
      shakeAt: [{ at: 0.85, seconds: 0.6, amount: 0.55 }],
    },
    {
      n: 7, seconds: 3.5, focalMm: 35,
      note: "机位与镜 6 完全一致，一个数都不许动：尘落下来，街口只剩卫士伏在他身边。没有台词。末尾黑出",
      camera: { fromActor: "wang", from: [2.8, 1.4, 3.6], lookActor: "wang", look: [-0.5, 0.3, 0.0], shake: 0.0 },
      sfx: [{ at: 1.6, name: "type92", volume: 0.18 }],
      blackOutAt: 2.6,
    },
    {
      n: 8, seconds: 7.0, focalMm: 35, black: true, titleCard: true,
      note: "黑场，名字一行 + 两行并列史源的字幕同时在屏（居中）—— 40 秒里「王铭章」三个字必须在屏幕上出现过",
      camera: { fromActor: "wang", from: [2.8, 1.4, 3.6], lookActor: "wang", look: [-0.5, 0.3, 0.0] },
      subs: [
        { at: 0.2, seconds: 6.8, tier: "信史", text: "第一二二师师长王铭章，殉国。" },
        { at: 0.2, seconds: 6.8, tier: "主流", text: "殉国地点两说：城中心十字街口 ／ 西关电灯厂附近壕沟。" },
        { at: 0.2, seconds: 6.8, tier: "主流", text: "时间三说：三月十七日下午三时 ／ 五时 ／ 黄昏。" },
      ],
    },
  ],

  // 黑场那几秒装不下全部并列史源 —— 剩下的走「补出卡片」，与跳过卡同一套 UI。
  // 史实信息不许因为镜头时长不够而丢失。
  epilogueCard: {
    title: "王铭章殉国",
    lines: [
      { tier: "主流", text: "殉国地点两说：城中心十字街口 ／ 西关电灯厂附近壕沟。" },
      { tier: "主流", text: "时间三说：三月十七日下午三时 ／ 五时 ／ 黄昏。" },
      { tier: "主流", text: "一九三八年三月二十一日中央社电讯记为城内中弹后自戕；同年十一月墓志改记为「负伤仍指挥杀敌，身中数弹」；一九八三年起张宣武回忆记为缒城后于城外中弹。其后人于二〇〇九年公开否认自杀说。本作采中弹一说。" },
      { tier: "信史", text: "一九三八年四月六日国民政府褒扬令：苦守要区，逾三昼夜。" },
      { tier: "主流", small: true, text: "同时殉国：赵渭滨（第 122 师参谋长）、邹绍孟（第 124 师参谋长）、罗甲辛、谢大墉、范承谟；王麟（第 740 团团长，十七日东关方向阵亡）。" },
    ],
  },
  skipCardFrom: "epilogueCard",
  people: {
    // 卫士甲是本场唯一开口的无名者（「师长，我背你走」）。张宣武回忆里卫士
    // 李士昆等两人受伤幸存 —— 这里不给名字，不把一句虚构台词挂到真人头上。
    g1: { name: "", short: "卫士", real: false, note: "虚构，无名。CS_WangMingzhang 里要背师长走的那个卫士" },
  },
  // 只约束 lines（角色口中的台词）。史源卡片（epilogueCard / subs）可以、也必须引述
  // 「自戕／自杀说」那一层史源 —— 所以这里不写「自戕」「自尽」，免得日后接上检查器把补卡打成硬错。
  forbiddenLines: ["举枪自尽", "师座", "同志们"],
};
