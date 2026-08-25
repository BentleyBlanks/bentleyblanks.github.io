// 《滕县 1938》过场分镜 —— 出川（开场）（CS_Chuchuan）。
//
// **纯数据，不许 import three**。被 Data_TengxianScript.mjs 汇总进 CUTSCENES，
// Script_Cutscene.mjs 是唯一消费者；字段说明见 Data_TengxianScript.mjs「过场」一节
// 与 docs/Data_CutsceneRedo.md（§1 引擎契约、§2.1 本场施工单）。
//
// 本场专属的人物表条目写在 people（并进 CAST），本场新引入的推定值写在 presumed
// （并进 PRESUMED_STAGING）—— 五场各自一个文件，是为了能并行改而不互相踩。
//
// ── 2026-08-20 重做 ────────────────────────────────────────────────────────
// 旧版讲闷罐车、掉队解绑带、车厢里门缝光扫脸，被用户否了（背景是黑底亮盘、前景是
// 木纹盒子、地面拉丝、人反关节）。新版按施工单 §2.1：
//   · 先两张黑场字卡讲**这一仗怎么来的**（南京陷落 → 会师徐州 → 濑谷支队南下 → 滕县是门户）；
//   · 再四镜实景讲**这支部队和你是谁**（出川 → 娘子关 → 划归第五战区 → 王铭章守城 →
//     你是九连二等兵谢长顺，身边是班长）；
//   · 最后一张日期卡接 L0 界河。
// 实景不再独立搭景，直接拍在 L0（界河）切片的原野上：真地形、真雾、真拂晓。
// **注意方位**：L0 切片是城北 20 km 的界河原野（Data_Battle.TUNING.L0_Jiehe），城墙不在场里。
// 镜 5 那道雾里的城墙是本场自带的剪影道具 —— 这几镜拍的是「三月上旬开赴滕县」的路上，
// 不是界河阵地上（在界河看得见滕县城墙才是史实错误，见 Data_Battle 的注）。
//
// ── 2026-08-20 复审后二改（review pass 7 的清单逐条）────────────────────────
//   · [major] 秃树重做：4 根 3 m 等粗直枝读成电线杆/电视天线 → 7 根 1.2–1.8 m 主枝
//     （截面 0.05、抬角随方位变化）+ 每根末端两根细枝，两级分叉；树A 东移出镜 7 视轴。
//   · [minor] 城墙顶那条 4000 m 的绝对直线：加两座敌台（马面）打断轮廓。
//   · [minor] 镜 7 画左半个 m8：机位/视轴西移 + m8 向东让出半步（行军松散不违和）。
//   · [minor] 「最后一道屏障」是修辞（后面还有临城、韩庄、运河一线）→ 改「门户」。
//   · [minor] 日期卡改「滕县以北 界河」，交代界河在哪、为什么没进城先在界河打。
//   · 总长 46.4 → 42.0 s：黑卡与实景逐镜压到字幕可读下限之上（0.22×字＋1.2 全满足），
//     被压掉的从句（打通津浦路／第十师团／几经转调／无钢盔）一句不丢，全在 skipCard。

// ---------------------------------------------------------------------------
// 布景基准（全部推定，登记在 presumed）
// ---------------------------------------------------------------------------

/** 原野地面高度：L0 切片里 (-200,-1290) 一带实测 −1.28～−1.30，取 −1.29（见 OuterHeight）。 */
const G = -1.29;
/** 纵队中线的 x；两列分别在 X0∓0.8。 */
const X0 = -200;
/** 行军开始时刻（黑场字卡期间就已在走，t=10.4 镜 3 淡入时脚正好进画）与速度。 */
const T0 = 9.4;
const T_END = 37.7;
/** 正常行军 moveSpeed 0.30 ↔ 1.26 m/s。**轨道速度必须与它对得上**，改一个就改另一个。 */
const MOVE = 0.30;
const V = MOVE * 4.2;
/** 队头在 T0 时的 z；纵队朝 +z（南，朝城墙）走，ry = atan2(-0, -1) = π。 */
const Z_HEAD = -1292.0;
const FACING = Math.PI;

/**
 * 一条匀速直行的轨道。extra 是途中要插的状态帧 [[t, state], …]（位置按匀速反算，
 * 所以插多少帧都不会滑步）。hidden 之前的人引擎本来就不画，不必另写 hidden 帧。
 */
function March(x, zStart, extra = []) {
  const at = (t) => [x, G, zStart + V * (t - T0)];
  const frames = [{ t: T0, pos: at(T0), ry: FACING, state: { moveSpeed: MOVE } }];
  for (const [t, state] of extra) frames.push({ t, pos: at(t), ry: FACING, state: { moveSpeed: MOVE, ...state } });
  frames.push({ t: T_END, pos: at(T_END), ry: FACING, state: { moveSpeed: MOVE } });
  return frames;
}

/** 行军纵队的一排：左列 x=X0−0.8，右列 x=X0+0.8 错后 1.1 m。row 从队头数起，排距 2.4 m。 */
const L = (row, dx = 0) => [X0 - 0.8 + dx, Z_HEAD - 2.4 * row];
const R = (row, dx = 0) => [X0 + 0.8 + dx, Z_HEAD - 2.4 * row - 1.1];

/**
 * 城墙剪影摆在纵队前方约 190 m 的雾里（镜 5 的背景）。120 m 时砖缝都数得清、像个大盒子，推到 200 m 雾才吃得动墙身，只剩城楼轮廓清楚。
 * **墙脚前那条发绿的亮带不是 bug，是 L0 场自带的冬麦地**（mesh「WinterWheat」，x −611～287、z −1224～−774、
 * 高 −1.6～−0.5，一块 1 m 厚的平板）：纵队走到 z=−1224 之前一直在麦地北边，城墙无论摆在 −1065 还是 −1195 都站在麦地里，
 * 墙脚都被麦子挡住。把它当「城北麦地」用（L1/L6 也有这块地），机位压低让麦地只剩一条线、别从上面俯看它的顶面。
 */
const WALL_Z = -1100;
const WALL_X = X0 + 6;
const WALL_BASE = -1.7;            // 比地面低半米，墙脚埋进土里，免得浮着
/** 剪影色：墙身/女墙/月台一律染成同一种暗土色、粗糙度拉满，雾里只剩一条轮廓，不读砖纹、不发亮。 */
const WALL_TINT = 0x7a6a5a;

/**
 * 一棵三月的秃树。上一轮的写法（一根干 + 四根 3 m 等粗直枝）在出图里全读成
 * 电线杆/电视天线（review pass 7 的 major），这一轮做成**两级分叉**：
 *   · 主枝 7 根，长 1.2–1.8 m、截面 0.05、沿树干顶部 2 m 内错落生根；
 *   · 每根主枝末端再挂 2 根 0.6–0.75 m、截面 0.035 的细枝，方位/抬角各偏一点。
 * 只有 rx/ry 两个转角可用：枝做成**沿局部 X** 的细长盒（three 欧拉序 XYZ，
 * 向量先绕 Y 再绕 X）：方向 = Rx(rx)·Ry(ry)·(1,0,0) = (cos ry, sin ry·sin rx, −sin ry·cos rx)。
 * 抬升量 = sin(ry)·sin(rx)，所以 **rx 的符号跟 sin(ry) 走**，保证枝梢一律朝上翘；
 * sin(ry)≈0 的那两根接近水平，正好当横出的老枝。盒子的中心 = 枝根 + 半长 × 方向。
 */
function Tree(name, x, z, trunkH, spin) {
  const color = 0x4a4036;
  const Dir = (rx, ry) => {
    const c = Math.cos(ry), sn = Math.sin(ry);
    return [c, sn * Math.sin(rx), -sn * Math.cos(rx)];
  };
  const list = [
    { kind: "cyl", size: [0.14, trunkH], pos: [x, G + trunkH / 2, z], color, name: `${name}干` },
  ];
  // [方位角, 抬角幅度, 长度] —— 7 根，方位大致均布 + 抖动，长短粗细参差
  const MAINS = [
    [0.35, 0.95, 1.75], [1.25, 0.70, 1.45], [2.15, 1.05, 1.65], [3.05, 0.60, 1.30],
    [3.90, 0.90, 1.55], [4.75, 0.75, 1.20], [5.55, 1.00, 1.50],
  ];
  // [方位偏转, 抬角增量, 长度] —— 每根主枝末端两根
  const TWIGS = [[-0.55, 0.30, 0.75], [0.50, -0.20, 0.60]];
  MAINS.forEach(([a, lift, len], i) => {
    const ry = a + spin;
    const rx = (Math.sin(ry) >= 0 ? 1 : -1) * lift;
    const dir = Dir(rx, ry);
    const root = [x, G + trunkH - 0.25 - i * 0.3, z];
    list.push({
      kind: "box", size: [len, 0.05, 0.05], rx, ry,
      pos: [root[0] + dir[0] * len / 2, root[1] + dir[1] * len / 2, root[2] + dir[2] * len / 2],
      color, name: `${name}枝${i}`,
    });
    const end = [root[0] + dir[0] * len, root[1] + dir[1] * len, root[2] + dir[2] * len];
    TWIGS.forEach(([da, dl, tlen], j) => {
      const ry2 = ry + da;
      const rx2 = (Math.sin(ry2) >= 0 ? 1 : -1) * Math.min(1.2, Math.max(0.35, lift + dl));
      const d2 = Dir(rx2, ry2);
      list.push({
        kind: "box", size: [tlen, 0.035, 0.035], rx: rx2, ry: ry2,
        pos: [end[0] + d2[0] * tlen / 2, end[1] + d2[1] * tlen / 2, end[2] + d2[2] * tlen / 2],
        color, name: `${name}枝${i}${j ? "b" : "a"}`,
      });
    });
  });
  return list;
}

