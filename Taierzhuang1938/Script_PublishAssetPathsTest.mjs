import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {BuildPublishAssets} from './Script_BuildPublishAssets.mjs';
import {ValidatePublishAssets} from './Script_ValidatePublishAssets.mjs';
import {PathPattern,ResolvePathRule,ValidatePathRules,ReadPublishModel} from './Script_PublishAssetPaths.mjs';
import {ASSET_PUBLISH} from './Data_AssetPublish.mjs';

assert.equal('models' in ASSET_PUBLISH,false,'no model admission whitelist');
assert.ok(PathPattern('Model/**/Texture_*Base.png').test('Model/A/B/Texture_TestBase.png'));
assert.ok(PathPattern('Model/**/*.glb').test('Model/Model_New.glb'));
assert.throws(()=>PathPattern('../**'),/Invalid/);
assert.throws(()=>ValidatePathRules({version:1,roots:['Model'],rules:[{path:'Model/**',format:'source'}]}),/reason/);
const rules={version:1,roots:['Model','Texture'],rules:[{path:'Model/**',format:'auto',maxSize:0},{path:'Model/NewFolder/**',format:'ktx2-bc7',maxSize:64,quality:50},{path:'Model/External/**',format:'ktx2-etc1s',maxSize:64}]};
assert.equal(ResolvePathRule(rules,'Model/NewFolder/Model_New.glb').format,'ktx2-bc7');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'PublishAssetPaths-'));
try {
  const source=path.join(temporary,'source'),stage=path.join(temporary,'stage'),cache=path.join(temporary,'cache');
  const Write=async(file,bytes)=>{const target=path.join(source,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);};
  await Write('Data_TextureImportSettings.json','{"version":1,"textures":{}}');
  await Write('Data_PublishPathRules.json',JSON.stringify(rules));
  for(const file of ['Script_TextureImportBuild.mjs','Script_TextureImportPixels.mjs','Script_TextureImportRules.mjs'])await fs.copyFile(new URL(file,import.meta.url),path.join(source,file));
  const pixels=Buffer.alloc(128*128*4);let seed=123;
  for(let i=0;i<pixels.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=seed&255;pixels[i+1]=(seed>>>8)&255;pixels[i+2]=(seed>>>16)&255;pixels[i+3]=255;}
  const png=await sharp(pixels,{raw:{width:128,height:128,channels:4}}).png().toBuffer();
  const geometry=Buffer.alloc(104);new Float32Array(geometry.buffer,geometry.byteOffset,9).set([-1,-1,0,1,-1,0,0,1,0]);
  new Float32Array(geometry.buffer,geometry.byteOffset+36,9).set([0,0,1,0,0,1,0,0,1]);
  new Float32Array(geometry.buffer,geometry.byteOffset+72,6).set([0,0,1,0,.5,1]);geometry.writeUInt16LE(0,96);geometry.writeUInt16LE(1,98);geometry.writeUInt16LE(2,100);
  const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}]}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,-1,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:3,type:'VEC3'},{bufferView:2,componentType:5126,count:3,type:'VEC2'},{bufferView:3,componentType:5123,count:3,type:'SCALAR'}],
    bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36},{buffer:0,byteOffset:72,byteLength:24},{buffer:0,byteOffset:96,byteLength:6}],
    buffers:[{byteLength:geometry.length}],samplers:[{minFilter:9987}],textures:[{sampler:0,source:0}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0}}],images:[{uri:'Texture_UnlistedBase.png'}]};
  await Write('Model/External/Model_Backpack.gltf',JSON.stringify({...doc,buffers:[{uri:'Geometry.bin',byteLength:geometry.length}]}));
  await Write('Model/External/Geometry.bin',geometry);await Write('Model/External/Texture_UnlistedBase.png',png);
  const embedded=structuredClone(doc);embedded.images=[{bufferView:4,mimeType:'image/png'}];embedded.bufferViews.push({buffer:0,byteOffset:geometry.length,byteLength:png.length});
  const binary=Buffer.concat([geometry,png,Buffer.alloc((4-png.length%4)%4)]);embedded.buffers[0].byteLength=binary.length;
  const json=Buffer.from(JSON.stringify(embedded)),padding=Buffer.alloc((4-json.length%4)%4,32),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+padding.length+binary.length,8);header.writeUInt32LE(json.length+padding.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);
  const glb=Buffer.concat([header,json,padding,binHeader,binary]);await Write('Model/NewFolder/Model_New.glb',glb);
  await fs.cp(source,stage,{recursive:true});
  const options={cacheDir:cache,mobile:false,log:()=>{}};
  const report=await BuildPublishAssets(source,stage,options);
  assert.equal(report.models.length,2,'unlisted GLB and external-image glTF both discovered');
  assert.equal(report.textures.length,1,'unlisted model-local image discovered');
  assert.ok(report.coverage.every(row=>row.status==='encoded'||row.file.endsWith('Geometry.bin')&&row.status==='retained'));
  const model=report.models.find(row=>row.file.endsWith('.glb'));assert.equal(model.images[0].width,64);
  const {doc:published}=ReadPublishModel(await fs.readFile(path.join(stage,model.output)),model.output);
  assert.equal(published.images[0].extras.publicationFormat,'ktx2-bc7');
  assert.deepEqual(published.accessors,embedded.accessors,'path settings never change geometry');
  await ValidatePublishAssets(source,stage);
  await fs.rename(path.join(stage,'Model/External/Geometry.bin'),path.join(stage,'Model/External/Geometry.missing'));
  await assert.rejects(ValidatePublishAssets(source,stage),/ENOENT|coverage/,'missing external geometry buffer fails publication');
  await fs.rename(path.join(stage,'Model/External/Geometry.missing'),path.join(stage,'Model/External/Geometry.bin'));
  await Write('Model/External/Texture_MissingFromStage.png',png);
  await assert.rejects(ValidatePublishAssets(source,stage),/coverage mismatch/,'source input omitted from staging cannot escape');
  await fs.unlink(path.join(source,'Model/External/Texture_MissingFromStage.png'));
  const saved=JSON.stringify(report);await fs.writeFile(path.join(stage,'Data_AssetPublishReport.json'),JSON.stringify({...report,coverage:report.coverage.slice(1)}));
  await assert.rejects(ValidatePublishAssets(source,stage),/coverage mismatch/,'missing inventory decision fails publication');
  await fs.writeFile(path.join(stage,'Data_AssetPublishReport.json'),saved);
  const warm=await BuildPublishAssets(source,stage,options);assert.equal(warm.cache.misses,0,'warm path build reuses verified encodings');
  await Write('Model/External/Texture_NewArrival.png',png);await fs.copyFile(path.join(source,'Model/External/Texture_NewArrival.png'),path.join(stage,'Model/External/Texture_NewArrival.png'));
  await assert.rejects(ValidatePublishAssets(source,stage),/coverage mismatch/,'new file after build cannot silently escape');
  const final=await BuildPublishAssets(source,stage,options);assert.ok(final.coverage.some(row=>row.file.endsWith('Texture_NewArrival.png')&&row.status==='encoded'));
  await ValidatePublishAssets(source,stage);
  if(process.argv.includes('--browser')) {
    const {LaunchBrowser}=await import('../PrairieFire1937/Script_BrowserTestKit.mjs'),{ServeRoot}=await import('./Script_DevServer.mjs');
    for(const file of ['Script_ModelImports.mjs','Script_TextureImports.mjs'])await fs.copyFile(new URL(file,import.meta.url),path.join(stage,file));
    const server=await ServeRoot(path.resolve(import.meta.dirname,'..'),0),browser=await LaunchBrowser({extraArgs:['--mute-audio']});
    try {
      const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],base=`http://127.0.0.1:${server.address().port}/__path_publish/`;
      page.on('pageerror',error=>errors.push(String(error)));
      await page.route('**/__path_publish/**',async route=>{
        const relative=new URL(route.request().url()).pathname.split('/__path_publish/')[1];
        if(relative==='review.html')return route.fulfill({contentType:'text/html',body:`<script type="importmap">{"imports":{"three":"${base}stage/vendor/three/build/three.module.js"}}</script><script type="module">
          import * as T from 'three';import {ManagedGLTFLoader} from '${base}stage/Script_ModelImports.mjs';import {GLTFLoader} from '${base}stage/vendor/three/examples/jsm/loaders/GLTFLoader.js';import {SetTextureImportRenderer} from '${base}stage/Script_TextureImports.mjs';
          const renderer=new T.WebGLRenderer();renderer.setSize(1280,720);document.body.appendChild(renderer.domElement);SetTextureImportRenderer(renderer);
          const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1280/720,.1,100);camera.position.z=7;
          const raw=await new GLTFLoader().loadAsync('${base}source/Model/External/Model_Backpack.gltf');
          const loader=new ManagedGLTFLoader(),embedded=await loader.loadAsync('${base}stage/Model/NewFolder/Model_New.glb'),external=await loader.loadAsync('${base}stage/Model/External/Model_Backpack.gltf');
          const Map=g=>{let map;g.scene.traverse(o=>{if(o.isMesh){map=o.material.map;o.material=new T.MeshBasicMaterial({map});}});return map;};
          const a=Map(embedded),b=Map(external),original=Map(raw);embedded.scene.position.x=-1.5;external.scene.position.x=1.5;scene.add(embedded.scene,external.scene);renderer.render(scene,camera);
          window.result={embedded:[a.isCompressedTexture,a.image.width,a.format],external:[b.isCompressedTexture,b.image.width,b.format],rawCompressed:!!original.isCompressedTexture,error:renderer.getContext().getError(),bc7:renderer.extensions.has('EXT_texture_compression_bptc'),bc7Format:T.RGBA_BPTC_Format};
        </script>`});
        const vendor=relative.match(/^stage\/(vendor\/.*)$/),file=vendor?path.join(import.meta.dirname,vendor[1]):path.join(temporary,relative);
        const contentType=/\.m?js$/.test(file)?'text/javascript':/\.wasm$/.test(file)?'application/wasm':/\.gltf$/.test(file)?'application/json':'application/octet-stream';
        try{await route.fulfill({contentType,body:await fs.readFile(file)});}catch{await route.fulfill({status:404,body:'missing fixture'});}
      });
      await page.goto(base+'review.html');await page.waitForFunction(()=>window.result,null,{timeout:60000});
      const result=await page.evaluate(()=>window.result);assert.deepEqual(errors,[]);assert.equal(result.error,0);assert.equal(result.rawCompressed,false);
      assert.equal(result.embedded[1],64);assert.equal(result.external[1],64);assert.equal(result.external[0],true);
      if(result.bc7)assert.equal(result.embedded[2],result.bc7Format,'embedded BC7 path override reaches the GPU');
      await fs.mkdir(new URL('./_shots/PathPublish/',import.meta.url),{recursive:true});
      await page.screenshot({path:path.join(import.meta.dirname,'_shots/PathPublish/Scene_PathRules.png')});
      console.log('PASS PC path browser',JSON.stringify(result));
    } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
  }
  console.log('PASS PublishAssetPaths: recursive new assets, ordered path rules, BC7/ETC1S settings, external glTF images, source geometry preservation, coverage failures and warm cache');
} finally {await fs.rm(temporary,{recursive:true,force:true});}
