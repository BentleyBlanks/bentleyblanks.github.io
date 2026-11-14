import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { randomUUID } from "node:crypto";
import { LaunchBrowser, ServeProject } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { CreateEncounterCodexHandler } from "../scripts/Script_EncounterCodexServer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storage = fs.mkdtempSync(path.join(os.tmpdir(), "EncounterChatBrowser-"));
const calls = [];
const handler = CreateEncounterCodexHandler(storage, { spawnCodex(args) {
  const child = new EventEmitter();
  child.pid = process.pid;
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
  child.prompt = ""; child.args = args;
  child.steered = [];
  child.steer = async (prompt, image) => { child.steered.push({ prompt, image }); };
  child.stdin.on("data", chunk => { child.prompt += chunk.toString(); });
  calls.push(child);
  return child;
}, stopCodex(child) { child.emit("close", 130); } });
const server = await ServeProject(root);
const serveFiles = server.listeners("request")[0];
server.removeAllListeners("request");
server.on("request", (request, response) => request.url.startsWith("/__encounter/codex/") ? handler(request, response) : serveFiles(request, response));
const browser = await LaunchBrowser();
const out = path.join(root, "tmp", "EncounterEditor"); fs.mkdirSync(out, { recursive: true });
const markdownReply = [
  '**有。这里更适合改成“宽正面压制、少量入沟追击”。**',
  "",
  "### 这里建议怎么改",
  "",
  "| 层次 | 建议布置 | 解决什么 |",
  "| --- | --- | --- |",
  "| **沟外集结区** | 安排弹坑、断墙、塌土坎 | 形成彼此错开的藏身点 |",
  "| **沟沿压制区** | 少量敌人依托沟沿、墙角射击 | 保留正面压力 |",
  "| **入沟追击区** | 第一轮先让 2 人进入 | 后续错峰移动或推进 |",
  "",
  "### 可以参考的设计资料",
  "",
  "- **《Uncharted 4》GDC** · [设计资料](https://www.gdcvault.com/)",
  "- 沿用 `Fork` 的定位信息，保留换行。\n  第二行继续说明。",
  "  - 嵌套列表与 *强调*、~~删除线~~。",
  "",
  "> 以上人数是白盒试验起点。",
  "",
  "1. 先调整沟外掩体。",
  "2. 再验证推进路线。",
  "",
  "- [x] 已验证",
  "- [ ] 待调整",
  "",
  "```js",
  'const route = { group: "Fork", positions: [[32.8, 66.6], [35.2, 72.4]], description: "宽正面压制与错峰追击" };',
  'console.log("<script>代码按原文显示</script>");',
  "```",
  "",
  '<script>window.chatUnsafe = true</script><img src="/missing-chat-image" onerror="window.chatUnsafe = true">',
  '[危险链接](javascript:window.chatUnsafe=true) <a href="data:text/html,unsafe" style="position:fixed">数据链接</a>',
].join("\n");
function Finish(child, text) {
  child.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: randomUUID() })}\n`);
  child.stdout.write(`${JSON.stringify({ type: "item.completed", item: { type: "reasoning", text: "HIDDEN_THOUGHT" } })}\n`);
  fs.writeFileSync(child.args[child.args.indexOf("--output-last-message") + 1], text);
  child.emit("close", 0);
}
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    localStorage.setItem("tengxian1938_audio_v1", JSON.stringify({ master: 0 }));
    localStorage.setItem("tengxian1938_tools_volume_v1", JSON.stringify({ volume: 0, muted: true }));
  });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html?t=384`);
  await page.waitForFunction(() => window.LevelFlow && document.querySelector("#codexConnection").textContent.includes("gpt-6.1-sol · high"));
  assert.equal(await page.locator("#newCodexChat").isVisible(), false);
  assert.equal(await page.locator("#toggleCodexSessions").getAttribute("aria-expanded"), "false");
  assert.equal((await page.locator(".lfInspector").boundingBox()).width, 390);
  assert.equal(await page.locator("#markScreenshot,.lfChatEmpty").count(), 0);
  assert.equal(await page.locator("#codexPendingLocation").isVisible(), true);
  assert.equal(JSON.parse(await page.locator("#codexContextDetail").textContent()).timeline.timeSeconds, 384);
  await page.screenshot({ path: path.join(out, "CodexSidebarNarrow.png") });
  // Use real canvas clicks in both viewports. Units keep their own frozen snapshot.
  await page.evaluate(() => { LevelFlow.SetViewType(0, "plan"); LevelFlow.SetViewType(1, "plan"); LevelFlow.Seek(221); });
  async function ClickUnit(id, index = 0, modifier = null) {
    const point = await page.evaluate(({ id, index }) => {
      const actor = LevelFlow.Inspect().actors.find(actor => actor.id === id);
      const screen = LevelFlow.ToScreen(actor.p, index);
      const rect = document.querySelectorAll(".lfViewPane canvas")[index].getBoundingClientRect();
      return { x: rect.x + screen[0], y: rect.y + screen[1] };
    }, { id, index });
    if (modifier) await page.keyboard.down(modifier);
    await page.mouse.click(point.x, point.y);
    if (modifier) await page.keyboard.up(modifier);
  }
  const SelectedIds = () => page.locator("#selectedUnits .lfUnitRow").evaluateAll(rows => rows.map(row => row.dataset.unitId));
  await page.evaluate(() => LevelFlow.SetPlaying(true));
  await ClickUnit("Fork_0");
  assert.equal(await page.evaluate(() => LevelFlow.Inspect().playing), false);
  await page.evaluate(() => LevelFlow.Seek(221));
  assert.deepEqual(await SelectedIds(), ["Fork_0"]);
  assert.equal(await page.locator("#unitSelection").isVisible(), true);
  await ClickUnit("Fork_1", 1, "Control");
  assert.deepEqual(await SelectedIds(), ["Fork_0", "Fork_1"]);
  assert.deepEqual((await page.evaluate(() => LevelFlow.Packet())).context.selection.ids, ["Fork_0", "Fork_1"]);
  await ClickUnit("Fork_0", 0, "Shift");
  assert.deepEqual(await SelectedIds(), ["Fork_1"]);
  await page.click("#selectMultipleUnits");
  await ClickUnit("Fork_0");
  assert.equal((await SelectedIds()).length, 2);
  await page.click("#selectSingleUnit");
  assert.deepEqual(await SelectedIds(), ["Fork_0"]);
  await ClickUnit("liu");
  assert.deepEqual(await SelectedIds(), ["liu"]);
  await page.click("#selectMultipleUnits");
  await ClickUnit("Fork_0", 1);
  await page.screenshot({ path: path.join(out, "CodexUnitSelection.png") });
  await page.click("#attachSelectedUnits");
  assert.equal(await page.locator("#codexPendingUnits").isVisible(), true);
  const unitSnapshot = JSON.parse(await page.locator("#codexUnitsDetail").textContent());
  assert.equal(unitSnapshot.timeline.timeSeconds, 221);
  assert.deepEqual(unitSnapshot.units.map(unit => unit.id), ["liu", "Fork_0"]);
  assert.equal(unitSnapshot.units[1].group.id, "Fork");
  assert.ok(Number.isFinite(unitSnapshot.units[1].position.y));
  await page.click("#codexUnitsSummary");
  assert.ok(await page.locator("#sendCodexChat").evaluate(button => button.getBoundingClientRect().bottom <= document.querySelector(".lfChatDetail").getBoundingClientRect().bottom));
  await page.click("#codexUnitsSummary");
  await page.evaluate(() => { LevelFlow.SetViewType(0, "scene"); LevelFlow.SetViewType(1, "scene"); LevelFlow.Seek(384); });
  assert.deepEqual(JSON.parse(await page.locator("#codexUnitsDetail").textContent()), unitSnapshot);
  await page.click("#attachCodexUnits");
  await page.click("#clearSelectedUnits");
  assert.deepEqual(await SelectedIds(), []);
  assert.equal(await page.locator("#attachSelectedUnits").isDisabled(), true);
  await page.click("#closeUnitSelection");
  const handle = await page.locator("#inspectorResizeHandle").boundingBox();
  await page.mouse.move(handle.x + 3, handle.y + 150); await page.mouse.down();
  await page.mouse.move(handle.x - 197, handle.y + 150, { steps: 8 }); await page.mouse.up();
  assert.equal((await page.locator(".lfInspector").boundingBox()).width, 590);
  await page.locator("#inspectorResizeHandle").focus(); await page.keyboard.press("ArrowRight");
  assert.equal((await page.locator(".lfInspector").boundingBox()).width, 570);
  await page.click("#toggleCodexSessions");
  const layout = await page.evaluate(() => {
    const list = document.querySelector(".lfChatSidebar").getBoundingClientRect(), detail = document.querySelector(".lfChatDetail").getBoundingClientRect();
    return { list: list.right, detail: detail.left, right: detail.right, width: innerWidth };
  });
  assert.equal(layout.list, layout.detail); assert.ok(layout.right <= layout.width);
  await page.evaluate(() => LevelFlow.Select({ type: "group", id: "Fork" }));
  await page.click('[data-tab="chat"]');
  await page.click("#attachCodexScreenshot");
  const canvas = await page.locator("#annotationCanvas").boundingBox();
  await page.mouse.move(canvas.x + 50, canvas.y + 50); await page.mouse.down();
  await page.mouse.move(canvas.x + 150, canvas.y + 120); await page.mouse.up();
  await page.click("#attachScreenshot");
  await page.waitForFunction(() => !document.querySelector("#codexPendingImage").hidden);
  assert.ok(await page.locator("#codexPendingImage").isVisible());
  // Each attachment preserves the time at which the user added it.
  await page.evaluate(() => LevelFlow.Seek(386));
  await page.click("#attachCodexLocation");
  await page.evaluate(() => LevelFlow.Seek(390));
  assert.equal(JSON.parse(await page.locator("#codexContextDetail").textContent()).timeline.timeSeconds, 386);
  await page.locator("#codexPrompt").fill("调整这个生成区的路线\n**原样文字**");
  await page.locator("#codexPrompt").press("Control+Enter");
  await page.waitForFunction(() => document.querySelectorAll(".lfChatMessage.user").length === 1);
  assert.equal(calls.length, 1);
  assert.equal(await page.locator(".lfChatMessage.user .lfChatBubble strong").count(), 0);
  assert.match(await page.locator(".lfChatMessage.user .lfChatBubble").innerText(), /\*\*原样文字\*\*/);
  assert.ok(calls[0].args.includes("--image"));
  const outputDirectory = path.dirname(calls[0].args[calls[0].args.indexOf("--output-last-message") + 1]);
  const frame = JSON.parse(fs.readFileSync(path.join(outputDirectory, "Frame.json"), "utf8"));
  const location = JSON.parse(fs.readFileSync(path.join(outputDirectory, "Location.json"), "utf8"));
  const screenshot = JSON.parse(fs.readFileSync(path.join(outputDirectory, "ScreenshotFrame.json"), "utf8"));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outputDirectory, "Units.json"), "utf8")), unitSnapshot);
  assert.match(calls[0].prompt, /Units.json/);
  assert.equal(await page.locator("#codexPendingUnits").isVisible(), false);
  assert.equal(await page.locator(".lfChatMessage.user summary").first().innerText(), "单位 · 2 个 · 03B · 221.00 s");
  assert.equal(frame.context.time, 386); assert.equal(location.selection.id, "Fork");
  assert.equal(screenshot.context.time, 384); assert.equal(screenshot.screenshot.marks.length, 1);
  assert.ok(await page.locator("#sendCodexChat").isDisabled());
  calls[0].stdout.write(`${JSON.stringify({ type: "progress", activity: "正在验证路线", text: "已定位到生成区过近的问题，正在调整敌军推进路线。" })}\n`);
  await page.waitForFunction(() => document.querySelector("#codexProgress p")?.textContent.includes("已定位到生成区"));
  assert.equal(await page.locator("#codexProgress strong").innerText(), "正在验证路线");
  assert.match(await page.locator("#codexProgress small").innerText(), /最后更新/);
  const progressBubble = await page.locator("#codexProgress").evaluate(bubble => {
    const style = getComputedStyle(bubble);
    return { author: bubble.parentElement.querySelector(".lfChatAuthor")?.textContent,
      bubble: bubble.classList.contains("lfChatBubble"), border: style.borderTopWidth,
      radius: style.borderTopRightRadius, padding: style.paddingLeft,
      fits: bubble.scrollWidth <= bubble.clientWidth + 1 };
  });
  assert.deepEqual(progressBubble, { author: "Codex", bubble: true, border: "1px", radius: "12px", padding: "12px", fits: true });
  await page.screenshot({ path: path.join(out, "CodexLiveProgress.png") });
  await page.locator("#codexPrompt").fill("执行中补充，按最新定位调整");
  assert.equal(await page.locator("#sendCodexChat").innerText(), "补充要求");
  assert.ok(await page.locator("#sendCodexChat").isEnabled());
  await page.click("#sendCodexChat");
  await page.waitForFunction(() => document.querySelectorAll(".lfChatMessage.user").length === 2);
  assert.equal(calls.length, 1); assert.equal(calls[0].steered.length, 1);
  assert.match(calls[0].steered[0].prompt, /执行中补充/);
  await page.click("#newCodexChat");
  assert.ok(await page.locator("#codexPendingLocation").isVisible());
  assert.equal(JSON.parse(await page.locator("#codexContextDetail").textContent()).timeline.timeSeconds, 390);
  await page.evaluate(() => LevelFlow.Select({ type: "actor", id: "player" }));
  await page.click("#attachSelectedUnits");
  await page.locator("#codexPrompt").fill("第二个会话的独立草稿");
  await page.locator(".lfChatSession").first().click();
  await page.waitForFunction(() => document.querySelectorAll(".lfChatMessage.user").length === 2);
  assert.equal(await page.locator("#codexPendingUnits").isVisible(), false);
  Finish(calls[0], markdownReply);
  await page.waitForFunction(() => document.querySelector(".lfChatMessage.assistant"));
  const reply = page.locator(".lfChatMessage.assistant .lfChatBubble");
  assert.equal(await reply.locator("h3").first().innerText(), "这里建议怎么改");
  assert.equal(await reply.locator("tbody tr").count(), 3);
  assert.equal(await reply.locator("td strong").first().innerText(), "沟外集结区");
  assert.equal(await reply.locator("ul ul li").count(), 1);
  assert.equal(await reply.locator("ol li").count(), 2);
  assert.equal(await reply.locator('input[type="checkbox"]:disabled').count(), 2);
  assert.ok((await reply.locator("pre code").innerText()).includes("<script>代码按原文显示</script>"));
  assert.equal(await reply.locator("script, [onerror], [style], a[href^='javascript:'], a[href^='data:']").count(), 0);
  assert.equal(await page.evaluate(() => window.chatUnsafe), undefined);
  assert.equal(await reply.locator('a[href="https://www.gdcvault.com/"]').getAttribute("rel"), "noopener noreferrer");
  assert.ok(!(await page.locator("#codexMessages").textContent()).includes("HIDDEN_THOUGHT"));
  assert.equal(await page.locator(".lfChatScreenshot img").evaluate(image => image.complete && image.naturalWidth > 0), true);
  await page.screenshot({ path: path.join(out, "CodexConversation.png") });
  await page.click("#toggleCodexSessions");
  await page.locator("#inspectorResizeHandle").focus(); await page.keyboard.press("Home");
  for (let step = 0; step < 6; step++) await page.keyboard.press("ArrowRight");
  const overflow = await reply.evaluate(bubble => {
    const table = bubble.querySelector(".lfChatTableScroll"), pre = bubble.querySelector("pre");
    return { table: table.scrollWidth > table.clientWidth, code: pre.scrollWidth > pre.clientWidth,
      bubble: bubble.scrollWidth <= bubble.clientWidth + 1, page: document.body.scrollWidth <= innerWidth };
  });
  assert.deepEqual(overflow, { table: true, code: true, bubble: true, page: true });
  await page.locator("#codexMessages").evaluate(log => { log.scrollTop = log.querySelector(".assistant").offsetTop - log.offsetTop; });
  await page.screenshot({ path: path.join(out, "CodexMarkdownNarrow.png") });
  // Reopen the sent PNG using its original canvas and editable mark data.
  await page.locator(".lfChatScreenshot").click();
  await page.waitForFunction(() => document.querySelector("#annotationDialog").open);
  assert.equal(page.context().pages().length, 1);
  assert.match(await page.locator("#annotationHeading").innerText(), /384\.00 s/);
  assert.match(await page.locator("#annotationStatus").innerText(), /1 处标记/);
  const reopened = await page.locator("#annotationCanvas").boundingBox();
  await page.mouse.click(reopened.x + 70, reopened.y + 64);
  assert.ok(await page.locator("#deleteScreenshotAnnotation").isEnabled());
  await page.click("#deleteScreenshotAnnotation");
  assert.match(await page.locator("#annotationStatus").innerText(), /0 处标记/);
  await page.click('[data-mark-tool="rect"]');
  await page.mouse.move(reopened.x + 200, reopened.y + 80); await page.mouse.down();
  await page.mouse.move(reopened.x + 300, reopened.y + 150); await page.mouse.up();
  await page.click('[data-mark-tool="text"]');
  await page.mouse.click(reopened.x + 100, reopened.y + 170);
  assert.ok(await page.locator("#screenshotText").evaluate(input => input === document.activeElement));
  await page.locator("#screenshotText").fill("这里需要提前交代\n转移弹药需要时间");
  await page.selectOption("#screenshotFont", "Arial");
  await page.locator("#screenshotSize").fill("30"); await page.locator("#screenshotSize").press("Tab");
  await page.locator("#screenshotColor").evaluate(input => { input.value = "#ffff00"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  for (const id of ["screenshotBold", "screenshotItalic", "screenshotUnderline", "screenshotOutline", "screenshotBackground"]) await page.click(`#${id}`);
  await page.locator("#screenshotText").focus(); await page.locator("#screenshotText").press("Control+Enter");
  assert.equal(await page.locator("#screenshotText").isVisible(), false);
  await page.mouse.dblclick(reopened.x + 110, reopened.y + 180);
  assert.ok(await page.locator("#screenshotText").isVisible());
  await page.locator("#screenshotText").fill("取消这次修改"); await page.locator("#screenshotText").press("Escape");
  assert.ok(await page.locator("#annotationDialog").isVisible());
  await page.mouse.dblclick(reopened.x + 110, reopened.y + 180);
  assert.equal(await page.locator("#screenshotText").inputValue(), "这里需要提前交代\n转移弹药需要时间");
  await page.locator("#screenshotText").fill("这里需要提前交代\n转移弹药需要时间\n错峰推进");
  await page.screenshot({ path: path.join(out, "CodexTextEditing.png") });
  await page.locator("#screenshotText").press("Control+Enter");
  await page.mouse.move(reopened.x + 110, reopened.y + 180); await page.mouse.down();
  await page.mouse.move(reopened.x + 130, reopened.y + 195); await page.mouse.up();
  const textScale = await page.locator("#annotationCanvas").evaluate(canvas => canvas.clientWidth / canvas.width);
  const corner = { x: reopened.x + 120 + 400 * textScale, y: reopened.y + 185 + 117 * textScale };
  await page.mouse.move(corner.x, corner.y); await page.mouse.down();
  await page.mouse.move(corner.x - 80, corner.y); await page.mouse.up();
  await page.click("#undoAnnotation"); await page.click("#redoAnnotation");
  await page.screenshot({ path: path.join(out, "CodexAttachmentEditing.png") });
  await page.click("#attachScreenshot");
  await page.waitForFunction(() => !document.querySelector("#codexPendingImage").hidden && !document.querySelector("#annotationDialog").open);
  await page.click("#toggleCodexSessions");
  await page.locator("#inspectorResizeHandle").focus();
  await page.keyboard.press("Home");
  for (let step = 0; step < 9; step++) await page.keyboard.press("ArrowLeft");
  await page.click("#newCodexChat");
  assert.equal(await page.locator("#codexPrompt").inputValue(), "第二个会话的独立草稿");
  assert.ok(await page.locator("#codexPendingLocation").isVisible());
  assert.equal(JSON.parse(await page.locator("#codexContextDetail").textContent()).timeline.timeSeconds, 390);
  await page.click("#removeCodexLocation");
  assert.ok(await page.locator("#codexPendingLocation").isHidden());
  await page.locator(".lfChatSession").first().click();
  await page.waitForFunction(() => document.querySelector(".lfChatMessage.assistant"));
  await page.evaluate(() => LevelFlow.Seek(400));
  await page.locator("#codexPrompt").fill("继续调整当前点位"); await page.click("#sendCodexChat");
  await page.waitForFunction(() => document.querySelectorAll(".lfChatMessage.user").length === 3);
  assert.equal(calls.length, 2); assert.equal(calls[1].args[1], "resume");
  assert.ok(calls[1].args.includes("--image"));
  const revisedDirectory = path.dirname(calls[1].args[calls[1].args.indexOf("--output-last-message") + 1]);
  const revisedScreenshot = JSON.parse(fs.readFileSync(path.join(revisedDirectory, "ScreenshotFrame.json"), "utf8"));
  assert.equal(revisedScreenshot.context.time, 384);
  assert.equal(revisedScreenshot.screenshot.marks.length, 2);
  assert.equal(revisedScreenshot.screenshot.marks[0].kind, "rect");
  const textMark = revisedScreenshot.screenshot.marks[1];
  assert.equal(textMark.kind, "text"); assert.equal(textMark.fontSize, 30); assert.equal(textMark.fontFamily, "Arial");
  assert.equal(textMark.color, "#ffff00"); assert.equal(textMark.bold, true); assert.equal(textMark.italic, true);
  assert.equal(textMark.underline, true); assert.equal(textMark.outline, true); assert.equal(textMark.background, true);
  assert.equal(textMark.text, "这里需要提前交代\n转移弹药需要时间\n错峰推进");
  assert.ok(textMark.width < 400);
  assert.ok(Math.abs(textMark.a[0] - 120 / textScale) < 1);
  assert.ok(Math.abs(textMark.a[1] - 185 / textScale) < 1);
  assert.deepEqual(revisedScreenshot.screenshot.image, screenshot.screenshot.image);
  assert.equal(fs.existsSync(path.join(revisedDirectory, "Frame.json")), false);
  Finish(calls[1], "当前点位已处理。");
  await page.waitForFunction(() => document.querySelectorAll(".lfChatMessage.assistant").length === 2);
  await page.click("#newCodexChat");
  assert.ok(await page.locator("#codexPendingLocation").isHidden(), "restoring a draft preserves an explicitly removed location");
  assert.equal(await page.locator("#codexPendingUnits").isVisible(), true);
  await page.click("#removeCodexUnits");
  assert.equal(await page.locator("#codexPendingUnits").isVisible(), false);
  await page.click("#attachCodexUnits"); await page.click("#attachSelectedUnits");
  await page.click("#sendCodexChat");
  await page.waitForFunction(() => document.querySelectorAll(".lfChatSession").length === 2);
  assert.equal(calls.length, 3); assert.ok(!calls[2].args.includes("resume"));
  assert.ok(await page.locator("#interruptCodexChat").isVisible());
  await page.locator(".lfChatSession.selected").locator("..").locator(".lfChatSessionAction").click();
  await page.waitForFunction(() => document.querySelectorAll(".lfChatSession").length === 1 && document.querySelector("#codexChatTitle").textContent === "新会话");
  assert.equal(calls.length, 3, "deleting does not start or stop a CLI run");
  await page.click("#toggleDeletedCodexChats");
  await page.locator(".lfChatSession").click();
  await page.waitForFunction(() => document.querySelector("#codexProgress") && document.querySelector("#codexPrompt").readOnly);
  assert.ok(await page.locator("#sendCodexChat").isDisabled());
  await page.screenshot({ path: path.join(out, "CodexDeletedSessions.png") });
  await page.locator(".lfChatSessionAction").click();
  await page.waitForFunction(() => document.querySelectorAll(".lfChatSession").length === 2 && !document.querySelector("#codexPrompt").readOnly);
  assert.equal(await page.locator("#toggleDeletedCodexChats").getAttribute("aria-pressed"), "false");
  assert.ok(await page.locator("#codexProgress").isVisible());
  await page.locator("#codexPrompt").fill("中断时保留的草稿");
  await page.click("#interruptCodexChat");
  await page.waitForFunction(() => document.querySelector(".lfChatWaiting")?.textContent === "已中断");
  assert.ok(await page.locator("#interruptCodexChat").isHidden());
  assert.equal(await page.locator("#codexPrompt").inputValue(), "中断时保留的草稿");
  await page.locator("#codexPrompt").fill("中断后继续");
  await page.click("#sendCodexChat");
  await page.waitForFunction(() => document.querySelectorAll(".lfChatMessage.user").length === 2);
  assert.equal(calls.length, 4);
  Finish(calls[3], "第二个会话已完成。");
  await page.reload(); await page.waitForFunction(() => window.LevelFlow);
  assert.equal((await page.locator(".lfInspector").boundingBox()).width, 570);
  assert.equal(await page.locator("#newCodexChat").isVisible(), false);
  await page.click("#toggleCodexSessions");
  await page.waitForFunction(() => document.querySelectorAll(".lfChatSession").length === 2);
  await page.locator(".lfChatSession").first().click();
  await page.waitForFunction(() => document.querySelector(".lfChatMessage.assistant"));
  assert.equal(await page.locator(".lfChatMessage.assistant .lfChatBubble").innerText(), "第二个会话已完成。");
  assert.match(await page.locator(".lfChatMessage.user summary").first().innerText(), /^单位 · 1 个/);
  await page.setViewportSize({ width: 878, height: 720 });
  await page.locator("#inspectorResizeHandle").focus(); await page.keyboard.press("Home");
  assert.equal((await page.locator(".lfInspector").boundingBox()).width, 390);
  await page.screenshot({ path: path.join(out, "CodexConversationCompact.png") });
  await page.locator(".lfChatSession.selected").locator("..").locator(".lfChatSessionAction").click();
  await page.waitForFunction(() => document.querySelectorAll(".lfChatSession").length === 1);
  await page.reload(); await page.waitForFunction(() => window.LevelFlow);
  await page.click("#toggleCodexSessions");
  await page.waitForFunction(() => document.querySelectorAll(".lfChatSession").length === 1);
  await page.click("#toggleDeletedCodexChats");
  await page.locator(".lfChatSession").click();
  await page.waitForFunction(() => document.querySelector(".lfChatMessage.assistant"));
  assert.equal(await page.locator(".lfChatMessage.assistant .lfChatBubble").innerText(), "第二个会话已完成。");
  await page.locator(".lfChatSessionAction").click();
  await page.waitForFunction(() => document.querySelectorAll(".lfChatSession").length === 2);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: path.join(out, "CodexRestoredSession.png") });
  assert.ok(await page.locator("#sendCodexChat").isVisible());
  assert.deepEqual(errors, []);
  const theme = await page.evaluate(() => ({
    theme: document.body.classList.contains("edThemedSurface"),
    border: getComputedStyle(document.querySelector(".lfInspector")).borderTopColor,
    expected: getComputedStyle(document.body).getPropertyValue("--ed-edge").trim(),
    radius: getComputedStyle(document.querySelector(".lfInspector")).borderTopLeftRadius,
    panel: getComputedStyle(document.querySelector(".lfInspector")).backgroundImage,
    titleFont: getComputedStyle(document.querySelector(".lfTabs button")).fontFamily,
  }));
  assert.ok(theme.theme);
  assert.equal(theme.expected, "#c1bdab40");
  assert.equal(theme.radius, "9px");
  assert.equal(theme.border, "rgba(193, 189, 171, 0.25)");
  assert.ok(theme.panel.includes("rgba(8, 9, 7, 0.94)"));
  assert.ok(theme.titleFont.includes("TzTitleText"));
  // Initial URL positioning and later new chats both attach frozen location packets by default.
  await page.reload(); await page.waitForFunction(() => window.LevelFlow && document.querySelector("#codexConnection").textContent.includes("gpt-6.1-sol"));
  await page.locator("#codexPrompt").fill("默认定位的新会话"); await page.click("#sendCodexChat");
  await page.waitForFunction(() => document.querySelector("#codexProgress"));
  assert.equal(calls.length, 5);
  const defaultDirectory = path.dirname(calls[4].args[calls[4].args.indexOf("--output-last-message") + 1]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(defaultDirectory, "Frame.json"))).context.time, 384);
  assert.equal(JSON.parse(fs.readFileSync(path.join(defaultDirectory, "Location.json"))).timeline.timeSeconds, 384);
  Finish(calls[4], "默认定位已收到。");
  await page.evaluate(() => LevelFlow.Seek(410));
  await page.click("#toggleCodexSessions"); await page.click("#newCodexChat");
  assert.equal(JSON.parse(await page.locator("#codexContextDetail").textContent()).timeline.timeSeconds, 410);
  await page.evaluate(() => LevelFlow.Seek(420));
  await page.locator("#codexPrompt").fill("新建会话的默认定位"); await page.click("#sendCodexChat");
  await page.waitForFunction(() => document.querySelector("#codexProgress"));
  assert.equal(calls.length, 6);
  const nextDirectory = path.dirname(calls[5].args[calls[5].args.indexOf("--output-last-message") + 1]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(nextDirectory, "Frame.json"))).context.time, 410);
  assert.equal(JSON.parse(fs.readFileSync(path.join(nextDirectory, "Location.json"))).timeline.timeSeconds, 410);
  Finish(calls[5], "新建默认定位已收到。");
  assert.deepEqual(errors, []);
  console.log("ok  Safe Markdown, editable attachments, live steering/progress, and Encounter chat browser: shared menu theme, rounded layout, screenshot and location drafts, interrupt/continue, resume/new CLI sessions and reload history");
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
  assert.equal(path.dirname(storage), path.resolve(os.tmpdir()));
  fs.rmSync(storage, { recursive: true, force: true });
}
