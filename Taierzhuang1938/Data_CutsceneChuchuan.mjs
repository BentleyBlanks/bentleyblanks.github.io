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

const CHUCHUAN_CAR_G = 0.13;
const CHUCHUAN_CAR_RY = Math.PI;
const CHUCHUAN_MOTIVATION_AT = 68.0;
const CHUCHUAN_GEAR_AT = 87.4;
const CHUCHUAN_DOOR_AT = 93.0;
const CHUCHUAN_TRAIN_STOP_AT = 56.0;
const CHUCHUAN_SEAT_LIFT = 0.13;
const CHUCHUAN_END = 105.0;
const CHUCHUAN_SIDE_DOOR_Z = 5.7;
const CHUCHUAN_PLATFORM_Y = 0.58;
// 参考滇越铁路的新闻照片：车厢座位坐满，过道则留给上下车和整理行李；只有少数人
// 靠着侧壁、车门或行李架站着。五名有台词的重点人物之外，人群仍是稳定的背景层，
// 但不把车厢排成挤满人的展示间。

function TrackMoveState(from, to, seconds, extra = {}) {
  const speed = Math.hypot(to[0] - from[0], to[2] - from[2]) / Math.max(0.001, seconds);
  return { prepare: 1, moveSpeed: speed / 4.2, travelSpeed: speed, ...extra };
}

function CarSeatTrack(pos, lifeState, stopDelay, exitAt, exitEnd, exitX, facingRy = CHUCHUAN_CAR_RY) {
  const stopAt = 56.8 + stopDelay;
  const side = Math.sign(pos[0]) || 1;
  const aisleX = side * 0.72;
  const aisleAt = exitEnd;
  const queueAt = aisleAt + Math.max(0.45, Math.abs(CHUCHUAN_SIDE_DOOR_Z - pos[2]) / 1.45);
  const thresholdAt = queueAt + 1.35;
  const platformAt = thresholdAt + 1.05;
  const outsideAt = platformAt + 1.4;
  const aislePos = [aisleX, CHUCHUAN_CAR_G, pos[2]];
  const queuePos = [aisleX, CHUCHUAN_CAR_G, CHUCHUAN_SIDE_DOOR_Z];
  const thresholdPos = [3.25, 0.18, CHUCHUAN_SIDE_DOOR_Z + exitX * 0.08];
  const platformPos = [4.65, CHUCHUAN_PLATFORM_Y, CHUCHUAN_SIDE_DOOR_Z + exitX * 0.12];
  const outsidePos = [5.85, CHUCHUAN_PLATFORM_Y, CHUCHUAN_SIDE_DOOR_Z + exitX * 0.34];
  return [
    { t: 0, pos, ry: facingRy, state: { ...lifeState, sit: 1, seatLift: CHUCHUAN_SEAT_LIFT } },
    { t: stopAt, pos, ry: facingRy, state: { ...lifeState, sit: 1, seatLift: CHUCHUAN_SEAT_LIFT } },
    // 两声炮之间陆续停手、抬头；动员问答全程仍坐着，不抢班长的站姿。
    { t: Math.min(67.7, stopAt + 0.65), pos, ry: facingRy, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.08 } },
    { t: CHUCHUAN_MOTIVATION_AT, pos, ry: facingRy, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.16 } },
    // “好样的”之后默默把随身物件收好；地点卡期间才起身。
    { t: CHUCHUAN_GEAR_AT, pos, ry: facingRy, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.55 } },
    { t: 90.8, pos, ry: facingRy, state: { prepare: 1, moveSpeed: 0 } },
    { t: CHUCHUAN_DOOR_AT, pos, ry: facingRy, state: { prepare: 1, moveSpeed: 0 } },
    { t: exitAt, pos, ry: facingRy, state: TrackMoveState(pos, aislePos, aisleAt - exitAt) },
    // 从自己的座位进过道、沿过道走到侧门、跨踏板登上月台；不再黑场瞬移到车尾。
    { t: aisleAt, pos: aislePos, ry: facingRy, state: TrackMoveState(aislePos, queuePos, queueAt - aisleAt) },
    { t: queueAt, pos: queuePos, ry: Math.PI, state: TrackMoveState(queuePos, thresholdPos, thresholdAt - queueAt) },
    { t: thresholdAt, pos: thresholdPos, ry: -Math.PI / 2, state: TrackMoveState(thresholdPos, platformPos, platformAt - thresholdAt) },
    { t: platformAt, pos: platformPos, ry: -Math.PI / 2, state: TrackMoveState(platformPos, outsidePos, outsideAt - platformAt) },
    { t: outsideAt, pos: outsidePos, ry: Math.PI, state: { prepare: 1, moveSpeed: 0 } },
    { t: Math.max(CHUCHUAN_END, outsideAt), pos: outsidePos, ry: Math.PI, state: { prepare: 1, moveSpeed: 0 } },
  ];
}

