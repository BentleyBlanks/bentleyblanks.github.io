import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Hash,Within} from './Script_PublishCache.mjs';
import {InspectKtx} from './Script_BuildPublishAssets.mjs';

export async function ValidatePublishAssets(projectDir, outputDir) {
  const report=JSON.parse(await fs.readFile(Within(outputDir,'Data_AssetPublishReport.json'),'utf8'));
  if(report.version!==1)throw Error('Unsupported asset report version');
  const ModuleJson=async file=>JSON.parse((await fs.readFile(Within(outputDir,file),'utf8')).match(/=\s*([\s\S]*);\s*$/)[1]);
  const textures=await ModuleJson('Data_TextureImportRuntime.mjs'),models=await ModuleJson('Data_AssetPublishRuntime.mjs');
  for(const item of [...report.textures,...report.models]) {
    const source=await fs.readFile(Within(projectDir,item.file));
    if(Hash(source)!==item.sourceSha256||source.length!==item.sourceBytes)throw Error('Source changed during publication: '+item.file);
    const original=await fs.readFile(Within(outputDir,item.file));
    if(!source.equals(original))throw Error('Staging replaced a source asset: '+item.file);
    const bytes=await fs.readFile(Within(outputDir,item.output));
    if(bytes.length!==item.bytes||Hash(bytes)!==item.sha256)throw Error('Invalid published output: '+item.output);
    if(item.output.endsWith('.ktx2')){
      InspectKtx(bytes,item.width,item.height,item.colorSpace);
      const entry=textures[item.file.slice('Texture/'.length)];
      if(!entry||'Texture/'+entry.output!==item.output)throw Error('Missing texture mapping: '+item.file);
      const noFlip=await fs.readFile(Within(outputDir,'Texture/'+entry.unflipped));
      if(item.unflipped?.output!=='Texture/'+entry.unflipped||noFlip.length!==item.unflipped.bytes||Hash(noFlip)!==item.unflipped.sha256)
        throw Error('Invalid unflipped texture: '+item.file);
      InspectKtx(noFlip,item.width,item.height,item.colorSpace);
    }else{
      if(models[item.file]!==item.output)throw Error('Missing model mapping: '+item.file);
      const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length)),bin=bytes.subarray(28+length);
      if(!doc.extensionsRequired?.includes('KHR_texture_basisu'))throw Error('Model lacks basis extension');
      for(const image of item.images){
        const spec=doc.images[image.index],view=doc.bufferViews[spec.bufferView];
        const payload=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
        InspectKtx(payload,image.width,image.height,image.colorSpace,image.mipLevels>1);
        if(spec.mimeType!=='image/ktx2'||Hash(payload)!==image.sha256)throw Error('Invalid embedded GPU image');
      }
    }
  }
  return {textures:report.textures.length,models:report.models.length,cache:report.cache,summary:report.summary};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const i=process.argv.indexOf('--output-dir');if(i<0||!process.argv[i+1])throw Error('Required: --output-dir');
  console.log('PASS publish assets',JSON.stringify(await ValidatePublishAssets(path.dirname(fileURLToPath(import.meta.url)),path.resolve(process.argv[i+1]))));
}
