// 发布瘦身的文件 / 通配规则不能删运行时成品，也不能漏报 HTML、路径常量与 glTF 的引用。
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CheckRepo, PUBLISH_EXCLUDE, Prune, SiteBytes } from "./Script_PublishPrune.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "PublishPruneTest-"));
const tracked = [];
function Write(file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  if (!tracked.includes(file)) tracked.push(file);
}
try {
  for (const entry of PUBLISH_EXCLUDE) {
    const file = entry.path.replaceAll("**/", "").replaceAll("*", "Fixture") + (entry.path.endsWith("/") ? "Data_Source.bin" : "");
    Write(file, "source-only");
  }
  const runtime = {
    "Taierzhuang1938/Model/Character/Model_JapaneseSoldierA.glb": "soldier-a",
    "Taierzhuang1938/Model/Character/Model_JapaneseSoldierJia.glb": "jia",
    "Taierzhuang1938/Model/Character/Model_HeYoutian.glb": "he",
    "Taierzhuang1938/Model/Character/Model_SquadLeaderLuo.glb": "luo",
    "Model/PatchedTimberBed/Model_PatchedTimberBed.glb": "embedded-finished-textures",
    "Taierzhuang1938/Model/SichuanBlanketPack/Texture_ProjectedV13_Pack_Jacket_Base.webp": "finished-texture",
  };
  for (const [file, content] of Object.entries(runtime)) Write(file, content);
  Write("index.html", '<script type="module" src="./Script_Game.mjs"></script>');
  Write("Script_Game.mjs", 'const model = "./Taierzhuang1938/Model/Character/Model_JapaneseSoldierA.glb";');
  Write("Model/Runtime.gltf", '{"images":[{"uri":"Texture_Finished.webp"}]}');
  assert.deepEqual(CheckRepo({ root, tracked }), [], "安全清单通过");

  Write("index.html", '<a href="./Taierzhuang1938/Model/Character/Model_TengxianLuoReference.glb">reference</a>');
  Write("Script_Game.mjs", 'const model = "./Model/Character/Model_TengxianCivilianWomanReference.glb";');
  Write("Model/Runtime.gltf", '{"images":[{"uri":"Texture_FixtureSource.png"}]}');
  const problems = CheckRepo({ root, tracked });
  for (const file of ["index.html", "Script_Game.mjs", "Model/Runtime.gltf"]) {
    assert.ok(problems.some((problem) => problem.startsWith(file + ":")), `${file} 引用排除文件必须失败`);
  }
  const bytesBefore = SiteBytes(root);
  const results = Prune(root);
  assert.equal(results.length, PUBLISH_EXCLUDE.length);
  assert.ok(results.every((result) => result.files === 1 && result.bytes === 11), "目录、单文件和通配都准确计数");
  assert.equal(bytesBefore - SiteBytes(root), results.reduce((sum, result) => sum + result.bytes, 0));
  for (const [file, content] of Object.entries(runtime)) assert.equal(fs.readFileSync(path.join(root, file), "utf8"), content, `保留 ${file}`);
  assert.ok(Prune(root).every((result) => result.bytes === 0 && result.files === 0), "重复瘦身不动成品");
  console.log("PublishPruneTest ok: exact files, glob references, glTF URIs, runtime preservation and byte accounting");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
