// Rebuild the high source and derive the low PBR from its exact saved identity.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const phases = ["High", "LowGeometry", "Prepare", "Track", "Paint", "Steel", "Rubber", "Finalize"];
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(`Script_BuildType94PhotoV107 [--dry-run] [--phase=<${phases.join("|")}>]\nTYPE94_PHOTO_ROOT selects an isolated external output folder.`);
  process.exit(0);
}
const phaseOption = args.find(value => value.startsWith("--phase="))?.slice(8);
if (phaseOption && !phases.includes(phaseOption)) throw new Error(`Unknown phase ${phaseOption}`);
for (const phase of phaseOption ? [phaseOption] : phases) {
  const script = phases.indexOf(phase) < 2 ? "Script_BuildType94PhotoV107.py" : "Script_BakeType94GameV107.py";
  const command = ["scripts/Script_BlenderMcp.mjs", "start", "--task", "Type94Tankette", "--batch", `Taierzhuang1938/_blender/${script}`, "--json"];
  if (args.includes("--dry-run")) {
    console.log(JSON.stringify({ phase, command }));
    continue;
  }
  const result = spawnSync(process.execPath, command, {
    cwd: root,
    env: { ...process.env, TYPE94_PHOTO_PHASE: phase },
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
