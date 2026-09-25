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
    a: P(0.3, -127.62), b: P(0.9, -127.62), layers: 4, layerM: 0.18, depthM: 0.36, bagM: 0.5 },
  // 竖排两行标语配宣传画，贴在北壁的木板上，面朝南。底图 Lovart、字程序叠加（Texture/Script_MakeBunkerPoster.mjs）。
  // 离洞底 1.02 m 的中心（调研写 1.2）：SB02 镜像机位眼高 0.75、俯 14°，画面上沿只到离地约 1.45 m，
  // 1.2 时实拍只看得见下半截的画、看不见字（tmp/cap/step1b/SB02_set_after.png）。1.02 时字（上 45%，
  // 离地 0.98–1.47）露在沙袋与弹药箱上方；下半截的画被弹药箱（0.85）与沙袋墙（0.72）压住一角，像贴在后面。
  // x 从 0.2 东移到 0.35，少被弹药箱挡。
  { id: "bunkerPoster", kind: "poster", ground: FLOOR, x: 0.35, z: -127.8, lift: 1.02, w: 0.6, h: 0.9, faceYawDeg: 180,
    texture: "./Texture/Texture_BunkerPosterDefendShandong.webp",
    board: Object.freeze({ x0: -0.75, x1: 0.92, z: -127.87, lift0: 0.0, lift1: 1.84, plankM: 0.2 }) },
  // 铁皮马灯：挂在北门柱内侧（柱 x 0.925…1.175、z -127.65…-127.35）的钉子上，暖色点光只在 01 亮、轻微闪烁。
  // 离洞底 1.28 m（调研写 1.55）：同上，SB02 俯 14° 时 1.55、1.4 都在画面上沿外（实拍）。
  { id: "bunkerLantern", kind: "lantern", ground: FLOOR, x: 0.84, z: -127.42, lift: 1.28,
    light: Object.freeze({ color: 0xffa65a, intensity: 2.2, distanceM: 3.2, decay: 2, flickerHz: Object.freeze([7.3, 11.1, 2.3]), flicker: 0.16 }),
    litStages: Object.freeze(["Trapped"]) },
  // 北壁弹药箱两层（幺娃身后，SB01 左中），箱背嵌进北壁坡脚。
  { id: "bunkerCrateStackN", kind: "crateStack", ground: FLOOR, x: -0.15, z: -127.88, yawDeg: 4,
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
    rest: P(0.72, -126.15, 0.87),          // 断头落在塌顶木 roofTimberDown 上（顶面离地 0.76 + 半厚 0.11）
    breakZ: -126.5,                         // 断口：北段 z -127.6…-126.5 留在北柱顶
    // 近爆后的落下时刻（秒，从 Blast 起算），契约 §5 SB02「fallenLintel 0.25–0.6 s 塌下」。
    fall: Object.freeze({ startS: 0.25, endS: 0.6, bounceRad: 0.05, bounceS: 0.18 }) },
  // SB03A 画面上沿那一整条黑木料：塌下的洞顶木，沿 z 横在洞口内侧，两头各垫一堆土块。
  // 调研起点：中心 (0.8,-125.4)、离地 0.52、0.3×0.3×3.4。长度收到 1.75 m（z -126.25…-124.5）：SB03A 画面
  // 左右缘只用到 z -126.1…-124.8，北边留出拖人出洞的通道。
  // 离地抬到 0.62/0.66（下沿 0.48–0.52）：0.47/0.55 时木料下沿 0.33–0.41，SB03 眼高 0.26 离它只有 0.45 m，
  // 实拍盖掉画面上 42%、审问组只剩头（tmp/cap/step1b/SB03_set.png）。现在 SB03 约占上 25%、SB03A 约 20%，
  // 日兵甲的头从木料下沿露出来（Script_OpeningSetTest 的视线检查，余量约 4 cm）。
  { id: "roofTimberDown", kind: "timber", ground: FLOOR, show: "collapsed",
    a: P(0.8, -126.25, 0.62), b: P(0.8, -124.5, 0.66), w: 0.3, h: 0.28,
    supports: Object.freeze([Object.freeze({ x: 0.8, z: -126.15, w: 0.5, h: 0.48, d: 0.45 }),
      Object.freeze({ x: 0.82, z: -124.62, w: 0.45, h: 0.52, d: 0.4 })]) },

  // ---------------------------------------------------------------- 洞口外前沟（SB03/03A/04/04A 的背景）
  // 北壁木框洞口立面：挖在北壁里的另一处掩蔽部口（纯装饰，门内黑），门洞 x 2.7–3.9，另一口 x 4.9–5.5。
  // 立面立在北壁坡脚（x 3–5 坡脚 z≈-126.16…-126.20）略往北，板墙下沿埋进坡里 0.3–0.5 m：再往南就压到
  // 近爆时川军被摔向北壁的位置（comradeBlast (3.6,-125.85)，BlastSlamBuried 要北壁在他左手 0.55 m）与
  // 02 日兵乙的 ijaBWatch。死川军 (4.06,-125.88) 背靠两口之间的板墙。
  { id: "trenchFacadeN", kind: "facade", x0: 2.6, x1: 5.9, z: -126.22, heightM: 2.0, postM: 0.18, plankM: 0.22,
    openings: Object.freeze([Object.freeze({ x0: 2.7, x1: 3.9, h: 1.7 }), Object.freeze({ x0: 4.9, x1: 5.5, h: 1.45 })]) },
  // 沟底铺板：x 2→14、z≈-124.6、宽 0.6。跳过现有铺板 BunkerTrenchDuckboard45（中心 x 9.02，长 2.4）。
  { id: "duckboardsFront", kind: "duckboards", width: 0.6, slatM: 0.11, gapM: 0.05, columns: 1,
    path: Path([2.2, -124.72], [7.7, -124.62]), path2: Path([10.3, -124.6], [13.6, -124.6]) },
  // 前沟两壁护壁：竖桩 + 横木，贴坡脚、向墙里斜。跳过现有围栏式护壁 BunkerTrenchRevetment45_±1（x 7.2–10.8）。
  // 北壁 x 2.6–5.9 是木框立面，护壁接在它东头。
  { id: "revetmentFront", kind: "revetment", heightM: 1.1, postEveryM: 1.15, logs: 3, leanDeg: 12,
    runs: Object.freeze([
      Object.freeze({ side: "north", path: Path([5.95, -126.16], [7.1, -126.22]) }),
      Object.freeze({ side: "north", path: Path([10.9, -126.4], [13.4, -126.38]) }),
      Object.freeze({ side: "south", path: Path([5.2, -122.62], [7.1, -122.52]) }),
      Object.freeze({ side: "south", path: Path([10.9, -122.54], [12.9, -122.7]) }),
    ]) },
  // 南壁沙袋压顶 + 木桩（SB03 右侧纵深的沟沿）：沙袋摆在南沟沿（x 6–12 沟沿 z≈-121.9），
  // x 13–16 是纵深支沟岔口，留空；x 16.8–19.6 沟沿转向东北。
  { id: "sandbagStakesSouth", kind: "sandbagStakes", layers: 2, layerM: 0.17, depthM: 0.44, bagM: 0.52,
    stakeEveryM: 1.3, stakeAboveM: 0.45, stakeBelowM: 0.55,
    runs: Object.freeze([Path([6.0, -121.84], [12.3, -122.0]), Path([16.8, -122.72], [19.6, -123.3])]) },
  // 日军插在南沟沿上的旗（SB03 右沿、SB03A 右上、SB04 左远）：调研写 (10.5,-122.3)，那里是南壁半坡（地面 -1.13），
  // 挪到沟沿 z -121.8、插在沙袋中间。杆 2.8 m，旗面 0.7×0.46，程序化白底红日加脏污。
  { id: "flagTrench", kind: "flag", x: 10.5, z: -121.8, poleM: 2.8, cloth: Object.freeze([0.7, 0.46]), flyYawDeg: 70 },
  // 北沟沿枯树（现成 Model_DeadTreeTrunkSet.glb）。
  { id: "deadTreeRim0", kind: "external", asset: "deadTreeTrunk01", x: 8.6, z: -127.7, yawDeg: 40, scale: 0.9 },
  { id: "deadTreeRim1", kind: "external", asset: "deadTreeTrunk02", x: 11.6, z: -128.25, yawDeg: -65, scale: 1.0 },
  { id: "deadTreeRim2", kind: "external", asset: "deadTreeTrunk01", x: 13.9, z: -127.65, yawDeg: 150, scale: 0.75 },
  // SB04 枪托位附近的断木板（契约 §2 第 5 条优先枪托位 (2.3,-124.4)）：三根躺在泥里，一头翘在土块上，
  // 仰拍时在画面左下框景（右上的断木由 fallenLintel 承担）。全部贴地（离地 < 0.16 m），拖人、踢枪都能踩过去。
  { id: "plankDebrisButt", kind: "planks", planks: Object.freeze([
    Object.freeze({ x: 1.95, z: -124.6, lift: 0.05, len: 1.2, w: 0.2, t: 0.05, yawDeg: 62, pitchDeg: 2, rollDeg: 8 }),
    Object.freeze({ x: 2.8, z: -123.95, lift: 0.05, len: 1.0, w: 0.18, t: 0.05, yawDeg: -24, pitchDeg: -3, rollDeg: -6 }),
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
  { id: "flagRC", kind: "flag", x: -7, z: -109, poleM: 2.5, cloth: Object.freeze([0.62, 0.41]), flyYawDeg: 100 },

  // ---------------------------------------------------------------- 洞口塌土的外观（碰撞在 MISSION_SCENARIO）
  // 塌土体块是方盒；这里各盖一个压扁的土包把方盒包进去（SB03 右侧：峰高不超过 0.4 m）。
  // 南侧塌土：体块 BunkerMouthRubbleS 收成 0.6×0.5×0.25 m（中心 (1.35,-124.3)），给 02 救援圈 S' (0.60,-123.90)
  // 跪着的顺子留出身位，北边与洞口塌土之间留一条 0.7 m 的过道（拖人去还权位走这里，见测试的 SB06.dragCoverSet）。
  // 峰高 0.35（原 0.38，任务书上限约 0.35）、摊宽、起伏减半：SB03 眼高 0.26，0.38 的土包在画面右下拱过地平线；
  // 0.31 时 0.25 m 体块的四角从土里露出来（实拍 tmp/cap/step1d/SB06_back.png）。体块四角处土厚 ≥ 0.27。
  { id: "rubbleMoundS", kind: "mound", show: "collapsed", x: 1.35, z: -124.33, rx: 0.85, rz: 0.66, peak: 0.35, bump: 0.12, sink: 0.01, seed: 11 },
  // 还权坐位 (2.40,-125.20) 西侧的靠背（只是外观，不进碰撞：进了会挡住拖进遮挡与撤出的路线）。
  // 南北只伸到 z -125.6…-124.75，南边 SB04 枪托位 (2.3,-124.4) 躺人的地方空着。
  // **02 起才出现**（show:"rescue"）：它正好在 SB03/03A 眼位看审问组的视线上（眼 (0.35,-125.15) 高 0.26、
  // 坐位 (2.40,-125.20)、审问组 (4.1,-125.6) 几乎一条线），01 里摆着会把审问组腰以下全挡掉（实拍）。
  // 02 开场镜头朝南，这里在镜头背后，出现的那一下没人看得见。01/02 的界线按导演 phase 算（任务步骤在 Found
  // 前后就切到 BunkerRescue 了，见 Script_OpeningSet.RescueShown）。
  { id: "rubbleMoundBack", kind: "mound", show: "rescue", x: 1.85, z: -125.17, rx: 0.36, rz: 0.43, peak: 0.48, seed: 23 },
]);

// ---------------------------------------------------------------------------
// 近爆的定向喷土（SB02，Script_OpeningBlastFx.DirectionalBlast）
// ---------------------------------------------------------------------------
// 炮弹落在洞口南侧外（导演 banter.shellAt，飞行 0.22 s）：泥土、土块、碎木从洞口南沿 (1.2,-124.5) 离地
// 0.5–1.5 m 朝西北喷进洞里。SB02 镜像机位是眼 (-0.6,-125.95) 朝东北东 yaw -66°：喷口在镜头右边 69°、画面外
// （半水平视场约 48°）。喷口**正对镜头**时整锥土都沿同一方位角扑过来、一直待在画框外，画面里什么都没有
// （实拍 tmp/cap/step2/SB02_b030.png）。所以主轴朝北北西、指向北壁 (-0.3,-127.3)：土从画面右沿进来、横扫过
// 门洞砸到北壁（分镜里那一幕）；镜头在泥雾锥（×1.2）的边上，扑脸的那一片仍有。
// 方向 (-0.47, 0.2, -0.86)（抬约 11°），锥半角约 22°。0.22 s 起喷、0.9 s 止（契约 §5 SB02）。
export const BLAST = Object.freeze({
  id: "bunkerMouthSpray",
  at: P(1.2, -124.5), liftM: Object.freeze([0.5, 1.5]),
  dir: Object.freeze({ x: -0.47, y: 0.2, z: -0.86 }),
  /** 从近爆（blastAge 0 = 导演 Blast() 的那一帧）起算：炮弹 0.22 s 落地就喷。 */
  atS: 0.22, seconds: 0.68,
  clods: 15, splinters: 9, dust: 26, spray: 70,
  spreadRad: 0.38,
  // 速度（米/秒）：土块 5–10、碎木 6–12（更轻、飞得远）、泥雾 7–13（一片扑到镜头上）、扬尘 1.2–3.2（填满洞口）。
  speed: Object.freeze({ clods: Object.freeze([5, 10]), splinters: Object.freeze([6, 12]), spray: Object.freeze([7, 13]), dust: Object.freeze([1.2, 3.2]) }),
  // 前 0.18 s 喷出 70%，后面是拖尾（落土）。
  burst: Object.freeze({ headS: 0.18, headShare: 0.7 }),
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
 * 同时在冒的烟团上限（rate × life 之和，spawnScale 1）。vfx 的持续烟池 sourceSmoke 在 high 档是
 * 4000 × 0.08 = 320 片（环形缓冲，满了就挤掉最老的，烟柱会从顶上断掉）；给战车尘土、机枪热烟留 100 片。
 */
export const SMOKE_PARTICLE_BUDGET = 220;

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
// 所以装到 FRONT_SET_STAGES 结束才收走（不跟 01–03 的布景一起收；报告里写明）。
// 全是外观：阵位白盒体块（Data_FirstLevelMissionLayout 的 RightNest*）的碰撞、掩体标签、射界一个不动，
// 砖壳把体块整个包进去（每面外扩 3 cm、墙头只往上长）——所以砖壳露出来的只会比碰撞高，不会有「看着是缺口、
// 其实是墙」的隐形墙；多出来的墙头锯齿只有外观（AI 视线、弹道仍按原体块）。
export const FRONT_SET_STAGES = Object.freeze(["Support", "MachineGun", "Tank", "Orders"]);
/** 砖层高（一皮砖 + 灰缝）与砖长：锯齿墙头按整皮、整砖退台；skinM 是砖壳比体块每面外扩多少。 */
export const BRICK = Object.freeze({ courseM: 0.115, lengthM: 0.25, skinM: 0.03,
  // 砖面：先用城墙砖（灰砖、浅灰缝，平均亮度 119），没有再退到熏黑旧砖（91，太黑：SB07 实拍整面墙是一块黑剪影）；
  // 染成土黄灰（概念图 04 的残墙是灰里带黄的旧砖，不是红砖）。
  recipes: Object.freeze(["CityWallBrickPbr", "BrickWallSooty"]), color: 0xeedcbc });
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
    fallen: Object.freeze([
      Object.freeze({ s: 1.2, off: 1.05, len: 1.6, w: 0.9, tiltDeg: 12, yawDeg: 8 }),
      Object.freeze({ s: 3.6, off: 1.25, len: 2.2, w: 1.1, tiltDeg: 7, yawDeg: -5 }),
      Object.freeze({ s: 5.4, off: 0.95, len: 1.4, w: 0.8, tiltDeg: 18, yawDeg: 14 }),
    ]), seed: 9 },
  // 缺口段的护壁（SB08 中间那段沙袋压顶的木板护壁）：沟两壁补木板护壁（跳过现有 GuardWithdrawalRevetment*），
  // 沙袋只压在**西沿**（远离阵位那一侧，压在东沿会挡阵位看沟里的人）。
  { id: "gapRevetment", kind: "revetment", heightM: 1.0, postEveryM: 1.0, logs: 5, leanDeg: 8,
    runs: Object.freeze([
      Object.freeze({ side: "west", path: Path([-9.95, -148.35], [-9.95, -147.25]) }),
      Object.freeze({ side: "west", path: Path([-9.95, -143.6], [-10.05, -141.6]) }),
      Object.freeze({ side: "east", path: Path([-6.1, -149.9], [-6.05, -147.35]) }),
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
  fallenLintel: Object.freeze({ marks: Object.freeze(["shunzi.trap", "SB02.trap", "SB03.eye", "SB03A.eye"]), why: "塌下的门楣就落在受困的顺子身边（SB02/SB03A）" }),
  roofTimberDown: Object.freeze({ marks: Object.freeze(["shunzi.trap", "SB02.trap", "SB03.eye", "SB03A.eye"]), why: "SB03A：顺子压在塌顶木下伸手够枪" }),
  rubbleMoundBack: Object.freeze({ marks: Object.freeze(["shunzi.cover", "SB06.seat", "SB06.dragCoverSet"]), why: "SB06：顺子坐着背靠塌土（拖进遮挡的终点就是坐位）" }),
  bunkerCrateStackN: Object.freeze({ marks: Object.freeze(["SB01.yaowa"]), why: "SB01：幺娃靠着北壁坐，身后就是弹药箱" }),
  trenchFacadeN: Object.freeze({ marks: Object.freeze(["SB03.captive", "SB03A.captive", "banter.comradeBlast"]),
    why: "SB03/03A：死川军背靠门框边的板墙；近爆时他就是被摔在这面北壁上（BlastSlamBuried）" }),
});

export const OPENING_SET = Object.freeze({ version: "20260925OpeningSetV2", stages: SET_STAGES, PROPS, BLAST, SMOKE, FLYOVER, FLYOVER_TRIGGER, sky,
  frontStages: FRONT_SET_STAGES, FRONT_PROPS, DESIGNED_CONTACTS });

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
    case "revetment": return prop.runs.flatMap((run) => Polyline(run.path).map(([a, b]) => Seg(a, b, 0.24, 0, prop.heightM)));
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
