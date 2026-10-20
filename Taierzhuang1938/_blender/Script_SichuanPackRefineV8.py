"""Replace straw forms and unify age while preserving the V7 cloth geometry."""
import bpy,runpy,json,hashlib,array
from pathlib import Path

scene=bpy.context.scene
assert scene.get('BlenderMcpTask')=='SichuanBlanketPack'
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack')
assert Path(bpy.data.filepath).resolve().is_relative_to(base.resolve()),'This source does not belong to the pack task'
repo=Path(scene['SichuanPackRepository']);folder=repo/'Taierzhuang1938/_blender';atlas=repo/'Taierzhuang1938/Model/SichuanBlanketPack'
root=bpy.data.objects['Pack_Root']
def ClothHashes():
    result={}
    for name in ('Pack_Bundle','Pack_Binding','Pack_Jacket'):
        obj=bpy.data.objects[name]
        for child in (obj,*obj.children_recursive):
            if child.type!='MESH':continue
            positions=array.array('f',[0])*(len(child.data.vertices)*3);child.data.vertices.foreach_get('co',positions)
            result[child.name]=hashlib.sha256(positions.tobytes()).hexdigest()
    return result
before=ClothHashes()
def Template(role,name):
    original=bpy.data.materials.get(name)
    if original:return original
    return next((m for obj in root.children_recursive if obj.type=='MESH' for m in obj.data.materials
                 if m.get('AtlasRegion')==role and not m.get('NarrowTape',False) and 'NarrowCottonTape' not in m.name),None)
materials={'straw':Template('straw','Material_SichuanStraw'),'binding':Template('binding','Material_SichuanBinding')}
assert all(materials.values())
for name in ('Pack_StrawMat','Pack_Sandals'):
    old=bpy.data.objects.get(name)
    if old:
        for child in list(old.children_recursive):bpy.data.objects.remove(child,do_unlink=True)
        bpy.data.objects.remove(old,do_unlink=True)
for mesh in list(bpy.data.meshes):
    if mesh.users==0 and mesh.name.startswith(('Pack_','StudyV7_')):bpy.data.meshes.remove(mesh)
build=runpy.run_path(str(folder/'Script_SichuanStrawHighV8.py'))['BuildStrawHighV8']
mat,sandals=build(root,materials)
apply=runpy.run_path(str(folder/'Script_SichuanWornMaterialsV8.py'))['ApplyWornMaterials']
apply(root,atlas)
for old in list(bpy.data.materials):
    if old.users==0 and old.name.startswith(('Material_WornV08_','Material_V8StrawTone','Material_SichuanV8_')):bpy.data.materials.remove(old)
for old in list(bpy.data.images):
    if old.users==0 and 'SichuanWornFibersV08' in old.name:bpy.data.images.remove(old)
after=ClothHashes();assert before==after,'Cotton geometry must remain unchanged during V8 straw work'
root['Stage']='V8 straw form and coherent wear study';root['TriangleBudget']='Not applied during high refinement';root['UserFeedbackV8']='Material ages differ too much; mat roll and sandal forms still differ from approved reference'
scene['SichuanPackStage']='V8StrawAndWearReview';scene['HighV7View']='three'
source=base/'HighV8';source.mkdir(parents=True,exist_ok=True)
paths=list(folder.glob('Script_Sichuan*V8.py'))+[repo/'Taierzhuang1938/_import/Script_SichuanWornFibersV8.py']
for path in paths:
    text=bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name);text.clear();text.write(path.read_text(encoding='utf-8-sig'))
for image in bpy.data.images:
    if image.users and image.source=='FILE' and not image.packed_file:image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(source/'Scene_SichuanPackStrawWearV8.blend'))
report={'stage':'V8StrawAndWearReview','sourceBlend':bpy.data.filepath,'reference':'User-approved ThreeViewV02','bodyGeometryPreserved':before==after,'clothGeometryHashes':after,'strawParts':['True rolled sheet with open layered ends','Physical crossing grass strips','Heel-up open braided sandals','Braided rim, instep and heel cords'],'textures':{'generator':'Built-in imagegen','atlas':'Texture_SichuanWornFibersV08Base.png','resolution':[1024,1024],'technicalMaps':['Normal','Roughness']},'visualApproval':False,'gameAssetReplaced':False}
(repo/'tmp/SichuanBlanketPack/Review/Data_V8Refinement.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
(source/'Data_StrawWearV8.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('V8_SOURCE_SAVED',json.dumps({'source':bpy.data.filepath,'clothGeometryPreserved':before==after,'strawMeshes':len([o for r in (mat,sandals) for o in r.children_recursive if o.type=='MESH'])}))
