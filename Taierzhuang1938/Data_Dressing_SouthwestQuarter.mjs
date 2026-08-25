// 城西南片（x -286..0, z 0..286）的每户生活布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有这个片区的包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。摆位全部走世界坐标（X 向东，Z 向南），
// 落地/碰撞由 Script_ExternalProps 统一处理。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs

export const REGION = Object.freeze({
  id: "SouthwestQuarter", kind: "quarter", label: "城西南片",
  bounds: { minX: -286, maxX: 0, minZ: 0, maxZ: 286 },
});

// 一九三八年三月十七日的城西南片：炮火最轻的一角，普通市民街坊。
// 基调是「日子还在过，但已经在收拾」——粮食从场院搬进院里、箱笼捆好搁在
// 门道能拎得走的地方、车擦干净备着；越往南（迎薰门被堵死的那一头）越乱，
// 偶有一两户吃了流弹。
//
// 摆位一律先按 Script_CityBlockKit 的原型复算过院内占地（正房在北、门在南、
// 影壁在门内 2 m、厢房在一侧、AdobeYard 的矮墙把南三分之一隔成柴院），
// 再挑那格院子里真正空着的一块。Script_LivedInProps 的缸/篮/柴垛在院心偏
// 一侧，这一层只贴墙根与门道旁补，不往院心里挤。
export const PLACEMENTS = Object.freeze([
  // ── 十字街西南角的小铺户（blk9_13, ShopRow）：货在后院不在店里 ──
  { asset: "marketCrate02", x: -37.33, z: 19.02, ry: 0.22,
    note: "十字街西南角铺户后院：西墙根码起来的板条箱，掌柜把存货从铺面挪进后院" },
  { asset: "marketCrate04", x: -37.43, z: 18.02, ry: -0.35, scale: 0.95,
    note: "同一户：紧挨着的另一只板条箱，先搬进来的那一批" },
  { asset: "marketBox02", x: -36.43, z: 19.72, ry: 0.48, scale: 0.9,
    note: "同一户：还没捆绳的一只木箱，搁在库房与后院门之间的过道边" },

  // ── blk8_13（一进院）：麦子收进院 ──
  { asset: "marketRiceSack01", x: -59.08, z: 25.82, ry: 0.31,
    note: "十字街西南的一进院：影壁西侧靠院墙码的粮袋，围城第三天把存粮全搬进了院" },
  { asset: "marketRiceSack02", x: -59.98, z: 25.32, ry: -0.52, scale: 0.95,
    note: "同一户：第二只粮袋，口朝里立着防潮" },
  { asset: "marketBox01", x: -58.38, z: 24.92, ry: 0.17,
    note: "同一户：粮袋边上一只小木箱，装的是零碎细软" },

  // ── blk7_13（L 形院）：车擦干净备着 ──
  { asset: "cart", x: -87.91, z: 23.92, ry: 0.62, scale: 0.95,
    note: "L 形院西厢房南头空当：手推车拉到院里备着，出城的路一开就走" },
  { asset: "marketBox03", x: -85.91, z: 24.82, ry: -0.24, scale: 0.9,
    note: "同一户：捆好搁在车旁的大箱笼" },
  { asset: "marketCrate01", x: -85.61, z: 23.42, ry: 0.41,
    note: "同一户：一只板条箱，装的是能拎得动的那点家当" },

  // ── blk5_13（土墙院）：矮墙南边的柴院 ──
  { asset: "deadTreeTrunk01", x: -141.69, z: 29.28, ry: 0.28, scale: 0.9,
    note: "土墙院后院柴院：劈剩的一根枯树干，去年冬天砍的那棵老槐" },
  { asset: "stackableStone02", x: -138.99, z: 28.48, ry: -0.66,
    note: "同一户：垫柴用的一块过墙石，从塌了的墙脚拆下来的" },

  // ── blk4_13（两进院）：前院箱笼捆好 ──
  { asset: "marketBox03", x: -172.93, z: 26.68, ry: 0.09,
    note: "西门大街南侧两进院前院：二门与倒座之间，箱笼捆好等雇脚夫" },
  { asset: "marketCrate03", x: -172.03, z: 26.08, ry: -0.31, scale: 0.95,
    note: "同一户：前院第二只箱子，绳还没系上" },
  { asset: "marketCrate04", x: -173.33, z: 25.78, ry: 0.55, scale: 0.9,
    note: "同一户：贴西院墙那一只，挪出过道好让车进来" },

  // ── blk3_13（窄一进院）：家底薄的一户 ──
  { asset: "crate", x: -199.99, z: 26.48, ry: 0.37, scale: 0.95,
    note: "顺兴街西的窄院：厢房山墙下一只木箱，这户全部的行装" },
  { asset: "stackableStone03", x: -198.99, z: 27.18, ry: -0.78,
    note: "同一户：门道边的垫脚石，下雨天踩着进屋" },

  // ── blk2_13（L 形院，几乎没挨炸）：收拾得齐整 ──
  { asset: "marketRiceSack01", x: -210.5, z: 26.28, ry: 0.12,
    note: "西门大街南侧齐整人家：东厢房墙根码齐的两只粮袋，摆得四四方方" },
  { asset: "marketRiceSack02", x: -210.7, z: 27.23, ry: -0.18, scale: 0.95,
    note: "同一户：第二只粮袋，与前一只对齐" },

  // ── blk0_13（西城根一进院） ──
  { asset: "stackableStone01", x: -280.6, z: 26.28, ry: 0.44, scale: 1.05,
    note: "西城根土院：补院墙用的碎石，堆在西厢房南头" },
  { asset: "stackableStone06", x: -281.3, z: 26.88, ry: -0.29, scale: 0.95,
    note: "同一户：第二块，墙还没砌就赶上了围城" },

  // ── blk2_15（两进院）：前院也在打包 ──
  { asset: "marketBox02", x: -224.9, z: 72.64, ry: 0.26,
    note: "城西两进院前院：倒座房北面的木箱，装了一冬的被褥" },
  { asset: "marketCrate01", x: -224.1, z: 71.94, ry: -0.44, scale: 0.95,
    note: "同一户：箱子旁的板条箱，装的是锅碗" },

  // ── blk5_15（水井院）：几户共用的井台 ──
  { asset: "marketRiceSack02", x: -143.69, z: 72.84, ry: 0.33,
    note: "水井院西墙根：从井台让开的一只粮袋，打水的路不能堵" },
  { asset: "stackableStone07", x: -144.59, z: 73.84, ry: -0.61, scale: 0.9,
    note: "同一户：搬来垫粮袋的一块石头，还没垫上" },

  // ── blk6_17（人民书店后邻，读书人家） ──
  { asset: "marketCrate02", x: -109.57, z: 117.63, ry: 0.15,
    note: "人民书店后邻的读书人家：西院墙根第一只书箱，捆得最结实" },
  { asset: "marketBox01", x: -108.87, z: 118.63, ry: -0.27,
    note: "同一户：书箱旁的小木箱，装的是笔墨与几本旧书" },
  { asset: "marketBox02", x: -109.27, z: 119.63, ry: 0.39, scale: 0.95,
    note: "同一户：第三只，绳还没来得及捆上" },

  // ── blk0_18（西南水井院）──
  // 摆在井台北边而不是南边：z 再往南就出了 L5 的切片（maxZ=140），
  // 那两块石头就只在 L6 的中景档里付 draw call，玩家一辈子走不到跟前。
  { asset: "stackableStone03", x: -264.78, z: 138.88, ry: 0.52, scale: 1.1,
    note: "城西南水井院东墙根：拆下来待用的过墙石，井台那圈条石缺了两块" },
  { asset: "stackableStone04", x: -264.08, z: 139.58, ry: -0.36,
    note: "同一户：同一堆里另一块小的" },

  // ── blk9_18（土墙院）：车装了半车 ──
  // 同上：这一户的柴院整条都在 z>140，车摆过去等于摆在 L5 视野之外，
  // 挪到矮墙以北的前院东侧 —— 车本来也该停在能出院门的那一头。
  { asset: "cart", x: -17.74, z: 137.78, ry: -0.48, scale: 0.92,
    note: "城南中段土墙院前院：手推车已经装了半车，车辕朝着院门那一头" },
  { asset: "crate", x: -19.94, z: 138.88, ry: 0.29, scale: 0.95,
    note: "同一户：还没搬上车的一只木箱，撂在车后半步" },

  // ── blk10_20（L 形院，挨了流弹）：南面开始乱 ──
  { asset: "rubble", x: -10.4, z: 186.64, ry: 0.34,
    note: "十字街正南、离迎薰门还有百来米的一户：一发流弹打塌了西院墙一段，砖瓦塌在菜畦南头" },
  { asset: "stackableStone07", x: -9.6, z: 188.54, ry: -0.55, scale: 0.9,
    note: "同一户：从塌处滚出来的一块碱脚石，没人顾得上收" },

  // ── blk9_22（L 形院）：靠南也在收粮 ──
  { asset: "marketRiceSack01", x: -30.84, z: 233.1, ry: 0.21,
    note: "南城书院一带的院子：粮袋搬进院心西侧，离南墙远一点——南面的动静最响" },
  { asset: "marketBox01", x: -29.94, z: 233.9, ry: -0.39, scale: 0.95,
    note: "同一户：粮袋旁一只木箱，装着换洗衣裳" },

  // ── blk8_24（烧过的土墙院）：城南根 ──
  { asset: "rubble", x: -56.98, z: 280.76, ry: -0.22, scale: 1.05,
    note: "城南根烧过的土墙院：柴院南墙塌了半截，土坯连着瓦砸在原地" },

  // ===========================================================================
  // 【加密轮，2026-08-25】上面那一批是「箱笼粮袋」的骨架，这一段把日子补上。
  //
  // 视觉走流送（Script_PropStreaming）之后，全城 draw call 不再是件数的闸门；
  // 守的是另外三条：单院 ≤ 8 件、45 m 邻域 ≤ 90 件、碰撞不流送所以不许堵路。
  //
  // 选点全部拿引擎真值扫的：把 L4/L5/L6 三关**各自 LOD 档**建出来的碰撞盒
  // 并成一张表，再沿院墙根找连续空段——中/远景的合并体块比近景正房大一圈，
  // 只按近景推空位必在另一关埋进墙里（城西北包那次埋了八件的教训）。
  //
  // 情景按方位分档：西北那几排还齐整（桌凳照旧摆在院里、缸坛排得四四方方），
  // 越往东南越乱（南门里那几户塌了墙、翻了坛、老槐削断横在砖堆上）。
  // 城内不用 ryVillageWell / stoneWellCurb / house 系（井台归 WellYard 原型自己盖，
  // 房子归程序化院落）；ryHayStack / ryFeedTrough 只给最西两列的城根土院。
  // ===========================================================================

  // ── blk6_13（OneEntry）：西门大街南侧一进院：挑水的人家 ──
  { asset: "clayWaterVat", x: -120.64, z: 21.29, ry: 0.12,
    note: "西门大街南侧一进院：西厢山墙下的水缸，围城以来一天挑满三回" },
  { asset: "phWoodenBucket", x: -120.82, z: 22.11, ry: -0.38,
    note: "同一户：缸边撂着的木桶，桶绳还搭在桶沿上" },
  { asset: "wovenBasket", x: -120.71, z: 22.86, ry: 0.44, scale: 0.95,
    note: "同一户：翻过来扣着的笸箩，晾过的菜干早收进屋了" },

  // ── blk0_14（OneEntry）：西城根：柴劈到一半 ──
  { asset: "firewoodPile", x: -283.54, z: 44.10, ry: 0.08,
    note: "西城根土院：西墙根码起来的柴垛，够烧到清明" },
  { asset: "ryChoppingBlock", x: -284.04, z: 45.66, ry: -0.26,
    note: "同一户：柴垛头上的劈柴墩，斧印新的" },
  { asset: "phWoodAxe", x: -284.03, z: 46.73, ry: 0.85, scale: 1.05,
    note: "同一户：斧子撂在墩子边上——劈到一半，城头响了" },

  // ── blk1_14（OneEntry）：王家祠堂东邻：晾晒架空着 ──
  { asset: "ryDryingRack", x: -234.09, z: 46.85, ry: 0.05,
    note: "王家祠堂东邻：院里的晾晒木架，被褥昨天就收进屋了，架子空着" },
  { asset: "winnowingBasket", x: -233.43, z: 48.48, ry: 1.51,
    note: "同一户：簸箕靠着架子腿立着，簸完的那点麦子已经装了袋" },

  // ── blk2_14（LCourtyard）：酱园户：一溜缸坛 ──
  { asset: "clayWaterVat", x: -229.59, z: 44.29, ry: 0.06,
    note: "城西酱园户：西院墙根一溜四口缸坛，头一口是水缸" },
  { asset: "clayRoundVat", x: -229.55, z: 45.34, ry: -0.14,
    note: "同一户：第二口圆腹缸，去年秋天下的黄豆酱" },
  { asset: "clayLiddedJar", x: -229.63, z: 46.34, ry: 0.21,
    note: "同一户：有盖的咸菜坛，盖上压着一块河石" },
  { asset: "clayWideJar", x: -229.60, z: 47.30, ry: -0.3, scale: 0.95,
    note: "同一户：末一口阔口坛，空的——腌菜的盐买不着了" },

  // ── blk3_14（AdobeYard）：顺兴街西小磨房 ──
  { asset: "stoneMillWheel", x: -189.82, z: 47.12, ry: 0.33,
    note: "顺兴街西的小磨房院：卸下来的石磨盘平放在东墙根，磨道上的驴前天被拉走了" },
  { asset: "winnowingBasket", x: -189.61, z: 48.29, ry: 1.67,
    note: "同一户：磨盘旁靠墙立着的簸箕，箩底还挂着一层面" },

  // ── blk4_14（OneEntry）：西门大街南侧修车的人家 ──
  { asset: "ryCartWheel", x: -174.92, z: 49.05, ry: 0.1,
    note: "西门大街南侧修车的人家：靠墙立着的一只大车轮，辐条换了两根还没上箍" },
  { asset: "ryTimberStack", x: -174.70, z: 50.67, ry: -0.22,
    note: "同一户：车轮旁的木料堆，本来是给邻家打棺材的料" },
  { asset: "phIronSpade", x: -174.90, z: 52.32, ry: 0.66,
    note: "同一户：铁锹撂在料堆边——挖防空壕的人家一天来借三回" },

  // ── blk5_14（TwoEntry）：两进院：细软捆好了 ──
  { asset: "marketBox02", x: -147.84, z: 44.33, ry: 0.17,
    note: "城西两进院：前院墙根的木箱，捆好了，绳头留着好拎" },
  { asset: "phWickerBasketLidded", x: -147.98, z: 45.28, ry: -0.41,
    note: "同一户：箱上没地方了，带盖的竹篮只好搁在旁边地上" },

  // ── blk0_15（OneEntry）：城西水井院：打水的家伙什 ──
  { asset: "phWoodenBucket", x: -284.25, z: 71.91, ry: 0.28,
    note: "城西水井院：让开井台码在西墙根的木桶，一条巷子共用一口井，路不能堵" },
  { asset: "phWoodenWashTub", x: -284.09, z: 72.70, ry: -0.19,
    note: "同一户：木盆扣在桶边，昨天洗的衣裳还挂在屋里" },

  // ── blk1_15（AdobeYard）：土墙院柴院：备下过冬的柴 ──
  { asset: "ryFirewoodStack", x: -233.69, z: 73.06, ry: 0.09,
    note: "城西土墙院的柴院：矮墙南边码齐的一垛硬柴" },
  { asset: "phFirewoodBranches", x: -233.67, z: 74.52, ry: -0.34,
    note: "同一户：柴垛旁散着的一抱柴枝，引火用的" },
  { asset: "ryChoppingBlock", x: -233.48, z: 75.77, ry: 0.52,
    note: "同一户：劈柴墩挪到了墙根——院心要留出来搁车" },

  // ── blk3_15（OneEntry）：顺兴街西窄院：桌凳搬到院里 ──
  { asset: "longBench", x: -189.90, z: 68.16, ry: 0.14,
    note: "顺兴街西的窄院：条凳挪到东墙根，屋里腾地方铺被褥——两家人挤在一处住" },
  { asset: "phChineseWoodStool", x: -189.54, z: 69.36, ry: -0.47,
    note: "同一户：条凳边一只方凳，凳面磨得发亮" },

  // ── blk4_15（AdobeYard）：土墙院：咸菜坛挪进后院 ──
  { asset: "clayLiddedJar", x: -175.16, z: 70.37, ry: 0.11,
    note: "城西土墙院：咸菜坛从窗台底下挪到西墙根，怕震塌了砸着" },
  { asset: "clayLuggedJar", x: -175.18, z: 71.27, ry: -0.29, scale: 0.95,
    note: "同一户：带耳的小罐搁在坛子边，装的是半罐香油" },

  // ── blk10_15（AdobeYard）：南门里酒栈后院 ──
  { asset: "wineJarCluster", x: -9.47, z: 77.97, ry: 0.19,
    note: "南门里大街西侧酒栈的后院：一堆酒坛挪到南墙根，掌柜说封了泥就不怕震" },
  { asset: "clayRoundVat", x: -8.27, z: 78.12, ry: -0.24, scale: 0.95,
    note: "同一户：空出来的一口圆腹缸，原先盛酒糟，现在接房檐水" },

  // ── blk0_16（OneEntry）：西城根土院：菜园家什 ──
  { asset: "ryFarmHoe", x: -283.63, z: 92.90, ry: 0.72,
    note: "西城根土院：锄头撂在西墙根，城根这几户还种着半亩菜" },
  { asset: "phIronSpade", x: -283.85, z: 94.56, ry: -0.55,
    note: "同一户：铁锹搁在锄头边上——这两天挖的是防空坑，不是菜畦" },

  // ── blk1_16（AdobeYard）：城根土院：牲口牵走了 ──
  { asset: "ryFeedTrough", x: -233.67, z: 90.75, ry: 0.08,
    note: "城西城根土院：空着的木食槽，那头骡子前天被军队牵走了，留了一张条子" },
  { asset: "ryHayStack", x: -233.56, z: 92.08, ry: -0.16,
    note: "同一户：没人吃的秸秆垛，照旧堆在槽子边" },
  { asset: "ryFarmHoe", x: -233.86, z: 93.59, ry: 0.61, scale: 0.95,
    note: "同一户：锄头横在垛脚，牲口一走，地也就撂下了" },

  // ── blk2_16（LCourtyard）：L 形院：菜畦边的凳子 ──
  { asset: "ryYardBench", x: -229.12, z: 96.16, ry: 0.12,
    note: "城西 L 形院：菜畦边的长条木凳，晌午一家人还在这儿吃饭" },
  { asset: "phClayFlowerPot", x: -229.79, z: 97.43, ry: -0.35,
    note: "同一户：凳头一只素陶瓦盆，里头的葱苗刚冒头" },

  // ── blk3_16（AdobeYard）：顺兴街西土墙院 ──
  { asset: "clayWaterVat", x: -189.63, z: 92.69, ry: 0.15,
    note: "顺兴街西的土墙院：东墙根的水缸满着——巷口的井这两天排队" },
  { asset: "winnowingBasket", x: -189.61, z: 93.68, ry: 1.45,
    note: "同一户：簸箕靠着缸立着，随手就能盖住缸口挡灰" },

  // ── blk7_16（OneEntry）：当典后街南的浅院 ──
  { asset: "phRoughWoodTable", x: -84.64, z: 100.79, ry: 0.1,
    note: "当典后街南的浅院：粗木桌搬到院里当案板用，屋里的窗户拿门板堵死了" },
  { asset: "phChineseWoodStool", x: -83.49, z: 101.11, ry: -0.44,
    note: "同一户：桌子边一只方凳，凳上撂着没缝完的鞋底" },

  // ── blk8_16（OneEntry）：城西南浅院：粮先搬进来 ──
  { asset: "marketRiceSack01", x: -54.97, z: 100.98, ry: 0.23,
    note: "城西南的浅院：一只粮袋倚着南院墙，先搬进来的那一袋" },
  { asset: "wovenBasket", x: -53.98, z: 101.09, ry: -0.37,
    note: "同一户：笸箩扣在袋子上，防猫也防灰" },

  // ── blk9_16（OneEntry）：挨了一发的浅院 ──
  { asset: "rubble", x: -26.48, z: 100.46, ry: 0.31, scale: 0.9,
    note: "十字街正南第一排的浅院：一发落在墙外，震塌了南墙一角，砖瓦就摊在原地" },
  { asset: "stackableStone02", x: -24.97, z: 101.08, ry: -0.62,
    note: "同一户：滚出来的一块碱脚石，人还在屋里，没人出来收" },

  // ── blk10_16（OneEntry）：南门里铺户：门板卸下来了 ──
  { asset: "shopPlaque", x: -8.73, z: 100.95, ry: 0.04,
    note: "南门里大街西侧铺户后院：卸下来的一块铺面门板靠在南院墙上，铺子昨天就上了板" },
  { asset: "crate", x: -7.68, z: 101.05, ry: -0.28, scale: 0.95,
    note: "同一户：门板边一只木箱，掌柜把柜上的零碎都倒进去了" },

  // ── blk0_17（OneEntry）：城西根一进院 ──
  { asset: "clayRoundVat", x: -284.02, z: 116.10, ry: 0.13,
    note: "城西根一进院：西墙根的圆腹缸，接了大半缸房檐水" },
  { asset: "bambooHat", x: -284.17, z: 117.04, ry: -0.4,
    note: "同一户：斗笠扣在缸沿边的地上，戴它的人一早去城头背土了" },

  // ── blk1_17（AdobeYard）：土墙院：石圈柴堆 ──
  { asset: "ryFirewoodPit", x: -233.69, z: 116.78, ry: 0.07,
    note: "城西土墙院：院里的石圈柴堆，一家人这几天都在院里生火做饭" },
  { asset: "phWoodAxe", x: -233.47, z: 118.04, ry: 0.94,
    note: "同一户：斧子搭在石圈边上，随手就够得着" },

  // ── blk2_17（LCourtyard）：一点没挨着的那户：桌凳灯都还在院里 ──
  { asset: "phRoughWoodTable", x: -229.35, z: 112.93, ry: 0.09,
    note: "城西一点没挨着的那户：粗木桌照旧摆在院里，饭还在这儿吃" },
  { asset: "longBench", x: -229.32, z: 114.44, ry: -0.18,
    note: "同一户：桌边的条凳，坐得下一家五口" },
  { asset: "phChineseWoodStool", x: -229.67, z: 115.63, ry: 0.36,
    note: "同一户：矮一头的方凳，是给最小的那个坐的" },
  { asset: "clothLantern", x: -229.77, z: 116.36, ry: -0.11,
    note: "同一户：布灯笼摘下来搁在凳上——夜里不许点灯了" },

  // ── blk3_17（AdobeYard）：顺兴街南口土墙院 ──
  { asset: "stoneMillWheel", x: -189.82, z: 115.04, ry: -0.28,
    note: "顺兴街南口的土墙院：磨盘撂在东墙根，上面压着一块苫布——碾完的麦子已经装了口袋" },
  { asset: "wovenBasket", x: -189.55, z: 116.16, ry: 0.47, scale: 0.95,
    note: "同一户：笸箩撂在磨盘边，箩里还剩一层麸皮" },

  // ── blk7_17（TwoEntry）：人民书店西南的两进院 ──
  { asset: "marketCrate03", x: -93.36, z: 114.42, ry: 0.16,
    note: "人民书店西南的两进院：西院墙根捆好的板条箱，箱盖上用炭写了字" },
  { asset: "phWickerTray", x: -93.47, z: 115.39, ry: -0.33,
    note: "同一户：竹编浅筐撂在箱上，里头是路上吃的干粮" },

  // ── blk8_17（OneEntry）：城南中段一进院：坛子搬进屋前 ──
  { asset: "clayLiddedJar", x: -66.21, z: 115.53, ry: 0.1,
    note: "城南中段一进院：两口咸菜坛挪到西墙根，等着一并搬进屋" },
  { asset: "clayWideJar", x: -66.18, z: 116.48, ry: -0.27, scale: 0.95,
    note: "同一户：阔口坛歪着搁，坛口那圈泥还没封上" },

  // ── blk9_17（LCourtyard）：十字街正南的 L 形院 ──
  { asset: "ryDryingRack", x: -16.20, z: 115.98, ry: 0.06,
    note: "十字街正南的 L 形院：晾晒架上什么也没有——衣裳前天夜里就摘光了" },
  { asset: "phWoodenWashTub", x: -15.53, z: 117.60, ry: -0.42,
    note: "同一户：木盆扣在架子下，盆底朝天" },

  // ── blk10_17（OneEntry）：南门里挨了流弹的一户 ──
  { asset: "rubble", x: -8.43, z: 123.29, ry: 0.36, scale: 0.95,
    note: "南门里大街西侧挨了流弹的一户：南墙塌了一段，砖瓦压着半畦菜" },
  { asset: "clayWideJar", x: -6.83, z: 123.93, ry: -0.71, scale: 0.9,
    note: "同一户：震翻在砖堆边的一口阔口坛，坛里的菜撒了一地" },

  // ── blk1_18（LCourtyard）：城西 L 形院：车推到了院里 ──
  { asset: "cart", x: -234.27, z: 139.27, ry: 0.55, scale: 0.94,
    note: "城西 L 形院：手推车推到东墙根，车辕朝着院门那一头" },
  { asset: "crate", x: -233.44, z: 141.09, ry: -0.31,
    note: "同一户：还没搬上车的一只木箱，撂在车后半步" },

  // ── blk2_18（AdobeYard）：土墙院：水缸挪到墙根 ──
  { asset: "clayWaterVat", x: -229.59, z: 137.97, ry: 0.14,
    note: "城西土墙院：水缸从院心挪到西墙根，院心要留出走车的道" },
  { asset: "phWoodenBucket", x: -229.77, z: 138.79, ry: -0.36,
    note: "同一户：木桶搁在缸边，绳子还系在桶梁上" },

  // ── blk3_18（TwoEntry）：顺兴街南口两进院：一冬的粮 ──
  { asset: "marketRiceSack01", x: -179.02, z: 137.78, ry: 0.19,
    note: "顺兴街南口的两进院：东院墙根码的两只粮袋，一冬的口粮全在这儿" },
  { asset: "marketRiceSack02", x: -179.01, z: 138.85, ry: -0.24, scale: 0.95,
    note: "同一户：第二只粮袋，口朝里立着防潮" },

  // ── blk7_18（LCourtyard）：人民书店西邻的读书人家 ──
  { asset: "marketCrate01", x: -93.36, z: 137.78, ry: 0.15,
    note: "人民书店西邻：西墙根一只板条箱，装的是从铺子里搬回来的书" },
  { asset: "phWoodLantern", x: -93.64, z: 138.58, ry: -0.39,
    note: "同一户：木框风灯挂不成了，摘下来搁在箱头上" },

  // ── blk8_18（OneEntry）：城南小酒坊 ──
  { asset: "wineJarCluster", x: -65.99, z: 138.99, ry: 0.22,
    note: "城南的小酒坊后院：封了泥的酒坛堆在墙根，掌柜说打完仗再启" },
  { asset: "clayLuggedJar", x: -66.23, z: 140.10, ry: -0.3, scale: 0.95,
    note: "同一户：带耳的小罐搁在坛堆边，装的是拿去换粮的那点酒" },

  // ── blk10_18（OneEntry）：南门里一进院：碾完了 ──
  { asset: "stoneMillWheel", x: -8.74, z: 146.60, ry: 0.24,
    note: "南门里大街西侧一进院：碾完的石磨盘平撂在院里，麦子昨天夜里就磨完了" },
  { asset: "winnowingBasket", x: -7.57, z: 146.81, ry: -0.08,
    note: "同一户：簸箕靠着磨盘立着" },

  // ── blk10_19（LCourtyard）：南城 L 形院：车装了一半 ──
  { asset: "cart", x: -8.37, z: 168.87, ry: -0.52, scale: 0.92,
    note: "南城 L 形院：手推车装了一半，车上是被褥与一口锅" },
  { asset: "bambooHat", x: -6.68, z: 169.77, ry: 0.33,
    note: "同一户：斗笠撂在车边地上，走的时候准得戴上" },

  // ── blk9_21（OneEntry）：挨了流弹的一进院 ──
  { asset: "rubble", x: -27.75, z: 204.75, ry: 0.29, scale: 0.95,
    note: "南城书院西北的一进院：一发流弹掀了半面山墙，砖瓦塌在院里" },
  { asset: "stackableStone07", x: -26.12, z: 205.36, ry: -0.58, scale: 0.9,
    note: "同一户：从塌处滚出来的一块碱脚石，压着半只烂笸箩" },

  // ── blk10_21（AdobeYard）：烧过的土墙院 ──
  { asset: "rubble", x: -8.02, z: 204.70, ry: -0.34,
    note: "南门里烧过的土墙院：烧塌的一段土坯连着焦瓦，火是前天夜里灭的" },
  { asset: "stackableStone03", x: -6.42, z: 205.44, ry: 0.67, scale: 1.05,
    note: "同一户：过墙石从碱脚里翻出来，黑了半边" },

  // ── blk10_22（OneEntry）：南城一进院：还没走的人家 ──
  { asset: "marketRiceSack02", x: -8.40, z: 238.26, ry: 0.2,
    note: "南城一进院：粮袋立在墙根——这一户还没打算走" },
  { asset: "phWickerBasketLidded", x: -7.44, z: 238.41, ry: -0.45,
    note: "同一户：带盖的竹篮压在粮袋上，篮里是几件换洗衣裳" },

  // ── blk8_23（AdobeYard）：书院小学东邻：柴还在劈 ──
  { asset: "firewoodPile", x: -65.64, z: 252.78, ry: 0.11,
    note: "书院小学东邻的土墙院：柴垛码在西墙根，学堂停课以后这一带静得出奇" },
  { asset: "ryChoppingBlock", x: -66.14, z: 254.34, ry: -0.29,
    note: "同一户：劈柴墩就在垛前，墩面上的斧印是今早的" },

  // ── blk9_23（WellYard）：南城水井院：井台让出来 ──
  { asset: "phWoodenBucket", x: -39.11, z: 252.43, ry: 0.26,
    note: "南城水井院：从井台让开的木桶，几户共用一口井，路不能堵" },
  { asset: "ryWaterBucket", x: -39.13, z: 253.04, ry: -0.41,
    note: "同一户：小水桶摞在大桶边上" },

  // ── blk10_23（LCourtyard）：烧空的 L 形院 ──
  { asset: "rubble", x: -7.85, z: 260.47, ry: 0.38, scale: 1.05,
    note: "南门里烧空的 L 形院：厢房塌了一半，砖瓦连着焦木堆在院心南头" },
  { asset: "stackableStone05", x: -6.16, z: 261.22, ry: -0.64,
    note: "同一户：一块过墙石从塌处滚到院当中，绊了路" },

  // ── blk9_24（WellYard）：城南根水井院 ──
  { asset: "clayWaterVat", x: -38.93, z: 274.77, ry: 0.16,
    note: "城南根的水井院：西墙根的水缸满着，井离得近，这一带不缺水" },
  { asset: "winnowingBasket", x: -38.95, z: 275.76, ry: 1.65,
    note: "同一户：簸箕靠着缸立着，簸的是最后一点谷子" },

  // ── blk10_24（LCourtyard）：城南根最乱的一角 ──
  { asset: "rubble", x: -9.36, z: 283.30, ry: -0.27, scale: 1.1,
    note: "城南根最乱的一角：南院墙塌了整段，砖瓦土坯摊了半个院子" },
  { asset: "deadTreeTrunk02", x: -6.20, z: 282.68, ry: 0.48, scale: 0.85,
    note: "同一户：院里那棵老槐被削断了，树干横在砖堆边上" },

  // ── blk6_17（OneEntry）：人民书店后邻（补） ──
  { asset: "phRoughWoodTable", x: -97.50, z: 116.41, ry: 0.12,
    note: "人民书店后邻的读书人家：粗木桌搬到院里，书就是在这张桌上一箱一箱装的" },
  { asset: "phChineseWoodStool", x: -97.18, z: 117.56, ry: -0.4,
    note: "同一户：桌边一只方凳，装到半夜的人坐过" },

  // ── blk9_13（ShopRow）：十字街西南角铺户（补） ──
  { asset: "shopPlaque", x: -38.05, z: 19.33, ry: 1.62,
    note: "十字街西南角铺户后院：卸下来的铺面门板靠在后院西墙上，铺子上了板才敢搬货" },
  { asset: "wineJarCluster", x: -37.98, z: 20.56, ry: -0.21, scale: 0.95,
    note: "同一户：门板旁一堆酒坛，是替南门里酒栈代存的" },
]);
