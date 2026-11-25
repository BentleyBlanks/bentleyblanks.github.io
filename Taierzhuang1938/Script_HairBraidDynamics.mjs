import { Matrix4, Quaternion, Vector3 } from 'three';

// Four rings along the plait, one for each pure-influence station in its
// baked skin. Pose and simulate in world metres so locomotion and turns both
// impart inertia. Only the drawn instance's palette is modified.
const axis = new Vector3(), goal = new Vector3(), delta = new Vector3();
const from = new Vector3(), to = new Vector3(), pivot = new Vector3();
const rotation = new Quaternion(), correction = new Matrix4();

export class BraidDynamics {
  constructor(anchors) {
    this.rest = anchors.map(p => new Vector3().fromArray(p));
    const vectors = () => anchors.map(() => new Vector3());
    this.goals = vectors();
    this.lastGoals = vectors();
    this.lengths = anchors.map(() => 0);
    this.stepGoals = vectors();
    this.back = vectors();
    this.positions = vectors();
    this.velocities = vectors();
    this.before = vectors();
    this.inverse = new Matrix4();
    this.ready = false;
  }

  Update(dt, world, palette) {
    const { rest, positions, velocities, goals, lastGoals, stepGoals, before, back } = this;
    const end = rest.length - 1;
    let shift = 0;
    for (let i = 0; i <= end; i++) {
      goals[i].copy(rest[i]).applyMatrix4(palette[i]).applyMatrix4(world);
      back[i].set(0, 0, 1).transformDirection(palette[i]).transformDirection(world);
    }
    // The mocap neck and spine can squeeze two attachment rings almost
    // together. Use their orientation as a guide, never their separation as
    // the physical length of hair. Preserve the back-side collision boundary.
    for (let i = end; i > 0; i--) {
      this.lengths[i] = from.copy(rest[i]).applyMatrix4(world).distanceTo(to.copy(rest[i - 1]).applyMatrix4(world));
      axis.subVectors(goals[i], goals[i - 1]).setLength(this.lengths[i]);
      this.stepGoals[i].copy(axis);
    }
    for (let i = 1; i <= end; i++) {
      const raw = goal.copy(goals[i]);
      axis.copy(this.stepGoals[i]);
      const minimum = Math.min(this.lengths[i], delta.subVectors(raw, goals[i-1]).dot(back[i]));
      const depth = axis.dot(back[i]);
      if (depth < minimum) {
        axis.addScaledVector(back[i], -depth).setLength(Math.sqrt(Math.max(0, this.lengths[i]**2 - minimum**2)))
          .addScaledVector(back[i], minimum);
      }
      goals[i].copy(goals[i-1]).add(axis);
    }
    for (let i = 0; i <= end; i++) shift = Math.max(shift, goals[i].distanceTo(lastGoals[i]));
    const reset = !this.ready || dt > .12 || shift > .32 || (dt === 0 && shift > .0001);
    if (reset) {
      for (let i = 0; i <= end; i++) {
        positions[i].copy(goals[i]);
        velocities[i].set(0, 0, 0);
      }
    } else if (dt > 0) {
      const steps = Math.ceil(dt * 120), h = dt / steps;
      const decay = Math.exp(-5.5 * h);
      for (let step = 1; step <= steps; step++) {
        for (let i = 0; i <= end; i++) {
          stepGoals[i].lerpVectors(lastGoals[i], goals[i], step / steps);
          before[i].copy(positions[i]);
        }
        positions[0].copy(stepGoals[0]);
        for (let i = 1; i <= end; i++) {
          // Damped shape recovery is stronger at the nape than at the tip.
          velocities[i].multiplyScalar(decay)
            .addScaledVector(delta.subVectors(stepGoals[i], positions[i]), (240 - 40 * i) * h);
          velocities[i].y -= 9.81 * h;
          positions[i].addScaledVector(velocities[i], h);
        }
        for (let i = 1; i <= end; i++) {
          // Constrain each link to a sphere about its pinned predecessor.
          // The animated coat-side plane cuts this sphere: if the unconstrained
          // link enters the coat, slide it onto that circle at the same length.
          const length = this.lengths[i];
          const parent = positions[i - 1];
          axis.subVectors(positions[i], parent).setLength(length);
          // Limit bending at the collar. Allow more travel toward the tip.
          from.subVectors(stepGoals[i], stepGoals[i - 1]).normalize();
          const bend = axis.dot(from);
          const cone = .20 + .12 * i;
          if (bend < length * Math.cos(cone)) {
            axis.addScaledVector(from, -bend).setLength(length * Math.sin(cone))
              .addScaledVector(from, length * Math.cos(cone));
          }
          // Allow for the braid radius and for the curve of the shoulders as
          // the tube slides sideways from the collision-free authored line.
          const slide = delta.copy(parent).add(axis).sub(stepGoals[i]).length();
          const clearance = Math.min(.009, slide * .55);
          const minimum = Math.min(length, delta.subVectors(stepGoals[i], parent).dot(back[i]) + clearance);
          const depth = axis.dot(back[i]);
          if (depth < minimum) {
            axis.addScaledVector(back[i], -depth);
            if (axis.lengthSq() < 1e-12) {
              axis.subVectors(stepGoals[i], stepGoals[i - 1]);
              axis.addScaledVector(back[i], -axis.dot(back[i]));
            }
            axis.setLength(Math.sqrt(Math.max(0, length * length - minimum * minimum)))
              .addScaledVector(back[i], minimum);
          }
          positions[i].copy(parent).add(axis);
          velocities[i].subVectors(positions[i], before[i]).multiplyScalar(1 / h);
        }
      }
    }
    for (let i = 0; i <= end; i++) lastGoals[i].copy(goals[i]);
    this.ready = true;

    // Rotate the local tube frame with its neighbours, keeping each ring's
    // centre on the simulated chain. The root remains exactly on the scalp.
    this.inverse.copy(world).invert();
    for (let i = 1; i <= end; i++) {
      const next = Math.min(end, i + 1);
      from.subVectors(rest[next], rest[i - 1]).normalize();
      to.subVectors(positions[next], positions[i - 1]).transformDirection(this.inverse);
      rotation.setFromUnitVectors(from, to);
      correction.makeRotationFromQuaternion(rotation);
      pivot.copy(rest[i]).applyQuaternion(rotation);
      goal.copy(positions[i]).applyMatrix4(this.inverse).sub(pivot);
      correction.setPosition(goal);
      palette[i].copy(correction);
    }
    return reset;
  }
}
