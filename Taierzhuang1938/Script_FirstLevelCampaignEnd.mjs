// 第一关整关驾驶脚本 · 阶段 15–18（降压收拢 → 交接 → 老周死亡 → 铁路桥与夜入滕城）。
// 归第二波 End 包；公共部分在 Script_FirstLevelCampaignKit.mjs。
//
// 2026.09.19 重构把 15 改成**无战斗**的降压段（收拢、换手抬运、找到接收处），
// 18 换成「接应回援尾队 → 奉令毁桥 → 夜入滕城」。旧驾驶脚本的撤退三连战
// （RetreatFirst/Wall/Yard）、接收院防御与从后门撤离整段已经对不上，全部删掉。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";

/** 阶段 15–18，走到 Complete。 */
export async function Drive(ctx) {
  const { page, output } = ctx;
  const { JumpStage, Capture, Route, Interact, WaitStage } = CampaignActions(ctx);
  void Route; void Interact; void WaitStage; void A; void fs; void path; void output;

  await JumpStage(15);
  // 15A/15B/15C：收拢 → 换手抬运（CarrySwap）→ 院门盘问与接收。全程无敌人。
  throw new Error("TODO End 包: 阶段 15（Regroup / WallPath / ReceptionGate）的驾驶脚本待写");

  /* eslint-disable no-unreachable */

  await JumpStage(16);
  throw new Error("TODO End 包: 阶段 16（Handover：过门槛、放下担架、恢复持枪）的驾驶脚本待写");

  await JumpStage(17);
  throw new Error("TODO End 包: 阶段 17（Death：第一人称确认老周死亡，不判失败）的驾驶脚本待写");

  await JumpStage(18);
  throw new Error("TODO End 包: 阶段 18（BridgeOrders → BridgeCover → BridgeWithdraw → NightMarch → Complete）的驾驶脚本待写");

  await Capture("Complete");
  assert.equal(await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().stage), "Complete");

  /* eslint-enable no-unreachable */
}
