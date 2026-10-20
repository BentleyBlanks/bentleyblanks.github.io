// 第一人称持枪检查编辑器冒烟：真浏览器里逐类换装备、切玩家/外部视角、读取挂点与骨骼，
// 最后确认退出后父节点、玩家武器、相机和诊断节点全部还原。
//
// 用法：node Taierzhuang1938/Script_FpsGripEditorTest.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { WeaponShelved } from "./Data_Weapons.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 260)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 260)}`);
});

const checks = [];
function Check(name, ok, detail = "") {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=medium&scale=small&phase=5&menu=0`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 240000 });
  await page.click("#bootStart");
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));

  const before = await page.evaluate(() => {
    const T = window.Taierzhuang;
    return {
      weaponId: T.viewmodel.weaponId,
      variant: T.viewmodel.weaponVariant,
      rootParentIsCamera: T.viewmodel.root.parent === T.camera,
      visible: T.viewmodel.root.visible,
      fov: T.camera.fov,
      position: T.viewmodel.root.position.toArray(),
      quaternion: T.viewmodel.root.quaternion.toArray(),
    };
  });

  const opened = await page.evaluate(() => {
    const editor = window.Taierzhuang.Debug.OpenEditor("firstPerson");
    window.Taierzhuang.StepFrames(12);
    return {
      opened: !!editor,
      active: window.Taierzhuang.Debug.Editor().active,
      title: document.querySelector(".edPanel.work .edTitle")?.textContent || "",
      listCount: document.querySelectorAll(".edPanel.work .edList .it").length,
      supportedWeapons: window.Taierzhuang.editor.active.Snapshot().supportedWeapons,
    };
  });
  Check("独立第一人称持枪检查入口能打开",
    opened.opened && opened.active === "firstPerson" && opened.title.includes("第一人称持枪检查"),
    `active=${opened.active} / ${opened.title}`);
  // C96、匕首及晚于战役的武器已从主干退役；核对实际装备集合，避免陈旧数量门槛。
  // 手枪暂时停用（Data_Weapons.SHELVED_WEAPONS），不进持枪检查。
  const expectedWeapons = ["ZhongZheng", "HanYang", "Type38", "Zb26", "Type11",
    "ServicePistol", "Grenade", "GrenadeBundle", "Dadao", "OfficerSwordSet"].filter((id) => !WeaponShelved(id));
  Check(`装备表完整覆盖当前 ${expectedWeapons.length} 种第一人称装备`,
    opened.listCount === expectedWeapons.length
      && [...opened.supportedWeapons].sort().join(",") === [...expectedWeapons].sort().join(","),
    `可检查 ${opened.listCount} 项：${opened.supportedWeapons.join(", ")}`);

  const reports = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const editor = T.editor.active;
    const out = [];
    for (const id of editor.Snapshot().supportedWeapons) {
      editor.SetWeapon(id);
      T.StepFrames(24);
      out.push(editor.Snapshot());
    }
    return out;
  });

  for (const report of reports) {
    const grips = report.gripResidual;
    Check(`${report.weaponId} 直接驱动正片 Viewmodel`,
      report.rigSource?.includes("riggedArms") && report.writeBack === false,
      `${report.rigSource} / writeBack=${report.writeBack}`);
    Check(`${report.weaponId} 至少给出枪口和双手挂点`,
      ["muzzle", "gripR", "gripL"].every((name) => report.mountNames.includes(name)),
      report.mountNames.join(", "));
    Check(`${report.weaponId} 能量出双掌到 IK 目标的残差`,
      Number.isFinite(grips.right?.meters) && Number.isFinite(grips.left?.meters)
        && Number.isFinite(grips.right?.degrees) && Number.isFinite(grips.left?.degrees),
      `右 ${grips.right?.meters}m/${grips.right?.degrees}° · 左 ${grips.left?.meters}m/${grips.left?.degrees}°`);
  }

  const views = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const editor = T.editor.active;
    editor.SetWeapon("ZhongZheng");
    editor.SetView("inspect");
    editor.SetInspectPreset("rightRear");
    T.StepFrames(18);
    const inspect = {
      state: editor.Snapshot(),
      parentIsStand: T.viewmodel.root.parent === editor.studio.stand,
      markerLabels: [...document.querySelectorAll(".edFpsMountLabel")]
        .filter((element) => !element.hidden).length,
      skeletonVisible: !!editor.skeletonHelper?.visible,
    };
    editor.SetView("player");
    T.StepFrames(18);
    const player = {
      state: editor.Snapshot(),
      parentIsCamera: T.viewmodel.root.parent === T.camera,
    };
    return { inspect, player };
  });
  Check("外部检查把同一棵 Viewmodel 临时移到摄影棚",
    views.inspect.parentIsStand && views.inspect.state.view === "inspect",
    `parent=${views.inspect.state.rootParent}`);
  Check("外部检查同时显示挂点标签与骨骼",
    views.inspect.markerLabels >= 5 && views.inspect.skeletonVisible,
    `可见标签=${views.inspect.markerLabels}`);
  Check("切回玩家视角重新挂回正式相机",
    views.player.parentIsCamera && views.player.state.view === "player",
    `parent=${views.player.state.rootParent}`);

  // 大刀没有 Blender 骨骼片段：时间轴列的是程序动作，面板的滑杆 / 按钮要真的驱动正片挥刀。
  const timeline = await page.evaluate(() => {
    const T = window.Taierzhuang;
    const editor = T.editor.active;
    const vm = T.viewmodel;
    editor.SetWeapon("Dadao");
    editor.SetView("player");
    editor.SetPose("hip");
    for (let i = 0; i < 30; i += 1) editor.Update(1 / 60);
    const options = [...editor.animationSelect.options].map((option) => [option.value, option.textContent]);
    const guard = vm.weaponMount.quaternion.clone();
    const Button = (label) => [...editor.panel.root.querySelectorAll("button")].find((button) => button.textContent === label);
    const slider = editor.animationPosition.root.querySelector("input");
    slider.value = "0.46";
    slider.dispatchEvent(new Event("input"));
    const dragged = editor.Snapshot().animation;
    const turned = 2 * Math.acos(Math.min(1, Math.abs(vm.weaponMount.quaternion.dot(guard)))) * 180 / Math.PI;
    const wrist = Math.max(vm.riggedArms.wristBend.r, vm.riggedArms.wristBend.l);
    Button("后一帧").click();
    const stepped = editor.Snapshot().animation;
    Button("播放").click();
    for (let i = 0; i < 12; i += 1) editor.Update(1 / 60);
    const played = editor.Snapshot().animation;
    Button("暂停").click();
    const paused = editor.Snapshot().animation;
    Button("实时输入").click();
    for (let i = 0; i < 4; i += 1) editor.Update(1 / 60);
    return { options, dragged, turned, wrist, stepped, played, paused,
      cleared: editor.Snapshot().animation?.source === "ProceduralAction", action: vm.action?.kind || null };
  });
  Check("大刀时间轴列出劈砍程序动作",
    timeline.options.some(([value, label]) => value === "action:melee" && label.includes("大刀劈砍")),
    timeline.options.map((option) => option.join("=")).join(", "));
  Check("拖动播放位置把正片挥刀钉在该进度",
    timeline.dragged?.source === "ProceduralAction" && !timeline.dragged.playing
      && Math.abs(timeline.dragged.time / timeline.dragged.duration - 0.46) < 0.002 && timeline.turned > 30,
    `${timeline.dragged?.time?.toFixed(3)}/${timeline.dragged?.duration} s · 刀转 ${timeline.turned.toFixed(1)}°`);
  Check("拖动后的姿势守住腕弯上限", timeline.wrist <= 65.01, `${timeline.wrist.toFixed(1)}°`);
  Check("后一帧前进一帧", timeline.stepped?.frame === timeline.dragged.frame + 1,
    `${timeline.dragged.frame} → ${timeline.stepped?.frame}`);
  Check("播放 / 暂停驱动程序动作时钟",
    timeline.played?.playing && timeline.played.time > timeline.stepped.time && !timeline.paused?.playing,
    `${timeline.stepped?.time?.toFixed(3)} → ${timeline.played?.time?.toFixed(3)} s`);
  Check("实时输入收掉钉住的动作", !timeline.cleared && timeline.action === null,
    `仍在程序动作=${timeline.cleared} action=${timeline.action}`);

  const restored = await page.evaluate(() => {
    const T = window.Taierzhuang;
    T.editor.Close();
    T.StepFrames(3);
    return {
      weaponId: T.viewmodel.weaponId,
      variant: T.viewmodel.weaponVariant,
      rootParentIsCamera: T.viewmodel.root.parent === T.camera,
      visible: T.viewmodel.root.visible,
      fov: T.camera.fov,
      position: T.viewmodel.root.position.toArray(),
      quaternion: T.viewmodel.root.quaternion.toArray(),
      markerCount: T.scene.getObjectsByProperty("name", "FpsGripEditorSkeleton", []).length
        + T.viewmodel.root.getObjectsByProperty("name", "FpsGripEditorMarkers", []).length,
      domCount: document.querySelectorAll(".edFpsMountHud, .edFpsLegend").length,
      clean: document.body.classList.contains("edFpsClean"),
    };
  });
  const CloseArray = (a, b) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-6);
  Check("退出还原玩家武器与视图模型父节点",
    restored.weaponId === before.weaponId && restored.variant === before.variant
      && restored.rootParentIsCamera === before.rootParentIsCamera && restored.visible === before.visible,
    `${before.weaponId}/${before.variant} → ${restored.weaponId}/${restored.variant}`);
  Check("退出还原相机与 Viewmodel 局部变换",
    Math.abs(restored.fov - before.fov) < 1e-6
      && CloseArray(restored.position, before.position) && CloseArray(restored.quaternion, before.quaternion),
    `FOV ${before.fov} → ${restored.fov}`);
  Check("退出清掉骨骼、挂点、标签与净屏状态",
    restored.markerCount === 0 && restored.domCount === 0 && !restored.clean,
    `3D=${restored.markerCount} / DOM=${restored.domCount} / clean=${restored.clean}`);
  Check("页面无运行时错误", errors.length === 0, errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  server.close();
}

const failed = checks.filter((entry) => !entry.ok).length;
console.log(`\n第一人称持枪检查编辑器：${checks.length - failed}/${checks.length} 过`);
process.exit(failed ? 1 : 0);
