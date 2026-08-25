// 开镜视野体检：五支枪逐一开镜，量**瞄准点上到底有没有东西挡着**。
//
// 为什么要单独一条：`Script_FixedCenterAimTest` 一直是绿的，因为它只验
// "sight 挂点投影到屏幕正中" —— 而那是 ADS 姿态**解出来的**，它必然为零，
// 等于在验一条恒等式。挂点本身摆错了地方（摆进机匣里、摆在弹匣正下方），
// 那条断言一个字都不会响。用户报的「有的枪右键放大有东西挡住准心」就是这么漏掉的。
//
// 这里改成量画面：抬头对着均匀天光开镜，数屏幕正中 41×41 像素里有多少是"暗的"。
// 天是亮的、枪是暗的，所以这个数就是"瞄准点被枪身糊住了多少"。闸门只看**上半窗**，
// 理由见 BLOCKED_LIMIT。2026-08-25 修之前的上半窗实测（820 是满值）：
// 捷克式 **820（整窗 1681 全糊死，端起来什么都看不见）** / 驳壳枪 **820** /
// 中正式 149 / 汉阳造 0 / 三八式 0。
//
// **必须等姿态收敛再量。** 换枪 + 开镜 + 抬头之后枪还在往位置上收，头几帧读到的是
// 半路上的画面（实测连续四帧 423 / 359 / 322 / 0）。第一版量早了，据此误判汉阳造与
// 三八式也要抬挂点，白改了两支枪。所以这里推 420 帧再连量六帧、取最坏的一帧。
//
// 用法：node Taierzhuang1938/Script_AdsSightTest.mjs

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

/**
 * 量的是**瞄准点上方那半个窗口**（41×20 = 820 像素）里有多少像素是枪。
 *
 * 为什么不是整个 41×41：准星、准星座、抱箍本来就在瞄准线**下面**，
 * 那是一副正常的照门/准星画面（捷克式修好之后准星尖正落在瞄准点上，
 * 底下那条托臂就吃掉整窗的 20%）。真正的病是"抬眼看出去是一堵钢"，
 * 而那种情况上半窗必然一起黑。改前实测上半窗：中正式 820/820 全黑。
 */
const BLOCKED_LIMIT = 60;
const GUNS = ["ZhongZheng", "HanYang", "Zb26", "Mauser96", "Type38"];

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

let failed = 0;
function Check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&quality=medium&scale=small`,
    { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.Taierzhuang?.state?.ready, { timeout: 240000 });

  const report = await page.evaluate((guns) => {
    const T = window.Taierzhuang;
    T.player.health = 100;
    T.player.spawnGrace = 99;
    T.state.spawnAccumulator = -1e6;                 // 别在量的中途补兵
    for (const s of T.ai.soldiers) {
      s.position.x += 900;
      s.body?.Teleport(s.position.x, s.position.y, s.position.z);
    }
    T.StepFrames(120);

    /**
     * 屏幕正中 41×41 里有多少像素是"暗的"。
     * 先推一帧再读回：绘制缓冲在同一个任务里还没被合成器清掉。
     */
    const Blocked = () => {
      T.StepFrames(1);
      const src = document.querySelector("canvas#view");
      const c = document.createElement("canvas");
      c.width = 41;
      c.height = 41;
      const g = c.getContext("2d");
      g.drawImage(src, Math.round(src.width / 2) - 20, Math.round(src.height / 2) - 20,
        41, 41, 0, 0, 41, 41);
      const d = g.getImageData(0, 0, 41, 41).data;
      let upper = 0, all = 0;
      for (let row = 0; row < 41; row += 1) {
        for (let col = 0; col < 41; col += 1) {
          const i = (row * 41 + col) * 4;
          if (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] >= 120) continue;
          all += 1;
          if (row < 20) upper += 1;                  // 第 20 行是瞄准点所在那一行
        }
      }
      return { upper, all };
    };

    const rows = {};
    for (const id of guns) {
      document.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));
      T.StepFrames(20);
      if (T.player.stance !== "stand") { T.Debug.Key("KeyZ"); T.StepFrames(60); }
      // 走真实换枪路径：currentWeapon、弹仓、视图模型、ADS 的 FOV 缩放一起换。
      T.interact.hooks.TakeWeapon(id, 5);
      T.StepFrames(120);
      // 架式武器（捷克式）不架两脚架不许开镜 —— 先趴下再按 T。
      if (T.viewmodel.weapon?.bipod && !T.player.bipod) {
        T.Debug.Key("KeyZ"); T.StepFrames(80);
        T.Debug.Key("KeyT"); T.StepFrames(90);
      }
      document.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }));
      T.player.pitch = 0.30;                         // 抬头看天：背景干净才量得准
      T.player.aimPitch = 0;
      T.StepFrames(420);
      // 连量六帧、每帧之间隔开推进：开镜姿态收敛之后枪仍在微微摇（呼吸摆动只被压小
      // 没被压死），只取一帧就可能正好赶在摆动的一端读出假的"干净"。取最坏那一帧。
      const shots = [];
      for (let k = 0; k < 6; k += 1) {
        shots.push(Blocked());
        T.StepFrames(22);
      }
      const first = shots.reduce((a, b) => (a.upper >= b.upper ? a : b));
      const second = shots.reduce((a, b) => (a.upper <= b.upper ? a : b));
      const vm = T.viewmodel;
      rows[id] = {
        ads: Number(T.player.ads.toFixed(3)),
        blocked: first.upper,                        // 四帧里最坏的一帧
        samples: shots.map((x) => x.upper),
        wholeWindow: shots.map((x) => x.all),
        sight: vm.rig?.sight
          ? { x: +vm.rig.sight.x.toFixed(3), y: +vm.rig.sight.y.toFixed(3), z: +vm.rig.sight.z.toFixed(3) }
          : null,
        crosshairOn: document.querySelector(".hudCrosshair").classList.contains("on"),
      };
    }
    return rows;
  }, GUNS);

  const screenshotPath = path.join(os.tmpdir(), "TaierzhuangAdsSight.png");
  await page.screenshot({ path: screenshotPath });
  console.log(JSON.stringify({ ...report, screenshotPath, errors }, null, 2));

  for (const id of GUNS) {
    const row = report[id];
    Check(`${id} 开镜到位`, row && row.ads > 0.9, `ads=${row?.ads}`);
    Check(`${id} 瞄准点上方没有被枪身糊住（≤ ${BLOCKED_LIMIT}/820）`,
      row && row.blocked <= BLOCKED_LIMIT,
      `上半窗 ${row?.samples?.join(" / ")}（整窗 ${row?.wholeWindow?.join(" / ")}）`);
    Check(`${id} 开镜时收起腰射准心`, row && row.crosshairOn === false);
  }
  Check("页面无运行时错误", errors.length === 0, errors.slice(0, 2).join(" | "));
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`\n开镜视野体检失败：${failed} 项。`);
  process.exit(1);
}
console.log("\n开镜视野体检全过。");
