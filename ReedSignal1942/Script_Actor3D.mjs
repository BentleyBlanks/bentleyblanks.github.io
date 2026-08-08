import * as THREE from "../TunnelBell1942/vendor/three/build/three.module.mjs";

const ActorGeometries = Object.freeze({
  head: new THREE.SphereGeometry(0.142, 18, 12),
  hair: new THREE.SphereGeometry(0.151, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
  hairBun: new THREE.SphereGeometry(0.105, 14, 9),
  shawl: new THREE.ConeGeometry(0.335, 0.42, 14, 1, true),
  headClothTail: new THREE.BoxGeometry(0.12, 0.34, 0.035),
  neck: new THREE.CylinderGeometry(0.062, 0.074, 0.115, 10),
  shoulders: new THREE.SphereGeometry(0.245, 12, 8),
  torso: new THREE.CylinderGeometry(0.185, 0.235, 0.62, 12),
  coatSkirt: new THREE.CylinderGeometry(0.23, 0.292, 0.39, 12),
  upperArm: new THREE.CylinderGeometry(0.052, 0.062, 0.32, 10),
  lowerArm: new THREE.CylinderGeometry(0.044, 0.052, 0.3, 10),
  upperLeg: new THREE.CylinderGeometry(0.071, 0.082, 0.405, 10),
  lowerLeg: new THREE.CylinderGeometry(0.062, 0.071, 0.38, 10),
  joint: new THREE.SphereGeometry(0.061, 10, 7),
  hand: new THREE.SphereGeometry(0.057, 10, 7),
  boot: new THREE.BoxGeometry(0.14, 0.115, 0.285),
  scarf: new THREE.BoxGeometry(0.37, 0.075, 0.22),
  scarfTail: new THREE.BoxGeometry(0.11, 0.42, 0.045),
  coatBack: new THREE.BoxGeometry(0.34, 0.58, 0.045),
  belt: new THREE.BoxGeometry(0.48, 0.055, 0.28),
  satchel: new THREE.BoxGeometry(0.27, 0.32, 0.12),
  registerCover: new THREE.BoxGeometry(0.245, 0.31, 0.035),
  registerPages: new THREE.BoxGeometry(0.218, 0.282, 0.026),
  registerBinding: new THREE.BoxGeometry(0.032, 0.315, 0.048),
  registerLine: new THREE.BoxGeometry(0.12, 0.009, 0.006),
  bundle: new THREE.SphereGeometry(0.17, 8, 6),
  contactShadow: new THREE.PlaneGeometry(0.92, 0.52),
});

const RolePalettes = Object.freeze({
  player: Object.freeze({ cloth: 0x2b3230, clothDark: 0x181f1d, skin: 0xa98f6d, hair: 0x11120f, scarf: 0x5d5140, satchel: 0x3e2f22 }),
  child: Object.freeze({ cloth: 0x4c4b3e, clothDark: 0x292e28, skin: 0xaa906d, hair: 0x12120f, scarf: 0x665a43, satchel: 0x3d3024 }),
  mother: Object.freeze({ cloth: 0x363d39, clothDark: 0x1d2420, skin: 0xa28868, hair: 0x11110f, scarf: 0x5d4e39, satchel: 0x392d21 }),
});

const ChildClothColors = Object.freeze([0x4c4b3e, 0x424b42, 0x51473d, 0x3e4745, 0x554d41, 0x44473b]);

function CreateMaterial(color, roughness = 0.9) {
  const base = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: base,
    roughness,
    metalness: 0,
    flatShading: false,
    emissive: base.clone().multiplyScalar(0.055),
    emissiveIntensity: 0.72,
  });
}

function CreateContactShadowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0.28 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * vec2(1.0, 1.65);
        float falloff = smoothstep(0.5, 0.05, length(p));
        gl_FragColor = vec4(vec3(0.015, 0.022, 0.019), falloff * uOpacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
}

function PrepareMesh(mesh, castShadow = true) {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.userData.actorMesh = true;
  return mesh;
}

function CreateLimb(upperMaterial, lowerMaterial, endpointMaterial, isArm = false) {
  const upperLength = isArm ? 0.32 : 0.405;
  const lowerLength = isArm ? 0.3 : 0.38;
  const upperPivot = new THREE.Group();
  const upper = PrepareMesh(new THREE.Mesh(isArm ? ActorGeometries.upperArm : ActorGeometries.upperLeg, upperMaterial));
  upper.position.y = -upperLength * 0.5;
  upperPivot.add(upper);
  const lowerPivot = new THREE.Group();
  lowerPivot.position.y = -upperLength;
  const joint = isArm ? PrepareMesh(new THREE.Mesh(ActorGeometries.joint, lowerMaterial)) : null;
  if (joint) joint.scale.setScalar(0.78);
  const lower = PrepareMesh(new THREE.Mesh(isArm ? ActorGeometries.lowerArm : ActorGeometries.lowerLeg, lowerMaterial));
  lower.position.y = -lowerLength * 0.5;
  if (joint) lowerPivot.add(joint);
  lowerPivot.add(lower);
  let endpoint;
  if (isArm) {
    const hand = PrepareMesh(new THREE.Mesh(ActorGeometries.hand, endpointMaterial));
    hand.position.y = -lowerLength - 0.012;
    hand.scale.set(0.86, 1.05, 0.78);
    lowerPivot.add(hand);
    endpoint = hand;
  } else {
    const boot = PrepareMesh(new THREE.Mesh(ActorGeometries.boot, endpointMaterial));
    boot.position.set(0, -lowerLength - 0.035, 0.068);
    lowerPivot.add(boot);
    endpoint = boot;
  }
  upperPivot.add(lowerPivot);
  return { root: upperPivot, lower: lowerPivot, joint, endpoint };
}

