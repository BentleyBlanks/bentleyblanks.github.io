// Render actual skin, cuffs, thumbs and rail from several close viewpoints.
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),root=args[args.indexOf('--root')+1];
if(!root)throw Error('--root required');
const revision=args.includes('--revision')?Number(args[args.indexOf('--revision')+1]):9;
const frozen=await fs.readFile(path.join(root,`Models/FirstLevelCarryV${revision}/Data_VisualAssessment.json`),'utf8').then(s=>JSON.parse(s).frozen,()=>false);
if(frozen)throw Error('Use another version; frozen contact captures must be preserved.');
const output=path.join(root,`Preview/FirstLevelCarryV${revision}/Contacts`);
await fs.mkdir(output,{recursive:true});
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:1700,height:1000}});
try {
 await page.goto('http://127.0.0.1:8136/Preview/index.html?action=StretcherPair');
 await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading);
 await page.evaluate(revision=>{
  const variant=MotionReview.selected.variants.find(v=>v.id===`Nra-v${revision}-StretcherPair`);
  if(!variant)throw Error('Missing requested revision');
  MotionReview.loadVariant(variant);MotionReview.setPlaying(false);
 },revision);
 await page.waitForFunction(()=>!MotionReview.loading);
 const captures=[];
 for(const phase of [.12,.5,.75])for(const role of ['Front','Rear'])for(const side of ['L','R'])for(const view of ['outside','inside','above']){
  const result=await page.evaluate(({phase,role,side,view})=>{
   MotionReview.setPhase(phase);
   const m=MotionReview.model;
   m.action.enabled=true;m.action.paused=false;m.mixer.setTime(phase*2);m.model.updateMatrixWorld(true);
   const Belongs=b=>{for(let p=b;p;p=p.parent)if(p.name.startsWith(role+'_'))return true;return false;};
   const hand=m.bones.find(b=>b.name.replace(/[_.]\d+$/,'').replaceAll('_',' ').endsWith(' '+side+' Hand')&&Belongs(b));
   const V=hand.position.constructor,center=hand.getWorldPosition(new V());
   const sign=Math.sign(center.x),offset=view==='above'?new V(sign*.13,.55,.15):new V(sign*(view==='outside'?.6:-.4),.07,.3);
   m.camera.aspect=1;m.camera.updateProjectionMatrix();m.renderer.setSize(800,800,false);
   m.camera.position.copy(center).add(offset);m.camera.lookAt(center.clone().add(new V(0,-.055,0)));
   m.renderer.render(m.scene,m.camera);
   const bones=m.bones.filter(b=>/Finger/.test(b.name)&&Belongs(b)&&b.name.replaceAll('_',' ').includes(' '+side+' '));
   return {data:m.renderer.domElement.toDataURL('image/png'),center:center.toArray(),fingers:bones.map(b=>({name:b.name,position:b.getWorldPosition(new V()).toArray()}))};
  },{phase,role,side,view});
  const file=`Texture_${role}${side}_${view}_${Math.round(phase*100)}.png`;
  await fs.writeFile(path.join(output,file),Buffer.from(result.data.split(',')[1],'base64'));
  delete result.data;captures.push({phase,role,side,view,file,...result});
 }
 await fs.writeFile(path.join(output,'Data_ContactViews.json'),JSON.stringify({revision,captures},null,2));
 console.log(JSON.stringify({revision,captures:captures.length,output}));
}finally{await browser.close();}
