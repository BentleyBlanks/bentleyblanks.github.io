// 界河一带的村落与原野（x -620..620, z -1620..-900，独立场景 L0）—— 外部道具层。
//
// 本文件属于一个并行工作包：**只有界河包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。此地不是滕县城 —— 地形与村落读
// Script_JieheField / Script_JieheHeight（石墙村等），主路沿 x≈0 南北向。
// 埋墙与叠桩由 Script_DressingProbeTest 兜底，截图自查必做。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs
//      node Taierzhuang1938/Script_DressingProbeTest.mjs --phases=0
//
// ---------------------------------------------------------------------------
// 【这一片摆的是什么】三月十四日拂晓，界河南岸。
//
// 城里那六关摆的是**被战争打断的生活**（装到一半的车、抢出来的箱子）。这里不是：
// 前线刚推到界河北岸，村子还没被碾过，所以一切都是**进行时**——
// 井台边桶还在、磨盘上摊着簸箕、猪食槽里有食、晾杆上挂着东西、劈柴墩上戳着斧、
// 锄头就搁在田头。人是刚走开，不是死了或逃了。这是给玩家一路南撤时的对照：
// 他守的、退过的，是还在过日子的鲁南农村。
//
// 只有沿目标链（Approach 0,-1420 → Kan 0,-1255 → Beishahe 0,-1000）那一条走廊
// 上，才叠**极少量**军事痕迹（弹药箱与掩布共 6 件）。阵地工事（沙袋/拒马/铁丝网/
// 胸墙/散兵坑）一律归程序化层（Script_TengxianOutfield 的 parapets/pits），
// 这一层一件都不摆 —— 两层各画一遍会在同一道胸墙上叠两组几何。
//
// 【选点的四条纪律】
//   · 与程序化的村生活组（TengxianOutfield.AddVillageProps → LivedInProps
//     .AddVillageLife）**错开**：那一组永远落在正房门前 3—4 m 的院心，
//     所以本层只进**山墙根、屋后、院外、场院与村缘**，不与它抢那块地。
//   · 每村一两口井（ryVillageWell 大井台 / stoneWellCurb 小井圈），井边必有桶。
//   · 大车路（程序化，x≈-150 一线穿石墙村）与 x≈0 的主撤退走廊都留净空。
//   · 坐标是照 L0 引擎实测碰撞盒（quality=high）扫出来的空位，不是估的。
//
// 【放弃项】① 远村 LiangxiadianW/E（z≈-1652/-1668）在本区 bounds 之外，不摆；
// ② 北沙河镇（315,-1050）离主走廊二百五十米以上、永远在雾外，只留七件；
// ③ 阵地工事件（沙袋/拒马/铁丝网）与 house 系、碉堡、战壕地形、地面片一概不用。
// ---------------------------------------------------------------------------

export const REGION = Object.freeze({
  id: "JieheVillages", kind: "outfield", label: "界河村落",
  bounds: { minX: -620, maxX: 620, minZ: -1620, maxZ: -900 },
});

