// Script_FirstLevelSpaceMap.mjs - draws the 01-06 space map (docs/Data_FirstLevelSpace0106_20260923.md) straight from
// the data tables and the static probe, renders it headless to _shots/Space0106/Map_New0106.png (not committed).
// Usage: node Taierzhuang1938/Script_FirstLevelSpaceMap.mjs   (template: Tool_FirstLevelSpaceMap.html)
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL, fileURLToPath } from "node:url";
const WT = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const U = (p) => pathToFileURL(WT + "Taierzhuang1938/" + p).href;
const L = await import(U("Data_FirstLevelMissionLayout.mjs"));
const M = await import(U("Data_FirstLevelMission.mjs"));
const F = await import(U("Data_FirstLevelMissionFront.mjs"));
const Ter = await import(U("Data_FirstLevelMissionTerrain.mjs"));
const Top = await import(U("Data_FirstLevelMissionTopology.mjs"));
const Fort = await import(U("Data_FirstLevelMissionFortifications.mjs"));
const Rt = await import(U("Data_FirstLevelFrontRoute.mjs"));
const Probe = await import(U("Script_FirstLevelSpaceProbe.mjs"));
const S = Rt.FRONT_SORTIE, SP = Rt.FRONT_SPACE, TP = Rt.FRONT_TANK_PATH;
const A = L.MISSION_ANCHORS, RT = L.MISSION_ROUTES, P = L.MISSION_PLACEMENT, E = M.MISSION_ENCOUNTERS;
const G = (x, z) => Ter.SampleMissionTerrain(x, z), N = (x, z) => Ter.SampleMissionNaturalHeight(x, z);
const EXT = { minX: -62, maxX: 118, minZ: -233, maxZ: -94 };
const step = .5, W = Math.round((EXT.maxX - EXT.minX) / step), H = Math.round((EXT.maxZ - EXT.minZ) / step);
const hg = new Float32Array(W * H), cut = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = EXT.minX + (i + .5) * step, z = EXT.minZ + (j + .5) * step; const g = G(x, z); hg[j * W + i] = g; cut[j * W + i] = g - N(x, z); }
const inExt = (b, m = 0) => b.x > EXT.minX - m && b.x < EXT.maxX + m && b.z > EXT.minZ - m && b.z < EXT.maxZ + m;
const pick = (list) => list.filter((b) => inExt(b, 5) && (b.w >= .3 || b.d >= .3) && !/BagSeam|Revetment|Duckboard|Post\d|Rail\d|Crossarm|Wire|Slat|Crown|Ridge$|Eave|RoofRidge|PoleArm/.test(b.id))
  .map((b) => ({ id: b.id, x: b.x, z: b.z, w: b.w, d: b.d, ry: b.ry || 0, top: +(b.y + b.h / 2 - G(b.x, b.z)).toFixed(2), sem: b.semantic }));
