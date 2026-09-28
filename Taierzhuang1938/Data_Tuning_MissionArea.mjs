// 任务走廊软边界「离开战场区域 · 返回 · N 秒」的计时数值（S 包，口径 docs/Data_FirstLevelGuidance20260928.md §3.3）。
// 纯数据、零 three、不含函数；规则在 Script_MissionAreaGuard.mjs，走廊几何在 Data_FirstLevelMissionArea.mjs。
// 这是 COD 单人战役「返回战场」那一层的项目取值，不是对哪一作的实测。
export const MISSION_AREA_GUARD = Object.freeze({
  // 出了走廊要连续待这么久警告才亮：沿着走廊边缘擦一下、躲雷往外扑一步都不该闪字。
  // 出处：2026-09-28 引导轮工作单 S 包（1.5 s）；同一关的回头警告用 MISSION_RETURN.enterDelayS 1.25 s，同一量级。
  graceS: 1.5,
  // 警告亮起后的倒计时，走完判负（走既有的玩家死亡 → 检查点重试）。
  // 出处：工作单 S 包与口径文档 §3.3「离开战场区域 · 返回 · 10 秒」（COD 战役的软边界惯例）。
  countdownS: 10,
  // 回到走廊里要连续待这么久，倒计时才补满。短于它又出去，警告立刻重新亮、接着上一次剩下的秒数走 ——
  // 在边上来回蹭不能把表蹭满。3 s 约是步行 2.2–2.6 m/s 往回走 7–8 m，远大于下面的回滞带。
  resetS: 3,
  // 回滞：警告亮着的时候要回到走廊边以内这么多米才算回来，边上站着不会一帧亮一帧灭。
  // 回头警告的 MISSION_RETURN.edgeHysteresisM 是 3 m；走廊本身已经放宽到 40 m 半宽，这里取 2 m。
  reenterM: 2,
  // 换步（含检查点重来、阶段跳转）后这么久不判：新一步的走廊可能刚把人框在边上，班长、担架都还没动。
  // 出处：回头警告的 MISSION_RETURN.stageGraceS 3 s。
  stepGraceS: 3,
  // 最后这几秒那一行字转红。
  urgentS: 3,
  // 诊断记录（State().missionArea.log）最多留这么多次出界，只给测试与探针取证，不进存档。
  logMax: 64,
});
