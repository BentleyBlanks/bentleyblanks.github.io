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
off the rifle, nobody gestures while shooting. Status: Step 1 (inventory and design), Step 2 (the clips) and
Step 3 (the runtime layer on the 03-06 lines, the live test) done.

### Inventory

The table is data: `Data_FirstLevelSpeakerGestures.mjs` (`FIRST_LEVEL_SPEAKER_GESTURES`, keyed by the per-line
id `<Scene>.<NN>` that `voice.Speech(who).lineId` reports). It lists all 45 lines of the 19 front scenes
(`Script_FirstLevelFrontScenes.FRONT_SCENE_IDS`) that a body speaks (Shunzi is the player, the 06 bearer is a
MissionPeople figure without a skeleton). 21 lines gesture (47 %; 2026-09-25 review round: three rows the runtime
refused every time were changed, see below the table):

| Line | Who | Posture (expected) | Gesture | Aimed at |
| --- | --- | --- | --- | --- |
| FrontBlockade.02 周哥，顶一下！我们去拿右边！ | luo | crouch | Point L | the right position (`FRONT_SORTIE.nest`) |
| FrontApproach.02 口子压住了，进！ | luo | crouch | WaveOn L | the gap (`FRONT_SORTIE.gap`) |
| FrontWithdraw.01 压下去了！前头的，下来！往沟里走！ | luo | crouch | Beckon L | listener |
| TakeOverGun.01 何有田，接周哥那边！幺娃，扶他下去！ | luo | crouch | Beat L | - |
| TankRoadContact.01 右边路上！战车出来了！ | heyoutian | at the left MG | Point L | the live tank (refused in the current layout, see below) |
| TankTerror.01 下来！莫站枪口上！退后墙！ | luo | crouch | Down L | - |
| BundleOrder.01 外边旧弹药屋还有集束弹！后沟能过去！ | guard | kneel | Beat L | - |
| BundleOrder.03 顺子，跟我走后沟，去拿弹！ | luo | crouch | Beckon L | listener |
| BundleGo.02 顺子，下沟！屋在墙后头！ | luo | move | Point L | the ammo house |
| BundleProne.01 低点！上头看得到！ | luo | crouch | Down L | - |
| BundleSupply.01 里头那个箱子！就剩这些！ | keeper | crouch | Point L | the box (`bundle`, .3 m over the floor) |
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

