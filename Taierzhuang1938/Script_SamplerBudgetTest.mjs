// ===========================================================================
// Script_SamplerBudgetTest.mjs —— 采样器预算门禁（真浏览器，render 域）
//
// ## 它守的是哪条红线
// WebGL2 的片元着色器一次只能绑 `MAX_TEXTURE_IMAGE_UNITS` 个纹理单元
// （ANGLE-D3D11 上是 **16**）。超了之后**程序不链接**，日志只有一行
// `FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)`，
// 而 three 每帧照样 `useProgram` —— 症状是「那只材质整个不画 + 每帧一次 1282」，
// 而 `renderer.info` 一切正常、别的材质全对。
//
// 这条红线是**集成期**的坑：每个子系统（GTAO/SSIL、CSM+接触阴影、SSR、簇状光、
// 材质着色）单独跑都在预算内，合到一起才越线，所以各分支自己的回归口一条都抓不到。
// 于是有了这一份：它不看画面、只数**每个已链接程序里的 sampler 类型 uniform**。
//
// ## 断言
//   1. `renderer.info.programs` 里每一个程序都 `LINK_STATUS === true`；
//   2. 每个程序的 sampler uniform 数 ≤ `gl.getParameter(MAX_TEXTURE_IMAGE_UNITS)`；
//      （数组型 sampler 按 `getActiveUniform().size` 计，`sampler2D u[4]` 算 4 个）
//   3. 推 60 帧之后 `gl.getError() === 0`；
//   4. 页面没有 pageerror / console.error。
//
// ## 覆盖面
// low / medium / high / ultra × `gi=0|1` 共八次装载，跑的是**正片**
// （`?shot=1&phase=2`）—— 只有正片同时有静态墙材质、人物 GLB 材质、第一人称视模
// 材质、水面与破口材质；探针页缺后三样，而最挤的那份恰恰是视模。
// 每一档都会把「cacheKey → 采样器数」整张表打出来：调参的人要能一眼看到
// 当前最挤的是哪一只、离 16 还有多远。
//
// 用法：node Taierzhuang1938/Script_SamplerBudgetTest.mjs [--only=high] [--frames=60]
// 退出码即成败。
// ===========================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

