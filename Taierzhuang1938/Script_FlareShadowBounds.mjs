// Conservative visible-receiver fitting for adaptive flare point shadows.
// Pure math: no rendering dependency, vertex sampling or visibility guess.
let pointBuffer=new Float64Array(3072),directionBuffer=new Float64Array(3072);
let pointCount=0;
const cornerX=new Float64Array(8),cornerY=new Float64Array(8),cornerZ=new Float64Array(8);
const BoxFaces=[[0,2,6,4],[1,5,7,3],[0,4,5,1],[2,3,7,6],[0,1,3,2],[4,6,7,5]];
// A box clipped by observer and fixed shadow frusta has at most eighteen faces. Retaining
// coincident cap vertices rather than merging nearby points also preserves
// arbitrarily thin / planar receiver bounds. Buffers include room for those
// duplicates and are shared, just like the final point/direction buffers.
const MaxObserverPlanes=6,MaxPlanes=12,MaxFaces=6+MaxPlanes,FaceStride=72*3;
const polyA=new Float64Array(MaxFaces*FaceStride),polyB=new Float64Array(MaxFaces*FaceStride);
const countsA=new Uint8Array(MaxFaces),countsB=new Uint8Array(MaxFaces);
const capPoints=new Float64Array(MaxFaces*2*3),capAngles=new Float64Array(MaxFaces*2);
const planeBuffer=new Float64Array(MaxPlanes*4),activePlanes=new Uint8Array(MaxPlanes);

function ReadReceiverPlanes(source,observer,bias,shadowPlanes){
  const planes=!observer?[]:observer.planes??(Array.isArray(observer)&&typeof observer[0]!=='number'?observer:[observer]);
  if(observer&&!planes.length||planes.length>MaxObserverPlanes)return -1;
  for(let i=0;i<planes.length;i++){
    const plane=planes[i],nx=plane.normal?.x??plane[0],ny=plane.normal?.y??plane[1],nz=plane.normal?.z??plane[2];
    const length=Math.hypot(nx,ny,nz),constant=plane.constant??plane[3];
    if(!(length>0)||![length,constant].every(Number.isFinite))return -1;
    const at=i*4;planeBuffer[at]=nx/length;planeBuffer[at+1]=ny/length;planeBuffer[at+2]=nz/length;
    // Camera visibility applies to the original fragment, while lookup uses
    // position+normal*bias. Expand every halfspace by the full displacement.
    planeBuffer[at+3]=(constant+nx*source.x+ny*source.y+nz*source.z)/length+bias;
    if(!Number.isFinite(planeBuffer[at+3]))return -1;
  }
  // The optional fixed shadow halfspaces already use source-relative lookup
  // coordinates, so camera normal-bias expansion must NOT be applied twice.
  for(let i=0;i<(shadowPlanes?.length??0);i++){
    const plane=shadowPlanes[i],length=Math.hypot(plane[0],plane[1],plane[2]),at=(planes.length+i)*4;
    if(at>=planeBuffer.length||!(length>0)||![...plane,length].every(Number.isFinite))return -1;
    for(let j=0;j<4;j++)planeBuffer[at+j]=plane[j]/length;
  }
  return planes.length+(shadowPlanes?.length??0);
}

