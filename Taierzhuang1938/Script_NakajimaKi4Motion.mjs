// Compose rotations after each authored rest quaternion: the installed wings,
// inclined rudder post and canted wheel axes must retain their real orientation.
import { NAKAJIMA_KI4_ASSET as Asset } from "./Data_NakajimaKi4.mjs";

const Clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
const ZeroPose = () => ({ propellerRadians: 0, wheelTravelM: 0, wheelLeftRadians: 0, wheelRightRadians: 0,
  rudderRadians: 0, elevatorRadians: 0, elevatorLeftRadians: 0, elevatorRightRadians: 0,
  aileronRadians: 0, observerYawRadians: 0, observerElevationRadians: 0 });

export function BindNakajimaKi4(root) {
  const controls = Object.fromEntries(Object.entries(Asset.controls).map(([key, name]) => {
    const node = root.getObjectByName(name);
    if (!node?.children.length) throw new Error(`Ki-4 is missing complete control ${name}`);
    return [key, node];
  }));
  const bindings = Object.fromEntries(Object.entries(controls).map(([key, node]) => {
    const declaration = node.userData.hingeAxis;
    if (!/^-?[XYZ]$/.test(declaration)) throw new Error(`Ki-4 invalid hinge axis: ${node.name}`);
    const axis = node.position.clone().set(0, 0, 0);
    axis[declaration.at(-1).toLowerCase()] = declaration.startsWith("-") ? -1 : 1;
    return [key, { node, axis, rest: node.quaternion.clone(), delta: node.quaternion.clone() }];
  }));
  let state = ZeroPose();
  function Rotate(key, angle) {
    const { node, axis, rest, delta } = bindings[key];
    node.quaternion.copy(rest).multiply(delta.setFromAxisAngle(axis, angle));
  }
  function SetPose(pose = {}) {
    const next = { ...state };
    for (const [key, value] of Object.entries(pose)) {
      if (!(key in next)) throw new TypeError(`Ki-4 unknown pose value ${key}`);
      if (!Number.isFinite(value)) throw new TypeError(`Ki-4 ${key} must be finite`);
      next[key] = value;
    }
    if (pose.wheelTravelM != null) {
      for (const side of ["Left", "Right"]) next[`wheel${side}Radians`] = pose[`wheel${side}Radians`] ?? -next.wheelTravelM / Asset.wheelRadiusM;
    }
    if (pose.elevatorRadians != null) {
      for (const side of ["Left", "Right"]) next[`elevator${side}Radians`] = pose[`elevator${side}Radians`] ?? next.elevatorRadians;
    }
    Rotate("propeller", next.propellerRadians);
    for (const side of ["Left", "Right"]) {
      Rotate(`wheel${side}`, next[`wheel${side}Radians`]);
      Rotate(`elevator${side}`, Clamp(next[`elevator${side}Radians`], Asset.limitsRadians.elevator));
      Rotate(`aileron${side}`, Clamp(next.aileronRadians * (side === "Left" ? 1 : -1), Asset.limitsRadians.aileron));
    }
    for (const [key, limit] of [["rudder", "rudder"], ["observerYaw", "observerYaw"], ["observerElevation", "observerElevation"]]) {
      Rotate(key, Clamp(next[`${key}Radians`], Asset.limitsRadians[limit]));
    }
    state = next;
    root.updateMatrixWorld(true);
    return { ...state };
  }
  return Object.freeze({ controls, SetPose, Reset: () => SetPose(ZeroPose()), Inspect: () => ({ ...state }) });
}
