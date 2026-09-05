// glTF +X forward, +Y up. Set signed accumulated path length, not frame time.
// Call after setting the asset root's world position/orientation along its path.
// Rigid two-axle gondola: axleboxes and springs never rotate with the wheels.
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
    return signedDistance;
  }
  SetTravelMeters(0);
  return {SetTravelMeters, wheelCount: wheels.length, rodCount: rods.length};
}
