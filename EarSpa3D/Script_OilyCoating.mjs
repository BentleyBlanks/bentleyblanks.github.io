// One continuous, closed volume per smear: thin adherent film and raised deposits
// share the same prism lattice. Coordinates are sampled from the actual canal wall.
const Clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const OILY_REGIONS=[
  {angle:.32,width:2.06,start:.85,frontEnd:12.5,end:22.3,lobes:[[-.27,.25,1.72,.29,.105],[.30,.47,1.14,.25,.09],[-.16,.72,1.28,.32,.10],[.38,.87,.54,.23,.065]],deepLobes:[[.12,15.8,1.32,.35,1.1],[-.24,19.1,1.40,.36,1.1],[.24,21.0,.85,.30,.70]]},
  {angle:2.42,width:1.93,start:1.40,frontEnd:15.3,end:23.1,lobes:[[.18,.14,1.35,.29,.095],[-.28,.38,1.80,.31,.105],[.22,.64,1.22,.29,.105],[-.26,.85,.68,.25,.075]],deepLobes:[[.24,16.6,1.08,.32,.85],[-.22,19.5,1.14,.32,.95],[.24,21.8,.67,.30,.7]]},
  {angle:4.55,width:2.04,start:.65,frontEnd:10.9,end:22.0,lobes:[[.22,.25,1.62,.30,.11],[-.27,.53,1.68,.30,.105],[.29,.76,1.02,.27,.095],[-.32,.88,.55,.23,.06]],deepLobes:[[-.15,13.3,1.12,.35,1.0],[.22,16.8,1.32,.35,1.1],[-.24,20.2,1.18,.35,1.0]]},
];
export function BuildOilyCoating(index,seed,wallAt){
  const region=OILY_REGIONS[index],columns=8,frontRows=20,rows=32,stride=columns+1,layer=stride*(rows+1),positions=[],thickness=[],normals=[],parameters=[];
  const phase=seed*.001+index*1.71;
  for(let v=0;v<=rows;v++)for(let u=0;u<=columns;u++){
    // 前段保留原采样密度与积垢位置；额外十二排延伸至深部，仍是同一体积。
    const s=u/columns*2-1,t=v/frontRows;
    const wave=.067*Math.sin(t*17+phase)+.035*Math.sin(t*37-phase);
    const width=region.width*(.78+.13*Math.sin(t*11+phase)+.10*Math.sin(t*23-phase));
    const angle=region.angle+s*width*.5+wave;
    const edgeDepth=.21*Math.sin(s*8+phase)+.16*Math.sin(s*15-phase);
    const axialDepth=v<=frontRows?region.start+t*(region.frontEnd-region.start):region.frontEnd+(v-frontRows)/(rows-frontRows)*(region.end-region.frontEnd);
    const depth=axialDepth+edgeDepth*(.25+.75*Math.abs(2*Math.min(1,t)-1)**4);
    const edge=Math.min(1,(1-Math.abs(s))*4,Math.min(t,(rows-v)/frontRows)*14);
    let h=.052+.045*(.5+.5*Math.sin(s*8+t*19+phase));
    for(const [x,y,height,sx,sy] of region.lobes){const dx=(s-x)/sx,dy=(t-y)/sy;h+=height*Math.exp(-.5*(dx*dx+dy*dy))*(.88+.12*Math.sin(s*16+t*41));}
    for(const [x,y,height,sx,sy] of region.deepLobes){const dx=(s-x)/sx,dy=(axialDepth-y)/sy;h+=height*Math.exp(-.5*(dx*dx+dy*dy))*(.91+.09*Math.sin(s*13+axialDepth*3.1));}
    // Broad thin folds connect the lobes; no isolated ellipsoids or separate strings.
    h+=.065*Math.exp(-(((s-.20*Math.sin(t*12+phase))/.22)**2))*Math.sin(Math.PI*t)**2;
    h=.022+Math.max(0,h-.022)*Clamp(edge);
    const surface=wallAt(depth,angle),p=surface.point,n=surface.normal;
    // 给细分后的弧面留出间隙，避免局部凸起的真实管壁切进背面。
    positions.push(p.map((value,k)=>value+n[k]*.035));thickness.push(h);normals.push(n);parameters.push([s,t,depth,angle]);
  }
  for(let i=0;i<layer;i++)positions.push(positions[i].map((value,k)=>value+normals[i][k]*thickness[i]));
  const tetrahedra=[],cells=[];
  for(let v=0;v<rows;v++)for(let u=0;u<columns;u++){
    const a=v*stride+u,b=a+1,c=a+stride,d=c+1,A=a+layer,B=b+layer,C=c+layer,D=d+layer;
    const first=tetrahedra.length;tetrahedra.push([a,b,d,D],[a,d,c,D],[a,c,C,D],[a,C,A,D],[a,A,B,D],[a,B,b,D]);
    cells.push({u,v,ids:[a,b,c,d,A,B,C,D],tetrahedra:Array.from({length:6},(_,i)=>first+i)});
  }
  for(const t of tetrahedra){const [a,b,c,d]=t.map(i=>positions[i]),x=b.map((v,k)=>v-a[k]),y=c.map((v,k)=>v-a[k]),z=d.map((v,k)=>v-a[k]);const volume=x[0]*(y[1]*z[2]-y[2]*z[1])+x[1]*(y[2]*z[0]-y[0]*z[2])+x[2]*(y[0]*z[1]-y[1]*z[0]);if(volume<0)[t[1],t[2]]=[t[2],t[1]];}
  // Removing each shared tetrahedron face leaves an exact closed boundary mesh.
  const boundary=new Map();
  for(const tetra of tetrahedra)for(const face of [[tetra[0],tetra[2],tetra[1]],[tetra[0],tetra[1],tetra[3]],[tetra[1],tetra[2],tetra[3]],[tetra[2],tetra[0],tetra[3]]]){
    const key=face.slice().sort((a,b)=>a-b).join(':');if(boundary.has(key))boundary.delete(key);else boundary.set(key,face);
  }
  const faces=[...boundary.values()];
  // Orient by the adjacent local thickness vector, including the perimeter quads.
  for(const face of faces){const [a,b,c]=face.map(i=>positions[i]),ab=b.map((v,k)=>v-a[k]),ac=c.map((v,k)=>v-a[k]),n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const top=face.every(i=>i>=layer),bottom=face.every(i=>i<layer);if(top||bottom){const normal=normals[face[0]%layer],dot=n.reduce((sum,x,k)=>sum+x*normal[k],0);if((top&&dot<0)||(bottom&&dot>0))[face[1],face[2]]=[face[2],face[1]];}
  }
  const anchors=[];
  // 油脂处处黏壁；工具只允许近场脱黏，远处不会因长按逐点解除直到整片掉落。
  for(let node=0;node<layer;node++)anchors.push({node,normal:normals[node],strength:3.6+thickness[node]*5.2});
  const gripNode=parameters.reduce((best,p,i)=>Math.abs(p[1]-.3)<.15&&thickness[i]>thickness[best]?i:best,3*stride+4)+layer;
  return{positions:Float32Array.from(positions.flat()),indices:Uint16Array.from(faces.flat()),tetrahedra,cells,thickness:Float32Array.from([...thickness,...thickness]),anchors,gripNode,parameters,layer,region};
}
