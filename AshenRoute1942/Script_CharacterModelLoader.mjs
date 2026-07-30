/**
 * Asynchronous, fail-safe GLB character upgrade for the two friendly actors.
 *
 * The procedural rig remains visible until a complete local GLB has loaded,
 * passed structural validation, received a live animator, and rendered from a
 * stable wrapper. Enemies intentionally stay procedural.
 */

const gltfLoaderModuleUrl = new URL(
  "../taihang/vendor/three/examples/jsm/loaders/GLTFLoader.mjs",
  import.meta.url,
).href;

const characterModelDefinitions = Object.freeze({
  player: Object.freeze({
    characterId: "zhaoTongcen",
    url: new URL("./Model_TongcenCourier.glb?v=20260730s", import.meta.url).href,
    expectedHeight: Object.freeze([1.68, 1.84]),
  }),
  companion: Object.freeze({
    characterId: "duXiangyun",
    url: new URL("./Model_XiangyunGuide.glb?v=20260730s", import.meta.url).href,
    expectedHeight: Object.freeze([1.58, 1.74]),
  }),
});

export const SharedCourierBoneNames = Object.freeze([
  "Root",
  "Hips",
  "Spine",
  "Chest",
  "Neck",
  "Head",
  "UpperArm_L",
  "Forearm_L",
  "Hand_L",
  "UpperArm_R",
  "Forearm_R",
  "Hand_R",
  "Thigh_L",
  "Shin_L",
  "Foot_L",
  "Thigh_R",
  "Shin_R",
  "Foot_R",
  "Prop_Rifle",
  "Prop_Satchel",
  "Prop_Sickle",
]);

const rifleAuthoringPoints = Object.freeze({
  butt: Object.freeze([-0.285, 0.150, 0.790]),
  rearGrip: Object.freeze([-0.085, 0.1515, 1.120]),
  frontGrip: Object.freeze([0.055, 0.1525, 1.350]),
  muzzle: Object.freeze([0.255, 0.154, 1.680]),
});

function Clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function Damp(current, target, smoothing, delta) {
  return current + (target - current) * (1 - Math.exp(-smoothing * Math.max(0, delta)));
}

function BlenderPointToGltf(THREE, point) {
  return new THREE.Vector3(point[0], point[2], -point[1]);
}

function DisposeLoadedHierarchy(root) {
  if (!root?.traverse) return;
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  root.traverse((object) => {
    if (object.geometry && !disposedGeometries.has(object.geometry)) {
      disposedGeometries.add(object.geometry);
      object.geometry.dispose?.();
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => {
      if (disposedMaterials.has(material)) return;
      disposedMaterials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) value.dispose?.();
      });
      material.dispose?.();
    });
  });
  root.removeFromParent?.();
}

function FindRequiredBones(modelScene) {
  const bones = {};
  const missing = [];
  SharedCourierBoneNames.forEach((boneName) => {
    const bone = modelScene.getObjectByName?.(boneName);
    if (!bone?.isBone) missing.push(boneName);
    else bones[boneName] = bone;
  });
  if (missing.length) throw new Error(`Character GLB is missing bones: ${missing.join(", ")}`);
  return bones;
}

