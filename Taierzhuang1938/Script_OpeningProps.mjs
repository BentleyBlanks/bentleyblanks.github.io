// Prop tracks of the 01–02 opening action library (Animation/OpeningStoryboards).
// A clip row may carry `props: { name: { stride: 10, values } }`, one row per frame:
// origin xyz, axis xyz, up xyz, visible — in glTF scene space, i.e. the local frame
// of the rig root (source metres; the rig root carries the model scale and the π yaw).
// `weapon` drives the actor's own hand weapon (its mount is bypassed for that clip);
// `bayonet`, `beam` and `rifle` are extra props this module builds and owns. Props follow the
// 0.28 s pose blend when a clip changes (BeginBlend + mix), an owned bayonet rides its scabbard
// mount between clips, and a weapon a clip throws away can be left in the world (DropWeapon).
import * as THREE from "three";
import { mergeGeometries } from "./vendor/three/examples/jsm/utils/BufferGeometryUtils.js";
import { SET_MATERIALS as OPENING_SET_MATERIALS, REDRAFT_PROPS } from "./Data_OpeningSet0103.mjs";

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
  // 世界米 UV、木纹沿长边（x）：开场木料贴图的木纹沿 V（Data_OpeningSet0103.SET_MATERIALS.timber）。
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getY(i) + p.getZ(i); uv[i * 2 + 1] = p.getX(i); }
  merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return merged;
}

