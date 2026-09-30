// ===========================================================================
// Script_PontoonBridgeShots.mjs —— 18 毁浮桥实拍：按固定时间点出图（docs/Data_PontoonBridge.md）
//
//   node Taierzhuang1938/Script_PontoonBridgeShots.mjs [--views=cover,head,side] [--quality=high] [--times=...]
//
// 真浏览器、真关卡（?whitebox=p012&missionStage=18&manual=1）：把流程推到 BridgeWithdraw，
// 摆好「药已装好、人已走净」，由爆破手按起爆器（FirstLevelBridge 的正常压杆 → Fire 路径），
// 之后逐帧步进，在每个时间点从指定机位出一张图，并记下桥的状态、粒子池与 draw call。
// 一个机位拍完用事实回退把桥还原（PontoonBridgeSet 只看 bridgeDestroyed），再拍下一个机位。
// 截图与日志只进忽略目录 _shots/PontoonBridge；这是取证工具，不是通关证据。
// （改自退役的 Script_RailBridgeShots：机位按浮桥、被炸段中心 (−77,134)、射位 (−89.6,173.8) 重摆。）
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
const OUT = path.join(here, "_shots", "PontoonBridge");
const QUALITY = Arg("quality", "high");
const [W, H] = (Arg("size", "1280x720")).split("x").map(Number);
// 机位（被炸段中心 (-77,134)，桥面顶 −0.47）：cover = 南岸射位（泥垄后，站姿眼高 1.62，概念 18_2）、head = 南岸浮桥头（概念 18_1）、
// safe = 爆破安全区（玩家被要求退到的地方）、side = 东南岸斜侧（看得见被炸段两头断开）、wide = 东岸远景（整座桥入画）、
// deckN / deckS = 站在北截 / 南截桥面上看断口。
const VIEWS = {
  cover: { eye: [-89.6, 173.8], target: [-75.5, 1.2, 134] },
  head: { eye: [-78.6, 168.6], target: [-76.2, 0.2, 138] },
  safe: { eye: [-66, 201], target: [-77, 1.2, 134] },
  side: { eye: [-44, 170], target: [-77, 0.6, 134] },
  wide: { eye: [-30, 168], target: [-77, 0.6, 128] },
  deckN: { eye: [-77, 100], target: [-77, 0.6, 134] },
  deckS: { eye: [-77, 158], target: [-77, 0.6, 134] },
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
  return { stage: r.flow.stage.id, set: r.pontoonBridgeSet.State() };
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
  return r.pontoonBridgeSet.State();
}

function StepTo(t) {
  const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), s = r.pontoonBridgeSet;
  // 起爆之前按压杆计时（负数），起爆之后按 PontoonBridgeSet 自己的钟（坍塌完了也接着走）。
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
  return r.pontoonBridgeSet.State();
}

async function Main() {
  fs.mkdirSync(OUT, { recursive: true });
  const views = (Arg("views", "cover,side")).split(",").filter((v) => VIEWS[v]);
  const server = await ServeRoot(path.resolve(here, ".."), 0);
  const browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on("pageerror", (e) => { errors.push(String(e)); console.log("PAGEERROR", String(e)); });
  const log = { quality: QUALITY, size: [W, H], started: new Date().toISOString(), views: {}, errors };
  try {
    const url = `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&missionStage=18&shot=1&manual=1&quality=${QUALITY}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready && window.Tengxian.Debug.FirstLevelMissionRuntime()?.pontoonBridgeSet,
      null, { timeout: 400000 });
    const loaded = await page.evaluate(async () => {
      const r = window.Tengxian.Debug.FirstLevelMissionRuntime();
      await r.pontoonBridgeSet.Load();
      return r.pontoonBridgeSet.State();
    });
    console.log("model", JSON.stringify(loaded));
    if (!loaded.loaded) throw new Error(`bridge model failed to load: ${loaded.failed}`);
    await page.addStyleTag({ content: "#hud,.hud,#hudRoot{display:none!important}" });
    console.log("setup", JSON.stringify(await page.evaluate(Setup)));
    for (const view of views) {
      const placed = await page.evaluate(Place, VIEWS[view]);
      const shots = [];
      await page.screenshot({ path: path.join(OUT, `Pontoon_${view}_intact.png`) });
      await page.evaluate(Arm);
      for (const t of TIMES) {
        const state = await page.evaluate(StepTo, t);
        const file = `Pontoon_${view}_t${String(t).replace("-", "m").replace(".", "_")}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        shots.push({ file, ...state });
        console.log(`SHOT ${view} t=${state.t} ${state.set.state} ${state.stage} calls=${state.calls} tris=${state.triangles} cues=${state.set.cueIndex}/${state.set.cues} src=${state.set.sources} shake=${state.shake} fov=${state.fov}`);
      }
      log.views[view] = { placed, shots, reset: await page.evaluate(Reset) };
      console.log(`reset ${view} → ${log.views[view].reset.state}`);
    }
  } finally {
    log.seconds = (Date.now() - Date.parse(log.started)) / 1000;
    fs.writeFileSync(path.join(OUT, "Pontoon_log.json"), JSON.stringify(log, null, 1));
    await browser.close();
    await new Promise((res) => server.close(res));
  }
  if (errors.length) { console.log(`page errors: ${errors.length}`); process.exitCode = 1; }
  else console.log(`ok pontoon bridge shots in ${OUT}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await Main();