export function ConfigureLoadedMeshes(THREE, modelScene, role) {
  const skinnedMeshes = [];
  modelScene.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
    if (object.isSkinnedMesh) skinnedMeshes.push(object);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.filter(Boolean).forEach((material) => {
      if ("roughness" in material) material.roughness = Math.max(0.72, Number(material.roughness) || 0);
      if ("metalness" in material && !/Metal|Steel|Gunmetal/i.test(material.name || "")) material.metalness = 0;
      material.dithering = true;
      material.side = THREE.FrontSide;
      material.needsUpdate = true;
      material.userData.characterRole = role;
    });
  });
  if (!skinnedMeshes.length) throw new Error("Character GLB contains no SkinnedMesh primitives");

  // GLTFLoader expands a Blender mesh with several material primitives into
  // several SkinnedMesh objects. Every primitive must still be driven by the
  // exact same exported courier rig; merely finding 21 arbitrary joints is not
  // sufficient for an atomic character upgrade.
  const referenceBones = skinnedMeshes[0].skeleton?.bones || [];
  const expectedBoneNames = new Set(SharedCourierBoneNames);
  skinnedMeshes.forEach((skinnedMesh, index) => {
    const bones = skinnedMesh.skeleton?.bones || [];
    const boneNames = bones.map((bone) => bone?.name || "");
    const boneNameSet = new Set(boneNames);
    if (bones.length !== SharedCourierBoneNames.length
      || boneNameSet.size !== expectedBoneNames.size
      || [...expectedBoneNames].some((boneName) => !boneNameSet.has(boneName))) {
      throw new Error(
        `Character GLB skin primitive ${index + 1} does not match the ${SharedCourierBoneNames.length}-joint courier rig`,
      );
    }
    if (index > 0 && bones.some((bone, boneIndex) => bone !== referenceBones[boneIndex])) {
      throw new Error(`Character GLB skin primitive ${index + 1} does not share the reference skeleton`);
    }
    const baseName = role === "player" ? "Model_TongcenCourierMesh" : "Model_XiangyunGuideMesh";
    skinnedMesh.name = index === 0 ? baseName : `${baseName}Primitive_${String(index + 1).padStart(2, "0")}`;
  });
  skinnedMeshes[0].userData.skinPrimitiveCount = skinnedMeshes.length;
  return skinnedMeshes;
}

function ValidateModelBounds(THREE, modelScene, definition) {
  modelScene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(modelScene);
  const size = bounds.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every(Number.isFinite)) throw new Error("Character GLB bounds are not finite");
  const [minimumHeight, maximumHeight] = definition.expectedHeight;
  if (size.y < minimumHeight || size.y > maximumHeight) {
    throw new Error(`Character GLB height ${size.y.toFixed(3)}m is outside ${minimumHeight}-${maximumHeight}m`);
  }
  if (bounds.min.y < -0.05 || bounds.min.y > 0.08) {
    throw new Error(`Character GLB ground origin is unsafe: minY=${bounds.min.y.toFixed(3)}m`);
  }
  return { bounds, size };
}

function AttachSocketPreservingRest(THREE, modelScene, parentBone, name, position, forwardDirection) {
  const socket = new THREE.Object3D();
  socket.name = name;
  socket.position.copy(position);
  if (forwardDirection) {
    socket.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      forwardDirection.clone().normalize(),
    );
  }
  modelScene.add(socket);
  modelScene.updateMatrixWorld(true);
  parentBone.attach(socket);
  return socket;
}

function CreateRifleSockets(THREE, modelScene, rifleBone) {
  const buttPoint = BlenderPointToGltf(THREE, rifleAuthoringPoints.butt);
  const muzzlePoint = BlenderPointToGltf(THREE, rifleAuthoringPoints.muzzle);
  const rifleDirection = muzzlePoint.clone().sub(buttPoint).normalize();
  return {
    muzzleAnchor: AttachSocketPreservingRest(
      THREE,
      modelScene,
      rifleBone,
      "Socket_Muzzle",
      muzzlePoint,
      rifleDirection,
    ),
    rearGrip: AttachSocketPreservingRest(
      THREE,
      modelScene,
      rifleBone,
      "Socket_RifleRearGrip",
      BlenderPointToGltf(THREE, rifleAuthoringPoints.rearGrip),
    ),
    frontGrip: AttachSocketPreservingRest(
      THREE,
      modelScene,
      rifleBone,
      "Socket_RifleFrontGrip",
      BlenderPointToGltf(THREE, rifleAuthoringPoints.frontGrip),
    ),
    restDirection: rifleDirection,
  };
}

