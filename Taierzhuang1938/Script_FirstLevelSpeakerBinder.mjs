// Who is talking -> which body, in one place for 01-06 (and later stages that reuse
// the same speakers). The binder owns the link between a speaking role (`who` in
// Data_FirstLevelMissionDialogue) and the live soldier who plays it:
//   * ActorForWho(who) / ActorFor(sceneId, lineId): the soldier (resolvers first,
//     then any live soldier carrying that castId);
//   * every resolved soldier with a face rig gets facial.source = () => voice.Speech(who)
//     (released when the soldier dies, is removed, or another body takes the role);
//   * the shared head layer (Script_SpeakerHeadLayer) and the eyes look at whoever is
//     talking; the talker looks at the listener (player by default);
//   * HeadPosition(cue, line) gives the voice a position at the mouth that moves;
//   * a voice sample without baked channels gets them from the offline face track of
//     the take it is playing (Script_FaceTrack, keyed by the take's sha256: the
//     sample's own sha256, else the voice manifest's entry for its cue).
// The runtime only adds resolvers, calls Update(dt) and asks HeadPosition first.
import * as THREE from "three";
import { MISSION_DIALOGUE, MISSION_VOICE_CAST } from "./Data_FirstLevelMissionDialogue.mjs";
import { SPEAKER_HEAD } from "./Data_Tuning_CharacterSpeech.mjs";
import { SpeakerHeadLayer } from "./Script_SpeakerHeadLayer.mjs";
import { FaceTrackSpeech, LoadFaceTracks, SampleLineFaceTrack } from "./Script_FaceTrack.mjs";

const CUES = new Map(MISSION_DIALOGUE.map(cue => [cue.id, cue]));
// Roles that never have a body of their own on screen.
const DISEMBODIED = new Set(["shunzi", "crowd"]);
export const FIRST_LEVEL_SPEAKER_ROLES = Object.freeze(Object.keys(MISSION_VOICE_CAST).filter(who => !DISEMBODIED.has(who)));

/** "<Scene>.<NN>" (one-based, contract section 5.2) or a zero-based index -> { scene, index }. */
export function ParseLineId(sceneId, lineId) {
  if (Number.isInteger(lineId)) return { scene: sceneId, index: lineId };
  const match = /^(.*)\.(\d+)$/.exec(String(lineId ?? ""));
  if (match) return { scene: match[1] || sceneId, index: Number(match[2]) - 1 };
  return { scene: sceneId, index: -1 };
}

export function WhoForLine(sceneId, lineId) {
  const { scene, index } = ParseLineId(sceneId, lineId);
  return CUES.get(scene)?.lines[index]?.who ?? null;
}

const OPENING_STAGES = new Set(["Trapped", "BunkerRescue", "RearTrench", "Support"]);
const Distance2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/**
 * The first-level runtime's own "who plays this role" lookups, in priority order
 * (01-03 storyboard cast, named companions, 03-05 front roles). Anything not found
 * here falls back to a live soldier whose speakerRole/castId equals the role.
 */
export function FirstLevelSpeakerResolvers(runtime) {
  const r = runtime;
  return [
    who => (OPENING_STAGES.has(r.flow?.stage?.id) ? r.frontShow?.bunker?.SpeakerActor?.(who) : null),
    who => r.companion?.Handle?.(who),
    who => (who === "zhou" ? r.opening?.zhou : null),
    who => (who === "runner" ? r.opening?.runner?.actor : null),
    who => (who === "keeper" ? r.bundleKeeper : null),
    who => (who === "relief" ? r.relief?.find(entry => entry?.actor?.alive && entry.actor.actor)?.actor : null),
    who => {
      if (who !== "guard") return null;
      const chosen = r.frontShow?.bundleOrderGuard;
      if (chosen?.alive && chosen.actor) return chosen;
      const at = r.player?.position;
      const guards = (r.guards || []).map(entry => entry.actor).filter(actor => actor?.alive && actor.actor);
      return at ? guards.sort((a, b) => Distance2(a.position, at) - Distance2(b.position, at))[0] : guards[0];
    },
  ];
}

const Alive = soldier =>!!soldier && soldier.alive !== false && !!soldier.actor && !soldier.actor.disposed;

export class FirstLevelSpeakerBinder {
  /**
   * @param {object} host
   *   voice      FirstLevelMissionVoice-like: Speech(who) -> sample | null
   *   soldiers   () => iterable of live soldiers (castId lookup)
   *   listener   () => Vector3 (player eye) the talker looks at by default
   *   resolvers  [(who) => soldier | null], asked in order before the castId scan
   *   loadFaceTracks  fetch Data_FirstLevelFaceTracks.json (default: in a browser)
   */
  constructor({ voice, soldiers = () => [], listener = () => null, resolvers = [],
    loadFaceTracks = typeof location !== "undefined" } = {}) {
    this.voice = voice; this.soldiers = soldiers; this.listener = listener;
    if (loadFaceTracks) LoadFaceTracks();
    // Per-line dialogue player (Voice package): its Speech(who) reads this hook first.
    if (voice?.dialogue && !voice.dialogue.faceTrackSampler) voice.dialogue.faceTrackSampler = SampleLineFaceTrack;
    this.resolvers = [...resolvers];
    this.bound = new Map(); // soldier -> { whos:Set, facial, layer }
    this.speaking = [];     // [{ who, soldier, head }]
    this.head = new THREE.Vector3();
  }

