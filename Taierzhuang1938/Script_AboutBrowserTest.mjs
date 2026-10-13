import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { ABOUT_PAGES, ABOUT_SOURCES } from "./Data_About.mjs";

const out = path.join(import.meta.dirname, "_shots/About");
await fs.mkdir(out, {recursive:true});
const server = await ServeRoot(path.resolve(import.meta.dirname, ".."), 0);
const browser = await LaunchBrowser();
const page = await browser.newPage({viewport:{width:1600,height:900}});
if (process.argv.includes("--bundle")) {
  const { BuildBrowserBundle } = await import("./Script_BuildBrowserBundle.mjs");
  const bundle = await BuildBrowserBundle();
  await page.route("**/Taierzhuang1938/?*", route => route.fulfill({contentType:"text/html",body:bundle.html}));
  for (const file of bundle.files) await page.route("**/"+file.name+"?*", route => route.fulfill({contentType:"text/javascript",body:file.code}));
}
const errors = [], requests = [], snapshots = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("request", request => requests.push(request.url()));
const Ready = () => page.waitForFunction(() => window.Tengxian?.Debug?.CommandRoom?.().ready && window.Tengxian.menu.open, null, {timeout:120000});
const Stable = () => page.waitForFunction(() => window.Tengxian.Debug.CommandRoom().presentation.panelFocus > .999);
const Readable = async () => {
  await page.evaluate(() => document.fonts.ready);
  const state = await page.locator(".aboutReader").evaluate(reader => {
    const bounds=reader.getBoundingClientRect(), paper=reader.closest(".aboutPaper").getBoundingClientRect();
    const footer=reader.closest(".aboutPaper").querySelector(".aboutPaperFooter").getBoundingClientRect();
    return {width:bounds.width,height:bounds.height,scroll:reader.scrollHeight,client:reader.clientHeight,overflow:reader.scrollWidth>reader.clientWidth+1,
      clipGap:bounds.top-paper.top-paper.height*.13,footerGap:paper.bottom-footer.bottom-paper.height*.045,
      readerFooterGap:footer.top-bounds.bottom,
      inPaper:bounds.left>=paper.left && bounds.right<=paper.right && bounds.top>=paper.top && bounds.bottom<=paper.bottom};
  });
  assert.ok(state.inPaper && !state.overflow && state.width>100 && state.height>80, JSON.stringify(state));
  // The artwork clip extends through the top 13%; its worn bottom edge occupies 4.5%.
  // Check visible-art clearances independently of the CSS layout implementation.
  assert.ok(state.clipGap>=8 && state.footerGap>=8 && state.readerFooterGap>=-1,"Text must clear clip, paper edge and footer: "+JSON.stringify(state));
  return state;
};
try {
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?quality=high`);
 await Ready();
 assert.ok(!requests.some(url=>/Texture_AboutDossier|Font_AboutText/.test(url)), "About art/font stay lazy on title");
 await page.click('[data-act="credits"]');
 await Stable();
 await page.evaluate(async()=>{
   const url=getComputedStyle(document.querySelector(".aboutPaper"),"::before").backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];
   const image=new Image();image.src=url;await image.decode();
 });
 for(const entry of ABOUT_PAGES){
   await page.locator('[data-about="'+entry.id+'"]').click();
   const state=await Readable();
   assert.equal(await page.locator('[data-about="'+entry.id+'"]').getAttribute("aria-selected"),"true");
   assert.equal(await page.locator(".aboutTabs [tabindex='0']").count(),1);
   snapshots.push({page:entry.id,...state});
   if(entry.id==="credits"){
     assert.ok((await page.locator(".aboutAuthors").innerText()).includes("印河"));
     assert.ok((await page.locator(".aboutAuthors").innerText()).includes("BB"));
   }
   await page.screenshot({path:path.join(out,"Scene_"+entry.id+".png")});
 }
 assert.ok(snapshots.every(state=>state.scroll<=state.client+2),"All desktop pages must fit: "+JSON.stringify(snapshots));
 await page.locator(".aboutAction").click();
 assert.equal(await page.locator(".aboutSource").count(), ABOUT_SOURCES.length);
 await page.locator(".aboutReader").focus();
 await page.keyboard.press("End");
 await page.waitForFunction(()=>document.querySelector('.aboutReader').scrollTop>0,null,{timeout:3000});
 assert.ok(await page.locator(".aboutReader").evaluate(reader=>reader.scrollTop>0),"reader keyboard scroll remains native");
 await page.keyboard.press("Escape");
 assert.equal(await page.locator(".aboutSource").count(),0,"Escape folds attribution details first");
 assert.equal(await page.evaluate(()=>window.Tengxian.menu.mode),"credits");
 await page.locator('[data-about="work"]').focus();
 await page.keyboard.press("ArrowDown");
 assert.equal(await page.locator('[data-about="credits"]').getAttribute("aria-selected"),"true");
 await page.locator('[data-about="history"]').click();
 await page.locator(".aboutAction").click();
 assert.equal(await page.evaluate(()=>window.Tengxian.menu.mode),"codex");
 await page.keyboard.press("Escape");
 assert.equal(await page.evaluate(()=>window.Tengxian.menu.mode),"credits");
 assert.equal(await page.locator('[data-about="history"]').getAttribute("aria-selected"),"true");
 await page.keyboard.press("Escape");
 assert.equal(await page.evaluate(()=>window.Tengxian.menu.mode),"title");
 await page.click('[data-act="credits"]');
 await page.setViewportSize({width:390,height:844});
 for(const entry of ABOUT_PAGES){
   await page.locator('[data-about="'+entry.id+'"]').click();
   snapshots.push({viewport:{width:390,height:844},page:entry.id,...await Readable()});
 }
 await page.screenshot({path:path.join(out,"Scene_Mobile.png")});
 const allInside=await page.locator(".aboutTab,.aboutAction,.mnPanelFoot .mnBack").evaluateAll(elements=>elements.every(element=>{
   const r=element.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1 && r.top>=0 && r.bottom<=innerHeight+1;
 }));
 assert.ok(allInside,"mobile navigation and return stay in viewport");
 await page.emulateMedia({reducedMotion:"reduce"});
 for (const viewport of [
   {width:1200,height:960}, {width:1000,height:800}, {width:900,height:1100},
   {width:760,height:1024}, {width:761,height:1024}, {width:844,height:390}, {width:1000,height:500},
 ]) {
   await page.setViewportSize(viewport);
   for(const entry of ABOUT_PAGES) {
     await page.locator('[data-about="'+entry.id+'"]').click();
     snapshots.push({viewport,page:entry.id,...await Readable()});
   }
   if(viewport.width===1200) await page.screenshot({path:path.join(out,"Scene_Sidebar.png")});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,"Data_AboutBrowserCheck.json"),JSON.stringify({snapshots,errors},null,2));
 console.log("PASS About: four sections, real authors, lazy assets/fonts, attribution details, keyboard scroll/tabs, history round-trip, Escape, narrow/short layouts");
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
