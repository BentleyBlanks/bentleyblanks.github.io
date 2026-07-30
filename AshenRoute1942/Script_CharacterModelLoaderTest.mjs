import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "../taihang/vendor/three/build/three.module.mjs";
import {
  ConfigureLoadedMeshes,
  CreateSkinnedCharacterAnimator,
  MapSharedCharacterSkeleton,
  SharedCourierBoneNames,
  UpgradeCharacterRig,
} from "./Script_CharacterModelLoader.mjs";


function ParseGlbJson(fileName) {
  const filePath = fileURLToPath(new URL(fileName, import.meta.url));
  const buffer = readFileSync(filePath);
  assert.equal(buffer.toString("ascii", 0, 4), "glTF", `${fileName} should have a glTF header`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${fileName} byte length should match its header`);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength));
}


function BuildThreeNodeHierarchy(gltfJson) {
  const boneNames = new Set(SharedCourierBoneNames);
  const objects = gltfJson.nodes.map((node, index) => {
    const object = boneNames.has(node.name) ? new THREE.Bone() : new THREE.Group();
    object.name = node.name || `Node_${index}`;
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    return object;
  });
  gltfJson.nodes.forEach((node, index) => {
    (node.children || []).forEach((childIndex) => objects[index].add(objects[childIndex]));
  });
  const modelScene = new THREE.Group();
  modelScene.name = "Model_TestImportedGlbScene";
  (gltfJson.scenes[gltfJson.scene || 0].nodes || []).forEach((nodeIndex) => modelScene.add(objects[nodeIndex]));
  return modelScene;
}


function CreateHarness(fileName, role, fallbackScale) {
  const gltfJson = ParseGlbJson(fileName);
  assert.equal(gltfJson.meshes.length, 1, `${fileName} should contain one mesh`);
  assert.equal(gltfJson.skins.length, 1, `${fileName} should contain one skin`);
  assert.equal(gltfJson.skins[0].joints.length, 21, `${fileName} should contain 21 joints`);
  const modelScene = BuildThreeNodeHierarchy(gltfJson);
  const group = new THREE.Group();
  group.name = `Model_TestRig_${role}`;
  group.scale.setScalar(fallbackScale);
  const modelHost = new THREE.Group();
  modelHost.name = `Model_TestHost_${role}`;
  modelHost.rotation.y = Math.PI;
  modelHost.scale.setScalar(1 / fallbackScale);
  modelHost.add(modelScene);
  group.add(modelHost);
  const scene = new THREE.Scene();
  scene.add(group);
  const rig = { root: group, group, role };
  const nodes = MapSharedCharacterSkeleton(THREE, modelScene, rig, role, { name: "TestSkinnedMesh" });
  nodes.motionRoot = modelHost;
  const animator = CreateSkinnedCharacterAnimator(THREE, rig, nodes, {
    modelHost,
    reducedMotion: false,
    phase: 0,
  });
  rig.nodes = nodes;
  rig.animator = animator;
  return { gltfJson, scene, group, modelHost, modelScene, rig, nodes, animator };
}


function CreateFallbackRig(role, scale) {
  const group = new THREE.Group();
  group.name = `Model_FallbackRig_${role}`;
  group.scale.setScalar(scale);
  const motionRoot = new THREE.Group();
  motionRoot.name = "Bone_MotionRoot";
  group.add(motionRoot);
  const animator = {
    state: { speed: 0.4, crouch: 0, injured: 0, aiming: 0, alert: 0 },
    blend: { speed: 0.4, crouch: 0, injured: 0, aiming: 0, alert: 0 },
    Update() {},
    SetState(nextState) { Object.assign(this.state, nextState); },
    SetReducedMotion() {},
    Reset() {},
  };
  return {
    root: group,
    group,
    role,
    nodes: { motionRoot },
    animator,
    materials: {},
    Dispose() { group.removeFromParent(); },
  };
}


function CreateInjectedLoadedAsset(fileName, role) {
  const gltfJson = ParseGlbJson(fileName);
  const modelScene = BuildThreeNodeHierarchy(gltfJson);
  const bones = SharedCourierBoneNames.map((boneName) => modelScene.getObjectByName(boneName));
  return {
    modelScene,
    skinnedMesh: { skeleton: { bones } },
    definition: {
      characterId: role === "player" ? "zhaoTongcen" : "duXiangyun",
      url: `test://${fileName}`,
    },
    size: new THREE.Vector3(0.8, role === "player" ? 1.7722 : 1.6724, 0.45),
  };
}


