// Data_CutsceneCh4.mjs — 第四关｜东关之夜 的两段过场。
// 规格：docs/Data_MissionRemake.md §5「过场动画」（两段合计 ≤60 秒；夜战全程玩家控制）
//       与 §10.1；引擎契约见 docs/Data_CutsceneRedo.md §1。
//
// **纯数据，不许 import three。** 被 Data_TengxianScript.mjs 汇总进 CUTSCENES，
// Script_Cutscene.mjs 是唯一消费者。
//
// ── 本章只有这两段，合计 55.0 s ─────────────────────────────────────────────
//   CS_Ch4_UnfinishedLetter  25.0 s  未写完的回信（口述四句 → 炮火加密 →「先收到。打完再写。」）
//   CS_Ch4_AidStation        30.0 s  救护所（抬回 → 剪开军服 →「再包一道」→「没得脉了」→
//                                    新伤员抬入、军医转身 → 取信停在「等我回来……」）
//
// **罗班长牺牲那一段的对话不在过场里**：策划案写明「无镜头特写、玩家可自由转视角」，
// 所以顺子的不接受→发火→停住→「枪给我」全在 Data_MissionCh4.beats 的关内链上。
// 两边**没有一句台词重复** —— 「没得脉了」只在这里，「不可能／你再看一哈」只在 beats。
//
// ── 挂点与实际播放时机（ENGINE_REQUEST，详见 Data_MissionCh4.mjs 头注第 1 条）──
// 引擎只有 beforeLevel / afterLevel 两个挂点，所以现在：
//   · 回信这一段实际是**进章即播**（策划案要的是九十秒休整之后）；
//   · 救护所这一段实际是**关末才播**（策划案要的是抬着罗班长走进 A 区时播、播完恢复控制）。
// 要的是「beat 触发的关内过场」。落地前照现有挂点写，能播、不报错，只是顺序如上。
//
// ── 夜景的三条坑（照 docs/Data_CutsceneRedo.md 写死在这里）──────────────────
//   1. night 预设曝光 3.6，**室内必须自己挂点光**，不然全黑（不是 bug，是没光）；
//   2. `lookPitch` **正 = 抬头，负 = 低头**。「低头看纸／看伤口」一律给负值；
//      写成正的就是全场抬下巴，背影镜里恰好把整块肤色面对准机位；
//   3. 独立布景 setOrigin 离城心 ≥1800 m（切比雪夫距离），1700 m 内铺着真地形会打架。
//
// ── 台词与语音 ─────────────────────────────────────────────────────────────
// 每句 `voice` 指向 Data_MissionCh4.VOICE_LINES 里的同名行（`ch4_<who>_<NN>`），
// 走 Script_Cutscene._PlayVoice → AudioEngine.Play("voice."+key)。未烘焙时字幕照出。
// 口述那四句与 `Texture/Tex_PaperLetter.png` 上的四列**逐字一致**，改一个字就对不上贴图。

// 回信那一场的屋子：x ∈ [-2.8, 2.8]，z ∈ [-2.3, 2.3]，高 2.9。
// 弹药木箱当写字台（箱面 y=0.42），马灯在西侧另一只箱子上；罗班长蹲在箱北侧，
// 相机就是顺子的眼睛（蹲着写字，眼高 ≈1.05）。
const LETTER_BOX_TOP = 0.42;
const LETTER_PAPER = [0.02, LETTER_BOX_TOP + 0.007, -0.52];

