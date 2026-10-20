"""High-poly silhouette sculpt. Deliberately bypass all game reduction/baking."""
import bpy,runpy,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
repo=Path(bpy.context.scene['SichuanPackRepository']);project=repo/'Taierzhuang1938';review=repo/'tmp/SichuanBlanketPack/Review';source=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV7')
assert bpy.context.scene.get('BlenderMcpTask')=='SichuanBlanketPack'
for obj in list(bpy.context.scene.objects):
    if obj.name.startswith('StudyV7_'):bpy.data.objects.remove(obj,do_unlink=True)
code=(project/'_blender/Script_SichuanBlanketPackBake.py').read_text(encoding='utf-8')
code=code.replace('Script_SichuanSoftBundleV6.py','Script_SichuanHighSculptV7.py')
a=code.index('# The sculpt source also carries');b=code.index('# Keep only five independently',a);code=code[:a]+code[b:]
# Fit the ties in the deformed space before constructing their surfaces.
a=code.index('sideEnvelope=max(');b=code.index('# One hand-stitched patch',a)
code=code[:a]+"""sideEnvelope=max(abs(vertex.co.x) for vertex in bundle.data.vertices)
sideBins={}
for vertex in bundle.data.vertices:
    key=round(vertex.co.z/.001);sideBins[key]=max(sideBins.get(key,0),abs(vertex.co.x))
def SideSurfaceDepth(sign,yValue,zValue):
    key=round(zValue/.001);values=[sideBins[k] for k in range(key-2,key+3) if k in sideBins]
    return sign*((max(values) if values else .175)+.0015)

"""+code[b:]
code=code.replace('sideSurfaceDepth=SideSurfaceDepth)','sideSurfaceDepth=SideSurfaceDepth,pointMapper=soft[\'MapBinding\'],highDensity=True)')
exec(code[:code.index('# Persist the exact rebuild recipe')],globals())
sculpt=soft;tree=BVHTree.FromObject(bundle,bpy.context.evaluated_depsgraph_get())
# Sit the removable mat on the sculpt's actual crown.
mat=bpy.data.objects['Pack_StrawMat'];hit=tree.ray_cast(Vector((0,-.067,.4)),Vector((0,0,-1)),.5)
if hit[0] is not None:mat.location.z+=hit[0].z-.1495
bpy.context.view_layer.update()
for meshObj in mat.children_recursive:
    if meshObj.type!='MESH':continue
    bindingVertices=set()
    for polygon in meshObj.data.polygons:
        if meshObj.data.materials[polygon.material_index].get('AtlasRegion')=='binding':bindingVertices.update(polygon.vertices)
    inverse=meshObj.matrix_world.inverted()
    for index in bindingVertices:
        vertex=meshObj.data.vertices[index];point=meshObj.matrix_world@vertex.co
        if point.y<-.104:
            weight=max(0,min(1,(.18-point.z)/.043));mapped=sculpt['MapBinding'](point)
            point.x=point.x*(1-weight)+mapped.x*weight;point.z=point.z*(1-weight)+mapped.z*weight
            if weight>.90:
                contact=surfaceBvh.ray_cast(Vector((point.x,-.3,point.z)),Vector((0,1,0)),.4)
                if contact[0] is not None:point.y=contact[0].y-.0007
            vertex.co=inverse@point
# Keep the exposed coat corner below the new soft crown, rather than the
# previous rectangular boundary. The folded garment inside remains intact.
topBins={}
for vertex in bundle.data.vertices:
    key=round(vertex.co.x/.002);topBins[key]=max(topBins.get(key,-1),vertex.co.z)
for meshObj in jacketRoot.children_recursive:
    if meshObj.type!='MESH':continue
    for vertex in meshObj.data.vertices:
        point=vertex.co.copy()
        if point.x>.10 and point.y<-.105 and point.z>.075:
            mapped=sculpt['MapBinding'](point);key=round(mapped.x/.002)
            tops=[topBins[k] for k in range(key-1,key+2) if k in topBins]
            if tops:mapped.z=min(mapped.z,max(tops)-.003)
            old=surfaceBvh.ray_cast(Vector((point.x,-.3,point.z)),Vector((0,1,0)),.4)
            hit=surfaceBvh.ray_cast(Vector((mapped.x,-.3,mapped.z)),Vector((0,1,0)),.4)
            if hit[0] is not None:
                offset=max(.0015,min(.009,(old[0].y-point.y) if old[0] is not None else .003))
                mapped.y=hit[0].y-offset
            vertex.co=mapped
root=bpy.data.objects['Pack_Root'];root['Stage']='V7 unrestricted high sculpt';root['TriangleBudget']='Not applied during silhouette work'
counts={}
for name in ('Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals'):
    obj=bpy.data.objects[name];count=0
    for child in [obj,*obj.children_recursive]:
        if child.type=='MESH':child.data.calc_loop_triangles();count+=len(child.data.loop_triangles)
    counts[name]=count
for path in (project/'_blender/Script_SichuanHighSculptV7.py',project/'_blender/Script_SichuanHighStudyV7.py'):
    text=bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name);text.clear();text.write(path.read_text(encoding='utf-8-sig'))
for image in bpy.data.images:
    if image.users and image.source=='FILE' and not image.packed_file:image.pack()
scene=bpy.context.scene;scene['V6ReviewView']='three';scene['SichuanPackStage']='V7HighShapeUnapproved'
bpy.ops.wm.save_as_mainfile(filepath=str(source/'Scene_SichuanHighRestV7.blend'))
(review/'Data_V7HighSculpt.json').write_text(json.dumps({'counts':counts,'totalTriangles':sum(counts.values()),'blend':bpy.data.filepath,'completionProven':False,'stage':'high-poly shape study'},indent=2)+'\n')
bpy.ops.object.select_all(action='DESELECT')
for obj in [root,*root.children_recursive]:obj.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=str(review/'Model_SichuanHighV7.glb'),export_format='GLB',use_selection=True,export_yup=True)
print('V7_HIGH_SCULPT',json.dumps(counts))
