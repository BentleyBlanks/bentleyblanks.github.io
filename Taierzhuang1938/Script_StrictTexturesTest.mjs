import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {BuildStrictTextures} from './Script_StrictTexturePublish.mjs';
import {ValidateStrictTextures} from './Script_ValidateStrictTextures.mjs';
import {ReadStrictRules,StrictRule} from './Script_StrictTextureRules.mjs';
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'StrictTexturesTest-'));
try{
 const source=path.join(temporary,'source'),stage=path.join(temporary,'stage'),project=path.join(source,'Taierzhuang1938'),output=path.join(stage,'Taierzhuang1938');
 const Write=async(file,bytes)=>{const target=path.join(source,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);};
 const rules={version:2,rules:[{path:'**',format:'ktx2-bc7',maxSize:64,quality:40},{path:'**/Cpu/**',format:'png',maxSize:64}]};
 await Write('Taierzhuang1938/Data_PublishPathRules.json',JSON.stringify(rules));
 const pixels=Buffer.alloc(128*96*4);for(let y=0;y<96;y++)for(let x=0;x<128;x++){const i=(y*128+x)*4;pixels[i]=x*2;pixels[i+1]=y*2;pixels[i+2]=128;pixels[i+3]=255;}
 const png=await sharp(pixels,{raw:{width:128,height:96,channels:4}}).png().toBuffer();
 const geometry=Buffer.alloc(104);new Float32Array(geometry.buffer,geometry.byteOffset,9).set([-1,-1,0,1,-1,0,0,1,0]);new Float32Array(geometry.buffer,geometry.byteOffset+36,9).set([0,0,1,0,0,1,0,0,1]);new Float32Array(geometry.buffer,geometry.byteOffset+72,6).set([0,0,1,0,.5,1]);geometry.writeUInt16LE(1,98);geometry.writeUInt16LE(2,100);
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}]}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,-1,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC3'},{bufferView:2,componentType:5126,count:3,type:'VEC2'},{bufferView:3,componentType:5123,count:3,type:'SCALAR'}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36},{buffer:0,byteOffset:72,byteLength:24},{buffer:0,byteOffset:96,byteLength:6}],buffers:[{byteLength:geometry.length}],samplers:[{minFilter:9987}],textures:[{sampler:0,source:0}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0}}],images:[{bufferView:4,mimeType:'image/png'}]};
 doc.bufferViews.push({buffer:0,byteOffset:geometry.length,byteLength:png.length});const binary=Buffer.concat([geometry,png,Buffer.alloc((4-png.length%4)%4)]);doc.buffers[0].byteLength=binary.length;
 const raw=Buffer.from(JSON.stringify(doc)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);const glb=Buffer.alloc(28+json.length+binary.length);glb.writeUInt32LE(0x46546c67);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(json.length,12);glb.writeUInt32LE(0x4e4f534a,16);json.copy(glb,20);glb.writeUInt32LE(binary.length,20+json.length);glb.writeUInt32LE(0x004e4942,24+json.length);binary.copy(glb,28+json.length);
 const models=['Taierzhuang1938/Model/New/Model_New.glb','Taierzhuang1938/Hair/Heads/Model_Head.glb','Taierzhuang1938/Animation/New/Animation_New.glb','Model/StrawSleepingMat/Model_StrawSleepingMatFlat.glb'];
 for(const file of models)await Write(file,glb);
 await Write('Taierzhuang1938/Unlisted/Texture_New.png',png);
 const dataPixels=Buffer.from([27,108,219,0,44,88,132,255,50,100,150,0,1,2,3,255]);const dataPng=await sharp(dataPixels,{raw:{width:2,height:2,channels:4}}).png().toBuffer();await Write('Taierzhuang1938/Cpu/Texture_Data.png',dataPng);
 // Embedded packed data can contain useful RGB under zero alpha. Override
 // only that indexed image; the color image in the same GLB must stay BC7.
 const dataModel='Taierzhuang1938/Model/New/Model_DataPair.glb',dataDoc=structuredClone(doc);
 dataDoc.bufferViews.push({buffer:0,byteOffset:binary.length,byteLength:dataPng.length});dataDoc.images.push({bufferView:5,mimeType:'image/png'});
 dataDoc.textures.push({sampler:0,source:1});dataDoc.materials[0].extensions={KHR_materials_clearcoat:{clearcoatFactor:1,clearcoatTexture:{index:1}}};dataDoc.extensionsUsed=['KHR_materials_clearcoat'];
 const dataBinary=Buffer.concat([binary,dataPng,Buffer.alloc((4-dataPng.length%4)%4)]);dataDoc.buffers[0].byteLength=dataBinary.length;
 const dataRaw=Buffer.from(JSON.stringify(dataDoc)),dataJson=Buffer.alloc(Math.ceil(dataRaw.length/4)*4,32);dataRaw.copy(dataJson);const dataGlb=Buffer.alloc(28+dataJson.length+dataBinary.length);
 dataGlb.writeUInt32LE(0x46546c67);dataGlb.writeUInt32LE(2,4);dataGlb.writeUInt32LE(dataGlb.length,8);dataGlb.writeUInt32LE(dataJson.length,12);dataGlb.writeUInt32LE(0x4e4f534a,16);dataJson.copy(dataGlb,20);dataGlb.writeUInt32LE(dataBinary.length,20+dataJson.length);dataGlb.writeUInt32LE(0x004e4942,24+dataJson.length);dataBinary.copy(dataGlb,28+dataJson.length);
 await Write(dataModel,dataGlb);models.push(dataModel);rules.rules.push({path:dataModel+'#image/1',format:'png',maxSize:64});await Write('Taierzhuang1938/Data_PublishPathRules.json',JSON.stringify(rules));
 await Write('Taierzhuang1938/index.html','<script type="module">const image="./Unlisted/Texture_New.png";</script>');
 await fs.cp(source,stage,{recursive:true});
 const report=await BuildStrictTextures(project,output,{cacheDir:path.join(temporary,'cache'),log:()=>{}});
 assert.equal(report.models.length,5,'Hair, Animation and shared models are included automatically');assert.equal(report.textures.length,2);
 assert.equal(report.summary.unprocessedImages,0);assert.ok(report.models.every(m=>m.images.length===(m.file===dataModel?2:1)&&m.images[0].width===64&&m.images[0].height===48));
 for(const file of models)assert.equal(await fs.access(path.join(stage,file)).then(()=>true,()=>false),false,'raw model copies do not ship');
 assert.ok(report.models.every(m=>m.images[0].format==='ktx2-bc7'),'small or already-small images cannot bypass the rule');
 const cpu=report.textures.find(x=>x.file.includes('/Cpu/'));assert.deepEqual(await sharp(await fs.readFile(path.join(stage,cpu.output))).ensureAlpha().raw().toBuffer(),dataPixels,'independent data-alpha channels preserved');
 const packed=report.models.find(m=>m.file===dataModel);assert.equal(packed.images[0].format,'ktx2-bc7');assert.equal(packed.images[1].format,'png');
 const packedBytes=await fs.readFile(path.join(stage,packed.output)),packedJsonLength=packedBytes.readUInt32LE(12),packedDoc=JSON.parse(packedBytes.subarray(20,20+packedJsonLength)),packedBin=packedBytes.subarray(28+packedJsonLength),dataView=packedDoc.bufferViews[packedDoc.images[1].bufferView];
 assert.deepEqual(await sharp(packedBin.subarray(dataView.byteOffset,dataView.byteOffset+dataView.byteLength)).ensureAlpha().raw().toBuffer(),dataPixels,'embedded zero-alpha RGB preserved exactly');
 await ValidateStrictTextures(project,output);
  if(process.argv.includes('--browser')){
    const {LaunchBrowser}=await import('../PrairieFire1937/Script_BrowserTestKit.mjs'),{ServeRoot}=await import('./Script_DevServer.mjs');
    await fs.cp(new URL('./vendor/',import.meta.url),path.join(output,'vendor'),{recursive:true});
    for(const name of ['Script_TextureImports.mjs','Script_ModelImports.mjs'])await fs.copyFile(new URL(name,import.meta.url),path.join(output,name));
    const server=await ServeRoot(stage,0),browser=await LaunchBrowser({extraArgs:['--mute-audio']});
    try{
      const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],missing=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()===404)missing.push(r.url());});
      await page.route('**/Review.html',route=>route.fulfill({contentType:'text/html',body:`<script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.js"}}</script><script type="module">
      import * as T from 'three';import {ManagedGLTFLoader} from './Script_ModelImports.mjs';import {ManagedTextureLoader,SetTextureImportRenderer} from './Script_TextureImports.mjs';
      const loader=new ManagedGLTFLoader();const early=await loader.loadAsync('../Model/StrawSleepingMat/Model_StrawSleepingMatFlat.glb');
      const renderer=new T.WebGLRenderer();renderer.setSize(1280,720);document.body.appendChild(renderer.domElement);SetTextureImportRenderer(renderer);
      const result=[];let packedData;for(const file of ${JSON.stringify(models)}){const m=await loader.loadAsync('/'+file);let map;m.scene.traverse(o=>{if(o.isMesh){map=o.material.map;if(o.material.clearcoatMap)packedData=o.material.clearcoatMap;}});result.push({file,width:map.image.width,height:map.image.height,compressed:!!map.isCompressedTexture,format:map.format});}
      const target=new T.WebGLRenderTarget(2,2),scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
      scene.add(new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({uniforms:{map:{value:packedData}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 vUv;uniform sampler2D map;void main(){gl_FragColor=vec4(texture2D(map,vUv).rgb,1.);}'})));
      renderer.setRenderTarget(target);renderer.render(scene,camera);const packedPixels=new Uint8Array(16);renderer.readRenderTargetPixels(target,0,0,2,2,packedPixels);renderer.setRenderTarget(null);
      const image=await new ManagedTextureLoader().loadAsync('./Unlisted/Texture_New.png');const cpu=await new T.TextureLoader().loadAsync('./Cpu/Texture_Data.png');
      window.result={models:result,image:[image.image.width,image.isCompressedTexture],cpu:cpu.image.width,early:!!early.scene,packedRgb:Array.from({length:4},(_,i)=>Array.from(packedPixels.slice(i*4,i*4+3)))};
      </script>`}));
      await page.goto(`http://127.0.0.1:${server.address().port}/Taierzhuang1938/Review.html`);await page.waitForFunction(()=>window.result,null,{timeout:60000});const result=await page.evaluate(()=>window.result);
      assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.ok(result.models.every(m=>m.width===64&&m.height===48&&m.compressed));assert.deepEqual(result.image,[64,true]);assert.equal(result.cpu,2);assert.equal(result.early,true);
      assert.deepEqual(result.packedRgb.map(x=>x.join(',')).sort(),['27,108,219','44,88,132','50,100,150','1,2,3'].sort(),'real GPU upload retains RGB even when data alpha is zero');
      console.log('PASS strict browser',JSON.stringify(result));
    }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
  }
 const body=await fs.readFile(path.join(output,'index.html'),'utf8');assert.ok(!body.includes('Texture_New.png'),'literal references rewritten');
 const rulesRead=await ReadStrictRules(project);assert.equal(StrictRule(rulesRead,'Taierzhuang1938/Cpu/Texture_Data.png').format,'png');assert.throws(()=>StrictRule({rules:[]},'anything.png'),/No texture/);
 assert.equal(StrictRule(rulesRead,dataModel).format,'ktx2-bc7');assert.equal(StrictRule(rulesRead,dataModel,0).format,'ktx2-bc7');assert.equal(StrictRule(rulesRead,dataModel,1).format,'png');assert.throws(()=>StrictRule(rulesRead,dataModel,-1),/Invalid embedded/);
 await fs.copyFile(path.join(source,models[0]),path.join(stage,models[0]));await assert.rejects(ValidateStrictTextures(project,output),/source copy/);await fs.unlink(path.join(stage,models[0]));
 const saved=JSON.stringify(report);report.models[0].images=[];await fs.writeFile(path.join(output,'Data_AssetPublishReport.json'),JSON.stringify(report));await assert.rejects(ValidateStrictTextures(project,output),/coverage mismatch/);await fs.writeFile(path.join(output,'Data_AssetPublishReport.json'),saved);
 const wrongImageRule=JSON.parse(saved);wrongImageRule.models.find(m=>m.file===dataModel).images[1].format='ktx2-bc7';await fs.writeFile(path.join(output,'Data_AssetPublishReport.json'),JSON.stringify(wrongImageRule));await assert.rejects(ValidateStrictTextures(project,output),/format\/size/);await fs.writeFile(path.join(output,'Data_AssetPublishReport.json'),saved);
 const missingImage=JSON.parse(saved);missingImage.textures.pop();await fs.writeFile(path.join(output,'Data_AssetPublishReport.json'),JSON.stringify(missingImage));await assert.rejects(ValidateStrictTextures(project,output),/Standalone image coverage mismatch/);await fs.writeFile(path.join(output,'Data_AssetPublishReport.json'),saved);
 rules.rules[0].maxSize=32;await Write('Taierzhuang1938/Data_PublishPathRules.json',JSON.stringify(rules));await assert.rejects(ValidateStrictTextures(project,output),/rules/);
 rules.rules[0].format='auto';await Write('Taierzhuang1938/Data_PublishPathRules.json',JSON.stringify(rules));await assert.rejects(ReadStrictRules(project),/explicit format/);
 console.log('PASS StrictTextures: whole-site discovery, shared/embedded images, explicit formats and caps, data alpha, source removal, reference rewrite and failure gates');
}finally{await fs.rm(temporary,{recursive:true,force:true});}
