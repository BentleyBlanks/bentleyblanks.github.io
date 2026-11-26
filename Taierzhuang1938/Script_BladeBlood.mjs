// Realistic blade blood stain shader patch, 3D swelling hanging droplets, gravity dripping,
// ground blood-drop decals, and centrifugal swing blood-fling for first-person melee blades & bayonets.
//
// Rendering contracts respected:
//   - Material injection goes strictly through Script_MaterialPatches (preservesPosition: true).
//   - Only ONE packed RGBA sampler2D (uBladeBloodMap) is added; DadaoPbr disables shared wall
//     detail normal so ultra|gi=1 stays <= 15/16 active fragment samplers (Script_SamplerBudgetTest).
//   - Cloned private materials are cached per (sourceMaterial, slotKey) so weapon switching never
//     leaks owned clones inside FirstPersonSelfShadow or triggers shader recompilation.
//   - Pendant droplets sit under viewmodel.root (inheriting foreground prepass & zero motion-vector
//     velocity, never casting world shadows, and always hanging straight along world -Y).

import * as THREE from "three";
import { ManagedTextureLoader } from "./Script_TextureImports.mjs";
import { MakePatch, ApplyPatches, PatchesOf } from "./Script_MaterialPatches.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { Mulberry32, HashString, Clamp, Clamp01, Mix } from "./Script_Noise.mjs";
import {
  BLADE_BLOOD_TEXTURE, BLADE_BLOOD_COLORS as C, BLADE_BLOOD_SURFACE as S,
  BLADE_BLOOD_DYNAMICS as D, BLADE_PROFILES as P,
} from "./Data_Tuning_BladeBlood.mjs";
import {
  BladeBloodModel, ResolveBladeProfileKey, BladeStateKey, SelectLowestDripIndices,
} from "./Script_BladeBloodModel.mjs";

export const BLADE_BLOOD_PATCH_KEY = "blade-blood-1";

const F = (value) => Number(value).toFixed(4);

// Shared lazy-loaded RGBA detail texture (linear NoColorSpace).
let sharedBloodTexture = null;
let sharedFallbackTexture = null;
const textureListeners = new Set();

function FallbackBloodTexture() {
  if (!sharedFallbackTexture) {
    sharedFallbackTexture = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType,
    );
    sharedFallbackTexture.name = "BladeBloodFallbackEmpty";
    sharedFallbackTexture.colorSpace = THREE.NoColorSpace;
    sharedFallbackTexture.needsUpdate = true;
  }
  return sharedFallbackTexture;
}

function AcquireBloodTexture(onReady) {
  if (sharedBloodTexture) {
    onReady?.(sharedBloodTexture);
    return sharedBloodTexture;
  }
  if (onReady) textureListeners.add(onReady);
  if (textureListeners.size === 1) {
    const url = new URL(BLADE_BLOOD_TEXTURE, import.meta.url).href;
    new ManagedTextureLoader().load(url, (tex) => {
      tex.name = "BladeBloodDetail";
      tex.colorSpace = THREE.NoColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      sharedBloodTexture = tex;
      for (const listener of textureListeners) listener(tex);
      textureListeners.clear();
    }, undefined, () => {
      console.warn("[BladeBlood] Texture_BladeBloodDetail.webp unavailable; keeping fallback");
      textureListeners.clear();
    });
  }
  return FallbackBloodTexture();
}

/**
 * Create a Script_MaterialPatches shader patch rendering physically shaded blood film,
 * bevel pooling, arterial spatter, gravity-driven rivulets, meniscus normal bump, and
 * wet-to-dry PBR roughness/metalness transitions directly onto a blade's MeshStandardMaterial.
 */
