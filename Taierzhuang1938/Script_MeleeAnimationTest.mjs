// Blender data integrity and real animated rigs. --bakefp writes source-project hand/weapon samples.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MELEE_NRA_ANIMATIONS as nra} from './Data_MeleeNraAnimations.mjs';
import {MELEE_IJA_ANIMATIONS as ija} from './Data_MeleeIjaAnimations.mjs';
import {MELEE_ANIMATION_ACTIONS as actions} from './Data_MeleeCombat.mjs';
import {FPS_ARM_LIMITS} from './Data_FpsArmPoses.mjs';
import {MESHES,WeaponMeshId,WEAPON_MESH_VARIANTS} from './Data_Meshes.mjs';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const project=path.dirname(fileURLToPath(import.meta.url));
assert.equal(WeaponMeshId('Dadao'),'Dadao');
assert.equal(MESHES.Dadao.triangles,4199);
assert.equal(WeaponMeshId('Dadao',1),'Dadao','retired variant must resolve to the historical sword');
assert(!WEAPON_MESH_VARIANTS.Dadao?.some(id=>id!=='Dadao'));
for(const data of [nra,ija]) {
  assert.equal(data.schema,2);assert.equal(data.parts.length,50);
  for(const weapon of ['Dadao','Bayonet']) for(const action of actions) {
    const clip=data.clips[weapon+action];assert(clip,weapon+action);assert.equal(clip.frames.length,31);
    for(const frame of clip.frames){assert.equal(frame.length,359);assert(frame.every(Number.isFinite));}
    assert(clip.frames.some(f=>JSON.stringify(f)!==JSON.stringify(clip.frames[0])),`${weapon}${action} must move`);
  }
}
const bake=process.argv.includes('--bakefp');
const server=await ServeRoot(path.resolve(project,'..'),0);
const browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//,r=>r.abort('blockedbyclient'));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&melee=1&quality=medium&scale=small`,{waitUntil:'load',timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.state?.ready&&window.Taierzhuang?.state?.running&&window.Taierzhuang?.Debug?.MeleeCombat,null,{timeout:120000});
  const data=await page.evaluate(async({actions,bake})=>{
    const THREE=await import('./vendor/three/build/three.module.js');
    const T=Taierzhuang,L=T.Debug.MeleeCombat;
    const inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4(),vector=new THREE.Vector3();
    const CaptureMatrix=(object,relative)=>{relative.updateWorldMatrix(true,true);object.updateWorldMatrix(true,true);inverse.copy(relative.matrixWorld).invert();return matrix.multiplyMatrices(inverse,object.matrixWorld).toArray().map(x=>+x.toFixed(7));};
    const Geometry=root=>{
      const meshes=[];root.updateWorldMatrix(true,true);const inv=root.matrixWorld.clone().invert();
      root.traverse(o=>{if(!o.isMesh||!o.visible)return;for(let p=o.parent;p&&p!==root;p=p.parent)if(!p.visible)return;
        const m=new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld),position=o.geometry.attributes.position;
        const vertices=[];for(let i=0;i<position.count;i++){vector.fromBufferAttribute(position,i).applyMatrix4(m);vertices.push(...vector.toArray());}
        const normalMatrix=new THREE.Matrix3().getNormalMatrix(m),normal=o.geometry.attributes.normal,uv=o.geometry.attributes.uv;
        const normals=normal?Array.from({length:normal.count},(_,i)=>vector.fromBufferAttribute(normal,i).applyMatrix3(normalMatrix).normalize().toArray()):null;
        const uvs=uv?Array.from({length:uv.count},(_,i)=>[uv.getX(i),uv.getY(i)]):null;
        const material=Array.isArray(o.material)?o.material[0]:o.material;
        meshes.push({vertices,uvs,normals,indices:o.geometry.index?Array.from(o.geometry.index.array):Array.from({length:position.count},(_,i)=>i),color:material?.color?.getHex?.()??0x777777});
      });return meshes;
    };
    const result={clips:{},weapons:{},boneNames:[],checks:[]};
    for(const weapon of ['Dadao','Bayonet']) {
      L.Select(weapon+'One');L.Pause(true);T.StepFrames(90,1/60,false);
      if(weapon==='Dadao'){
        if(T.viewmodel.weaponVariant!==0)throw new Error('Whitebox selected a retired sword variant');
        const meshes=Geometry(T.viewmodel.rig.group);
        if(meshes.reduce((n,m)=>n+m.indices.length/3,0)!==4199)throw new Error('First person is not the authored ring-pommel Dadao');
        let pbr=false;T.viewmodel.rig.group.traverse(o=>{if(o.isMesh&&o.material?.map&&o.material?.normalMap)pbr=true;});
        if(!pbr)throw new Error('Historical Dadao lost its source PBR');
        const factory=T.ai.soldiers[0].actor.factory;
        for(const variant of [0,1])if(factory.WeaponGeometry('Dadao',variant).meshId!=='Dadao')throw new Error('Actor still resolves to the retired sword');
      }
      const rig=T.viewmodel.riggedArms, bones=[];rig.root.traverse(o=>{if(o.isBone)bones.push(o);});
      result.boneNames=bones.map(b=>b.name);
      if(bake)result.weapons[weapon]=Geometry(T.viewmodel.rig.group);
      for(const action of actions) {
        const frames=[];let seen=0,gripMax=0,wristMax=0;const handTrace=[];
        for(let i=0;i<=30;i++) {
          L.Preview(action,i/30);T.StepFrames(1,1/60,false);
          T.camera.updateWorldMatrix(true,true);rig.root.updateWorldMatrix(true,true);
          const actor=T.ai.soldiers[0].actor;
          if(actor.characterRig.meleeAnimation.bones.length!==50)throw new Error('Unmatched third person bones');
          if(T.viewmodel.lastMeleeClip!==weapon+action)throw new Error('Missing first person animation');
          if(!T.viewmodel.root.visible)throw new Error('Invisible first person weapon after reset');
          const hand=rig.bones.r.hand.getWorldPosition(new THREE.Vector3()).project(T.camera);
          if(Math.abs(hand.x)<1.1&&Math.abs(hand.y)<1.1)seen++;
          handTrace.push([hand.x,hand.y,hand.z]);
          gripMax=Math.max(gripMax,rig.gripError.r,rig.gripError.l);
          wristMax=Math.max(wristMax,rig.wristBend.r,rig.wristBend.l);
          if(bake)frames.push({bones:bones.map(b=>CaptureMatrix(b,T.camera)),weapon:CaptureMatrix(T.viewmodel.rig.group,T.camera),carrier:[...T.viewmodel.actionPivot.position.toArray(),...T.viewmodel.actionPivot.rotation.toArray().slice(0,3),...T.viewmodel.swingPivot.rotation.toArray().slice(0,3)]});
        }
        if(!handTrace.flat().every(Number.isFinite))throw new Error('Non-finite FP hand '+weapon+action);
        result.checks.push({clip:weapon+action,seen,gripMax,wristMax});if(bake)result.clips[weapon+action]=frames;
      }
    }
    return result;
  },{actions,bake});
  assert(data.boneNames.length>=50);assert.equal(data.checks.length,42);
  const failed=data.checks.find(check=>check.seen<16||check.gripMax>FPS_ARM_LIMITS.positionResidualM||check.wristMax>FPS_ARM_LIMITS.wristBendDeg+.01);
  if(failed){
    await page.evaluate(clip=>{const weapon=clip.startsWith('Dadao')?'Dadao':'Bayonet';Taierzhuang.Debug.MeleeCombat.Select(weapon+'One');Taierzhuang.Debug.MeleeCombat.Preview(clip.slice(weapon.length),.5);Taierzhuang.StepFrames(1,1/60,true);},failed.clip);
    fs.mkdirSync(path.join(project,'_shots'),{recursive:true});
    await page.screenshot({path:path.join(project,'_shots','Scene_MeleeAnimationFailure.png')});
    console.log(JSON.stringify(data.checks));
  }
  for(const check of data.checks){
    assert(check.seen>=16,`${check.clip}: first-person hand absent for most frames (${check.seen}/31)`);
    assert(check.gripMax<=FPS_ARM_LIMITS.positionResidualM,`${check.clip}: hand leaves grip by ${check.gripMax}m`);
    assert(check.wristMax<=FPS_ARM_LIMITS.wristBendDeg+.01,`${check.clip}: wrist over-bends to ${check.wristMax} degrees`);
  }
  if(bake){fs.mkdirSync(path.join(project,'_shots'),{recursive:true});fs.writeFileSync(path.join(project,'_shots','Data_MeleeFirstPersonBake.json'),JSON.stringify(data));}
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({clips:data.checks,bones:data.boneNames.length,bake}));
  console.log('PASS 84 Blender body clips and 42 real first person clips');
}finally{await browser.close();await new Promise(r=>server.close(r));}
