// 第一关整关驾驶脚本 · 阶段 8–14（主街受阻 → 连屋近战 → 内院 → 接运点 → 装载 →
// 空袭 → 抬担架扑沟）。归第二波 Mid 包；公共部分在 Script_FirstLevelCampaignKit.mjs。
//
// 2026.09.19 重构下线了「屋内伏击逐拍」（09 现在是连屋近战，担架不进屋），
// 12 从四拍守波次改成两处威胁。旧驾驶脚本里 10 内院、11–12 转运区、13–14 空袭抬担架
// 这几段仍然对得上，搬过来作为起点；对不上的换成 TODO。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { MISSION_TRANSFER_THREATS } from "./Data_FirstLevelMission.mjs";
import { CampaignActions } from "./Script_FirstLevelCampaignKit.mjs";

/** 阶段 8–14。 */
export async function Drive(ctx) {
  const { page, output } = ctx;
  const { JumpStage, Capture, CaptureFocus, Route, Interact, WaitStage } = CampaignActions(ctx);
  void Capture;

  await JumpStage(8);
  throw new Error("TODO Mid 包: 阶段 8（Village：主街倒墙横车、担架停进遮挡、从灶屋绕）的驾驶脚本待写");

  /* eslint-disable no-unreachable -- 下面几段是从旧驾驶脚本搬来的、仍然对得上的起点。 */

  await JumpStage(9);
  throw new Error("TODO Mid 包: 阶段 9（Melee：连屋出来的日军，先手打掉就不走 QTE）的驾驶脚本待写");

  // --- 10 内院：清窗口机枪 → 开院门 → 掩护担架穿院 → 在障碍南侧接回主街 ----------
  await JumpStage(10);
  if (await page.evaluate(() => window.Tengxian.Debug.FirstLevelMissionRuntime().enemies.get("VillageGunner")?.alive)) {
    // 检查点恢复之后这挺机枪也可能还活着。只要目标还在，就走灶屋那个真实射角。
    await Route([{ x: 58, z: 4.6 }, { x: 58, z: -9 }, { x: 58, z: -20 }, { x: 48, z: -20 },
      { x: 58, z: -20 }, { x: 58, z: -9 }, { x: 58, z: 4.6 }], "CourtyardWindowGun", { fight: true });
    assert.ok(await page.evaluate(() =>
      !window.Tengxian.Debug.FirstLevelMissionRuntime().enemies.get("VillageGunner").alive),
    "the current window gun is cleared with real fire");
  }
  await Route([{ x: 58, z: 8 }, { x: 58, z: 18 }, { x: 53, z: 24 }, { x: 53, z: 32.8 }],
    "CourtyardGate", { fight: true });
  await Interact();
  assert.ok(await page.evaluate(() =>
    window.Tengxian.Debug.FirstLevelMission().facts.includes("courtyardGateOpen")),
  "F opens the actual courtyard door");
  await Route([{ x: 53, z: 38 }, { x: 57, z: 38 }], "CourtyardOuterCover", { fight: true });
  const columnFocus = await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().column.litters
    .filter((l) => l.visible && !l.loaded)
    .sort((a, b) => Math.hypot(a.x - 53, a.z - 35) - Math.hypot(b.x - 53, b.z - 35))[0]);
  if (columnFocus) await CaptureFocus("CourtyardColumn", columnFocus);
  assert.ok(!await page.locator("#hud").innerText()
    .then((text) => /担架已通过|通过[：:]?\s*\d+\s*[/／]/.test(text)),
  "passage counts stay out of the player HUD");
  await Route([{ x: 53, z: 35 }, { x: 53, z: 32.2 }, { x: 50, z: 32.5 }], "CourtyardDressings", { fight: true });
  const dressings = await Interact();
  assert.equal(dressings.kind, "supply", "the courtyard medical post provides real supplies");
  await page.evaluate(() => { const g = window.Tengxian; g.Debug.Key("KeyB"); g.StepFrames(1, 1 / 60, false); });
  await Route([{ x: 53, z: 32.2 }, { x: 53, z: 38 }, { x: 57, z: 38 }], "CourtyardWatch", { fight: true });
  await WaitStage("TransferApproach", 360, { fight: true });

  // --- 11 抵达桥头接运点 -------------------------------------------------------
  await JumpStage(11);
  await Route([{ x: 53, z: 37 }, { x: 64, z: 52 }, { x: 76, z: 85 }, { x: 88, z: 92 },
    { x: 89, z: 101 }, { x: 95, z: 103 }], "TransferApproachWalk", { fight: true });
  await WaitStage("Transfer", 120, { fight: true });

  // --- 12 掩护装载与离开：只有两处威胁，每解除一处真实推进一批 ------------------
  await JumpStage(12);
  // 箱子在 x=93、够到 2.5 m。Route 可能停在终点前 0.8 m：走到 x=95 会够不着。
  await Route([{ x: 94.5, z: 110 }], "TransferSupply", { fight: true });
  assert.equal((await Interact()).kind, "supply", "the transfer crate is actually within reach");
  await Route([{ x: 95, z: 103 }], "TransferPosition", { fight: true });
  await WaitStage("AirFirst", 300, { fight: true, cover: true });
  const transferPacing = await page.evaluate(() => {
    const m = window.Tengxian.Debug.FirstLevelMission();
    return { beats: m.transferBeats,
      events: m.log.filter((e) => /AttackStarted|AttackCleared|vehiclesDeparted|zhouNext/.test(e.id)),
      entered: m.log.find((e) => e.kind === "stage" && e.id === "Transfer")?.time, ended: m.time };
  });
  assert.deepEqual(transferPacing.beats.started, MISSION_TRANSFER_THREATS.map((beat) => beat.id));
  assert.deepEqual(transferPacing.beats.cleared, MISSION_TRANSFER_THREATS.map((beat) => beat.id),
    "both finite threats actually resolve before the air raid");
  await fs.writeFile(path.join(output, "Data_TransferPacing.json"), JSON.stringify(transferPacing, null, 2));
  console.log("transfer pacing", JSON.stringify(transferPacing));
  throw new Error("TODO Mid 包: 阶段 12 的 CartRide（顺子随老周的车缓慢离开）驾驶脚本待写");

  // --- 13/14 空袭：抬担架、扑沟、把老周拖回担架 --------------------------------
  await JumpStage(13);
  // 航空警报响的时候地面还有人能扔手榴弹到最后那个射位，先退到补给掩体后面。
  await Route([{ x: 95, z: 107 }, { x: 90, z: 107 }], "AirWarningCover", { stance: "crouch" });
  await WaitStage("Carry", 30, { fight: true });
  const pickup = await page.evaluate(() => {
    const z = window.Tengxian.Debug.FirstLevelMission().column.litters.find((l) => l.zhou);
    return { x: z.x + Math.sin(z.yaw) * 1.6, z: z.z + Math.cos(z.yaw) * 1.6 };
  });
  await Route([{ x: 90, z: 108 }, pickup], "FirstCarryPickup", { fight: true });
  await Interact();
  assert.equal(await page.evaluate(() => window.Tengxian.carry.KindId), "stretcher");
  assert.ok(await page.evaluate(() => {
    const g = window.Tengxian, before = g.state.playerShots;
    g.Debug.Fire();
    return g.state.playerShots === before;
  }), "Holding a patient prevents shooting");
  await Route([{ x: 63, z: 112 }, { x: 53, z: 114 }], "CarryToDitch");
  await JumpStage(14);
  await WaitStage("Rescue", ctx.stageJumps ? 40 : 12);
  assert.equal(await page.evaluate(() => window.Tengxian.carry.Active), false,
    "Dive releases the original stretcher");
  throw new Error("TODO Mid 包: 阶段 14 的 Rescue 收尾（第二轮航过后追兵断后、老周拖回担架）驾驶脚本待写");

  /* eslint-enable no-unreachable */
}
