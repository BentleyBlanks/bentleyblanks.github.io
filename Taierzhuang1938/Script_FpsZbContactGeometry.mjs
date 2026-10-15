// Test-only geometry shared by handheld and mounted Zb contact acceptance.
// THREE is supplied by the caller's existing browser import; no runtime module,
// renderer, pose or asset is changed. Refresh world matrices and skeletons first.
// weaponGroup must be the current native Zb weapon group; arms is riggedArms.
export function MeasureZbContactGeometry(THREE,{weaponGroup,arms}) {
  if(!weaponGroup||!arms?.root)throw Error("Missing current Zb weapon group or actual skinned arms");
  const Triangles=(root,filter=null)=>{
    const triangles=[],inverse=weaponGroup.matrixWorld.clone().invert();
    root.traverse(o=>{
      if(!o.isMesh||o.isSkinnedMesh||(filter&&!filter(o)))return;
      const g=o.geometry,p=g.attributes.position,index=g.index,m=inverse.clone().multiply(o.matrixWorld);
      for(let i=0;i<(index?.count||p.count);i+=3)triangles.push(new THREE.Triangle(...[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(m))));
    });return triangles;
  };
  const Nearest=(point,triangles)=>{let distance=Infinity;const closest=new THREE.Vector3();for(const tri of triangles){tri.closestPointToPoint(point,closest);distance=Math.min(distance,point.distanceTo(closest));}return distance;};
  let zbSupportCache=null;
  const ZbSkinSupport=(refreshSurfaces=false)=>{
    if(refreshSurfaces)zbSupportCache=null;
    if(!zbSupportCache){
      const triangles=Triangles(weaponGroup,o=>{
        if(!(o.name.startsWith('Zb26_')||/^Vm(Bolt|Slide)_Zb26/.test(o.name)))return false;
        for(let q=o;q&&q!==weaponGroup.parent;q=q.parent)if(!q.visible)return false;
        return true;
      }),parent=triangles.map((_,i)=>i),seen=new Map();
      const Find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
      for(let i=0;i<triangles.length;i++)for(const p of [triangles[i].a,triangles[i].b,triangles[i].c]){
        const key=p.toArray().map(v=>Math.round(v*1e6)).join(',');if(seen.has(key))parent[Find(i)]=Find(seen.get(key));else seen.set(key,i);
      }
      const groups=new Map();triangles.forEach((triangle,i)=>{const key=Find(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(triangle);});
      const components=[...groups.values()].map(tris=>({triangles:tris,box:new THREE.Box3().setFromPoints(tris.flatMap(t=>[t.a,t.b,t.c]))}));
      const expected=[[-.0195,-.000499,-.297999,.0195,.0655,.019991],[-.019,-.004999,-.244491,.019,.002999,.006499],[-.0215,.001501,-.286498,-.018499,.006499,-.011491],[.018499,.001501,-.286498,.0215,.006499,-.011491]];
      const body=expected.map(bounds=>{
        const errors=components.map(c=>Math.max(...[...c.box.min.toArray(),...c.box.max.toArray()].map((v,i)=>Math.abs(v-bounds[i])))),index=errors.indexOf(Math.min(...errors));
        if(errors[index]>.001)throw Error('Zb receiver load surface changed; review semantic contact regions');return components[index];
      });
      const bodyTriangles=body.flatMap(c=>c.triangles),bodyBox=new THREE.Box3();body.forEach(c=>bodyBox.union(c.box));const meshes=[];
      arms.root.traverse(mesh=>{
        if(!mesh.isSkinnedMesh||![].concat(mesh.material).some(m=>m.name.includes('Material_HanYangScanSkin')))return;
        const g=mesh.geometry,n=g.attributes.position.count,names=mesh.skeleton.bones.map(b=>b.name.toLowerCase().replace(/[^a-z0-9]/g,'')),owners=[],groups=[],weld=new Map();
        for(let i=0;i<n;i++){
          let weight=-1,owner=-1;for(let k=0;k<4;k++){const w=g.attributes.skinWeight.getComponent(i,k);if(w>weight){weight=w;owner=g.attributes.skinIndex.getComponent(i,k);}}
          owners.push(names[owner]);const key=[0,1,2].map(j=>Math.round(g.attributes.position.getComponent(i,j)*1e6)).join(',');if(!weld.has(key))weld.set(key,weld.size);groups.push(weld.get(key));
        }
        const left=owners.map(name=>/l(hand|finger\d[12]?)$/.test(name)),faces=[];
        for(let i=0;i<(g.index?.count||n);i+=3){const f=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k);if(f.some(j=>left[j]))faces.push(f);}
        meshes.push({mesh,n,owners,left,faces,groups,groupCount:weld.size});
      });
      if(!meshes.length)throw Error('Zb requires actual scan skin meshes');
      zbSupportCache={components,bodyTriangles,bodyBox,meshes};
    }
    const {components,bodyTriangles,bodyBox,meshes}=zbSupportCache,inverse=weaponGroup.matrixWorld.clone().invert(),rows=new Map(),closest=new THREE.Vector3();let inside=0,maxDepth=0;
    const Inside=(p,c)=>{
      if(!c.box.containsPoint(p))return false;let angle=0;
      for(const t of c.triangles){const a=t.a.clone().sub(p),b=t.b.clone().sub(p),d=t.c.clone().sub(p),la=a.length(),lb=b.length(),ld=d.length();angle+=2*Math.atan2(a.dot(b.clone().cross(d)),la*lb*ld+a.dot(b)*ld+b.dot(d)*la+d.dot(a)*lb);}
      return Math.abs(angle)>2*Math.PI;
    };
    for(const entry of meshes){
      const {mesh,n,owners,left,faces,groups,groupCount}=entry,matrix=inverse.clone().multiply(mesh.matrixWorld),points=new Array(n),normal=Array.from({length:groupCount},()=>new THREE.Vector3()),area=new Float64Array(n);
      const Point=i=>{if(!points[i])points[i]=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(matrix);return points[i];};
      for(const f of faces){const [a,b,c]=f.map(Point),cross=b.clone().sub(a).cross(c.clone().sub(a)),share=cross.length()/6;for(const i of f){normal[groups[i]].add(cross);area[i]+=share;}}
      normal.forEach(v=>v.normalize());
      for(let i=0;i<n;i++){
        if(!left[i])continue;const point=Point(i),bone=owners[i];if(!rows.has(bone))rows.set(bone,{bone,skinVertices:0,opposedVerticesUnder2mm:0,opposedAreaMm2:0,minimumContactGapMm:null});const row=rows.get(bone);row.skinVertices++;
        if(bodyBox.distanceToPoint(point)<.002){
          let distance=Infinity,targetNormal=null;for(const triangle of bodyTriangles){triangle.closestPointToPoint(point,closest);const d=point.distanceTo(closest);if(d<distance){distance=d;targetNormal=triangle.getNormal(new THREE.Vector3());}}
          if(distance<.002&&normal[groups[i]].dot(targetNormal)<-.25){row.opposedVerticesUnder2mm++;row.opposedAreaMm2+=area[i]*1e6;row.minimumContactGapMm=Math.min(row.minimumContactGapMm??Infinity,distance*1000);}
        }
        for(const component of components)if(Inside(point,component)){
          const depth=Nearest(point,component.triangles);if(depth>.00001){inside++;maxDepth=Math.max(maxDepth,depth);break;}
        }
      }
    }
    const all=[...rows.values()],Area=pattern=>all.filter(row=>pattern.test(row.bone)).reduce((sum,row)=>sum+row.opposedAreaMm2,0),Count=pattern=>all.filter(row=>pattern.test(row.bone)).reduce((sum,row)=>sum+row.opposedVerticesUnder2mm,0);
    const regions=[['palm',/lhand$/,25,4],['indexProximal',/lfinger1$/,40,4],['middleProximal',/lfinger2$/,25,4],['ringMiddleDistal',/lfinger3[12]$/,60,6],['thumbMiddleDistal',/lfinger0[12]$/,80,8]].map(([name,pattern,minimumAreaMm2,minimumVertices])=>({name,areaMm2:Area(pattern),vertices:Count(pattern),minimumAreaMm2,minimumVertices}));
    return {method:'Actual posed skin, opposed normals(dot<-.25) and finite barycentric surface area within2mm of broad receiver/bottom/side panels. Little finger and unladen distal pads may return naturally.',regions,rows:all,insideSkinVertices:inside,maximumSolidDepthMm:maxDepth*1000};
  };
  const ZbTriggerSkin=()=>{
    if(!zbSupportCache)ZbSkinSupport(true);
    const expected=[-.0023,-.045964,-.131147,.0023,-.007193,-.11785],components=zbSupportCache.components;
    const errors=components.map(c=>Math.max(...[...c.box.min.toArray(),...c.box.max.toArray()].map((v,i)=>Math.abs(v-expected[i]))));
    const component=components[errors.indexOf(Math.min(...errors))];
    if(Math.min(...errors)>.00008||component.triangles.length!==88)throw Error('Zb true trigger bounds/topology changed; Guard is not a trigger contact surface');
    const Rod=(name,start,end)=>{
      start=new THREE.Vector3(...start);end=new THREE.Vector3(...end);const axis=end.clone().sub(start),length=axis.length();axis.divideScalar(length);
      const OnSurface=p=>{const offset=p.clone().sub(start),t=offset.dot(axis),radial=offset.addScaledVector(axis,-t).length(),epsilon=.00004;
        return (Math.abs(radial-.0023)<epsilon&&t>=-epsilon&&t<=length+epsilon)||((Math.abs(t)<epsilon||Math.abs(t-length)<epsilon)&&radial<=.0023+epsilon);};
      const triangles=component.triangles.filter(t=>[t.a,t.b,t.c].every(OnSurface));
      if(triangles.length!==44)throw Error(`Zb ${name} no longer matches its authored closed12-sector trigger rod`);
      const vertices=triangles.flatMap(t=>[t.a,t.b,t.c]),box=new THREE.Box3().setFromPoints(vertices),center=box.getCenter(new THREE.Vector3());
      const planes=triangles.map(t=>{const normal=t.getNormal(new THREE.Vector3());if(normal.dot(t.getMidpoint(new THREE.Vector3()).sub(center))<0)normal.negate();return {normal,bound:Math.max(...vertices.map(v=>normal.dot(v)))+.000001};});
      return {name,triangles,box,planes};
    };
    const rods=[Rod('TriggerUpper',[0,-.008,-.120],[0,-.032,-.129]),Rod('TriggerLower',[0,-.032,-.129],[0,-.045,-.123])],triangles=rods.flatMap(r=>r.triangles);
    const inverse=weaponGroup.matrixWorld.clone().invert(),closest=new THREE.Vector3();
    const Near=p=>{let distance=Infinity,normal=null;for(const triangle of triangles){triangle.closestPointToPoint(p,closest);const d=p.distanceTo(closest);if(d<distance){distance=d;normal=triangle.getNormal(new THREE.Vector3());}}return {distance,normal};};
    const Inside=(p,rod)=>{if(!rod.box.containsPoint(p))return false;let angle=0;for(const t of rod.triangles){const a=t.a.clone().sub(p),b=t.b.clone().sub(p),c=t.c.clone().sub(p),la=a.length(),lb=b.length(),lc=c.length();angle+=2*Math.atan2(a.dot(b.clone().cross(c)),la*lb*lc+a.dot(b)*lc+b.dot(c)*la+c.dot(a)*lb);}return Math.abs(angle)>2*Math.PI;};
    // Outside their union means outside one supporting plane of EACH rod.
    // Enumerating plane pairs solves the shortest two-halfspace projection;
    // real-vertex support+1micrometre excludes internal joined-rod end caps.
    const ExitDepth=p=>{
      let best=Infinity;
      for(const a of rods[0].planes)for(const b of rods[1].planes){
        const da=a.normal.dot(p)-a.bound,db=b.normal.dot(p)-b.bound;
        if(da>=0&&db>=0)return 0;
        const qa=p.clone().addScaledVector(a.normal,Math.max(0,-da));if(b.normal.dot(qa)>=b.bound-1e-10)best=Math.min(best,p.distanceTo(qa));
        const qb=p.clone().addScaledVector(b.normal,Math.max(0,-db));if(a.normal.dot(qb)>=a.bound-1e-10)best=Math.min(best,p.distanceTo(qb));
        const dot=a.normal.dot(b.normal),det=1-dot*dot;if(det<1e-12)continue;
        const u=(-da+dot*db)/det,v=(-db+dot*da)/det;if(u<0||v<0)continue;
        const q=p.clone().addScaledVector(a.normal,u).addScaledVector(b.normal,v);
        if(a.normal.dot(q)>=a.bound-1e-10&&b.normal.dot(q)>=b.bound-1e-10)best=Math.min(best,p.distanceTo(q));
      }
      return best;
    };
    let coreVertices=0,coreTriangles=0,opposedCoreVertices=0,areaMm2=0,minGap=Infinity,insideVertices=0,maxDepth=0;
    const physicalOpposed=new Set(),sourceRows=[];
    for(const entry of zbSupportCache.meshes){
      const {mesh,n,groups}=entry,g=mesh.geometry,bone=mesh.skeleton.bones.find(b=>/r[_ ]?finger12$/i.test(b.name)),joint=mesh.skeleton.bones.indexOf(bone);
      if(!bone)continue;
      const matrix=inverse.clone().multiply(mesh.matrixWorld),boneFromWeapon=bone.matrixWorld.clone().invert().multiply(weaponGroup.matrixWorld),points=new Array(n),locals=new Array(n),normal=new Array(n),weight=new Float64Array(n),core=new Uint8Array(n),near=new Array(n);
      const normalMatrices=mesh.skeleton.bones.map((b,j)=>new THREE.Matrix3().setFromMatrix4(inverse.clone().multiply(b.matrixWorld).multiply(mesh.skeleton.boneInverses[j]).multiply(mesh.bindMatrix)));
      const Point=i=>{if(!points[i])points[i]=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(matrix);return points[i];};
      const Normal=i=>{
        if(normal[i])return normal[i];const base=new THREE.Vector3().fromBufferAttribute(g.attributes.normal,i),value=base.clone(),morphs=g.morphAttributes.normal||[];
        for(let k=0;k<morphs.length;k++){const w=mesh.morphTargetInfluences?.[k]||0;if(w){const delta=new THREE.Vector3().fromBufferAttribute(morphs[k],i);if(!g.morphTargetsRelative)delta.sub(base);value.addScaledVector(delta,w);}}
        const posed=new THREE.Vector3();for(let k=0;k<4;k++){const w=g.attributes.skinWeight.getComponent(i,k);if(w)posed.addScaledVector(value.clone().applyMatrix3(normalMatrices[g.attributes.skinIndex.getComponent(i,k)]),w);}return normal[i]=posed.normalize();
      };
      let axialEnd=-Infinity,pureCount=0;
      for(let i=0;i<n;i++){
        for(let k=0;k<4;k++)if(g.attributes.skinIndex.getComponent(i,k)===joint)weight[i]+=g.attributes.skinWeight.getComponent(i,k);
        if(weight[i]>.95){locals[i]=Point(i).clone().applyMatrix4(boneFromWeapon);axialEnd=Math.max(axialEnd,locals[i].x);pureCount++;}
      }
      if(!(axialEnd>0&&pureCount>0))throw Error('Zb distal phalanx has no actual skinned surface');
      // Anatomical core starts one third of the DIP-to-tip axial length from
      // the real DIP origin. This excludes the joint and terminal nail cap,
      // without making the region depend on a synthetic bounding-box point.
      for(let i=0;i<n;i++){
        if(weight[i]>.05){const point=Point(i);if(rods.some(rod=>Inside(point,rod))){insideVertices++;maxDepth=Math.max(maxDepth,ExitDepth(point));}}
        if(weight[i]<=.95||locals[i].x<axialEnd/3||locals[i].x>axialEnd*.9||Normal(i).clone().transformDirection(boneFromWeapon).y<=.5)continue;
        core[i]=1;coreVertices++;near[i]=Near(Point(i));minGap=Math.min(minGap,near[i].distance);
        if(near[i].distance<.002&&Normal(i).dot(near[i].normal)<-.25){opposedCoreVertices++;physicalOpposed.add(mesh.uuid+':'+groups[i]);}
      }
      let meshArea=0,meshFaces=0;
      for(let offset=0;offset<(g.index?.count||n);offset+=3){
        const ids=[0,1,2].map(k=>g.index?g.index.getX(offset+k):offset+k);if(!ids.every(i=>core[i]))continue;
        coreTriangles++;if(!ids.every(i=>near[i].distance<.002))continue;
        const [a,b,c]=ids.map(Point),cross=b.clone().sub(a).cross(c.clone().sub(a)),area=cross.length()*.5,center=a.clone().add(b).add(c).multiplyScalar(1/3),target=Near(center);
        if(cross.normalize().dot(target.normal)<-.25){areaMm2+=area*1e6;meshArea+=area*1e6;meshFaces++;}
      }
      sourceRows.push({mesh:mesh.name,pureDistalVertices:pureCount,axialCore:[axialEnd/3,axialEnd*.9],contactAreaMm2:meshArea,contactTriangles:meshFaces});
    }
    return {method:'Actual current posed distal volar core; pure DIP weight>.95, local+Y>.5, DIP-origin axial1/3..90%. Whole core triangles require all3 vertices within2mm of true Upper/Lower and opposed face normals(dot<-.25). Guard excluded by exact bounds/rod semantics. Complete distal influence>.05 receives closed-solid union audit; depth uses minimum exterior support-halfspace witness with1micrometre margin, excluding internal joined-rod caps.',
      triggerBounds:[...component.box.min.toArray(),...component.box.max.toArray()],targets:rods.map(r=>({name:r.name,triangles:r.triangles.length,bounds:[...r.box.min.toArray(),...r.box.max.toArray()]})),
      coreVertices,coreTriangles,opposedCoreVertices,opposedPhysicalCorePoints:physicalOpposed.size,opposedFiniteAreaMm2:areaMm2,minimumCoreGapMm:minGap*1000,insideDistalVertices:insideVertices,maximumSolidDepthMm:maxDepth*1000,sourceRows};
  };
  return {support:ZbSkinSupport(true),trigger:ZbTriggerSkin()};
}

