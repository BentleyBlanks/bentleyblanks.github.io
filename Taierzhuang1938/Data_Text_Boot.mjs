// Data_Text_Boot.mjs — 开机加载画面（Script_Main 的 setStep / 开始按钮 / 预览终端）与
// 加载画面上那台道具展示台（Script_BootPropStage）的文案。
// 纯数据，不 import three。键前缀 `boot.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("boot.xxx", { name })。同一句话只登记一次，多处复用同一键。
export const TEXT = Object.freeze({
  // --- 加载步骤。**每一条对应 Boot() 里一次 setStep**，顺序与 Data_Tuning_Main.BOOT.progress 一致。
  "boot.step.bakeTextures": "烘贴图……",
  "boot.step.bakeTexturesProgress": "烘贴图 {done}/{total} · {name}",
  "boot.step.loadPbr": "加载 PBR 材质……",
  "boot.step.loadPbrProgress": "加载 PBR 材质 {done}/{total}",
  "boot.step.physics": "装物理引擎……",
  "boot.step.physicsWalls": "砌墙（物理）……",
  "boot.step.actors": "上刺刀……",
  "boot.step.actorsProgress": "上刺刀…… 模型 {loaded}/{requested}",
  "boot.step.ready": "就绪",
  // 进过场时那条独立的预热条（WarmupShaders 的四步）
  "boot.step.dressSet": "搭布景……",
  "boot.step.actorPool": "预建人物…… {done}/{total}",
  "boot.step.warmViewmodel": "预热第一人称…… {done}/{total}",
  "boot.step.warmLevel": "预热关卡……",
  "boot.step.submitShaders": "提交着色器…… {done}/{total}",
  "boot.step.linkShaders": "等待着色器就绪…… {done}/{total}",
  "boot.step.relightScene": "重编场景光照…… {done}/{total}",
  "boot.step.warmMaterials": "预热材质…… {done}/{total}",
  "boot.step.loadMeshes": "载入网格…… {done}/{total}",

  // --- 开始按钮。走哪一条由 URL 入口决定（见 Script_Main.BootStartLabel）。
  "boot.start.play": "进 城",
  "boot.start.shot": "（出图模式）",
  "boot.start.movementRange": "进入操作测试场",
  "boot.start.weaponRange": "进入枪械靶场",
  "boot.start.explosionRange": "进入爆炸测试场",
  "boot.start.preview": "播放序章",

  // --- 序章预览（?preview=CS_Chuchuan）的收尾终端 ---------------------------
  "boot.preview.title": "序章预览结束",
  "boot.preview.note": "等待《断线》接手 · 预览不会启动界河战斗",
  "boot.preview.handoff": "跟随通信排。",

  "boot.error.startFailed": "启动失败：{message}",

  // --- 加载画面上那件转着的道具（Script_BootPropStage.SHOWCASE） -------------
  // 键的后半段就是 Data_Meshes 里的模型 id，SHOWCASE 只存 id。
  "boot.showcase.HanYang": "汉阳造 八八式步枪",
  "boot.showcase.ZhongZheng": "中正式 步骑枪",
  "boot.showcase.Zb26": "ZB-26 轻机枪",
  "boot.showcase.Type38": "三八式 步枪",
  "boot.showcase.ServicePistol": "外购九毫米 军用手枪",
  "boot.showcase.Grenade": "木柄手榴弹",
  "boot.showcase.Dadao": "大刀",
  "boot.showcase.Type89Launcher": "八九式 重掷弹筒",
  "boot.showcase.Type95HaGo": "九五式 轻战车 Ha-Go",
  "boot.showcase.Type97ChiHa": "九七式 中战车 Chi-Ha",
  "boot.showcase.Type89Tank": "八九式 中战车",
  // 建城 / 城外原野的加载步骤（Script_TengxianCity / Script_TengxianOutfield 的 yield label，加载画面上显示）
  "boot.build.city.ground": "夯地：城内台地与濠外原野",
  "boot.build.city.moat": "挖濠：宽 10.5 深 4.8",
  "boot.build.city.wall": "筑城：墙身 11.5 米",
  "boot.build.city.bastions": "马面与角楼",
  "boot.build.city.gates": "开四门：半圆瓮城与城楼",
  "boot.build.city.ramps": "上城道（全城只有四条）",
  "boot.build.city.streets": "铺街：十字街口与四条门里街",
  "boot.build.city.landmarks": "县衙、警报楼、牌坊、天主堂",
  "boot.build.city.eastSuburb": "东关：家家有枪眼的院落迷宫",
  "boot.build.city.eastFields": "东关外：农田、坟地与独户农院",
  "boot.build.city.livedIn": "生活层：门前家什、店铺摊具与路面痕迹",
  "boot.build.city.outskirts": "城外：龙泉塔、荆河、西关",
  "boot.build.city.batch": "合批",
  "boot.build.city.ready": "就绪",
  "boot.build.city.houses": "盖房子 {done}/{total}",
  "boot.build.outfield.river": "城外：河道与河堤",
  "boot.build.outfield.berms": "城外：土坎与散兵胸墙",
  "boot.build.outfield.graves": "城外：坟头与光秃乔木",
  "boot.build.outfield.fields": "城外：麦田斑块与田埂",
  "boot.build.outfield.roads": "城外：大车路与津浦路路基",
  "boot.build.outfield.villages": "城外：村落轮廓",
  "boot.build.outfield.batch": "城外：合批",
});

/** 这张表覆盖的代码模块。Script_Main 由 Data_Text_Hud 登记（它同时用三张表的键）。 */
export const GATED_MODULES = Object.freeze([
  "Script_BootPropStage.mjs",
  "Script_BootProp.mjs",
  "Script_TengxianCity.mjs",
  "Script_TengxianOutfield.mjs",
]);

/** 展示品的名字按 Data_Meshes 的模型 id 拼键（Script_BootProp.ShowcaseName，主线程）。 */
export const DYNAMIC_PREFIXES = Object.freeze([
  "boot.showcase.",
]);
