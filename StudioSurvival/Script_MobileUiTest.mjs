import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ReadLocal = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

const html = ReadLocal("./index.html");
const css = ReadLocal("./Style_Play.css");
const script = ReadLocal("./Script_Play.mjs");
const setupChoiceScript = script.match(/function RenderSetupChoices\(\) \{[^]*?dom\.continueButton[^]*?\n\}/)?.[0] || "";

assert.match(html, /viewport-fit=cover/, "the page must preserve phone safe-area insets");
assert.match(html, /id="mobileControls"/, "the touch-control region needs a stable DOM hook");
assert.match(html, /class="actionControls"/, "jump and interaction controls must share a right-thumb group");
assert.match(html, /id="moveLeftButton"[^>]+aria-pressed="false"/, "left movement needs an accessible held state");
assert.match(html, /id="moveRightButton"[^>]+aria-pressed="false"/, "right movement needs an accessible held state");
assert.match(html, /id="jumpButton"[^>]+aria-pressed="false"/, "jump needs visible press feedback");
assert.match(html, /id="interactButton"[^>]+disabled/, "interaction should begin disabled until a target is nearby");
assert.match(html, /id="settlementButton"[^>]+aria-label=/, "the next-turn settlement control needs a persistent accessible hook");
assert.match(html, /id="settlementButton"[^>]+aria-keyshortcuts="N"/, "the next-turn control must advertise its keyboard shortcut");
assert.match(html, /Style_Play\.css\?v=20260815q/, "project setup and stock-account changes must bypass the Pages cache");
assert.match(html, /Script_Play\.mjs\?v=20260815q/, "gameplay changes must bypass the Pages cache");
assert.doesNotMatch(html, /contractParties|contractFinePrint|signatureRow|按住 1 秒/, "project setup must only show game name, theme, type, and confirmation");
assert.match(html, /id="projectConfirmButton" class="documentButton contractSubmitButton"[^>]*><strong>开始开发<\/strong>/, "project setup needs one direct confirmation action");
assert.match(html, /id="goalReveal"[^>]+role="dialog"[^>]+aria-modal="true"[^>]+aria-labelledby="goalRevealTitle"/, "the opening must contain an accessible modal win-condition reveal");
assert.match(html, /id="goalRevealCounter">0<\/span><b>亿元<\/b>/, "the reveal must animate toward the explicit 100-yuan-billion target");
assert.match(html, /贷款 · 彩票 · 炒股/, "the reveal must say which cash sources do not count toward victory");

assert.match(css, /--controlSize:\s*clamp\(58px,\s*15\.5vh,\s*70px\)/, "primary controls must scale with short landscape screens");
assert.match(css, /\.interactButton\.available/, "the contextual action needs a high-confidence ready state");
assert.match(css, /min-height:\s*44px/, "sheet actions must retain a minimum touch target");
assert.match(css, /calc\(var\(--safeBottom\)/, "controls must sit above the phone home indicator");
assert.match(css, /\.mobileControls\.suppressed/, "world controls must disappear behind modal interactions");
assert.match(css, /\.settlementButton\s*\{[^}]*position:\s*fixed;[^}]*right:\s*var\(--safeRight\);[^}]*bottom:/s, "settlement must be a fixed bottom-right game control");
assert.match(css, /\.settlementButton\.suppressed/, "settlement must disappear behind modal interactions");
assert.match(css, /\.settlementButton\s*\{[^}]*touch-action:\s*manipulation;/s, "settlement must respond as a direct touch control");
assert.match(css, /\.cashStat\s*\{\s*display:\s*grid;/, "the smallest supported landscape must keep cash visible");
assert.match(css, /\.roundButton\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s, "utility controls must remain full touch targets");
assert.match(css, /\.goalReveal\.active \.goalRevealNumber/, "the 100-yuan-billion target needs a dedicated entrance animation");
assert.match(css, /\.goalRevealCard\s*\{\s*gap:5px;/, "the target reveal must compact itself on short landscape phones");
assert.match(css, /\.goalRevealButton\s*\{[^}]*min-height:44px;/, "the target acknowledgement must remain a full touch target");
assert.match(css, /\.stockPickGrid\s*\{/, "the computer stock picker needs a responsive two-choice layout");
assert.match(css, /\.stockMonthReport\s*\{/, "the next-turn result needs a dedicated stock chart report");
assert.match(css, /\.stockQuickAmounts button,[\s\S]*min-height:\s*44px/, "stock amount shortcuts must remain full touch targets");

assert.match(script, /SetTouchButtonPressed/, "held controls need deterministic visual state updates");
assert.match(script, /classList\.toggle\("available", interactionAvailable\)/, "interaction readiness must track the nearest target");
assert.match(script, /toggleAttribute\("inert", suppressed\)/, "hidden controls must leave the accessibility and touch order");
assert.match(script, /event\.code === "KeyN"[^\n]+OpenMonthSheet\(\)/, "next turn needs a keyboard shortcut");
assert.match(script, /dom\.settlementButton\.addEventListener\("click"[^]*?OpenMonthSheet\(\)/, "the persistent control must open the monthly close sheet");
assert.match(script, /matches\?\.\("button, a, \[role='button'\]"\)[^\n]+\["Space", "Enter"\]/, "focused physical controls must retain native keyboard activation");
assert.match(script, /navigator\.vibrate\?\./, "coarse-pointer actions should provide optional tactile confirmation");
assert.match(script, /dom\.sheetBody\.scrollTop = 0/, "each interaction sheet must open at its own beginning");
assert.match(script, /ShowGoalReveal\(result\.state\)/, "fresh contracts must show the target before entering the playable world");
assert.match(script, /dom\.goalRevealButton\.addEventListener\("click", CompleteGoalReveal\)/, "the player must acknowledge the win condition before play begins");
assert.match(script, /AddPhysicalLabel\(roomGroup, location\.name, ""/, "scene signs must render the place name without an explanatory subtitle");
assert.doesNotMatch(script, /BeginSealHold|CancelSealHold|sealHoldTimer|sealHoldComplete/, "project setup must not restore hold-to-confirm");
assert.doesNotMatch(setupChoiceScript, /project\.pitch|project\.trend|gameType\.description|gameType\.warning/, "project choices must stay label-only");
assert.match(script, /data-computer-action="stocks"/, "stock trading must enter through the home computer");
assert.match(script, /function OpenScratchSheet\(/, "the supermarket counter must have its own scratch-card screen");
assert.match(script, /function StockSettlementReport\(/, "the next turn must render the monthly stock trend and return");
assert.doesNotMatch(script, /LOTTERY \/ STOCKS/, "stocks and scratch cards must not share the old combined entry");

console.log("StudioSurvival mobile UI contract test passed");
