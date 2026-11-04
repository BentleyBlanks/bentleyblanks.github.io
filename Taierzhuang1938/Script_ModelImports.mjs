import {GLTFLoader} from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {LoadKtxTexture, ResolvePublishedModelUrl} from './Script_TextureImports.mjs';

// Constructing a model loader never downloads a decoder. Source/developer GLBs
// use ordinary PNG/WebP; only a published KHR_texture_basisu image asks for KTX2.
export class ManagedGLTFLoader extends GLTFLoader {
  constructor(manager) {
    super(manager);
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
