import {BuildEncounterTerrain} from "./Script_LevelFlowTerrain.mjs";
import {WriteTerrainCache} from "./Script_LevelFlowTerrainCache.mjs";

function TransferBuffers(value,buffers=new Set(),seen=new Set()) {
  if(!value||typeof value!=="object"||seen.has(value)) return buffers;
  seen.add(value);
  if(ArrayBuffer.isView(value)) buffers.add(value.buffer);
  else if(value instanceof ArrayBuffer) buffers.add(value);
  else for(const child of Object.values(value)) TransferBuffers(child,buffers,seen);
  return buffers;
}

self.onmessage=async({data})=>{
  try {
    const started=performance.now();
    const terrain=BuildEncounterTerrain(data.scene,data.heights,data.datum,data.map);
    const prepared=terrain.prepareSnapshot(data.focus);
    const buildMs=performance.now()-started;
    const cached=data.key?await WriteTerrainCache(data.key,prepared).catch(error=>{console.warn("[EncounterTerrain] Cache write failed",error.message);return false;}):false;
    self.postMessage({prepared,buildMs,cached},[...TransferBuffers(prepared)]);
  } catch(error) {self.postMessage({error:error.message});}
};
