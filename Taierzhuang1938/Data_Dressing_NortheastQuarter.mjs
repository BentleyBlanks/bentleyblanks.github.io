// 城东北片（x 0..286, z -286..0）的每户生活布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有这个片区的包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。摆位全部走世界坐标（X 向东，Z 向南），
// 落地/碰撞由 Script_ExternalProps 统一处理。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs
//
// 【这一片摆的是什么】三月十七日，城东北。生活是被战争打断的，不是被清空的：
// 靠十字街口那几户还完好，粮袋码得齐、箱子刚捆好 —— 装到一半，人没回来；
// 中段挨了炮，板条箱翻在院里、墙石滚了一地；东城根与烧过的院子只剩石堆与
// 焦木。每一件都对着它所在那一格的 state（intact / damaged / collapsed+burnt）。
//
// 【选点的两条纪律】
//   · 一律落在院内空地：正房在北、门与影壁在南、厢房在一侧，程序化的缸／篮／
//     柴垛／菜畦各有定位（Script_CityBlockKit 与 Script_LivedInProps 算得出来），
//     外部件只补它们剩下的那块空地，不叠桩、不堵门道、不压菜畦。
//   · 只进玩家真会路过的格子（L4/L5 的 detail 或 mid），三关全 far 的格子一件不摆。

export const REGION = Object.freeze({
  id: "NortheastQuarter", kind: "quarter", label: "城东北片",
  bounds: { minX: 0, maxX: 286, minZ: -286, maxZ: 0 },
});

