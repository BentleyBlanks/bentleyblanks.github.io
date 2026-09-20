// Shared browser-side bundle throw driver. Both the full campaign and the stage-05
// debug probe call this exact solver and input sequence.
export async function DriveBundleThrow(page) {
  return page.evaluate(async () => {
  const { THROW } = await import("./Data_Tuning_Combat.mjs");
  const { JUMP } = await import("./Data_Tuning_Player.mjs");
  const { WEAPONS } = await import("./Data_Weapons.mjs");
  const g = window.Tengxian, tank = g.Debug.FirstLevelMission().tank, p = g.player.position;
  const kind = WEAPONS.GrenadeBundle;
  g.player.yaw = Math.atan2(p.x - tank.x, p.z - tank.z);
  // Rifle recoil lives in a separate free-aim offset. The ballistic solver
  // owns the complete throw direction, so clear that residual before both
  // solving and releasing instead of silently adding the last gunfight.
  g.player.aimYaw = 0;g.player.aimPitch = 0;
  // 解一条真能落到履带边上的抛物线。固定 0.35 rad 那一版是从沟底往路基上扔：
  // 目标比出手点高两米，弹道贴着沟沿过去，两发全砸在坎上（2026-09-20 实测）。
  // 这里按投掷模型（velocity = dir*speed，再加 speed*arcLift 的竖直分量）扫仰角，
  // 只收初速在蓄力区间内、而且整条弧线离地都有余量的那些解，取余量最大的一条。
  const eye = g.player.EyePosition,rawDistance=Math.hypot(p.x-tank.x,p.z-tank.z);
  const targetY=g.battlefield.GroundHeight(tank.x,tank.z);
  // Runtime physics uses 19.6 m/s² (JUMP.gravityMps2). The former 0.56 ratio
  // conflated several errors: a 9.81 m/s² solver, a flat muzzle offset instead
  // of Combat.Throw's 3-D advance, residual rifle free-aim, and a "landing"
  // sample taken after the bundle had already struck, bounced and rolled.
  const halfGravity=JUMP.gravityMps2*.5;
  let best = null;
  for (let pitch = 0.06; pitch <= 1.3; pitch += 0.02) {
    const cosine = Math.cos(pitch), vertical = Math.sin(pitch) + THROW.arcLift;
    // Combat.Throw advances the muzzle along the complete 3-D aim vector,
    // then adds muzzleRiseM. Account for both the horizontal and vertical
    // components of that advance; subtracting a flat 0.4 m was only an
    // approximation at high pitch.
    const distance=rawDistance-THROW.muzzleAheadM*cosine;
    const originY=eye.y+THROW.muzzleAheadM*Math.sin(pitch)+THROW.muzzleRiseM;
    const rise=targetY-originY;
    const drop = distance * vertical / cosine - rise;
    if (drop <= 0.05) continue;
    const speed = Math.sqrt(halfGravity * distance * distance / (cosine * cosine * drop));
    if (speed < kind.throwSpeedMin + 0.05 || speed > kind.throwSpeedMax - 0.05) continue;
    let clearance = Infinity;
    for (let step = 1; step <= 20; step++) {
      const along = step / 21,travel=THROW.muzzleAheadM*cosine+distance*along,
        x=p.x+(tank.x-p.x)*travel/rawDistance,z=p.z+(tank.z-p.z)*travel/rawDistance;
      const t = distance * along / (speed * cosine);
      const y = originY + speed * vertical * t - halfGravity * t * t;
      clearance = Math.min(clearance, y - g.battlefield.GroundHeight(x, z)-.055);
    }
    // 取**最平**的那条够用的弧线，不是余量最大的那条。仰到 1.2 rad 去吊射，
    // 水平分量只剩三分之一，初速差一点落点就差一半（实测解出 12.7 m、只飞了 6.5 m）。
    const candidate={pitch,speed,clearance,distance,rise,originY};
    if (clearance >= 0.6) { best = candidate; break; }
    if (!best || clearance > best.clearance) best = candidate;
  }
  // 一条都解不出来就照旧仰 0.35 满蓄力扔一发，好歹把落点记下来。
  const shot = best || { pitch: 0.35, speed: kind.throwSpeedMax, clearance: null };
  g.player.pitch = shot.pitch;
  const power = (shot.speed - kind.throwSpeedMin) / (kind.throwSpeedMax - kind.throwSpeedMin);
  const chargeFrames = Math.round(66 * Math.max(0.08, Math.min(1, power)));
  const before = g.state.bundles;
  g.Debug.Key("KeyH", true);g.StepFrames(chargeFrames,1/60,false);
  g.player.aimYaw=0;g.player.aimPitch=0;
  const requestedDirection=g.player.AimDirection().clone(),releaseAt=g.Debug.FirstLevelMissionRuntime().time;
  g.Debug.Key("KeyH", false);
  const launched=g.combat.projectiles.find(entry=>entry.kind==="GrenadeBundle");
  const Initial=entry=>{
    if(!entry)return null;
    const velocity=entry.body?.linvel?.()||entry.velocity;
    return {position:{x:+entry.position.x.toFixed(3),y:+entry.position.y.toFixed(3),z:+entry.position.z.toFixed(3)},
      velocity:{x:+velocity.x.toFixed(3),y:+velocity.y.toFixed(3),z:+velocity.z.toFixed(3)},
      speed:+Math.hypot(velocity.x,velocity.y,velocity.z).toFixed(3),
      horizontalSpeed:+Math.hypot(velocity.x,velocity.z).toFixed(3),
      velocityPitch:+Math.atan2(velocity.y,Math.hypot(velocity.x,velocity.z)).toFixed(3)};
  };
  const launch=Initial(launched),requested={pitch:+g.player.pitch.toFixed(3),aimPitch:+g.player.aimPitch.toFixed(3),
    yaw:+g.player.yaw.toFixed(3),aimYaw:+g.player.aimYaw.toFixed(3),
    direction:[+requestedDirection.x.toFixed(3),+requestedDirection.y.toFixed(3),+requestedDirection.z.toFixed(3)],
    power:+power.toFixed(3),chargeFrames};
  g.StepFrames(1, 1 / 60, false);
  if (g.player.stance === "stand") g.Debug.Key("KeyC");
  // 跟着这一发看它落在哪儿：炸不停的时候，落点比任何推断都说明问题。
  let land=null,firstContact=null,firstVelocityBreak=null,previousVelocity=launch?.velocity||null;
  for (let frame = 0; frame < 300 && g.player.alive; frame++) {
    const flying = g.combat.projectiles.find((entry) => entry.kind === "GrenadeBundle");
    if (flying) {
      land={x:+flying.position.x.toFixed(2),y:+flying.position.y.toFixed(2),z:+flying.position.z.toFixed(2)};
      const velocity=flying.body?.linvel?.()||flying.velocity,current={x:velocity.x,y:velocity.y,z:velocity.z};
      if(!firstContact&&flying.age>.08&&flying.groundContact?.airS===0)
        firstContact={frame,age:+flying.age.toFixed(3),position:{...land},velocity:{x:+velocity.x.toFixed(2),y:+velocity.y.toFixed(2),z:+velocity.z.toFixed(2)}};
      if(!firstVelocityBreak&&previousVelocity){
        const expectedY=previousVelocity.y-JUMP.gravityMps2/60;
        const impulse=Math.hypot(current.x-previousVelocity.x,current.y-expectedY,current.z-previousVelocity.z);
        if(impulse>.75)firstVelocityBreak={frame,age:+flying.age.toFixed(3),impulse:+impulse.toFixed(2),
          position:{...land},before:{...previousVelocity},after:{...current}};
      }
      previousVelocity=current;
    }
    if (g.player.bleeding) g.Debug.Key("KeyB");
    g.StepFrames(1, 1 / 60, false);
  }
  const blast=g.Debug.FirstLevelMission().playerExplosions?.findLast(entry=>entry.explosiveId==="GrenadeBundle"&&entry.at>=releaseAt)||null;
  return { before, after: g.state.bundles, alive: g.player.alive, mission: g.Debug.FirstLevelMission(),
    aim: { pitch: +shot.pitch.toFixed(3), speed: +shot.speed.toFixed(2),
      clearance: shot.clearance == null ? null : +shot.clearance.toFixed(2),
      distance:+(shot.distance??rawDistance).toFixed(2),rise:+(shot.rise??(targetY-eye.y)).toFixed(2),solved:!!best },
    requested,launch,firstVelocityBreak,firstContact,land,
    blast:blast?{x:+blast.x.toFixed(2),y:+blast.y.toFixed(2),z:+blast.z.toFixed(2),
      trackDistance:+blast.trackDistance.toFixed(2)}:null,
    blastMiss:blast?+blast.trackDistance.toFixed(2):null };
  });
}
