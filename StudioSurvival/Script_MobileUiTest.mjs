import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ReadLocal = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

const html = ReadLocal("./index.html");
const css = ReadLocal("./Style_Play.css");
const script = ReadLocal("./Script_Play.mjs");

assert.match(html, /viewport-fit=cover/, "the page must preserve phone safe-area insets");
assert.match(html, /id="mobileControls"/, "the touch-control region needs a stable DOM hook");
assert.match(html, /class="actionControls"/, "jump and interaction controls must share a right-thumb group");
assert.match(html, /id="moveLeftButton"[^>]+aria-pressed="false"/, "left movement needs an accessible held state");
assert.match(html, /id="moveRightButton"[^>]+aria-pressed="false"/, "right movement needs an accessible held state");
assert.match(html, /id="jumpButton"[^>]+aria-pressed="false"/, "jump needs visible press feedback");
assert.match(html, /id="interactButton"[^>]+disabled/, "interaction should begin disabled until a target is nearby");
assert.match(html, /id="settlementButton"[^>]+aria-label=/, "the next-turn settlement control needs a persistent accessible hook");
assert.match(html, /id="settlementButton"[^>]+aria-keyshortcuts="N"/, "the next-turn control must advertise its keyboard shortcut");
assert.match(html, /Style_Play\.css\?v=20260815k/, "turn-control CSS changes must bypass the Pages cache");
assert.match(html, /Script_Play\.mjs\?v=20260815k/, "gameplay changes must bypass the Pages cache");

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

assert.match(script, /SetTouchButtonPressed/, "held controls need deterministic visual state updates");
assert.match(script, /classList\.toggle\("available", interactionAvailable\)/, "interaction readiness must track the nearest target");
assert.match(script, /toggleAttribute\("inert", suppressed\)/, "hidden controls must leave the accessibility and touch order");
assert.match(script, /event\.code === "KeyN"[^\n]+OpenMonthSheet\(\)/, "next turn needs a keyboard shortcut");
assert.match(script, /dom\.settlementButton\.addEventListener\("click"[^]*?OpenMonthSheet\(\)/, "the persistent control must open the monthly close sheet");
assert.match(script, /matches\?\.\("button, a, \[role='button'\]"\)[^\n]+\["Space", "Enter"\]/, "focused physical controls must retain native keyboard activation");
assert.match(script, /navigator\.vibrate\?\./, "coarse-pointer actions should provide optional tactile confirmation");
assert.match(script, /dom\.sheetBody\.scrollTop = 0/, "each interaction sheet must open at its own beginning");

console.log("StudioSurvival mobile UI contract test passed");
