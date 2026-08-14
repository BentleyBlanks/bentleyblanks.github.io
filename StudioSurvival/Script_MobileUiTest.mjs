import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ReadLocal = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

const html = ReadLocal("./index.html");
const css = ReadLocal("./Style_Play.css");
const script = ReadLocal("./Script_Play.mjs");
const setupChoiceScript = script.match(/function RenderSetupChoices\(\) \{[^]*?dom\.continueButton[^]*?\n\}/)?.[0] || "";
const homeComputerSource = script.slice(
  script.indexOf("function OpenHomeComputerSheet"),
  script.indexOf("function OpenWorkstationSheet"),
);

assert.match(html, /viewport-fit=cover/, "the page must preserve phone safe-area insets");
assert.match(html, /id="mobileControls"/, "the touch-control region needs a stable DOM hook");
assert.match(html, /class="actionControls"/, "jump and interaction controls must share a right-thumb group");
assert.match(html, /id="moveLeftButton"[^>]+aria-pressed="false"/, "left movement needs an accessible held state");
assert.match(html, /id="moveRightButton"[^>]+aria-pressed="false"/, "right movement needs an accessible held state");
assert.match(html, /id="jumpButton"[^>]+aria-pressed="false"/, "jump needs visible press feedback");
assert.match(html, /id="interactButton"[^>]+disabled/, "interaction should begin disabled until a target is nearby");
assert.match(html, /Style_Play\.css\?v=20260815t/, "UI changes must bypass the Pages cache");
assert.match(html, /Script_Play\.mjs\?v=20260815t/, "gameplay changes must bypass the Pages cache");
assert.doesNotMatch(html, /Style_Play\.css\?v=20260815(?!t)/, "the stylesheet cache-bust must stay unified");
assert.doesNotMatch(html, /Script_Play\.mjs\?v=20260815(?!t)/, "the gameplay cache-bust must stay unified");
assert.match(html, /id="goalReveal"[^>]+role="dialog"[^>]+aria-modal="true"[^>]+aria-labelledby="goalRevealTitle"/, "the opening must contain an accessible modal win-condition reveal");
assert.match(html, /id="goalRevealCounter">0<\/span><b>亿元<\/b>/, "the reveal must animate toward the explicit 100-yuan-billion target");
assert.match(html, /贷款 · 彩票 · 炒股/, "the reveal must say which cash sources do not count toward victory");
assert.doesNotMatch(html, /id="settlementButton"/, "monthly close must stay on the physical wall calendar");
assert.doesNotMatch(html, /id="phoneButton"/, "market decisions must stay on the physical desk phone");
assert.match(html, /id="foundingNamePanel"[\s\S]*01 \/ 06/, "the founding book must begin with the first of six pages");
assert.match(html, /id="founderProfilePanel"[\s\S]*02 \/ 06/, "the founder profile must remain the second book page");
assert.match(html, /id="contractPageCounter">03 \/ 06/, "the project contract must continue the six-page book");
assert.equal([...html.matchAll(/data-contract-page=/g)].length, 4, "four contract pages must follow the name and founder pages");

