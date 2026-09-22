// Instanced whitebox crowd. Critical characters still use the game's shared actor rigs.
import * as THREE from "three";
import { MissionAftermath } from "./Script_FirstLevelMissionAftermath.mjs";
import { MissionPeople } from "./Script_FirstLevelMissionPeople.mjs";
import { MISSION_TUNING } from "./Data_Tuning_FirstLevel.mjs";
import { MID_TUNING as MID } from "./Data_Tuning_FirstLevelMid.mjs";
import { CreateP012StretcherGeometry } from "./Script_FirstLevelP012CarryView.mjs";
import { BuildSink } from "./Script_World.mjs";
import { PlaceGeometry } from "./Script_Geo.mjs";
import { ApplyShadowDepth, AttachShadowDepth } from "./Script_ShadowDepth.mjs";
import { MISSION_PLACEMENT, MISSION_SUPPLIES, MISSION_SUPPLY_COLLIDER } from "./Data_FirstLevelMissionLayout.mjs";
import { Type89Damage } from "./Script_Type89Damage.mjs";
import { FRONT_BATTLE_TUNING } from "./Data_Tuning_FirstLevelFront.mjs";
export class FirstLevelMissionView {
  constructor({ scene, battlefield, physics, column, actorFactory, library, hud, vfx }) {
    Object.assign(this, { scene, battlefield, physics, column, actorFactory, library, vfx });
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
    // Near-camera moving props need persistent object identity and real motion
    // history. The crowd's instance slots have no previous-instance transforms.
    this.rigidParts = {fieldPack: []};
    this.rigidTemplates = {};
    this.rigidProps = new Map();
    // 老周/玩家将要乘坐的那辆车从预留开始就保持逐件稳定身份，直到场景销毁。
    // 这样上车、同行、停车和卸载近景里的车板与挂件都走普通 Mesh 的真实
    // matrixWorld 历史；其他远车仍留在实例桶里。
    this.stableCartParts = new Map();
    this.personColor = new THREE.Color();
    for (const [key, geometry, color, count] of [
      ["fieldPack",new THREE.BoxGeometry(.32,.43,.21),0x857a56,4],
      ["body", new THREE.BoxGeometry(0.42, 0.65, 0.25), 0x87958d, 160],
      ["head", new THREE.SphereGeometry(0.13, 7, 5), 0xc9bda7, 160],
      ["limb", new THREE.BoxGeometry(0.13, 0.64, 0.14), 0x747c72, 640],
      ["cartRail", new THREE.BoxGeometry(.12,.3,5.8), 0x665a48, 56],
      ["cartShaft", new THREE.BoxGeometry(.10,.1,3.5), 0x75634c, 14],
      ["muleBody", new THREE.BoxGeometry(.62,.72,1.5), 0x6c6457, 7],
      ["muleHead", new THREE.BoxGeometry(.25,.56,.44), 0x746c5e, 7],
      // 11 的牛/马两种白盒变体（Data_Tuning_FirstLevelMid.draft）：躯干与头按比例缩，
      // 牛另外挂一对角。**实例桶满了是静默截断** —— 七辆车各两只角，容量按 MID.hornCapacity 给。
      ["draftHorn", new THREE.BoxGeometry(...MID.horn.size), 0xa39c86, MID.hornCapacity],
      ["spoke", new THREE.BoxGeometry(.12,.80,.07), 0x8b816d, 112],
      // 担架帆布：0xd1d0be 在门口那片天光下会被顶成一块发光的白板，躺在上面的人整个
      // 读成一团黑影（2026-09-16 屋内伏击出图实拍）。压到脏帆布的亮度，十副担架同一份材质。
      ["bed", CreateP012StretcherGeometry(), 0xb6ae99, 20],
      ["patient", new THREE.BoxGeometry(0.49, 0.19, 1.55), 0xd9d7cb, 26],
      ["medical", new THREE.BoxGeometry(0.24, 0.2, 0.12), 0xe1e2d5, 32],
      ["cart", new THREE.BoxGeometry(3, 0.38, 5.8), 0x8a7b69, 7],
      ["wheel", new THREE.CylinderGeometry(0.48, 0.48, 0.15, 10), 0x454a48, 28],
    ]) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
      this.materials.push(material);
      if (this.rigidParts[key]) {
        this.rigidTemplates[key] = {geometry, material, capacity: count};
        continue;
      }
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      AttachShadowDepth(mesh);
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
    // 尸体层的实例桶在它自己的构造里建齐；挂共用深度材质的事在这里做，
    // 那个文件的桶结构归另一路（见 docs/Data_TechRenderPipeline.md §17.11）。
    ApplyShadowDepth(this.aftermath.root);
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
      const size=MISSION_SUPPLY_COLLIDER;
      const y=this.battlefield.GroundHeight(spec.x,spec.z)+(spec.supportHeight||0)+.25;
      const material=new THREE.MeshStandardMaterial({color:0x9b927b,roughness:.88,
        metalness:0,emissive:0xffeac8,emissiveIntensity:0});
      const geometry=PlaceGeometry(new THREE.BoxGeometry(size.w,size.h,size.d),{x:spec.x,y,z:spec.z});
      const center=[spec.x,y,spec.z],half=[size.w/2,size.h/2,size.d/2];
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
    this.tankDamage=new Type89Damage({root:this.tank,model,materials,vfx:this.vfx,
      groundAt:(x,z)=>this.battlefield.GroundHeight(x,z)});
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
  StableCartPart(cart,key,identity) {
    const id=`${cart.id}:${identity}`;
    let mesh=this.stableCartParts.get(id);
    if(!mesh){
      const source=this.parts[key];
      mesh=new THREE.Mesh(source.geometry,source.material);
      mesh.name=`MissionCart_${id}`;
      mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
      mesh.userData.missionCartPart={cartId:cart.id,key,identity};
      this.stableCartParts.set(id,mesh);this.root.add(mesh);
    }
    mesh.visible=true;
    return mesh;
  }
  StableInstance(key,cart,identity,x,y,z,yaw=0,sx=1,sy=1,sz=1,rx=0,rz=0) {
    const mesh=this.StableCartPart(cart,key,identity);
    mesh.position.set(x,y,z);
    mesh.quaternion.setFromEuler(new THREE.Euler(rx,yaw,rz,"YXZ"));
    mesh.scale.set(sx,sy,sz);
    return mesh;
  }
  StableCartInstance(key,cart,identity,ground,x,y,z,rx=0,rz=0) {
    const mesh=this.StableCartPart(cart,key,identity);
    this.cartRotation.setFromEuler(new THREE.Euler(0,cart.yaw,cart.overturned?1.1:0,"YXZ"));
    this.position.set(x,y,z).applyQuaternion(this.cartRotation);
    this.position.add(new THREE.Vector3(cart.x,ground+(cart.overturned?1.6:1),cart.z));
    this.localRotation.setFromEuler(new THREE.Euler(rx,0,rz));
    this.rotation.copy(this.cartRotation).multiply(this.localRotation);
    mesh.position.copy(this.position);mesh.quaternion.copy(this.rotation);mesh.scale.set(1,1,1);
    return mesh;
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
  RigidProp(key, id, x, y, z, yaw) {
    const identity=key+':'+id;
    let mesh=this.rigidProps.get(identity);
    if(!mesh){
      const template=this.rigidTemplates[key];
      if(this.rigidParts[key].length>=template.capacity)return;
      mesh=new THREE.Mesh(template.geometry,template.material);
      mesh.name='Mission_'+identity;mesh.castShadow=true;mesh.receiveShadow=true;
      this.rigidProps.set(identity,mesh);this.rigidParts[key].push(mesh);this.root.add(mesh);
    }
    mesh.position.set(x,y,z);mesh.rotation.set(0,yaw,0);mesh.visible=true;
  }
  Update(time, { tank,player,camera=null } = {}) {
    this.people.Begin(time,player?.position);
    this.aftermath.Update(player?.position,camera);
    for (const mesh of Object.values(this.parts)) mesh.count = 0;
    for (const mesh of this.rigidProps.values()) mesh.visible=false;
    for (const mesh of this.stableCartParts.values()) mesh.visible=false;
    this.UpdateSupplies(time);
    // 2026.09.19 第二波：车站卸车挨炸那一拍随军列开场下线（`column.stationBombed`
    // 已无人写入，MISSION_PLACEMENT.stationCasualties 也一并删了）。
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
        // 落地那一下只歪一点点。原来是 0.45 rad（26°）：担架成了一道白色的斜坡，
        // 而躺在上面的人（实例化的也好、带骨架的老周也好）是平的 —— 人浮在坡面上方，
        // 从地板镜头看过去整副担架读不出「上面躺着个人」（2026-09-16 屋内伏击出图实拍）。
        // litter.roll 是 16 过厢房门槛时那一歪（FirstLevelReception 写，几帧就回正）。
        this.zhouRoot.rotation.set(litter.state === "fallen" ? 0.1 : 0, yaw, litter.roll || 0);
        this.zhouPatient.material.color.setHex(litter.health < 25 ? 0xbda5a0 : 0xd9d7cb);
        // 老周担架上的近景件（他的挎包）。**身份稳定的普通 Mesh**，不是实例 ——
        // 逐实例形变不在 MotionVector 契约内（见 Script_PostPrepass 抬头），
        // 12/13 这副担架会跟着牛马车走、相机也跟着走，正是那类近景移动件。
        this.RigidProp("fieldPack", "ZhouKit",
          litter.x + Math.cos(yaw) * .34, ground + height + .1, litter.z - Math.sin(yaw) * .34, yaw);
      } else {
        this.Instance("bed", litter.x, ground + height, litter.z, yaw);
      }
      // 2026.09.19 第三波：屋内伏击拍下线之后，「挨刀的老周走带骨架伤员」那条支路
      // （MissionPeople.RiggedPatient）永远走不到 —— 挂 clip 的入口没人调了。
      // 担架上的人统一走实例化的烘焙姿势。
      this.people.Patient(litter.id,litter.x,ground+height+.07,litter.z,yaw,time,litter.zhou?{stabbed:!!litter.stabbed}:null);
      const SetGrip=(side,end)=>new THREE.Vector3(litter.x+Math.cos(yaw)*side*.29-Math.sin(yaw)*end,
        ground+height+.12,litter.z-Math.sin(yaw)*side*.29-Math.cos(yaw)*end);
      // 06 借火时仍是这副担架原有的两名担架员，只是 Collection 用同一组人物 id
      // 把他们摆到 4–5 m 外等待；别在正式抬架位再自动画一份，造成四人重叠。
      if (!litter.loaded && litter.state !== "placed" && !litter.borrowBearersStaged)
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
    // 11 的第四类人流：接运点现场能自己走 / 互相搀扶的伤员
    //（Script_FirstLevelTransferCart 摆位，这里只画）。
    for (const walker of this.column.transferWalkers || []) {
      if (!walker.visible) continue;
      this.Person(walker.x, walker.z, walker.yaw, time, {
        id: walker.id, kind: "wounded", alive: true,
        moving: !!walker.moving, crouch: !!walker.crouch,
      });
    }
    const stableCartId=this.column.zhouRideCart?.id||null;
    for (const cart of [...this.column.vehicles, ...this.column.traffic.filter((cart) => cart.visible)]) {
      if (cart.z > 178) continue;
      const y = this.battlefield.GroundHeight(cart.x, cart.z);
      this.SyncCartCollider(cart,y);
      const stable=cart.id===stableCartId;
      if(stable)this.StableCartInstance("cart",cart,"deck",y,0,0,0);
      else this.CartInstance("cart",cart,y,0,0,0);
      const c=Math.cos(cart.yaw),s=Math.sin(cart.yaw);
      const moving=!cart.overturned&&(cart.departed||cart.state==="approaching"||cart.id.startsWith("SouthCart"));
      const travel=(cart.progress||0)+(cart.approachProgress||0);
      for(const side of [-1,1]){
        if(stable){
          this.StableCartInstance("cartRail",cart,`rail:${side}`,y,side*1.4,.45,0);
          this.StableCartInstance("cartShaft",cart,`shaft:${side}`,y,side*.58,-.16,-3.75);
        }else{
          this.CartInstance("cartRail",cart,y,side*1.4,.45,0);
          this.CartInstance("cartShaft",cart,y,side*.58,-.16,-3.75);
        }
      }
      const team=cart.boltedTeam;
      if(!cart.overturned || team&&team.progress<team.length){
        const yaw=team?.yaw??cart.yaw, mc=Math.cos(yaw),ms=Math.sin(yaw);
        const mx=team?.x??cart.x-s*4.8,mz=team?.z??cart.z-c*4.8,my=this.battlefield.GroundHeight(mx,mz);
        // 牛 / 马：同一对实例桶，按 Data_Tuning_FirstLevelMid.draft 的比例缩。
        const draft=MID.draft[cart.draft==="ox"?"ox":"horse"];
        const [bx,by,bz]=draft.bodyScale,[hx,hy,hz]=draft.headScale;
        const headY=my+1.5-draft.headDrop;
        if(stable){
          this.StableInstance("muleBody",cart,"draftBody",mx,my+1*by,mz,yaw,bx,by,bz);
          this.StableInstance("muleHead",cart,"draftHead",mx-ms*.8,headY,mz-mc*.8,yaw,hx,hy,hz);
        }else{
          this.Instance("muleBody",mx,my+1*by,mz,yaw,bx,by,bz);
          this.Instance("muleHead",mx-ms*.8,headY,mz-mc*.8,yaw,hx,hy,hz);
        }
        // 牛角：一对，挂在头两侧前上方，往外岔开。
        if(draft.horn)for(const side of [-1,1]){
          const horn=[mx-ms*(.8+MID.horn.forwardM)+mc*side*MID.horn.lateralM,
            headY+MID.horn.riseM,
            mz-mc*(.8+MID.horn.forwardM)-ms*side*MID.horn.lateralM];
          if(stable)this.StableInstance("draftHorn",cart,`draftHorn:${side}`,...horn,yaw,1,1,1,0,side*MID.horn.tiltRad);
          else this.Instance("draftHorn",...horn,yaw,1,1,1,0,side*MID.horn.tiltRad);
        }
        for(const side of [-1,1])for(const end of [-1,1]){
          const swing=moving||team?Math.sin(time*(team?10:6)+side*end*Math.PI/2)*.32:0;
          const limb=[mx+mc*side*.21*bx-ms*end*.52*bz,my+.37*by,mz-ms*side*.21*bx-mc*end*.52*bz];
          if(stable)this.StableInstance("limb",cart,`draftLimb:${side}:${end}`,...limb,yaw,.8,1.1*by,.8,swing);
          else this.Instance("limb",...limb,yaw,.8,1.1*by,.8,swing);
        }
        this.Person(mx+mc*1.1,mz-ms*1.1,yaw,time,{id:cart.id+"Driver",kind:"medic",moving:moving||!!team});
      }
      for(const side of [-1,1])for(const end of [-1,1]){
        if(stable)this.StableCartInstance("wheel",cart,`wheel:${side}:${end}`,y,side*1.55,-.51,-end*1.8,0,Math.PI/2);
        else this.CartInstance("wheel",cart,y,side*1.55,-.51,-end*1.8,0,Math.PI/2);
        for(const [phaseIndex,phase] of [0,Math.PI/2].entries()){
          if(stable)this.StableCartInstance("spoke",cart,`spoke:${side}:${end}:${phaseIndex}`,y,side*1.635,-.51,-end*1.8,travel/.48+phase);
          else this.CartInstance("spoke",cart,y,side*1.635,-.51,-end*1.8,travel/.48+phase);
        }
      }
      if (cart.id.startsWith("SouthCart")) {
        for (const side of [-1, 1]) {
          this.people.Patient(cart.id+side,cart.x+c*side*.65,y+1.22,cart.z-s*side*.65,cart.yaw,time);
        }
      }
    }
    // 15–18 的布景（掉队伤员、门外抬进来的下一副担架、夜景里的队列与搬运）：
    // 必须画在 people.Begin/End 之间，没报的那一帧人自动藏起来。
    this.extras?.Draw(this, time);
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
      // 空桶也要一次完整提交：three 的 `primcount === 0` 早退在 renderInstances 里，
      // 而 setProgram（材质状态 / uniform / 属性绑定）已经跑完了。这一关同时最多
      // 用到其中八只，剩下的按 visible 摘出渲染列表（口径同 docs/Data_ActorCrowdLod §4.1）。
      mesh.visible = mesh.count > 0;
    }
    if (tank) {
      this.tank.visible = tank.present || tank.active;
      this.SyncTank(tank);
      this.tankDamage.Update(time,tank);
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
  BandageZhou(soldier){
    const bone=soldier.actor?.characterRig?.bones?.shinL;if(!bone||this.frontBandage)return;
    const b=FRONT_BATTLE_TUNING.bandage,material=new THREE.MeshStandardMaterial({color:b.color,roughness:1});
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(b.radius,b.radius,b.height,10),material);
    mesh.name="ZhouExistingLegBandage";mesh.position.y=b.y;mesh.castShadow=true;AttachShadowDepth(mesh);
    bone.add(mesh);this.frontBandage=mesh;this.materials.push(material);
  }
  Dispose() {
    if(this.frontBandage){this.frontBandage.removeFromParent();this.frontBandage.geometry.dispose();}
    this.tankDamage.Dispose();
    this.people.Dispose();this.aftermath.Dispose();
    for (const collider of this.colliders) {
      if (collider._physicsHandle != null) this.physics.RemoveSolid(collider._physicsHandle);
      const index=this.battlefield.colliders.indexOf(collider);
      if(index>=0)this.battlefield.colliders.splice(index,1);
    }
    const geometries=new Set(Object.values(this.rigidTemplates).map(template=>template.geometry));
    this.root.traverse(object=>{if(object.isMesh)geometries.add(object.geometry)});
    for(const geometry of geometries)geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.scene.remove(this.root);
  }
}
