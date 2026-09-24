// Prop tracks of the 01–02 opening action library (Animation/OpeningStoryboards).
// A clip row may carry `props: { name: { stride: 10, values } }`, one row per frame:
// origin xyz, axis xyz, up xyz, visible — in glTF scene space, i.e. the local frame
// of the rig root (source metres; the rig root carries the model scale and the π yaw).
// `weapon` drives the actor's own hand weapon (its mount is bypassed for that clip);
// `bayonet`, `beam` and `rifle` are extra props this module builds and owns. Props follow the
// 0.28 s pose blend when a clip changes (BeginBlend + mix), an owned bayonet rides its scabbard
// mount between clips, and a weapon a clip throws away can be left in the world (DropWeapon).
import * as THREE from "three";

const Clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const SOURCE_AXIS = new THREE.Vector3();
const SOURCE_UP = new THREE.Vector3();
const SOURCE_RIGHT = new THREE.Vector3();
const TARGET_AXIS = new THREE.Vector3();
const TARGET_UP = new THREE.Vector3();
const TARGET_RIGHT = new THREE.Vector3();
const FRAME_SOURCE = new THREE.Matrix4();
const FRAME_TARGET = new THREE.Matrix4();
const WORLD_Q = new THREE.Quaternion();
const PARENT_Q = new THREE.Quaternion();
const ROOT_Q = new THREE.Quaternion();
const ORIGIN = new THREE.Vector3();
const PARENT_SCALE = new THREE.Vector3();

/** Sample one prop track at clip time `seconds` into `out` (10 floats). Returns out or null. */
export function SampleOpeningPropTrack(track, clip, seconds, out = new Float64Array(10)) {
  if (!track || !clip || !track.values?.length) return null;
  const frames = clip.frameCount, duration = clip.duration || 1e-6;
  let at = Number.isFinite(seconds) ? seconds : 0;
  at = clip.loop ? ((at % duration) + duration) % duration : Clamp(at, 0, duration);
  const position = at / duration * (frames - 1);
  const a = Clamp(Math.floor(position), 0, frames - 1), b = Math.min(a + 1, frames - 1), w = position - a;
  const v = track.values;
  for (let i = 0; i < 9; i++) out[i] = v[a * 10 + i] + (v[b * 10 + i] - v[a * 10 + i]) * w;
  // Visibility switches on the nearer frame; directions are re-normalised by the caller.
  out[9] = v[(w < .5 ? a : b) * 10 + 9];
  return out;
}

/**
 * Put `object` where the sample says, in world space, given the rig root and the object's
 * own model basis (sourceAxis = the model direction that must follow the track axis,
 * sourceUp = the model direction that must follow the track up). The object keeps its
 * parent; `realSize` true undoes every inherited scale (props are modelled in real metres).
 */
export function PlaceOnOpeningTrack(object, sample, rigRoot, sourceAxis, sourceUp, realSize = true) {
  if (!object || !sample || !rigRoot || !object.parent) return false;
  rigRoot.updateWorldMatrix(true, false);
  object.parent.updateWorldMatrix(true, false);
  rigRoot.getWorldQuaternion(ROOT_Q);
  ORIGIN.set(sample[0], sample[1], sample[2]);
  rigRoot.localToWorld(ORIGIN);
  TARGET_AXIS.set(sample[3], sample[4], sample[5]).applyQuaternion(ROOT_Q).normalize();
  TARGET_UP.set(sample[6], sample[7], sample[8]).applyQuaternion(ROOT_Q);
  TARGET_UP.addScaledVector(TARGET_AXIS, -TARGET_UP.dot(TARGET_AXIS));
  if (TARGET_UP.lengthSq() < 1e-10) TARGET_UP.set(0, 1, 0).addScaledVector(TARGET_AXIS, -TARGET_AXIS.y);
  TARGET_UP.normalize();
  TARGET_RIGHT.crossVectors(TARGET_UP, TARGET_AXIS).normalize();
  SOURCE_AXIS.copy(sourceAxis).normalize();
  SOURCE_UP.copy(sourceUp).addScaledVector(SOURCE_AXIS, -sourceUp.dot(SOURCE_AXIS));
  if (SOURCE_UP.lengthSq() < 1e-10) SOURCE_UP.set(1, 0, 0);
  SOURCE_UP.normalize();
  SOURCE_RIGHT.crossVectors(SOURCE_UP, SOURCE_AXIS).normalize();
  FRAME_SOURCE.makeBasis(SOURCE_RIGHT, SOURCE_UP, SOURCE_AXIS);
  FRAME_TARGET.makeBasis(TARGET_RIGHT, TARGET_UP, TARGET_AXIS);
  WORLD_Q.setFromRotationMatrix(FRAME_TARGET.multiply(FRAME_SOURCE.invert()));
  object.parent.getWorldQuaternion(PARENT_Q).invert();
  object.quaternion.copy(PARENT_Q).multiply(WORLD_Q);
  object.position.copy(object.parent.worldToLocal(ORIGIN));
  if (realSize) {
    object.parent.getWorldScale(PARENT_SCALE);
    const inherited = Math.max(Math.abs(PARENT_SCALE.x), Math.abs(PARENT_SCALE.y), Math.abs(PARENT_SCALE.z)) || 1;
    object.scale.setScalar(1 / inherited);
  }
  object.visible = sample[9] > .5;
  object.updateMatrix();
  object.updateMatrixWorld(true);
  return true;
}

