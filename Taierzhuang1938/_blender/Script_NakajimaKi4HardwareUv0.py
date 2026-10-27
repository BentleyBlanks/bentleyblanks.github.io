"""Project primary material UVs from the actual saved high author, no save.

The gray GLB is not a primary-UV authority. This stage reads original author
loopUVs and imports the actual game hardware patch for surface correspondence.
"""
import bpy,pathlib,os,json,hashlib,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']);asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']);author=source/'Scene_NakajimaKi4.blend';record=json.loads((asset/'Evidence/Data_HardwareHighAo.json').read_text())
assert hashlib.sha256(author.read_bytes()).hexdigest()==record['sourceSha256'];assert pathlib.Path(bpy.data.filepath).resolve()==author.resolve()
high={name:bpy.data.objects[name] for name in record['partNames']};before=set(bpy.data.objects);patch=asset/'Model_HardwareGamePatch.glb';oldPatchHash=hashlib.sha256(patch.read_bytes()).hexdigest()
bpy.ops.import_scene.gltf(filepath=str(patch));imported=[o for o in bpy.data.objects if o not in before];game={o.get('sourceDeltaPart'):o for o in imported if o.type=='MESH' and o.get('sourceDeltaPart') in high};assert set(game)==set(high)
bpy.context.view_layer.update();rows=[];highTriangles={};lowTriangles={};maxDistance=0.
for name,src in high.items():
    src.data.calc_loop_triangles();tris=list(src.data.loop_triangles);vertices=[src.matrix_world@v.co for v in src.data.vertices];bvh=BVHTree.FromPolygons(vertices,[list(t.vertices) for t in tris],all_triangles=True)
    def GltfPoint(p):return [p.x,p.z,-p.y]
    highTriangles[name]=[{'p':[GltfPoint(vertices[k]) for k in t.vertices],'uv':[[float(src.data.uv_layers[0].data[k].uv.x),1-float(src.data.uv_layers[0].data[k].uv.y)] for k in t.loops]} for t in tris]
    obj=game[name];mesh=obj.data;mesh.calc_loop_triangles();nm=obj.matrix_world.to_3x3().inverted().transposed();distances=[]
    for t in mesh.loop_triangles:
        normal=(nm@t.normal).normalized()
        for li,vi in zip(t.loops,t.vertices):
            point=obj.matrix_world@mesh.vertices[vi].co;nearest=bvh.find_nearest(point);assert nearest[0] is not None
            hit,n,index,distance=nearest;candidates=[r for r in bvh.find_nearest_range(point,max(distance+1e-5,1e-5)) if r[1].dot(normal)>.5]
            if candidates:hit,n,index,distance=min(candidates,key=lambda r:r[3])
            assert distance<=.0025,(name,distance);distances.append(distance);maxDistance=max(maxDistance,distance)
            st=tris[index];a,b,c=[vertices[k] for k in st.vertices];uv=[Vector((*src.data.uv_layers[0].data[k].uv,0)) for k in st.loops];projected=barycentric_transform(hit,a,b,c,*uv);mesh.uv_layers[0].data[li].uv=(projected.x,projected.y)
    mesh.uv_layers.active_index=0;mesh.uv_layers[0].active_render=True
    lowTriangles[name]=[{'p':[GltfPoint(obj.matrix_world@mesh.vertices[k].co) for k in t.vertices],'uv':[[float(mesh.uv_layers[0].data[k].uv.x),1-float(mesh.uv_layers[0].data[k].uv.y)] for k in t.loops]} for t in mesh.loop_triangles]
    rows.append({'name':name,'corners':len(distances),'maxSourceDistanceM':max(distances)})
# Source hierarchy stays untouched on disk. Rename only in this transient scene.
oldControls=[o for o in before if o.name=='NakajimaKi4' or o.name.startswith('Pivot_Wheel')]
for obj in oldControls:obj.name='TransientSource_'+obj.name
incomingRoot=next(o for o in imported if o.name.startswith('NakajimaKi4') and o.type=='EMPTY');incomingRoot.name='NakajimaKi4'
for obj in imported:
    if obj.type=='EMPTY' and obj.name.startswith('Pivot_Wheel'):obj.name=obj.name.split('.')[0]
incomingRoot['hardwarePrimaryUvScope']='Actual saved high-source UV0 projected to actual game surfaces. Gray patch UV convention is not reused. Original game normals are restored separately by scoped composition.'
bpy.ops.object.select_all(action='DESELECT')
for obj in imported:obj.select_set(True)
bpy.context.view_layer.objects.active=incomingRoot
bpy.ops.export_scene.gltf(filepath=str(patch),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,export_animations=False,export_cameras=False,export_lights=False)
proof={'state':'ActualSavedSourcePrimaryUv0Projected_TransientSceneNotSaved','sourceSha256':record['sourceSha256'],'inputPatchSha256':oldPatchHash,'patchSha256':hashlib.sha256(patch.read_bytes()).hexdigest(),'maxSourceDistanceM':maxDistance,'parts':rows,'highTriangles':highTriangles,'lowTriangles':lowTriangles,'scope':'Saved-source loopUV0, exact source/world triangles and emitted expected glTFUV0 captured. No blanket flip of gray UVs. Geometry/AO UV1 retained; full runtime corner/material consistency still requires independent verification.'}
for folder in [source/'Evidence',asset/'Evidence']:(folder/'Data_HardwarePrimaryUvProjection.json').write_text(json.dumps(proof),encoding='utf8')
lowRecord=json.loads((asset/'Evidence/Data_HardwareGameAo.json').read_text());lowRecord['patchBeforePrimaryUvProjectionSha256']=oldPatchHash;lowRecord['patchSha256']=proof['patchSha256'];lowRecord['primaryUv0Projection']='Data_HardwarePrimaryUvProjection.json'
for folder in [source/'Evidence',asset/'Evidence']:(folder/'Data_HardwareGameAo.json').write_text(json.dumps(lowRecord,indent=2),encoding='utf8')
assert hashlib.sha256(author.read_bytes()).hexdigest()==record['sourceSha256']
print(json.dumps({k:v for k,v in proof.items() if k not in ['highTriangles','lowTriangles','parts']}),flush=True)
