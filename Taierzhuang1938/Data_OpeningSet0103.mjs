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
  // 峰高 0.31（原 0.38）、摊宽：SB03 眼高 0.26，0.38 的土包在画面右下拱过地平线（实拍）。仍盖得住 0.25 m 的体块。
  { id: "rubbleMoundS", kind: "mound", show: "collapsed", x: 1.35, z: -124.3, rx: 0.82, rz: 0.62, peak: 0.31, seed: 11 },
  // 还权坐位 (2.40,-125.20) 西侧的靠背（只是外观，不进碰撞：进了会挡住拖进遮挡与撤出的路线）。
  // 南北只伸到 z -125.6…-124.75，南边 SB04 枪托位 (2.3,-124.4) 躺人的地方空着。
  // **02 起才出现**（show:"rescue"）：它正好在 SB03/03A 眼位看审问组的视线上（眼 (0.35,-125.15) 高 0.26、
  // 坐位 (2.40,-125.20)、审问组 (4.1,-125.6) 几乎一条线），01 里摆着会把审问组腰以下全挡掉（实拍）。
  // 02 开场镜头朝南，这里在镜头背后，出现的那一下没人看得见。
  { id: "rubbleMoundBack", kind: "mound", show: "rescue", x: 1.85, z: -125.17, rx: 0.36, rz: 0.43, peak: 0.48, seed: 23 },
]);

/** 烟柱与火点（Step 2 填：{id, stages, x, z, kind, scale, fire}）。 */
export const SMOKE = Object.freeze([]);
/** 03 开头两架日机的航线与时刻（Step 2 填）。 */
export const FLYOVER = Object.freeze([]);
/** 01–03 阴天开关（Step 2 接线；默认关，契约 §2 第 15 条）。 */
export const sky = Object.freeze({ overcast: false });

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

export const OPENING_SET = Object.freeze({ version: "20260925OpeningSetV1", stages: SET_STAGES, PROPS, SMOKE, FLYOVER, sky, DESIGNED_CONTACTS });

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
    case "mound": {
      // 土包是个压扁的半椭球：只算高过 0.3 m（膝下）的那一圈核，边上一圈薄土人能踩过去。
      const core = Math.sqrt(Math.max(0, 1 - (0.3 / prop.peak) ** 2));
      return [{ x: prop.x, z: prop.z, w: Math.max(0.05, prop.rx * 2 * core), d: Math.max(0.05, prop.rz * 2 * core), ry: 0, y0: 0, y1: prop.peak, ellipse: true }];
    }
    default: throw new Error(`OpeningSet: unknown prop kind ${prop.kind} (${prop.id})`);
  }
}
