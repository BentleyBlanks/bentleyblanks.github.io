// 白刃实验场（?melee=1）：一个项目一组正式 Actor；面板选项目、暂停、看动作，取证口 Debug.MeleeCombat。
// 结束后由玩家重开，避免尸体自动复活干扰结果。
// 2026-11-01 从 Script_Main 搬来；实验场的状态（当前项目、遭遇进度、暂停、动作预览、面板）跟页面走，
// 换关重建不清，与搬家前一致。装配层只按测试场插件的通用接口调它（见 Script_SandboxRanges 头注）。

import { MELEE_ENCOUNTERS, MELEE_SCENARIOS } from "./Data_MeleeCombat.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { MeleeLab } from "./Script_MeleeLab.mjs";
import { T } from "./Script_Text.mjs";

/** 主文件的工具箱（Script_Main 的 ctx），建测试场时交进来。 */
let ctx = null;

let meleeLab = null;
let meleeScenario = "EncounterField";
let meleeEncounter = null;
const meleeCompleted = new Set();
let meleePaused = false;
let meleePreview = null;
let meleePreviewFrame = null;
const meleeTargets = [];

function StartMeleeScenario(id) {
  const spec = MELEE_SCENARIOS.find(s => s.id === id) || MELEE_SCENARIOS[0];
  meleeScenario = spec.id; meleePaused = false; meleePreview = null;
  ctx.post.hasPrev=false;ctx.post.hasTaaHistory=false;
  for(const sign of ctx.battlefield.meleeLabels||[])sign.visible=spec.kind==='field';
  meleeEncounter=null;meleeCompleted.clear();
  ctx.meleeCombat.Reset();
  for (const soldier of [...ctx.ai.soldiers]) ctx.ai.Remove(soldier);
  meleeTargets.length = 0;
  ctx.player.Spawn(1400, spec.kind === "observe" ? 1470 : 1467, 0);
  if(spec.kind==='field')ctx.player.Spawn(1400,1476,0);
  ctx.player.spawnGrace = 0;
  ctx.ApplyDebugOptions();
  ctx.state.slots.primary = "HanYang"; ctx.state.slots.melee = "Dadao";
  ctx.viewmodel.action = null; ctx.state.meleeCharge = null;
  ctx.state.activeSlot = spec.weapon === "Dadao" ? "melee" : "primary";
  ctx.currentWeapon = ctx.SlotWeaponId(ctx.state.activeSlot);
  ctx.state.ammo = ctx.state.mags[ctx.state.activeSlot]?.ammo || 0;
  ctx.state.clips = ctx.state.mags[ctx.state.activeSlot]?.clips || 0;
  ctx.viewmodel.Equip(ctx.currentWeapon, ctx.SlotWeaponVariant(ctx.state.activeSlot));
  ctx.state.bayonetFixed = true; ctx.meleeStance=true; ctx.SyncBayonet();
  ctx.hud.SetWeaponName(ctx.WeaponName(ctx.currentWeapon));
  const centerZ = spec.kind === "observe" ? 1463 : 1467;
  const close = ["push", "ground", "bind"].includes(spec.kind);
  const separation = close ? (spec.kind === "bind" ? 1.04 : 0.82) : 3.3;
  for (let i = 0; i < spec.enemies + (spec.allies || 0); i++) {
    const ally = i >= spec.enemies;
    const offset = spec.enemies === 1 ? 0 : (i - (spec.enemies - 1) / 2) * 1.65;
    const soldier = ctx.ai.Spawn(ally ? "nra" : "ija", 1400 + (ally ? 0 : offset), ally ? centerZ : centerZ - separation, {
      weapon: ally && spec.allyWeapon === "Dadao" ? "Dadao" : ally ? "HanYang" : "Type38", squadId: `Melee_${spec.id}_${i}`,
    });
    if (!soldier) continue;
    soldier.dummy = true; soldier.bayonetFixed = true; soldier.yaw = ally ? 0 : Math.PI;
    soldier.meleeTraining = { kind: spec.kind, slot: i, passive: false };
    soldier.holdZone = null; soldier.goal.copy(soldier.position);
    meleeTargets.push({ soldier, id: ally ? `Friend${i}` : `Enemy${i + 1}` });
  }
  if(spec.kind==='field') for(const encounter of MELEE_ENCOUNTERS) {
    for(let i=0;i<encounter.enemies;i++) {
      const soldier=ctx.ai.Spawn('ija',encounter.x+(i-(encounter.enemies-1)/2)*1.2,encounter.z,{weapon:'Type38',squadId:`Melee_${encounter.id}`});
      if(!soldier)continue;
      soldier.dummy=true;soldier.bayonetFixed=true;soldier.yaw=Math.PI;soldier.meleeDormant=true;
      soldier.meleeTraining={kind:'duel',slot:i,passive:true};soldier.holdZone=null;soldier.goal.copy(soldier.position);
      meleeTargets.push({soldier,id:`${encounter.id}_${i+1}`,encounterId:encounter.id});
    }
  }
  if (spec.kind === "ground") ctx.meleeCombat.Fighter(ctx.player).poise = 20;
  ctx.state.deathTimer = 0; ctx.state.pendingRespawn = false; ctx.state.playerAliveLast = true;
  ctx.player.meleeCameraDrop = 0; ctx.player.meleePose = null;
  ctx.viewmodel.root.visible = true; ctx.hud.HideDeathCard(); ctx.hud.Hint("", 0);
  ctx.hud?.SetMeleeQte(null);
  ctx.hud?.SetCinematicPrompt(null);
  ctx.hud?.SetCinematicBeat(false);
}

