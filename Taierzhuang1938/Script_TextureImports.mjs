import * as THREE from "three";
import { TEXTURE_IMPORT_RUNTIME } from "./Data_TextureImportRuntime.mjs";

let renderer, ktxPromise;
export function SetTextureImportRenderer(value) {
  renderer = value;
  THREE.DefaultLoadingManager.setURLModifier(ResolveTextureImportUrl);
}
export function ResolveTextureImportUrl(url) {
  const entry = TextureImportOf(url);
  return entry?.output ? String(url).replace(/Texture\/[^?#]+/, `Texture/${entry.output}`) : url;
}
export function TextureImportOf(url) {
  const pathname = String(url).split(/[?#]/)[0];
  return TEXTURE_IMPORT_RUNTIME[pathname.slice(pathname.lastIndexOf("/Texture/") + 9)]
    || TEXTURE_IMPORT_RUNTIME[pathname.replace(/^\.\/Texture\//, "")];
}
export function ApplyTextureImport(texture, entry) {
  if (!entry) return texture;
  if (entry.mipmaps !== "inherit") {
    texture.generateMipmaps = !texture.isCompressedTexture && entry.mipmaps;
    texture.minFilter = entry.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  }
  if (texture.isCompressedTexture && texture.mipmaps.length <= 1) texture.minFilter = THREE.LinearFilter;
  return texture;
}
export async function LoadKtxTexture(url) {
  if (!renderer) throw new Error("Texture importer needs a renderer before GPU texture loading");
  ktxPromise ??= import("./vendor/three/examples/jsm/loaders/KTX2Loader.js").then(({ KTX2Loader }) =>
    new KTX2Loader().setTranscoderPath(new URL("./vendor/three/examples/jsm/libs/basis/", import.meta.url).href)
      .setWorkerLimit(2).detectSupport(renderer));
  return (await ktxPromise).loadAsync(url);
}

// Native loading remains unchanged when there is no publish override. Properties
// assigned by consumers immediately after load() survive asynchronous GPU upload.
export class ManagedTextureLoader extends THREE.TextureLoader {
  constructor(manager, { flipY = true } = {}) { super(manager); this.importFlipY = flipY; }
  load(url, onLoad, onProgress, onError) {
    const entry = TextureImportOf(url);
    url = ResolveTextureImportUrl(url);
    if (!entry?.format.startsWith("ktx2")) return super.load(url, texture => {
      onLoad?.(texture); ApplyTextureImport(texture, entry);
    }, onProgress, onError);
    const texture = new THREE.CompressedTexture();
    texture.flipY = false;
    const sourceUrl = this.importFlipY ? url : url.replace(/Texture\/[^?]+/, `Texture/${entry.unflipped}`);
    LoadKtxTexture(sourceUrl).then(loaded => {
      texture.image = loaded.image; texture.mipmaps = loaded.mipmaps;
      texture.format = loaded.format; texture.type = loaded.type;
      texture.colorSpace = entry.colorSpace === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      // Images are encoded flipped for ordinary TextureLoader's flipY=true UVs.
      texture.flipY = false; texture.generateMipmaps = false;
      texture.minFilter = loaded.minFilter;
      onLoad?.(texture); texture.flipY = false;
      ApplyTextureImport(texture, entry); texture.needsUpdate = true;
    }).catch(error => onError ? onError(error) : console.error(error));
    return texture;
  }
}
