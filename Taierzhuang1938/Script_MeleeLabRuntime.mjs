// 白刃实验场（?melee=1）：一个项目一组正式 Actor；面板选项目、暂停、看动作，取证口 Debug.MeleeCombat。
// 结束后由玩家重开，避免尸体自动复活干扰结果。
// 2026-11-23：面板多一组「玩法」——操控（原版 / 拖拽挥砍）× 命中反馈（原版 / 卡刀）；切了就重开当前项目。
// 网址也能直接指定：?meleeControl=drag&meleeImpact=lodge。变体只在实验场里设，正片的白刃层永远是 classic。
// 同日第二轮（用户）：场景简化成一个对手 —— 六组遭遇、隔墙与标牌都撤了；日军换成遭遇编辑器里那套正式人物（日兵甲，
// X Bot 换皮：Script_EditorBlockoutXBot.XBotSkins，与 Script_EncounterPlay 同一条接法）。
// 2026-11-01 从 Script_Main 搬来；实验场的状态（当前项目、遭遇进度、暂停、动作预览、面板）跟页面走，
// 换关重建不清，与搬家前一致。装配层只按测试场插件的通用接口调它（见 Script_SandboxRanges 头注）。

import { MELEE_SCENARIOS, MELEE_DRAG } from "./Data_MeleeCombat.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { XBotSkins } from "./Script_EditorBlockoutXBot.mjs";
import { MeleeLab } from "./Script_MeleeLab.mjs";
import { T } from "./Script_Text.mjs";

/** 主文件的工具箱（Script_Main 的 ctx），建测试场时交进来。 */
let ctx = null;

let meleeLab = null;
let meleeScenario = "DadaoOne";
let meleePaused = false;
/** 日军用遭遇编辑器那套正式人物：只装日兵甲一个人，读完之前对手先用原身体，读完马上换。 */
const MELEE_ENEMY_CHARACTER = "ijaJia";
let enemySkins = null;
/** 已经换上人物的日军（不往 soldier 上挂字段，契约 20）。 */
const skinned = new WeakSet();
let meleePreview = null;
let meleePreviewFrame = null;
const meleeTargets = [];
const urlParams = new URLSearchParams(globalThis.location?.search || "");
let meleeVariant = { control: urlParams.get("meleeControl") || "classic", impact: urlParams.get("meleeImpact") || "classic" };
/** 拖拽挥砍时视角跟鼠标的比例（面板滑条；网址 ?meleeViewFollow=0.5 也能指定）。 */
let meleeViewFollow = urlParams.has("meleeViewFollow") ? +urlParams.get("meleeViewFollow") : MELEE_DRAG.viewFollow;