export function CreateActor3D(role = "player", childIndex = 0) {
  const palette = RolePalettes[role] || RolePalettes.player;
  const root = new THREE.Group();
  root.name = `Actor_${role}_${childIndex}`;
  const contactShadow = PrepareMesh(new THREE.Mesh(ActorGeometries.contactShadow, CreateContactShadowMaterial()), false);
  contactShadow.rotation.x = -Math.PI * 0.5;
  contactShadow.position.set(0, 0.012, 0.015);
  contactShadow.receiveShadow = false;
  contactShadow.renderOrder = 1;
  root.add(contactShadow);
  const rig = new THREE.Group();
  root.add(rig);

  const clothColor = role === "child" ? ChildClothColors[childIndex % ChildClothColors.length] : palette.cloth;
  const cloth = CreateMaterial(clothColor);
  const clothDark = CreateMaterial(role === "child" ? new THREE.Color(clothColor).multiplyScalar(0.54) : palette.clothDark);
  const skin = CreateMaterial(palette.skin, 0.96);
  const hair = CreateMaterial(palette.hair, 0.98);
  const scarfMaterial = CreateMaterial(palette.scarf, 0.94);
  const satchelMaterial = CreateMaterial(palette.satchel, 1);
  const paperMaterial = CreateMaterial(0xb9aa86, 1);

  const pelvis = new THREE.Group();
  pelvis.position.y = 0.86;
  rig.add(pelvis);
  const torso = PrepareMesh(new THREE.Mesh(ActorGeometries.torso, cloth));
  torso.position.y = 0.29;
  pelvis.add(torso);
  const shoulders = PrepareMesh(new THREE.Mesh(ActorGeometries.shoulders, cloth));
  shoulders.position.y = 0.48;
  shoulders.scale.set(1.2, 0.46, 0.72);
  pelvis.add(shoulders);
  const skirt = PrepareMesh(new THREE.Mesh(ActorGeometries.coatSkirt, cloth));
  skirt.position.y = -0.02;
  pelvis.add(skirt);
  const coatBack = PrepareMesh(new THREE.Mesh(ActorGeometries.coatBack, clothDark));
  coatBack.position.set(0, 0.06, -0.235);
  coatBack.rotation.x = -0.04;
  pelvis.add(coatBack);
  const belt = PrepareMesh(new THREE.Mesh(ActorGeometries.belt, clothDark));
  belt.position.set(0, 0.12, 0);
  pelvis.add(belt);
  const scarf = PrepareMesh(new THREE.Mesh(ActorGeometries.scarf, scarfMaterial));
  scarf.position.set(0, 0.58, 0.01);
  scarf.rotation.z = 0.05;
  pelvis.add(scarf);
  const scarfTail = PrepareMesh(new THREE.Mesh(ActorGeometries.scarfTail, scarfMaterial));
  scarfTail.position.set(-0.13, 0.39, -0.17);
  scarfTail.rotation.z = 0.08;
  pelvis.add(scarfTail);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.78;
  pelvis.add(headPivot);
  const neck = PrepareMesh(new THREE.Mesh(ActorGeometries.neck, skin));
  neck.position.y = -0.115;
  headPivot.add(neck);
  const head = PrepareMesh(new THREE.Mesh(ActorGeometries.head, skin));
  head.scale.set(0.93, 1.04, 0.98);
  headPivot.add(head);
  const hairCap = PrepareMesh(new THREE.Mesh(ActorGeometries.hair, hair));
  hairCap.position.y = 0.025;
  headPivot.add(hairCap);
  const braid = PrepareMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.35, 6), hair));
  braid.position.set(-0.1, -0.15, -0.055);
  braid.rotation.z = 0.22;
  headPivot.add(braid);
  const hairBun = PrepareMesh(new THREE.Mesh(ActorGeometries.hairBun, hair));
  hairBun.position.set(0, -0.015, -0.142);
  hairBun.scale.set(0.92, 1.08, 0.78);
  hairBun.visible = role === "mother";
  headPivot.add(hairBun);
  braid.visible = role === "player" || (role === "child" && childIndex % 3 === 1);
  if (role === "child") {
    hairCap.scale.set(0.96 + (childIndex % 2) * 0.04, 0.88 + (childIndex % 3) * 0.035, 0.95);
    braid.scale.setScalar(0.78);
  }
  const nose = PrepareMesh(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 5), skin), false);
  nose.position.set(0, -0.015, 0.145);
  nose.rotation.x = Math.PI * 0.5;
  headPivot.add(nose);

  const leftLeg = CreateLimb(clothDark, clothDark, hair, false);
  const rightLeg = CreateLimb(clothDark, clothDark, hair, false);
  leftLeg.root.position.set(-0.13, 0.01, 0);
  rightLeg.root.position.set(0.13, 0.01, 0);
  pelvis.add(leftLeg.root, rightLeg.root);

  const leftArm = CreateLimb(cloth, cloth, skin, true);
  const rightArm = CreateLimb(cloth, cloth, skin, true);
  leftArm.root.position.set(-0.235, 0.48, 0);
  rightArm.root.position.set(0.235, 0.48, 0);
  leftArm.root.rotation.z = -0.08;
  rightArm.root.rotation.z = 0.08;
  pelvis.add(leftArm.root, rightArm.root);

  // The adult guide needs to read instantly against A-Wei's short jacket and
  // satchel.  A low hair bun, shoulder shawl and loose head-cloth tail create
  // a historically plausible rural silhouette without facial exposition.
  const shawl = PrepareMesh(new THREE.Mesh(ActorGeometries.shawl, scarfMaterial));
  shawl.position.set(0, 0.41, -0.015);
  shawl.rotation.y = Math.PI * 0.25;
  shawl.scale.set(1.02, 0.88, 0.74);
  shawl.visible = role === "mother";
  pelvis.add(shawl);
  const headClothTail = PrepareMesh(new THREE.Mesh(ActorGeometries.headClothTail, clothDark));
  headClothTail.position.set(0.09, 0.62, -0.19);
  headClothTail.rotation.set(-0.08, 0.08, -0.18);
  headClothTail.visible = role === "mother";
  pelvis.add(headClothTail);

  const buttonMaterial = CreateMaterial(palette.clothDark, 1);
  const buttons = [];
  for (let index = 0; index < 3; index += 1) {
    const button = PrepareMesh(new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), buttonMaterial), false);
    button.position.set(0, 0.43 - index * 0.16, 0.198);
    pelvis.add(button);
    buttons.push(button);
  }

  const satchel = PrepareMesh(new THREE.Mesh(ActorGeometries.satchel, satchelMaterial));
  satchel.position.set(-0.27, 0.1, -0.08);
  satchel.rotation.z = 0.12;
  pelvis.add(satchel);
  const strap = PrepareMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.92, 5), satchelMaterial), false);
  strap.position.set(-0.05, 0.32, -0.03);
  strap.rotation.z = -0.5;
  pelvis.add(strap);

  const registerBook = new THREE.Group();
  registerBook.name = "Prop_RollCallRegister";
  const registerCover = PrepareMesh(new THREE.Mesh(ActorGeometries.registerCover, satchelMaterial), false);
  const registerPages = PrepareMesh(new THREE.Mesh(ActorGeometries.registerPages, paperMaterial), false);
  const registerBinding = PrepareMesh(new THREE.Mesh(ActorGeometries.registerBinding, clothDark), false);
  registerPages.position.z = 0.026;
  registerBinding.position.set(-0.112, 0, 0.01);
  registerBook.add(registerCover, registerPages, registerBinding);
  const registerLines = PrepareMesh(new THREE.InstancedMesh(ActorGeometries.registerLine, clothDark, 3), false);
  const registerLineMatrix = new THREE.Matrix4();
  for (let index = 0; index < 3; index += 1) {
    registerLineMatrix.makeTranslation(0.025, 0.062 - index * 0.062, 0.043);
    registerLines.setMatrixAt(index, registerLineMatrix);
  }
  registerLines.instanceMatrix.needsUpdate = true;
  registerBook.add(registerLines);
  registerBook.position.set(0.04, 0.36, 0.3);
  registerBook.rotation.set(-0.18, 0, -0.06);
  registerBook.visible = false;
  pelvis.add(registerBook);

  const carriedBundle = new THREE.Group();
  const blanket = PrepareMesh(new THREE.Mesh(ActorGeometries.bundle, scarfMaterial));
  blanket.scale.set(1.35, 1.65, 1.1);
  carriedBundle.add(blanket);
  carriedBundle.position.set(0.23, 0.36, 0.25);
  carriedBundle.visible = false;
  pelvis.add(carriedBundle);

  const roleScale = role === "child" ? 0.72 + (childIndex % 3) * 0.025 : role === "mother" ? 0.97 : 0.93;
  root.scale.setScalar(roleScale);
  root.userData.lodOptional = [contactShadow, coatBack, scarfTail, belt, satchel, strap, headClothTail, ...buttons];
  root.userData.lodDistantOnly = [
    shoulders,
    skirt,
    scarf,
    neck,
    nose,
    braid,
    hairBun,
    shawl,
    leftArm.joint,
    rightArm.joint,
    leftArm.endpoint,
    rightArm.endpoint,
    leftLeg.endpoint,
    rightLeg.endpoint,
  ].filter(Boolean);
  for (const mesh of [...root.userData.lodOptional, ...root.userData.lodDistantOnly]) {
    mesh.userData.lodAuthoredVisible = mesh.visible;
  }
  root.userData.rig = { rig, pelvis, torso, shoulders, coatBack, scarfTail, contactShadow, headPivot, braid, hairBun, shawl, headClothTail, leftLeg, rightLeg, leftArm, rightArm, satchel, registerBook, carriedBundle, roleScale, role, childIndex };
  root.userData.motion = {
    phase: childIndex * 0.73 + (role === "mother" ? 0.31 : 0),
    velocity: 0,
    acceleration: 0,
    turn: 0,
    fear: 0,
    gaitBlend: 0,
    action: "",
    actionWeight: 0,
    actionImpulse: 0,
    lastActionProgress: 0,
    plantedBias: 0,
    initialized: false,
  };
  return root;
}

function Damp(current, target, speed, deltaTime) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * deltaTime));
}

