import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { ClusterDistantGeometry } from "./Script_DistantGeometry.mjs";
import { BREAKABLE_TREES as T } from "./Data_Tuning_BreakableTrees.mjs";
import { MakeTreePlacements, TreeBlastDamage } from "./Data_BreakableTreePlacements.mjs";

const up = new THREE.Vector3(0,1,0);
function TrunkBox(tree, low, high) {
  const r = T.trunkRadiusM*tree.scale, y = tree.y+(low+high)*tree.scale/2, h = (high-low)*tree.scale/2;
  return { id: `${tree.id}_${low}`, tag: "tree", surface: "wood", c: [tree.x,y,tree.z], h: [r,h,r], ry: 0,
    min: [tree.x-r,y-h,tree.z-r], max: [tree.x+r,y+h,tree.z+r] };
}

// Shell-struck wood is charred. Vertex colours (model space, so every distance level
// and the fallen copy agree) multiply the bark texture: black at the fracture, patchy
// scorch fading up the crown. Only broken-tree materials enable them.
const CHAR = [0.075, 0.066, 0.06], SCORCH = [0.42, 0.29, 0.2];
function Hash3(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function Noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz, s = t => t * t * (3 - 2 * t);
  let v = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1, dy = (k >> 1) & 1, dz = k >> 2;
    v += Hash3(ix + dx, iy + dy, iz + dz) * (dx ? s(fx) : 1 - s(fx)) * (dy ? s(fy) : 1 - s(fy)) * (dz ? s(fz) : 1 - s(fz));
  }
  return v;
}
const Smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function PaintCharred(geometry, cap) {
  const a = geometry.attributes.position, color = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
    const n = Noise3(x * 1.7, y * 1.7, z * 1.7), fine = Noise3(x * 6 + 9, y * 6, z * 6);
    let rgb;
    if (cap) {
      // Burnt cross-section: charcoal with faint grain, a little browner towards the heart.
      const t = 0.7 + 0.6 * fine + 0.5 * Smooth(0.25, 0, Math.hypot(x, z));
      rgb = CHAR.map(c => c * t);
    } else {
      const along = y <= T.breakHeightM + 0.1 ? 0.8 + 0.2 * y / T.breakHeightM : Math.max(0.28, 1 - (y - T.breakHeightM) / 5.2);
      const k = Smooth(0.18, 0.62, along + (n - 0.5) * 0.75 + (fine - 0.5) * 0.3);
      const scorch = Smooth(0, 0.45, k), char = Smooth(0.4, 1, k);
      rgb = [0, 1, 2].map(c => (1 + (SCORCH[c] - 1) * scorch) * (1 - char) + CHAR[c] * (0.8 + 0.5 * fine) * char);
    }
    color.set(rgb, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
}

// A toppled crown collides as a set of convex pieces that follow the trunk and the
// branches (one capsule on the axis left the real mesh resting on a branch tip, or
// floating over the capsule). Deterministic k-means over the full-detail bark.
function ConvexPieces(positions, count) {
  const n = positions.length / 3, P = i => [positions[i*3], positions[i*3+1], positions[i*3+2]];
  const d2 = (p, c) => (p[0]-c[0])**2 + (p[1]-c[1])**2 + (p[2]-c[2])**2;
  let lowest = 0;
  for (let i = 1; i < n; i++) if (positions[i*3+1] < positions[lowest*3+1]) lowest = i;
  const centers = [P(lowest)], nearest = new Float64Array(n).fill(Infinity);
  while (centers.length < count) {
    let far = 0;
    for (let i = 0; i < n; i++) { nearest[i] = Math.min(nearest[i], d2(P(i), centers.at(-1))); if (nearest[i] > nearest[far]) far = i; }
    centers.push(P(far));
  }
  const owner = new Int32Array(n);
  for (let pass = 0; pass < 12; pass++) {
    for (let i = 0; i < n; i++) {
      const p = P(i); let best = 0;
      for (let c = 1; c < centers.length; c++) if (d2(p, centers[c]) < d2(p, centers[best])) best = c;
      owner[i] = best;
    }
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) { const s = sum[owner[i]]; s[0] += positions[i*3]; s[1] += positions[i*3+1]; s[2] += positions[i*3+2]; s[3]++; }
    for (const [c, s] of sum.entries()) if (s[3]) centers[c] = [s[0]/s[3], s[1]/s[3], s[2]/s[3]];
  }
  const directions = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) directions.push([x, y, z]);
  const pieces = [];
  for (let c = 0; c < centers.length; c++) {
    const members = [];
    for (let i = 0; i < n; i++) if (owner[i] === c) members.push(P(i));
    if (members.length < 8) continue;
    const extremes = new Set(directions.map(d => members.reduce((a, b) =>
      b[0]*d[0]+b[1]*d[1]+b[2]*d[2] > a[0]*d[0]+a[1]*d[1]+a[2]*d[2] ? b : a)));
    // The fracture end stays just above the stump collider, as the old capsule did.
    const points = [...extremes].flatMap(p => [p[0], Math.max(p[1], T.breakHeightM + 0.02), p[2]]);
    pieces.push({ points: new Float32Array(points), weight: members.length / n });
  }
  return pieces;
}

