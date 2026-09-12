import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const {chromium}=createRequire(path.join(path.dirname(common),'package.json'))('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6)||'http://127.0.0.1:8097/EarSpa3D/';
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:700,height:700}}),errors=[];let result;
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto(url+'?debug=1');await page.waitForFunction(()=>window.__EarSpaDebug);
 await page.evaluate(()=>{__EarSpaDebug.StepFrames(3);window.requestAnimationFrame=()=>0;});await page.waitForTimeout(100);
 result=await page.evaluate(async()=>{
  const T=await import('three'),{core}=__EarSpaDebug,{scene,camera,renderer}=core;
  camera.position.set(-15,35,-260);camera.lookAt(-8,0,30);camera.fov=46;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  scene.traverse(o=>{if(o.isLight)o.intensity=0;});scene.environment=null;
  const head=scene.getObjectByName('Model_Temple'),skin=head.material;
  const testLight=new T.DirectionalLight(0xffffff,2);scene.add(testLight);testLight.position.set(-150,50,30);
  core.Render();const strength=skin.userData.skinSssShader.uniforms.earSss,original=strength.value;
  const outside=skin.userData.skinSssShader.uniforms.earOutside;
  const gl=renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
  function Pixels(value){strength.value=value;core.Render();const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
  function Difference(a,b){let changed=0,delta=[0,0,0],maximum=0;for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<3;c++){const v=a[i+c]-b[i+c];delta[c]+=v;d+=Math.abs(v);}if(d>6)changed++;maximum=Math.max(maximum,d);}return{changed,delta,maximum};}
  const side=Difference(Pixels(original),Pixels(0));
  testLight.position.set(20,20,100);const back=Difference(Pixels(original),Pixels(0));
  testLight.intensity=0;const dark=Difference(Pixels(original),Pixels(0));
  testLight.intensity=2;outside.value=0;const internal=Difference(Pixels(original),Pixels(0));
  strength.value=original;
  return{side,back,dark,internal,outerStrength:original,stats:__EarSpaProbe().stats};
 });
 assert.ok(result.side.changed>500,'side lighting produces visible skin diffusion');
 assert.ok(result.side.delta[0]>result.side.delta[1]&&result.side.delta[1]>result.side.delta[2],'warm diffusion spreads red more strongly than green and blue');
 assert.ok(result.back.changed>100&&result.back.delta[0]>0,'backlighting produces thin-ear throughput');
 assert.equal(result.dark.maximum,0,'no self-illumination when all lights are off');
 assert.equal(result.internal.maximum,0,'external diffusion is disabled in the internal view');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS 6 skin scattering checks',JSON.stringify(result));
}finally{
 await fs.mkdir(path.join(here,'_dev'),{recursive:true});await fs.writeFile(path.join(here,'_dev/Data_SkinScatteringReport.json'),JSON.stringify({result,errors},null,2));await browser.close();
}
