// Native directional-shadow instance compaction. The shared flare scope keeps
// source geometry/material/instance buffers intact and restores visibility.
// Install before BakeMeter/profiler so one outer shadow call remains one sample.
import { FlareShadowInstances } from "./Script_FlareShadowInstances.mjs";

export class ShadowInstanceCulling extends FlareShadowInstances {
  constructor(options = {}) {
    super(options);
    this.root.name = "ShadowInstanceCulling";
    this.lastRender = { lights: [], trianglesSaved: 0 };
  }
}

export function InstallShadowInstanceCulling(renderer, culler) {
  const shadowMap = renderer?.shadowMap;
  if (!shadowMap || !culler || typeof shadowMap.render !== "function" || shadowMap.render.shadowInstanceCulling) return false;
  const original = shadowMap.render;
  let observed = false, observedType;
  const wrapped = function ShadowInstanceCullingRender(lights, scene, camera) {
    culler.lastRender = { lights: [], trianglesSaved: 0 };
    const active = shadowMap.enabled !== false && lights?.length > 0 && !(shadowMap.autoUpdate === false && shadowMap.needsUpdate === false);
    if (!culler.enabled || culler.bypass || shadowMap.enabled === false || !lights?.length
      || (shadowMap.autoUpdate === false && shadowMap.needsUpdate === false)
      || !observed || observedType !== shadowMap.type
      || !lights.some((light) => light.isDirectionalLight && light.shadow?.camera?.isOrthographicCamera)) {
      // Native _previousType is shared across all lights in one call. Keep that
      // first/type-transition call whole so every map receives native recreation.
      const result = original.call(this, lights, scene, camera);
      if (active) { observed = true; observedType = shadowMap.type; }
      return result;
    }
    const pending = shadowMap.needsUpdate;
    let completed = false, result;
    try {
      for (const light of lights) {
        // Native render consumes this global gate after EACH call. Reapply the
        // incoming value so later scheduled cascades retain their original turn.
        shadowMap.needsUpdate = pending;
        const shadow = light.shadow;
        const scoped = light.isDirectionalLight && shadow?.camera?.isOrthographicCamera
          && !(shadow.autoUpdate === false && shadow.needsUpdate === false);
        if (!scoped) { result = original.call(this, [light], scene, camera); continue; }
        // Native initializes a new map's projection before updateMatrices. Match
        // that first-map setup before inspecting the actual orthographic frustum.
        if (shadow.map === null) shadow.camera.updateProjectionMatrix();
        shadow.updateMatrices(light);
        const restore = culler.Begin(scene, shadow.camera, camera);
        try {
          result = original.call(this, [light], scene, camera);
          const stats = { ...culler.stats };
          culler.lastRender.lights.push({ id: light.id, ...stats });
          culler.lastRender.trianglesSaved += stats.trianglesSaved;
        } finally { restore(); }
      }
      completed = true;
      observedType = shadowMap.type;
      return result;
    } finally {
      // A native success consumes the global gate; an exception leaves its
      // incoming value pending, just as the unsplit native call would do.
      shadowMap.needsUpdate = completed ? false : pending;
    }
  };
  wrapped.shadowInstanceCulling = true;
  shadowMap.render = wrapped;
  return true;
}
