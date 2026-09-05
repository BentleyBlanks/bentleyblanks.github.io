// P012 soil heightfield. The same Float32 vertices define visible triangles and
// all ground queries; flattened foundations preserve the authored metre scale.
const Clamp01 = value => Math.max(0, Math.min(1, value));
const Smooth = value => { const t = Clamp01(value); return t * t * (3 - 2 * t); };

export function CreateP012Terrain(layout) {
  const {x, z, w, d} = layout.ground, cellM = 2, chunkCells = 32;
  const minX = x - w / 2, minZ = z - d / 2;
  const cols = Math.ceil(w / cellM), rows = Math.ceil(d / cellM);
  const stepX = w / cols, stepZ = d / rows, width = cols + 1;
  const heights = new Float32Array(width * (rows + 1));
  // At least a cell diagonal of level apron keeps interpolation flat even at
  // rotated road edges. The following eight metres blend into the surrounding soil.
  const apron = Math.hypot(stepX, stepZ) + .2, blend = 8, bucketM = 32, buckets = new Map();
  for (const block of [...layout.blocks, ...layout.gates]) {
    const c = Math.cos(block.ry || 0), s = Math.sin(block.ry || 0);
    const pad = {x:block.x, z:block.z, hx:block.w/2, hz:block.d/2, c, s};
    const ax = Math.abs(c)*pad.hx + Math.abs(s)*pad.hz + apron + blend;
    const az = Math.abs(s)*pad.hx + Math.abs(c)*pad.hz + apron + blend;
    for (let iz=Math.floor((pad.z-az)/bucketM); iz<=Math.floor((pad.z+az)/bucketM); iz++)
      for (let ix=Math.floor((pad.x-ax)/bucketM); ix<=Math.floor((pad.x+ax)/bucketM); ix++) {
        const key=`${ix},${iz}`; if(!buckets.has(key))buckets.set(key,[]); buckets.get(key).push(pad);
      }
  }
  for (let iz=0; iz<=rows; iz++) for (let ix=0; ix<=cols; ix++) {
    const px=minX+ix*stepX, pz=minZ+iz*stepZ;
    // Low rolling fields beside the station and roads; broader rises outside
    // the tactical islands. No random seed or second runtime height formula.
    const outer=Smooth((Math.max(Math.abs(px-40)/150,Math.abs(pz+25)/190)-1)/.75);
    let h=.85*Math.sin((px+18)/24)*Math.cos((pz-12)/33)
      +.45*Math.sin((px+pz)/17)+.5
      +outer*(2.6+1.8*Math.sin(px/67)*Math.cos(pz/79));
    let flat=1;
    for(const pad of buckets.get(`${Math.floor(px/bucketM)},${Math.floor(pz/bucketM)}`)||[]) {
      const dx=px-pad.x,dz=pz-pad.z;
      const distance=Math.hypot(Math.max(0,Math.abs(dx*pad.c-dz*pad.s)-pad.hx),
        Math.max(0,Math.abs(dx*pad.s+dz*pad.c)-pad.hz));
      flat=Math.min(flat,Smooth((distance-apron)/blend)); if(flat===0)break;
    }
    heights[iz*width+ix]=h*flat;
  }
  const NodeHeight = (ix, iz) => heights[Math.max(0,Math.min(rows,iz))*width+Math.max(0,Math.min(cols,ix))];
  const SampleHeight = (px,pz) => {
    const gx=Clamp01((px-minX)/w)*cols,gz=Clamp01((pz-minZ)/d)*rows;
    const ix=Math.min(cols-1,Math.floor(gx)),iz=Math.min(rows-1,Math.floor(gz)),u=gx-ix,v=gz-iz;
    const a=NodeHeight(ix,iz),b=NodeHeight(ix+1,iz),c=NodeHeight(ix,iz+1),e=NodeHeight(ix+1,iz+1);
    return u+v<=1 ? a+(b-a)*u+(c-a)*v : e+(c-e)*(1-u)+(b-e)*(1-v);
  };
  function* Chunks() {
    for(let z0=0;z0<rows;z0+=chunkCells)for(let x0=0;x0<cols;x0+=chunkCells){
      const nx=Math.min(chunkCells,cols-x0),nz=Math.min(chunkCells,rows-z0),stride=nx+1;
      const positions=new Float32Array(stride*(nz+1)*3),normals=new Float32Array(positions.length),uvs=new Float32Array(stride*(nz+1)*2),indices=[];
      for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
        const ix=x0+i,iz=z0+j,at=j*stride+i,px=minX+ix*stepX,pz=minZ+iz*stepZ;
        positions.set([px,NodeHeight(ix,iz),pz],at*3);uvs.set([px/8,pz/8],at*2);
        // Global neighbours give identical lighting at adjacent chunk edges.
        const dx=(NodeHeight(ix+1,iz)-NodeHeight(ix-1,iz))/(2*stepX),dz=(NodeHeight(ix,iz+1)-NodeHeight(ix,iz-1))/(2*stepZ),len=Math.hypot(dx,1,dz);
        normals.set([-dx/len,1/len,-dz/len],at*3);
        if(i<nx&&j<nz)indices.push(at,at+stride,at+1,at+1,at+stride,at+stride+1);
      }
      yield {id:`${x0}_${z0}`,positions,normals,uvs,indices};
    }
  }
  return {cellM,cols,rows,minX,minZ,stepX,stepZ,heights,NodeHeight,SampleHeight,Chunks};
}
