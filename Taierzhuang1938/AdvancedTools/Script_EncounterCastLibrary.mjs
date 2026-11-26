import {ENCOUNTER_PLAY_STARTUP} from "../Data_Tuning_EncounterPlayStartup.mjs";

const indexUrl=new URL("./Library/Data_Cast.json",import.meta.url);
let index;
export async function ReadCastLibrary() {
  const response=await fetch(indexUrl,{cache:"no-cache"});
  if(!response.ok)return null;
  const data=await response.json();
  if(data.version!==1||data.maxSize!==ENCOUNTER_PLAY_STARTUP.castTextureMaxSize||!data.models)return null;
  return {data,verified:response.headers.get("X-Encounter-Library")==="validated"};
}

export async function LoadEncounterCast(loader,file) {
  index??=ReadCastLibrary().catch(()=>null);
  const library=await index, item=library?.data.models[file];
  if(!item||!/^[a-f0-9]{64}\.glb$/.test(item.file))return loader.loadAsync(file);
  const url=new URL("Cast/"+item.file,indexUrl);
  try {
    if(library.verified)return await loader.loadAsync(url.href);
    // A plain static server serves an imported snapshot. Validate the product,
    // without downloading the authoring GLB. Its producer owns source invalidation.
    const response=await fetch(url);
    if(!response.ok)throw Error("Missing imported character");
    const product=await response.arrayBuffer();
    const digest=await crypto.subtle.digest("SHA-256",product);
    const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
    if(hash!==item.sha256)throw Error("Incomplete imported character");
    return await loader.parseAsync(product,new URL(".",url).href);
  } catch {
    return loader.loadAsync(file);
  }
}
