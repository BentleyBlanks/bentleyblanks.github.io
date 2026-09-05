// Local visual evidence only. Uses real combat inputs and the production renderer.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'_shots','MeleeFusion');fs.mkdirSync(out,{recursive:true});
const server=await ServeRoot(path.resolve(root,'..'),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const movie=path.join(out,'Video_MeleeFusion.mp4');
const encoder=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate','20','-i','pipe:0','-c:v','libx264','-crf','21','-pix_fmt','yuv420p',movie],{windowsHide:true,stdio:['pipe','ignore','pipe']});
const finished=once(encoder,'close');let stderr='';encoder.stderr.on('data',s=>stderr+=s);
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/?shot=1&manual=1&melee=1&quality=medium&scale=small`,{timeout:120000});
  await page.waitForFunction(()=>window.Taierzhuang?.state.ready&&Taierzhuang.Debug?.MeleeCombat,null,{timeout:120000});
  await page.evaluate(()=>Taierzhuang.StepFrames(3,1/60,true));
  await page.screenshot({path:path.join(out,'Scene_EncounterField.png')});
  const evidence=[];
  for(const scenario of ['DadaoTwo','BayonetTwo','DadaoBind','BayonetGround']) {
    await page.evaluate(id=>{Taierzhuang.Debug.MeleeCombat.Select(id);Taierzhuang.StepFrames(2,1/60,true);},scenario);
    for(let frame=0;frame<140;frame++) {
      const state=await page.evaluate(({scenario,frame})=>{
        const T=Taierzhuang,L=T.Debug.MeleeCombat,C=T.meleeCombat,P=T.player;
        if(scenario.endsWith('Two')) {
          const enemies=T.ai.soldiers.filter(e=>e.alive&&e.side==='ija').sort((a,b)=>a.position.distanceTo(P.position)-b.position.distanceTo(P.position));
          const e=enemies[0];
          if(e&&P.Alive){
            const d=e.position.distanceTo(P.position),bayonet=scenario.startsWith('Bayonet');
            P.yaw=Math.atan2(P.position.x-e.position.x,P.position.z-e.position.z);P.pitch=0;
            T.Debug.Key('KeyW',d>(bayonet?1.65:1.22));T.Debug.Key('KeyD',enemies.length>1&&d<2.5);
            if(C.Fighter(P).state==='idle') {
              const incoming=enemies.find(e=>{const f=C.Fighter(e);return f.attack&&f.t>f.attack.windup-.12&&f.t<f.attack.windup;});
              if(incoming){T.Debug.Mouse(2,true);T.Debug.Mouse(2,false);}
              else if(d<(bayonet?2:1.5)){T.Debug.Mouse(0,true);T.Debug.Mouse(0,false);}
            }
          }else{T.Debug.Key('KeyW',false);T.Debug.Key('KeyD',false);}
        } else if(scenario.endsWith('Bind')) {
          if(frame===15)T.Debug.Mouse(0,true);
          if(frame===24)T.Debug.Mouse(0,false);
        }
        if(L.State().active&&frame%4===0){T.Debug.Key('KeyF',true);T.Debug.Key('KeyF',false);}
        T.StepFrames(3,1/60,true);
        return {frame,scenario,health:P.health,stats:L.State().stats,action:L.State().player?.action,qte:L.State().active?.progress};
      },{scenario,frame});
      const png=await page.screenshot();
      if(!encoder.stdin.write(png))await once(encoder.stdin,'drain');
      if(frame%20===0){fs.writeFileSync(path.join(out,`Scene_${scenario}_${String(frame).padStart(3,'0')}.png`),png);evidence.push(state);}
    }
    await page.evaluate(()=>{Taierzhuang.Debug.Key('KeyW',false);Taierzhuang.Debug.Key('KeyD',false);});
    console.log('Captured',scenario);
  }
  encoder.stdin.end();const [code]=await finished;if(code!==0)throw Error(stderr);
  fs.writeFileSync(path.join(out,'Data_MotionEvidence.json'),JSON.stringify({errors,evidence},null,2));
  if(errors.length)throw Error(errors.join('\n'));
  console.log(movie);
}finally{encoder.stdin.destroy();if(encoder.exitCode===null)encoder.kill();await browser.close();await new Promise(r=>server.close(r));}
