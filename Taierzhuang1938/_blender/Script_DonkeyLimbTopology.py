"""Remove the microscopic clipping sliver at the fitted right axillary seam."""
import bpy,bmesh,json

def FinishAxillaryTopology(scene,skin):
    if scene.get('DonkeyAxillaryTopologyReport'):
        return json.loads(scene['DonkeyAxillaryTopologyReport'])
    bm=bmesh.new();bm.from_mesh(skin.data);before=len(bm.verts)
    def Region(p):return .08<p.x<.20 and .56<p.y<.84 and .59<p.z<.76
    selected=[v for v in bm.verts if Region(v.co)];original=[v.co.copy() for v in selected]
    distance=.00005
    bmesh.ops.remove_doubles(bm,verts=selected,dist=distance)
    retained=[v.co.copy() for v in bm.verts if Region(v.co)]
    displacement=max((min((p-q).length for q in retained) for p in original),default=0)
    merged=before-len(bm.verts)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges)
    if boundary or nonmanifold or displacement>distance+1e-8:
        bm.free();raise RuntimeError('Axillary sliver repair exceeds its surface/closure bounds')
    bm.to_mesh(skin.data);bm.free();skin.data.update()
    report={'method':'weld coincident cut-boundary vertices at the right axilla to remove a skinning sliver; original bone weights and gait retained','regionM':{'x':[.08,.20],'y':[.56,.84],'z':[.59,.76]},'weldDistanceM':distance,'mergedVertices':merged,'maximumSourceVertexDisplacementM':displacement,'boundaryEdges':boundary,'nonmanifoldEdges':nonmanifold}
    scene['DonkeyAxillaryTopologyReport']=json.dumps(report)
    return report
