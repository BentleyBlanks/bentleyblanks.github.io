// ===========================================================================
// Script_WhiteboxShaderWarmTest.mjs —— 白盒画质（出厂默认档）下，着色器预热要编对那一份
//
// 事故（2026-10-01，用户报「本地加载也很慢」）：第一关关掉 program 缓存开机 63 s，主线程有 22.5 s
// 卡在「第一次用某个 program」上。预热的提交编译（renderer.compile）在白盒那一层之外跑：
// 出画前 WhiteboxSceneRenderer.Begin 会藏关卡灯、换中性光、把场景资产换成白盒材质，而提交时
// 场景还是「关卡灯光 + 原材质」—— 缓存键对不上，提交的 135 个 program 一个都没用上，
// 真正要用的 64 个全在出画时同步链接。其余预热门（RespawnShaderWarmTest / SavedGraphicsWarmTest /
// ExplosionRangeTest）都用 quality=high/medium 跑，白盒档从来没被量过。
// 修法：Script_Main.CompileAsRendered —— 提交编译绑 HDR 主靶并套上白盒那一层（Begin 的 compileRoots）。
//
// 断言（只数 program，不量毫秒，机器忙闲不影响结论）：
//   1. 真的在白盒档（post.whiteboxScene 在）。
//   2. 开机到「进城」可点，主场景那一趟（PostPipeline._RenderScene）里现建的 program = 0 ——
//      预热漏交的材质都会在这里同步链接。修前 64。
//   3. 提交编译建的 program 至少一半在开机结束前真被用上（修前 0/135）。故意留到以后用的
//      （伤口变体、断肢块）不多，阈值只拦「整批编错状态」。
//   4. 点「进城」后连跑 300 帧，program 一个不新编。
//   5. 页面没有 pageerror / console.error。
//
// 用法：node Taierzhuang1938/Script_WhiteboxShaderWarmTest.mjs
// ===========================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const PLAY_FRAMES = 300;
const MIN_USED_SHARE = 0.5;
/**
 * 进城后现编、但这条测试落地时 master 上就已经有的两份（2026-10-01 白盒档实测，修前修后都在）。
 * 都是开场开演后才临时造的东西，预热时场上还没有：
 *   - openingFill：顺子坐着压弹那一拍的弹夹 / 背带等道具（Script_OpeningFirstPerson 的 OpeningFirstPerson_*，
 *     双面无名 MeshStandardMaterial），第 16 帧；
 *   - faceBlood：SB03–SB04A 被俘战友脸上的血（Script_CharacterFaceBlood，`face-blood-1` 补丁变体），第 22 帧。
 * 修好一项就从这里删掉一项；**别往这里加新的** —— 新的现编就是预热漏了。
 */
const KNOWN_LATE = [
  { id: "openingFill", userPrefix: "OpeningFirstPerson_" },
  { id: "faceBlood", keyPart: "face-blood-1" },
];

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
// 在 WebGL 入口记账：每个 program 是谁 link 的（提交编译 / 出画的哪一趟）、开机期间有没有被用上。
// 「用上」= three 第一次取它的 uniform（WebGLUniforms 构造里那次 ACTIVE_UNIFORMS 查询）。
await page.addInitScript(() => {
  Error.stackTraceLimit = 40;
  const proto = WebGL2RenderingContext.prototype;
  const link = proto.linkProgram, param = proto.getProgramParameter;
  const records = new WeakMap();
  const ledger = window.__warmLedger = { links: [], frozen: false };
  proto.linkProgram = function (program) {
    const stack = new Error().stack;
    const record = {
      origin: /WebGLRenderer\.compile/.test(stack) ? "compile" : /_RenderScene/.test(stack) ? "scenePass" : "otherPass",
      used: false, afterBoot: ledger.frozen,
    };
    records.set(program, record);
    ledger.links.push(record);
    return link.call(this, program);
  };
  proto.getProgramParameter = function (program, pname) {
    if (pname === this.ACTIVE_UNIFORMS && !ledger.frozen) {
      const record = records.get(program);
      if (record) record.used = true;
    }
    return param.call(this, program, pname);
  };
});