export function MakeBladeBloodPatch(uniforms) {
  return MakePatch({
    key: BLADE_BLOOD_PATCH_KEY,
    preservesPosition: true,
    uniforms: (shaderUniforms) => {
      Object.assign(shaderUniforms, uniforms);
    },
    vertex: [
      ["#include <common>", /* glsl */`
        varying vec3 vBladeBloodLocal;
        varying vec3 vBladeBloodNrm;`],
      ["#include <begin_vertex>", /* glsl */`
        vBladeBloodLocal = position;
        vBladeBloodNrm = objectNormal;`],
    ],
    fragment: [
      ["#include <common>", /* glsl */`
        uniform sampler2D uBladeBloodMap;
        uniform vec4 uBladeBloodState;     // x=coverage, y=edge, z=spatter, w=wetness
        uniform vec4 uBladeBloodExtra;     // x=thickness, y=lengthReach, z=flowOffset, w=sideBias
        uniform vec4 uBladeBloodGeom;      // x=zTip, y=zGuard, z=zGuardSpatterEnd, w=modeSign (+1/-1 slash, +2/-2 stab)
        uniform vec4 uBladeBloodEdgeY;     // 4 contour Y points along cutting edge (tip -> heel)
        uniform vec4 uBladeBloodSpineY;    // 4 contour Y points along thick spine (tip -> heel)
        uniform vec3 uBladeGravityLocal;   // world (0,-1,0) expressed in mesh local space
        uniform vec3 uBladeBloodFresh;
        uniform vec3 uBladeBloodArterial;
        uniform vec3 uBladeBloodDeep;
        uniform vec3 uBladeBloodDry;
        varying vec3 vBladeBloodLocal;
        varying vec3 vBladeBloodNrm;
        float gBladeBloodMask = 0.0;
        float gBladeBloodHeight = 0.0;
        float gBladeBloodWet = 0.0;

        float BladeBloodCurve4(vec4 c, float t) {
          float u = clamp(t, 0.0, 1.0);
          if (u < 0.28) return mix(c.x, c.y, u / 0.28);
          if (u < 0.65) return mix(c.y, c.z, (u - 0.28) / 0.37);
          return mix(c.z, c.w, (u - 0.65) / 0.35);
        }`],
      ["#include <color_fragment>", /* glsl */`
        gBladeBloodMask = 0.0;
        gBladeBloodHeight = 0.0;
        gBladeBloodWet = uBladeBloodState.w;
        {
          float bbSum = uBladeBloodState.x + uBladeBloodState.y + uBladeBloodState.z;
          if (bbSum > 0.001) {
            float bbZTip = uBladeBloodGeom.x;
            float bbZGuard = uBladeBloodGeom.y;
            float bbZGuardEnd = uBladeBloodGeom.z;
            float bbSpan = max(bbZGuard - bbZTip, 0.05);
            float bbAlongRaw = (vBladeBloodLocal.z - bbZTip) / bbSpan;
            float bbAlong = clamp(bbAlongRaw, 0.0, 1.0);
            float bbModeAbs = abs(uBladeBloodGeom.w);
            bool bbStab = bbModeAbs > 1.5;
            float bbEdgeSign = uBladeBloodGeom.w >= 0.0 ? 1.0 : -1.0;

            float bbYEdge = BladeBloodCurve4(uBladeBloodEdgeY, bbAlong);
            float bbYSpine = BladeBloodCurve4(uBladeBloodSpineY, bbAlong);
            float bbWidthSpan = bbYSpine - bbYEdge;
            float bbAcross = abs(bbWidthSpan) > 1e-4
              ? clamp((vBladeBloodLocal.y - bbYEdge) / bbWidthSpan, 0.0, 1.0)
              : 0.5;

            // Differentiate both blade faces so stains & droplets never mirror identically.
            float bbSide = vBladeBloodNrm.x >= 0.0 ? 1.0 : -1.0;
            float bbSideOff = bbSide > 0.0 ? 0.0 : 0.43;
            float bbSideGain = clamp(1.0 + bbSide * uBladeBloodExtra.w * 0.28, 0.78, 1.22);

            float bbCov = uBladeBloodState.x * bbSideGain;
            float bbEdge = uBladeBloodState.y * bbSideGain;
            float bbSpat = uBladeBloodState.z * bbSideGain;
            float bbWet = uBladeBloodState.w;
            float bbThickParam = uBladeBloodExtra.x;
            float bbReach = clamp(uBladeBloodExtra.y, 0.08, 1.0);
            float bbFlow = uBladeBloodExtra.z;

            // Keep blood strictly on blade steel (never staining leather/wood handle or pommel ring).
            float bbOnBlade = 1.0 - smoothstep(0.97, 1.03, bbAlongRaw);
            float bbOnGuard = smoothstep(0.96, 1.02, bbAlongRaw)
              * (1.0 - smoothstep(bbZGuardEnd - 0.02, bbZGuardEnd + 0.01, vBladeBloodLocal.z));

            // Fine arterial spatter (G channel, seamlessly tileable XY).
            vec2 bbSpatUv = fract(vec2(bbAlong * 1.95 + bbSideOff, bbAcross * 1.15 + 0.13));
            float bbSpatTex = texture2D(uBladeBloodMap, bbSpatUv).g;
            vec2 bbSpatUv2 = fract(vec2(bbAlong * 3.40 + 0.27 - bbSideOff, bbAcross * 2.10 + 0.61));
            float bbSpatFine = texture2D(uBladeBloodMap, bbSpatUv2).g;
            float bbOrganicJitter = (bbSpatTex - 0.5) * 0.14;

            float bbReachMask = 1.0 - smoothstep(max(0.05, bbReach - 0.22), min(1.04, bbReach + 0.08), bbAlong + bbOrganicJitter);

            // Primary smear & wipe layer (R coverage, B meniscus liquid thickness).
            vec2 bbSmearUv;
            if (bbStab) {
              // Bayonet: blood runs back from the tip along axial withdrawal striations.
              float bbAxialV = clamp((bbAlong + bbOrganicJitter * 0.5) / max(0.22, bbReach), 0.0, 0.995);
              bbSmearUv = vec2(bbAcross * 0.85 + bbSideOff + 0.12 * bbAlong, bbAxialV);
            } else {
              // Dadao / Sword: dense coat hugs the sharp cutting edge (across=0) & front belly,
              // pulling diagonal wiped striations up across the steel flat as coverage rises.
              float bbSpread = mix(0.48, 1.08, clamp(bbCov, 0.0, 1.0));
              float bbDiagU = bbAlong * 1.15 + bbAcross * 0.22 * (bbSide > 0.0 ? 1.0 : -1.0) + bbSideOff;
              float bbWipeV = clamp(bbAcross / max(0.22, bbSpread), 0.0, 0.995);
              bbSmearUv = vec2(bbDiagU, bbWipeV);
            }
            vec4 bbTex = texture2D(uBladeBloodMap, bbSmearUv);
            float bbSmearCov = bbTex.r * bbReachMask * smoothstep(0.02, 0.32, bbCov);
            float bbSmearThick = bbTex.b * bbReachMask * bbThickParam;

            // Concentrated bevel & tip pooling (blood wets & beads tightly along sharp edge and tip).
            float bbEdgeBand = bbStab
              ? (1.0 - smoothstep(0.04, 0.38 * bbReach, bbAlong + bbOrganicJitter * 0.6))
              : (1.0 - smoothstep(0.02, mix(0.18, 0.38, bbEdge), bbAcross + bbOrganicJitter * 0.45));
            float bbTipBand = 1.0 - smoothstep(0.02, 0.24, bbAlong + bbOrganicJitter * 0.35);
            float bbBevelPool = max(bbEdgeBand * bbEdge, bbTipBand * bbEdge * 0.92)
              * bbReachMask * (0.52 + 0.48 * bbTex.r);

            // Gravity-driven rivulet runs (A channel): creep slowly along world -Y projected onto blade.
            vec2 bbGravPlane = vec2(uBladeGravityLocal.z, uBladeGravityLocal.y * bbEdgeSign);
            float bbGravLen = length(bbGravPlane);
            vec2 bbGDir = bbGravLen > 1e-3 ? bbGravPlane / bbGravLen : vec2(0.0, -1.0);
            vec2 bbGPerp = vec2(-bbGDir.y, bbGDir.x);
            // Local metric coords along Z (length) and Y (width) normalized to ~0.28 m patch scale.
            vec2 bbBladeM = vec2((vBladeBloodLocal.z - bbZTip) * 3.4, (vBladeBloodLocal.y - bbYEdge) * bbEdgeSign * 5.2);
            float bbRivPerp = dot(bbBladeM, bbGPerp) * 0.55 + bbSideOff * 0.6;
            float bbRivDown = dot(bbBladeM, bbGDir) * 0.48 + 0.52;
            // Source edge of Rivulets texture sits at uv.y = 1.0; teardrop tips run toward uv.y = 0.0.
            // Shifting uv.y upward by +bbFlow visibly advances teardrop tips along +bbGDir (gravity!).
            float bbRivV = clamp(1.0 - bbRivDown + bbFlow * 0.92, 0.01, 0.99);
            float bbRivTex = texture2D(uBladeBloodMap, vec2(bbRivPerp, bbRivV)).a;
            float bbRivReach = 1.0 - smoothstep(max(0.12, bbReach - 0.16), min(1.05, bbReach + 0.22), bbAlong);
            float bbRivMask = bbRivTex * bbRivReach * smoothstep(0.10, 0.58, bbCov) * (0.60 + 0.40 * bbWet);

            // Arterial spatter across clean upper blade flat + fine droplets on guard when heavily soaked.
            float bbFlatSpatMask = (bbSpatTex * 0.92 + bbSpatFine * 0.56) * bbSpat
              * (1.0 - smoothstep(0.28, 1.06, bbAlong - 0.14))
              * (bbStab ? (1.0 - smoothstep(bbReach * 0.72, min(1.05, bbReach + 0.35), bbAlong)) : 1.0);
            float bbGuardSpat = bbOnGuard * bbSpatFine
              * smoothstep(${F(S.guardSpatterThreshold)}, 1.0, bbSpat) * ${F(S.guardSpatterMax)};

            // Combine all blade liquid layers with crisp liquid meniscus edge (not blurry red fog).
            float bbRaw = max(max(bbSmearCov * 1.16, bbBevelPool * 1.18), max(bbRivMask * 1.12, bbFlatSpatMask * 1.12));
            float bbBladeAlpha = smoothstep(0.13, 0.45, bbRaw) * bbOnBlade;
            float bbGuardAlpha = smoothstep(0.20, 0.54, bbGuardSpat);
            float bbAlpha = clamp(max(bbBladeAlpha, bbGuardAlpha), 0.0, 1.0);

            if (bbAlpha > 0.002) {
              // Liquid film optical thickness drives both Beer-Lambert darkening and meniscus height.
              float bbFilmThick = clamp(
                max(bbSmearThick, max(bbBevelPool * 0.90, bbRivMask * 0.88)) * (0.68 + 0.32 * bbThickParam)
                + bbFlatSpatMask * 0.34,
                0.0, 1.0);
              gBladeBloodMask = bbAlpha;
              gBladeBloodHeight = bbFilmThick * bbAlpha;

              // Beer-Lambert color curve: thin wet glaze glows translucent arterial crimson over steel,
              // thick pooled beads & clots deepen toward rich venous burgundy, dried blood oxidizes dark maroon.
              float bbDepth = 1.0 - exp(-bbFilmThick * ${F(S.beerLambertDepth)});
              vec3 bbFreshCol = mix(uBladeBloodArterial, uBladeBloodFresh, smoothstep(0.10, 0.58, bbDepth));
              bbFreshCol = mix(bbFreshCol, uBladeBloodDeep, smoothstep(0.62, 0.98, bbDepth));
              vec3 bbFinalCol = mix(uBladeBloodDry, bbFreshCol, clamp(bbWet, 0.0, 1.0));

              // Thin translucent blood glaze blends with underlying steel rather than crushing shadowed metal to black.
              float bbOpacity = bbAlpha * mix(0.80, 0.99, smoothstep(0.08, 0.55, bbFilmThick));
              vec3 bbGlazeCol = mix(diffuseColor.rgb * 0.42, bbFinalCol, 0.76);
              diffuseColor.rgb = mix(diffuseColor.rgb, mix(bbGlazeCol, bbFinalCol, smoothstep(0.10, 0.52, bbFilmThick)), bbOpacity);
            }
          }
        }`],
      ["#include <roughnessmap_fragment>", /* glsl */`
        if (gBladeBloodMask > 0.002) {
          // Fresh blood gleams like glossy liquid (roughness ~0.060); dried clots warm to matte-satin (~0.62).
          float bbRoughTarget = mix(${F(S.dryRoughness)}, ${F(S.wetRoughness)}, clamp(gBladeBloodWet, 0.0, 1.0));
          // Thin semi-dry edges are slightly rougher than thick wet pooled beads.
          bbRoughTarget = mix(bbRoughTarget + 0.08, bbRoughTarget, smoothstep(0.15, 0.68, gBladeBloodHeight));
          roughnessFactor = mix(roughnessFactor, bbRoughTarget, gBladeBloodMask);
        }`],
      ["#include <metalnessmap_fragment>", /* glsl */`
        if (gBladeBloodMask > 0.002) {
          // Real optics on polished steel: thin wet translucent blood film transmits a ruby-tinted
          // metallic sheen from the steel underneath; thick pooled liquid and dried opaque clots
          // behave as full dielectrics (metalness -> ~0.06).
          float bbOpaqueFilm = smoothstep(0.18, 0.85, gBladeBloodHeight) * 0.55 + (1.0 - clamp(gBladeBloodWet, 0.0, 1.0)) * 0.45;
          float bbDielectric = gBladeBloodMask * mix(0.54, ${F(S.metalSuppress)}, clamp(bbOpaqueFilm, 0.0, 1.0));
          metalnessFactor *= 1.0 - bbDielectric;
        }`],
      ["#include <normal_fragment_maps>", /* glsl */`
        {
          // Compute screen-space meniscus height derivatives outside dynamic branches (GLSL ES 3.00 rule).
          float bbDhx = dFdx(gBladeBloodHeight);
          float bbDhy = dFdy(gBladeBloodHeight);
          vec3 bbPosV = -vViewPosition;
          vec3 bbDpx = dFdx(bbPosV);
          vec3 bbDpy = dFdy(bbPosV);
          if (gBladeBloodMask > 0.02 && (abs(bbDhx) + abs(bbDhy)) > 1e-5) {
            vec3 bbR1 = cross(bbDpy, normal);
            vec3 bbR2 = cross(normal, bbDpx);
            float bbDet = dot(bbDpx, bbR1);
            if (abs(bbDet) > 1e-12) {
              vec3 bbSurfGrad = (bbR1 * bbDhx + bbR2 * bbDhy) * (sign(bbDet) / max(abs(bbDet), 1e-7));
              // Scale gently so raised wet beads and rivulet ridges catch crisp specular glints without aliasing.
              float bbWetLift = ${F(S.meniscusBump)} * mix(0.45, 1.0, clamp(gBladeBloodWet, 0.0, 1.0));
              float bbTilt = clamp(length(bbSurfGrad) * 0.0022 * bbWetLift, 0.0, 0.34);
              if (bbTilt > 1e-4) {
                normal = normalize(normal - normalize(bbSurfGrad) * bbTilt);
              }
            }
          }
        }`],
    ],
  });
}

