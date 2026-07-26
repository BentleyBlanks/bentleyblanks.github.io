import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(currentDirectory, "index.html"), "utf8");
const css = readFileSync(join(currentDirectory, "Style_Game.css"), "utf8");
const gameScript = readFileSync(join(currentDirectory, "Script_Game.mjs"), "utf8");
const parentHtml = readFileSync(join(currentDirectory, "..", "index.html"), "utf8");

assert.match(html, /<html lang="zh-CN">/);
assert.match(html, /<meta name="viewport"[^>]+width=device-width/);
assert.match(html, /<title>太行火种：敌后网络/);
assert.match(html, /data-testid="start-guided"/);
assert.match(html, /data-testid="map-viewport"/);
assert.match(html, /data-testid="commit-turn"/);
assert.match(html, /data-testid="resolution-modal"/);
assert.match(html, /id="tutorialProgressText">1 \/ 6</);
assert.match(html, /id="tutorialTarget"[^>]*>[^<]*<b>石桥村<\/b>/);

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML ids must be unique");
for (const requiredId of [
  "openingScreen",
  "gameShell",
  "tutorialCard",
  "mapViewport",
  "villageLayer",
  "actionList",
  "planList",
  "commitTurnButton",
  "resolutionModal",
  "outcomeModal",
]) {
  assert(ids.includes(requiredId), `missing required DOM id ${requiredId}`);
}

for (const assetMatch of html.matchAll(/(?:href|src)="(\.\/[^"?]+)(?:\?[^"#]*)?"/g)) {
  assert(existsSync(join(currentDirectory, assetMatch[1])), `missing local asset ${assetMatch[1]}`);
}

assert.doesNotMatch(html, /<(?:img|audio|video|iframe)\b/i, "whitebox must not depend on media assets");
assert.doesNotMatch(html, /(?:href|src)="https?:\/\//i, "whitebox must not load external dependencies");
assert.match(css, /\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important/);
assert.match(css, /@media\s*\(max-width:\s*540px\)/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
const mobileCss = css.slice(css.indexOf("@media (max-width: 540px)"), css.indexOf("@media (prefers-reduced-motion: reduce)"));
assert.match(mobileCss, /#undoPlanButton\s*\{[\s\S]*?display:\s*block;[\s\S]*?min-height:\s*44px;/);
assert.match(mobileCss, /#clearPlanButton\s*\{[\s\S]*?display:\s*none;/);
assert.match(mobileCss, /\.removePlanButton\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
assert.match(mobileCss, /\.sectionHeading \.collapseButton,[\s\S]*?\.smallTextButton\s*\{[\s\S]*?min-height:\s*44px;/);
assert.match(gameScript, /taihangdemo_peoplewar_save_v1/);
assert.match(gameScript, /taihangdemo_peoplewar_tutorial_v1/);
assert.doesNotMatch(gameScript, /localStorage\.(?:getItem|setItem)\("taihang[._](?!demo_peoplewar)/);
assert.match(gameScript, /function GetPlayerEnemyIntentView\(state\)/);
assert.equal((gameScript.match(/GetEnemyIntentPreview\(state\)/g) ?? []).length, 1, "true enemy intent must stay behind the player-facing intel view");
assert.doesNotMatch(gameScript, /GetEnemyIntentPreview\(gameState\)/, "renderers must not read the true enemy plan directly");
assert((gameScript.match(/GetPlayerEnemyIntentView\(gameState\)/g) ?? []).length >= 4, "intent card, map, threat marker, and inspector should share the gated view");
assert.match(gameScript, /INTEL_VISIBILITY_THRESHOLDS[\s\S]*?partial:\s*1[\s\S]*?estimated:\s*4[\s\S]*?exact:\s*8/);
assert.match(gameScript, /targetVillageId:\s*null[\s\S]*?行动类型、目标和兵力都不会显示/);
assert.match(gameScript, /function RequestNewGame\(guided\)[\s\S]*?HasValidSave\(\)[\s\S]*?confirm-new-game/);
assert.match(gameScript, /startGuidedButton\.addEventListener\("click", \(\) => RequestNewGame\(true\)\)/);
assert.match(gameScript, /tutorialRuntime\.stage === "debrief" && gameState\.lastResolution[\s\S]*?ShowResolution\(gameState\.lastResolution\)/);
assert.equal((gameScript.match(/tutorialRuntime\.stage = "select";/g) ?? []).length, 1, "debrief should advance only through the next-turn handler");
assert.match(gameScript, /commitTurnButton\.disabled = gameState\.status !== "active" \|\| tutorialRequiresUndo/);
assert.match(gameScript, /stage === "undo" && !tutorialRuntime\.practicedUndo[\s\S]*?undoPlanButton\.focus\(\)/);
assert.match(gameScript, /function TrapModalFocus\(event\)/);
assert.match(gameScript, /elements\.openingScreen\.inert = true/);
assert.match(gameScript, /occupationConsequencePanel/);
assert.match(gameScript, /群众抵抗不是暴行的责任来源/);
assert.match(gameScript, /peopleAgency/);
assert.match(gameScript, /群众自主行动/);
assert.match(gameScript, /击杀数不进入评价/);
assert.match(parentHtml, /onclick="location\.href='\.\/PeopleWar\/'"/);

const parentInlineScripts = [...parentHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter(Boolean);
assert(parentInlineScripts.length > 0, "parent TaihangDemo page should contain its inline game script");
for (const [scriptIndex, inlineScript] of parentInlineScripts.entries()) {
  new Script(inlineScript, { filename: `TaihangDemo_Inline_${scriptIndex}.js` });
}

console.log(`PeopleWar UI smoke tests passed: ${ids.length} unique ids, local-only assets, responsive boundaries, and parent entry syntax.`);