function StartMeleeScenario(id) {
  const spec = MELEE_SCENARIOS.find(s => s.id === id) || MELEE_SCENARIOS[0];
  meleeScenario = spec.id; meleePaused = false; meleePreview = null;
  ctx.post.hasPrev=false;ctx.post.hasTaaHistory=false;
  ctx.meleeCombat.Reset();
  meleeVariant = ctx.meleeCombat.SetVariant(meleeVariant);
  meleeViewFollow = ctx.meleeCombat.SetViewFollow(meleeViewFollow);
  for (const soldier of [...ctx.ai.soldiers]) ctx.ai.Remove(soldier);
  meleeTargets.length = 0;
  ctx.player.Spawn(1400, spec.kind === "observe" ? 1470 : 1467, 0);
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
  SkinEnemies();
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

/** 给场上的日军换上日兵甲（遭遇编辑器同款）；人物还没读完就先等，读完再换。 */
function SkinEnemies() {
  if (!enemySkins?.ready) return;
  for (const { soldier } of meleeTargets) {
    if (soldier.side !== "ija" || skinned.has(soldier) || !soldier.alive) continue;
    const skin = enemySkins.Attach(soldier.actor, { faction: "ija", unitId: `Melee_${soldier.id}` });
    if (skin) { ctx.ai.view.SetSkin(soldier, skin); skinned.add(soldier); }
  }
}

function LoadEnemySkins(host) {
  if (enemySkins) return;
  enemySkins = new XBotSkins({ characterKeys: [MELEE_ENEMY_CHARACTER] });
  enemySkins.view = { camera: host.camera, renderer: host.renderer, post: host.post, lightRig: ctx.lights };
  enemySkins.Load().then(() => { if (ctx) SkinEnemies(); });
}

function SeedMeleeTargets() {
  StartMeleeScenario(meleeScenario); meleePaused = true;
  for (const entry of meleeTargets) entry.soldier.meleeTraining.passive = true;
}

/** 白刃层每帧之前：喂这一帧的鼠标位移（拖拽挥砍带刀、出刀）；按着左键拖刀时视角只跟 viewFollow 倍。 */
function BeforeMeleeStep() {
  const input = ctx.input;
  ctx.meleeCombat.AddLook(input?.lookX || 0, input?.lookY || 0);
  if (input && ctx.meleeCombat.CapturesLook) { input.lookX *= meleeViewFollow; input.lookY *= meleeViewFollow; }
}

function MeleeSnapshot() {
  const core = ctx.meleeCombat.State();
  return { ...core, scenario: meleeScenario, viewFollow: meleeViewFollow, menu: ctx.state.menu, health: ctx.player.health, alive: ctx.player.Alive,
    weapon: ctx.meleeCombat.Weapon(ctx.player), stance:ctx.meleeStance?'melee':'fire', preview: meleePreview, paused: meleePaused,
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
  /** 切玩法（{control, impact} 缺哪个留哪个），重开当前项目。 */
  SetVariant: (variant) => { meleeVariant = { ...meleeVariant, ...variant }; StartMeleeScenario(meleeScenario); return { ...meleeVariant }; },
  Variant: () => ({ ...meleeVariant }),
  /** 拖拽时视角跟随比例 0–1（不重开项目）。 */
  SetViewFollow: (value) => (meleeViewFollow = ctx.meleeCombat.SetViewFollow(value)),
  /** 日军换没换上遭遇编辑器那套人物（取证用）。 */
  Skins: () => meleeTargets.map(({ soldier, id }) => ({ id, skinned: skinned.has(soldier), kit: ctx.ai.view.skins.get(soldier)?.kit?.key || null })),
};

/** 测试场插件（Script_SandboxRanges 的 melee）用：第一次建时开面板，撒这一项目的木桩，交回装配层要调的几只钩子。 */
export function CreateMeleeLab(host) {
  ctx = host.ctx;
  LoadEnemySkins(host);
  if (!meleeLab) meleeLab = new MeleeLab({ Start: api.Select, Pause: api.Pause, Preview: api.Preview, SetAssist: api.SetAssist, SetVariant: api.SetVariant, SetViewFollow: api.SetViewFollow, Focus: host.Focus });
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
    // 补兵节拍：人物读完之后补换皮；白刃层每帧之前：喂鼠标、拖刀时吞掉转视角。
    Maintain: SkinEnemies,
    BeforeMeleeUpdate: BeforeMeleeStep,
    // 动作预览：白刃层算完之后把木桩的姿势换成预览片段的那一帧。
    AfterMeleeUpdate() {
      if (!meleePreview) return;
      const pose = ctx.meleeCombat.ViewPose();
      for (const entry of meleeTargets) if (entry.soldier.meleeCombat) entry.soldier.meleeCombat = MeleePreviewPose(entry.soldier, entry.soldier.meleeCombat);
    },
    PreviewPose: (entity, pose) => (meleePreview && pose ? MeleePreviewPose(entity, pose) : null),
    // 键盘全部照常交给白刃层（返回 undefined = 不归实验场管）。
    OnKey() { return undefined; },
    // 底部操作提示整条由实验场给。
    ActionPrompts() {
      const finish=ctx.meleeCombat?.CanUse() && ctx.meleeCombat.FinishCandidate();
      const prompts=finish?[{keys:"F",label:T("hud.prompt.finish"),kind:"push"}]
        :ctx.meleeCombat?.CanUse() && ctx.meleeCombat.PushCandidate() ? [{keys:"F",label:T("hud.prompt.push"),kind:"push"}] : [];
      if(WEAPONS[ctx.currentWeapon]?.bayonet && ctx.state.bayonetFixed)prompts.push({keys:"V",label:ctx.meleeStance?T("hud.prompt.meleeToFire"):T("hud.prompt.fireToMelee"),kind:"melee"});
      return prompts;
    },
    // 面板每 6 帧刷新一次。
    UpdatePanel(frame) { if (frame % 6 === 0) meleeLab?.Update(MeleeSnapshot()); },
  };
}
