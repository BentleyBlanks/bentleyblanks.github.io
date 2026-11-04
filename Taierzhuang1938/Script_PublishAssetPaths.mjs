// PC publication inventories files on disk. Rules set encoding policy, never admission.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {IMPORT_FORMATS, IMPORT_SIZES} from './Script_TextureImportRules.mjs';
import {Within} from './Script_PublishCache.mjs';
import {PUBLISH_EXCLUDE} from '../scripts/Script_PublishPrune.mjs';

const AssetImage = /\.(?:png|webp|jpe?g|hdr|exr|dds|tga|ktx2)$/i;
export const IsPublishModel = file => /\.(?:glb|gltf)$/i.test(file);
export function PathPattern(pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.includes('\\') || pattern.startsWith('/') || pattern.split('/').includes('..')) throw Error('Invalid publication path pattern');
  let expression = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern.slice(i, i + 3) === '**/') { expression += '(?:.*/)?'; i += 2; }
    else if (pattern.slice(i, i + 2) === '**') { expression += '.*'; i++; }
    else if (pattern[i] === '*') expression += '[^/]*';
    else expression += pattern[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + expression + '$');
}
export function ValidatePathRules(doc) {
  if (doc?.version !== 1 || !Array.isArray(doc.roots) || !doc.roots.length || !Array.isArray(doc.rules)) throw Error('Invalid publication path rules');
  for (const root of doc.roots) if (!/^[A-Za-z][A-Za-z0-9_/]*$/.test(root)) throw Error('Invalid publication root');
  for (const rule of doc.rules) {
    PathPattern(rule.path);
    if (Object.keys(rule).some(key => !['path','format','maxSize','quality','reason'].includes(key))) throw Error('Unknown publication rule field');
    if (rule.format !== undefined && !['auto', ...IMPORT_FORMATS.filter(value => value === 'source' || value.startsWith('ktx2'))].includes(rule.format)) throw Error('Invalid publication format');
    if (rule.maxSize !== undefined && !IMPORT_SIZES.includes(rule.maxSize)) throw Error('Invalid publication maximum size');
    if (rule.quality !== undefined && (!Number.isInteger(rule.quality) || rule.quality < 0 || rule.quality > 100)) throw Error('Invalid publication quality');
    if (rule.format === 'source' && !rule.reason?.trim()) throw Error('Source publication exceptions require a reason');
  }
  return doc;
}
export async function LoadPathRules(projectDir) {
  let bytes;
  try { bytes = await fs.readFile(Within(projectDir, 'Data_PublishPathRules.json')); }
  catch (error) {
    // Isolated encoder fixtures do not have a complete checkout.
    if (error.code !== 'ENOENT') throw error;
    bytes = await fs.readFile(new URL('./Data_PublishPathRules.json', import.meta.url));
  }
  return ValidatePathRules(JSON.parse(bytes));
}
export function ResolvePathRule(doc, file) {
  const result = {format:'auto', maxSize:0};
  for (const rule of doc.rules) if (PathPattern(rule.path).test(file)) Object.assign(result, rule);
  return result;
}
export async function DiscoverPublishInputs(directory, rules, {modelFiles = null, textureFiles = null, generated = []} = {}) {
  const omitted = new Set(generated), files = [];
  const Walk = async (full, prefix) => {
    for (const entry of await fs.readdir(full, {withFileTypes:true}).catch(error => {if(error.code==='ENOENT')return [];throw error;})) {
      const file = prefix + '/' + entry.name;
      if (entry.isSymbolicLink()) throw Error('Publication input is a symbolic link: ' + file);
      if (entry.isDirectory()) await Walk(Within(directory,file),file);
      else if (!omitted.has(file) && (IsPublishModel(file) || AssetImage.test(file) || /\.bin$/i.test(file))) {
        if (IsPublishModel(file) && modelFiles && !modelFiles.includes(file)) continue;
        if (!IsPublishModel(file) && textureFiles && (!file.startsWith('Texture/') || !textureFiles.includes(file.slice(8)))) continue;
        files.push(file);
      }
    }
  };
  for (const root of rules.roots) await Walk(Within(directory,root),root);
  for (const file of files.filter(IsPublishModel)) {
    const {doc}=ReadPublishModel(await fs.readFile(Within(directory,file)),file);
    for(const image of doc.images||[]) {
      const external=LocalModelImage(file,image.uri);
      if(external) {
        await fs.access(Within(directory,external));
        files.push(external);
      }
    }
    for(const buffer of doc.buffers||[]) {
      const external=LocalModelImage(file,buffer.uri);
      if(external){await fs.access(Within(directory,external));files.push(external);}
    }
  }
  return [...new Set(files)].sort();
}
export async function ExpectedPublishInputs(projectDir,rules,selection={}) {
  const prefix=path.basename(path.dirname(fileURLToPath(import.meta.url)))+'/';
  return (await DiscoverPublishInputs(projectDir,rules,selection)).filter(file=>!PUBLISH_EXCLUDE.some(entry=>
    entry.path.endsWith('/')?(prefix+file).startsWith(entry.path):PathPattern(entry.path).test(prefix+file)));
}
export function ReadPublishModel(bytes, file) {
  if (file.toLowerCase().endsWith('.gltf')) return {doc:JSON.parse(bytes.toString()), bin:null};
  if (bytes.readUInt32LE(0)!==0x46546c67 || bytes.readUInt32LE(4)!==2 || bytes.readUInt32LE(8)!==bytes.length || bytes.readUInt32LE(16)!==0x4e4f534a) throw Error('Invalid GLB: '+file);
  const size=bytes.readUInt32LE(12), hasBin=bytes.length>20+size;
  if(hasBin && bytes.readUInt32LE(24+size)!==0x004e4942)throw Error('Invalid GLB BIN: '+file);
  return {doc:JSON.parse(bytes.subarray(20,20+size).toString()),bin:hasBin?bytes.subarray(28+size):Buffer.alloc(0)};
}
export function LocalModelImage(file, uri) {
  if (typeof uri !== 'string' || /^(?:data:|https?:|\/\/)/i.test(uri)) return null;
  const result=path.posix.normalize(path.posix.join(path.posix.dirname(file),decodeURIComponent(uri.split(/[?#]/)[0])));
  if(result.startsWith('../') || path.posix.isAbsolute(result) || result.includes('\\'))throw Error('External model image escapes publication: '+file);
  return result;
}
