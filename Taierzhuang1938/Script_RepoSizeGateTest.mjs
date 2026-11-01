// 仓库体积闸门（纯 Node，秒级）：滕县跟踪的文件不许贴到 GitHub 的单文件硬上限。
//
// GitHub 拒收 100 MiB 以上的文件，50 MiB 以上给警告；这个仓库没开 Git LFS，大模型直接进 Git。
// 2026-11-01 最大的三个 GLB 已经到 91.6 / 89.5 / 86.7 MiB，再修一版就推不上去，而推送被拒时
// 改动已经在本地提交里了，要拆提交才能救。所以在提交前拦：
//   · 任何跟踪文件 ≥ FAIL_MIB → 红（先减面 / 拆分 / 压图，或改走 LFS / 资产仓库）；
//   · ≥ WARN_MIB 的列出来，连同滕县跟踪总量一起打印，看得见在长。
//
//   node Taierzhuang1938/Script_RepoSizeGateTest.mjs

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const FAIL_MIB = 95;
export const WARN_MIB = 50;
const MIB = 1024 * 1024;

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const files = execFileSync("git", ["ls-files", "-z", "--", "Taierzhuang1938"], { cwd: repo, encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\0").filter(Boolean);
let total = 0;
const rows = [];
for (const file of files) {
  let size = 0;
  try { size = fs.statSync(path.join(repo, file)).size; } catch { continue; }   // 稀疏检出之外的文件不在盘上
  total += size;
  if (size >= WARN_MIB * MIB) rows.push({ file, mib: size / MIB });
}
rows.sort((a, b) => b.mib - a.mib);
const tooBig = rows.filter((r) => r.mib >= FAIL_MIB);
for (const r of rows) console.log(`${r.mib >= FAIL_MIB ? "FAIL" : "warn"} ${r.mib.toFixed(1)} MiB  ${r.file}`);
console.log(`[size] 滕县跟踪文件 ${files.length} 个，共 ${(total / 1024 / MIB).toFixed(2)} GiB；≥${WARN_MIB} MiB 的 ${rows.length} 个，≥${FAIL_MIB} MiB 的 ${tooBig.length} 个`);
if (tooBig.length) {
  console.error(`[size] 这些文件贴到了 GitHub 单文件上限（100 MiB）：先减面 / 拆分 / 压缩内嵌贴图，或改走 LFS / 资产仓库。`);
  process.exitCode = 1;
}
