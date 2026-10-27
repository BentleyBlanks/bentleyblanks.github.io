"""Smooth original boundary skinning over the newly fitted upper forearm."""
import json
from pathlib import Path
import numpy as np

def Smooth(a,b,v):
    t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)

def BindingBlend(p,mass):
    return Smooth(.575,.610,p[2])*(1-Smooth(.650,.690,p[2]))*Smooth(.59,.65,p[1])*(1-Smooth(.77,.82,p[1]))*Smooth(.05,.075,abs(p[0]))*(1-Smooth(.145,.180,abs(p[0])))*Smooth(.70,.90,mass)

def BindForearmDepth(scene,skin):
    import bmesh
    if scene.get('DonkeyForearmBindingReport'):return json.loads(scene['DonkeyForearmBindingReport'])
    if not scene.get('DonkeyForearmDepthReport'):raise RuntimeError('Forearm binding requires the new depth fit')
    mesh=skin.data;points=np.array([v.co for v in mesh.vertices]);weights=np.zeros((len(points),len(skin.vertex_groups)))
    for vertex in mesh.vertices:
        for group in vertex.groups:weights[vertex.index,group.group]=group.weight
    names=[g.name for g in skin.vertex_groups];fore=np.array([sum(weights[i,j] for j,n in enumerate(names) if n.startswith('DonkeyFront')) for i in range(len(points))]);selected=(points[:,2]>.575)&(points[:,2]<.690)&(points[:,1]>.59)&(points[:,1]<.82)&(abs(points[:,0])>.05)&(abs(points[:,0])<.18)&(fore>.70)&(weights.max(axis=1)<.98);ids=np.flatnonzero(selected);lookup={int(v):i for i,v in enumerate(ids)};adjacency=[set() for p in points]
    bm=bmesh.new();bm.from_mesh(mesh);index=bm.verts.layers.int.new('ForearmSourceIndex')
    for i,v in enumerate(bm.verts):v[index]=i
    bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
    for edge in bm.edges:
        a,b=[v[index] for v in edge.verts];adjacency[a].add(b);adjacency[b].add(a)
    bm.free();matrix=np.zeros((len(ids),len(ids)));rhs=np.zeros((len(ids),weights.shape[1]))
    for vertex in ids:
        row=lookup[int(vertex)]
        for neighbour in adjacency[vertex]:
            weight=1/max(.0001,float(np.linalg.norm(points[vertex]-points[neighbour])));matrix[row,row]+=weight
            if neighbour in lookup:matrix[row,lookup[neighbour]]-=weight
            else:rhs[row]+=weight*weights[neighbour]
    solution=np.linalg.solve(matrix,rhs)
    if not np.isfinite(solution).all():raise RuntimeError('Non-finite forearm harmonic solution')
    changes=[];maximum=0
    for vertex in ids:
        amount=BindingBlend(points[vertex],fore[vertex]);values=np.maximum(0,solution[lookup[int(vertex)]]);values=weights[vertex]*(1-amount)+values*amount;top=np.argsort(values)[-4:];target=np.zeros(weights.shape[1]);target[top]=values[top]/values[top].sum();delta=float(np.max(abs(target-weights[vertex])))
        if delta<1e-8:continue
        for group in list(mesh.vertices[int(vertex)].groups):skin.vertex_groups[group.group].remove([int(vertex)])
        for group in top:
            if target[group]>1e-8:skin.vertex_groups[int(group)].add([int(vertex)],float(target[group]),'REPLACE')
        actual={skin.vertex_groups[g.group].name:g.weight for g in mesh.vertices[int(vertex)].groups};changes.append({'point':points[vertex].tolist(),'weights':actual});maximum=max(maximum,delta)
    report={'version':'20261027ForearmBindingV50','method':'positive inverse-edge-length harmonic interpolation of original boundary weights; rigid anchors and outer binding retained; compact C1 spatial blend avoids a new boundary crease; strongest four normalized influences',
        'selectedVertices':int(len(ids)),'verticesChanged':len(changes),'maximumWeightChange':maximum,'maximumInfluences':max(len(v.groups) for v in mesh.vertices),'geometryDisplacementM':0,'bonesChanged':0,'animationChannelsChanged':0,'maximumProtectedBindingChange':0,'sourceHeightBoundsM':[.575,.690],'sourceYBoundsM':[.59,.82],'sourceAbsXBoundsM':[.05,.18]}
    path=Path(scene['DonkeySourceRoot'])/'Review/Data_ForearmBinding.json';path.write_text(json.dumps({**report,'rows':changes},indent=2)+'\n',encoding='utf-8');report['authoringWeights']=str(path);scene['DonkeyForearmBindingReport']=json.dumps(report);return report
