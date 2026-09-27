import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { BREAKABLE_TREES as T } from "./Data_Tuning_BreakableTrees.mjs";
import { MakeTreePlacements, TreeBlastDamage } from "./Data_BreakableTreePlacements.mjs";

const up = new THREE.Vector3(0,1,0);
function TrunkBox(tree, low, high) {
  const r = T.trunkRadiusM*tree.scale, y = tree.y+(low+high)*tree.scale/2, h = (high-low)*tree.scale/2;
  return { id: `${tree.id}_${low}`, tag: "tree", surface: "wood", c: [tree.x,y,tree.z], h: [r,h,r], ry: 0,
    min: [tree.x-r,y-h,tree.z-r], max: [tree.x+r,y+h,tree.z+r] };
}

// Field-owned resources: small spatial instance batches while standing, ordinary
// meshes with real motion history while falling. No animated instance matrices.
export class BreakableTrees {
  static async Load(field) {
    const gltf = await new GLTFLoader().loadAsync("./Model/Model_BreakableDeadTree.glb?v=20260927a");
    return new BreakableTrees(field, gltf.scene);
  }
  constructor(field, source) {
    this.field = field;
    this.root = new THREE.Group(); this.root.name = "BreakableTrees";
    this.parts = []; this.materials = new Set(); this.textures = new Set();
    const materialMap = new Map();
    source.updateMatrixWorld(true);
    for (const name of ["Stump","Crown"]) {
      const branch = source.getObjectByName(name);
      if (!branch) throw new Error(`Missing tree part ${name}`);
      branch.traverse(mesh => {
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        const Bind = material => {
          if (materialMap.has(material)) return materialMap.get(material);
          for (const v of Object.values(material)) if (v?.isTexture) this.textures.add(v);
          const standing = material.clone();
          field.library.ConfigureExternalPbr(standing, { metalness: 0, minRoughness: 0.75 });
          const falling = CloneShadedMaterial(standing);
          this.materials.add(standing); this.materials.add(falling);
          materialMap.set(material, { standing, falling }); return materialMap.get(material);
        };
        const materials = Array.isArray(mesh.material) ? mesh.material.map(Bind) : Bind(mesh.material);
        this.parts.push({ name, geometry,
          standing: Array.isArray(materials) ? materials.map(m=>m.standing) : materials.standing,
          falling: Array.isArray(materials) ? materials.map(m=>m.falling) : materials.falling });
      });
    }
    // Reclaim parser objects, keep only the cloned geometry and shared textures.
    const sourceMaterials = new Set();
    source.traverse(m=>{ if(m.isMesh){m.geometry.dispose();for(const mat of Array.isArray(m.material)?m.material:[m.material])sourceMaterials.add(mat);} });
    sourceMaterials.forEach(m=>m.dispose());
    this.trees = MakeTreePlacements().map(p => ({ ...p, y: field.GroundHeight(p.x,p.z)-0.09,
      health: T.health, broken: false, batches: [], body: null, fallen: null, age: 0, rest: 0 }));
    const sectors = new Map();
    for (const tree of this.trees) {
      const key = `${Math.floor(tree.x/T.sectorM)}_${Math.floor(tree.z/T.sectorM)}`;
      if(!sectors.has(key))sectors.set(key,[]);sectors.get(key).push(tree);
      tree.stump = TrunkBox(tree,0,T.breakHeightM);
      tree.trunk = TrunkBox(tree,T.breakHeightM,5.5);
    }
    for (const [key, trees] of sectors) for (const part of this.parts) {
      const batch = new THREE.InstancedMesh(part.geometry, part.standing, trees.length);
      batch.name = `Trees_${key}_${part.name}`; batch.castShadow = true; batch.receiveShadow = true;
      for (const [i,tree] of trees.entries()) {
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(tree.x,tree.y,tree.z),
          new THREE.Quaternion().setFromAxisAngle(up,tree.ry),new THREE.Vector3().setScalar(tree.scale));
        batch.setMatrixAt(i,matrix);
        if(part.name==="Crown")tree.batches.push({batch,index:i});
      }
      batch.computeBoundingSphere(); this.root.add(batch);
    }
    // Sample all directions' extreme vertices for sloping analytic-ground support.
    const points=[];
    for(const part of this.parts.filter(p=>p.name==="Crown")){
      const a=part.geometry.attributes.position;
      for(let i=0;i<a.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(a,i));
    }
    this.support=[];
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
      if(!x&&!y&&!z)continue;
      const d=new THREE.Vector3(x,y,z);
      this.support.push(points.reduce((a,b)=>b.dot(d)>a.dot(d)?b:a).clone());
    }
    field.scene.add(this.root);
    this.vector = new THREE.Vector3(); this.quaternion = new THREE.Quaternion();
  }
  Blast(position,radius,damage) {
    const physics=this.field.physics;
    if(!physics)return 0;
    let broken=0;
    for(const tree of this.trees){
      if(tree.broken)continue;
      const target=new THREE.Vector3(tree.x,tree.y+T.breakHeightM*tree.scale,tree.z);
      const delta=target.clone().sub(position),distance=delta.length();
      const dealt=TreeBlastDamage(distance,radius,damage);
      if(!dealt)continue;
      const hit=this.field.Raycast(position,delta.normalize(),distance,{terrain:true,excludeCollider:tree.trunk});
      if(hit && hit.box!==tree.stump && hit.t<distance-0.35)continue;
      tree.health-=dealt;
      if(tree.health<=0){this.Break(tree,position);broken++;}
    }
    if(broken){this.field.BuildCollisionGrid();physics.RefreshStaticQueries();}
    return broken;
  }
  Break(tree,origin) {
    if(tree.broken)return;
    tree.broken=true;
    for(const {batch,index} of tree.batches){batch.setMatrixAt(index,new THREE.Matrix4().makeScale(0,0,0));batch.instanceMatrix.needsUpdate=true;}
    const physics=this.field.physics;
    physics.RemoveSolid(tree.trunk._physicsHandle);
    const index=this.field.colliders.indexOf(tree.trunk);if(index>=0)this.field.colliders.splice(index,1);
    const root=new THREE.Group();root.name=`Fallen_${tree.id}`;
    root.position.set(tree.x,tree.y,tree.z);root.rotation.y=tree.ry;root.scale.setScalar(tree.scale);
    for(const p of this.parts.filter(p=>p.name==="Crown")){
      const m=new THREE.Mesh(p.geometry,p.falling);m.castShadow=true;m.receiveShadow=true;root.add(m);
    }
    this.root.add(root);tree.fallen=root;
    let dx=tree.x-origin.x,dz=tree.z-origin.z,length=Math.hypot(dx,dz);
    if(length<0.01){dx=Math.cos(tree.ry);dz=Math.sin(tree.ry);length=1;}
    dx/=length;dz/=length;
    tree.centerY=(T.heightM+T.breakHeightM)*tree.scale/2;
    tree.body=physics.MakeLimbBody({
      position:{x:tree.x,y:tree.y+tree.centerY,z:tree.z},quaternion:root.quaternion,
      velocity:{x:dx*T.impulseSpeed,y:0.7,z:dz*T.impulseSpeed},
      angularVelocity:{x:dz*T.spinSpeed,y:0,z:-dx*T.spinSpeed},
      halfLength:(T.heightM-T.breakHeightM)*tree.scale/2,radius:T.trunkRadiusM*tree.scale,
      mass:T.massKg*tree.scale**3,linearDamping:0.35,angularDamping:0.3,restitution:0.02,
    });
  }
  Update(dt) {
    const physics=this.field.physics;if(!physics||physics.disposed)return;
    for(const tree of this.trees){
      if(!tree.body)continue;
      tree.age+=dt;
      const body=tree.body,p=body.translation(),q=body.rotation();
      this.quaternion.set(q.x,q.y,q.z,q.w);
      let penetration=-Infinity;
      for(const point of this.support){
        this.vector.copy(point).multiplyScalar(tree.scale);this.vector.y-=tree.centerY;
        this.vector.applyQuaternion(this.quaternion).add(p);
        penetration=Math.max(penetration,this.field.GroundHeight(this.vector.x,this.vector.z)-this.vector.y+0.03);
      }
      if(penetration>0){
        body.setTranslation({x:p.x,y:p.y+penetration,z:p.z},true);
        const v=body.linvel(),w=body.angvel(),drag=Math.exp(-4*dt);
        body.setLinvel({x:v.x*drag,y:Math.max(0,v.y)*0.2,z:v.z*drag},true);
        const axis=this.vector.copy(up).applyQuaternion(this.quaternion),tip=-Math.sign(axis.y)*3.5*Math.abs(axis.y);
        body.setAngvel({x:w.x*drag-axis.z*tip*dt,y:w.y*drag,z:w.z*drag+axis.x*tip*dt},true);
      }
      const at=body.translation();
      tree.fallen.quaternion.copy(this.quaternion);
      tree.fallen.position.copy(at).add(this.vector.set(0,-tree.centerY,0).applyQuaternion(this.quaternion));
      tree.fallen.updateMatrixWorld(true);
      const v=body.linvel(),w=body.angvel();
      const still=Math.hypot(v.x,v.y,v.z)<0.15&&Math.hypot(w.x,w.y,w.z)<0.15;
      tree.rest=still?tree.rest+dt:0;
      if(tree.rest>1 || (tree.age>T.settleAfterS && penetration>=-0.05)){
        physics.RemoveBody(body);tree.body=null;
      }
    }
  }
  Snapshot(){return {count:this.trees.length,broken:this.trees.filter(t=>t.broken).length,
    activeBodies:this.trees.filter(t=>t.body).length,trees:this.trees.map(t=>({id:t.id,x:t.x,y:t.y,z:t.z,scale:t.scale,
      broken:t.broken,health:t.health,fallPosition:t.fallen?.position.toArray(),fallRotation:t.fallen?.quaternion.toArray()}))};}
  Dispose(){
    for(const tree of this.trees)if(tree.body)this.field.physics?.RemoveBody(tree.body);
    const colliders=new Set(this.trees.flatMap(t=>[t.stump,t.trunk]));
    if(!this.field.physics?.disposed)for(const collider of colliders)this.field.physics?.RemoveSolid(collider._physicsHandle);
    this.field.colliders=this.field.colliders.filter(c=>!colliders.has(c));
    this.field.BuildCollisionGrid();
    this.root.removeFromParent();this.root.traverse(m=>{if(m.isInstancedMesh)m.dispose();});
    for(const p of this.parts)p.geometry.dispose();
    for(const m of this.materials){this.field.library.externalPbrMaterials?.delete(m);m.dispose();}
    for(const t of this.textures)t.dispose();
    this.trees.length=0;
  }
}
