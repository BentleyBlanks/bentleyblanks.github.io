// 城防带（顺城街一圈、四门里侧、两处缺口、上城道口）的战地布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有城防包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。城防包只摆墙根/门里/缺口一带的军用件，
// 街肩生活件归 Data_Dressing_MainStreets，院内家什归四个片区包。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs

export const REGION = Object.freeze({
  id: "Defenses", kind: "defense", label: "城防带",
  bounds: { minX: -298, maxX: 298, minZ: -298, maxZ: 298 },
});

/**
 * 布设口径 —— 1938 年 3 月 14—18 日的滕县城防，物质现实决定了这里摆什么：
 *
 *   · 122 师三分之一以上的兵没有步枪，**手榴弹是主武器** —— 所以墙根一路
 *     散的是手榴弹堆，不是弹药箱堆成的山。
 *   · 没有战防炮、没有大口径炮兵阵地，只有少量迫击炮 —— 全城只给一处炮弹堆
 *     （东南角望角楼下的迫击炮位），多一处都是假的。
 *   · 工事材料是土袋、门板、木梁、拆下来的石块 —— 沙袋组 + 木梁障碍 + 垫脚石
 *     是主角；碉堡与战壕地形（战场包里有现成模型）**一件不摆**，那是另一场战争。
 *
 * 空间上守三条线：
 *   1  马道只有四条，是全城唯一的上下城通路 —— 坡身与坡脚走行面一律留空；
 *   2  四座门洞的通路（含西门那条只剩一人宽的活口与 z ∈ ±5.35 的通视走廊）
 *      不许有任何实心件；
 *   3  L4 的目标链（spawn → Rampway → Rampart → SouthWall → SouthBreach）
 *      整条压在顺城街东段与南段上 —— 工事一律摆在连线**两侧**张开，
 *      横在线上的大件会重演东关排屋那次「隔墙互相摸不到、全关停摆」。
 */
