import * as THREE from "../taihang/vendor/three/build/three.module.mjs";

const worldWidth = 190;
const worldDepth = 210;
const eyeHeight = 1.66;
const crouchHeight = 1.15;

const targetPositions = Object.freeze({
  Mill: Object.freeze({ x: -3, z: -12 }),
  Bowl: Object.freeze({ x: 4.5, z: -9 }),
  Shoe: Object.freeze({ x: 8, z: -3 }),
  Cellar: Object.freeze({ x: -1, z: -10 }),
  Family: Object.freeze({ x: 10, z: -2 }),
  AuntSun: Object.freeze({ x: -20, z: 13 }),
  Zhou: Object.freeze({ x: 5, z: 24 }),
  Canal: Object.freeze({ x: -34, z: 47 }),
  Message: Object.freeze({ x: 35, z: 52 }),
  Cart: Object.freeze({ x: 13, z: 45 }),
  Gate: Object.freeze({ x: -12, z: 65 }),
  Ferry: Object.freeze({ x: -47, z: 83 }),
});

const obstacleDefinitions = Object.freeze([
  { x: -4, z: -9, radius: 7.5 },
  { x: 14, z: 1, radius: 5.5 },
  { x: -19, z: 13, radius: 5.6 },
  { x: 5, z: 24, radius: 6.4 },
  { x: 23, z: 27, radius: 5.5 },
  { x: -24, z: -13, radius: 5.2 },
]);

const phaseLighting = Object.freeze({
  Breakfast: { sky: 0x87948d, fog: 0x9f9a83, sun: 1.15, ambient: 1.02 },
  Choice: { sky: 0x818a82, fog: 0x99927e, sun: 1.05, ambient: .98 },
  Cellar: { sky: 0x31332d, fog: 0x34342e, sun: .15, ambient: .28 },
  Rescue: { sky: 0x686b61, fog: 0x756e5c, sun: .72, ambient: .78 },
  Battle: { sky: 0x6a706a, fog: 0x787366, sun: .78, ambient: .82 },
  Reeds: { sky: 0x7f897f, fog: 0x8a8777, sun: .92, ambient: .9 },
  Epilogue: { sky: 0x9c775a, fog: 0x9b7d64, sun: .72, ambient: .83 },
});

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function CreateMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? .92,
    metalness: options.metalness ?? 0,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    depthWrite: options.depthWrite ?? true,
  });
}

function TerrainHeight(x, z) {
  const villageBasin = -Math.exp(-((x * x) + ((z - 5) * (z - 5))) / 1800) * 1.6;
  const broad = Math.sin(x * .035) * .75 + Math.cos(z * .028) * .65;
  const ridge = Math.max(0, (Math.abs(x) - 60) * .05) + Math.max(0, (z - 82) * .035);
  return villageBasin + broad + ridge;
}

function CreateTerrain(scene) {
  const geometry = new THREE.PlaneGeometry(worldWidth, worldDepth, 58, 62);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = [];
  const color = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const height = TerrainHeight(x, z);
    position.setY(index, height);
    const variation = Math.sin(x * .45 + z * .18) * .025;
    color.setHSL(.19 + variation, .18, .29 + height * .008);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function CreateRoad(scene) {
  const material = CreateMaterial(0x625d4d, { roughness: 1 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(13, 205), material);
  road.rotation.x = -Math.PI / 2;
  road.rotation.z = -.065;
  road.position.set(28, TerrainHeight(28, 0) + .055, 0);
  road.receiveShadow = true;
  scene.add(road);

  for (let index = -9; index <= 9; index += 1) {
    const rut = new THREE.Mesh(new THREE.PlaneGeometry(.2, 7.5), CreateMaterial(0x423e34));
    rut.rotation.x = -Math.PI / 2;
    rut.position.set(25.5 + Math.sin(index * .4) * .5, TerrainHeight(27, index * 10) + .07, index * 10);
    scene.add(rut);
  }
}

function CreateCanal(scene) {
  const canalBed = new THREE.Mesh(new THREE.PlaneGeometry(9, 120), CreateMaterial(0x433e31));
  canalBed.rotation.x = -Math.PI / 2;
  canalBed.rotation.z = -Math.PI / 2 + .18;
  canalBed.position.set(-23, TerrainHeight(-23, 53) - .25, 52);
  scene.add(canalBed);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 116), CreateMaterial(0x596e68, {
    transparent: true,
    opacity: .72,
    roughness: .28,
  }));
  water.name = "CanalWater";
  water.rotation.x = -Math.PI / 2;
  water.rotation.z = -Math.PI / 2 + .18;
  water.position.set(-23, TerrainHeight(-23, 53) - .06, 52);
  scene.add(water);

  const bankMaterial = CreateMaterial(0x4c4a34);
  [-4.7, 4.7].forEach((offset) => {
    const bank = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 116), bankMaterial);
    bank.rotation.y = Math.PI / 2 - .18;
    bank.position.set(-23 + Math.cos(.18) * offset, TerrainHeight(-23, 53) + .15, 52 + Math.sin(.18) * offset);
    bank.receiveShadow = true;
    scene.add(bank);
  });
}