function ClipBoxPoints(activeCount,needDirections){
  let input=polyA,output=polyB,inputCounts=countsA,outputCounts=countsB,faceCount=6;
  for(let face=0;face<6;face++){
    inputCounts[face]=4;
    for(let vertex=0;vertex<4;vertex++){
      const corner=BoxFaces[face][vertex],at=face*FaceStride+vertex*3;
      input[at]=cornerX[corner];input[at+1]=cornerY[corner];input[at+2]=cornerZ[corner];
    }
  }
  for(let plane=0;plane<activeCount;plane++){
    const p=activePlanes[plane]*4,nx=planeBuffer[p],ny=planeBuffer[p+1],nz=planeBuffer[p+2],constant=planeBuffer[p+3];
    let nextFaceCount=0,capCount=0;
    for(let face=0;face<faceCount;face++){
      const count=inputCounts[face],base=face*FaceStride,outBase=nextFaceCount*FaceStride;let outCount=0;
      for(let vertex=0;vertex<count;vertex++){
        const a=base+vertex*3,b=base+(vertex+1)%count*3;
        const ax=input[a],ay=input[a+1],az=input[a+2],bx=input[b],by=input[b+1],bz=input[b+2];
        const da=nx*ax+ny*ay+nz*az+constant,db=nx*bx+ny*by+nz*bz+constant;
        if(da>=0){if(outCount*3>=FaceStride)return false;const out=outBase+outCount++*3;output[out]=ax;output[out+1]=ay;output[out+2]=az;}
        if((da<0)===(db<0))continue;
        const t=da/(da-db),x=ax+(bx-ax)*t,y=ay+(by-ay)*t,z=az+(bz-az)*t;
        if(outCount*3>=FaceStride)return false;
        const out=outBase+outCount++*3;output[out]=x;output[out+1]=y;output[out+2]=z;
        // An edge is visited in both adjacent faces. Only merge EXACT copies;
        // a tolerance here could erase a thin but visible receiver sliver.
        let duplicate=false;
        for(let i=0;i<capCount*3;i+=3)if(capPoints[i]===x&&capPoints[i+1]===y&&capPoints[i+2]===z){duplicate=true;break;}
        if(!duplicate){if(capCount*3>=capPoints.length)return false;const at=capCount++*3;capPoints[at]=x;capPoints[at+1]=y;capPoints[at+2]=z;}
      }
      if(outCount){outputCounts[nextFaceCount++]=outCount;}
    }
    if(!nextFaceCount)return true;
    if(capCount){
      // Sort the new cut face in its own plane. This cap is essential: later
      // planes may create vertices on its edges with no original box edge.
      let centerX=0,centerY=0,centerZ=0;
      for(let i=0;i<capCount*3;i+=3){centerX+=capPoints[i];centerY+=capPoints[i+1];centerZ+=capPoints[i+2];}
      centerX/=capCount;centerY/=capCount;centerZ/=capCount;
      let rx,ry,rz;if(Math.abs(nx)<.9){rx=0;ry=nz;rz=-ny;}else{rx=-nz;ry=0;rz=nx;}
      const rLength=Math.hypot(rx,ry,rz);rx/=rLength;ry/=rLength;rz/=rLength;
      const ux=ny*rz-nz*ry,uy=nz*rx-nx*rz,uz=nx*ry-ny*rx;
      for(let i=0;i<capCount;i++){
        const at=i*3,x=capPoints[at]-centerX,y=capPoints[at+1]-centerY,z=capPoints[at+2]-centerZ;
        const angle=Math.atan2(ux*x+uy*y+uz*z,rx*x+ry*y+rz*z);let j=i;
        const px=capPoints[at],py=capPoints[at+1],pz=capPoints[at+2];
        while(j>0&&capAngles[j-1]>angle){capAngles[j]=capAngles[j-1];capPoints[j*3]=capPoints[(j-1)*3];capPoints[j*3+1]=capPoints[(j-1)*3+1];capPoints[j*3+2]=capPoints[(j-1)*3+2];j--;}
        capAngles[j]=angle;capPoints[j*3]=px;capPoints[j*3+1]=py;capPoints[j*3+2]=pz;
      }
      if(nextFaceCount>=MaxFaces||capCount*3>FaceStride)return false;
      output.set(capPoints.subarray(0,capCount*3),nextFaceCount*FaceStride);outputCounts[nextFaceCount++]=capCount;
    }
    [input,output]=[output,input];[inputCounts,outputCounts]=[outputCounts,inputCounts];faceCount=nextFaceCount;
  }
  let hasApex=false;
  for(let face=0;face<faceCount;face++)for(let vertex=0;vertex<inputCounts[face];vertex++){
    const at=face*FaceStride+vertex*3;
    if(!AddPoint(input[at],input[at+1],input[at+2],needDirections))hasApex=true;
  }
  return !hasApex;
}

function AddPoint(x,y,z,needDirections){
  const lengthSquared=x*x+y*y+z*z;
  // The apex lies inside every cone. A nonzero near point still constrains
  // axial depth; dropping it would invalidate convex-box containment.
  if(lengthSquared<1e-24)return false;
  const at=pointCount*3;
  if(at+3>pointBuffer.length){
    const nextPoints=new Float64Array(pointBuffer.length*2),nextDirections=new Float64Array(directionBuffer.length*2);
    nextPoints.set(pointBuffer);nextDirections.set(directionBuffer);pointBuffer=nextPoints;directionBuffer=nextDirections;
  }
  pointBuffer[at]=x;pointBuffer[at+1]=y;pointBuffer[at+2]=z;
  if(needDirections){const length=Math.sqrt(lengthSquared);directionBuffer[at]=x/length;directionBuffer[at+1]=y/length;directionBuffer[at+2]=z/length;}
  pointCount++;return true;
}

