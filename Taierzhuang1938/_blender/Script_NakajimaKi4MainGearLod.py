"""Derive only the new main-gear parts; keep the saved author immutable."""
import bpy,bmesh,os,pathlib,json,hashlib,math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

source=pathlib.Path(os.environ['KI4_SOURCE_ROOT']).resolve()
asset=pathlib.Path(os.environ['KI4_ASSET_ROOT']).resolve()
update=json.loads((asset/'Evidence/Data_MainGearSourceUpdate.json').read_text())
author=source/'Scene_NakajimaKi4.blend'
assert pathlib.Path(bpy.data.filepath).resolve()==author
assert hashlib.sha256(author.read_bytes()).hexdigest()==update['sourceSha256']
root=bpy.data.objects['NakajimaKi4'];assert root['version']=='20261026ReferenceV28'
originals=[bpy.data.objects[row['name']] for row in update['new']]
originals.extend(sorted([obj for obj in root.children_recursive if obj.type=='MESH' and obj.name.startswith('TireMoldLine_')],key=lambda obj:obj.name))
assert len(originals)==18
hinge=Vector(update['construction']['records'][0]['hingeAxisBlender'])
cross=Vector((1,0,0));up=hinge.cross(cross).normalized()
points={row['side']:{'Fore':Vector(row['foreEyeBlenderM']),'Aft':Vector(row['aftEyeBlenderM'])} for row in update['construction']['records']}

def Tree(mesh):return BVHTree.FromPolygons([v.co for v in mesh.vertices],[list(p.vertices) for p in mesh.polygons])
def Quality(mesh):
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=3e-6)
    opened=sum(not edge.is_manifold for edge in bm.edges);unvisited=set(bm.verts);components=0
    while unvisited:
        components+=1;stack=[unvisited.pop()]
        while stack:
            vertex=stack.pop()
            for edge in vertex.link_edges:
                other=edge.other_vert(vertex)
                if other in unvisited:unvisited.remove(other);stack.append(other)
    bm.free();return opened,components

def BoresClear(name,tree):
    if 'BodyPin' in name or name.startswith('TireMoldLine_'):return True
    side='Left' if 'Left' in name else 'Right'
    names=['Fore','Aft'] if 'MainVFrame' in name else ['Fore' if 'Fore' in name else 'Aft']
    for key in names:
        center=points[side][key]
        for index in range(9):
            angle=2*math.pi*index/8
            offset=Vector((0,0,0)) if index==8 else (cross*math.cos(angle)+up*math.sin(angle))*.0104
            if tree.ray_cast(center+offset-hinge*.10,hinge,.20)[0] is not None:return False
    return True

copies=[];records=[]
gray=bpy.data.materials.new('Material_MainGearGrayStudy');gray.use_nodes=True
bs=gray.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.43,.43,.43,1);bs.inputs['Roughness'].default_value=.72
try:
    for original in originals:
        obj=original.copy();obj.data=original.data.copy();obj.name='Game_'+original.name
        bpy.context.scene.collection.objects.link(obj);copies.append(obj)
        before=sum(len(p.vertices)-2 for p in original.data.polygons);reference=Tree(original.data)
        assert BoresClear(original.name,reference),('The source bore must clear the actual pin',original.name)
        attempts=[];selected=None
        # Keep the complete new V assembly. Performance comes from the tiny
        # tire molding ridges, inside the unchanged main tire silhouette.
        ratios=[.08,.12,.18,.25,.28,.30,.32,.35,.5,.7,.85,1.] if original.name.startswith('TireMoldLine_') else [1.]
        for ratio in ratios:
            if ratio==1.:candidate=original.data.copy()
            else:
                mod=obj.modifiers.new('MainGearSurfaceReduction','DECIMATE');mod.ratio=ratio;mod.use_collapse_triangulate=True
                evaluated=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());candidate=bpy.data.meshes.new_from_object(evaluated);obj.modifiers.remove(mod)
            candidateTree=Tree(candidate)
            error=max([reference.find_nearest(v.co)[3] or 0 for v in candidate.vertices]+[candidateTree.find_nearest(v.co)[3] or 0 for v in original.data.vertices])
            opened,components=Quality(candidate);clear=BoresClear(original.name,candidateTree)
            triangles=sum(len(p.vertices)-2 for p in candidate.polygons)
            attempts.append({'ratio':ratio,'triangles':triangles,'maxBidirectionalVertexSurfaceErrorM':error,'nonManifoldEdges':opened,'components':components,'functionalBoresClear':clear})
            if error<=.002 and opened==0 and components==1 and clear:
                selected=candidate;break
            bpy.data.meshes.remove(candidate)
        assert selected is not None,original.name
        obj.data=selected
        if original.name.startswith('TireMoldLine_'):
            original.data.calc_loop_triangles();triangles=list(original.data.loop_triangles)
            normalTree=BVHTree.FromPolygons([v.co for v in original.data.vertices],[list(t.vertices) for t in triangles],all_triangles=True)
            loopNormals=[]
            for loop in selected.loops:
                p=selected.vertices[loop.vertex_index].co;hit,normal,index,distance=normalTree.find_nearest(p);triangle=triangles[index]
                a,b,c=[original.data.vertices[i].co for i in triangle.vertices]
                na,nb,nc=[original.data.corner_normals[i].vector for i in triangle.loops]
                loopNormals.append(tuple(barycentric_transform(hit,a,b,c,na,nb,nc).normalized()))
            selected.normals_split_custom_set(loopNormals)
            obj['sourceNormalFieldRetained']=True
        else:
            obj.data.materials.clear();obj.data.materials.append(gray)
        obj['sourceMainGearPart']=original.name;obj['mainGearGameDerivation']='2mm bidirectional vertex-to-surface maximum, closed connected solid and10.4mm radial bore probes; body pins retained'
        records.append({'name':original.name,'before':before,'after':sum(len(p.vertices)-2 for p in selected.polygons),'selected':attempts[-1],'attempts':attempts})
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
    for name in ['Pivot_WheelLeft','Pivot_WheelRight']:bpy.data.objects[name].select_set(True)
    for obj in copies:obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    out=asset/'Model_MainGearGamePatch.glb'
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,
                             export_extras=True,export_texcoords=True,export_normals=True,export_tangents=True,
                             export_animations=False,export_cameras=False,export_lights=False)
finally:
    for obj in copies:
        data=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
        if data.users==0:bpy.data.meshes.remove(data)
    bpy.data.materials.remove(gray)
assert hashlib.sha256(author.read_bytes()).hexdigest()==update['sourceSha256'],'Never save the transient derivation scene'
result={'state':'ActualMainGearGrayLodDerived_NewVAssemblyRetained_TireRidgesOnlyReduced','sourceSha256':update['sourceSha256'],'patchSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'patch':str(out),'sourceTriangles':sum(r['before'] for r in records),'gameTriangles':sum(r['after'] for r in records),'records':records,'scope':'All fourteen new V-leg/fitting/pin parts retained at full source geometry. Only four millimeter-scale tire molding ridges reduced within2mm bidirectional vertex-to-surface error; original smooth normal field transferred. Main tire surfaces, wheel positions and all other source/runtime geometry retained. Author never saved during derivation. Gray only; no new PBR/AO or complete-aircraft approval.'}
for folder in [asset/'Evidence',source/'Evidence']:(folder/'Data_MainGearGameDerivation.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'state':result['state'],'sourceTriangles':result['sourceTriangles'],'gameTriangles':result['gameTriangles'],'maxSurfaceErrorM':max(r['selected']['maxBidirectionalVertexSurfaceErrorM'] for r in records),'authorRetained':True}))
