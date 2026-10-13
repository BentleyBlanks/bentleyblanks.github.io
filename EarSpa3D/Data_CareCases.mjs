// Case objectives refer to original material, including every physical fragment.
export const CARE_CASES = Object.freeze({
  drySheet: {
    number: 1, title: '干片练手', condition: '入口浅层 · 4.4 mm',
    request: '先取出入口这片干垢，其他地方可以慢慢清。',
    guide: '找①的翘边，用耳勺凹面贴住，按住左键缓慢刮、抬起。松脱后亲手撤出，按 T 移到盘上松手。',
    targets: [{root: 3, label: '入口干片', mass: .9}],
    layout: {3: {type: 'dry', form: 'ribbon'}},
    optional: '整片取出目标干片',
  },
  softenedWax: {
    number: 2, title: '黏块软化', condition: '浅层黏块 + 干片 · 4.4 mm',
    request: '这块黏得很牢，旁边还有一片干垢。两处处理好就可以了。',
    guide: '先让滴管口接触①并滴液，约 15 秒软化到 60%，期间可用耳勺处理②。换镊子将①放进两尖之间，闭合后慢慢拉出。',
    targets: [{root: 2, label: '黏块', mass: .9}, {root: 3, label: '旁侧干片', mass: .9}],
    layout: {2: {type: 'wet', form: 'film', softeningRate: .04}, 3: {type: 'dry', form: 'ribbon'}},
    optional: '软化到 60% 后收走黏块',
  },
  deepBend: {
    number: 5, title: '弯道深部', condition: '弯道后方 · 14.6 mm',
    request: '深处有一块积垢。入口不必全部清空，先找一条能进去的路线。',
    guide: '放大观察深处，换长镊，沿管腔用滚轮深入。碰壁先后撤、右键转腕，再用 Q / E 将两尖转到与耳垢表面平行。短耳勺够不到目标；黏块可先滴液软化。',
    targets: [{root: 8, label: '深部黏块', mass: .9}],
    layout: {8: {type: 'wet', form: 'film', depth: 14.6}},
    optional: '完整取出深部黏块',
  },
});
export const CARE_CASE_IDS = Object.freeze(Object.keys(CARE_CASES));
export function CustomerCase(customer) {
  if (!customer || customer.earType === 'oily') return null;
  if (Object.hasOwn(CARE_CASES, customer.caseId)) return customer.caseId;
  const match = /^d(\d+)c(\d+)$/.exec(customer.id || '');
  return CARE_CASE_IDS[match ? (Number(match[1]) - 1 + Number(match[2])) % CARE_CASE_IDS.length : 0];
}
export function CaseRoot(id) { return String(id).split('.')[0]; }
export function CaseProgress(caseId, targets = [], harvest = []) {
  const spec = CARE_CASES[caseId];
  if (!spec) return null;
  const seen = new Set(), collected = harvest.filter(item => {
    if (seen.has(String(item.id)) || !Number.isFinite(item.mass) || item.mass <= 0) return false;
    seen.add(String(item.id)); return true;
  });
  const goals = spec.targets.map((goal, index) => {
    const pieces = collected.filter(item => CaseRoot(item.id) === String(goal.root));
    const mass = Math.min(goal.mass, pieces.reduce((sum, item) => sum + item.mass, 0));
    const related = targets.filter(item => CaseRoot(item.id) === String(goal.root));
    return {...goal, number: index + 1, collected: mass, ratio: mass / goal.mass,
      complete: mass >= goal.mass - 1e-7,
      fractured: related.some(item => item.state === 'fractured' || item.fragment),
      softened: Math.max(0, ...related.map(item => item.softened || 0)),
      wetting: Math.max(0, ...related.map(item => item.wetting || 0)),
      collectedSoftened: pieces.length > 0 && pieces.every(item => (item.softened || 0) >= .6),
    };
  });
  const complete = goals.every(goal => goal.complete);
  const optional = complete && (caseId === 'softenedWax' ? goals[0].collectedSoftened : goals.every(goal => !goal.fractured));
  let hint = spec.guide;
  if (complete) hint = '主目标已收齐，可以交单；也可以继续精清，增加清洁收益。';
  else if (caseId === 'softenedWax' && !goals[0].complete && goals[0].wetting > 0)
    hint = `①软化 ${Math.round(goals[0].softened * 100)}% · ${goals[0].softened < .6 ? '可先处理②干片，再回来夹取。' : '已适合慢慢夹取；先张开两尖，再闭合。'}`;
  else if (goals.some(goal => goal.fractured)) hint = '目标碎了也能补救：编号跟随剩余碎片，全部收走仍可交单。';
  return {id: caseId, title: spec.title, goals, complete, optional, hint,
    ratio: goals.reduce((sum, goal) => sum + goal.collected, 0) / goals.reduce((sum, goal) => sum + goal.mass, 0)};
}
