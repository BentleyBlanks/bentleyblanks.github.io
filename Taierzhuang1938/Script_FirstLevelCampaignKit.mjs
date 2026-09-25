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
// 2 = 01–02 to the collection hand-over (the opening package's own acceptance, 03 not driven).
export const CAMPAIGN_SEGMENT_ENDS = Object.freeze([2, 3, 6, 7, 14, 18]);
/**
 * 不带 `--stage-jumps` 也能起跑的冷启动点（`missionStage=N`，玩家阵亡重来 / 选章落在这里）：
 * 01 开局、03 前沿、04 / 05 检查点、06 集结处。从这里起一路真输入推进，中途不再跳。
 */
export const CAMPAIGN_CONTINUOUS_STARTS = Object.freeze([1, 3, 4, 5, 6]);

export function ParseCampaignArgs(argv = process.argv) {
  const Has = (flag) => argv.includes(flag);
  const stageJumps = Has("--stage-jumps");
  const raw = argv.find((arg) => arg.startsWith("--stage-from="))?.split("=")[1];
  const stageFrom = Number(raw || 1);
  // 4 / 5 = the 04 / 05 checkpoints, driven on with real input like 3 and 6: a cold start, never a jump inside a run.
  assert.ok(
    CAMPAIGN_CONTINUOUS_STARTS.includes(stageFrom) || (stageJumps && CAMPAIGN_SEGMENT_STARTS.includes(stageFrom)),
    "continuous suites start at " + CAMPAIGN_CONTINUOUS_STARTS.join(", ") + "; debug continuation starts at " + CAMPAIGN_SEGMENT_STARTS.join(" / "),
  );
  // 只跑某一段到它的末尾（`--stage-to=7` = Front 包的 1–7）。默认 18 = 整关走到 Complete。
  // 分段跑出来的证据目录与整关分开，一段跑通不许冒充通关。
  const toRaw = argv.find((arg) => arg.startsWith("--stage-to="))?.split("=")[1];
  const stageTo = Number(toRaw || 18);
  assert.ok(CAMPAIGN_SEGMENT_ENDS.includes(stageTo), "segment suites end at " + CAMPAIGN_SEGMENT_ENDS.join(" / "));
  assert.ok(stageTo >= stageFrom, "a segment cannot end before it starts");
  // 05 的非理想顺序：先在攻击支路上把车炸掉、再（不）到攻击位（契约 v1.1 卡死②）。03 起与 05 检查点起都能带。
  const bombFirst = Has("--bomb-first");
  assert.ok(!bombFirst || (stageFrom <= 5 && stageTo >= 6), "--bomb-first drives 05 and needs the run to reach 06");
  // 同一套件并行跑多份时（统计阵亡率），各自的证据目录分开：`--evidence-tag=R2` → _shots/<suite>_R2。
  const evidenceTag = argv.find((arg) => arg.startsWith("--evidence-tag="))?.split("=")[1] || "";
  // 03–06 的两条玩家反射（近身还手、躲雷后回位）默认开；--no-reflexes 回到改之前的驾驶器，做前后对照用。
  const reflexes = !Has("--no-reflexes");
  assert.ok(/^[A-Za-z0-9_-]*$/.test(evidenceTag), "--evidence-tag is letters, digits, _ or -");
  return {
    campaign: Has("--campaign"),
    audioCheck: Has("--audio"),
    probeFrontGun: Has("--probe-front-gun"),
    stageJumps,
    // 专项回归才允许主动排入一条带路短命令，验证静默窗口会取消它且不锁院门。
    // 默认整关/分段驾驶只观察运行时自主产生的 cue，不能改写真实语音排队。
    quietGuidanceInterruptProbe: Has("--probe-quiet-guidance-interrupt"),
    allowCheckpointRetry: Has("--allow-checkpoint-retry"),
    bombFirst, evidenceTag, reflexes,
    stageFrom, stageTo,
    suite: stageFrom === 6 ? "FirstLevelWhitebox0618" : stageFrom === 3 ? "FirstLevelFrontTopology"
      : stageFrom === 4 || stageFrom === 5 ? `FirstLevelFrontCheckpoint0${stageFrom}${bombFirst ? "BombFirst" : ""}`
      : stageTo === 2 || stageTo === 3 ? "FirstLevelOpeningStoryboards" : stageTo === 7 ? "FirstLevelStageFront"
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
  // --evidence-tag (Gate) or CAMPAIGN_SHOTS_TAG (Front relay r2): runs of the same suite in parallel keep their evidence apart
  // (_shots/<suite>_<tag>); unset, the directory is the suite's as before.
  const shotsTag = options.evidenceTag || process.env.CAMPAIGN_SHOTS_TAG;
  const output = path.join(here, "_shots", options.suite + (shotsTag ? "_" + shotsTag : ""));
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
    `http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&${options.audioCheck ? "menu=0" : "shot=1"}&manual=1${[3,4,5,6].includes(options.stageFrom)?`&missionStage=${options.stageFrom}`:""}&quality=${options.quality||"low"}&scale=small`,
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
  await ctx.page.evaluate(() => {
    const runtime = window.Tengxian?.Debug.FirstLevelMissionRuntime();
    if (!runtime) return null;
    return {
      stage: runtime.flow.stage.id,
      bedGuide: runtime.bedGuide && { cast: runtime.bedGuide.actor?.castId, route: runtime.bedGuide.route },
      squad: runtime.squad.map(actor => ({
        id: actor.id, cast: actor.castId, alive: actor.alive,
        position: { x: actor.position.x, y: actor.position.y, z: actor.position.z },
        ready: !!actor.missionTrainReady, noncombatant: !!actor.scriptedNoncombatant,
        stance: actor.stance, reach: actor.missionReach || 0,
        receptionWalk: runtime.reception.HasWalk(actor.id),
        route: runtime.squadRoutes.get(actor.id),
      })),
    };
  }).then(state => fs.writeFile(path.join(ctx.output, "Data_FailureCast.json"), JSON.stringify(state, null, 2)))
    .catch(() => {});
  await ctx.page.screenshot({ path: path.join(ctx.output, "Scene_Failure.png") }).catch(() => {});
  // 挨打取证（InstallDamageForensics）：03 的每一下与每次阵亡的现场，统计阵亡率时按行 grep。
  await Report03Damage(ctx);
  await ReportDeaths(ctx);
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
  // 2026-09-24 起 01–06 的对白是「整场一次生成 → 切句」：这类 cue 在声库里是逐句的键
  // （Script_FirstLevelMissionVoice.LineKey：Mission<句 id，点换下划线>），没有整段文件。
  // 逐句录音齐了的 cue 逐句解码、逐句试播；其余仍按旧的整段录音验。开机时 Script_Main 已等过 voiceReady。
  const voices = await page.evaluate(async ids => {
    const g = window.Tengxian, { MISSION_DIALOGUE } = await import("./Data_FirstLevelMissionDialogue.mjs");
    const manifest = await (await fetch("./Audio/FirstLevel/Data_FirstLevelVoiceManifest.json", { cache: "no-cache" })).json();
    const PerLine = (cue) => !!cue.perLine && cue.lines.every((line) => manifest.lines?.[line.id]);
    const Try = (id, key, line) => {
      const played = g.audio.PlayStoryVoice(key);
      g.audio.StopStoryVoice();
      return { id, key, line, decoded: !!g.audio.voiceBank.get(key), seconds: played?.duration || 0, started: !!played?.voice };
    };
    g.audio.Unlock();
    const selected = MISSION_DIALOGUE.filter(cue=>!ids||ids.includes(cue.id));
    const cues = selected.flatMap((cue) => PerLine(cue)
      ? cue.lines.map((line) => Try(line.id, `Mission${line.id.replace(".", "_")}`, true))
      : [Try(cue.id, `Mission${cue.id}`, false)]);
    g.audio.StopStoryVoice();
    return { context: g.audio.ctx?.state, cueCount: selected.length, perLineCues: selected.filter(PerLine).length, cues };
  },ids);
  assert.equal(voices.context, "running", "The real start button unlocks the audio context");
  assert.equal(voices.cueCount, ids?.length||MISSION_DIALOGUE.length, "every selected cue is checked");
  // 逐句片段可以很短（「立て！」0.24 s），整段录音照旧要 0.5 s 以上。
  const Playable = (cue) => cue.decoded && cue.started && cue.seconds > (cue.line ? 0.15 : 0.5);
  assert.ok(voices.cues.every(Playable),
    "Every Seed Audio cue (whole take, or every line of a per-line scene) must decode and create a real playback source: "
    + JSON.stringify(voices.cues.filter((cue) => !Playable(cue))));
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
            // 「像一个正常玩家」的两条反射（DriveFrontBattle 在 03–06 打开，--no-reflexes 关掉做前后对照）：
            //   ① 近身威胁先还手：3 m 内朝着玩家 / 正在出刀 / 盯着玩家打的日军（2.5 m 内的不论朝向）
            //      优先于路线与远处目标，转身用刺刀大刀或步枪解决，不需要视线射线先看见他
            //      （09-24 r2：RightEntryGuard 在 2.1 m 连捅 4 下，驾驶器照走路线）；
            //   ② 躲雷：看见落在身边的手榴弹就朝能跑远、最好有墙挡着的方向跑出去（16 个方向、4 m 内试走），
            //      炸完走回躲之前站的地方（最多 6 s）。本游戏里趴下不减手榴弹伤（命中点固定在脚上 1 m），
            //      所以不趴，只跑；
            //   ③ 近身却没东西能还手（大刀被场景挡住、步枪空仓或正在装填）：面朝他往后退出刺刀够得着的距离，
            //      装填不再被拔刀打断（拔刀会取消装填、弹仓退回空的）。09-25 R_c01_2 就是这样被连捅四刀。
            //   ④ 近身的人 8 s 里双方都没掉血（在跟罗班长拼刺刀、隔着墙角够不着）又没盯上玩家：先交给别人，
            //      6 s 内不再当近身威胁，路线照走（09-25 V_c01_1 被 2.3 m 外跟罗班长对刺的 RightLinkGuard 拖住整段）；
            //   ⑤ 拿着大刀、人在 2.3–3 m（砍不到又不走）：往前迈一步贴上去再砍（只在大刀已在手、不在装填时）；
            //   ⑥ 近身的人隔着矮墙：胸口那条线被墙挡住就瞄头，头也挡住就不开枪、按 ③ 后退（09-25 ABon_1 把 63 发全打进墙里）；
            //   ⑦ 近身、大刀在手还能用、只是还没转正：拿着大刀继续转，不再收刀换枪（ABon_1 一场 51 次换武器）。
            //   关掉时（reflexes=false）每条路径与改之前一字不差。
            reflexes: false, closeResponses: 0, escapes: 0, evadeReturns: 0, closeFoe: null, returning: null,
            CloseThreat() {
              if(!this.reflexes)return null;
              const p=g.player.position;let best=null,bd=3;
              for(const a of g.ai.soldiers){
                if(a.side!=="ija"||!a.alive||a.scriptedNoncombatant)continue;
                const dx=a.position.x-p.x,dz=a.position.z-p.z,d=Math.hypot(dx,dz);
                if(d>=bd||Math.abs(a.position.y-p.y)>1.6)continue;
                const f=g.meleeCombat.fighters?.get(a);
                const striking=!!f&&["attack","charge","contact"].includes(f.state);
                // His forward is (-sin yaw, -cos yaw); the way to the player is (-dx, -dz).
                const facing=Number.isFinite(a.yaw)&&(Math.sin(a.yaw)*dx+Math.cos(a.yaw)*dz)/(d||1)>.5;
                if(!(striking||facing||a.target?.isPlayer||d<=2.5))continue;
                // ④ A man the player has stood off for 8 s without a scratch on either side (busy with Luo, out of
                // reach behind a wall end) is left to the others for 6 s and the route goes on, unless he turns on
                // the player (09-25 V_c01_1: RightLinkGuard duelling Luo at 2.3 m held the bot for the whole leg).
                if((this.ignoreClose?.get(a)||0)>g.ai.time&&!a.target?.isPlayer)continue;
                bd=d;best=a;
              }
              if(best&&best!==this.closeFoe){this.closeResponses++;this.closeSince={t:g.ai.time,hp:best.health,player:g.player.health};}
              else if(best&&this.closeSince&&g.ai.time-this.closeSince.t>8){
                if(best.health>=this.closeSince.hp&&g.player.health>=this.closeSince.player&&!best.target?.isPlayer){
                  (this.ignoreClose||=new Map()).set(best,g.ai.time+6);this.closeStandoffs=(this.closeStandoffs||0)+1;best=null;
                }
                this.closeSince=best?{t:g.ai.time,hp:best.health,player:g.player.health}:null;
              }
              if(!best&&this.closing){g.Debug.Key("KeyW",false);this.closing=false;}
              this.closeFoe=best;
              if(!best&&this.backingOff){g.Debug.Key("KeyS",false);this.backingOff=false;}
              return best;
            },
            // One frame of walking back to where a grenade dodge started (false once there, or after 6 s).
            StepHome() {
              const h=this.returning;if(!h)return false;
              const p=g.player.position,d=Math.hypot(h.x-p.x,h.z-p.z);
              if(d<.8||g.ai.time>h.until||!g.player.alive){this.returning=null;g.Debug.Key("KeyW",false);g.Debug.Key("ShiftLeft",false);return false;}
              const yaw=Math.atan2(p.x-h.x,p.z-h.z),gap=Math.atan2(Math.sin(yaw-g.player.yaw),Math.cos(yaw-g.player.yaw));
              g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
              g.player.yaw+=Math.max(-.08,Math.min(.08,gap));g.player.pitch=0;
              g.Debug.Key("KeyW",Math.abs(gap)<.65);
              this.mode="return";
              return true;
            },
            // Best way out of a grenade's reach: walk-test 16 headings up to 4 m (ground step, body overlap, and a
            // waist/chest ray for walls thinner than a step), score by the distance from the grenade at the end,
            // plus a wall between the grenade and that spot.
            EscapeHeading(threat) {
              const p=g.player.position,gx=threat.position.x,gz=threat.position.z;
              const from=threat.position.clone();from.y+=BLAST.originRiseM;
              let best=null,bestScore=-Infinity;
              for(let k=0;k<16;k++){
                const angle=k*Math.PI/8,dir=from.clone().set(Math.sin(angle),0,Math.cos(angle));
                let free=4;
                for(const rise of [.5,1.2]){
                  const o=p.clone();o.y+=rise;const hit=g.battlefield.Raycast(o,dir,4,{terrain:true});
                  if(hit)free=Math.min(free,hit.t-g.player.radius-.1);
                }
                let reach=0,y=p.y,cx=p.x,cz=p.z;
                for(const step of [1,2,3,4]){
                  if(step>free)break;
                  const x=p.x+Math.sin(angle)*step,z=p.z+Math.cos(angle)*step,gy=g.battlefield.GroundHeight(x,z);
                  if(Math.abs(gy-y)>.4||g.physics.Overlaps(x,gy+.04,z,g.player.radius,1.78))break;
                  reach=step;y=gy;cx=x;cz=z;
                }
                if(reach<1)continue;
                const to=from.clone().set(cx,y+BLAST.playerHitRiseM,cz),ray=to.clone().sub(from),len=ray.length();
                const hit=len>.1?g.battlefield.Raycast(from,ray.normalize(),len,{terrain:true}):null;
                const score=Math.hypot(cx-gx,cz-gz)+(hit&&hit.t<len-BLAST.wallMarginM?6:0);
                if(score>bestScore){bestScore=score;best=angle;}
              }
              return best;
            },
            EvadeGrenade() {
              const p=g.player,threat=g.combat.GrenadeThreats(p.position).find(t=>{
                const from=t.position.clone();from.y+=BLAST.originRiseM;
                const ray=p.position.clone();ray.y+=BLAST.playerHitRiseM;ray.sub(from);
                const d=ray.length(),hit=d>BLAST.wallMarginM?g.battlefield.Raycast(from,ray.normalize(),d,{terrain:true}):null;
                return !hit||hit.t>=d-BLAST.wallMarginM;
              });
              if(!threat){
                if(this.evading){g.Debug.Key("KeyW",false);g.Debug.Key("ShiftLeft",false);this.evading=false;
                  if(this.reflexes&&this.evadeHome){this.returning={...this.evadeHome,until:g.ai.time+6};this.evadeReturns++;}}
                this.evadeHome=null;
                return false;
              }
              if(this.reflexes){
                if(!this.escape||this.escape.threat!==threat.position||g.ai.time>=this.escape.until)
                  this.escape={threat:threat.position,until:g.ai.time+.25,heading:this.EscapeHeading(threat)};
                const heading=this.escape.heading;
                // Walled in on every side: stop running (keys up) and keep fighting, like the old driver.
                if(heading==null){if(this.evading){g.Debug.Key("KeyW",false);g.Debug.Key("ShiftLeft",false);this.evading=false;}return false;}
                if(!this.evading){this.evadeHome={x:p.position.x,z:p.position.z};this.escapes++;}
                this.returning=null;
                if(this.backingOff){g.Debug.Key("KeyS",false);this.backingOff=false;}
                if(p.stance!=="stand")g.Debug.Key(p.stance==="crouch"?"KeyC":"KeyZ");
                const yaw=heading+Math.PI,gap=Math.atan2(Math.sin(yaw-p.yaw-p.aimYaw),Math.cos(yaw-p.yaw-p.aimYaw));
                g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
                g.Debug.Look(Math.max(-60,Math.min(60,-gap/.0022)),0);
                g.Debug.Key("KeyW",Math.abs(gap)<.5);g.Debug.Key("ShiftLeft",true);
                this.evading=true;this.evadeFrames=(this.evadeFrames||0)+1;this.mode="evade";
                return true;
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
              // ① A man at arm's length comes before the route's far targets, seen through a ray or not.
              const close=this.CloseThreat();
              if(close)return close;
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
              // Bookkeeping for the damage forensics only (what the player was doing when a hit landed).
              const Did=(what)=>{this.lastAction={t:g.ai.time,what:what+":"+(foe?.missionId||foe?.id)};};
              if(g.meleeCombat.Active){
                Did("bind");
                g.Debug.Mouse(0,false);g.Debug.Mouse(2,false);
                g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);return;
              }
              this.lastTarget=foe.id;
              g.Debug.Mouse(0, false);
              const eye = g.player.EyePosition,
                to = foe.position.clone();
              to.y += foe.missionId===this.priorityTarget ? 1.2 : foe.stance === 2 ? 0.3 : foe.stance === 1 ? 0.85 : 1.2;
              // ⑥ A man at arm's length is fought whether a ray sees him or not (①), so he can be behind a low wall,
              // stabbing over it: aim at his head when the chest line hits the wall, and when neither line is clear hold
              // fire and back off (③) instead of emptying the rifle into the wall (09-25 Gate ABon_1: every round of 63
              // into the right nest's low west wall at FrontFlankB 2 m away, bayoneted three times with an empty rifle).
              let lineBlocked=false;
              if(this.reflexes&&foe.position.distanceTo(g.player.position)<3){
                const Clear=(point)=>{const ray=point.clone().sub(eye),length=ray.length(),hit=g.battlefield.Raycast(eye,ray.normalize(),length,{terrain:true});
                  return !hit||hit.t>=length-.25;};
                if(!Clear(to)){const head=foe.position.clone();head.y+=foe.stance===2?.35:foe.stance===1?1.1:1.5;
                  if(Clear(head))to.copy(head);else lineBlocked=true;}
                if(lineBlocked)this.blockedLineFrames=(this.blockedLineFrames||0)+1;
              }
              const dx = to.x - eye.x,
                dz = to.z - eye.z,
                yaw = Math.atan2(-dx, -dz),
                gap = Math.atan2(Math.sin(yaw - g.player.yaw), Math.cos(yaw - g.player.yaw));
              // A close threat is turned to twice as fast (a player spins round on a man at his shoulder).
              const turn=this.reflexes&&Math.hypot(foe.position.x-g.player.position.x,foe.position.z-g.player.position.z)<3?.12:.06;
              g.player.yaw += Math.max(-turn, Math.min(turn, gap));
              g.player.pitch = Math.atan2(to.y - eye.y, Math.hypot(dx, dz)) - g.player.aimPitch;
              g.player.yaw -= g.player.aimYaw;
              const distance=foe.position.distanceTo(g.player.position),fighter=g.meleeCombat.Fighter(g.player);
              // Mobile enemies now reach real bayonet contact. The campaign maps V
              // to the equipped melee slot (Dadao), so keep that weapon out through
              // contact instead of switching back to the rifle on every frame.
              // A swing the scenery catches (the nest gunner crouched behind his gun block: every cut ends in the
              // melee director's "environment" event) is a wall, like a shot that hits one: use the rifle on this foe
              // for 4 s instead (09-24 Front idle probe U1: 16 s of blocked dadao cuts at 0.8 m, empty rifle never
              // reloaded, killed by the link guard). Only the scenery counts - a WeaponClash / body block / charge
              // fatigue is ordinary bayonet fighting and stays a bayonet fight (07+ melee suites drive it) - and only
              // the player's own swing at this foe (the latest environment event, while he staggers from it).
              this.obstructed ||= new Map();
              const wall=g.meleeCombat.events?.findLast?.((e)=>e.kind==="environment"&&e.actor==="Player");
              if(wall&&wall.serial!==this.wallSerial&&fighter?.state==="stagger"&&fighter.clip==="Obstructed"&&g.meleeCombat.time-wall.time<1){
                this.wallSerial=wall.serial;this.obstructed.set(foe.id,g.ai.time+4);
              }
              // A player finishes the reload he started before drawing the Dadao: drawing it mid-reload cancels the
              // reload and refunds nothing into the magazine (Script_Main CancelReload). The old driver flipped between
              // a blocked cut (rifle for 4 s, R) and the Dadao again, so the rifle never got loaded (09-25 R_c01_2).
              const reloading=g.viewmodel?.action?.kind==="reload";
              if(distance<3 && Math.abs(gap)<.2 && !((this.obstructed.get(foe.id)||0)>g.ai.time) && !(this.reflexes&&reloading)){
                Did("melee");
                g.Debug.Mouse(2,false);
                if(g.state.activeSlot!=="melee"){if(this.reflexes)this.closeSwaps=(this.closeSwaps||0)+1;g.Debug.Key("KeyV");return;}
                if(!fighter.weapon)return;
                this.meleeResponses=(this.meleeResponses||0)+1;
                let closing=false;
                if(g.meleeCombat.Active){g.Debug.Key("KeyF",true);g.Debug.Key("KeyF",false);}
                else if(fighter.state==="idle"){
                  const attacker=g.meleeCombat.Fighter(foe);
                  if(attacker.attack && attacker.t>attacker.attack.windup-.13 && attacker.t<attacker.attack.windup
                    && distance<attacker.attack.reach){g.Debug.Mouse(2,true);g.Debug.Mouse(2,false);}
                  else if(distance<2.3){g.Debug.Mouse(0,true);g.Debug.Mouse(0,false);}
                  // ⑤ Between cutting range (2.3 m) and 3 m the old driver neither cut nor walked: step in to him.
                  else closing=this.reflexes;
                }
                // Pressed every frame while closing in: a route leg lets go of W before it calls Shoot.
                if(closing||this.closing){g.Debug.Key("KeyW",closing);this.closing=closing;}
                return;
              }
              // ⑦ Still turning onto a man at arm's length with the Dadao out and usable: keep it in hand and turn. The
              // path below puts the rifle back (Digit1) whenever he steps out of the 0.2 rad cone and the branch above
              // draws the Dadao again once facing him (09-25 Gate ABon_1: 51 swaps in one 03 fight).
              if(this.reflexes&&distance<3&&Math.abs(gap)>=.2&&g.state.activeSlot==="melee"&&!((this.obstructed.get(foe.id)||0)>g.ai.time)&&!reloading){
                Did("turn");g.Debug.Mouse(2,false);
                if(this.closing){g.Debug.Key("KeyW",false);this.closing=false;}
                if(this.backingOff){g.Debug.Key("KeyS",false);this.backingOff=false;}
                return;
              }
              Did(Math.abs(gap)<.06?"rifle":"turn");
              if(this.closing){g.Debug.Key("KeyW",false);this.closing=false;}
              // ③ Nothing to answer a man at arm's length with (the Dadao caught by the scenery, the rifle empty or
              // reloading): back-pedal out of his bayonet reach, still facing him, while it reloads, instead of standing in
              // it (09-25 R_c01_2: FrontFlankB stabbed four times at 2 m while the bot stood reloading in the nest).
              const backOff=this.reflexes&&distance<3&&(g.state.ammo===0||reloading||lineBlocked);
              if(backOff!==!!this.backingOff){g.Debug.Key("KeyS",backOff);this.backingOff=backOff;}
              if(backOff)this.backOffFrames=(this.backOffFrames||0)+1;
              if(g.state.activeSlot!=="primary"){if(this.reflexes&&distance<3)this.closeSwaps=(this.closeSwaps||0)+1;g.Debug.Key("Digit1");return;}
              g.Debug.Mouse(2, true);
              if (g.state.ammo === 0) g.Debug.Key("KeyR");
              else if (Math.abs(gap) < 0.06 && !lineBlocked) g.Debug.Mouse(0, true);
            },
          };
  });
  await InstallDamageForensics(ctx.page);
}

