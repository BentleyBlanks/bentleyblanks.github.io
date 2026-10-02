// Publish-only transform. This runs in the git-archive staging directory before bundling.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextureCatalog, ValidateImportDocument, ImportSettingsForPlatform } from "./Script_TextureImportRules.mjs";
import { EncodeTexture, TextureImportHash } from "./Script_TextureImportBuild.mjs";

export async function BuildTextureImports(projectDir, outputDir, document = null) {
  if (path.resolve(projectDir) === path.resolve(outputDir)) throw new Error("Texture publish output must be a separate staging directory");
  const settings = ValidateImportDocument(document || JSON.parse(await fs.readFile(path.join(projectDir, "Data_TextureImportSettings.json"), "utf8")));
  const catalog = new Map(TextureCatalog().map(item => [item.file, item])), runtime = {}, replacements = [], reports = [];
  const basenameCounts = new Map();
  for (const file of catalog.keys()) { const name = path.posix.basename(file); basenameCounts.set(name, (basenameCounts.get(name) || 0) + 1); }
  for (const [file, options] of Object.entries(settings.textures)) {
    const target = path.join(outputDir, "Texture", path.dirname(file));
    const Encode = async platform => {
      const result = await EncodeTexture(projectDir, catalog.get(file), ImportSettingsForPlatform(options, platform), target);
      const Relative = name => name && path.posix.join(path.posix.dirname(file), name);
      reports.push({ file, platform, ...result });
      return { ...result, output: Relative(result.filename), unflipped: Relative(result.unflipped), cpuFile: Relative(result.cpuFile), mipFiles: result.mipFiles?.map(Relative) };
    };
    const entry = await Encode("default"); entry.variants = {};
    for (const platform of Object.keys(options.platforms)) entry.variants[platform] = await Encode(platform);
    runtime[file] = entry; runtime[entry.output] = entry;
    for (const variant of Object.values(entry.variants)) runtime[variant.output] = entry;
    replacements.push([file, entry.output]);
  }
  // Preserve relative URL prefixes and existing query strings. Includes DOM/CSS
  // consumers; the source manifest/settings are kept intact for the inspector.
  const rewrittenStyles = new Map(), textFiles = [];
  const Rewrite = async directory => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (["vendor", "Texture", "Model", "Animation", "Audio", "_import", "docs", "Notes"].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await Rewrite(file); continue; }
      if (!/\.(mjs|js|html|css)$/.test(entry.name) || /^(Data_TextureManifest|Script_Texture|Script_BuildTexture|Script_EditorTextures|TextureManager)/.test(entry.name)) continue;
      textFiles.push(file);
      let text = await fs.readFile(file, "utf8"), next = text;
      for (const [before, after] of replacements) {
        next = next.split(`Texture/${before}`).join(`Texture/${after}`);
        // Boot-paper and similar DOM catalogs store a basename next to a directory.
        const basename = path.posix.basename(before);
        if (basenameCounts.get(basename) === 1) next = next.split(basename).join(path.posix.basename(after));
      }
      if (next !== text) await fs.writeFile(file, next);
      if (next !== text && entry.name.endsWith(".css")) {
        const name = entry.name.replace(/\.css$/, `_Import${TextureImportHash(next).slice(0, 16)}.css`);
        rewrittenStyles.set(entry.name, name);
        await fs.writeFile(path.join(directory, name), next);
      }
    }
  };
  await Rewrite(outputDir);
  // Changed CSS needs a new URL too: otherwise a cached stylesheet keeps asking
  // for the source image despite a new texture import configuration.
  for (const file of textFiles) {
    let source = await fs.readFile(file, "utf8"), next = source;
    for (const [before, after] of rewrittenStyles) next = next.split(before).join(after);
    if (next !== source) await fs.writeFile(file, next);
  }
  await fs.writeFile(path.join(outputDir, "Data_TextureImportRuntime.mjs"), `export const TEXTURE_IMPORT_RUNTIME = ${JSON.stringify(runtime)};\n`);
  await fs.writeFile(path.join(outputDir, "Data_TextureImportReport.json"), JSON.stringify({ version: 1, textures: reports }, null, 2) + "\n");
  return reports;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--output-dir");
  if (i < 0 || !process.argv[i + 1]) throw new Error("Required: --output-dir <staging>/Taierzhuang1938");
  const reports = await BuildTextureImports(path.dirname(fileURLToPath(import.meta.url)), path.resolve(process.argv[i + 1]));
  console.log(JSON.stringify({ imported: reports.length, sourceBytes: reports.reduce((n, r) => n + r.sourceBytes, 0), outputBytes: reports.reduce((n, r) => n + r.bytes, 0) }));
}
