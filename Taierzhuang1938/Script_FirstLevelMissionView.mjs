// Instanced whitebox crowd. Critical characters still use the game's shared actor rigs.
import * as THREE from "three";
import { CreateP012StretcherGeometry } from "./Script_FirstLevelP012CarryView.mjs";
import { BuildSink } from "./Script_World.mjs";
import { PlaceGeometry } from "./Script_Geo.mjs";
import { MISSION_PLACEMENT, MISSION_SUPPLIES } from "./Data_FirstLevelMissionLayout.mjs";
export class FirstLevelMissionView {
  constructor({ scene, battlefield, physics, column, actorFactory, library }) {
    Object.assign(this, { scene, battlefield, physics, column, actorFactory, library });
    this.root = new THREE.Group();
    this.root.name = "FirstLevelMissionWhitebox";
    scene.add(this.root);
    this.materials = [];
    this.meshes = [];
    this.colliders = [];
    this.walkerPositions = new Map();
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.scale = new THREE.Vector3();
    this.parts = {};
    for (const [key, geometry, color, count] of [
      ["ration", new THREE.BoxGeometry(.10,.045,.13), 0xa47752, 20],
      ["pouch", new THREE.BoxGeometry(.14,.07,.12), 0x857a56, 20],
      ["cartridge", new THREE.BoxGeometry(.018,.018,.07), 0xc2a45d, 32],
      ["body", new THREE.BoxGeometry(0.42, 0.65, 0.25), 0x87958d, 160],
      ["head", new THREE.SphereGeometry(0.13, 7, 5), 0xc9bda7, 160],
      ["limb", new THREE.BoxGeometry(0.13, 0.64, 0.14), 0x747c72, 480],
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
    this.zhouRoot.add(this.zhouPatient);
    this.materials.push(this.zhouPatient.material);
    const zhouHead = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 5), this.parts.head.material);
    zhouHead.position.set(0, 0.22, -0.84);
    this.zhouRoot.add(zhouHead);
    this.zhouRoot.visible = false;
    this.BuildTank();
    this.BuildSupplies();
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
    this.tank.rotation.set(Math.atan2(front-rear,3.6),Math.PI,Math.atan2(left-right,2),"YXZ");
    this.turret.rotation.y=tank.turretYaw-Math.PI;
    this.tank.updateMatrixWorld(true);
  }
  TankMuzzle(tank,node="gunMuzzle") {
    this.SyncTank(tank);
    return this.tankModel.nodes.get(node).getWorldPosition(new THREE.Vector3());
  }
  Instance(key, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, rx = 0) {
    const mesh = this.parts[key],
      index = mesh.count++;
    if (index >= mesh.instanceMatrix.count) {
      mesh.count--;
      return;
    }
    this.position.set(x, y, z);
    this.rotation.setFromEuler(new THREE.Euler(rx, yaw, 0));
    this.scale.set(sx, sy, sz);
    this.matrix.compose(this.position, this.rotation, this.scale);
    mesh.setMatrixAt(index, this.matrix);
  }
  Person(
    x,
    z,
    yaw,
    time,
    { kind = "bearer", alive = true, moving = false, crouch = false, carrying = false } = {},
  ) {
    const y = this.battlefield.GroundHeight(x, z),
      height = alive ? (crouch ? 0.95 : 1.35) : 0.18;
    this.Instance("body", x, y + height - 0.24, z, yaw, 1, alive ? 1 : 0.45, alive ? 1 : 2.2);
    this.Instance("head", x, y + height + 0.24, z, yaw);
    const c = Math.cos(yaw),
      s = Math.sin(yaw),
      swing = moving ? Math.sin(time * 7) * 0.18 : 0;
    for (const side of [-1, 1]) {
      this.Instance(
        "limb",
        x + c * side * 0.13 - s * swing * side,
        y + (alive ? 0.36 : 0.15),
        z - s * side * 0.13 - c * swing * side,
        yaw,
        1,
        alive ? 1 : 0.3,
      );
      this.Instance(
        "limb",
        x + c * side * 0.28,
        y + height - 0.22,
        z - s * side * 0.28,
        yaw,
        0.85,
        carrying ? 0.65 : 0.85,
        1,
        carrying ? -1 : 0,
      );
    }
    if (kind === "medic") this.Instance("medical", x + c * 0.33, y + 0.8, z - s * 0.33, yaw);
  }
  TrainHandProps() {
    for(const entry of this.train?.entries || []) {
      const actor=entry.actor, rig=actor.actor?.characterRig, life=actor.missionTrainLife;
      if(!rig?.missionTrainLifeActive || life.brace>.25 || life.weight<.7)continue;
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
  Update(time, { tank } = {}) {
    for (const mesh of Object.values(this.parts)) mesh.count = 0;
    this.TrainHandProps();
    this.UpdateSupplies(time);
    if (this.column.stationBombed)
      for (const person of MISSION_PLACEMENT.stationCasualties)
        this.Person(person.x, person.z, person.yaw, time, { alive: person.health > 0, crouch: true });
    for (const litter of this.column.litters) {
      if (!litter.visible) continue;
      const ground = this.battlefield.GroundHeight(litter.x, litter.z),
        height = litter.loaded
          ? 1.2
          : litter.state === "fallen" || litter.state === "critical" || litter.state === "placed"
            ? 0.22
            : 0.82;
      const yaw = litter.yaw || 0;
      if (litter.zhou) {
        this.zhouRoot.visible = true;
        this.zhouRoot.position.set(litter.x, ground + height, litter.z);
        this.zhouRoot.rotation.set(litter.state === "fallen" ? 0.45 : 0, yaw, 0);
        this.zhouPatient.material.color.setHex(litter.health < 25 ? 0xbda5a0 : 0xd9d7cb);
      } else {
        this.Instance("bed", litter.x, ground + height, litter.z, yaw);
        this.Instance("patient", litter.x, ground + height + 0.16, litter.z, yaw);
        this.Instance(
          "head",
          litter.x - Math.sin(yaw) * 0.84,
          ground + height + 0.22,
          litter.z - Math.cos(yaw) * 0.84,
          yaw,
        );
      }
      if (!litter.loaded && litter.state !== "placed")
        for (const [index, side] of [-1, 1].entries()) {
          if (litter.state === "carried" && side === 1) continue;
          this.Person(
            litter.x - Math.sin(yaw) * side * 1.6,
            litter.z - Math.cos(yaw) * side * 1.6,
            yaw,
            time,
            {
              alive: litter.bearers[index] > 0,
              moving: ["moving", "loading"].includes(litter.state),
              carrying: true,
            },
          );
        }
    }
    for (const walker of this.column.walkers) {
      const last=this.walkerPositions.get(walker.id);
      const moving=!!last&&Math.hypot(walker.x-last.x,walker.z-last.z)>.0001;
      this.walkerPositions.set(walker.id,{x:walker.x,z:walker.z});
      if (walker.visible && !walker.assigned)
        this.Person(walker.x, walker.z, walker.yaw, time, {
          kind: walker.kind,
          alive: walker.health > 0,
          moving: moving && !walker.crouch,
          crouch: walker.crouch,
        });
    }
    for (const cart of [...this.column.vehicles, ...this.column.traffic.filter((cart) => cart.visible)]) {
      if (cart.z > 178) continue;
      const y = this.battlefield.GroundHeight(cart.x, cart.z);
      this.Instance(
        "cart",
        cart.x,
        y + (cart.overturned ? 0.45 : 1),
        cart.z,
        cart.yaw,
        1,
        1,
        1,
        cart.overturned ? 1.1 : 0,
      );
      const c = Math.cos(cart.yaw),
        s = Math.sin(cart.yaw);
      for (const side of [-1, 1])
        for (const end of [-1, 1])
          this.Instance(
            "wheel",
            cart.x + c * side * 1.55 - s * end * 1.8,
            y + 0.49,
            cart.z - s * side * 1.55 - c * end * 1.8,
            cart.yaw + Math.PI / 2,
            1,
            1,
            1,
            Math.PI / 2,
          );
      if (cart.id.startsWith("SouthCart")) {
        this.Person(cart.x - s * 3.5, cart.z - c * 3.5, cart.yaw, time, { kind: "medic", moving: true });
        for (const side of [-1, 1]) {
          this.Instance("patient", cart.x + c * side * 0.65, y + 1.35, cart.z - s * side * 0.65, cart.yaw);
          this.Instance(
            "head",
            cart.x + c * side * 0.65 - s * 0.84,
            y + 1.42,
            cart.z - s * side * 0.65 - c * 0.84,
            cart.yaw,
          );
        }
      }
    }
    for (const mesh of Object.values(this.parts)) mesh.instanceMatrix.needsUpdate = true;
    if (tank) {
      this.tank.visible = tank.present || tank.active;
      this.SyncTank(tank);
      this.trackDamage.visible = tank.immobilized;
      if (tank.present || tank.active) {
        const c = this.tankCollider;
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
  Dispose() {
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
