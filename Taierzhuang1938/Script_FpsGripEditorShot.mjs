// 第一人称持枪检查固定出图：每件装备各拍一张玩家视角和一张右后外部检查视角。
// 面板、挂点标签、骨骼与残差线都保留，供人工判断“目标对不对”，不只看数值是否归零。
//
// 用法：
//   node Taierzhuang1938/Script_FpsGripEditorShot.mjs [输出目录] [--only=ZhongZheng,Grenade | --all]
// 默认只拍 ZhongZheng，输出到 Taierzhuang1938/_shots/FpsGripEditor/。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const args = process.argv.slice(2);
const outDir = path.resolve(args.find((value) => !value.startsWith("--"))
  || path.join(projectDir, "_shots", "FpsGripEditor"));
const onlyArg = args.find((value) => value.startsWith("--only="));
let weaponIds = onlyArg ? onlyArg.slice(7).split(",").filter(Boolean) : ["ZhongZheng"];
fs.mkdirSync(outDir, { recursive: true });

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  errors.push(`CONSOLE ${message.text().slice(0, 300)}`);
});

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?quality=high&scale=small&phase=5&menu=0`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 240000 });
  await page.click("#bootStart");
  await page.evaluate(() => window.Taierzhuang.StepFrames(30));
  await page.evaluate(() => {
    window.Taierzhuang.Debug.OpenEditor("firstPerson");
    window.Taierzhuang.StepFrames(20);
  });
  if (args.includes("--all")) {
    weaponIds = await page.evaluate(() => window.Taierzhuang.editor.active.Snapshot().supportedWeapons);
  }
  // 入口面板遮住左半画面，没有取证价值；工作面板必须保留。
  await page.addStyleTag({ content: ".edPanel.launcher,.edGear{display:none!important}" });

  for (const id of weaponIds) {
    const supported = await page.evaluate((weaponId) => {
      const T = window.Taierzhuang;
      const editor = T.editor.active;
      if (!editor.SetWeapon(weaponId)) return false;
      return true;
    }, id);
    if (!supported) throw new Error(`第一人称检查装备不存在或不支持：${id}`);

    for (const pose of ["hip", "ads", "sprint"]) {
      await page.evaluate(({ weaponId, pose }) => {
        const T = window.Taierzhuang;
        const editor = T.editor.active;
        editor.SetWeapon(weaponId);
        editor.SetPose(pose);
        editor.SetView("player");
        for (let frame = 0; frame < 90; frame += 1) editor.Update(1 / 60);
        T.StepFrames(2);
      }, { weaponId: id, pose });
      const playerPath = path.join(outDir, `FpsGrip_${id}_${pose}.png`);
      await page.screenshot({ path: playerPath });
      console.log(playerPath);
    }

    await page.evaluate(() => {
      const T = window.Taierzhuang;
      const editor = T.editor.active;
      editor.SetView("inspect");
      editor.SetInspectPreset("rightRear");
      T.StepFrames(30);
    });
    const inspectPath = path.join(outDir, `FpsGrip_${id}_InspectRightRear.png`);
    await page.screenshot({ path: inspectPath });
    console.log(inspectPath);

    const actions = await page.evaluate((weaponId) => {
      const T = window.Taierzhuang;
      const editor = T.editor.active;
      editor.SetWeapon(weaponId);
      const list = Object.keys(T.viewmodel.actionSpec || {});
      if (!["throwable", "melee"].includes(T.viewmodel.armPose?.family)) list.unshift("fire");
      return [...new Set(list)];
    }, id);
    for (const action of actions) {
      await page.evaluate(({ weaponId, action }) => {
        const T = window.Taierzhuang;
        const editor = T.editor.active;
        editor.SetWeapon(weaponId);
        editor.SetPose("hip");
        editor.SetView("player");
        for (let frame = 0; frame < 45; frame += 1) editor.Update(1 / 60);
        if (action === "bayonet") T.viewmodel.TriggerFixBayonet(true);
        else editor.Trigger(action);
        if (action === "fire") {
          for (let frame = 0; frame < 4; frame += 1) editor.Update(1 / 60);
        } else {
          let guard = 0;
          while (T.viewmodel.action && T.viewmodel.action.t < 0.5 && guard++ < 180) editor.Update(1 / 60);
        }
        T.StepFrames(1);
      }, { weaponId: id, action });
      const actionPath = path.join(outDir, `FpsGrip_${id}_Action_${action}.png`);
      await page.screenshot({ path: actionPath });
      console.log(actionPath);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
  server.close();
}
