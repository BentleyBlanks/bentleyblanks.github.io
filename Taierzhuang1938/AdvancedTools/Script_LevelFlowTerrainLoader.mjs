import {BuildEncounterTerrain} from "./Script_LevelFlowTerrain.mjs";
import {ReadTerrainCache} from "./Script_LevelFlowTerrainCache.mjs";

async function SourceIdentity(root) {
  const sources=new Map();
  const Read=async url=>{
    if(sources.has(url.href)) return;
    sources.set(url.href,"");
    const response=await fetch(url,{cache:"no-store"});
    if(!response.ok) throw new Error(`Terrain source ${response.status}`);
    const source=await response.text();sources.set(url.href,source);
    const references=[...source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g)]
      .map(match=>match[1]||match[2]).filter(reference=>reference.startsWith("."));
    await Promise.all(references.map(reference=>Read(new URL(reference,url))));
  };
  await Read(root);
  return JSON.stringify([...sources].sort(([a],[b])=>a.localeCompare(b)));
}

async function CacheKey(scene,bytes,map,workerUrl) {
  const encoder=new TextEncoder();
  const inputs=[encoder.encode(await SourceIdentity(workerUrl)),encoder.encode(JSON.stringify([scene,map])),...bytes];
  const hashes=await Promise.all(inputs.map(input=>crypto.subtle.digest("SHA-256",input)));
  return hashes.map(hash=>[...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,"0")).join("")).join("-");
}

export async function PrepareEncounterTerrain(scene,bytes,map,{focus=[0,0]}={}) {
  const started=performance.now(),workerUrl=new URL("./Script_LevelFlowTerrainWorker.mjs",import.meta.url);
  let key=null,prepared=null,source="worker",buildMs=0,cached=false;
  if(typeof Worker!=="undefined") {
    try {key=await CacheKey(scene,bytes,map,workerUrl);prepared=await ReadTerrainCache(key);} catch(error) {
      console.warn("[EncounterTerrain] Cache unavailable",error.message);
    }
    if(prepared?.format===2) {source="cache";cached=true;}
    else {
      prepared=null;
      try {
        const result=await new Promise((resolve,reject)=>{
          const worker=new Worker(workerUrl,{type:"module"});
          worker.onmessage=({data})=>{worker.terminate();data.error?reject(new Error(data.error)):resolve(data);};
          worker.onerror=error=>{worker.terminate();reject(new Error(error.message));};
          const heights=bytes[0].slice(0),datum=bytes[1]?.slice(0)||null;
          try {worker.postMessage({scene,map,heights,datum,focus,key},datum?[heights,datum]:[heights]);}
          catch(error) {worker.terminate();reject(error);}
        });
        prepared=result.prepared;buildMs=result.buildMs;cached=result.cached;
      } catch(error) {console.warn("[EncounterTerrain] Worker unavailable",error.message);}
    }
  }
  if(!prepared) source="main";
  const hydrateStart=performance.now();
  const terrain=BuildEncounterTerrain(scene,bytes[0],bytes[1]||null,map,prepared);
  terrain.surfaceMaps();
  terrain.buildInfo={source,cached,key,buildMs,hydrateMs:performance.now()-hydrateStart,totalMs:performance.now()-started};
  return terrain;
}
