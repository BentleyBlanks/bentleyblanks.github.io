// Rig driver for this one GLB. Works with the original node hierarchy; there
// is no merged proxy, scale animation or deformation to imitate the controls.
import { KAWASAKI_TYPE88_ASSET as Asset } from "./Data_KawasakiType88.mjs";

function Finite(value, fallback) {
  if (value == null) return fallback;
  if (!Number.isFinite(value)) throw new TypeError("Type88 pose values must be finite");
  return value;
}
const Clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));

export function BindKawasakiType88(root) {
  const controls = Object.fromEntries(Object.entries(Asset.controls).map(([key, name]) => {
    const node = root.getObjectByName(name);
    if (!node) throw new Error(`Type88 is missing ${name}`);
    return [key, node];
  }));
  const rods = Object.fromEntries(["left", "right"].map(side => {
    const node = root.getObjectByName(Asset.pushrods[side]);
    if (!node) throw new Error(`Type88 is missing ${Asset.pushrods[side]}`);
    return [side, { node, rest: node.position.clone(), tilt: Finite(node.userData.hingeTiltRadians, 0) }];
  }));
  const restPropeller = controls.propeller.rotation.z;
  const state = { propellerRadians: 0, wheelTravelM: 0, rudderRadians: 0, elevatorRadians: 0, aileronRadians: 0,
    leftWheelRadians: 0, rightWheelRadians: 0, leftElevatorRadians: 0, rightElevatorRadians: 0 };
  function SetPose(pose = {}) {
    for (const key of Object.keys(state)) state[key] = Finite(pose[key], state[key]);
    controls.propeller.rotation.z = restPropeller + state.propellerRadians;
    const wheelAngle = -state.wheelTravelM / Asset.wheelRadiusM;
    if (pose.wheelTravelM != null) {
      state.leftWheelRadians = Finite(pose.leftWheelRadians, wheelAngle);
      state.rightWheelRadians = Finite(pose.rightWheelRadians, wheelAngle);
    }
    controls.wheelLeft.rotation.x = state.leftWheelRadians;
    controls.wheelRight.rotation.x = state.rightWheelRadians;
    controls.rudder.rotation.y = Clamp(state.rudderRadians, Asset.limitsRadians.rudder);
    if (pose.elevatorRadians != null) {
      state.leftElevatorRadians = Finite(pose.leftElevatorRadians, state.elevatorRadians);
      state.rightElevatorRadians = Finite(pose.rightElevatorRadians, state.elevatorRadians);
    }
    controls.elevatorLeft.rotation.x = Clamp(state.leftElevatorRadians, Asset.limitsRadians.elevator);
    controls.elevatorRight.rotation.x = Clamp(state.rightElevatorRadians, Asset.limitsRadians.elevator);
    for (const [side, sign] of [["Left", 1], ["Right", -1]]) {
      const angle = Clamp(state.aileronRadians * sign, Asset.limitsRadians.aileron);
      controls[`aileron${side}`].rotation.x = angle;
      controls[`aileronLower${side}`].rotation.x = angle;
      const rod = rods[side.toLowerCase()];
      const deltaY = Asset.pushrods.hornY * (Math.cos(angle) - 1) - Asset.pushrods.hornZ * Math.sin(angle);
      const deltaZ = Asset.pushrods.hornY * Math.sin(angle) + Asset.pushrods.hornZ * (Math.cos(angle) - 1);
      rod.node.position.set(rod.rest.x - Math.sin(rod.tilt) * deltaY,
        rod.rest.y + Math.cos(rod.tilt) * deltaY, rod.rest.z + deltaZ);
    }
    root.updateMatrixWorld(true);
    return { ...state };
  }
  function Reset() {
    return SetPose({ propellerRadians: 0, wheelTravelM: 0, rudderRadians: 0, elevatorRadians: 0, aileronRadians: 0 });
  }
  return Object.freeze({ controls, SetPose, Reset, Inspect: () => ({ ...state }) });
}
