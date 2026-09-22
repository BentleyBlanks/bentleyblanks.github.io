// Isolated acting acceptance on the five production rigs and the production
// high-quality renderer. This supplements, never replaces, normal 01–03 driving.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { OpenCampaign, CloseCampaign } from "./Script_FirstLevelCampaignKit.mjs";

const ctx=await OpenCampaign({suite:"OpeningActorPerformance",quality:"high",stageFrom:1,stageTo:3});
const {page,output}=ctx;
try{
  await page.waitForFunction(()=>window.Tengxian.Debug.FirstLevelMissionRuntime().frontShow.bunker.ready,null,{timeout:60000});
  await page.addStyleTag({content:"#hud{display:none!important}"});
  await page.evaluate(async()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),T=await import("three");
    const api=await import("./Script_OpeningStoryboardAnimation.mjs");
    const library=await api.LoadOpeningStoryboardAnimation();
    const render=g.post.Render;
    const probe=window.openingActorPerformanceProbe={g,r,T,api,library,render,soldier:null,samples:[],time:0};
    g.post.Render=function(scene,camera,options){
      if(probe.soldier){
        const root=probe.soldier.actor.root.position;
        const head=probe.soldier.actor.characterRig.bones.head.getWorldPosition(new T.Vector3());
        const center=root.clone().lerp(head,.58);
        camera.position.copy(center).add(new T.Vector3(1.75,.45,-2.7));
        camera.lookAt(center);camera.updateMatrixWorld(true);g.viewmodel.root.visible=false;
      }
      return render.call(this,scene,camera,{...options,eyeClosure:0,concussion:null});
    };
  });
  if(!process.argv.includes("--corpse-only")){
  const transitions=await page.evaluate(()=>{
    const p=window.openingActorPerformanceProbe,{T,api,library}=p,receipts=[];
    for(const [kind,variant] of [["nra",1],["nra",4],["ija",0]]){
      const actor=p.g.actorFactory.Create(kind,{modelVariant:variant,weapon:null,seed:391});
      // No dialogue or contact correction: inspect the actual clip crossfade
      // independently, including its middle frames rather than just its end.
      const soldier={actor,alive:true,openingStoryboardTravel:0,openingStoryboardPose:{clip:"SupplyReceive",seconds:.3}};
      api.InstallOpeningStoryboardAnimation(soldier);
      for(let i=0;i<30;i++)actor.Update(1/60,{elapsed:.3,moveSpeed:0,aim:0});
      const record=library.models.get(actor.characterRig.modelId),clip=record.clips.DuckBlast;
      const joints=["chest","upperArmL","upperArmR","forearmL","forearmR","handL","handR"].map(role=>{
        const bone=actor.characterRig.bones[role];
        return {role,bone,from:bone.quaternion.clone().normalize()};
      });
      soldier.openingStoryboardPose={clip:"DuckBlast",seconds:clip.duration};
      actor.Update(0,{elapsed:.3,moveSpeed:0,aim:0});
      const samples=[];
      for(let step=1;step<=10;step++){
        actor.Update(.028,{elapsed:.3,moveSpeed:0,aim:0});
        const alpha=step/10,mix=alpha*alpha*(3-2*alpha);
        for(const joint of joints){
          samples.push({step,role:joint.role,mix,shown:joint.bone.quaternion.clone().normalize()});
        }
      }
      // Use the rendered actor's settled destination, including its production
      // rig adapters. Every middle frame must traverse the same rotation arc.
      for(const joint of joints)joint.to=joint.bone.quaternion.clone().normalize();
      const moving=joints.filter(joint=>joint.from.angleTo(joint.to)>.25);
      const measured=samples.flatMap(sample=>{
        const joint=moving.find(joint=>joint.role===sample.role);if(!joint)return [];
        const expected=joint.from.clone().slerp(joint.to,sample.mix);
        return [{step:sample.step,role:sample.role,mix:sample.mix,error:sample.shown.angleTo(expected),
          fromAngle:sample.shown.angleTo(joint.from),toAngle:sample.shown.angleTo(joint.to)}];
      });
      receipts.push({model:actor.characterRig.modelId,joints:moving.length,samples:measured});actor.Dispose();
    }
    return receipts;
  });
  await fs.writeFile(path.join(output,"Data_ClipTransitions.json"),JSON.stringify(transitions,null,2));
  for(const transition of transitions){
    assert.ok(transition.joints>=3,`${transition.model}: several real joints change between authored poses`);
    for(const sample of transition.samples){
      assert.ok(sample.error<.004,`${transition.model}/${sample.role}: intermediate frame ${sample.step} follows the smooth rotation (${sample.error} rad)`);
      if(sample.step>=3&&sample.step<=7)assert.ok(sample.fromAngle>.02&&sample.toAngle>.02,
        `${transition.model}/${sample.role}: middle frames must leave the source and approach the target`);
    }
  }
  console.log("ok three production rigs: intermediate quaternion crossfade frames follow the actual clip arc");
  const aimedSpeech=await page.evaluate(()=>{
    const p=window.openingActorPerformanceProbe,{T,api}=p,receipts=[];
    for(const [role,variant] of [["luo",4],["zhou",1]])for(const explicitPoint of [false,true]){
      const actor=p.g.actorFactory.Create("nra",{modelVariant:variant,weapon:"HanYang",seed:407});
      const soldier={actor,id:role,alive:true};
      const samples=[];
      const Read=()=>{
        actor.root.updateMatrixWorld(true);
        const b=actor.characterRig.bones;
        return {head:b.head.getWorldQuaternion(new T.Quaternion()).normalize(),chest:b.chest.getWorldQuaternion(new T.Quaternion()).normalize(),
          hands:[b.handL,b.handR].map(bone=>({p:bone.getWorldPosition(new T.Vector3()),q:bone.getWorldQuaternion(new T.Quaternion()).normalize()})),
          weapon:{p:actor.weaponGroup.getWorldPosition(new T.Vector3()),q:actor.weaponGroup.getWorldQuaternion(new T.Quaternion()).normalize()}};
      };
      // Snapshot immediately after the original native update within the full
      // wrapper; both observations share the same frame and engine clocks.
      const nativeUpdate=actor.Update;let before;
      actor.Update=function(dt,state){const result=nativeUpdate.call(this,dt,state);before=Read();return result;};
      api.InstallOpeningStoryboardAnimation(soldier);
      for(let frame=0;frame<180;frame++){
        const speaking=frame<120;
        api.SetOpeningActorPerformance(soldier,{role,phase:"Support",cue:"FrontBlockade",line:0,
          speaker:speaking?role:null,clock:frame/60,lineSeconds:frame/60,lookAt:{x:1,y:1.2,z:-3}});
        soldier.openingStoryboardPose=explicitPoint?{clip:"PointBlockade",seconds:frame/60,upperBody:true}:null;
        actor.Update(1/60,{elapsed:2+frame/60,moveSpeed:0,aim:1});
        const after=Read();
        samples.push({frame,speaking,state:{...actor.characterRig.openingActorPerformanceState},head:before.head.angleTo(after.head),
          chest:before.chest.angleTo(after.chest),handMove:Math.max(...before.hands.map((hand,i)=>hand.p.distanceTo(after.hands[i].p))),
          handTurn:Math.max(...before.hands.map((hand,i)=>hand.q.angleTo(after.hands[i].q))),
          weaponMove:before.weapon.p.distanceTo(after.weapon.p),weaponTurn:before.weapon.q.angleTo(after.weapon.q)});
      }
      actor.characterRig.openingActorPerformance.Restore();
      api.SetOpeningActorPerformance(soldier,{role,phase:"Support",clock:4,speaker:null});
      actor.characterRig.openingActorPerformance.Apply(1/60,{aim:0,moveSpeed:0,meleeCombat:{state:"idle"}},null);
      const idleProtected=actor.characterRig.openingActorPerformanceState?.protected;
      receipts.push({role,explicitPoint,model:actor.characterRig.modelId,idleProtected,samples});
      api.ClearOpeningActorPerformance(soldier);actor.Dispose();
    }
    return receipts;
  });
  await fs.writeFile(path.join(output,"Data_AimedSpeech.json"),JSON.stringify(aimedSpeech,null,2));
  for(const receipt of aimedSpeech){
    assert.ok(receipt.samples.some(sample=>sample.speaking&&sample.head>.035),`${receipt.role}: an aimed speaker visibly acknowledges the line`);
    assert.ok(receipt.samples.filter(sample=>sample.speaking).every(sample=>sample.state.headOnly),`${receipt.role}: aimed speech uses only the head`);
    assert.ok(receipt.samples.filter(sample=>!sample.speaking).every(sample=>sample.head<1e-5),`${receipt.role}: silent combat retains its original head pose`);
    assert.ok(receipt.samples.every(sample=>sample.chest<1e-5&&sample.handMove<1e-5&&sample.handTurn<1e-5&&sample.weaponMove<1e-5&&sample.weaponTurn<1e-5),
      `${receipt.role}: speaking leaves the actual aiming hands, torso and gun unchanged`);
    assert.equal(receipt.idleProtected,false,"an idle melee state is not an attack");
  }
  console.log("ok freely controlled Luo/Zhou aim=1: audible-line head acting preserves hands, torso and weapon; idle melee is not protected");
  const cases=[
    {role:"yaowa",phase:"Supply",kind:"nra",variant:1,clip:"SupplyReceive",freeHand:"handR",minHandM:.04},
    {role:"luo",phase:"Orders",kind:"nra",variant:4,clip:"PointBlockade",freeHand:"handL",minHandM:.07},
    {role:"runner",phase:"Orders",kind:"nra",variant:4,clip:"IjaBayonetGuard",freeHand:"handL",minHandM:.07},
    {role:"heyoutian",phase:"Orders",kind:"nra",variant:1,clip:"IjaBayonetGuard",minHeadRad:.1},
    {role:"liuwencai",phase:"Orders",kind:"nra",variant:4,clip:"IjaBayonetGuard",minHeadRad:.1},
    {role:"interpreter",phase:"Interrogate",kind:"nra",variant:1,clip:"InterpreterPoint",freeHand:"handR",minHandM:.10},
    {role:"ijaA",phase:"Interrogate",kind:"ija",variant:0,clip:"InterrogateCrouch",freeHand:"handR",minHandM:.07},
    {role:"ijaB",phase:"Interrogate",kind:"ija",variant:1,clip:"IjaBayonetGuard",minHeadRad:.1},
    {role:"guard",phase:"Captive",kind:"ija",variant:2,clip:"IjaBayonetGuard",minHeadRad:.1},
    {role:"captiveHelper",phase:"Captive",kind:"nra",variant:1,clip:"CaptiveHeld",freeHand:"handL",minHandM:.1},
    {role:"ijaA",caseName:"ButtStrike",phase:"Butt",kind:"ija",variant:0,clip:"ButtThreat",onceDuration:1.4,minHeadRad:.1},
  ];
  const receipts=[];
  for(const spec of cases){
    await page.evaluate(spec=>{
      const p=window.openingActorPerformanceProbe;
      if(p.soldier){p.g.scene.remove(p.soldier.actor.root);p.soldier.actor.Dispose();}
      const actor=p.g.actorFactory.Create(spec.kind,{modelVariant:spec.variant,weapon:spec.role==="interpreter"||spec.role==="captiveHelper"?null:"HanYang",seed:271});
      actor.root.position.copy(p.r.Point({x:-40,z:-119.5}));p.g.scene.add(actor.root);
      p.soldier={actor,id:spec.role,alive:true,openingStoryboardTravel:0,openingStoryboardPose:{clip:spec.clip,seconds:0}};
      p.api.InstallOpeningStoryboardAnimation(p.soldier);p.spec=spec;p.time=0;p.samples=[];
      p.g.post.NotifyCameraCut();
    },spec);
    for(let frame=0;frame<420;frame+=10){
      const snapshot=await page.evaluate(()=>{
        const p=window.openingActorPerformanceProbe,{soldier:s,spec,T}=p;
        for(let i=0;i<10;i++){
          p.time+=1/60;
          if(spec.onceDuration)s.openingStoryboardPose.seconds=Math.min(spec.onceDuration,p.time);
          const speaking=p.time>=1.2&&p.time<4.4&&!spec.minHeadRad;
          p.api.SetOpeningActorPerformance(s,{role:spec.role,phase:spec.phase,cue:"ActingFixture",line:speaking?1:0,
            speaker:speaking?spec.role:"shunzi",clock:p.time,lineSeconds:speaking?p.time-1.2:p.time,
            lookAt:{x:-40,y:s.actor.root.position.y+1.3,z:-123}});
          s.actor.Update(1/60,{elapsed:p.time,moveSpeed:0,aim:0});
          const b=s.actor.characterRig.bones,Get=key=>b[key].getWorldPosition(new T.Vector3()).sub(s.actor.root.position).toArray();
          if(p.time>.7)p.samples.push({time:p.time,speaking,head:b.head.getWorldQuaternion(new T.Quaternion()).toArray(),
            hand:Get(spec.freeHand||"handL"),feet:[Get("footL"),Get("footR")],state:{...s.actor.characterRig.openingActorPerformanceState},grip:s.actor.characterRig.openingActorGripState});
        }
        p.g.StepFrames(1,1/60,true);
        return {time:p.time};
      });
      if([40,130,280].includes(frame))await page.screenshot({path:path.join(output,`Scene_${spec.caseName||spec.role}_${snapshot.time.toFixed(2)}.png`)});
    }
    const receipt=await page.evaluate(()=>{
      const p=window.openingActorPerformanceProbe,{T,soldier:s,samples}=p;
      const Range=(field,Quaternion=false)=>{
        let max=0;
        for(let a=0;a<samples.length;a+=4)for(let b=a+4;b<samples.length;b+=4){
          const one=samples[a][field],two=samples[b][field];
          max=Math.max(max,Quaternion?new T.Quaternion().fromArray(one).angleTo(new T.Quaternion().fromArray(two)):
            new T.Vector3().fromArray(one).distanceTo(new T.Vector3().fromArray(two)));
        }
        return max;
      };
      let soleRange=0,maxSoleStep=0;
      for(let i=0;i<samples.length;i++)for(let side=0;side<2;side++){
        const foot=new T.Vector3().fromArray(samples[i].feet[side]);
        soleRange=Math.max(soleRange,foot.distanceTo(new T.Vector3().fromArray(samples[0].feet[side])));
        if(i)maxSoleStep=Math.max(maxSoleStep,foot.distanceTo(new T.Vector3().fromArray(samples[i-1].feet[side])));
      }
      const maxWristBend=Math.max(0,...samples.flatMap(row=>Object.values(row.grip?.hands||{}).map(hand=>hand.wristBend)));
      const result={...p.spec,model:s.actor.characterRig.modelId,handRange:Range("hand"),headRange:Range("head",true),soleRange,maxSoleStep,maxWristBend,samples};
      p.api.ClearOpeningActorPerformance(s);
      result.cleared=s.actor.characterRig.openingActorPerformanceState===null;
      return result;
    });
    receipts.push(receipt);
    await fs.writeFile(path.join(output,"Data_ActorPerformance.json"),JSON.stringify(receipts,null,2));
    assert.ok(receipt.headRange>(spec.minHeadRad||.04),`${spec.role}: head/attention must visibly change (${receipt.headRange})`);
    if(spec.minHandM)assert.ok(receipt.handRange>spec.minHandM,`${spec.role}: line has a visible gesture (${receipt.handRange} m)`);
    // Dialogue/guarding keeps the support stance. The actual butt strike steps
    // into its blow; that deliberate step must be continuous, not frozen.
    if(!spec.onceDuration)assert.ok(receipt.soleRange<.035,`${spec.role}: soles remain planted (${receipt.soleRange} m)`);
    assert.ok(receipt.maxSoleStep<.025,`${spec.role}: feet move continuously (${receipt.maxSoleStep} m/frame)`);
    assert.ok(receipt.cleared,"reset restores the actor's unmodified skeleton");
    assert.ok(receipt.maxWristBend<44,`${spec.role}: anatomical wrist bend remains limited (${receipt.maxWristBend})`);
    console.log(`ok ${spec.role} ${receipt.model}: hand ${receipt.handRange.toFixed(3)} m, head ${receipt.headRange.toFixed(3)} rad, sole ${receipt.soleRange.toFixed(4)} m`);
  }
  }
  const corpse=await page.evaluate(()=>{
    const p=window.openingActorPerformanceProbe,{g,r,T}=p;
    if(p.soldier){p.soldier.actor.Dispose();p.soldier=null;}
    g.post.Render=p.render;
    const scene=r.frontShow.bunker,samples=[];
    for(let frame=0;frame<12000;frame++){
      g.StepFrames(1,1/60,false);
      const soldier=scene.Helper;if(!scene.shotFired)continue;
      const actor=soldier.actor,rig=actor.characterRig;
      if(soldier.deadTime<2.5||frame%60===0){
        rig.root.updateMatrixWorld(true);
        const Pos=bone=>bone.getWorldPosition(new T.Vector3()).sub(actor.root.position).toArray();
        samples.push({time:soldier.deadTime,shown:rig.openingStoryboardState?.seconds,
          head:Pos(rig.bones.head),chest:Pos(rig.bones.chest),root:actor.root.position.toArray()});
      }
      if(scene.phase==="Interrogate"&&scene.Age>2){g.StepFrames(3,1/60,true);break;}
    }
    return {samples,phase:scene.phase,alive:scene.Helper.alive};
  });
  await fs.writeFile(path.join(output,"Data_CaptiveCollapse.json"),JSON.stringify(corpse,null,2));
  await page.screenshot({path:path.join(output,"Scene_CaptiveCollapseTerminal.png")});
  assert.equal(corpse.alive,false,"the normal opening actually shoots the captive");
  assert.equal(corpse.phase,"Interrogate","the normal opening continues through discovery and the butt strike");
  const falling=corpse.samples.filter(sample=>sample.time>.91&&sample.time<1.65);
  assert.ok(falling.length>20&&falling.at(-1).shown>=1.6,"settled corpse must finish the authored 1.6-second collapse beyond native AI's 0.9-second freeze");
  const terminal=corpse.samples.filter(sample=>sample.time>2);
  assert.ok(terminal.length>3,"observe the corpse over several seconds after its fall");
  for(const sample of terminal){
    assert.ok(sample.head[1]<.22&&sample.chest[1]<.22,`dead captive head/chest lie down instead of supporting a kneeling push-up (${sample.head[1]}, ${sample.chest[1]})`);
    assert.ok(Math.hypot(...sample.head.map((n,i)=>n-terminal[0].head[i]))<.001,"terminal corpse remains still without replaying the death");
  }
  let maxStep=0;
  for(let i=1;i<falling.length;i++)maxStep=Math.max(maxStep,Math.hypot(...falling[i].head.map((n,j)=>n-falling[i-1].head[j])));
  assert.ok(maxStep<.04,`the remaining collapse advances continuously (${maxStep} m/frame)`);
  console.log("ok normal captive shot: authored collapse completes after AI corpse freeze, rests face down and never replays");
  assert.deepEqual(ctx.errors,[]);
  if(!process.argv.includes("--corpse-only"))console.log("ok five production rigs, dialogue gestures, idle attention, planted soles, clear lifecycle and high-quality rendered frames");
}finally{await CloseCampaign(ctx);}
