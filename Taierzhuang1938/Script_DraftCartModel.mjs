// Shared 1938 rural cart asset for the first-level evacuation and the action editor.
// GLB origin is the cart's ground point. Animal GLBs are authored in the cart's frame
// (so the harness meets the shafts); their rig node's extras carry the stride and the
// distance ahead of the cart, and the model is re-centred on that point here.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { AttachShadowDepth } from "./Script_ShadowDepth.mjs";
import { CloneSkinnedRig } from "./Script_SkinnedClone.mjs";
import { MID_TUNING as MID } from "./Data_Tuning_FirstLevelMid.mjs";

const VERSION = "20260927031500";
const KIND_NAME = Object.freeze({ ox: "Ox", horse: "Horse" });
/**
 * 2026-09-27 起车与牲口各是**一只蒙皮网格、按材质分图元**（_blender/Script_OxCartBake.py
 * 的 BatchForRuntime）：车 5 个 draw、牛 5 个、马 4 个，原来是 28 + 31/36 个分件。
 * 活动节点变成同名骨头（WheelLeft / OxFrontLeftPivot…），Walk 动画照旧按名字绑定。
 * 下面这张表把沿用下来的分件身份映射到合并后承载它的那只网格（按材质名），
 * 一只网格可以承载好几个身份（车板与车栏都是 WeatheredElm）。
 */
const CART_PART_MATERIALS = Object.freeze({
  deck: "WeatheredElm", rail: "WeatheredElm", shaft: "WornWoodEdges",
  wheel: "BlackenedIron", spoke: "WornWoodEdges",
});
const ANIMAL_COAT = Object.freeze({ ox: "OxBrownCoat", horse: "HorseBayCoat" });
/** 蒙皮网格的剔除球按绑定姿势算，再放宽这么多：走路时腿、头、尾最多甩出这点距离。 */
const SKIN_CULL_PAD_M = .45;
const loader = new GLTFLoader();
let assetsPromise = null;

// Blender 导出的关键帧从第 1 帧 = 1/30 s 起，three 会把 0..1/30 s 夹在首帧上、循环长度
// 也就成了 1.033 s —— 落地的蹄子因此比车慢 21%，看着在打滑。挪到 0 起，一圈正好 1 s。
function ZeroBasedClip(clip) {
  const start = Math.min(...clip.tracks.map((track) => track.times[0]));
  // GLTFLoader 让同一个采样输入的所有轨道共用一条 times 数组，按数组去重只挪一次。
  const shifted = new Set();
  for (const track of clip.tracks) {
    if (start <= 0 || shifted.has(track.times)) continue;
    shifted.add(track.times);
    for (let index = 0; index < track.times.length; index++) track.times[index] -= start;
  }
  clip.resetDuration();
  return clip;
}

function DraftGait(gltf, kind) {
  let extras = null;
  gltf.scene.traverse((object) => { if (!extras && object.userData.strideM !== undefined) extras = object.userData; });
  const { strideM, teamOffsetM } = extras || {};
  if (!(strideM > 0)) throw new Error(`Draft cart ${kind} is missing its strideM extra`);
  // 模型是按这个距离贴着车辕建的；游戏也按 MID.draft.teamOffsetM 把牲口挂在车前。
  if (Math.abs(teamOffsetM - MID.draft.teamOffsetM) > 1e-6)
    throw new Error(`Draft cart ${kind} was baked ${teamOffsetM} m ahead, game hangs it ${MID.draft.teamOffsetM} m`);
  return { strideM, teamOffsetM };
}

export function LoadDraftCartAssets() {
  if (!assetsPromise) assetsPromise = Promise.all([
    loader.loadAsync(`./Model/OxCart/Model_WoodenEvacCart.glb?v=${VERSION}`),
    loader.loadAsync(`./Model/OxCart/Model_WorkingOx.glb?v=${VERSION}`),
    loader.loadAsync(`./Model/OxCart/Model_WorkingHorse.glb?v=${VERSION}`),
  ]).then(([cart, ox, horse]) => {
    for (const [kind, gltf] of [["ox", ox], ["horse", horse]]) {
      const walk = gltf.animations.find((clip) => clip.name === `${KIND_NAME[kind]}Walk`);
      if (!walk) throw new Error(`Draft cart ${kind} is missing its Walk animation`);
      ZeroBasedClip(walk);
      gltf.userData.draftGait = DraftGait(gltf, kind);
    }
    return { cart, ox, horse };
  }).catch((error) => { assetsPromise = null; throw error; });
  return assetsPromise;
}

function MeshByMaterial(root, name) {
  let found = null;
  root.traverse((object) => {
    if (!found && object.isMesh && object.material?.name === name) found = object;
  });
  return found;
}