function CreateHouse(scene, x, z, rotation, scale = 1, id = "") {
  const group = new THREE.Group();
  group.name = id || "House";
  group.position.set(x, TerrainHeight(x, z), z);
  group.rotation.y = rotation;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10 * scale, 5.2 * scale, 7.8 * scale), CreateMaterial(0x8a795c));
  wall.position.y = 2.6 * scale;
  wall.castShadow = wall.receiveShadow = true;
  group.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.3 * scale, 3.4 * scale, 4), CreateMaterial(0x4b4132));
  roof.position.y = 6.5 * scale;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.7 * scale, 3.2 * scale, .18), CreateMaterial(0x342c22));
  door.position.set(0, 1.65 * scale, 4 * scale);
  group.add(door);
  const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(1.35 * scale, 1.15 * scale, .2), CreateMaterial(0x2f352f));
  windowMesh.position.set(-2.7 * scale, 2.8 * scale, 4.02 * scale);
  group.add(windowMesh);
  scene.add(group);
  return group;
}

function CreateMill(scene) {
  const group = CreateHouse(scene, -4, -9, .08, 1.25, "MillHouse");
  const stoneMaterial = CreateMaterial(0x6f695b);
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.5, .65, 24), stoneMaterial);
  lower.position.set(2.1, .45, 5.6);
  group.add(lower);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.3, .52, 24), CreateMaterial(0x777064));
  upper.position.set(2.1, .98, 5.6);
  upper.name = "MillStone";
  group.add(upper);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(6.6, .18, .18), CreateMaterial(0x3d3023));
  beam.position.set(4.8, 1.18, 5.6);
  beam.name = "MillBeam";
  group.add(beam);
  return group;
}

function CreateTree(scene, x, z, scale = 1) {
  const group = new THREE.Group();
  group.position.set(x, TerrainHeight(x, z), z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.2 * scale, .34 * scale, 3.2 * scale, 6), CreateMaterial(0x453628));
  trunk.position.y = 1.6 * scale;
  trunk.castShadow = true;
  group.add(trunk);
  const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8 * scale, 0), CreateMaterial(0x40523d));
  crown.position.y = 3.75 * scale;
  crown.castShadow = true;
  group.add(crown);
  scene.add(group);
  return group;
}

function CreateField(scene) {
  const strawMaterial = CreateMaterial(0x9b844e);
  const geometry = new THREE.BoxGeometry(.08, .95, .08);
  const count = 620;
  const stems = new THREE.InstancedMesh(geometry, strawMaterial, count);
  stems.castShadow = true;
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / 31);
    const column = index % 31;
    const x = -75 + column * 1.25 + Math.sin(index * 2.1) * .18;
    const z = -35 + row * 1.45 + Math.cos(index * 1.3) * .2;
    const scale = .75 + ((index * 13) % 11) / 20;
    matrix.makeScale(1, scale, 1);
    matrix.setPosition(x, TerrainHeight(x, z) + .47 * scale, z);
    stems.setMatrixAt(index, matrix);
  }
  scene.add(stems);
}

function CreateWalls(scene) {
  const material = CreateMaterial(0x75694f);
  const definitions = [
    [-34, 4, 28, .9, .05],
    [21, 12, 22, .9, -.08],
    [-2, 34, 32, .85, .02],
    [33, 38, 20, .8, .11],
    [-34, 52, 25, .8, .18],
  ];
  definitions.forEach(([x, z, length, height, rotation]) => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, height * 2.4, .9), material);
    wall.position.set(x, TerrainHeight(x, z) + height * 1.2, z);
    wall.rotation.y = rotation;
    wall.castShadow = wall.receiveShadow = true;
    scene.add(wall);
  });
}

function CreateGong(scene) {
  const group = new THREE.Group();
  group.position.set(4, TerrainHeight(4, 3), 3);
  const posts = CreateMaterial(0x443326);
  [-1.2, 1.2].forEach((x) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.2, 3.8, .2), posts);
    post.position.set(x, 1.9, 0);
    group.add(post);
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, .2, .2), posts);
  top.position.y = 3.7;
  group.add(top);
  const gong = new THREE.Mesh(new THREE.CylinderGeometry(.85, .85, .1, 24), CreateMaterial(0x89723e, { metalness: .35, roughness: .55 }));
  gong.rotation.x = Math.PI / 2;
  gong.position.y = 2.4;
  gong.name = "Gong";
  group.add(gong);
  scene.add(group);
}

