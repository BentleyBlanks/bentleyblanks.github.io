import fs from "node:fs";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const REVISION_KEY = "encounterValidationRevision";

// Node caches every dependency separately. Carry the revision through the whole
// validation graph so an old preview cannot reject a newly supported attachment.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    const revision = context.parentURL && new URL(context.parentURL).searchParams.get(REVISION_KEY);
    if (!revision || !specifier.startsWith(".") || !resolved.url.startsWith("file:")) return resolved;
    const url = new URL(resolved.url);
    url.searchParams.set(REVISION_KEY, revision);
    return { ...resolved, url: url.href };
  },
});

export async function LoadPreviewModules(files) {
  const sources = new Map();
  function Read(file) {
    const url = pathToFileURL(file);
    if (sources.has(url.href)) return;
    const source = fs.readFileSync(file, "utf8");
    sources.set(url.href, source);
    // The local validation modules use static relative imports and re-exports.
    const imports = /\b(?:import|export)\s+(?:[^;"']*?\s+from\s*)?["'](\.{1,2}\/[^"']+)["']/g;
    for (const match of source.matchAll(imports)) Read(fileURLToPath(new URL(match[1], url)));
  }
  for (const file of files) Read(file);
  const hash = createHash("sha256");
  for (const [url, source] of sources) hash.update(url).update(source);
  const revision = hash.digest("hex");
  return Promise.all(files.map(file => {
    const url = pathToFileURL(file);
    url.searchParams.set(REVISION_KEY, revision);
    return import(url.href);
  }));
}
