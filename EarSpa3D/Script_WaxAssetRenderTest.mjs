import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WAX_SCULPT_PROFILES} from './Data_WaxSculptProfiles.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.dirname(here);
const common=path.resolve(root,execFileSync('git',['rev-parse','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());
const {chromium}=createRequire(path.join(path.dirname(common),'package.json'))('playwright-core');
const url=process.argv.find(a=>a.startsWith('--url='))?.slice(6);
assert.ok(url,'Pass the current worktree --url=http://127.0.0.1:PORT/EarSpa3D/');
const out=path.join(here,'_dev/WaxCareer20261022');await fs.mkdir(out,{recursive:true});
const report={checks:[],errors:[],requests:[],width:1280,height:720,source:WAX_SCULPT_PROFILES.sourceSha256,
  evidence:'Actual game geometry, materials and rendering; camera closeups are controlled inspection, not proof of manual extraction.'};
const Check=(ok,label)=>{assert.ok(ok,label);report.checks.push(label);};
const browser=await chromium.launch({executablePath:process.env.EARSPA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--mute-audio']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());if(r.url().includes('Data_WaxSculptProfiles'))report.requests.push(r.url());});
  await page.addInitScript(()=>{localStorage.setItem('earspa3d.calm.settings',JSON.stringify({master:0,muted:true,haptics:false}));});
  await page.goto(url+(url.includes('?')?'&':'?')+'debug=1');
  await page.waitForFunction(()=>window.__EarSpaDebug,null,{timeout:90000});
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  await page.locator('#welcome-settings').click();
  await page.locator('#practice-type').selectOption('mixed');
  await page.locator('#practice-start').click();
  await page.evaluate(()=>__EarSpaDebug.StepFrames(150));
  if(await page.locator('#lamp-toggle').getAttribute('aria-pressed')!=='true')await page.locator('#lamp-toggle').click();await page.mouse.move(645,353);
  await page.evaluate(()=>__EarSpaDebug.StepFrames(3));
  report.game=await page.evaluate(()=>{
    const {view,core}=__EarSpaDebug;core.Render();
    return {version:__EarSpaProbe().version,lampOn:view.RenderingProbe().lampOn,stats:{...core.stats},chunks:view.chunks.filter(c=>!c.fine).map(c=>{
      const g=c.mesh.geometry,p=g.attributes.position,response=g.attributes.waxResponse;
      return {id:c.id,type:c.type,vertices:p.count,triangles:g.index.count/3,nodes:c.body.surface?.rest.length,mass:c.mass,
        minThickness:Math.min(...Array.from(response.array).filter((_,i)=>i%3===0)),maxThickness:Math.max(...Array.from(response.array).filter((_,i)=>i%3===0)),
        finite:p.array.every(Number.isFinite)&&g.attributes.normal.array.every(Number.isFinite)&&response.array.every(Number.isFinite),
        opaque:!c.mesh.material.transparent,depthWrite:c.mesh.material.depthWrite};
    })};
  });
  Check(report.requests.length>0,'the actual game fetched the Blender-baked profile module');
  Check(report.game.lampOn,'inspection lamp is on for the actual game visual evidence');
  Check(report.game.chunks.length===9&&report.game.chunks.every(c=>c.vertices===674&&c.triangles===1344&&c.nodes===65),'all nine in-game deposits keep the existing 674-vertex / 65-node budgets');
  Check(report.game.chunks.every(c=>c.finite&&c.minThickness>0&&c.maxThickness>c.minThickness*1.4&&c.opaque&&c.depthWrite),'in-game folded surfaces retain finite normals, real variable thickness and solid depth');
  Check(report.game.stats.triangles<=180000&&report.game.stats.drawCalls<=120,'the complete game scene remains within its geometry/draw budget');
  Check(Math.abs(report.game.chunks.reduce((sum,c)=>sum+c.mass,0)-8.1)<1e-6,'nine native deposits retain their 8.1 total clean mass');
  await page.screenshot({path:path.join(out,'Shot_WaxGameMixed.png')});
  for(const type of ['dry','wet','impacted']){
    const closeup=await page.evaluate(type=>{
      const {view,core}=__EarSpaDebug,T=core.THREE,c=view.chunks.find(c=>c.type===type&&!c.fine);
      const center=c.mesh.geometry.boundingBox?.getCenter(new T.Vector3())||new T.Box3().setFromBufferAttribute(c.mesh.geometry.attributes.position).getCenter(new T.Vector3());
      const world=center.applyMatrix4(c.mesh.matrixWorld);
      // High-tier inspection fixture uses the real adjustable lamp. A default
      // weak lamp aimed down the canal leaves side-wall plugs in deep shadow.
      view.SetCareLighting({level:3,intensity:180,mounted:false,label:'模型验收高档灯'});
      const projected=view.Project(world);view.AimLamp(projected.x,projected.y,true);view.Update(0);
      core.camera.position.copy(world).addScaledVector(c.normal,3.65);
      core.camera.up.set(0,1,0).applyQuaternion(c.mesh.quaternion);
      core.camera.lookAt(world);core.camera.fov=45;core.camera.updateProjectionMatrix();
      core.Render();return {type,id:c.id,camera:core.camera.position.toArray(),target:world.toArray(),lighting:view.RenderingProbe().lampEquipment,stats:{...core.stats}};
    },type);
    (report.closeups??=[]).push(closeup);
    await page.screenshot({path:path.join(out,'Shot_WaxGame_'+type+'.png')});
  }
  // Re-render the very same native chunks outside the canal for unobstructed
  // silhouette review. This is explicitly a diagnostic display, not gameplay.
  report.maquettes=await page.evaluate(async()=>{
    const {core,view}=__EarSpaDebug,T=core.THREE;
    const {BuildWaxShape}=await import('./Script_WaxMorphology.mjs?v=ear050-career-care-20261022');
    const {PrepareWaxGeometry}=await import('./Script_SurfaceDetail.js?v=ear050-career-care-20261022');
    const scene=new T.Scene();scene.background=new T.Color(0x333b3f);scene.environment=core.scene.environment;
    const meshes=[];
    for(const [i,type] of ['dry','wet','impacted'].entries()){
      const source=view.chunks.find(c=>c.type===type&&!c.fine),shape=BuildWaxShape({seed:17,type,radii:[1,1]});
      const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(shape.positions,3));g.setAttribute('uv',new T.BufferAttribute(shape.uv,2));g.setAttribute('waxResponse',new T.BufferAttribute(shape.response,3));g.setIndex(new T.BufferAttribute(shape.indices,1));g.computeVertexNormals();PrepareWaxGeometry(g);
      const material=source.mesh.material.clone();material.userData=source.mesh.material.userData;material.onBeforeCompile=source.mesh.material.onBeforeCompile;material.customProgramCacheKey=source.mesh.material.customProgramCacheKey;
      for(let row=0;row<2;row++){
        const mesh=new T.Mesh(g,material);mesh.rotation.set(row?-.5:0,0,row?.18:-.18);
        let minZ=0;const point=new T.Vector3();for(let i=0;i<g.attributes.position.count;i++){point.fromBufferAttribute(g.attributes.position,i).applyEuler(mesh.rotation);minZ=Math.min(minZ,point.z);}
        mesh.position.set((i-1)*2.35,row?-1.05:.95,.012-minZ);scene.add(mesh);meshes.push(mesh);
      }
    }
    scene.add(new T.HemisphereLight(0xffeedc,0x2a3035,1.35));
    const key=new T.DirectionalLight(0xffead5,2.1);key.position.set(-3,-1,7);scene.add(key);
    const fill=new T.DirectionalLight(0xdde9ff,.7);fill.position.set(4,2,5);scene.add(fill);
    const camera=new T.OrthographicCamera(-3.85,3.85,2.165,-2.165,.01,100);camera.position.set(.2,-5.5,8.5);camera.up.set(0,0,1);camera.lookAt(0,0,.1);
    core.renderer.setViewport(0,0,1280,720);core.renderer.setScissorTest(false);core.renderer.render(scene,camera);
    return {types:meshes.map(m=>m.material.customProgramCacheKey()),triangles:core.renderer.info.render.triangles};
  });
  await page.addStyleTag({content:'body>*:not(#app), #app>*:not(#ear-stage), #ear-stage>*:not(canvas) {visibility:hidden!important;} #ear-canvas {visibility:visible!important;}'});
  // Use the canvas element to avoid UI obscuring diagnostic maquettes.
  await page.locator('#ear-canvas').screenshot({path:path.join(out,'Shot_WaxRuntimeMaquettes.png')});
  Check(report.errors.length===0,'no page, shader or resource errors');
  await fs.writeFile(path.join(out,'Review_WaxAssets.html'),`<!doctype html><meta charset="utf-8"><title>Wax sculpt reference comparison</title>
    <style>body{margin:0;background:#161b1d;color:#e3d7c2;font:16px system-ui}header{padding:22px 28px}h1{font-size:24px;margin:0 0 8px}main{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:0 22px}figure{margin:0}figcaption{padding:12px 0;color:#cbbd9e}img{width:100%;height:414px;object-fit:contain;background:#242b2e}p{padding:0 28px;font-size:14px;line-height:1.7;color:#b7b5ac}button{padding:7px 12px;margin-right:10px;border:1px solid #756851;background:#2b3030;color:#e3d7c2;cursor:pointer}</style>
    <header><h1>耳垢形态与材质 · 参考对照</h1><div>同为干片 / 湿蜡 / 硬结；每列两个观察角度</div></header>
    <main><figure><figcaption>找回的原始参考 · 生成式美术图，非实拍测量</figcaption><img src="../../References/Reference_CerumenMaterials.png"></figure>
    <figure><figcaption id="caption">实际运行时闭合薄壳 · 相同游戏材质</figcaption><img id="result" src="Shot_WaxRuntimeMaquettes.png"></figure></main>
    <p><button onclick="result.src='Shot_WaxRuntimeMaquettes.png';caption.textContent='实际运行时闭合薄壳 · 相同游戏材质'">运行时形体</button><button onclick="result.src='Shot_BlenderWaxMaquettes.png';caption.textContent='Blender 源模型 · 轮廓与前后表面已采样进入游戏'">Blender 源模型</button></p>
    <p>实际每块 674 顶点 / 65 个 XPBD 节点；保留厚度、质量、断口与动态形变。当前壳体不包含参考图的全部悬空层叠和微小穿孔。油耳继续使用原有体积凝胶。</p>`);
  await page.goto(new URL('_dev/WaxCareer20261022/Review_WaxAssets.html',url).href);
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  await page.screenshot({path:path.join(out,'Shot_ReferenceVsRuntime.png')});
  console.log('PASS '+report.checks.length+' wax asset render checks '+JSON.stringify({version:report.game.version,stats:report.game.stats,source:report.source}));
}finally{
  await fs.writeFile(path.join(out,'Data_WaxAssetRenderReport.json'),JSON.stringify(report,null,2));
  await browser.close();
}