export const PLACEMENTS = Object.freeze([
  // ---- 十字街东北：离街口最近的几户，房子还整着（intact） ----------------
  // blk11_9 两进院。前院里一辆装到一半的手推车 —— 箱子和粮袋刚搬出二门。
  { asset: "cart", x: 30.6, z: -63.2, ry: 0.32, scale: 0.92,
    note: "blk11_9 两进院前院：装到一半的手推车，车头朝院门" },
  { asset: "marketBox03", x: 29.6, z: -61.6, ry: -0.4, scale: 0.95,
    note: "blk11_9：捆好待装车的大木箱，靠倒座房山墙撂着" },
  { asset: "marketRiceSack01", x: 31.9, z: -61.9, ry: 0.7, scale: 1.0,
    note: "blk11_9：先扛出来的一口米袋，还没上车" },

  // blk11_10 L 形院。菜畦那一侧的空地上，细软装了箱就没再动。
  { asset: "crate", x: 21.3, z: -40.3, ry: 0.25, scale: 1.0,
    note: "blk11_10 L 形院南院：捆好的家什木箱" },
  { asset: "marketBox02", x: 22.3, z: -39.6, ry: -0.55, scale: 1.0,
    note: "blk11_10：与木箱并排的第二只箱子" },

  // blk12_11 土墙窄院。后院矮墙南边是柴院，两口米袋靠着院墙。
  { asset: "marketRiceSack01", x: 58.3, z: -15.4, ry: 0.5, scale: 1.05,
    note: "blk12_11 土墙窄院后院：靠西院墙的米袋" },
  { asset: "marketRiceSack02", x: 59.2, z: -16.2, ry: -0.35, scale: 1.0,
    note: "blk12_11：并排的第二口米袋，刚从碾上下来" },

  // blk13_11 土墙院。做粮行小生意的一户，货码在厢房南山墙下。
  { asset: "marketCrate01", x: 71.6, z: -16.8, ry: 0.18, scale: 1.0,
    note: "blk13_11 土墙院后院：粮行小户码在厢房山墙下的板条箱" },
  { asset: "marketRiceSack02", x: 70.9, z: -15.9, ry: -0.6, scale: 1.0,
    note: "blk13_11：板条箱旁的米袋" },

  // ---- 中段：挨过炮的院子（damaged），东西是翻倒散落的 -------------------
  // blk13_10 土墙院。后院的板条箱被震翻，墙上掉下来的石头滚了一地。
  { asset: "marketCrate04", x: 74.2, z: -39.3, ry: 1.1, scale: 1.0,
    note: "blk13_10 土墙院后院：被震翻、横躺的板条箱" },
  { asset: "stackableStone02", x: 75.4, z: -38.5, ry: 0.4, scale: 1.0,
    note: "blk13_10：从院墙上掀下来的过墙石" },
  { asset: "stackableStone04", x: 76.1, z: -39.2, ry: -0.8, scale: 0.9,
    note: "blk13_10：滚开的第二块墙石" },

  // blk13_5 L 形院。龙王庙街北的一户，院心的货翻了。
  { asset: "marketCrate03", x: 85.0, z: -155.5, ry: 0.9, scale: 1.0,
    note: "blk13_5 L 形院院心：掀翻的板条箱" },
  { asset: "marketCrate01", x: 85.9, z: -156.2, ry: -0.25, scale: 0.95,
    note: "blk13_5：跟着倒下的第二只板条箱" },

  // blk14_4 水井院（intact）。半公共的井台，西边空场上一根待劈的树干。
  // 整合验收挪位：原 (100.6,-181.2) 插进程序化秸秆垛 0.53 m（引擎碰撞对撞探针取证）。
  { asset: "deadTreeTrunk01", x: 102.4, z: -183.0, ry: 0.35, scale: 0.9,
    note: "blk14_4 井院西空场：横着的枯树干，等着劈柴（三月鲁南无叶）" },
  { asset: "marketBox03", x: 103.2, z: -179.3, ry: -0.3, scale: 0.9,
    note: "blk14_4：树干旁盛柴的大木箱" },

  // blk15_4 土墙窄院。后院墙根的口粮，离县衙不远的一户。
  { asset: "marketRiceSack01", x: 126.0, z: -176.5, ry: 0.6, scale: 1.05,
    note: "blk15_4 土墙窄院后院：靠北的一口米袋" },
  { asset: "marketBox01", x: 126.9, z: -177.2, ry: -0.45, scale: 1.0,
    note: "blk15_4：米袋边上的小木箱" },

  // ---- 县衙以东：打得最重的一带（damaged / burnt） ----------------------
  // blk16_7 土墙窄院。后院里那辆没推出去的独轮车。
  { asset: "cart", x: 166.6, z: -107.6, ry: -0.3, scale: 0.95,
    note: "blk16_7 土墙窄院后院：没推出街口的手推车" },
  { asset: "crate", x: 168.6, z: -108.8, ry: 0.42, scale: 0.9,
    note: "blk16_7：卸在车旁的木箱" },

  // blk17_7 L 形院。屋顶炸开，院心是一摊碎砖与掀起来的墙石。
  { asset: "rubble", x: 190.3, z: -110.3, ry: 0.5, scale: 0.9,
    note: "blk17_7 L 形院院心：炮弹掀开屋面后落下的砖瓦堆" },
  { asset: "stackableStone03", x: 188.3, z: -109.3, ry: -0.7, scale: 1.0,
    note: "blk17_7：砖堆边滚开的一块墙石" },

  // blk18_7 土墙院（烧过）。从火里抢出来的东西堆在东墙根。
  { asset: "crate", x: 227.4, z: -122.3, ry: 0.22, scale: 1.0,
    note: "blk18_7 烧过的土墙院东墙根：从火里抢出来的木箱" },
  { asset: "marketRiceSack02", x: 226.5, z: -121.4, ry: -0.5, scale: 1.0,
    note: "blk18_7：跟着抢出来的一口米袋" },

  // blk17_8 水井院（烧过）。井台东边翻倒的手推车，货撒在一边。
  { asset: "cart", x: 197.1, z: -91.4, ry: 1.35, scale: 1.0,
    note: "blk17_8 烧过的井院：井台东边横过来的手推车" },
  { asset: "crate", x: 195.4, z: -89.6, ry: -0.3, scale: 0.85,
    note: "blk17_8：从车上滑下来的木箱" },

  // blk18_8 两进院。粮袋搬到二门口就撂下了。
  { asset: "marketRiceSack01", x: 221.6, z: -87.6, ry: 0.24, scale: 1.05,
    note: "blk18_8 两进院前院：搬到二门口就撂下的米袋" },
  { asset: "marketRiceSack02", x: 222.5, z: -88.3, ry: -0.66, scale: 1.0,
    note: "blk18_8：并排的第二口米袋" },

  // ---- 东城根：L3/L4 近景，烧塌见底的几户 -------------------------------
  // blk19_7 L 形院（烧过）。院里只剩一根烧焦的树干与散石。
  { asset: "deadTreeTrunk02", x: 248.9, z: -108.2, ry: 0.6, scale: 0.85,
    note: "blk19_7 烧过的 L 形院：院里那棵树烧剩的粗干，倒在院心" },
  { asset: "stackableStone06", x: 251.7, z: -107.4, ry: -0.4, scale: 1.0,
    note: "blk19_7：焦木旁的碎墙石" },
  { asset: "stackableStone03", x: 252.5, z: -106.6, ry: 0.85, scale: 0.9,
    note: "blk19_7：滚向院门的第二块墙石" },

  // blk20_12 L 形院（collapsed + burnt）。东城墙根塌到底的一户。
  // 整合验收挪位：原 (279.3,-6.2) 在 L5/L6 的中/远景档里被合并体块吞进 2.86 m ——
  // 中/远景正房比近景大一圈（西北包同款教训）。这格骑在 z=0 的片区线上，
  // 只能挪进东墙根、中景体块（x≤281）以东的窄带。
  { asset: "rubble", x: 282.7, z: -4.6, ry: 0.35, scale: 1.0,
    note: "blk20_12 东城根塌到底的院子：靠东院墙的一摊砖瓦" },
  { asset: "stackableStone05", x: 281.5, z: -5.2, ry: -0.6, scale: 1.0,
    note: "blk20_12：塌墙里掀出来的大石块" },
  { asset: "stackableStone02", x: 281.9, z: -7.3, ry: 0.9, scale: 0.9,
    note: "blk20_12：滚到东院墙根的墙石" },

  // ---- 城北：警备队西邻的井院（L4 中景） --------------------------------
  { asset: "marketRiceSack01", x: 208.4, z: -248.6, ry: 0.3, scale: 1.05,
    note: "blk18_1 北关井院：城破前最后一批没运走的公粮" },
  { asset: "marketBox02", x: 207.6, z: -249.4, ry: -0.5, scale: 1.0,
    note: "blk18_1：粮袋边上的公家木箱" },
]);