function MeleePreviewPose(entity, pose) {
  const normalized = meleePreviewFrame ?? (ctx.state.elapsed % 2) / 2;
  return {...pose, clip: `${ctx.meleeCombat.Weapon(entity)}${meleePreview}`, action: meleePreview,
    state: "preview", t: normalized, normalized, animationNormalized:null,transition:null,duration: 1};
}

function SeedMeleeTargets() {
  StartMeleeScenario(meleeScenario); meleePaused = meleeScenario!=='EncounterField';
  for (const entry of meleeTargets) entry.soldier.meleeTraining.passive = true;
}

function NearbyMeleeEncounter() {
  if(meleeScenario!=='EncounterField' || meleeEncounter || !ctx.player.Alive)return null;
  return MELEE_ENCOUNTERS.find(s=>!meleeCompleted.has(s.id) && Math.hypot(ctx.player.position.x-s.x,ctx.player.position.z-(s.z+3.2))<1.5) || null;
}

function TriggerMeleeEncounter(spec) {
  if(!spec || meleeEncounter || meleeCompleted.has(spec.id))return false;
  meleeEncounter=spec.id;meleePaused=false;
  for(const e of meleeTargets.filter(e=>e.encounterId===spec.id)) {
    e.soldier.meleeDormant=false;e.soldier.meleeTraining.passive=false;
    const f=ctx.meleeCombat.Fighter(e.soldier);f.nextThink=ctx.meleeCombat.time+.65+e.soldier.meleeTraining.slot*.22;
  }
  ctx.meleeCombat.Log('encounterStart',ctx.player,null,{encounter:spec.id});
  ctx.hud.Hint(T("hud.hint.meleeEncounter", { name: spec.name }),2.5);return true;
}

function MaintainMeleeTargets() {
  if(meleeScenario!=='EncounterField')return;
  if(meleeEncounter && !meleeTargets.some(e=>e.encounterId===meleeEncounter && e.soldier.alive)) {
    meleeCompleted.add(meleeEncounter);ctx.meleeCombat.Log('encounterComplete',ctx.player,null,{encounter:meleeEncounter});meleeEncounter=null;
    ctx.hud.Hint(T("hud.hint.meleeEncounterDone"),3);
  }
  const near=NearbyMeleeEncounter();if(near?.trigger==='auto')TriggerMeleeEncounter(near);
}

