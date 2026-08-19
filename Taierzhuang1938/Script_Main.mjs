// 《血战台儿庄》装配层：把渲染、战场、玩家、AI、特效、音效、HUD 拼起来。
//
// 这一份只做三件事：**启动顺序**、**每帧调度**、**输入**。
// 任何规则都不许写在这里 —— 规则在 Script_Ai / Script_Player / Data_*。
//
// 调试口：window.Taierzhuang = { StepFrames, JumpToPhase, state, ... }
// 出图脚本（Script_ShotTest.mjs）与渲染健康检查全靠它，别删。

import * as THREE from "three";
import { MaterialLibrary } from "./Script_Materials.mjs";
import { SkyDome, SKY_PRESETS } from "./Script_Sky.mjs";
import { LightRig } from "./Script_Light.mjs";
import { PostPipeline } from "./Script_Post.mjs";
import { Battlefield } from "./Script_Battlefield.mjs";
import { NavGrid } from "./Script_Navigation.mjs";
import { PlayerController, STANCE } from "./Script_Player.mjs";
import { AiDirector, MakeSoldierIdentity } from "./Script_Ai.mjs";
import { ActorFactory } from "./Script_Actor.mjs";
import { Viewmodel } from "./Script_Viewmodel.mjs";
import { VfxSystem } from "./Script_Vfx.mjs";
import { AudioEngine } from "./Script_Audio.mjs";
import { Hud } from "./Script_Hud.mjs";
import { StoryDirector } from "./Script_Story.mjs";
import { CombatSystem } from "./Script_Combat.mjs";
import { InputRouter } from "./Script_Input.mjs";
import { RadialWheel } from "./Script_Wheel.mjs";
import { InteractSystem } from "./Script_Interact.mjs";
import { WEAPONS, LOADOUTS, AMMO } from "./Data_Weapons.mjs";
import { OBJECTIVES, PHASES, REINFORCE, ORDERS, SCALE_PRESETS, WORLD, TOWN, COMBAT, DIFFICULTY } from "./Data_Battle.mjs";
import { HISTORY_NOTES, EPILOGUE_LINES } from "./Data_History.mjs";
import { Clamp, Clamp01, Mulberry32 } from "./Script_Noise.mjs";

// 近身班组的人数：不是加出来的兵，是把原本撒在两百米外、被雾墙吃掉的人挪到镜头前。
// 别照着"近景要几个人"直接填这两个数 —— 实测一个 Actor 是 **37 个 draw call**
// （身体部件没合批），撒 14 个近身兵就把 phase4 的 calls 从 1043 顶到 1468，
// 越过 1400 的红线。5 + 4 落在 1300 上下。要再加人，先去合批 Actor。
const NEAR_SQUAD = { nra: 5, ija: 4 };

/**
 * 城墙以内的可站范围。**日方补兵必须落在城里。**
 *
 * 第 1 批的补兵算式是 `frontObjective.z - 30 - rnd()*30`，等于假定日军永远在北面 ——
 * 主攻点一旦是北面的中正门（z = -178）就落到 -208…-238，也就是北寨墙（z = -190）
 * 外面。独立复核实测 90 秒里 190 次日方生成有 164 次（86%）落在 z < -190，
 * 最低到 -224；那批人贴着城墙对着砖墙站到死（AI 没有寻路网格、门洞只有 3.2 m 宽），
 * 常驻 6—12 名滞留在城外，是"打一分半就停摆"的直接成因之一。
 *
 * 现在改成沿"前线 → 己方兵力重心"的方向往后退，并且无论如何夹进这个框里。
 */
const INSIDE_WALLS = (() => {
  const margin = TOWN.wallThickness * 0.5 + 6;
  const north = TOWN.ramparts.find((r) => r.id === "north");
  const west = TOWN.ramparts.find((r) => r.id === "west");
  const east = TOWN.ramparts.find((r) => r.id === "east");
  return {
    minZ: (north ? north.z : WORLD.minZ) + margin,
    // 南边界压到运河北岸再退 6 m：城南那一带现在是真的河槽（见 Battlefield.CanalDepth），
    // 沿用 WORLD.maxZ - 10 会把守军撒进水里 —— 下水的人走不动也开不了枪，等于白扔一个兵
    maxZ: Math.min(WORLD.maxZ - 10, TOWN.canal.z - TOWN.canal.width / 2 - 6),
    minX: (west ? west.x : WORLD.minX) + margin,
    maxX: (east ? east.x : WORLD.maxX) - margin,
  };
})();

const params = new URLSearchParams(location.search);
const QUALITY = params.get("quality") || "high";
const SCALE = SCALE_PRESETS[params.get("scale") || "medium"] || SCALE_PRESETS.medium;
const SHOT = params.get("shot");                 // 出图模式：不进指针锁、固定机位
// 出图专用的两个常驻输入：开镜（E 组唯一能验的镜头）与开火（枪口焰/曳光/抛壳）。
// 必须在 ReadKeys **之后**盖上去 —— 直接写 player.ads 会在下一帧被
// player.Update(input) 里的 input.ads=false 覆盖成 0，实测就是这么白跑一轮的。
const SHOT_ADS = !!(SHOT && params.get("ads"));
const SHOT_FIRE = !!(SHOT && params.get("fire"));
const START_PHASE = Math.max(0, Math.min(PHASES.length - 1, parseInt(params.get("phase") || "0", 10)));

const canvas = document.getElementById("view");
const hudRoot = document.getElementById("hud");
const boot = document.getElementById("boot");
const bootBar = document.querySelector("#bootBar i");
const bootStep = document.getElementById("bootStep");
const bootStart = document.getElementById("bootStart");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
// r185 的 shadowMapTypeDefines 里只有 PCFShadowMap 与 VSMShadowMap；
// 写 PCFSoftShadowMap 会掉进 SHADOWMAP_TYPE_BASIC（硬阴影 + 最近邻）。
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;      // 色调映射收在合成 pass 里
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
// FOV 55：Easy Red 2 那种“周围很远、人很小但看得清”的观感靠窄视场。
// 70 度会把巷战拉成鱼眼，远处的人缩成一个点，尺度感全没了。
const BASE_FOV = 55;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.06, 620);
camera.rotation.order = "YXZ";

const post = new PostPipeline(renderer, {
  width: window.innerWidth, height: window.innerHeight, quality: QUALITY,
});
const ssao = {
  map: { value: post.AoTexture },
  // 这里必须是**主渲染靶**的尺寸，不是 AO 缓冲的尺寸。
  // 事故（连吃两轮）：Script_Materials 注入的采样是
  //   texture2D(uSsaoMap, gl_FragCoord.xy / uSsaoResolution)
  // gl_FragCoord 跑在 hdr 靶上（1600×900），而这里曾经喂 aoBlur 的尺寸 ——
  // high 档 aoScale=0.75，也就是 1200×675，UV 最大到 1.333：整张 AO 被放大
  // 1.333 倍并往左下错位，右上四分之一恒取边缘值。上一轮反复调 uRadius /
  // uIntensity 之所以毫无效果，是在调一张贴错位置的图。
  resolution: { value: new THREE.Vector2(post.width, post.height) },
  // 0.80：贴图位置修正后 AO 真的落在几何转折上了，1.85/0.95 那套是为了
  // 「错位之后还想看见点什么」硬抬起来的补偿值，退回正常量级
  strength: { value: 0.80 },
};
const library = new MaterialLibrary(renderer, { textureSize: QUALITY === "low" ? 256 : 512, ssao });
const sky = new SkyDome(renderer);
scene.add(sky.mesh);
const lights = new LightRig(scene, { quality: QUALITY, shadowExtent: 66 });
const hud = new Hud(hudRoot);
const audio = new AudioEngine({ enabled: !SHOT });

const state = {
  ready: false,
  running: false,
  elapsed: 0,
  frame: 0,
  phaseIndex: START_PHASE,
  phaseTime: 0,
  nraPool: 0,
  ijaPool: 0,
  fallen: [],                 // 阵亡名单：每换一个人就多一条
  deathTimer: 0,
  pendingRespawn: false,
  identity: null,
  order: "follow",
  ordersOpen: false,
  spawnAccumulator: 0,
  smokeHandles: [],           // 常驻烟柱的 handle，换阶段时要一根根拆掉
  // 弹药账。杂牌部队的弹是紧的：中央军一条带装一百发，第 2 集团军「最多也就二三十发」。
  // 之前开火不消耗、不需要装填，桥夹压弹那套动画白做了。
  ammo: 0, clips: 0, grenades: 0, bundles: 0,
  cook: 0,                    // 投弹蓄力/攥弹时间
  cooking: null,              // "Grenade" | "GrenadeBundle"
  outcome: null,              // null | "victory" | "defeat"
  prevAllies: 0,
  storyObjective: null,
  playerAliveLast: true,
  phasePoolNra: 0,            // 本阶段缩放后的中方票池上限（见底提示按它算）
  playerShots: 0,             // 玩家开火累计，与 ai.fireCount 合起来就是全场火力
  captureDrainAccum: 0,       // 占点消耗对方兵力的十秒结算钟
  // --- 武器槽 ---------------------------------------------------------------
  // LOADOUTS 六套携行躺在 Data_Weapons 里一行没接：玩家永远只有 identity.weapon
  // 给的那一支长枪，大刀只在按 V 时凭空出现一下（硬编码 fallback，背包里根本没刀）。
  // 现在四个槽是真的：1 长枪 / 2 驳壳枪 / 3 大刀 / 4 投掷物，滚轮循环。
  slots: { primary: null, secondary: null, melee: null, throwable: "Grenade" },
  activeSlot: "primary",
  // 每支枪各记各的弹仓 —— 换回来不该是满的
  mags: { primary: { ammo: 0, clips: 0 }, secondary: { ammo: 0, clips: 0 } },
  loadoutId: null,
  fireMode: "auto",           // 仅捷克式可切（0 键）
  pickedUp: null,             // 最近一次从尸体上捡到的枪（取证用）
  lastShot: null,             // 最后一发的弹道取证：起点、落点、下坠、枪口视差
};

