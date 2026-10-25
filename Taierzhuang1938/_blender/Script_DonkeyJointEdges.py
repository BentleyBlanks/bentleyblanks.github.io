"""Replay bounded local skin diagonals without moving source vertices."""
import bmesh
from mathutils import Vector


def ApplyJointEdges(skin,flips):
    bm=bmesh.new();bm.from_mesh(skin.data);maximumError=0;rotated=0
    for item in flips:
        vertices=[]
        for point in item['oldEdge']+item['newEdge']:
            target=Vector(point);vertex=min(bm.verts,key=lambda v:(v.co-target).length_squared)
            error=(vertex.co-target).length;maximumError=max(maximumError,error)
            if error>.00005:raise RuntimeError('Joint edge recipe no longer matches this source')
            vertices.append(vertex)
        a,b,c,d=vertices;wanted=set(vertices)
        faces=[f for f in bm.faces if sum(v in wanted for v in f.verts)>=3]
        bmesh.ops.triangulate(bm,faces=faces,quad_method='BEAUTY',ngon_method='BEAUTY')
        edge=next((e for e in a.link_edges if e.other_vert(a)==b),None)
        if edge is None:
            if any(e.other_vert(c)==d for e in c.link_edges):continue
            raise RuntimeError('Joint edge recipe cannot locate its source diagonal')
        if len(edge.link_faces)!=2 or any(len(f.verts)!=3 for f in edge.link_faces):
            raise RuntimeError('Joint diagonal is not a manifold triangle pair')
        bmesh.ops.rotate_edges(bm,edges=[edge],use_ccw=False)
        if not any(e.other_vert(c)==d for e in c.link_edges):raise RuntimeError('Joint diagonal rotation failed')
        rotated+=1
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    if any(not edge.is_manifold for edge in bm.edges):raise RuntimeError('Joint diagonal replay damaged the closed skin')
    bm.to_mesh(skin.data);bm.free();skin.data.update()
    return {'method':'convex local diagonal rotations with unchanged source vertices and weights','rotatedEdges':rotated,
        'maximumCoordinateMatchErrorM':maximumError,'maximumRestSurfaceBoundM':max((f['restSurfaceBoundM'] for f in flips),default=0),
        'geometryVertexDisplacementM':0,'boundaryEdges':0,'nonmanifoldEdges':0}
