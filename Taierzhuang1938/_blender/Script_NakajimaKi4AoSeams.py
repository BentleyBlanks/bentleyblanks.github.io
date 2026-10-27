"""Match AO across smooth, same-material UV1 chart boundaries.

Topology and both UV layers are read-only. Only the scalar occlusion atlas is
filtered: a common edge field is reconstructed from its two chart samples,
then padded in a narrow pixel band. Sharp normals, material boundaries,
different objects and the reserved rivet strip are not mixed.
"""
import math,pathlib
import numpy as np


def SampleAoAtlas(pixels,uvs):
    uvs=np.asarray(uvs,dtype=np.float64)
    height,width=pixels.shape[:2]
    xy=uvs*np.array([width,height])-.5
    base=np.floor(xy).astype(np.int64);fraction=xy-base
    result=np.zeros(len(uvs),dtype=np.float64)
    for dx in [0,1]:
        for dy in [0,1]:
            x=np.clip(base[:,0]+dx,0,width-1);y=np.clip(base[:,1]+dy,0,height-1)
            weight=(fraction[:,0] if dx else 1-fraction[:,0])*(fraction[:,1] if dy else 1-fraction[:,1])
            result+=pixels[y,x,0]*weight
    return result


def GatherAoSeams(meshes,uvName):
    seams=[];counts={};normalLimit=math.cos(math.radians(1))
    for obj in meshes:
        if obj.name=='Surface_FlushRivetHeads' or any(mat and 'Windscreen' in mat.name for mat in obj.data.materials):continue
        mesh=obj.data;layer=mesh.uv_layers.get(uvName)
        if not layer:continue
        edges={};normalWorld=obj.matrix_world.to_3x3().inverted().transposed()
        for poly in mesh.polygons:
            indices=list(poly.loop_indices)
            for index,nextIndex in zip(indices,indices[1:]+indices[:1]):
                va=mesh.loops[index].vertex_index;vb=mesh.loops[nextIndex].vertex_index
                if va>vb:va,vb=vb,va;index,nextIndex=nextIndex,index
                uvs=(tuple(layer.data[index].uv),tuple(layer.data[nextIndex].uv))
                normals=((normalWorld@mesh.corner_normals[index].vector).normalized(),(normalWorld@mesh.corner_normals[nextIndex].vector).normalized())
                edges.setdefault((va,vb),[]).append((uvs,normals,poly.material_index))
        count=0
        for rows in edges.values():
            if len(rows)!=2:continue
            a,b=rows
            if a[2]!=b[2] or any(x.dot(y)<normalLimit for x,y in zip(a[1],b[1])):continue
            left=np.asarray(a[0]);right=np.asarray(b[0])
            if np.max(np.abs(left-right))<1e-6:continue
            seams.append((left,right));count+=1
        if count:counts[obj.name]=count
    return seams,counts


def ProjectAoBoundarySamples(field,sampleRows,protectedRows,tolerance=1e-5,maxIterations=16000):
    """Project bilinear samples onto equal-value constraints at shared points.

    Each row contains the actual four texels/weights from each UV chart.
    Weighted simultaneous projections handle corners shared by three charts
    without assigning contradictory pairwise corner targets.
    """
    height,width=field.shape
    if not sampleRows:return {'samples':0,'iterations':0,'maxResidual':0.}
    left=np.concatenate([row[0] for row in sampleRows]);right=np.concatenate([row[1] for row in sampleRows])
    def Footprints(uvs):
        xy=uvs*np.array([width,height])-.5;base=np.floor(xy).astype(np.int64);fraction=xy-base
        indices=[];coefficients=[]
        for dx in [0,1]:
            for dy in [0,1]:
                x=np.clip(base[:,0]+dx,0,width-1);y=np.clip(base[:,1]+dy,0,height-1)
                indices.append(y*width+x);coefficients.append((fraction[:,0] if dx else 1-fraction[:,0])*(fraction[:,1] if dy else 1-fraction[:,1]))
        return np.stack(indices,axis=1),np.stack(coefficients,axis=1)
    li,lc=Footprints(left);ri,rc=Footprints(right);indices=np.concatenate([li,ri],axis=1);coefficients=np.concatenate([lc,-rc],axis=1)
    # Merge repeated texels before forming each linear equation.
    for a in range(8):
        for b in range(a):
            same=indices[:,a]==indices[:,b];coefficients[same,b]+=coefficients[same,a];coefficients[same,a]=0
    active=np.abs(coefficients)>1e-12
    assert np.all(indices[active]>=protectedRows*width), 'Boundary constraints must not write the rivet strip'
    unique,inverse=np.unique(indices,return_inverse=True);columns=inverse.reshape(indices.shape)
    values=field.reshape(-1)[unique].astype(np.float64)
    def Rows(vector):return np.sum(vector[columns]*coefficients,axis=1)
    rowScale=np.maximum(np.sum(abs(coefficients),axis=1),1e-12)
    columnScale=np.maximum(np.bincount(columns.ravel(),weights=abs(coefficients).ravel(),minlength=len(unique)),1e-12)
    # Weighted simultaneous projections preserve a stable common field at
    # multi-chart junctions. The weights normalize both sides of the sparse
    # operator; no chart receives a privileged corner value.
    for iteration in range(maxIterations):
        residual=Rows(values)
        if np.max(abs(residual))<=tolerance:break
        correction=np.bincount(columns.ravel(),weights=(coefficients*(residual/rowScale)[:,None]).ravel(),minlength=len(unique))/columnScale
        values=np.clip(values-correction,0,1)
    residual=np.sum(values[columns]*coefficients,axis=1)
    field.reshape(-1)[unique]=values
    return {'samples':len(left),'pixels':len(unique),'method':'Weighted simultaneous sparse boundary projections with range constraints','iterations':iteration+1,'residualTarget':tolerance,'maxResidual':float(np.max(abs(residual)))}