// Field-owned resources: small spatial instance batches while standing, ordinary
// meshes with real motion history while falling. No animated instance matrices:
// a distance-detail change only moves a static tree to another static batch.
// Fracture caps are hidden inside a standing tree, so only broken stumps draw them.
const CAP_MATERIAL = "Material_FracturedWood";
export class BreakableTrees {
  static async Load(field) {
    const gltf = await new GLTFLoader().loadAsync("./Model/Model_BreakableDeadTree.glb?v=20260927b");
    return new BreakableTrees(field, gltf.scene);
  }
  constructor(field, source) {
    this.field = field;
    this.root = new THREE.Group(); this.root.name = "BreakableTrees";
    this.parts = []; this.materials = new Set(); this.textures = new Set();
    this.activeTrees = new Set();
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
          // Broken stumps (instanced) and fallen crowns (ordinary meshes) each get their
          // own charred copy: vertex colours on, charcoal is fully matte.
          const charred = material.clone();
          charred.name = `${material.name}_Charred`; charred.vertexColors = true;
          field.library.ConfigureExternalPbr(charred, { metalness: 0, minRoughness: 0.95 });
          const falling = CloneShadedMaterial(charred);
          for (const m of [standing, charred, falling]) this.materials.add(m);
          materialMap.set(material, { standing, charred, falling }); return materialMap.get(material);
        };
        if (Array.isArray(mesh.material)) throw new Error("Tree GLB parts must have one material each");
        const materials = Bind(mesh.material), cap = mesh.material.name === CAP_MATERIAL;
        PaintCharred(geometry, cap);
        // Distant copies only for the bark: fracture caps never leave full detail.
        const lods = T.lod.map(level => level.cellM > 0 && !cap ? ClusterDistantGeometry(geometry, level.cellM) : geometry);
        this.parts.push({ name, cap, geometry, lods, ...materials });
      });
    }
    // Reclaim parser objects, keep only the cloned geometry and shared textures.
    const sourceMaterials = new Set();
    source.traverse(m=>{ if(m.isMesh){m.geometry.dispose();for(const mat of Array.isArray(m.material)?m.material:[m.material])sourceMaterials.add(mat);} });
    sourceMaterials.forEach(m=>m.dispose());
    if (!this.parts.some(p=>p.cap) || this.parts.filter(p=>!p.cap).length!==2) throw new Error("Tree GLB lost its bark/cap split");
    // Until the first UpdateView every tree sits at the cheapest level.
    this.trees = MakeTreePlacements().map(p => ({ ...p, y: field.GroundHeight(p.x,p.z)-0.09,
      health: T.health, broken: false, lod: T.lod.length-1, body: null, fallen: null, fallenBark: [], age: 0, rest: 0 }));
    this.standingTrees = new Set(this.trees);
    const sectors = new Map();
    for (const tree of this.trees) {
      const key = `${Math.floor(tree.x/T.sectorM)}_${Math.floor(tree.z/T.sectorM)}`;
      if(!sectors.has(key))sectors.set(key,{key,trees:[],batches:[]});
      tree.sector = sectors.get(key); tree.sector.trees.push(tree);
      tree.matrix = new THREE.Matrix4().compose(new THREE.Vector3(tree.x,tree.y,tree.z),
        new THREE.Quaternion().setFromAxisAngle(up,tree.ry),new THREE.Vector3().setScalar(tree.scale));
      tree.stump = TrunkBox(tree,0,T.breakHeightM);
      tree.trunk = TrunkBox(tree,T.breakHeightM,5.5);
    }
    // One batch per sector, part, state and detail level; a batch with no members is not drawn.
    // Standing trees use the plain bark; broken stumps and their caps use the charred copies.
    this.sectors = [...sectors.values()];
    for (const sector of this.sectors) {
      for (const part of this.parts) {
        if (part.cap && part.name==="Crown") continue;
        const Add = (geometry, material, suffix, Member) => {
          const batch = new THREE.InstancedMesh(geometry, material, sector.trees.length);
          batch.name = `Trees_${sector.key}_${part.name}${suffix}`;
          batch.castShadow = true; batch.receiveShadow = true;
          sector.batches.push({ batch, Member }); this.root.add(batch);
        };
        if (part.cap) { Add(part.geometry, part.charred, "Cap_L0", tree => tree.broken); continue; }
        for (const [level, geometry] of part.lods.entries()) {
          Add(geometry, part.standing, `_L${level}`, tree => !tree.broken && tree.lod===level);
          if (part.name==="Stump") Add(geometry, part.charred, `Charred_L${level}`, tree => tree.broken && tree.lod===level);
        }
      }
      this.Rebuild(sector);
    }
    const bark = this.parts.find(p => p.name==="Crown" && !p.cap).geometry.attributes.position;
    const positions = new Float32Array(bark.count * 3);
    for (let i = 0; i < bark.count; i++) positions.set([bark.getX(i), bark.getY(i), bark.getZ(i)], i * 3);
    this.hulls = ConvexPieces(positions, T.hullPieces);
    field.scene.add(this.root);
    this.vector = new THREE.Vector3(); this.quaternion = new THREE.Quaternion();
  }
  Rebuild(sector) {
    for (const { batch, Member } of sector.batches) {
      let count = 0;
      for (const tree of sector.trees) if (Member(tree)) batch.setMatrixAt(count++, tree.matrix);
      batch.count = count; batch.visible = count > 0;
      if (count) { batch.instanceMatrix.needsUpdate = true; batch.computeBoundingSphere(); }
    }
  }
  // Called once a frame before the first render (Script_Main.RenderScene), with the drawing camera.
  UpdateView(camera) {
    const e = camera.matrixWorld.elements, h = T.hysteresisM, dirty = new Set();
    for (const tree of this.trees) {
      const d = Math.hypot(tree.x-e[12], tree.y+T.heightM*tree.scale/2-e[13], tree.z-e[14]);
      let level = tree.lod;
      while (level+1 < T.lod.length && d > T.lod[level+1].distanceM+h) level++;
      while (level > 0 && d < T.lod[level].distanceM-h) level--;
      if (level === tree.lod) continue;
      tree.lod = level; dirty.add(tree.sector);
      for (const { mesh, part } of tree.fallenBark) mesh.geometry = part.lods[level];
    }
    for (const sector of dirty) this.Rebuild(sector);
  }
  // The charred programs (instanced broken stump, fallen crown meshes) are first used by
  // a blast. One proxy of each waits below the level until a shadow pass has drawn it, so
  // loading links them instead of the first explosion (TerrainDeformationView.Warm does
  // the same for craters). Called once after the field is built.
  Warm() {
    const proxies=[];let renders=0,shadowed=false,frame=-1;
    const Retire=()=>{for(const m of proxies){m.removeFromParent();if(m.isInstancedMesh)m.dispose();}proxies.length=0;};
    for(const part of this.parts){
      const geometry=part.lods.at(-1),mesh=part.name==="Stump"
        ?new THREE.InstancedMesh(geometry,part.charred,1):new THREE.Mesh(geometry,part.falling);
      if(mesh.isInstancedMesh)mesh.setMatrixAt(0,new THREE.Matrix4());
      mesh.name=`TreeWarm_${part.name}${part.cap?"Cap":""}`;mesh.castShadow=true;mesh.receiveShadow=true;
      mesh.frustumCulled=false;mesh.position.set(this.trees[0]?.x||0,-500,this.trees[0]?.z||0);
      mesh.onAfterShadow=()=>{shadowed=true;};
      mesh.onAfterRender=renderer=>{
        const f=renderer.info.render.frame;if(f!==frame){frame=f;renders++;}
        if(shadowed||renders>=240)queueMicrotask(Retire);
      };
      proxies.push(mesh);this.root.add(mesh);
    }
    return proxies;
  }
  Blast(position,radius,damage) {
    const physics=this.field.physics;
    if(!physics)return 0;
    let broken=0;
    for(const tree of this.standingTrees){
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
    this.standingTrees.delete(tree);
    this.activeTrees.add(tree);
    this.Rebuild(tree.sector);
    const physics=this.field.physics;
    physics.RemoveSolid(tree.trunk._physicsHandle);
    const index=this.field.colliders.indexOf(tree.trunk);if(index>=0)this.field.colliders.splice(index,1);
    const root=new THREE.Group();root.name=`Fallen_${tree.id}`;
    root.position.set(tree.x,tree.y,tree.z);root.rotation.y=tree.ry;root.scale.setScalar(tree.scale);
    for(const p of this.parts.filter(p=>p.name==="Crown")){
      const m=new THREE.Mesh(p.lods[tree.lod],p.falling);m.castShadow=true;m.receiveShadow=true;root.add(m);
      if(!p.cap)tree.fallenBark.push({mesh:m,part:p});
    }
    this.root.add(root);tree.fallen=root;
    let dx=tree.x-origin.x,dz=tree.z-origin.z,length=Math.hypot(dx,dz);
    if(length<0.01){dx=Math.cos(tree.ry);dz=Math.sin(tree.ry);length=1;}
    dx/=length;dz/=length;
    // The body origin is the tree's own origin, so the fallen mesh copies the body pose.
    const mass=T.massKg*tree.scale**3;
    tree.body=physics.MakeHullBody({
      position:{x:tree.x,y:tree.y,z:tree.z},quaternion:root.quaternion,
      velocity:{x:dx*T.impulseSpeed,y:0.7,z:dz*T.impulseSpeed},
      angularVelocity:{x:dz*T.spinSpeed,y:0,z:-dx*T.spinSpeed},
      hulls:this.hulls.map(h=>h.points.map(v=>v*tree.scale)),masses:this.hulls.map(h=>h.weight*mass),
      linearDamping:0.3,angularDamping:0.3,restitution:0.02,
    });
    this.PlaceGround(tree,tree.x,tree.z);
  }
  // The analytic ground is not in Rapier. While a crown falls, a debris-only heightfield
  // of the ground under it (trench cuts and craters included) catches the real hull pieces.
  PlaceGround(tree,x,z) {
    const cell=T.groundCellM,cells=Math.ceil(2*(T.heightM*tree.scale+T.groundMarginM)/cell),size=cells*cell;
    const x0=x-size/2,z0=z-size/2,heights=new Float32Array((cells+1)**2);
    for(let i=0;i<=cells;i++)for(let k=0;k<=cells;k++)heights[k+i*(cells+1)]=this.field.GroundHeight(x0+i*cell,z0+k*cell);
    this.field.physics.SetDebrisGround(`tree:${tree.id}`,{x0,z0,sizeM:size,cells,heights});
    tree.ground={x,z};
  }
  Update(dt) {
    if(!this.activeTrees.size)return;
    const physics=this.field.physics;if(!physics||physics.disposed)return;
    for(const tree of this.activeTrees){
      tree.age+=dt;
      const body=tree.body,at=body.translation(),q=body.rotation();
      this.quaternion.set(q.x,q.y,q.z,q.w);
      tree.fallen.quaternion.copy(this.quaternion);
      tree.fallen.position.set(at.x,at.y,at.z);
      tree.fallen.updateMatrixWorld(true);
      // A crown that slides or rolls away takes its patch of ground along.
      const mid=this.vector.set(0,(T.heightM+T.breakHeightM)*tree.scale/2,0).applyQuaternion(this.quaternion).add(at);
      if(Math.hypot(mid.x-tree.ground.x,mid.z-tree.ground.z)>T.heightM*tree.scale/2+T.groundMarginM)this.PlaceGround(tree,mid.x,mid.z);
      const v=body.linvel(),w=body.angvel();
      const still=Math.hypot(v.x,v.y,v.z)<0.15&&Math.hypot(w.x,w.y,w.z)<0.15;
      tree.rest=still?tree.rest+dt:0;
      if(tree.rest>1 || tree.age>T.settleAfterS){
        physics.RemoveBody(body);tree.body=null;
        physics.RemoveDebrisGround(`tree:${tree.id}`);
        this.activeTrees.delete(tree);
        // Final pose remains an ordinary static mesh, with no physics, terrain
        // sampling or matrix recomposition after settling. Motion history stays
        // under the shared renderer contract, including the final moving frame.
        tree.fallen.traverse(mesh=>{
          mesh.updateMatrix();mesh.matrixAutoUpdate=false;mesh.matrixWorldAutoUpdate=false;
        });
      }
    }
  }
  Snapshot(){return {count:this.trees.length,broken:this.trees.filter(t=>t.broken).length,
    activeBodies:this.activeTrees.size,standing:this.standingTrees.size,settled:this.trees.filter(t=>t.broken&&!t.body).length,
    lod:T.lod.map((_,level)=>this.trees.filter(t=>t.lod===level).length),trees:this.trees.map(t=>({id:t.id,x:t.x,y:t.y,z:t.z,scale:t.scale,
      broken:t.broken,health:t.health,fallPosition:t.fallen?.position.toArray(),fallRotation:t.fallen?.quaternion.toArray()}))};}
  Dispose(){
    for(const tree of this.trees)if(tree.body){this.field.physics?.RemoveBody(tree.body);this.field.physics?.RemoveDebrisGround(`tree:${tree.id}`);}
    const colliders=new Set(this.trees.flatMap(t=>[t.stump,t.trunk]));
    if(!this.field.physics?.disposed)for(const collider of colliders)this.field.physics?.RemoveSolid(collider._physicsHandle);
    this.field.colliders=this.field.colliders.filter(c=>!colliders.has(c));
    this.field.BuildCollisionGrid();
    this.root.removeFromParent();this.root.traverse(m=>{if(m.isInstancedMesh)m.dispose();});
    for(const p of this.parts)for(const g of new Set(p.lods))g.dispose();
    for(const m of this.materials){this.field.library.externalPbrMaterials?.delete(m);m.dispose();}
    for(const t of this.textures)t.dispose();
    this.trees.length=0;
    this.activeTrees.clear();this.standingTrees.clear();
  }
}
