// 第一关 01–03 过场分镜布景（Set 包，契约 docs/Data_FirstLevelStoryboard0103Contract.md §4.5）。
// 纯数据，零 three。消费方：Script_OpeningSet（装载 / 收走）、Script_OpeningSetTest（数据合法、
// 不压导演站位与路线、塌土视线、离开收走）。
//
// 坐标：X 东、Z 南、米；yawDeg 用 three.js 约定（0 朝北 -Z，+90 朝西，-90 朝东，180 朝南）。
// 高度一律写「离地」：`lift` 是离道具参考地面的高度，参考地面默认取道具自己的 (x,z)，
// 洞内陈设写 `ground:FLOOR`（洞底取样点；北壁坡脚附近取样会偏高 0.1–0.2 m）。
// 位置起点来自 REL/附件/survey/Survey_A.md、Survey_B.md（逐镜试摆过的数），按实际画面改过的在注释里写原因。
//
// 这里全是**外观**：不进碰撞、不进 AI 掩体、不进 Space 量尺。要挡路、挡视线的东西在
// Data_FirstLevelMissionLayout 的 MISSION_SCENARIO（洞口塌土 `BunkerMouthRubbleS` 等；本包只改了它的高度与宽度）。

/** 01–03 的内部步骤：进这几步装载，离开（04 起、回跳到别处、整关拆除）全部收走。 */
export const SET_STAGES = Object.freeze(["Trapped", "BunkerRescue", "RearTrench", "Support"]);

const P = (x, z, lift) => Object.freeze(lift == null ? { x, z } : { x, z, lift });
const Path = (...points) => Object.freeze(points.map(([x, z]) => P(x, z)));
/** 洞底取样点：洞内陈设都以洞底为参考地面。 */
export const FLOOR = P(-0.2, -126.4);

// 南南西直沟（02 救援圈看出去的那条沟）：中线 (0.3,-122.5)→(-4,-113)。东壁坡脚在中线东侧
// s=3 m 处 1.68 m、s=4…10 m 处 1.9–2.3 m，西壁 1.4–1.9 m（共享地面采样器量的）。
const SSW_A = P(0.3, -122.5), SSW_B = P(-4, -113);
export const SSW_LEN = Math.hypot(SSW_B.x - SSW_A.x, SSW_B.z - SSW_A.z);
const SSW_DIR = Object.freeze({ x: (SSW_B.x - SSW_A.x) / SSW_LEN, z: (SSW_B.z - SSW_A.z) / SSW_LEN });
const SSW_EAST = Object.freeze({ x: SSW_DIR.z, z: -SSW_DIR.x });
/** 沿南南西直沟中线 s 米、向东偏 o 米的点。 */
export const SswPoint = (s, o = 0) => P(+(SSW_A.x + SSW_DIR.x * s + SSW_EAST.x * o).toFixed(3), +(SSW_A.z + SSW_DIR.z * s + SSW_EAST.z * o).toFixed(3));

