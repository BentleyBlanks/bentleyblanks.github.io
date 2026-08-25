import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const browser = await LaunchBrowser();

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&phase=2&quality=high&scale=small`, {
    waitUntil: "load", timeout: 120000,
  });
  await page.waitForFunction(() => window.Taierzhuang?.nav && window.Taierzhuang?.battlefield?.objectives?.length === 4, null, { timeout: 180000 });
  await page.evaluate(() => window.Taierzhuang.StepFrames(120));
  const result = await page.evaluate(() => {
    const game = window.Taierzhuang;
    const stats = game.nav.Stats();
    const bounds = game.ai.insideWalls;
    const rows = [];
    for (const objective of game.battlefield.objectives) {
      game.nav.BeginFrame();
      const field = game.nav.FieldFor(objective.x, objective.z);
      let reach = 0;
      if (field) for (const distance of field.dist) if (distance >= 0) reach += 1;
      rows.push({
        id: objective.id,
        pct: +(reach / stats.open * 100).toFixed(1),
        inside: objective.x >= bounds.minX && objective.x <= bounds.maxX
          && objective.z >= bounds.minZ && objective.z <= bounds.maxZ,
      });
    }
    return { rows, worst: Math.min(...rows.map((row) => row.pct)) };
  });
  assert.ok(result.rows.every((row) => row.inside), `东关路标越界：${JSON.stringify(result.rows)}`);
  assert.ok(result.worst > 40, `东关导航最差仅 ${result.worst}%：${JSON.stringify(result.rows)}`);
  console.log(`Script_EastSuburbNavTest: ${result.rows.map((row) => `${row.id}=${row.pct}%`).join(" ")}`);
} finally {
  await browser.close();
  server.close();
}
