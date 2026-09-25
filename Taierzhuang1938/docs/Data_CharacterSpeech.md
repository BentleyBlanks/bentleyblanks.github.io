# Speaker faces (first level 01-06)

Every character who speaks on screen in 01-06 has a bone face rig and moves its
mouth with its own lines only. Contract: [01-05 refactor](Data_FirstLevel0105Refactor20260923Contract.md)
section 2 item 4 and section 5.6. Morph targets are not used (MotionVector contract item 12).

For close-up dialogue inspection, use Tools → 人物面部. The [facial editor](Data_FacialEditor.md)
supports source-audio seeking, slow playback, expression keyframes and local review notes.

## Assets

| Model | Facial skin | Size | Cast (`facialCast` in the manifest) |
| --- | --- | --- | --- |
| NRA02 | `Model_LugouNra02Facial.glb` | 0.71 MB | yaowa, heyoutian, liuwencai, comrade, runner, guard, shouter, zhou, relief, keeper, bearer, captiveHelper, captiveWounded |
| NRA06 | `Model_LugouNra06Facial.glb` | 0.71 MB | interpreter |
| NRA05 | `Model_LugouNra05Facial.glb` | 0.54 MB | luo |
| IJA01 | `Model_LugouIja01Facial.glb` | 0.95 MB | ijaB, ijaC, frontOfficer |
| IJA02 | `Model_LugouIja02Facial.glb` | 1.04 MB | ijaD |
| IJA06 | `Model_LugouIja06Facial.glb` | 1.09 MB | ijaA |

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
DeadSlack, and since 2026-09-25 the expressions Shock, Pain, Shout, Grit
([01-03 storyboard contract](Data_FirstLevelStoryboard0103Contract.md) section 4.2). A pose
only moves its own bones (Blink never opens the jaw, Open never lifts the brows; no
expression moves the eyeballs, Shout/Grit leave the upper lids to the blinks).
`extras.facialRig.eyes` names the eye bones and their yaw/pitch axes.

Shapes (2026-09-25, set in Blender on close-up and 1 m game-view renders of every rig;
values in `_import/Script_AuthorCharacterFacial.POSES`): Wide pulls the corners out and
back (mouth about 13 mm wider), Round pulls them in and pushes both lips forward (about
8 mm narrower), Close presses the lips; the corners travel at least 6 mm (the 09-23
shapes moved them 1.8-4.2 mm, under 2 px at 1 m). Snarl (龇牙怒目) keeps the teeth nearly
together and bares both rows, brows down, knitted and tilted inner-end-down; Shock raises
the brows and upper lids and drops the jaw 8 deg; Pain tilts the inner brows up, squints
and pulls the corners down; Shout drops the jaw 19 deg with brows down; Grit clenches with
the lips drawn back. `BrowTilt` turns the brow bones about the head's forward axis.
Second pass the same day, tuned in the level (0.6-0.75 m, trench light, every rig; review
of the first pass found Wide and Round the same slot from the front and the snarl a dark
slot with a grey row of teeth): Wide bares both teeth rows full width with little jaw
(2.5 deg; corners 10 mm out), Round closes the lips over the teeth from both sides
(corners 14 mm in, lips forward and toward each other) so it reads as a small round
opening; Snarl clenches (jaw 1 deg) with both lips >= 10 mm off the teeth and the corners
out and down; Shock opens the upper lids 4 mm (the stare has to read under a cap brim).
In the live test at 0.6 m a track sample of .5 moves the corners 7-12 mm and a wide
syllable is 32-35 mm wider than a round one. Teeth albedo .62/.57/.48 (was .30/.255/.19,
a grey slab in the level). NRA05 Grit moves the lips twice as far (`MODELS['Nra05']`).
IJA heads: the lip weights are centred on the red of the lips (the upper-lip margin used
to carry 4-6 % of LipUpper), the teeth rows sit 7 mm lower on the lip seam, and the lid
skin band is 1.5 mm (a blink no longer drags the painted brow). The IJA brows are painted
in the head texture close to the eye; the brow bone sits 19 mm above the eyeball centre on
the painted brow, so nothing moves the brow itself away from the eye (a texture matter). NRA05 keeps its reviewed
Open/Wide/Round jaw and gets the same lip/corner shapes added on top (`LayerNra05Lips`).

