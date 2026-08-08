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
  root.userData.rig = { rig, pelvis, torso, shoulders, coatBack, scarfTail, contactShadow, headPivot, braid, hairBun, shawl, headClothTail, leftLeg, rightLeg, leftArm, rightArm, satchel, registerBook, carriedBundle, roleScale, role, childIndex };
  root.userData.motion = {
    phase: childIndex * 0.73 + (role === "mother" ? 0.31 : 0),
    velocity: 0,
    acceleration: 0,
    turn: 0,
    fear: 0,
    gaitBlend: 0,
    action: "",
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
  motion.action = gesture;
  const gestureDuration = Math.max(0.35, pose.actionDuration || 1.4);
  const gestureProgress = Clamp((pose.actionTime || 0) / gestureDuration, 0, 1);
  const gestureAttack = BackOut(SmoothStep(0, 0.24, gestureProgress));
  const gestureArc = Math.sin(gestureProgress * Math.PI);
  const gestureBeat = Math.sin(gestureProgress * Math.PI * 4.5 + (pose.phase || 0));
  const startStopLean = Clamp(motion.acceleration * 0.035, -0.16, 0.16);
  const idleWeight = Math.sin(time * 0.62 + rig.childIndex * 0.91) * (1 - Math.min(1, speed)) * 0.025;
  const airborne = pose.grounded === false ? 1 : 0;

  // Locomotion starts at the planted foot: hips drop over contact, shoulders
  // counter-rotate, and the head resists the body's acceleration.  This keeps
  // the low-poly silhouette readable while giving every step visible weight.
  let rigX = stepCos * 0.018 * speed * gait + idleWeight * 0.12;
  let rigY = -crouch * 0.36 + (leftLift + rightLift) * 0.026 * speed + Math.abs(stepSin) * 0.018 * gait + breath - motion.fear * 0.025;
  let rigRotX = startStopLean * 0.16;
  let rigRotZ = -stride * 0.035 - startStopLean * (pose.facing >= 0 ? 1 : -1) + idleWeight;
  let pelvisRotX = crouch * 0.38 + (pose.carrying ? 0.12 : 0) + startStopLean * 0.72;
  let pelvisRotY = -stepSin * 0.082 * speed * gait - motion.turn * 0.04;
  let pelvisRotZ = (plantedLeft - plantedRight) * 0.052 * speed + idleWeight * 0.42;
  let torsoRotX = -startStopLean * 0.24;
  let torsoRotY = -stepSin * 0.035 * speed * gait;
  let torsoRotZ = -pelvisRotZ * 0.32;
  let shouldersRotX = 0;
  let shouldersRotY = stepSin * 0.105 * speed * gait + motion.turn * 0.07;
  let shouldersRotZ = -motion.turn * 0.075 - pelvisRotZ * 0.5;
  let headRotX = crouch * -0.16 + motion.fear * 0.085 - startStopLean * 0.28;
  let headRotY = (pose.lookOffset || 0) - motion.turn * 0.26 + Math.sin(time * 3.7 + rig.childIndex) * motion.fear * 0.035;
  let headRotZ = -rigRotZ * 0.28 + Math.sin(time * 0.43 + rig.childIndex) * 0.012;
  let leftArmX = -stride * 0.52 + (pose.carrying ? -0.78 : 0) + startStopLean * 0.28;
  let rightArmX = stride * 0.48 + (pose.carrying ? -0.78 : 0) + startStopLean * 0.24;
  let leftArmLowerX = pose.carrying ? -1.08 : -0.24;
  let rightArmLowerX = pose.carrying ? -1.08 : -0.22;
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
  let leftLowerLegX = leftLift * (0.34 + speed * 0.48) + crouch * 1.1;
  let rightLowerLegX = rightLift * (0.34 + speed * 0.48) + crouch * 1.1;
  let leftFootX = -leftLift * (0.18 + speed * 0.28) + plantedLeft * 0.08;
  let rightFootX = -rightLift * (0.18 + speed * 0.28) + plantedRight * 0.08;
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
    const drive = SmoothStep(0.08, 0.62, gestureProgress);
    const settle = SmoothStep(0.7, 1, gestureProgress);
    const effort = Math.sin(gestureProgress * Math.PI * 9) * (1 - gestureProgress) * 0.025;
    pelvisRotX += (0.12 + drive * 0.18) * gestureAttack;
    torsoRotX += (pulling ? -0.16 : 0.18) * drive;
    shouldersRotX += (pulling ? -0.18 : 0.14) * drive;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * (pulling ? -0.1 : 0.085) * drive;
    rigY -= (0.035 + drive * 0.055 - settle * 0.018);
    leftLegX = -0.3 - crouch * 0.44 - drive * 0.08;
    rightLegX = 0.2 - crouch * 0.44 + drive * 0.05;
    leftLowerLegX = 0.58 + crouch * 0.55;
    rightLowerLegX = 0.42 + crouch * 0.55;
    leftFootX = 0.12;
    rightFootX = -0.08;
    leftArmX = THREE.MathUtils.lerp(leftArmX, pulling ? -1.02 : -1.22, drive);
    rightArmX = THREE.MathUtils.lerp(rightArmX, pulling ? -1.16 : -1.34, drive);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.32 + effort, drive);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -1.44 - effort, drive);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.68, drive);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.46, drive);
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
    const reach = SmoothStep(0.06, 0.62, gestureProgress);
    const release = SmoothStep(0.68, 0.9, gestureProgress);
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * 0.075 * reach;
    pelvisRotY += (pose.facing >= 0 ? -1 : 1) * 0.1 * reach;
    shouldersRotY -= (pose.facing >= 0 ? -1 : 1) * 0.15 * reach;
    headRotX -= 0.1 * reach;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.12 * release;
    leftArmX = THREE.MathUtils.lerp(leftArmX, -0.82, reach);
    rightArmX = THREE.MathUtils.lerp(rightArmX, -1.2, reach);
    leftArmLowerX = THREE.MathUtils.lerp(leftArmLowerX, -1.1 + release * 0.1, reach);
    rightArmLowerX = THREE.MathUtils.lerp(rightArmLowerX, -1.55 + release * 0.1, reach);
    leftArmZ = THREE.MathUtils.lerp(leftArmZ, -0.3, reach);
    rightArmZ = THREE.MathUtils.lerp(rightArmZ, 0.36, reach);
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
    rigY += stepUp * 0.12 - stepLift * 0.09;
    rigRotX -= 0.08 * plant;
    pelvisRotX += 0.22 * plant - 0.08 * stepUp;
    pelvisRotZ += (pose.facing >= 0 ? -1 : 1) * 0.06 * stepLift;
    headRotX -= 0.08 * plant;
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
  rig.shoulders.position.y = Damp(rig.shoulders.position.y, 0.48 + motion.fear * 0.045 + Math.abs(startStopLean) * 0.025, 9, deltaTime);
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

  rig.leftLeg.root.rotation.x = Damp(rig.leftLeg.root.rotation.x, leftLegX, 13, deltaTime);
  rig.rightLeg.root.rotation.x = Damp(rig.rightLeg.root.rotation.x, rightLegX, 13, deltaTime);
  rig.leftLeg.lower.rotation.x = Damp(rig.leftLeg.lower.rotation.x, leftLowerLegX, 13, deltaTime);
  rig.rightLeg.lower.rotation.x = Damp(rig.rightLeg.lower.rotation.x, rightLowerLegX, 13, deltaTime);
  rig.leftLeg.endpoint.rotation.x = Damp(rig.leftLeg.endpoint.rotation.x, leftFootX + airborne * 0.14, 14, deltaTime);
  rig.rightLeg.endpoint.rotation.x = Damp(rig.rightLeg.endpoint.rotation.x, rightFootX + airborne * 0.14, 14, deltaTime);

  rig.leftArm.root.rotation.x = Damp(rig.leftArm.root.rotation.x, leftArmX, 11, deltaTime);
  rig.rightArm.root.rotation.x = Damp(rig.rightArm.root.rotation.x, rightArmX, 11, deltaTime);
  rig.leftArm.lower.rotation.x = Damp(rig.leftArm.lower.rotation.x, leftArmLowerX, 11, deltaTime);
  rig.rightArm.lower.rotation.x = Damp(rig.rightArm.lower.rotation.x, rightArmLowerX, 11, deltaTime);
  rig.leftArm.lower.rotation.z = Damp(rig.leftArm.lower.rotation.z, leftElbowZ, 9, deltaTime);
  rig.rightArm.lower.rotation.z = Damp(rig.rightArm.lower.rotation.z, rightElbowZ, 9, deltaTime);
  rig.leftArm.root.rotation.z = Damp(rig.leftArm.root.rotation.z, leftArmZ, 9, deltaTime);
  rig.rightArm.root.rotation.z = Damp(rig.rightArm.root.rotation.z, rightArmZ, 9, deltaTime);
  rig.leftArm.root.rotation.y = Damp(rig.leftArm.root.rotation.y, leftArmY, 8, deltaTime);
  rig.rightArm.root.rotation.y = Damp(rig.rightArm.root.rotation.y, rightArmY, 8, deltaTime);
  rig.leftArm.endpoint.rotation.x = Damp(rig.leftArm.endpoint.rotation.x, leftHandX, 9, deltaTime);
  rig.rightArm.endpoint.rotation.x = Damp(rig.rightArm.endpoint.rotation.x, rightHandX, 9, deltaTime);
  rig.leftArm.endpoint.rotation.z = Damp(rig.leftArm.endpoint.rotation.z, leftHandZ, 9, deltaTime);
  rig.rightArm.endpoint.rotation.z = Damp(rig.rightArm.endpoint.rotation.z, rightHandZ, 9, deltaTime);
  rig.carriedBundle.visible = Boolean(pose.carrying || gesture === "lift");
  rig.carriedBundle.position.x = Damp(rig.carriedBundle.position.x, bundleX, 8, deltaTime);
  rig.carriedBundle.position.y = Damp(rig.carriedBundle.position.y, bundleY, 8, deltaTime);
  rig.carriedBundle.position.z = Damp(rig.carriedBundle.position.z, bundleZ, 8, deltaTime);
  rig.carriedBundle.scale.setScalar(Damp(rig.carriedBundle.scale.x, bundleScale, 8, deltaTime));
  const registerActive = Boolean(pose.registerBook);
  const registerExtended = gesture === "pass" ? gestureArc : gesture === "writeKneel" ? 0.46 : gesture === "write" || gesture === "count" ? 0.32 : 0;
  rig.registerBook.visible = registerActive;
  rig.registerBook.position.x = Damp(rig.registerBook.position.x, gesture === "write" || gesture === "writeKneel" ? 0 : 0.04, 10, deltaTime);
  rig.registerBook.position.y = Damp(rig.registerBook.position.y, gesture === "writeKneel" ? 0.22 : gesture === "write" ? 0.31 : 0.36 + registerExtended * 0.05, 10, deltaTime);
  rig.registerBook.position.z = Damp(rig.registerBook.position.z, gesture === "writeKneel" ? 0.27 : 0.28 + registerExtended * 0.2, 10, deltaTime);
  rig.registerBook.rotation.x = Damp(rig.registerBook.rotation.x, gesture === "writeKneel" ? -1.18 : gesture === "write" || gesture === "count" ? -0.72 : -0.18, 10, deltaTime);
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
