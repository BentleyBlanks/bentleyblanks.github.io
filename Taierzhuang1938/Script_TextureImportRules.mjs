// Shared, pure rules for the inspector, local save endpoint and publish importer.
import { TEXTURE_MANIFEST } from "./Data_TextureManifest.mjs";

export const IMPORT_FORMATS = ["source", "webp", "webp-lossless", "png", "jpeg", "ktx2-uastc", "ktx2-etc1s"];
export const IMPORT_SIZES = [0, 64, 128, 256, 512, 1024, 2048, 4096, 8192];
export const IMPORT_DEFAULTS = Object.freeze({ maxSize: 0, format: "source", quality: 85, mipmaps: "inherit" });

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

export function NormalizeImportSettings(input, item) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid texture settings");
  for (const key of Object.keys(input)) if (!(key in IMPORT_DEFAULTS)) throw new Error(`Unknown setting: ${key}`);
  const settings = { ...IMPORT_DEFAULTS, ...input };
  if (!IMPORT_SIZES.includes(settings.maxSize)) throw new Error("Invalid maximum size");
  if (!IMPORT_FORMATS.includes(settings.format)) throw new Error("Invalid compression format");
  if (!Number.isInteger(settings.quality) || settings.quality < 1 || settings.quality > 100) throw new Error("Quality must be 1–100");
  if (!["inherit", true, false].includes(settings.mipmaps)) throw new Error("Invalid mipmap setting");
  if (settings.format.startsWith("ktx2") && !item.gpu) throw new Error(item.restriction);
  if (settings.mipmaps !== "inherit" && !item.sampler) throw new Error(item.restriction);
  if (settings.format === "jpeg" && (item.colorSpace !== "srgb" || !/\.jpe?g$/i.test(item.file))) {
    throw new Error("JPEG only supports existing color JPEGs; alpha and data channels must be preserved");
  }
  return settings;
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

export function ImportDimensions(width, height, maxSize) {
  const ratio = maxSize ? Math.min(1, maxSize / Math.max(width, height)) : 1;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}
