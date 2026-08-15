import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { InteractionPoints } from "./Data_World.mjs";

const ReadLocal = (name) => readFileSync(new URL(name, import.meta.url), "utf8");
const script = ReadLocal("./Script_Play.mjs");
const rules = ReadLocal("./Script_Rules.mjs");
const html = ReadLocal("./index.html");
const css = ReadLocal("./Style_Play.css");
const contractDecisionPage = html.match(/<article class="contractPage contractDecisionPage active"[^]*?<\/article>/)?.[0] || "";
const ById = (id) => InteractionPoints.find((point) => point.id === id);
const FunctionBlock = (name) => {
  const start = script.indexOf(`function ${name}`);
  if (start < 0) return "";
  const next = script.indexOf("\nfunction ", start + name.length + 9);
  return script.slice(start, next < 0 ? script.length : next);
};
const expectedArtAssets = [
  "Texture_CharacterFounderFullWalkSheet.png",
  "Texture_CharacterFounderThinningWalkSheet.png",
  "Texture_CharacterFounderBaldWalkSheet.png",
  "Texture_PropHomeComputer.png",
  "Texture_PropHomePlanningBoard.png",
  "Texture_PropHomeCalendar.png",
  "Texture_PropHomeFridge.png",
  "Texture_PropHomeExitDoor.png",
  "Texture_PropHomeShelf.png",
];
const exactAssetNames = readdirSync(new URL("./Assets/", import.meta.url));
const PaethPredictor = (left, up, upperLeft) => {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
};
const ReadPngInfo = (fileName) => {
  assert.ok(exactAssetNames.includes(fileName), `${fileName} must keep its exact Pages-safe filename`);
  const png = readFileSync(new URL(`./Assets/${fileName}`, import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${fileName} must be a PNG`);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(png[24], 8, `${fileName} must use 8-bit channels`);
  assert.equal(png[25], 6, `${fileName} must retain RGBA transparency`);
  assert.equal(png[28], 0, `${fileName} must remain non-interlaced for deterministic decoding`);

  const idatChunks = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const chunkLength = png.readUInt32BE(offset);
    const chunkType = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (chunkType === "IDAT") idatChunks.push(png.subarray(dataStart, dataEnd));
    offset = dataEnd + 4;
    if (chunkType === "IEND") break;
  }
  const decoded = inflateSync(Buffer.concat(idatChunks));
  const stride = width * 4;
  let sourceOffset = 0;
  let priorRow = Buffer.alloc(stride);
  let hasTransparentPixel = false;
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filter = decoded[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.allocUnsafe(stride);
    for (let byteIndex = 0; byteIndex < stride; byteIndex += 1) {
      const raw = decoded[sourceOffset];
      sourceOffset += 1;
      const left = byteIndex >= 4 ? row[byteIndex - 4] : 0;
      const up = priorRow[byteIndex];
      const upperLeft = byteIndex >= 4 ? priorRow[byteIndex - 4] : 0;
      const predictor = filter === 1 ? left
        : filter === 2 ? up
          : filter === 3 ? Math.floor((left + up) / 2)
            : filter === 4 ? PaethPredictor(left, up, upperLeft)
              : 0;
      row[byteIndex] = (raw + predictor) & 255;
    }
    for (let alphaIndex = 3; alphaIndex < stride; alphaIndex += 4) {
      if (row[alphaIndex] < 255) { hasTransparentPixel = true; break; }
    }
    priorRow = row;
  }
  assert.ok(hasTransparentPixel, `${fileName} must contain genuinely transparent pixels`);
  return { fileName, width, height, byteLength: png.length };
};
const artAssetInfo = expectedArtAssets.map(ReadPngInfo);
artAssetInfo.slice(0, 3).forEach(({ fileName, width, height }) => {
  assert.deepEqual([width, height], [2048, 768], `${fileName} must remain a four-frame 512x768 walk sheet`);
});
artAssetInfo.slice(3).forEach(({ fileName, width, height }) => {
  assert.ok(width >= 200 && height >= 200, `${fileName} must have production dimensions`);
});
assert.ok(
  artAssetInfo.reduce((total, asset) => total + asset.byteLength, 0) <= 4.5 * 1024 * 1024,
  "generated art must stay within the mobile download budget",
);
const referencedArtAssets = [...script.matchAll(/\.\/Assets\/(Texture_[A-Za-z0-9]+\.png)\?v=\$\{ART_CACHE_VERSION\}/g)]
  .map((match) => match[1]);
assert.deepEqual([...referencedArtAssets].sort(), [...expectedArtAssets].sort(), "each generated PNG needs exactly one source path");
const artCacheVersion = script.match(/const ART_CACHE_VERSION = "([^"]+)";/)?.[1];
assert.ok(artCacheVersion, "generated art needs an explicit cache version");
assert.match(html, new RegExp(`Style_Play\\.css\\?v=${artCacheVersion}`), "art and UI cache versions must stay synchronized");
assert.match(html, new RegExp(`Script_Play\\.mjs\\?v=${artCacheVersion}`), "art and gameplay cache versions must stay synchronized");

assert.deepEqual(
  ["homeComputer", "planningBoard", "homeCalendar", "talentCounter", "equipmentCounter"]
    .map((id) => {
      const point = ById(id);
      return [point.id, point.locationId, point.action];
    }),
  [
    ["homeComputer", "home", "computer"],
    ["planningBoard", "home", "direction"],
    ["homeCalendar", "home", "month"],
    ["talentCounter", "talent", "talent"],
    ["equipmentCounter", "talent", "equipment"],
  ],
  "computer work and leisure, direction, project calendar, recruitment, and equipment need distinct physical entry points",
);
assert.equal(ById("homeComputer").detail, "开发 / 游戏 / 发布", "the computer interaction must describe work, leisure, and release");
assert.equal(ById("planningBoard").detail, "团队方针 / 玩法提案", "the whiteboard interaction must describe team policy rather than module labor");

assert.deepEqual(
  ["bankStockCounter", "bankCounter"].map((id) => {
    const point = ById(id);
    return [point.id, point.locationId, point.kind, point.action];
  }),
  [
    ["bankStockCounter", "bank", "stockWindow", "stock"],
    ["bankCounter", "bank", "bank", "finance"],
  ],
  "stock trading and lending need two different physical bank counters",
);

const triggerBlock = script.match(/function TriggerInteraction\(\)[\s\S]*?function StartFoundingCeremony/)?.[0] || "";
assert.match(triggerBlock, /case "homeComputer": return OpenHomeComputerSheet\(\)/);
assert.match(triggerBlock, /case "planningBoard": return OpenDirectiveSheet\(\)/);
assert.match(triggerBlock, /case "homeCalendar": return OpenMonthSheet\(\)/);
assert.match(triggerBlock, /case "talentMarket": return OpenTalentSheet\(\)/);
assert.match(triggerBlock, /case "exit": return OpenTravelSheet\(\)/);
assert.match(triggerBlock, /case "stockWindow": return OpenStockSheet\(\)/);
assert.match(triggerBlock, /case "bank": return OpenBankSheet\(\)/);
assert.doesNotMatch(triggerBlock, /marketingPhone|OpenMarketPhoneSheet/, "the redundant physical phone must be removed");

const bankBlock = FunctionBlock("OpenBankSheet");
const stockWindowBlock = FunctionBlock("OpenStockSheet");
assert.doesNotMatch(bankBlock, /data-open-stock|GetStockAccountAccess|STOCK_OPTIONS/, "the loan counter must not contain stock services");
assert.doesNotMatch(bankBlock, /asset\.fatal|开发电脑/, "the loan counter must not offer the development computer as collateral");
assert.match(bankBlock, /COLLATERAL_OPTIONS\.filter\(\(asset\) => asset\.id !== "computer"\)/, "the visible pledge list must explicitly exclude the development computer");
assert.match(bankBlock, /data-redeem-collateral[\s\S]*RedeemCollateral/, "the loan counter must expose collateral redemption");
assert.match(bankBlock, /\{ mode: "bank" \}/, "the loan counter needs its own ledger-like surface");
assert.match(stockWindowBlock, /data-stock-unlock/, "the stock window must show the account-opening gate");
assert.match(stockWindowBlock, /data-stock-form/, "the stock window must own buy orders");
assert.match(stockWindowBlock, /\{ mode: "stockWindow" \}/, "the stock window needs its own market-terminal surface");

const staffBlock = FunctionBlock("OpenStaffSheet");
assert.doesNotMatch(staffBlock, /data-customize|OpenCustomizationSheet\(staffId\)/, "staff chat must not duplicate the project-direction button");
assert.match(staffBlock, /制作方针与玩法提案统一在墙上白板处理/);

const talentBlock = FunctionBlock("OpenTalentSheet");
assert.match(talentBlock, /\{ mode: "talentMarket" \}/, "the talent counter needs its own recruitment-wall surface");
assert.match(talentBlock, /TalentAvatarHtml\(/, "every talent flyer must carry an animated identity avatar");
assert.match(talentBlock, /data-staff-action="hire"/, "recruitment flyers must keep a direct hire control");
assert.match(talentBlock, /TalentStatWidth\(/, "flyers must surface module abilities as readable bars and numbers");

const directiveBlock = script.match(/function OpenDirectiveSheet[\s\S]*?function RevenueChart/)?.[0] || "";
assert.match(directiveBlock, /data-feature-source/, "the project whiteboard owns the feature-proposal entry");
assert.match(directiveBlock, /OpenFeatureSourceSheet\(\)/);
assert.match(directiveBlock, /state\.project\.age < 1/, "advanced direction controls stay hidden during the first development month");
assert.match(directiveBlock, /\{ mode: "whiteboard" \}/, "project direction must open on the physical whiteboard surface");
assert.match(directiveBlock, /墙上白板 · 制作方针/, "the board must frame the choice as a production policy rather than another work allocation");
assert.match(directiveBlock, /class="whiteboardFocus"[^>]*>[\s\S]*?当前团队方针[\s\S]*?currentDirective\.description[\s\S]*?currentDirective\.effect/, "the board must explain the active policy in plain language and concrete terms");
assert.match(directiveBlock, /aria-pressed="\$\{state\.selectedDirective === directive\.id\}"/, "direction notes need a programmatic selected state");
assert.match(directiveBlock, /class="whiteboardAction"[\s\S]*?选这个 →/, "direction notes must carry a persistent action cue");
assert.match(directiveBlock, /directive\.description[\s\S]*directive\.effect/, "direction cards must explain their plain-language purpose and concrete outcome");
assert.match(directiveBlock, /WhiteboardLegendHtml\(\)/, "the board must replace decorative marker bars with a labeled legend");
assert.doesNotMatch(directiveBlock, /data-energy-module|PerformOwnerTask|亲自开发/, "the whiteboard must not contain the founder's immediate work loop");

const releaseBlock = script.match(/function OpenReleaseSheet[\s\S]*?function GetMonthCloseActions/)?.[0] || "";
assert.match(releaseBlock, /\{ mode: "whiteboard" \}/, "release review must remain on the physical project whiteboard");
assert.doesNotMatch(releaseBlock, /mode: "computer"/, "release review must keep its dedicated review surface");

const featureSourceBlock = script.match(/function OpenFeatureSourceSheet[\s\S]*?function OpenHomeComputerSheet/)?.[0] || "";
assert.doesNotMatch(featureSourceBlock, /mode: "computer"/, "the project whiteboard must not reuse the computer surface");
assert.match(featureSourceBlock, /mode: "whiteboard"/, "proposal ownership must stay on the physical whiteboard surface");
assert.match(featureSourceBlock, /点选便签继续/, "proposal-owner notes must state their interaction");
assert.match(featureSourceBlock, /class="whiteboardAction"[^>]*aria-hidden="true">点选 →/, "proposal-owner notes need a persistent action cue");
assert.match(script, /function WhiteboardLegendHtml\(\)[\s\S]*?普通操作[\s\S]*?代价[\s\S]*?当前选择[\s\S]*?暂不可用/, "the former unlabeled marker bars must become a useful color legend");
assert.doesNotMatch(script, /whiteboardMarkerSet/, "unexplained marker props must leave every whiteboard screen");

const computerBlock = script.match(/function OpenHomeComputerSheet[\s\S]*?function OpenWorkstationSheet/)?.[0] || "";
assert.match(computerBlock, /GetOwnerEnergyLimit\(state\)[\s\S]*?老板本月可用精力[\s\S]*?computerEnergySlots/, "the computer must make remaining and total owner energy visually explicit");
assert.match(computerBlock, /data-owner-undo[\s\S]*?UndoOwnerTask\(state\)/, "the computer must allow the most recent owner task to be fully undone");
assert.match(computerBlock, /data-computer-game[\s\S]*?OpenComputerGameSheet\(\)/, "the computer must expose the requested anxiety-relief game");
assert.match(computerBlock, /data-energy-module/, "the development computer must retain module-targeted owner work");
assert.match(computerBlock, /data-computer-release[\s\S]*?OpenReleaseSheet\(\)/, "publishing must remain reachable from the computer");
assert.match(computerBlock, /白板方针[^。]*月底[^。]*全组/, "the computer must contrast immediate owner work with the team-wide whiteboard policy");
assert.match(computerBlock, /PerformOwnerTask\(state, moduleKey\)/, "a computer module choice must execute the founder's work action");
assert.doesNotMatch(computerBlock, /SelectDirective|data-directive-id/, "the computer must not duplicate team policy selection");
assert.doesNotMatch(
  computerBlock,
  /data-computer-action|OpenDirectiveSheet\(|OpenMonthSheet\(|OpenTalentSheet\(/,
  "direction, settlement, and recruitment must never return to the development computer",
);

const projectCalendarBlock = script.match(/function GetProjectCalendarReminders[\s\S]*?function OpenHelpSheet/)?.[0] || "";
const helpBlock = script.match(/function OpenHelpSheet[\s\S]*?function RenderEnding/)?.[0] || "";
assert.match(projectCalendarBlock, /PROJECT CALENDAR/);
assert.match(projectCalendarBlock, /项目日历/);
assert.match(projectCalendarBlock, /state\.project\.isReleased/, "store information must remain hidden before launch");
assert.match(projectCalendarBlock, /商店评分/);
assert.match(projectCalendarBlock, /事件提醒/);
assert.match(projectCalendarBlock, /activeLiveEvents/);
assert.match(projectCalendarBlock, /lastSettlement\?\.finance\?\.appliedEvents/, "the calendar must retain one-month event reminders");
assert.match(projectCalendarBlock, /FindDirective\(state\.selectedDirective\)/, "month close must read the persistent policy that is about to settle");
assert.match(projectCalendarBlock, /制作方针[\s\S]*?currentDirective\?\.name[\s\S]*?currentDirective\?\.description/, "month close must remind the player which team policy remains active");
assert.match(helpBlock, /牛马 486[\s\S]*开发、撤回、玩游戏和发布[\s\S]*足浴当月 \+1/, "help must explain the computer's work and leisure loop");
assert.match(helpBlock, /团队方针[\s\S]*墙上白板选择，月底影响全组/, "help must explain the policy's long-horizon effect");
assert.doesNotMatch(`${script}\n${css}`, /marketingPhone|OpenMarketPhoneSheet|OpenMarketingSheet|MARKETING PHONE|\.marketPhone\b/, "the removed phone must leave no player-facing implementation behind");

assert.equal([...script.matchAll(/\bTravelWorld\(/g)].length, 1, "only the exit travel flow may call TravelWorld");
const sceneSyncBlock = script.match(/function SyncActiveLocationScene[\s\S]*?function BuildCeremonyScene/)?.[0] || "";
const travelSheetBlock = script.match(/function OpenTravelSheet[\s\S]*?function TravelTo/)?.[0] || "";
const travelToBlock = script.match(/function TravelTo[\s\S]*?function TriggerInteraction/)?.[0] || "";
const beginWorldBlock = script.match(/function BeginWorld[\s\S]*?function OpenTravelSheet/)?.[0] || "";
const monthSheetBlock = script.match(/function OpenMonthSheet[\s\S]*?function OpenHelpSheet/)?.[0] || "";
const overlayBlock = FunctionBlock("IsOverlayOpen");
const buildRoomBlock = FunctionBlock("BuildRoom");
const facilityBlock = FunctionBlock("BuildFacility");
const monthSnapshotBlock = FunctionBlock("CaptureMonthMontageSnapshot");
const monthSceneBlock = FunctionBlock("BuildMonthMontageScenes");
const monthMontageBlock = FunctionBlock("PlayMonthMontage");
const monthSceneConfigBlock = script.slice(script.indexOf("const MONTH_MONTAGE_FOOD_SCENES"), script.indexOf("function CaptureMonthMontageSnapshot"));
const monthMontageTag = html.match(/<[^>]*\bid="monthMontage"[^>]*>/)?.[0] || "";
const monthDayMilliseconds = Number(script.match(/const MONTH_MONTAGE_DAY_MS = (\d+);/)?.[1]);
assert.match(monthMontageTag, /class="[^"]*monthMontage/, "the month transition needs a stable full-screen overlay hook");
assert.match(monthMontageTag, /aria-live="polite"/, "the non-interactive montage must announce its accelerated progress without stealing focus");
assert.match(facilityBlock, /kind === "homeComputer"/, "the interactive computer must retain a physical room prop");
assert.match(buildRoomBlock, /WorldInteractions\.forEach\(BuildFacility\)/, "the interactive computer must be built from the world interaction catalog");
assert.doesNotMatch(buildRoomBlock, /homeComputerProp/, "the computer must not be duplicated as a second decorative prop");
assert.match(script, /const MONTH_MONTAGE_DAYS = 28;/, "each month montage must represent exactly twenty-eight days");
assert.match(script, /const MONTH_MONTAGE_DAY_MS = \d+;/, "the accelerated day cadence needs one explicit timing constant");
assert.ok(monthDayMilliseconds >= 220, "the month montage must leave enough time to read its animated details");
assert.match(overlayBlock, /dom\.monthMontage/, "the full-screen montage must suppress world input while it is active");
assert.match(monthSnapshotBlock, /state\.ownerWorkCount/, "the montage snapshot must remember whether the owner developed this month");
assert.match(monthSnapshotBlock, /ownerHairAmount:\s*GetOwnerHairAmount\(state\.anxiety\)/, "the montage must use the current protagonist hair state");
assert.match(monthSnapshotBlock, /state\.foodPlan/, "the montage snapshot must remember the selected eating plan");
assert.match(monthSnapshotBlock, /state\.relaxationHistory/, "the montage snapshot must use actual relaxation visits");
assert.match(monthSnapshotBlock, /entry\.month === (?:state\.month|settledMonth)/, "relaxation scenes must be limited to visits from the month being closed");
assert.match(monthMontageBlock, /classList\.toggle\("hasOwnerWork", snapshot\.ownerWorked\)/, "the protagonist's coding pose must depend on actual owner work");
assert.match(monthSceneBlock, /snapshot\.foodPlan/, "meal scenes must depend on the player's selected eating plan");
assert.match(monthSceneBlock, /snapshot\.relaxation/, "footbath scenes must depend on actual venue history");
assert.match(monthSceneBlock, /if \(food\)/, "an absent or skipped meal must not fabricate an eating scene");
assert.match(monthSceneBlock, /if \(relaxation\)/, "a month without a footbath visit must not fabricate one");
assert.match(monthSceneConfigBlock, /leftovers[\s\S]*snack[\s\S]*sustenance[\s\S]*feast/, "every real eating choice except skipping must map to its selected place");
assert.doesNotMatch(monthSceneConfigBlock, /\bskip\s*:/, "skipping food must produce no eating montage");
assert.match(monthSceneConfigBlock, /regularFootbath[\s\S]*footbathCity[\s\S]*maleModelClub/, "every footbath venue must preserve its actual location in the montage");
assert.match(monthMontageBlock, /MONTH_MONTAGE_DAYS/, "montage playback must consume the exact twenty-eight-day contract");
assert.match(monthMontageBlock, /MONTH_MONTAGE_DAY_MS/, "montage playback must use the accelerated day cadence");
assert.match(monthMontageBlock, /for \(let day = 1; day <= MONTH_MONTAGE_DAYS; day \+= 1\)/, "playback must render every one of the twenty-eight day/night changes");
assert.match(monthMontageBlock, /dataset\.ownerArt = GetFounderArtStage\(ownerHairAmount\)/, "the montage must select the same generated founder stage as the playable protagonist");
assert.match(html, /id="montageDate"[^>]*>[\s\S]*?id="montageDayValue"/, "the day must occupy the montage header's central date display");
assert.match(css, /\.montageDate\s*\{[^}]*justify-self:center;[^}]*justify-content:center;/s, "the enlarged montage date must be centered rather than left or right aligned");
assert.match(css, /\.montageDate b\s*\{[^}]*clamp\(46px,7vw,82px\)/s, "the montage day number must remain the strongest header element");
assert.match(css, /\.monthMontageStage\s*\{[^}]*width:min\(1040px,89vw,calc\(68vh \* 1040 \/ 570\)\);[^}]*aspect-ratio:1040\/570;/s, "the montage stage must preserve its authored 1040:570 ratio when either viewport axis constrains it");
assert.equal([...html.matchAll(/class="montageOwner\s+montage(?:Work|Transit|Food|Relax)Owner"/g)].length, 4, "each montage scene must contain the generated playable protagonist");
assert.match(html, /montageOwnerArt full[\s\S]*montageOwnerArt thinning[\s\S]*montageOwnerArt bald/, "the montage must preserve all three live founder art stages");
assert.match(css, /Texture_CharacterFounderFullWalkSheet\.png[\s\S]*Texture_CharacterFounderThinningWalkSheet\.png[\s\S]*Texture_CharacterFounderBaldWalkSheet\.png/, "the montage must directly reuse the playable founder sprite sheets");
assert.match(html, /montageHomeShelfArt[\s\S]*montageRoomWindow[\s\S]*montageHomeBoardArt[\s\S]*montageHomeComputerArt/, "the coding scene must reuse recognizable props from the current home");
assert.match(css, /Texture_PropHomeShelf\.png[\s\S]*Texture_PropHomePlanningBoard\.png[\s\S]*Texture_PropHomeComputer\.png/, "montage home props must use the same generated assets as the playable room");
assert.match(html, /montageCodeTrack[\s\S]*montageCodeLoop[\s\S]*requestAnimationFrame\(loop\)/, "the home monitor must contain continuous detailed code rather than static bars");
assert.match(css, /\.montageCodeTrack\s*\{[^}]*animation:montageCodeScroll/s, "the monitor code must keep scrolling throughout the montage");
assert.doesNotMatch(`${html}\n${script}\n${css}`, /一个月，压成几秒|monthMontageFooter|montageActionLabel|montagePlaceLabel|montageCoder|montageWalker|montageEater|montageSoaker/, "the rejected slogan, action strip, and generic montage people must stay removed");
const captureIndex = monthSheetBlock.indexOf("CaptureMonthMontageSnapshot(");
const advanceIndex = monthSheetBlock.indexOf("AdvanceMonth(state)");
const playIndex = monthSheetBlock.indexOf("await PlayMonthMontage(");
const resultIndex = monthSheetBlock.indexOf("ShowMonthResult(result)");
assert.ok(captureIndex >= 0 && captureIndex < advanceIndex, "the current-month montage snapshot must be captured before AdvanceMonth clears monthly state");
assert.ok(advanceIndex >= 0 && advanceIndex < playIndex, "month settlement must finish before the montage begins");
assert.ok(playIndex >= 0 && playIndex < resultIndex, "the month result must wait for the full montage to finish");
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
assert.match(html, /<title>做游戏真的会死<\/title>/, "the browser title should use the game name only");
assert.match(html, /<h1><span>做游戏<\/span><span>真的会死<\/span><\/h1>/, "the title screen should lead with the game name only");
assert.match(html, /class="titleMonitor"[^]*?<em>牛马 486<\/em>/, "the title-screen computer must use the in-world 牛马 486 branding");
assert.doesNotMatch(html, /OVERTIME 486/, "the rejected English computer branding must not return");
assert.doesNotMatch(`${html}\n${css}`, /进入\s*2\.5D|2\.5D\s+FOUNDING|灯会亮/, "the title screen should use normal player-facing language");
assert.doesNotMatch(html, /id="phoneButton"/, "market decisions must not be available from a global HUD shortcut");
assert.match(html, /id="settlementButton"[^>]*>[\s\S]*?下一回合/, "the primary next-turn action must stay visible in the global bottom-right HUD");
assert.match(script, /dom\.settlementButton\.addEventListener\("click"[\s\S]*?OpenMonthSheet\(\)/, "the global next-turn button must open the same project calendar sheet as the wall calendar");
assert.doesNotMatch(script, /event\.code === "KeyM"|marketingPhone|OpenMarketPhoneSheet|OpenMarketingSheet|dom\.phoneButton/, "the removed phone must not gain a global or physical shortcut");
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
const flatHumanBlock = script.match(/function BuildFlatHumanActor[\s\S]*?function ApplyOwnerHairAmount/)?.[0] || "";
const ownerHairBlock = script.match(/function ApplyOwnerHairAmount[\s\S]*?function BuildAiActor/)?.[0] || "";
assert.match(flatHumanBlock, /const BuildPaperHand =/, "flat humans need a deliberate palm-and-thumb silhouette");
assert.doesNotMatch(flatHumanBlock, /CircleGeometry\(width \* \.62/, "hand size must not inherit mismatched arm widths");
assert.match(flatHumanBlock, /handSide: "left"[\s\S]*handSide: "right"/, "left and right hand silhouettes must be mirrored intentionally");
assert.match(flatHumanBlock, /raggedCuff: owner/, "the founder needs torn cuffs and exposed forearms");
assert.match(flatHumanBlock, /OwnerClothingWear/, "the founder needs visible repairs and cloth tears");
assert.match(flatHumanBlock, /upperBodyRig\.name = "UpperBodyRig"[\s\S]*upperBodyRig\.attach\(child\)/, "the head, clothes, torso, and arms must share one upper-body rig for hunger posture");
assert.match(flatHumanBlock, /upperBodyRig\.attach\(child\)[\s\S]*mouth\.userData\.baseY = mouth\.position\.y/, "mouth animation must store its post-attach local baseline");
assert.match(ownerHairBlock, /GetOwnerHairAmount\(state\.anxiety\)/, "the founder's hair amount must follow current anxiety");
assert.doesNotMatch(ownerHairBlock, /state\.month|project\.age/, "hair loss must no longer follow time spent making games");
assert.match(ownerHairBlock, /hair\.scale\.set[\s\S]*thinningHair[\s\S]*scalpShine\.material\.opacity/, "hair, loose tufts, and scalp shine must respond continuously to anxiety");
assert.match(ownerHairBlock, /thinningHair\.visible = true[\s\S]*scalpShine\.visible = true/, "hair tufts and scalp shine must fade continuously without visibility thresholds");
assert.doesNotMatch(ownerHairBlock, /(?:thinningHair|scalpShine)\.visible\s*=\s*(?:hairAmount|tuftStrength)/, "continuous hair changes must not jump at a visibility threshold");
assert.doesNotMatch(rules, /GetOwnerHair(?:Stage|Amount)\(state\.month\)/, "monthly settlement must not drive the founder's hair");
assert.doesNotMatch(`${script}\n${rules}`, /GetOwnerHairStage|OWNER_HAIR_STAGES|ApplyOwnerHairStage|hairStage|连续做游戏满一年|发际线正式进入抢先体验|彻底秃/, "the retired month-driven hair stages and messages must stay removed");
assert.match(script, /function LoadArtTextures\([^)]*\)[\s\S]*?Promise\.all/, "generated character and prop art must preload together");
assert.match(script, /function AttachFounderSprites[\s\S]*?proceduralFallback/, "the generated founder needs a procedural load-failure fallback");
assert.match(script, /SetFounderSpriteFrame\(playerActor, spriteFrame\)/, "the founder walk sheet must advance during play");
assert.match(ownerHairBlock, /SetFounderSpriteStage\(playerActor, GetFounderArtStage\(hairAmount\)\)/, "the generated hair image must follow anxiety-driven hair amount");
assert.match(script, /FacilityArtSpecs\[interaction\.id\][\s\S]*?proceduralFallback/, "generated home props must retain their interaction geometry fallback");
assert.match(script, /visualStyle = "absurd-orbit-assistant-v2"/, "AI actors must keep their broken-orbit visual identity");
const maleModelDancerBlock = script.match(/function BuildMaleModelDancer[\s\S]*?function ApplyOwnerHairAmount/)?.[0] || "";
const maleModelRoomBlock = script.match(/const dancerSpecs = \[[\s\S]*?maleModelDancers\.push\(dancer\);[\s\S]*?\}\);/)?.[0] || "";
const footbathTherapistBlock = script.match(/function BuildFootbathTherapist[\s\S]*?function ApplyOwnerHairAmount/)?.[0] || "";
const cityHostessRoomBlock = script.match(/const hostessSpecs = \[[\s\S]*?footbathGreeters\.push\(therapist\);[\s\S]*?\}\);/)?.[0] || "";
const regularTherapistRoomBlock = script.match(/const regularTherapistSpecs = \[[\s\S]*?footbathGreeters\.push\(therapist\);[\s\S]*?\}\);/)?.[0] || "";
assert.match(maleModelDancerBlock, /torsoShape[\s\S]*necklace[\s\S]*sunglasses/, "male models need a distinct shirtless stage silhouette");
assert.match(maleModelDancerBlock, /visualStyle = "twisting-male-model-v1"/, "male models need an explicit visual identity");
assert.equal([...maleModelRoomBlock.matchAll(/\{ offset:/g)].length, 4, "the male-model club needs several visible performers");
assert.match(maleModelRoomBlock, /maleModelDancers\.push\(dancer\)/, "club performers must join the animation roster");
assert.ok([...maleModelRoomBlock.matchAll(/z: (\.[0-9]+)/g)].every((match) => Number(match[1]) >= .6), "male models must stand in front of the lounge seats without clipping through them");
assert.match(script, /maleModelDancers\.forEach[\s\S]*parts\.hips\.rotation\.z[\s\S]*parts\.torso\.rotation\.y[\s\S]*parts\.leftArm\.rotation\.z/, "club performers must keep twisting hips, shoulders, and arms");
assert.match(footbathTherapistBlock, /bright-footbath-hostess-v1[\s\S]*ordinary-footbath-therapist-v1/, "premium and ordinary footbath greeters need distinct visual identities");
assert.match(footbathTherapistBlock, /ponytail[\s\S]*bun[\s\S]*longHair/, "the four city hostesses need visibly different hairstyles");
assert.equal([...cityHostessRoomBlock.matchAll(/\{ offset:/g)].length, 4, "footbath city must have exactly four standing female hostesses");
assert.match(cityHostessRoomBlock, /venueStyle: "city", presentation: "female"/, "every footbath-city greeter must be a female hostess");
assert.equal([...regularTherapistRoomBlock.matchAll(/\{ offset:/g)].length, 2, "the ordinary footbath must have exactly two standing therapists");
assert.match(regularTherapistRoomBlock, /presentation: "male"[\s\S]*presentation: "female"/, "the ordinary footbath must have one male and one female therapist");
assert.match(script, /footbathGreeters\.forEach[\s\S]*const wave[\s\S]*const bow[\s\S]*parts\.torso\.rotation\.x[\s\S]*raisedArm\.rotation\.z/, "footbath greeters must wave and bow while welcoming guests");
const sigilBlock = script.match(/function AddAbsurdLocationSigil[\s\S]*?function BuildLocationEnvironment/)?.[0] || "";
const bankEnvironmentBlock = script.match(/function BuildLocationEnvironment[\s\S]*?function BuildRoom/)?.[0] || "";
assert.match(script, /function AddAbsurdLocationSigil\(/, "non-bank rooms may retain location-specific abstract details");
assert.doesNotMatch(sigilBlock, /location\.id === "bank"/, "the meaningless eye-like wall sigil must be deleted from the bank");
assert.match(script, /const sigil = location\.id === "bank" \? null : AddAbsurdLocationSigil/, "the bank must never instantiate a generic abstract sigil");
assert.match(bankEnvironmentBlock, /const stockZoneX[\s\S]*const loanZoneX[\s\S]*const vaultX/, "the bank environment must visually separate stock, lending, and vault zones");

const homeWindowCycleSeconds = Number(script.match(/const HOME_WINDOW_DAY_NIGHT_SECONDS = (\d+);/)?.[1]);
const homeWindowBuilderBlock = script.match(/function BuildHomeWindowDayNight[\s\S]*?function UpdateHomeWindowDayNight/)?.[0] || "";
const homeWindowUpdateBlock = script.match(/function UpdateHomeWindowDayNight[\s\S]*?function AddWallClock/)?.[0] || "";
const hungerPoseBlock = script.match(/function ApplyHungerPose[\s\S]*?function ResizeScene/)?.[0] || "";
const animateBlock = script.match(/function Animate\(\)[\s\S]*?\/\/ Compact world interactions/)?.[0] || "";
assert.ok(homeWindowCycleSeconds >= 180, "the home-window day/night loop must remain deliberately slow");
assert.match(homeWindowBuilderBlock, /sun[\s\S]*moon[\s\S]*stars[\s\S]*buildingWindows/, "the home window needs distinct celestial and skyline layers");
assert.match(homeWindowUpdateBlock, /Math\.sin\(solarAngle\)[\s\S]*SmoothStep[\s\S]*sky\.material\.color[\s\S]*buildingWindow\.material\.emissiveIntensity/, "the home skyline must blend continuously from daylight into a lit night");
assert.doesNotMatch(homeWindowUpdateBlock, /new THREE\./, "the per-frame home-window update must reuse its visual objects and colors");
assert.equal([...script.matchAll(/homeWindowVisual = BuildHomeWindowDayNight\(/g)].length, 1, "only the home scene may construct the day/night window");
assert.match(animateBlock, /const time = clock\.elapsedTime;[\s\S]*UpdateHomeWindowDayNight\(time\)/, "the window cycle must follow global elapsed time instead of resetting on travel");
assert.match(hungerPoseBlock, /upperBodyRig[\s\S]*leftKnee[\s\S]*rightKnee[\s\S]*leftArm[\s\S]*rightArm[\s\S]*mouth/, "hunger must combine a unified upper-body hunch, bent knees, a stomach hold, and a hand-to-mouth gesture");
assert.match(hungerPoseBlock, /mouth\.position\.y = parts\.mouth\.userData\.baseY/, "the eating gesture must animate the mouth from its upper-body-rig local baseline");
assert.doesNotMatch(hungerPoseBlock, /new THREE\./, "the per-frame hunger pose must not allocate render objects");
assert.match(animateBlock, /GetHungerMovementMultiplier\(state\.hunger\)[\s\S]*moveSpeedMultiplier:[\s\S]*TickWorld\(/, "current hunger must scale the player's world movement every frame");
assert.match(animateBlock, /ApplyWalkPose\([\s\S]*ApplyHungerPose\(/, "the owner-only hunger pose must layer after the normal walk pose");

const anxietyPostFxBlock = script.match(/function RenderAnxietyPostFx\(\)[\s\S]*?function RenderHud\(\)/)?.[0] || "";
const anxietyPostFxCssStart = css.indexOf("/* Anxiety post-processing");
const anxietyPostFxCssEnd = css.indexOf("/* The whiteboard now owns", anxietyPostFxCssStart);
const anxietyPostFxCss = css.slice(anxietyPostFxCssStart, anxietyPostFxCssEnd);
assert.match(anxietyPostFxBlock, /Clamp\(\(anxiety - 55\) \/ 45, 0, 1\)/, "high anxiety must progressively drive the scene treatment");
assert.match(anxietyPostFxBlock, /Clamp\(\(anxiety - 90\) \/ 10, 0, 1\)/, "the strongest post-processing must be reserved for near-max anxiety");
assert.match(anxietyPostFxBlock, /classList\.toggle\("anxietyHigh"[\s\S]*classList\.toggle\("anxietyCritical"/, "the scene needs distinct high and critical anxiety states");
assert.match(anxietyPostFxCss, /\.gameRoot\.anxietyHigh #sceneCanvas[\s\S]*animation:\s*anxietySceneSway/, "high anxiety must make the world view sway and lose focus");
assert.match(anxietyPostFxCss, /\.gameRoot\.anxietyHigh \.sceneVignette::before[\s\S]*animation:\s*anxietyEdgeBreath/, "high anxiety must animate the black peripheral tunnel");
assert.match(anxietyPostFxCss, /@keyframes anxietyPeripheralDrift/, "critical peripheral color echo needs its own irregular drift");
assert.match(anxietyPostFxCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none !important/, "motion-sensitive players must keep a static, non-swaying anxiety treatment");
assert.doesNotMatch(anxietyPostFxCss, /\.gameHud|\.missionCard|\.modalLayer|\.resultLayer/, "anxiety motion must never shake HUD, text, or dialogs");

console.log("StudioSurvival interface separation contract test passed");
