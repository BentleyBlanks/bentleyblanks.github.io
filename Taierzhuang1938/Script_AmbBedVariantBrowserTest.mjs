// 战场远景床（2026-09-29）真浏览器验收：网络请求、装载结果、底床与叠加段在输出端真的有电平、巷道 zone 下换 E、听者在玩家头上。
//
// 用户原话（2026-09-29）：「整体A长期存在，B和C交替的随机叠加出现；E在玩家进入巷道/半室内阶段再播放（作为替换偶尔的B和C）」。
//
// 四个场景各开一页（?whitebox=p012，第一关，唯一可玩关）：
//   default      —— 不带参数（= layered）：开机（预取）与装载阶段只请求底床 A，不请求旧 AudioAmb_BattleFar.mp3，也不请求 B/C/D/E；
//                   ambReady 之后后台请求 B、C、E（且只这三条），全部解码好；battleFar 床解码自 A；
//                   再把叠加间隔压短，量：叠加段真的出声（输出端 RMS 高于地板、量级与「素材 RMS + 宿主层电平 × 叠加增益」对得上）、
//                   B 与 C 交替、把听者 zone 探针改成 street 之后下一段是 E（不再出 B/C）、改回 open 之后回到 B/C；
//   ambBed=B     —— 只请求 B、不请求旧的与别的；battleFar 床解码自 B；没有叠加调度器、后台不请求任何东西；
//   ambBed=legacy —— 只请求旧 battleFar，不碰候选；
//   ambBed=none  —— 旧的与候选都不请求，也没有 battleFar 层。
// 每个场景还要量：battleFar 层的组增益节点上接分析器，实时量 RMS（床真的在响）；听者先断言相机与玩家头部同处
//（听者每帧贴着相机；不点「开始」量到的是主菜单相机，离玩家几百米 —— 那样量出的一切作废）。
// 另记录 Audio/Amb/*.mp3 的响应字节：开机阻塞阶段（ambReady 之前）与后台阶段（之后）各多少。
//
// 用法：node Taierzhuang1938/Script_AmbBedVariantBrowserTest.mjs   （每个场景要完整开机一次，共约 6–15 分钟）
//       node Taierzhuang1938/Script_AmbBedVariantBrowserTest.mjs --only=default   （只跑一个场景：default / B / legacy / none）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { LaunchBrowser } = await import(pathToFileURL(path.resolve(HERE, "../PrairieFire1937/Script_BrowserTestKit.mjs")).href);
const { ServeRoot } = await import(pathToFileURL(path.resolve(HERE, "Script_DevServer.mjs")).href);

const manifest = JSON.parse(fs.readFileSync(path.join(HERE, "Audio/Amb/Data_AmbManifest.json"), "utf8"));
const { AMB_BED_TARGET } = await import(pathToFileURL(path.join(HERE, "Data_AmbSources.mjs")).href);
const { BATTLE_BED_LAYERS: LAYERS } = await import(pathToFileURL(path.join(HERE, "Data_Tuning_Audio.mjs")).href);
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

