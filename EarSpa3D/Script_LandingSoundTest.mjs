import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { LandingSound } from './Script_LandingSound.mjs';
import { SFX_SOURCES, SFX_TAKES } from './Data_AudioSources.mjs';

assert.equal(LandingSound({ fine: true, footprint: [2, 2] }).tier, 'small');
assert.equal(LandingSound({ footprint: [.4, .4] }).tier, 'small');
assert.equal(LandingSound({ footprint: [.401, .401] }).tier, 'medium');
assert.equal(LandingSound({ footprint: [1.15, 1.15] }).tier, 'medium');
assert.equal(LandingSound({ footprint: [1.151, 1.151] }).tier, 'large');
assert.equal(LandingSound({ footprint: [.2, 2] }).tier, 'medium');
assert.equal(LandingSound({ size: .6 }).tier, 'medium');
assert.equal(LandingSound({ size: NaN }).tier, 'small');
assert.equal(LandingSound({ fine: true, toolId: 'suction' }).cue, 'vacuumSuck');
assert.equal(LandingSound({ type: 'wet', footprint: [.2, .2] }).tier, 'small');
assert.equal(LandingSound({ fragment: true, footprint: [.2, .2] }).tier, 'small');

const manifest = JSON.parse(fs.readFileSync(new URL('./Audio/Data_AudioManifest.json', import.meta.url)));
for (const cue of ['waxLandSmall', 'waxLandMedium', 'waxLandLarge']) {
  const entry = manifest.cues[cue + '#1'];
  const data = fs.readFileSync(new URL(entry.file, import.meta.url));
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WAVE');
  assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256);
  assert.equal(SFX_SOURCES.find(s => s.cue === cue).bakedOnly, true);
  assert.equal('Audio/Sfx/' + SFX_TAKES.find(s => s.cue === cue).files[0], entry.file);
}
assert.ok(!SFX_SOURCES.some(s => s.category === 'voice' || s.cue === 'relaxSigh'));
console.log('PASS landing size boundaries, thin sheets, fragments, suction, approved WAV hashes and no voice generation');
