import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { actorProfiles, levelDefinitions, roleDefinitions, buildOptions, coverDefinitions } from "./Data_WhiteboxCampaign.mjs";
import { CreateTunnelFluidSimulation } from "./Script_FluidSimulation.mjs";
import { TraceSdfRay } from "./Script_LightSimulation.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const Read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const Assert = (condition, message) => { if (!condition) throw new Error(message); };
const html = Read("index.html");
const css = Read("Style_Whitebox.css");
const game = Read("Script_Whitebox.mjs");
const data = Read("Data_WhiteboxCampaign.mjs");
const fluidCode = Read("Script_FluidSimulation.mjs");
const lightCode = Read("Script_LightSimulation.mjs");

Assert(levelDefinitions.length === 4, "必须包含三个核心循环与一个屋脊战斗关");
Assert(levelDefinitions.map((level) => level.id).join(",") === "undergroundWall,ensemble,mindGame,rooftopBattle", "四个关卡 ID 或顺序错误");
Assert(levelDefinitions.map((level) => level.phases.length).join(",") === "4,4,3,4", "四关阶段数应为 4/4/3/4");
Assert(!data.includes("campaignData") && !data.includes("cinematicSequences"), "旧七章线性战役导出仍存在");
Assert(!game.includes("campaignData") && !game.includes("chapterIndex"), "运行脚本仍引用旧线性战役");

const wall = levelDefinitions[0];
Assert(wall.roleIds.join(",") === "leader,blacksmith,dog", "第一关必须限制为传宝、铁匠、阿土三名可控角色");
Assert(wall.roleIds.every((roleId) => roleDefinitions[roleId]), "第一关三名角色缺少能力定义");
const buildActions = wall.actions.filter((action) => action.buildSlot !== undefined);
Assert(buildActions.length === 3 && new Set(buildActions.map((action) => action.buildSlot)).size === 3, "第一关必须有三个独立建造槽");
Assert(buildOptions.length === 3, "第一关必须有三种机关方案");
const collected = wall.actions.reduce((total, action) => {
  for (const [key, value] of Object.entries(action.resource || {})) total[key] = (total[key] || 0) + value;
  return total;
}, {});
const feasible = [];
for (const a of buildOptions) for (const b of buildOptions) for (const c of buildOptions) {
  const options = [a, b, c];
  const wood = options.reduce((sum, option) => sum + option.cost.wood, 0);
  const iron = options.reduce((sum, option) => sum + option.cost.iron, 0);
  const ventilation = options.reduce((sum, option) => sum + option.ventilation, 0);
  const defense = options.reduce((sum, option) => sum + option.defense, 0);
  if (wood <= collected.wood && iron <= collected.iron && ventilation >= 3 && defense >= 4) feasible.push(options.map((option) => option.id).join("+"));
}
Assert(feasible.length >= 2, "第一关采集量必须支持至少两种合格建造组合");
Assert(wall.actions.some((action) => action.phaseGate) && wall.actions.filter((action) => action.triggerSlot !== undefined).length === 3, "第一关缺少迎敌门槛或三机关结算");
const excavationActions = wall.actions.filter((action) => action.excavate);
Assert(excavationActions.length === 3 && new Set(excavationActions.map((action) => action.excavate)).size === 3, "第一关必须实际挖开西、中、东三处避难支洞");
Assert(excavationActions.every((action) => action.role === "blacksmith") && buildActions.every((action) => action.requires?.some((id) => id.startsWith("dig"))), "挖掘没有绑定铁匠能力，或机关能在未挖通的位置凭空建造");
const dogCommands = wall.actions.filter((action) => action.dogCommand);
Assert(dogCommands.length >= 2 && dogCommands.every((action) => action.role === "leader" && Number.isFinite(action.dogCommand.targetX) && action.dogCommand.workTime > 0), "吹哨控制阿土的异步窄洞解谜不足两处，或没有绑定实体目标与工作时间");
Assert(wall.actions.some((action) => action.dogCommand && action.hazardScout === "smoke") && wall.actions.some((action) => action.role === "dog" && action.hazardScout === "water"), "阿土缺少烟水来源预警能力");
Assert(wall.actions.find((action) => action.id === "startDefense")?.requires?.includes("whistleDraftGap"), "迎敌前没有要求阿土先钻低风孔确认风向");
Assert(wall.actions.find((action) => action.id === "triggerSlotC")?.requires?.includes("whistleSmokeLatch"), "东翻口机关没有等待阿土穿烟道侧孔拉绳");
const diversions = wall.actions.filter((action) => action.diversion);
Assert(diversions.map((action) => action.diversion.kind).sort().join(",") === "bell,crackers" && diversions.every((action) => action.layer === "surface" && action.cover), "地表警钟/炮仗诱敌没有落到实体遮挡与声源位置");
Assert(wall.actions.find((action) => action.id === "throwFirecrackers")?.consume?.powder === 1, "炮仗没有消耗夜间收集的火药材料");
const materialPickups = wall.actions.filter((action) => action.phase === "collect" && action.resource);
Assert(materialPickups.length === 4 && materialPickups.every((action) => action.prop?.mode === "take" && action.prop.kind && action.prop.label && action.prop.support), "四个夜间收集点必须各自绑定可见实物、名称与承托位置");
Assert(new Set(materialPickups.map((action) => action.prop.kind)).size === 4 && new Set(materialPickups.map((action) => action.prop.label)).size === 4, "夜间收集物不能继续复用同一个抽象交互标记");
Assert(data.includes('Prop("timberStack", "三根干木梁", "ground"') && data.includes('Prop("ironFittings", "铁箍与四枚销钉", "tray"') && data.includes('Prop("powderJar", "封口硝灰罐", "lowCrate"') && data.includes('Prop("reliefBundle", "药布包与两袋口粮", "plankTable"'), "木料、铁件、硝灰与救护口粮没有落到明确场景位置");