function GatherReceiverPoints(source,radius,boxes,observer,cfg,needDirections=true,shadowPlanes=null){
  pointCount=0;
  const near=cfg.nearM??.25,bias=cfg.normalBiasM??.045;
  if(!(radius>near)||![source.x,source.y,source.z,radius,near,bias].every(Number.isFinite))return false;
  const planeCount=ReadReceiverPlanes(source,observer,bias,shadowPlanes);if(planeCount<0)return false;
  let hasApex=false;
  for(const box of boxes){
    const loX=Math.max(box.min.x-source.x-bias,-radius),hiX=Math.min(box.max.x-source.x+bias,radius);
    const loY=Math.max(box.min.y-source.y-bias,-radius),hiY=Math.min(box.max.y-source.y+bias,radius);
    const loZ=Math.max(box.min.z-source.z-bias,-radius),hiZ=Math.min(box.max.z-source.z+bias,radius);
    if(!Number.isFinite(loX)||!Number.isFinite(loY)||!Number.isFinite(loZ)||!Number.isFinite(hiX)||!Number.isFinite(hiY)||!Number.isFinite(hiZ))return false;
    if(loX>hiX||loY>hiY||loZ>hiZ)continue;
    // Native cube maps also cannot shadow a point whose dominant component is
    // inside nearM. Skip only an entire box in that excluded cube.
    if(Math.max(Math.abs(loX),Math.abs(hiX),Math.abs(loY),Math.abs(hiY),Math.abs(loZ),Math.abs(hiZ))<=near)continue;
    let activeCount=0,outside=false;
    for(let plane=0;plane<planeCount;plane++){
      const at=plane*4,nx=planeBuffer[at],ny=planeBuffer[at+1],nz=planeBuffer[at+2],constant=planeBuffer[at+3];
      const max=nx*(nx>=0?hiX:loX)+ny*(ny>=0?hiY:loY)+nz*(nz>=0?hiZ:loZ)+constant;
      if(max<0){outside=true;break;}
      const min=nx*(nx>=0?loX:hiX)+ny*(ny>=0?loY:hiY)+nz*(nz>=0?loZ:hiZ)+constant;
      if(min<0)activePlanes[activeCount++]=plane;
    }
    if(outside)continue;
    for(let i=0;i<8;i++){
      const x=i&1?hiX:loX,y=i&2?hiY:loY,z=i&4?hiZ:loZ;
      cornerX[i]=x;cornerY[i]=y;cornerZ[i]=z;
      if(!activeCount&&!AddPoint(x,y,z,needDirections))hasApex=true;
    }
    if(activeCount&&!ClipBoxPoints(activeCount,needDirections))hasApex=true;
  }
  return !hasApex;
}

/**
 * A returned circular cone contains all biased receiver-box points that can
 * lie in the observer's full frustum and current light cube. observer accepts
 * a THREE.Frustum, an array of inward-facing planes, or one legacy near plane.
 * Sequential convex clipping retains every new cut face and edge. A circular
 * cone with half-angle <90 degrees is convex, so testing every clipped-box
 * vertex proves containment of the full clipped box, not only its corners.
 * Null requests the existing cube fallback; optimizer convergence is never a
 * correctness assumption because an exact final scan certifies the result.
 */