export const CS_ChuchuanLegacy = {
  id: "CS_ChuchuanLegacy",
  title: "出川",
  seconds: 42.0,
  trigger: "beforeLevel:L0_Jiehe",
  // 出川那段过场：一间空屋子的调子（master 那边给七关与本场配的音乐）。
  music: "menu",
  // 不给 sky：沿用 L0 的 dawn（拂晓、太阳在东边 11°，纵队朝南走，侧逆光出剪影）。
  standalone: false,
  setOrigin: [0, 0, 0],
  fadeIn: 0.8,
  why: "开篇先说这一仗怎么来的（津浦路、徐州、濑谷支队、滕县是门户），再说这支部队和你是谁：被推来推去才到这里的川军，装备差不是设定，是历史。",

  // 全场不给脸 —— 既是分镜要求（脸是光板），也顺带避免了给虚构人物做定妆。
  props: [
    // ── 雾里的滕县城墙（剪影）─────────────────────────────────────────────
    // 按 Data_Tengxian.CITY 的尺寸：墙身 11.5 m、底宽 10、条石勒脚 1.8、女墙 1.6；
    // 城楼重檐两层；半圆瓮城 r=18。120 m 外只读轮廓，细节不做。
    // 墙身 4000 m 长：两头必须伸到雾外面去（1600 m 时镜 4 斜看还露出一个硬切的断头，像一条到头的堤坝；box 多长都不要钱）。
    // 不做勒脚、月台也不用 Stone：Stone 在拂晓雾里渲成一条发绿的亮带，比墙身还扎眼。
    // 不做瓮城：半圆柱在 200 m 外渲成一块比墙身更亮的浅色方块贴在墙中间，像打了个补丁。
    { kind: "box", size: [4000, 11.5, 10], pos: [WALL_X, WALL_BASE + 5.75, WALL_Z], mat: "BrickWall", tint: WALL_TINT, roughness: 1, name: "城墙" },
    { kind: "box", size: [4000, 1.6, 1.0], pos: [WALL_X, WALL_BASE + 11.5 + 0.8, WALL_Z - 4.5], mat: "BrickWall", tint: WALL_TINT, roughness: 1, name: "女墙" },
    // 两座敌台（马面）：打断「城墙顶边一条贯穿全画的绝对直线」（review 修法）。
    // 高 12.5 → 顶在墙顶上冒 1 m，深 13 → 里外各凸 1.5 m，间距 90 m 在明清城制 60–90 m 内。
    // review 建议 ±75，但 50 mm 镜 5 在 185 m 外半幅只覆 ±78 m —— ±75 正压在画框边上、雾里读不出来，
    // 出图核对后收进 ±45：正好一左一右夹着城楼，顶边的直线被切成三段。
    // 高 15（顶超出女墙线 1.9 m）：第一版做 12.5 结果比女墙（13.1）还矮，剪影整个藏在女墙后面，
    // 顶边照旧一条直线 —— 敌台在剪影里必须**高过**女墙才存在。
    { kind: "box", size: [9, 15, 13], pos: [WALL_X - 45, WALL_BASE + 7.5, WALL_Z], mat: "BrickWall", tint: WALL_TINT, roughness: 1, name: "敌台西" },
    { kind: "box", size: [9, 15, 13], pos: [WALL_X + 45, WALL_BASE + 7.5, WALL_Z], mat: "BrickWall", tint: WALL_TINT, roughness: 1, name: "敌台东" },
    { kind: "box", size: [17, 0.45, 11], pos: [WALL_X, WALL_BASE + 11.5 + 0.22, WALL_Z], mat: "BrickWall", tint: WALL_TINT, roughness: 1, name: "月台" },
    { kind: "box", size: [11.4, 4.4, 7.2], pos: [WALL_X, WALL_BASE + 11.95 + 2.2, WALL_Z], mat: "WoodDoor", tint: 0x5a4630, name: "城楼下层" },
    { kind: "box", size: [14.6, 0.9, 10.4], pos: [WALL_X, WALL_BASE + 16.35 + 0.45, WALL_Z], mat: "RoofTile", name: "城楼下檐" },
    { kind: "box", size: [9.0, 3.0, 5.6], pos: [WALL_X, WALL_BASE + 17.25 + 1.5, WALL_Z], mat: "WoodDoor", tint: 0x5a4630, name: "城楼上层" },
    { kind: "box", size: [12.0, 1.0, 8.4], pos: [WALL_X, WALL_BASE + 18.75 + 0.5, WALL_Z], mat: "RoofTile", name: "城楼上檐" },
    { kind: "box", size: [12.6, 0.5, 1.2], pos: [WALL_X, WALL_BASE + 19.75 + 0.25, WALL_Z], mat: "RoofTile", name: "城楼脊" },
    // ── 路边三棵秃树（三月落叶乔木，只有骨架）：给空原野一点纵深与剪影 ────────
    // 树A 从 X0+13 东移到 X0+24：旧位置的枝正好从镜 7 里 xie 的帽顶伸出来，像插了根羽毛。
    ...Tree("树A", X0 + 24, -1268, 6.4, 0.3),
    ...Tree("树B", X0 - 19, -1236, 7.6, 1.9),
    ...Tree("树C", X0 + 34, -1205, 7.0, 4.1),
  ],

  // ★ 一条轨从头走到尾：四镜实景拍的是**同一队人**，机位切来切去，人不换场、不瞬移。
  // ★ 每三人里有一人空着手（weapon:null）：日方记川军三分之一以上没有步枪。
  //   玩家（xie）也空手 —— L0 开局「无枪」是合法初始状态（Data_Battle.loadoutOverride）。
  cast: [
    { id: "m1", kind: "nra", weapon: "HanYang", seed: "chu1", track: March(...L(0, 0.05)) },
    { id: "m2", kind: "nra", weapon: null, seed: "chu2", track: March(...R(0, -0.05)) },
    { id: "m3", kind: "nra", weapon: "HanYang", seed: "chu3", track: March(...L(1, -0.1)) },
    { id: "m4", kind: "nra", weapon: "HanYang", seed: "chu4", track: March(...R(1, 0.08)) },
    { id: "m5", kind: "nra", weapon: null, seed: "chu5", track: March(...L(2, 0.12)) },
    { id: "m6", kind: "nra", weapon: "HanYang", seed: "chu6", track: March(...R(2, -0.06)) },
    { id: "m7", kind: "nra", weapon: "HanYang", seed: "chu7", track: March(...L(3, -0.04)) },
    // m8 向东让出半步（dx 0.6）：他走在 xie 右前方 1.3 m，镜 7 从 xie 左后方拍时
    // 正好切进画左半个身子（review minor）；行军松散，队列里有人偏出半步不违和。
    { id: "m8", kind: "nra", weapon: null, seed: "chu8", track: March(...R(3, 0.6)) },
    // 队尾一排：玩家（左）与班长（右）。镜 6a 班长转头看他（lookYaw 负 = 朝自己右手边，
    // 纵队朝 +z 走时右手边是 −x，正是 xie 那一列）；镜 6b 推到玩家背影。
    { id: "xie", kind: "nra", weapon: null, seed: "chuXie", track: March(...L(4), [
      [29.0, { lookYaw: 0 }], [30.0, { lookYaw: 0.55 }], [31.8, { lookYaw: 0.55 }], [32.7, { lookYaw: 0 }],
    ]) },
    { id: "qiu", kind: "nra", weapon: "HanYang", seed: "chuQiu", track: March(...R(4), [
      // 转得快（0.6 s）、停得久（2.9 s）；−0.9 从后面看不出来转了头，拉到 −1.3（引擎上限 1.4）
      [28.4, { lookYaw: 0 }], [29.0, { lookYaw: -1.3 }], [31.9, { lookYaw: -1.3 }], [32.7, { lookYaw: 0 }],
    ]) },
  ],

  shots: [
    // ── 1 黑场字卡：这一仗怎么来的（上）────────────────────────────────────
    {
      n: 1, seconds: 4.8, focalMm: 24, black: true, titleCard: true,
      note: "黑场字卡（black 必须显式给，titleCard 只管字幕居中）：南京陷落 → 日军南北对进要会师徐州。「打通津浦路」压进 skipCard（镜 2 连着两句津浦路，画面上不重复）",
      camera: { from: [X0, G + 12, -1310], look: [X0, G, -1200] },
      subs: [
        { at: 0.2, seconds: 4.55, tier: "主流", text: "一九三七年十二月，南京陷落。" },
        { at: 0.2, seconds: 4.55, tier: "主流", text: "日军南北对进，要会师徐州。" },
      ],
    },
    // ── 2 黑场字卡：这一仗怎么来的（下）────────────────────────────────────
    {
      n: 2, seconds: 5.6, focalMm: 50, black: true, titleCard: true,
      note: "黑场字卡：濑谷支队沿津浦路南下；滕县是门户。「最后一道屏障」是修辞（滕县之后还有临城、韩庄、运河一线，review minor），改「门户」——Timeline「滕县陷落后津浦路正面洞开」能背书门户，背不动最后一道。「第十师团」在 skipCard",
      camera: { from: [X0, G + 1.5, -1320], look: [X0, G + 1.5, -1300] },
      subs: [
        { at: 0.2, seconds: 5.4, tier: "主流", text: "一九三八年三月，濑谷支队沿津浦路南下。" },
        { at: 0.2, seconds: 5.4, tier: "主流", text: "滕县，是徐州以北津浦路正面的门户。" },
      ],
    },
    // ── 3 实景：拂晓原野，贴地机位，脚与绑腿一双双走过 ───────────────────────
    {
      n: 3, seconds: 6.3, focalMm: 135, fadeIn: 1.0,
      note: "从黑淡入。固定、贴地 0.30 m、135 mm，摆在左列外侧（西侧）2.8 m，朝北偏东 33° 回望纵队：画幅只到膝，草鞋、绑腿一双接一双从画面深处走来、走出画面。上一轮摆在东侧顺光拍，鞋头被低日直射渲成一块块发光的亮黄方块，所以镜像到西侧；视轴不许偏东超过 33°（135 mm 右边缘 42°）—— L0 这一关自己的守军就站在东北方 45°–55° 的地平线上，再偏就把一排小人拍进背景里",
      // 视轴与左列的交点在 z≈−1292.3：队头在 T0 刚过、队尾 t≈16.8（镜末）才过，6.3 s 里脚不断档
      camera: { from: [X0 - 3.6, G + 0.30, -1288.0], look: [X0 - 0.88, G + 0.12, -1292.2] },
      sfx: [
        { at: 0.6, name: "footstepDirt", volume: 0.5 },
        { at: 1.4, name: "footstepDirt", volume: 0.42 },
        { at: 2.2, name: "footstepDirt", volume: 0.5 },
        { at: 3.0, name: "footstepDirt", volume: 0.4 },
        { at: 3.8, name: "footstepDirt", volume: 0.48 },
        { at: 4.6, name: "footstepDirt", volume: 0.4 },
        { at: 5.4, name: "footstepDirt", volume: 0.46 },
      ],
      subs: [
        { at: 0.2, seconds: 6.1, tier: "主流", text: "守滕县的是川军第二十二集团军。" },
        { at: 0.2, seconds: 6.1, tier: "主流", text: "一九三七年九月出川，徒步一千四百余公里北上。" },
      ],
    },
    // ── 4 实景：东侧平行跟拍，纵队侧影（低日在背后给人身顺光）────────────────
    {
      n: 4, seconds: 5.6, focalMm: 50,
      note: "侧后跟拍：机位在纵队东侧 5.5 m、偏后 9.5 m、高 1.1 m（低于头顶，最近几颗头落在天空线以下由地面承光），锚在倒数第二排 m7，与队列同速跟进并缓缓前滑 2.0 m，朝南偏西 30° 看纵队的 3/4 背侧影，东边的低日在相机背后给人身顺光。上一轮摆在西侧逆光，队尾三颗头正对拂晓泛白成光球，所以换到东侧；视轴不许偏西超过 30°（50 mm 右边缘 53°）—— 再偏，城墙在 400 m 外会露出一个硬切的断头（引擎在 ~400 m 处把它切掉了，不是 box 太短）",
      camera: {
        fromActor: "m7", from: [5.5, 1.1, -9.5], to: [5.5, 1.1, -7.5],
        lookActor: "m7", look: [-0.3, 1.0, 0.5], lookTo: [-0.3, 1.0, 0.5], ease: "linear",
      },
      sfx: [
        { at: 0.5, name: "footstepDirt", volume: 0.36 },
        { at: 1.3, name: "footstepDirt", volume: 0.32 },
        { at: 2.1, name: "footstepDirt", volume: 0.36 },
        { at: 2.9, name: "footstepDirt", volume: 0.3 },
        { at: 3.7, name: "footstepDirt", volume: 0.36 },
        { at: 4.5, name: "footstepDirt", volume: 0.3 },
        { at: 5.3, name: "footstepDirt", volume: 0.34 },
      ],
      subs: [
        { at: 0.2, seconds: 5.4, tier: "主流", text: "十月娘子关，一周损失过半。" },
        { at: 0.2, seconds: 5.4, tier: "主流", text: "此后无人补充，划归第五战区，开赴鲁南。" },
      ],
    },
    // ── 5 实景：队尾身后回看整队背影，雾里是滕县城墙 ─────────────────────────
    {
      n: 5, seconds: 5.6, focalMm: 50,
      note: "锚在队尾 xie 身后 16 m、高 1.7 m 缓缓跟进：十个背影朝雾里的城墙走，城墙在 185 m 外横过地平线只剩一条暗色轮廓（墙身染成剪影色、粗糙度拉满、去掉瓮城与 Stone 月台；两座敌台打断顶边直线），城楼最清楚；墙脚前那条绿线是 L0 的冬麦地（见 WALL_Z 注），机位压到 1.7 m 让它只剩一条线。85 mm 时墙占了整幅画、像一块大板，退回 50；look 的 y 抬到 2.6 让墙在画里占得更少",
      camera: {
        fromActor: "xie", from: [1.0, 1.7, -16.0], to: [1.0, 1.6, -13.6],
        lookActor: "xie", look: [0.3, 2.6, 40], lookTo: [0.3, 2.6, 40], ease: "easeInOut",
      },
      sfx: [
        { at: 0.4, name: "footstepDirt", volume: 0.4 },
        { at: 1.2, name: "footstepDirt", volume: 0.34 },
        { at: 2.0, name: "footstepDirt", volume: 0.4 },
        { at: 2.8, name: "footstepDirt", volume: 0.34 },
        { at: 3.6, name: "footstepDirt", volume: 0.4 },
        { at: 4.4, name: "footstepDirt", volume: 0.34 },
        { at: 5.2, name: "footstepDirt", volume: 0.38 },
      ],
      subs: [
        { at: 0.2, seconds: 5.4, tier: "主流", text: "第一二二师师长王铭章，奉命守滕县城。" },
        { at: 0.2, seconds: 5.4, tier: "主流", text: "能战之兵不足两千，三分之一以上无步枪。" },
      ],
    },
    // ── 6a 实景：班长转头看身边的年轻兵 ─────────────────────────────────────
    {
      n: 6, seconds: 4.6, focalMm: 50,
      note: "锚在班长左后方（+x 侧，画面左）2.6 m、高 1.25 m（低于肩），看向两人中间偏下：头压到画面上 1/4，以肩背与挎带为主体；班长 0.6 s 内转头（lookYaw −1.3）朝自己右手边（−x，画面右）的长顺说话、停 2.9 s —— 从左后方拍，只见后脑勺转过去，不给脸",
      camera: {
        fromActor: "qiu", from: [2.6, 1.25, -3.4],
        lookActor: "qiu", look: [-0.8, 1.05, 0.6],
      },
      sfx: [
        { at: 0.3, name: "footstepDirt", volume: 0.4 },
        { at: 1.1, name: "footstepDirt", volume: 0.34 },
        { at: 1.9, name: "footstepDirt", volume: 0.4 },
        { at: 2.7, name: "footstepDirt", volume: 0.34 },
        { at: 3.5, name: "footstepDirt", volume: 0.4 },
      ],
      lines: [{ at: 0.25, seconds: 4.3, who: "qiu", tier: "虚构", text: "长顺，跟紧了。进了城就有饭。" }],
    },
    // ── 6b 实景：推向玩家的背影，字幕交代你是谁 ─────────────────────────────
    {
      n: 7, seconds: 5.0, focalMm: 50,
      note: "锚在玩家右后方（−x 侧，班长在他左后方、整个裁在画外），从 2.8 m 缓推到 2.2 m：一个空着手的年轻兵的背影、布军帽、绑腿，前面是整队人和雾里的城墙。末尾黑出。注意相机朝 +z 看时画面左边是 +x —— 上一轮画左始终切着半个 m8（review minor）：机位与视轴各往 −x 挪 0.2/0.15，m8 再向东让 0.5（见 cast 注），他就整个出画；树A 也东移过了，帽顶不再长树枝",
      camera: {
        fromActor: "xie", from: [-2.0, 1.35, -2.8], to: [-1.5, 1.3, -2.2],
        lookActor: "xie", look: [-0.25, 1.15, 2.0], lookTo: [-0.15, 1.12, 2.0], ease: "easeInOut",
      },
      sfx: [
        { at: 0.2, name: "footstepDirt", volume: 0.4 },
        { at: 1.0, name: "footstepDirt", volume: 0.34 },
        { at: 1.8, name: "footstepDirt", volume: 0.4 },
        { at: 2.6, name: "footstepDirt", volume: 0.34 },
        { at: 3.4, name: "footstepDirt", volume: 0.36 },
      ],
      subs: [
        { at: 0.2, seconds: 4.75, tier: "虚构", text: "你是谢长顺，四川三台人，十八岁。" },
        // 727 团是真实番号，但「三营九连二等兵谢长顺」是本作虚构的玩家身份 —— 整句按虚构标，与 skipCard 一致
        { at: 0.2, seconds: 4.75, tier: "虚构", text: "第七二七团三营九连，二等兵。" },
      ],
      blackOutAt: 4.4,
    },
    // ── 7 黑场日期卡，接 L0 界河 ───────────────────────────────────────────
    {
      n: 8, seconds: 4.5, focalMm: 50, black: true, titleCard: true,
      note: "黑场日期卡。加「滕县以北」（review minor）：前四镜队伍朝城墙走、班长说进了城就有饭，下一秒却在界河开打 —— 不交代界河在滕县以北，玩家不知道为什么没进城先打野外",
      camera: { from: [X0, G + 1.5, -1320], look: [X0, G + 1.5, -1300] },
      subs: [{ at: 0.2, seconds: 4.3, tier: "主流", date: true, text: "三月十四日 拂晓 · 滕县以北 界河" }],
    },
  ],

  // 跳过后仍要把史实补出来 —— 信息不许因为跳过而丢失。
  // 正片里被压掉的从句（打通津浦路／第十师团／几经转调／无钢盔）在这里保持全须全尾。
  skipCard: {
    title: "出川",
    lines: [
      { tier: "主流", text: "一九三七年十二月，南京陷落。日军南北对进，要打通津浦路，会师徐州。" },
      { tier: "主流", text: "一九三八年三月，第十师团濑谷支队沿津浦路南下。滕县，是徐州以北津浦路正面的门户。" },
      { tier: "主流", text: "守滕县的是川军第二十二集团军。一九三七年九月出川，徒步一千四百余公里北上。" },
      { tier: "主流", text: "十月娘子关，一周损失过半。此后无人补充，几经转调，一九三八年初划归第五战区，开赴鲁南。" },
      { tier: "主流", text: "第四十一军第一二二师师长王铭章，奉命守滕县城。城内能战之兵不足两千，无钢盔，三分之一以上无步枪。" },
      { tier: "虚构", text: "你是第七二七团三营九连二等兵谢长顺，四川三台人，十八岁。" },
    ],
  },

  presumed: [
    { id: "chuchuanStaging", value: "行军纵队 10 人（4 人空手）；城墙剪影摆在纵队前方约 190 m（WALL_Z=−1100，队头 −1292），敌台两座、间距 90 m",
      note: "过场布景推定。镜 3—7 拍的是三月上旬开赴滕县的路上，不是界河阵地（界河在城北二十公里，看不见城墙）；纵队人数、空手比例按「三分之一以上无步枪」取整；敌台间距 90 m 取明清城制 60—90 m 的上限（Data_Tengxian 的 BASTIONS 按 24 座均布算出来是 101.7 m，同一量级）" },
  ],

  // 绝不引用「抗日无力扰民有余」「土匪部队」「诸葛亮还扎草人当疑兵」这三句 ——
  // 均只见于通俗读物与网文，未见 1937—38 年文件或当事人同时代记录背书。
  // 川军被推诿的事实框架可用，这几句对白不可用。
  forbiddenLines: ["抗日无力，扰民有余", "土匪部队", "诸葛亮还扎草人当疑兵"],
};

// ---------------------------------------------------------------------------
// 新版《序章｜出川》——普通士兵第一人称、可自由环视的车厢、移动窗外层、105 秒时间轴。
// 车厢坐标是独立局部系；不绑定界河高度图。这里只写数据，不 import three。
// ---------------------------------------------------------------------------

// 车厢钢地板：CarriageFloor 中心 y=0、厚 0.18 → 顶面 0.09。演员的 pos.y 就是脚底，
// 写 0.13 时全车人悬空 4 cm（低头看自己的脚会看见一条缝）。
const CHUCHUAN_CAR_G = 0.09;
const CHUCHUAN_CAR_RY = Math.PI;
const CHUCHUAN_MOTIVATION_AT = 68.0;
const CHUCHUAN_GEAR_AT = 87.4;
const CHUCHUAN_DOOR_AT = 93.0;
const CHUCHUAN_TRAIN_STOP_AT = 56.0;
const CHUCHUAN_SEAT_LIFT = 0.13;
const CHUCHUAN_END = 105.0;
const CHUCHUAN_SIDE_DOOR_Z = 5.7;
const CHUCHUAN_PLATFORM_Y = 0.58;

// ── 窗带的高度（本场画面里最要紧的四个数）──────────────────────────────────
// 坐姿眼高 1.36。旧版窗洞是 1.28—2.82：窗台只比眼睛低 8 cm，视线几乎贴着窗台走，
// 从座位上望出去只剩天，田野、土堤、电杆全在视线以下 —— 「火车在开」这条信息
// 就是这么丢的。真车厢的窗台在坐姿眼高下面 40—50 cm，人是**往下看**出去的。
const CHUCHUAN_WINDOW_LOW = 0.90;    // 窗台顶面（下半木板到此为止）
const CHUCHUAN_WINDOW_HIGH = 2.55;   // 窗头（上半钢板从此开始）
const CHUCHUAN_WINDOW_MID = (CHUCHUAN_WINDOW_LOW + CHUCHUAN_WINDOW_HIGH) / 2;
const CHUCHUAN_WINDOW_SPAN = CHUCHUAN_WINDOW_HIGH - CHUCHUAN_WINDOW_LOW;