/** Shared thresholds for handheld and mounted Zb test callers. */
export function ZbContactGeometryFailures(measurement,label="Zb26") {
  const failures=[],Check=(condition,message)=>{if(!condition)failures.push(message);};
  const support=measurement?.support,contact=measurement?.trigger;
  Check(!!support,`${label}: missing actual left support skin coverage`);
  Check(support?.regions?.length===5,`${label}: incomplete anatomical support region inventory`);
  for(const region of support?.regions||[])Check(region.areaMm2>=region.minimumAreaMm2&&region.vertices>=region.minimumVertices,
    `${label}: ${region.name} has ${region.areaMm2.toFixed(1)}mm²/${region.vertices} opposed skin vertices within2mm; needs ${region.minimumAreaMm2}mm²/${region.minimumVertices}`);
  Check(support?.insideSkinVertices===0,`${label}: actual left skin penetrates gun solids (${support?.insideSkinVertices} vertices, ${support?.maximumSolidDepthMm}mm)`);
  // A 2.3mm-radius curved trigger accepts a narrow but finite flesh patch.
  // A fixed marker at its Lower tip cannot represent valid Upper-pad contact.
  // Complete-distal depth prevents selecting a core that hides deep intrusion.
  Check(!!contact,`${label}: missing actual distal trigger skin coverage`);
  Check(contact?.opposedFiniteAreaMm2>=1,`${label}: distal core has only ${contact?.opposedFiniteAreaMm2}mm² of opposed true-trigger contact within2mm`);
  Check(contact?.opposedPhysicalCorePoints>=4,`${label}: fewer than4 opposed physical distal core points touch the true trigger`);
  Check(Number.isFinite(contact?.minimumCoreGapMm)&&contact.minimumCoreGapMm<=1,`${label}: closest actual distal core misses trigger by ${contact?.minimumCoreGapMm}mm`);
  Check(Number.isFinite(contact?.maximumSolidDepthMm)&&contact.maximumSolidDepthMm<=1,`${label}: complete distal skin penetrates true trigger by ${contact?.maximumSolidDepthMm}mm`);
  return failures;
}