function BeamMesh(actor, spec) {
  const materials = actor.materials || {};
  // 与掩蔽部布景同一份风化旧木（第一关按需集 OpeningTimber，2026-09-28 3A 迭代 B5）；没下到就用人物的木料。
  const library = actor.factory?.library, timber = OPENING_SET_MATERIALS.timber;
  const wood = library?.baked?.has?.(timber.recipe) ? library.Get(timber.recipe, timber.options) : materials.wood;
  const mesh = new THREE.Mesh(BeamGeometry(spec), wood || materials.steel);
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
    } else if (REDRAFT_PROPS[name]) {
      // 2026-10-11 开场重构的道具（契约 §5.2）：clip 带同名 prop 轨就画在这个人手里（同一套挂载约定：长轴局部 -Z、上 +Y）。
      // 自己建的几何与材质在 Dispose 里一起收。
      const built = BuildRedraftProp(name, { factory: actor.factory, materials: actor.materials, wearer: actor });
      if (!built) return null;
      item = { object: built.object, axis: built.axis, owned: built };
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
      DisposeBuilt(item.owned);
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

// ===========================================================================
// 2026-10-11 开场重构的道具（契约 docs/Data_OpeningRedraft20261011Contract.md §5.2；数据 Data_OpeningSet0103.REDRAFT_PROPS）
// ===========================================================================
// 两种用法，同一套几何：
//  · clip 带同名 prop 轨（AnimA / AnimB 新烘的 bread / grenade / comradeRifle …）：OpeningPropSet.Item 建在那个人身上，
//    按轨摆（上面的挂载约定：长轴局部 -Z、上 +Y）；
//  · 世界里的那一份（OpeningWorldProps，Script_OpeningSet 持有，导演用 r.openingSet.props 按名取用）：躺在地上、
//    跟着某人的手骨（替身：clip 还没有这条轨时）、按抛物线丢出去落地弹两下滚停、挂到别的物体上（背包口的便服）。
// 握在谁手里时，那个人的 clip 有这条轨就由 clip 画（世界那一份藏起来），没有就世界那一份跟着他的手骨走。

const DEG = Math.PI / 180;
const V3 = (a) => new THREE.Vector3(a?.[0] || 0, a?.[1] || 0, a?.[2] || 0);
const Color = (hex) => new THREE.Color(hex);

/** 顶点色材质（道具自己建，Dispose 收）。 */
function PropMaterial(owned, options) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...options });
  owned.materials.push(material);
  return material;
}
function Own(owned, geometry) { owned.geometries.push(geometry); return geometry; }
function PropMesh(owned, geometry, material, name) {
  const mesh = new THREE.Mesh(Own(owned, geometry), material);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
/** 给非索引几何按三角形写顶点色。pick(centroid, normal) → THREE.Color。 */
function PaintTriangles(geometry, pick) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.computeVertexNormals();
  const pos = g.attributes.position, colors = new Float32Array(pos.count * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const centroid = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    normal.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const color = pick(centroid, normal);
    for (let k = 0; k < 3; k++) colors.set([color.r, color.g, color.b], (i + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (g !== geometry) geometry.dispose();
  return g;
}
const Hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

/** 半块大饼 / 掰下的一角：扇形挤出（厚 thickM），上下面焦黄带焦斑，弧边是烙过的硬边，直边是白色断面。平放（厚度沿 Y）。 */
function BreadGeometry(spec) {
  const r = spec.radiusM, arc = spec.arcDeg * DEG, shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0, r, -arc / 2, arc / 2, false);
  shape.lineTo(0, 0);
  let g = new THREE.ExtrudeGeometry(shape, { depth: spec.thickM, bevelEnabled: true, bevelThickness: spec.thickM * 0.25,
    bevelSize: spec.thickM * 0.3, bevelSegments: 2, curveSegments: Math.max(6, Math.round(spec.arcDeg / 10)) });
  g.translate(0, 0, -spec.thickM / 2).rotateX(-Math.PI / 2);
  g.computeBoundingBox();
  const center = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-center.x, -center.y, -center.z);
  const crust = Color(spec.color), crumb = Color(spec.crumb), char = Color(spec.char);
  const offset = center.clone();
  return PaintTriangles(g, (p, n) => {
    const x = p.x + offset.x, z = p.z + offset.z, radial = Math.hypot(x, z);
    if (Math.abs(n.y) > 0.6) {
      const spot = Hash(Math.round(x * 60), Math.round(z * 60), n.y > 0 ? 1 : 2);
      return crust.clone().lerp(char, spot > 0.86 ? 0.75 : spot * 0.18);
    }
    return radial > r * 0.8 ? crust.clone().lerp(char, 0.35) : crumb;
  });
}

/** 桥夹：钢片 + 五发铜弹（同导演补给夹 BuildSupplyProps 的尺寸）。 */
function ChargerObject(owned) {
  const group = new THREE.Group(), brass = PropMaterial(owned, { color: 0x887039, metalness: 0.65, roughness: 0.58 }),
    steel = PropMaterial(owned, { color: 0x343533, metalness: 0.7, roughness: 0.5 });
  const frame = PropMesh(owned, new THREE.BoxGeometry(0.061, 0.005, 0.009), steel, "OpeningProp_ChargerFrame");
  frame.position.y = -0.025; group.add(frame);
  for (let i = 0; i < 5; i++) {
    const round = PropMesh(owned, new THREE.CylinderGeometry(0.003, 0.004, 0.053, 8), brass, "OpeningProp_ChargerRound");
    round.position.x = (i - 2) * 0.011; group.add(round);
  }
  return group;
}

/** 汉阳造枪栓：栓体圆柱（长轴 -Z，机头在 -Z）、机头加粗、尾部拉机柄 + 球。 */
function BoltObject(owned, spec) {
  const group = new THREE.Group(), steel = PropMaterial(owned, { color: spec.color, metalness: 0.75, roughness: 0.45 });
  const L = spec.lengthM, r = spec.radiusM;
  const body = PropMesh(owned, new THREE.CylinderGeometry(r, r, L, 12).rotateX(Math.PI / 2), steel, "OpeningProp_BoltBody");
  const head = PropMesh(owned, new THREE.CylinderGeometry(r * 1.15, r * 1.15, L * 0.18, 12).rotateX(Math.PI / 2), steel, "OpeningProp_BoltHead");
  head.position.z = -L * 0.41;
  const handle = PropMesh(owned, new THREE.CylinderGeometry(r * 0.38, r * 0.38, 0.055, 8).rotateZ(Math.PI / 2), steel, "OpeningProp_BoltHandle");
  handle.position.set(0.032, 0, L * 0.32);
  const knob = PropMesh(owned, new THREE.SphereGeometry(spec.knobM / 2, 10, 8), steel, "OpeningProp_BoltKnob");
  knob.position.set(0.06, 0, L * 0.32);
  group.add(body, head, handle, knob);
  return group;
}

/** 布胸章：白布条 + 上沿一道蓝边 + 一圈深色缝线（顶点色，无贴图）。平面在 XY，正面朝 +Z。 */
function BadgeObject(owned, spec) {
  const w = spec.widthM, h = spec.heightM, t = spec.thickM;
  const g = new THREE.BoxGeometry(w, h, t, 8, 4, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + Math.sin(pos.getX(i) * 90) * 0.0006);   // 布面微皱
  const cloth = Color(spec.cloth), edge = Color(spec.edge), stitch = Color(spec.stitch);
  const painted = PaintTriangles(g, (p) => {
    if (p.y > h * 0.22) return edge;
    if (Math.abs(p.x) > w / 2 - 0.004 || p.y < -h / 2 + 0.004) return stitch;
    return cloth.clone().multiplyScalar(0.92 + Hash(p.x * 400, p.y * 400, 3) * 0.08);
  });
  return PropMesh(owned, painted, PropMaterial(owned, { vertexColors: true, roughness: 0.95 }), "OpeningProp_ChestBadge");
}

/** 九一式手榴弹：分节铸铁弹体（三道横槽）+ 底座 + 顶部铜引信帽。车削体，长轴 -Z（引信朝 -Z）。 */
function Type91Object(owned, spec) {
  const R = spec.diameterM / 2, H = spec.heightM, half = H / 2;
  const body = [new THREE.Vector2(0, -half), new THREE.Vector2(R * 0.74, -half), new THREE.Vector2(R * 0.74, -half + 0.012), new THREE.Vector2(R, -half + 0.016)];
  const grooves = Math.max(1, spec.segments - 1);
  for (let k = 1; k <= grooves; k++) {
    const y = -half + 0.016 + (H - 0.024) * k / (grooves + 1);
    body.push(new THREE.Vector2(R, y - 0.0025), new THREE.Vector2(R * 0.9, y - 0.001), new THREE.Vector2(R * 0.9, y + 0.001), new THREE.Vector2(R, y + 0.0025));
  }
  body.push(new THREE.Vector2(R, half - 0.008), new THREE.Vector2(R * 0.55, half), new THREE.Vector2(0, half));
  const fr = spec.fuseDiameterM / 2, f = spec.fuseM;
  const fuse = [new THREE.Vector2(0, half - 0.001), new THREE.Vector2(fr, half - 0.001), new THREE.Vector2(fr, half + f * 0.7),
    new THREE.Vector2(fr * 0.7, half + f * 0.75), new THREE.Vector2(fr * 0.7, half + f), new THREE.Vector2(0, half + f)];
  const group = new THREE.Group(), center = f / 2;
  const iron = PropMaterial(owned, { color: spec.color, roughness: 0.78, metalness: 0.25 }), brass = PropMaterial(owned, { color: spec.fuse, roughness: 0.5, metalness: 0.7 });
  const toAxis = (g) => g.translate(0, -center, 0).rotateX(-Math.PI / 2);
  group.add(PropMesh(owned, toAxis(new THREE.LatheGeometry(body, 16)), iron, "OpeningProp_Type91Body"),
    PropMesh(owned, toAxis(new THREE.LatheGeometry(fuse, 12)), brass, "OpeningProp_Type91Fuse"));
  return group;
}

/** 叠起来的蓝布便服（起皱的扁块，几道深色折痕）。 */
function ClothObject(owned, spec) {
  const [w, h, d] = spec.sizeM, g = new THREE.BoxGeometry(w, h, d, 6, 2, 4), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), n = Hash(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) - 0.5;
    pos.setXYZ(i, x + n * 0.01, y + n * 0.012 + Math.sin(x * 40) * 0.004, z + n * 0.01);
  }
  const base = Color(spec.color), fold = Color(spec.fold);
  const painted = PaintTriangles(g, (p) => (Math.sin(p.x * 70 + p.z * 25) > 0.75 ? fold : base.clone().multiplyScalar(0.9 + Hash(p.x * 90, p.z * 90, 5) * 0.12)));
  return PropMesh(owned, painted, PropMaterial(owned, { vertexColors: true, roughness: 0.96 }), "OpeningProp_CivilianShirt");
}

