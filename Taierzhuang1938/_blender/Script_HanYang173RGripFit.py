"""Fit actual production skin to 173R. Bone lengths, bind and skin stay fixed.
Inputs are evaluated hip/ADS snapshots from the production Viewmodel. The fit
uses exact linear skinning and Blender BVHs; final acceptance is the independent
game-side complete-arm intersection/contact test.
"""
import os,sys,json,re,math,struct,time
from pathlib import Path
sys.path.insert(0,os.environ['HANYANG_SCIPY'])
import numpy as np
from scipy.optimize import least_squares
from mathutils import Matrix,Vector,Quaternion
from mathutils.bvhtree import BVHTree

root=Path(os.environ['HANYANG_PROJECT_ROOT']);folder=root.parent/'tmp/HanYang173R'
output=Path(os.environ['HANYANG_FIT_OUTPUT']);output.mkdir(parents=True,exist_ok=True)
def M(a):return np.array(a,dtype=float).reshape(4,4).T
def Q(a):return Quaternion((a[3],*a[:3]))
def RM(q):return np.array(q.to_matrix(),dtype=float)
def Transform(p,q,s):
    m=np.eye(4);m[:3,:3]=RM(q)*np.array(s)[None,:];m[:3,3]=p;return m
def Contact(c):
    x,y,z=c['rotation'];q=Quaternion((0,1,0),y)@Quaternion((1,0,0),x)@Quaternion((0,0,1),z)
    return Transform(c['position'],q,[1,1,1])
def EulerYXZ(m):
    x=math.asin(max(-1,min(1,-m[1,2])));return [x,math.atan2(m[0,2],m[2,2]),math.atan2(m[1,0],m[1,1])]
def QA(q):return [float(q.x),float(q.y),float(q.z),float(q.w)]

blob=(root/'Model/HanYang173R/Model_HanYang173R.glb').read_bytes();length=struct.unpack_from('<I',blob,12)[0]
doc=json.loads(blob[20:20+length]);binary=blob[28+length:]
def Access(i):
    a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']]
    dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']];width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*width),np.dtype(dtype).itemsize))
surfaces={'all':[],'wood':[],'trigger':[]};partTriangles=[];triangleParts=[]
for node in doc['nodes']:
    if 'mesh' not in node:continue
    q=Q(node.get('rotation',[0,0,0,1]));m=Transform(node.get('translation',[0,0,0]),q,node.get('scale',[1,1,1]))
    for pr in doc['meshes'][node['mesh']]['primitives']:
        p=Access(pr['attributes']['POSITION']).astype(float);p=p@m[:3,:3].T+m[:3,3]
        triangles=p[Access(pr['indices']).ravel()].reshape(-1,3,3)
        triangleParts.extend([len(partTriangles)]*len(triangles));partTriangles.append(triangles)
        surfaces['all'].extend(triangles)
        if 'Wood' in node['name']:surfaces['wood'].extend(triangles)
        if node['name'].startswith('Trigger_'):surfaces['trigger'].extend(triangles)
trees={}
for key,tris in surfaces.items():
    v=np.array(tris).reshape(-1,3);trees[key]=BVHTree.FromPolygons(v.tolist(),np.arange(len(v)).reshape(-1,3).tolist())
partTrees=[]
for tris in partTriangles:
    v=np.array(tris).reshape(-1,3);partTrees.append(BVHTree.FromPolygons(v.tolist(),np.arange(len(v)).reshape(-1,3).tolist()))
rays=[Vector((1,.371,.137)).normalized(),Vector((.217,1,.439)).normalized(),Vector((.313,.127,1)).normalized()]
def Inside(p,tree):
    votes=0
    for direction in rays:
        origin=p.copy();hits=0
        for i in range(40):
            hit=tree.ray_cast(origin,direction,2)[0]
            if hit is None:break
            hits+=1;origin=hit+direction*1e-6
        votes+=hits%2
    return votes>=2
def Dist(points,key='all',signed=False):
    out=[]
    for p in points:
        hit,n,idx,d=trees[key].find_nearest(Vector(p))
        if signed and (Vector(p)-hit).dot(n)<-1e-7 and Inside(Vector(p),partTrees[triangleParts[idx]]):d=-d
        out.append(d)
    return np.array(out)

