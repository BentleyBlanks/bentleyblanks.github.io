// Data_CutsceneCh3.mjs — 第三关｜救护所 的两段固定演出。规格：docs/Data_MissionRemake.md §4「过场动画」。
//
// **纯数据，不许 import three。** 被 Data_TengxianScript.mjs 汇总进 CUTSCENES，
// Script_Cutscene.mjs 是唯一消费者；字段说明见 Data_TengxianScript.mjs「过场」一节
// 与 docs/Data_CutsceneRedo.md §1。
//
// ---------------------------------------------------------------------------
// 这一章的过场规格（§4 过场节，逐条抄在这里，改之前先读）
//
//   **固定演出合计 ≤20 秒。** 本文件两段：14.8 + 4.8 = 19.6 s。
//
//   1「破墙外」14.8 s —— 一名无法站立的伤兵被拖出踢倒，日军以侮辱性称呼逼问番号，
//     未答即遭刺杀；另一人扯救护白布擦刺刀。罗班长压低声音「左右分开。」→
//     大喊「开火！里头活的带出来！」**立即恢复控制**。
//   2「传单入火」4.8 s —— 顺子拾传单、看一眼院内的白布、投进炉火，火焰引燃
//     阻断追兵的油料。**全程无台词**（幺娃那两句「保命……／保个鸭儿的命。」
//     在过场外面说，见 Data_MissionCh3.beats 阶段 11）。
//
//   两段都是**关内演出**，不是关末过场：传单入火发生在撤回 A 区**之前**
//   （火封的是撤退路上的追兵），挂成 cutsceneOut 因果顺序就反了。
//   触发接线登记在 Data_MissionCh3.mjs 头注 ER-1 / ER-3 与 EVENTS
//   （ExecutionConfirmed / LeafletBurned）。没接线时只能在选章的「测试场景」组预览。
//
// ---------------------------------------------------------------------------
// 内容红线（这一段最容易做错，写死在这里）
//
//   · **只演一次正在发生的处决。** 其余全部用尸体、血迹、拖痕、声音表现 ——
//     院子里躺着的那一排在镜 1 一开始就在画面里，观众自己会把前面发生过什么补齐。
//   · **不延长观看、不猎奇。** 刺刀那一下发生在镜 2 的最后 0.35 s，
//     被军曹的背影挡掉大半，随即切走；不给特写、不给慢动作、不给血浆。
//   · **日方台词不做无意义辱骂堆叠。** 全场四句：一句「站不起来的到墙边去」
//     （这才是「系统处决」四个字的证据）、一句「拖出来」、逼问番号两句。
//     「支那兵」是 1938 年日方作战文书与部队口语的通称，属史实用语，只用一次。
//     禁「バカヤロー」（Data_Voice 日方那一批的黑名单第一条）。
//   · **批判力度由队友台词与环境叙事完成**，不由镜头的残忍程度完成：
//     白布担架、翻倒的药箱、地上的拖痕、扯白布擦刺刀这四样，比任何特写都硬。
//   · 台词字幕写中文，`voice` 点的是纯假名那一条（seed-audio 从文本判断语言，
//     见 Data_MissionCh3.VOICE_LINES 的日方注释）。
// ---------------------------------------------------------------------------

// 破墙缺口的边界：镜 1／镜 2 的机位都在缺口正后方，视线要从这个洞里穿过去。
// 缺口 x ∈ [-0.8, 0.8]、z = -3.2、下沿被碎砖垫到 0.5 m、上沿 2.3 m（墙高）。
// 院内所有被摄物的连线在 z=-3.2 处的 x 都落在 ±0.8 内 —— 挪演员之前先验这一条，
// 不然人会被墙挡掉，而画面上看不出是被挡了（只是「那儿没人」）。
const GAP_Z = -3.2;

