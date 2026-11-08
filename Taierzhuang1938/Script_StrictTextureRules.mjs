import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PathPattern,ReadPublishModel,LocalModelImage,IsPublishModel} from './Script_PublishAssetPaths.mjs';
import {PUBLISH_SOURCE_PATHS,IsPublishedSource} from '../scripts/Script_PublishScope.mjs';
import {PUBLISH_EXCLUDE} from '../scripts/Script_PublishPrune.mjs';
export {ReadPublishModel,LocalModelImage,IsPublishModel};
export const IsImage=file=>/\.(png|jpe?g|webp|gif|hdr|exr|dds|tga|ktx2|avif|bmp|tiff?|ico|svg)$/i.test(file);
export const IsPruned=file=>PUBLISH_EXCLUDE.some(row=>row.path.endsWith('/')?file.startsWith(row.path):PathPattern(row.path).test(file));
export async function ReadStrictRules(projectDir){
  const doc=JSON.parse(await fs.readFile(path.join(projectDir,'Data_PublishPathRules.json'),'utf8'));
  if(doc.version!==2||!Array.isArray(doc.rules)||!doc.rules.length||doc.roots)throw Error('Texture publication requires version 2 path rules without a scan-root whitelist');
  const formats=['ktx2-bc7','ktx2-bc3','ktx2-bc1','ktx2-uastc','ktx2-etc1s','png','webp','webp-lossless','jpeg','hdr'];
  for(const rule of doc.rules){
    PathPattern(rule.path);
    if(Object.keys(rule).some(key=>!['path','format','maxSize','quality','colorSpace'].includes(key)))throw Error('Unknown texture rule field');
    if(!formats.includes(rule.format)||!Number.isInteger(rule.maxSize)||rule.maxSize<4||rule.maxSize>16384)throw Error('Every path rule requires an explicit format and positive maximum size');
    if(rule.quality!==undefined&&(!Number.isInteger(rule.quality)||rule.quality<0||rule.quality>100))throw Error('Invalid texture quality');
    if(rule.colorSpace!==undefined&&!['srgb','linear'].includes(rule.colorSpace))throw Error('Invalid texture color space');
  }
  return doc;
}
export function StrictRule(doc,file,imageIndex=undefined){
  // Embedded selectors inherit the model rule, then override only image N.
  // Names need not be unique: use the stable glTF image index, never its label.
  if(imageIndex!==undefined&&(!Number.isInteger(imageIndex)||imageIndex<0))throw Error('Invalid embedded image index');
  const embedded=imageIndex===undefined?null:file+'#image/'+imageIndex;
  let result;
  for(const rule of doc.rules)if(PathPattern(rule.path).test(file)
    ||embedded&&rule.path.includes('#image/')&&PathPattern(rule.path).test(embedded))result={...result,...rule};
  if(!result)throw Error('No texture publication rule: '+file);
  return result;
}
export async function WalkSite(root,relative=''){
  const rows=[];
  for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){
    const file=relative?relative+'/'+entry.name:entry.name;
    if(entry.isSymbolicLink())throw Error('Publication inputs cannot be links: '+file);
    if(entry.isDirectory())rows.push(...await WalkSite(root,file));else rows.push(file);
  }
  return rows.sort();
}
export async function SourceInputs(root){
  let files;
  try{files=execFileSync('git',['ls-files','-z','--',...PUBLISH_SOURCE_PATHS],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\0').filter(Boolean);}
  catch{files=await WalkSite(root);}
  return files.filter(file=>IsPublishedSource(file)&&!IsPruned(file)&&(IsImage(file)||IsPublishModel(file))).sort();
}
