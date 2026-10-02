// Shared, pure rules for the inspector, local save endpoint and publish importer.
import { TEXTURE_MANIFEST } from "./Data_TextureManifest.mjs";

export const IMPORT_FORMATS = ["source", "webp", "webp-lossless", "png", "jpeg", "rgba32", "ktx2-bc1", "ktx2-bc3", "ktx2-bc7", "ktx2-etc2", "ktx2-astc", "ktx2-uastc", "ktx2-etc1s"];
export const IMPORT_SIZES = [0, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384];
export const IMPORT_DEFAULTS = Object.freeze({
  maxSize: 0, format: "source", quality: 85, mipmaps: "inherit",
  textureType: "inherit", colorSpace: "inherit", alphaSource: "input", alphaTransparency: false,
  npot: "none", resizeFilter: "mitchell", swizzle: "rgba", flipGreen: false,
  normalFromHeight: false, normalStrength: 1, normalFilter: "smooth", singleChannel: "r",
  wrapU: "inherit", wrapV: "inherit", filterMode: "inherit", anisotropy: 0,
  mipFilter: "kaiser", mipBorder: false, mipCoverage: false, alphaCutoff: 0.5,
  mipFade: false, mipFadeStart: 1, mipFadeEnd: 3, readWrite: false,
  platforms: Object.freeze({}),
});
export const IMPORT_PLATFORMS = ["desktop", "android", "ios"];
export const PLATFORM_FIELDS = ["maxSize", "format", "quality", "resizeFilter"];
export const IMPORT_ENUMS = {
  textureType: ["inherit", "default", "normal", "gui", "single"], colorSpace: ["inherit", "srgb", "linear"],
  alphaSource: ["input", "none", "grayscale"], npot: ["none", "nearest", "larger", "smaller"],
  resizeFilter: ["mitchell", "lanczos3", "linear", "nearest"], normalFilter: ["smooth", "sharp"], singleChannel: ["r", "g", "b", "a"],
  wrapU: ["inherit", "repeat", "clamp", "mirror"], wrapV: ["inherit", "repeat", "clamp", "mirror"],
  filterMode: ["inherit", "point", "bilinear", "trilinear"], mipFilter: ["box", "kaiser"],
};
export function ImportColorSpace(settings, item) {
  return ["normal", "single"].includes(settings.textureType) ? "linear" : settings.colorSpace === "inherit" ? item.colorSpace : settings.colorSpace;
}

export function TextureCatalog() {
  return TEXTURE_MANIFEST.flatMap(set => set.files.filter(file => /\.(webp|png|jpe?g)$/i.test(file[0])).map(([file, channel, width, height]) => {
    // CPU readers / texture arrays and DOM images require decoded pixels. These
    // still support file compression, but a per-image GPU sampler is not theirs.
    const cpu = set.kind === "terrainLayer" || /^(TrenchRootMat|TrenchMudHeight|OpeningTimber|OpeningCrate|BunkerPoster|RuralHouse)$/.test(set.id)
      || ["hud", "menu", "icon", "print", "bakeInput"].includes(set.kind);
    return { file, channel, width, height, set: set.id, kind: set.kind, tier: set.tier,
      colorSpace: ["Base", "BaseColor", "Atlas", "Image"].includes(channel) ? "srgb" : "linear",
      gpu: !cpu, sampler: !cpu, consumers: set.consumers.map(c => c.file),
      restriction: cpu ? "此图片由界面、CPU 像素处理或纹理数组使用；可设置文件压缩，GPU 压缩与 Mipmap 由消费系统管理。" : "",
    };
  }));
}