def StitchAoSeams(meshes,pixels,uvName='GeometryAO',protectedStrip=.05,corePixels=1.5,bandPixels=3.):
    height,width=pixels.shape[:2]
    factor=min(height,width)/4096;corePixels*=factor;bandPixels*=factor
    assert 0<corePixels<bandPixels and 2*bandPixels<.002*.95*min(height,width), 'Stay within the explicit fractional UV1 packing gap'
    assert np.max(np.abs(pixels[:,:,:3]-pixels[:,:,:1]))<1e-5, 'Only a scalar AO image may be stitched'
    seams,counts=GatherAoSeams(meshes,uvName)
    total=np.zeros((height,width),dtype=np.float32);weights=np.zeros_like(total);blend=np.zeros_like(total)
    scale=np.array([width,height]);firstRow=math.ceil(protectedStrip*height)
    beforeMax=0.;sampleRows=[]
    for left,right in seams:
        lengths=[float(np.linalg.norm((edge[1]-edge[0])*scale)) for edge in [left,right]]
        count=max(3,math.ceil(max(lengths)*2)+1);t=np.linspace(0,1,count)
        pairs=[edge[0]+t[:,None]*(edge[1]-edge[0]) for edge in [left,right]]
        values=[SampleAoAtlas(pixels,uv) for uv in pairs]
        beforeMax=max(beforeMax,float(np.max(np.abs(values[0]-values[1]))))
        common=(values[0]+values[1])*.5
        # Suppress independent finite-ray noise along the shared boundary,
        # using one physical edge field for both UV charts.
        if count>3:common[1:-1]=(common[:-2]+2*common[1:-1]+common[2:])*.25
        for edge in [left,right]:
            start=edge[0]*scale-.5;delta=(edge[1]-edge[0])*scale;lengthSquared=float(delta@delta)
            if lengthSquared<1e-10:continue
            stop=start+delta
            x0=max(0,math.floor(min(start[0],stop[0])-bandPixels));x1=min(width,math.ceil(max(start[0],stop[0])+bandPixels)+1)
            y0=max(firstRow,math.floor(min(start[1],stop[1])-bandPixels));y1=min(height,math.ceil(max(start[1],stop[1])+bandPixels)+1)
            if x0>=x1 or y0>=y1:continue
            yy,xx=np.mgrid[y0:y1,x0:x1]
            fraction=np.clip(((xx-start[0])*delta[0]+(yy-start[1])*delta[1])/lengthSquared,0,1)
            distance=np.hypot(xx-start[0]-fraction*delta[0],yy-start[1]-fraction*delta[1])
            weight=1-np.clip((distance-corePixels)/(bandPixels-corePixels),0,1)
            weight=weight*weight*(3-2*weight)
            target=np.interp(fraction,t,common)
            total[y0:y1,x0:x1]+=weight*target;weights[y0:y1,x0:x1]+=weight
            np.maximum(blend[y0:y1,x0:x1],weight,out=blend[y0:y1,x0:x1])
        sampleRows.append((pairs[0],pairs[1]))
    mask=weights>0
    target=total[mask]/weights[mask];result=pixels[:,:,0][mask]*(1-blend[mask])+target*blend[mask]
    field=pixels[:,:,0].copy();field[mask]=result
    projection=ProjectAoBoundarySamples(field,sampleRows,firstRow)
    quantScript=pathlib.Path(__file__).with_name('Script_NakajimaKi4AoQuantize.py');quantNamespace={'__file__':str(quantScript)}
    exec(compile(quantScript.read_text(encoding='utf8'),str(quantScript),'exec'),quantNamespace)
    quantization=quantNamespace['QuantizeAoBoundarySamples'](field,sampleRows,firstRow)
    maxChange=float(np.max(np.abs(field-pixels[:,:,0])))
    assert np.array_equal(field[:firstRow],pixels[:firstRow,:,0]), 'Never alter the per-rivet AO strip'
    for channel in range(3):pixels[:,:,channel]=field
    assert not mask[:firstRow].any(), 'Never alter the per-rivet AO strip'
    afterMax=max((float(np.max(np.abs(SampleAoAtlas(pixels,a)-SampleAoAtlas(pixels,b)))) for a,b in sampleRows),default=0.)
    return {'enabled':True,'policy':'Smooth same-material manifold edges within each object only; common AO boundary field and narrow padding. Geometry/UV0/UV1 and all other images unchanged.',
            'edgePairs':len(seams),'objects':counts,'corePixels':corePixels,'bandPixels':bandPixels,'pixelsTouched':int(mask.sum()),
            'maxAtlasChangeIncludingPadding':maxChange,'maxPairDifferenceBefore':beforeMax,'maxPairDifferenceAfter':afterMax,'boundaryProjection':projection,'quantizedBoundaryRepair':quantization,'protectedRivetRows':firstRow}