// ── 长凳分段与坐席 ────────────────────────────────────────────────────────
// 凳段中心 [-5.8,-1.95,1.95,5.8]、每段长 3.45 → 段内可坐区间是 ±1.725，段间有缝。
// 坐着的人在 z 向占 ±0.24，所以坐席必须落在 ±1.35 以内；旧表里 -4.05 / -0.36
// 正压在段缝上，半个屁股悬空。每段均分三个坐席，全部落在安全区里。
const CHUCHUAN_BENCH_Z = [-5.8, -1.95, 1.95, 5.8];
const CHUCHUAN_SEAT_PITCH = 1.25;
// 参考滇越铁路的新闻照片：车厢座位坐满，过道则留给上下车和整理行李；只有少数人
// 靠着侧壁、车门或行李架站着。五名有台词的重点人物之外，人群仍是稳定的背景层，
// 但不把车厢排成挤满人的展示间。

function TrackMoveState(from, to, seconds, extra = {}) {
  const speed = Math.hypot(to[0] - from[0], to[2] - from[2]) / Math.max(0.001, seconds);
  return { prepare: 1, moveSpeed: speed / 4.2, travelSpeed: speed, ...extra };
}

/**
 * 一名坐席乘客的全程轨道。
 *
 * ── 下车段的排序（本轮重排的核心）────────────────────────────────────────
 * 旧版让全车人从 95.2 s 起就往过道里走，而玩家的相机 93—101 s 正好沿同一条过道、
 * 同一扇门出去：出图里 t=94 相机贴着别人的帽顶、t=100 直接从排队的人身体里穿过去。
 * 现在的口径是 **玩家先走、人群明显错后**：
 *   · 93—98.5 s 相机在过道里，这段时间**没有一个人离座**（只是站起来靠在自己座位前）；
 *   · 98.8 s 起按「离门远近」依次离座（queueOrder 0 最近门），每人错开 0.8 s；
 *   · 排到门口、跨门槛、下踏板的落点全部往 −z 一侧散开，避开玩家最后停的
 *     (6.8, 7.4)；镜 11 回头仍能看见战友一个接一个从门里下来。
 * queueOrder 大的人在 105 s 内根本轮不到，就一直站在过道里排着 —— 这是对的，
 * 一节车 30 个人不可能十秒钟走空。
 */
function CarSeatTrack(pos, lifeState, stopDelay, queueOrder, exitX, facingRy = CHUCHUAN_CAR_RY) {
  const stopAt = 56.8 + stopDelay;
  const side = Math.sign(pos[0]) || 1;
  const aisleX = side * 0.74;
  // 起立点：站在自己座位**前面**的空地上。写回 x=±1.95 的话人是站在凳面里的
  //（凳段 x 跨 1.66—2.24），小腿整条埋进座板。
  const standPos = [side * 1.28, CHUCHUAN_CAR_G, pos[2]];
  const exitAt = 98.8 + queueOrder * 0.8;
  const aisleAt = exitAt + 1.0;
  const aislePos = [aisleX, CHUCHUAN_CAR_G, pos[2]];
  const queuePos = [aisleX, CHUCHUAN_CAR_G, CHUCHUAN_SIDE_DOOR_Z - 0.5];
  const queueAt = aisleAt + Math.max(0.5, Math.abs(queuePos[2] - pos[2]) / 1.7);
  const thresholdPos = [3.30, 0.24, CHUCHUAN_SIDE_DOOR_Z - 0.1];
  const thresholdAt = queueAt + 1.0;
  const platformPos = [4.80, CHUCHUAN_PLATFORM_Y, CHUCHUAN_SIDE_DOOR_Z - 0.35 - Math.abs(exitX) * 0.5];
  const platformAt = thresholdAt + 0.95;
  const outsidePos = [5.70 + Math.abs(exitX) * 0.35, CHUCHUAN_PLATFORM_Y, CHUCHUAN_SIDE_DOOR_Z - 1.7 - Math.abs(exitX) * 1.1];
  const outsideAt = platformAt + 1.3;
  const tail = Math.max(CHUCHUAN_END, outsideAt + 0.1);
  return [
    { t: 0, pos, ry: facingRy, state: { ...lifeState, sit: 1, seatLift: CHUCHUAN_SEAT_LIFT } },
    { t: stopAt, pos, ry: facingRy, state: { ...lifeState, sit: 1, seatLift: CHUCHUAN_SEAT_LIFT } },
    // 两声炮之间陆续停手、抬头；动员问答全程仍坐着，不抢班长的站姿。
    { t: Math.min(67.7, stopAt + 0.65), pos, ry: facingRy, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.08 } },
    { t: CHUCHUAN_MOTIVATION_AT, pos, ry: facingRy, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.16 } },
    // “好样的”之后默默把随身物件收好；地点卡期间才起身。
    { t: CHUCHUAN_GEAR_AT, pos, ry: facingRy, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.55 } },
    { t: 90.8, pos, ry: facingRy, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.8 } },
    // 门一开就起身，但只是离座站到自己座位前；过道让给先走的玩家。
    { t: CHUCHUAN_DOOR_AT - 0.7, pos, ry: facingRy, state: TrackMoveState(pos, standPos, 0.7, { prepare: 1 }) },
    { t: CHUCHUAN_DOOR_AT, pos: standPos, ry: facingRy, state: { prepare: 1, moveSpeed: 0 } },
    { t: exitAt, pos: standPos, ry: facingRy, state: TrackMoveState(standPos, aislePos, aisleAt - exitAt) },
    // 从自己的座位进过道、沿过道走到侧门、跨踏板登上月台；不再黑场瞬移到车尾。
    { t: aisleAt, pos: aislePos, ry: Math.PI, state: TrackMoveState(aislePos, queuePos, queueAt - aisleAt) },
    { t: queueAt, pos: queuePos, ry: Math.PI, state: TrackMoveState(queuePos, thresholdPos, thresholdAt - queueAt) },
    { t: thresholdAt, pos: thresholdPos, ry: -Math.PI / 2, state: TrackMoveState(thresholdPos, platformPos, platformAt - thresholdAt) },
    { t: platformAt, pos: platformPos, ry: -Math.PI / 2, state: TrackMoveState(platformPos, outsidePos, outsideAt - platformAt) },
    { t: outsideAt, pos: outsidePos, ry: Math.PI, state: { prepare: 1, moveSpeed: 0 } },
    { t: tail, pos: outsidePos, ry: Math.PI, state: { prepare: 1, moveSpeed: 0 } },
  ];
}

/**
 * 班长从头就立在镜头正对的车厢末端，面向满车人检查弹药；他不是被坐席和人群吞掉的第五个
 * 同质化乘客。第二声炮后只需收起手里的弹匣、正身说话，动员时始终可见。
 */
/**
 * 班长下车段重排：旧版让他 94.9 s 起沿过道→门→月台走，落点 (5.55, 5.7) 正是
 * 玩家镜 10 末尾的机位 (5.20, 5.7) 与镜 11 起点 —— t=100 那张图里相机整个穿在
 * 他身体里。现在他**先于玩家一步下车、随即让开到月台前方**：跨门槛比相机早 2 s，
 * 99 s 就离开门口，101 s 前走到 (7.5, 11.0) 站定回身。玩家镜 11 停稳时他在
 * 正前方四米、和车外军官一左一右，画面里终于有人。
 */
// facingRy 1.35（YawFacing 口径：朝 −x 略偏 −z）＝ 班长侧身对着整节车说话。
// 原来写 Math.PI 是朝 +z、也就是背对全车对着端墙；改成 0 又变成 22 秒正脸怼镜头
//（脸是光板，施工单明说不许）。1.35 从玩家座位看过去是 3/4 背影，正是分镜要的。
function CarRearLeaderTrack(pos, facingRy = 0) {
  const doorPos = [1.90, CHUCHUAN_CAR_G, CHUCHUAN_SIDE_DOOR_Z - 0.10];
  const thresholdPos = [3.30, 0.24, CHUCHUAN_SIDE_DOOR_Z];
  const platformPos = [4.85, CHUCHUAN_PLATFORM_Y, CHUCHUAN_SIDE_DOOR_Z + 0.6];
  const standPos = [7.20, CHUCHUAN_PLATFORM_Y, 12.4];
  return [
    { t: 0, pos, ry: facingRy, state: { checkAmmo: 0.85, moveSpeed: 0 } },
    { t: 56.8, pos, ry: facingRy, state: { checkAmmo: 0.22, prepare: 0.10, moveSpeed: 0 } },
    { t: CHUCHUAN_MOTIVATION_AT, pos, ry: facingRy, state: { prepare: 0.28, moveSpeed: 0 } },
    { t: 83.6, pos, ry: facingRy, state: { prepare: 0.42, moveSpeed: 0 } },
    { t: CHUCHUAN_GEAR_AT, pos, ry: facingRy, state: { prepare: 0.74, moveSpeed: 0 } },
    // 门开满（93.0 起滑 2 s）之后他才动，94.6—95.8 走到门边、95.8—96.9 跨门槛。
    // 93.0 就起步的话，t=94 相机的视线扫掠点正好压在他身上（实测 1.6 m 一个后脑勺
    // 糊满全幅）；等到 94.6 再走，那一刻他还在 2.6 m 外、离视轴 45°。
    // ry 全部按 YawFacing = atan2(-dx,-dz) 逐段给：原来整段保持 π／−π/2，
    // 人是横着平移过去的。
    { t: CHUCHUAN_DOOR_AT, pos, ry: facingRy, state: { prepare: 1, moveSpeed: 0 } },
    { t: 94.6, pos, ry: -1.388, state: TrackMoveState(pos, doorPos, 1.2, { prepare: 1 }) },
    { t: 95.8, pos: doorPos, ry: -1.642, state: TrackMoveState(doorPos, thresholdPos, 1.1, { prepare: 1 }) },
    { t: 96.9, pos: thresholdPos, ry: -1.941, state: TrackMoveState(thresholdPos, platformPos, 1.0, { prepare: 1 }) },
    { t: 97.9, pos: platformPos, ry: -2.772, state: TrackMoveState(platformPos, standPos, 3.3, { prepare: 1 }) },
    { t: 101.2, pos: standPos, ry: -0.75, state: { prepare: 1, moveSpeed: 0 } },
    { t: CHUCHUAN_END, pos: standPos, ry: -0.75, state: { prepare: 1, moveSpeed: 0 } },
  ];
}

/** 靠侧壁、行李架或车门站着的兵保持原位；黑场地点卡内才随排撤下，不在开门镜里凭空闪走。 */
function CarStandTrack(pos, lifeState, stopDelay, facingRy = CHUCHUAN_CAR_RY) {
  const stopAt = 56.8 + stopDelay;
  const { sit: _sit, ...standingLife } = lifeState || {};
  return [
    { t: 0, pos, ry: facingRy, state: { ...standingLife, moveSpeed: 0 } },
    { t: stopAt, pos, ry: facingRy, state: { ...standingLife, prepare: 0.10, moveSpeed: 0 } },
    { t: CHUCHUAN_MOTIVATION_AT, pos, ry: facingRy, state: { prepare: 0.18, moveSpeed: 0 } },
    { t: CHUCHUAN_GEAR_AT, pos, ry: facingRy, state: { prepare: 0.58, moveSpeed: 0 } },
    { t: 90.8, pos, ry: facingRy, state: { prepare: 1, moveSpeed: 0 } },
    // 背景站客在镜头结束时仍按次序排队；不为“清空车厢”凭空消失。
    { t: CHUCHUAN_END, pos, ry: facingRy, state: { prepare: 1, moveSpeed: 0 } },
  ];
}

/**
 * 玩家身体与相机必须走**同一条曲线**。
 *
 * 镜 8—11 的相机是 ease:"easeInOut"，而演员轨道两帧之间只会线性插值 ——
 * 于是镜 8 的中段相机落后身体 0.2 m，第一人称相机正好停在自己脑袋后面：
 * t=94 那张图整幅被自己的帽子和后脑勺糊住。（顺带查实：firstPerson 现在
 * **没有**真的把头藏掉，见 engineRequests；所以这 0.2 m 直接可见。）
 * 这里按 EASINGS.easeInOut 逐段采样，身体永远和相机同相位。
 */
function EaseInOut(k) { return k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k); }

function EasedWalk(from, to, t0, t1, extra = {}, steps = 6) {
  const frames = [];
  for (let i = 0; i < steps; i += 1) {
    const k0 = i / steps, k1 = (i + 1) / steps;
    const e0 = EaseInOut(k0), e1 = EaseInOut(k1);
    const p0 = [0, 1, 2].map((a) => from[a] + (to[a] - from[a]) * e0);
    const p1 = [0, 1, 2].map((a) => from[a] + (to[a] - from[a]) * e1);
    frames.push({ t: t0 + (t1 - t0) * k0, pos: p0, state: TrackMoveState(p0, p1, (t1 - t0) / steps, extra) });
  }
  return frames;
}

/** 玩家不是悬空的摄影机：他有一具普通士兵身体，先坐在右侧长凳，再完整走侧门下车。 */
function PlayerSoldierTrack() {
  const seat = [1.95, CHUCHUAN_CAR_G, 3.42];
  const aisle = [0.70, CHUCHUAN_CAR_G, 5.30];
  // 踏板高度按道具实测：门槛顶 0.15、内踏板顶 0.24、外踏板顶 0.48、月台面 0.58。
  // 旧值 0.18 让脚陷进内踏板 6 cm。
  const threshold = [3.35, 0.24, CHUCHUAN_SIDE_DOOR_Z];
  const platform = [5.20, CHUCHUAN_PLATFORM_Y, CHUCHUAN_SIDE_DOOR_Z];
  const standing = [6.80, CHUCHUAN_PLATFORM_Y, 7.40];
  return [
    { t: 0, pos: seat, ry: Math.PI / 2, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, warmHands: 0.35 } },
    { t: 57.2, pos: seat, ry: Math.PI / 2, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.10 } },
    { t: CHUCHUAN_MOTIVATION_AT, pos: seat, ry: Math.PI / 2, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.16 } },
    { t: CHUCHUAN_GEAR_AT, pos: seat, ry: Math.PI / 2, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.55 } },
    { t: 90.8, pos: seat, ry: Math.PI / 2, state: { prepare: 1, moveSpeed: 0 } },
    ...EasedWalk(seat, aisle, 93.0, 95.5).map((f) => ({ ...f, ry: 2.55 })),
    ...EasedWalk(aisle, threshold, 95.5, 98.5).map((f) => ({ ...f, ry: -Math.PI / 2 })),
    ...EasedWalk(threshold, platform, 98.5, 101.0).map((f) => ({ ...f, ry: -Math.PI / 2 })),
    ...EasedWalk(platform, standing, 101.0, 105.0).map((f) => ({ ...f, ry: -1.0 })),
    { t: CHUCHUAN_END, pos: standing, ry: 0, state: { prepare: 1, moveSpeed: 0 } },
  ];
}

const CHUCHUAN_CROWD_UNIFORMS = [0x5C6674, 0x687382, 0x747F8C, 0x7F857A, 0x828A93, 0x8A8778, 0x767E75, 0x918879];
const CHUCHUAN_CROWD_TROUSERS = [0x41484D, 0x4C5660, 0x565C5E, 0x625F54, 0x3D4547, 0x626A69, 0x50585E];
const CHUCHUAN_CROWD_WEBBING = [0x8C8467, 0x7B7660, 0x6F6A55, 0x746D58];
const CHUCHUAN_CROWD_LIFE = [
  { sleep: 0.38 }, { warmHands: 0.62 }, { checkAmmo: 0.46 }, { watch: 0.44 },
  { checkAmmo: 0.18 }, { cleanRifle: 0.34 }, { sit: 0.82 }, { repairShoe: 0.28 },
];

/** 以序号稳定分配上衣、长裤和装具，重播、截图与存档都不会因随机数变色。 */
function CrowdAppearance(n) {
  return {
    uniformHex: CHUCHUAN_CROWD_UNIFORMS[n % CHUCHUAN_CROWD_UNIFORMS.length],
    trouserHex: CHUCHUAN_CROWD_TROUSERS[(n * 3 + 1) % CHUCHUAN_CROWD_TROUSERS.length],
    accessoryHex: CHUCHUAN_CROWD_WEBBING[(n * 5 + 2) % CHUCHUAN_CROWD_WEBBING.length],
  };
}

