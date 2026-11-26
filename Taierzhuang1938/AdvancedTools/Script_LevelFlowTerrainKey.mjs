// The same recipe runs in the preview importer and in the browser. Paths are
// project-relative so the disk artifact survives a change of port or checkout.
// Only terrain-affecting fields of scene and map enter the digest so editing
// props, air walls, markers, or script beats never invalidates the terrain cache.
function TerrainSceneSignature(scene) {
  if (!scene || typeof scene !== "object") return scene;
  return {
    id: scene.id,
    bounds: scene.bounds,
    terrain: scene.terrain,
    trenches: scene.trenches,
    craters: scene.craters,
    surface: scene.surface,
    paint: scene.paint,
    backdrop: scene.backdrop,
    ways: scene.ways,
  };
}

function TerrainMapSignature(map) {
  if (!map || typeof map !== "object") return map;
  return {
    bounds: map.bounds,
    roads: map.roads,
    trenches: map.trenches,
    floors: map.floors,
    ramps: map.ramps,
    paint: map.paint,
    fields: map.fields,
    fieldZones: map.fieldZones,
    footpaths: map.footpaths,
    river: map.river,
    planningPockets: map.planningPockets,
  };
}

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
    encode(JSON.stringify([TerrainSceneSignature(scene),TerrainMapSignature(map),focus])), ...bytes];
  const hashes = await Promise.all(inputs.map(input => crypto.subtle.digest("SHA-256",input)));
  const key = await crypto.subtle.digest("SHA-256", Uint8Array.from(hashes.flatMap(hash => [...new Uint8Array(hash)])));
  return [...new Uint8Array(key)].map(byte => byte.toString(16).padStart(2,"0")).join("");
}
