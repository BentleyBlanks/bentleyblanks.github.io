// The same recipe runs in the preview importer and in the browser. Paths are
// project-relative so the disk artifact survives a change of port or checkout.
export async function TerrainLibraryKey(scene, bytes, map, focus, readText) {
  const root = new URL("../", import.meta.url);
  const sources = new Map();
  async function Visit(url) {
    const name = url.href.slice(root.href.length);
    if (sources.has(name)) return;
    sources.set(name, "");
    const source = (await readText(url)).replace(/\r\n/g, "\n");
    sources.set(name, source);
    const imports = [...source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)];
    await Promise.all(imports.map(match => match[1] || match[2]).filter(ref => ref.startsWith(".")).map(ref => Visit(new URL(ref,url))));
  }
  await Visit(new URL("./Script_LevelFlowTerrainWorker.mjs", import.meta.url));
  const encode = text => new TextEncoder().encode(text);
  const inputs = [encode(JSON.stringify([...sources].sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0))),
    encode(JSON.stringify([scene,map,focus])), ...bytes];
  const hashes = await Promise.all(inputs.map(input => crypto.subtle.digest("SHA-256",input)));
  const key = await crypto.subtle.digest("SHA-256", Uint8Array.from(hashes.flatMap(hash => [...new Uint8Array(hash)])));
  return [...new Uint8Array(key)].map(byte => byte.toString(16).padStart(2,"0")).join("");
}