  AddResolver(resolver) { if (resolver) this.resolvers.push(resolver); return this; }

  /** voice.Speech(who) with face-track channels merged in when the take has a track. */
  Speech(who) {
    const speech = this.voice?.Speech?.(who);
    if (!speech?.active || Number.isFinite(speech.jaw)) return speech;
    return FaceTrackSpeech(speech, speech.sha256 ?? this.voice?.manifest?.cues?.[speech.cue]?.sha256);
  }

  ActorForWho(who) {
    if (!who || DISEMBODIED.has(who)) return null;
    for (const resolve of this.resolvers) {
      let soldier = null;
      try { soldier = resolve(who); } catch { soldier = null; }
      if (Alive(soldier)) return soldier;
    }
    for (const soldier of this.soldiers() || []) {
      if (Alive(soldier) && (soldier.speakerRole === who || soldier.castId === who || soldier.identity?.castId === who)) return soldier;
    }
    return null;
  }

  ActorFor(sceneId, lineId) { return this.ActorForWho(WhoForLine(sceneId, lineId)); }

  /** World point at the resolved speaker's head, only when that body has a face rig. */
  HeadPosition(cue, line) {
    const who = line?.who ?? cue?.lines?.[0]?.who;
    const soldier = this.ActorForWho(who);
    const rig = soldier?.actor?.characterRig;
    if (!rig?.facial) return null;
    const head = rig.bones?.head;
    return head ? head.getWorldPosition(new THREE.Vector3()) : null;
  }

  _Bind(soldier, who) {
    const rig = soldier.actor.characterRig;
    let entry = this.bound.get(soldier);
    if (!entry || entry.facial !== rig.facial) {
      if (entry) this._Release(soldier);
      entry = { whos: new Set(), facial: rig.facial, rig, layer: null };
      rig.facial.source = () => {
        if (!Alive(soldier)) return null;
        for (const role of entry.whos) { const speech = this.Speech(role); if (speech?.active) return speech; }
        return null;
      };
      entry.layer = rig.speakerHead ||= new SpeakerHeadLayer(rig, soldier.id ?? 0);
      this.bound.set(soldier, entry);
    }
    entry.whos.add(who);
    return entry;
  }

  _Release(soldier) {
    const entry = this.bound.get(soldier);
    if (!entry) return;
    if (entry.facial) { entry.facial.source = null; entry.facial.gaze = null; }
    if (entry.rig?.speakerHead === entry.layer) { entry.layer?.Dispose(); entry.rig.speakerHead = null; }
    this.bound.delete(soldier);
  }

  Update() {
    // Resolve every role; bind faces, drop bodies that lost their role or died.
    const seen = new Map();
    for (const who of FIRST_LEVEL_SPEAKER_ROLES) {
      const soldier = this.ActorForWho(who);
      if (!soldier?.actor?.characterRig?.facial) continue;
      if (!seen.has(soldier)) seen.set(soldier, new Set());
      seen.get(soldier).add(who);
    }
    for (const soldier of [...this.bound.keys()]) if (!seen.has(soldier)) this._Release(soldier);
    for (const [soldier, whos] of seen) {
      const entry = this._Bind(soldier, [...whos][0]);
      entry.whos = whos;
    }
    // Who is talking right now (sample drives the mouth, head and gaze).
    this.speaking.length = 0;
    for (const [soldier, entry] of this.bound) {
      const speech = entry.facial.source?.();
      if (speech?.active) {
        entry.rig.bones.head?.getWorldPosition(this.head);
        this.speaking.push({ who: speech.who, soldier, head: this.head.clone() });
      }
    }
    const listener = this.listener?.() || null;
    for (const [soldier, entry] of this.bound) {
      const talking = this.speaking.find(item => item.soldier === soldier);
      let target = null;
      if (talking) target = this._Nearest(soldier, this.speaking.filter(item => item.soldier !== soldier)) || listener;
      else target = this._Nearest(soldier, this.speaking);
      entry.layer.speaking = !!talking;
      entry.layer.lookAt = target;
      entry.facial.gaze = target;
    }
  }

  _Nearest(soldier, candidates) {
    let best = null, bestDistance = SPEAKER_HEAD.listenRangeM;
    for (const item of candidates) {
      const distance = item.head.distanceTo(soldier.position || item.head);
      if (distance < bestDistance) { best = item.head; bestDistance = distance; }
    }
    return best;
  }

  /** Probe view: role -> bound soldier id / speaking flag. */
  State() {
    const bound = {};
    for (const [soldier, entry] of this.bound) for (const who of entry.whos) bound[who] = { id: soldier.id, speaking: !!entry.facial.lastSpeech };
    return { bound, speaking: this.speaking.map(item => item.who) };
  }

  Dispose() { for (const soldier of [...this.bound.keys()]) this._Release(soldier); this.speaking.length = 0; }
}
