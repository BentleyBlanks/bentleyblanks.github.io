import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

assert.equal(ById("homeComputer"), undefined, "the home computer must remain scenery rather than a world interaction");
assert.deepEqual(
  ["planningBoard", "homeCalendar", "talentCounter", "equipmentCounter"]
    .map((id) => {
      const point = ById(id);
      return [point.id, point.locationId, point.action];
    }),
  [
    ["planningBoard", "home", "direction"],
    ["homeCalendar", "home", "month"],
    ["talentCounter", "talent", "talent"],
    ["equipmentCounter", "talent", "equipment"],
  ],
  "the project board, calendar, recruitment, and equipment need distinct physical entry points",
);

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
assert.match(triggerBlock, /case "planningBoard": return OpenDirectiveSheet\(\)/);
assert.match(triggerBlock, /case "homeCalendar": return OpenMonthSheet\(\)/);
assert.match(triggerBlock, /case "talentMarket": return OpenTalentSheet\(\)/);
assert.match(triggerBlock, /case "exit": return OpenTravelSheet\(\)/);
assert.match(triggerBlock, /case "stockWindow": return OpenStockSheet\(\)/);
assert.match(triggerBlock, /case "bank": return OpenBankSheet\(\)/);
assert.doesNotMatch(triggerBlock, /homeComputer|OpenHomeComputerSheet/, "the decorative computer must never receive an interaction route");
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

