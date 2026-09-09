import * as THREE from "three";

// Shared vertex clustering for baked distant poses; full actor geometry remains intact.
export function ClusterDistantGeometry(source,cellM){
  const position=source.attributes.position,normal=source.attributes.normal;
  const clusters=new Map(),vertices=[],remap=[];
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i),key=[x,y,z].map(v=>Math.round(v/cellM)).join(",");
    let index=clusters.get(key);
    if(index===undefined){index=vertices.length;clusters.set(key,index);vertices.push({x:0,y:0,z:0,rep:i,count:0});}
    const p=vertices[index];p.x+=x;p.y+=y;p.z+=z;p.count++;remap.push(index);
  }
  const indices=[],faces=new Set(),count=source.index?.count||position.count;
  for(let i=0;i<count;i+=3){
    const face=[0,1,2].map(k=>remap[source.index?source.index.getX(i+k):i+k]);
    if(new Set(face).size<3)continue;
    const key=face.slice().sort((a,b)=>a-b).join(",");if(faces.has(key))continue;faces.add(key);indices.push(...face);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices.flatMap(p=>[p.x/p.count,p.y/p.count,p.z/p.count]),3));
  // Every other attribute (normal, uv, vertex color, tangent, uv1...) is copied from the
  // representative vertex: a material with vertexColors reads a missing color as black.
  for(const [name,attribute] of Object.entries(source.attributes)){
    if(name==="position")continue;
    const size=attribute.itemSize,array=new Float32Array(vertices.length*size);
    for(let v=0;v<vertices.length;v++)for(let k=0;k<size;k++)array[v*size+k]=attribute.getComponent(vertices[v].rep,k);
    geometry.setAttribute(name,new THREE.BufferAttribute(array,size));
  }
  geometry.setIndex(indices);
  if(!normal)geometry.computeVertexNormals();
  return geometry;
}