function CreateMaterialPrimitiveHarness(fileName, primitiveCount, scrambleLastSkeleton = false) {
  const gltfJson = ParseGlbJson(fileName);
  const modelScene = BuildThreeNodeHierarchy(gltfJson);
  modelScene.updateMatrixWorld(true);
  const bones = SharedCourierBoneNames.map((boneName) => modelScene.getObjectByName(boneName));
  const sharedSkeleton = new THREE.Skeleton(bones);
  const meshes = Array.from({ length: primitiveCount }, (_, index) => {
    const geometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const material = new THREE.MeshStandardMaterial({ name: `Material_TestPrimitive_${index + 1}` });
    const mesh = new THREE.SkinnedMesh(geometry, material);
    const skeleton = scrambleLastSkeleton && index === primitiveCount - 1
      ? new THREE.Skeleton(bones.slice().reverse())
      : sharedSkeleton;
    mesh.bind(skeleton);
    modelScene.add(mesh);
    return mesh;
  });
  return { modelScene, meshes };
}


function StepAnimator(harness, state, frames = 90) {
  for (let frame = 0; frame < frames; frame += 1) harness.animator.Update(1 / 60, state);
  harness.scene.updateMatrixWorld(true);
}


function ReadWorldPosition(object) {
  return object.getWorldPosition(new THREE.Vector3());
}


function ReadWorldForward(object) {
  return new THREE.Vector3(0, 0, -1)
    .applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
}


function CapturePoseEnvelope(harness) {
  harness.scene.updateMatrixWorld(true);
  const poseObjects = {
    head: harness.nodes.head,
    pelvis: harness.nodes.pelvis,
    chest: harness.nodes.chest,
    leftElbow: harness.nodes.leftElbow,
    rightElbow: harness.nodes.rightElbow,
    leftHand: harness.nodes.leftHand,
    rightHand: harness.nodes.rightHand,
    leftKnee: harness.nodes.leftKnee,
    rightKnee: harness.nodes.rightKnee,
    leftFoot: harness.nodes.leftFoot,
    rightFoot: harness.nodes.rightFoot,
  };
  const points = Object.fromEntries(
    Object.entries(poseObjects).map(([name, object]) => [name, ReadWorldPosition(object)]),
  );
  const bounds = new THREE.Box3().setFromPoints(Object.values(points));
  const size = bounds.getSize(new THREE.Vector3());
  return {
    points,
    size,
    armDepth: Math.abs(points.leftHand.z - points.rightHand.z),
    footDepth: Math.abs(points.leftFoot.z - points.rightFoot.z),
    torsoLean: points.head.z - points.pelvis.z,
    meanHandY: (points.leftHand.y + points.rightHand.y) * 0.5,
  };
}


function AssertFiniteTransforms(harness) {
  harness.group.traverse((object) => {
    const values = [
      ...object.position.toArray(),
      ...object.quaternion.toArray(),
      ...object.scale.toArray(),
      ...object.matrixWorld.elements,
    ];
    assert.ok(values.every(Number.isFinite), `${object.name} should keep finite transforms`);
  });
}


function TestLocomotionAndStances() {
  const harness = CreateHarness("./Model_TongcenCourier.glb", "player", 0.93);
  StepAnimator(harness, { speed: 0, crouch: 0, injured: 0, aiming: 0, alert: 0 });
  const idleHeadY = ReadWorldPosition(harness.nodes.head).y;
  const idleLeftThigh = harness.nodes.leftHip.quaternion.clone();

  StepAnimator(harness, { speed: 1, crouch: 0, injured: 0, aiming: 0, alert: 0 });
  assert.ok(
    idleLeftThigh.angleTo(harness.nodes.leftHip.quaternion) > 0.08,
    "walking should rotate the thigh away from its idle bind pose",
  );
  AssertFiniteTransforms(harness);

  harness.animator.Reset();
  StepAnimator(harness, { speed: 0.25, crouch: 1, injured: 0, aiming: 0, alert: 0 });
  const crouchedHeadY = ReadWorldPosition(harness.nodes.head).y;
  assert.ok(crouchedHeadY < idleHeadY - 0.12, "crouching should lower the head by a readable amount");
  assert.ok(crouchedHeadY > idleHeadY - 0.52, "crouching should not collapse the skeleton into the ground");
  AssertFiniteTransforms(harness);

  harness.animator.Reset();
  const healthySpine = harness.nodes.spine.quaternion.clone();
  StepAnimator(harness, { speed: 0.35, crouch: 0, injured: 1, aiming: 0, alert: 0.7 });
  assert.ok(
    healthySpine.angleTo(harness.nodes.spine.quaternion) > 0.05,
    "injury should produce a persistent asymmetric spine pose",
  );
  AssertFiniteTransforms(harness);
}


