// Pixel regression independent of the campaign route: real geometry, a moving
// parent and camera, then a camera-only move. Never disable velocity.
//
// 2026.09.19 第二波：被测对象换了一批。原来量的是军列车厢里的腊肉与背包 —— 军列开场
// 随采用稿下线，那两样已经没有了。现在量 12/13 老周那辆牛/马车上的近景件：
//   · stretcherBed / patient —— 老周的担架与躺着的人（`zhouRoot` 下的 Mesh，
//     走 matrixWorld 那一路，就是原来腊肉的那条路径）；
//   · zhouKit                —— 担架上那件挎包（`RigidProp` 建的身份稳定普通 Mesh）；
//   · cartDeck / rail / shaft / wheel / spoke / draft* —— 老周/玩家那辆车从预留到
//     停车卸载始终复用的普通 Mesh。其余远车仍走实例桶。
// 事故形态一模一样：**父物体在动、相机跟着动**（顺子坐在车板上，车沿 cartRide 走），
// 判据一字不改 —— 同速时零屏幕位移、停下立刻归零、重新出现不许拿旧变换、
// 纯相机运动要留得住、原有绘制回调不许被顶掉。画质仍然是 high、资产仍然是真的。
// 口径见 docs/Data_CarriagePropVelocity.md。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LaunchBrowser} from '../PrairieFire1937/Script_BrowserTestKit.mjs';
import {ServeRoot} from './Script_DevServer.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(here,'_shots/CarriagePropVelocity');
await fs.mkdir(output,{recursive:true});
const local=process.argv.includes('--local');
const server=local?null:await ServeRoot(path.dirname(here),0),browser=await LaunchBrowser();
const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error'&&!/fonts\.(googleapis|gstatic)/.test(m.location()?.url||''))errors.push(m.text())});
let result;
try{
  await page.goto(`http://127.0.0.1:${local?19119:server.address().port}/Taierzhuang1938/?whitebox=p012&shot=1&manual=1&quality=high&scale=small`,{timeout:180000});
  await page.waitForFunction(()=>window.Tengxian?.state?.ready,null,{timeout:180000});
  await page.evaluate(()=>window.Tengxian.StepFrames(48,1/60,true));
  // 跳到 12（掩护装载与离开）：车位上真的停着牛车与马车，老周的担架也真的在场。
  await page.evaluate(async()=>{await window.Tengxian.Debug.FirstLevelJump(12);window.Tengxian.StepFrames(30,1/60,true);});
  await page.screenshot({path:path.join(output,'Scene_TransferCarts.png')});
  // 让老周那一副担架露出来（12 起它是可见的近景件），再拍一张车列。
  await page.evaluate(()=>{
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime();
    const candidate=r.column.vehicles.find(entry=>!entry.departed)||r.column.vehicles[0];
    const cart=r.column.zhouRideCart||r.column.ReserveBoardingCart({x:candidate.x,z:candidate.z});
    const zhou=r.column.zhou;
    Object.assign(zhou,{x:cart.x-2.2,z:cart.z,visible:true,state:'waiting'});
    g.player.position.set(cart.x-7,g.battlefield.GroundHeight(cart.x-7,cart.z-4),cart.z-4);
    g.player.yaw=Math.atan2(g.player.position.x-cart.x,g.player.position.z-cart.z);
    g.player.pitch=-.08;
    g.post.NotifyCameraCut();g.StepFrames(30,1/60,true);
  });
  await page.screenshot({path:path.join(output,'Scene_ZhouLitterOnCart.png')});
  result=await page.evaluate(async()=>{
    const T=await import('three'),{PrepassPass}=await import('./Script_PostPrepass.mjs');
    const {MakeFullscreenMaterial,MakeRenderTarget}=await import('./Script_PostCommon.mjs');
    const g=window.Tengxian,r=g.Debug.FirstLevelMissionRuntime(),renderer=g.renderer;
    const stableCart=r.column.zhouRideCart;
    const stableParts=[...r.view.stableCartParts.values()]
      .filter(mesh=>mesh.visible&&mesh.userData.missionCartPart?.cartId===stableCart.id);
    const live={stage:r.flow.stage.id,
      taa:g.post.taaEnabled,velocity:!!g.post.VelocityTexture,motionBlur:!!g.post.motionBlurPass.active,
      // 四类人流里的两类：牛车与马车都在车位上（白盒变体，Data_Tuning_FirstLevelMid.draft）。
      draft:r.column.vehicles.map(cart=>cart.draft),
      carts:r.column.vehicles.length,
      deckInstances:r.view.parts.cart.count,
      stableCartId:stableCart.id,
      stableDraft:stableCart.draft,
      stablePartIds:stableParts.map(mesh=>mesh.userData.missionCartPart.identity).sort(),
      litterVisible:!!r.column.zhou.visible,
      kits:r.view.rigidParts.fieldPack.length};
    const pipeline={preset:{velocity:true,hzb:false},hdrCapable:true,hdrType:T.HalfFloatType,targets:{}};
    const pass=new PrepassPass(pipeline);pass.Resize(320,240);
    const target=MakeRenderTarget(320,240,{type:T.HalfFloatType});
    const copy=MakeFullscreenMaterial('uniform sampler2D uVelocity; uniform sampler2D uDepth; varying vec2 vUv; void main(){gl_FragColor=vec4(texture2D(uVelocity,vUv).xy,texture2D(uDepth,vUv).w,1.0);}',
      {uVelocity:{value:pass.velocityTexture},uDepth:{value:pass.normalDepthTexture}});
    const readScene=new T.Scene(),quad=new T.Mesh(new T.PlaneGeometry(2,2),copy);readScene.add(quad);
    const readCamera=new T.Camera(),pixels=new Uint16Array(320*240*4);
    const Read=()=>{
      renderer.setRenderTarget(target);renderer.render(readScene,readCamera);
      renderer.readRenderTargetPixels(target,0,0,320,240,pixels);
      const speeds=[],xs=[];
      for(let y=20;y<220;y++)for(let x=20;x<300;x++){
        const i=(y*320+x)*4;if(T.DataUtils.fromHalfFloat(pixels[i+2])<=0)continue;
        const vx=T.DataUtils.fromHalfFloat(pixels[i])*320,vy=T.DataUtils.fromHalfFloat(pixels[i+1])*240;
        speeds.push(Math.hypot(vx,vy));xs.push(vx);
      }
      speeds.sort((a,b)=>a-b);xs.sort((a,b)=>a-b);
      return {pixels:speeds.length,p50:speeds[Math.floor(speeds.length*.5)],p95:speeds[Math.floor(speeds.length*.95)],x50:xs[Math.floor(xs.length*.5)]};
    };
    const Stable=identity=>r.view.stableCartParts.get(`${stableCart.id}:${identity}`);
    // 车板、代表性挂件和担架件都取生产几何；它们必须是身份稳定的普通 Mesh。
    const sources=[
      {name:'cartDeck',source:Stable('deck')},
      {name:'cartRail',source:Stable('rail:-1')},
      {name:'cartShaft',source:Stable('shaft:-1')},
      {name:'cartWheel',source:Stable('wheel:-1:-1')},
      {name:'cartSpoke',source:Stable('spoke:-1:-1:0')},
      {name:'draftBody',source:Stable('draftBody')},
      {name:'draftHead',source:Stable('draftHead')},
      {name:'draftLimb',source:Stable('draftLimb:-1:-1')},
      {name:'stretcherBed',source:r.view.zhouBed},
      {name:'patient',source:r.view.zhouPatient},
      {name:'zhouKit',source:r.view.rigidProps.get('fieldPack:ZhouKit')},
    ];
    const samples=[];
    for(const {name,source} of sources){
      const geometry=source.geometry.clone();geometry.computeBoundingBox();
      const center=geometry.boundingBox.getCenter(new T.Vector3()),size=geometry.boundingBox.getSize(new T.Vector3());
      geometry.translate(-center.x,-center.y,-center.z);geometry.scale(...Array(3).fill(.8/Math.max(size.x,size.y,size.z)));
      if(size.y<=size.x && size.y<size.z)geometry.rotateX(Math.PI/2);
      else if(size.x<size.y && size.x<size.z)geometry.rotateY(Math.PI/2);
      // 朝向：让有法线的那一面对着相机，别量到一张被背面剔除掉的空图。
      let facing=0;const normals=geometry.attributes.normal;
      for(let i=0;i<normals.count;i++)facing+=normals.getZ(i);
      if(facing<-.01)geometry.rotateY(Math.PI);
      if(!source?.isMesh||source.isInstancedMesh)throw Error(`${name}: production source is not a stable ordinary Mesh`);
      // 同一个对象多趟绘制也要覆盖：在 onAfterRender 里推历史会让后面的材质组只剩相机速度。
      const object=new T.Mesh(geometry,source.material);
      let before=0,after=0;object.onBeforeRender=()=>before++;object.onAfterRender=()=>after++;
      object.frustumCulled=false;
      const scene=new T.Scene(),parent=new T.Group();scene.add(parent);parent.add(object);
      const camera=new T.PerspectiveCamera(60,320/240,.01,100);camera.position.z=2;
      const prev=new T.Matrix4();let frame=0;
      const Draw=(offset,cameraOffset)=>{
        parent.position.x=offset;
        camera.position.x=cameraOffset;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const vp=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
        pass.Render({renderer,scene,camera,viewProjection:vp,prevViewProjection:prev,hasPrev:frame++>0});
        prev.copy(vp);return Read();
      };
      Draw(0,0);const coMoving=Draw(.12,.12),stopped=Draw(.12,.12),cameraOnly=Draw(.12,.20);
      // 新出现 / 重新出现的对象不许拿上一次绘制留下的旧变换。
      object.visible=false;Draw(.30,.30);object.visible=true;const reappeared=Draw(.30,.30);
      samples.push({name,instanced:!!source.isInstancedMesh,coMoving,stopped,cameraOnly,reappeared,hooks:{before,after}});
      geometry.dispose();
    }
    pass.Dispose();target.dispose();copy.dispose();quad.geometry.dispose();
    renderer.setRenderTarget(null);
    return {live,samples};
  });
  console.log('PROP_VELOCITY',JSON.stringify(result));
  await fs.writeFile(path.join(output,'Data_Velocity.json'),JSON.stringify({result,errors},null,2));
  assert.ok(result.live.taa&&result.live.velocity&&result.live.motionBlur,'the real level runs TAA and motion blur');
  assert.equal(result.live.stage,'Transfer','the subject is inspected at the actual loading stage');
  assert.ok(result.live.draft.includes('ox')&&result.live.draft.includes('horse'),
    'the transfer point really fields both ox and horse carts');
  const expected=['deck','draftBody','draftHead',
    ...[-1,1].flatMap(side=>[`rail:${side}`,`shaft:${side}`]),
    ...[-1,1].flatMap(side=>[-1,1].flatMap(end=>[
      `wheel:${side}:${end}`,`spoke:${side}:${end}:0`,`spoke:${side}:${end}:1`,`draftLimb:${side}:${end}`,
    ])),
    ...(result.live.stableDraft==='ox'?['draftHorn:-1','draftHorn:1']:[])].sort();
  assert.deepEqual(result.live.stablePartIds,expected,'the reserved player cart keeps every near-view piece on stable Mesh identity');
  assert.ok(result.live.deckInstances>0,'other distant cart decks remain in the instanced bucket');
  assert.ok(result.live.kits>0,'the litter really carries a stable-identity near-camera prop');
  for(const s of result.samples){
    assert.ok(s.coMoving.pixels>100,`${s.name}: real mesh pixels are present`);
    assert.ok(s.coMoving.p95<.15,`${s.name}: co-moving camera/prop has zero screen motion: ${JSON.stringify(s)}`);
    assert.ok(s.stopped.p95<.15,`${s.name}: motion ends immediately`);
    assert.ok(s.reappeared.p95<.15,`${s.name}: reappearance rejects stale object history`);
    assert.ok(s.cameraOnly.x50 < -3,`${s.name}: actual camera motion is retained`);
    assert.ok(s.hooks.before>0&&s.hooks.before===s.hooks.after,`${s.name}: original draw callbacks survive`);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS real cart deck, attachments and stretcher pixels: co-motion, stop, reappearance and camera-only motion');
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
