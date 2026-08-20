// 《滕县 1938》过场分镜 —— 最后一电（CS_LastWire）。
//
// **纯数据，不许 import three**。被 Data_TengxianScript.mjs 汇总进 CUTSCENES，
// Script_Cutscene.mjs 是唯一消费者；字段说明见 Data_TengxianScript.mjs「过场」一节
// 与 docs/Data_CutsceneRedo.md（§1 引擎契约，§2.3 本场施工单）。
//
// 本场专属的人物表条目写在 people（并进 CAST），本场新引入的推定值写在 presumed
// （并进 PRESUMED_STAGING）—— 五场各自一个文件，是为了能并行改而不互相踩。
//
// ── 史源（docs/Data_TengxianTimeline.md「最后一电」一节）──────────────────
//   · 短句「决心死拼，以报国家」（亦作「决以死拚以报国家」）：主流记载，可直接做台词。
//   · 长版「职忆委座成仁之训，及开封面谕嘉慰之词，决心死拼，以报国家，以报知遇。
//     职王铭章叩铣」：主流记载，未见原件影印；「铣」为韵目代日＝16 日。
//   · 发完此电后下令砸毁电台：另有记载（主流），所以砸电台那一镜只给地上的木壳，
//     不给表情、不给全景。
//   · 「本日已无友军枪声」：流传待考，本作不采用（forbiddenLines）。
//   · 师部在城内哪一处无载（只知原设城外电灯厂，16 日接死守命令后迁入城内），
//     屋子是推定的一间土坯房，登记在 presumed。
//
// ── 2026-08-20 重做（施工单 §2.3）────────────────────────────────────────
//   · 屋子做成封闭 inside 盒子 + 油灯点光，相机任何一镜都看不见屋外；
//   · 王铭章／赵渭滨改 nraOfficer，人站在桌旁；
//   · 加对白把事讲清（赵问怎么写 → 王「就一句」→ 还有呢 → 没有了，发 → 敲键 →
//     发完砸电台）；长版电文与版本差异的小字幕照旧；skipCard 照旧。
//   · 总长从 22 s 放到 37.8 s：对白五句按字数规则至少占 17 s，长版电文小字幕
//     按字数规则至少 5.6 s，压不回 26 s。
//
// ── §1.7 第二轮引擎补丁之后（旧的绕法都撤了，别再照抄早期轮次的注释）──────
//   · 过场期间 viewmodel 已隐藏：look 直接给被摄物，近平面自动按距离收到
//     0.03—1.2 m —— 镜 5 因此能真拍 0.8 m 外的电键与手（第 1—3 轮靠 Far() 把
//     look 推到 45 m 外抬近平面，代价是全场没有微距，已撤）。
//   · 空手 Actor 有 `reach`（0—1 双手往前下方伸）：报务员敲键、赵渭滨执纸都用它。
//   · propMoves 同一道具可多段（已开始的最晚一段生效），且支持 rotFrom/rotTo ——
//     镜 7 的木壳「先摔下、再翻滚着滑」两段；镜 5 的油灯「沉一下、再慢慢回位」。
//   · 点光支持 flicker：油灯/马灯的火光会呼吸，不再是静止灯泡。
//   · 后脑勺有深色发盖：背影镜里「黑发盖」＝背影、「肤色板」＝穿帮，出图按这个查。
//   · 仍然没有的（engineRequests）：手伸向**指定点**的 IK（reach 只有方向没有目标，
//     手与电键的对位靠摆人）；「坐」姿；专用的电键「嗒」声（用 grenadePin 凑）。
//
// ── 2026-08-20 第 2 轮（复审意见）─────────────────────────────────────────
//   · 镜 4 地图改浅色 + 挪进油灯光圈；镜 2/3 赵渭滨改侧身、机位偏；
//     台词「孙总司令」改「总司令部」。
//
// ── 2026-08-20 第 3 轮（复审意见）─────────────────────────────────────────
//   · 赵渭滨挪到桌西南角外 (-1.1,0.25)：镜 2/3 不再和报务员叠成「一人两头」；
//     油灯东移、面板加旋钮 —— 电台读得出是电台。
//
// ── 2026-08-20 第 4 轮（复审返修，本轮）───────────────────────────────────
//   · 撤掉全部 Far()：look 直接给被摄物；镜 5 重做成电键微距（0.8 m），真拍键与手。
//   · 报务员用 reach 真的在发报（0.45↔0.70 微动模拟起落键），人挪到电键正南。
//   · 镜 4 王铭章落点 (1.3,-1.5)→(0.9,-1.6)、ry 0.47：正对地图中心，背右侧对镜头。
//   · 镜 6 王铭章改成面朝电台下令（不面朝人），机位 (2.9,1.7,-1.2) 在他背轴
//     25° 以内：最重的一句台词只给发盖与右后肩。
//   · 镜 2 赵渭滨 lookYaw -0.7→-0.45（头到侧影即止）；镜 6 他改右侧影 + 低头。
//   · 镜 7 木壳翻滚着地（rotTo）、马灯提亮；字卡撤「夜」（presumed 里只登记推定）。
//   · ★ lookPitch 的符号是**正=抬头、负=低头**（Script_Actor 1331 行：rotation.x
//     为正 = 后仰/抬头；neck.rotation.x = lookPitch×0.62）。前三轮全场把「低头」
//     写成正值，实际是在抬下巴 —— 镜 6 三张脸全亮就是这么来的。本轮全部翻号；
//     下一轮作者别按直觉写，先看这条。

