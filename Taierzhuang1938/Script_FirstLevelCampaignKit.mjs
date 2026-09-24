// 第一关整关驾驶脚本的公共部分（纯 Node 测试脚本，不进 index.html import map）。
//
// 2026.09.19 重构之后，整关驾驶由四个文件分担：
//   · 本文件            浏览器/服务起停、注入页面的输入驱动器、七个通用动作、--audio 逐条解码检查
//   · Script_FirstLevelCampaignFront.mjs   阶段 1–7
//   · Script_FirstLevelCampaignMid.mjs     阶段 8–14
//   · Script_FirstLevelCampaignEnd.mjs     阶段 15–18
//   · Script_FirstLevelMissionBrowserTest.mjs  薄编排器：解析参数、依次驱动三段、收尾断言
//
// 拆开的理由：第二波三个玩法包要并行写各自那一段的驾驶脚本，不该都改同一个 1700 行文件。
//
// 状态一律走 `ctx`，模块级不留任何可变全局：
//   ctx.page           playwright 页面
//   ctx.browser        浏览器实例
//   ctx.server         临时静态服务
//   ctx.output         证据目录（_shots/<suite>，忽略目录）
//   ctx.errors         页面异常（pageerror）累积
//   ctx.options        ParseCampaignArgs 的结果
//   ctx.stageJumps     是否允许调试跳转（false 时 JumpStage 直接 return）
//   ctx.stageFrom      这一趟从哪个公开阶段开始
//   ctx.jumpReceipts   每次跳转的回执（Data_JumpContinuation.json）
//   ctx.campaignRetries 检查点重试回执（Data_NormalCheckpointRetries.json）
//   ctx.capturedActivities 只拍一次的现场（Set）
//
// 动作从 `CampaignActions(ctx)` 取：JumpStage / Capture / CaptureFocus /
// WaitOutCutscene / Route / Interact / RetryCampaign / WaitStage。
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { MISSION_DIALOGUE } from "./Data_FirstLevelMissionDialogue.mjs";
import { MISSION_TUNING as R } from "./Data_FirstLevelMission.mjs";
import { SCENE_RENDER_LIMITS } from "./Data_AssetStandards.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// How many explicitly opted-in checkpoint retries one leg may spend before the
// route is called unwalkable. Normal campaign evidence fails on the first death.
const ROUTE_RETRY_BUDGET = 2;

/** 分段驾驶脚本允许的起点：每一段的第一个公开阶段。 */
export const CAMPAIGN_SEGMENT_STARTS = Object.freeze([8, 11, 15, 18]);
/** `--stage-to` 允许的终点：Front 段末（7）、Mid 段末（14）、整关（18）。 */
export const CAMPAIGN_SEGMENT_ENDS = Object.freeze([3, 6, 7, 14, 18]);

export function ParseCampaignArgs(argv = process.argv) {
  const Has = (flag) => argv.includes(flag);
  const stageJumps = Has("--stage-jumps");
  const raw = argv.find((arg) => arg.startsWith("--stage-from="))?.split("=")[1];
  const stageFrom = Number(raw || 1);
  assert.ok(
    stageFrom === 1 || stageFrom === 3 || (stageJumps && CAMPAIGN_SEGMENT_STARTS.includes(stageFrom)),
    "continuation suites start at 1 or at a segment boundary (" + CAMPAIGN_SEGMENT_STARTS.join(" / ") + ")",
  );
  // 只跑某一段到它的末尾（`--stage-to=7` = Front 包的 1–7）。默认 18 = 整关走到 Complete。
  // 分段跑出来的证据目录与整关分开，一段跑通不许冒充通关。
  const toRaw = argv.find((arg) => arg.startsWith("--stage-to="))?.split("=")[1];
  const stageTo = Number(toRaw || 18);
  assert.ok(CAMPAIGN_SEGMENT_ENDS.includes(stageTo), "segment suites end at " + CAMPAIGN_SEGMENT_ENDS.join(" / "));
  assert.ok(stageTo >= stageFrom, "a segment cannot end before it starts");
  return {
    campaign: Has("--campaign"),
    audioCheck: Has("--audio"),
    probeFrontGun: Has("--probe-front-gun"),
    stageJumps,
    // 专项回归才允许主动排入一条带路短命令，验证静默窗口会取消它且不锁院门。
    // 默认整关/分段驾驶只观察运行时自主产生的 cue，不能改写真实语音排队。
    quietGuidanceInterruptProbe: Has("--probe-quiet-guidance-interrupt"),
    allowCheckpointRetry: Has("--allow-checkpoint-retry"),
    stageFrom, stageTo,
    suite: stageFrom === 3 ? "FirstLevelFrontTopology" : stageTo === 3 ? "FirstLevelOpeningStoryboards" : stageTo === 7 ? "FirstLevelStageFront"
      : stageTo === 14 ? "FirstLevelStageMiddle"
        : stageFrom === 8 ? "FirstLevelStageVillage"
          : stageFrom === 11 ? "FirstLevelStageTransfer"
            : stageFrom === 15 ? "FirstLevelStageRegroup"
              : stageFrom === 18 ? "FirstLevelStageTail"
                : stageJumps ? "FirstLevelStageContinue" : "FirstLevelMission",
  };
}

/** 起服务、起浏览器、开页面，返回 ctx。 */
export async function OpenCampaign(options) {
  const output = path.join(here, "_shots", options.suite);
  await fs.mkdir(output, { recursive: true });
  const server = await ServeRoot(root, 0);
  const browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (error) => { errors.push(String(error)); console.log("PAGEERROR", String(error)); });
  const ctx = {
    page, browser, server, output, errors, options,
    stageJumps: options.stageJumps, stageFrom: options.stageFrom, stageTo: options.stageTo,
    jumpReceipts: [], campaignRetries: [], capturedActivities: new Set(),
  };
  await page.goto(
    `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&${options.audioCheck ? "menu=0" : "shot=1"}&manual=1${options.stageFrom===3?"&missionStage=3":""}&quality=${options.quality||"low"}&scale=small`,
    { waitUntil: "domcontentloaded", timeout: 180000 },
  );
  await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 180000 });
  return ctx;
}

/** 收尾：证据落盘、关浏览器、关服务。失败与成功走同一条。 */
export async function CloseCampaign(ctx) {
  await fs.writeFile(path.join(ctx.output, "Data_NormalCheckpointRetries.json"),
    JSON.stringify(ctx.campaignRetries, null, 2));
  await ctx.browser.close();
  await new Promise((resolve) => ctx.server.close(resolve));
}

