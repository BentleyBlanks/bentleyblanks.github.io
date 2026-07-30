import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ActionIds,
  ApplyPlayerAction,
  ApplyPlayerActionPath,
  CreateInitialState,
  DeserializeState,
  FindEvacuationPaths,
  GetActionTargets,
  GetActionPathPlans,
  GetAvailableActions,
  GetExitWindow,
  GetObjectiveSummary,
  GetRouteSurvey,
  SerializeState,
} from "./Script_Rules.mjs";
import { RenderAsciiMaps } from "./Script_AsciiMap.mjs";

const statePath = join(tmpdir(), "TunnelFront1942_PlayCli_State.json");

function PrintUsage() {
  console.log(`地火线 CLI

用法：
  node TunnelFront1942/Script_PlayCli.mjs new [seed]
  node TunnelFront1942/Script_PlayCli.mjs show
  node TunnelFront1942/Script_PlayCli.mjs legal [unitId|all]
  node TunnelFront1942/Script_PlayCli.mjs act <unitId> <actionId> [targetKey] [groupId]
  node TunnelFront1942/Script_PlayCli.mjs path <unitId> <Move|Dig> <targetKey...>
  node TunnelFront1942/Script_PlayCli.mjs end
  node TunnelFront1942/Script_PlayCli.mjs survey <exitKey>

unitId：Scout / WorkTeam / Militia / Guerrilla
actionId：${Object.values(ActionIds).join(" / ")}
示例：
  node TunnelFront1942/Script_PlayCli.mjs new 7
  node TunnelFront1942/Script_PlayCli.mjs legal Scout
  node TunnelFront1942/Script_PlayCli.mjs act Scout Recon 2,1
  node TunnelFront1942/Script_PlayCli.mjs path Scout Move 5,4 5,5
  node TunnelFront1942/Script_PlayCli.mjs end`);
}

function LoadState() {
  if (!existsSync(statePath)) {
    throw new Error("尚无 CLI 局面；先运行 new [seed]。");
  }
  return DeserializeState(readFileSync(statePath, "utf8"));
}

function SaveState(state) {
  writeFileSync(statePath, SerializeState(state), "utf8");
}

function ResolveUnitId(state, requestedId) {
  return state.units.find((unit) => (
    unit.unitId.toLowerCase() === String(requestedId).toLowerCase()
  ))?.unitId ?? null;
}

function ResolveActionId(requestedId) {
  return Object.values(ActionIds).find((actionId) => (
    actionId.toLowerCase() === String(requestedId).toLowerCase()
  )) ?? null;
}

function FormatIntent(enemy) {
  if (!enemy.intentRevealed || !enemy.intent) {
    return "意图未揭示";
  }
  const target = enemy.intent.targetKey ? `→${enemy.intent.targetKey}` : "";
  return `${enemy.intent.intentId}${target}`;
}

