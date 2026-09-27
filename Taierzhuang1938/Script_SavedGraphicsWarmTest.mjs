// ===========================================================================
// Script_SavedGraphicsWarmTest.mjs —— 存档画质要赶在着色器预热之前生效
//
// 事故（2026-09-27，用户实机，第一关）：第一颗手榴弹在三名日军旁边爆炸，必卡 2–5 s。
// 按用户存的画质（POM / 细节法线 / 微阴影 / 地平线遮蔽 / 第一人称自阴影全关、簇光关）
// 复现：爆炸后两帧 renderer.render 3065 ms + 9178 ms，现编 6 个 program（弹坑地块的
// 分层地形 ×3、被炸的可破坏静态件、断肢块、第一人称手榴弹）；默认画质下一个都不编。
// 病根是开机顺序：EnterLevel 里的 WarmActorShaders / WarmLevel 按**默认画质**编 program，
// 编辑器建在开机最后，它的 ApplySavedSettings 才把存档画质套上，编译期开关一翻，
// 预热编出来的全是用不上的变体；爆炸时才第一次出现的材质就在那一帧现编。
// 修法：Script_Main 在第一次 EnterLevel 之前 LoadSavedGraphics + ApplyGraphics。
//
// 断言：
//   1. 存档关掉 POM 时，进关预热后没有一份材质正在用带 USE_MATERIAL_POM 的 program。
//   2. 真扔一颗手榴弹炸三名日军（三人都死），从出手到爆炸后 60 帧 program 总数不涨、
//      爆炸帧 CPU < 1000 ms（修前 3 s + 9 s；本机常被别的会话占满，阈值只拦编译级的卡）。
//   3. 页面没有 pageerror / console.error。
//
// 用法：node Taierzhuang1938/Script_SavedGraphicsWarmTest.mjs
// ===========================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const MAX_BLAST_FRAME_MS = 1000;

// 用户 2026-09-27 本机存档里与编译期有关的那几位（其余键留出厂值）。
const SAVED_GRAPHICS = {
  pom: false, pomSelfShadow: false, detailNormal: false, microShadow: false,
  horizonOcclusion: false, skinSss: false, firstPersonSelfShadow: false,
  clusteredLights: false, taa: false, ssr: false, atmosphere: false, volumetrics: false,
  shadowSize: 1024, gore: true,
};

const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() === "error" && !/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) {
    errors.push(`CONSOLE ${message.text().slice(0, 300)}`);
  }
});
await page.addInitScript((saved) => {
  try { localStorage.setItem("tengxian1938_graphics_v1", JSON.stringify(saved)); } catch { /* 无痕 */ }
}, SAVED_GRAPHICS);

let failed = false;
const Report = (ok, name, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name} — ${detail}`);
  if (!ok) failed = true;
};

try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=p012&missionStage=4&manual=1&scale=small`,
    { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 400000 });

  const result = await page.evaluate(() => {
    const T = window.Tengxian;
    // 看材质**正在用**的 program：开机最早期（设置套上之前）编过的变体会留在材质自己的
    // 变体缓存里（renderer.properties.programs），没人用、不卡，不算。
    const pomPrograms = [];
    const seen = new Set();
    const Check = (material) => {
      if (!material || seen.has(material)) return;
      seen.add(material);
      const program = T.renderer.properties.get(material).currentProgram;
      if (program && /USE_MATERIAL_POM/.test(program.cacheKey)) pomPrograms.push(material.name);
    };
    T.scene.traverse((object) => { for (const material of [object.material].flat()) Check(material); });
    for (const material of T.library.materials.values()) Check(material);
    for (const material of T.library.staticMaterials.values()) Check(material);
    T.player.SetDebugOptions({ invincible: true });
    T.state.grenades = Math.max(T.state.grenades, 2);
    T.profiler.Enable();
    T.StepFrames(20);
    // 三名日军摆在手榴弹落点周围 1.6 m，逐帧跟着弹走（落点由弹道决定，不预判）。
    const targets = T.ai.soldiers.filter((soldier) => soldier.alive && soldier.side === "ija").slice(0, 3);
    const yaw = T.player.yaw;
    const Place = (cx, cz) => targets.forEach((soldier, i) => {
      const x = cx + Math.cos(i * 2.1) * 1.6, z = cz + Math.sin(i * 2.1) * 1.6;
      soldier.position.set(x, T.battlefield.GroundHeight(x, z), z);
    });
    Place(T.player.position.x - Math.sin(yaw) * 9, T.player.position.z - Math.cos(yaw) * 9);
    T.StepFrames(2);
    const programsBefore = T.renderer.info.programs.length;
    const known = new Set(T.renderer.info.programs.map((program) => program.cacheKey));
    const thrown = T.combat.projectiles.length;
    T.Debug.Throw("Grenade", 0.45);
    const grenade = T.combat.projectiles.length > thrown ? T.combat.projectiles[T.combat.projectiles.length - 1] : null;
    let blastFrame = -1, blastMs = 0, worstMs = 0;
    for (let i = 0; grenade && i < 600; i += 1) {
      const flying = T.combat.projectiles.includes(grenade);
      if (flying) Place(grenade.position.x, grenade.position.z);
      T.StepFrames(1);
      const cpuMs = T.profiler.history[T.profiler.history.length - 1]?.cpuMs ?? 0;
      worstMs = Math.max(worstMs, cpuMs);
      if (flying && !T.combat.projectiles.includes(grenade)) { blastFrame = i; blastMs = cpuMs; }
      if (blastFrame >= 0 && i >= blastFrame + 60) break;
    }
    return {
      pomPrograms, thrown: !!grenade, blastFrame, blastMs: Math.round(blastMs), worstMs: Math.round(worstMs),
      killed: targets.filter((soldier) => !soldier.alive).length,
      born: T.renderer.info.programs.filter((program) => !known.has(program.cacheKey)).map((program) => program.name),
      programsBefore, programsAfter: T.renderer.info.programs.length,
      pom: T.graphics.pom,
    };
  });

  Report(result.pom === false && result.pomPrograms.length === 0, "存档画质在预热前生效",
    `graphics.pom=${result.pom}，正在用 POM 变体的材质 ${result.pomPrograms.length} 份` +
    (result.pomPrograms.length ? `（${[...new Set(result.pomPrograms)].slice(0, 6).join("、")}）` : ""));
  Report(result.thrown && result.blastFrame >= 0 && result.killed === 3, "手榴弹真炸死三名日军",
    `出手 ${result.thrown}，第 ${result.blastFrame} 帧爆炸，炸死 ${result.killed}/3`);
  Report(result.born.length === 0, "爆炸前后不现编着色器",
    `program ${result.programsBefore} → ${result.programsAfter}` + (result.born.length ? `（新编：${result.born.join("、")}）` : ""));
  Report(result.blastMs < MAX_BLAST_FRAME_MS, "爆炸帧不卡",
    `爆炸帧 CPU ${result.blastMs} ms，出手后最坏一帧 ${result.worstMs} ms（上限 ${MAX_BLAST_FRAME_MS} ms）`);
  Report(errors.length === 0, "页面无报错", errors.length ? errors.slice(0, 5).join(" | ") : "0 条");
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
