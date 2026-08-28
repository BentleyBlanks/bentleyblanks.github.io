// 滕县城「场景采样点」表 —— 纯数据，**不许 import three**（出图脚本在 node 下要 import 它）。
//
// ## 这张表是干什么的
// 城一直在改：材质换一版、后期改一档、布设加一批家什。改完「好看了没有」
// 靠回忆是判不出来的 —— 每次随手拍的机位都不一样，两张图之间的差别里
// 混着机位差、时间差、天光差，看不出哪一份是自己这次改出来的。
//
// 所以这张表把机位钉死：**同一批点位、同一套参数、隔一段时间再拍一次**，
// 两次的图逐张对位就是这段时间里场景样式的真实变化。这是基线，不是花絮。
//
// ## 纪律
// 1. **点位一旦入表就不许随手挪**。挪了之后与历史那一批就不可比了。
//    确实要挪（比如街网重排把机位埋进了墙里）就改这里、在 note 里写明原因，
//    并且知道从这一版起该点与旧图断代。
// 2. 新增点位随时可以加 —— 加点只会让下一批多一张图，不破坏任何历史对位。
// 3. id 是文件名，**只许 ASCII**（`采样点编辑器` 导出时也按这条卡）。
// 4. 每个点必须落在自己那一片的 bounds 里，否则那一片根本不生成，
//    拍出来是一张空地。`Script_SamplePoints.ValidatePoints` 会卡。
//
// ## phase 认两种值（2026-08-29）
//   `"overview"`  全城俯瞰切片（Data_Menu.OVERVIEW_PHASE / Data_Battle.OVERVIEW_BOUNDS）。
//                 URL 是 `?phase=overview`。**本表八成的点位都在这一片上**：
//                 城、四门、主次街、城内院落、东关、西关一次全建，天光钉死 smokyDay。
//   0—6           七章的序号，URL 是 `?phase=3`。只有「关卡时段对照」那一组用它 ——
//                 那一组要的就是各章自己的天光。
//
// 为什么不把城里的机位摊回七章：任务流程重制之后没有哪一章会建整座城，摊回去
// 就成了「一批图拆成四次建城、四种天光」，两批之间不再可比，而可比正是本表的全部意义。
//
// ## 位姿口径（与 Script_ShotTest / Script_DressingShot 一致）
//   x / z    世界坐标，X 东、Z 南，城心为原点
//   h        相机离**地面**的高度（米）。默认 1.7 = 站着的人眼
//   y        绝对高度（米）。写了 y 就不查地高 —— 城墙顶、空中俯瞰用这个
//   yaw      弧度。0 朝北(-Z)、π/2 朝西(-X)、π 朝南(+Z)、-π/2 朝东(+X)
//   aim      [x, z]：写了就按「站在这里看那里」算 yaw，比手写弧度好读
//   pitch    弧度，**正数是抬头**（仰视城楼用 +0.2 这一档）
//   fov      可选，默认跟随游戏（55）
//   far      可选，默认跟随本关；俯瞰要拉到 1600 以上才看得见对面那道墙
//   sky      可选，覆盖本片天光预设。俯瞰切片自己就是 smokyDay，所以现在只有
//            「关卡时段对照」那一组可能用得着 —— 而那一组要的恰恰是各章原本的天光，
//            所以整表现在一条 sky 覆盖都没有。哪天有人把某一章的点位摊进来，
//            夜章（CH4）里的建筑还是得覆盖成白天，否则图上只有黑色轮廓
//   outsideBounds
//            机位站在本片切片外面往回看城（只有空中机位用得着）。
//            默认不许 —— 地面机位站在切片外就是站在一块没生成的空地上
//
// 点位坐标的来源：城内地标/院落用 `_import/TownDressingCells.json`（PlanBlocks
// 的最终结果）反选出「站得下人、看得见它」的空位；街道点一律压街心；
// 少数几个（监狱甬道、师部门脸、天主堂钟塔）直接沿用 Script_ShotTest 里
// 已经人工验收过的机位，不另起炉灶。

