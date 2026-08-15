import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { InteractionPoints } from "./Data_World.mjs";

const ReadLocal = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const script = ReadLocal("./Script_Play.mjs");
const html = ReadLocal("./index.html");
const css = ReadLocal("./Style_Play.css");
const contractDecisionPage = html.match(/<article class="contractPage contractDecisionPage active"[^]*?<\/article>/)?.[0] || "";
const ById = (id) => InteractionPoints.find((point) => point.id === id);

assert.deepEqual(
  ["homeComputer", "planningBoard", "marketingPhone", "homeCalendar", "talentCounter", "equipmentCounter"]
    .map((id) => {
      const point = ById(id);
      return [point.id, point.locationId, point.action];
    }),
  [
    ["homeComputer", "home", "computer"],
    ["planningBoard", "home", "direction"],
    ["marketingPhone", "home", "marketing"],
    ["homeCalendar", "home", "month"],
    ["talentCounter", "talent", "talent"],
    ["equipmentCounter", "talent", "equipment"],
  ],
  "development, direction, marketing, settlement, recruitment, and equipment need distinct physical entry points",
);

const triggerBlock = script.match(/function TriggerInteraction\(\)[\s\S]*?function StartFoundingCeremony/)?.[0] || "";
assert.match(triggerBlock, /case "homeComputer": return OpenHomeComputerSheet\(\)/);
assert.match(triggerBlock, /case "planningBoard": return OpenDirectiveSheet\(\)/);
assert.match(triggerBlock, /case "marketingPhone": return OpenMarketPhoneSheet\(\)/);
assert.match(triggerBlock, /case "homeCalendar": return OpenMonthSheet\(\)/);
assert.match(triggerBlock, /case "talentMarket": return OpenTalentSheet\(\)/);
assert.match(triggerBlock, /case "exit": return OpenTravelSheet\(\)/);

const staffBlock = script.match(/function OpenStaffSheet[\s\S]*?function OpenCustomizationSheet/)?.[0] || "";
assert.doesNotMatch(staffBlock, /data-customize|OpenCustomizationSheet\(staffId\)/, "staff chat must not duplicate the project-direction button");
assert.match(staffBlock, /项目方向与玩法提案统一在墙上白板处理/);

const directiveBlock = script.match(/function OpenDirectiveSheet[\s\S]*?function OpenMarketingSheet/)?.[0] || "";
assert.match(directiveBlock, /data-feature-source/, "the project whiteboard owns the feature-proposal entry");
assert.match(directiveBlock, /OpenFeatureSourceSheet\(\)/);
assert.match(directiveBlock, /state\.project\.age < 1/, "advanced direction controls stay hidden during the first development month");

const customizationBlock = script.match(/function OpenCustomizationSheet[\s\S]*?function OpenFeatureSourceSheet/)?.[0] || "";
assert.match(customizationBlock, /state\.project\.age < 1/, "direct feature customization must keep the early-stage gate");
assert.match(customizationBlock, /PROJECT WHITEBOARD/, "feature proposals should retain their whiteboard context");

const featureSourceBlock = script.match(/function OpenFeatureSourceSheet[\s\S]*?function OpenHomeComputerSheet/)?.[0] || "";
assert.doesNotMatch(featureSourceBlock, /mode: "computer"/, "the project whiteboard must not reuse the computer surface");

const computerBlock = script.match(/function OpenHomeComputerSheet[\s\S]*?function OpenWorkstationSheet/)?.[0] || "";
assert.match(computerBlock, /data-energy-module/, "the development computer must focus on the three monthly energy points");
assert.doesNotMatch(
  computerBlock,
  /data-computer-action|OpenDirectiveSheet\(|OpenMarketingSheet\(|OpenMarketPhoneSheet\(|OpenMonthSheet\(|OpenTalentSheet\(/,
  "direction, marketing, settlement, and recruitment must never return to the development computer",
);

const paidMarketingBlock = script.match(/function OpenMarketingSheet[\s\S]*?function MarketFitPreviewHtml/)?.[0] || "";
assert.match(paidMarketingBlock, /state\.project\.age < 1/, "paid marketing must remain unavailable before the first development month is complete");

const marketPhoneBlock = script.match(/function OpenMarketPhoneSheet[\s\S]*?function RevenueChart/)?.[0] || "";
assert.match(marketPhoneBlock, /state\.project\.age < 1/, "the first month must hide advanced market controls");
assert.match(marketPhoneBlock, /data-open-paid-campaigns/, "the physical phone owns the paid-promotion entry");
assert.match(marketPhoneBlock, /去墙上白板/);
assert.doesNotMatch(marketPhoneBlock, /OpenCustomizationSheet\("owner"\)/, "the phone must not bypass the project whiteboard");

assert.equal([...script.matchAll(/\bTravelWorld\(/g)].length, 1, "only the exit travel flow may call TravelWorld");
assert.match(html, /<title>甲方是我<\/title>/, "the browser title should use the game name only");
assert.match(html, /<h1><span>甲方是我<\/span><\/h1>/, "the title screen should lead with the game name only");
assert.doesNotMatch(`${html}\n${css}`, /进入\s*2\.5D|2\.5D\s+FOUNDING|灯会亮/, "the title screen should use normal player-facing language");
assert.doesNotMatch(html, /id="phoneButton"/, "market decisions must not be available from a global HUD shortcut");
assert.doesNotMatch(html, /id="settlementButton"/, "monthly close must stay on the physical wall calendar");
assert.doesNotMatch(script, /event\.code === "KeyM"|dom\.phoneButton/, "market decisions must not gain a global shortcut");
assert.doesNotMatch(script, /event\.code === "KeyN"|dom\.settlementButton/, "monthly close must not gain a global shortcut");
assert.match(html, /id="foundingNamePanel"[\s\S]*01 \/ 04/);
assert.match(html, /id="founderProfilePanel"[\s\S]*02 \/ 04/);
assert.match(html, /id="contractPageCounter">03 \/ 04/);
assert.equal([...html.matchAll(/data-contract-page=/g)].length, 2, "theme/release selection and signature follow the studio-name and founder-profile pages");
assert.match(contractDecisionPage, /id="projectChoices"[\s\S]*id="typeChoices"/, "theme and release mode must be selected together");
assert.doesNotMatch(html, /gameNameInput|游戏正式名称|填写游戏名/, "the founding contract must not ask for a game name");
assert.match(html, /id="sealButton"[\s\S]*签署发行合同/, "the contract must end in an explicit signing ritual");
assert.doesNotMatch(script, /确认开局/, "contract signing must not be labeled as generic start confirmation");
assert.match(html, /id="quickRestartButton"[\s\S]*沿用上局设定[\s\S]*快速重开/, "the ending must offer a one-click restart with the previous setup");
assert.match(html, /id="restartButton"[\s\S]*重新设定/, "the ending must retain a route back through full setup");
assert.match(script, /function QuickRestart\(\)[\s\S]*RestartProject\(state\)[\s\S]*BeginWorld\(result\.state\)/, "quick restart must enter a fresh run without reopening the naming book");

console.log("StudioSurvival interface separation contract test passed");
