// P012 soil heightfield. The same Float32 vertices define visible triangles and
// all ground queries; flattened foundations preserve the authored metre scale.
import { SampleMissionTerrain } from "./Data_FirstLevelMissionTerrain.mjs";
const Clamp01 = value => Math.max(0, Math.min(1, value));
const Smooth = value => { const t = Clamp01(value); return t * t * (3 - 2 * t); };

/**
 * 渲染分块的边长（米）。**按米不按格**：分块常数原来写死 32 **格**，
 * 而正片第一关的 `MISSION_TERRAIN.cellM` 是 0.75 m（旧 P012 夹具是 2 m），
 * 于是同一句代码在正片上切出的是 24 m 的小块 —— 342 × 732 m 的地块被切成
 * 465 只网格。车厢内那个机位顺着车厢往前看，**378 只地块同时进视锥**，
 * 预通道与主通道各提交一次 = 756 个 draw call，占整帧 1498 个的一半
 *（`Script_FirstLevelFrameProbe --strict` 的逐 pass draw 归账）。而这一帧是
 * CPU 提交受限的（docs/Data_TechRenderPipeline.md §13.2），所以这一半是纯亏。
 *
 * 48 m 一块：正片 465 → 128 只，视锥内 378 → 约 100；三角总数一个不变
 *（分块只改接缝处的顶点复制量），法线仍按全局邻居算，接缝照旧无缝。
 * 下限 32 格保证 2 m 格的旧夹具维持原来的 64 m 分块，行为不变。
 * 上限的取舍：块越大，`CutTerrainRectangles` 挖弹坑时要扫的三角越多
 *（一块 2048 → 8192）。
 *
 * 2026-09-15 再放粗一档到 **72 m**：正片 128 → 60 只，车厢机位视锥内
 * 87 → 约 40 只/趟。弹坑扫描一块 8192 → 18432 个三角，仍是**只在建关那一次**
 * 跑（`CutTerrainRectangles` 不进帧循环）；视锥剔除变粗换来的三角增量见
 * `Script_BootTest` 的 `SCENE_RENDER_LIMITS` 对照。再往上（96 m）就只剩
 * 三十来只，省的 draw 追不上多画的三角，停在这儿。
 */
const CHUNK_METRES = 72;

export function CreateP012Terrain(layout) {
  const {x, z, w, d} = layout.ground, cellM = layout.terrainSpec?.cellM || 2;
  const chunkCells = Math.max(32, Math.round(CHUNK_METRES / cellM));
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
    // The authored mission terrain carries its own pads; the fixture formula below is not used.
    if (layout.terrainSpec) { heights[iz*width+ix]=SampleMissionTerrain(px,pz,layout.terrainSpec); continue; }
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
  const {cellOf, fine, sub} = RefineCells(layout.terrainSpec, {cols, rows, minX, minZ, stepX, stepZ, NodeHeight});
  const fineWidth = sub + 1, fineCount = fineWidth * fineWidth;
  const SampleHeight = (px,pz) => {
    const gx=Clamp01((px-minX)/w)*cols,gz=Clamp01((pz-minZ)/d)*rows;
    const ix=Math.min(cols-1,Math.floor(gx)),iz=Math.min(rows-1,Math.floor(gz));
    let u=gx-ix,v=gz-iz,a,b,c,e;
    const slot=cellOf ? cellOf[iz*cols+ix] : -1;
    if(slot>=0){
      // Same anti-diagonal split, one level down inside the refined cell.
      const fx=Math.min(sub-1,Math.floor(u*sub)),fz=Math.min(sub-1,Math.floor(v*sub)),at=slot*fineCount+fz*fineWidth+fx;
      u=u*sub-fx; v=v*sub-fz;
      a=fine[at]; b=fine[at+1]; c=fine[at+fineWidth]; e=fine[at+fineWidth+1];
    } else {
      a=NodeHeight(ix,iz); b=NodeHeight(ix+1,iz); c=NodeHeight(ix,iz+1); e=NodeHeight(ix+1,iz+1);
    }
    return u+v<=1 ? a+(b-a)*u+(c-a)*v : e+(c-e)*(1-u)+(b-e)*(1-v);
  };
  const textureTileM = layout.terrainSpec?.textureTileM || 8;
  const textureZSign = layout.terrainSpec?.textureTileM ? -1 : 1;
  function* Chunks() {
    const fx=stepX/sub,fz=stepZ/sub;
    for(let z0=0;z0<rows;z0+=chunkCells)for(let x0=0;x0<cols;x0+=chunkCells){
      const nx=Math.min(chunkCells,cols-x0),nz=Math.min(chunkCells,rows-z0),stride=nx+1;
      let refined=0;
      if(cellOf)for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)if(cellOf[(z0+j)*cols+x0+i]>=0)refined++;
      const vertices=stride*(nz+1)+refined*fineCount;
      const positions=new Float32Array(vertices*3),normals=new Float32Array(positions.length),uvs=new Float32Array(vertices*2),indices=[];
      for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
        const ix=x0+i,iz=z0+j,at=j*stride+i,px=minX+ix*stepX,pz=minZ+iz*stepZ;
        positions.set([px,NodeHeight(ix,iz),pz],at*3);uvs.set([px/textureTileM,textureZSign*pz/textureTileM],at*2);
        // Global neighbours give identical lighting at adjacent chunk edges.
        const dx=(NodeHeight(ix+1,iz)-NodeHeight(ix-1,iz))/(2*stepX),dz=(NodeHeight(ix,iz+1)-NodeHeight(ix,iz-1))/(2*stepZ),len=Math.hypot(dx,1,dz);
        normals.set([-dx/len,1/len,-dz/len],at*3);
        if(i<nx&&j<nz&&!(cellOf&&cellOf[iz*cols+ix]>=0))indices.push(at,at+stride,at+1,at+1,at+stride,at+stride+1);
      }
      // Refined cells carry their own vertex grid; normals come from the refined surface itself.
      let next=stride*(nz+1);
      if(refined)for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
        const ix=x0+i,iz=z0+j,slot=cellOf[iz*cols+ix];
        if(slot<0)continue;
        const first=next;
        for(let q=0;q<=sub;q++)for(let p=0;p<=sub;p++,next++){
          const px=minX+(ix*sub+p)*fx,pz=minZ+(iz*sub+q)*fz;
          positions.set([px,fine[slot*fineCount+q*fineWidth+p],pz],next*3);
          uvs.set([px/textureTileM,textureZSign*pz/textureTileM],next*2);
          const dx=(SampleHeight(px+fx,pz)-SampleHeight(px-fx,pz))/(2*fx),dz=(SampleHeight(px,pz+fz)-SampleHeight(px,pz-fz))/(2*fz),len=Math.hypot(dx,1,dz);
          normals.set([-dx/len,1/len,-dz/len],next*3);
          if(p<sub&&q<sub){const at=first+q*fineWidth+p;indices.push(at,at+fineWidth,at+1,at+1,at+fineWidth,at+fineWidth+1);}
        }
      }
      yield {id:`${x0}_${z0}`,positions,normals,uvs,indices};
    }
  }
  return {cellM,cols,rows,minX,minZ,stepX,stepZ,heights,NodeHeight,SampleHeight,Chunks,
    refinedCells:cellOf?fine.length/fineCount:0,refineSubdivisions:sub};
}