function CreateHeroProps(scene) {
  const props = {};

  const table = new THREE.Group();
  table.position.set(4.5, TerrainHeight(4.5, -9), -9);
  const tabletop = new THREE.Mesh(new THREE.BoxGeometry(3.3, .18, 1.55), CreateMaterial(0x493626));
  tabletop.position.y = 1.12;
  table.add(tabletop);
  [[-1.25,-.52],[1.25,-.52],[-1.25,.52],[1.25,.52]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.15, 1.1, .15), CreateMaterial(0x3b2d22));
    leg.position.set(x, .55, z);
    table.add(leg);
  });
  props.bowls = [];
  [-.82, 0, .82].forEach((x, index) => {
    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(.34, .2, .18, 18, 1, true),
      CreateMaterial(index === 1 ? 0x9e8b68 : 0x786b54, { side: THREE.DoubleSide }),
    );
    bowl.position.set(x, 1.29, 0);
    bowl.userData.homePosition = bowl.position.clone();
    table.add(bowl);
    props.bowls.push(bowl);
  });
  scene.add(table);
  props.table = table;

  const shoeGroup = new THREE.Group();
  shoeGroup.position.set(8, TerrainHeight(8, -3) + .2, -3);
  const sole = new THREE.Mesh(new THREE.BoxGeometry(.52, .16, 1.12), CreateMaterial(0x44382d));
  sole.position.y = .12;
  shoeGroup.add(sole);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(.5, .38, .62), CreateMaterial(0x66523e));
  upper.position.set(0, .33, -.18);
  shoeGroup.add(upper);
  const patch = new THREE.Mesh(new THREE.BoxGeometry(.53, .08, .3), CreateMaterial(0x927252));
  patch.position.set(0, .55, -.18);
  shoeGroup.add(patch);
  shoeGroup.rotation.y = -.35;
  scene.add(shoeGroup);
  props.shoe = shoeGroup;

  const keyGroup = new THREE.Group();
  keyGroup.name = "DoorKey";
  keyGroup.position.set(-3.6, TerrainHeight(-3.6, -3.88) + 1.8, -3.88);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.2, .035, 7, 18), CreateMaterial(0xa88e51, { metalness: .55, roughness: .4 }));
  ring.rotation.x = 0;
  keyGroup.add(ring);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(.07, .66, .07), CreateMaterial(0xa88e51, { metalness: .55, roughness: .4 }));
  shaft.position.y = -.39;
  keyGroup.add(shaft);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(.26, .07, .07), CreateMaterial(0xa88e51, { metalness: .55, roughness: .4 }));
  tooth.position.set(.09, -.72, 0);
  keyGroup.add(tooth);
  scene.add(keyGroup);
  props.key = keyGroup;

  const medicine = new THREE.Group();
  medicine.position.set(-2.4, TerrainHeight(-2.4, -5.8) + .42, -5.8);
  const medicineBox = new THREE.Mesh(new THREE.BoxGeometry(1.2, .75, .8), CreateMaterial(0x5e5c4d));
  medicine.add(medicineBox);
  const medicineMarkA = new THREE.Mesh(new THREE.BoxGeometry(.08, .5, .04), CreateMaterial(0xa7a08a));
  medicineMarkA.position.set(0, .02, .42);
  medicine.add(medicineMarkA);
  const medicineMarkB = new THREE.Mesh(new THREE.BoxGeometry(.4, .08, .04), CreateMaterial(0xa7a08a));
  medicineMarkB.position.set(0, .02, .42);
  medicine.add(medicineMarkB);
  scene.add(medicine);

  const seedBag = new THREE.Mesh(new THREE.SphereGeometry(.52, 12, 8), CreateMaterial(0x8c744c));
  seedBag.scale.set(1, 1.25, .72);
  seedBag.position.set(-.7, TerrainHeight(-.7, -5.5) + .62, -5.5);
  scene.add(seedBag);

  const register = new THREE.Group();
  register.position.set(.7, TerrainHeight(.7, -5.6) + .5, -5.6);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(.76, .12, 1.02), CreateMaterial(0xc1ae82));
  register.add(pages);
  const binding = new THREE.Mesh(new THREE.BoxGeometry(.1, .15, 1.08), CreateMaterial(0x6d4135));
  binding.position.x = -.4;
  register.add(binding);
  register.rotation.y = .18;
  scene.add(register);
  props.choiceItems = [medicine, seedBag, register];
  return props;
}

function CreatePerson(side, name, color, scale = 1) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.side = side;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.38 * scale, 1.05 * scale, 3, 8), CreateMaterial(color));
  body.position.y = 1.15 * scale;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.33 * scale, 10, 7), CreateMaterial(0x9b795c));
  head.position.y = 2.15 * scale;
  head.castShadow = true;
  group.add(head);
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(.2 * scale, .75 * scale, .22 * scale), CreateMaterial(0x38352d));
  leftLeg.name = "LeftLeg";
  leftLeg.position.set(-.18 * scale, .28 * scale, 0);
  group.add(leftLeg);
  const rightLeg = leftLeg.clone();
  rightLeg.name = "RightLeg";
  rightLeg.position.x = .18 * scale;
  group.add(rightLeg);
  if (side === "ally") {
    const band = new THREE.Mesh(new THREE.BoxGeometry(.48 * scale, .13 * scale, .5 * scale), CreateMaterial(0x8a3a31));
    band.position.set(.35 * scale, 1.55 * scale, 0);
    group.add(band);
  }
  if (side === "enemy") {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(.39 * scale, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), CreateMaterial(0x787457));
    helmet.position.y = 2.3 * scale;
    group.add(helmet);
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(.1 * scale, .1 * scale, 1.55 * scale), CreateMaterial(0x302a21));
    rifle.name = "Rifle";
    rifle.position.set(.38 * scale, 1.25 * scale, .3 * scale);
    rifle.rotation.x = -.3;
    group.add(rifle);
  }
  return group;
}