/** 现成武器（工厂的武器几何，共用不收）；Type11 再补两条两脚架腿（自建，收）。 */
function WeaponObject(owned, spec, ctx) {
  const factory = ctx.factory;
  const built = factory?.WeaponGeometry?.(spec.weapon, 0, {});
  if (!built) return null;
  const materials = ctx.materials || factory.ActorMaterials?.(spec.weapon === "Type11" ? "ija" : "nra", () => 0.5) || {};
  const group = new THREE.Group();
  for (const [key, geometry] of built.geometries) {
    const mesh = new THREE.Mesh(geometry, materials[key] || materials.steel);
    mesh.name = `OpeningProp_${spec.weapon}_${key}`; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  const muzzle = built.muzzle?.clone?.() || new THREE.Vector3(0, 0.035, -1);
  if (spec.bipod) {
    const b = spec.bipod, steel = materials.steel || PropMaterial(owned, { color: 0x333331, metalness: 0.7, roughness: 0.5 });
    const top = new THREE.Vector3(0, muzzle.y - 0.012, muzzle.z + b.fromMuzzleM), feet = [], legs = [];
    for (const side of [-1, 1]) {
      const dir = new THREE.Vector3(side * Math.sin(b.spreadDeg / 2 * DEG), -Math.cos(b.rakeDeg * DEG), -Math.sin(b.rakeDeg * DEG)).normalize();
      const at = new THREE.Matrix4().compose(top.clone().addScaledVector(dir, b.legM / 2),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir), new THREE.Vector3(1, 1, 1));
      legs.push(new THREE.CylinderGeometry(b.radiusM, b.radiusM * 0.8, b.legM, 6).applyMatrix4(at));
      feet.push(top.clone().addScaledVector(dir, b.legM));
    }
    // 两条腿同一材质：烘进一份几何，一趟少一个 draw（2026-10-12 R4-Perf；原来两只网格，形状逐顶点相同）。
    group.add(PropMesh(owned, mergeGeometries(legs, false), steel, "OpeningProp_Type11Bipod"));
    for (const leg of legs) leg.dispose();
    // 两只脚的中点（局部）：PlaceOnBipod 把它放到垫尸背上。
    group.userData.bipodFoot = feet[0].add(feet[1]).multiplyScalar(0.5);
  }
  return { group, axis: muzzle.lengthSq() > 1e-8 ? new THREE.Vector3(0, 0, Math.sign(muzzle.z) || -1) : new THREE.Vector3(0, 0, -1) };
}

/**
 * 建一件开场重构道具（不含异步的外部模型 ammoBox，那件由 OpeningWorldProps 用 loadExternal 建）。
 * ctx: { factory, materials }（武器要工厂；没有就返回 null）。返回 { object, axis, geometries, materials } 或 null。
 */
