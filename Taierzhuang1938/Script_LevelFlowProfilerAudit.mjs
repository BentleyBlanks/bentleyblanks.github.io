// Replay real mouse/keyboard input and audit the editor Profiler against the
// underlying WebGL calls and timer results. Outputs stay in the local tmp tree.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {LaunchBrowser} from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import {ServeRoot} from "./Script_DevServer.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.join(root,"tmp","EncounterProfilerAudit",process.argv.includes("--before")?"Before":"After");
await fs.mkdir(output,{recursive:true});
const server=process.env.ENCOUNTER_TEST_BASE?null:await ServeRoot(root);
const base=process.env.ENCOUNTER_TEST_BASE||`http://127.0.0.1:${server.address().port}`;
const browser=await LaunchBrowser();
function Percentile(values,q) {return values.toSorted((a,b)=>a-b)[Math.ceil(q*values.length)-1]??null;}

try {
  const context=await browser.newContext({viewport:{width:3392,height:1384},deviceScaleFactor:1,acceptDownloads:true});
  await context.addInitScript(()=>{
    if(location.protocol!=="http:") return;
    localStorage.setItem("tengxian1938_audio_v1",'{"master":0}');
    localStorage.setItem("tengxian1938_tools_volume_v1",'{"volume":0,"muted":true}');
  });
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base+"/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html?t=0");
  await page.waitForFunction(()=>window.LevelFlow,null,{timeout:180000});
  await page.addStyleTag({content:"#flowMap{width:3004px!important;height:1087px!important}"});
  await page.evaluate(async()=>{
    const {LevelFlowDebug}=await import("./Script_LevelFlowDebug.mjs");
    const {EncounterGpuRaster}=await import("./Script_LevelFlowGpuRaster.mjs");
    const gl=EncounterGpuRaster()?.gl;
    if(!gl) throw new Error("This timing audit requires the WebGL2 editor");
    const timer=gl.getExtension("EXT_disjoint_timer_query_webgl2"),queries=new Map();
    const rows=[],renderer=gl.getExtension("WEBGL_debug_renderer_info");
    window.audit={rows,driverErrors:[],timer:!!timer,renderer:renderer?gl.getParameter(renderer.UNMASKED_RENDERER_WEBGL):null,action:"start"};
    let active=null,openQuery=null;
    const debug=LevelFlowDebug.prototype,begin=debug.BeginFrame,end=debug.EndFrame;
    debug.BeginFrame=function(...args) {
      const start=performance.now();begin.apply(this,args);
      active=this.profileFrame?{id:this.profileFrame.frameId,start,action:audit.action,calls:0,tris:0,
        queries:[],getError:0,checks:0,blit:0,blits:0,reads:0}:null;
    };
    debug.EndFrame=function(...args) {
      const row=active;
      try {return end.apply(this,args);}
      finally {if(row) {row.end=performance.now();rows.push(row);}active=null;}
    };
    for(const api of ["drawArrays","drawElements","drawArraysInstanced","drawElementsInstanced","getError","blitFramebuffer","readPixels","beginQuery","endQuery","getQueryParameter"]) {
      const native=gl[api];
      gl[api]=function(...args) {
        const start=performance.now(),result=native.apply(gl,args);
        if(api==="getQueryParameter"&&args[1]===gl.QUERY_RESULT&&queries.has(args[0])) {
          const q=queries.get(args[0]);q.ms=result/1e6;queries.delete(args[0]);
        }
        if(api==="getError"&&result!==gl.NO_ERROR) audit.driverErrors.push(result);
        if(!active) return result;
        if(api.startsWith("draw")) {
          const indexed=api.includes("Elements"),n=args[indexed?1:2],instances=api.endsWith("Instanced")?args.at(-1):1;
          const triangles=args[0]===gl.TRIANGLES?Math.floor(n/3):[gl.TRIANGLE_FAN,gl.TRIANGLE_STRIP].includes(args[0])?Math.max(0,n-2):0;
          active.calls++;active.tris+=instances*triangles;
          if(openQuery) {openQuery.calls++;openQuery.tris+=instances*triangles;}
        } else if(api==="beginQuery"&&timer&&args[0]===timer.TIME_ELAPSED_EXT) {
          const slot={ms:null,calls:0,tris:0};active.queries.push(slot);queries.set(args[1],slot);openQuery=slot;
        } else if(api==="endQuery"&&timer&&args[0]===timer.TIME_ELAPSED_EXT) openQuery=null;
        else if(api==="getError") {active.checks++;active.getError+=performance.now()-start;}
        else if(api==="readPixels") active.reads++;
        else if(api==="blitFramebuffer") {active.blits++;active.blit+=performance.now()-start;}
        return result;
      };
    }
  });
  const [panel]=await Promise.all([context.waitForEvent("page"),page.getByRole("button",{name:"Profiler",exact:true}).click()]);
  await panel.locator("body.uiProfiler").waitFor();
  await panel.getByRole("button",{name:"录制中",exact:true}).click();
  await panel.getByRole("button",{name:"清空",exact:true}).click();
  await panel.getByRole("button",{name:/继续录制/}).click();
  const requestSamples=process.argv.includes("--sample");
  let sampling=false;
  if(requestSamples) {
    await panel.getByRole("button",{name:"函数采样",exact:true}).click();
    const start=panel.getByRole("button",{name:"开始采样",exact:true});
    sampling=await start.count()===1;
    if(sampling) await start.click();
  }
  await page.bringToFront();
  const surface=page.locator("#flowMap"),box=await surface.boundingBox();
  const x=Math.floor(box.x+box.width*.43),y=Math.floor(box.y+box.height*.55);
  const Frame=()=>page.evaluate(()=>new Promise(requestAnimationFrame));
  const Action=value=>page.evaluate(value=>{audit.action=value;},value);
  for(const pass of ["cold","warm"]) {
    await Action(pass+"-look");await page.mouse.move(x,y);await page.mouse.down({button:"right"});
    for(let i=1;i<=96;i++) {
      const t=i/96;
      await page.mouse.move(x+190*Math.sin(t*Math.PI*2),y-87*Math.sin(t*Math.PI));
      await Frame();
    }
    await page.mouse.up({button:"right"});await Frame();
  }
  await Action("pan");await page.mouse.down({button:"middle"});await page.mouse.move(x+86,y+43,{steps:12});await page.mouse.up({button:"middle"});await Frame();
  await Action("fly");await page.mouse.down({button:"right"});await page.keyboard.down("w");
  for(let i=0;i<16;i++) await Frame();
  await page.keyboard.up("w");await page.mouse.up({button:"right"});
  await Action("wheel");await page.mouse.wheel(0,-120);await Frame();await page.mouse.wheel(0,120);await Frame();
  await Action("layout");await page.selectOption("#viewportLayout","2");await Frame();
  await page.selectOption("#viewportLayout","1");await Frame();
  if(sampling) {
    const stop=panel.getByRole("button",{name:"停止采样",exact:true});
    if(await stop.count()) await stop.click();
    await panel.getByText(/\d+ 样本 ·/).waitFor();
  }
  if(requestSamples) await panel.getByRole("button",{name:"CPU",exact:true}).click();
  // Let the recorder attach any completed GPU results before exporting.
  await page.waitForTimeout(400);
  await panel.getByRole("button",{name:"录制中",exact:true}).click();
  const [download]=await Promise.all([panel.waitForEvent("download"),panel.getByRole("button",{name:"导出 JSON",exact:true}).click()]);
  const recordingFile=path.join(output,"Profiler.json");await download.saveAs(recordingFile);
  const p=JSON.parse(await fs.readFile(recordingFile,"utf8")),native=await page.evaluate(async()=>{
    const {EncounterGpuRaster}=await import("./Script_LevelFlowGpuRaster.mjs");EncounterGpuRaster().gl.getError();return window.audit;
  });
  assert.deepEqual(native.driverErrors,[],"no WebGL command errors during the audit");
  if(sampling) assert.ok(p.sampler?.samples>0&&p.samplerTrace?.trace?.samples?.length===p.sampler.samples,"raw JS sampling trace accompanies its summary");
  const refs=new Map(native.rows.map(row=>[row.id,row])),drawn=[],missingGpu=[];
  let maxCpuOutside=0,maxClockSlack=0,worstGpuDelta=0,verifiedSegments=0,verifiedSamples=0;
  let nativeChecks=0,nativeBlits=0,maxCheckDelta=0,maxBlitDelta=0;
  for(const f of p.frames) {
    const row=refs.get(f.id);assert.ok(row,"every recorded frame has a matching measured callback");
    assert.equal(f.calls,row.calls);assert.equal(f.triangles,row.tris);
    let calls=0,tris=0,gpuSum=0;
    for(let i=0;i<(f.gpuSegs?.length||0);i+=5){calls+=f.gpuSegs[i+3];tris+=f.gpuSegs[i+4];}
    const buckets=new Map();
    for(let i=0;i<(f.gpuSegs?.length||0);i+=5) {
      let name=p.names[f.gpuSegs[i]];
      while(name) {
        const totals=buckets.get(name)||{calls:0,tris:0,ms:0,submit:0,segments:0};
        totals.calls+=f.gpuSegs[i+3];totals.tris+=f.gpuSegs[i+4];totals.submit+=f.gpuSegs[i+2];
        totals.ms+=f.gpuSegMs?.[i/5]||0;totals.segments++;buckets.set(name,totals);
        const slash=name.lastIndexOf("/");name=slash<0?"":name.slice(0,slash);
      }
    }
    for(const [name,t] of buckets) {
      assert.equal(f.gpuCalls?.[name]||0,t.calls);
      assert.equal(f.gpuTris?.[name]||0,t.tris);
      assert.ok(Math.abs((f.gpuCpu?.[name]||0)-t.submit)<.002*t.segments);
      if(f.gpuTotal!=null) assert.ok(Math.abs((f.gpu?.[name]||0)-t.ms)<.002*t.segments);
    }
    assert.equal(calls,row.calls);assert.equal(tris,row.tris);
    if(f.gpuTotal!=null) {
      assert.equal(f.gpuSegMs.length,row.queries.length);
      for(const [i,q] of row.queries.entries()) {
        assert.ok(Number.isFinite(q.ms));gpuSum+=q.ms;verifiedSegments++;
        assert.equal(f.gpuSegs[i*5+3],q.calls);assert.equal(f.gpuSegs[i*5+4],q.tris);
        worstGpuDelta=Math.max(worstGpuDelta,Math.abs(f.gpuSegMs[i]-q.ms));
      }
      assert.ok(Math.abs(gpuSum-f.gpuTotal)<.002);
    } else if(f.calls) missingGpu.push(f.id);
    const samples=[],totals=new Map(),counts=new Map();
    for(let i=0;i<(f.samples?.length||0);i+=4) {
      const [name,depth,start,duration]=f.samples.slice(i,i+4);
      assert.ok(start>=-.002&&duration>=0&&start+duration<=f.cpuMs+.003);
      samples.push({depth,start,end:start+duration});
      const key=p.names[name];counts.set(key,(counts.get(key)||0)+1);totals.set(key,(totals.get(key)||0)+duration);verifiedSamples++;
    }
    for(const child of samples) if(child.depth) {
      assert.ok(samples.some(s=>s.depth===child.depth-1&&s.start<=child.start+.002&&s.end>=child.end-.002),
        "child CPU intervals stay inside a real parent");
    }
    for(const [key,count] of counts) assert.equal(f.cpuCalls[key],count);
    const rootMs=samples.filter(s=>s.depth===0).reduce((v,s)=>v+s.end-s.start,0);
    assert.ok(Math.abs(rootMs+f.other-f.cpuMs)<.003*samples.length+.002);
    for(const [key,ms] of totals) assert.ok(Math.abs(ms-(f.cpu[key]||0))<.003*(f.cpuCalls[key]||1));
    const measured=row.end-row.start;
    maxCpuOutside=Math.max(maxCpuOutside,f.cpuMs-measured);maxClockSlack=Math.max(maxClockSlack,measured-f.cpuMs);
    if(f.calls) {
      if(!process.argv.includes("--before")) {
        assert.ok(f.preview.viewports.some(v=>v.camera?.eye?.length===3&&v.camera.forward?.length===3),"record the actually drawn camera");
        if(f.gpuTotal!=null) assert.equal(f.gpuTiming,"ready");
        const Sum=(bag,suffix)=>Object.entries(bag||{}).reduce((sum,[key,v])=>sum+(key.endsWith(suffix)?v:0),0);
        assert.equal(Sum(f.cpuCalls,"/gl.getError"),row.checks);
        assert.equal(Sum(f.cpuCalls,"/gl.blitFramebuffer"),row.blits);
        nativeChecks+=row.checks;nativeBlits+=row.blits;
        maxCheckDelta=Math.max(maxCheckDelta,Math.abs(Sum(f.cpu,"/gl.getError")-row.getError));
        maxBlitDelta=Math.max(maxBlitDelta,Math.abs(Sum(f.cpu,"/gl.blitFramebuffer")-row.blit));
      }
      drawn.push({...row,cpu:f.cpuMs,gpu:f.gpuTotal,interval:f.interval||null,redraw:f.preview?.redrawIntervalMs});
    }
  }
  assert.ok(maxCpuOutside<.3,`CPU interval extends outside native bracket: ${maxCpuOutside} ms`);
  assert.ok(worstGpuDelta<.002,`timer difference: ${worstGpuDelta} ms`);
  assert.ok(drawn.length>100&&drawn.every(r=>r.reads===0));
  if(!process.argv.includes("--before")) assert.ok(nativeBlits>0&&nativeChecks>0,"output and resource validation both ran under instrumentation");
  const peak=p.frames.reduce((a,b)=>Math.max(b.cpuMs,b.gpuTotal||0)>Math.max(a.cpuMs,a.gpuTotal||0)?b:a);
  assert.equal(p.hotspot.frameId,peak.id);
  const gpu=(peak.gpuTotal||0)>peak.cpuMs,bag=gpu?peak.gpu:peak.cpu;
  const exclusive=new Map(Object.entries(bag));
  for(const [key,ms] of Object.entries(bag)) {
    const slash=key.lastIndexOf("/");if(slash<0) continue;
    const parent=key.slice(0,slash);exclusive.set(parent,(exclusive.get(parent)||0)-ms);
  }
  if(!gpu) exclusive.set("other",peak.other);
  assert.equal(p.hotspot.thread,gpu?"GPU":"CPU");
  assert.ok(Math.abs((exclusive.get(p.hotspot.scope)||0)-Math.max(...exclusive.values()))<.003);
  assert.ok(Math.abs(exclusive.get(p.hotspot.scope)-p.hotspot.durationMs)<.003);
  assert.deepEqual(errors,[]);
  const stats={};
  for(const action of ["all",...new Set(drawn.map(r=>r.action))]) {
    const rows=action==="all"?drawn:drawn.filter(r=>r.action===action);
    const Times=key=>[.5,.95,1].map(q=>Percentile(rows.map(r=>r[key]).filter(Number.isFinite),q));
    stats[action]={frames:rows.length,cpu:Times("cpu"),gpu:Times("gpu"),contiguousIntervals:rows.filter(r=>r.interval>0).length,interval:Times("interval"),redraw:Times("redraw"),getError:Times("getError"),blit:Times("blit"),
      getErrorCalls:rows.reduce((sum,r)=>sum+r.checks,0)};
  }
  const report={environment:p.environment,renderer:native.renderer,timerAvailable:native.timer,frames:p.frames.length,
    driverErrors:native.driverErrors,verifiedSegments,verifiedSamples,missingGpu,jsSamples:p.sampler?.samples??0,maxCpuOutside,maxClockSlack,worstGpuDelta,nativeChecks,nativeBlits,maxCheckDelta,maxBlitDelta,stats};
  await fs.writeFile(path.join(output,"Audit.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
} finally {await browser.close();if(server) await new Promise(resolve=>server.close(resolve));}
