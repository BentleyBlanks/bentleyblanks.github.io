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
IJA06 (user, 2026-09-24; [selection](Data_CharacterSelection.md)). Spawn points pass
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
   rebuild `Model_LugouIja06.glb` first when the base changes.
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