export function MapSharedCharacterSkeleton(THREE, modelScene, rig, role, skinnedMesh) {
  const bones = FindRequiredBones(modelScene);
  const rifleSockets = role === "player"
    ? CreateRifleSockets(THREE, modelScene, bones.Prop_Rifle)
    : { muzzleAnchor: null, rearGrip: null, frontGrip: null, restDirection: null };
  return {
    root: rig.root,
    motionRoot: null,
    pelvis: bones.Hips,
    pelvisMesh: skinnedMesh,
    spine: bones.Spine,
    chest: bones.Chest,
    torsoMesh: skinnedMesh,
    neck: bones.Neck,
    head: bones.Head,
    leftShoulder: bones.UpperArm_L,
    leftElbow: bones.Forearm_L,
    leftHand: bones.Hand_L,
    rightShoulder: bones.UpperArm_R,
    rightElbow: bones.Forearm_R,
    rightHand: bones.Hand_R,
    leftHip: bones.Thigh_L,
    leftKnee: bones.Shin_L,
    leftFoot: bones.Foot_L,
    rightHip: bones.Thigh_R,
    rightKnee: bones.Shin_R,
    rightFoot: bones.Foot_R,
    weaponPivot: role === "player" ? bones.Prop_Rifle : bones.Prop_Sickle,
    pack: bones.Prop_Satchel,
    muzzleAnchor: rifleSockets.muzzleAnchor,
    rearGrip: rifleSockets.rearGrip,
    frontGrip: rifleSockets.frontGrip,
    rifleRestDirection: rifleSockets.restDirection,
    bones,
    modelScene,
    skinnedMesh,
  };
}

function SnapshotTransform(object) {
  return {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  };
}

function SolveElbowPoint(THREE, shoulderPoint, handPoint, upperLength, forearmLength, sideSign) {
  const toHand = handPoint.clone().sub(shoulderPoint);
  const distance = Math.max(0.001, toHand.length());
  const clampedDistance = Math.min(distance, Math.max(0.001, upperLength + forearmLength - 0.006));
  const forward = toHand.normalize();
  const alongDistance = Clamp(
    (upperLength * upperLength - forearmLength * forearmLength + clampedDistance * clampedDistance)
      / (2 * clampedDistance),
    0.01,
    upperLength - 0.002,
  );
  const bendHeight = Math.sqrt(Math.max(0, upperLength * upperLength - alongDistance * alongDistance));
  const bendDirection = new THREE.Vector3(sideSign, -0.12, 0.02);
  bendDirection.addScaledVector(forward, -bendDirection.dot(forward));
  if (bendDirection.lengthSq() < 0.0001) bendDirection.set(sideSign, 0, 0);
  bendDirection.normalize();
  return shoulderPoint.clone()
    .addScaledVector(forward, alongDistance)
    .addScaledVector(bendDirection, bendHeight);
}

function ResolveBoneLength(bone, childBone, fallback) {
  const length = childBone?.position?.length?.();
  return Number.isFinite(length) && length > 0.05 ? length : fallback;
}

function AimBoneAtWorldTarget(THREE, bone, targetWorld, blendWeight) {
  if (!bone?.parent || blendWeight <= 0) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.updateWorldMatrix(true, false);
  const bonePosition = bone.getWorldPosition(new THREE.Vector3());
  const targetDirectionWorld = targetWorld.clone().sub(bonePosition).normalize();
  const inverseParentQuaternion = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  const targetDirectionParent = targetDirectionWorld.applyQuaternion(inverseParentQuaternion).normalize();
  const sourceQuaternion = bone.quaternion.clone();
  const sourceDirectionParent = new THREE.Vector3(0, 1, 0).applyQuaternion(sourceQuaternion).normalize();
  const targetQuaternion = new THREE.Quaternion()
    .setFromUnitVectors(sourceDirectionParent, targetDirectionParent)
    .multiply(sourceQuaternion);
  bone.quaternion.slerp(targetQuaternion, Clamp(blendWeight));
  bone.updateWorldMatrix(false, true);
}

