// Freeze only completed, verified PC cache entries before Actions archives them.
// A canceled encoder may still be finishing a different entry in the live cache.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Hash,Within} from './Script_PublishCache.mjs';

export async function SnapshotPublishCache(inputDir,outputDir) {
  inputDir=path.resolve(inputDir);outputDir=path.resolve(outputDir);
  if(inputDir===outputDir||outputDir.startsWith(inputDir+path.sep)||inputDir.startsWith(outputDir+path.sep))throw Error('Cache snapshot must be separate from the live cache');
  await fs.mkdir(outputDir,{recursive:true});
  if((await fs.readdir(outputDir)).length)throw Error('Cache snapshot must start empty');
  const result={copied:0,skipped:0,bytes:0};
  const entries=await fs.readdir(inputDir,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
  for(const entry of entries) {
    if(!entry.isDirectory()||!/^[a-f0-9]{64}$/.test(entry.name))continue;
    let record,files;
    try {
      const directory=Within(inputDir,entry.name);
      record=JSON.parse(await fs.readFile(Within(directory,'Data_Cache.json'),'utf8'));
      if(record.key!==entry.name||!Array.isArray(record.files)||!record.files.length)throw Error('Incomplete cache');
      files=[];
      for(const item of record.files) {
        if(path.basename(item.name)!==item.name)throw Error('Invalid cache filename');
        const bytes=await fs.readFile(Within(directory,item.name));
        if(bytes.length!==item.bytes||Hash(bytes)!==item.sha256)throw Error('Cache changed while snapshotting');
        files.push({name:item.name,bytes});
      }
    } catch {result.skipped++;continue;}
    const target=Within(outputDir,entry.name);await fs.mkdir(target);
    for(const item of files){await fs.writeFile(Within(target,item.name),item.bytes);result.bytes+=item.bytes.length;}
    await fs.writeFile(Within(target,'Data_Cache.json'),JSON.stringify(record));result.copied++;
  }
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const Arg=name=>process.argv[process.argv.indexOf(name)+1];
  if(!process.argv.includes('--input-dir')||!process.argv.includes('--output-dir'))throw Error('Required: --input-dir <live cache> --output-dir <new snapshot>');
  const result=await SnapshotPublishCache(Arg('--input-dir'),Arg('--output-dir'));
  if(process.env.GITHUB_OUTPUT)await fs.appendFile(process.env.GITHUB_OUTPUT,`entries=${result.copied}\n`);
  console.log('PASS cache snapshot',JSON.stringify(result));
}