## Runtime

- `Script_CharacterFacialAnimation`: additive blend of pose deltas from Rest:
  jaw*Open + wide*Wide + round*Round + close*Close + blink*Blink + brow*BrowUp
  (+ snarl*Snarl + shock*Shock + pain*Pain + shout*Shout + grit*Grit + DeadSlack). Input is a baked face track sample `{jaw, wide, round, close,
  stress}`; without one it falls back to the runtime envelope `{level, brightness}`.
  Brows lift only on stress events; blinks follow a per-actor seeded rhythm (2.5-6 s)
  plus line starts and after stress; eyes look at the attention target with small
  saccades; silent mouths stay closed with a slow breathing drift; death drops into
  DeadSlack (`LugouCharacterRig.PoseDeath`). Numbers: `Data_Tuning_CharacterSpeech.mjs`.
- Acting expressions (2026-09-25, contract section 4.2): `rig.facial.expression =
  {snarl, shock, pain, shout, grit}` (0-1 targets; a whole-object write may be partial, and it
  drops any blend time an earlier `SetExpression(..., blendS)` left, so it always eases over
  `expressionBlendS`) or
  `CharacterFacial.SetExpression(rig, partial, blendS?)` from `Script_CharacterFacialAnimation`
  (`rig` = CharacterRig, actor or the face layer; a rig without a face throws). Each weight
  moves linearly, a full 0 -> 1 swing in `expressionBlendS` (0.25 s) or the call's `blendS`
  (0 snaps; the call's blend time stays with those expressions until the next SetExpression
  without one or a whole-object write). Both throw when the loaded facial GLB has no pose for
  a non-zero expression (a stale cached GLB must not show nothing silently); a field written
  directly (`facial.expression.snarl = 1`) is reported once with console.error. Speech is layered on top: while the face talks (`talkBlendS`) an expression
  keeps only 40 % of its jaw drop (`expressionTalkJawYield`), so a shouted line opens and
  shuts on every syllable around a half-open base (unit and browser tests: 8-21 deg under
  Shout). A stressed syllable adds a short corner pull (`stressCornerPull`, riding on the
  open jaw so it lets go with it). Baked track lip shapes are mostly .1-.5, so the runtime
  scales them by `trackWideGain` / `trackRoundGain` (1.6, clamped to 1; the jaw is left as
  baked). `State().expression` reports the applied weights.
- Face blood: `CharacterFacial.SetFaceBlood(rig, amount 0-1)` (`Script_CharacterFaceBlood`):
  a procedural mask (a cut on the brow band under the cap brim, runs down brow/cheek/nose,
  cheek smear, nose bleed over lip and chin, thin grime) on a private clone of the face skin
  material only: the surface whose nearest vertex to Face_LipUpper is closest (caps, collars
  and hair are other materials and stay shared; the first pass painted the NRA cap front).
  The mask stops at the brow band (`topFrom`/`topTo`). Patched through
  `Script_MaterialPatches` like `Script_CharacterWounds` (both stack; each side swaps a patch
  with its own key that a clone carried along instead of adding a second copy, and
  `CharacterWounds.Clear` empties its slots, so blood -> wound -> reset -> blood never links
  a program with the patch twice). `SetFaceBlood(rig, amount > 0)` throws when no face skin
  takes it. It reads the
  pre-skinning position in a face frame taken from the Face_* bind poses, changes colour and
  roughness only (motion vectors untouched) and uses no texture (no sampler). Colours come
  from `Data_Tuning_Blood.BLOOD_WOUND`; layout in `Data_Tuning_CharacterSpeech.FACE_BLOOD`.
  `PrepareFaceBlood(rig)` builds the materials at amount 0 ahead of time (first use would
  otherwise link a program mid-scene); `Reset()` gives the shared materials back.
