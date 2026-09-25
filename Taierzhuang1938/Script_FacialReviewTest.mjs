import assert from 'node:assert/strict';
import { FACIAL_REVIEW_DEFAULTS as defaults,FacialLineAt,BuildFacialReviewSamples,SampleFacialKeys,ValidateFacialReview } from './Script_FacialReview.mjs';
const lines=[[0,.4],[.6,1]],cue={lines:[{who:'luo'},{who:'yaowa'}]};
const envelope={duration:1,stepS:.02,levels:new Float32Array(50).fill(1),brightness:new Float32Array(50).fill(.5)};
const samples=BuildFacialReviewSamples(envelope,lines,cue,'luo');
assert.ok(samples.levels[12]>.9);
assert.equal(samples.levels[30],0,'a silent gap closes the mouth');
assert.equal(samples.levels[45],0,'another speaker never drives the selected mouth');
assert.equal(FacialLineAt(lines,.4),-1);assert.equal(FacialLineAt(lines,.6),1);
const keys=[{time:0,values:{...defaults,brow:0}},{time:1,values:{...defaults,brow:1}}];
assert.equal(SampleFacialKeys(keys,.5).brow,.5);assert.equal(SampleFacialKeys(keys,2).brow,1);
const identity={cueId:'A',who:'luo',sha256:'abc',duration:1},draft={version:1,...identity,keys,note:'test'};
assert.equal(ValidateFacialReview(draft,identity).keys.length,2);
for(const invalid of [{...draft,who:'yaowa'},{...draft,sha256:'old'},{...draft,keys:[{time:2,values:defaults}]},
  {...draft,keys:[{time:0,values:{...defaults,brow:NaN}}]},{...draft,keys:[keys[0],keys[0]]}])assert.throws(()=>ValidateFacialReview(invalid,identity));
console.log('ok facial review: speaker isolation, silent gaps, deterministic keys, version and input validation');
