// 主次街商业带（全城街肩与铺面门脸）的生活布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有街道包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。街道包只摆**街肩带**（路缘到院墙之间），
// 院子里的东西归四个片区包，城防工事归 Data_Dressing_Defenses。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs
//
// 【这一批摆的是什么】一九三八年三月十七日，被围数日的滕县城。买卖早停了，
// 街上的货是**被战争定格的**那一批：粮行门口来不及搬进去的米袋垛、铺板卸了
// 一半就撂下的货箱、停在自家门脸前再没推走的手推车、守军过兵留下的军需箱。
// 一组 1—4 件讲一家门脸的事，note 写明是哪家、什么情景。
//
// 【贴哪儿】Script_TengxianCity.BuildStreetLife 已经每 26 m 一组、左右交替地
// 在 width/2−0.48 的肩位摆了程序化家什（摊/车/凳/缸）。这一批一律**退到它外侧**
// （width/2+0.5 ~ width/2+3.4 的墙根带），并与那些组的沿街位置错开 ≥7 m ——
// 两层叠在同一个点上会堆成一座垃圾山，实拍验过。
// 东门大街北侧、南门里大街路东、北门大街两侧的铺面格子是被街裁过的浅格
// （临街边只离路心 5.2—5.7 m），所以那几组能真正贴到铺面门槛前；十字街、
// 西门大街、北门大街南段的院落退线远，货只能落在路肩外沿的空场上。
//
// 【2026-08-25 加密这一轮：把商业带做成「买卖被打断」而不是「路边有几件东西」】
// 43 件 / 21 门脸 → 123 件 / 58 门脸。三条做法，后人改的时候别拆：
//   · **门板当招牌**。资产库里的 shopPlaque 是一块无字门板 —— 一九三八年的
//     县城铺子上板打烊，门板就靠在自家墙根。它是这一层唯一的「这儿是家铺子」
//     信号，所以每家门脸尽量配一块，且 scale 一律 1.0（招牌高度不该忽高忽低）。
//   · **一家一个行当，货说明行当**：粮行=米袋+簸箕笸箩，酱园=缸，酒栈=坛+灯笼，
//     茶铺=一桌两凳+灯笼，柴行=柴垛，木行=木料垛，车马店=备用车轮+马槽，
//     磨坊=立靠墙的磨盘，布庄/杂货=货箱。看货就知道这条街做什么买卖。
//   · **一家的东西落在同一条墙根线上**。摆位不是手抠的：先量出该点该件能退到
//     的最大 across（受铺面格子/街肩带上限双重约束），再取**组内最小值**做公共
//     基线、留 0.35—0.55 m 墙根余量。同一家的坛子散到街对面去过一次，就是因为
//     小件能退得比大件远。
// 退线远的街（十字街、西门大街、南门里转折、后门大街路东、当典后街等）够不着
// 铺面墙，货就落在肩带外沿 —— 前后错开 0.1—0.55 m，不许排成一条直线。
// 茶铺的桌凳一律退到肩带外沿：一桌两凳压到路面上，AI 绕路就绕到街心去了。
//
// 【已知取舍，别当 bug 修】外部道具层一律按自己的包围盒落地（见 Script_ExternalProps
// 文件头），所以 clothLantern **挂不起来**，只能搁在门口地上 —— 情景就按「上板打烊，
// 灯笼取下来撂在门边」写。要真挂上去得给这一层加一个悬挂锚点，不在布设轮里做。

export const REGION = Object.freeze({
  id: "MainStreets", kind: "street", label: "主次街商业带",
  bounds: { minX: -286, maxX: 286, minZ: -286, maxZ: 286 },
});

