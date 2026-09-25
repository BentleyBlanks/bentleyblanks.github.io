import * as THREE from 'three';
import { MakePatch, ApplyPatches, PatchesOf } from './Script_MaterialPatches.mjs';
import { CloneShadedMaterial } from './Script_Materials.mjs';
import { FACE_BLOOD as C } from './Data_Tuning_CharacterSpeech.mjs';

// Blood on a face (CharacterFacial.SetFaceBlood): the captive comrade in SB03-SB04A.
// A procedural mask on private clones of the head materials, in a face frame taken
// from the baked Face_* bones at bind time (so it sticks to the skin as the head
// moves and the jaw opens). The mask reads the pre-skinning position: colour only,
// no vertex change, so the skinned motion vectors are untouched (Data_MotionVectorContract);
// no texture, so no sampler (Script_SamplerBudgetTest). Patch through
// Script_MaterialPatches like Script_CharacterWounds; both stack on one material, and
// a re-Prepare drops a face-blood patch a later clone carried along (never two copies).
// Only the face skin takes it: the one head surface that holds the lips (caps, collars
// and hair are other materials of the same body and stay untouched).
const F = value => Number(value).toFixed(4);
const V2 = pair => `vec2(${F(pair[0])},${F(pair[1])})`;
export const FACE_BLOOD_PATCH_KEY = 'face-blood-1';

function FaceBloodPatch(uniforms) {
  const runs = C.runX.map((x, i) =>
    `blood = max(blood, FaceBloodRun(q.xy, vec2(${F(C.cut[0] + x)},${F(C.cut[1])}), ${F(C.runWidth[i])}, ${F(C.runLength[i])}*grow, ${F(i * 1.7)}));`)
    .join('\n      ');
  return MakePatch({
    key: FACE_BLOOD_PATCH_KEY,
    uniforms: u => Object.assign(u, uniforms),
    vertex: [['#include <common>', 'varying vec3 vFaceBloodRest;'],
      ['#include <begin_vertex>', 'vFaceBloodRest = position;']],
    fragment: [['#include <common>', `
      varying vec3 vFaceBloodRest;
      uniform float uFaceBloodAmount;
      uniform vec3 uFaceBloodOrigin, uFaceBloodFresh, uFaceBloodDry;
      uniform mat3 uFaceBloodBasis;
      float FaceBloodHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float FaceBloodNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(FaceBloodHash(i), FaceBloodHash(i + vec2(1.0, 0.0)), f.x),
          mix(FaceBloodHash(i + vec2(0.0, 1.0)), FaceBloodHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      // One run of blood from 'top' straight down (face space), wobbling sideways,
      // thinning toward its tip, 'len' long.
      float FaceBloodRun(vec2 q, vec2 top, float width, float len, float seed) {
        float t = (top.y - q.y) / max(len, 1e-3);
        float x = top.x + ${F(C.runWobble[0])} * sin(q.y * ${F(C.runWobble[1])} + seed) + ${F(C.runWobble[2])} * sin(q.y * ${F(C.runWobble[3])} + seed * 3.0);
        float w = width * mix(1.0, 0.5, clamp(t, 0.0, 1.0)) * (0.8 + 0.4 * FaceBloodNoise(vec2(seed, q.y * 9.0)));
        float along = step(0.0, t) * (1.0 - smoothstep(0.82, 1.0, t)) * step(0.001, len);
        return (1.0 - smoothstep(w * 0.55, w, abs(q.x - x))) * along;
      }
      float FaceBloodBlob(vec2 q, vec2 centre, vec2 radius, float rough) {
        return 1.0 - smoothstep(0.7, 1.0, length((q - centre) / radius) + rough);
      }
    `], ['#include <color_fragment>', `
      float faceBlood = 0.0, faceBloodWet = 0.0, faceGrime = 0.0;
      if (uFaceBloodAmount > 0.001) {
        vec3 q = uFaceBloodBasis * (vFaceBloodRest - uFaceBloodOrigin);
        float amount = uFaceBloodAmount;
        float region = smoothstep(${F(C.frontFrom)}, ${F(C.frontTo)}, q.z)
          * (1.0 - smoothstep(${F(C.ovalEdge)}, 1.0, length(vec2(q.x / ${F(C.ovalRadius[0])}, (q.y - ${F(C.ovalCentreY)}) / ${F(C.ovalRadius[1])}))))
          * (1.0 - smoothstep(${F(C.topFrom)}, ${F(C.topTo)}, q.y));
        float grain = FaceBloodNoise(q.xy * ${F(C.grainScale)}), speck = FaceBloodNoise(q.xy * ${F(C.speckScale)} + 4.0);
        float grow = smoothstep(0.05, 1.0, amount);
        float blood = FaceBloodBlob(q.xy, ${V2(C.cut)}, ${V2(C.cutSize)}, 0.35 * grain) * smoothstep(0.0, 0.15, amount);
      ${runs}
        blood = max(blood, FaceBloodBlob(q.xy, ${V2(C.smear)}, ${V2(C.smearSize)} * (0.6 + 0.4 * amount), ${F(C.smearRough[0])} * grain + ${F(C.smearRough[1])} * speck)
          * smoothstep(0.3, 0.8, amount) * 0.85);
        blood = max(blood, FaceBloodRun(q.xy, ${V2(C.nose)}, ${F(C.noseWidth)}, ${F(C.noseLength)} * smoothstep(0.35, 1.0, amount), 9.1));
        faceBlood = clamp(blood, 0.0, 1.0) * region * ${F(C.opacity)};
        faceBloodWet = faceBlood * smoothstep(0.55, 0.95, blood) * ${F(C.wetShare)};
        faceGrime = region * amount * ${F(C.grime)} * (0.5 + 0.5 * grain);
        diffuseColor.rgb *= 1.0 - faceGrime;
        vec3 faceBloodTint = mix(uFaceBloodDry, uFaceBloodFresh, faceBloodWet / max(faceBlood, 1e-3));
        diffuseColor.rgb = mix(diffuseColor.rgb, faceBloodTint * (${F(C.tintBase)} + diffuseColor.rgb * ${F(C.tintSkin)}), faceBlood);
      }
    `], ['#include <roughnessmap_fragment>', `
      roughnessFactor = mix(roughnessFactor, mix(${F(C.dryRoughness)}, ${F(C.wetRoughness)}, faceBloodWet / max(faceBlood, 1e-3)), faceBlood);
    `], ['#include <metalnessmap_fragment>', 'metalnessFactor *= 1.0 - faceBlood;']],
  });
}

