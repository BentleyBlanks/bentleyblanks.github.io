// User Smoke.fbx, reduced by _blender/Script_CigaretteBake.py.
// Metres; mouth at origin, ash toward -Z, 5 mm of paper inside the lips.
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.js";

let pending = null, source = null;
export function LoadCigaretteAsset() {
  return pending ??= new GLTFLoader().loadAsync("./Model/Model_Cigarette.glb?v=20261009LosslessWebp")
    .then(gltf => {
      source = gltf.scene;
      source.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.castShadow = true; mesh.receiveShadow = true;
      });
      return source;
    }).catch(error => { pending = null; throw error; });
}

// The cached source owns geometry/textures; each collection owns its materials.
export function CreateCigaretteAsset(library) {
  if (!source) throw new Error("Cigarette asset must be loaded before collection setup");
  const root = source.clone(true);
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const Bind = material => {
      const copy = material.clone();
      library?.ConfigureExternalPbr(copy, { metalness: 0, minRoughness: 0.75 });
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(Bind) : Bind(mesh.material);
  });
  return root;
}

export function DisposeCigaretteAsset(root) {
  root?.parent?.remove(root);
  root?.traverse(mesh => {
    if (mesh.isMesh)
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
  });
}
