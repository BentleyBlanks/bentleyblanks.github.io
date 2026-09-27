import * as THREE from "three";
import { FIRST_LEVEL_SMOKE_ORIGINS } from "./Data_FirstLevelSmokeOrigins.mjs";
import { MISSION_TUNING } from "./Data_Tuning_FirstLevel.mjs";
import { BuildSink } from "./Script_World.mjs";
import { ScaleBoxUv } from "./Script_Geo.mjs";
import { Mulberry32 } from "./Script_Noise.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { ApplyShadowDepth } from "./Script_ShadowDepth.mjs";
import { Type89Damage } from "./Script_Type89Damage.mjs";

// Static wreckage is merged by sector/material. Only the existing VFX batches move.
export class FirstLevelSmokeOrigins {
  constructor({ root, battlefield, physics, actorFactory, library }) {
    Object.assign(this, { battlefield, physics });
    this.root = new THREE.Group(); this.root.name = "FirstLevelSmokeOrigins"; root.add(this.root);
    this.entries = new Map(); this.colliders = []; this.materials = new Map();
    const Material = (id, source, color, metalness = 0) => {
      const material = CloneShadedMaterial(library.Get(source, { side: THREE.DoubleSide }));
      material.color.setHex(color); material.roughness = .96; material.metalness = metalness;
      this.materials.set(id, material); return material;
    };
    Material("armor", "Type89Armor", 0x393329, .18);
    Material("track", "Type89Track", 0x433f36, .18);
    Material("steel", "Steel", 0x655b4b, .22);
    Material("wood", "WoodBeam", 0x544333);
    Material("brick", "BrickWallSooty", 0x6b5744);
    Material("scorch", "CraterScorched", 0x26231f);
    const coals = Material("coals", "WoodBeam", 0x351d10);
    coals.emissive.setHex(0xce3708); coals.emissiveIntensity = .65;
    const sink = new BuildSink();
    for (const spec of FIRST_LEVEL_SMOKE_ORIGINS) this.Build(spec, sink, actorFactory);
    this.meshes = sink.Flush(this.root, { Get: key => this.materials.get(key) });
    ApplyShadowDepth(this.root);
    for (const collider of sink.colliders) {
      physics.AddSolid(collider); battlefield.colliders.push(collider); this.colliders.push(collider);
    }
  }
  Build(spec, sink, actorFactory) {
    const random = Mulberry32(spec.seed), group = new THREE.Group();
    const groundAt = (x,z) => this.battlefield.StaticGroundHeight(x,z);
    const firePoint = new THREE.Vector3();
    group.rotation.y = spec.yaw; group.scale.setScalar(spec.scale);
    const Mesh = (key, geometry, x=0, y=0, z=0, rx=0, ry=0, rz=0) => {
      const mesh = new THREE.Mesh(geometry, this.materials.get(key));
      mesh.position.set(x,y,z); mesh.rotation.set(rx,ry,rz); group.add(mesh); return mesh;
    };
    const Box = (key,w,h,d,x,y,z,rx=0,ry=0,rz=0) => Mesh(key,ScaleBoxUv(new THREE.BoxGeometry(w,h,d),w,h,d,1,spec.seed),x,y,z,rx,ry,rz);
    let damage = null, model = null, half;
    if (spec.kind === "tank") {
      const materials = {type89Armor:this.materials.get("armor"),type89Track:this.materials.get("track"),type89Barrel:this.materials.get("steel")};
      model = actorFactory.ModelInstance("Type89Tank", materials);
      if(!model)throw new Error("Smoke origins require the preloaded Type89Tank model");
      group.add(model.root);
      damage = new Type89Damage({root:group,model,materials,vfx:null,groundAt});
      // Pose first in local space, then translate the actual engine outlet onto the smoke root.
      damage.Update(20,{present:true,damageState:"Disabled",trackCut:true,engineKilled:true,damageSide:spec.seed % 2 ? 1 : -1,damageAt:0,engineAt:0});
      model.root.updateMatrixWorld(true);
      firePoint.fromArray(MISSION_TUNING.tankDamage.engineOutlet); model.root.localToWorld(firePoint);
      half = [1.12,.85,2.16];
    } else if (spec.kind === "truck") {
      // 1930s bonnet truck: open burnt cab, bent roof, exposed engine, missing boards.
      Box("steel",1.78,.18,4.8,0,.58,0);
      for (const x of [-.66,.66]) Box("steel",.12,.18,4.7,x,.40,0);
      Box("armor",1.45,.62,1.16,0,1.08,-1.65,0,0,.07);
      Box("scorch",.87,.025,.69,-.15,1.405,-1.59,0,.09,.07);
      Box("steel",1.36,.57,.07,0,1.03,-2.24);
      for(let i=0;i<7;i++) Box("track",.075,.40,.04,-.50+i*.17,1.05,-2.29);
      Box("steel",1.6,.1,1.3,0,.88,-.50);
      for (const x of [-.79,.79]) {
        Box("armor",.08,.50,1.16,x,1.14,-.52,0,0,x*.1);
        Box("scorch",.012,.29,.64,x*1.07,1.14,-.27,0,.035,x*.1);
        Box("steel",.07,.76,.08,x,1.74,-1.12,.11,0,x*.08);
        Box("steel",.08,.78,.08,x,1.74,.05);
        Box("steel",.09,.07,1.18,x,2.12,-.51);
      }
      Box("armor",1.69,.075,.96,.1,2.10,-.30,.15,.05,-.13);
      Box("track",1.38,.26,.48,0,1.08,-.18);
      for(const z of [-1.58,1.45]) for(const x of [-.96,.96]) {
        Mesh("track",new THREE.CylinderGeometry(.45,.45,.25,14),x,.47,z,0,0,Math.PI/2);
        Mesh("steel",new THREE.CylinderGeometry(.22,.22,.27,10),x,.47,z,0,0,Math.PI/2);
      }
      Box("wood",1.9,.15,2.37,0,.90,1.30);
      for(const x of [-.94,.94]) for(let j=0;j<3;j++) {
        Box("steel",.065,.82,.065,x,1.32,.30+j*.97);
        if(j!==1) Box("wood",.07,.18,1.1,x,1.13+j*.22,.55+j*.50,.04,0,x*.05);
      }
      Box("wood",1.76,.20,.08,0,1.16,2.48,.20,0,.1);
      for(let j=0;j<6;j++) Box(j%2?"coals":"wood",.18,.12,1.9,(random()-.5)*1.2,1.04+random()*.25,1.30,(random()-.5)*.25,random()*2,.1);
      group.updateMatrixWorld(true);
      firePoint.set(0,1.15,1.25); group.localToWorld(firePoint);
      half = [.99,1.0,2.5];
    } else {
      for(let j=0;j<11;j++) Box(j%4===0?"coals":"wood",.18+random()*.18,.15,1.3+random()*1.7,(random()-.5)*2,.19+random()*.43,(random()-.5)*1.6,random()*.3,random()*Math.PI,(random()-.5)*.6);
      if(spec.kind === "barrels") for(let j=0;j<3;j++) {
        const x=(j-1)*.74,z=.45+(j%2)*.30;
        Mesh("steel",new THREE.CylinderGeometry(.3,.33,.86,12),x,.48,z,.15,0,(j-1)*.2);
        for(const y of [.20,.67]) Mesh("track",new THREE.TorusGeometry(.32,.025,4,12),x,y,z,Math.PI/2);
      }
      firePoint.set(0,.35*spec.scale,0); half = [1.3,.28,1.3];
    }
    group.position.set(spec.x-firePoint.x,0,spec.z-firePoint.z);
    // Four contact samples keep the long wreck body seated on sloping shared terrain.
    const c=Math.cos(spec.yaw),s=Math.sin(spec.yaw);
    const samples=[[-half[0],-half[2]],[half[0],-half[2]],[-half[0],half[2]],[half[0],half[2]]].map(([x,z])=>groundAt(group.position.x+(x*c+z*s)*spec.scale,group.position.z+(z*c-x*s)*spec.scale));
    group.position.y = Math.min(...samples); group.updateMatrixWorld(true);
    if(damage) {
      damage.Update(20,{present:true,damageState:"Disabled",trackCut:true,engineKilled:true,damageSide:spec.seed%2?1:-1,damageAt:0,engineAt:0});
      model.root.updateMatrixWorld(true); firePoint.fromArray(MISSION_TUNING.tankDamage.engineOutlet); model.root.localToWorld(firePoint);
    } else { firePoint.set(spec.x,group.position.y+firePoint.y,spec.z); }
    // One bucket per material for the whole field. 64 m sectors made 168 meshes (63 wrecks in 27 sectors),
    // about 76 draws a frame across prepass / main / shadow in the 05 tank fight, where the frame is
    // CPU-submission bound (~21 µs a draw); the merged field is well under 100 k triangles, so losing
    // per-sector culling costs the GPU nothing measurable (2026-09-28).
    sink.SetSector("SmokeOrigin");
    const materialKey = new Map([...this.materials].map(([key,material])=>[material,key]));
    if(damage) { materialKey.set(damage.steel,"steel");materialKey.set(damage.scorch,"scorch"); }
    group.updateMatrixWorld(true);
    const originals = new Set();
    group.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      sink.Add(materialKey.get(mesh.material),mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)); originals.add(mesh.geometry);
    });
    // Irregular contact rubble/scorch is terrain-sampled, including on slopes.
    for(let j=0;j<15;j++) {
      const angle=random()*Math.PI*2,r=Math.sqrt(random())*2.5*spec.scale;
      const x=spec.x+Math.cos(angle)*r,z=spec.z+Math.sin(angle)*r;
      const g=new THREE.IcosahedronGeometry(.15+random()*.35,0);
      g.scale(1.3,.35+random()*.6,1);g.rotateY(angle);g.translate(x,groundAt(x,z)+.05,z);
      sink.Add(j%3?"scorch":"brick",g);
    }
    // Low solid mass; an open cab/bed is not represented by an invisible full-height box.
    sink.Solid(group.position.x,group.position.y+half[1]*spec.scale,group.position.z,half[0]*spec.scale,half[1]*spec.scale,half[2]*spec.scale,"smokeWreck",spec.yaw,spec.kind==="timber"?"wood":"metal");
    this.entries.set(spec.id,{spec,firePoint,position:group.position.clone()});
    group.traverse(mesh=>{if(mesh.isMesh)originals.add(mesh.geometry)});
    for(const geometry of originals)geometry.dispose(); damage?.Dispose();
  }
  Emitter(column) {
    const entry=this.entries.get(column.id); if(!entry)return null;
    const {x,z}=entry.spec;
    const position={x,y:Math.max(this.battlefield.StaticGroundHeight(x,z)+column.heightOffset,entry.firePoint.y),z};
    return {position,options:{...column.options,fire:entry.spec.fire,fireShape:"column",light:false,radius:entry.spec.kind==="tank"?.65:1,
      firePosition:entry.firePoint,backdrop:{...column.options.backdrop,ignition:entry.firePoint.toArray()}}};
  }
  Dispose() {
    for(const collider of this.colliders) {
      if(collider._physicsHandle!=null)this.physics.RemoveSolid(collider._physicsHandle);
      const index=this.battlefield.colliders.indexOf(collider);if(index>=0)this.battlefield.colliders.splice(index,1);
    }
    for(const mesh of this.meshes)mesh.geometry.dispose();
    for(const material of this.materials.values())material.dispose();
    this.root.removeFromParent();this.entries.clear();
  }
}