/** 分组顺序 = 记录文档里的章节顺序。 */
export const SAMPLE_GROUPS = [
  { id: "Gate", label: "城门" },
  { id: "Wall", label: "城墙与护城河" },
  { id: "MainStreet", label: "主街骨架" },
  { id: "SideStreet", label: "次街与巷" },
  { id: "Landmark", label: "城内地标与院落" },
  { id: "EastSuburb", label: "东关" },
  { id: "WestSuburb", label: "西关" },
  { id: "NorthSuburb", label: "北关" },
  { id: "Aerial", label: "俯瞰" },
  { id: "LevelLook", label: "关卡时段对照" },
];

/** 默认人眼高度（米）。改这个数会让全表的地面机位一起动，慎改。 */
export const EYE_HEIGHT = 1.7;

export const SAMPLE_POINTS = [
  // =========================================================================
  // 城门 —— 四门各拍内外两张。城门是这座城最强的读图信号（半圆瓮城 + 土袋堵门）
  // =========================================================================
  { id: "Gate_EastOuter", label: "东门·宗鲁门（濠外）", group: "Gate", phase: "overview",
    x: 352, z: -65, aim: [305, -65], pitch: 0.13,
    note: "濠外正对门轴仰看城楼；1938 年状态是土袋半堵。" },
  { id: "Gate_EastInner", label: "东门·宗鲁门（城里）", group: "Gate", phase: "overview",
    x: 272, z: -65, aim: [305, -65], pitch: 0.11,
    note: "东门大街东端回看内门与马道口。" },
  { id: "Gate_WestOuter", label: "西门·怀古门（濠外）", group: "Gate", phase: "overview",
    x: -352, z: 0, aim: [-305, 0], pitch: 0.13,
    note: "1938 年唯一的活口：土袋堵到只剩一人宽通道。" },
  { id: "Gate_WestInner", label: "西门·怀古门（城里）", group: "Gate", phase: "overview",
    x: -272, z: 0, aim: [-305, 0], pitch: 0.11,
    note: "西门里；与十字街口共用 z=0 那条通视走廊。" },
  { id: "Gate_SouthOuter", label: "南门·迎薰门（濠外）", group: "Gate", phase: "overview",
    x: 70, z: 352, aim: [70, 305], pitch: 0.13,
    note: "南门土袋堵死，门前只剩瓮城半圆。" },
  { id: "Gate_SouthInner", label: "南门·迎薰门（城里）", group: "Gate", phase: "overview",
    x: 70, z: 272, aim: [70, 305], pitch: 0.11,
    note: "南门里大街南端。" },
  { id: "Gate_NorthOuter", label: "北门·望阙门（濠外）", group: "Gate", phase: "overview",
    x: -145, z: -352, aim: [-145, -305], pitch: 0.13,
    note: "突围当夜被守军扒开的那一座。" },
  { id: "Gate_NorthInner", label: "北门·望阙门（城里）", group: "Gate", phase: "overview",
    x: -145, z: -272, aim: [-145, -305], pitch: 0.11,
    note: "北门里；L6 突围的出口。" },

  // =========================================================================
  // 城墙与护城河 —— 墙身包砖、垛口、角楼、上城道、缺口断面、濠水
  // =========================================================================
  { id: "Wall_EastTop", label: "东墙墙顶（南望）", group: "Wall", phase: "overview",
    x: 305, z: -120, y: 13.2, yaw: Math.PI, pitch: -0.08,
    note: "墙顶净宽 5 m：一列纵队的战斗空间。y 是绝对高度（墙不算地面）。" },
  { id: "Wall_EastRamp", label: "东门旁上城道", group: "Wall", phase: "overview",
    x: 285, z: -62, aim: [299, -95], pitch: 0.06,
    note: "全城只有四条上城道，都在城门内侧旁边。" },
  { id: "Wall_EastOuterFace", label: "东墙外墙身近景", group: "Wall", phase: "overview",
    x: 364, z: 198, yaw: Math.PI / 2, pitch: 0.19,
    note: "沿用 ShotTest Z7 的人工验收机位：包砖修补、泄水孔、垛口压顶。" },
  { id: "Wall_EastBreach", label: "东墙炮击缺口（城内一侧）", group: "Wall", phase: "overview",
    x: 282, z: -70, yaw: -Math.PI / 2, pitch: 0.02,
    note: "缺口后的街与掩体：夯土芯断面是砖包夯土最强的读图信号。" },
  { id: "Wall_SouthBreach", label: "南墙缺口（城内一侧）", group: "Wall", phase: "overview",
    x: 285, z: 276, yaw: Math.PI, pitch: 0.05,
    note: "L4 最后一处防区。" },
  { id: "Wall_CornerTowerSE", label: "东南角望楼（濠外）", group: "Wall", phase: "overview",
    x: 352, z: 352, aim: [305, 305], pitch: 0.15,
    note: "日方点名的那一座；角楼屋面是最容易退化成交叉板的地方。" },
  { id: "Wall_MoatEast", label: "东濠水面", group: "Wall", phase: "overview",
    x: 314, z: 165, yaw: -0.73, pitch: -0.46,
    note: "沿用 ShotTest Z16：近岸、深水与城墙倒映必须同框。" },

  // =========================================================================
  // 主街骨架 —— 十字街口 + 四条门里街。街是城的骨头，先看骨头对不对
  // =========================================================================
  { id: "Street_Crossroad", label: "十字街口（西望通视走廊）", group: "MainStreet", phase: "overview",
    x: 0, z: 0, yaw: Math.PI / 2, pitch: -0.02,
    note: "西城门楼→西门大街→十字街口这条走廊是硬约束，任何几何都不许挡。" },
  { id: "Street_CrossroadEast", label: "十字街口（东望）", group: "MainStreet", phase: "overview",
    x: 0, z: 0, yaw: -Math.PI / 2, pitch: -0.02,
    note: "同一机位反向：一次看清十字口四个街角的铺面。" },
  { id: "Street_WestGate", label: "西门大街", group: "MainStreet", phase: "overview",
    x: -160, z: 0, yaw: Math.PI / 2, pitch: -0.02,
    note: "街心西望怀古门。" },
  { id: "Street_EastGate", label: "东门大街", group: "MainStreet", phase: "overview",
    x: 180, z: -65, yaw: -Math.PI / 2, pitch: -0.02,
    note: "街心东望宗鲁门。" },
  { id: "Street_CentralEast", label: "十字街东段", group: "MainStreet", phase: "overview",
    x: 62, z: 0, yaw: Math.PI / 2, pitch: -0.08,
    note: "沿用 ShotTest Z4 的生活层机位：路肩家什、车辙、院落细节。" },
  { id: "Street_NorthGate", label: "北门大街", group: "MainStreet", phase: "overview",
    x: -145, z: -220, yaw: 0, pitch: -0.02,
    note: "街心北望望阙门。" },
  { id: "Street_CentralNorth", label: "北门大街南段", group: "MainStreet", phase: "overview",
    x: 0, z: -72, yaw: 0, pitch: -0.02,
    note: "十字口往北的一段。" },
  { id: "Street_SouthGate", label: "南门里大街", group: "MainStreet", phase: "overview",
    x: 70, z: 180, yaw: Math.PI, pitch: -0.02,
    note: "街心南望迎薰门。" },
  { id: "Street_CentralSouth", label: "南门里大街北段", group: "MainStreet", phase: "overview",
    x: 0, z: 33, yaw: Math.PI, pitch: -0.02,
    note: "十字口往南的一段，人民书店在西路肩。" },
  { id: "Street_YamenFront", label: "县署前街", group: "MainStreet", phase: "overview",
    x: 52, z: -30, yaw: 0, pitch: -0.02,
    note: "东门大街与十字街之间那条南北向连街。" },
  { id: "Street_SouthGateLink", label: "南门里大街转折", group: "MainStreet", phase: "overview",
    x: 35, z: 66, yaw: -Math.PI / 2, pitch: -0.02,
    note: "南门里大街不是一条直线：在 z=66 处折向东，再南下出迎薰门。" },

  // =========================================================================
  // 次街与巷 —— 照城防示意图排的那一层；巷道不铺车辙、不摆街肩生活层
  // =========================================================================
  { id: "Street_Longwang", label: "龙王庙街", group: "SideStreet", phase: "overview",
    x: 0, z: -145, yaw: -Math.PI / 2, pitch: 0.02, note: "北城东西向主次街。" },
  { id: "Street_Houmen", label: "后门大街", group: "SideStreet", phase: "overview",
    x: -75, z: -205, yaw: 0, pitch: -0.02, note: "文庙与第727团1营夹着的一段。" },
  { id: "Street_Shunxing", label: "顺兴街", group: "SideStreet", phase: "overview",
    x: -185, z: 20, yaw: Math.PI, pitch: -0.02, note: "西城南北向次街。" },
  { id: "Street_DangdianBack", label: "当典后街", group: "SideStreet", phase: "overview",
    x: -60, z: -90, yaw: Math.PI / 2, pitch: -0.02, note: "当典与商会之间那条横街。" },
  { id: "Street_DangdianEast", label: "当典东街", group: "SideStreet", phase: "overview",
    x: -20, z: 90, yaw: Math.PI / 2, pitch: -0.02, note: "南城横街。" },
  { id: "Street_Guanyue", label: "关岳庙街", group: "SideStreet", phase: "overview",
    x: 150, z: 30, yaw: 0, pitch: -0.02, note: "东城南北向次街，第二区公所门朝这条街。" },
  { id: "Street_Kuiwen", label: "奎文街", group: "SideStreet", phase: "overview",
    x: 118, z: 150, yaw: 0, pitch: -0.02, note: "南城次街。" },
  { id: "Street_KuiwenEast", label: "奎文东街", group: "SideStreet", phase: "overview",
    x: 192, z: 140, yaw: 0, pitch: -0.02, note: "南城东侧次街。" },
  { id: "Street_FireGodEast", label: "火神庙东街", group: "SideStreet", phase: "overview",
    x: 20, z: 210, yaw: -Math.PI / 2, pitch: -0.02, note: "南城最长的横街，两所学校与天主堂都在这条街上。" },
  { id: "Street_MiaojiaHutong", label: "苗家胡同", group: "SideStreet", phase: "overview",
    x: -206, z: -255, yaw: -Math.PI / 2, pitch: -0.02,
    note: "全城唯一一条入表的巷道（净宽 2 m）：巷子的尺度感与街不是一回事。" },

  // =========================================================================
  // 城内地标与院落 —— 「关键建筑都要有点位」的主体
  // =========================================================================
  { id: "Lm_Yamen", label: "县衙", group: "Landmark", phase: "overview",
    x: 161.2, z: -84.8, aim: [128, -118], pitch: 0.01,
    note: "城内唯一有实物可参照的建筑（旧县衙大堂尚存）。东南侧三向。" },
  { id: "Lm_ConfucianTemple", label: "文庙", group: "Landmark", phase: "overview",
    x: -64, z: -230, aim: [-100, -230], pitch: 0.02 },
  { id: "Lm_DragonKingTemple", label: "龙王庙", group: "Landmark", phase: "overview",
    x: 76.8, z: -144.5, aim: [52, -172], pitch: 0.05,
    note: "红门脸 + 起翘屋脊是庙的识别语言。" },
  { id: "Lm_CommerceGuild", label: "商会", group: "Landmark", phase: "overview",
    x: 11.3, z: -88, aim: [34, -116], pitch: 0.02 },
  { id: "Lm_PawnShop", label: "当典", group: "Landmark", phase: "overview",
    x: -113.9, z: -91.5, aim: [-136, -116], pitch: 0.02 },
  { id: "Lm_RegimentHQ", label: "团部", group: "Landmark", phase: "overview",
    x: -18.9, z: -146.6, aim: [-38, -176], pitch: 0.02 },
  { id: "Lm_DivisionHQ124", label: "第124师师部", group: "Landmark", phase: "overview",
    x: -38, z: -90.5, yaw: Math.PI / 2, pitch: -0.02,
    note: "沿用 ShotTest Z11：门楼 + 番号木牌 + 沙袋哨位 + 旗。" },
  { id: "Lm_DivisionHQ127", label: "第127师师部", group: "Landmark", phase: "overview",
    x: -17.4, z: 87.5, aim: [-72, 56], pitch: 0.02 },
  { id: "Lm_CountyJail", label: "监狱", group: "Landmark", phase: "overview",
    x: 162, z: -196.7, yaw: -1.55, pitch: 0.02,
    note: "沿用 ShotTest Z13：两排牢房之间的甬道，一侧全是铁窗、一侧一个洞都没有。" },
  // 下面几处院落被街坊围死，街上任何角度都是一脸墙 —— 只能抬到檐口之上斜看。
  // 「拍不到」不是可以接受的记录：抬高是唯一能把这座建筑收进画面的办法。
  { id: "Lm_CountyPrison", label: "看守所", group: "Landmark", phase: "overview",
    x: 224, z: -147, y: 20, aim: [224, -192], pitch: -0.42,
    note: "北城羁押区被民居围死，机位抬到 20 m 斜看院内。" },
  { id: "Lm_GarrisonHQ", label: "警备队", group: "Landmark", phase: "overview",
    x: 150, z: -205, y: 20, aim: [150, -250], pitch: -0.42,
    note: "同上：檐口之上斜看。" },
  { id: "Lm_PoliceStation", label: "警察所", group: "Landmark", phase: "overview",
    x: 104, z: -172, y: 20, aim: [104, -216], pitch: -0.43,
    note: "同上：檐口之上斜看。" },
  { id: "Lm_CatholicChurch", label: "天主堂（城内）", group: "Landmark", phase: "overview",
    x: 36, z: 210, yaw: Math.PI, pitch: 0.06,
    note: "沿用 ShotTest Z14：南城唯一高点，钟塔必须入画。" },
  { id: "Lm_WenzhongSchool", label: "滕文中学旧址", group: "Landmark", phase: "overview",
    x: -138.1, z: 209.8, aim: [-186, 220], pitch: 0.02 },
  { id: "Lm_ShuyuanSchool", label: "书院小学", group: "Landmark", phase: "overview",
    x: -105, z: 212, aim: [-105, 238], pitch: 0.02,
    note: "校门朝北对着火神庙东街。" },
  { id: "Lm_FireGodTemple", label: "火神庙", group: "Landmark", phase: "overview",
    x: 168.8, z: 207.6, aim: [148, 182], pitch: 0.04,
    note: "火神庙东街的名字来源。" },
  { id: "Lm_EastDistrictOffice", label: "第二区公所", group: "Landmark", phase: "overview",
    x: 218, z: 75, y: 22, aim: [218, 12], pitch: -0.34,
    note: "门朝西对着关岳庙街；50×74 的大院四面被民居贴死，抬到 22 m 才收得进来。" },
  { id: "Lm_SquareFort", label: "北门里方形炮台", group: "Landmark", phase: "overview",
    x: -143.3, z: -223, aim: [-145, -255], pitch: 0.06 },
  { id: "Lm_WangShrine", label: "王家祠堂", group: "Landmark", phase: "overview",
    x: -267, z: 4.5, aim: [-250, 28], pitch: 0.02 },
  { id: "Lm_AlarmTower", label: "警钟楼", group: "Landmark", phase: "overview",
    x: -190, z: 0, aim: [-205, -12], pitch: 0.18,
    note: "高 9 m，西门大街上的竖向地标 —— pitch 必须抬起来才拍得到顶。" },
  // 站在牌坊**东侧**往西看：牌坊在 x=-120，机位再往西就把它甩到背后了。
  { id: "Lm_LongPaifang", label: "跨街牌坊", group: "Landmark", phase: "overview",
    x: -88, z: 0, yaw: Math.PI / 2, pitch: 0.05,
    note: "明间净宽 4 m 正好让开 z=0 的通视轴线：柱子站在街两侧。" },
  { id: "Lm_IronPaifang", label: "铁牌坊", group: "Landmark", phase: "overview",
    x: -145, z: -190, yaw: 0, pitch: 0.05, note: "坐东朝西。" },
  { id: "Lm_PeoplesBookshop", label: "人民书店旧址", group: "Landmark", phase: "overview",
    x: 0, z: 52, aim: [-9.8, 40], pitch: 0.02,
    note: "1931 年中共滕县特支驻地，南门里大街北段西路肩。" },
  { id: "Lm_NorthWestCourtyard", label: "苗家胡同院落", group: "Landmark", phase: "overview",
    x: -205, z: -112, y: 20, aim: [-205, -166], pitch: -0.36,
    note: "西北片区最大的一处院落，四周被民居围死；抬到 20 m 才看得见院子本身。" },
  { id: "Lm_NorthCompound727", label: "第727团1营", group: "Landmark", phase: "overview",
    x: -73.3, z: -232.7, aim: [-20, -250], pitch: 0.02 },
  { id: "Lm_WestSpecialCompound", label: "特务营第1连", group: "Landmark", phase: "overview",
    x: -183.1, z: -28.7, aim: [-225, -50], pitch: 0.02 },
  { id: "Lm_SouthWestOffice", label: "办事处", group: "Landmark", phase: "overview",
    x: -162.3, z: 91.6, aim: [-140, 126], pitch: 0.02 },
  { id: "Lm_SouthEastSpecial", label: "特务营第2连", group: "Landmark", phase: "overview",
    x: 142, z: 212, aim: [142, 247], pitch: 0.02 },

  // =========================================================================
  // 东关 —— 本战真正的主战场。与城同在俯瞰切片里（关厢巷网整片生成）
  // =========================================================================
  { id: "East_Street", label: "东关大街", group: "EastSuburb", phase: "overview",
    x: 432, z: -65, yaw: -Math.PI / 2, pitch: -0.02,
    note: "关厢的骨架：一条东西向大车道，两侧是可以被打穿的院落迷宫。" },
  { id: "East_ZhaiGate", label: "东寨门", group: "EastSuburb", phase: "overview",
    x: 505, z: -65, yaw: -Math.PI / 2, pitch: 0.05,
    note: "寨墙高 2 m、顶宽 0.4 m，一炮一个口；砖券洞宽 3 m。" },
  { id: "East_Temple", label: "寺院地", group: "EastSuburb", phase: "overview",
    x: 414, z: -133, y: 18, aim: [414, -176], pitch: -0.4,
    note: "日方称之为「敌之有力据点」。关厢是密不透风的院落迷宫，地面机位一律一脸墙，"
      + "所以抬到 18 m 斜看；地面视角见「关卡时段对照 · 东关巷道」。" },
  { id: "East_Courtyard", label: "关厢院落", group: "EastSuburb", phase: "overview",
    x: 462, z: 28, y: 17, yaw: 0, pitch: -0.3,
    note: "家家有枪眼的院落迷宫。东关大街净宽只有两三米，站在街上朝北就是三米外一堵墙；"
      + "这一片的空间关系只有抬到檐口之上才看得出来。" },
  { id: "East_FirstDistrict", label: "第一区公所", group: "EastSuburb", phase: "overview",
    x: 400, z: -28, aim: [366, -28], pitch: 0.02 },
  { id: "East_Battalion731", label: "第731团1营", group: "EastSuburb", phase: "overview",
    x: 458, z: -72, aim: [458, -108], pitch: 0.02 },

  // =========================================================================
  // 西关 —— 俯瞰切片的西界（minX -520）就是为了收全这一片：最西一件在 x=-502.6。
  // 原来挂在 phase 1 上并整组覆盖成白天，现在切片自己就是 smokyDay，覆盖已摘掉
  // =========================================================================
  { id: "West_Street", label: "西关大街", group: "WestSuburb", phase: "overview",
    x: -400, z: 0, yaw: Math.PI / 2, pitch: -0.02,
    note: "西门吊桥外接铁路方向的城外土路。" },
  { id: "West_Station", label: "滕县车站", group: "WestSuburb", phase: "overview",
    x: -458, z: -36, aim: [-458, -82], pitch: 0.03,
    note: "1911 年德国承建的津浦路北段三等小站：清水砖墙、石质窗套、陡坡瓦屋面。" },
  { id: "West_PowerPlant", label: "电灯厂", group: "WestSuburb", phase: "overview",
    x: -410, z: 20, aim: [-410, 69], pitch: 0.12,
    note: "22 m 的烟囱是西关天际线上的关键剪影，pitch 要抬到能收进烟囱顶。" },
  { id: "West_Communications", label: "通信队", group: "WestSuburb", phase: "overview",
    x: -410.5, z: -4, aim: [-410.5, -85], pitch: 0.06 },
  { id: "West_Division122", label: "第122师师部（西关）", group: "WestSuburb", phase: "overview",
    x: -366, z: -4, aim: [-366, -85], pitch: 0.06,
    note: "坐北朝南开门对着西关大街。" },
  { id: "West_Exchange", label: "交易所", group: "WestSuburb", phase: "overview",
    x: -410, z: 96, aim: [-410, 132], pitch: 0.04 },

  // =========================================================================
  // 北关 —— **只剩一张**（2026-08-29）
  //
  // 北关那一片（z ≲ -360）现在没有任何切片会建：北门突围那一关随任务流程重制
  // 取消了，而全城俯瞰的北界是 OVERVIEW_BOUNDS.minZ = -360，只越过北墙一点点。
  // 这与 Script_TownDressingTest.ORPHANED_OUTFIELD_PACKS 里登记的
  // 「Data_Dressing_NorthSuburb 整包无承载章」是同一件事。
  //
  // 所以下面三个点位退表了 —— 它们拍出来会是一张空地，而空地不是基线。
  // **坐标原样留在这儿**：哪一章重新走到北关、或 OVERVIEW_BOUNDS 北扩之后，
  // 照抄回去就行，不必重新选点。
  //   North_Street       北关大街    x -145, z -420, yaw π,  pitch -0.02  出望阙门向北的土路，回望城墙
  //   North_StockadeGate 北关圩门    x -145, z -530, yaw 0,  pitch  0.04  坝墙（圩子）一线，高 2.2 m
  //   North_Temple       北关庙      x   60, z -486, aim [60,-520], pitch 0.02
  //
  // 弘道院留着：z=-340 还在俯瞰切片里。
  { id: "North_HongdaoAcademy", label: "弘道院（远景剪影）", group: "NorthSuburb", phase: "overview",
    x: -60, z: -340, aim: [-60, -420], pitch: 0.02,
    note: "教产一带只做剪影级远景，不做可进入空间 —— 这一张就是验剪影的。" },

  // =========================================================================
  // 俯瞰 —— 地面机位一辈子拍不到屋面。y 是绝对高度，far 必须拉开
  // =========================================================================
  // 俯角与 fov 是算出来的，不是试出来的：城南北跨 610 m，机位 (0, 430, 430)
  // 到南墙 125 m（仰角 74°）、到北墙 735 m（30°），44° 的竖向张角要 fov ≥ 50。
  // 取 62 留一点余量。**别把俯角调浅** —— 浅一档南墙就掉出画外。
  { id: "Air_WholeCity", label: "全城（自南向北）", group: "Aerial", phase: "overview",
    x: 0, y: 430, z: 430, yaw: 0, pitch: -0.9, fov: 62, far: 1800, outsideBounds: true,
    note: "一张图看四面墙、十字街与两片关厢的关系。北半城在雾里是这一关的实况，不是漏渲染。" },
  // 俯角 −52°：从 150 m 高俯看，画面里那条带覆盖 z 方向约 30—340 m
  //（近到脚下那排院子，远到城墙）。俯角再浅一档，半张图就全是雾里的地平线 ——
  // 屋面一张也看不清，那就不叫「屋面」采样点了。
  { id: "Air_NorthQuarter", label: "北城屋面", group: "Aerial", phase: "overview",
    x: 0, y: 150, z: -55, yaw: 0, pitch: -0.9, fov: 55, far: 1200,
    note: "验每座房的正脊是不是屋面最高处、瓦面压不压墙。" },
  { id: "Air_SouthQuarter", label: "南城屋面", group: "Aerial", phase: "overview",
    x: 0, y: 150, z: 55, yaw: Math.PI, pitch: -0.9, fov: 55, far: 1200 },
  { id: "Air_Crossroad", label: "十字街口俯瞰", group: "Aerial", phase: "overview",
    x: 0, y: 86, z: 96, yaw: Math.PI, pitch: -0.5, fov: 55, far: 900,
    note: "主次街尺度、院落不压路、功能区的体量差。" },
  { id: "Air_EastSuburb", label: "东关与东城墙", group: "Aerial", phase: "overview",
    x: 430, y: 180, z: 120, yaw: 0, pitch: -0.4, fov: 55, far: 1400,
    note: "外城的存在与环绕城墙的密集民房 —— 日方战后检讨里那句话的图。" },

  // =========================================================================
  // 关卡时段对照 —— 同一机位换一章。这一组不是重复：上面那八十张全在**同一片
  // 俯瞰切片、同一档 smokyDay** 下拍（那是样式基线的前提），而这三张记录的正是
  // 「同一片城在各章自己的天光/破损档下长什么样」。
  //
  // **id 换过一次（2026-08-29）**：旧 id 里的 L1/L3/L5/L6 是重制前的关号，
  // 而那几关连内容都换了（旧 L1 是北沙河夜战，新 CH1 是白天的南下路），
  // 拿旧名对位只会把两批不同的东西摆在一起看。逐条的新旧对照：
  //   Look_L5Crossroad → Look_CH6Crossroad（机位不动：62, 0）
  //   Look_L1WestGate  → Look_CH5WestGate （机位不动：-352, 0；夜版改成 dawn 版）
  //   Look_L3EastLane  → Look_CH4EastLane （机位不动：456.6, -128）
  //   Look_L6NorthGate → **退表**：北门那一关没有了，而北门里的白天版
  //                      Gate_NorthInner 已经有，夜版没有任何一章能提供。
  // 三处天光各不相同（burningStreet / dawn / night），合起来正好把七章用到的
  // 非白天档盖全 —— 白天档由上面那八十张负责。
  // =========================================================================
  { id: "Look_CH6Crossroad", label: "十字街东段（终·最后一封 burningStreet）", group: "LevelLook", phase: 6,
    x: 62, z: 0, yaw: Math.PI / 2, pitch: -0.08,
    note: "与 Street_CentralEast 同一机位；差的是章节天光与破损档。" },
  { id: "Look_CH5WestGate", label: "西门（五·城墙没有了 dawn）", group: "LevelLook", phase: 5,
    x: -352, z: 0, aim: [-305, 0], pitch: 0.13,
    note: "与 Gate_WestOuter 同一机位的拂晓版 —— 第五章的通视走廊就从这道门望进去。" },
  { id: "Look_CH4EastLane", label: "东关巷道（四·东关之夜 night）", group: "LevelLook", phase: 4,
    x: 456.6, z: -128, aim: [414, -176], pitch: 0.02,
    note: "夜袭章：全局唯一一次玩家在交换比上占便宜的时段。机位就是本章出生点。" },
];

export default SAMPLE_POINTS;
