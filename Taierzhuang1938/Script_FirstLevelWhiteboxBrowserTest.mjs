// 第一关策划白盒真浏览器验收：纯白受光材质、正式第一章内容、实体剧情门与简洁 HUD。

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
  if (/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) return;
  errors.push(`CONSOLE ${message.text().slice(0, 260)} ${message.location()?.url || ""}`);
});

function Check(condition, message, detail = "") {
  if (!condition) throw new Error(`${message}${detail ? `：${detail}` : ""}`);
  console.log(`ok  ${message}${detail ? ` — ${detail}` : ""}`);
}

try {
  // 下面用 StepFrames 量首敌出现和存活窗口；不能让真实 RAF 在两次采样之间额外推进。
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=1&shot=1&manual=1&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 180000 });
  const initial = await page.evaluate(() => {
    const T = window.Tengxian;
    T.player.debug.invincible = true;
    T.StepFrames(3);
    const characterMaterials = new Set();
    const characterPbr = {
      meshes: 0, materials: 0, configured: true,
      nonMetal: true, roughEnough: true, shadowReady: true,
    };
    for (const soldier of (T.ai?.soldiers || [])) {
      soldier.actor?.characterRig?.root?.traverse((object) => {
        if (!object.isMesh || object.userData.characterPbrSurface !== true) return;
        characterPbr.meshes += 1;
        characterPbr.shadowReady &&= object.userData.actorOriginalCastShadow === true
          && object.receiveShadow === true;
        for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
          if (!material?.isMeshStandardMaterial && !material?.isMeshPhysicalMaterial) continue;
          characterMaterials.add(material);
        }
      });
    }
    for (const material of characterMaterials) {
      characterPbr.configured &&= material.userData.externalPbrConfigured === true;
      characterPbr.nonMetal &&= material.metalness === 0;
      characterPbr.roughEnough &&= material.roughness >= 0.58;
    }
    characterPbr.materials = characterMaterials.size;
    return {
      state: T.Debug.Whitebox(),
      characterPbr,
      visibleMarkers: [...document.querySelectorAll(".hudMarker")]
        .filter((el) => el.style.display !== "none").length,
      oldGuideDom: document.querySelectorAll(".hudWorldAnnotation,.hudBoundaryWarning").length,
    };
  });
  Check(initial.state.phase === "FirstLevelWhitebox", "直达参数进入独立白盒场景");
  Check(initial.state.contentId === "CH1_NanLu"
    && initial.state.storyLevel === "CH1_NanLu"
    && initial.state.setpieceLevel === "CH1_NanLu", "剧情与摆点复用正式第一章内容");
  Check(initial.state.companions > 0, "具名同伴在白盒中真实到场",
    `companions=${initial.state.companions}`);
  Check(initial.characterPbr.meshes > 0 && initial.characterPbr.materials > 0
    && initial.characterPbr.configured && initial.characterPbr.nonMetal
    && initial.characterPbr.roughEnough && initial.characterPbr.shadowReady,
  "白盒角色使用非金属 PBR 材质并支持投影/受影",
  JSON.stringify(initial.characterPbr));
  Check(initial.state.field.material === "MeshStandardMaterial"
    && initial.state.field.color === 0xffffff && !initial.state.field.textured,
  "全部场景体块使用无贴图纯白受光材质");
  Check(initial.state.field.whiteBoxes >= 47 && initial.state.field.externalAssets === 0,
    "关卡由程序化白盒构成且不加载环境资产");
  Check(initial.state.field.gates.length === 2
    && initial.state.field.gates.every((gate) => !gate.open && gate.colliding),
  "两条未来通路开局均由可见实体白门封闭");
  Check(initial.visibleMarkers === 1, "屏幕只显示当前任务去向");
  Check(initial.oldGuideDom === 0, "旧说明卡与空气墙提示 DOM 已删除");

  const opened = await page.evaluate(() => {
    const T = window.Tengxian;
    const navBefore = T.nav.revisions;
    T.story.Signal("EscortCall");
    T.StepFrames(2);
    return {
      gate: T.Debug.Whitebox().field.gates.find((gate) => gate.id === "EscortGate"),
      navBefore,
      navAfter: T.nav.revisions,
    };
  });
  Check(opened.gate.open && !opened.gate.colliding,
    "正式剧情信号让门升起并同步移除真实碰撞体");
  Check(opened.navAfter > opened.navBefore, "门开启时同步刷新 AI 导航连通性",
    `${opened.navBefore}→${opened.navAfter}`);

  const scout = await page.evaluate(() => {
    const T = window.Tengxian;
    let seenSamples = 0;
    let firstSeenAt = null;
    for (let i = 0; i < 250; i += 1) {
      T.StepFrames(6, 1 / 60, false);
      const sample = T.Debug.Whitebox();
      if (sample.enemyCount > 0) {
        seenSamples += 1;
        if (firstSeenAt === null) firstSeenAt = sample.phaseTime;
      }
    }
    T.StepFrames(1);
    return { ...T.Debug.Whitebox(), seenSamples, firstSeenAt };
  });
  Check(scout.phaseTime >= 24 && scout.phaseTime < 27, "首敌在 20—30 秒窗口出现",
    `t=${scout.phaseTime.toFixed(1)}s`);
  Check(scout.seenSamples >= 8, "首敌至少持续可辨认 0.8 秒",
    `samples=${scout.seenSamples} first=${scout.firstSeenAt} deaths=${scout.enemyDeaths}`);
  Check(errors.length === 0, "浏览器无脚本或控制台错误", errors.join(" | "));
  console.log("FirstLevelWhiteboxBrowserTest PASS");
} finally {
  await browser.close();
  server.close();
}
