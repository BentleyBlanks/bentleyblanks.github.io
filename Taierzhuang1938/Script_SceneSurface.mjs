// Optional authored surface patches. Both editor and gameplay sample the same data.
export function SceneSurfaceSampler(surface, groundAt) {
  if (!surface) return groundAt;
  const Clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const pockets = surface.pockets || [];
  const ramps=(surface.ramps||[]).map(r=>{
    const lengths=[0],segments=[];
    for(let i=1;i<r.points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(r.points[i][0]-r.points[i-1][0],r.points[i][1]-r.points[i-1][1]));
    for(let i=1;i<r.points.length;i++) {
      const a=r.points[i-1],b=r.points[i],length=lengths[i]-lengths[i-1],reach=r.width/2+1;
      if(length)segments.push({a,b,length,start:lengths[i-1],minX:Math.min(a[0],b[0])-reach,maxX:Math.max(a[0],b[0])+reach,minZ:Math.min(a[1],b[1])-reach,maxZ:Math.max(a[1],b[1])+reach});
    }
    return {...r,segments,total:lengths.at(-1)};
  });
  const Pocket = (x,z) => {
    let height=groundAt(x,z);
    for(const p of pockets) {
      const [x0,x1,z0,z1]=p.box, width=p.featherM??1.5;
      const distance=Math.hypot(x-Clamp(x,x0,x1),z-Clamp(z,z0,z1));
      if(distance>=width) continue;
      const t=Clamp(distance/width,0,1);
      height=Math.min(height,p.height+(height-p.height)*t*t*(3-2*t));
    }
    return height;
  };
  return (x,z) => {
    let height=Pocket(x,z), nearest=Infinity;
    for(const r of ramps) {
      for(const segment of r.segments) {
        if(x<segment.minX||x>segment.maxX||z<segment.minZ||z>segment.maxZ)continue;
        const {a,b,length}=segment;
        const t=Clamp(((x-a[0])*(b[0]-a[0])+(z-a[1])*(b[1]-a[1]))/(length*length),0,1);
        const distance=Math.hypot(x-a[0]-(b[0]-a[0])*t,z-a[1]-(b[1]-a[1])*t);
        if(distance>=r.width/2+1||distance>=nearest) continue;
        nearest=distance;
        const progress=(segment.start+t*length)/r.total, target=r.from+(r.to-r.from)*progress;
        const blend=Clamp(distance-r.width/2,0,1);
        height=target+(Pocket(x,z)-target)*blend*blend*(3-2*blend);
      }
    }
    return height;
  };
}
