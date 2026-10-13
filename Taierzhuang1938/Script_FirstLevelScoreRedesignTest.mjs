// 第一关配乐重配候选（Data_FirstLevelScoreRedesign）：白盒关键帧全覆盖、步骤与现行映射对得上、新曲资产与清单一致。
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { MISSION_STAGES } from "./Data_FirstLevelMission.mjs";
import { FIRST_LEVEL_STAGE_MUSIC } from "./Data_FirstLevelMissionMusic.mjs";
import { CurrentScoreForKeyframe, RedesignScoreForKeyframe, ScoreLibrary, SCORE_KEYFRAME_STEP, SCORE_REDESIGN_CUES,
  SCORE_REDESIGN_DIR, SCORE_REDESIGN_PLAN, SCORE_REDESIGN_VERSION } from "./Data_FirstLevelScoreRedesign.mjs";

const blockout = JSON.parse(fs.readFileSync(new URL("./Blockout/FirstLevel.json", import.meta.url), "utf8"));
const ids = blockout.keyframes.map(kf => kf.id);
assert.deepEqual(Object.keys(SCORE_KEYFRAME_STEP), ids, "每个白盒关键帧都要标出任务步骤，顺序同配置");
assert.deepEqual(Object.keys(SCORE_REDESIGN_PLAN), ids, "每个白盒关键帧都要有新方案（null = 静）");
const steps = new Set(MISSION_STAGES.map(stage => stage.id));
for (const kf of blockout.keyframes) {
  const step = SCORE_KEYFRAME_STEP[kf.id];
  assert.ok(steps.has(step) && step in FIRST_LEVEL_STAGE_MUSIC, `${kf.id} 的步骤 ${step} 不在任务表里`);
  assert.equal(Number(kf.id.slice(0, 2)), kf.stage, `${kf.id} 与 stage ${kf.stage} 不一致`);
  const plan = SCORE_REDESIGN_PLAN[kf.id];
  assert.ok(plan.cue === null || SCORE_REDESIGN_CUES[plan.cue], `${kf.id} 用了不存在的新曲 ${plan.cue}`);
  assert.ok(plan.why && plan.level > 0 && plan.level <= 1);
  const now = CurrentScoreForKeyframe(kf.id);
  if (now) assert.ok(now.level > 0 && now.level <= 1 && now.file.endsWith(".mp3"));
  else assert.ok(kf.id === "01-2" || !FIRST_LEVEL_STAGE_MUSIC[step]);
}
// 现行口径的几个钉子：近爆后静、15A / 17 静、交接是「别闭眼」
assert.equal(CurrentScoreForKeyframe("01-2"), null);
assert.equal(CurrentScoreForKeyframe("15-1"), null);
assert.equal(CurrentScoreForKeyframe("17-1"), null);
assert.equal(CurrentScoreForKeyframe("16-1").title, "别闭眼");
// 新方案：契约 §1.5 车哑后不起胜利音乐；死亡不配乐；每首新曲至少用到一次
assert.equal(RedesignScoreForKeyframe("05-4").cueId, null);
assert.equal(RedesignScoreForKeyframe("17-1").cueId, null);
const used = new Set(Object.values(SCORE_REDESIGN_PLAN).map(p => p.cue).filter(Boolean));
assert.deepEqual([...used].sort(), Object.keys(SCORE_REDESIGN_CUES).sort(), "曲库里每首新曲都要在方案里用上");
const library = ScoreLibrary();
assert.equal(library.current.length, 9);
assert.equal(library.redesign.length, Object.keys(SCORE_REDESIGN_CUES).length);
for (const cue of Object.values(SCORE_REDESIGN_CUES)) {
  assert.ok(cue.prompt.includes(cue.title) && cue.prompt.includes("D—A—F—E"), `${cue.id} 提示词缺曲名或贯穿动机`);
  assert.ok(cue.prompt.length < 1200, `${cue.id} 提示词过长`);
}

// 资产：清单里有的必须与文件一致；--require-assets 时十首都要在
const manifestUrl = new URL(`./${SCORE_REDESIGN_DIR}/Data_ScoreRedesignManifest.json`, import.meta.url);
const requireAll = process.argv.includes("--require-assets");
if (fs.existsSync(manifestUrl)) {
  const manifest = JSON.parse(fs.readFileSync(manifestUrl, "utf8"));
  assert.equal(manifest.version, SCORE_REDESIGN_VERSION);
  if (requireAll) assert.deepEqual(Object.keys(manifest.cues).sort(), Object.keys(SCORE_REDESIGN_CUES).sort());
  for (const [id, entry] of Object.entries(manifest.cues)) {
    const cue = SCORE_REDESIGN_CUES[id];
    assert.ok(cue, `清单里多出 ${id}`);
    const bytes = fs.readFileSync(new URL(`./${cue.file}`, import.meta.url));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), entry.sha256, `${id} 文件与清单不符`);
    assert.equal(entry.prompt, cue.prompt, `${id} 的提示词改过了：重掷（--only=${id} --force）或回退提示词`);
    assert.ok(Math.abs(entry.rmsDbfs + 27) <= 0.6 && entry.peakDbfs <= -2.5, `${id} 电平不在 −27 dBFS 口径`);
    assert.ok(entry.seconds >= 30 && entry.bytes < 4_000_000);
  }
} else assert.ok(!requireAll, "还没有生成新曲");
console.log(`FirstLevelScoreRedesignTest: ${ids.length} 个关键帧，${Object.keys(SCORE_REDESIGN_CUES).length} 首新曲 ok`);
