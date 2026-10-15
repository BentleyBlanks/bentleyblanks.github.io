// Export evaluated production palms, skinned vertices and weapons for Blender calibration.
// Usage: node Taierzhuang1938/Script_FpsWeaponGripExport.mjs [local output directory] [--only=Grenade,Dadao] [--clean]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
import {FPS_WEAPON_GRIPS} from './Data_FpsWeaponGrips.mjs';
const project=path.dirname(fileURLToPath(import.meta.url));
const out=process.argv.slice(2).find(a=>!a.startsWith('--'))||path.join(project,'_shots','GripRepair');
const ids=(process.argv.find(a=>a.startsWith('--only='))?.slice(7)||'Grenade,GrenadeBundle,Dadao,Zb26').split(',');
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'Data_GripConfig.json'),JSON.stringify(FPS_WEAPON_GRIPS));
const server=await ServeRoot(path.dirname(project),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&shot=1&manual=1&quality=high&scale=small`,{timeout:120000});
 await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:240000});
 console.log('READY');
 await page.evaluate(()=>{const T=Taierzhuang;T.Debug.OpenEditor('firstPerson');T.StepFrames(2);});
 await page.addStyleTag({content:'.edMenuBar,.edGear{display:none!important}'});
 for(const id of ids){
  await page.evaluate(({id,clean})=>{const T=Taierzhuang,e=T.editor.active;e.SetWeapon(id);e.SetPose('hip');e.SetView('player');if(clean)e.SetAnimationClean(true);for(let i=0;i<90;i++)e.Update(1/60);T.StepFrames(1);},{id,clean:process.argv.includes('--clean')});
  const pkg=await page.evaluate(async()=>{
   const THREE=await import('./vendor/three/build/three.module.js');
   const T=Taierzhuang,vm=T.viewmodel,arms=vm.riggedArms,G=vm.rig.group;
   vm.root.updateMatrixWorld(true);arms.root.traverse(m=>{if(m.isSkinnedMesh)m.skeleton.update();});
   const inv=G.matrixWorld.clone().invert(),R=v=>+v.toFixed(7),gun=[],chain={},pads={},skin=[];
   G.traverse(o=>{if(!o.isMesh||o.isSkinnedMesh)return;for(let q=o;q&&q!==G.parent;q=q.parent)if(!q.visible)return;
    const p=o.geometry.attributes.position,index=o.geometry.index,m=inv.clone().multiply(o.matrixWorld);
    for(let i=0;i<(index?.count||p.count);i+=3){const t=[0,1,2].flatMap(j=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(m).toArray().map(R));gun.push(t);}
   });
   for(const side of ['r','l']){
    chain[side]={};
    for(const c of arms.anatomy[side].curls){const b=c.bone;chain[side][b.name]={world:inv.clone().multiply(b.matrixWorld).toArray(),parentWorld:inv.clone().multiply(b.parent.matrixWorld).toArray(),local:b.quaternion.toArray(),axis:c.axis.toArray(),spreadAxis:c.spreadAxis.toArray(),position:b.position.toArray(),scale:b.scale.toArray(),rest:c.rest.toArray()};}
    for(let digit=0;digit<5;digit++){
     const bone=arms.anatomy[side].curls.find(c=>c.bone.name.toLowerCase().endsWith(`finger${digit}2`)).bone,pts=[];
     arms.root.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;const geo=mesh.geometry,index=mesh.skeleton.bones.indexOf(bone);
      for(let i=0;i<geo.attributes.position.count;i++){let w=0;for(let j=0;j<4;j++)if(geo.attributes.skinIndex.getComponent(i,j)===index)w+=geo.attributes.skinWeight.getComponent(i,j);
       if(w>.95)pts.push(bone.worldToLocal(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));}
     });
     const box=new THREE.Box3().setFromPoints(pts),point=new THREE.Vector3(box.max.x*.78,box.max.y*(digit?.9:.75),(box.min.z+box.max.z)*.5);
     pads[`${side}${digit}2`]={bone:bone.name,point:point.toArray()};
    }
   }
   arms.root.traverse(mesh=>{if(!mesh.isSkinnedMesh||!mesh.visible)return;mesh._RefreshFpsGripGeometry?.();const geo=mesh.geometry,n=geo.attributes.position.count,pos=[],infl=[],wts=[],v=new THREE.Vector3();
    const correctiveData=mesh._fpsGripCorrectiveData,basisAttributes=correctiveData?.basisAttributes||geo.attributes,
      logicalMorphs=correctiveData?.morphAttributes||geo.morphAttributes,morphRelative=correctiveData?.relative??geo.morphTargetsRelative;
    const morphWeights=mesh.morphTargetInfluences||[],activeMorph=morphWeights.some(weight=>Math.abs(weight)>1e-8);
    const AttributeValues=attribute=>attribute?Array.from({length:attribute.count},(_,i)=>[attribute.getX(i),attribute.getY(i),attribute.getZ(i)]).flat():null;
    const PreSkin=name=>{const attribute=geo.attributes[name];if(!attribute)return null;const targets=geo.morphAttributes[name]||[],p=new THREE.Vector3(),delta=new THREE.Vector3(),values=[];
     // CPU corrective attributes already contain the logical morph blend.
     // Read them once; adding the saved targets here would double the shape.
     if(correctiveData)return AttributeValues(attribute);
     for(let i=0;i<n;i++){p.fromBufferAttribute(attribute,i);for(let j=0;j<targets.length;j++)if(morphWeights[j]){delta.fromBufferAttribute(targets[j],i);if(!geo.morphTargetsRelative)delta.sub(v.fromBufferAttribute(attribute,i));p.addScaledVector(delta,morphWeights[j]);}if(name==='normal'&&activeMorph)p.normalize();values.push(...p.toArray());}return values;};
    for(let i=0;i<n;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);pos.push(...v.toArray().map(R));for(let j=0;j<4;j++){infl.push(geo.attributes.skinIndex.getComponent(i,j));wts.push(geo.attributes.skinWeight.getComponent(i,j));}}
    skin.push({name:mesh.name,pos,idx:geo.index?Array.from(geo.index.array):null,bones:mesh.skeleton.bones.map(b=>b.name),infl,wts,
      // rest/normals are evaluated before skinning, so exact CPU LBS also
      // reproduces a loaded grip corrective. baseRest remains asset provenance.
      rest:PreSkin('position'),baseRest:correctiveData||activeMorph?AttributeValues(basisAttributes.position):undefined,
      morphState:logicalMorphs.position?.length?{names:mesh.morphTargetDictionary,weights:Array.from(morphWeights),relative:morphRelative,evaluation:correctiveData?'cpu-attributes':undefined}:null,
      uv:geo.attributes.uv?Array.from(geo.attributes.uv.array):null,normals:PreSkin('normal'),
      baseNormals:(correctiveData||activeMorph)&&basisAttributes.normal?AttributeValues(basisAttributes.normal):undefined,
      bindMatrix:mesh.bindMatrix.toArray(),inverseBinds:mesh.skeleton.boneInverses.map(m=>m.toArray()),
      materialNames:[].concat(mesh.material).map(m=>m.name)});
   });
   const bones=[];arms.root.traverse(o=>{if(o.isBone)bones.push(o);});
   return {weapon:vm.weaponId,armPose:vm.armPoseKey,contacts:vm.armPose.contacts,gun,chain,pads,skin,fixedRestLengths:arms.fixedRestLengths,report:arms.report,wristBend:{...arms.wristBend},contactWeight:{...arms.contactWeight},
    boneNames:bones.map(b=>b.name),boneParents:bones.map(b=>b.parent?.isBone?b.parent.name:null),boneMatrices:bones.map(b=>b.matrixWorld.toArray()),weaponMatrix:G.matrixWorld.toArray(),cameraMatrix:T.camera.matrixWorld.toArray(),armMatrix:arms.root.matrixWorld.toArray()};
  });
  await fs.writeFile(path.join(out,`Data_${id}.json`),JSON.stringify(pkg));console.log(id,JSON.stringify(pkg.report));
  if(process.argv.includes('--data-only'))continue;
  await page.screenshot({path:path.join(out,`Image_${id}_Player.png`)});
  for(const preset of ['rightRear','leftRear','top']){
   await page.evaluate(p=>{const T=Taierzhuang,e=T.editor.active;e.SetView('inspect');e.SetInspectPreset(p);T.StepFrames(2);},preset);
   await page.screenshot({path:path.join(out,`Image_${id}_${preset}.png`)});
  }
 }
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();await new Promise(r=>server.close(r));}
