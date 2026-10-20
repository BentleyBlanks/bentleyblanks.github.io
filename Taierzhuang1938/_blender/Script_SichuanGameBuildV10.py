"""Build the game copy from saved HighV10, leaving that original untouched."""
import bpy,json,runpy
from pathlib import Path

scene=bpy.context.scene
assert scene.get('BlenderMcpTask')=='SichuanBlanketPack'
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack')
highPath=(base/'HighV10/Scene_SichuanPackSoftWearV10.blend').resolve()
gamePath=(base/'GameV10/Scene_SichuanPackGameV10.blend').resolve()
assert Path(bpy.data.filepath).resolve() in (highPath,gamePath),'Open this task HighV10/GameV10 first'
assert Path(bpy.data.filepath).resolve()==highPath,'Reopen HighV10 in a separate completed MCP call before building'
repo=Path(scene['SichuanPackRepository']);folder=repo/'Taierzhuang1938/_blender'
out=repo/'tmp/SichuanBlanketPack/GameV10';out.mkdir(parents=True,exist_ok=True)
source=base/'GameV10';source.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(source/'Scene_SichuanPackGameV10.blend'))
high=bpy.data.objects['Pack_Root'];sourceParts={p.name:p for p in high.children}
for obj in (high,*high.children_recursive):
    obj['PackSourceName']=obj.name;obj.name='High_'+obj.name
game=bpy.data.objects.new('Pack_Root',None);scene.collection.objects.link(game)
game['TriangleLimit']=3000;game['SourceBlend']=str(base/'HighV10/Scene_SichuanPackSoftWearV10.blend')
parts={}
for name in ('Pack_Bundle','Pack_Binding','Pack_Jacket','Pack_StrawMat','Pack_Sandals'):
    part=bpy.data.objects.new(name,None);scene.collection.objects.link(part);part.parent=game
    part.matrix_world=sourceParts[name].matrix_world.copy();parts[name]=part
reports={}
for name,script,function,budget in (
    ('Pack_Bundle','Script_SichuanGameBodyV10.py','BuildLowBundle',1000),
    ('Pack_Binding','Script_SichuanGameBindingV10.py','BuildLowBinding',650),
    ('Pack_Jacket','Script_SichuanGameJacketV10.py','BuildLowJacket',320),
    ('Pack_StrawMat','Script_SichuanGameMatV10.py','BuildLowMat',430),
    ('Pack_Sandals','Script_SichuanGameSandalsV10.py','BuildLowSandals',650)):
    reports[name]=runpy.run_path(str(folder/script))[function](sourceParts[name],parts[name],budget)
    print('GAME_PART_BUILT',name,json.dumps(reports[name]),flush=True)
meshes=[obj for obj in game.children_recursive if obj.type=='MESH']
total=sum(sum(len(p.vertices)-2 for p in obj.data.polygons)for obj in meshes)
assert total<=3000,('Game all-parts budget',total)
for obj in scene.objects:
    if obj.type=='MESH' and obj not in meshes:obj.hide_render=True;obj.hide_set(True)
for obj in meshes:obj.hide_render=False;obj.hide_set(False)
scene['SichuanPackStage']='GameV10GeometryReview';scene['SichuanGameOutput']=str(out)
for path in folder.glob('Script_SichuanGame*V10.py'):
    text=bpy.data.texts.get(path.name)or bpy.data.texts.new(path.name);text.clear();text.write(path.read_text(encoding='utf-8-sig'))
bpy.ops.wm.save_mainfile()
report={'sourceHighBlend':game['SourceBlend'],'gameBlend':bpy.data.filepath,'parts':reports,'totalTriangles':total,'limit':3000,'allOptionalPartsIncluded':True,'pbrTransferComplete':False}
(out/'Data_GameGeometry.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('GAME_V10_GEOMETRY_SAVED',json.dumps(report))
