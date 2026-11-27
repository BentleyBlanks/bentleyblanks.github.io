import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { setTimeout as Delay } from "node:timers/promises";
import { CreateModelWorkbenchHandler } from "./Script_ModelWorkbenchServer.mjs";
import { GenerateOpenAiViews } from "./Script_ModelWorkbenchProviders.mjs";
import { GenerateTripoModel } from "./Script_TripoStudioMcp.mjs";
import { CreateSteerableCodexChild } from "./Script_EncounterCodexRunner.mjs";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ModelWorkbench-"));
const python = process.env.MODEL_WORKBENCH_PYTHON || "python";
const workbench = "/Taierzhuang1938/AdvancedTools/Tool_ModelWorkbench.html";
const api = "/__model-workbench/tasks";
const pngs = path.join(testRoot, "Images");
await fs.mkdir(pngs);
execFileSync(python, ["-c", `
from pathlib import Path
from PIL import Image, ImageDraw
import sys
for i in range(8):
    image = Image.new('RGB',(2048,2048),(54+i*10,54+i*5,47+i*8))
    draw = ImageDraw.Draw(image)
    draw.rectangle((310+i*13,1100,1700,1550),fill=(110,89,59),outline=(181,145,94),width=19)
    draw.polygon([(470,1100),(660+i*32,658),(1400,658),(1580,1100)],fill=(136,108,68))
    for x in range(600,1470,170):
        draw.line((x,1230,x,1530),fill=(75,63,44),width=18)
    image.save(Path(sys.argv[1])/f"View{i}.png")
`, pngs], { windowsHide: true });
const ImagePath = index => path.join(pngs, `View${index}.png`);
const references = ["front", "side", "back"];
const testTurns = [];
const blenderCalls = [];
let buildAttempts = 0, reviewAttempts = 0;
const tripoCalls = [];

async function TestGoal() {
  const server = new EventEmitter();
  server.stdin = new PassThrough(); server.stdout = new PassThrough(); server.stderr = new PassThrough();
  server.kill = () => server.emit("close", 0);
  server.stdin.on("finish", server.kill);
  const Emit = value => server.stdout.write(JSON.stringify(value) + "\n");
  const Notify = (method, params) => Emit({ method, params: { threadId: "fixture", ...params } });
  const Reply = (id, text) => Notify("item/completed", { item: { id, type: "agentMessage", phase: "final_answer", text } });
  const Finish = id => Notify("turn/completed", { turn: { id, status: "completed" } });
  let goalStatus = "active", goalReads = 0, goalSet;
  server.stdin.on("data", block => {
    const request = JSON.parse(block.toString());
    if (request.id == null) return;
    let result = {};
    if (request.method === "thread/start") result = { thread: { id: "fixture" } };
    if (request.method === "thread/goal/set") goalSet = request.params;
    if (request.method === "thread/goal/get") result = { goal: { status: goalStatus, read: ++goalReads } };
    if (request.method === "turn/start") {
      assert.equal(request.params.model, "gpt-6.2-astra");
      assert.equal(request.params.effort, "xhigh");
      assert.deepEqual(request.params.input.slice(1).map(input => input.path), ["Front.jpg", "Side.jpg"]);
      result = { turn: { id: "first" } };
      setImmediate(() => {
        Notify("turn/started", result);
        Reply("draft", "初次尝试");
        Finish("first");
      });
    }
    Emit({ id: request.id, result });
  });
  const output = path.join(testRoot, "GoalReply.txt");
  const child = CreateSteerableCodexChild(["exec", "--output-last-message", output], testRoot, {
    title: "建模测试", goal: "完成多角度对齐", model: "gpt-6.2-astra", effort: "xhigh",
    images: ["Front.jpg", "Side.jpg"], spawnAppServer: (_root, args) => {
      assert.deepEqual(args, ["--enable", "goals"]);
      return server;
    },
  });
  let closed = false;
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", code => { closed = true; resolve(code); });
  });
  done.catch(() => {});
  child.stdin.end("逐图比对");
  for (let i = 0; i < 50 && !goalReads; i++) await Delay(5);
  assert.equal(goalReads, 1);
  assert.equal(closed, false);
  assert.equal(goalSet.objective, "完成多角度对齐");
  assert.equal(goalSet.origin, "user");
  Notify("turn/started", { turn: { id: "auto-continuation" } });
  goalStatus = "complete";
  Reply("final", "多角度对齐完成");
  Finish("auto-continuation");
  assert.equal(await done, 0);
  assert.equal(await fs.readFile(output, "utf8"), "多角度对齐完成");
}

