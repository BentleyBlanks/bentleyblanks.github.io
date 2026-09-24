// Shared browser-side bundle throw driver. Both the full campaign and the stage-05
// debug probe call this exact solver and input sequence.
// 2026-09-23 战车两段毁伤（Script_FirstLevelTankBrain）：大脑接管时（tank.brain）瞄的是**车体局部**的
// 一个点，不再瞄车中心；旧路径（没有大脑）照旧瞄车中心。aim：
//   "farTrack"（默认）—— 越过车顶扔到**远侧**履带外 1.9 m：断履带，车体挡住弹片（2026-09-24 审查：瞄近侧履带
//                        的那一版爆点离投掷者只有 4 m，每颗自伤 40–52 血）；
//   "deck"            —— 扔上车顶后甲板（碰撞盒顶 2.56 m）：炸发动机舱 = 彻底哑火；
//   "track"           —— 近侧履带（只留作对照，会自伤）；
//   "nearTrack"       —— 近侧履带、离投掷者较远的那一头（车体外 0.5 m）：车停在 Block 时攻击位离它 7.8–8.9 m，
//                        落在集束弹的伤人外沿（radiusM 4.2 × BLAST.radiusScale 1.9 ≈ 8 m）上，不用越过车顶；
//   "auto"            —— 近侧那一头离投掷者 ≥ 7.5 m 就扔 nearTrack，否则 farTrack。2026-09-24 Step 3：车停在 Block
//                        以后 farTrack 离攻击位 12.6 m，蓄满力也只剩高吊的弧线，擦着车顶落在后甲板上一颗哑火，
//                        两段毁伤被跳过（战车探针「MobilityKill then Disabled」红）。
// 弧线余量按「车体外廓内的地面 = 车顶」算，越过车顶的那条弧线不会擦着车身。
// 返回里 selfBlast = 这一颗炸到玩家自己的掉血（按 TakeHit 前后血量差，来源在爆点 1 m 以内的爆炸）。
export async function DriveBundleThrow(page, { aim: aimKind = "farTrack" } = {}) {
  return page.evaluate(async (aimKind) => {
  const { THROW } = await import("./Data_Tuning_Combat.mjs");
  const { JUMP } = await import("./Data_Tuning_Player.mjs");
  const { WEAPONS } = await import("./Data_Weapons.mjs");
  const g = window.Tengxian;
  // Stand up to throw, like a player does. The route arrives crouched (or prone after a dodge), and the attack
  // branch floor dips 0.5 m within a metre of the attack position: 2026-09-24 run 3 of the 03-06 campaign threw from
  // (42.8, -160.4) with the hand 0.5 m lower than runs 1-2 and the bundle hit the lip in front of it at 0.05 s and
  // killed the thrower. The throw returns to cover (crouch) right after the release, below.
  const stanceBefore = g.player.stance;
  for (let i = 0; i < 2 && g.player.stance !== "stand"; i++) {
    g.Debug.Key(g.player.stance === "prone" ? "KeyZ" : "KeyC"); g.StepFrames(12, 1 / 60, false);
  }
  const tank = g.Debug.FirstLevelMission().tank, p = g.player.position;
  const kind = WEAPONS.GrenadeBundle;
  let target = { x: tank.x, z: tank.z, rise: 0 };
  const yaw = tank.hullYaw ?? Math.PI, c = Math.cos(yaw), s = Math.sin(yaw);
  const HullTop = 2.56, tankGround = g.battlefield.GroundHeight(tank.x, tank.z);
  let resolved = aimKind;
  if (tank.brain) {
    const side = c * (p.x - tank.x) - s * (p.z - tank.z) < 0 ? -1 : 1;
    // 近侧履带离投掷者远的那一头（车体局部 z 与投掷者反号）。
    const nearEnd = { x: side * 1.6, z: (s * (p.x - tank.x) + c * (p.z - tank.z)) > 0 ? -1.9 : 1.9, rise: 0 };
    const nearDistance = Math.hypot(tank.x + c * nearEnd.x + s * nearEnd.z - p.x, tank.z - s * nearEnd.x + c * nearEnd.z - p.z);
    if (aimKind === "auto") resolved = nearDistance >= 7.5 ? "nearTrack" : "farTrack";
    // 车体局部 → 世界：x 右、z 车尾。履带：外侧 0.45 m、车尾方向 0.7 m；后甲板：车顶（碰撞盒顶 2.56 m）。
    const local = resolved === "deck" ? { x: 0, z: 1.2, rise: HullTop } : resolved === "nearTrack" ? nearEnd
      // 远侧：离车体外沿 1.9 m（离履带区 ≈ 1.9 m，620 × (1 − 1.9/4.2)² ≈ 185 ≥ trackMinDamage 35，照样断履带）。
      // 2026-09-24 实测离 0.5 m、1.2 m 两版都有弧线擦着远侧车顶边落在后甲板上（3 次里 2 次），一颗直接哑火、跳过断履带：
      // 最平的那条弧线下降段太缓，过车顶边时离顶只有几厘米；离远一点，下降段有地方落下来。
      : resolved === "track" ? { x: side * 1.55, z: 0.7, rise: 0 } : { x: -side * 3.0, z: 0.7, rise: 0 };
    target = { x: tank.x + c * local.x + s * local.z, z: tank.z - s * local.x + c * local.z, rise: local.rise };
  }
  // 车体外廓（碰撞盒 2.15 × 4.30，四周留 0.25 m）里的采样点按车顶算地面。
  const OverHull = (x, z) => { const dx = x - tank.x, dz = z - tank.z, lx = c * dx - s * dz, lz = s * dx + c * dz;
    return Math.abs(lx) <= 1.075 + 0.45 && Math.abs(lz) <= 2.15 + 0.45; };
  const hits = [], TakeHit = g.player.TakeHit;
  g.player.TakeHit = function (...args) {
    const before = this.health, result = TakeHit.apply(this, args), opts = args[3] || {};
    hits.push({ loss: before - this.health, blast: !!opts.blast, from: opts.from ? { x: opts.from.x, y: opts.from.y, z: opts.from.z } : null });
    return result;
  };
  g.player.yaw = Math.atan2(p.x - target.x, p.z - target.z);
  // Rifle recoil lives in a separate free-aim offset. The ballistic solver
  // owns the complete throw direction, so clear that residual before both
  // solving and releasing instead of silently adding the last gunfight.
  g.player.aimYaw = 0;g.player.aimPitch = 0;
  // 解一条真能落到履带边上的抛物线。固定 0.35 rad 那一版是从沟底往路基上扔：
  // 目标比出手点高两米，弹道贴着沟沿过去，两发全砸在坎上（2026-09-20 实测）。
  // 这里按投掷模型（velocity = dir*speed，再加 speed*arcLift 的竖直分量）扫仰角，
  // 只收初速在蓄力区间内、而且整条弧线离地都有余量的那些解，取余量最大的一条。
  const eye = g.player.EyePosition,rawDistance=Math.hypot(p.x-target.x,p.z-target.z);
  const targetY=g.battlefield.GroundHeight(target.x,target.z)+target.rise;
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
    // 60 个采样点（原 20 个 ≈ 25 cm 一点，会漏掉车顶边那一下）。
    for (let step = 1; step <= 60; step++) {
      const along = step / 61,travel=THROW.muzzleAheadM*cosine+distance*along,
        x=p.x+(target.x-p.x)*travel/rawDistance,z=p.z+(target.z-p.z)*travel/rawDistance;
      const t = distance * along / (speed * cosine);
      const y = originY + speed * vertical * t - halfGravity * t * t;
      // 车体外廓里（越过车顶 / 落在车顶）按车顶算余量：车体本身不是地面，但也不能穿过去。
      const floor = tank.brain && OverHull(x, z) ? Math.max(targetY, tankGround + HullTop) : g.battlefield.GroundHeight(x, z);
      clearance = Math.min(clearance, y - floor-.055);
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
    power:+power.toFixed(3),chargeFrames,stance:g.player.stance};
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
  g.player.TakeHit = TakeHit;
  const selfBlast = blast ? hits.filter((h) => h.blast && h.from && Math.hypot(h.from.x - blast.x, h.from.y - blast.y, h.from.z - blast.z) < 1)
    .reduce((sum, h) => sum + Math.max(0, h.loss), 0) : 0;
  return { before, after: g.state.bundles, alive: g.player.alive, health: g.player.health, selfBlast: +selfBlast.toFixed(1),
    mission: g.Debug.FirstLevelMission(), aimKind: resolved, requestedAim: aimKind, target, stanceBefore, stanceAtRelease: requested.stance,
    aim: { pitch: +shot.pitch.toFixed(3), speed: +shot.speed.toFixed(2),
      clearance: shot.clearance == null ? null : +shot.clearance.toFixed(2),
      distance:+(shot.distance??rawDistance).toFixed(2),rise:+(shot.rise??(targetY-eye.y)).toFixed(2),solved:!!best },
    requested,launch,firstVelocityBreak,firstContact,land,
    blast:blast?{x:+blast.x.toFixed(2),y:+blast.y.toFixed(2),z:+blast.z.toFixed(2),
      trackDistance:+blast.trackDistance.toFixed(2)}:null,
    blastMiss:blast?+blast.trackDistance.toFixed(2):null };
  }, aimKind);
}
