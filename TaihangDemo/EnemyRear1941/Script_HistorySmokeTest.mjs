import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GetFixedHistoricalAnchor,
  GetHistoricalTurnNarrative,
  GetHistorySource,
  fixedHistoricalAnchors,
  historicalTurnNarratives,
  historyBoundary,
  historyMetadata,
  localPhaseDefinitions,
  ordinaryRoleDefinitions,
  responsibilityStageDefinitions,
  sourceReferences,
} from "./Data_History.mjs";
import {
  GetHistoricalEventPreview,
  ResolveHistoricalEvent,
} from "./Script_HistoricalEvents.mjs";

const pageDirectory = dirname(fileURLToPath(import.meta.url));
const gameScript = readFileSync(join(pageDirectory, "Script_Game.mjs"), "utf8");
const rulesScript = readFileSync(join(pageDirectory, "Script_Rules.mjs"), "utf8");
const eventScript = readFileSync(join(pageDirectory, "Script_HistoricalEvents.mjs"), "utf8");

let assertionCount = 0;

function Check(condition, message) {
  assertionCount += 1;
  assert.ok(condition, message);
}

function Equal(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}

function DeepEqual(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}

function Match(actual, pattern, message) {
  assertionCount += 1;
  assert.match(actual, pattern, message);
}

function BuildExpectedMonths() {
  const months = [];
  let year = 1941;
  let month = 9;
  while (true) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    if (year === 1942 && month === 12) {
      break;
    }
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return months;
}

function CollectReferencedSourceIds() {
  const sourceIds = new Set(historyBoundary.sourceIds);
  for (const anchor of fixedHistoricalAnchors) {
    for (const sourceId of anchor.sourceIds) {
      sourceIds.add(sourceId);
    }
  }
  return sourceIds;
}

function CheckBoundary() {
  Equal(historyBoundary.classification, "历史环境中的情境合成战役", "战役必须明确标注为情境合成");
  Equal(historyBoundary.time.start, "1941-09", "起点必须固定为1941年9月");
  Equal(historyBoundary.time.end, "1942-12", "终点必须固定为1942年12月");
  Equal(historyBoundary.time.turnCount, 16, "历史边界必须覆盖16个回合");
  Match(historyBoundary.geography.mapRule, /合成地理|不对应/, "地图必须声明为合成县域");
  Match(historyBoundary.claims.national, /1938年10月/, "全国战略相持节点必须放在1938年10月前后");
  Match(historyBoundary.claims.fixedVictory, /1945年.*不能.*改写/, "全国胜利必须保持固定历史");
  Check(historyBoundary.scoringRules.some((rule) => /不以击杀数量计分/.test(rule)), "必须明确禁用击杀计分");
  Check(historyBoundary.scoringRules.some((rule) => /不能抵消民生损失/.test(rule)), "军事贡献不得抵消民生损失");
  Equal(historyBoundary.archivePolicy.realPeoplePlacement, "ArchiveOnly", "真人只能在档案说明中出现");
  Equal(historyBoundary.archivePolicy.interactiveRealPeople, false, "真人不得成为可操作角色");
  Equal(historyBoundary.archivePolicy.numericRewardForRealPeople, false, "真人档案不得提供数值奖励");
  Equal(historyMetadata.realPeoplePolicy, "ArchiveOnly", "元数据必须重复声明真人边界");
}

