// Shared 1938 rural cart asset for the first-level evacuation and the action editor.
// GLB origin is the cart's ground point; animal GLBs are recentered around their torso.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { AttachShadowDepth } from "./Script_ShadowDepth.mjs";

const VERSION = "20260924064217";
const loader = new GLTFLoader();
let assetsPromise = null;

export function LoadDraftCartAssets() {
  if (!assetsPromise) assetsPromise = Promise.all([
    loader.loadAsync(`./Model/OxCart/Model_WoodenEvacCart.glb?v=${VERSION}`),
    loader.loadAsync(`./Model/OxCart/Model_WorkingOx.glb?v=${VERSION}`),
    loader.loadAsync(`./Model/OxCart/Model_WorkingHorse.glb?v=${VERSION}`),
  ]).then(([cart, ox, horse]) => {
    for (const [kind, gltf] of [["ox", ox], ["horse", horse]]) {
      if (!gltf.animations.some((clip) => clip.name === `${kind === "ox" ? "Ox" : "Horse"}Walk`))
        throw new Error(`Draft cart ${kind} is missing its Walk animation`);
    }
    return { cart, ox, horse };
  }).catch((error) => { assetsPromise = null; throw error; });
  return assetsPromise;
}

function MeshByPrefix(root, prefix) {
  let found = null;
  root.traverse((object) => {
    if (!found && object.isMesh && object.name.startsWith(prefix)) found = object;
  });
  return found;
}

export function CreateDraftCartInstance(assets, kind) {
  const source = kind === "ox" ? assets.ox : assets.horse;
  const root = new THREE.Group();
  root.name = `DraftCart_${kind}`;
  const cartRoot = new THREE.Group();
  const animalRoot = new THREE.Group();
  const cartModel = assets.cart.scene.clone(true);
  const animalModel = source.scene.clone(true);
  cartModel.position.y = -1; // cartRoot pivots at axle/deck height for overturning.
  animalModel.position.z = 4.15; // asset torso was authored at Blender Y=4.15.
  cartRoot.add(cartModel);
  animalRoot.add(animalModel);
  root.add(cartRoot, animalRoot);
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
    AttachShadowDepth(object);
  });
  const wheels = [cartModel.getObjectByName("WheelLeft"), cartModel.getObjectByName("WheelRight")];
  if (wheels.some((wheel) => !wheel)) throw new Error("Draft cart is missing a wheel pivot");
  const mixer = new THREE.AnimationMixer(animalModel);
  const clip = source.animations.find((entry) => entry.name === `${kind === "ox" ? "Ox" : "Horse"}Walk`);
  mixer.clipAction(clip).play();
  const parts = {
    deck: MeshByPrefix(cartModel, "CartDeckSurface"),
    rail: MeshByPrefix(cartModel, "CartRailWeatheredElm"),
    shaft: MeshByPrefix(cartModel, "CartShaftWornWoodEdges"),
    wheel: MeshByPrefix(cartModel, "CartRimForgedWheelTire"),
    spoke: MeshByPrefix(cartModel, "CartSpokes"),
    draftBody: MeshByPrefix(animalModel, `${kind === "ox" ? "Ox" : "Horse"}Body`),
    draftHead: MeshByPrefix(animalModel, kind === "ox" ? "OxHeadOxBrownCoat" : "HorseHeadHorseBayCoat"),
    draftLimb: MeshByPrefix(animalModel, kind === "ox" ? "OxLegOxBrownCoat" : "HorseLegHorseBayCoat"),
  };
  for (const [name, mesh] of Object.entries(parts))
    if (!mesh) throw new Error(`Draft cart is missing ${name} geometry`);
  return {
    root, cartRoot, animalRoot, parts,
    SetMotion(distanceM, moving) {
      const travel = moving ? Math.max(0, distanceM) : 0;
      for (const wheel of wheels) wheel.rotation.x = -travel / .72;
      mixer.setTime(moving ? travel / .95 : 0);
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
    if (stableParts) for (const [identity, mesh] of Object.entries(instance.parts)) {
      mesh.userData.missionCartPart = { cartId: cart.id, identity };
      stableParts.set(`${cart.id}:${identity}`, mesh);
    }
    instance.root.visible = true;
    for (const mesh of Object.values(instance.parts)) mesh.visible = true;
    instance.cartRoot.position.set(cart.x, ground + 1, cart.z);
    instance.cartRoot.rotation.set(0, cart.yaw, cart.overturned ? 1.1 : 0, "YXZ");
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
