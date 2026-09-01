// 后送队担架链实机取证：白盒里起一支两担架员+轻伤员的小队走一段，
// 量「担架员播的是抬担架 clip / 跛行伤员播的是 WoundedLimp / 担架实体真的抬在
// 两人中间」，并落一张侧面截图。这是 docs/Data_MocapPipeline.md 那条链的
// 端到端出图口（clip 单体联系图见 Script_MocapClipShot.mjs）。
//
// 用法：node Taierzhuang1938/Script_EscortLitterShot.mjs [输出 PNG]
// 默认输出 Taierzhuang1938/_shots/actor_pose/EscortLitter.png。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const outFile = path.resolve(process.argv[2] || path.join(projectDir, "_shots", "actor_pose", "EscortLitter.png"));
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=1&shot=1&quality=low&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  const probe = await page.evaluate(async () => {
    const T = window.Tengxian;
    const THREE = await import("/Taierzhuang1938/vendor/three/build/three.module.js");
    const { EscortColumn } = await import("/Taierzhuang1938/Script_MissionSetpieces.mjs");
    const p = T.player.position;
    // 一支最小后送队：一副担架（前后位）+ 一名能走的轻伤员，沿 +X 走 40 m。
    const column = new EscortColumn(T.setpieces.host, {
      waypoints: [{ x: p.x + 4, z: p.z }, { x: p.x + 44, z: p.z }],
      members: [
        { role: "bearer", label: "担架员" },
        { role: "bearer", label: "担架员" },
        { role: "walking", label: "轻伤员" },
      ],
    });
    column.Start();
    // 正片里 column.Update 由章节的 Update 钩子（s.mem.column）驱动；
    // 取证队不挂在任何章节上，得自己按帧喂。
    for (let i = 0; i < 40; i += 1) {
      T.StepFrames(8);
      column.Update(8 / 60);
    }
    const state = column.State();
    const members = column.members.map((m) => ({
      role: m.role,
      carryRole: m.handle?.carryRole || null,
      woundedWalk: m.handle?.woundedWalk || 0,
      clip: m.handle?.actor?.characterRig?.currentPlaybackId || null,
      alive: !!m.handle?.alive,
    }));
    // 侧机位对着担架中点补拍一帧
    const mid = column.litters?.[0]?.lastMid;
    if (mid) {
      const camera = new THREE.PerspectiveCamera(38, 1600 / 900, 0.1, 200);
      camera.position.set(mid.x + 1.5, (mid.gy || 0) + 1.5, mid.z + 7.5);
      camera.lookAt(mid.x, (mid.gy || 0) + 0.9, mid.z);
      T.renderer.render(T.scene, camera);
    }
    return { state, members, mid };
  });
  console.log(JSON.stringify(probe, null, 1));
  await page.screenshot({ path: outFile });
  const bearers = probe.members.filter((m) => m.role === "bearer");
  const ok = bearers.length === 2
    && bearers.some((m) => m.clip === "CarryStretcherFront")
    && bearers.some((m) => m.clip === "CarryStretcherRear")
    && probe.members.some((m) => m.role === "walking" && m.clip === "WoundedLimp")
    && probe.state.litters?.[0]?.carried === true;
  console.log(`${ok ? "PASS" : "FAIL"} — EscortLitterShot: wrote ${outFile}`);
  if (errors.length) console.log("pageerrors:", errors.join(" | "));
  process.exitCode = ok && !errors.length ? 0 : 1;
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
