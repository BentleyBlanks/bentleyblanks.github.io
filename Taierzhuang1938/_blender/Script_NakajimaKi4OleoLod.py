"""Gray V29 derivatives, retaining printed eye datums and every rivet head."""
import bpy,bmesh,pathlib,os,json,hashlib,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']);asset=pathlib.Path(os.environ['KI4_ASSET_ROOT'])
record=json.loads((asset/'Evidence/Data_OleoSourceUpdate.json').read_text());author=source/'Scene_NakajimaKi4.blend'
assert hashlib.sha256(author.read_bytes()).hexdigest()==record['sourceSha256']
root=bpy.data.objects['NakajimaKi4'];assert root['version']==os.environ.get('KI4_CANDIDATE_VERSION','20261026ReferenceV29')

def Tree(mesh):return BVHTree.FromPolygons([v.co for v in mesh.vertices],[list(p.vertices) for p in mesh.polygons])
def Samples(mesh):
    result=[v.co.copy() for v in mesh.vertices]
    for polygon in mesh.polygons:result.append(sum((mesh.vertices[i].co for i in polygon.vertices),Vector())/len(polygon.vertices))
    return result
def Topology(mesh):
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=3e-6)
    opened=sum(not e.is_manifold for e in bm.edges);chi=len(bm.verts)-len(bm.edges)+len(bm.faces);todo=set(bm.verts);components=0
    while todo:
        components+=1;stack=[todo.pop()]
        while stack:
            vertex=stack.pop()
            for edge in vertex.link_edges:
                other=edge.other_vert(vertex)
                if other in todo:todo.remove(other);stack.append(other)
    bm.free();return opened,chi,components
def NormalField(original,mesh):
    original.calc_loop_triangles();triangles=list(original.loop_triangles)
    tree=BVHTree.FromPolygons([v.co for v in original.vertices],[list(t.vertices) for t in triangles],all_triangles=True)
    faceNormals={loop:polygon.normal.copy() for polygon in mesh.polygons for loop in polygon.loop_indices};normals=[]
    for loop in mesh.loops:
        p=mesh.vertices[loop.vertex_index].co;hit,normal,index,distance=tree.find_nearest(p)
        # At a cap/wall boundary, position alone cannot choose the correct
        # corner-normal field. Keep the target face on the matching crease side.
        candidates=tree.find_nearest_range(p,max(distance+1e-5,1e-5))
        compatible=[row for row in candidates if triangles[row[2]].normal.dot(faceNormals[loop.index])>.65]
        if compatible:hit,normal,index,distance=min(compatible,key=lambda row:row[3])
        triangle=triangles[index]
        a,b,c=[original.vertices[i].co for i in triangle.vertices];na,nb,nc=[original.corner_normals[i].vector for i in triangle.loops]
        normals.append(tuple(barycentric_transform(hit,a,b,c,na,nb,nc).normalized()))
    mesh.normals_split_custom_set(normals)
def WheelBoreClear(obj,tree):
    if not obj.name.startswith(('Game_WheelRim_','Game_WheelHub_')):return True
    side=-1 if 'Left' in obj.name else 1;label='Left' if side<0 else 'Right';inv=obj.matrix_world.inverted();pivot=bpy.data.objects['Pivot_Wheel'+label];direction=(inv.to_3x3()@pivot.matrix_world.to_3x3()@Vector((side,0,0))).normalized()
    for i in range(12):
        a=2*math.pi*i/12;start=inv@(pivot.matrix_world@Vector((side*(.85-1.125),.0235*math.cos(a),.0235*math.sin(a))))
        if tree.ray_cast(start,direction,.41)[0] is not None:return False
    return True