async function Scenario(name, query, { overlay = false } = {}) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  const ambRequests = [];                                      // { file, at }，at = 请求时刻（ms）
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  page.on("request", (r) => { if (/\/Audio\/Amb\/[^?]+\.mp3/.test(r.url())) ambRequests.push({ file: r.url().split("/Audio/Amb/")[1].split("?")[0], at: Date.now() }); });
  console.log(`\n== ${name}  ?${query}`);
  try {
    await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?whitebox=p012&menu=0&intro=0&manual=1&quality=low&scale=small${query ? "&" + query : ""}`,
      { waitUntil: "domcontentloaded", timeout: 240000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
    const beforeStart = ambRequests.map((r) => r.file);         // 开机阶段（预取）已经发出的请求
    await page.mouse.click(480, 270).catch(() => {});
    await page.locator("#bootStart").click();
    await page.waitForFunction(() => window.Tengxian.audio.ctx?.state === "running", null, { timeout: 60000 });
    await page.waitForFunction(() => window.Tengxian.audio.ambReady, null, { timeout: 60000 });
    const ambReadyAt = Date.now();
    const requestsAtReady = ambRequests.map((r) => r.file);     // ambReady 那一刻为止请求过的（开机阻塞阶段）
    // 页内记下 B/C/E 什么时候全部解码好（相对 ambReady），别等到后面才去看：后面早就装完了，量不出多久。
    await page.evaluate(() => {
      const a = window.Tengxian.audio, t0 = performance.now();
      window.__overlayLoad = { t0, doneAt: null };
      const timer = setInterval(() => {
        if (a.bedOverlayBuffers.size >= 3 && window.__overlayLoad.doneAt == null) { window.__overlayLoad.doneAt = performance.now() - t0; clearInterval(timer); }
      }, 50);
    });

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
        hasScheduler: !!a.bedOverlaySched,
        floorDb,
      };
    }, { sampleS: SAMPLE_S, floorDb: FLOOR_DB });

    console.log(JSON.stringify({ ...run, head: { ...run.head, listenerGap: +run.head.listenerGap.toFixed(3), horizontal: +run.head.horizontal.toFixed(2), above: +run.head.above.toFixed(2) } }));
    console.log(`     开机阶段请求：${beforeStart.join(", ") || "（无）"}`);
    console.log(`     ambReady 时已请求的床：${[...new Set(requestsAtReady)].filter((f) => /Battle|Shelling|Wind/.test(f)).join(", ")}`);

    let overlayRun = null;
    let background = null;
    if (overlay) {
      // 后台装载：ambReady 之后过 loadDelayS 秒、下载队列空了才拉，一次一条。
      await page.waitForFunction(() => window.Tengxian.audio.bedOverlayBuffers.size === 3, null, { timeout: 180000 });
      background = { loadedAfterMs: await page.evaluate(() => window.__overlayLoad.doneAt), loaded: await page.evaluate(() => [...window.Tengxian.audio.bedOverlayBuffers.keys()]) };
      console.log(`     后台装载：ambReady 之后 ${(background.loadedAfterMs / 1000).toFixed(1)} s 里 ${background.loaded.join("/")} 全部解码好`);

      overlayRun = await page.evaluate(async ({ floorDb }) => {
        const g = window.Tengxian, a = g.audio;
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        // 把间隔压短好在测试里看到叠加：首段 1–2 s、段间 3–5 s、每段 9–10 s。数据表的正式值另由单测断言。
        a.ConfigureBedOverlay({ firstGapS: [1, 2], gapS: [3, 5], durS: [9, 10], fadeS: [2, 3] });
        a.bedOverlaySched.Reset();
        const Tap = (node) => { const an = a.ctx.createAnalyser(); an.fftSize = 2048; node.connect(an); return { an, data: new Float32Array(2048) }; };
        const Rms = ({ an, data }) => { an.getFloatTimeDomainData(data); let s = 0; for (let i = 0; i < data.length; i += 1) s += data[i] * data[i]; return s / data.length; };
        const heads = new Map();                                 // 叠加播放头 → { key, tap, maxDb, host level, ... }
        const started = [];
        const realZone = a.probes.zone;
        const modes = [];
        const Sample = () => {
          for (const l of a.ambLayers.filter((x) => x.overlayHost)) {
            for (const h of l.heads) {
              if (!h.overlay) continue;
              if (!heads.has(h)) {
                heads.set(h, { key: h.overlay, tap: Tap(h.g), maxDb: -200, pow: 0, n: 0, hostLevel: l.level, hostScale: l.levelScale * l.shapeLevel, born: a.ctx.currentTime, mode: a.bedOverlaySched.mode, preset: a.ambiencePreset });
                started.push(h.overlay);
              }
              const rec = heads.get(h);
              const pw = Rms(rec.tap);
              rec.maxDb = Math.max(rec.maxDb, 10 * Math.log10(pw + 1e-20));
              rec.pow += pw; rec.n += 1;
              rec.seen = a.ctx.currentTime;
            }
          }
        };
        const Drive = async (seconds) => {
          const until = performance.now() + seconds * 1000;
          while (performance.now() < until) {
            g.StepFrames(1, 1 / 30, false);
            g.camera.updateWorldMatrix(true, false);
            a.SetListener(g.camera);
            Sample();
            const m = a.bedOverlaySched.mode;
            if (modes[modes.length - 1] !== m) modes.push(m);
            await sleep(40);
          }
        };
        // 阶段 1：开阔（zone 探针照原样，01–02 洞里是 dugout，不算巷道）
        await Drive(40);
        const open = { started: [...started] };
        // 阶段 2：听者进巷道（把 zone 探针改成 street）
        const cut = started.length;
        a.SetProbes({ zone: () => "street" });
        await Drive(40);
        const lane = { started: started.slice(cut), mode: a.bedOverlaySched.mode };
        // 阶段 3：出巷道（探针改回原来的）
        const cut2 = started.length;
        a.SetProbes({ zone: realZone });
        await Drive(45);
        const back = { started: started.slice(cut2), mode: a.bedOverlaySched.mode };
        const rows = [...heads.values()].map((r) => ({ key: r.key, maxDb: +r.maxDb.toFixed(1), meanDb: +(10 * Math.log10(r.pow / Math.max(1, r.n) + 1e-20)).toFixed(1), samples: r.n, hostLevel: +r.hostLevel.toFixed(4), hostScale: +r.hostScale.toFixed(3), mode: r.mode, preset: r.preset, born: +r.born.toFixed(1) }));
        return { open, lane, back, rows, modes, timeline: a.bedOverlaySched.Snapshot().timeline.map((r) => ({ key: r.key, mode: r.mode, zone: r.zone, startAt: +r.startAt.toFixed(1), endAt: +r.endAt.toFixed(1), released: r.released })),
          liveNodes: a.liveNodes, errors: a.ambErrors, lastError: a.lastError, floorDb };
      }, { floorDb: FLOOR_DB });
      console.log(JSON.stringify(overlayRun));
    }
    // 字节按磁盘上的文件大小算（本地预览服务的 content-length 不一定给）；阻塞 / 后台按请求发出的时刻与 ambReady 的先后分。
    const bytes = { blocking: 0, background: 0, blockingFiles: [], backgroundFiles: [] };
    for (const r of ambRequests) {
      const size = fs.statSync(path.join(HERE, "Audio/Amb", r.file)).size;
      const bucket = r.at > ambReadyAt ? "background" : "blocking";
      bytes[bucket] += size;
      bytes[bucket + "Files"].push(`${r.file} ${size}`);
    }
    console.log(`     Amb mp3 字节：开机阻塞阶段 ${bytes.blocking}，之后（后台）${bytes.background}`);
    return { run, ambRequests, beforeStart, requestsAtReady, errors, overlayRun, background, bytes, ambReadyAt };
  } finally {
    await page.close().catch(() => {});
  }
}

const isVariantFile = (f) => Object.values(manifest.bedVariants).some((v) => v.file === f);
const OLD = "AudioAmb_BattleFar.mp3";
const fileOf = (key) => manifest.bedVariants[key].file;

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
    const r = await Scenario("default（layered）", "", { overlay: true });
    CommonChecks("default", r);
    const all = new Set(r.ambRequests.map((x) => x.file));
    const blocking = new Set(r.requestsAtReady);
    const A = fileOf("A");
    Check(all.has(A) && blocking.has(A), "default：开机阻塞阶段请求了底床 A", "default：阻塞阶段没请求 A");
    Check(!all.has(OLD), "default：从头到尾没请求旧 AudioAmb_BattleFar.mp3", "default：还是请求了旧 battleFar");
    Check(!all.has(fileOf("D")), "default：D 从不请求", "default：请求了 D");
    Check(!["B", "C", "E"].some((k) => blocking.has(fileOf(k))), "default：开机阻塞阶段（ambReady 之前）不请求 B/C/E", `default：阻塞阶段请求了 ${["B", "C", "E"].filter((k) => blocking.has(fileOf(k)))}`);
    Check(!["B", "C", "E"].some((k) => r.beforeStart.includes(fileOf(k))), "default：开机预取阶段同样不请求 B/C/E", "default：预取请求了叠加素材");
    Check(["B", "C", "E"].every((k) => all.has(fileOf(k))), "default：ambReady 之后后台请求了 B、C、E", `default：后台没请求齐 ${["B", "C", "E"].filter((k) => !all.has(fileOf(k)))}`);
    const startsAfter = r.ambRequests.filter((x) => ["B", "C", "E"].some((k) => x.file === fileOf(k))).map((x) => x.at - r.ambReadyAt);
    Check(startsAfter.every((t) => t > 0), `default：B/C/E 的请求都发生在 ambReady 之后（${startsAfter.map((t) => (t / 1000).toFixed(1) + " s").join(" / ")}）`, "default：有叠加素材的请求早于 ambReady");
    Check([...all].filter(isVariantFile).length === 4, "default：候选文件只请求了 A、B、C、E 四条", `default：请求了 ${[...all].filter(isVariantFile)}`);
    Check(r.run.choice.mode === "layered" && r.run.choice.variant === "A" && r.run.hasScheduler, "default：选择结果 = layered（底床 A，有叠加调度器）", `default：choice ${JSON.stringify(r.run.choice)}`);
    BedAudible("default", r.run, manifest.bedVariants.A.seconds, manifest.bedVariants.A.rmsDbfs);

    const o = r.overlayRun;
    Check(o.errors.length === 0 && !o.lastError, "default：叠加阶段没有装载错误 / 引擎异常", `default：叠加阶段 errors ${JSON.stringify(o.errors)} lastError ${JSON.stringify(o.lastError)}`);
    const seq = (s) => s.join("");
    Check(o.open.started.length >= 2 && o.open.started.every((k) => k === "B" || k === "C"), `default：开阔阶段叠加段 ${seq(o.open.started)}（只有 B/C）`, `default：开阔阶段叠加段 ${seq(o.open.started)}`);
    Check(o.open.started.every((k, i) => i === 0 || k !== o.open.started[i - 1]), `default：B 与 C 交替（${seq(o.open.started)}）`, `default：B/C 没有交替 ${seq(o.open.started)}`);
    Check(o.lane.mode === "enclosed" && o.lane.started.length >= 1 && o.lane.started.every((k) => k === "E" || k === "B" || k === "C") && o.lane.started.slice(1).every((k) => k === "E"),
      `default：听者 zone = street 之后调度器进入 enclosed，之后的叠加段是 E（${seq(o.lane.started)}）`, `default：巷道阶段 mode ${o.lane.mode} 叠加段 ${seq(o.lane.started)}`);
    Check(o.lane.started.includes("E"), "default：巷道里放出了 E", "default：巷道里没放出 E");
    Check(o.back.mode === "open" && o.back.started.length >= 1 && o.back.started.every((k) => k === "B" || k === "C"), `default：出巷道回到 B/C（${seq(o.back.started)}）`, `default：出巷道后 mode ${o.back.mode} 叠加段 ${seq(o.back.started)}`);
    // 叠加段在输出端真的有电平：宿主层电平 × 叠加增益 × 素材 RMS
    const audible = o.rows.filter((row) => row.meanDb > FLOOR_DB);
    Check(audible.length === o.rows.length && o.rows.length >= 4, `default：${o.rows.length} 段叠加全部在输出端高于地板`, `default：叠加段 ${o.rows.length} 段，其中 ${audible.length} 段高于地板`);
    const worst = o.rows.map((row) => {
      const expected = manifest.bedVariants[row.key].rmsDbfs + 20 * Math.log10(row.hostLevel * LAYERS.gain[row.key]);
      return { ...row, expected, diff: row.meanDb - expected };
    });
    // 每段整个存活期里逐窗口（46 ms）功率取平均，与「素材整段 RMS + 宿主层电平 × 叠加增益」比：淡入淡出让平均低 2–3 dB，稀疏的大动静让个别窗口高十几 dB
    //（peak 窗口不可比，所以比均值）。只比放完整段的（采样 ≥ 150 个 ≈ 6 s）：被切档提前收尾的、被测试阶段结尾截断的，存活期短，均值被淡入淡出拉得很低，不可比（它们仍要求高于地板，见上一条）。
    const full = worst.filter((w) => w.samples >= 150);
    Check(full.length >= 6 && full.every((w) => w.diff > -9 && w.diff < 4),
      `default：${full.length} 段放满的叠加，输出端功率均值与「素材 RMS + 宿主层电平 × 叠加增益」相差 ${full.map((w) => w.diff.toFixed(1)).join(" / ")} dB`,
      `default：叠加段电平偏离预期（放满的 ${full.length} 段）${JSON.stringify(full)}`);
    // 「开机后台」的字节：阻塞阶段只有 A，后台是 B/C/E
    console.log(`     阻塞阶段 Amb mp3：${r.bytes.blockingFiles.join("；")}`);
    console.log(`     后台阶段 Amb mp3：${r.bytes.backgroundFiles.join("；")}`);
    Check(r.bytes.background === ["B", "C", "E"].reduce((s, k) => s + manifest.bedVariants[k].bytes, 0), "default：后台阶段字节 = B + C + E 三个文件的大小", `default：后台字节 ${r.bytes.background}`);
  }
  if (!only || only === VARIANT) {
    const r = await Scenario(`ambBed=${VARIANT}`, `ambBed=${VARIANT}`);
    CommonChecks(`ambBed=${VARIANT}`, r);
    const all = new Set(r.ambRequests.map((x) => x.file));
    const want = fileOf(VARIANT);
    Check(all.has(want), `ambBed=${VARIANT}：请求了 ${want}`, `ambBed=${VARIANT}：没请求 ${want}`);
    Check(!all.has(OLD), `ambBed=${VARIANT}：没有请求旧 battleFar`, `ambBed=${VARIANT}：还是请求了旧 battleFar`);
    Check([...all].filter(isVariantFile).length === 1, `ambBed=${VARIANT}：只请求了被选中的这一条候选`, `ambBed=${VARIANT}：请求了多条候选 ${[...all].filter(isVariantFile)}`);
    Check(r.beforeStart.includes(want) && !r.beforeStart.includes(OLD), `ambBed=${VARIANT}：开机（预取）阶段就只拉这一条`, `ambBed=${VARIANT}：开机阶段请求 ${r.beforeStart.filter((f) => /BattleFar/.test(f))}`);
    Check(r.run.choice.variant === VARIANT && r.run.choice.source === "url" && r.run.choice.mode === "variant", `ambBed=${VARIANT}：选择结果 = ${VARIANT}（url、单选）`, `ambBed=${VARIANT}：choice ${JSON.stringify(r.run.choice)}`);
    Check(!r.run.hasScheduler, `ambBed=${VARIANT}：单选不叠加（没有调度器）`, `ambBed=${VARIANT}：有调度器`);
    BedAudible(`ambBed=${VARIANT}`, r.run, manifest.bedVariants[VARIANT].seconds, manifest.bedVariants[VARIANT].rmsDbfs);
  }
  if (!only || only === "legacy") {
    const r = await Scenario("ambBed=legacy", "ambBed=legacy");
    CommonChecks("legacy", r);
    const all = new Set(r.ambRequests.map((x) => x.file));
    Check(all.has(OLD) && ![...all].some(isVariantFile), "legacy：只请求旧 battleFar，一条候选都没碰", `legacy：请求了 ${[...all].filter(isVariantFile)}`);
    Check(r.run.choice.mode === "legacy" && !r.run.hasScheduler, "legacy：旧床、没有叠加", `legacy：choice ${JSON.stringify(r.run.choice)}`);
    BedAudible("legacy", r.run, manifest.beds.battleFar.seconds, AMB_BED_TARGET.rmsDb);
  }
  if (!only || only === "none") {
    const r = await Scenario("ambBed=none", "ambBed=none");
    CommonChecks("ambBed=none", r);
    const all = new Set(r.ambRequests.map((x) => x.file));
    Check(!all.has(OLD) && ![...all].some(isVariantFile), "ambBed=none：旧的与候选都没请求", `ambBed=none：请求了 ${[...all].filter((f) => /BattleFar/.test(f))}`);
    Check(r.run.layers === 0 && r.run.battleFarSeconds === null, "ambBed=none：没有 battleFar 层", `ambBed=none：还有 battleFar 层 ${r.run.layers}`);
    Check(r.run.choice.choice === "none" && r.run.choice.dropped && !r.run.hasScheduler, "ambBed=none：选择结果 = none", `ambBed=none：choice ${JSON.stringify(r.run.choice)}`);
  }
} catch (err) {
  Fail(`异常：${err && err.stack || err}`);
} finally {
  await browser.close().catch(() => {});
  server.close();
}
console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);
