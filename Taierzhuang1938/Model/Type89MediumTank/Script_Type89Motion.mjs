// Rigid articulation for this single asset. All inputs are metres or radians.
// Authoring +Y/Z-up coordinates in the path are converted to glTF -Z/Y-up.
// No renderer dependency; works with objects exposing three-compatible transforms.
const tau = Math.PI * 2;
const Clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const Mod = (value, length) => ((value % length) + length) % length;

function SampleTrackPoint(path, distanceM) {
  const distance = Mod(distanceM, path.length);
  for (const segment of path.segments) {
    if (distance <= segment.s + segment.length + 1e-8) {
      const t = (distance - segment.s) / segment.length;
      const y = segment.a[0] + (segment.b[0] - segment.a[0]) * t;
      const z = segment.a[1] + (segment.b[1] - segment.a[1]) * t;
      const angle = Math.atan2(segment.b[1] - segment.a[1], segment.b[0] - segment.a[0]) + Math.PI;
      return { y, z, angle };
    }
  }
  throw new RangeError("Track path has a missing arc-length interval");
}

export function SampleTrackPath(path, distanceM) {
  const halfPitch = path.pitchM / 2;
  const a = SampleTrackPoint(path, distanceM - halfPitch);
  const b = SampleTrackPoint(path, distanceM + halfPitch);
  return { y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, angle: Math.atan2(b.z - a.z, b.y - a.y) + Math.PI };
}

function MultiplyQuaternion(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export class Type89Motion {
  constructor(root, path) {
    this.root = root;
    this.path = path;
    this.nodes = new Map();
    this.rest = new Map();
    this.tracks = { Left: [], Right: [] };
    this.wheels = { Left: [], Right: [] };
    this.distance = { Left: 0, Right: 0 };
    root.traverse((node) => {
      this.nodes.set(node.name, node);
      this.rest.set(node.name, { position: node.position.toArray(), quaternion: node.quaternion.toArray() });
      for (const side of ["Left", "Right"]) {
        if (node.name.startsWith(`Node_TrackLink${side}`)) this.tracks[side].push(node);
        else if (node.name.includes(side) && /^Node_(RoadWheel|LeadingWheel|FrontIdler|RearSprocket|ReturnRoller)/.test(node.name)) this.wheels[side].push(node);
      }
    });
    for (const side of ["Left", "Right"]) {
      if (this.tracks[side].length !== path.linksPerSide) throw new Error(`Missing articulated track links: ${side}`);
      if (this.wheels[side].length !== 15) throw new Error(`Missing rotating wheel nodes: ${side}`);
    }
    for (const name of ["Node_TurretYaw", "Node_MainGunPitch", "Node_MainGunRecoil", "Node_BowMachineGun", "Node_TurretMachineGun", "Node_CommanderHatchFront", "Node_CommanderHatchRear", "Node_DriverVisionFlap", "Node_BowHatch", "Node_EngineHatchLeft", "Node_EngineHatchRight"]) {
      if (!this.nodes.has(name)) throw new Error(`Missing articulated node: ${name}`);
    }
  }

  Rotate(name, axis, angle) {
    const node = this.nodes.get(name);
    if (!node) return;
    const half = angle / 2;
    const s = Math.sin(half);
    const rotation = [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
    node.quaternion.fromArray(MultiplyQuaternion(this.rest.get(name).quaternion, rotation));
  }

  SetPose(pose = {}) {
    this.Rotate("Node_TurretYaw", [0, 1, 0], Mod((pose.turretYaw ?? 0) + Math.PI, tau) - Math.PI);
    this.Rotate("Node_MainGunPitch", [1, 0, 0], Clamp(pose.mainGunPitch ?? 0, -.174533, .261799));
    const recoil = this.nodes.get("Node_MainGunRecoil");
    recoil.position.fromArray(this.rest.get(recoil.name).position);
    recoil.position.z += Clamp(pose.recoilM ?? 0, 0, .10);
    this.Rotate("Node_BowMachineGun", [0, 1, 0], Clamp(pose.bowMachineGunYaw ?? 0, -.174533, .174533));
    this.Rotate("Node_TurretMachineGun", [1, 0, 0], Clamp(pose.turretMachineGunPitch ?? 0, -.174533, .174533));
    const commander = Clamp(pose.commanderHatches ?? 0, 0, 1.745329);
    this.Rotate("Node_CommanderHatchFront", [1, 0, 0], -Clamp(pose.commanderHatchFront ?? commander, 0, 1.745329));
    this.Rotate("Node_CommanderHatchRear", [1, 0, 0], Clamp(pose.commanderHatchRear ?? commander, 0, 1.745329));
    this.Rotate("Node_SideVisionFlapLeft", [0, 1, 0], -Clamp(pose.leftSideVisionFlap ?? 0, 0, 3.054326));
    this.Rotate("Node_SideVisionFlapRight", [0, 1, 0], Clamp(pose.rightSideVisionFlap ?? 0, 0, 3.054326));
    this.Rotate("Node_DriverVisionFlap", [1, 0, 0], Clamp(pose.driverVisionFlap ?? 0, 0, 1.745329));
    this.Rotate("Node_BowHatch", [0, 1, 0], Clamp(pose.bowHatch ?? 0, 0, 1.134464));
    this.Rotate("Node_BowDoorLatch", [0, 0, -1], Clamp(pose.bowDoorLatch ?? 0, -.610865, .610865));
    const engine = Clamp(pose.engineHatches ?? 0, 0, .872665);
    this.Rotate("Node_EngineHatchLeft", [0, 0, -1], Clamp(pose.engineHatchLeft ?? engine, 0, .872665));
    this.Rotate("Node_EngineHatchRight", [0, 0, -1], -Clamp(pose.engineHatchRight ?? engine, 0, .872665));
    this.root.updateMatrixWorld?.(true);
  }

  SetTravel(leftM, rightM) {
    if (![leftM, rightM].every(Number.isFinite)) throw new TypeError("Track travel must be finite");
    this.distance.Left = leftM;
    this.distance.Right = rightM;
    for (const side of ["Left", "Right"]) {
      const distance = this.distance[side];
      for (const node of this.tracks[side]) {
        const sample = SampleTrackPath(this.path, node.userData.phaseM - distance);
        const rest = this.rest.get(node.name);
        node.position.set(rest.position[0], sample.z, -sample.y);
        node.quaternion.set(Math.sin(sample.angle / 2), 0, 0, Math.cos(sample.angle / 2));
      }
      for (const node of this.wheels[side]) this.Rotate(node.name, [1, 0, 0], -distance / node.userData.radiusM);
    }
    this.root.updateMatrixWorld?.(true);
  }

  Update(deltaSeconds, leftMetersPerSecond = 0, rightMetersPerSecond = leftMetersPerSecond) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new TypeError("Motion clock must advance with a finite non-negative delta");
    this.SetTravel(this.distance.Left + deltaSeconds * leftMetersPerSecond, this.distance.Right + deltaSeconds * rightMetersPerSecond);
  }

  Reset() {
    for (const [name, node] of this.nodes) {
      const rest = this.rest.get(name);
      node.position.fromArray(rest.position);
      node.quaternion.fromArray(rest.quaternion);
    }
    this.distance.Left = this.distance.Right = 0;
    this.root.updateMatrixWorld?.(true);
  }
}
