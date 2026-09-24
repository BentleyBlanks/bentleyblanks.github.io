# Speaker faces (first level 01-06)

Every character who speaks on screen in 01-06 has a bone face rig and moves its
mouth with its own lines only. Contract: [01-05 refactor](Data_FirstLevel0105Refactor20260923Contract.md)
section 2 item 4 and section 5.6. Morph targets are not used (MotionVector contract item 12).

## Assets

| Model | Facial skin | Size | Cast (`facialCast` in the manifest) |
| --- | --- | --- | --- |
| NRA02 | `Model_LugouNra02Facial.glb` | 0.70 MB | yaowa, heyoutian, liuwencai, comrade, runner, guard, shouter, zhou, relief, keeper, bearer, captiveHelper, captiveWounded |
| NRA06 | `Model_LugouNra06Facial.glb` | 0.70 MB | interpreter |
| NRA05 | `Model_LugouNra05Facial.glb` | 0.53 MB | luo |
| IJA01 | `Model_LugouIja01Facial.glb` | 0.94 MB | ijaB, ijaC, frontOfficer |
| IJA02 | `Model_LugouIja02Facial.glb` | 1.03 MB | ijaD |
| IJA06 | `Model_LugouIja06Facial.glb` | 1.08 MB | ijaA |

Each facial skin is the shipped body GLB plus 13 `Face_*` joints under the head
(jaw, lower/upper lip, two corners, two brows, four lids, two eyes), new skin weights
on the face, and one indexed oral primitive (cavity/teeth/tongue, colour per vertex,
material `Material_FacialOral`). It carries no textures and no clips:
`Script_CharacterModel.AdoptBaseFacialResources` binds every body surface to the base
GLB's material of the same name (one program, one set of GPU textures) and reuses the
base clips. The NRA05 skin used to embed every texture again (6.35 MB, loaded at boot).

Pinned appearances: `Data_FirstLevelSpeakingCast.mjs` (approved variants only). 日兵乙
moved from IJA03, whose mouth is closed geometry, to IJA01. 日兵甲 wears the standard
IJA06 and the interpreter the cast-only NRA06 (user, 2026-09-24;
[selection](Data_CharacterSelection.md)). Spawn points pass
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

## Face tracks (offline mouth shapes)

The runtime envelope follows loudness, and every whole-cue take has ambience and
gunfire baked in: measured on the 03-06 takes it held the mouth open in 60-85 % of the
silence between lines and opened 2-3 times a second against 3-6 spoken syllables.
Mouth shapes therefore come from the text, baked offline per take.