/**
 * 车厢的坐席按**凳段**排，不再按等距的一串 z。
 * 凳段中心 [-5.8,-1.95,1.95,5.8]、每段 3.45 长，段与段之间是空的；旧表里
 * -4.05 与 -0.36 正落在段缝上，出图里那两个人半个屁股悬在凳段外。
 * 现在每段只排三个坐席，全部落在段中心 ±1.35 以内（坐姿 z 向占 ±0.24，
 * 离段端至少留 0.4 m）：
 *   段 -5.8 → -7.05 / -5.80 / -4.55
 *   段 -1.95 → -3.35 / -2.55（重点 NPC）/ -0.75
 *   段  1.95 →  0.75 / 1.90 / 2.50—2.75（重点 NPC）/ 3.42（玩家，右侧）
 *   段  5.8 →  4.55 / 5.80 / 7.05（右侧被侧门占掉，没有这一段）
 * 重点 NPC 的 z 一律不动（-2.55 / 2.75），只把背景乘客让开。
 */
const CHUCHUAN_CROWD_SEAT_Z = {
  "-1": [-7.05, -5.80, -4.55, -3.35, -0.75, 0.75, 1.90, 4.55, 5.80, 7.05],
  "1": [-7.05, -5.80, -4.55, -3.35, -0.75, 0.75],
};

function CreateCarriageCrowdCast() {
  const crowd = [];
  // 下车顺序按「离侧门多远」排：门口的人先动，车厢深处的人在 105 s 内还轮不到，
  // 就一直站在过道里排队 —— 一节三十人的车不可能十秒钟走空。
  const seats = [];
  for (const side of [-1, 1]) {
    for (const z of CHUCHUAN_CROWD_SEAT_Z[String(side)]) seats.push({ side, z });
  }
  seats.sort((a, b) => Math.abs(CHUCHUAN_SIDE_DOOR_Z - a.z) - Math.abs(CHUCHUAN_SIDE_DOOR_Z - b.z));
  seats.forEach(({ side, z }, order) => {
    const id = `crowdSeat${side < 0 ? "L" : "R"}${String(Math.round((z + 8) * 10)).padStart(3, "0")}`;
    const n = crowd.length;
    crowd.push({
      id, kind: "nra", weapon: n % 3 === 0 ? null : "HanYang", seed: `chuchuan${id}`,
      ...CrowdAppearance(n),
      track: CarSeatTrack([side * 1.95, CHUCHUAN_CAR_G, z], CHUCHUAN_CROWD_LIFE[n % CHUCHUAN_CROWD_LIFE.length],
        (n % 7) * 0.52, order, side * (0.35 + (order % 4) * 0.30), side < 0 ? -Math.PI / 2 : Math.PI / 2),
    });
  });
  // 站客靠在**凳段之间的空档**前，不站在别人的腿上；x 从 ±1.2 挪到 ±1.35，
  // 把 |x|<1.0 的净过道整条让给玩家的相机（93—98.5 s 它正沿过道走向车门）。
  // 右侧 z≈3.9 那一位删掉：他离玩家座位 (1.95,3.42) 只有 0.7 m，镜 8 第一帧
  // 就是一张贴脸的帽顶。
  const standingPlaces = [
    [-1.35, -7.90, 0], [1.38, -3.87, Math.PI], [-1.30, 0.00, 0],
    [1.34, 8.40, Math.PI], [-1.35, 3.87, 0], [-1.35, 6.90, 0],
  ];
  standingPlaces.forEach(([x, z, ry], index) => {
    const n = crowd.length;
    const id = `crowdStand${index + 1}`;
    crowd.push({
      id, kind: "nra", weapon: n % 3 === 1 ? null : "HanYang", seed: `chuchuan${id}`,
      ...CrowdAppearance(n),
      track: CarStandTrack([x, CHUCHUAN_CAR_G, z], CHUCHUAN_CROWD_LIFE[(n + 3) % CHUCHUAN_CROWD_LIFE.length], (n % 7) * 0.48, ry),
    });
  });
  return crowd;
}

// ---------------------------------------------------------------------------
// 小站（自建盒子布景，不再挂 Model_ChuchuanStationPlatform.glb）
// ---------------------------------------------------------------------------
//
// ★ 为什么不用那个 glb：它的「上」是 **−Z**、长轴是 **+Y**（Blender 侧导出时没做
//   Z-up→Y-up 转换），直接进 three（Y-up）后整座月台**立成一块 36 m 高的板子**。
//   t=45／t=50.5 窗外那块浅灰大板、t=97 门外那面白墙，就是这块立起来的月台。
//   而且它内部还自相矛盾：站房、雨棚顶、横梁、站牌按「上=−Z」建，雨棚柱、水鹤柱、
//   灯柱、凳腿却按「上=+Y」建 —— 无论整体怎么旋转都会有一半零件躺下。
//   模型不归本文件管（改它要重跑 Blender 管线），所以这里改用盒子搭一座同规格的
//   小站：石基高月台、木雨棚、候车屋、站牌、长凳、货箱、水鹤。engineRequests 里
//   写清楚模型要怎么修。
//
// ★ 掠过与定位用**同一条**里程：整座站台由 ambientMotion 沿 +z 匀速推，
//   stopAt=56 停住，停下的位置正好是侧门外 (z = CHUCHUAN_SIDE_DOOR_Z)。
//   旧版是镜 4 用 propMoves 推到 +13.2、镜 5 又用 hold 钉回 +5.7 —— 切镜那一帧
//   站台整体倒跳 7.5 m，玩家扭头看右窗就穿帮。现在结构上不可能跳：
//   只有一条速度、一个终点，镜头切换与它无关。
const CHUCHUAN_STATION_X = 7.4;                     // 月台中心 x（宽 6.0 → 4.4—10.4）
const CHUCHUAN_STATION_SPEED = 1.65;                // m/s：16 s 掠过 26.4 m，与旧版同速
const CHUCHUAN_STATION_STOP_Z = CHUCHUAN_SIDE_DOOR_Z;
const CHUCHUAN_STATION_FROM_Z = CHUCHUAN_STATION_STOP_Z - CHUCHUAN_STATION_SPEED * CHUCHUAN_TRAIN_STOP_AT;
const CHUCHUAN_STATION_ENTER_AT = 39;               // 站台前端进入右窗视野的时刻

function StationPlatformZ(time) {
  const t = Math.max(0, Math.min(CHUCHUAN_TRAIN_STOP_AT, time));
  return CHUCHUAN_STATION_FROM_Z + CHUCHUAN_STATION_SPEED * t;
}

/**
 * 站台上的人先随车站掠过，再自己沿月台走出车窗范围。最后的 hidden 帧放在
 * 画外，不能再把三人同时切掉；ry=π 保证他们真的朝 +Z 走，而不是倒着滑。
 */
function StationRailTrack(x, platformOffset, walkDistance, state = { moveSpeed: 0.16 }) {
  const posAt = (time, walking) => [x, CHUCHUAN_PLATFORM_Y, StationPlatformZ(time) + platformOffset + walking];
  const passSpan = CHUCHUAN_TRAIN_STOP_AT - CHUCHUAN_STATION_ENTER_AT;
  // travelSpeed 是世界坐标中的合速度（车站掠过 + 人自己走）；moveSpeed 仍只管步态。
  const passingState = { ...state, travelSpeed: (CHUCHUAN_STATION_SPEED * passSpan + walkDistance) / passSpan };
  const exitState = { ...state, travelSpeed: 3.6 / 7 };
  return [
    { t: 0, pos: posAt(CHUCHUAN_STATION_ENTER_AT, 0), ry: Math.PI, state: { hidden: true } },
    { t: CHUCHUAN_STATION_ENTER_AT, pos: posAt(CHUCHUAN_STATION_ENTER_AT, 0), ry: Math.PI, state: passingState },
    { t: CHUCHUAN_TRAIN_STOP_AT, pos: posAt(CHUCHUAN_TRAIN_STOP_AT, walkDistance), ry: Math.PI, state: exitState },
    { t: 63, pos: posAt(CHUCHUAN_TRAIN_STOP_AT, walkDistance + 3.6), ry: Math.PI, state: exitState },
    { t: 64, pos: posAt(CHUCHUAN_TRAIN_STOP_AT, walkDistance + 4.4), ry: Math.PI, state: { hidden: true } },
  ];
}

/**
 * 小站零件表。pos 是**相对月台中心**的局部坐标（x 相对 CHUCHUAN_STATION_X、
 * z 相对当时的站台里程），StationProps／StationMotion 各用一次，名字天然一一对应。
 * 高度基准：石基 0—0.48、木面板顶 0.58（= CHUCHUAN_PLATFORM_Y，演员就踩这里）。
 */
const CHUCHUAN_STATION_PARTS = [
  // ── 月台本体：石基 + 木面板 + 靠车一侧的条石沿 ──────────────────────────
  { name: "StationBase", kind: "box", size: [6.0, 0.48, 40], pos: [0, 0.24, 0], mat: "Stone", color: 0x827866, roughness: 0.98 },
  { name: "StationDeck", kind: "box", size: [5.7, 0.10, 39.4], pos: [0, 0.53, 0], mat: "WoodBeam", color: 0x8a7f6c, roughness: 0.97 },
  { name: "StationEdge", kind: "box", size: [0.36, 0.20, 40], pos: [-2.86, 0.48, 0], mat: "Stone", color: 0x857b6d, roughness: 0.98 },
  // 月台面上每隔 4 m 一道木缝，长月台才不是一整块没有尺度的板
  ...[-16, -12, -8, -4, 0, 4, 8, 12, 16].map((dz, i) => ({
    name: `StationDeckJoint${i}`, kind: "box", size: [5.6, 0.03, 0.07], pos: [0, 0.585, dz],
    mat: "WoodBeam", color: 0x4c443a,
  })),
  // ── 木雨棚：柱子立在**月台靠车的边沿**（局部 x=−2.55，世界 4.85）而不是月台
  //    正中。旧摆位 x=5.5 恰好挡在玩家下车的走线上：t=100 那张图整幅被一根柱子
  //    劈成两半。柱距也避开 dz=0（正对车门）与 dz=1.7（玩家最后停的位置）。
  //    雨棚顶 castShadow:false —— 它一投影就把整段月台（连人带站牌带长凳）压成
  //    一片黑，而柱与梁的细影仍留着，地面不会平得没有信息。
  ...[-9.6, -6.0, -2.4, 4.8, 8.4, 12.0].map((dz, i) => ({
    name: `StationCanopyPost${i}`, kind: "box", size: [0.20, 2.74, 0.20], pos: [-2.55, 1.95, dz],
    mat: "WoodStock", color: 0xc2a679, repeat: [1, 3],
  })),
  ...[-9.6, -2.4, 8.4].map((dz, i) => ({
    name: `StationCanopyRear${i}`, kind: "box", size: [0.18, 2.98, 0.18], pos: [2.20, 2.07, dz],
    mat: "WoodStock", color: 0xc2a679, repeat: [1, 3],
  })),
  { name: "StationCanopyBeam", kind: "box", size: [0.24, 0.22, 27.0], pos: [-2.55, 3.43, 1.0], mat: "WoodStock", color: 0xac9068, repeat: [1, 18] },
  { name: "StationCanopyRearBeam", kind: "box", size: [0.20, 0.20, 27.0], pos: [2.20, 3.66, 1.0], mat: "WoodStock", color: 0xac9068, repeat: [1, 18] },
  { name: "StationCanopyRoof", kind: "box", size: [5.30, 0.16, 27.6], pos: [-0.175, 3.65, 1.0], rz: 0.0463, mat: "RoofTile", color: 0xc6bcac, castShadow: false },
  // ── 候车屋：砖房 + 瓦顶 + 木门 + 两扇窗（门窗朝月台，玩家下车正对它）────
  { name: "StationOffice", kind: "box", size: [2.50, 2.90, 5.60], pos: [1.75, 2.03, 13.4], mat: "BrickWall", color: 0x8d8171, roughness: 0.98 },
  { name: "StationOfficeRoof", kind: "box", size: [3.05, 0.24, 6.20], pos: [1.75, 3.60, 13.4], mat: "RoofTile", color: 0x6d6357 },
  { name: "StationOfficeDoor", kind: "box", size: [0.10, 1.92, 1.06], pos: [0.46, 1.54, 13.4], mat: "WoodStock", color: 0xa5865c, repeat: 1 },
  ...[11.6, 15.2].map((dz, i) => ([
    // 玻璃用深色低粗糙：0x99a2a4 在低日直射下整块过曝成白灯箱（t=45 实拍）。
    { name: `StationOfficeWindow${i}`, kind: "box", size: [0.10, 0.72, 0.86], pos: [0.46, 2.02, dz], color: 0x2e363c, roughness: 0.25 },
    { name: `StationOfficeWindowSill${i}`, kind: "box", size: [0.16, 0.09, 1.02], pos: [0.45, 1.62, dz], mat: "Stone", color: 0xa39985 },
  ])).flat(),
  { name: "StationOfficeChimney", kind: "box", size: [0.40, 0.90, 0.40], pos: [2.30, 4.10, 11.9], mat: "BrickWall", color: 0x77685a },
  // ── 站牌：两根木柱 + 一块白底站名板，摆在玩家下车后正前方 6 m ───────────
  ...[-0.9, 0.9].map((d, i) => ({
    name: `StationSignPost${i}`, kind: "box", size: [0.10, 1.84, 0.10], pos: [1.60, 1.50, 5.0 + d],
    mat: "WoodStock", color: 0xb49874, repeat: [1, 2],
  })),
  // 站名板：白底不能刷到 0xd6 —— 出图里是一块比天还亮的空白板。
  // 压到旧漆的米灰，外面再套一圈深木边框，读作「一块挂了很久的站牌」。
  { name: "StationSignFrame", kind: "box", size: [0.08, 0.62, 2.06], pos: [1.62, 2.26, 5.0], mat: "WoodStock", color: 0x7c674a, repeat: 1 },
  { name: "StationSignBoard", kind: "box", size: [0.10, 0.48, 1.86], pos: [1.58, 2.26, 5.0], color: 0x938d78 },
  // ── 月台家什：候车长凳两条、三只货箱、一副行李车板 ─────────────────────
  ...[2.2, -6.0].map((dz, i) => ([
    { name: `StationBenchSeat${i}`, kind: "box", size: [0.48, 0.09, 1.70], pos: [1.95, 1.02, dz], mat: "WoodStock", color: 0xc0a882, repeat: 1 },
    { name: `StationBenchBack${i}`, kind: "box", size: [0.10, 0.56, 1.70], pos: [2.18, 1.32, dz], mat: "WoodStock", color: 0xc0a882, repeat: 1 },
    { name: `StationBenchLegA${i}`, kind: "box", size: [0.42, 0.44, 0.09], pos: [1.98, 0.80, dz - 0.72], mat: "WoodStock", color: 0x9a8360, repeat: 1 },
    { name: `StationBenchLegB${i}`, kind: "box", size: [0.42, 0.44, 0.09], pos: [1.98, 0.80, dz + 0.72], mat: "WoodStock", color: 0x9a8360, repeat: 1 },
  ])).flat(),
  ...[[1.7, -2.4, 0], [2.25, -1.85, 0.34], [1.55, -1.30, 0]].map(([dx, dz, lift], i) => ({
    name: `StationCrate${i}`, kind: "box", size: [0.62, 0.55, 0.62], pos: [dx, 0.86 + lift, dz],
    mat: "WoodStock", color: 0xb59a6c,
  })),
  // ── 水鹤：立在月台北端（玩家背后），是「这是一座加水的小站」的读点 ───────
  { name: "StationCraneMast", kind: "cyl", size: [0.17, 3.20], pos: [-2.45, 2.18, -11.5], mat: "Steel", color: 0x3d3a35 },
  { name: "StationCraneArm", kind: "box", size: [1.90, 0.15, 0.15], pos: [-3.35, 3.62, -11.5], mat: "Steel", color: 0x3d3a35 },
  { name: "StationCraneSpout", kind: "cyl", size: [0.12, 0.85], pos: [-4.25, 3.16, -11.5], mat: "Steel", color: 0x45413a },
  // 月台尽头的货棚与三棵秃杨：把 +z 方向那一片只剩雾的空地填上真几何。
  { name: "StationGoodsShed", kind: "box", size: [3.20, 2.40, 6.00], pos: [1.30, 1.78, 26.0], mat: "Adobe", color: 0x8a8072 },
  { name: "StationGoodsShedRoof", kind: "box", size: [3.80, 0.22, 6.60], pos: [1.30, 3.09, 26.0], mat: "RoofTile", color: 0x7d7264 },
  ...[24.0, 33.0, 42.0].map((dz, i) => ([
    { name: `StationPoplar${i}`, kind: "cyl", size: [0.13, 8.4], pos: [-4.6, 4.2, dz], mat: "TreeBark", color: 0x6a5f4e },
    { name: `StationPoplarBranchA${i}`, kind: "box", size: [0.06, 2.6, 0.06], pos: [-4.9, 6.6, dz + 0.2], rz: 0.42, mat: "TreeBark", color: 0x6a5f4e },
    { name: `StationPoplarBranchB${i}`, kind: "box", size: [0.06, 2.4, 0.06], pos: [-4.3, 7.0, dz - 0.2], rz: -0.36, mat: "TreeBark", color: 0x6a5f4e },
  ])).flat(),
  // ── 站台灯：三月上午不点，但灯罩与铁杆是月台轮廓的一部分 ─────────────────
  // 雨棚下五盏吊灯，挂在**雨棚正中**（局部 x=−0.40）。抬头（pitch +1.15）时
  // 雨棚底面朝下、吃不到任何天光，不给灯就是一整幅纯黑；挂在靠车一侧（−2.10）
  // 又只照亮一半，站房那半边仍是黑板（t=100 画左那块）。顶面颜色也一并抬亮。
  ...[-9.0, -4.0, 0.0, 5.0, 10.0].map((dz, i) => ([
    { name: `StationLampStem${i}`, kind: "cyl", size: [0.05, 0.34], pos: [-0.40, 3.34, dz], mat: "Steel", color: 0x3b3833 },
    { name: `StationLampShade${i}`, kind: "cyl", size: [0.22, 0.16], pos: [-0.40, 3.09, dz], mat: "Steel", color: 0x6d675c,
      emissive: 0x30200c, light: { color: 0xffd7a4, intensity: 10.5, distance: 12.0, decay: 1.10, offsetY: -0.14 } },
  ])).flat(),
];

