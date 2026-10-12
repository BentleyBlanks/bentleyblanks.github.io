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
  const seatedSpeech=await page.evaluate(()=>{
    const p=window.openingActorPerformanceProbe,{T,api}=p;
    const actor=p.g.actorFactory.Create("nra",{modelVariant:1,weapon:"HanYang",seed:407});
    const soldier={actor,id:"yaowa",alive:true,openingStoryboardTravel:0,openingStoryboardPose:{clip:"YaowaSitLoad",seconds:0}};
    api.InstallOpeningStoryboardAnimation(soldier);
    const Read=()=>{
      actor.root.updateMatrixWorld(true);const b=actor.characterRig.bones;
      return {head:b.head.getWorldQuaternion(new T.Quaternion()).normalize(),
        contacts:[b.chest,b.handL,b.handR,actor.weaponGroup].map(node=>({p:node.getWorldPosition(new T.Vector3()),q:node.getWorldQuaternion(new T.Quaternion()).normalize()}))};
    };
    const samples=[];
    for(let frame=0;frame<180;frame++){
      actor.characterRig.openingActorPerformance?.Restore();
      soldier.openingActorPerformance=null;
      soldier.openingStoryboardPose.seconds=frame/60;
      actor.Update(1/60,{elapsed:frame/60,moveSpeed:0,aim:0});
      const before=Read(),talking=frame<120;
      api.SetOpeningActorPerformance(soldier,{role:"yaowa",speaker:talking?"yaowa":null,phase:"Banter",clock:frame/60,lineSeconds:frame/60,lookAt:{x:1,y:1.2,z:-3}});
      actor.characterRig.openingActorPerformance.Apply(1/60,{aim:0,moveSpeed:0},soldier.openingStoryboardPose);
      const after=Read();
      samples.push({talking,head:before.head.angleTo(after.head),headOnly:actor.characterRig.openingActorPerformanceState?.headOnly,
        contactMove:Math.max(...before.contacts.map((node,i)=>node.p.distanceTo(after.contacts[i].p))),
        contactTurn:Math.max(...before.contacts.map((node,i)=>node.q.angleTo(after.contacts[i].q)))});
    }
    api.ClearOpeningActorPerformance(soldier);actor.Dispose();return samples;
  });
  await fs.writeFile(path.join(output,"Data_SeatedLoadingSpeech.json"),JSON.stringify(seatedSpeech,null,2));
  assert.ok(seatedSpeech.some(row=>row.talking&&row.head>.035),"seated Yaowa visibly acknowledges his lines");
  assert.ok(seatedSpeech.filter(row=>row.talking).every(row=>row.headOnly),"loading speech moves only the head");
  assert.ok(seatedSpeech.filter(row=>!row.talking).every(row=>row.head<1e-5),"silent loading retains its authored head pose");
  assert.ok(seatedSpeech.every(row=>row.contactMove<1e-5&&row.contactTurn<1e-5),"loading speech preserves both wrists, chest and rifle contacts");
  console.log("ok seated Yaowa: speech animates the head while both wrists, torso and rifle retain their authored pose");
  const cases=[
    {role:"yaowa",phase:"Banter",kind:"nra",variant:1,clip:"SupplyReceive",freeHand:"handR",minHandM:.04},
    {role:"luo",phase:"Orders",kind:"nra",variant:4,clip:"PointBlockade",freeHand:"handL",minHandM:.07},
    {role:"runner",phase:"Orders",kind:"nra",variant:4,clip:"IjaBayonetGuard",freeHand:"handL",minHandM:.07},
    {role:"heyoutian",phase:"Orders",kind:"nra",variant:1,clip:"IjaBayonetGuard",minHeadRad:.1},
    {role:"liuwencai",phase:"Orders",kind:"nra",variant:4,clip:"IjaBayonetGuard",minHeadRad:.1},
    // Contract §5.1 (v1.3): the interpreter is NRA06 and ijaA is IJA06 (IJA02's clip library), ijaB is IJA01.
    {role:"interpreter",phase:"Interrogation",kind:"nra",variant:5,castId:"interpreter",clip:"InterpreterPoint",freeHand:"handR",minHandM:.10},
    {role:"ijaA",phase:"Interrogation",kind:"ija",variant:5,castId:"ijaA",clip:"InterrogateCrouch",freeHand:"handR",minHandM:.07},
    {role:"ijaB",phase:"Interrogation",kind:"ija",variant:0,clip:"IjaBayonetGuard",minHeadRad:.1},
    {role:"guard",phase:"Interrogation",kind:"ija",variant:2,clip:"IjaBayonetGuard",minHeadRad:.1},
    {role:"comrade",phase:"Interrogation",kind:"nra",variant:1,clip:"CaptiveHeld",freeHand:"handL",minHandM:.1},
    // 2026-09-27: the butt strike is gone (slaps where he lies); ijaA questioning over the pinned man.
    {role:"ijaA",caseName:"Questioning",phase:"Ask",kind:"ija",variant:5,castId:"ijaA",clip:"InterrogateCrouch",freeHand:"handR",minHandM:.07},
  ];
  const receipts=[];
  for(const spec of cases){
    await page.evaluate(spec=>{
      const p=window.openingActorPerformanceProbe;
      if(p.soldier){p.g.scene.remove(p.soldier.actor.root);p.soldier.actor.Dispose();}
      const actor=p.g.actorFactory.Create(spec.kind,{modelVariant:spec.variant,castId:spec.castId,weapon:spec.role==="interpreter"||spec.role==="captiveHelper"?null:"HanYang",seed:271});
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
  // 2026-10-11 redraft (docs/Data_OpeningRedraft20261011Contract.md §4, AnimB): ijaA cuts the kneeling comrade's throat and
  // shoves him on with the knee (IjaThroatCutKneeShove + CaptiveThroatCutForward, 3.5 s, terminal): he pitches forward onto
  // his side, twitches twice and is still. The director kills him at the clip's `dead` event (Script_OpeningStoryboards
  // Slash) and holds the clip's last frame (ComradeCorpse) - the AI's own death pose never replaces it. 2026-10-12 R4-Gates:
  // this block still checked the 09-27 kneel-on-the-bank death (CaptiveWallSlideTwitch, pelvis 0.37 m), and its 14000-frame
  // budget ran out in Slash: the redraft opening reaches Found about 250 s in (blast 106.8 s, blast -> Found end 149.2 s).
  const corpse=await page.evaluate(()=>{
    const p=window.openingActorPerformanceProbe,{g,r,T,api}=p;
    if(p.soldier){p.soldier.actor.Dispose();p.soldier=null;}
    g.post.Render=p.render;
    const scene=r.frontShow.bunker,samples=[];let clipRoot=null,clipSeconds=null,cutAt=null;
    for(let frame=0;frame<30000;frame++){
      g.StepFrames(1,1/60,false);
      const soldier=scene.Comrade;if(!soldier)continue;
      const onClip=soldier.openingStoryboardPose?.clip==="CaptiveThroatCutForward";
      if(!onClip&&soldier.alive)continue;
      cutAt??=r.time;
      const actor=soldier.actor,rig=actor.characterRig;
      clipRoot ||= api.OpeningClipRoot(rig.clipModelId||rig.modelId,"CaptiveThroatCutForward");
      clipSeconds ??= p.library.models.get(rig.clipModelId||rig.modelId)?.clips.CaptiveThroatCutForward?.duration??null;
      const deadTime=soldier.alive?null:soldier.deadTime;
      if(soldier.alive||deadTime<3.6||frame%60===0){
        rig.root.updateMatrixWorld(true);
        const Pos=bone=>bone.getWorldPosition(new T.Vector3()).sub(actor.root.position).toArray();
        samples.push({t:r.time-cutAt,alive:soldier.alive,time:deadTime,shown:rig.openingStoryboardState?.seconds,clip:soldier.openingStoryboardPose?.clip||null,
          head:Pos(rig.bones.head),chest:Pos(rig.bones.chest),pelvis:Pos(rig.bones.pelvis),root:actor.root.position.toArray()});
      }
      if(["Found","Hold","Ask"].includes(scene.phase)&&!soldier.alive&&deadTime>6){g.StepFrames(3,1/60,true);break;}
    }
    return {samples,clipRoot,clipSeconds,phase:scene.phase,alive:scene.Comrade?.alive};
  });
  await fs.writeFile(path.join(output,"Data_CaptiveCollapse.json"),JSON.stringify(corpse,null,2));
  await page.screenshot({path:path.join(output,"Scene_CaptiveCollapseTerminal.png")});
  assert.equal(corpse.alive,false,"the normal opening actually kills the comrade at the wall");
  assert.ok(["Found","Hold","Ask"].includes(corpse.phase),`the normal opening continues past the cut to ijaA finding and questioning Shunzi (${corpse.phase})`);
  const dead=corpse.samples.filter(sample=>!sample.alive);
  assert.ok(corpse.clipSeconds>3&&dead.length>20&&dead.every(sample=>sample.clip==="CaptiveThroatCutForward"),
    `the dead comrade stays on his authored CaptiveThroatCutForward, never the AI's own death (${JSON.stringify(dead.find(s=>s.clip!=="CaptiveThroatCutForward")||null)})`);
  const terminal=dead.filter(sample=>sample.time>3.5);
  assert.ok(terminal.length>3,"observe the corpse over several seconds after the fall");
  assert.ok(terminal.every(sample=>sample.shown>=corpse.clipSeconds-1/30),
    `the corpse rests on the clip's last frame (${terminal.map(s=>s.shown).join("/")} of ${corpse.clipSeconds} s)`);
  // Clip root pelvisHeight: 0.40 m kneeling at the first frame, 0.15 m lying on his side at the terminal frame.
  const kneelStart=corpse.clipRoot?.start?.[3],lyingEnd=corpse.clipRoot?.end?.[3];
  assert.ok(Number.isFinite(kneelStart)&&Number.isFinite(lyingEnd)&&lyingEnd<kneelStart-.15,
    `CaptiveThroatCutForward clip root data gives the kneel and the lying heights (${JSON.stringify(corpse.clipRoot)})`);
  for(const sample of terminal){
    assert.ok(Math.abs(sample.pelvis[1]-lyingEnd)<.04,
      `dead comrade lies at the clip's terminal pelvis height ${lyingEnd} m (${sample.pelvis[1]})`);
    assert.ok(sample.pelvis[1]<terminal[0].pelvis[1]+.005,
      `dead comrade does not rise back up after falling (${sample.pelvis[1]}, first terminal ${terminal[0].pelvis[1]})`);
    assert.ok(Math.hypot(...sample.head.map((n,i)=>n-terminal[0].head[i]))<.001,"terminal corpse remains still without replaying the death");
  }
  // The cut, the shove and the fall forward play continuously from the first cut frame to the rest: no frame's head step
  // stands out from both of its neighbours (a pop or a re-pose), and nothing moves at the director's kill (the clip's
  // `dead` event) or where the clip ends. The fall itself is fast: the head peaks at 0.115 m per 60 Hz frame (6.9 m/s) on
  // a bell from 0.03 m when he hits the mud (2026-10-12 probe), each step at most 0.94 x its larger neighbour + 1 cm.
  const fall=corpse.samples.filter(sample=>sample.t<=(corpse.clipSeconds??3.5)+.5);
  const steps=fall.map((sample,i)=>i?Math.hypot(...sample.head.map((n,j)=>n-fall[i-1].head[j])):0);
  const killAt=fall.findIndex(sample=>!sample.alive),endAt=fall.findIndex(sample=>sample.shown>=corpse.clipSeconds-1/30);
  const pop=steps.findIndex((v,i)=>i>1&&i<steps.length-1&&v>2*Math.max(steps[i-1],steps[i+1])+.01),maxStep=Math.max(...steps);
  assert.ok(fall.length>150&&killAt>0&&endAt>0&&pop<0&&maxStep<.15&&steps[killAt]<.005&&steps[endAt]<.005,
    `the fall advances continuously (max ${maxStep} m/frame, pop at ${pop}, kill step ${steps[killAt]}, clip end step ${steps[endAt]}, ${fall.length} frames)`);
  console.log(`ok normal comrade death: the authored throat cut and fall forward play through the kill, rest lying on the clip's last frame (pelvis ${terminal.at(-1).pelvis[1].toFixed(3)} m, clip ${lyingEnd} m, fall step ${maxStep.toFixed(3)} m/frame) and never replay`);
  assert.deepEqual(ctx.errors,[]);
  if(!process.argv.includes("--corpse-only"))console.log("ok five production rigs, dialogue gestures, idle attention, planted soles, clear lifecycle and high-quality rendered frames");
}finally{await CloseCampaign(ctx);}
