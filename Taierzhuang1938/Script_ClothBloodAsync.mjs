// Runtime towel offload. Authoring keeps the synchronous solver. Resolve the
// original modules through the stamped import map, including in bundled builds.
const stateKeys=['params','initialParams','tick','timeS','pendingS','cursor','feed','injectedMl','durationS','events','revision','capacityReached','layers'];
let sourcePromise;
function Sources(){
  return sourcePromise ||= Promise.all(['./Data_Tuning_ClothBlood.mjs','./Script_Tuning_ClothBlood.mjs','./Script_ClothBloodModel.mjs'].map(async name=>{
    const response=await fetch(import.meta.resolve(name));if(!response.ok)throw new Error('Cloth worker source '+response.status);return response.text();
  })).catch(error=>{sourcePromise=null;throw error;});
}
const workerLoop=`
let model,cap,sequence=0;
const keys=${JSON.stringify(stateKeys)};
function Send(flushId,ready=false){
  const state=Object.fromEntries(keys.map(key=>[key,model[key]]));
  state.layers=model.layers.map(layer=>Object.fromEntries(Object.entries(layer).map(([key,value])=>[key,value.slice()])));
  const pixels=model.TextureData().slice();
  self.postMessage({type:'snapshot',state,pixels,sequence,flushId,ready},[pixels.buffer,...state.layers.flatMap(layer=>Object.values(layer).map(value=>value.buffer))]);
}
self.onmessage=({data})=>{
  try{
    if(data.type==='init'){model=new ClothBloodModel(data.options);Object.assign(model,data.state);model.checkpoints=[];cap=data.cap;Send(null,true);return;}
    if(data.type==='flush'){Send(data.id);return;}
    if(data.type==='advance'){
      const revision=model.revision,tick=model.tick;sequence=data.sequence;
      if(model.feed&&model.injectedMl>=cap)model.StopFeed();
      model.Advance(data.dt);
      if(model.revision!==revision||model.tick!==tick)Send();
      else self.postMessage({type:'ack',sequence,pendingS:model.pendingS});
    }
  }catch(error){self.postMessage({type:'error',message:String(error.stack||error)});}
};`;

export class AsyncClothBlood {
  constructor(blood,cap) {
    this.blood=blood;this.cap=cap;this.pending=[];this.sequence=0;this.urls=[];this.waiters=new Map();this.flushId=0;this.failed=false;this.disposed=false;
    this.ready=new Promise(resolve=>{this.resolveReady=resolve;});
    this.Start().catch(error=>this.Fallback(error));
  }
  async Start(){
    if(typeof Worker==='undefined'||typeof import.meta.resolve!=='function')throw new Error('Worker unavailable');
    const [data,tuning,model]=await Sources();if(this.disposed||this.failed)return;
    const BlobUrl=text=>{const url=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));this.urls.push(url);return url;};
    const Replace=(text,name,url)=>text.replaceAll('"'+name+'"',JSON.stringify(url)).replaceAll("'"+name+"'",JSON.stringify(url));
    const dataUrl=BlobUrl(data),tuningUrl=BlobUrl(Replace(tuning,'./Data_Tuning_ClothBlood.mjs',dataUrl));
    const modelUrl=BlobUrl(Replace(Replace(model,'./Data_Tuning_ClothBlood.mjs',dataUrl),'./Script_Tuning_ClothBlood.mjs',tuningUrl));
    const worker=this.worker=new Worker(BlobUrl('import {ClothBloodModel} from '+JSON.stringify(modelUrl)+';\n'+workerLoop),{type:'module'});
    worker.onerror=event=>{event.preventDefault();this.Fallback(new Error(event.message));};
    worker.onmessage=({data})=>{
      if(this.disposed||this.failed)return;
      if(data.type==='error'){this.Fallback(new Error(data.message));return;}
      if(data.type==='snapshot'){
        Object.assign(this.blood,data.state);this.blood.pixels=data.pixels;
        if(this.blood.texture){this.blood.texture.image.data=data.pixels;this.blood.texture.needsUpdate=true;this.blood.uploadedRevision=this.blood.revision;}
      }else this.blood.pendingS=data.pendingS;
      while(this.pending.length&&this.pending[0].sequence<=data.sequence)this.pending.shift();
      if(data.ready){this.resolveReady(true);this.Revoke();}
      if(data.flushId){this.waiters.get(data.flushId)?.(true);this.waiters.delete(data.flushId);}
    };
    const b=this.blood,state=Object.fromEntries(stateKeys.map(key=>[key,b[key]]));
    worker.postMessage({type:'init',options:{width:b.width,length:b.length,profile:b.profile,params:b.initialParams},state,cap:this.cap});
    for(const item of this.pending)worker.postMessage({type:'advance',...item});
  }
  Advance(dt){
    if(this.disposed||!Number.isFinite(dt)||dt<=0)return;
    if(this.failed){this.AdvanceSync(dt);return;}
    const item={sequence:++this.sequence,dt};this.pending.push(item);this.worker?.postMessage({type:'advance',...item});
  }
  AdvanceSync(dt){if(this.blood.feed&&this.blood.injectedMl>=this.cap)this.blood.StopFeed();this.blood.Advance(dt);}
  async Flush(){
    await this.ready;if(this.failed||this.disposed)return false;
    const id=++this.flushId;return new Promise(resolve=>{this.waiters.set(id,resolve);this.worker.postMessage({type:'flush',id});});
  }
  Revoke(){for(const url of this.urls)URL.revokeObjectURL(url);this.urls.length=0;}
  Fallback(error){
    if(this.failed||this.disposed)return;this.failed=true;this.worker?.terminate();this.worker=null;this.Revoke();
    // The acknowledged Float64 state is already mirrored on the main instance.
    for(const item of this.pending)this.AdvanceSync(item.dt);this.pending.length=0;
    this.resolveReady(false);for(const resolve of this.waiters.values())resolve(false);this.waiters.clear();
    console.warn('[ClothBlood] Worker fallback to the same solver:',String(error.message||error));
  }
  Dispose(){this.disposed=true;this.worker?.terminate();this.worker=null;this.Revoke();this.pending.length=0;this.resolveReady(false);for(const resolve of this.waiters.values())resolve(false);this.waiters.clear();}
}
