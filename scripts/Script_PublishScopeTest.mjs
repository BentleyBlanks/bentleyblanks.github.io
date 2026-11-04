import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PUBLISH_SOURCE_PATHS, ScopePublication, CheckPublication, PublicationHome } from "./Script_PublishScope.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "PublishScopeTest-"));
function Write(file, value = "fixture") {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), value);
}
try {
  Write("Taierzhuang1938/index.html", "game");
  Write("Taierzhuang1938/Scenes/FirstLevel/Scene_FirstLevel.json");
  for (const file of PUBLISH_SOURCE_PATHS.slice(1)) Write(file, "mat");
  for (const file of ["TunnelLight1943/index.html", "BehindTheLines/Play/index.wasm", "Model/Unused/Old.glb", "2016/index.html", "index.html"])
    Write(file, "old-project");
  assert.ok(CheckPublication(root).some(problem => problem.includes("TunnelLight1943")));
  ScopePublication(root, { revision: "test-revision" });
  assert.deepEqual(CheckPublication(root), []);
  assert.equal(fs.readFileSync(path.join(root, "index.html"), "utf8"), PublicationHome());
  assert.equal(fs.readFileSync(path.join(root, "Taierzhuang1938/index.html"), "utf8"), "game");
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "Data_Publication.json"))).revision, "test-revision");
  assert.equal(fs.existsSync(path.join(root, "TunnelLight1943")), false);
  assert.equal(fs.existsSync(path.join(root, "Model/Unused")), false);
  assert.equal(ScopePublication(root).removedBytes, 0, "重复裁剪保持有效");
  Write(".git", "gitdir: elsewhere");
  assert.throws(() => ScopePublication(root), /拒绝/);
  assert.equal(fs.readFileSync(path.join(root, "Taierzhuang1938/index.html"), "utf8"), "game", "拒绝修改 worktree");
  console.log("PublishScopeTest ok: old projects excluded, current game and shared assets preserved, root routing and worktree guard");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
