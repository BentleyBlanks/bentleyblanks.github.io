// 第一关真浏览器基线与整关驾驶（截图与证据留在本地 _shots/，忽略目录）。
//
//   node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs                基线：开机、初始状态、开场演出
//   node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign     整关：真实玩家输入走完 18 个阶段
//   node …  --campaign --audio                                                  再加逐条录音的真实解码与播放
//   node …  --campaign --stage-jumps [--stage-from=8|11|15|18]                  从某个分段起点继续
//
// 2026.09.19 重构之后这个文件只是**薄编排器**：参数、三段驱动、收尾断言。
// 公共动作在 Script_FirstLevelCampaignKit.mjs，三段分别在
// Script_FirstLevelCampaignFront / Mid / End.mjs —— 第二波三个玩法包各改自己那一份，
// 不再都挤在同一个一千七百行的文件里。
//
// 「不许用调试跳转代替正常通关」的四道自检原样保留：
//   1. 没有 --stage-jumps 时 JumpStage 直接 return（Kit 里第一行就是这条）；
//   2. 每次跳转断言 beforePhase —— 上一个起点必须**真的走到**下一个公开阶段才准重开；
//   3. 检查点重试有次数上限，且重试前后事实、敌人伤亡逐条相等（Kit 的 Route / RetryCampaign）；
//   4. 证据目录按 suite 分开，分段跑出来的结果不会冒充整关通关。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ParseCampaignArgs, OpenCampaign, CloseCampaign, CaptureFailure,
  CheckVoiceAssets, InstallInputDriver,
} from "./Script_FirstLevelCampaignKit.mjs";
import { Drive as DriveFront } from "./Script_FirstLevelCampaignFront.mjs";
import { Drive as DriveMid } from "./Script_FirstLevelCampaignMid.mjs";
import { Drive as DriveEnd } from "./Script_FirstLevelCampaignEnd.mjs";

const options = ParseCampaignArgs();
const ctx = await OpenCampaign(options);
const { page, output } = ctx;