// 屋子：x ∈ [-3, 3]，z ∈ [-2.5, 2.5]，高 3.2。北墙 z=-2.5（窗、地图），东墙 x=3（门）。
// 八仙桌桌面 y=0.83，中心 (0.0, -1.0)；电台与油灯在桌西北角，电键在桌南缘；报务员在电键正南俯身，
// 王铭章在桌东侧，赵渭滨在桌西侧 —— 三个人都在桌**旁**，没人站在桌里。
const TABLE = { x: 0.0, z: -1.0, top: 0.83 };

export const CS_LastWire = {
  id: "CS_LastWire",
  title: "最后一电",
  seconds: 37.8,
  trigger: "afterLevel:L3_Fanji",
  sky: "night",
  // 不再给 cut.fadeIn：镜 1 是 black:true 的字卡，引擎现在第一帧就全黑（§1.7），
  // 早期轮次的 1.2 s 只是为了盖 0.25 s 收敛期，已经没有存在的理由。
  standalone: true,
  // 独立布景：离城心 ≥ 1800 m（切比雪夫距离），1700 m 内铺着真地形会和自己的地面打架。
  setOrigin: [-2400, 0, 2400],
  why: "全局唯一一次把「必然陷落」从守军自己嘴里说出来。放在刚夺回东关门、玩家情绪最高的那一刻，高点与判决书叠在一起。",
  presumed: [
    { id: "lastWireRoom", value: "城内师部为一间土坯房，八仙桌、油灯、一部电台",
      note: "师部迁入城内后的具体位置与陈设无载，布景为推定" },
    { id: "lastWireHour", value: "发电时刻无载，布景取夜间",
      note: "「铣」只给日期（16 日），字卡因此不标时辰；屋内油灯与夜景是推定" },
  ],
  props: [
    // ── 屋子本体：一个大盒子翻成 BackSide，六面土坯；地面另铺一块 plane ──
    // 墙用砖不用 Adobe：Adobe 一张 1.6 m，在 3 m 高的屋里裂纹大得像鹅卵石。
    { kind: "box", size: [6.0, 3.2, 5.0], pos: [0, 1.6, 0], mat: "BrickWall", tint: 0x9c9283, roughness: 0.96, inside: true, name: "屋子" },
    { kind: "plane", size: [6.0, 5.0], pos: [0, 0.012, 0], mat: "Ground", name: "屋内地面" },
    // 三根房梁，横跨南北
    { kind: "box", size: [0.18, 0.20, 5.0], pos: [-1.8, 2.98, 0], mat: "WoodBeam", name: "房梁西" },
    { kind: "box", size: [0.18, 0.20, 5.0], pos: [0.2, 2.98, 0], mat: "WoodBeam", name: "房梁中" },
    { kind: "box", size: [0.18, 0.20, 5.0], pos: [2.2, 2.98, 0], mat: "WoodBeam", name: "房梁东" },
    // 北墙：窗纸（夜里外面有火光，给一点点暗红的自发光；炮一响它就抖）与一张地图纸
    { kind: "box", size: [0.90, 0.80, 0.03], pos: [-1.7, 1.65, -2.47], color: 0x5a4d3c, emissive: 0x2a1408, name: "窗纸" },
    // 地图纸：摆进油灯 7 m 光圈的亮区（第 1 轮在 x=1.1、0x3e3830 拍出来是一块死黑）。
    // roughness 必须拉满：纯色盒子默认 0.5 的高光把 1.2 m 外的油灯反成一块白灯箱
    { kind: "box", size: [1.20, 0.90, 0.02], pos: [0.45, 1.70, -2.48], color: 0x5c5646, roughness: 1.0, name: "地图" },
    // 东墙：一扇木门
    { kind: "box", size: [0.05, 2.05, 0.95], pos: [2.96, 1.03, 0.9], mat: "WoodDoor", name: "木门" },
    // ── 八仙桌：桌面 + 四条腿 ──
    { kind: "box", size: [1.10, 0.05, 1.10], pos: [TABLE.x, TABLE.top - 0.025, TABLE.z], color: 0x4a3a28, roughness: 0.9, name: "八仙桌" },
    { kind: "box", size: [0.08, 0.805, 0.08], pos: [TABLE.x - 0.50, 0.4025, TABLE.z - 0.50], color: 0x3d3122, name: "桌腿1" },
    { kind: "box", size: [0.08, 0.805, 0.08], pos: [TABLE.x + 0.50, 0.4025, TABLE.z - 0.50], color: 0x3d3122, name: "桌腿2" },
    { kind: "box", size: [0.08, 0.805, 0.08], pos: [TABLE.x - 0.50, 0.4025, TABLE.z + 0.50], color: 0x3d3122, name: "桌腿3" },
    { kind: "box", size: [0.08, 0.805, 0.08], pos: [TABLE.x + 0.50, 0.4025, TABLE.z + 0.50], color: 0x3d3122, name: "桌腿4" },
    // 电台：木壳 + 黑色面板 + 一粒刻度盘灯
    { kind: "box", size: [0.46, 0.28, 0.30], pos: [-0.35, TABLE.top + 0.14, -1.30], color: 0x7a6242, roughness: 0.95, name: "电台木壳" },
    // 木壳里藏四片木片（整块时看不见），砸的时候飞出来散一地
    { kind: "box", size: [0.14, 0.03, 0.05], pos: [-0.35, TABLE.top + 0.12, -1.30], color: 0x8a7050, name: "木片1" },
    { kind: "box", size: [0.10, 0.03, 0.08], pos: [-0.35, TABLE.top + 0.16, -1.30], color: 0x8a7050, name: "木片2" },
    { kind: "box", size: [0.16, 0.025, 0.06], pos: [-0.35, TABLE.top + 0.10, -1.30], color: 0x8a7050, name: "木片3" },
    { kind: "box", size: [0.09, 0.03, 0.11], pos: [-0.35, TABLE.top + 0.18, -1.30], color: 0x8a7050, name: "木片4" },
    { kind: "box", size: [0.40, 0.20, 0.02], pos: [-0.35, TABLE.top + 0.15, -1.14], color: 0x3a3531, name: "电台面板" },
    { kind: "box", size: [0.05, 0.05, 0.015], pos: [-0.43, TABLE.top + 0.19, -1.128], color: 0x8a6a30, emissive: 0x6a4a18, name: "刻度盘" },
    // 两粒旋钮（轴沿 z，贴在面板南面）：没有它们这台机器从任何机位看都只是「一个木盒」
    { kind: "cyl", size: [0.024, 0.02], pos: [-0.27, TABLE.top + 0.11, -1.12], rx: 1.5708, color: 0x9a9080, roughness: 0.6, name: "旋钮1" },
    { kind: "cyl", size: [0.024, 0.02], pos: [-0.17, TABLE.top + 0.11, -1.12], rx: 1.5708, color: 0x9a9080, roughness: 0.6, name: "旋钮2" },
    // 电键：木底座 + 黄铜键杆，摆在桌南缘报务员手边。
    // 第一次出图底座 0x2c2824 在深色桌面上是「黑上加黑」，微距镜里读不出 —— 提亮 + 铜杆给一点高光
    { kind: "box", size: [0.10, 0.025, 0.07], pos: [0.42, TABLE.top + 0.0125, -0.55], color: 0x54432e, roughness: 0.8, name: "电键" },
    { kind: "box", size: [0.02, 0.02, 0.07], pos: [0.42, TABLE.top + 0.035, -0.53], color: 0xa08a50, roughness: 0.45, name: "电键杆" },
    // 电文纸：参谋长手边
    { kind: "box", size: [0.22, 0.008, 0.30], pos: [-0.38, TABLE.top + 0.004, -0.80], color: 0xa89e8a, name: "电文纸" },
    // 油灯：桌东北角，离电台木壳 0.5 m（第 2 轮只隔 0.17 m，木壳被打成白灯箱）。
    // 点光挂在它身上，IBL 照不进盒子。flicker 让火苗呼吸（§1.7），幅度别大 —— 它是主光，
    // 抖狠了整屋亮度会一跳一跳
    { kind: "cyl", size: [0.045, 0.15], pos: [0.38, TABLE.top + 0.075, -1.48], color: 0xd8c58c, emissive: 0x6a5030,
      light: { color: 0xffbe78, intensity: 2.2, distance: 7.0, offsetY: 0.14, flicker: 0.22 }, name: "油灯" },
    // 中梁下吊一盏马灯：暖色补光，不然背光那一面全是夜空 IBL 的蓝。
    // 4.5→6.0：镜 7 摔在西墙根的木壳离它 4 m，4.5 时顶面全黑（复审抓的）
    { kind: "cyl", size: [0.06, 0.20], pos: [0.9, 2.45, 0.5], color: 0x3a3430, emissive: 0x8a6a38,
      light: { color: 0xffc890, intensity: 6.0, distance: 11.0, offsetY: -0.04, flicker: 0.10 }, name: "马灯" },
    // 一只条凳靠墙，一箱电池木箱在墙根（不空）
    { kind: "box", size: [1.20, 0.06, 0.26], pos: [-2.2, 0.45, 1.6], mat: "WoodStock", name: "条凳面" },
    { kind: "box", size: [0.06, 0.42, 0.26], pos: [-2.72, 0.21, 1.6], mat: "WoodStock", name: "条凳腿1" },
    { kind: "box", size: [0.06, 0.42, 0.26], pos: [-1.68, 0.21, 1.6], mat: "WoodStock", name: "条凳腿2" },
    { kind: "box", size: [0.55, 0.38, 0.40], pos: [2.4, 0.19, -2.1], mat: "WoodStock", name: "电池箱" },
  ],
  cast: [
    // 王铭章：nraOfficer，桌东侧，面朝西北（朝着电台与参谋长）。**全场只给背影与侧影。**
    // 两次转身都卡在切镜前后完成（12.7→13.1 在镜 3 末尾；24.55→25.2 等镜 6 切进来），
    // 免得转身那一瞬帽檐翻转、手伸进别的镜的画框。
    { id: "wang", kind: "nraOfficer", weapon: null, seed: "wangLastWire", track: [
      // 镜 1 黑场 0–3.4 ｜ 镜 2 3.4–8.6 ｜ 镜 3 8.6–13.1 ｜ 镜 4 13.1–18.3 ｜ 镜 5 18.3–24.5 ｜
      // 镜 6 24.5–29.0 ｜ 镜 7 29.0–32.0 ｜ 镜 8 黑场 32.0–37.8
      // 站桌东侧，面朝西北偏北（方向 (-0.81,-0.58) → ry≈0.95，看着桌西北角的油灯与电台那头）：
      // 对镜 2 的西南角机位是侧影，对镜 3 的东南角机位是纯背影（1.32 的话西南角机位看到的是 3/4 正脸）
      { t: 0.0, pos: [1.0, 0, -0.95], ry: 0.95, state: { moveSpeed: 0, lookPitch: -0.18 } },
      { t: 8.4, pos: [1.0, 0, -0.95], ry: 0.95, state: { moveSpeed: 0, lookPitch: -0.18 } },
      // 「就一句……」：抬头，看着电台那头
      { t: 9.1, pos: [1.0, 0, -0.95], ry: 0.95, state: { moveSpeed: 0, lookPitch: 0.02 } },
      { t: 12.7, pos: [1.0, 0, -0.95], ry: 0.95, state: { moveSpeed: 0, lookPitch: 0.02 } },
      // 镜 3 末尾转向走路方向（往 (0.9,-1.6)：方向 (-0.1,-0.65) → ry≈0.15），镜 4 一开就
      // 背对大家走两步到北墙地图前（0.66 m / 0.7 s = 0.94 m/s → moveSpeed 0.22），
      // 再转身正对地图中心（地图 (0.45,-2.48)：方向 (-0.45,-0.88) → ry≈0.47）。
      // 「没有了。发。」是背对所有人说的；落点 (0.9,-1.6) 让他以背右侧对着镜 4 的机位（复审第 4 条）
      { t: 13.1, pos: [1.0, 0, -0.95], ry: 0.15, state: { moveSpeed: 0.22, lookPitch: 0.0 } },
      { t: 13.8, pos: [0.9, 0, -1.6], ry: 0.15, state: { moveSpeed: 0, lookPitch: 0.0 } },
      { t: 14.4, pos: [0.9, 0, -1.6], ry: 0.47, state: { moveSpeed: 0, lookPitch: 0.10 } },
      { t: 24.55, pos: [0.9, 0, -1.6], ry: 0.47, state: { moveSpeed: 0, lookPitch: 0.10 } },
      // 镜 6 切进来之后才转身，**面朝桌上的电台**（(-1.25,0.3) → ry≈1.81）下「砸电台」的令 ——
      // 看着要砸的机器说，不看人。左转（西北→西），脸扫过的是西墙，永远背着东面的机位；
      // 机位 (2.9,-1.2) 在他背轴 25° 以内：镜头看到的是发盖与右后肩，不是脸（复审第 1 条）
      { t: 25.2, pos: [0.9, 0, -1.6], ry: 1.55, state: { moveSpeed: 0, lookPitch: -0.62 } },
      { t: 37.8, pos: [0.9, 0, -1.6], ry: 1.55, state: { moveSpeed: 0, lookPitch: -0.62 } },
    ] },
    // 赵渭滨（第 122 师参谋长，真实人物，同日殉国）：nraOfficer，桌西侧，低头对着电文纸。
    // ry -0.35：身子朝北偏东（桌西北角的电台），对镜 2/3 的东南角机位是后背 3/4；问话只转头（lookYaw）。
    // 第 1 轮 -1.36 / 第 2 轮 -1.0 都是身子朝着师长 → 3/4 正脸给了 5 s，不行。
    { id: "zhao", kind: "nraOfficer", weapon: null, seed: "zhaoWeibin", track: [
      { t: 0.0, pos: [-1.1, 0, 0.25], ry: -0.35, state: { moveSpeed: 0, crouch: 0.12, lookPitch: -0.50 } },
      { t: 3.6, pos: [-1.1, 0, 0.25], ry: -0.35, state: { moveSpeed: 0, crouch: 0.12, lookPitch: -0.50 } },
      // 问话时抬头、头转向师长（转头不转身；-0.45 头到侧影即止 —— 第 3 轮的 -0.7 在
      // 4 m 外还是把 3/4 脸板亮了 4.5 s，复审第 5 条）
      { t: 4.2, pos: [-1.1, 0, 0.25], ry: -0.35, state: { moveSpeed: 0, crouch: 0.05, lookPitch: 0.02, lookYaw: -0.45 } },
      { t: 8.6, pos: [-1.1, 0, 0.25], ry: -0.35, state: { moveSpeed: 0, crouch: 0.05, lookPitch: 0.02, lookYaw: -0.45 } },
      // 师长一开口就低头记（reach 0.3 = 双手在身前执纸，§1.7）：「还有呢」是低着头问的。
      // lookPitch -0.65（负=低头，见文件头★条）：镜 3 的东南机位从 71° 掠射角只看见帽顶
      { t: 9.2, pos: [-1.1, 0, 0.25], ry: -0.35, state: { moveSpeed: 0, crouch: 0.14, lookPitch: -0.65, reach: 0.30 } },
      { t: 13.9, pos: [-1.1, 0, 0.25], ry: -0.35, state: { moveSpeed: 0, crouch: 0.14, lookPitch: -0.65, reach: 0.30 } },
      // 镜 4 里（他在画外）绕到桌西侧看报务员发报：0.91 m / 2.4 s = 0.38 m/s → moveSpeed 0.09，
      // 走路方向 (-0.15,-0.9) → ry≈0.17；到位后转到 ry 0.55（面朝西北）——
      // 镜 6 的东北机位看到的是他的右侧影 + 低头（复审第 5 条），镜 7 右缘只给腿
      { t: 14.0, pos: [-1.1, 0, 0.25], ry: 0.17, state: { moveSpeed: 0.09, crouch: 0, lookPitch: -0.25 } },
      { t: 16.4, pos: [-1.25, 0, -0.65], ry: 0.17, state: { moveSpeed: 0, crouch: 0, lookPitch: -0.25 } },
      { t: 16.9, pos: [-1.25, 0, -0.65], ry: 1.05, state: { moveSpeed: 0, crouch: 0.10, lookPitch: -0.50, reach: 0.30 } },
      { t: 24.5, pos: [-1.25, 0, -0.65], ry: 1.05, state: { moveSpeed: 0, crouch: 0.10, lookPitch: -0.50, reach: 0.30 } },
      // 镜 6 里再低一点头，把脸板整个压进帽檐阴影
      { t: 25.2, pos: [-1.25, 0, -0.65], ry: 1.05, state: { moveSpeed: 0, crouch: 0.10, lookPitch: -0.70, reach: 0.30 } },
      { t: 37.8, pos: [-1.25, 0, -0.65], ry: 1.05, state: { moveSpeed: 0, crouch: 0.10, lookPitch: -0.70, reach: 0.30 } },
    ] },
    // 报务员：nra 空手，电键正南 (0.42,-0.28)，ry 0 面朝正北 —— reach 的双手往正前
    // 下方伸，落在桌沿电键 (0.42,-0.55) 两侧（reach 只有方向没有目标点，对位靠站位）。
    // 镜 5 里 reach 0.45↔0.70 微动模拟起落键（复审第 2 条）；头低靠 lookPitch。
    { id: "radioman", kind: "nra", weapon: null, seed: "radioman", track: [
      { t: 0.0, pos: [0.42, 0, -0.28], ry: 0.0, state: { moveSpeed: 0, crouch: 0.12, lookPitch: -0.75, reach: 0.35 } },
      { t: 18.3, pos: [0.42, 0, -0.28], ry: 0.0, state: { moveSpeed: 0, crouch: 0.12, lookPitch: -0.75, reach: 0.35 } },
      // 镜 5：开始发报。手起落键（reach 微动），身子略前倾
      { t: 18.6, pos: [0.42, 0, -0.28], ry: 0.0, state: { moveSpeed: 0, crouch: 0.45, lookPitch: -0.70, reach: 0.88, melee: 0.25 } },
      { t: 19.5, pos: [0.42, 0, -0.28], ry: 0.0, state: { moveSpeed: 0, crouch: 0.45, lookPitch: -0.70, reach: 0.72, melee: 0.25 } },
      { t: 20.5, pos: [0.42, 0, -0.28], ry: 0.0, state: { moveSpeed: 0, crouch: 0.45, lookPitch: -0.70, reach: 0.95, melee: 0.25 } },
      { t: 21.5, pos: [0.42, 0, -0.28], ry: 0.0, state: { moveSpeed: 0, crouch: 0.45, lookPitch: -0.70, reach: 0.74, melee: 0.25 } },
      { t: 22.5, pos: [0.42, 0, -0.28], ry: 0.0, state: { moveSpeed: 0, crouch: 0.45, lookPitch: -0.70, reach: 0.92, melee: 0.25 } },
      { t: 23.5, pos: [0.42, 0, -0.28], ry: 0.0, state: { moveSpeed: 0, crouch: 0.45, lookPitch: -0.70, reach: 0.76, melee: 0.25 } },
      { t: 24.5, pos: [0.42, 0, -0.28], ry: 0.0, state: { moveSpeed: 0, crouch: 0.45, lookPitch: -0.70, reach: 0.90, melee: 0.25 } },
      // 镜 6 机位在桌北高处：头再压低一点，镜头看见的是帽顶不是脸板；手还搭在键上
      { t: 25.2, pos: [0.42, 0, -0.28], ry: 0.0, state: { moveSpeed: 0, crouch: 0.40, lookPitch: -0.85, reach: 0.82, melee: 0.2 } },
      { t: 37.8, pos: [0.42, 0, -0.28], ry: 0.0, state: { moveSpeed: 0, crouch: 0.40, lookPitch: -0.85, reach: 0.82, melee: 0.2 } },
    ] },
  ],
  shots: [
    {
      n: 1, seconds: 3.4, focalMm: 50, black: true, titleCard: true,
      note: "黑场字卡：日期与地点（「夜」是 presumed 的推定值，不上主流牌的字卡 —— 夜由屋内油灯自明）",
      camera: { from: [0, 1.4, 2.0], look: [0, 1.4, 0] },
      subs: [{ at: 0.15, seconds: 3.25, tier: "主流", date: true, text: "三月十六日 · 师部" }],
    },
    {
      n: 2, seconds: 5.2, focalMm: 35, fadeIn: 0.9,
      note: "全景（从黑淡入，机位在东南角）：土坯屋，油灯，八仙桌上一部电台，北墙地图与窗；报务员俯身在电键前（后背），王铭章在桌东侧（后背 3/4），赵渭滨在桌西侧远处身朝电台、只把头转过来问（侧影即止）。赵开口问",
      camera: { from: [2.2, 1.65, 2.3], look: [-0.6, 0.95, -0.9] },
      sfx: [{ at: 0.5, name: "explosionFar", volume: 0.30 }],
      // 收件人不写死：Timeline「最后一电」一节没记收件人，「孙总司令」是事实断言，虚构句不承载。
      lines: [{ at: 0.6, seconds: 4.55, who: "zhao", tier: "虚构", text: "师长，给总司令部的电报怎么写？" }],
    },
    {
      n: 3, seconds: 4.5, focalMm: 40,
      note: "中景：从王铭章背后偏南越过他看桌面与电台，赵渭滨在桌西南角外、画左，和报务员错开 ≈14°；油灯卡在王铭章身后。只给背影；镜尾 12.7–13.1 王铭章转向走路方向",
      camera: { from: [2.75, 1.55, 0.3], look: [-0.7, 1.0, -0.7] },
      lines: [{ at: 0.15, seconds: 4.3, who: "wang", tier: "主流", text: "就一句。决心死拼，以报国家。" }],
    },
    {
      n: 4, seconds: 5.2, focalMm: 35,
      note: "王铭章的背：机位压进他背轴（正南 2.7 m，偏角 ≈29°），他背对大家走两步到北墙地图前站住、正对地图中心，「没有了。发。」是背对所有人说的；报务员伸手在电键上的侧背在画左中景",
      camera: { from: [0.9, 1.5, 1.1], look: [0.75, 1.55, -2.1] },
      lines: [
        { at: 0.15, seconds: 2.5, who: "zhao", tier: "虚构", text: "……还有呢？" },
        { at: 2.7, seconds: 2.5, who: "wang", tier: "虚构", text: "没有了。发。" },
      ],
    },
    {
      n: 5, seconds: 6.2, focalMm: 50,
      note: "微距（0.9 m，撤掉 Far 之后近平面自己收到 0.03）：机位在桌面东北上方、油灯这一侧俯下去拍 —— 顺光，电键与报务员从对面按下来的双手占画面中部，他低着的帽顶压在画上缘，头在焦外顶端；王铭章赵渭滨都在画外。电键声两组长短相间像莫尔斯；外面炮一响油灯沉一下再回位。八个字打出来，长版与版本差异用小字",
      camera: { from: [1.05, 1.25, -1.05], look: [0.42, 0.86, -0.55] },
      // §1.7：同一道具可多段（已开始的最晚一段生效）——油灯被震得沉一下、再慢慢回位
      propMoves: [
        { name: "油灯", from: [0.38, TABLE.top + 0.075, -1.48], to: [0.38, TABLE.top + 0.062, -1.48], startAt: 1.30, endAt: 1.40, ease: "linear" },
        { name: "油灯", from: [0.38, TABLE.top + 0.062, -1.48], to: [0.38, TABLE.top + 0.075, -1.48], startAt: 1.40, endAt: 1.85, ease: "easeOut" },
      ],
      // 敲键：reach 微动是手起落，声音上补两组电键声；grenadePin 是短促的金属「嗒」，
      // 长短相间 —— 引擎没有专用电键音，这条在 engineRequests 里
      sfx: [
        { at: 0.45, name: "grenadePin", volume: 0.12 }, { at: 0.60, name: "grenadePin", volume: 0.12 },
        { at: 0.70, name: "grenadePin", volume: 0.12 }, { at: 0.95, name: "grenadePin", volume: 0.12 },
        { at: 1.25, name: "grenadePin", volume: 0.12 }, { at: 1.40, name: "grenadePin", volume: 0.12 },
        { at: 1.50, name: "grenadePin", volume: 0.12 }, { at: 1.75, name: "grenadePin", volume: 0.12 },
        { at: 2.05, name: "grenadePin", volume: 0.12 }, { at: 2.20, name: "grenadePin", volume: 0.12 },
        { at: 1.10, name: "explosionFar", volume: 0.36 },
        { at: 3.20, name: "grenadePin", volume: 0.12 }, { at: 3.35, name: "grenadePin", volume: 0.12 },
        { at: 3.60, name: "grenadePin", volume: 0.12 }, { at: 3.70, name: "grenadePin", volume: 0.12 },
        { at: 3.95, name: "grenadePin", volume: 0.12 }, { at: 4.10, name: "grenadePin", volume: 0.12 },
        { at: 4.20, name: "grenadePin", volume: 0.12 }, { at: 4.40, name: "grenadePin", volume: 0.12 },
      ],
      subs: [
        { at: 0.2, seconds: 3.6, tier: "主流", big: true, text: "决心死拼，以报国家。" },
        { at: 0.3, seconds: 5.8, tier: "主流", small: true, text: "长版另作：「职忆委座成仁之训，" },
        { at: 0.3, seconds: 5.8, tier: "主流", small: true, text: "及开封面谕嘉慰之词，决心死拼，以报国家，" },
        { at: 0.3, seconds: 5.8, tier: "主流", small: true, text: "以报知遇。职王铭章叩铣。」「铣」即十六日。" },
      ],
    },
    {
      n: 6, seconds: 4.5, focalMm: 40,
      note: "从王铭章身后偏东（(2.9,-1.2)，在他背轴 25° 以内）：他转身面朝桌上的电台下令砸掉它，镜头顺着他的视线看向电台 —— 画里是他的右后肩与发盖（近，画左）、桌上的电台与油灯（中）、远处低头执纸的赵渭滨右侧影（画面深处）、画右边缘低头搭键的报务员。只给背影与侧影 —— 全场铁律最重的一镜",
      camera: { from: [2.9, 1.85, -1.2], look: [-0.35, 0.95, -1.28] },
      lines: [{ at: 0.15, seconds: 4.3, who: "wang", tier: "转述", text: "发完把电台砸了，别留给他们。" }],
    },
    {
      n: 7, seconds: 3.0, focalMm: 35,
      note: "低机位（西墙根，抬到能看见马灯照亮的木壳顶面）：电台从桌西沿被掀下来，摔下时翻滚（rotTo），侧翻着滑到镜头前；面板、旋钮、刻度盘与木片散在赵渭滨脚边，画右缘只有他的两条腿。不给表情、不给全景（「砸电台」是另有记载，不是信史）",
      camera: { from: [-2.3, 1.05, 0.3], look: [-1.6, 0.15, -1.3] },
      // §1.7：木壳两段 —— 先摔下（带翻滚），再侧翻着滑一小段；碎件仍各一段。
      // 刻度盘（唯一自发光件）落在木壳朝机位这一侧，别被木壳挡死。
      propMoves: [
        // 翻滚量：rz 别超过 ~0.6 —— 木壳比高宽（0.46 宽 0.28 高），rz 一到 90° 它就
        // 「立起来」变成一根柱（第一次出图抓到的），侧翻用 rx+ry 的斜滚才像摔的
        { name: "电台木壳", from: [-0.35, TABLE.top + 0.14, -1.30], to: [-1.35, 0.22, -1.38], startAt: 0.60, endAt: 0.95, ease: "easeIn",
          rotTo: [0.25, 0.45, 0.18] },
        { name: "电台木壳", from: [-1.35, 0.22, -1.38], to: [-1.80, 0.19, -1.42], startAt: 0.95, endAt: 1.35, ease: "easeOut",
          rotFrom: [0.25, 0.45, 0.18], rotTo: [0.55, 0.85, 0.55] },
        // 落点都避开赵渭滨 (-1.25,-0.65) 脚下 0.25 m（他站在桌西侧，镜 7 右缘只给他的腿；人离机位 1.4 m 以上）
        { name: "电台面板", from: [-0.35, TABLE.top + 0.15, -1.14], to: [-1.55, 0.01, -0.95], startAt: 0.60, endAt: 1.12, ease: "easeIn",
          rotTo: [0.4, 0.2, 1.2] },
        { name: "刻度盘", from: [-0.43, TABLE.top + 0.19, -1.128], to: [-1.22, 0.02, -0.98], startAt: 0.60, endAt: 1.18, ease: "easeIn" },
        { name: "旋钮1", from: [-0.27, TABLE.top + 0.11, -1.12], to: [-1.68, 0.012, -1.10], startAt: 0.60, endAt: 1.14, ease: "easeIn" },
        { name: "旋钮2", from: [-0.17, TABLE.top + 0.11, -1.12], to: [-1.30, 0.012, -1.22], startAt: 0.60, endAt: 1.20, ease: "easeIn" },
        { name: "木片1", from: [-0.35, TABLE.top + 0.12, -1.30], to: [-1.75, 0.015, -0.70], startAt: 0.60, endAt: 1.08, ease: "easeIn",
          rotTo: [0.1, 0.9, 0.2] },
        { name: "木片2", from: [-0.35, TABLE.top + 0.16, -1.30], to: [-2.00, 0.015, -1.95], startAt: 0.60, endAt: 1.15, ease: "easeIn",
          rotTo: [0.2, -0.7, 0.1] },
        { name: "木片3", from: [-0.35, TABLE.top + 0.10, -1.30], to: [-1.25, 0.015, -1.15], startAt: 0.60, endAt: 1.10, ease: "easeIn",
          rotTo: [0.0, 1.4, 0.15] },
        { name: "木片4", from: [-0.35, TABLE.top + 0.18, -1.30], to: [-2.10, 0.015, -1.20], startAt: 0.60, endAt: 1.16, ease: "easeIn",
          rotTo: [0.15, -1.1, 0.2] },
      ],
      sfx: [
        { at: 0.95, name: "impactWood", volume: 0.8 },
        { at: 1.05, name: "impactMetal", volume: 0.45 },
        { at: 1.18, name: "impactWood", volume: 0.35 },
      ],
      blackOutAt: 2.45,
    },
    {
      n: 8, seconds: 5.8, focalMm: 50, black: true,
      note: "黑场，史源小字",
      camera: { from: [0, 1.4, 2.0], look: [0, 1.4, 0] },
      subs: [
        { at: 0.2, seconds: 5.5, tier: "主流", small: true, text: "另有记载称，发完此电后下令砸毁电台。" },
        { at: 0.2, seconds: 5.5, tier: "主流", small: true, text: "电文原件未见公布，短句与长版都靠转引，" },
        { at: 0.2, seconds: 5.5, tier: "主流", small: true, text: "用字各版本不一致（死拼／死拚）。" },
      ],
    },
  ],
  skipCard: {
    title: "最后一电",
    lines: [
      { tier: "主流", text: "三月十六日，王铭章自滕县城内发出最后一电：「决心死拼，以报国家。」" },
      { tier: "主流", text: "长版另作：「职忆委座成仁之训，及开封面谕嘉慰之词，决心死拼，以报国家，以报知遇。职王铭章叩铣。」「铣」为电报韵目代日，即十六日。" },
      { tier: "主流", text: "另有记载称，发完此电后下令砸毁电台。" },
      { tier: "主流", text: "电文原件未见公布，短句与长版都靠转引，用字各版本不一致（死拼／死拚）。" },
    ],
  },
  // 近年文章引述的「本日已无友军枪声」一句未见出处，属流传待考，**本作不采用**。
  forbiddenLines: ["本日已无友军枪声"],
};
