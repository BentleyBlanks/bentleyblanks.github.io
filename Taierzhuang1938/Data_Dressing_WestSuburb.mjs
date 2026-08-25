// 西关带（车站/电灯厂/西关大街，x -620..-310, z -250..210）的生活布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有西关包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。城外没有「户口册」—— 建筑位置读
// Script_Landmark_WestSuburb / Script_Landmark_Station / Script_Landmark_PowerPlant，
// 埋墙与叠桩由 Script_DressingProbeTest 兜底，截图自查必做。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs
//      node Taierzhuang1938/Script_DressingProbeTest.mjs
//
// 【这一片摆的是什么】1938-03-16 的西关。滕县是半工半市的县城，西关这一条
// 从车站通到西门的带子上，货运、工业与市镇生活挤在一起 —— 而这一天它们同时中断。
// 四块各有各的断法：
//   · **车站**（-458,-82）—— 车没来。站台两头与站房东侧的货场上码着没运走的
//     箱笼米袋，枕木料与备用车轮撂在路基边，装到一半的大车停在货堆当中；
//   · **电灯厂**（-408,62）—— 厂子还在转，家什却已经在往外搬：金属杆、木梁、
//     军用木箱沿厂墙码着，铁锤铁锹靠着墙根，厂房西夹道里是水缸与柴；
//   · **西关大街**（z=0）—— 铺子上了门板、幌子还挂着；缸瓮桌凳笸箩留在原处，
//     通信队门前堆着待运的军粮，师部门口的街肩上是井台、条凳与草垛；
//   · **村缘农院** —— 关厢外的打谷场：秸秆垛、晾晒架、食槽、村井、锄头。
//
// 【选点的三条纪律】（城外没有院子格，只能靠引擎真值）
//   · 一切摆位先与**引擎导出的碰撞盒**对过（站台/站房基座/月台雨棚柱/铁路道砟/
//     厂墙/铺面台基/西关大街路冠/护城河），一律留 0.30 m 以上净空。
//     **站台不是能摆东西的地方**：站台面比垫地高 0.75 m，而外部件落地走的是
//     解析地形（GroundHeight，不认识石台），摆上去就是埋在石台里 ——
//     所以「站台上没运走的货」一律码在站台两头与站房东侧的**地面**货场上；
//   · 铁路 |x+480| ≤ 5.3 是道砟碰撞带（道口那一段更宽到 x -490..-470），
//     西关大街 |z| ≤ 3 是路冠，两条都不进；
//   · 大件（最大边 > 1.4 m）离 L1 的目标连线（出生点 →SecondLine→Dawn→
//     XiguanStation→PowerPlant→WestGate）3 m 以上；小件不受此限，但也不堵门洞。

export const REGION = Object.freeze({
  id: "WestSuburb", kind: "outfield", label: "西关带",
  bounds: { minX: -620, maxX: -310, minZ: -250, maxZ: 210 },
});