function CreateVillagers(scene) {
  const people = {};
  const definitions = [
    ["Mother", 10, -2, 0x615b50, 1],
    ["Brother", 11.2, -1.3, 0x745c43, .72],
    ["AuntSun", -20, 13, 0x69554a, .95],
    ["ChildSun", -19.2, 13.8, 0x755f4a, .65],
    ["Zhou", 5, 24, 0x596766, .98],
  ];
  definitions.forEach(([name, x, z, color, scale]) => {
    const person = CreatePerson(name === "Zhou" ? "ally" : "civilian", name, color, scale);
    person.position.set(x, TerrainHeight(x, z), z);
    people[name] = person;
    scene.add(person);
  });
  return people;
}

function CreateCart(scene) {
  const group = new THREE.Group();
  group.name = "WoundedCart";
  group.position.set(13, TerrainHeight(13, 45), 45);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(3.8, .35, 1.8), CreateMaterial(0x4b3827));
  bed.position.y = 1;
  group.add(bed);
  [-1.3, 1.3].forEach((x) => {
    [-.95, .95].forEach((z) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .13, 12), CreateMaterial(0x29251e));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, .62, z);
      group.add(wheel);
    });
  });
  const wounded = CreatePerson("ally", "WoundedScout", 0x5e6966, .9);
  wounded.rotation.z = Math.PI / 2;
  wounded.position.set(0, 1.2, 0);
  group.add(wounded);
  scene.add(group);
  return group;
}

function CreateGate(scene) {
  const group = new THREE.Group();
  group.name = "CanalGate";
  group.position.set(-12, TerrainHeight(-12, 65), 65);
  const supportMaterial = CreateMaterial(0x3d3327);
  [-1.6, 1.6].forEach((x) => {
    const support = new THREE.Mesh(new THREE.BoxGeometry(.25, 3.6, .25), supportMaterial);
    support.position.set(x, 1.8, 0);
    group.add(support);
  });
  const gate = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.2, .24), CreateMaterial(0x51402e));
  gate.position.y = 1.2;
  gate.name = "GateBoard";
  group.add(gate);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(.65, .09, 8, 18), CreateMaterial(0x4a4740, { metalness: .35 }));
  wheel.position.set(0, 2.8, .3);
  wheel.name = "GateWheel";
  group.add(wheel);
  scene.add(group);
  return group;
}

function CreateFerry(scene) {
  const group = new THREE.Group();
  group.name = "Ferry";
  group.position.set(-47, TerrainHeight(-47, 83), 83);
  const boat = new THREE.Mesh(new THREE.BoxGeometry(7, .75, 2.6), CreateMaterial(0x403226));
  boat.position.set(-2, .2, 0);
  group.add(boat);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 22, 5), CreateMaterial(0x6c5b3b));
  rope.rotation.z = Math.PI / 2;
  rope.position.set(1, 1.05, 0);
  rope.name = "FerryRope";
  group.add(rope);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.2, .28, 2.5, 8), CreateMaterial(0x3c3023));
  post.position.set(10, 1.1, 0);
  group.add(post);
  scene.add(group);
  return group;
}

function CreateTruck(scene) {
  const group = new THREE.Group();
  group.name = "EnemyTruck";
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.65, 6.5), CreateMaterial(0x5e6044));
  body.position.y = 1.55;
  body.castShadow = true;
  group.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.7, 2.1), CreateMaterial(0x67684a));
  cab.position.set(0, 2.25, 2);
  group.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.5, .75, .08), CreateMaterial(0x303a35, { roughness: .3 }));
  glass.position.set(0, 2.45, 3.08);
  group.add(glass);
  [-1.7, 1.7].forEach((z) => {
    [-1.5, 1.5].forEach((x) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.66, .66, .4, 12), CreateMaterial(0x1c1d19));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, .75, z);
      group.add(wheel);
    });
  });
  group.position.set(28, TerrainHeight(28, -92), -92);
  group.visible = false;
  scene.add(group);
  return group;
}

function CreateSmoke(scene, x, z, color = 0x3f403b) {
  const group = new THREE.Group();
  group.position.set(x, TerrainHeight(x, z), z);
  for (let index = 0; index < 10; index += 1) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 + (index % 4) * .35, 1), CreateMaterial(color, {
      transparent: true,
      opacity: .18 + index * .018,
      depthWrite: false,
    }));
    puff.position.set(Math.sin(index * 2.7) * 1.3, 2 + index * 1.22, Math.cos(index * 1.9) * 1.1);
    puff.userData.seed = index * 1.73;
    group.add(puff);
  }
  group.visible = false;
  scene.add(group);
  return group;
}

function CreateFire(scene, x, z) {
  const group = new THREE.Group();
  group.position.set(x, TerrainHeight(x, z), z);
  for (let index = 0; index < 9; index += 1) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.35 + (index % 3) * .13, 1.1 + (index % 4) * .24, 5), CreateMaterial(0xa3462c, {
      emissive: 0x8d2b17,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: .85,
    }));
    flame.position.set((index % 3 - 1) * .8, .7, (Math.floor(index / 3) - 1) * .65);
    flame.userData.seed = index;
    group.add(flame);
  }
  group.visible = false;
  scene.add(group);
  return group;
}

