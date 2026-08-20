// CS_BeimenBreakout「北門突圍」—— 第六关打完接的收尾过场（afterLevel:L6_Beimen，脚下是 L6 的场：
// 北门、瓮城、北门外到 −700 的麦地）。
//
// 目的：必败结构需要一个不带解脱感的收尾。镜 4「没有追兵」是重点 —— 既是史实
// （日军未追击），也是全局最刺人的一句：连追都不必追了。
//
// 几何（出图量过，别凭记忆改）：
//   · 北门内门在 z=−305，城墙 z −300…−310（内脚 −300、外脚 −310）。门洞被关卡自带的
//     土袋塞满：三层袋墙，中心分别在 z −302 / −305 / −308，袋厚 0.34 → 朝城内的那一面
//     在 z≈−301.8，朝瓮城的那一面在 z≈−308.2。
//   · 瓮城半圆 r=18 m，厚 4 m；外门（关门）中心 z≈−326，洞 3.4×5.0 —— 从瓮城里朝北看，
//     它是**画面里最亮的一块**（天 + 外面的地）。注意不是「唯一亮的」：night 预设的
//     IBL 把瓮城内壁照成深紫灰、砖缝还看得清（出图确认过），数据侧压不掉，
//     镜 2 的 note 按实际写，别写成「夜里唯一一块亮的方框」。
//   · 城外地面 y≈−1.2（L6 场）。城里/门洞地面 y=0。
//   · 夜预设（night）曝光 3.6：没有点光的地方就是黑的。这场唯一的光源是城在烧 ——
//     所以每一盏点光都叫「火光」，并且都放在火该在的地方（门内的街、城楼月台）。
//
// 演员（8 个，三组各管一镜，镜间用 hidden 帧瞬移复用 —— 别加到 13 人，
// Script_Cutscene.mjs 文件头的 draw call 账算过）：
//   镜 1 扒门：hou（侯子平，真实人物）+ d1/d2（空手，reach+melee 真的在扒）；
//   镜 2 挤门：o1…o5；
//   镜 3 麦地里那条细线：全部 8 人再上一次。