export const PLACEMENTS = Object.freeze([
  // =========================================================================
  // 一 · 车站（津浦路滕县站，站房 -458,-82；石站台 x -476.4..-464，z -112..-52）
  // =========================================================================

  // ---- 月台北头：北去的车没来，货卸在站台尽头的地面上 ----
  { asset: "ryTimberStack", x: -472.6, z: -124.4, ry: 0.1,
    note: "车站北头货位：换轨用的枕木料，撂在道砟坡脚" },
  { asset: "ryTimberStack", x: -472.4, z: -122.6, ry: -0.06,
    note: "车站北头货位：第二垛枕木料" },
  { asset: "battlefieldTimberBeam", x: -470.2, z: -124.0, ry: 1.62,
    note: "车站北头货位：顺着站台方向躺的一根长木梁" },
  { asset: "marketCrate03", x: -468.8, z: -121.4, ry: 0.3,
    note: "车站北头货位：没上车的板条箱" },
  { asset: "marketCrate01", x: -467.9, z: -122.6, ry: -0.5,
    note: "车站北头货位：并排的第二只板条箱" },
  { asset: "marketBox02", x: -469.6, z: -120.2, ry: 0.15,
    note: "车站北头货位：压在板条箱北边的木箱" },
  { asset: "marketRiceSack01", x: -467.4, z: -119.8, ry: 0.62,
    note: "车站北头货位：粮行托运的米袋" },
  { asset: "marketRiceSack02", x: -466.6, z: -120.6, ry: -0.3,
    note: "车站北头货位：第二口米袋，扎口朝北" },
  { asset: "ryCartWheel", x: -473.2, z: -119.8, ry: 1.5,
    note: "车站北头货位：靠着木料立的备用大车轮" },

  // ---- 站房北端：走得急的人把箱笼撂在台阶外 ----
  { asset: "crate", x: -459.8, z: -103.4, ry: 0.22,
    note: "站房北端：旅客撂下的木箱" },
  { asset: "marketBox01", x: -458.9, z: -104.2, ry: -0.35,
    note: "站房北端：与木箱并排的小箱" },
  { asset: "phWickerTray", x: -460.6, z: -104.4, ry: 0.9,
    note: "站房北端：翻在地上的竹编浅筐" },
  { asset: "marketCrate02", x: -461.8, z: -102.6, ry: 0.5,
    note: "站房北端：板条箱，捆绳还在上面" },

  // ---- 站房东侧货场：站台上没运走的货，主堆在这里 ----
  { asset: "marketRiceSack01", x: -446.4, z: -92.6, ry: 0.28,
    note: "站前货场：码成垛的米袋，最上面这一口" },
  { asset: "marketRiceSack02", x: -445.6, z: -93.4, ry: -0.5,
    note: "站前货场：米袋垛的第二口" },
  { asset: "marketRiceSack01", x: -446.9, z: -94.1, ry: 0.8, scale: 0.95,
    note: "站前货场：米袋垛靠外的一口" },
  { asset: "marketBox03", x: -444.2, z: -91.4, ry: 0.12,
    note: "站前货场：大木箱，标记朝着站房" },
  { asset: "marketBox02", x: -443.3, z: -92.5, ry: -0.3,
    note: "站前货场：并排的第二只木箱" },
  { asset: "marketCrate04", x: -442.4, z: -91.2, ry: 0.44,
    note: "站前货场：板条箱一列的头一只" },
  { asset: "marketCrate03", x: -441.5, z: -92.3, ry: -0.18,
    note: "站前货场：板条箱一列的第二只" },
  { asset: "militaryCrateClosed", x: -440.2, z: -90.4, ry: 0.3,
    note: "站前货场：混在民货里的军用木箱（闭合）" },
  { asset: "militaryCrateOpen", x: -439.4, z: -91.4, ry: -0.55,
    note: "站前货场：开着盖的军用木箱，东西已经取走" },
  { asset: "cart", x: -443.6, z: -86.4, ry: 1.35, scale: 0.92,
    note: "站前货场：装到一半的大车，车辕朝城门方向" },
  { asset: "crate", x: -441.9, z: -85.2, ry: 0.2,
    note: "站前货场：刚从车上卸下的木箱" },
  { asset: "ryCartWheel", x: -445.8, z: -83.2, ry: 0.1,
    note: "站前货场：躺着的备用车轮" },
  { asset: "phIronSpade", x: -447.2, z: -80.4, ry: 1.1,
    note: "站前货场：扔在地上的铁锹" },
  { asset: "battlefieldCanvasCover01", x: -443.0, z: -78.6, ry: 0.35,
    note: "站前货场：苫布盖着的一堆货" },
  { asset: "battlefieldCompartmentCrate", x: -441.6, z: -77.4, ry: -0.25,
    note: "站前货场：分格箱，撂在苫布边上" },
  { asset: "ryTimberStack", x: -446.8, z: -71.6, ry: 0.5,
    note: "站前货场南端：木料堆" },
  { asset: "ryCartWheel", x: -444.2, z: -70.4, ry: 1.2,
    note: "站前货场南端：靠木料立着的车轮" },

  // ---- 月台南头：南去的货位，同样没运走 ----
  { asset: "marketCrate01", x: -471.2, z: -44.6, ry: 0.3,
    note: "车站南头货位：板条箱" },
  { asset: "marketBox02", x: -470.2, z: -45.6, ry: -0.2,
    note: "车站南头货位：木箱，与板条箱并排" },
  { asset: "ryTimberStack", x: -472.8, z: -43.4, ry: 0.12,
    note: "车站南头货位：枕木料" },
  { asset: "battlefieldMetalPole", x: -469.0, z: -42.0, ry: 1.55,
    note: "车站南头货位：顺站台躺着的一根金属杆（线杆料）" },

  // =========================================================================
  // 二 · 电灯厂（-408,62；厂墙 x -430.5..-385.5，z 45.5..78.5，厂房 z 53..71）
  // =========================================================================

  // ---- 南厂墙下：厂区杂件与家伙什沿墙码着 ----
  { asset: "battlefieldMetalPole", x: -427.6, z: 74.6, ry: 0.05,
    note: "电灯厂南院：顺南厂墙躺的金属杆" },
  { asset: "battlefieldMetalPole", x: -427.4, z: 76.2, ry: -0.04,
    note: "电灯厂南院：第二根金属杆" },
  { asset: "battlefieldTimberBeam", x: -423.6, z: 75.0, ry: 0.09,
    note: "电灯厂南院：架线用的木梁" },
  { asset: "militaryCrateClosed", x: -419.6, z: 74.2, ry: 0.3,
    note: "电灯厂南院：军用木箱（闭合）—— 厂子被征用过的痕迹" },
  { asset: "militaryCrateOpen", x: -418.5, z: 75.2, ry: -0.4,
    note: "电灯厂南院：开盖的军用木箱" },
  { asset: "militaryCrateClosed", x: -417.4, z: 74.0, ry: 0.15,
    note: "电灯厂南院：第三只军用木箱" },
  { asset: "phSmithHammer", x: -415.8, z: 77.5, ry: 1.2,
    note: "电灯厂南院：靠南厂墙放的铁锤" },
  { asset: "phIronSpade", x: -414.0, z: 77.4, ry: 1.5,
    note: "电灯厂南院：靠墙的铁锹" },
  { asset: "ryChoppingBlock", x: -411.4, z: 76.4, ry: 0.2,
    note: "电灯厂南院：劈引火柴的木墩" },
  { asset: "phFirewoodBranches", x: -409.8, z: 75.4, ry: 0.5,
    note: "电灯厂南院：引火用的柴枝堆" },

  // ---- 厂房西夹道（西厂墙与厂房之间的 7 m）：水与柴 ----
  { asset: "clayWaterVat", x: -428.6, z: 56.2,
    note: "电灯厂西夹道：接锅炉用水的水缸" },
  { asset: "clayRoundVat", x: -427.5, z: 57.0, ry: 0.2,
    note: "电灯厂西夹道：第二口圆腹陶缸" },
  { asset: "battlefieldOpenBin", x: -426.0, z: 60.4, ry: 0.25,
    note: "电灯厂西夹道：敞口铁桶，炉渣倒在里面" },
  { asset: "phFirewoodBranches", x: -428.2, z: 63.0, ry: 0.4,
    note: "电灯厂西夹道：引火柴枝" },
  { asset: "ryFirewoodStack", x: -427.0, z: 64.2, ry: 0.15,
    note: "电灯厂西夹道：码齐的柴垛" },
  { asset: "stoneMillWheel", x: -427.2, z: 68.4, ry: 0.3,
    note: "电灯厂西夹道：当垫脚使的旧石磨盘" },
  { asset: "battlefieldTimberBeam", x: -425.4, z: 67.0, ry: 0.02,
    note: "电灯厂西夹道：垫在墙根的木梁" },

  // ---- 厂房东侧（烟囱那一面，也是玩家从西城头看过来的一面）----
  { asset: "battlefieldMetalPole", x: -389.2, z: 68.0, ry: 0.03,
    note: "电灯厂东侧：烟囱脚下的金属杆料" },
  { asset: "battlefieldMetalPole", x: -389.4, z: 69.6, ry: -0.05,
    note: "电灯厂东侧：第二根金属杆料" },
  { asset: "militaryCrateOpen", x: -390.8, z: 65.0, ry: 0.4,
    note: "电灯厂东侧：开盖的军用木箱" },
  { asset: "militaryCrateClosed", x: -389.6, z: 63.8, ry: -0.2,
    note: "电灯厂东侧：闭合的军用木箱" },
  { asset: "phIronSpade", x: -392.2, z: 61.4, ry: 0.1,
    note: "电灯厂东侧：靠厂房东墙立的铁锹" },
  { asset: "wineJarCluster", x: -390.2, z: 50.4, ry: 0.3,
    note: "电灯厂北院东段：值班房门口的坛子" },
  { asset: "clayWideJar", x: -389.0, z: 49.6, ry: -0.4,
    note: "电灯厂北院东段：阔口陶坛" },
  { asset: "phLowWoodStool", x: -391.0, z: 48.4, ry: 0.6,
    note: "电灯厂北院东段：门口的小板凳" },

  // =========================================================================
  // 三 · 西关大街（z=0，x -470..-344.5）与沿街民居
  // =========================================================================

  // ---- 街西头，敞棚一带（北肩）----
  { asset: "clayWaterVat", x: -472.6, z: -11.2,
    note: "西关大街西头：路边人家的水缸" },
  { asset: "clayLiddedJar", x: -471.6, z: -10.4, ry: 0.3,
    note: "西关大街西头：有盖陶坛" },
  { asset: "firewoodPile", x: -473.0, z: -13.4, ry: 0.2,
    note: "西关大街西头：堆在棚后的柴垛" },
  { asset: "winnowingBasket", x: -473.6, z: -9.0, ry: 1.6,
    note: "西关大街西头：靠棚柱立着的簸箕" },
  { asset: "phRoughWoodTable", x: -470.4, z: -11.2, ry: 0.1,
    note: "西关大街西头：搬到棚外的粗木桌" },
  { asset: "phChineseWoodStool", x: -469.4, z: -10.2, ry: -0.3,
    note: "西关大街西头：桌边的中式方凳" },

  // ---- 两排铺面之间的空档（北肩）----
  { asset: "clayWaterVat", x: -441.0, z: -9.4,
    note: "西关大街铺面之间：接檐水的水缸" },
  { asset: "clayRoundVat", x: -440.1, z: -8.6, ry: 0.3,
    note: "西关大街铺面之间：圆腹陶缸" },
  { asset: "phWoodenBucket", x: -439.2, z: -9.6,
    note: "西关大街铺面之间：木水桶" },
  { asset: "ryFirewoodStack", x: -438.2, z: -8.4, ry: 0.2,
    note: "西关大街铺面之间：码齐的柴垛" },

  // ---- 东排铺面与通信队之间（北肩）：上了门板的铺子 ----
  { asset: "clothLantern", x: -424.6, z: -5.4,
    note: "西关大街铺面东头：铺子没摘的布灯笼" },
  { asset: "shopPlaque", x: -424.0, z: -6.6, ry: 1.55,
    note: "西关大街铺面东头：卸下来靠墙立的铺面门板" },
  { asset: "longBench", x: -422.6, z: -6.0, ry: 0.1,
    note: "西关大街铺面东头：铺子门口的木条凳" },
  { asset: "wovenBasket", x: -421.4, z: -6.8, ry: 0.5,
    note: "西关大街铺面东头：笸箩，货已经清空" },
  { asset: "firewoodPile", x: -422.0, z: -9.6, ry: 0.3,
    note: "西关大街铺面东头：后墙根的柴垛" },
  { asset: "ryChoppingBlock", x: -420.2, z: -9.0, ry: 0.4,
    note: "西关大街铺面东头：劈柴墩" },
  { asset: "phWoodAxe", x: -419.4, z: -8.2, ry: 1.2,
    note: "西关大街铺面东头：搁在柴墩边的木柄斧" },

  // ---- 通信队门前的街面（北肩）：杆料与待运的军粮 ----
  { asset: "battlefieldTimberBeam", x: -414.2, z: -13.4, ry: 0.08,
    note: "通信队门前：出院杆路用的备用木梁" },
  { asset: "ryTimberStack", x: -411.4, z: -13.0, ry: 0.2,
    note: "通信队门前：木料堆" },
  { asset: "phFirewoodBranches", x: -410.0, z: -12.2, ry: 0.4,
    note: "通信队门前：柴枝堆" },
  { asset: "clothLantern", x: -406.2, z: -14.0,
    note: "通信队门前：大门西侧的布灯笼" },
  { asset: "marketRiceSack01", x: -397.6, z: -12.6, ry: 0.4,
    note: "通信队门东：待运的军粮米袋" },
  { asset: "marketRiceSack02", x: -396.8, z: -13.4, ry: -0.2,
    note: "通信队门东：第二口米袋" },
  { asset: "marketBox02", x: -395.6, z: -12.4, ry: 0.3,
    note: "通信队门东：木箱，捆绳还在" },
  { asset: "militaryCrateClosed", x: -394.4, z: -13.2, ry: -0.15,
    note: "通信队门东：军用木箱" },
  { asset: "cart", x: -392.0, z: -11.0, ry: 0.28, scale: 0.9,
    note: "通信队门东：装到一半的大车，车头朝西门" },
  { asset: "crate", x: -390.2, z: -12.4, ry: 0.2,
    note: "通信队门东：车边待装的木箱" },

  // ---- 师部门前的街肩（第122师师部南墙外，通西门那一段）----
  { asset: "stoneWellCurb", x: -379.0, z: -13.0,
    note: "师部门前街肩：街边的石井台" },
  { asset: "ryWaterBucket", x: -377.8, z: -12.4, ry: 0.3,
    note: "师部门前街肩：井台边的木水桶" },
  { asset: "longBench", x: -375.6, z: -12.6, ry: 0.15,
    note: "师部门前街肩：井台边的木条凳" },
  { asset: "clayWideJar", x: -374.4, z: -13.2, ry: 0.4,
    note: "师部门前街肩：阔口陶坛" },
  { asset: "winnowingBasket", x: -357.2, z: -13.4, ry: 1.58,
    note: "西门外街肩：靠墙立着的簸箕" },
  { asset: "firewoodPile", x: -353.4, z: -14.2, ry: 0.25,
    note: "西门外街肩：柴垛" },
  { asset: "ryHayStack", x: -351.0, z: -13.0, ry: 0.1,
    note: "西门外街肩：秸秆垛" },
  { asset: "ryFeedTrough", x: -350.2, z: -15.4, ry: 1.55,
    note: "西门外街肩：牲口食槽，草垛北边" },

  // ---- 街南侧：货台边卸下的货 ----
  { asset: "marketBox03", x: -469.6, z: 16.4, ry: 0.2,
    note: "货台东侧：卸在台下的大木箱" },
  { asset: "marketBox02", x: -468.7, z: 17.4, ry: -0.3,
    note: "货台东侧：第二只木箱" },
  { asset: "marketCrate03", x: -469.8, z: 18.6, ry: 0.4,
    note: "货台东侧：板条箱" },
  { asset: "marketRiceSack01", x: -468.2, z: 19.6, ry: 0.6,
    note: "货台东侧：米袋" },
  { asset: "ryTimberStack", x: -470.0, z: 21.4, ry: 0.05,
    note: "货台东侧：木料堆" },
  { asset: "ryCartWheel", x: -468.4, z: 22.6, ry: 1.4,
    note: "货台东侧：立着的大车轮" },

  // ---- 街南的打谷场（关厢外的场院）----
  { asset: "ryHayStack", x: -462.2, z: 14.4, ry: 0.1,
    note: "街南打谷场：秸秆垛" },
  { asset: "ryHayStack", x: -460.9, z: 15.4, ry: -0.25, scale: 1.1,
    note: "街南打谷场：第二座秸秆垛" },
  { asset: "ryDryingRack", x: -458.4, z: 13.2, ry: 1.57,
    note: "街南打谷场：晾晒木架" },
  { asset: "ryFeedTrough", x: -456.6, z: 14.8, ry: 0.2,
    note: "街南打谷场：木食槽" },
  { asset: "ryVillageWell", x: -453.4, z: 16.6, ry: 0.3,
    note: "街南打谷场：场边的村井石台" },
  { asset: "ryWaterBucket", x: -452.0, z: 15.8,
    note: "街南打谷场：井边的木水桶" },
  { asset: "stoneMillWheel", x: -450.6, z: 17.2, ry: 0.4,
    note: "街南打谷场：石磨盘" },
  { asset: "ryFarmHoe", x: -449.2, z: 15.4, ry: 0.9,
    note: "街南打谷场：扔在场上的锄头" },
  { asset: "ryChoppingBlock", x: -447.8, z: 16.6, ry: 0.3,
    note: "街南打谷场：劈柴墩" },
  { asset: "bambooHat", x: -446.6, z: 15.6,
    note: "街南打谷场：掉在场上的斗笠" },

  // ---- 街南、通往电灯厂的斜路上：装到一半就撂下的家当 ----
  { asset: "cart", x: -435.6, z: 12.4, ry: 0.62, scale: 0.9,
    note: "去电灯厂的斜路口：装到一半的大车" },
  { asset: "crate", x: -434.0, z: 11.2, ry: 0.2,
    note: "去电灯厂的斜路口：车边的木箱" },
  { asset: "marketBox02", x: -433.2, z: 12.4, ry: -0.35,
    note: "去电灯厂的斜路口：捆好的木箱" },
  { asset: "phWickerBasketLidded", x: -434.4, z: 13.8, ry: 0.4,
    note: "去电灯厂的斜路口：带盖竹篮" },
  { asset: "clayLiddedJar", x: -436.8, z: 14.0, ry: 0.15,
    note: "去电灯厂的斜路口：有盖陶坛" },
  { asset: "wovenBasket", x: -437.6, z: 12.8, ry: 0.5,
    note: "去电灯厂的斜路口：笸箩" },
  { asset: "phRoughWoodTable", x: -438.4, z: 15.2, ry: 0.1,
    note: "去电灯厂的斜路口：搬出来没带走的粗木桌" },

  // ---- 电灯厂西北的空场 ----
  { asset: "ryHayStack", x: -424.6, z: 30.2, ry: 0.2,
    note: "电灯厂西北空场：秸秆垛" },
  { asset: "ryFirewoodStack", x: -423.4, z: 31.4, ry: 0.1,
    note: "电灯厂西北空场：柴垛" },
  { asset: "phFirewoodBranches", x: -422.2, z: 30.4, ry: 0.5,
    note: "电灯厂西北空场：柴枝堆" },
  { asset: "ryChoppingBlock", x: -421.0, z: 31.6, ry: 0.3,
    note: "电灯厂西北空场：劈柴墩" },

  // =========================================================================
  // 四 · 村缘农院（铁路西侧的打谷场 + 交易所南面的场院）
  // =========================================================================

  { asset: "ryHayStack", x: -499.6, z: -142.4, ry: 0.1,
    note: "铁路西侧场院：秸秆垛" },
  { asset: "ryHayStack", x: -498.2, z: -143.6, ry: -0.3, scale: 1.15,
    note: "铁路西侧场院：第二座秸秆垛" },
  { asset: "ryDryingRack", x: -496.0, z: -140.0, ry: 0.1,
    note: "铁路西侧场院：晾晒木架" },
  { asset: "ryFeedTrough", x: -494.2, z: -141.6, ry: 1.5,
    note: "铁路西侧场院：木食槽" },
  { asset: "ryFarmHoe", x: -497.4, z: -138.2, ry: 0.7,
    note: "铁路西侧场院：扔在场上的锄头" },
  { asset: "ryVillageWell", x: -502.6, z: -138.6, ry: 0.2,
    note: "铁路西侧场院：村井石台" },
  { asset: "ryFirewoodPit", x: -491.6, z: -140.0, ry: 0.4,
    note: "铁路西侧场院：石圈柴堆" },
  { asset: "ryYardBench", x: -493.0, z: -138.4, ry: 0.2,
    note: "铁路西侧场院：长条木凳" },
  { asset: "bambooHat", x: -495.6, z: -137.0,
    note: "铁路西侧场院：从晾架上落下来的斗笠" },

  { asset: "ryHayStack", x: -446.0, z: 146.0, ry: 0.2,
    note: "交易所南场院：秸秆垛" },
  { asset: "ryHayStack", x: -444.6, z: 147.2, ry: -0.2, scale: 1.1,
    note: "交易所南场院：第二座秸秆垛" },
  { asset: "ryDryingRack", x: -442.0, z: 144.6, ry: 1.57,
    note: "交易所南场院：晾晒木架" },
  { asset: "ryFeedTrough", x: -440.2, z: 146.2, ry: 0.2,
    note: "交易所南场院：木食槽" },
  { asset: "ryFarmHoe", x: -437.4, z: 146.6, ry: 1.0,
    note: "交易所南场院：锄头" },
  { asset: "ryVillageWell", x: -448.4, z: 149.6, ry: 0.1,
    note: "交易所南场院：村井石台" },
  { asset: "ryCartWheel", x: -435.6, z: 147.6, ry: 1.3,
    note: "交易所南场院：靠着晾架立的大车轮" },
]);