Changed on the 2026-09-25 review (the browser test showed the runtime refusing them every time, so the table
promised gestures the game never made): FrontBlockade.01 has no gesture (Zhou says it wounded, and a wounded arm is
never lifted); TakeOverGun.01 and BundleOrder.01 point at targets behind the speaker in the current Front layout (the
left gun behind Luo, the ammunition house behind the guard's shoulder), so they are an unaimed assigning beat
instead. TankRoadContact.01 keeps its point at the live tank: the tank comes out on He Youtian's right, his rifle
side, about 33 deg past the arm's cone, and the clamped arm lifted over the barrel read as a salute, so the runtime
refuses it there (`targetAcrossRifle`, below) and makes it only when the tank is in reach. If that line must show a
point in the current layout, the Front package has to turn He toward the road (not this package's files).

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

Baked (Step 2, 2026-09-25): ten clips on LugouNra02 and LugouNra05 by `_import/Script_SpeakerGestureBake.py`, which
reuses the captives baker's production-rig importer, two-bone IK, palm turn and finger curl
(`_import/Script_MachineGunCaptivesBake.py`, the same route as `_import/Script_OpeningStoryboardBake.py`; the
opening scripts are untouched). Clip specs (hand, duration, lift / stroke / hold / release windows, whether the
arm is aimed, `reach`) are in `SPEAKER_GESTURE_CLIPS`; the bake keeps the same table and the node test compares
them:

| Clip | Hand | s | Used for |
| --- | --- | --- | --- |
| GesturePointL | L | 1.8 | point at a place (aimed): arm out at shoulder height 25 deg left, index out, overshoot and settle |
| GestureWaveOnL | L | 1.6 | go / move up that way (aimed): flat hand up beside the head, chopped forward twice (stroke 0.48 s) |
| GestureBeckonL | L | 1.8 | come here / follow me: palm up out in front, forearm swung back to the chest twice |
| GestureDownL | L | 1.4 | get down / keep low: palm down at chest height, pushed down twice |
| GestureBeatL | L | 1.6 | assigning, explaining: open hand half raised, two small down beats |
| GestureAskR | R | 1.6 | asking for something, palm up (aimed at the listener) |
| GestureToMouthR | R | 1.8 | fingers to the cigarette at the lips (reach: `mouth`) |
| GestureOfferR | R | 2.2 | handing something over (aimed at the listener) |
| GestureHaltR | R | 1.4 | wait: palm raised toward the listener |
| GestureFlickR | R | 1.2 | annoyed back-hand flick out to the side |

How they are authored: keys are real metres from the gesture side's rest shoulder in the body frame (out, forward,
up) on an upright stance; the wrist targets stay inside 94 % of the arm (0.455-0.458 m on both rigs), so the elbow
never locks. Palm orientations are keyed as (fingers, palm normal) and interpolated as one quaternion (component
interpolation of the two vectors flipped the hand when the palm turned over); half of the hand's roll goes to the
forearm (pronation). Keys are monotone cubic (PCHIP); each hold window's two ends are the same key, so it loops
without a seam. 30 fps, so every clip length and window is a whole frame. An L clip starts and ends on the
rifleman's fore-end hand, an R clip on a hand resting forward-low (the knee of a seated man); the layer weight is 0
there, so these only shape the lift and the release.

Output: `Animation/SpeakerGestures/Data_SpeakerGesturesAnimation.json` (version `20260925SpeakerGesturesV1` =
`SPEAKER_GESTURE_ASSET.version`; the clip table, per-rig file hashes, the shipped GLB's hash and the bake's
validation numbers) and `Animation_Lugou{Nra02,Nra05}SpeakerGestures.json` (per clip: its bone list, glTF
node-local rotations x y z w per frame, `strokeDir` = shoulder -> hand at the stroke in the three.js actor frame;
per rig: `anchors`). Only the gesture arm (clavicle, upper arm, forearm, hand, 15 finger bones) and
Spine/Spine1/Spine2 are stored, rotations only: 337 KB per rig raw, 55 KB gzip, 0.68 MB for both. Nothing loads at
boot: `Script_SpeakerGestureClips.LoadSpeakerGestureClips()` fetches them on first use (the Step 3 layer, 01-06
only). The same module has the sampler (`SampleSpeakerGesture`, slerp between the two nearest frames;
`SpeakerGestureFirstFrame` for the spine reference), `BindSpeakerGestureBones` (bones by normalized name:
GLTFLoader turns "Bip002 L UpperArm" into "Bip002_L_UpperArm") and the reach helpers below.

Reach (`GestureToMouthR`): on the real seated body (`lifePose.sit` plays `LeanWallSitPeek`: hunched, head turned
about 40 deg to his left) a chest-relative hand lands on the cheek, and the head layer turns the head again toward
the listener. So each rig's file carries `anchors.mouth`: where the grip (finger-root centroid, the point the
runtime grips with) and the hand's rotation were at the stroke, in the head bone's glTF node frame.
`ReachSpeakerGestureAnchor(upper, fore, hand, fingerRoots, head, anchor, weight)` turns the hand to that rotation
relative to the live head and reaches the arm (two-bone, keeping the arm's bend plane) so the grip lands there;
two passes. It must run after the head layer has turned the head (Step 3 ordering).

Bake numbers (`validation` in the manifest, gated by `Script_SpeakerGestureTest`): largest per-frame step of any
exported bone 31 deg at 30 fps (the WaveOn chop; gate 35), hold seam <= 1.8 deg (gate 3), elbow bend 28-143 deg
(gate 20-150), deepest forearm/hand/finger vertex inside the torso skin on the upright body 1.8 cm (NRA02 cloth;
gate 2), cigarette-clip finger roots 5.7 cm from the lip centre (gate 7). Browser review on the production rigs
(`Script_SpeakerGestureClipsBrowserTest`, each clip at weight 1 over the body the speaker actually has: L clips on
a crouching rifleman holding the HanYang, R clips on the seated sit clip without a weapon): all 20 clip x rig runs
finite; arm into torso <= 2.4 cm (gate 2.5), into the head 0 except the cigarette fingers on the lips 2.1-2.3 cm
(gate 4.5; other clips 3); left arm to the rifle >= 23 cm during stroke and hold (the rifle stays where the
two-hand pose put it; gate 1 cm). Screenshots (front, gesture side, 45 deg top, listener's view) were looked at.
Editable scenes: `OneDrive/AI/Models/Blender/Taierzhuang1938/SpeakerGestures_20260925/Scene_Lugou{Nra02,Nra05}SpeakerGestures.blend`.

### Runtime (Step 3, 2026-09-25)

- `Script_SpeakerGestureLayer.mjs`, owned by `SpeakerHeadLayer` (`rig.speakerGesture`, created and disposed with
  the head layer). The speaker binder only makes head layers in the 01-06 steps (`FIRST_LEVEL_FACE_STEPS`), so
  07 and later have no gesture layer at all (checked by the live test: 0 layers after a jump to 08). The binder,
  the front scene player and the dialogue player are not changed.
- Which line: `rig.facial.lastSpeech` (the voice sample the mouth played last frame: `{ active, who, lineId,
  cue, sourceTime, stress }` from `Script_DialoguePlayer.Speech`). A new `lineId` with a row in the table starts
  that gesture; whole-cue takes (no lineId) never gesture. A body that is off screen is not animated
  (`Script_Ai.CullActors`), so its gesture starts when it comes into view, and only if its line is still being
  said.
- Order inside `SpeakerHeadLayer.Apply`: `gesture.Apply` (restore last frame's bones, advance the clip, set the
  arm's local rotations slerped from the body mixer's pose by the weight, spine additive, remember the rifle's
  left grip) -> the head turn -> `gesture.AfterHead` (aim at the target, the beat, the reach to the mouth). The
  aim runs after the head turn because the Biped clavicles hang off the neck: measured before it, the point was
  15-37 deg off on screen. The face (`facial.Update`) runs last.
- Masks: the gesture arm's clavicle, upper arm, forearm, hand and fingers, and Spine/Spine1/Spine2 as a small
  additive. Neck, head and `Face_*` are never written. Every written bone is put back at the next Apply.
- Weight and timing: rises over `inS`, 1 through the stroke and hold, falls over the release. The lifted arm
  waits up to `stressWaitS` of line time for the first stressed syllable, then strikes; a line longer than the
  clip repeats the hold (at most `maxHoldS`); each further stress in the hold dips the forearm (`beatRadians`).
  Line over: the clip plays to its release when that is close (`maxTailS`), otherwise the arm eases back over
  `releaseS`. A new line of the same body while the last gesture is up: the old one eases back first.
- Aim (`aim` clips): the upper arm is turned from the clip's stroke direction to the target, then (from the
  stroke on) the rest of the error is taken out, and `GesturePointL` (`extend: .9`) is also straightened along
  the aim: the baked point is a bent arm out to the side, which turned to a target in front read as a forearm
  across the chest. Cone around the body's front: out 100 deg, in 40 deg, pitch -30..+35. A man with a rifle up in
  the other hand who points across his front raises the point to at least `crossLiftDeg` (15 deg) so the arm goes
  over the barrel (at 0 lift the hand lay 3.7 cm from it). A target more than `maxOutOfConeDeg` (45 deg) outside
  the cone is not pointed at (suppressed `targetOutOfReach`): the 04 guard's ammunition house is behind his
  shoulder, and a clamped arm pointed 90 deg away from it. With a rifle up in the other hand the limit across the
  front is `maxCrossOutDeg` (20 deg past the `in` edge; suppressed `targetAcrossRifle`): He Youtian's point at the
  tank on his rifle side, clamped and lifted, ended as a hand in front of his cap brim. A point that would lie
  within `alongRifleDeg` (25 deg) of the rifle held up in the other hand is moved `alongLiftDeg` (18 deg) off the
  barrel line, up (down when the target is below the barrel), so it does not read as a second man aiming
  (`state.alongLift`); the 05 box is pointed at `pointRiseByTarget.ammoBox` (.3 m) over the floor, not man-high.
  Targets: `FRONT_SORTIE` / `FRONT_SPACE` anchors,
  `listener` (the head layer's look target, `listenerDropM` below the eye: a hand held out goes to the other man's
  chest, not above the seated Zhou's head), `south`, and `tank` from the mission runtime's provider
  (`SetSpeakerGestureWorld`, one line in `Script_FirstLevelMissionRuntime`).
- Rifle: a left-hand gesture on a two-handed weapon remembers where the left grip was before the arm moved, in the
  right grip's frame; `Script_Actor._UpdateRiggedWeaponMount` asks `HeldLeftGrip()` for it instead of the moved
  socket (hook 1), so the rifle keeps its direction in the right hand. The actor's aim IK
  (`_ApplyRiggedAim`) solves both arms onto the rifle afterwards; `ArmWeight(upperArm)` tells it how much of the
  gesturing arm to give back to the gesture, and `AfterActorAim()` runs once its arms are solved (hook 2), so the
  aim correction turns the right arm and the rifle only. An arm with `ArmWeight` over .5 also takes no part in the
  IK's reach shift (it neither triggers nor receives the shift of the grip pair), so a stretched pointing arm
  cannot drag the rifle hand. Both hooks read `rig.speakerGesture`, which is null outside 01-06: 07+ behaviour is
  unchanged. Hook 3 is the one line `SetSpeakerGestureWorld` in the mission runtime's constructor (tank position
  and ground height), cleared with `SetSpeakerGestureWorld({})` in its Dispose. The rifle stays where the two-hand pose put it (a crouched advance
  carries it across the chest), so the gesturing wrist and finger roots are kept `rifleClearM` (7 cm) off the
  barrel line by turning the arm about the shoulder (`_ClearRifle`): after the head turn against this frame's
  rifle prop helper, and again in `AfterActorAim` against where the aim IK really left the rifle (a point and a
  WaveOn chop ended 2.5-3.7 cm from it before). Right-hand clips only run on a body with no visible weapon (the
  seated 06 Zhou); otherwise suppressed `rightHandOnWeapon`.
- Busy (weight to 0 over `fadeS`, the head layer keeps acting): firing, melee, throwing, carrying, wounded walk,
  prone, dead/ragdoll, a forced clip, faster than `maxMoveSpeed` (.6 = 2.5 m/s: the squad says its 03-05 lines at
  a crouched walk, .51; a jog or a run does not gesture), the 01-03 storyboard director. "Aiming" means a
  shooting run (aim > `maxAim` and a shot within `aimQuietS`): the 03-05 front AI holds aim 1 through the whole
  fight and fires about once in 3 s, so a shouldered rifle alone does not stop a gesture (it stopped nearly every
  04 gesture before). A shot while the arm is up ends that gesture (no comeback after the shot); a body busy when
  its line starts waits unlifted and gestures once free, while the line lasts (`waitFree`, else `missed`).
- Clips: fetched when the first 01-06 speaker layer is built. A line whose clips are still on the way (a cold start
  at 03) keeps its gesture pending and starts it once they are in, while the line lasts; a failed fetch is tried
  again by the next line.
- Switch: `SPEAKER_GESTURE.enabled`, or `rig.speakerGesture.enabled = false` per body.
- Probe state (FRONT_ACTING, tests): `rig.speakerGesture.state = { clip, lineId, weight, t, phase, hand,
  aimError, solveError, aimDir, clamped, alongLift, suppressed, busyFor, reachError, rifleLift }` (`aimError`:
  shoulder -> hand against the target; `solveError` against the direction aimed at after the cone and rifle
  rules; `phase`: lift, wait, hold, out, release, waitFree,
  cancelled, missed, done); `rig.speakerGesture.lines[lineId] = { frames, gestureFrames, busyFrames, maxWeight,
  clip }` (`gestureFrames`: frames with weight > .5 while that line's gesture ran); `rig.speakerGesture
  .gestureFrames` in all. A front acting sample can count a frame as acted by the gesture when
  `rig.speakerGesture?.state.weight > .5`, next to the head layer's `speaking`.

### Validation

Done in Step 2: `Script_SpeakerGestureTest.mjs` (pure node, tier 0: the table covers every 03-06 embodied line,
rows name existing clips and resolvable targets, rifle holders use the left hand, about a third to a half of the
lines gesture, nobody gestures on two of his own lines in a row except the seated cigarette talk; the baked
windows equal the table; clips move only the gesture arm and the spine; unit quaternions; the bake's numbers above;
reach anchors; the sampler) and `Script_SpeakerGestureClipsBrowserTest.mjs` (tier 2; the clip-on-body review
above; `--shots` writes the stills to `tmp/SpeakerGestureReview/`).

Step 3 (2026-09-25): the node test also drives the layer on a stub Biped (stroke on the first stress, hold and
release, busy and shot suppression, the delayed start, `missed`, `ArmWeight`, the held rifle grip, aim, the rifle
clearance, the out-of-reach refusal, the head layer owning the layer). `Script_SpeakerGestureLayerBrowserTest.mjs`
(tier 2, about 25 min for 03-06) jumps to each step, plays every front scene through the per-line player on sim time
with the player looking at whoever talks, and reads the layer off the speaking body each frame. Gates: the picked
lines (FrontBlockade.02, FrontApproach.02, FrontWithdraw.01, BundleSupply.01, BundleAttack.01, BundleRetreat.01,
Volunteer.01, BorrowLight.03/.07, ZhouLift.02) gesture (weight > .5 for at least 20 frames); no frame with weight > 0
once a body has been busy longer than `fadeS`, after a shot has cut the gesture, or long after the line; a pointing
arm within 15 deg of the direction the layer aimed at after the whole frame, and of its target on lines that were
neither clamped nor lifted off the rifle; the rifle on the look direction the aim IK gives it; the gesturing hand at
least 5 cm off the rifle in the hold; no gesture layer after a jump to 08; every row refused for a reason that does
not depend on the fight (`targetOutOfReach`, `targetAcrossRifle`, `wounded`, `rightHandOnWeapon`, `noClip`,
`loadFailed`, `director`, `forcedClip`) is listed in the test's `KNOWN_REFUSALS` (now only TankRoadContact.01),
so the table and the game agree. The player view counts other soldiers standing in the way (a column of .3 m
radius per man), not only the raycast. `--shots` writes a player view
and a close-up of each picked line in its hold, and a close-up before the lift, to `_shots/SpeakerGestureLayer/`;
`--ab` is the frame cost below. Result 2026-09-25 (after the review round): 19 of the 20 lines with a gesture row
that were played gestured on screen; the one that did not is TankRoadContact.01 (`targetAcrossRifle`, listed).
FrontRelief.02 is not measured by this test (the relief NCO is not on the field when the test jumps to 05 and
plays the scene early; a reviewer's probe of a real-input run saw it gesture for 49 frames). No violations; the
pointing arm 2-9 deg (median) from its target where it was neither clamped nor lifted off the rifle, 15-23 deg on
the lifted ones (the lift is 18 deg); rifle clearance 7-49 cm in the hold; no gesture layer at 08. Stills looked at:
the points over the rifle (FrontBlockade.02, BundleSupply.01, Volunteer.01) read as points, not as a second man
aiming; the beckons (FrontWithdraw.01, BundleRetreat.01) and the seated Zhou read. BundleAttack.01 points across his
chest to his right: clear from the side, foreshortened from in front. What the player sees in a real fight is less:
a body off screen is not animated, and a man firing does not gesture.

Frame cost (`--ab`, 04, same page, the gesture layers swapped out and back in alternating blocks of 30 frames, 600
frames each): the whole frame on this shared machine is 35-200 ms headless and its p95 moved +2.1, -4.3 and +3.0 ms
between runs, so it cannot resolve 0.3 ms; it is printed, not gated. Gated: the layer's own time (Apply + AfterHead
+ AfterActorAim, all bodies: everything the layer adds to a frame) on the frames with a gesture up
(`performance.now` is clamped to 0.1 ms in this page, so one frame reads 0, 0.1, 0.2 ...): p95 of the per-frame
readings and their mean <= 0.3 ms. The layer's own bone turns read the arm's matrixWorld refreshed once after the
head turn instead of walking each bone's parent chain to the scene root. Measured 2026-09-25 after that change: 534
gesture frames, mean 0.08 ms, p95 0.2 ms, max 0.4 ms (an earlier run under heavy machine load had one 14 ms frame,
not repeated; frames over 1 ms are now listed with the gesture starts in them). Before the change: mean 0.2 ms, p95
0.3-0.5 ms.

## Rebuilding

Speaker gestures: from the worktree root, one headless Blender per rig (no BlenderMCP instance needed; each run
takes a few seconds):
`GESTURE_PROJECT=<worktree>/Taierzhuang1938 GESTURE_MODEL=LugouNra02 blender --background --factory-startup
--python-exit-code 1 --python Taierzhuang1938/_import/Script_SpeakerGestureBake.py` (and LugouNra05), then the
same with `GESTURE_PASS=manifest`. `GESTURE_CLIPS=a,b` re-bakes only those clips into the rig's file,
`GESTURE_RENDER=1` writes Workbench stills (front, side, top at the start, stroke, mid-hold, release, end) to
`tmp/SpeakerGestures/BlenderReview/`, `GESTURE_BLEND_DIR` saves the editable scene (one action per clip). A new
version string goes to both the bake's `VERSION` and `SPEAKER_GESTURE_ASSET.version` (the fetch cache key).

Facial rigs:

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