export const CS_Ch3_BreakWall = {
  id: "CS_Ch3_BreakWall",
  title: "破墙外",
  seconds: 14.8,
  // 关内演出：由 Data_MissionCh3.EVENTS 的 ExecutionConfirmed 触发（ER-1）。
  // Script_CutsceneShot 的 DefaultPhase 认不出这个前缀会退回 phase 0 —— 无所谓，
  // 本场是 standalone，脚下那一关的场一点都用不上。
  trigger: "inLevel:CH3_Jiuhusuo@ExecutionConfirmed",
  sky: "smokyDay",
  standalone: true,
  // 独立布景：离城心 ≥1800 m（切比雪夫距离），1700 m 内铺着真地形会和自己的地面打架。
  setOrigin: [-2600, 0, 2600],
  why: "让玩家亲眼确认「里头正在发生什么」—— 不是被告知，是自己趴在破墙后面看见的。看清了就可以开火，主动权始终在玩家手上。",
  presumed: [],
  people: {},
  forbiddenLines: [
    "バカヤロー（抗日神剧标志，Data_Voice 日方黑名单第一条）",
    "任何超出「逼问番号」的辱骂堆叠",
    "任何把处决说破的旁白（画面已经说完了，再解释一遍就是不信任观众）",
  ],

  props: [
    // 地面铺得比取景范围大一圈：standalone 布景外面是虚空，露边比什么都出戏。
    { kind: "plane", size: [80, 80], pos: [0, 0, 6], mat: "Ground", name: "院地" },

    // ── 近侧那道破墙（玩家这一边）：两截墙 + 中间 1.6 m 的缺口 ──────────
    { kind: "box", size: [5.6, 2.3, 0.45], pos: [-3.6, 1.15, GAP_Z], mat: "BrickWallSooty", name: "破墙左" },
    { kind: "box", size: [5.6, 2.3, 0.45], pos: [3.6, 1.15, GAP_Z], mat: "BrickWallSooty", name: "破墙右" },
    // 缺口下沿塌下来的砖：顶到 0.5 m，压在机位视平线以下，不挡视线只框住画面下边。
    { kind: "box", size: [1.5, 0.5, 0.7], pos: [-0.2, 0.2, -3.15], ry: 0.3, rx: 0.14, mat: "GroundRubble", name: "缺口碎砖" },
    { kind: "box", size: [0.75, 0.34, 0.5], pos: [0.62, 0.15, -3.05], ry: -0.5, rx: 0.22, mat: "BrickWallSooty", name: "缺口碎砖二" },

    // ── 院子的三面（相机永远看不见布景外面）──────────────────────────
    { kind: "box", size: [26, 2.6, 0.5], pos: [0, 1.3, 14.6], mat: "BrickWall", name: "北院墙" },
    { kind: "box", size: [0.5, 2.6, 18], pos: [-11, 1.3, 5.6], mat: "BrickWall", name: "西院墙" },
    { kind: "box", size: [0.5, 2.6, 18], pos: [11, 1.3, 5.6], mat: "BrickWall", name: "东院墙" },

    // ── 救护点正房（伤兵是从这个门里被拖出来的）───────────────────────
    { kind: "box", size: [9, 3.2, 5.5], pos: [4.6, 1.6, 10.5], mat: "Adobe", name: "正房" },
    { kind: "box", size: [9.8, 0.35, 6.2], pos: [4.6, 3.35, 10.5], mat: "RoofTile", name: "正房顶" },
    // 门洞：一块深色薄板贴在正房南面（z=7.75）上，读成一个黑洞口。
    { kind: "box", size: [1.3, 2.1, 0.12], pos: [1.4, 1.05, 7.72], color: 0x14100d, name: "屋门洞" },

    // ── 救护点的身份证：白布担架、药箱。这四样比任何特写都硬 ───────────
    { kind: "box", size: [0.62, 0.14, 1.95], pos: [-4.2, 0.07, 12.9], ry: 0.06, color: 0xd6d2c4, name: "白布担架一" },
    { kind: "box", size: [0.6, 0.13, 1.9], pos: [-2.5, 0.06, 12.95], ry: -0.04, color: 0xcfcabb, name: "白布担架二" },
    { kind: "box", size: [0.75, 0.45, 0.5], pos: [-6.2, 0.22, 11.4], ry: -0.2, rx: 0.5, mat: "WoodDoor", name: "药箱一（翻倒）" },
    { kind: "box", size: [0.7, 0.42, 0.48], pos: [-6.9, 0.21, 10.4], ry: 0.5, mat: "WoodDoor", name: "药箱二" },
    // 药箱里倒出来的绷带卷。
    { kind: "cyl", size: [0.09, 0.14], pos: [-5.6, 0.07, 10.9], rx: 1.5708, color: 0xd9d4c3, name: "绷带卷" },

    // ── 拖痕与血迹：前面发生过的事，不用演 ────────────────────────────
    { kind: "plane", size: [1.1, 4.6], pos: [1.0, 0.02, 9.6], ry: 0.12, color: 0x3b1d16, roughness: 1.0, name: "拖痕" },
    { kind: "plane", size: [2.4, 1.6], pos: [-3.4, 0.02, 12.2], color: 0x39201a, roughness: 1.0, name: "血迹一" },
    { kind: "plane", size: [1.4, 1.0], pos: [2.2, 0.02, 12.4], color: 0x341c17, roughness: 1.0, name: "血迹二" },

    // ── 满地的投降传单（「放下武器，可保生命」）────────────────────────
    { kind: "plane", size: [0.28, 0.2], pos: [-1.6, 0.03, 8.2], color: 0xcfc9b6, name: "传单一" },
    { kind: "plane", size: [0.26, 0.19], pos: [0.4, 0.03, 6.4], ry: 0.6, color: 0xc9c3b0, name: "传单二" },
    { kind: "plane", size: [0.27, 0.2], pos: [-4.8, 0.03, 9.1], ry: -0.9, color: 0xccc6b3, name: "传单三" },

    // ── 玩家这一侧（镜 3）：巷子里的瓦砾与一堵烧黑的山墙，把空间关上 ────
    { kind: "box", size: [0.5, 2.4, 7.0], pos: [-7.2, 1.2, -6.4], mat: "BrickWallSooty", name: "巷西墙" },
    { kind: "box", size: [2.6, 0.3, 1.9], pos: [-3.5, 0.1, -5.6], ry: 0.3, rx: -0.12, mat: "GroundRubble", name: "巷瓦砾一" },
    { kind: "box", size: [1.4, 0.36, 1.0], pos: [2.9, 0.16, -5.2], ry: -0.6, rx: 0.2, mat: "BrickWallSooty", name: "巷瓦砾二" },
  ],

  // Actor 正面是局部 -Z：ry = Math.atan2(-dx, -dz) 让他面朝 (dx, dz)。
  // 每一帧把用到的数值字段写全 —— SampleTrack 对缺省字段按 0 插值，
  // 少写一个 crouch 就是 0.15 s 里整个人被拉直。
  cast: [
    // ── 被拖出来的伤兵 ────────────────────────────────────────────────
    // 站不起来的人被两个人架着往墙根拖：0.304×4.2 = 1.28 m/s，是「拖」不是「走」。
    { id: "victim", kind: "nra", weapon: null, seed: "ch3Victim", track: [
      { t: 0.0, pos: [1.9, 0, 8.4], ry: 2.42, state: { moveSpeed: 0.304, crouch: 0.35, kneel: 0, hurt: 0.75, dying: 0, lookPitch: -0.15 } },
      { t: 2.1, pos: [0.15, 0, 10.6], ry: 2.42, state: { moveSpeed: 0.304, crouch: 0.4, kneel: 0, hurt: 0.8, dying: 0, lookPitch: -0.2 } },
      // 踢倒（推倒）：脚下停住，人往墙根下塌。
      { t: 2.7, pos: [-0.15, 0, 11.1], ry: 2.42, state: { moveSpeed: 0, crouch: 0.75, kneel: 0.5, hurt: 1.0, dying: 0, lookPitch: -0.3 } },
      { t: 3.5, pos: [-0.15, 0, 11.1], ry: 2.42, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, hurt: 0.5, dying: 0, lookPitch: -0.45 } },
      // 逼问的四秒里他一动不动 —— 他答不出来，不是不肯答。
      { t: 8.0, pos: [-0.15, 0, 11.1], ry: 2.42, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, hurt: 0.5, dying: 0, lookPitch: -0.45 } },
      { t: 8.2, pos: [-0.15, 0, 11.1], ry: 2.42, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, hurt: 1.0, dying: 0, lookPitch: -0.2 } },
      // 倒地发生在镜 3（已经切走了），画面上看不见。
      { t: 8.7, pos: [-0.15, 0, 11.1], ry: 2.42, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, hurt: 0.2, dying: 1.0, dead: true, lookPitch: 0 } },
      { t: 14.8, pos: [-0.15, 0, 11.1], ry: 2.42, state: { moveSpeed: 0, crouch: 0, kneel: 1.0, hurt: 0.2, dying: 1.0, dead: true, lookPitch: 0 } },
    ] },

    // ── 拖人的那个（reach = 双手前伸架住对方；引擎做不了双人接触，取其意）──
    { id: "ijaDrag", kind: "ija", weapon: "Type38", seed: "ch3IjaDrag", track: [
      { t: 0.0, pos: [2.8, 0, 8.0], ry: 2.42, state: { moveSpeed: 0.319, crouch: 0.28, reach: 0.75, melee: 0, aim: 0, lookPitch: -0.35 } },
      { t: 2.1, pos: [1.05, 0, 10.2], ry: 2.42, state: { moveSpeed: 0.319, crouch: 0.28, reach: 0.75, melee: 0, aim: 0, lookPitch: -0.35 } },
      // 松手，一脚把人踹到墙根（melee 在空手/持枪都读成一下用力的动作）。
      { t: 2.7, pos: [0.75, 0, 10.75], ry: 2.6, state: { moveSpeed: 0, crouch: 0.1, reach: 0.2, melee: 0.4, aim: 0, lookPitch: -0.3 } },
      { t: 3.5, pos: [0.75, 0, 10.75], ry: 2.6, state: { moveSpeed: 0, crouch: 0, reach: 0, melee: 0, aim: 0.2, lookPitch: -0.15 } },
      { t: 14.8, pos: [0.75, 0, 10.75], ry: 2.6, state: { moveSpeed: 0, crouch: 0, reach: 0, melee: 0, aim: 0.2, lookPitch: -0.15 } },
    ] },

    // ── 扯救护白布擦刺刀的那个（全程在画面里，不给单独镜头）─────────────
    // 这一下是整场最重的一笔：救护的白布被当成擦刀布，而他做得很随手。
    { id: "ijaWipe", kind: "ija", weapon: "Type38", seed: "ch3IjaWipe", track: [
      { t: 0.0, pos: [-2.9, 0, 12.5], ry: 0.5, state: { moveSpeed: 0, crouch: 0.1, reach: 0, aim: 0.1, lookPitch: 0 } },
      { t: 3.4, pos: [-2.9, 0, 12.5], ry: 0.5, state: { moveSpeed: 0, crouch: 0.1, reach: 0, aim: 0.1, lookPitch: 0 } },
      // 弯腰把白布从担架上扯下来。
      { t: 4.2, pos: [-2.9, 0, 12.5], ry: 0.5, state: { moveSpeed: 0, crouch: 0.55, reach: 0.8, aim: 0, lookPitch: -0.75 } },
      { t: 5.6, pos: [-2.9, 0, 12.5], ry: 0.5, state: { moveSpeed: 0, crouch: 0.15, reach: 0.5, aim: 0, lookPitch: -0.3 } },
      { t: 14.8, pos: [-2.9, 0, 12.5], ry: 0.5, state: { moveSpeed: 0, crouch: 0.08, reach: 0.42, aim: 0, lookPitch: -0.28 } },
    ] },

    // ── 军曹：从屋门边走过来，逼问两句，刺刀 ──────────────────────────
    { id: "ija_gunso", kind: "ija", weapon: "Type38", seed: "ch3Gunso", track: [
      { t: 0.0, pos: [3.6, 0, 9.9], ry: 2.05, state: { moveSpeed: 0, aim: 0.15, melee: 0, crouch: 0, lookPitch: 0 } },
      { t: 3.0, pos: [3.6, 0, 9.9], ry: 2.05, state: { moveSpeed: 0, aim: 0.15, melee: 0, crouch: 0, lookPitch: 0 } },
      // 0.433×4.2 = 1.82 m/s，2.91 m 走 1.6 s。
      { t: 3.2, pos: [3.6, 0, 9.9], ry: 2.45, state: { moveSpeed: 0.433, aim: 0.1, melee: 0, crouch: 0, lookPitch: 0 } },
      { t: 4.8, pos: [1.0, 0, 11.2], ry: 2.45, state: { moveSpeed: 0, aim: 0.2, melee: 0, crouch: 0, lookPitch: -0.45 } },
      { t: 6.0, pos: [1.0, 0, 11.2], ry: 2.45, state: { moveSpeed: 0, aim: 0.3, melee: 0, crouch: 0, lookPitch: -0.45 } },
      { t: 7.9, pos: [1.0, 0, 11.2], ry: 2.45, state: { moveSpeed: 0, aim: 0.45, melee: 0, crouch: 0, lookPitch: -0.4 } },
      // melee 是刺杀动作的**相位**（Script_Actor：0→0.30 蓄、0.30→0.62 突刺）。
      // 蓄力起于 8.05、突刺落在 8.25 —— 镜 2 在 8.4 结束，看得见的只有起手那一下。
      { t: 8.05, pos: [1.0, 0, 11.2], ry: 2.45, state: { moveSpeed: 0, aim: 0.5, melee: 0.3, crouch: 0, lookPitch: -0.35 } },
      { t: 8.25, pos: [1.0, 0, 11.2], ry: 2.45, state: { moveSpeed: 0, aim: 0.5, melee: 0.7, crouch: 0, lookPitch: -0.3 } },
      { t: 8.7, pos: [1.0, 0, 11.2], ry: 2.45, state: { moveSpeed: 0, aim: 0.45, melee: 0.9, crouch: 0, lookPitch: -0.3 } },
      { t: 9.4, pos: [1.0, 0, 11.2], ry: 2.45, state: { moveSpeed: 0, aim: 0.4, melee: 0, crouch: 0, lookPitch: -0.25 } },
      { t: 14.8, pos: [1.0, 0, 11.2], ry: 2.45, state: { moveSpeed: 0, aim: 0.4, melee: 0, crouch: 0, lookPitch: -0.25 } },
    ] },

    // ── 墙根下已经躺着的三个：这一场只演一次正在发生的，其余全在这里 ─────
    { id: "dead1", kind: "nra", weapon: null, seed: "ch3Dead1", track: [
      { t: 0.0, pos: [-5.4, 0, 12.9], ry: 1.2, state: { moveSpeed: 0, prone: 1.0, dying: 1.0, dead: true } },
    ] },
    { id: "dead2", kind: "nra", weapon: null, seed: "ch3Dead2", track: [
      { t: 0.0, pos: [-1.9, 0, 13.05], ry: -0.4, state: { moveSpeed: 0, prone: 1.0, dying: 1.0, dead: true } },
    ] },
    { id: "dead3", kind: "nra", weapon: null, seed: "ch3Dead3", track: [
      { t: 0.0, pos: [2.4, 0, 12.7], ry: 2.9, state: { moveSpeed: 0, prone: 1.0, dying: 1.0, dead: true } },
    ] },

    // ── 破墙这一侧：罗班长与幺娃（镜 3）──────────────────────────────
    // ry = π 面朝 +Z（贴着墙、脸朝院子），镜 3 的机位在他左后方，脸背向镜头。
    { id: "luo", kind: "nra", weapon: "HanYang", seed: "ch3Luo", track: [
      { t: 0.0, pos: [-1.5, 0, -4.3], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.85, aim: 0.2, lookYaw: 0, lookPitch: 0.05 } },
      { t: 8.4, pos: [-1.5, 0, -4.3], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.85, aim: 0.2, lookYaw: 0, lookPitch: 0.05 } },
      // 「左右分开。」—— 先朝右手边的人说，再朝左手边。
      { t: 8.7, pos: [-1.5, 0, -4.3], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.85, aim: 0.15, lookYaw: 0.55, lookPitch: 0 } },
      { t: 10.6, pos: [-1.5, 0, -4.3], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.85, aim: 0.15, lookYaw: -0.55, lookPitch: 0 } },
      // 「开火！」—— 起身端枪。恢复控制的那一帧他已经在射击姿态上。
      { t: 11.2, pos: [-1.5, 0, -4.3], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.55, aim: 0.45, lookYaw: 0, lookPitch: 0 } },
      { t: 11.9, pos: [-1.5, 0, -4.3], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.3, aim: 0.85, lookYaw: 0, lookPitch: 0 } },
      { t: 14.8, pos: [-1.5, 0, -4.3], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.25, aim: 0.9, lookYaw: 0, lookPitch: 0 } },
    ] },
    { id: "yaowa", kind: "nra", weapon: "HanYang", seed: "ch3Yaowa", track: [
      { t: 0.0, pos: [1.9, 0, -4.5], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.9, aim: 0.1, lookYaw: 0, lookPitch: 0 } },
      { t: 11.6, pos: [1.9, 0, -4.5], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.9, aim: 0.1, lookYaw: 0, lookPitch: 0 } },
      { t: 12.3, pos: [1.9, 0, -4.5], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.4, aim: 0.6, lookYaw: 0, lookPitch: 0 } },
      { t: 14.8, pos: [1.9, 0, -4.5], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.35, aim: 0.75, lookYaw: 0, lookPitch: 0 } },
    ] },
  ],

  shots: [
    // ── 镜 1（3.0 s，50 mm）：透过缺口看进去 ────────────────────────────
    // 机位在缺口正后方 4 m，50 mm 在墙面上的半宽 1.44 m > 缺口半宽 0.8 m ——
    // 缺口两侧的砖墙留在画面边上，一眼就知道「我们在墙外面看」。
    // 院里的东西一次交代完：白布担架、翻倒的药箱、墙根下三个人、地上的拖痕。
    {
      n: 1, seconds: 3.0, focalMm: 50,
      note: "透过破墙缺口：两个日军把一名站不起来的伤兵从屋门里拖出来，踹到墙根。墙根下已经躺着三个。",
      camera: { from: [0, 1.32, -7.2], look: [0.6, 0.95, 10.4] },
      lines: [
        { at: 0.2, seconds: 2.2, who: "ija_gunso", voice: "ch3_ija_gunso_02", text: "拖出来。" },
      ],
      sfx: [
        { at: 0.05, name: "rifleIjaFar", volume: 0.2 },
        { at: 0.3, name: "footstepRubble", volume: 0.34 },
        { at: 1.55, name: "coughLow", volume: 0.22 },
        { at: 2.72, name: "bodyFall", volume: 0.42 },
      ],
    },

    // ── 镜 2（5.4 s，85 mm）：逼问番号 ─────────────────────────────────
    // 同一个洞、同一条视线，只是把焦距推上去 —— 不换机位就不会有「导演在带路」的感觉。
    // 85 mm 在 18 m 处的半宽约 3.9 m：军曹与跪着的人在中间，扯白布擦刺刀的那个
    // 在画面左边同时进行。**刺刀那一下在最后 0.35 s，被军曹的背影挡掉大半。**
    {
      n: 2, seconds: 5.4, focalMm: 85,
      note: "军曹走到跟前逼问番号；伤兵答不出来。左边另一名日军把救护白布从担架上扯下来擦刺刀。镜末 0.35 s 刺刀落下，随即切走。",
      camera: { from: [0.2, 1.35, -7.0], look: [0.6, 1.0, 11.2] },
      lines: [
        { at: 0.2, seconds: 3.2, who: "ija_gunso", voice: "ch3_ija_gunso_03", text: "支那兵。报出番号。" },
        { at: 3.5, seconds: 1.9, who: "ija_gunso", voice: "ch3_ija_gunso_04", text: "不答？" },
      ],
      sfx: [
        { at: 1.2, name: "rifleIjaFar", volume: 0.16 },
        { at: 1.35, name: "gearRustle", volume: 0.24 },
        { at: 5.12, name: "bayonetHit", volume: 0.42 },
      ],
      shakeAt: [{ at: 5.12, seconds: 0.2, amount: 0.12 }],
    },

    // ── 镜 3（6.4 s，35 mm）：破墙这一侧 ───────────────────────────────
    // 机位在罗班长左后方 3.2 m，脸背向镜头；视线轴正好从缺口穿过去，
    // 院子仍在他身后的画面深处 —— 观众不必再看，但知道它还在那儿。
    // 说完立即恢复控制：这一镜的最后一帧，罗班长已经端起枪。
    {
      n: 3, seconds: 6.4, focalMm: 35,
      note: "切回破墙外侧。罗班长贴着墙压低声音分派左右，随即大喊开火。镜末立即恢复玩家控制。",
      camera: {
        from: [-4.4, 1.45, -5.6], to: [-4.0, 1.42, -5.2],
        look: [-1.6, 1.15, -4.2], lookTo: [-1.35, 1.1, -4.05],
      },
      lines: [
        { at: 0.15, seconds: 2.35, who: "luo", voice: "ch3_luo_13", text: "左右分开。" },
        { at: 2.6, seconds: 3.7, who: "luo", voice: "ch3_luo_14", text: "开火！里头活的带出来！" },
      ],
      sfx: [
        { at: 0.4, name: "gearRustle", volume: 0.3 },
        { at: 2.35, name: "bolt", volume: 0.34 },
        { at: 6.05, name: "rifleNra", volume: 0.5 },
      ],
    },
  ],
};

