import * as THREE from "three";
import { TEXTURE_IMPORT_RUNTIME } from "./Data_TextureImportRuntime.mjs";
import { ASSET_PUBLISH_RUNTIME } from "./Data_AssetPublishRuntime.mjs";
import { MOBILE_ASSET_RUNTIME } from "./Data_MobileAssetRuntime.mjs";

let renderer, ktxPromise, mobileAssets = null;
export function SetTextureImportRenderer(value) {
  renderer = value;
  mobileAssets = null;
  THREE.DefaultLoadingManager.setURLModifier((url) => ResolveTextureImportUrl(url));
}
export function ResolveTextureImportUrl(url, entry = TextureImportOf(url)) {
  return entry?.output ? String(url).replace(/Texture\/[^?#]+/, `Texture/${entry.output}`) : url;
}

/**
 * 手机版贴图与模型（Data_MobileAssetRuntime，Pages 发布时生成：1024 + ASTC 6×6 / 法线 4×4）用不用：
 * 手机 / 平板（iPhone、iPad、安卓）并且这块显卡认 ASTC 才用；?mobileAssets=0 强制不用，=1 只要显卡认 ASTC 就用（电脑上对比看）。
 * 要等渲染器交过来才判断（之前加载的照旧走电脑版），判一次就记住。
 */
export function MobileAssetsActive() {
  if (mobileAssets !== null) return mobileAssets;
  if (!renderer) return false;
  let forced = null;
  try { forced = new URLSearchParams(globalThis.location?.search || "").get("mobileAssets"); } catch { forced = null; }
  const astc = !!renderer.extensions?.has?.("WEBGL_compressed_texture_astc");
  if (forced === "0") return (mobileAssets = false);
  if (forced === "1") return (mobileAssets = astc);
  const agent = globalThis.navigator?.userAgent || "";
  const handheld = /android/i.test(agent) || /iPad|iPhone|iPod/.test(agent) || (/Mac/.test(agent) && (globalThis.navigator?.maxTouchPoints || 0) > 1);
  return (mobileAssets = handheld && astc);
}

/** 手机版贴图条目（只给本模块的 ManagedTextureLoader 用；全局 URL 改写不走它，别处直接读图的代码拿到的仍是原图）。 */
export function MobileTextureImportOf(url, desktop = TextureImportOf(url)) {
  if (!MobileAssetsActive()) return null;
  const pathname = String(url).split(/[?#]/)[0];
  const key = pathname.slice(pathname.lastIndexOf("/Texture/") + 9).replace(/^\.\/Texture\//, "");
  const row = MOBILE_ASSET_RUNTIME.textures[key];
  if (!row || desktop?.readWrite || desktop?.cpuFile) return null;
  // 采样设置（包裹、过滤、各向异性）沿用电脑版的导入配置；尺寸、格式、mip 由手机版文件自带
  const { wrapU, wrapV, filterMode, anisotropy } = desktop || {};
  return { format: "ktx2-astc-mobile", output: row[0], unflipped: row[1], colorSpace: row[2] === "s" ? "srgb" : "linear",
    mipmaps: "inherit", wrapU, wrapV, filterMode, anisotropy, mobile: true };
}

export function ResolvePublishedModelUrl(url) {
  const match = String(url).match(/(^|\/)(Model\/[^?#]+)/);
  const output = match && ((MobileAssetsActive() && MOBILE_ASSET_RUNTIME.models[match[2]]) || ASSET_PUBLISH_RUNTIME[match[2]]);
  return output ? String(url).replace(match[2], output) : url;
}
export function TextureImportOf(url) {
  const pathname = String(url).split(/[?#]/)[0];
  const entry = TEXTURE_IMPORT_RUNTIME[pathname.slice(pathname.lastIndexOf("/Texture/") + 9)]
    || TEXTURE_IMPORT_RUNTIME[pathname.replace(/^\.\/Texture\//, "")];
  return SelectTextureImportVariant(entry);
}
export function SelectTextureImportVariant(entry, platform) {
  const agent = globalThis.navigator?.userAgent || "";
  platform ??= /android/i.test(agent) ? "android" : /iPad|iPhone|iPod/.test(agent) || /Mac/.test(agent) && navigator.maxTouchPoints > 1 ? "ios" : "desktop";
  return entry?.variants?.[platform] || entry;
}
export function ApplyTextureImport(texture, entry, device = renderer) {
  if (!entry) return texture;
  const wrapping = { repeat: THREE.RepeatWrapping, clamp: THREE.ClampToEdgeWrapping, mirror: THREE.MirroredRepeatWrapping };
  if (wrapping[entry.wrapU]) texture.wrapS = wrapping[entry.wrapU];
  if (wrapping[entry.wrapV]) texture.wrapT = wrapping[entry.wrapV];
  if (entry.colorSpace === "srgb" || entry.colorSpace === "linear") texture.colorSpace = entry.colorSpace === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (entry.anisotropy) texture.anisotropy = Math.min(entry.anisotropy, device?.capabilities.getMaxAnisotropy() || 1);
  if (entry.mipmaps !== "inherit") {
    texture.generateMipmaps = !texture.isCompressedTexture && !entry.mipFiles?.length && entry.mipmaps;
    texture.minFilter = entry.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  }
  const hasMips = entry.mipmaps !== false && (texture.mipmaps.length > 1 || texture.generateMipmaps);
  if (entry.filterMode === "point") { texture.magFilter = THREE.NearestFilter; texture.minFilter = hasMips ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter; }
  if (entry.filterMode === "bilinear") { texture.magFilter = THREE.LinearFilter; texture.minFilter = hasMips ? THREE.LinearMipmapNearestFilter : THREE.LinearFilter; }
  if (entry.filterMode === "trilinear") { texture.magFilter = THREE.LinearFilter; texture.minFilter = hasMips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; }
  if (texture.isCompressedTexture && texture.mipmaps.length <= 1 && entry.filterMode !== "point") texture.minFilter = THREE.LinearFilter;
  return texture;
}
export function ImportedSidecarUrl(url, filename) {
  const absolute = new URL(url, globalThis.location?.href || import.meta.url);
  absolute.pathname = absolute.pathname.includes("/Texture/") ? absolute.pathname.replace(/Texture\/.*$/, `Texture/${filename}`) : absolute.pathname.replace(/[^/]+$/, filename.split("/").at(-1));
  absolute.search = ""; return absolute.href;
}
export async function PrepareImportedTexture(texture, entry, url, sourceFlipY = texture.flipY) {
  if (!entry) return texture;
  if (entry.mipFiles?.length && !texture.isCompressedTexture) {
    texture.mipmaps = [texture.image, ...await Promise.all(entry.mipFiles.map(file => new THREE.ImageLoader().loadAsync(ImportedSidecarUrl(url, file))))];
    texture.generateMipmaps = false;
  }
  if (entry.readWrite && entry.cpuFile) {
    const response = await fetch(ImportedSidecarUrl(url, entry.cpuFile));
    if (!response.ok) throw new Error(`Texture CPU data HTTP ${response.status}`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length !== entry.width * entry.height * 4) throw new Error("Invalid readable texture size");
    texture.userData.importPixels = { data, width: entry.width, height: entry.height, sourceFlipY, mipmaps: entry.mipmaps };
  }
  return ApplyTextureImport(texture, entry);
}
export function ReadImportedTexture(texture) {
  const pixels = texture.userData.importPixels;
  if (!pixels) throw new Error("Enable Read/Write in the texture importer first");
  return { width: pixels.width, height: pixels.height, data: new Uint8Array(pixels.data) };
}
export function WriteImportedTexture(texture, data) {
  const pixels = texture.userData.importPixels;
  if (!pixels || data.length !== pixels.data.length) throw new Error("Read/Write disabled or pixel dimensions differ");
  pixels.data.set(data);
  const upload = new Uint8Array(data), stride = pixels.width * 4;
  if (pixels.sourceFlipY) for (let y = 0; y < pixels.height; y++) upload.set(data.subarray(y * stride, (y + 1) * stride), (pixels.height - y - 1) * stride);
  texture.isCompressedTexture = false; texture.isDataTexture = true;
  texture.image = { data: upload, width: pixels.width, height: pixels.height }; texture.mipmaps = [];
  texture.format = THREE.RGBAFormat; texture.type = THREE.UnsignedByteType; texture.flipY = false;
  texture.generateMipmaps = pixels.mipmaps !== false; texture.needsUpdate = true;
}
export async function LoadKtxTexture(url, format = "ktx2-uastc") {
  if (!renderer) throw new Error("Texture importer needs a renderer before GPU texture loading");
  ktxPromise ??= import("./vendor/three/examples/jsm/loaders/KTX2Loader.js").then(({ KTX2Loader }) =>
    new KTX2Loader().setTranscoderPath(new URL("./vendor/three/examples/jsm/libs/basis/", import.meta.url).href)
      .setWorkerLimit(2).detectSupport(renderer));
  const loader = await ktxPromise;
  // UASTC auto mode uses ASTC/BC7 or RGBA. Do not silently degrade normal/ORM data
  // to ETC1/DXT1 on older devices. Explicit importer target choices stay available.
  const gpuFormat = format === "ktx2-uastc" ? "high-quality" : format === "ktx2-etc1s" ? "color-compact" : format.slice(5);
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject, { gpuFormat }));
}

// Native loading remains unchanged when there is no publish override. Properties
// assigned by consumers immediately after load() survive asynchronous GPU upload.
export class ManagedTextureLoader extends THREE.TextureLoader {
  constructor(manager, { flipY = true } = {}) { super(manager); this.importFlipY = flipY; }
  load(url, onLoad, onProgress, onError) {
    const desktop = TextureImportOf(url), entry = MobileTextureImportOf(url, desktop) || desktop;
    url = ResolveTextureImportUrl(url, entry);
    if (!entry?.format.startsWith("ktx2")) return super.load(url, texture => {
      PrepareImportedTexture(texture, entry, url, this.importFlipY).then(() => { onLoad?.(texture); ApplyTextureImport(texture, entry); texture.needsUpdate = true; }).catch(error => onError ? onError(error) : console.error(error));
    }, onProgress, onError);
    const texture = new THREE.CompressedTexture();
    texture.flipY = false;
    const sourceUrl = this.importFlipY ? url : url.replace(/Texture\/[^?]+/, `Texture/${entry.unflipped}`);
    LoadKtxTexture(sourceUrl, entry.format).then(async loaded => {
      texture.image = loaded.image; texture.mipmaps = loaded.mipmaps;
      texture.format = loaded.format; texture.type = loaded.type;
      texture.colorSpace = entry.colorSpace === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      // Images are encoded flipped for ordinary TextureLoader's flipY=true UVs.
      texture.flipY = false; texture.generateMipmaps = false;
      texture.minFilter = loaded.minFilter;
      await PrepareImportedTexture(texture, entry, url, this.importFlipY);
      onLoad?.(texture); texture.flipY = false;
      ApplyTextureImport(texture, entry); texture.needsUpdate = true;
    }).catch(error => onError ? onError(error) : console.error(error));
    return texture;
  }
}