/**
 * Build a sculpted 3D pendant blood teardrop geometry:
 * Origin (0, 0, 0) = attachment neck on the steel blade edge;
 * hangs along local -Y down to y = -2.2 with a pinched liquid neck and heavy rounded bottom bulb.
 */
function BuildPendantDropGeometry() {
  const geo = new THREE.SphereGeometry(1, 14, 12);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // Remap y from [-1, +1] -> t in [0 (wet attachment fillet), 1 (bulb bottom)]
    const t = (1 - y) * 0.5;
    // Slight flaring fillet at t=0..0.12 tucked +0.24 into steel rim, pinching into a slender liquid
    // neck near t=0.28 and swelling smoothly to a natural glossy teardrop bulb at t=0.68..1.0.
    const fillet = Math.max(0, 1 - t / 0.16) * 0.20;
    const neckPinch = 0.22 + 0.78 * Math.pow(Math.sin(Math.min(1, t * 1.12) * Math.PI * 0.5), 1.45);
    const bulb = t > 0.48 ? 1.0 + 0.10 * Math.sin((t - 0.48) / 0.52 * Math.PI) : 1.0;
    const radial = (neckPinch + fillet) * bulb;
    pos.setXYZ(i, x * radial, 0.24 - t * 2.38, z * radial);
  }
  geo.computeVertexNormals();
  return geo;
}