const Arg = (name, fallback) => {
  const hit = process.argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const ONLY = Arg("only", "");
const FRAMES = Math.max(10, parseInt(Arg("frames", "60"), 10) || 60);

// 八个装载口。gi=1 是最挤的那一档（探针体图集多两张采样器），gi=0 是出厂默认。
const CASES = [];
for (const quality of ["low", "medium", "high", "ultra"]) {
  for (const gi of [0, 1]) {
    CASES.push({ name: `${quality}|gi=${gi}`, quality, gi });
  }
}
const cases = ONLY ? CASES.filter((c) => c.name.includes(ONLY)) : CASES;

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();

let failed = false;
const Report = (ok, name, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
};

/**
 * 在页面里数每个程序的采样器。
 *
 * 为什么不数 GLSL 源码里的 `uniform sampler2D` 行数：编译器会**剔掉没被用到的
 * uniform**，源码里声明了但被 `#if` 或死代码消掉的那些不占单元。只有
 * `getActiveUniform` 报出来的才是真正占单元的那一份 —— 驱动数的也是这一份。
 */
const COUNT_SAMPLERS = `(async () => {
  const T = window.Taierzhuang;
  const renderer = T.renderer;
  const gl = renderer.getContext();
  const maxUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
  // GLSL ES 3.00 的全部 sampler 类型（含整型/无符号整型与 shadow —— 簇表用的是
  // usampler2D，太阳阴影用的是 sampler2DShadow，漏掉任何一类都会少数几个）。
  const SAMPLER_TYPES = new Set([
    gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE,
    gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_ARRAY_SHADOW,
    gl.SAMPLER_CUBE_SHADOW,
    gl.INT_SAMPLER_2D, gl.INT_SAMPLER_3D, gl.INT_SAMPLER_CUBE, gl.INT_SAMPLER_2D_ARRAY,
    gl.UNSIGNED_INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_3D,
    gl.UNSIGNED_INT_SAMPLER_CUBE, gl.UNSIGNED_INT_SAMPLER_2D_ARRAY,
  ]);
  const rows = [];
  for (const entry of renderer.info.programs) {
    const program = entry.program;
    if (!program) continue;
    const linked = !!gl.getProgramParameter(program, gl.LINK_STATUS);
    let samplers = 0;
    const names = [];
    if (linked) {
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        if (!info || !SAMPLER_TYPES.has(info.type)) continue;
        samplers += info.size;                    // sampler2D u[4] 占 4 个单元
        names.push(info.size > 1 ? info.name + "x" + info.size : info.name);
      }
    }
    rows.push({
      name: entry.name || "(anon)",
      cacheKey: entry.cacheKey || "",
      linked,
      samplers,
      names,
      log: linked ? "" : String(gl.getProgramInfoLog(program) || "").slice(0, 200),
    });
  }
  return { maxUnits, rows };
})()`;

try {
  for (const item of cases) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(`PAGEERROR ${String(error).slice(0, 240)}`));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (/fonts\.(googleapis|gstatic)\.com/.test(message.location()?.url || "")) return;
      errors.push(`CONSOLE ${message.text().slice(0, 240)}`);
    });
    try {
      const url = `http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&phase=2&manual=1`
        + `&quality=${item.quality}&scale=small&gi=${item.gi}`;
      await page.goto(url, { waitUntil: "load", timeout: 180000 });
      await page.waitForFunction(() => window.Taierzhuang?.state?.ready, null, { timeout: 240000 });
      // 推够帧数：视模、人物、水面、破口材质要真的进过一次画面才会编出程序来。
      // 第一人称手与枪在 shot=1 下照常画，`?ads=` 不必带 —— 视模材质本来就在。
      await page.evaluate((frames) => window.Taierzhuang.StepFrames(frames, 1 / 60), FRAMES);
      const { maxUnits, rows } = await page.evaluate(COUNT_SAMPLERS);
      const glError = await page.evaluate(() => {
        const gl = window.Taierzhuang.renderer.getContext();
        let last = 0;
        for (let i = 0; i < 32; i++) { const e = gl.getError(); if (!e) break; last = e; }
        return last;
      });

      rows.sort((a, b) => b.samplers - a.samplers);
      // 表按补丁 key 归并：程序参数（uv 通道、雾、色彩空间…）会把同一份材质拆成
      // 十几行，看的人要的是「哪一类材质最挤」，不是每一份程序参数各一行。
      const groups = new Map();
      for (const row of rows) {
        const patchKey = row.cacheKey.split(",").pop() || "(无补丁)";
        const key = `${row.name}|${patchKey}`;
        const prev = groups.get(key);
        if (!prev || row.samplers > prev.samplers) groups.set(key, { ...row, patchKey });
      }
      console.log(`\n=== ${item.name} ===  MAX_TEXTURE_IMAGE_UNITS=${maxUnits}`
        + `  程序 ${rows.length} 个 / 材质×补丁 ${groups.size} 组`);
      const grouped = [...groups.values()].sort((a, b) => b.samplers - a.samplers);
      for (const row of grouped) {
        if (row.samplers < maxUnits - 3 && row.linked) continue;   // 只列贴着上限的
        const flag = !row.linked ? "  !! 未链接" : (row.samplers > maxUnits ? "  !! 超预算" : "");
        console.log(`  ${String(row.samplers).padStart(2)}  ${row.name}  [${row.patchKey}]${flag}`);
        if (row.names.length) console.log(`      ${row.names.join(" ")}`);
        if (!row.linked && row.log) console.log(`      ${row.log}`);
      }
      const worst = rows[0];
      const unlinked = rows.filter((row) => !row.linked);
      const over = rows.filter((row) => row.linked && row.samplers > maxUnits);
      Report(unlinked.length === 0, `${item.name} 全部程序链接成功`,
        unlinked.length ? unlinked.map((r) => `${r.name}[${r.cacheKey}] ${r.log}`).join(" / ") : `${rows.length} 个`);
      Report(over.length === 0, `${item.name} 采样器数 ≤ ${maxUnits}`,
        over.length
          ? over.slice(0, 4).map((r) => `${r.name} ${r.samplers}: ${r.names.join(",")}`).join(" / ")
          : `最挤的是 ${worst ? `${worst.name} ${worst.samplers}` : "(无程序)"}`);
      Report(rows.length > 0, `${item.name} 真的编出了程序`, `${rows.length} 个`);
      Report(glError === 0, `${item.name} ${FRAMES} 帧无 GL 错误`, `getError=${glError}`);
      Report(errors.length === 0, `${item.name} 页面无控制台报错`, errors.slice(0, 3).join(" | "));
    } finally {
      await page.close();
    }
  }
} catch (error) {
  Report(false, "采样器预算门禁抛异常", String(error).slice(0, 400));
} finally {
  await browser.close();
  server.close();
}

console.log(failed ? "\n采样器预算门禁：有失败项。" : "\n采样器预算全绿");
process.exit(failed ? 1 : 0);
