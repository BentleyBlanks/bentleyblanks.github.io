// Conservative visible-receiver fitting for adaptive flare point shadows.
// Pure math: no rendering dependency, vertex sampling or visibility guess.
let pointBuffer=new Float64Array(3072),directionBuffer=new Float64Array(3072);
let pointCount=0;
const cornerX=new Float64Array(8),cornerY=new Float64Array(8),cornerZ=new Float64Array(8),cornerDistance=new Float64Array(8);
const edges=[];
for(let i=0;i<8;i++)for(const bit of [1,2,4])if(!(i&bit))edges.push(i,i|bit);

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

function GatherReceiverPoints(source,radius,boxes,nearPlane,cfg,needDirections=true){
  pointCount=0;
  const near=cfg.nearM??.25,bias=cfg.normalBiasM??.045;
  if(!(radius>near)||![source.x,source.y,source.z,radius,near,bias].every(Number.isFinite))return false;
  let nx=0,ny=0,nz=0,constant=1;
  if(nearPlane){
    nx=nearPlane.normal?.x??nearPlane[0];ny=nearPlane.normal?.y??nearPlane[1];nz=nearPlane.normal?.z??nearPlane[2];
    const nLength=Math.hypot(nx,ny,nz);
    if(!(nLength>0)||!Number.isFinite(nLength))return false;
    // Camera visibility applies to the original fragment, while shadow lookup
    // uses position+normal*bias. Keep that entire outward displacement.
    constant=(nearPlane.constant??nearPlane[3])+nx*source.x+ny*source.y+nz*source.z+bias*nLength;
    if(!Number.isFinite(constant))return false;
  }
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
    for(let i=0;i<8;i++){
      const x=i&1?hiX:loX,y=i&2?hiY:loY,z=i&4?hiZ:loZ;
      cornerX[i]=x;cornerY[i]=y;cornerZ[i]=z;
      const distance=nx*x+ny*y+nz*z+constant;cornerDistance[i]=distance;
      if(distance>=0&&!AddPoint(x,y,z,needDirections))hasApex=true;
    }
    for(let edge=0;edge<edges.length;edge+=2){
      const a=edges[edge],b=edges[edge+1],da=cornerDistance[a],db=cornerDistance[b];
      if((da<0)===(db<0))continue;
      const t=da/(da-db);
      if(!AddPoint(cornerX[a]+(cornerX[b]-cornerX[a])*t,cornerY[a]+(cornerY[b]-cornerY[a])*t,cornerZ[a]+(cornerZ[b]-cornerZ[a])*t,needDirections))hasApex=true;
    }
  }
  return !hasApex;
}

/**
 * A returned circular cone contains all biased receiver-box points that can
 * lie in the observer's near halfspace and current light cube. A circular
 * cone with half-angle <90 degrees is convex, so testing every clipped-box
 * vertex proves containment of the full clipped box, not only its corners.
 * Null requests the existing cube fallback; optimizer convergence is never a
 * correctness assumption because an exact final scan certifies the result.
 */
export function FitReceiverCone(source,radius,boxes,nearPlane,cfg={}){
  const near=cfg.nearM??.25,maxAngle=cfg.coneMaxHalfAngleRad??85*Math.PI/180;
  const coverageMargin=cfg.coneCoverageMargin??.02;
  // A circular angular pad must also provide the advertised rectangular UV
  // inset for the next-frame coverage test (worst case is around45 degrees).
  const angleGuard=Math.max(cfg.coneAngleGuardRad??.01,Math.asin(coverageMargin/(2-coverageMargin))+1e-5);
  const iterations=Math.max(1,Math.min(128,cfg.coneIterations??16));
  if(!(maxAngle>angleGuard&&maxAngle<Math.PI/2)||!Number.isFinite(maxAngle)||!Number.isFinite(angleGuard)
    ||!GatherReceiverPoints(source,radius,boxes,nearPlane,cfg)||!pointCount)return null;

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

/** Test current visible receiver points in the LAST map's world projection. */
export function ReceiverConeCovered(worldProjectionMatrixElements,currentSource,currentRadius,boxes,nearPlane,cfg={}){
  if(!GatherReceiverPoints(currentSource,currentRadius,boxes,nearPlane,cfg,false))return false;
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
