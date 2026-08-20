// 《滕县 1938》过场分镜 —— 李宗仁电联汤恩伯（CS_LiZongrenTang）。
//
// **纯数据，不许 import three**。被 Data_TengxianScript.mjs 汇总进 CUTSCENES，
// Script_Cutscene.mjs 是唯一消费者；字段说明见 Data_TengxianScript.mjs「过场」一节
// 与 docs/Data_CutsceneRedo.md（§1 引擎契约、§2.2 本场施工单）。
//
// 本场专属的人物表条目写在 people（并进 CAST），本场新引入的推定值写在 presumed
// （并进 PRESUMED_STAGING）—— 五场各自一个文件，是为了能并行改而不互相踩。
//
// ── 2026-08-20 第二轮重做 ───────────────────────────────────────────────────
// 上一稿 57.9 s / 10 镜，这一稿压到 45.2 s / 8 镜：两间屋的重复反打合并，
// 「敌情」与「命令」并进一句，蒋介石限期电话从画面挪进跳过卡（读字时间是硬下限，
// 45 s 里装不下九个带台词的节拍）。目的不变：命令确实下了、车确实在开、
// 时间确实很紧 —— 而城里的人一句也不知道。
//
// ★ 红线（照旧）：**仍然不下判决**。不出现「见死不救／拥兵自重／避战不前」，
//   也不出现替谁开脱的话。汤的「主力向邹县迂回」是李宗仁 3/16 16 时的命令原文
//   （第 20 军团战斗详报），不演成汤的私心。真实人物（李宗仁、汤恩伯）只做
//   史料里有的事：下令、接令、报告调动。对白的**措辞**是虚构的（tier 虚构／转述），
//   **事实**全部来自 docs/Data_TengxianTimeline.md 第四节。
//
// ── 史源（台词与字幕的依据，全在跳过卡里给全）─────────────────────────────────
//   3/14 夜   滕县方面王铭章电告：界河当面之敌已在一个师团以上，炮火很猛
//   3/14 17 时 李宗仁电令汤恩伯：调第 85 军一个整师至滕县附近作预备队
//   3/14 21 时 蒋介石电话：第 85 军经徐州向临城输送，「务必于十七日拂晓前到达」
//   3/15      第 85 军第 4 师先头一团在临城站下车，随即投入战斗
//   3/16 16 时 李宗仁再令：一部支援滕县城防，主力由铁道以东向邹县迂回攻击
//
// ── 这一稿在出图里核实过的三件事（别改回去）─────────────────────────────────
//   1. 朝向按文档口径 ry = atan2(-dx,-dz) 是对的（探针：ry=π 的人对 +z 相机露脸+帽徽）。
//      但 nraOfficer 的**后脑勺没有深色发盖**，背影近景像一块肤色板 ——
//      所以本场军官的头要么裁出画（S3 微距）、要么放暗/放小（S2/S4 越肩顶光）。
//   2. 灯泡的 emissive 必须被灯罩完全包住，否则 bloom 直接把半张画面糊白
//      （上一稿镜 4 的「大白光」就是裸灯泡）。罩住之后点光照明不受影响（点光不投影）。
//   3. .csSubs 与 .csLine 在同一个 bottom:16% 上，**字幕与台词不能同屏**，
//      本场全部错开时序。
//
// ── 布景（独立布景，setOrigin 离城心 ≥1800 m；坐标全是局部值）──────────────────
//   屋 A 徐州长官部  ：inside 盒子 6×3.2×5，中心 (0,1.6,0)。桌 (0,0.78,0)，李站桌后
//                     (0.05,0,-0.95) 面朝 +z 偏右（电话那边）ry=-2.72。
//   屋 B 军团司令部  ：inside 盒子 5×3.1×5，中心 (0,1.55,40)。桌 (0,0.76,40)，汤站桌后
//                     (-0.25,0,40.95) 面朝 -z（ry=0），3/16 那镜转身朝参谋（ry=-0.82）。
//   夜车             ：铁轨沿 z 轴铺在 x=-70，机车在前（+z），三节闷罐车在后。
//   两间屋各自挂灯：night 预设下室内没有点光就是纯黑（不是 bug，是没光）。