export const PROPS = Object.freeze([
  // ---------------------------------------------------------------- 洞内北壁（SB01 左侧、SB02 镜像后画面左侧）
  // 调研起点 x -0.6…0.8。幺娃坐在 (-0.55,-127.35) 靠北壁、身后是弹药箱（SB01），所以沙袋墙挪到
  // 弹药箱东边、贴着北门柱（x 0.3…0.9）：SB02 从洞里朝东北东看，北门柱在画面中间，沙袋、标语、
  // 马灯都要挨着门柱才进画。
  { id: "bunkerSandbagWallN", kind: "sandbagWall", ground: FLOOR,
    // 3 层 0.54 m（调研写高 1.1、上一版 4 层 0.72）：海报的字排在下半，沙袋墙得让出来（见 bunkerPoster）。
    a: P(0.3, -127.62), b: P(0.9, -127.62), layers: 3, layerM: 0.18, depthM: 0.36, bagM: 0.5 },
  // 竖排两行标语配宣传画，贴在北壁的木板上，面朝南。底图 Lovart、字程序叠加（Texture/Script_MakeBunkerPoster.mjs）。
  // 审查 09-25：真实流程 Blast 机位（眼 0.75、俯 13°、横滚 +15°：头向左倒，画面左半往上翻）北壁上离地 0.95 m 以上
  // 全在画框外，上一版（中心 1.02、字在上 45%、离地 0.98–1.47）只露出下半截的画。现在贴图改成**画在上、字在下**
  // （版式 textBottom），中心 0.95、x 0.5：字在离地 0.54–0.86，落在沙袋墙（0.54）上方、画框上沿以下；
  // 投到 Blast 镜像机位是画面 x 0.19–0.25、y 0.12–0.30（Script_OpeningSetTest 量）。x 0.5 也避开了北壁弹药箱（x ≤ 0.25）。
  { id: "bunkerPoster", kind: "poster", ground: FLOOR, x: 0.5, z: -127.8, lift: 0.95, w: 0.6, h: 0.9, faceYawDeg: 180,
    textBand: Object.freeze([0.605, 0.955]),        // 字在贴图里的纵向范围（从上往下，0–1），与 Script_MakeBunkerPoster 的 textBottom 一致
    texture: "./Texture/Texture_BunkerPosterDefendShandong.webp",
    // 做旧（2026-09-28 3A 迭代 B5，Script_OpeningSet.AgePoster）：受潮发黄 tint、四边水渍 edge（深度占短边 edgeFrac）、
    // 下半张几道干水迹 tideLines、泥点 mudSpots。字（textBand）要读得出来：水渍与泥点都压得很淡、很小。
    aging: Object.freeze({ tint: 0.14, edge: 0.38, edgeFrac: 0.07, tideLines: 3, mudSpots: 34 }),
    board: Object.freeze({ x0: -0.75, x1: 0.92, z: -127.87, lift0: 0.0, lift1: 1.84, plankM: 0.2 }) },
  // 铁皮马灯：挂在北门柱内侧（柱 x 0.925…1.175、z -127.65…-127.35）的钉子上，暖色点光只在 01 亮、轻微闪烁。
  // 离洞底 1.0 m（调研写 1.55，上一版 1.28）：Blast 机位俯 13° 时 1.28 只在画面上沿露一小块亮斑（审查 09-25）；
  // 1.0 时灯身在画面 (0.37, 0.13)，挨着北门柱。
  // 2026-09-28（3A 迭代 B5）：洞内环境光压暗以后（INTERIOR）马灯要撑起一圈暖光池（分镜 01/02：柱上一盏马灯把北壁、
  // 标语、弹药箱照成暖橙，其余是暗土洞）。强度 2.2 → 4.2、半径 3.2 → 4.4 m、色温往煤油灯拉（约 1900 K）。
  { id: "bunkerLantern", kind: "lantern", ground: FLOOR, x: 0.84, z: -127.42, lift: 1.0,
    light: Object.freeze({ color: 0xff9a4e, intensity: 4.2, distanceM: 4.4, decay: 2, flickerHz: Object.freeze([7.3, 11.1, 2.3]), flicker: 0.16 }),
    litStages: Object.freeze(["Trapped"]) },
  // 北壁弹药箱两层（幺娃身后，SB01 左中），箱背嵌进北壁坡脚。
  // z -127.92（原 -127.88）：幺娃坐位 (-0.55,-127.35) 离箱前沿差 3 cm 就进了箱子（Script_OpeningSetTest §2 的 banter.yaowa），
  // 往墙里再推 4 cm，他背靠箱子、不坐进箱子；SB01 画面上看不出这 4 cm。
  { id: "bunkerCrateStackN", kind: "crateStack", ground: FLOOR, x: -0.15, z: -127.92, yawDeg: 4,
    layers: Object.freeze([Object.freeze({ w: 0.8, h: 0.45, d: 0.5 }), Object.freeze({ w: 0.72, h: 0.4, d: 0.48, dx: 0.04, dyawDeg: -6 })]) },
  // SB01 左下前景：一只开着盖的木箱（眼位 (-1.95,-126.25) 左前 0.85 m）。
  { id: "bunkerCrateFront", kind: "crateStack", ground: FLOOR, x: -1.35, z: -126.85, yawDeg: -18,
    layers: Object.freeze([Object.freeze({ w: 0.7, h: 0.35, d: 0.45, lid: true })]) },

  // ---------------------------------------------------------------- 塌落木料（01 近爆之后）
  // 门楣断成两截：北段还搁在北门柱顶；南段绕南门柱顶转下来，断头落在洞口内的塌顶木上。
  // 调研写的是「南端落到 (1.2,-124.6) 地面、北端搭在北柱顶」，那样这根木头横在 SB03 眼位
  // (0.35,-125.15) 正前方 0.75 m、只比眼高 0.15 m，把审问组整条挡住；改成南端留在南柱顶、
  // 断头朝西北落进洞口：SB02 从洞里看是门柱右侧斜下来的木料（分镜镜像后的「门框一侧坍塌」），
  // SB03/03A 从洞口看在左上角。北侧 z -127.3…-126.4 仍有 0.9 m 宽、1.7 m 高的通道，拖人出洞走这边。
  { id: "fallenLintel", kind: "fallingTimber", ground: FLOOR, show: "collapsed",
    // 完好时的门楣（= MISSION_SCENARIO 完好态的 BunkerMouthLintel：中心 (1.05,-125.9)，0.3×0.22×3.4，顶在洞底上 1.95 m）。
    intact: Object.freeze({ x: 1.05, z: -125.9, lift: 1.84, w: 0.3, h: 0.22, d: 3.4 }),
    pivot: P(1.05, -124.3, 1.84),          // 南段绕南门柱顶转
    rest: P(0.95, -126.05, 0.69),          // 断头落在塌顶木 roofTimberDown 北头上（顶面离地 0.58 + 半厚 0.11；2026-09-27 木料挪到洞口正中）
    breakZ: -126.5,                         // 断口：北段 z -127.6…-126.5 留在北柱顶（MISSION_SCENARIO 塌方态的 BunkerMouthLintelN 体块）
    // 近爆后的落下时刻（秒，从 Blast 起算），契约 §5 SB02「fallenLintel 0.25–0.6 s 塌下」。
    fall: Object.freeze({ startS: 0.25, endS: 0.6, bounceRad: 0.05, bounceS: 0.18 }) },
  // SB03A 画面上沿那一整条黑木料：塌下的洞顶木，沿 z 横在洞口内侧，两头各垫一堆土块。
  // 调研起点：中心 (0.8,-125.4)、离地 0.52、0.3×0.3×3.4。长度收到 1.75 m（z -126.25…-124.5）：SB03A 画面
  // 左右缘只用到 z -126.1…-124.8，北边留出拖人出洞的通道。
  // 离地抬到 0.62/0.66（下沿 0.48–0.52）：0.47/0.55 时木料下沿 0.33–0.41，SB03 眼高 0.26 离它只有 0.45 m，
  // 实拍盖掉画面上 42%、审问组只剩头（tmp/cap/step1b/SB03_set.png）。现在 SB03 约占上 25%、SB03A 约 20%，
  // 日兵甲的头从木料下沿露出来（Script_OpeningSetTest 的视线检查，余量约 4 cm）。
  // **近爆后先卡在洞顶下面，到 Reach（顺子伸手够枪）那一拍才塌下来**（审查 09-25：SB03 与 SB03A 两个眼位只差 8 cm、
  // 2°，同一根木料落定在这里就会在 SB03 也横在画面上 25%、把旗面挡掉；分镜 SB03 画面顶上是天，没有这条木料）。
  // hang 是卡在洞顶下的姿态（北头 1.62、南头 1.05：两个眼位看都在画面上沿以外），settle 是塌下的时刻与时长。
  // 离眼 0.45 m 的木料要在 SB03 画框外，下沿得高过眼 0.35 m 以上（竖直半视场 32.5° + 俯仰 5°）。
  // **2026-09-27 改稿**（用户：「主角变成压在房梁下，半个身子在外面」）：塌顶木落在洞口正中、压着顺子的胯（导演
  // shunzi.pinnedHips (0.95,-125.3)），他腿在洞里、胸口和头伸在洞外。近爆后的黑场里（Black）就落定，睁眼时已经压着；
  // 两头垫在齐胯高的两堆土上（顶 0.30），木料下沿 0.30 贴着他的背。02 何有田把它抬起来（导演 Lift → LiftRoofTimber），
  // 罗班长把人拖出来。长度收到 1.55 m（z -126.15…-124.6），南头离南门柱 0.15 m。
  { id: "roofTimberDown", kind: "timber", ground: FLOOR, show: "collapsed",
    a: P(0.95, -126.15, 0.44), b: P(0.95, -124.6, 0.44), w: 0.3, h: 0.28,
    hang: Object.freeze({ a: P(0.8, -126.25, 1.62), b: P(0.8, -124.5, 1.05) }),
    settle: Object.freeze({ phase: "Black", seconds: 0.32, bounceRad: 0.03, bounceS: 0.16, impact: Object.freeze({ clods: 4, dust: 10, grit: 6 }) }),
    supports: Object.freeze([Object.freeze({ x: 0.95, z: -126.2, w: 0.5, h: 0.3, d: 0.4 }),
      Object.freeze({ x: 0.95, z: -124.66, w: 0.45, h: 0.3, d: 0.3 })]) },

  // SB03 左上角那根斜断木（分镜 03：画面左上一截劈开的木料斜着插下来；SB03A 左侧也有）：门楣断口（北段 z -126.5）南边
  // 挂下来的一块断板，上头卡在洞顶边、下头垂到离地 0.55 m，在门洞北半、x 0.98（塌顶木 x 0.65–0.95 的东边一点）。
  // 下头在塌顶木 roofTimberDown 的通道限制以内（人从洞口进出本来就得走 z < -126.4 或 x > 1.25），不另外占路。
  // 画面位置（SB03 眼位、1280×720）：下端约 (0.28, 0.29)，上端出左上角（Script_OpeningSetTest 量）。
  { id: "brokenBoardNW", kind: "timber", ground: FLOOR, show: "collapsed",
    a: P(1.02, -126.32, 1.8), b: P(0.98, -125.72, 0.8), w: 0.22, h: 0.05, splinters: 5 },   // 2026-09-27：下头抬到 0.8，让开压在顺子身上的塌顶木

  // ---------------------------------------------------------------- 洞口外前沟（SB03/03A/04/04A 的背景）
  // 北壁木框洞口立面：挖在北壁里的另一处掩蔽部口（纯装饰，门内黑），门洞 x 2.7–3.5（契约写 2.7–3.9，见下面 09-26 那段），另一口 x 4.9–5.5。
  // 立面立在北壁坡脚（x 3–5 坡脚 z≈-126.16…-126.20）略往北，板墙下沿埋进坡里 0.3–0.5 m：再往南就压到
  // 近爆时川军被摔向北壁的位置（comradeBlast (3.6,-125.85)，BlastSlamBuried 要北壁在他左手 0.55 m）与
  // 02 日兵乙的 ijaBWatch。死川军 (4.06,-125.88) 背靠两口之间的板墙。
  // 2026-09-26 集成（SB03 实拍红：川军的头被「常驻组 WoodBeam」挡住）：真实流程里他跪着往后靠，头在 (4.07,-126.29)、世界 y -0.855
  // ——比竖直板墙 (z -126.22) 还靠北 7 cm，正好顶在第一口东门柱（x 3.88–4.06）上。北壁坡面（游戏里的地面是 0.75 m 格的高度场，
  // 坡脚被抹缓：板墙底那条线上地面就比沟底高 0.35–0.48 m）往北倒约 27°，竖直立面的上半截悬在坡面前，人往墙上靠就靠进了板子里。
  // 改成离立面底 0.3 m 以上后仰 20°、顺着坡面（lean），头高处板面退到约 -126.39；第一口东沿收到 x 3.5（原 2.7–3.9），东门柱
  // （x 3.48–3.66）让开他的头和 SB03 / SB03A 看他的那两条视线（后仰 20° 时东门柱面在 x 3.99 以西才让得开 SB03 那条，SB03A 那条
  // 更紧，x 3.66 处还剩 2 cm）。挪完死川军（SB03A/SB04 头在 (3.79,-126.21)）正好在门右侧、头靠着门框（契约 SB03A「靠门框」、
  // SB04「门右侧」）。西头不动（x0 2.6：再往西压到 SB01 传令兵的路线）。仰角不超过 26°（坡面坡度），门内黑不会埋进坡面。
  // 立面按宿主的 groundAt（游戏高度场）落地，Script_OpeningSetTest 4b 用同一个高度场打射线。
  { id: "trenchFacadeN", kind: "facade", x0: 2.6, x1: 5.9, z: -126.22, heightM: 2.0, postM: 0.18, plankM: 0.22,
    lean: Object.freeze({ fromM: 0.3, deg: 20 }),
    openings: Object.freeze([Object.freeze({ x0: 2.7, x1: 3.5, h: 1.7 }), Object.freeze({ x0: 4.9, x1: 5.5, h: 1.45 })]) },
  // 沟底铺板：x 2→14、z≈-124.6、宽 0.6。跳过现有铺板 BunkerTrenchDuckboard45（中心 x 9.02，长 2.4）。
  // （2026-10-12 R4：西头从 x 2.2 收到 4.05：顺子右前方的汉阳造 rescue.rifleMouth 顺沟躺在 z -124.63、x 2.62–3.88 的泥里，
  // 原来的铺板正盖在它上面，N06 看不见枪。洞口外这 2 m 是塌土边的烂泥。）
  { id: "duckboardsFront", kind: "duckboards", width: 0.6, slatM: 0.11, gapM: 0.05, columns: 1,
    path: Path([4.05, -124.686], [7.7, -124.62]), path2: Path([10.3, -124.6], [13.6, -124.6]) },
  // 前沟两壁护壁：竖桩 + 横木，贴坡脚、向墙里斜。跳过现有围栏式护壁 BunkerTrenchRevetment45_±1（x 7.2–10.8）。
  // 北壁 x 2.6–5.9 是木框立面，护壁接在它东头。
  { id: "revetmentFront", kind: "revetment", heightM: 1.1, postEveryM: 1.15, logs: 3, leanDeg: 12,
    runs: Object.freeze([
      Object.freeze({ side: "north", path: Path([5.95, -126.16], [7.1, -126.22]) }),
      // 2026-10-11 重构：西头从 x 10.9 收到 12.25。dropIn.lip[1]（丁）在 x 11.5 从北沟沿跳下，落点 (11.5,-125.8) 半径 0.6 m 内
      // 不许有木撑（原来护壁离落点 0.48 m，Script_OpeningSetTest 6c）。
      Object.freeze({ side: "north", path: Path([12.25, -126.39], [13.4, -126.38]) }),
      Object.freeze({ side: "south", path: Path([5.2, -122.62], [7.1, -122.52]) }),
      Object.freeze({ side: "south", path: Path([10.9, -122.54], [12.9, -122.7]) }),
    ]) },
  // 南壁沙袋压顶 + 木桩（SB03 右侧纵深的沟沿）：沙袋摆在南沟沿（x 6–12 沟沿 z≈-121.9），
  // x 13–16 是纵深支沟岔口，留空；x 16.8–19.6 沟沿转向东北。
  { id: "sandbagStakesSouth", kind: "sandbagStakes", layers: 2, layerM: 0.17, depthM: 0.44, bagM: 0.52,
    stakeEveryM: 1.3, stakeAboveM: 0.45, stakeBelowM: 0.55,
    // 2026-10-11 重构：西头从 x 6.0 收到 8.4。x 6–8 那段南沟沿让给机枪垫尸（SET_MARKS.mg.corpseLower/Upper 叠在沟沿上，
    // 歪把子架在上面那具背上朝后沟打，契约 §1.7）：垫尸本来就是拿来当沙袋用的，两样叠在一起会穿。
    runs: Object.freeze([Path([8.4, -121.9], [12.3, -122.0]), Path([16.8, -122.72], [19.6, -123.3])]) },
  // 日军插在南沟沿上的旗（SB03 右沿、SB03A 右上、SB04 左远）：调研写 (10.5,-122.3)，那里是南壁半坡（地面 -1.13），
  // 挪到沟沿 z -121.8、插在沙袋中间。杆 2.8 m，旗面 0.7×0.46，程序化白底红日加脏污。
  // 旗往南飘（flyYawDeg 170）：SB03/03A 从洞口朝东看，旗面正对镜头、往画面右边展开；原来朝西（70°）从洞口看是一条边（实拍只见杆）。
  { id: "flagTrench", kind: "flag", faction: "nra", fallYawDeg: 35, x: 10.5, z: -121.8, poleM: 2.8, cloth: Object.freeze([0.7, 0.46]), flyYawDeg: 170 },
  // 北沟沿枯树（现成 Model_DeadTreeTrunkSet.glb）。
  { id: "deadTreeRim0", kind: "external", asset: "deadTreeTrunk01", x: 8.6, z: -127.7, yawDeg: 40, scale: 0.9 },
  { id: "deadTreeRim1", kind: "external", asset: "deadTreeTrunk02", x: 11.6, z: -128.25, yawDeg: -65, scale: 1.0 },
  { id: "deadTreeRim2", kind: "external", asset: "deadTreeTrunk01", x: 13.9, z: -127.65, yawDeg: 150, scale: 0.75 },
  // SB04 枪托位附近的断木板（契约 §2 第 5 条优先枪托位 (2.3,-124.4)）：三根躺在泥里，一头翘在土块上，
  // 仰拍时在画面左下框景（右上的断木由 fallenLintel 承担）。全部贴地（离地 < 0.16 m），拖人、踢枪都能踩过去。
  { id: "plankDebrisButt", kind: "planks", planks: Object.freeze([
    Object.freeze({ x: 1.95, z: -124.6, lift: 0.05, len: 1.2, w: 0.2, t: 0.05, yawDeg: 62, pitchDeg: 2, rollDeg: 8 }),
    // 2026-10-11 重构：南移 0.35 m（原 (2.8,-123.95)）。finish.bodies[0] (3.3,-124.55) 趴在铺板上，这块板的北头垫在它身下、把整具尸体
    // 撬起 6° 悬着（实拍 tmp/set/shots/Set_EyeEast_Clear）。
    Object.freeze({ x: 2.85, z: -123.6, lift: 0.05, len: 1.0, w: 0.18, t: 0.05, yawDeg: -24, pitchDeg: -3, rollDeg: -6 }),
    Object.freeze({ x: 2.15, z: -123.72, lift: 0.06, len: 0.9, w: 0.16, t: 0.04, yawDeg: 118, pitchDeg: 4, rollDeg: 12 }),
  ]) },

  // ---------------------------------------------------------------- 南南西直沟（02 救援圈，SB05/05A）
  // 沟底两列板条（每列 0.5 m），中线偏东 0.2 m。
  { id: "duckboardsSSW", kind: "duckboards", width: 0.5, slatM: 0.11, gapM: 0.05, columns: 2, columnGapM: 0.08,
    path: Object.freeze([SswPoint(0.6, 0.15), SswPoint(SSW_LEN, 0.2)]) },
  // 东壁（SB05 朝南看是画面左）圆木护壁，同款现有护壁；跳过现有 BunkerTrenchRevetment31_1（东壁 s≈4.4–8.0）。
  { id: "revetmentSSW", kind: "revetment", heightM: 1.05, postEveryM: 1.1, logs: 4, leanDeg: 10, round: true,
    runs: Object.freeze([
      Object.freeze({ side: "east", path: Object.freeze([SswPoint(3.1, 1.62), SswPoint(4.3, 2.22)]) }),
      Object.freeze({ side: "east", path: Object.freeze([SswPoint(8.1, 1.86), SswPoint(10.2, 1.94)]) }),
    ]) },
  // RC 外侧沟沿上的日本旗（SB05 远处）：杆 2.5 m。
  { id: "flagRC", kind: "flag", faction: "nra", x: -7, z: -109, poleM: 2.5, cloth: Object.freeze([0.62, 0.41]), flyYawDeg: 100 },

  // ---------------------------------------------------------------- 洞口塌土的外观（碰撞在 MISSION_SCENARIO）
  // 塌土体块是方盒；这里各盖一个压扁的土包把方盒包进去（SB03 右侧：峰高不超过 0.4 m）。
  // 南侧塌土：体块 BunkerMouthRubbleS 收成 0.6×0.5×0.25 m（中心 (1.35,-124.3)），给 02 救援圈 S' (0.60,-123.90)
  // 跪着的顺子留出身位，北边与洞口塌土之间留一条 0.7 m 的过道（拖人去还权位走这里，见测试的 SB06.dragCoverSet）。
  // 峰高 0.19（审查 09-25：0.35 的土包高过 SB03 眼高 0.26，在画面右下拱过地平线、占掉右下约 30%，沟的纵深与旗都被压住；
  // 分镜 03 右下是泥地和伸出的右手）。体块 BunkerMouthRubbleS 同步压到 0.12 m，土包要比眼睛低 7 cm 以上。
  // 体块四角处土厚仍盖得住体块顶（测试量）。
  { id: "rubbleMoundS", kind: "mound", show: "collapsed", x: 1.35, z: -124.33, rx: 0.8, rz: 0.6, peak: 0.19, bump: 0.1, sink: 0.01, seed: 11 },
  // 02 掩体 BunkerMouthSpoil（Space 体块，1.4 m 见方、碰撞与掩体标签不动）的外皮：SB05/05A 朝南看时它是画面左半一整块
  // 平的深褐方块（审查 09-25）。北面与西面（对着 SB05 镜头的两面）贴一层起伏的土皮（外鼓 ≤ 0.05 m），西面（SB05 画面左缘
  // 那条沟壁）再钉护壁木桩与两道横板（外伸 0.17 m），顶上压一层土：读成带护壁的沟壁。只是外观，贴着体块。
  // 北面不钉桩：日兵甲、翻译 SB05 站位本来就贴着它的北面，拖进遮挡的替代折线离北面 0.38 m。
  // 2026-09-27 救援圈挪到它南边的沟里后，南面与东面也入画（罗班长拖顺子翻过弹坑台阶时就在左手边），同样贴土皮，
  // 不再露出平的方块面。
  { id: "spoilEarthSkin", kind: "earthSkin", show: "collapsed", block: "BunkerMouthSpoil",
    box: Object.freeze({ x: 1.5, z: -122.6, w: 1.4, d: 1.4, h: 1.4 }), bulgeM: 0.05, seed: 31,
    faces: Object.freeze({
      north: Object.freeze({}), south: Object.freeze({}), east: Object.freeze({}),
      west: Object.freeze({ stakes: Object.freeze({ everyM: 0.45, aboveM: 0.12, w: 0.08 }), planks: Object.freeze([0.55, 1.05]) }),
    }) },
  // 还权坐位 (2.40,-125.20) 西侧的靠背（只是外观，不进碰撞：进了会挡住拖进遮挡与撤出的路线）。
  // 南北只伸到 z -125.6…-124.75，南边 SB04 枪托位 (2.3,-124.4) 躺人的地方空着。
  // **02 起才出现**（show:"rescue"）：它正好在 SB03/03A 眼位看审问组的视线上（眼 (0.35,-125.15) 高 0.26、
  // 坐位 (2.40,-125.20)、审问组 (4.1,-125.6) 几乎一条线），01 里摆着会把审问组腰以下全挡掉（实拍）。
  // 02 开场镜头朝南，这里在镜头背后，出现的那一下没人看得见。01/02 的界线按导演 phase 算（任务步骤在 Found
  // 前后就切到 BunkerRescue 了，见 Script_OpeningSet.RescueShown）。
  // 2026-09-26 集成：契约 v1.1 §8 第 1 条定了「坐位对 F 可见、由还权迟疑保护」，靠背不再承担遮 F，缩成一小堆
  // （原 rx 0.36 / rz 0.43 / 峰 0.48、中心 (1.85,-125.17)，正好横在洞口出口上）：洞口塌死以后，01 日兵甲回洞口
  // （foundRoute）、拖人出洞（dragOutRoute）、02 罗班长拖顺子上坐位（dragCoverRoute 从东边上来）、踢枪（枪从它南边
  // 滑过）都要从它旁边过，高过 0.3 m 的核只剩约 0.25 m 见方，放在坐位西北 0.2 m（靠背离坐位点 0.22 m）。
  { id: "rubbleMoundBack", kind: "mound", show: "rescue", x: 1.95, z: -125.3, rx: 0.23, rz: 0.23, peak: 0.36, seed: 23 },
]);

