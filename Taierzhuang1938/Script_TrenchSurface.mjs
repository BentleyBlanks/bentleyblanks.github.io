// Physical trench dressing: shared static batches, shared heightfield, no new gameplay floor.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { HashString, Mulberry32 } from './Script_Noise.mjs';
import { TRENCH_SURFACE as C } from './Data_TrenchSurface.mjs';
import { TRENCH_APPEARANCE as Earth } from './Data_TrenchAppearance.mjs';

export async function LoadTrenchSurface() {
  const resources=[];
  const Fetch=async url=>{const r=await fetch(`${url}?v=${C.version}`,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error(`${url}: ${r.status}`);return r;};
  const Model=async url=>{
    const gltf=await new GLTFLoader().parseAsync(await (await Fetch(url)).arrayBuffer(),'');
    gltf.scene.updateMatrixWorld(true);let geometry;
    gltf.scene.traverse(node=>{
      if(!node.isMesh)return;
      if(!geometry)geometry=node.geometry.clone().applyMatrix4(node.matrixWorld);
      node.geometry.dispose();
      for(const m of (Array.isArray(node.material)?node.material:[node.material]))m.dispose();
    });
    if(!geometry)throw new Error(`Missing trench mesh: ${url}`);
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    resources.push(geometry);return geometry;
  };
  try {
    const results=await Promise.allSettled([Model(C.models.grass),Model(C.models.stone),
      (async()=>{const bitmap=await createImageBitmap(await (await Fetch(C.mudMap)).blob(),{colorSpaceConversion:'none'});
        const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        const map=new THREE.DataTexture(new Uint8Array(pixels),canvas.width,canvas.height);
        map.colorSpace=THREE.NoColorSpace;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;
        map.generateMipmaps=true;map.needsUpdate=true;resources.push(map);return map;})(),
      (async()=>{const bitmap=await createImageBitmap(await (await Fetch(C.rootMap)).blob(),{imageOrientation:'flipY',premultiplyAlpha:'none'});
        const map=new THREE.Texture(bitmap);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
        map.needsUpdate=true;resources.push(map);resources.push({dispose:()=>bitmap.close()});return map;})()]);
    const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
    const [grass,stone,mud,rootMap]=results.map(r=>r.value);
    return {grass,stone,mud,rootMap,Dispose(){for(const r of resources)r.dispose();}};
  } catch(error){for(const r of resources)r.dispose();throw error;}
}

export function BuildTrenchSurface(sink,plan,groundAt,assets) {
  const stats={stones:0,grass:0,triangles:0};const occupied=new Set();
  const Range=(r,a)=>a[0]+r()*(a[1]-a[0]);
  const GrassMat=(x,z,scale,angle,mirror)=>{
    const positions=[],uvs=[],indices=[],cols=8,rows=6;
    const c=Math.cos(angle),s=Math.sin(angle);
    for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++) {
      const u=col/cols,v=row/rows,px=(u-.5)*C.grass.matWidthM*scale,pz=(.18-v*C.grass.matDepthM)*scale;
      const wx=x+px*c+pz*s,wz=z-px*s+pz*c;
      positions.push(wx,groundAt(wx,wz)+.055+.075*Math.sin(v*Math.PI),wz);
      uvs.push(mirror?1-u:u,1-v);
    }
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const a=row*(cols+1)+col,b=a+cols+1;indices.push(a,a+1,b,a+1,b+1,b);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    sink.SetSector(`TrenchSurface_${Math.floor(x/C.sectorM)}_${Math.floor(z/C.sectorM)}`);
    stats.triangles+=indices.length/3;sink.Add('TrenchDryGrass',geometry);
  };
  const Add=(key,source,x,z,scale,angle,embed)=>{
    const earthSector=`TrenchEarth_${Math.floor(x/Earth.sectorM)}_${Math.floor(z/Earth.sectorM)}`;
    // Sparse silhouette strands share an existing earth batch; do not open a
    // whole additional draw sector just for a few roots beyond its border.
    if(key==='TrenchRootStrands' && sink.buckets && !sink.buckets.has(`${earthSector}|ground`))return;
    const geometry=source.clone();geometry.scale(scale,scale,scale);geometry.rotateY(angle);
    geometry.translate(x,groundAt(x,z)-embed,z);
    if(key==='TrenchRootStrands') {
      // The root mat follows the real bank under every blade, including turns.
      // Preserve upright tips; hanging strands hug the bank with a small air gap.
      const p=geometry.attributes.position,base=groundAt(x,z)-embed;
      for(let v=0;v<p.count;v++) {
        const rise=p.getY(v)-base;
        p.setY(v,groundAt(p.getX(v),p.getZ(v))+.018+Math.max(0,rise)*.65);
      }
      geometry.computeVertexNormals();
    }
    if(key==='TrenchStone') {
      // Embed the whole footprint on steep banks, not only its centre. The contact
      // shader supplies the gradual soil coat along this physically buried edge.
      const p=geometry.attributes.position,centerHeight=groundAt(x,z);
      for(let v=0;v<p.count;v++)p.setY(v,p.getY(v)+groundAt(p.getX(v),p.getZ(v))-centerHeight);
      geometry.computeVertexNormals();
    }
    sink.SetSector(key==='TrenchRootStrands'
      ? earthSector
      : `TrenchSurface_${Math.floor(x/C.sectorM)}_${Math.floor(z/C.sectorM)}`);
    stats.triangles+=(geometry.index?.count||geometry.attributes.position.count)/3;sink.Add(key==='TrenchRootStrands'?'ground':key,geometry);
  };
  for(const segment of plan.segments){
    const random=Mulberry32(HashString(`${plan.seed}:${segment.id}:WetSurface07`));
    for(let i=0;i<segment.stations.length;i++){
      const st=segment.stations[i];if(st.junctionClear||st.s<3||st.s>segment.path.length-3)continue;
      const floor=groundAt(st.x,st.z);
      for(const side of [-1,1]){
        if(i%C.stone.stride===0&&random()<C.stone.chance){
          const offset=st.halfFloor*(.85+random()*.15)+st.bank*random()*.9;
          const along=(random()-.5)*1.2,x=st.x+st.nx*side*offset+st.tx*along,z=st.z+st.nz*side*offset+st.tz*along;
          const scale=Range(random,C.stone.scale);
          Add('TrenchStone',assets.stone,x,z,scale,random()*Math.PI*2,scale*C.stone.embed);stats.stones++;
          // Small fragments cluster at the foot of the exposed bank, leaving the walking centre clear.
          for(let k=0;k<2;k++){
            Add('TrenchStone',assets.stone,x+(random()-.5)*.65,z+(random()-.5)*.65,scale*(.22+random()*.35),random()*6.28,.025);stats.stones++;
          }
        }
        if(i%C.grass.stride!==0||random()>C.grass.chance)continue;
        const crest=st.halfFloor+st.bank*(.91+random()*.12);
        const x=st.x+st.nx*side*crest,z=st.z+st.nz*side*crest;
        if(groundAt(x,z)-floor<.8||plan.Depth(x,z)>st.depth-.8)continue;
        const cell=`${Math.round(x*2)}:${Math.round(z*2)}`;if(occupied.has(cell))continue;occupied.add(cell);
        // glTF local -Z points down the bank towards its centre; roots are slightly buried.
        const along=(random()-.5)*.3;
        GrassMat(x+st.tx*along,z+st.tz*along,Range(random,C.grass.scale),Math.atan2(st.nx*side,st.nz*side)+(random()-.5)*.35,random()<.5);
        stats.grass++;
        if(random()<.16)Add('TrenchRootStrands',assets.grass,x,z,.48,Math.atan2(st.nx*side,st.nz*side),.035);
      }
    }
  }
  return stats;
}

export function PaintTrenchBatch(mesh,grass=false) {
  const p=mesh.geometry.attributes.position,count=p.count,colors=new Float32Array(count*3),layers=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const variation=grass ? .88+.12*(.5+.5*Math.sin(p.getX(i)*21.7+p.getZ(i)*13.1+p.getY(i)*37)):1;
    colors[i*3]=colors[i*3+1]=colors[i*3+2]=variation;layers[i*3+1]=1;
  }
  mesh.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  if(!grass)mesh.geometry.setAttribute('terrainLayers',new THREE.BufferAttribute(layers,3));
  mesh.material.vertexColors=true;
  mesh.userData.deformableTerrain=true;mesh.userData.trenchEarth=true;mesh.userData.trenchSurface=true;
}