export function CreateDraftCartInstance(assets, kind) {
  const source = kind === "ox" ? assets.ox : assets.horse;
  const { strideM, teamOffsetM } = source.userData.draftGait;
  const root = new THREE.Group();
  root.name = `DraftCart_${kind}`;
  const cartRoot = new THREE.Group();
  const animalRoot = new THREE.Group();
  const cartModel = CloneSkinnedRig(assets.cart.scene);
  const animalModel = CloneSkinnedRig(source.scene);
  cartModel.position.y = -1; // cartRoot pivots at axle/deck height for overturning.
  animalModel.position.z = teamOffsetM; // Blender +Y = glTF -Z: the torso lands on animalRoot.
  cartRoot.add(cartModel);
  animalRoot.add(animalModel);
  root.add(cartRoot, animalRoot);
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    // 视锥剔除必须开着：车队从 01 起就停在两三百米外，关掉剔除时每辆车的每个分件
    // 在阴影两级、预通道、主场景里每帧全画，实测占全帧 draw 的 55–70%（2026-09-27）。
    // three 给 SkinnedMesh 的剔除球是第一次剔除那一刻的姿势算的；这里预先按绑定姿势
    // 算好并放宽，腿和头怎么甩都不会被误剔。
    if (object.isSkinnedMesh) {
      object.geometry.computeBoundingSphere();
      object.boundingSphere = object.geometry.boundingSphere.clone();
      object.boundingSphere.radius += SKIN_CULL_PAD_M;
    }
    AttachShadowDepth(object);
  });
  const wheels = [cartModel.getObjectByName("WheelLeft"), cartModel.getObjectByName("WheelRight")];
  if (wheels.some((wheel) => !wheel)) throw new Error("Draft cart is missing a wheel pivot");
  const mixer = new THREE.AnimationMixer(animalModel);
  const clip = source.animations.find((entry) => entry.name === `${KIND_NAME[kind]}Walk`);
  mixer.clipAction(clip).play();
  let lastTravelM = 0;
  const coat = MeshByMaterial(animalModel, ANIMAL_COAT[kind === "ox" ? "ox" : "horse"]);
  const parts = {
    ...Object.fromEntries(Object.entries(CART_PART_MATERIALS)
      .map(([identity, material]) => [identity, MeshByMaterial(cartModel, material)])),
    draftBody: coat, draftHead: coat, draftLimb: coat,
  };
  for (const [name, mesh] of Object.entries(parts))
    if (!mesh) throw new Error(`Draft cart is missing ${name} geometry`);
  return {
    root, cartRoot, animalRoot, parts, teamOffsetM,
    SetMotion(distanceM, moving) {
      if (moving) lastTravelM = Math.max(0, distanceM);
      for (const wheel of wheels) wheel.rotation.x = -lastTravelM / .72;
      // 一秒的 Walk 循环 = 走一个步幅；落地的蹄子正好按车速往后退，不滑步。
      mixer.setTime(lastTravelM / strideM);
    },
    Dispose() { mixer.stopAllAction(); root.removeFromParent(); },
  };
}

export class DraftCartModels {
  constructor(root) {
    this.root = root;
    this.instances = new Map();
    this.assets = null;
    this.disposed = false;
    this.error = null;
    LoadDraftCartAssets().then((assets) => {
      if (!this.disposed) this.assets = assets;
    }).catch((error) => {
      if (!this.disposed) { this.error = error; console.error("Draft cart assets failed", error); }
    });
  }
  get ready() { return !!this.assets; }
  Begin() { for (const instance of this.instances.values()) instance.root.visible = false; }
  Sync(cart, ground, animal, stableParts = null) {
    if (!this.assets) return;
    let instance = this.instances.get(cart.id);
    if (!instance) {
      instance = CreateDraftCartInstance(this.assets, cart.draft === "ox" ? "ox" : "horse");
      this.instances.set(cart.id, instance);
      this.root.add(instance.root);
    }
    // 一只合并网格承载好几个身份时，userData 记它承载的第一个；身份全集看 stableParts 的键。
    if (stableParts) for (const [identity, mesh] of Object.entries(instance.parts)) {
      if (mesh.userData.missionCartPart?.cartId !== cart.id) mesh.userData.missionCartPart = { cartId: cart.id, identity };
      stableParts.set(`${cart.id}:${identity}`, mesh);
    }
    instance.root.visible = true;
    for (const mesh of Object.values(instance.parts)) mesh.visible = true;
    // bump*：压过尸体的颠簸（Script_CartCorpseBump 写在 cart 上；编辑器里的车没有就是 0）。
    instance.cartRoot.position.set(cart.x, ground + 1 + (cart.overturned ? 0 : cart.bumpHeave || 0), cart.z);
    instance.cartRoot.rotation.set(cart.overturned ? 0 : cart.bumpPitch || 0, cart.yaw,
      cart.overturned ? 1.1 : cart.bumpRoll || 0, "YXZ");
    instance.animalRoot.position.set(animal.x, animal.ground, animal.z);
    instance.animalRoot.rotation.set(0, animal.yaw, 0);
    instance.animalRoot.visible = animal.visible;
    instance.SetMotion(animal.travel, animal.moving);
  }
  Dispose() {
    this.disposed = true;
    for (const instance of this.instances.values()) instance.Dispose();
    this.instances.clear();
  }
}
