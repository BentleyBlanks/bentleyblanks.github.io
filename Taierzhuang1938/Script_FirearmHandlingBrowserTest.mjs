import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "Taierzhuang1938/_shots/FirearmHandling");
mkdirSync(out, { recursive: true });
const server = await ServeRoot(root, 0), browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&weapons=1&manual=1&quality=high&scale=small`, {waitUntil:"load",timeout:120000});
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, {timeout:180000});
  const report = await page.evaluate(async () => {
    const T = window.Taierzhuang, range = T.Debug.WeaponRange;
    const {WEAPONS} = await import("./Data_Weapons.mjs");
    const Step = (n) => T.StepFrames(n, 1/60, false);
    const Equip = (id) => {
      T.Debug.Mouse(0,false); T.Debug.Mouse(2,false);
      range.GoTo("table",id); Step(12); T.Debug.Key("KeyF"); Step(150);
      range.GoTo("firing"); range.SetAmmoMode("infinite"); Step(120);
      if (T.Debug.Slots().weapon !== id) throw new Error(`Failed pickup ${id}`);
    };
    Equip("ZhongZheng");
    const rifle = WEAPONS.ZhongZheng, Spread = () => T.player.SpreadDeg(rifle);
    const stand = Spread();
    T.player.SetStance("crouch"); Step(90); const crouch = Spread();
    T.Debug.Mouse(2,true); Step(100); const ads = Spread();
    T.Debug.Mouse(2,false); T.player.SetStance("stand"); Step(120);
    T.Debug.Key("KeyW",true); Step(35); const moving = Spread();
    T.Debug.Key("KeyW",false); Step(4); const stopping = Spread();
    Step(150); const settled = Spread();
    T.Debug.Fire(); const boltKick = T.player.recoilTotal; Step(150);
    const boltRecovered = {recoil:T.player.recoilTotal,bloom:T.player.firearmHandling.Bloom(rifle)};
    const bursts = [];
    for (const id of ["Zb26", "Type11", "Type92Hmg"]) {
      Equip(id); const gun=WEAPONS[id];
      const idle=T.player.SpreadDeg(gun), before=T.state.playerShots;
      T.StepFrames(2);
      const reticle=T.Debug.Reticle();
      T.Debug.Mouse(0,true); Step(id === "Type92Hmg" ? 200 : 90); T.Debug.Mouse(0,false);
      const burst={id,reticleSpread:reticle.spreadDeg,shots:T.state.playerShots-before,idle,spread:T.player.SpreadDeg(gun),
        bloom:T.player.firearmHandling.Bloom(gun),pitch:T.player.pitch,recoil:T.player.recoilTotal};
      Step(240); burst.recoveredSpread=T.player.SpreadDeg(gun); burst.recoveredPitch=T.player.pitch;
      bursts.push(burst);
    }
    Equip("Zb26");
    T.Debug.Mouse(0,true); Step(900); T.Debug.Mouse(0,false);
    const sustained={pitch:T.player.pitch,recoil:T.player.recoilTotal};
    Step(240); sustained.recovered=T.player.pitch;
    Equip("ZhongZheng");
    // Fixed wall fixture. The wall face is x=2350.3, so this is a 0.5m clearance.
    T.player.Spawn(2350.8,2460,Math.PI/2); Step(120);
    const lower=T.viewmodel.wallLower, rx=T.viewmodel.wallPivot.rotation.x;
    T.Debug.Mouse(2,true); Step(90);
    const before={shots:T.state.playerShots,ammo:T.state.ammo};
    T.Debug.Fire(); Step(10);
    const wall={lower,rx,blocked:T.player.gunClearance.blocked,ads:T.player.ads,
      shots:T.state.playerShots-before.shots,ammoUsed:before.ammo-T.state.ammo,
      stableLower:T.viewmodel.wallLower,muzzleX:T.viewmodel.MuzzleWorld().x};
    return {stand,crouch,ads,moving,stopping,settled,boltKick,boltRecovered,bursts,sustained,wall};
  });
  await page.evaluate(() => window.Taierzhuang.StepFrames(2));
  await page.screenshot({path:path.join(out,"WallLowered.png")});
  const away = await page.evaluate(() => {
    const T=window.Taierzhuang;
    T.Debug.Mouse(2,false); T.player.yaw=-Math.PI/2;
    T.StepFrames(120,1/60,false);
    const before=T.state.playerShots;
    T.Debug.Fire(); const fired=T.state.playerShots-before;
    T.StepFrames(150);
    return {fired,lower:T.viewmodel.wallLower,blocked:T.player.gunClearance.blocked};
  });
  await page.screenshot({path:path.join(out,"WallReleased.png")});
  const mounted = await page.evaluate(() => {
    const T=window.Taierzhuang, debug=T.Debug.Emplacement;
    T.Debug.WeaponRange.GoTo("firing"); T.StepFrames(120,1/60,false);
    debug.Create({id:"HandlingMounted",kindId:"Type92Hmg",side:"nra",position:{x:2400,y:0,z:2458},belts:5});
    if (!debug.Occupy("HandlingMounted")) throw new Error("Mounted gun unavailable");
    T.StepFrames(60,1/60,false); debug.Fire(true); T.StepFrames(200,1/60,false); debug.Fire(false);
    const state=debug.State(), pitch=T.player.pitch;
    T.StepFrames(240,1/60,false);
    const recovered=T.player.pitch; debug.Vacate("test");
    return {pitch,recovered,shots:state.stats.shots,last:T.state.lastEmplacedShot};
  });
  writeFileSync(path.join(out,"Report.json"),JSON.stringify({report,away,mounted,errors},null,2));
  console.log(JSON.stringify({report,away,mounted,errors},null,2));
  assert.ok(report.crouch < report.stand && report.ads < report.crouch);
  assert.ok(report.moving > report.stand && report.stopping > report.settled);
  assert.ok(Math.abs(report.settled-report.stand)<0.01);
  assert.ok(report.boltKick>0 && Math.abs(report.boltRecovered.recoil)<0.001 && report.boltRecovered.bloom===0);
  for (const burst of report.bursts) {
    assert.ok(Math.abs(burst.reticleSpread-burst.idle)<0.001,`${burst.id} crosshair reports actual spread`);
    assert.ok(burst.shots>=8 && burst.bloom>0.7 && burst.spread>burst.idle*1.8,`${burst.id} bloom`);
    assert.ok(burst.pitch>0.035 && burst.recoil>0.035,`${burst.id} sustained recoil`);
    assert.ok(Math.abs(burst.recoveredSpread-burst.idle)<0.01 && Math.abs(burst.recoveredPitch)<0.003,`${burst.id} recovery`);
  }
  assert.ok(report.sustained.pitch>0.15 && report.sustained.pitch<=12*Math.PI/180+1e-6 && Math.abs(report.sustained.recovered)<0.003);
  assert.ok(report.wall.muzzleX>2350.3);
  assert.ok(report.wall.lower>0.8 && report.wall.rx < -0.5 && report.wall.stableLower>0.8);
  assert.ok(report.wall.blocked && report.wall.ads<0.01 && report.wall.shots===0 && report.wall.ammoUsed===0);
  assert.ok(away.fired===1 && away.lower<0.01 && !away.blocked);
  assert.ok(mounted.shots >= 6 && mounted.pitch > 0.025 && Math.abs(mounted.recovered) < 0.003 && mounted.last?.index > 0);
  assert.deepEqual(errors,[]);
  console.log("FirearmHandlingBrowserTest OK");
} finally { await browser.close(); server.close(); }