/**
 * 挨打取证（只记录，不改任何数值与判定）：玩家每挨一下，记下谁打的、用什么、多远、在不在视野里、
 * 中间有没有东西挡着、玩家这时候在干什么；玩家阵亡那一刻把周围 30 m 的现场整个存下来。
 * 01→03 连续打过来的阵亡率要分清「模拟玩家太笨」还是「游戏真的难」，靠的就是这一份。
 *   window.damageForensics  每一下（全关，最多 600 条）
 *   window.deathForensics   每次阵亡的现场
 * 手榴弹/炮弹记爆炸源（Combat.Blast 的 kind / explosiveId / ownerId），子弹记离枪口最近的日军，
 * 刺刀记出刀的人；都找不到时离战车 6 m 内记 "tank"。流血不走 TakeHit，只在阵亡现场里看 bleeding。
 */
export async function InstallDamageForensics(page) {
  await page.evaluate(() => {
    const g = window.Tengxian;
    if (window.damageForensics) return;
    const log = window.damageForensics = [], deaths = window.deathForensics = [];
    const Runtime = () => { try { return g.Debug.FirstLevelMissionRuntime(); } catch { return null; } };
    const Name = (a) => a ? (a.missionId || a.castId || String(a.id)) : null;
    const Round = (v, n = 1) => +(+v).toFixed(n);
    let blast = null;
    const combatBlast = g.combat.Blast.bind(g.combat);
    g.combat.Blast = (position, radius, damage, kind, hurtSide, byPlayer, onHit, explosiveId, ownerId, options) => {
      const previous = blast;
      blast = { kind, explosive: explosiveId ?? kind, ownerId, x: position.x, z: position.z, byPlayer: !!byPlayer };
      try { return combatBlast(position, radius, damage, kind, hurtSide, byPlayer, onHit, explosiveId, ownerId, options); }
      finally { blast = previous; }
    };
    // Where the player looks (yaw + aimYaw; forward = (-sin, -cos), the convention Shoot uses) and whether the
    // rendered world blocks the line from the eye to the source.
    const View = (point, rise) => {
      const eye = g.player.EyePosition, dx = point.x - eye.x, dz = point.z - eye.z;
      const yaw = Math.atan2(-dx, -dz), look = g.player.yaw + (g.player.aimYaw || 0);
      const angle = Math.abs(Math.atan2(Math.sin(yaw - look), Math.cos(yaw - look)));
      const to = eye.clone().set(point.x, (point.y ?? g.battlefield.GroundHeight(point.x, point.z)) + rise, point.z);
      const ray = to.clone().sub(eye), d = ray.length();
      const hit = d > .3 ? g.battlefield.Raycast(eye, ray.normalize(), d, { terrain: true }) : null;
      return { angleDeg: Math.round(angle * 180 / Math.PI), inView: angle < .9, los: !hit || hit.t >= d - .3 };
    };
    const Soldier = (from, m) => {
      let best = null, bd = m;
      for (const s of g.ai.soldiers) {
        if (s.side !== "ija") continue;
        const d = Math.hypot(s.position.x - from.x, s.position.z - from.z);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    };
    const Activity = () => {
      const D = window.MissionInputDriver || {};
      return { leg: D.leg ?? null, mode: D.mode ?? null,
        action: D.lastAction && g.ai.time - D.lastAction.t < .5 ? D.lastAction.what : null,
        stance: g.player.stance, slot: g.state.activeSlot, mounted: !!g.emplacement?.View?.(),
        bind: !!g.meleeCombat?.Active, cutscene: g.state.cutscene || null };
    };
    const Source = (info) => {
      const p = g.player.position, r = Runtime();
      if (info?.blast && blast) {
        const owner = blast.ownerId != null ? g.ai.soldiers.find((s) => s.id === blast.ownerId) : null;
        return { kind: "blast", weapon: blast.explosive || blast.kind, who: owner ? Name(owner) : blast.byPlayer ? "player" : null,
          encounter: owner?.missionEncounter || null, distance: Round(Math.hypot(blast.x - p.x, blast.z - p.z)),
          ...View({ x: blast.x, z: blast.z }, .3) };
      }
      const from = info?.from;
      const kind = info?.melee ? "melee" : info?.bullet ? "bullet" : info?.blast ? "blast" : info?.projectile ? "projectile" : info?.fire ? "fire" : "other";
      if (!from) return { kind, weapon: null, who: null };
      const s = Soldier(from, info?.melee ? 3.5 : 2.5);
      const tank = !s && r?.tank && Number.isFinite(r.tank.x) && Math.hypot(r.tank.x - from.x, r.tank.z - from.z) < 6;
      return { kind, weapon: s ? (info?.melee ? "bayonet" : s.weaponId) : tank ? "tankGun" : null, who: s ? Name(s) : tank ? "tank" : null,
        encounter: s?.missionEncounter || null, distance: Round(Math.hypot(from.x - p.x, from.z - p.z)), ...View(from, 0) };
    };
    const originalHit = g.player.TakeHit.bind(g.player);
    g.player.TakeHit = (damage, part, direction, info) => {
      const before = g.player.health, alive = g.player.alive, r = Runtime();
      const result = originalHit(damage, part, direction, info);
      const lost = before - g.player.health;
      if (alive && lost > 0) {
        log.push({ time: Round(r?.time ?? 0), stage: r?.flow?.stage?.id ?? null, lost: Round(lost), health: Round(g.player.health),
          part, ...Source(info), at: [Round(g.player.position.x), Round(g.player.position.z)], activity: Activity() });
        if (log.length > 600) log.shift();
      }
      return result;
    };
    const originalKill = g.player.Kill.bind(g.player);
    g.player.Kill = (...args) => {
      if (g.player.alive && !g.player.debug?.invincible) {
        const r = Runtime(), p = g.player.position;
        deaths.push({ time: Round(r?.time ?? 0), stage: r?.flow?.stage?.id ?? null, at: [Round(p.x), Round(p.z)],
          bleeding: Round(g.player.bleeding, 2), bandages: g.player.bandages, ammo: g.state.ammo, clips: g.state.clips,
          grenades: g.state.grenades, activity: Activity(), lastHits: log.slice(-8),
          enemies: g.ai.soldiers.filter((s) => s.side === "ija" && s.alive && Math.hypot(s.position.x - p.x, s.position.z - p.z) < 30)
            .map((s) => ({ id: Name(s), encounter: s.missionEncounter || null, d: Round(Math.hypot(s.position.x - p.x, s.position.z - p.z)),
              at: [Round(s.position.x), Round(s.position.z)], state: s.state, stance: s.stance, targetPlayer: !!s.target?.isPlayer,
              weapon: s.weaponId, dormant: !!s.missionDormant, ...View(s.position, 1.2) }))
            .sort((a, b) => a.d - b.d).slice(0, 16),
          liveGrenades: g.combat.projectiles.filter((q) => q.alive).map((q) => ({ owner: q.owner, fuse: Round(q.fuse, 2),
            d: Round(Math.hypot(q.position.x - p.x, q.position.z - p.z)) })) });
      }
      return originalKill(...args);
    };
  });
}

/** 03 的统计口之一：进 03（Support）那一刻带着什么。连续打过来与冷启动 03 用同一行，便于对表。 */
export async function Snapshot03Entry(ctx, source) {
  const entry = await ctx.page.evaluate(async () => {
    const g = window.Tengxian, r = g.Debug.FirstLevelMissionRuntime(), { WEAPONS } = await import("./Data_Weapons.mjs");
    const started = r.flow.log.filter((e) => e.kind === "stage").findLast((e) => e.id === "Support")?.time ?? null;
    const primary = g.state.mags?.primary || {}, onRifle = g.state.activeSlot === "primary";
    const hits = window.damageForensics || [];
    return { stage: r.flow.stage.id, time: +r.time.toFixed(1), sinceSupport: started == null ? null : +(r.time - started).toFixed(1),
      health: +g.player.health.toFixed(1), bleeding: +g.player.bleeding.toFixed(2), bandages: g.player.bandages,
      rifle: g.state.slots?.primary ?? null, activeSlot: g.state.activeSlot,
      magazine: onRifle ? g.state.ammo : primary.ammo ?? null, spareClips: onRifle ? g.state.clips : primary.clips ?? null,
      clipRounds: WEAPONS[g.state.slots?.primary]?.magazine ?? null, grenades: g.state.grenades,
      hitsBefore: hits.length, lostBefore: +hits.reduce((sum, e) => sum + e.lost, 0).toFixed(1) };
  });
  entry.source = source;
  entry.reserveRounds = entry.spareClips != null && entry.clipRounds ? entry.spareClips * entry.clipRounds : null;
  console.log("CAMPAIGN_03_ENTRY", JSON.stringify(entry));
  await fs.writeFile(path.join(ctx.output, "Data_Campaign03Entry.json"), JSON.stringify(entry, null, 2));
  return entry;
}

/** 03 的统计口之二：03 里挨的每一下（一次性，03 收尾或失败时各打一行）。 */
export async function Report03Damage(ctx) {
  if (ctx.reported03 || !ctx.snapshot03) return;
  ctx.reported03 = true;
  const hits = await ctx.page.evaluate(() => (window.damageForensics || []).filter((e) => e.stage === "Support")).catch(() => []);
  console.log("CAMPAIGN_03_DAMAGE", JSON.stringify(hits));
  // How often the two reflexes fired (counted from 03 on; zero with --no-reflexes).
  const driver = await ctx.page.evaluate(() => { const D = window.MissionInputDriver || {};
    return { reflexes: !!D.reflexes, closeResponses: D.closeResponses || 0, escapes: D.escapes || 0, evadeReturns: D.evadeReturns || 0,
      meleeResponses: D.meleeResponses || 0, evadeFrames: D.evadeFrames || 0, backOffFrames: D.backOffFrames || 0, closeStandoffs: D.closeStandoffs || 0,
      closingFrames: D.closingFrames || 0, closeSwaps: D.closeSwaps || 0, blockedLineFrames: D.blockedLineFrames || 0,
      seconds: Object.fromEntries(Object.entries(D.modeFrames || {}).map(([k, v]) => [k, +(v / 60).toFixed(1)])),
      legs: Object.fromEntries(Object.entries(D.legFrames || {}).map(([k, v]) => [k, +(v / 60).toFixed(1)])) }; }).catch(() => null);
  console.log("CAMPAIGN_03_DRIVER", JSON.stringify(driver));
  // When each 03 fact landed (mission time, and seconds since 03 began), to see which wait a slow 03 spent its time in.
  const facts = await ctx.page.evaluate(() => { const r = window.Tengxian.Debug.FirstLevelMissionRuntime(), log = r.flow.log;
    const start = log.findLast((e) => e.kind === "stage" && e.id === "Support")?.time ?? null;
    return { start, facts: start == null ? [] : log.filter((e) => e.kind === "fact" && e.time >= start).map((e) => [e.id, +(e.time - start).toFixed(1)]) }; }).catch(() => null);
  console.log("CAMPAIGN_03_FACTS", JSON.stringify(facts));
  await fs.writeFile(path.join(ctx.output, "Data_Campaign03Damage.json"), JSON.stringify(hits, null, 2));
}

/** 失败收尾：每次阵亡的现场各打一行 CAMPAIGN_DEATH，全关挨打记录落盘。 */
export async function ReportDeaths(ctx) {
  const out = await ctx.page.evaluate(() => ({ hits: window.damageForensics || [], deaths: window.deathForensics || [] }))
    .catch(() => ({ hits: [], deaths: [] }));
  for (const death of out.deaths) console.log("CAMPAIGN_DEATH", JSON.stringify(death));
  await fs.writeFile(path.join(ctx.output, "Data_DamageForensics.json"), JSON.stringify(out, null, 2));
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
      async ({ points, stance, sprint, rejoinRoute, rejoinTarget, label }) => {
        const g = window.Tengxian;
        if(rejoinRoute){
          const {MissionRouteBetween}=await import("./Script_FirstLevelMissionColumn.mjs");
          points=MissionRouteBetween(rejoinRoute,g.player.position,rejoinTarget);
        }
        window.routeBot = { points, corridor:points, index: 0, frames: 0, stalled: 0, last: { ...g.player.position } };
        if(window.MissionInputDriver)window.MissionInputDriver.leg=label;
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
      { points, stance, sprint, rejoinRoute, rejoinTarget, label },
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
            window.MissionInputDriver.mode="cutscene";
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
          const D=window.MissionInputDriver;
          const evading=(crawl&&fight||D.reflexes)&&D.EvadeGrenade();
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
          // The corridor rejoin above is this leg's own way back after a dodge; otherwise walk back to the dodge's start.
          if(recoverAfterEvade)D.returning=null;
          const close=!evading&&D.reflexes?D.CloseThreat():null;
          if(!evading&&!close&&D.StepHome()){g.StepFrames(1,1/60,false);b.frames++;continue;}
          const foe = evading ? null : fight ? D.Target(crawl?28:90) : close;
          if(crawl&&!evading){
            const low=FRONT_SORTIE.crawl.some(c=>Math.abs(p.x-c.x)<c.w/2+1 && Math.abs(p.z-c.z)<c.d/2+3);
            // Nobody fights a man at arm's length lying down: crouch up for him.
            const desired=low&&!close?"prone":stance;
            if(g.player.stance!==desired)g.Debug.Key(desired==="prone"?"KeyZ":desired==="crouch"?"KeyC":g.player.stance==="prone"?"KeyZ":"KeyC");
            g.Debug.Key("ShiftLeft",sprint&&!low&&!foe);
          }
          window.MissionInputDriver.mode=evading?"evade":foe?"fight":"walk";
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
        if (window.MissionInputDriver.backingOff) { g.Debug.Key("KeyS", false); window.MissionInputDriver.backingOff = false; }
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
          window.MissionInputDriver.leg="WaitStage:"+expected;window.MissionInputDriver.mode="hold";
          for (let i = 0; i < 300 && g.player.alive && g.Debug.FirstLevelMissionRuntime().flow.stage.id !== expected; i++) {
            const evading=window.MissionInputDriver.EvadeGrenade();
            if(!evading&&!window.MissionInputDriver.CloseThreat()&&window.MissionInputDriver.StepHome()){g.StepFrames(1,1/60,false);continue;}
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
