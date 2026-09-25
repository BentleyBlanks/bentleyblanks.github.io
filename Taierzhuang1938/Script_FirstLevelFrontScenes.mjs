// 03–06 dialogue through the per-line player (contract §5.5, brief item 5, Front package 2026-09-24).
//
// Every 03–06 scene is played with voice.PlayScene(sceneId, { speakers }): each line comes out of the head of the
// body that plays its role, resolved by the speaker binder (Script_FirstLevelSpeakerBinder.ActorForWho) at the
// moment the line starts - Zhou at the left gun, He Youtian from wherever he is when he shouts that the tank is
// out, the reporting guard, the relief NCO. A role with no live body falls back to the runtime's VoicePosition.
//
// The scenes stay one at a time, in trigger order, as the old queue played them: two front scenes talking over
// each other is exactly the "各说各的" this round removes. Callers keep calling runtime.Say(id); the runtime hands
// the ids listed here to this module. Pure logic (no three): the runtime passes itself in.
//
// The speaker is in the picture when he talks (2026-09-25, relay r2 Front step 1). A line whose speaker stands near
// the player (B.speakerViewNearM) but out of the picture does not start yet (HoldLine, the dialogue player's `hold`
// hook): the speaker steps to a spot the player can see (StepSpot / Steer, a short walk, never a teleport) and the
// line starts when his head is in the picture - or after B.speakerViewHoldS anyway. The player's camera is never
// turned. Speakers farther out are shouts across the front (the left gun, the pinned guards) and play at once.
// A squadmate whose body stands between the player's eye and a talking speaker's head steps aside, square to that
// line of sight, until the line ends (ClearView / StepAside; relay r2 Front step 2: Yaowa hid Luo's 06 order to her).
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import { ResolveSpeaker } from "./Script_DialoguePlayer.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";

/** The 03–06 scenes (steps Support, MachineGun, Tank, Orders). */
export const FRONT_SCENE_IDS = Object.freeze([
  "FrontBlockade", "FrontApproach", "FrontAttack", "FrontWithdraw", "TakeOverGun",
  "TankRoadContact", "TankTerror", "BundleOrder",
  "BundleGo", "BundleProne", "BundleSupply", "BundleReturnCall", "BundleAttack", "BundleRetreat", "TankStopped", "FrontRelief",
  "Volunteer", "BorrowLight", "ZhouLift",
]);
const OWNED = new Set(FRONT_SCENE_IDS);
const CUES = new Map(MISSION_DIALOGUE.map((cue) => [cue.id, cue]));
/** Steps in which the ids above are played as scenes (outside them runtime.Say keeps the old queue). */
export const FRONT_SCENE_STEPS = Object.freeze(["Support", "MachineGun", "Tank", "Orders"]);
const Distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** Horizontal distance from p to the segment a-b. */
export function SegmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
  const t = length2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}
const DEG = Math.PI / 180;

/**
 * Where a world point falls in a three camera's picture, by plain matrix arithmetic (no three import):
 * { x, y } in normalized device coordinates (-1..1 across the frame) and `depth` in front of the eye (m), or null
 * when the point is behind the camera. Reads camera.matrixWorldInverse / projectionMatrix as they are.
 */
export function ProjectToView(camera, p) {
  const v = camera?.matrixWorldInverse?.elements, m = camera?.projectionMatrix?.elements;
  if (!v || !m || !p) return null;
  const x = v[0] * p.x + v[4] * p.y + v[8] * p.z + v[12];
  const y = v[1] * p.x + v[5] * p.y + v[9] * p.z + v[13];
  const z = v[2] * p.x + v[6] * p.y + v[10] * p.z + v[14];
  if (z > -0.05) return null;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (!(Math.abs(w) > 1e-6)) return null;
  return { x: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w, y: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, depth: -z };
}
/**
 * A body standing between the eye and a head: its column (radius `radius`, from 0.2 m over its feet `position.y` up to
 * `top`) crosses the eye->head line of sight between 2% and 97% of the way (the line gate's "hidden" test).
 */