export function FitReceiverCone(source,radius,boxes,observer,cfg={}){
  const near=cfg.nearM??.25,maxAngle=cfg.coneMaxHalfAngleRad??85*Math.PI/180;
  const coverageMargin=cfg.coneCoverageMargin??.02;
  // A circular angular pad must also provide the advertised rectangular UV
  // inset for the next-frame coverage test (worst case is around45 degrees).
  const angleGuard=Math.max(cfg.coneAngleGuardRad??.01,Math.asin(coverageMargin/(2-coverageMargin))+1e-5);
  const iterations=Math.max(1,Math.min(128,cfg.coneIterations??16));
  if(!(maxAngle>angleGuard&&maxAngle<Math.PI/2)||!Number.isFinite(maxAngle)||!Number.isFinite(angleGuard)
    ||!GatherReceiverPoints(source,radius,boxes,observer,cfg)||!pointCount)return null;

  // The closest point of the convex hull of unit directions identifies the
  // minimax cone axis. Gilbert/Frank-Wolfe uses only fixed-count linear scans
  // and an exact segment step. Keep the best explicitly certified iterate.
  const used=pointCount*3,minimumCos=Math.cos(maxAngle-angleGuard);
  let qx=0,qy=0,qz=0;
  for(let i=0;i<used;i+=3){qx+=directionBuffer[i];qy+=directionBuffer[i+1];qz+=directionBuffer[i+2];}
  qx/=pointCount;qy/=pointCount;qz/=pointCount;
  let bestCos=-Infinity,bestX=0,bestY=0,bestZ=0;
  for(let iteration=0;iteration<=iterations;iteration++){
    const length2=qx*qx+qy*qy+qz*qz,length=Math.sqrt(length2);
    // q is always in the convex hull, so its norm is an upper bound on the
    // optimal cap cosine. This rejection cannot discard a feasible cap.
    if(!(length>=minimumCos))return null;
    let worst=Infinity,worstAt=0;
    for(let i=0;i<used;i+=3){const dot=qx*directionBuffer[i]+qy*directionBuffer[i+1]+qz*directionBuffer[i+2];if(dot<worst){worst=dot;worstAt=i;}}
    const cosine=worst/length;
    if(cosine>bestCos){bestCos=cosine;bestX=qx/length;bestY=qy/length;bestZ=qz/length;}
    // A safe certificate is sufficient; minimizing the cap to convergence
    // would rescan tens of thousands of points without improving coverage.
    if(cosine>=minimumCos)break;
    const px=directionBuffer[worstAt],py=directionBuffer[worstAt+1],pz=directionBuffer[worstAt+2];
    const dx=px-qx,dy=py-qy,dz=pz-qz,denominator=dx*dx+dy*dy+dz*dz;
    if(denominator<1e-20)break;
    const step=Math.max(0,Math.min(1,(length2-worst)/denominator));
    if(step<1e-14)break;
    qx+=step*dx;qy+=step*dy;qz+=step*dz;
  }
  if(bestCos<minimumCos)return null;
  const preferredUp=Math.abs(bestY)>.9?[0,0,1]:[0,1,0];
  let rightX=bestY*preferredUp[2]-bestZ*preferredUp[1],rightY=bestZ*preferredUp[0]-bestX*preferredUp[2],rightZ=bestX*preferredUp[1]-bestY*preferredUp[0];
  const rightLength=Math.hypot(rightX,rightY,rightZ);rightX/=rightLength;rightY/=rightLength;rightZ/=rightLength;
  const upX=rightY*bestZ-rightZ*bestY,upY=rightZ*bestX-rightX*bestZ,upZ=rightX*bestY-rightY*bestX;
  let minDot=Infinity,minDepth=Infinity,maxDepth=-Infinity,minHorizontal=Infinity,maxHorizontal=-Infinity,minVertical=Infinity,maxVertical=-Infinity;
  for(let i=0;i<used;i+=3){
    minDot=Math.min(minDot,bestX*directionBuffer[i]+bestY*directionBuffer[i+1]+bestZ*directionBuffer[i+2]);
    const depth=bestX*pointBuffer[i]+bestY*pointBuffer[i+1]+bestZ*pointBuffer[i+2];minDepth=Math.min(minDepth,depth);maxDepth=Math.max(maxDepth,depth);
    if(depth>0){
      const horizontal=(rightX*pointBuffer[i]+rightY*pointBuffer[i+1]+rightZ*pointBuffer[i+2])/depth,vertical=(upX*pointBuffer[i]+upY*pointBuffer[i+1]+upZ*pointBuffer[i+2])/depth;
      minHorizontal=Math.min(minHorizontal,horizontal);maxHorizontal=Math.max(maxHorizontal,horizontal);minVertical=Math.min(minVertical,vertical);maxVertical=Math.max(maxVertical,vertical);
    }
  }
  const angle=Math.acos(Math.max(-1,Math.min(1,minDot)))+angleGuard;
  if(!(angle<=maxAngle)||minDepth<near||maxDepth<near)return null;
  // Cube-clipped corners may project beyond radius along a tilted cone even
  // though actual illumination is spherical. Keep them in this conservative
  // shadow projection; this does not change the photometric light range.
  const tangent=Math.tan(angle),centerU=(minHorizontal+maxHorizontal)/(2*tangent),centerV=(minVertical+maxVertical)/(2*tangent);
  const halfU=Math.max(1e-5,(maxHorizontal-minHorizontal)/(2*tangent))/(1-coverageMargin-1e-6),halfV=Math.max(1e-5,(maxVertical-minVertical)/(2*tangent))/(1-coverageMargin-1e-6);
  return {direction:[bestX,bestY,bestZ],angle,minU:centerU-halfU,maxU:centerU+halfU,minV:centerV-halfV,maxV:centerV+halfV,
    far:maxDepth+(cfg.depthGuardM??2),pointCount,minDot,minDepth};
}