function CreateTracer(scene, origin, target, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([origin, target]);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: .82 });
  const line = new THREE.Line(geometry, material);
  line.userData.life = .085;
  scene.add(line);
  return line;
}

function CreateBattlefield(scene) {
  const battlefield = {
    active: false,
    allies: [],
    enemies: [],
    tracers: [],
    lastShotAt: 0,
    nextShotAt: .8,
    burstRemaining: 0,
    time: 0,
  };
  const allyPositions = [[38, 51], [32, 57], [28, 49], [42, 60], [20, 56]];
  const enemyPositions = [[28, 17], [34, 9], [22, 5], [41, 22], [17, 27], [46, 13], [31, -2]];
  allyPositions.forEach(([x, z], index) => {
    const actor = CreatePerson("ally", `Militia_${index + 1}`, 0x596766, .98);
    actor.position.set(x, TerrainHeight(x, z), z);
    actor.visible = false;
    actor.userData.baseX = x;
    actor.userData.baseZ = z;
    actor.userData.phase = index * 1.21;
    scene.add(actor);
    battlefield.allies.push(actor);
  });
  enemyPositions.forEach(([x, z], index) => {
    const actor = CreatePerson("enemy", `OccupationSoldier_${index + 1}`, 0x727052, 1);
    actor.position.set(x, TerrainHeight(x, z), z);
    actor.visible = false;
    actor.userData.baseX = x;
    actor.userData.baseZ = z;
    actor.userData.phase = index * .86;
    scene.add(actor);
    battlefield.enemies.push(actor);
  });
  return battlefield;
}