const lay = L.MISSION_LAYOUT;
const solids = lay.blocks.filter((b) => b.solid !== false && !lay.walkableSurfaces.some((s) => s.id === b.id));
const scen = lay.scenario.states.find((s) => s.id === "BunkerCollapsed").blocks.filter((b) => inExt(b));
const wire = Fort.MISSION_DEFENSE_OBJECTS.filter((o) => inExt(o) && /Wire/.test(o.asset)).map((o) => ({ x: o.x, z: o.z, ry: o.ry }));
const trenches = Ter.TrenchPlanFor().trenches.map((t) => ({ id: t.id, points: t.points.map((p) => ({ x: p.x, z: p.z })) }));
const roads = Ter.MISSION_TERRAIN.roads.map((r) => ({ points: r.points, width: r.width }));
const bgLanes = [...E.front.filter((s) => !s.hold), ...E.machineGun].map((s) => ({ id: s.id, pts: [{ x: s.x, z: s.z }, ...F.FrontAssaultLane(s.x, s.z)] }));
const fgLanes = F.FRONT_FLANK_GROUP.map((s) => ({ id: s.id, pts: [{ x: s.x, z: s.z }, ...s.lane] }));
const poles = lay.blocks.filter((b) => /^FrontRoadPole(\d+|Fork)$/.test(b.id)).map((b) => ({ x: b.x, z: b.z, lean: !!b.lean }));
const K = Object.fromEntries(Probe.ProbeKeyframes().map((k) => [k.id, { camera: { x: k.camera.x, z: k.camera.z }, bearing: -k.yawRad * 180 / Math.PI }]));
const len = (r) => +Probe.RouteLength(r).toFixed(1);
const data = { EXT, step, W, H, hg: Array.from(hg, (v) => +v.toFixed(2)), cut: Array.from(cut, (v) => +v.toFixed(2)),
  blocks: pick(solids), scen: pick(scen), wire, trenches, roads, poles, S, SP, TP, K,
  A: Object.fromEntries(["collection", "bunker", "bunkerDoor", "bunkerKilling", "bunkerRear", "rearCorner", "bunkerBend", "bunkerJunction", "bunkerFold", "bunkerCrater", "shunziDragged", "supportJunction", "frontObservation", "guardSafeZone", "gapJunction"].map((k) => [k, A[k]])),
  routes: { rearTrench: RT.rearTrench, support: RT.support, rearRoute: S.rearRoute, bundle: RT.bundle, attack: S.attackRoute, collectionReturn: Top.MISSION_STAGE_ROUTES.collectionReturn, left: S.leftRoute, southWalk: RT.south.slice(0, 3), roadLink: SP.roadLink, depthSap: Top.MISSION_BUNKER_DEPTH_SAP },
  guardRoutes: P.guardWithdrawalRoutes, guardPosts: F.FRONT_GUARD_POSTS, defenders: F.FRONT_DEFENDERS,
  bgLanes, fgLanes, officer: F.FRONT_OFFICER,
  enemies: { bunkerAssault: E.bunkerAssault, bunkerBackdrop: E.bunkerBackdrop, bunkerPursuit: E.bunkerPursuit, approach: E.approach, front: E.front, frontFlank: E.frontFlank, frontOfficer: E.frontOfficer,
    tank: E.tank, escortSlots: F.FRONT_TANK_ESCORT_SLOTS, bundleApproach: E.bundleApproach, reserveEntries: F.FRONT_RESERVE_ENTRIES, machineGun: E.machineGun },
  fire: F.FRONT_FIRE_POINTS, fireSteps: F.FRONT_FIRE_STEPS, roadblock: SP.roadblock, rcFrame: SP.rearCornerFrame,
  bunkerPlace: P.bunker, collectionPlace: P.collection,
  len: { rearTrench: len(RT.rearTrench), support: len(RT.support), rearRoute: len(S.rearRoute), bundle: len(RT.bundle), attack: len(S.attackRoute), collectionReturn: len(Top.MISSION_STAGE_ROUTES.collectionReturn), left: len(S.leftRoute), tank: len(TP) },
};
const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, "Tool_FirstLevelSpaceMap.html"), "utf8").replace("__DATA__", JSON.stringify(data));
const out = WT + "Taierzhuang1938/_shots/Space0106/Map_New0106.html"; fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html);
const target = WT + "Taierzhuang1938/_shots/Space0106/Map_New0106.png"; fs.mkdirSync(path.dirname(target), { recursive: true });
const { LaunchBrowser } = await import(pathToFileURL(WT + "PrairieFire1937/Script_BrowserTestKit.mjs").href);
const browser = await LaunchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1880, height: 1400 }, deviceScaleFactor: 1 });
  const errs = []; page.on("pageerror", (e) => errs.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(pathToFileURL(out).href); await page.waitForTimeout(800);
  const h = await page.evaluate(() => Math.max(document.getElementById("legend").getBoundingClientRect().bottom, document.getElementById("insetB").getBoundingClientRect().bottom) + 24);
  await page.setViewportSize({ width: 1880, height: Math.ceil(h) });
  await page.screenshot({ path: target, fullPage: true });
  console.log("errors", errs, "->", target);
} finally { await browser.close(); }