let battlefield = null;
let navGrid = null;
let player = null;
let ai = null;
let vfx = null;
let viewmodel = null;
let actorFactory = null;
let story = null;
let combat = null;
let interact = null;
let currentWeapon = "HanYang";
// 下令轮盘。HUD 那条静态横排（1跟我来 2向前…）已经撤掉：
// ER2 的指挥手感是"按住 Tab 推一下鼠标松手"，眼睛不用离开战场。
const wheel = new RadialWheel(hudRoot);

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
async function Boot() {
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const setStep = (label, progress) => {
    bootStep.textContent = label;
    bootBar.style.width = `${Math.round(progress * 100)}%`;
  };

  setStep("烘贴图……", 0.02);
  let baked = 0;
  const total = 15;
  for (const name of library.PrepareSteps()) {
    baked += 1;
    setStep(`烘贴图 ${baked}/${total} · ${name}`, 0.02 + 0.22 * (baked / total));
    await nextFrame();
  }

  const phase = PHASES[state.phaseIndex];
  const preset = sky.Apply(phase.sky);
  sky.BakeEnvironment(scene);
  lights.ApplyPreset(preset, sky.sunDirection);
  // 雾全部收到合成 pass 里做（高度雾 + 距离雾 + 按深度去饱和）。
  // 再留一份 THREE.Fog 就是双重打雾，远景直接糊成一块平板。
  scene.fog = null;

  battlefield = new Battlefield(scene, library, { quality: QUALITY });
  for (const step of battlefield.BuildSteps()) {
    setStep(step.label, 0.24 + 0.62 * step.progress);
    await nextFrame();
  }

  setStep("上刺刀……", 0.9);
  actorFactory = new ActorFactory(library, { quality: QUALITY });
  vfx = new VfxSystem(scene, library, { quality: QUALITY, maxParticles: SCALE.vfxBudget });
  // 浮尘：体积光要有介质才散射得出来，不然 godStrength 给再大也只是天上一片糊。
  // AmbientDust 会重建整个 DustField（丢旧的、建新的），所以只在这里调一次，
  // 别放进 EnterPhase —— 每换一关重建一次粒子网格是白扔的 GC。
  vfx.AmbientDust(new THREE.Box3(
    new THREE.Vector3(battlefield.bounds.minX, 0, battlefield.bounds.minZ),
    new THREE.Vector3(battlefield.bounds.maxX, 22, battlefield.bounds.maxZ)), 0.075);
  // depthBudget 1.22（默认 0.90）：腰射姿态把枪往前推到 pz = -0.32 之后，
  // 最深点（枪口 + 刺刀）变成 |0.32 + 0.8175| + 0.04 + 0.02 ≈ 1.20 m，
  // 沿用 0.90 会被 _RecomputeCompensation 压到 0.55 的下限，枪整体缩到眼前 ——
  // 画面不变（等比缩放绕相机原点是恒等的），但枪口离眼睛只剩半米，贴墙时会穿模
  viewmodel = new Viewmodel(library, { fov: 52, depthBudget: 1.22 });
  camera.add(viewmodel.root);
  scene.add(camera);
  // 视图模型的材质要退出深度法线预通道。Equip() 末尾会自己调一次，
  // 这里再调一次纯属兜底（构造期的抛壳池与弹夹道具）。
  if (viewmodel.markNoPrepass) viewmodel.markNoPrepass();

  player = new PlayerController(camera, {
    colliders: battlefield.colliders,
    NearbyColliders: (x, z, r) => battlefield.NearbyColliders(x, z, r),
    GroundHeight: (x, z) => battlefield.GroundHeight(x, z),
    // 下水判定。运河不做游泳系统，做一条软墙 —— 规则在 Script_Player，
    // 地形在 Script_Battlefield，装配层只负责把这条查询接上
    WaterDepth: (x, z, y) => battlefield.WaterDepth(x, z, y),
    bounds: battlefield.bounds,
  }, { seed: 1938 });

  // 导航网格：一张 2 m 一格的"走不走得过去"位图 + 按目标算的下坡场。
  // 没有它，AI 在这座四合院城里就是直奔一堵院墙（见 Script_Navigation 的账）。
  const nav = new NavGrid(battlefield);
  navGrid = nav;
  ai = new AiDirector({
    battlefield, actorFactory, scene, vfx, audio, player, nav,
    // 票池 = 兵力池：**谁死了扣谁的**。
    // 以前只有玩家的命和玩家的战绩会动票池，而 Combat.Blast 的 onKill 不带 side，
    // 装配层写死扣日方 —— 日军炮弹炸死中国兵扣的是日军的票。
    // 现在全部走 Soldier.Kill() 发出来的这一条事件，行内扣减一律删掉（会双扣）。
    onSoldierDeath: (side) => {
      if (side === "nra") state.nraPool = Math.max(0, state.nraPool - 1);
      else state.ijaPool = Math.max(0, state.ijaPool - 1);
    },
  }, { maxAlive: SCALE.maxAlive, seed: 19380324, insideWalls: INSIDE_WALLS });

  // 叙事层：把 Data_Script 那本考据过的剧本派发进开放战场。
  // 在这之前它除了 importmap 之外没有任何地方 import —— 数据在，玩不到。
  story = new StoryDirector({ hud, audio });
  combat = new CombatSystem({
    battlefield, ai, vfx, audio, lights, player, library, scene, story,
  });

  // F 通用交互。槽位与弹仓的账在装配层手里（state.slots / state.mags），
  // 所以规则在 Script_Interact，改状态的那三下通过 hooks 交回这里。
  interact = new InteractSystem({ ai, audio, hud }, {
    SpareClips: () => state.clips,
    TakeWeapon: (weaponId, clips) => PickUpWeapon(weaponId, clips),
    GiveClip: () => {
      if (state.clips <= 1) return false;
      state.clips -= 1;
      return true;
    },
  });

  await nextFrame();
  setStep("就绪", 1.0);
  EnterPhase(state.phaseIndex, true);
  state.ready = true;
  bootStart.disabled = false;
  bootStart.textContent = SHOT ? "（出图模式）" : "进 城";

  // 各阶段的配置时长，给通关冒烟按出厂配置跑用
  state.phaseMinutes = PHASES.map((p) => p.minutes);
  window.Taierzhuang = {
    renderer, scene, camera, post, sky, lights, library, battlefield,
    player, ai, vfx, viewmodel, hud, audio, state,
    story, combat, nav, interact, wheel,
    StepFrames, JumpToPhase: EnterPhase,
    // 通关冒烟用的口子：直接驱动动作，不必去合成键盘事件
    Debug: {
      Reload, DoMelee, CallMortar, EndBattle,
      Throw: (kind, power) => {
        state.cooking = kind; state.cook = (power ?? 0.8) * 1.1; ReleaseCook();
      },
      Fire: () => { input.fire = true; fireEdge = true; TryFire(1); input.fire = false; fireEdge = false; },
      // 键位路由：合成一次键盘事件走完整条链路（KEYMAP -> 上下文 -> OnAction），
      // 不许直接调 SwitchSlot —— 那样测的是函数，不是键位表。
      // 不给 down 就是"点按"：按下**并且松开**。
      // 只发 keydown 的话，InputRouter 会把第二次按下当成长按的自动重复直接吃掉
      // （held 里还留着这个 code），于是"按 1 再按 2 再按 1"只有头一次生效 ——
      // 通关冒烟里"切不回长枪"就是这么来的，而真人按键盘不会漏掉抬起。
      Key: (code, down) => {
        const Send = (type) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
        if (down === undefined) { Send("keydown"); Send("keyup"); return; }
        Send(down ? "keydown" : "keyup");
      },
      Wheel: (delta) => {
        document.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, bubbles: true }));
      },
      Slots: () => ({
        active: state.activeSlot, weapon: currentWeapon, loadout: state.loadoutId,
        slots: { ...state.slots }, viewmodel: viewmodel.weaponId,
        fireMode: state.fireMode, bipod: player.bipod, ads: player.ads,
      }),
      LastShot: () => (state.lastShot ? { ...state.lastShot } : null),
      Difficulty: () => ({ ...DIFFICULTY }),
      // --- 第 3 批的取证口 ---
      // 翻越：翻过几次、此刻在不在半空、脚下多高（上墙要靠这个高度取证）
      Vault: () => ({
        count: player.vaultCount, active: player.vault.active,
        y: player.position.y, x: player.position.x, z: player.position.z,
        aiVaults: ai.vaultCount,
      }),
      // 下水：淹了多深、算不算下水。软墙的三条代价（慢/不能开枪/掉体力）都挂在它上面
      Water: () => ({
        depth: player.waterDepth, inWater: player.InWater, stamina: player.stamina,
      }),
      // 下令轮盘：开着没有、此刻指着第几格、那一格是什么。
      // **名字不许叫 Wheel** —— 上面那个 Wheel 是"滚一下鼠标滚轮"，
      // 同名会把它整个盖掉：实跑里表现为滚轮切槽突然失灵，而两处代码都没错。
      Orders: () => ({
        open: state.ordersOpen, index: wheel.index, label: wheel.Label,
        cursor: { x: wheel.cursorX, y: wheel.cursorY }, order: state.order,
      }),
      // 交互：够得着什么、捡过几次、分过几次弹
      Interact: () => {
        const c = interact.Query(player);
        return {
          kind: c ? c.kind : null, label: c ? c.label : null,
          pickups: interact.pickups, handouts: interact.handouts,
          pickedUp: state.pickedUp, weapon: currentWeapon,
        };
      },
      AdsOffset: () => ({ x: viewmodel.adsOffset.x, y: viewmodel.adsOffset.y }),
      // AI 那边的运行时取证口：某个兵此刻的完整状态
      SoldierInfo: (soldier) => ({
        id: soldier.id, side: soldier.side, state: soldier.state, order: soldier.order,
        holdZone: soldier.holdZone ? soldier.holdZone.id : null,
        bayonet: soldier.bayonetFixed, heat: soldier.heat,
        coolFor: Math.max(0, soldier.coolUntil - ai.time),
        x: soldier.position.x, z: soldier.position.z,
        goalX: soldier.goal.x, goalZ: soldier.goal.z,
      }),
      Ammo: () => ({ ammo: state.ammo, clips: state.clips, grenades: state.grenades, bundles: state.bundles }),
      Spoken: () => hud.spoken.slice(),
      StoryFired: () => story.fired.slice(),
      Outcome: () => state.outcome,
      // 「仗有没有真的在打」只能从运行时取证：全场开火累计（AI + 玩家）、
      // AI 的状态分布、两侧的阵亡计数。读源码是推断不出来的。
      FireCount: () => ai.fireCount + state.playerShots,
      AiStates: () => {
        const out = {};
        for (const s2 of ai.soldiers) {
          if (!s2.alive) continue;
          out[s2.state] = (out[s2.state] || 0) + 1;
        }
        return out;
      },
      Deaths: () => ({ ...ai.deaths }),
      OpenDirections: (x, z, count = 72, probeM = 20) =>
        CountOpenDirections(x, z, battlefield.GroundHeight(x, z), probeM, count),
    },
  };

  if (SHOT) StartRun();
}