/** 失败时的现场：任务状态、截图、开机文字。 */
export async function CaptureFailure(ctx) {
  await ctx.page.evaluate(() => window.Tengxian?.Debug.FirstLevelMission())
    .then((state) => fs.writeFile(path.join(ctx.output, "Data_Failure.json"), JSON.stringify(state, null, 2)))
    .catch(() => {});
  await ctx.page.screenshot({ path: path.join(ctx.output, "Scene_Failure.png") }).catch(() => {});
  console.error(await ctx.page.evaluate(() => ({
    boot: document.querySelector("#bootText")?.textContent,
    body: document.body.innerText.slice(-1800),
  })).catch(() => null));
}

/**
 * `--audio`：真按开始键解锁音频上下文，再逐条 cue 走真实解码与播放。
 * 车厢环境床那几条随军列开场一起下线，不再检查。
 */
export async function CheckVoiceAssets(ctx, ids = null) {
  const { page } = ctx;
  await page.locator("#bootStart").click();
  await page.waitForFunction(() => window.Tengxian.audio.ctx?.state === "running", null, { timeout: 15000 });
  const voices = await page.evaluate(async ids => {
    const g = window.Tengxian, { MISSION_DIALOGUE } = await import("./Data_FirstLevelMissionDialogue.mjs");
    g.audio.Unlock();
    const cues = MISSION_DIALOGUE.filter(cue=>!ids||ids.includes(cue.id)).map((cue) => {
      const played = g.audio.PlayStoryVoice(`Mission${cue.id}`);
      return { id: cue.id, decoded: !!g.audio.voiceBank.get(`Mission${cue.id}`),
        seconds: played?.duration || 0, started: !!played?.voice };
    });
    g.audio.StopStoryVoice();
    return { context: g.audio.ctx?.state, cues };
  },ids);
  assert.equal(voices.context, "running", "The real start button unlocks the audio context");
  assert.equal(voices.cues.length, ids?.length||MISSION_DIALOGUE.length, "every selected cue is checked");
  assert.ok(voices.cues.every((cue) => cue.decoded && cue.started && cue.seconds > 0.5),
    "Every whole Seed Audio cue must decode and create a real playback source: "
    + JSON.stringify(voices.cues.filter((cue) => !(cue.decoded && cue.started && cue.seconds > 0.5))));
  await fs.writeFile(path.join(ctx.output,"Data_VoicePlayback.json"),JSON.stringify(voices,null,2));
  console.log("ok selected first-level voice assets decoded and played in the real audio engine");
  // Ambience loads on its own schedule; wait for the shipped loader, inject nothing.
  await page.waitForFunction(() => window.Tengxian.audio.ambReady && !window.Tengxian.audio.ambLoading,
    null, { timeout: 60000 });
}

/** 把逐帧输入驱动器装进页面：躲手榴弹 / 选目标 / 射击 / 近战。 */
export async function InstallInputDriver(ctx) {
  await ctx.page.evaluate(async () => {
          const g = window.Tengxian;
          // 躲手榴弹这一段读的是真实爆炸口径（爆心抬高、命中高度、判墙余量）。
          // 以前这里直接写 BLAST，可页面作用域里根本没有这个名字 —— 只要真有一颗
          // 手榴弹落到玩家附近，整条驾驶就炸在 "BLAST is not defined" 上（04 实测）。
          const { BLAST } = await import("./Data_Tuning_Combat.mjs");
          window.MissionInputDriver = {
            blocked: new Map(),
            EvadeGrenade() {
              const p=g.player,threat=g.combat.GrenadeThreats(p.position).find(t=>{
                const from=t.position.clone();from.y+=BLAST.originRiseM;
                const ray=p.position.clone();ray.y+=BLAST.playerHitRiseM;ray.sub(from);
                const d=ray.length(),hit=d>BLAST.wallMarginM?g.battlefield.Raycast(from,ray.normalize(),d,{terrain:true}):null;
                return !hit||hit.t>=d-BLAST.wallMarginM;
              });
              if(!threat){
                if(this.evading){g.Debug.Key("KeyW",false);g.Debug.Key("ShiftLeft",false);this.evading=false;}
                return false;
              }
              // Read the same live warning used by the HUD, then turn and sprint
              // through an open physical direction. Do not clear the projectile.
              const away=Math.atan2(p.position.x-threat.position.x,p.position.z-threat.position.z);
              let heading=null;
              for(const offset of [0,.55,-.55,1.1,-1.1,1.65,-1.65]){
                const angle=away+offset,x=p.position.x+Math.sin(angle)*1.2,z=p.position.z+Math.cos(angle)*1.2;
                const y=g.battlefield.GroundHeight(x,z);
                if(Math.abs(y-p.position.y)<.4&&!g.physics.Overlaps(x,y+.04,z,p.radius,1.78)){heading=angle;break;}
              }
              if(heading==null)return false;
              if(p.stance!=="stand")g.Debug.Key(p.stance==="crouch"?"KeyC":"KeyZ");
              const yaw=heading+Math.PI,gap=Math.atan2(Math.sin(yaw-p.yaw-p.aimYaw),Math.cos(yaw-p.yaw-p.aimYaw));
              g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
              g.Debug.Look(Math.max(-30,Math.min(30,-gap/.0022)),0);
              g.Debug.Key("KeyW",Math.abs(gap)<.3);g.Debug.Key("ShiftLeft",true);
              this.evading=true;this.evadeFrames=(this.evadeFrames||0)+1;
              return true;
            },
            Target(maxRange=90) {
              // A real bind has priority over an unobstructed distant rifle target.
              const opponent=g.meleeCombat.qte.active?.attacker;
              if(g.meleeCombat.Active && opponent?.alive)return opponent;
              if(this.observedShot!==g.state.playerShots) {
                this.observedShot=g.state.playerShots;
                if(this.lastTarget && g.state.lastShot?.hitKind==="wall")this.blocked.set(this.lastTarget,g.ai.time+4);
              }
              const eye = g.player.EyePosition;
              return g.ai.soldiers
                .filter(
                  (a) =>
                    a.side === "ija" &&
                    a.alive &&
                    !a.scriptedNoncombatant &&
                    (this.blocked.get(a.id)||0) < g.ai.time &&
                    a.position.distanceTo(eye) < maxRange,
                )
                .sort((a, b) => (a.missionId===this.priorityTarget?-1:0)-(b.missionId===this.priorityTarget?-1:0) || a.position.distanceToSquared(eye) - b.position.distanceToSquared(eye))
                .find((a) => {
                  const to = a.position.clone();
                  to.y += a.missionId===this.priorityTarget ? 1.2 : a.stance === 2 ? 0.3 : a.stance === 1 ? 0.85 : 1.2;
                  const d = to.sub(eye),
                    length = d.length(),
                    hit = g.battlefield.Raycast(eye, d.normalize(), length, {terrain:true});
                  return !hit || hit.t >= length - 0.25;
                });
            },
            Shoot(foe) {
              if(g.meleeCombat.Active){
                g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
                g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);return;
              }
              this.lastTarget=foe.id;
              g.Debug.Mouse(0, false);
              const eye = g.player.EyePosition,
                to = foe.position.clone();
              to.y += foe.missionId===this.priorityTarget ? 1.2 : foe.stance === 2 ? 0.3 : foe.stance === 1 ? 0.85 : 1.2;
              const dx = to.x - eye.x,
                dz = to.z - eye.z,
                yaw = Math.atan2(-dx, -dz),
                gap = Math.atan2(Math.sin(yaw - g.player.yaw), Math.cos(yaw - g.player.yaw));
              g.player.yaw += Math.max(-0.06, Math.min(0.06, gap));
              g.player.pitch = Math.atan2(to.y - eye.y, Math.hypot(dx, dz)) - g.player.aimPitch;
              g.player.yaw -= g.player.aimYaw;
              const distance=foe.position.distanceTo(g.player.position),fighter=g.meleeCombat.Fighter(g.player);
              // Mobile enemies now reach real bayonet contact. The campaign maps V
              // to the equipped melee slot (Dadao), so keep that weapon out through
              // contact instead of switching back to the rifle on every frame.
              // A swing the scenery keeps catching (the nest gunner crouched behind his gun block: every cut ends
              // "Obstructed") is a wall, like a shot that hits one: use the rifle on him for 4 s instead (09-24 Front idle
              // probe U1: 16 s of blocked dadao cuts at 0.8 m, empty rifle never reloaded, killed by the link guard).
              this.obstructed ||= new Map();
              if(fighter?.state==="stagger"&&(fighter.clip==="Obstructed"||fighter.clip==="WeaponClash"))this.obstructed.set(foe.id,g.ai.time+4);
              if(distance<3 && Math.abs(gap)<.2 && !((this.obstructed.get(foe.id)||0)>g.ai.time)){
                g.Debug.Mouse(2,false);
                if(g.state.activeSlot!=="melee"){g.Debug.Key("KeyV");return;}
                if(!fighter.weapon)return;
                this.meleeResponses=(this.meleeResponses||0)+1;
                if(g.meleeCombat.Active){g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);}
                else if(fighter.state==="idle"){
                  const attacker=g.meleeCombat.Fighter(foe);
                  if(attacker.attack && attacker.t>attacker.attack.windup-.13 && attacker.t<attacker.attack.windup
                    && distance<attacker.attack.reach){g.Debug.Mouse(2,true);g.Debug.Mouse(2,false);}
                  else if(distance<2.3){g.Debug.Mouse(0,true);g.Debug.Mouse(0,false);}
                }
                return;
              }
              if(g.state.activeSlot!=="primary"){g.Debug.Key("Digit1");return;}
              g.Debug.Mouse(2, true);
              if (g.state.ammo === 0) g.Debug.Key("KeyR");
              else if (Math.abs(gap) < 0.06) g.Debug.Mouse(0, true);
            },
          };
  });
}

