// 城东北片（x 0..286, z -286..0）的每户生活布设 —— 外部道具层。
//
// 本文件属于一个并行工作包：**只有这个片区的包写它**，规则与流程见
// Script_TownDressing.mjs 文件头。摆位全部走世界坐标（X 向东，Z 向南），
// 落地/碰撞由 Script_ExternalProps 统一处理。
// 自验：node Taierzhuang1938/Script_TownDressingTest.mjs
// 布局 v3 注：note 里的 blk##_# 保留为迁移前的叙事户号，不再等同于当前生成格 seed；
// 同户道具已整体迁入新的非均质院落，户内相对关系不变。
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
  { asset: "cart", x: 23.83, z: -57.15, ry: 0.32, scale: 0.92,
    note: "blk11_9 两进院前院：装到一半的手推车，车头朝院门" },
  { asset: "marketBox03", x: 22.83, z: -55.55, ry: -0.4, scale: 0.95,
    note: "blk11_9：捆好待装车的大木箱，靠倒座房山墙撂着" },
  { asset: "marketRiceSack01", x: 25.13, z: -55.85, ry: 0.7, scale: 1.0,
    note: "blk11_9：先扛出来的一口米袋，还没上车" },

  // blk11_10 L 形院。菜畦那一侧的空地上，细软装了箱就没再动。
  { asset: "crate", x: 31.69, z: -31.01, ry: 0.25, scale: 1.0,
    note: "blk11_10 L 形院南院：捆好的家什木箱" },
  { asset: "marketBox02", x: 32.69, z: -30.31, ry: -0.55, scale: 1.0,
    note: "blk11_10：与木箱并排的第二只箱子" },

  // blk12_11 土墙窄院。后院矮墙南边是柴院，两口米袋靠着院墙。
  { asset: "marketRiceSack01", x: 65.52, z: -9.9, ry: 0.5, scale: 1.05,
    note: "blk12_11 土墙窄院后院：靠西院墙的米袋" },
  { asset: "marketRiceSack02", x: 66.19, z: -10.49, ry: -0.35, scale: 1.0,
    note: "blk12_11：并排的第二口米袋，刚从碾上下来" },

  // blk13_11 土墙院。做粮行小生意的一户，货码在厢房南山墙下。
  { asset: "marketCrate01", x: 34.92, z: -60.55, ry: 0.18, scale: 1.0,
    note: "blk13_11 土墙院后院：粮行小户码在厢房山墙下的板条箱" },
  { asset: "marketRiceSack02", x: 34.64, z: -60.19, ry: -0.6, scale: 1.0,
    note: "blk13_11：板条箱旁的米袋" },

  // ---- 中段：挨过炮的院子（damaged），东西是翻倒散落的 -------------------
  // blk13_10 土墙院。后院的板条箱被震翻，墙上掉下来的石头滚了一地。
  { asset: "marketCrate04", x: 75.12, z: -31.25, ry: 1.1, scale: 1.0,
    note: "blk13_10 土墙院后院：被震翻、横躺的板条箱" },
  { asset: "stackableStone02", x: 76.32, z: -30.45, ry: 0.4, scale: 1.0,
    note: "blk13_10：从院墙上掀下来的过墙石" },
  { asset: "stackableStone04", x: 77.02, z: -31.15, ry: -0.8, scale: 0.9,
    note: "blk13_10：滚开的第二块墙石" },

  // blk13_5 L 形院。龙王庙街北的一户，院心的货翻了。
  { asset: "marketCrate03", x: 91.86, z: -263.96, ry: 0.9, scale: 1.0,
    note: "blk13_5 L 形院院心：掀翻的板条箱" },
  { asset: "marketCrate01", x: 92.65, z: -264.05, ry: -0.25, scale: 0.95,
    note: "blk13_5：跟着倒下的第二只板条箱" },

  // blk14_4 水井院（intact）。半公共的井台，西边空场上一根待劈的树干。
  // 整合验收挪位：原 (100.6,-181.2) 插进程序化秸秆垛 0.53 m（引擎碰撞对撞探针取证）。
  { asset: "deadTreeTrunk01", x: 62.77, z: -227.33, ry: 0.35, scale: 0.9,
    note: "blk14_4 井院西空场：横着的枯树干，等着劈柴（三月鲁南无叶）" },
  { asset: "marketBox03", x: 63.57, z: -223.63, ry: -0.3, scale: 0.9,
    note: "blk14_4：树干旁盛柴的大木箱" },

  // blk15_4 土墙窄院。后院墙根的口粮，离县衙不远的一户。
  { asset: "marketRiceSack01", x: 178.09, z: -222.02, ry: 0.6, scale: 1.05,
    note: "blk15_4 土墙窄院后院：靠北的一口米袋" },
  { asset: "marketBox01", x: 178.99, z: -222.71, ry: -0.45, scale: 1.0,
    note: "blk15_4：米袋边上的小木箱" },

  // ---- 县衙以东：打得最重的一带（damaged / burnt） ----------------------
  // blk16_7 土墙窄院。后院里那辆没推出去的独轮车。
  { asset: "cart", x: 179.46, z: -5.1, ry: -0.3, scale: 0.95,
    note: "blk16_7 土墙窄院后院：没推出街口的手推车" },
  { asset: "crate", x: 181.46, z: -6.3, ry: 0.42, scale: 0.9,
    note: "blk16_7：卸在车旁的木箱" },

  // blk17_7 L 形院。屋顶炸开，院心是一摊碎砖与掀起来的墙石。
  { asset: "rubble", x: 253.93, z: -179.98, ry: 0.5, scale: 0.9,
    note: "blk17_7 L 形院院心：炮弹掀开屋面后落下的砖瓦堆" },
  { asset: "stackableStone03", x: 251.93, z: -178.98, ry: -0.7, scale: 1.0,
    note: "blk17_7：砖堆边滚开的一块墙石" },

  // blk18_7 土墙院（烧过）。从火里抢出来的东西堆在东墙根。
  { asset: "crate", x: 280.97, z: -40.89, ry: 0.22, scale: 1.0,
    note: "blk18_7 烧过的土墙院东墙根：从火里抢出来的木箱" },
  { asset: "marketRiceSack02", x: 279.41, z: -40.58, ry: -0.5, scale: 1.0,
    note: "blk18_7：跟着抢出来的一口米袋" },

  // blk17_8 水井院（烧过）。井台东边翻倒的手推车，货撒在一边。
  { asset: "cart", x: 182.93, z: -88.82, ry: 1.35, scale: 1.0,
    note: "blk17_8 烧过的井院：井台东边横过来的手推车" },
  { asset: "crate", x: 181.23, z: -87.02, ry: -0.3, scale: 0.85,
    note: "blk17_8：从车上滑下来的木箱" },

  // blk18_8 两进院。粮袋搬到二门口就撂下了。
  { asset: "marketRiceSack01", x: 167.35, z: -7.32, ry: 0.24, scale: 1.05,
    note: "blk18_8 两进院前院：搬到二门口就撂下的米袋" },
  { asset: "marketRiceSack02", x: 168.25, z: -8.02, ry: -0.66, scale: 1.0,
    note: "blk18_8：并排的第二口米袋" },

  // ---- 东城根：L3/L4 近景，烧塌见底的几户 -------------------------------
  // blk19_7 L 形院（烧过）。院里只剩一根烧焦的树干与散石。
  { asset: "deadTreeTrunk02", x: 235.77, z: -134.81, ry: 0.6, scale: 0.85,
    note: "blk19_7 烧过的 L 形院：院里那棵树烧剩的粗干，倒在院心" },
  { asset: "stackableStone06", x: 238.57, z: -134.01, ry: -0.4, scale: 1.0,
    note: "blk19_7：焦木旁的碎墙石" },
  { asset: "stackableStone03", x: 239.37, z: -133.21, ry: 0.85, scale: 0.9,
    note: "blk19_7：滚向院门的第二块墙石" },

  // blk20_12 L 形院（collapsed + burnt）。东城墙根塌到底的一户。
  // 整合验收挪位：原 (279.3,-6.2) 在 L5/L6 的中/远景档里被合并体块吞进 2.86 m ——
  // 中/远景正房比近景大一圈（西北包同款教训）。这格骑在 z=0 的片区线上，
  // 只能挪进东墙根、中景体块（x≤281）以东的窄带。
  { asset: "rubble", x: 262.92, z: -12.05, ry: 0.35, scale: 1.0,
    note: "blk20_12 东城根塌到底的院子：靠东院墙的一摊砖瓦" },
  { asset: "stackableStone05", x: 262.07, z: -12.95, ry: -0.6, scale: 1.0,
    note: "blk20_12：塌墙里掀出来的大石块" },

  // ---- 城北：警备队西邻的井院（L4 中景） --------------------------------
  { asset: "marketRiceSack01", x: 218.74, z: -266.02, ry: 0.3, scale: 1.05,
    note: "blk18_1 北关井院：城破前最后一批没运走的公粮" },
  { asset: "marketBox02", x: 218.08, z: -266.68, ry: -0.5, scale: 1.0,
    note: "blk18_1：粮袋边上的公家木箱" },

  // ==========================================================================
  // 【第二轮加密：把这一片摆成真的住过人】
  //
  // 上面那三十六件讲的是「装到一半、人没回来」——车、箱、粮袋，是**离开**的痕迹。
  // 下面这一百零二件讲的是**住着**：檐下接雨的水缸、灶间外一溜腌菜的陶瓮、
  // 院角平放的磨盘、墙根的劈柴墩与斧、院心那张吃饭的粗木桌。一户一件事，
  // 不是均匀撒豆子 —— 同一组东西彼此有用处上的关系（缸配桶、墩配斧、桌配凳），
  // 摆在那户人家真会用它的地方（缸在正房檐下、柴在墙根、桌在院心）。
  //
  // 选点全部走引擎真值：L4/L5/L6 三关各建一次，把候选件与**该关自己 LOD 档**
  // 建出来的程序化碰撞盒做 SAT，间隙不足 0.20 m 的落点一概不要 —— 中/远景的
  // 合并体块比近景正房大一圈（blk20_12 那条挪位注释就是这个坑），只按近景选点
  // 必在另一关埋进墙里。院门、二门、巷口一律不占：碰撞不流送，堵死就是真堵死。
  //
  // damage 对齐照旧：intact 的院子东西齐整；damaged 的歪着、墙石滚在旁边；
  // collapsed / burnt 的只剩石与陶（陶器打碎归破坏系统，这里摆完整件 + 散石）。
  // 井院不摆水缸与井台 —— 那两样程序化的井院自己有。
  // ==========================================================================

  // blk11_11 ShopRow（挨过炮）：灶间外的墙根排着一溜腌菜的陶瓮。
  { asset: "clayRoundVat", x: 37.1, z: -16.11, ry: 0.2,
    note: "blk11_11 临街铺面后院（挨过炮）：灶间外墙根的圆腹陶缸" },
  { asset: "clayLiddedJar", x: 37.43, z: -16.07, ry: -0.3,
    note: "blk11_11 临街铺面后院（挨过炮）：并排的有盖陶坛（腌的咸菜）" },
  { asset: "clayWideJar", x: 37.73, z: -16.1, ry: 0.5,
    note: "blk11_11 临街铺面后院（挨过炮）：队尾的阔口陶坛" },

  // blk12_10 OneEntry（齐整）：檐下一口接雨的水缸，桶与盆搁在缸边。
  { asset: "clayWaterVat", x: 61.49, z: -36.85, ry: 0,
    note: "blk12_10 一进院正房檐下：正房檐下接雨的水缸" },
  { asset: "ryWaterBucket", x: 62.07, z: -36.61, ry: 0.4,
    note: "blk12_10 一进院正房檐下：缸边打水的木桶" },
  { asset: "phWoodenWashTub", x: 60.81, z: -36.66, ry: -0.3,
    note: "blk12_10 一进院正房檐下：撂在缸旁的木盆" },

  // blk13_12 LCourtyard（齐整）：院心一张粗木桌配一条长凳。
  { asset: "phRoughWoodTable", x: 212.5, z: -229.79, ry: 3.24,
    note: "blk13_12 L 形院院心：院心树荫下的粗木桌" },
  { asset: "longBench", x: 212.47, z: -231.01, ry: 3.04,
    note: "blk13_12 L 形院院心：桌前的木条凳" },

  // blk12_9 OneEntry（挨过炮）：墙根码着的柴垛。
  { asset: "ryFirewoodStack", x: 15.04, z: -43.12, ry: 1.321,
    note: "blk12_9 窄院西墙根：墙根码着的柴垛" },
  { asset: "phFirewoodBranches", x: 15.27, z: -43.52, ry: 1.721,
    note: "blk12_9 窄院西墙根：散在柴垛旁的柴枝" },

  // blk13_9 AdobeYard（挨过炮）：墙根的劈柴墩，斧子撂在墩上，柴还没码。
  { asset: "ryChoppingBlock", x: 113.58, z: -85.23, ry: -1.821,
    note: "blk13_9 土墙窄院东墙根：墙根的劈柴墩" },
  { asset: "phWoodAxe", x: 113.34, z: -84.84, ry: -0.371,
    note: "blk13_9 土墙窄院东墙根：撂在墩边的木柄斧" },
  { asset: "phFirewoodBranches", x: 113.64, z: -84.17, ry: -1.271,
    note: "blk13_9 土墙窄院东墙根：还没码起来的柴枝" },

  // blk13_8 TwoEntry（挨过炮）：院角一方平放的石磨盘，簸箕靠着墙立。
  { asset: "stoneMillWheel", x: 88.34, z: -93.17, ry: -1.151,
    note: "blk13_8 两进院后院东角：院角平放的石磨盘" },
  { asset: "winnowingBasket", x: 88.79, z: -92.29, ry: -1.401,
    note: "blk13_8 两进院后院东角：靠墙立着的簸箕" },
  { asset: "wovenBasket", x: 88.19, z: -93.92, ry: -1.851,
    note: "blk13_8 两进院后院东角：磨盘边的笸箩" },

  // blk12_7 OneEntry（挨过炮）：农具顺墙撂着，簸箕立在旁边 —— 这家还在种城外那几亩地。
  { asset: "winnowingBasket", x: 64.32, z: -136.93, ry: 1.571,
    note: "blk12_7 窄院西墙根：靠墙立着的簸箕" },
  { asset: "phIronSpade", x: 64.84, z: -137.85, ry: 3.142,
    note: "blk12_7 窄院西墙根：顺墙撂下的铁锹" },
  { asset: "ryFarmHoe", x: 64.92, z: -135.63, ry: 3.142,
    note: "blk12_7 窄院西墙根：扔在墙根的锄头" },

  // blk11_6 AdobeYard（齐整）：摊开晾东西的笸箩与带盖竹篮。
  { asset: "phWickerTray", x: 2.49, z: -186.71, ry: 0.3,
    note: "blk11_6 土墙院正房檐下：晾东西的竹编浅筐" },
  { asset: "wovenBasket", x: 3.11, z: -186.48, ry: -0.4,
    note: "blk11_6 土墙院正房檐下：旁边的笸箩" },
  { asset: "phWickerBasketLidded", x: 1.93, z: -186.44, ry: 0.7,
    note: "blk11_6 土墙院正房檐下：带盖的竹篮" },

  // blk13_7 OneEntry（挨过炮、烧过）：火过之后，院里只剩石与陶。
  { asset: "stoneMillWheel", x: 121.78, z: -270.64, ry: -1.171,
    note: "blk13_7 烧过的一进院：火里没烧掉的石磨盘" },

  // blk13_6 LCourtyard（挨过炮、烧过）：火场里剩下的一口陶缸与掀落的墙石。
  { asset: "clayRoundVat", x: 53.17, z: -86.24, ry: 1.871,
    note: "blk13_6 烧过的 L 形院：火场里剩下的圆腹陶缸" },
  { asset: "stackableStone02", x: 53.38, z: -87.42, ry: 0.971, scale: 0.95,
    note: "blk13_6 烧过的 L 形院：掀下来的过墙石" },
  { asset: "stackableStone04", x: 53.2, z: -87.88, ry: 2.371, scale: 0.9,
    note: "blk13_6 烧过的 L 形院：滚开的第二块墙石" },

  // blk10_3 AdobeYard（齐整）：院心一张粗木桌配一条长凳。
  { asset: "phRoughWoodTable", x: 67.5, z: -269.57, ry: 0.1,
    note: "blk10_3 土墙院院心：院心树荫下的粗木桌" },
  { asset: "longBench", x: 67.54, z: -268.35, ry: -0.1,
    note: "blk10_3 土墙院院心：桌前的木条凳" },

  // blk10_5 AdobeYard（齐整）：院角一方平放的石磨盘。
  { asset: "stoneMillWheel", x: 20.94, z: -283.67, ry: -1.321,
    note: "blk10_5 土墙院东角：院角平放的石磨盘" },
  { asset: "wovenBasket", x: 20.88, z: -283.1, ry: -1.921,
    note: "blk10_5 土墙院东角：磨盘边的笸箩" },

  // blk10_4 OneEntry（齐整）：檐下一口接雨的水缸，斗笠搁在缸沿上。
  { asset: "clayWaterVat", x: 51.56, z: -234.74, ry: 0, scale: 1.05,
    note: "blk10_4 一进院正房檐下：正房檐下接雨的水缸" },
  { asset: "bambooHat", x: 51.71, z: -234.22, ry: 0.5,
    note: "blk10_4 一进院正房檐下：搁在缸边的斗笠" },
  { asset: "phWoodenBucket", x: 51.44, z: -234.29, ry: -0.4,
    note: "blk10_4 一进院正房檐下：打水的木桶" },

  // blk11_5 OneEntry（挨过炮）：墙根码着的柴垛。
  { asset: "ryFirewoodStack", x: 43.75, z: -267.67, ry: -1.571,
    note: "blk11_5 窄院东墙根：墙根码着的柴垛" },
  { asset: "phFirewoodBranches", x: 43.46, z: -266.61, ry: -1.171,
    note: "blk11_5 窄院东墙根：散在柴垛旁的柴枝" },

  // blk11_3 AdobeYard（挨过炮）：灶间外的墙根排着一溜腌菜的陶瓮。
  { asset: "clayRoundVat", x: 7.31, z: -218.33, ry: 0.2,
    note: "blk11_3 土墙院正房山墙下：灶间外墙根的圆腹陶缸" },
  { asset: "clayLiddedJar", x: 6.38, z: -221.54, ry: -0.3,
    note: "blk11_3 土墙院正房山墙下：并排的有盖陶坛（腌的咸菜）" },
  { asset: "clayWideJar", x: 8.54, z: -218.3, ry: 0.5,
    note: "blk11_3 土墙院正房山墙下：队尾的阔口陶坛" },

  // blk14_10 AdobeYard（挨过炮）：墙根的劈柴墩，斧子撂在墩上，柴已经码起来了。
  { asset: "ryChoppingBlock", x: 106.11, z: -16.38, ry: 1.771,
    note: "blk14_10 土墙院西墙根：墙根的劈柴墩" },
  { asset: "phWoodAxe", x: 106.35, z: -16.81, ry: 2.471,
    note: "blk14_10 土墙院西墙根：撂在墩边的木柄斧" },
  { asset: "ryFirewoodStack", x: 105.93, z: -15.47, ry: 1.571,
    note: "blk14_10 土墙院西墙根：码起来的柴垛" },

  // blk14_11 LCourtyard（挨过炮）：灶间外的墙根排着一溜腌菜的陶瓮。
  { asset: "clayRoundVat", x: 82.11, z: -14.85, ry: 0.2,
    note: "blk14_11 L 形院正房檐下：灶间外墙根的圆腹陶缸" },
  { asset: "clayLiddedJar", x: 82.06, z: -15.59, ry: -0.3,
    note: "blk14_11 L 形院正房檐下：并排的有盖陶坛（腌的咸菜）" },
  { asset: "clayWideJar", x: 82.1, z: -14.05, ry: 0.5,
    note: "blk14_11 L 形院正房檐下：队尾的阔口陶坛" },

  // blk14_5 OneEntry（挨过炮）：院里晒粮晾衣的木架，笸箩摊在架下。
  // 晾架转 90°：它是一片 0.195 m 厚的框架，脊向对着人就是一块立着的黑板
  // （实拍拿到过这一张）。改成东西向，从正房与院门两头看都是「两柱两横杆」。
  { asset: "ryDryingRack", x: 92.56, z: -184.11, ry: 1.571,
    note: "blk14_5 一进院院心：院里晒粮晾衣的木架，杆子东西向搭着" },
  { asset: "wovenBasket", x: 93.48, z: -183.23, ry: -0.3,
    note: "blk14_5 一进院院心：架下的笸箩" },
  { asset: "phWickerTray", x: 91.72, z: -183.39, ry: 0.6,
    note: "blk14_5 一进院院心：摊在架边的竹编浅筐" },

  // blk15_10 TwoEntry（挨过炮）：院角一方平放的石磨盘，簸箕靠着墙立。
  { asset: "stoneMillWheel", x: 124.9, z: -37.89, ry: 1.871,
    note: "blk15_10 两进院后院西角：院角平放的石磨盘" },
  { asset: "winnowingBasket", x: 124.52, z: -38.93, ry: 1.621,
    note: "blk15_10 两进院后院西角：靠墙立着的簸箕" },
  { asset: "wovenBasket", x: 124.98, z: -37.03, ry: 1.171,
    note: "blk15_10 两进院后院西角：磨盘边的笸箩" },

  // blk15_5 LCourtyard（挨过炮）：院心桌凳齐着 —— 三月天暖，这家人在院里吃饭。
  { asset: "phRoughWoodTable", x: 119.66, z: -182.48, ry: 0.12,
    note: "blk15_5 L 形院院心：院心树荫下的粗木桌" },
  { asset: "longBench", x: 119.72, z: -181.24, ry: -0.08,
    note: "blk15_5 L 形院院心：桌前的木条凳" },
  { asset: "phChineseWoodStool", x: 118.42, z: -181.96, ry: 0.5,
    note: "blk15_5 L 形院院心：拉到桌角的中式方凳" },
  { asset: "phLowWoodStool", x: 120.78, z: -181.9, ry: -0.6,
    note: "blk15_5 L 形院院心：孩子坐的那只小板凳" },

  // blk15_3 AdobeYard（挨过炮）：农具顺墙撂着，簸箕立在旁边 —— 这家还在种城外那几亩地。
  { asset: "winnowingBasket", x: 155.62, z: -221.53, ry: -1.691,
    note: "blk15_3 土墙窄院东墙根：靠墙立着的簸箕" },
  { asset: "phIronSpade", x: 154.99, z: -220.68, ry: -0.12,
    note: "blk15_3 土墙窄院东墙根：顺墙撂下的铁锹" },
  { asset: "ryFarmHoe", x: 155.18, z: -222.9, ry: -0.12,
    note: "blk15_3 土墙窄院东墙根：扔在墙根的锄头" },

  // blk16_5 AdobeYard（挨过炮）：檐下一口接雨的水缸，桶与盆搁在缸边。
  { asset: "clayWaterVat", x: 191.48, z: -188.74, ry: 0,
    note: "blk16_5 土墙院正房檐下：正房檐下接雨的水缸" },
  { asset: "ryWaterBucket", x: 191.9, z: -188.57, ry: 0.4,
    note: "blk16_5 土墙院正房檐下：缸边打水的木桶" },
  { asset: "phWoodenWashTub", x: 191.01, z: -188.61, ry: -0.3,
    note: "blk16_5 土墙院正房檐下：撂在缸旁的木盆" },

  // blk16_9 OneEntry（挨过炮）：门道边搁着的布灯笼与一只方凳。
  { asset: "clothLantern", x: 144.67, z: -79.84, ry: -2.942,
    note: "blk16_9 窄院门道里：门道边搁在地上的布灯笼" },
  { asset: "ryYardStool", x: 144.07, z: -79.53, ry: -3.442,
    note: "blk16_9 窄院门道里：门边的木方凳" },
  { asset: "bambooHat", x: 145.17, z: -79.53, ry: -2.542,
    note: "blk16_9 窄院门道里：撂在凳边的斗笠" },

  // blk16_10 WellYard（挨过炮、烧过）：井台边洗衣的木盆与两只水桶。
  { asset: "phWoodenWashTub", x: 167.85, z: -40.6, ry: 2.021, scale: 1.05,
    note: "blk16_10 烧过的井院：井台边洗衣的木盆" },
  { asset: "phWoodenBucket", x: 167.6, z: -41.23, ry: 1.321,
    note: "blk16_10 烧过的井院：打水的木桶" },
  { asset: "ryWaterBucket", x: 167.86, z: -41.19, ry: 2.621,
    note: "blk16_10 烧过的井院：另一只木水桶" },

  // blk17_5 TwoEntry（挨过炮）：院心桌凳齐着 —— 三月天暖，这家人在院里吃饭。
  { asset: "phRoughWoodTable", x: 179.86, z: -141.35, ry: 1.72,
    note: "blk17_5 两进院前院：院心树荫下的粗木桌" },
  { asset: "longBench", x: 181.1, z: -141.45, ry: 1.52,
    note: "blk17_5 两进院前院：桌前的木条凳" },
  { asset: "phChineseWoodStool", x: 180.42, z: -140.13, ry: 2.1,
    note: "blk17_5 两进院前院：拉到桌角的中式方凳" },
  { asset: "phLowWoodStool", x: 180.41, z: -142.49, ry: 1,
    note: "blk17_5 两进院前院：孩子坐的那只小板凳" },

  // blk17_9 OneEntry（挨过炮）：墙根的劈柴墩，斧子撂在墩上，柴还没码。
  { asset: "ryChoppingBlock", x: 191.55, z: -88.97, ry: 1.321,
    note: "blk17_9 窄院西墙根：墙根的劈柴墩" },
  { asset: "phWoodAxe", x: 191.97, z: -89.39, ry: 2.771,
    note: "blk17_9 窄院西墙根：撂在墩边的木柄斧" },
  { asset: "phFirewoodBranches", x: 191.69, z: -90.02, ry: 1.871,
    note: "blk17_9 窄院西墙根：还没码起来的柴枝" },

  // blk17_10 ShopRow（挨过炮）：灶间外的墙根排着一溜腌菜的陶瓮。
  { asset: "clayRoundVat", x: 191.59, z: -39.32, ry: 1.771,
    note: "blk17_10 铺面后院：灶间外墙根的圆腹陶缸" },
  { asset: "clayLiddedJar", x: 191.68, z: -40, ry: 1.271,
    note: "blk17_10 铺面后院：并排的有盖陶坛（腌的咸菜）" },
  { asset: "clayWideJar", x: 191.62, z: -40.61, ry: 2.071,
    note: "blk17_10 铺面后院：队尾的阔口陶坛" },

  // blk18_10 OneEntry（挨过炮）：院角一方平放的石磨盘，簸箕靠着墙立。
  { asset: "stoneMillWheel", x: 226.94, z: -38.84, ry: -1.151,
    note: "blk18_10 一进院东角：院角平放的石磨盘" },
  { asset: "winnowingBasket", x: 227.35, z: -38.03, ry: -1.401,
    note: "blk18_10 一进院东角：靠墙立着的簸箕" },
  { asset: "wovenBasket", x: 226.8, z: -39.52, ry: -1.851,
    note: "blk18_10 一进院东角：磨盘边的笸箩" },

  // blk18_6 OneEntry（挨过炮）：厢房廊下的一条长木凳。
  { asset: "ryYardBench", x: 215.01, z: -150.26, ry: 0.12,
    note: "blk18_6 一进院西厢廊下：廊下的长条木凳" },
  { asset: "phLowWoodStool", x: 214.19, z: -150.07, ry: -1.051,
    note: "blk18_6 一进院西厢廊下：凳边的小板凳" },
  { asset: "phWickerTray", x: 214.5, z: -151.09, ry: -1.951,
    note: "blk18_6 一进院西厢廊下：摊在地上的竹编浅筐" },

  // blk19_8 LCourtyard（挨过炮）：檐下一口接雨的水缸，斗笠搁在缸沿上。
  { asset: "clayWaterVat", x: 239.28, z: -45.95, ry: 0, scale: 1.05,
    note: "blk19_8 L 形院正房檐下：正房檐下接雨的水缸" },
  { asset: "bambooHat", x: 239.82, z: -45.67, ry: 0.5,
    note: "blk19_8 L 形院正房檐下：搁在缸边的斗笠" },
  { asset: "phWoodenBucket", x: 238.7, z: -45.74, ry: -0.4,
    note: "blk19_8 L 形院正房檐下：打水的木桶" },

  // blk19_6 AdobeYard（挨过炮）：灶间外的墙根排着一溜腌菜的陶瓮 —— 四口，是户人多的人家。
  { asset: "clayRoundVat", x: 249.4, z: -144.58, ry: 0.15,
    note: "blk19_6 土墙院灶间外：灶间外墙根的圆腹陶缸" },
  { asset: "clayLiddedJar", x: 250.01, z: -144.76, ry: -0.35,
    note: "blk19_6 土墙院灶间外：并排的有盖陶坛（腌的咸菜）" },
  { asset: "clayWideJar", x: 250.71, z: -144.61, ry: 0.45,
    note: "blk19_6 土墙院灶间外：第三口阔口陶坛" },
  { asset: "clayLuggedJar", x: 250.97, z: -144.83, ry: -0.2,
    note: "blk19_6 土墙院灶间外：队尾的带耳陶罐" },

  // blk20_8 TwoEntry（挨过炮）：炮震歪的陶罐与滚了一地的墙石。
  { asset: "clayLuggedJar", x: 232.92, z: -92.75, ry: -0.221,
    note: "blk20_8 两进院后院（挨过炮）：震歪的带耳陶罐" },
  { asset: "stackableStone03", x: 232.84, z: -91.95, ry: -2.221, scale: 0.95,
    note: "blk20_8 两进院后院（挨过炮）：从院墙上掀下来的墙石" },
  { asset: "wovenBasket", x: 232.53, z: -93.37, ry: 0.079,
    note: "blk20_8 两进院后院（挨过炮）：滚到一边的笸箩" },

  // blk20_7 LCourtyard（挨过炮）：墙根的劈柴墩，斧子撂在墩上，柴已经码起来了。
  { asset: "ryChoppingBlock", x: 278.57, z: -93.07, ry: -1.371,
    note: "blk20_7 L 形院东墙根：墙根的劈柴墩" },
  { asset: "phWoodAxe", x: 278.36, z: -92.68, ry: -0.671,
    note: "blk20_7 L 形院东墙根：撂在墩边的木柄斧" },
  { asset: "ryFirewoodStack", x: 278.74, z: -93.9, ry: -1.571,
    note: "blk20_7 L 形院东墙根：码起来的柴垛" },

  // blk20_1 AdobeYard（塌到底、烧过）：塌到底的院子，剩一方磨盘、几块碎石。
  { asset: "stoneMillWheel", x: 265.59, z: -277.53, ry: -1.021,
    note: "blk20_1 北关塌到底的土墙院：塌到底的院子里只剩这方石磨盘" },
  { asset: "stackableStone06", x: 265.52, z: -276.5, ry: -2.271,
    note: "blk20_1 北关塌到底的土墙院：半截碎墙石" },
  { asset: "clayLiddedJar", x: 265.45, z: -278.38, ry: -1.171,
    note: "blk20_1 北关塌到底的土墙院：埋在土里的有盖陶坛" },

  // blk19_11 AdobeYard（挨过炮）：墙根码着的柴垛。
  { asset: "ryFirewoodStack", x: 254.59, z: -229.06, ry: 1.451,
    note: "blk19_11 东城根窄院西墙根：墙根码着的柴垛" },
  { asset: "phFirewoodBranches", x: 255, z: -230.08, ry: 1.851,
    note: "blk19_11 东城根窄院西墙根：散在柴垛旁的柴枝" },

  // blk16_8 AdobeYard（挨过炮）：整整一大垛劈好的柴顺着西院墙码到底 ——
  // 全片区只有这一垛这么大，是「烧柴烧得起」的那一户。
  { asset: "firewoodPile", x: 227.04, z: -228.39, ry: 1.571, scale: 0.95,
    note: "blk16_8 土墙院西墙根：顺墙码到底的一大垛劈柴" },

  // ========================================================================
  // 【东门里街—东城根读图补强】
  //
  // 历史图上这半城不是把院子均匀排到城墙就结束：十字街以东先是东门大街
  // 的连排门脸，经过县衙／监狱一带转成有后院、有夹巷的公署边住区，最后才是
  // 紧贴东城根、炮火最重的一串小院。房、院墙、门洞和巷道已经由 CityBlockKit
  // 与地标构建器负责；这里用卸下的门板、货物、车具和烧后遗物把三段的用途和
  // 损毁梯度钉在俯拍可读的位置。所有点按各 LOD 碰撞盒留了 0.20 m 以上空隙，
  // 也不占东门大街路心或各公署保留区。
  // ========================================================================

  // blk16_11 ShopRow：东门大街北侧的后院货场。门板与油坛让连排铺面的
  // 「前店后院」在屋脊上方也能读出来，和路肩上的恒源酱园相接。
  { asset: "shopPlaque", x: 182.36, z: -40.12, ry: 1.58,
    note: "blk16_11 东门大街北侧铺面后院：卸下的门板靠着库房墙，铺子已上板" },
  { asset: "wineJarCluster", x: 181.27, z: -41.35, ry: -0.22,
    note: "blk16_11 东门大街北侧铺面后院：酱园暂存的一簇酒坛，贴着后院矮墙" },

  // blk17_11 AdobeYard：从商铺过到公署边巷住区的一户修车人家。
  // 一只竖轮加一垛木料，俯看能把这条向北折的服务巷从普通院落里挑出来。
  { asset: "ryCartWheel", x: 206.17, z: -34.21, ry: 1.46,
    note: "blk17_11 公署边土墙小院：斜靠西墙的备用车轮，东门运货车刚拆下" },
  { asset: "ryTimberStack", x: 204.48, z: -32.47, ry: 0.08,
    note: "blk17_11 公署边土墙小院：车轮旁平码的修车木料，巷子通向北侧公署" },

  // blk18_9 ShopRow：东门大街最后一段的临街后场。不要再往路心加件；
  // 把两只散货箱退进院门内，使东行货运痕迹在门前连续、通路仍净空。
  { asset: "marketCrate02", x: 205.42, z: -88.16, ry: 1.34,
    note: "blk18_9 东门大街路北连排后场：退在院门内的浅货箱，不压街心" },
  { asset: "marketBox03", x: 206.73, z: -88.22, ry: -0.28, scale: 0.92,
    note: "blk18_9 东门大街路北连排后场：同批待装的大货箱，朝东门方向平码" },

  // blk19_10 AdobeYard（烧过）：东门前最后一排院墙背后，完整家什已经没有了。
  // 低矮砖瓦与石块顺墙拉开，和西段仍在营业的铺面形成清晰损毁渐变。
  { asset: "rubble", x: 243.12, z: -34.18, ry: 0.42, scale: 0.72,
    note: "blk19_10 东门前烧过的土墙院：贴东墙散开的一摊焦砖瓦" },
  { asset: "stackableStone01", x: 244.62, z: -34.18, ry: -0.52,
    note: "blk19_10 东门前烧过的土墙院：从矮墙上崩下、滚到瓦砾旁的墙石" },

  // blk20_10 AdobeYard（烧过）：城根夹道的第二处塌陷点。把遗物贴在东墙
  // 内侧，既不堵夹巷，也让墙脚的破坏从高处有一条可追踪的深色带。
  { asset: "rubble", x: 264.18, z: -43.06, ry: -0.34, scale: 0.72,
    note: "blk20_10 东城根烧过的小院：夹道东侧的一摊塌砖，留出巷口" },
  { asset: "clayLiddedJar", x: 264.65, z: -45.06, ry: 0.31,
    note: "blk20_10 东城根烧过的小院：埋在砖里的有盖陶坛，火后只剩这一件家什" },

  // blk19_4 / blk20_4：看守所东侧到警备队南侧的公署边缘。
  // 不碰公署保留区；用修车痕迹和一盏摘下的风灯标出服务后巷，而不是伪造
  // 一个永久驻军院落（这些公署在战斗期才临时承担守备用途）。
  { asset: "ryCartWheel", x: 259.28, z: -184.15, ry: 1.48,
    note: "blk19_4 看守所东侧服务巷院：靠墙立的车轮，给公署与东门间跑运送" },
  { asset: "phWoodLantern", x: 261.16, z: -184.06, ry: -0.12,
    note: "blk20_4 警备队南侧城根院：摘下搁在墙脚的木框风灯，夜里巷道才用" },
]);