function CheckLocalPhasesAndYears() {
  const expectedMonths = BuildExpectedMonths();
  Equal(expectedMonths.length, 16, "预期月份序列必须是16个月");
  Equal(historicalTurnNarratives.length, 16, "必须提供16个历史回合");
  DeepEqual(historicalTurnNarratives.map((turn) => turn.dateKey), expectedMonths, "月份必须从1941年9月连续至1942年12月");
  DeepEqual(historicalTurnNarratives.map((turn) => turn.turn), Array.from({ length: 16 }, (_, index) => index + 1), "回合编号必须连续");

  const phaseIds = new Set();
  let previousEndTurn = 0;
  for (const phase of localPhaseDefinitions) {
    Check(!phaseIds.has(phase.id), `地方阶段ID不得重复：${phase.id}`);
    phaseIds.add(phase.id);
    Equal(phase.classification, "地方阶段", `${phase.id}必须明确是地方阶段`);
    Equal(phase.notNationalPeriodization, true, `${phase.id}不得冒充全国抗战分期`);
    Equal(phase.turnRange[0], previousEndTurn + 1, `${phase.id}必须与上一地方阶段连续`);
    Check(phase.turnRange[1] >= phase.turnRange[0], `${phase.id}回合范围必须有效`);
    previousEndTurn = phase.turnRange[1];
    const firstTurn = historicalTurnNarratives[phase.turnRange[0] - 1];
    const lastTurn = historicalTurnNarratives[phase.turnRange[1] - 1];
    Equal(firstTurn.dateKey, phase.dateRange[0], `${phase.id}起始月份必须匹配`);
    Equal(lastTurn.dateKey, phase.dateRange[1], `${phase.id}结束月份必须匹配`);
  }
  Equal(previousEndTurn, 16, "地方阶段必须完整覆盖16回合");

  for (const turn of historicalTurnNarratives) {
    const phase = localPhaseDefinitions.find((candidate) => candidate.id === turn.localPhaseId);
    Check(Boolean(phase), `回合${turn.turn}必须引用有效地方阶段`);
    Check(turn.turn >= phase.turnRange[0] && turn.turn <= phase.turnRange[1], `回合${turn.turn}必须落在所属阶段范围内`);
    Match(turn.date, /^194[12]年(?:[1-9]|1[0-2])月$/, `回合${turn.turn}的玩家日期必须有效`);
  }
}

function CheckResponsibilityChains() {
  const expectedStageIds = responsibilityStageDefinitions.map((stage) => stage.id);
  DeepEqual(expectedStageIds, ["Detect", "Prepare", "Protect", "Resolve", "Recover"], "责任链顺序必须固定");
  const roleIds = new Set(ordinaryRoleDefinitions.map((role) => role.id));
  const appearedRoleIds = new Set();
  const anchorIds = new Set(fixedHistoricalAnchors.map((anchor) => anchor.id));
  const referencedAnchorIds = new Set();

  for (const turn of historicalTurnNarratives) {
    Equal(turn.event.classification, "情境合成", `回合${turn.turn}事件必须标注为情境合成`);
    Match(turn.event.disclaimer, /情境合成.*不声称复原/, `回合${turn.turn}必须带合成事件免责声明`);
    Check(turn.event.roleIds.length > 0, `回合${turn.turn}必须由普通角色承担`);
    for (const roleId of turn.event.roleIds) {
      Check(roleIds.has(roleId), `回合${turn.turn}引用未知角色：${roleId}`);
      appearedRoleIds.add(roleId);
    }
    Check(turn.fixedAnchorIds.length > 0, `回合${turn.turn}必须连接至少一个固定史实锚点`);
    for (const anchorId of turn.fixedAnchorIds) {
      Check(anchorIds.has(anchorId), `回合${turn.turn}引用未知史实锚点：${anchorId}`);
      referencedAnchorIds.add(anchorId);
    }

    Equal(turn.responsibilityChain.length, expectedStageIds.length, `回合${turn.turn}必须有完整五段责任链`);
    DeepEqual(turn.responsibilityChain.map((stage) => stage.stageId), expectedStageIds, `回合${turn.turn}责任链顺序错误`);
    for (const stage of turn.responsibilityChain) {
      Match(stage.action, /[。！？]$/, `回合${turn.turn}/${stage.stageId}必须有完整行动文本`);
      Check(stage.actorRoleIds.length > 0, `回合${turn.turn}/${stage.stageId}必须指定责任角色`);
      for (const roleId of stage.actorRoleIds) {
        Check(roleIds.has(roleId), `回合${turn.turn}/${stage.stageId}引用未知角色：${roleId}`);
      }
      Match(stage.consequenceIfMissed, /[。！？]$/, `回合${turn.turn}/${stage.stageId}必须描述遗漏后果`);
    }
    Equal(turn.failureCarryForward.persists, true, `回合${turn.turn}失败后果必须持续`);
    Equal(turn.failureCarryForward.cannotBeCanceledByCombatScore, true, `回合${turn.turn}失败后果不得被战斗分抵消`);
    Check(turn.failureCarryForward.text.length >= 20, `回合${turn.turn}必须说明后续影响`);
  }

  DeepEqual([...appearedRoleIds].sort(), [...roleIds].sort(), "所有普通角色都必须进入至少一个回合事件");
  DeepEqual([...referencedAnchorIds].sort(), [...anchorIds].sort(), "所有固定史实锚点都必须进入至少一个玩家档案");
}

