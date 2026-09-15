"""Convert one Kimodo SOMA77 result into the shared death-retarget payload."""
from pathlib import Path
import argparse
import hashlib
import json
import sys

import numpy as np


parser = argparse.ArgumentParser()
parser.add_argument("--input", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--kimodo-source", type=Path, required=True)
parser.add_argument("--clip", required=True)
args = parser.parse_args()

sys.path.insert(0, str(args.kimodo_source))
from kimodo.skeleton import SOMASkeleton77  # noqa: E402


jointNames = [
    "Hips", "Spine1", "Spine2", "Chest", "Neck1", "Neck2", "Head", "HeadEnd", "Jaw",
    "LeftEye", "RightEye", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "LeftHandThumb1", "LeftHandThumb2", "LeftHandThumb3", "LeftHandThumbEnd",
    "LeftHandIndex1", "LeftHandIndex2", "LeftHandIndex3", "LeftHandIndex4", "LeftHandIndexEnd",
    "LeftHandMiddle1", "LeftHandMiddle2", "LeftHandMiddle3", "LeftHandMiddle4", "LeftHandMiddleEnd",
    "LeftHandRing1", "LeftHandRing2", "LeftHandRing3", "LeftHandRing4", "LeftHandRingEnd",
    "LeftHandPinky1", "LeftHandPinky2", "LeftHandPinky3", "LeftHandPinky4", "LeftHandPinkyEnd",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "RightHandThumb1", "RightHandThumb2", "RightHandThumb3", "RightHandThumbEnd",
    "RightHandIndex1", "RightHandIndex2", "RightHandIndex3", "RightHandIndex4", "RightHandIndexEnd",
    "RightHandMiddle1", "RightHandMiddle2", "RightHandMiddle3", "RightHandMiddle4", "RightHandMiddleEnd",
    "RightHandRing1", "RightHandRing2", "RightHandRing3", "RightHandRing4", "RightHandRingEnd",
    "RightHandPinky1", "RightHandPinky2", "RightHandPinky3", "RightHandPinky4", "RightHandPinkyEnd",
    "LeftLeg", "LeftShin", "LeftFoot", "LeftToeBase", "LeftToeEnd",
    "RightLeg", "RightShin", "RightFoot", "RightToeBase", "RightToeEnd",
]
sourceByTarget = [
    "Hips", "LeftLeg", "RightLeg", "Spine1", "LeftShin", "RightShin", "Spine2",
    "LeftFoot", "RightFoot", "Chest", "LeftToeBase", "RightToeBase", "Neck1",
    "LeftShoulder", "RightShoulder", "Head", "LeftArm", "RightArm", "LeftForeArm",
    "RightForeArm", "LeftHand", "RightHand",
]
indices = np.array([jointNames.index(name) for name in sourceByTarget])

data = np.load(args.input)
for key in ["global_rot_mats", "posed_joints", "root_positions"]:
    if key not in data:
        raise RuntimeError(f"Kimodo payload is missing {key}: {args.input}")
frames = len(data["posed_joints"])
if data["posed_joints"].shape[1] != len(jointNames):
    raise RuntimeError(f"Expected SOMA77, got {data['posed_joints'].shape}")

# Kimodo's motion tensors are Y-up. The game authoring rig and the existing death
# baker are Z-up, matching Blender. Canonicalize the standing heading so all four
# candidates enter the faction rigs through the same forward convention.
conversion = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, -1.0], [0.0, 1.0, 0.0]])
sourceForward = data["global_rot_mats"][: min(20, frames), 0, :, 2].mean(axis=0)
forward = conversion @ sourceForward
yaw = -np.pi / 2 - np.arctan2(forward[1], forward[0])
c, s = np.cos(yaw), np.sin(yaw)
heading = np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])
worldTransform = heading @ conversion

joints = data["posed_joints"][:, indices] @ worldTransform.T
rotations = worldTransform @ data["global_rot_mats"][:, indices] @ conversion.T
roots = joints[:, 0].copy()
feet = joints[: min(12, frames), [7, 8, 10, 11], 2]
floor = float(np.median(np.min(feet, axis=1)))
roots[:, :2] -= roots[0, :2]
roots[:, 2] -= floor

skeleton = SOMASkeleton77()
neutral = skeleton.neutral_joints.detach().cpu().numpy()[indices] @ conversion.T
legLength = float(np.linalg.norm(neutral[4] - neutral[1]) + np.linalg.norm(neutral[7] - neutral[4]))

# The generated clips include a long motionless tail. Keep enough settled frames
# for a reliable corpse hold, then trim that tail from the runtime action.
core = joints
finalPose = core[-15:].mean(axis=0)
distanceToFinal = np.linalg.norm(core - finalPose, axis=2).max(axis=1)
settled = np.where((distanceToFinal < 0.04) & (np.arange(frames) > int(frames * 0.3)))[0]
settleFrame = int(settled[0]) if len(settled) else min(frames - 1, int(frames * 0.8))

standingHeight = float(np.median(roots[: min(10, frames), 2]))
settledHeight = float(np.median(roots[max(0, settleFrame - 5): settleFrame + 1, 2]))
drop = max(0.2, standingHeight - settledHeight)
contact = np.clip((standingHeight - roots[:, 2]) / drop, 0.0, 1.0)
contact = np.clip((contact - 0.25) / 0.65, 0.0, 1.0)
contact = contact * contact * (3.0 - 2.0 * contact)

# Hold the accepted terminal pose from the detected settle frame onward. This is
# a retarget-stage edit and is recorded below; the Kimodo source stays untouched.
roots[settleFrame:] = roots[settleFrame]
rotations[settleFrame:] = rotations[settleFrame]
joints[settleFrame:] = joints[settleFrame]
contact[settleFrame:] = 1.0

fps = 30.0
payload = {
    "name": args.clip,
    "kind": "death",
    "loop": False,
    "range": [0, frames - 1],
    "fps": fps,
    "durationSeconds": settleFrame / fps,
    "cycleFrames": settleFrame,
    "sourceFrameIndices": np.arange(frames).tolist(),
    "sourceFrameRate": fps,
    "settleFrame": settleFrame,
    "sourceRestJoints": neutral.tolist(),
    "sourceLegLength": legLength,
    "rotations": rotations.tolist(),
    "rootOffsets": roots.tolist(),
    "sourceRelativeJoints": (joints - joints[:, :1]).tolist(),
    "bodyContactWeights": contact.tolist(),
    "rawCache": f"Kimodo/{args.input.parent.name}/{args.input.name}",
    "rawSha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
    "sourceHeadingCorrectionDegrees": float(np.degrees(yaw)),
    "corrections": [
        "Kimodo SOMA77 Y-up to Blender Z-up conversion",
        "Standing-heading canonicalization",
        "Constant standing floor; no per-frame foot snapping",
        "Detected stable terminal frame held in retarget data",
    ],
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
print(json.dumps({
    "clip": args.clip,
    "frames": frames,
    "runtimeFrames": settleFrame + 1,
    "durationSeconds": payload["durationSeconds"],
    "floor": floor,
    "headingDegrees": payload["sourceHeadingCorrectionDegrees"],
    "sha256": payload["rawSha256"],
}))