// ---------------------------------------------------------------------------
// 近爆的定向喷土（SB02，Script_OpeningBlastFx.DirectionalBlast）
// ---------------------------------------------------------------------------
// 炮弹落在洞口南侧外（导演 banter.shellAt，飞行 0.22 s）：泥土、土块、碎木从洞口南沿 (1.2,-124.5) 朝西北喷进洞里。
// SB02 镜像机位是眼 (-0.6,-125.95) 离地 0.75、朝东北东 yaw -66°、俯 13–14°、横滚 +15–17°：喷口在镜头右边约 65°、画面外
// （半水平视场约 48°）。两次教训（都是实拍）：
//  · 主轴**正对镜头**：整锥土沿同一方位角扑过来、一直贴在画框外（tmp/cap/step2/SB02_b030.png）；
//  · 主轴朝北壁、**往上抬 11°**（上一版 (-0.47,0.2,-0.86) 离地 0.5–1.5）：镜头往下俯 13°，画面上沿在镜头前 1.1 m 处只到
//    离地约 1.1 m，土块再加上抛全从画面上面飞过去了；背景又是洞口外暗色的北沟壁，深褐的土落在深褐的墙上，
//    真实流程 Blast 0.22/0.30/0.40 三帧里一点都看不见（审查 09-25，Review_Set/Rv_SB02.png）。
// 现在：喷口挪到南门柱内侧 (1.1,-124.7)、压低到离地 0.35–1.1 m、主轴放平并偏北（朝北壁，西 15°），土块与碎木从画面右沿
// 横穿进来（主轴越朝西＝越对着镜头，就越贴着画框外沿走，Script_OpeningSetTest 按弹道投影数过）；泥雾（sprayDir）偏西 22°、
// 扫过镜头前 1 m，镜头在泥雾锥的外沿；扬尘在门洞里先起一成多（dustLead）、往洞里推（dustAt/dustDir），
// 浅土色的扬尘垫在暗色沟壁前面，深色的土块从它前面飞过读得出来。判据在浏览器里量：Blast 0.30/0.40 s、强制睁眼时，画面右三分之一里被喷发粒子
// 盖住的像素比例（tmp 下的 Script 探针，报告附数）。0.22 s 起喷、0.9 s 止（契约 §5 SB02）。
export const BLAST = Object.freeze({
  id: "bunkerMouthSpray",
  at: P(1.1, -124.7), liftM: Object.freeze([0.35, 1.1]),
  dir: Object.freeze({ x: -0.25, y: 0.02, z: -0.97 }),
  sprayDir: Object.freeze({ x: -0.38, y: 0.0, z: -0.925 }),
  dustAt: P(1.15, -125.3, 0.7), dustHeightM: 0.45, dustLead: 0.35,
  dustDir: Object.freeze({ x: -0.95, y: 0.15, z: -0.2 }),
  /** 从近爆（blastAge 0 = 导演 Blast() 的那一帧）起算：炮弹 0.22 s 落地就喷。 */
  atS: 0.22, seconds: 0.68,
  // 2026-09-28（3A 迭代 B5）：泥浆（spray）改走 Script_Vfx 的泥浆池（沿速度拉伸、受光、软边），土块 / 木片 / 碎渣（grit）
  // 走不规则几何碎块池；加一溜贴着泥浆的细尘团（mist）。旧版的泥雾是烟团池里不透明的近黑圆盘，SB02 画面里读成一堆黑圆片。
  clods: 18, splinters: 14, grit: 50, dust: 30, spray: 110, mist: 24,
  spreadRad: 0.38,
  // 土块边长（米）与额外上抛（米/秒）：少抛，贴着画面右三分之一飞。边长上限 0.13：试过 0.22，离镜头 1 m 的土块读成一只只黑方箱。
  clodSize: Object.freeze([0.05, 0.13]),
  /** 碎渣边长、泥团半宽（米）；泥浆拖尾 = 瞬时速度 × shutterS（秒，约一帧半的运动模糊）。 */
  gritSize: Object.freeze([0.014, 0.034]), mudSize: Object.freeze([0.025, 0.065]), shutterS: 0.065,
  /** 扬尘峰值不透明度（旧版 0.62 + 浅砖粉色，Blast 帧右半一片发白）。 */
  dustOpacity: 0.55,
  upBoost: Object.freeze({ clods: Object.freeze([0.1, 0.7]), splinters: Object.freeze([0.2, 1.0]) }),
  // 速度（米/秒）：土块 5–10、碎木 6–12（更轻、飞得远）、碎渣 7–12、泥浆 8–13（一片扫过镜头前）、细尘团 3–6、扬尘 1.2–3.2（填满洞口）。
  speed: Object.freeze({ clods: Object.freeze([5, 10]), splinters: Object.freeze([6, 12]), grit: Object.freeze([7, 12]),
    spray: Object.freeze([8, 13]), mist: Object.freeze([3, 6]), dust: Object.freeze([1.2, 3.2]) }),
  // 前 0.18 s 喷出 70%，后面是拖尾（落土）。
  burst: Object.freeze({ headS: 0.18, headShare: 0.7 }),
  // 颜色（sRGB）：分镜 02 是棕色湿土、灰褐木屑、褐灰尘团；不要近黑（逆光读成黑剪影）也不要浅米黄（读成方糖 / 砖粉）。
  colors: Object.freeze({ mudWet: 0x4a3b2c, mudLight: 0x76624d, clodDark: 0x4a3c2f, clodDry: 0x6f5e4a, wood: 0x6a5846, woodDark: 0x3e342b,
    mist: 0x857460, dust: 0x9a876c, dustDense: 0x74644f }),
});

// ---------------------------------------------------------------------------
// 布景材质（2026-09-28 3A 迭代 B5）：掩蔽部与前沟的木料、弹药箱
// ---------------------------------------------------------------------------
// 分镜 01/02/03A/04A：灰褐风化旧木（开裂、泥污、边角磨圆），不是程序化 WoodBeam 那种橙黄新木；弹药箱是灰褐旧板箱。
// recipe 是按需材质集（Lovart 源图经 _import/Script_BakePbrTexture.py 烘成 Texture_Opening*{Base,Normal,Orm}.webp，
// 登记在 Data_TextureManifest），**不进开机清单**；材质库里还没有这一套（按需集没下完 / 纯 node / 编辑器预览）就用
// fallback 程序化配方并染 fallbackColor（把橙黄压成灰褐），套下来之后 Script_OpeningSet 把已建网格换过去。
// color 是新贴图上再乘的色（1 = 原样）。
export const SET_MATERIALS = Object.freeze({
  timber: Object.freeze({ recipe: "OpeningTimber", options: Object.freeze({ color: 0xd6d0c6 }),
    fallback: "WoodBeam", fallbackOptions: Object.freeze({ color: 0x8e8474 }) }),
  crate: Object.freeze({ recipe: "OpeningCrate", options: Object.freeze({ color: 0xe0dad0 }),
    fallback: "WoodCrate", fallbackOptions: Object.freeze({ color: 0x9d9486 }) }),
});