function TestLocomotionSilhouetteEnvelopes() {
  const harness = CreateHarness("./Model_TongcenCourier.glb", "player", 0.93);
  StepAnimator(harness, { speed: 0, crouch: 0, injured: 0, aiming: 0, alert: 0 }, 24);
  const idle = CapturePoseEnvelope(harness);
  harness.animator.Reset();
  StepAnimator(harness, { speed: 0.58, crouch: 0, injured: 0, aiming: 0, alert: 0 }, 30);
  const walk = CapturePoseEnvelope(harness);
  harness.animator.Reset();
  StepAnimator(harness, { speed: 0.25, crouch: 1, injured: 0, aiming: 0, alert: 0 }, 42);
  const crouch = CapturePoseEnvelope(harness);
  harness.animator.Reset();
  StepAnimator(harness, { speed: 1, crouch: 0, injured: 0, aiming: 0, alert: 0 }, 24);
  const sprint = CapturePoseEnvelope(harness);
  assert.ok(idle.points.head.y - idle.meanHandY > 0.55, "idle hands should hang naturally below the torso");
  assert.ok(idle.armDepth < 0.06, "idle arms should rest beside the body instead of forming an akimbo silhouette");
  assert.ok(walk.armDepth > 0.2, "walking should create a readable fore-aft arm swing");
  assert.ok(walk.footDepth > 0.35, "walking should create a readable stride");
  assert.ok(
    (walk.points.leftHand.z - walk.points.rightHand.z)
      * (walk.points.leftFoot.z - walk.points.rightFoot.z) < 0,
    "walking arms should counter-swing against the legs",
  );
  assert.ok(crouch.points.head.y < idle.points.head.y - 0.17, "ground-safe crouch should lower the head by at least 17 cm");
  assert.ok(crouch.size.y < idle.size.y - 0.12, "crouch pose envelope should be visibly shorter than idle");
  assert.ok(Math.abs(crouch.torsoLean) > 0.22, "crouch should lean the torso forward");
  assert.ok(sprint.armDepth > walk.armDepth * 1.45, "sprint arm swing should exceed the walk swing");
  assert.ok(sprint.footDepth > walk.footDepth * 1.5, "sprint stride should exceed the walk stride");
  assert.ok(Math.abs(sprint.torsoLean) > Math.abs(walk.torsoLean) + 0.2, "sprint should have a distinct forward lean");
  assert.ok(sprint.size.z > walk.size.z * 1.5, "sprint pose envelope should be substantially deeper than walk");
}


function TestAimingAndMuzzleSocket() {
  const harness = CreateHarness("./Model_TongcenCourier.glb", "player", 0.93);
  StepAnimator(harness, { speed: 0, crouch: 0, injured: 0, aiming: 1, alert: 1 }, 120);
  const muzzlePosition = ReadWorldPosition(harness.nodes.muzzleAnchor);
  const muzzleForward = ReadWorldForward(harness.nodes.muzzleAnchor);
  const rearGrip = ReadWorldPosition(harness.nodes.rearGrip);
  const frontGrip = ReadWorldPosition(harness.nodes.frontGrip);
  const rightHand = ReadWorldPosition(harness.nodes.rightHand);
  const leftHand = ReadWorldPosition(harness.nodes.leftHand);
  assert.ok(muzzlePosition.y > 1.0 && muzzlePosition.y < 1.65, "aimed muzzle should stay near shoulder height");
  assert.ok(muzzleForward.z < -0.82, "wrapper and rifle pose should align the muzzle with local -Z");
  assert.ok(Math.abs(muzzleForward.x) < 0.35, "aimed muzzle should not point sharply sideways");
  assert.ok(rightHand.distanceTo(rearGrip) < 0.16, "right hand should meet the rifle rear grip");
  assert.ok(leftHand.distanceTo(frontGrip) < 0.16, "left hand should meet the rifle fore grip");
  AssertFiniteTransforms(harness);
}


function TestCompanionSkeleton() {
  const harness = CreateHarness("./Model_XiangyunGuide.glb", "companion", 0.9);
  StepAnimator(harness, { speed: 0.7, crouch: 1, injured: 1, aiming: 0, alert: 0.8 }, 100);
  assert.equal(harness.nodes.weaponPivot.name, "Prop_Sickle", "companion should expose the sickle prop bone");
  assert.equal(harness.nodes.muzzleAnchor, null, "companion should not expose a rifle muzzle socket");
  AssertFiniteTransforms(harness);
}