const ensemble = levelDefinitions[1];
Assert(ensemble.roleIds.length === 5, "第二关必须有五个可切换角色");
for (const roleId of ensemble.roleIds) {
  Assert(roleDefinitions[roleId], `角色 ${roleId} 未定义`);
  Assert(ensemble.actions.some((action) => action.role === roleId), `角色 ${roleId} 没有专属动作`);
}
Assert(ensemble.actions.filter((action) => action.rescue).length === 3, "第二关必须转移伤员、粮食、联络员三项");
Assert(ensemble.actions.filter((action) => action.memory && action.optional).length === 2, "第二关必须有两件不阻塞流程的记忆物");
Assert(ensemble.actions.filter((action) => action.memory || action.rescue === "wounded" || action.rescue === "grain").every((action) => action.prop?.kind && action.prop?.label), "记忆物、伤员或粮袋仍只有抽象交互点");
Assert(ensemble.actions.find((action) => action.id === "findLetter")?.prop?.support === "lowCrate" && ensemble.actions.find((action) => action.id === "findThimble")?.prop?.support === "plankTable", "家书或铜顶针没有独立承托面，容易退化成地面贴片");
Assert(game.includes("CycleRole") && game.includes("需要${roleDefinitions[action.role].name}"), "第二关缺少角色切换或错角色反馈");

const mindGame = levelDefinitions[2];
const tricks = mindGame.actions.filter((action) => action.trick);
Assert(tricks.length >= 5, "第三关至少需要五种诡计");
Assert(tricks.every((action) => Number.isFinite(action.alert) && action.alert > 0 && Number.isFinite(action.morale) && action.morale < 0), "每种诡计都必须有警觉与士气因果");
Assert(mindGame.actions.filter((action) => action.panicStep).length === 3, "第三关必须有三步恐慌连锁");
Assert(mindGame.actions.find((action) => action.id === "captureIntel")?.prop?.offsetX >= 1, "地图电台没有与角色站位错开，实机中会被人物遮住");
Assert(game.includes("state.tricks.size >= 3") && game.includes("state.morale <= 55"), "恐慌断点没有按诡计种类和士气双条件实现");

const rooftopBattle = levelDefinitions[3];
Assert(rooftopBattle.phases.map((phase) => phase.layer).join(",") === "tunnel,interior,roof,roof", "第四关必须从地道进入室内，再由室内上房顶");
const combatPickups = rooftopBattle.actions.filter((action) => action.combatPickup);
Assert(combatPickups.map((action) => action.combatPickup.kind).join(",") === "rifle,ammo,grenade", "步枪、子弹和手雷必须是三个独立场景拾取物");
Assert(combatPickups.find((action) => action.combatPickup.kind === "ammo")?.combatPickup.amount === 4 && combatPickups.find((action) => action.combatPickup.kind === "grenade")?.combatPickup.amount === 1, "第四关必须锁定四发子弹与一枚手雷的稀缺火力");
Assert(combatPickups.every((action) => action.prop?.kind && action.prop?.label && action.prop?.support), "第四关枪弹手雷没有绑定可见实体和承托物");
Assert(game.includes("const combatDepthLinks") && game.includes('lower: "tunnel", upper: "interior"') && game.includes('lower: "interior", upper: "roof"'), "地道、室内与屋顶没有两段实体入口关系");
Assert(game.includes("function FireRifle") && game.includes("function ThrowGrenade") && game.includes("function UpdateCombat") && game.includes("function NeutralizeCombatEnemy"), "有限枪战或手雷状态机缺失");
Assert(game.includes("blastScars: []") && game.includes("function DrawCombatBlastDamage") && game.includes("duration: 1.35") && game.includes("flashGlow.addColorStop") && game.includes("context.setLineDash([7, 7])") && game.includes("const blasted = state.combat.blastScars.some") && game.includes("context.bezierCurveTo(side - 8"), "手雷缺少可持续屋脊破坏痕迹、断裂掩体、残烟或可读抛物线");
Assert(game.includes('if (event.code === "KeyF") FireRifle()') && game.includes('if (event.code === "KeyG") ThrowGrenade()') && html.includes('data-input="shoot"') && html.includes('data-input="grenade"'), "键盘或移动端缺少开枪与手雷输入");
Assert(/if \(state\.levelIndex === 3\) \{\s+state\.combat\.neutralized \+= 1;\s+CheckCombatSecured\(\);\s+\} else state\.alert = Math\.min\(100, state\.alert \+ 4\)/.test(game), "第四关背后制服仍会惊动其他敌兵");
Assert(game.includes("function DrawCombatArchitecture") && game.includes("function DrawCombatEntrances") && game.includes("function DrawCombatEffects") && game.includes("function DrawCombatHud"), "室内剖面、屋顶、入口或战斗演出绘制缺失");
Assert(game.match(/const combatMobileScale = state\.levelIndex === 3 && width <= 640 \? 1\.18 : 1;/g)?.length === 2 && game.includes("const mobileCombat = state.levelIndex === 3 && mobile") && game.includes("targetBaseY + 18") && game.includes("const mobileSideX = targetX < playerScreenX"), "手机屋脊角色比例、前景露出或目标 HUD 锚定发生回归");
Assert(game.includes("function TriggerDetection") && game.includes("function UpdateCaught") && game.includes("state.caught = { time: 0, duration: .9 }"), "被发现后锁定操作并退回遮挡的二元失败规则缺失");
Assert(game.includes('ui.touchControls.classList.toggle("locked"') && css.includes("#touchControls.locked"), "被发现期间移动端操作没有明确锁定反馈");