// ---------------------------------------------------------------------------
// 洞内环境光（2026-09-28 3A 迭代 B5）：镜头进了掩蔽部就把全场环境光压暗
// ---------------------------------------------------------------------------
// 实拍取证（Gap3A_After/B5/Probe）：01 洞里亮成跟洞外一样，**全是环境光**（天空 IBL + 全局 SH + AmbientLight）——关掉太阳
// 洞里几乎不变，关掉环境光洞里全黑、只剩洞口一块太阳与马灯。探针体 GI 默认关（开了也是 4 m 一格，分不出这个 4 m 的洞），
// 地形又不进 GI 代理盒，所以「土顶挡天光」这件事没有系统替我们算。这里是**布景级**手段：出画镜头（vfx.eye）在下面这只盒子里时，
// 把 scene.environmentIntensity、LightRig 的全局 SH 与 AmbientLight 按权重乘 ambientScale（洞口外 featherMouthM 米淡完，
// 其余三面 featherM 米），离开盒子原样还回去（谁中途改了基准——换天光 / GI 开关——就以它的新值为准）。
// 洞外的东西主要吃太阳直射，所以从洞里看出去洞口仍然亮（分镜 01「昏暗土洞、洞口外亮」）。
// 通用的室内压暗（按区域、按表面）归渲染侧（3A 迭代 B4），集成时这一条可以换成那套机制，数据留在这里。
// box：世界 x/z，top 是离洞底（FLOOR）的高（洞顶梁下沿约 2.1 m）。
export const INTERIOR = Object.freeze({
  box: Object.freeze({ x0: -3.4, x1: 1.0, z0: -128.2, z1: -123.8, top: 2.1 }),
  featherMouthM: 1.0, featherM: 0.3,
  // 2026-09-28 集成：B4 的室内遮蔽体（Data_FirstLevelInteriors「Bunker」，乘进 AO）同样压掩蔽部，两层叠起来 SB01 只剩 30（分镜 50）。
  // 通用机制归 B4，这里退成 1.0（不再额外压）；数据与入口保留，需要单独调掩蔽部时再动。
  ambientScale: 1.0,
});

// ---------------------------------------------------------------------------
// 远处的烟柱与火点：{id, stages, x, z, kind, scale, fire, why}
// ---------------------------------------------------------------------------
// `stages` 是任务步骤。scale 1 = 高约 27 m 的标准烟柱（SmokeOptions 换算成 vfx.SmokeSource 的参数），
// fire > 0 是地面火（不挂灯：都在 25 m 开外，点光照不到画面里的东西，白占灯预算）。
// 坐标是调研按分镜推的起点（Survey_A/B），逐镜在实拍里核对位置（报告里的并排图），调过的写了原因。
const OPENING_STEPS = Object.freeze(["Trapped", "BunkerRescue", "RearTrench"]);
export const SMOKE = Object.freeze([
  // 01–02：SB01 洞口外、SB03 审问组背后的天上、SB06 正前方远处（都在东边）。
  { id: "smokeEastNear", stages: OPENING_STEPS, x: 60, z: -112, kind: "black", scale: 1.0, fire: 0, why: "SB03 天空右侧的烟柱、SB06 远处" },
  // 调研起点 (85,-140) 在 SB03 眼位正前方 0°，正好被洞口北柱挡住（实拍 tmp/s3/cap01/SB03_s3.png 只看得见 (60,-112) 一股）；
  // 挪到柱子右边 5°、同样约 86 m 远：分镜 03 里那股贴着掩蔽部右沿、审问组头顶的烟。
  { id: "smokeEastMid", stages: OPENING_STEPS, x: 86, z: -132.6, kind: "black", scale: 1.25, fire: 0, why: "SB03 掩蔽部右沿、审问组头顶的大烟柱" },
  { id: "smokeEastFar", stages: OPENING_STEPS, x: 110, z: -120, kind: "black", scale: 1.1, fire: 0, why: "SB01/SB03 远处第三股" },
  { id: "smokeSB06North", stages: OPENING_STEPS, x: 60, z: -150, kind: "black", scale: 0.9, fire: 0, why: "SB06 正前方偏左" },
  { id: "smokeSB06Near", stages: OPENING_STEPS, x: 45, z: -135, kind: "black", scale: 0.8, fire: 0, why: "SB06 正前方中远（(70,-118) 那一股并进 smokeEastNear）" },
  { id: "fireSB06", stages: OPENING_STEPS, x: 32, z: -126, kind: "black", scale: 0.35, fire: 0.7, why: "SB06 中远一处火光" },
  // 02 SB05A：镜头朝南南西直沟看（yaw 184°），画面中偏左两股远烟。
  // 调研起点 (18,-45)/(−8,−40) 在 SB05/05A 眼位 (0.6,-123.9)（yaw 184°）的左 8° 与右 10°：左边那股被画面左半的洞口木壁挡住，
  // 只剩一股细烟（实拍 tmp/s3/cap01/SB05A_s3.png）。现在的镜头左半是洞壁，天只露在右半，两股都挪进这块天里：
  // 右 1°（75 m）与右 12°（90 m），近的那股放大。
  { id: "smokeSouthA", stages: Object.freeze(["BunkerRescue", "RearTrench"]), x: 4.5, z: -49, kind: "black", scale: 1.2, fire: 0, why: "SB05A 画面正中的大烟柱" },
  { id: "smokeSouthB", stages: Object.freeze(["BunkerRescue", "RearTrench"]), x: -11.9, z: -34.8, kind: "black", scale: 0.85, fire: 0, why: "SB05A 第二股" },
  // 03：SB07 正中那一大股（战车来路 Approach 附近）、SB08 远处的火点与烟柱。
  { id: "smokeFrontBig", stages: Object.freeze(["Support"]), x: 59.8, z: -167.4, kind: "black", scale: 1.6, fire: 0, why: "SB07 正中的大黑烟柱" },
  { id: "smokeFrontWest", stages: Object.freeze(["Support"]), x: -35, z: -190, kind: "black", scale: 1.0, fire: 0, why: "SB08 远处左" },
  { id: "smokeFrontNorth", stages: Object.freeze(["Support"]), x: 40, z: -195, kind: "black", scale: 1.1, fire: 0, why: "SB08 远处右（SB07 左远）" },
  { id: "fireFrontA", stages: Object.freeze(["Support"]), x: -20, z: -175, kind: "black", scale: 0.3, fire: 0.8, why: "SB08 弹坑区火点" },
  { id: "fireFrontB", stages: Object.freeze(["Support"]), x: 5, z: -182, kind: "black", scale: 0.3, fire: 0.7, why: "SB08 弹坑区火点" },
  { id: "fireFrontC", stages: Object.freeze(["Support"]), x: 30, z: -178, kind: "black", scale: 0.3, fire: 0.75, why: "SB08 弹坑区火点" },
].map(Object.freeze));
/** 一行烟表换成 vfx.SmokeSource 的参数（纯数学，Script_OpeningSet 与测试共用）。 */
export function SmokeOptions(row) {
  const s = row.scale;
  return {
    kind: row.kind, rate: +(3.2 * Math.sqrt(s)).toFixed(2), radius: +(0.8 * s).toFixed(2), rise: +(3.0 * s).toFixed(2),
    sizeStart: +(0.9 * s).toFixed(2), sizeEnd: +(7.0 * s).toFixed(2), life: +(9 * Math.pow(s, 0.3)).toFixed(2),
    opacity: 0.3, growthPower: 0.9, turbulence: 0.3,
    fire: row.fire || 0, fireShape: "ground", light: false,
  };
}
/**
 * 每一步同时在冒的烟团设计上限（rate × life 之和，按 spawnScale 1 算）。
 * 真正的池子随画质档与战场规模变：vfx 的持续烟池 sourceSmoke = maxParticles(规模 small 2200 / medium 3400 / large 4200)
 * × 画质 budget(low 0.35 / medium 0.65 / high、ultra 1.0) × 0.08，环形缓冲，满了就挤掉最老的（烟柱从顶上断、
 * 别的烟源的烟团也被挤掉）；而烟源的 rate 还要乘画质的 spawnScale（low 0.45 … ultra 1.25）。
 * 所以运行时按 SmokeShare 把本表的 rate 统一压到「只占池子 SMOKE_POOL_SHARE」以内（审查 09-25：原来只按 high/4000 算，
 * ultra 档余量不到一半、small 规模直接超池）。
 */
export const SMOKE_PARTICLE_BUDGET = 220;
/** 本表的烟最多占持续烟池的这么多，余下留给战车尘土、机枪热烟、燃烧物。 */
export const SMOKE_POOL_SHARE = 0.65;
/** 一步的烟源在当前画质下要乘的 rate 系数（≤ 1）：rows 是这一步挂着的烟表行，capacity 是 sourceSmoke 池容量（没有就不压）。 */
export function SmokeShare(rows, spawnScale = 1, capacity = null) {
  const live = rows.reduce((sum, row) => { const o = SmokeOptions(row); return sum + o.rate * o.life; }, 0) * spawnScale;
  if (!(capacity > 0) || live <= 0) return 1;
  return Math.min(1, SMOKE_POOL_SHARE * capacity / live);
}

// ---------------------------------------------------------------------------
// 03 开头两架日机横飞（SB07 天上两架飞机），aircraft.SetManualPose
// ---------------------------------------------------------------------------
// 触发：03（Support）里玩家走到「贴这道墙！」那一处 (5,-143) 8 m 内，或进 03 满 fallbackS 秒（选章/绕路也看得到）。
// 航线是一条直线：中点 C 在触发点朝 yaw -56°（SB07 默认视线 -50° 略偏右）方向 360 m、离地 110 m
// （仰角约 17°，玩家视场 55° 下在画面上部 y≈0.2；调研写「250 m 外、高 120 m」会贴着画面上沿）。
// 飞行方向垂直于视线、往画面右边飞（朝南南东：往滕县城去）。时刻 0 在中点前 passS 秒。
const FLY_BEARING = -56 * Math.PI / 180, FLY_GROUND_M = 360;
const FLY_C = Object.freeze({ x: +(5 - Math.sin(FLY_BEARING) * FLY_GROUND_M).toFixed(1), z: +(-143 - Math.cos(FLY_BEARING) * FLY_GROUND_M).toFixed(1) });
const FLY_DIR = Object.freeze({ x: +Math.cos(FLY_BEARING).toFixed(4), z: +(-Math.sin(FLY_BEARING)).toFixed(4) });
export const FLYOVER = Object.freeze([
  { id: "flyoverLead", aircraft: "MitsubishiKi21Ia", stage: "Support", centre: FLY_C, altitudeM: 110, dir: FLY_DIR,
    speedMps: 62, passS: 5, seconds: 13, delayS: 0, bank: 0.04 },
  // 僚机：左后 45 m、高 12 m、晚 0.6 s。
  { id: "flyoverWing", aircraft: "MitsubishiKi30", stage: "Support",
    centre: Object.freeze({ x: +(FLY_C.x - FLY_DIR.z * 45 - FLY_DIR.x * 30).toFixed(1), z: +(FLY_C.z + FLY_DIR.x * 45 - FLY_DIR.z * 30).toFixed(1) }),
    altitudeM: 122, dir: FLY_DIR, speedMps: 62, passS: 5, seconds: 13, delayS: 0.6, bank: -0.03 },
].map(Object.freeze));
export const FLYOVER_TRIGGER = Object.freeze({ stage: "Support", at: P(5, -143), radiusM: 8, fallbackS: 22 });
/** 航线在第 t 秒（从触发起算）的姿态（`AircraftFlight.SetManualPose` 的 pose）；航线外返回 null。 */
export function FlyoverPose(row, t) {
  const u = t - row.delayS;
  if (u < 0 || u > row.seconds) return null;
  const along = (u - row.passS) * row.speedMps;
  return { x: row.centre.x + row.dir.x * along, y: row.altitudeM, z: row.centre.z + row.dir.z * along,
    dirX: row.dir.x, dirZ: row.dir.z, climb: 0, bank: row.bank };
}