/**
 * Crop an existing shadow pyramid to the exact observer-visible receivers
 * inside it. Its six shadow planes clip LOOKUP positions without camera-bias
 * expansion. Null means the near map has no visible receivers; the complete
 * far map remains responsible for points outside this auxiliary projection.
 * projectionFarM keeps the caller's original fixed pyramid depth contract.
 */
export function FitReceiverProjection(source,radius,boxes,observer,direction,angle,cfg={}){
  const length=Math.hypot(...direction),near=cfg.nearM??.25,far=cfg.projectionFarM??radius,margin=cfg.coneCoverageMargin??.02;
  if(!(length>0&&angle>0&&angle<Math.PI/2&&far>near&&margin>=0&&margin<1)||![length,angle,far].every(Number.isFinite))return null;
  const axis=direction.map(x=>x/length),[dx,dy,dz]=axis,preferredUp=Math.abs(dy)>.9?[0,0,1]:[0,1,0];
  let rx=dy*preferredUp[2]-dz*preferredUp[1],ry=dz*preferredUp[0]-dx*preferredUp[2],rz=dx*preferredUp[1]-dy*preferredUp[0];
  const rLength=Math.hypot(rx,ry,rz);rx/=rLength;ry/=rLength;rz/=rLength;
  const ux=ry*dz-rz*dy,uy=rz*dx-rx*dz,uz=rx*dy-ry*dx,tangent=Math.tan(angle);
  const planes=[[dx,dy,dz,-near],[-dx,-dy,-dz,far],
    [dx*tangent+rx,dy*tangent+ry,dz*tangent+rz,0],[dx*tangent-rx,dy*tangent-ry,dz*tangent-rz,0],
    [dx*tangent+ux,dy*tangent+uy,dz*tangent+uz,0],[dx*tangent-ux,dy*tangent-uy,dz*tangent-uz,0]];
  if(!GatherReceiverPoints(source,radius,boxes,observer,cfg,false,planes)||!pointCount)return null;
  let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity,minDepth=Infinity,maxDepth=-Infinity;
  for(let i=0;i<pointCount*3;i+=3){
    const x=pointBuffer[i],y=pointBuffer[i+1],z=pointBuffer[i+2],depth=dx*x+dy*y+dz*z;
    if(!(depth>0))return null;
    const u=(rx*x+ry*y+rz*z)/(depth*tangent),v=(ux*x+uy*y+uz*z)/(depth*tangent);
    minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v);minDepth=Math.min(minDepth,depth);maxDepth=Math.max(maxDepth,depth);
  }
  const centerU=(minU+maxU)/2,centerV=(minV+maxV)/2;
  // Keep the same PCF / next-frame inset as the far crop. Cropping gives finer
  // angular texel density and leaves a border around every visible receiver.
  const halfU=Math.max(1e-5,(maxU-minU)/2)/(1-margin-1e-6),halfV=Math.max(1e-5,(maxV-minV)/2)/(1-margin-1e-6);
  return {direction:axis,angle,minU:centerU-halfU,maxU:centerU+halfU,minV:centerV-halfV,maxV:centerV+halfV,
    far:Math.min(far,Math.max(near*2,maxDepth+(cfg.depthGuardM??2))),pointCount,minDepth};
}

/** Test current visible receiver points in the LAST map's world projection. */
export function ReceiverConeCovered(worldProjectionMatrixElements,currentSource,currentRadius,boxes,observer,cfg={}){
  if(!GatherReceiverPoints(currentSource,currentRadius,boxes,observer,cfg,false))return false;
  const e=worldProjectionMatrixElements?.elements??worldProjectionMatrixElements;
  if(!e||e.length!==16)return false;
  // Fit reserves2%; checking keeps about two far1024 pixels inside the map.
  // Consuming the entire fit reserve here would refit on every tiny movement.
  const limit=1-(cfg.coneCheckMargin??.004),depthLimit=1-(cfg.coneDepthCoverageMargin??1e-6);
  for(let i=0;i<pointCount*3;i+=3){
    const x=pointBuffer[i]+currentSource.x,y=pointBuffer[i+1]+currentSource.y,z=pointBuffer[i+2]+currentSource.z;
    const px=e[0]*x+e[4]*y+e[8]*z+e[12],py=e[1]*x+e[5]*y+e[9]*z+e[13];
    const pz=e[2]*x+e[6]*y+e[10]*z+e[14],pw=e[3]*x+e[7]*y+e[11]*z+e[15];
    if(!(pw>0)||Math.abs(px)>limit*pw||Math.abs(py)>limit*pw||Math.abs(pz)>depthLimit*pw)return false;
  }
  return true;
}