seedPath=os.environ.get('HANYANG_FIT_SEED')
seeds=json.loads(Path(seedPath).read_text()) if seedPath else {}
results=dict(seeds);started=time.time();selected=os.environ.get('HANYANG_FIT_KEYS','hip_r,hip_l,ads_l').split(',')
for state,side in [('hip','r'),('hip','l'),('ads','l')]:
    if state+'_'+side not in selected:continue
    pkg=json.loads((folder/f'Data_{state}.json').read_text());key=state+'_'+side
    invWeapon=np.linalg.inv(M(pkg['weaponMatrix']));world={n:invWeapon@M(m) for n,m in zip(pkg['boneNames'],pkg['boneMatrices'])}
    hand=next(n for n in world if re.search(side+r'hand$',re.sub('[^a-z0-9]','',n.lower())))
    chain=pkg['chain'][side];ordered=sorted(chain,key=lambda n:(int(re.search(r'finger(\d)',n,re.I)[1]),int((re.search(r'finger\d([12])?$',n,re.I)[1])or 0)))
    c0=pkg['contacts']['right' if side=='r' else 'left'];C0=Contact(c0)
    frame=np.linalg.inv(world[hand])@C0
    forward=frame[:3,2]/np.linalg.norm(frame[:3,2]);dorsal=frame[:3,1]/np.linalg.norm(frame[:3,1])
    rows=[];restCloud=[];influences=[];weights=[];posts=[];orig=[];digit=[];distal=[];palm=[];edgePairs=[]
    for mesh in pkg['skin']:
        names=mesh['bones'];rest=np.array(mesh['rest']).reshape(-1,3);idx=np.array(mesh['infl']).reshape(-1,4);wt=np.array(mesh['wts']).reshape(-1,4)
        pos=np.array(mesh['pos']).reshape(-1,3);owned=np.array([n==hand or n in chain for n in names]);frac=(owned[idx]*wt).sum(axis=1)
        hi=names.index(hand);mi=next(i for i,n in enumerate(names) if re.search(side+r'finger2$',re.sub('[^a-z0-9]','',n.lower())))
        toHand=M(mesh['inverseBinds'][hi])@M(mesh['bindMatrix'])
        bind=np.c_[rest,np.ones(len(rest))]@toHand.T
        handNormals=np.zeros((len(rest),3));triangles=np.array(mesh['idx']).reshape(-1,3)
        ns=np.cross(bind[triangles[:,1],:3]-bind[triangles[:,0],:3],bind[triangles[:,2],:3]-bind[triangles[:,0],:3])
        for c in range(3):np.add.at(handNormals,triangles[:,c],ns)
        handNormals/=np.maximum(np.linalg.norm(handNormals,axis=1)[:,None],1e-20)
        handLength=(M(mesh['inverseBinds'][hi])@np.linalg.inv(M(mesh['inverseBinds'][mi])))[:3,3]@forward
        along=bind[:,:3]@forward/handLength
        volar=((wt*(idx==hi)).sum(axis=1)>.8)&(along>.25)&(along<.98)&(handNormals@dorsal<-.35)&(frac>.9999)
        ids=np.flatnonzero(frac>.99)
        # Keep a dense deterministic skin sample, including near-surface vertices.
        affected=np.array([bool(re.search(side+r'finger'+('1' if side=='r' else '3')+r'[12]?$',re.sub('[^a-z0-9]','',names[b].lower()))) for b in idx[np.arange(len(idx)),np.argmax(wt,axis=1)]])
        ids=ids[(ids%4==0)|(Dist(pos[ids],signed=True)<.0015)|volar[ids]|affected[ids]]
        lookup={}
        for i in ids:
            owner=names[idx[i,np.argmax(wt[i])]];match=re.search(r'finger(\d)([12])?$',owner,re.I)
            if owner!=hand and not match:continue
            contributions=[]
            for b,w in zip(idx[i],wt[i]):
                local=M(mesh['inverseBinds'][b])@M(mesh['bindMatrix'])@np.r_[rest[i],1]
                contributions.append(world[names[b]]@local*w)
            lookup[i]=len(rows);rows.append(contributions);influences.append([names[b] for b in idx[i]])
            posts.append(invWeapon@M(mesh['meshMatrix'])@M(mesh['bindMatrixInverse'])@M(pkg['weaponMatrix']))
            orig.append(pos[i]);digit.append(int(match[1]) if match else -1);distal.append(bool(match and match[2]=='2' and max(wt[i])>.85));palm.append(bool(volar[i]))
        pairs=set()
        for tri in triangles:
            if not any(affected[i] for i in tri) or not all(i in lookup for i in tri):continue
            for a,b in [(0,1),(1,2),(2,0)]:pairs.add(tuple(sorted([lookup[tri[a]],lookup[tri[b]]])))
        edgePairs.extend(pairs)
    rows=np.array(rows);posts=np.array(posts);orig=np.array(orig);digit=np.array(digit);distal=np.array(distal);palm=np.array(palm)
    unique=list(dict.fromkeys(n for ns in influences for n in ns));boneIndex={n:i for i,n in enumerate(unique)};infl=np.array([[boneIndex[n] for n in ns] for ns in influences])
    base=np.einsum('nij,nj->ni',posts,rows.sum(axis=1))[:,:3]
    replay=float(np.max(np.linalg.norm(base-orig,axis=1)));assert replay<1e-5,(key,replay)
    # Original anatomical posture is the prior. Only hinge curls and MCP spread
    # change; the thumb CMC retains its existing three rotational degrees.
    specs=[];lower=[-8]*3+[-10]*3;upper=[8]*3+[10]*3
    if side=='r':lower=[-12,-12,-22,-16,-16,-16];upper=[12,12,12,16,16,16]
    for n in ordered:
        c=chain[n];d=int(re.search(r'finger(\d)',n,re.I)[1]);seg=int((re.search(r'finger\d([12])?$',n,re.I)[1])or 0)
        axes=[Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))] if d==0 and seg==0 else [Vector(c['axis'])]+([Vector(c['spreadAxis'])] if seg==0 else [])
        indices=[]
        for axis in axes:
            indices.append(len(lower));limit=50 if side=='r' and d==1 else 18
            lo,hi=-limit,limit
            if seg>0:
                delta=Q(c['rest']).inverted()@Q(c['local']);angle=math.degrees(delta.angle)*(1 if delta.axis.dot(axis)>=0 else -1)
                if angle>180:angle-=360
                lo=max(lo,-4-angle);hi=min(hi,(75 if d==0 else 105 if seg==1 else 80)-angle)
            lower.append(lo);upper.append(hi)
        specs.append((n,c,d,seg,axes,indices))
    def Eval(x,details=False):
        dq=Quaternion((1,0,0),math.radians(x[3]))@Quaternion((0,1,0),math.radians(x[4]))@Quaternion((0,0,1),math.radians(x[5]))
        delta=Transform(C0[:3,3]+x[:3]/1000,dq,[1,1,1]);shift=np.eye(4);shift[:3,3]=-C0[:3,3];delta=delta@shift
        changed={hand:delta};current={};qs={}
        for n,c,d,seg,axes,indices in specs:
            q=Q(c['local'])
            for axis,i in zip(axes,indices):q=q@Quaternion(axis,math.radians(x[i]))
            parent=delta@M(c['parentWorld']) if seg==0 else current[(d,seg-1)]
            w=parent@Transform(c['position'],q,c['scale']);current[(d,seg)]=w;changed[n]=w@np.linalg.inv(M(c['world']));qs[str(d)+(str(seg)if seg else '')]=QA(q)
        matrices=np.array([changed.get(n,np.eye(4)) for n in unique])
        pts=np.einsum('nkij,nkj->nki',matrices[infl],rows).sum(axis=1);pts=np.einsum('nij,nj->ni',posts,pts)[:,:3]
        gap=Dist(pts,signed=True)*1000
        edgeGap=Dist((pts[np.array(edgePairs)[:,0]]+pts[np.array(edgePairs)[:,1]])*.5,signed=True)*1000 if edgePairs else np.array([])
        residual=[float(os.environ.get('HANYANG_CLEAR_WEIGHT','5'))*np.maximum(0,float(os.environ.get('HANYANG_CLEAR_MM','.65'))-np.r_[gap,edgeGap])]
        contacts=[]
        for d in range(5):
            target='trigger' if side=='r' and d==1 else 'wood'
            ds=Dist(pts[(digit==d)&distal],target)*1000
            near=np.sort(ds)[:8];contacts.append(float(near[0]));residual.append(8*np.maximum(0,near-1.35))
        palmGap=np.sort(Dist(pts[palm],'wood')*1000)[:60]
        if side=='r':residual.append(6*np.maximum(0,palmGap-2.0))
        residual.extend([x[:3]*.08,x[3:6]*.025,x[6:]*.008])
        if details:return {'minimumClearanceMm':float(np.r_[gap,edgeGap].min()),'padGapsMm':contacts,'palmClosestMeanMm':float(palmGap.mean()),'fingerRotations':qs,'delta':delta.tolist(),'x':x.tolist()}
        return np.concatenate(residual)
    x=np.array(seeds.get(key,{}).get('x',np.zeros(len(lower))));initial=Eval(x,True);print(key,'initial',json.dumps({k:v for k,v in initial.items() if k in ['minimumClearanceMm','padGapsMm','palmClosestMeanMm']}),flush=True)
    def Jacobian(x):
        base=Eval(x);columns=[]
        for i in range(len(x)):
            h=.015 if i<3 else .08
            if x[i]+h>upper[i]:h=-h
            trial=x.copy();trial[i]+=h
            columns.append((Eval(trial)-base)/h)
        return np.array(columns).T
    fit=least_squares(Eval,x,jac=Jacobian,bounds=(lower,upper),max_nfev=100,ftol=1e-5,xtol=1e-5,gtol=1e-5,x_scale='jac')
    result=Eval(fit.x,True);C=np.array(result['delta'])@C0
    result.update({'position':C[:3,3].tolist(),'rotation':EulerYXZ(C[:3,:3]),'cost':fit.cost,'evaluations':fit.nfev,'replayErrorM':replay,'sampleCount':len(rows)})
    results[key]=result;(output/'Data_GripFit.json').write_text(json.dumps(results,indent=2))
    print(key,'result',json.dumps({k:v for k,v in result.items() if k in ['position','rotation','cost','evaluations','minimumClearanceMm','padGapsMm','palmClosestMeanMm']}),flush=True)
print('seconds',time.time()-started)
