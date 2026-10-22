// Millimetre-scale damped bristle bundles. Contact projection remains in the
// scene, after integration, so elastic lag can never push a strand into skin.
export function StepBristle(state, target, motion, dt, weight = 1) {
  state.offset ??= [0, 0, 0]; state.velocity ??= [0, 0, 0];
  const frequency = 32, damping = 18, limit = .42 * weight;
  const targetLength=Math.hypot(...target),targetScale=targetLength>limit&&targetLength>0?limit/targetLength:1;
  const time = Math.max(0, Math.min(.05, dt));
  for (let axis = 0; axis < 3; axis++) {
    state.velocity[axis] = Math.max(-12, Math.min(12, state.velocity[axis] - (motion[axis] || 0) * 26 * weight));
  }
  const steps = Math.ceil(time * 240), h = steps ? time / steps : 0;
  for (let i = 0; i < steps; i++) for (let axis = 0; axis < 3; axis++) {
    state.velocity[axis] += ((target[axis]*targetScale - state.offset[axis]) * frequency * frequency - state.velocity[axis] * damping) * h;
    state.offset[axis] += state.velocity[axis] * h;
  }
  const length = Math.hypot(...state.offset);
  if (length > limit && length > 0) {
    const ratio = limit / length;
    for (let axis = 0; axis < 3; axis++) { state.offset[axis] *= ratio; state.velocity[axis] *= .5; }
  }
  state.settled=Math.hypot(...state.velocity)<.003&&Math.hypot(...state.offset.map((value,i)=>value-target[i]*targetScale))<.00015;
  return state.offset;
}