export function NormalizeImportSettings(input, item, nested = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid texture settings");
  for (const key of Object.keys(input)) if (!Object.hasOwn(IMPORT_DEFAULTS, key)) throw new Error(`Unknown setting: ${key}`);
  const settings = { ...IMPORT_DEFAULTS, ...input };
  if (!IMPORT_SIZES.includes(settings.maxSize)) throw new Error("Invalid maximum size");
  if (!IMPORT_FORMATS.includes(settings.format)) throw new Error("Invalid compression format");
  if (!Number.isInteger(settings.quality) || settings.quality < 0 || settings.quality > 100) throw new Error("Quality must be 0–100");
  if (!["inherit", true, false].includes(settings.mipmaps)) throw new Error("Invalid mipmap setting");
  for (const [key, values] of Object.entries(IMPORT_ENUMS)) if (!values.includes(settings[key])) throw new Error(`Invalid ${key}`);
  for (const key of ["alphaTransparency", "flipGreen", "normalFromHeight", "mipBorder", "mipCoverage", "mipFade", "readWrite"]) {
    if (typeof settings[key] !== "boolean") throw new Error(`Invalid ${key}`);
  }
  for (const [key, min, max, integer] of [["normalStrength", 0, 10], ["alphaCutoff", 0.01, 0.99], ["anisotropy", 0, 16, true], ["mipFadeStart", 0, 14, true], ["mipFadeEnd", 1, 15, true]]) {
    if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max || integer && !Number.isInteger(settings[key])) throw new Error(`Invalid ${key}`);
  }
  if (settings.mipFadeEnd <= settings.mipFadeStart) throw new Error("Fade end must follow fade start");
  if (!/^[rgbaRGBA01]{4}$/.test(settings.swizzle)) throw new Error("Invalid channel swizzle");
  if (settings.format.startsWith("ktx2") && !item.gpu) throw new Error(item.restriction);
  if (settings.mipmaps !== "inherit" && !item.sampler) throw new Error(item.restriction);
  if (!item.sampler && ["colorSpace", "wrapU", "wrapV", "filterMode", "anisotropy", "mipFilter", "mipBorder", "mipCoverage", "mipFade", "readWrite"].some(key => settings[key] !== IMPORT_DEFAULTS[key])) throw new Error(item.restriction);
  if (settings.format === "ktx2-etc1s" && (settings.mipCoverage || settings.mipFade)) throw new Error("Preserve Coverage / Fadeout require UASTC or an image format");
  if (settings.format === "jpeg" && (item.colorSpace !== "srgb" || !/\.jpe?g$/i.test(item.file))) {
    throw new Error("JPEG only supports existing color JPEGs; alpha and data channels must be preserved");
  }
  if (!settings.platforms || typeof settings.platforms !== "object" || Array.isArray(settings.platforms)) throw new Error("Invalid platform overrides");
  const platforms = {};
  for (const [platform, override] of Object.entries(settings.platforms)) {
    if (nested || !IMPORT_PLATFORMS.includes(platform) || !item.sampler) throw new Error("Platform overrides require a managed 2D texture");
    if (!override || typeof override !== "object" || Object.keys(override).some(key => !PLATFORM_FIELDS.includes(key))) throw new Error("Invalid platform fields");
    const effective = NormalizeImportSettings({ ...settings, ...override, platforms: {} }, item, true);
    platforms[platform] = Object.fromEntries(PLATFORM_FIELDS.map(key => [key, effective[key]]));
  }
  settings.platforms = platforms;
  return settings;
}

export function ImportSettingsForPlatform(settings, platform = "default") {
  return { ...settings, ...settings.platforms?.[platform], platforms: {} };
}

export function ValidateImportDocument(doc, catalog = TextureCatalog()) {
  if (!doc || doc.version !== 1 || !doc.textures || typeof doc.textures !== "object" || Array.isArray(doc.textures)) throw new Error("Invalid importer document");
  const items = new Map(catalog.map(item => [item.file, item])), textures = {};
  for (const [file, settings] of Object.entries(doc.textures)) {
    if (!items.has(file)) throw new Error(`Unknown texture: ${file}`);
    textures[file] = NormalizeImportSettings(settings, items.get(file));
  }
  return { version: 1, textures };
}

export function ImportDimensions(width, height, maxSize, npot = "none") {
  const Power = value => 2 ** Math[{ nearest: "round", larger: "ceil", smaller: "floor" }[npot]](Math.log2(value));
  if (npot !== "none") { width = Power(width); height = Power(height); }
  const ratio = maxSize ? Math.min(1, maxSize / Math.max(width, height)) : 1;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