/** 七个通用动作，全部闭包在 ctx 上（模块级不留可变全局）。 */
export function CampaignActions(ctx) {
  const { page, output, errors } = ctx;
  const { audioCheck, allowCheckpointRetry } = ctx.options;
  const stageJumps = ctx.stageJumps, stageFrom = ctx.stageFrom;
  const jumpReceipts = ctx.jumpReceipts, campaignRetries = ctx.campaignRetries;
  const capturedActivities = ctx.capturedActivities;
  void errors; void audioCheck;

  async function JumpStage(number) {
    if (!stageJumps) return;
    const receipt = await page.evaluate(async number => {
      const g=window.Tengxian, before=g.Debug.FirstLevelMission();
      const after=await g.Debug.FirstLevelJump(number);
      // Test driver memory belongs to the old actors, just like the old runtime.
      if(window.MissionInputDriver){window.MissionInputDriver.blocked.clear();window.MissionInputDriver.lastTarget=null;window.MissionInputDriver.observedShot=0;}
      return {number,before:before.stage,beforePhase:before.phaseNumber,after:after.stage,phase:after.phaseNumber,remaining:after.remaining};
    },number);
    assert.equal(receipt.phase,number);assert.ok(receipt.remaining.length);
    if(number>stageFrom)assert.equal(receipt.beforePhase,number,"previous debug start reaches the next public phase before restarting it");
    jumpReceipts.push(receipt);console.log("STAGE_JUMP",JSON.stringify(receipt));
  }

  async function Capture(name) {
    await page.evaluate(() => window.Tengxian.StepFrames(6, 1 / 60, true));
    const render = await page.evaluate(() => {
      const g = window.Tengxian,
        info = g.renderer.info,
        reset = info.autoReset;
      info.autoReset = false;
      info.reset();
      g.StepFrames(1, 1 / 60, true);
      const result = { drawCalls: info.render.calls, triangles: info.render.triangles };
      // 预算读数旁边带上「谁在花」：活人 / 尸体 / LOD 分布、蒙皮数，以及按场景根节点拆的三角形。
      // 超预算时光看一个总数定不了责任，A/B 两棵树各跑一遍就能看出是布景、人物还是尸体在涨。
      const soldiers = g.ai ? g.ai.soldiers : [];
      const lod = {};
      for (const s of soldiers) { const k = (s.alive ? "" : "dead:") + (s.renderLod || "none"); lod[k] = (lod[k] || 0) + 1; }
      let skinned = 0, meshes = 0;
      g.scene.traverse((o) => { if (o.isSkinnedMesh) skinned++; if (o.isMesh && o.visible) meshes++; });
      result.actors = { total: soldiers.length, alive: soldiers.filter((s) => s.alive).length,
        ija: soldiers.filter((s) => s.alive && s.side === "ija").length, nra: soldiers.filter((s) => s.alive && s.side === "nra").length, lod, skinned, meshes };
      result.roots = g.scene.children.map((c) => { let tris = 0, m = 0; c.traverse((o) => { if (o.isMesh && o.visible) { m++; const geo = o.geometry; const n = (geo.index ? geo.index.count : geo.attributes.position?.count || 0) / 3; tris += n * (o.isInstancedMesh ? o.count : 1); } }); return { name: c.name || c.type, m, tris: Math.round(tris) }; }).filter((r) => r.tris > 20000).sort((a, b) => b.tris - a.tris).slice(0, 14);
      info.autoReset = reset;
      return result;
    });
    console.log("BUDGET", name, JSON.stringify(render));
    if(name==="MachineGun") {
      const timing=await page.evaluate(async()=>{
        const {Box3,Vector3}=await import("three");
        const g=window.Tengxian,gl=g.renderer.getContext(),samples=[];
        for(let i=0;i<24;i++){const start=performance.now();g.StepFrames(1,1/60,true);gl.finish();if(i>=4)samples.push(performance.now()-start);}
        samples.sort((a,b)=>a-b);
        const reducedBounds=Object.fromEntries([...g.ai.crowd.kinds].map(([key,entry])=>{
          const bounds=new Box3();for(const mesh of entry.meshes){mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox);}
          return [key,bounds.getSize(new Vector3()).toArray()];
        }));
        return {method:"synchronous simulation and GPU completion, 4 warmup and 20 measured frames",p50Ms:samples[10],p95Ms:samples[19],reducedBounds,
          actualLivingEnemies:g.ai.soldiers.filter(actor=>actor.alive && actor.side==="ija").length,
          front:g.Debug.FirstLevelMission().assault,crowd:g.ai.crowd?.BakeReport(),cellM:g.ai.crowd?.cellM};
      });
      await fs.writeFile(path.join(output,"Data_FrontFrameTiming.json"),JSON.stringify(timing,null,2));
      const standing=Object.entries(timing.crowd).filter(([key])=>key.endsWith(":standing"));
      assert.ok(timing.cellM>0 && standing.length>=2 && standing.every(([,entry])=>entry.bodySpan>1.2),"the optimized standing crowd retains human-sized bodies");
      for(const [key,entry] of Object.entries(timing.crowd))assert.ok(entry.size.every((size,axis)=>Math.abs(size-timing.reducedBounds[key][axis])<=2*Math.sqrt(3)*timing.cellM),"clustering preserves the original pose bounds: "+key);
    }
    assert.ok(
      render.drawCalls <= SCENE_RENDER_LIMITS.drawCalls && render.triangles <= SCENE_RENDER_LIMITS.triangles,
      `${name} must fit the shared whole-frame rendering budget: ${JSON.stringify(render)}`,
    );
    await page.screenshot({ path: path.join(output, `Scene_${name}.png`) });
    await fs.writeFile(
      path.join(output, `Data_${name}.json`),
      JSON.stringify(
        await page.evaluate(() => ({
          mission: window.Tengxian.Debug.FirstLevelMission(),
          position: { ...window.Tengxian.player.position },
          health: window.Tengxian.player.health,
          medical:{bleeding:window.Tengxian.player.bleeding,bandages:window.Tengxian.player.bandages,
            regenTo:window.Tengxian.player.bandageRegenTo},
          damage:window.missionDamage?.slice(-12),
          cast: window.Tengxian.ai.soldiers
            .filter((a) => a.castId)
            .map((a) => ({
              id: a.castId,
              position: { ...a.position },
              goal: { ...a.goal },
              stance: a.stance,
              unloaded: a.missionUnloaded,
              exitIndex: a.missionExitIndex,
              speedMps:a.moveSpeed*3.6,scriptSpeedMps:a.scriptMoveSpeedMps,yaw:a.yaw,
              march:a.squadMarchCommand,targetVisible:a.targetVisible,
              route:window.Tengxian.Debug.FirstLevelMissionRuntime().squadRoutes.get(a.id)?.slice(0,3),
            })),
        })),
        null,
        2,
      ),
    );
  }

  /**
   * 把视线甩到一个**世界坐标点**上拍一张，拍完原样还回去。
   *
   * `point` 必须带有限的 x / z。**这一条不许省**：传进来一个没有坐标的状态对象
   * （实拍 2026-09-20：18 的 `shot.bridgeColumn` 只有 id/progress/crossed，没有 x/z）
   * 会算出 `Math.atan2(NaN, NaN)` —— 玩家的 yaw/pitch 当场变 NaN，拍照那几帧
   * `player.Update` 就把 **velocity 也算成 NaN**；yaw/pitch 后面被还原了，速度没有，
   * 于是从这一刻起玩家八个方向一步都走不动，看上去像「撤到南岸卡住了」。
   * 静默的 NaN 传染最难查，所以这里直接翻红。
   */
  async function CaptureFocus(name,point) {
    assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.z),
      `CaptureFocus(${name}) 需要带有限 x/z 的世界坐标点，收到 ${JSON.stringify(point)}`);
    const view=await page.evaluate(point=>{
      const g=window.Tengxian,p=g.player.position,eye=g.player.EyePosition;
      const previous={yaw:g.player.yaw,pitch:g.player.pitch};
      g.player.yaw=Math.atan2(p.x-point.x,p.z-point.z);
      g.player.pitch=Math.atan2(g.battlefield.GroundHeight(point.x,point.z)+(point.height||1.2)-eye.y,Math.hypot(p.x-point.x,p.z-point.z));
      return previous;
    },point);
    await Capture(name);
    await page.evaluate(view=>Object.assign(window.Tengxian.player,view),view);
  }
  // How many checkpoint retries one leg may spend before the route is called
  // unwalkable. Two covers an unlucky firefight; a leg that needs more is telling


  /**
   * 等一场关中过场播完（不按 Esc：这条测试要的就是「玩家坐着看完」的时序）。
   * Route 的内循环自己会等；这一只给循环之外的按键动作用（上机枪、补弹、交互）。
   */
  async function WaitOutCutscene(label) {
    if (!(await page.evaluate(() => !!window.Tengxian.state.cutscene))) return false;
    const id = await page.evaluate(() => window.Tengxian.state.cutscene);
    console.log("CUTSCENE_WAIT", label, id);
    for (let i = 0; i < 60; i += 1) {
      await page.evaluate(() => {
        const g = window.Tengxian;
        g.Debug.Key("KeyW", false); g.Debug.Mouse(0, false); g.Debug.Mouse(2, false);
        g.StepFrames(120, 1 / 60, false);
      });
      if (!(await page.evaluate(() => !!window.Tengxian.state.cutscene))) {
        console.log("CUTSCENE_DONE", label, id);
        return true;
      }
    }
    throw new Error(`关中过场 ${id} 在 ${label} 处两分钟都没播完`);
  }

  /**
   * `stopFact`：**这条路线走到这个事实就算走完**，剩下的路点一步也不再走。
   *
   * 编排里有几段是「走到某个距离门就被接管」的（18 的 marchOut：离锚点 8 m 就起
   * 黑屏转场，黑屏里玩家被瞬移到 nightSpawn）。驾驶器不知道这回事的话，接管一结束
   * 它还攥着同一个路点，会把刚被瞬移过去的人**原路赶回来** —— 实拍 2026-09-20：
   * 人确实到了 nightSpawn(−160,292)，转场结束后又被驾驶器走了 110 m 回到 marchOut，
   * 于是「黑屏里那一下瞬移没生效」看着像引擎的锅，其实是驾驶器自己走回去的。
   */
  async function Route(points, label, { fight = false, stance = "stand", sprint = false, crawl = false, rejoinRoute = null, stopFact = null, arrivalM = 0.8, recoverAfterEvade = false } = {}) {
    let routeGuardHp;
    const rejoinTarget=points.at(-1);
    await page.evaluate(
      async ({ points, stance, sprint, rejoinRoute, rejoinTarget }) => {
        const g = window.Tengxian;
        if(rejoinRoute){
          const {MissionRouteBetween}=await import("./Script_FirstLevelMissionColumn.mjs");
          points=MissionRouteBetween(rejoinRoute,g.player.position,rejoinTarget);
        }
        window.routeBot = { points, corridor:points, index: 0, frames: 0, stalled: 0, last: { ...g.player.position } };
        if (g.player.stance !== stance)
          g.Debug.Key(
            stance === "crouch"
              ? "KeyC"
              : stance === "prone"
                ? "KeyZ"
                : g.player.stance === "crouch"
                  ? "KeyC"
                  : "KeyZ",
          );
        g.Debug.Key("ShiftLeft", sprint);
      },
      { points, stance, sprint, rejoinRoute, rejoinTarget },
    );
    const carriedKind=await page.evaluate(()=>window.Tengxian.carry.KindId);
    let result, retries = 0;
    for (let chunk = 0; chunk < 90; chunk++) {
      result = await page.evaluate(async ({fight,stance,crawl,sprint,stopFact,arrivalM,recoverAfterEvade}) => {
        const {FRONT_SORTIE}=await import("./Data_FirstLevelFrontRoute.mjs");
        const {MissionRouteProjection, MissionRoutePoint, MissionRouteNextIndex}=await import("./Script_FirstLevelMissionColumn.mjs");
        const g = window.Tengxian,
          b = window.routeBot,
          Wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
        const Reached = () => !!stopFact && g.Debug.FirstLevelMissionRuntime().flow.facts.has(stopFact);
        if (Reached()) b.index = b.points.length;
        for (let i = 0; i < 600 && b.index < b.points.length && g.player.alive && g.state.running; i++) {
          const p = g.player.position,
            target = b.points[b.index];
          // 这一段的接管条件到了：松手，剩下的路点交给编排（黑屏瞬移就在这儿发生）。
          if (Reached()) { b.index = b.points.length; break; }
          if (Math.hypot(p.x - target.x, p.z - target.z) < arrivalM) {
            b.index++;
            continue;
          }
          // 关中过场（04 机枪点位那一场）：玩家这时候没有控制权，什么键都递不进去。
          // 像玩家一样等它播完 —— 松手、照常推帧、这一段不算进停滞计数
          // （44 s 不动的话，下面那条「三个 chunk 没挪窝就算走不通」会把整条路判死）。
          if (g.state.cutscene) {
            g.Debug.Key("KeyW", false);
            g.Debug.Mouse(0, false);
            g.Debug.Mouse(2, false);
            b.cutsceneFrames = (b.cutsceneFrames || 0) + 1;
            b.cutscenes = b.cutscenes || {};
            b.cutscenes[g.state.cutscene] = (b.cutscenes[g.state.cutscene] || 0) + 1;
            g.StepFrames(1, 1 / 60, false);
            b.frames++;
            continue;
          }
          const evading=crawl&&fight&&window.MissionInputDriver.EvadeGrenade();
          if(recoverAfterEvade){
            if(evading)b.wasEvading=true;
            else if(b.wasEvading){
              b.wasEvading=false;
              const projection=MissionRouteProjection(b.corridor,p);
              const next=b.corridor[MissionRouteNextIndex(b.corridor,p)];
              // Also when the dodge carried us back past a corner while staying on the corridor
              // (2026-09-24: a nest guard's grenade sent the bot 10 m back west in the 03 approach
              // trench, still within 1 m of the corridor, and the straight line to the old next
              // corner cut through the trench wall - stuck for good).
              if(projection.distance>arrivalM+.2||b.points[b.index]!==next){
                // Re-enter the checked corridor using normal movement before
                // resuming the next corner; a grenade may leave us behind a wall.
                b.points=[MissionRoutePoint(b.corridor,projection.progress),
                  ...b.corridor.slice(MissionRouteNextIndex(b.corridor,p))];
                b.index=0;b.evadeRejoins=(b.evadeRejoins||0)+1;continue;
              }
            }
          }
          const foe = fight&&!evading ? window.MissionInputDriver.Target(crawl?28:90) : null;
          if(crawl&&!evading){
            const low=FRONT_SORTIE.crawl.some(c=>Math.abs(p.x-c.x)<c.w/2+1 && Math.abs(p.z-c.z)<c.d/2+3);
            const desired=low?"prone":stance;
            if(g.player.stance!==desired)g.Debug.Key(desired==="prone"?"KeyZ":desired==="crouch"?"KeyC":g.player.stance==="prone"?"KeyZ":"KeyC");
            g.Debug.Key("ShiftLeft",sprint&&!low&&!foe);
          }
          if(evading){g.StepFrames(1,1/60,false);b.frames++;continue;}
          if (foe) {
            g.Debug.Key("KeyW", false);
            window.MissionInputDriver.Shoot(foe);
          } else {
            g.Debug.Mouse(0, false);
            g.Debug.Mouse(2, false);
            const yaw = Math.atan2(p.x - target.x, p.z - target.z);
            const gap = Wrap(yaw - g.player.yaw);
            g.Debug.Key("KeyW", Math.abs(gap) < 0.65);
            g.player.yaw += Math.max(-0.04, Math.min(0.04, gap));
            g.player.pitch = 0;
          }
          if (g.player.bleeding && g.player.health < 80) g.Debug.Key("KeyB");
          g.StepFrames(1, 1 / 60, false);
          b.frames++;
        }
        g.Debug.Key("KeyW", false);
        g.Debug.Mouse(0, false);
        g.Debug.Mouse(2, false);
        const chunkCutscene = b.cutsceneFrames || 0;
        b.cutsceneFrames = 0;
        b.stalled = chunkCutscene > 0 ? 0
          : (Math.hypot(g.player.position.x - b.last.x, g.player.position.z - b.last.z) < 0.2 ? b.stalled + 1 : 0);
        b.last = { ...g.player.position };
        return {
          done:
            b.index === b.points.length ||
            (g.Debug.FirstLevelMissionRuntime().flow.completed &&
              Math.hypot(g.player.position.x - b.points.at(-1).x, g.player.position.z - b.points.at(-1).z) < 5),
          index: b.index,
          target: b.points[b.index],
          position: { ...g.player.position },
          alive: g.player.alive,
          health: g.player.health,
          medical:{bleeding:g.player.bleeding,bandages:g.player.bandages,regenTo:g.player.bandageRegenTo},
          stage: g.Debug.FirstLevelMissionRuntime().flow.stage.id,
          stalled: b.stalled,evadeRejoins:b.evadeRejoins||0,
          cutscene: g.state.cutscene,
          cutsceneFrames: chunkCutscene,
          cutscenesSeen: b.cutscenes || null,
          shots: g.state.playerShots,
          ammo: g.state.ammo,
          clips: g.state.clips,
          activeSlot:g.state.activeSlot,primaryMagazine:{...g.state.mags.primary},
          lastShot: g.state.lastShot,
          foe: window.MissionInputDriver?.Target()?.missionId,
          // Guard telemetry: the guard batches are a mission-failure condition, so the log has to
          // show who is alive, where he is, and which enemies are shooting at him.
          guards: (() => {
            const rt = g.Debug.FirstLevelMissionRuntime();
            const guards = rt.guards || [];
            const ids = new Set(guards.map((x) => x.actor.id));
            const hunters = g.ai.soldiers.filter((s) => s.alive && s.side === "ija" && s.target && !s.target.isPlayer && ids.has(s.target.id))
              .map((s) => ({ id: s.id, enc: s.missionEncounter || null, st: s.state, sn: s.stance, cv: !!s.cover,
                fh: !!s.missionFireHold, so: !!s.missionFireSuppressOnly, tv: !!s.targetVisible, tg: s.target.id,
                d: Math.round(Math.hypot(s.position.x - s.target.position.x, s.position.z - s.target.position.z)) }));
            const targets = { player: 0, guard: 0, other: 0, none: 0, standby: 0, held: 0, alive: 0 };
            for (const s of g.ai.soldiers) {
              if (!s.alive || s.side !== "ija") continue;
              targets.alive += 1; if (s.missionFrontStandby) targets.standby += 1; if (s.missionFireHold) targets.held += 1;
              if (!s.target) targets.none += 1; else if (s.target.isPlayer) targets.player += 1; else if (ids.has(s.target.id)) targets.guard += 1; else targets.other += 1;
            }
            return { targets, started: !!rt.Has?.("frontBattleStarted"), list: guards.map((x) => ({ id: x.actor.id, alive: x.actor.alive, hp: Math.round(Math.max(0, x.actor.health)),
              x: +x.actor.position.x.toFixed(1), z: +x.actor.position.z.toFixed(1), st: x.actor.state, sn: x.actor.stance,
              probe: x.probe || null, crossing: !!x.crossing, nc: !!x.actor.scriptedNoncombatant })), hunters };
          })(),
        };
      }, {fight,stance,crawl,sprint,stopFact,arrivalM,recoverAfterEvade});
      const guardHp = (result.guards?.list || []).map((x) => x.alive ? x.hp : -1).join(",");
      const guardHit = routeGuardHp !== undefined && guardHp !== routeGuardHp;
      routeGuardHp = guardHp;
      if (chunk % 4 === 0 || result.done || !result.alive || guardHit || (result.guards?.hunters?.length > 0)) console.log(label, JSON.stringify(result));
      // A death can also leave the body stationary. Let the existing checkpoint
      // retry below handle it before applying the live-navigation stall limit.
      if (result.done || (result.alive && result.stalled >= 3)) break;
      if (!result.alive) {
        // Default campaign and segment evidence is a continuous-life run. Keep
        // the dead-state diagnostics in `result` and let the final assertions
        // fail unless the caller explicitly requested shipped checkpoint retry.
        if (!allowCheckpointRetry) break;
        // Losing a firefight is an outcome of live combat, not a regression: this
        // bot fights standing in the open with no cover, and the runs that died
        // died at a different waypoint each time while other runs walked the whole
        // level. Recover the way a player does — the shipped checkpoint retry,
        // which restores the player without granting facts, spending supplies or
        // moving what he carries — and hold the route to "completable" rather than
        // "never loses a fight". Drift in difficulty still surfaces here, as a
        // route that burns its retry budget instead of one unlucky death.
        if (++retries > ROUTE_RETRY_BUDGET) break;
        console.log(label, `player died at waypoint ${result.index}; checkpoint retry ${retries}/${ROUTE_RETRY_BUDGET}`);
        const retry=await page.evaluate(async ({ stance, sprint, rejoinRoute, rejoinTarget }) => {
          const g = window.Tengxian;
          const Snapshot=()=>{const r=g.Debug.FirstLevelMissionRuntime();return {
            stage:r.flow.stage.id,time:r.time,position:g.player.position.toArray(),facts:[...r.flow.facts],
            enemies:[...r.enemies.values()].map(a=>({id:a.id,alive:a.alive}))};};
          const before=Snapshot();
          g.Debug.MenuAct("continueCheckpoint");
          const after=Snapshot();
          g.StepFrames(1, 1 / 60, false);
          // Re-establish the stance and sprint the leg asked for, and re-seed the
          // stall detector: the retry teleports the body to the checkpoint.
          if (g.player.stance !== stance)
            g.Debug.Key(stance === "crouch" ? "KeyC" : stance === "prone" ? "KeyZ"
              : g.player.stance === "crouch" ? "KeyC" : "KeyZ");
          g.Debug.Key("ShiftLeft", sprint);
          const b = window.routeBot;
          // Stage progression may save a newer checkpoint. Join the authored
          // polyline from the actual spawn; never replay a stale house entry.
          if(rejoinRoute){
            const {MissionRouteBetween}=await import("./Script_FirstLevelMissionColumn.mjs");
            b.points=MissionRouteBetween(rejoinRoute,g.player.position,rejoinTarget);
          }
          b.index = 0;
          b.stalled = 0; b.last = { ...g.player.position };
          return {before,after};
        }, { stance, sprint, rejoinRoute, rejoinTarget });
        assert.equal(retry.after.stage,retry.before.stage,'route retry retains the mission step');
        assert.deepEqual(retry.after.facts,retry.before.facts,'route retry retains every mission fact');
        assert.deepEqual(retry.after.enemies,retry.before.enemies,'route retry retains enemy casualties');
        campaignRetries.push({kind:'route',label,stage:retry.before.stage,time:retry.before.time,
          beforePosition:retry.before.position,afterPosition:retry.after.position,
          factsPreserved:true,casualtiesPreserved:true});
        // A player recovering at the depot can use its real crate before setting
        // out again. Do not grant supplies from the checkpoint or from the driver.
        const depot=await page.evaluate(()=>{
          const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
          return r.flow.stage.id==='Tank'&&g.player.bandages===0&&g.interact.Query(g.player)?.point?.id==='MissionBundle';
        });
        if(depot){await Interact();assert.equal(await page.evaluate(()=>window.Tengxian.player.bandages),R.bundleSupplyBandages,'depot retry physically replenishes dressings');}
        if(carriedKind==='stretcher' && await page.evaluate(()=>window.Tengxian.carry.KindId!=='stretcher')){
          // Death really drops the patient. Retry restores the player, so walk
          // back and use F before continuing; an empty-handed arrival is not a carry.
          const pickup=await page.evaluate(()=>{
            const z=window.Tengxian.Debug.FirstLevelMission().column.litters.find(l=>l.zhou);
            return {x:z.x+Math.sin(z.yaw)*1.6,z:z.z+Math.cos(z.yaw)*1.6};
          });
          await Route([pickup],label+'Repick',{fight:true,stance});
          await Interact();
          assert.equal(await page.evaluate(()=>window.Tengxian.carry.KindId),'stretcher','checkpoint retry reacquires the real patient through F');
          await page.evaluate(({points,sprint})=>{
            const g=window.Tengxian;
            window.routeBot={points,index:0,frames:0,stalled:0,last:{...g.player.position}};
            g.Debug.Key('ShiftLeft',sprint);
          },{points,sprint});
        }
      }
    }
    await page.evaluate(() => window.Tengxian.Debug.Key("ShiftLeft", false));
    await Capture(label);
    assert.ok(result.alive, `${label}: player alive (spent ${retries}/${ROUTE_RETRY_BUDGET} checkpoint retries)`);
    assert.ok(result.done, `${label}: actual body reached route end`);
    return result;
  }

  async function Interact() {
    // 交互键在过场期间递不进去（见 WaitOutCutscene）。
    await WaitOutCutscene("Interact");
    return page.evaluate(() => {
      const g = window.Tengxian,
        query = g.Debug.Interact();
      const interaction=g.interact.Query(g.player);
      if(interaction?.point?.tag==="FirstLevelMission"){
        g.StepFrames(1,1/60,true);
        const prompt=g.hud.actionPrompts.find(p=>p.label===interaction.label);
        if(!prompt||!document.querySelector(".actionText")?.textContent)throw Error("mission interaction needs a visible action label");
      }
      g.Debug.Key("KeyF", true);
      g.StepFrames(90, 1 / 60, false);
      g.Debug.Key("KeyF", false);
      return query;
    });
  }

  /**
   * 「站在这儿按 F 为什么没反应」的取证。
   *
   * 交互点不出提示只有四种可能：够不着、朝向不对、`Enabled` 没过、被更近的点压住。
   * 光断言 `carry.KindId === "stretcher"` 报不出是哪一种（2026-09-21 的 15B 就卡在这儿：
   * 驾驶器站到算好的接手点上，HUD 一片空白，报告里只有一句「没有提示」）。
   * 这里把附近每一个交互点的锚点、距离、`Enabled` 各报一遍，顺带报现在选中的是谁。
   */
  async function InteractProbe(label) {
    const probe = await page.evaluate(() => {
      const g = window.Tengxian, p = g.player;
      const best = g.interact.Query(p);
      const points = [];
      for (const point of g.interact.points.values()) {
        const anchor = typeof point.Anchor === "function" ? point.Anchor() : point.position;
        if (!anchor) { points.push({ id: point.id, anchor: null }); continue; }
        const dist = Math.hypot(anchor.x - p.position.x, anchor.z - p.position.z);
        if (dist > 12) continue;
        let enabled = null;
        try { enabled = point.Enabled ? !!point.Enabled({ point, player: p, dist, system: g.interact }) : true; }
        catch (error) { enabled = `throw:${error.message}`; }
        points.push({
          id: point.id, enabled, reachM: point.reachM,
          dist: Number(dist.toFixed(2)),
          dy: anchor.y == null ? null : Number((anchor.y - p.position.y).toFixed(2)),
          anchor: { x: Number(anchor.x.toFixed(2)), z: Number(anchor.z.toFixed(2)) },
        });
      }
      const zhou = g.Debug.FirstLevelMission().column.litters.find(entry => entry.zhou) || null;
      return {
        stage: g.Debug.FirstLevelMissionRuntime().flow.stage.id,
        player: { x: Number(p.position.x.toFixed(2)), y: Number(p.position.y.toFixed(2)), z: Number(p.position.z.toFixed(2)), yaw: Number(p.yaw.toFixed(2)) },
        carry: { kind: g.carry.KindId, active: g.carry.Active },
        best: best && { id: best.point?.id ?? best.kind, dist: Number(best.dist.toFixed(2)), label: best.label },
        zhou: zhou && { x: Number(zhou.x.toFixed(2)), z: Number(zhou.z.toFixed(2)), yaw: Number(zhou.yaw.toFixed(2)), state: zhou.state, bearers: [...zhou.bearers], ambushHold: !!zhou.ambushHold },
        points: points.sort((a, b) => (a.dist ?? 99) - (b.dist ?? 99)),
      };
    });
    console.log("INTERACT_PROBE", label, JSON.stringify(probe));
    return probe;
  }

  async function RetryCampaign({rewalk=true}={}) {
    if(!allowCheckpointRetry||stageJumps||campaignRetries.filter(retry=>retry.kind!=="route").length>=3)return false;
    const before=await page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
      return {dead:!g.player.alive,stage:r.flow.stage.id,time:r.time,position:g.player.position.toArray(),facts:[...r.flow.facts],
        route:window.routeBot?.points||[],enemies:[...r.enemies.values()].map(a=>({id:a.id,alive:a.alive}))};
    });
    if(!before.dead)return false;
    await page.locator('.mnItem[data-act="continueCheckpoint"]').click();
    await page.waitForFunction(()=>window.Tengxian.player.alive&&window.Tengxian.state.running,null,{timeout:10000});
    const after=await page.evaluate(()=>{
      const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
      for(const key of ['KeyW','KeyS','KeyF','ShiftLeft'])g.Debug.Key(key,false);
      g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);window.MissionInputDriver.evading=false;
      return {stage:r.flow.stage.id,position:g.player.position.toArray(),facts:[...r.flow.facts],enemies:[...r.enemies.values()].map(a=>({id:a.id,alive:a.alive}))};
    });
    assert.equal(after.stage,before.stage,'normal retry retains the current mission step');
    assert.deepEqual(after.facts,before.facts,'normal retry neither grants nor erases mission facts');
    assert.deepEqual(after.enemies,before.enemies,'normal retry retains actual enemy casualties');
    campaignRetries.push({kind:"campaign",stage:before.stage,time:before.time,beforePosition:before.position,afterPosition:after.position,factsPreserved:true,casualtiesPreserved:true});
    console.log('NORMAL_CHECKPOINT_RETRY',JSON.stringify(campaignRetries.at(-1)));
    // Walk back through the last observed route using the ordinary movement driver.
    if(rewalk&&before.route.length)await Route(before.route,`CheckpointReturn${campaignRetries.length}`,{fight:true,stance:'crouch'});
    return true;
  }

  async function WaitStage(expected, seconds = 240, { fight = false, cover = false } = {}) {
    // Read only the step id in the per-frame loop. Full State clones the entire
    // casualty/transport ledger; keep that diagnostic snapshot at chunk boundaries.
    let state;
    for (let chunk = 0; chunk < Math.ceil(seconds / 5); chunk++) {
      state = await page.evaluate(
        ({ expected, fight, cover }) => {
          const g = window.Tengxian;
          for (let i = 0; i < 300 && g.player.alive && g.Debug.FirstLevelMissionRuntime().flow.stage.id !== expected; i++) {
            const evading=window.MissionInputDriver.EvadeGrenade();
            // At a waist-high defensive wall, use normal crouch/peek inputs.
            // Grenade evasion can leave the player standing outside its protection.
            if(cover&&!evading){
              const hide=g.state.ammo===0 || g.ai.time%5<3;
              if((g.player.stance==="crouch")!==hide)g.Debug.Key("KeyC");
            }
            const foe = fight&&!evading ? window.MissionInputDriver.Target(90) : null;
            if (foe) window.MissionInputDriver.Shoot(foe);
            else if(!evading) {
              g.Debug.Mouse(0, false);
              g.Debug.Mouse(2, false);
              if(g.state.activeSlot==="melee")g.Debug.Key("Digit1");
              if(g.state.ammo===0)g.Debug.Key("KeyR");
            }
            if (g.player.bleeding && g.player.health < 80) g.Debug.Key("KeyB");
            g.StepFrames(1, 1 / 60, false);
            if(g.Debug.FirstLevelMissionRuntime().flow.stage.id==="Rescue"&&!window.rescueWitnessCaptured &&
              ['yaowa','liuwencai'].every(id=>g.ai.soldiers.find(a=>a.castId===id)?.missionRescueReady))break;
          }
          g.Debug.Mouse(0, false);
          g.Debug.Mouse(2, false);
          return { mission: g.Debug.FirstLevelMission(), health: g.player.health, alive: g.player.alive };
        },
        { expected, fight, cover },
      );
      if(state.mission.stage==="Transfer" && state.mission.column.loaded>0 && !capturedActivities.has("TransferLoading")) {
        capturedActivities.add("TransferLoading");
        const cart=state.mission.column.vehicles.find(c=>!c.departed);
        await CaptureFocus("TransferLoading",cart);
        const collision=await page.evaluate(id=>{
          const g=window.Tengxian,box=g.battlefield.colliders.find(b=>b.id===id);
          const origin=g.player.position.clone().set(box.max[0]+.3,box.c[1],box.c[2]);
          const direction=origin.clone().set(-1,0,0),hit=g.battlefield.Raycast(origin,direction,8);
          return {id:hit?.box?.id,solid:g.physics.Overlaps(box.c[0],box.c[1],box.c[2],.2,.5)};
        },cart.id);
        assert.equal(collision.id,cart.id,"Moving transport remains a real bullet blocker at its current position");
        assert.ok(collision.solid,"The visible transport occupies the physical world");
      }
      if(state.mission.stage==="Death" && state.mission.control==="death" && !capturedActivities.has("ZhouDeath")) {
        capturedActivities.add("ZhouDeath");await Capture("ZhouDeath");
        const focus=await page.evaluate(()=>{
          const g=window.Tengxian,eye=g.player.EyePosition,z=g.Debug.FirstLevelMission().column.litters.find(l=>l.zhou);
          const desiredPitch=Math.atan2(g.battlefield.GroundHeight(z.x,z.z)+.44-eye.y,Math.hypot(z.x-eye.x,z.z-.7-eye.z));
          return {empty:g.Debug.FirstLevelMission().emptyHands,prompt:g.Debug.FirstLevelMission().openingPrompt,pitchError:Math.abs(g.player.pitch-desiredPitch)};
        });
        assert.ok(focus.empty&&focus.prompt===null&&focus.pitchError<.29,'death scene looks down at Zhou with the weapon put away');
      }
      if(state.mission.stage==="Rescue" && !capturedActivities.has("MedicalRescue") &&
        await page.evaluate(()=>['yaowa','liuwencai'].every(id=>window.Tengxian.ai.soldiers.find(a=>a.castId===id)?.missionRescueReady))) {
        await page.evaluate(()=>{window.rescueWitnessCaptured=true;});
        capturedActivities.add("MedicalRescue");await CaptureFocus("MedicalRescue",state.mission.column.litters.find(l=>l.zhou));
      }
      if(chunk%12===11)console.log("WAIT_PROGRESS",JSON.stringify({expected,stage:state.mission.stage,time:state.mission.time,health:state.health,remaining:state.mission.remaining}));
      if(!state.alive&&await RetryCampaign())continue;
      if (state.mission.stage === expected || !state.alive) break;
    }
    console.log(
      "wait",
      expected,
      JSON.stringify({
        stage: state.mission.stage,
        remaining: state.mission.remaining,
        health: state.health,
        column: state.mission.column.gatePassed,
      }),
    );
    await Capture(expected);
    assert.ok(state.alive);
    assert.equal(state.mission.stage, expected);
    return state;
  }

  return { JumpStage, Capture, CaptureFocus, WaitOutCutscene, Route, Interact, InteractProbe, RetryCampaign, WaitStage };
}