assert.match(css, /--controlSize:\s*clamp\(58px,\s*15\.5vh,\s*70px\)/, "primary controls must scale with short landscape screens");
assert.match(css, /\.interactButton\.available/, "the contextual action needs a high-confidence ready state");
assert.match(css, /min-height:\s*44px/, "sheet actions must retain a minimum touch target");
assert.match(css, /calc\(var\(--safeBottom\)/, "controls must sit above the phone home indicator");
assert.match(css, /\.mobileControls\.suppressed/, "world controls must disappear behind modal interactions");
assert.match(css, /\.modalLayer\.monthCloseMode \.worldPanel/, "monthly confirmation needs its own compact ritual surface");
assert.match(css, /\.resultLayer\.monthResultMode \.resultCard/, "monthly results need a distinct ceremonial reveal");
assert.match(css, /\.monthResultMode \.stockReturnGrid\s*\{\s*display:\s*none;/, "stock settlement must stay compact inside the monthly reveal");
assert.match(css, /\.cashStat\s*\{\s*display:\s*grid;/, "the smallest supported landscape must keep cash visible");
assert.match(css, /\.roundButton\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s, "utility controls must remain full touch targets");
assert.match(css, /\.goalReveal\.active \.goalRevealNumber/, "the 100-yuan-billion target needs a dedicated entrance animation");
assert.match(css, /\.goalRevealCard\s*\{\s*gap:5px;/, "the target reveal must compact itself on short landscape phones");
assert.match(css, /\.goalRevealButton\s*\{[^}]*min-height:44px;/, "the target acknowledgement must remain a full touch target");
assert.match(css, /\.stockPickGrid\s*\{/, "the bank stock picker needs a responsive two-choice layout");
assert.match(css, /\.stockMonthReport\s*\{/, "the next-turn result needs a dedicated stock chart report");
assert.match(css, /\.stockQuickAmounts button,[\s\S]*min-height:\s*44px/, "stock amount shortcuts must remain full touch targets");
assert.match(css, /\.founderSkillControls button\s*\{[^}]*min-height:\s*44px;/s, "founder skill steppers must remain full touch targets");
assert.doesNotMatch(css, /\.founderSkillPresets/, "founder setup must stay focused on the three editable abilities");
assert.match(css, /\.computerReleaseCallout button\s*\{[^}]*min-height:\s*44px;/s, "the release action must remain a full touch target");
assert.doesNotMatch(css, /\.documentButton,\.bookBackButton\s*\{[^}]*min-height:\s*(?:3\d|4[0-3])px;/s, "book navigation must not shrink below a 44px touch target");
assert.doesNotMatch(css, /\.sealButton\s*\{[^}]*height:\s*(?:3\d|4[0-3])px;/s, "the signing seal must not shrink below a 44px touch target");
assert.match(css, /\.modalLayer\.computerMode \.worldPanel\s*\{/, "the home computer needs its own physical monitor shell");
assert.match(css, /\.computerMonitorShell\s*\{/, "the home computer must retain its monitor frame");
assert.match(css, /\.energyModuleGrid\s*\{/, "the computer must expose its four development work areas");

assert.match(script, /SetTouchButtonPressed/, "held controls need deterministic visual state updates");
assert.match(script, /classList\.toggle\("available", interactionAvailable\)/, "interaction readiness must track the nearest target");
assert.match(script, /toggleAttribute\("inert", suppressed\)/, "hidden controls must leave the accessibility and touch order");
assert.doesNotMatch(script, /event\.code === "KeyN"|dom\.settlementButton/, "monthly close must not bypass the wall calendar");
assert.doesNotMatch(script, /event\.code === "KeyM"|dom\.phoneButton/, "market decisions must not gain a global keyboard or HUD shortcut");
assert.match(script, /function TurnContractPage\(/, "the contract must support explicit page turns");
assert.match(script, /function BeginSealHold\(/, "the contract must retain its deliberate signing gesture");
assert.match(script, /data-computer-release|function OpenReleaseSheet\(/, "publishing must remain reachable from the development computer");
assert.match(script, /matches\?\.\("button, a, \[role='button'\]"\)[^\n]+\["Space", "Enter"\]/, "focused physical controls must retain native keyboard activation");
assert.match(script, /navigator\.vibrate\?\./, "coarse-pointer actions should provide optional tactile confirmation");
assert.match(script, /dom\.sheetBody\.scrollTop = 0/, "each interaction sheet must open at its own beginning");
assert.match(script, /ShowGoalReveal\(result\.state\)/, "fresh contracts must show the target before entering the playable world");
assert.match(script, /dom\.goalRevealButton\.addEventListener\("click", CompleteGoalReveal\)/, "the player must acknowledge the win condition before play begins");
assert.match(script, /AddPhysicalLabel\(roomGroup, location\.name, ""/, "scene signs must render the place name without an explanatory subtitle");
assert.doesNotMatch(setupChoiceScript, /project\.pitch|project\.trend|gameType\.description|gameType\.warning/, "project choices must stay label-only");
assert.match(script, /function OpenBankSheet[\s\S]*?data-open-stock/, "stock trading must enter through the physical bank interaction");
assert.doesNotMatch(script, /function OpenHomeComputerSheet[\s\S]*?data-open-stock[\s\S]*?function OpenWorkstationSheet/, "the development computer must not expose stock trading");
assert.match(script, /function OpenScratchSheet\(/, "the supermarket counter must have its own scratch-card screen");
assert.match(script, /function StockSettlementReport\(/, "the next turn must render the monthly stock trend and return");
assert.doesNotMatch(script, /LOTTERY \/ STOCKS/, "stocks and scratch cards must not share the old combined entry");
assert.match(script, /classList\.toggle\("computerMode", panelOptions\.mode === "computer"\)/, "computer sheets need an isolated presentation mode");
assert.match(homeComputerSource, /class="computerDeskScene"/, "the home computer must render a desk scene inside the monitor");
assert.match(homeComputerSource, /class="computerMonitorShell"/, "the home computer must retain its physical monitor shell");
assert.match(homeComputerSource, /\{ mode: "computer" \}/, "the home computer must open in the physical monitor mode");
assert.doesNotMatch(homeComputerSource, /data-computer-action|OpenDirectiveSheet|OpenMarketingSheet|OpenStockSheet|OpenTalentSheet|OpenMonthSheet/, "the development computer must not expose unrelated systems");

console.log("StudioSurvival mobile UI contract test passed");
