// 第一关整关驾驶脚本 · 阶段 1–7（受困 → 救援 → 支援 → 机枪 → 战车 → 接令 → 南行）。
// 归第二波 Front 包；公共部分在 Script_FirstLevelCampaignKit.mjs。
//
// 2026.09.19 重构把 01/02 从「军列遭炮击」换成了「掩蔽部被近失弹埋了」，
// 07 从黑屏瞬移换成真走一段。旧驾驶脚本里对得上的段落搬了过来（03 前沿、04 机枪、
// 05 取弹炸车）；对不上的换成 TODO，哪一段没写一眼就看得见。
import assert from "node:assert/strict";
import path from "node:path";
import { MISSION_ROUTES as Routes, MISSION_ANCHORS as A } from "./Data_FirstLevelMissionLayout.mjs";
import { MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";

/** 阶段 1–7。前置：ctx 已经开好页、装好输入驱动器。 */
export async function Drive(ctx) {
  const { page, output } = ctx;
  const { JumpStage, Capture, WaitOutCutscene, Route, Interact, WaitStage } = CampaignActions(ctx);
  void path; void A;

  await JumpStage(1);
  // 01 受困：黑屏对白被近爆打断 → 只能转头 → 看清门外的刺杀 → 日兵转向门内。
  // 全程没有玩家输入，驾驶脚本要做的是「像玩家一样坐着看完并核对事实」。
  throw new Error("TODO Front 包: 阶段 1（Trapped）的驾驶脚本待写");

  /* eslint-disable no-unreachable -- 下面几段是从旧驾驶脚本搬来的、仍然对得上的起点。 */

  await JumpStage(2);
  throw new Error("TODO Front 包: 阶段 2（Rescue：掀木架、拾枪、撤入后交通壕）的驾驶脚本待写");

  await JumpStage(3);
  throw new Error("TODO Front 包: 阶段 3（Support：接回第一批守军）的驾驶脚本待写");

  // --- 04 机枪：一进来玩家就站在枪座上（也在关中过场的触发圈里）------------------
  // 过场期间 InputRouter 是掐着的，F 会被整段吞掉，症状看着像「F 没能占住机枪」。
  await JumpStage(4);
  await WaitOutCutscene("MachineGunMount");
  await page.evaluate(() => {
    const g = window.Tengxian;
    g.Debug.Key("KeyF", true);
    g.StepFrames(90, 1 / 60, false);
    g.Debug.Key("KeyF", false);
  });
  assert.ok(await page.evaluate(() => window.Tengxian.emplacement.Mounted),
    "F actually occupies the mission machine gun");
  console.log("ok machine gun occupied");
  await Capture("MachineGun");
  throw new Error("TODO Front 包: 阶段 4（MachineGun：击退进攻、守军撤回、战车压口）的其余驾驶脚本待写");

  // --- 05 取弹炸车：先在前沿补给箱补弹，再爬侧沟去弹药屋 ------------------------
  await JumpStage(5);
  await Route([{ x: 0, z: -124 }, { x: -2.2, z: -122.5 }], "FrontResupply", { stance: "crouch" });
  // 刚打完那一场可能刚用过这只箱子，等它真的过了冷却再测一次物理补给。
  await page.evaluate((seconds) => window.Tengxian.StepFrames(Math.ceil(seconds * 60), 1 / 60, false),
    R.supplyCooldownS + 1);
  const clipsBefore = await page.evaluate(() => window.Tengxian.state.clips);
  await Interact();
  assert.equal(await page.evaluate(() => window.Tengxian.state.clips), clipsBefore + R.frontSupplyClips,
    "physical front supply covers the expanded approach ammunition cost");
  await Route(Routes.bundle, "BundleApproach",
    { fight: true, stance: "stand", sprint: true, crawl: true, rejoinRoute: Routes.bundle });
  await Interact();
  throw new Error("TODO Front 包: 阶段 5（Tank：投集束弹炸停战车、守军撤入、接防进位）的其余驾驶脚本待写");

  await JumpStage(6);
  throw new Error("TODO Front 包: 阶段 6（Orders：回集结处接令、借火、后送队起行）的驾驶脚本待写");

  await JumpStage(7);
  await WaitStage("Village", 240);
  throw new Error("TODO Front 包: 阶段 7（South：真走 45–75 秒、顺子幺娃私语）的驾驶脚本待写");

  /* eslint-enable no-unreachable */
  void output;
}
