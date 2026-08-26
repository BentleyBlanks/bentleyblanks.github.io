// 《滕县 一九三八》可破坏场景预览编辑器冒烟。
//
// 这里专门锁三条产品契约：预览用的是真实七关与正式破坏链；承重白名单拆不动；
// 按 R / 退出不只补视觉，还要把 Rapier、射线、掩体和导航一起恢复。
//
// 用法：node Taierzhuang1938/Script_DestructionEditorTest.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 260)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 260)}`);
});

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

await page.goto(
  `http://127.0.0.1:${port}/Taierzhuang1938/?phase=5&quality=low&scale=small&menu=0`,
  { waitUntil: "load", timeout: 180000 },
);
await page.waitForFunction(() => window.Taierzhuang?.destruction && window.Taierzhuang?.editor,
  null, { timeout: 240000 });
await page.evaluate(() => window.Taierzhuang.StepFrames(20));

const gameplayGate = await page.evaluate(() => window.Taierzhuang.Debug.Destruction());
Check("进入编辑器前正式玩法破坏处于关闭状态", gameplayGate
  && !gameplayGate.gameplayEnabled && !gameplayGate.previewMode,
`gameplay=${gameplayGate?.gameplayEnabled} preview=${gameplayGate?.previewMode}`);

// 1. 从统一入口打开：标题、七关列表、自由相机与正式 DestructionSystem 全部就位。
const opened = await page.evaluate(() => {
  const T = window.Taierzhuang;
  T.editor.Open("destruction");
  T.StepFrames(3);
  const editor = T.editor.active;
  return {
    id: T.editor.ActiveId,
    capturing: T.editor.Capturing,
    fly: T.editor.flycam.Active,
    sameSystem: editor?.destruction === T.destruction,
    previewMode: T.destruction.Stats().previewMode,
    levels: editor?.levelList?.root?.children?.length || 0,
    title: document.querySelector(".edPanel.work .edTitle")?.textContent || "",
    text: document.querySelector(".edPanel.work")?.textContent || "",
  };
});
Check("入口打开专用破坏预览编辑器", opened.id === "destruction" && opened.capturing
  && opened.fly && opened.sameSystem && opened.previewMode,
`id=${opened.id} fly=${opened.fly} 正式系统=${opened.sameSystem} preview=${opened.previewMode}`);
Check("编辑器直接覆盖全部七个正式场景", opened.levels === 7,
  `关卡数=${opened.levels}`);
Check("工具面板提供检查、枪弹、炮弹、范围爆破与复原",
  opened.title.includes("可破坏场景预览")
  && ["检查", "枪弹", "炮弹", "范围爆破", "复原预览"].every((label) => opened.text.includes(label)),
opened.title);

