import {BuildEncounterTerrain} from "./Script_LevelFlowTerrain.mjs";
import {ReadTerrainCache} from "./Script_LevelFlowTerrainCache.mjs";

import {TerrainLibraryKey} from "./Script_LevelFlowTerrainKey.mjs";
import {UnpackTerrainSnapshot} from "./Script_TerrainSnapshot.mjs";

async function ReadDiskTerrain(key) {
  if(typeof DecompressionStream==="undefined")return null;
  const url=new URL("./Library/Terrain/"+key+".bin.gz",import.meta.url);
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)return null;
  const stream=response.body.pipeThrough(new DecompressionStream("gzip"));
  return UnpackTerrainSnapshot(await new Response(stream).arrayBuffer());
}

export async function PrepareEncounterTerrain(scene,bytes,map,{focus=[0,0]}={}) {
  const started=performance.now(),workerUrl=new URL("./Script_LevelFlowTerrainWorker.mjs",import.meta.url);
  let key=null,prepared=null,source="worker",buildMs=0,cached=false;
  try {
    key=await TerrainLibraryKey(scene,bytes,map,focus,async url=>{
      const response=await fetch(url,{cache:"no-store"});
      if(!response.ok)throw Error("Terrain source "+response.status);
      return response.text();
    });
  } catch(error) {console.warn("[EncounterTerrain] Cannot identify terrain inputs",error.message);}
  if(key) {
    try {prepared=await ReadTerrainCache(key);} catch(error) {console.warn("[EncounterTerrain] Browser cache unavailable",error.message);}
    if(prepared?.format===2)source="cache";
    else {
      try {prepared=await ReadDiskTerrain(key);} catch(error) {console.warn("[EncounterTerrain] Disk cache unavailable",error.message);}
      if(prepared?.format===2)source="library";
    }
    cached=prepared?.format===2;
  }
  if(!cached) {
    prepared=null;
    if(typeof Worker!=="undefined") {
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