/** 建站台的 props（初始摆在 t=0 的里程上；真正的位置由 ambientMotion 每帧给）。 */
function StationProps() {
  return CHUCHUAN_STATION_PARTS.map((part) => ({
    ...part,
    pos: [CHUCHUAN_STATION_X + part.pos[0], part.pos[1], StationPlatformZ(0) + part.pos[2]],
  }));
}

/** 和 StationProps 一一对应的匀速位移：一条速度、一个终点，切镜不会跳。 */
function StationMotion() {
  return CHUCHUAN_STATION_PARTS.map((part) => ({
    name: part.name,
    from: [CHUCHUAN_STATION_X + part.pos[0], part.pos[1], CHUCHUAN_STATION_FROM_Z + part.pos[2]],
    axis: [0, 0, 1], speed: CHUCHUAN_STATION_SPEED, loop: false, stopAt: CHUCHUAN_TRAIN_STOP_AT,
  }));
}

/**
 * 四段有靠背木座椅。旧版把每侧整条长凳做成一根落地实心盒，演员像悬在
 * 黑色柜台上；分段座板、靠背、腿架与露空座下空间才有列车车厢的轮廓。
 */
function CarriageBench(side, label) {
  const seatX = side * 1.95;
  const backX = side * 2.34;
  const props = [];
  [-5.8, -1.95, 1.95, 5.8].forEach((z, index) => {
    // 右侧最后一段让给正式侧门和折叠踏板，门洞前不再横着一张长凳。
    if (side > 0 && z === 5.8) return;
    const id = `${label}${index + 1}`;
    props.push(
      // 窄木长凳：0.58 m 座深，够承托坐骨而不吞掉小腿。此前 0.94 m 的宽板
      // 把腿包进凳面，人物自然会显得“脚从椅子里磨出来”。
      { kind: "box", size: [0.58, 0.10, 3.45], pos: [seatX, 0.50, z], mat: "CarriageBenchWood", roughness: 0.94, metalness: 0, name: `BenchSeat${id}` },
      { kind: "box", size: [0.10, 0.64, 3.45], pos: [backX, 0.86, z], mat: "CarriageBenchWood", roughness: 0.94, metalness: 0, name: `BenchBack${id}` },
      { kind: "box", size: [0.46, 0.48, 0.10], pos: [seatX, 0.27, z - 1.34], mat: "Steel", color: 0x3f4143, name: `BenchLeg${id}A` },
      { kind: "box", size: [0.46, 0.48, 0.10], pos: [seatX, 0.27, z + 1.34], mat: "Steel", color: 0x3f4143, name: `BenchLeg${id}B` },
    );
  });
  return props;
}

/**
 * 每名士兵随身的一点家当：行李架上的被卷与油布包、凳下背包、手边水壶和饭盒。
 * 尺寸和颜色按序号固定，不用随机数；右侧门洞 4.4—7.0 m 全部留空。
 */
function CarriagePersonalEffects() {
  const props = [];
  const colors = [0x777164, 0x827766, 0x6c6353, 0x897d69, 0x756c5b, 0x62685e];
  const rackZ = [-6.9, -5.8, -4.65, -3.45, -2.15, -0.75, 0.65, 2.05, 3.35, 4.65, 6.0, 7.25];
  for (const side of [-1, 1]) {
    const label = side < 0 ? "Left" : "Right";
    rackZ.forEach((z, index) => {
      if (side > 0 && z > 4.15 && z < 7.15) return;
      const color = colors[(index + (side > 0 ? 2 : 0)) % colors.length];
      props.push(
        { kind: "box", size: [0.42, 0.28, 0.56], pos: [side * 2.25, 3.03, z], mat: "ClothNra", color, roughness: 0.98, name: `RackPack${label}${index}` },
        { kind: "cyl", size: [0.14, 0.52], pos: [side * 2.14, 3.10, z + 0.34], rx: Math.PI / 2, mat: "ClothNra", color: colors[(index + 1) % colors.length], name: `Bedroll${label}${index}` },
        { kind: "box", size: [0.025, 0.32, 0.07], pos: [side * 2.02, 3.03, z], mat: "ClothNra", color: 0xa69472, name: `RackPackStrap${label}${index}` },
      );
    });
    [-6.75, -5.25, -3.65, -2.25, -0.65, 0.85, 2.35, 3.55, 7.35].forEach((z, index) => {
      props.push(
        { kind: "box", size: [0.46, 0.34, 0.52], pos: [side * 2.22, 0.25, z], mat: "ClothNra", color: colors[(index * 2 + (side > 0 ? 1 : 0)) % colors.length], name: `BenchPack${label}${index}` },
        { kind: "box", size: [0.025, 0.36, 0.07], pos: [side * 1.98, 0.27, z - 0.13], mat: "ClothNra", color: 0xa69472, name: `BenchPackStrap${label}${index}A` },
        { kind: "box", size: [0.025, 0.36, 0.07], pos: [side * 1.98, 0.27, z + 0.13], mat: "ClothNra", color: 0xa69472, name: `BenchPackStrap${label}${index}B` },
        { kind: "cyl", size: [0.09, 0.30], pos: [side * 2.46, 0.87, z + 0.40], mat: "Steel", color: index % 2 ? 0x4c514a : 0x5a5549, name: `Canteen${label}${index}` },
      );
    });
  }
  // 玩家脚边的通信兵装备明确归属于“我”，低头就能读到自己的身份。
  props.push(
    { kind: "box", size: [0.48, 0.34, 0.58], pos: [2.22, 0.25, 3.60], mat: "ClothNra", color: 0x5d625b, name: "PlayerFieldPack" },
    { kind: "cyl", size: [0.24, 0.38], pos: [1.15, 0.30, 3.72], rz: Math.PI / 2, mat: "WoodStock", color: 0x5a3d27, name: "PlayerCableReel" },
    { kind: "box", size: [0.34, 0.12, 0.46], pos: [1.28, 0.18, 3.12], mat: "Steel", color: 0x5f594d, name: "PlayerMessTin" },
  );
  return props;
}

/** 门板的钢皮、五根木条、双竖撑和门闩必须作为一个整体沿侧壁滑开。 */
function SideDoorMoves() {
  const dz = 2.30;
  const Move = (name, from) => ({ name, startAt: 0, endAt: 2.0, from, to: [from[0], from[1], from[2] + dz], ease: "easeInOut" });
  return [
    Move("CarriageDoor", [2.75, 1.65, CHUCHUAN_SIDE_DOOR_Z]),
    ...[-0.86, -0.43, 0, 0.43, 0.86].map((y, index) => Move(`DoorPlank${index}`, [2.67, 1.65 + y, CHUCHUAN_SIDE_DOOR_Z])),
    Move("DoorBraceLeft", [2.66, 1.65, CHUCHUAN_SIDE_DOOR_Z - 0.78]),
    Move("DoorBraceRight", [2.66, 1.65, CHUCHUAN_SIDE_DOOR_Z + 0.78]),
    Move("DoorLatch", [2.60, 1.62, CHUCHUAN_SIDE_DOOR_Z + 0.15]),
  ];
}

function SideDoorHoldOpenMoves() {
  return SideDoorMoves().map((move) => ({
    ...move, startAt: 0, endAt: 0.01, from: move.to, to: move.to, ease: "hold",
  }));
}

// 担架随两名担架兵一起掠过：速度是「站台里程 + 他们自己沿月台走的 3.3 m」的合速度，
// 与 StationRailTrack 用的是同一组数，所以担架永远在两人中间，不会掉队或抢跑。
const CHUCHUAN_STRETCHER_OFFSET = 10.0;
const CHUCHUAN_STRETCHER_WALK = 3.3;
const CHUCHUAN_STRETCHER_PASS = CHUCHUAN_TRAIN_STOP_AT - CHUCHUAN_STATION_ENTER_AT;
const CHUCHUAN_STRETCHER_SPEED = CHUCHUAN_STATION_SPEED + CHUCHUAN_STRETCHER_WALK / CHUCHUAN_STRETCHER_PASS;
const CHUCHUAN_STRETCHER_FROM_Z = CHUCHUAN_STATION_FROM_Z + CHUCHUAN_STRETCHER_OFFSET
  - CHUCHUAN_STRETCHER_WALK * CHUCHUAN_STATION_ENTER_AT / CHUCHUAN_STRETCHER_PASS;

const CHUCHUAN_STRETCHER_PARTS = [
  { name: "StationStretcher", kind: "box", size: [1.25, 0.15, 2.15], pos: [6.85, 1.22], mat: "ClothNra", color: 0xb29a78 },
  { name: "StationStretcherPoleA", kind: "box", size: [0.13, 0.10, 2.34], pos: [6.22, 1.08], mat: "WoodStock", color: 0x8a6b4c },
  { name: "StationStretcherPoleB", kind: "box", size: [0.13, 0.10, 2.34], pos: [7.48, 1.08], mat: "WoodStock", color: 0x8a6b4c },
];

function StretcherProps() {
  return CHUCHUAN_STRETCHER_PARTS.map((part) => ({
    kind: part.kind, size: part.size, mat: part.mat, color: part.color, name: part.name,
    pos: [part.pos[0], part.pos[1], CHUCHUAN_STRETCHER_FROM_Z],
  }));
}

function StretcherMotion() {
  return CHUCHUAN_STRETCHER_PARTS.map((part) => ({
    name: part.name, from: [part.pos[0], part.pos[1], CHUCHUAN_STRETCHER_FROM_Z],
    axis: [0, 0, 1], speed: CHUCHUAN_STRETCHER_SPEED, loop: false, stopAt: CHUCHUAN_TRAIN_STOP_AT,
  }));
}

/** 一棵窗外掠过的三月秃杨：干与枝分开，近景不会再读成一根孤零零的柱子。 */
function CarriageLandscapeTree(side, label, id, x, z, height, motion) {
  const name = `${motion}Tree${label}${id}`;
  const branch = (suffix, y, rx, rz) => ({
    kind: "box", size: [0.055, 0.055, 1.25], pos: [x + side * 0.18, y, z + rz],
    rx, ry: side * 0.34, mat: "TreeBark", color: 0x4d4439, name: `${name}${suffix}`,
  });
  return [
    { kind: "cyl", size: [0.105, height], pos: [x, height / 2, z], mat: "TreeBark", color: 0x4d4439, name },
    branch("BranchA", height * 0.70, side * 0.54, -0.30),
    branch("BranchB", height * 0.78, -side * 0.43, 0.32),
  ];
}

const CHUCHUAN_ROUTE_START_Z = -742;
const CHUCHUAN_ROUTE_END_Z = 28;
const CHUCHUAN_POLE_Z = [
  -734.0, -709.0, -687.0, -662.0, -634.0, -611.0, -584.0, -560.0, -535.0, -508.0, -482.0, -457.0,
  -431.0, -406.0, -381.0, -356.0, -332.0, -308.0, -284.0, -261.0, -236.0, -210.0, -187.0, -163.0,
  -140.0, -116.0, -93.0, -70.0, -47.0, -24.0, 0.0, 24.0,
];
const CHUCHUAN_MID_SCENERY_Z = [-704, -646, -588, -523, -466, -401, -336, -272, -208, -144, -83, -25, 20];

/**
 * 电报线必须和杆一起是同一段连续铁路，而不是两根杆轮流回卷。横担、瓷绝缘子、
 * 三根下垂电话线都拆成组件，速度严格共用；窗边看到的是一条接得上的通信线。
 */
function CarriageTelegraphPole(side, label, index, z) {
  const name = `RoutePole${label}${index}`;
  const x = side * (3.78 + (index % 3) * 0.06);
  const height = 3.68 + (index % 4) * 0.12;
  const crossY = height - 0.38;
  return [
    { kind: "box", size: [0.14, height, 0.14], pos: [x, height / 2, z], mat: "WoodBeam", color: 0x392e24, noFog: true, name },
    { kind: "box", size: [1.12, 0.10, 0.10], pos: [x, crossY, z], mat: "WoodBeam", color: 0x392e24, noFog: true, name: `${name}Crossbar` },
    ...[-0.42, 0, 0.42].map((offset, wire) => ({ kind: "cyl", size: [0.055, 0.12], pos: [x + offset, crossY - 0.11, z], mat: "Steel", color: 0x9a947f, noFog: true, name: `${name}Insulator${wire}` })),
  ];
}

function CarriageRouteWires(side, label) {
  const routeLength = CHUCHUAN_ROUTE_END_Z - CHUCHUAN_ROUTE_START_Z + 82;
  const centerZ = (CHUCHUAN_ROUTE_START_Z + CHUCHUAN_ROUTE_END_Z) / 2;
  const x = side * 3.80;
  return [-0.42, 0, 0.42].map((offset, wire) => ({
    kind: "box", size: [0.018, 0.018, routeLength], pos: [x + offset, 3.17 - Math.abs(offset) * 0.10, centerZ],
    mat: "Steel", color: 0x282522, noFog: true, name: `RouteWire${label}${wire}`,
  }));
}
/**
 * 车窗外：远景是真实 SRTM 高程采样生成的实体网格，绝不使用天空／山脉图片贴片；
 * 中景是村屋与树带，近景是电杆、秃杨、土堤。只有近、中景随列车掠过。
 */
function WindowLandscape(side, label) {
  const midX = side * 13.5;
  const nearX = side * 4.35;
  return [
    // 最远层是真实 SRTM 高程网格：保留米制横纵比例，不放任何山景图片贴片。
    { kind: "heightTerrain", pos: [0, 0, 0], mat: "Ground", castShadow: false, name: `FarTerrain${label}`, terrain: {
      side, near: 4.0, far: 2500.0, minZ: -910.0, maxZ: 910.0, columns: 88, rows: 72,
      sourceBounds: [-1250, 1250, -2200, -380], sourceReference: [0, -1470], baseY: 0,
    } },
    // 中景：整段行程里的村屋、院墙和树带，不用两个模型环形回卷。
    ...CHUCHUAN_MID_SCENERY_Z.flatMap((z, index) => {
      const x = side * (12.4 + (index % 3) * 1.55);
      const house = index % 3 !== 1;
      const id = `${label}${index}`;
      const set = [
        { kind: "box", size: [0.30, 0.62 + (index % 2) * 0.12, 20 + (index % 3) * 4], pos: [side * 12.0, 0.34, z + 3], mat: "GroundRubble", color: 0x655d50, noFog: true, name: `MidWall${id}` },
        ...CarriageLandscapeTree(side, label, id, x + side * 0.55, z - 4, 3.45 + (index % 3) * 0.42, `MidRoute`),
      ];
      if (house) set.push(
        { kind: "box", size: [2.35 + (index % 2) * 0.36, 1.20 + (index % 3) * 0.12, 2.85 + (index % 2) * 0.42], pos: [x, 0.64, z], mat: index % 2 ? "BrickWall" : "Adobe", color: index % 2 ? 0x786c5d : 0x8b7963, noFog: true, name: `MidHouse${id}` },
        { kind: "box", size: [2.78, 0.13, 1.82], pos: [x, 1.37 + (index % 3) * 0.12, z - 0.62], ry: side * 0.12, rz: side * (index % 2 ? -0.40 : 0.40), mat: "RoofTile", color: 0x504a42, noFog: true, name: `MidHouseRoof${id}` },
      );
      return set;
    }),
    // 近景是一段完整铁路：连续土堤和三根电话线先铺满全程，再由不回卷的杆列接住。
    { kind: "box", size: [1.05, 0.58, 822], pos: [nearX, 0.20, (CHUCHUAN_ROUTE_START_Z + CHUCHUAN_ROUTE_END_Z) / 2], mat: "GroundRubble", color: 0x5b554a, noFog: true, name: `RouteEmbankment${label}` },
    ...CarriageRouteWires(side, label),
    ...CHUCHUAN_POLE_Z.flatMap((z, index) => CarriageTelegraphPole(side, label, index, z)),
    ...CHUCHUAN_POLE_Z.filter((_, index) => index % 3 !== 1).flatMap((z, index) => CarriageLandscapeTree(side, label, `Route${index}`, side * (4.45 + (index % 2) * 0.28), z + 8, 3.25 + (index % 3) * 0.52, "NearRoute")),
  ];
}

