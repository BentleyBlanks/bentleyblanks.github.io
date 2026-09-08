// Verify the assembled GLBs against the production trial, then capture the
// real source/raw/model browser preview. No rendered video substitutes for a rig.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {LoadGlb,PoseScene} from './Script_LugouGlbPose.mjs';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];assert.ok(root);
const group=args.includes('--group')?args[args.indexOf('--group')+1]:'FirstLevelCarryV11';assert.match(group,/^FirstLevelCarry(?:Hold)?V[1-9]\d*$/);
const revision=Number(group.split('V').at(-1)),folder=path.join(root,'Models',group),output=path.join(root,'Preview',group);await fs.mkdir(output,{recursive:true});
assert.equal(await fs.stat(path.join(folder,'Data_ProjectAndPlaybackValidation.json')).then(()=>true,()=>false),false,'Use another version; preserve earlier captures and review.');
const validation=JSON.parse(await fs.readFile(path.join(folder,'Data_IndependentValidation.json'),'utf8'));
const expected=JSON.parse(await fs.readFile(path.join(root,'Models',validation.fitReport),'utf8'));
const projects=JSON.parse(await fs.readFile(path.join(folder,'Data_EditableProjects.json'),'utf8')),pairs=[];
for(const model of projects.results){
  const glb=LoadGlb(path.join(root,model.path)),scene=new PoseScene(glb);assert.equal(glb.json.animations.length,1);assert.equal(glb.json.animations[0].name,model.clip);let maxPositionErrorM=0;
  const Find=(role,part)=>scene.nodes.findIndex((node,i)=>{if(!node.name.replaceAll('_',' ').endsWith(' '+part))return false;for(let p=i;p>=0;p=scene.parent[p])if(scene.nodes[p].name.startsWith(role+'_'))return true;return false});
  for(let frame=0;frame<=120;frame++){
    scene.Apply(0,frame/60);
    for(const role of ['Front','Rear']){
      const f=expected.results.find(m=>m.id===model.id).profiles.find(p=>p.role===role&&p.size===1).frames[frame];
      for(const [part,point] of [['Pelvis',f.pelvis],...['L','R'].flatMap(s=>[[s+' Hand',f.hands[s].wrist],[s+' Foot',f.feet[s].ankle]])]){
        const node=Find(role,part);assert.ok(node>=0);const actual=Array.from(scene.world[node]).slice(12,15),goal=[-point[0],point[1],-point[2]];
        maxPositionErrorM=Math.max(maxPositionErrorM,Math.hypot(...actual.map((v,i)=>v-goal[i])));
      }
    }
  }
  assert.ok(maxPositionErrorM<.00005,'assembled original rig '+model.id+' '+maxPositionErrorM);pairs.push({id:model.id,frames:121,maxPositionErrorM});
}
const browser=await LaunchBrowser(),errors=[],playback=[];
try{
  const page=await browser.newPage({viewport:{width:1700,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  for(const name of ['CarryStretcherFront','CarryStretcherRear','StretcherPair'].map(n=>n+(expected.hold?'Hold':''))){
    await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+name);
    await page.waitForFunction(({name,revision})=>window.MotionReview&&!MotionReview.loading&&MotionReview.variant.id==='Nra-v'+revision+'-'+name&&MotionReview.video.readyState>=2,{name,revision});
    await page.evaluate(()=>MotionReview.setPlaying(false));const samples=[];
    for(const view of ['three','side','front'])for(const phase of [0,.25,.5,.75]){
      await page.locator('[data-view="'+view+'"]').click();await page.evaluate(phase=>MotionReview.setPhase(phase),phase);await page.waitForFunction(()=>!MotionReview.video.seeking);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const sample=await page.evaluate(()=>{
        const m=MotionReview.model;let projection=0;m.model.updateMatrixWorld(true);m.model.traverse(node=>{if(node.isMesh){const v=node.position.clone();for(let i=0;i<node.geometry.attributes.position.count;i+=8){node.getVertexPosition(i,v);v.applyMatrix4(node.matrixWorld).project(m.camera);projection=Math.max(projection,Math.abs(v.x),Math.abs(v.y));}}});
        return {phase:MotionReview.phase,videoTime:MotionReview.video.currentTime,range:MotionReview.range,projection,rawTracks:MotionReview.recovery.tracks.length,bones:m.bones.length,videoWidth:MotionReview.video.videoWidth,matrices:m.bones.flatMap(b=>b.matrixWorld.elements)};
      });
      assert.ok(sample.projection<1,'complete model/prop framing');assert.ok(sample.rawTracks>0&&sample.videoWidth>0);assert.ok(Math.abs(sample.videoTime-(expected.hold?expected.sourcePoseSeconds:sample.range[0]+sample.phase*(sample.range[1]-sample.range[0])))<.002,'source sync');
      const file=`Texture_${name}_${view}_${Math.round(phase*100)}.png`;await page.screenshot({path:path.join(output,file)});samples.push({view,file,...sample});
    }
    let movement=0;for(const s of samples)movement=Math.max(movement,...samples[0].matrices.map((v,i)=>Math.abs(v-s.matrices[i])));assert.ok(movement>.0001,'live skeletal motion');for(const s of samples)delete s.matrices;
    playback.push({name,movement,samples});
  }
  assert.deepEqual(errors,[]);
  const report=path.join(folder,'Data_ProjectAndPlaybackValidation.json');assert.equal(await fs.stat(report).then(()=>true,()=>false),false,'Preserve earlier review');
  await fs.writeFile(report,JSON.stringify({status:'numeric_and_live_preview_passed_requires_visual_review',pairs,playback,errors},null,2));
  console.log(JSON.stringify({pairs,playbackActions:playback.length,captures:playback.reduce((n,r)=>n+r.samples.length,0),errors}));
}finally{await browser.close();}
