// ===========================================================================
// Script_RailBridgeShots.mjs —— 18 毁桥实拍：按固定时间点出图（docs/Data_RailBridge.md）
//
//   node Taierzhuang1938/Script_RailBridgeShots.mjs [--views=safe,cover,side] [--quality=high] [--times=...]
//
// 真浏览器、真关卡（?whitebox=p012&missionStage=18&manual=1）：把流程推到 BridgeWithdraw，
// 摆好「药已装好、人已走净」，由爆破手按起爆器（FirstLevelBridge 的正常压杆 → Fire 路径），
// 之后逐帧步进，在每个时间点从指定机位出一张图，并记下桥的状态、粒子池与 draw call。
// 一个机位拍完用事实回退把桥还原（RailBridgeSet 只看 bridgeDestroyed），再拍下一个机位。
// 截图与日志只进忽略目录 _shots/RailBridge；这是取证工具，不是通关证据。
// ===========================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const Arg = (name, fallback = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = path.join(here, "_shots", "RailBridge");
const QUALITY = Arg("quality", "high");
const [W, H] = (Arg("size", "1280x720")).split("x").map(Number);
// 机位：safe = 爆破安全区（玩家被要求退到的地方）、cover = 南岸射位、side = 东南岸斜侧（看得见 V 形折断）。
const VIEWS = {
  safe: { eye: [-66, 201], target: [-77, 3.0, 153] },
  cover: { eye: [-80.5, 181], target: [-77, 2.2, 153] },
  side: { eye: [-44, 173], target: [-77, 1.0, 152] },
};
const TIMES = (Arg("times", "-0.3,0.05,0.15,0.3,0.6,1,1.4,2,3,4.5,6.5,10")).split(",").map(Number);

function Setup() {
  const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
  g.player.health = 1e9;
  for (const actor of r.enemies.values()) { actor.health = 0; actor.alive = false; }
  for (let i = 0; i < 80; i += 1) { r.flow.index = i; if (r.flow.stage.id === "BridgeWithdraw") break; }
  r.flow.Enter();
  r.flow.facts.add("blastZoneCleared");
  g.StepFrames(20, 1 / 60, false);
  return { stage: r.flow.stage.id, set: r.railBridgeSet.State() };
}

function Place({ eye, target }) {
  const g = window.Tengxian, p = g.player;
  const y = g.battlefield.GroundHeight(eye[0], eye[1]);
  p.position.set(eye[0], y, eye[1]);
  p.body?.Teleport?.(p.position);
  p.velocity?.set?.(0, 0, 0);
  const e = p.EyePosition, dx = target[0] - eye[0], dz = target[2] - eye[1];
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.atan2(target[1] - e.y, Math.hypot(dx, dz));
  g.StepFrames(4, 1 / 60, true);
  return { eye: [e.x, e.y, e.z].map((v) => +v.toFixed(2)) };
}

function Arm() {
  const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
  r.bridge.blast = { set: 0, ready: true, fired: false, waitedS: 0, stuckS: 0, overdue: false, lastInside: null,
    gazeS: 0, pressing: false, pressS: 0, sinceFireS: 0, ordered: false, exploderManned: true };
  r.bridge.Press(true);
  return r.railBridgeSet.State();
}

function StepTo(t) {
  const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), s = r.railBridgeSet;
  // 起爆之前按压杆计时（负数），起爆之后按 RailBridgeSet 自己的钟（坍塌完了也接着走）。
  const Now = () => (s.detonatedAt == null ? (r.bridge.blast?.pressS ?? 0) - 0.45 : s.clock - s.detonatedAt);
  let frames = 0;
  while (Now() < t - 1e-4 && frames < 3600) { g.StepFrames(1, 1 / 60, false); frames += 1; }
  const info = g.renderer.info;
  info.autoReset = false; info.reset();
  g.StepFrames(1, 1 / 60, true);
  const calls = info.render.calls, triangles = info.render.triangles;
  info.autoReset = true;
  const pools = Object.fromEntries(Object.entries(g.vfx.pools || {}).map(([k, p]) => [k, p.mesh?.count ?? null]));
  return { t: +Now().toFixed(3), frames, set: s.State(), calls, triangles, pools, stage: r.flow.stage.id,
    facts: ["bridgeDestroyed", "exploderPressed", "marchOrderHeard"].filter((f) => r.Has(f)),
    shake: +(g.player.shake?.blastTrauma ?? 0).toFixed(3), fov: +g.camera.fov.toFixed(1) };
}

function Reset() {
  const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime();
  for (const fact of ["bridgeDestroyed", "exploderPressed", "marchOrderHeard", "nightArrivalPlaced"]) r.flow.facts.delete(fact);
  for (let i = 0; i < 80; i += 1) { r.flow.index = i; if (r.flow.stage.id === "BridgeWithdraw") break; }
  r.flow.Enter();
  r.flow.facts.add("blastZoneCleared");
  g.StepFrames(6, 1 / 60, false);
  return r.railBridgeSet.State();
}

async function Main() {
  fs.mkdirSync(OUT, { recursive: true });
  const views = (Arg("views", "safe,side")).split(",").filter((v) => VIEWS[v]);
  const server = await ServeRoot(path.resolve(here, ".."), 0);
  const browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGEERROR", String(e)); });
  const log = { quality: QUALITY, size: [W, H], started: new Date().toISOString(), views: {}, errors };
  try {
    const url = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&missionStage=18&shot=1&manual=1&quality=${QUALITY}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian.Debug.FirstLevelMissionRuntime()?.railBridgeSet,
      null, { timeout: 400000 });
    const loaded = await page.evaluate(async () => {
      const r = window.Tengxian.Debug.FirstLevelMissionRuntime();
      await r.railBridgeSet.Load();
      return r.railBridgeSet.State();
    });
    console.log("model", JSON.stringify(loaded));
    if (!loaded.loaded) throw new Error(`bridge model failed to load: ${loaded.failed}`);
    await page.addStyleTag({ content: "#hud,.hud,#hudRoot{display:none!important}" });
    console.log("setup", JSON.stringify(await page.evaluate(Setup)));
    for (const view of views) {
      const placed = await page.evaluate(Place, VIEWS[view]);
      const shots = [];
      await page.screenshot({ path: path.join(OUT, `RailBridge_${view}_intact.png`) });
      await page.evaluate(Arm);
      for (const t of TIMES) {
        const state = await page.evaluate(StepTo, t);
        const file = `RailBridge_${view}_t${String(t).replace("-", "m").replace(".", "_")}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        shots.push({ file, ...state });
        console.log(`SHOT ${view} t=${state.t} ${state.set.state} ${state.stage} calls=${state.calls} tris=${state.triangles} cues=${state.set.cueIndex}/${state.set.cues} src=${state.set.sources} shake=${state.shake} fov=${state.fov}`);
      }
      log.views[view] = { placed, shots, reset: await page.evaluate(Reset) };
      console.log(`reset ${view} → ${log.views[view].reset.state}`);
    }
  } finally {
    log.seconds = (Date.now() - Date.parse(log.started)) / 1000;
    fs.writeFileSync(path.join(OUT, "RailBridge_log.json"), JSON.stringify(log, null, 1));
    await browser.close();
    await new Promise((res) => server.close(res));
  }
  if (errors.length) { console.log(`page errors: ${errors.length}`); process.exitCode = 1; }
  else console.log(`ok rail bridge shots in ${OUT}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await Main();
