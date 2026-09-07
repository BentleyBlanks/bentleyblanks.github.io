import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

try {
  const port = server.address().port;
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/?phase=3&quality=low&scale=small&menu=0`,
    { waitUntil: "load", timeout: 120000 },
  );
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 180000 });

  const controls = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.editor.Open("controls");
    return {
      active: T.editor.ActiveId,
      rows: document.querySelectorAll(".edControlRow").length,
      text: document.querySelector(".edPanel.work")?.textContent || "",
    };
  });
  assert.equal(controls.active, "controls");
  assert.ok(controls.rows >= 16);
  assert.match(controls.text, /拾枪、换枪/);
  assert.match(controls.text, /包扎止血/);
  assert.match(controls.text, /M显示 \/ 隐藏战场地图/);

  const mapToggle = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.editor.TogglePanel(false);
    const minimap = document.querySelector(".hudMinimap");
    const snapshot = () => ({
      on: minimap.classList.contains("on"),
      display: getComputedStyle(minimap).display,
      ariaHidden: minimap.getAttribute("aria-hidden"),
    });
    const initial = snapshot();
    T.Debug.Key("KeyM");
    T.StepFrames(1, 1 / 60, false);
    const shown = snapshot();
    T.Debug.Key("KeyM");
    const hiddenAgain = snapshot();
    return { initial, shown, hiddenAgain };
  });
  assert.deepEqual(mapToggle.initial, { on: false, display: "none", ariaHidden: "true" });
  assert.deepEqual(mapToggle.shown, { on: true, display: "block", ariaHidden: "false" });
  assert.deepEqual(mapToggle.hiddenAgain, { on: false, display: "none", ariaHidden: "true" });
  assert.equal(await page.locator(".hudIdentity").count(), 0);

  const markers = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const project = () => ({x:400,y:200,dist:25,visible:true});
    T.hud.UpdateMarkers([{name:"Marker fixture",x:0,z:0,progress:0,owner:"nra"}],T.camera,project);
    const shown = document.querySelectorAll(".hudMarker").length;
    T.hud.UpdateMarkers([],T.camera,project);
    return {shown,cleared:document.querySelectorAll(".hudMarker").length};
  });
  assert.deepEqual(markers,{shown:1,cleared:0},"empty scene markers must remove previously visible DOM nodes");
  const identity=await page.evaluate(()=>{
    const T=window.Taierzhuang,card={key:"s2",kind:"friend",faction:"nra",title:"罗班长",meta:"25 岁 · 3m",health:null};
    T.hud.SetTarget(card,{targetDistance:false});
    const understated={meta:document.querySelector(".hudTarget .tMeta")?.textContent,state:T.hud.TargetState()};
    T.hud.SetTarget(card);
    return {understated,normal:T.hud.TargetState()};
  });
  assert.equal(identity.understated.state.meta,"25 岁","P012 name card carries no distance navigation");
  assert.equal(identity.understated.meta,"25 岁","rendered DOM agrees with the presentation state");
  assert.equal(identity.normal.meta,"25 岁 · 3m","normal chapter identity display is unchanged");

  const prompts = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.editor.TogglePanel(false);
    T.state.spawnAccumulator = -1e6;
    for (const soldier of T.ai.soldiers) {
      soldier.position.set(T.player.position.x + 300, soldier.position.y, T.player.position.z + 300);
    }
    T.player.health = 100;
    T.player.alive = true;
    T.player.bleeding = 0.4;
    T.player.bandages = 1;
    T.state.slots.primary = "HanYang";
    T.state.slots.secondary = "ServicePistol";
    T.state.ammo = 5;
    T.StepFrames(12);
    return {
      prompts: T.Debug.Prompts(),
      // 行上**只有按键字母**，汉字说明只留在 title 上
      rows: [...document.querySelectorAll(".hudAction")].map((row) => row.textContent),
      titles: [...document.querySelectorAll(".hudAction")].map((row) => row.title),
      icons: [...document.querySelectorAll(".hudAction .ico svg")].length,
      on: document.querySelector(".hudActions")?.classList.contains("on"),
    };
  });
  // 可装刺刀不构成眼前操作，X 不再常驻；其余提示保持既有条件。
  assert.deepEqual(prompts.prompts.map((prompt) => prompt.kind),
    ["bandage", "switchWeapon"]);
  assert.equal(prompts.on, true);
  assert.deepEqual(prompts.rows, ["B", "1 / 2"]);
  assert.equal(prompts.icons, 2);
  assert.ok(prompts.titles.some((title) => title === "包扎止血"));

  // COD《战争世界》式右下角：没有姿态人形与姿态按钮；投掷物数与弹药同一行；
  // 弹药块只在交互后亮几秒（IDLE_FADE.combatS），空膛 / 低弹钉住不淡。
  const combatHud = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const combat = document.querySelector(".hudCombat");
    const Awake = () => combat.classList.contains("awake");
    T.player.stance = "crouch";
    T.state.ammo = 5;
    T.state.clips = 3;
    T.StepFrames(3, 1 / 60, false);
    const changed = { awake: Awake(), ...T.hud.IdleState() };
    T.StepFrames(240, 1 / 60, false);              // 4 s 不碰任何东西
    const idle = { awake: Awake(), ...T.hud.IdleState() };
    T.hud.Touch("combat");                         // 扣扳机 / 开镜：数字没变也要亮
    T.StepFrames(1, 1 / 60, false);
    const touched = { awake: Awake(), ...T.hud.IdleState() };
    T.StepFrames(240, 1 / 60, false);
    const idleAgain = { awake: Awake(), ...T.hud.IdleState() };
    T.state.ammo = 1;                              // 低弹：钉住
    T.StepFrames(240, 1 / 60, false);
    const pinned = { awake: Awake(), ...T.hud.IdleState() };
    return {
      current: document.querySelector(".ammoCurrent")?.textContent,
      reserve: document.querySelector(".ammoReserve")?.textContent,
      low: combat.classList.contains("lowAmmo"),
      stanceNodes: document.querySelectorAll(".combatStance, [data-player-stance], .combatStanceChoices").length,
      grenadeCount: document.querySelector(".combatMain .combatEquipment .equipment.grenade b")?.textContent,
      grenadesHeld: String(Math.max(0, Math.floor(T.state.grenades || 0))),
      background: getComputedStyle(document.querySelector(".combatMain")).backgroundImage,
      strokeWidth: Number.parseFloat(getComputedStyle(document.querySelector(".ammoCurrent")).webkitTextStrokeWidth),
      changed, idle, touched, idleAgain, pinned,
    };
  });
  assert.equal(combatHud.current, "01");
  assert.equal(combatHud.reserve, "15");
  assert.equal(combatHud.low, true);
  assert.equal(combatHud.stanceNodes, 0, "HUD 不再显示站 / 蹲 / 趴");
  assert.equal(combatHud.grenadeCount, combatHud.grenadesHeld, "手榴弹数与弹药同一行，读的是身上真实的数");
  assert.equal(combatHud.background, "none", "COD 式弹药块没有底板");
  assert.ok(combatHud.strokeWidth >= 0.9, "弹药数字要有硬黑描边");
  assert.equal(combatHud.changed.awake, true, "弹药数一变就亮");
  assert.equal(combatHud.idle.awake, false, `几秒不交互就隐掉，实际 ${JSON.stringify(combatHud.idle)}`);
  assert.equal(combatHud.touched.awake, true, "Touch 之后要亮");
  assert.equal(combatHud.idleAgain.awake, false, "Touch 也会过期");
  assert.equal(combatHud.pinned.awake, true, "低弹钉住不淡");
  assert.equal(combatHud.pinned.combatPinned, true);

  const codObjective = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    T.hud.SetObjective("进入临时师部", 36, null);
    T.hud.SetObjective("向师部报告东关战况", 35, null);
    await new Promise(requestAnimationFrame);
    const objective = document.querySelector(".hudObjective");
    const objectiveText = objective.querySelector(".o");
    const updateText = objective.querySelector(".objectiveUpdate");
    const forceStatus = document.querySelector(".hudForceStatus");
    const style = getComputedStyle(objective);
    const textStyle = getComputedStyle(objectiveText);
    const updateStyle = getComputedStyle(updateText);
    const forceStyle = getComputedStyle(forceStatus);
    const box = objective.getBoundingClientRect();
    return {
      text: objectiveText?.textContent,
      update: updateText?.textContent,
      changed: objective.classList.contains("changed"),
      background: style.backgroundImage,
      filter: style.filter,
      animationName: style.animationName,
      animationDuration: Number.parseFloat(style.animationDuration),
      fontSize: Number.parseFloat(textStyle.fontSize),
      fontWeight: Number.parseInt(textStyle.fontWeight, 10),
      color: textStyle.color,
      strokeWidth: Number.parseFloat(textStyle.webkitTextStrokeWidth),
      updateTransform: updateStyle.transform,
      updateFontSize: Number.parseFloat(updateStyle.fontSize),
      updateFontWeight: Number.parseInt(updateStyle.fontWeight, 10),
      left: box.left,
      top: box.top,
      force: forceStatus?.textContent,
      forceFlashing: forceStatus?.classList.contains("flash"),
      forceIsIndependent: forceStatus?.parentElement?.id === "hud",
      forceBackground: forceStyle.backgroundImage,
      forceBorderRightWidth: forceStyle.borderRightWidth,
      oldMarkCount: objective.querySelectorAll(".objectiveMark, .forces").length,
    };
  });
  assert.equal(codObjective.text, "向师部报告东关战况");
  assert.equal(codObjective.update, "目标已更新");
  assert.equal(codObjective.changed, true);
  assert.equal(codObjective.background, "none");
  assert.equal(codObjective.filter, "none");
  assert.equal(codObjective.animationName, "hudObjectiveChanged");
  assert.ok(codObjective.animationDuration >= 6 && codObjective.animationDuration <= 7,
    `目标通知停留时长应接近 COD 实机，实际 ${codObjective.animationDuration}s`);
  assert.equal(codObjective.fontSize, 17);
  assert.equal(codObjective.fontWeight, 700);
  assert.match(codObjective.color, /^rgba\(/, "目标文字不能回退成不透明纯白");
  assert.ok(codObjective.strokeWidth >= 0.9, "COD 目标文字必须保留足够清楚的硬黑描边");
  assert.equal(codObjective.updateTransform, "none", "目标更新回执不得滑入抢视线");
  assert.equal(codObjective.updateFontSize, codObjective.fontSize, "两行应为 COD 式同级字号");
  assert.equal(codObjective.updateFontWeight, codObjective.fontWeight, "两行应为 COD 式同级字重");
  assert.ok(codObjective.left <= 12, `目标通知应贴近左上安全边，实际 left=${codObjective.left}`);
  assert.ok(codObjective.top >= 10 && codObjective.top <= 18,
    `目标通知纵向位置应贴近 COD 实机，实际 top=${codObjective.top}`);
  assert.equal(codObjective.force, "城中仍在坚守者：35 人");
  assert.equal(codObjective.forceFlashing, true);
  assert.equal(codObjective.forceIsIndependent, true);
  assert.equal(codObjective.forceBackground, "none");
  assert.equal(codObjective.forceBorderRightWidth, "0px");
  assert.equal(codObjective.oldMarkCount, 0);

  const objectiveLifetime = await page.evaluate(async () => {
    const objective = document.querySelector(".hudObjective");
    objective.getAnimations().find((animation) => animation.animationName === "hudObjectiveChanged")?.finish();
    const fadedOpacity = Number.parseFloat(getComputedStyle(objective).opacity);
    window.Taierzhuang.hud.ReplayObjective();
    await new Promise(requestAnimationFrame);
    const replayAnimation = objective.getAnimations()
      .find((animation) => animation.animationName === "hudObjectiveChanged");
    const replayed = objective.classList.contains("changed")
      && getComputedStyle(objective).animationName === "hudObjectiveChanged"
      && replayAnimation?.playState === "running"
      && replayAnimation.currentTime < 250;
    window.Taierzhuang.hud.SetObjective("", 35, null);
    await new Promise(requestAnimationFrame);
    return {
      fadedOpacity,
      replayed,
      blankChanged: objective.classList.contains("changed"),
      blankText: objective.querySelector(".o")?.textContent,
    };
  });
  assert.ok(objectiveLifetime.fadedOpacity <= 0.01, "COD 目标通知停留后应整块淡出");
  assert.equal(objectiveLifetime.replayed, true, "玩家取得控制权时应重新完整播放目标通知");
  assert.equal(objectiveLifetime.blankChanged, false, "空目标不得只闪出一行更新回执");
  assert.equal(objectiveLifetime.blankText, "");

  const controlHandoffReplay = await page.evaluate(async () => {
    const T = window.Taierzhuang;
    const boot = document.getElementById("boot");
    const objective = document.querySelector(".hudObjective");
    boot.classList.remove("gone");
    T.hud.SetObjective("守住主救护所", 35, null);
    objective.getAnimations().find((animation) => animation.animationName === "hudObjectiveChanged")?.finish();
    T.hud.SetObjective("守住主救护所", 35, null);
    boot.classList.add("gone");
    T.hud.SetObjective("守住主救护所", 35, null);
    await new Promise(requestAnimationFrame);
    return objective.getAnimations().some((animation) =>
      animation.animationName === "hudObjectiveChanged" && animation.playState === "running");
  });
  assert.equal(controlHandoffReplay, true, "加载遮罩退场时应重播首次目标通知");

  const weaponPrompts = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const victim = T.ai.soldiers.find((soldier) => soldier.alive) || T.ai.soldiers[0];
    if (!victim) return null;
    victim.weaponId = "Type38";
    victim.position.set(T.player.position.x + 1, T.player.position.y, T.player.position.z);
    if (victim.alive) victim.Kill();
    if (!victim.drop) victim.drop = { weaponId: "Type38", clips: 0, taken: false };
    victim.drop.weaponId = "Type38";
    victim.drop.taken = false;
    T.StepFrames(12);
    const swap = T.Debug.Prompts();
    T.state.slots.primary = null;
    T.StepFrames(12);
    const pickup = T.Debug.Prompts();
    return { swap, pickup };
  });
  assert.ok(weaponPrompts);
  assert.ok(weaponPrompts.swap.some((prompt) => prompt.keys === "F" && /^换上 /.test(prompt.label)));
  assert.ok(weaponPrompts.pickup.some((prompt) => prompt.keys === "F" && /^拾起 /.test(prompt.label)));

  const cleared = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.player.bleeding = 0;
    T.player.bandages = 0;
    // 装得上刺刀的步枪在手，闲时依然不显示 X。
    T.interact.hooks.TakeWeapon("HanYang", 2);
    for (const soldier of T.ai.soldiers) {
      if (!soldier.alive && soldier.drop) soldier.drop.taken = true;
    }
    T.state.slots.secondary = null;
    T.StepFrames(12);
    return { prompts: T.Debug.Prompts(), on: document.querySelector(".hudActions")?.classList.contains("on") };
  });
  assert.deepEqual(cleared.prompts, []);
  assert.equal(cleared.on, false);

  const objectiveChannel = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.hud.Hint("即时反馈保留位", 10);
    T.Debug.CompleteLevel();
    return {
      hint: document.querySelector(".hudHint")?.textContent,
      objective: document.querySelector(".hudObjective .o")?.textContent,
    };
  });
  assert.equal(objectiveChannel.hint, "即时反馈保留位");
  assert.ok(objectiveChannel.objective);
  assert.deepEqual(errors, []);
  console.log("ok  操作面板与情境 HUD 浏览器验证通过");
} finally {
  await browser.close();
  server.close();
}