export function BodyBetween(eye, head, position, top, radius = B.speakerAsideBodyRadiusM) {
  const dx = head.x - eye.x, dy = head.y - eye.y, dz = head.z - eye.z, h2 = dx * dx + dz * dz;
  if (!(h2 > 1e-6)) return false;
  const t = ((position.x - eye.x) * dx + (position.z - eye.z) * dz) / h2;
  if (!(t > 0.02 && t < 0.97) || Math.hypot(eye.x + dx * t - position.x, eye.z + dz * t - position.z) > radius) return false;
  const y = eye.y + dy * t;
  return y > (position.y || 0) + 0.2 && y < top;
}
/**
 * Spots a body in the eye->head line of sight can step to: square to that line from where he stands on it, at
 * B.speakerAsideOffsetsM, his own side first. Pure: the caller filters them against the world (AsideSpot).
 */
export function AsideCandidates(eye, head, from) {
  const dx = head.x - eye.x, dz = head.z - eye.z, length = Math.hypot(dx, dz);
  if (!(length > 1e-6)) return [];
  const ux = dx / length, uz = dz / length, nx = -uz, nz = ux;
  const t = Math.max(0, Math.min(length, (from.x - eye.x) * ux + (from.z - eye.z) * uz));
  const base = { x: eye.x + ux * t, z: eye.z + uz * t };
  const side = Math.sign((from.x - base.x) * nx + (from.z - base.z) * nz) || 1, out = [];
  for (const offset of B.speakerAsideOffsetsM) for (const sign of [side, -side])
    out.push({ x: base.x + nx * sign * offset, z: base.z + nz * sign * offset, offset: sign * offset });
  return out;
}
/** The projected point lies inside `margin` of the frame (1 = the frame's edge). */
export function InPicture(ndc, margin = B.speakerViewNdc) {
  return !!ndc && Math.abs(ndc.x) < margin && Math.abs(ndc.y) < margin;
}
/** Camera eye and horizontal view yaw (atan2 of the forward x, z) from its world matrix. */
export function CameraPose(camera) {
  const e = camera?.matrixWorld?.elements;
  if (!e) return null;
  // three cameras look down their local -Z.
  const fx = -e[8], fz = -e[10];
  return { x: e[12], y: e[13], z: e[14], yaw: Math.atan2(fx, fz), flat: Math.hypot(fx, fz) };
}

/**
 * Spots a speaker could step to so the player sees him: around the camera at B.speakerStepDistancesM and
 * ±B.speakerStepBearingsDeg off the view axis, in preference order (the table order, left and right alternating
 * starting with the speaker's own side). Pure: the caller filters them against the world (StepSpot).
 */
export function StepCandidates(pose, from) {
  if (!pose) return [];
  const side = Math.sign(Math.sin(Math.atan2(from.x - pose.x, from.z - pose.z) - pose.yaw)) || 1;
  const out = [];
  for (const bearing of B.speakerStepBearingsDeg) for (const distance of B.speakerStepDistancesM)
    for (const sign of [side, -side]) {
      const yaw = pose.yaw + sign * bearing * DEG;
      out.push({ x: pose.x + Math.sin(yaw) * distance, z: pose.z + Math.cos(yaw) * distance, bearing: sign * bearing, distance });
    }
  return out;
}

/**
 * speakers[who] for voice.PlayScene: a function evaluated when each line starts, so the line follows the body
 * that plays the role at that moment. `Body(who)` -> soldier | null; bodies that are not live soldiers any more
 * (Zhou after he was handed over to the column, a removed relief man) are ignored and the line falls back.
 */
export function FrontSceneSpeakers(cue, Body) {
  const speakers = {};
  for (const who of new Set(cue.lines.map((line) => line.who))) {
    if (who === "shunzi") continue;
    speakers[who] = () => {
      const body = Body(who);
      return body ? ResolveSpeaker(body) : null;
    };
  }
  return speakers;
}

