// 《苇声：1942》真实浏览器渲染健康检查。
// 运行：node ReedSignal1942/Script_RenderHealthTest.mjs

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pageDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(pageDirectory);
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

let failureCount = 0;
function Assert(condition, message) {
  if (condition) {
    console.log("ok:", message);
    return;
  }
  failureCount += 1;
  console.error("FAIL:", message);
}

function ServeRepository() {
  const server = http.createServer((request, response) => {
    let route = decodeURIComponent(request.url.split("?")[0]);
    if (route.endsWith("/")) route += "index.html";
    const filePath = path.resolve(repositoryRoot, `.${route}`);
    if (filePath !== repositoryRoot && !filePath.startsWith(`${repositoryRoot}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream",
      });
      response.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function LaunchBrowser() {
  const playwright = await import("playwright-core").catch(() => null);
  if (!playwright) throw new Error("缺少 playwright-core；运行 npm install --no-save --no-package-lock playwright-core");
  const commonArgs = ["--no-sandbox", "--disable-dev-shm-usage"];
  const attempts = [];
  if (process.env.REED_SIGNAL_BROWSER_PATH) attempts.push({ executablePath: process.env.REED_SIGNAL_BROWSER_PATH, args: commonArgs });
  attempts.push({ channel: "msedge", args: commonArgs });
  attempts.push({ channel: "chrome", args: commonArgs });
  attempts.push({ args: commonArgs });
  for (const options of attempts) {
    try {
      return await playwright.chromium.launch(options);
    } catch { /* try the next locally installed browser */ }
  }
  throw new Error("找不到可用 Chromium；可用 REED_SIGNAL_BROWSER_PATH 指向浏览器可执行文件");
}

async function CollectPixels(page, clip = null) {
  const screenshot = await page.screenshot(clip ? { clip } : {});
  const dataUrl = `data:image/png;base64,${screenshot.toString("base64")}`;
  return page.evaluate(async (url) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    const width = 240;
    const height = Math.max(1, Math.round(width * image.height / image.width));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let min = 255;
    let max = 0;
    let sum = 0;
    let dark = 0;
    let bright = 0;
    const tones = new Set();
    const hues = new Set();
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      min = Math.min(min, luminance);
      max = Math.max(max, luminance);
      sum += luminance;
      if (luminance < 12) dark += 1;
      if (luminance > 244) bright += 1;
      tones.add(Math.floor(luminance / 8));
      hues.add(`${red >> 5},${green >> 5},${blue >> 5}`);
    }
    const count = pixels.length / 4;
    return {
      min,
      max,
      mean: sum / count,
      darkShare: dark / count,
      brightShare: bright / count,
      tones: tones.size,
      hues: hues.size,
    };
  }, dataUrl);
}

const probes = [
  { chapter: 0, x: 330, id: "school", minimumMean: 16, minimumAssets: 5 },
  { chapter: 1, x: 1750, id: "blockade", minimumMean: 15, minimumAssets: 4 },
  { chapter: 2, x: 1500, id: "tunnel", minimumMean: 22, minimumAssets: 2 },
  { chapter: 3, x: 2070, id: "ferry", minimumMean: 15, minimumAssets: 3, completed: "meetMother,motherSignal" },
];

const server = await ServeRepository();
const port = server.address().port;
let browser = null;
try {
  browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|404/.test(message.text())) pageErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "";
    if (!/favicon/.test(request.url()) && failure !== "net::ERR_ABORTED") pageErrors.push(`request failed: ${request.url()} (${failure})`);
  });

  for (const probe of probes) {
    const completed = probe.completed ? `&qaCompleted=${probe.completed}` : "";
    await page.goto(`http://127.0.0.1:${port}/ReedSignal1942/?quality=desktop&qaChapter=${probe.chapter}&qaX=${probe.x}${completed}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => Number(document.getElementById("GameCanvas")?.dataset.renderCalls) > 0, null, { timeout: 60000 });
    await page.waitForTimeout(900);
    const runtime = await page.evaluate(() => {
      const canvas = document.getElementById("GameCanvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      return {
        engine: canvas.dataset.engine,
        calls: Number(canvas.dataset.renderCalls),
        triangles: Number(canvas.dataset.renderTriangles),
        quality: canvas.dataset.renderQuality,
        chapter: canvas.dataset.renderChapter,
        assetKitReady: canvas.dataset.assetKitReady === "true",
        blenderAssets: Number(canvas.dataset.blenderAssets),
        postFxReady: canvas.dataset.postFxReady === "true",
        postFxQuality: Number(canvas.dataset.postFxQuality),
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        playerScreenX: Number(canvas.dataset.playerScreenX),
        playerScreenTop: Number(canvas.dataset.playerScreenTop),
        playerScreenHeight: Number(canvas.dataset.playerScreenHeight),
        glError: gl ? gl.getError() : -1,
      };
    });
    const pixels = await CollectPixels(page);
    Assert(runtime.engine === "three.js r160", `${probe.id}: 使用仓库内 Three.js 3D 渲染器`);
    Assert(runtime.chapter === probe.id, `${probe.id}: 载入正确的章节 3D 舞台`);
    Assert(runtime.quality === "desktop", `${probe.id}: 桌面视觉档生效`);
    Assert(runtime.assetKitReady, `${probe.id}: BlenderMCP 原创 GLB 资产包已加载`);
    Assert(runtime.blenderAssets >= probe.minimumAssets, `${probe.id}: Blender 资产实例达到构图要求（${runtime.blenderAssets}）`);
    Assert(runtime.postFxReady, `${probe.id}: 深度感知电影化后处理已启用`);
    Assert(runtime.postFxQuality >= 0.95, `${probe.id}: 桌面后处理质量档生效（${runtime.postFxQuality.toFixed(2)}）`);
    Assert(runtime.glError === 0, `${probe.id}: WebGL 无错误（${runtime.glError}）`);
    Assert(runtime.calls > 25 && runtime.calls < 260, `${probe.id}: draw calls 受控（${runtime.calls}）`);
    Assert(runtime.triangles > 1000 && runtime.triangles < 150000, `${probe.id}: 三角形预算受控（${runtime.triangles}）`);
    Assert(runtime.width / runtime.height > 1.7, `${probe.id}: 保持电影化横版视口`);
    Assert(pixels.max - pixels.min > 55, `${probe.id}: 画面有明暗层次（${pixels.min.toFixed(0)}→${pixels.max.toFixed(0)}）`);
    Assert(pixels.mean > probe.minimumMean, `${probe.id}: 不是近黑屏（均值 ${pixels.mean.toFixed(1)}）`);
    Assert(pixels.darkShare < (probe.id === "tunnel" ? 0.35 : 0.68), `${probe.id}: 暗部没有吞掉主画面（${(pixels.darkShare * 100).toFixed(1)}%）`);
    Assert(pixels.brightShare < 0.12, `${probe.id}: 高光没有大面积烧白（${(pixels.brightShare * 100).toFixed(1)}%）`);
    Assert(pixels.tones >= 8 && pixels.hues >= 12, `${probe.id}: 色调与材质层次足够（${pixels.tones} 档 / ${pixels.hues} 色块）`);
    const actorClip = {
      x: Math.max(0, Math.min(runtime.width - 56, runtime.playerScreenX - 28)),
      y: Math.max(0, Math.min(runtime.height - 1, runtime.playerScreenTop)),
      width: 56,
      height: Math.max(1, Math.min(runtime.playerScreenHeight, runtime.height - runtime.playerScreenTop)),
    };
    if (actorClip.height >= 24) {
      const actorPixels = await CollectPixels(page, actorClip);
      Assert(actorPixels.max - actorPixels.min > 24, `${probe.id}: 主角局部有可读对比（${actorPixels.min.toFixed(0)}→${actorPixels.max.toFixed(0)}）`);
      Assert(actorPixels.tones >= 5, `${probe.id}: 主角没有融成单色剪影（${actorPixels.tones} 档）`);
    } else {
      Assert(false, `${probe.id}: 主角投影高度不足（${actorClip.height.toFixed(1)}px）`);
    }
    if (probe.id === "tunnel") {
      const smokeProbe = await page.evaluate(() => {
        const handle = window.ReedSignal1942?.render;
        const smoke = handle?.chapterScene?.dynamic?.smoke;
        if (!handle || !smoke) return null;
        smoke.geometry.computeBoundingBox();
        const box = smoke.geometry.boundingBox;
        const nearest = smoke.position.clone();
        nearest.x += box.min.x;
        nearest.y += 0.8;
        nearest.project(handle.camera);
        return { visible: smoke.visible, minLocalX: box.min.x, nearestNdcX: nearest.x };
      });
      Assert(Boolean(smokeProbe?.visible), "tunnel: 东侧烟流在未封裂缝时可见");
      if (smokeProbe) {
        Assert(smokeProbe.minLocalX < -11, `tunnel: 稀薄烟前兆先于致命前缘进入镜头（local x ${smokeProbe.minLocalX.toFixed(1)}）`);
        Assert(smokeProbe.nearestNdcX > -1 && smokeProbe.nearestNdcX < 1, `tunnel: x1500 镜头能看到来烟（ndc ${smokeProbe.nearestNdcX.toFixed(2)}）`);
      }
    }
  }

  for (const budgetProbe of [
    { id: "schoolOpening", chapter: 0, x: 330, duration: 7.8 },
    { id: "ferryOpening", chapter: 3, x: 520, duration: 6.3 },
  ]) {
    await page.goto(`http://127.0.0.1:${port}/ReedSignal1942/?quality=desktop&qaChapter=${budgetProbe.chapter}&qaX=${budgetProbe.x}&qaCinematic=${budgetProbe.id}`, { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction((id) => document.getElementById("GameCanvas")?.dataset.cinematic === id, budgetProbe.id, { timeout: 60000 });
    const deadline = Date.now() + budgetProbe.duration * 1000;
    let maximumCalls = 0;
    while (Date.now() < deadline) {
      maximumCalls = Math.max(maximumCalls, await page.evaluate(() => Number(document.getElementById("GameCanvas")?.dataset.renderCalls || 0)));
      await page.waitForTimeout(90);
    }
    Assert(maximumCalls > 0 && maximumCalls < 260, `${budgetProbe.id}: 整段建立镜头与返回玩法均低于 260 calls（峰值 ${maximumCalls}）`);
  }

  await page.goto(`http://127.0.0.1:${port}/ReedSignal1942/?quality=desktop&qaChapter=0&qaX=320&qaCompleted=takeRegister&qaCinematic=registerHandoff`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => document.getElementById("GameCanvas")?.dataset.cinematic === "registerHandoff", null, { timeout: 60000 });
  await page.waitForFunction(() => Number(window.ReedSignal1942?.GetCinematic()?.segmentProgress) > 0.42, null, { timeout: 10000 });
  const registerStaging = await page.evaluate(() => {
    const handle = window.ReedSignal1942?.render;
    const player = handle?.chapterScene?.actors?.player;
    const teacher = handle?.chapterScene?.actors?.mother;
    const ProjectX = (actor) => {
      const world = actor.position.clone();
      actor.parent.localToWorld(world);
      world.project(handle.camera);
      return (world.x * 0.5 + 0.5) * document.getElementById("GameCanvas").clientWidth;
    };
    return handle && player && teacher ? {
      playerVisible: player.visible,
      teacherVisible: teacher.visible,
      visibleRegisters: [player, teacher].filter((actor) => actor.userData.rig?.registerBook?.visible).length,
      playerX: ProjectX(player),
      teacherX: ProjectX(teacher),
      cinematic: window.ReedSignal1942.GetCinematic()?.id || "",
    } : null;
  });
  Assert(Boolean(registerStaging?.playerVisible && registerStaging?.teacherVisible), "register handoff: 阿苇与周禾都在实时 3D 过场中可见");
  Assert(registerStaging?.visibleRegisters === 1, "register handoff: 镜头里有且只有一册可见的 3D 点名簿");
  if (registerStaging) Assert(Math.abs(registerStaging.playerX - registerStaging.teacherX) > 36, `register handoff: 两人站位清楚、不再重叠（${Math.abs(registerStaging.playerX - registerStaging.teacherX).toFixed(0)}px）`);
  await page.keyboard.press("KeyD");
  await page.waitForTimeout(250);
  Assert((await page.evaluate(() => window.ReedSignal1942?.GetCinematic()?.id)) === "registerHandoff", "cinematic input: 普通移动键不能跳过过场");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !window.ReedSignal1942?.GetCinematic(), null, { timeout: 5000 });
  Assert(true, "cinematic input: Escape 在允许略过后才结束过场");

  await page.goto(`http://127.0.0.1:${port}/ReedSignal1942/?quality=desktop&qaChapter=1&qaX=1735&qaCompleted=readWind,releaseBoat,raiseSluice&qaCinematic=sluiceRise`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.ReedSignal1942?.GetCinematic()?.id === "sluiceRise" && Number(window.ReedSignal1942.GetCinematic().segmentProgress) > 0.46, null, { timeout: 10000 });
  const sluiceMidShot = await page.evaluate(() => {
    const dynamic = window.ReedSignal1942?.render?.chapterScene?.dynamic;
    return dynamic ? { visible: dynamic.bridge.visible, progress: dynamic.bridgeRaise, y: dynamic.bridge.position.y } : null;
  });
  Assert(Boolean(sluiceMidShot?.visible), "sluice cinematic: 门板桥在抬升过程中真实可见");
  if (sluiceMidShot) Assert(sluiceMidShot.progress > 0.04 && sluiceMidShot.progress < 0.58, `sluice cinematic: 过场中段处于渐进抬升而非瞬间完成（${sluiceMidShot.progress.toFixed(2)}）`);

  await page.goto(`http://127.0.0.1:${port}/ReedSignal1942/?quality=desktop&qaChapter=2&qaX=590&qaCompleted=openWellVent&qaCinematic=wellVent`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => window.ReedSignal1942?.GetCinematic()?.id === "wellVent" && Number(window.ReedSignal1942.GetCinematic().segmentProgress) > 0.45, null, { timeout: 10000 });
  const ventMidShot = await page.evaluate(() => {
    const dynamic = window.ReedSignal1942?.render?.chapterScene?.dynamic;
    return dynamic ? {
      shaftIntensity: dynamic.shaftLights[0]?.intensity || 0,
      shaftWidth: dynamic.shaftVolumes[0]?.volume?.scale?.x || 0,
      smokeVisible: dynamic.smoke?.visible,
      smokeOpacity: dynamic.smoke?.material?.uniforms?.uOpacity?.value || 0,
    } : null;
  });
  Assert(Boolean(ventMidShot?.smokeVisible), "well vent cinematic: 开井时烟仍在镜头里、没有提前消失");
  if (ventMidShot) {
    Assert(ventMidShot.shaftIntensity > 5 && ventMidShot.shaftIntensity < 19, `well vent cinematic: 井光随开口渐亮（${ventMidShot.shaftIntensity.toFixed(1)}）`);
    Assert(ventMidShot.shaftWidth > 0.4 && ventMidShot.shaftWidth < 0.9, `well vent cinematic: 光柱随井口渐宽（${ventMidShot.shaftWidth.toFixed(2)}）`);
    Assert(ventMidShot.smokeOpacity > 0.06 && ventMidShot.smokeOpacity < 0.13, `well vent cinematic: 烟雾在过程里逐步变薄（${ventMidShot.smokeOpacity.toFixed(3)}）`);
  }

  await page.goto(`http://127.0.0.1:${port}/ReedSignal1942/?quality=desktop&qaChapter=1&qaX=2000&qaCompleted=readWind,releaseBoat,raiseSluice`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => Number(document.getElementById("GameCanvas")?.dataset.renderCalls) > 0, null, { timeout: 60000 });
  const raisedSluice = await page.evaluate(() => {
    const dynamic = window.ReedSignal1942?.render?.chapterScene?.dynamic;
    return dynamic ? {
      bridgeVisible: dynamic.bridge.visible,
      bridgeRaise: dynamic.bridgeRaise,
      bridgeY: dynamic.bridge.position.y,
      waterY: dynamic.water.position.y,
      rippleOffsetY: dynamic.waterRipples.position.y,
    } : null;
  });
  Assert(Boolean(raisedSluice), "blockade solved: 可检查水闸与浮桥 3D 因果");
  if (raisedSluice) {
    Assert(raisedSluice.bridgeVisible, "blockade solved: 抬闸后门板桥可见");
    Assert(raisedSluice.bridgeRaise > 0.7 && raisedSluice.bridgeY > -0.2, `blockade solved: 浮桥已升出水面并接近通行高度（${raisedSluice.bridgeRaise.toFixed(2)} / y ${raisedSluice.bridgeY.toFixed(2)}）`);
    Assert(Math.abs(raisedSluice.waterY + 0.08) < 0.001, `blockade solved: 水位真的抬升（y ${raisedSluice.waterY.toFixed(2)}）`);
    Assert(Math.abs(raisedSluice.rippleOffsetY - 0.54) < 0.001, `blockade solved: 波纹跟随高水位（offset ${raisedSluice.rippleOffsetY.toFixed(2)}）`);
  }

  await page.goto(`http://127.0.0.1:${port}/ReedSignal1942/?quality=desktop&qaChapter=3&qaX=3290&qaCompleted=countChildren,raiseScreen,meetMother,motherSignal,boardFerry&qaCinematic=endingDeparture`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => document.getElementById("GameCanvas")?.dataset.cinematic === "endingDeparture", null, { timeout: 60000 });
  const endingCinematic = await page.evaluate(() => ({
    overlayVisible: !document.getElementById("CinematicOverlay").hidden,
    caption: document.getElementById("CinematicCaption").textContent,
    endingHidden: document.getElementById("EndingScreen").hidden,
  }));
  Assert(endingCinematic.overlayVisible, "ending cinematic: 3D 过场遮罩必须可见");
  Assert(endingCinematic.caption.length > 0, "ending cinematic: 镜头必须带有当前叙事字幕");
  Assert(endingCinematic.endingHidden, "ending cinematic: 船离岸前不得提前显示结算页");
  await page.evaluate(() => {
    window.__reedSignalMaximumCinematicCalls = 0;
    window.__reedSignalBudgetTimer = window.setInterval(() => {
      window.__reedSignalMaximumCinematicCalls = Math.max(
        window.__reedSignalMaximumCinematicCalls,
        Number(document.getElementById("GameCanvas")?.dataset.renderCalls || 0),
      );
    }, 40);
  });
  await page.locator("#SkipCinematicButton").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(() => Number(window.ReedSignal1942?.GetCinematic()?.progress || 0) > 0.76, null, { timeout: 15000 });
  await page.waitForTimeout(700);
  const finaleLod = await page.evaluate(() => {
    const handle = window.ReedSignal1942?.render;
    const followers = handle?.chapterScene?.actors?.followers || [];
    const dataset = document.getElementById("GameCanvas").dataset;
    window.clearInterval(window.__reedSignalBudgetTimer);
    return {
      huddleVisible: Boolean(handle?.chapterScene?.dynamic?.ferryHuddle?.group?.visible),
      detailedFollowers: followers.filter((actor) => actor.visible).length,
      calls: Number(dataset.renderCalls),
      triangles: Number(dataset.renderTriangles),
      maximumCalls: Number(window.__reedSignalMaximumCinematicCalls || 0),
      endingHidden: document.getElementById("EndingScreen").hidden,
    };
  });
  Assert(finaleLod.huddleVisible && finaleLod.detailedFollowers === 2, "ending cinematic: 远景使用四名实例群像与两名完整骨架");
  Assert(finaleLod.maximumCalls > 0 && finaleLod.maximumCalls < 260, `ending cinematic: 登船到离岸全程低于 260 calls（峰值 ${finaleLod.maximumCalls}）`);
  Assert(finaleLod.calls < 260 && finaleLod.triangles < 80000, `ending cinematic: 终章远景保持性能预算（${finaleLod.calls} calls / ${finaleLod.triangles} tris）`);
  Assert(finaleLod.endingHidden, "ending cinematic: 最终远景仍未提前显示结算页");
  await page.locator("#SkipCinematicButton").click();
  await page.waitForFunction(() => !document.getElementById("EndingScreen").hidden, null, { timeout: 5000 });
  Assert(true, "ending cinematic: 跳过后才进入结算页");

  await page.goto(`http://127.0.0.1:${port}/ReedSignal1942/?quality=mobile&qaChapter=1&qaX=1750`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(() => document.getElementById("GameCanvas")?.dataset.renderQuality === "mobile", null, { timeout: 60000 });
  const mobile = await page.evaluate(() => {
    const dataset = document.getElementById("GameCanvas").dataset;
    return { calls: Number(dataset.renderCalls), triangles: Number(dataset.renderTriangles), quality: dataset.renderQuality };
  });
  Assert(mobile.quality === "mobile", "mobile: 低成本渲染档可强制启用");
  Assert(mobile.calls < 140, `mobile: draw calls 低于 140（${mobile.calls}）`);
  Assert(mobile.triangles < 80000, `mobile: 三角形低于 80k（${mobile.triangles}）`);
  Assert(pageErrors.length === 0, `所有章节无页面、shader 或资源错误${pageErrors.length ? `：${pageErrors[0]}` : ""}`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failureCount > 0) process.exit(1);
console.log(`ReedSignal1942 render health passed: ${probes.length} cinematic 3D chapters plus mobile budget verified.`);