// ---------------------------------------------------------------------------
// 01–03 阴天开关（契约 §2 第 15 条；默认关，本轮验收按关着算）
// ---------------------------------------------------------------------------
// 开时 01–03 套一档「阴天、灰褐、低饱和」的天光：以 Script_Sky 的 overcast 预设为底，**雾照抄本关自己的天**
// （本关 testSceneDay 没有雾；用户 09 月定了「先别动雾」），再压饱和、把地面反光与太阳色往褐里拉。
// 离开 01–03 还原本关天光。页面地址加 `?openingOvercast=1` 临时打开（给用户 A/B 看）。
export const sky = Object.freeze({
  overcast: false,
  preset: "openingOvercast0103", base: "overcast", fogFrom: "testSceneDay",
  // 实拍四档比过（tmp/s3/sky1、sky2，SB07 贴墙处）：Script_Sky 原样的 overcast 曝光 0.88 + 泛光 0.34 + Mie 18，整张画面发白、
  // 远处一片奶白（比晴天还亮，分镜是暗灰）；压曝光、天顶与地平线压成暗灰、Mie 降到 6 以后最接近分镜 07 的灰天。
  tweaks: Object.freeze({ saturation: 0.68, contrast: 1.05, sunColor: Object.freeze([1.0, 0.95, 0.86]), sunIntensity: 4,
    hemiSky: 0xb0b2b0, hemiGround: 0x5a4c3c, hemiIntensity: 1.0, ground: Object.freeze([0.52, 0.45, 0.36]), smokeColor: Object.freeze([2.0, 1.9, 1.78]),
    exposure: 0.46, bloom: 0.05, envIntensity: 0.85, smoke: 0.35,
    zenith: Object.freeze([0.5, 0.5, 0.51]), horizon: Object.freeze([0.7, 0.67, 0.62]),
    atmosphere: Object.freeze({ mie: 6.0, mieG: 0.62, rayleigh: 2.0, groundAlbedo: 0.2, sunIrradiance: 26,
      skyTint: Object.freeze([0.97, 0.97, 0.99]), skyFloor: Object.freeze([0.18, 0.2, 0.26]), aerialBlend: 0.35, aerialGain: 0.08, artGlow: 0.15 }) }),
});

// ---------------------------------------------------------------------------
// 03 前沿布景（SB07/SB08）：右侧阵位的破砖墙外观、缺口东沿的倒墙、缺口段护壁、阵位弹药箱
// ---------------------------------------------------------------------------
// 能被战车打塌的三段（Data_FirstLevelFrontBreakables：RightNestWestLow / NorthLow / NorthHigh）每一级各建一份砖壳，
// 跟着 Script_FirstLevelFrontBreakables 的当前级显示（打低一级，砖壳也矮一级），不会出现「墙已经塌了、砖还立着」。
// 这一组是阵位与缺口的**世界外观**，03 之后 04（守机枪）、05（战车）、06（撤收）玩家还在这里打，
// 所以装到 FRONT_SET_STAGES 结束才收走（不跟 01–03 的布景一起收）。这是契约 §4.5/§6「01–03 之外全部收走」的**例外**，
// 报告里提请集成负责人改契约。01 进场时就建好、藏着（02→03 那一帧不现建），03 起显示。
// 全是外观：阵位白盒体块（Data_FirstLevelMissionLayout 的 RightNest*）的碰撞、掩体标签、射界一个不动，
// 砖壳把体块整个包进去（每面外扩 3 cm、墙头只往上长）——所以砖壳露出来的只会比碰撞高，不会有「看着是缺口、
// 其实是墙」的隐形墙；多出来的墙头锯齿只有外观（AI 视线、弹道仍按原体块）。
export const FRONT_SET_STAGES = Object.freeze(["Support", "MachineGun", "Tank", "Orders"]);
/** 砖层高（一皮砖 + 灰缝）与砖长：锯齿墙头按整皮、整砖退台；skinM 是砖壳比体块每面外扩多少。 */
export const BRICK = Object.freeze({ courseM: 0.115, lengthM: 0.25, skinM: 0.03,
  // 砖面：城墙砖（灰砖、浅灰缝，平均亮度 119；熏黑旧砖 BrickWallSooty 91 太黑：SB07 实拍整面墙是一块黑剪影），
  // 染成土黄灰（概念图 04 的残墙是灰里带黄的旧砖，不是红砖）。材质库缺这个配方就抛错，不退回纯色。
  recipe: "CityWallBrickPbr", color: 0xeedcbc });
const Peak = (s, h, w) => Object.freeze({ s, h, w });
export const FRONT_PROPS = Object.freeze([
  // 西矮墙（机枪就架在它后面）：机枪那一段（z -154.9…-152.9）墙头不加高，做成破口；两头往上各长两皮碎砖。
  // 只长 0.23 m：守机枪时（04）坐位眼高约 1.77 m、离墙 1.9 m，墙头要低于约 1.7 m 才不挡 30 m 外的人。
  { id: "nestBrickWallWestLow", kind: "brickShell", block: "RightNestWestLow", extraM: 0.23,
    peaks: Object.freeze([Peak(0.05, 1, 0.22), Peak(0.93, 0.8, 0.2)]), breach: Object.freeze({ from: -154.9, to: -152.9 }), seed: 1 },
  // 西高墙（SB07 右侧那一堵高大的残墙）：北头高耸、往南退台跌下来。
  { id: "nestBrickWallWestHigh", kind: "brickShell", block: "RightNestWestHigh", extraM: 0.9,
    peaks: Object.freeze([Peak(0.22, 1, 0.35), Peak(0.8, 0.45, 0.25)]), seed: 2 },
  { id: "nestBrickWallNorthLow", kind: "brickShell", block: "RightNestNorthLow", extraM: 0.12,
    peaks: Object.freeze([Peak(0.1, 1, 0.12), Peak(0.55, 0.9, 0.08), Peak(0.97, 1, 0.1)]), seed: 3 },
  { id: "nestBrickWallNorthHigh", kind: "brickShell", block: "RightNestNorthHigh", extraM: 0.55,
    peaks: Object.freeze([Peak(0.75, 1, 0.4)]), seed: 4 },
  { id: "nestBrickWallEastGable", kind: "brickShell", block: "RightNestEastGable", extraM: 0.35,
    peaks: Object.freeze([Peak(0.12, 1, 0.2), Peak(0.88, 0.8, 0.2)]), seed: 5 },
  { id: "nestBrickWallGablePeak", kind: "brickShell", block: "RightNestGablePeak", extraM: 0.45,
    peaks: Object.freeze([Peak(0.5, 1, 0.3)]), seed: 6 },
  { id: "nestBrickWallRearWest", kind: "brickShell", block: "RightNestRearWest", extraM: 0.8,
    peaks: Object.freeze([Peak(0.1, 0.7, 0.3), Peak(0.62, 1, 0.3)]), seed: 7 },
  { id: "nestBrickWallRearEast", kind: "brickShell", block: "RightNestRearEast", extraM: 0.6,
    peaks: Object.freeze([Peak(0.3, 1, 0.35), Peak(0.9, 0.6, 0.15)]), seed: 8 },
  // 阵位里另外三块蓝白盒（SB07 画面正中、从西边看阵位的近景里还露着蓝）：入口的弹药箱位、阵位中间的碎砖堆、
  // 进阵位那条接近沟里的横墙（斜着，ry 0.72）。只长一点锯齿。机枪托架 RightNestFrontRest 已经换成沙袋（任务工事），不包。
  { id: "nestBrickEntry", kind: "brickShell", block: "RightEntryCrate", extraM: 0.15,
    peaks: Object.freeze([Peak(0.3, 1, 0.45)]), seed: 10 },
  { id: "nestBrickRubble", kind: "brickShell", block: "RightNestRubble", extraM: 0.12,
    peaks: Object.freeze([Peak(0.6, 1, 0.5)]), seed: 11 },
  { id: "nestBrickTraverse", kind: "brickShell", block: "RightApproachTraverse", extraM: 0.3,
    peaks: Object.freeze([Peak(0.2, 1, 0.3), Peak(0.78, 0.6, 0.22)]), seed: 12 },
  // 阵位东边那道残墙（05 日军从它后面上来，永不破坏）：SB07 画面右沿露出一角蓝。
  { id: "nestBrickAttackRuin", kind: "brickShell", block: "AttackRuinA", extraM: 0.5,
    peaks: Object.freeze([Peak(0.15, 1, 0.3), Peak(0.7, 0.55, 0.3)]), seed: 13 },
  // 缺口东沿的倒墙（SB08 从阵位看在画面左侧、一路伸向远处）。沟东沿坡顶 x≈-5.9（z -150…-141 沟底 -1.2、沟沿 -0.2）。
  // **大半截是倒的**：从阵位看，缺口段沟深只有 1.1–1.2 m，守军在沟里只露头肩；东沿上立一道 1.2 m 的墙就把他们
  // 全挡了（SB08 要「≥ 3 人同时可见」）。所以北段只剩墙根两三皮（≤ 0.42 m）加倒在东边地上的墙片，
  // 南头 s ≥ 6.4 m（z > -143.8）才立着 1.2–2.0 m 的残墙（守军在那儿已经转向西走进岔口）。profile 是 [沿线米数, 离地高]。
  { id: "gapWallCollapsed", kind: "collapsedWall", a: P(-5.95, -150.2), b: P(-5.95, -141.0), thickM: 0.37,
    profile: Object.freeze([[0, 0.34], [0.8, 0.42], [1.6, 0.22], [3.2, 0.3], [4.6, 0.26], [6.0, 0.4], [6.8, 1.2], [7.6, 1.65], [8.4, 2.0], [9.2, 1.55]]),
    // 倒在东边地上的墙片（顶面离地 0.3–0.4 m）只放在南段 s ≥ 5（z > -145.3）与立着的残墙脚下：2026-09-26 集成，SB08 实拍红
    // （第一批过缺口只数得出 1 人）——原来三片在 s 1.2 / 3.6 / 5.4，头一片正好横在机位看缺口浅段（z -152…-148，沟底抬到
    // 约 -0.7）那几条视线的下沿、第二片横在后面深段的视线下沿，缺口里的人只剩头顶（Script_OpeningSetTest 5e 的真几何射线）。
    // 机位看缺口的视线在这一带只比地面高 0.1–0.3 m，墙片放不下；s ≥ 5 以南的视线本来就被 s 6.8 起立着的残墙挡住。
    fallen: Object.freeze([
      Object.freeze({ s: 5.1, off: 1.0, len: 1.3, w: 0.8, tiltDeg: 12, yawDeg: 10 }),
      Object.freeze({ s: 6.2, off: 1.15, len: 1.4, w: 1.0, tiltDeg: 8, yawDeg: -6 }),
      Object.freeze({ s: 7.6, off: 1.0, len: 1.2, w: 0.8, tiltDeg: 16, yawDeg: 12 }),
    ]),
    // 同一个原因：缺口浅段那几米（s 0…4.8）东侧的墙根碎砖收在墙根 0.6 m 以内——再往外是平地，视线只高出地面 5–10 cm。
    rubbleClear: Object.freeze({ fromS: 0, toS: 4.8, maxOffM: 0.6 }), seed: 9 },
  // 缺口段的护壁（SB08 中间那段沙袋压顶的木板护壁）：沟两壁补木板护壁（跳过现有 GuardWithdrawalRevetment*），
  // 沙袋只压在**西沿**（远离阵位那一侧，压在东沿会挡阵位看沟里的人）。
  { id: "gapRevetment", kind: "revetment", heightM: 1.0, postEveryM: 1.0, logs: 5, leanDeg: 8,
    runs: Object.freeze([
      Object.freeze({ side: "west", path: Path([-9.95, -148.35], [-9.95, -147.25]) }),
      Object.freeze({ side: "west", path: Path([-9.95, -143.6], [-10.05, -141.6]) }),
      // 东壁缺口浅段那一段压到 0.6 m（2026-09-26 集成）：桩脚在沟壁半坡（地面 -0.75…-0.9），1.0 m 高的桩顶冒出东沿 0.3–0.4 m，
      // 正好横在机位看缺口里的人的视线下沿（SB08，Script_OpeningSetTest 5e 真几何）；0.6 m 桩顶齐东沿。
      Object.freeze({ side: "east", heightM: 0.6, path: Path([-6.1, -149.9], [-6.05, -147.35]) }),
      Object.freeze({ side: "east", path: Path([-6.05, -143.6], [-6.1, -142.2]) }),
    ]) },
  { id: "gapSandbagsWest", kind: "sandbagStakes", layers: 2, layerM: 0.17, depthM: 0.44, bagM: 0.52, inward: "east",
    stakeEveryM: 1.4, stakeAboveM: 0.4, stakeBelowM: 0.5,
    runs: Object.freeze([Path([-10.75, -151.2], [-10.75, -147.0]), Path([-10.8, -146.2], [-10.9, -142.2])]) },
  // 夺下的机枪旁两个弹药箱（SB08 左前景）：机枪托架 RightNestFrontRest 南边、坐位踏板 MachineGunFiringStep 西边。
  { id: "nestAmmoBoxes", kind: "crateStack", x: 25.1, z: -154.8, yawDeg: 12,
    layers: Object.freeze([Object.freeze({ w: 0.45, h: 0.3, d: 0.3 }), Object.freeze({ w: 0.45, h: 0.28, d: 0.3, dx: 0.02, dyawDeg: -9 })]) },
]);