// ---------------------------------------------------------------------------
// 阶段
// ---------------------------------------------------------------------------
function EnterPhase(index, initial = false) {
  state.phaseIndex = Clamp(index, 0, PHASES.length - 1);
  const phase = PHASES[state.phaseIndex];
  state.phaseTime = 0;
  // 票池随战场规模缩放。PHASES 里的 900/700 是照着 70 人档写的，
  // 与 SCALE_PRESETS（40/70/110）脱钩：小档打光四十个人要耗九百张票，
  // 池子永远见不到底，「人打光了就守不住」这条胜负规则等于不存在。
  const poolScale = SCALE.maxAlive / 70;
  const scaledNra = Math.round(phase.nraPool * poolScale);
  state.phasePoolNra = scaledNra;
  state.nraPool = initial ? scaledNra : REINFORCE.phaseRefill(state.nraPool, scaledNra);
  state.ijaPool = Math.round(phase.ijaPool * poolScale);

  const preset = sky.Apply(phase.sky);
  sky.BakeEnvironment(scene);
  lights.ApplyPreset(preset, sky.sunDirection);
  hud.SetPhase(phase);
  hud.ShowBrief(phase);
  audio.Ambience(phase.sky === "night" ? "night" : phase.sky === "dawn" ? "dawn" : "battle");

  // 装载这一阶段的剧本段落。phase.story 是 Data_Battle 里早就留好的字段
  // （P1_Wall / P2_Breach / ...），一直没人读。
  if (story) {
    const loaded = story.BeginPhase(phase.story);
    state.storyObjective = null;
    if (phase.counterattack) story.Signal("counterattack");
    if (loaded === 0) console.warn("这一阶段没有剧本段落：", phase.story);
  }

  // 战线：反攻阶段之前，日军从北往南推；反攻阶段反过来
  if (initial || !player.Alive) RespawnPlayer(true);
  SeedSoldiers(phase);
  SeedSmokeColumns(phase);
}

/**
 * 按阶段挂三根常驻烟柱。
 *
 * 为什么非有不可：台儿庄打了半个月，天上一直是烟。没有烟柱的空街等于没打过仗，
 * 而且烟柱是这个场景里唯一能在三百米外读出来、又能把构图竖着切开的东西。
 * VfxSystem.SmokeSource 早就写好了，一次都没被调用过 —— 这里只是接线。
 *
 * 选点：优先已被日方拿下的目标（那儿在烧），不够就按离玩家的距离补。
 * 排掉 45 m 以内的：烟柱底盘半径十几米，长在脸上就是一堵灰墙。
 */
function SeedSmokeColumns(phase) {
  for (const handle of state.smokeHandles) vfx.RemoveSmokeSource(handle);
  state.smokeHandles.length = 0;

  const px = player.position.x;
  const pz = player.position.z;
  const ranked = battlefield.objectives
    .map((o) => ({ o, far: Math.hypot(o.x - px, o.z - pz) }))
    .filter((e) => e.far > 45)
    .sort((a, b) => {
      const ka = a.o.owner === "ija" ? 0 : 1;
      const kb = b.o.owner === "ija" ? 0 : 1;
      if (ka !== kb) return ka - kb;
      return a.far - b.far;
    });

  const burning = phase.sky === "burningStreet";
  for (const entry of ranked.slice(0, 3)) {
    const { o } = entry;
    const y = battlefield.GroundHeight(o.x, o.z) + 1.1;
    // rate 15 而不是拍脑袋的 26：烟池容量 = vfxBudget × 0.30，小规模档只有 660 个，
    // 三根柱子 × 26/s × 9 s ≈ 700 会把池子占满，爆炸和枪口烟就一个都出不来了
    state.smokeHandles.push(vfx.SmokeSource({ x: o.x, y, z: o.z }, {
      kind: "black", rate: 15, radius: 1.1, rise: 3.4,
      sizeStart: 1.2, sizeEnd: 11.0, life: 9.0, opacity: 0.34,
      fire: burning ? 0.35 : 0,
    }));
  }
}

/** 玩家周围半径 r 米内还活着的某一方人数。近身班组靠它「补齐」而不是「每次都加」。 */
function CountNear(side, radius) {
  let n = 0;
  for (const s of ai.soldiers) {
    if (!s.alive || s.side !== side) continue;
    if (Math.hypot(s.position.x - player.position.x, s.position.z - player.position.z) <= radius) n += 1;
  }
  return n;
}

const _losFrom = new THREE.Vector3();
const _losDir = new THREE.Vector3();
/**
 * 从玩家眼位到某个落点的胸口（+1.3 m）有没有被静态碰撞体挡死。
 *
 * 为什么非加这一条：上一轮的验收指标是错的 —— "投影在视锥内 23 人"被当成达标，
 * 实测最近两名（15.3 m / 15.9 m）在木板围墙后、44.7 m 那名在砖墙后，
 * 六张正片里一共只出现一个人。而鲁南民居**对外不开窗、四面围墙**，
 * 随便撒一个点有一多半落在别人家院子里，玩家永远看不见。
 * 往战场里加人已经撞了 draw call 红线，所以只能让已有的人被看见 ——
 * 这是零 draw call 成本的做法。
 */
function HasLineOfSight(toX, toZ) {
  _losFrom.copy(player.EyePosition);
  const toY = battlefield.GroundHeight(toX, toZ) + 1.3;
  _losDir.set(toX - _losFrom.x, toY - _losFrom.y, toZ - _losFrom.z);
  const dist = _losDir.length();
  if (dist < 1e-3) return true;
  _losDir.multiplyScalar(1 / dist);
  const hit = battlefield.Raycast(_losFrom, _losDir, dist);
  // 留 0.6 m 余量：擦着人身边的墙角不算挡住
  return !hit || hit.t >= dist - 0.6;
}

