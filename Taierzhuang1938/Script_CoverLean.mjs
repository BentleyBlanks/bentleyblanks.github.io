// Contextual wall-edge lean. Pure rules; every world query uses the host's live collision scene.
import { COVER_LEAN, CAMERA } from "./Data_Tuning_Player.mjs";

export class CoverLean {
  constructor() { this.Reset(); }
  Reset() { this.side = 0; this.candidate = 0; this.age = 0; }

  Update(dt, { enabled, eye, forward, right, raycast, clearance }) {
    if (!enabled || !raycast || !clearance) { this.Reset(); return 0; }
    const Point = (side, distance = CAMERA.leanOffsetM, drop = 0) => ({
      x: eye.x + right.x * side * distance, y: eye.y - drop,
      z: eye.z + right.z * side * distance,
    });
    const Wall = (origin) => {
      const hit = raycast(origin, forward, COVER_LEAN.nearM);
      return hit && hit.t > 0 && Math.abs(hit.normal?.[1] ?? 0) <= COVER_LEAN.wallNormalY;
    };
    const centerBlocked = Wall(eye) || Wall(Point(0, 0, COVER_LEAN.shoulderDropM));
    const Valid = (side) => {
      // The inner shoulder may still be covered when the eyes are exactly at the edge.
      if (!centerBlocked && !Wall(Point(-side, COVER_LEAN.shoulderInsetM))) return false;
      if (clearance(eye, right, side * CAMERA.leanOffsetM) < CAMERA.leanOffsetM - COVER_LEAN.skinM) return false;
      for (const drop of [0, COVER_LEAN.shoulderDropM]) {
        const origin = Point(side, CAMERA.leanOffsetM, drop);
        if (raycast(origin, forward, COVER_LEAN.nearM + COVER_LEAN.clearAheadM)) return false;
      }
      return true;
    };
    // Keep the chosen edge while it remains valid; do not select from the shifted camera.
    let next = this.side && Valid(this.side) ? this.side : 0;
    if (!next) { const left = Valid(-1), rightOpen = Valid(1); next = left !== rightOpen ? (left ? -1 : 1) : 0; }
    if (next !== this.candidate) { this.candidate = next; this.age = 0; }
    this.age += dt;
    if (!next) this.side = 0;
    else if (this.age >= COVER_LEAN.enterS) this.side = next;
    else this.side = 0;
    return this.side;
  }
}

// Conservative swept head clearance using the existing Rapier overlap query. Inflated
// samples cover the whole segment, including thin/rotated walls between sample centers.
export function LeanClearance(eye, right, offset, overlaps, raycast) {
  const distance = Math.abs(offset);
  if (!distance) return 0;
  const sign = Math.sign(offset);
  const steps = Math.ceil(distance / COVER_LEAN.sampleStepM);
  const step = distance / steps;
  const radius = COVER_LEAN.headRadiusM + step / 2;
  const direction = { x: right.x * sign, y: 0, z: right.z * sign };
  const hit = raycast?.(eye, direction, distance + radius);
  let clear = Math.min(distance, hit ? Math.max(0, hit.t - radius) : distance);
  if (overlaps) {
    for (let i = 0; i <= steps; i++) {
      const along = i * step;
      if (along > clear) break;
      if (overlaps(eye.x + direction.x * along, eye.y - radius, eye.z + direction.z * along, radius, radius * 2)) {
        clear = Math.max(0, along - step - COVER_LEAN.skinM); break;
      }
    }
  }
  return clear;
}