function MeleeSnapshot() {
  const core = ctx.meleeCombat.State();
  return { ...core, scenario: meleeScenario, menu: ctx.state.menu, health: ctx.player.health, alive: ctx.player.Alive,
    weapon: ctx.meleeCombat.Weapon(ctx.player), stance:ctx.meleeStance?'melee':'fire', preview: meleePreview, paused: meleePaused,
    encounter:meleeEncounter,completed:[...meleeCompleted],nearby:NearbyMeleeEncounter()?.name||null,
    targets: meleeTargets.map(({ soldier: s, id }) => ({ id, runtimeId: s.id, side: s.side, health: s.health, alive: s.alive, x: s.position.x, z: s.position.z, distance: Math.hypot(s.position.x - ctx.player.position.x, s.position.z - ctx.player.position.z), pose: s.meleeCombat })),
    hud: ctx.hud.MeleeQteState(),
  };
}

/** 取证口 Debug.MeleeCombat（名字与签名与搬家前一致）。 */
const api = {
  State: () => MeleeSnapshot(),
  Select: (id) => { StartMeleeScenario(id); return MeleeSnapshot(); },
  Reset: () => { StartMeleeScenario(meleeScenario); return MeleeSnapshot(); },
  Pause: (value) => { meleePaused = value ?? !meleePaused; for (const e of meleeTargets) e.soldier.meleeTraining.passive = meleePaused; return meleePaused; },
  Preview: (clip, frame = null) => {
    if (clip !== meleePreview) ctx.meleeCombat.Cancel("animationPreview");
    meleePreview = clip; meleePreviewFrame = frame; api.Pause(!!clip); return clip;
  },
  SetAssist: (mode) => ctx.meleeCombat.SetAssist(mode),
};

/** 测试场插件（Script_SandboxRanges 的 melee）用：第一次建时开面板，撒这一项目的木桩，交回装配层要调的几只钩子。 */
export function CreateMeleeLab(host) {
  ctx = host.ctx;
  if (!meleeLab) meleeLab = new MeleeLab({ Start: api.Select, Pause: api.Pause, Preview: api.Preview, SetAssist: api.SetAssist, Focus: host.Focus });
  SeedMeleeTargets();
  return {
    debugName: "MeleeCombat", api,
    // 倒下就停在原地等玩家重开（不换人、不弹阵亡卡）。
    holdsRespawn: true,
    OnPlayerDown() {
      ctx.state.pendingRespawn = false; ctx.state.deathTimer = 0;
      ctx.hud.Hint(T("hud.hint.meleeTestDown"), 30);
      return true;
    },
    // 补兵节拍与白刃层每帧之前：遭遇战清点、自动触发。
    Maintain: MaintainMeleeTargets,
    BeforeMeleeUpdate: MaintainMeleeTargets,
    // 动作预览：白刃层算完之后把木桩的姿势换成预览片段的那一帧。
    AfterMeleeUpdate() {
      if (!meleePreview) return;
      const pose = ctx.meleeCombat.ViewPose();
      for (const entry of meleeTargets) if (entry.soldier.meleeCombat) entry.soldier.meleeCombat = MeleePreviewPose(entry.soldier, entry.soldier.meleeCombat);
    },
    PreviewPose: (entity, pose) => (meleePreview && pose ? MeleePreviewPose(entity, pose) : null),
    // F 键：站在「按 F 开打」的遭遇点前就开打（返回 undefined = 不归它管，照常交给白刃层）。
    OnKey(detail) {
      const encounter = detail.code === "KeyF" && detail.down && !detail.repeat ? NearbyMeleeEncounter() : null;
      return encounter?.trigger === 'interact' ? TriggerMeleeEncounter(encounter) : undefined;
    },
    // 底部操作提示整条由实验场给。
    ActionPrompts() {
      const near=NearbyMeleeEncounter();
      const prompts=near?.trigger==='interact'?[{keys:'F',label:near.name,kind:'interact'}]:ctx.meleeCombat?.CanUse() && ctx.meleeCombat.PushCandidate() ? [{keys:"F",label:T("hud.prompt.push"),kind:"push"}] : [];
      if(WEAPONS[ctx.currentWeapon]?.bayonet && ctx.state.bayonetFixed)prompts.push({keys:"V",label:ctx.meleeStance?T("hud.prompt.meleeToFire"):T("hud.prompt.fireToMelee"),kind:"melee"});
      return prompts;
    },
    // 面板每 6 帧刷新一次。
    UpdatePanel(frame) { if (frame % 6 === 0) meleeLab?.Update(MeleeSnapshot()); },
  };
}