// 2. 找一面普通墙，在编辑器里开真洞，再复原到完全一致的碰撞拓扑。
const wall = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const editor = T.editor.active;
  if (!editor.FocusWall()) return { missing: true };
  const box = editor.target.box;
  const point = editor.target.point.clone();
  const direction = editor.target.normal.clone().normalize();
  const half = box.h || [
    (box.max[0] - box.min[0]) * 0.5,
    (box.max[1] - box.min[1]) * 0.5,
    (box.max[2] - box.min[2]) * 0.5,
  ];
  const thickness = Math.min(half[0], half[2]);
  const origin = point.clone().addScaledVector(direction, -(thickness + 0.35));
  const maxDistance = thickness * 2 + 0.7;
  const Ray = () => T.battlefield.Raycast(origin, direction, maxDistance);
  const baseline = {
    colliders: T.battlefield.colliders.length,
    physics: T.physics.recordByHandle.size,
    covers: T.battlefield.covers.length,
    nav: T.nav.Stats().revisions,
    breaches: T.destruction.Stats().breaches,
    topology: T.destruction.Stats().topologyRebuilds,
  };
  const beforeRay = Ray();
  editor.shellEnergy = 2000;
  const vfxBefore = T.vfx.time;
  const hit = editor.ApplyTarget("shell");
  const fragment = T.destruction.fragmentStates[0];
  const fragmentBefore = fragment?.position.toArray() || null;
  T.StepFrames(3);
  const fragmentAfter = fragment?.position.toArray() || null;
  const afterRay = Ray();
  const openedHole = {
    result: hit,
    originalGone: !T.battlefield.colliders.includes(box),
    rayClear: afterRay === null,
    breaches: T.destruction.Stats().breaches,
    physicsChanged: T.physics.recordByHandle.size !== baseline.physics,
    breachLining: T.destruction.breachMesh.geometry.userData.hasThickness
      && !T.destruction.breachMesh.material.transparent,
    fragments: T.destruction.Stats().flyingFragments,
    fragmentMoved: fragmentBefore && fragmentAfter
      ? Math.hypot(fragmentAfter[0] - fragmentBefore[0], fragmentAfter[1] - fragmentBefore[1],
        fragmentAfter[2] - fragmentBefore[2])
      : 0,
    vfxAdvanced: T.vfx.time > vfxBefore,
    noOldRubble: !T.scene.getObjectByName("Destruction_Rubble"),
  };
  const reset = editor.ResetPreview();
  T.StepFrames(3);
  const restoredRay = Ray();
  const restored = {
    colliders: T.battlefield.colliders.length,
    physics: T.physics.recordByHandle.size,
    covers: T.battlefield.covers.length,
    nav: T.nav.Stats().revisions,
    breaches: T.destruction.Stats().breaches,
    topology: T.destruction.Stats().topologyRebuilds,
    originalBack: T.battlefield.colliders.includes(box),
    handleBack: box._physicsHandle != null
      && T.physics.recordByHandle.get(box._physicsHandle) === box,
    rayBlocked: restoredRay !== null,
    rayTag: restoredRay?.box?.tag || null,
  };
  return {
    tag: box.tag, profile: T.destruction.Profile(box).id,
    baseline, beforeRayBox: beforeRay?.box === box, openedHole, reset, restored,
  };
});
Check("普通墙使用正式炮击链形成局部物理破口", !wall.missing
  && wall.profile === "masonry" && wall.beforeRayBox
  && wall.openedHole.result?.broken && wall.openedHole.originalGone
  && wall.openedHole.rayClear && wall.openedHole.breaches === wall.baseline.breaches + 1,
wall.missing ? "当前关没有 wall" : `${wall.tag}/${wall.profile} 洞=${wall.openedHole?.breaches}`);
Check("编辑器暂停玩法时仍显示真实断面并推进飞散碎块", !wall.missing
  && wall.openedHole.breachLining && wall.openedHole.fragments === 36
  && wall.openedHole.fragmentMoved > 0.005 && wall.openedHole.vfxAdvanced
  && wall.openedHole.noOldRubble,
wall.missing ? "" : `碎块=${wall.openedHole.fragments} 位移=${Number(wall.openedHole.fragmentMoved).toFixed(3)}m 粉尘=${wall.openedHole.vfxAdvanced}`);
Check("复原同时恢复 Rapier、射线、掩体与导航", !wall.missing && wall.reset
  && wall.restored.originalBack && wall.restored.handleBack && wall.restored.rayBlocked
  && wall.restored.colliders === wall.baseline.colliders
  && wall.restored.physics === wall.baseline.physics
  && wall.restored.covers === wall.baseline.covers
  && wall.restored.nav === wall.baseline.nav
  && wall.restored.breaches === wall.baseline.breaches
  && wall.restored.topology === wall.baseline.topology,
wall.missing ? "" : `base=${JSON.stringify(wall.baseline)} restored=${JSON.stringify(wall.restored)}`);