function FixtureGlb() {
  const json = JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36, target: 34962 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, 0, 0], max: [1, 1.5, 0] }],
  });
  const text = Buffer.from(json.padEnd(4 * Math.ceil(Buffer.byteLength(json) / 4), " "));
  const header = Buffer.alloc(20);
  header.write("glTF"); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + text.length + 44, 8);
  header.writeUInt32LE(text.length, 12); header.write("JSON", 16);
  const binary = Buffer.alloc(44);
  binary.writeUInt32LE(36); binary.writeUInt32LE(0x004e4942, 4);
  [-1, 0, 0, 1, 0, 0, 0, 1.5, 0].forEach((value, i) => binary.writeFloatLE(value, 8 + i * 4));
  return Buffer.concat([header, text, binary]);
}

const handler = CreateModelWorkbenchHandler(root, {
  storage: path.join(testRoot, "Data"), blenderRoot: path.join(testRoot, "Blender"),
  generateOpenAi: async (_task, sources) => {
    assert.ok(sources.length);
    return references.map((view, i) => ({ view, label: ["正面", "左侧", "背面"][i], path: ImagePath(i), source: "OpenAI 测试接头" }));
  },
  generateTripo: async ({ views, output, key }) => {
    assert.deepEqual(Object.keys(views), ["front", "left", "back"]);
    tripoCalls.push(key);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, FixtureGlb());
    return { taskId: "fixture-studio-task", modelId: "fixture-studio-model" };
  },
  runBlender: async (_root, args) => {
    blenderCalls.push(args);
    return { port: 9899, instances: [] };
  },
  runCodex: async ({ directory, session, prompt, images, goal, building, notify }) => {
    testTurns.push({ id: session.id, role: session.role, model: session.model, effort: session.effort, prompt, images: images.length, goal });
    notify({ threadId: `fixture-${session.id}` });
    notify({ detail: "正在核对测试产物" });
    await Delay(180);
    const Save = (name, data) => fs.writeFile(path.join(directory, name), JSON.stringify(data));
    if (session.role === "research") {
      await fs.copyFile(ImagePath(3), path.join(directory, "Front.png"));
      await fs.copyFile(ImagePath(4), path.join(directory, "Side.png"));
      await Save("References.json", { generate: false, reason: "两张实拍足以建模。", views: [
        { file: "Front.png", label: "正面", source: "https://example.com/front" },
        { file: "Side.png", label: "侧面", source: "https://example.com/side" },
      ] });
    }
    if (session.role === "build") {
      buildAttempts++;
      assert.equal(session.model, "gpt-6.2-astra");
      assert.equal(session.effort, "xhigh");
      assert.match(goal, /全部一致/);
      if (buildAttempts < 3) {
        assert.match(prompt, /TripoBase\.glb/);
        assert.deepEqual(await fs.readFile(path.join(building.sourceDir, "TripoBase.glb")), FixtureGlb());
      }
      const ids = [...new Set([...prompt.matchAll(/"id":"([a-f0-9-]+\.png)"/g)].map(match => match[1]))].slice(0, 3);
      if (buildAttempts === 3) { assert.equal(images.length, 4); assert.match(prompt, /边缘坡度/); }
      await fs.writeFile(path.join(building.sourceDir, "Model.blend"), "fixture editable blend bytes");
      await fs.writeFile(path.join(directory, "Model.glb"), FixtureGlb());
      await fs.writeFile(path.join(directory, "Rebuild.py"), "import bpy\n");
      const views = [];
      for (let index = 0; index < ids.length; index++) {
        const render = `Matched_${index}.png`;
        await fs.copyFile(ImagePath(index + (buildAttempts === 3 ? 5 : 3)), path.join(directory, render));
        views.push({ referenceId: ids[index], render, matched: true, camera: "正交，按轮廓和构图调整", checks: {
          silhouette: "轮廓重合", proportion: "高宽比一致", structure: "位置一致", material: "木纹一致", details: "边缘吻合",
        } });
      }
      await Save("Model.json", { summary: "已逐图自检并回导", views: buildAttempts === 1 ? views.slice(1) : views });
    }
    if (session.role === "review") {
      reviewAttempts++;
      assert.equal(session.model, "gpt-6.2-sol");
      assert.equal(session.effort, "high");
      assert.equal(images.length, 6);
      assert.equal(goal, undefined);
      const ids = [...prompt.matchAll(/"id":"([a-f0-9-]+\.png)"/g)].map(match => match[1]);
      await Save("Review.json", {
        verdict: reviewAttempts === 1 ? "revise" : "pass", summary: "已逐图验收",
        checks: ids.map(referenceId => ({ referenceId, note: "核对轮廓及结构" })),
        issues: reviewAttempts === 1 ? [{ referenceId: ids[0], box: [.27, .33, .56, .62], note: "边缘坡度偏大，需要收紧。" }] : [],
      });
    }
    return "会话完成。";
  },
});

