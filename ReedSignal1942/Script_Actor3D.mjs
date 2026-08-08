import * as THREE from "../TunnelBell1942/vendor/three/build/three.module.mjs";

const ActorGeometries = Object.freeze({
  head: new THREE.SphereGeometry(0.142, 14, 10),
  hair: new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
  shoulders: new THREE.SphereGeometry(0.245, 12, 8),
  torso: new THREE.CylinderGeometry(0.19, 0.245, 0.62, 10),
  coatSkirt: new THREE.CylinderGeometry(0.235, 0.305, 0.4, 10),
  upperLimb: new THREE.CylinderGeometry(0.064, 0.073, 0.43, 8),
  lowerLimb: new THREE.CylinderGeometry(0.054, 0.064, 0.4, 8),
  hand: new THREE.SphereGeometry(0.064, 9, 6),
  boot: new THREE.BoxGeometry(0.135, 0.105, 0.29),
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
  const upperPivot = new THREE.Group();
  const upper = PrepareMesh(new THREE.Mesh(ActorGeometries.upperLimb, upperMaterial));
  upper.position.y = -0.205;
  upperPivot.add(upper);
  const lowerPivot = new THREE.Group();
  lowerPivot.position.y = -0.4;
  const lower = PrepareMesh(new THREE.Mesh(ActorGeometries.lowerLimb, lowerMaterial));
  lower.position.y = -0.19;
  lowerPivot.add(lower);
  if (isArm) {
    const hand = PrepareMesh(new THREE.Mesh(ActorGeometries.hand, endpointMaterial));
    hand.position.y = -0.405;
    hand.scale.setScalar(0.82);
    lowerPivot.add(hand);
  } else {
    const boot = PrepareMesh(new THREE.Mesh(ActorGeometries.boot, endpointMaterial));
    boot.position.set(0, -0.42, 0.065);
    lowerPivot.add(boot);
  }
  upperPivot.add(lowerPivot);
  return { root: upperPivot, lower: lowerPivot };
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

  const cloth = CreateMaterial(palette.cloth + (role === "child" ? childIndex * 0x030201 : 0));
  const clothDark = CreateMaterial(palette.clothDark);
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
  const head = PrepareMesh(new THREE.Mesh(ActorGeometries.head, skin));
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
  leftArm.root.position.set(-0.25, 0.48, 0);
  rightArm.root.position.set(0.25, 0.48, 0);
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
  root.userData.rig = { rig, pelvis, torso, shoulders, coatBack, scarfTail, contactShadow, headPivot, braid, leftLeg, rightLeg, leftArm, rightArm, satchel, carriedBundle, roleScale };
  return root;
}

function Damp(current, target, speed, deltaTime) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * deltaTime));
}

export function UpdateActor3D(actor, pose, deltaTime) {
  const rig = actor.userData.rig;
  if (!rig) return;
  const moving = Math.abs(pose.velocity || 0) > 0.08;
  const speed = Math.min(1.35, Math.abs(pose.velocity || 0) / 1.55);
  const phase = (pose.time || 0) * (moving ? 7.6 : 1.3) + (pose.phase || 0);
  const stride = moving ? Math.sin(phase) * 0.62 * speed : 0;
  const crouch = pose.crouching ? 1 : 0;
  const held = pose.holding ? 1 : 0;
  const breath = Math.sin((pose.time || 0) * 1.8 + (pose.phase || 0)) * 0.012;

  rig.rig.position.y = Damp(rig.rig.position.y, -crouch * 0.36 + Math.abs(Math.sin(phase * 2)) * 0.026 * speed + breath, 10, deltaTime);
  rig.rig.rotation.z = Damp(rig.rig.rotation.z, -stride * 0.035, 8, deltaTime);
  rig.pelvis.rotation.x = Damp(rig.pelvis.rotation.x, crouch * 0.38 + (pose.carrying ? 0.12 : 0), 10, deltaTime);
  rig.torso.scale.y = Damp(rig.torso.scale.y, 1 - crouch * 0.08, 9, deltaTime);
  rig.headPivot.rotation.x = Damp(rig.headPivot.rotation.x, crouch * -0.16 + (pose.alert ? 0.09 : 0), 7, deltaTime);
  rig.headPivot.rotation.y = Damp(rig.headPivot.rotation.y, pose.lookOffset || 0, 5, deltaTime);
  rig.braid.rotation.z = Damp(rig.braid.rotation.z, 0.22 - stride * 0.12, 5, deltaTime);
  rig.coatBack.rotation.x = Damp(rig.coatBack.rotation.x, -0.04 - stride * 0.09 + speed * 0.05, 6, deltaTime);
  rig.scarfTail.rotation.z = Damp(rig.scarfTail.rotation.z, 0.08 - stride * 0.14, 5, deltaTime);
  rig.scarfTail.rotation.x = Damp(rig.scarfTail.rotation.x, speed * 0.16 + crouch * 0.08, 5, deltaTime);
  rig.contactShadow.scale.x = Damp(rig.contactShadow.scale.x, 1 - crouch * 0.12 + speed * 0.08, 7, deltaTime);
  rig.contactShadow.scale.y = Damp(rig.contactShadow.scale.y, 1 + crouch * 0.16, 7, deltaTime);
  rig.contactShadow.material.uniforms.uOpacity.value = 0.24 + crouch * 0.08 + (pose.carrying ? 0.04 : 0);

  rig.leftLeg.root.rotation.x = Damp(rig.leftLeg.root.rotation.x, stride - crouch * 0.7, 13, deltaTime);
  rig.rightLeg.root.rotation.x = Damp(rig.rightLeg.root.rotation.x, -stride - crouch * 0.7, 13, deltaTime);
  rig.leftLeg.lower.rotation.x = Damp(rig.leftLeg.lower.rotation.x, Math.max(0, -stride) * 0.72 + crouch * 1.1, 13, deltaTime);
  rig.rightLeg.lower.rotation.x = Damp(rig.rightLeg.lower.rotation.x, Math.max(0, stride) * 0.72 + crouch * 1.1, 13, deltaTime);

  const carryArm = pose.carrying ? -1.08 : 0;
  rig.leftArm.root.rotation.x = Damp(rig.leftArm.root.rotation.x, -stride * 0.7 + carryArm, 11, deltaTime);
  rig.rightArm.root.rotation.x = Damp(rig.rightArm.root.rotation.x, stride * 0.7 + carryArm, 11, deltaTime);
  rig.leftArm.lower.rotation.x = Damp(rig.leftArm.lower.rotation.x, pose.carrying ? -1.35 : -0.12, 11, deltaTime);
  rig.rightArm.lower.rotation.x = Damp(rig.rightArm.lower.rotation.x, pose.carrying ? -1.35 : -0.12, 11, deltaTime);
  rig.leftArm.root.rotation.z = Damp(rig.leftArm.root.rotation.z, held ? -0.55 : -0.08, 9, deltaTime);
  rig.rightArm.root.rotation.z = Damp(rig.rightArm.root.rotation.z, held ? 0.12 : 0.08, 9, deltaTime);
  rig.carriedBundle.visible = Boolean(pose.carrying);

  actor.rotation.y = Damp(actor.rotation.y, pose.facing >= 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 12, deltaTime);
  actor.position.set(pose.x, pose.y, pose.z || 0);
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
