// Rigid, metre-based mechanism driver for the exported Type 94 hierarchy.
// Belt travel is signed distance around the authored path, independent by side.
// This module contains no loader, renderer, audio or unrelated game behavior.
export class Type94Mechanism {
  constructor(root, path) {
    this.root = root;
    this.path = path;
    this.sides = {};
    for (const side of ["Left", "Right"]) {
      const links = [], wheels = [];
      root.traverse(node => {
        if (node.name.startsWith(`TrackLink_${side}_`)) links.push(node);
        if (node.name.startsWith(`Wheel_${side}_`) && node.userData.WheelRadiusM) wheels.push(node);
      });
      links.sort((a,b) => a.userData.TrackIndex - b.userData.TrackIndex);
      if (links.length !== path.linkCount) throw new Error(`Type94 ${side}: exported link count differs from path`);
      this.sides[side] = {links, wheels, centerX: links[0].position.x, distanceM: 0};
    }
    this.turret = root.getObjectByName("TurretYaw");
    this.gun = root.getObjectByName("MachineGunPitch");
    this.gunYaw = root.getObjectByName("MachineGunYaw");
    this.towShackle = root.getObjectByName("TowShackleFront");
    this.towShackleRest = this.towShackle ? this.towShackle.rotation.x : 0;
    this.towLatch = root.getObjectByName("TowLatchFront");
    this.towLatchRestQuaternion = this.towLatch?.quaternion.clone();
    const hatchNames=["Commander", "DriverRoof", "DriverVisor", "Engine", "RearCargo", "DriverPortLeft", "TurretPortLeft", "TurretPortRight"];
    if(root.getObjectByName("Hatch_DriverPortRight"))hatchNames.push("DriverPortRight");
    if(root.getObjectByName("Hatch_TurretRear"))hatchNames.push("TurretRear");
    this.hatches = Object.fromEntries(hatchNames.map(name => [name, root.getObjectByName(`Hatch_${name}`)]));
    this.hatchAmounts = Object.fromEntries(Object.keys(this.hatches).map(name=>[name,0]));
    this.hatchRest = Object.fromEntries(Object.entries(this.hatches).filter(([,node])=>node).map(([name,node])=>[name,{x:node.rotation.x,y:node.rotation.y,z:node.rotation.z}]));
    this.hatchRestQuaternion = Object.fromEntries(Object.entries(this.hatches).filter(([,node])=>node).map(([name,node])=>[name,node.quaternion.clone()]));
    this.rearLatch = root.getObjectByName("RearDoorLatchTurner");
    this.rearLatchRestQuaternion = this.rearLatch?.quaternion.clone();
    if (!this.turret || !this.gun) throw new Error("Type94 articulation hierarchy is incomplete");
  }

  Sample(distanceM) {
    const {points, distances, lengthM} = this.path;
    const s = ((distanceM % lengthM) + lengthM) % lengthM;
    let lo = 0, hi = points.length - 1;
    while (lo < hi) { const mid = Math.ceil((lo+hi)/2); if (distances[mid] <= s) lo=mid; else hi=mid-1; }
    const a=points[lo], b=points[(lo+1)%points.length];
    const t=(s-distances[lo])/(distances[lo+1]-distances[lo]);
    return {longitudinalM:a[0]+(b[0]-a[0])*t, heightM:a[1]+(b[1]-a[1])*t,
      rotationX:Math.atan2(b[1]-a[1],b[0]-a[0])+Math.PI};
  }

  SetBeltDistance(side, distanceM) {
    const state=this.sides[side];
    if (!state || !Number.isFinite(distanceM)) throw new Error("Type94 invalid belt distance or side");
    state.distanceM=distanceM;
    state.links.forEach((link,i) => {
      const p=this.Sample(i*this.path.pitchM+distanceM);
      link.position.set(state.centerX,p.heightM,-p.longitudinalM);
      link.rotation.set(p.rotationX,0,0);
    });
    for (const wheel of state.wheels) {
      // Road-wheel tyres roll on the straight inner run; wrapped sprockets
      // and idlers use the actual belt-centre radius of their authored wrap.
      const radius = wheel.name.endsWith("Drive") ? this.path.drivePitchRadiusM : wheel.name.endsWith("Idler") ? this.path.idlerWrapRadiusM
        : wheel.userData.WheelRadiusM;
      wheel.rotation.x=distanceM/radius+(wheel.userData.PitchPhaseRad||0);
    }
  }

  Advance(leftMetres, rightMetres) {
    this.SetBeltDistance("Left",this.sides.Left.distanceM+leftMetres);
    this.SetBeltDistance("Right",this.sides.Right.distanceM+rightMetres);
  }