function PrintState(state) {
  const objective = GetObjectiveSummary(state);
  console.log(`\n=== ${state.phase === "Player" ? "我方行动" : "敌军行动"} · T${state.turn}/${state.maxTurns} ===`);
  console.log(
    `目标 ${objective.primary}｜${objective.sweep}｜工具 ${state.tools}｜组织 ${state.organization}`
      + `｜情报 ${state.intel}｜暴露 ${state.exposure}｜群众安全 ${state.peopleSafety}`,
  );
  console.log(
    `主勘线 ${objective.plannedExitName ?? "未选择"}｜新挖 ${state.tunnelsDug} 段`
      + `｜出口信号 ${state.exitSignalsIssued ?? 0} 次`,
  );
  if (state.outcome) {
    console.log(
      `结局 ${state.outcome.status}｜${state.outcome.title}｜${state.outcome.summary}`
        + `｜建议：${state.outcome.tip ?? "可尝试另一条路线"}`,
    );
  }

  console.log("\n单位：");
  for (const unit of state.units) {
    console.log(
      `- ${unit.unitId} ${unit.shortName}｜${unit.layer}@${unit.tileKey}`
        + `｜AP ${unit.actionPoints}/${unit.maxActionPoints}｜HP ${unit.health}/${unit.maxHealth}`
        + `｜弹药 ${unit.ammo ?? 0}`,
    );
  }

  console.log("\n群众：");
  for (const group of state.civilians) {
    const route = group.exitKey ? `→${state.tiles[group.exitKey]?.name ?? group.exitKey}` : "";
    console.log(
      `- ${group.groupId} ${group.name} ${group.people}人｜${group.status}${route}`
        + `｜速 ${group.moveSteps}｜载 ${group.trafficLoad}`
        + `｜拥堵 ${group.trafficDelays ?? 0}`,
    );
  }

  console.log("\n敌情：");
  for (const enemy of state.enemies.filter((entry) => entry.health > 0)) {
    console.log(
      `- ${enemy.enemyId} ${enemy.name}｜@${enemy.tileKey}`
        + `｜HP ${enemy.health}/${enemy.maxHealth}｜${FormatIntent(enemy)}`,
    );
  }

  console.log("\n出口窗口：");
  for (const exitKey of ["2,1", "0,5"]) {
    const windowState = GetExitWindow(state, exitKey);
    console.log(
      `- ${state.tiles[exitKey].name} ${exitKey}｜${windowState.status}`
        + `｜${windowState.detail}`,
    );
  }

  if (state.warnings.some((warning) => !warning.resolved)) {
    console.log("\n未决预警：");
    for (const warning of state.warnings.filter((entry) => !entry.resolved)) {
      console.log(
        `- ${warning.kind}@${warning.targetKey}｜T${warning.resolvesTurn} 结算`
          + `｜${warning.text ?? ""}`,
      );
    }
  }

  console.log(`\n${RenderAsciiMaps(state)}`);
  console.log("\n最近事件：");
  for (const event of state.eventLedger.slice(-8)) {
    console.log(`- T${event.turn} [${event.kind}] ${event.text}`);
  }
}

function PrintLegalActions(state, requestedId = "all") {
  const units = String(requestedId).toLowerCase() === "all"
    ? state.units.filter((unit) => unit.health > 0)
    : state.units.filter((unit) => (
      unit.unitId.toLowerCase() === String(requestedId).toLowerCase()
    ));
  if (!units.length) {
    throw new Error(`未知单位：${requestedId}`);
  }
  for (const unit of units) {
    console.log(`\n${unit.unitId} ${unit.shortName}｜${unit.layer}@${unit.tileKey}｜AP ${unit.actionPoints}`);
    const actions = GetAvailableActions(state, unit.unitId);
    if (!actions.length) {
      console.log("- 无可用动作");
      continue;
    }
    for (const actionId of actions) {
      const targets = GetActionTargets(state, unit.unitId, actionId);
      const groupText = actionId === ActionIds.EVACUATE
        ? `｜groups=${state.civilians
          .filter((group) => group.status === "Waiting")
          .map((group) => group.groupId)
          .join(",")}`
        : "";
      console.log(
        `- ${actionId}${targets.length ? `｜targets=${targets.join(",")}` : ""}${groupText}`,
      );
      if ([ActionIds.MOVE, ActionIds.DIG].includes(actionId)) {
        const pathPlans = GetActionPathPlans(state, unit.unitId, actionId, {
          includeAmbiguous: true,
        })
          .filter((entry) => entry.steps > 1);
        for (const plan of pathPlans) {
          console.log(
            `  path ${plan.targetKey}｜route=${plan.targetKeys.join(" → ")}`
              + `｜AP=${plan.apCost}｜tools=${plan.toolsCost}｜exposure=+${plan.exposureDelta}`,
          );
        }
        if (!pathPlans.length && targets.length) {
          console.log(
            actionId === ActionIds.DIG
              ? "  path 暂无｜连续开挖只延伸规划侦察已标明且无分叉的走廊；未知土层、开裂与出口会要求逐段确认"
              : "  path 暂无｜本回合没有无分叉的多步终点，仍可逐格移动",
          );
        }
      }
    }
  }
}

