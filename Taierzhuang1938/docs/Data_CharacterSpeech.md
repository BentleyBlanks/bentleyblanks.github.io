# Speaker faces (first level 01-06)

Every character who speaks on screen in 01-06 has a bone face rig and moves its
mouth with its own lines only. Contract: [01-05 refactor](Data_FirstLevel0105Refactor20260923Contract.md)
section 2 item 4 and section 5.6. Morph targets are not used (MotionVector contract item 12).

## Assets

| Model | Facial skin | Size | Cast (`facialCast` in the manifest) |
| --- | --- | --- | --- |
| NRA02 | `Model_LugouNra02Facial.glb` | 0.70 MB | yaowa, heyoutian, liuwencai, comrade, runner, guard, shouter, interpreter, zhou, relief, keeper, bearer, captiveHelper, captiveWounded |
| NRA05 | `Model_LugouNra05Facial.glb` | 0.53 MB | luo |
| IJA01 | `Model_LugouIja01Facial.glb` | 0.94 MB | ijaB, ijaC, frontOfficer |
| IJA02 | `Model_LugouIja02Facial.glb` | 1.03 MB | ijaA, ijaD |

Each facial skin is the shipped body GLB plus 13 `Face_*` joints under the head
(jaw, lower/upper lip, two corners, two brows, four lids, two eyes), new skin weights
on the face, and one indexed oral primitive (cavity/teeth/tongue, colour per vertex,
material `Material_FacialOral`). It carries no textures and no clips:
`Script_CharacterModel.AdoptBaseFacialResources` binds every body surface to the base
GLB's material of the same name (one program, one set of GPU textures) and reuses the
base clips. The NRA05 skin used to embed every texture again (6.35 MB, loaded at boot).

Pinned appearances: `Data_FirstLevelSpeakingCast.mjs` (approved variants only). 日兵乙
moved from IJA03, whose mouth is closed geometry, to IJA01. Spawn points pass
`SpeakingCastOptions(role)`; a castId in any `facialCast` never takes a pooled body.

## Poses and conventions

All bones and poses are in the GLB head frame (Biped: X up, Y forward, Z to the
character's left; centimetres), the convention of the reviewed 2026-09-13 NRA05 rig.
Poses (`extras.facialRig.poses`): Rest, Open, Wide, Round, Close, Blink, BrowUp, Snarl,
DeadSlack. A pose only moves its own bones (Blink never opens the jaw, Open never lifts
the brows). `extras.facialRig.eyes` names the eye bones and their yaw/pitch axes.

## Runtime

- `Script_CharacterFacialAnimation`: additive blend of pose deltas from Rest:
  jaw*Open + wide*Wide + round*Round + close*Close + blink*Blink + brow*BrowUp
  (+ Snarl, DeadSlack). Input is a baked face track sample `{jaw, wide, round, close,
  stress}`; without one it falls back to the runtime envelope `{level, brightness}`.
  Brows lift only on stress events; blinks follow a per-actor seeded rhythm (2.5-6 s)
  plus line starts and after stress; eyes look at the attention target with small
  saccades; silent mouths stay closed with a slow breathing drift; death drops into
  DeadSlack (`LugouCharacterRig.PoseDeath`). Numbers: `Data_Tuning_CharacterSpeech.mjs`.
- `Script_SpeakerHeadLayer`: head/neck turn toward the attention target and nod on
  stressed syllables, for every rig the binder owns. The 01-03 storyboard director
  (`Script_OpeningActorPerformance`) uses the same look math and, for faces, the same
  stress events instead of a synthetic beat.
- `Script_FirstLevelSpeakerBinder`: who is talking -> which body. `ActorForWho(who)`,
  `ActorFor(sceneId, lineId)` (`<Scene>.<NN>` ids), `HeadPosition(cue, line)` (the
  runtime's `VoicePosition` asks it first, so the voice comes from the mouth that
  moves). Every resolved face gets `facial.source = () => voice.Speech(who)`; talkers
  look at the listener (player), listeners look at the nearest talker; faces are
  released on death, removal or recasting.
- `Script_OpeningStoryboardAnimation` excludes `Face_*` bones from its pose blending.

## Rebuilding

Blender sources: `OneDrive/AI/Models/Blender/Taierzhuang1938/FacialRigs_20260923/`
(`Animation_{Nra02,Ija02,Nra05}FacialTalk.blend`; NRA05 is the reviewed 2026-09-13
scene plus eye bones, the four added poses and one-segment tooth bevels).

1. `node scripts/Script_BlenderMcp.mjs start --task FacialRigs`
2. Author (NRA02/IJA02): exec a wrapper that sets
   `FACIAL_AUTHOR = {'repo': <worktree>, 'model': 'Nra02', 'save': <blend path>, 'preview': <png dir>}`
   and runs `_import/Script_AuthorCharacterFacial.py`. Weights are procedural functions
   of Head-local position around the measured lip loop, corners and eyeballs; sealed
   lips are cut along the upper/lower-lip seam (IJA heads); the IJA head's own loose
   mouth pieces are dropped (its dark mouth tube stays). NRA05: `FACIAL_UPGRADE_NRA05`
   on the opened reviewed file.
3. Bake: `FACIAL_BAKE = {'repo': <worktree>, 'model': 'Nra02'|'Ija02'|'Ija01'|'Nra05'}`
   with the same script (job table `BakeJobs`); it calls `_import/Script_BakeCharacterFacial.py`.
   IJA01 is carried from the IJA02 scene (same head mesh, vertex order and triangles).
   The baker's legacy job reproduces the 2026-09-13 NRA05 file byte for byte.
4. Put the new sha256 prefix in `facialVersion` (manifest) and run the tests below.
5. `node scripts/Script_BlenderMcp.mjs stop`

## Validation

- `Script_CharacterSpeechTest.mjs`: envelope, voice clock, speaker isolation; facial
  GLB contracts (13 bones, 9 poses, masks, shared materials by name, <= 1.5 MB,
  version = file hash); pinned cast vs `facialCast` and the approved list; controller
  (additive shapes, closure, stress-only brows, fallback, release, DeadSlack, gaze,
  seeded blinks); binder (isolation, listener gaze, release on death/dispose).
- `Script_CharacterSpeechBrowserTest.mjs`: live Luo speaks his own line while Yaowa
  (listener) keeps a closed mouth and looks at him; pause/replay; castId creations get
  the right facial skin, never pooled; close-ups of all four skins at 0.75-1.2 m through
  the production chain; motion vectors at the mouth (moving jaw > 0.5 px, still 0).
  Evidence: `_shots/CharacterSpeech`.
- Shared gates: `Script_MotionVectorContractTest`, `Script_SamplerBudgetTest`,
  `Script_AssetStandardsTest`, `Script_CharacterModelTest`.