- Recommended use for the director (01-03 second wave): 日兵甲 Snarl 1 through
  Found -> Butt -> Drag -> Hold -> Collar (his lines talk through it), Shock 1 with
  `blendS` ~0.12 s on Chop (then hold; he dies); 罗班长 Grit 0.8-1 on the chop swing,
  Check (关切) = Pain 0.6 + Shock 0.25 (Pain 0.35 + Shock 0.2 hardly reads at 0.75 m),
  back to 0 over 0.4 s; 传令兵 / 「敵だ」 Shout 1 for the line, released after it; 川军
  CaptiveDragged Pain 0.7-1 plus `SetFaceBlood(rig, 1)` (prepare it when he is cast).
  Camera: a snarl reads from the front down to about 15 deg below eye level; from 30 deg
  below (the first-pass SB04 guess) the lower lip hides the bottom teeth and the mouth is a
  dark slot. Under the IJA06 soft cap the brows and eyes read only when the head is up or the
  lens is at or below eye level (Anim: IjaHoldCollarUp lifts the head).
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

## Rebuilding

Blender sources: `OneDrive/AI/Models/Blender/Taierzhuang1938/FacialRigs_20260925/`
(`Animation_{Nra02,Ija02,Ija06,Nra06,Nra05}FacialTalk.blend`; NRA05 is the reviewed
2026-09-13 scene plus eye bones, the added poses, the lip layer and one-segment tooth
bevels; `UpgradeNra05` can be re-run on an upgraded scene). The 2026-09-23 sources stay in
`FacialRigs_20260923/` and `Characters_20260924/`.

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
   (`'model': 'Ija06'`, source `FacialRigs_20260925/Animation_Ija06FacialTalk.blend`);
   rebuild `Model_LugouIja06.glb` first when the base changes. NRA06 (the interpreter,
   reshaped NRA02 head, same topology) likewise: `'model': 'Nra06'`, source
   `FacialRigs_20260925/Animation_Nra06FacialTalk.blend`, after `_import/Script_BuildLugouNra06.py`
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
  (additive shapes, closure, stress-only brows, pause after stress shuts, fallback, release,
  DeadSlack, gaze, seeded blinks; on all six rigs the five expressions: eased partial
  updates, whole-object writes (which drop an earlier blend time), a missing pose throws, SetFaceBlood
  without face skin throws, track lip gains, Wide/Round widths and lip directions, Snarl lips off
  both rows, Shock lids, every expression moves the face, a shouted line still
  opens and shuts); binder (isolation, listener gaze, release on death/dispose); face
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
  recorded next to it for comparison, with close-ups of both faces mid-word; acting
  close-ups at 0.6 m (日兵甲 Snarl/Shock/Shout, 罗班长 Grit, the captive comrade Pain and
  face blood) measured on the rendered pixels (changed face, blood-red share) and a
  shouted line that still opens and shuts; 罗班长 concern (Pain .6 + Shock .25).
  Talking lip shapes at 0.6 m on IJA06/NRA02/NRA06 (held track samples of .5): both corners move
  >= 3 mm and both lips >= 2 mm, a wide syllable is >= 12 mm wider than a round one, wide, round
  and wide-vs-round each change the mouth box on screen, Close presses the lower lip >= 2 mm.
  Face blood clones exactly the lip-holding skin material; blood -> head wound -> reset ->
  blood -> clear -> wound keeps one copy of each patch, and no shader fails to link.
  Evidence: `_shots/CharacterSpeech`.
- Shared gates: `Script_MotionVectorContractTest`, `Script_SamplerBudgetTest`,
  `Script_AssetStandardsTest`, `Script_CharacterModelTest`.
