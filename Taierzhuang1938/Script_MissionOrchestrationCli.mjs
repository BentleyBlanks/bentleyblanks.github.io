// ===========================================================================
// Script_MissionOrchestrationCli.mjs —— 不开浏览器也能读同一份编排模型
//
//   node Taierzhuang1938/Script_MissionOrchestrationCli.mjs summary
//   node Taierzhuang1938/Script_MissionOrchestrationCli.mjs json            [> model.json]
//   node Taierzhuang1938/Script_MissionOrchestrationCli.mjs phase 12
//   node Taierzhuang1938/Script_MissionOrchestrationCli.mjs step Transfer
//   node Taierzhuang1938/Script_MissionOrchestrationCli.mjs fact innerCourtReached
//   node Taierzhuang1938/Script_MissionOrchestrationCli.mjs encounter transfer
//   node Taierzhuang1938/Script_MissionOrchestrationCli.mjs member TransferGunner
//
// 模型是 Script_MissionOrchestration.BuildOrchestrationModel() 那一份，和工作台、
// 俯视图共用；json 里没有 layout.SampleGroundColor（函数只在内存里，这是正常的）。
// ===========================================================================
import {
  BuildOrchestrationModel,
  PhaseLayout,
  DescribeFact,
  FindOwner,
  ModelSummary,
} from "./Script_MissionOrchestration.mjs";

const [command = "summary", argument] = process.argv.slice(2);
const model = BuildOrchestrationModel();
const Out = (line = "") => console.log(line);
const Point = (point) => (point ? `(${point.x}, ${point.z})` : "—");

function Usage(message) {
  if (message) Out(message);
  Out("用法：summary | json | phase <n> | step <id> | fact <id> | encounter <id> | member <id>");
  process.exitCode = message ? 1 : 0;
}

function PrintStep(step) {
  Out(`步骤 ${step.id}  阶段 ${step.phaseNumber}  目标点 ${Point(step.target)}`);
  Out(`  目标：${step.objective}`);
  Out(`  对白：${step.cue || "—"}   最短时长：${step.minimumSeconds ?? "—"}`);
  Out(`  指引：${step.guidance ? `${step.guidance.label}${step.guidance.route ? ` / 路线 ${step.guidance.route}` : ""}` : "—"}`);
  Out(`  本步生成：${step.spawns.length ? step.spawns.join(", ") : "—"}`);
  Out(`  过关条件（${step.requirements.length}）：`);
  for (const factId of step.requirements) Out(`    · ${factId} —— ${model.facts[factId]?.text || DescribeFact(model, factId)}`);
}

function PrintEncounter(encounter, state) {
  Out(`遭遇组 ${encounter.id}  起始阶段 ${encounter.phaseNumber}${encounter.deferred ? "（该阶段内延后到达）" : ""}${state ? `  状态 ${state}` : ""}`);
  Out(`  出现：${encounter.spawn ? `${encounter.spawn.kind}${encounter.spawn.step ? ` / 步骤 ${encounter.spawn.step}` : ""}${encounter.spawn.fact ? ` / 事实 ${encounter.spawn.fact}` : ""}${encounter.spawn.beat ? ` / 拍 ${encounter.spawn.beat}` : ""}` : "—"}`);
  if (encounter.standbyUntil) Out(`  待命至：${encounter.standbyUntil}`);
  if (encounter.dormant) Out(`  装睡，苏醒：${encounter.wake?.kind === "playerWithinM" ? `玩家进 ${encounter.wake.radiusM} m（步骤 ${encounter.wake.step}）` : `事实 ${encounter.wake?.fact}`}`);
  if (encounter.release) Out(`  放行：${encounter.release.kind}`);
  if (encounter.note) Out(`  备注：${encounter.note}`);
  Out(`  成员（${encounter.members.length}）：`);
  for (const member of encounter.members) {
    const tags = [member.weapon];
    if (member.hold) tags.push("hold");
    if (member.bayonet) tags.push("刺刀");
    if (member.reserve) tags.push(`预备队 +${member.releaseDelayS}s`);
    if (member.team) tags.push(`队 ${member.team}`);
    if (member.tactic) tags.push(member.tactic.near ? `战术：玩家进 ${member.tactic.nearM} m 放行 +${member.tactic.delay}s，${member.tactic.points.length} 个点` : `战术：+${member.tactic.delay}s，${member.tactic.points.length} 个点`);
    if (member.assaultLane) tags.push(`跃进线 ${member.assaultLane.length} 段`);
    if (member.clearedAtPhase != null) tags.push(`阶段 ${member.clearedAtPhase} 起视为已清`);
    Out(`    · ${member.id.padEnd(22)} (${member.x}, ${member.z})  ${tags.join("  ")}`);
  }
}

