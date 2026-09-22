import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { OPENING_STORYBOARDS as C } from "./Data_OpeningStoryboards.mjs";
const Read=file=>fs.readFileSync(new URL(file,import.meta.url));
const Hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const manifest=JSON.parse(Read("Animation/OpeningStoryboards/Data_OpeningStoryboardsAnimation.json"));
assert.equal(manifest.version,C.version);
assert.deepEqual(manifest.models.map(row=>row.id),["LugouNra02","LugouNra05","LugouIja01","LugouIja02","LugouIja03"]);
let frames=0;
for(const row of manifest.models){
  const bytes=Read("Animation/OpeningStoryboards/"+row.file),asset=JSON.parse(bytes);
  assert.equal(Hash(bytes),row.sha256,`${row.id}: manifest matches baked bytes`);
  assert.equal(Hash(Read(`Model/Character/Model_${row.id}.glb`)),asset.originalModelSha256,`${row.id}: original rig unchanged`);
  assert.equal(asset.modelId,row.id);assert.equal(asset.stride,7);
  for(const [id,spec] of Object.entries(manifest.clips)){
    const clip=asset.clips[id],stride=asset.bones.length*7;
    assert.ok(clip,`${row.id}: ${id}`);assert.equal(clip.duration,spec.duration);
    assert.equal(clip.values.length,clip.frameCount*stride);
    assert.ok(clip.values.every(Number.isFinite),`${row.id}/${id}: finite transforms`);
    for(let i=0;i<clip.values.length;i+=7){
      const q=clip.values.slice(i+3,i+7);assert.ok(Math.abs(Math.hypot(...q)-1)<.003,`${row.id}/${id}: unit quaternion`);
    }
    if(clip.loop)assert.deepEqual(clip.values.slice(0,stride),clip.values.slice(-stride),`${id}: seamless loop`);
    frames+=clip.frameCount;
  }
}
const p=C.positions;
assert.ok(p.interrogator.x<p.interrogated.x&&p.interpreterNear.x>p.interrogated.x,"V3: interrogator left, interpreter right");
assert.ok(p.march.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.z)));
assert.ok(p.march[2].z>p.march[0].z,"follow-up enemies advance south toward the dugout");
assert.ok(Math.hypot(p.guardNear.x-p.luoAmbush.x,p.guardNear.z-p.luoAmbush.z)<1,"dadao ambush within physical reach");
assert.ok(Math.hypot(p.rifleEnd.x-p.rescued.x,p.rifleEnd.z-p.rescued.z)<1.5,"kicked rifle within pickup reach");
const returnRoute=[p.pullEnd,...C.pullReturnWaypoints,p.luoPull];
let progress=0,minimum=Infinity;
for(let i=1;i<returnRoute.length;i++){
  const a=returnRoute[i-1],b=returnRoute[i],length=Math.hypot(b.x-a.x,b.z-a.z);
  for(let d=0;d<=length;d+=.02){
    const t=d/length,distance=Math.hypot(a.x+(b.x-a.x)*t-p.rescued.x,a.z+(b.z-a.z)*t-p.rescued.z);
    assert.ok(distance>=Math.hypot(p.pullEnd.x-p.rescued.x,p.pullEnd.z-p.rescued.z)-.001,"release never moves the leader closer through the player");
    if(progress+d>=C.walkMps*.2)minimum=Math.min(minimum,distance);
  }
  progress+=length;
}
assert.ok(minimum>.7,"after the first 0.2s of release, the return path keeps the two body capsules separate");
console.log(`ok opening storyboards: five original rigs, 100 clips, ${frames} normalized frames, V3 cast and pickup placement`);