export function CreateVillageWorld(options) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(phaseLighting.Breakfast.sky);
  scene.fog = new THREE.FogExp2(phaseLighting.Breakfast.fog, .012);

  const renderer = new THREE.WebGLRenderer({
    canvas: options.canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(67, 1, .08, 320);
  camera.rotation.order = "YXZ";
  scene.add(camera);

  const hemisphere = new THREE.HemisphereLight(0xd7d8ca, 0x32372d, phaseLighting.Breakfast.ambient);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffe4bd, phaseLighting.Breakfast.sun);
  sun.position.set(-55, 90, -35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 105;
  sun.shadow.camera.bottom = -105;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 240;
  scene.add(sun);

  CreateTerrain(scene);
  CreateRoad(scene);
  CreateCanal(scene);
  const mill = CreateMill(scene);
  const houses = [
    mill,
    CreateHouse(scene, 14, 1, -.05, .92, "LiangHouse"),
    CreateHouse(scene, -19, 13, .09, .96, "SunHouse"),
    CreateHouse(scene, 5, 24, -.1, 1.05, "School"),
    CreateHouse(scene, 23, 27, .15, .9, "Clinic"),
    CreateHouse(scene, -24, -13, -.14, .87, "ChenHouse"),
  ];
  CreateWalls(scene);
  CreateGong(scene);
  const heroProps = CreateHeroProps(scene);
  CreateField(scene);
  const treeCoordinates = [
    [-47,-27,1.4],[-38,-4,1.1],[-54,22,1.25],[-68,45,1.5],[-62,68,1.2],[-38,77,1.3],
    [56,-36,1.4],[64,-9,1.2],[61,23,1.45],[69,52,1.2],[50,78,1.5],[15,84,1.2],
    [-12,-42,1.1],[22,-53,1.25],[42,-62,1.5],[-64,-58,1.45],[-76,1,1.3],
  ];
  treeCoordinates.forEach(([x, z, scale]) => CreateTree(scene, x, z, scale));
  const people = CreateVillagers(scene);
  const cart = CreateCart(scene);
  const gate = CreateGate(scene);
  const ferry = CreateFerry(scene);
  const truck = CreateTruck(scene);
  const smokeGroups = [
    CreateSmoke(scene, -4, -9),
    CreateSmoke(scene, -19, 13),
    CreateSmoke(scene, -24, -13),
  ];
  const fireGroups = [
    CreateFire(scene, -1, -5),
    CreateFire(scene, -18, 16),
    CreateFire(scene, -24, -10),
  ];
  const battlefield = CreateBattlefield(scene);

  let currentPhase = "Breakfast";
  let elapsed = 0;
  let cameraShake = 0;
  let lastSuppressionAt = -99;

  function Resize() {
    const width = Math.max(1, options.canvas.clientWidth);
    const height = Math.max(1, options.canvas.clientHeight);
    const dprLimit = width < 760 || height < 500 ? 1.35 : 1.8;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprLimit));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function SetPhase(phase) {
    const previousPhase = currentPhase;
    currentPhase = phase;
    const lighting = phaseLighting[phase] || phaseLighting.Breakfast;
    scene.background.setHex(lighting.sky);
    scene.fog.color.setHex(lighting.fog);
    hemisphere.intensity = lighting.ambient;
    sun.intensity = lighting.sun;
    const aftermath = ["Rescue", "Battle", "Reeds", "Epilogue"].includes(phase);
    smokeGroups.forEach((group, index) => { group.visible = aftermath && (phase !== "Epilogue" || index < 2); });
    fireGroups.forEach((group) => { group.visible = ["Rescue", "Battle", "Reeds"].includes(phase); });
    truck.visible = ["Choice", "Rescue", "Battle"].includes(phase);
    if (phase === "Breakfast") truck.position.set(28, TerrainHeight(28, -92), -92);
    battlefield.active = ["Battle", "Reeds"].includes(phase);
    if (phase === "Battle" && previousPhase !== "Battle") {
      battlefield.time = 0;
      battlefield.lastShotAt = 0;
      battlefield.nextShotAt = .8;
      battlefield.burstRemaining = 0;
    }
    [...battlefield.allies, ...battlefield.enemies].forEach((actor) => { actor.visible = battlefield.active; });
    const showEvacuees = ["Rescue", "Battle", "Reeds"].includes(phase);
    people.Mother.visible = phase === "Breakfast" || showEvacuees;
    people.Brother.visible = phase === "Breakfast" || showEvacuees;
    people.AuntSun.visible = showEvacuees;
    people.ChildSun.visible = showEvacuees;
    people.Zhou.visible = showEvacuees;
    cart.visible = phase === "Battle";
    gate.visible = phase === "Battle" || phase === "Reeds";
    ferry.visible = phase === "Reeds" || phase === "Epilogue";
    if (aftermath) {
      houses[0].children.forEach((child) => {
        if (child.material?.color && child.name !== "MillStone" && child.name !== "MillBeam") {
          if (child.userData.originalColor === undefined) child.userData.originalColor = child.material.color.getHex();
          child.material.color.setHex(child.userData.originalColor);
          child.material.color.multiplyScalar(.62);
        }
      });
    } else {
      houses[0].children.forEach((child) => {
        if (child.material?.color && child.userData.originalColor !== undefined) {
          child.material.color.setHex(child.userData.originalColor);
        }
      });
    }
    heroProps.key.rotation.z = aftermath ? .18 : 0;
    heroProps.key.position.y = TerrainHeight(-3.6, -3.88) + (aftermath ? 1.46 : 1.8);
    heroProps.key.children.forEach((child) => {
      if (child.material?.color) child.material.color.setHex(aftermath ? 0x504a3c : 0x7e704e);
    });
    heroProps.bowls.forEach((bowl, index) => {
      bowl.position.copy(bowl.userData.homePosition);
      bowl.rotation.set(0, 0, 0);
      if (aftermath) {
        bowl.position.x += index === 1 ? .22 : (index - 1) * .1;
        bowl.position.y -= index === 2 ? .08 : 0;
        bowl.rotation.z = index === 1 ? 1.1 : index === 2 ? -.28 : .18;
        bowl.material.color.setHex(index === 1 ? 0x51493d : 0x5b5242);
      } else {
        bowl.material.color.setHex(index === 1 ? 0x9e8b68 : 0x786b54);
      }
    });
    heroProps.shoe.visible = !aftermath;
    heroProps.choiceItems.forEach((item) => { item.visible = ["Breakfast", "Choice"].includes(phase); });
  }

  function SetCamera(position, yaw, pitch, crouching, motionScale = 1) {
    const baseHeight = crouching ? crouchHeight : eyeHeight;
    const stepBob = motionScale * Math.sin(elapsed * 8.5) * .018;
    camera.position.set(position.x, TerrainHeight(position.x, position.z) + baseHeight + stepBob, position.z);
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    if (cameraShake > .001 && motionScale > 0) {
      camera.rotation.x += (Math.sin(elapsed * 49) * cameraShake * .006);
      camera.rotation.z = Math.cos(elapsed * 55) * cameraShake * .005;
      cameraShake *= .86;
    } else {
      camera.rotation.z = 0;
      cameraShake = 0;
    }
  }

  function ResolveMovement(from, to) {
    const bounded = {
      x: Clamp(to.x, -88, 88),
      z: Clamp(to.z, -96, 98),
    };
    for (const obstacle of obstacleDefinitions) {
      const dx = bounded.x - obstacle.x;
      const dz = bounded.z - obstacle.z;
      const distance = Math.hypot(dx, dz);
      const radius = obstacle.radius + .45;
      if (distance < radius) {
        const inverse = distance > .01 ? 1 / distance : 1;
        bounded.x = obstacle.x + dx * inverse * radius;
        bounded.z = obstacle.z + dz * inverse * radius;
      }
    }
    return bounded;
  }

  function AnimatePeople(delta) {
    Object.values(people).forEach((person, index) => {
      if (!person.visible) return;
      const sway = Math.sin(elapsed * 2.1 + index * .8) * .018;
      person.rotation.z = sway;
    });
  }

  function AnimateFollowers(delta, playerPosition, missionState) {
    if (!missionState || !["Rescue", "Battle", "Reeds"].includes(currentPhase)) return;
    const groups = {
      Family: [people.Mother, people.Brother],
      AuntSun: [people.AuntSun, people.ChildSun],
      Zhou: [people.Zhou],
    };
    const deliveredOffsets = {
      Family: [[-1.5, 1.2], [-.4, 1.7]],
      AuntSun: [[1.1, .8], [2, 1.3]],
      Zhou: [[.4, -1.1]],
    };
    Object.entries(groups).forEach(([groupId, members], groupIndex) => {
      const active = missionState.activeRescueGroup === groupId;
      const delivered = missionState.rescuedGroups?.includes(groupId) || currentPhase !== "Rescue";
      members.forEach((person, memberIndex) => {
        let targetX;
        let targetZ;
        if (active) {
          const followDistance = 2.2 + memberIndex * 1.1;
          targetX = playerPosition.x + Math.sin(elapsed * .34 + groupIndex) * .45 - .5;
          targetZ = playerPosition.z + followDistance;
        } else if (delivered) {
          const offset = deliveredOffsets[groupId][memberIndex];
          targetX = -34 + offset[0];
          targetZ = 47 + offset[1];
        } else {
          return;
        }
        const amount = Math.min(1, delta * (active ? 2.1 : 1.2));
        person.position.x += (targetX - person.position.x) * amount;
        person.position.z += (targetZ - person.position.z) * amount;
        person.position.y = TerrainHeight(person.position.x, person.position.z);
        if (active) person.lookAt(playerPosition.x, person.position.y + 1, playerPosition.z);
      });
    });
  }

  function AnimateAftermath(delta) {
    smokeGroups.forEach((group, groupIndex) => {
      if (!group.visible) return;
      group.children.forEach((puff) => {
        puff.position.x += Math.sin(elapsed * .35 + puff.userData.seed) * delta * .16;
        puff.position.y += delta * (.14 + groupIndex * .025);
        if (puff.position.y > 17) puff.position.y = 2.2;
        puff.rotation.y += delta * .07;
      });
    });
    fireGroups.forEach((group) => {
      if (!group.visible) return;
      group.children.forEach((flame) => {
        flame.scale.y = .72 + Math.sin(elapsed * 9 + flame.userData.seed) * .25;
        flame.material.opacity = .68 + Math.sin(elapsed * 7.7 + flame.userData.seed) * .15;
      });
    });
    const water = scene.getObjectByName("CanalWater");
    if (water) {
      water.material.opacity = currentPhase === "Battle" || currentPhase === "Reeds" ? .85 : .55;
      water.position.y = TerrainHeight(-23, 53) - .06 + (currentPhase === "Battle" || currentPhase === "Reeds" ? .12 : 0);
    }
  }

  function AnimateTruck(delta) {
    if (!truck.visible) return;
    if (currentPhase === "Choice") {
      truck.position.z = Math.min(-54, truck.position.z + delta * 5.2);
    } else if (currentPhase === "Rescue") {
      truck.position.z = Math.min(3, truck.position.z + delta * 3.1);
    } else if (currentPhase === "Battle") {
      truck.position.z = Math.min(24, truck.position.z + delta * 1.1);
    }
    truck.position.y = TerrainHeight(truck.position.x, truck.position.z);
    truck.rotation.y = -.065;
    truck.children.forEach((child) => {
      if (child.geometry?.type === "CylinderGeometry") child.rotation.x += delta * 2.4;
    });
  }

  function AnimateBattle(delta, playerPosition, missionState, distressScale) {
    if (!battlefield.active) return;
    battlefield.time += delta;
    [...battlefield.allies, ...battlefield.enemies].forEach((actor, index) => {
      const advance = actor.userData.side === "enemy" ? Math.min(15, battlefield.time * .22) : 0;
      actor.position.x = actor.userData.baseX + Math.sin(battlefield.time * .45 + actor.userData.phase) * 1.2;
      actor.position.z = actor.userData.baseZ + (actor.userData.side === "enemy" ? advance : Math.sin(battlefield.time * .28 + index) * .45);
      actor.position.y = TerrainHeight(actor.position.x, actor.position.z);
      const opponents = actor.userData.side === "enemy" ? battlefield.allies : battlefield.enemies;
      const target = opponents[(index + Math.floor(battlefield.time / 5)) % opponents.length];
      actor.lookAt(target.position.x, target.position.y + 1.2, target.position.z);
      const leftLeg = actor.getObjectByName("LeftLeg");
      const rightLeg = actor.getObjectByName("RightLeg");
      if (leftLeg && rightLeg) {
        leftLeg.rotation.x = Math.sin(battlefield.time * 5 + index) * .4;
        rightLeg.rotation.x = -leftLeg.rotation.x;
      }
    });

    if (battlefield.time >= battlefield.nextShotAt) {
      battlefield.lastShotAt = battlefield.time;
      if (battlefield.burstRemaining <= 0) {
        battlefield.burstRemaining = 2 + (Math.floor(battlefield.time * 1.7) % 3);
      }
      const shotIndex = Math.floor(battlefield.time * 4.7) % (battlefield.allies.length + battlefield.enemies.length);
      const shooters = shotIndex < battlefield.allies.length ? battlefield.allies : battlefield.enemies;
      const targets = shooters === battlefield.allies ? battlefield.enemies : battlefield.allies;
      const shooter = shooters[shotIndex % shooters.length];
      const target = targets[(shotIndex * 3 + 1) % targets.length];
      const origin = shooter.position.clone().add(new THREE.Vector3(0, 1.35, 0));
      const end = target.position.clone().add(new THREE.Vector3(
        Math.sin(battlefield.time * 2.3) * 1.8,
        .9 + Math.cos(battlefield.time) * .6,
        Math.cos(battlefield.time * 1.9) * 1.8,
      ));
      const tracer = CreateTracer(scene, origin, end, shooters === battlefield.enemies ? 0xffc372 : 0xffe0a0);
      battlefield.tracers.push(tracer);
      battlefield.burstRemaining -= 1;
      const retreatQuiet = Math.max(0, missionState?.ferryCrossings || 0) * 1.35;
      battlefield.nextShotAt = battlefield.time + (battlefield.burstRemaining > 0
        ? .13 + (shotIndex % 3) * .045
        : 2.8 + ((shotIndex * 17) % 43) / 10 + retreatQuiet);

      const distanceToPlayer = DistancePointToSegment(playerPosition, origin, end);
      if (distanceToPlayer < 4.5 && battlefield.time - lastSuppressionAt > 1.1) {
        lastSuppressionAt = battlefield.time;
        cameraShake = .9 * distressScale;
        options.onSuppression?.({
          direction: DirectionLabel(origin.x - playerPosition.x, origin.z - playerPosition.z),
          distance: distanceToPlayer,
        });
      }
    }

    battlefield.tracers.forEach((tracer) => {
      tracer.userData.life -= delta;
      tracer.material.opacity = Math.max(0, tracer.userData.life * 10);
    });
    const expired = battlefield.tracers.filter((tracer) => tracer.userData.life <= 0);
    expired.forEach((tracer) => {
      scene.remove(tracer);
      tracer.geometry.dispose();
      tracer.material.dispose();
    });
    battlefield.tracers = battlefield.tracers.filter((tracer) => tracer.userData.life > 0);

    if (Math.floor(battlefield.time) % 11 === 4 && battlefield.time % 1 < delta) {
      cameraShake = .75 * distressScale;
      options.onDistantBlast?.({
        direction: battlefield.time % 22 < 11 ? "东南方向" : "南面土路",
      });
    }
  }

  function Update(delta, playerPosition, missionState = null, preferences = {}) {
    elapsed += delta;
    const distressScale = preferences.lowerDistress ? .28 : 1;
    AnimatePeople(delta);
    AnimateFollowers(delta, playerPosition, missionState);
    AnimateAftermath(delta);
    AnimateTruck(delta);
    AnimateBattle(delta, playerPosition, missionState, distressScale);
    const millStone = scene.getObjectByName("MillStone");
    if (millStone && currentPhase === "Breakfast") millStone.rotation.y += delta * .14;
  }

  function Render() {
    renderer.render(scene, camera);
  }

  function ProjectWorldPosition(position) {
    const vector = new THREE.Vector3(position.x, TerrainHeight(position.x, position.z) + 2.4, position.z);
    vector.project(camera);
    const behind = vector.z > 1;
    return {
      x: (vector.x * .5 + .5) * options.canvas.clientWidth,
      y: (-vector.y * .5 + .5) * options.canvas.clientHeight,
      visible: !behind && vector.x > -1.2 && vector.x < 1.2 && vector.y > -1.2 && vector.y < 1.2,
    };
  }

  function GetTargetPosition(targetId) {
    const value = targetPositions[targetId];
    return value ? { x: value.x, z: value.z } : null;
  }

  function GetSpawnForPhase(phase) {
    const positions = {
      Breakfast: { x: 0, z: -19, yaw: Math.PI },
      Choice: { x: -1, z: -7, yaw: Math.PI },
      Cellar: { x: -1, z: -10, yaw: 0 },
      Rescue: { x: -2, z: -14, yaw: 0 },
      Battle: { x: -31, z: 47, yaw: Math.PI / 2 },
      Reeds: { x: -20, z: 68, yaw: -Math.PI / 2 },
      Epilogue: { x: -47, z: 78, yaw: Math.PI },
    };
    return { ...(positions[phase] || positions.Breakfast) };
  }

  function Dispose() {
    scene.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
      else object.material?.dispose?.();
    });
    renderer.dispose();
  }

  Resize();
  SetPhase("Breakfast");

  return {
    camera,
    scene,
    renderer,
    Resize,
    SetPhase,
    SetCamera,
    ResolveMovement,
    Update,
    Render,
    ProjectWorldPosition,
    GetTargetPosition,
    GetSpawnForPhase,
    TerrainHeight,
    Dispose,
  };
}

function DistancePointToSegment(point, start, end) {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared <= .0001) return Math.hypot(point.x - start.x, point.z - start.z);
  const t = Clamp(((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / lengthSquared, 0, 1);
  const closestX = start.x + segmentX * t;
  const closestZ = start.z + segmentZ * t;
  return Math.hypot(point.x - closestX, point.z - closestZ);
}

function DirectionLabel(dx, dz) {
  const angle = Math.atan2(dx, -dz);
  const index = Math.round((angle / (Math.PI * 2)) * 8 + 8) % 8;
  return ["北面", "东北方向", "东面", "东南方向", "南面", "西南方向", "西面", "西北方向"][index];
}
