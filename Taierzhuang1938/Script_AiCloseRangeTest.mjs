// Real TryFire regression: campaign accuracy, near/far targets and blocking.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await ServeRoot(root, 0);
let browser;
try {
  browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=low`,
    { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 300000 });
  const result = await page.evaluate(async () => {
    const T = window.Tengxian;
    await T.Debug.FirstLevelJump(4);
    T.state.menu = false;
    T.StepFrames(2, 1/60, false);
    const { COMBAT } = await import("./Data_Battle.mjs");
    const { WEAPONS } = await import("./Data_Weapons.mjs");
    const { Mulberry32 } = await import("./Script_Noise.mjs");
    const { MISSION_TUNING } = await import("./Data_Tuning_FirstLevel.mjs");
    const ai = T.ai, player = T.player;
    const rifle = ai.soldiers.find(s => s.alive && s.side === "ija" && s.weapon.kind === "boltRifle");
    if (!rifle) throw new Error("Campaign fixture has no enemy rifleman");
    // Isolate only the firing range. Real shot resolution, token director, player
    // hitboxes and TakeHit run unchanged; empty range removes map placement noise.
    ai.soldiers = [rifle];
    ai.ctx.vfx = null; ai.ctx.audio = null; ai.ctx.audioWiring = null;
    let blocked = false;
    ai.aiHost.Raycast = (from, dir, maxDist) => blocked ? {t: maxDist / 2, normal:[0,0,1]} : null;
    ai.aiHost.BlocksSight = () => blocked;
    player.position.set(0,0,0); player.yaw = 0;
    player.velocity.set(0,0,0);
    rifle.weapon = WEAPONS.Type38; rifle.weaponId = "Type38";
    rifle.actor.root.visible = false;
    rifle.scriptDefensive = true; rifle.scriptFireIntervalScale = 1;
    const out = { rows: [] };
    function Prepare(distance, stance = "stand", scale = MISSION_TUNING.frontAccuracyScale) {
      player.alive = true; player.health = 100; player.spawnGrace = 0; player.debug.invincible = false;
      player.wounds.length = 0; player.bleeding = 0;
      player.stance = stance;
      rifle.position.set(0,0,distance); rifle.yaw = 0;
      rifle.stance = 0; rifle.moveSpeed = 0; rifle.suppression = 0;
      rifle.unarmed = false; rifle.missionFireHold = false; rifle.missionSurfaceRest = false;
      rifle.coolUntil = 0; rifle.burstLeft = 0; rifle.fireTimer = 0; rifle.aimTime = 0;
      rifle.ammo = 10000; rifle.rnd = Mulberry32(24681357);
      rifle.scriptAccuracyScale = scale;
      rifle.target = { position: player.position, ref:player, id:-1, isPlayer:true, stance:stance === "stand" ? 0 : stance === "crouch" ? 1 : 2 };
      rifle.targetVisible = true; rifle.targetFromMemory = false;
      rifle.targetExposedS = 4; rifle.playerLockAt = ai.time;
      ai.tactics.Reset(); ai.shooting.Detach(rifle); ai.shooting.BeginAim(rifle,-1);
    }
    for (const distance of [2,5,12,25,60]) {
      for (const stance of ["stand","crouch","prone"]) {
        Prepare(distance, stance);
        ai.time += 5;
        ai.shooting.UpdateAim(rifle,5,{stance:0,exposedS:4});
        let hits = 0, shots = 0;
        for (let n=0;n<600;n++) {
          player.health=100; player.wounds=[];
          rifle.fireTimer=0; rifle.aimTime=10;
          const before=rifle.fireSequence;
          ai.time+=.02;
          ai.TryFire(rifle,1/60,player);
          if(rifle.fireSequence>before)shots++;
          if(player.health<100)hits++;
        }
        out.rows.push({distance,stance,shots,hits,rate:hits/shots});
      }
    }
    Prepare(2); blocked=true; ai.time+=5;
    const before=player.health;
    for(let i=0;i<120;i++){rifle.fireTimer=0;rifle.aimTime=10;ai.time+=.02;ai.TryFire(rifle,1/60,player);}
    out.blockedDamage=before-player.health; blocked=false;
    Prepare(2,"stand",0);ai.time+=5;
    for(let i=0;i<120;i++){rifle.fireTimer=0;rifle.aimTime=10;ai.time+=.02;ai.TryFire(rifle,1/60,player);}
    out.disabledDamage=100-player.health;
    Prepare(2); const start=ai.time, sequence=rifle.fireSequence;
    for(let i=0;i<600&&player.health===100;i++){ai.time+=1/60;ai.TryFire(rifle,1/60,player);}
    out.firstHitS=player.health<100?ai.time-start:null;
    out.firstHitShots=rifle.fireSequence-sequence;
    Prepare(2);rifle.yaw=Math.PI;
    for(let i=0;i<180;i++){ai.time+=1/60;ai.TryFire(rifle,1/60,player);}
    out.behindDamage=100-player.health;
    // Fill every token with distant shooters; a visible close threat must be
    // able to take over without increasing simultaneous damaging attackers.
    Prepare(2);ai.time+=5;
    const far=[];
    for(let i=0;i<COMBAT.maxShootersOnPlayer;i++){
      const s={id:9000+i,alive:true,side:"ija",position:rifle.position.clone().set(0,0,12+i*5),target:rifle.target};
      far.push(s);ai.tactics.AcquireToken(-1,s.id,true);
    }
    ai.soldiers=[rifle,...far];rifle.aimTime=10;
    ai.TryFire(rifle,1/60,player);
    out.nearToken=ai.tactics.HasToken(rifle.id,-1);
    out.tokenCount=ai.tactics.TokenCount(-1);out.cap=COMBAT.maxShootersOnPlayer;
    // Saturating the target admission cap must not hide a nearby candidate
    // from perception. Empty-range LOS only; real Sense/Think chooses the target.
    ai.soldiers=[rifle];Prepare(2);
    ai.DropTarget(rifle);ai.perception.ForgetAll(rifle);
    rifle.scriptedNoncombatant=false;rifle.state="idle";
    ai.playerTargetedBy=COMBAT.maxShootersOnPlayer;
    ai.HasLineOfSight=()=>true;
    for(let i=0;i<20&&!rifle.target?.isPlayer;i++){ai.time+=.1;ai.Think(rifle,.1,player);}
    out.nearAcquired=!!rifle.target?.isPlayer;
    // Exercise the visible skinned soldier through Act, including first acquisition,
    // a raised target, target turning and posture changes. Capture the real VFX calls.
    const THREE = await import("three");
    const { BRAIN } = await import("./Data_Tuning_Ai.mjs");
    ai.soldiers = [rifle];
    ai.StepBody = () => {}; // Static, empty firing range; preserve normal pose/fire scheduling.
    const fireRows = [];
    let shotRows = [];
    ai.ctx.vfx = {
      MuzzleFlash(from, direction) {
        const muzzle = rifle.actor.MuzzleWorld(new THREE.Vector3());
        const axis = rifle.actor.MuzzleDirection(new THREE.Vector3());
        const target = ai.shooting.PlayerSamples(player)[1];
        const aim = new THREE.Vector3(target.x, target.y, target.z).sub(muzzle).normalize();
        shotRows.push({ originError: muzzle.distanceTo(from), aimDot: axis.dot(aim),
          flightDot: axis.dot(direction), blend: rifle.aimBlend, from: from.toArray(), direction: direction.toArray() });
      },
      Tracer(from, end) {
        const row = shotRows.at(-1);
        row.tracerOriginError = from.distanceTo(new THREE.Vector3(...row.from));
        row.tracerDot = end.clone().sub(from).normalize().dot(new THREE.Vector3(...row.direction));
      }, Impact() {}, SmokeSource() { return null; }, Blood() {},
    };
    ai.ctx.battlefield.Raycast = () => null;
    for (const stance of [0, 1, 2]) {
      Prepare(5);
      player.position.y = stance === 1 ? 1.8 : 0;
      rifle.actor.root.position.copy(rifle.position);
      rifle.actor.root.visible = true;
      rifle.scriptDefensive = false;
      rifle.actor.hurtPose = 0; rifle.hurtPose = 0;
      rifle.state = "fire"; rifle.stance = stance;
      rifle.crouchBlend = +(stance === 1); rifle.proneBlend = +(stance === 2);
      rifle.aimBlend = 0; rifle.lookYaw = 0; rifle.lookPitchBlend = 0;
      rifle.yaw = 1.1; rifle.moveOrder = null; rifle.cover = null;
      rifle.grounded = true; rifle.holdZone = null;
      rifle.actor.Update(0, { aim: 0, crouch: rifle.crouchBlend, prone: rifle.proneBlend });
      shotRows = [];
      for (let frame = 0; frame < 420; frame++) {
        player.health = 100; player.wounds = [];
        player.position.x = frame > 180 ? 1.5 : 0;
        ai.time += 1 / 60; ai.tickIndex++;
        ai.Act(rifle, 1 / 60, player);
      }
      fireRows.push({ stance, shots: shotRows.length, samples: shotRows });
    }
    out.visibleFire = fireRows;
    out.barrelGate = Math.cos(BRAIN.fireBarrelAngleRad);
    return out;
  });
  const dir = path.join(root,"Taierzhuang1938/_shots/EnemyCloseRange");
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,process.env.AI_CLOSE_BASELINE ? "Before.json" : "After.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  assert.deepEqual(errors,[]);
  if (!process.env.AI_CLOSE_BASELINE) {
    for(const row of result.rows.filter(r=>r.distance<=5)) {
      assert.equal(row.shots,600);
      assert.ok(row.rate>=.65 && row.rate<.98, `close ${row.distance}m ${row.stance}: ${row.rate}`);
    }
    for(const row of result.rows.filter(r=>r.distance>=25)) assert.ok(row.rate<.1,`distant campaign balance: ${row.rate}`);
    assert.equal(result.blockedDamage,0);assert.equal(result.disabledDamage,0);assert.equal(result.behindDamage,0);
    assert.ok(result.firstHitS!==null&&result.firstHitS<3,"close rifle must inflict damage promptly");
    assert.equal(result.nearToken,true);assert.equal(result.tokenCount,result.cap);
    assert.equal(result.nearAcquired,true);
    for (const row of result.visibleFire) {
      assert.ok(row.shots > 0, `visible stance ${row.stance} stopped firing`);
      for (const shot of row.samples) {
        assert.ok(shot.originError < 1e-5 && shot.tracerOriginError < 1e-5, "shot uses stale muzzle");
        assert.ok(shot.aimDot >= result.barrelGate - 1e-5, "visible barrel is not aimed at target");
        assert.ok(shot.tracerDot > .99999, "flash/tracer directions disagree");
        assert.ok(shot.blend >= .95, "shot fired before raising rifle");
      }
    }
  }
  console.log("AiCloseRangeTest OK");
} finally {
  await browser?.close();
  server.close();
}