/**
 * 班长从头就立在镜头正对的车厢末端，面向满车人检查弹药；他不是被坐席和人群吞掉的第五个
 * 同质化乘客。第二声炮后只需收起手里的弹匣、正身说话，动员时始终可见。
 */
function CarRearLeaderTrack(pos, exitAt, exitEnd, exitX, facingRy = 0) {
  const queuePos = [0.55, CHUCHUAN_CAR_G, CHUCHUAN_SIDE_DOOR_Z];
  const thresholdPos = [3.25, 0.18, CHUCHUAN_SIDE_DOOR_Z + exitX * 0.08];
  const platformPos = [4.65, CHUCHUAN_PLATFORM_Y, CHUCHUAN_SIDE_DOOR_Z + exitX * 0.12];
  const outsidePos = [5.55, CHUCHUAN_PLATFORM_Y, CHUCHUAN_SIDE_DOOR_Z + exitX * 0.34];
  return [
    { t: 0, pos, ry: facingRy, state: { checkAmmo: 0.85, moveSpeed: 0 } },
    { t: 56.8, pos, ry: facingRy, state: { checkAmmo: 0.22, prepare: 0.10, moveSpeed: 0 } },
    { t: CHUCHUAN_MOTIVATION_AT, pos, ry: facingRy, state: { prepare: 0.28, moveSpeed: 0 } },
    { t: 83.6, pos, ry: facingRy, state: { prepare: 0.42, moveSpeed: 0 } },
    { t: CHUCHUAN_GEAR_AT, pos, ry: facingRy, state: { prepare: 0.74, moveSpeed: 0 } },
    { t: CHUCHUAN_DOOR_AT, pos, ry: facingRy, state: { prepare: 1, moveSpeed: 0 } },
    { t: exitAt, pos, ry: facingRy, state: TrackMoveState(pos, queuePos, exitEnd - exitAt) },
    { t: exitEnd, pos: queuePos, ry: Math.PI, state: TrackMoveState(queuePos, thresholdPos, 1.45) },
    { t: exitEnd + 1.45, pos: thresholdPos, ry: -Math.PI / 2, state: TrackMoveState(thresholdPos, platformPos, 1.10) },
    { t: exitEnd + 2.55, pos: platformPos, ry: -Math.PI / 2, state: TrackMoveState(platformPos, outsidePos, CHUCHUAN_END - exitEnd - 2.55) },
    { t: CHUCHUAN_END, pos: outsidePos, ry: Math.PI, state: { prepare: 1, moveSpeed: 0 } },
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

/** 玩家不是悬空的摄影机：他有一具普通士兵身体，先坐在右侧长凳，再完整走侧门下车。 */
function PlayerSoldierTrack() {
  const seat = [1.95, CHUCHUAN_CAR_G, 3.42];
  const aisle = [0.70, CHUCHUAN_CAR_G, 5.30];
  const threshold = [3.35, 0.18, CHUCHUAN_SIDE_DOOR_Z];
  const platform = [5.20, CHUCHUAN_PLATFORM_Y, CHUCHUAN_SIDE_DOOR_Z];
  const standing = [6.80, CHUCHUAN_PLATFORM_Y, 7.40];
  return [
    { t: 0, pos: seat, ry: Math.PI / 2, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, warmHands: 0.35 } },
    { t: 57.2, pos: seat, ry: Math.PI / 2, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.10 } },
    { t: CHUCHUAN_MOTIVATION_AT, pos: seat, ry: Math.PI / 2, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.16 } },
    { t: CHUCHUAN_GEAR_AT, pos: seat, ry: Math.PI / 2, state: { sit: 1, seatLift: CHUCHUAN_SEAT_LIFT, prepare: 0.55 } },
    { t: 90.8, pos: seat, ry: Math.PI / 2, state: { prepare: 1, moveSpeed: 0 } },
    { t: 93.0, pos: seat, ry: Math.PI / 2, state: TrackMoveState(seat, aisle, 2.5) },
    { t: 95.5, pos: aisle, ry: 2.55, state: TrackMoveState(aisle, threshold, 3.0) },
    { t: 98.5, pos: threshold, ry: -Math.PI / 2, state: TrackMoveState(threshold, platform, 2.5) },
    { t: 101.0, pos: platform, ry: -Math.PI / 2, state: TrackMoveState(platform, standing, 4.0) },
    { t: CHUCHUAN_END, pos: standing, ry: Math.PI, state: { prepare: 1, moveSpeed: 0 } },
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
 * 车厢的座位全部坐满：两侧各十名背景乘客、再加四名重点人物。过道只留六名零星
 * 站客，分别靠侧壁、行李架和远端车门，既有满载感也能看清班长与车门方向。
 */
function CreateCarriageCrowdCast() {
  const crowd = [];
  const seatZ = [-7.05, -6.05, -5.05, -4.05, -3.25, -1.30, -0.36, 0.56, 1.48, 3.42];
  for (const side of [-1, 1]) {
    seatZ.forEach((z, index) => {
      // 右侧最后一个座位留给玩家本人；镜头低头能看到自己的军装、腿和装备。
      if (side > 0 && z === 3.42) return;
      const id = `crowdSeat${side < 0 ? "L" : "R"}${index + 1}`;
      const n = crowd.length;
      crowd.push({
        id, kind: "nra", weapon: n % 3 === 0 ? null : "HanYang", seed: `chuchuan${id}`,
        ...CrowdAppearance(n),
        track: CarSeatTrack([side * 1.95, CHUCHUAN_CAR_G, z], CHUCHUAN_CROWD_LIFE[n % CHUCHUAN_CROWD_LIFE.length], (n % 7) * 0.52, 95.2 + (n % 5) * 0.3, 97 + (n % 5) * 0.3, side * (0.35 + (n % 4) * 0.30), side < 0 ? -Math.PI / 2 : Math.PI / 2),
      });
    });
  }
  const standingPlaces = [
    [-1.22, -6.68, 0], [1.20, -4.42, Math.PI], [-1.17, -0.28, 0],
    [1.22, 2.38, Math.PI], [-1.20, 5.05, 0], [1.16, 7.55, Math.PI],
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

/**
 * 小站从车窗后掠过的里程。站台模型本身在镜 4 用同一条 26.4 m 位移经过；
 * 人物在它上面另走几步，因而不会在 0:56 的镜头切换点一起被 hidden 掉。
 */
const CHUCHUAN_STATION_ENTER_AT = 40;
const CHUCHUAN_STATION_PASS_AT = 56;
const CHUCHUAN_STATION_START_Z = -13.2;
const CHUCHUAN_STATION_END_Z = 13.2;

function StationPlatformZ(time) {
  const k = Math.max(0, Math.min(1, (time - CHUCHUAN_STATION_ENTER_AT)
    / (CHUCHUAN_STATION_PASS_AT - CHUCHUAN_STATION_ENTER_AT)));
  return CHUCHUAN_STATION_START_Z + (CHUCHUAN_STATION_END_Z - CHUCHUAN_STATION_START_Z) * k;
}

/**
 * 站台上的人先随车站掠过，再自己沿月台走出车窗范围。最后的 hidden 帧放在
 * 画外，不能再把三人同时切掉；ry=π 保证他们真的朝 +Z 走，而不是倒着滑。
 */
function StationRailTrack(x, platformOffset, walkDistance, state = { moveSpeed: 0.16 }) {
  const posAt = (time, walking) => [x, 0.58, StationPlatformZ(time) + platformOffset + walking];
  // travelSpeed 是世界坐标中的合速度（车站掠过 + 人自己走）；moveSpeed 仍只管步态。
  const passingState = { ...state, travelSpeed: (CHUCHUAN_STATION_END_Z - CHUCHUAN_STATION_START_Z + walkDistance) / 16 };
  const exitState = { ...state, travelSpeed: 3.6 / 7 };
  return [
    { t: 0, pos: posAt(CHUCHUAN_STATION_ENTER_AT, 0), ry: Math.PI, state: { hidden: true } },
    { t: CHUCHUAN_STATION_ENTER_AT, pos: posAt(CHUCHUAN_STATION_ENTER_AT, 0), ry: Math.PI, state: passingState },
    { t: CHUCHUAN_STATION_PASS_AT, pos: posAt(CHUCHUAN_STATION_PASS_AT, walkDistance), ry: Math.PI, state: exitState },
    { t: 63, pos: posAt(CHUCHUAN_STATION_PASS_AT, walkDistance + 3.6), ry: Math.PI, state: exitState },
    { t: 64, pos: posAt(CHUCHUAN_STATION_PASS_AT, walkDistance + 4.4), ry: Math.PI, state: { hidden: true } },
  ];
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

const STATION_AT_SIDE_DOOR = Object.freeze({
  name: "StationPlatform", startAt: 0, endAt: 0.01,
  from: [7.2, 0, CHUCHUAN_SIDE_DOOR_Z], to: [7.2, 0, CHUCHUAN_SIDE_DOOR_Z], ease: "hold",
});

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
  -731, -706, -684, -659, -631, -608, -581, -557, -532, -505, -479, -454,
  -428, -403, -378, -353, -329, -305, -281, -258, -233, -207, -184, -160,
  -137, -113, -90, -67, -44, -21, 3, 27,
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

/**
 * 下车镜把两张长移动景片移出门洞视锥后，玩家仍可回头看车厢侧窗。每个窗洞
 * 后面各垫一张短景片：平时被移动层遮住，最后一镜只填自己的窗，不会形成走廊墙。
 */
function ExitWindowFill(side, label) {
  const x = side * 3.24;
  const ry = side < 0 ? -Math.PI / 2 : Math.PI / 2;
  return [-7.2, -5.15, -3.1, -1.03, 1.03, 3.1, 5.15, 7.2].map((z, index) => ({
    kind: "backdrop", size: [2.30, 4.4], pos: [x, 2.20, z], ry,
    mat: "CarriageLandscape", doubleSided: true, roughness: 1, name: `ExitWindowFill${label}${index}`,
  }));
}

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
  // 三月鲁南白日带浮尘：压低曝光保住窗外田野和村舍层次；overcast 会把
  // 窗洞推成纯白，所有乡野道具只剩看不见的浅灰轮廓。
  sky: "smokyDay",
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
  ambientMotion: [
    ...[[-1, "Left"], [1, "Right"]].flatMap(([side, label]) => WindowLandscapeMotion(side, label)),
  ],

  props: [
    // 1930 年代厢式客／军运车：窄车体、木板内衬、铆接钢骨架和靠站台侧滑门；不再是
    // 宽得像现代地铁的空大厅。中央净过道约 2.4 m，长凳只占靠窗一带。
    { kind: "box", size: [5.6, 0.18, 18], pos: [0, 0, 0], mat: "CarriageFloorSteel", roughness: 0.9, metalness: 0.42, name: "CarriageFloor" },
    { kind: "box", size: [5.6, 0.18, 18], pos: [0, 3.92, 0], mat: "CarriageCeilingSteel", color: 0x665f55, roughness: 0.91, metalness: 0.34, name: "CarriageCeiling", inside: true },
    // 军运车不是整面玻璃幕墙：下半木板抬高、上半钢板压低，留下的是一排窄窗。
    // 每格又有脏油布半帘与厚窗框，窗外只从小口漏进来，不能再像现代通透观景车。
    { kind: "box", size: [0.16, 1.28, 17.8], pos: [-2.8, 0.64, 0], mat: "CarriageBenchWood", roughness: 0.96, name: "WallLeftWoodLow", inside: true },
    { kind: "box", size: [0.16, 1.28, 13.35], pos: [2.8, 0.64, -2.23], mat: "CarriageBenchWood", roughness: 0.96, name: "WallRightWoodLowRear", inside: true },
    { kind: "box", size: [0.16, 1.28, 1.90], pos: [2.8, 0.64, 7.95], mat: "CarriageBenchWood", roughness: 0.96, name: "WallRightWoodLowFront", inside: true },
    { kind: "box", size: [0.16, 1.10, 17.8], pos: [-2.8, 3.37, 0], mat: "CarriageWallSteel", color: 0x554f47, roughness: 0.92, metalness: 0.28, name: "WallLeftWindowHigh", inside: true },
    { kind: "box", size: [0.16, 1.10, 13.35], pos: [2.8, 3.37, -2.23], mat: "CarriageWallSteel", color: 0x554f47, roughness: 0.92, metalness: 0.28, name: "WallRightWindowHighRear", inside: true },
    { kind: "box", size: [0.16, 1.10, 1.90], pos: [2.8, 3.37, 7.95], mat: "CarriageWallSteel", color: 0x554f47, roughness: 0.92, metalness: 0.28, name: "WallRightWindowHighFront", inside: true },
    { kind: "box", size: [5.6, 3.92, 0.18], pos: [0, 1.96, -8.9], mat: "CarriageWallSteel", color: 0x504a42, roughness: 0.88, metalness: 0.38, name: "RearWall", inside: true },
    { kind: "box", size: [5.6, 3.92, 0.18], pos: [0, 1.96, 8.9], mat: "CarriageWallSteel", color: 0x504a42, roughness: 0.88, metalness: 0.38, name: "FrontWall", inside: true },
    // 三盏有罩灯把铆钉钢板、士兵与窗外相对运动都照出来；没有真实室内光，
    // 车厢再多细节也只会是一团黑。
    { kind: "cyl", size: [0.14, 0.20], pos: [0, 3.48, -4.8], mat: "Steel", color: 0xc49d63, emissive: 0x35200d, light: { color: 0xffc985, intensity: 1.8, distance: 6.0, decay: 1.65, offsetY: -0.2 }, name: "CarriageLampRear" },
    { kind: "cyl", size: [0.14, 0.20], pos: [0, 3.48, 0.6], mat: "Steel", color: 0xc49d63, emissive: 0x35200d, light: { color: 0xffc985, intensity: 1.8, distance: 6.0, decay: 1.65, offsetY: -0.2 }, name: "CarriageLampMid" },
    { kind: "cyl", size: [0.14, 0.20], pos: [0, 3.48, 5.8], mat: "Steel", color: 0xc49d63, emissive: 0x35200d, light: { color: 0xffc985, intensity: 1.8, distance: 6.0, decay: 1.65, offsetY: -0.2 }, name: "CarriageLampFront" },
    // 一眼看出「这是车厢」的重复门框与顶梁；不靠文字或镜头解释空间。
    ...[-6.2, -3.4, -0.6, 2.2, 5.0, 7.3].map((z, index) => ({ kind: "box", size: [5.35, 0.16, 0.16], pos: [0, 3.68, z], mat: "CarriageWallSteel", color: 0x6f7374, name: `RoofRib${index}` })),
    { kind: "box", size: [0.22, 0.13, 17.6], pos: [-2.70, 1.27, 0], mat: "Steel", color: 0x4e4b45, name: "WindowSillLeft" },
    { kind: "box", size: [0.22, 0.13, 13.25], pos: [2.70, 1.27, -2.28], mat: "Steel", color: 0x4e4b45, name: "WindowSillRightRear" },
    { kind: "box", size: [0.22, 0.13, 1.75], pos: [2.70, 1.27, 8.02], mat: "Steel", color: 0x4e4b45, name: "WindowSillRightFront" },
    ...[-7.2, -5.75, -4.3, -2.85, -1.4, 0.05, 1.5, 2.95, 4.4, 5.85, 7.2].flatMap((z, index) => {
      const even = index % 2 === 0;
      const left = [
        { kind: "box", size: [0.12, 1.62, 0.12], pos: [-2.66, 2.02, z], mat: "Steel", color: 0x464544, name: `WindowMullionLeft${index}` },
        even
          ? { kind: "box", size: [0.08, 1.34, 0.98], pos: [-2.69, 2.03, z + 0.20], mat: "ClothNra", color: 0x3e3c35, name: `WindowShadeLeft${index}` }
          : { kind: "box", size: [0.08, 1.34, 0.96], pos: [-2.69, 2.03, z - 0.20], mat: "CarriageBenchWood", color: 0x463a2d, name: `WindowShutterLeft${index}` },
      ];
      // 正式侧门占掉右侧三格；这些窗框、卷帘和百叶不能再浮在门洞中间。
      if (z >= 4.35 && z <= 7.25) return left;
      return [...left,
        { kind: "box", size: [0.12, 1.62, 0.12], pos: [2.66, 2.02, z], mat: "Steel", color: 0x464544, name: `WindowMullionRight${index}` },
        even
          ? { kind: "box", size: [0.08, 1.34, 0.98], pos: [2.69, 2.03, z - 0.20], mat: "ClothNra", color: 0x3e3c35, name: `WindowShadeRight${index}` }
          : { kind: "box", size: [0.08, 1.34, 0.96], pos: [2.69, 2.03, z + 0.20], mat: "CarriageBenchWood", color: 0x463a2d, name: `WindowShutterRight${index}` },
      ];
    }),
    { kind: "box", size: [0.18, 0.12, 13.25], pos: [2.70, 2.80, -2.28], mat: "Steel", color: 0x575550, name: "WindowFrameRightTopRear" },
    { kind: "box", size: [0.18, 0.12, 1.75], pos: [2.70, 2.80, 8.02], mat: "Steel", color: 0x575550, name: "WindowFrameRightTopFront" },
    { kind: "box", size: [0.18, 0.12, 17.6], pos: [-2.70, 2.80, 0], mat: "Steel", color: 0x575550, name: "WindowFrameLeftTop" },
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
    ...ExitWindowFill(-1, "Left"),
    ...ExitWindowFill(1, "Right"),
    // Blender MCP 自制：1930 年代津浦线小站的石基高月台、木雨棚、候车屋、
    // 站牌、木凳、货箱、行李车和水鹤。它只当演出视觉布景，不改变关卡碰撞。
    { kind: "model", url: "./Model/Model_ChuchuanStationPlatform.glb?v=1", pos: [7.2, 0, -100], name: "StationPlatform" },
    // 一副担架随两名担架兵穿过月台；它和站台的位移同源，不能留成窗口中的静止盒子。
    { kind: "box", size: [1.25, 0.15, 2.15], pos: [6.85, 1.18, -100], mat: "ClothNra", color: 0xb29a78, name: "StationStretcher" },
    { kind: "box", size: [0.13, 0.10, 2.34], pos: [6.22, 1.04, -100], mat: "WoodStock", color: 0x8a6b4c, name: "StationStretcherPoleA" },
    { kind: "box", size: [0.13, 0.10, 2.34], pos: [7.48, 1.04, -100], mat: "WoodStock", color: 0x8a6b4c, name: "StationStretcherPoleB" },
    // 车门在靠站台的右侧，不在车厢端墙。门板、木条、门闩共用同一条 +Z 滑轨。
    { kind: "box", size: [0.12, 2.6, 2.2], pos: [2.75, 1.65, CHUCHUAN_SIDE_DOOR_Z], mat: "Steel", color: 0x49433b, name: "CarriageDoor" },
    // 滑门的横向旧木条、门闩和补片压在钢门上；远看先读到“装过人和物的军运车”，
    // 近看能看出门曾被拆修，而不是一块没有信息的纯黑矩形。
    ...[-0.86, -0.43, 0, 0.43, 0.86].map((y, index) => ({ kind: "box", size: [0.05, 0.12, 1.98], pos: [2.67, 1.65 + y, CHUCHUAN_SIDE_DOOR_Z], mat: "CarriageBenchWood", color: index % 2 ? 0x4f4030 : 0x5a4936, name: `DoorPlank${index}` })),
    { kind: "box", size: [0.06, 1.96, 0.14], pos: [2.66, 1.65, CHUCHUAN_SIDE_DOOR_Z - 0.78], mat: "Steel", color: 0x302d29, name: "DoorBraceLeft" },
    { kind: "box", size: [0.06, 1.96, 0.14], pos: [2.66, 1.65, CHUCHUAN_SIDE_DOOR_Z + 0.78], mat: "Steel", color: 0x302d29, name: "DoorBraceRight" },
    { kind: "box", size: [0.12, 0.10, 0.72], pos: [2.60, 1.62, CHUCHUAN_SIDE_DOOR_Z + 0.15], mat: "Steel", color: 0x242321, name: "DoorLatch" },
    { kind: "box", size: [0.22, 3.12, 0.16], pos: [2.70, 1.56, 4.48], mat: "Steel", color: 0x3b3935, name: "SideDoorFrameRear" },
    { kind: "box", size: [0.22, 3.12, 0.16], pos: [2.70, 1.56, 6.92], mat: "Steel", color: 0x3b3935, name: "SideDoorFrameFront" },
    { kind: "box", size: [0.22, 0.18, 2.60], pos: [2.70, 3.06, CHUCHUAN_SIDE_DOOR_Z], mat: "Steel", color: 0x3b3935, name: "SideDoorFrameTop" },
    { kind: "box", size: [0.40, 0.12, 2.20], pos: [2.86, 0.09, CHUCHUAN_SIDE_DOOR_Z], mat: "Steel", color: 0x3b3935, name: "SideDoorThreshold" },
    // 两级固定踏板把车地板接到石基月台，镜头和演员都真正踩完这段高差。
    { kind: "box", size: [1.25, 0.12, 1.75], pos: [3.48, 0.18, CHUCHUAN_SIDE_DOOR_Z], mat: "Steel", color: 0x4d4a43, name: "SideDoorStepInner" },
    { kind: "box", size: [0.72, 0.12, 1.75], pos: [4.30, 0.42, CHUCHUAN_SIDE_DOOR_Z], mat: "Steel", color: 0x4d4a43, name: "SideDoorStepOuter" },
    { kind: "box", size: [32, 0.12, 32], pos: [10, -0.08, CHUCHUAN_SIDE_DOOR_Z], mat: "GroundRubble", color: 0x5f5a51, name: "OutsideBallast" },
    // 开门后的三面远景围合在 16 m 外：正面景片保持原图宽高比，两侧景片把
    // head-look 的余角也封住。景片底边压到道砟以下，避免门槛尽头露白线。
    { kind: "backdrop", size: [32, 16.45], pos: [31, 7.2, CHUCHUAN_SIDE_DOOR_Z], ry: -Math.PI / 2, mat: "CarriageLandscape", doubleSided: true, roughness: 1, name: "DoorOutsideBackdrop" },
    { kind: "backdrop", size: [32, 16.45], pos: [15, 7.2, -10.3], mat: "CarriageLandscape", doubleSided: true, roughness: 1, name: "DoorOutsideBackdropLeft" },
    { kind: "backdrop", size: [32, 16.45], pos: [15, 7.2, 21.7], ry: Math.PI, mat: "CarriageLandscape", doubleSided: true, roughness: 1, name: "DoorOutsideBackdropRight" },
    { kind: "cyl", size: [0.25, 1.6], pos: [6.2, 1.38, 9.5], mat: "WoodStock", color: 0x634d37, name: "DoorMarkerPost" },
  ],

  cast: [
    // 玩家本人也是同制服、同身高体系里的普通通信兵；仅隐藏头部避免第一人称穿模，
    // 低头仍能看见胸前装具、双臂、裤腿和脚。
    { id: "playerSoldier", kind: "nra", weapon: null, seed: "chuchuanPlayer", firstPerson: true, uniformHex: 0x66717d, trouserHex: 0x4c555d, accessoryHex: 0x77705b, track: PlayerSoldierTrack() },
    // 五名重点士兵承接台词；其余乘客不是背景板，而是满载军运车的连续人群层。
    { id: "youngDispatch", kind: "nra", weapon: null, seed: "chuchuanYoung", uniformHex: 0x5C6674, attachments: [{ name: "ShoeTool", mount: "handL", offset: [0, -0.16, -0.04], rotation: [0.2, 0, 0] }], track: CarSeatTrack([-1.95, CHUCHUAN_CAR_G, -2.55], { repairShoe: 1 }, 0.0, 95.3, 96.6, -0.7, -Math.PI / 2) },
    { id: "rifleman", kind: "nra", weapon: "HanYang", seed: "chuchuanRifle", uniformHex: 0x828A93, track: CarSeatTrack([1.95, CHUCHUAN_CAR_G, -2.55], { cleanRifle: 1 }, 1.0, 95.5, 96.8, 0.5, Math.PI / 2) },
    { id: "oldWound", kind: "nra", weapon: null, seed: "chuchuanOld", uniformHex: 0x8A8778, track: CarSeatTrack([-1.95, CHUCHUAN_CAR_G, 2.75], { sleep: 0.8 }, 1.8, 95.7, 97.0, -0.5, -Math.PI / 2) },
    { id: "machineGunner", kind: "nra", weapon: "ZB26", seed: "chuchuanMachine", uniformHex: 0x6E7684, track: CarSeatTrack([1.95, CHUCHUAN_CAR_G, 2.75], {}, 2.6, 95.1, 96.4, 0.7, Math.PI / 2) },
    // 班长固定在车厢末端站着、面对全车，视线一转就能找到他；不再被塞回右侧座椅。
    { id: "squadLeader", kind: "nra", weapon: "HanYang", seed: "chuchuanLeader", uniformHex: 0x4f5a61, track: CarRearLeaderTrack([0, CHUCHUAN_CAR_G, 5.95], 94.9, 96.2, 0, Math.PI) },
    ...CreateCarriageCrowdCast(),
    { id: "stretcherBearerA", kind: "nra", weapon: null, seed: "chuchuanBearerA", track: StationRailTrack(6.1, -1.65, 3.3) },
    { id: "stretcherBearerB", kind: "nra", weapon: null, seed: "chuchuanBearerB", track: StationRailTrack(7.6, -1.65, 3.3) },
    { id: "lightWounded", kind: "nra", weapon: null, seed: "chuchuanWounded", track: StationRailTrack(9.15, -6.4, 2.2, { moveSpeed: 0.11, crouch: 0.25 }) },
    { id: "externalOfficer", kind: "nra", weapon: null, seed: "chuchuanOfficer", track: [
      { t: 0, pos: [5.9, CHUCHUAN_PLATFORM_Y, 8.0], ry: Math.PI / 2, state: { hidden: true } },
      { t: CHUCHUAN_DOOR_AT, pos: [5.9, CHUCHUAN_PLATFORM_Y, 8.0], ry: Math.PI / 2, state: { hidden: false, moveSpeed: 0 } },
      { t: CHUCHUAN_END, pos: [5.9, CHUCHUAN_PLATFORM_Y, 8.0], ry: Math.PI / 2, state: { hidden: false, moveSpeed: 0 } },
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
    { n: 4, seconds: 16, focalMm: 35, cameraMode: "headLook", camera: { from: [1.95, 1.36, 3.42], look: [3.8, 1.52, 2.6] },
      sfx: [{ at: 0.2, name: "trainBrake", volume: 0.62 }, { at: 3.0, name: "stretcherWood", volume: 0.42 }, { at: 6.0, name: "coughLow", volume: 0.32 }],
      propMoves: [
        { name: "StationPlatform", startAt: 0, endAt: 16, from: [7.2, 0, -13.2], to: [7.2, 0, 13.2], ease: "linear" },
        { name: "StationStretcher", startAt: 0, endAt: 16, from: [6.85, 1.18, -14.85], to: [6.85, 1.18, 14.85], ease: "linear" },
        { name: "StationStretcherPoleA", startAt: 0, endAt: 16, from: [6.22, 1.04, -14.85], to: [6.22, 1.04, 14.85], ease: "linear" },
        { name: "StationStretcherPoleB", startAt: 0, endAt: 16, from: [7.48, 1.04, -14.85], to: [7.48, 1.04, 14.85], ease: "linear" },
      ] },

    // 0:56—1:08：恰好两次远炮；第二声更近，五人先后停手，旧伤兵睁眼。
    { n: 5, seconds: 12, focalMm: 35, cameraMode: "headLook", timingLocked: true, camera: { from: [1.95, 1.36, 3.42], look: [-0.4, 1.28, 3.42] },
      shakeAt: [{ at: 0.6, seconds: 0.7, amount: 0.42 }, { at: 7.0, seconds: 0.95, amount: 0.82 }],
      sfx: [{ at: 0.6, name: "amb.cannonFar", volume: 0.48 }, { at: 7.0, name: "explosionFar", volume: 0.68 }],
      propMoves: [STATION_AT_SIDE_DOOR],
      lines: [{ at: 2.0, seconds: 1.6, who: "oldWound", voiceCue: "prologue_old_wound_03", text: "近咯。" }] },

    // 1:08—1:30：整段只触发一个 SeedAudio 1.0 复合 cue；其余行只负责逐句字幕。
    { n: 6, seconds: 22, focalMm: 35, cameraMode: "headLook", timingLocked: true, camera: { from: [1.95, 1.36, 3.42], look: [0, 1.58, 5.95] },
      sfx: [{ at: 19.0, name: "gearRustle", volume: 0.34 }],
      propMoves: [STATION_AT_SIDE_DOOR],
      lines: [
        { at: 0.2, seconds: 4.2, who: "squadLeader", voiceCue: "prologue_motivation_01", text: "这次你们去啊。晓不晓得，我们出来是做啥子？" },
        // 下列时点来自十来人自然错拍定稿的真实停顿，不是把八句音频拼起来。
        { at: 5.3, seconds: 2.6, who: "squad", text: "我们晓得。打日本！" },
        { at: 8.8, seconds: 0.8, who: "squadLeader", text: "去死，怕不怕？" },
        { at: 10.3, seconds: 2.4, who: "squad", text: "不怕！" },
        { at: 13.4, seconds: 1.0, who: "squadLeader", text: "为啥子不怕？" },
        { at: 14.4, seconds: 3.7, who: "squad", text: "我们要保护我们的国家！" },
        { at: 18.1, seconds: 0.8, who: "squadLeader", text: "好样的。" },
        { at: 19.0, seconds: 2.8, who: "squadLeader", text: "都把东西带好。前头就是滕县。" },
      ] },

    // 1:30—1:33：短黑地点卡；人物在黑场内起身，不用镜头外瞬移遮演出。
    { n: 7, seconds: 3, focalMm: 50, cameraMode: "headLook", black: true, titleCard: true, timingLocked: true,
      camera: { from: [0, 1.6, -6], look: [0, 1.6, -7] },
      subs: [{ at: 0, seconds: 3, title: true, date: true, text: "山东·滕县／1938年3月" }] },

    // 1:33—1:35.5：玩家已随大家起身，侧门整组沿车壁滑开；先从座位走进过道。
    { n: 8, seconds: 2.5, focalMm: 35, cameraMode: "headLook", timingLocked: true,
      camera: { from: [1.95, 1.63, 3.42], to: [0.70, 1.62, 5.30], look: [0.3, 1.48, 5.45], lookTo: [3.4, 1.45, 5.70], ease: "easeInOut", walkBob: { amount: 0.018, frequency: 1.75, fadeIn: 0.45 } },
      sfx: [{ at: 0.1, name: "carriageDoorSlide", volume: 0.7 }],
      propMoves: [STATION_AT_SIDE_DOOR, ...SideDoorMoves()],
      lines: [{ at: 0.6, seconds: 4.0, who: "externalOfficer", voiceCue: "prologue_external_officer_01", text: "通信排，下车！线盘背起，搞快！" }] },

    // 1:35.5—1:38.5：沿过道走到门框，镜头不再穿端墙或从车尾离开。
    { n: 9, seconds: 3, focalMm: 35, cameraMode: "headLook", timingLocked: true,
      camera: { from: [0.70, 1.62, 5.30], to: [3.35, 1.53, 5.70], look: [3.2, 1.48, 5.70], lookTo: [5.4, 1.65, 5.70], ease: "easeInOut", walkBob: { amount: 0.020, frequency: 1.85 } },
      sfx: [{ at: 0.5, name: "stepBallast", volume: 0.38 }, { at: 2.0, name: "stepBallast", volume: 0.42 }],
      propMoves: [STATION_AT_SIDE_DOOR, ...SideDoorHoldOpenMoves()] },

    // 1:38.5—1:41：跨门槛和两级踏板，脚下高度真实接到石基月台。
    { n: 10, seconds: 2.5, focalMm: 35, cameraMode: "headLook", timingLocked: true,
      camera: { from: [3.35, 1.53, 5.70], to: [5.20, 2.05, 5.70], look: [5.2, 1.70, 5.70], lookTo: [7.2, 1.90, 5.90], ease: "easeInOut", walkBob: { amount: 0.024, frequency: 1.65 } },
      sfx: [{ at: 0.35, name: "stepBallast", volume: 0.48 }, { at: 1.45, name: "stepBallast", volume: 0.50 }],
      propMoves: [STATION_AT_SIDE_DOOR, ...SideDoorHoldOpenMoves()] },

    // 1:41—1:45：登上站台后再沿站台走几步、停稳，身后的战友仍从同一扇门排队下来。
    { n: 11, seconds: 4, focalMm: 35, cameraMode: "headLook", timingLocked: true,
      camera: { from: [5.20, 2.05, 5.70], to: [6.80, 2.05, 7.40], look: [7.0, 1.95, 7.6], lookTo: [6.8, 1.90, 10.4], ease: "easeInOut", walkBob: { amount: 0.018, frequency: 1.75, fadeOut: 1.35 } },
      sfx: [{ at: 0.6, name: "stepBallast", volume: 0.46 }, { at: 2.0, name: "stepBallast", volume: 0.42 }],
      propMoves: [STATION_AT_SIDE_DOOR, ...SideDoorHoldOpenMoves()] },
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