/** 按阶段撒兵：中方守占领点，日方从北面压上来。 */
function SeedSoldiers(phase) {
  const rnd = Mulberry32(1000 + state.phaseIndex * 97);
  // 两个目标数**不减**近身班组：下面两个循环的起点是 CountSide(...)，
  // 近身班组撒完就已经计进去了。再减一次是双重扣减 ——
  // 实测那么写会让 phase0 的存活人数从 32 掉到 19，等于把兵搬到镜头前又搬没了。
  const nraTarget = Math.round(SCALE.maxAlive * 0.45);
  const ijaTarget = Math.round(SCALE.maxAlive * 0.5 * phase.ijaPressure / 1.3);

  // --- 近身班组 -------------------------------------------------------------
  // 事故：实测 59—70 人存活，但 40 m 内只有 1—3 人、120 m 外 43—49 人，
  // 而 fog.max = 0.94 —— 兵是有的，全被雾墙吃掉了，同屏「一个能辨认的人都没有」。
  // 撒兵原本只按占领点铺，占领点离玩家动辄一两百米。这里按**镜头**再补一层：
  // 12—34 m 的环里放中方（近景剪影），55—110 m 的视线方向上放日方（中景）。
  // 用「补齐到 N」而不是「每次加 N」：SeedSoldiers 每 3 秒被调一次，
  // 无条件加人会在半分钟内把整个 maxAlive 名额全填成玩家脚边的人。
  const px = player.position.x;
  const pz = player.position.z;
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  for (let i = CountNear("nra", 40); i < NEAR_SQUAD.nra; i += 1) {
    // 前向弧而不是整圈：整圈撒 5 个人，85° 的水平视场只兜得住 1 个。
    // 这一班本来就是"跟着你往前打"的，压在前方 ±110° 里既合理又让同屏多两个人。
    // 直接转前向量，不要去凑"yaw 对应的极角"—— player.yaw 的零向是 -Z，
    // 跟 atan2(z, x) 差一个 -yaw - π/2，凭印象写必错，兵会撒到背后去
    let open = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const a = (rnd() - 0.5) * 3.8;
      const dx = fx * Math.cos(a) - fz * Math.sin(a);
      const dz = fz * Math.cos(a) + fx * Math.sin(a);
      const r = 12 + rnd() * 22;
      const spot = FindOpenSpot(px + dx * r, pz + dz * r, 6,
        31337 + i * 907 + attempt * 17 + state.phaseIndex * 53, INSIDE_WALLS);
      open = spot;
      if (HasLineOfSight(spot.x, spot.z)) break;
    }
    const s = ai.Spawn("nra", open.x, open.z, { towel: !!phase.nightRaid && rnd() < 0.55 });
    // 不给 holdZone：这一班是跟着镜头走的，钉在占领区里就又跑没影了
    if (s) { s.holdZone = null; s.goal.set(px + fx * 15, 0, pz + fz * 15); }
  }
  for (let i = CountNear("ija", 110); i < NEAR_SQUAD.ija; i += 1) {
    let open = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const d = 55 + rnd() * 55;
      const lateral = (rnd() - 0.5) * 46;
      const spot = FindOpenSpot(px + fx * d - fz * lateral, pz + fz * d + fx * lateral, 8,
        65521 + i * 1361 + attempt * 29 + state.phaseIndex * 89, INSIDE_WALLS);
      open = spot;
      if (HasLineOfSight(spot.x, spot.z)) break;
    }
    const s = ai.Spawn("ija", open.x, open.z, { weapon: rnd() < 0.12 ? "Type11" : "Type38" });
    if (s) s.goal.set(px + s.laneOffset, 0, pz + s.laneOffset * 0.4);
  }

  // 中方：守住还在自己手里的点，**并且往吃紧的那个点增援**。
  // 原来是在所有己方点里等概率随机撒 —— 于是补进来的人平均分到八个点上，
  // 前线那个正在被打的点拿到八分之一，前线永远补不上，仗打两下就散了。
  // 六成去前线、四成铺开：铺开那部分不能省，不然后方的点会空到无人。
  const ours = battlefield.objectives.filter((o) => o.owner === "nra");
  const front = ai.frontObjective?.ija;
  for (let i = ai.CountSide("nra"); i < nraTarget; i += 1) {
    const o = (front && front.owner === "nra" && rnd() < 0.6)
      ? front
      : (ours[Math.floor(rnd() * ours.length)] || battlefield.objectives[0]);
    // 也要夹进城里：中正门那个点圆心 z=-178、半径 26，圆边压到 -204，
    // 而北寨墙在 z=-190 —— 守这个点的人有一批被撒到了墙的**另一面**，
    // 跟涌进城的日军隔着 4 m 高的寨墙贴脸站着，谁也看不见谁（见 INSIDE_WALLS 的账）。
    const open = FindOpenSpot(o.x, o.z, o.radius, 5000 + i * 733 + state.phaseIndex * 31, INSIDE_WALLS);
    const s = ai.Spawn("nra", open.x, open.z, {
      towel: !!phase.nightRaid && rnd() < 0.55,
    });
    if (s) { s.holdZone = o; s.goal.set(o.x, 0, o.z); }
  }
  // 日方：从北面两座城门的缺口**涌进来**，不是在城外列队。
  //
  // 原来生在 z = WORLD.minZ - 8，也就是北寨墙**外面**。而 AI 没有寻路网格，
  // 门洞只有 3.2 m 宽，一百米外它找不到 —— 三十几个人就贴着城墙站成一排对着砖墙瞄。
  // 实跑取证（改之前）：ija 到最近中方兵的中位距离只有 31 m、38 对里 15—38 对在
  // 70 m 内，而**通视的是 0 对**，每一条视线撞的都是 tag=rampart 的那道墙。
  // 于是全场 70 人恒为 advance、开火计数几乎不动 —— 这就是"仗根本没在打"的物理原因。
  // 生在门内 6—32 m 既解决通视，也正是史实里的样子：日军由城门与城墙缺口突入城内。
  // 补进来的人也压到前线：主攻点北侧 30—60 m（日军由北往南推，这是他们的后方一侧）。
  // 还没有前线（开局）时才走城门缺口。补兵永远从城门进的话，前线一旦南移，
  // 后续的人要横穿全城才到得了，实跑表现就是"打一阵停两分钟"。
  const northGates = TOWN.gates.filter((g) => g.z < -100);
  const ijaFront = ai.frontObjective?.ija;
  const ijaCentroid = ai.centroid?.ija;
  for (let i = ai.CountSide("ija"); i < ijaTarget; i += 1) {
    let gate;
    if (ijaFront && ijaCentroid) {
      // 沿"主攻点 → 日军兵力重心"的方向往后退 30—60 m：那一侧才是他们的后方。
      // 写死 z-30 的话，前线一在北面就把人扔到北寨墙外（见 INSIDE_WALLS 的账）。
      let bx = ijaCentroid.x - ijaFront.x, bz = ijaCentroid.z - ijaFront.z;
      let blen = Math.hypot(bx, bz);
      if (blen < 1) { bx = 0; bz = -1; blen = 1; }   // 重心正压在点上：退回北面
      bx /= blen; bz /= blen;
      const back = 30 + rnd() * 30;
      gate = {
        x: ijaFront.x + bx * back + (rnd() - 0.5) * 40,
        z: ijaFront.z + bz * back + (rnd() - 0.5) * 20,
      };
    } else {
      const g = northGates[i % Math.max(1, northGates.length)] || { x: 0, z: WORLD.minZ + 40 };
      gate = { x: g.x + (rnd() - 0.5) * 40, z: g.z + 8 + rnd() * 26 };
    }
    gate.x = Clamp(gate.x, INSIDE_WALLS.minX, INSIDE_WALLS.maxX);
    gate.z = Clamp(gate.z, INSIDE_WALLS.minZ, INSIDE_WALLS.maxZ);
    const open = FindOpenSpot(gate.x, gate.z, 14,
      90001 + i * 617 + state.phaseIndex * 43, INSIDE_WALLS);
    const s = ai.Spawn("ija", open.x, open.z, { weapon: rnd() < 0.12 ? "Type11" : "Type38" });
    if (s) {
      const goal = battlefield.objectives.find((o) => o.owner === "nra") || battlefield.objectives[0];
      s.goal.set(goal.x + s.laneOffset, 0, goal.z + s.laneOffset * 0.4);
    }
  }
}

// ---------------------------------------------------------------------------
// 玩家的死与「填上去」
// ---------------------------------------------------------------------------
/**
 * 找一个能站人的地方。
 * 事故：直接拿占领点圆心 + 随机极坐标出生，一半的点落在院子里 ——
 * 鲁南民居对外不开窗、四面围墙，人一生出来就贴着一堵砖墙，转身也是墙。
 * 这里改成先在街上找：候选点必须**周围一米内没有齐胸以上的碰撞盒**。
 */
const _openFrom = new THREE.Vector3();
const _openDir = new THREE.Vector3();
/**
 * 从一个点往水平各方向射 probeM 米，数有几条是通的。
 *
 * 为什么要有这一条：原来的"站得下"只查了一米内有没有齐胸碰撞盒 ——
 * 鲁南民居四面围墙，院子中央一米内当然什么都没有，于是玩家出生在封闭院落里，
 * 实测 72 个方位 26 m 内**一条都不通**：转一圈全是墙。
 * 站得下不等于打得着，得让候选点至少有三个方向能看出去。
 */
function CountOpenDirections(x, z, y, probeM = 20, count = 8, need = 99) {
  let open = 0;
  _openFrom.set(x, y + 1.5, z);
  for (let k = 0; k < count; k += 1) {
    const a = (k / count) * Math.PI * 2;
    _openDir.set(Math.cos(a), 0, Math.sin(a));
    if (!battlefield.Raycast(_openFrom, _openDir, probeM)) open += 1;
    if (open >= need) return open;
  }
  return open;
}

function FindOpenSpot(cx, cz, radius, seed, limits = null) {
  const rnd = Mulberry32(seed);
  const lo = limits || {
    minX: WORLD.minX + 6, maxX: WORLD.maxX - 6,
    minZ: WORLD.minZ + 6, maxZ: WORLD.maxZ - 6,
  };
  // 通视探测有成本（每个候选点八条射线），所以只给通过"站得下"的候选点做，
  // 并且最多探 16 个：探不到三方位全通的就取探过的里面最好的那个。
  let fallback = null, fallbackOpen = -1, probed = 0;
  for (let i = 0; i < 48; i += 1) {
    const a = rnd() * Math.PI * 2;
    const r = radius * (0.25 + rnd() * 1.35);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (x < lo.minX || x > lo.maxX) continue;
    if (z < lo.minZ || z > lo.maxZ) continue;
    const y = battlefield.GroundHeight(x, z);
    let blocked = false;
    for (const b of battlefield.NearbyColliders(x, z, 1.4)) {
      if (x < b.min[0] - 1.0 || x > b.max[0] + 1.0) continue;
      if (z < b.min[2] - 1.0 || z > b.max[2] + 1.0) continue;
      if (b.max[1] - y < 0.6) continue;              // 矮的东西不算挡路
      blocked = true;
      break;
    }
    if (blocked) continue;
    // 走得到吗。"一米内没有碰撞盒"只证明站得下 —— 封闭院落的中央当然站得下，
    // 但那是个谁也走不进去的口袋。撒进去的守军等于不存在。
    if (navGrid && !navGrid.InMain(x, z)) continue;
    if (probed >= 16) return fallback || { x, z };
    probed += 1;
    const open = CountOpenDirections(x, z, y, 20, 8, 3);
    if (open >= 3) return { x, z };
    if (open > fallbackOpen) { fallbackOpen = open; fallback = { x, z }; }
  }
  // 最后的兜底也要夹进边界里。原来直接把圆心原样返回 ——
  // 传进来的圆心本身在墙外时，这条出口就是把人扔到墙外的那一条。
  return fallback || { x: Clamp(cx, lo.minX, lo.maxX), z: Clamp(cz, lo.minZ, lo.maxZ) };
}