// 3. 城墙 / 城垣 / 坡道 / 塔楼是承重白名单，一百万能量也不能摘碰撞体。
const structural = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const editor = T.editor.active;
  if (!editor.FocusStructural()) return { missing: true };
  const box = editor.target.box;
  const before = {
    colliders: T.battlefield.colliders.length,
    physics: T.physics.recordByHandle.size,
    handle: box._physicsHandle,
    breaches: T.destruction.Stats().breaches,
  };
  editor.shellEnergy = 1000000;
  const result = editor.ApplyTarget("shell");
  const after = {
    colliders: T.battlefield.colliders.length,
    physics: T.physics.recordByHandle.size,
    handle: box._physicsHandle,
    present: T.battlefield.colliders.includes(box),
    breaches: T.destruction.Stats().breaches,
  };
  return { tag: box.tag, profile: T.destruction.Profile(box), result, before, after };
});
Check("承重结构在预览器内明确保护", !structural.missing
  && !structural.profile?.destructible && structural.result?.protected
  && structural.after.present && structural.after.handle === structural.before.handle
  && structural.after.colliders === structural.before.colliders
  && structural.after.physics === structural.before.physics
  && structural.after.breaches === structural.before.breaches,
structural.missing ? "没有承重候选" : `${structural.tag}/${structural.profile?.id} protected=${structural.result?.protected}`);

// 4. 编辑器内换到北沙河，对桥面 / 站台开竖直洞；关闭编辑器必须恢复新关基线。
const floor = await page.evaluate(async () => {
  const T = window.Taierzhuang;
  const editor = T.editor.active;
  const switched = await editor.SwitchLevel(1);
  T.StepFrames(20);
  if (!switched || !editor.FocusTags(new Set(["bridge", "platform"]))) {
    return { missing: true, switched, phase: T.state.phaseIndex };
  }
  const box = editor.target.box;
  const c = box.c.slice();
  const h = box.h.slice();
  const origin = { x: c[0], y: c[1] + h[1] + 0.35, z: c[2] };
  const direction = { x: 0, y: -1, z: 0 };
  const maxDistance = h[1] * 2 + 0.7;
  const baseline = {
    colliders: T.battlefield.colliders.length,
    physics: T.physics.recordByHandle.size,
    breaches: T.destruction.Stats().breaches,
    nav: T.nav.Stats().revisions,
  };
  const beforeRay = T.battlefield.Raycast(origin, direction, maxDistance);
  editor.shellEnergy = 2000;
  const result = editor.ApplyTarget("shell");
  T.StepFrames(3);
  const openRay = T.battlefield.Raycast(origin, direction, maxDistance);
  const opened = {
    originalGone: !T.battlefield.colliders.includes(box),
    rayClear: openRay === null,
    breaches: T.destruction.Stats().breaches,
  };
  T.editor.Close();
  T.StepFrames(3);
  const restoredRay = T.battlefield.Raycast(origin, direction, maxDistance);
  const restored = {
    active: T.editor.ActiveId,
    previewMode: T.destruction.Stats().previewMode,
    colliders: T.battlefield.colliders.length,
    physics: T.physics.recordByHandle.size,
    breaches: T.destruction.Stats().breaches,
    nav: T.nav.Stats().revisions,
    originalBack: T.battlefield.colliders.includes(box),
    rayBlocked: restoredRay !== null,
    rayTag: restoredRay?.box?.tag || null,
  };
  return {
    switched, phase: T.state.phaseIndex, tag: box.tag,
    beforeRayBox: beforeRay?.box === box, result, baseline, opened, restored,
  };
});
Check("可在编辑器内切换真实场景并打穿楼板/桥面", !floor.missing
  && floor.switched && floor.phase === 1 && floor.beforeRayBox
  && floor.result?.broken && floor.opened.originalGone && floor.opened.rayClear
  && floor.opened.breaches === floor.baseline.breaches + 1,
floor.missing ? `切换=${floor.switched} phase=${floor.phase}` : `${floor.tag} ray=${floor.opened.rayClear ? "clear" : "blocked"}`);
Check("关闭编辑器自动复原当前场景", !floor.missing
  && floor.restored.active === null && !floor.restored.previewMode
  && floor.restored.originalBack && floor.restored.rayBlocked
  && floor.restored.colliders === floor.baseline.colliders
  && floor.restored.physics === floor.baseline.physics
  && floor.restored.breaches === floor.baseline.breaches
  && floor.restored.nav === floor.baseline.nav,
floor.missing ? "" : `base=${JSON.stringify(floor.baseline)} restored=${JSON.stringify(floor.restored)}`);

