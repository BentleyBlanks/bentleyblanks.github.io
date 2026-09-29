// 战场远景床候选（2026-09-29）真浏览器验收：网络请求、装载结果、床在输出端真的有电平、听者在玩家头上。
//
// 三个场景各开一页（?whitebox=p012，第一关，唯一可玩关）：
//   default   —— 不带参数：只请求旧 AudioAmb_BattleFar.mp3，开机（预取）与装载都不碰任何候选；
//   ambBed=B  —— 请求 B 的文件、不请求旧的；battleFar 这个床名解码自 B（时长对得上清单）；
//   ambBed=none —— 两条都不请求，也没有 battleFar 层。
// 每个场景还要量：battleFar 层的组增益节点上接分析器，实时量 RMS（床真的在响、量级与「素材 RMS + 层增益」对得上）；
// 远声组与环境总线、总输出的 RMS 只记录不断言（那里还有前线交火生成器等别的声部）。
//
// 听者：先断言相机与玩家头部同处（听者每帧贴着相机；不点「开始」量到的是主菜单相机，离玩家几百米 —— 那样量出的一切作废）。
//
// 用法：node Taierzhuang1938/Script_AmbBedVariantBrowserTest.mjs   （每个场景要完整开机一次，共约 3–8 分钟）
//       node Taierzhuang1938/Script_AmbBedVariantBrowserTest.mjs --only=B   （只跑一个场景：default / B / none）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { LaunchBrowser } = await import(pathToFileURL(path.resolve(HERE, "../PrairieFire1937/Script_BrowserTestKit.mjs")).href);
const { ServeRoot } = await import(pathToFileURL(path.resolve(HERE, "Script_DevServer.mjs")).href);

const manifest = JSON.parse(fs.readFileSync(path.join(HERE, "Audio/Amb/Data_AmbManifest.json"), "utf8"));
const { AMB_BED_TARGET } = await import(pathToFileURL(path.join(HERE, "Data_AmbSources.mjs")).href);
const VARIANT = "B";
const SAMPLE_S = 8;
const FLOOR_DB = -85;          // 低于这个当作没有声音
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7) ?? null;

let failed = 0;
const Fail = (msg) => { console.log(`FAIL ${msg}`); failed += 1; };
const Ok = (msg) => console.log(`ok   ${msg}`);
const Check = (cond, ok, bad) => (cond ? Ok(ok) : Fail(bad ?? ok));

const server = await ServeRoot(path.resolve(HERE, ".."), 0);
const port = server.address().port;
const browser = await LaunchBrowser();

