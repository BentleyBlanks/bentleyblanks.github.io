import {GLTFLoader} from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {LoadKtxTexture, ResolvePublishedModelUrl} from './Script_TextureImports.mjs';

// Constructing a model loader never downloads a decoder. Source/developer GLBs
// use ordinary PNG/WebP; only a published KHR_texture_basisu image asks for KTX2.
export class ManagedGLTFLoader extends GLTFLoader {
  constructor(manager) {
    super(manager);
    // The campaign and Mixamo rigs share the exact same material and texture payload.
    // Keep the cache on this loader so a preview or a separate game session owns its resources.
    const appearanceMaterials = new Map();
    this.register(parser => ({
      name: 'TengxianCharacterAppearance',
      afterRoot: async gltf => {
        const source = parser.json.extras?.appearanceMaterial;
        if (!source) return;
        const url = parser.options.path + source.file;
        let promise = appearanceMaterials.get(url);
        if (!promise) {
          promise = this.loadAsync(url).then(appearance => {
            const materials = new Map();
            appearance.scene.traverse(node => {
              if (!node.isMesh) return;
              for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.set(material.name, material);
              node.geometry.dispose();
            });
            return materials;
          }).catch(error => { appearanceMaterials.delete(url); throw error; });
          appearanceMaterials.set(url, promise);
        }
        const material = (await promise).get(source.material);
        if (!material) throw Error(`Missing character material ${source.material} in ${url}`);
        const replaced = new Set();
        gltf.scene.traverse(node => {
          if (node.isMesh && node.material.name === source.material) {
            replaced.add(node.material);
            node.material = material;
          }
        });
        if (!replaced.size) throw Error(`Missing character surface ${source.material}`);
        for (const placeholder of replaced) placeholder.dispose();
      },
    }));

    this.setKTX2Loader({load(url, onLoad, _onProgress, onError) {
      LoadKtxTexture(url).then(onLoad, onError);
    }});
    this.register(parser=>({
      name:'KHR_texture_basisu',
      loadTexture(index) {
        const source=parser.json.textures[index].extensions?.KHR_texture_basisu?.source;
        if(source===undefined)return null;
        const format=parser.json.images[source].extras?.publicationFormat||'ktx2-uastc';
        return parser.loadTextureImage(index,source,{load(url,onLoad,_progress,onError){LoadKtxTexture(url,format).then(onLoad,onError);}});
      },
    }));
  }
  load(url, onLoad, onProgress, onError) {
    return super.load(ResolvePublishedModelUrl(url), onLoad, onProgress, onError);
  }
}