function ApplyCliAction(state, requestedUnitId, requestedActionId, targetKey, groupId) {
  const unitId = ResolveUnitId(state, requestedUnitId);
  const actionId = ResolveActionId(requestedActionId);
  if (!unitId) {
    throw new Error(`未知单位：${requestedUnitId}`);
  }
  if (!actionId || actionId === ActionIds.END_TURN) {
    throw new Error(`未知或不适用于 act 的动作：${requestedActionId}`);
  }
  const result = ApplyPlayerAction(state, {
    unitId,
    actionId,
    targetKey,
    groupId,
  });
  if (!result.ok) {
    throw new Error(result.reason ?? "动作失败");
  }
  SaveState(result.state);
  PrintState(result.state);
}

function ApplyCliPath(state, requestedUnitId, requestedActionId, targetKeys) {
  const unitId = ResolveUnitId(state, requestedUnitId);
  const actionId = ResolveActionId(requestedActionId);
  if (!unitId) {
    throw new Error(`未知单位：${requestedUnitId}`);
  }
  if (![ActionIds.MOVE, ActionIds.DIG].includes(actionId)) {
    throw new Error("path 只支持 Move 或 Dig");
  }
  if (!targetKeys.length) {
    throw new Error("path 至少需要一个按顺序排列的目标格");
  }
  const result = ApplyPlayerActionPath(state, {
    unitId,
    actionId,
    targetKeys,
  });
  if (!result.ok) {
    throw new Error(result.reason ?? "连续路径执行失败");
  }
  SaveState(result.state);
  console.log(
    `连续执行 ${result.plan.steps} 步：${result.plan.startKey} → ${result.plan.targetKeys.join(" → ")}`,
  );
  PrintState(result.state);
}

function EndTurn(state) {
  const result = ApplyPlayerAction(state, {
    unitId: null,
    actionId: ActionIds.END_TURN,
  });
  if (!result.ok) {
    throw new Error(result.reason ?? "无法结束回合");
  }
  SaveState(result.state);
  PrintState(result.state);
}

function PrintSurvey(state, exitKey) {
  if (!["2,1", "0,5"].includes(exitKey)) {
    throw new Error("survey 只接受 2,1（北枣窖）或 0,5（西南苇井）。");
  }
  console.log(JSON.stringify(GetRouteSurvey(state, exitKey), null, 2));
  const connected = FindEvacuationPaths(state)
    .find((route) => route.exitKey === exitKey);
  console.log(connected
    ? `当前已接通：${connected.path.join(" → ")}`
    : "当前尚未接通。");
}

function Run() {
  const [, , rawCommand = "help", ...args] = process.argv;
  const command = rawCommand.toLowerCase();
  if (["help", "-h", "--help"].includes(command)) {
    PrintUsage();
    return;
  }
  if (command === "new") {
    const requestedSeed = args[0] === undefined ? 19420501 : Number(args[0]);
    if (!Number.isInteger(requestedSeed)) {
      throw new Error(`seed 必须是整数：${args[0]}`);
    }
    const state = CreateInitialState({ seed: requestedSeed });
    SaveState(state);
    PrintState(state);
    return;
  }

  const state = LoadState();
  switch (command) {
    case "show":
      PrintState(state);
      break;
    case "legal":
      PrintLegalActions(state, args[0] ?? "all");
      break;
    case "act":
      ApplyCliAction(state, args[0], args[1], args[2], args[3]);
      break;
    case "path":
      ApplyCliPath(state, args[0], args[1], args.slice(2));
      break;
    case "end":
      EndTurn(state);
      break;
    case "survey":
      PrintSurvey(state, args[0]);
      break;
    default:
      throw new Error(`未知子命令：${rawCommand}`);
  }
}

try {
  Run();
} catch (error) {
  console.error(`CLI 错误：${error.message}`);
  process.exitCode = 1;
}
