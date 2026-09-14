// Script_ProfileCli 的冒烟：真跑一次命令行剖析（小视口 / low 档 / 30 帧），
// 检查落盘 JSON 里该有的字段，再用 `--print` 把它读回来排表。
//
// 断的是**接线与口径**，不断毫秒数：headless 是软件光栅，数字没有意义；
// 这台机器上常年还有别的 agent 在跑浏览器，墙钟更不能当结论。所以只看
//   · 表头三项（整帧 / 主线程 / GPU）与分桶表真的有 key；
//   · 子桶（带斜杠的 key）与逐段 draw call 进了 JSON；
//   · 场景普查、事件（含新编译着色器程序数）在；
//   · `--print` 不起浏览器也能把同一份 JSON 排成同样的表。
//
// 它属于 tier 2 的「对机器敏感」那一档（perf 域），不进 quick / prepush 自动门禁。
// 用法：node Taierzhuang1938/Script_ProfileCliTest.mjs

import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const project = path.dirname(fileURLToPath(import.meta.url));
const label = "clitest";
const jsonPath = path.join(project, "_shots", "Profile", `Profile_${label}.json`);

let failed = 0;
const Check = (name, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

function Run(args, timeoutMs = 20 * 60 * 1000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: path.resolve(project, ".."), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

if (fs.existsSync(jsonPath)) fs.rmSync(jsonPath);

const cli = path.join(project, "Script_ProfileCli.mjs");
const run = await Run([cli, "--view=train", "--frames=30", "--quality=low",
  "--width=640", "--height=400", `--label=${label}`]);
if (run.code !== 0) {
  console.log(run.stdout.slice(-4000));
  console.log(run.stderr.slice(-2000));
}
Check("命令行跑完且退出码为 0", run.code === 0, `code=${run.code}`);
Check("终端打出了 CPU 表", run.stdout.includes("CPU · 主线程"));
Check("终端打出了 GPU 表", run.stdout.includes("GPU · 逐 pass"));
Check("终端打出了「GPU 读数是提交影子」的读法", run.stdout.includes("是提交时间的影子"));
Check("落盘了 JSON", fs.existsSync(jsonPath), jsonPath);

if (fs.existsSync(jsonPath)) {
  const snapshot = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const summary = snapshot.summary;
  Check("JSON 有机位与模式", snapshot.view === "train" && /StepFrames/.test(snapshot.mode || ""),
    `${snapshot.view} / ${snapshot.mode}`);
  Check("JSON 有 GPU 名与合成靶", !!snapshot.rendererName && !!snapshot.postTarget,
    `${snapshot.rendererName} / ${snapshot.postTarget}`);
  Check("采到了帧", summary && summary.frames > 10, `frames=${summary?.frames}`);
  Check("整帧与主线程都有数", summary.frame.avg > 0 && summary.cpuTotal.avg > 0,
    `frame=${summary.frame.avg} cpu=${summary.cpuTotal.avg}`);
  Check("浏览器侧那一行在", !!summary.browser);
  const cpuKeys = Object.keys(summary.cpu || {});
  Check("CPU 分桶有数", cpuKeys.length > 5, `keys=${cpuKeys.length}`);
  Check("CPU 子桶（带斜杠）进了 JSON", cpuKeys.some((key) => key.includes("/")),
    cpuKeys.filter((key) => key.includes("/")).slice(0, 6).join(","));
  Check("逐桶矩阵访问在", Object.keys(summary.cpuVisits || {}).length > 0);
  Check("逐段 draw call 在", Object.keys(summary.gpuCalls || {}).length > 0);
  Check("逐段三角形在", Object.keys(summary.gpuTris || {}).length > 0);
  Check("逐段提交 CPU 在", Object.keys(summary.gpuCpu || {}).length > 0);
  Check("事件里有新编译着色器程序数", typeof summary.events?.newPrograms === "number",
    `newPrograms=${summary.events?.newPrograms}`);
  Check("场景节点普查在", (snapshot.census?.total?.objects || 0) > 0,
    `objects=${snapshot.census?.total?.objects}`);

  const printed = await Run([cli, `--print=${jsonPath}`], 60 * 1000);
  Check("--print 读回同一份 JSON 且不起浏览器", printed.code === 0
    && printed.stdout.includes("CPU · 主线程") && printed.stdout.includes("GPU · 逐 pass"),
    `code=${printed.code}`);
  Check("--print 的表头与落盘的一致", printed.stdout.includes(`性能剖析 · ${label}`));
}

process.exit(failed ? 1 : 0);
