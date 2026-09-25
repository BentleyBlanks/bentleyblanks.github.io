import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LoadGlb, ReadAccessor } from './_import/Script_LugouGlbPose.mjs';
import { BuildSpeechEnvelope, SampleSpeechEnvelope } from './Script_SpeechEnvelope.mjs';
import { FirstLevelMissionVoice } from './Script_FirstLevelMissionVoice.mjs';

const sampleRate = 16000, samples = new Float32Array(sampleRate * 2);
for (let i = sampleRate / 4; i < sampleRate * .8; i++) samples[i] = .2 * Math.sin(i * Math.PI * 400 / sampleRate);
for (let i = sampleRate * 1.2; i < sampleRate * 1.7; i++) samples[i] = .12 * Math.sin(i * Math.PI * 2400 / sampleRate);
const envelope = BuildSpeechEnvelope({sampleRate, length: samples.length, numberOfChannels: 1, duration: 2, getChannelData: () => samples});
assert.equal(SampleSpeechEnvelope(envelope, .1).level, 0);
assert.equal(SampleSpeechEnvelope(envelope, 1).level, 0);
assert.ok(SampleSpeechEnvelope(envelope, .5).level > .8);
assert.ok(SampleSpeechEnvelope(envelope, 1.4).brightness > SampleSpeechEnvelope(envelope, .5).brightness);
assert.equal(SampleSpeechEnvelope(envelope, 2).level, 0);
let clock = 10;
const playing = {}, parallel = {};
const audio = {storyVoice: playing, voiceBank: new Map([['MissionTest', {speechEnvelope: envelope}]]), StopStoryVoice() {this.storyVoice = null;}};
const director = new FirstLevelMissionVoice({audio, hud: {}, Clock: () => clock});
director.current = {cue: {id: 'Test', lines: [{who: 'luo'}, {who: 'yaowa'}]},
  plan: {lines: [[0, 1], [1, 2]], segments: [{start: 0, end: 2}]}, voice: playing,
  clock: 10, clockSource: 0, sourceTime: 0, phase: 'playing', segmentIndex: 0, parallel: []};
clock = 10.5;
assert.ok(director.Speech('luo').level > .8, 'audio clock drives the mouth even before another simulation tick');
director.Pause();assert.equal(director.Speech('luo'), null, 'pause closes mouth');
director.paused = false;audio.storyVoice = playing;clock = 11.4;
assert.equal(director.Speech('luo'), null, 'another speaker in the same recording cannot animate Luo');
director.current.parallel = [{...director.current, voice: parallel, clock: 11, parallel: undefined,
  cue: {id: 'Test', lines: [{who: 'luo'}]}, plan: {lines: [[0, 2]]}}];
assert.ok(director.Speech('luo').level > .8, 'parallel briefing uses its own source time');
audio.voiceMute = true;assert.equal(director.Speech('luo'), null);
audio.voiceMute = false;parallel.reclaimed = true;assert.equal(director.Speech('luo'), null, 'stopped audio cannot continue speaking');
director.current.parallel = [];director.current.phase = 'waiting';clock = 10.5;
assert.equal(director.Speech('luo'), null, 'event-gated segment waits stay closed');

function Glb(file) { const b = fs.readFileSync(new URL('./Model/Character/' + file, import.meta.url)); return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12))); }
const source = Glb('Model_TengxianNra05.glb'), face = Glb('Model_TengxianNra05Facial.glb');
const sourceBytes=LoadGlb(new URL('./Model/Character/Model_TengxianNra05.glb',import.meta.url));
const faceBytes=LoadGlb(new URL('./Model/Character/Model_TengxianNra05Facial.glb',import.meta.url));
function SameAccessor(a,b,label,tolerance=1e-5){
  const x=ReadAccessor(sourceBytes,a).data,y=ReadAccessor(faceBytes,b).data;
  assert.equal(x.length,y.length,label+' length');
  assert.ok(x.every((v,i)=>Math.abs(v-y[i])<=tolerance),label+' values');
}
assert.equal(face.skins[0].joints.length, source.skins[0].joints.length + 11);
assert.deepEqual(face.animations.map(a=>a.name), source.animations.map(a=>a.name), 'all body clips preserved');
for(let i=0;i<source.animations.length;i++){
  const a=source.animations[i],b=face.animations[i];
  assert.deepEqual(a.channels,b.channels,a.name+' body track bindings');
  for(let j=0;j<a.samplers.length;j++)for(const key of ['input','output'])SameAccessor(a.samplers[j][key],b.samplers[j][key],a.name+'/'+j+'/'+key);
}
for (let i = 0; i < source.nodes.length; i++) {
  const original = {...source.nodes[i]}, updated = {...face.nodes[i]};
  delete original.children;delete updated.children;delete original.extras;delete updated.extras;
  assert.deepEqual(updated, original, 'original bone/socket/mesh transforms preserved: ' + original.name);
  assert.deepEqual((face.nodes[i].children || []).filter(n => n < source.nodes.length), source.nodes[i].children || []);
}
for (let i = 0; i < source.meshes[0].primitives.length; i++) {
  for (const key of ['POSITION', 'NORMAL', 'TEXCOORD_0'])
    SameAccessor(source.meshes[0].primitives[i].attributes[key],face.meshes[0].primitives[i].attributes[key],'body surface '+i+'/'+key);
}
assert.equal(face.meshes[0].primitives.length, source.meshes[0].primitives.length + 3, 'oral surfaces batched into three material primitives');
assert.equal(face.images.length,source.images.length,'original texture count');
for(let i=0;i<source.images.length;i++){
  const a=source.images[i],b=face.images[i];assert.equal(a.mimeType,b.mimeType);assert.equal(a.name,b.name);
  const av=source.bufferViews[a.bufferView],bv=face.bufferViews[b.bufferView];
  assert.ok(sourceBytes.bin.subarray(av.byteOffset,av.byteOffset+av.byteLength).equals(faceBytes.bin.subarray(bv.byteOffset,bv.byteOffset+bv.byteLength)),'original face and uniform texture bytes');
}
assert.equal(face.extras.facialRig.bones.length, 11);
console.log('ok speech energy, silence, audio clock, parallel speaker isolation, pause/cancel and original body/skin asset contracts');