- Baker: `PYTHONUTF8=1 py -3.13 Taierzhuang1938/Script_FirstLevelFaceTrackBake.py`
  - `--cues all|A,B`: whole-cue takes (today's 01-18 recordings). Each line is aligned
    inside its interval from `Data_FirstLevelMissionVoiceAlignment` with the same whisper
    cross-attention alignment as `Script_FirstLevelVoiceAlign.py` (faster-whisper
    medium, CPU int8, about 1.5 min per cue on a busy machine). Japanese lines are
    aligned against their kana. The raw per-character times are stored in the track
    and reused on the next run (`--realign` forces a new alignment).
  - `--lines [Data_FirstLevelLineTimings.json]`: per-line dry takes from the Voice
    package (`Lines/AudioVoice_FirstLevel<Scene>_<NN>.mp3`, timings keyed by the take's
    sha256, `{lineId, who, lang, chars:[[text, startS, endS]]}`; word entries are split
    evenly into characters, punctuation starts a new phrase).
  - `--prune`: drop tracks whose take is in neither the voice manifest nor the line
    timings. Exit code 2 and a `MISSING` line when a spoken character has no shape.
- Output: `Audio/FirstLevel/Data_FirstLevelFaceTracks.json`, keyed by the sha256 of the
  mp3 (a re-recorded take never plays an old mouth). Per track: `lines [[startMs,
  endMs, who]]`, `keys [tMs, jaw, wide, round, close, ...]` (channels 0-100, the Open /
  Wide / Round / Close pose weights), `stress [tMs]`, `chars [[char, startMs, endMs]]`
  (raw alignment), `stats`.
- Shapes: `Data_FaceTrackPhonemes.mjs`, hand-written (no pinyin package): Han character
  -> toneless Mandarin syllable (Sichuan reading where it changes the mouth: 噻 sai,
  喃 nan) -> initial (b/p/m press the lips, f bites the lower lip, zh/ch/sh/r push
  them out) + final -> vowel shapes a/o/e/i/u/ü; kana -> vowel, with ん/っ/ー and small
  kana. `Script_CharacterSpeechTest` fails when a spoken character is missing.
- Openness: speech-band (250-3500 Hz) energy per syllable after subtracting the noise
  spectrum measured outside the lines. A frame only counts as speech when it is 8 dB
  over that noise and pitched (autocorrelation peak at 80-400 Hz, 7-frame median >= .7):
  gunfire and rumble in the 03-06 takes read .2-.5, vowels .7-.99.
- Fixes on top of the alignment: whisper parks the first word of a shouted line at the
  window start a second or more early (FrontRelief 这, TakeOverGun 何, BorrowLight 兄);
  inside one phrase a silence over 0.45 s is closed by packing the smaller side against
  the larger. Syllables never run past their line's interval (+40 ms).
- Keys: a rest key before and after each line and around pauses over 0.16 s; per
  syllable the onset (closure or consonant), then the vowel shapes of the final (glides
  and tails weaker than the nucleus), scaled by the syllable's loudness; between
  syllables without a closure the jaw dips to 35 % of the next vowel, so each syllable
  is its own opening. Stress: a syllable 1.35 x louder than the take's median and a
  local peak, at least 0.5 s apart. All numbers: `Data_Tuning_CharacterSpeech.FACE_TRACK_BAKE`.
- Runtime: `Script_FaceTrack.mjs` (pure). `LoadFaceTracks()` once (the speaker binder
  starts it in the browser); `SampleFaceTrack(sha256, seconds)` -> `{jaw, wide, round,
  close, stress, line}` with the baker's smoothstep between keys and `stress` a
  triangular pulse 0.16 s wide; `SampleLineFaceTrack(line, seconds)` is the per-line
  player's `faceTrackSampler` (`line.sha256`, else the track baked for `line.id`);
  `FaceTrackSpeech(speech, sha256)` merges the channels into an envelope-only voice
  sample. The binder's `Speech(who)` does that for whole-cue takes by looking the take up
  in the voice manifest (`manifest.cues[cue].sha256`), so faces use the tracks without
  any change to `Script_FirstLevelMissionVoice`.
  When the voice has the per-line player (`voice.dialogue`), the binder also sets its
  `faceTrackSampler = SampleLineFaceTrack` (the player reads that before its envelope).

## Speaker gestures (03-06)

User decision 2026-09-25: the 03-06 speakers only turned the head, nodded on stressed syllables and breathed;
they get hand gestures fitting the line, AAA-FPS style: not every line, commands and pointing first, one hand
off the rifle, nobody gestures while shooting. Status: Step 1 (inventory and design) done; the clips (Step 2) and
the runtime layer (Step 3) are to come, so everything below marked "planned" does not exist in code yet.

### Inventory

The table is data: `Data_FirstLevelSpeakerGestures.mjs` (`FIRST_LEVEL_SPEAKER_GESTURES`, keyed by the per-line
id `<Scene>.<NN>` that `voice.Speech(who).lineId` reports). It lists all 45 lines of the 19 front scenes
(`Script_FirstLevelFrontScenes.FRONT_SCENE_IDS`) that a body speaks (Shunzi is the player, the 06 bearer is a
MissionPeople figure without a skeleton). 22 lines gesture (49 %):

| Line | Who | Posture (expected) | Gesture | Aimed at |
| --- | --- | --- | --- | --- |
| FrontBlockade.01 右边破墙！冒火那个口子！把路封死了！ | zhou | at the left MG | Point L | the right position (`FRONT_SORTIE.nest`) |
| FrontBlockade.02 周哥，顶一下！我们去拿右边！ | luo | crouch | Point L | the right position |
| FrontApproach.02 口子压住了，进！ | luo | crouch | WaveOn L | the gap (`FRONT_SORTIE.gap`) |
| FrontWithdraw.01 压下去了！前头的，下来！往沟里走！ | luo | crouch | Beckon L | listener |
| TakeOverGun.01 何有田，接周哥那边！幺娃，扶他下去！ | luo | crouch | Point L | the left gun (`leftSeat`) |
| TankRoadContact.01 右边路上！战车出来了！ | heyoutian | at the left MG | Point L | the live tank |
| TankTerror.01 下来！莫站枪口上！退后墙！ | luo | crouch | Down L | - |
| BundleOrder.01 外边旧弹药屋还有集束弹！后沟能过去！ | guard | kneel | Point L | the ammo house (`house`) |
| BundleOrder.03 顺子，跟我走后沟，去拿弹！ | luo | crouch | Beckon L | listener |
| BundleGo.02 顺子，下沟！屋在墙后头！ | luo | move | Point L | the ammo house |
| BundleProne.01 低点！上头看得到！ | luo | crouch | Down L | - |
| BundleSupply.01 里头那个箱子！就剩这些！ | keeper | crouch | Point L | the box (`bundle`) |
| BundleAttack.01 就这边！莫上大路！ | luo | crouch | Point L | the attack branch end (`throw`) |
| BundleRetreat.01 回来！低头！ | luo | crouch | Beckon L | listener |
| FrontRelief.02 这里我们接！你们先下！ | relief | stand | WaveOn L | the safe zone (`FRONT_SPACE.safeZone`) |
| Volunteer.01 这里有人接！你们班护着伤员往南…… | runner | crouch | Point L | 30 m due south |
| Volunteer.05 你跟我走前头。何有田、文财看后头…… | luo | stand | Beat L | - |
| BorrowLight.01 兄弟，有火没得？ | zhou | seated, no rifle | Ask R | listener |
| BorrowLight.03 嘴里不是嗦。 | zhou | seated | ToMouth R | - |
| BorrowLight.07 拿去。借你个火，还要搭根烟。 | zhou | seated | Offer R | listener |
| ZhouLift.02 等哈，烟才点起。 | zhou | seated | Halt R | listener |
| ZhouLift.04 催命嗦。 | zhou | seated | Flick R | - |

No gesture on purpose: follow-ups right after the same speaker's gesture (FrontBlockade.03, TakeOverGun.03,
BundleOrder.05, BundleSupply.02, BundleAttack.02, TankStopped.02), questions and short replies (Volunteer.02/.03,
BorrowLight.05/.09), lines said in the middle of a fire fight (FrontAttack.01, TankRoadContact.02, BundleProne.02),
He Youtian's calls from the gun (BundleGo.01, BundleReturnCall.01, TankStopped.01) and Zhou's TakeOverGun.02 at the
gun, Liu Wencai's two reports, and lines said on the move (FrontApproach.01, BundleReturnCall.02, FrontRelief.03).
In the front scenes nobody gestures on two of his own lines in a row; the seated 06 cigarette talk is the one
exception (a conversation carried by the hands). Postures are read from the 2026-09-24 code (Luo and the keeper
crouch at stance 1, the faced guard kneels at `guardWaitStance`, He and Zhou man the emplacement, the 06 Zhou
sits on the box with `lifePose.sit` and no visible weapon); Step 3 measures them in the browser.

