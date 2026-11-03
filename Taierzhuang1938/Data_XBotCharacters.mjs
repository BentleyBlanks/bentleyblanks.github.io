// 能顶替 X Bot 播 Mixamo 动作库的人物（2026-11-03，日兵甲起）。都由 _import/Script_BuildXBotRigCharacter.mjs 转成跟
// Animation/Mixamo/Model_MixamoXBot.glb 同一副骨架：骨名、层级、每根骨头初始姿势下的世界朝向全一样，只有骨头位置（身材）是自己的。
// 用在动作预览工具（人物切换）和白盒（XBOT_FACTION_CHARACTERS：这个阵营的普通士兵换成这个人；XBOT_CAST_CHARACTERS：这个有名字的人换成这个人）。说明 docs/Data_EditorBlockout.md §18「日兵甲」。
//
// 动作库是 X Bot 的：每根骨都有位移轨（X Bot 的骨长），胯的位移是 X Bot 的胯高。别的身材照放会被拉成 X Bot 的骨长、脚离地，
// 所以 Script_XBotCharacters.mjs 的 ClipForCharacter 去掉 Hips 以外的位移轨、Hips 位移整条乘 hipsScale（胯高之比，转换脚本写在 Data_<名>.json）。

export const XBOT_CHARACTERS = Object.freeze({
  xbot: Object.freeze({ name: "X Bot", file: "./Animation/Mixamo/Model_MixamoXBot.glb", hipsScale: 1, ownMaterial: false }),
  // 日兵甲：Tripo 部件合并（角色\Tripo\14_日兵甲），用户在 Tripo 绑的骨；hipsScale 同 Model/Character/Data_JapaneseSoldierJia.json
  ijaJia: Object.freeze({ name: "日兵甲", file: "./Model/Character/Model_JapaneseSoldierJia.glb", hipsScale: 0.9074, ownMaterial: true,
    report: "./Model/Character/Data_JapaneseSoldierJia.json" }),
  // 何有田：Tripo 部件合并（角色\Tripo\05_何有田），用户在 Tripo 绑的骨，后颈接缝补过权重（_NeckFix）；hipsScale 同 Model/Character/Data_HeYoutian.json
  heYoutian: Object.freeze({ name: "何有田", file: "./Model/Character/Model_HeYoutian.glb", hipsScale: 0.9612, ownMaterial: true,
    report: "./Model/Character/Data_HeYoutian.json" }),
});

/** 白盒里这个阵营的普通士兵（没有专属配色的）换成哪个人；没写的阵营照用 X Bot。 */
export const XBOT_FACTION_CHARACTERS = Object.freeze({ ija: "ijaJia" });

/** 白盒里有名字的人（Data_BlockoutXBotClips.mjs 的 XBOT_CHARACTER_LOOKS 的键）换成哪个人；没写的照用各自配色的 X Bot。 */
export const XBOT_CAST_CHARACTERS = Object.freeze({ heyoutian: "heYoutian" });