// ---------------------------------------------------------------------------
// 夜车：机车 + 三节闷罐车。道具与位移表由同一张清单生出来，免得两镜各抄一份对不上。
// 车头朝 +z，整列沿 +z 开。基准位是 loco 中心 z=0，propMoves 里给整列的 z 偏移。
// ---------------------------------------------------------------------------
const TRAIN_X = -70;
const TRAIN = [
  // 机车：锅炉（cyl 绕 x 转 90° 躺平，轴向 z）+ 司机室 + 烟囱 + 车头灯 + 底盘
  { name: "机车锅炉", kind: "cyl", size: [0.95, 6.4], pos: [TRAIN_X, 2.35, 1.6], rx: Math.PI / 2, color: 0x17151a, roughness: 0.7 },
  { name: "机车司机室", kind: "box", size: [2.8, 2.7, 2.6], pos: [TRAIN_X, 2.45, -2.9], color: 0x1a1816 },
  { name: "机车烟囱", kind: "cyl", size: [0.30, 1.1], pos: [TRAIN_X, 3.75, 4.0], color: 0x17151a },
  { name: "机车底盘", kind: "box", size: [2.5, 1.0, 9.6], pos: [TRAIN_X, 0.85, -0.4], color: 0x0f0e0c },
  { name: "机车车头灯", kind: "cyl", size: [0.17, 0.14], pos: [TRAIN_X, 3.05, 4.82], rx: Math.PI / 2, color: 0xffe9c0, emissive: 0xffe2a8,
    light: { color: 0xffe0a8, intensity: 9, distance: 26, offsetY: 0 } },
];
for (let i = 0; i < 3; i += 1) {
  const z = -9.5 - i * 12.6;
  TRAIN.push(
    { name: `闷罐车${i + 1}`, kind: "box", size: [2.8, 2.6, 11.4], pos: [TRAIN_X, 2.15, z], color: 0x1c1a17, roughness: 0.85 },
    { name: `闷罐车${i + 1}顶`, kind: "box", size: [2.95, 0.14, 11.6], pos: [TRAIN_X, 3.50, z], color: 0x141311 },
    { name: `闷罐车${i + 1}底盘`, kind: "box", size: [2.3, 0.9, 10.6], pos: [TRAIN_X, 0.80, z], color: 0x0f0e0c },
    // 拉开的车门：朝轨道西侧（相机那一侧）的一个黑洞
    { name: `闷罐车${i + 1}门`, kind: "box", size: [0.06, 1.9, 1.7], pos: [TRAIN_X - 1.42, 2.05, z + 1.2], color: 0x030303 },
  );
}
/** 整列沿 z 平移 fromZ→toZ（米），生成本镜的 propMoves。 */
function TrainMoves(fromZ, toZ, seconds) {
  return TRAIN.map((p) => ({
    name: p.name,
    from: [p.pos[0], p.pos[1], p.pos[2] + fromZ],
    to: [p.pos[0], p.pos[1], p.pos[2] + toZ],
    startAt: 0, endAt: seconds, ease: "linear",
  }));
}

// 时长：字幕/台词每字 ≥0.22 s + 1.2 s，台词 ≤22 字。每镜秒数按这条反算，
// 相邻文本不重叠（.csSubs 与 .csLine 同一个锚点，同屏会压字）。
const S = { s1: 3.4, s2: 5.4, s3: 6.1, s4: 5.8, s5: 5.7, s6: 6.7, s7: 6.9, s8: 5.2 };
const T = {};            // 各镜的全局起点
{
  let at = 0;
  for (const [k, v] of Object.entries(S)) { T[k] = at; at += v; }
}
const TOTAL = Object.values(S).reduce((a, b) => a + b, 0);

