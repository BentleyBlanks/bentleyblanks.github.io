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

Assert(levelDefinitions.length === 3, "必须正好包含三个关卡");
Assert(levelDefinitions.map((level) => level.id).join(",") === "undergroundWall,ensemble,mindGame", "三个关卡 ID 或顺序错误");
Assert(levelDefinitions.map((level) => level.phases.length).join(",") === "4,4,3", "三个循环阶段数应为 4/4/3");
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
Assert(Object.values(coverDefinitions).every((covers) => covers.length >= 6), "三个关卡都必须提供连续的实体遮挡点");
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
Assert(game.includes("ActorActionKind") && game.includes("BeginActorAction") && game.includes("motionBlend") && game.includes("rolePulse"), "角色缺少移动、行动或切换聚焦动画状态");
Assert(game.includes("function IssueDogCommand") && game.includes("function UpdateDogPartner") && game.includes("function CompleteDogCommand") && game.includes('dog.commandMode = "work"'), "阿土哨令仍是瞬时按钮，没有跑动、钻洞、停留工作与完成回报");
Assert(game.includes("DrawDogCompanion") && game.includes("DrawDogCommandEnvironment") && game.includes("DrawDogCommandFocus") && game.includes("DrawPawMark") && game.includes("犬 · 阿土执行中") && html.includes('id="dogCommandHud"') && css.includes("#dogCommandHud.commanding"), "阿土实体、高对比四足聚焦、连续爪印、窄洞路径或哨令 HUD 缺少可视反馈");
Assert(game.includes("function StartDiversion") && game.includes("ActiveDiversion(\"bell\")") && game.includes("ActiveDiversion(\"crackers\")") && game.includes("formationX"), "警钟/炮仗没有接入敌军调查状态与烟水源削弱因果");
Assert(game.includes("DrawSurfaceDiversions") && game.includes("DrawSoundRings") && game.includes("trajectoryPoint") && game.includes("trailProgresses") && game.includes("investigatingEnemies") && game.includes("enemy.investigating"), "警钟、炮仗抛物线残影、落点声波或连接敌军的调查反馈没有进入实际画面");
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
Assert(game.includes('Object.assign(state.resources, { wood: 6, iron: 4, powder: 2, medicine: 1, grain: 2 })') && game.includes('state.buildSlots = ["floodGate", "flipGate", "smokeBaffle"]') && game.includes('state.excavated = new Set(["west", "center", "east"])'), "DEBUG 跳关没有补齐夜间收集、挖掘或建造前置状态");
Assert(game.includes("const profile = actorProfiles.soldier") && game.match(/const scale = Math\.min\(width, 1100\) \/ 26 \* \.038/g)?.length >= 2, "敌兵与主角未共用人物尺度换算");
Assert(css.includes("#touchControls { left: 8px; right: 8px; bottom: 7px; opacity: 1; }") && css.includes("rgba(10,17,19,.94)"), "低高度移动端触控键未强制高对比显示");

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
  mobileInputs: 5,
  cacheVersion: cssVersion
}, null, 2));
