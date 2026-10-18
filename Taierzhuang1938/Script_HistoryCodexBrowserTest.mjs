// Actual player journeys: soft paper folds, cancellation, keyboard/touch and lifecycle.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { HISTORY_CODEX_ENTRIES, HISTORY_CODEX_CATEGORIES, HISTORY_CODEX_MARKS } from "./Data_HistoryCodex.mjs";
const root=path.resolve(import.meta.dirname,".."),out=path.join(import.meta.dirname,"_shots/HistoryCodex");
await fs.mkdir(out,{recursive:true});
const supplied=process.argv.find(arg=>arg.startsWith("--url="))?.slice(6);
const server=supplied?null:await ServeRoot(root,0),origin=supplied||`http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser=await LaunchBrowser();
  const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],failed=[],images=[];
  page.on("pageerror",error=>errors.push(String(error)));
  page.on("response",response=>{if(response.status()>=400)failed.push(`${response.status()} ${response.url()}`);});
  page.on("request",request=>{if(request.url().includes("/Menu/History/"))images.push(request.url());});
  await page.goto(`${origin}/Taierzhuang1938/?quality=high`,{waitUntil:"commit"});
  await page.waitForFunction(()=>window.Tengxian?.state.ready&&window.Tengxian.menu.open,null,{timeout:120000});
  assert.equal(images.length,0,"Title screen does not load archive images");
  await page.click('[data-act="codex"]');await page.locator(".hcCard").first().waitFor();await page.evaluate(()=>document.fonts.ready);
  const Loaded=()=>page.waitForFunction(()=>[...document.querySelectorAll(".hcRoot img[src]")].every(image=>image.complete&&image.naturalWidth>0));
  const Ready=async()=>{await page.waitForFunction(()=>document.querySelector(".hcBookReader")?.dataset.bookReady==="true");await Loaded();};
  const Rest=async()=>{await page.waitForFunction(()=>window.Tengxian.menu.historyCodex.book?.flip?.getState()==="read");await Loaded();};
  const Shot=async name=>{await Loaded();const buffer=await page.screenshot({path:path.join(out,`Scene_${name}.png`)});await sharp(buffer).resize({width:1280,height:720,fit:"inside",withoutEnlargement:true}).jpeg({quality:82}).toFile(path.join(out,`Preview_${name}.jpg`));};
  const State=()=>page.evaluate(()=>{const c=window.Tengxian.menu.historyCodex;return{mode:window.Tengxian.menu.mode,entry:c.entryId,page:c.page,visible:c.book?.VisiblePages,scale:c.reader?.scale??c.book?.scale,x:c.reader?.x??c.book?.x,y:c.reader?.y??c.book?.y};});
  const Bounds=()=>page.evaluate(()=>{const b=window.Tengxian.menu.historyCodex.book,r=b.flip.getBoundsRect(),p=b.flip.getUI().getDistElement().getBoundingClientRect(),portrait=b.flip.getOrientation()==="portrait";return{x:p.x+r.left+(portrait?r.pageWidth:0),y:p.y+r.top,w:r.pageWidth*(portrait?1:2),h:r.height};});
  const Fold=async(fromX,toX,release=true)=>{const b=await Bounds();await page.mouse.move(b.x+b.w*fromX,b.y+b.h-8);await page.mouse.down();await page.mouse.move(b.x+b.w*toX,b.y+b.h*.66,{steps:15});if(release){await page.mouse.up();await Rest();}};
  assert.equal(await page.locator(".hcCard").count(),HISTORY_CODEX_ENTRIES.length);await Shot("Overview");
  for(const category of HISTORY_CODEX_CATEGORIES){
    await page.click(`[data-hc-action="category"][data-hc-id="${category}"]`);
    const entries=HISTORY_CODEX_ENTRIES.filter(entry=>entry.category===category);
    assert.equal(await page.locator(".hcCard").count(),entries.length);
    for(const entry of entries){
      await page.click(`[data-hc-action="open"][data-hc-id="${entry.id}"]`);
      if(category==="documents")await Ready();else await Loaded();
      assert.equal((await State()).entry,entry.id);await Shot(entry.id);
      if(category==="people")assert.ok(await page.locator(".hcRelated").evaluate(el=>el.getBoundingClientRect().bottom<=el.parentElement.getBoundingClientRect().bottom+1));
      if(entry.pages?.length===1){assert.ok(await page.locator('[data-hc-action="next"]').isDisabled());assert.equal(await page.locator(".hcReaderTools").count(),0);}
      await page.keyboard.press("Escape");
    }
  }
  await page.click('[data-hc-action="category"][data-hc-id="all"]');await page.locator(".hcCard").first().focus();await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
  await page.click('[data-hc-action="stage"][data-hc-index="4"]');assert.match(await page.locator(".hcStage").innerText(),/滕县失守/);await page.keyboard.press("Escape");
  const ledger=HISTORY_CODEX_ENTRIES.find(entry=>entry.category==="creation");
  assert.equal(await page.locator(`[data-hc-id="${ledger.id}"] .hcCardArt text`).count(),ledger.marks.length*2+1,"Ledger card lists every mark and its count");
  await page.click(`[data-hc-action="open"][data-hc-id="${ledger.id}"]`);await Loaded();
  assert.deepEqual(await page.locator('[data-hc-action="mark"]').evaluateAll(tabs=>tabs.map(tab=>tab.dataset.hcId)),HISTORY_CODEX_MARKS);
  for(const mark of ledger.marks){
    await page.click(`[data-hc-action="mark"][data-hc-id="${mark.id}"]`);
    assert.equal(await page.locator('[data-hc-action="mark"][aria-selected="true"]').getAttribute("data-hc-id"),mark.id);
    assert.equal(await page.locator(".hcMarkItem").count(),mark.items.length);
    assert.equal(await page.locator(".hcMarkRefs a").count(),mark.items.reduce((sum,item)=>sum+(item.refs?.length||0),0));
    assert.ok(await page.locator(".hcMarkRefs a").evaluateAll(links=>links.every(link=>link.rel==="noopener noreferrer"&&link.target==="_blank")));
    await Shot(`Ledger_${mark.id}`);
  }
  assert.match(await page.locator(".hcMarkHead").innerText(),/出处待查/,"Unverified items are shown as pending, not as fact");
  await page.locator('[data-hc-action="mark"][data-hc-id="pending"]').focus();await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(()=>window.Tengxian.menu.historyCodex.mark),"recorded","Mark tabs wrap with arrow keys");
  await page.keyboard.press("r");assert.equal(await page.locator(".hcSources a").count(),ledger.sources.length);await page.keyboard.press("Escape");
  assert.equal((await State()).entry,ledger.id);await page.keyboard.press("Escape");
  await page.click('[data-hc-action="open"][data-hc-id="WangMingzhang"]');await page.keyboard.press("r");
  assert.equal(await page.locator(".hcSources").evaluate(dialog=>dialog.open),true);assert.ok(await page.locator(".hcSources a").count()>=2);
  assert.equal(await page.locator(".hcSources a").first().getAttribute("rel"),"noopener noreferrer");await page.keyboard.press("Escape");assert.equal((await State()).entry,"WangMingzhang");
  await page.click('[data-hc-action="related"][data-hc-id="ZhangMemoir"]');await Ready();assert.ok(await page.locator('[data-hc-action="previous"]').isDisabled());
  assert.ok(!images.some(url=>/ZhangMemoir17Image/.test(url)),"Distant pages remain unloaded");assert.equal(await page.locator(".hcReaderTools").count(),0);
  await Fold(.99,.70,false);assert.equal(await page.locator(".hcBookReader").getAttribute("data-book-state"),"user_fold");
  assert.ok(await page.locator('.hcBookPage[style*="polygon"]').count()>0,"Dragged paper has a clipped fold");await Shot("BookFold");
  await page.mouse.up();await Rest();assert.equal((await State()).page,0,"Short drag springs back");
  await Fold(.99,.22);assert.deepEqual((await State()).visible,[1,2],"Crossing the spine turns to 62-63");await Fold(.01,.82);assert.deepEqual((await State()).visible,[0],"Left sheet turns back");
  const seen=new Set([0]);
  while(!await page.locator('[data-hc-action="next"]').isDisabled()){
    await page.click('[data-hc-action="next"]');await Rest();for(const index of (await State()).visible)seen.add(index);
  }
  assert.deepEqual([...seen].sort((a,b)=>a-b),Array.from({length:17},(_,i)=>i));assert.match(await page.locator(".hcBookFolio").innerText(),/76–77/);
  await page.keyboard.press("PageUp");await Rest();assert.deepEqual((await State()).visible,[13,14]);
  await page.locator('.hcBookPage[data-source-page="13"] img').dblclick({position:{x:200,y:300}});assert.equal(await page.locator(".hcBookLens").evaluate(dialog=>dialog.open),true);
  await page.locator(".hcBookLensViewport").hover();await page.mouse.wheel(0,-300);await page.waitForFunction(()=>window.Tengxian.menu.historyCodex.book.scale>1);
  const box=await page.locator(".hcBookLensViewport").boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+70,box.y+box.height/2+60,{steps:5});await page.mouse.up();assert.ok((await State()).y!==0);
  await page.keyboard.press("Escape");assert.equal((await State()).entry,"ZhangMemoir");await page.click('[data-hc-action="readTab"][data-hc-id="sourceInfo"]');await Ready();assert.equal(await page.locator(".hcSourceInfo a").count(),1);assert.equal((await State()).page,13);
  await page.evaluate(()=>{window.closedBookRender=window.Tengxian.menu.historyCodex.book.flip.getRender();});await page.keyboard.press("Escape");
  assert.deepEqual(await page.evaluate(()=>({stopped:window.closedBookRender.stopped,frame:window.closedBookRender.frame})),{stopped:true,frame:0});
  await page.click('[data-hc-action="restoration"]');assert.ok(await page.locator(".mnCodexRow").count()>20);await page.keyboard.press("Escape");
  await page.setViewportSize({width:390,height:844});await Shot("MobileOverview");assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.click(`[data-hc-action="open"][data-hc-id="${ledger.id}"]`);await Loaded();const markTab=page.locator('[data-hc-action="mark"][data-hc-id="invented"]');await markTab.scrollIntoViewIfNeeded();
  const scrolled=await page.locator(".hcScroll").evaluate(el=>el.scrollTop);await markTab.click();
  assert.ok(scrolled>0&&Math.abs(await page.locator(".hcScroll").evaluate(el=>el.scrollTop)-scrolled)<2,"Tapping a mark keeps the phone scroll");
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await Shot("MobileLedger");await page.keyboard.press("Escape");
  await page.click('[data-hc-action="open"][data-hc-id="ZhangMemoir"]');await Ready();assert.equal(await page.locator(".hcBookReader").getAttribute("data-book-orientation"),"portrait");await Shot("MobileBook");
  const client=await page.context().newCDPSession(page),b=await Bounds();
  await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:b.x+b.w-8,y:b.y+b.h-12}]});
  for(let i=1;i<=12;i++)await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:b.x+b.w*(1-.87*i/12),y:b.y+b.h*(1-.18*i/12)}]});
  await client.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await Rest();assert.equal((await State()).page,1,"Touch turns one page in portrait");
  await page.keyboard.press("PageUp");await Rest();assert.equal((await State()).page,0,"Portrait keyboard back-turn reaches the first scan");
  const tap=await Bounds();await page.mouse.click(tap.x+tap.w-8,tap.y+tap.h-8);await Rest();assert.equal((await State()).page,1,"Portrait corner tap advances");
  await page.mouse.click(tap.x+8,tap.y+tap.h-8);await Rest();assert.equal((await State()).page,0,"Portrait left corner tap goes back");
  await page.keyboard.press("Escape");await page.emulateMedia({reducedMotion:"reduce"});await page.click('[data-hc-action="open"][data-hc-id="ZhangMemoir"]');await Ready();await page.keyboard.press("PageDown");assert.equal((await State()).page,1);assert.equal(await page.locator(".hcBookReader").getAttribute("data-book-state"),"read");
  await page.keyboard.press("Escape");await page.click('[data-hc-action="open"][data-hc-id="XinhuaDaily"]');await Loaded();await page.click('[data-hc-action="zoomIn"]');assert.equal((await State()).scale,1.25);await page.click('[data-hc-action="fit"]');assert.equal((await State()).scale,1);
  await page.click('[data-hc-action="expand"]');await page.keyboard.press("Escape");assert.equal((await State()).entry,"XinhuaDaily");await page.keyboard.press("Escape");await page.keyboard.press("Escape");assert.equal((await State()).mode,"title");
  await page.evaluate(()=>{const m=window.Tengxian.menu;m.live=false;m.Show("pause");m.Activate("codex");});await page.waitForFunction(()=>window.Tengxian.menu.mode==="codex");await page.keyboard.press("Escape");assert.equal((await State()).mode,"pause");
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  await fs.writeFile(path.join(out,"Data_BrowserResult.json"),JSON.stringify({passed:true,entries:HISTORY_CODEX_ENTRIES.length,images:[...new Set(images)],errors,failed},null,2));
  console.log("PASS HistoryCodex: sourced records, fact/invention marks, real folds/rebound/back, all 17 pages, zoom, disposal, touch, reduced motion, sources and menus");
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