export const PLACEMENTS = Object.freeze([
  // ── 南墙缺口（缺口中心 285,305，宽 20）内侧 —— L4 的最后一个目标，主战场 ──
  // 东肩：两组沙袋斜着张开成八字，正对缺口豁口，人贴着蹲在后面往缺口打。
  { asset: "battlefieldSandbag02", x: 296.0, z: 293.5, ry: -0.55, scale: 1.1,
    note: "南墙缺口·东肩八字胸墙外道（沙袋斜张，枪口指缺口）" },
  { asset: "battlefieldSandbag03", x: 294.3, z: 296.6, ry: -1.0, scale: 1.0,
    note: "南墙缺口·东肩八字胸墙里道（贴缺口坡脚）" },
  { asset: "battlefieldGrenadeStack", x: 295.6, z: 290.6, ry: -0.4, scale: 0.85,
    note: "南墙缺口·东肩手榴弹堆（守缺口的主火力就是这个）" },
  { asset: "battlefieldSupplyBox", x: 293.0, z: 294.2, ry: 0.3, scale: 1.0,
    note: "南墙缺口·东肩弹药补给箱" },
  { asset: "battlefieldCanvasCover02", x: 291.6, z: 297.2, ry: 0.25, scale: 1.0,
    note: "南墙缺口·东肩掩布（盖住备用手榴弹箱，防夜露）" },
  // 西肩：贴 L4 连线太近，只摆矮扁的小件，绝不横大件。
  { asset: "battlefieldGrenadeStack", x: 276.5, z: 291.0, ry: 0.5, scale: 0.9,
    note: "南墙缺口·西肩手榴弹堆（矮件，不挡缺口进攻轴）" },
  { asset: "battlefieldSupplyBox", x: 272.2, z: 291.4, ry: -0.2, scale: 0.95,
    note: "南墙缺口·西肩弹药箱" },
  { asset: "battlefieldCartridgeScatter", x: 280.0, z: 289.6, ry: 0.7, scale: 1.0,
    note: "南墙缺口·西肩散落弹壳（打了三天的痕迹）" },
  { asset: "battlefieldGroundSheet", x: 278.6, z: 293.4, ry: 0.15, scale: 1.2,
    note: "南墙缺口·西肩地面帆布（抬伤员下来的落脚处，非实心）" },

  // ── 东南角望角楼下的迫击炮位（全城唯一一处炮弹堆）──
  { asset: "battlefieldSandbag01", x: 288.0, z: 268.0, ry: 1.5708, scale: 1.15,
    note: "东南角迫击炮位·沙袋围壁（沿顺城街东侧，让开 L4 连线）" },
  { asset: "battlefieldShellStack", x: 289.6, z: 271.2, ry: 1.4, scale: 1.0,
    note: "东南角迫击炮位·迫击炮弹堆（少量迫击炮是本战唯一的曲射火力）" },
  { asset: "battlefieldSandbag03", x: 287.6, z: 274.2, ry: 1.5708, scale: 1.05,
    note: "东南角迫击炮位·沙袋围壁南段" },

  // ── 南墙墙根散兵线（L4 的 SouthWall 目标 150,296 一带，工事全在连线南侧墙根）──
  { asset: "battlefieldSandbag01", x: 162.0, z: 291.0, ry: 0.0, scale: 1.1,
    note: "南墙·西段墙根胸墙（土袋垒的散兵位）" },
  { asset: "battlefieldGrenadeStack", x: 166.6, z: 288.6, ry: 0.2, scale: 0.9,
    note: "南墙·西段墙根手榴弹堆" },
  { asset: "battlefieldCartridgeScatter", x: 186.0, z: 292.5, ry: -0.5, scale: 1.0,
    note: "南墙·墙根散落弹壳" },
  { asset: "battlefieldBeamObstacle01", x: 203.0, z: 288.0, ry: 0.35, scale: 0.95,
    note: "南墙·中段木梁障碍（拆民房门板梁做的顶门桩）" },
  { asset: "battlefieldSupplyBox", x: 218.0, z: 289.0, ry: 0.4, scale: 1.0,
    note: "南墙·中段弹药箱（杂色补给，122 师的弹药就是这么零碎）" },
  { asset: "battlefieldSandbag03", x: 236.0, z: 287.0, ry: 0.0, scale: 1.05,
    note: "南墙·东段墙根胸墙（往缺口方向递次退守）" },

  // ── 东墙顺城街中段（东门以南 120 m）的预备阵地 ──
  // 【实拍取证，2026-08-25】_import/TownDressingCells.json 把东墙缺口记成 (305, +70)，
  // **那是个符号错**：AddCityWall 的东墙局部→世界是 z = -lx，缺口 at=70 的真身在
  // (305, **-70**)，而且跨度 z -61.5…-78.5 几乎整段落进东门那 22 m 的门洞豁口里 ——
  // 从城里看它就是「东门」，不是第二个独立缺口（截图 DF_g11 / DF_g13 各拍了一张）。
  // 所以真正的东墙缺口内侧工事就是下面那组东门里的沙袋与拒马；这一组留在这里
  // 当顺城街中段的预备阵地（校验器按 (305,70) 判，也按顺城街带判，两条都过）。
  { asset: "battlefieldSandbag02", x: 295.4, z: 62.0, ry: 0.0, scale: 1.05,
    note: "东墙顺城街中段·预备阵地北侧沙袋（八字外张，火力指向墙头）" },
  { asset: "battlefieldSandbag01", x: 295.4, z: 78.6, ry: 0.0, scale: 1.05,
    note: "东墙顺城街中段·预备阵地南侧沙袋（与北侧夹出一段掩护带）" },
  { asset: "battlefieldHedgehog", x: 294.4, z: 57.0, ry: 0.4, scale: 0.85,
    note: "东墙顺城街中段·北端拒马（拦下城的人，不封顺城街通路）" },
  { asset: "battlefieldBarbedWire01", x: 296.4, z: 84.2, ry: 1.5708, scale: 1.0,
    note: "东墙顺城街中段·南端铁丝网（沿墙根拉，长轴顺城墙）" },
  { asset: "battlefieldGrenadeStack", x: 293.6, z: 70.6, ry: 1.5708, scale: 0.85,
    note: "东墙顺城街中段·预备阵地手榴弹堆（矮扁件，随手能抓）" },

  // ── 东门·宗鲁门（305,-65，土袋半堵）门里 + 东上城道口（L4 的起手段）──
  // 东墙那处缺口（真身 305,-70，跨 z -61.5…-78.5）就压在这一段上，所以这组
  // 既是门里工事、也是缺口内侧工事 —— 一组顶两处，不再另摆一份。
  { asset: "battlefieldSandbag01", x: 294.0, z: -70.6, ry: 1.5708, scale: 1.1,
    note: "东门里/东墙缺口·北侧胸墙（门洞与缺口的通路留净宽，只压北肩）" },
  { asset: "battlefieldSandbag03", x: 295.8, z: -74.6, ry: 1.5708, scale: 1.0,
    note: "东门里/东墙缺口·北侧第二道胸墙（正对缺口塌口，紧邻上城道坡脚）" },
  { asset: "battlefieldGrenadeStack", x: 293.0, z: -60.6, ry: 1.5708, scale: 0.9,
    note: "东门里·门洞南侧手榴弹堆" },
  { asset: "battlefieldHedgehog", x: 291.2, z: -76.4, ry: 0.5, scale: 0.85,
    note: "东门里·北翼拒马（离上城道口一段，别压马道走行面）" },
  { asset: "battlefieldLadder", x: 296.9, z: -55.2, ry: 0.15, scale: 1.0,
    note: "东门里·门洞南侧梯子靠墙根（上城道之外的应急上下，只是道具）" },
  { asset: "battlefieldCanvasCover01", x: 294.6, z: -88.0, ry: 0.3, scale: 1.0,
    note: "东上城道·坡身下方的歇兵掩布（马道走行面 x≥297.3 全部留空）" },

  // ── 南门·迎薰门（70,305，全堵）门里 + 南上城道口 ──
  { asset: "battlefieldSandbag02", x: 101.0, z: 294.4, ry: 0.0, scale: 1.05,
    note: "南上城道·坡顶一端的墙根沙袋（马道自门口 x70 往东爬到 x98，走行面全留空）" },
  { asset: "battlefieldGrenadeStack", x: 104.2, z: 291.0, ry: -0.3, scale: 0.9,
    note: "南上城道·坡顶一端的墙根手榴弹堆（上城前抓两颗）" },
  { asset: "battlefieldLadder", x: 66.2, z: 297.4, ry: -0.35, scale: 1.0,
    note: "南门里·梯子斜靠堵死的门洞西侧墙根" },

  // ── 西门·怀古门（-305,0，堵到只剩一人宽）门里 —— 通视走廊 z ∈ ±5.35 全空 ──
  { asset: "battlefieldSandbag03", x: -293.0, z: 8.6, ry: 1.5708, scale: 1.05,
    note: "西门里·南肩沙袋（走廊 z±5.35 让开，工事只在两肩）" },
  { asset: "battlefieldGrenadeStack", x: -291.0, z: 12.2, ry: 1.5708, scale: 0.9,
    note: "西门里·南肩手榴弹堆" },
  { asset: "battlefieldSupplyBox", x: -294.2, z: 14.6, ry: 0.3, scale: 1.0,
    note: "西门里·南肩弹药箱（活口守军的补给堆放点）" },
  { asset: "battlefieldSandbag01", x: -292.6, z: -9.0, ry: 1.5708, scale: 1.1,
    note: "西门里·北肩沙袋（与南肩对夹一人宽的活口）" },
  { asset: "battlefieldHedgehog", x: -290.2, z: -14.2, ry: -0.4, scale: 0.85,
    note: "西门里·北肩拒马" },
  { asset: "battlefieldBarbedWire02", x: -292.4, z: -21.0, ry: 1.5708, scale: 1.0,
    note: "西门里·北肩铁丝网（西上城道 x≤-297 走行面留空）" },

  // ── 北门·望阙门（-145,-305，土袋堵死）门里 + 北上城道口 ──
  { asset: "battlefieldSandbag01", x: -150.6, z: -293.0, ry: 1.5708, scale: 1.1,
    note: "北门里·西侧沙袋（北门大街净宽与 L6 连线各让 3 m 以上）" },
  { asset: "battlefieldGrenadeStack", x: -139.8, z: -292.2, ry: 1.5708, scale: 0.9,
    note: "北门里·东侧手榴弹堆（突围当夜就是在这儿扒开屯闭的门）" },
  { asset: "battlefieldBeamObstacle02", x: -152.2, z: -288.0, ry: 0.3, scale: 0.9,
    note: "北门里·西侧木梁障碍（顶门用的梁，堆在门里）" },
  { asset: "battlefieldCanvasCover02", x: -136.4, z: -288.6, ry: -0.25, scale: 1.0,
    note: "北上城道口·东侧掩布（马道 x -145..-117 走行面留空）" },

  // ── 顺城街西南角歇兵点 ──
  { asset: "battlefieldCanvasCover01", x: -291.0, z: 290.6, ry: 0.4, scale: 1.05,
    note: "西南角顺城街·歇兵点掩布（换防的兵在墙根打盹）" },
  { asset: "crate", x: -289.0, z: 292.6, ry: -0.2, scale: 1.0,
    note: "西南角顺城街·歇兵点木箱（当凳子）" },
  { asset: "battlefieldLadder", x: -293.5, z: 288.2, ry: 0.9, scale: 1.0,
    note: "西南角顺城街·梯子斜靠墙根" },

  // =========================================================================
  // 第二轮加密（2026-08-25）—— 补的是「兵味」与「守军也是人」，不是军火。
  //
  // 三条新语言，都受史实约束，不是凭空长出来的：
  //   · **太平缸**：明清县城的常备防火设施，沿街每隔一段一口大水缸，冬天砸冰、
  //     平时挑满。1938 年春滕县守军把它们一并当了饮水与灭火的水源 —— 日军的
  //     燃烧弹与炮火下，一口缸就是一段墙根能不能救回来的差别。全城摆 7 口，
  //     沿顺城街与四门里各一段，不进院子（院里的水缸归片区包）。
  //   · **伙房与送饭**：城上的兵吃的是城下伙房挑上去的饭。柴枝堆 + 劈柴墩落在
  //     南上城道口的墙根，笸箩摆在东墙预备阵地 —— 上城道是唯一的上下通路，
  //     饭只能从这儿送。
  //   · **征用痕迹**：门里堵门用的料是就地拆的 —— 铺面的货箱、备用的顶门梁、
  //     拆了车留下的轮子。这些不是「军品」，是被战争征用的民间物。
  //
  // 摆位仍守老三条：马道走行面（东 x≥297.6 / 西 x≤-297.6 / 南 z≥297.6 /
  // 北 z≤-297.6）留空、门洞与西门走廊留空、L4 目标链两侧张开。
  // =========================================================================

  // ── 顺城街东北角歇兵点（换防的兵在这一段墙根歇脚）──
  { asset: "battlefieldCanvasCover02", x: 291.2, z: -287.4, ry: 0.35, scale: 1.0,
    note: "东北角顺城街·歇兵点掩布（离 L4 连线两百米开外，纯是生活场景）" },
  { asset: "crate", x: 288.9, z: -290.6, ry: -0.3, scale: 1.0,
    note: "东北角顺城街·歇兵点木箱（当凳子，与西南角那处对仗）" },
  { asset: "phWoodenBucket", x: 292.6, z: -291.6, ry: 0.0, scale: 1.0,
    note: "东北角顺城街·饮水木桶（兵也要喝水，这是这一轮补的第一件生活面）" },
  { asset: "battlefieldLadder", x: 296.4, z: -286.0, ry: 0.2, scale: 1.0,
    note: "东北角顺城街·梯子靠东墙墙根（应急上下，不是第五条上城道；"
      + "贴到 x296.4 是俯拍验出来的 —— 摆在 294.8 会读成「立在街心」）" },
  { asset: "clayWaterVat", x: 287.4, z: -292.6, ry: 0.0, scale: 1.0,
    note: "太平缸①·东北角顺城街（县城常备防火水缸，守军拿它当饮水与灭火水源）" },

  // ── 顺城街西北角歇兵点 ──
  { asset: "battlefieldCanvasCover01", x: -290.4, z: -288.0, ry: -0.4, scale: 1.0,
    note: "西北角顺城街·歇兵点掩布" },
  { asset: "crate", x: -288.2, z: -291.2, ry: 0.25, scale: 1.0,
    note: "西北角顺城街·歇兵点木箱" },
  { asset: "ryWaterBucket", x: -292.4, z: -290.2, ry: 0.0, scale: 1.0,
    note: "西北角顺城街·小木水桶（挑水上城的家伙什）" },
  { asset: "clayWaterVat", x: -286.8, z: -291.6, ry: 0.0, scale: 1.0,
    note: "太平缸②·西北角顺城街" },

  // ── 南墙散兵线之间的散件（工事料与打过的痕迹，把 162→236 那一长段填起来）──
  // 全部让开 L4 的 Rampart→SouthWall→SouthBreach 连线：大件一律压在连线南侧
  // （城里一侧）3 m 以外，只有平贴地面的弹壳可以落到连线附近。
  { asset: "battlefieldTimberBeam", x: 174.0, z: 289.4, ry: 0.12, scale: 1.0,
    note: "南墙·散兵线之间的木梁料（顺墙根横放，拆民房门板梁的余料）" },
  { asset: "battlefieldOpenBin", x: 194.5, z: 288.0, ry: -0.3, scale: 0.9,
    note: "南墙·敞口料斗（装填土袋用的土就从这里铲）" },
  { asset: "battlefieldCartridgeScatter", x: 199.8, z: 292.6, ry: 0.9, scale: 1.0,
    note: "南墙·中段散落弹壳（平贴地面的非阻挡件，可以落在连线附近）" },
  { asset: "battlefieldMetalPole", x: 227.0, z: 288.0, ry: 0.1, scale: 1.0,
    note: "南墙·铁杆料（拆下来撑掩布、顶门板的杆子）" },

  // ── 四条上城道口的待运弹药（上城前在坡脚抓一把，这是全城唯一的上下通路）──
  { asset: "battlefieldSupplyBox", x: 295.2, z: -82.4, ry: 1.5708, scale: 1.0,
    note: "东上城道口·待运弹药箱（马道走行面 x≥297.6 留空，件全压在里侧）" },
  { asset: "battlefieldGrenadeStack", x: 293.4, z: -84.8, ry: 1.5708, scale: 0.9,
    note: "东上城道口·待运手榴弹（122 师的主武器，上城的人一人抓两颗）" },
  { asset: "battlefieldSupplyBox", x: 98.6, z: 288.6, ry: 0.2, scale: 1.0,
    note: "南上城道口·待运弹药箱（马道 x70→96、z≥297.6 走行面全留空）" },
  { asset: "battlefieldGrenadeStack", x: 94.4, z: 290.4, ry: 0.05, scale: 0.9,
    note: "南上城道口·待运手榴弹" },
  { asset: "battlefieldSupplyBox", x: -124.6, z: -290.4, ry: 0.25, scale: 1.0,
    note: "北上城道口·待运弹药箱（北门大街净宽让开 20 m 以上）" },
  { asset: "battlefieldGrenadeStack", x: -120.6, z: -292.6, ry: 0.1, scale: 0.85,
    note: "北上城道口·待运手榴弹（突围那夜从这儿往下搬的就是它）" },
  { asset: "battlefieldSupplyBox", x: -294.4, z: -28.8, ry: 1.5708, scale: 0.95,
    note: "西上城道·坡顶一端的待运弹药箱（马道 x≤-297.6 走行面留空）" },
  { asset: "battlefieldGrenadeStack", x: -292.6, z: -25.2, ry: 1.5708, scale: 0.9,
    note: "西上城道·坡顶一端的待运手榴弹" },

  // ── 南上城道口的伙房（城上的饭是从这一段挑上去的）──
  { asset: "phFirewoodBranches", x: 81.4, z: 291.2, ry: 0.5, scale: 1.0,
    note: "南上城道口·伙房柴枝堆（守军的饭在城下做，从马道挑上城）" },
  { asset: "ryChoppingBlock", x: 78.4, z: 292.6, ry: -0.2, scale: 1.0,
    note: "南上城道口·劈柴墩（与柴枝堆成一处伙房）" },
  { asset: "clayWaterVat", x: 89.2, z: 292.8, ry: 0.0, scale: 1.0,
    note: "太平缸③·南上城道口（伙房与马道之间那口，取水最近）" },

  // ── 东墙预备阵地的生活面（L4 一路要经过这里，是最能被看见的一段）──
  { asset: "bambooHat", x: 294.2, z: 77.2, ry: 0.5, scale: 1.0,
    note: "东墙顺城街中段·搁在沙袋上的斗笠（守军多是本地补充兵，戴的是斗笠）" },
  { asset: "wovenBasket", x: 292.2, z: 74.4, ry: -0.3, scale: 1.0,
    note: "东墙顺城街中段·送饭的笸箩（空的，饭已经送上城了）" },
  { asset: "clayWaterVat", x: 293.4, z: 26.0, ry: 0.0, scale: 1.0,
    note: "太平缸④·东墙顺城街（东门以南这一段，L4 起手就走过它）" },

  // ── 顺城街其余几口太平缸（沿墙每隔一大段一口，把整圈串起来）──
  { asset: "clayWaterVat", x: 208.0, z: 293.0, ry: 0.0, scale: 1.0,
    note: "太平缸⑤·南墙顺城街东段（散兵线与缺口之间）" },
  { asset: "clayWaterVat", x: -291.6, z: 152.0, ry: 0.0, scale: 1.0,
    note: "太平缸⑥·西墙顺城街南段" },
  { asset: "clayWaterVat", x: -116.4, z: -291.0, ry: 0.0, scale: 1.0,
    note: "太平缸⑦·北门里（北上城道口东侧，堵门那夜守军就地取水的一口）" },

  // ── 门里的征用痕迹（堵门的料是就地拆来的，不是军需发的）──
  { asset: "marketBox03", x: -288.8, z: 20.6, ry: 0.35, scale: 0.9,
    note: "西门里·拆铺面拿来的货箱（垒工事的料，一半已经空了）" },
  { asset: "ryTimberStack", x: -292.0, z: -34.6, ry: 0.15, scale: 0.9,
    note: "西门里·备用顶门梁堆（活口一旦要封死，就用这堆料）" },
  { asset: "ryTimberStack", x: -148.6, z: -290.2, ry: 0.1, scale: 0.9,
    note: "北门里·备用顶门梁堆（北门屯闭得最死，梁料备得也最多）" },
  { asset: "marketBox02", x: 293.2, z: -52.4, ry: 0.4, scale: 1.0,
    note: "东门里·征用来的货箱（拆当工事料，堆在门洞北侧）" },
  { asset: "ryCartWheel", x: 295.0, z: -48.0, ry: 0.9, scale: 1.0,
    note: "东门里·拆车堵门剩下的大车轮（车板与轴上了门洞，轮子扔在墙根）" },
]);
