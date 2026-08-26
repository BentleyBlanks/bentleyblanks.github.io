// 阵亡视角视觉冒烟：真浏览器触发死亡，校验倒地、DOF、半透明 UI，并留 1920x1080 审图。
// 用法：node Taierzhuang1938/Script_DeathViewTest.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const auditDir = path.join(rootDir, ".codex-tmp");
const auditPath = path.join(auditDir, "VisualAudit_DeathView.png");
await fs.mkdir(auditDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() === "error" && !/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) {
    errors.push(`CONSOLE ${message.text().slice(0, 300)}`);
  }
});

let failed = false;
try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=5&quality=medium&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 180000 });

  const result = await page.evaluate(() => {
    const T = window.Taierzhuang;
    for (const soldier of T.ai.soldiers) {
      if (soldier.side === "ija") soldier.position.set(
        soldier.position.x + 800, soldier.position.y, soldier.position.z + 800);
    }
    T.state.spawnAccumulator = -1e6;
    if (!T.player.Alive) T.player.Spawn(T.player.position.x, T.player.position.z, T.player.yaw);
    T.player.stance = "stand";
    T.player.eyeHeight = 1.62;
    T.player.health = 100;
    T.StepFrames(3);
    const startY = T.camera.position.y;
    T.player.Kill();
    T.StepFrames(58);

    const card = document.querySelector(".hudDeathCard");
    const style = getComputedStyle(card);
    const biographyNode = card.querySelector(".dcBiography");
    const biographyStyle = getComputedStyle(biographyNode);
    const biographyRect = biographyNode.getBoundingClientRect();
    const nameStyle = getComputedStyle(card.querySelector(".dcName"));
    const yearsNode = card.querySelector(".dcYears");
    const originNode = card.querySelector(".dcOrigin");
    const yearsStyle = getComputedStyle(yearsNode);
    const originStyle = getComputedStyle(originNode);
    const dof = T.post.uniformsComposite;
    const probe = document.createElement("canvas");
    probe.width = 96; probe.height = 54;
    const ctx = probe.getContext("2d");
    ctx.drawImage(T.renderer.domElement, 0, 0, probe.width, probe.height);
    const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data;
    let mean = 0, mean2 = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const luma = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
      mean += luma; mean2 += luma * luma;
    }
    const count = pixels.length / 4;
    mean /= count;
    const variance = mean2 / count - mean * mean;

    return {
      cameraDrop: startY - T.camera.position.y,
      roll: Math.abs(T.camera.rotation.z),
      cardOn: card.classList.contains("on"),
      background: style.backgroundColor,
      biography: biographyNode?.textContent || "",
      biographyCentered: Math.abs(biographyRect.left + biographyRect.width * 0.5
        - innerWidth * 0.5) < 2 && biographyStyle.textAlign === "center",
      nameFontPx: parseFloat(nameStyle.fontSize),
      nameWeight: parseInt(nameStyle.fontWeight, 10),
      yearsAboveOrigin: yearsNode.getBoundingClientRect().top < originNode.getBoundingClientRect().top,
      yearsFontPx: parseFloat(yearsStyle.fontSize),
      yearsWeight: parseInt(yearsStyle.fontWeight, 10),
      originFontPx: parseFloat(originStyle.fontSize),
      dofStrength: dof.uDofStrength.value,
      dofFocus: dof.uDofFocus.value,
      dofRange: dof.uDofRange.value,
      dofMaxPx: dof.uDofMaxPx.value,
      weaponHidden: !T.viewmodel.root.visible,
      glError: T.renderer.getContext().getError(),
      mean, variance,
    };
  });

  await page.waitForTimeout(180);
  await page.screenshot({ path: auditPath });

  const checks = [
    ["倒地机位", result.cameraDrop > 0.8 && result.roll > 0.8,
      `drop=${result.cameraDrop.toFixed(2)}m roll=${result.roll.toFixed(2)}rad`],
    ["前景焦点重 DOF", result.dofStrength > 0.95 && result.dofFocus <= 1.5
      && result.dofRange <= 3 && result.dofMaxPx >= 10,
    `strength=${result.dofStrength} focus=${result.dofFocus} range=${result.dofRange} max=${result.dofMaxPx}px`],
    ["居中大号粗体生平 UI", result.cardOn && /^rgba\(/.test(result.background)
      && result.biographyCentered && result.nameFontPx >= 80 && result.nameWeight >= 700
      && result.yearsAboveOrigin && result.yearsFontPx >= 23 && result.yearsWeight >= 600
      && result.yearsFontPx > result.originFontPx
      && !result.biography.includes("籍贯") && result.biography.includes("1938"),
    `${result.background} / ${result.biography}`],
    ["倒地收枪", result.weaponHidden, `hidden=${result.weaponHidden}`],
    ["画面健康", result.glError === 0 && result.mean > 8 && result.variance > 20,
      `gl=${result.glError} mean=${result.mean.toFixed(1)} variance=${result.variance.toFixed(1)}`],
  ];
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? "ok  " : "FAIL"} ${name} — ${detail}`);
    if (!ok) failed = true;
  }
  if (errors.length) {
    failed = true;
    for (const error of errors) console.error(error);
  }
  console.log(`审图：${auditPath}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failed) process.exitCode = 1;