async function Scenario(name, query) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  const ambRequests = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  page.on("request", (r) => { if (/\/Audio\/Amb\/[^?]+\.mp3/.test(r.url())) ambRequests.push(r.url().split("/Audio/Amb/")[1].split("?")[0]); });
  console.log(`\n== ${name}  ?${query}`);
  try {
    await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=p012&menu=0&intro=0&manual=1&quality=low&scale=small${query ? "&" + query : ""}`,
      { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
    const beforeStart = [...ambRequests];                       // 开机阶段（预取）已经发出的请求
    await page.mouse.click(480, 270).catch(() => {});
    await page.locator("#bootStart").click();
    await page.waitForFunction(() => window.Tengxian.audio.ctx?.state === "running", null, { timeout: 60000 });
    await page.waitForFunction(() => window.Tengxian.audio.ambReady, null, { timeout: 60000 });

    const run = await page.evaluate(async ({ sampleS, floorDb }) => {
      const g = window.Tengxian, a = g.audio;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      // 先推 3 s 游戏帧：让第一关的开场声景（防炮洞 / 开场两档环境）把床摆起来。
      for (let i = 0; i < 90; i += 1) { g.StepFrames(1, 1 / 30, false); await sleep(30); }
      g.camera.updateWorldMatrix(true, false);
      a.SetListener(g.camera);
      const head = {
        camera: g.camera.position.toArray().map((v) => +v.toFixed(2)),
        player: g.player.position.toArray().map((v) => +v.toFixed(2)),
        listenerGap: Math.hypot(a.listenerPos.x - g.camera.position.x, a.listenerPos.y - g.camera.position.y, a.listenerPos.z - g.camera.position.z),
        horizontal: Math.hypot(g.camera.position.x - g.player.position.x, g.camera.position.z - g.player.position.z),
        above: g.camera.position.y - g.player.position.y,
      };
      const Tap = (node) => { const an = a.ctx.createAnalyser(); an.fftSize = 2048; node.connect(an); return { an, data: new Float32Array(2048) }; };
      const Rms = ({ an, data }) => { an.getFloatTimeDomainData(data); let s = 0; for (let i = 0; i < data.length; i += 1) s += data[i] * data[i]; return s / data.length; };
      const taps = new Map();                                    // battleFar 层 → 分析器（换档时层会被换掉，每轮重新登记）
      const far = Tap(a.farGain), amb = Tap(a.ambienceBus), master = Tap(a.softClip);
      const acc = { layer: 0, layerN: 0, far: 0, amb: 0, master: 0, n: 0, layerSeen: new Set(), levels: [], presets: new Set() };
      const until = performance.now() + sampleS * 1000;
      while (performance.now() < until) {
        g.StepFrames(1, 1 / 30, false);
        g.camera.updateWorldMatrix(true, false);
        a.SetListener(g.camera);
        acc.presets.add(a.ambiencePreset);
        for (const l of a.ambLayers.filter((x) => x.bed === "battleFar" && x.group)) {
          if (!taps.has(l)) taps.set(l, Tap(l.group));
          acc.layerSeen.add(l);
          acc.levels.push(l.level * l.levelScale);
        }
        let layerPower = 0, any = false;
        for (const [l, t] of taps) if (a.ambLayers.includes(l)) { layerPower += Rms(t); any = true; }
        if (any) { acc.layer += layerPower; acc.layerN += 1; }
        acc.far += Rms(far); acc.amb += Rms(amb); acc.master += Rms(master); acc.n += 1;
        await sleep(40);
      }
      const dB = (p) => (p > 0 ? 10 * Math.log10(p) : -200);
      const buf = a.ambBuffers.get("battleFar");
      return {
        head,
        choice: a.ambBedChoice,
        battleFarSeconds: buf ? +buf.duration.toFixed(2) : null,
        layers: acc.layerSeen.size,
        presets: [...acc.presets],
        expectedLevelDb: acc.levels.length ? 20 * Math.log10(acc.levels.reduce((s, v) => s + v, 0) / acc.levels.length) : null,
        layerRmsDb: acc.layerN ? dB(acc.layer / acc.layerN) : null,
        farRmsDb: dB(acc.far / acc.n), ambRmsDb: dB(acc.amb / acc.n), masterRmsDb: dB(acc.master / acc.n),
        errors: a.ambErrors,
        floorDb,
      };
    }, { sampleS: SAMPLE_S, floorDb: FLOOR_DB });

    console.log(JSON.stringify({ ...run, head: { ...run.head, listenerGap: +run.head.listenerGap.toFixed(3), horizontal: +run.head.horizontal.toFixed(2), above: +run.head.above.toFixed(2) } }));
    console.log(`     开机阶段请求：${beforeStart.join(", ") || "（无）"}`);
    console.log(`     全部 Amb 床请求：${[...new Set(ambRequests)].filter((f) => /Battle|Shelling|Wind/.test(f)).join(", ")}`);
    return { run, ambRequests, beforeStart, errors };
  } finally {
    await page.close().catch(() => {});
  }
}

const isVariantFile = (f) => Object.values(manifest.bedVariants).some((v) => v.file === f);
const OLD = "AudioAmb_BattleFar.mp3";

function CommonChecks(name, { run, errors }) {
  Check(run.head.listenerGap < 0.01, `${name}：听者每帧贴着相机`, `${name}：听者离相机 ${run.head.listenerGap} m`);
  Check(run.head.horizontal < 0.8 && run.head.above > 0.1 && run.head.above < 2.2,
    `${name}：相机在玩家头部（水平 ${run.head.horizontal.toFixed(2)} m，高出脚底 ${run.head.above.toFixed(2)} m）`,
    `${name}：相机离玩家头部太远（水平 ${run.head.horizontal.toFixed(2)} m，高出 ${run.head.above.toFixed(2)} m）—— 量到的多半是主菜单相机，数据作废`);
  Check(run.errors.length === 0, `${name}：环境包没有装载错误`, `${name}：ambErrors ${JSON.stringify(run.errors)}`);
  Check(errors.length === 0, `${name}：页面没有异常`, `${name}：pageerror ${errors.join(" | ")}`);
}

function BedAudible(name, run, expectedFileSeconds, bedRmsDb) {
  Check(run.layers >= 1, `${name}：预设里的 battleFar 层起了 ${run.layers} 条（${run.presets.join(" / ")}）`, `${name}：没有 battleFar 层`);
  Check(run.layerRmsDb != null && run.layerRmsDb > FLOOR_DB,
    `${name}：battleFar 层输出端 RMS ${run.layerRmsDb?.toFixed(1)} dBFS，高于地板 ${FLOOR_DB}`,
    `${name}：battleFar 层输出端 RMS ${run.layerRmsDb} 没有高过地板 ${FLOOR_DB}（床没在响）`);
  // 输出端量级应≈「素材 RMS + 层增益 × 强度倍率」；床里有稀疏的大动静，8 s 窗口的 RMS 会晃几分贝，给 ±8 dB。
  const expected = bedRmsDb + run.expectedLevelDb;
  Check(Math.abs(run.layerRmsDb - expected) <= 8,
    `${name}：层输出端 ${run.layerRmsDb.toFixed(1)} dBFS，与「素材 ${bedRmsDb.toFixed(1)} + 层增益 ${run.expectedLevelDb.toFixed(1)}」= ${expected.toFixed(1)} 相差 ${(run.layerRmsDb - expected).toFixed(1)} dB`,
    `${name}：层输出端 ${run.layerRmsDb.toFixed(1)} dBFS 偏离预期 ${expected.toFixed(1)} 超过 8 dB`);
  Check(run.farRmsDb > FLOOR_DB || run.ambRmsDb > FLOOR_DB,
    `${name}：远声组 ${run.farRmsDb.toFixed(1)} / 环境总线 ${run.ambRmsDb.toFixed(1)} dBFS，至少一路高于地板`,
    `${name}：远声组与环境总线都在地板下`);
  Check(run.battleFarSeconds && Math.abs(run.battleFarSeconds - expectedFileSeconds) < 0.1,
    `${name}：battleFar 床时长 ${run.battleFarSeconds} s（应为 ${expectedFileSeconds} s）`,
    `${name}：battleFar 床时长 ${run.battleFarSeconds} s，与清单 ${expectedFileSeconds} s 不符`);
}

try {
  if (!only || only === "default") {
    const r = await Scenario("default", "");
    CommonChecks("default", r);
    const all = new Set(r.ambRequests);
    Check(all.has(OLD), "default：请求了旧 AudioAmb_BattleFar.mp3", "default：没请求旧 battleFar");
    Check(![...all].some(isVariantFile), "default：一条候选都没请求", `default：请求了候选 ${[...all].filter(isVariantFile)}`);
    Check(![...r.beforeStart].some(isVariantFile) && r.beforeStart.includes(OLD), "default：开机（预取）阶段同样不碰候选", "default：开机阶段请求不对");
    Check(r.run.choice.choice === null && r.run.choice.source === "default", "default：选择结果 = 现行（default）", `default：choice ${JSON.stringify(r.run.choice)}`);
    BedAudible("default", r.run, manifest.beds.battleFar.seconds, AMB_BED_TARGET.rmsDb);
  }
  if (!only || only === VARIANT) {
    const r = await Scenario(`ambBed=${VARIANT}`, `ambBed=${VARIANT}`);
    CommonChecks(`ambBed=${VARIANT}`, r);
    const all = new Set(r.ambRequests);
    const want = manifest.bedVariants[VARIANT].file;
    Check(all.has(want), `ambBed=${VARIANT}：请求了 ${want}`, `ambBed=${VARIANT}：没请求 ${want}`);
    Check(!all.has(OLD), `ambBed=${VARIANT}：没有请求旧 battleFar`, `ambBed=${VARIANT}：还是请求了旧 battleFar`);
    Check([...all].filter(isVariantFile).length === 1, `ambBed=${VARIANT}：只请求了被选中的这一条候选`, `ambBed=${VARIANT}：请求了多条候选 ${[...all].filter(isVariantFile)}`);
    Check(r.beforeStart.includes(want) && !r.beforeStart.includes(OLD), `ambBed=${VARIANT}：开机（预取）阶段就只拉这一条`, `ambBed=${VARIANT}：开机阶段请求 ${r.beforeStart.filter((f) => /BattleFar/.test(f))}`);
    Check(r.run.choice.variant === VARIANT && r.run.choice.source === "url", `ambBed=${VARIANT}：选择结果 = ${VARIANT}（url）`, `ambBed=${VARIANT}：choice ${JSON.stringify(r.run.choice)}`);
    BedAudible(`ambBed=${VARIANT}`, r.run, manifest.bedVariants[VARIANT].seconds, manifest.bedVariants[VARIANT].rmsDbfs);
  }
  if (!only || only === "none") {
    const r = await Scenario("ambBed=none", "ambBed=none");
    CommonChecks("ambBed=none", r);
    const all = new Set(r.ambRequests);
    Check(!all.has(OLD) && ![...all].some(isVariantFile), "ambBed=none：旧的与候选都没请求", `ambBed=none：请求了 ${[...all].filter((f) => /BattleFar/.test(f))}`);
    Check(r.run.layers === 0 && r.run.battleFarSeconds === null, "ambBed=none：没有 battleFar 层", `ambBed=none：还有 battleFar 层 ${r.run.layers}`);
    Check(r.run.choice.choice === "none" && r.run.choice.dropped, "ambBed=none：选择结果 = none", `ambBed=none：choice ${JSON.stringify(r.run.choice)}`);
  }
} catch (err) {
  Fail(`异常：${err && err.stack || err}`);
} finally {
  await browser.close().catch(() => {});
  server.close();
}
console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);
