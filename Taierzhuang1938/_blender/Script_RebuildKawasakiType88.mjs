// One-aircraft rebuild. Uses the repository's managed Blender lifecycle and
// keeps editable source projects outside the GitHub Pages repository.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.argv.includes("--help")) {
  console.log("node Script_RebuildKawasakiType88.mjs [--detail high|game|both] [--stage shape|pbr] [--source-root <outside-repository-path>] [--python <executable>]");
  process.exit(0);
}
const values = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (!key.startsWith("--")) throw new Error(`Unexpected argument ${key}`);
  const value = process.argv[++i];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
  values.set(key.slice(2), value);
}
const sourceRoot = path.resolve(values.get("source-root") || "C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/KawasakiType88");
const sourceRelative = path.relative(repoRoot, sourceRoot);
if (!sourceRelative.startsWith("..") && !path.isAbsolute(sourceRelative)) throw new Error("Editable Blender sources must be outside the repository");
const bundledPython = path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe");
const python = values.get("python") || (fs.existsSync(bundledPython) ? bundledPython : "python");
const details = values.get("detail") === "both" || !values.has("detail") ? ["high", "game"] : [values.get("detail")];
const stage = values.get("stage") || "pbr";
if (!details.every(value => ["high", "game"].includes(value)) || !["shape", "pbr"].includes(stage)) {
  throw new Error("Use --detail high|game|both and --stage shape|pbr");
}
function Run(executable, args) {
  const result = spawnSync(executable, args, { cwd: repoRoot, stdio: "inherit", windowsHide: true,
    env: { ...process.env, PYTHONUTF8: "1" } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(executable)} exited ${result.status}`);
}
const scratch = path.join(repoRoot, "tmp/KawasakiType88/Rebuild");
fs.mkdirSync(scratch, { recursive: true });
if (stage === "pbr") Run(python, ["Taierzhuang1938/_blender/Script_KawasakiType88Surface.py", "--source-root", sourceRoot]);
for (const detail of details) {
  const argsFile = path.join(scratch, `Data_${detail}Args.json`);
  fs.writeFileSync(argsFile, JSON.stringify(["--repo-root", repoRoot, "--source-root", sourceRoot, "--stage", stage, "--detail", detail]));
  Run(process.execPath, ["scripts/Script_BlenderMcp.mjs", "start", "--batch", "Taierzhuang1938/_blender/Script_BuildKawasakiType88.py", "--batch-args", argsFile]);
  if (stage === "pbr") {
    const glb = detail === "high" ? path.join(sourceRoot, "Exports/Model_KawasakiType88High.glb")
      : path.join(repoRoot, "Taierzhuang1938/Model/KawasakiType88/Model_KawasakiType88.glb");
    Run(python, ["Taierzhuang1938/_blender/Script_KawasakiType88Pack.py", "--input", glb]);
    if (detail === "high") fs.copyFileSync(glb, path.join(repoRoot, "tmp/KawasakiType88/Model_KawasakiType88High.glb"));
  }
}
Run(process.execPath, ["scripts/Script_BlenderMcp.mjs", "status", "--scan"]);