try {
  if (options.stageFrom === 1) {
    if (options.audioCheck) await CheckVoiceAssets(ctx);
    // 记录玩家每一次挨打：谁打的、打在哪、掉多少血。失败时这一份比截图有用。
    await page.evaluate(() => {
      const g = window.Tengxian, original = g.player.TakeHit.bind(g.player);
      window.missionDamage = [];
      g.player.TakeHit = (damage, part, direction, info) => {
        const before = g.player.health, result = original(damage, part, direction, info);
        window.missionDamage.push({ time: g.Debug.FirstLevelMission()?.time, before, after: g.player.health,
          damage, part, blast: !!info?.blast, bullet: !!info?.bullet,
          from: info?.from?.toArray(), position: g.player.position.toArray() });
        if (window.missionDamage.length > 120) window.missionDamage.shift();
        return result;
      };
    });
    const initial = await page.evaluate(() => ({
      mission: window.Tengxian.Debug.FirstLevelMission(),
      position: { ...window.Tengxian.player.position },
      ammo: window.Tengxian.state.ammo,
      slots: { ...window.Tengxian.state.slots },
    }));
    // 01 开局：人被压在坍塌的掩蔽部里，枪还在几米外的地上。
    assert.equal(initial.mission.stage, "Trapped");
    assert.equal(initial.slots.melee, "Dadao");
    console.log("ok initial mission",
      JSON.stringify({ stage: initial.mission.stage, position: initial.position, slots: initial.slots }));
    if (!options.campaign) {
      // 基线（不带 --campaign）：坐着把 01 看完。军列开场那一份 PlayFirstLevelOpening
      // 随骨架下线了，这里改看新开场自己的三条事实与门外那一拍。
      const trapped = await page.evaluate(() => {
        const g = window.Tengxian;
        for (let i = 0; i < 60 * 60 && g.Debug.FirstLevelMissionRuntime().flow.stage.id === "Trapped"; i++)
          g.StepFrames(1, 1 / 60, false);
        const mission = g.Debug.FirstLevelMission();
        return { stage: mission.stage, facts: mission.facts, beats: mission.front.bunker.beats,
          captives: mission.front.bunker.captives, control: mission.control };
      });
      await fs.writeFile(path.join(output, "Data_Opening.json"), JSON.stringify(trapped, null, 2));
      await page.evaluate(() => window.Tengxian.StepFrames(4, 1 / 60, true));
      await page.screenshot({ path: path.join(output, "Scene_Opening.png") });
      for (const fact of ["bunkerCollapsed", "captivesKilled", "doorSearchStarted"])
        assert.ok(trapped.facts.includes(fact), "受困段记下了 " + fact);
      assert.ok(trapped.captives.length === 2 && trapped.captives.every((actor) => !actor.alive),
        "门外两名失去抵抗能力的川军被杀害");
      assert.equal(trapped.stage, "BunkerRescue", "「日军开始检查门内」把 01 推到 02");
      console.log("ok baseline opening", JSON.stringify({ beats: trapped.beats }));
    }
  }

  if (options.campaign) {
    await InstallInputDriver(ctx);
    if (ctx.stageFrom <= 7) await DriveFront(ctx);
    // `--stage-to=7`：只跑 Front 那一段（1–7）。分段夹具照样留证据与回执，
    // 但不跑后两段、也不断言 Complete —— 一段跑通不许冒充通关。
    if (ctx.stageTo > 7) {
      if (ctx.stageFrom <= 14) await DriveMid(ctx);
      if (ctx.stageTo > 14) await DriveEnd(ctx);
    }
    if (ctx.stageTo < 18) {
      assert.deepEqual(ctx.errors, []);
      console.log(`ok stages ${ctx.stageFrom}-${ctx.stageTo} driven with real player input`);
      await fs.writeFile(path.join(output, "Data_Segment.json"),
        JSON.stringify({ stageFrom: ctx.stageFrom, stageTo: ctx.stageTo,
          stage: await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().stage) }, null, 2));
    } else {

    assert.equal(await page.evaluate(() => window.Tengxian.Debug.FirstLevelMission().stage), "Complete");
    // TODO 第二波：节奏断言按新 27 步重写。旧的那几条（South 的六秒黑屏转场、
    // TransferApproach 30–60 s、Transfer 2–4 min）量的是已经下线的步骤 ——
    // 07 现在是真走一段 45–75 秒，12 只有两处威胁，各包按自己那一段的口径补。
    const pacing = await page.evaluate(() => {
      const stages = window.Tengxian.Debug.FirstLevelMission().log.filter((e) => e.kind === "stage");
      return Object.fromEntries(stages.slice(0, -1).map((e, i) => [e.id, stages[i + 1].time - e.time]));
    });
    console.log("pacing", JSON.stringify(pacing));
    await fs.writeFile(path.join(output, "Data_Pacing.json"), JSON.stringify(pacing, null, 2));

    assert.deepEqual(ctx.errors, []);
    if (ctx.stageJumps) {
      assert.deepEqual(ctx.jumpReceipts.map((receipt) => receipt.number),
        Array.from({ length: 19 - ctx.stageFrom }, (_, i) => i + ctx.stageFrom));
      await fs.writeFile(path.join(output, "Data_JumpContinuation.json"),
        JSON.stringify(ctx.jumpReceipts, null, 2));
      console.log(`ok debug starts ${ctx.stageFrom}–18 continued with real player input through their next stage, ending at Complete`);
    } else console.log("ok entire first level completed with real player input and physical mission events");
    }
  }
} catch (error) {
  await CaptureFailure(ctx);
  throw error;
} finally {
  // 分段夹具与失败的跑法要和整关一样留下恢复回执：一段跑通不许冒充 Complete。
  await CloseCampaign(ctx);
}
