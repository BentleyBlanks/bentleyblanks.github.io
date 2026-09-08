// Frame the complete actual GLB trajectory; only unfrozen preview metadata changes.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
const args=process.argv.slice(2),Value=k=>args[args.indexOf(k)+1];
const root=Value('--root'),group=Value('--group');
assert.ok(root&&group&&root!=='--root'&&group!=='--group');
const out=path.join(root,'Models',group),Read=async name=>JSON.parse(await fs.readFile(path.join(out,name),'utf8'));
assert.equal(await fs.access(path.join(out,'Data_VisualAssessment.json')).then(()=>true,()=>false),false,'Do not alter reviewed groups');
assert.equal(await fs.access(path.join(out,'Data_PreviewFramingFit.json')).then(()=>true,()=>false),false,'Keep earlier framing evidence');
const inventory=await Read('Data_SourceInventory.json'),recipes=await Read('Data_Recipes.json'),versions=await Read('Data_Versions.json');
const browser=await LaunchBrowser(),results=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1700,height:1000}});
 page.on('pageerror',e=>errors.push(e.message));
 for(const entry of versions.actions){
  const bounds=[];
  for(const variant of entry.variants){
   await page.goto('http://127.0.0.1:8136/Preview/index.html?action='+entry.id);
   await page.waitForFunction(()=>window.MotionReview&&!MotionReview.loading);
   await page.evaluate(async id=>{MotionReview.setPlaying(false);const v=MotionReview.selected.variants.find(v=>v.id===id);if(!v)throw Error('Missing exact version');await MotionReview.loadVariant(v)},variant.id);
   const sample=await page.evaluate(()=>{
    const m=MotionReview.model,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    const meshes=[];m.model.traverse(o=>{if(o.isMesh&&o.geometry.attributes.position)meshes.push(o)});
    const steps=Math.ceil(m.duration*15);let vertices=0;
    for(let frame=0;frame<=steps;frame++){
     m.action.enabled=true;m.action.paused=false;m.mixer.setTime(m.duration*frame/steps);m.model.updateMatrixWorld(true);
     for(const mesh of meshes){const v=mesh.position.clone();for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);const p=v.toArray();
      for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k])}vertices++;
     }}
    }
    return {min,max,frames:steps+1,vertices,aspect:m.camera.aspect,fov:m.camera.fov,path:MotionReview.variant.path};
   });
   assert.equal(sample.path,variant.path);
   sample.sha256=crypto.createHash('sha256').update(await fs.readFile(path.join(root,variant.path))).digest('hex');
   bounds.push(sample);
  }
  const min=[0,1,2].map(k=>Math.min(...bounds.map(b=>b.min[k]))-.06),max=[0,1,2].map(k=>Math.max(...bounds.map(b=>b.max[k]))+.06);
  const center=min.map((v,k)=>(v+max[k])/2),half=max.map((v,k)=>(v-min[k])/2);
  const aspect=Math.min(...bounds.map(b=>b.aspect)),tanV=Math.tan(bounds[0].fov*Math.PI/360)*.9,tanH=tanV*aspect;
  const review=entry.variants[0].review,views=[[review.defaultCameraYawRadians??0,review.cameraElevationRadians??.16],[0,.16],[review.sideCameraYawRadians??-Math.PI/2,.16],[Math.PI,.16],[.65,.16],[Math.PI/4,Math.PI/4]];
  let distance=0;
  for(const [yaw,elevation] of views){
   const forward=[Math.sin(yaw)*Math.cos(elevation),Math.sin(elevation),Math.cos(yaw)*Math.cos(elevation)],right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[-Math.sin(yaw)*Math.sin(elevation),Math.cos(elevation),-Math.cos(yaw)*Math.sin(elevation)];
   for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
    const p=[x*half[0],y*half[1],z*half[2]],Dot=a=>p.reduce((s,v,k)=>s+v*a[k],0);
    distance=Math.max(distance,Dot(forward)+Math.max(Math.abs(Dot(right))/tanH,Math.abs(Dot(up))/tanV));
   }
  }
  distance=Math.max(4.2,Math.ceil(distance*100)/100);
  const prior={cameraCenter:entry.cameraCenter??[0,.92,0],cameraDistance:entry.cameraDistance};
  entry.cameraCenter=center;entry.cameraDistance=distance;
  const source=inventory.actions.find(a=>a.id===entry.id);assert.ok(source);
  source.cameraCenter=center;source.cameraDistance=distance;recipes[entry.id].cameraDistance=distance;
  results.push({id:entry.id,prior,cameraCenter:center,cameraDistance:distance,bounds,views,projectionMargin:.9,boundsPaddingMeters:.06});
  console.log(entry.id,JSON.stringify({center,distance}));
 }
 assert.deepEqual(errors,[]);
 for(const [name,data] of [['Data_SourceInventory.json',inventory],['Data_Recipes.json',recipes],['Data_Versions.json',versions]])await fs.writeFile(path.join(out,name),JSON.stringify(data,null,2));
 await fs.writeFile(path.join(out,'Data_PreviewFramingFit.json'),JSON.stringify({recordedUtc:new Date().toISOString(),method:'All exported mesh vertices at 15 fps including both endpoints; padded trajectory bounds across named views. Preview camera only; raw, GLB and blend unchanged.',results,errors},null,2));
}finally{await browser.close()}
