# Shared soldier death pose repair

The visible NRA and IJA skeletons now blend from its current pose to one relaxed endpoint authored with BlenderMCP. Previously Actor updated only its hidden procedural bones while the visible GLB and right-hand rifle retained the firing pose. Death now takes priority over live animation/aim updates.

- Source: `Model/Character/Model_LugouIja01.glb`, `AdvanceFire` at time 0; canonical IJA variants share this skeleton.
- Editable source: `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/IjaDeathPose_20260911/Scene_IjaDeathPose.blend`.
- Rebuild: load the IJA source rig in that dedicated Blender project and run `_blender/Script_DeathPoseBake.py` through BlenderMCP with `__file__` set to the script path. It writes `Data_DeathPose.mjs`; this contains world rotation deltas against the reference, avoiding changes to existing GLB skin/bind transforms. Runtime normalizes Blender/Three bone names and treats NRA `Bip002` and IJA `Bip001` prefixes as the same anatomical skeleton.
- Runtime: `CharacterModel.BeginDeathPose/PoseDeath` captures the current pose, blends the actual bones, and grounds the visible skin in the existing corpse terrain plane. Final contact correction is cached. Both armies reuse the same endpoint deltas, sampled against each model's own reference clip; no duplicate animation assets are generated.
- Rifle: the existing weapon detaches with world scale preserved, settles on its side, and uses a stable soldier seed to vary side, distance, fore/aft position and yaw. Final bounds include the bayonet and keep the rifle outside the torso. The existing severed-arm weapon handoff retains priority.
- Verification: `Script_ActorPoseTest.mjs` covers the four infantry models of each army plus NRA dare troops and officers, forward/backward falls, weapon scale/contact/separation, relaxed hands, and stable settled poses. Local contact-sheet screenshots are review artifacts only.
