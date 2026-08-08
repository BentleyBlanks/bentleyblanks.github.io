import * as THREE from "../TunnelBell1942/vendor/three/build/three.module.mjs";

const ActorGeometries = Object.freeze({
  head: new THREE.SphereGeometry(0.142, 18, 12),
  hair: new THREE.SphereGeometry(0.151, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
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
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: false });
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

  const buttonMaterial = CreateMaterial(palette.clothDark, 1);
  for (let index = 0; index < 3; index += 1) {
    const button = PrepareMesh(new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), buttonMaterial), false);
    button.position.set(0, 0.43 - index * 0.16, 0.198);
    pelvis.add(button);
  }

  const satchel = PrepareMesh(new THREE.Mesh(ActorGeometries.satchel, satchelMaterial));
  satchel.position.set(-0.27, 0.1, -0.08);
  satchel.rotation.z = 0.12;
  pelvis.add(satchel);
  const strap = PrepareMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.92, 5), satchelMaterial), false);
  strap.position.set(-0.05, 0.32, -0.03);
  strap.rotation.z = -0.5;
  pelvis.add(strap);

  const carriedBundle = new THREE.Group();
  const blanket = PrepareMesh(new THREE.Mesh(ActorGeometries.bundle, scarfMaterial));
  blanket.scale.set(1.35, 1.65, 1.1);
  carriedBundle.add(blanket);
  carriedBundle.position.set(0.23, 0.36, 0.25);
  carriedBundle.visible = false;
  pelvis.add(carriedBundle);

  const roleScale = role === "child" ? 0.72 + (childIndex % 3) * 0.025 : role === "mother" ? 0.97 : 0.93;
  root.scale.setScalar(roleScale);
  root.userData.rig = { rig, pelvis, torso, shoulders, coatBack, scarfTail, contactShadow, headPivot, braid, leftLeg, rightLeg, leftArm, rightArm, satchel, carriedBundle, roleScale, role, childIndex };
  root.userData.motion = {
    phase: childIndex * 0.73 + (role === "mother" ? 0.31 : 0),
    velocity: 0,
    acceleration: 0,
    turn: 0,
    fear: 0,
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
  motion.phase += safeDelta * (moving ? 3.1 + speed * 6.8 : 0.72);
  const phase = motion.phase + (pose.phase || 0);
  const stepSin = Math.sin(phase);
  const stepCos = Math.cos(phase);
  const stride = moving ? stepSin * (0.18 + speed * 0.46) : 0;
  const crouch = pose.crouching ? 1 : 0;
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
  const gestureBeat = Math.sin(gestureProgress * Math.PI) * Math.sin((pose.actionTime || 0) * 4.2 + (pose.phase || 0));
  const startStopLean = Clamp(motion.acceleration * 0.035, -0.16, 0.16);
  const idleWeight = Math.sin(time * 0.62 + rig.childIndex * 0.91) * (1 - Math.min(1, speed)) * 0.025;
  const airborne = pose.grounded === false ? 1 : 0;

  // Gestures are intentionally made from the existing low-poly rig.  A clear
  // silhouette (elbow, shoulder, head and weight shift) reads at the game's
  // long-lens scale without adding another character model or animation file.
  let rigY = -crouch * 0.36 + Math.max(0, Math.abs(stepSin) - 0.22) * 0.034 * speed + breath - motion.fear * 0.025;
  let rigRotZ = -stride * 0.024 - startStopLean * (pose.facing >= 0 ? 1 : -1) + idleWeight;
  let pelvisRotX = crouch * 0.38 + (pose.carrying ? 0.12 : 0) + startStopLean * 0.72;
  let pelvisRotZ = stepCos * 0.032 * speed + idleWeight * 0.42;
  let headRotX = crouch * -0.16 + motion.fear * 0.085 - startStopLean * 0.28;
  let headRotY = (pose.lookOffset || 0) - motion.turn * 0.26 + Math.sin(time * 3.7 + rig.childIndex) * motion.fear * 0.035;
  let leftArmX = -stride * 0.52 + (pose.carrying ? -0.78 : 0) + startStopLean * 0.28;
  let rightArmX = stride * 0.48 + (pose.carrying ? -0.78 : 0) + startStopLean * 0.24;
  let leftArmLowerX = pose.carrying ? -1.08 : -0.18;
  let rightArmLowerX = pose.carrying ? -1.08 : -0.18;
  let leftArmZ = held ? -0.55 : -0.08;
  let rightArmZ = held ? 0.12 : 0.08;
  let leftLegX = stride - crouch * 0.7;
  let rightLegX = -stride - crouch * 0.7;
  let leftLowerLegX = Math.max(0, -stepSin) * 0.62 * speed + crouch * 1.1;
  let rightLowerLegX = Math.max(0, stepSin) * 0.62 * speed + crouch * 1.1;
  if (airborne) {
    const rising = (pose.verticalVelocity || 0) > 0;
    leftLegX = rising ? -0.34 : -0.12;
    rightLegX = rising ? -0.2 : -0.44;
    leftLowerLegX = rising ? 0.92 : 0.72;
    rightLowerLegX = rising ? 0.68 : 1.0;
    leftArmX -= 0.28;
    rightArmX -= 0.18;
  }

  if (gesture === "write" || gesture === "count") {
    pelvisRotX += 0.16;
    headRotX -= gesture === "write" ? 0.22 : 0.1;
    leftArmX = -0.46;
    rightArmX = -0.62 + gestureBeat * 0.04;
    leftArmLowerX = -0.82;
    rightArmLowerX = -1.02;
    leftArmZ = -0.22;
    rightArmZ = 0.12;
  } else if (gesture === "peek" || gesture === "shield") {
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * (gesture === "shield" ? 0.16 : 0.1);
    rigY -= gesture === "shield" ? 0.08 : 0.035;
    headRotX -= 0.08;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.2;
    leftArmX = gesture === "shield" ? -0.62 : -0.28;
    rightArmX = gesture === "shield" ? -0.7 : -0.16;
    leftArmLowerX = gesture === "shield" ? -0.88 : -0.48;
    rightArmLowerX = gesture === "shield" ? -0.96 : -0.38;
    leftArmZ = gesture === "shield" ? -0.32 : -0.12;
    rightArmZ = gesture === "shield" ? 0.3 : 0.12;
  } else if (gesture === "push" || gesture === "pull" || gesture === "brace") {
    pelvisRotX += 0.2;
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * (gesture === "pull" ? -0.08 : 0.07);
    rigY -= 0.045;
    leftLegX = -0.24 - crouch * 0.44;
    rightLegX = 0.18 - crouch * 0.44;
    leftLowerLegX = 0.55 + crouch * 0.55;
    rightLowerLegX = 0.42 + crouch * 0.55;
    leftArmX = gesture === "pull" ? -0.96 : -1.18;
    rightArmX = gesture === "pull" ? -1.12 : -1.28;
    leftArmLowerX = -1.28;
    rightArmLowerX = -1.38;
    leftArmZ = -0.64;
    rightArmZ = 0.42;
  } else if (gesture === "listen") {
    headRotX -= 0.12;
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.32;
    leftArmX = -0.42;
    rightArmX = -0.12;
    leftArmLowerX = -1.18;
    rightArmLowerX = -0.34;
    leftArmZ = -0.16;
    rightArmZ = 0.1;
  } else if (gesture === "signal") {
    headRotY += (pose.facing >= 0 ? 1 : -1) * 0.28;
    leftArmX = -2.18 + gestureBeat * 0.05;
    rightArmX = -0.18;
    leftArmLowerX = -0.32;
    rightArmLowerX = -0.42;
    leftArmZ = -0.22;
    rightArmZ = 0.12;
  } else if (gesture === "lift") {
    rigY -= 0.12;
    pelvisRotX += 0.32;
    headRotX -= 0.14;
    leftArmX = -1.22;
    rightArmX = -1.26;
    leftArmLowerX = -1.42;
    rightArmLowerX = -1.42;
    leftArmZ = -0.52;
    rightArmZ = 0.38;
    leftLegX = -0.52;
    rightLegX = -0.52;
    leftLowerLegX = 1.18;
    rightLowerLegX = 1.14;
  } else if (gesture === "pass") {
    rigRotZ += (pose.facing >= 0 ? -1 : 1) * 0.06;
    headRotX -= 0.08;
    leftArmX = -1.3;
    rightArmX = -0.98;
    leftArmLowerX = -1.58;
    rightArmLowerX = -1.42;
    leftArmZ = -0.48;
    rightArmZ = 0.36;
  } else if (gesture === "huddle") {
    rigY -= 0.22;
    pelvisRotX += 0.12;
    headRotX += 0.08;
    leftArmX = -0.3;
    rightArmX = -0.36;
    leftArmLowerX = -0.88;
    rightArmLowerX = -0.82;
    leftArmZ = -0.24;
    rightArmZ = 0.22;
    leftLegX = -0.68;
    rightLegX = -0.72;
    leftLowerLegX = 1.28;
    rightLowerLegX = 1.34;
  } else if (gesture === "board") {
    rigY -= 0.08;
    pelvisRotX += 0.2;
    headRotX -= 0.06;
    leftArmX = -0.92;
    rightArmX = -1.04;
    leftArmLowerX = -1.28;
    rightArmLowerX = -1.28;
    leftArmZ = -0.4;
    rightArmZ = 0.3;
    leftLegX = -0.58;
    rightLegX = -0.28;
    leftLowerLegX = 1.02;
    rightLowerLegX = 0.72;
  }

  rig.rig.position.y = Damp(rig.rig.position.y, rigY, 10, deltaTime);
  rig.rig.rotation.z = Damp(rig.rig.rotation.z, rigRotZ, 8, deltaTime);
  rig.pelvis.rotation.x = Damp(rig.pelvis.rotation.x, pelvisRotX, 10, deltaTime);
  rig.pelvis.rotation.y = Damp(rig.pelvis.rotation.y, -stepSin * 0.055 * speed - motion.turn * 0.04, 8, deltaTime);
  rig.pelvis.rotation.z = Damp(rig.pelvis.rotation.z, pelvisRotZ, 8, deltaTime);
  rig.shoulders.position.y = Damp(rig.shoulders.position.y, 0.48 + motion.fear * 0.045 + Math.abs(startStopLean) * 0.025, 9, deltaTime);
  rig.shoulders.rotation.z = Damp(rig.shoulders.rotation.z, -motion.turn * 0.06, 8, deltaTime);
  rig.shoulders.rotation.y = Damp(rig.shoulders.rotation.y, stepSin * 0.07 * speed + motion.turn * 0.05, 8, deltaTime);
  rig.torso.scale.y = Damp(rig.torso.scale.y, 1 - crouch * 0.08, 9, deltaTime);
  rig.headPivot.rotation.x = Damp(rig.headPivot.rotation.x, headRotX, 7, deltaTime);
  rig.headPivot.rotation.y = Damp(rig.headPivot.rotation.y, headRotY, 5, deltaTime);
  rig.braid.rotation.z = Damp(rig.braid.rotation.z, 0.22 - stride * 0.12 - startStopLean * 0.18, 5, deltaTime);
  rig.coatBack.rotation.x = Damp(rig.coatBack.rotation.x, -0.04 - stride * 0.09 + speed * 0.05 - startStopLean * 0.22, 6, deltaTime);
  rig.scarfTail.rotation.z = Damp(rig.scarfTail.rotation.z, 0.08 - stride * 0.14 - startStopLean * 0.25, 5, deltaTime);
  rig.scarfTail.rotation.x = Damp(rig.scarfTail.rotation.x, speed * 0.16 + crouch * 0.08 + Math.abs(startStopLean) * 0.2, 5, deltaTime);
  rig.satchel.rotation.z = Damp(rig.satchel.rotation.z, 0.12 + stride * 0.08 + startStopLean * 0.22, 5.5, deltaTime);
  rig.contactShadow.scale.x = Damp(rig.contactShadow.scale.x, 1 - crouch * 0.12 + speed * 0.08, 7, deltaTime);
  rig.contactShadow.scale.y = Damp(rig.contactShadow.scale.y, 1 + crouch * 0.16, 7, deltaTime);
  rig.contactShadow.material.uniforms.uOpacity.value = 0.24 + crouch * 0.08 + (pose.carrying ? 0.04 : 0);

  rig.leftLeg.root.rotation.x = Damp(rig.leftLeg.root.rotation.x, leftLegX, 13, deltaTime);
  rig.rightLeg.root.rotation.x = Damp(rig.rightLeg.root.rotation.x, rightLegX, 13, deltaTime);
  rig.leftLeg.lower.rotation.x = Damp(rig.leftLeg.lower.rotation.x, leftLowerLegX, 13, deltaTime);
  rig.rightLeg.lower.rotation.x = Damp(rig.rightLeg.lower.rotation.x, rightLowerLegX, 13, deltaTime);
  rig.leftLeg.endpoint.rotation.x = Damp(rig.leftLeg.endpoint.rotation.x, -Math.max(0, stepSin) * 0.34 * speed + airborne * 0.14, 14, deltaTime);
  rig.rightLeg.endpoint.rotation.x = Damp(rig.rightLeg.endpoint.rotation.x, -Math.max(0, -stepSin) * 0.34 * speed + airborne * 0.14, 14, deltaTime);

  rig.leftArm.root.rotation.x = Damp(rig.leftArm.root.rotation.x, leftArmX, 11, deltaTime);
  rig.rightArm.root.rotation.x = Damp(rig.rightArm.root.rotation.x, rightArmX, 11, deltaTime);
  rig.leftArm.lower.rotation.x = Damp(rig.leftArm.lower.rotation.x, leftArmLowerX, 11, deltaTime);
  rig.rightArm.lower.rotation.x = Damp(rig.rightArm.lower.rotation.x, rightArmLowerX, 11, deltaTime);
  rig.leftArm.root.rotation.z = Damp(rig.leftArm.root.rotation.z, leftArmZ, 9, deltaTime);
  rig.rightArm.root.rotation.z = Damp(rig.rightArm.root.rotation.z, rightArmZ, 9, deltaTime);
  rig.carriedBundle.visible = Boolean(pose.carrying);

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