gray=bpy.data.materials.new('Material_MainGearGrayStudy');gray.use_nodes=True
bs=gray.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.43,.43,.43,1);bs.inputs['Roughness'].default_value=.72
copies=[];rows=[]
try:
    for item in record['newParts']:
        original=bpy.data.objects[item['name']];obj=original.copy();obj.data=original.data.copy();obj.name='Game_'+original.name;bpy.context.scene.collection.objects.link(obj);copies.append(obj)
        reference=Tree(original.data);samples=Samples(original.data);originalTopology=Topology(original.data)
        reducible=original.name.startswith(('Oleo_CoilSpring','Oleo_ConnectorHousing','Oleo_InnerGuide','Oleo_ExternalTube','Oleo_UpperSpringSeat','Oleo_LowerSpringSeat','WheelRim_','WheelHub_'))
        ratios=[.08,.12,.18,.25,.35,.5,.7,.85,1.] if reducible else [1.]
        attempts=[];selected=None
        for ratio in ratios:
            if ratio==1.:candidate=original.data.copy()
            else:
                modifier=obj.modifiers.new('OleoGameSurfaceReduction','DECIMATE');modifier.ratio=ratio;modifier.use_collapse_triangulate=True
                candidate=bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()));obj.modifiers.remove(modifier)
            candidateTree=Tree(candidate);error=max([reference.find_nearest(p)[3] or 0 for p in Samples(candidate)]+[candidateTree.find_nearest(p)[3] or 0 for p in samples])
            topology=Topology(candidate);clear=WheelBoreClear(obj,candidateTree)
            attempt={'ratio':ratio,'triangles':sum(len(p.vertices)-2 for p in candidate.polygons),'maxSampledSurfaceErrorM':error,'topology':list(topology),'wheelBoreProbeClear':clear};attempts.append(attempt)
            if error<=.002 and topology==originalTopology and clear:selected=candidate;break
            bpy.data.meshes.remove(candidate)
        assert selected is not None,original.name
        obj.data=selected
        if attempts[-1]['ratio']!=1.:NormalField(original.data,selected)
        obj.data.materials.clear();obj.data.materials.append(gray)
        obj['sourceDeltaPart']=original.name;obj['sourceParentName']=original.parent.name
        rows.append({'name':original.name,'before':sum(len(p.vertices)-2 for p in original.data.polygons),'selected':attempts[-1],'attempts':attempts})

    # Recover the existing measured three-ring descriptors from actual high
    # vertices. No body profile or rivet placement is regenerated or guessed.
    original=bpy.data.objects['Surface_FlushRivetHeads'];assert original['rivetCount']==1512 and original['ringSides']==8
    assert len(original.data.vertices)==1512*24
    descriptors=[]
    for index in range(1512):
        points=[original.data.vertices[index*24+i].co for i in range(24)]
        centers=[Vector(tuple(sum(float(points[ring*8+j][axis]) for j in range(8))/8 for axis in range(3))) for ring in range(3)]
        normal=(centers[2]-centers[0]).normalized();along=(points[0]-centers[0]).normalized();cross=normal.cross(along).normalized();point=centers[0]-normal*.00008
        descriptors.append((point,normal,along,cross))
    vertices=[];faces=[];uvs=[]
    for point,normal,along,cross in descriptors:
        base=len(vertices)
        for radius,height in [(.0028,.00008),(.0021,.00050),(.0006,.00068)]:
            for i in range(5):
                a=2*math.pi*i/5;vertices.append(point+normal*height+along*(radius*math.cos(a))+cross*(radius*math.sin(a)));uvs.append((.5+.48*math.cos(a),.5+.48*math.sin(a)))
        for ring in range(2):
            for i in range(5):j=(i+1)%5;faces.append((base+ring*5+i,base+ring*5+j,base+(ring+1)*5+j,base+(ring+1)*5+i))
        faces.append(tuple(base+10+i for i in range(5)))
    mesh=bpy.data.meshes.new('Mesh_FlushRivetGame5');mesh.from_pydata(vertices,[],faces);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap');ao=mesh.uv_layers.new(name='GeometryAO')
    for polygon in mesh.polygons:
        polygon.use_smooth=True
        for loop in polygon.loop_indices:
            index=mesh.loops[loop].vertex_index;uv.data[loop].uv=uvs[index];rivet=index//15;ao.data[loop].uv=((rivet%84+.5)/84,.05*(rivet//84+.5)/18)
    mesh.uv_layers.active_index=0;mesh.uv_layers[0].active_render=True
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
    reference=Tree(original.data);candidateTree=Tree(mesh)
    error=max([reference.find_nearest(v.co)[3] or 0 for v in mesh.vertices]+[candidateTree.find_nearest(v.co)[3] or 0 for v in original.data.vertices])
    assert error<.0008,('Rivet source surface gate retained',error)
    NormalField(original.data,mesh)
    for material in original.data.materials:mesh.materials.append(material)
    rivets=original.copy();rivets.data=mesh;rivets.name='Game_Surface_FlushRivetHeads';bpy.context.scene.collection.objects.link(rivets);copies.append(rivets)
    rivets['ringSides']=5;rivets['sourceDeltaPart']='Surface_FlushRivetHeads';rivets['sourceParentName']=original.parent.name
    rows.append({'name':'Surface_FlushRivetHeads','rivetCount':1512,'heightRings':3,'sourceSides':8,'baselineGameSides':6,'gameSides':5,'maxBidirectionalVertexSurfaceErrorM':error,'triangles':sum(len(p.vertices)-2 for p in mesh.polygons),'perHeadAoUvPreserved':True})
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for name in ['Pivot_WheelLeft','Pivot_WheelRight']:bpy.data.objects[name].select_set(True)
    for obj in copies:obj.select_set(True)
    bpy.context.view_layer.objects.active=root;out=asset/'Model_OleoGamePatch.glb'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,
                             export_texcoords=True,export_normals=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False)
finally:
    for obj in copies:
        data=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
        if data.users==0:bpy.data.meshes.remove(data)
    bpy.data.materials.remove(gray)
assert hashlib.sha256(author.read_bytes()).hexdigest()==record['sourceSha256']
result={'state':'ActualOleoGrayGameDerivatives_AuthorRetained','sourceSha256':record['sourceSha256'],'patchSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'parts':rows,'scope':'New nominal-free oleo/axle/wheel solids sampled within2mm with topology and axle-bore probes, source normal fields retained. All1512 rivets and3 height rings retained; game5-side heads remain under the original0.8mm high-source surface gate and use exact per-head AO sample UVs. No author save or full PBR/loading/fidelity approval.'}
for folder in [asset/'Evidence',source/'Evidence']:(folder/'Data_OleoGameDerivation.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'state':result['state'],'newParts':len(rows)-1,'oleoGameTriangles':sum(row['selected']['triangles'] for row in rows[:-1]),'rivetGameTriangles':rows[-1]['triangles'],'rivetSurfaceErrorM':error}))