/**
 * 这些道具与导演的站位**有意接触**：是分镜要的，不算压人。键是道具 id，值是
 * Data_OpeningStoryboards 里被豁免的标记路径（`shunzi.trap` 这种写法）及原因。
 */
export const DESIGNED_CONTACTS = Object.freeze({
  // 2026-10-11 集成：rescue.fallenComrade 改成实测落点（ChargeB 中弹后受击方向死亡倒在洞口南侧的弃土坡上），是尸体落点不是站位。
  spoilEarthSkin: Object.freeze({ marks: Object.freeze(["rescue.fallenComrade"]),
    why: "ChargeB 中弹滚下台阶，实测倒在洞口外弃土上（02 集成实跑 fall:ChargeB (1.28,-123.62)）：人本来就躺在土堆上" }),
  fallenLintel: Object.freeze({ marks: Object.freeze(["shunzi.trap", "shunzi.pinnedHips", "SB02.trap", "SB03.eye", "SB03A.eye"]),
    why: "塌下的门楣就落在压着顺子的塌顶木北头上（2026-09-27：他趴在洞口正中，门楣斜在他腰胯上方 1 m 以上）" }),
  roofTimberDown: Object.freeze({ marks: Object.freeze(["shunzi.trap", "shunzi.pinnedHips", "SB02.trap", "SB03.eye", "SB03A.eye"]),
    why: "2026-09-27：塌顶木就压在顺子的胯上（「主角变成压在房梁下，半个身子在外面」），02 何有田把它抬起来、罗班长把人拖出来" }),
  rubbleMoundBack: Object.freeze({ marks: Object.freeze(["shunzi.cover", "shunzi.trap", "shunzi.witnessEye", "SB06.seat", "SB06.dragCoverSet", "withdraw.playerSet"]),
    why: "SB06：顺子坐着背靠塌土；它只在他被拖出来、坐上坐位（导演 Check）以后出现，压着的时候他的胸口在这块地上（RescueShown）" }),
  bunkerCrateStackN: Object.freeze({ marks: Object.freeze(["SB01.yaowa"]), why: "SB01：幺娃靠着北壁坐，身后就是弹药箱" }),
  // （2026-10-12 R4：汉阳造 rescue.rifleMouth 从眼位左前（北壁板墙脚下）挪到右前方沟底，不再挨着这面板墙，豁免撤掉；净空见 SetTest 6d2。）
  trenchFacadeN: Object.freeze({ marks: Object.freeze(["SB03.captive", "SB03A.captive", "banter.comradeBlast"]),
    why: "SB03/03A：死川军背靠门框边的板墙；近爆时他就是被摔在这面北壁上（BlastSlamBuried）" }),
});

export const OPENING_SET = Object.freeze({ version: "20260928OpeningSetV3", stages: SET_STAGES, PROPS, BLAST, SMOKE, FLYOVER, FLYOVER_TRIGGER, sky,
  frontStages: FRONT_SET_STAGES, FRONT_PROPS, DESIGNED_CONTACTS, SET_MATERIALS, INTERIOR });

// ---------------------------------------------------------------------------
// 占地（纯数学，Script_OpeningSet 与测试共用）：每件道具拆成若干只朝向盒
// {x, z, w, d, ry, y0, y1}（y 是离参考地面的高度；ry 让盒子局部 +z 转到 three 的世界方向），
// walkable=true 的是踩在脚下的（铺板、平躺的板子）。
// ---------------------------------------------------------------------------
const DEG = Math.PI / 180;
const Seg = (a, b, width, y0, y1, extra = {}) => {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: width, d: len, ry: Math.atan2(b.x - a.x, b.z - a.z), y0, y1, ...extra };
};
const Polyline = (path) => path.slice(1).map((b, i) => [path[i], b]);

/** 一件道具的占地盒（离参考地面）。 */
export function PropFootprints(prop) {
  switch (prop.kind) {
    case "sandbagWall": return [Seg(prop.a, prop.b, prop.depthM, 0, prop.layers * prop.layerM)];
    case "poster": { const b = prop.board; return [Seg(P(b.x0, b.z), P(b.x1, b.z), 0.08, b.lift0, b.lift1)]; }
    case "lantern": return [{ x: prop.x, z: prop.z, w: 0.2, d: 0.2, ry: 0, y0: prop.lift - 0.2, y1: prop.lift + 0.14 }];
    case "crateStack": {
      const top = prop.layers.reduce((sum, layer) => sum + layer.h, 0), l = prop.layers[0];
      return [{ x: prop.x, z: prop.z, w: l.w, d: l.d, ry: (prop.yawDeg || 0) * DEG, y0: 0, y1: top }];
    }
    case "fallingTimber": {
      // 落定后的南段（斜的，测试按线段插值高度）+ 留在北柱顶的北段。
      const i = prop.intact;
      return [Seg(prop.pivot, prop.rest, i.w, Math.min(prop.pivot.lift, prop.rest.lift) - i.h / 2, Math.max(prop.pivot.lift, prop.rest.lift) + i.h / 2,
        { sloped: { a: prop.pivot, b: prop.rest, half: i.h / 2 } }),
      Seg(P(i.x, i.z - i.d / 2), P(i.x, prop.breakZ), i.w, i.lift - i.h / 2, i.lift + i.h / 2)];
    }
    case "timber": return [Seg(prop.a, prop.b, prop.w, Math.min(prop.a.lift, prop.b.lift) - prop.h / 2, Math.max(prop.a.lift, prop.b.lift) + prop.h / 2,
        { sloped: { a: prop.a, b: prop.b, half: prop.h / 2 } }),
      ...(prop.supports || []).map((s) => ({ x: s.x, z: s.z, w: s.w, d: s.d, ry: 0, y0: 0, y1: s.h }))];
    case "facade": return [Seg(P(prop.x0, prop.z), P(prop.x1, prop.z), 0.2, 0, prop.heightM)];
    case "duckboards": {
      const width = prop.columns > 1 ? prop.columns * prop.width + (prop.columns - 1) * (prop.columnGapM || 0) : prop.width;
      return [...Polyline(prop.path), ...(prop.path2 ? Polyline(prop.path2) : [])].map(([a, b]) => Seg(a, b, width, 0, 0.08, { walkable: true }));
    }
    case "revetment": return prop.runs.flatMap((run) => Polyline(run.path).map(([a, b]) => Seg(a, b, 0.24, 0, run.heightM ?? prop.heightM)));
    case "sandbagStakes": return prop.runs.flatMap((run) => Polyline(run).map(([a, b]) =>
      Seg(a, b, prop.depthM, -prop.stakeBelowM, Math.max(prop.layers * prop.layerM, prop.stakeAboveM))));
    case "flag": return [{ x: prop.x, z: prop.z, w: 0.12, d: 0.12, ry: 0, y0: 0, y1: prop.poleM }];
    case "external": return [{ x: prop.x, z: prop.z, w: 0.6 * prop.scale, d: 0.6 * prop.scale, ry: 0, y0: 0, y1: 5 }];
    case "planks": return prop.planks.map((p) => {
      const rise = Math.abs(Math.sin((p.pitchDeg || 0) * DEG)) * p.len / 2;
      return { x: p.x, z: p.z, w: p.w, d: p.len * Math.cos((p.pitchDeg || 0) * DEG), ry: (p.yawDeg || 0) * DEG,
        y0: p.lift - rise - p.t, y1: p.lift + rise + p.t, walkable: p.lift + rise < 0.16 };
    });
    case "brickShell": return [];     // 外观：碰撞就是它包着的那块阵位体块（Data_FirstLevelMissionLayout）
    case "collapsedWall": {
      // 立着的那几段（按 profile 折线逐 0.5 m 取最高）：倒墙片与碎砖贴地（< 0.3 m）不算占地。
      const len = Math.hypot(prop.b.x - prop.a.x, prop.b.z - prop.a.z), out = [];
      for (let s = 0; s < len - 1e-6; s += 0.5) {
        const e = Math.min(len, s + 0.5), h = Math.max(ProfileAt(prop.profile, s), ProfileAt(prop.profile, e));
        const t0 = s / len, t1 = e / len;
        out.push(Seg(P(prop.a.x + (prop.b.x - prop.a.x) * t0, prop.a.z + (prop.b.z - prop.a.z) * t0),
          P(prop.a.x + (prop.b.x - prop.a.x) * t1, prop.a.z + (prop.b.z - prop.a.z) * t1), prop.thickM, 0, h));
      }
      return out;
    }
    case "earthSkin": {
      // 每面外长：土皮外鼓；钉了桩与横板的那面再加桩径与板厚。没贴的面不长。
      const b = prop.box, G = (side) => { const f = prop.faces[side]; return !f ? 0 : prop.bulgeM + (f.stakes ? f.stakes.w + 0.04 : 0); };
      const x0 = b.x - b.w / 2 - G("west"), x1 = b.x + b.w / 2 + G("east"), z0 = b.z - b.d / 2 - G("north"), z1 = b.z + b.d / 2 + G("south");
      return [{ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, ry: 0, y0: 0, y1: b.h + 0.2, block: b }];
    }
    case "mound": {
      // 土包是个压扁的半椭球：只算高过 0.3 m（膝下）的那一圈核，边上一圈薄土人能踩过去。
      const core = Math.sqrt(Math.max(0, 1 - (0.3 / prop.peak) ** 2));
      return [{ x: prop.x, z: prop.z, w: Math.max(0.05, prop.rx * 2 * core), d: Math.max(0.05, prop.rz * 2 * core), ry: 0, y0: 0, y1: prop.peak, ellipse: true }];
    }
    default: throw new Error(`OpeningSet: unknown prop kind ${prop.kind} (${prop.id})`);
  }
}

/** collapsedWall 的墙高折线在沿线 s 米处的高度（线性插值）。 */
export function ProfileAt(profile, s) {
  if (s <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    const [s1, h1] = profile[i];
    if (s <= s1) { const [s0, h0] = profile[i - 1]; return h0 + (h1 - h0) * (s - s0) / Math.max(1e-6, s1 - s0); }
  }
  return profile[profile.length - 1][1];
}

