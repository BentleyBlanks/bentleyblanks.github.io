// 启动与装配：把各模块拉起来、接成一个能玩的回合、跑主循环。
//
// 这里的取舍：
// ① 模块用**动态 import + try/catch** 拉。理由不是「方便偷懒」，而是这个项目由
//    多个并行模块拼成，任何一个没就绪时页面应该给出「哪个模块没起来」的明确
//    提示并继续跑剩下能跑的，而不是整页白屏——白屏是最难查的失败方式。
// ② 开局有一层开始蒙版。它不只是遮丑：移动端的 AudioContext、全屏、屏幕常亮
//    三件事都必须由用户手势触发，没有这一层就永远解不开声音。
// ③ 主循环里所有外部模块的调用都走 optional chaining。契约要求每个模块自己
//    容忍可选依赖，但集成层不能假设「它一定实现了」——不然一个笔误会整局卡死。

import * as THREE from "three";
import { PALETTE, CSS_VARS, SEMANTIC, SHAPE } from "./Data_Palette.mjs";
import { CreateCore, GuessQuality } from "./Script_Core.js";
import { CreateInput } from "./Script_Input.js";
import { CreateCameraRig } from "./Script_Camera.js";
import { CreateSession } from "./Script_Session.js";
import { CreateHand } from "./Script_Hand.js";
import { CreateShop, SHOP_LEVELS } from "./Script_Shop.js";
import { Clamp, Damp, MakeRng } from "./Script_Util.js";

/** 动态 import：拿不到就记一笔，页面继续跑。 */
async function TryLoad(path, name) {
  try {
    return { ok: true, mod: await import(path) };
  } catch (error) {
    console.warn(`[EarSpa3D] 模块 ${name} 未就绪：${error?.message || error}`);
    return { ok: false, mod: null, error, name };
  }
}

const SETTINGS_KEY = "earspa3d.settings.v1";

