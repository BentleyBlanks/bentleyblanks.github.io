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
    // 一支最小后送队：一副担架（前后位）+ 一名能走的轻伤员。
    // 整队摆在**相机朝向的正前方**：出生在玩家身后的人会被视锥剔除，
    // culled 的 actor 不更新动画，取证采到的永远是初始 clip（踩过一次）。
    const forward = new THREE.Vector3();
    T.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const column = new EscortColumn(T.setpieces.host, {
      waypoints: [
        { x: p.x + forward.x * 22, z: p.z + forward.z * 22 },
        { x: p.x + forward.x * 62, z: p.z + forward.z * 62 },
      ],
      members: [
        { role: "bearer", label: "担架员" },
        { role: "bearer", label: "担架员" },
        { role: "walking", label: "轻伤员" },
      ],
    });
    column.Start();
    // 正片里 column.Update 由章节的 Update 钩子（s.mem.column）驱动；
    // 取证队不挂在任何章节上，得自己按帧喂。**在行进中采样**：
    // 队伍停下（玩家落队 columnWaitM 闸）之后轻伤员按设计回站姿，
    // 那一刻断言 WoundedLimp 是拿设计当 bug。
    // 轻伤员是走走停停的（regoal 节奏 + 槽位就在脚边），单帧采样常撞在
    // 「停」的瞬间——那时按设计就是站姿。所以逐拍记录他播过的 clip，
    // 断言「行进过程里跛行 clip 真出现过」。
    const walkerClipsSeen = new Set();
    const walkerTrack = [];
    const walker = column.members.find((m) => m.role === "walking");
    // 窗口要盖住至少两个 regoal 周期，走走停停里才有「走」的采样。
    for (let i = 0; i < 50; i += 1) {
      T.StepFrames(8);
      column.Update(8 / 60);
      const clip = walker?.handle?.actor?.characterRig?.currentPlaybackId;
      if (clip) walkerClipsSeen.add(clip);
      if (walker?.handle && i % 5 === 0) {
        walkerTrack.push([
          +walker.handle.position.x.toFixed(1),
          +(walker.handle.moveSpeed || 0).toFixed(2),
          walker.handle.actor?.root?.visible ? 1 : 0,
          walker.handle.renderLod || null,
        ]);
      }
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
    return { state, members, mid, walkerClipsSeen: [...walkerClipsSeen], walkerTrack };
  });
  console.log(JSON.stringify(probe, null, 1));
  await page.screenshot({ path: outFile });
  const bearers = probe.members.filter((m) => m.role === "bearer");
  const ok = bearers.length === 2
    && bearers.some((m) => m.clip === "CarryStretcherFront")
    && bearers.some((m) => m.clip === "CarryStretcherRear")
    && probe.walkerClipsSeen.includes("WoundedLimp")
    && probe.state.litters?.[0]?.carried === true;
  console.log(`${ok ? "PASS" : "FAIL"} — EscortLitterShot: wrote ${outFile}`);
  if (errors.length) console.log("pageerrors:", errors.join(" | "));
  process.exitCode = ok && !errors.length ? 0 : 1;
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
}
