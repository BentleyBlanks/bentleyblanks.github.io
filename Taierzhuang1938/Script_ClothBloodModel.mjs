import { CLOTH_BLOOD_PROFILES, CLOTH_BLOOD_DEFAULTS, CLOTH_BLOOD_SIM as S, ClampClothBloodParameter } from './Data_Tuning_ClothBlood.mjs';

const Clamp = value => Math.max(0,Math.min(1,value));
// A small conservative finite-volume sheet, evaluated at fixed time steps. Each cell has
// mobile pigment, captured pigment and wetness. No source slots disappear or replace stains.
export class ClothBloodModel {
  constructor({width=1.4,length=1.9,profile='thin',params={}}={}) {
    this.width=Math.max(0.1,width); this.length=Math.max(0.1,length);
    this.profile=CLOTH_BLOOD_PROFILES[profile]?profile:'thin'; this.fabric=CLOTH_BLOOD_PROFILES[this.profile];
    this.nx=S.columns; this.ny=Math.max(16,Math.min(S.maxRows,Math.round(this.nx*this.length/this.width)));
    this.n=this.nx*this.ny; this.cellArea=this.width*this.length/this.n;
    this.initialParams={...CLOTH_BLOOD_DEFAULTS};
    for(const [key,value] of Object.entries(params)) { const bounded=ClampClothBloodParameter(key,value); if(bounded!==null)this.initialParams[key]=bounded; }
    this.events=[]; this.checkpoints=[]; this.durationS=0; this.revision=0; this.capacityReached=false;
    this.pixels=new Uint8Array(this.n*8); this.ResetState();
    // Static heterogeneous transport follows rest-space fibers, not a time-varying noise.
    this.conductivity=Float64Array.from({length:this.n},(_,i)=>{
      const x=i%this.nx,y=Math.floor(i/this.nx);
      const broad=Math.sin(x*0.53+Math.sin(y*0.37))*Math.sin(y*0.65+Math.sin(x*0.29));
      return 0.64+0.40*broad+0.12*Math.sin(y*2.13+x*0.19);
    });
  }
  ResetState() {
    this.params={...this.initialParams}; this.layers=Array.from({length:2},()=>({mobile:new Float64Array(this.n),bound:new Float64Array(this.n),wet:new Float64Array(this.n)}));
    this.delta=new Float64Array(this.n); this.tick=0; this.timeS=0; this.pendingS=0; this.cursor=0; this.feed=null; this.injectedMl=0; this.revision++;
  }
  Record(type,data={}) {
    // Editing a historical frame creates a branch; simply replaying preserves future events.
    if(this.timeS<this.durationS-1e-7) { this.events=this.events.filter(event=>event.tick<=this.tick); this.durationS=this.timeS; this.cursor=this.events.length; }
    // Keep a final event slot for stopping a live feed, even after a long editing session.
    if(this.events.length>=S.maxEvents-(type==='stop'?0:1)) { this.capacityReached=true; return false; }
    this.checkpoints=this.checkpoints.filter(checkpoint=>checkpoint.tick<this.tick);
    const event={tick:this.tick,type,...data}; this.events.push(event); this.ApplyEvent(event); this.cursor=this.events.length; this.revision++; return true;
  }
  Point({u=0.5,v=0.5,side=1}={}) { return {u:Clamp(Number.isFinite(u)?u:0.5),v:Clamp(Number.isFinite(v)?v:0.5),side:side<0?-1:1}; }
  Inject(options={}) {
    const amountMl=ClampClothBloodParameter('amountMl',Number(options.amountMl??this.params.amountMl));
    const ageS=ClampClothBloodParameter('ageS',Number(options.ageS??this.params.ageS));
    return amountMl===null||ageS===null?false:this.Record('inject',{...this.Point(options),amountMl,ageS});
  }
  StartFeed(options={}) {
    const rateMlS=options.rateMlS===undefined?null:ClampClothBloodParameter('feedMlS',Number(options.rateMlS));
    if(options.rateMlS!==undefined&&rateMlS===null)return false;
    return this.Record('feed',{...this.Point(options),rateMlS});
  }
  StopFeed() { return this.feed ? this.Record('stop') : true; }
  Set(key,value) { const bounded=ClampClothBloodParameter(key,Number(value)); return bounded===null?false:this.Record('set',{key,value:bounded}); }
  ApplyEvent(event) {
    if(event.type==='inject')this.Deposit(event,event.amountMl,event.ageS);
    else if(event.type==='feed')this.feed={u:event.u,v:event.v,side:event.side,rateMlS:event.rateMlS};
    else if(event.type==='stop')this.feed=null;
    else if(event.type==='set')this.params[event.key]=event.value;
  }
  Deposit(point,amountMl,ageS=0) {
    const layer=this.layers[point.side<0?1:0], radius=S.sourceRadiusM, weights=[];
    let total=0;
    const cx=point.u*this.nx-0.5, cy=point.v*this.ny-0.5;
    const rx=radius*2.6/this.width*this.nx, ry=radius*2.6/this.length*this.ny;
    for(let y=Math.max(0,Math.floor(cy-ry));y<=Math.min(this.ny-1,Math.ceil(cy+ry));y++)for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(this.nx-1,Math.ceil(cx+rx));x++) {
      const dx=(x-cx)*this.width/this.nx/radius, dy=(y-cy)*this.length/this.ny/radius;
      const angle=Math.atan2(dy,dx),lobe=1+0.16*Math.sin(angle*5+0.8)+0.08*Math.sin(angle*9-0.4);
      const weight=Math.exp(-(dx*dx+dy*dy)*1.8/(lobe*lobe))*(0.75+this.conductivity[y*this.nx+x]*0.25);
      weights.push([y*this.nx+x,weight]); total+=weight;
    }
    const mobile=Math.exp(-ageS/this.fabric.bindS), wet=Math.exp(-ageS/(this.params.drySeconds*this.fabric.dryingScale));
    for(const [i,w] of weights) { const density=amountMl*w/total/this.cellArea; layer.mobile[i]+=density*mobile; layer.bound[i]+=density*(1-mobile); layer.wet[i]+=density*wet; }
    this.injectedMl+=amountMl;
  }
  Diffuse(field,dt) {
    const d=this.fabric.diffusionM2S*this.params.diffusion;
    if(d<=0)return;
    const kx=d*dt/(this.width/this.nx)**2*S.fiberAnisotropy;
    const ky=d*dt/(this.length/this.ny)**2/S.fiberAnisotropy;
    this.delta.fill(0);
    for(let y=0;y<this.ny;y++)for(let x=0;x<this.nx;x++) {
      const i=y*this.nx+x;
      if(x+1<this.nx) { const j=i+1, flux=(field[j]-field[i])*kx*(this.conductivity[i]+this.conductivity[j])*0.5; this.delta[i]+=flux; this.delta[j]-=flux; }
      if(y+1<this.ny) { const j=i+this.nx, flux=(field[j]-field[i])*ky*(this.conductivity[i]+this.conductivity[j])*0.5; this.delta[i]+=flux; this.delta[j]-=flux; }
    }
    for(let i=0;i<this.n;i++)field[i]+=this.delta[i];
  }
  Integrate(dt) {
    if(!this.injectedMl&&!this.feed)return;
    if(this.feed)this.Deposit(this.feed,(this.feed.rateMlS??this.params.feedMlS)*dt,this.params.ageS);
    const d=this.fabric.diffusionM2S*this.params.diffusion;
    // Explicit diffusion stability for small cloth dimensions and all authoring settings.
    const substeps=Math.max(1,Math.ceil(d*dt*1.25*(S.fiberAnisotropy/(this.width/this.nx)**2+1/S.fiberAnisotropy/(this.length/this.ny)**2)/0.45));
    const step=dt/substeps, capture=1-Math.exp(-step/this.fabric.bindS), dry=Math.exp(-step/(this.params.drySeconds*this.fabric.dryingScale));
    const front=this.layers[0],back=this.layers[1];
    for(let sub=0;sub<substeps;sub++) {
      for(const layer of this.layers) { this.Diffuse(layer.mobile,step); this.Diffuse(layer.wet,step); }
      for(let i=0;i<this.n;i++) {
        const saturation=Math.min(1,Math.sqrt(Math.max(front.mobile[i],back.mobile[i])/this.fabric.capacityMlM2));
        const exchange=(1-Math.exp(-2*step*this.params.permeation*saturation/this.fabric.penetrateS))*0.5;
        const pigmentFlux=(front.mobile[i]-back.mobile[i])*exchange, wetFlux=(front.wet[i]-back.wet[i])*exchange;
        front.mobile[i]-=pigmentFlux;back.mobile[i]+=pigmentFlux;front.wet[i]-=wetFlux;back.wet[i]+=wetFlux;
        for(const layer of this.layers) { const retained=layer.mobile[i]*capture; layer.mobile[i]-=retained; layer.bound[i]+=retained; layer.wet[i]*=dry; }
      }
    }
    this.revision++;
  }
  Advance(dt) {
    if(!Number.isFinite(dt)||dt<=0)return this.timeS;
    this.pendingS+=Math.min(dt,S.maxTimeS-this.timeS);
    while(this.pendingS>=S.stepS-1e-9&&this.timeS<S.maxTimeS) {
      this.Integrate(S.stepS); this.pendingS=Math.max(0,this.pendingS-S.stepS); this.tick++; this.timeS=this.tick*S.stepS;
      while(this.cursor<this.events.length&&this.events[this.cursor].tick<=this.tick)this.ApplyEvent(this.events[this.cursor++]);
      if(this.injectedMl&&this.tick%Math.round(S.checkpointSeconds/S.stepS)===0)this.Checkpoint();
    }
    this.durationS=Math.max(this.durationS,this.timeS); return this.timeS;
  }
  Seek(timeS) {
    if(!Number.isFinite(timeS))return false;
    const target=Math.max(0,Math.min(S.maxTimeS,timeS)), duration=this.durationS;
    const checkpoint=this.checkpoints.filter(value=>value.tick*S.stepS<=target+1e-8).sort((a,b)=>b.tick-a.tick)[0];
    this.ResetState();
    if(checkpoint) {
      this.tick=checkpoint.tick;this.timeS=this.tick*S.stepS;this.cursor=checkpoint.cursor;
      this.params={...checkpoint.params};this.feed=checkpoint.feed?{...checkpoint.feed}:null;this.injectedMl=checkpoint.injectedMl;
      for(let side=0;side<2;side++)for(const key of ['mobile','bound','wet'])this.layers[side][key].set(checkpoint.layers[side][key]);
    } else while(this.cursor<this.events.length&&this.events[this.cursor].tick===0)this.ApplyEvent(this.events[this.cursor++]);
    this.Advance(Math.max(0,Math.floor((target+1e-8)/S.stepS)*S.stepS-this.timeS)); this.durationS=Math.max(duration,this.timeS); return true;
  }
  Checkpoint() {
    if(this.checkpoints.some(value=>value.tick===this.tick))return;
    this.checkpoints.push({tick:this.tick,cursor:this.cursor,params:{...this.params},feed:this.feed?{...this.feed}:null,injectedMl:this.injectedMl,
      layers:this.layers.map(layer=>({mobile:layer.mobile.slice(),bound:layer.bound.slice(),wet:layer.wet.slice()}))});
    this.checkpoints.sort((a,b)=>a.tick-b.tick);while(this.checkpoints.length>S.maxCheckpoints)this.checkpoints.shift();
  }
  Clear() { this.initialParams={...this.params};this.events=[];this.checkpoints=[];this.durationS=0;this.capacityReached=false;this.ResetState();return true; }
  Sample(u,v,side=1) {
    const point=this.Point({u,v,side}), x=Math.min(this.nx-1,Math.floor(point.u*this.nx)), y=Math.min(this.ny-1,Math.floor(point.v*this.ny));
    const i=y*this.nx+x,layer=this.layers[point.side<0?1:0],pigment=layer.mobile[i]+layer.bound[i];
    return {pigment,wetness:pigment>1e-9?Clamp(layer.wet[i]/pigment):0,coverage:1-Math.exp(-pigment/(this.fabric.capacityMlM2*S.coverageScale))};
  }
  TextureData() {
    for(let side=0;side<2;side++)for(let i=0;i<this.n;i++) {
      const layer=this.layers[side],mass=layer.mobile[i]+layer.bound[i],at=(side*this.n+i)*4;
      this.pixels[at]=Math.round(255*(1-Math.exp(-mass/(this.fabric.capacityMlM2*S.coverageScale))));
      this.pixels[at+1]=Math.round(255*(mass>1e-8?Clamp(layer.wet[i]/mass):0));
      this.pixels[at+2]=Math.round(255*Clamp(mass/this.fabric.capacityMlM2)); this.pixels[at+3]=255;
    }
    return this.pixels;
  }
  State() {
    const sides=this.layers.map(layer=>{
      let pigmentMl=0,wetMl=0,areaM2=0;
      for(let i=0;i<this.n;i++) { const mass=layer.mobile[i]+layer.bound[i];pigmentMl+=mass*this.cellArea;wetMl+=layer.wet[i]*this.cellArea;if(mass>S.visibleDensity)areaM2+=this.cellArea; }
      return {pigmentMl,wetMl,areaM2};
    });
    let hash=2166136261;for(const byte of this.TextureData())hash=Math.imul(hash^byte,16777619)>>>0;
    return {timeS:this.timeS,durationS:this.durationS,feeding:!!this.feed,params:{...this.params},profile:this.profile,front:sides[0],back:sides[1],injectedMl:this.injectedMl,eventCount:this.events.length,hash,capacityReached:this.capacityReached};
  }
}