export const CS_LiZongrenTang = {
  id: "CS_LiZongrenTang",
  title: "李宗仁电联汤恩伯",
  seconds: Number(TOTAL.toFixed(2)),
  trigger: "beforeLevel:L1_Beishahe",
  sky: "night",
  standalone: true,
  setOrigin: [2400, 0, 2400],
  why: "让玩家亲眼看见：命令确实下过、时间确实很紧、车确实在开 —— 而城里的人一句也不知道。之后所有「等不到人」的感受就都不是控诉，而是信息不对称本身。",
  people: {
    li: { name: "李宗仁", short: "李宗仁", real: true, note: "第五战区司令长官，司令长官部在徐州。只做史料里有的事：3/14 电令、3/16 迂回令" },
    tang: { name: "汤恩伯", short: "汤恩伯", real: true, note: "第二十军团军团长。只做史料里有的事：接令、报告第 85 军输送情况" },
  },
  presumed: [
    { id: "liTangPhoneCall", value: "3/14 夜李宗仁与汤恩伯通电话",
      note: "史料记 3/14 17 时为电令、21 时为蒋介石电话。两人直接通话及其全部措辞是演出处理，台词 tier 为虚构／转述，不得引为史料" },
    { id: "liTangSets", value: "徐州长官部与第二十军团司令部的室内布景、桌椅灯具、墙上地图",
      note: "两间屋的样子没有任何图像史料，全是推定；军团司令部 3/14 夜的确切位置史料无载，字幕只写番号不写地名" },
  ],
  props: [
    // ======================= 屋 A：徐州 第五战区司令长官部 =======================
    // 一个大盒子 inside:true 当屋子：地面/四壁/顶一次到位，相机在里面永远看不见外面的虚空。
    { kind: "box", size: [6.0, 3.2, 5.0], pos: [0, 1.6, 0], mat: "Adobe", tint: 0x6e6758, roughness: 1.0, inside: true, name: "长官部墙" },
    { kind: "plane", size: [5.98, 4.98], pos: [0, 0.012, 0], color: 0x3f3730, roughness: 0.9, name: "长官部地板" },
    { kind: "box", size: [5.98, 0.04, 4.98], pos: [0, 3.17, 0], color: 0x5a534a, name: "长官部顶" },
    // 桌：近景桌面一律纯色，不用 WoodBeam（BoxGeometry 一面一张木纹，微距就是水波纹）
    { kind: "box", size: [2.2, 0.06, 1.1], pos: [0, 0.78, 0], color: 0x47392a, roughness: 0.7, name: "长官部桌面" },
    { kind: "box", size: [0.09, 0.75, 0.09], pos: [-1.0, 0.375, -0.45], color: 0x3a2e22, name: "桌腿1" },
    { kind: "box", size: [0.09, 0.75, 0.09], pos: [1.0, 0.375, -0.45], color: 0x3a2e22, name: "桌腿2" },
    { kind: "box", size: [0.09, 0.75, 0.09], pos: [-1.0, 0.375, 0.45], color: 0x3a2e22, name: "桌腿3" },
    { kind: "box", size: [0.09, 0.75, 0.09], pos: [1.0, 0.375, 0.45], color: 0x3a2e22, name: "桌腿4" },
    { kind: "box", size: [2.2, 0.12, 0.05], pos: [0, 0.70, 0.52], color: 0x3a2e22, name: "桌前挡板" },
    // 电话机（1930 年代桌式磁石电话：黑漆机身 + 听筒 + 摇柄）。摆在李的右前方，越肩机位才看得见
    { kind: "box", size: [0.22, 0.15, 0.19], pos: [0.95, 0.885, -0.22], color: 0x15130f, roughness: 0.45, name: "电话机" },
    { kind: "cyl", size: [0.045, 0.04], pos: [0.95, 0.98, -0.22], color: 0x22201c, roughness: 0.4, name: "电话叉簧" },
    // 听筒与摇柄：cyl 只能绕 x/y 转，躺不到 x 轴上 —— 用细长 box 代替
    { kind: "box", size: [0.25, 0.035, 0.04], pos: [0.95, 1.02, -0.22], color: 0x0c0b0a, roughness: 0.4, name: "电话听筒" },
    { kind: "box", size: [0.05, 0.05, 0.05], pos: [0.84, 1.015, -0.22], color: 0x0c0b0a, roughness: 0.4, name: "电话听筒头1" },
    { kind: "box", size: [0.05, 0.05, 0.05], pos: [1.06, 1.015, -0.22], color: 0x0c0b0a, roughness: 0.4, name: "电话听筒头2" },
    { kind: "box", size: [0.10, 0.02, 0.02], pos: [1.10, 0.92, -0.22], color: 0x2a2622, name: "电话摇柄" },
    // 台灯：绿罩、暖光。光是真点光；罩加大加深把灯泡整个包住 —— 裸露的 emissive 会被
    // bloom 糊成半屏白光（上一稿镜 4 的教训），罩住后照明不受影响（点光不投影）
    { kind: "cyl", size: [0.10, 0.02], pos: [-0.72, 0.82, -0.12], color: 0x1f1c18, name: "台灯座" },
    { kind: "cyl", size: [0.012, 0.30], pos: [-0.72, 0.98, -0.12], color: 0x2a2622, name: "台灯杆" },
    { kind: "cyl", size: [0.045, 0.06], pos: [-0.72, 1.10, -0.12], color: 0x8a6a44, emissive: 0x664c30,
      light: { color: 0xffd2a0, intensity: 3.4, distance: 5.5, offsetY: 0 }, name: "台灯泡" },
    { kind: "cyl", size: [0.16, 0.16], pos: [-0.72, 1.14, -0.12], color: 0x22452c, roughness: 0.35, name: "台灯罩" },
    // 顶上一只吊灯泡：屋子能看清轮廓全靠它（台灯只照桌面）。emissive 压暗防 bloom
    { kind: "cyl", size: [0.008, 0.55], pos: [0.3, 2.88, 0.9], color: 0x1a1815, name: "吊灯线" },
    { kind: "cyl", size: [0.05, 0.08], pos: [0.3, 2.56, 0.9], color: 0x6a5a40, emissive: 0x40331e,
      light: { color: 0xffdcae, intensity: 3.0, distance: 9.0, offsetY: -0.05 }, name: "吊灯泡" },
    // 桌上的电文稿与地图（纸压暗一档：台灯正上方，浅色会曝掉）
    { kind: "box", size: [0.30, 0.012, 0.22], pos: [0.25, 0.816, -0.30], ry: 0.12, color: 0xb0a88e, name: "电文稿" },
    { kind: "box", size: [0.30, 0.012, 0.22], pos: [0.34, 0.83, -0.24], ry: -0.18, color: 0xbab29a, name: "电文稿二" },
    { kind: "box", size: [0.86, 0.012, 0.62], pos: [-0.20, 0.816, 0.08], ry: 0.06, color: 0xa89d80, name: "桌上地图" },
    { kind: "box", size: [0.02, 0.014, 0.60], pos: [-0.12, 0.82, 0.08], color: 0x3a332c, name: "桌上地图铁路线" },
    { kind: "box", size: [0.14, 0.06, 0.10], pos: [-0.40, 0.84, -0.30], color: 0x4b3f30, name: "烟缸" },
    // 墙上的战区图（+z 墙）：纸色压暗（吊灯离得近，浅纸会白成一块板）
    { kind: "box", size: [1.9, 1.35, 0.03], pos: [0.8, 1.85, 2.47], color: 0x6e6552, name: "墙上地图" },
    { kind: "box", size: [0.025, 1.15, 0.02], pos: [0.72, 1.85, 2.45], color: 0x3a332c, name: "墙图津浦线" },
    { kind: "box", size: [1.60, 0.025, 0.02], pos: [0.8, 1.50, 2.45], color: 0x3a332c, name: "墙图陇海线" },
    { kind: "cyl", size: [0.035, 0.02], pos: [0.72, 2.20, 2.445], rx: Math.PI / 2, color: 0x7a2a22, name: "墙图滕县钉" },
    // 墙上的挂钟（+z 墙）：时刻就是这一场的主题
    { kind: "cyl", size: [0.21, 0.04], pos: [-1.3, 2.35, 2.47], rx: Math.PI / 2, color: 0x2a241e, name: "挂钟壳" },
    { kind: "cyl", size: [0.18, 0.02], pos: [-1.3, 2.35, 2.445], rx: Math.PI / 2, color: 0xa89f8a, name: "挂钟面" },
    // 指针摆成九点整：时针横指左、分针竖指上 —— 蒋介石那通限期电话正是二十一时
    { kind: "box", size: [0.13, 0.014, 0.008], pos: [-1.36, 2.35, 2.43], color: 0x1a1815, name: "挂钟时针" },
    { kind: "box", size: [0.012, 0.15, 0.008], pos: [-1.3, 2.43, 2.43], color: 0x1a1815, name: "挂钟分针" },
    // 窗（+x 墙）：夜，外面只有一点蓝
    { kind: "box", size: [0.04, 1.3, 1.0], pos: [2.975, 1.8, -0.6], color: 0x0a0d16, name: "窗玻璃" },
    { kind: "box", size: [0.05, 1.38, 0.06], pos: [2.965, 1.8, -1.13], color: 0x4a4036, name: "窗框1" },
    { kind: "box", size: [0.05, 1.38, 0.06], pos: [2.965, 1.8, -0.07], color: 0x4a4036, name: "窗框2" },
    { kind: "box", size: [0.05, 0.06, 1.1], pos: [2.965, 1.8, -0.6], color: 0x4a4036, name: "窗框横" },
    { kind: "box", size: [0.05, 0.06, 1.1], pos: [2.965, 2.47, -0.6], color: 0x4a4036, name: "窗框上" },
    { kind: "box", size: [0.05, 0.06, 1.1], pos: [2.965, 1.13, -0.6], color: 0x4a4036, name: "窗框下" },
    // 椅子（推到一边）、门（-x 墙）、墙边一口文件箱
    { kind: "box", size: [0.46, 0.05, 0.46], pos: [-1.1, 0.46, -1.15], color: 0x3f3226, name: "椅座" },
    { kind: "box", size: [0.46, 0.52, 0.04], pos: [-1.1, 0.74, -1.36], color: 0x3f3226, name: "椅背" },
    { kind: "box", size: [0.04, 0.44, 0.44], pos: [-1.31, 0.22, -1.15], color: 0x3f3226, name: "椅腿左" },
    { kind: "box", size: [0.04, 0.44, 0.44], pos: [-0.89, 0.22, -1.15], color: 0x3f3226, name: "椅腿右" },
    { kind: "box", size: [0.06, 2.1, 0.95], pos: [-2.96, 1.05, 1.2], mat: "WoodDoor", name: "长官部门" },
    { kind: "box", size: [0.7, 0.5, 0.45], pos: [2.3, 0.25, 1.9], mat: "WoodStock", name: "文件箱" },
    { kind: "box", size: [0.7, 0.5, 0.45], pos: [2.3, 0.75, 1.9], mat: "WoodStock", name: "文件箱二" },

    // ======================= 屋 B：第二十军团司令部 =======================
    // 另一间屋、另一盏灯：土墙更暗更黄，马灯（火光，带 flicker），野战电话，桌上摊着地图
    { kind: "box", size: [5.0, 3.1, 5.0], pos: [0, 1.55, 40], mat: "Adobe", tint: 0x655743, roughness: 1.0, inside: true, name: "军团部墙" },
    { kind: "plane", size: [4.98, 4.98], pos: [0, 0.012, 40], mat: "Ground", tint: 0x6a6058, name: "军团部地面" },
    { kind: "box", size: [4.98, 0.04, 4.98], pos: [0, 3.07, 40], mat: "WoodBeam", tint: 0x5a4c3a, name: "军团部顶" },
    { kind: "box", size: [1.8, 0.05, 0.95], pos: [0, 0.76, 40], color: 0x4a3d2f, roughness: 0.75, name: "军团部桌面" },
    { kind: "box", size: [0.08, 0.74, 0.08], pos: [-0.82, 0.37, 39.6], color: 0x3a2f24, name: "军团桌腿1" },
    { kind: "box", size: [0.08, 0.74, 0.08], pos: [0.82, 0.37, 39.6], color: 0x3a2f24, name: "军团桌腿2" },
    { kind: "box", size: [0.08, 0.74, 0.08], pos: [-0.82, 0.37, 40.4], color: 0x3a2f24, name: "军团桌腿3" },
    { kind: "box", size: [0.08, 0.74, 0.08], pos: [0.82, 0.37, 40.4], color: 0x3a2f24, name: "军团桌腿4" },
    // 野战电话：木箱 + 听筒 + 摇柄。摆在汤的左前方（他面朝 -z，相机在他右后方越肩）
    { kind: "box", size: [0.28, 0.20, 0.22], pos: [-0.95, 0.885, 40.2], mat: "WoodStock", name: "野战电话" },
    { kind: "box", size: [0.24, 0.035, 0.04], pos: [-0.95, 1.005, 40.2], color: 0x0c0b0a, roughness: 0.4, name: "野战听筒" },
    { kind: "box", size: [0.05, 0.05, 0.05], pos: [-1.06, 1.0, 40.2], color: 0x0c0b0a, roughness: 0.4, name: "野战听筒头1" },
    { kind: "box", size: [0.05, 0.05, 0.05], pos: [-0.84, 1.0, 40.2], color: 0x0c0b0a, roughness: 0.4, name: "野战听筒头2" },
    { kind: "box", size: [0.10, 0.02, 0.02], pos: [-1.14, 0.93, 40.2], color: 0x2a2622, name: "野战摇柄" },
    // 马灯：火光 —— 罩压暗、点光带 flicker（§1.7：火光道具别再是静止灯泡）。
    // 摆到野战电话旁边：镜 4 的被摄物是「汤在电话上」，电话必须被灯照见
    { kind: "cyl", size: [0.075, 0.03], pos: [-0.35, 0.80, 39.85], color: 0x1e1b17, name: "马灯座" },
    { kind: "cyl", size: [0.055, 0.15], pos: [-0.35, 0.89, 39.85], color: 0x8a5a30, emissive: 0x5a3a1c,
      light: { color: 0xffb870, intensity: 3.4, distance: 6.5, offsetY: 0, flicker: 0.35 }, name: "马灯罩" },
    { kind: "cyl", size: [0.085, 0.035], pos: [-0.35, 0.985, 39.85], color: 0x1e1b17, name: "马灯盖" },
    { kind: "cyl", size: [0.008, 0.16], pos: [-0.35, 1.08, 39.85], color: 0x2a2622, name: "马灯提手" },
    // 屋顶一盏很弱的灯泡（军团部比长官部暗）。emissive 压暗防 bloom
    { kind: "cyl", size: [0.045, 0.07], pos: [-0.6, 2.55, 40.6], color: 0x6a5a40, emissive: 0x38301c,
      light: { color: 0xffd2a0, intensity: 2.2, distance: 8.0, offsetY: -0.05 }, name: "军团部吊灯" },
    // 桌上摊开的地图与电文（纸压暗）
    { kind: "box", size: [1.1, 0.012, 0.72], pos: [-0.05, 0.795, 40.02], ry: -0.08, color: 0xa89d80, name: "军团桌图" },
    { kind: "box", size: [0.02, 0.014, 0.68], pos: [0.02, 0.80, 40.02], color: 0x3a332c, name: "军团桌图铁路线" },
    { kind: "box", size: [0.28, 0.012, 0.20], pos: [0.62, 0.80, 40.3], ry: 0.3, color: 0xb2a98f, name: "军团电文稿" },
    // 墙上的图（-z 墙，汤面对的那面）压暗、门（+x 墙）、弹药箱
    { kind: "box", size: [1.6, 1.15, 0.03], pos: [-0.3, 1.9, 37.53], color: 0x5e5644, name: "军团墙图" },
    { kind: "box", size: [0.025, 1.0, 0.02], pos: [-0.38, 1.9, 37.55], color: 0x3a332c, name: "军团墙图铁路" },
    { kind: "box", size: [0.06, 2.05, 0.9], pos: [2.47, 1.02, 41.0], mat: "WoodDoor", name: "军团部门" },
    { kind: "box", size: [0.5, 0.9, 0.9], pos: [-2.1, 0.45, 38.3], mat: "WoodStock", name: "军团弹药箱" },
    { kind: "box", size: [0.5, 0.4, 0.9], pos: [-2.1, 1.1, 38.3], mat: "WoodStock", name: "军团弹药箱二" },

    // ======================= 夜车：临城方向的铁路 =======================
    { kind: "plane", size: [80, 160], pos: [TRAIN_X, -0.03, -30], mat: "Ground", name: "铁路原野" },
    { kind: "box", size: [3.4, 0.18, 160], pos: [TRAIN_X, 0.04, -30], mat: "GroundRubble", tint: 0x6a645c, name: "道砟" },
    { kind: "box", size: [0.07, 0.15, 160], pos: [TRAIN_X - 0.72, 0.20, -30], mat: "Steel", name: "铁轨西" },
    { kind: "box", size: [0.07, 0.15, 160], pos: [TRAIN_X + 0.72, 0.20, -30], mat: "Steel", name: "铁轨东" },
    // 站外的一盏远灯（轨道东侧）：车过时的逆光来源
    { kind: "cyl", size: [0.12, 5.4], pos: [TRAIN_X + 8, 2.7, -14], color: 0x2a2622, name: "远灯杆" },
    { kind: "box", size: [0.9, 0.06, 0.06], pos: [TRAIN_X + 7.6, 5.35, -14], color: 0x2a2622, name: "远灯臂" },
    { kind: "cyl", size: [0.24, 0.22], pos: [TRAIN_X + 7.2, 5.2, -14], color: 0xffe8b8, emissive: 0xffdfa0,
      light: { color: 0xffd9a0, intensity: 16, distance: 44, offsetY: -0.1 }, name: "远灯" },
    // 轨道西侧近处的一盏道口灯（低机位靠它把车头照出来）
    { kind: "cyl", size: [0.10, 4.2], pos: [TRAIN_X - 5.0, 2.1, 3.0], color: 0x2a2622, name: "道口灯杆" },
    { kind: "cyl", size: [0.20, 0.18], pos: [TRAIN_X - 4.6, 4.05, 3.0], color: 0xffe8b8, emissive: 0xffdfa0,
      light: { color: 0xffd9a0, intensity: 7, distance: 22, offsetY: -0.1 }, name: "道口灯" },
    // 电线杆三根：夜里的剪影层次
    { kind: "cyl", size: [0.12, 7.0], pos: [TRAIN_X + 5.5, 3.5, -40], color: 0x221f1b, name: "电杆1" },
    { kind: "box", size: [1.4, 0.08, 0.08], pos: [TRAIN_X + 5.5, 6.6, -40], color: 0x221f1b, name: "电杆1臂" },
    { kind: "cyl", size: [0.12, 7.0], pos: [TRAIN_X + 5.5, 3.5, -2], color: 0x221f1b, name: "电杆2" },
    { kind: "box", size: [1.4, 0.08, 0.08], pos: [TRAIN_X + 5.5, 6.6, -2], color: 0x221f1b, name: "电杆2臂" },
    { kind: "cyl", size: [0.12, 7.0], pos: [TRAIN_X + 5.5, 3.5, 34], color: 0x221f1b, name: "电杆3" },
    { kind: "box", size: [1.4, 0.08, 0.08], pos: [TRAIN_X + 5.5, 6.6, 34], color: 0x221f1b, name: "电杆3臂" },
    ...TRAIN,
  ],

  // ★ Actor 正面是局部 -Z；ry = atan2(-dx,-dz) 面朝 (dx,dz)。探针核实过：约定没翻。
  //   李面朝 +z 偏右（朝电话那一边）：ry = atan2(-0.45,-1) ≈ -2.72；汤面朝 -z：ry = 0。
  // ★ 没有「拿听筒」的手姿：用 reach（空手往前下方伸，§1.7 新姿态）在接电话那一拍
  //   俯身够一下，然后收到低位当「手扶桌沿」；头用 lookPitch 低下去对着电话。
  //   机位从背后／侧后拍，不给手部特写。
  cast: [
    { id: "li", kind: "nraOfficer", weapon: null, seed: "li1938", track: [
      { t: 0.0, pos: [0.05, 0, -0.95], ry: -2.72, state: { moveSpeed: 0, lookPitch: 0.35 } },
      { t: T.s2, pos: [0.05, 0, -0.95], ry: -2.72, state: { moveSpeed: 0, lookPitch: 0.35 } },
      { t: T.s2 + 0.5, pos: [0.05, 0, -0.95], ry: -2.72, state: { moveSpeed: 0, lookPitch: 0.42, reach: 0.5 } },
      { t: T.s2 + 1.2, pos: [0.05, 0, -0.95], ry: -2.72, state: { moveSpeed: 0, lookPitch: 0.35, reach: 0.15 } },
      { t: T.s3, pos: [0.05, 0, -0.95], ry: -2.72, state: { moveSpeed: 0, lookPitch: 0.35, reach: 0.15 } },
      { t: T.s3 + 0.6, pos: [0.05, 0, -0.95], ry: -2.72, state: { moveSpeed: 0, lookPitch: 0.42, reach: 0.35 } },
      { t: T.s4, pos: [0.05, 0, -0.95], ry: -2.72, state: { moveSpeed: 0, lookPitch: 0.42, reach: 0.35 } },
      { t: T.s5, pos: [0.05, 0, -0.95], ry: -2.72, state: { moveSpeed: 0, lookPitch: 0.35, reach: 0.15 } },
      { t: T.s5 + 0.9, pos: [0.05, 0, -0.95], ry: -2.72, state: { moveSpeed: 0, lookPitch: 0.08, lookYaw: -0.2, reach: 0.05 } },
      { t: T.s6, pos: [0.05, 0, -0.95], ry: -2.72, state: { moveSpeed: 0, lookPitch: 0.08, lookYaw: -0.2, reach: 0.05 } },
    ] },
    // 长官部的参谋：背对相机站在墙图前看图（镜 2/5 的后景深度；背影，不给脸）
    { id: "staffA", kind: "nraOfficer", weapon: null, seed: "staffXuzhou", track: [
      { t: 0.0, pos: [1.75, 0, 1.55], ry: 2.34, state: { moveSpeed: 0, lookPitch: -0.08 } },
      { t: T.s6, pos: [1.75, 0, 1.55], ry: 2.34, state: { moveSpeed: 0, lookPitch: -0.05 } },
    ] },
    { id: "tang", kind: "nraOfficer", weapon: null, seed: "tang1938", track: [
      { t: T.s4, pos: [-0.25, 0, 40.95], ry: 0, state: { moveSpeed: 0, lookPitch: 0.38, reach: 0.2 } },
      { t: T.s5, pos: [-0.25, 0, 40.95], ry: 0, state: { moveSpeed: 0, lookPitch: 0.38, reach: 0.2 } },
      // 3/16 那一镜：先还在电话上，放下后转身对参谋说
      { t: T.s7, pos: [-0.25, 0, 40.95], ry: 0, state: { moveSpeed: 0, lookPitch: 0.38, reach: 0.2 } },
      { t: T.s7 + 0.7, pos: [-0.25, 0, 40.95], ry: 0, state: { moveSpeed: 0, lookPitch: 0.38, reach: 0.2 } },
      { t: T.s7 + 1.5, pos: [-0.25, 0, 40.95], ry: -0.82, state: { moveSpeed: 0, lookPitch: 0.08, reach: 0 } },
      { t: T.s8, pos: [-0.25, 0, 40.95], ry: -0.82, state: { moveSpeed: 0, lookPitch: 0.05 } },
    ] },
    // 军团部的参谋：站在汤右前方，3/16 那镜汤转身对他说
    { id: "staffB", kind: "nraOfficer", weapon: null, seed: "staffJuntuan", track: [
      { t: T.s7, pos: [1.45, 0, 39.35], ry: 2.32, state: { moveSpeed: 0, lookPitch: 0.10 } },
      { t: T.s8, pos: [1.45, 0, 39.35], ry: 2.32, state: { moveSpeed: 0, lookPitch: 0.06 } },
    ] },
  ],

  shots: [
    {
      n: 1, seconds: S.s1, focalMm: 35, black: true, titleCard: true,
      note: "黑场字卡：地点与时刻。机位与镜 2 同一处，避免第一帧闪别的画面",
      camera: { from: [-0.85, 1.72, -2.35], look: [0.20, 0.95, 0.05] },
      subs: [
        { at: 0.15, seconds: 3.2, tier: "主流", text: "第五战区司令长官部", title: true },
        { at: 0.15, seconds: 3.2, tier: "主流", text: "三月十四日 夜 · 徐州", date: true },
      ],
    },
    {
      n: 2, seconds: S.s2, focalMm: 35,
      note: "屋 A 越肩：李宗仁的侧背影在右，桌、电话、台灯在中，远墙战区图在左。他俯身拿起电话",
      camera: { from: [-0.85, 1.72, -2.35], to: [-0.75, 1.70, -2.27], look: [0.20, 0.95, 0.05], lookTo: [0.18, 0.96, 0.02], ease: "linear" },
      lines: [
        { at: 0.3, seconds: 4.8, who: "li", tier: "虚构", text: "接第二十军团。恩伯兄，我李宗仁。" },
      ],
      sfx: [{ at: 0.55, name: "impactMetal", volume: 0.10 }],
    },
    {
      n: 3, seconds: S.s3, focalMm: 35,
      note: "屋 A 切到墙上：挂钟（九点整）与战区图（津浦线、滕县红钉）慢推，李的命令画外音说完。时刻就是这一场的主题",
      camera: { from: [0.35, 1.45, -0.30], to: [0.25, 1.50, 0.05], look: [-0.25, 2.05, 2.44], lookTo: [-0.28, 2.06, 2.44], ease: "easeInOut" },
      lines: [
        { at: 0.3, seconds: 5.7, who: "li", tier: "转述", text: "界河之敌一个师团以上，抽一个师作预备队。" },
      ],
    },
    {
      n: 4, seconds: S.s4, focalMm: 35, cut: "hard",
      note: "硬切屋 B：另一间屋、另一盏灯（马灯火光）。越肩：汤恩伯背影，野战电话与桌图在左下",
      camera: { from: [0.95, 1.80, 42.35], to: [0.86, 1.77, 42.24], look: [-0.85, 0.95, 40.15], lookTo: [-0.80, 0.96, 40.13], ease: "linear" },
      lines: [
        { at: 0.2, seconds: 5.5, who: "tang", tier: "转述", text: "八十五军在徐州上车，先头团明天到临城。" },
      ],
      sfx: [{ at: 0.25, name: "impactWood", volume: 0.12 }],
    },
    {
      n: 5, seconds: S.s5, focalMm: 50,
      note: "回屋 A 侧后 3/4（不给正脸，头在暗处）：李抬起头，台灯与桌在他身前。催促",
      camera: { from: [2.30, 1.55, -2.15], to: [2.24, 1.54, -2.07], look: [-0.15, 1.28, -0.55], ease: "linear" },
      lines: [
        { at: 0.25, seconds: 5.3, who: "li", tier: "虚构", text: "要快。滕县多守一天，徐州多一天准备。" },
      ],
    },
    {
      n: 6, seconds: S.s6, focalMm: 35,
      note: "夜车·低机位贴轨旁：车头灯从远处过来，整列在镜前掠过（3/14 21 时蒋介石限期电话见跳过卡）",
      camera: { from: [TRAIN_X - 3.2, 0.85, 9.2], look: [TRAIN_X - 0.3, 2.05, -4.5], shake: 0.22 },
      // 走 -32→0：镜末车头刚好逼到相机前 2—3 m 就切，不让它越过相机变成一面黑墙
      propMoves: TrainMoves(-32, 0, S.s6),
      subs: [
        { at: 0.35, seconds: 6.2, tier: "主流", text: "三月十五日，先头一团在临城站下车，投入战斗。" },
      ],
      sfx: [
        { at: 0.5, name: "impactMetal", volume: 0.25 },
        { at: 2.5, name: "impactMetal", volume: 0.25 },
        { at: 4.5, name: "impactMetal", volume: 0.25 },
      ],
    },
    {
      n: 7, seconds: S.s7, focalMm: 35,
      note: "屋 B，两天后：汤放下电话转身，对参谋复述 3/16 迂回令。双人镜，马灯在两人之间",
      camera: { from: [0.95, 1.60, 42.35], to: [0.88, 1.58, 42.22], look: [0.30, 1.20, 39.90], ease: "linear" },
      lines: [
        { at: 1.0, seconds: 5.7, who: "tang", tier: "转述", text: "十六日再令：一部援滕县，主力向邹县迂回。" },
      ],
      sfx: [{ at: 0.8, name: "impactWood", volume: 0.15 }],
    },
    {
      n: 8, seconds: S.s8, focalMm: 50, black: true, titleCard: true,
      note: "黑场，一行叙述（居中）",
      camera: { from: [0.95, 1.60, 42.35], look: [0.30, 1.20, 39.90] },
      subs: [{ at: 0.2, seconds: 4.8, tier: "叙述", text: "这些电话，城里的人一句也不知道。" }],
    },
  ],

  skipCard: {
    title: "命令与时刻",
    lines: [
      { tier: "转述", text: "三月十四日夜　滕县方面王铭章电告：界河当面之敌已在一个师团以上，炮火很猛。", small: true },
      { tier: "主流", text: "三月十四日 十七时　李宗仁电令汤恩伯：调第八十五军一个整师至滕县附近，作预备队。" },
      { tier: "主流", text: "（另一版本记原文为「第四师先头之一部，应即开滕县附近增援」。两版并列。）", small: true },
      { tier: "主流", text: "三月十四日 二十一时　蒋介石电话：第八十五军经徐州向临城输送，务必于十七日拂晓前到达。" },
      { tier: "主流", text: "三月十五日　汤恩伯亲率第八十五军第四师先头一团在临城站下车，随即投入战斗。" },
      { tier: "主流", text: "三月十六日 十六时　李宗仁再令：第八十五军以一部支援滕县城防，主力由铁道以东向邹县迂回攻击。" },
      { tier: "叙述", text: "这些电话，城里的人一句也不知道。" },
    ],
  },
  forbiddenLines: ["见死不救", "拥兵自重", "避战不前"],
};
