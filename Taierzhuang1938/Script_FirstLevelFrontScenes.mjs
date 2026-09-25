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
// A near speaker's line has a guard of the withdrawing batches or a man of the relief in that line of sight step aside the
// same way, and a guard walks back to where he stood once the line is done (relay r2 acceptance acc36: guard 50 hid the
// relief NCO's FrontRelief.02 for 148 of 155 frames).
// A line whose speaker was put off his post near the player (a grenade dodge) and is beyond 15 m, out of sight, waits, at most
// B.speakerReturnHoldS, for him to be back where the player can see him (PostAwayFrom; relay r2 acceptance idle probe 2:
// Luo dodged 15 m out of the nest behind its walls and said FrontWithdraw.01 from there).
// With or without a line, a named squadmate holding his spot steps out of the way of a player coming past him and goes
// back once the player is through (GiveWay; 2026-09-26 relay r2 wrap-up: Luo in his cover in the nest's west door).
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import { ResolveSpeaker } from "./Script_DialoguePlayer.mjs";
import { FRONT_BATTLE_TUNING as B } from "./Data_Tuning_FirstLevelFront.mjs";
import { BRAIN } from "./Data_Tuning_Ai.mjs";

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
    /** The speaker standing up to be seen over something low (StandToBeSeen): { body, lineId }; every such stand: { id, who, t }. */
    this.standing = null;
    this.stood = [];
    /** Every step into the picture given up because the player moved into its way (Steer): { who, t, spot }. */
    this.dropped = [];
    /** soldier -> time BackOffSpot last found nothing for him (not searched again within B.speakerBackOffRetryS). */
    this.backOffMiss = new Map();
    /** A squadmate stepping out of the player's way (GiveWay): { soldier, who, spot, home, phase: "aside"|"back", ... }. */
    this.giveWay = null;
    /** Every GiveWay sidestep: { who, t, home, spot, playerM, end, endT, homeM } (probes read State().gaveWay). */
    this.gaveWay = [];
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
    // Nor into, or past, the seat of a gun he does not man himself: the player takes that seat (the captured right gun)
    // or a squadmate works it (09-26 relay r2 Front step 3 drive c16_a1: a spot 1.5 m east of the captured gun's seat,
    // picked while the player dodged a grenade; he went back to the seat and Luo stood 1.28 m from it and from him).
    const seats = r.emplacement?.guns ? [...r.emplacement.guns.values()].filter((g) => g?.seat && g.npc !== body).map((g) => g.seat) : [];
    for (const spot of StepCandidates(pose, body.position)) {
      if (Distance(spot, body.position) > B.speakerStepMaxM) continue;
      if (SegmentDistance(player, body.position, spot) < pass) continue;
      if (seats.some((seat) => Distance(spot, seat) < B.speakerStepPassM
        || SegmentDistance(seat, body.position, spot) < Math.min(B.speakerStepPassM, Distance(body.position, seat)) - 0.05)) continue;
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
  BackOff(body, who, sceneId, lineId) {
    const r = this.r;
    if (!r.player?.position || !r.Point || !r.BlocksSight) return false;
    const spot = this.RetryBackOffSpot(body);
    if (!spot) return false;
    // The step back belongs to this one line (lineId): when it is done his own orders have him again, and his next line
    // is judged afresh by HoldLine / KeepSpace (09-26 review: held for the whole scene, his next line waited 1.6 s).
    this.steer = { soldier: body, who, spot, sceneId, anchor: null, backOff: true, lineId };
    return true;
  }
  /** BackOffSpot, but not again within B.speakerBackOffRetryS of finding nothing for this speaker. */
  RetryBackOffSpot(body) {
    const now = this.r.time ?? 0, miss = this.backOffMiss.get(body);
    if (miss != null && now - miss < B.speakerBackOffRetryS) return null;
    const spot = this.BackOffSpot(body);
    if (spot) this.backOffMiss.delete(body);
    else this.backOffMiss.set(body, now);
    return spot;
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
    // His post is near the player but a grenade dodge (or a shove) has put him off it, out of sight: the line waits, at most
    // B.speakerReturnHoldS, while his own walk takes him back (FrontBattle.Walk walks the dodge trail back), and is released
    // the frame he is in view - or, back at his post and still out of the picture, judged as any near line from then on.
    // Said at once it came from 15 m away behind the nest's walls (relay r2 acceptance idle probe 2, FrontWithdraw.01: Luo
    // dodged the grenade the player dodged, north out of the nest, 227 frames 0 seen, back in his cover 7.5 s later).
    // Not a wider gate: a speaker whose post is far (He at the left gun) still shouts at once.
    const post = view && !view.inView ? this.PostAwayFrom(body) : null;
    // It starts only for a speaker beyond B.speakerViewNearM (a near one steps into the picture or plays, below); once
    // started it lasts until he is in view, back at his post, or the time is up - wherever he is on the way.
    if (post && r.player?.position && Distance(post, r.player.position) <= B.speakerViewNearM
      && (hold?.returnSince != null || view.distance > B.speakerViewNearM)) {
      if (!hold) {
        hold = { since: now, released: null, heldS: 0, stepped: false, who: line.who, sceneId };
        this.holds.set(line.id, hold);
        if (this.holds.size > 64) this.holds.delete(this.holds.keys().next().value);
      }
      hold.returnSince ??= now;
      if (now - hold.returnSince < B.speakerReturnHoldS) return true;
      return Release("returnTimeout");
    }
    if (hold?.returnSince != null && hold.returnS == null) {
      hold.returnS = +(now - hold.returnSince).toFixed(2);
      hold.since = now;
    }
    // No body, no camera (Node tests), or a shout from across the front: the line plays as it always did.
    if (!view || view.distance > B.speakerViewNearM) return Release(!view ? "noView" : "far");
    if (view.inView) return Release("inView");
    if (!hold) {
      hold = { since: now, released: null, heldS: 0, stepped: false, who: line.who, sceneId };
      this.holds.set(line.id, hold);
      if (this.holds.size > 64) this.holds.delete(this.holds.keys().next().value);
    }
    // He is stepping back from the player for his previous line (BackOff): nobody walks into the picture meanwhile, so
    // holding this one would only delay it (09-26 review: FrontBlockade.03 / FrontApproach.02 waited the full 1.6 s).
    if (this.steer?.soldier === body && this.steer.backOff) return Release("backOff");
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
        if (view.distance < B.speakerViewMinM && this.BackOff(body, line.who, sceneId, line.id)) hold.backedOff = true;
        return Release(why);
      };
      const v = r.player?.velocity, moving = !!v && Math.hypot(v.x || 0, v.z || 0) > B.speakerStepPlayerStillMps;
      if (moving) return Plays("walking");
      // Nor while he aims down the sights: a squadmate does not walk into the picture of a man who is shooting.
      if ((r.player?.ads ?? 0) > 0.5) return Plays("aiming");
      // Nor while he goes to, or sits at, a gun no squadmate mans (B.speakerStepGunSeatM): that gun position is his.
      if (this.AtFreeGun()) return Plays("gun");
      const spot = this.StepSpot(body, view.pose);
      if (!spot) return Plays("noSpot");
      this.steer = { soldier: body, who: line.who, spot, sceneId, anchor: { x: r.player.position.x, z: r.player.position.z } };
      hold.stepped = true;
    }
    return true;
  }
  /**
   * The post a FrontBattle walker was put off: the last point of his walk while he is on its last leg (or past it) and
   * farther from it than its arrival radius (arrivalM, else B.arrivalM) plus B.coverReopenM - the distance at which Walk
   * takes a finished walk up again. null for a man with no walk, one still on the way, one whose stall fallback accepted
   * where he stands (he is not going back), and outside FrontBattle's steps (06: nobody walks the old walks any more).
   */
  PostAwayFrom(body) {
    const battle = this.r.frontBattle;
    if (!body || !battle?.Active) return null;
    const w = battle.walks?.get?.(body.id), post = w?.route?.at(-1);
    if (!post || w.stallAccepted || w.index < w.route.length - 1) return null;
    return Distance(body.position, post) > (post.arrivalM ?? B.arrivalM) + B.coverReopenM ? post : null;
  }
  /** The player stands within B.speakerStepGunSeatM of the seat of a gun no squadmate mans (the captured right gun). */
  AtFreeGun() {
    const r = this.r, player = r.player?.position, guns = r.emplacement?.guns ? [...r.emplacement.guns.values()] : [];
    return !!player && guns.some((g) => g?.seat && !g.npc && Distance(g.seat, player) < B.speakerStepGunSeatM);
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
      if (view && view.distance < B.speakerViewMinM && this.BackOff(body, l.line.who, handle.id, l.line.id)) {
        const hold = this.holds.get(l.line.id);
        if (hold) hold.backedOff = true;
        return;
      }
    }
  }
  /** This soldier is walking into the picture for a line (FirstLevelFrontBattle.Walk leaves him alone meanwhile). */
  Steers(soldier) { return !!soldier && (this.steer?.soldier === soldier || this.aside?.soldier === soldier || this.giveWay?.soldier === soldier); }
  /**
   * The men of the front who are nobody's named squadmate but stand about the player in 03-06: the guards of both batches
   * (not one bounding across the gap: that walk is his cover) and the relief. -> Set of soldiers.
   */
  PlainFriends() {
    const r = this.r, out = new Set();
    for (const g of r.guards || []) if (g?.actor && (g.safe || !g.crossing)) out.add(g.actor);
    for (const e of r.relief || []) if (e?.actor) out.add(e.actor);
    return out;
  }
  /**
   * The squadmate (B.speakerAsideCast, not busy on a gun or a litter) standing between `eye` and `head`, or null. With `near`
   * (the speaker within B.speakerViewNearM) a guard or a relief man (PlainFriends) in the way counts as well: relay r2
   * acceptance acc36, guard 50 stood 0.95 m in front of the player, square in the line to the relief NCO 1.4 m off, and
   * hid FrontRelief.02 for 148 of its 155 frames (only the four named squadmates stepped aside then).
   */
  Blocker(speaker, eye, head, near = false) {
    const r = this.r, guns = r.emplacement?.guns ? [...r.emplacement.guns.values()] : [];
    const plain = near ? this.PlainFriends() : null;
    for (const s of r.ai?.soldiers || []) {
      if (s === speaker || !s?.alive || s.carryRole || !(B.speakerAsideCast.includes(s.castId) || plain?.has(s))) continue;
      if (guns.some((g) => g?.npc === s) || this.steer?.soldier === s || this.giveWay?.soldier === s) continue;
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
      const blocker = this.Blocker(body, eye, view.head, view.distance <= B.speakerViewNearM), spot = blocker && this.AsideSpot(blocker, eye, view.head);
      if (!spot) continue;
      // A guard has no walk to take him back where he stood (UpdateGuards leaves a safe man alone, holds a waiting one
      // wherever he is): he walks back himself once the line is done (StepAside). A named squadmate or a relief man is
      // taken up by his own orders (FrontBattle.Walk) again.
      const guard = (r.guards || []).some((g) => g?.actor === blocker);
      this.aside = { soldier: blocker, spot, sceneId: handle.id, lineId: l.line.id,
        home: guard ? { x: blocker.position.x, z: blocker.position.z } : null, phase: "aside", backSince: null };
      this.asides.push({ line: l.line.id, who: blocker.castId ?? blocker.id, t: +(r.time ?? 0).toFixed(2) });
      if (this.asides.length > 24) this.asides.shift();
      return;
    }
  }
  /**
   * Keeps the squadmate from ClearView walking to / holding his spot; lets him go when the line is done - a guard walks
   * back to where he stood first (within B.speakerAsideReturnM, at most B.speakerAsideReturnS, then holds it: Defend).
   */
  StepAside() {
    const a = this.aside, r = this.r, handle = this.handle, now = r.time ?? 0;
    if (!a) return;
    if (a.phase === "back") {
      if (!a.soldier?.alive || !FRONT_SCENE_STEPS.includes(r.flow?.stage?.id)) { this.aside = null; return; }
      if (Distance(a.soldier.position, a.home) <= B.speakerAsideReturnM || now - a.backSince >= B.speakerAsideReturnS) {
        r.Defend?.(a.soldier, a.home, 0, 0);
        this.aside = null;
        return;
      }
      r.MoveActor?.(a.soldier, a.home, B.speakerStepSpeedMps);
      return;
    }
    const talking = !!handle && !handle.done && handle.id === a.sceneId && handle.lines.some((l) => l.line?.id === a.lineId && l.state !== "done");
    if (!talking || !a.soldier?.alive) {
      if (a.home && a.soldier?.alive) { a.phase = "back"; a.backSince = now; this.StepAside(); return; }
      this.aside = null;
      return;
    }
    if (Distance(a.soldier.position, a.spot) > 0.35) r.MoveActor?.(a.soldier, a.spot, B.speakerStepSpeedMps);
    else if (r.Defend) r.Defend(a.soldier, a.spot, 0, 0.3);
  }
  /**
   * Where the player wants to go this frame, as a horizontal unit vector: his movement keys (Script_Player.moveWishX/Z,
   * which a body in the way does not cut), else his velocity when he moves faster than B.speakerStepPlayerStillMps.
   * null when he stands.
   */
  PlayerHeading() {
    const p = this.r.player;
    if (!p?.position) return null;
    const wx = p.moveWishX || 0, wz = p.moveWishZ || 0, wish = Math.hypot(wx, wz);
    if (wish > B.giveWayWishMin) return { x: wx / wish, z: wz / wish };
    const v = p.velocity, speed = v ? Math.hypot(v.x || 0, v.z || 0) : 0;
    return speed > B.speakerStepPlayerStillMps ? { x: v.x / speed, z: v.z / speed } : null;
  }
  /**
   * The player is coming past `s`: within B.giveWayNearM (and B.giveWayNearM up or down), `s` within B.giveWayAheadDeg of
   * `heading` and within B.giveWayLaneM of the line the player walks.
   */
  InPlayersWay(s, heading) {
    const player = this.r.player.position, dx = s.position.x - player.x, dz = s.position.z - player.z, d = Math.hypot(dx, dz);
    if (!heading || d >= B.giveWayNearM || Math.abs((s.position.y ?? 0) - (player.y ?? 0)) > B.giveWayNearM) return false;
    if (d > 1e-4 && (dx * heading.x + dz * heading.z) / d < Math.cos(B.giveWayAheadDeg * DEG)) return false;
    return Math.abs(dx * heading.z - dz * heading.x) < B.giveWayLaneM;
  }
  /**
   * A spot `s` can sidestep to out of the player's way: B.giveWayLaneOffsetsM from the player's line (his own side of it
   * first), shifted B.giveWayAlongM along it, within B.giveWayMaxStepM of him, on his floor, clear of colliders, a straight
   * walk nothing blocks at knee height that passes no nearer the player than B.giveWayPassM (or than he already is), and
   * not beside the seat of a gun he does not man. null when there is none (he stays; the crowd push still works).
   */
  GiveWaySpot(s, heading) {
    const r = this.r, player = r.player.position, from = s.position;
    const floor = r.Point(from).y, knee = r.Point(from, 0.6), hx = heading.x, hz = heading.z, nx = -hz, nz = hx;
    const along = (from.x - player.x) * hx + (from.z - player.z) * hz;
    const side = Math.sign((from.x - player.x) * nx + (from.z - player.z) * nz) || 1;
    const pass = Math.min(B.giveWayPassM, Distance(from, player)) - 0.05;
    const seats = r.emplacement?.guns ? [...r.emplacement.guns.values()].filter((g) => g?.seat && g.npc !== s).map((g) => g.seat) : [];
    for (const sign of [side, -side]) for (const offset of B.giveWayLaneOffsetsM) for (const shift of B.giveWayAlongM) {
      const t = Math.max(0, along + shift);
      const spot = { x: player.x + hx * t + nx * sign * offset, z: player.z + hz * t + nz * sign * offset };
      if (Distance(spot, from) > B.giveWayMaxStepM || SegmentDistance(player, from, spot) < pass) continue;
      // Not beside the seat of a gun he does not man, nor nearer to it than he stands while he is inside its gun position
      // (speakerStepGunSeatM): the player coming past is often going to that gun, and the staging check wants Luo 1.5 m
      // clear of the player on the captured gun's seat.
      if (seats.some((seat) => Distance(spot, seat) < B.speakerStepPassM
        || Distance(spot, seat) < Math.min(B.speakerStepGunSeatM, Distance(from, seat)) - 0.05)) continue;
      const ground = r.Point(spot);
      if (Math.abs(ground.y - floor) > B.speakerStepDyM) continue;
      if (r.physics?.Overlaps?.(spot.x, ground.y + 0.04, spot.z, 0.3, 1.7)) continue;
      if (r.BlocksSight(knee, r.Point(spot, 0.6))) continue;
      return { x: spot.x, z: spot.z, offset: sign * offset };
    }
    return null;
  }
  /**
   * 03-06: a named squadmate holding his spot (Luo in his cover inside the nest's west door, a guard at his post) steps
   * out of the way of a player coming past him (InPlayersWay / GiveWaySpot), holds there until the player is clear of the
   * spot he left, walks back to it, and his own orders have him again (FrontBattle.Walk leaves him alone meanwhile:
   * Steers). The Script_Ai friendly push works only with the bodies touching (CROWD.spacingM 0.75 m); 09-26 Front drive
   * fx16 stood at the west door with Luo 0.78 m in front. The line movers come first: a squadmate a line steps, backs off
   * or sends aside (steer / aside) is let go at once.
   */
  GiveWay() {
    const r = this.r, stage = r.flow?.stage?.id, now = r.time ?? 0, g = this.giveWay;
    const inSteps = FRONT_SCENE_STEPS.includes(stage);
    if (!inSteps || !r.player?.position || !r.Point || !r.BlocksSight) { if (g) this.EndGiveWay("stage"); return; }
    const heading = this.PlayerHeading();
    if (g) {
      const s = g.soldier, walk = r.frontBattle?.walks?.get?.(s.id) ?? null;
      if (!s.alive || s.missionGrenadeEvade || s.meleeCombat || s.carryRole || g.stage !== stage || walk !== g.walk
        || this.steer?.soldier === s || this.aside?.soldier === s) { this.EndGiveWay("orders"); return; }
      // Coming past him again (on the way back, or at the spot): a fresh sidestep from where he stands, same place to go back to.
      if (this.InPlayersWay(s, heading) && (g.phase === "back" || Distance(s.position, g.spot) <= B.giveWaySpotArrivalM)) {
        const spot = this.GiveWaySpot(s, heading);
        if (spot && Distance(spot, g.spot) > 0.2) { g.spot = spot; g.phase = "aside"; g.clearSince = null; }
        else if (g.phase === "back") { g.phase = "aside"; g.clearSince = null; }
      }
      if (g.phase === "aside") {
        if (Distance(r.player.position, g.home) >= B.giveWayReleaseM) g.clearSince ??= now;
        else g.clearSince = null;
        if (g.clearSince != null && now - g.clearSince >= B.giveWayClearS) {
          // A man with a route still to walk (a leader who stood waiting for the player) takes it up from where he is:
          // walking back to where he waited would only put him behind the player he leads.
          if (walk && walk.index < walk.route.length) { this.EndGiveWay("walkOn"); return; }
          g.phase = "back"; g.backSince = now;
        }
      }
      if (g.phase === "back") {
        if (Distance(s.position, g.home) <= B.giveWayReturnM || now - g.backSince >= B.giveWayReturnS) { this.EndGiveWay("back"); return; }
        this.GiveWayMove(s, g.home, B.giveWayReturnM);
        return;
      }
      if (Distance(s.position, g.spot) > B.giveWaySpotArrivalM) this.GiveWayMove(s, g.spot, B.giveWaySpotArrivalM);
      else if (r.Defend) r.Defend(s, g.spot, 0, 0.3);
      return;
    }
    if (!heading) return;
    const guns = r.emplacement?.guns ? [...r.emplacement.guns.values()] : [];
    for (const s of r.ai?.soldiers || []) {
      if (!s?.alive || s.side === "ija" || !B.giveWayCast.includes(s.castId) || s.carryRole || s.meleeCombat || s.missionGrenadeEvade) continue;
      if ((s.moveSpeed ?? 0) > BRAIN.movingSignal || this.steer?.soldier === s || this.aside?.soldier === s || r.ai?.CrowdPinned?.(s)) continue;
      if (guns.some((gun) => gun?.npc === s) || !this.InPlayersWay(s, heading)) continue;
      const spot = this.GiveWaySpot(s, heading);
      if (!spot) continue;
      this.giveWay = { soldier: s, who: s.castId, spot, home: { x: s.position.x, z: s.position.z }, phase: "aside", since: now,
        clearSince: null, backSince: null, stage, walk: r.frontBattle?.walks?.get?.(s.id) ?? null };
      this.gaveWay.push({ who: s.castId, t: +now.toFixed(2), home: { x: +s.position.x.toFixed(2), z: +s.position.z.toFixed(2) },
        spot: { x: +spot.x.toFixed(2), z: +spot.z.toFixed(2) }, playerM: +Distance(s.position, r.player.position).toFixed(2), end: null });
      if (this.gaveWay.length > 24) this.gaveWay.shift();
      this.GiveWayMove(s, spot, B.giveWaySpotArrivalM);
      return;
    }
  }
  /**
   * One frame of GiveWay's walk to `point`, reached within `within` m: the runtime's MoveActor with the goal's own arrival
   * radius, as FrontBattle.Walk sets it (routeArrivalOwnsRadius; the next MoveActor from anyone else clears it). With a
   * FIRE reposition's 0.6 m radius he would stop short of the spot he left, inside the gap FrontBattle.Walk does not reopen.
   */
  GiveWayMove(s, point, within) {
    const r = this.r;
    if (!r.MoveActor) return;
    r.MoveActor(s, point, B.giveWaySpeedMps);
    s.routeArrivalOwnsRadius = true;
    s.scriptArrivalRadius = Math.min(s.scriptArrivalRadius ?? Infinity, within * 0.5);
  }
  /** Lets the squadmate GiveWay moved go (his own orders have him again) and notes why in State().gaveWay. */
  EndGiveWay(why) {
    const g = this.giveWay, entry = this.gaveWay.at(-1);
    if (g && entry?.who === g.who && entry.end == null) {
      entry.end = why; entry.endT = +(this.r.time ?? 0).toFixed(2);
      entry.homeM = +Distance(g.soldier.position, g.home).toFixed(2);
    }
    this.giveWay = null;
  }
  /**
   * A near speaker whose line plays with his head in the picture but something low between it and the player's eye (a
   * parapet, the gun on its sandbags) stands up to say it, when his standing head would be seen - an NCO rising to give
   * an order, not a walk. Held standing (B.speakerStandHoldS, refreshed) until that line ends; the combat brain has him
   * back afterwards. 09-25 relay r2 Front step 3 drive c36_g3: the player back from a grenade dodge stood 1.8 m north of
   * the captured gun's seat, Luo knelt in his cover inside the west door 4.9 m off, the gun and the nest's low west wall
   * hid his crouched head through TakeOverGun (188 and 137 frames in the picture, 0 seen) and no stepping spot was clear.
   */
  StandToBeSeen() {
    const r = this.r, handle = this.handle;
    if (this.standing && (!handle || handle.done || !handle.lines.some((l) => l.line?.id === this.standing.lineId && l.state === "playing")
      || !this.standing.body.alive)) this.standing = null;
    if (this.standing) { r.ai?.SetStance?.(this.standing.body, 0, B.speakerStandHoldS, true); return; }
    if (!handle || handle.done || !r.camera || !r.ai?.SetStance || !r.Point || !r.BlocksSight) return;
    const eye = r.player?.EyePosition?.clone?.();
    if (!eye) return;
    for (const l of handle.lines) {
      if (l.state !== "playing" || !l.line || l.line.who === "shunzi" || l.line.direction?.spatial === "self") continue;
      const body = this.Body(l.line.who);
      if (!body?.alive || (body.stance | 0) === 0 || this.Steers(body) || body.missionGrenadeEvade || body.meleeCombat) continue;
      const view = this.SpeakerView(body);
      if (!view || view.inView || view.distance > B.speakerViewNearM || view.distance < B.speakerViewMinM || !InPicture(view.ndc)) continue;
      const head = r.Point(body.position, B.speakerStepHeadsM[0]);
      if (!InPicture(ProjectToView(r.camera, head)) || r.BlocksSight(eye, head)) continue;
      this.standing = { body, lineId: l.line.id };
      this.stood.push({ id: l.line.id, who: l.line.who, t: +(r.time ?? 0).toFixed(2) });
      if (this.stood.length > 24) this.stood.shift();
      r.ai.SetStance(body, 0, B.speakerStandHoldS, true);
      return;
    }
  }
  /**
   * Called by the runtime after every other mover (frontShow, frontBattle): keeps the stepping speaker walking to
   * his spot, and lets him go once his lines in the scene are done (his own orders take over again) - a step back
   * once the one line it was for is done.
   */
  Steer() {
    this.KeepSpace();
    this.StandToBeSeen();
    this.ClearView();
    this.StepAside();
    this.GiveWay();
    const s = this.steer, r = this.r;
    if (!s) return;
    const handle = this.handle;
    const talking = !!handle && !handle.done && handle.id === s.sceneId
      && handle.lines.some((l) => (s.backOff && s.lineId ? l.line.id === s.lineId : l.line.who === s.who) && l.state !== "done");
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
      const back = this.RetryBackOffSpot(s.soldier);
      if (back) {
        s.spot = back; s.anchor = null;
        if (!s.backOff) s.lineId = handle.lines.find((l) => l.line.who === s.who && l.state === "playing")?.line.id;
        s.backOff = true;
      }
    }
    // The player moved after the spot was picked (c16_a1 above: picked while he dodged a grenade, then he went back to
    // the gun): the rest of the walk would now take the speaker nearer the player than B.speakerStepPassM (or than he
    // already is). The step is given up - his own orders take over and the line plays on (a held line is looked at
    // again by HoldLine, from where both of them stand now).
    const player = r.player?.position;
    if (!s.backOff && player && Distance(s.soldier.position, s.spot) > 0.35
      && SegmentDistance(player, s.soldier.position, s.spot) < Math.min(B.speakerStepPassM, Distance(s.soldier.position, player)) - 0.05) {
      this.dropped.push({ who: s.who, t: +(r.time ?? 0).toFixed(2), spot: { x: +s.spot.x.toFixed(2), z: +s.spot.z.toFixed(2) } });
      if (this.dropped.length > 24) this.dropped.shift();
      this.steer = null;
      return;
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
      aside: this.aside ? { who: this.aside.soldier.castId ?? this.aside.soldier.id, line: this.aside.lineId, phase: this.aside.phase, spot: { x: +this.aside.spot.x.toFixed(2), z: +this.aside.spot.z.toFixed(2) } } : null,
      asides: this.asides.slice(), stood: this.stood.slice(), dropped: this.dropped.slice(),
      giveWay: this.giveWay ? { who: this.giveWay.who, phase: this.giveWay.phase, spot: { x: +this.giveWay.spot.x.toFixed(2), z: +this.giveWay.spot.z.toFixed(2) },
        home: { x: +this.giveWay.home.x.toFixed(2), z: +this.giveWay.home.z.toFixed(2) } } : null,
      gaveWay: this.gaveWay.slice() };
  }
}
