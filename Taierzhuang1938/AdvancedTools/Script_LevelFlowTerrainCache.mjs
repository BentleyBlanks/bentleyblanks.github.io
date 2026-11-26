import {FLOW_RENDERING} from "../Data_Tuning_LevelFlow.mjs";

let database;
const constructors={Float32Array,Float64Array,Int32Array,Uint8Array,Uint32Array};

async function OpenCache() {
  if(typeof indexedDB==="undefined") return null;
  if(!database) database=new Promise(resolve=>{
    const request=indexedDB.open("TengxianEncounterTerrain",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("Prepared");
    request.onsuccess=()=>resolve(request.result);
    request.onerror=request.onblocked=()=>resolve(null);
  });
  return database;
}

export async function ReadTerrainCache(key) {
  const db=await OpenCache();
  if(!db) return null;
  const manifest=await new Promise(resolve=>{
    const request=db.transaction("Prepared","readonly").objectStore("Prepared").get(key);
    request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>resolve(null);
  });
  if(manifest?.kind!=="EncounterTerrainChunks") return null;
  const buffers=manifest.buffers.map(length=>new ArrayBuffer(length));
  const store=db.transaction("Prepared","readonly").objectStore("Prepared");
  const requests=[];
  for(let index=0;index<buffers.length;index++) {
    for(let offset=0;offset<buffers[index].byteLength;offset+=manifest.chunkBytes) {
      requests.push(new Promise(resolve=>{
        const request=store.get(`${key}/Buffer${index}/${offset}`);
        request.onsuccess=()=>{
          if(!(request.result instanceof ArrayBuffer)) return resolve(false);
          new Uint8Array(buffers[index],offset,request.result.byteLength).set(new Uint8Array(request.result));resolve(true);
        };
        request.onerror=()=>resolve(false);
      }));
    }
  }
  if(!(await Promise.all(requests)).every(Boolean)) return null;
  const Decode=value=>{
    if(!value||typeof value!=="object") return value;
    if(value.typed) return new constructors[value.typed](buffers[value.buffer],value.offset,value.length);
    if(Array.isArray(value)) return value.map(Decode);
    return Object.fromEntries(Object.entries(value).map(([name,entry])=>[name,Decode(entry)]));
  };
  return Decode(manifest.value);
}

export async function WriteTerrainCache(key,prepared) {
  const db=await OpenCache();
  if(!db) return false;
  const buffers=[],indices=new Map();
  const Encode=value=>{
    if(!value||typeof value!=="object") return value;
    if(ArrayBuffer.isView(value)) {
      if(!indices.has(value.buffer)) {indices.set(value.buffer,buffers.length);buffers.push(value.buffer);}
      return {typed:value.constructor.name,buffer:indices.get(value.buffer),offset:value.byteOffset,length:value.length};
    }
    if(Array.isArray(value)) return value.map(Encode);
    return Object.fromEntries(Object.entries(value).map(([name,entry])=>[name,Encode(entry)]));
  };
  const value=Encode(prepared),chunkBytes=FLOW_RENDERING.terrainBuild.cacheChunkBytes;
  return new Promise(resolve=>{
    const transaction=db.transaction("Prepared","readwrite"),store=transaction.objectStore("Prepared");
    transaction.oncomplete=()=>resolve(true);transaction.onerror=transaction.onabort=()=>resolve(false);
    const keys=store.getAllKeys();
    keys.onsuccess=()=>{
      const roots=keys.result.filter(entry=>!entry.includes("/")&&entry!==key);
      const remove=roots.slice(0,Math.max(0,roots.length+1-FLOW_RENDERING.terrainBuild.cacheEntries));
      for(const entry of keys.result) if(remove.some(root=>entry===root||entry.startsWith(`${root}/`))) store.delete(entry);
    };
    for(let index=0;index<buffers.length;index++) {
      for(let offset=0;offset<buffers[index].byteLength;offset+=chunkBytes) {
        store.put(buffers[index].slice(offset,offset+chunkBytes),`${key}/Buffer${index}/${offset}`);
      }
    }
    store.put({kind:"EncounterTerrainChunks",value,buffers:buffers.map(buffer=>buffer.byteLength),chunkBytes},key);
  });
}
