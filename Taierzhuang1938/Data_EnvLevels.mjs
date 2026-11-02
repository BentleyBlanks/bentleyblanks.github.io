// 正片关卡用哪份区域文件（docs/Data_Environment.md §6.2）。纯数据，零 import。
//
// 场景文件建的关（白盒编辑器的白盒 / 正式场景）按场景 id 读 Scenes/<Id>/Environment_<Id>.json，不用登记；
// 正片关卡不是场景文件建的，在这里按 phase.id 登记一份 Environment/Level_<文件 id>.json。
// 没登记的关卡一行不变，照旧按 phase.sky 套 Script_Sky.SKY_PRESETS。
//
// 第一关《往南的路》（?whitebox=p012，phase.id = FirstLevelP012Whitebox，天空 firstLevelBattleDay）：
// 区域文件的兜底区域引用正式场景那份预设 EnvPreset_FirstLevel（复用：正式场景以后就是这一关，调一处两边都变）；
// 那份预设 12:00 就是 firstLevelBattleDay，默认时刻打开和以前逐项一样（含逐关的自动曝光锚点，见 Script_Main 出画那段）。
export const ENV_LEVELS = Object.freeze({
  FirstLevelP012Whitebox: "FirstLevelCampaign",
});