export const PLACEMENTS = Object.freeze([
  // =========================================================================
  // 一 · 石墙村北院（ShiqiangNorthYard，-74,-1390）
  // 出生点 (0,-1470) 左前 65—105 m —— **开场镜头里唯一读得出细节的一组院子**，
  // 所以这一村给得最满：一口井、一盘碾、一院早饭、一院劈柴。
  // =========================================================================
  { asset: "ryVillageWell", x: -55.4, z: -1368.1, ry: 0.06,
    note: "北院当中的井台：两根横梁架在石井圈上，全村吃水都在这儿" },
  { asset: "phWoodenBucket", x: -54.5, z: -1369.0, ry: 0.5,
    note: "井台北沿撂着的木桶，绳还在梁上" },
  { asset: "ryWaterBucket", x: -56.4, z: -1369.1, ry: -0.8,
    note: "井台另一侧的第二只桶，刚打满" },
  { asset: "phWoodenWashTub", x: -52.6, z: -1367.2, ry: 0.24,
    note: "井南三步的木盆，早上在这儿洗菜" },
  { asset: "stoneMillWheel", x: -63.4, z: -1365.7, ry: 0.4,
    note: "井西的碾道：一扇石磨盘，磨眼朝天" },
  { asset: "wovenBasket", x: -62.6, z: -1366.6, ry: -0.35,
    note: "磨盘边搁着的笸箩，磨完的面还没收" },
  { asset: "clayWaterVat", x: -54.6, z: -1371.6, ry: 0.12,
    note: "东厢山墙前的水缸，从井里挑满的" },
  { asset: "clayLiddedJar", x: -55.5, z: -1372.4, ry: -0.5,
    note: "水缸旁的有盖陶坛，腌菜用" },
  { asset: "ryFirewoodStack", x: -67.2, z: -1371.5, ry: 1.55,
    note: "西山墙根码齐的柴垛，长边顺墙" },
  { asset: "ryHayStack", x: -69.2, z: -1367.0, ry: 0.3,
    note: "柴垛外的秸秆垛，牲口料" },
  { asset: "phRoughWoodTable", x: -43.3, z: -1377.0, ry: 0.18,
    note: "东头一户的院里粗木桌 —— 天暖了就在院里吃饭" },
  { asset: "phLowWoodStool", x: -42.4, z: -1377.7, ry: -0.6,
    note: "桌边踢开的小板凳" },
  { asset: "longBench", x: -43.1, z: -1373.4, ry: 0.08,
    note: "同院的木条凳，顺着院墙摆" },
  { asset: "bambooHat", x: -44.3, z: -1368.3, ry: 0.9,
    note: "扣在条凳外空地上的斗笠" },
  { asset: "phWickerTray", x: -40.4, z: -1375.3, ry: -0.25,
    note: "笸箩式的竹编浅筐，晒着东西" },
  { asset: "phFirewoodBranches", x: -70.4, z: -1388.6, ry: 0.4,
    note: "屋后堆的柴枝，还没归垛" },
  { asset: "ryChoppingBlock", x: -73.8, z: -1388.7, ry: -0.3,
    note: "屋后的劈柴墩" },
  { asset: "phWoodAxe", x: -73.0, z: -1389.5, ry: 1.1,
    note: "撂在墩子边的木柄斧 —— 人是刚走开，不是逃了" },
  { asset: "ryDryingRack", x: -65.5, z: -1378.6, ry: 0.05,
    note: "院外的晾晒木架：晾衣、晒粮、拴牲口都用它" },
  { asset: "ryFeedTrough", x: -72.6, z: -1374.6, ry: 0.22,
    note: "院深处的木食槽，槽里还有料" },
  { asset: "ryTimberStack", x: -53.1, z: -1392.6, ry: 1.5,
    note: "屋后码着的木料 —— 这户正在翻盖房子" },
  { asset: "ryCartWheel", x: -40.7, z: -1381.1, ry: 0.85,
    note: "靠着院外土墙立的大车轮，卸下来等修" },
  { asset: "clayRoundVat", x: -39.5, z: -1393.3, ry: -0.15,
    note: "东山墙根的圆腹陶缸，接檐水" },
  { asset: "ryHayStack", x: -43.2, z: -1397.4, ry: -0.4,
    note: "南头那户屋后的秸秆垛" },
  { asset: "ryFirewoodStack", x: -47.5, z: -1397.4, ry: 1.48,
    note: "并排的柴垛，一冬烧剩的" },
  { asset: "ryFarmHoe", x: -37.5, z: -1386.7, ry: 0.45,
    note: "院外地头随手放倒的锄头 —— 三月正锄麦垄" },
  { asset: "phIronSpade", x: -51.2, z: -1397.1, ry: 0.3,
    note: "掉在院里的铁锹" },
  { asset: "winnowingBasket", x: -41.6, z: -1403.8, ry: 1.57,
    note: "靠东山墙立着的簸箕，扬完场就搁在墙上" },
  { asset: "phWoodLantern", x: -38.8, z: -1399.4, ry: -0.2,
    note: "院门边的木框风灯，拂晓还没收" },

  // =========================================================================
  // 二 · 石墙村（Shiqiang，-154,-1344，一圈干垒石墙 —— 地名的由来）
  // 本关最大的一个村，玩家从北院退下来正好从它东头擦过去。
  // 大车路（程序化）沿 x≈-155 穿村而过，摆位一律避开那条街心。
  // =========================================================================
  // --- 东头（离主走廊最近的一片，玩家真会走进去） ---
  { asset: "ryVillageWell", x: -108.5, z: -1328.9, ry: -0.1,
    note: "东头井台：石墙村东半个村吃水的井" },
  { asset: "phWoodenBucket", x: -109.5, z: -1329.7, ry: 0.7,
    note: "井沿上的木桶" },
  { asset: "stoneMillWheel", x: -106.3, z: -1331.7, ry: 0.25,
    note: "井南的碾盘，碾道就在井边" },
  { asset: "clayWaterVat", x: -110.5, z: -1331.7, ry: -0.18,
    note: "碾道西侧那户的水缸" },
  { asset: "winnowingBasket", x: -103.6, z: -1339.6, ry: 1.57,
    note: "靠东山墙立着的簸箕" },
  { asset: "clayRoundVat", x: -113.7, z: -1339.7, ry: 0.32,
    note: "西山墙根的圆腹陶缸" },
  { asset: "ryFirewoodStack", x: -106.5, z: -1343.6, ry: 1.52,
    note: "屋后码的柴垛" },
  { asset: "phFirewoodBranches", x: -110.3, z: -1343.6, ry: -0.35,
    note: "柴垛旁散着的柴枝" },
  { asset: "ryChoppingBlock", x: -115.8, z: -1333.2, ry: 0.4,
    note: "院外的劈柴墩" },
  { asset: "phWoodAxe", x: -116.6, z: -1332.5, ry: -1.2,
    note: "斧子还戳在墩子边上" },
  { asset: "ryTimberStack", x: -113.4, z: -1357.1, ry: 1.45,
    note: "北边一户屋后的木料堆" },
  { asset: "phWoodLantern", x: -115.0, z: -1351.7, ry: 0.15,
    note: "院外土墙下挂过夜的风灯" },
  { asset: "phRoughWoodTable", x: -126.0, z: -1351.8, ry: -0.12,
    note: "村中一户的院里粗木桌" },
  { asset: "longBench", x: -131.4, z: -1352.1, ry: 0.2,
    note: "桌对面的木条凳" },
  { asset: "phLowWoodStool", x: -125.2, z: -1352.5, ry: 0.8,
    note: "桌边的小板凳" },
  { asset: "bambooHat", x: -120.1, z: -1352.8, ry: -0.7,
    note: "院外撂着的斗笠" },
  { asset: "clayLiddedJar", x: -137.1, z: -1353.9, ry: 0.5,
    note: "西邻院外的有盖陶坛" },
  { asset: "ryCartWheel", x: -128.9, z: -1349.2, ry: 1.0,
    note: "院深处立着的大车轮" },
  { asset: "ryFarmHoe", x: -127.2, z: -1339.0, ry: -0.5,
    note: "院外地头的锄头" },
  { asset: "phIronSpade", x: -136.2, z: -1337.2, ry: 0.28,
    note: "院里的铁锹" },
  { asset: "ryDryingRack", x: -144.7, z: -1328.1, ry: 0.1,
    note: "村中的晾晒木架" },
  { asset: "ryFeedTrough", x: -149.9, z: -1328.5, ry: -0.2,
    note: "晾架旁的木食槽" },
  { asset: "wovenBasket", x: -147.5, z: -1325.5, ry: 0.6,
    note: "食槽边的笸箩" },
  { asset: "phWickerTray", x: -138.9, z: -1329.0, ry: -0.45,
    note: "摊在院外空地上的竹编浅筐" },
  // --- 中段（大车路以西，村里的老院子） ---
  { asset: "ryHayStack", x: -166.4, z: -1364.7, ry: 0.35,
    note: "北头屋后的秸秆垛" },
  { asset: "ryFirewoodStack", x: -161.0, z: -1364.9, ry: 1.5,
    note: "秸秆垛东边的柴垛" },
  { asset: "clayLuggedJar", x: -166.2, z: -1352.7, ry: -0.3,
    note: "院心西侧的带耳陶罐" },
  { asset: "phWoodenWashTub", x: -163.2, z: -1350.0, ry: 0.4,
    note: "院深处的木盆" },
  { asset: "phWoodenBucket", x: -177.6, z: -1334.4, ry: -0.55,
    note: "屋后的木桶" },
  { asset: "ryCartWheel", x: -178.8, z: -1321.8, ry: 0.7,
    note: "院心西的大车轮" },
  // --- 西头（石墙里最深的一片，另一口井） ---
  { asset: "stoneWellCurb", x: -198.1, z: -1332.8, ry: 0.2,
    note: "西头的小井圈 —— 石墙村里的第二口井" },
  { asset: "ryWaterBucket", x: -197.2, z: -1333.7, ry: 0.6,
    note: "小井圈边的木水桶" },
  { asset: "stoneMillWheel", x: -195.1, z: -1335.5, ry: -0.4,
    note: "西头的碾盘" },
  { asset: "firewoodPile", x: -201.1, z: -1335.5, ry: 0.15,
    note: "西头一户的大柴垛" },
  { asset: "ryHayStack", x: -207.1, z: -1336.9, ry: -0.25,
    note: "柴垛西的秸秆垛" },
  { asset: "ryFarmHoe", x: -195.3, z: -1347.4, ry: 0.32,
    note: "屋后墙根的锄头" },
  { asset: "ryTimberStack", x: -207.4, z: -1350.0, ry: 1.4,
    note: "西南角屋后的木料堆" },
  { asset: "ryFeedTrough", x: -192.5, z: -1368.4, ry: 0.18,
    note: "北墙内一户院外的木食槽" },
  { asset: "clayWaterVat", x: -198.2, z: -1366.9, ry: -0.22,
    note: "同院院心东的水缸" },
  // --- 村南场院（石墙以内、南墙根的打谷场：草垛群） ---
  { asset: "ryHayStack", x: -188.9, z: -1299.0, ry: 0.2,
    note: "村南打谷场的草垛群（一）—— 秋后打完场就垛在这儿" },
  { asset: "ryHayStack", x: -185.2, z: -1301.4, ry: -0.45,
    note: "村南打谷场的草垛群（二）" },
  { asset: "ryHayStack", x: -180.4, z: -1298.7, ry: 0.62,
    note: "村南打谷场的草垛群（三）" },
  { asset: "ryTimberStack", x: -192.5, z: -1299.1, ry: 0.06,
    note: "场院西头的木料堆" },
  { asset: "phWickerTray", x: -176.8, z: -1297.3, ry: -0.8,
    note: "场院上摊着的竹编浅筐" },
  { asset: "ryDryingRack", x: -169.2, z: -1302.2, ry: 1.52,
    note: "场院东头的晾晒木架" },
  { asset: "wovenBasket", x: -198.3, z: -1303.4, ry: 0.5,
    note: "场院北沿的笸箩" },

  // =========================================================================
  // 三 · 河湾东院（RiverbankEastYard，68,-1394）
  // 出生点右前方的一组院子，与北院左右对称，撑住开场镜头的另一半。
  // =========================================================================
  { asset: "ryVillageWell", x: 65.5, z: -1379.6, ry: -0.12,
    note: "河湾东院的井台" },
  { asset: "ryWaterBucket", x: 64.6, z: -1380.5, ry: 0.55,
    note: "井边的木水桶" },
  { asset: "stoneMillWheel", x: 68.0, z: -1382.2, ry: 0.3,
    note: "井北的碾盘" },
  { asset: "clayWaterVat", x: 63.3, z: -1382.5, ry: -0.2,
    note: "碾道西的水缸" },
  { asset: "wovenBasket", x: 71.5, z: -1381.4, ry: 0.7,
    note: "院外的笸箩" },
  { asset: "ryHayStack", x: 77.8, z: -1380.3, ry: 0.15,
    note: "东头院心的秸秆垛" },
  { asset: "ryFirewoodStack", x: 80.1, z: -1381.6, ry: 1.46,
    note: "秸秆垛边的柴垛" },
  { asset: "winnowingBasket", x: 78.8, z: -1396.1, ry: 1.57,
    note: "靠屋后西墙立着的簸箕" },
  { asset: "ryFeedTrough", x: 78.3, z: -1403.7, ry: -0.25,
    note: "南院的木食槽" },
  { asset: "ryDryingRack", x: 62.2, z: -1401.1, ry: 0.08,
    note: "院心西的晾晒木架" },
  { asset: "phWoodenWashTub", x: 56.1, z: -1402.9, ry: 0.35,
    note: "院外的木盆" },
  { asset: "ryChoppingBlock", x: 63.4, z: -1412.8, ry: -0.4,
    note: "屋后的劈柴墩" },
  { asset: "phWoodAxe", x: 64.3, z: -1413.5, ry: 0.9,
    note: "斧子撂在墩边" },
  { asset: "phFirewoodBranches", x: 57.1, z: -1413.4, ry: 0.5,
    note: "院外散着的柴枝" },
  { asset: "ryFarmHoe", x: 46.2, z: -1395.5, ry: -0.6,
    note: "西头院深处的锄头" },
  { asset: "clayLiddedJar", x: 89.5, z: -1401.5, ry: 0.4,
    note: "东南一户院心的有盖陶坛" },
  { asset: "ryCartWheel", x: 95.4, z: -1402.4, ry: 1.05,
    note: "院外立着的大车轮" },

  // =========================================================================
  // 四 · 东场农院（EastFieldstead，92,-1308）—— 几处生产院落与棚屋
  // 这不是住人的村，是一片**独户农院**：喂牲口、劈柴、修车、堆料。
  // =========================================================================
  { asset: "ryFeedTrough", x: 88.4, z: -1309.6, ry: 0.12,
    note: "敞棚下的木食槽（一）—— 猪食槽，槽里还有食" },
  { asset: "ryFeedTrough", x: 91.3, z: -1307.8, ry: -0.35,
    note: "敞棚下的木食槽（二）" },
  { asset: "ryTimberStack", x: 93.4, z: -1313.8, ry: 1.5,
    note: "棚外码着的木料" },
  { asset: "firewoodPile", x: 110.3, z: -1319.3, ry: 0.1,
    note: "农院里的大柴垛" },
  { asset: "ryChoppingBlock", x: 103.9, z: -1318.9, ry: 0.45,
    note: "柴垛边的劈柴墩" },
  { asset: "phWoodAxe", x: 104.8, z: -1319.6, ry: -1.0,
    note: "斧子搁在墩上" },
  { asset: "ryCartWheel", x: 97.5, z: -1319.9, ry: 0.95,
    note: "卸下来的大车轮（一）—— 这院子正在修车" },
  { asset: "ryCartWheel", x: 107.3, z: -1316.3, ry: -0.75,
    note: "卸下来的大车轮（二）" },
  { asset: "ryDryingRack", x: 111.7, z: -1321.6, ry: 1.54,
    note: "院里的晾晒木架" },
  { asset: "stoneWellCurb", x: 87.7, z: -1291.2, ry: 0.22,
    note: "独户农院自己的小井圈" },
  { asset: "phWoodenBucket", x: 88.6, z: -1291.9, ry: -0.5,
    note: "井圈边的木桶" },
  { asset: "clayRoundVat", x: 105.5, z: -1280.7, ry: 0.28,
    note: "北头院心的圆腹陶缸" },
  { asset: "wovenBasket", x: 111.2, z: -1280.4, ry: -0.6,
    note: "陶缸东边的笸箩" },
  { asset: "ryHayStack", x: 121.6, z: -1280.0, ry: 0.4,
    note: "农院北缘的草垛群（一）" },
  { asset: "ryHayStack", x: 108.2, z: -1277.7, ry: -0.5,
    note: "农院北缘的草垛群（二）" },
  { asset: "ryFarmHoe", x: 99.6, z: -1282.3, ry: 0.7,
    note: "田头搁着的锄头 —— 麦地就在院外" },
  { asset: "phIronSpade", x: 101.8, z: -1286.6, ry: -0.3,
    note: "山墙前立着的铁锹" },
  { asset: "bambooHat", x: 78.2, z: -1295.6, ry: 0.85,
    note: "扣在西头空地上的斗笠" },
  { asset: "ryFirewoodStack", x: 122.3, z: -1302.4, ry: 1.44,
    note: "东头屋后的柴垛" },

  // =========================================================================
  // 五 · 坎路小村（KanRoadHamlet，-112,-1186）
  // 土坎（Kan，0,-1255）以南、玩家越坎回身守之后经过的那个村。
  // =========================================================================
  { asset: "ryVillageWell", x: -112.2, z: -1157.9, ry: 0.08,
    note: "坎路小村的井台" },
  { asset: "phWoodenBucket", x: -111.3, z: -1158.8, ry: -0.45,
    note: "井边的木桶" },
  { asset: "ryWaterBucket", x: -113.2, z: -1158.7, ry: 0.75,
    note: "井边的第二只桶" },
  { asset: "stoneMillWheel", x: -109.7, z: -1160.7, ry: 0.35,
    note: "井南的碾盘" },
  { asset: "clayWaterVat", x: -114.7, z: -1160.7, ry: -0.25,
    note: "碾道西的水缸" },
  { asset: "wovenBasket", x: -104.0, z: -1162.1, ry: 0.55,
    note: "院外的笸箩" },
  { asset: "ryHayStack", x: -120.3, z: -1162.1, ry: -0.35,
    note: "村北的秸秆垛" },
  { asset: "ryFirewoodStack", x: -109.9, z: -1173.4, ry: 1.5,
    note: "屋后的柴垛" },
  { asset: "phFirewoodBranches", x: -114.5, z: -1173.4, ry: 0.4,
    note: "柴垛旁散着的柴枝" },
  { asset: "ryFeedTrough", x: -126.8, z: -1179.4, ry: 0.15,
    note: "院心东的木食槽" },
  { asset: "ryDryingRack", x: -132.3, z: -1179.2, ry: 0.06,
    note: "院心西的晾晒木架" },
  { asset: "ryFarmHoe", x: -121.1, z: -1181.0, ry: -0.55,
    note: "院外地头的锄头" },
  { asset: "phIronSpade", x: -105.6, z: -1180.8, ry: 0.3,
    note: "院外的铁锹" },
  { asset: "phRoughWoodTable", x: -79.6, z: -1191.5, ry: 0.14,
    note: "东头一户院心的粗木桌" },
  { asset: "longBench", x: -74.3, z: -1191.4, ry: -0.18,
    note: "桌东的木条凳" },
  { asset: "phLowWoodStool", x: -80.4, z: -1192.2, ry: 0.9,
    note: "桌边的小板凳" },
  { asset: "bambooHat", x: -77.0, z: -1188.7, ry: -0.8,
    note: "院深处撂着的斗笠" },
  { asset: "clayLiddedJar", x: -92.7, z: -1185.9, ry: 0.42,
    note: "东山墙前的有盖陶坛" },
  { asset: "winnowingBasket", x: -103.4, z: -1185.5, ry: 1.57,
    note: "靠西山墙立着的簸箕" },
  { asset: "ryChoppingBlock", x: -90.4, z: -1203.2, ry: -0.4,
    note: "南头屋后的劈柴墩" },
  { asset: "phWoodAxe", x: -89.5, z: -1203.9, ry: 1.15,
    note: "斧子撂在墩边" },
  { asset: "ryTimberStack", x: -134.6, z: -1199.5, ry: 1.42,
    note: "西南一户院心的木料堆" },
  { asset: "ryHayStack", x: -140.4, z: -1201.4, ry: 0.25,
    note: "村西南缘的秸秆垛" },
  { asset: "ryCartWheel", x: -122.6, z: -1199.9, ry: 0.8,
    note: "院外立着的大车轮" },
  { asset: "phWoodLantern", x: -92.3, z: -1189.2, ry: -0.15,
    note: "院深处挂过夜的风灯" },

  // =========================================================================
  // 六 · 北沙河镇（BeishaheTown，315,-1050）—— 只做**七件**
  // 镇子离主走廊（x≈0）二百五十米以上，雾（fog.max 0.93）在两百多米外就把
  // 东西吃干净，玩家一路南撤永远走不到它跟前。摆一组「村口井 + 场院」够了：
  // 剩下的件数留给玩家真会走进去的那几个村。
  // =========================================================================
  { asset: "ryVillageWell", x: 330.1, z: -1049.5, ry: -0.08,
    note: "北沙河镇西头的井台" },
  { asset: "phWoodenBucket", x: 331.0, z: -1050.3, ry: 0.6,
    note: "井边的木桶" },
  { asset: "stoneMillWheel", x: 342.5, z: -1051.0, ry: 0.3,
    note: "镇上的碾盘" },
  { asset: "clayWaterVat", x: 323.9, z: -1050.9, ry: -0.2,
    note: "碾道西的水缸" },
  { asset: "ryHayStack", x: 352.2, z: -1052.2, ry: 0.35,
    note: "镇东场院的草垛（一）" },
  { asset: "ryHayStack", x: 344.0, z: -1056.3, ry: -0.4,
    note: "镇东场院的草垛（二）" },
  { asset: "ryFirewoodStack", x: 330.3, z: -1061.9, ry: 1.48,
    note: "屋后的柴垛" },

  // =========================================================================
  // 七 · 阵地一带的军事痕迹（共 6 件，全部离 x=0 走廊 12 m 以上）
  // 「他们的炮先来，人后来」—— 三道目标线上各留一点补给的影子。
  // 工事本体（胸墙/散兵坑/弹坑）归程序化层，这里一件都不摆。
  // =========================================================================
  { asset: "militaryCrateOpen", x: -18.0, z: -1445.0, ry: 0.3,
    note: "界河南岸一线：撬开分弹的木箱，胸墙后十来米" },
  { asset: "militaryCrateClosed", x: -16.9, z: -1445.7, ry: -0.22,
    note: "一线：还没撬的第二只弹药箱" },
  { asset: "battlefieldCanvasCover01", x: 18.0, z: -1445.0, ry: 0.2,
    note: "一线东段：盖在弹药上的掩布，露水打湿了" },
  { asset: "battlefieldCanvasCover02", x: -15.5, z: -1266.5, ry: -0.3,
    note: "土坎北坡后的掩布 —— 第二线预储的一点东西" },
  { asset: "militaryCrateClosed", x: 13.0, z: -1272.0, ry: 0.5,
    note: "土坎南侧：往后送的弹药箱撂在坎根" },
  { asset: "militaryCrateOpen", x: -16.0, z: -1018.5, ry: -0.4,
    note: "北沙河村口：接应部队卸下的空木箱" },
// --- 村南来路（主会话整合验收补摆，2026-08-25）---
  // 标准回归机位 Z5/L0_JieheVillage 站在 (-154,-1278) 朝北看村：原 149 件全在
  // 石墙以内与院中，来路正面 30 m 是素的。补一手「村子的外脸」：来路两旁的
  // 草垛、柴垛、村口的大车与磨盘 —— 村里人本来就把这些堆在墙外。
  // 穿村大车路（x≈-155 ±3）照旧让开。第一版摆在 z -1297..-1310 —— 那一带是
  // 层层抬高的田台（机位地面比件低 2.3 m），件全部藏进坎后的死角还压了两道
  // fieldBank；前移到机位视野内的近场（z -1288..-1296）。
  { asset: "ryHayStack", x: -165.0, z: -1291.5, ry: 0.4,
    note: "村南来路西侧：墙外的秸秆垛，去秋垛下的" },
  { asset: "ryHayStack", x: -162.3, z: -1294.0, ry: 1.1, scale: 0.92,
    note: "村南来路西侧：第二座秸秆垛，与前一座错开半个身位" },
  { asset: "stoneMillWheel", x: -169.5, z: -1289.5, ry: 0.2,
    note: "村南来路西侧：闲置的石磨盘，平放在垛前的空地上" },
  { asset: "firewoodPile", x: -146.0, z: -1290.5, ry: 0.3,
    note: "村南来路东侧：贴着来路的柴垛" },
  { asset: "ryChoppingBlock", x: -144.4, z: -1288.8, ry: 0.7,
    note: "村南来路东侧：柴垛旁的劈柴墩" },
  { asset: "phWoodAxe", x: -145.1, z: -1288.2, ry: 1.9,
    note: "村南来路东侧：搁在墩边的木柄斧" },
  { asset: "cart", x: -136.0, z: -1292.5, ry: 0.15, scale: 0.94,
    note: "村口东侧：卸空的大车，车辕朝村门 —— 早上刚运完粪肥" },
  { asset: "wovenBasket", x: -137.4, z: -1291.2, ry: 0.8,
    note: "村口东侧：挂在车帮上摘下来的笸箩，撂在车边" },
]);