/**
 * 0.75 m 的格采不住沟壁：2 m 深的沟只用 1.1 m 宽的坡落下去，一格里的线性插值
 * 能差出半米，而且格点落在坡上的位置随沟的走向周期性变化 —— 斜着走的沟，
 * 渲染出来就是一排齿（2026-09-27 用户截图）。于是只在「一格插值误差大」的地方
 * 往下细分成 sub×sub 小格，高度照样取解析地形；渲染网格、SampleHeight（贴地、
 * 角色、弹坑块重采样）读的都是这一份，不另起一套地表。
 *
 * 挑格子：粗格点的二阶差分或非平面度先筛一遍（便宜），再在格心取一次解析高度，
 * 与现在的三角插值差超过 errorM 的才细分。细分格与不细分邻格的共享边上，
 * 小格点取两端粗格点的直线插值（邻格的三角边就是这条直线，不开裂）；
 * 这条边上解析中点也偏得多时，把邻格也拉进来，反复到稳定。
 */
function RefineCells(spec, {cols, rows, minX, minZ, stepX, stepZ, NodeHeight}) {
  const sub = spec?.refine?.subdivisions | 0;
  if (sub < 2) return {cellOf: null, fine: null, sub: 1};
  const errorM = spec.refine.errorM ?? .04, screenM = spec.refine.screenM ?? .1;
  const fineWidth = sub + 1, fineCount = fineWidth * fineWidth, rowWidth = cols * sub + 1;
  // Every probe lands on a fine node the refinement would need anyway, so nothing is sampled twice.
  const cache = new Map();
  const FineHeight = (gx, gz) => {
    const key = gz * rowWidth + gx;
    let h = cache.get(key);
    if (h === undefined) { h = SampleMissionTerrain(minX + gx * (stepX / sub), minZ + gz * (stepZ / sub), spec); cache.set(key, h); }
    return h;
  };
  // Error of the coarse anti-diagonal split at fine node (p, q) of cell (ix, iz).
  const CoarseError = (ix, iz, p, q) => {
    const u = p / sub, v = q / sub;
    const a=NodeHeight(ix,iz),b=NodeHeight(ix+1,iz),c=NodeHeight(ix,iz+1),e=NodeHeight(ix+1,iz+1);
    const h = u+v <= 1 ? a+(b-a)*u+(c-a)*v : e+(c-e)*(1-u)+(b-e)*(1-v);
    return Math.abs(FineHeight(ix*sub+p, iz*sub+q) - h);
  };
  const refine = new Uint8Array(cols * rows);
  const Bend = (ix, iz) => Math.max(Math.abs(NodeHeight(ix-1,iz)-2*NodeHeight(ix,iz)+NodeHeight(ix+1,iz)),
    Math.abs(NodeHeight(ix,iz-1)-2*NodeHeight(ix,iz)+NodeHeight(ix,iz+1)));
  const bend = new Float32Array((cols + 1) * (rows + 1));
  for (let iz = 0; iz <= rows; iz++) for (let ix = 0; ix <= cols; ix++) bend[iz*(cols+1)+ix] = Bend(ix, iz);
  const lo = Math.floor(sub / 2), hi = Math.ceil(sub / 2);
  for (let iz = 0; iz < rows; iz++) for (let ix = 0; ix < cols; ix++) {
    const a=NodeHeight(ix,iz),b=NodeHeight(ix+1,iz),c=NodeHeight(ix,iz+1),e=NodeHeight(ix+1,iz+1),at=iz*(cols+1)+ix;
    const k=Math.max(bend[at],bend[at+1],bend[at+cols+1],bend[at+cols+2]);
    if (k < screenM && Math.abs(a+e-b-c) < screenM) continue;
    // One probe on each side of the split diagonal.
    if (CoarseError(ix, iz, lo, lo) > errorM || (hi !== lo && CoarseError(ix, iz, hi, hi) > errorM)
      || (hi === lo && CoarseError(ix, iz, lo + 1, lo + 1) > errorM)) refine[iz*cols+ix] = 1;
  }
  // A refined cell's open edge is a straight line; pull the neighbour in when that line is wrong.
  const edgeChecked = new Set();
  const EdgeBad = (x0, z0, alongX) => {
    const key = (z0 * (cols + 1) + x0) * 2 + (alongX ? 1 : 0);
    if (edgeChecked.has(key)) return false;
    edgeChecked.add(key);
    const h0 = NodeHeight(x0, z0), h1 = alongX ? NodeHeight(x0 + 1, z0) : NodeHeight(x0, z0 + 1);
    for (let p = 1; p < sub; p++) {
      const h = alongX ? FineHeight(x0*sub+p, z0*sub) : FineHeight(x0*sub, z0*sub+p);
      if (Math.abs(h - (h0 + (h1 - h0) * p / sub)) > errorM) return true;
    }
    return false;
  };
  let frontier = [];
  for (let at = 0; at < refine.length; at++) if (refine[at]) frontier.push(at);
  for (let pass = 0; frontier.length && pass < 4; pass++) {
    const add = [];
    for (const at of frontier) {
      const ix = at % cols, iz = (at - ix) / cols;
      if (ix + 1 < cols && !refine[at+1] && EdgeBad(ix+1, iz, false)) add.push(at+1);
      if (ix > 0 && !refine[at-1] && EdgeBad(ix, iz, false)) add.push(at-1);
      if (iz + 1 < rows && !refine[at+cols] && EdgeBad(ix, iz+1, true)) add.push(at+cols);
      if (iz > 0 && !refine[at-cols] && EdgeBad(ix, iz, true)) add.push(at-cols);
    }
    frontier = [];
    for (const at of add) if (!refine[at]) { refine[at] = 1; frontier.push(at); }
  }
  const cellOf = new Int32Array(cols * rows).fill(-1);
  let count = 0;
  for (let at = 0; at < refine.length; at++) if (refine[at]) cellOf[at] = count++;
  const fine = new Float32Array(count * fineCount);
  const Refined = (ix, iz) => ix >= 0 && iz >= 0 && ix < cols && iz < rows && refine[iz*cols+ix] === 1;
  for (let iz = 0; iz < rows; iz++) for (let ix = 0; ix < cols; ix++) {
    const slot = cellOf[iz*cols+ix];
    if (slot < 0) continue;
    const a=NodeHeight(ix,iz),b=NodeHeight(ix+1,iz),c=NodeHeight(ix,iz+1),e=NodeHeight(ix+1,iz+1);
    const openW=!Refined(ix-1,iz),openE=!Refined(ix+1,iz),openS=!Refined(ix,iz-1),openN=!Refined(ix,iz+1);
    for (let q = 0; q <= sub; q++) for (let p = 0; p <= sub; p++) {
      const u = p/sub, v = q/sub;
      let h;
      if ((p === 0 || p === sub) && (q === 0 || q === sub)) h = p ? (q ? e : b) : (q ? c : a);
      else if (q === 0 && openS) h = a+(b-a)*u;
      else if (q === sub && openN) h = c+(e-c)*u;
      else if (p === 0 && openW) h = a+(c-a)*v;
      else if (p === sub && openE) h = b+(e-b)*v;
      else h = FineHeight(ix*sub+p, iz*sub+q);
      fine[slot*fineCount+q*fineWidth+p] = h;
    }
  }
  return {cellOf, fine, sub};
}
