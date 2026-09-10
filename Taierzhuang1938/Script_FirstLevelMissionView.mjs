// Instanced whitebox crowd. Critical characters still use the game's shared actor rigs.
import * as THREE from "three";
import { MissionAftermath } from "./Script_FirstLevelMissionAftermath.mjs";
import { MissionPeople } from "./Script_FirstLevelMissionPeople.mjs";
import { T } from "./Script_Text.mjs";
import { MISSION_TUNING } from "./Data_Tuning_FirstLevel.mjs";
import { CreateP012StretcherGeometry } from "./Script_FirstLevelP012CarryView.mjs";
import { BuildSink } from "./Script_World.mjs";
import { PlaceGeometry } from "./Script_Geo.mjs";
import { MISSION_PLACEMENT, MISSION_SUPPLIES } from "./Data_FirstLevelMissionLayout.mjs";
export class FirstLevelMissionView {
  constructor({ scene, battlefield, physics, column, actorFactory, library, hud, vfx }) {
    Object.assign(this, { scene, battlefield, physics, column, actorFactory, library });
    this.root = new THREE.Group();
    this.root.name = "FirstLevelMissionWhitebox";
    scene.add(this.root);
    this.materials = [];
    this.meshes = [];
    this.colliders = [];
    this.cartColliders = new Map();
    this.cartRotation = new THREE.Quaternion();
    this.localRotation = new THREE.Quaternion();
    this.walkerPositions = new Map();
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.parts = {};
    this.personColor = new THREE.Color();
    for (const [key, geometry, color, count] of [
      ["ration", new THREE.BoxGeometry(.10,.045,.13), 0xa47752, 20],
      ["pouch", new THREE.BoxGeometry(.14,.07,.12), 0x857a56, 20],
      ["fieldPack",new THREE.BoxGeometry(.32,.43,.21),0x857a56,4],
      ["cartridge", new THREE.BoxGeometry(.018,.018,.07), 0xc2a45d, 32],
      ["body", new THREE.BoxGeometry(0.42, 0.65, 0.25), 0x87958d, 160],
      ["head", new THREE.SphereGeometry(0.13, 7, 5), 0xc9bda7, 160],
      ["limb", new THREE.BoxGeometry(0.13, 0.64, 0.14), 0x747c72, 640],
      ["cartRail", new THREE.BoxGeometry(.12,.3,5.8), 0x665a48, 56],
      ["cartShaft", new THREE.BoxGeometry(.10,.1,3.5), 0x75634c, 14],
      ["muleBody", new THREE.BoxGeometry(.62,.72,1.5), 0x6c6457, 7],
      ["muleHead", new THREE.BoxGeometry(.25,.56,.44), 0x746c5e, 7],
      ["spoke", new THREE.BoxGeometry(.12,.80,.07), 0x8b816d, 112],
      ["bed", CreateP012StretcherGeometry(), 0xd1d0be, 20],
      ["patient", new THREE.BoxGeometry(0.49, 0.19, 1.55), 0xd9d7cb, 26],
      ["medical", new THREE.BoxGeometry(0.24, 0.2, 0.12), 0xe1e2d5, 32],
      ["cart", new THREE.BoxGeometry(3, 0.38, 5.8), 0x8a7b69, 7],
      ["wheel", new THREE.CylinderGeometry(0.48, 0.48, 0.15, 10), 0x454a48, 28],
    ]) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
      this.materials.push(material);
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.parts[key] = mesh;
      this.root.add(mesh);
      this.meshes.push(mesh);
    }
    this.zhouRoot = new THREE.Group();
    this.zhouRoot.name = "MissionOriginalZhouStretcher";
    this.root.add(this.zhouRoot);
    this.zhouBed = new THREE.Mesh(CreateP012StretcherGeometry(), this.parts.bed.material);
    this.zhouRoot.add(this.zhouBed);
    this.zhouPatient = new THREE.Mesh(
      new THREE.BoxGeometry(0.49, 0.19, 1.55),
      this.parts.patient.material.clone(),
    );
    this.zhouPatient.position.y = 0.16;
    this.zhouRoot.add(this.zhouPatient);this.zhouPatient.visible=false;
    this.materials.push(this.zhouPatient.material);
    const zhouHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), this.parts.head.material);
    zhouHead.position.set(0, 0.22, -0.84);
    this.zhouRoot.add(zhouHead);zhouHead.visible=false;
    this.zhouRoot.visible = false;
    this.people=new MissionPeople({root:this.root,actorFactory,battlefield});
    this.aftermath=new MissionAftermath({root:this.root,actorFactory,battlefield,vfx});
    this.BuildTank();
    this.BuildSupplies();
    this.navigation=document.createElement("div");
    this.navigation.dataset.missionNavigation="true";
    this.navigation.style.cssText="position:absolute;top:84px;left:22px;padding:6px 10px;color:#eee5d0;background:#202720bb;border-left:2px solid #d6be84;font:14px/1.5 sans-serif;max-width:430px;white-space:pre-line;pointer-events:none";
    this.navigation.hidden=true;
    hud?.root?.append(this.navigation);
  }
  Box(root, w, h, d, x, y, z, color) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
    this.materials.push(material);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  BuildSupplies() {
    const sink=new BuildSink();
    this.supplyMarkers=[];
    for(const spec of [...MISSION_SUPPLIES,{id:"Bundle",x:13,z:-118,supportHeight:.5}]){
      const y=this.battlefield.GroundHeight(spec.x,spec.z)+(spec.supportHeight||0)+.25;
      const material=new THREE.MeshStandardMaterial({color:0x9b927b,roughness:.88,
        metalness:0,emissive:0xffeac8,emissiveIntensity:0});
      const geometry=PlaceGeometry(new THREE.BoxGeometry(.96,.5,.64),{x:spec.x,y,z:spec.z});
      const center=[spec.x,y,spec.z],half=[.48,.25,.32];
      const collider={c:center,h:half,min:center.map((v,i)=>v-half[i]),max:center.map((v,i)=>v+half[i]),tag:"missionSupply",ry:0};
      this.physics.AddSolid(collider);
      this.battlefield.colliders.push(collider);
      this.colliders.push(collider);
      sink.SetSector(`MissionSupply${spec.id}`);
      sink.Add(spec.id,geometry);
      this.materials.push(material);
      this.supplyMarkers.push({id:spec.id==="Bundle"?"MissionBundle":`MissionSupply${spec.id}`,material});
    }
    const materials=new Map(this.supplyMarkers.map(m=>[m.id.replace("MissionSupply","").replace("MissionBundle","Bundle"),m.material]));
    for(const mesh of sink.Flush(this.root,{Get:key=>materials.get(key)})){
      mesh.name="MissionInteractiveSupply";mesh.castShadow=true;mesh.receiveShadow=true;
    }
  }
  UpdateSupplies(time) {
    for(const marker of this.supplyMarkers){
      const point=this.interact?.Point(marker.id);
      const usable=!!point && point.cooldownLeft<=0 && point.Enabled?.()!==false;
      marker.material.emissiveIntensity=usable ? .12+.55*(.5+.5*Math.sin(time*2.4))**3:0;
    }
  }
  BuildTank() {
    this.tank = new THREE.Group();
    this.tank.name = "MissionTankTrackDamage";
    this.root.add(this.tank);
    this.tank.visible = false;
    const materials = { type89Armor:this.library.Get("Type89Armor",{side:THREE.DoubleSide}),
      type89Barrel:this.library.Get("Type89Armor",{side:THREE.DoubleSide}),
      type89Track:this.library.Get("Type89Track",{side:THREE.DoubleSide}) };
    const model=this.actorFactory.ModelInstance("Type89Tank",materials);
    if(!model)throw new Error("First level requires the existing Type89Tank model");
    this.tankModel=model;this.tank.add(model.root);
    model.root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    this.turret=model.nodes.get("turret");
    this.trackDamage=this.Box(this.tank,.19,.12,1.1,-1.02,.07,.2,0x252c27);
    this.trackDamage.visible=false;
    this.tankCollider = {
      min: [0, 0, 0],
      max: [0, 0, 0],
      c: [0, 0, 0],
      h: [1.075, 1.28, 2.15],
      tag: "missionTank",
      ry: 0,
    };
  }
  SyncTank(tank) {
    const h=(x,z)=>this.battlefield.GroundHeight(x,z);
    const front=h(tank.x,tank.z+1.8),rear=h(tank.x,tank.z-1.8);
    const left=h(tank.x+1,tank.z),right=h(tank.x-1,tank.z);
    this.tank.position.set(tank.x,(front+rear+left+right)/4,tank.z);
    const hullYaw=tank.hullYaw??Math.PI;
    this.tank.rotation.set(Math.atan2(front-rear,3.6),hullYaw,Math.atan2(left-right,2),"YXZ");
    this.turret.rotation.y=tank.turretYaw-hullYaw;
    this.tank.updateMatrixWorld(true);
  }
  TankMuzzle(tank,node="gunMuzzle") {
    this.SyncTank(tank);
    return this.tankModel.nodes.get(node).getWorldPosition(new THREE.Vector3());
  }
  Instance(key, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
    const mesh = this.parts[key],
      index = mesh.count++;
    if (index >= mesh.instanceMatrix.count) {
      mesh.count--;
      return;
    }
    this.position.set(x, y, z);
    this.rotation.setFromEuler(new THREE.Euler(rx, yaw, rz, "YXZ"));
    this.scale.set(sx, sy, sz);
    this.matrix.compose(this.position, this.rotation, this.scale);
    mesh.setMatrixAt(index, this.matrix);
  }
  CartInstance(key,cart,ground,x,y,z,rx=0,rz=0) {
    const mesh=this.parts[key],index=mesh.count++;
    if(index>=mesh.instanceMatrix.count){mesh.count--;return;}
    this.cartRotation.setFromEuler(new THREE.Euler(0,cart.yaw,cart.overturned?1.1:0,"YXZ"));
    this.position.set(x,y,z).applyQuaternion(this.cartRotation);
    this.position.add(new THREE.Vector3(cart.x,ground+(cart.overturned?1.6:1),cart.z));
    this.localRotation.setFromEuler(new THREE.Euler(rx,0,rz));
    this.rotation.copy(this.cartRotation).multiply(this.localRotation);
    this.scale.set(1,1,1);this.matrix.compose(this.position,this.rotation,this.scale);
    mesh.setMatrixAt(index,this.matrix);
  }
  SyncCartCollider(cart,ground) {
    let box=this.cartColliders.get(cart.id);
    if(box&&box.overturned!==cart.overturned){
      this.physics.RemoveSolid(box._physicsHandle);
      const old=this.battlefield.colliders.indexOf(box);if(old>=0)this.battlefield.colliders.splice(old,1);
      this.colliders.splice(this.colliders.indexOf(box),1);box=null;
    }
    const hx=cart.overturned?1.27:1.5, hy=cart.overturned?1.64:.65;
    const c=[cart.x,ground+(cart.overturned?1.6:1),cart.z],h=[hx,hy,2.9];
    const cosine=Math.abs(Math.cos(cart.yaw)),sine=Math.abs(Math.sin(cart.yaw));
    const extent=[cosine*hx+sine*2.9,hy,sine*hx+cosine*2.9];
    const values={id:cart.id,tag:"missionCart",c,h,ry:cart.yaw,overturned:cart.overturned,
      min:c.map((v,i)=>v-extent[i]),max:c.map((v,i)=>v+extent[i])};
    if(!box){box=values;this.cartColliders.set(cart.id,box);this.physics.AddSolid(box);this.colliders.push(box);this.battlefield.colliders.push(box);}
    else {Object.assign(box,values);this.physics.MoveSolid(box);}
  }
  Person(x,z,yaw,time,options={}) {
    return this.people.Person(options.id||("Person"+x+"_"+z),x,z,yaw,options);
  }
  TrainHandProps() {
    for(const entry of this.train?.entries || []) {
      const actor=entry.actor, rig=actor.actor?.characterRig, life=actor.missionTrainLife;
      if(actor.castId&&actor.alive&&rig?.bones.chest){
        rig.bones.chest.getWorldPosition(this.position);
        this.Instance("fieldPack",this.position.x+Math.sin(actor.yaw)*.25,this.position.y-.18,
          this.position.z+Math.cos(actor.yaw)*.25,actor.yaw);
      }
      if(!rig?.missionTrainLifeActive || life.brace>.25 || life.weight<.7 || life.gestureWeight<.7)continue;
      const kind=life.kind;
      if(!['Eat','ShareFood','CountAmmo','Gear'].includes(kind))continue;
      for(const side of ['L','R']) {
        const bone=rig.bones['hand'+side];
        bone.getWorldPosition(this.position);
        const {x,y,z}=this.position, yaw=actor.yaw;
        if(kind==='CountAmmo'&&side==='R')this.Instance('cartridge',x,y,z,yaw);
        else if(kind==='CountAmmo'||kind==='Gear')this.Instance('pouch',x,y,z,yaw);
        else this.Instance('ration',x,y,z,yaw,side==='L'?1.4:1,1,side==='L'?1.4:1);
      }
    }
  }
  Update(time, { tank,player,camera=null } = {}) {
    this.people.Begin(time,player?.position);
    this.aftermath.Update(player?.position,camera);
    for (const mesh of Object.values(this.parts)) mesh.count = 0;
    this.TrainHandProps();
    this.UpdateSupplies(time);
    if (this.column.stationBombed)
      for (const person of MISSION_PLACEMENT.stationCasualties)
        this.Person(person.x, person.z, person.yaw, time, { id:"Station"+person.x, alive: person.health > 0, crouch: true });
    for (const litter of this.column.litters) {
      if (!litter.visible) continue;
      const ground = this.battlefield.GroundHeight(litter.x, litter.z),
        height = litter.loaded
          ? 1.2
          : litter.state === "fallen" || litter.state === "critical" || litter.state === "placed"
            ? 0.22
            : .76 + (litter.liftFraction || 0) * .44;
      const yaw = litter.yaw || 0;
      if (litter.zhou) {
        this.zhouRoot.visible = true;
        this.zhouRoot.position.set(litter.x, ground + height, litter.z);
        this.zhouRoot.rotation.set(litter.state === "fallen" ? 0.45 : 0, yaw, 0);
        this.zhouPatient.material.color.setHex(litter.health < 25 ? 0xbda5a0 : 0xd9d7cb);
      } else {
        this.Instance("bed", litter.x, ground + height, litter.z, yaw);
      }
      this.people.Patient(litter.id,litter.x,ground+height+.07,litter.z,yaw,time);
      const SetGrip=(side,end)=>new THREE.Vector3(litter.x+Math.cos(yaw)*side*.29-Math.sin(yaw)*end,
        ground+height+.12,litter.z-Math.sin(yaw)*side*.29-Math.cos(yaw)*end);
      if (!litter.loaded && litter.state !== "placed")
        for (const [index, side] of [-1, 1].entries()) {
          if (litter.bearers[index] <= 0 || (litter.state === "carried" && side === -1)) continue;
          this.Person(
            litter.x - Math.sin(yaw) * side * MISSION_TUNING.litterBearerOffsetM,
            litter.z - Math.cos(yaw) * side * MISSION_TUNING.litterBearerOffsetM,
            yaw,
            time,
            {
              id:litter.id+"Bearer"+index,
              carryTarget:{left:SetGrip(-1,side),right:SetGrip(1,side)},
              role:side===1?"front":"rear",
              alive: litter.bearers[index] > 0,
              moving: ["moving", "loading"].includes(litter.state),
              carrying: true,
              carrySide: side,
            },
          );
        }
    }
    for(const body of this.column.bearerCasualties)
      this.Person(body.x,body.z,body.yaw,time,{id:"BearerCasualty"+body.x+"_"+body.z,alive:false});
    for (const walker of this.column.walkers) {
      const last=this.walkerPositions.get(walker.id);
      const moving=!!last&&Math.hypot(walker.x-last.x,walker.z-last.z)>.0001;
      this.walkerPositions.set(walker.id,{x:walker.x,z:walker.z});
      if (walker.visible && !walker.assigned && !(walker.health<=0&&walker.casualtyRepresented))
        this.Person(walker.x, walker.z, walker.yaw, time, {
          id:walker.id,
          kind: walker.kind,
          alive: walker.health > 0,
          moving: moving && !walker.crouch,
          crouch: walker.crouch,
        });
    }
    for (const cart of [...this.column.vehicles, ...this.column.traffic.filter((cart) => cart.visible)]) {
      if (cart.z > 178) continue;
      const y = this.battlefield.GroundHeight(cart.x, cart.z);
      this.SyncCartCollider(cart,y);
      this.CartInstance("cart",cart,y,0,0,0);
      const c=Math.cos(cart.yaw),s=Math.sin(cart.yaw);
      const moving=!cart.overturned&&(cart.departed||cart.state==="approaching"||cart.id.startsWith("SouthCart"));
      const travel=(cart.progress||0)+(cart.approachProgress||0);
      for(const side of [-1,1]){
        this.CartInstance("cartRail",cart,y,side*1.4,.45,0);
        this.CartInstance("cartShaft",cart,y,side*.58,-.16,-3.75);
      }
      const team=cart.boltedTeam;
      if(!cart.overturned || team&&team.progress<team.length){
        const yaw=team?.yaw??cart.yaw, mc=Math.cos(yaw),ms=Math.sin(yaw);
        const mx=team?.x??cart.x-s*4.8,mz=team?.z??cart.z-c*4.8,my=this.battlefield.GroundHeight(mx,mz);
        this.Instance("muleBody",mx,my+1,mz,yaw);
        this.Instance("muleHead",mx-ms*.8,my+1.5,mz-mc*.8,yaw);
        for(const side of [-1,1])for(const end of [-1,1]){
          const swing=moving||team?Math.sin(time*(team?10:6)+side*end*Math.PI/2)*.32:0;
          this.Instance("limb",mx+mc*side*.21-ms*end*.52,my+.37,mz-ms*side*.21-mc*end*.52,yaw,.8,1.1,.8,swing);
        }
        this.Person(mx+mc*1.1,mz-ms*1.1,yaw,time,{id:cart.id+"Driver",kind:"medic",moving:moving||!!team});
      }
      for(const side of [-1,1])for(const end of [-1,1]){
        this.CartInstance("wheel",cart,y,side*1.55,-.51,-end*1.8,0,Math.PI/2);
        for(const phase of [0,Math.PI/2])this.CartInstance("spoke",cart,y,side*1.635,-.51,-end*1.8,travel/.48+phase);
      }
      if (cart.id.startsWith("SouthCart")) {
        for (const side of [-1, 1]) {
          this.people.Patient(cart.id+side,cart.x+c*side*.65,y+1.22,cart.z-s*side*.65,cart.yaw,time);
        }
      }
    }
    this.people.End();
    const visibleCarts=new Set([...this.column.vehicles,...this.column.traffic.filter(c=>c.visible)].filter(c=>c.z<=178).map(c=>c.id));
    for(const [id,box] of this.cartColliders)if(!visibleCarts.has(id)){
      this.physics.RemoveSolid(box._physicsHandle);
      this.battlefield.colliders.splice(this.battlefield.colliders.indexOf(box),1);
      this.colliders.splice(this.colliders.indexOf(box),1);this.cartColliders.delete(id);
    }
    for (const mesh of Object.values(this.parts)) {
      mesh.instanceMatrix.needsUpdate = true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
    if (tank) {
      this.tank.visible = tank.present || tank.active;
      this.SyncTank(tank);
      this.trackDamage.visible = tank.immobilized;
      if (tank.present || tank.active) {
        const c = this.tankCollider;c.ry=tank.hullYaw??Math.PI;
        c.c = [tank.x, this.tank.position.y + 1.28, tank.z];
        c.min = c.c.map((v, i) => v - c.h[i]);
        c.max = c.c.map((v, i) => v + c.h[i]);
        if (!this.tankRegistered) {
          this.physics.AddSolid(c);
          this.colliders.push(c);
          this.tankRegistered = true;
        } else this.physics.MoveSolid(c);
      }
    }
  }
  UpdateNavigation(guide,player) {
    const distance=guide?Math.hypot(guide.target.x-player.position.x,guide.target.z-player.position.z):0;
    this.navigation.hidden=!guide || !player.Alive || (distance<MISSION_TUNING.guideHideDistanceM&&!guide.status);
    if(this.navigation.hidden)return;
    const angle=Math.atan2(player.position.x-guide.target.x,player.position.z-guide.target.z)-player.yaw;
    const delta=Math.atan2(Math.sin(angle),Math.cos(angle));
    const arrow=Math.abs(delta)<.45?'↑':Math.abs(delta)>2.6?'↓':delta>0?'←':'→';
    const direction=distance>=MISSION_TUNING.guideHideDistanceM?arrow+' '+T('firstLevel.guide.distance',{label:guide.label,distance:Math.round(distance)}):'';
    const text=[direction,guide.status].filter(Boolean).join('\n');
    if(this.navigation.textContent!==text)this.navigation.textContent=text;
  }
  Dispose() {
    this.navigation?.remove();
    this.people.Dispose();this.aftermath.Dispose();
    for (const collider of this.colliders) {
      if (collider._physicsHandle != null) this.physics.RemoveSolid(collider._physicsHandle);
      const index=this.battlefield.colliders.indexOf(collider);
      if(index>=0)this.battlefield.colliders.splice(index,1);
    }
    this.root.traverse((object) => {
      if (object.isMesh) object.geometry.dispose();
    });
    for (const material of this.materials) material.dispose();
    this.scene.remove(this.root);
  }
}
