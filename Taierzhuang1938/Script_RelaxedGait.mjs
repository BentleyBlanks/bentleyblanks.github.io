// Relaxed gait for skeletal characters: walking with the rifle slung on the back ("slung"), or with
// no weapon in the hands at all ("unarmed", the 01 interpreter); or its opposite, "alert": upright,
// the rifle in both hands at the waist, the head sweeping (the 01 vanguard coming into the trench). Without it every standing or moving
// man plays the one production locomotion, RifleRun / AdvanceFire -- the rifle held at the ready,
// empty hands clasping an invisible one for a man who carries none.
//
//   RelaxedWalk / RelaxedStand  Animation/RelaxedGait (baked by _import/Script_RelaxedGaitBake.mjs on
//                               the shared TengxianHumanoidV1 skeleton; every Tengxian model can play it)
//   BackRifleRun               Animation/BackRifleRun (the P012 jog; same skeleton)
//   IjaAlertWalk / IjaAlertTrot / IjaAlertStand
//                              Animation/IjaAlertGait (BlenderMCP, _import/Script_IjaAlertGaitBake.py;
//                              loaded only when a man is first set "alert"; the hand weapon stays shown)
//
// SetRelaxedGait(soldier, mode) switches it per man; the rig keeps choosing clips by state, this only
// swaps the rifle-at-the-ready choices (RifleRun -> RelaxedWalk / BackRifleRun, AdvanceFire ->
// RelaxedStand) while the man neither fires, crouches, carries nor fights. "slung" hides the hand
// weapon and shows a copy of it on the BackRifleRun back socket; the caller decides when a clip's own
// weapon track takes over (UpdateRelaxedGaitWeapon).
import { AnimationClip } from "three";
import { ManagedGLTFLoader as GLTFLoader } from "./Script_ModelImports.mjs";
import { ACTOR_LOCOMOTION_PROFILES } from "./Data_ActorLocomotion.mjs";
import { ACTOR_LOCOMOTION, RELAXED_GAIT as C } from "./Data_Tuning_ActorLocomotion.mjs";
import { MarkDynamicPrepass } from "./Script_Post.mjs";

const VERSION = "20260927RelaxedGaitV1";
const ALERT_VERSION = "20260927IjaAlertGaitV1";
let libraryPromise = null, library = null, alertPromise = null, alert = null;

/** The alert clips (lazy: only the 01 vanguard uses them). */
export function LoadAlertGait() {
  return alertPromise ||= fetch(`./Animation/IjaAlertGait/Animation_TengxianIjaAlertGait.json?v=${ALERT_VERSION}`)
    .then(r => { if (!r.ok) throw new Error("IjaAlertGait HTTP " + r.status); return r.json(); })
    .then(data => (alert = { clips: data.clips.map(json => AnimationClip.parse(json)), profiles: data.profiles }));
}
export const AlertGaitLoaded = () => !!alert;

/** Load the clips and the back socket once (the P012 back-rifle GLB is shared with it). */
export function LoadRelaxedGait() {
  return libraryPromise ||= Promise.all([
    fetch(`./Animation/RelaxedGait/Animation_TengxianHumanoidV1RelaxedGait.json?v=${VERSION}`).then(r => r.json()),
    fetch(`./Animation/RelaxedGait/Data_RelaxedGait.json?v=${VERSION}`).then(r => r.json()),
    new GLTFLoader().loadAsync("./Animation/BackRifleRun/Animation_TengxianNraBackRifleRun.glb?v=20260926HumanoidV1"),
  ]).then(([clips, manifest, back]) => {
    library = {
      clips: new Map(clips.clips.map(json => [json.name, AnimationClip.parse(json)])),
      restPelvis: clips.restPelvis,
      back,
      profiles: {
        RelaxedWalk: { duration: manifest.walk.duration, referenceMps: manifest.walk.referenceSpeedMps, contacts: manifest.walk.contacts },
        BackRifleRun: Object.values(ACTOR_LOCOMOTION_PROFILES).find(p => p.BackRifleRun)?.BackRifleRun,
      },
    };
    return library;
  });
}
export const RelaxedGaitLoaded = () => !!library;

