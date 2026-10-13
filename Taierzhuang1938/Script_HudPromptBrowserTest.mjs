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
    `http://127.0.0.1:${port}/Taierzhuang1938/?phase=3&quality=low&scale=small&manual=1`,
    { waitUntil: "load", timeout: 120000 },
  );
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready && window.Taierzhuang?.Debug?.MenuAct, null, { timeout: 180000 });

  await page.evaluate(() => {
    const T=window.Taierzhuang;T.menu.OpenPause();T.Debug.MenuAct("settings");
  });
  await page.locator('#menu [data-setting="controls"]').click();

  const controls = await page.evaluate(() => {
    const T = window.Taierzhuang;
    return {
      active: T.Debug.Editor().settings,
      rows: document.querySelectorAll("#settingsRoot .edControlRow").length,
      text: document.querySelector("#settingsRoot .edPanel.work")?.textContent || "",
    };
  });
  assert.equal(controls.active, "controls");
  assert.ok(controls.rows >= 16);
  assert.match(controls.text, /拾枪、换枪/);
  assert.match(controls.text, /包扎止血/);
  assert.match(controls.text, /M显示 \/ 隐藏战场地图/);
  await page.locator('#settingsRoot .edPanel.work .edX').click();
  await page.evaluate(() => window.Taierzhuang.Debug.MenuAct("resume"));
  assert.equal(await page.evaluate(() => window.Taierzhuang.menu.open),false,"settings closes back into the live game");

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
    const understated={meta:document.querySelector(".hudTarget .tMeta")?.textContent,state:T.hud.TargetState(),
      family:getComputedStyle(document.querySelector(".hudTarget .tTitle")).fontFamily};
    T.hud.SetTarget(card);
    return {understated,normal:T.hud.TargetState()};
  });
  assert.equal(identity.understated.state.meta,"25 岁","P012 name card carries no distance navigation");
  assert.equal(identity.understated.meta,"25 岁","rendered DOM agrees with the presentation state");
  assert.match(identity.understated.family,/^"?TzTitleText/,"识别卡的名字与岁数用 logo 同款字体");
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
    T.state.ammo = 5;
    T.StepFrames(12);
    const row = document.querySelector(".hudAction");
    const rowStyle = row && getComputedStyle(row);
    const box = document.querySelector(".hudActions").getBoundingClientRect();
    return {
      prompts: T.Debug.Prompts(),
      // COD WWII 式：键帽 + 一句动作，无底板，居中在准星正下方
      rows: [...document.querySelectorAll(".hudAction")].map((el) =>
        [el.querySelector("kbd")?.textContent, el.querySelector(".actionText")?.textContent]),
      titles: [...document.querySelectorAll(".hudAction")].map((el) => el.title),
      on: document.querySelector(".hudActions")?.classList.contains("on"),
      rowBox: rowStyle && [rowStyle.borderTopWidth, rowStyle.backgroundColor],
      labelPx: rowStyle && Number.parseFloat(rowStyle.fontSize),
      family: rowStyle && rowStyle.fontFamily,
      subtitleFamily: getComputedStyle(document.querySelector(".hudSubtitle")).fontFamily,
      fontLoaded: document.fonts.check('900 12px "TzTitleText"', "装弹"),
      centerX: box.left + box.width / 2, top: box.top, viewW: innerWidth, viewH: innerHeight,
    };
  });
  // 可装刺刀不构成眼前操作，X 不再常驻；换枪数字键也不常驻（COD 式）；其余提示保持既有条件。
  assert.deepEqual(prompts.prompts.map((prompt) => prompt.kind), ["bandage"]);
  assert.equal(prompts.on, true);
  assert.deepEqual(prompts.rows, [["B", "包扎止血"]]);
  assert.deepEqual(prompts.rowBox, ["0px", "rgba(0, 0, 0, 0)"], "提示没有外框与底板");
  // Selected D gives the solitary bandage action a readable lower-middle anchor.
  const expectPx = Math.min(22, Math.max(11, prompts.viewH * 0.02));
  assert.ok(Math.abs(prompts.labelPx - expectPx) < 0.1, `提示字号应为 ${expectPx.toFixed(1)} px，实际 ${prompts.labelPx}`);
  assert.match(prompts.family, /^"?TzTitleText/, "提示用 logo 同款字体");
  assert.match(prompts.subtitleFamily, /^"?TzTitleText/, "字幕用 logo 同款字体");
  assert.ok(Math.abs(prompts.centerX - prompts.viewW / 2) < 2
    && prompts.top >= prompts.viewH * .64 && prompts.top <= prompts.viewH * .69,
    `提示应居中在准星下方：${JSON.stringify(prompts)}`);
  assert.ok(prompts.titles.some((title) => title === "包扎止血"));

  // 打空且有备弹：提示条要出现红色的「R 装弹」。
  const emptyGun = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.player.bleeding = 0;
    T.state.activeSlot = "primary";
    T.state.ammo = 0;
    T.state.clips = 3;
    T.StepFrames(12);
    const withReserve = T.Debug.Prompts();
    const reloadRow = document.querySelector(".hudAction.reload .actionText");
    const reloadColor = reloadRow && getComputedStyle(reloadRow).color;
    T.state.clips = 0;
    T.StepFrames(12);
    const noReserve = T.Debug.Prompts();
    T.state.ammo = 5;
    T.state.clips = 3;
    T.player.bleeding = 0.4;
    T.StepFrames(12);
    return { withReserve, noReserve, reloadColor };
  });
  assert.ok(emptyGun.withReserve.some((prompt) => prompt.keys === "R" && prompt.label === "装弹"),
    `打空有备弹要提示 R 装弹：${JSON.stringify(emptyGun.withReserve)}`);
  assert.equal(emptyGun.reloadColor, "rgb(232, 80, 91)", "装弹那一行是红字");
  assert.ok(!emptyGun.noReserve.some((prompt) => prompt.keys === "R"),
    `没备弹不提示 R：${JSON.stringify(emptyGun.noReserve)}`);

  // COD《战争世界》式右下角：没有姿态人形与姿态按钮；投掷物数与弹药同一行；
  // 弹药块只在交互后亮几秒（IDLE_FADE.combatS），空膛 / 低弹钉住不淡。
  const combatHud = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const combat = document.querySelector(".hudCombat");
    const Awake = () => combat.classList.contains("awake");
    // 要连着空跑两轮 IDLE_FADE（6 s）再加低弹那一段，phase=3 的敌人会把人打死，
    // 换人时弹匣补满，低弹那一格就读成满弹。量 HUD 不量挨打：先无敌。
    const wasInvincible = T.player.debug.invincible;
    T.player.debug.invincible = true;
    T.player.stance = "crouch";
    T.state.ammo = 5;
    T.state.clips = 3;
    T.StepFrames(3, 1 / 60, false);
    const changed = { awake: Awake(), ...T.hud.IdleState() };
    T.StepFrames(420, 1 / 60, false);              // 7 s 不碰任何东西
    const idle = { awake: Awake(), ...T.hud.IdleState() };
    T.hud.Touch("combat");                         // 扣扳机 / 开镜：数字没变也要亮
    T.StepFrames(1, 1 / 60, false);
    const touched = { awake: Awake(), ...T.hud.IdleState() };
    T.StepFrames(420, 1 / 60, false);
    const idleAgain = { awake: Awake(), ...T.hud.IdleState() };
    T.state.ammo = 1;                              // 低弹：钉住
    T.StepFrames(240, 1 / 60, false);
    const pinned = { awake: Awake(), ...T.hud.IdleState() };
    T.player.debug.invincible = wasInvincible;
    return {
      current: document.querySelector(".ammoCurrent")?.textContent,
      reserve: document.querySelector(".ammoReserve")?.textContent,
      low: combat.classList.contains("lowAmmo"),
      stanceNodes: document.querySelectorAll(".combatStance, [data-player-stance], .combatStanceChoices").length,
      grenadeCount: document.querySelector(".combatMain .combatEquipment .equipment.grenade b")?.textContent,
      grenadesHeld: String(Math.max(0, Math.floor(T.state.grenades || 0))),
      background: getComputedStyle(document.querySelector(".combatMain")).backgroundImage,
      strokeWidth: Number.parseFloat(getComputedStyle(document.querySelector(".ammoCurrent")).webkitTextStrokeWidth),
      ammoFont: getComputedStyle(document.querySelector(".ammoCurrent")).fontFamily,
      ammoShadow: getComputedStyle(document.querySelector(".ammoCurrent")).textShadow,
      equipmentSeparator: getComputedStyle(document.querySelector(".combatEquipment")).borderRightWidth,
      changed, idle, touched, idleAgain, pinned,
    };
  });
  assert.equal(combatHud.current, "01");
  assert.equal(combatHud.reserve, "15");
  assert.equal(combatHud.low, true);
  assert.equal(combatHud.stanceNodes, 0, "HUD 不再显示站 / 蹲 / 趴");
  assert.equal(combatHud.grenadeCount, combatHud.grenadesHeld, "手榴弹数与弹药同一行，读的是身上真实的数");
  assert.equal(combatHud.background, "none", "COD 式弹药块没有底板");
  assert.equal(combatHud.strokeWidth, 0, "selected B uses soft shadow instead of a heavy black outline");
  assert.match(combatHud.ammoFont, /Georgia/, "selected B has serif ammunition numerals");
  assert.notEqual(combatHud.ammoShadow, "none", "ivory ammo remains readable against bright terrain");
  assert.equal(combatHud.equipmentSeparator, "1px", "grenade silhouettes have a fine separator from ammo");
  assert.equal(combatHud.changed.awake, true, "弹药数一变就亮");
  assert.equal(combatHud.idle.awake, false, `几秒不交互就隐掉，实际 ${JSON.stringify(combatHud.idle)}`);
  assert.equal(combatHud.touched.awake, true, "Touch 之后要亮");
  assert.equal(combatHud.idleAgain.awake, false, "Touch 也会过期");
  assert.equal(combatHud.pinned.awake, true, "低弹钉住不淡");
  assert.equal(combatHud.pinned.combatPinned, true);

  const grenadeReadouts = await page.evaluate(() => [0,1,2,4,7].map(grenades => {
    window.Taierzhuang.hud.SetState({ammo:5,clips:3,magazine:5,grenades});
    const item=document.querySelector(".equipment.grenade"), count=item.querySelector("b");
    return {grenades,visible:[...item.querySelectorAll("svg")].filter(svg=>getComputedStyle(svg).display!=="none").length,
      label:item.getAttribute("aria-label"),count:count.textContent,overflow:item.classList.contains("overflow"),
      countWidth:count.getBoundingClientRect().width,opacity:+getComputedStyle(item).opacity};
  }));
  assert.deepEqual(grenadeReadouts.map(item=>item.visible),[1,1,2,4,1],"real grenade counts use bounded silhouettes and numeric overflow");
  for (const item of grenadeReadouts) {
    assert.equal(item.count,String(item.grenades));
    assert.equal(item.label,`手榴弹 ${item.grenades}`,"screen readers retain the exact grenade count");
    assert.equal(item.overflow,item.grenades>4);
    assert.ok(item.grenades>4 ? item.countWidth>4 : item.countWidth<=1,"only overflow needs a visible number");
  }
  assert.ok(grenadeReadouts[0].opacity<=.31,"empty grenade slot retains a dim silhouette");

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
      updateWidth: updateText.getBoundingClientRect().width,
      updateClip: updateStyle.clipPath,
      symbolCount: objective.querySelectorAll(".objectiveSymbol").length,
      rule: style.borderBottomWidth,
      shadow: textStyle.textShadow,
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
  assert.ok(codObjective.fontSize>=14&&codObjective.fontSize<=18,"selected objective stays small and readable at 720p");
  assert.equal(codObjective.fontWeight, 600);
  assert.match(codObjective.color, /^rgba\(/, "目标文字不能回退成不透明纯白");
  assert.equal(codObjective.strokeWidth,0,"selected objective uses a soft shadow without a hard outline");
  assert.notEqual(codObjective.shadow,"none");
  assert.equal(codObjective.updateTransform, "none", "目标更新回执不得滑入抢视线");
  assert.ok(codObjective.updateWidth<=1&&codObjective.updateClip!=="none","update acknowledgement stays accessible without adding a second visible row");
  assert.equal(codObjective.symbolCount,1);
  assert.equal(codObjective.rule,"1px");
  assert.ok(codObjective.left>=36&&codObjective.left<=64,`selected objective has a calm left safe margin: ${codObjective.left}`);
  assert.ok(codObjective.top>=42&&codObjective.top<=64,`selected objective has a calm top safe margin: ${codObjective.top}`);
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
    // Archived slices no longer promise a live soldier roster. Use the real ground-weapon
    // path, as WeaponPickupTest does, so this fixture tests HUD pickup semantics directly.
    T.player.yaw=0;T.player.pitch=-.6;T.player.stance="stand";
    T.Debug.DropWeapon("Type38",{x:T.player.position.x,z:T.player.position.z-1.1,yaw:Math.PI/2,ammo:4});
    // 主、副武器都满了才是「换上」；空着副武器槽是「拾起」（COD 式两枪槽）。
    T.state.slots.secondary = "ZhongZheng";
    T.StepFrames(12);
    const swap = T.Debug.Prompts();
    const img = document.querySelector(".hudAction.pickup img.actionWeapon");
    const silhouette = img && { src: img.getAttribute("src"), width: img.getBoundingClientRect().width,
      em: Number.parseFloat(getComputedStyle(img).fontSize) };
    const target = document.querySelector(".hudTarget");
    const layout = {
      promptsBottom: document.querySelector(".hudActions").getBoundingClientRect().bottom,
      targetTop: target.getBoundingClientRect().top, targetOn: target.classList.contains("on"),
    };
    const row = document.querySelector(".hudAction.pickup");
    const rendered = row && [row.querySelector("kbd")?.textContent, row.querySelector(".actionText")?.textContent];
    T.state.slots.primary = null;
    T.StepFrames(12);
    const pickup = T.Debug.Prompts();
    return { swap, pickup, silhouette, layout, rendered };
  });
  assert.ok(weaponPrompts);
  // 2026-09-29 用户改口径：拾起 / 换上单击 F，键帽 F + 「换上 三八式」（不再有「长按」）。
  // 此前（2026-09-15 起）是 COD 的「Hold F to swap」：keys「按住 F」、渲染成 ["F", "长按换上 三八式"]。
  assert.ok(weaponPrompts.swap.some((prompt) => prompt.keys === "F" && /^换上 /.test(prompt.label)),
    JSON.stringify(weaponPrompts.swap));
  assert.deepEqual(weaponPrompts.rendered, ["F", "换上 三八式"]);
  assert.ok(weaponPrompts.swap.some((prompt) => prompt.weaponId === "Type38"), "换枪提示带着那把枪的 id");
  assert.equal(weaponPrompts.silhouette?.src, "Texture/Hud/Texture_HudWeapon_Type38.png", "换枪提示下面画那把枪的剪影");
  assert.ok(weaponPrompts.silhouette.width > weaponPrompts.silhouette.em * 6, `步枪剪影要约七个字宽：${JSON.stringify(weaponPrompts.silhouette)}`);
  if (weaponPrompts.layout.targetOn) {
    assert.ok(weaponPrompts.layout.targetTop >= weaponPrompts.layout.promptsBottom - 1,
      `识别卡要排在提示下面：${JSON.stringify(weaponPrompts.layout)}`);
  }
  assert.ok(weaponPrompts.pickup.some((prompt) => prompt.keys === "F" && /^拾起 /.test(prompt.label)));

  const cleared = await page.evaluate(() => {
    const T = window.Taierzhuang;
    // Consume the fixture's ground weapon through the real tap-F path before testing idle HUD.
    T.Debug.Key("KeyF",true);T.StepFrames(1,1/60,false);
    T.Debug.Key("KeyF",false);T.StepFrames(12,1/60,false);
    T.player.bleeding = 0;
    T.player.bandages = 0;
    // 装得上刺刀的步枪在手，闲时依然不显示 X。
    T.interact.hooks.TakeWeapon("HanYang", 2);
    for (const soldier of T.ai.soldiers) {
      if (!soldier.alive && soldier.drop) soldier.drop.taken = true;
    }
    T.state.slots.secondary = null;
    T.player.yaw=Math.PI;T.player.pitch=0;
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
