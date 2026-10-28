"""Sample fitted limb normals for offline photographic illumination removal."""
import math
import numpy as np


def MeasureLegNormals(skin,stems,masses,profiles):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from mathutils.geometry import barycentric_transform
    skin.data.calc_loop_triangles()
    points=[v.co.copy() for v in skin.data.vertices]
    normals=[v.normal.copy() for v in skin.data.vertices]
    triangles=list(skin.data.loop_triangles)
    labels=[max(stems,key=lambda s:row[s]) for row in masses]
    heights=np.linspace(0,.90,192);angles=np.linspace(-math.pi,math.pi,129)
    fields=[];records=[]
    for stem in stems:
        faces=[tuple(t.vertices) for t in triangles
               if all(labels[i]==stem and masses[i][stem]>.45 for i in t.vertices)]
        tree=BVHTree.FromPolygons(points,faces,all_triangles=True)
        rows=np.array(profiles[stem]);field=np.zeros((len(heights),len(angles),3));hits=0;tilts=[]
        for j,z in enumerate(heights):
            cx,cy,wx,wy=[np.interp(z,rows[:,0],rows[:,k]) for k in (1,2,3,4)]
            for i,theta in enumerate(angles):
                direction=Vector((math.sin(theta)*wx,math.cos(theta)*wy,0)).normalized()
                centre=Vector((cx,cy,z));hit,_,face,distance=tree.ray_cast(centre+direction*.40,-direction,.50)
                normal=Vector((math.sin(theta),math.cos(theta),0))
                if hit is not None:
                    ids=faces[face];bary=barycentric_transform(hit,*[points[k] for k in ids],Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
                    measured=sum((normals[k]*w for k,w in zip(ids,bary)),Vector()).normalized()
                    if measured.dot(direction)>.05:
                        normal=measured;hits+=1
                        if .14<z<.66:tilts.append(abs(normal.z))
                field[j,i]=normal
        # Resample in cylindrical source coordinates; this is an authoring
        # field, not an additional runtime image or a normal-map override.
        targetZ=np.linspace(.90,0,1024);targetAngle=np.mod((np.arange(384)-64)/255,1)*2*math.pi-math.pi
        horizontal=np.stack([[np.interp(targetAngle,angles,row[:,k]) for k in range(3)] for row in field]).transpose(0,2,1)
        result=np.stack([np.stack([np.interp(targetZ,heights,horizontal[:,i,k]) for k in range(3)],axis=1) for i in range(384)],axis=1)
        result/=np.maximum(1e-12,np.linalg.norm(result,axis=2))[:,:,None]
        fields.append(result)
        records.append({'limb':stem,'rayHits':hits,'samples':len(heights)*len(angles),
                        'medianAbsoluteVerticalNormal':float(np.median(tilts))})
    return fields,{'method':'same-limb BVH ray hits and barycentric fitted-surface vertex normals; smooth cylindrical resampling; circular fallback only where the limb has no surface',
                   'fieldSize':[129,192],'legs':records,'runtimeImagesAdded':0}