/** 和 WindowLandscape 一一对应：同一棵树的干、两根枝共享速度，不能在窗外散架。 */
function WindowLandscapeMotion(side, label) {
  const Move = (name, from, speed) => ({ name, from, axis: [0, 0, 1], speed, loop: false, stopAt: CHUCHUAN_TRAIN_STOP_AT });
  const TreeMoves = (motion, id, x, z, height, speed, span) => {
    const name = `${motion}Tree${label}${id}`;
    return [
      Move(name, [x, height / 2, z], speed),
      Move(`${name}BranchA`, [x + side * 0.18, height * 0.70, z - 0.30], speed),
      Move(`${name}BranchB`, [x + side * 0.18, height * 0.78, z + 0.32], speed),
    ];
  };
  return [
    // 中景：连续村庄比路边杆慢，且每块房、墙、树都有自己的里程，不存在回跳点。
    ...CHUCHUAN_MID_SCENERY_Z.flatMap((z, index) => {
      const id = `${label}${index}`;
      const x = side * (12.4 + (index % 3) * 1.55);
      const house = index % 3 !== 1;
      return [
        Move(`MidWall${id}`, [side * 12.0, 0.34, z + 3], 1.05),
        ...TreeMoves("MidRoute", id, x + side * 0.55, z - 4, 3.45 + (index % 3) * 0.42, 1.05),
        ...(house ? [Move(`MidHouse${id}`, [x, 0.64, z], 1.05), Move(`MidHouseRoof${id}`, [x, 1.37 + (index % 3) * 0.12, z - 0.62], 1.05)] : []),
      ];
    }),
    Move(`RouteEmbankment${label}`, [side * 4.35, 0.20, (CHUCHUAN_ROUTE_START_Z + CHUCHUAN_ROUTE_END_Z) / 2], 6.35),
    ...[-0.42, 0, 0.42].map((offset, wire) => Move(`RouteWire${label}${wire}`, [side * 3.80 + offset, 3.17 - Math.abs(offset) * 0.10, (CHUCHUAN_ROUTE_START_Z + CHUCHUAN_ROUTE_END_Z) / 2], 7.20)),
    ...CHUCHUAN_POLE_Z.flatMap((z, index) => {
      const name = `RoutePole${label}${index}`;
      const x = side * (3.78 + (index % 3) * 0.06);
      const height = 3.68 + (index % 4) * 0.12;
      const crossY = height - 0.38;
      return [
        Move(name, [x, height / 2, z], 7.20), Move(`${name}Crossbar`, [x, crossY, z], 7.20),
        ...[-0.42, 0, 0.42].map((offset, wire) => Move(`${name}Insulator${wire}`, [x + offset, crossY - 0.11, z], 7.20)),
      ];
    }),
    ...CHUCHUAN_POLE_Z.filter((_, index) => index % 3 !== 1).flatMap((z, index) => TreeMoves("NearRoute", `Route${index}`, side * (4.45 + (index % 2) * 0.28), z + 8, 3.25 + (index % 3) * 0.52, 5.65)),
  ];
}

// ★ 这里原来有 ExitWindowFill()：每侧八张 2.3×4.4 的竖景片钉在 x=±3.24，
//   也就是**窗外 0.44 m**。它比土堤(4.35)、电杆(3.78)、电线(3.80)、村舍(12.4)、
//   SRTM 远山全都近，等于在每一扇窗外贴了一堵不透光的墙 —— 而它用的材质名
//   「CarriageLandscape」根本没在材质库里登记（Script_TexBake 的 RECIPES 与
//   Script_Main 的 LoadExternalSet 都没有），Get() 抛错后引擎静默退回
//   MeshStandardMaterial({color: 0x8a8274})：一块无贴图的米白板子。
//   「窗外一片纯白、整套移动景观一件都看不见」就是这十六块板子干的，删掉。
//   下车后回头看车厢侧窗，看见的是对侧窗外的真景（土堤、电杆、田野），不是虚空。

const CHUCHUAN_PEOPLE = {
  youngDispatch: { name: "年轻传令兵", short: "年轻传令兵", real: false, note: "车厢内可见 NPC；补鞋并承担三句对白" },
  rifleman: { name: "擦枪士兵", short: "擦枪士兵", real: false, note: "车厢内可见 NPC；检查发涩枪栓" },
  oldWound: { name: "旧伤士兵", short: "旧伤士兵", real: false, note: "车厢内可见 NPC；腿缠旧绷带，靠墙休息" },
  machineGunner: { name: "机枪手", short: "机枪手", real: false, note: "车厢内可见 NPC；机枪放在脚边" },
  squadLeader: { name: "班长", short: "班长", real: false, note: "车厢内可见 NPC；检查弹药并完成动员问答" },
  squad: { name: "众人", short: "众人", real: false, note: "满载 64 人车厢的先后应答与唯一一次齐声" },
  stretcherBearerA: { name: "担架兵甲", short: "担架兵", real: false, note: "小站窗外固定轨道 NPC" },
  stretcherBearerB: { name: "担架兵乙", short: "担架兵", real: false, note: "小站窗外固定轨道 NPC" },
  lightWounded: { name: "轻伤员", short: "轻伤员", real: false, note: "小站窗外可走轻伤员" },
  externalOfficer: { name: "车外军官", short: "车外军官", real: false, note: "门外喊话 NPC" },
};

