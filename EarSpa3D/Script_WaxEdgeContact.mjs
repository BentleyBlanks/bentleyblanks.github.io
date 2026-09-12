const boundaries=new WeakMap();
const Sub=(a,b)=>a.map((v,i)=>v-b[i]);
const Dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const Cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const Unit=a=>a.map(v=>v/(Math.hypot(...a)||1));

// 抓点绑定的材料三角面随形变转动，不能继续用初始耳壁方向否决已经翘起的薄片。
export function WaxGripNormal(body,fallback){
  const s=body.surface,ids=s?.grip?.ids;
  if(!ids||ids.length!==3)return fallback.slice();
  const [a,b,c]=ids.map(i=>s.points[i]),normal=Cross(Sub(b,a),Sub(c,a));
  return Math.hypot(...normal)>1e-8?Unit(normal):fallback.slice();
}

// 从壳的外边界求局部进勺方向；内部三角边不算边缘，形变后仍读当前节点。
export function WaxEdgeContact(body,point){
  const s=body.surface;if(!s)return null;
  let edges=boundaries.get(s);
  if(!edges){
    const all=new Map();
    for(const ids of s.triangles)for(let i=0;i<3;i++){
      const a=ids[i],b=ids[(i+1)%3],opposite=ids[(i+2)%3],key=[a,b].sort((x,y)=>x-y).join(':');
      const edge=all.get(key);if(edge)edge.count++;else all.set(key,{a,b,opposite,count:1});
    }
    edges=[...all.values()].filter(e=>e.count===1);boundaries.set(s,edges);
  }
  let nearest=null;
  for(const {a,b,opposite} of edges){
    const start=s.points[a],end=s.points[b],span=Sub(end,start),length=Dot(span,span);
    if(length<1e-12)continue;
    const t=Math.max(0,Math.min(1,Dot(Sub(point,start),span)/length));
    const edgePoint=start.map((v,i)=>v+span[i]*t),delta=Sub(point,edgePoint);
    const normal=Unit(Cross(span,Sub(s.points[opposite],start))),height=Dot(delta,normal);
    const distance=Math.hypot(...delta.map((v,i)=>v-normal[i]*height));
    const thickness=s.thickness[a]*(1-t)+s.thickness[b]*t;
    if(distance>Math.max(.07,Math.min(.22,body.size*.28))||Math.abs(height)>thickness+.12)continue;
    if(!nearest||distance<nearest.distance)nearest={distance,inward:Unit(Cross(normal,span)),normal,point:edgePoint};
  }
  return nearest;
}
