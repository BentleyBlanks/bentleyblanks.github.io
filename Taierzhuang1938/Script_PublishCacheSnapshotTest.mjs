import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {CachedFiles} from './Script_PublishCache.mjs';
import {SnapshotPublishCache} from './Script_SnapshotPublishCache.mjs';
const workflow=await fs.readFile(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
const restorePath=workflow.match(/- uses: actions\/cache\/restore@v4\s+id: gpu-assets\s+with:\s+path: ([^\r\n]+)/)?.[1];
const savePath=workflow.match(/- uses: actions\/cache\/save@v4[\s\S]*?with:\s+path: ([^\r\n]+)/)?.[1];
assert.ok(restorePath&&savePath);assert.equal(restorePath,savePath,'Actions restore/save must use the same path-derived cache version');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'PublishCacheSnapshot-'));
try {
  const live=path.join(root,'live'),snapshot=path.join(root,'snapshot'),target=path.join(root,'encoded'),key='a'.repeat(64);
  await fs.mkdir(target);
  await CachedFiles(live,key,target,async()=>{await fs.writeFile(path.join(target,'Texture_Test.ktx2'),'verified bytes');return {value:{filename:'Texture_Test.ktx2'},names:['Texture_Test.ktx2']};});
  for(const key of ['b'.repeat(64),'c'.repeat(64)])await fs.mkdir(path.join(live,key));
  await fs.writeFile(path.join(live,'b'.repeat(64),'Data_Cache.json'),'{"files":[]}');
  const result=await SnapshotPublishCache(live,snapshot);assert.equal(result.copied,1);assert.equal(result.skipped,2);
  await fs.writeFile(path.join(live,key,'Texture_Test.ktx2'),'later live-cache mutation');
  const restored=await CachedFiles(snapshot,key,path.join(root,'restored'),async()=>{throw Error('valid snapshot must restore');});
  assert.equal(restored.hit,true);assert.equal(await fs.readFile(path.join(root,'restored','Texture_Test.ktx2'),'utf8'),'verified bytes');
  await assert.rejects(SnapshotPublishCache(live,live),/separate/);
  await assert.rejects(SnapshotPublishCache(live,snapshot),/empty/);
  console.log('PASS PublishCacheSnapshot: immutable verified entries, unfinished/corrupt skips, restore and live mutation isolation');
} finally {await fs.rm(root,{recursive:true,force:true});}