Not in the table: SupportOrder (03 start) is played and acted by the 01-03 storyboard director, which keeps its own
gestures; the leader guide reminders (Guide*) and squad barks are repeated calls, not dialogue.

### Rigs and clip sources

| Speaker | Model | Clips from |
| --- | --- | --- |
| luo | LugouNra05 (Bip002) | LugouNra05 |
| zhou, heyoutian, liuwencai, guard, keeper, relief, runner | LugouNra02 (Bip002) | LugouNra02 |

The source is `rig.clipModelId || rig.modelId` (`CHARACTER_CLIP_SOURCE_BY_MODEL`: NRA06 -> NRA02, IJA06 -> IJA02;
neither speaks in 03-06). Two rigs therefore need the gesture clips.

What exists and why it is not reused as is:
- The 01-02 opening library (`Animation/OpeningStoryboards`) has `PointBlockade`, `MessengerReport` and
  `InterpreterPoint` (0922 legacy, 3 s loops, whole-body keyed, one-hand-right or free) on both rigs. The director
  plays `PointBlockade` as an upper-body overlay for Luo in 01-03. They are held poses rather than
  lift-stroke-release gestures, they are keyed on the right arm (the rifle hand in 03-06), and loading the opening
  library for them costs 6.6 MB (NRA02) + 3.8 MB (NRA05) of JSON at 03-06. That library belongs to the storyboard
  session; the gesture package does not change it.