function LoadSettings() {
  const fallback = {
    quality: "auto", bgm: "teaRoom", master: 0.85, bgmVolume: 0.5, sfxVolume: 0.9,
    gyro: false, inset: true, handedness: "right", seed: 20260910,
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}

function SaveSettings(patch) {
  try {
    const current = LoadSettings();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch { /* 隐私模式下写不了，无所谓 */ }
}

export async function Start() {
  const canvas = document.getElementById("ear-canvas");
  // 画布最终要挂进 UI 建的 #ear-root 里（见 index.html 的 DOM 注释）：
  // #ear-root 带一层渐变底 + overflow:hidden，画布只有作为它的子节点才画在底之上。
  const stage = document.getElementById("ear-stage") || document.body;
  const boot = document.getElementById("ear-boot");

  // CSS 变量先铺一次：UI 模块也会铺，但这里铺了以后，即使 UI 还没就绪，
  // 主循环自己建的蒙版和提示也已经是正确的配色。
  for (const [key, value] of Object.entries(CSS_VARS)) {
    document.documentElement.style.setProperty(key, value);
  }

  const settings = LoadSettings();
  const core = CreateCore({ canvas, quality: settings.quality });
  core.scene.background = new THREE.Color(PALETTE.cream);

  // ── 经营环 ──
  // 一局 = 接待一位客人。规则与数值全在 Script_Shop.js，这里只负责把「钱」和
  // 「等级」接到手感上（工具等级改写 spec），以及驱动 开店→采耳→收款→打烊。
  // 必须在建第一把工具**之前**创建：GetTool 要读工具等级。
  const shop = CreateShop({ seed: settings.seed });

  // ── 时间账：世界构建（程序化贴图 + 耳部 + 房间 + 角色 + 耵聍）在中低端机上
  // 是要花时间的，必须能看见花在哪。这些日志也直接被无头验收读走。
  const timings = [];
  const mark = (label, since) => {
    const ms = Math.round(performance.now() - since);
    timings.push({ label, ms });
    console.info(`[EarSpa3D 耗时] ${label}: ${ms}ms`);
    return performance.now();
  };
  let t0 = performance.now();

  // 开始蒙版**先挂上**：它只是一个 DOM 层，不依赖世界。这样即使构建要几秒，
  // 玩家看到的是标题页而不是白屏或转圈。
  const ready = { resolve: null, done: false };
  const readyPromise = new Promise((resolve) => { ready.resolve = resolve; });
  // 模块加载结果在 BuildIntro 之后才知道，所以这里先占位、加载完再回填。
  // 直接引用 `missing` 会撞上 const 的暂时性死区（蒙版现在是先于模块加载建的）。
  let missing = [];
  const intro = BuildIntro(readyPromise);
  boot?.remove();
  t0 = mark("显示开始页", t0);

  // ── 并行拉模块，谁慢等谁 ──
  const [M, A, T, L, S, U, AU] = await Promise.all([
    TryLoad("./Script_Materials.js", "Materials"),
    TryLoad("./Script_EarAnatomy.js", "EarAnatomy"),
    TryLoad("./Script_Tools.js", "Tools"),
    TryLoad("./Script_Character.js", "Character"),
    TryLoad("./Script_Scene.js", "Scene"),
    TryLoad("./Script_Ui.js", "Ui"),
    TryLoad("./Script_Audio.js", "Audio"),
  ]);
  const W = await TryLoad("./Script_Wax.js", "Wax");
  const D = await TryLoad("./Data_EarTools.mjs", "EarTools");
  missing = [M, A, T, L, S, U, AU, W, D].filter((r) => !r.ok).map((r) => r.name || r.error?.message);
  intro.setMissing(missing);
  t0 = mark("加载模块", t0);

  const quality = core.stats.tier;
  const materials = M.ok ? M.mod.CreateMaterials(THREE, { quality }) : null;
  const rng = MakeRng(settings.seed);
  t0 = mark("程序化材质", t0);

  // ── 耳部 + 角色 + 房间 ──
  const ear = A.ok ? A.mod.BuildEar(THREE, { materials, quality }) : null;
  if (ear?.group) core.scene.add(ear.group);
  const canal = ear?.canal || null;
  if (!canal) console.warn("[EarSpa3D] 没有 canal，交互判定会退化");
  t0 = mark("耳部解剖", t0);

  const character = L.ok ? L.mod.BuildCharacter(THREE, { materials, quality }) : null;
  if (character?.group) core.scene.add(character.group);
  t0 = mark("角色", t0);

  const room = S.ok ? S.mod.BuildRoom(THREE, { materials, quality }) : null;
  if (room?.group) core.scene.add(room.group);
  if (room?.ambient) core.scene.add(room.ambient);
  t0 = mark("房间与灯光", t0);

  // 店里机位要按房间实际包围盒定：房间改了不用回来改相机。
  // 偏移必须是千毫米级的——本作 1 单位 = 1mm，房间是几米见方，
  // 用几十毫米的偏移会拍成一张耳部特写（实测踩过：143mm，画面里只有耳廓和床沿）。
  // rig 在下面才建，所以先算好存起来，建完再喂给它。
  let shopFraming = null;
  if (room?.landmarks?.bounds) {
    const b = room.landmarks.bounds;
    const cx = (b.min.x + b.max.x) / 2;
    const cy = (b.min.y + b.max.y) / 2;
    const cz = (b.min.z + b.max.z) / 2;
    // 看：客人身上再往房间中心偏一点，画框里同时有客人和房间
    const look = new THREE.Vector3(cx * 0.35, cy * 0.32, cz * 0.35);
    // 站：从客人出发、朝房间中心的反方向退开 1.3 米，抬高 0.7 米。
    // **必须是「朝房间内侧退」**，不能拿房间尺寸当偏移直接加——那样相机会退到
    // 墙外面去，画面里只有一面墙的背面（实测就是一片暗褐）。
    const inward = new THREE.Vector3(cx - 0, 0, cz - 0);
    if (inward.lengthSq() < 1e-6) inward.set(0, 0, 1);
    inward.normalize();
    const back = 1300;
    const margin = 260;
    const offset = new THREE.Vector3(
      Clamp(-inward.x * back, b.min.x + margin, b.max.x - margin),
      700,
      Clamp(-inward.z * back, b.min.z + margin, b.max.z - margin),
    );
    shopFraming = { offset, lookAt: look };
  }

  // 微尘：通透空气的关键，UI 里没有开关，跟着画质档走
  if (M.ok && M.mod.MakeDustPoints && (quality !== "low" || true)) {
    const dust = M.mod.MakeDustPoints(THREE, {
      count: quality === "high" ? 900 : quality === "mid" ? 520 : 220,
      radius: 220, seed: settings.seed + 7,
    });
    if (dust) core.scene.add(dust);
  }

  // ── 耵聍 ──
  //
  // 用一层**稳定的门面**包住耵聍场：经营环里换一位客人就换一只耳朵，需要整场
  // 重建耵聍，但 Session / 主循环持有的是引用，重新赋值它们会指到旧的场上。
  // 门面身份不变、内部可换，换客人时不必重建任何上游对象。
  let harvestSeen = 0;
  let waxField = null;
  const wax = {
    get group() { return waxField?.group || null; },
    get deposits() { return waxField?.deposits || []; },
    get softness01() { return waxField?.softness01 ?? 0; },
    set softness01(v) { if (waxField) waxField.softness01 = v; },
    Update: (...a) => waxField?.Update?.(...a),
    Probe: (...a) => waxField?.Probe?.(...a),
    Cleanliness: () => waxField?.Cleanliness?.() ?? 0,
    Harvest: () => waxField?.Harvest?.() ?? [],
    Vibration: (...a) => waxField?.Vibration?.(...a),
    Soften: (...a) => waxField?.Soften?.(...a),
    Irrigate: (...a) => waxField?.Irrigate?.(...a),
    Vacuum: (...a) => waxField?.Vacuum?.(...a),
    stats: () => waxField?.stats?.() ?? null,
    /** 换一只耳朵：整场重建（种子决定耵聍的分布与数量） */
    Rebuild: (customerRng) => {
      if (waxField) {
        core.scene.remove(waxField.group);
        waxField.dispose?.();
        waxField = null;
      }
      if (!W.ok || !canal) return false;
      waxField = W.mod.MakeWaxField(THREE, { canal, rng: customerRng, materials, quality });
      if (waxField?.group) core.scene.add(waxField.group);
      harvestSeen = 0;
      return !!waxField;
    },
    dispose: () => { waxField?.dispose?.(); waxField = null; },
  };
  wax.Rebuild(rng);
  t0 = mark("耵聍", t0);

  // 首件工具**现在就建**：第一个可玩帧不该再等一次建模，而且它的存在决定
  // 「开始」按钮点击后能不能立刻有东西出现在耳朵里。
  const toolSpecs = D.ok ? D.mod.EAR_TOOLS : [];
  const builtTools = new Map();
  const leveledTools = new Map();
  function GetTool(id) {
    // 工具等级真的改手感：Script_Shop.LeveledSpec() 会改写 comfortGain /
    // crackRisk / idealSpeedRange，而耵聍判定读的正是这几个字段。
    const level = shop.ToolLevel(id);
    const key = `${id}@${level}`;
    if (leveledTools.has(key)) return leveledTools.get(key);
    let base = builtTools.get(id);
    if (!base) {
      if (!T.ok || !D.ok) return null;
      base = T.mod.BuildTool(THREE, { id, materials, quality });
      if (base) builtTools.set(id, base);
    }
    if (!base) return null;
    // 用浅拷贝换掉 spec，保留 group / tip / tipRadius / Update（`...base` 全部带上）
    const view = level <= 1 ? base : { ...base, spec: shop.LeveledSpec(base.spec) };
    leveledTools.set(key, view);
    return view;
  }
  if (toolSpecs.length) GetTool(toolSpecs[0].id);
  t0 = mark("首件工具", t0);

  // ── 音频 ──
  const audio = AU.ok ? AU.mod.CreateAudio() : null;
  t0 = mark("音频", t0);

  // ── 光照分模式 ──
  //
  // 现实里耳道是**不透光**的：坐在房间里，房间的光照不进耳道深处，全靠医生的
  // 内窥镜自带灯。游戏里如果照搬房间那套光，管腔会被从四面八方照穿，画面糊成
  // 一片没有明暗的粉白（实测就是这样，完全谈不上「质感」）。所以按模式切光照：
  // 耳道里只留内窥灯的近距离衰减，房间里才用整套环境光。
  const roomLights = [];
  core.scene.traverse((node) => {
    if (node.isLight) roomLights.push({ light: node, base: node.intensity });
  });
  // 内窥灯：一组挂在相机上的「头灯」。
  // 强度必须按**毫米尺度**标定：本作 1 单位 = 1mm，而 three 的点光按
  // intensity / d^decay 衰减，镜头到管壁只有几毫米，所以强度要写成几十上百，
  // 按「米尺度」的思路给 1~3 会暗到全黑（实测过一次，画面漆黑）。
  //
  // 但**最终没有用点光**：相机贴在管壁 1~1.5mm 处，任何点光都会把最近的那一圈壁
  // 烧成纯白，画面一半是死白（也正是实测结果）。平行光没有距离衰减，整根管子被
  // 照得均匀，湿润高光交给材质，反而更像内窥镜的样子。所以主光只有平行光 + 一点点
  // 环境光；点光只在「店里视角」之外的位置留作备用，不参与耳道照明。
  const endoFill = new THREE.DirectionalLight(0xfff6ec, 1.15);
  endoFill.name = "EndoscopeFill";
  core.scene.add(endoFill, endoFill.target);
  core.scene.add(core.camera);
  const endoAmbient = new THREE.AmbientLight(0xffe8d8, 0.3);
  endoAmbient.name = "EndoscopeAmbient";
  core.scene.add(endoAmbient);

  /** 头灯要跟着相机走：平行光的方向 = position → target，两个都得每帧更新 */
  function AimEndoLight(camera) {
    endoFill.position.copy(camera.position);
    camera.getWorldDirection(tmpDir);
    endoFill.target.position.copy(camera.position).addScaledVector(tmpDir, 40);
    endoFill.target.updateMatrixWorld();
  }

  // ── 画中画（角色小窗）需要独立的光 ──
  // 角色的几何在耳道视角里既看不见又会穿镜头，所以让它单独待在一个场景里：
  // 主场景画耳道（内窥灯），画中画场景画角色的脸（固定三点光）。
  // 两个场景共享世界坐标——scene 本身没有变换，所以 earAnchor 的对位照旧成立。
  core.insetScene.background = null;
  const insetKey = new THREE.DirectionalLight(0xffe9d5, 1.5);
  insetKey.position.set(70, 110, 130);
  const insetFill = new THREE.DirectionalLight(0xdcebf7, 0.75);
  insetFill.position.set(-110, 40, 70);
  const insetRim = new THREE.DirectionalLight(0xffffff, 0.6);
  insetRim.position.set(20, -60, -120);
  core.insetScene.add(insetKey, insetFill, insetRim, new THREE.AmbientLight(0xfff3e8, 0.85));

  let charScene = "inset";
  function ApplyLightingForMode(mode) {
    const insideEar = mode !== "shop";
    for (const entry of roomLights) {
      entry.light.intensity = entry.base * (insideEar ? 0.06 : 1);
    }
    // 耳道里的标定：提亮到「清新通透」而不是「浓褐」。分屏比对过三档
    // （1.32/1.00、1.95/1.08、2.6/1.16），取中间偏亮的一档——再亮管壁会失去
    // 层次变成一片粉白，再暗就回到浓褐，两头都试过。
    endoFill.intensity = insideEar ? 2.2 : 0;
    endoAmbient.intensity = insideEar ? 0.55 : 0;
    core.setExposure(insideEar ? 1.12 : 1.05);
    if (room?.group) room.group.visible = !insideEar;
    if (room?.ambient) room.ambient.visible = !insideEar;

    // 角色按模式换场景：耳道里进画中画，店里回主场景
    const want = insideEar ? "inset" : "main";
    if (character?.group && want !== charScene) {
      const from = charScene === "inset" ? core.insetScene : core.scene;
      const to = want === "inset" ? core.insetScene : core.scene;
      if (character.group.parent === from) to.add(character.group);
      charScene = want;
    }
  }

  // ── 输入 / 手 / 机位 / 回合 ──
  const input = CreateInput({
    dom: canvas,
    on: {
      longPress: () => input.SetFine(!input.fine),
      doubleTap: () => CycleCamera(),
      actionStart: () => { hand.OnActionStart(); },
    },
  });
  const rig = CreateCameraRig({ core, canal });
  if (shopFraming) rig.SetShopFraming(shopFraming.offset, shopFraming.lookAt);
  const hand = CreateHand({ canal, core });
  const session = CreateSession({ seed: settings.seed, wax, canal });

  const state = {
    phase: "intro",           // intro | counter | playing | paused | finished
    mode: "canal",
    currentToolId: toolSpecs[0]?.id || null,
    unlocked: new Set(toolSpecs.slice(0, 5).map((t) => t.id)),
    lastHarvestCount: 0,
    comfortSmooth: 0.2,
    expression: "relaxed",
    expressionUntil: 0,
    elapsed: 0,
  };
  /** 当前打开的小铺面板（同一时刻只允许一个） */
  let shopPanel = null;

  // ── UI ──
  const ui = U.ok ? U.mod.CreateUi({
    palette: PALETTE,
    mount: stage,
    tools: toolSpecs.map((t) => ({ ...t, locked: !state.unlocked.has(t.id) })),
    on: {
      toolSelect: (id) => SelectTool(id),
      action: (name) => HandleUiAction(name),
      mode: (id) => SetMode(id),
      camera: (id) => SetCamera(id),
      settings: (patch) => ApplySettings(patch),
    },
  }) : null;

  // 把画布插进 UI 的根容器（成为第一个子节点，压在 HUD 下面）。
  // UI 没起来时退回舞台容器，游戏照样能跑，只是没有 HUD。
  const uiRoot = stage.querySelector("#ear-root") || stage;
  if (canvas.parentElement !== uiRoot) {
    uiRoot.insertBefore(canvas, uiRoot.firstChild);
    core.Resize();
  }

  function ApplySettings(patch) {
    if (patch.quality) {
      const applied = core.SetQuality(patch.quality === "auto" ? GuessQuality() : patch.quality);
      SaveSettings({ ...patch, quality: applied });
    } else {
      SaveSettings(patch);
    }
    if (patch.bgm) audio?.setBgm?.(patch.bgm);
    if (patch.master !== undefined) audio?.setMaster?.(patch.master);
    if (patch.bgmVolume !== undefined) audio?.setBgmVolume?.(patch.bgmVolume);
    if (patch.sfxVolume !== undefined) audio?.setSfxVolume?.(patch.sfxVolume);
    if (patch.inset !== undefined) state.showInset = patch.inset;
    if (patch.gyro !== undefined) {
      if (patch.gyro) input.EnableGyro().then((ok) => ui?.tip?.(ok ? "陀螺仪微调已开启" : "这台设备不支持陀螺仪", { tone: "info" }));
      else input.DisableGyro();
    }
  }

  function SelectTool(id) {
    if (!state.unlocked.has(id)) {
      ui?.tip?.("这件工具还没解锁——先把这只耳朵清干净", { tone: "info", ms: 2600 });
      return;
    }
    const built = GetTool(id);
    if (!built) return;
    state.currentToolId = id;
    hand.SetTool(built);
    hand.Reset();
    ui?.setToolActive?.(id);
    const hint = hand.ActionHint();
    ui?.tip?.(`${built.spec?.cnName || id}：${hint.note}`, { tone: "info", ms: 3200 });
    audio?.playSfx?.("uiTap", { gain: 0.6 });
    // 工具拿到手就自动进入耳道视角：省一次点击，也避免玩家对着房间发愣
    if (state.mode === "shop") SetMode("canal");
  }

  function CycleCamera() {
    const order = ["canal", "macro", "shop"];
    const next = order[(order.indexOf(state.mode) + 1) % order.length];
    SetMode(next);
  }

  function SetMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    rig.SetMode(mode === "shop" ? "shop" : mode === "macro" ? "macro" : "canal");
    if (mode === "shop") hand.Retract(); else hand.Engage();
    ApplyLightingForMode(mode);
    ui?.tip?.(mode === "shop" ? "店里视角：看看客人有多舒服" : mode === "macro" ? "微距：盯住这一小块" : "内窥视角", { tone: "info", ms: 1800 });
  }

  function HandleUiAction(name) {
    switch (name) {
      case "finish": FinishSession(); break;
      case "restart": Restart(); break;
      case "shop": OpenShopPanel(); break;
      case "openDay": OpenDay(); break;
      case "nextCustomer": AfterCustomer(); break;
      case "closeDay": CloseDay(); break;
      case "toggleFine": input.SetFine(!input.fine); break;
      case "toggleInset": state.showInset = !state.showInset; break;
      case "toggleGyro": ApplySettings({ gyro: !settings.gyro }); break;
      default: break;
    }
  }

  // ── 事件路由：把回合里发生的事分发给表现层 ──
  function RouteEvents(events) {
    for (const event of events) {
      switch (event.type) {
        case "tip":
          ui?.tip?.(event.text, { tone: event.tone, ms: event.ms });
          break;
        case "extract": {
          const strength = Clamp(event.amount * 3, 0.15, 1);
          audio?.playSfx?.(event.amount > 0.28 ? "scoopLift" : "scrapeSoft", { gain: 0.5 + strength * 0.4 });
          SetExpression("relaxed", 1.6 + strength);
          rig.SetShake(1 + strength * 1.4);
          break;
        }
        case "bigExtract":
          audio?.playSfx?.("sparkle", { gain: 0.8 });
          SetExpression("happy", 2.6);
          ui?.tip?.("完整地取出来了！", { tone: "good", ms: 2000 });
          break;
        case "achievement":
          audio?.playSfx?.("uiConfirm", { gain: 0.7 });
          ui?.tip?.(`成就 · ${event.name}`, { tone: "good", ms: 3000 });
          break;
        case "mistake":
          audio?.playSfx?.("blink", { gain: 0.5 });
          SetExpression("ouch", 1.2);
          rig.SetShake(2.2);
          break;
        case "discomfort":
          SetExpression("ticklish", 0.5);
          break;
        case "finish":
          ui?.showHarvest?.(event.harvest || []);
          break;
        case "harvest":
          state.lastHarvestCount += 1;
          break;
        default: break;
      }
    }
  }

  let expressionName = "relaxed";
  let expressionTimer = 0;
  function SetExpression(name, seconds = 1.5) {
    expressionName = name;
    expressionTimer = Math.max(expressionTimer, seconds);
  }

  function StartSession() {
    state.phase = "playing";
    session.Start();
    hand.Engage();
    hand.Reset();
    if (!state.currentToolId && toolSpecs.length) SelectTool(toolSpecs[0].id);
    else if (state.currentToolId) SelectTool(state.currentToolId);
    rig.SetMode("canal");
    state.mode = "canal";
    ApplyLightingForMode("canal");
    audio?.setBgm?.(shop.state.mood || settings.bgm || "teaRoom");
    PlayBootChime();
  }

  function PlayBootChime() {
    audio?.playSfx?.("sparkle", { gain: 0.5, rate: 1.1 });
  }

  /** 一局结束：结算给经营环，出收款单，再决定「下一位」还是「打烊」 */
  function FinishSession() {
    if (state.phase === "finished") return null;
    state.phase = "finished";
    const summary = session.Finish();
    hand.Retract();
    rig.SetMode("shop");
    state.mode = "shop";
    ApplyLightingForMode("shop");
    SetExpression("sleepy", 4);
    RouteEvents(session.ConsumeEvents());

    const entry = shop.FinishCustomer(summary);
    ui?.showHarvest?.(summary.harvest);
    if (entry) {
      ui?.showPayout?.(entry);
      audio?.playSfx?.("uiConfirm", { gain: 0.7 });
    }
    // 掏干净了就顺手解锁下一件工具：让「再挖一下」有下一站
    UnlockNextTool(summary.cleanliness01);
    // UI 没提供收款单流程时（或玩家一直不点），自动推进到「下一位 / 打烊」，
    // 免得玩家卡在一张没人管的结算页上。
    window.clearTimeout(state._afterCustomerTimer);
    if (!ui?.showPayout) {
      state._afterCustomerTimer = window.setTimeout(() => { if (state.phase === "finished") AfterCustomer(); }, 2600);
    }
    return { summary, entry };
  }

  /**
   * 工具解锁：把「清洁度做到位」当作解锁条件。
   * 这是给玩家的一条软引导——不逼着他去菜单里挑，而是干得好就自然多一把工具。
   */
  function UnlockNextTool(cleanliness01) {
    if (cleanliness01 < 0.45) return;
    const next = toolSpecs.find((t) => !state.unlocked.has(t.id));
    if (!next) return;
    state.unlocked.add(next.id);
    ui?.tip?.(`新工具到了：${next.cnName || next.id}`, { tone: "good", ms: 3200 });
    ui?.setToolLocked?.(next.id, false);
  }

  /** 开店：排今天的客人，把氛围切到铺面允许的那一档 */
  function OpenDay() {
    const brief = shop.StartDay(MakeRng(shop.state.day * 7919 + settings.seed));
    state.phase = "counter";
    rig.SetMode("shop");
    state.mode = "shop";
    ApplyLightingForMode("shop");
    audio?.setBgm?.(shop.state.mood);
    room?.setMood?.(shop.state.mood);
    ui?.showDayStart?.(BuildShopSnapshot(), ShopHandlers());
    return brief;
  }

  /** 接待：换耳朵（按客人的种子重建耵聍）、换氛围、进耳道视角 */
  function StartCustomer(customerId) {
    const customer = shop.CurrentCustomer();
    if (!customer) return false;
    wax.Rebuild(MakeRng(customer.waxSeed));
    session.Start();
    state.phase = "playing";
    hand.Engage();
    hand.Reset();
    rig.SetMode("canal");
    state.mode = "canal";
    ApplyLightingForMode("canal");
    room?.setMood?.(shop.state.mood);
    state._dangerLatched = false;
    ui?.hideShop?.();
    ui?.tip?.(`客人：${customer.name} · ${customer.tierName}`, { tone: "info", ms: 2600 });
    SelectTool(state.currentToolId || toolSpecs[0]?.id);
    return true;
  }

  function AfterCustomer() {
    shop.AdvanceCustomer();
    if (shop.HasNextCustomer()) OpenDay();
    else CloseDay();
  }

  function CloseDay() {
    shop.NextDay();
    OpenDay();
  }

  function BuildShopSnapshot() {
    const snapshot = shop.Snapshot();
    snapshot.toolOffers = {};
    for (const spec of toolSpecs) snapshot.toolOffers[spec.id] = shop.ToolUpgradeOffer(spec.id);
    snapshot.shopOffer = shop.ShopOffer();
    snapshot.tools = toolSpecs.map((t) => ({ id: t.id, cnName: t.cnName, name: t.name, category: t.category, mechanic: t.mechanic }));
    snapshot.currentCustomerId = shop.CurrentCustomer()?.id || null;
    snapshot.unlocked = Array.from(state.unlocked);
    return snapshot;
  }

  function ShopHandlers() {
    return {
      onStartCustomer: (id) => StartCustomer(id),
      onUpgradeTool: (id) => { shop.UpgradeTool(id); leveledTools.clear(); RefreshShop(); return shop.ToolUpgradeOffer(id); },
      onUpgradeShop: () => { const r = shop.UpgradeShop(); if (r.ok) room?.setMood?.(shop.state.mood); RefreshShop(); return r; },
      onSetMood: (mood) => { shop.state.mood = mood; shop.Save(); room?.setMood?.(mood); audio?.setBgm?.(mood); RefreshShop(); },
      onNextDay: () => { CloseDay(); return BuildShopSnapshot(); },
      onClose: () => ui?.hideShop?.(),
      onReset: () => { shop.Reset(); leveledTools.clear(); OpenDay(); },
      onFinishCustomer: () => FinishSession(),
      onAfterCustomer: () => AfterCustomer(),
    };
  }

  function RefreshShop() {
    ui?.showShop?.(BuildShopSnapshot(), ShopHandlers());
  }

  function OpenShopPanel() {
    if (!ui?.showShop) {
      // UI 还没就绪时也要能玩经营环：用主循环自己的一层简版面板兜底
      ShowFallbackShop();
      return;
    }
    ui.showShop(BuildShopSnapshot(), ShopHandlers());
  }

  /**
   * 兜底小铺面板。
   *
   * 优先用 `Script_Ui.js` 的 `showShop`（它更懂自己那套样式）；UI 没提供时用这里
   * 这一层。**但它不自己写样式**——`.ear-panel / .ear-btn / .ear-opt / .ear-chip`
   * 这些类都在 Style_EarSpa.css 里，直接复用，观感才和 HUD 是同一套东西。
   * 自己塞一套 inline 样式的面板会立刻看起来像另一个游戏。
   *
   * 经营环是**玩法**，不能因为 UI 模块没加载成功就整条断掉——这层存在的意义
   * 就是「无论如何都能开店、能升级、能打烊」。
   */
  function ShowFallbackShop() {
    const snapshot = BuildShopSnapshot();
    const handlers = ShopHandlers();
    if (shopPanel) { shopPanel.remove(); shopPanel = null; }

    const scrim = document.createElement("div");
    scrim.className = "ear-panel-scrim is-open";
    const panel = document.createElement("div");
    panel.className = "ear-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "采耳小铺");

    const head = document.createElement("div");
    head.className = "ear-panel__head";
    const title = document.createElement("div");
    title.className = "ear-panel__title";
    title.textContent = "采耳小铺";
    const sub = document.createElement("div");
    sub.className = "ear-panel__sub";
    sub.textContent = `第 ${snapshot.day} 天 · ${snapshot.shopName} · 声望 ${snapshot.reputation}`;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "ear-btn ear-btn--icon";
    close.setAttribute("aria-label", "关上小铺");
    close.textContent = "×";
    close.addEventListener("click", () => { scrim.remove(); shopPanel = null; });
    head.append(title, sub, close);

    const body = document.createElement("div");
    body.className = "ear-panel__body";

    const purse = document.createElement("div");
    purse.className = "ear-chip";
    purse.style.marginBottom = "10px";
    purse.textContent = `铜钱 ${snapshot.coins} 文　·　客人档次 ${snapshot.rarity}　·　单价 ×${snapshot.priceMul.toFixed(2)}`;
    body.appendChild(purse);

    const field = (label) => {
      const f = document.createElement("div");
      f.className = "ear-field";
      const l = document.createElement("div");
      l.className = "ear-field__label";
      l.textContent = label;
      f.appendChild(l);
      body.appendChild(f);
      return f;
    };
    const opt = (parent, label, onClick, primary = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = primary ? "ear-opt ear-btn--primary" : "ear-opt";
      b.textContent = label;
      if (onClick) b.addEventListener("click", onClick);
      parent.appendChild(b);
      return b;
    };

    const doneCount = snapshot.todayCustomers.filter((c) => c.done).length;
    const cf = field(`今日客人（${doneCount}/${snapshot.todayCustomers.length} 位已接待）`);
    const cRow = document.createElement("div");
    cRow.className = "ear-field__options";
    cf.appendChild(cRow);
    for (const c of snapshot.todayCustomers) {
      if (c.done) {
        const done = document.createElement("div");
        done.className = "ear-chip";
        done.textContent = `${c.name} · 已接待 ${c.paid} 文`;
        cRow.appendChild(done);
      } else {
        opt(cRow, `接待 ${c.name}（${c.tierName}）`, () => { scrim.remove(); shopPanel = null; StartCustomer(c.id); }, true);
      }
    }
    if (!snapshot.todayCustomers.length) {
      const empty = document.createElement("div");
      empty.className = "ear-chip";
      empty.textContent = "今天还没开门";
      cRow.appendChild(empty);
    }

    const tf = field("升级工具（等级越高越省力、越不容易崩碎）");
    const tRow = document.createElement("div");
    tRow.className = "ear-field__options";
    tf.appendChild(tRow);
    for (const tool of snapshot.tools) {
      const offer = snapshot.toolOffers[tool.id];
      const label = offer.maxed
        ? `${tool.cnName} Lv.5 已满级`
        : `${tool.cnName} Lv.${offer.level} → ${offer.cost} 文`;
      const b = opt(tRow, label, () => {
        const r = shop.UpgradeTool(tool.id);
        if (r.ok) { leveledTools.clear(); RefreshShop(); audio?.playSfx?.("uiConfirm", { gain: 0.6 }); }
        else ui?.tip?.("再接待两位客人就够了", { tone: "info", ms: 2200 });
      });
      if (offer.maxed) b.disabled = true;
      else if (!offer.affordable) b.style.opacity = "0.55";
    }

    const sf = field("升级铺面");
    const sRow = document.createElement("div");
    sRow.className = "ear-field__options";
    sf.appendChild(sRow);
    const so = snapshot.shopOffer;
    opt(sRow, so.maxed ? "已是老字号" : `${so.name} · ${so.cost} 文（单价更高、客人更多）`, () => {
      const r = shop.UpgradeShop();
      if (r.ok) { room?.setMood?.(shop.state.mood); RefreshShop(); }
      else ui?.tip?.("攒够钱再来升级铺面", { tone: "info", ms: 2200 });
    }, !so.maxed);

    const mf = field("今天的氛围");
    const mRow = document.createElement("div");
    mRow.className = "ear-field__options";
    mf.appendChild(mRow);
    const MOOD_CN = { teaRoom: "午后茶室", rainNight: "雨夜", morning: "清晨", sleepy: "睡前" };
    for (const mood of ["teaRoom", "morning", "rainNight", "sleepy"]) {
      const unlocked = snapshot.moods.includes(mood);
      const b = opt(mRow, MOOD_CN[mood] || mood, () => {
        if (!unlocked) { ui?.tip?.("升级铺面才能解锁这个氛围", { tone: "info", ms: 2200 }); return; }
        handlers.onSetMood(mood);
      });
      b.setAttribute("aria-pressed", shop.state.mood === mood ? "true" : "false");
      if (!unlocked) { b.disabled = true; b.style.opacity = "0.5"; }
    }

    const foot = field("");
    const fRow = document.createElement("div");
    fRow.className = "ear-field__options";
    foot.appendChild(fRow);
    opt(fRow, "收工，明天再来", () => { scrim.remove(); shopPanel = null; CloseDay(); }, true);
    opt(fRow, "继续采耳", () => { scrim.remove(); shopPanel = null; });

    panel.append(head, body);
    scrim.appendChild(panel);
    stage.appendChild(scrim);
    scrim.addEventListener("click", (e) => { if (e.target === scrim) { scrim.remove(); shopPanel = null; } });
    shopPanel = scrim;
    audio?.playSfx?.("uiTap", { gain: 0.5 });
  }

  function Restart() {
    session.Start();
    state.phase = "playing";
    hand.Engage();
    hand.Reset();
    rig.SetMode("canal");
    state.mode = "canal";
    ApplyLightingForMode("canal");
  }

  // ── 开始蒙版：音频解锁 / 全屏 / 屏幕常亮都必须由手势触发 ──
  //
  // 它必须在世界构建**之前**就挂上（见 Start 开头的顺序）。世界要几秒才建好，
  // 玩家在这几秒里应该看到标题页；如果先构建再挂蒙版，这段就是白屏。
  // 按钮在就绪前显示「正在准备…」，点早了也只是排队等 ready，不会丢输入。
  function BuildIntro(readyPromise) {
    const wrap = document.createElement("div");
    wrap.style.cssText = [
      "position:fixed", "inset:0", "display:flex", "align-items:center", "justify-content:center",
      // z-index 要压过 HUD 层（--ear-z-hud），否则蒙版会被工具架和仪表盖住
      "flex-direction:column", "gap:22px", "z-index:800", "text-align:center", "padding:24px",
      `background:radial-gradient(120% 90% at 50% 20%, ${PALETTE.cream} 0%, ${PALETTE.mint} 60%, ${PALETTE.sky} 100%)`,
      `font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif`,
      `color:${PALETTE.ink}`, "transition:opacity .6s ease",
    ].join(";");
    const title = document.createElement("div");
    title.textContent = "采耳物语";
    title.style.cssText = `font-size:clamp(30px,7vw,52px);letter-spacing:.18em;font-weight:600;color:${PALETTE.ink}`;
    const sub = document.createElement("div");
    sub.innerHTML = "用真实的专业采耳工具，<br>把这只耳朵清得干干净净。";
    sub.style.cssText = `font-size:clamp(13px,3.2vw,16px);line-height:2;color:${PALETTE.inkSoft};letter-spacing:.06em`;
    const hint = document.createElement("div");
    hint.textContent = "向上拖动往里、左右拖动绕圈、双指拧转工具朝向、按住动作键下压";
    hint.style.cssText = `font-size:12px;color:${PALETTE.inkFaint};letter-spacing:.04em;max-width:26rem;line-height:1.9`;
    const button = document.createElement("button");
    // 给开始按钮一个稳定 id：自动化验收要按它，而 `#ear-root button`
    // 会先撞上 HUD 的齿轮按钮（点错按钮的代价是一次完整的误判排查）。
    button.id = "ear-start";
    button.textContent = "正在准备…";
    button.disabled = true;
    button.style.cssText = [
      `padding:16px 52px`, `border:none`, `border-radius:${SHAPE.radiusPill}`,
      `background:${PALETTE.inkFaint}`, `color:#fff`, `font-size:17px`, "letter-spacing:.2em",
      `box-shadow:0 12px 30px rgba(111,214,182,.42)`, "cursor:default", "font-family:inherit",
      "transition:transform .16s ease, background .3s ease",
    ].join(";");
    button.addEventListener("pointerdown", () => { if (!button.disabled) button.style.transform = "scale(.94)"; });
    button.addEventListener("pointerup", () => { button.style.transform = ""; });

    const missingBox = document.createElement("div");
    missingBox.style.cssText = `font-size:11px;color:${SEMANTIC.danger};opacity:.85;max-width:30rem;line-height:1.8`;
    const setMissing = (list) => {
      if (!list || !list.length) return;
      missingBox.textContent = `（未就绪的模块：${list.join("、")}）`;
    };

    wrap.append(title, sub, hint, button, missingBox);
    stage.appendChild(wrap);
    wrap.setMissing = setMissing;

    readyPromise.then(() => {
      button.disabled = false;
      button.textContent = "开始采耳";
      button.style.background = PALETTE.mintAccent;
      button.style.cursor = "pointer";
    });

    const enter = () => {
      button.removeEventListener("pointerup", enter);
      // 音频解锁必须在手势里同步发起，这条不能等
      try { audio?.unlock?.(); } catch (error) { console.warn(error); }

      // 全屏与屏幕常亮都只是「增强」，**一律不 await**。
      // 实测：无头/无真实手势的环境下 navigator.wakeLock.request() 返回的 promise
      // 永远不 settle，`await` 会把整个开始流程挂死——蒙版一直盖在画面上，
      // 看起来完全像渲染坏了，实际是这一行之过。任何不决定游戏能否开始的东西，
      // 都不该挡在开始前面。
      RequestFullscreenQuietly();
      RequestWakeLockQuietly();
      if (settings.gyro) input.EnableGyro();

      const go = () => {
        wrap.style.opacity = "0";
        window.setTimeout(() => wrap.remove(), 620);
        // 进游戏 = 开门营业，不是直接开一局：先给今天的客人名单，
        // 玩家自己选先接待谁——这一下就把「经营」立住了。
        OpenDay();
      };
      // 点早了（世界还没建好）：按钮自己变成等待态，世界好了立刻开始
      if (button.disabled) {
        button.textContent = "马上就好…";
        readyPromise.then(go);
      } else {
        go();
      }
    };
    button.addEventListener("pointerup", enter);
    return wrap;
  }

  /** 全屏：进不去就算了，绝不让它挡住开始 */
  function RequestFullscreenQuietly() {
    try {
      const mobile = /Android|iPhone|iPad|Mobile|HarmonyOS/i.test(navigator.userAgent);
      if (mobile && !document.fullscreenElement) {
        const p = document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
        p?.catch?.(() => { /* 浏览器不允许，正常 */ });
      }
    } catch { /* 同上 */ }
  }

  /** 屏幕常亮：不 await，失败静默。采耳是长时间盯屏的游戏，这条挺重要，但不能阻塞 */
  function RequestWakeLockQuietly() {
    try {
      const p = navigator.wakeLock?.request?.("screen");
      p?.then?.((sentinel) => {
        // 切后台回来系统会收回锁，需要重新申请
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) sentinel?.released && navigator.wakeLock.request("screen").catch(() => {});
        }, { once: true });
      })?.catch?.(() => { /* 不支持就算了 */ });
    } catch { /* 同上 */ }
  }

  // ── 主循环 ──
  let running = true;
  let firstFrame = true;
  let lastTipWorld = new THREE.Vector3();

  function Frame(now) {
    if (!running) return;
    // rAF 回调里抛异常会让整个循环静默死掉：画面冻在最后一帧、什么都不报，
    // 这是最难查的失败方式（本项目的内窥视角就栽过一次）。所以这一层要
    // **抓住、报出来、并继续跑下一帧**——画错一帧远好过整页变石头。
    try {
      FrameBody(now);
    } catch (error) {
      frameErrors += 1;
      if (frameErrors <= 3) {
        console.error(`[EarSpa3D] 第 ${frameErrors} 次帧异常：`, error);
      }
      if (frameErrors === 1) {
        ui?.tip?.("画面出了点小状况，已经跳过这一帧", { tone: "warn", ms: 2600 });
      }
    }
    requestAnimationFrame(Frame);
  }

  let frameErrors = 0;
  let frameCount = 0;
  let skipRender = false;

  /**
   * 按固定步长推进若干帧并渲染。
   *
   * 存在的理由：无头浏览器会把不可见页面的 rAF 压到 ~1fps，而本项目所有镜头、
   * 抬离、阻尼都是「按时间收敛」的——1fps 下它们永远停在半路，截图里就是空白，
   * 看起来像渲染坏了，其实只是没走够帧。验收（Script_Probe.mjs）需要一条
   * **不依赖浏览器帧调度**的推进路径，否则每次判断都要靠猜。
   */
  function StepFrames(count = 60, stepDt = 1 / 60) {
    const n = Math.max(1, Math.min(1200, Math.round(count)));
    skipRender = true;
    for (let i = 0; i < n; i += 1) {
      try {
        FrameBody(performance.now(), stepDt);
      } catch (error) {
        frameErrors += 1;
        if (frameErrors <= 3) console.error(`[EarSpa3D] step 第 ${frameErrors} 次帧异常：`, error);
        break;
      }
    }
    skipRender = false;
    // 最后补画一帧，保证调用方拿到的画面就是推进后的状态
    try { FrameBody(performance.now(), stepDt); } catch { /* 同上 */ }
    return { frames: n, frameErrors, stats: { ...core.stats } };
  }

  function FrameBody(now, forcedDt = null) {
    const rawDt = forcedDt !== null ? forcedDt : core.Tick(now);
    const dt = rawDt * (session.state.timeScale || 1);
    state.elapsed += dt;

    const inputFrame = input.Consume(rawDt);

    // 缩放：捏合与滚轮都改内窥可视距离
    if (inputFrame.pinch) rig.Zoom(inputFrame.pinch);
    if (inputFrame.wheel) rig.Zoom(inputFrame.wheel);

    const playing = state.phase === "playing";
    const handFrame = hand.Update(dt, playing ? inputFrame : { ...inputFrame, actionHeld: false }, { locked: !playing || state.mode === "shop" });

    // 工具尖位移：碎屑掉落与「刮了多长」都靠它
    const tipMoved = handFrame.tipWorld.distanceTo(lastTipWorld);
    lastTipWorld.copy(handFrame.tipWorld);

    let probe = null;
    if (wax?.Probe && playing && state.mode !== "shop") {
      probe = wax.Probe({
        tip: handFrame.tipWorld,
        tipPrev: lastTipWorld,
        tool: hand.tool,
        dt,
        motion: {
          speed: handFrame.speed,
          pressure01: handFrame.pressure01,
          action01: handFrame.action01,
          actionHeld: handFrame.actionHeld,
          spinRate: handFrame.spinRate,
          angleError01: handFrame.angleError01,
          vibration01: hand.state.vibration01,
          toolId: hand.spec?.id,
          zone: canal?.ZoneAt?.(handFrame.depth),
        },
      });
    }

    const zone = canal?.ZoneAt?.(handFrame.depth) || "cartilage";
    if (playing) {
      const motion = {
        speed: handFrame.speed,
        pressure01: handFrame.pressure01,
        spinRate: handFrame.spinRate,
        angleError01: handFrame.angleError01,
        speedError01: handFrame.speedError01,
        removedTotal: wax?.RemovedTotal?.() ?? 0,
      };
      session.Update(dt, {
        dt, tool: hand.tool, motion, probe, zone, depth: handFrame.depth,
        harvestNew: TakeHarvest(),
      });
      RouteEvents(session.ConsumeEvents());

      // 危险区/鼓膜：越界那一刻只罚一次，不是每帧扣
      if ((zone === "danger" || zone === "drum") && handFrame.lift < 0.4) {
        if (!state._dangerLatched) {
          state._dangerLatched = true;
          session.Mistake(zone === "drum" ? "drum" : "tooDeep", { depth: handFrame.depth });
          ui?.tip?.(zone === "drum" ? "停！那是鼓膜" : "有点深了，退出来一点", { tone: "warn", ms: 2600 });
        }
      } else if (zone === "bony" || zone === "cartilage") {
        state._dangerLatched = false;
      }

      // 掏干净了就自动收工：经营环需要「一局有终点」，但强迫症玩家会一直挖到
      // 一颗渣都不剩。给 2.5 秒的确认窗口，让他能亲眼看着清洁度停在 100%。
      if (session.state.cleanliness01 > 0.985) {
        state._cleanStreak = (state._cleanStreak || 0) + dt;
        if (state._cleanStreak > 2.5) {
          state._cleanStreak = 0;
          ui?.tip?.("干干净净了，收工！", { tone: "good", ms: 2200 });
          FinishSession();
        }
      } else {
        state._cleanStreak = 0;
      }
    }

    // 表现层
    expressionTimer = Math.max(0, expressionTimer - dt);
    if (expressionTimer <= 0) expressionName = session.state.comfort01 > 0.7 ? "relaxed" : "relaxed";
    character?.Update?.(dt, {
      expression: expressionName,
      comfort01: session.state.comfort01,
      tickle01: session.state.relax01,
      depth: handFrame.depth,
      pain01: state._dangerLatched ? 1 : 0,
      action01: handFrame.action01,
      toolId: hand.spec?.id,
    });
    // 房间的氛围：Update 会吐回曝光 / 雾 / 背景色，**必须接住**。
    // 不接的话四个 mood 在游戏里只剩灯的明暗差，雨夜和清晨看起来几乎一样
    // （这是场景模块交付时点出来的一条）。
    const moodState = room?.Update?.(dt, { mood01: session.state.relax01 });
    if (moodState) {
      if (state.mode === "shop") {
        if (moodState.background !== undefined) core.scene.background = new THREE.Color(moodState.background);
        if (moodState.fog) {
          if (!core.scene.fog) core.scene.fog = new THREE.Fog(moodState.fog.color, moodState.fog.near, moodState.fog.far);
          core.scene.fog.color.set(moodState.fog.color);
          core.scene.fog.near = moodState.fog.near;
          core.scene.fog.far = moodState.fog.far;
        }
        if (moodState.exposure !== undefined) core.setExposure(moodState.exposure);
      } else {
        // 耳道里没有房间的雾（雾是按米标定的，耳道只有几十毫米，留着只会白白算一遍）
        core.scene.fog = null;
      }
    }
    wax?.Update?.(dt, {
      moisture: 0.4,
      vibration01: hand.state.vibration01,
      heat01: session.state.comfort01,
    });
    hand.tool?.Update?.(dt, {
      active01: handFrame.lift < 0.5 ? 1 : 0,
      vibration01: hand.state.vibration01,
      squeeze01: handFrame.action01,
      speed01: Clamp(handFrame.speed / 20, 0, 1),
      pressure01: handFrame.pressure01,
    });

    // 音频：连续接触声现场合成，参数直接来自手感读数
    if (audio?.contact && probe) {
      const kind = ContactKind(hand.spec, probe);
      if (probe.hit) {
        audio.contact.begin?.(kind);
        audio.contact.update?.(kind, {
          speed01: Clamp(handFrame.speed / 22, 0, 1),
          pressure01: handFrame.pressure01,
          roughness01: probe.roughness01 ?? (probe.type === "dry" ? 0.7 : 0.4),
          dt,
        });
      } else {
        audio.contact.end?.(kind);
      }
    }
    audio?.Update?.(dt);

    // 机位
    rig.Update(dt, {
      tip: handFrame.tipWorld,
      depth: handFrame.depth,
      speed: handFrame.speed,
      spin: handFrame.spinRate,
      faceAnchor: character?.faceAnchor || character?.earAnchor || null,
      earAnchor: character?.earAnchor || ear?.group || null,
    });

    // 工具裁切距离跟着相机走：内窥视角只画相机前面那一段，否则 150mm 的器械
    // 会从相机旁边穿过去糊满屏幕；店里视角则要看到整把工具。
    hand.SetClipKeep(state.mode === "shop"
      ? 400
      : Math.max(4, (state.mode === "macro" ? rig.state.backDistance * 0.6 : rig.state.backDistance) - (state.mode === "macro" ? 1.2 : 2.2)));
    AimEndoLight(core.camera);

    // UI
    ui?.setDepth?.(handFrame.depth, zone);
    ui?.setPressure01?.(handFrame.pressure01);
    ui?.setSpeed?.(handFrame.speed);
    ui?.setCleanliness01?.(session.state.cleanliness01);
    ui?.setComfort01?.(session.state.comfort01);
    ui?.setRelax01?.(session.state.relax01);
    ui?.setFpsHint?.(core.stats.fps);
    ui?.setExpressionHint?.(expressionName);
    ui?.Update?.(dt);

    // 渲染：店里视角不需要画中画（画里就是全景），内窥/微距才需要。
    // StepFrames 批量推进时只画最后一帧——软件渲染下一帧要一秒，画六十帧
    // 会让验收慢到没法用，而中间帧根本没人看。
    if (!skipRender) {
      const wantInset = state.showInset !== false && state.mode !== "shop" && character;
      core.Render(wantInset ? { insetRect: InsetRect(), insetEvery: quality === "low" ? 4 : 3 } : {});
    }

    if (firstFrame) {
      firstFrame = false;
      boot?.remove();
    }
    frameCount += 1;
  }

  function TakeHarvest() {
    if (!wax?.Harvest) return null;
    const all = wax.Harvest();
    if (all.length <= harvestSeen) return null;
    const delta = all.slice(harvestSeen);
    harvestSeen = all.length;
    return delta;
  }

  /**
   * 画中画放在右上角，避开底部工具架。宽高比锁 4:3。
   * 注意换算：rect 用的是**归一化**坐标，两个轴的比例不一样，所以要让
   * 像素宽高比等于 4:3，就得乘 (W/H)×(3/4)，写成 (4/3) 会得到一个竖长条。
   */
  function InsetRect() {
    const { width, height } = core.size;
    const portrait = height > width;
    const w = portrait ? 0.36 : 0.20;
    const h = w * (width / height) * (3 / 4);
    const margin = 0.035;
    const bottomSafe = portrait ? 0.30 : 0.20;   // 给工具架留位
    return { x: 1 - w - margin, y: 1 - h - bottomSafe, w, h };
  }

  // 世界建完了：放行开始按钮，然后再启主循环。
  // 顺序很重要——先把「可以开始」放出去，玩家的点击才能立刻变成第一帧，
  // 而不是点了以后还要等一轮 rAF。
  ready.done = true;
  ready.resolve();
  t0 = mark("世界就绪", t0);
  // 注意：这里**不再**额外加一盏环境光。房间自带一整套灯，再叠一盏全局环境光
  // 会把耳道从里到外照穿（那正是画面一片惨白的原因）。耳道里的照明交给内窥灯。
  ApplyLightingForMode("canal");
  requestAnimationFrame(Frame);

  // 自动化验收探针：EarSpa3D/_dev/Script_Probe.mjs 靠它读运行中的真实读数
  // （面数、draw call、耵聍剩余、当前工具、错在哪），比截图可信得多。
  // 只读，不提供任何能改游戏状态的口子。
  window.__EarSpaProbe = () => {
    let waxLeft = null;
    let deposits = null;
    try {
      waxLeft = wax?.Cleanliness ? wax.Cleanliness() : null;
      deposits = wax?.deposits?.length ?? null;
    } catch { /* 探针永远不该把游戏弄崩 */ }
    return {
      phase: state.phase,
      mode: state.mode,
      tool: hand.spec?.id || null,
      toolName: hand.spec?.cnName || null,
      depth: Number(hand.state.depth.toFixed(2)),
      angle: Number(hand.state.angle.toFixed(2)),
      pressure: Number(hand.state.pressure01.toFixed(2)),
      speed: Number(hand.state.speed.toFixed(1)),
      cleanliness: waxLeft === null ? null : Number(waxLeft.toFixed(3)),
      deposits,
      comfort: Number(session.state.comfort01.toFixed(3)),
      relax: Number(session.state.relax01.toFixed(3)),
      score: session.state.score,
      harvest: session.state.harvest.length,
      achievements: Array.from(session.state.achievements),
      fps: Math.round(core.stats.fps),
      frameMs: Number(core.stats.frameMs.toFixed(1)),
      drawCalls: core.stats.drawCalls,
      triangles: core.stats.triangles,
      renderScale: Number(core.stats.renderScale.toFixed(2)),
      tier: core.stats.tier,
      toolCount: toolSpecs.length,
      missing,
      hasCanal: !!canal,
      hasWax: !!wax,
      hasAudio: !!audio,
      hasUi: !!ui,
      // 经营环读数：验收要能直接看到钱、等级、今天第几位客人
      shop: {
        day: shop.state.day,
        coins: shop.state.coins,
        reputation: shop.state.reputation,
        shopLevel: shop.state.shopLevel,
        mood: shop.state.mood,
        customersToday: shop.state.todayCustomers.length,
        customersDone: shop.state.todayCustomers.filter((c) => c.done).length,
        currentCustomer: shop.CurrentCustomer()?.name || null,
        customerTier: shop.CurrentCustomer()?.tierName || null,
        toolLevels: { ...shop.state.toolLevels },
        totalEarned: shop.state.totalEarned,
        hasShopPanel: typeof ui?.showShop === "function",
      },
      ...RenderHealth(),
    };
  };

  /**
   * 渲染体检：主视图空白的排查全靠这几个数。
   * 截图只能说「看着是空的」，说不清是相机跑飞了、几何在视野外、还是材质背面剔除。
   */
  function RenderHealth() {
    const cam = core.camera;
    const box = new THREE.Box3();
    const info = (obj) => {
      if (!obj) return null;
      box.setFromObject(obj);
      // 空 Group / 空几何会让盒子变成 ±Infinity，直接进 JSON 会变成 null，
      // 那看起来像「探针坏了」。这里显式折成 null，让「这里什么都没有」可读。
      if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
        return { visible: obj.visible !== false, children: obj.children?.length ?? 0, empty: true };
      }
      const size = box.getSize(new THREE.Vector3());
      return {
        visible: obj.visible !== false,
        children: obj.children?.length ?? 0,
        min: box.min.toArray().map((v) => Number(v.toFixed(1))),
        max: box.max.toArray().map((v) => Number(v.toFixed(1))),
        size: size.toArray().map((v) => Number(v.toFixed(1))),
      };
    };
    let sceneMeshes = 0;
    let sceneTris = 0;
    let backfaceMeshes = 0;
    core.scene.traverse((node) => {
      if (!node.isMesh && !node.isPoints) return;
      sceneMeshes += 1;
      const g = node.geometry;
      const count = g?.index ? g.index.count : (g?.attributes?.position?.count || 0);
      sceneTris += (count / 3) * (node.isInstancedMesh ? (node.count || 1) : 1);
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      if (mats.some((m) => m && (m.side === THREE.BackSide || m.side === THREE.DoubleSide))) backfaceMeshes += 1;
    });
    return {
      sceneMeshes,
      sceneTris: Math.round(sceneTris),
      backfaceMeshes,
      frameCount,
      frameErrors,
      timings,
      camera: {
        pos: cam.position.toArray().map((v) => Number(v.toFixed(1))),
        fov: Number(cam.fov.toFixed(1)),
        near: cam.near,
        far: cam.far,
        dir: cam.getWorldDirection(new THREE.Vector3()).toArray().map((v) => Number(v.toFixed(2))),
      },
      boxes: {
        ear: info(ear?.group),
        character: info(character?.group),
        room: info(room?.group),
        wax: info(wax?.group),
        tool: info(hand.tool?.group),
      },
      tipWorld: hand.state.tipWorld.toArray().map((v) => Number(v.toFixed(2))),
      canalSample: canal?.PointAt ? {
        at0: canal.PointAt(0, 0, 0).toArray().map((v) => Number(v.toFixed(2))),
        at14: canal.PointAt(14, 0, 0).toArray().map((v) => Number(v.toFixed(2))),
        at27: canal.PointAt(27, 0, 0).toArray().map((v) => Number(v.toFixed(2))),
        r0: Number((canal.RadiusAt?.(0, 0) ?? 0).toFixed(2)),
        r14: Number((canal.RadiusAt?.(14, 0) ?? 0).toFixed(2)),
      } : null,
    };
  }

  // 手机端切后台回来时，渲染循环可能因为 rAF 暂停而累计了一个大 dt；
  // core.Tick 已经夹住 dt，这里只需要保证恢复后立刻重画一次。
  document.addEventListener("visibilitychange", () => { if (!document.hidden) core.Resize(); });

  console.info(`[EarSpa3D] 画质档 ${core.stats.tier}${missing.length ? ` · 未就绪模块：${missing.join("、")}` : " · 全部模块就绪"}`);

  // 调试口只在 ?debug=1 时挂上。需要在真实运行态里直接调 canal/hand/wax 验证
  // 交互判定（在线下推演不出来），但普通玩家页面上不该留一个可写全局。
  const debugOn = new URLSearchParams(location.search).has("debug");
  if (debugOn) {
    window.__EarSpaDebug = {
      THREE, core, hand, session, state, canal, wax, ear, character, room, audio, ui, rig, input, shop,
      GetTool, SelectTool, SetMode, StartSession, FinishSession, StepFrames, OpenDay, StartCustomer,
      AfterCustomer, CloseDay, OpenShopPanel, BuildShopSnapshot,
      triangleReport: RenderHealth,
    };
    console.info("[EarSpa3D] 调试口已开启：window.__EarSpaDebug");
  }

  return { core, hand, session, state, missing, debugOn };
}

/** 头灯朝向用的临时向量（模块级复用，避免每帧新建） */
const tmpDir = new THREE.Vector3();

/** 连续接触声用哪种音色：由工具材质 + 碰到的耵聍类型共同决定 */function ContactKind(spec, probe) {
  const mech = spec?.mechanic;
  if (mech === "sweep") return spec?.material === "horsehair" ? "tickle" : "sweep";
  if (mech === "vibrate") return "vibrate";
  if (mech === "wipe") return "wipe";
  if (mech === "irrigate") return "water";
  if (mech === "vacuum") return "vacuum";
  if (probe?.type === "wet" || probe?.type === "impacted") return "scrapeWet";
  if (probe?.type === "debris") return "sweep";
  return "scrape";
}