function CheckRolesAndAnchors() {
  const requiredRoles = new Set(["交通员", "乡村医护员", "合作社组织者", "铁路工人", "流离家庭"]);
  Equal(ordinaryRoleDefinitions.length, requiredRoles.size, "必须提供五类指定普通角色");
  for (const role of ordinaryRoleDefinitions) {
    Check(requiredRoles.has(role.role), `出现未约定角色类型：${role.role}`);
    Match(role.classification, /^情境合成人物/, `${role.id}必须明确为合成人物`);
    Equal(role.isRealPerson, false, `${role.id}不得冒充真人`);
    Check(role.agencyLimit.length >= 20, `${role.id}必须限制个人英雄式能动性`);
  }

  const anchorIds = new Set();
  for (const anchor of fixedHistoricalAnchors) {
    Check(!anchorIds.has(anchor.id), `史实锚点ID不得重复：${anchor.id}`);
    anchorIds.add(anchor.id);
    Equal(anchor.classification, "固定史实锚点", `${anchor.id}必须明确为固定史实`);
    Check(anchor.sourceIds.length > 0, `${anchor.id}必须有公开来源`);
    Check(anchor.statement.length >= 20, `${anchor.id}必须提供完整史实说明`);
    Check(anchor.gameplayConstraint.length >= 20, `${anchor.id}必须说明玩法边界`);
  }
  Check(anchorIds.has("NationalStrategicStalemateLate1938"), "必须固定1938年全国战略相持锚点");
  Check(anchorIds.has("NationalVictoryAndSurrender1945"), "必须固定1945年全国胜利与投降锚点");
}

function CheckSources() {
  Check(sourceReferences.length >= 6, "公开来源不得少于6条");
  const sourceIds = new Set();
  for (const source of sourceReferences) {
    Check(!sourceIds.has(source.id), `来源ID不得重复：${source.id}`);
    sourceIds.add(source.id);
    Check(source.title.length >= 8, `${source.id}缺少完整标题`);
    Check(source.publisher.length >= 4, `${source.id}缺少发布机构`);
    Match(source.url, /^https?:\/\/[^\s]+$/, `${source.id}必须提供公开HTTP(S)地址`);
    Match(source.accessedOn, /^20\d{2}-\d{2}-\d{2}$/, `${source.id}必须记录访问日期`);
    Check(source.kind.length >= 6, `${source.id}必须说明资料类型`);
    Check(Array.isArray(source.usedFor) && source.usedFor.length > 0, `${source.id}必须声明usedFor`);
    Equal(new Set(source.usedFor).size, source.usedFor.length, `${source.id}的usedFor不得重复`);
    for (const usage of source.usedFor) {
      Match(usage, /^(Boundary|Anchor|Archive)\.[A-Za-z0-9]+$/, `${source.id}存在无效usedFor：${usage}`);
    }
  }

  const referencedSourceIds = CollectReferencedSourceIds();
  for (const sourceId of referencedSourceIds) {
    Check(sourceIds.has(sourceId), `引用了不存在的来源：${sourceId}`);
    Equal(GetHistorySource(sourceId)?.id, sourceId, `GetHistorySource必须返回${sourceId}`);
  }
  for (const sourceId of sourceIds) {
    Check(referencedSourceIds.has(sourceId), `来源${sourceId}必须被边界或史实锚点实际引用`);
  }
}

