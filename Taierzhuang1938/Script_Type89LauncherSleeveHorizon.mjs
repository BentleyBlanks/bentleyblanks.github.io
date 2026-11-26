import * as THREE from "three";
import { TYPE89_LAUNCHER_SLEEVE_HORIZON } from "./Data_Type89LauncherSleeveHorizon.mjs";
import { ApplyPatches, MakePatch, PatchesOf } from "./Script_MaterialPatches.mjs";

let sleevePatch;

function CreateSleevePatch() {
  const { rows, columns, rect, slopeScale, visibilityR8 } = TYPE89_LAUNCHER_SLEEVE_HORIZON;
  const texels = Uint8Array.from(atob(visibilityR8), character => character.charCodeAt(0));
  const horizon = new THREE.DataTexture(texels, columns, rows, THREE.RedFormat, THREE.UnsignedByteType);
  horizon.name = "Type89LauncherSleeveHorizon";
  horizon.minFilter = horizon.magFilter = THREE.LinearFilter;
  horizon.needsUpdate = true;
  const sleeveRect = new THREE.Vector4(...rect);
  return MakePatch({
    key: "type89LauncherSleeveHorizon1",
    uniforms: (uniforms) => {
      uniforms.uSleeveHorizon = { value: horizon };
      uniforms.uSleeveRect = { value: sleeveRect };
      uniforms.uSleeveSlopeScale = { value: slopeScale };
    },
    fragment: [
      ["#include <lights_physical_pars_fragment>", /* glsl */`
        #ifdef USE_NORMALMAP_TANGENTSPACE
        uniform sampler2D uSleeveHorizon;
        uniform vec4 uSleeveRect;
        uniform float uSleeveSlopeScale;
        float gSleeveHorizon;
        vec3 gSleeveAxis;
        vec3 gSleeveSurface;

        void RE_Direct_Sleeve(
          const in IncidentLight directLight, const in vec3 geometryPosition,
          const in vec3 geometryNormal, const in vec3 geometryViewDir,
          const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material,
          inout ReflectedLight reflectedLight
        ) {
          IncidentLight visibleLight = directLight;
          if (gSleeveHorizon > 0.0) {
            float axial = abs(dot(gSleeveAxis, directLight.direction));
            float radial = dot(gSleeveSurface, directLight.direction);
            float clearance = radial - gSleeveHorizon * axial;
            float recess = smoothstep(0.0, 0.045, gSleeveHorizon);
            visibleLight.color *= mix(1.0, smoothstep(-0.026, 0.042, clearance), recess);
          }
          RE_Direct_Physical(visibleLight, geometryPosition, geometryNormal, geometryViewDir,
            geometryClearcoatNormal, material, reflectedLight);
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Sleeve
        #endif`],
      ["#include <normal_fragment_begin>", /* glsl */`
        #ifdef USE_NORMALMAP_TANGENTSPACE
        vec2 sleeveUv = (vNormalMapUv - uSleeveRect.xy) / uSleeveRect.zw;
        gSleeveHorizon = 0.0;
        if (min(sleeveUv.x, sleeveUv.y) >= 0.0 && max(sleeveUv.x, sleeveUv.y) <= 1.0) {
          gSleeveAxis = normalize(tbn[1]);
          gSleeveSurface = nonPerturbedNormal;
          gSleeveHorizon = uSleeveSlopeScale * textureLod(uSleeveHorizon, sleeveUv.yx, 0.0).r;
        }
        #endif`],
    ],
  });
}

export function AttachType89LauncherSleeveHorizon(material) {
  sleevePatch ??= CreateSleevePatch();
  const existing = PatchesOf(material) || [];
  if (!existing.includes(sleevePatch)) {
    ApplyPatches(material, [...existing, sleevePatch]);
    material.needsUpdate = true;
  }
  return material;
}
