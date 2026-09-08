// Render actual skin, cuffs, thumbs and rail from several close viewpoints.
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
if(!root)throw Error('--root required');
const revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):9;
const group=args.includes('--group')?args[args.indexOf('--group')+1]:`FirstLevelCarryV${revision}`;
if(!/^FirstLevelCarry(?:Hold)?V[1-9]\d*$/.test(group))throw Error('Invalid carry group');
const selectedRevision=Number(group.split('V').at(-1)),action=group.includes('Hold')?'StretcherPairHold':'StretcherPair';
const region=args.includes('--region')?args[args.indexOf('--region')+1]:'hands';
if(!['hands','arms'].includes(region))throw Error('Invalid contact region');
const frozen=await fs.readFile(path.join(root,`Models/${group}/Data_VisualAssessment.json`),'utf8').then(s=>JSON.parse(s).frozen,()=>false);
if(frozen)throw Error('Use another version; frozen contact captures must be preserved.');
const captureGroup=args.includes('--capture-group')?args[args.indexOf('--capture-group')+1]:'Contacts';
if(!/^Contacts[A-Za-z0-9]*$/.test(captureGroup))throw Error('Invalid contact capture group');
const output=path.join(root,`Preview/${group}`,captureGroup);
if(await fs.stat(path.join(output,'Data_ContactViews.json')).then(()=>true,()=>false))throw Error('Preserve existing contact views; choose a new capture group');
await fs.mkdir(output,{recursive:true});
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1700,height:1000}});
try {
 await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+action);
 await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading);
 await page.evaluate(({revision,action})=>{
  const variant=MotionReview.selected.variants.find(v=>v.id===`Nra-v${revision}-${action}`);
  if(!variant)throw Error('Missing requested revision');
  MotionReview.loadVariant(variant);MotionReview.setPlaying(false);
 },{revision:selectedRevision,action});
 await page.waitForFunction(()=>!MotionReview.loading);
 const captures=[];
 for(const phase of [.12,.5,.75])for(const role of ['Front','Rear'])for(const side of ['L','R'])for(const view of ['outside','inside','above']){
  const result=await page.evaluate(({phase,role,side,view,region})=>{
   MotionReview.setPhase(phase);
   const m=MotionReview.model;
   m.action.enabled=true;m.action.paused=false;m.mixer.setTime(phase*2);m.model.updateMatrixWorld(true);
   const Belongs=b=>{for(let p=b;p;p=p.parent)if(p.name.startsWith(role+'_'))return true;return false;};
   const hand=m.bones.find(b=>b.name.replace(/[_.]\d+$/,'').replaceAll('_',' ').endsWith(' '+side+' Hand')&&Belongs(b));
   const V=hand.position.constructor,center=hand.getWorldPosition(new V());
   if(region==='arms'){
    const shoulder=m.bones.find(b=>b.name.replace(/[_.]\d+$/,'').replaceAll('_',' ').endsWith(' '+side+' UpperArm')&&Belongs(b));
    center.lerp(shoulder.getWorldPosition(new V()),.65);
   }
   const sign=Math.sign(center.x),towardBed=role==='Front'?-1:1;
   const offset=view==='above'?new V(sign*.13,.55,towardBed*.15):new V(sign*(view==='outside'?.6:-.4),.07,towardBed*.4);
   if(region==='arms')offset.multiplyScalar(1.7);
   m.camera.aspect=1;m.camera.updateProjectionMatrix();m.renderer.setSize(800,800,false);
   m.camera.position.copy(center).add(offset);m.camera.lookAt(center.clone().add(new V(0,-.055,0)));
   m.renderer.render(m.scene,m.camera);
   const bones=m.bones.filter(b=>/Finger/.test(b.name)&&Belongs(b)&&b.name.replaceAll('_',' ').includes(' '+side+' '));
   return {data:m.renderer.domElement.toDataURL('image/png'),center:center.toArray(),fingers:bones.map(b=>({name:b.name,position:b.getWorldPosition(new V()).toArray()}))};
  },{phase,role,side,view,region});
  const file=`Texture_${role}${side}_${view}_${Math.round(phase*100)}.png`;
  await fs.writeFile(path.join(output,file),Buffer.from(result.data.split(',')[1],'base64'));
  delete result.data;captures.push({phase,role,side,view,file,...result});
 }
 await fs.writeFile(path.join(output,'Data_ContactViews.json'),JSON.stringify({group,revision:selectedRevision,region,captures},null,2));
 console.log(JSON.stringify({group,revision:selectedRevision,region,captures:captures.length,output}));
}finally{await browser.close();}