- The base GLB clips (`AdvanceFire`, `CrouchIdle`, `AttackCommand` = standReach, `LeanWallSitPeek` = sit) and the
  NRA02 infantry clips (`RifleCrouchAdvance`, `StandToKneel`, `KneelHold`, `KneelToStand`, `GrenadeThrow`) are body
  poses, not gestures. `AttackCommand` is the whole-body clip the actor plays for reaching, throwing and
  binoculars (standReach).
- The officer "point" clip that Report_ai.md:201 found missing is for the Japanese front officer (IJA01), who has
  no line in 03-06; this package does not make it.

Planned (Step 2): ten new clips, each baked on LugouNra02 and LugouNra05 through the opening pipeline's importer,
two-bone IK and original-local-frame exporter (`_import/Script_MachineGunCaptivesBake.py`, the same route as
`_import/Script_OpeningStoryboardBake.py`) in a new bake script; the opening scripts stay untouched. Clip specs
(hand, duration, lift / stroke / hold / release windows, whether the arm is aimed) are in
`SPEAKER_GESTURE_CLIPS`:

| Clip | Hand | s | Used for |
| --- | --- | --- | --- |
| GesturePointL | L | 1.8 | point at a place (aimed) |
| GestureWaveOnL | L | 1.6 | go / move up that way (aimed) |
| GestureBeckonL | L | 1.8 | come here / follow me |
| GestureDownL | L | 1.4 | get down / keep low |
| GestureBeatL | L | 1.6 | assigning, explaining |
| GestureAskR | R | 1.6 | asking for something, palm up (aimed at the listener) |
| GestureToMouthR | R | 1.8 | fingers to the cigarette at the lips |
| GestureOfferR | R | 2.2 | handing something over (aimed at the listener) |
| GestureHaltR | R | 1.4 | wait, palm up |
| GestureFlickR | R | 1.2 | annoyed back-hand flick |

Output (planned): `Animation/SpeakerGestures/Data_SpeakerGesturesAnimation.json` (clip windows, masks, per-rig
file hashes) and `Animation_Lugou{Nra02,Nra05}SpeakerGestures.json`. Only the moved bones are stored (one arm's
clavicle, upper arm, forearm, hand and fingers plus Spine/Spine1/Spine2 for a small lean; quaternions only),
so the two files together should stay well under 1 MB; they load when the first gesture layer is created, that is
only in the 01-06 steps, never at boot.

### Runtime (planned, Step 3)

