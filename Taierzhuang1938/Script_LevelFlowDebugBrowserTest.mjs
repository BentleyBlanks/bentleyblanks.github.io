import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.join(root,"tmp","LevelFlowDebug");
await fs.mkdir(output,{recursive:true});
const server=process.env.ENCOUNTER_TEST_BASE?null:await ServeRoot(root);
const base=process.env.ENCOUNTER_TEST_BASE||`http://127.0.0.1:${server.address().port}`;
const canvasOnly=process.argv.includes("--canvas-only");
const suffix=canvasOnly?"CanvasOnly":"";
const browser=await LaunchBrowser({extraArgs:canvasOnly?["--disable-webgl"]:[]});
try {
  const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,acceptDownloads:true});
  await context.addInitScript(()=>{
    if(!location.pathname.startsWith("/Taierzhuang1938/")) return;
    localStorage.setItem("tengxian1938_audio_v1",JSON.stringify({master:0}));
    localStorage.setItem("tengxian1938_tools_volume_v1",JSON.stringify({volume:0,muted:true}));
  });
  const errors=[];
  context.on("page",window=>window.on("pageerror",error=>errors.push(error.message)));
  const page=await context.newPage();
  await page.goto(`${base}/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html?t=424`);
  await page.waitForFunction(()=>window.LevelFlow,null,{timeout:180000});
  const profilerButton=page.getByRole("button",{name:"Profiler",exact:true});
  const debuggerButton=page.getByRole("button",{name:"Frame Debugger",exact:true});
  assert.ok(await profilerButton.isEnabled()&&await debuggerButton.isEnabled());
  assert.equal(await page.locator(".lfPlayHost iframe").count(),0,"Debugging does not start Play");

  const [profiler]=await Promise.all([context.waitForEvent("page"),profilerButton.click()]);
  await profiler.locator("body.uiProfiler").waitFor();
  await profiler.setViewportSize({width:1280,height:720});
  assert.match(await profiler.title(),/编辑器预览/);
  await profilerButton.click();assert.equal(context.pages().length,2,"Reopening focuses the existing Profiler");
  await profiler.getByRole("button",{name:"录制中",exact:true}).click();
  await page.evaluate(()=>{
    LevelFlow.SetLayout(4);
    LevelFlow.SetViewType(0,"plan");LevelFlow.SetViewType(1,"scene");
    LevelFlow.SetViewType(2,"oblique");LevelFlow.SetViewType(3,"battle");
    LevelFlow.Seek(424);
  });
  await profiler.getByRole("button",{name:"清空",exact:true}).click();
  await profiler.getByRole("button",{name:/继续录制/}).click();
  await profiler.getByRole("button",{name:"函数采样",exact:true}).click();
  const startSampling=profiler.getByRole("button",{name:"开始采样",exact:true});
  const sampling=await startSampling.count()===1;
  if(sampling) await startSampling.click();
  await page.evaluate(()=>{
    const layout=LevelFlow.Inspect().viewports;
    layout.views[1].verticalFov=56;
    LevelFlow.RestoreViewports(layout);
    LevelFlow.SetPlaying(true);
  });
  await page.waitForFunction(()=>LevelFlow.Inspect().time>424.5,null,{timeout:30000});
  await page.evaluate(()=>LevelFlow.SetPlaying(false));
  if(sampling) {
    const stopSampling=profiler.getByRole("button",{name:"停止采样",exact:true});
    if(await stopSampling.isVisible()) await stopSampling.click();
    await profiler.getByText(/\d+ 样本 ·/).waitFor();
  }
  await profiler.getByRole("button",{name:"录制中",exact:true}).click();
  const hotspot=profiler.getByRole("button",{name:/^卡点/});
  await hotspot.click();
  const hotFrame=Number((await profiler.locator("#viewLabel").textContent()).slice(1));
  await profiler.getByRole("button",{name:"CPU",exact:true}).click();
  const [download]=await Promise.all([profiler.waitForEvent("download"),profiler.getByRole("button",{name:"导出 JSON",exact:true}).click()]);
  const recordingPath=path.join(output,`ProfilerRecording${suffix}.json`);
  await download.saveAs(recordingPath);
  const recording=JSON.parse(await fs.readFile(await download.path(),"utf8"));
  const frames=recording.frames;
  assert.deepEqual(recording.selection,{first:hotFrame,last:hotFrame});
  assert.equal(recording.hotspot.frameId,hotFrame);
  assert.ok(recording.hotspot.scope&&recording.hotspot.durationMs>0);
  assert.deepEqual(recording.sampleFields,["nameId","depth","startMs","durationMs"]);
  if(sampling) {
    assert.ok(recording.samplerTrace?.trace.samples.length>0,"JSON includes the original browser samples");
    assert.ok(recording.sampler.samples>0);
  }
  assert.equal(recording.environment.source,"Encounter Designer");
  assert.ok(frames.some(frame=>frame.state==="editorPreview"&&frame.cpu.encounterTimeline>0&&frame.cpu["encounterViewport/视口 1"]>0),
    "Profiler records real preview time before Play");
  assert.ok(frames.some(frame=>frame.preview?.viewports.length===4&&frame.preview.viewports[0].backend==="canvas2d"),
    "Each recorded render identifies its timeline position and viewport configuration");
  assert.ok(frames.some(frame=>frame.cpu["encounterTimeline/EvaluateFlow"]>0&&frame.cpu["encounterViewport/视口 1/人物与姓名"]>0),
    "Timeline and Canvas 2D costs are measured inside their parents");
  const detailFrame=frames.find(frame=>frame.cpu["encounterViewport/视口 2/3D 底图/地形几何"]>0);
  assert.ok(detailFrame,"The 3D viewport measures terrain generation");
  const parentKey="encounterViewport/视口 2/3D 底图";
  const terrainKey=`${parentKey}/地形几何`;
  const samples=[];
  for(let i=0;i<detailFrame.samples.length;i+=recording.sampleFields.length) {
    const [nameId,depth,start,duration]=detailFrame.samples.slice(i,i+recording.sampleFields.length);
    samples.push({key:recording.names[nameId],depth,start,end:start+duration});
  }
  const terrain=samples.find(sample=>sample.key===terrainKey),parent=samples.find(sample=>sample.key===parentKey);
  assert.ok(terrain&&parent&&terrain.depth===parent.depth+1&&terrain.start>=parent.start&&terrain.end<=parent.end+0.002);
  const supportsWebGl=await page.evaluate(()=>LevelFlow.Inspect().rendering.some(item=>item?.backend==="webgl2"));
  if(canvasOnly) assert.equal(supportsWebGl,false);
  if(supportsWebGl) {
    assert.ok(frames.some(frame=>frame.calls>0&&frame.triangles>0&&frame.gpuCalls?.["encounterViewport/视口 2"]>0),
      "The actual editor GL draw calls and triangles reach the Profiler");
    assert.ok(frames.slice(1).every(frame=>!frame.gpuCalls?.["encounterViewport/视口 1"]),"Canvas 2D is not counted as WebGL after changing the view types");
    assert.ok(frames.some(frame=>Object.keys(frame.gpuCalls||{}).some(key=>key.endsWith("/GPU 文字与标记"))),
      "The Profiler reports actual GPU overlay draws");
    assert.ok(frames.every(frame=>!Object.keys(frame.cpu).some(key=>key.endsWith("/gl.readPixels"))),
      "Ordinary recorded draws never synchronously read back scene depth");
  } else {
    assert.ok(frames.every(frame=>frame.calls===0&&!frame.gpu),"Software rendering does not invent GPU measurements");
    assert.ok(frames.some(frame=>frame.cpu[`${parentKey}/软件光栅输出`]>0),"Software raster output is measured");
  }
  assert.doesNotMatch(await profiler.locator("body").innerText(),/仅记录实际更新|忙闲探针|双击回到最新|父行已含子行|玩法照跑/);
  await profiler.screenshot({path:path.join(output,`EditorProfiler${suffix}.png`)});
  await profiler.locator('input[type="file"]').setInputFiles(recordingPath);
  await profiler.getByText("回放",{exact:true}).waitFor();
  assert.equal(await profiler.locator("#viewLabel").textContent(),`#${hotFrame}`);

  const [debuggerWindow]=await Promise.all([context.waitForEvent("page"),debuggerButton.click()]);
  await debuggerWindow.getByRole("heading",{name:"Frame Debugger"}).waitFor();
  await debuggerWindow.setViewportSize({width:1280,height:720});
  await debuggerButton.click();
  const debugWindows=await Promise.all(context.pages().filter(window=>window.url()==="about:blank").map(window=>window.title()));
  assert.equal(debugWindows.filter(title=>title.includes("Frame Debugger")).length,1,"Reopening focuses the existing Frame Debugger");
  const status=debuggerWindow.locator("#statusText");
  const capture=debuggerWindow.getByRole("button",{name:/捕获当前帧/});
  const groups=debuggerWindow.locator("#events > .node > .row .label");
  await capture.click();
  await debuggerWindow.waitForFunction(()=>document.querySelector("#statusText").textContent.includes("4 个视口"),null,{timeout:60000});
  assert.deepEqual(await groups.allTextContents(),[
    "视口 1 · 空间总览","视口 2 · Scene 自由视角","视口 3 · 立体俯视","视口 4 · 战斗局部",
  ]);
  const [report]=await Promise.all([debuggerWindow.waitForEvent("download"),debuggerWindow.getByRole("button",{name:"导出报告"}).click()]);
  const saved=JSON.parse(await fs.readFile(await report.path(),"utf8"));
  let first=0;
  const viewports=saved.passes.filter(pass=>pass.parent===null);
  for(const pass of viewports) {
    assert.equal(pass.first,first);
    assert.equal(pass.parent,null);
    assert.ok(pass.last>=pass.first);
    const events=saved.events.slice(pass.first,pass.last+1);
    assert.ok(events.every((event,offset)=>saved.passes[event.pass].parent===pass.id&&event.index===pass.first+offset));
    assert.equal(events.at(-1).label,"场景叠层与视口输出");
    first=pass.last+1;
  }
  assert.equal(first,saved.events.length);
  assert.equal(saved.events[0].label,"绘制 2D 底图");
  assert.ok(!saved.events.some(event=>[1,4].includes(saved.passes[saved.passes[event.pass].parent].viewport)&&event.draw));
  if(supportsWebGl) {
    const gpu=saved.events.filter(event=>saved.passes[event.pass].parent===viewports[1].id);
    assert.ok(gpu.some(event=>event.api==="drawElements"&&event.phase==="主场景"&&event.drawInfo.elements>0));
    assert.ok(gpu.some(event=>event.api==="clearBufferfv"&&event.phase==="阴影"));
    assert.ok(gpu.some(event=>event.api==="blitFramebuffer"&&event.phase==="输出到视口"));
    const visibility=gpu.find(event=>event.api==="drawArraysInstanced"&&event.phase==="人物可见性");
    assert.ok(visibility?.drawInfo.topology==="POINTS"&&visibility.drawInfo.parts[0].instances>0&&visibility.attachments[0].previewSize,
      "Instanced point probes expose their own visibility attachment");
    assert.ok(gpu.some(event=>event.draw&&event.phase==="GPU 文字与标记"&&event.attachments[0].previewSize),
      "The editor overlay backbuffer exposes each real draw");
    assert.ok(!gpu.some(event=>event.label==="合成软件光栅场景"),"Capturing GL state does not force the software renderer");
  } else {
    assert.ok(saved.events.every(event=>event.kind==="Canvas2D"));
    assert.ok(saved.events.some(event=>event.label==="合成软件光栅场景"));
    assert.equal(saved.gpuStatus,"unavailable");
  }
  await debuggerWindow.getByLabel("排序").selectOption("cpu");
  assert.deepEqual((await groups.allTextContents()).map(text=>text.slice(0,4)),["视口 1","视口 2","视口 3","视口 4"]);
  await debuggerWindow.getByLabel("排序").selectOption("order");
  await groups.nth(1).click();
  assert.ok(await debuggerWindow.locator("#output").evaluate(canvas=>canvas.width>1&&canvas.height>1),"Each viewport exposes its own captured output");
  await debuggerWindow.getByRole("button",{name:"展开全部"}).click();
  if(supportsWebGl) {
    const inScene=event=>saved.passes[event.pass].parent===viewports[2].id&&event.phase==="主场景";
    const draw=saved.events.find(event=>inScene(event)&&event.api==="drawElements");
    const clear=saved.events.find(event=>inScene(event)&&event.label==="Color 0");
    assert.equal(draw.drawInfo.geometryBatches>0,true);
    assert.ok(draw.uniforms.length>0&&draw.buffers.length>0&&saved.programs[draw.programId].sources.length===2);
    assert.ok(draw.attachments.every(attachment=>attachment.previewSize&&!attachment.previewError));
    const select=event=>debuggerWindow.locator(`[data-event="${event.index}"]`).click();
    const image=()=>debuggerWindow.locator("#output").evaluate(canvas=>canvas.toDataURL());
    await select(clear);
    const cleared=await image();
    await select(draw);
    const drawn=await image();
    assert.notEqual(drawn,cleared,"The indexed draw changes the color attachment");
    assert.equal(await debuggerWindow.locator("#previewError").textContent(),"");
    assert.ok(await debuggerWindow.locator("#png").isEnabled());
    await debuggerWindow.getByRole("button",{name:"R",exact:true}).click();
    assert.notEqual(await image(),drawn,"Color-channel controls transform the same captured attachment");
    await debuggerWindow.getByRole("button",{name:"RGBA",exact:true}).click();
    await debuggerWindow.getByLabel("渲染目标附件").selectOption(String(draw.attachments.findIndex(attachment=>attachment.depth)));
    assert.notEqual(await image(),drawn,"The captured depth attachment can be inspected independently");
    await debuggerWindow.getByLabel("渲染目标附件").selectOption("0");
    await debuggerWindow.getByRole("button",{name:"网格",exact:true}).click();
    assert.ok(await debuggerWindow.locator("#mesh").isVisible());
    assert.equal(await debuggerWindow.locator("#previewError").textContent(),"");
    await debuggerWindow.getByRole("button",{name:"输出",exact:true}).click();
    assert.equal(await image(),drawn,"Returning to a captured event retains its pixels");
    const previewHeight=await debuggerWindow.locator("#preview").evaluate(stage=>stage.offsetHeight);
    const grip=debuggerWindow.getByRole("button",{name:"调整预览高度"});
    await grip.press("ArrowUp");
    assert.equal(await debuggerWindow.locator("#preview").evaluate(stage=>stage.offsetHeight),previewHeight-16);
    assert.equal(await image(),drawn,"The resize control keeps the current draw selected");
    await grip.press("ArrowDown");
    await debuggerWindow.getByText("色阶",{exact:true}).click();
    await debuggerWindow.getByLabel("曝光 EV").fill("1");
    await debuggerWindow.getByLabel("曝光 EV").press("Tab");
    assert.notEqual(await image(),drawn,"Exposure remains available from the compact adjustment controls");
    await debuggerWindow.getByLabel("曝光 EV").fill("0");
    await debuggerWindow.getByLabel("曝光 EV").press("Tab");
    assert.equal(await image(),drawn);
    await debuggerWindow.getByRole("button",{name:"Shader 属性",exact:true}).click();
    await debuggerWindow.locator("#properties summary").filter({hasText:"Textures"}).click();
    const texture=debuggerWindow.locator("#properties .thumbButton").first();
    await texture.click();
    assert.equal(await debuggerWindow.getByRole("button",{name:"纹理",exact:true}).getAttribute("aria-pressed"),"true");
    assert.equal(await debuggerWindow.locator("#previewError").textContent(),"");
    await debuggerWindow.waitForFunction(()=>{
      const thumb=document.querySelector("#properties .thumbButton canvas");
      return thumb&&thumb.width!==300;
    });
    await debuggerWindow.getByRole("button",{name:"折叠全部"}).click();
    await debuggerWindow.screenshot({path:path.join(output,"EditorFrameDebuggerShader.png")});
    await debuggerWindow.getByRole("button",{name:"输出",exact:true}).click();
    await debuggerWindow.getByRole("button",{name:"原始数据",exact:true}).click();
    assert.match(await debuggerWindow.locator("#properties pre").textContent(),/drawElements/);
    await debuggerWindow.getByRole("button",{name:"详情",exact:true}).click();
    await debuggerWindow.screenshot({path:path.join(output,"EditorFrameDebuggerDraw.png")});
    await debuggerWindow.setViewportSize({width:960,height:720});
    assert.ok(await debuggerWindow.locator("#properties").evaluate(panel=>panel.clientHeight>=96),"Details stay reachable in a narrower window");
    assert.ok(await debuggerWindow.getByRole("button",{name:"保存 PNG"}).evaluate(button=>button.getBoundingClientRect().right<=innerWidth));
    await debuggerWindow.setViewportSize({width:1280,height:720});
  }
  await groups.nth(0).click();
  await debuggerWindow.getByRole("button",{name:"折叠全部"}).click();
  await page.screenshot({path:path.join(output,`EditorDebugToolbar${suffix}.png`)});
  await debuggerWindow.setViewportSize({width:1280,height:720});
  await debuggerWindow.screenshot({path:path.join(output,`EditorFrameDebugger${suffix}.png`)});

  const timeBefore=await page.evaluate(()=>{LevelFlow.SetPlaying(true);return LevelFlow.Inspect().time;});
  await page.waitForFunction(previous=>LevelFlow.Inspect().time>previous+0.25,timeBefore,{timeout:30000});
  assert.match(await status.textContent(),/4 个视口/,"The capture remains frozen while the editor keeps moving");
  await page.evaluate(()=>LevelFlow.SetPlaying(false));
  await debuggerWindow.getByLabel("捕获目标").selectOption("2");
  await capture.click();
  assert.deepEqual(await groups.allTextContents(),["视口 3 · 立体俯视"],"A capture can target one pane while four remain visible");
  await page.evaluate(()=>LevelFlow.SetLayout(1));
  await debuggerWindow.getByLabel("捕获目标").selectOption({index:0});
  await capture.click();
  await debuggerWindow.waitForFunction(()=>document.querySelector("#statusText").textContent.includes("1 个视口"));
  assert.equal(await groups.count(),1);
  assert.match((await groups.allTextContents())[0],/^视口 1/);
  await debuggerWindow.getByRole("button",{name:/清除捕获/}).click();
  assert.equal(await groups.count(),0,"Clearing releases the capture without touching the editor");
  await Promise.all([profiler.waitForEvent("close"),debuggerWindow.waitForEvent("close"),page.close()]);
  assert.deepEqual(errors,[]);
  console.log(`ok  Editor Profiler and Frame Debugger: nested CPU, JSON replay, ordered viewports and popup cleanup (${supportsWebGl?"WebGL2":"software"}, ${frames.length} frames, peak #${hotFrame}, JS samples ${recording.sampler?.samples??0})`);
} finally {
  await browser.close();
  if(server) await new Promise(resolve=>server.close(resolve));
}
