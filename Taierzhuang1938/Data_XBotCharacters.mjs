// 能顶替 X Bot 播 Mixamo 动作库的人物（2026-11-03，日兵甲起）。都由 _import/Script_BuildXBotRigCharacter.mjs 转成跟
// Animation/Mixamo/Model_MixamoXBot.glb 同一副骨架：骨名、层级、每根骨头初始姿势下的世界朝向全一样，只有骨头位置（身材）是自己的。
// 用在动作预览工具（人物切换）和白盒（XBOT_FACTION_CHARACTERS：这个阵营的普通士兵换成这个人；XBOT_CAST_CHARACTERS：这个有名字的人换成这个人）。说明 docs/Data_EditorBlockout.md §18「日兵甲」。
//
// 动作库是 X Bot 的：每根骨都有位移轨（X Bot 的骨长），胯的位移是 X Bot 的胯高。别的身材照放会被拉成 X Bot 的骨长、脚离地，
// 所以 Script_XBotCharacters.mjs 的 ClipForCharacter 去掉 Hips 以外的位移轨、Hips 位移整条乘 hipsScale（胯高之比，转换脚本写在 Data_<名>.json）。
// groom：头发胡子（docs/Data_HairSystem.md §7），_import/Script_HairGroomBuild.mjs 按这个模型出、挂在 Head 骨下（帽子罩住的发根已剔掉）。