const directiveBlock = script.match(/function OpenDirectiveSheet[\s\S]*?function RevenueChart/)?.[0] || "";
assert.match(directiveBlock, /data-owner-task/, "the project whiteboard must expose owner development tasks");
assert.match(directiveBlock, /PerformOwnerTask\(state,\s*[^)]+\)/, "owner development must execute from the project whiteboard");
assert.match(directiveBlock, /(?:MODULE_KEYS|moduleValues)\.map/, "the project whiteboard must render every development module");
assert.match(directiveBlock, /GetOwnerTaskAnxietyCost\(energyUsed\)[\s\S]*?焦虑依次 \+1 \/ \+2 \/ \+5/, "the board must preview escalating owner-work anxiety");
assert.match(directiveBlock, /GetOwnerRestRelief\(energyUsed\)[\s\S]*?result\.anxietyCost/, "the board must preview rest relief and report the actual work cost");
assert.match(directiveBlock, /data-directive-id[\s\S]*SelectDirective\(/, "project direction must remain selectable from the board");
assert.match(directiveBlock, /data-whiteboard-release[\s\S]*OpenReleaseSheet\(\)/, "publishing must move onto the project whiteboard");
assert.match(directiveBlock, /state\.project\.age < 1/, "advanced direction controls stay hidden during the first development month");
assert.match(directiveBlock, /\{ mode: "whiteboard" \}/, "project direction must open on the physical whiteboard surface");
assert.match(directiveBlock, /class="whiteboardFocus"[^>]*>[\s\S]*?本月计划[\s\S]*?currentDirective[\s\S]*?energyLeft/, "the board must elevate the active direction and remaining owner energy");
assert.match(directiveBlock, /aria-pressed="\$\{state\.selectedDirective === directive\.id\}"/, "direction notes need a programmatic selected state");
assert.match(directiveBlock, /class="whiteboardAction"[\s\S]*?点选 →/, "direction notes must carry a persistent action cue");
assert.doesNotMatch(directiveBlock, /data-feature|OpenFeatureSourceSheet|OpenCustomizationSheet/, "the board must not retain a gameplay-proposal entry");

const releaseBlock = script.match(/function OpenReleaseSheet[\s\S]*?function GetMonthCloseActions/)?.[0] || "";
assert.match(releaseBlock, /\{ mode: "whiteboard" \}/, "release review must remain on the physical project whiteboard");
assert.doesNotMatch(releaseBlock, /mode: "computer"/, "release review must never reopen the decorative computer");

assert.doesNotMatch(
  script,
  /function OpenCustomizationSheet|function OpenFeatureSourceSheet|function OpenHomeComputerSheet|function OpenWorkstationSheet|\bCustomizeProject\b|\bFEATURE_CHOICES\b|\bFEATURE_LIMIT\b|data-feature-source|data-feature-id/,
  "gameplay proposals and the interactive development computer must leave no player-facing implementation",
);
assert.doesNotMatch(`${html}\n${script}`, /玩法提案/u, "gameplay-proposal copy must be removed from every player-facing surface");

const projectCalendarBlock = script.match(/function GetProjectCalendarReminders[\s\S]*?function OpenHelpSheet/)?.[0] || "";
assert.match(projectCalendarBlock, /PROJECT CALENDAR/);
assert.match(projectCalendarBlock, /项目日历/);
assert.match(projectCalendarBlock, /state\.project\.isReleased/, "store information must remain hidden before launch");
assert.match(projectCalendarBlock, /商店评分/);
assert.match(projectCalendarBlock, /事件提醒/);
assert.match(projectCalendarBlock, /activeLiveEvents/);
assert.match(projectCalendarBlock, /lastSettlement\?\.finance\?\.appliedEvents/, "the calendar must retain one-month event reminders");
assert.doesNotMatch(`${script}\n${css}`, /marketingPhone|OpenMarketPhoneSheet|OpenMarketingSheet|MARKETING PHONE|\.marketPhone\b/, "the removed phone must leave no player-facing implementation behind");

assert.equal([...script.matchAll(/\bTravelWorld\(/g)].length, 1, "only the exit travel flow may call TravelWorld");
const sceneSyncBlock = script.match(/function SyncActiveLocationScene[\s\S]*?function BuildCeremonyScene/)?.[0] || "";
const travelSheetBlock = script.match(/function OpenTravelSheet[\s\S]*?function TravelTo/)?.[0] || "";
const travelToBlock = script.match(/function TravelTo[\s\S]*?function TriggerInteraction/)?.[0] || "";
const beginWorldBlock = script.match(/function BeginWorld[\s\S]*?function OpenTravelSheet/)?.[0] || "";
const monthSheetBlock = script.match(/function OpenMonthSheet[\s\S]*?function OpenHelpSheet/)?.[0] || "";
const overlayBlock = FunctionBlock("IsOverlayOpen");
const buildRoomBlock = FunctionBlock("BuildRoom");
const monthSnapshotBlock = FunctionBlock("CaptureMonthMontageSnapshot");
const monthSceneBlock = FunctionBlock("BuildMonthMontageScenes");
const monthMontageBlock = FunctionBlock("PlayMonthMontage");
const monthSceneConfigBlock = script.slice(script.indexOf("const MONTH_MONTAGE_FOOD_SCENES"), script.indexOf("function CaptureMonthMontageSnapshot"));
const monthMontageTag = html.match(/<[^>]*\bid="monthMontage"[^>]*>/)?.[0] || "";
assert.match(monthMontageTag, /class="[^"]*monthMontage/, "the month transition needs a stable full-screen overlay hook");
assert.match(monthMontageTag, /aria-live="polite"/, "the non-interactive montage must announce its accelerated progress without stealing focus");
assert.match(buildRoomBlock, /homeComputerProp/, "the removed computer interaction must leave its room prop visible");
assert.match(script, /const MONTH_MONTAGE_DAYS = 28;/, "each month montage must represent exactly twenty-eight days");
assert.match(script, /const MONTH_MONTAGE_DAY_MS = \d+;/, "the accelerated day cadence needs one explicit timing constant");
assert.match(overlayBlock, /dom\.monthMontage/, "the full-screen montage must suppress world input while it is active");
assert.match(monthSnapshotBlock, /state\.ownerWorkCount/, "the montage snapshot must remember whether the owner developed this month");
assert.match(monthSnapshotBlock, /state\.foodPlan/, "the montage snapshot must remember the selected eating plan");
assert.match(monthSnapshotBlock, /state\.relaxationHistory/, "the montage snapshot must use actual relaxation visits");
assert.match(monthSnapshotBlock, /entry\.month === (?:state\.month|settledMonth)/, "relaxation scenes must be limited to visits from the month being closed");
assert.match(monthSceneBlock, /snapshot\.ownerWorked/, "the rapid coding scene must depend on actual owner work");
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
assert.match(html, /<h1><span>做游戏真的会死<\/span><\/h1>/, "the title screen should lead with the game name only");
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
assert.match(script, /visualStyle = "absurd-orbit-assistant-v2"/, "AI actors must keep their broken-orbit visual identity");
const maleModelDancerBlock = script.match(/function BuildMaleModelDancer[\s\S]*?function ApplyOwnerHairAmount/)?.[0] || "";
const maleModelRoomBlock = script.match(/const dancerSpecs = \[[\s\S]*?maleModelDancers\.push\(dancer\);[\s\S]*?\}\);/)?.[0] || "";
assert.match(maleModelDancerBlock, /torsoShape[\s\S]*necklace[\s\S]*sunglasses/, "male models need a distinct shirtless stage silhouette");
assert.match(maleModelDancerBlock, /visualStyle = "twisting-male-model-v1"/, "male models need an explicit visual identity");
assert.equal([...maleModelRoomBlock.matchAll(/\{ offset:/g)].length, 4, "the male-model club needs several visible performers");
assert.match(maleModelRoomBlock, /maleModelDancers\.push\(dancer\)/, "club performers must join the animation roster");
assert.match(script, /maleModelDancers\.forEach[\s\S]*parts\.hips\.rotation\.z[\s\S]*parts\.torso\.rotation\.y[\s\S]*parts\.leftArm\.rotation\.z/, "club performers must keep twisting hips, shoulders, and arms");
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
const anxietyPostFxCss = css.slice(css.indexOf("/* Anxiety post-processing"));
assert.match(anxietyPostFxBlock, /Clamp\(\(anxiety - 55\) \/ 45, 0, 1\)/, "high anxiety must progressively drive the scene treatment");
assert.match(anxietyPostFxBlock, /Clamp\(\(anxiety - 90\) \/ 10, 0, 1\)/, "the strongest post-processing must be reserved for near-max anxiety");
assert.match(anxietyPostFxBlock, /classList\.toggle\("anxietyHigh"[\s\S]*classList\.toggle\("anxietyCritical"/, "the scene needs distinct high and critical anxiety states");
assert.match(anxietyPostFxCss, /\.gameRoot\.anxietyHigh #sceneCanvas[\s\S]*animation:\s*anxietySceneSway/, "high anxiety must make the world view sway and lose focus");
assert.match(anxietyPostFxCss, /\.gameRoot\.anxietyHigh \.sceneVignette::before[\s\S]*animation:\s*anxietyEdgeBreath/, "high anxiety must animate the black peripheral tunnel");
assert.match(anxietyPostFxCss, /@keyframes anxietyPeripheralDrift/, "critical peripheral color echo needs its own irregular drift");
assert.match(anxietyPostFxCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none !important/, "motion-sensitive players must keep a static, non-swaying anxiety treatment");
assert.doesNotMatch(anxietyPostFxCss, /\.gameHud|\.missionCard|\.modalLayer|\.resultLayer/, "anxiety motion must never shake HUD, text, or dialogs");

console.log("StudioSurvival interface separation contract test passed");
