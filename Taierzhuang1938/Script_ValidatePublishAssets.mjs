import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Hash,Within} from './Script_PublishCache.mjs';
import {InspectKtx} from './Script_BuildPublishAssets.mjs';
import {DiscoverPublishInputs, ExpectedPublishInputs, LoadPathRules, ReadPublishModel, LocalModelImage} from './Script_PublishAssetPaths.mjs';

export async function ValidatePublishAssets(projectDir, outputDir) {
  const report=JSON.parse(await fs.readFile(Within(outputDir,'Data_AssetPublishReport.json'),'utf8'));
  if(report.version!==2)throw Error('Unsupported asset report version');
  const rules=await LoadPathRules(projectDir);
  if(JSON.stringify(rules)!==JSON.stringify(report.pathRules))throw Error('Publication path rules changed');
  for(const file of report.generated||[]) {
    const exists=await fs.access(Within(projectDir,file)).then(()=>true,()=>false);
    if(exists)throw Error('Generated output masks a source input: '+file);
  }
  const expected=await ExpectedPublishInputs(projectDir,rules,report.selection);
  const staged=await DiscoverPublishInputs(outputDir,rules,{...report.selection,generated:report.generated});
  if(JSON.stringify(expected)!==JSON.stringify(staged))throw Error('Publication coverage mismatch: source/staging input sets differ');
  const actual=(report.coverage||[]).map(row=>row.file).sort();
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Publication coverage mismatch: missing or duplicate input decisions');
  for(const row of report.coverage) {
    if(!['encoded','retained'].includes(row.status)||row.status==='retained'&&!row.reason?.trim()||row.status==='encoded'&&!row.outputs?.length)throw Error('Unresolved publication input: '+row.file);
    const source=await fs.readFile(Within(projectDir,row.file)),copy=await fs.readFile(Within(outputDir,row.file));
    if(source.length!==row.sourceBytes||Hash(source)!==row.sourceSha256||!source.equals(copy))throw Error('Source changed during publication: '+row.file);
    for(const output of row.outputs||[])await fs.access(Within(outputDir,output));
  }
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
      const modelLocal=!item.file.startsWith('Texture/'),entry=textures[modelLocal?item.file:item.file.slice(8)];
      if(!entry||(modelLocal?entry.output:'Texture/'+entry.output)!==item.output)throw Error('Missing texture mapping: '+item.file);
      const unflipped=modelLocal?entry.unflipped:'Texture/'+entry.unflipped;
      const noFlip=await fs.readFile(Within(outputDir,unflipped));
      if(item.unflipped?.output!==unflipped||noFlip.length!==item.unflipped.bytes||Hash(noFlip)!==item.unflipped.sha256)
        throw Error('Invalid unflipped texture: '+item.file);
      InspectKtx(noFlip,item.width,item.height,item.colorSpace);
    }else{
      if(models[item.file]!==item.output)throw Error('Missing model mapping: '+item.file);
      const {doc,bin}=ReadPublishModel(bytes,item.file);
      if(!doc.extensionsRequired?.includes('KHR_texture_basisu'))throw Error('Model lacks basis extension');
      for(const image of item.images){
        const spec=doc.images[image.index],view=spec.bufferView!==undefined?doc.bufferViews[spec.bufferView]:null;
        const external=LocalModelImage(item.output,spec.uri);
        if(image.externalOutput && external!==image.externalOutput)throw Error('External model image mapping mismatch');
        const payload=external?await fs.readFile(Within(outputDir,external)):bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
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
