// Absolute-time adapter for blockout playback. Uses the real director and renderer.
import {FlareDirector,MakeFlareHost} from './Script_Flare.mjs';
import {FlareVisuals} from './Script_FlareVisual.mjs';
export class FlareTrack {
 constructor(parent,host,groundAt){this.visuals=new FlareVisuals(parent);this.host=host;this.groundAt=groundAt;this.items=new Map();}
 Update(events,t,{fire=false,from=-1}={}){
  for(let i=0;i<events.length;i++){
   const e=events[i];if(e.type!=='flare')continue;const age=t-e.t;
   let item=this.items.get(i);
   if(item&&(age<0||age<item.age)){item.director.Reset();this.items.delete(i);item=null;}
   if(age<0)continue;
   if(!item){const director=new FlareDirector(MakeFlareHost({vfx:{flareVisuals:this.visuals},lights:this.host.lights,
      Battlefield:()=>({GroundHeight:this.groundAt})}),{exposure:false,seed:1938+i});
    director.LaunchFlare({preset:e.preset||'SignalRed',from:{x:e.x,z:e.z},at:{x:e.atX??e.x,z:e.atZ??e.z}});
    item={director,age:0};this.items.set(i,item);
   }
   const f=item.director.flares[0];
   if(f){f.t=age;item.director.StepPhase(f);item.director.Place(f,0);item.director.StepLight(f);if(f.phase==='done')item.director.Finish(f,'done',true);}
   item.age=age;
   if(fire&&e.t>from&&e.t<=t)this.host.audio?.Play('flareLaunch',{position:{x:e.x,y:this.groundAt(e.x,e.z),z:e.z},volume:.6});
  }
 }
 Clear(){for(const item of this.items.values())item.director.Reset();this.items.clear();}
 Dispose(){this.Clear();this.visuals.Dispose();}
}