/** Walk / stand / run clip for the rig, its bind offsets taken into the position tracks. */
function Adapt(rig, clip, sourceScene, sourceRest) {
  const out = clip.clone();
  out.tracks = out.tracks.filter(track => {
    const [name, property] = track.name.split("."), to = rig.asset.gltf.scene.getObjectByName(name);
    if (!to) return false;
    if (property === "position") {
      const from = sourceScene?.getObjectByName(name)?.position || (name.endsWith("Pelvis") && sourceRest ? { x: sourceRest[0], y: sourceRest[1], z: sourceRest[2] } : null);
      if (from) for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] += to.position.x - from.x; track.values[i + 1] += to.position.y - from.y; track.values[i + 2] += to.position.z - from.z;
      }
    }
    return true;
  });
  return out;
}

/** Adds the alert clips to a rig that has the relaxed gait (once both libraries are here). */
function InstallAlert(rig) {
  if (!rig?.relaxedGaitInstalled || rig.alertGaitInstalled) return !!rig?.alertGaitInstalled;
  if (!alert) { LoadAlertGait().catch(() => {}); return false; }
  rig.alertGaitInstalled = true;
  for (const clip of alert.clips) rig.clipById.set(clip.name, Adapt(rig, clip, null, null));
  if (rig.locomotion) rig.locomotion.profiles = { ...rig.locomotion.profiles,
    ...Object.fromEntries(Object.entries(alert.profiles).filter(([, p]) => p.referenceMps > 0)
      .map(([id, p]) => [id, { duration: p.duration, referenceMps: p.referenceMps, contacts: p.contacts }])) };
  return true;
}

function Install(soldier) {
  const actor = soldier.actor, rig = actor?.characterRig;
  if (!rig?.asset?.gltf || rig.relaxedGaitInstalled) return !!rig?.relaxedGaitInstalled;
  if (!library) { LoadRelaxedGait(); return false; }
  rig.relaxedGaitInstalled = true;
  rig.clipById.set("RelaxedWalk", Adapt(rig, library.clips.get("RelaxedWalk"), null, library.restPelvis));
  rig.clipById.set("RelaxedStand", Adapt(rig, library.clips.get("RelaxedStand"), null, library.restPelvis));
  if (!rig.clipById.has("BackRifleRun")) {
    const run = library.back.animations.find(clip => clip.name === "BackRifleRun");
    if (run) rig.clipById.set("BackRifleRun", Adapt(rig, run, library.back.scene));
  }
  // Per-rig profile table (the shared one belongs to every rig of the model).
  if (rig.locomotion) rig.locomotion.profiles = { ...rig.locomotion.profiles, ...Object.fromEntries(Object.entries(library.profiles).filter(([, p]) => p)) };
  const select = rig._ActionForState;
  rig._ActionForState = function SelectRelaxedGait(state = {}) {
    const id = select.call(this, state), mode = soldier.relaxedGait;
    const free = mode && !this.forcedClip && !state.firing && !state.carryRole && !state.meleeCombat && !(state.dead > 0)
      && !(state.crouch > .35 || state.prone > .35 || state.kneel > .35 || state.throwing > .08 || state.reach > .08 || state.binoculars > .08);
    let chosen = id;
    if (free && id === "RifleRun") {
      // The pace the caller commands (soldier.relaxedGaitPaceMps, e.g. the director's travel) picks the cycle;
      // the measured one runs high for several updates when the animation LOD skips frames (09-27 probe).
      const speed = Number.isFinite(soldier.relaxedGaitPaceMps) ? soldier.relaxedGaitPaceMps
        : Number.isFinite(state.moveSpeedMps) ? state.moveSpeedMps : (state.moveSpeed || 0) * ACTOR_LOCOMOTION.normalizedMps;
      // A measured pace spikes for a frame at a corner, a start or a re-root: every change (the first
      // step from a standstill is a walk) must hold for switchFrames.
      const wantsRun = speed > (this.relaxedGaitRunning ? C.walkBelowMps : C.runAboveMps);
      this.relaxedGaitSwitch = wantsRun !== !!this.relaxedGaitRunning ? (this.relaxedGaitSwitch || 0) + 1 : 0;
      if (this.relaxedGaitSwitch >= C.switchFrames) { this.relaxedGaitRunning = wantsRun; this.relaxedGaitSwitch = 0; }
      chosen = mode === "alert" ? (this.relaxedGaitRunning ? "IjaAlertTrot" : "IjaAlertWalk")
        : this.relaxedGaitRunning ? "BackRifleRun" : "RelaxedWalk";
    } else if (free && id === "AdvanceFire") { chosen = mode === "alert" ? "IjaAlertStand" : "RelaxedStand"; this.relaxedGaitRunning = false; this.relaxedGaitSwitch = 0; }
    // Until the alert clips have arrived the man keeps the native rifle-at-the-ready choice.
    if (mode === "alert" && !this.alertGaitInstalled) chosen = id;
    this.relaxedGaitActive = chosen !== id ? chosen : null;
    return chosen;
  };
  const dispose = rig.Dispose;
  rig.Dispose = function (...args) { rig.relaxedGaitRifle?.parent?.remove(rig.relaxedGaitRifle); rig.relaxedGaitMount?.parent?.remove(rig.relaxedGaitMount); return dispose?.apply(this, args); };
  return true;
}