function ApplyTwoBoneAim(THREE, upperBone, forearmBone, handBone, handTarget, sideSign, blendWeight) {
  if (!upperBone || !forearmBone || !handBone || !handTarget || blendWeight <= 0.001) return;
  upperBone.updateWorldMatrix(true, true);
  handTarget.updateWorldMatrix(true, false);
  const shoulderPoint = upperBone.getWorldPosition(new THREE.Vector3());
  const handPoint = handTarget.getWorldPosition(new THREE.Vector3());
  const upperLength = ResolveBoneLength(upperBone, forearmBone, 0.31);
  const forearmLength = ResolveBoneLength(forearmBone, handBone, 0.27);
  const elbowPoint = SolveElbowPoint(
    THREE,
    shoulderPoint,
    handPoint,
    upperLength,
    forearmLength,
    sideSign,
  );
  AimBoneAtWorldTarget(THREE, upperBone, elbowPoint, blendWeight);
  AimBoneAtWorldTarget(THREE, forearmBone, handPoint, blendWeight);
}

export function CreateSkinnedCharacterAnimator(THREE, rig, nodes, options = {}) {
  let reducedMotion = Boolean(options.reducedMotion);
  let secondaryMotion = reducedMotion ? 0.16 : 1;
  let elapsed = 0;
  const initialPhase = Number(options.phase) || 0;
  let phase = initialPhase;
  const blend = { speed: 0, crouch: 0, injured: 0, aiming: 0, alert: 0 };
  const state = { mode: "idle", speed: 0, crouch: 0, injured: 0, aiming: 0, alert: 0 };
  const poseNodes = [
    nodes.pelvis,
    nodes.spine,
    nodes.chest,
    nodes.head,
    nodes.leftShoulder,
    nodes.leftElbow,
    nodes.rightShoulder,
    nodes.rightElbow,
    nodes.leftHip,
    nodes.leftKnee,
    nodes.leftFoot,
    nodes.rightHip,
    nodes.rightKnee,
    nodes.rightFoot,
    nodes.weaponPivot,
  ];
  const restTransforms = new Map(poseNodes.map((object) => [object, SnapshotTransform(object)]));
  const hostRestPosition = options.modelHost.position.clone();
  const offsetEuler = new THREE.Euler(0, 0, 0, "XYZ");
  const offsetQuaternion = new THREE.Quaternion();
  const weaponAimDelta = nodes.rifleRestDirection
    ? new THREE.Quaternion().setFromUnitVectors(
      nodes.rifleRestDirection.clone().normalize(),
      new THREE.Vector3(0, -0.035, 1).normalize(),
    )
    : new THREE.Quaternion();
  const leftLocomotionTarget = new THREE.Object3D();
  const rightLocomotionTarget = new THREE.Object3D();
  leftLocomotionTarget.name = "PoseTarget_LeftHandLocomotion";
  rightLocomotionTarget.name = "PoseTarget_RightHandLocomotion";
  options.modelHost.add(leftLocomotionTarget, rightLocomotionTarget);

  function RestorePose() {
    restTransforms.forEach((restTransform, object) => {
      object.position.copy(restTransform.position);
      object.quaternion.copy(restTransform.quaternion);
      object.scale.copy(restTransform.scale);
    });
    options.modelHost.position.copy(hostRestPosition);
  }

  function ApplyParentOffset(object, x, y, z) {
    const restTransform = restTransforms.get(object);
    if (!restTransform) return;
    offsetEuler.set(x, y, z);
    offsetQuaternion.setFromEuler(offsetEuler);
    object.quaternion.copy(offsetQuaternion).multiply(restTransform.quaternion);
  }

  function ApplyLocalOffset(object, x, y, z) {
    const restTransform = restTransforms.get(object);
    if (!restTransform) return;
    offsetEuler.set(x, y, z);
    offsetQuaternion.setFromEuler(offsetEuler);
    object.quaternion.copy(restTransform.quaternion).multiply(offsetQuaternion);
  }

  function SetState(nextState = {}) {
    Object.assign(state, nextState);
    if (typeof nextState.mode === "string") {
      if (nextState.mode === "walk" && nextState.speed == null) state.speed = 0.7;
      if (nextState.mode === "run" && nextState.speed == null) state.speed = 1;
      if (nextState.mode === "crouch") state.crouch = 1;
      if (nextState.mode === "injured") state.injured = 1;
      if (nextState.mode === "aim") state.aiming = 1;
      if (nextState.mode === "idle") state.speed = 0;
    }
  }

  function SetReducedMotion(value) {
    reducedMotion = Boolean(value);
    secondaryMotion = reducedMotion ? 0.16 : 1;
  }

  function Update(delta, nextState) {
    if (nextState) SetState(nextState);
    const safeDelta = Math.min(0.05, Math.max(0, Number(delta) || 0));
    elapsed += safeDelta;
    const speedTarget = Clamp(state.speed);
    const crouchTarget = Clamp(typeof state.crouch === "boolean" ? Number(state.crouch) : state.crouch);
    const injuryTarget = Clamp(typeof state.injured === "boolean" ? Number(state.injured) : state.injured);
    const aimingTarget = Clamp(typeof state.aiming === "boolean" ? Number(state.aiming) : state.aiming);
    const alertTarget = Clamp(state.alert);
    blend.speed = Damp(blend.speed, speedTarget, 8, safeDelta);
    blend.crouch = Damp(blend.crouch, crouchTarget, 7, safeDelta);
    blend.injured = Damp(blend.injured, injuryTarget, 4.5, safeDelta);
    blend.aiming = Damp(blend.aiming, aimingTarget, 10, safeDelta);
    blend.alert = Damp(blend.alert, alertTarget, 5, safeDelta);

    RestorePose();
    const sprintBlend = Clamp((blend.speed - 0.68) / 0.32) * (1 - blend.crouch) * (1 - blend.aiming);
    phase += safeDelta * (1.4 + blend.speed * (5.9 - blend.crouch * 1.5) + sprintBlend * 0.7);
    const strideWave = Math.sin(phase);
    const strideLiftLeft = Math.max(0, Math.sin(phase + Math.PI / 2));
    const strideLiftRight = Math.max(0, Math.sin(phase - Math.PI / 2));
    const strideAmount = blend.speed
      * (0.76 + sprintBlend * 0.34 - blend.crouch * 0.24)
      * (1 - blend.injured * 0.28);
    const bob = Math.abs(Math.sin(phase * 2))
      * (0.032 + sprintBlend * 0.018)
      * blend.speed
      * secondaryMotion;
    const idleBreath = Math.sin(elapsed * (1.4 + blend.alert * 0.65)) * 0.012 * secondaryMotion;
    options.modelHost.position.y += bob + blend.crouch * 0.14;

    const pelvisRest = restTransforms.get(nodes.pelvis);
    nodes.pelvis.position.y = pelvisRest.position.y - blend.crouch * 0.245 - blend.injured * 0.025;
    ApplyParentOffset(
      nodes.pelvis,
      sprintBlend * 0.085,
      strideWave * strideAmount * 0.055 * secondaryMotion,
      blend.injured * 0.075,
    );
    ApplyParentOffset(
      nodes.spine,
      blend.crouch * 0.43 + sprintBlend * 0.34 + blend.speed * 0.045 + blend.injured * 0.09,
      -strideWave * strideAmount * 0.045 * secondaryMotion,
      (rig.role === "player" ? -0.025 : 0.025) + blend.injured * 0.095,
    );
    ApplyParentOffset(
      nodes.chest,
      blend.crouch * 0.16 + sprintBlend * 0.18 + idleBreath,
      0,
      blend.injured * 0.045,
    );
    ApplyParentOffset(
      nodes.head,
      -blend.crouch * 0.18 - sprintBlend * 0.08 - blend.injured * 0.04 + blend.alert * 0.025,
      (rig.role === "player" ? 0.035 : -0.04) + Math.sin(elapsed * 0.42) * 0.02 * secondaryMotion,
      -blend.injured * 0.035,
    );

    ApplyParentOffset(nodes.leftHip, strideWave * strideAmount - blend.crouch * 0.72, 0, 0);
    ApplyParentOffset(nodes.rightHip, -strideWave * strideAmount * (1 - blend.injured * 0.4) - blend.crouch * 0.72, 0, 0);
    ApplyLocalOffset(nodes.leftKnee, Math.max(0, -strideWave) * strideAmount * 0.95 + blend.crouch * 1.12, 0, 0);
    ApplyLocalOffset(nodes.rightKnee, Math.max(0, strideWave) * strideAmount * 0.95 + blend.crouch * 1.12 + blend.injured * 0.08, 0, 0);
    ApplyLocalOffset(nodes.leftFoot, -strideLiftLeft * strideAmount * 0.24 - blend.crouch * 0.31, 0, 0);
    ApplyLocalOffset(nodes.rightFoot, -strideLiftRight * strideAmount * 0.24 - blend.crouch * 0.31, 0, 0);

    const armSwing = strideWave * strideAmount * 0.68 * (1 - blend.aiming);
    const playerBias = rig.role === "player" ? 1 : -1;
    ApplyParentOffset(
      nodes.leftShoulder,
      -armSwing - blend.crouch * 0.08 + playerBias * 0.025,
      0,
      rig.role === "player" ? -0.045 : -0.02,
    );
    ApplyParentOffset(
      nodes.rightShoulder,
      armSwing - blend.crouch * 0.08 - playerBias * 0.02,
      0,
      rig.role === "player" ? 0.035 : 0.06,
    );
    ApplyLocalOffset(nodes.leftElbow, 0.08 + blend.crouch * 0.12, 0, 0.04);
    ApplyLocalOffset(nodes.rightElbow, 0.11 + blend.crouch * 0.12, 0, -0.04);

    const armTravel = strideWave
      * blend.speed
      * (0.235 + sprintBlend * 0.09)
      * (1 - blend.crouch * 0.5)
      * (1 - blend.injured * 0.28);
    const handHeight = 0.91 + blend.speed * 0.045 + sprintBlend * 0.055 - blend.crouch * 0.16;
    const handForwardBias = blend.crouch * 0.16 + sprintBlend * 0.035;
    const handLateral = 0.335 + blend.crouch * 0.025;
    leftLocomotionTarget.position.set(handLateral, handHeight, handForwardBias + armTravel);
    rightLocomotionTarget.position.set(-handLateral, handHeight + 0.012, handForwardBias - armTravel);
    rig.group.updateWorldMatrix(true, true);
    const locomotionIkWeight = Clamp(1 - blend.aiming * 1.12);
    ApplyTwoBoneAim(
      THREE,
      nodes.rightShoulder,
      nodes.rightElbow,
      nodes.rightHand,
      rightLocomotionTarget,
      -1,
      locomotionIkWeight,
    );
    ApplyTwoBoneAim(
      THREE,
      nodes.leftShoulder,
      nodes.leftElbow,
      nodes.leftHand,
      leftLocomotionTarget,
      1,
      locomotionIkWeight,
    );

    if (rig.role === "player" && nodes.rifleRestDirection) {
      const weaponRest = restTransforms.get(nodes.weaponPivot);
      const weaponAimQuaternion = weaponRest.quaternion.clone().multiply(weaponAimDelta);
      nodes.weaponPivot.position.copy(weaponRest.position).lerp(
        weaponRest.position.clone().add(new THREE.Vector3(0, 0.205, 0.355)),
        blend.aiming,
      );
      nodes.weaponPivot.quaternion.copy(weaponRest.quaternion).slerp(weaponAimQuaternion, blend.aiming);
      rig.group.updateWorldMatrix(true, true);
      const ikWeight = Clamp((blend.aiming - 0.12) / 0.88);
      ApplyTwoBoneAim(
        THREE,
        nodes.rightShoulder,
        nodes.rightElbow,
        nodes.rightHand,
        nodes.rearGrip,
        -1,
        ikWeight,
      );
      ApplyTwoBoneAim(
        THREE,
        nodes.leftShoulder,
        nodes.leftElbow,
        nodes.leftHand,
        nodes.frontGrip,
        1,
        ikWeight,
      );
    }
  }

  function Reset() {
    Object.assign(state, { mode: "idle", speed: 0, crouch: 0, injured: 0, aiming: 0, alert: 0 });
    Object.assign(blend, { speed: 0, crouch: 0, injured: 0, aiming: 0, alert: 0 });
    elapsed = 0;
    phase = initialPhase;
    RestorePose();
    Update(0, state);
  }

  const animator = {
    Update,
    SetState,
    SetReducedMotion,
    Reset,
    state,
    blend,
    get reducedMotion() { return reducedMotion; },
  };
  return animator;
}