export const CS_Ch4_UnfinishedLetter = {
  id: "CS_Ch4_UnfinishedLetter",
  title: "未写完的回信",
  seconds: 25.0,
  trigger: "beforeLevel:CH4_DongguanYe",
  sky: "night",
  standalone: true,
  // 独立布景：离城心 ≥1800 m（切比雪夫距离）。
  setOrigin: [-2800, 0, 2800],
  why: "罗班长口述四句家书 → 炮火加密 →「先收到。打完再写。」。"
    + "这四句是他这个人物唯一一次把家里的事说出口，也是第四关末尾那张纸的来处（§5 过场 1）。",
  presumed: [],
  people: {},
  forbiddenLines: ["为国捐躯", "壮烈牺牲"],
  props: [
    // ── 屋子本体：大盒子翻成 BackSide，六面砖；地面另铺一块 plane ──
    // 墙用 BrickWall 不用 Adobe：Adobe 一张 1.6 m，在 2.9 m 高的屋里裂纹大得像鹅卵石。
    { kind: "box", size: [5.6, 2.9, 4.6], pos: [0, 1.45, 0], mat: "BrickWall", tint: 0x8d8377, roughness: 0.96, inside: true, name: "屋子" },
    { kind: "plane", size: [5.6, 4.6], pos: [0, 0.012, 0], mat: "Ground", name: "屋内地面" },
    { kind: "box", size: [0.16, 0.18, 4.6], pos: [-1.5, 2.70, 0], mat: "WoodBeam", name: "房梁西" },
    { kind: "box", size: [0.16, 0.18, 4.6], pos: [0.4, 2.70, 0], mat: "WoodBeam", name: "房梁中" },
    { kind: "box", size: [0.16, 0.18, 4.6], pos: [2.0, 2.70, 0], mat: "WoodBeam", name: "房梁东" },
    // 东墙一扇木门，门缝里透一点街上的火光
    { kind: "box", size: [0.05, 1.95, 0.90], pos: [2.76, 0.98, 0.85], mat: "WoodDoor", name: "木门" },
    { kind: "box", size: [0.02, 1.90, 0.05], pos: [2.73, 0.98, 1.32], color: 0x2a1a10, emissive: 0x8a3a12,
      light: { color: 0xff8a3c, intensity: 1.4, distance: 7.0, decay: 1, offsetY: 0, flicker: 0.55 }, name: "门缝火光" },
    // ── 写字台：一只弹药木箱 ──
    { kind: "box", size: [0.74, 0.42, 0.48], pos: [0, 0.21, -0.55], mat: "WoodStock", name: "弹药箱" },
    // 半封回信：Texture/Tex_PaperLetter.png（竖排四列，第四列停在「等我回来……」）。
    // 盒子每个面的 UV 是 0—1，顶面正好铺满整张贴图；纸不吃高光，roughness 拉满。
    { kind: "box", size: [0.21, 0.006, 0.30], pos: LETTER_PAPER, texture: "./Texture/Tex_PaperLetter.png", roughness: 1.0, name: "回信" },
    // 铅笔（轴沿 Z 躺下）
    { kind: "cyl", size: [0.006, 0.15], pos: [0.19, LETTER_BOX_TOP + 0.008, -0.50], rx: 1.5708, color: 0x6a5a3a, roughness: 0.85, name: "铅笔" },
    // 压弹用的桥夹与一只搪瓷碗（顺子手边；机位就在这一侧）
    { kind: "box", size: [0.09, 0.02, 0.06], pos: [-0.24, LETTER_BOX_TOP + 0.012, -0.44], color: 0x8a8478, roughness: 0.55, name: "桥夹1" },
    { kind: "box", size: [0.09, 0.02, 0.06], pos: [-0.24, LETTER_BOX_TOP + 0.034, -0.44], color: 0x8a8478, roughness: 0.55, name: "桥夹2" },
    { kind: "cyl", size: [0.07, 0.05], pos: [-0.28, LETTER_BOX_TOP + 0.026, -0.72], color: 0xb9b3a4, roughness: 0.6, name: "搪瓷碗" },
    // ── 光：马灯坐在西侧另一只弹药箱上（主光），梁下再吊一盏补光 ──
    { kind: "box", size: [0.62, 0.42, 0.44], pos: [-1.05, 0.21, -1.30], mat: "WoodStock", name: "弹药箱西" },
    { kind: "cyl", size: [0.06, 0.20], pos: [-1.05, 0.52, -1.30], color: 0x3a3430, emissive: 0x8a6a38,
      light: { color: 0xffbe78, intensity: 4.2, distance: 8.5, offsetY: 0.02, flicker: 0.20 }, name: "马灯" },
    { kind: "cyl", size: [0.055, 0.18], pos: [0.75, 2.42, 0.55], color: 0x3a3430, emissive: 0x7a5c30,
      light: { color: 0xffc890, intensity: 3.0, distance: 8.0, offsetY: -0.04, flicker: 0.10 }, name: "吊灯" },
    // 墙根靠着的几支枪与一口铁锅（何有田的），院子里的生活痕迹
    { kind: "box", size: [0.08, 1.24, 0.08], pos: [-2.4, 0.62, 1.5], rz: 0.16, mat: "WoodStock", name: "靠墙枪1" },
    { kind: "box", size: [0.08, 1.24, 0.08], pos: [-2.2, 0.62, 1.7], rz: 0.13, mat: "WoodStock", name: "靠墙枪2" },
    { kind: "cyl", size: [0.22, 0.14], pos: [1.9, 0.07, -1.9], color: 0x2e2a26, roughness: 0.85, name: "铁锅" },
  ],
  cast: [
    // 罗班长：空手（顺子执笔），蹲在箱北侧口述。ry 2.35 = 面朝东南、对机位是 3/4 侧影，
    // 不是正脸（脸是一张光板，正对机位就穿帮）。全场低头看纸（lookPitch 负 = 低头）。
    { id: "luo", kind: "nra", weapon: null, seed: "luoCh4Letter", track: [
      // 镜 1 0–5.4 ｜ 镜 2 5.4–10.0 ｜ 镜 3 10.0–14.6 ｜ 镜 4 14.6–19.8 ｜ 镜 5 19.8–25.0
      { t: 0.0, pos: [0.28, 0, -1.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0.80, lookPitch: -0.45 } },
      { t: 14.6, pos: [0.28, 0, -1.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0.80, lookPitch: -0.45 } },
      // 镜 4：「等我回来……」说完抬头，转头看门外（炮声那一头），停在那儿
      { t: 15.2, pos: [0.28, 0, -1.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0.78, lookPitch: 0.02, lookYaw: -0.55 } },
      { t: 19.8, pos: [0.28, 0, -1.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0.78, lookPitch: 0.02, lookYaw: -0.55 } },
      // 镜 5：低头把纸折起、压进衣襟（reach = 双手往身前下方伸）
      { t: 20.4, pos: [0.28, 0, -1.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0.74, lookPitch: -0.35, reach: 0.50 } },
      { t: 21.8, pos: [0.28, 0, -1.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0.74, lookPitch: -0.30, reach: 0.18 } },
      { t: 25.0, pos: [0.28, 0, -1.05], ry: 2.35, state: { moveSpeed: 0, crouch: 0.76, lookPitch: -0.10, reach: 0 } },
    ] },
    // 幺娃：靠着西墙睡着（crouch 0.92 + 低头）。九十秒休整那一段的「有人靠着墙睡着」。
    { id: "yaowa", kind: "nra", weapon: "HanYang", seed: "yaowaCh4Letter", track: [
      { t: 0.0, pos: [-2.05, 0, 1.15], ry: 0.62, state: { moveSpeed: 0, crouch: 0.92, lookPitch: -0.70 } },
      { t: 25.0, pos: [-2.05, 0, 1.15], ry: 0.62, state: { moveSpeed: 0, crouch: 0.92, lookPitch: -0.70 } },
    ] },
  ],
  shots: [
    {
      n: 1, seconds: 5.4, focalMm: 35, fadeIn: 0.8,
      note: "全景（从黑淡入，机位在屋东侧稍高）：土坯屋，马灯，罗班长蹲在弹药箱边的 3/4 侧影，"
        + "箱面上摊着一张纸与一支铅笔；画左墙根靠着枪，画深处幺娃靠墙睡着。远处炮声。"
        + "顺子（玩家）不出现 —— 机位就是他的位置",
      camera: { from: [1.75, 1.35, 0.15], look: [-0.15, 0.55, -0.95] },
      sfx: [
        { at: 0.85, name: "explosionFar", volume: 0.26 },
        // 顺子边压桥夹边听（§5 阶段 3）。过场里按不动键，至少听得见自己在压弹
        { at: 2.60, name: "stripperLoad", volume: 0.42 },
        { at: 4.35, name: "stripperLoad", volume: 0.38 },
      ],
      lines: [{ at: 0.5, seconds: 4.6, who: "luo", voice: "ch4_luo_19", tier: "虚构", text: "娘的眼睛，请郎中再看一哈。" }],
    },
    {
      n: 2, seconds: 4.6, focalMm: 50,
      note: "微距（0.57 m，顺子低头看纸的视角）：整幅画面就是那张信纸与铅笔，"
        + "马灯的暖光斜切过纸面。撤掉 Far() 之后近平面自己收到 0.03，这一镜能真拍",
      camera: { from: [0.05, 0.86, -0.14], look: LETTER_PAPER },
      sfx: [{ at: 2.30, name: "stripperLoad", volume: 0.34 }],
      lines: [{ at: 0.3, seconds: 4.2, who: "luo", voice: "ch4_luo_20", tier: "虚构", text: "欠王家的谷，等发饷再还。" }],
    },
    {
      n: 3, seconds: 4.6, focalMm: 50,
      note: "同一张纸，机位极缓地压下去一点（写第三行）。字还是那四列，一行一行往下走",
      camera: { from: [0.05, 0.86, -0.14], to: [0.03, 0.78, -0.22], look: LETTER_PAPER, ease: "easeOut" },
      sfx: [{ at: 3.40, name: "explosionFar", volume: 0.30 }],
      lines: [{ at: 0.3, seconds: 4.2, who: "luo", voice: "ch4_luo_21", tier: "虚构", text: "春妹的鞋莫做大了。" }],
    },
    {
      n: 4, seconds: 5.2, focalMm: 40,
      note: "侧面半身：他说完「等我回来……」就不说了，抬头转向门外的炮声（lookYaw）。"
        + "这一句之后信就没有下文了 —— 第四关末尾那张纸最后一行停在这里",
      camera: { from: [1.50, 1.15, -0.35], look: [0.30, 0.98, -1.05] },
      sfx: [
        { at: 2.20, name: "explosionFar", volume: 0.34 },
        { at: 3.40, name: "shellIncoming", volume: 0.42 },
        { at: 4.30, name: "explosionFar", volume: 0.46 },
      ],
      lines: [{ at: 0.4, seconds: 3.4, who: "luo", voice: "ch4_luo_22", tier: "虚构", text: "等我回来……" }],
    },
    {
      n: 5, seconds: 5.2, focalMm: 35,
      note: "炮火加密：马灯被震得沉一下再回位，纸被折起压进衣襟（propMoves），他说「先收到。打完再写。」"
        + "说完直接黑出接关卡 —— 不停在他脸上",
      camera: { from: [1.60, 1.25, 0.35], look: [0.15, 0.88, -0.95] },
      shakeAt: [{ at: 1.35, seconds: 0.5, amount: 0.35 }],
      propMoves: [
        // 纸折起来往衣襟里塞：从箱面移到他胸口高度
        { name: "回信", from: LETTER_PAPER, to: [0.24, 0.96, -0.95], startAt: 0.55, endAt: 1.45, ease: "easeOut",
          rotTo: [0.6, 0.3, 0.2] },
        // 马灯被震一下再慢慢回位（同一道具两段，已开始的最晚一段生效）
        { name: "马灯", from: [-1.05, 0.52, -1.30], to: [-1.05, 0.505, -1.30], startAt: 1.30, endAt: 1.42, ease: "linear" },
        { name: "马灯", from: [-1.05, 0.505, -1.30], to: [-1.05, 0.52, -1.30], startAt: 1.42, endAt: 1.95, ease: "easeOut" },
      ],
      sfx: [
        { at: 0.20, name: "explosionFar", volume: 0.42 },
        { at: 0.90, name: "shellIncoming", volume: 0.48 },
        { at: 1.30, name: "explosionFar", volume: 0.58 },
        { at: 1.55, name: "impactBrick", volume: 0.30 },
      ],
      lines: [{ at: 1.6, seconds: 3.4, who: "luo", voice: "ch4_luo_23", tier: "虚构", text: "先收到。打完再写。" }],
      blackOutAt: 4.6,
    },
  ],
  skipCard: {
    title: "未写完的回信",
    lines: [
      { tier: "虚构", text: "夜袭出发前，罗班长口述家信，顺子代笔：娘的眼睛请郎中再看一哈；欠王家的谷等发饷再还；春妹的鞋莫做大了；等我回来……" },
      { tier: "虚构", text: "炮声加密，东街喊支援。信只写到第四行，他把纸压进衣襟：「先收到。打完再写。」" },
    ],
  },
};