// ---- prop meshes ------------------------------------------------------------------
function BayonetMesh(actor) {
  const group = new THREE.Group();
  group.name = "OpeningProp_Bayonet";
  const materials = actor.materials || {};
  const built = actor.factory?.meshDocs?.has?.("BayonetType38") ? actor.factory._InstantiateMesh("BayonetType38") : null;
  if (built) {
    built.root.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const bucket = child.material?.name || "steel";
      const mesh = new THREE.Mesh(child.geometry, materials[bucket] || materials.steel);
      mesh.castShadow = true;
      mesh.matrix.copy(child.matrixWorld);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    });
  } else {
    // Low-quality fallback: a 400 mm blade and a 114 mm grip, same axes as the model.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.006, .026, .40).translate(0, 0, -.20), materials.steel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.020, .030, .114).translate(0, 0, .057), materials.wood || materials.steel);
    group.add(blade, grip);
  }
  return group;
}

/** Broken beam: 1.55 m of 13x12 cm timber, the far end splintered. Long axis = local +X. */
function BeamGeometry(spec) {
  const L = spec?.lengthM || 1.55, W = spec?.widthM || .13, H = spec?.heightM || .12, S = spec?.splinterM || .22;
  const body = new THREE.BoxGeometry(L - S, H, W).translate(-S / 2, 0, 0);
  // Splinters: three tapering wedges of different lengths off the broken end.
  const parts = [body];
  const wedges = [[.9, .35, .30], [.55, -.30, -.28], [1.0, .05, -.32]];
  for (const [length, dy, dz] of wedges) {
    const w = new THREE.ConeGeometry(Math.min(W, H) * .32, S * length, 4, 1);
    w.rotateZ(-Math.PI / 2);
    w.translate((L - S) / 2 + S * length / 2 - S / 2, dy * H, dz * W);
    parts.push(w);
  }
  let merged = parts[0].toNonIndexed();
  for (let i = 1; i < parts.length; i++) {
    const next = parts[i].toNonIndexed();
    const a = merged.getAttribute("position"), b = next.getAttribute("position");
    const positions = new Float32Array(a.array.length + b.array.length);
    positions.set(a.array, 0); positions.set(b.array, a.array.length);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    merged = geometry;
  }
  merged.computeVertexNormals();
  const uv = new Float32Array(merged.getAttribute("position").count * 2);
  const p = merged.getAttribute("position");
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / .5; uv[i * 2 + 1] = (p.getY(i) + p.getZ(i)) / .5; }
  merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return merged;
}