async function CreateGltfLoader() {
  const module = await import(gltfLoaderModuleUrl);
  if (typeof module.GLTFLoader !== "function") throw new Error("Vendored GLTFLoader is unavailable");
  return new module.GLTFLoader();
}

export async function LoadCharacterModel(THREE, role) {
  const definition = characterModelDefinitions[role];
  if (!definition) throw new Error(`No character model is defined for role ${role}`);
  const loader = await CreateGltfLoader();
  const gltf = await loader.loadAsync(definition.url);
  const modelScene = gltf?.scene;
  if (!modelScene?.isObject3D) throw new Error(`Character GLB for ${role} has no scene`);
  const skinnedMeshes = ConfigureLoadedMeshes(THREE, modelScene, role);
  const skinnedMesh = skinnedMeshes[0];
  FindRequiredBones(modelScene);
  const bounds = ValidateModelBounds(THREE, modelScene, definition);
  modelScene.name = role === "player" ? "Model_TongcenCourier" : "Model_XiangyunGuide";
  modelScene.userData.characterId = definition.characterId;
  modelScene.userData.sourceUrl = definition.url;
  return { gltf, modelScene, skinnedMesh, skinnedMeshes, definition, ...bounds };
}

export async function UpgradeCharacterRig(THREE, rig, options = {}) {
  if (!rig?.group || !rig?.nodes?.motionRoot || !rig?.animator) {
    return { ok: false, role: rig?.role, reason: "invalidFallbackRig" };
  }
  const role = options.role || rig.role;
  if (!characterModelDefinitions[role]) return { ok: false, role, reason: "unsupportedRole" };
  const fallbackNodes = rig.nodes;
  const fallbackAnimator = rig.animator;
  const fallbackMotionRoot = fallbackNodes.motionRoot;
  const currentGeneration = Number(rig.userData?.modelGeneration || 0) + 1;
  rig.userData = rig.userData || {};
  rig.userData.modelGeneration = currentGeneration;
  rig.modelLoadState = "loading";
  let cancelled = false;
  const previousCancel = rig.CancelModelLoad;
  rig.CancelModelLoad = () => {
    cancelled = true;
    if (typeof previousCancel === "function") previousCancel();
  };

  let loadedAsset = null;
  const modelHost = new THREE.Group();
  modelHost.name = role === "player" ? "Model_TongcenCourierHost" : "Model_XiangyunGuideHost";
  modelHost.visible = false;
  modelHost.rotation.y = Math.PI;
  modelHost.userData.sourceFrontAxis = "+Z";
  modelHost.userData.gameFrontAxis = "-Z";
  modelHost.userData.frontAxisCorrectionRadians = Math.PI;
  const inheritedScale = Math.max(0.001, Number(rig.group.scale.x) || 1);
  modelHost.scale.setScalar(1 / inheritedScale);
  rig.group.add(modelHost);

  try {
    const LoadModel = typeof options.loadModel === "function" ? options.loadModel : LoadCharacterModel;
    loadedAsset = await LoadModel(THREE, role);
    if (cancelled || rig.userData.modelGeneration !== currentGeneration) throw new Error("Character model load was superseded");
    modelHost.add(loadedAsset.modelScene);
    const nodes = MapSharedCharacterSkeleton(THREE, loadedAsset.modelScene, rig, role, loadedAsset.skinnedMesh);
    nodes.motionRoot = modelHost;
    const animator = CreateSkinnedCharacterAnimator(THREE, rig, nodes, {
      modelHost,
      reducedMotion: options.reducedMotion,
      phase: options.phase,
    });
    const currentState = { ...fallbackAnimator.state };
    animator.SetState(currentState);
    animator.Update(1 / 60, currentState);
    modelHost.updateMatrixWorld(true);

    const UseFallback = () => {
      if (rig.modelLoadState === "fallback") return;
      modelHost.visible = false;
      fallbackMotionRoot.visible = true;
      rig.nodes = fallbackNodes;
      rig.animator = fallbackAnimator;
      rig.modelLoadState = "fallback";
    };
    rig.loadedModel = loadedAsset.modelScene;
    rig.loadedModelHost = modelHost;
    rig.fallbackNodes = fallbackNodes;
    rig.fallbackAnimator = fallbackAnimator;
    rig.UseFallback = UseFallback;
    rig.nodes = nodes;
    rig.animator = animator;
    rig.modelSource = "glb";
    rig.modelLoadState = "loaded";
    fallbackMotionRoot.visible = false;
    modelHost.visible = true;
    rig.root.userData.characterModelSource = "glb";
    delete rig.root.userData.characterModelError;
    rig.root.userData.characterModelUrl = loadedAsset.definition.url;
    rig.root.userData.characterModelHeight = loadedAsset.size.y;
    rig.root.userData.characterModelFrontAxis = "-Z";
    return {
      ok: true,
      role,
      characterId: loadedAsset.definition.characterId,
      height: loadedAsset.size.y,
      joints: loadedAsset.skinnedMesh.skeleton.bones.length,
      sourceUrl: loadedAsset.definition.url,
    };
  } catch (error) {
    if (loadedAsset?.modelScene) DisposeLoadedHierarchy(loadedAsset.modelScene);
    modelHost.removeFromParent();
    fallbackMotionRoot.visible = true;
    rig.nodes = fallbackNodes;
    rig.animator = fallbackAnimator;
    rig.modelSource = "procedural";
    rig.modelLoadState = "fallback";
    rig.root.userData.characterModelSource = "proceduralFallback";
    rig.root.userData.characterModelError = String(error?.message || error);
    console.warn(`[AshenRoute] ${role} GLB unavailable; procedural rig retained.`, error);
    return { ok: false, role, reason: "loadOrValidationFailed", error };
  }
}

export function BeginFriendlyCharacterModelUpgrades(THREE, options = {}) {
  const upgrades = [
    UpgradeCharacterRig(THREE, options.playerRig, {
      role: "player",
      reducedMotion: options.reducedMotion,
      phase: 0,
    }),
    UpgradeCharacterRig(THREE, options.companionRig, {
      role: "companion",
      reducedMotion: options.reducedMotion,
      phase: 1.7,
    }),
  ];
  const ready = Promise.all(upgrades).then((results) => {
    options.onComplete?.(results);
    return results;
  });
  function Cancel() {
    options.playerRig?.CancelModelLoad?.();
    options.companionRig?.CancelModelLoad?.();
  }
  return { ready, Cancel };
}

export default BeginFriendlyCharacterModelUpgrades;
