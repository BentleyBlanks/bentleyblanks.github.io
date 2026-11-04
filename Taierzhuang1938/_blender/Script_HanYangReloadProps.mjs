// Export the real runtime packet geometry for the Blender authoring scene.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {Viewmodel} from '../Script_Viewmodel.mjs';
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(!out)throw Error('Required: --out=<absolute Data_HanYangReloadProps.json>');
const host={reloadRoundGeometries:new Map(),materials:Object.fromEntries(['brass','blued','steel'].map(n=>[n,new THREE.MeshStandardMaterial()]))};
for(const name of ['_BuildClipProp','_ReloadRoundGeometry','_CleanReloadLathe','_ConfigureReloadProp'])host[name]=Viewmodel.prototype[name];
const prop=host._BuildClipProp(true);host._ConfigureReloadProp(prop,'HanYang',5);prop.updateMatrixWorld(true);
const Mesh=(mesh)=>{const p=mesh.geometry.attributes.position,point=new THREE.Vector3(),positions=[];for(let i=0;i<p.count;i++)positions.push(...point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld).toArray());return{positions,indices:Array.from(mesh.geometry.index.array)};};
const data={source:'Viewmodel._BuildClipProp / _ConfigureReloadProp(HanYang, 5)',body:Mesh(prop.userData.body),cases:Mesh(prop.userData.rounds.children[0]),bullets:Mesh(prop.userData.rounds.children[1])};
await fs.mkdir(path.dirname(path.resolve(out)),{recursive:true});await fs.writeFile(out,JSON.stringify(data));
console.log('Exported actual HanYang packet',out);
