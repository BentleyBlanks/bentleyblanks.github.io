// Prop tracks of the 01–02 opening action library (Animation/OpeningStoryboards).
// A clip row may carry `props: { name: { stride: 10, values } }`, one row per frame:
// origin xyz, axis xyz, up xyz, visible — in glTF scene space, i.e. the local frame
// of the rig root (source metres; the rig root carries the model scale and the π yaw).
// `weapon` drives the actor's own hand weapon (its mount is bypassed for that clip);
// `bayonet`, `beam` and `rifle` are extra props this module builds and owns.
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

/** The extra props one actor shows while playing opening clips. Built lazily, per actor. */
export class OpeningPropSet {
  constructor(actor, propsSpec = {}) {
    this.actor = actor;
    this.spec = propsSpec;
    this.items = new Map();
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

  /** Show the named extra props of `clip` at `seconds`; hide the ones it does not name. */
  Update(clip, seconds, rigRoot) {
    const tracks = clip?.props || {};
    for (const [name, item] of this.items) if (!tracks[name]) item.object.visible = false;
    for (const name of Object.keys(tracks)) {
      if (name === "weapon") continue;
      const item = this.Item(name);
      if (!item) continue;
      if (!SampleOpeningPropTrack(tracks[name], clip, seconds, SAMPLE)) { item.object.visible = false; continue; }
      PlaceOnOpeningTrack(item.object, SAMPLE, rigRoot, item.axis, MODEL_UP, true);
    }
  }

  /** Leave every prop where it is (the director may keep a planted blade or a kicked beam). */
  Detach(name) {
    const item = this.items.get(name);
    if (!item) return null;
    this.items.delete(name);
    return item.object;
  }

  HideAll() { for (const item of this.items.values()) item.object.visible = false; }

  Dispose() {
    for (const item of this.items.values()) {
      item.object.parent?.remove(item.object);
      item.object.traverse((node) => { if (node.isMesh && node.name === "OpeningProp_Beam") node.geometry.dispose(); });
    }
    this.items.clear();
  }
}

/** Drive the actor's own hand weapon from the clip's `weapon` track. Returns true when applied. */
export function ApplyOpeningWeaponTrack(actor, clip, seconds) {
  const track = clip?.props?.weapon;
  const group = actor?.weaponGroup, rig = actor?.characterRig;
  if (!track || !group || !rig?.root) return false;
  if (!SampleOpeningPropTrack(track, clip, seconds, SAMPLE)) return false;
  const muzzle = actor.weaponMuzzle?.lengthSq?.() > 1e-8 ? actor.weaponMuzzle : MODEL_AXIS.bayonet;
  const scale = group.scale.x;
  PlaceOnOpeningTrack(group, SAMPLE, rig.root, muzzle, MODEL_UP, false);
  group.scale.setScalar(scale);
  group.updateMatrix();
  return true;
}