  SetTurretYaw(radians) { this.turret.rotation.y=this.frontHatchOpen||this.turretRearOpen ? 0 : radians; }
  FrontHatchGunMinimum() {
    return this.hatchAmounts.DriverRoof>.001?(this.gun.userData.DriverRoofGunMinElevationDegrees??0)*Math.PI/180:0;
  }
  SetGunElevation(radians) { this.gun.rotation.x=Math.max(this.frontHatchOpen?this.FrontHatchGunMinimum():-Math.PI/18,Math.min(Math.PI/9,radians)); }
  SetGunTraverse(radians) {
    if(!Number.isFinite(radians)) throw new Error("Type94 invalid gun traverse");
    if(!this.gunYaw)return false;
    const min=(this.gunYaw.userData.GunTraverseMinDegrees??-8)*Math.PI/180;
    const max=(this.gunYaw.userData.GunTraverseMaxDegrees??8)*Math.PI/180;
    this.gunYaw.rotation.y=this.frontHatchOpen?0:Math.max(min,Math.min(max,radians));
    return true;
  }
  SetTowShackle(amount) {
    if(!this.towShackle) return false;
    if(!Number.isFinite(amount)) throw new Error("Type94 invalid tow-shackle amount");
    this.towShackle.rotation.x=this.towShackleRest+Math.max(0,Math.min(1,amount))*Math.PI*4/9;
    return true;
  }
  SetTowLatch(amount) {
    if(!this.towLatch) return false;
    if(!Number.isFinite(amount)) throw new Error("Type94 invalid tow-latch amount");
    const angle=Math.max(0,Math.min(1,amount))*(this.towLatch.userData.DemoTravelDegrees??55)*Math.PI/180;
    const half=(this.towLatch.userData.OpenSignLocal??1)*angle/2;
    const rotation=this.towLatch.quaternion.clone().set(Math.sin(half),0,0,Math.cos(half));
    this.towLatch.quaternion.copy(this.towLatchRestQuaternion).multiply(rotation);
    return true;
  }
  SetHatch(name, amount) {
    const node=this.hatches[name];
    if (!node) throw new Error(`Type94 missing hatch ${name}`);
    this.hatchAmounts[name]=Math.max(0,Math.min(1,amount));
    let angle=this.hatchAmounts[name]*(name==="RearCargo" ? Math.PI*.55 : Math.PI*.56);
    if(name==="RearCargo"&&this.rearLatch){
      const releaseFraction=node.userData.LatchReleaseFraction??.12;
      const releaseAmount=Math.max(0,Math.min(1,this.hatchAmounts[name]/releaseFraction));
      const half=releaseAmount*(this.rearLatch.userData.OpenSignLocal??1)*(this.rearLatch.userData.ReleaseAngleDeg??90)*Math.PI/360;
      const turn=this.rearLatch.quaternion.clone().set(0,0,-Math.sin(half),Math.cos(half));
      this.rearLatch.quaternion.copy(this.rearLatchRestQuaternion).multiply(turn);
      angle=Math.max(0,Math.min(1,(this.hatchAmounts[name]-releaseFraction)/(1-releaseFraction)))*Math.PI*.55;
    }
    if(name==="DriverRoof"||name==="DriverVisor") {
      this.frontHatchOpen=this.hatchAmounts.DriverRoof>.001||this.hatchAmounts.DriverVisor>.001;
      if(this.frontHatchOpen){this.turret.rotation.y=0;this.gun.rotation.x=Math.max(this.FrontHatchGunMinimum(),this.gun.rotation.x);if(this.gunYaw)this.gunYaw.rotation.y=0;}
    }
    if(name==="TurretRear") {
      // The curved door meets the closed driver roof in the rear-facing
      // turret pose. Keep the demonstrated opening in the verified forward
      // pose; this is a modeled clearance guard, not a surveyed operating rule.
      this.turretRearOpen=this.hatchAmounts.TurretRear>.001;
      if(this.turretRearOpen)this.turret.rotation.y=0;
    }
    const localAxis=node.userData.HingeAxisLocal;
    if(localAxis==="X"||localAxis==="Y"||localAxis==="Z") {
      // Export maps Blender Y to glTF -Z, Z to +Y. Post-multiplication
      // preserves an authored inclined axis instead of adding Euler angles.
      const half=(node.userData.OpenSignLocal??1)*angle/2,sine=Math.sin(half);
      const rotation=node.quaternion.clone().set(localAxis==="X"?sine:0,localAxis==="Z"?sine:0,localAxis==="Y"?-sine:0,Math.cos(half));
      node.quaternion.copy(this.hatchRestQuaternion[name]).multiply(rotation);
    }
    else if(name==="RearCargo") node.rotation.y=angle;
    else if(name.includes("Port")) node.rotation.z=this.hatchRest[name].z+(name.endsWith("Left")?-angle:angle);
    else node.rotation.x=this.hatchRest[name].x+(node.userData.OpenSignLocal??(name==="Commander"?-1:1))*angle;
  }
}
