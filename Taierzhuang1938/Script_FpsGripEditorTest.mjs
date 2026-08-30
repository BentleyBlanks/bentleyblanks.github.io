// 第一人称持枪检查编辑器冒烟：真浏览器里逐类换装备、切玩家/外部视角、读取挂点与骨骼，
// 最后确认退出后父节点、玩家武器、相机和诊断节点全部还原。
//
// 用法：node Taierzhuang1938/Script_FpsGripEditorTest.mjs

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
    };
  });
  Check("独立第一人称持枪检查入口能打开",
    opened.opened && opened.active === "firstPerson" && opened.title.includes("第一人称持枪检查"),
    `active=${opened.active} / ${opened.title}`);
  Check("装备表不是单枪特例", opened.listCount >= 12, `可检查 ${opened.listCount} 项`);

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