function RespawnPlayer(initial = false) {
  const phase = PHASES[state.phaseIndex];
  const seed = 7919 * (state.fallen.length + 1) + state.phaseIndex * 131;
  state.identity = MakeSoldierIdentity(seed);
  currentWeapon = state.identity.weapon;
  // 在还属于我方、离前线最近的那个点上生
  const ours = battlefield.objectives.filter((o) => o.owner === "nra");
  const spot = ours.length
    ? ours.reduce((a, b) => (a.z < b.z ? a : b))
    : { x: 0, z: 120, radius: 10 };
  // 往我方一侧退 18 米再找位置：生在点心上等于生在交火中央
  const open = FindOpenSpot(spot.x, spot.z + 18, spot.radius, seed, INSIDE_WALLS);
  player.Spawn(open.x, open.z, Math.PI);
  player.bandages = COMBAT.bandages;
  // 领的家当。弹带大半是瘪的 —— 这不是难度设计，是他们上阵时的实际情况。
  //
  // 携行改读 LOADOUTS[phase.loadout]。L3_WhiteTowel（一支长枪、一支短枪、
  // 肩背大刀、腰间挂满手榴弹）是台儿庄最有辨识度的一套装备，以前完全是死的。
  // 例外：L5_Morning 的 primary 是 null —— 那是"四月七日早上仗打完了"的收场携行，
  // 真给 P6 反攻阶段的玩家空手是不能玩的，所以为空时退回这个兵自己的枪。
  const loadout = LOADOUTS[phase.loadout] || null;
  state.loadoutId = phase.loadout || null;
  const primary = loadout?.primary || state.identity.weapon;
  const secondary = loadout?.secondary || null;
  state.slots.primary = primary;
  state.slots.secondary = secondary;
  state.slots.melee = loadout?.melee || null;
  const throwables = loadout?.throwables || {};
  state.grenades = throwables.Grenade ?? (phase.nightRaid ? 8 : 4);
  state.bundles = throwables.GrenadeBundle ?? 2;
  state.slots.throwable = state.grenades > 0 || !state.bundles ? "Grenade" : "GrenadeBundle";
  const spareClips = loadout?.spareClips ?? (phase.nightRaid ? 3 : 5);
  state.mags.primary = { ammo: WEAPONS[primary]?.magazine ?? 5, clips: spareClips };
  state.mags.secondary = secondary
    ? { ammo: WEAPONS[secondary]?.magazine ?? 10, clips: 2 }
    : { ammo: 0, clips: 0 };
  state.activeSlot = "primary";
  currentWeapon = primary;
  state.ammo = state.mags.primary.ammo;
  state.clips = state.mags.primary.clips;
  state.fireMode = "auto";
  player.bipod = false;
  viewmodel.Equip(currentWeapon);
  hud.SetIdentity(state.identity, WEAPONS[currentWeapon]?.name || "步枪");
  state.pendingRespawn = false;
  state.playerAliveLast = true;
}

// ---------------------------------------------------------------------------
// 武器槽
// ---------------------------------------------------------------------------
const SLOT_ORDER = ["primary", "secondary", "melee", "throwable"];

/** 某个槽里现在是哪支枪（投掷物槽里放的是当前选的那一种）。 */
function SlotWeaponId(slot) {
  if (slot === "throwable") return state.slots.throwable;
  return state.slots[slot];
}

/** 换槽。长枪/短枪各记各的弹仓 —— 切回来不该是满的。 */
function SwitchSlot(slot) {
  if (!player?.Alive || !SlotWeaponId(slot)) return false;
  if (slot === state.activeSlot) return false;
  if (viewmodel.IsBusy?.()) return false;          // 拉栓/压弹播到一半不许换手
  if (state.mags[state.activeSlot]) {
    state.mags[state.activeSlot].ammo = state.ammo;
    state.mags[state.activeSlot].clips = state.clips;
  }
  state.activeSlot = slot;
  currentWeapon = SlotWeaponId(slot);
  const mag = state.mags[slot];
  state.ammo = mag ? mag.ammo : 0;
  state.clips = mag ? mag.clips : 0;
  player.bipod = false;                            // 换枪就把两脚架收了
  state.fireMode = "auto";
  viewmodel.Equip(currentWeapon);
  hud.SetIdentity(state.identity, WEAPONS[currentWeapon]?.name || "");
  return true;
}

/** 滚轮循环。空的槽跳过 —— 杂牌部队常常只有一支枪。 */
function CycleSlot(delta) {
  const have = SLOT_ORDER.filter((k) => !!SlotWeaponId(k));
  if (have.length < 2) return false;
  const at = Math.max(0, have.indexOf(state.activeSlot));
  const next = have[(at + (delta > 0 ? 1 : have.length - 1)) % have.length];
  return SwitchSlot(next);
}

/** 架/收两脚架。须卧倒，或者身边 1.4 m 内有个齐腰高的东西能搭上去。 */
function ToggleBipod() {
  if (!player?.Alive) return false;
  const weapon = WEAPONS[currentWeapon];
  if (!weapon?.bipod) { hud.Hint("这支枪没有两脚架", 1.8); return false; }
  let rest = player.stance === "prone";
  if (!rest) {
    for (const b of battlefield.NearbyColliders(player.position.x, player.position.z, 1.4)) {
      const top = b.max[1] - player.position.y;
      if (top > 0.5 && top < 1.35) { rest = true; break; }
    }
  }
  if (!player.ToggleBipod(weapon, rest)) {
    hud.Hint("得先趴下，或者靠着能搭枪的东西", 2.2);
    return false;
  }
  audio.Play(player.bipod ? "magIn" : "bolt", { volume: 0.55 });
  hud.Hint(player.bipod ? "两脚架架好了" : "收了两脚架", 1.6);
  return true;
}

/** 单发／连发。只有捷克式有得切（十一年式是日军的，玩家摸不到）。 */
function ToggleFireMode() {
  const weapon = WEAPONS[currentWeapon];
  if (!weapon?.rpm) { hud.Hint("这支枪只有一种发射方式", 1.6); return false; }
  state.fireMode = state.fireMode === "auto" ? "semi" : "auto";
  hud.Hint(state.fireMode === "auto" ? "连发" : "单发", 1.6);
  return true;
}

function OnPlayerDown() {
  const identity = state.identity;
  state.fallen.push(identity);
  state.nraPool = Math.max(0, state.nraPool - 1);
  hud.ShowDeathCard(identity, "第三十一师 一八六团", REINFORCE.deathCardSeconds);
  state.deathTimer = REINFORCE.deathCardSeconds;
  state.pendingRespawn = true;
  audio.Play("bodyFall", { volume: 0.9 });
  if (story) story.Signal("playerDown");
  // 池子见底：四月四日真下过的命令 —— 担架兵、炊事兵、伙夫都编进来
  if (state.nraPool > 0 && state.nraPool / (state.phasePoolNra || 1) < REINFORCE.lastDitchAt) {
    hud.Say("团长", REINFORCE.lastDitchLine, 6);
  }
}

// ---------------------------------------------------------------------------
// 输入
// ---------------------------------------------------------------------------
const input = {
  forward: 0, strafe: 0, sprint: false, ads: false, lean: 0,
  lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false,
  breathHold: false, fire: false, sensitivity: 1,
};
const keys = new Set();

function StartRun() {
  boot.classList.add("gone");
  state.running = true;
  if (!SHOT) {
    canvas.requestPointerLock?.();
    audio.Unlock();
  }
}
bootStart.addEventListener("click", StartRun);

// 键位全部走 Script_Input 的那张表。装配层这里只剩两件事：
// 把动作名翻译成函数调用（OnAction），以及每帧读一次连续量（router.Read）。
const router = new InputRouter({
  // Tab 按住时 Digit1-6 是下令，松开之后同样的键是武器槽。
  Context: () => (state.ordersOpen ? "orders" : "world"),
  // 没拿到指针锁的第一次点击只用来抢锁，不该同时打出一枪
  Guard: (e) => {
    if (!state.running) return false;
    if (document.pointerLockElement !== canvas && !SHOT) { canvas.requestPointerLock?.(); return false; }
    return true;
  },
  OnAction: (action, detail) => {
    if (!state.ready) return;
    switch (action) {
      case "crouch": input.crouchPressed = true; return;
      case "prone": input.pronePressed = true; return;
      case "reload": Reload(); return;
      case "melee": DoMelee(); return;
      case "bandage":
        if (player?.Bandage()) audio.Play("stripperLoad", { volume: 0.6 });
        return;
      case "interact": DoInteract(); return;
      case "bipod": ToggleBipod(); return;
      case "fireMode": ToggleFireMode(); return;
      case "cycleSlot": CycleSlot(detail.delta); return;
      case "vault": DoVault(); return;
      case "orders":
        // 按住 Tab 出轮盘，松手把指着的那一格下出去。
        // 松手时 ordersOpen 必须**先**置回 false，否则 mousemove 还认为轮盘开着
        state.ordersOpen = !!detail.down;
        hud.SetOrdersVisible(state.ordersOpen);
        if (detail.down) wheel.Open(ORDERS);
        else {
          const picked = wheel.Close();
          if (picked) IssueOrderByKey(picked.key);
        }
        return;
      default: break;
    }
    if (action.startsWith("slot:")) { SwitchSlot(action.slice(5)); return; }
    if (action.startsWith("cook:")) {
      if (detail.down) BeginCook(action.slice(5)); else ReleaseCook();
      return;
    }
    if (action.startsWith("order:")) {
      // 数字键直选：轮盘的兜底通道。选完立刻下令，并把轮盘的指向清掉 ——
      // 不清的话松开 Tab 会把同一条命令再下一次
      const key = action.slice(6);
      wheel.Point(ORDERS.findIndex((o) => o.key === key));
      IssueOrderByKey(key);
      wheel.ClearPick();
    }
  },
});
router.Bind(document);

document.addEventListener("mousemove", (e) => {
  // 轮盘开着的时候鼠标是在选格子，不是在转头。
  // 这条**不查指针锁**：轮盘只要一个方向向量，而 movementX/Y 在锁与不锁下都送达
  // （出图/测试模式下根本拿不到指针锁，查了就等于轮盘在那些模式里是死的）。
  if (state.ordersOpen) { wheel.Move(e.movementX, e.movementY); return; }
  if (document.pointerLockElement !== canvas) return;
  input.lookX += e.movementX;
  input.lookY += e.movementY;
});

/** 轮盘选中的那一格（数字键与松手两条路都走这里）。 */
function IssueOrderByKey(key) {
  const order = ORDERS.find((o) => o.key === key);
  if (!order || !ai || !player) return;
  // 「要炮」不是给弟兄下的令：它不走 IssueOrder，直接进支援通道。
  // F 键腾给通用交互之后，这是叫炮唯一的入口。
  if (order.id === "callFire") { CallMortar(); return; }
  const aimPoint = AimPoint(60);
  const n = ai.IssueOrder(order.id, player.position, aimPoint);
  state.order = order.label;
  if (n > 0) hud.Say("你", `${order.label}！`, 2.2);
}