export const CS_Ch3_LeafletFire = {
  id: "CS_Ch3_LeafletFire",
  title: "传单入火",
  seconds: 4.8,
  // 关内演出：由 Data_MissionCh3.EVENTS 的 LeafletBurned 触发（ER-3），
  // 发生在**撤回 A 区之前** —— 火焰封的是撤退路上的追兵。
  trigger: "inLevel:CH3_Jiuhusuo@LeafletBurned",
  sky: "smokyDay",
  standalone: true,
  // 独立布景：离城心 ≥1800 m（切比雪夫距离），1700 m 内铺着真地形会和自己的地面打架。
  setOrigin: [2600, 0, 2600],
  why: "顺子拾「放下武器，可保生命」传单，看一眼院里盖着白布的人，投进炉火，火引燃油料封住一条追击路线。全程无台词 —— 幺娃那句「保个鸭儿的命」在过场外面说。",
  presumed: [],
  people: {},
  forbiddenLines: [
    "任何台词（§4 过场 2：全程无台词，5 秒内）",
    "任何字幕（连一句概括都不要，火自己会说）",
  ],

  props: [
    { kind: "plane", size: [60, 60], pos: [0, 0, 4], mat: "Ground", name: "院地" },
    // 北院墙留一个 2.2 m 的院门口（x ∈ [1.2, 3.4]）—— 火要封的就是通向它的那条路。
    { kind: "box", size: [13.4, 2.5, 0.5], pos: [-5.5, 1.25, 9.5], mat: "BrickWallSooty", name: "北院墙西" },
    { kind: "box", size: [8.6, 2.5, 0.5], pos: [7.7, 1.25, 9.5], mat: "BrickWallSooty", name: "北院墙东" },
    { kind: "box", size: [0.5, 2.5, 14], pos: [-6.5, 1.25, 3.0], mat: "BrickWallSooty", name: "西院墙" },
    { kind: "box", size: [0.5, 3.0, 12], pos: [6.5, 1.5, 3.5], mat: "Adobe", name: "东屋山墙" },

    // ── 炉子：这一场唯一的光源，warm key 全靠它 ──────────────────────
    { kind: "cyl", size: [0.42, 0.78], pos: [0, 0.39, 1.2], mat: "BrickWallSooty", name: "炉子" },
    {
      kind: "cyl", size: [0.33, 0.2], pos: [0, 0.86, 1.2], color: 0xff8a30, emissive: 0xff7420,
      light: { color: 0xffa044, intensity: 3.0, distance: 16, offsetY: 0.55 }, name: "炉火",
    },

    // ── 翻倒的油桶与漫开的油迹（火要沿着它铺过去）────────────────────
    { kind: "cyl", size: [0.27, 0.88], pos: [1.05, 0.27, 1.7], rx: 1.5708, ry: 0.4, mat: "Steel", name: "油桶" },
    { kind: "plane", size: [1.7, 3.8], pos: [1.8, 0.02, 3.2], ry: 0.1, color: 0x241d14, roughness: 1.0, name: "油迹" },
    // 油面火：**authored 位置埋在地下 3 m**，镜 2 用 propMoves 升起来再铺开。
    // 刻意不给它 light —— 一盏埋在单面地板下的点光会从下面把整个院子照亮。
    { kind: "box", size: [1.6, 0.55, 0.9], pos: [1.6, -3.0, 1.6], color: 0xff8028, emissive: 0xff6a12, name: "油面火" },

    // ── 院里盖着白布的人（他看的就是这个）────────────────────────────
    { kind: "box", size: [0.62, 0.34, 1.9], pos: [-3.4, 0.17, 6.2], ry: 0.08, color: 0xd6d2c4, name: "白布一" },
    { kind: "box", size: [0.6, 0.32, 1.85], pos: [-4.6, 0.16, 6.5], ry: -0.05, color: 0xcfcabb, name: "白布二" },
    { kind: "box", size: [0.72, 0.44, 0.5], pos: [-2.2, 0.22, 4.3], ry: 0.5, mat: "WoodDoor", name: "药箱" },
    { kind: "plane", size: [1.8, 1.2], pos: [-3.0, 0.02, 4.9], color: 0x38201a, roughness: 1.0, name: "血迹" },

    // ── 地上的传单（他手里那张是从这堆里捡的）──────────────────────
    { kind: "plane", size: [0.28, 0.2], pos: [-1.5, 0.03, 0.4], ry: 0.4, color: 0xcfc9b6, name: "传单一" },
    { kind: "plane", size: [0.26, 0.19], pos: [0.9, 0.03, -0.3], ry: -0.7, color: 0xc9c3b0, name: "传单二" },
    { kind: "plane", size: [0.27, 0.2], pos: [2.4, 0.03, 2.1], ry: 1.1, color: 0xccc6b3, name: "传单三" },
  ],

  cast: [
    // 顺子：蹲在炉子边，背对镜头（「脸」是一张光板，分镜尽量用背影）。
    // ry = atan2(-0.85, -0.7) = -2.259 面朝炉子。
    { id: "shunzi", kind: "nra", weapon: "HanYang", seed: "ch3Shunzi", track: [
      { t: 0.0, pos: [-0.85, 0, 0.5], ry: -2.259, state: { moveSpeed: 0, crouch: 0.8, reach: 0.4, lookYaw: 0, lookPitch: -0.25 } },
      // 看一眼墙根下盖着白布的人（头转到极限，人不站起来）。
      { t: 1.0, pos: [-0.85, 0, 0.5], ry: -2.259, state: { moveSpeed: 0, crouch: 0.8, reach: 0.4, lookYaw: -0.9, lookPitch: -0.08 } },
      { t: 2.0, pos: [-0.85, 0, 0.5], ry: -2.259, state: { moveSpeed: 0, crouch: 0.8, reach: 0.4, lookYaw: -0.3, lookPitch: -0.2 } },
      { t: 2.6, pos: [-0.85, 0, 0.5], ry: -2.259, state: { moveSpeed: 0, crouch: 0.8, reach: 0.55, lookYaw: 0, lookPitch: -0.3 } },
      // 手往炉口一送。
      { t: 3.2, pos: [-0.85, 0, 0.5], ry: -2.259, state: { moveSpeed: 0, crouch: 0.8, reach: 0.85, lookYaw: 0, lookPitch: -0.35 } },
      { t: 3.8, pos: [-0.85, 0, 0.5], ry: -2.259, state: { moveSpeed: 0, crouch: 0.78, reach: 0.35, lookYaw: 0, lookPitch: -0.25 } },
      { t: 4.8, pos: [-0.85, 0, 0.5], ry: -2.259, state: { moveSpeed: 0, crouch: 0.62, reach: 0.1, lookYaw: 0.15, lookPitch: -0.15 } },
    ] },
  ],

  shots: [
    // ── 镜 1（2.6 s，35 mm）：过肩，他手里捏着那张传单 ─────────────────
    {
      n: 1, seconds: 2.6, focalMm: 35,
      note: "顺子蹲在炉子边（背影），手里捏着「放下武器，可保生命」。他朝墙根下盖白布的人看了一眼。无台词。",
      camera: {
        from: [-2.75, 1.12, -1.35], to: [-2.55, 1.16, -1.05],
        look: [-0.35, 0.9, 0.95], lookTo: [-0.2, 0.88, 1.15],
      },
      sfx: [
        { at: 0.55, name: "coughLow", volume: 0.18 },
        { at: 1.5, name: "rifleIjaFar", volume: 0.14 },
      ],
    },

    // ── 镜 2（2.2 s，35 mm）：传单落进炉口，火沿着油铺出去 ─────────────
    // propMoves 两段：先把埋着的火苗顶上来（0.25→0.45 s），再让它沿油迹
    // 铺向院门（0.5→2.2 s）。火墙本身由 ER-3 在关内接管，这里只演它是怎么起来的。
    {
      n: 2, seconds: 2.2, focalMm: 35,
      note: "传单入炉，火苗窜起，舔到翻倒的油桶；火沿着地上的油铺向院门那条路。无台词。",
      camera: {
        from: [-2.4, 1.5, -0.6], to: [-1.5, 1.35, 0.35],
        look: [0.9, 0.5, 1.9], lookTo: [2.1, 0.3, 4.4],
      },
      propMoves: [
        { name: "油面火", from: [1.6, -3.0, 1.6], to: [1.6, 0.22, 1.6], startAt: 0.25, endAt: 0.45 },
        { name: "油面火", from: [1.6, 0.22, 1.6], to: [2.0, 0.22, 4.8], startAt: 0.5, endAt: 2.2 },
      ],
      sfx: [
        { at: 0.28, name: "impactWood", volume: 0.3 },
        { at: 0.62, name: "impactDirt", volume: 0.22 },
      ],
      shakeAt: [{ at: 0.5, seconds: 0.25, amount: 0.08 }],
    },
  ],
};

/** 本章过场（按播放顺序）。Data_TengxianScript 汇总时照这个数组展开。 */
export const CH3_CUTSCENES = [CS_Ch3_BreakWall, CS_Ch3_LeafletFire];

export default CH3_CUTSCENES;