export const PLACEMENTS = Object.freeze([
  // —— 十字街（z=0，x 0..75，宽 8）：全城最热闹的一段，街口 ±21 净空之外才开始摆 ——
  { asset: "marketRiceSack01", x: 25.6, z: -6.9, ry: 0.15, scale: 1.0,
    note: "十字街口东北角德聚成粮行：围城前一天卸下的米袋，来不及搬进铺子就摞在门口街肩上" },
  { asset: "marketRiceSack02", x: 26.45, z: -6.4, ry: -0.4, scale: 0.95,
    note: "德聚成粮行门口米袋垛之二，斜靠着前一袋" },
  { asset: "marketRiceSack01", x: 27.1, z: -7.05, ry: 1.2, scale: 0.9,
    note: "德聚成粮行门口米袋垛之三，横着丢在最外边" },
  { asset: "shopPlaque", x: 23.7, z: -6.88, ry: 0, scale: 1.0,
    note: "德聚成粮行卸下来的门板（无字匾），靠着自家墙根立着 —— 铺子上板那天起就没再取下来" },
  { asset: "marketBox02", x: 31.4, z: 6.4, ry: 0.3, scale: 1.0,
    note: "十字街口东南角杂货铺：铺板刚卸下一半，货箱撂在门脸前的街肩上" },
  { asset: "marketCrate03", x: 30.3, z: 6.9, ry: 1.45, scale: 1.0,
    note: "同一家杂货铺，翻倒的浅货箱" },
  { asset: "cart", x: 35.5, z: -6.6, ry: 1.5708, scale: 0.95,
    note: "十字街北侧临街铺面前顺街停着的手推车 —— 车主没能把它推回院里" },
  { asset: "marketBox03", x: 37.8, z: -7.0, ry: 0.2, scale: 1.0,
    note: "那辆手推车旁边卸下的大货箱" },
  { asset: "phRoughWoodTable", x: 39.6, z: -7.16, ry: 0.05, scale: 0.96,
    note: "十字街北侧广盛茶铺：门口那张方桌，茶碗都还摆着，客人跑防空洞去了" },
  { asset: "longBench", x: 40.75, z: -6.99, ry: 0.02, scale: 0.96,
    note: "广盛茶铺的长凳，退在肩带外沿、不压街心" },
  { asset: "clothLantern", x: 41.85, z: -7.27, ry: 0, scale: 0.98,
    note: "广盛茶铺门边的布灯笼，风一吹还在晃" },

  // —— 东门大街（z=-65，x 52..300，宽 9）：临街铺面最密的一条，北侧铺面门槛就在 z=-70.7 ——
  { asset: "ryTimberStack", x: 55, z: -57.56, ry: 0.03, scale: 1.04,
    note: "东门大街路南恒昌木行：一垛还没上梁的木料，顺街码在门口（路南退线远，摆得下这么长的料）" },
  { asset: "shopPlaque", x: 56.4, z: -57.47, ry: 3.1416, scale: 1.0,
    note: "恒昌木行的门板，靠在铺面墙根" },
  { asset: "stoneMillWheel", x: 63, z: -70, ry: 0.1, scale: 1.01,
    note: "东门大街路北天顺磨坊：拆下来的磨盘，立靠在门口墙上" },
  { asset: "shopPlaque", x: 64.4, z: -70, ry: 0, scale: 1.0,
    note: "天顺磨坊的门板" },
  { asset: "firewoodPile", x: 87.4, z: -57.44, ry: 0.3, scale: 1.03,
    note: "东门大街路南义和柴行：论捆卖的柴垛，摆到门槛外" },
  { asset: "shopPlaque", x: 89, z: -57.52, ry: 3.1416, scale: 1.0,
    note: "义和柴行的门板" },
  { asset: "phFirewoodBranches", x: 90.2, z: -57.5, ry: -0.4, scale: 0.98,
    note: "义和柴行门板东边散着的一捆细柴，绳还没系上" },
  { asset: "marketRiceSack01", x: 104.2, z: -70.1, ry: 0.2, scale: 1.05,
    note: "东门大街路北万丰粮行：门槛前贴墙码着的米袋垛，最里的一袋" },
  { asset: "marketRiceSack02", x: 105.05, z: -69.75, ry: -0.5, scale: 1.0,
    note: "万丰粮行米袋垛之二，压在垛口外沿" },
  { asset: "marketRiceSack01", x: 103.45, z: -69.6, ry: 1.1, scale: 0.95,
    note: "万丰粮行米袋垛之三，横着滚出来半袋" },
  { asset: "stackableStone03", x: 106.15, z: -70.15, ry: 0.6, scale: 1.0,
    note: "万丰粮行门口垫米袋防潮的石墩" },
  { asset: "winnowingBasket", x: 107.5, z: -70, ry: 1.35, scale: 1.02,
    note: "万丰粮行门口的簸箕，扬完场就立着靠在墙上" },
  { asset: "shopPlaque", x: 108.6, z: -70, ry: 0, scale: 1.0,
    note: "万丰粮行的门板，立在米袋垛东边的墙根" },
  { asset: "wineJarCluster", x: 117, z: -70, ry: 0.15, scale: 0.96,
    note: "东门大街路北德泰酒栈：门口一堆酒坛，围城后就没人来打酒了" },
  { asset: "clayLiddedJar", x: 118.1, z: -70, ry: -0.25, scale: 1.02,
    note: "德泰酒栈门口封着口的那只坛" },
  { asset: "clothLantern", x: 119.35, z: -70, ry: 0, scale: 0.96,
    note: "德泰酒栈门边的酒幌灯笼" },
  { asset: "cart", x: 118.5, z: -58.6, ry: 1.5708, scale: 0.95,
    note: "东门大街路南：一车粮卸到一半就撂下的手推车，顺街停在墙根" },
  { asset: "marketRiceSack01", x: 120.55, z: -58.3, ry: 0.3, scale: 1.0,
    note: "那辆粮车卸下的米袋，还堆在车尾" },
  { asset: "marketRiceSack02", x: 120.2, z: -59.05, ry: -0.6, scale: 0.95,
    note: "粮车卸下的第二袋，歪在前一袋上" },
  { asset: "marketBox03", x: 136.4, z: -69.85, ry: 0.35, scale: 1.0,
    note: "东门大街路北聚昌号：门脸被炮火打塌，货箱从铺子里滚到街肩上" },
  { asset: "marketCrate02", x: 135.25, z: -69.6, ry: 1.6, scale: 1.05,
    note: "聚昌号翻出来的浅货箱，侧翻在瓦砾边" },
  { asset: "clayRoundVat", x: 160.6, z: -70, ry: 0.1, scale: 1.05,
    note: "东门大街路北恒源酱园：门口的酱缸，缸口还压着石头" },
  { asset: "shopPlaque", x: 162, z: -70, ry: 0, scale: 1.0,
    note: "恒源酱园的门板" },
  { asset: "militaryCrateClosed", x: 214.6, z: -69.9, ry: 0.25, scale: 1.1,
    note: "东门大街路北铺面门口：守军往东门运弹药时撂下的军需箱（未开封）" },
  { asset: "militaryCrateOpen", x: 215.95, z: -69.55, ry: -1.2, scale: 1.05,
    note: "同一处，被撬开取空的军需箱，盖子敞着" },
  { asset: "marketBox02", x: 263.2, z: -69.9, ry: 0.4, scale: 1.0,
    note: "东门里最后一进铺面（已被打塌）门前散落的货箱 —— 玩家在 L4 从这一带出生" },
  { asset: "deadTreeTrunk01", x: 260.0, z: -58.6, ry: 0.05, scale: 0.9,
    note: "东门大街路南墙根被炮火掀倒的老槐，顺街躺在院墙外（2026-08-29 从 x=268 西移 8 m："
      + "新章的目标连线 CH3 出生点→救护所是一条横切街坊的直线，旧位置离它只有 0.27 m，撞规则 8）" },

  // —— 南门里大街北段（x=0，z 0..66，宽 7）：从十字街往南第一段，密度已经在递减 ——
  { asset: "marketBox02", x: -5.9, z: 26.9, ry: 0.3, scale: 1.0,
    note: "南门里大街北段路西同和布庄：卷起来的布匹装箱撂在门口，人已经进了防空洞" },
  { asset: "marketCrate04", x: -6.3, z: 28.8, ry: 1.5, scale: 1.05,
    note: "同和布庄门口的第二只货箱，翻着口" },
  { asset: "shopPlaque", x: -6.57, z: 25.3, ry: 1.5708, scale: 1.0,
    note: "同和布庄的门板，靠在货箱北边的墙根" },
  { asset: "marketRiceSack01", x: 6.58, z: 31, ry: 0.25, scale: 0.95,
    note: "南门里大街北段路东天成粮栈：门口最后一袋没搬进去的米" },
  { asset: "shopPlaque", x: 6.49, z: 32.3, ry: -1.5708, scale: 1.0,
    note: "天成粮栈的门板" },
  { asset: "clothLantern", x: 6.68, z: 45.5, ry: 0, scale: 0.95,
    note: "聚源酒栈门边的灯笼" },
  { asset: "wineJarCluster", x: 6.53, z: 46.6, ry: 0.1, scale: 1.03,
    note: "南门里大街北段路东聚源酒栈：门口那堆坛，封泥都没启" },

  // —— 南门里大街转折（z=66，x 0..70，宽 6）：北段与南段之间的那一折 ——
  { asset: "marketBox02", x: 26, z: 59.88, ry: 0.3, scale: 1.02,
    note: "南门里大街转折路北广裕号杂货：铺板卸了一半，货箱撂在门口" },
  { asset: "shopPlaque", x: 27.3, z: 59.73, ry: 0, scale: 1.0,
    note: "广裕号的门板" },

  // —— 南门里大街（x=70，z 66..300，宽 8）：路东铺面格子被街裁成浅格，货能贴到门槛 ——
  { asset: "marketRiceSack01", x: 74.3, z: 70.6, ry: 0.2, scale: 1.0,
    note: "南门里大街转角路东粮栈：米袋贴着铺面门槛码成小垛" },
  { asset: "marketRiceSack02", x: 74.15, z: 72.4, ry: -0.7, scale: 0.95,
    note: "同一家粮栈门口的第二袋米" },
  { asset: "shopPlaque", x: 74.5, z: 75.2, ry: -1.5708, scale: 1.0,
    note: "南门里大街转角粮栈的门板，立在米垛北边" },
  { asset: "wineJarCluster", x: 74.5, z: 101.4, ry: 0.1, scale: 0.96,
    note: "南门里大街路东义盛酒栈：门口的坛还码着，掌柜的躲南门洞去了" },
  { asset: "clothLantern", x: 74.5, z: 102.5, ry: 0, scale: 1.05,
    note: "义盛酒栈门边的灯笼" },
  { asset: "ryCartWheel", x: 74.5, z: 149.6, ry: 0.15, scale: 1.0,
    note: "南门里大街路东车马店：靠墙立着的备用车轮" },
  { asset: "shopPlaque", x: 74.5, z: 151, ry: -1.5708, scale: 1.0,
    note: "那家车马店的门板" },
  { asset: "marketBox03", x: 74.2, z: 179.6, ry: 0.5, scale: 0.95,
    note: "南门里大街路东铺面（已受损）：货箱被震翻在门脸前" },
  { asset: "marketCrate03", x: 74.35, z: 181.7, ry: 1.5, scale: 1.0,
    note: "同一家铺子翻出来的浅货箱" },
  { asset: "marketBox03", x: 74.5, z: 233.4, ry: 0.3, scale: 0.98,
    note: "南门里大街路东元记布庄：装布匹的大货箱，等不到南门开的车了" },
  { asset: "shopPlaque", x: 74.5, z: 234.7, ry: -1.5708, scale: 1.0,
    note: "元记布庄的门板" },

  // —— 北门大街南段（x=0，z -145..0，宽 7）——
  { asset: "marketBox02", x: -5.8, z: -34.0, ry: 0.4, scale: 1.0,
    note: "北门大街南段路西德和油盐店：装坛子的货箱堆在门口街肩" },
  { asset: "marketCrate02", x: -6.3, z: -35.9, ry: 1.4, scale: 1.0,
    note: "德和油盐店门口的浅箱，空了一半" },
  { asset: "shopPlaque", x: -6.38, z: -31.4, ry: 1.5708, scale: 1.0,
    note: "德和油盐店的门板，靠在货箱北边" },
  { asset: "shopPlaque", x: -6.72, z: -50.7, ry: 1.5708, scale: 1.0,
    note: "广丰粮行的门板" },
  { asset: "marketRiceSack01", x: -6.46, z: -52, ry: 0.25, scale: 0.99,
    note: "北门大街南段路西广丰粮行：门口剩下的一袋米" },
  { asset: "phRoughWoodTable", x: 6.7, z: -80, ry: -1.5708, scale: 0.94,
    note: "北门大街南段路东双合茶铺：门口的方桌，往北门增援的队伍在这儿灌过水" },
  { asset: "longBench", x: 6.48, z: -81.3, ry: -1.5708, scale: 0.97,
    note: "双合茶铺的长凳" },
  { asset: "militaryCrateOpen", x: 5.9, z: -107.6, ry: 0.9, scale: 1.0,
    note: "北门大街南段路东：往北门增援的队伍在铺前撂下的空军需箱" },
  { asset: "crate", x: 5.15, z: -105.9, ry: 0.5, scale: 1.0,
    note: "同一处铺面自家的木箱，被顺手推到街边给队伍让路" },

  // —— 北门大街（x=-145，z -300..-145，宽 7）：L6 主路线，两侧都是浅格铺面 ——
  { asset: "marketBox03", x: -141.3, z: -178.6, ry: 0.4, scale: 0.95,
    note: "北门大街路东铺面：铺板卸了一半，货箱还留在门脸前" },
  { asset: "marketCrate01", x: -141.6, z: -180.8, ry: 1.5, scale: 1.0,
    note: "同一家铺子门口的浅货箱" },
  { asset: "marketRiceSack01", x: -149.8, z: -185.0, ry: 0.3, scale: 1.0,
    note: "北门里路西粮行：米袋贴着铺面门槛码着，等不到进城的车了" },
  { asset: "marketRiceSack02", x: -149.55, z: -183.0, ry: -0.5, scale: 0.95,
    note: "北门里粮行门口的第二袋米" },
  { asset: "shopPlaque", x: -149.88, z: -181.6, ry: 1.5708, scale: 1.0,
    note: "北门里路西粮行的门板，立在米袋垛南边" },
  { asset: "shopPlaque", x: -141, z: -203.9, ry: -1.5708, scale: 1.0,
    note: "那家车马店的门板" },
  { asset: "ryCartWheel", x: -141, z: -205.2, ry: -0.2, scale: 1.01,
    note: "北门里路东车马店：靠墙的备用车轮，往北门送兵的大车刚换过一只" },
  { asset: "clothLantern", x: -149.87, z: -207.1, ry: 0, scale: 1.0,
    note: "永和酒栈门边的灯笼" },
  { asset: "wineJarCluster", x: -149.76, z: -208.2, ry: 0.1, scale: 1.02,
    note: "北门里路西永和酒栈：门口的酒坛，L6 的队伍要从这儿过" },
  { asset: "shopPlaque", x: -141, z: -233.1, ry: -1.5708, scale: 1.0,
    note: "万和酱园的门板" },
  { asset: "clayRoundVat", x: -141, z: -234.4, ry: 0.15, scale: 1.01,
    note: "北门里路东万和酱园：门口的酱缸" },

  // —— 西门大街（z=0，宽 9）：通视走廊 |z|≤5.35 一件不进，只在走廊外侧贴墙根 ——
  { asset: "phRoughWoodTable", x: -28.2, z: -7.57, ry: 0.05, scale: 1.04,
    note: "西门大街路北泰和茶铺：门口的方桌，退到通视走廊外沿" },
  { asset: "longBench", x: -29.4, z: -7.71, ry: 0, scale: 0.95,
    note: "泰和茶铺的长凳，顺墙摆、不进机枪通视带" },
  { asset: "marketBox02", x: -48.5, z: -6.9, ry: 0.3, scale: 1.0,
    note: "西门大街近十字街一段路北铺面：门口没收进去的货箱（避开城楼通视走廊）" },
  { asset: "marketCrate03", x: -49.75, z: -7.2, ry: 1.5, scale: 1.0,
    note: "同一家铺子的浅货箱，退在走廊外沿" },
  { asset: "clayRoundVat", x: -56.2, z: 7.43, ry: 0.2, scale: 1.02,
    note: "西门大街路南义丰酱园：门口的酱缸（在走廊南侧外）" },
  { asset: "shopPlaque", x: -57.6, z: 7.57, ry: 3.1416, scale: 1.0,
    note: "义丰酱园的门板" },
  { asset: "cart", x: -96.0, z: -6.6, ry: 1.5708, scale: 0.95,
    note: "西门大街中段路北：撂在路肩外沿的手推车，顺街停、不压机枪通视带" },
  { asset: "marketRiceSack01", x: -98.6, z: -7.3, ry: 0.4, scale: 1.0,
    note: "那辆手推车西边卸下的一袋米，先于车进入西来的视线" },

  // —— 县署前街（x=52，z -65..0，宽 6）：连十字街与东门大街的短街 ——
  { asset: "phRoughWoodTable", x: 46.02, z: -20.2, ry: 1.5708, scale: 0.96,
    note: "县署前街路西同顺茶馆：门口一桌，衙门口的差役天天在这儿歇脚" },
  { asset: "longBench", x: 45.9, z: -21.5, ry: 1.5708, scale: 0.95,
    note: "同顺茶馆的长凳，靠墙一排" },
  { asset: "marketBox01", x: 55.0, z: -29.8, ry: 0.6, scale: 1.0,
    note: "县署前街路东小杂货铺：门口只剩这一只货箱没收" },
  { asset: "crate", x: 55.3, z: -31.6, ry: -0.4, scale: 1.0,
    note: "同一家铺子的木箱，压着货箱的一角" },
  { asset: "marketCrate03", x: 46.14, z: -53.9, ry: 1.5, scale: 0.96,
    note: "文昌纸马店门口的浅货箱，纸马都受了潮" },
  { asset: "shopPlaque", x: 45.81, z: -55, ry: 1.5708, scale: 1.0,
    note: "县署前街路西文昌纸马店的门板" },

  // —— 次街：龙王庙街（z=-145，x -145..88，宽 5）——
  { asset: "wovenBasket", x: 17.1, z: -142, ry: 0.4, scale: 1.02,
    note: "那家小铺门口没收走的笸箩" },
  { asset: "shopPlaque", x: 18, z: -142, ry: 3.1416, scale: 1.0,
    note: "龙王庙街路南小铺的门板，铺子上了板、人进了防空洞" },
  { asset: "marketBox02", x: 12.5, z: -148.8, ry: 0.5, scale: 1.0,
    note: "龙王庙街路北小铺面：门口孤零零一只货箱" },
  { asset: "stackableStone07", x: 13.45, z: -148.4, ry: 0.8, scale: 1.0,
    note: "龙王庙街那只货箱旁垫脚的石块" },

  // —— 次街：后门大街（x=-75，z -260..-149，宽 5）——
  { asset: "marketRiceSack01", x: -78, z: -170, ry: 0.25, scale: 0.98,
    note: "后门大街路西粮栈：门槛前剩的一袋米" },
  { asset: "shopPlaque", x: -78, z: -168.7, ry: 1.5708, scale: 1.0,
    note: "后门大街路西粮栈的门板" },
  { asset: "shopPlaque", x: -69.41, z: -250.7, ry: -1.5708, scale: 1.0,
    note: "那家小杂货铺的门板" },
  { asset: "marketBox01", x: -69.49, z: -252, ry: 0.3, scale: 0.97,
    note: "后门大街路东小杂货铺：门口就这一只货箱" },

  // —— 次街：顺兴街（x=-185，z -90..122，宽 5）——
  { asset: "clothLantern", x: -179.55, z: -18.9, ry: 0, scale: 0.94,
    note: "顺兴街那家酒栈门边的灯笼" },
  { asset: "wineJarCluster", x: -179.51, z: -20, ry: 0.1, scale: 1.06,
    note: "顺兴街路东酒栈：门口的酒坛，街窄、坛就贴着墙根码" },
  { asset: "marketRiceSack01", x: -188, z: 50, ry: 0.3, scale: 0.96,
    note: "顺兴街路西粮行：门口的米袋" },
  { asset: "shopPlaque", x: -188, z: 51.3, ry: 1.5708, scale: 1.0,
    note: "顺兴街路西粮行的门板" },

  // —— 次街：当典后街（z=-90，x -185..52，宽 5）——
  { asset: "shopPlaque", x: -148.7, z: -84.51, ry: 3.1416, scale: 1.0,
    note: "当典后街路南布庄的门板" },
  { asset: "marketBox02", x: -150, z: -84.44, ry: 0.3, scale: 1.0,
    note: "当典后街路南布庄：门口装布的货箱" },
  { asset: "shopPlaque", x: -122.7, z: -95.66, ry: 0, scale: 1.0,
    note: "当典后街路北车马店的门板" },
  { asset: "ryCartWheel", x: -124, z: -95.61, ry: 0.2, scale: 0.96,
    note: "当典后街路北车马店：靠墙立着的备用车轮" },

  // —— 次街：当典东街（z=90，x -185..150，宽 5）——
  { asset: "stoneMillWheel", x: -46, z: 84.27, ry: 0.1, scale: 1.06,
    note: "当典东街路北磨坊：磨盘立靠在门口墙上" },
  { asset: "shopPlaque", x: -44.6, z: 84.48, ry: 0, scale: 1.0,
    note: "当典东街路北磨坊的门板" },
  { asset: "marketCrate02", x: 84.6, z: 86.2, ry: 1.5, scale: 1.0,
    note: "当典东街路北铺面门口翻着的浅货箱" },

  // —— 次街：关岳庙街（x=150，z -65..122，宽 5）——
  { asset: "shopPlaque", x: 153, z: -28.7, ry: -1.5708, scale: 1.0,
    note: "关岳庙街路东杂货铺的门板" },
  { asset: "marketBox01", x: 153, z: -30, ry: 0.3, scale: 0.96,
    note: "关岳庙街路东杂货铺：门口一只货箱" },
  { asset: "marketRiceSack01", x: 147, z: 100, ry: 0.25, scale: 0.99,
    note: "关岳庙街路西粮栈：门槛前的米袋" },
  { asset: "shopPlaque", x: 147, z: 101.3, ry: 1.5708, scale: 1.0,
    note: "关岳庙街路西粮栈的门板" },

  // —— 次街：奎文街（x=118，z 86..210，宽 5）——
  { asset: "wineJarCluster", x: 122.52, z: 98, ry: 0.1, scale: 1.06,
    note: "奎文街路东酒栈：门口的坛" },
  { asset: "clothLantern", x: 122.55, z: 99.1, ry: 0, scale: 0.98,
    note: "奎文街那家酒栈门边的灯笼" },
  { asset: "shopPlaque", x: 115, z: 176.4, ry: 1.5708, scale: 1.0,
    note: "奎文街路西一家关了门的铺子：只剩门板还立在墙根" },

  // —— 次街：奎文东街（x=192，z 66..210，宽 5）——
  { asset: "marketBox02", x: 197.79, z: 72, ry: 0.3, scale: 1.01,
    note: "奎文东街路东杂货铺：门口的货箱" },
  { asset: "shopPlaque", x: 197.68, z: 73.3, ry: -1.5708, scale: 1.0,
    note: "奎文东街路东杂货铺的门板" },
  { asset: "marketRiceSack01", x: 189, z: 150, ry: 0.25, scale: 1.05,
    note: "奎文东街路西粮行：门口的米袋" },
  { asset: "shopPlaque", x: 189, z: 151.3, ry: 1.5708, scale: 1.0,
    note: "奎文东街路西粮行的门板" },

  // —— 次街：火神庙东街（z=210，x -145..192，宽 5）——
  { asset: "marketBox02", x: -105, z: 207, ry: 0.3, scale: 0.98,
    note: "火神庙东街路北布庄：门口的货箱" },
  { asset: "shopPlaque", x: -103.7, z: 207, ry: 0, scale: 1.0,
    note: "火神庙东街路北布庄的门板" },
  { asset: "clayRoundVat", x: 100, z: 215.67, ry: 0.15, scale: 1.01,
    note: "火神庙东街路南酱园：门口那只酱缸，是这条街上唯一还认得出的买卖" },
]);