// ===========================================================================
// 2026-10-11 开场重构（契约 docs/Data_OpeningRedraft20261011Contract.md §5，Set 包）
// ===========================================================================
// 标记名按契约 §5.3 冻结（Dir 包读）；数值从契约起点出发，按共享地面采样（游戏高度场 P012，0.75 m 格）与沟壁实测调过，
// 调过的每一处在旁边写了原因。测试：Script_OpeningSetTest 第 6 节。
//
// 尸体与新道具只活在 01–02（Trapped / BunkerRescue / RearTrench），进 03（Support）或离开 01–03 全部收走；
// 和上面 01–03 布景（PROPS）各自一套生命周期（Script_OpeningSet.EnterRedraft / ExitRedraft）。
export const REDRAFT_STAGES = Object.freeze(["Trapped", "BunkerRescue", "RearTrench"]);
/** 新增道具与尸体的三角形上限（契约任务书：≤ 60k，不加新采样器）。按实际建出来的几何算（测试与 Stats().redraft.triangles）。 */
export const REDRAFT_TRIANGLE_BUDGET = 60000;
/**
 * 冬瓜跪位 R3（拔出后按跪在北壁坡上的点，docs/Data_OpeningComradeKneelBank20260927.md：ComradeWallRoot 由拖出末帧与撑墙首帧
 * 链出，不是数据标记，这里抄实测值）。practice.recruitBack 按它算。
 */
export const COMRADE_KNEEL = P(4.057, -125.785);

/**
 * 战场尸体的姿势原型（MissionAftermath 已经开机烘好的那几具，Script_FirstLevelMissionAftermath.BakeMissionBody；
 * 原型键 `nra<pose>`）。实测（tmp/set/probe_map.mjs，2026-10-11）：pose 0 / 1 是趴着（背朝上、看得见背上的交叉背带），
 * yaw 0 时头朝 -Z（北），左臂横伸出去（局部 -x）；pose 2 / 3 仰面、头朝 +Z。所以这里只用 0 / 1，`headYawDeg` 就是 yaw。
 * box = 局部包围盒 [x0, x1, z0, z1]（米，yaw 0；含横伸的左臂），heightM = 背高；triangles = 第 0 / 1 档三角形数（5 cm 合点）。
 */
export const BODY_POSES = Object.freeze({
  nra0: Object.freeze({ side: "nra", pose: 0, box: Object.freeze([-0.60, 0.61, -0.87, 0.85]), heightM: 0.37, triangles: Object.freeze([9917, 2179]) }),
  nra1: Object.freeze({ side: "nra", pose: 1, box: Object.freeze([-0.53, 0.51, -0.83, 0.80]), heightM: 0.37, triangles: Object.freeze([9917, 2165]) }),
});
const Body = (x, z, headYawDeg, extra = {}) => Object.freeze({ x, z, headYawDeg, ...extra });

/**
 * 契约 §5.3 的标记（Dir 读）。尸体标记带 `pose`（BODY_POSES 的键）与 `headYawDeg`（头指向：three 的 yaw，0 北、+90 西）。
 */
export const SET_MARKS = Object.freeze({
  sweep: Object.freeze({
    // 乙（ijaB）从 J 往西沿沟底扎尸报数的第 7、8、9 具。契约起点 (11.8,-124.9) (9.9,-124.3) 在沟底正中，正压在乙进来的 walkIn
    // （z≈-124.7）与翻译进来的 interpreterEnter（从北半斜穿到南半）上；尸体连横伸的胳膊有 1.0–1.2 m 宽，只能挪到沟底南半、
    // 头朝西、胳膊伸向南壁脚：离两条路线 ≥ 0.5 m（乙从旁边 0.6–1.1 m 处下刀，刺刀够得着）。
    // [0] 东移 0.5 m：南壁脚 x 10.9 起原有一段前沟护壁，收到 12.25 以东也压不下一具人，就挪到护壁西头。
    bodies: Object.freeze([
      Body(11.3, -123.4, 105, { pose: "nra1", tier: 1 }),
      Body(9.4, -123.1, 90, { pose: "nra1", tier: 1 }),
      // [2] 是演员 SweepVictim（Dir01 生成，被扎后叫一声抓泥）：Set 只保证这块地净空（测试 6a）。
      Body(7.4, -124.8, 90, { actor: "SweepVictim", pose: "nra1" }),
    ]),
  }),
  finish: Object.freeze({
    // 甲（ijaA）擦刀卡枪后端枪沿沟底往洞口走、补一刀的那具（Black 之前不显示）。
    // 2026-10-11 集成负责人决定：契约原有的 [1]（眼位旁那具）删掉——离眼 0.3–0.6 m，第一人称贴地眼高下会露出悬着的腿，
    // 那块地又要留给被踩的右手、手榴弹停点与翻译蹲位。finish.bodies 只剩 [0]。
    // [0] 契约 (3.3,-124.3)：连胳膊的实际宽度压到 02 冲锋路线 chargeRoute 的末点 (3.3,-123.5)（只差 0.27 m），北移 0.25 m，
    //     离 chargeRoute 0.5 m 以上；再往北就压到甲 Found 站的 ija.found (2.98,-125.2)。它仍在 02 翻译蹲位 rescue.interpreter (2.92,-124.5) 与罗班长撤离折线
    //     withdraw.lane 上（Dir 的点，不在契约净空名单里）：交 Dir02 让开（报告）。
    // 2026-10-11 打磨（PolishDir 第 3 条）：(3.3,-124.55) 离眼 1.6 m，N09–N18 一直占画面右侧三分之一。挪到南壁坡脚 (4.6,-123.45)、头朝西、
    //     横伸的胳膊伸到坡脚：任务书给的约 (3.9,-123.2) 正压在冲锋下台阶的 chargeRoute 末段、刘文财的射击位与罗班长撤离线上（台阶就是
    //     x 2.4–5 那整片南坡），东移 0.7 m 后 chargeRoute 只挪 0.1–0.15 m；x 4.6 处南壁是陡坎（z -122.8 以南），再往南胳膊就搭上坎、
    //     身子悬空。翻译进场末段与逼问位 interrogation.interpreterAt、丁的等待位 practice.recruitWait 跟着北移 / 东移 0.15–0.45 m（乙的逼问位 ijaBAt 东移 0.15 m 让出翻译的路）。离眼约 3.3 m。
    //     旧的塌方后救援路线 MISSION_PLACEMENT.bunker.rescueRoute 斜穿这片坡（运行时不读，只有测试量它）：列为刻意（Script_OpeningSetTest 6b）。
    bodies: Object.freeze([
      Body(4.6, -123.45, 90, { pose: "nra1", tier: 0 }),
    ]),
    // 手榴弹滚停点：眼位 witnessEye (1.85,-125.25) 东 0.35 m、南 0.15 m，离眼 0.38 m；沟底平（测试 6d 量坡度）。
    grenadeStop: P(2.2, -125.1),
  }),
  mg: Object.freeze({
    // 机枪垫尸。契约值 (6.9,-123.05) 写的是「沟沿上」，实测那里是**沟底**（离南壁脚 0.3 m，地面 -2.0）：在那儿叠两具、
    // 歪把子架 0.55 m 高，枪口离南沟沿还差 1.4 m，打不出去。南沟沿真正的边（x 6.9：z -121.85 处地面 -0.15，再往南是平地）
    // 在北 1.2 m。所以按契约语义（「推上南沟沿」「越过南沟沿朝后沟点射」，§1.7）放到沟沿顶上：下面那具顺着沟沿横躺
    // （头朝西、胳膊伸向南边平地，北缘离沟沿边 0.05 m 不悬空），上面那具叠在它背上（Settle 落在下面那具的上表面，
    // 离地约 +0.3），背朝上，歪把子两脚架落在它背上（gunRest，运行时按上面那具的实际背高算）。
    // 起点：契约任务书写 (8.2,-124.9)/(8.6,-123.9)，那里正是 SweepVictim（7.4,-124.8 起、身长 1.7 m）与翻译进来的路线；
    // 机枪组「从甲身后（J 方向）下来」各拖一具，起点放到 J 南边纵深支沟的沟底（Dir 拖到沟沿下、推上去叠起）。
    corpseLower: Body(6.9, -121.2, 90, { pose: "nra0", tier: 0, start: Body(14.6, -121.4, 150) }),
    corpseUpper: Body(7.0, -121.25, 70, { pose: "nra1", tier: 0, liftM: 0.3, start: Body(15.0, -119.6, 170) }),
    // 机枪组（Dir 摆演员）。射手趴在南壁坡顶、胸口压在沟沿边（腿垂进沟里），面朝南；副射手跪在他东侧（面朝南时的左手边——
    // 十一年式的弹斗在枪的左侧；契约说明写「右侧」，坐标在东，按坐标）。契约值 (6.7,-123.65)/(7.5,-123.55) 是沟底，同上北移。
    gunner: Object.freeze({ x: 6.75, z: -121.95, yawDeg: 180 }),
    loader: Object.freeze({ x: 7.75, z: -121.7, yawDeg: 180 }),
    // 点射朝后沟折角 RC（FRONT_SPACE.rearCorner）。
    aimAt: P(-4, -113),
  }),
  dropIn: Object.freeze({
    // 北沟沿三处跳下点：`x,z` 是沟沿顶（日兵蹲着露刺刀尖的地方，地面 ≈ 0），`land` 是沟底落点。契约值 (10.0,-126.6) 等
    // 在北壁半坡上（地面 -1.4）；北沟沿真正的边在 z -127.2，沟底在 z -126.25 以南，落点取离坡脚 0.45–0.5 m（脚下 0.4 m 内是平沟底）。高差测试 6c 量（1.8–2.1 m）。
    // 2026-10-11 集成：① 三处都往眼位（西）拉近 1.0 m（集成负责人：N07 人在画面里太远太小；甲再近就压到北侧护壁 revetmentFront 的东头）；② 落点改到 z -126.3：AnimA 的
    // IjaDropIn* 根点在落点、第 0 帧站在根后 0.77 m、脚高 2.085 m，北壁是 1 m 宽的斜坡不是竖墙，落点离坡脚太远第 0 帧就悬在半空。
    // 取根后 0.77 m 那点比根高 1.8 m 左右（第 0 帧脚只悬 0.2–0.3 m）、两脚落地处（根左右 0.17、前后 0.15 m）高差 ≤ 0.25 m 的 z
    // （tmp/merge/jump2.mjs 逐点量）。
    lip: Object.freeze([
      // 2026-10-11 打磨：丙 9.0 -> 9.3，三处落点沿沟各隔 ≥ 1.2 m（甲 8.0、丙 9.3、丁 10.5）。
      Object.freeze({ who: "ijaC", x: 9.3, z: -127.2, yawDeg: 180, land: P(9.3, -126.25) }),
      Object.freeze({ who: "ijaD", x: 10.5, z: -127.2, yawDeg: 180, land: P(10.5, -126.25) }),
      Object.freeze({ who: "ijaA", x: 8.0, z: -127.2, yawDeg: 180, land: P(8.0, -126.2) }),
    ]),
    /** 落点半径内不许有杂物 / 沙袋 / 木撑。 */
    landClearM: 0.6,
    // 折角 F 以东的手榴弹爆点。契约值 (20.5,-126.0) 从眼位看是**画内**（F 以东那段沟底正对着东西向的沟，视线一路通），
    // 挪进连接支沟拐过去的那一段（沟底，地面 -2.06）：眼位看不见爆点本身（北壁拐角挡住），烟柱与闪光从沟沿上冒出来（测试 6e）。
    foldBlast: P(20.4, -127.9),
  }),
  practice: Object.freeze({
    // 丁退三步的落脚：冬瓜跪位东 2.2 m（契约）。
    recruitBack: P(+(COMRADE_KNEEL.x + 2.2).toFixed(3), COMRADE_KNEEL.z),
  }),
});

