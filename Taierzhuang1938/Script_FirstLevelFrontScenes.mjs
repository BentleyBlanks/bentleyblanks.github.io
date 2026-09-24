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
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import { ResolveSpeaker } from "./Script_DialoguePlayer.mjs";

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
    this.handle = voice.PlayScene(id, { speakers: FrontSceneSpeakers(cue, (who) => this.Body(who)) });
    this.log.push({ id, t: r.time ?? 0, scene: !!this.handle });
    // Not a per-line scene after all (should not happen: Owns() checked): let the old queue play it.
    if (!this.handle) voice.Enqueue(id);
  }
  State() {
    return { pending: [...this.pending], playing: this.handle && !this.handle.done ? this.handle.id : null, log: this.log.slice(-24) };
  }
}