const _tmpV0 = new THREE.Vector3();
const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();
const _tmpCam = new THREE.Vector3();
const _tmpDownLocal = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpInvMat = new THREE.Matrix4();
const _tmpMat3 = new THREE.Matrix3();
const _worldDown = new THREE.Vector3(0, -1, 0);
const _localDownAxis = new THREE.Vector3(0, -1, 0);
const _dripVel = new THREE.Vector3();
const _dripPos = new THREE.Vector3();
const _flingDir = new THREE.Vector3();
const _freshDropColor = new THREE.Color(C.dropFresh).toArray();
const _arterialDropColor = new THREE.Color(C.dropArterial).toArray();

/**
 * First-person blade blood renderer + 3D dripping/swing-fling controller.
 * Owned by Viewmodel; bridges pure BladeBloodModel with Three.js blade materials & BloodEffects.
 */
export class BladeBloodController {
  constructor(viewmodel, library, { seed = "Taierzhuang.BladeBlood" } = {}) {
    this.viewmodel = viewmodel;
    this.library = library;
    this.model = new BladeBloodModel();
    this.random = Mulberry32(HashString(seed));
    this.vfx = null;
    this.disposed = false;

    // One shared uniform pack for the currently active blade slot (updated every frame in-place).
    this.uniforms = {
      uBladeBloodMap: { value: FallbackBloodTexture() },
      uBladeBloodState: { value: new THREE.Vector4(0, 0, 0, 0) },
      uBladeBloodExtra: { value: new THREE.Vector4(0, 0, 0, 0) },
      uBladeBloodGeom: { value: new THREE.Vector4(-0.63, -0.095, -0.015, 1) },
      uBladeBloodEdgeY: { value: new THREE.Vector4(0.018, 0.056, 0.073, 0.064) },
      uBladeBloodSpineY: { value: new THREE.Vector4(-0.022, -0.042, -0.008, -0.007) },
      uBladeGravityLocal: { value: new THREE.Vector3(0, -1, 0) },
      uBladeBloodFresh: { value: new THREE.Color(C.fresh) },
      uBladeBloodArterial: { value: new THREE.Color(C.arterial) },
      uBladeBloodDeep: { value: new THREE.Color(C.deepPool) },
      uBladeBloodDry: { value: new THREE.Color(C.dry) },
    };
    this.patch = MakeBladeBloodPatch(this.uniforms);
    this.textureReady = false;
    AcquireBloodTexture((tex) => {
      if (this.disposed) return;
      this.uniforms.uBladeBloodMap.value = tex;
      this.textureReady = true;
    });

    // Cache one patched material per source material so weapon switching never leaks materials
    // or forces FirstPersonSelfShadow to link duplicate programs.
    this.patchedBySource = new Map();
    this.active = null; // { stateKey, profileKey, bladeMeshes, anchorMesh, isBayonet }

    // Kinematics for swing blood-fling & jolt detachment.
    this.prevTipWorld = new THREE.Vector3();
    this.hasPrevTip = false;
    this.tipVelocity = new THREE.Vector3();
    this.tipSpeedMps = 0;

    // 3D glossy swelling pendant droplets hanging from the lowest bloody edge points.
    this.pendantGroup = new THREE.Group();
    this.pendantGroup.name = "VmBladeBloodPendants";
    this.pendantGeo = BuildPendantDropGeometry();
    this.pendantMaterial = library?.Plain
      ? library.Plain("VmBladeBloodPendantDrop", {
        color: C.dropFresh,
        roughness: 0.035,
        metalness: 0.08,
        envMapIntensity: 2.6,
      })
      : new THREE.MeshStandardMaterial({
        name: "VmBladeBloodPendantDrop",
        color: C.dropFresh,
        roughness: 0.035,
        metalness: 0.08,
      });
    this.pendantMeshes = [];
    for (let i = 0; i < D.pendantCount; i += 1) {
      const mesh = new THREE.Mesh(this.pendantGeo, this.pendantMaterial);
      mesh.name = `VmBladeBloodPendant_${i}`;
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.pendantGroup.add(mesh);
      this.pendantMeshes.push(mesh);
    }
    this.viewmodel.root.add(this.pendantGroup);
  }

