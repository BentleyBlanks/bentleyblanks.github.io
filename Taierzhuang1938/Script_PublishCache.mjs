import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const Hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function Within(root, relative) {
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw Error(`Path outside publish root: ${relative}`);
  return resolved;
}
/** Cache is optional and untrusted: validate every byte; a missing/corrupt entry rebuilds. */
export async function CachedFiles(cacheDir, key, destination, produce) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw Error('Invalid content cache key');
  const folder = cacheDir && Within(cacheDir, key);
  if (folder) {
    try {
      const record = JSON.parse(await fs.readFile(path.join(folder, 'Data_Cache.json'), 'utf8'));
      if (record.key !== key || !Array.isArray(record.files) || !record.files.length) throw Error('Invalid cache manifest');
      const files = [];
      for (const item of record.files) {
        if (path.basename(item.name) !== item.name) throw Error('Invalid cached filename');
        const bytes = await fs.readFile(Within(folder, item.name));
        if (bytes.length !== item.bytes || Hash(bytes) !== item.sha256) throw Error('Invalid cached content');
        files.push({name: item.name, bytes});
      }
      await fs.mkdir(destination, {recursive: true});
      for (const file of files) await fs.writeFile(Within(destination, file.name), file.bytes);
      return {value: record.value, hit: true};
    } catch { /* Rebuild; never publish unverified cache data. */ }
  }
  const {value, names} = await produce();
  if (folder) {
    await fs.mkdir(folder, {recursive: true});
    const files = [];
    for (const name of names) {
      if (path.basename(name) !== name) throw Error('Invalid output filename');
      const bytes = await fs.readFile(Within(destination, name));
      await fs.writeFile(Within(folder, name), bytes);
      files.push({name, bytes: bytes.length, sha256: Hash(bytes)});
    }
    const manifest = path.join(folder, 'Data_Cache.json');
    await fs.writeFile(manifest + '.tmp', JSON.stringify({key, value, files}));
    await fs.rename(manifest + '.tmp', manifest);
  }
  return {value, hit: false};
}