function ReadKeys() {
  router.Read(input, { ads: player ? player.ads : 0 });
  if (SHOT_ADS) input.ads = true;
  if (SHOT_FIRE) input.fire = true;
}

const _aimDir = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
function AimPoint(maxDist = 120) {
  player.AimDirection(_aimDir);
  const from = player.EyePosition.clone();
  const hit = battlefield.Raycast(from, _aimDir, maxDist);
  const t = hit ? hit.t : maxDist;
  return _aimPoint.copy(from).addScaledVector(_aimDir, t);
}

// ---------------------------------------------------------------------------
// 动作：装填 / 投弹 / 白刃 / 支援
// ---------------------------------------------------------------------------

/** 装填。桥夹压入固定弹仓，一次五发；没有备弹就只能去死人身上找。 */
function Reload() {
  if (!player.Alive || viewmodel.IsBusy?.()) return false;
  const w = WEAPONS[currentWeapon];
  if (!w || state.clips <= 0 || state.ammo >= (w.magazine ?? 5)) return false;
  state.clips -= 1;
  state.ammo = w.magazine ?? 5;
  viewmodel.TriggerReload();
  audio.Play(w.reloadKind === "topMag" ? "magIn" : "stripperLoad", { volume: 0.75 });
  return true;
}

/** 按住蓄力：手榴弹可以攥着数几秒再扔，落地即炸。 */
function BeginCook(kind) {
  if (!player.Alive || state.cooking) return;
  if (kind === "Grenade" && state.grenades <= 0) { hud.Hint("没有手榴弹了", 2); return; }
  if (kind === "GrenadeBundle" && state.bundles <= 0) { hud.Hint("没有集束了", 2); return; }
  state.cooking = kind;
  state.cook = 0;
  audio.Play("grenadePin", { volume: 0.7 });
}

function ReleaseCook() {
  if (!state.cooking || !player.Alive) { state.cooking = null; return; }
  const kind = state.cooking;
  state.cooking = null;
  // 蓄力越久扔越远；同时引信也在烧（cook）—— 这两件事共用同一个计时器，
  // 所以「想扔远」和「想落地即炸」是一对取舍，不是白拿的收益。
  const power = Clamp01(state.cook / 1.1);
  const cooked = Math.max(0, state.cook - 0.35);
  const dir = player.AimDirection(_aimDir).clone();
  combat.Throw(kind, power, player.EyePosition.clone(), dir, cooked);
  if (kind === "Grenade") state.grenades -= 1; else state.bundles -= 1;
  viewmodel.TriggerThrow?.(power);
  state.cook = 0;
}

/** 白刃。大刀是近身补充兵器 —— 这是最后一手，不是第一手。 */
function DoMelee() {
  if (!player.Alive || viewmodel.IsBusy?.()) return false;
  viewmodel.TriggerMelee();
  const weaponId = WEAPONS[currentWeapon]?.bayonet ? currentWeapon : "Dadao";
  const result = combat.Melee(weaponId === currentWeapon ? currentWeapon : "Dadao",
    player.position.clone(), player.AimDirection(_aimDir).clone());
  // 同上：不在这里扣票，阵亡事件已经扣过了
  return !!result;
}

/**
 * 翻越（Space）。**不是跳跃**：贴到能翻的东西才响应，空地按下去什么也不发生，
 * 所以这里对失败一声不吭 —— 一个键老是弹"这里翻不过去"比没反应更烦。
 */
function DoVault() {
  if (!player?.Alive || viewmodel.IsBusy?.()) return false;
  if (!player.TryVault()) return false;
  audio.Play("footstepRubble", { volume: 0.7 });
  return true;
}

/**
 * 通用交互（F）。语义按上下文分流，规则在 Script_Interact。
 * 够不着任何东西时同样一声不吭。
 */
function DoInteract() {
  if (!player?.Alive || !interact) return false;
  return !!interact.Perform(player);
}

/**
 * 捡枪。捡到的枪进 1 号槽（长枪位）—— 杂牌部队换枪就是这么换的：
 * 手上这支打坏了就捡地上那支，`L2_RoomWar` 那条注释说的就是这件事。
 * 缴获日械没有备弹（clips = 0），只有枪里那几发。
 */
function PickUpWeapon(weaponId, clips) {
  if (!player?.Alive || !WEAPONS[weaponId]) return false;
  const magazine = WEAPONS[weaponId].magazine ?? 5;
  state.slots.primary = weaponId;
  state.mags.primary = { ammo: magazine, clips };
  state.pickedUp = weaponId;
  if (state.activeSlot === "primary") {
    currentWeapon = weaponId;
    state.ammo = magazine;
    state.clips = clips;
    player.bipod = false;
    state.fireMode = "auto";
    viewmodel.Equip(currentWeapon);
    hud.SetIdentity(state.identity, WEAPONS[currentWeapon]?.name || "");
  }
  return true;
}

/** 呼叫迫击炮。全集团军的迫击炮数得过来，一局两发 —— 这条稀缺本身就是史实。 */
function CallMortar() {
  if (!player.Alive) return;
  const target = AimPoint(160);
  const r = combat.CallMortar(target);
  if (r.ok) {
    hud.Say("你", `迫击炮，坐标——`, 2.6);
    hud.Hint(`炮弹在路上（还剩 ${r.left} 发）`, 4);
  } else {
    hud.Hint(r.reason, 2.4);
  }
}

// ---------------------------------------------------------------------------
// 开火
// ---------------------------------------------------------------------------
let lastFootstepAt = 0;
let fireCooldown = 0;
let fireEdge = false;                 // 这一帧是不是"刚按下"（单发模式与投掷物槽要用）
const _muzzle = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _bulletPos = new THREE.Vector3();
const _bulletVel = new THREE.Vector3();
const _segDir = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _kick = new THREE.Vector2();
const _marchTargets = [];

/**
 * 弹道步进积分。
 *
 * 以前是纯 hitscan：一条直线射线 + 圆柱判定，瞬时命中、无重力、无飞行时间。
 * 后果不只是"不写实"——**表尺归零没有任何东西可以补偿**，600 m 外和 6 m 外的
 * 落点规律完全一样，提前量这个概念不存在。
 *
 * 这里每段 0.02 s、按 AMMO[weapon.ammo].muzzle 的考据初速走（七九 810 / 六五 762 /
 * 七七 800），段内复用现成的 battlefield.Raycast。7.92×57 在 300 m 上下坠约 0.67 m,
 * 刚好是"瞄头打胸"的量级：可感知，但不至于挫败。重力挂 difficulty.bulletGravity。
 *
 * 40 段 × 每段 16 m ≈ 650 m，覆盖得住最远的 effectiveRangeM（中正式 500 m）。
 * 一枪 40 次 Raycast 听着多，但玩家一秒才打一发，而 AI 侧仍然是概率命中，不走这条路。
 */
function MarchBullet(from, dir, weapon, targets) {
  const muzzle = AMMO[weapon.ammo]?.muzzle || 700;
  const gravity = 9.8 * (DIFFICULTY.bulletGravity ?? 1);
  const range = weapon.effectiveRangeM || 400;
  const stepS = 0.02;
  _bulletPos.copy(from);
  _bulletVel.copy(dir).multiplyScalar(muzzle);
  let travelled = 0;
  for (let step = 0; step < 40 && travelled < range; step += 1) {
    _bulletVel.y -= gravity * stepS;
    _segDir.copy(_bulletVel).multiplyScalar(stepS);
    let segLen = _segDir.length();
    if (segLen < 1e-4) break;
    if (travelled + segLen > range) segLen = range - travelled;
    _segDir.normalize();

    // 先看这一段有没有穿过人：到线段的垂距 < 0.45 m 算命中躯干
    let bestSoldier = null, bestT = Infinity;
    for (const s of targets) {
      _rel.set(s.position.x - _bulletPos.x,
        s.position.y + 0.95 - _bulletPos.y,
        s.position.z - _bulletPos.z);
      const t = _rel.dot(_segDir);
      if (t < 0 || t > segLen) continue;
      const perp = _rel.addScaledVector(_segDir, -t).length();
      if (perp < 0.45 && t < bestT) { bestT = t; bestSoldier = s; }
    }
    const wallHit = battlefield.Raycast(_bulletPos, _segDir, segLen);
    if (bestSoldier && (!wallHit || bestT < wallHit.t)) {
      _hitPoint.copy(_bulletPos).addScaledVector(_segDir, bestT);
      return { soldier: bestSoldier, dist: travelled + bestT, dir: _segDir };
    }
    if (wallHit) {
      _hitPoint.copy(_bulletPos).addScaledVector(_segDir, wallHit.t);
      return { wall: wallHit, dist: travelled + wallHit.t, dir: _segDir };
    }
    _bulletPos.addScaledVector(_segDir, segLen);
    travelled += segLen;
  }
  _hitPoint.copy(_bulletPos);
  return { dist: travelled, dir: _segDir };
}