function DampAngle(current, target, speed, deltaTime) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-speed * deltaTime));
}

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function SmoothStep(edge0, edge1, value) {
  const t = Clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function BackOut(value) {
  const t = Clamp(value, 0, 1) - 1;
  return 1 + 2.35 * t * t * t + 1.35 * t * t;
}

function Bell(value, center, width) {
  const distance = Math.abs(value - center) / Math.max(0.0001, width);
  if (distance >= 1) return 0;
  const t = 1 - distance;
  return t * t * (3 - 2 * t);
}

export function UpdateActor3D(actor, pose, deltaTime) {
  const rig = actor.userData.rig;
  const motion = actor.userData.motion;
  if (!rig || !motion) return;
  const safeDelta = Math.max(0.001, Math.min(0.05, deltaTime));
  const targetVelocity = Number.isFinite(pose.velocity) ? pose.velocity : 0;
  const previousVelocity = motion.velocity;
  motion.velocity = Damp(motion.velocity, targetVelocity, Math.abs(targetVelocity) > Math.abs(motion.velocity) ? 10.5 : 6.8, safeDelta);
  const rawAcceleration = (motion.velocity - previousVelocity) / safeDelta;
  motion.acceleration = Damp(motion.acceleration, rawAcceleration, 7.5, safeDelta);
  const moving = Math.abs(motion.velocity) > 0.055;
  const speed = Math.min(1.25, Math.abs(motion.velocity) / 1.58);
  motion.gaitBlend = Damp(motion.gaitBlend, moving ? 1 : 0, moving ? 8.5 : 5.2, safeDelta);
  motion.phase += safeDelta * (moving ? 3.35 + speed * 7.4 : 0.54);
  const phase = motion.phase + (pose.phase || 0);
  const stepSin = Math.sin(phase);
  const stepCos = Math.cos(phase);
  const gait = motion.gaitBlend;
  const stride = stepSin * (0.16 + speed * 0.5) * gait;
  const leftLift = Math.max(0, -stepCos) * gait;
  const rightLift = Math.max(0, stepCos) * gait;
  const plantedLeft = Math.max(0, stepCos) * gait;
  const plantedRight = Math.max(0, -stepCos) * gait;
  // Authored floor poses own their complete centre-of-gravity shift.  Folding
  // the generic crouch on top of them made the hips collapse twice and was the
  // main source of the old marionette silhouette in the finale.
  const crouch = pose.crouching && pose.action !== "writeKneel" ? 1 : 0;
  const held = pose.holding ? 1 : 0;
  const time = pose.time || 0;
  const fearTarget = Clamp(pose.fear ?? (pose.alert ? 0.72 : 0), 0, 1);
  motion.fear = Damp(motion.fear, fearTarget, fearTarget > motion.fear ? 9 : 3.2, safeDelta);
  const desiredFacing = pose.facing >= 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
  const turnDelta = Math.atan2(Math.sin(desiredFacing - actor.rotation.y), Math.cos(desiredFacing - actor.rotation.y));
  motion.turn = Damp(motion.turn, Clamp(turnDelta / 1.2, -1, 1), 8.5, safeDelta);
  const breathRate = 1.65 + motion.fear * 1.45 + (pose.carrying ? 0.32 : 0);
  const breath = Math.sin(time * breathRate + (pose.phase || 0)) * (0.011 + motion.fear * 0.007);
  const gesture = pose.action || "";
  const gestureDuration = Math.max(0.35, pose.actionDuration || 1.4);
  const gestureProgress = Clamp((pose.actionTime || 0) / gestureDuration, 0, 1);
  if (gesture !== motion.action) {
    motion.action = gesture;
    motion.actionImpulse = gesture ? 1 : 0;
    motion.lastActionProgress = 0;
  }
  motion.actionWeight = Damp(motion.actionWeight, gesture ? 1 : 0, gesture ? 11 : 4.2, safeDelta);
  motion.actionImpulse = Damp(motion.actionImpulse, 0, 3.6, safeDelta);
  const actionVelocity = Clamp((gestureProgress - motion.lastActionProgress) / safeDelta, -4, 4);
  motion.lastActionProgress = gestureProgress;
  const gestureAttack = BackOut(SmoothStep(0, 0.24, gestureProgress));
  const gestureArc = Math.sin(gestureProgress * Math.PI);
  const gestureBeat = Math.sin(gestureProgress * Math.PI * 4.5 + (pose.phase || 0));
  const startStopLean = Clamp(motion.acceleration * 0.035, -0.16, 0.16);
  const idleWeight = Math.sin(time * 0.62 + rig.childIndex * 0.91) * (1 - Math.min(1, speed)) * 0.025;
  const airborne = pose.grounded === false ? 1 : 0;
  const leftContact = Math.pow(Math.max(0, stepCos), 0.48) * gait;
  const rightContact = Math.pow(Math.max(0, -stepCos), 0.48) * gait;
  motion.plantedBias = Damp(motion.plantedBias, leftContact - rightContact, 12, safeDelta);
  const plantCompression = Math.max(leftContact, rightContact) * speed;
  const actionAnticipation = Bell(gestureProgress, 0.1, 0.11) * motion.actionWeight;
  const actionFollowThrough = Bell(gestureProgress, 0.79, 0.2) * motion.actionWeight;
  const effortDirection = ["push", "brace", "lift", "shoulderBrace", "board"].includes(gesture)
    ? 1
    : ["pull", "lookBack", "goodbye"].includes(gesture) ? -1 : 0;

  // Locomotion starts at the planted foot: hips drop over contact, shoulders
  // counter-rotate, and the head resists the body's acceleration.  This keeps
  // the low-poly silhouette readable while giving every step visible weight.
  let rigX = stepCos * 0.018 * speed * gait + idleWeight * 0.12 + motion.plantedBias * 0.014 * speed;
  let rigY = -crouch * 0.36 + (leftLift + rightLift) * 0.026 * speed + Math.abs(stepSin) * 0.018 * gait + breath - motion.fear * 0.025 - plantCompression * 0.016;
  let rigRotX = startStopLean * 0.16 - effortDirection * actionAnticipation * 0.035 + effortDirection * actionFollowThrough * 0.018;
  let rigRotZ = -stride * 0.035 - startStopLean * (pose.facing >= 0 ? 1 : -1) + idleWeight - motion.plantedBias * 0.018 * speed;
  let pelvisRotX = crouch * 0.38 + (pose.carrying ? 0.12 : 0) + startStopLean * 0.72;
  let pelvisRotY = -stepSin * 0.082 * speed * gait - motion.turn * 0.04 + motion.plantedBias * 0.026 * speed;
  let pelvisRotZ = (plantedLeft - plantedRight) * 0.052 * speed + idleWeight * 0.42;
  let torsoRotX = -startStopLean * 0.24;
  let torsoRotY = -stepSin * 0.035 * speed * gait;
  let torsoRotZ = -pelvisRotZ * 0.32;
  let shouldersRotX = 0;
  let shouldersRotY = stepSin * 0.105 * speed * gait + motion.turn * 0.07 - motion.plantedBias * 0.038 * speed;
  let shouldersRotZ = -motion.turn * 0.075 - pelvisRotZ * 0.5;
  let headRotX = crouch * -0.16 + motion.fear * 0.085 - startStopLean * 0.28;
  let headRotY = (pose.lookOffset || 0) - motion.turn * 0.26 + Math.sin(time * 3.7 + rig.childIndex) * motion.fear * 0.035 - actionVelocity * 0.0045;
  let headRotZ = -rigRotZ * 0.28 + Math.sin(time * 0.43 + rig.childIndex) * 0.012;
  let leftArmX = -stride * 0.52 + (pose.carrying ? -0.78 : 0) + startStopLean * 0.28;
  let rightArmX = stride * 0.48 + (pose.carrying ? -0.78 : 0) + startStopLean * 0.24;
  let leftArmLowerX = pose.carrying ? -1.08 : -0.24 - Math.abs(stride) * 0.18;
  let rightArmLowerX = pose.carrying ? -1.08 : -0.22 - Math.abs(stride) * 0.16;
  let leftArmZ = held ? -0.55 : -0.08;
  let rightArmZ = held ? 0.12 : 0.08;
  let leftArmY = -stepCos * 0.035 * gait;
  let rightArmY = stepCos * 0.035 * gait;
  let leftHandX = -0.08;
  let rightHandX = -0.08;
  let leftHandZ = 0;
  let rightHandZ = 0;
  let leftElbowZ = 0;
  let rightElbowZ = 0;
  let leftLegX = stride - crouch * 0.7;
  let rightLegX = -stride - crouch * 0.7;
  let leftLegZ = (plantedLeft - leftLift) * 0.035 * speed;
  let rightLegZ = (rightLift - plantedRight) * 0.035 * speed;
  let leftLowerLegX = leftLift * (0.34 + speed * 0.48) + crouch * 1.1;
  let rightLowerLegX = rightLift * (0.34 + speed * 0.48) + crouch * 1.1;
  let leftLowerLegZ = -stepSin * 0.022 * gait;
  let rightLowerLegZ = stepSin * 0.022 * gait;
  let leftFootX = -leftLift * (0.18 + speed * 0.28) + plantedLeft * 0.08;
  let rightFootX = -rightLift * (0.18 + speed * 0.28) + plantedRight * 0.08;
  let leftFootZ = (plantedLeft - leftLift) * 0.065 * speed;
  let rightFootZ = (rightLift - plantedRight) * 0.065 * speed;
  let bundleX = 0.23;
  let bundleY = 0.36;
  let bundleZ = 0.25;
  let bundleScale = 1;
  if (airborne) {
    const rising = (pose.verticalVelocity || 0) > 0;
    leftLegX = rising ? -0.34 : -0.12;
    rightLegX = rising ? -0.2 : -0.44;
    leftLowerLegX = rising ? 0.92 : 0.72;
    rightLowerLegX = rising ? 0.68 : 1.0;
    leftArmX -= 0.28;
    rightArmX -= 0.18;
    rigRotX -= rising ? 0.08 : -0.05;
    leftFootX += 0.14;
    rightFootX += 0.14;
  }

  if (gesture === "writeKneel") {
    const lower = SmoothStep(0.04, 0.36, gestureProgress);
    const writing = SmoothStep(0.24, 0.74, gestureProgress);
    const stroke = Math.sin(gestureProgress * Math.PI * 7.5) * writing * (1 - SmoothStep(0.82, 1, gestureProgress));
    const penPressure = Math.sin(gestureProgress * Math.PI * 3.75) * writing * 0.018;
    rigY -= 0.27 * lower;
    rigX += (pose.facing >= 0 ? 1 : -1) * 0.018 * lower;
    rigRotX += 0.025 * lower;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * 0.022 * lower;
    pelvisRotX += 0.22 * lower;
    torsoRotX += (0.12 + penPressure) * lower;
    torsoRotY += (pose.facing >= 0 ? -1 : 1) * 0.045 * lower;
    headRotX -= 0.28 * lower;
    headRotY += stroke * 0.024;
    // One planted foot and one shin laid back on the bank keep the pose
    // anatomically legible in profile, even at the finale's long lens.
    leftLegX = THREE.MathUtils.lerp(leftLegX, -0.94, lower);
    rightLegX = THREE.MathUtils.lerp(rightLegX, 0.26, lower);
    leftLowerLegX = THREE.MathUtils.lerp(leftLowerLegX, 1.02, lower);
    rightLowerLegX = THREE.MathUtils.lerp(rightLowerLegX, 1.48, lower);
    leftFootX = THREE.MathUtils.lerp(leftFootX, -0.1, lower);
    rightFootX = THREE.MathUtils.lerp(rightFootX, -1.06, lower);
    // The left hand forms the lap-table; the right hand writes across it.
    leftArmX = THREE.MathUtils.lerp(leftArmX, -1.58, lower);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.42 + stroke * 0.035, writing);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, 1.76, lower);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, 1.62 + stroke * 0.08, writing);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.2, lower);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.16, lower);
    leftElbowZ = -0.08 * lower;
    rightElbowZ = (0.07 + stroke * 0.035) * writing;
    leftHandX = -0.32;
    rightHandX = -0.28 + stroke * 0.13;
    leftHandZ = -0.05;
    rightHandZ = stroke * 0.055;
  } else if (gesture === "kneelListen") {
    const lower = SmoothStep(0.04, 0.4, gestureProgress);
    const settle = SmoothStep(0.36, 0.78, gestureProgress);
    rigY -= 0.25 * lower;
    rigX += (pose.facing >= 0 ? 1 : -1) * 0.014 * lower;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * 0.035 * settle;
    pelvisRotX += 0.3 * lower;
    torsoRotX += 0.08 * lower;
    headRotX -= 0.18 * lower;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.13 * settle;
    leftLegX = THREE.MathUtils.lerp(leftLegX, -0.96, lower);
    rightLegX = THREE.MathUtils.lerp(rightLegX, 0.18, lower);
    leftLowerLegX = THREE.MathUtils.lerp(leftLowerLegX, 1.12, lower);
    rightLowerLegX = THREE.MathUtils.lerp(rightLowerLegX, 1.5, lower);
    leftFootX = THREE.MathUtils.lerp(leftFootX, -0.12, lower);
    rightFootX = THREE.MathUtils.lerp(rightFootX, -1.02, lower);
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.62, settle);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -0.5, settle);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -0.34, settle);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.2, settle);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.2, settle);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.18, settle);
  } else if (gesture === "arrangeShoes") {
    const lower = SmoothStep(0.03, 0.3, gestureProgress);
    const reach = SmoothStep(0.2, 0.56, gestureProgress);
    const straighten = Bell(gestureProgress, 0.67, 0.3);
    const rise = SmoothStep(0.78, 1, gestureProgress);
    const heldLower = lower * (1 - rise * 0.82);
    rigY -= 0.22 * heldLower;
    rigX += (pose.facing >= 0 ? 1 : -1) * (0.03 * reach - 0.018 * rise);
    pelvisRotX += 0.22 * heldLower;
    torsoRotX += 0.16 * heldLower;
    torsoRotY += (pose.facing >= 0 ? -1 : 1) * 0.08 * reach;
    headRotX -= 0.25 * heldLower;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.12 * reach;
    leftLegX = THREE.MathUtils.lerp(leftLegX, -0.72, heldLower);
    rightLegX = THREE.MathUtils.lerp(rightLegX, -0.28, heldLower);
    leftLowerLegX = THREE.MathUtils.lerp(leftLowerLegX, 1.12, heldLower);
    rightLowerLegX = THREE.MathUtils.lerp(rightLowerLegX, 0.86, heldLower);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.24 + straighten * 0.08, reach);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.62 - straighten * 0.16, reach);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.22, reach);
    rightHandX = -0.3 + Math.sin(gestureProgress * Math.PI * 4) * straighten * 0.08;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.76, heldLower);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.1, heldLower);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.2, heldLower);
  } else if (gesture === "write" || gesture === "count") {
    const writing = gesture === "write";
    const stroke = gestureBeat * gestureAttack;
    const countBeat = writing ? 0 : Math.abs(Math.sin(gestureProgress * Math.PI * 3)) * gestureAttack;
    pelvisRotX += (writing ? 0.2 : 0.1) * gestureAttack;
    pelvisRotY += (writing ? -0.09 : 0.07) * gestureAttack;
    shouldersRotY += (writing ? 0.18 : -0.12) * gestureAttack;
    headRotX -= (writing ? 0.3 : 0.13) * gestureAttack;
    headRotY += stroke * 0.018;
    leftArmX = THREE.MathUtils.lerp(leftArmX, writing ? -0.5 : -0.34, gestureAttack);
    rightArmX = THREE.MathUtils.lerp(rightArmX, writing ? -0.72 + stroke * 0.11 : -0.5 - countBeat * 0.32, gestureAttack);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, writing ? -0.86 : -0.62, gestureAttack);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, writing ? -1.08 + stroke * 0.18 : -1.18 + countBeat * 0.18, gestureAttack);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.24, gestureAttack);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.15 + stroke * 0.035, gestureAttack);
    rightHandX = -0.2 + stroke * 0.22;
    leftElbowZ = -0.08 * gestureAttack;
    rightElbowZ = 0.1 * gestureAttack;
  } else if (gesture === "tap") {
    const lower = SmoothStep(0.04, 0.34, gestureProgress);
    const tapWindow = 1 - SmoothStep(0.82, 1, gestureProgress);
    const tapBeat = Math.max(0, Math.sin(gestureProgress * Math.PI * 5.2)) * tapWindow;
    rigY -= 0.18 * lower;
    pelvisRotX += 0.28 * lower;
    torsoRotX += 0.18 * lower + tapBeat * 0.025;
    headRotX -= 0.24 * lower;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.08 * lower;
    leftLegX = THREE.MathUtils.lerp(leftLegX, -0.58, lower);
    rightLegX = THREE.MathUtils.lerp(rightLegX, -0.2, lower);
    leftLowerLegX = THREE.MathUtils.lerp(leftLowerLegX, 1.08, lower);
    rightLowerLegX = THREE.MathUtils.lerp(rightLowerLegX, 0.76, lower);
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.48, lower);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -0.92, lower);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.08 + tapBeat * 0.08, lower);
    // Keep the forearm travelling into the nearby support post instead of
    // folding back toward the face: the knock now has a readable contact.
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.2 + tapBeat * 0.16, lower);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.18, lower);
    rightHandX = -0.3 + tapBeat * 0.22;
  } else if (gesture === "raiseHand") {
    const gather = SmoothStep(0.05, 0.34, gestureProgress);
    const hold = 1 - SmoothStep(0.82, 1, gestureProgress) * 0.18;
    const raise = gather * hold;
    rigY += raise * 0.012;
    torsoRotX -= 0.06 * raise;
    shouldersRotZ += (pose.facing >= 0 ? -1 : 1) * 0.04 * raise;
    headRotX -= 0.12 * raise;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.14 * raise;
    rightArmX = THREE.MathUtils.lerp(rightArmX, -3.02, raise);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, 0.12, raise);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.08, raise);
    rightHandX = -0.08;
  } else if (gesture === "gripSleeve") {
    const notice = SmoothStep(0.02, 0.2, gestureProgress);
    const flinch = Bell(gestureProgress, 0.1, 0.1);
    const reach = BackOut(SmoothStep(0.16, 0.5, gestureProgress));
    const hold = 1 - SmoothStep(0.86, 1, gestureProgress) * 0.12;
    const contact = reach * hold;
    const squeeze = Bell(gestureProgress, 0.58, 0.18) * hold;
    rigY -= 0.05 * contact + squeeze * 0.012;
    rigX -= (pose.facing >= 0 ? 1 : -1) * flinch * 0.018;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * (0.07 * contact + squeeze * 0.018);
    pelvisRotX += 0.1 * contact - flinch * 0.045;
    torsoRotX += 0.08 * contact + squeeze * 0.025;
    shouldersRotY += (pose.facing >= 0 ? -1 : 1) * 0.12 * contact;
    headRotX -= 0.24 * notice;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.18 * notice;
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.55 - squeeze * 0.035, contact);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.05 + squeeze * 0.1, contact);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.12, contact);
    rightHandX = -0.34 - squeeze * 0.08;
    rightHandZ = squeeze * 0.045;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -1.42 - squeeze * 0.025, contact);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -0.12 + squeeze * 0.08, contact);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.14, contact);
    leftHandX = -0.24 - squeeze * 0.06;
    leftHandZ = -squeeze * 0.04;
  } else if (gesture === "shoulderBrace") {
    const plant = SmoothStep(0.02, 0.22, gestureProgress);
    const drive = SmoothStep(0.18, 0.56, gestureProgress);
    const rebound = SmoothStep(0.78, 1, gestureProgress);
    const strainWindow = drive * (1 - rebound * 0.72);
    const tremor = Math.sin(gestureProgress * Math.PI * 9.5) * strainWindow * 0.018;
    rigY -= 0.08 * plant + 0.11 * strainWindow - 0.035 * rebound;
    rigX -= (pose.facing >= 0 ? 1 : -1) * 0.022 * plant;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * ((0.07 * plant + 0.09 * strainWindow - 0.035 * rebound) + tremor);
    pelvisRotX += 0.16 * plant + 0.15 * strainWindow - 0.06 * rebound;
    torsoRotX += 0.09 * plant + 0.17 * strainWindow - 0.07 * rebound;
    shouldersRotZ += (pose.facing >= 0 ? -1 : 1) * 0.1 * drive;
    headRotX -= 0.08 * plant + 0.08 * strainWindow - rebound * 0.08;
    leftLegX = THREE.MathUtils.lerp(leftLegX, -0.68 + rebound * 0.12, plant);
    rightLegX = THREE.MathUtils.lerp(rightLegX, 0.42 - rebound * 0.08, plant);
    leftLowerLegX = THREE.MathUtils.lerp(leftLowerLegX, 1.0 - rebound * 0.12, plant);
    rightLowerLegX = THREE.MathUtils.lerp(rightLowerLegX, 0.34 + rebound * 0.08, plant);
    leftArmX = THREE.MathUtils.lerp(leftArmX, -1.22, drive);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.3, drive);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -0.08, drive);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, 0.04, drive);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.32, drive);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.28, drive);
  } else if (gesture === "breatheRelief") {
    const notice = SmoothStep(0.03, 0.2, gestureProgress);
    const inhale = Bell(gestureProgress, 0.39, 0.28);
    const exhale = SmoothStep(0.48, 0.9, gestureProgress);
    const release = SmoothStep(0.08, 0.72, gestureProgress);
    rigY += 0.025 * release + inhale * 0.045 - exhale * 0.018;
    pelvisRotX -= 0.035 * release + inhale * 0.018;
    torsoRotX -= 0.07 * release + inhale * 0.055 - exhale * 0.026;
    shouldersRotZ *= 1 - release * 0.7;
    shouldersRotX -= inhale * 0.08;
    headRotX -= 0.12 * notice + 0.15 * exhale;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.045 * release;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.28, release);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -0.18, release);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -0.38, release);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.32, release);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.12, release);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.1, release);
  } else if (gesture === "receiveComfort") {
    const notice = SmoothStep(0.04, 0.32, gestureProgress);
    const accept = SmoothStep(0.34, 0.76, gestureProgress);
    rigY -= 0.025 * notice;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * 0.032 * accept;
    torsoRotX += 0.055 * accept;
    shouldersRotY += (pose.facing >= 0 ? -1 : 1) * 0.1 * notice;
    shouldersRotZ += (pose.facing >= 0 ? 1 : -1) * 0.055 * accept;
    headRotX += 0.11 * notice - 0.05 * accept;
    headRotY += (pose.facing >= 0 ? 1 : -1) * (0.2 * notice - 0.08 * accept);
    leftArmX = THREE.MathUtils.lerp(leftArmX, -1.24, accept);
    // One arm only slowly returns the embrace; the other stays low after the
    // initial freeze, which keeps the silhouette human and emotionally clear.
    rightArmX = THREE.MathUtils.lerp(rightArmX, -0.2, accept);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, 0.42, accept);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.25, accept);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.22, accept);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.2, accept);
  } else if (gesture === "embrace") {
    const step = SmoothStep(0.02, 0.23, gestureProgress);
    const leftReach = SmoothStep(0.12, 0.4, gestureProgress);
    const rightReach = SmoothStep(0.2, 0.5, gestureProgress);
    const reach = Math.max(leftReach, rightReach);
    const contact = SmoothStep(0.4, 0.64, gestureProgress);
    const settle = SmoothStep(0.58, 0.9, gestureProgress);
    const sharedSway = Math.sin(time * 1.45 + rig.childIndex * 0.3) * settle * 0.012;
    rigX += (pose.facing >= 0 ? 1 : -1) * (0.02 * step + 0.025 * contact);
    rigY -= contact * 0.018;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * (0.045 * reach + sharedSway);
    torsoRotX += 0.09 * reach - 0.025 * settle + contact * 0.025;
    shouldersRotY += (pose.facing >= 0 ? -1 : 1) * 0.08 * reach;
    headRotX -= 0.05 * reach;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.18 * settle;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -1.34, leftReach);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.46, rightReach);
    // The elbow bends around Awei's shoulders and back.  Relative angles near
    // zero continue the reach; large negative values used to fold both hands
    // upward across her face.
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, 0.58 - settle * 0.08, leftReach);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, 0.12 + settle * 0.08, rightReach);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.5, leftReach);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.48, rightReach);
    leftHandZ = -0.12 * settle;
    rightHandZ = 0.12 * settle;
  } else if (gesture === "touchName") {
    const recognize = SmoothStep(0.03, 0.3, gestureProgress);
    const trace = SmoothStep(0.28, 0.7, gestureProgress);
    const protect = SmoothStep(0.66, 0.94, gestureProgress);
    rigY -= 0.035 * recognize;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * (0.025 * trace - 0.012 * protect);
    pelvisRotX += 0.08 * recognize;
    torsoRotX += 0.09 * trace - 0.035 * protect;
    shouldersRotY += (pose.facing >= 0 ? -1 : 1) * 0.08 * trace;
    headRotX -= 0.24 * recognize + 0.08 * protect;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.08 * trace;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.72 - protect * 0.16, recognize);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.18 - protect * 0.12, recognize);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.23, recognize);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.12 + protect * 0.26, trace);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -1.42 + protect * 0.18, trace);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.2, trace);
    rightHandX = -0.28 + Math.sin(gestureProgress * Math.PI * 4) * trace * (1 - protect) * 0.09;
  } else if (gesture === "suppressCough") {
    const warning = SmoothStep(0.02, 0.22, gestureProgress);
    const cough = Bell(gestureProgress, 0.48, 0.28);
    const recover = SmoothStep(0.62, 0.94, gestureProgress);
    const jolt = Math.sin(gestureProgress * Math.PI * 5) * cough * 0.018;
    rigY -= 0.12 * warning + cough * 0.04 - recover * 0.025;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * (0.06 * warning + jolt);
    pelvisRotX += 0.16 * warning + cough * 0.08;
    torsoRotX += 0.16 * warning + cough * 0.12 + jolt;
    headRotX += 0.12 * warning + cough * 0.08;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.52, warning);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.26, warning);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.16, warning);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.34, warning);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -1.52, warning);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.16, warning);
    rightHandX = -0.36;
  } else if (gesture === "steadyChild") {
    const lower = SmoothStep(0.03, 0.32, gestureProgress);
    const reach = SmoothStep(0.18, 0.58, gestureProgress);
    const settle = SmoothStep(0.58, 0.9, gestureProgress);
    rigY -= 0.13 * lower;
    rigX += (pose.facing >= 0 ? 1 : -1) * 0.025 * reach;
    pelvisRotX += 0.18 * lower;
    torsoRotX += 0.08 * lower - 0.025 * settle;
    headRotX -= 0.16 * reach;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.14 * reach;
    leftLegX = THREE.MathUtils.lerp(leftLegX, -0.56, lower);
    rightLegX = THREE.MathUtils.lerp(rightLegX, -0.24, lower);
    leftLowerLegX = THREE.MathUtils.lerp(leftLowerLegX, 0.96, lower);
    rightLowerLegX = THREE.MathUtils.lerp(rightLowerLegX, 0.72, lower);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.04 + settle * 0.08, reach);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.58 - settle * 0.08, reach);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.24, reach);
    rightHandX = -0.28;
  } else if (gesture === "reachGoodbye") {
    const turn = SmoothStep(0.03, 0.3, gestureProgress);
    const reach = SmoothStep(0.16, 0.58, gestureProgress);
    const stop = SmoothStep(0.58, 0.78, gestureProgress);
    const lower = SmoothStep(0.78, 1, gestureProgress);
    const heldReach = reach * (1 - lower * 0.82);
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * (0.04 * heldReach - 0.02 * lower);
    pelvisRotY += (pose.facing >= 0 ? -1 : 1) * 0.1 * turn;
    shouldersRotY += (pose.facing >= 0 ? -1 : 1) * (0.22 * heldReach - 0.08 * lower);
    headRotY += (pose.facing >= 0 ? 1 : -1) * (0.52 * turn - 0.08 * stop);
    headRotX -= 0.08 * stop + 0.08 * lower;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -1.18 + lower * 0.42, heldReach);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -0.72 + lower * 0.2, heldReach);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.28, heldReach);
    leftHandX = -0.22;
  } else if (gesture === "holdRegister") {
    const hold = SmoothStep(0.05, 0.4, gestureProgress);
    torsoRotX += 0.035 * hold;
    headRotX -= 0.1 * hold;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.82, hold);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -0.78, hold);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.22, hold);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -1.18, hold);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.25, hold);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.23, hold);
    leftHandX = -0.28;
    rightHandX = -0.26;
  } else if (gesture === "peek" || gesture === "shield") {
    const shield = gesture === "shield";
    const weight = gestureAttack;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * (shield ? 0.18 : 0.11) * weight;
    rigY -= (shield ? 0.1 : 0.04) * weight;
    pelvisRotX += 0.08 * weight;
    shouldersRotY += (pose.facing >= 0 ? -1 : 1) * 0.12 * weight;
    headRotX -= 0.1 * weight;
    headRotY += (pose.facing >= 0 ? 1 : -1) * (0.22 + gestureArc * 0.07) * weight;
    leftArmX = THREE.MathUtils.lerp(leftArmX, shield ? -0.68 : -0.3, weight);
    rightArmX = THREE.MathUtils.lerp(rightArmX, shield ? -0.76 : -0.18, weight);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, shield ? -0.94 : -0.52, weight);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, shield ? -1.02 : -0.42, weight);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, shield ? -0.36 : -0.14, weight);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, shield ? 0.34 : 0.14, weight);
  } else if (gesture === "push" || gesture === "pull" || gesture === "brace") {
    const pulling = gesture === "pull";
    const plant = SmoothStep(0.03, 0.24, gestureProgress);
    const drive = SmoothStep(0.2, 0.64, gestureProgress);
    const settle = SmoothStep(0.72, 1, gestureProgress);
    const drivePulse = Math.max(0, Math.sin((gestureProgress - 0.18) * Math.PI * 3.2)) * drive * (1 - settle);
    const effort = Math.sin(gestureProgress * Math.PI * 9) * (1 - gestureProgress) * 0.025;
    pelvisRotX += 0.11 * plant + drive * 0.2 - settle * 0.055;
    torsoRotX += (pulling ? -0.11 : 0.12) * plant + (pulling ? -0.12 : 0.15) * drive - (pulling ? -1 : 1) * settle * 0.045;
    shouldersRotX += (pulling ? -0.1 : 0.08) * plant + (pulling ? -0.12 : 0.1) * drive;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * ((pulling ? -0.07 : 0.06) * plant + (pulling ? -0.05 : 0.045) * drive);
    rigY -= (0.025 * plant + drive * 0.065 + drivePulse * 0.012 - settle * 0.022);
    rigX += (pose.facing >= 0 ? 1 : -1) * drivePulse * (pulling ? -0.014 : 0.014);
    leftLegX = -0.3 - crouch * 0.44 - plant * 0.12 + settle * 0.045;
    rightLegX = 0.2 - crouch * 0.44 + plant * 0.08 - settle * 0.035;
    leftLowerLegX = 0.58 + crouch * 0.55;
    rightLowerLegX = 0.42 + crouch * 0.55;
    leftFootX = 0.12;
    rightFootX = -0.08;
    leftArmX = THREE.MathUtils.lerp(leftArmX, pulling ? -1.02 : -0.56, drive);
    rightArmX = THREE.MathUtils.lerp(rightArmX, pulling ? -1.16 : -0.6, drive);
    // A push keeps both elbows below the shoulders and extends through the
    // cart handles. The former deeply folded forearms produced a readable
    // effort pose but left both hands floating half a metre above the wood.
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, pulling ? -1.32 + effort : -0.16 + effort, drive);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, pulling ? -1.44 - effort : -0.18 - effort, drive);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, pulling ? -0.68 : -0.5, drive);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, pulling ? 0.46 : -0.72, drive);
  } else if (gesture === "listen") {
    const listen = gestureAttack;
    rigY -= 0.025 * listen;
    pelvisRotZ += (pose.facing >= 0 ? -1 : 1) * 0.035 * listen;
    headRotX -= 0.14 * listen;
    headRotY += (pose.facing >= 0 ? 1 : -1) * (0.34 + Math.sin(time * 0.9) * 0.04) * listen;
    headRotZ += (pose.facing >= 0 ? -1 : 1) * 0.08 * listen;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.46, listen);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -0.16, listen);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.24, listen);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.38, listen);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.18, listen);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.12, listen);
  } else if (gesture === "comfort") {
    const reach = SmoothStep(0.08, 0.58, gestureProgress);
    const settle = SmoothStep(0.58, 1, gestureProgress);
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * 0.055 * reach;
    pelvisRotY += (pose.facing >= 0 ? -1 : 1) * 0.08 * reach;
    shouldersRotY -= (pose.facing >= 0 ? -1 : 1) * 0.12 * reach;
    headRotX -= 0.08 * reach;
    headRotY += (pose.facing >= 0 ? 1 : -1) * (0.12 + settle * 0.08);
    leftArmX = THREE.MathUtils.lerp(leftArmX, -1.06 + settle * 0.08, reach);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -0.4, reach);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.42 + settle * 0.12, reach);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.74, reach);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.34, reach);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.18, reach);
    leftHandZ = -0.16 * reach;
    rightHandZ = 0.08 * reach;
  } else if (gesture === "answer") {
    const gather = SmoothStep(0.06, 0.42, gestureProgress);
    const answer = Bell(gestureProgress, 0.62, 0.34);
    rigY += answer * 0.018;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * 0.025 * gather;
    pelvisRotX -= 0.05 * answer;
    torsoRotX -= 0.1 * answer;
    headRotX -= 0.14 * answer;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.08 * gather;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.46, gather);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.18, gather);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.16, gather);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -0.2, gather);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.42, gather);
    leftHandX = -0.26;
  } else if (gesture === "call") {
    const call = SmoothStep(0.05, 0.4, gestureProgress);
    const release = SmoothStep(0.72, 1, gestureProgress);
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * (0.06 - release * 0.025) * call;
    torsoRotX += 0.08 * call;
    headRotX -= 0.09 * call;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.12 * call;
    rightArmX = THREE.MathUtils.lerp(rightArmX, -0.78, call);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -1.36, call);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.22, call);
    rightHandX = -0.34;
    rightHandZ = 0.18;
  } else if (gesture === "goodbye") {
    const turnBack = SmoothStep(0.12, 0.62, gestureProgress);
    headRotY += (pose.facing >= 0 ? -1 : 1) * 0.58 * turnBack;
    headRotZ += (pose.facing >= 0 ? 1 : -1) * 0.05 * turnBack;
    shouldersRotY += (pose.facing >= 0 ? -1 : 1) * 0.12 * turnBack;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.34, turnBack);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -0.92, turnBack);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.16, turnBack);
  } else if (gesture === "lookBack") {
    const turn = SmoothStep(0.08, 0.56, gestureProgress);
    const returnWeight = SmoothStep(0.76, 1, gestureProgress);
    rigRotZ += (pose.facing >= 0 ? 1 : -1) * 0.035 * turn;
    pelvisRotY += (pose.facing >= 0 ? -1 : 1) * 0.08 * turn;
    shouldersRotY += (pose.facing >= 0 ? -1 : 1) * (0.32 - returnWeight * 0.12) * turn;
    headRotY += (pose.facing >= 0 ? -1 : 1) * (0.82 - returnWeight * 0.2) * turn;
    headRotZ += (pose.facing >= 0 ? 1 : -1) * 0.055 * turn;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.48, turn);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -0.72, turn);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.18, turn);
  } else if (gesture === "signal") {
    const raise = BackOut(SmoothStep(0.04, 0.55, gestureProgress));
    const windResistance = Math.sin(gestureProgress * Math.PI * 7) * gestureArc * 0.035;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.3 * raise;
    headRotZ -= windResistance * 0.4;
    shouldersRotZ += 0.08 * raise;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -2.22 + windResistance, raise);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -0.22, raise);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -0.34 + windResistance * 0.7, raise);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.46, raise);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.24, raise);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.14, raise);
    leftHandX = -0.26 + windResistance;
  } else if (gesture === "lift") {
    const squat = Bell(gestureProgress, 0.28, 0.28);
    const rise = SmoothStep(0.32, 0.78, gestureProgress);
    rigY -= 0.18 * squat;
    pelvisRotX += 0.38 * squat + 0.12 * rise;
    torsoRotX += 0.16 * squat - 0.08 * rise;
    headRotX -= 0.16 * gestureAttack;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -1.3 + rise * 0.16, gestureAttack);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.34 + rise * 0.18, gestureAttack);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.5 + rise * 0.24, gestureAttack);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -1.5 + rise * 0.24, gestureAttack);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.56, gestureAttack);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.42, gestureAttack);
    leftLegX = THREE.MathUtils.lerp(leftLegX, -0.58, squat);
    rightLegX = THREE.MathUtils.lerp(rightLegX, -0.58, squat);
    leftLowerLegX = THREE.MathUtils.lerp(leftLowerLegX, 1.22, squat);
    rightLowerLegX = THREE.MathUtils.lerp(rightLowerLegX, 1.18, squat);
    bundleX = 0.15 + rise * 0.1;
    bundleY = -0.32 + rise * 0.68;
    bundleZ = 0.3;
    bundleScale = 0.88 + rise * 0.12;
  } else if (gesture === "pass") {
    const look = SmoothStep(0.02, 0.2, gestureProgress);
    const present = SmoothStep(0.12, 0.5, gestureProgress);
    const recipientWeight = SmoothStep(0.46, 0.7, gestureProgress);
    const release = SmoothStep(0.68, 0.9, gestureProgress);
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * (0.055 * present - 0.025 * release);
    pelvisRotY += (pose.facing >= 0 ? -1 : 1) * 0.08 * present;
    shouldersRotY -= (pose.facing >= 0 ? -1 : 1) * (0.12 * present - 0.04 * recipientWeight);
    headRotX -= 0.1 * look - 0.03 * release;
    headRotY += (pose.facing >= 0 ? 1 : -1) * (0.09 * look + 0.07 * release);
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.82 + release * 0.08, present);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.2 + release * 0.12, present);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.1 + recipientWeight * 0.08 + release * 0.08, present);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -1.55 + recipientWeight * 0.12 + release * 0.12, present);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.3, present);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.36, present);
    leftHandX -= recipientWeight * 0.05;
    rightHandX -= recipientWeight * 0.06;
  } else if (gesture === "huddle") {
    const huddle = gestureAttack;
    const shiver = Math.sin(time * 7.2 + rig.childIndex * 1.7) * motion.fear * 0.012;
    rigY -= 0.24 * huddle + shiver;
    pelvisRotX += 0.14 * huddle;
    shouldersRotZ += shiver * 1.5;
    headRotX += 0.1 * huddle;
    headRotZ -= shiver;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.34, huddle);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -0.4, huddle);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -0.94, huddle);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -0.88, huddle);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.28, huddle);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.26, huddle);
    leftLegX = THREE.MathUtils.lerp(leftLegX, -0.72, huddle);
    rightLegX = THREE.MathUtils.lerp(rightLegX, -0.76, huddle);
    leftLowerLegX = THREE.MathUtils.lerp(leftLowerLegX, 1.32, huddle);
    rightLowerLegX = THREE.MathUtils.lerp(rightLowerLegX, 1.38, huddle);
  } else if (gesture === "board") {
    const plant = SmoothStep(0.08, 0.56, gestureProgress);
    const stepLift = Bell(gestureProgress, 0.38, 0.34);
    const stepUp = SmoothStep(0.42, 0.86, gestureProgress);
    const catchBalance = Bell(gestureProgress, 0.78, 0.18);
    rigY += stepUp * 0.12 - stepLift * 0.09 - catchBalance * 0.018;
    rigRotX -= 0.08 * plant - catchBalance * 0.045;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * catchBalance * 0.035;
    pelvisRotX += 0.22 * plant - 0.08 * stepUp + catchBalance * 0.055;
    pelvisRotZ += (pose.facing >= 0 ? -1 : 1) * (0.06 * stepLift - catchBalance * 0.045);
    shouldersRotZ -= (pose.facing >= 0 ? -1 : 1) * catchBalance * 0.08;
    headRotX -= 0.08 * plant - catchBalance * 0.06;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.96, plant);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.08, plant);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.32, plant);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -1.32, plant);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.44, plant);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.34, plant);
    leftLegX = THREE.MathUtils.lerp(leftLegX, -0.64 + stepUp * 0.32, plant);
    rightLegX = THREE.MathUtils.lerp(rightLegX, -0.32 - stepLift * 0.18, plant);
    leftLowerLegX = THREE.MathUtils.lerp(leftLowerLegX, 1.08 - stepUp * 0.28, plant);
    rightLowerLegX = THREE.MathUtils.lerp(rightLowerLegX, 0.78 + stepLift * 0.26, plant);
    leftFootX += stepLift * 0.2;
    rightFootX += stepUp * 0.1;
  }

  rig.rig.position.x = Damp(rig.rig.position.x, rigX, 9, deltaTime);
  rig.rig.position.y = Damp(rig.rig.position.y, rigY, 10, deltaTime);
  rig.rig.rotation.x = Damp(rig.rig.rotation.x, rigRotX, 7, deltaTime);
  rig.rig.rotation.z = Damp(rig.rig.rotation.z, rigRotZ, 8, deltaTime);
  rig.pelvis.rotation.x = Damp(rig.pelvis.rotation.x, pelvisRotX, 10, deltaTime);
  rig.pelvis.rotation.y = Damp(rig.pelvis.rotation.y, pelvisRotY, 8, deltaTime);
  rig.pelvis.rotation.z = Damp(rig.pelvis.rotation.z, pelvisRotZ, 8, deltaTime);
  rig.pelvis.position.x = Damp(rig.pelvis.position.x, (plantedLeft - plantedRight) * 0.018 * speed + idleWeight * 0.18, 9, deltaTime);
  rig.shoulders.position.y = Damp(rig.shoulders.position.y, 0.48 + motion.fear * 0.045 + Math.abs(startStopLean) * 0.025, 9, deltaTime);
  rig.shoulders.position.x = Damp(rig.shoulders.position.x, -(plantedLeft - plantedRight) * 0.012 * speed, 8, deltaTime);
  rig.shoulders.rotation.x = Damp(rig.shoulders.rotation.x, shouldersRotX, 8, deltaTime);
  rig.shoulders.rotation.z = Damp(rig.shoulders.rotation.z, shouldersRotZ, 8, deltaTime);
  rig.shoulders.rotation.y = Damp(rig.shoulders.rotation.y, shouldersRotY, 8, deltaTime);
  rig.torso.rotation.x = Damp(rig.torso.rotation.x, torsoRotX, 8, deltaTime);
  rig.torso.rotation.y = Damp(rig.torso.rotation.y, torsoRotY, 8, deltaTime);
  rig.torso.rotation.z = Damp(rig.torso.rotation.z, torsoRotZ, 8, deltaTime);
  rig.torso.scale.y = Damp(rig.torso.scale.y, 1 - crouch * 0.08, 9, deltaTime);
  rig.headPivot.rotation.x = Damp(rig.headPivot.rotation.x, headRotX, 7, deltaTime);
  rig.headPivot.rotation.y = Damp(rig.headPivot.rotation.y, headRotY, 5, deltaTime);
  rig.headPivot.rotation.z = Damp(rig.headPivot.rotation.z, headRotZ, 5.5, deltaTime);
  rig.braid.rotation.z = Damp(rig.braid.rotation.z, 0.22 - stride * 0.18 - startStopLean * 0.26 - headRotY * 0.08, 4.1, deltaTime);
  rig.hairBun.rotation.z = Damp(rig.hairBun.rotation.z, -stride * 0.06 - headRotY * 0.025, 4.4, deltaTime);
  rig.shawl.rotation.z = Damp(rig.shawl.rotation.z, -stride * 0.055 - startStopLean * 0.08, 4.2, deltaTime);
  rig.headClothTail.rotation.z = Damp(rig.headClothTail.rotation.z, -0.18 - stride * 0.12 - startStopLean * 0.18, 4, deltaTime);
  rig.coatBack.rotation.x = Damp(rig.coatBack.rotation.x, -0.04 - stride * 0.13 + speed * 0.08 - startStopLean * 0.3, 4.8, deltaTime);
  rig.scarfTail.rotation.z = Damp(rig.scarfTail.rotation.z, 0.08 - stride * 0.2 - startStopLean * 0.34 + pelvisRotZ * 0.22, 4.2, deltaTime);
  rig.scarfTail.rotation.x = Damp(rig.scarfTail.rotation.x, speed * 0.2 + crouch * 0.08 + Math.abs(startStopLean) * 0.28, 4.2, deltaTime);
  rig.satchel.rotation.z = Damp(rig.satchel.rotation.z, 0.12 + stride * 0.13 + startStopLean * 0.3 - pelvisRotZ * 0.2, 4.4, deltaTime);
  rig.contactShadow.scale.x = Damp(rig.contactShadow.scale.x, 1 - crouch * 0.12 + speed * 0.08, 7, deltaTime);
  rig.contactShadow.scale.y = Damp(rig.contactShadow.scale.y, 1 + crouch * 0.16, 7, deltaTime);
  rig.contactShadow.material.uniforms.uOpacity.value = 0.24 + crouch * 0.08 + (pose.carrying ? 0.04 : 0);

  rig.leftLeg.root.rotation.x = Damp(rig.leftLeg.root.rotation.x, leftLegX, 12.5, deltaTime);
  rig.rightLeg.root.rotation.x = Damp(rig.rightLeg.root.rotation.x, rightLegX, 12.5, deltaTime);
  rig.leftLeg.root.rotation.z = Damp(rig.leftLeg.root.rotation.z, leftLegZ, 11, deltaTime);
  rig.rightLeg.root.rotation.z = Damp(rig.rightLeg.root.rotation.z, rightLegZ, 11, deltaTime);
  rig.leftLeg.lower.rotation.x = Damp(rig.leftLeg.lower.rotation.x, leftLowerLegX, 10.2, deltaTime);
  rig.rightLeg.lower.rotation.x = Damp(rig.rightLeg.lower.rotation.x, rightLowerLegX, 10.2, deltaTime);
  rig.leftLeg.lower.rotation.z = Damp(rig.leftLeg.lower.rotation.z, leftLowerLegZ, 11, deltaTime);
  rig.rightLeg.lower.rotation.z = Damp(rig.rightLeg.lower.rotation.z, rightLowerLegZ, 11, deltaTime);
  rig.leftLeg.endpoint.rotation.x = Damp(rig.leftLeg.endpoint.rotation.x, leftFootX + airborne * 0.14, 8.8, deltaTime);
  rig.rightLeg.endpoint.rotation.x = Damp(rig.rightLeg.endpoint.rotation.x, rightFootX + airborne * 0.14, 8.8, deltaTime);
  rig.leftLeg.endpoint.rotation.z = Damp(rig.leftLeg.endpoint.rotation.z, leftFootZ, 12, deltaTime);
  rig.rightLeg.endpoint.rotation.z = Damp(rig.rightLeg.endpoint.rotation.z, rightFootZ, 12, deltaTime);

  rig.leftArm.root.rotation.x = Damp(rig.leftArm.root.rotation.x, leftArmX, gesture ? 10.4 : 7.8, deltaTime);
  rig.rightArm.root.rotation.x = Damp(rig.rightArm.root.rotation.x, rightArmX, gesture ? 10.4 : 7.8, deltaTime);
  rig.leftArm.lower.rotation.x = Damp(rig.leftArm.lower.rotation.x, leftArmLowerX, gesture ? 8.6 : 7.2, deltaTime);
  rig.rightArm.lower.rotation.x = Damp(rig.rightArm.lower.rotation.x, rightArmLowerX, gesture ? 8.6 : 7.2, deltaTime);
  rig.leftArm.lower.rotation.z = Damp(rig.leftArm.lower.rotation.z, leftElbowZ, 9, deltaTime);
  rig.rightArm.lower.rotation.z = Damp(rig.rightArm.lower.rotation.z, rightElbowZ, 9, deltaTime);
  rig.leftArm.root.rotation.z = Damp(rig.leftArm.root.rotation.z, leftArmZ, 9, deltaTime);
  rig.rightArm.root.rotation.z = Damp(rig.rightArm.root.rotation.z, rightArmZ, 9, deltaTime);
  rig.leftArm.root.rotation.y = Damp(rig.leftArm.root.rotation.y, leftArmY, 8, deltaTime);
  rig.rightArm.root.rotation.y = Damp(rig.rightArm.root.rotation.y, rightArmY, 8, deltaTime);
  rig.leftArm.endpoint.rotation.x = Damp(rig.leftArm.endpoint.rotation.x, leftHandX, gesture ? 7.4 : 6.6, deltaTime);
  rig.rightArm.endpoint.rotation.x = Damp(rig.rightArm.endpoint.rotation.x, rightHandX, gesture ? 7.4 : 6.6, deltaTime);
  rig.leftArm.endpoint.rotation.z = Damp(rig.leftArm.endpoint.rotation.z, leftHandZ, gesture ? 7.2 : 6.4, deltaTime);
  rig.rightArm.endpoint.rotation.z = Damp(rig.rightArm.endpoint.rotation.z, rightHandZ, gesture ? 7.2 : 6.4, deltaTime);
  rig.carriedBundle.visible = Boolean(pose.carrying || gesture === "lift");
  rig.carriedBundle.position.x = Damp(rig.carriedBundle.position.x, bundleX, 8, deltaTime);
  rig.carriedBundle.position.y = Damp(rig.carriedBundle.position.y, bundleY, 8, deltaTime);
  rig.carriedBundle.position.z = Damp(rig.carriedBundle.position.z, bundleZ, 8, deltaTime);
  rig.carriedBundle.scale.setScalar(Damp(rig.carriedBundle.scale.x, bundleScale, 8, deltaTime));
  const registerActive = Boolean(pose.registerBook);
  const registerExtended = gesture === "pass" ? gestureArc : gesture === "writeKneel" ? 0.46 : gesture === "write" || gesture === "count" ? 0.32 : gesture === "holdRegister" ? 0.12 : 0;
  rig.registerBook.visible = registerActive;
  rig.registerBook.position.x = Damp(rig.registerBook.position.x, gesture === "write" || gesture === "writeKneel" ? 0 : 0.04, 10, deltaTime);
  rig.registerBook.position.y = Damp(rig.registerBook.position.y, gesture === "writeKneel" ? 0.22 : gesture === "write" ? 0.31 : gesture === "holdRegister" ? 0.38 : 0.36 + registerExtended * 0.05, 10, deltaTime);
  rig.registerBook.position.z = Damp(rig.registerBook.position.z, gesture === "writeKneel" ? 0.27 : gesture === "holdRegister" ? 0.24 : 0.28 + registerExtended * 0.2, 10, deltaTime);
  rig.registerBook.rotation.x = Damp(rig.registerBook.rotation.x, gesture === "writeKneel" ? -1.18 : gesture === "write" || gesture === "count" ? -0.72 : gesture === "holdRegister" ? -0.34 : -0.18, 10, deltaTime);
  rig.registerBook.rotation.y = DampAngle(rig.registerBook.rotation.y, -desiredFacing, 12, deltaTime);
  rig.registerBook.rotation.z = Damp(rig.registerBook.rotation.z, gesture === "pass" ? -0.02 : -0.09, 10, deltaTime);

  actor.rotation.y = DampAngle(actor.rotation.y, desiredFacing, moving ? 8.2 : 6.4, safeDelta);
  const targetZ = pose.z || 0;
  if (!motion.initialized) {
    actor.position.set(pose.x, pose.y, targetZ);
    actor.rotation.y = desiredFacing;
    motion.initialized = true;
  } else {
    actor.position.x = Damp(actor.position.x, pose.x, pose.positionSnap ? 28 : 17, safeDelta);
    actor.position.y = Damp(actor.position.y, pose.y, pose.positionSnap ? 24 : 14, safeDelta);
    actor.position.z = Damp(actor.position.z, targetZ, 12, safeDelta);
  }
  actor.visible = pose.visible !== false;
}

export function DisposeActor3D(actor) {
  const materials = new Set();
  const geometries = new Set();
  const sharedGeometries = new Set(Object.values(ActorGeometries));
  actor.traverse((object) => {
    if (!object.isMesh) return;
    if (object.material) materials.add(object.material);
    if (object.geometry && !sharedGeometries.has(object.geometry)) geometries.add(object.geometry);
  });
  for (const material of materials) material.dispose?.();
  for (const geometry of geometries) geometry.dispose?.();
}