function TestMaterialPrimitivesShareOneCourierSkeleton() {
  const player = CreateMaterialPrimitiveHarness("./Model_TongcenCourier.glb", 13);
  const configuredMeshes = ConfigureLoadedMeshes(THREE, player.modelScene, "player");
  assert.equal(configuredMeshes.length, 13, "all material primitives should remain skinned and visible");
  assert.equal(configuredMeshes[0], player.meshes[0], "the first valid primitive should remain the primary audit mesh");
  assert.equal(configuredMeshes[0].userData.skinPrimitiveCount, 13);
  assert.equal(configuredMeshes[0].name, "Model_TongcenCourierMesh");
  assert.equal(configuredMeshes[12].name, "Model_TongcenCourierMeshPrimitive_13");

  const invalid = CreateMaterialPrimitiveHarness("./Model_TongcenCourier.glb", 2, true);
  assert.throws(
    () => ConfigureLoadedMeshes(THREE, invalid.modelScene, "player"),
    /does not share the reference skeleton/,
    "a primitive with a reordered or unrelated skeleton must be rejected",
  );
}


async function TestSafeAsynchronousSwap() {
  const rig = CreateFallbackRig("player", 0.93);
  const originalGroup = rig.group;
  const originalAnimator = rig.animator;
  let ResolveLoadedAsset;
  const pendingAsset = new Promise((resolve) => { ResolveLoadedAsset = resolve; });
  const upgradePromise = UpgradeCharacterRig(THREE, rig, {
    role: "player",
    reducedMotion: false,
    loadModel: () => pendingAsset,
  });
  await Promise.resolve();
  const pendingHost = rig.group.getObjectByName("Model_TongcenCourierHost");
  assert.ok(pendingHost, "loading should attach a hidden stable host");
  assert.equal(pendingHost.visible, false, "loaded host should remain hidden while loading");
  assert.equal(rig.nodes.motionRoot.visible, true, "fallback should remain visible while loading");
  ResolveLoadedAsset(CreateInjectedLoadedAsset("./Model_TongcenCourier.glb", "player"));
  const result = await upgradePromise;
  assert.equal(result.ok, true, "validated model should swap successfully");
  assert.equal(rig.group, originalGroup, "public group identity must survive the swap");
  assert.equal(rig.modelLoadState, "loaded");
  assert.equal(rig.loadedModelHost.visible, true);
  assert.equal(rig.fallbackNodes.motionRoot.visible, false);
  assert.notEqual(rig.animator, originalAnimator, "loaded rig should receive its rest-relative animator");
  assert.equal(rig.nodes.muzzleAnchor.name, "Socket_Muzzle");
  assert.ok(Math.abs(rig.loadedModelHost.rotation.y - Math.PI) < 0.0001, "plus-Z GLB should be converted to local minus-Z");
  rig.UseFallback();
  assert.equal(rig.modelLoadState, "fallback");
  assert.equal(rig.nodes, rig.fallbackNodes);
  assert.equal(rig.animator, originalAnimator);
  assert.equal(rig.fallbackNodes.motionRoot.visible, true);
  assert.equal(rig.loadedModelHost.visible, false);
}


async function TestLoadFailureKeepsFallback() {
  const rig = CreateFallbackRig("companion", 0.9);
  const originalNodes = rig.nodes;
  const originalAnimator = rig.animator;
  const originalWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = await UpgradeCharacterRig(THREE, rig, {
      role: "companion",
      loadModel: async () => { throw new Error("synthetic parse failure"); },
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(result.ok, false);
  assert.equal(rig.modelLoadState, "fallback");
  assert.equal(rig.nodes, originalNodes);
  assert.equal(rig.animator, originalAnimator);
  assert.equal(originalNodes.motionRoot.visible, true);
  assert.equal(rig.group.getObjectByName("Model_XiangyunGuideHost"), undefined);
}


const tests = [
  ["GLB walk crouch and injury poses remain finite and readable", TestLocomotionAndStances],
  ["GLB idle walk crouch and sprint have distinct pose envelopes", TestLocomotionSilhouetteEnvelopes],
  ["GLB aim pose aligns hands and an exact local minus-Z muzzle socket", TestAimingAndMuzzleSocket],
  ["companion GLB maps the shared skeleton and sickle prop", TestCompanionSkeleton],
  ["material primitives must share one exact courier skeleton", TestMaterialPrimitivesShareOneCourierSkeleton],
  ["friendly GLB swaps atomically without changing the public rig group", TestSafeAsynchronousSwap],
  ["GLB network or parse failure keeps the procedural fallback", TestLoadFailureKeepsFallback],
];

let passed = 0;
for (const [name, test] of tests) {
  try {
    await test();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`${passed}/${tests.length} character model loader tests passed`);
