import fs from 'node:fs/promises';
import path from 'node:path';
import {Hash,Within} from './Script_PublishCache.mjs';
import {ReadStrictRules,StrictRule,SourceInputs,WalkSite,IsImage,IsPublishModel,ReadPublishModel,LocalModelImage} from './Script_StrictTextureRules.mjs';
import {InspectImage,ModelBuffers,ModelView} from './Script_StrictTexturePublish.mjs';

export async function ValidateStrictTextures(projectDir,outputDir){
  const sourceRoot=path.dirname(path.resolve(projectDir)),siteRoot=path.dirname(path.resolve(outputDir));
  const rules=await ReadStrictRules(projectDir),report=JSON.parse(await fs.readFile(path.join(outputDir,'Data_AssetPublishReport.json'),'utf8'));
  if(report.version!==3||JSON.stringify(report.pathRules)!==JSON.stringify(rules))throw Error('Wrong strict texture publication rules/report');
  const inputs=await SourceInputs(sourceRoot),rows=report.coverage.map(x=>x.file).sort();
  if(JSON.stringify(inputs)!==JSON.stringify(rows))throw Error('Texture input coverage mismatch');
  const SameFiles=(records,expected)=>JSON.stringify(records.map(x=>x.file).sort())===JSON.stringify(expected.sort());
  if(!SameFiles(report.textures,inputs.filter(IsImage)))throw Error('Standalone image coverage mismatch');
  if(!SameFiles(report.models,report.coverage.filter(x=>x.kind==='model'&&x.status==='processed').map(x=>x.file)))throw Error('Processed model coverage mismatch');
  const expectedOutputs=[...new Set([...report.textures.flatMap(x=>[x.output,x.unflipped?.output].filter(Boolean)),...report.models.map(x=>x.output)])].sort();
  if(JSON.stringify(expectedOutputs)!==JSON.stringify([...report.generated].sort()))throw Error('Generated image/model coverage mismatch');
  const allowed=new Set(report.generated);for(const row of report.coverage){
    const bytes=await fs.readFile(Within(sourceRoot,row.file));if(Hash(bytes)!==row.sourceSha256||bytes.length!==row.sourceBytes)throw Error('Source modified: '+row.file);
    if(!['processed','no-images'].includes(row.status))throw Error('Unprocessed texture input: '+row.file);
    if(row.status==='no-images'){
      if(!IsPublishModel(row.file)||ReadPublishModel(bytes,row.file).doc.images?.length)throw Error('Image-bearing input escaped processing');
      if(!bytes.equals(await fs.readFile(Within(siteRoot,row.file))))throw Error('Non-textured model changed');allowed.add(row.file);
    }else if(await fs.access(Within(siteRoot,row.file)).then(()=>true,()=>false))throw Error('Unprocessed source copy remains published: '+row.file);
  }
  const Read=async(file,bytes,sha)=>{const value=await fs.readFile(Within(siteRoot,file));if(value.length!==bytes||Hash(value)!==sha)throw Error('Publication bytes mismatch: '+file);return value;};
  const Check=async(bytes,record)=>{
    const rule=StrictRule(rules,record.file,record.index),actual=await InspectImage(bytes,rule.format);
    if(record.format!==rule.format||actual.format!==rule.format||Math.max(actual.width,actual.height)>rule.maxSize||actual.width!==record.width||actual.height!==record.height)throw Error('Image violates path format/size: '+record.file);
    if(rule.format.startsWith('ktx2')&&actual.codec!== (rule.format==='ktx2-etc1s'?163:166))throw Error('Wrong GPU texture codec');
  };
  for(const image of report.textures){await Check(await Read(image.output,image.bytes,image.sha256),image);if(image.unflipped)await Check(await Read(image.unflipped.output,image.unflipped.bytes,image.unflipped.sha256),image);}
  for(const row of report.models){
    const source=ReadPublishModel(await fs.readFile(Within(sourceRoot,row.file)),row.file),published=ReadPublishModel(await Read(row.output,row.bytes,row.sha256),row.output);
    if(row.images.length!==source.doc.images.length||published.doc.images.length!==source.doc.images.length)throw Error('Embedded image coverage mismatch: '+row.file);
    const sourceBuffers=await ModelBuffers(sourceRoot,row.file,source),pubBuffers=await ModelBuffers(siteRoot,row.output,published);
    const imageViews=new Set(source.doc.images.map(x=>x.bufferView).filter(Number.isInteger));
    for(let i=0;i<(source.doc.bufferViews?.length||0);i++)if(!imageViews.has(i)&&!ModelView(source.doc,sourceBuffers,i).equals(ModelView(published.doc,pubBuffers,i)))throw Error('Geometry/animation changed');
    for(const field of ['nodes','meshes','skins','animations','accessors','materials','scenes','cameras'])if(JSON.stringify(source.doc[field])!==JSON.stringify(published.doc[field]))throw Error('Model structure changed: '+field);
    for(const image of row.images){const spec=published.doc.images[image.index];const external=LocalModelImage(row.output,spec.uri);const bytes=external?await fs.readFile(Within(siteRoot,external)):ModelView(published.doc,pubBuffers,spec.bufferView);if(Hash(bytes)!==image.sha256)throw Error('Embedded image hash mismatch');await Check(bytes,image);}
  }
  for(const file of (await WalkSite(siteRoot)).filter(x=>IsImage(x)||IsPublishModel(x)))if(!allowed.has(file))throw Error('Unaccounted published image/model: '+file);
  if(report.summary.unprocessedImages!==0)throw Error('Unprocessed images');
  return {inputs:inputs.length,...report.summary,bytes:(await Promise.all((await WalkSite(siteRoot)).map(async f=>(await fs.stat(Within(siteRoot,f))).size))).reduce((a,b)=>a+b,0)};
}
