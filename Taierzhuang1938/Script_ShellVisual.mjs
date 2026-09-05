// Shell / bomb visuals: a bright core plus a ribbon that samples the projectile's
// actual ballistic history. Nothing here predicts a path through a wall, and
// nothing writes solid depth for SSAO.
//
// 2026-09-05：上一版把尾迹缩到 0.12 s / 5.5 m、宽 3.5–10 cm、核心 5.5 cm，
// 结果 36 m 高空的炸弹和 145 m 外的炮弹在屏幕上都只剩一个像素。可见性的口径：
// 站在爆炸测试场里能用肉眼看见炮击和空投的整条来路。做法是历史窗放长到
// 1 s / 45 m、加色相加混合、并给带宽和核心一个按视距的像素下限——
// 远处的弹道也至少几个像素宽。测试按 shell.visual.span 回读采样窗核对轨迹。
import * as THREE from "three";

const SEGMENTS = 24, GRAVITY = 19.6, FADE_S = 0.18;
/** History window: at most this many seconds / metres of past trajectory. */
export const TRAIL_SPAN_S = 1.0, TRAIL_SPAN_M = 45;
const FORWARD = new THREE.Vector3(0, 0, -1);

export function TrailSpan(shell) {
  return Math.min(shell.age, TRAIL_SPAN_S, TRAIL_SPAN_M / Math.max(1, shell.velocity.length()));
}

export class ShellVisuals {
  constructor(scene) {
    this.scene = scene; this.fading = [];
    this.coreGeometry = new THREE.SphereGeometry(1, 16, 10);
    this.coreMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          // Keep a minimum apparent size: far shells must stay a visible bright dot.
          vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float grow = max(1.0, -centre.z * 0.0024 / 0.16);
          vec4 p = modelViewMatrix * vec4(position * grow, 1.0);
          vNormal = normalMatrix * normal; vView = -p.xyz;
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float facing = max(0.0, dot(normalize(vNormal), normalize(vView)));
          vec3 heat = mix(vec3(3.2, 1.1, 0.18), vec3(9.0, 5.4, 1.6), pow(facing, 1.4));
          gl_FragColor = vec4(heat, smoothstep(0.0, 0.5, facing));
        }`,
    });
    this.trailMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 1 } },
      vertexShader: `
        attribute vec3 tangent;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          vec3 direction = normalize(mat3(modelViewMatrix) * tangent);
          vec3 side = cross(direction, normalize(-p.xyz));
          side = length(side) < 0.001 ? vec3(1.0, 0.0, 0.0) : normalize(side);
          // Head 12 cm, tail 45 cm, never thinner than a few pixels at any distance.
          float width = max(mix(0.12, 0.45, uv.y), -p.z * 0.0032);
          p.xyz += side * (uv.x * 2.0 - 1.0) * width;
          gl_Position = projectionMatrix * p;
        }`,
      fragmentShader: `
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float edge = pow(max(0.0, 1.0 - abs(vUv.x * 2.0 - 1.0)), 1.6);
          float heat = exp(-vUv.y * 3.5);
          float alpha = edge * pow(1.0 - vUv.y, 1.1) * mix(0.30, 1.0, heat) * uOpacity;
          gl_FragColor = vec4(mix(vec3(1.1, 0.55, 0.22), vec3(4.5, 2.4, 0.8), heat), alpha);
        }`,
    });
  }
  Create(shell) {
    const root = new THREE.Group(); root.name = `ShellVisual_${shell.id}`;
    const core = new THREE.Mesh(this.coreGeometry, this.coreMaterial);
    core.name = "ShellCore"; core.scale.set(0.16, 0.16, 0.42); core.userData.skipNormalDepth = true;
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
