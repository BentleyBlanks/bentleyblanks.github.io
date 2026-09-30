// Instanced whitebox crowd. Critical characters still use the game's shared actor rigs.
import * as THREE from "three";
import { MissionAftermath } from "./Script_FirstLevelMissionAftermath.mjs";
import { MissionPeople } from "./Script_FirstLevelMissionPeople.mjs";
import { MISSION_TUNING } from "./Data_Tuning_FirstLevel.mjs";
import { MID_TUNING as MID } from "./Data_Tuning_FirstLevelMid.mjs";
import { CreateStretcherGeometry } from "./Script_StretcherAsset.mjs";
import { STRETCHER_PATIENT_LIFT_M } from "./Data_Carry.mjs";
// 地上平放的担架（MISSION_PLACEMENT.groundStretchers）：按 z 分簇的簇宽、伤员报画的距离。
const GROUND_STRETCHER_CLUSTER_M = 60, GROUND_STRETCHER_PATIENT_DRAW_M = 70;
// 老周的挎包平放在担架 +Z 端的布兜上（担架自己的坐标系，布兜面约 y 0.1）。老周躺上去头朝 +Z，
// 所以包在他头边、像垫着的（2026-09-30 实拍核过不穿头、不压竹竿）。
const ZHOU_KIT_LOCAL = {x: 0.07, y: 0.105, z: 0.86, yaw: 0.32};
/**
 * 老周的帆布挎包：扁的软包身（顶面鼓、四边收）+ 盖到前沿垂下来的包盖 + 一段折在包上的背带。
 * 原点在包底中心，平放，长边沿 X。原来是一块 0.32×0.43×0.21 竖着立的卡其方块，看不出是什么。
 */
function HaversackGeometry() {
  const w = .28, h = .06, d = .2;
  const body = new THREE.BoxGeometry(w, h, d, 6, 2, 6), p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = p.getZ(i) / (d / 2), t = (p.getY(i) + h / 2) / h;
    const fall = (1 - u * u) * (1 - v * v);
    // 顶面鼓起、底面贴平；侧面往中间收一点，棱就软了。
    const pinch = 1 - .12 * Math.abs(t - .5) * 2;
    p.setXYZ(i, p.getX(i) * pinch, t * h + t * .028 * fall, p.getZ(i) * pinch);
  }
  body.computeVertexNormals();
  const flapTop = PlaceGeometry(new THREE.BoxGeometry(w * .96, .008, d * .62), {x: 0, y: h + .03, z: d * .19, rx: -.08});
  const flapFront = PlaceGeometry(new THREE.BoxGeometry(w * .96, h * .8, .008), {x: 0, y: h * .62, z: d * .5 + .004});
  const strap = PlaceGeometry(new THREE.BoxGeometry(.03, .006, .34), {x: -w * .3, y: h + .036, z: -.02, ry: .18});
  const geometry = MergeGeometries([body.toNonIndexed(), flapTop, flapFront, strap]);
  geometry.computeBoundingBox();
  return geometry;
}
/**
 * 车板上的麻袋（停滞车列，MID.transferConvoy.sacks）：软的、顶面鼓起、四边收，原点在袋底中心。
 * 与 HaversackGeometry 同一路做法（一只带分段的盒子往里收），不是「画了袋缝的白盒块」。
 */
