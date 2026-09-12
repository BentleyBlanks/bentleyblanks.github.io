# First-stage carriage performances

Scope: the approved first dialogue version, the sudden barrage, Luo's failed
first stand, recovery and helping the protagonist up. This set adds 10 motions,
13 rig-bound clips, exclusively for this opening. NRA02 and NRA05 retain their
original visible meshes, skin weights, inverse binds and bone hierarchy.

Authoring: Blender 5.2 through the installed BlenderMCP CLI executor
`blmcp.tools_helpers.blender_cli.run_blender_cli`. The desktop MCP CLI wrapper
timed out; direct invocation of that same installed executor succeeded.
`_import/Script_FirstLevelCarriageAnimationBake.py` reconstructs the actions and
the production-node local samples. Original Blender bone frames are converted
back to the source GLB frames before export; the runtime never imports a new rig.
Run from the repository root, or set `CARRIAGE_PROJECT` to the absolute
`Taierzhuang1938` project directory before executing the script.

Editable originals are in
`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/CarriageOpeningDialogue/`:
`Scene_LugouNra02CarriageOpening.blend` and
`Scene_LugouNra05CarriageOpening.blend`. They contain the selected character,
editable actions, muted NLA copies, a floor/wall and a review camera. Scene
renders and numeric review reports stay local, outside the published asset set.

| Motion | Target | Seconds | Playback |
| --- | --- | ---: | --- |
| WallStandIdle | NRA02, NRA05 | 4.0 | Loop |
| WallCrouchIdle | NRA02, NRA05 | 4.0 | Loop |
| AlarmDropCrouch | NRA02, NRA05 | 0.8 | Once; reverse for ordinary exit rise |
| LiuCountTalk | NRA02 | 4.5 | Loop while Liu speaks |
| HeReplyTalk | NRA02 | 4.0 | Loop while He speaks |
| YaowaAlarmCrouch | NRA02 | 3.0 | Loop while Yaowa calls out |
| LuoBriefing | NRA05 | 5.0 | Loop while Luo briefs the squad |
| LuoCrouchReassure | NRA05 | 4.5 | Loop while Luo reassures the squad |
| LuoStaggerRecover | NRA05 | 4.8 | Once; first rise fails, stable by 4.35 s |
| LuoHelpUp | NRA05 | 4.4 | Once; reach, grasp, pull, support |

The source feet were measured from Foot-to-Toe head positions in Blender:
forward Blender -Y, hence source glTF +Z. CharacterModel's existing PI yaw
maps this to actor local -Z. The wall lies behind the actor at local +Z.
Original-skin bounds put NRA02's idle rear surface at 0.268–0.270 source metres
(about 0.246 m at the 1.66 m nominal gameplay height). The physical actor stays
inside its capsule clearance; the carriage adapter owns the small visual
wall offset, and restores it before the next normal mixer update.

The runtime samples original bone positions/quaternions at 24 authored samples
per second, interpolates short clip changes, and compares original shoe vertices
with the moving deck. Neither sampling nor floor support writes the Soldier or
Actor world transform. The normal skinned motion-vector pipeline therefore sees
these actual bone changes. CPU skin probes use `updateMatrixWorld(true)` to
refresh `SkinnedMesh.bindMatrixInverse` before measuring; `updateWorldMatrix`
bypasses that override and must not replace it. The low-to-walk blend also keeps
the interpolated shoe surface above the deck at fractional pose weights.
`Script_FirstLevelCarriageAnimationTest.mjs` checks
all 13 clips on their original skins, -Z facing, whole-skin floor support, the
failed stand, original actor-root preservation and exact transform restoration;
its PNG contact sheet remains in ignored `_shots/CarriageAnimation/`.