- `Script_SpeakerGestureLayer.mjs`, owned by `SpeakerHeadLayer` (one per rig the speaker binder binds with a
  head, so it exists exactly where the head layer does: the 01-06 steps, `FIRST_LEVEL_FACE_STEPS`). Runs inside
  `SpeakerHeadLayer.Apply`, before the head turn; the face (`facial.Update`) still runs after both. The binder,
  the front scene player and the dialogue player are not changed.
- Which line: the rig's face already knows it. `rig.facial.lastSpeech` is the voice sample the mouth played last
  frame: `{ active, who, lineId, cue, sourceTime, stress }` from `Script_DialoguePlayer.Speech`. A new `lineId`
  with a row in the table starts that gesture; `sourceTime` is the line clock. Whole-cue takes (no lineId) never
  gesture.
- Masks: the gesture arm's clavicle, upper arm, forearm, hand and fingers are set to the clip's local rotations,
  slerped from the pose the body mixer produced by the layer weight; Spine/Spine1/Spine2 get the clip's delta from
  its first frame as an additive (at most a few degrees of lean). Neck, head and `Face_*` are never written: the
  head layer turns the head after the arm and the face layer runs last. Local arm rotations are relative to the
  chest, so one clip reads the same on a standing, crouching, kneeling or seated body. Every written bone is put
  back before the next mixer sample (the head layer's restore pattern).
- Weight: rises over the clip's `inS` window, 1 through the stroke and hold, falls over the release window back to
  whatever the base pose does with that arm (hand back on the fore-end, hand on the knee). If the line is longer
  than the clip, the hold window repeats until the line ends; when the line ends early (or is cut), the release
  starts at once. The stroke is lined up with the line's first stressed syllable (the face track's stress event)
  when it comes within the first second, otherwise the clip starts with the line. During the hold every further
  stress adds a small beat (forearm dip), the arm's version of the head nod.
