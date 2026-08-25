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
  { asset: "marketBox02", x: 31.4, z: 6.4, ry: 0.3, scale: 1.0,
    note: "十字街口东南角杂货铺：铺板刚卸下一半，货箱撂在门脸前的街肩上" },
  { asset: "marketCrate03", x: 30.3, z: 6.9, ry: 1.45, scale: 1.0,
    note: "同一家杂货铺，翻倒的浅货箱" },
  { asset: "cart", x: 35.5, z: -6.6, ry: 1.5708, scale: 0.95,
    note: "十字街北侧临街铺面前顺街停着的手推车 —— 车主没能把它推回院里" },
  { asset: "marketBox03", x: 37.8, z: -7.0, ry: 0.2, scale: 1.0,
    note: "那辆手推车旁边卸下的大货箱" },

  // —— 东门大街（z=-65，x 52..300，宽 9）：临街铺面最密的一条，北侧铺面门槛就在 z=-70.7 ——
  { asset: "marketRiceSack01", x: 104.2, z: -70.1, ry: 0.2, scale: 1.05,
    note: "东门大街路北万丰粮行：门槛前贴墙码着的米袋垛，最里的一袋" },
  { asset: "marketRiceSack02", x: 105.05, z: -69.75, ry: -0.5, scale: 1.0,
    note: "万丰粮行米袋垛之二，压在垛口外沿" },
  { asset: "marketRiceSack01", x: 103.45, z: -69.6, ry: 1.1, scale: 0.95,
    note: "万丰粮行米袋垛之三，横着滚出来半袋" },
  { asset: "stackableStone03", x: 106.15, z: -70.15, ry: 0.6, scale: 1.0,
    note: "万丰粮行门口垫米袋防潮的石墩" },
  { asset: "marketBox03", x: 136.4, z: -69.85, ry: 0.35, scale: 1.0,
    note: "东门大街路北聚昌号：门脸被炮火打塌，货箱从铺子里滚到街肩上" },
  { asset: "marketCrate02", x: 135.25, z: -69.6, ry: 1.6, scale: 1.05,
    note: "聚昌号翻出来的浅货箱，侧翻在瓦砾边" },
  { asset: "cart", x: 118.5, z: -58.6, ry: 1.5708, scale: 0.95,
    note: "东门大街路南：一车粮卸到一半就撂下的手推车，顺街停在墙根" },
  { asset: "marketRiceSack01", x: 120.55, z: -58.3, ry: 0.3, scale: 1.0,
    note: "那辆粮车卸下的米袋，还堆在车尾" },
  { asset: "marketRiceSack02", x: 120.2, z: -59.05, ry: -0.6, scale: 0.95,
    note: "粮车卸下的第二袋，歪在前一袋上" },
  { asset: "militaryCrateClosed", x: 214.6, z: -69.9, ry: 0.25, scale: 1.1,
    note: "东门大街路北铺面门口：守军往东门运弹药时撂下的军需箱（未开封）" },
  { asset: "militaryCrateOpen", x: 215.95, z: -69.55, ry: -1.2, scale: 1.05,
    note: "同一处，被撬开取空的军需箱，盖子敞着" },
  { asset: "marketBox02", x: 263.2, z: -69.9, ry: 0.4, scale: 1.0,
    note: "东门里最后一进铺面（已被打塌）门前散落的货箱 —— 玩家在 L4 从这一带出生" },
  { asset: "deadTreeTrunk01", x: 268.0, z: -58.6, ry: 0.05, scale: 0.9,
    note: "东门大街路南墙根被炮火掀倒的老槐，顺街躺在院墙外" },

  // —— 南门里大街北段（x=0，z 0..66，宽 7）：从十字街往南第一段，密度已经在递减 ——
  { asset: "marketBox02", x: -5.9, z: 26.9, ry: 0.3, scale: 1.0,
    note: "南门里大街北段路西同和布庄：卷起来的布匹装箱撂在门口，人已经进了防空洞" },
  { asset: "marketCrate04", x: -6.3, z: 28.8, ry: 1.5, scale: 1.05,
    note: "同和布庄门口的第二只货箱，翻着口" },

  // —— 南门里大街（x=70，z 66..300，宽 8）：路东铺面格子被街裁成浅格，货能贴到门槛 ——
  { asset: "marketRiceSack01", x: 74.3, z: 70.6, ry: 0.2, scale: 1.0,
    note: "南门里大街转角路东粮栈：米袋贴着铺面门槛码成小垛" },
  { asset: "marketRiceSack02", x: 74.15, z: 72.4, ry: -0.7, scale: 0.95,
    note: "同一家粮栈门口的第二袋米" },
  { asset: "marketBox03", x: 74.2, z: 179.6, ry: 0.5, scale: 0.95,
    note: "南门里大街路东铺面（已受损）：货箱被震翻在门脸前" },
  { asset: "marketCrate03", x: 74.35, z: 181.7, ry: 1.5, scale: 1.0,
    note: "同一家铺子翻出来的浅货箱" },

  // —— 北门大街南段（x=0，z -145..0，宽 7）——
  { asset: "marketBox02", x: -5.8, z: -34.0, ry: 0.4, scale: 1.0,
    note: "北门大街南段路西德和油盐店：装坛子的货箱堆在门口街肩" },
  { asset: "marketCrate02", x: -6.3, z: -35.9, ry: 1.4, scale: 1.0,
    note: "德和油盐店门口的浅箱，空了一半" },
  { asset: "militaryCrateOpen", x: 5.9, z: -107.6, ry: 0.9, scale: 1.0,
    note: "北门大街南段路东：往北门增援的队伍在铺前撂下的空军需箱" },
  { asset: "crate", x: 5.15, z: -105.9, ry: 0.5, scale: 1.0,
    note: "同一处铺面自家的木箱，被顺手推到街边给队伍让路" },

  // —— 北门大街（x=-145，z -300..-145，宽 7）：L6 主路线，两侧都是浅格铺面 ——
  { asset: "marketRiceSack01", x: -149.8, z: -185.0, ry: 0.3, scale: 1.0,
    note: "北门里路西粮行：米袋贴着铺面门槛码着，等不到进城的车了" },
  { asset: "marketRiceSack02", x: -149.55, z: -183.0, ry: -0.5, scale: 0.95,
    note: "北门里粮行门口的第二袋米" },
  { asset: "marketBox03", x: -141.3, z: -178.6, ry: 0.4, scale: 0.95,
    note: "北门大街路东铺面：铺板卸了一半，货箱还留在门脸前" },
  { asset: "marketCrate01", x: -141.6, z: -180.8, ry: 1.5, scale: 1.0,
    note: "同一家铺子门口的浅货箱" },

  // —— 西门大街（z=0，宽 9）：通视走廊 |z|≤5.35 一件不进，只在走廊外侧贴墙根 ——
  { asset: "marketBox02", x: -48.5, z: -6.9, ry: 0.3, scale: 1.0,
    note: "西门大街近十字街一段路北铺面：门口没收进去的货箱（避开城楼通视走廊）" },
  { asset: "marketCrate03", x: -49.75, z: -7.2, ry: 1.5, scale: 1.0,
    note: "同一家铺子的浅货箱，退在走廊外沿" },
  { asset: "cart", x: -96.0, z: -6.6, ry: 1.5708, scale: 0.95,
    note: "西门大街中段路北：撂在路肩外沿的手推车，顺街停、不压机枪通视带" },
  { asset: "marketRiceSack01", x: -98.6, z: -7.3, ry: 0.4, scale: 1.0,
    note: "那辆手推车西边卸下的一袋米，先于车进入西来的视线" },

  // —— 县署前街（x=52，z -65..0，宽 6）：连十字街与东门大街的短街 ——
  { asset: "marketBox01", x: 55.0, z: -29.8, ry: 0.6, scale: 1.0,
    note: "县署前街路东小杂货铺：门口只剩这一只货箱没收" },
  { asset: "crate", x: 55.3, z: -31.6, ry: -0.4, scale: 1.0,
    note: "同一家铺子的木箱，压着货箱的一角" },

  // —— 次街零星（宽 5，商业密度最低，一处一两件就够）——
  { asset: "marketBox02", x: 12.5, z: -148.8, ry: 0.5, scale: 1.0,
    note: "龙王庙街路北小铺面：门口孤零零一只货箱" },
  { asset: "stackableStone07", x: 13.45, z: -148.4, ry: 0.8, scale: 1.0,
    note: "龙王庙街那只货箱旁垫脚的石块" },
  { asset: "marketCrate02", x: 84.6, z: 86.2, ry: 1.5, scale: 1.0,
    note: "当典东街路北铺面门口翻着的浅货箱" },
]);
