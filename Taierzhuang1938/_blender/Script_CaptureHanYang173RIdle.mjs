// Capture new fitted grips against the current native Idle before Blender baking.
// Always use a fresh --source-dir; the baseline and source copy are immutable.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {LaunchBrowser} from '../../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from '../Script_DevServer.mjs';
const Arg=name=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
const folder=Arg('--source-dir'),blend=Arg('--base-blend');
if(!folder||!blend)throw Error('Required: --source-dir=<new OneDrive folder> --base-blend=<existing source blend>');
const root=path.resolve(import.meta.dirname,'../..'),project=path.join(root,'Taierzhuang1938');
await fs.mkdir(folder); // refusing an existing directory protects the baseline
const baseline=await fs.readFile(path.join(project,'Animation/FirstPerson/Data_FpsHanYangAnimations.json'));
const baselinePath=path.join(folder,'Data_IdleBaseline.json'),sourceBlend=path.join(folder,'Animation_HanYang173RIdle.blend');
await fs.writeFile(baselinePath,baseline,{flag:'wx'});await fs.copyFile(blend,sourceBlend);
const server=await ServeRoot(root,0),browser=await LaunchBrowser();
try{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?weapons=1&manual=1&shot=1&quality=medium`,{timeout:120000});
 await page.waitForFunction(()=>window.Taierzhuang?.state?.ready,null,{timeout:240000});
 const capture=await page.evaluate(async()=>{const {CaptureIdle}=await import('./_blender/Script_HanYang173RIdleCapture.mjs');return CaptureIdle();});
 if(JSON.stringify(capture.baselineAsset)!==JSON.stringify(JSON.parse(baseline)))throw Error('Runtime Idle differs from archived baseline');
 delete capture.baselineAsset;
 await fs.writeFile(path.join(folder,'Data_Capture.json'),JSON.stringify({version:1,baselinePath,baselineSha256:createHash('sha256').update(baseline).digest('hex'),sourceBlend,...capture}));
 console.log(`Captured ${capture.frames.length} frames; ${capture.selectedBones.length} scoped bones; max wrist ${capture.maximumWrist}`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