let failed = false;
const Report = (ok, name, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name} — ${detail}`);
  if (!ok) failed = true;
};

try {
  const port = server.address().port;
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=p012&quality=whitebox&manual=1&scale=small`,
    { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready && !document.getElementById("bootStart")?.disabled,
    null, { timeout: 600000, polling: 500 });

  const boot = await page.evaluate(() => {
    const T = window.Taierzhuang, ledger = window.__warmLedger;
    ledger.frozen = true;
    const compiled = ledger.links.filter((r) => r.origin === "compile");
    return {
      whitebox: !!T.post?.whiteboxScene,
      links: ledger.links.length,
      scenePass: ledger.links.filter((r) => r.origin === "scenePass").length,
      compiled: compiled.length,
      compiledUsed: compiled.filter((r) => r.used).length,
      programs: T.renderer.info.programs.length,
    };
  });
  Report(boot.whitebox, "白盒画质档", `post.whiteboxScene ${boot.whitebox ? "在" : "不在"}`);
  Report(boot.scenePass === 0, "预热不漏交：主场景那一趟不现建 program",
    `开机共 link ${boot.links} 个，主场景一趟现建 ${boot.scenePass} 个（修前 64）`);
  const share = boot.compiled ? boot.compiledUsed / boot.compiled : 0;
  Report(share >= MIN_USED_SHARE, "提交编译编的是出画要用的那一份",
    `提交编译 ${boot.compiled} 个，开机结束前用上 ${boot.compiledUsed} 个（${Math.round(share * 100)}%，下限 ${MIN_USED_SHARE * 100}%；修前 0/135）`);

  const play = await page.evaluate(({ frames, knownLate }) => {
    const T = window.Taierzhuang;
    const known = new Set(T.renderer.info.programs.map((program) => program.cacheKey));
    const before = T.renderer.info.programs.length;
    document.getElementById("bootStart").click();
    T.StepFrames(frames);
    const born = T.renderer.info.programs.filter((program) => !known.has(program.cacheKey));
    // 每个新 program 挂在哪些物体上（物体名一路往上数），用来对已知清单。
    const Users = (program) => {
      const names = [];
      T.scene.traverse((object) => {
        for (const material of [object.material].flat()) {
          if (!material || T.renderer.properties.get(material).currentProgram !== program) continue;
          for (let node = object; node; node = node.parent) if (node.name) names.push(node.name);
        }
      });
      return names;
    };
    const late = born.map((program) => {
      const users = Users(program);
      const tag = knownLate.find((entry) => (entry.keyPart && program.cacheKey.includes(entry.keyPart))
        || (entry.userPrefix && users.some((name) => name.startsWith(entry.userPrefix))));
      return { name: program.name || "(unnamed)", known: tag?.id || null };
    });
    return { running: T.state.running, before, after: T.renderer.info.programs.length, late };
  }, { frames: PLAY_FRAMES, knownLate: KNOWN_LATE });
  const unexpected = play.late.filter((entry) => !entry.known);
  const tolerated = play.late.filter((entry) => entry.known);
  Report(play.running && unexpected.length === 0, `进城后 ${PLAY_FRAMES} 帧不现编着色器`,
    `running=${play.running}，program ${play.before} → ${play.after}`
    + (unexpected.length ? `（新编：${unexpected.map((entry) => entry.name).slice(0, 8).join("、")}）` : "")
    + (tolerated.length ? `；已知待修 ${tolerated.map((entry) => `${entry.known}:${entry.name}`).join("、")}` : ""));
  Report(errors.length === 0, "页面无报错", errors.length ? errors.slice(0, 5).join(" | ") : "0 条");
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