const staticMime = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css",
  ".woff2": "font/woff2", ".png": "image/png" };
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith(api)) return handler(req, res);
  const file = path.join(root, new URL(req.url, "http://localhost").pathname);
  try {
    const bytes = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": staticMime[path.extname(file)] || "application/octet-stream" }).end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser, page;
try {
  await TestGoal();
  const cloudCalls = [];
  const input = { views: { image: ImagePath(0) }, output: path.join(testRoot, "Tripo", "Base.glb"), key: "fixture-intent", cwd: root };
  const tripoOptions = {
    pollInterval: 0,
    request: async (url, options) => {
      if (url.pathname === "/upload") {
        assert.equal(options.method, "PUT");
        assert.equal(options.headers.get("content-type"), "image/png");
        assert.deepEqual(options.body, await fs.readFile(ImagePath(0)));
        return new Response(null, { status: 200 });
      }
      assert.equal(url.pathname, "/download");
      return new Response(FixtureGlb());
    },
    connect: async () => ({
      close() {},
      async call(tool, args) {
        cloudCalls.push(tool);
        if (tool === "tripo_create_image_upload_grant") return { upload_grant: { required_headers: {}, object_key: "input-key", upload_url: "https://fixture.invalid/upload" } };
        if (tool === "tripo_image_to_model") {
          assert.equal(args.image_key, "input-key");
          assert.equal(args.idempotency_key, "fixture-intent");
          throw new Error("Simulated timeout after admission");
        }
        if (tool === "tripo_get_model_task_by_idempotency_key") {
          assert.deepEqual(args, { creation_tool: "tripo_image_to_model", idempotency_key: "fixture-intent" });
          return { found: true, task: { task_id: "saved-task", status: "running" } };
        }
        if (tool === "tripo_get_model_task") return { task: { task_id: "saved-task", status: "success", model_ids: ["saved-model"] } };
        assert.equal(tool, "tripo_get_model_asset");
        return { model: { model_url: "https://fixture.invalid/download" } };
      },
    }),
  };
  assert.deepEqual(await GenerateTripoModel(input, tripoOptions), { taskId: "saved-task", modelId: "saved-model" });
  assert.deepEqual(await fs.readFile(input.output), FixtureGlb());
  assert.deepEqual(await GenerateTripoModel(input, tripoOptions), { taskId: "saved-task", modelId: "saved-model" });
  assert.deepEqual(cloudCalls, ["tripo_create_image_upload_grant", "tripo_image_to_model", "tripo_get_model_task_by_idempotency_key", "tripo_get_model_task", "tripo_get_model_asset"]);
  const oldKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "fixture-key";
  const requestFolder = path.join(testRoot, "Provider");
  let calls = 0;
  const options = { signal: new AbortController().signal, progress() {}, request: async (url, request) => {
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.equal(request.body.get("model"), "gpt-image-2.6-sunburst");
    assert.equal(request.body.get("quality"), "max");
    assert.equal(request.body.get("size"), "2048x2048");
    assert.equal(request.body.getAll("image[]").length, calls + 1);
    return Response.json({ data: [{ b64_json: (await fs.readFile(ImagePath(calls++))).toString("base64") }] }, { headers: { "x-request-id": `fixture-${calls}` } });
  } };
  const Sources = [{ id: "fixture-input", path: ImagePath(7) }];
  await GenerateOpenAiViews({ title: "木箱" }, Sources, requestFolder, options);
  await GenerateOpenAiViews({ title: "木箱" }, Sources, requestFolder, options);
  assert.equal(calls, 3);
  process.env.OPENAI_API_KEY = oldKey || "fixture-key";

  browser = await LaunchBrowser({ extraArgs: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(base + workbench);
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  await page.getByLabel("任务名称").fill("鲁南木箱");
  await page.getByLabel("资产代号（可选）").fill("WoodCrate");
  await page.getByRole("button", { name: "创建任务" }).click();
  await page.getByRole("dialog", { name: "生成原画局部三视图" }).waitFor();
  await page.locator("#sourceFiles").setInputFiles(ImagePath(6));
  await page.locator("#referenceInputs").getByRole("button", { name: "View6.png", exact: true }).waitFor();
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.getByRole("button", { name: "通过参考图并开始建模" }).waitFor();
  assert.equal(buildAttempts, 0);
  const id = new URL(page.url()).searchParams.get("task");
  const current = async () => (await fetch(base + api + "/" + id)).json();
  const approved = await current();
  assert.equal(approved.referenceSets[0].views.length, 3);
  assert.equal(path.basename(path.dirname(approved.workspace)), "WoodCrate");
  for (const folder of ["References", "Models", "Textures", "Review", "Exports", "_Scratch"]) {
    assert.ok((await fs.stat(path.join(approved.workspace, folder))).isDirectory());
  }
  const badApprove = await fetch(base + api + "/" + id + "/action", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approveReferences", revision: approved.revision, referenceSet: "old-version" }),
  });
  assert.equal(badApprove.status, 409);
  await page.getByRole("button", { name: /通过参考图并用 Tripo MCP 建模/ }).click();
  await page.getByText("缺少逐视角对齐资料", { exact: true }).first().waitFor();
  assert.equal(reviewAttempts, 0);
  await page.getByRole("button", { name: "重试上次操作" }).click();
  await page.getByRole("button", { name: "模型验收通过" }).waitFor();
  assert.equal(reviewAttempts, 2);
  assert.equal(new Set(testTurns.filter(turn => turn.role === "review").map(turn => turn.id)).size, 2);
  assert.equal(blenderCalls.filter(args => args[0] === "stop").length, 3);
  const result = await current();
  assert.equal(result.candidates[0].review.verdict, "revise");
  assert.equal(result.candidates[0].review.attachments.length, 1);
  assert.equal(result.candidates[1].review.verdict, "pass");
  assert.equal(result.candidates[1].tripo.modelId, "fixture-studio-model");
  assert.deepEqual(tripoCalls, [`ModelWorkbench-${id}-${approved.referenceSets[0].id}`, `ModelWorkbench-${id}-${approved.referenceSets[0].id}`]);
  assert.deepEqual(result.candidates.map(candidate => candidate.round), ["R002", "R003"]);
  const index = JSON.parse(await fs.readFile(path.join(result.workspace, "Data_Task.json"), "utf8"));
  assert.equal(index.approved, result.approved);
  const archived = [result.referenceSets[0].views[0].archive, ...result.candidates.flatMap(candidate => [
    candidate.archive.model, candidate.views[0].archive, `Review/${candidate.round}/Data_Review.json`,
  ])];
  for (const file of archived) assert.ok((await fs.stat(path.join(result.workspace, file))).isFile());
  await page.getByRole("button", { name: "左侧", exact: true }).click();
  await page.getByRole("button", { name: "查看参考图 · 左侧" }).waitFor();
  await page.getByRole("button", { name: "查看 3D 模型" }).click();
  await page.locator("#viewer canvas").waitFor();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".mwCompare img")].every(image => image.complete && image.naturalWidth));
  await page.getByRole("button", { name: "＋ 截图" }).click();
  const canvas = page.locator("#screenshotCanvas");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 25, box.y + 32);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 130);
  await page.mouse.up();
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await page.getByRole("button", { name: "附加到会话" }).click();
  await page.locator("#attached").getByRole("button", { name: "标注截图.png", exact: true }).waitFor();
  await page.getByRole("button", { name: "新建会话" }).click();
  await page.getByLabel("需求或返修说明").fill("请查看标注位置");
  await page.getByRole("button", { name: "发送 ↑" }).click();
  await page.locator("#thread").getByText("请查看标注位置").waitFor();
  await page.locator("#thread").getByText("会话完成。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "模型验收通过" }).click();
  await page.locator("#taskStatus").getByText("已验收", { exact: true }).waitFor();
  const shot = process.env.MODEL_WORKBENCH_TEST_SHOT;
  if (shot) {
    await page.screenshot({ path: path.join(testRoot, "Desktop.png") });
    execFileSync(python, ["-c", "from PIL import Image; import sys; i=Image.open(sys.argv[1]).convert('RGB'); i.thumbnail((640,640)); i.save(sys.argv[2],quality=82)", path.join(testRoot, "Desktop.png"), shot], { windowsHide: true });
  }

  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  await page.getByLabel("任务名称").fill("手推车");
  await page.getByLabel("参考图来源").selectOption("research");
  await page.getByRole("button", { name: "创建任务" }).click();
  await page.getByRole("dialog", { name: "搜集多角度参考图" }).waitFor();
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.getByRole("button", { name: "通过参考图并开始建模" }).waitFor();
  await page.getByText("两张实拍足以建模。").waitFor();
  assert.equal(buildAttempts, 3);
  await page.setViewportSize({ width: 430, height: 800 });
  await page.getByRole("button", { name: "切换任务列表" }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 430);
  assert.deepEqual(pageErrors, []);
  console.log("PASS: 2K image requests, Tripo task recovery and GLB delivery, approval and evidence gates, Blender handoff, independent review and marked rerun, screenshots, chat, and narrow layout.");
} catch (error) {
  if (page) {
    console.error("Workbench state:", {
      status: await page.locator("#taskStatus").textContent(),
      stageError: await page.locator("#stageError").textContent(),
      referenceError: await page.locator("#referenceError").textContent(),
      chatNotice: await page.locator("#chatNotice").textContent(),
    });
  }
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  const resolved = await fs.realpath(testRoot);
  assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
  await fs.rm(resolved, { recursive: true, force: true });
}
