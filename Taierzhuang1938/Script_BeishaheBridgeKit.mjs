// Optional modular asset library. The caller supplies its ManagedGLTFLoader;
// importing this module starts no network request and changes no campaign.
export function CreateBeishaheBridgeKit(manifest, assets) {
  const kinds = ['Span', 'Pier', 'Joint', 'Abutment'];
  if (manifest.schemaVersion !== 1 || manifest.units !== 'm' || manifest.spanPitchM !== 20) throw Error('Unsupported Beishahe module contract');
  function Create(kind, variant = 0) {
    if (!kinds.includes(kind) || !assets[kind]) throw Error(`Beishahe ${kind} is not loaded`);
    if (!Number.isInteger(variant) || variant < 0) throw Error('Variant must be a nonnegative integer');
    const scenes = assets[kind].scenes;
    const index = variant % scenes.length;
    const result = scenes[index].clone(true);
    result.userData = {...result.userData, moduleKind: kind, variantIndex: index, snapPoints: structuredClone(manifest.sockets[kind])};
    return result;
  }
  function Assemble(spanCount = 14) {
    if (!Number.isInteger(spanCount) || spanCount < 1) throw Error('Span count must be a positive integer');
    for (const kind of kinds) if (!assets[kind]) throw Error(`Beishahe ${kind} is required for assembly`);
    const root = assets.Span.scene.clone(false);
    root.name = 'BeishaheBridgeAssembly';
    root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.setScalar(1);
    root.userData = {spanCount, spanPitchM: manifest.spanPitchM, units: manifest.units, appearanceVersion: manifest.appearanceVersion};
    const start = -spanCount * manifest.spanPitchM / 2;
    function Place(kind, variant, z) {const part = Create(kind, variant); part.position.z = z; root.add(part);}
    for (let i = 0; i < spanCount; i++) Place('Span', i, start + (i + .5) * manifest.spanPitchM);
    for (let i = 1; i < spanCount; i++) {const z = start + i * manifest.spanPitchM; Place('Pier', i - 1, z); Place('Joint', i - 1, z);}
    Place('Abutment', 0, start); Place('Abutment', 1, -start);
    return root;
  }
  return {manifest, assets, Create, Assemble};
}

export async function LoadBeishaheBridgeKit(loader, manifestUrl = new URL('./Model/BeishaheBridge/Data_BeishaheBridgeModules.json?v=2026103102', import.meta.url), kinds = ['Span', 'Pier', 'Joint', 'Abutment']) {
  const url = new URL(manifestUrl, import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw Error(`Beishahe manifest HTTP ${response.status}`);
  const manifest = await response.json();
  const assets = Object.fromEntries(await Promise.all(kinds.map(async kind => {
    const entry = manifest.modules[kind];
    if (!entry) throw Error(`Unknown Beishahe module: ${kind}`);
    const assetUrl = new URL(entry.file, url); assetUrl.searchParams.set('v', manifest.version);
    return [kind, await loader.loadAsync(assetUrl.href)];
  })));
  return CreateBeishaheBridgeKit(manifest, assets);
}
