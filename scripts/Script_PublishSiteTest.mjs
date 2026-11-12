// Exercise actual publication URLs, including images constructed dynamically by workers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from '../Taierzhuang1938/Script_DevServer.mjs';

const Arg=name=>process.argv.find(value=>value.startsWith(name+'='))?.slice(name.length+1);
const root=Arg('--site-root'),remote=Arg('--url');
if(!root&&!remote)throw Error('Supply --site-root=<publication directory> or --url=<site URL>');
const server=root?await ServeRoot(path.resolve(root),0):null;
const base=(remote||`http://127.0.0.1:${server.address().port}`).replace(/\/$/,'');
const browser=await LaunchBrowser({extraArgs:['--mute-audio',...(process.argv.includes('--software')?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]});
const shots=Arg('--shots');
try{
  // 贴图管理、Mixamo 动作预览已拆进 AdvancedTools/，不再发布（本地预览用）
  for(const fixture of [
    {name:'Menu',route:'?quality=low&scale=small',ready:()=>window.Tengxian?.state?.ready},
    {name:'Animation',route:'Animation/BackRifleRun/index.html',ready:()=>window.BackRifleReview?.ready&&document.getElementById('status')?.textContent.includes('独立 GLB 已载入')},
    ...(process.argv.includes('--gameplay')?[{name:'Gameplay',route:'?whitebox=p012&quality=low&scale=small',ready:()=>window.Tengxian?.state?.ready}]:[]),
  ]){
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],missing=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('response',response=>{if(response.status()>=400&&!response.url().includes('/__textures/status'))missing.push(response.status()+' '+response.url());});
    await page.addInitScript(()=>{
      localStorage.setItem('tengxian1938_audio_v1',JSON.stringify({master:0}));
      localStorage.setItem('tengxian1938_tools_volume_v1',JSON.stringify({volume:0,muted:true}));
    });
    try{
      await page.goto(base+'/Taierzhuang1938/'+fixture.route,{waitUntil:'commit',timeout:60000});
      await page.waitForFunction(fixture.ready,null,{timeout:180000});
      if(fixture.name==='MixamoPreview')await page.waitForLoadState('networkidle');
      if(fixture.name==='Gameplay'){
        await page.locator('#bootStart').click();
        await page.waitForFunction(()=>window.Tengxian.state.running&&window.Tengxian.Debug.FirstLevelMission().time>1,null,{timeout:60000});
      }
      if(shots){await fs.mkdir(shots,{recursive:true});await page.screenshot({path:path.join(shots,'Scene_'+fixture.name+'.png')});}
      assert.deepEqual(errors,[],fixture.name+' browser errors');
      assert.deepEqual(missing,[],fixture.name+' failed publication requests');
      console.log('PASS published '+fixture.name+': rendered, no missing assets or browser exceptions');
    }catch(error){console.error(JSON.stringify({fixture:fixture.name,errors,missing,boot:await page.locator('#bootStep').textContent().catch(()=>null)}));throw error;}
    finally{await page.close();}
  }
}finally{
  await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
}
