// 02 hand-back in non-ideal orders (contract docs/Data_FirstLevel0105Refactor20260923Contract.md
// §2.1 and v1.1 ③: "the new gate needs a fallback too, never a deadlock").
//
//   node Taierzhuang1938/Script_OpeningHandbackBrowserTest.mjs [--variant=miss|hide|early|absent]
//
// Each variant cold-starts 02 (missionStage=2, a debug start, not a jump inside a run) and bends
// the LongShot beat: Liu Wencai misses / the junction man hides out of every line of sight / he is
// already dead / he is missing from the enemy table altogether. The director must still reach Released with ijaA and ijaB cut down, without
// teleports, and the real F pickup must still start the withdrawal. The ideal order is covered by
// Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-to=3.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { DriveHandbackNegative } from "./Script_FirstLevelCampaignOpening.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, "_shots", "OpeningHandback");
await fs.mkdir(output, { recursive: true });
const only = process.argv.find((arg) => arg.startsWith("--variant="))?.split("=")[1];
const variants = only ? [only] : ["miss", "hide", "early", "absent"];
const server = await ServeRoot(path.resolve(here, ".."), 0);
const browser = await LaunchBrowser();
const errors = [];
try {
  for (const variant of variants) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (error) => { errors.push(`${variant}: ${error}`); console.log("PAGEERROR", variant, String(error)); });
    await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?whitebox=p012&missionStage=2&shot=1&manual=1&quality=low&scale=small`,
      { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForFunction(() => window.Tengxian?.state?.ready, null, { timeout: 180000 });
    try { await DriveHandbackNegative(page, variant, output); }
    catch (error) { await page.screenshot({ path: path.join(output, `Failure_${variant}.png`) }).catch(() => {}); throw error; }
    await page.close();
  }
  if (errors.length) throw new Error("page errors: " + errors.join("\n"));
  console.log(`ok 02 hand-back never stalls: ${variants.join(", ")}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