export const XBOT_CHARACTERS = Object.freeze({
  xbot: Object.freeze({ name: "X Bot", file: "./Animation/Mixamo/Model_MixamoXBot.glb", hipsScale: 1, ownMaterial: false }),
  // 日兵甲：Tripo 部件合并（角色\Tripo\14_日兵甲），用户在 Tripo 绑的骨；hipsScale 同 Model/Character/Data_JapaneseSoldierJia.json
  ijaJia: Object.freeze({ name: "日兵甲", file: "./Model/Character/Model_JapaneseSoldierJia.glb", hipsScale: 0.9074, ownMaterial: true,
    report: "./Model/Character/Data_JapaneseSoldierJia.json", groom: "./Hair/Grooms/Groom_Game_JapaneseSoldierJia.bin" }),
  // 何有田：Tripo 部件合并（角色\Tripo\05_何有田），用户在 Tripo 绑的骨，后颈接缝补过权重（_NeckFix）；hipsScale 同 Model/Character/Data_HeYoutian.json
  heYoutian: Object.freeze({ name: "何有田", file: "./Model/Character/Model_HeYoutian.glb", hipsScale: 0.9612, ownMaterial: true,
    report: "./Model/Character/Data_HeYoutian.json", groom: "./Hair/Grooms/Groom_Game_HeYoutian.bin" }),
  // 罗班长：Tripo 部件合并（角色\Tripo\02_罗班长，V13 补了袖子里的小臂），用户在 Tripo 绑的骨；hipsScale 同 Model/Character/Data_SquadLeaderLuo.json
  luo: Object.freeze({ name: "罗班长", file: "./Model/Character/Model_SquadLeaderLuo.glb", hipsScale: 0.8957, ownMaterial: true,
    report: "./Model/Character/Data_SquadLeaderLuo.json", groom: "./Hair/Grooms/Groom_Game_SquadLeaderLuo.bin" }),
  // 顺子 V5：保留原始头部，仅修帽箍/内侧布边；本地绑定使用共用骨架与权重，外观全部来自顺子。
  shunzi: Object.freeze({ name: "顺子", file: "./Model/Character/Model_Shunzi.glb", hipsScale: 0.9398, ownMaterial: true,
    report: "./Model/Character/Data_Shunzi.json", groom: "./Hair/Grooms/Groom_Game_Shunzi.bin" }),
  // 冬瓜 V3：保留帽壳和袖口修复，用户下载的绑骨模型转换为共用骨架。
  donggua: Object.freeze({ name: "冬瓜", file: "./Model/Character/Model_Donggua.glb", hipsScale: 0.8833, ownMaterial: true,
    report: "./Model/Character/Data_Donggua.json", groom: "./Hair/Grooms/Groom_Game_Donggua.bin" }),
  // 幺娃 V6：用户下载的完整绑骨件，保留修复后的颈部、手指和脚踝比例。
  yaowa: Object.freeze({ name: "幺娃", file: "./Model/Character/Model_Yaowa.glb", hipsScale: 0.8394, ownMaterial: true,
    report: "./Model/Character/Data_Yaowa.json", groom: "./Hair/Grooms/Groom_Game_Yaowa.bin",
    clipOverrides: Object.freeze({
      "Animation_Mixamo_ProneFiringRifle_V2.glb": "./Animation/Yaowa/Animation_Yaowa_ProneFiringRifle_V2.glb",
      "Animation_Mixamo_Dying_V3.glb": "./Animation/Yaowa/Animation_Yaowa_Dying_V3.glb",
    }) }),
  // 老耿 V10：用户下载的完整绑骨件，沿用修正后的领口、手腕和下肢外形。
  oldGeng: Object.freeze({ name: "老耿", file: "./Model/Character/Model_OldGeng.glb", hipsScale: 0.9478, ownMaterial: true,
    report: "./Model/Character/Data_OldGeng.json", groom: "./Hair/Grooms/Groom_Game_OldGeng.bin",
    clipOverrides: Object.freeze({
      "Animation_Mixamo_IdleCrouchingAiming_V1.glb": "./Animation/OldGeng/Animation_OldGeng_IdleCrouchingAiming_V1.glb",
      "Animation_Mixamo_ProneFiringRifle_V2.glb": "./Animation/OldGeng/Animation_OldGeng_ProneFiringRifle_V2.glb",
      "Animation_Mixamo_Dying_V3.glb": "./Animation/OldGeng/Animation_OldGeng_Dying_V3.glb",
      "Animation_Mixamo_SittingIdle_V2.glb": "./Animation/OldGeng/Animation_OldGeng_SittingIdle_V2.glb",
    }) }),
  // 谷寿夫 V4：用户下载的完整绑骨件，转换为共用骨架。
  taniHisao: Object.freeze({ name: "谷寿夫", file: "./Model/Character/Model_TaniHisao.glb", hipsScale: 0.9361, ownMaterial: true,
    report: "./Model/Character/Data_TaniHisao.json", groom: "./Hair/Grooms/Groom_Game_TaniHisao.bin" }),
  // 东史郎 V12：用户下载的完整绑骨件，保留颈根和背部底色修复；游戏毛发按钢盔下短发、唇须与下巴胡参考挂接。
  azumaShiro: Object.freeze({ name: "东史郎", file: "./Model/Character/Model_AzumaShiro.glb", hipsScale: 0.9684, heightM: 1.840000033378601, ownMaterial: true,
    report: "./Model/Character/Data_AzumaShiro.json", groom: "./Hair/Grooms/Groom_Game_AzumaShiro.bin",
    clipOverrides: Object.freeze({
      "Animation_Mixamo_WalkWithRifle_V3.glb": "./Animation/AzumaShiro/Animation_AzumaShiro_WalkWithRifle_V3.glb",
      "Animation_Mixamo_IdleCrouchingAiming_V1.glb": "./Animation/AzumaShiro/Animation_AzumaShiro_IdleCrouchingAiming_V1.glb",
      "Animation_Mixamo_ProneFiringRifle_V2.glb": "./Animation/AzumaShiro/Animation_AzumaShiro_ProneFiringRifle_V2.glb",
      "Animation_Mixamo_Dying_V3.glb": "./Animation/AzumaShiro/Animation_AzumaShiro_Dying_V3.glb",
      "Animation_Mixamo_SittingIdle_V2.glb": "./Animation/AzumaShiro/Animation_AzumaShiro_SittingIdle_V2.glb",
    }) }),
  // 刘文财 V9：用户下载的 Mixamo 绑骨件，转换为共用骨架。
  liuWencai: Object.freeze({ name: "刘文财", file: "./Model/Character/Model_LiuWencai.glb", hipsScale: 0.9153, ownMaterial: true,
    report: "./Model/Character/Data_LiuWencai.json", groom: "./Hair/Grooms/Groom_Game_LiuWencai.bin",
    clipOverrides: Object.freeze({
      "Animation_Mixamo_Crawling_V1.glb": "./Animation/LiuWencai/Animation_LiuWencai_Crawling.glb",
      "Animation_Mixamo_ProneFiringRifle_V2.glb": "./Animation/LiuWencai/Animation_LiuWencai_ProneFiringRifle.glb",
      "Animation_Mixamo_SittingIdle_V2.glb": "./Animation/LiuWencai/Animation_LiuWencai_SittingIdle.glb",
      "Animation_Mixamo_Dying_V3.glb": "./Animation/LiuWencai/Animation_LiuWencai_Dying.glb",
      "Animation_Mixamo_IdleCrouchingAiming_V1.glb": "./Animation/LiuWencai/Animation_LiuWencai_CrouchingAiming.glb",
    }) }),
  nier: Object.freeze({ name: "妮儿", file: "./Model/Character/Model_Nier.glb", hipsScale: 0.6397, heightM: 1.2887294292449951, ownMaterial: true,
    report: "./Model/Character/Data_Nier.json", groom: "./Hair/Grooms/Groom_Game_Nier.bin",
    clipOverrides: Object.freeze({
      "Animation_Mixamo_KneelingIdle_V1.glb": "./Animation/Nier/Animation_Nier_KneelingIdle_V1.glb",
      "Animation_Mixamo_CrouchWalking_V1.glb": "./Animation/Nier/Animation_Nier_CrouchWalking_V1.glb",
      "Animation_Mixamo_KneelingInspecting_V1.glb": "./Animation/Nier/Animation_Nier_KneelingInspecting_V1.glb",
      "Animation_Mixamo_SittingIdle_V2.glb": "./Animation/Nier/Animation_Nier_SittingIdle_V2.glb",
    }) }),
  // 翻译 V6：用户下载的绑骨件保留剃净源头与修复后的手腕比例；游戏里按三视图挂凌乱短发、保持净面。
  interpreter: Object.freeze({ name: "翻译", file: "./Model/Character/Model_Interpreter.glb", hipsScale: 1.0036, heightM: 1.9343339204788208, ownMaterial: true,
    report: "./Model/Character/Data_Interpreter.json", groom: "./Hair/Grooms/Groom_Game_Interpreter.bin",
    clipOverrides: Object.freeze({
      "Derived/Animation_XBot_InterpreterFlee.glb": "./Animation/Interpreter/Animation_Interpreter_Flee.glb",
      "Derived/Animation_XBot_InterpreterShotStagger.glb": "./Animation/Interpreter/Animation_Interpreter_ShotStagger.glb",
    }) }),
  // 日军士兵A：Tripo 部件合并（角色\Tripo\10_日军士兵A，V7：下巴带、去掉帽檐下挂环），用户在 Tripo 绑的骨；hipsScale 同 Model/Character/Data_JapaneseSoldierA.json
  ijaA: Object.freeze({ name: "日军士兵A", file: "./Model/Character/Model_JapaneseSoldierA.glb", hipsScale: 0.9396, ownMaterial: true,
    report: "./Model/Character/Data_JapaneseSoldierA.json", groom: "./Hair/Grooms/Groom_Game_JapaneseSoldierA.bin" }),
  // 日军士兵C V4：用户下载件为静态网格，经本地拟合骨架和表面权重传递后转换为共用骨架。
  ijaC: Object.freeze({ name: "日军士兵C", file: "./Model/Character/Model_JapaneseSoldierC.glb", hipsScale: 0.9417, ownMaterial: true,
    report: "./Model/Character/Data_JapaneseSoldierC.json", groom: "./Hair/Grooms/Groom_Game_JapaneseSoldierC.bin",
    clipOverrides: Object.freeze({ "Animation_Mixamo_Crawling_V1.glb": "./Animation/JapaneseSoldierC/Animation_JapaneseSoldierC_Crawling.glb" }) }),
  // 日兵乙：五部件 V2；本地用已验证的日兵甲骨架拟合并传递权重，保留头形，补齐护颈布内衬。
  ijaYi: Object.freeze({ name: "日兵乙", file: "./Model/Character/Model_JapaneseSoldierYi.glb", hipsScale: 0.9418, ownMaterial: true,
    report: "./Model/Character/Data_JapaneseSoldierYi.json", groom: "./Hair/Grooms/Groom_Game_JapaneseSoldierYi.bin",
    weaponVisualOriginFit: Object.freeze({ kinds: Object.freeze(["lmg"]), muzzleSampleDepthM: 0.012, minCorrectionM: 0.02, maxCorrectionM: 0.25 }),
    clipOverrides: Object.freeze({ "Animation_Mixamo_Crawling_V1.glb": "./Animation/JapaneseSoldierYi/Animation_JapaneseSoldierYi_Crawling.glb" }) }),
});

/**
 * 白盒里这个阵营的普通士兵（没有专属配色的）换成哪些人；没写的阵营照用 X Bot。写几个就按兵的编号固定分（XBotSkins.KitFor，
 * 同一个兵每次进来都是同一张脸）。11-06 起普通日军在日兵甲、日军士兵A、日兵乙、日军士兵C中固定取一款。
 */
export const XBOT_FACTION_CHARACTERS = Object.freeze({ ija: Object.freeze(["ijaJia", "ijaA", "ijaYi", "ijaC"]) });

/** 白盒里有名字的人（Data_BlockoutXBotClips.mjs 的 XBOT_CHARACTER_LOOKS 的键）换成哪个人；没写的照用各自配色的 X Bot。 */
export const XBOT_CAST_CHARACTERS = Object.freeze({ heyoutian: "heYoutian", luo: "luo", shunzi: "shunzi", comrade: "donggua", yaowa: "yaowa", geng: "oldGeng", taniHisao: "taniHisao", azumaShiro: "azumaShiro", liuwencai: "liuWencai", nier: "nier", interpreter: "interpreter" });