export function BuildRedraftProp(name, ctx = {}) {
  const spec = REDRAFT_PROPS[name];
  if (!spec) return null;
  const owned = { geometries: [], materials: [] };
  let object = null, axis = new THREE.Vector3(0, 0, -1);
  if (spec.kind === "bread") object = PropMesh(owned, BreadGeometry(spec), PropMaterial(owned, { vertexColors: true, roughness: 0.92 }), `OpeningProp_${name}`);
  else if (spec.kind === "charger") object = ChargerObject(owned);
  else if (spec.kind === "bolt") object = BoltObject(owned, spec);
  else if (spec.kind === "badge") object = BadgeObject(owned, spec);
  else if (spec.kind === "type91") object = Type91Object(owned, spec);
  else if (spec.kind === "cloth") object = ClothObject(owned, spec);
  else if (spec.kind === "weapon") { const w = WeaponObject(owned, spec, ctx); if (!w) return null; object = w.group; axis = w.axis; }
  else if (spec.kind === "wornCap") object = WornCapObject(owned, spec, ctx);
  else return null;
  if (!object.isGroup) { const group = new THREE.Group(); group.add(object); object = group; }
  object.name = `OpeningProp_${name}`;
  // (2026-10-12: the same object, not a copy -- an asynchronously loaded prop, the helmet, checks `disposed` on it and adds what it loads.)
  return Object.assign(owned, { object, axis });
}
function DisposeBuilt(built) {
  if (!built) return;
  built.disposed = true;
  for (const g of built.geometries || []) g.dispose();
  for (const m of built.materials || []) m.dispose();
  for (const t of built.textures || []) t.dispose();
}

/**
 * 2026-10-12 R2：外部模型道具（wornCap）的模板与换色用的模块，开场导演就绪前载好（PreloadRedraftModels；导演在
 * LoadOpeningStoryboardAnimation 旁边一起等）。逐帧同步推进的测试和抓帧里，开场中途才发起的异步载入要等页面空闲才走完
 * （实测何有田的帽子到 Orders 还没挂上），所以先载、用时同步克隆。
 */
const PRELOADED = { modules: null, models: new Map() };
export function PreloadRedraftModels() {
  if (typeof document === "undefined") return Promise.resolve();
  return PRELOADED.promise ??= (async () => {
    const [{ ManagedGLTFLoader }, { TagCharacterSurface }, { ApplyNraUniform }, { PatchesOf }] = await Promise.all([
      import("./Script_ModelImports.mjs"), import("./Script_CharacterSurface.mjs"), import("./Script_UniformColors.mjs"), import("./Script_MaterialPatches.mjs")]);
    PRELOADED.modules = { TagCharacterSurface, ApplyNraUniform, PatchesOf };
    const urls = [...new Set(Object.values(REDRAFT_PROPS).filter((s) => s.kind === "wornCap").map((s) => s.model))];
    await Promise.all(urls.map(async (url) => PRELOADED.models.set(url, (await new ManagedGLTFLoader().loadAsync(url)).scene)));
  })().catch((error) => console.warn(`[OpeningProps] preload: ${error}`));
}

/**
 * 2026-10-12 R2：何有田的军便帽（REDRAFT_PROPS.helmet，kind wornCap）。预载的模板克隆一份（几何与材质各自克隆，贴图共用模板的），
 * 颜色按戴帽人（ctx.wearer：他的 Actor）自己的军装换色：打标 → characterPbrSurface → ApplyNraUniform(他布料的
 * nraUniformPalette) → 布料变体的 uCharGrimeSeed.w 抬到 grimeLift（R2-Anim 报告 §2：不抬会按道具自己坐标里的高度画一身泥）。
 * 克隆的几何与材质（原件和换色后的）记进 owned，Dispose 一起收。没预载好（或 node 测试）就是空组，模板载好后再挂上。
 */
function WornCapObject(owned, spec, ctx) {
  const group = new THREE.Group();
  if (typeof document === "undefined") return group;
  const Attach = () => {
    const template = PRELOADED.models.get(spec.model), M = PRELOADED.modules;
    if (!template || !M || owned.disposed) return;
    const cap = template.clone(true);
    cap.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry = o.geometry.clone(); owned.geometries.push(o.geometry);
      o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      owned.materials.push(...(Array.isArray(o.material) ? o.material : [o.material]));
      o.userData.characterPbrSurface = true; o.castShadow = true; o.receiveShadow = true;
    });
    let palette = null;
    ctx.wearer?.root?.traverse((o) => { if (o.isSkinnedMesh && o.material?.userData?.nraUniformPalette) palette ??= o.material.userData.nraUniformPalette; });
    M.TagCharacterSurface(cap, spec.wearer);
    M.ApplyNraUniform(cap, palette || undefined);
    cap.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!owned.materials.includes(m)) owned.materials.push(m);
      for (const p of M.PatchesOf(o.material) || []) { const u = {}; p?.uniforms?.(u, {}); if (u.uCharGrimeSeed) u.uCharGrimeSeed.value.w = spec.grimeLift; }
    });
    cap.scale.setScalar(spec.scale);
    group.add(cap);
  };
  if (PRELOADED.models.has(spec.model) && PRELOADED.modules) Attach();
  else PreloadRedraftModels().then(Attach);
  return group;
}

