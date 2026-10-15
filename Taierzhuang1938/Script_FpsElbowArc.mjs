// Scalar-only elbow-circle stepping; angles are radians relative to the
// transported previous elbow plane (angle 0). No rig, clock or hidden history.
const TAU = Math.PI * 2;
const SCORE_EPSILON = 1e-12;
const Wrap = angle => {
  const value = ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return value === 0 ? 0 : value;
};
const Clamp = (value,low,high) => Math.max(low,Math.min(high,value));

/**
 * center: SignedAngle(previousPlane, wristPreferredPlane).
 * halfWidth: hard wrist-feasible half arc, in [0, pi].
 * target: SignedAngle(previousPlane, authoredPole).
 * maxStep: permitted angular travel during this frame.
 *
 * A legal start stays in the SAME unwrapped connected arc. First project the
 * pole onto that whole arc, then step towards that legal goal inside the rate
 * interval. Greedy circular-distance minimisation inside the rate interval
 * would get stuck when the valid route initially goes away from the pole.
 *
 * If no legal endpoint can be reached within maxStep, angle is the nearest
 * hard-legal correction, feasible=false and overspeed=true. Callers must record
 * that conflict; they must not silently report successful limited stepping.
 */
export function StepElbowArc({center,halfWidth,target,maxStep}) {
  for (const [name,value] of Object.entries({center,halfWidth,target,maxStep}))
    if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  if (halfWidth < 0 || halfWidth > Math.PI) throw new RangeError('halfWidth must be in [0, pi]');
  if (maxStep < 0) throw new RangeError('maxStep must be nonnegative');
  center = Wrap(center); target = Wrap(target);
  // A full circle has no cut. An arbitrary interval representative must not
  // invent a forbidden gap and send the elbow around a needless full turn.
  if (halfWidth === Math.PI) return {angle:Clamp(target,-maxStep,maxStep),feasible:true,overspeed:false,requiredStep:0};
  const intervals = [-1,0,1].map(turn => ({low:center-halfWidth+turn*TAU,high:center+halfWidth+turn*TAU}));
  const containingStart = intervals.filter(interval=>interval.low <= 0 && interval.high >= 0);
  // A different 2pi copy can be numerically closer to the pole yet require
  // crossing the forbidden gap. Keep the connected copy containing the start.
  const eligible = containingStart.length ? containingStart : intervals;
  const nearest = intervals.map(interval=>Clamp(0,interval.low,interval.high));
  const requiredStep = Math.min(...nearest.map(Math.abs));
  const Compare = (a,b) => {
    for (const key of ['error','travel','remaining','step']) {
      if (Math.abs(a[key]-b[key]) > SCORE_EPSILON) return a[key]-b[key];
    }
    return a.angle-b.angle; // Deterministic tie at exact symmetry, no random branch.
  };
  const candidates = [];
  for (const interval of eligible) {
    const low = Math.max(interval.low,-maxStep), high = Math.min(interval.high,maxStep);
    if (low > high) continue;
    const goals = [-1,0,1].map(turn => {
      const goal = Clamp(target+turn*TAU,interval.low,interval.high);
      return {goal,error:Math.abs(Wrap(goal-target)),travel:Math.abs(goal),remaining:0,step:0,angle:goal};
    }).sort(Compare);
    const goal = goals[0].goal, angle = Clamp(goal,low,high);
    candidates.push({angle,error:goals[0].error,travel:Math.abs(goal),remaining:Math.abs(goal-angle),step:Math.abs(angle)});
  }
  if (candidates.length) {
    candidates.sort(Compare);
    return {angle:candidates[0].angle,feasible:true,overspeed:false,requiredStep};
  }
  // Preserve the wrist hard bound even when the moving arc cannot be reached
  // under the speed cap. Return the smallest required correction, not the pole.
  const corrections = nearest.map(angle=>({angle,error:Math.abs(angle),
    travel:Math.abs(Wrap(angle-target)),remaining:0,step:Math.abs(angle)})).sort(Compare);
  return {angle:corrections[0].angle,feasible:false,overspeed:true,requiredStep};
}