  /** Connect world VFX system so detached drops & flung arcs fall through world space and stain the ground. */
  SetVfx(vfx) {
    this.vfx = vfx || null;
  }

  _Range(a, b) {
    return a + (b - a) * this.random();
  }

  _PatchedMaterial(source) {
    if (!source || !source.isMeshStandardMaterial) return source;
    const existing = this.patchedBySource.get(source);
    if (existing) return existing;
    const clone = CloneShadedMaterial(source);
    clone.name = `${source.name || "Blade"}_Blood`;
    const basePatches = (PatchesOf(clone) || []).filter((p) => p.key !== BLADE_BLOOD_PATCH_KEY);
    ApplyPatches(clone, [...basePatches, this.patch]);
    this.patchedBySource.set(source, clone);
    return clone;
  }

  /**
   * Bind the currently equipped Viewmodel weapon rig (Dadao, OfficerSword, or Rifle+Bayonet).
   * Safe to call on every Equip() and SetBayonetFixed().
   */
  Attach(weaponId, rig, { bayonetFixed = false } = {}) {
    this.active = null;
    this.hasPrevTip = false;
    this.tipSpeedMps = 0;
    this.tipVelocity.set(0, 0, 0);
    for (const m of this.pendantMeshes) m.visible = false;

    if (!weaponId || !rig?.group) {
      this._SyncShader(null, null);
      return null;
    }

    const isMeleeBlade = weaponId === "Dadao" || weaponId === "OfficerSwordSet";
    const hasBayonet = !isMeleeBlade && !!rig.parts?.bayonet;
    if (!isMeleeBlade && !hasBayonet) {
      this._SyncShader(null, null);
      return null;
    }

    const procedural = rig.source !== "model";
    const profileKey = ResolveBladeProfileKey(weaponId, { bayonet: hasBayonet, procedural });
    const stateKey = BladeStateKey(weaponId, { bayonet: hasBayonet });
    if (!profileKey || !stateKey) {
      this._SyncShader(null, null);
      return null;
    }

    const handR = this.viewmodel.handRight?.group || null;
    const handL = this.viewmodel.handLeft?.group || null;
    const IsExcludedNode = (node) => {
      for (let cur = node; cur; cur = cur.parent) {
        if (cur === handR || cur === handL) return true;
      }
      return Boolean(node.name?.startsWith("Hand") || node.name?.startsWith("Sleeve"));
    };

    const bladeMeshes = [];
    if (isMeleeBlade) {
      rig.group.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        if (IsExcludedNode(node)) return;
        // Skip procedural grip/red-cloth meshes on fallback Dadao; patch DadaoPbr or blade steel mesh.
        const matName = String(node.material.name || "");
        if (procedural && (matName.includes("Grip") || matName.includes("RedCloth"))) return;
        const patched = this._PatchedMaterial(node.material);
        if (patched !== node.material) node.material = patched;
        bladeMeshes.push(node);
      });
    } else if (hasBayonet) {
      rig.parts.bayonet.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        // Skip wooden bayonet grip scales; only stain steel blade geometry.
        if (node.material === this.viewmodel.materials?.wood || /wood/i.test(node.material.name || "")) return;
        const patched = this._PatchedMaterial(node.material);
        if (patched !== node.material) node.material = patched;
        bladeMeshes.push(node);
      });
    }

    if (!bladeMeshes.length) {
      this._SyncShader(null, null);
      return null;
    }

    this.active = {
      weaponId,
      stateKey,
      profileKey,
      bladeMeshes,
      anchorMesh: bladeMeshes[0],
      isBayonet: hasBayonet,
      bayonetVisible: hasBayonet ? !!bayonetFixed : true,
    };
    this._ApplyProfileUniforms(profileKey);
    this._SyncShader(stateKey, profileKey);
    return this.active;
  }

  /** Sync bayonet visibility toggle without rebuilding the whole rig. */
  SetBayonetFixed(fixed) {
    if (this.active?.isBayonet) {
      this.active.bayonetVisible = !!fixed;
      if (!fixed) {
        for (const m of this.pendantMeshes) m.visible = false;
        this.hasPrevTip = false;
      }
    }
  }

  _ApplyProfileUniforms(profileKey) {
    const prof = P[profileKey] || P.Dadao;
    const modeCode = prof.mode === "stab" ? 2.0 : 1.0;
    this.uniforms.uBladeBloodGeom.value.set(
      prof.zTip,
      prof.zGuard,
      prof.zGuardSpatterEnd ?? (prof.zGuard + 0.05),
      modeCode * (prof.edgeSign >= 0 ? 1 : -1),
    );
    this.uniforms.uBladeBloodEdgeY.value.fromArray(prof.edgeYCurve);
    this.uniforms.uBladeBloodSpineY.value.fromArray(prof.spineYCurve);
  }

  _SyncShader(stateKey, profileKey) {
    if (!stateKey || !profileKey) {
      this.uniforms.uBladeBloodState.value.set(0, 0, 0, 0);
      this.uniforms.uBladeBloodExtra.value.set(0, 0, 0, 0);
      return;
    }
    const s = this.model.Snapshot(stateKey);
    this.uniforms.uBladeBloodState.value.set(s.coverage, s.edge, s.spatter, s.wetness);
    this.uniforms.uBladeBloodExtra.value.set(s.thickness, s.lengthReach, s.flowOffset, s.sideBias);
  }

  /**
   * Record a real flesh hit / slash / stab / lodge / yank / cleave / rip on the player's blade.
   * Immediately updates shader uniforms and casts a fine burst of blood droplets off the blade edge.
   */
  RecordHit({ weaponId = null, bayonet = false, kind = "light", kill = false, corpse = false, sweep = 0, intensity = 1 } = {}) {
    const targetWeapon = weaponId || this.active?.weaponId || this.viewmodel.weaponId;
    const isBayonet = bayonet || (!!this.active?.isBayonet && targetWeapon === this.active.weaponId);
    const stateKey = BladeStateKey(targetWeapon, { bayonet: isBayonet });
    if (!stateKey) return null;

    const result = this.model.RecordHit(stateKey, { kind, bayonet: isBayonet, kill, corpse, sweep, intensity });
    if (!result) return null;

    if (this.active && this.active.stateKey === stateKey) {
      this._SyncShader(stateKey, this.active.profileKey);
      if (result.flingBurst > 0) {
        this._EmitFlingDrops(result.flingBurst, { burst: true, sweep });
      }
    }
    return result.state;
  }

  /** Reset blood on one weapon or all player blades (respawn, scenario restart, level change). */
  Reset(weaponId = null, { bayonet = false } = {}) {
    const key = weaponId ? BladeStateKey(weaponId, { bayonet }) : null;
    this.model.Reset(key);
    this.hasPrevTip = false;
    this.tipSpeedMps = 0;
    for (const m of this.pendantMeshes) m.visible = false;
    if (this.active) this._SyncShader(this.active.stateKey, this.active.profileKey);
  }

  /** Current diagnostic snapshot for Debug API & automated tests. */
  State(weaponId = null, { bayonet = false } = {}) {
    const key = weaponId ? BladeStateKey(weaponId, { bayonet }) : this.active?.stateKey;
    const snap = key ? this.model.Snapshot(key) : this.model.Snapshot("");
    return {
      ...snap,
      activeKey: this.active?.stateKey || null,
      profileKey: this.active?.profileKey || null,
      textureReady: this.textureReady,
      tipSpeedMps: +this.tipSpeedMps.toFixed(3),
      visiblePendants: this.pendantMeshes.filter((m) => m.visible).length,
      allKeys: [...this.model.states.keys()],
    };
  }

  /**
   * Convert a blade mesh-local point to world position (un-compressed to real world scale for VFX
   * OR exact visual rendered world position for screen-locked pendant drops).
   */
  _BladePointWorld(localPt, out, { visual = true } = {}) {
    const mesh = this.active?.anchorMesh;
    if (!mesh) return out.set(0, 0, 0);
    out.copy(localPt).applyMatrix4(mesh.matrixWorld);
    if (!visual && this.viewmodel.compensation) {
      this.viewmodel.root.worldToLocal(out);
      out.divide(this.viewmodel.compensation);
      this.viewmodel.root.localToWorld(out);
    }
    return out;
  }

  /**
   * Spawn a real falling 3D blood droplet right beneath the detached pendant tip.
   * Starts along the exact visual screen ray so there is zero parallax pop as the droplet snaps free,
   * then falls under real gravity (9.81 m/s^2) and deposits a wet blood spot onto the ground below.
   */
  _EmitDripDrop(localAnchor, { radiusM = 0.004, wetness = 0.8, jolt = false } = {}) {
    const blood = this.vfx?.bloodEffects;
    if (!blood || !this.active?.anchorMesh) return;
    const camera = this.viewmodel.root.parent;
    this._BladePointWorld(localAnchor, _dripPos, { visual: true });
    // Offset slightly below the hanging droplet neck so it starts cleanly clear of the blade edge.
    _dripPos.y -= radiusM * 1.9;
    // Push 1.5% away from camera along the exact visual ray so it never z-fights the blade silhouette.
    if (camera) {
      camera.getWorldPosition(_tmpCam);
      _dripPos.sub(_tmpCam).multiplyScalar(1.02).add(_tmpCam);
    }
    const downSpeed = this._Range(...D.dripSpeedDownMps);
    _dripVel.set(
      this.tipVelocity.x * (jolt ? 0.38 : 0.14) + this._Range(-0.04, 0.04),
      Math.min(-downSpeed, this.tipVelocity.y * 0.20 - downSpeed),
      this.tipVelocity.z * (jolt ? 0.38 : 0.14) + this._Range(-0.04, 0.04),
    );
    const halfW = Mix(D.dripHalfWidthM[0], D.dripHalfWidthM[1], Clamp01((radiusM - D.pendantMinRadiusM) / Math.max(1e-4, D.pendantMaxRadiusM - D.pendantMinRadiusM)));
    const stretch = this._Range(...D.dripStretch);
    const decalR = this._Range(...D.dripDecalRadiusM) * (0.75 + 0.35 * wetness);
    blood.Drop(_dripPos, _dripVel, {
      radius: decalR,
      pool: false,
      deposit: this.random() < D.dripDecalChance,
      size: halfW,
      stretch,
      color: wetness > 0.55 ? _arterialDropColor : _freshDropColor,
    });
  }

  /**
   * Centrifugal blood-fling off a rapidly moving wet blade (振刀甩血) or post-hit spray burst.
   * Casts an arc of fine crimson liquid droplets along the blade's motion tangent.
   */
  _EmitFlingDrops(count, { burst = false, sweep = 0 } = {}) {
    const blood = this.vfx?.bloodEffects;
    if (!blood || !this.active?.anchorMesh || count <= 0) return;
    const prof = P[this.active.profileKey] || P.Dadao;
    const pts = prof.dripPoints || [];
    if (!pts.length) return;
    const camera = this.viewmodel.root.parent;
    const snap = this.model.Snapshot(this.active.stateKey);
    const maxAlong = Math.max(0.25, snap.lengthReach);
    const eligible = pts.filter((pt) => pt[3] <= maxAlong + 0.08);
    const poolPts = eligible.length ? eligible : [pts[0]];

    // Base fling direction: blade tip world velocity if swinging fast, else forward/sweep tangent on hit burst.
    const speed = this.tipVelocity.length();
    if (speed > 0.8 && !burst) {
      _flingDir.copy(this.tipVelocity).normalize();
    } else if (camera) {
      camera.getWorldDirection(_flingDir);
      // Add slight lateral sweep fan on melee slashes.
      if (sweep) {
        _tmpV0.set(0, 1, 0).cross(_flingDir).normalize();
        _flingDir.addScaledVector(_tmpV0, (sweep > 0 ? -1 : 1) * 0.45).normalize();
      }
      _flingDir.y += 0.14;
      _flingDir.normalize();
    } else {
      _flingDir.set(0, -0.3, -1).normalize();
    }

    for (let i = 0; i < count; i += 1) {
      const pt = poolPts[i % poolPts.length];
      _tmpV1.set(pt[0], pt[1], pt[2]);
      this._BladePointWorld(_tmpV1, _dripPos, { visual: true });
      if (camera) {
        camera.getWorldPosition(_tmpCam);
        _dripPos.sub(_tmpCam).multiplyScalar(1.06).add(_tmpCam);
      }
      const baseSpeed = burst
        ? this._Range(2.0, 4.8)
        : Clamp(speed * D.flingSpeedScale * this._Range(0.72, 1.18), D.flingSpeedClampMps[0], D.flingSpeedClampMps[1]);
      _dripVel.set(
        _flingDir.x + this._Range(-D.flingSpread, D.flingSpread),
        _flingDir.y + this._Range(-D.flingSpread * 0.8, D.flingSpread * 0.65),
        _flingDir.z + this._Range(-D.flingSpread, D.flingSpread),
      ).normalize().multiplyScalar(baseSpeed);
      const halfW = this._Range(...D.flingHalfWidthM);
      const stretch = this._Range(...D.flingStretch);
      blood.Drop(_dripPos, _dripVel, {
        radius: this._Range(...D.flingDecalRadiusM),
        pool: false,
        deposit: this.random() < D.flingDecalChance,
        size: halfW,
        stretch,
        lag: (i % 3) * 0.005,
        color: _arterialDropColor,
      });
    }
  }

  /**
   * Per-frame update (called right at the end of Viewmodel.Update after all bone/weapon poses settle).
   */
  Update(dt) {
    if (this.disposed) return;
    const step = Clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
    const vmVisible = !!this.viewmodel.root?.visible;
    const bayonetShown = !this.active?.isBayonet
      || (this.active.bayonetVisible && this.viewmodel.rig?.parts?.bayonet?.visible !== false);
    const activeReady = !!(this.active && this.active.anchorMesh && bayonetShown && vmVisible);

    let gravityDownAlign = 0.7;
    const prof = activeReady ? (P[this.active.profileKey] || P.Dadao) : null;
    const dripPts = prof?.dripPoints || [];

    if (activeReady) {
      // Refresh blade world matrix so tip kinematics, gravity projection, and pendant drops match this exact frame.
      this.viewmodel.root.updateWorldMatrix(true, true);
      const mesh = this.active.anchorMesh;

      // 1. Project true world gravity (0, -1, 0) into mesh local space for real-time shader rivulet flow.
      _tmpInvMat.copy(mesh.matrixWorld).invert();
      _tmpMat3.setFromMatrix4(_tmpInvMat);
      _tmpDownLocal.copy(_worldDown).applyMatrix3(_tmpMat3);
      if (_tmpDownLocal.lengthSq() > 1e-8) _tmpDownLocal.normalize();
      else _tmpDownLocal.set(0, -1, 0);
      this.uniforms.uBladeGravityLocal.value.copy(_tmpDownLocal);
      // Alignment along blade Z/Y plane (flat horizontal blade drips off side faster; tilted blade runs along edge).
      gravityDownAlign = Clamp01(Math.hypot(_tmpDownLocal.z, _tmpDownLocal.y));

      // 2. Measure true world-scale blade tip velocity for jolt drip & rapid-swing blood-fling.
      const tipPt = dripPts[0] || [0, 0, prof.zTip];
      _tmpV0.set(tipPt[0], tipPt[1], tipPt[2]);
      this._BladePointWorld(_tmpV0, _tmpV1, { visual: false });
      if (this.hasPrevTip && step > 1e-4) {
        this.tipVelocity.subVectors(_tmpV1, this.prevTipWorld).divideScalar(step);
        // Reject teleport/respawn spikes (> 30 m/s in a single frame).
        const rawSpeed = this.tipVelocity.length();
        if (rawSpeed > 30) {
          this.tipVelocity.set(0, 0, 0);
          this.tipSpeedMps = 0;
        } else {
          this.tipSpeedMps = this.tipSpeedMps * 0.35 + rawSpeed * 0.65;
        }
      } else {
        this.tipVelocity.set(0, 0, 0);
        this.tipSpeedMps = 0;
        this.hasPrevTip = true;
      }
      this.prevTipWorld.copy(_tmpV1);
    } else {
      this.hasPrevTip = false;
      this.tipSpeedMps = 0;
    }

    // 3. Step deterministic blood physics model across all blades (active + stowed).
    const events = this.model.Step(step, activeReady ? {
      key: this.active.stateKey,
      profileKey: this.active.profileKey,
      tipSpeedMps: this.tipSpeedMps,
      gravityDownAlign,
      stowed: false,
    } : null);

    if (!activeReady) {
      for (const m of this.pendantMeshes) m.visible = false;
      if (this.active) this._SyncShader(this.active.stateKey, this.active.profileKey);
      return;
    }

    // 4. Push updated blood state to blade shader uniforms.
    this._SyncShader(this.active.stateKey, this.active.profileKey);
    const snap = this.model.Snapshot(this.active.stateKey);

    // 5. Evaluate each candidate drip station using perpendicular gravity overhang in camera space:
    // Projecting world gravity (-Y) perpendicular to the blade axis tells us unambiguously whether
    // a vertically hanging droplet clears the blade cleanly off the cutting edge (+E) or off the
    // drenched underside spine (-E), preventing drops from clipping behind/inside tilted steel.
    const worldYs = new Array(dripPts.length);
    const resolvedLocalPts = new Array(dripPts.length);
    const camera = this.viewmodel.root.parent;
    let useSpineOverhang = false;
    if (dripPts.length >= 2 && dripPts[0].length >= 5) {
      const pTip = dripPts[0];
      const pMid = dripPts[Math.min(2, dripPts.length - 1)];
      const pLow = dripPts[dripPts.length - 1];
      _tmpV0.set(pTip[0], pTip[1], pTip[2]);
      this._BladePointWorld(_tmpV0, _tmpV1, { visual: true });
      _tmpV0.set(pLow[0], pLow[1], pLow[2]);
      this._BladePointWorld(_tmpV0, _tmpV2, { visual: true });
      // Screen-projected blade axis T (tip -> heel) vs cross-blade vector E (spine -> edge)
      if (camera) {
        _tmpV1.project(camera);
        _tmpV2.project(camera);
        let tx = _tmpV2.x - _tmpV1.x, ty = _tmpV2.y - _tmpV1.y;
        const tLen = Math.hypot(tx, ty);
        if (tLen > 1e-4) {
          tx /= tLen; ty /= tLen;
          // Screen-down unit vector is (0, -1) in NDC; remove component along T to get outward gravity overhang.
          const gDotT = -ty;
          const gPerpX = -tx * gDotT;
          const gPerpY = -1 - ty * gDotT;
          _tmpV0.set(pMid[0], pMid[1], pMid[2]);
          this._BladePointWorld(_tmpV0, _tmpV1, { visual: true }).project(camera);
          _tmpV0.set(pMid[0], pMid[4], pMid[2]);
          this._BladePointWorld(_tmpV0, _tmpV2, { visual: true }).project(camera);
          const ex = _tmpV1.x - _tmpV2.x, ey = _tmpV1.y - _tmpV2.y;
          // If perpendicular gravity points toward spine (-E) instead of edge (+E), hang drops off bloody underside.
          if (gPerpX * ex + gPerpY * ey < -1e-4) useSpineOverhang = true;
        }
      }
    }
    const effectiveReach = useSpineOverhang
      ? Math.min(snap.lengthReach, Math.max(0.20, snap.coverage * 0.56))
      : snap.lengthReach;
    for (let i = 0; i < dripPts.length; i += 1) {
      const pt = dripPts[i];
      const useSpine = useSpineOverhang && pt.length >= 5 && Number.isFinite(pt[4]);
      const chosenYLocal = useSpine ? pt[4] : pt[1];
      _tmpV0.set(pt[0], chosenYLocal, pt[2]);
      this._BladePointWorld(_tmpV0, _tmpV1, { visual: true });
      worldYs[i] = _tmpV1.y;
      resolvedLocalPts[i] = [pt[0], chosenYLocal, pt[2]];
    }
    const anchorIndices = SelectLowestDripIndices(this.active.profileKey, effectiveReach, worldYs, this.pendantMeshes.length);

    // 6. Position & orient 3D glossy swelling pendant droplets in viewmodel.root space (hanging straight along world -Y).
    const vmRoot = this.viewmodel.root;
    _tmpInvMat.copy(vmRoot.matrixWorld).invert();
    _tmpMat3.setFromMatrix4(_tmpInvMat);
    _tmpDownLocal.copy(_worldDown).applyMatrix3(_tmpMat3).normalize();
    _tmpQuat.setFromUnitVectors(_localDownAxis, _tmpDownLocal);

    // Scale compensation keeps droplet physical size consistent with the rendered foreground blade.
    const scaleFactor = this.viewmodel.compensation ? this.viewmodel.compensation.y : 1;
    for (let i = 0; i < this.pendantMeshes.length; i += 1) {
      const mesh = this.pendantMeshes[i];
      const pState = snap.pendants[i];
      const aIdx = anchorIndices[i];
      if (!pState || !pState.active || pState.radiusM <= 1e-4 || aIdx === undefined || !resolvedLocalPts[aIdx]) {
        mesh.visible = false;
        continue;
      }
      const pt = resolvedLocalPts[aIdx];
      _tmpV0.set(pt[0], pt[1], pt[2]);
      this._BladePointWorld(_tmpV0, _tmpV1, { visual: true });
      vmRoot.worldToLocal(_tmpV1);
      mesh.position.copy(_tmpV1);
      mesh.quaternion.copy(_tmpQuat);
      const r = pState.radiusM * scaleFactor;
      const len = r * pState.elongation * 0.78;
      mesh.scale.set(r, len, r);
      mesh.visible = true;
    }

    // 7. Emit real world-space falling droplets on detachment & centrifugal fling bursts on fast swings.
    for (const drip of events.drips) {
      const aIdx = anchorIndices[drip.pendantIndex] ?? anchorIndices[0] ?? 0;
      const pt = resolvedLocalPts[aIdx] || [0, 0, prof.zTip];
      _tmpV2.set(pt[0], pt[1], pt[2]);
      this._EmitDripDrop(_tmpV2, drip);
    }
    if (events.flings > 0) {
      this._EmitFlingDrops(events.flings, { burst: false });
    }
  }

  Dispose() {
    this.disposed = true;
    this.pendantGroup.removeFromParent();
    this.pendantGeo.dispose();
    if (this.pendantMaterial && !this.library?.materials) this.pendantMaterial.dispose();
    for (const mat of this.patchedBySource.values()) mat.dispose();
    this.patchedBySource.clear();
  }
}
