import assert from "node:assert/strict";
import fs from "node:fs";
import * as Rules from "./Script_Rules.mjs";

let state = Rules.CreateInitialState({ seed: 1937 });
let campaign = Rules.GetCampaignView(state);
assert.ok(campaign.primary, "建局未生成主任务");
assert.ok(campaign.optional, "建局未生成次要任务");
assert.ok(campaign.primary.deadlineLabel && Number.isFinite(campaign.primary.progress), "任务缺少期限或进度");
const input = JSON.stringify(state);
state = Rules.EndTurn(state).nextState;
assert.notEqual(JSON.stringify(state), input, "回合未推进");
campaign = Rules.GetCampaignView(state);
assert.ok(Array.isArray(campaign.objectives) && campaign.objectives.length, "回合推进后任务层丢失");
const restored = Rules.DeserializeState(Rules.SerializeState(state));
assert.deepEqual(Rules.GetCampaignView(restored), campaign, "存档往返丢失任务状态");

const ui = fs.readFileSync(new URL("./Script_Ui.mjs", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("./Script_Main.mjs", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./Style_Game.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
for (const contract of ["战役令", "敌情预警", "三阶段战斗预测", "补给吃紧", "OnSetStrategicLayer"]) {
  assert.ok(ui.includes(contract), `UI 契约缺失：${contract}`);
}
assert.ok(css.includes("@media (max-width: 640px)"), "缺少 390px 触控降级");
assert.ok(html.includes("#pcGate { display: none !important; }"), "窄屏仍被 PC gate 阻断");
const strategicLayerBody = main.match(/function ApplyStrategicLayer\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
assert.ok(strategicLayerBody.includes('SetHighlight(suppliedKeys, "intel")'), "补给图层未写入独立高亮通道");
assert.ok(strategicLayerBody.includes('SetHighlight(keys.filter(Boolean), "attack")'), "战线图层未写入独立高亮通道");
assert.ok(strategicLayerBody.includes('SetHighlight(view.reachable, "move")'), "移动范围未写入独立高亮通道");
assert.ok(
  strategicLayerBody.indexOf('SetHighlight(view.reachable, "move")')
    > strategicLayerBody.indexOf('SetHighlight(keys.filter(Boolean), "attack")'),
  "移动范围必须最后叠加，不能提前 return 截断战略图层",
);

assert.ok(
  css.includes("@media (max-width: 1480px), (max-height: 820px)"),
  "缺少 1366/1024 或低高度桌面紧凑规则",
);
assert.ok(css.includes("bottom: 224px;"), "任务令未给右下结束回合区预留空间");
assert.ok(
  css.includes(".pf-objective-summary, .pf-objective-failure { display: none; }"),
  "紧凑桌面未隐藏次要任务详情",
);
assert.ok(css.includes("bottom: auto;"), "移动端未重置桌面任务令底部预留");
console.log("UI contracts passed: campaign lifecycle, save safety, objectives, supply, forecast, layers, responsive gate.");
