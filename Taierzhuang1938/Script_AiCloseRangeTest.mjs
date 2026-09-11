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
    // Four NRA soldiers behind an actual campaign blast wall. Keep the production
    // battlefield/terrain probes and TryFire; only pin actors and force ready aim.
    const wall = T.battlefield.layout.blocks.find(b => b.id === "FrontTraverseBlastScreen");
    const allies = ai.soldiers.filter(s => s.alive && s.side === "nra" && !s.unarmed).slice(0, 4);
    if (!wall || allies.length !== 4) throw new Error("Missing four-soldier wall fixture");
    const wallRows = [];
    const ground = (x,z) => T.battlefield.GroundHeight(x,z);
    rifle.position.set(wall.x-3, ground(wall.x-3,wall.z), wall.z);
    ai.soldiers = [...allies,rifle];
    for (const [index,s] of allies.entries()) {
      ai.soldiers = [s,rifle]; // Isolate each trigger from friendly corridor blocking.
      s.position.set(wall.x+3, ground(wall.x+3,wall.z), wall.z);
      s.yaw = Math.PI/2; s.stance = 0; s.moveSpeed = 0; s.suppression = 0;
      s.actor.root.visible = false; s.coolUntil = 0; s.covertUntil = 0;
      s.missionSurfaceRest = false; s.missionFireHold = false;
      s.weapon = WEAPONS.Type38; s.weaponId = "Type38"; s.ammo = 100;
      s.target = {position:rifle.position,ref:rifle,id:rifle.id,isPlayer:false,stance:0};
      s.targetVisible = index < 2; s.lkp = rifle.position.clone(); s.lkpConfidence = 1;
      s.targetExposedS = 4; s.burstLeft = 0;
      ai.shooting.Detach(s); ai.shooting.BeginAim(s,rifle.id);
      ai.UpdateMuzzle(s);
      const from = ai.shooting.MuzzleOrigin(s);
      const samples = ai.shooting.SoldierSamples(rifle.position,0);
      const exposure = ai.shooting.Exposure(s,from,samples,{targetId:rifle.id}).fraction;
      const sequence=s.fireSequence, ammo=s.ammo, targetSuppression=rifle.suppression;
      for(let frame=0;frame<120;frame++) {
        s.fireTimer=0; s.aimTime=10; ai.time+=.1; ai.TryFire(s,.1,player);
      }
      wallRows.push({id:s.id,visible:s.targetVisible,exposure,shots:s.fireSequence-sequence,
        ammoSpent:ammo-s.ammo,suppression:rifle.suppression-targetSuppression});
    }
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
    const out = { rows: [], wallRows };
    function Prepare(distance, stance = "stand", scale = MISSION_TUNING.frontAccuracyScale) {
      player.alive = true; player.health = 100; player.spawnGrace = 0; player.debug.invincible = false;
      player.wounds.length = 0; player.bleeding = 0;
      player.hitMarks.length = 0; player.hitFlash = 0; player.suppression = 0;
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
    for (const distance of [2,5,12,18,25,60]) {
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
    const before=player.health, blockedSequence=rifle.fireSequence, blockedAmmo=rifle.ammo;
    for(let i=0;i<120;i++){rifle.fireTimer=0;rifle.aimTime=10;ai.time+=.02;ai.TryFire(rifle,1/60,player);}
    out.blockedDamage=before-player.health;
    out.blockedMarks=player.hitMarks.length;
    out.blockedShots=rifle.fireSequence-blockedSequence;out.blockedAmmo=blockedAmmo-rifle.ammo;
    blocked=false;
    // Cache a clear exposure, then insert a blocker within its 0.25 s lifetime.
    // A cached aimed shot must obey the same fresh trigger check as suppression.
    Prepare(5);ai.time+=5;ai.UpdateMuzzle(rifle);
    ai.shooting.Exposure(rifle,ai.shooting.MuzzleOrigin(rifle),ai.shooting.PlayerSamples(player),{targetId:-1,now:ai.time});
    blocked=true;const cachedSequence=rifle.fireSequence;
    rifle.aimTime=10;ai.time+=.01;ai.TryFire(rifle,1/60,player);
    out.cachedBlockedShots=rifle.fireSequence-cachedSequence;blocked=false;
    // Token saturation may still produce suppression when its point is reachable.
    Prepare(5);ai.time+=5;const acquireToken=ai.AcquireFireToken;
    ai.AcquireFireToken=()=>false;rifle.aimTime=10;
    const suppressSequence=rifle.fireSequence, suppressBefore=ai.stats.suppressShots;
    ai.TryFire(rifle,1/60,player);
    out.clearSuppressionShots=rifle.fireSequence-suppressSequence;
    out.clearSuppressionCount=ai.stats.suppressShots-suppressBefore;
    ai.AcquireFireToken=acquireToken;
    Prepare(2,"stand",0);ai.time+=5;
    for(let i=0;i<120;i++){rifle.fireTimer=0;rifle.aimTime=10;ai.time+=.02;ai.TryFire(rifle,1/60,player);}
    out.disabledDamage=100-player.health;
    out.warningMarks=player.hitMarks.map(m=>m.kind);
    out.warningFlash=player.hitFlash;
    Prepare(2); const start=ai.time, sequence=rifle.fireSequence;
    for(let i=0;i<600&&player.health===100;i++){ai.time+=1/60;ai.TryFire(rifle,1/60,player);}
    out.firstHitS=player.health<100?ai.time-start:null;
    out.firstHitShots=rifle.fireSequence-sequence;
    Prepare(2);rifle.yaw=Math.PI;
    for(let i=0;i<180;i++){ai.time+=1/60;ai.TryFire(rifle,1/60,player);}
    out.behindDamage=100-player.health;
    // Fill every token with distant shooters; a visible close threat must be
    // able to take over without increasing simultaneous damaging attackers.
    Prepare(12);ai.time+=5;
    const far=[];
    for(let i=0;i<COMBAT.maxShootersOnPlayer;i++){
      const s={id:9000+i,alive:true,side:"ija",position:rifle.position.clone().set(0,0,40+i*5),target:rifle.target};
      far.push(s);ai.tactics.AcquireToken(-1,s.id,true);
    }
    ai.soldiers=[rifle,...far];rifle.aimTime=10;
    ai.TryFire(rifle,1/60,player);
    out.nearToken=ai.tactics.HasToken(rifle.id,-1);
    out.tokenCount=ai.tactics.TokenCount(-1);out.cap=COMBAT.maxShootersOnPlayer;
    // Saturating the target admission cap must not hide a nearby candidate
    // from perception. Empty-range LOS only; real Sense/Think chooses the target.
    ai.soldiers=[rifle];Prepare(12);
    ai.DropTarget(rifle);ai.perception.ForgetAll(rifle);
    rifle.scriptedNoncombatant=false;rifle.state="idle";
    ai.playerTargetedBy=COMBAT.maxShootersOnPlayer;
    ai.HasLineOfSight=()=>true;
    for(let i=0;i<20&&!rifle.target?.isPlayer;i++){ai.time+=.1;ai.Think(rifle,.1,player);}
    out.nearAcquired=!!rifle.target?.isPlayer;
    Prepare(35);ai.DropTarget(rifle);ai.perception.ForgetAll(rifle);
    rifle.scriptTrackPlayer=true;rifle.missionFireHold=true;
    for(let i=0;i<30;i++){ai.time+=.1;ai.Think(rifle,.1,player);}
    out.heldWindowAcquired=!!rifle.target?.isPlayer&&rifle.targetVisible;
    const heldSequence=rifle.fireSequence;
    for(let i=0;i<120;i++){ai.time+=1/60;ai.TryFire(rifle,1/60,player);}
    out.heldWindowShots=rifle.fireSequence-heldSequence;
    const aimBeforeRelease=rifle.shooting.errorRad;
    rifle.missionFireHold=false;ai.time+=.1;ai.Think(rifle,.1,player);
    out.releaseKeepsAim=rifle.target?.isPlayer&&rifle.shooting.errorRad<=aimBeforeRelease;
    rifle.scriptTrackPlayer=false;
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
  assert.ok(result.heldWindowAcquired&&result.releaseKeepsAim,'surface observation and acquired aim survive a held firing window');
  assert.equal(result.heldWindowShots,0,'tracking never bypasses the authored trigger hold');
  console.log(JSON.stringify(result,null,2));
  assert.deepEqual(errors,[]);
  if (!process.env.AI_CLOSE_BASELINE) {
    for(const row of result.rows.filter(r=>r.distance<=12)) {
      assert.equal(row.shots,600);
      assert.ok(row.rate>=.65 && row.rate<.98, `close ${row.distance}m ${row.stance}: ${row.rate}`);
    }
    for(const row of result.rows.filter(r=>r.distance===18)) assert.ok(row.rate>.40, `18 m threat must be credible: ${row.rate}`);
    for(const row of result.rows.filter(r=>r.distance>=25)) assert.ok(row.rate<.1,`distant campaign balance: ${row.rate}`);
    assert.equal(result.blockedDamage,0);assert.equal(result.disabledDamage,0);assert.equal(result.behindDamage,0);
    assert.equal(result.blockedShots,0,"blocked exposure must not become wall suppression");
    assert.equal(result.blockedAmmo,0,"blocked trigger consumes no ammo");
    assert.equal(result.cachedBlockedShots,0,"fresh obstacle overrides cached clear exposure");
    assert.equal(result.clearSuppressionShots,1,"reachable suppression survives token saturation");
    assert.equal(result.clearSuppressionCount,1);
    for(const row of result.wallRows) {
      assert.equal(row.exposure,0,"real campaign wall fully hides the enemy");
      assert.equal(row.shots,0,"NRA soldier must not fire into intervening campaign wall");
      assert.equal(row.ammoSpent,0);assert.equal(row.suppression,0,"wall stops remote suppression");
    }

    assert.equal(result.blockedMarks,0,"solid cover must block incoming cues");
    assert.ok(result.warningMarks.length>0 && result.warningMarks.every(kind=>kind==="near"));
    assert.equal(result.warningFlash,0,"warning fire must not imply an injury");
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