function TryFire(dt) {
  fireCooldown -= dt;
  if (!input.fire || fireCooldown > 0 || !player.Alive) return;
  if (viewmodel.IsBusy?.()) return;
  // 翻墙翻到一半、或者人泡在运河里：枪都不在手上/在水里，打不出去。
  // 这两条是"翻越"与"下水软墙"各自的代价，不写在这里就等于没有代价
  if (player.Busy || player.InWater) return;
  // 大刀槽按左键 = 挥刀，投掷物槽按左键 = 攥弹（松手才扔，走 ReleaseCook）
  if (state.activeSlot === "melee") { if (fireEdge) DoMelee(); return; }
  if (state.activeSlot === "throwable") {
    if (fireEdge && !state.cooking) BeginCook(state.slots.throwable);
    return;
  }
  const weapon = WEAPONS[currentWeapon];
  if (!weapon) return;
  // 开镜播完之前不给开枪：ER2 的枪举到位才打得出去，
  // 否则"右键 + 左键一起按"永远比先瞄再打划算，开镜就没有意义了。
  if (input.ads && player.ads < 0.9) return;
  // 单发模式（仅捷克式）：一次按下只出一发
  if (weapon.rpm && state.fireMode === "semi" && !fireEdge) return;
  if (state.ammo <= 0) {
    // 空仓那一下：栓停在后面，得自己压桥夹。不提示弹药数（ER2 的步兵 HUD 也不显示），
    // 但空膛的"咔"必须听得出来，不然玩家不知道自己在空按扳机。
    audio.Play("bolt", { volume: 0.5 });
    fireCooldown = 0.35;
    if (state.clips > 0) hud.Hint("按 R 压弹", 2.2);
    return;
  }
  state.ammo -= 1;
  state.playerShots += 1;
  fireCooldown = weapon.fireIntervalS ?? 1.2;

  viewmodel.TriggerFire();
  // 后坐。Data_Weapons 每支枪的 recoil 表以前一次都没读过 —— 开完枪视角纹丝不动。
  // viewmodel 已经按那张表把这一发的相机踢动算好了（含每发随机的偏航方向与开镜衰减），
  // 这里取走并交给 player：顶上去 100%、只回落 70%，剩 30% 要玩家自己压。
  viewmodel.ConsumeCameraKick(_kick);
  player.ApplyRecoil(_kick.x, _kick.y, weapon.recoil?.recoverS ?? 0.4);

  viewmodel.MuzzleWorld(_muzzle);
  audio.Play(currentWeapon === "Zb26" ? "zb26" : "rifleNra", { position: _muzzle.clone() });
  lights.FlashMuzzle(_muzzle, 24);
  vfx.MuzzleFlash(_muzzle, player.AimDirection(_aimDir), { scale: 1.0 });

  // 散布：没有准星，散布决定落点。移动、压制、带伤都会把它撑大。
  const spread = THREE.MathUtils.degToRad(player.SpreadDeg(weapon));
  const dir = player.AimDirection(_aimDir).clone();
  const rnd = Mulberry32(state.frame * 2654435761);
  const ax = (rnd() - 0.5) * spread, ay = (rnd() - 0.5) * spread;
  dir.applyAxisAngle(_yAxis, ax);
  dir.applyAxisAngle(_xAxis, ay);

  // 视差：起点是**枪口**，不是眼睛。这一行改完之后瞄具与枪管不共轴才成立，
  // 近距离必须心里修正，「没有准星」这件事才有物理支撑。
  const from = _muzzle.clone();
  // 视差量 = 枪口到**瞄准轴**的垂距，不是枪口到眼睛的距离。
  // 后者主要是"枪口在眼前多远"（一米三，那是枪本身的长度），跟共不共轴没关系；
  // 真正决定"近距离要不要心里修正"的是这条垂距。
  const eye = player.EyePosition;
  _rel.set(from.x - eye.x, from.y - eye.y, from.z - eye.z);
  const along = _rel.dot(_aimDir);
  const muzzleOffset = _rel.addScaledVector(_aimDir, -along).length();

  _marchTargets.length = 0;
  const range = weapon.effectiveRangeM || 400;
  for (const s of ai.soldiers) {
    if (!s.alive || s.side === "nra") continue;
    if (s.position.distanceTo(from) > range + 4) continue;
    _marchTargets.push(s);
  }
  const shot = MarchBullet(from, dir, weapon, _marchTargets);

  // 弹道取证：落差是相对**实际射出的那条直线**算的，跟散布无关，只跟重力有关
  const horiz = Math.hypot(dir.x, dir.z) || 1e-6;
  const horizDist = Math.hypot(_hitPoint.x - from.x, _hitPoint.z - from.z);
  state.lastShot = {
    dist: shot.dist,
    horizDist,
    dropM: (from.y + dir.y * horizDist / horiz) - _hitPoint.y,
    muzzleOffsetM: muzzleOffset,
    hitKind: shot.soldier ? "soldier" : shot.wall ? "wall" : "none",
    fromY: from.y, endY: _hitPoint.y,
  };

  if (shot.soldier) {
    const part = shot.dist < 40 && Mulberry32(state.frame * 7919)() < 0.12 ? "head" : "torso";
    // 这里**不扣票**：扣票走 Soldier.Kill() 发的阵亡事件。
    // 两条路径同时扣的话，玩家亲手打死的人会扣两票。
    const died = shot.soldier.TakeHit(weapon.damage, part, dir);
    vfx.Blood(_hitPoint, dir, died ? 1 : 0.5);
    audio.Play("impactFlesh", { position: _hitPoint.clone(), volume: 0.7 });
  } else if (shot.wall) {
    const n = new THREE.Vector3(shot.wall.normal[0], shot.wall.normal[1], shot.wall.normal[2]);
    const tag = shot.wall.box.tag;
    const surface = tag === "barricade" ? "sandbag" : tag === "prop" ? "wood" : "brick";
    vfx.Impact(_hitPoint, n, surface);
    audio.Play(surface === "sandbag" ? "impactDirt" : "impactBrick", { position: _hitPoint.clone(), volume: 0.55 });
  }
  vfx.Tracer(_muzzle, _hitPoint.clone(), { kind: "nra" });
}

// ---------------------------------------------------------------------------
// 占领
// ---------------------------------------------------------------------------
function UpdateObjectives(dt) {
  let contestedName = null;
  for (const o of battlefield.objectives) {
    let ours = 0, theirs = 0;
    if (player.Alive && Math.hypot(player.position.x - o.x, player.position.z - o.z) < o.radius) ours += 1;
    for (const s of ai.soldiers) {
      if (!s.alive) continue;
      if (Math.hypot(s.position.x - o.x, s.position.z - o.z) > o.radius) continue;
      if (s.side === "nra") ours += 1; else theirs += 1;
    }
    o.contested = ours > 0 && theirs > 0;
    if (o.contested) contestedName = o.name;
    // 双方都在区内就冻结；只有一方在就按人数推进度
    if (!o.contested) {
      const rate = dt / 26;
      if (theirs > 0 && o.owner === "nra") {
        o.progress -= rate * Math.min(3, theirs) * 0.6;
        if (o.progress <= 0) { o.progress = 0; Flip(o, "ija"); }
      } else if (ours > 0 && o.owner === "ija") {
        o.progress += rate * Math.min(3, ours) * 0.6;
        if (o.progress >= 1) { o.progress = 1; Flip(o, "nra"); }
      }
    }
  }
  return contestedName;
}

function Flip(objective, side) {
  objective.owner = side;
  objective.progress = side === "nra" ? 1 : 0;
  hud.Say(null, side === "nra"
    ? `${objective.name} 夺回来了。`
    : `${objective.name} 丢了。`, 4.2);
  if (objective.line) hud.Say(null, objective.line, 6);
  if (objective.note && HISTORY_NOTES[objective.note]) hud.Note(HISTORY_NOTES[objective.note]);
  if (side === "ija") {
    // 丢了点不是就地散掉：整班后撤到**最近的一个还在我们手里的点**接着守。
    // 原来只把 holdZone 清成 null，人就留在已经丢掉的点上原地对射，
    // 战线不会往后收，也就永远推不动。
    let fallback = null, fallbackDist = 1e9;
    for (const o of battlefield.objectives) {
      if (o === objective || o.owner !== "nra") continue;
      const d = Math.hypot(o.x - objective.x, o.z - objective.z);
      if (d < fallbackDist) { fallbackDist = d; fallback = o; }
    }
    for (const s of ai.soldiers) {
      if (s.holdZone !== objective) continue;
      s.holdZone = fallback;
      if (fallback) s.goal.set(fallback.x + s.laneOffset * 0.5, 0, fallback.z + s.laneOffset * 0.5);
    }
  }
}

// ---------------------------------------------------------------------------
// 帧
// ---------------------------------------------------------------------------
const _forward = new THREE.Vector3();
const _proj = new THREE.Vector3();

/**
 * @param {number} dt 步长
 * @param {boolean} render 要不要走渲染。**只有通关冒烟会传 false。**
 *   理由：通关冒烟要按出厂配置把六个阶段各推四五分钟（近十万帧），而这台机器上
 *   浏览器是软件光栅（swiftshader），连着渲染几万帧之后渲染进程会**阻塞**
 *   （CPU 掉到接近零、主线程停在 GL 调用上，实跑十次卡住六七次，每次都卡在最长的
 *   那一段）。玩法与剧本的断言一帧画面都不需要，画面健康归开机冒烟管
 *   （Script_BootTest 六个阶段都真渲染并读 draw call）。所以这里给一个口子，
 *   而不是把断言的时长缩水去迁就它。
 */