function CheckForbiddenLanguage() {
  const allText = JSON.stringify({
    historyBoundary,
    localPhaseDefinitions,
    ordinaryRoleDefinitions,
    fixedHistoricalAnchors,
    historicalTurnNarratives,
    sourceReferences,
  });
  const forbiddenTerms = [
    "一切反动派都是纸老虎",
    "百万雄师过大江",
    "三大战役",
    "抗美援朝",
    "大跃进",
    "文化大革命",
    "山田大队长",
    "八嘎",
    "哟西",
    "花姑娘",
    "米西米西",
    "小胡子军官",
    "圆眼镜军官",
    "龅牙",
    "罗圈腿",
    "獐头鼠目",
    "任务道具",
    "隐藏单位",
    "一刀切",
    "单点失败",
    "忠诚测试",
    "自动恢复动画",
    "无风险点击",
    "组织点",
    "资源卡",
    "刷分",
    "踩中",
    "撤离倒计时",
    "网络吞吐",
  ];
  for (const term of forbiddenTerms) {
    Check(!allText.includes(term), `历史资料不得包含时代错置或脸谱化用语：${term}`);
  }
  Check(!/194[12][^。]{0,18}全国[^。]{0,10}(进入|转入)战略相持/.test(allText), "不得把1941至1942地方阶段写成全国刚进入战略相持");
  Check(!/(太平洋战场|太平洋战争)[^。]{0,24}(敌军|日军)[^。]{0,10}(自动|必然|全部)(撤|减|东调)/.test(allText), "不得由太平洋战争机械推导本地守备撤走");
}

function CheckLookupAndImmutability() {
  for (let turn = 1; turn <= 16; turn += 1) {
    Equal(GetHistoricalTurnNarrative(turn)?.turn, turn, `必须能查询回合${turn}`);
  }
  Equal(GetHistoricalTurnNarrative(0), null, "无效回合应返回null");
  Equal(GetHistoricalTurnNarrative(1.5), null, "非整数回合应返回null");
  Equal(GetHistoricalTurnNarrative("1"), null, "字符串回合应返回null");
  for (const anchor of fixedHistoricalAnchors) {
    Equal(GetFixedHistoricalAnchor(anchor.id)?.id, anchor.id, `必须能查询锚点${anchor.id}`);
  }
  Equal(GetFixedHistoricalAnchor("MissingAnchor"), null, "未知锚点应返回null");
  Equal(GetHistorySource("MissingSource"), null, "未知来源应返回null");
  Check(Object.isFrozen(historyBoundary), "历史边界必须冻结");
  Check(Object.isFrozen(historicalTurnNarratives), "回合数据必须冻结");
  Check(Object.isFrozen(historicalTurnNarratives[0].responsibilityChain), "嵌套责任链必须冻结");
  Check(Object.isFrozen(sourceReferences[0].usedFor), "来源用途必须冻结");
}