export const CS_BeimenBreakout = {
  id: "CS_BeimenBreakout",
  title: "北门突围",
  seconds: 28.0,
  trigger: "afterLevel:L6_Beimen",
  sky: "night",
  fadeIn: 0.6,
  standalone: false,
  setOrigin: [0, 0, 0],
  why: "必败结构需要一个不带解脱感的收尾。镜 4「没有追兵」是重点 —— 既是史实（日军未追击），也是全局最刺人的一句：连追都不必追了。",
  props: [
    // 北门洞里堵门的土袋。1938 年守军把南北二门堵死，突围当夜「扒开已屯闭的北城门」。
    // 这六只贴在关卡袋墙朝城内的那一面（z≈−301.8）上，是被扒下来的那几只；
    // 镜 1 的 propMoves 把其中三只拖到扒门人的脚边。
    // repeat:[1,1] + tint 是为了「掉到地上的三只别读成木斜坡」：不给 repeat 时引擎按
    // 世界尺寸铺（Sandbag 一张 0.9 m），0.62×0.24×0.34 的盒子每面只取到贴图的
    // 0.27—0.69 —— 立着的三只朝机位的是 ±z 面、躺下的三只朝机位的是 ±y 面，两组取到
    // 贴图上的不同条带，躺下的那三只于是又亮又粗，像三块打了蜡的木斜坡（上一轮复审
    // 的原话）。六只统一 [1,1]（每面一整张）+ 同一个 tint，才是同一种土袋。
    { kind: "box", size: [0.62, 0.24, 0.34], pos: [-0.55, 0.12, -301.58], ry: 0.12, mat: "Sandbag", repeat: [1, 1], tint: 0xcdbb9a, name: "土袋一" },
    { kind: "box", size: [0.62, 0.24, 0.34], pos: [0.10, 0.12, -301.62], ry: -0.08, mat: "Sandbag", repeat: [1, 1], tint: 0xcdbb9a, name: "土袋二" },
    { kind: "box", size: [0.62, 0.24, 0.34], pos: [0.72, 0.12, -301.58], ry: 0.05, mat: "Sandbag", repeat: [1, 1], tint: 0xcdbb9a, name: "土袋三" },
    { kind: "box", size: [0.62, 0.24, 0.34], pos: [-0.25, 0.36, -301.60], ry: -0.15, mat: "Sandbag", repeat: [1, 1], tint: 0xcdbb9a, name: "土袋四" },
    { kind: "box", size: [0.62, 0.24, 0.34], pos: [0.42, 0.36, -301.58], ry: 0.10, mat: "Sandbag", repeat: [1, 1], tint: 0xcdbb9a, name: "土袋五" },
    { kind: "box", size: [0.62, 0.24, 0.34], pos: [0.08, 0.60, -301.60], ry: 0.02, mat: "Sandbag", repeat: [1, 1], tint: 0xcdbb9a, name: "土袋六" },
    // 火光。城在烧。分两组，**因为两组的活儿是相反的**：
    //
    //   甲组「城上的火」（门内街／檐角／垛口）——  decay 默认 2（平方反比）。这三盏只
    //     负责镜 1、镜 2、镜 4 的近景：门内那盏在镜 1 机位背后给两个扒门人一点边，
    //     檐角两盏是镜 4 长焦里城楼上的那两点橙。**这一组不许改成 decay 1**：试过
    //     70/decay1，17—20 m 外的瓮城内壁直接被照成大白天的土黄砖，镜 2 的「外门是
    //     画面里最亮的一块」当场反过来 —— 亮方框成了全画面最暗的一块。
    //
    //   乙组「城外的火」（板车／麦垛）—— decay:1（§1.8 第三轮补丁）。镜 3 的队伍在
    //     z −340…−372，离城 35—65 m，平方反比下什么光都到不了（上一轮檐角 130/40²
    //     ≈ 0.08，八个人就是深蓝底上的深色小点，六秒半近黑，信息全靠字幕）。
    //     所以把光源挪到队伍**旁边**（城壕外的两处着火物），线性衰减，强度只要 20 上下：
    //     队伍全程拿到 1.3—3.8 的照度，能分辨出人形，而城墙那一头一点都不受影响
    //     —— 瓮城是封闭的，z −350 的地火只能从 3.4×5.0 的外门洞漏一点进去。
    //     史实：城内起火、南风把烟压得笼罩全城（Timeline），门外有零星着火物说得过去。
    { kind: "box", size: [0.5, 0.5, 0.5], pos: [2.6, 2.4, -295.0], color: 0x000000, emissive: 0xff7a30,
      light: { color: 0xff8a40, intensity: 24, distance: 24, offsetY: 0, flicker: 0.55 }, name: "火光·门内" },
    { kind: "box", size: [0.45, 0.45, 0.45], pos: [-6.3, 16.9, -309.6], color: 0x000000, emissive: 0xff7a30,
      light: { color: 0xff8a40, intensity: 130, distance: 90, offsetY: 0, flicker: 0.5 }, name: "火光·檐西" },
    { kind: "box", size: [0.45, 0.45, 0.45], pos: [6.1, 16.9, -309.4], color: 0x000000, emissive: 0xff7a30,
      light: { color: 0xff8a40, intensity: 130, distance: 90, offsetY: 0, flicker: 0.5 }, name: "火光·檐东" },
    { kind: "box", size: [0.6, 0.5, 0.6], pos: [-24.0, 12.9, -304.5], color: 0x000000, emissive: 0xff7a30,
      light: { color: 0xff8a40, intensity: 70, distance: 28, offsetY: 0, flicker: 0.6 }, name: "火光·垛西" },
    // 乙组之一：城壕东边烧着的板车。队伍中段（z −350 一带）的主光。
    // 光心用 offsetY 1.2 抬到车板上方约 1.6 m（火苗，不是躺在板子上的灯泡）——
    // 上一轮 80 + decay 2 时光心离板面不到 0.4 m，板子被烤成一块纯白平板，
    // 读作「麦地里摆了盏台灯」。板子再 tint 压暗：烧剩的车板是火前面的黑影。
    { kind: "box", size: [2.0, 0.16, 1.05], pos: [6.0, -1.06, -350.2], ry: 0.5, rx: 0.06,
      mat: "WoodStock", tint: 0x4a3c2c, roughness: 0.97, name: "板车残骸" },
    { kind: "box", size: [0.55, 0.42, 0.5], pos: [6.0, -0.78, -350.0], color: 0x000000, emissive: 0xc0521c,
      light: { color: 0xff8a40, intensity: 24, distance: 60, decay: 1, offsetY: 1.2, flicker: 0.5 }, name: "火光·板车" },
    // 乙组之二：城壕西边烧着的麦垛，管队尾（z −360…−372）。位置不与板车对称
    // （板车 x+6/z−350，麦垛 x−10.5/z−364，强度也差一档）—— 对称摆两堆等亮的火，
    // 俯拍里就是「麦地上放了两盏台灯」，一眼假。
    // x −10.5 是算过的：镜 2 从机位 (1.55,−309.4) 透过外门洞（±1.7）看出去，z −364
    // 处只看得见 x −9.1…2.0 这一条，−10.5 的火堆本体落在洞口视线外，
    // 不会在那块亮方框里冒出一团橙。
    { kind: "box", size: [1.5, 0.55, 1.4], pos: [-10.5, -1.0, -364.0], ry: 0.35,
      mat: "Sandbag", repeat: [1, 1], tint: 0x6b5a3c, name: "麦垛残骸" },
    { kind: "box", size: [0.42, 0.34, 0.4], pos: [-10.5, -0.66, -364.0], color: 0x000000, emissive: 0xa8460f,
      light: { color: 0xff8a40, intensity: 15, distance: 55, decay: 1, offsetY: 1.0, flicker: 0.6 }, name: "火光·麦垛" },
  ],
  // 镜界（累计秒）：镜1 0–4.5｜镜2 4.5–10.5｜镜3 10.5–17.0｜镜4 17.0–22.5｜镜5 22.5–28.0
  cast: [
    // 侯子平（第 727 团 3 营副营长，真实人物）在扒门人右边压着嗓子指挥：半个持枪
    // 背影在画右缘实打实入画（x0.95 是对着镜 1 机位的水平视角算过再出图校的）。
    { id: "hou", kind: "nra", weapon: "HanYang", seed: "houZiping", track: [
      { t: 0.0, pos: [0.95, 0, -300.35], ry: 0.55, state: { moveSpeed: 0, crouch: 0.55 } },
      { t: 4.4, pos: [0.95, 0, -300.35], ry: 0.55, state: { moveSpeed: 0, crouch: 0.55 } },
      { t: 4.5, pos: [0.95, 0, -300.35], ry: 0.55, state: { hidden: true } },
      // 镜 3：麦地里的细线，排头。全队压到 z −340…−364（3.4 m 间距），从两处地火中间穿过。
      // 1.26 m/s（moveSpeed 0.30）× 6.5 s = 8.2 m
      { t: 10.4, pos: [0.3, -1.2, -340.0], ry: 0, state: { hidden: true } },
      { t: 10.5, pos: [0.3, -1.2, -340.0], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.0, pos: [0.3, -1.2, -348.2], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.1, pos: [0.3, -1.2, -348.4], ry: 0, state: { hidden: true } },
    ] },
    // 扒门的两个（空手）：reach 把双手送到袋墙上，melee 随三次掉袋的节拍在 0.2↔0.7
    // 起伏 —— 拉的时候 0.7，袋子落地就松回 0.2。crouch 0.6 让身体前倾够得着袋子。
    { id: "d1", kind: "nra", weapon: null, seed: "dig1", track: [
      { t: 0.0, pos: [0.75, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.25 } },
      { t: 1.2, pos: [0.75, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.25 } },
      { t: 1.5, pos: [0.75, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.7 } },
      { t: 2.0, pos: [0.75, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.7 } },
      { t: 2.4, pos: [0.75, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.25 } },
      { t: 3.4, pos: [0.75, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.3 } },
      { t: 3.7, pos: [0.75, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.7 } },
      { t: 4.2, pos: [0.75, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.7 } },
      { t: 4.4, pos: [0.75, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.35 } },
      { t: 4.5, pos: [0.75, 0, -300.85], ry: 0, state: { hidden: true } },
      { t: 10.4, pos: [-0.6, -1.2, -343.4], ry: 0, state: { hidden: true } },
      { t: 10.5, pos: [-0.6, -1.2, -343.4], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.0, pos: [-0.6, -1.2, -351.6], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.1, pos: [-0.6, -1.2, -351.8], ry: 0, state: { hidden: true } },
    ] },
    { id: "d2", kind: "nra", weapon: null, seed: "dig2", track: [
      { t: 0.0, pos: [-1.15, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.3 } },
      { t: 2.3, pos: [-1.15, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.25 } },
      { t: 2.7, pos: [-1.15, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.7 } },
      { t: 3.2, pos: [-1.15, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.7 } },
      { t: 3.6, pos: [-1.15, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.3 } },
      { t: 4.4, pos: [-1.15, 0, -300.85], ry: 0, state: { moveSpeed: 0, crouch: 0.6, reach: 1, lookPitch: -0.45, melee: 0.3 } },
      { t: 4.5, pos: [-1.15, 0, -300.85], ry: 0, state: { hidden: true } },
      { t: 10.4, pos: [0.7, -1.2, -346.8], ry: 0, state: { hidden: true } },
      { t: 10.5, pos: [0.7, -1.2, -346.8], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.0, pos: [0.7, -1.2, -355.0], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.1, pos: [0.7, -1.2, -355.2], ry: 0, state: { hidden: true } },
    ] },
    // 镜 2：人一个一个走门洞轴线（x≈0.1—0.5），从画左入画、走向亮方框、在方框里变成剪影
    // 再挤出瓮城外门。速度各不同：o1 2.94 m/s（0.70）、o2 2.52 m/s（0.60）、o3–o5 2.184 m/s（0.52）。
    // **离机位（x1.55）横距 1.2—1.4 m**：near 0.50 m + 手臂/步枪前伸 ~0.5 m，横距低于 1.3 m
    // 就有「躯干被近平面切掉、前伸的手还在画里」的帧（上一轮 0.14—0.24 m、返修第一稿 0.5—0.6 m
    // 都碎过）；1.2 m 以上时人还没进近平面就先出了 24 mm 视锥左缘，任何一帧都不会断肢。
    // 起点 z=−308.7 在机位（−309.4）背后、袋墙（−308.2）前面 —— 上场时不在画内，不会「凭空出现」。
    // 朝 −Z 走 → ry=0（写成 π 就是倒着走，旧版就是这么错的）。
    { id: "o1", kind: "nra", weapon: null, seed: "out1", track: [
      { t: 4.4, pos: [0.30, 0, -308.7], ry: 0, state: { hidden: true } },
      { t: 4.5, pos: [0.30, 0, -308.7], ry: 0, state: { moveSpeed: 0.70 } },
      { t: 10.5, pos: [0.3, 0, -326.3], ry: 0, state: { moveSpeed: 0.70 } },
      { t: 10.6, pos: [0.3, 0, -326.5], ry: 0, state: { hidden: true } },
      { t: 10.7, pos: [-0.4, -1.2, -350.2], ry: 0, state: { hidden: true } },
      { t: 10.8, pos: [-0.4, -1.2, -350.2], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.0, pos: [-0.4, -1.2, -358.0], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.1, pos: [-0.4, -1.2, -358.2], ry: 0, state: { hidden: true } },
    ] },
    { id: "o2", kind: "nra", weapon: "HanYang", seed: "out2", track: [
      { t: 5.1, pos: [0.14, 0, -308.7], ry: 0, state: { hidden: true } },
      { t: 5.2, pos: [0.14, 0, -308.7], ry: 0, state: { moveSpeed: 0.60 } },
      { t: 10.5, pos: [-0.15, 0, -322.1], ry: 0, state: { moveSpeed: 0.60 } },
      { t: 10.6, pos: [-0.15, 0, -322.3], ry: 0, state: { hidden: true } },
      { t: 10.7, pos: [0.5, -1.2, -353.6], ry: 0, state: { hidden: true } },
      { t: 10.8, pos: [0.5, -1.2, -353.6], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.0, pos: [0.5, -1.2, -361.4], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.1, pos: [0.5, -1.2, -361.6], ry: 0, state: { hidden: true } },
    ] },
    { id: "o3", kind: "nra", weapon: null, seed: "out3", track: [
      { t: 5.9, pos: [0.34, 0, -308.7], ry: 0, state: { hidden: true } },
      { t: 6.0, pos: [0.34, 0, -308.7], ry: 0, state: { moveSpeed: 0.52 } },
      { t: 10.5, pos: [0.5, 0, -318.5], ry: 0, state: { moveSpeed: 0.52 } },
      { t: 10.6, pos: [0.5, 0, -318.7], ry: 0, state: { hidden: true } },
      { t: 10.7, pos: [-0.8, -1.2, -357.0], ry: 0, state: { hidden: true } },
      { t: 10.8, pos: [-0.8, -1.2, -357.0], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.0, pos: [-0.8, -1.2, -364.8], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.1, pos: [-0.8, -1.2, -365.0], ry: 0, state: { hidden: true } },
    ] },
    { id: "o4", kind: "nra", weapon: null, seed: "out4", track: [
      { t: 6.8, pos: [0.22, 0, -308.7], ry: 0, state: { hidden: true } },
      { t: 6.9, pos: [0.22, 0, -308.7], ry: 0, state: { moveSpeed: 0.52 } },
      { t: 10.5, pos: [0.50, 0, -316.6], ry: 0, state: { moveSpeed: 0.52 } },
      { t: 10.6, pos: [0.50, 0, -316.8], ry: 0, state: { hidden: true } },
      { t: 10.7, pos: [0.3, -1.2, -360.4], ry: 0, state: { hidden: true } },
      { t: 10.8, pos: [0.3, -1.2, -360.4], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.0, pos: [0.3, -1.2, -368.2], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.1, pos: [0.3, -1.2, -368.4], ry: 0, state: { hidden: true } },
    ] },
    { id: "o5", kind: "nra", weapon: "HanYang", seed: "out5", track: [
      { t: 7.7, pos: [0.18, 0, -308.7], ry: 0, state: { hidden: true } },
      { t: 7.8, pos: [0.18, 0, -308.7], ry: 0, state: { moveSpeed: 0.52 } },
      { t: 10.5, pos: [0.42, 0, -314.6], ry: 0, state: { moveSpeed: 0.52 } },
      { t: 10.6, pos: [0.42, 0, -314.8], ry: 0, state: { hidden: true } },
      { t: 10.7, pos: [-0.2, -1.2, -363.8], ry: 0, state: { hidden: true } },
      { t: 10.8, pos: [-0.2, -1.2, -363.8], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.0, pos: [-0.2, -1.2, -371.6], ry: 0, state: { moveSpeed: 0.30 } },
      { t: 17.1, pos: [-0.2, -1.2, -371.8], ry: 0, state: { hidden: true } },
    ] },
  ],
  shots: [
    {
      n: 1, seconds: 4.5, focalMm: 35,
      note: "固定机位，半人高，在两个扒门人身后偏左：两个蹲着的背影双手扒在袋墙上（reach+melee），土袋随他们的拉拽一只只掉到两人之间的地上。侯子平半个持枪背影在画右缘。门内街上的火在机位背后，只给光不给画",
      camera: { from: [-1.9, 0.8, -298.7], look: [0.15, 0.45, -301.40] },
      lines: [{ at: 0.2, seconds: 4.3, who: "hou", tier: "虚构", text: "扒北门。一个跟一个，别出声。" }],
      propMoves: [
        { name: "土袋六", from: [0.08, 0.60, -301.60], to: [-0.15, 0.12, -300.70], startAt: 1.4, endAt: 2.0, ease: "easeIn",
          rotFrom: [0, 0.02, 0], rotTo: [0.30, 0.45, -0.12] },
        { name: "土袋五", from: [0.42, 0.36, -301.58], to: [0.20, 0.12, -300.10], startAt: 2.6, endAt: 3.2, ease: "easeIn",
          rotFrom: [0, 0.10, 0], rotTo: [-0.22, -0.35, 0.15] },
        { name: "土袋四", from: [-0.25, 0.36, -301.60], to: [-0.45, 0.12, -300.30], startAt: 3.6, endAt: 4.2, ease: "easeIn",
          rotFrom: [0, -0.15, 0], rotTo: [0.25, 0.30, 0.18] },
      ],
      sfx: [{ at: 2.0, name: "impactDirt", volume: 0.45 }, { at: 3.2, name: "impactDirt", volume: 0.42 },
            { at: 4.2, name: "impactDirt", volume: 0.40 }],
    },
    {
      n: 2, seconds: 6.0, focalMm: 24,
      note: "瓮城里向外，固定：外门方框是画面里最亮的一块（瓮城内壁被 night 的 IBL 照成深紫灰，砖缝还看得清，不是纯黑）。人一个一个从机位左肩 1.2—1.4 m 外走进画左，越走越靠画心，最后在亮方框里变成剪影挤出外门",
      // 机位 x 1.55：o1—o5 经过机位 z 平面时 x≈0.95—1.05，横距 0.5—0.6 m（上一轮 x1.2 只有
      // 0.14—0.24，人被近平面切成碎块）。look 直接给外门本体（z −326，不再看穿到 −332）——
      // 被摄物就是这块亮方框，同时把自动 near 从 0.68 收到 0.50，近平面切人的窗口跟着变窄。
      // 内门洞净宽 3.8（±1.9），x1.55 离门垛还有 0.35 m，不穿墙（出图校过）。
      camera: { from: [1.55, 1.35, -309.4], look: [0.0, 1.2, -326.0] },
      subs: [{ at: 0.3, seconds: 5.65, tier: "主流", small: true, text: "三月十七日二十一时，扒开已屯闭的北城门。" }],
      sfx: [{ at: 0.5, name: "footstepDirt", volume: 0.3 }, { at: 1.3, name: "footstepDirt", volume: 0.3 },
            { at: 2.1, name: "footstepDirt", volume: 0.3 }, { at: 3.0, name: "footstepDirt", volume: 0.3 },
            { at: 3.9, name: "footstepDirt", volume: 0.3 }],
    },
    {
      n: 3, seconds: 6.5, focalMm: 50,
      note: "俯拍，城楼顶上方 25 m 高、缓推两米：八个人 3.4 m 间距排成一条细线，从城壕边烧着的板车旁走过。城楼檐角的火（decay 1）把整条线从背后压出边光，板车给中段侧光。瓮城压在画面下缘",
      // 几何都是算过再出图校的：机位 (0,25,−305.5) 看 (0,−1,−354)，俯约 28°，50 mm
      // 下边缘落在俯 41.5°；瓮城墙顶（y 9，z −326）在俯 38° —— 压在画面底部；从这个
      // 机位越过墙顶能看见 z<−339 的地面，所以队伍摆在 −340…−364（排头 hou −340、
      // 队尾 o5 −363.8，间距 3.4 m），6.5 s 走 8.2 m，谁都不会缩回墙后的死区。
      // 光：全靠城壕外的两处地火（**decay:1**，见 props 的「乙组」）—— 画右烧着的板车
      // (6,−350) 管队伍中段、画左烧着的麦垛 (−9.5,−356) 管队尾，两边夹着这条线打侧光。
      // 城上的火（檐角 decay 2）到这儿只剩 0.08，一点忙都帮不上，别再指望它。
      // 验收线：不放大能数出 5 个以上人形，且两处火不是白平板。
      camera: { from: [0.0, 25.0, -305.5], to: [0.0, 24.6, -307.5], look: [0.0, -1.0, -354.0], ease: "easeInOut" },
      subs: [{ at: 0.2, seconds: 6.3, tier: "主流", small: true,
               text: "残部二百余人，加零散部队三百余人，共约五百人。" }],
      sfx: [{ at: 1.6, name: "explosionFar", volume: 0.28 }],
    },
    {
      n: 4, seconds: 5.5, focalMm: 135,
      note: "固定长焦回望（东北方 210 m 外，斜着看北墙）：城墙、瓮城与城楼的轮廓，檐角的火。没有追兵",
      // 不从正北回望：北关弘道院的剪影群（x −120…60，z −455…−385）正好横在正北 200 m 处，
      // 135 mm 下一栋 17 m 的楼把右半幅全挡死。挪到东北方斜看，视线从剪影群东沿外面过。
      // 机位从 y1.6 抬到 y2.8：雾带里地面拼缝的黑划痕大部分落出画框（残余一两道极淡的
      // 短划痕在画面下缘雾里，属引擎侧地面接缝，已写进报告；再抬机位就要裁城楼顶了）。
      camera: { from: [150.0, 2.80, -450.0], look: [0.0, 10.5, -305.0] },
      subs: [{ at: 0.2, seconds: 5.2, tier: "主流", small: true, text: "由三营副营长侯子平指挥。日军未追击。" }],
      sfx: [{ at: 2.8, name: "explosionFar", volume: 0.22 }],
    },
    {
      n: 5, seconds: 5.5, focalMm: 50, black: true,
      note: "黑场：十八日的两句，再接结算",
      camera: { from: [150.0, 1.60, -450.0], look: [0.0, 10.5, -305.0] },
      subs: [
        { at: 0.1, seconds: 4.3, tier: "主流", text: "三月十八日午前后，枪声停止。" },
        { at: 1.0, seconds: 4.5, tier: "主流", text: "同日临城亦陷，津浦路正面洞开。" },
      ],
      tally: true,
    },
  ],
  // 结算面板：**不打歼敌数**。中日双方数字体系差到 2:1 至 100:1 都能凑出来，
  // 中方通行的「阵亡 3000 余」与自家战斗详报的「阵亡 945」相差三倍以上。
  // 只打三个可验证量。
  tally: {
    rows: [
      { label: "守住", value: "一〇八小时", note: "自三月十四日拂晓计（张宣武记）", tier: "主流" },
      { label: "阵地易手", value: "东关 4 次｜南城墙 1 次｜西门楼 1 次", tier: "主流" },
      { label: "出城的人", value: "{poolOut} 人", note: "你带出去的", tier: "游戏" },
    ],
    // 底下两行**必须同时出**，不许只出前一行。
    closing: [
      { tier: "主流", text: "「若无滕县之苦守，焉有台儿庄之战果。」",
        small: "出自《李宗仁回忆录》，一九六〇—七〇年代追述，非一九三八年文件。另有一版作「焉有台儿庄之大捷？台儿庄之战果，实滕县先烈所就也」。" },
      { tier: "主流", text: "亦有档案研究认为，濑谷支队三月十八日下临城、二十日下韩庄峄县，南下节奏未被显著打乱。此因果在学术上有争议。" },
    ],
  },
  skipCard: {
    title: "北门突围",
    lines: [
      { tier: "主流", text: "三月十七日二十一时，第七二七团三营残部二百余人，加城内零散部队三百余人，共约五百人，由三营副营长侯子平指挥，扒开北城门突围。日军未追击。" },
      { tier: "主流", text: "三月十八日午前后，枪声逐渐停止。同日临城亦陷，津浦路正面洞开。" },
    ],
  },
  forbiddenLines: ["歼敌", "全歼"],
};
