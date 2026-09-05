// glTF +X forward, +Y up. Set signed accumulated path length, not frame time.
// Call after setting the asset root's world position/orientation along its path.
// Rigid two-axle gondola: axleboxes and springs never rotate with the wheels.
export function ComputeValveGearPose(distance, record) {
  const angle=distance/.73+record.phase;
  const e=[.9+.18*Math.sin(angle),.73+.18*Math.cos(angle)];
  const [qx,qy]=record.pivot;const dx=e[0]-qx,dy=e[1]-qy;
  const d=Math.hypot(dx,dy),r=record.rockerLength,l=record.eccentricLength;
  const projection=(r*r-l*l+d*d)/(2*d);
  const heightSquared=r*r-projection*projection;
  if(heightSquared<0)throw new RangeError('Valve linkage cannot close');
  const height=Math.sqrt(heightSquared);
  const b=[qx+projection*dx/d-height*dy/d,qy+projection*dy/d+height*dx/d];
  const f=[qx+record.fixedSetting*(b[0]-qx),qy+record.fixedSetting*(b[1]-qy)];
  const h=[f[0]+Math.sqrt(record.radiusLength**2-(1.13-f[1])**2),1.13];
  return {e,b,f,h};
}

export function CreateTrainRig(root, manifest) {
  const wheels = manifest.wheels.flatMap(record => {
    const object = root.getObjectByName(record.name);
    return object ? [{object, ...record}] : [];
  });
  const rods = manifest.rods.flatMap(record => {
    const object = root.getObjectByName(record.name);
    return object ? [{object, ...record}] : [];
  });
  const crossheads = ['Right', 'Left'].map((side, i) => ({
    object: root.getObjectByName(`Model_Crosshead${side}`), phase: i * Math.PI / 2,
  })).filter(record => record.object);
  const axles = [];
  const valveGears=(manifest.valveGear??[]).flatMap(record=>{
    const eccentric=root.getObjectByName(record.eccentricRod);
    return eccentric?[{record,eccentric,rocker:root.getObjectByName(record.rocker),radiusRod:root.getObjectByName(record.radiusRod),stem:root.getObjectByName(record.stem)}]:[];
  });
  root.traverse(object => {
    if (/^Model_(Driver[1-5]|LeadingWheel|GondolaWheel[12])Axle$/.test(object.name)) {
      axles.push({object, radius: object.name.includes('Gondola') ? .46 : object.name.includes('Leading') ? .44 : .73});
    }
  });
  function SetTravelMeters(signedDistance) {
    if (!Number.isFinite(signedDistance)) throw new TypeError('Travel distance must be finite');
    for (const wheel of wheels) wheel.object.rotation.z = -(signedDistance / wheel.radius + wheel.phase);
    for (const axle of axles) axle.object.rotation.z = -signedDistance / axle.radius;
    for (const rod of rods) {
      const a = signedDistance / .73 + rod.phase;
      rod.object.position.x = rod.axleX + .32 * Math.cos(a);
      rod.object.position.y = .73 - .32 * Math.sin(a);
      rod.object.rotation.z = rod.kind === 'main' ? Math.asin(.32 * Math.sin(a) / rod.length) : 0;
    }
    for (const head of crossheads) {
      const a = signedDistance / .73 + head.phase;
      head.object.position.x = .9 + .32 * Math.cos(a) + Math.sqrt(2.9 ** 2 - (.32 * Math.sin(a)) ** 2);
    }
    for(const gear of valveGears){
      const {e,b,f,h}=ComputeValveGearPose(signedDistance,gear.record);
      gear.eccentric.position.set(e[0],e[1],-gear.record.side*gear.record.plane);
      gear.eccentric.rotation.z=Math.atan2(b[1]-e[1],b[0]-e[0]);
      gear.rocker.rotation.z=Math.atan2(b[0]-gear.record.pivot[0],gear.record.pivot[1]-b[1]);
      gear.radiusRod.position.set(f[0],f[1],-gear.record.side*gear.record.plane);
      gear.radiusRod.rotation.z=Math.atan2(h[1]-f[1],h[0]-f[0]);
      gear.stem.position.x=h[0];
    }
    return signedDistance;
  }
  SetTravelMeters(0);
  return {SetTravelMeters, wheelCount: wheels.length, rodCount: rods.length, valveGearCount:valveGears.length};
}