const _m = new THREE.Matrix4(), _bind = new THREE.Matrix4(), _v = new THREE.Vector3();

/** Face frame in one skinned mesh's geometry space, from the Face_* bones at bind time. */
export function FaceBloodFrame(mesh, eyeL = 'Face_EyeL', eyeR = 'Face_EyeR', lip = 'Face_LipUpper') {
  const bones = mesh.skeleton?.bones || [];
  // Bind space is bindMatrix * position. Not mesh.bindMatrixInverse: in the attached bind mode
  // three rewrites that every frame from the mesh's current matrixWorld (actor placement and scale).
  _bind.copy(mesh.bindMatrix).invert();
  const Bind = name => {
    const index = bones.findIndex(bone => bone.name === name);
    if (index < 0) return null;
    _m.copy(mesh.skeleton.boneInverses[index]).invert();
    return new THREE.Vector3().setFromMatrixPosition(_m).applyMatrix4(_bind);
  };
  const left = Bind(eyeL), right = Bind(eyeR), mouth = Bind(lip);
  const headName = bones.find(bone => bone.name === eyeL)?.parent?.name, head = headName ? Bind(headName) : null;
  if (!left || !right || !mouth || !head) return null;
  const origin = left.clone().add(right).multiplyScalar(.5), eyeDistance = left.distanceTo(right);
  if (!(eyeDistance > 1e-6)) return null;
  const x = right.clone().sub(left).normalize();
  const y = origin.clone().sub(mouth); y.addScaledVector(x, -y.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  if (origin.clone().sub(head).dot(z) < 0) z.negate();
  const s = 1 / eyeDistance;
  const basis = new THREE.Matrix3().set(x.x * s, x.y * s, x.z * s, y.x * s, y.y * s, y.z * s, z.x * s, z.y * s, z.z * s);
  return { origin, basis, eyeDistance, mouth };
}

/** Vertices of a mesh inside the face oval of a frame (JS twin of the shader's region). */
export function FaceBloodRegionCount(mesh, frame) {
  const position = mesh.geometry?.attributes?.position;
  if (!position) return 0;
  let count = 0;
  const [rx, ry] = C.ovalRadius;
  for (let i = 0; i < position.count; i++) {
    _v.fromBufferAttribute(position, i).sub(frame.origin).applyMatrix3(frame.basis);
    if (_v.z < C.frontTo || _v.y > C.topFrom) continue;
    if (Math.hypot(_v.x / rx, (_v.y - C.ovalCentreY) / ry) < C.ovalEdge) count++;
  }
  return count;
}

/** Closest vertex of a mesh to the upper-lip bone at bind time, in eye distances (Infinity: none). */
export function FaceBloodLipDistance(mesh, frame) {
  const position = mesh.geometry?.attributes?.position;
  if (!position || !frame.mouth) return Infinity;
  let best = Infinity;
  for (let i = 0; i < position.count; i++) best = Math.min(best, _v.fromBufferAttribute(position, i).distanceToSquared(frame.mouth));
  return Math.sqrt(best) / frame.eyeDistance;
}

/** Drop a face-blood patch another clone carried along (CloneShadedMaterial copies the patch list). */
function WithoutFaceBlood(material) {
  return (PatchesOf(material) || []).filter(patch => patch.key !== FACE_BLOOD_PATCH_KEY);
}

export class CharacterFaceBlood {
  constructor(root) {
    this.root = root; this.amount = 0; this.records = []; this.installed = false;
    this.amountUniform = { value: 0 };
  }

  /** Clone and patch the head materials now (amount stays 0) so the program links before it is needed. */
  Prepare() {
    if (this.installed) return this.records.length > 0;
    this.installed = true;
    const candidates = [];
    this.root?.traverse(mesh => {
      if (!mesh.isSkinnedMesh || Array.isArray(mesh.material)) return;
      const name = mesh.material?.name || '';
      if (name === 'Material_FacialOral' || /eye/i.test(name)) return;
      const frame = FaceBloodFrame(mesh);
      if (!frame || FaceBloodRegionCount(mesh, frame) < C.minFaceVertices) return;
      candidates.push({ mesh, frame, lip: FaceBloodLipDistance(mesh, frame) });
    });
    // The face skin is the surface the lips are part of: the nearest one to Face_LipUpper
    // (a cap brim or a collar can reach into the face oval, but never onto the lip).
    const nearest = Math.min(...candidates.map(c => c.lip));
    const skins = candidates.filter(c => c.lip <= C.skinLipReach && c.lip <= nearest + 1e-6);
    for (const { mesh, frame } of skins) {
      const uniforms = {
        uFaceBloodAmount: this.amountUniform,
        uFaceBloodOrigin: { value: frame.origin }, uFaceBloodBasis: { value: frame.basis },
        uFaceBloodFresh: { value: new THREE.Color(C.fresh) }, uFaceBloodDry: { value: new THREE.Color(C.dry) },
      };
      const original = mesh.material, material = CloneShadedMaterial(original);
      ApplyPatches(material, [...WithoutFaceBlood(material), FaceBloodPatch(uniforms)]);
      mesh.material = material;
      this.records.push({ mesh, original, material, frame });
    }
    return this.records.length > 0;
  }

  /** amount 0-1: 0 hides it (the private materials stay, so turning it back on never relinks). */
  Set(amount) {
    const value = Math.min(1, Math.max(0, Number(amount) || 0));
    if (value > 0 && !this.installed) this.Prepare();
    this.amount = value; this.amountUniform.value = value;
    return this.records.length > 0;
  }

  /**
   * Put the original materials back. A material cloned from ours afterwards (a cloth wound)
   * keeps our patch, but its amount uniform goes to 0 here, so it shows nothing; a later
   * Prepare swaps that patch out instead of adding a second one.
   */
  Dispose() {
    for (const record of this.records) {
      if (record.mesh.material === record.material) record.mesh.material = record.original;
      record.material.dispose();
    }
    this.records.length = 0; this.installed = false; this.amount = 0; this.amountUniform.value = 0;
  }
}
