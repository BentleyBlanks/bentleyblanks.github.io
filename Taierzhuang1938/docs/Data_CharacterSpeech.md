# Luo facial speech

Luo (`castId=luo`) uses the reviewed NRA05 facial skin from
`Model/Character/Model_LugouNra05Facial.glb`. The original NRA05 remains the
appearance for anonymous soldiers and other officers. Both share the existing
body clips, sockets, root transform and hitbox profile.

The facial asset adds 11 deform joints (jaw, lips, corners, eyebrows and eyelids)
and three batched oral material primitives. Original body geometry, UVs,
materials, animation tracks and existing node transforms are retained. The
Blender review's eight-second timing is not looped during dialogue: its facial
poses are sampled as independent targets and blended on top of gameplay motion.

`Script_Audio.LoadVoices` builds a compact 50 Hz RMS/brightness envelope from each
decoded recording containing Luo. `FirstLevelMissionVoice.Speech` samples that
recording at the active WebAudio source time, within the aligned speaker and
segment interval. The parallel TrainBriefing recording has its own clock and
envelope; Liu/He's overlapping audio never drives Luo's mouth. Paused, canceled,
muted, unloaded or gated audio returns no active speech. Audio data and existing
speaker alignments are unchanged.

`Script_CharacterFacialAnimation` drives only the added face joints after the
body mixer. Jaw opening follows energy, while spectral brightness blends the
reviewed wide/round lip poses. This matches acoustic rhythm and pauses; it is
not phoneme transcription or a claim of exact pronunciation-specific lip sync.
Death and voice cancellation close the mouth; mission disposal releases the
speech callback. Facial skin uses the existing SkinnedMesh motion-vector path.

Source project:
`C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\Nra05FacialTalk_20260913\Animation_Nra05FacialTalk.blend`.
Run `_import/Script_BakeNraFacial.py` in that Blender scene, setting
`NRA_FACIAL_REPO` to the intended worktree when necessary. The baker preserves
the original GLB's world-metre skin convention rather than re-exporting body
bone lengths or sockets. Update `facialVersion` in the character manifest after
baking. Source projects and QA images remain local.

Validation: `Script_CharacterSpeechTest.mjs` covers silent gaps, audio clocks,
speaker isolation, cancellation and the original asset contracts;
`Script_CharacterSpeechBrowserTest.mjs` checks the actual Luo instance, decoded
voice, mouth deformation, pause/replay and production scene rendering. Local
evidence is written under `_shots/CharacterSpeech`. Shared actor, audio,
motion-vector and first-level checks remain required.
