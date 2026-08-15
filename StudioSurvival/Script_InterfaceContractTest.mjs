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
assert.match(directiveBlock, /\{ mode: "whiteboard" \}/, "project direction must open on the physical whiteboard surface");

const customizationBlock = script.match(/function OpenCustomizationSheet[\s\S]*?function OpenFeatureSourceSheet/)?.[0] || "";
assert.match(customizationBlock, /state\.project\.age < 1/, "direct feature customization must keep the early-stage gate");
assert.match(customizationBlock, /PROJECT WHITEBOARD/, "feature proposals should retain their whiteboard context");
assert.match(customizationBlock, /\{ mode: "whiteboard" \}/, "feature proposals must stay on the physical whiteboard surface");

const featureSourceBlock = script.match(/function OpenFeatureSourceSheet[\s\S]*?function OpenHomeComputerSheet/)?.[0] || "";
assert.doesNotMatch(featureSourceBlock, /mode: "computer"/, "the project whiteboard must not reuse the computer surface");
assert.match(featureSourceBlock, /mode: "whiteboard"/, "proposal ownership must stay on the physical whiteboard surface");

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
const sceneSyncBlock = script.match(/function SyncActiveLocationScene[\s\S]*?function BuildCeremonyScene/)?.[0] || "";
const travelSheetBlock = script.match(/function OpenTravelSheet[\s\S]*?function TravelTo/)?.[0] || "";
const travelToBlock = script.match(/function TravelTo[\s\S]*?function TriggerInteraction/)?.[0] || "";
const beginWorldBlock = script.match(/function BeginWorld[\s\S]*?function OpenTravelSheet/)?.[0] || "";
const monthSheetBlock = script.match(/function OpenMonthSheet[\s\S]*?function OpenHelpSheet/)?.[0] || "";
assert.match(script, /sceneGroup\.name = `Scene_\$\{location\.id\}`/, "each location needs its own render root");
assert.match(sceneSyncBlock, /locationSceneGroups\.forEach\(\(group, id\) => \{ group\.visible = id === location\.id; \}\)/, "only the active location render root may remain visible");
assert.match(sceneSyncBlock, /smoothCameraX = cameraCenter[\s\S]*camera\.position\.set\(cameraCenter/, "scene changes must snap the camera before reveal");
assert.match(beginWorldBlock, /SyncActiveLocationScene\(worldState\.activeLocationId, true\)/, "starting or restarting must synchronize the visible room");
assert.match(monthSheetBlock, /ResetWorldMonth\(worldState, state\.month\)[\s\S]*SyncActiveLocationScene\(worldState\.activeLocationId, true\)/, "monthly reset must return the renderer to the home room");
assert.match(travelSheetBlock, /class="travelMapPaper"[\s\S]*class="travelMapRoads"/, "the exit chooser must be a physical map rather than a list");
assert.match(travelSheetBlock, /WorldLocations\.map\(PlaceMarkup\)/, "the map must show all nine places, including the current location marker");
assert.match(travelSheetBlock, /class="travelMapPlace current"[\s\S]*aria-current="location"/, "the current place must be marked and non-interactive");
assert.match(travelSheetBlock, /data-travel-location/, "other map places must remain direct travel controls");
assert.doesNotMatch(travelSheetBlock, /locationPurpose|panelIntro|出发 →/, "the map must not restore the old explanatory destination cards");
assert.match(travelToBlock, /worldState = result\.state[\s\S]*SyncActiveLocationScene\(worldState\.activeLocationId, true\)[\s\S]*travelCurtain\.classList\.remove\("active"\)/, "travel must swap and snap the exclusive scene while the curtain is opaque");
assert.doesNotMatch(travelToBlock, /已到达/, "the map transition must not add a redundant arrival toast");
assert.doesNotMatch(html, /id="locationRoute"/, "the connected-world route strip must be removed from the HUD");
assert.match(html, /<title>甲方是我<\/title>/, "the browser title should use the game name only");
assert.match(html, /<h1><span>甲方是我<\/span><\/h1>/, "the title screen should lead with the game name only");
assert.doesNotMatch(`${html}\n${css}`, /进入\s*2\.5D|2\.5D\s+FOUNDING|灯会亮/, "the title screen should use normal player-facing language");
assert.doesNotMatch(html, /id="phoneButton"/, "market decisions must not be available from a global HUD shortcut");
assert.match(html, /id="settlementButton"[^>]*>[\s\S]*?下一回合/, "the primary next-turn action must stay visible in the global bottom-right HUD");
assert.match(script, /dom\.settlementButton\.addEventListener\("click"[\s\S]*?OpenMonthSheet\(\)/, "the global next-turn button must open the same confirmation sheet as the wall calendar");
assert.doesNotMatch(script, /event\.code === "KeyM"|dom\.phoneButton/, "market decisions must not gain a global shortcut");
assert.doesNotMatch(script, /event\.code === "KeyN"/, "monthly close must not gain an undocumented keyboard shortcut");
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
assert.match(script, /visualStyle = "absurd-paper-doll-v2"/, "human actors must keep the deliberately absurd asymmetric silhouette");
assert.match(script, /visualStyle = "absurd-orbit-assistant-v2"/, "AI actors must keep their broken-orbit visual identity");
assert.match(script, /function AddAbsurdLocationSigil\(/, "each room must retain its location-specific abstract sigil details");

console.log("StudioSurvival interface separation contract test passed");
