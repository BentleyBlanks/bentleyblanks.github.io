// Real lethal-hit and input fixtures; this is not a full campaign playthrough.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "_shots", "DeathMenu");
await fs.mkdir(out, { recursive: true });
const baseArg = process.argv.find(arg => arg.startsWith("--base="))?.slice(7);
const server = baseArg ? null : await ServeRoot(path.resolve(here, ".."), 0);
const base = baseArg || `http://127.0.0.1:${server.address().port}`;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(`${base}/Taierzhuang1938/?whitebox=p012&missionStage=3&shot=1&manual=1&quality=high&scale=small`, { timeout: 120000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian?.Debug?.FirstLevelMission?.(), null, { timeout: 180000 });
  const setup = await page.evaluate(async () => {
    const g = window.Tengxian;
    const { FirstLevelMissionRuntime } = await import("./Script_FirstLevelMissionRuntime.mjs");
    const original = FirstLevelMissionRuntime.prototype.State;
    FirstLevelMissionRuntime.prototype.State = function () { window.deathRuntime = this; return original.call(this); };
    g.Debug.FirstLevelMission();
    FirstLevelMissionRuntime.prototype.State = original;
    const r = window.deathRuntime;
    await r.voiceReady;
    g.interact.hooks.TakeWeapon("HanYang",5);
    for(const actor of g.ai.soldiers) if(actor.side==="ija") actor.position.x+=800;
    g.player.spawnGrace=999;
    g.StepFrames(90,1/60,false);
    g.player.yaw=Math.PI;g.player.pitch=-.1;g.player.SyncCamera(0);
    g.StepFrames(1,1/60,true);
    r.SaveCheckpoint();
    window.deathSafe = { ...r.safePoint };
    // Move away from the saved location and use a control segment to reproduce
    // the former ContinueCheckpoint -> OnPlayerDown -> retryPoint bug.
    g.player.position.z -= 3;
    g.player.position.y=g.physics.GroundProbe(g.player.position.x,g.player.position.z,g.player.position.y).y;
    g.player.body.Teleport(g.player.position.x,g.player.position.y,g.player.position.z);
    g.player.SyncCamera(0);
    r.controls = { kind: "fixture", time: 0, seconds: 999 };
    g.player.spawnGrace = 0;
    g.player.TakeHit(10000, "torso");
    g.StepFrames(1, 1 / 60, true);
    window.DeathWorld = () => JSON.stringify({ time: g.state.elapsed, ai: g.ai.time,
      positions: g.ai.soldiers.map(a => a.position.toArray()), flow: r.flow.State(),
      ammo: g.state.ammo, clips: g.state.clips, grenades: g.state.grenades, pool: g.state.nraPool });
    window.deathWorld = window.DeathWorld();
    return { mode: g.menu.mode, running: g.state.running, alive: g.player.Alive,
      title: g.menu.el.titleMain.textContent, items: g.menu.items.map(item => item.id),
      pauseClass: g.menu.root.classList.contains("pause"), camera: g.camera.position.toArray() };
  });
  assert.equal(setup.mode, "failure");
  assert.equal(setup.title, "你已阵亡");
  assert.equal(setup.running, false);
  assert.equal(setup.alive, false);
  assert.equal(setup.pauseClass, false);
  assert.deepEqual(setup.items, ["continueCheckpoint", "restartSandbox", "exitSandbox"]);
  assert.ok(await page.evaluate(()=>{
    const g=window.Tengxian;g.Debug.MenuAct("continueCheckpoint");return !g.player.Alive;
  }),"hidden retry actions cannot interrupt the collapse");
  assert.ok(await page.locator(".mnPauseObjective").isHidden(), "pause-only objective stays out of death screen");
  const collapse = [];
  for (const frame of [0,12,27,42,57,80,112]) {
    const sample = await page.evaluate(({frame,previous}) => {
      const g=window.Tengxian;
      g.StepFrames(frame-previous,1/60,true);
      g.StepFrames(1,0,true);
      const wrist=g.viewmodel.riggedArms?.gripNodes.r;
      const ndc=wrist?.getWorldPosition(g.player.position.clone()).project(g.camera).toArray();
      return {frame,time:g.player.deadTime,camera:g.camera.position.toArray(),roll:g.camera.rotation.z,
        weapon:g.viewmodel.weaponId,wristNdc:ndc,
        hands:g.viewmodel.root.visible,gunPitch:g.viewmodel.wallPivot.rotation.x,
        reveal:g.menu.deathReveal,impact:g.player.deathImpactPlayed,
        frozen:window.deathWorld===window.DeathWorld()};
    },{frame,previous:collapse.at(-1)?.frame || 0});
    collapse.push(sample);
    await page.screenshot({path:path.join(out,`Scene_Collapse${String(frame).padStart(3,"0")}.png`)});
  }
  await fs.writeFile(path.join(out,"Data_Collapse.json"),JSON.stringify(collapse,null,2));
  assert.ok(collapse.every(row=>row.frozen),"only the death performance advances");
  assert.ok(collapse[0].hands && collapse[1].hands && !collapse.at(-1).hands,"hands fall out of view instead of vanishing on the lethal frame");
  assert.ok(collapse[0].weapon==="HanYang" && Math.abs(collapse[0].wristNdc[0])<1 && Math.abs(collapse[0].wristNdc[1])<1,
    "actual rifle hand is in the frame at death, not just an enabled root");
  assert.ok(collapse[2].gunPitch<collapse[0].gunPitch-.04,"held weapon lowers with the skeletal hands");
  assert.ok(collapse[0].reveal===0 && collapse[3].reveal===0 && collapse.at(-1).reveal===1,"menu waits for the complete collapse");
  assert.ok(!collapse[2].impact && collapse.at(-1).impact,"body impact belongs to ground contact");
  await page.keyboard.press("Escape");
  const frozen = await page.evaluate(() => {
    const g = window.Tengxian;
    g.Debug.MenuAct("resume");
    g.Debug.MenuAct("debug");
    g.StepFrames(180, 1 / 60, false);
    g.StepFrames(1, 1 / 60, true);
    return { unchanged: window.deathWorld === window.DeathWorld(), mode: g.menu.mode,
      running: g.state.running, camera: g.camera.position.toArray(),
      hudHidden: document.querySelector("#hud").style.display === "none", gunHidden: !g.viewmodel.root.visible };
  });
  assert.ok(frozen.unchanged, "death freezes mission, AI, supplies and gameplay time");
  assert.equal(frozen.mode, "failure");
  assert.equal(frozen.running, false);
  assert.ok(frozen.camera[1] < setup.camera[1] - .5, "death camera falls independently of the frozen world");
  assert.ok(frozen.hudHidden && frozen.gunHidden);
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  await page.screenshot({ path: path.join(out, "Scene_DeathDesktop.png") });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.Tengxian.StepFrames(1, 1 / 60, true));
    const bounds = await page.locator('[data-act="continueCheckpoint"]').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
    await page.screenshot({ path: path.join(out, `Scene_Death${viewport.width}.png`) });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole("button", { name: "从检查点开始", exact: true }).click();
  const restored = await page.evaluate(() => {
    const g = window.Tengxian, r = window.deathRuntime, point = window.deathSafe;
    const z = point.trainZ == null ? point.z : point.trainZ + g.battlefield.trainOffsetM;
    return { alive: g.player.Alive, health: g.player.health, failed: r.failed, running: g.state.running,
      closed: !g.menu.open, deathClass: g.menu.root.classList.contains("failure"),
      distance: Math.hypot(g.player.position.x - point.x, g.player.position.z - z),
      preserved: window.deathWorld === window.DeathWorld(), gun: g.viewmodel.root.visible };
  });
  assert.ok(restored.alive && restored.health === 100 && !restored.failed && restored.running && restored.closed && !restored.deathClass);
  assert.ok(restored.distance < .1 && restored.preserved && restored.gun, JSON.stringify(restored));
  const stances=[];
  for(const [stance,eye] of [["crouch",1.05],["prone",.42]]) {
    const result=await page.evaluate(({stance,eye})=>{
      const g=window.Tengxian,p=g.player;
      p.position.z-=3;
      p.position.y=g.physics.GroundProbe(p.position.x,p.position.z,p.position.y).y;
      p.body.Teleport(p.position.x,p.position.y,p.position.z);
      p.stance=stance;p.eyeHeight=eye;
      p.stanceBlend={stand:stance==="stand"?1:0,crouch:stance==="crouch"?1:0,prone:stance==="prone"?1:0};
      p.pitch=-.12;p.SyncCamera(0);
      g.viewmodel.Update(1/60,{playerPosition:p.position,playerYaw:p.yaw,crouch:p.stanceBlend.crouch,prone:p.stanceBlend.prone,alive:true});
      const start=g.camera.position.clone();
      p.spawnGrace=0;p.TakeHit(10000,"torso");
      g.StepFrames(112,1/60,true);
      const ground=g.physics.GroundProbe(g.camera.position.x,g.camera.position.z,p.position.y,.12,4).y;
      return {stance,start:start.toArray(),end:g.camera.position.toArray(),height:g.camera.position.y-ground,
        roll:g.camera.rotation.z,reveal:g.menu.deathReveal,gl:g.renderer.getContext().getError()};
    },{stance,eye});
    stances.push(result);
    assert.ok(result.height>=.12 && result.height<.25 && Math.abs(result.roll)>1 && result.reveal===1 && result.gl===0,JSON.stringify(result));
    await page.screenshot({path:path.join(out,`Scene_Death${stance}.png`)});
    await page.getByRole("button",{name:"从检查点开始",exact:true}).click();
  }
  await page.evaluate(() => window.Tengxian.Debug.Pause());
  assert.equal(await page.locator(".mnTitleMain").textContent(), "游戏暂停");
  assert.ok(await page.locator(".mnPauseObjective").isVisible(), "pause still displays the mission objective");
  await page.keyboard.press("Escape");
  assert.ok(await page.evaluate(() => window.Tengxian.state.running && !window.Tengxian.menu.open));
  await page.evaluate(() => {
    const g = window.Tengxian;
    g.player.spawnGrace = 0; g.player.TakeHit(10000, "torso"); g.StepFrames(112);
  });
  await page.keyboard.press("Enter");
  assert.ok(await page.evaluate(() => window.Tengxian.player.Alive && window.Tengxian.state.running && !window.Tengxian.menu.open));
  const unavailable = await page.evaluate(() => {
    const g = window.Tengxian, r = window.deathRuntime;
    g.player.spawnGrace = 0; g.player.TakeHit(10000, "torso"); r.safePoint = null; g.StepFrames(1);
    const result = { disabled: g.menu.itemEls[0].disabled, title: g.menu.el.titleMain.textContent };
    g.Debug.MenuAct("continueCheckpoint");
    result.stillDead = !g.player.Alive && r.failed && !g.state.running;
    return result;
  });
  assert.ok(unavailable.disabled && unavailable.stillDead, JSON.stringify(unavailable));
  assert.equal(unavailable.title, "你已阵亡");
  const companionFailure = await page.evaluate(async () => {
    const g=window.Tengxian;
    await g.Debug.FirstLevelJump(1);
    const r=g.Debug.FirstLevelMissionRuntime();
    g.Debug.SetDebugOption("invincible",true);
    g.StepFrames(2,1/60,true);
    r.squad.find(actor=>actor.castId==="luo").Kill();
    r.opening.Update(1/60);
    g.StepFrames(1,1/60,true);
    return {alive:g.player.Alive,health:g.player.health,failed:r.failed,
      title:g.menu.el.titleMain.textContent,subtitle:g.menu.el.titleSub.textContent,
      items:g.menu.items.map(item=>item.id)};
  });
  assert.ok(companionFailure.alive && companionFailure.health===100 && companionFailure.failed);
  assert.equal(companionFailure.title,"任务失败","a living invincible player is never reported as killed by a squadmate's death");
  assert.ok(companionFailure.subtitle.includes("罗"));
  assert.deepEqual(companionFailure.items,["restartSandbox","exitSandbox"]);
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  await page.screenshot({path:path.join(out,"Scene_CompanionFailure.png")});
  // 阵亡页的「返回主菜单」同样先问一句；Esc 只收起确认框，仍停在失败页、不退关。
  await page.locator('#menu .mnItem[data-act="exitSandbox"]').click();
  const deathConfirm = await page.evaluate(() => ({ visible: !document.querySelector("#menu .mnConfirm").hidden,
    title: document.querySelector("#menu .mnConfirmTitle").textContent, focus: document.activeElement?.dataset.confirm }));
  assert.ok(deathConfirm.visible && deathConfirm.title === "返回主菜单？" && deathConfirm.focus === "cancel", JSON.stringify(deathConfirm));
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== "running"));
  await page.screenshot({path:path.join(out,"Scene_FailureExitConfirm.png")});
  await page.keyboard.press("Escape");
  const deathCancelled = await page.evaluate(() => ({ hidden: document.querySelector("#menu .mnConfirm").hidden,
    mode: window.Tengxian.menu.mode, whitebox: new URL(location.href).searchParams.get("whitebox") }));
  assert.ok(deathCancelled.hidden && deathCancelled.mode === "failure" && deathCancelled.whitebox === "p012", JSON.stringify(deathCancelled));
  // Explicit UI fixture: real runtime + pause adapter, not campaign completion evidence.
  await page.evaluate(async () => {
    const g = window.Tengxian;
    await g.Debug.FirstLevelJump(4);
    const r = g.Debug.FirstLevelMissionRuntime();
    const { MISSION_STAGES } = await import("./Data_FirstLevelMission.mjs");
    r.flow.index = MISSION_STAGES.findIndex(stage => stage.id === "Support");
    for (const id of r.flow.stage.requirements) r.flow.facts.delete(id);
    r.flow.Record("frontReached"); r.flow.Record("frontContact");
    r.frontArrivalAt = r.time - 17; r.frontArrivalShots = r.Inventory().shots;
    g.Debug.Pause();
  });
  assert.deepEqual(await page.locator(".mnPauseCondition").evaluateAll(rows => rows.map(row => row.dataset.condition)),
    ["frontReached", "rightNestCaptured", "frontContact", "frontRifleDefense", "rifleWithdrawalResolved", "leftGunHandover", "zhouLeftGun", "tankPreviewed"]);
  assert.equal(await page.locator(".mnPauseCondition").count(), 8);
  assert.equal(await page.locator(".mnPauseCondition.complete").count(), 2);
  assert.equal(await page.locator(".mnPauseProgressSummary").textContent(), "已达成 2 / 8 项");
  assert.match(await page.locator('[data-condition="frontRifleDefense"]').textContent(), /击退进攻组并解除撤退缺口的直接火力/);
  // 契约 §2.6：03 只等老周被扶离枪位；他走回集结处（zhouGunWounded）是 05 的背景条件。
  assert.equal(await page.locator('[data-condition="zhouLeftGun"]').count(), 1,
    "Support ends once Zhou is helped off the left gun");
  assert.equal(await page.locator('[data-condition="zhouGunWounded"]').count(), 0,
    "Zhou reaching the collection is no longer a Support condition");
  await page.screenshot({path:path.join(out,"Scene_MissionProgressDesktop.png")});
  for (const viewport of [{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(viewport);
    const bounds = await page.locator(".mnPauseObjective").boundingBox();
    const menuBounds = await page.locator(".mnList").boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
    assert.ok(bounds.y + bounds.height <= menuBounds.y || bounds.x >= menuBounds.x + menuBounds.width, "progress and pause buttons do not overlap");
    await page.locator('[data-condition="rifleWithdrawalResolved"]').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('[data-condition="rifleWithdrawalResolved"]').isVisible());
    await page.screenshot({path:path.join(out,`Scene_MissionProgress${viewport.width}.png`)});
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const g=window.Tengxian;
    g.Debug.FirstLevelMissionRuntime().flow.Record("frontRifleDefense");
    g.Debug.Pause();
  });
  assert.equal(await page.locator(".mnPauseCondition.complete").count(), 3, "reopening reads fresh mission facts");
  await page.evaluate(() => {
    const g=window.Tengxian, r=g.Debug.FirstLevelMissionRuntime();
    r.flow.index++; g.menu.Show("pause");
  });
  assert.deepEqual(await page.locator(".mnPauseCondition").evaluateAll(rows => rows.map(row => row.dataset.condition)),
    ["tankPositionPressured", "remainingGuardsGathered", "tankBlocksExit", "rightRearReached", "bundleOrderHeard"],
    "MachineGun exposes the adopted tank-pressure and retreat conditions");
  assert.equal(await page.locator(".mnPauseCondition").count(), 5, "new stage replaces all previous conditions");
  assert.equal(await page.locator('[data-condition="frontReached"]').count(), 0);
  assert.ok(await page.locator('[data-condition="tankPositionPressured"]').isVisible());
  await page.evaluate(() => {
    const g=window.Tengxian, r=g.Debug.FirstLevelMissionRuntime();
    while (!r.flow.completed) r.flow.index++;
    g.menu.Show("pause");
  });
  assert.equal(await page.locator(".mnPauseProgressSummary").textContent(), "当前任务已完成");
  assert.equal(await page.locator(".mnPauseCondition").count(), 0);
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, "Data_DeathMenu.json"), JSON.stringify({ setup, collapse, stances, frozen, restored, unavailable, companionFailure, errors }, null, 2));
  console.log("DeathMenuTest PASS: independent death state, frozen world, falling camera, mouse/Enter checkpoint recovery, pause regression and missing checkpoint");
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
