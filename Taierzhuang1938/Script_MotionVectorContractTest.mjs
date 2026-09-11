// Renderer admission regression. No asset opt-in, gameplay route or screenshot
// percentage can stand in for actual RT1 pixels from a new renderer/attachment.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(here,'_shots/MotionVectorContract');
await fs.mkdir(output,{recursive:true});
const local=process.argv.includes('--local');
const server=local?null:await ServeRoot(path.dirname(here),0);
const browser=await LaunchBrowser(),page=await browser.newPage({viewport:{width:640,height:480}}),errors=[],skinWarnings=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('console',message=>{
  if(message.type()==='error')errors.push(message.text());
  if(message.type()==='warning'&&message.text().startsWith('[Prepass]'))skinWarnings.push(message.text());
});
try {
  const html=await fs.readFile(path.join(here,'index.html'),'utf8');
  const importMap=html.match(/<script type="importmap">[\s\S]*?<\/script>/)[0];
  await page.route('**/__MotionVectorContract',route=>route.fulfill({contentType:'text/html',body:`<!doctype html>${importMap}<body style="margin:0"><canvas></canvas>`}));
  await page.goto(`http://127.0.0.1:${local?19119:server.address().port}/Taierzhuang1938/__MotionVectorContract`);
  const result=await page.evaluate(async()=>{
    const T=await import('three');
    const {PrepassPass,MarkForegroundPrepass,MarkNoPrepass}=await import('./Script_PostPrepass.mjs');
    const {MakeFullscreenMaterial,MakeRenderTarget}=await import('./Script_PostCommon.mjs');
    const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas')});renderer.setSize(320,240);
    const pipeline={preset:{velocity:true,hzb:false},hdrCapable:true,hdrType:T.HalfFloatType,targets:{}};
    let pass=new PrepassPass(pipeline);pass.Resize(320,240);
    const target=MakeRenderTarget(320,240,{type:T.HalfFloatType});
    const copy=MakeFullscreenMaterial('uniform sampler2D uVelocity; uniform sampler2D uDepth; varying vec2 vUv; void main(){gl_FragColor=vec4(texture2D(uVelocity,vUv).xy,texture2D(uDepth,vUv).w,1.0);}',
      {uVelocity:{value:null},uDepth:{value:null}});
    const readScene=new T.Scene(),quad=new T.Mesh(new T.PlaneGeometry(2,2),copy);readScene.add(quad);
    const readCamera=new T.Camera(),pixels=new Uint16Array(320*240*4),samples=[];
    const Read=()=>{
      copy.uniforms.uVelocity.value=pass.velocityTexture;copy.uniforms.uDepth.value=pass.normalDepthTexture;
      renderer.setRenderTarget(target);renderer.render(readScene,readCamera);
      renderer.readRenderTargetPixels(target,0,0,320,240,pixels);
      const regions={body:[],attachment:[]};
      for(let y=0;y<240;y++)for(let x=0;x<320;x++){
        const i=(y*320+x)*4,depth=T.DataUtils.fromHalfFloat(pixels[i+2]);if(depth<=0)continue;
        regions[y>155?'attachment':'body'].push({x:T.DataUtils.fromHalfFloat(pixels[i])*320,y:T.DataUtils.fromHalfFloat(pixels[i+1])*240,depth});
      }
      return Object.fromEntries(Object.entries(regions).map(([name,values])=>[name,{pixels:values.length,
        minX:Math.min(...values.map(v=>v.x)),maxX:Math.max(...values.map(v=>v.x)),
        maxY:Math.max(...values.map(v=>Math.abs(v.y))),minDepth:Math.min(...values.map(v=>v.depth)),maxDepth:Math.max(...values.map(v=>v.depth))}]));
    };
    const Geometry=()=>{
      const geometry=new T.PlaneGeometry(.7,.7);geometry.clearGroups();geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);
      geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(16),4));
      geometry.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));
      return geometry;
    };
    let before=0,after=0,existingForegroundHooks=true;
    const Hook=object=>{object.onBeforeRender=()=>before++;object.onAfterRender=()=>after++;object.frustumCulled=false;return object;};
    for(const detached of [false,true]){
      const scene=new T.Scene(),root=new T.Group();scene.add(root);
      const material=new T.MeshBasicMaterial(),bone=new T.Bone(),tip=new T.Bone();
      const skin=Hook(new T.SkinnedMesh(Geometry(),[material,material]));root.add(skin);
      if(detached){root.add(bone,tip);skin.bindMode=T.DetachedBindMode;}else skin.add(bone,tip);
      for(let i=0;i<skin.geometry.attributes.position.count;i++)
        if(skin.geometry.attributes.position.getX(i)>0)skin.geometry.attributes.skinIndex.setX(i,1);
      scene.updateMatrixWorld(true);skin.bind(new T.Skeleton([bone,tip]));
      const attachment=Hook(new T.Mesh(new T.PlaneGeometry(.25,.25),material));attachment.position.y=.65;bone.add(attachment);
      const camera=new T.OrthographicCamera(-2,2,1.5,-1.5,.01,100);camera.position.z=2;
      const prev=new T.Matrix4();let frame=0;
      let tipOffset=0,cameraCut=false;
      const Draw=(label,expectedBody,expectedAttachment=expectedBody)=>{
        tip.position.x=bone.position.x+tipOffset;
        scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const vp=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
        pass.Render({renderer,scene,camera,viewProjection:vp,prevViewProjection:prev,hasPrev:frame++>0&&!cameraCut});
        cameraCut=false;
        const pixels=Read();pass._SnapshotSkeletons();prev.copy(vp);
        if(label)samples.push({label:`${detached?'detached':'attached'}:${label}`,expectedBody,expectedAttachment,...pixels});
      };
      Draw('first frame',0);
      // Detached binding intentionally applies both mesh and skeleton parents.
      // Moving their common parent twice moves the skin twice, the hook once.
      root.position.x=.12;camera.position.x=.12;Draw('parent/camera motion',detached?9.6:0,0);
      bone.position.x=.1;Draw('bone deformation',8);
      root.position.x+=.05;bone.position.x+=.1;camera.position.x+=.05;Draw('parent plus bone',detached?12:8,8);
      Draw('stop',0);
      tipOffset=.1;Draw('nonrigid stretch',[0,8],0);
      tipOffset=0;Draw('nonrigid return',[-8,0],0);
      cameraCut=true;bone.position.x+=.02;camera.position.x+=.02;Draw('camera cut',0);
      Draw('camera cut settles',0);
      camera.position.x+=.08;Draw('camera only',-6.4);
      if(detached){
        skin.position.x=.1;bone.position.x+=.05;Draw('mesh plus skeleton',12,4);
        skin.position.x+=.1;camera.position.x+=.1;Draw('mesh/camera co-motion',0,-8);
      }
      root.visible=false;bone.position.x=.7;Draw();root.visible=true;Draw('reappearance',0);
      // A genuinely new SkinnedMesh joins an already animated shared skeleton.
      const replacement=Hook(new T.SkinnedMesh(Geometry(),[material,material]));
      replacement.bindMode=T.DetachedBindMode;replacement.bind(skin.skeleton,skin.bindMatrix);
      skin.visible=false;root.add(replacement);bone.position.x+=.1;
      // Keep the attached skeleton visible when its previous renderable is hidden.
      if(!detached){root.attach(bone);root.attach(tip);scene.updateMatrixWorld(true);}
      Draw('late shared-skeleton renderer',0,8);
      Draw('late renderer settles',0);
      pass.Dispose();pass=new PrepassPass(pipeline);pass.Resize(320,240);Draw('pipeline rebuild',0);
      Draw('rebuilt history settles',0);bone.position.x+=.1;Draw('rebuilt skeleton motion',8);
      // Foreground root is marked BEFORE future asynchronous descendants exist.
      root.remove(replacement);bone.remove(attachment);
      const foreground=new T.Group();scene.add(foreground);
      const existing=Hook(new T.Mesh(new T.PlaneGeometry(.1,.1),material));existing.visible=false;foreground.add(existing);
      const originalBefore=existing.onBeforeRender,originalAfter=existing.onAfterRender;
      MarkForegroundPrepass(foreground);MarkForegroundPrepass(foreground);
      existingForegroundHooks &&= existing.onBeforeRender===originalBefore && existing.onAfterRender===originalAfter;
      foreground.add(replacement);foreground.add(attachment);
      Draw('late foreground first draw',0);
      camera.position.x+=.1;bone.position.x+=.1;Draw('foreground zero',0);
      const last=samples.at(-1);last.foreground=true;
      // Removing the node from the marked tree returns it to world history.
      root.add(attachment);replacement.visible=false;Draw();attachment.position.x+=.1;
      Draw('reparented world attachment',null,8);
      MarkNoPrepass(attachment.material);Draw('explicit exclusion',null,null);
      material.allowOverride=true;
      const flash=new T.Mesh(new T.PlaneGeometry(.4,.4),new T.MeshBasicMaterial({transparent:true}));foreground.add(flash);
      root.visible=false;Draw('late translucent exclusion',null,null);
      // Do not fetch outside an unsupported bone texture: camera fallback + diagnostic.
      const bad=Hook(new T.SkinnedMesh(Geometry(),[new T.MeshBasicMaterial(),new T.MeshBasicMaterial()]));
      const badBone=new T.Bone();bad.add(badBone);scene.add(bad);scene.updateMatrixWorld(true);bad.bind(new T.Skeleton([badBone]));
      bad.skeleton.boneTexture=new T.DataTexture(new Float32Array(4*8*4),4,8,T.RGBAFormat,T.FloatType);
      bad.skeleton.boneMatrices=bad.skeleton.boneTexture.image.data;Draw();badBone.position.x=.1;Draw('unsupported skin fallback',0,null);
      renderer.setRenderTarget(null);renderer.render(scene,camera);
      scene.traverse(object=>{if(object.isMesh)object.geometry.dispose();});
      skin.skeleton.dispose();bad.skeleton.dispose();material.dispose();
    }
    pass.Dispose();copy.dispose();target.dispose();quad.geometry.dispose();
    return {samples,hooks:{before,after,existingForegroundHooks},glError:renderer.getContext().getError()};
  });
  await page.screenshot({path:path.join(output,'Scene_ContractFixture.png')});
  await fs.writeFile(path.join(output,'Data_Result.json'),JSON.stringify({result,errors,skinWarnings},null,2));
  for(const sample of result.samples)for(const [region,expected] of [['body',sample.expectedBody],['attachment',sample.expectedAttachment]]){
    const actual=sample[region],label=`${sample.label}/${region}`;
    if(expected===null){assert.equal(actual.pixels,0,label+' excluded from prepass');continue;}
    assert.ok(actual.pixels>100,label+' has rasterized pixels');
    const [min,max]=Array.isArray(expected)?expected:[expected,expected];
    const tolerance=Array.isArray(expected)?.16:.08;
    assert.ok(Math.abs(actual.minX-min)<tolerance&&Math.abs(actual.maxX-max)<tolerance&&actual.maxY<.08,`${label}: expected ${expected} px, got ${JSON.stringify(actual)}`);
    if(sample.foreground)assert.ok(actual.minDepth===1&&actual.maxDepth===1,label+' writes foreground depth');
  }
  assert.ok(result.hooks.before>0);assert.equal(result.hooks.before,result.hooks.after,'existing object hooks survive');
  assert.ok(result.hooks.existingForegroundHooks,'marking an existing foreground tree is idempotent and preserves both object callbacks');
  assert.equal(result.glError,0);assert.deepEqual(errors,[]);
  assert.equal(skinWarnings.length,2,'each unsupported skeleton emits one diagnostic, never a silent fallback or per-frame spam');
  console.log(`PASS MotionVector contract: ${result.samples.length} GPU scenarios; attached/detached skins, new bone attachments, history lifecycle, foreground inheritance, exclusions, callbacks`);
} finally {await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
