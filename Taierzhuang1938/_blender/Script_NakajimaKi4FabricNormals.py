"""Restore the evaluated high fabric normal field before game static merging.

Uses the established crease-aware world-space transfer. Position, both UV
layers and every image remain unchanged. The finished high author is read-only.
"""
import bpy,pathlib,os,json,hashlib,ast,math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
scriptPath=pathlib.Path(globals().get('__file__','Taierzhuang1938/_blender/Script_NakajimaKi4FabricNormals.py')).resolve()
source=pathlib.Path(os.environ.get('KI4_RELEASE_SOURCE_ROOT','C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/NakajimaKi4/ReferenceV48_GameRelease'))
asset=pathlib.Path(os.environ.get('KI4_RELEASE_ASSET_ROOT',str(scriptPath.parents[2]/'tmp/NakajimaKi4/ReferenceV48_GameRelease')))
helper=scriptPath.with_name('Script_NakajimaKi4Hinges.py');tree=ast.parse(helper.read_text(encoding='utf8'))
for name in ['CacheFabricSurfaceNormals','ProjectFabricSurfaceNormals']:
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name==name);exec(compile(ast.Module(body=[node],type_ignores=[]),str(helper),'exec'),globals())
Hash=lambda path:hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()
high=source/'Scene_NakajimaKi4.blend';highHash=Hash(high);bpy.ops.wm.open_mainfile(filepath=str(high))
root=bpy.data.objects['NakajimaKi4'];references={}
for obj in root.children_recursive:
    if obj.type=='MESH' and any(mat.name in ['Material_SilverDopedLinen','Material_DopedLinenTail']for mat in obj.data.materials):
        references[obj.name]=CacheFabricSurfaceNormals([obj])
assert len(references)==16
bpy.ops.wm.open_mainfile(filepath=str(source/'Game/Scene_NakajimaKi4Parts.blend'))
root=bpy.data.objects['NakajimaKi4'];rows=[]
for name,reference in references.items():
    obj=bpy.data.objects[name];mesh=obj.data
    before=[tuple(v.co)for v in mesh.vertices]
    uvBefore=[[tuple(value.uv)for value in layer.data]for layer in mesh.uv_layers]
    row=ProjectFabricSurfaceNormals(reference,obj);rows.append(row)
    assert before==[tuple(v.co)for v in mesh.vertices]
    assert uvBefore==[[tuple(value.uv)for value in layer.data]for layer in mesh.uv_layers]
root['fabricHighNormalFieldRepaired']=True
bpy.ops.wm.save_as_mainfile(filepath=str(source/'Game/Scene_NakajimaKi4Parts.blend'))
record={'state':'EvaluatedHighFabricFieldRestoredInSavedGameParts','highSourceSha256':highHash,
        'gamePartsSha256':Hash(bpy.data.filepath),'parts':rows,'geometryBothUvsAndImagesUnchanged':True}
for folder in [asset/'Evidence',source/'Evidence']:
    (folder/'Data_FabricNormalRepair.json').write_text(json.dumps(record,indent=2),encoding='utf8')
assert Hash(high)==highHash
result={'parts':len(rows),'corners':sum(r['corners']for r in rows),'maxProjectionDistanceM':max(r['maxProjectionDistanceM']for r in rows)}
print(json.dumps(result),flush=True)
