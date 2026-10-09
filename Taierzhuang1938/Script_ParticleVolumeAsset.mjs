// TVOL is a baked 3D density/flames sequence, not an image sprite sheet.
// Source provenance and deterministic conversion: _import/Script_ParticleVolumeBake.py.
export function ParseParticleVolume(bytes) {
  if(!(bytes instanceof Uint8Array)||bytes.length<12)throw new Error('Truncated particle volume');
  if(new TextDecoder().decode(bytes.subarray(0,4))!=='TVOL')throw new Error('Invalid particle volume magic');
  const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(4,true);
  if(length>65536||length+8>bytes.length)throw new Error('Invalid particle volume header length');
  const metadata=JSON.parse(new TextDecoder().decode(bytes.subarray(8,8+length)));
  if(metadata.version!==1||metadata.encoding!=='sqrt-unorm8')throw new Error('Unsupported particle volume encoding');
  for(const key of ['dimensions','atlasTiles'])if(!Array.isArray(metadata[key])||metadata[key].length!==3||metadata[key].some(n=>!Number.isInteger(n)||n<1||n>256))throw new Error('Invalid volume '+key);
  const size=metadata.dimensions.map((n,i)=>n*metadata.atlasTiles[i]);
  if(size.some(n=>n>2048)||![1,2].includes(metadata.channels)||!Number.isInteger(metadata.frames)||metadata.frames<2||metadata.frames>256||!Number.isFinite(metadata.duration)||metadata.duration<=0)throw new Error('Invalid particle volume dimensions');
  if(metadata.frames>metadata.atlasTiles.reduce((a,b)=>a*b,1))throw new Error('Insufficient volume frame tiles');
  const payload=bytes.subarray(8+length),expected=size.reduce((a,b)=>a*b,metadata.channels);
  if(expected!==payload.length||expected>192*1024*1024)throw new Error('Particle volume payload size mismatch');
  return {metadata,size,data:payload};
}
export async function LoadParticleVolume(url) {
  const response=await fetch(url);if(!response.ok)throw new Error('Particle volume download failed: '+response.status);
  let bytes=new Uint8Array(await response.arrayBuffer());
  // Some static hosts decode .gz responses themselves; accept either transport.
  if(bytes[0]===31&&bytes[1]===139)bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  return ParseParticleVolume(bytes);
}