/**
 * 静态尸体（Script_OpeningSet 的 OpeningCorpses 层）：id、标记路径、显示规则。
 * show: "always" ＝ 01 进场（Banter）就在；"black" ＝ 近爆后的黑场里才出现（和 roofTimberDown 一样）。
 * movable: Dir 用 OpeningSet.PlaceCorpse 搬（机枪组拖尸、推上沟沿叠起）。
 */
export const CORPSES = Object.freeze([
  Object.freeze({ id: "sweep.bodies[0]", mark: SET_MARKS.sweep.bodies[0], show: "always" }),
  Object.freeze({ id: "sweep.bodies[1]", mark: SET_MARKS.sweep.bodies[1], show: "always" }),
  Object.freeze({ id: "finish.bodies[0]", mark: SET_MARKS.finish.bodies[0], show: "black" }),
  Object.freeze({ id: "mg.corpseLower", mark: SET_MARKS.mg.corpseLower, show: "always", movable: true }),
  Object.freeze({ id: "mg.corpseUpper", mark: SET_MARKS.mg.corpseUpper, show: "always", movable: true }),
]);
/**
 * 垫尸自动就位：Dir 在本次装载里没搬过它（PlaceCorpse），而导演已经过了 CaptiveWall（或直接进 02 / 撤离：选章、回跳、
 * 冷启动），就按沟沿叠好的样子摆上去，免得 02 机枪手趴在空沟沿上。
 */
export const MG_AUTO_PLACE_FROM = "CaptiveWall";
/** 垫尸被点射震一下（Dir 调 OpeningSet.JoltCorpse）：竖直抖幅与时长。 */
export const CORPSE_JOLT = Object.freeze({ amplitudeM: 0.02, seconds: 0.18 });
/**
 * 尸体层怎么画（2026-10-12 R4-Perf）。五具共用一套按材质分的 BatchedMesh（每趟每种材质一个 draw，与具数无关）；
 * 两具垫尸只在被拖 / 被震的那几帧换成自己的普通网格（MotionVector 规范：动的实例不进批次），
 * 矩阵连续 stillCalls 次 Update 没变就回批次。smallPartTriangles：第 0 档三角数不到这个数的分件（眼睛，120 三角，
 * 藏在头里）不投影 —— 阴影图里一个纹素都占不满，省两趟阴影 draw。
 * 实测（R4-Perf，1080p high 定帧，docs/Data_TechRenderPipeline.md §17.18）：压木看前沟 CaptiveWall +15 s 尸体 45 → 18 个 draw，02 Charge +2 s 30 → 18。
 */
export const CORPSE_RENDER = Object.freeze({ stillCalls: 2, smallPartTriangles: 200 });

/**
 * 契约 §5.2 的道具（Script_OpeningProps 的 OpeningWorldProps 按名建、按名取用）。尺寸单位米，颜色 sRGB。
 * rest：世界里的初始摆位（没有就要等 Dir 来 Place / Hold）；from：从哪一拍起摆出来（"black" ＝ 近爆后的黑场）；
 * until：在这一拍（含）之后不再自动摆（Dir 接手）。hand：握在手里时相对手骨的偏移（Hold 没有 clip 轨时用，替身用）。
 */
export const REDRAFT_PROPS = Object.freeze({
  // 半块大饼：直径 22 cm 的厚烙饼对半掰开，焦黄面、掰开的断面是白的。
  bread: Object.freeze({ kind: "bread", radiusM: 0.11, thickM: 0.024, arcDeg: 180, color: 0xc8995a, crumb: 0xe6d2a8, char: 0x6f4421, hand: Object.freeze([0.02, -0.03, 0.06]) }),
  // 掰下来丢给幺娃的一角（约 50°）。
  breadPiece: Object.freeze({ kind: "bread", radiusM: 0.11, thickM: 0.024, arcDeg: 50, color: 0xc8995a, crumb: 0xe6d2a8, char: 0x6f4421, hand: Object.freeze([0.02, -0.03, 0.05]) }),
  // 刘文财脚边的弹药箱（现成 Model_MilitaryCrateSet 的开盖箱，按 sizeM 缩放）。契约 §5.1：在他右手边——他 (1.1,-124.9) 蹲着
  // 面朝西，右手是北：箱子放在他北边 0.5 m、洞口正中（Orders 他扣上扛走，01 出洞的人从箱子北边过；塌方前就被扛走）。
  ammoBox: Object.freeze({ kind: "external", asset: "militaryCrateOpen", sizeM: Object.freeze([0.5, 0.28, 0.32]),
    rest: Object.freeze({ x: 1.1, z: -125.45, yawDeg: 8 }), until: "Incoming", hand: Object.freeze([0, 0.1, 0]) }),
  // 两夹桥夹（同 fillCharger：钢片 + 五发铜弹）。顺子丢给冬瓜，一夹落地他弯腰捡。
  clipA: Object.freeze({ kind: "charger", hand: Object.freeze([0.012, -0.026, 0.035]) }),
  clipB: Object.freeze({ kind: "charger", hand: Object.freeze([0.012, -0.026, 0.035]) }),
  // 冬瓜的汉阳造：近爆后躺在泥里，枪口朝东（契约 (3.9,-125.0)）。握把南移 0.25 m：原位那支枪横在 finish.bodies[0] 的北缘上。
  comradeRifle: Object.freeze({ kind: "weapon", weapon: "HanYang", rest: Object.freeze({ x: 3.95, z: -125.25, yawDeg: -90, rollDeg: 82, liftM: 0.025 }), from: "black" }),
  // 汉阳造（1888 式）枪栓：机头 + 栓体 + 拉机柄球，抽出来甩到沟沿外。
  rifleBolt: Object.freeze({ kind: "bolt", lengthM: 0.16, radiusM: 0.0095, knobM: 0.016, color: 0x4b4c4a, hand: Object.freeze([0.0, -0.02, 0.04]) }),
  // 布胸章：契约 3×8 cm 的白布条，四边缝线、上半一道蓝边（不写字：玩家看得见的字要走文本表，这里只画纹样）。
  chestBadge: Object.freeze({ kind: "badge", widthM: 0.08, heightM: 0.03, thickM: 0.003, cloth: 0xd9d1bd, edge: 0x2f4a76, stitch: 0x6b6253,
    chest: Object.freeze([0.09, 0.06, 0.13]), hand: Object.freeze([0.0, -0.02, 0.04]) }),
  // 九一式手榴弹（库里没有：Model_Grenade / Model_Type24Grenade 都是中国木柄弹）：Ø5 cm × 9.5 cm 的分节圆柱弹体（铸铁、
  // 横向三道刻槽）+ 顶部引信帽（黄铜撞针帽）+ 底部推进药筒座。深褐漆。
  grenade: Object.freeze({ kind: "type91", diameterM: 0.05, heightM: 0.095, segments: 4, fuseM: 0.03, fuseDiameterM: 0.024,
    color: 0x3a2b1f, fuse: 0x8a7442, hand: Object.freeze([0.0, -0.03, 0.04]) }),
  // 十一年式轻机枪（现成武器模型 Type11；模型里没有两脚架——Model_Type11.tzm 只有装配态枪体——两条腿程序化补上）。
  type11: Object.freeze({ kind: "weapon", weapon: "Type11", bipod: Object.freeze({ legM: 0.26, spreadDeg: 26, rakeDeg: 18, fromMuzzleM: 0.18, radiusM: 0.007 }) }),
  // P1：背包口露出的一截蓝布便服（叠着、起皱）。Dir01 挂到收拾装备时的背包上（OpeningWorldProps.AttachTo）。
  civilianShirt: Object.freeze({ kind: "cloth", sizeM: Object.freeze([0.2, 0.06, 0.11]), color: 0x3c5a80, fold: 0x2c4361 }),
  // 2026-10-12 R2（集成负责人拍板：用军便帽，不另做钢盔；原文「钢盔扣在脸上」按帽子演）：何有田 HeHelmetSleepSitUp 的 helmet 轨。
  // 模型是 R2-Anim 从 NRA02 军装里按蒙皮切出来的那顶帽子（_import/Script_NraHelmetProp.py → Model_NraHelmet.glb：原点帽顶中心、
  // 帽檐高度，局部 -Z 朝帽顶外、+Y 朝帽檐；运行时米 = GLB × scale）。颜色走戴帽人自己的军装换色（wearer 的打标 + 他布料材质的
  // nraUniformPalette；刚体小件的泥按高度画，grimeLift 抬开）。他播这条 clip 时头上那顶摘掉（Script_OpeningProps.WearNraCap：
  // clothMaterial 里三个顶点头骨权重 ≥ headWeightMin 的三角截掉、badgeMaterial 的帽徽藏起来），出洞口前戴回。
  helmet: Object.freeze({ kind: "wornCap", model: "./Model/Model_NraHelmet.glb?v=20261012R2Cap", scale: 0.9135, wearer: "TengxianNra02",
    grimeLift: 10, clothMaterial: "Material #1721585337", badgeMaterial: "Material #1721585500", headWeightMin: 0.9 }),
});

/**
 * 折角爆点的画面（Script_OpeningSet.FoldBlast：只给闪光、烟、落土，不伤人、不出声——声音归 Sfx/Dir）。
 * explosion：vfx.Explosion 的半径与种类（中心强光 + 火团 + 贴地尘环 + 碎块）；dirt：从爆点往上、往西甩过沟沿的土
 * （OpeningBlastFx 的定向喷土，规模小得多）；smoke：爆后冒 emitS 秒的一股土黄烟（vfx.SmokeSource，到点收掉发射器、烟团照常散）——
 * 爆点在沟底、拐角背后，眼位贴地看不见火团本身（测试 6e），要靠这股烟在 1–2 s 内升过沟沿让人看见（实拍 tmp/set/shots/Set_FoldBlast_*：
 * 只有 vfx.Explosion 时 1.2 s 内沟沿上几乎看不到烟）。
 */
export const FOLD_BLAST = Object.freeze({
  explosion: Object.freeze({ radius: 5.5, kind: "grenade" }),
  smoke: Object.freeze({ kind: "dust", emitS: 1.4, rate: 16, radius: 0.9, rise: 3.4, sizeStart: 0.9, sizeEnd: 4.5, life: 5.5, opacity: 0.5 }),
  dirt: Object.freeze({ dir: Object.freeze({ x: -0.55, y: 0.75, z: 0.35 }), liftM: Object.freeze([0.2, 0.8]), clods: 10, splinters: 0, grit: 24,
    spray: 0, mist: 6, dust: 14, seconds: 0.5, spreadRad: 0.6, speed: Object.freeze({ clods: Object.freeze([4, 8]), grit: Object.freeze([5, 9]),
      mist: Object.freeze([2, 4]), dust: Object.freeze([1, 2.5]), splinters: Object.freeze([4, 8]), spray: Object.freeze([4, 8]) }) }),
});

export const OPENING_REDRAFT_SET = Object.freeze({ version: "20261011OpeningRedraftSetV1", stages: REDRAFT_STAGES, SET_MARKS, CORPSES,
  BODY_POSES, REDRAFT_PROPS, FOLD_BLAST, budget: REDRAFT_TRIANGLE_BUDGET });

/** 一具尸体（BODY_POSES 原型 + 标记）的世界占地盒 {x, z, w, d, ry}（ry 让盒子局部 +z 转到世界，同 PropFootprints 约定）。 */
export function CorpseFootprint(mark) {
  const pose = BODY_POSES[mark.pose], [x0, x1, z0, z1] = pose.box, yaw = (mark.headYawDeg || 0) * DEG;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, c = Math.cos(yaw), s = Math.sin(yaw);
  // 局部偏心 (cx, cz) 转到世界：x = lx cos + lz sin，z = -lx sin + lz cos（three 绕 Y 转 yaw）。
  return { x: mark.x + cx * c + cz * s, z: mark.z - cx * s + cz * c, w: x1 - x0, d: z1 - z0, ry: yaw, y0: 0, y1: pose.heightM };
}