switch (command) {
  case "summary": {
    Out(ModelSummary(model));
    break;
  }
  case "json": {
    Out(JSON.stringify(model, null, 2));
    break;
  }
  case "phase": {
    const number = Number(argument);
    const phase = model.phases.find((entry) => entry.number === number);
    if (!phase) { Usage(`没有这个阶段：${argument}`); break; }
    const layout = PhaseLayout(model, number);
    Out(`阶段 ${phase.number} ${phase.id} —— ${phase.title}`);
    Out(`出生点 ${Point(phase.spawn)}   步骤 ${phase.steps.join(" → ")}`);
    Out("");
    for (const stepId of phase.steps) {
      const step = model.steps.find((entry) => entry.id === stepId);
      if (step) { PrintStep(step); Out(""); }
    }
    Out("这一阶段开始时的敌军：");
    for (const encounter of layout.encounters) {
      if (encounter.state === "pending" && encounter.phaseNumber > number) continue;
      Out(`  ${encounter.state.padEnd(8)} ${encounter.id.padEnd(16)} ${encounter.members.length} 人`);
    }
    Out("");
    Out(`路线：${layout.routes.join(", ") || "—"}`);
    Out(`区域：${layout.zones.map((zone) => zone.id).join(", ") || "—"}`);
    Out(`友军点：${layout.friendlies.length} 个`);
    Out("");
    Out("设计时间轴（condition 类不带秒数）：");
    for (const entry of model.timeline.filter((item) => item.phaseNumber === number)) {
      const when = entry.kind === "beat" ? `[${entry.earliestS}–${entry.latestS}s]`
        : entry.atS != null ? `[${entry.atS}s]`
        : entry.minimumSeconds != null ? `[≥${entry.minimumSeconds}s]`
        : "[条件]";
      Out(`  ${when.padEnd(12)} ${entry.kind.padEnd(10)} ${entry.label}`);
    }
    break;
  }
  case "step": {
    const step = model.steps.find((entry) => entry.id === argument);
    if (!step) { Usage(`没有这个步骤：${argument}`); break; }
    PrintStep(step);
    break;
  }
  case "fact": {
    const fact = model.facts[argument];
    Out(`事实 ${argument}`);
    Out(`  ${DescribeFact(model, argument)}`);
    if (fact) {
      Out(`  判法 ${fact.kind}   步骤 ${fact.step}（阶段 ${fact.phaseNumber}）   来源 ${fact.source || "—"}`);
      if (fact.point) Out(`  点 ${Point(fact.point)}  半径 ${fact.radiusM} m`);
      if (fact.box) Out(`  区域 X ${fact.box.minX}..${fact.box.maxX}  Z ${fact.box.minZ}..${fact.box.maxZ}`);
      if (fact.requires) Out(`  前置 ${fact.requires.join(", ")}`);
    }
    const users = model.steps.filter((step) => step.requirements.includes(argument));
    Out(`  被这些步骤当过关条件：${users.map((step) => step.id).join(", ") || "—"}`);
    break;
  }
  case "encounter": {
    const encounter = model.encounters.find((entry) => entry.id === argument);
    if (!encounter) { Usage(`没有这个遭遇组：${argument}`); break; }
    PrintEncounter(encounter);
    Out("");
    Out("各阶段状态：");
    for (const phase of model.phases) {
      const state = PhaseLayout(model, phase.number).encounters.find((entry) => entry.id === encounter.id).state;
      Out(`  阶段 ${String(phase.number).padStart(2)} ${phase.id.padEnd(17)} ${state}`);
    }
    break;
  }
  case "member": {
    const owner = FindOwner(model, argument);
    if (!owner?.member) { Usage(`没有这个成员：${argument}`); break; }
    const member = owner.member;
    Out(`成员 ${member.id}  出生点 ${Point(member)}`);
    Out(`  所属 ${owner.encounter.id} 组   起始阶段 ${owner.phaseNumber}   由步骤 ${owner.step || "—"} 生成`);
    Out(`  武器 ${member.weapon}${member.hold ? "（hold，钉在位置上）" : ""}${member.bayonet ? "  上刺刀" : ""}${member.team ? `  队 ${member.team}` : ""}`);
    if (member.reserve) Out(`  预备队，放行延迟 ${member.releaseDelayS} 秒`);
    if (member.tactic) {
      Out(`  战术：延迟 ${member.tactic.delay} 秒${member.tactic.near ? `，且玩家要先进 ${member.tactic.near.x},${member.tactic.near.z} 的 ${member.tactic.nearM} m` : ""}`);
      Out(`        路线 ${member.tactic.points.map(Point).join(" → ")}`);
    }
    if (member.assaultLane) Out(`  跃进线 ${member.assaultLane.map(Point).join(" → ")}`);
    if (member.clearedAtPhase != null) Out(`  跳到阶段 ${member.clearedAtPhase} 及以后时视为已被清掉`);
    Out(`  出现：${owner.spawn ? JSON.stringify(owner.spawn) : "—"}`);
    Out(`  相关事实：${owner.facts.join(", ") || "—"}`);
    break;
  }
  default:
    Usage(command === "help" || command === "--help" ? null : `未知命令：${command}`);
}
