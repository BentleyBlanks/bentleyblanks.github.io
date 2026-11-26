// JSON metadata followed by aligned buffers. Hydration creates typed views over
// the decompressed file, preserving shared buffers and the exact height samples.
const types = {Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array};
const Align = n => Math.ceil(n/8)*8;
export function PackTerrainSnapshot(snapshot) {
  const buffers = [], offsets = new Map();
  let length = 0;
  const meta = JSON.stringify(snapshot, (_, item) => {
    if (!ArrayBuffer.isView(item)) return item;
    if (!Object.hasOwn(types,item.constructor.name)) throw Error("Unsupported terrain array");
    if (!offsets.has(item.buffer)) {
      offsets.set(item.buffer,length);
      buffers.push(new Uint8Array(item.buffer));
      const padding = Align(item.buffer.byteLength)-item.buffer.byteLength;
      if (padding) buffers.push(new Uint8Array(padding));
      length += Align(item.buffer.byteLength);
    }
    return {typed:item.constructor.name, offset:offsets.get(item.buffer)+item.byteOffset, length:item.length};
  });
  const json = new TextEncoder().encode(meta), header = new Uint8Array(Align(8+json.length));
  header.set([84,88,76,49]);
  new DataView(header.buffer).setUint32(4,json.length,true);
  header.set(json,8);
  return [header,...buffers];
}
export function UnpackTerrainSnapshot(buffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0)!==0x54584c31) throw Error("Invalid terrain library header");
  const length=view.getUint32(4,true), start=Align(8+length);
  const data=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,length)),(_,item)=>{
    if(!item?.typed)return item;
    if(!Object.hasOwn(types,item.typed)||!Number.isSafeInteger(item.offset)||item.offset<0||
       !Number.isSafeInteger(item.length)||item.length<0)throw Error("Invalid terrain array");
    return new types[item.typed](buffer,start+item.offset,item.length);
  });
  const validNodes = data?.format === 3 ? !!data.nodeCoords?.length : data?.format === 2 && !!data.nodes?.length;
  if(!validNodes||!data.leafIds?.length)throw Error("Invalid terrain snapshot");
  return data;
}
