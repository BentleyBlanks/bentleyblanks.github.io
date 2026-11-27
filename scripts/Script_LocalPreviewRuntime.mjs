import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// Startup modules outside the reloadable bridge still require a process restart.
export function PreviewRuntimeRevision(root) {
  const hash = createHash("sha256");
  for (const file of ["Script_LocalPreview.mjs", "Script_EncounterLibraryServer.mjs", "Script_EncounterImportWatch.mjs", "Script_EncounterCodexServer.mjs", "Script_EncounterCodexRunner.mjs", "Script_EncounterAgentProviders.mjs", "Script_EncounterCodexProgress.mjs", "Script_LocalPreviewRuntime.mjs", "Script_PreviewModules.mjs", "Script_ModelWorkbenchServer.mjs", "Script_ModelWorkbenchProviders.mjs", "Script_ModelWorkbenchImages.py", "Script_TripoStudioMcp.mjs"]) {
    const filePath = path.join(root, "scripts", file);
    hash.update(file).update(fs.existsSync(filePath) ? fs.readFileSync(filePath) : "missing");
  }
  for (const file of ["Script_WorkbenchServer.mjs", "Script_ColabCliBackend.mjs", "Script_DreaminaBridge.mjs", "Script_SomaToMixamo.mjs", "Script_ImageProviderBridge.mjs"]) {
    const filePath = path.join(root, "MotionWorkbench", "server", file);
    hash.update("mw:" + file).update(fs.existsSync(filePath) ? fs.readFileSync(filePath) : "missing");
  }
  return hash.digest("hex");
}

// Keep live children shared across route upgrades so refreshing the editor's
// JavaScript cannot leave its new controls talking to an old bridge.
export function CreateReloadableEncounterCodexHandler(root, { state = {} } = {}) {
  const file = path.join(root, "scripts", "Script_EncounterCodexServer.mjs");
  state.active ||= new Map();
  state.submissions ||= new Map();
  let revision;
  let loading;
  return async function Handle(request, response) {
    let handler;
    try {
      const current = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
      if (current !== revision) {
        revision = current;
        loading = import(`${pathToFileURL(file).href}?revision=${current}`)
          .then(module => module.CreateEncounterCodexHandler(root, { state }));
      }
      handler = await loading;
    } catch {
      revision = undefined;
      response.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ error: "本机会话服务更新失败，请检查本地服务文件后重试" }));
      return;
    }
    await handler(request, response);
  };
}
