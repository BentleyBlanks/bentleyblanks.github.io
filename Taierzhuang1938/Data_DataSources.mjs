// 数据来源表（docs/Data_DataSources.md）：仓库里每一份数据文件是「源头」「生成的」还是「退役的」。
//
// 为什么要有：第一关一类内容就有好几代、好几份文件（白盒、正式场景、预演、配音、Timeline……），
// 改之前得先猜「这份是手写的还是哪个脚本吐出来的、改了会不会被下次生成冲掉」。现在每份都按下面的规则认身份：
//   source     源头：人或编辑器写的，改它就是改内容
//   generated  生成的：by 里的脚本 / 工具写的，改源头再重新生成，不要手改
//   retired    退役：已经删掉、不许再出现（写在 DATA_RETIRED）
// 门禁 Script_DataSourcesTest：每份数据文件都要被某条规则认出来（先匹配先算），生成器路径要存在，
// 生成的 .mjs 开头要写明由谁生成，退役的不许还在。新加一类数据 = 在这里加一条规则。
//
// 纯数据，零 import。match 是相对 Taierzhuang1938/ 的路径通配（** 跨目录，* 不跨目录）。

const RULE = (match, role, by, note) => Object.freeze({ match, role, by: Object.freeze(by), note });

export const DATA_SOURCE_RULES = Object.freeze([
  RULE("Data_PublishPathRules.json", "source", ["Script_StrictTextureRules.mjs"], "全发布范围图片规则：路径、明确格式、正数最大边长；包含模型内嵌图，不允许自动跳过"),
  // --- 关卡内容 ---------------------------------------------------------------------------------------------
  RULE("Scenes/*/Environment_*.json", "source", ["Script_EditorEnvironment.mjs", "../scripts/Script_LocalPreview.mjs", "Script_EnvPresetSeed.mjs"],
    "场景的环境：昼夜时钟默认值 + 区域列表（区域引用环境预设、管影响范围）。环境编辑器经本机 /__environment/save 存，agent 直接改它（docs/Data_Environment.md §4）"),
  RULE("Environment/Level_*.json", "source", ["Script_EditorEnvironmentGame.mjs", "../scripts/Script_LocalPreview.mjs"],
    "正片关卡的区域文件（格式同场景的 Environment_*.json，多一节 stages = 任务步骤几点）：Data_EnvLevels 按 phase.id 登记；游戏内环境面板经本机 /__environment/save 存"),
  RULE("Environment/EnvPreset_*.json", "source", ["Script_EditorEnvironment.mjs", "../scripts/Script_LocalPreview.mjs", "Script_EnvPresetSeed.mjs"],
    "环境预设：组件容器（主光 / 环境光 / 天空 / 雾……每种一份，参数可按昼夜关键帧），可被多个区域、场景复用。种子脚本只生成过一次，之后改文件本身"),
  RULE("Scenes/*/Scene_*.json", "source", ["SceneEditor.html", "../scripts/Script_LocalPreview.mjs", "Script_SceneRebuild1218.mjs"],
    "场景文件：资产编号引用列表。场景编辑器经本机 /__scene/save 存，agent 直接改它；白盒场景与正式场景两份并存（用户 2026-11-01 定）"),
  RULE("Blockout/*.previz.json", "generated", ["Script_EditorBlockoutFirstLevel0105Previz.mjs", "Script_EditorBlockoutFirstLevel0610Previz.mjs", "Script_EditorBlockoutFirstLevel0107Previz.mjs", "Script_EditorBlockoutFirstLevel1218Previz.mjs", "Script_TimelineCli.mjs"],
    "白盒预演：预演生成器按白盒与剧本排出来"),
  RULE("Blockout/*.voice.json", "generated", ["Script_EditorBlockoutFirstLevel0105Voice.mjs", "Script_EditorBlockoutFirstLevel0610Voice.mjs", "Script_EditorBlockoutFirstLevel0107Voice.mjs", "Script_EditorBlockoutFirstLevel1218Voice.mjs"],
    "白盒配音表：配音生成脚本写"),
  RULE("Blockout/*.scene.json", "generated", ["Script_EditorBlockoutCli.mjs"], "白盒导出的场景草稿（文件里 source.generator 写着命令）"),
  RULE("Blockout/*.play.json", "source", ["Script_EditorBlockoutPlay.mjs"], "白盒试玩（K）的真 AI 布置，手写"),
  RULE("Blockout/*.json", "source", ["Script_EditorBlockoutStore.mjs", "../scripts/Script_LocalPreview.mjs"], "白盒关卡：白盒编辑器经本机 /__blockout/save 存，agent 直接改它"),
  RULE("Timeline/*.timeline.json", "source", ["Script_TimelineCli.mjs"], "Timeline 过场：白盒页底部 Timeline 面板与 agent 写"),
  RULE("Heightmap/Data_*.mjs", "generated", ["Script_HeightmapCli.mjs"], "高程表"),
  // --- 资产清单与烘焙产物 -------------------------------------------------------------------------------------
  RULE("Hair/Data_HairStyles.json", "source", ["_import/Script_HairGroomBuild.mjs"], "头发胡子造型、人物挂接与实验室样本源表"),
  RULE("Hair/Data_HairReferences.json", "source", ["_import/Script_HairGroomBuild.mjs", "_import/Script_HairReferenceBake.py"], "个人原图、剃净参考、模型五官校准及头发胡子配方"),
  RULE("Hair/Data_HairReferenceMasks.json", "generated", ["_import/Script_HairReferenceBake.py"], "原图细须覆盖图集与发根采样、发际线轮廓"),
  RULE("Hair/Data_HairGrooms.json", "generated", ["_import/Script_HairGroomBuild.mjs"], "三档头发与胡子二进制资产清单"),
  RULE("Hair/Heads/*.json", "generated", ["_import/Script_HairLabHeads.py"], "只读角色光头来源转换的关键点与米制朝向"),
  RULE("Animation/**/*.json", "generated", ["_import", "_blender"],
    "动作：源头在 Blender / 视频转骨骼 / Mixamo，JSON 是烘焙脚本（_import/Script_*Bake.*、_blender/*）导出的"),
  RULE("Audio/**/*.json", "generated", ["Script_SeedAudioFirstLevelBake.mjs", "Script_SeedAudioSquadBarkBake.mjs", "Script_SeedAudioCastBake.mjs", "Script_SeedAudioVoiceKit.mjs", "Script_AmbBake.mjs", "Script_MusicBake.mjs", "Script_FirstLevelMusicBake.mjs", "Script_AudioNormalize.mjs", "Script_EditorBlockoutFirstLevel0105Voice.mjs", "Script_EditorBlockoutFirstLevel0610Voice.mjs", "Script_EditorBlockoutFirstLevel0107Voice.mjs", "Script_EditorBlockoutFirstLevel1218Voice.mjs"],
    "声音清单、台词时间轴、口型、转写复核：各烘焙脚本写，响度由 Script_AudioNormalize 回写"),
  RULE("Font/*.json", "generated", ["Font/Script_FontSubset.py"], "字体子集清单"),
  RULE("Volume/*.json", "generated", ["_import/Script_ParticleVolumeBake.py"], "体积烟雾"),
  RULE("Model/**/*.tzm.json", "source", ["Script_TzmShot.mjs"], "程序化模型（项目自有格式，移植前要导成 glTF）"),
  RULE("Model/RifleSlingV3/Data_RifleSlingFlatV3.json", "generated", ["_blender/Script_FlatRifleSlingBakeV3.py"], "扁平棕色背带、折返收口与绑定合同；原图来自内置 imagegen 一级"),
  RULE("Model/**/*.json", "generated", ["_blender", "_import"], "模型清单、打包与贴图记录：各资产的构建脚本（_blender/<资产>/Build_*.py、_import/*）写"),
  RULE("_blender/**/*.json", "generated", ["_blender"], "Blender 构建脚本的输入快照与打包记录"),
  RULE("docs/Data_FirstLevelMissionAnimationStatus.json", "generated", ["_import/Script_FirstLevelAnimationStatus.py"], "第一关动作进度表"),
  RULE("docs/Data_TrenchSurfaceAssets.json", "generated", ["_import/Script_BakeTrenchSurface.py"], "壕沟土面烘焙记录"),
  // --- 根目录 ----------------------------------------------------------------------------------------------
  RULE("Data_DebugApiKeys.json", "generated", ["Script_DebugApiTest.mjs"], "调试口名字登记（--write）"),
  RULE("Data_SoldierForeignWrites.json", "generated", ["Script_SoldierComponentsTest.mjs"], "士兵字段主人以外的直接写入旧账（--write）"),
  RULE("Data_FirstLevelSpaceSouthFingerprint.json", "generated", ["Script_FirstLevelSpaceTest.mjs"], "第一关南段空间指纹"),
  RULE("Data_HistoryLedgerSync.json", "generated", ["Script_HistoryLedgerAudit.mjs"], "资料馆史实对照的同步记录"),
  RULE("Data_TextureImportSettings.json", "source", ["Script_TextureImportServer.mjs"], "贴图导入设置：贴图管理页里逐张定"),
  RULE("Data_ActorLocomotion.mjs", "generated", ["_import/Script_LocomotionProfileBake.mjs"], "人物步态曲线（从 GLB 采样）"),
  RULE("Data_BurntTimberPile.mjs", "generated", ["_blender/Script_BuildBurntTimberPile.py"], "焦木堆几何"),
  RULE("Data_HanYang173RGrips.mjs", "generated", ["_blender/Script_ApplyHanYang173RGrips.mjs"], "汉阳造握把蒙皮"),
  RULE("Data_RifleSlingMounts.mjs", "source", [], "BlenderMCP 实测原枪背带环与捆扎截面的游戏米制坐标；原枪几何保持不变"),
  RULE("Data_MeleeVideoAnimations.mjs", "generated", ["_import/Script_MeleeVideoPrepare.py"], "白刃视频转出的动作"),
  RULE("Data_*.mjs", "source", [], "数据模块（数值 Data_Tuning_*、文本 Data_Text_*、关卡与资产表……）：手写"),
]);