function Frame(dt, render = true) {
  state.frame += 1;
  state.elapsed += dt;
  if (!state.ready) return;

  if (state.deathTimer > 0) {
    state.deathTimer -= dt;
    if (state.deathTimer <= 0 && state.pendingRespawn) {
      if (state.nraPool > 0) RespawnPlayer();
      else hud.Say(null, "没有人可以填上去了。", 8);
    }
  }

  const firePrev = input.fire;
  ReadKeys();
  fireEdge = input.fire && !firePrev;
  player.Update(dt, input, WEAPONS[currentWeapon]);
  input.lookX = 0; input.lookY = 0;
  input.crouchPressed = false; input.pronePressed = false;

  // 脚步。Script_Audio 里 footstepDirt / footstepRubble 一直没有任何地方调用过。
  // 快速匍匐那条"更快也更响"的取舍没有脚步声就不存在 —— 玩家听不见自己变响了。
  if (player.Alive && player.grounded && player.stepDistance - lastFootstepAt > 1.0) {
    const stride = player.stance === "prone" ? 1.0 : (player.sprint > 0.5 ? 2.4 : 1.9);
    if (player.stepDistance - lastFootstepAt > stride) {
      lastFootstepAt = player.stepDistance;
      audio.Play(state.frame % 3 === 0 ? "footstepRubble" : "footstepDirt", {
        volume: (player.stance === "prone" ? 0.22 : 0.45) * (player.fastCrawl ? 1.8 : 1),
      });
    }
  }

  // 交互提示：每六帧扫一次身边够得着的东西。每帧扫等于每帧遍历全场七十个人，
  // 而这条提示是给人看的，六帧（0.1 s）的延迟看不出来
  if (interact && player.Alive && state.frame % 6 === 0) interact.UpdatePrompt(player);

  if (player.Alive) TryFire(dt);
  // 松开左键时把攥着的手榴弹扔出去（投掷物槽里左键 = G 键的等价物）
  if (state.activeSlot === "throwable" && state.cooking && !input.fire) ReleaseCook();

  // 开镜时相机 FOV 收缩 —— 铁瞄的"贴脸"感来自这一下。
  // 屏息再收 6%：ER2 屏息时视野有一点点放大，这是"憋住那一口气把注意力收拢"的
  // 视觉说法，也让玩家一眼知道自己确实在屏息（我们不给体力条）。
  const weapon = WEAPONS[currentWeapon];
  const targetFov = BASE_FOV * (1 - player.ads * (1 - (weapon?.adsFovScale ?? 0.75)))
    * (player.breathHold ? 0.94 : 1);
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov += (targetFov - camera.fov) * Clamp01(dt * 9);
    camera.updateProjectionMatrix();
  }

  viewmodel.Update(dt, {
    dt, moveSpeed: Clamp01(Math.hypot(player.velocity.x, player.velocity.z) / 3.2),
    strafe: input.strafe, grounded: player.grounded, sprint: player.sprint,
    ads: player.ads, lookDeltaYaw: 0, lookDeltaPitch: 0,
    crouch: player.stanceBlend.crouch, elapsed: state.elapsed,
  });

  // 友军倒下：叙事层要靠它触发「他倒了我上，我倒了你上」那几句。
  // 用计数差而不是回调 —— AiDirector 没有死亡事件，加一个回调等于改它的契约，
  // 而计数差在这里够用且不会漏（同一帧死两个人只报一次，叙事上也没差别）。
  const alliesNow = ai.CountSide("nra");
  if (state.prevAllies > 0 && alliesNow < state.prevAllies && story) story.Signal("allyDown");
  state.prevAllies = alliesNow;

  ai.Update(dt, camera);
  vfx.Update(dt, camera, state.elapsed);
  combat.Update(dt, { phase: PHASES[state.phaseIndex] });

  // 投弹蓄力：按住 G/H 的时间同时决定扔多远和引信烧掉多少
  if (state.cooking) state.cook += dt;
  sky.Update(state.elapsed);
  lights.Update(dt, state.elapsed);
  camera.getWorldDirection(_forward);
  lights.UpdateShadowFrustum(player.position, _forward);

  // 死亡判定必须放在**所有会造成伤害的系统都跑完之后**，并且用跨帧状态而不是
  // 帧内局部变量。玩家最常见的死法是被手榴弹/掷弹筒炸死，而爆炸结算在
  // combat.Update 里 —— 判定放在 player.Update 紧后面的话，那一类死法会被整个吞掉：
  // 不弹卡片、兵员池不扣、不换人，玩家永远躺在地上。
  if (state.playerAliveLast && !player.Alive) OnPlayerDown();
  state.playerAliveLast = player.Alive;

  const contested = UpdateObjectives(dt);

  // 占点加速对方兵力流失（ER2 2.0.9 加的那条）。每十秒结算一次：
  // 对方每持有一个点，己方票池按该点的 value 减半（向上取整）扣。
  // 意义是把"占领点"从一个装饰性的进度条变成**真会把你耗死的东西** ——
  // 不去夺点就只是站着流血，这是逼玩家往前打的唯一结构性压力。
  state.captureDrainAccum += dt;
  if (state.captureDrainAccum >= 10) {
    state.captureDrainAccum -= 10;
    let nraBleed = 0, ijaBleed = 0;
    for (const o of battlefield.objectives) {
      const bite = Math.ceil((o.value ?? 2) / 2);
      if (o.owner === "ija") nraBleed += bite; else ijaBleed += bite;
    }
    state.nraPool = Math.max(0, state.nraPool - nraBleed);
    state.ijaPool = Math.max(0, state.ijaPool - ijaBleed);
  }

  // --- 叙事层 ---
  // 身边六十米内有敌人在开枪 = 正在交火。原剧本的 wave:N / waveClear:N
  // 就映射到这个计数上 —— 开放战场没有编排好的波次，但"身边打起来了"这件事有。
  let fighting = false;
  for (const s2 of ai.soldiers) {
    if (!s2.alive || s2.side === "nra") continue;
    if (state.elapsed - s2.lastFire > 2.5) continue;
    if (s2.position.distanceTo(player.position) < 60) { fighting = true; break; }
  }
  story.SetFighting(fighting);
  const playerZone = battlefield.objectives.find((o) =>
    Math.hypot(player.position.x - o.x, player.position.z - o.z) < o.radius);
  story.Update(dt, { playerZone: playerZone ? playerZone.id : null });
  if (story.ObjectiveText) state.storyObjective = story.ObjectiveText;

  // 阶段推进：时间到了就往下走（战况只影响兵员池，不影响史实进程）
  // --- 胜负 ---
  // 之前兵员池减到 0 也不结束、占领点全丢也不结束、阶段只按时间走 —— 没有胜负的
  // 战场只是个靶场。这两条是最低限度：人打光了就守不住，撑到最后一夜就是大捷。
  if (!state.outcome) {
    if (state.nraPool <= 0 && !player.Alive) EndBattle("defeat");
    else if (state.phaseIndex === PHASES.length - 1
      && state.phaseTime > PHASES[state.phaseIndex].minutes * 60 * 0.85) {
      const held = battlefield.objectives.filter((o) => o.owner === "nra").length;
      if (held >= 3) EndBattle("victory");
    }
  }

  state.phaseTime += dt;
  const phase = PHASES[state.phaseIndex];
  if (state.phaseTime > phase.minutes * 60 && state.phaseIndex < PHASES.length - 1) {
    EnterPhase(state.phaseIndex + 1);
  }
  // 补兵
  state.spawnAccumulator += dt;
  if (state.spawnAccumulator > 3) { state.spawnAccumulator = 0; SeedSoldiers(phase); }

  // --- HUD ---
  const ourZone = battlefield.objectives.find((o) =>
    Math.hypot(player.position.x - o.x, player.position.z - o.z) < o.radius);
  hud.SetObjective(contested ? `争夺中：${contested}` : (state.storyObjective || phase.label),
    state.nraPool, ourZone ? state.ijaPool : null);
  hud.SetState({
    stance: STANCE[player.stance].label,
    wounded: player.wounds.length > 0,
    bleeding: player.bleeding,
    bandages: player.bandages,
    breath: player.breathHold,
    order: state.order,
    // 不显示子弹数（ER2 的步兵 HUD 也不显示，自己数或者听拉栓那一下），
    // 但手榴弹与集束是要计划的资源，这两个得看得见。
    grenades: state.grenades,
    bundles: state.bundles,
    mortar: combat.MortarReady ? combat.MortarLeft : 0,
    cooking: state.cooking ? Math.min(1, state.cook / 1.1) : 0,
  });
  hud.SetSuppression(player.suppression);
  hud.SetDamage(Clamp01((1 - player.health / 70)) * 0.62);
  hud.UpdateMarkers(battlefield.objectives, camera, (x, y, z) => {
    _proj.set(x, y, z);
    const dist = _proj.distanceTo(camera.position);
    _proj.project(camera);
    return {
      x: (_proj.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_proj.y * 0.5 + 0.5) * window.innerHeight,
      visible: _proj.z < 1 && Math.abs(_proj.x) < 1 && Math.abs(_proj.y) < 1,
      dist,
    };
  });
  hud.UpdateMinimap(dt, {
    player, objectives: battlefield.objectives, soldiers: ai.soldiers, bounds: battlefield.bounds,
  });
  hud.Update(dt);

  // --- 渲染 ---
  if (!render) return;
  ssao.map.value = post.AoTexture;
  // 同上：gl_FragCoord 在主靶的像素域里，喂 AO 靶尺寸会整张错位
  ssao.resolution.value.set(post.width, post.height);
  const preset = SKY_PRESETS[phase.sky];
  post.Render(scene, camera, {
    sunDirection: sky.sunDirection,
    sunColor: preset.sunColor,
    fog: preset.fog,
    exposure: preset.exposure,
    bloom: preset.bloom,
    godStrength: preset.godStrength,
    saturation: preset.saturation * (1 - player.suppression * 0.35),
    contrast: preset.contrast,
    grain: phase.sky === "night" ? 0.020 : 0.014,
    vignette: 0.42 + player.suppression * 0.22,
    damage: Clamp01(1 - player.health / 62) * 0.55,
    motionBlur: 0.15,
  });
}

/**
 * 收尾。不打歼敌数 —— 中日双方口径至今没有定论，那是宣传数字不是史实。
 * 用「日军残部向峄县、枣庄退却」这种事实性表述收场。
 */
function EndBattle(outcome) {
  if (state.outcome) return;
  state.outcome = outcome;
  if (outcome === "victory") {
    hud.ShowEpilogue(EPILOGUE_LINES);
    audio.Music("aftermath");
  } else {
    hud.ShowEpilogue([
      "台儿庄失守。",
      "",
      "史实里没有发生这件事 —— 一九三八年四月七日凌晨，",
      "中国军队全线反攻，日军残部向峄县、枣庄退却。",
      "",
      "第二集团军是拿伤亡逾十分之七换来的。",
    ]);
    audio.Music(null);
  }
}

/** 出图/测试用：推进固定帧数（不依赖真实时间，画面可复现）。 */
function StepFrames(count = 1, dt = 1 / 60, render = true) {
  for (let i = 0; i < count; i += 1) Frame(dt, render);
}

let last = performance.now();
function Loop(now) {
  requestAnimationFrame(Loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.running) return;
  Frame(dt);
}
requestAnimationFrame(Loop);

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  post.SetSize(window.innerWidth, window.innerHeight);
});

Boot().catch((error) => {
  bootStep.textContent = "启动失败：" + error.message;
  console.error(error);
  throw error;
});