function CartSackGeometry() {
  const { w, h, d } = MID.transferConvoy.sacks.size;
  const body = new THREE.BoxGeometry(w, h, d, 4, 3, 5), p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = p.getZ(i) / (d / 2), t = (p.getY(i) + h / 2) / h;
    const belly = 1 - .16 * Math.pow(Math.abs(t - .5) * 2, 1.6);
    p.setXYZ(i, p.getX(i) * belly, t * h + .05 * h * (1 - u * u) * (1 - v * v), p.getZ(i) * (1 - .06 * Math.abs(u)) * belly);
  }
  body.computeVertexNormals();
  return body.toNonIndexed();
}
import { BuildSink } from "./Script_World.mjs";
import { MergeGeometries, PlaceGeometry } from "./Script_Geo.mjs";
import { ApplyShadowDepth, AttachShadowDepth } from "./Script_ShadowDepth.mjs";
import { MISSION_PLACEMENT, MISSION_SUPPLIES, MISSION_SUPPLY_COLLIDER } from "./Data_FirstLevelMissionLayout.mjs";
import { Type89Damage } from "./Script_Type89Damage.mjs";
import { FirstLevelSmokeOrigins } from "./Script_FirstLevelSmokeOrigins.mjs";
import { FRONT_BATTLE_TUNING } from "./Data_Tuning_FirstLevelFront.mjs";
// 战车包（2026-09-23）：炮管运行时枢轴、履带滚动、按车体轴贴地、履带尘 / 排气。数值在 Data_Tuning_Tank.view。
import { TANK } from "./Data_Tuning_Tank.mjs";
import { TerrainTrailSystem } from "./Script_TerrainTrails.mjs";
import { TERRAIN_TRAIL_VEHICLES } from "./Data_Tuning_TerrainTrails.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { ApplyPatches, PatchesOf, MakeUvScrollPatch } from "./Script_MaterialPatches.mjs";
import { DraftCartModels } from "./Script_DraftCartModel.mjs";
import { BuildAftermathTopField, CartDeckLift, CartSuspension, CorpseSegments, SegmentTop } from "./Script_CartCorpseBump.mjs";
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
    this.draftCartModels = new DraftCartModels(this.root);
    this.personColor = new THREE.Color();
    for (const [key, geometry, color, count] of [
      ["fieldPack", HaversackGeometry(), 0x6c6547, 4],
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
      // 担架：1938 竹竿布兜担架（Script_StretcherAsset），颜色在顶点色里，材质取白。
      // 布面亮度照旧压在脏帆布那一档：0xd1d0be 在门口那片天光下会被顶成一块发光的白板，
      // 躺在上面的人整个读成一团黑影（2026-09-16 屋内伏击出图实拍）。十副担架同一份材质。
      ["bed", CreateStretcherGeometry(), 0xffffff, 20],
      ["patient", new THREE.BoxGeometry(0.49, 0.19, 1.55), 0xd9d7cb, 26],
      ["medical", new THREE.BoxGeometry(0.24, 0.2, 0.12), 0xe1e2d5, 32],
      ["cart", new THREE.BoxGeometry(3, 0.38, 5.8), 0x8a7b69, 7],
      ["wheel", new THREE.CylinderGeometry(0.48, 0.48, 0.15, 10), 0x454a48, 28],
      // 停滞车列车板上的麻袋（MID.transferConvoy）：一辆车 18 只，最多同时 6 辆（B C D 与 E E2 E3 替身）。
      ["cartSack", CartSackGeometry(), 0xa39a80, 144],
    ]) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.92, vertexColors: key === "bed" });
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
    this.zhouBed = new THREE.Mesh(CreateStretcherGeometry(), this.parts.bed.material);
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
    this.BuildEmptyLitterStack();
    this.BuildGroundStretchers();
    this.people=new MissionPeople({root:this.root,actorFactory,battlefield});
    this.aftermath=new MissionAftermath({root:this.root,actorFactory,battlefield,vfx});
    // 尸体层的实例桶在它自己的构造里建齐；挂共用深度材质的事在这里做，
    // 那个文件的桶结构归另一路（见 docs/Data_TechRenderPipeline.md §17.11）。
    ApplyShadowDepth(this.aftermath.root);
    // 牛马车压过尸体（Script_CartCorpseBump）：静态战场尸体开机烘一张顶面高度格，
    // 战斗里新倒下的人每辆车现取命中体。
    this.corpseTopField=BuildAftermathTopField(this.aftermath);
    this.cartSuspension=new CartSuspension();
    this.corpseSegmentCache=new WeakMap();
    this.lastUpdateTime=null;
    this.BuildTank();
    this.BuildSupplies();
    this.smokeOrigins = new FirstLevelSmokeOrigins({root:this.root,battlefield,physics,actorFactory,library});

  }
  /** 05–18 地上平放的担架（MISSION_PLACEMENT.groundStretchers；静态实例，与担架队同一份几何和材质）。 */
  BuildGroundStretchers() {
    const list = MISSION_PLACEMENT.groundStretchers || [];
    this.groundStretchers = list.map((spec) => ({ ...spec, y: this.battlefield.GroundHeight(spec.x, spec.z) }));
    // 06 / 11 / 15–17 各成一簇：一簇一只实例网格，包围球只罩住本簇，视锥外整簇不画
    // （一只网格罩住全关的话它永远在视锥里，每个阴影层也都要画一遍）。
    const clusters = new Map();
    for (const spec of this.groundStretchers) {
      const key = Math.round(spec.z / GROUND_STRETCHER_CLUSTER_M);
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(spec);
    }
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (const [key, specs] of clusters) {
      const mesh = new THREE.InstancedMesh(this.parts.bed.geometry, this.parts.bed.material, specs.length);
      mesh.name = `MissionGroundStretchers${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      AttachShadowDepth(mesh);
      specs.forEach((spec, i) => {
        q.setFromEuler(new THREE.Euler(0, spec.yaw, 0));
        matrix.compose(new THREE.Vector3(spec.x, spec.y, spec.z), q, one);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.computeBoundingSphere();
      this.root.add(mesh);
      this.meshes.push(mesh);
    }
  }
  /** 接收院西北角码着的空担架（静态实例，与担架队同一份几何和材质）。 */
  BuildEmptyLitterStack() {
    const spec = MISSION_PLACEMENT.receptionYard?.emptyLitterStack;
    if (!spec) return;
    const count = spec.columns * spec.layers;
    const mesh = new THREE.InstancedMesh(this.parts.bed.geometry, this.parts.bed.material, count);
    mesh.name = "MissionEmptyLitterStack";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    AttachShadowDepth(mesh);
    // 上一层的横撑（底面 +0.047 m）压在下一层的竹竿顶（+0.155 m）上：层距 0.11 m。
    const ground = this.battlefield.GroundHeight(spec.x, spec.z);
    const c = Math.cos(spec.yaw), s = Math.sin(spec.yaw), matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
    let index = 0;
    for (let layer = 0; layer < spec.layers; layer++) for (let column = 0; column < spec.columns; column++) {
      const jitter = Math.sin(index * 12.9898) * .5;          // 码得不齐：每副偏一点点
      const lx = (column - (spec.columns - 1) / 2) * .72 + jitter * .05, lz = jitter * .12;
      q.setFromEuler(new THREE.Euler(0, spec.yaw + jitter * .06, 0));
      matrix.compose(new THREE.Vector3(spec.x + c * lx + s * lz, ground + layer * .11, spec.z - s * lx + c * lz),
        q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(index++, matrix);
    }
    this.root.add(mesh);
    this.meshes.push(mesh);
    this.emptyLitterStack = mesh;
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
      // 2026-09-28 B1：补给点画成旧弹药箱（开场布景的箱板贴图，第一关按需集；没下到用开机的 WoodCrate），
      // 不再是一块米白平色盒。每个补给点一份克隆：可交互时的呼吸发光是逐个点亮的。
      const crateSet=this.library?.baked?.has?.("OpeningCrate")?"OpeningCrate":this.library?.baked?.has?.("WoodCrate")?"WoodCrate":null;
      const material=crateSet?CloneShadedMaterial(this.library.Get(crateSet,{color:0xc9c0b0,metalness:0})):
        new THREE.MeshStandardMaterial({color:0x9b927b,roughness:.88,metalness:0});
      material.emissive.setHex(0xffeac8);material.emissiveIntensity=0;
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
    // 履带用克隆出来的一份材质挂滚动补丁（Script_MaterialPatches.MakeUvScrollPatch）：
    // 别处共用的那份 Type89Track 不动。
    const trackMaterial=CloneShadedMaterial(this.library.Get("Type89Track",{side:THREE.DoubleSide}));
    this.trackScroll={value:new THREE.Vector2()};
    ApplyPatches(trackMaterial,[...(PatchesOf(trackMaterial)||[]),MakeUvScrollPatch(this.trackScroll,{key:"tankTrackScroll1"})]);
    this.materials.push(trackMaterial);
    const materials = { type89Armor:this.library.Get("Type89Armor",{side:THREE.DoubleSide}),
      type89Barrel:this.library.Get("Type89Armor",{side:THREE.DoubleSide}),
      type89Track:trackMaterial };
    const model=this.actorFactory.ModelInstance("Type89Tank",materials);
    if(!model)throw new Error("First level requires the existing Type89Tank model");
    this.tankModel=model;this.tank.add(model.root);
    // 履带印（docs/Data_TerrainTrails.md §3.4）：两条履带按各自的轨迹连续盖印；车不可见 / 不在地形上时不盖。
    TerrainTrailSystem.TrackVehicle(this.tank,TERRAIN_TRAIL_VEHICLES.type89);
    model.root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    this.turret=model.nodes.get("turret");
    // 炮管枢轴：TZM 里炮管是炮塔下单独一块网格（type89Barrel），运行时挂到耳轴处的新节点上，
    // 俯仰 / 后坐只转这个节点（不重导 TZM —— Type89DamageTest 断言源文件 sha）。炮口挂点跟着走。
    const trunnion=new THREE.Vector3().fromArray(TANK.view.trunnion);
    this.gun=new THREE.Group();this.gun.name="MissionTankGunTrunnion";this.gun.position.copy(trunnion);this.turret.add(this.gun);
    this.gunRecoil=new THREE.Group();this.gunRecoil.name="MissionTankGunRecoil";this.gun.add(this.gunRecoil);
    const barrel=model.meshes.find(m=>m.name.endsWith("_type89Barrel"));
    if(barrel){this.gunRecoil.add(barrel);barrel.position.sub(trunnion);}
    const gunMuzzle=model.nodes.get("gunMuzzle");
    if(gunMuzzle){this.gunRecoil.add(gunMuzzle);gunMuzzle.position.sub(trunnion);}
    this.tankFx={dust:[null,null],exhaust:null,puff:null,puffAt:-Infinity,time:null,point:new THREE.Vector3()};
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
    const hullYaw=tank.hullYaw??Math.PI;
    // 一帧里 UpdateTank / 封锁判定 / 演出会问好几次炮口：位姿没变就不重算整棵树。
    const key=`${tank.x}|${tank.z}|${hullYaw}|${tank.turretYaw}|${tank.gunPitch||0}|${tank.hullPitch||0}|${tank.recoil||0}`;
    if(key===this.tankSyncKey)return;
    this.tankSyncKey=key;
    const h=(x,z)=>this.battlefield.GroundHeight(x,z);
    // 按车体轴取地面（车头 −Z）：以前按世界 ±Z / ±X 取，车头朝西时前后左右全对不上。
    const fx=-Math.sin(hullYaw),fz=-Math.cos(hullYaw),rx=Math.cos(hullYaw),rz=-Math.sin(hullYaw);
    const front=h(tank.x+fx*1.8,tank.z+fz*1.8),rear=h(tank.x-fx*1.8,tank.z-fz*1.8);
    const right=h(tank.x+rx,tank.z+rz),left=h(tank.x-rx,tank.z-rz);
    this.tank.position.set(tank.x,(front+rear+left+right)/4,tank.z);
    // rotation.x 为正 = 车头抬起；rotation.z 为正 = 右侧抬起。点头 / 后仰叠在地形俯仰上。
    this.tank.rotation.set(Math.atan2(front-rear,3.6)+(tank.hullPitch||0),hullYaw,Math.atan2(right-left,2),"YXZ");
    this.turret.rotation.y=tank.turretYaw-hullYaw;
    if(this.gun)this.gun.rotation.x=tank.gunPitch||0;
    if(this.gunRecoil)this.gunRecoil.position.z=tank.recoil||0;
    this.tank.updateMatrixWorld(true);
  }
  /** 履带滚动、两条履带后的扬尘、排气（油门一脚一股烟）。只在大脑接管时跑（tank.brain）。 */
  UpdateTankFx(time,tank) {
    const V=TANK.view,fx=this.tankFx,dt=fx.time==null?0:Math.min(.1,Math.max(0,time-fx.time));fx.time=time;
    const shown=this.tank.visible;
    this.trackScroll.value.x=(this.trackScroll.value.x-(tank.speed||0)*dt*V.trackUvPerM)%64;
    this.trackScroll.value.y=(this.trackScroll.value.y+(tank.pivotRate||0)*dt*.9*V.trackUvPerM)%64;
    const dusty=shown&&!tank.immobilized&&(Math.abs(tank.speed||0)>=V.trackDust.minSpeedMps||Math.abs(tank.pivotRate||0)>.05);
    for(let i=0;i<2;i++){
      if(dusty){
        fx.point.fromArray(V.trackDust.offsets[i]);this.tank.localToWorld(fx.point);
        if(fx.dust[i]==null)fx.dust[i]=this.vfx?.SmokeSource(fx.point.clone(),V.trackDust.source)??null;
        else this.vfx?.MoveSmokeSource(fx.dust[i],fx.point);
      }else if(fx.dust[i]!=null){this.vfx?.RemoveSmokeSource(fx.dust[i]);fx.dust[i]=null;}
    }
    const running=shown&&(tank.rpm||0)>1;
    fx.point.fromArray(V.exhaust.offset);this.tank.localToWorld(fx.point);
    if(running){
      if(fx.exhaust==null)fx.exhaust=this.vfx?.SmokeSource(fx.point.clone(),V.exhaust.source)??null;
      else this.vfx?.MoveSmokeSource(fx.exhaust,fx.point);
      if((tank.load||0)>=V.exhaust.puffLoad&&time-fx.puffAt>=V.exhaust.puffCooldownS){
        fx.puffAt=time;if(fx.puff==null)fx.puff=this.vfx?.SmokeSource(fx.point.clone(),V.exhaust.puff)??null;
      }
    }else if(fx.exhaust!=null){this.vfx?.RemoveSmokeSource(fx.exhaust);fx.exhaust=null;}
    if(fx.puff!=null){
      if(!running||time-fx.puffAt>=V.exhaust.puffS){this.vfx?.RemoveSmokeSource(fx.puff);fx.puff=null;}
      else this.vfx?.MoveSmokeSource(fx.puff,fx.point);
    }
  }
  StopTankFx(){
    const fx=this.tankFx;if(!fx)return;
    for(const handle of [...fx.dust,fx.exhaust,fx.puff])if(handle!=null)this.vfx?.RemoveSmokeSource(handle);
    fx.dust=[null,null];fx.exhaust=null;fx.puff=null;
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
    this.cartRotation.setFromEuler(new THREE.Euler(cart.bumpPitch||0,cart.yaw,cart.overturned?1.1:(cart.bumpRoll||0),"YXZ"));
    this.position.set(x,y,z).applyQuaternion(this.cartRotation);
    this.position.add(new THREE.Vector3(cart.x,ground+(cart.overturned?1.6:1+(cart.bumpHeave||0)),cart.z));
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
    this.cartRotation.setFromEuler(new THREE.Euler(cart.bumpPitch||0,cart.yaw,cart.overturned?1.1:(cart.bumpRoll||0),"YXZ"));
    this.position.set(x,y,z).applyQuaternion(this.cartRotation);
    this.position.add(new THREE.Vector3(cart.x,ground+(cart.overturned?1.6:1+(cart.bumpHeave||0)),cart.z));
    this.localRotation.setFromEuler(new THREE.Euler(rx,0,rz));
    this.rotation.copy(this.cartRotation).multiply(this.localRotation);
    mesh.position.copy(this.position);mesh.quaternion.copy(this.rotation);mesh.scale.set(1,1,1);
    return mesh;
  }
  /** 停滞车列车板上的麻袋（局部坐标 x 横向、z 沿车；layers 见 MID.transferConvoy.sacks）。 */
  DrawCartSacks(cart,ground) {
    const S=MID.transferConvoy.sacks;
    let n=0;
    S.layers.forEach((layer,li)=>{
      for(const x of layer.xs)for(const z of layer.zs){
        n++;
        const j=Math.sin(n*12.9898+cart.z*.37)*.5, k=Math.sin(n*78.233+cart.x*.21)*.5;
        // 局部 y 相对 ground+1：车板顶 deckTopM，往上一层一个袋高（第二层压在第一层的缝上）。
        this.CartInstance("cartSack",cart,ground,x+j*.06,S.deckTopM-1+li*S.size.h*.86,z+k*.05,k*.08,j*.10);
      }
    });
  }
  /** 侧翻残车旁撒在地上的麻袋（MID.transferConvoy.sacks.spilled，车局部坐标）。 */
  DrawSpilledSacks(cart) {
    const c=Math.cos(cart.yaw),s=Math.sin(cart.yaw);
    for(const [lx,lz,yaw,rx,rz] of MID.transferConvoy.sacks.spilled){
      const x=cart.x+lx*c+lz*s,z=cart.z-lx*s+lz*c;
      this.Instance("cartSack",x,this.battlefield.GroundHeight(x,z)-.03,z,cart.yaw+yaw,1,1,1,rx,rz);
    }
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
  RigidProp(key, id, x, y, z, yaw, quaternion = null) {
    const identity=key+':'+id;
    let mesh=this.rigidProps.get(identity);
    if(!mesh){
      const template=this.rigidTemplates[key];
      if(this.rigidParts[key].length>=template.capacity)return;
      mesh=new THREE.Mesh(template.geometry,template.material);
      mesh.name='Mission_'+identity;mesh.castShadow=true;mesh.receiveShadow=true;
      this.rigidProps.set(identity,mesh);this.rigidParts[key].push(mesh);this.root.add(mesh);
    }
    mesh.position.set(x,y,z);if(quaternion)mesh.quaternion.copy(quaternion);else mesh.rotation.set(0,yaw,0);mesh.visible=true;
  }
  /**
   * 这辆车周围「尸体比地面高多少」：静态顶面格 + 车周 dynamicRangeM 内倒下的人
   *（AI 尸体、任务人群里的死者）的命中体胶囊。
   */
  CorpseHeightNear(cart,soldiers){
    const B=MID.cartCorpseBump,range2=B.dynamicRangeM*B.dynamicRangeM,segments=[];
    // AI 尸体在远景层里 root 是藏着的，命中体照样在（走人群矩阵）；
    // 任务人群的死者这一帧没人报就被 People.End 藏起来，那就是不在场。
    const Take=(actor,x,z,requireVisible)=>{
      if(!actor?.GetBoneHitboxes||(requireVisible&&!actor.root?.visible))return;
      if((x-cart.x)**2+(z-cart.z)**2>range2)return;
      let cached=this.corpseSegmentCache.get(actor);
      if(!cached||this.time-cached.time>B.dynamicRefreshS||Math.hypot(x-cached.x,z-cached.z)>B.dynamicMoveM){
        cached={x,z,time:this.time,segments:CorpseSegments(actor.GetBoneHitboxes())};
        this.corpseSegmentCache.set(actor,cached);
      }
      for(const segment of cached.segments)segments.push(segment);
    };
    for(const s of soldiers||[])if(!s.alive&&s.actor)Take(s.actor,s.position.x,s.position.z,false);
    for(const entry of this.people.people.values())if(entry.dead)Take(entry.actor,entry.last.x,entry.last.z,true);
    const field=this.corpseTopField,ground=this.battlefield;
    return (x,z)=>{
      let top=field.Top(x,z);
      for(const segment of segments){const y=SegmentTop(segment,x,z);if(y>top)top=y;}
      return top===-Infinity?0:Math.max(0,top-ground.GroundHeight(x,z));
    };
  }
  Update(time, { tank,player,camera=null,soldiers=null } = {}) {
    const dt=this.lastUpdateTime===null||!(time>this.lastUpdateTime)?0:Math.min(.1,time-this.lastUpdateTime);
    this.lastUpdateTime=time;this.time=time;
    this.people.Begin(time,player?.position);
    this.aftermath.Update(player?.position,camera);
    for (const mesh of Object.values(this.parts)) mesh.count = 0;
    for (const mesh of this.rigidProps.values()) mesh.visible=false;
    for (const mesh of this.stableCartParts.values()) mesh.visible=false;
    this.draftCartModels.Begin();
    this.UpdateSupplies(time);
    // 2026.09.19 第二波：车站卸车挨炸那一拍随军列开场下线（`column.stationBombed`
    // 已无人写入，MISSION_PLACEMENT.stationCasualties 也一并删了）。
    for (const litter of this.column.litters) {
      if (!litter.visible) continue;
      const ground = this.battlefield.GroundHeight(litter.x, litter.z);
      let height = litter.loaded
          ? 1.2
          // 放在地上：布兜底（模型最低点 +0.03）贴地。倒地那副还往一头歪 0.1 rad，
          // 低的那头竿子要离开地面，所以多垫 3 cm。原来的 0.22 让地上的担架悬空二十几厘米。
          : litter.state === "fallen" ? 0.03
            : litter.state === "critical" || litter.state === "placed" ? 0
            : .76 + (litter.liftFraction || 0) * .44;
      const yaw = litter.yaw || 0;
      // 车上的担架跟着车身颠（Script_CartCorpseBump）：按它在车板上的局部位置取抬升。
      const onCart = litter.loaded ? this.column.vehicles.find((cart) => cart.load.includes(litter.id)) : null;
      let tiltPitch = 0, tiltRoll = 0;
      if (onCart) {
        const dx = litter.x - onCart.x, dz = litter.z - onCart.z, cc = Math.cos(onCart.yaw), cs = Math.sin(onCart.yaw);
        height += CartDeckLift(onCart, dx * cc - dz * cs, dx * cs + dz * cc);
        tiltPitch = onCart.bumpPitch || 0; tiltRoll = onCart.bumpRoll || 0;
      }
      // 06 老周坐在土壁边时是活人身体（Script_FirstLevelCollection.SeatZhou），这一副担架连人都不画。
      if (litter.zhou && litter.liveSeated) { this.zhouRoot.visible = false; continue; }
      if (litter.zhou) {
        this.zhouRoot.visible = true;
        this.zhouRoot.position.set(litter.x, ground + height, litter.z);
        // 落地那一下只歪一点点。原来是 0.45 rad（26°）：担架成了一道白色的斜坡，
        // 而躺在上面的人（实例化的也好、带骨架的老周也好）是平的 —— 人浮在坡面上方，
        // 从地板镜头看过去整副担架读不出「上面躺着个人」（2026-09-16 屋内伏击出图实拍）。
        // litter.roll 是 16 过厢房门槛时那一歪（FirstLevelReception 写，几帧就回正）。
        this.zhouRoot.rotation.set((litter.state === "fallen" ? 0.1 : 0) + tiltPitch, yaw, (litter.roll || 0) + tiltRoll, "YXZ");
        this.zhouPatient.material.color.setHex(litter.health < 25 ? 0xbda5a0 : 0xd9d7cb);
        // 老周担架上的近景件（他的挎包）。**身份稳定的普通 Mesh**，不是实例 ——
        // 逐实例形变不在 MotionVector 契约内（见 Script_PostPrepass 抬头），
        // 12/13 这副担架会跟着牛马车走、相机也跟着走，正是那类近景移动件。
        // 挎包跟着担架一起歪（落地、过门槛、车上颠），平放在头边布兜上。
        // 挎包与担架同挂在 this.root 下：用担架的局部矩阵换算就够，不必刷整棵树。
        this.zhouRoot.updateMatrix();
        const kit = this.zhouKitScratch ||= {p: new THREE.Vector3(), q: new THREE.Quaternion(), turn: new THREE.Quaternion()};
        kit.p.set(ZHOU_KIT_LOCAL.x, ZHOU_KIT_LOCAL.y, ZHOU_KIT_LOCAL.z).applyMatrix4(this.zhouRoot.matrix);
        kit.q.copy(this.zhouRoot.quaternion).multiply(kit.turn.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ZHOU_KIT_LOCAL.yaw));
        this.RigidProp("fieldPack", "ZhouKit", kit.p.x, kit.p.y, kit.p.z, yaw, kit.q);
      } else {
        this.Instance("bed", litter.x, ground + height, litter.z, yaw);
      }
      // 2026.09.19 第三波：屋内伏击拍下线之后，「挨刀的老周走带骨架伤员」那条支路
      // （MissionPeople.RiggedPatient）永远走不到 —— 挂 clip 的入口没人调了。
      // 担架上的人统一走实例化的烘焙姿势。
      this.people.Patient(litter.id,litter.x,ground+height+STRETCHER_PATIENT_LIFT_M,litter.z,yaw,time,litter.zhou?{stabbed:!!litter.stabbed}:null);
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
    for (const cart of [...this.column.vehicles, ...this.column.traffic.filter((cart) => cart.visible), ...(this.column.convoy || []).filter((cart) => cart.visible)]) {
      if (cart.z > 178) continue;
      // sinkM：侧翻残车压进土里一截（车心离地 1 m、侧倾 63°，不压低会悬着）。
      const y = this.battlefield.GroundHeight(cart.x, cart.z) - (cart.sinkM || 0);
      this.SyncCartCollider(cart,y);
      this.cartSuspension.Step(cart,dt,this.CorpseHeightNear(cart,soldiers));
      const stable=cart.id===stableCartId;
      const c=Math.cos(cart.yaw),s=Math.sin(cart.yaw);
      const moving=!cart.overturned&&(cart.departed||cart.state==="approaching"||cart.id.startsWith("SouthCart"));
      const travel=(cart.progress||0)+(cart.approachProgress||0);
      const team=cart.boltedTeam;
      const animalYaw=team?.yaw??cart.yaw,mc=Math.cos(animalYaw),ms=Math.sin(animalYaw);
      const offset=MID.draft.teamOffsetM,mx=team?.x??cart.x-s*offset,mz=team?.z??cart.z-c*offset,my=this.battlefield.GroundHeight(mx,mz);
      const animalVisible=(!cart.overturned || !!(team&&team.progress<team.length)) && !cart.abandoned;
      if(this.draftCartModels.ready){
        this.draftCartModels.Sync(cart,y,{x:mx,z:mz,ground:my,yaw:animalYaw,
          visible:animalVisible,moving:moving||!!team,travel:team?.progress??travel},
          stable?this.stableCartParts:null);
      }else{
        // Keep the existing whitebox as a loading/error fallback.
        if(stable)this.StableCartInstance("cart",cart,"deck",y,0,0,0);
        else this.CartInstance("cart",cart,y,0,0,0);
        for(const side of [-1,1]){
          if(stable){
            this.StableCartInstance("cartRail",cart,`rail:${side}`,y,side*1.4,.45,0);
            this.StableCartInstance("cartShaft",cart,`shaft:${side}`,y,side*.58,-.16,-3.75);
          }else{
            this.CartInstance("cartRail",cart,y,side*1.4,.45,0);
            this.CartInstance("cartShaft",cart,y,side*.58,-.16,-3.75);
          }
        }
        if(animalVisible){
        // 牛 / 马：同一对实例桶，按 Data_Tuning_FirstLevelMid.draft 的比例缩。
        const draft=MID.draft[cart.draft==="ox"?"ox":"horse"];
        const [bx,by,bz]=draft.bodyScale,[hx,hy,hz]=draft.headScale;
        const headY=my+1.5-draft.headDrop;
        if(stable){
          this.StableInstance("muleBody",cart,"draftBody",mx,my+1*by,mz,animalYaw,bx,by,bz);
          this.StableInstance("muleHead",cart,"draftHead",mx-ms*.8,headY,mz-mc*.8,animalYaw,hx,hy,hz);
        }else{
          this.Instance("muleBody",mx,my+1*by,mz,animalYaw,bx,by,bz);
          this.Instance("muleHead",mx-ms*.8,headY,mz-mc*.8,animalYaw,hx,hy,hz);
        }
        // 牛角：一对，挂在头两侧前上方，往外岔开。
        if(draft.horn)for(const side of [-1,1]){
          const horn=[mx-ms*(.8+MID.horn.forwardM)+mc*side*MID.horn.lateralM,
            headY+MID.horn.riseM,
            mz-mc*(.8+MID.horn.forwardM)-ms*side*MID.horn.lateralM];
          if(stable)this.StableInstance("draftHorn",cart,`draftHorn:${side}`,...horn,animalYaw,1,1,1,0,side*MID.horn.tiltRad);
          else this.Instance("draftHorn",...horn,animalYaw,1,1,1,0,side*MID.horn.tiltRad);
        }
        for(const side of [-1,1])for(const end of [-1,1]){
          const swing=moving||team?Math.sin(time*(team?10:6)+side*end*Math.PI/2)*.32:0;
          const limb=[mx+mc*side*.21*bx-ms*end*.52*bz,my+.37*by,mz-ms*side*.21*bx-mc*end*.52*bz];
          if(stable)this.StableInstance("limb",cart,`draftLimb:${side}:${end}`,...limb,animalYaw,.8,1.1*by,.8,swing);
          else this.Instance("limb",...limb,animalYaw,.8,1.1*by,.8,swing);
        }
        }
        for(const side of [-1,1])for(const end of [-1,1]){
          if(stable)this.StableCartInstance("wheel",cart,`wheel:${side}:${end}`,y,side*1.55,-.51,-end*1.8,0,Math.PI/2);
          else this.CartInstance("wheel",cart,y,side*1.55,-.51,-end*1.8,0,Math.PI/2);
          for(const [phaseIndex,phase] of [0,Math.PI/2].entries()){
            if(stable)this.StableCartInstance("spoke",cart,`spoke:${side}:${end}:${phaseIndex}`,y,side*1.635,-.51,-end*1.8,travel/.48+phase);
            else this.CartInstance("spoke",cart,y,side*1.635,-.51,-end*1.8,travel/.48+phase);
          }
        }
      }
      if(cart.cargo==="sacks")this.DrawCartSacks(cart,y);
      else if(cart.cargo==="spilled")this.DrawSpilledSacks(cart);
      if(animalVisible)this.Person(mx+mc*1.1,mz-ms*1.1,animalYaw,time,
        {id:cart.id+"Driver",kind:"medic",moving:moving||!!team});
      if (cart.id.startsWith("SouthCart")) {
        for (const side of [-1, 1]) {
          this.people.Patient(cart.id+side,cart.x+c*side*.65,y+1.22+CartDeckLift(cart,side*.65,0),cart.z-s*side*.65,cart.yaw,time);
        }
      }
    }
    // 15–18 的布景（掉队伤员、门外抬进来的下一副担架、夜景里的队列与搬运）：
    // 必须画在 people.Begin/End 之间，没报的那一帧人自动藏起来。
    this.extras?.Draw(this, time);
    // 担架上的伤员是立即模式、不做视锥剔除：只在玩家走近时才报（离远了整帧、每个阴影层都白画）。
    const eye = camera?.position || player?.position;
    for (const spec of this.groundStretchers)
      if (spec.patient && (!eye || Math.hypot(eye.x - spec.x, eye.z - spec.z) <= GROUND_STRETCHER_PATIENT_DRAW_M))
        this.people.Patient(spec.id, spec.x, spec.y + STRETCHER_PATIENT_LIFT_M, spec.z, spec.yaw, time);
    this.people.End();
    const visibleCarts=new Set([...this.column.vehicles,...this.column.traffic.filter(c=>c.visible),...(this.column.convoy||[]).filter(c=>c.visible)].filter(c=>c.z<=178).map(c=>c.id));
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
      if(tank.brain)this.UpdateTankFx(time,tank);
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
    if(this.tank)TerrainTrailSystem.UntrackVehicle(this.tank);
    this.smokeOrigins.Dispose();
    this.draftCartModels.Dispose();
    if(this.frontBandage){this.frontBandage.removeFromParent();this.frontBandage.geometry.dispose();}
    this.tankDamage.Dispose();
    this.StopTankFx();
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