/** 退役：已经删掉的数据文件，不许再出现（删的时候在这里记一行：路径、哪天、为什么）。 */
export const DATA_RETIRED = Object.freeze([
  {file:'Model/HempRifleSlingV2/Data_RifleSlingHempV2.json',why:'2026-11-05 用户澄清麻绳仅指低回弹手感，撤销圆绳外形，改用扁平枪带 V3'},
]);

/** 门禁扫哪些文件：数据模块、JSON（这些目录与根目录），不扫第三方、导入工作区、取证输出。 */
export const DATA_SCAN = Object.freeze({
  include: Object.freeze(["Data_*.mjs", "*.json", "Heightmap/Data_*.mjs", "Scenes/**/*.json", "Environment/*.json", "Blockout/*.json", "Timeline/*.json", "Animation/**/*.json",
    "Audio/**/*.json", "Font/*.json", "Volume/*.json", "Hair/**/*.json", "Model/**/*.json", "_blender/**/*.json", "docs/*.json"]),
  exclude: Object.freeze(["vendor/**", "node_modules/**", "_import/**", "_shots/**", "tmp/**"]),
});

/** 还导出函数或别的不能写成 JSON 的值的数据模块（旧账，只减不增；Script_DataJsonTest 守）。函数搬进同名 Script_ 模块后删掉这一行。 */
export const DATA_JSON_DEBT = Object.freeze([
  "Data_AssetStandards.mjs", "Data_Battle.mjs", "Data_BattleReactionRange.mjs",
  "Data_EditorBlockoutFirstLevel0105Lines.mjs", "Data_EditorBlockoutFirstLevel0105Space.mjs", "Data_EditorBlockoutFirstLevel0610Lines.mjs",
  "Data_EditorBlockoutFirstLevel0610Space.mjs", "Data_EditorBlockoutFirstLevel1218Lines.mjs", "Data_EditorBlockoutFirstLevel1218Space.mjs",
  "Data_FirstLevelBridgeFarBank.mjs", "Data_FirstLevelDistantSmoke.mjs", "Data_FirstLevelFarBankCrowd.mjs",
  "Data_FirstLevelFrontRoute.mjs", "Data_FirstLevelMission.mjs", "Data_FirstLevelMissionDialogue.mjs",
  "Data_FirstLevelMissionFront.mjs", "Data_FirstLevelMissionGates.mjs", "Data_FirstLevelMissionLayout.mjs",
  "Data_FirstLevelMissionTerrain.mjs", "Data_FirstLevelPropDressing.mjs", "Data_FirstLevelVegetation.mjs",
  "Data_FirstLevelVoiceCast.mjs", "Data_FirstLevelWhiteboxMaterials.mjs", "Data_FirstLevelWhiteboxTerrain.mjs",
  "Data_FpsArmPoses.mjs", "Data_HanYang173RGrips.mjs", "Data_HistoryCodex.mjs",
  "Data_LevelTextureSets.mjs", "Data_Locale_zhCN.mjs", "Data_Menu.mjs",
  "Data_OpeningSet0103.mjs", "Data_SandboxRanges.mjs", "Data_SceneAssets.mjs",
  "Data_SceneEvents.mjs", "Data_SceneGroundLayers.mjs", "Data_SfxSources.mjs",
  "Data_ShellImpactRange.mjs", "Data_ShellImpactRangeTerrain.mjs", "Data_StartupRouting.mjs",
  "Data_TengxianScript.mjs", "Data_TrenchDetails.mjs", "Data_Tuning_Camera.mjs",
  "Data_Tuning_FirstLevel.mjs", "Data_Tuning_FirstLevelMid.mjs", "Data_Tuning_Gore.mjs",
  "Data_Tuning_Graphics.mjs", "Data_Tuning_Materials.mjs", "Data_Tuning_Shadows.mjs",
  "Data_Tuning_TerrainTrails.mjs", "Data_Tuning_Volumetrics.mjs", "Data_Voice.mjs",
  "Data_WeaponRange.mjs",
]);

/** 已有的、不带版本号字段的 JSON（新加的要带 schema / format / version 之一；Script_DataJsonTest 守）。 */
export const DATA_JSON_UNVERSIONED = Object.freeze([
  "Data_FirstLevelSpaceSouthFingerprint.json",
]);