function CheckPlayerVisibleIntegration() {
  Match(
    gameScript,
    /from\s+["']\.\/Data_History\.mjs\?v=20260730q["']/,
    "游戏必须使用当前缓存标识导入历史数据",
  );
  Match(
    gameScript,
    /playerEffectPattern\s*=\s*\/停运铁路继续牵制敌军修复与守备力量\//,
    "持续铁路牵制必须归入我方部署，不能因包含“敌军”字样误分到敌军反制",
  );
  Match(
    gameScript,
    /群众保护组织度[\s\S]*?侵略暴行责任始终属于实施者/,
    "保护组织度必须明确表示减损准备，并保留侵略者责任",
  );
  Match(
    gameScript,
    /function\s+RenderBriefing\s*\([\s\S]*?GetHistoryContext\(\)[\s\S]*?phasePrefix/,
    "回合简报必须显示地方阶段",
  );
  Match(
    gameScript,
    /function\s+RenderTimeline\s*\([\s\S]*?historicalTurnNarratives[\s\S]*?historicalFrame/,
    "固定时间线必须使用历史叙事数据",
  );
  Match(gameScript, /function\s+ShowHistoryArchive\s*\(/, "必须提供玩家可见历史档案");
  Match(
    gameScript,
    /function\s+ShowHistoryArchive[\s\S]*?BuildHistoryRoleCards\(narrative\)[\s\S]*?BuildResponsibilityChainHtml\(narrative\)[\s\S]*?BuildHistoricalAnchorCards\(narrative\)/,
    "历史档案必须同时展示普通人物、责任链和固定史实锚点",
  );
  Match(
    gameScript,
    /function\s+BuildHistoricalAnchorCards[\s\S]*?GetHistorySource\(sourceId\)[\s\S]*?target=["']_blank["']/,
    "固定史实锚点必须链接公开来源",
  );
  Match(
    gameScript,
    /function\s+ShowHistoryBoundary[\s\S]*?historyBoundary\.claims\.national[\s\S]*?historyBoundary\.claims\.fixedVictory/,
    "史实边界弹窗必须来自历史数据而非孤立硬编码",
  );
  Match(
    gameScript,
    /label:\s*["']本回合历史档案["'][\s\S]*?ShowHistoryArchive/,
    "战局规则入口必须可打开本回合历史档案",
  );
  Match(
    rulesScript,
    /from\s+["']\.\/Script_HistoricalEvents\.mjs["']/,
    "规则结算必须接入独立的历史任务事件模块",
  );
  Match(
    rulesScript,
    /ResolveHistoricalEvent\([\s\S]*?resolvedOrders[\s\S]*?eventContext/,
    "历史任务结果必须读取本月真实命令与结算前预警目标",
  );
  Match(
    eventScript,
    /choice:\s*\{[\s\S]*?actionIds[\s\S]*?targetHexIds[\s\S]*?policyIds/,
    "事件档案必须保存动作、地图目标和政策选择",
  );
  Match(
    eventScript,
    /pendingConsequences[\s\S]*?appliedConsequences[\s\S]*?historicalConsequences/,
    "遗漏责任必须保存待兑现、已兑现和逐条损失簿记录",
  );
  Match(
    gameScript,
    /function\s+BuildHistoricalEventRecordHtml[\s\S]*?实际命令[\s\S]*?部署证据与遗漏项[\s\S]*?延迟后果/,
    "历史档案必须展示真实部署结果、遗漏项和延迟后果",
  );
  Match(
    gameScript,
    /latestVisibleTurn[\s\S]*?turn\s*<\s*latestVisibleTurn/,
    "历史档案不得在首回合一路翻看尚未到达的未来合成事件",
  );
  Match(
    gameScript,
    /openingLogEntries[\s\S]*?\.filter\(\(entry\)\s*=>\s*!openingLogEntries\.has/,
    "下一月开局影响不得错误归入上一月回合战报",
  );
  Match(
    gameScript,
    /function\s+BuildLedgerHtml[\s\S]*?historicalConsequences[\s\S]*?sourceTitle[\s\S]*?responsibilityNote/,
    "损失簿必须逐条显示延迟后果的来源月份与责任说明",
  );
  Match(
    gameScript,
    /eventResponsibilitiesProtected:\s*["']月度责任落实["'][\s\S]*?eventResponsibilitiesNeglected:\s*["']月度责任缺口["']/,
    "终局字段必须以中文说明历史责任结果",
  );
}

function CreateHistoricalResponsibilityTestState(institutions, exposure = 35) {
  return {
    turn: 1,
    hexes: institutions.map((institution, index) => ({
      id: `TestVillage_${index + 1}`,
      feature: "Village",
      institution,
      construction: null,
    })),
    meters: {
      people: 50,
      unity: 50,
      discipline: 50,
      exposure,
    },
    resources: {},
    policies: [],
    log: [],
    ledger: {},
  };
}

function CheckHistoricalResponsibilityEvidence() {
  const moveOrder = [{
    actionId: "move",
    targetHexId: "TestVillage_1",
    hexId: "TestVillage_1",
  }];

  const turn11State = CreateHistoricalResponsibilityTestState(["Station", "Clinic"]);
  const turn11Preview = GetHistoricalEventPreview(turn11State, 11, moveOrder);
  Equal(turn11Preview.orderCount, 1, "第11回合证据预览必须记录实际命令数");
  Equal(turn11Preview.relevantOrderCount, 0, "纯移动不得冒充雨季交通或救护行动");
  Equal(turn11Preview.objectiveActionCount, 0, "纯移动不得生成目标行动证据");
  Equal(turn11Preview.structuralEvidenceCount, 2, "既有交通站和救护所应继续作为结构证据显示");
  Equal(turn11Preview.hasDeployment, false, "部署字段只能由当月相关目标行动触发");
  Equal(turn11Preview.hasOnlyIrrelevantOrders, true, "只有无关命令时必须显式标记证据失配");
  Equal(
    ResolveHistoricalEvent(turn11State, 11, moveOrder).outcomeId,
    "Neglected",
    "第11回合不得用一次无关移动加两座既有机构刷成责任落实",
  );

  const turn16MoveState = CreateHistoricalResponsibilityTestState(["Station", "Clinic"], 40);
  const turn16MovePreview = GetHistoricalEventPreview(turn16MoveState, 16, moveOrder);
  Equal(turn16MovePreview.structuralEvidenceCount, 2, "年终机构存续与隐蔽网络必须分别记作结构证据");
  Equal(
    ResolveHistoricalEvent(turn16MoveState, 16, moveOrder).outcomeId,
    "Neglected",
    "第16回合不得用无关移动把年终静态条件刷成责任落实",
  );

  const turn16StructuralState = CreateHistoricalResponsibilityTestState(["Station", "Clinic"], 40);
  Equal(
    ResolveHistoricalEvent(turn16StructuralState, 16, []).outcomeId,
    "Partial",
    "没有当月行动时，两项真实结构证据至多形成部分落实",
  );

  const turn16ProtectedState = CreateHistoricalResponsibilityTestState(["Station", "Clinic"], 40);
  const reliefOrder = [{
    actionId: "relief",
    targetHexId: "TestVillage_1",
    hexId: "TestVillage_1",
  }];
  const turn16ProtectedPreview = GetHistoricalEventPreview(turn16ProtectedState, 16, reliefOrder);
  Equal(turn16ProtectedPreview.objectiveActionCount, 1, "年终救济必须形成当月目标行动证据");
  Equal(turn16ProtectedPreview.structuralEvidenceCount, 2, "年终责任落实还必须保有机构与隐蔽网络");
  Equal(
    ResolveHistoricalEvent(turn16ProtectedState, 16, reliefOrder).outcomeId,
    "Protected",
    "只有相关行动与结构状态同时达标时才能判定责任落实",
  );
}

CheckBoundary();
CheckLocalPhasesAndYears();
CheckResponsibilityChains();
CheckRolesAndAnchors();
CheckSources();
CheckForbiddenLanguage();
CheckLookupAndImmutability();
CheckPlayerVisibleIntegration();
CheckHistoricalResponsibilityEvidence();

console.log(`History smoke test passed: ${assertionCount} assertions across 16 historical turns.`);