Assert(!html.includes('id="observeButton"') && !html.includes('data-input="observe"'), "正式玩家操作仍存在观察按钮");
Assert(html.includes('data-input="left"') && html.includes('data-input="right"') && html.includes('data-input="switch"') && html.includes('data-input="depth"') && html.includes('data-input="action"'), "移动端五个核心操作不完整");
Assert(!html.includes('data-input="crouch"') && !game.includes("touchCrouchLatched") && !game.includes("inputKeys.crouch"), "仍保留空地蹲伏即可隐身的错误操作");
Assert(game.includes("function ChangeLayer(targetLayer)") && game.includes('if (event.code === "KeyW") ChangeLayer("surface")') && game.includes('if (event.code === "KeyS") ChangeLayer("tunnel")'), "键盘上下行没有拆成 W 向上、S 向下");
Assert(game.includes("function UseContextDepth()") && game.includes('addEventListener("click", UseContextDepth)') && !game.includes("ToggleLayer"), "移动端仍在调用含混的双向切层函数");
Assert(html.includes("W 向上攀爬，S 向下进入") && game.includes('"S  ↓  下行"') && game.includes('"W  ↑  上行"') && game.includes("function DrawDepthHint"), "操作说明或入口现场提示没有明确上下行方向");
Assert(css.includes("user-select: none") && css.includes("-webkit-touch-callout: none") && css.includes("touch-action: none"), "移动端长按防文本选择保护不完整");
Assert(game.includes("setPointerCapture") && game.includes("pointercancel") && game.includes("lostpointercapture"), "移动端长按移动缺少 Pointer Capture 清理");
Assert(!game.includes("state.exposure") && !game.includes('Metric("暴露"') && !game.includes('Metric("警戒", Math.round(state.exposure)'), "累积暴露条仍在参与潜行规则");
Assert(Object.values(coverDefinitions).every((covers) => covers.length >= 6), "四个关卡都必须提供连续的实体遮挡点");
Assert(Object.values(coverDefinitions).flat().every((cover) => cover.id && cover.label && cover.width >= 1.4), "实体遮挡缺少可读名称或有效宽度");
for (const level of levelDefinitions) {
  const coverIds = new Set(coverDefinitions[level.id].map((cover) => cover.id));
  Assert(level.actions.filter((action) => action.cover).every((action) => coverIds.has(action.cover)), `${level.id} 有行动引用了不存在的实体遮挡`);
}
Assert(wall.actions.filter((action) => action.phase === "collect" && action.resource).every((action) => action.cover), "夜间收集仍有行动不依赖实体遮挡");
Assert(ensemble.actions.filter((action) => action.layer === "surface").every((action) => action.cover), "地表多人解谜仍有行动不依赖实体遮挡");
Assert(mindGame.actions.filter((action) => action.layer === "surface").every((action) => action.cover), "心理战地表行动仍有行动不依赖实体遮挡");
Assert(game.includes("GetSurfaceCovers") && game.includes("GetActiveCover") && game.includes("UpdateCoverState") && game.includes("if (GetActiveCover(playerX)) return 0"), "敌兵视线没有与实体遮挡共用判定");
Assert(game.includes("DrawSurfaceCovers(width, surfaceY, false)") && game.includes("DrawSurfaceCovers(width, surfaceY, true)") && game.includes("DrawActorVisibilityHud") && game.includes("DrawDetectionFlash"), "遮挡前后层、随身可见度或发现反馈缺失");
Assert(game.includes("function DrawActionProps") && game.includes("function DrawPropSupport") && game.includes("function DrawPropObject") && game.includes("function DrawPickupTransfer"), "实体物件、承托面或拿取过程没有进入画面绘制");
Assert(game.includes("action.prop?.label || action.title") && game.includes('Metric("已携带"') && game.includes("已取走 · ${action.prop.label}"), "交互提示、随身携带栏或拿走后的空位反馈缺失");
Assert(game.includes("function DrawSurfaceVegetation") && !game.includes("context.moveTo(x, height)"), "仍存在贯穿整个土层的前景竖线");
Assert(game.includes("TunnelCenterYAt") && game.includes("TunnelFloorYAt") && game.includes("DrawEntrances(width, height") && game.includes("DrawTunnelSystems"), "地道剖面、人物落地或实体竖井系统缺失");
Assert(game.includes("function LayerToScreen") && game.includes("DrawMountainLayer") && game.includes("DrawFieldDepth") && game.includes("DrawPerspectiveHouse") && game.includes("DrawSurfaceDepthVeil") && game.includes("DrawForegroundDepthFrame") && game.includes("nearStructures") && game.includes("nearCropXs") && game.includes("parallax: .035") && game.includes("parallax: .245") && game.includes("LayerToScreen(worldX, width, 1.29)"), "远山、田野、村庄、玩法层与前景没有形成至少五级视差、透视缩放和近景遮挡");
Assert(game.includes("TunnelHalfHeightAt") && game.includes("DrawTunnelRearNetwork") && game.includes("DrawTunnelDepth") && game.includes("sideNiches") && game.includes("farX") && game.includes("foregroundSupports") && game.includes("DrawTunnelProps") && game.includes('kind: "basket"') && game.includes('kind: "lamp"'), "地道仍是单根走廊，缺少后层平行通道、侧洞、收束透视、近景支护与生活道具");
Assert(game.includes("DrawHumanActor") && game.includes("DrawDogActor") && game.includes("DrawHeadwear") && game.includes("DrawRoleProp") && game.includes("DrawJointedLimb"), "角色仍是统一几何人形，缺少独立轮廓、服装、道具或关节动画");
Assert(["leader", "student", "rescuer", "blacksmith", "child", "scout"].every((roleId) => actorProfiles[roleId].shoulder <= .35 && actorProfiles[roleId].waist <= .125 && actorProfiles[roleId].limb <= .044), "村民体态重新膨胀，必须保持战时劳动者的清瘦或精干轮廓");
Assert(actorProfiles.soldier.prop === "rifle" && actorProfiles.collaborator?.prop === "torch" && actorProfiles.soldier.body !== actorProfiles.collaborator.body, "日军与伪军没有独立服装、装备和色彩身份");
Assert(game.includes("function DrawEnemyUnit") && game.includes('unitType = index % 3 === 1 ? "collaborator" : "soldier"') && game.includes('enemy.rank === "sectionLeader"'), "日伪军仍是同一种几何木偶，缺少阵营与军衔轮廓");
Assert(game.includes("function DrawVillageFenceSegment") && game.includes("function DrawVillageWorkProp") && game.includes('kind: "wheelbarrow"') && game.includes('kind: "dryingRack"') && game.includes('kind: "firewood"') && game.includes('kind: "plow"'), "村庄栅栏与生产道具没有按结构和用途重做");
Assert(game.includes('kind: "toolRack"') && game.includes('kind: "stove"') && game.includes('prop.kind === "toolRack"') && game.includes('prop.kind === "stove"'), "地道生活区缺少工具架或炉灶等有用途的生活设施");
Assert(game.includes("function BuildLianhuanhuaTexture") && game.includes("function DrawLianhuanhuaPostProcess") && game.includes('globalCompositeOperation = "multiply"') && game.includes("hatchSpacing") && game.includes("NextPrintNoise"), "60年代连环画的纸纹、排线、墨色叠印或确定性印刷颗粒后处理缺失");
Assert(css.includes("1960s Chinese lianhuanhua art direction") && css.includes('font-family: "FangSong"') && css.includes("sepia(.16)") && css.includes("repeating-linear-gradient") && css.includes("#gameShell::after"), "界面没有统一为60年代连环画的仿宋题签、有限套色、纸纹和墨框语言");
Assert(game.includes("ActorActionKind") && game.includes("BeginActorAction") && game.includes("motionBlend") && game.includes("rolePulse"), "角色缺少移动、行动或切换聚焦动画状态");
Assert(game.includes("function IssueDogCommand") && game.includes("function UpdateDogPartner") && game.includes("function CompleteDogCommand") && game.includes('dog.commandMode = "work"'), "阿土哨令仍是瞬时按钮，没有跑动、钻洞、停留工作与完成回报");
Assert(game.includes("DrawDogCompanion") && game.includes("DrawDogCommandEnvironment") && game.includes("DrawDogCommandFocus") && game.includes("DrawPawMark") && game.includes("犬 · 阿土执行中") && html.includes('id="dogCommandHud"') && css.includes("#dogCommandHud.commanding"), "阿土实体、高对比四足聚焦、连续爪印、窄洞路径或哨令 HUD 缺少可视反馈");
Assert(game.includes("function StartDiversion") && game.includes("ActiveDiversion(\"bell\")") && game.includes("ActiveDiversion(\"crackers\")") && game.includes("formationX"), "警钟/炮仗没有接入敌军调查状态与烟水源削弱因果");
Assert(game.includes("DrawSurfaceDiversions") && game.includes("DrawSoundRings") && game.includes("trajectoryPoint") && game.includes("trailProgresses") && game.includes("investigatingEnemies") && game.includes("enemy.investigating"), "警钟、炮仗抛物线残影、落点声波或连接敌军的调查反馈没有进入实际画面");
Assert(game.includes("const patrolRouteSets = Object.freeze") && game.includes("patrolRouteSets.collect") && game.includes("patrolRouteSets.ensemble") && game.includes("patrolRouteSets.mindGame"), "三关没有改用独立的宽幅错峰巡逻路线");
Assert((game.match(/Object\.freeze\(\{ anchor:/g) || []).length === 14 && game.includes("routes = patrolRouteSets.defense.slice(0, count)") && game.includes("routes = patrolRouteSets.mindGame.slice(0, count)") && game.includes("routes = patrolRouteSets.rooftopBattle"), "巡逻路线数量或关卡人数上限发生回归");
const patrolSpecs = [...game.matchAll(/Object\.freeze\(\{ anchor: (-?\d*\.?\d+), span: (\d*\.?\d+), speed: (\d*\.?\d+), phase: (\d*\.?\d+), viewDistance: (\d*\.?\d+) \}\)/g)].map((match) => ({ span: Number(match[2]), viewDistance: Number(match[5]) }));
Assert(patrolSpecs.length === 10 && patrolSpecs.every((route) => route.span >= 1.6 && route.viewDistance <= 3.4), "巡逻重新退化成原地小摆动，或视距再次封死通路");
Assert(game.includes("function ActivePatrolLure") && game.includes("function StartDogBarkLure") && game.includes("function UpdatePatrolLure") && game.includes('kind: "dogBark"'), "阿土主动吠叫诱敌状态机缺失");
Assert(game.includes('state.selectedRole === "dog" && state.player.layer === "surface"') && game.includes("StartDogBarkLure();") && game.includes('if (state.selectedRole === "dog" && ActivePatrolLure("dogBark")) return 0'), "阿土地表行动键或追声期间反向脱离窗口没有接入实际规则");
Assert(game.includes("function DrawDogBarkLure") && game.includes("阿土吠声 · ${enemyCount} 名追声") && game.includes("通路已打开") && game.includes('enemy.lureKind === "dogBark"'), "吠叫声源、追声状态或打开通路没有可读画面反馈");
Assert(game.includes('data-qa-hazard="dogBark"') && game.includes('data-qa-hazard="patrolWindow"') && game.includes('if (kind === "dogBark")') && game.includes('if (kind === "patrolWindow")'), "DEBUG 没有暴露阿土诱敌和三关巡逻窗口检查入口");
Assert(game.includes("routeMin: route.anchor - route.span") && game.includes("routeMax: route.anchor + route.span") && game.includes("lureKind: diversion?.kind || null"), "巡逻 QA 状态缺少真实路线边界或诱敌种类");
Assert(game.includes("function DrawPatrolRoutes") && game.includes("巡逻段 ${index + 1}") && game.includes("穿越空档") && game.includes("state.qaPatrolReview = true"), "巡逻分区与可穿越空档没有进入克制的地面可视化");
Assert(game.includes('if (state.qaPatrolReview || ActivePatrolLure("dogBark")) return null') && game.includes('const suppressMarkers = state.qaPatrolReview || Boolean(ActivePatrolLure("dogBark"))') && game.includes('!state.qaPatrolReview && !ActivePatrolLure("dogBark") && !IsBlocked()'), "吠叫镜头仍会叠加敌人问号、实体交互标记或通用行动提示");
Assert(game.includes('!state.takedown && !ActivePatrolLure("dogBark")') && game.includes('if (!ActivePatrolLure("dogBark")) DrawActorVisibilityHud'), "阿土诱敌时仍叠加角色身份或通用可见度标签");
Assert(game.includes('state.player.x + state.player.facing * 1.75') && game.includes('diversion.kind === "dogBark" ? 1.28') && game.includes('if (suppressMarkers) context.globalAlpha = .34'), "追声敌兵仍会重叠在狗身上，或无关实物继续抢占诱敌焦点");
Assert(css.includes(".rolePortrait") && css.includes(".roleCopy") && data.includes('short: "叶星"') && data.includes('short: "赵禾"') && data.includes('short: "根生"'), "角色切换条仍无法直接识别人物姓名与肖像色块");
Assert(game.includes("DrawFluidSimulation") && game.includes("UpdateLevelOneSystems") && game.includes("state.fluid.Inject(\"smoke\"") && game.includes("state.fluid.Inject(\"water\""), "烟水没有进入实时模拟、关卡脚本或画面绘制");
Assert(fluidCode.includes("ProjectVelocity") && fluidCode.includes("Advect") && fluidCode.includes("AddVorticity") && fluidCode.includes("BuildSignedDistanceField") && fluidCode.includes("SettleWater"), "流体模块缺少压力投影、半拉格朗日平流、涡量、SDF 或水体重力沉降");
Assert(game.includes("smokeDose") && game.includes("waterDose") && game.includes("FailMission") && game.includes(">= 100"), "群众烟水剂量没有接入任务失败");
Assert(game.includes("CommandCivilianGroup") && game.includes("civilian.targetX") && game.includes("state.excavated.has"), "群众转移仍是瞬移、抽象按钮，或没有受挖掘结果约束");
Assert(html.includes('id="civilianCommandPanel"') && html.includes('data-civilian-group="elders"') && html.includes('data-shelter="west"') && html.includes('id="missionFailure"'), "群众分组调度或物理暴露失败界面缺失");
Assert(game.includes("DrawLighting") && game.includes("TunnelLightSdf") && lightCode.includes("TraceSdfRay") && lightCode.includes("BuildVisibilityPolygon"), "夜间/地道光照没有接入 SDF 遮挡与可见多边形软阴影");
Assert(game.includes("GetEnemyPatrols") && game.includes("GetDetectionStrength") && game.includes("EnemyDetection(enemy) > 0") && game.includes("state.detection"), "敌兵警戒绘制与实际侦测规则没有共用数据");
Assert(data.includes("这三根没受潮。你扶棚") && data.includes("跟紧我") && data.includes("等他们跑到空坡") && data.includes("人齐了，我关门") && !data.includes("前肩报稳，后肩再松"), "对白仍是说明书式书面句，没有完成人话改写");
Assert(game.includes("qaMode") && game.includes("EarthVeinsWhiteboxQa") && game.includes("DrawQa"), "QA 标尺或只读状态入口缺失");
Assert(css.includes("Minimal narrative HUD") && css.includes("#touchControls { display: none; }") && css.includes(".metricIcon"), "极简叙事 HUD 或桌面端触控隐藏规则缺失");
Assert(html.includes('id="qaPanel"') && html.includes('id="qaPhaseButtons"') && game.includes("QaJumpToPhase") && game.includes("jumpToPhase"), "DEBUG 跳关面板或阶段跳转 API 缺失");
Assert(game.includes('if (state.mode === "title") { Show(ui.qaPanel, false); return; }'), "标题页仍显示青灰 DEBUG 面板，破坏连环画玩家向版式");
Assert(game.includes('Object.assign(state.resources, { wood: 6, iron: 4, powder: 2, medicine: 1, grain: 2 })') && game.includes('state.buildSlots = ["floodGate", "flipGate", "smokeBaffle"]') && game.includes('state.excavated = new Set(["west", "center", "east"])'), "DEBUG 跳关没有补齐夜间收集、挖掘或建造前置状态");
Assert(game.includes("const profile = actorProfiles.soldier") && game.match(/const scale = Math\.min\(width, 1100\) \/ 26 \* \.038/g)?.length >= 2, "敌兵与主角未共用人物尺度换算");
Assert(css.includes("#touchControls { left: 8px; right: 8px; bottom: 7px; opacity: 1; }") && css.includes("rgba(10,17,19,.94)"), "低高度移动端触控键未强制高对比显示");

Assert(game.includes('data-qa-hazard="structuresIdle"') && game.includes('const showWorkingState = kind === "structures"'), "DEBUG must expose idle and working mechanism comparison views");
Assert(game.includes("state.qaCameraFocus = { x: 0, zoom: .88 }") && game.includes("if (qaMode && state.qaCameraFocus)"), "mechanism comparison camera must stay centered while the game loop runs");
Assert(game.includes("function DrawFlipGateAssembly") && game.includes("floorY - ceilingY - gateClearance * 2") && game.includes("activeEndY = ceilingY + gateClearance"), "raised flip gate must close the full tunnel cross-section");
Assert(game.includes("function DrawFloodGateAssembly") && game.includes("gateBottom = gateTop + gateHeight") && game.includes("DrawVerticalArrow"), "flood gate must visibly travel as one panel along its guide columns");
Assert(game.includes("function DrawSmokeBaffleAssembly") && game.includes("const firstEndY = active") && game.includes("if (active)") && game.includes("activeBaffleSlot"), "smoke baffle must visibly switch between level flow and upward exhaust states");

Assert(game.includes("function FindTakedownTarget") && game.includes("const rearPosition = behind <= .22") && game.includes("distance <= 1.35") && game.includes("candidate.ready"), "nonlethal takedown must expose a reliable close side/rear interaction");
Assert(game.includes('const takedownRoles = new Set(["leader", "blacksmith", "scout"])') && game.includes("state.takedownCount += 1") && !game.includes("takedownUsed") && game.includes("neutralizedEnemies") && game.includes("unconsciousEnemies"), "takedown must support trained roles, repeated targets, and persistent unconscious bodies");
Assert(game.includes("function EnemyIdentity") && game.includes("function FindFocusedEnemy") && game.includes("function EnemyInteractionState") && game.includes("function DrawEnemyFocusHud"), "focused enemies need one shared identity and interaction HUD pipeline");
Assert(game.includes('`敌军 · ${identity.faction}`') && game.includes('context.fillText("E 制服"') && game.includes('Show(ui.interactionPrompt, Boolean(action) && !takedownTarget && !focusedEnemy'), "日军/伪军 identity and E takedown prompt must live in the attached target card, not a detached generic prompt");
Assert(game.includes("function FindTakedownOpportunity") && game.includes("if (FindTakedownOpportunity())") && game.includes("candidate.distance <= 1.35 && candidate.behind <= .22"), "a valid side/rear takedown opportunity must not be spoiled by overlapping patrol cones");
Assert(game.includes("if (!focused) return") && game.includes("EnemyDetection(enemy) > 0") && game.includes('context.globalAlpha = focusedEnemy?.id === enemy.id ? 1 : .72') && !game.includes("function DrawTakedownPrompt"), "only the focused enemy may own a low-weight view cone while secondary threats stay subordinate");
Assert(game.includes("function UpdateTakedown") && game.includes("function DrawTakedownTarget") && game.includes("function DrawTakedownCinematicOverlay"), "four-beat takedown state machine and cinematic rendering are missing");
Assert(game.includes("function DrawProneEnemyBody") && game.includes("state.takedownGrace = 2.2") && game.includes("state.takedownGrace <= 0"), "takedown must end in a readable prone body and a short disengage window");
Assert(game.includes("屏息") && game.includes("扣肩") && game.includes("击昏") && game.includes("收械") && game.includes("尚有呼吸"), "takedown ritual must communicate nonlethal intent and weapon security");
Assert(game.includes('data-qa-hazard="takedown"') && game.includes('StartTakedown(target, true)'), "QA panel must expose the real takedown animation for visual review");
Assert(game.includes('data-qa-hazard="enemyHud"') && game.includes('data-qa-hazard="takedownReady"') && game.includes('data-qa-hazard="takedownReadyCollaborator"') && game.includes('data-qa-hazard="takedownNext"') && game.includes("state.qaFreezePatrols = true") && game.includes("state.qaSafePreview = true"), "QA panel must expose deterministic enemy identity, Japanese/collaborator takedowns, and consecutive-target states");
Assert(game.includes('ui.touchControls.classList.toggle("locked", Boolean(state.caught || state.takedown))'), "mobile controls must lock during the takedown sequence");
Assert(game.includes('ui.gameShell.classList.toggle("takedownCinematic", Boolean(state.takedown || state.takedownGrace > 0))') && css.includes("#gameShell.takedownCinematic #objectiveCard") && css.includes("#gameShell.takedownCinematic #metricsPanel"), "cinematic takedown must suppress objective and alert HUD clutter");
Assert(game.includes('ui.touchControls.classList.toggle("cinematic", Boolean(state.takedown))') && css.includes("#touchControls.cinematic"), "mobile controls must disappear during the takedown cinematic");
Assert(game.includes("function TakedownFigureScale(width)") && game.includes("Math.min(2.35") && game.includes("innerWidth <= 640 ? 1.42 : 1.18") && game.match(/\.038 \* TakedownFigureScale\(width\)/g)?.length >= 3, "mobile takedown figures must stay legible across actor, target, and prone poses");
Assert(game.match(/const cinematicFocus = width <= 640/g)?.length >= 2 && game.includes('rgba(220,190,132,.72)') && game.includes('rgba(226,199,146,.68)'), "mobile prone target and disarmed weapon need a restrained high-contrast cinematic rim");
Assert(game.includes("const originY = baseY - height * .82") && game.includes("const farTopY = Math.min(baseY - 5, originY + height * .12)") && game.includes("Lerp(farTopY, farBottomY, .5)"), "focused-enemy sight must originate from the face and use a single restrained direction line");

const fluid = CreateTunnelFluidSimulation({ columns: 72, rows: 32 });
Assert(fluid.Sample(0, 0).sdf > 0 && fluid.Sample(-11, 0).sdf < 0, "SDF 没有把地道内部与墙体边界分开");
const solidBefore = fluid.solid.reduce((sum, value) => sum + value, 0);
fluid.SetStructures(["flipGate", "smokeBaffle", "floodGate"], [true, true, true], 4);
const solidAfter = fluid.solid.reduce((sum, value) => sum + value, 0);
Assert(solidAfter > solidBefore, "已触发的闸门与导烟板没有写入动态 SDF 固体边界");
fluid.Inject("smoke", 8.8, 0, 1, .6, -4, -.4);
fluid.Inject("water", -8.8, -.45, 1, .55, 3, 0);
const WaterCentroid = () => {
  let weighted = 0; let mass = 0;
  for (let row = 0; row < fluid.rows; row += 1) for (let column = 0; column < fluid.columns; column += 1) {
    const value = fluid.water[fluid.Index(column, row)]; weighted += row * value; mass += value;
  }
  return weighted / Math.max(.0001, mass);
};
const waterStart = WaterCentroid();
for (let step = 0; step < 90; step += 1) fluid.Step(1 / 60);
const fluidStatistics = fluid.GetStatistics();
Assert(fluidStatistics.smokeMass > .05 && fluidStatistics.waterMass > .05, "烟水源进入网格后被错误清空");
Assert(WaterCentroid() > waterStart + .5, "水体没有在重力与自由表面沉降下向地道低处移动");
const rayDistance = TraceSdfRay(0, 0, 0, 30, (x, y) => 10 - Math.hypot(x, y));
Assert(rayDistance >= 8 && rayDistance <= 11, "SDF 光线没有在遮挡墙面前终止");

Assert(game.includes("function CivilianVisualMetrics") && game.match(/CivilianVisualMetrics\(width, civilian\)/g)?.length >= 3, "civilian drawing and tunnel-light occlusion must share one responsive size model");
Assert(game.includes("actorReferenceHeight * (child ? .47 : signalman ? .73 : .7)") && !game.includes('children\" ? 24'), "adult and child civilians must scale from the same on-screen actor reference instead of fixed tiny pixels");
Assert(game.includes("const visualX = { signalman: -3.1") && game.includes("* .72 + group.offset") && game.includes('civilian.id === "childAn" || civilian.id === "childShi"'), "civilian groups must keep readable spacing and must not render the children\'s mother at child scale");
Assert(game.includes("const entityScale = sceneScale * (focused && !completed ? 1.2") && game.includes("function DrawFocusBrackets") && game.includes("context.translate(x, markerY - 17 * entityScale)"), "focused key props must use restrained brackets and unfocused props a single diamond marker");
Assert(game.includes("coverBlend: 0") && game.includes("1 - Math.pow(.00008, delta)") && game.includes("function ForegroundFocusAlpha") && game.includes("SmoothStep(nearRadius, farRadius, nearest)"), "foreground cover visibility must ease continuously around gameplay subjects");
Assert(!game.includes("Math.abs(baseX - playerX) < 76") && !game.includes("Math.abs(baseX - playerX) < 52") && game.includes("ForegroundFocusAlpha(baseX, width, 64, 154, .2)") && game.includes("ForegroundFocusAlpha(x, width, 56, 142, .2)"), "foreground vegetation and tunnel supports must fade instead of popping out at a hard distance threshold");
Assert(game.indexOf("DrawLighting(width, height, surfaceY, tunnelY, daylight)") < game.indexOf("DrawCivilians(width, height, tunnelY)") && game.indexOf("DrawLianhuanhuaPostProcess(width, height, surfaceY, tunnelY, daylight)") < game.indexOf("DrawEnemies(width, height, surfaceY, tunnelY)") && game.includes("function DrawSceneHierarchyVeil") && game.includes("middleDistance") && game.includes("farHaze") && game.includes("horizonHaze"), "three-stage atmosphere must finish before crisp gameplay silhouettes");
Assert(game.includes('daylight > .4 ? \"rgba(103,72,37,.06)\" : \"rgba(91,56,35,.1)\"') && game.includes("daylight > .4 ? .34 : .29") && game.includes('rgba(31,24,19,.045)'), "lianhuanhua print treatment must remain restrained enough to preserve gameplay silhouettes");
Assert(game.includes('if (!state.qaPatrolReview || state.player.layer !== "surface"') && game.includes("for (let lane = -6; lane <= 6; lane += 1)") && game.includes("for (let row = 0; row < 4; row += 1)"), "patrol rulers and field construction lines must not clutter normal play");
Assert(game.includes("for (let cloud = 0; cloud < 4; cloud += 1)") && game.includes("for (let arc = 0; arc < 4; arc += 1)") && game.includes("for (let shard = 0; shard < 6; shard += 1)"), "blast effects must use a few open gestures instead of dense closed rings and debris noise");
Assert(css.includes("Visual hierarchy pass") && css.includes("rgba(34,29,24,.66)") && css.includes("#roleButtons button:not(.active)"), "persistent HUD must be visually subordinate to the player and focused target");
Assert(css.includes("Portrait phones keep identity and interaction UI in the sky band") && css.includes("#roleDock { top: 128px; bottom: auto") && css.includes("#civilianCommandPanel { top: 184px"), "portrait-phone HUD must stay above the tunnel playfield instead of covering villagers and props");
Assert(css.includes("#interactionPrompt { top: 170px; bottom: auto") && css.includes("#roleDock:not([hidden]) ~ #interactionPrompt { top: 170px; bottom: auto"), "desktop interaction prompt must stay in the upper safe band instead of covering actors and props");

const forbiddenRuntime = [/three(?:\.min)?\.js/i, /<img\b/i, /new\s+Image\s*\(/, /AudioContext/i, /https?:\/\//i];
for (const pattern of forbiddenRuntime) {
  Assert(!pattern.test(html + "\n" + game + "\n" + data + "\n" + fluidCode + "\n" + lightCode), `白盒出现禁止的外部运行时/素材：${pattern}`);
}
const cssVersion = html.match(/Style_Whitebox\.css\?v=([^"']+)/)?.[1];
const scriptVersion = html.match(/Script_Whitebox\.mjs\?v=([^"']+)/)?.[1];
Assert(cssVersion && cssVersion === scriptVersion, "HTML 的 CSS/JS cache-bust 不一致");

for (const name of ["Data_WhiteboxCampaign.mjs", "Script_FluidSimulation.mjs", "Script_LightSimulation.mjs", "Script_Whitebox.mjs", "Script_SmokeTest.mjs"]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  Assert(result.status === 0, `${name} 语法错误：${result.stderr}`);
}

console.log(JSON.stringify({
  ok: true,
  levels: levelDefinitions.map((level) => ({ id: level.id, phases: level.phases.length, actions: level.actions.length })),
  feasibleBuilds: feasible,
  fluidGrid: `${fluid.columns}x${fluid.rows}`,
  sdfLightRay: Number(rayDistance.toFixed(2)),
  mobileInputs: 7,
  cacheVersion: cssVersion
}, null, 2));