// 5. 若玩家进入编辑器前场景已经有战损，退出只撤销预览操作，不能把既有洞补掉。
const existingDamage = await page.evaluate(() => {
  const T = window.Taierzhuang;
  const preBox = T.battlefield.colliders.find((box) =>
    (box.tag === "bridge" || box.tag === "platform") && box.h && box.destruction?.destructible);
  if (!preBox) return { missing: true };
  const c = preBox.c.slice(), h = preBox.h.slice();
  const origin = { x: c[0], y: c[1] + h[1] + 0.35, z: c[2] };
  const direction = { x: 0, y: -1, z: 0 };
  const maxDistance = h[1] * 2 + 0.7;
  T.destruction.SetPreviewMode(true);
  const preHit = T.destruction.Hit(preBox, origin, 2000,
    { kind: "shell", normal: { x: 0, y: 1, z: 0 } });
  T.destruction.SetPreviewMode(false);
  T.physics.RefreshStaticQueries();
  T.destruction.Update(T.player.position);
  const preRayClear = T.battlefield.Raycast(origin, direction, maxDistance) === null;
  const baselineList = T.battlefield.colliders.slice();
  const baseline = {
    colliders: baselineList.length,
    physics: T.physics.recordByHandle.size,
    breaches: T.destruction.Stats().breaches,
    breachIds: T.destruction.breaches.map((breach) => breach.id).join(","),
  };

  T.editor.Open("destruction");
  const editor = T.editor.active;
  const second = T.battlefield.colliders.find((box) => {
    if (!box?.destruction?.destructible || box.destroyed) return false;
    const p = box.c || [(box.min[0] + box.max[0]) * 0.5, 0, (box.min[2] + box.max[2]) * 0.5];
    return Math.hypot(p[0] - c[0], p[2] - c[2]) > 12;
  });
  if (!second || !editor.FocusWhere((box) => box === second)) {
    T.editor.Close();
    return { missingSecond: true, preHit, baseline };
  }
  editor.shellEnergy = 2000;
  const previewHit = editor.ApplyTarget("shell");
  const during = T.destruction.Stats().breaches;
  T.editor.Close();
  T.StepFrames(3);
  const after = {
    colliders: T.battlefield.colliders.length,
    physics: T.physics.recordByHandle.size,
    breaches: T.destruction.Stats().breaches,
    breachIds: T.destruction.breaches.map((breach) => breach.id).join(","),
    sameList: T.battlefield.colliders.length === baselineList.length
      && T.battlefield.colliders.every((box, index) => box === baselineList[index]),
    preHoleStillOpen: !T.battlefield.colliders.includes(preBox)
      && T.battlefield.Raycast(origin, direction, maxDistance) === null,
  };
  return { preHit, preRayClear, previewHit, during, baseline, after };
});
Check("编辑器快照会保留进入前已有的战损", !existingDamage.missing
  && !existingDamage.missingSecond && existingDamage.preHit?.broken
  && existingDamage.preRayClear && existingDamage.previewHit?.broken
  && existingDamage.during > existingDamage.baseline.breaches
  && existingDamage.after.sameList && existingDamage.after.preHoleStillOpen
  && existingDamage.after.colliders === existingDamage.baseline.colliders
  && existingDamage.after.physics === existingDamage.baseline.physics
  && existingDamage.after.breaches === existingDamage.baseline.breaches
  && existingDamage.after.breachIds === existingDamage.baseline.breachIds,
existingDamage.missing ? "没有既有战损候选"
  : `洞 ${existingDamage.baseline?.breaches}→预览 ${existingDamage.during}→退出 ${existingDamage.after?.breaches}`);

const glError = await page.evaluate(() => {
  window.Taierzhuang.StepFrames(6);
  return window.Taierzhuang.renderer.getContext().getError();
});
Check("预览、复原与换关后的渲染管线健康", glError === 0, `gl=${glError}`);

await browser.close();
server.close();

const failed = results.filter((result) => !result.ok);
if (problems.length) {
  console.log(`\n运行时报错 ${problems.length} 条：`);
  for (const problem of problems.slice(0, 12)) console.log(`  ${problem}`);
}
if (failed.length || problems.length) {
  console.log(`\n破坏预览编辑器冒烟没过：${failed.length} 条断言 + ${problems.length} 条报错`);
  process.exit(1);
}
console.log("\n可破坏场景预览编辑器冒烟全过。");
