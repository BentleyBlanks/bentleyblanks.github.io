// 第一关策划白盒的纯规则：内容复用 id 与目标事实闸。
// 不 import three；Node 测试与 Script_Main 共读同一份答案。

function Has(collection, value) {
  if (!value) return true;
  if (collection instanceof Set) return collection.has(value);
  return Array.isArray(collection) ? collection.includes(value) : false;
}

/** 场景 id 与内容 id 分离：普通章逐字等于自己，白盒复用正式第一章内容。 */
export function PhaseContentId(phase) {
  return phase?.contentId || phase?.id || null;
}

/**
 * 路标只是“事实发生在哪里”，不再是“走进圈就算完成”。
 * 每一段至少等一个战斗事实、剧情信号或真实台词；返回 reason 给运行时取证。
 */
export function EvaluateFirstLevelObjectiveGate(rule = null, facts = {}) {
  if (!rule) return { ok: true, reason: null };
  const elapsed = Number(facts.elapsed) || 0;
  const enemyDeaths = Number(facts.enemyDeaths) || 0;
  if (Number.isFinite(rule.minTimeS) && elapsed < rule.minTimeS) {
    return { ok: false, reason: rule.reason || "时机未到", missing: "time" };
  }
  if (Number.isFinite(rule.minEnemyDeaths) && enemyDeaths < rule.minEnemyDeaths) {
    return { ok: false, reason: rule.reason || "威胁尚未解除", missing: "enemyDeaths" };
  }
  if (rule.signal && !Has(facts.signals, rule.signal)) {
    return { ok: false, reason: rule.reason || "场景事件尚未发生", missing: `signal:${rule.signal}` };
  }
  if (rule.voice && !Has(facts.voices, rule.voice)) {
    return { ok: false, reason: rule.reason || "人物动作尚未完成", missing: `voice:${rule.voice}` };
  }
  return { ok: true, reason: null };
}