export class FirstLevelFrontScenes {
  /**
   * @param {object} runtime  voice (FirstLevelMissionVoice), speakers (binder), ai.soldiers, flow.stage
   */
  constructor(runtime) {
    this.r = runtime;
    this.pending = [];
    this.handle = null;
    this.log = [];
    /** lineId -> { since, released, heldS, stepped } for every line HoldLine was asked about. */
    this.holds = new Map();
    /** The speaker walking into the picture: { soldier, who, spot, sceneId } (Steer moves him each frame). */
    this.steer = null;
    /** A squadmate stepping out of the line of sight to a talking speaker: { soldier, spot, sceneId, lineId }. */
    this.aside = null;
    /** Every ClearView step aside: { line, who, t } (probes read State().asides). */
    this.asides = [];
  }
  /** runtime.Say hands the id over when this returns true. */
  Owns(id) {
    const step = this.r.flow?.stage?.id;
    return OWNED.has(id) && FRONT_SCENE_STEPS.includes(step) && !!CUES.get(id)?.perLine;
  }
  Say(id) {
    const voice = this.r.voice;
    if (voice?.played?.has(id) || this.pending.includes(id) || this.handle?.id === id) return false;
    this.pending.push(id);
    return true;
  }
  /** Take a scene that has not started yet off the queue (a combat call supersedes it). True when it was pending. */
  Drop(id) {
    const i = this.pending.indexOf(id);
    if (i < 0) return false;
    this.pending.splice(i, 1);
    this.log.push({ id, t: this.r.time ?? 0, dropped: true });
    return true;
  }
  /** A front scene is playing or waiting its turn (the leader's reminders and casualty barks stay quiet). */
  get Busy() { return this.pending.length > 0 || (!!this.handle && !this.handle.done); }
  Body(who) {
    const r = this.r, soldier = r.speakers?.ActorForWho?.(who);
    if (!soldier?.alive) return null;
    // Only bodies still in the simulation (Zhou's AI body is removed when the column takes him over).
    return !r.ai?.soldiers || r.ai.soldiers.includes(soldier) ? soldier : null;
  }