// 救护所那一场：A 区主救护所的一间屋（与第三关、第五关同一个院子）。
// x ∈ [-4.5, 4.5]，z ∈ [-3.75, 3.75]，高 3.2。南墙 z=+3.75 是门（新伤员从这里抬进来），
// 西墙一处被炸开、用门板挡着，缝里透街上的火光。门板担架架在两垛砖上（板面 y=0.33）。
const AID_BOARD_TOP = 0.33;

export const CS_Ch4_AidStation = {
  id: "CS_Ch4_AidStation",
  title: "没得脉了",
  seconds: 30.0,
  trigger: "afterLevel:CH4_DongguanYe",
  sky: "night",
  standalone: true,
  setOrigin: [2800, 0, -2800],
  why: "抬回、军医剪开军服抢救、顺子递纱布压伤口；军医「没得脉了」，新伤员抬入、军医转身去救别人，"
    + "顺子取出那封信，最后一行停在「等我回来……」。**不给特写、不给慢动作** —— "
    + "他死在一间忙不过来的屋子里，没有人停下来（§5 过场 2）。",
  presumed: [],
  people: {},
  // 这一段最容易被写坏的方向：把一个班长的死写成慷慨赴义。红线钉在这里。
  forbiddenLines: ["为国捐躯", "壮烈牺牲", "英勇就义", "死得其所"],
  props: [
    { kind: "box", size: [9.0, 3.2, 7.5], pos: [0, 1.6, 0], mat: "BrickWall", tint: 0x8a8074, roughness: 0.96, inside: true, name: "屋子" },
    { kind: "plane", size: [9.0, 7.5], pos: [0, 0.012, 0], mat: "GroundRubble", name: "屋内地面" },
    { kind: "box", size: [0.18, 0.20, 7.5], pos: [-2.6, 2.98, 0], mat: "WoodBeam", name: "房梁西" },
    { kind: "box", size: [0.18, 0.20, 7.5], pos: [0.2, 2.98, 0], mat: "WoodBeam", name: "房梁中" },
    { kind: "box", size: [0.18, 0.20, 7.5], pos: [2.8, 2.98, 0], mat: "WoodBeam", name: "房梁东" },
    // 西墙炸开的口子：一块斜靠的门板挡着，边上一条缝透火光（street 在烧）
    { kind: "box", size: [0.06, 2.10, 1.30], pos: [-4.36, 1.05, -1.20], rz: 0.14, mat: "WoodDoor", name: "堵墙的门板" },
    { kind: "box", size: [0.02, 2.00, 0.10], pos: [-4.44, 1.00, -0.48], color: 0x2a1508, emissive: 0x8a3a12,
      light: { color: 0xff8a3c, intensity: 2.6, distance: 12.0, decay: 1, offsetY: 0, flicker: 0.55 }, name: "墙缝火光" },
    // 第三关拆的那批门板还靠在墙根 —— 玩家应该认得出来（§5 阶段 10）
    { kind: "box", size: [0.05, 1.85, 0.78], pos: [3.05, 0.94, -2.60], rz: 0.10, mat: "WoodDoor", name: "门板堆1" },
    { kind: "box", size: [0.05, 1.85, 0.78], pos: [3.18, 0.94, -2.42], rz: 0.12, mat: "WoodDoor", name: "门板堆2" },
    { kind: "box", size: [0.05, 1.80, 0.74], pos: [3.30, 0.92, -2.24], rz: 0.09, mat: "WoodDoor", name: "门板堆3" },
    // 小秦接电话的那个墙角与墙上的旧报纸（三关的两处地标，原位不动）
    { kind: "box", size: [0.16, 0.22, 0.14], pos: [4.34, 1.12, 1.90], color: 0x2f2a24, roughness: 0.8, name: "墙上电话" },
    { kind: "box", size: [0.02, 0.44, 0.32], pos: [4.42, 1.55, 1.30], texture: "./Texture/Tex_PaperNewspaper.png", roughness: 1.0, name: "旧报纸" },
    // 门板担架：两垛砖 + 一块门板。罗班长躺在上面
    { kind: "box", size: [0.34, 0.30, 0.30], pos: [0, 0.15, -1.15], mat: "Stone", name: "砖垛前" },
    { kind: "box", size: [0.34, 0.30, 0.30], pos: [0, 0.15, 0.35], mat: "Stone", name: "砖垛后" },
    { kind: "box", size: [0.62, 0.06, 1.90], pos: [0, 0.30, -0.40], mat: "WoodDoor", name: "门板担架" },
    // 新抬进来的那副（镜 5 从门口进来）
    { kind: "box", size: [0.60, 0.05, 1.85], pos: [2.45, 0.30, 3.50], mat: "WoodDoor", name: "新门板" },
    // 罗班长衣襟里的那封信 —— 镜 6 才取出来。同一张贴图，与 B 区那一场是同一张纸。
    // **基座位置压到地面以下**：propMoves 在 startAt 之前不生效（Script_Cutscene 里
    // `local < startAt` 直接 continue），道具会一直待在这个基座位上。摆在箱面/胸口的话，
    // 镜 1—5 全程都能看见一张白纸浮在那儿。镜 6 的 from 再把它放回衣襟高度往上抽。
    { kind: "box", size: [0.21, 0.006, 0.30], pos: [0.10, -0.40, -0.62], texture: "./Texture/Tex_PaperLetter.png", roughness: 1.0, name: "回信" },
    // 药箱（少了一半）、绷带卷、一只倒着的搪瓷盆
    { kind: "box", size: [0.52, 0.34, 0.38], pos: [1.55, 0.17, -1.95], mat: "WoodStock", name: "药箱1" },
    { kind: "box", size: [0.50, 0.32, 0.36], pos: [2.15, 0.16, -1.80], mat: "WoodStock", name: "药箱2" },
    { kind: "cyl", size: [0.05, 0.06], pos: [0.72, 0.03, -0.95], color: 0xcfc6b2, roughness: 0.95, name: "绷带卷" },
    { kind: "cyl", size: [0.20, 0.08], pos: [1.05, 0.04, 0.20], color: 0xb9b3a4, roughness: 0.6, name: "搪瓷盆" },
    // 光：担架头一盏马灯（主光）、梁下一盏（全屋补光）
    { kind: "cyl", size: [0.06, 0.20], pos: [0.85, 0.62, -1.35], color: 0x3a3430, emissive: 0x8a6a38,
      light: { color: 0xffbe78, intensity: 4.6, distance: 9.5, offsetY: 0.02, flicker: 0.22 }, name: "马灯" },
    { kind: "cyl", size: [0.06, 0.20], pos: [-0.4, 2.45, 1.1], color: 0x3a3430, emissive: 0x7a5c30,
      light: { color: 0xffc890, intensity: 4.0, distance: 13.0, decay: 1, offsetY: -0.04, flicker: 0.12 }, name: "吊灯" },
  ],
  cast: [
    // 罗班长：躺在门板上（prone），全场不动。**不给他任何「临终动作」** ——
    // 军医剪开军服、摸脉、放手，都在别人身上发生
    { id: "luo", kind: "nra", weapon: null, seed: "luoCh4Aid", track: [
      // 镜 1 0–5.0 ｜ 镜 2 5.0–9.8 ｜ 镜 3 9.8–15.0 ｜ 镜 4 15.0–19.4 ｜ 镜 5 19.4–25.0 ｜ 镜 6 25.0–30.0
      // 被抬进来的那 2.95 s：人跟着门板走，travelSpeed 告诉滑步自检「他是被抬的，不是自己在走」
      { t: 0.0, pos: [0, AID_BOARD_TOP, 2.55], ry: 0, state: { prone: 1, moveSpeed: 0, travelSpeed: 1.0 } },
      { t: 2.95, pos: [0, AID_BOARD_TOP, -0.40], ry: 0, state: { prone: 1, moveSpeed: 0, travelSpeed: 0 } },
      { t: 30.0, pos: [0, AID_BOARD_TOP, -0.40], ry: 0, state: { prone: 1, moveSpeed: 0, travelSpeed: 0 } },
    ] },
    // 军医：跪在担架东侧动手（kneel + reach）。镜 5 起身走向新抬进来的人 —— 这一走
    // 就是整场的重量所在，所以给足 1.6 s，别切掉
    { id: "junyi", kind: "nra", weapon: null, seed: "junyiCh4", track: [
      { t: 0.0, pos: [0.62, 0, -0.35], ry: 1.49, state: { moveSpeed: 0, kneel: 0.90, reach: 0.45, lookPitch: -0.55 } },
      { t: 19.4, pos: [0.62, 0, -0.35], ry: 1.49, state: { moveSpeed: 0, kneel: 0.90, reach: 0.52, lookPitch: -0.55 } },
      // 抬头（新伤员在喊）
      { t: 20.2, pos: [0.62, 0, -0.35], ry: 1.49, state: { moveSpeed: 0, kneel: 0.10, reach: 0, lookPitch: 0.05 } },
      // 转身走开：1.46 m / 1.6 s = 0.91 m/s → moveSpeed 0.217（轨道速度必须 = moveSpeed×4.2）。
      // 走向 (0.83, 1.20)：ry = atan2(-dx, -dz) = -2.54（写反了人就背对着走）
      { t: 20.4, pos: [0.62, 0, -0.35], ry: -2.54, state: { moveSpeed: 0.217, kneel: 0, lookPitch: -0.05 } },
      // 到位后转向新抬进来的那个人 (0.40, 0.25) → ry = -2.13
      { t: 22.0, pos: [1.45, 0, 0.85], ry: -2.13, state: { moveSpeed: 0, kneel: 0.80, reach: 0.45, lookPitch: -0.50 } },
      { t: 30.0, pos: [1.45, 0, 0.85], ry: -2.13, state: { moveSpeed: 0, kneel: 0.80, reach: 0.45, lookPitch: -0.50 } },
    ] },
    // 抬罗班长进来的两个人：2.95 m / 2.95 s = 1.0 m/s → moveSpeed 0.238
    { id: "danjia1", kind: "nra", weapon: null, seed: "danjiaCh4A", track: [
      { t: 0.0, pos: [0, 0, 1.45], ry: 0, state: { moveSpeed: 0.238, crouch: 0.20, reach: 0.30, lookPitch: -0.20 } },
      { t: 2.95, pos: [0, 0, -1.50], ry: 0, state: { moveSpeed: 0, crouch: 0.35, reach: 0.35, lookPitch: -0.35 } },
      { t: 30.0, pos: [0, 0, -1.50], ry: 0, state: { moveSpeed: 0, crouch: 0.20, reach: 0, lookPitch: -0.30 } },
    ] },
    { id: "danjia2", kind: "nra", weapon: null, seed: "danjiaCh4B", track: [
      { t: 0.0, pos: [0, 0, 3.55], ry: 0, state: { moveSpeed: 0.238, crouch: 0.20, reach: 0.30, lookPitch: -0.20 } },
      { t: 2.95, pos: [0, 0, 0.60], ry: 0, state: { moveSpeed: 0, crouch: 0.35, reach: 0.35, lookPitch: -0.35 } },
      { t: 30.0, pos: [0, 0, 0.60], ry: 0, state: { moveSpeed: 0, crouch: 0.20, reach: 0, lookPitch: -0.30 } },
    ] },
    // 镜 5：新伤员与两名担架员从南门进来。2.47 m / 2.5 s = 0.99 m/s → moveSpeed 0.236
    { id: "danjia3", kind: "nra", weapon: null, seed: "danjiaCh4C", track: [
      { t: 19.4, pos: [2.35, 0, 3.40], ry: 0.24, state: { moveSpeed: 0.236, crouch: 0.20, reach: 0.30, lookPitch: -0.20 } },
      { t: 21.9, pos: [1.75, 0, 1.00], ry: 0.24, state: { moveSpeed: 0, crouch: 0.35, reach: 0.35, lookPitch: -0.35 } },
      { t: 30.0, pos: [1.75, 0, 1.00], ry: 0.24, state: { moveSpeed: 0, crouch: 0.35, reach: 0.30, lookPitch: -0.35 } },
    ] },
    { id: "danjia4", kind: "nra", weapon: null, seed: "danjiaCh4D", track: [
      { t: 19.4, pos: [2.55, 0, 3.66], ry: 0.24, state: { moveSpeed: 0.236, crouch: 0.20, reach: 0.30, lookPitch: -0.20 } },
      { t: 21.9, pos: [1.95, 0, 1.26], ry: 0.24, state: { moveSpeed: 0, crouch: 0.35, reach: 0.35, lookPitch: -0.35 } },
      { t: 30.0, pos: [1.95, 0, 1.26], ry: 0.24, state: { moveSpeed: 0, crouch: 0.35, reach: 0.30, lookPitch: -0.35 } },
    ] },
    { id: "newWounded", kind: "nra", weapon: null, seed: "newWoundedCh4", track: [
      { t: 19.4, pos: [2.45, AID_BOARD_TOP, 3.50], ry: 0.24, state: { prone: 1, moveSpeed: 0, travelSpeed: 0.99 } },
      { t: 21.9, pos: [1.85, AID_BOARD_TOP, 1.10], ry: 0.24, state: { prone: 1, moveSpeed: 0, travelSpeed: 0 } },
      { t: 30.0, pos: [1.85, AID_BOARD_TOP, 1.10], ry: 0.24, state: { prone: 1, moveSpeed: 0, travelSpeed: 0 } },
    ] },
    // 地上躺着的伤员（屋子挤满了人 —— 这是「医护忙不过来」的画面依据，不是背景装饰）
    { id: "wounded1", kind: "nra", weapon: null, seed: "woundedCh4A", track: [
      { t: 0.0, pos: [-2.65, 0, -1.60], ry: 1.57, state: { prone: 1, moveSpeed: 0 } },
      { t: 30.0, pos: [-2.65, 0, -1.60], ry: 1.57, state: { prone: 1, moveSpeed: 0 } },
    ] },
    { id: "wounded2", kind: "nra", weapon: null, seed: "woundedCh4B", track: [
      { t: 0.0, pos: [-2.95, 0, 0.30], ry: 1.57, state: { prone: 1, moveSpeed: 0 } },
      { t: 30.0, pos: [-2.95, 0, 0.30], ry: 1.57, state: { prone: 1, moveSpeed: 0 } },
    ] },
    { id: "wounded3", kind: "nra", weapon: null, seed: "woundedCh4C", track: [
      { t: 0.0, pos: [-2.70, 0, 2.05], ry: 1.57, state: { prone: 1, moveSpeed: 0 } },
      { t: 30.0, pos: [-2.70, 0, 2.05], ry: 1.57, state: { prone: 1, moveSpeed: 0 } },
    ] },
  ],
  shots: [
    {
      n: 1, seconds: 5.0, focalMm: 35, fadeIn: 0.6,
      note: "全景（机位在屋东南角）：地上一排躺着的人，门板担架被两个人抬进来、架到砖垛上；"
        + "马灯在担架头，西墙缝里透着街上的火光。军医已经跪在那儿动手",
      camera: { from: [3.00, 1.65, 2.60], look: [0.10, 0.70, -0.30] },
      propMoves: [
        { name: "门板担架", from: [0, 0.30, 2.55], to: [0, 0.30, -0.40], startAt: 0.0, endAt: 2.95, ease: "linear" },
      ],
      sfx: [
        { at: 0.30, name: "footstepDirt", volume: 0.5 }, { at: 0.85, name: "footstepDirt", volume: 0.5 },
        { at: 1.45, name: "footstepDirt", volume: 0.5 }, { at: 2.05, name: "footstepDirt", volume: 0.5 },
        { at: 3.05, name: "impactWood", volume: 0.45 },
        { at: 4.10, name: "explosionFar", volume: 0.28 },
      ],
      lines: [{ at: 0.4, seconds: 3.0, who: "danjiayuan", voice: "ch4_danjiayuan_01", tier: "虚构", text: "让一哈！让开！" }],
    },
    {
      n: 2, seconds: 4.8, focalMm: 50,
      note: "近景：越过军医的手看罗班长腹部那一片血污的军服，剪刀一路剪开。"
        + "只给手与布，不给脸 —— 剪刀声是这一镜的主音（引擎没有剪刀音效，暂用轻的 impactMetal）",
      camera: { from: [1.15, 1.05, 0.35], look: [0.00, 0.42, -0.45] },
      sfx: [
        { at: 1.60, name: "impactMetal", volume: 0.16 }, { at: 1.88, name: "impactMetal", volume: 0.14 },
        { at: 2.16, name: "impactMetal", volume: 0.16 }, { at: 2.44, name: "impactMetal", volume: 0.13 },
        { at: 3.90, name: "explosionFar", volume: 0.24 },
      ],
      lines: [{ at: 0.5, seconds: 3.6, who: "junyi", voice: "ch4_junyi_06", tier: "虚构", text: "剪开。灯拿近点。" }],
    },
    {
      n: 3, seconds: 5.2, focalMm: 50,
      note: "顺子这一侧（机位低、贴着担架西沿）：纱布递过去、手压在伤口上。"
        + "「他刚才还在喘」是玩家自己说的 —— 机位就是他，画面里没有他",
      camera: { from: [-0.85, 1.00, 0.05], look: [0.05, 0.45, -0.50] },
      lines: [{ at: 0.4, seconds: 4.4, who: "shunzi", voice: "ch4_shunzi_16", tier: "虚构", text: "再包一道。他刚才还在喘。" }],
    },
    {
      n: 4, seconds: 4.4, focalMm: 40,
      note: "军医摸脉、停手、抬头。**不给特写、不停顿、不加音效**：他说完就得去救下一个",
      camera: { from: [0.95, 1.25, -1.35], look: [0.15, 0.55, -0.35] },
      lines: [{ at: 1.0, seconds: 3.0, who: "junyi", voice: "ch4_junyi_07", tier: "虚构", text: "没得脉了。" }],
    },
    {
      n: 5, seconds: 5.6, focalMm: 35,
      note: "南门那头又抬进来一个：有人喊「这边还在出血！」，军医起身、转身、走过去跪下。"
        + "机位退到屋子东南、压低角度，一个画面里同时装下门口（新伤员）、军医的去向、"
        + "与画左那块没人再看的门板（罗班长）—— 全场最重的一镜，靠调度不靠台词",
      camera: { from: [3.60, 1.70, -1.60], look: [1.00, 0.85, 0.60] },
      propMoves: [
        { name: "新门板", from: [2.45, 0.30, 3.50], to: [1.85, 0.30, 1.10], startAt: 0.0, endAt: 2.5, ease: "linear" },
      ],
      sfx: [
        { at: 0.25, name: "footstepDirt", volume: 0.5 }, { at: 0.80, name: "footstepDirt", volume: 0.5 },
        { at: 1.35, name: "footstepDirt", volume: 0.5 }, { at: 1.90, name: "footstepDirt", volume: 0.5 },
        { at: 4.60, name: "explosionFar", volume: 0.26 },
      ],
      lines: [{ at: 0.8, seconds: 3.2, who: "danjiayuan", voice: "ch4_danjiayuan_02", tier: "虚构", text: "这边还在出血！" }],
    },
    {
      n: 6, seconds: 5.0, focalMm: 85,
      note: "微距（0.6 m）：那张信从他衣襟里被取出来，摊在马灯下 —— 竖排四列，"
        + "最后一列停在「等我回来……」，下面一片空白。字幕只补这一句，没有台词、没有音乐。"
        + "黑出之后交回控制权（策划案：玩家可自由转视角，顺子的话在关内说）",
      camera: { from: [0.05, 0.95, -0.05], look: [0.10, 0.62, -0.62] },
      propMoves: [
        // 从衣襟（板面之下、身体里，看不见）往上抽出来，停在马灯的光圈里
        { name: "回信", from: [0.10, AID_BOARD_TOP - 0.02, -0.62], to: [0.10, 0.62, -0.62], startAt: 0.0, endAt: 1.20, ease: "easeOut" },
      ],
      sfx: [{ at: 3.60, name: "explosionFar", volume: 0.22 }],
      subs: [{ at: 1.6, seconds: 3.2, tier: "虚构", big: true, text: "等我回来……" }],
      blackOutAt: 4.4,
    },
  ],
  skipCard: {
    title: "没得脉了",
    lines: [
      { tier: "虚构", text: "罗班长被抬回城内主救护所。军医剪开军服抢救，顺子递纱布压住伤口：「再包一道。他刚才还在喘。」" },
      { tier: "虚构", text: "军医摸了脉：「没得脉了。」新伤员抬进来，有人喊「这边还在出血」，军医转身去救别人。" },
      { tier: "虚构", text: "顺子从他衣襟里取出那封信。最后一行停在「等我回来……」。" },
    ],
  },
};

/** 本章过场（按播放顺序）。Data_TengxianScript 汇总时照这个数组展开。 */
export const CH4_CUTSCENES = [CS_Ch4_UnfinishedLetter, CS_Ch4_AidStation];

export default CH4_CUTSCENES;