/** mode: "slung" | "unarmed" | "alert" | null. Installs on first use (the clips load in the background). */
export function SetRelaxedGait(soldier, mode) {
  if (!soldier) return;
  soldier.relaxedGait = mode || null;
  if (mode) Install(soldier);
  if (mode === "alert") InstallAlert(soldier.actor?.characterRig);
  else if (soldier.actor?.characterRig) soldier.actor.characterRig.relaxedGaitActive = null;
}

/** Per frame from the animation layer: installs once the clips have arrived (SetRelaxedGait may come first). */
export function EnsureRelaxedGait(soldier) {
  if (soldier?.relaxedGait && !soldier.actor?.characterRig?.relaxedGaitInstalled) Install(soldier);
  if (soldier?.relaxedGait === "alert" && !soldier.actor?.characterRig?.alertGaitInstalled) InstallAlert(soldier.actor?.characterRig);
}

/** True when this frame's body is the relaxed gait's (the rig picked one of its clips). */
export const RelaxedGaitShown = soldier => !!(soldier?.relaxedGait && soldier.actor?.characterRig?.relaxedGaitActive);

/**
 * The slung rifle for this frame: `slung` true hides the hand weapon and shows a copy on the back
 * socket (the BackRifleRun GLB's Socket_BackRifle under the chest, with its sling); false hides the
 * copy and leaves the hand weapon to the caller. Call after the rig has posed the frame.
 */
export function UpdateRelaxedGaitWeapon(soldier, slung) {
  const actor = soldier?.actor, rig = actor?.characterRig, weapon = actor?.weaponGroup;
  if (!rig || !weapon) { if (rig?.relaxedGaitRifle) rig.relaxedGaitRifle.visible = false; return; }
  if (slung && !rig.relaxedGaitMount && library && rig.bones?.chest) {
    const source = library.back.scene.getObjectByName("Socket_BackRifle");
    const mount = rig.relaxedGaitMount = source.clone(false);
    mount.name = "RelaxedGaitBackRifleMount"; rig.bones.chest.add(mount);
    const sling = source.getObjectByName("Model_BackRifleSling")?.clone();
    if (sling) { mount.add(sling); rig.relaxedGaitSling = sling; }
  }
  if (slung && rig.relaxedGaitMount && rig.relaxedGaitRifleSource !== weapon) {
    rig.relaxedGaitRifle?.parent?.remove(rig.relaxedGaitRifle);
    const copy = rig.relaxedGaitRifle = weapon.clone();
    copy.name = "RelaxedGaitSlungRifle"; rig.relaxedGaitRifleSource = weapon;
    rig.relaxedGaitMount.add(copy);
    copy.position.set(0, 0, 0); copy.rotation.set(-Math.PI / 2, 0, 0);
    copy.scale.setScalar(actor._SocketScaleCompensation?.(rig.relaxedGaitMount) ?? 1);
    // Bone attachments write real motion (docs/Data_MotionVectorContract.md); the old diagnostic
    // mark is kept as the P012 back rifle does.
    rig.relaxedGaitMount.traverse(object => { if (object.isMesh && !object.isSkinnedMesh) MarkDynamicPrepass(object); });
  }
  const shown = !!(slung && rig.relaxedGaitRifle);
  if (rig.relaxedGaitRifle) rig.relaxedGaitRifle.visible = shown;
  if (rig.relaxedGaitSling) rig.relaxedGaitSling.visible = shown;
  if (shown) weapon.visible = false;
}
