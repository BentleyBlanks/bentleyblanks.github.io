import assert from 'node:assert/strict';
import * as History from './Data_History.mjs';

assert.equal(History.campaignArchiveByTurn.length, 32, '战役档案必须覆盖 32 回合');
assert.deepEqual(
  [...new Set(History.campaignArchiveByTurn.map((entry) => entry.eraKey))],
  ['Opening', 'Growth', 'Hardship', 'Recovery', 'Counter'],
  '档案必须依次覆盖五时期',
);
for (let turn = 0; turn < 32; turn += 1) {
  const archive = History.GetCampaignArchive(turn);
  assert.equal(archive.turn, turn);
  assert.ok(archive.telegram && archive.fieldNote && archive.seasonalNote, `第 ${turn + 1} 回合档案不完整`);
  assert.match(archive.attribution, /非历史人物原话/);
  assert.match(archive.historicalEndpoint, /1945 年日本投降/);
}

const missionKeys = [
  'CutRailway', 'HoldPass', 'EstablishSupplyCorridor', 'RescueEncircled',
  'RaidThenWithdraw', 'EvacuateAndDeny', 'ExploitWeakness', 'StrategicCounteroffensive',
];
for (const key of missionKeys) {
  const briefing = History.GetMissionBriefing(key);
  assert.ok(briefing?.title && briefing?.telegram && briefing?.fieldNote && briefing?.caution, `${key} 缺任务档案`);
}
assert.match(History.GetMissionBriefing('EvacuateAndDeny').caution, /只记入代价账本.*绝不作为任务收益/);
assert.match(History.GetMissionBriefing('StrategicCounteroffensive').caution, /不改写.*1945 年日本投降/);
assert.equal(History.GetMissionBriefing('Unknown'), null);

for (const key of ['Sweep', 'Relieve', 'GuardHub', 'Repair', 'BlockGap']) {
  const vague = History.GetIntentNarrative(key, 1);
  const clear = History.GetIntentNarrative(key, 2);
  assert.ok(vague && clear && clear.certainty > vague.certainty, `${key} 敌情叙述缺情报层级`);
}

const archiveText = JSON.stringify({
  metadata: History.historicalArchiveMetadata,
  missions: History.missionBriefings,
  intents: History.intentNarratives,
  turns: History.campaignArchiveByTurn,
});
for (const forbidden of ['刷分', '爆率', '爽快', '人头数', '战利品箱', '改写日本投降']) {
  assert.ok(!archiveText.includes(forbidden), `历史档案出现娱乐化或越界措辞：${forbidden}`);
}
assert.match(History.historicalArchiveMetadata.scope, /不对应单一真实县份/);
assert.match(History.historicalArchiveMetadata.civilianLedgerRule, /不转化为资源、分数或奖励/);

let contextCreations = 0;
class ProbeAudioContext {
  constructor() {
    contextCreations += 1;
    this.state = 'running';
  }
  close() { return Promise.resolve(); }
}
globalThis.AudioContext = ProbeAudioContext;
const Audio = await import('./Script_Audio.mjs');
assert.equal(contextCreations, 0, '导入音频模块不得创建 AudioContext');
const handle = Audio.CreateAudio({ muted: true });
assert.equal(contextCreations, 0, 'CreateAudio 只建句柄，不得绕过用户手势启动');
handle.SetMuted(true);
handle.PlayEraAmbience('Hardship');
handle.PlayDispatch('Warning');
assert.equal(contextCreations, 0, '静音/未 Start 时播放接口必须保持无副作用');
await handle.Start();
assert.equal(contextCreations, 1, '只有显式 Start 才能创建 AudioContext');
for (const name of ['Radio', 'DistantDrum', 'WoodClapper', 'Wind', 'Snow', 'DispatchGood', 'DispatchWarning']) {
  assert.ok(Audio.sfxNames.includes(name), `缺少程序化音效 ${name}`);
}
for (const eraKey of ['Opening', 'Growth', 'Hardship', 'Recovery', 'Counter']) {
  assert.ok(Audio.eraAmbienceProfiles[eraKey]?.length >= 2, `${eraKey} 缺阶段氛围组合`);
}
delete globalThis.AudioContext;

console.log('Script_HistoryTest: 32回合档案、任务/意图文案、历史红线与音频启动契约通过');
