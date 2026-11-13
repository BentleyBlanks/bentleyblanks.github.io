import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// A running Node process keeps its loaded handlers until restarted.
export function PreviewRuntimeRevision(root) {
  const hash = createHash("sha256");
  for (const file of ["Script_LocalPreview.mjs", "Script_EncounterCodexServer.mjs", "Script_EncounterCodexRunner.mjs", "Script_EncounterCodexProgress.mjs", "Script_LocalPreviewRuntime.mjs"]) {
    const filePath = path.join(root, "scripts", file);
    hash.update(file).update(fs.existsSync(filePath) ? fs.readFileSync(filePath) : "missing");
  }
  return hash.digest("hex");
}