/**
 * 2026-10-12 R2：摘下 / 戴回 NRA02 头上那顶帽子（帽子长在军装布料网格里，不是单独的网格）。摘：这个人的布料网格换一份克隆的
 * 几何，「三个顶点头骨权重都 ≥ headWeightMin」的三角挪到索引末尾，setDrawRange 截掉；帽徽网格（badgeMaterial）藏起来。不加着色器、
 * 不加程序。戴回：换回原几何、收掉克隆、帽徽显出来。actor：Actor（.root / .characterRig）。幂等。
 */
export function WearNraCap(actor, worn, spec = REDRAFT_PROPS.helmet) {
  const rig = actor?.characterRig, root = actor?.root || rig?.root;
  if (!rig || !root || !spec) return false;
  let state = rig.openingCapHidden;
  if (worn) {
    if (!state) return true;
    state.mesh.geometry = state.original; state.clone.dispose();
    for (const badge of state.badges) badge.visible = true;
    rig.openingCapHidden = null;
    return true;
  }
  if (state) return true;
  let cloth = null; const badges = [];
  root.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    if (o.material?.name === spec.clothMaterial) cloth ??= o;
    else if (o.material?.name === spec.badgeMaterial) badges.push(o);
  });
  if (!cloth?.geometry?.index) return false;
  const N = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const head = cloth.skeleton.bones.findIndex((b) => N(b.name).endsWith("head") && !/nub/.test(N(b.name)));
  if (head < 0) return false;
  const g = cloth.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = g.index;
  const HeadW = (v) => { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(v, k) === head) w += sw.getComponent(v, k); return w; };
  const keep = [], cap = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
    (HeadW(a) >= spec.headWeightMin && HeadW(b) >= spec.headWeightMin && HeadW(c) >= spec.headWeightMin ? cap : keep).push(a, b, c);
  }
  const clone = g.clone();
  clone.setIndex(new THREE.BufferAttribute(new idx.array.constructor([...keep, ...cap]), 1));
  clone.setDrawRange(0, keep.length);
  rig.openingCapHidden = state = { mesh: cloth, original: g, clone, badges, capTriangles: cap.length / 3 };
  cloth.geometry = clone;
  for (const badge of badges) badge.visible = false;
  return true;
}
/** 一件道具建出来的三角形数（共用的武器几何也算：它画在这里）。 */
export function CountTriangles(object) {
  let n = 0;
  object?.traverse((o) => { if (o.isMesh && o.geometry) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return Math.round(n);
}

const _Q = new THREE.Quaternion(), _Q2 = new THREE.Quaternion(), _P = new THREE.Vector3(), _S = new THREE.Vector3(), _BOX = new THREE.Box3();
const ActorOf = (who) => who?.actor || who || null;

/**
 * 世界里的开场重构道具（导演按名取用）。Script_OpeningSet 建在它的 redraft 根下，离开 01–02 整个收走。
 *
 *   const props = r.openingSet.props;
 *   props.Get(name)                                   → 句柄 { name, object, holder, state }（第一次取才建）
 *   props.Place(name, { x, z, yawDeg, pitchDeg, rollDeg, liftM })   躺在地上（贴共享地面，最低点离地 liftM）
 *   props.Hold(name, soldier, { bone = "handR", offset, rotDeg })   在谁手里：他的 clip 有这条 prop 轨就由 clip 画，
 *                                                     没有就跟着那根骨头（offset：骨头局部米；默认数据里的 hand）
 *   props.Release(name, at?)                          放手：留在现在的位置（或 at），回到世界
 *   props.Toss(name, { from, to, seconds, arcM, bounces, bounceM, rollM, rollS, onBounce, onRest })
 *                                                     抛物线飞到 to 前 rollM 落地、弹 bounces 下、滚 rollM 停在 to
 *   props.AttachTo(name, object3D, { x, y, z, yawDeg, pitchDeg, rollDeg })   挂到别的物体上（便服挂背包）
 *   props.PlaceOnBipod("type11", rest, { yawDeg })   歪把子两脚架落在 rest（垫尸背上；OpeningSet.MountLmg 替导演算好）
 *   props.Show(name) / props.Hide(name) / props.Where(name)
 * 导演碰过的道具（以上任一调用）不再按数据的 rest 自动摆（Script_OpeningSet.UpdateRedraft）。
 */
export class OpeningWorldProps {
  constructor({ root, groundAt, factory = null, loadExternal = null }) {
    this.root = root; this.groundAt = groundAt; this.factory = factory; this.loadExternal = loadExternal;
    this.handles = new Map();
    this.generation = 0;
  }

  /** 句柄（第一次取用时建；外部模型 ammoBox 异步，建好之前 object 是空组）。 */
  Get(name) {
    let h = this.handles.get(name);
    if (h) return h;
    const spec = REDRAFT_PROPS[name];
    if (!spec) throw new Error(`OpeningWorldProps: unknown prop ${name}`);
    h = { name, spec, object: null, axis: new THREE.Vector3(0, 0, -1), owned: null, holder: null, attach: null, toss: null,
      state: "hidden", directed: false, triangles: 0 };
    if (spec.kind === "external") {
      h.object = new THREE.Group(); h.object.name = `OpeningProp_${name}`;
      this.LoadExternal(h);
    } else {
      const built = BuildRedraftProp(name, { factory: this.factory });
      if (!built) { h.object = new THREE.Group(); h.object.name = `OpeningProp_${name}_Missing`; h.missing = true; }
      else { h.object = built.object; h.axis = built.axis; h.owned = built; }
    }
    h.object.visible = false;
    this.root.add(h.object);
    h.triangles = CountTriangles(h.object);
    this.handles.set(name, h);
    return h;
  }

  async LoadExternal(h) {
    if (!this.loadExternal) { h.missing = true; return; }
    const generation = this.generation;
    try {
      const template = await this.loadExternal(h.spec.asset);
      if (generation !== this.generation || !template || !h.object.parent) return;
      const clone = template.clone(true);
      clone.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(clone), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const [w, hgt, d] = h.spec.sizeM;
      clone.scale.multiply(new THREE.Vector3(w / Math.max(1e-3, size.x), hgt / Math.max(1e-3, size.y), d / Math.max(1e-3, size.z)));
      clone.position.sub(new THREE.Vector3(center.x * w / Math.max(1e-3, size.x), box.min.y * hgt / Math.max(1e-3, size.y), center.z * d / Math.max(1e-3, size.z)));
      clone.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      h.object.add(clone);
      h.triangles = CountTriangles(h.object);
      if (h.state === "world" && h.at) this.Pose(h, h.at);
    } catch (error) { h.missing = true; console.warn(`[OpeningWorldProps] ${h.name}: ${error}`); }
  }

  Direct(name) { const h = this.Get(name); h.directed = true; return h; }

  /** 世界摆位：先转好朝向，再按实际包围盒把最低点放在共享地面 + liftM 上。 */
  Pose(h, at) {
    const o = h.object;
    h.at = { x: at.x, z: at.z, yawDeg: at.yawDeg || 0, pitchDeg: at.pitchDeg || 0, rollDeg: at.rollDeg || 0, liftM: at.liftM || 0, y: at.y };
    o.position.set(at.x, 0, at.z);
    o.quaternion.setFromEuler(new THREE.Euler((at.pitchDeg || 0) * DEG, (at.yawDeg || 0) * DEG, (at.rollDeg || 0) * DEG, "YXZ"));
    o.scale.setScalar(1);
    o.updateMatrixWorld(true);
    if (Number.isFinite(at.y)) o.position.y = at.y;
    else {
      _BOX.setFromObject(o);
      const bottom = _BOX.isEmpty() ? 0 : _BOX.min.y;
      o.position.y = this.groundAt(at.x, at.z) + (at.liftM || 0) - bottom;
    }
    o.updateMatrixWorld(true);
  }

  Place(name, at) {
    const h = this.Direct(name);
    h.holder = null; h.attach = null; h.toss = null; h.state = "world";
    this.Pose(h, at); h.object.visible = true;
    return h;
  }

  /** 由 Script_OpeningSet 按数据摆 rest（导演没碰过时）。 */
  RestAt(name, at) {
    const h = this.Get(name);
    if (h.directed) return h;
    if (h.state !== "rest" || !h.at || h.at.x !== at.x || h.at.z !== at.z) { h.state = "rest"; this.Pose(h, at); }
    h.object.visible = true;
    return h;
  }
  /** 数据摆位过期（例如 ammoBox 在 Incoming 之后）：导演没接手就藏起来。 */
  RestOff(name) { const h = this.handles.get(name); if (h && !h.directed) { h.state = "hidden"; h.object.visible = false; } }

  Hold(name, who, { bone = "handR", offset = null, rotDeg = null } = {}) {
    const h = this.Direct(name), actor = ActorOf(who);
    h.holder = { who, actor, bone, offset: V3(offset || h.spec.hand), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotDeg || [0, 0, 0]).map((d) => d * DEG))) };
    h.attach = null; h.toss = null; h.state = "held";
    this.FollowHolder(h);
    return h;
  }

  Release(name, at = null) {
    const h = this.Direct(name);
    if (h.holder) this.FollowHolder(h, true);
    h.holder = null; h.attach = null; h.toss = null; h.state = "world";
    if (at) this.Pose(h, at);
    h.object.visible = true;
    return h;
  }

  AttachTo(name, object3D, { x = 0, y = 0, z = 0, yawDeg = 0, pitchDeg = 0, rollDeg = 0 } = {}) {
    const h = this.Direct(name);
    h.holder = null; h.toss = null; h.state = "attached";
    h.attach = { target: object3D, offset: new THREE.Vector3(x, y, z), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchDeg * DEG, yawDeg * DEG, rollDeg * DEG, "YXZ")) };
    this.FollowAttach(h);
    return h;
  }

  /**
   * 歪把子架在两脚架上：两只脚的中点落在 rest（世界点，例如 OpeningSet.MgGunRest()），枪身水平、枪口朝 yawDeg。
   */
  PlaceOnBipod(name, rest, { yawDeg = 0 } = {}) {
    const h = this.Direct(name), foot = h.object.userData.bipodFoot;
    if (!foot) throw new Error(`OpeningWorldProps.PlaceOnBipod: ${name} has no bipod`);
    h.holder = null; h.attach = null; h.toss = null; h.state = "world";
    h.object.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawDeg * DEG); h.object.scale.setScalar(1);
    h.object.position.set(rest.x, rest.y, rest.z).sub(foot.clone().applyQuaternion(h.object.quaternion));
    h.object.updateMatrixWorld(true); h.object.visible = true;
    h.at = { x: h.object.position.x, z: h.object.position.z, y: h.object.position.y, yawDeg };
    return h;
  }

  Show(name) { const h = this.Direct(name); h.object.visible = true; if (h.state === "hidden") h.state = "world"; return h; }
  Hide(name) { const h = this.Direct(name); h.holder = null; h.attach = null; h.toss = null; h.state = "hidden"; h.object.visible = false; return h; }

  /**
   * 丢出去：from（世界点 {x,y,z}，或 "holder" = 当前握着它的手）沿抛物线（最高点比起点高 arcM）飞 seconds 秒，落在 to 前
   * rollM 处，原地弹 bounces 下（第一下 bounceM 高，之后每下减半），再滚 rollS 秒停在 to（绕自己的长轴滚）。
   * onBounce(i) 每次落地（含第一次）回调、onRest() 停稳回调——导演在这里放 grenadeBounce 等音效。
   */
  Toss(name, { from = "holder", to, seconds = 0.4, arcM = 0.25, bounces = 2, bounceM = 0.06, rollM = 0.3, rollS = 0.6, yawDeg = null, onBounce = null, onRest = null } = {}) {
    const h = this.Direct(name);
    if (from === "holder" && h.holder) this.FollowHolder(h, true);
    const start = from === "holder" || !from ? h.object.position.clone() : new THREE.Vector3(from.x, from.y ?? this.groundAt(from.x, from.z) + 1, from.z);
    const dirFlat = new THREE.Vector3(to.x - start.x, 0, to.z - start.z);
    const flatLen = dirFlat.length(); if (flatLen > 1e-6) dirFlat.multiplyScalar(1 / flatLen); else dirFlat.set(1, 0, 0);
    const roll = Math.min(rollM, flatLen * 0.8);
    const land = new THREE.Vector3(to.x - dirFlat.x * roll, 0, to.z - dirFlat.z * roll);
    // 静止朝向：长轴（局部 -Z）横着、垂直于滚动方向（圆柱体就这么滚），yaw 也可以由导演给。
    const restYaw = yawDeg != null ? yawDeg : Math.atan2(-dirFlat.z, dirFlat.x) / DEG;
    h.holder = null; h.attach = null; h.state = "toss"; h.object.visible = true;
    h.toss = { t: 0, start, land, to: { x: to.x, z: to.z }, seconds: Math.max(0.05, seconds), arcM, bounces, bounceM, roll, rollS: roll > 0 ? rollS : 0,
      dir: dirFlat, restYaw, spin: new THREE.Vector3(Hash(start.x, start.z, 1) - 0.5, 1, Hash(start.z, start.x, 2) - 0.5).normalize(),
      q0: h.object.quaternion.clone(), onBounce, onRest, bounced: 0 };
    return h;
  }

  /** 每帧：跟手、跟挂点、推进抛物线。 */
  Update(dt) {
    for (const h of this.handles.values()) {
      if (h.holder) this.FollowHolder(h);
      else if (h.attach) this.FollowAttach(h);
      else if (h.toss) this.StepToss(h, dt);
    }
  }

  FollowHolder(h, force = false) {
    const actor = h.holder.actor, rig = actor?.characterRig;
    // 他的 clip 有这条轨：clip 的那一份在画，世界这一份藏起来（放手 / 丢出时取 clip 那一份的位置）。
    const clipItem = rig?.openingProps?.items?.get?.(h.name)?.object;
    if (clipItem?.visible) {
      clipItem.updateWorldMatrix(true, false);
      clipItem.matrixWorld.decompose(_P, _Q, _S);
      h.object.position.copy(_P); h.object.quaternion.copy(_Q); h.object.updateMatrixWorld(true);
      h.object.visible = force;
      return;
    }
    const bone = rig?.bones?.[h.holder.bone];
    if (!bone) { h.object.visible = false; return; }
    bone.updateWorldMatrix(true, false);
    bone.matrixWorld.decompose(_P, _Q, _S);
    h.object.position.copy(h.holder.offset).applyQuaternion(_Q).add(_P);
    h.object.quaternion.copy(_Q).multiply(h.holder.rot);
    h.object.scale.setScalar(1);
    h.object.updateMatrixWorld(true);
    h.object.visible = true;
  }

  FollowAttach(h) {
    const a = h.attach, target = a.target;
    if (!target?.parent) { h.object.visible = false; return; }
    target.updateWorldMatrix(true, false);
    target.matrixWorld.decompose(_P, _Q, _S);
    h.object.position.copy(a.offset).applyQuaternion(_Q).add(_P);
    h.object.quaternion.copy(_Q).multiply(a.rot);
    h.object.updateMatrixWorld(true);
    h.object.visible = target.visible !== false;
  }

  StepToss(h, dt) {
    const s = h.toss, o = h.object;
    s.t += dt;
    // 落地高度：静止朝向下最低点贴地（先按静止朝向量一次包围盒的半高）。
    if (s.restHalf == null) {
      o.quaternion.setFromEuler(new THREE.Euler(0, s.restYaw * DEG, 0, "YXZ")); o.position.set(0, 0, 0); o.updateMatrixWorld(true);
      _BOX.setFromObject(o); s.restHalf = _BOX.isEmpty() ? 0 : -_BOX.min.y; s.restQ = o.quaternion.clone();
    }
    const groundY = (x, z) => this.groundAt(x, z) + s.restHalf;
    const flightEnd = s.seconds;
    const hop = (k) => Math.sqrt(2 * s.bounceM * Math.pow(0.5, k) / 9.8) * 2;   // 第 k 下弹起到落回的时长
    let bounceEnd = flightEnd; for (let k = 0; k < s.bounces; k++) bounceEnd += hop(k);
    const end = bounceEnd + s.rollS;
    if (s.t <= flightEnd) {
      const u = s.t / flightEnd, y0 = s.start.y, y1 = groundY(s.land.x, s.land.z), peak = Math.max(y0, y1) + s.arcM;
      // 过 (0,y0) (1,y1)、顶点 peak 的二次曲线（简化：两段抛物线按峰值插值）。
      const yLin = y0 + (y1 - y0) * u, bump = 4 * u * (1 - u) * (peak - (y0 + y1) / 2);
      o.position.set(s.start.x + (s.land.x - s.start.x) * u, yLin + bump, s.start.z + (s.land.z - s.start.z) * u);
      o.quaternion.copy(s.q0).premultiply(_Q.setFromAxisAngle(s.spin, u * 9));
    } else if (s.t <= bounceEnd) {
      if (s.bounced === 0) { s.bounced = 1; s.onBounce?.(0); }
      let t = s.t - flightEnd, k = 0;
      while (k < s.bounces - 1 && t > hop(k)) { t -= hop(k); k++; if (s.bounced <= k) { s.bounced = k + 1; s.onBounce?.(k); } }
      const T = hop(k), hgt = 4 * s.bounceM * Math.pow(0.5, k) * (t / T) * (1 - t / T);
      o.position.set(s.land.x, groundY(s.land.x, s.land.z) + hgt, s.land.z);
      o.quaternion.slerpQuaternions(_Q2.copy(s.q0).premultiply(_Q.setFromAxisAngle(s.spin, 9)), s.restQ, Math.min(1, (s.t - flightEnd) / Math.max(1e-3, bounceEnd - flightEnd)));
    } else {
      if (s.bounced <= s.bounces && s.bounces > 0) { s.bounced = s.bounces + 1; s.onBounce?.(s.bounces); }
      const u = s.rollS > 0 ? Math.min(1, (s.t - bounceEnd) / s.rollS) : 1, ease = 1 - (1 - u) * (1 - u);
      const d = s.roll * ease, x = s.land.x + s.dir.x * d, z = s.land.z + s.dir.z * d;
      o.position.set(x, groundY(x, z), z);
      // 绕长轴（静止朝向的局部 Z）滚 d / 半径。
      o.quaternion.copy(s.restQ).multiply(_Q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -d / Math.max(0.01, s.restHalf)));
      if (s.t >= end) {
        h.toss = null; h.state = "world";
        h.at = { x: s.to.x, z: s.to.z, yawDeg: s.restYaw, pitchDeg: 0, rollDeg: 0, liftM: 0 };
        s.onRest?.();
      }
    }
    o.updateMatrixWorld(true);
  }

  Where(name) {
    const h = this.handles.get(name);
    if (!h) return { name, built: false, visible: false };
    const p = h.object.getWorldPosition(new THREE.Vector3());
    return { name, built: true, state: h.state, directed: h.directed, holder: h.holder ? (h.holder.who?.missionId || h.holder.who?.id || "actor") : null,
      visible: !!h.object.visible, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), missing: !!h.missing };
  }

  Stats() {
    let triangles = 0; const props = {};
    for (const h of this.handles.values()) { h.triangles = CountTriangles(h.object); triangles += h.triangles; props[h.name] = { state: h.state, visible: h.object.visible, triangles: h.triangles }; }
    return { triangles, props };
  }

  Dispose() {
    this.generation += 1;
    for (const h of this.handles.values()) { h.object.removeFromParent(); DisposeBuilt(h.owned); }
    this.handles.clear();
  }
}