function BeamMesh(actor, spec) {
  const materials = actor.materials || {};
  const mesh = new THREE.Mesh(BeamGeometry(spec), materials.wood || materials.steel);
  mesh.name = "OpeningProp_Beam";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function RifleMesh(actor, weaponId = "HanYang") {
  const group = new THREE.Group();
  group.name = `OpeningProp_${weaponId}`;
  const built = actor.factory?.WeaponGeometry?.(weaponId, 0, {});
  if (!built) return { group, muzzle: new THREE.Vector3(0, 0, -1) };
  const materials = actor.materials || {};
  for (const [key, geometry] of built.geometries) {
    const mesh = new THREE.Mesh(geometry, materials[key] || materials.steel);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return { group, muzzle: built.muzzle.clone() };
}

const MODEL_AXIS = { bayonet: new THREE.Vector3(0, 0, -1), beam: new THREE.Vector3(1, 0, 0) };
const MODEL_UP = new THREE.Vector3(0, 1, 0);
const SAMPLE = new Float64Array(10);
const MOUNT_SAMPLE = new Float64Array(10);
const BONE_MATRIX = new THREE.Matrix4();
const ROOT_INVERSE = new THREE.Matrix4();
const MOUNT_POINT = new THREE.Vector3();
const MOUNT_AXIS = new THREE.Vector3();
const MOUNT_UP = new THREE.Vector3();
const BLEND_Q = new THREE.Quaternion();
const BLEND_P = new THREE.Vector3();

/**
 * Clip time of a clip with a `holdLoop` window [h0, h1] (clip seconds). Past h1 the playhead
 * wraps inside the window, so a director can hold "fist in the hair" or "kneeling, hand on
 * the shoulder" for as long as the dialogue runs. `holdUntil` (clip seconds on the director's
 * clock, optional) lets go of the loop: from that moment the playhead carries on from wherever
 * the loop was, through h1 to the end of the clip (e.g. LuoKneelCheck's 2.6-3.4 s release and
 * rise). Without `holdUntil` the window loops for ever.
 */
export function OpeningHoldTime(hold, duration, seconds, holdUntil) {
  if (!hold || !(seconds > hold[1])) return seconds;
  const span = hold[1] - hold[0];
  const Wrap = (at) => (at > hold[1] && span > 1e-6 ? hold[0] + ((at - hold[0]) % span) : Math.min(at, hold[1]));
  if (!Number.isFinite(holdUntil) || seconds <= holdUntil) return Wrap(seconds);
  // Released: continue from where the loop was at the moment of release.
  const from = holdUntil > hold[1] ? Wrap(holdUntil) : holdUntil;
  return Math.min(duration, from + (seconds - holdUntil));
}

/** A bone by its glTF name (GLTFLoader rewrites spaces and dots in node names). */
const Normalize = (name) => String(name || "").replace(/[\s_.:]/g, "").toLowerCase();
function FindBone(root, name) {
  if (!root || !name) return null;
  const want = Normalize(name);
  let found = null;
  root.traverse((node) => { if (!found && node.isBone && Normalize(node.name) === want) found = node; });
  return found;
}

/** Topmost ancestor (the scene), or null when the object is not in a tree. */
function SceneRoot(object) {
  let top = object?.parent || null;
  while (top?.parent) top = top.parent;
  return top;
}

/** Re-parent `object` to the scene root keeping its world transform. Returns true if moved. */
function LeaveInWorld(object) {
  const top = SceneRoot(object);
  if (!top) return false;
  object.updateWorldMatrix(true, false);
  top.attach(object);
  object.matrixAutoUpdate = true;
  object.updateMatrixWorld(true);
  return true;
}

/** The extra props one actor shows while playing opening clips. Built lazily, per actor. */
export class OpeningPropSet {
  constructor(actor, propsSpec = {}) {
    this.actor = actor;
    this.spec = propsSpec;
    this.items = new Map();
    this.owned = new Set();           // props this actor carries between clips (the sheathed bayonet)
    this.mounts = {};                 // record.propMounts: {name: {bone, origin, axis, up}} (rig asset)
    this.left = [];                   // objects left in the world (dropped weapon), removed on Dispose
    this.from = new Map();            // name -> {p, q, visible} displayed when the clip changed
  }

  Item(name) {
    let item = this.items.get(name);
    if (item) return item;
    const actor = this.actor;
    if (name === "bayonet") item = { object: BayonetMesh(actor), axis: MODEL_AXIS.bayonet };
    else if (name === "beam") item = { object: BeamMesh(actor, this.spec.beam), axis: MODEL_AXIS.beam };
    else if (name === "rifle") {
      const rifle = RifleMesh(actor, "HanYang");
      item = { object: rifle.group, axis: rifle.muzzle.lengthSq() > 1e-8 ? rifle.muzzle.normalize() : new THREE.Vector3(0, 0, -1) };
    } else return null;
    item.object.visible = false;
    (actor.root || actor.characterRig?.root)?.add(item.object);
    this.items.set(name, item);
    return item;
  }

  /** Carry `name` between clips: a prop with a bone mount (the bayonet in its scabbard) is shown
   * on that bone whenever the playing clip has no track for it. Clips with a `bayonet` track own
   * it automatically; a director can own it earlier (ijaA before the draw). */
  Own(name) { this.owned.add(name); }

  /** Remember what is displayed now; Update eases every prop from here over the pose blend. */
  BeginBlend() {
    this.from.clear();
    for (const [name, item] of this.items) {
      this.from.set(name, { p: item.object.position.clone(), q: item.object.quaternion.clone(), visible: item.object.visible });
    }
  }

  /**
   * Show the named extra props of `clip` at `seconds`; hide the ones it does not name (an owned
   * prop with a bone mount goes back to that bone). `mix` < 1 (the pose blend, 0..1) eases each
   * prop from where it was displayed when the clip changed, in step with the bones.
   */
  Update(clip, seconds, rigRoot, mix = 1) {
    const tracks = clip?.props || {};
    for (const name of Object.keys(tracks)) if (name === "bayonet") this.owned.add(name);
    for (const [name, item] of this.items) if (!tracks[name] && !this.owned.has(name)) item.object.visible = false;
    for (const name of new Set([...Object.keys(tracks), ...this.owned])) {
      if (name === "weapon") continue;
      const item = this.Item(name);
      if (!item) continue;
      if (tracks[name]) {
        if (!SampleOpeningPropTrack(tracks[name], clip, seconds, SAMPLE)) { item.object.visible = false; continue; }
        PlaceOnOpeningTrack(item.object, SAMPLE, rigRoot, item.axis, MODEL_UP, true);
      } else if (!this.PlaceOnMount(name, item, rigRoot)) {
        item.object.visible = false;
        continue;
      }
      const from = this.from.get(name);
      if (mix < 1 && from?.visible && item.object.visible) {
        item.object.position.lerpVectors(from.p, BLEND_P.copy(item.object.position), mix);
        item.object.quaternion.slerpQuaternions(from.q, BLEND_Q.copy(item.object.quaternion), mix);
        item.object.updateMatrix();
        item.object.updateMatrixWorld(true);
      }
    }
  }

  /** Put an owned prop on its bone mount (rig asset `propMounts`). */
  PlaceOnMount(name, item, rigRoot) {
    const mount = this.mounts?.[name];
    const bone = mount && FindBone(this.actor.characterRig?.root || rigRoot, mount.bone);
    if (!bone || !rigRoot) return false;
    bone.updateWorldMatrix(true, false);
    rigRoot.updateWorldMatrix(true, false);
    // bone-local -> world -> rig-root local (the frame PlaceOnOpeningTrack expects)
    BONE_MATRIX.multiplyMatrices(ROOT_INVERSE.copy(rigRoot.matrixWorld).invert(), bone.matrixWorld);
    MOUNT_POINT.fromArray(mount.origin).applyMatrix4(BONE_MATRIX);
    MOUNT_AXIS.fromArray(mount.axis).transformDirection(BONE_MATRIX);
    MOUNT_UP.fromArray(mount.up).transformDirection(BONE_MATRIX);
    MOUNT_SAMPLE[0] = MOUNT_POINT.x; MOUNT_SAMPLE[1] = MOUNT_POINT.y; MOUNT_SAMPLE[2] = MOUNT_POINT.z;
    MOUNT_SAMPLE[3] = MOUNT_AXIS.x; MOUNT_SAMPLE[4] = MOUNT_AXIS.y; MOUNT_SAMPLE[5] = MOUNT_AXIS.z;
    MOUNT_SAMPLE[6] = MOUNT_UP.x; MOUNT_SAMPLE[7] = MOUNT_UP.y; MOUNT_SAMPLE[8] = MOUNT_UP.z;
    MOUNT_SAMPLE[9] = 1;
    return PlaceOnOpeningTrack(item.object, MOUNT_SAMPLE, rigRoot, item.axis, MODEL_UP, true);
  }

  /**
   * Hand `name` over to the caller and leave it where it is in the world (re-parented to the
   * scene root with its world transform): the kicked beam, a planted blade. It stops following
   * the actor and this set no longer updates, hides or disposes it -- the caller owns it.
   */
  Detach(name) {
    const item = this.items.get(name);
    if (!item) return null;
    this.items.delete(name);
    this.owned.delete(name);
    this.from.delete(name);
    LeaveInWorld(item.object);
    return item.object;
  }

  /**
   * Leave a copy of the actor's hand weapon in the world where it is displayed now (the rifle a
   * blast throws, the dadao planted in the dirt) and hide the hand weapon until the actor gets a
   * new one (SetWeapon builds a new weaponGroup, which is shown again). The copy shares the
   * weapon's geometry; Dispose removes it.
   */
  DropWeapon() {
    const actor = this.actor, group = actor?.weaponGroup;
    if (!group || this.dropped === group) return this.droppedObject || null;
    const copy = group.clone();
    copy.name = `OpeningDropped_${actor.weaponId || "weapon"}`;
    group.parent?.add(copy);
    copy.position.copy(group.position); copy.quaternion.copy(group.quaternion); copy.scale.copy(group.scale);
    copy.visible = true;
    if (!LeaveInWorld(copy)) { copy.parent?.remove(copy); return null; }
    group.visible = false;
    this.dropped = group;
    this.droppedObject = copy;
    this.left.push(copy);
    return copy;
  }

  /** True while the actor's current hand weapon is the one that was dropped (keep it hidden). */
  WeaponDropped() { return !!this.dropped && this.dropped === this.actor?.weaponGroup; }

  HideAll() { for (const item of this.items.values()) item.object.visible = false; }

  Dispose() {
    for (const item of this.items.values()) {
      item.object.parent?.remove(item.object);
      item.object.traverse((node) => { if (node.isMesh && node.name === "OpeningProp_Beam") node.geometry.dispose(); });
    }
    for (const object of this.left) object.parent?.remove(object);
    this.items.clear();
    this.left.length = 0;
    this.from.clear();
    this.dropped = this.droppedObject = null;
  }
}

/**
 * Drive the actor's own hand weapon from the clip's `weapon` track. Returns true when applied.
 * `from` ({p, q} of weaponGroup, captured when the clip changed) and `mix` < 1 ease it in step
 * with the pose blend, so the weapon does not jump ahead of the hands.
 */
export function ApplyOpeningWeaponTrack(actor, clip, seconds, from = null, mix = 1) {
  const track = clip?.props?.weapon;
  const group = actor?.weaponGroup, rig = actor?.characterRig;
  if (!track || !group || !rig?.root) return false;
  if (!SampleOpeningPropTrack(track, clip, seconds, SAMPLE)) return false;
  const muzzle = actor.weaponMuzzle?.lengthSq?.() > 1e-8 ? actor.weaponMuzzle : MODEL_AXIS.bayonet;
  const scale = group.scale.x;
  PlaceOnOpeningTrack(group, SAMPLE, rig.root, muzzle, MODEL_UP, false);
  group.scale.setScalar(scale);
  if (from && mix < 1) BlendWeaponFrom(group, from, mix);
  group.updateMatrix();
  return true;
}

/** Ease the weapon group from a captured local transform toward where it is now. */
export function BlendWeaponFrom(group, from, mix) {
  if (!group || !from || !(mix < 1)) return;
  group.position.lerpVectors(from.p, BLEND_P.copy(group.position), mix);
  group.quaternion.slerpQuaternions(from.q, BLEND_Q.copy(group.quaternion), mix);
  group.updateMatrix();
  group.updateMatrixWorld(true);
}