- Aim: for `aim` clips the upper arm is turned (after the clip is applied) so that shoulder -> hand points at the
  target, limited to a cone in front of the chest (left hand: about 100 degrees to the left, 40 to the right,
  pitch -30..+35; numbers in `Data_Tuning_CharacterSpeech.SPEAKER_GESTURE`); outside the cone the direction is
  clamped to the cone edge. Targets: `FRONT_SORTIE` / `FRONT_SPACE` anchors from `Data_FirstLevelFrontRoute`,
  `listener` (the head layer's look target: the player or the nearest talker), `south`, and `tank`, which needs a
  one-line provider from the mission runtime (the live tank position); without it the tank point falls back to
  the gesture's unaimed direction.
- Rifle: the weapon hangs on the right grip and aims at the left grip socket
  (`Script_Actor._UpdateRiggedWeaponMount`). Before a left-hand gesture moves the arm, the layer stores the left
  grip's world position for this frame; the actor's mount reads it instead of the moved socket (a thin hook in
  `Script_Actor`), so the rifle stays where the two-hand pose put it and the right hand keeps holding it. NRA02
  bodies on an infantry clip place the rifle from its prop track (`_UpdateInfantryProps`), which the arm does not
  touch. Right-hand gestures only run on a body with no visible weapon (the seated 06 Zhou).
- No gesture (weight falls to 0 over 0.15 s, the head layer keeps acting): firing or `fire > 0`, `aim > .6`,
  melee, carrying (`carryRole`), wounded walk, prone, dead or ragdoll, running faster than a walk, a machine-gun
  holder or emplacement gunner while he shoots, and any rig the 01-03 storyboard director acts
  (`openingActorPerformanceState` or an `openingStoryboardPose`), exactly like the head layer.
- Switch: `SPEAKER_GESTURE.enabled` in the tuning table; the layer exists only while the binder is active (01-06),
  so 07 and later are unaffected.
- Probe state (for FRONT_ACTING and tests): `rig.speakerGesture.state = { clip, lineId, weight, t, aimError,
  suppressed }` and counters `gestureFrames` (frames with weight > .5) per line id. The front acting sample
  (`Script_FirstLevelCampaignOpening.InstallSpeakerActing`, owned by the Front package) can read it next to the
  head layer's `speaking`.

### Validation (planned, Step 3)

A new `Script_SpeakerGestureTest.mjs` (pure node: table covers every 03-06 embodied line, clips and windows
valid, targets resolve, masks never include neck/head/Face bones, weights and suppression on a stub rig) and a
browser test on the production rigs (six or more lines including a point, a beckon, a one-hand-on-rifle gesture
and the seated 06 Zhou's offer): weight > .5 for enough frames while the line plays, 0 while firing, back to 0
after the line; no hand inside the torso or the rifle; the rifle's direction unchanged by a left-hand gesture;
first-person and close-up screenshots looked at. Frame cost: 04 front, same-page alternating A/B with the layer
on/off, p95 increase <= 0.3 ms.

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
   IJA06 (reshaped IJA02 head, same topology) is authored on its own shipped GLB
   (`'model': 'Ija06'`, source `Characters_20260924/Animation_Ija06FacialTalk.blend`);
   rebuild `Model_LugouIja06.glb` first when the base changes. NRA06 (the interpreter,
   reshaped NRA02 head, same topology) likewise: `'model': 'Nra06'`, source
   `Characters_20260924/Animation_Nra06FacialTalk.blend`, after `_import/Script_BuildLugouNra06.py`
   (`NRA06_BUILD`). Its spec adds `buckTooth`: one long upper incisor, head-rigid like
   the upper row, from behind the upper lip to 1.2 mm in front of the lower lip, so it
   shows with the lips together and fully when the jaw opens. The spectacles live in the
   base GLB (badge primitive, head bone only); the nearest face vertex stays 3.4 mm away
   from them in all nine poses (measured in the authoring scene).
   The baker's legacy job reproduces the 2026-09-13 NRA05 file byte for byte.
4. Put the new sha256 prefix in `facialVersion` (manifest) and run the tests below.
5. `node scripts/Script_BlenderMcp.mjs stop`

## Validation

- `Script_CharacterSpeechTest.mjs`: envelope, voice clock, speaker isolation; facial
  GLB contracts (13 bones, 9 poses, masks, shared materials by name, <= 1.5 MB,
  version = file hash); pinned cast vs `facialCast` and the approved list; controller
  (additive shapes, closure, stress-only brows, fallback, release, DeadSlack, gaze,
  seeded blinks); binder (isolation, listener gaze, release on death/dispose); face
  tracks (lip-shape tables cover every spoken character and kana; sampler semantics;
  per-line hook; every recorded take has a track keyed by its sha256 with the aligned
  line intervals; 01-06 takes articulate on >= 80 % of speech frames, every take >= 70 %,
  all takes together >= 95 %; open on <= 10 % of the silence between lines per take,
  <= 2 % overall).
- `Script_CharacterSpeechBrowserTest.mjs`: live Luo speaks his own line while Yaowa
  (listener) keeps a closed mouth and looks at him; pause/replay; castId creations get
  the right facial skin, never pooled; close-ups of all four skins at 0.75-1.2 m through
  the production chain; motion vectors at the mouth (moving jaw > 0.5 px, still 0);
  TakeOverGun (03-05 take, Luo and Zhou alternate) on its face track: each face follows
  the track on >= 80 % of articulating frames, opens >= 2 times a second, is shut
  between lines and while the other one talks; the same take on the envelope is
  recorded next to it for comparison, with close-ups of both faces mid-word.
  Evidence: `_shots/CharacterSpeech`.
- Shared gates: `Script_MotionVectorContractTest`, `Script_SamplerBudgetTest`,
  `Script_AssetStandardsTest`, `Script_CharacterModelTest`.
