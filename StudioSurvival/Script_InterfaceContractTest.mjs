import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { InteractionPoints } from "./Data_World.mjs";

const ReadLocal = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const script = ReadLocal("./Script_Play.mjs");
const html = ReadLocal("./index.html");
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

const marketingBlock = script.match(/function OpenMarketingSheet[\s\S]*?function OpenReleaseSheet/)?.[0] || "";
assert.match(marketingBlock, /state\.project\.age < 1/, "marketing must remain unavailable before the first development month is complete");

assert.equal([...script.matchAll(/\bTravelWorld\(/g)].length, 1, "only the exit travel flow may call TravelWorld");
assert.match(html, /<h1><span>甲方是我<\/span><\/h1>/, "the title screen should lead with the game name only");
assert.doesNotMatch(html, /进入\s*2\.5D|灯会亮/, "the title screen should use normal player-facing language");
assert.equal([...html.matchAll(/data-contract-page=/g)].length, 4, "the four contract decisions follow the separate studio-name page");

console.log("StudioSurvival interface separation contract test passed");
