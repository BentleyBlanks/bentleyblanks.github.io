// Shell / bomb visuals: a metal body plus a short smear of the projectile's
// actual ballistic history. Nothing here predicts a path through a wall, and
// nothing writes solid depth for SSAO.
//
// Distant rounds naturally become small. No emissive fireball, expanding smoke
// plume or distance-based enlargement; incoming audio / impact carry the warning.
import * as THREE from "three";
import { SHELL_VISUAL } from "./Data_Tuning_ShellVisual.mjs";

const SEGMENTS = 8, GRAVITY = 19.6, FADE_S = SHELL_VISUAL.fadeS;
/** History window: at most this many seconds / metres of past trajectory. */
export const TRAIL_SPAN_S = SHELL_VISUAL.trailSpanS, TRAIL_SPAN_M = SHELL_VISUAL.trailSpanM;
const FORWARD = new THREE.Vector3(0, 0, -1);

export function TrailSpan(shell) {
  return Math.min(shell.age, TRAIL_SPAN_S, TRAIL_SPAN_M / Math.max(1, shell.velocity.length()));
}

export class ShellVisuals {
  constructor(scene) {
    this.scene = scene; this.fading = [];
    // Closed base, cylindrical body and ogive nose; the nose faces local -Z.
    this.coreGeometry = new THREE.LatheGeometry([
      [0, -1], [0.86, -1], [1, -0.86], [1, 0.18],
      [0.86, 0.5], [0.55, 0.78], [0.2, 0.96], [0, 1],
    ].map(([radius, y]) => new THREE.Vector2(radius, y)), 12);
    this.coreGeometry.rotateX(-Math.PI / 2);
    // Remain in the transparent VFX path: the tiny moving round must not leave
    // an opaque prepass silhouette. Standard lighting gives it real highlights.
    this.coreMaterial = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false,
      color: SHELL_VISUAL.bodyColor, metalness: SHELL_VISUAL.bodyMetalness, roughness: SHELL_VISUAL.bodyRoughness,
    });
    this.trailMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      blending: THREE.NormalBlending,
      uniforms: { ...THREE.UniformsLib.fog, uOpacity: { value: 1 },
        uWidth: { value: new THREE.Vector2(SHELL_VISUAL.trailHeadHalfWidthM, SHELL_VISUAL.trailTailHalfWidthM) },
        uColor: { value: new THREE.Color(SHELL_VISUAL.trailColor) },
        uAlpha: { value: SHELL_VISUAL.trailOpacity } },
      vertexShader: `
        #include <fog_pars_vertex>
        uniform vec2 uWidth;
        attribute vec3 tangent;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          vec3 direction = normalize(mat3(modelViewMatrix) * tangent);
          vec3 side = cross(direction, normalize(-p.xyz));
          side = length(side) < 0.001 ? vec3(1.0, 0.0, 0.0) : normalize(side);
          float width = mix(uWidth.x, uWidth.y, uv.y);
          p.xyz += side * (uv.x * 2.0 - 1.0) * width;
          gl_Position = projectionMatrix * p;
          vec4 mvPosition = p;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <fog_pars_fragment>
        uniform float uOpacity;
        uniform vec3 uColor;
        uniform float uAlpha;
        varying vec2 vUv;
        void main() {
          float edge = pow(max(0.0, 1.0 - abs(vUv.x * 2.0 - 1.0)), 1.6);
          float alpha = edge * pow(1.0 - vUv.y, 2.0) * uAlpha * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
  }
  Create(shell) {
    const root = new THREE.Group(); root.name = `ShellVisual_${shell.id}`;
    const core = new THREE.Mesh(this.coreGeometry, this.coreMaterial);
    core.name = "ShellCore";
    core.scale.set(SHELL_VISUAL.bodyRadiusM, SHELL_VISUAL.bodyRadiusM, SHELL_VISUAL.bodyHalfLengthM);
    core.userData.skipNormalDepth = true;
    const geometry = new THREE.BufferGeometry(), uv = [], indices = [];
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 6), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("tangent", new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 6), 3).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i <= SEGMENTS; i++) {
      uv.push(0, i / SEGMENTS, 1, i / SEGMENTS);
      if (i < SEGMENTS) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
    const trail = new THREE.Mesh(geometry, this.trailMaterial.clone());
    trail.name = "ShellTrail"; trail.frustumCulled = false; trail.userData.skipNormalDepth = true;
    root.add(core, trail); this.scene.add(root);
    shell.visual = { root, core, trail, span: 0 }; shell.root = root;
    this.Update(shell);
    return root;
  }
  Update(shell) {
    const { core, trail } = shell.visual;
    core.position.copy(shell.position);
    core.quaternion.setFromUnitVectors(FORWARD, shell.velocity.clone().normalize());
    const span = TrailSpan(shell);
    shell.visual.span = span;
    trail.visible = span > 0;
    const positions = trail.geometry.attributes.position, tangents = trail.geometry.attributes.tangent;
    for (let i = 0; i <= SEGMENTS; i++) {
      const time = shell.age - span * i / SEGMENTS;
      const x = shell.from.x + shell.initialVelocity.x * time;
      const y = shell.from.y + shell.initialVelocity.y * time - GRAVITY * time * time * 0.5;
      const z = shell.from.z + shell.initialVelocity.z * time;
      for (let side = 0; side < 2; side++) {
        positions.setXYZ(i * 2 + side, x, y, z);
        tangents.setXYZ(i * 2 + side, shell.initialVelocity.x, shell.initialVelocity.y - GRAVITY * time, shell.initialVelocity.z);
      }
    }
    // The swept collision point can precede the end of the last integration step.
    positions.setXYZ(0, shell.position.x, shell.position.y, shell.position.z);
    positions.setXYZ(1, shell.position.x, shell.position.y, shell.position.z);
    positions.needsUpdate = true; tangents.needsUpdate = true;
  }
  Retire(shell) {
    shell.visual.core.visible = false;
    this.fading.push({ visual: shell.visual, left: FADE_S });
  }
  Step(dt) {
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const entry = this.fading[i]; entry.left -= dt;
      entry.visual.trail.material.uniforms.uOpacity.value = Math.max(0, entry.left / FADE_S);
      if (entry.left <= 0) { this.Remove(entry.visual); this.fading.splice(i, 1); }
    }
  }
  Remove(visual) {
    this.scene.remove(visual.root); visual.trail.geometry.dispose(); visual.trail.material.dispose();
  }
  Clear(shells) {
    for (const shell of shells) this.Remove(shell.visual);
    for (const entry of this.fading) this.Remove(entry.visual);
    this.fading.length = 0;
  }
  Dispose() { this.coreGeometry.dispose(); this.coreMaterial.dispose(); this.trailMaterial.dispose(); }
}
