// The 2026-09-22 topology retires the artificial crawl ceilings and former
// scripted track-only tank fixture. Preserve this registered entry point with
// normal controls: capture, optional gun, both batches through one breach,
// the same supply branch both ways, real bundle throw, relief and 06 departure.
// Only initial load reconstructs 03; no phase jumps or checkpoint retries.
if(process.argv.includes('--rear-entry-only')){
  // Reproduce the continuous 02 -> 03 handoff positions. This is a movement
  // fixture using the real pair of NPC capsules, not campaign completion.
  const {OpenCampaign,CloseCampaign}=await import('./Script_FirstLevelCampaignKit.mjs');
  const fs=await import('node:fs/promises'),path=await import('node:path'),{default:assert}=await import('node:assert/strict');
  const ctx=await OpenCampaign({suite:'FrontRearEntryAcceptance',quality:'high',stageFrom:3,stageTo:3});
  try{
    await ctx.page.evaluate(async()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),T=await import('three');
      r.voice.Pause();r.Say=()=>{};r.frontShow.bunker.pointActor=null;
      r.frontBattle.Update=()=>{};
      const render=g.post.Render;
      g.post.Render=function(scene,camera,options){
        camera.position.set(-31,9,-107);camera.lookAt(new T.Vector3(-40,-.2,-115));camera.updateMatrixWorld(true);
        g.viewmodel.root.visible=false;return render.call(this,scene,camera,options);
      };
    });
    const receipts=[];
    for(const [name,starts,limit] of [
      ['recordedStall',[{x:-37.373,z:-117.110},{x:-36.625,z:-117.110}],2100],
      ['rearExit',[{x:-40,z:-120.4},{x:-39.9,z:-119.5}],2100],
      ['initialized',[{x:-37,z:-101},{x:-26,z:-100}],180],
    ]){
      await ctx.page.evaluate(({starts})=>{
        const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),actors=['luo','liuwencai'].map(role=>r.companion.Handle(role));
        actors.forEach((a,i)=>r.PlaceActor(a,starts[i]));
        r.frontBattle.leg=null;r.frontBattle.Enter('Support');
        for(const s of r.ai.soldiers){s.scriptedNoncombatant=true;s.target=null;s.targetVisible=false;}
        window.rearEntry={actors,rows:[],teleports:0,maxControllerError:0,maxStep:0,previous:actors.map(a=>a.position.clone()),originals:[]};
        for(const actor of actors){
          const p=window.rearEntry,body=actor.body,move=body.Move,teleport=body.Teleport;
          p.originals.push({body,move,teleport});
          body.Move=function(...args){const result=move.apply(this,args);actor.rearEntryControlled={x:result.x,z:result.z};return result;};
          body.Teleport=function(...args){p.teleports++;return teleport.apply(this,args);};
        }
      },{starts});
      let final;
      for(let frame=0;frame<limit;frame+=30){
        final=await ctx.page.evaluate(()=>{
          const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),p=window.rearEntry;
          for(let f=0;f<30;f++){
            for(const actor of p.actors){actor.rearEntryControlled=null;r.frontBattle.Walk(actor,{follow:false});}
            g.StepFrames(1,1/60,f===29);
            p.actors.forEach((a,i)=>{
              p.maxStep=Math.max(p.maxStep,Math.hypot(a.position.x-p.previous[i].x,a.position.z-p.previous[i].z));p.previous[i].copy(a.position);
              if(a.rearEntryControlled)p.maxControllerError=Math.max(p.maxControllerError,Math.hypot(a.position.x-a.rearEntryControlled.x,a.position.z-a.rearEntryControlled.z));
            });
          }
          const rows=p.actors.map(a=>({id:a.castId,position:a.position.toArray(),index:r.frontBattle.walks.get(a.id).index,route:r.frontBattle.walks.get(a.id).route,alive:a.alive}));
          p.rows.push(rows);return rows;
        });
        if(frame===0||frame===300)await ctx.page.screenshot({path:path.join(ctx.output,`Scene_${name}_${frame}.png`)});
        if(name!=='initialized'&&final.every(a=>a.index>a.route.findIndex(p=>p.x===-37&&p.z===-101)))break;
      }
      const receipt=await ctx.page.evaluate(()=>{
        const p=window.rearEntry;for(const {body,move,teleport} of p.originals){body.Move=move;body.Teleport=teleport;}
        return {rows:p.rows,teleports:p.teleports,maxControllerError:p.maxControllerError,maxStep:p.maxStep};
      });
      receipt.name=name;receipts.push(receipt);
      await ctx.page.screenshot({path:path.join(ctx.output,`Scene_${name}_Complete.png`)});
      await fs.writeFile(path.join(ctx.output,'Data_RearEntry.json'),JSON.stringify(receipts,null,2));
      assert.ok(final.every(a=>a.alive&&a.index>a.route.findIndex(p=>p.x===-37&&p.z===-101)),name+': both living actors finish the rear-bank exit and descend into collection');
      assert.equal(receipt.teleports,0,name+': no teleports after initial fixture placement');
      assert.ok(receipt.maxControllerError<.00001,name+': positions come from the real character controller');
      if(name==='initialized')assert.ok(receipt.rows.flat().every(a=>a.position[2]>-104),'actors initialized in collection do not walk back to the rear bank');
      console.log('PASS rear entry',JSON.stringify({name,final:final.map(({id,position,index})=>({id,position,index})),teleports:receipt.teleports,maxStep:receipt.maxStep,maxControllerError:receipt.maxControllerError}));
    }
    assert.deepEqual(ctx.errors,[]);
  }finally{await CloseCampaign(ctx);}
}else if(process.argv.includes('--corner-only')){
  // Isolated movement regression, not campaign completion: the original actor,
  // capsule and rendered trench negotiate the approach without enemy attacks.
  const {OpenCampaign,CloseCampaign}=await import('./Script_FirstLevelCampaignKit.mjs');
  const fs=await import('node:fs/promises'),path=await import('node:path'),{default:assert}=await import('node:assert/strict');
  const ctx=await OpenCampaign({suite:'FrontCornerAcceptance',quality:'high',stageFrom:3,stageTo:3});
  try{
    const receipt=await ctx.page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),actor=r.companion.Handle('luo');
      r.voice.Stop?.();r.frontShow.bunker.pointActor=null;
      for(const s of r.ai.soldiers){s.scriptedNoncombatant=true;s.target=null;s.targetVisible=false;}
      r.frontBattle.Update=()=>{};
      const cases=[];
      for(const [name,start,route,index] of [
        ['center',{x:6,z:-124},[{x:6,z:-124},{x:14,z:-116},{x:22,z:-119},{x:22,z:-129}],0],
        ['recordedStall',{x:17.8399,z:-119},[{x:14,z:-116},{x:22,z:-119},{x:22,z:-129}],1],
      ]){
      r.PlaceActor(actor,start);r.frontBattle.SetWalk(actor,route);r.frontBattle.walks.get(actor.id).index=index;
      const samples=[];let maxStep=0,previous=actor.position.clone(),maxFrame=null,requested=0,teleports=0,controlled=null,maxControllerError=0;
      const body=actor.body,move=body.Move,teleport=body.Teleport;
      body.Move=function(dx,dy,dz,...args){requested+=Math.hypot(dx,dz);const result=move.call(this,dx,dy,dz,...args);controlled={x:result.x,z:result.z};return result;};
      body.Teleport=function(...args){teleports++;return teleport.apply(this,args);};
      const corners=route.slice(1,-1).map(()=>Infinity);
      let rejoinStarts=0,rejoining=false;
      for(let frame=0;frame<1500;frame++){
        requested=0;controlled=null;
        r.frontBattle.Walk(actor,{follow:false});g.StepFrames(1,1/60,false);
        const w=r.frontBattle.walks.get(actor.id);
        if(w.rejoin&&!rejoining)rejoinStarts++;rejoining=!!w.rejoin;
        const step=Math.hypot(actor.position.x-previous.x,actor.position.z-previous.z);
        if(controlled)maxControllerError=Math.max(maxControllerError,Math.hypot(actor.position.x-controlled.x,actor.position.z-controlled.z));
        if(step>maxStep){maxStep=step;maxFrame={frame,requested,step,position:actor.position.toArray(),rejoin:w.rejoin||null,evading:!!actor.missionGrenadeEvade};}previous.copy(actor.position);
        for(let i=0;i<corners.length;i++)corners[i]=Math.min(corners[i],Math.hypot(actor.position.x-route[i+1].x,actor.position.z-route[i+1].z));
        if(frame%15===0)samples.push({time:frame/60,position:actor.position.toArray(),goal:actor.goal.toArray(),index:w.index,rejoin:w.rejoin||null});
      }
      body.Move=move;body.Teleport=teleport;
      cases.push({name,samples,maxStep,maxFrame,teleports,maxControllerError,corners,rejoinStarts,index:r.frontBattle.walks.get(actor.id).index,total:route.length,stance:actor.stance,alive:actor.alive});
      }
      return cases;
    });
    await fs.writeFile(path.join(ctx.output,'Data_Corner.json'),JSON.stringify(receipt,null,2));
    for(const result of receipt){
      assert.equal(result.index,result.total,result.name+': the real NPC capsule passes both covered corners and reaches the far trench');
      assert.ok(result.corners.every(distance=>distance<.3),result.name+': the route actually visits each corner instead of cutting across its cover');
      // Rapier can push the capsule out from the cover corner by more than a
      // walking step. Every resulting position must still come from Move,
      // never a scripted teleport or coordinate override through the obstacle.
      assert.equal(result.teleports,0,result.name+': no Teleport after the initial reproduction setup');
      assert.ok(result.maxControllerError<.00001,result.name+': every movement remains the real character-controller result');
      if(result.name==='center')assert.ok(result.maxStep<.04,'ordinary corridor walking keeps its continuous walking pace');
      assert.equal(result.stance,1);assert.equal(result.alive,true);
      if(result.name==='recordedStall')assert.equal(result.rejoinStarts,1,'one continuous return to the corridor, without alternating targets');
      console.log('ok real Luo capsule follows the right-approach corridor',JSON.stringify({case:result.name,maxStep:result.maxStep,corners:result.corners,rejoins:result.rejoinStarts,teleports:result.teleports,maxControllerError:result.maxControllerError}));
    }
    assert.deepEqual(ctx.errors,[]);
  }finally{await CloseCampaign(ctx);}
}else{
  process.argv = [process.execPath, 'Script_FirstLevelMissionBrowserTest.mjs',
    '--campaign', '--stage-from=3', '--stage-to=6', '--probe-front-gun'];
  await import('./Script_FirstLevelMissionBrowserTest.mjs');
}