export const CS_Chuchuan = {
  id: "CS_Chuchuan",
  title: "出川",
  seconds: CHUCHUAN_END,
  trigger: "beforeLevel:L0_Jiehe",
  standalone: true,
  setOrigin: [2400, 0, 2400],
  cameraMode: "headLook",
  headLook: { yaw: [-2.09, 2.09], pitch: [-1.32, 1.15], sensitivityScale: 0.8 },
  // 玩家是通信排里没有特殊身份的一名普通士兵：坐在右侧长凳，鼠标可完整低头抬头，
  // 地点卡内随大家起身，最后以第一人称走正式侧门、踏板和月台。
  // 天空换成本场专属的 chuchuanDay（Script_Sky 里新增的一档，正片七关一律不用）：
  // smokyDay 的 horizon 2.40 / envIntensity 1.05 在这一场的实测结果是
  // 「窗户纯白过曝、车厢内接近纯黑」——天地比不是太小是太大。新档把天压下来、
  // 把环境光与 SH／ambient 抬上去、把雾砍掉一半，车厢内读得出军装与木纹，
  // 窗外读得出田野与掠过的电杆。
  sky: "chuchuanDay",
  ambience: "trainInterior",
  stopMusic: true,
  music: null,
  fadeIn: 0.35,
  cameraFar: 2800,
  suppress: { movement: true, weapon: true, crosshair: true, combatHud: true },
  objective: "坐在长凳上转头观察车厢，停车后随队下车。",
  handoff: { task: "跟随通信排。", once: true },
  why: "1937 年川军徒步出川抗战，1938 年 3 月第 122 师抵达滕县；玩家作为通信排普通一兵，从自己的座位看见满载军运车里的疲惫、损耗与习惯性准备，并随队从侧门登上月台。",
  // 整段都持续移动，而不是只在小站那十八秒挪一下背景。近景快、中景慢、远景最慢，
  // 玩家即使不看站台，也会从窗框里读出列车正在前进。
  // 小站也走同一条 ambientMotion（速度 1.65 m/s、stopAt 56 s、终点正好是侧门外），
  // 不再是「镜 4 用 propMoves 推到 +13.2、镜 5 再 hold 回 +5.7」那种切镜倒跳 7.5 m 的写法。
  ambientMotion: [
    ...[[-1, "Left"], [1, "Right"]].flatMap(([side, label]) => WindowLandscapeMotion(side, label)),
    ...StationMotion(),
    ...StretcherMotion(),
  ],

  props: [
    // 1930 年代厢式客／军运车：窄车体、木板内衬、铆接钢骨架和靠站台侧滑门；不再是
    // 宽得像现代地铁的空大厅。中央净过道约 2.4 m，长凳只占靠窗一带。
    { kind: "box", size: [5.6, 0.18, 18], pos: [0, 0, 0], mat: "CarriageFloorSteel", roughness: 0.9, metalness: 0.42, name: "CarriageFloor" },
    { kind: "box", size: [5.6, 0.18, 18], pos: [0, 3.92, 0], mat: "CarriageCeilingSteel", color: 0x8a8377, roughness: 0.91, metalness: 0.34, name: "CarriageCeiling", inside: true },
    // 军运车不是整面玻璃幕墙：下半木板 + 上半钢板，中间留一条窄窗带。
    // 窗带高度是本场最要紧的四个数（见文件头 CHUCHUAN_WINDOW_LOW/HIGH）：
    // 0.90—2.55，坐姿眼高 1.36 比窗台高 0.46 m，人是**往下看**出去的，
    // 土堤、电杆、田野才进得了画；旧版 1.28—2.82 让视线贴着窗台走，只看得见天。
    { kind: "box", size: [0.16, CHUCHUAN_WINDOW_LOW, 17.8], pos: [-2.8, CHUCHUAN_WINDOW_LOW / 2, 0], mat: "CarriageBenchWood", roughness: 0.96, name: "WallLeftWoodLow", inside: true },
    { kind: "box", size: [0.16, CHUCHUAN_WINDOW_LOW, 13.35], pos: [2.8, CHUCHUAN_WINDOW_LOW / 2, -2.23], mat: "CarriageBenchWood", roughness: 0.96, name: "WallRightWoodLowRear", inside: true },
    { kind: "box", size: [0.16, CHUCHUAN_WINDOW_LOW, 1.90], pos: [2.8, CHUCHUAN_WINDOW_LOW / 2, 7.95], mat: "CarriageBenchWood", roughness: 0.96, name: "WallRightWoodLowFront", inside: true },
    { kind: "box", size: [0.16, 3.92 - CHUCHUAN_WINDOW_HIGH, 17.8], pos: [-2.8, (3.92 + CHUCHUAN_WINDOW_HIGH) / 2, 0], mat: "Adobe", color: 0x8d8779, roughness: 0.95, name: "WallLeftWindowHigh", inside: true },
    { kind: "box", size: [0.16, 3.92 - CHUCHUAN_WINDOW_HIGH, 13.35], pos: [2.8, (3.92 + CHUCHUAN_WINDOW_HIGH) / 2, -2.23], mat: "Adobe", color: 0x8d8779, roughness: 0.95, name: "WallRightWindowHighRear", inside: true },
    { kind: "box", size: [0.16, 3.92 - CHUCHUAN_WINDOW_HIGH, 1.90], pos: [2.8, (3.92 + CHUCHUAN_WINDOW_HIGH) / 2, 7.95], mat: "Adobe", color: 0x8d8779, roughness: 0.95, name: "WallRightWindowHighFront", inside: true },
    { kind: "box", size: [5.6, 3.92, 0.18], pos: [0, 1.96, -8.9], mat: "CarriageBenchWood", color: 0x9c8f76, roughness: 0.95, name: "RearWall", inside: true },
    { kind: "box", size: [5.6, 3.92, 0.18], pos: [0, 1.96, 8.9], mat: "CarriageBenchWood", color: 0x9c8f76, roughness: 0.95, name: "FrontWall", inside: true },
    // ── 车厢内的光 ─────────────────────────────────────────────────────────
    // 白天车厢的主光来自窗，不来自顶灯；但引擎没有窗口光传输（IBL 照不进
    // inside 盒子，平行光被顶棚挡住），所以两件事都得手动摆：
    //   · 顶灯三盏：原来 intensity 1.8 / distance 6 / decay 1.65 —— 1.5 m 外
    //     只剩 sRGB 40 上下，等于没开。抬到 7.5 / 11 / 1.15。
    //   · 六盏「窗口天光」冷色补光挂在窗带内侧（x=±2.18、y=2.05），模拟从窗洞
    //     漫进来的天光：它们才是车厢里读得出军装色与木纹的原因。
    { kind: "cyl", size: [0.14, 0.20], pos: [0, 3.48, -4.8], mat: "Steel", color: 0xc49d63, emissive: 0x4a2c12, light: { color: 0xffc985, intensity: 9.5, distance: 12.0, decay: 1.12, offsetY: -0.24 }, name: "CarriageLampRear" },
    { kind: "cyl", size: [0.14, 0.20], pos: [0, 3.48, 0.6], mat: "Steel", color: 0xc49d63, emissive: 0x4a2c12, light: { color: 0xffc985, intensity: 9.5, distance: 12.0, decay: 1.12, offsetY: -0.24 }, name: "CarriageLampMid" },
    { kind: "cyl", size: [0.14, 0.20], pos: [0, 3.48, 5.8], mat: "Steel", color: 0xc49d63, emissive: 0x4a2c12, light: { color: 0xffc985, intensity: 9.5, distance: 12.0, decay: 1.12, offsetY: -0.24 }, name: "CarriageLampFront" },
    ...[[-1, -6.0], [-1, -0.6], [-1, 4.8], [1, -6.0], [1, -0.6], [1, 3.4]].map(([side, z], index) => ({
      // 行李架托铁：本体贴在窗头**以上**的钢板上（挂在窗洞里会在亮窗上留一颗黑点，
      // 上一轮出图 t=20 左窗中间那块小黑方就是它），真正的作用是挂一盏窗口天光。
      kind: "box", size: [0.07, 0.09, 0.16], pos: [side * 2.30, CHUCHUAN_WINDOW_HIGH + 0.18, z],
      mat: "Steel", color: 0x4a4740,
      light: { color: 0xb4c9e0, intensity: 11.0, distance: 9.5, decay: 1.10, offsetY: -0.55 },
      name: `WindowDaylight${side < 0 ? "L" : "R"}${index}`,
    })),
    // ── 端墙上的东西 ───────────────────────────────────────────────────────
    // 镜 6 整整 22 秒对着车厢末端，端墙不能是一块什么都没有的板子。
    // 顺带记一笔：这两面墙原来用 CarriageWallSteel，实测渲成**纯黑**（射线取证
    // material.metalness = 1）—— Script_Cutscene._MakeProp 只把 repeat/color/
    // roughness/side 转给 library.Get()，metalness 没转，而 Get 的默认是 1，
    // 再乘 CarriageWallSteel 的 ORM 金属通道。金属没有漫反射，车厢里又没有可反射的
    // 环境（GI 在封闭盒子里天空可见度≈0），于是端墙、窗上钢板一律是黑的。
    // 贴图与引擎都不归本文件，只能换配方：端墙走木衬板、窗上带走灰泥板面。
    ...[-1, 1].map((end) => ({
      kind: "box", size: [1.06, 2.10, 0.09], pos: [0.55 * end, 1.14, end * 8.80],
      mat: "WoodStock", color: 0xac8b5e, repeat: 1, name: `EndDoor${end < 0 ? "Rear" : "Front"}`,
    })),
    ...[-1, 1].map((end) => ({
      kind: "box", size: [1.26, 0.10, 0.07], pos: [0.55 * end, 2.24, end * 8.78],
      mat: "Adobe", color: 0x9e978b, name: `EndDoorLintel${end < 0 ? "Rear" : "Front"}`,
    })),
    ...[-1, 1].map((end) => ({
      kind: "box", size: [0.86, 0.34, 0.06], pos: [-1.30 * end, 2.36, end * 8.78],
      mat: "Adobe", color: 0x9a948a, name: `EndVent${end < 0 ? "Rear" : "Front"}`,
    })),
    ...[-1, 1].map((end) => ({
      kind: "box", size: [0.58, 0.44, 0.05], pos: [-1.30 * end, 1.62, end * 8.78],
      mat: "ClothNra", color: 0xb9b19a, name: `EndNotice${end < 0 ? "Rear" : "Front"}`,
    })),
    // 一眼看出「这是车厢」的重复门框与顶梁；不靠文字或镜头解释空间。
    ...[-6.2, -3.4, -0.6, 2.2, 5.0, 7.3].map((z, index) => ({ kind: "box", size: [5.35, 0.16, 0.16], pos: [0, 3.68, z], mat: "CarriageBenchWood", color: 0x8f887a, name: `RoofRib${index}` })),
    { kind: "box", size: [0.22, 0.13, 17.6], pos: [-2.70, CHUCHUAN_WINDOW_LOW - 0.03, 0], mat: "Steel", color: 0x5b574f, name: "WindowSillLeft" },
    { kind: "box", size: [0.22, 0.13, 13.25], pos: [2.70, CHUCHUAN_WINDOW_LOW - 0.03, -2.28], mat: "Steel", color: 0x5b574f, name: "WindowSillRightRear" },
    { kind: "box", size: [0.22, 0.13, 1.75], pos: [2.70, CHUCHUAN_WINDOW_LOW - 0.03, 8.02], mat: "Steel", color: 0x5b574f, name: "WindowSillRightFront" },
    // 窗帘重做。旧版每格一块 1.34×0.98 的深色板（ClothNra 0x3e3c35 / 木色 0x463a2d），
    // 1.45 m 的窗格被挡掉 68%，出图里读成一排黑板子，小站段整幅画几乎全黑。
    // 现在是：油布帘**卷到窗头**只剩一卷（0.34 高，占窗高 20%），木百叶**收到窗格边**
    // 只剩一叶（0.30 宽，占窗格 21%），颜色也从近黑抬到能读出布纹/木纹的中调。
    // 右侧 z∈[0.7, 3.6] 一段（小站段镜 4 的视轴）**一件都不挂**，站台那边留连续净视野。
    ...[-7.2, -5.75, -4.3, -2.85, -1.4, 0.05, 1.5, 2.95, 4.4, 5.85, 7.2].flatMap((z, index) => {
      const even = index % 2 === 0;
      const Dress = (side, tag) => {
        const x = side * 2.69;
        return even
          ? { kind: "cyl", size: [0.10, 0.94], pos: [x, CHUCHUAN_WINDOW_HIGH - 0.16, z + side * 0.20], rx: Math.PI / 2, mat: "ClothNra", color: 0xa2977a, roughness: 1, name: `WindowShade${tag}${index}` }
          : { kind: "box", size: [0.06, CHUCHUAN_WINDOW_SPAN - 0.10, 0.30], pos: [x, CHUCHUAN_WINDOW_MID, z - side * 0.56], mat: "CarriageBenchWood", color: 0x7a6244, name: `WindowShutter${tag}${index}` };
      };
      const left = [
        { kind: "box", size: [0.12, CHUCHUAN_WINDOW_SPAN + 0.10, 0.12], pos: [-2.66, CHUCHUAN_WINDOW_MID, z], mat: "Steel", color: 0x53514c, name: `WindowMullionLeft${index}` },
        Dress(-1, "Left"),
      ];
      // 正式侧门占掉右侧三格；这些窗框、卷帘和百叶不能再浮在门洞中间。
      if (z >= 4.35 && z <= 7.25) return left;
      const right = [
        { kind: "box", size: [0.12, CHUCHUAN_WINDOW_SPAN + 0.10, 0.12], pos: [2.66, CHUCHUAN_WINDOW_MID, z], mat: "Steel", color: 0x53514c, name: `WindowMullionRight${index}` },
      ];
      // 小站段（镜 4 看 (3.8,1.52,2.6)）正对的两格：只留竖框，帘和百叶都不挂。
      if (!(z > 0.6 && z < 3.6)) right.push(Dress(1, "Right"));
      return [...left, ...right];
    }),
    { kind: "box", size: [0.18, 0.12, 13.25], pos: [2.70, CHUCHUAN_WINDOW_HIGH + 0.06, -2.28], mat: "Steel", color: 0x64615a, name: "WindowFrameRightTopRear" },
    { kind: "box", size: [0.18, 0.12, 1.75], pos: [2.70, CHUCHUAN_WINDOW_HIGH + 0.06, 8.02], mat: "Steel", color: 0x64615a, name: "WindowFrameRightTopFront" },
    { kind: "box", size: [0.18, 0.12, 17.6], pos: [-2.70, CHUCHUAN_WINDOW_HIGH + 0.06, 0], mat: "Steel", color: 0x64615a, name: "WindowFrameLeftTop" },
    // 漏雨和煤烟留下的不规则补漆/锈蚀；每一块都很小，避免把内壁刷成舞台布景，
    // 但跨过走道时能明确看出这节车并不新，也并不干净。
    ...[-6.65, -4.75, -2.25, 0.65, 3.15, 5.75].flatMap((z, index) => [
      { kind: "box", size: [0.035, 0.34 + (index % 2) * 0.16, 0.48 + (index % 3) * 0.12], pos: [-2.69, 3.21, z], mat: "Steel", color: index % 2 ? 0x3b2c24 : 0x4a382a, roughness: 1, name: `RustPatchLeft${index}` },
      ...(z > 4.2 ? [] : [{ kind: "box", size: [0.035, 0.28 + (index % 3) * 0.12, 0.42 + (index % 2) * 0.16], pos: [2.69, 3.28, z + 0.42], mat: "Steel", color: index % 2 ? 0x3b2c24 : 0x4a382a, roughness: 1, name: `RustPatchRight${index}` }]),
    ]),
    // 车厢两侧行李架：薄木条与定距钢托，不用一整面厚板遮窗。
    { kind: "box", size: [0.42, 0.07, 15.6], pos: [-2.35, 2.83, 0], mat: "CarriageBenchWood", roughness: 0.96, name: "LuggageRackLeft" },
    { kind: "box", size: [0.42, 0.07, 12.0], pos: [2.35, 2.83, -2.0], mat: "CarriageBenchWood", roughness: 0.96, name: "LuggageRackRightRear" },
    { kind: "box", size: [0.42, 0.07, 1.4], pos: [2.35, 2.83, 8.0], mat: "CarriageBenchWood", roughness: 0.96, name: "LuggageRackRightFront" },
    ...[-6, -2, 2, 6].flatMap((z, index) => [
      { kind: "box", size: [0.52, 0.07, 0.09], pos: [-2.48, 2.72, z], rz: -0.45, mat: "Steel", color: 0x343331, name: `LuggageBracketLeft${index}` },
      ...(z === 6 ? [] : [{ kind: "box", size: [0.52, 0.07, 0.09], pos: [2.48, 2.72, z], rz: 0.45, mat: "Steel", color: 0x343331, name: `LuggageBracketRight${index}` }]),
    ]),
    // 真正有座板、靠背和腿架的分段长椅；座下透空，轮廓不再像两排黑柜台。
    ...CarriageBench(-1, "Left"),
    ...CarriageBench(1, "Right"),
    ...CarriagePersonalEffects(),
    // 两块靠端墙的地铺给无座时席地休息，薄垫不侵占中央通道。
    { kind: "box", size: [1.25, 0.055, 1.65], pos: [-1.15, 0.15, -7.55], mat: "ClothNra", color: 0x5f594d, name: "FloorMatLeft" },
    { kind: "box", size: [1.25, 0.055, 1.65], pos: [1.15, 0.15, -7.55], mat: "ClothNra", color: 0x5b5549, name: "FloorMatRight" },
    { kind: "cyl", size: [0.16, 0.08], pos: [2.18, 0.66, 0.25], mat: "ClothNra", color: 0x8c8270, name: "OldMilitaryCap" },
    // 这两件旧道具曾是黑色大方块，还摆在过道侧；收小并放回座椅内侧，
    // 用布料 PBR 的可读色保留“有人刚放下背包/药包”的生活信息。
    { kind: "box", size: [0.42, 0.28, 0.58], pos: [-2.20, 0.72, 0.35], mat: "ClothNra", color: 0x6d685a, name: "OldPack" },
    { kind: "box", size: [0.34, 0.25, 0.45], pos: [2.20, 0.68, -0.65], mat: "ClothNra", color: 0x766f5f, name: "AmmoBag" },
    // 布设不再只剩两个背包：水壶、饭盒、绑腿、线盘、油布包、伤员药盒与工具袋
    // 依附在座椅/行李架边，不侵占中央过道，也让每段车厢有被长期使用过的痕迹。
    { kind: "cyl", size: [0.10, 0.32], pos: [-2.28, 1.05, -6.55], mat: "Steel", color: 0x3f4640, name: "CanteenRear" },
    { kind: "box", size: [0.36, 0.16, 0.48], pos: [2.18, 1.05, -5.55], mat: "Steel", color: 0x555047, name: "MessTinRear" },
    { kind: "cyl", size: [0.18, 0.58], pos: [-2.18, 2.96, -4.15], mat: "ClothNra", color: 0x5b574c, name: "BlanketRollLeft" },
    { kind: "cyl", size: [0.18, 0.54], pos: [2.18, 2.96, -3.15], mat: "ClothNra", color: 0x686052, name: "BlanketRollRight" },
    { kind: "box", size: [0.58, 0.22, 0.36], pos: [-2.18, 2.96, -0.85], mat: "ClothNra", color: 0x514a3e, name: "OilclothBundle" },
    { kind: "box", size: [0.42, 0.28, 0.30], pos: [2.18, 2.96, 1.15], mat: "WoodStock", color: 0x72543b, name: "SignalToolBox" },
    { kind: "cyl", size: [0.20, 0.42], pos: [-2.18, 2.96, 3.65], mat: "WoodStock", color: 0x583b24, name: "SpareLineSpool" },
    { kind: "box", size: [0.36, 0.14, 0.48], pos: [2.18, 2.96, 5.35], mat: "ClothNra", color: 0x6d6554, name: "BandageRoll" },
    { kind: "box", size: [0.18, 0.08, 0.70], pos: [-2.15, 0.72, 6.35], mat: "WoodStock", color: 0x6a4e35, name: "ShoeRepairBoard" },
    { kind: "box", size: [0.30, 0.22, 0.42], pos: [2.16, 0.72, 6.55], mat: "ClothNra", color: 0x514d43, name: "MedicPouch" },
    { kind: "cyl", size: [0.28, 0.22], pos: [-1.35, 0.72, -5.2], mat: "WoodStock", color: 0x59402b, name: "PlayerLineSpool" },
    { kind: "cyl", size: [0.09, 0.7], pos: [-1.35, 0.85, -5.2], mat: "Steel", color: 0x827668, name: "PlayerLineSpoolAxle" },
    { kind: "box", size: [0.24, 0.06, 0.54], pos: [-1.55, 1.15, -2.55], mat: "WoodStock", color: 0x8d6947, name: "ShoeTool" },
    { kind: "box", size: [0.14, 0.12, 0.56], pos: [2.22, 0.65, 2.75], mat: "ClothNra", color: 0x706858, name: "MachineGunCase" },
    ...WindowLandscape(-1, "Left"),
    ...WindowLandscape(1, "Right"),
    // 1930 年代津浦线小站：石基高月台、木雨棚、候车屋、站牌、长凳、货箱、水鹤。
    // 自建盒子，不再挂 Model_ChuchuanStationPlatform.glb（那个 glb 的「上」是 −Z、
    // 长轴是 +Y，直接进 three 会立成一块 36 m 高的板 —— 见 CHUCHUAN_STATION_PARTS 注）。
    ...StationProps(),
    // 一副担架随两名担架兵穿过月台；它和担架兵用同一组里程数，不会掉队。
    ...StretcherProps(),
    // 车门在靠站台的右侧，不在车厢端墙。门板、木条、门闩共用同一条 +Z 滑轨。
    // 门板、门框、门槛、踏板一律不用 mat:"Steel"：库里的 Steel 金属度接近 1，
    // 而 _MakeProp 不转 metalness，金属没有漫反射 —— 从月台那一侧（背光面）看，
    // 整扇门是一块纯黑（t=100 yaw−2.09 取证）。改成灰泥板面，读作刷过漆的铁门。
    { kind: "box", size: [0.12, 2.6, 2.2], pos: [2.75, 1.65, CHUCHUAN_SIDE_DOOR_Z], color: 0x6f6a60, name: "CarriageDoor" },
    // 滑门的横向旧木条、门闩和补片压在钢门上；远看先读到“装过人和物的军运车”，
    // 近看能看出门曾被拆修，而不是一块没有信息的纯黑矩形。
    ...[-0.86, -0.43, 0, 0.43, 0.86].map((y, index) => ({ kind: "box", size: [0.05, 0.12, 1.98], pos: [2.67, 1.65 + y, CHUCHUAN_SIDE_DOOR_Z], mat: "CarriageBenchWood", color: index % 2 ? 0x7a6448 : 0x87714f, name: `DoorPlank${index}` })),
    { kind: "box", size: [0.06, 1.96, 0.14], pos: [2.66, 1.65, CHUCHUAN_SIDE_DOOR_Z - 0.78], mat: "Steel", color: 0x504b43, name: "DoorBraceLeft" },
    { kind: "box", size: [0.06, 1.96, 0.14], pos: [2.66, 1.65, CHUCHUAN_SIDE_DOOR_Z + 0.78], mat: "Steel", color: 0x504b43, name: "DoorBraceRight" },
    { kind: "box", size: [0.12, 0.10, 0.72], pos: [2.60, 1.62, CHUCHUAN_SIDE_DOOR_Z + 0.15], mat: "Steel", color: 0x413d37, name: "DoorLatch" },
    { kind: "box", size: [0.22, 3.12, 0.16], pos: [2.70, 1.56, 4.48], color: 0x615d55, name: "SideDoorFrameRear" },
    { kind: "box", size: [0.22, 3.12, 0.16], pos: [2.70, 1.56, 6.92], color: 0x615d55, name: "SideDoorFrameFront" },
    { kind: "box", size: [0.22, 0.18, 2.60], pos: [2.70, 3.06, CHUCHUAN_SIDE_DOOR_Z], color: 0x615d55, name: "SideDoorFrameTop" },
    { kind: "box", size: [0.40, 0.12, 2.20], pos: [2.86, 0.09, CHUCHUAN_SIDE_DOOR_Z], color: 0x615d55, name: "SideDoorThreshold" },
    // 两级固定踏板把车地板接到石基月台，镜头和演员都真正踩完这段高差。
    { kind: "box", size: [1.25, 0.12, 1.75], pos: [3.48, 0.18, CHUCHUAN_SIDE_DOOR_Z], color: 0x74705f, name: "SideDoorStepInner" },
    { kind: "box", size: [0.72, 0.12, 1.75], pos: [4.30, 0.42, CHUCHUAN_SIDE_DOOR_Z], color: 0x74705f, name: "SideDoorStepOuter" },
    // 车与月台之间的道砟：只铺车下到月台石基那一条，宽 7 m、长 64 m。
    // 旧版是 32×32 一大块，边缘正好落在下车视野里；月台以外的地面交给
    // WindowLandscape 的 SRTM 实体网格（它从 x=4 一直铺到 2500 m）。
    { kind: "box", size: [7.0, 0.12, 64], pos: [3.6, -0.07, 6], mat: "GroundRubble", color: 0x574f45, name: "OutsideBallast" },
    // 门外远景景片：换成真的有内容的一张 —— Texture_CarriageShandongLandscapePlate.png
    // （鲁南冬末的秃杨、电杆、石头房、远丘，本来就为这一场画的）。原来写的
    // mat:"CarriageLandscape" 在材质库里根本不存在，Get() 抛错后静默退回
    // 0x8a8274 的无贴图米白，出图里门外就是一片白虚空。走 spec.texture 通道，
    // 不经材质库，所以不会再静默退化。
    // 三面围合：正面 26 m 外，两侧把 head-look 的余角封死；景片底边压到地平线以下。
    // castShadow:false 是硬要求：24 m 高的景片在 56° 太阳下会往 +x+z 投出十六米长的
    // 影子，侧景片正好把正面景片的一段刷成一块无光的深蓝板（t=48 那块「深蓝虚空」
    // 射线取证就是它）。景片是画的，不该投影也不该收影。
    { kind: "backdrop", size: [46, 24.0], pos: [34, 10.4, CHUCHUAN_SIDE_DOOR_Z], ry: -Math.PI / 2, texture: "./Texture/Texture_CarriageShandongLandscapePlate.png", doubleSided: true, roughness: 1, castShadow: false, receiveShadow: false, name: "DoorOutsideBackdrop" },
    // 两侧景片删掉了：doubleSided 的贴片，可见面的法线永远朝着相机，所以只有
    // 「太阳在相机背后」时才受光。正面景片（法线 −x、太阳也在 −x）成立，
    // 两块侧景片（法线 ±z、太阳在 −z）必然背光 —— 出图里就是两块深蓝死板
    // (t=20 yaw±2.09 各撞到一块)。侧向的封闭交给 FarTerrain 那张 SRTM 实体网格
    //（x 4—2500 m、z ±910 m）与天空穹，它们是真几何，从哪个角度看都成立。
    // 站在月台上抬头能看见的电报线终点：一根落在月台北端的木杆，
    // 让窗外那三根电线有个收头，不再在半空断掉。
    { kind: "box", size: [0.16, 4.60, 0.16], pos: [4.05, 2.30, 26.0], mat: "WoodBeam", color: 0x3b3026, noFog: true, name: "PlatformPole" },
    { kind: "box", size: [1.24, 0.11, 0.11], pos: [4.05, 4.22, 26.0], mat: "WoodBeam", color: 0x3b3026, noFog: true, name: "PlatformPoleCrossbar" },
    ...[-0.42, 0, 0.42].map((offset, wire) => ({
      kind: "cyl", size: [0.06, 0.13], pos: [4.05 + offset, 4.11, 26.0], mat: "Steel", color: 0x9a947f, noFog: true, name: `PlatformPoleInsulator${wire}` })),
  ],

  cast: [
    // 玩家本人也是同制服、同身高体系里的普通通信兵；仅隐藏头部避免第一人称穿模，
    // 低头仍能看见胸前装具、双臂、裤腿和脚。
    { id: "playerSoldier", kind: "nra", weapon: null, seed: "chuchuanPlayer", firstPerson: true, uniformHex: 0x66717d, trouserHex: 0x4c555d, accessoryHex: 0x77705b, track: PlayerSoldierTrack() },
    // 五名重点士兵承接台词；其余乘客不是背景板，而是满载军运车的连续人群层。
    // 四人的座位语义不动（谁在哪、对坐关系照旧）；只把下车顺序排到玩家后面 ——
    // queueOrder 12—15 意味着他们 105 s 内还在过道里排队，不会跟相机抢门。
    { id: "youngDispatch", kind: "nra", weapon: null, seed: "chuchuanYoung", uniformHex: 0x5C6674, attachments: [{ name: "ShoeTool", mount: "handL", offset: [0, -0.16, -0.04], rotation: [0.2, 0, 0] }], track: CarSeatTrack([-1.95, CHUCHUAN_CAR_G, -2.55], { repairShoe: 1 }, 0.0, 13, -0.7, -Math.PI / 2) },
    { id: "rifleman", kind: "nra", weapon: "HanYang", seed: "chuchuanRifle", uniformHex: 0x828A93, track: CarSeatTrack([1.95, CHUCHUAN_CAR_G, -2.55], { cleanRifle: 1 }, 1.0, 14, 0.5, Math.PI / 2) },
    { id: "oldWound", kind: "nra", weapon: null, seed: "chuchuanOld", uniformHex: 0x8A8778, track: CarSeatTrack([-1.95, CHUCHUAN_CAR_G, 2.75], { sleep: 0.8 }, 1.8, 11, -0.5, -Math.PI / 2) },
    { id: "machineGunner", kind: "nra", weapon: "Zb26", seed: "chuchuanMachine", uniformHex: 0x6E7684, track: CarSeatTrack([1.95, CHUCHUAN_CAR_G, 2.50], {}, 2.6, 12, 0.7, Math.PI / 2) },
    // 班长固定在车厢末端站着、面对全车，视线一转就能找到他；不再被塞回右侧座椅。
    { id: "squadLeader", kind: "nra", weapon: "HanYang", seed: "chuchuanLeader", uniformHex: 0x4f5a61, track: CarRearLeaderTrack([0, CHUCHUAN_CAR_G, 5.95], 1.35) },
    ...CreateCarriageCrowdCast(),
    { id: "stretcherBearerA", kind: "nra", weapon: null, seed: "chuchuanBearerA", track: StationRailTrack(6.1, CHUCHUAN_STRETCHER_OFFSET, CHUCHUAN_STRETCHER_WALK) },
    { id: "stretcherBearerB", kind: "nra", weapon: null, seed: "chuchuanBearerB", track: StationRailTrack(7.6, CHUCHUAN_STRETCHER_OFFSET, CHUCHUAN_STRETCHER_WALK) },
    { id: "lightWounded", kind: "nra", weapon: null, seed: "chuchuanWounded", track: StationRailTrack(9.15, 6.5, 2.2, { moveSpeed: 0.11, crouch: 0.25 }) },
    // 车外军官：先站在门外正对车门喊话（镜 8 从车里往外看就是他），
    // 99—100.6 s 让开到月台前方并转身回望，镜 11 玩家停稳时他和班长一左一右
    // 站在画面里 —— 旧版把他钉在 (5.9, 8.0) 面朝 +x（背对下车的人），
    // 而且正好卡在玩家的落脚点旁边。
    { id: "externalOfficer", kind: "nra", weapon: null, seed: "chuchuanOfficer", track: [
      { t: 0, pos: [5.35, CHUCHUAN_PLATFORM_Y, 6.90], ry: Math.PI / 2, state: { hidden: true } },
      { t: CHUCHUAN_DOOR_AT - 0.4, pos: [5.35, CHUCHUAN_PLATFORM_Y, 6.90], ry: Math.PI / 2, state: { hidden: false, moveSpeed: 0 } },
      { t: 98.0, pos: [5.35, CHUCHUAN_PLATFORM_Y, 6.90], ry: -3.025, state: TrackMoveState([5.35, 0, 6.90], [5.90, 0, 11.60], 3.2, { prepare: 0.3 }) },
      { t: 101.2, pos: [5.90, CHUCHUAN_PLATFORM_Y, 11.60], ry: 0.85, state: { prepare: 0.3, moveSpeed: 0 } },
      { t: CHUCHUAN_END, pos: [5.90, CHUCHUAN_PLATFORM_Y, 11.60], ry: 0.85, state: { prepare: 0.3, moveSpeed: 0 } },
    ] },
  ],

  people: CHUCHUAN_PEOPLE,

  shots: [
    // 0:00—0:08：观察者口吻的两张历史字卡；只留轮轨声，不进音乐。
    { n: 1, seconds: 4, focalMm: 50, cameraMode: "headLook", black: true, titleCard: true, timingLocked: true,
      camera: { from: [0, 1.6, -6], look: [0, 1.6, -7] },
      subs: [{ at: 0.1, seconds: 3.9, title: true, text: "1937年，全面抗战爆发。川军徒步出川，赴几千里外的前线。" }] },
    { n: 2, seconds: 4, focalMm: 50, cameraMode: "headLook", black: true, titleCard: true, timingLocked: true,
      camera: { from: [0, 1.6, -6], look: [0, 1.6, -7] },
      subs: [{ at: 0.1, seconds: 3.9, title: true, text: "1938年3月，第122师抵达滕县。" }] },

    // 0:08—0:40：玩家坐在右侧长凳；低头能看见自己的身体与脚边通信装备。
    { n: 3, seconds: 32, focalMm: 35, cameraMode: "headLook", fadeIn: 0.8, timingLocked: true,
      camera: { from: [1.95, 1.36, 3.42], look: [-0.4, 1.32, 3.42] },
      sfx: [{ at: 0.5, name: "carriageRattle", volume: 0.28 }, { at: 22.3, name: "bolt", volume: 0.42 }],
      lines: [
        { at: 0.6, seconds: 2.2, who: "youngDispatch", voiceCue: "prologue_young_dispatch_01", text: "我们出川好久了哦。" },
        { at: 3.2, seconds: 3.3, who: "oldWound", voiceCue: "prologue_old_wound_01", text: "路莫问，跟到走就是。" },
        { at: 7.0, seconds: 3.5, who: "youngDispatch", voiceCue: "prologue_young_dispatch_02", text: "我都忘了屋头腊肉是啥味道了。" },
        { at: 11.2, seconds: 2.4, who: "machineGunner", voiceCue: "prologue_machine_gunner_01", text: "你娃儿还惦记腊肉。" },
        { at: 14.4, seconds: 2.5, who: "youngDispatch", voiceCue: "prologue_young_dispatch_03", text: "不惦记吃的惦记啥子嘛。" },
        { at: 17.4, seconds: 4.2, who: "machineGunner", voiceCue: "prologue_machine_gunner_02", text: "到了前头，有热水喝你就谢天谢地。" },
        { at: 22.4, seconds: 1.5, who: "rifleman", voiceCue: "prologue_rifleman_01", text: "又卡。" },
        { at: 24.9, seconds: 4.0, who: "oldWound", voiceCue: "prologue_old_wound_02", text: "你少骂两句，它兴许听话点。" },
      ] },

    // 0:40—0:56：列车缓缓进入小站。月台从后窗掠进来；担架兵和轻伤员各自
    // 走过窗格，镜头过后仍在画外继续走，不以切镜当作消失。
    // look 从 (3.8,1.52,2.6) 改成 (3.8,1.24,4.02)：旧视轴正对 z=2.95 那根窗竖框
    //（0.85 m 外的一根 0.12 m 立柱 = 画面正中 8° 宽的一条黑带），而且抬着看，
    // 只看得见天。新视轴穿 z≈2.95—4.48 那一格窗的中心、并往下压 —— 月台面、
    // 担架兵与轻伤员都落在画里。
    { n: 4, seconds: 16, focalMm: 35, cameraMode: "headLook", camera: { from: [1.95, 1.36, 3.42], look: [3.8, 1.26, 3.38] },
      sfx: [{ at: 0.18, name: "trainWhistle", volume: 0.48 }, { at: 2.3, name: "trainBrake", volume: 0.62 }, { at: 4.7, name: "stretcherWood", volume: 0.42 }, { at: 7.5, name: "coughLow", volume: 0.32 }],
      // 站台与担架不再在这里用 propMoves 推：整座小站由 cut.ambientMotion 沿一条
      // 匀速里程走到侧门外并 stopAt=56 停住，切镜与它无关，结构上不会倒跳。
    },

    // 0:56—1:08：恰好两次远炮；第二声更近，五人先后停手，旧伤兵睁眼。
    { n: 5, seconds: 12, focalMm: 35, cameraMode: "headLook", timingLocked: true, camera: { from: [1.95, 1.36, 3.42], look: [-0.4, 1.28, 3.42] },
      shakeAt: [{ at: 0.6, seconds: 0.7, amount: 0.42 }, { at: 7.0, seconds: 0.95, amount: 0.82 }],
      sfx: [{ at: 0.6, name: "amb.cannonFar", volume: 0.48 }, { at: 7.0, name: "explosionFar", volume: 0.68 }],
      lines: [{ at: 2.0, seconds: 1.6, who: "oldWound", voiceCue: "prologue_old_wound_03", text: "近咯。" }] },

    // 1:08—1:30：整段只触发一个 SeedAudio 1.0 复合 cue；其余行只负责逐句字幕。
    { n: 6, seconds: 22, focalMm: 35, cameraMode: "headLook", timingLocked: true, camera: { from: [1.95, 1.36, 3.42], look: [0, 1.58, 5.95] },
      sfx: [{ at: 18.1, name: "gearRustle", volume: 0.34 }],
      lines: [
        { at: 0.2, seconds: 4.1, who: "squadLeader", voiceCue: "prologue_motivation_01", text: "这次你们去啊。出川，晓不晓得啊？" },
        // 下列时点来自十七八岁年轻士兵自然错拍定稿的真实停顿，不是把八句音频拼起来。
        { at: 4.8, seconds: 2.8, who: "squad", text: "我们晓得。打日本！" },
        { at: 8.4, seconds: 0.6, who: "squadLeader", text: "去死，怕不怕？" },
        { at: 9.7, seconds: 0.6, who: "squad", text: "不怕！" },
        { at: 10.6, seconds: 0.9, who: "squadLeader", text: "为啥子不怕？" },
        { at: 11.5, seconds: 3.6, who: "squad", text: "我们要保护我们的国家！" },
        { at: 16.5, seconds: 0.6, who: "squadLeader", text: "好样的。" },
        { at: 18.1, seconds: 3.7, who: "squadLeader", text: "都把东西带好。前头就是滕县。" },
      ] },

    // 1:30—1:33：短黑地点卡；人物在黑场内起身，不用镜头外瞬移遮演出。
    { n: 7, seconds: 3, focalMm: 50, cameraMode: "headLook", black: true, titleCard: true, timingLocked: true,
      camera: { from: [0, 1.6, -6], look: [0, 1.6, -7] },
      subs: [{ at: 0, seconds: 3, title: true, date: true, text: "山东·滕县／1938年3月" }] },

    // 1:33—1:35.5：玩家已随大家起身，侧门整组沿车壁滑开；先从座位走进过道。
    { n: 8, seconds: 2.5, focalMm: 35, cameraMode: "headLook", timingLocked: true,
      camera: { from: [1.95, 1.65, 3.42], to: [0.70, 1.65, 5.30], look: [0.3, 1.52, 5.45], lookTo: [3.4, 1.52, 5.70], ease: "easeInOut", walkBob: { amount: 0.018, frequency: 1.75, fadeIn: 0.45 } },
      sfx: [{ at: 0.1, name: "carriageDoorSlide", volume: 0.7 }],
      propMoves: [...SideDoorMoves()],
      lines: [{ at: 0.6, seconds: 4.0, who: "externalOfficer", voiceCue: "prologue_external_officer_01", text: "通信排，下车！线盘背起，搞快！" }] },

    // 1:35.5—1:38.5：沿过道走到门框，镜头不再穿端墙或从车尾离开。
    { n: 9, seconds: 3, focalMm: 35, cameraMode: "headLook", timingLocked: true,
      camera: { from: [0.70, 1.65, 5.30], to: [3.35, 1.80, 5.70], look: [3.2, 1.62, 5.70], lookTo: [5.4, 1.80, 5.70], ease: "easeInOut", walkBob: { amount: 0.020, frequency: 1.85 } },
      sfx: [{ at: 0.5, name: "stepBallast", volume: 0.38 }, { at: 2.0, name: "stepBallast", volume: 0.42 }],
      propMoves: [...SideDoorHoldOpenMoves()] },

    // 1:38.5—1:41：跨门槛和两级踏板，脚下高度真实接到石基月台。
    { n: 10, seconds: 2.5, focalMm: 35, cameraMode: "headLook", timingLocked: true,
      camera: { from: [3.35, 1.80, 5.70], to: [5.20, 2.14, 5.70], look: [5.2, 1.92, 5.70], lookTo: [6.6, 2.00, 9.50], ease: "easeInOut", walkBob: { amount: 0.024, frequency: 1.65 } },
      sfx: [{ at: 0.35, name: "stepBallast", volume: 0.48 }, { at: 1.45, name: "stepBallast", volume: 0.50 }],
      propMoves: [...SideDoorHoldOpenMoves()] },

    // 1:41—1:45：登上站台后再沿站台走几步、停稳，身后的战友仍从同一扇门排队下来。
    { n: 11, seconds: 4, focalMm: 35, cameraMode: "headLook", timingLocked: true,
      camera: { from: [5.20, 2.14, 5.70], to: [6.80, 2.14, 7.40], look: [6.7, 2.04, 9.6], lookTo: [6.8, 1.96, 12.6], ease: "easeInOut", walkBob: { amount: 0.018, frequency: 1.75, fadeOut: 1.35 } },
      sfx: [{ at: 0.6, name: "stepBallast", volume: 0.46 }, { at: 2.0, name: "stepBallast", volume: 0.42 }],
      propMoves: [...SideDoorHoldOpenMoves()] },
  ],

  skipCard: {
    title: "出川",
    lines: [
      { text: "1937年，全面抗战爆发。川军徒步出川，赴几千里外的前线。", tier: "主流" },
      { text: "1938年3月，第122师抵达滕县。", tier: "主流" },
      { text: "山东·滕县／1938年3月", tier: "主流" },
    ],
  },
};