  /**
   * How the player sees `body` right now: { head, distance, ndc, inView } - inView when the head projects inside
   * B.speakerViewNdc of the frame and nothing solid stands between the eye and it. null without a camera (Node).
   */
  SpeakerView(body) {
    const r = this.r, camera = r.camera, head = body && ResolveSpeaker(body);
    if (!camera || !head || !Number.isFinite(head.y)) return null;
    camera.updateWorldMatrix?.(true, false);
    const pose = CameraPose(camera), ndc = ProjectToView(camera, head);
    if (!pose) return null;
    const distance = Math.hypot(head.x - pose.x, head.y - pose.y, head.z - pose.z);
    // Closer than speakerViewMinM the camera is inside his shoulder (09-25 pictures at 0.7 m: an ear and a sleeve);
    // that is not seeing him talk, so a player who stands still gets him a step back into a framed spot.
    let inView = InPicture(ndc) && distance >= B.speakerViewMinM;
    const eye = r.player?.EyePosition?.clone?.();
    if (inView && eye && r.BlocksSight) inView = !r.BlocksSight(eye, eye.clone().set(head.x, head.y, head.z));
    return { head, distance, ndc, inView, pose };
  }
  /**
   * The first StepCandidates spot `body` can walk to and be seen at: on the player's floor, within
   * B.speakerStepMaxM of him, a straight walk nothing blocks (knee height), not inside a collider, and a standing
   * head there is in the picture and in the player's line of sight. null when there is none (he stays put).
   */
  StepSpot(body, pose) {
    const r = this.r, camera = r.camera;
    if (!pose || !r.Point || !r.BlocksSight || !r.player?.position) return null;
    const floor = r.Point(r.player.position).y, own = r.Point(body.position).y, eye = r.player.EyePosition?.clone?.();
    const knee = r.Point(body.position, 0.6), player = r.player.position;
    // His walk never brings him nearer the player than B.speakerStepPassM (or than he already is): he does not brush
    // past the player's shoulder or cross in front of the muzzle on the way (09-25 drive: Luo passed 1.08 m from the
    // player at the captured gun and the staging check "Luo occupies his own firing post clear of the player" failed).
    const pass = Math.min(B.speakerStepPassM, Distance(body.position, player)) - 0.05;
    for (const spot of StepCandidates(pose, body.position)) {
      if (Distance(spot, body.position) > B.speakerStepMaxM) continue;
      if (SegmentDistance(player, body.position, spot) < pass) continue;
      // On the player's floor and on the speaker's own: 09-25 relay r2 Front step 3 drive c36_d2, the player stood on the
      // hump in the middle of the 05 attack position and the spot picked was up the bank west of it - level with the
      // player, a metre above Luo on the trench floor. He never got there and stood 1.0-1.1 m from the player through
      // BundleAttack.02.
      const ground = r.Point(spot);
      if (Math.abs(ground.y - floor) > B.speakerStepDyM || Math.abs(ground.y - own) > B.speakerStepDyM) continue;
      if (r.physics?.Overlaps?.(spot.x, ground.y + 0.04, spot.z, 0.3, 1.7)) continue;
      if (r.BlocksSight(knee, r.Point(spot, 0.6))) continue;
      // Standing and crouched: at the spot the combat brain crouches him (cover, suppress) as often as not.
      let seen = true;
      for (const h of B.speakerStepHeadsM) {
        const head = r.Point(spot, h);
        if (!InPicture(ProjectToView(camera, head)) || (eye && r.BlocksSight(eye, head))) { seen = false; break; }
      }
      if (!seen) continue;
      return { x: spot.x, z: spot.z, bearing: spot.bearing, distance: spot.distance };
    }
    return null;
  }
  /**
   * A line that plays at once while its speaker stands inside the player's personal space: he steps back from the
   * player to a BackOffSpot at a walk (B.speakerBackOffSpeedMps) and stays there until his lines in the scene are done,
   * wherever the player goes meanwhile. 09-25 03->06 drive: Luo tailing the walking player at 0.7 m (FrontBlockade.02,
   * FrontApproach.01, BundleSupply.02, Volunteer.02) and the relief NCO passing at 1.0 m (FrontRelief.02) were heard from
   * inside the camera - a chin and a sleeve. False when there is no clear spot (he stays).
   */
  BackOff(body, who, sceneId) {
    const r = this.r;
    if (!r.player?.position || !r.Point || !r.BlocksSight) return false;
    const spot = this.BackOffSpot(body);
    if (!spot) return false;
    this.steer = { soldier: body, who, spot, sceneId, anchor: null, backOff: true };
    return true;
  }
  /**
   * Where a speaker too near the player steps back to: B.speakerBackOffDistancesM from the player, straight away from
   * him or up to B.speakerBackOffBearingsDeg off that line, on his own floor, not inside a collider, a straight walk
   * nothing blocks, and never passing nearer the player than he already stands. Not ahead of a walking player
   * (within B.speakerBackOffAheadDeg of where he walks): he would walk straight back into it (09-25 drive: Luo backed
   * into the ammo house in front of the player going in, and stayed 0.7 m from him). null when there is none.
   */
  BackOffSpot(body) {
    const r = this.r, player = r.player.position, from = body.position;
    const away = Math.atan2(from.x - player.x, from.z - player.z), near = Distance(from, player);
    const floor = r.Point(from).y, knee = r.Point(from, 0.6);
    const v = r.player.velocity, speed = v ? Math.hypot(v.x || 0, v.z || 0) : 0;
    const walking = speed > B.speakerStepPlayerStillMps, ahead = Math.cos(B.speakerBackOffAheadDeg * DEG);
    for (const distance of B.speakerBackOffDistancesM) for (const bearing of B.speakerBackOffBearingsDeg)
      for (const sign of bearing ? [1, -1] : [1]) {
        const yaw = away + sign * bearing * DEG;
        const spot = { x: player.x + Math.sin(yaw) * distance, z: player.z + Math.cos(yaw) * distance };
        if (walking && (Math.sin(yaw) * v.x + Math.cos(yaw) * v.z) / speed > ahead) continue;
        if (Distance(spot, from) > B.speakerStepMaxM) continue;
        if (SegmentDistance(player, from, spot) < near - 0.05) continue;
        const ground = r.Point(spot);
        if (Math.abs(ground.y - floor) > B.speakerStepDyM) continue;
        if (r.physics?.Overlaps?.(spot.x, ground.y + 0.04, spot.z, 0.3, 1.7)) continue;
        if (r.BlocksSight(knee, r.Point(spot, 0.6))) continue;
        return { x: spot.x, z: spot.z, bearing: sign * bearing, distance };
      }
    return null;
  }
  /**
   * DialoguePlayer `hold` hook: true keeps `line` from starting this frame. Near speakers out of the picture are
   * held (and sent to a StepSpot) until they are in view or B.speakerViewHoldS has passed; everything else plays.
   */
  HoldLine(line, sceneId) {
    const r = this.r, now = r.time ?? 0;
    if (!line || line.who === "shunzi" || line.direction?.spatial === "self") return false;
    let hold = this.holds.get(line.id);
    if (hold?.released) return false;
    // A live Japanese grenade at the player's feet comes first: the line waits (at most B.speakerDangerHoldS) while he
    // gets clear of it, and the wait for the speaker's face below starts only then. Said during the dodge it was lost:
    // FrontWithdraw.01 started 0.9 s after the capture while the player ran from a grenade, 0 frames of Luo in the
    // picture (09-25 relay r2 Gate drive ABfix_1a; Front step 3 addendum B).
    if (this.PlayerInDanger()) {
      if (!hold) {
        hold = { since: now, released: null, heldS: 0, stepped: false, who: line.who, sceneId };
        this.holds.set(line.id, hold);
        if (this.holds.size > 64) this.holds.delete(this.holds.keys().next().value);
      }
      hold.dangerSince ??= now;
      if (now - hold.dangerSince < B.speakerDangerHoldS) return true;
    } else if (hold?.dangerSince != null && hold.dangerS == null) {
      hold.dangerS = +(now - hold.dangerSince).toFixed(2);
      hold.since = now;
    }
    const body = this.Body(line.who), view = body && this.SpeakerView(body);
    const Release = (why) => {
      if (hold) { hold.released = why; hold.heldS = +(now - hold.since).toFixed(2); }
      return false;
    };
    // No body, no camera (Node tests), or a shout from across the front: the line plays as it always did.
    if (!view || view.distance > B.speakerViewNearM) return Release(!view ? "noView" : "far");
    if (view.inView) return Release("inView");
    if (!hold) {
      hold = { since: now, released: null, heldS: 0, stepped: false, who: line.who, sceneId };
      this.holds.set(line.id, hold);
      if (this.holds.size > 64) this.holds.delete(this.holds.keys().next().value);
    }
    if (now - hold.since >= B.speakerViewHoldS) return Release("timeout");
    // A line waits only while its speaker walks into the picture. Nobody is stepped up to a walking player: walking
    // together the leader keeps his own walk - stopping him at a spot left behind costs him the lead for the rest of
    // the leg (09-25 drive: Luo stood 7 s at the FrontBlockade spot, fell 10 m behind in the one-man trench and never
    // led FrontApproach). With no clear spot either, the line plays at once from where he stands (the voice is
    // positional: the player hears where to look) - holding it would only delay it.
    if (this.steer?.soldier !== body) {
      // The line plays at once from where he is - but a speaker inside the player's personal space (nearer than
      // B.speakerViewMinM: the camera sits in his shoulder) steps back from the player while he talks (BackOff).
      const Plays = (why) => {
        if (view.distance < B.speakerViewMinM && this.BackOff(body, line.who, sceneId)) hold.backedOff = true;
        return Release(why);
      };
      const v = r.player?.velocity, moving = !!v && Math.hypot(v.x || 0, v.z || 0) > B.speakerStepPlayerStillMps;
      if (moving) return Plays("walking");
      // Nor while he aims down the sights: a squadmate does not walk into the picture of a man who is shooting.
      if ((r.player?.ads ?? 0) > 0.5) return Plays("aiming");
      const spot = this.StepSpot(body, view.pose);
      if (!spot) return Plays("noSpot");
      this.steer = { soldier: body, who: line.who, spot, sceneId, anchor: { x: r.player.position.x, z: r.player.position.z } };
      hold.stepped = true;
    }
    return true;
  }
  /** A live enemy grenade has the player inside its blast (Script_Combat.GrenadeThreats, the HUD's own warning). */
  PlayerInDanger() {
    const r = this.r, threats = r.player?.position && r.combat?.GrenadeThreats?.(r.player.position);
    return !!threats && threats.some((t) => t.owner !== "player");
  }
  /**
   * Every frame a front line plays: a speaker who has come nearer than B.speakerViewMinM since his line began (the
   * player crawled up beside him, walked into him) steps back (BackOff) - HoldLine only looks when a line starts.
   */
  KeepSpace() {
    const handle = this.handle;
    if (this.steer || !handle || handle.done || !this.r.camera) return;
    for (const l of handle.lines) {
      if (l.state !== "playing" || !l.line || l.line.who === "shunzi" || l.line.direction?.spatial === "self") continue;
      const body = this.Body(l.line.who), view = body && this.SpeakerView(body);
      if (view && view.distance < B.speakerViewMinM && this.BackOff(body, l.line.who, handle.id)) {
        const hold = this.holds.get(l.line.id);
        if (hold) hold.backedOff = true;
        return;
      }
    }
  }
  /** This soldier is walking into the picture for a line (FirstLevelFrontBattle.Walk leaves him alone meanwhile). */
  Steers(soldier) { return !!soldier && (this.steer?.soldier === soldier || this.aside?.soldier === soldier); }
  /** The squadmate (B.speakerAsideCast, not busy on a gun or a litter) standing between `eye` and `head`, or null. */
  Blocker(speaker, eye, head) {
    const r = this.r, guns = r.emplacement?.guns ? [...r.emplacement.guns.values()] : [];
    for (const s of r.ai?.soldiers || []) {
      if (s === speaker || !s?.alive || !B.speakerAsideCast.includes(s.castId) || s.carryRole) continue;
      if (guns.some((g) => g?.npc === s) || this.steer?.soldier === s) continue;
      const crown = ResolveSpeaker(s);
      const top = crown && Number.isFinite(crown.y) && crown !== s.position ? crown.y + 0.15 : (s.position.y || 0) + 1.75;
      if (BodyBetween(eye, head, s.position, top)) return s;
    }
    return null;
  }
  /** The first AsideCandidates spot `blocker` can walk to: his floor, clear of colliders, a straight walk, not at the player. */
  AsideSpot(blocker, eye, head) {
    const r = this.r, from = blocker.position, player = r.player.position;
    const floor = r.Point(from).y, knee = r.Point(from, 0.6);
    for (const spot of AsideCandidates(eye, head, from)) {
      if (Distance(spot, from) > B.speakerStepMaxM || Distance(spot, player) < B.speakerAsidePlayerM) continue;
      const ground = r.Point(spot);
      if (Math.abs(ground.y - floor) > B.speakerStepDyM) continue;
      if (r.physics?.Overlaps?.(spot.x, ground.y + 0.04, spot.z, 0.3, 1.7)) continue;
      if (r.BlocksSight(knee, r.Point(spot, 0.6))) continue;
      return { x: spot.x, z: spot.z, offset: spot.offset };
    }
    return null;
  }
  /**
   * Every frame a front line plays: its speaker is in the picture with nothing solid in between, but a squadmate's body
   * is (Blocker) - that squadmate steps aside (AsideSpot) until the line ends. The speaker and the camera stay put.
   */
  ClearView() {
    const r = this.r, handle = this.handle;
    if (this.aside || !handle || handle.done || !r.camera || !r.Point || !r.BlocksSight || !r.player?.position) return;
    const eye = r.player.EyePosition?.clone?.();
    if (!eye) return;
    for (const l of handle.lines) {
      if (l.state !== "playing" || !l.line || l.line.who === "shunzi" || l.line.direction?.spatial === "self") continue;
      const body = this.Body(l.line.who), view = body && this.SpeakerView(body);
      if (!view?.inView) continue;
      const blocker = this.Blocker(body, eye, view.head), spot = blocker && this.AsideSpot(blocker, eye, view.head);
      if (!spot) continue;
      this.aside = { soldier: blocker, spot, sceneId: handle.id, lineId: l.line.id };
      this.asides.push({ line: l.line.id, who: blocker.castId, t: +(r.time ?? 0).toFixed(2) });
      if (this.asides.length > 24) this.asides.shift();
      return;
    }
  }
  /** Keeps the squadmate from ClearView walking to / holding his spot; lets him go when the line is done. */
  StepAside() {
    const a = this.aside, r = this.r, handle = this.handle;
    if (!a) return;
    const talking = !!handle && !handle.done && handle.id === a.sceneId && handle.lines.some((l) => l.line?.id === a.lineId && l.state !== "done");
    if (!talking || !a.soldier?.alive) { this.aside = null; return; }
    if (Distance(a.soldier.position, a.spot) > 0.35) r.MoveActor?.(a.soldier, a.spot, B.speakerStepSpeedMps);
    else if (r.Defend) r.Defend(a.soldier, a.spot, 0, 0.3);
  }
  /**
   * Called by the runtime after every other mover (frontShow, frontBattle): keeps the stepping speaker walking to
   * his spot, and lets him go once his lines in the scene are done (his own orders take over again).
   */
  Steer() {
    this.KeepSpace();
    this.ClearView();
    this.StepAside();
    const s = this.steer, r = this.r;
    if (!s) return;
    const handle = this.handle;
    const talking = !!handle && !handle.done && handle.id === s.sceneId
      && handle.lines.some((l) => l.line.who === s.who && l.state !== "done");
    // The player walked off: the spot framed a view he no longer has (a step back keeps its spot until the line ends).
    const left = !!s.anchor && !!r.player?.position && Distance(r.player.position, s.anchor) > B.speakerStepReleaseM;
    if (!talking || !s.soldier?.alive || left) { this.steer = null; return; }
    // Stepped back, and the player came up to him again: one more step back. And a speaker stepping into the picture
    // whose line is already playing (the hold ran out before he got there) while the player stands nearer than
    // speakerViewMinM: he backs off instead (KeepSpace does not look at a steered man) - c36_d2 above, Luo held 1.0 m
    // from the player on his way to a spot he could not reach, through the whole line.
    const near = (this.SpeakerView(s.soldier)?.distance ?? Infinity) < B.speakerViewMinM;
    const playing = !!handle && handle.lines.some((l) => l.line.who === s.who && l.state === "playing");
    if (near && (s.backOff ? Distance(s.soldier.position, s.spot) <= 0.35 : playing)) {
      const back = this.BackOffSpot(s.soldier);
      if (back) { s.spot = back; s.backOff = true; s.anchor = null; }
    }
    if (Distance(s.soldier.position, s.spot) > 0.35) r.MoveActor?.(s.soldier, s.spot, s.backOff ? B.speakerBackOffSpeedMps : B.speakerStepSpeedMps);
    else if (r.Defend) r.Defend(s.soldier, s.spot, 0, 0.3);
  }
  Update() {
    const r = this.r, voice = r.voice;
    if (this.handle && !this.handle.done) return;
    this.handle = null;
    if (!this.pending.length || !voice || voice.paused) return;
    // A tank call held back by the last scene (「履带断了！还在打！再补一捆！」) goes first, and is not talked over
    // (Script_FirstLevelTankRuntime.HoldsDialogue: a queued call, or one still sounding; 2026-09-24 review).
    if (r.tankRuntime?.HoldsDialogue?.()) return;
    // A reminder never holds up a story line; any other queued story (none are expected in 03–06) finishes first.
    voice.CancelGuidance?.();
    if (voice.current || voice.queue?.length) return;
    const id = this.pending.shift(), cue = CUES.get(id);
    this.handle = voice.PlayScene(id, { speakers: FrontSceneSpeakers(cue, (who) => this.Body(who)),
      hold: (line) => this.HoldLine(line, id) });
    this.log.push({ id, t: r.time ?? 0, scene: !!this.handle });
    // Not a per-line scene after all (should not happen: Owns() checked): let the old queue play it.
    if (!this.handle) voice.Enqueue(id);
  }
  State() {
    return { pending: [...this.pending], playing: this.handle && !this.handle.done ? this.handle.id : null, log: this.log.slice(-24),
      holds: Object.fromEntries([...this.holds].slice(-24).map(([id, h]) => [id, { ...h, since: +h.since.toFixed(2) }])),
      steer: this.steer ? { who: this.steer.who, backOff: !!this.steer.backOff, spot: { x: +this.steer.spot.x.toFixed(2), z: +this.steer.spot.z.toFixed(2) } } : null,
      aside: this.aside ? { who: this.aside.soldier.castId, line: this.aside.lineId, spot: { x: +this.aside.spot.x.toFixed(2), z: +this.aside.spot.z.toFixed(2) } } : null,
      asides: this.asides.slice() };
  }
}
